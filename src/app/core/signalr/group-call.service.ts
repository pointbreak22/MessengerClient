import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { UserApiService } from '../../services/user-api.service';
import { playTones } from '../../shared/audio-tone';
import { GroupCallProvider, GroupCallState, ParticipantState } from '../calling/group-call-provider';
import {
  GroupAnswerReceivedEvent,
  GroupCallRosterEvent,
  GroupIceCandidateReceivedEvent,
  GroupOfferReceivedEvent,
  IncomingGroupCallEvent,
  ParticipantDeclinedEvent,
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  ParticipantMediaStateChangedEvent,
} from '../../interfaces/group-call-events';
import { UserProfile } from '../../interfaces/user-profile';
import { ChatHubService } from './chat-hub.service';

// Matches CallsController's default — the picker should really read the real
// limit from GET /calls/providers, this is just the last-resort local guard.
const MESH_MAX_PARTICIPANTS = 8;

// Mesh WebRTC: every participant connects directly to every other one, same
// "server only relays SDP/ICE" principle as the 1:1 CallService, just with a
// PeerConnection per remote participant instead of one. No SFU exists in this
// infra — see core/calling/group-call-provider.ts for the pluggable interface
// this implements, so LiveKit/Jitsi/Janus can slot in later without UI churn.
@Injectable({ providedIn: 'root' })
export class GroupCallService implements GroupCallProvider {
  readonly kind = 'mesh' as const;

  private readonly hub = inject(ChatHubService);
  private readonly userApi = inject(UserApiService);
  private readonly auth = inject(AuthService);

  private localStreamRaw: MediaStream | null = null;
  private readonly peers = new Map<string, RTCPeerConnection>();
  private readonly pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private readonly speakingAnalysers = new Map<string, { ctx: AudioContext; interval: ReturnType<typeof setInterval> }>();
  private pendingInvite: IncomingGroupCallEvent | null = null;
  private ringTimer?: ReturnType<typeof setInterval>;

  private readonly _state = signal<GroupCallState>('idle');
  private readonly _chatId = signal<string | null>(null);
  private readonly _callId = signal<string | null>(null);
  private readonly _isVideo = signal(false);
  private readonly _participants = signal<Record<string, ParticipantState>>({});
  private readonly _localStream = signal<MediaStream | null>(null);
  private readonly _localMicMuted = signal(false);
  private readonly _localCameraOff = signal(false);
  private readonly _errorMessage = signal<string | null>(null);
  private readonly _incomingFromProfile = signal<UserProfile | null>(null);
  private readonly _invitedProfiles = signal<UserProfile[]>([]);

  readonly state = this._state.asReadonly();
  readonly chatId = this._chatId.asReadonly();
  readonly callId = this._callId.asReadonly();
  readonly isVideo = this._isVideo.asReadonly();
  readonly participants = this._participants.asReadonly();
  readonly localStream = this._localStream.asReadonly();
  readonly localMicMuted = this._localMicMuted.asReadonly();
  readonly localCameraOff = this._localCameraOff.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();
  readonly incomingFromProfile = this._incomingFromProfile.asReadonly();
  readonly invitedProfiles = this._invitedProfiles.asReadonly();

  constructor() {
    this.hub.on<IncomingGroupCallEvent>('IncomingGroupCall', (e) => this.handleIncomingGroupCall(e));
    this.hub.on<GroupCallRosterEvent>('GroupCallRoster', (e) => void this.handleRoster(e));
    this.hub.on<ParticipantJoinedEvent>('ParticipantJoined', (e) => this.handleParticipantJoined(e));
    this.hub.on<ParticipantLeftEvent>('ParticipantLeft', (e) => this.handleParticipantLeft(e));
    this.hub.on<ParticipantDeclinedEvent>('ParticipantDeclined', () => {});
    this.hub.on<GroupOfferReceivedEvent>('GroupOfferReceived', (e) => void this.handleGroupOffer(e));
    this.hub.on<GroupAnswerReceivedEvent>('GroupAnswerReceived', (e) => void this.handleGroupAnswer(e));
    this.hub.on<GroupIceCandidateReceivedEvent>('GroupIceCandidateReceived', (e) => void this.handleGroupIceCandidate(e));
    this.hub.on<ParticipantMediaStateChangedEvent>('ParticipantMediaStateChanged', (e) => this.handleMediaState(e));
  }

  async start(chatId: string, participantIds: string[], isVideo: boolean): Promise<void> {
    if (this._state() !== 'idle') return;
    if (participantIds.length + 1 > MESH_MAX_PARTICIPANTS) {
      this._errorMessage.set(`Mesh calls support up to ${MESH_MAX_PARTICIPANTS} participants.`);
      return;
    }

    this._errorMessage.set(null);
    this._chatId.set(chatId);
    this._isVideo.set(isVideo);
    this._state.set('outgoing');
    this.startRinging(isVideo);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
      this.localStreamRaw = stream;
      this._localStream.set(stream);

      const callId = await this.hub.invoke<string>('StartGroupCall', chatId, participantIds, isVideo);
      if (!callId) throw new Error('Group call rejected by server');
      this._callId.set(callId);
      this.stopRinging();
      this._state.set('connected');

      void Promise.all(participantIds.map((id) => firstValueFrom(this.userApi.getUserById(id)).catch(() => null))).then(
        (profiles) => this._invitedProfiles.set(profiles.filter((p): p is UserProfile => !!p)),
      );
      // Invitees reach us via JoinGroupCall -> ParticipantJoined -> they offer
      // to us (we're an "existing member" from their side) — nothing more to
      // do here proactively.
    } catch {
      this._errorMessage.set('Could not start the call — check camera/microphone permissions.');
      this.reset();
    }
  }

  async acceptIncoming(): Promise<void> {
    if (this._state() !== 'incoming' || !this.pendingInvite) return;
    const invite = this.pendingInvite;
    await this.doJoin(invite.callId, invite.chatId, invite.isVideo);
  }

  declineIncoming(): void {
    const invite = this.pendingInvite;
    if (invite) void this.hub.invoke('DeclineGroupCall', invite.callId);
    this.reset();
  }

  // Also the entry point for "join an ongoing call" (green icon) — not
  // preceded by an IncomingGroupCall invite.
  async join(callId: string, chatId: string, isVideo: boolean): Promise<void> {
    if (this._state() !== 'idle') return;
    await this.doJoin(callId, chatId, isVideo);
  }

  leave(): void {
    const callId = this._callId();
    if (callId) void this.hub.invoke('LeaveGroupCall', callId);
    this.reset();
  }

  toggleMute(): void {
    if (!this.localStreamRaw) return;
    const next = !this._localMicMuted();
    for (const track of this.localStreamRaw.getAudioTracks()) track.enabled = !next;
    this._localMicMuted.set(next);
    this.broadcastMediaState();
  }

  toggleCamera(): void {
    if (!this.localStreamRaw || !this._isVideo()) return;
    const next = !this._localCameraOff();
    for (const track of this.localStreamRaw.getVideoTracks()) track.enabled = !next;
    this._localCameraOff.set(next);
    this.broadcastMediaState();
  }

  clearError(): void {
    this._errorMessage.set(null);
  }

  private async doJoin(callId: string, chatId: string, isVideo: boolean): Promise<void> {
    this.stopRinging();
    this._errorMessage.set(null);
    this._chatId.set(chatId);
    this._callId.set(callId);
    this._isVideo.set(isVideo);
    this.pendingInvite = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
      this.localStreamRaw = stream;
      this._localStream.set(stream);
      this._state.set('connected');

      await this.hub.invoke('JoinGroupCall', callId, chatId, isVideo);
      // GroupCallRoster tells us who's already here — handleRoster() does
      // the actual per-peer offers once it arrives.
    } catch {
      this._errorMessage.set('Could not join the call — check camera/microphone permissions.');
      this.reset();
    }
  }

  private handleIncomingGroupCall(e: IncomingGroupCallEvent): void {
    if (this._state() !== 'idle') {
      void this.hub.invoke('DeclineGroupCall', e.callId);
      return;
    }
    this.pendingInvite = e;
    this._chatId.set(e.chatId);
    this._callId.set(e.callId);
    this._isVideo.set(e.isVideo);
    this._state.set('incoming');
    this.startRinging(e.isVideo);

    void firstValueFrom(this.userApi.getUserById(e.fromUserId))
      .then((profile) => this._incomingFromProfile.set(profile))
      .catch(() => this._incomingFromProfile.set(null));
  }

  private async handleRoster(e: GroupCallRosterEvent): Promise<void> {
    if (e.callId !== this._callId()) return;
    const myId = this.auth.currentUserProfile()?.id;
    for (const userId of e.participantIds) {
      if (userId === myId) continue;
      await this.connectToPeer(userId);
    }
  }

  private handleParticipantJoined(e: ParticipantJoinedEvent): void {
    if (e.callId !== this._callId()) return;
    // Give the grid an immediate placeholder tile (name resolved, no stream
    // yet) rather than waiting for the offer/answer exchange to finish.
    this.resolveProfile(e.userId);
  }

  private handleParticipantLeft(e: ParticipantLeftEvent): void {
    if (e.callId !== this._callId()) return;
    this.removeParticipant(e.userId);
  }

  private handleMediaState(e: ParticipantMediaStateChangedEvent): void {
    if (e.callId !== this._callId()) return;
    this.updateParticipant(e.userId, (p) => ({ ...p, micMuted: e.micMuted, cameraOff: e.cameraOff }));
  }

  private async handleGroupOffer(e: GroupOfferReceivedEvent): Promise<void> {
    if (e.callId !== this._callId()) return;
    this.resolveProfile(e.fromUserId);
    const pc = this.createPeerConnection(e.fromUserId);
    this.attachLocalTracks(pc);

    await pc.setRemoteDescription({ type: 'offer', sdp: e.sdp });
    await this.flushPendingIce(e.fromUserId, pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.hub.invoke('SendGroupAnswer', e.callId, e.fromUserId, answer.sdp);
  }

  private async handleGroupAnswer(e: GroupAnswerReceivedEvent): Promise<void> {
    if (e.callId !== this._callId()) return;
    const pc = this.peers.get(e.fromUserId);
    if (!pc) return;
    await pc.setRemoteDescription({ type: 'answer', sdp: e.sdp });
    await this.flushPendingIce(e.fromUserId, pc);
  }

  private async handleGroupIceCandidate(e: GroupIceCandidateReceivedEvent): Promise<void> {
    if (e.callId !== this._callId()) return;
    const candidate: RTCIceCandidateInit = {
      candidate: e.candidate,
      sdpMid: e.sdpMid ?? undefined,
      sdpMLineIndex: e.sdpMLineIndex ?? undefined,
    };
    const pc = this.peers.get(e.fromUserId);
    if (!pc?.remoteDescription) {
      const queue = this.pendingIce.get(e.fromUserId) ?? [];
      queue.push(candidate);
      this.pendingIce.set(e.fromUserId, queue);
      return;
    }
    await pc.addIceCandidate(candidate);
  }

  private async flushPendingIce(userId: string, pc: RTCPeerConnection): Promise<void> {
    const queue = this.pendingIce.get(userId) ?? [];
    this.pendingIce.delete(userId);
    for (const candidate of queue) await pc.addIceCandidate(candidate);
  }

  private async connectToPeer(remoteUserId: string): Promise<void> {
    this.resolveProfile(remoteUserId);
    const pc = this.createPeerConnection(remoteUserId);
    this.attachLocalTracks(pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const callId = this._callId();
    if (!callId) return;
    await this.hub.invoke('SendGroupOffer', callId, remoteUserId, offer.sdp);
  }

  private attachLocalTracks(pc: RTCPeerConnection): void {
    const stream = this.localStreamRaw;
    if (!stream) return;
    for (const track of stream.getTracks()) pc.addTrack(track, stream);
  }

  private createPeerConnection(remoteUserId: string): RTCPeerConnection {
    this.peers.get(remoteUserId)?.close();
    const pc = new RTCPeerConnection({ iceServers: environment.iceServers });

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const callId = this._callId();
      if (!callId) return;
      void this.hub.invoke(
        'SendGroupIceCandidate',
        callId,
        remoteUserId,
        event.candidate.candidate,
        event.candidate.sdpMid,
        event.candidate.sdpMLineIndex,
      );
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      this.updateParticipant(remoteUserId, (p) => ({ ...p, stream: stream ?? p.stream }));
      this.attachSpeakingAnalyser(remoteUserId, stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removeParticipant(remoteUserId);
      }
    };

    this.peers.set(remoteUserId, pc);
    return pc;
  }

  private resolveProfile(userId: string): void {
    void firstValueFrom(this.userApi.getUserById(userId))
      .then((profile) => this.updateParticipant(userId, (p) => ({ ...p, profile })))
      .catch(() => {});
  }

  private updateParticipant(userId: string, patch: (p: ParticipantState) => ParticipantState): void {
    this._participants.update((map) => {
      const existing = map[userId] ?? this.blankParticipant(userId);
      return { ...map, [userId]: patch(existing) };
    });
  }

  private blankParticipant(userId: string): ParticipantState {
    return { userId, profile: null, stream: null, micMuted: false, cameraOff: false, speaking: false };
  }

  private removeParticipant(userId: string): void {
    this.peers.get(userId)?.close();
    this.peers.delete(userId);
    this.pendingIce.delete(userId);
    this.stopSpeakingAnalyser(userId);
    this._participants.update((map) => {
      if (!(userId in map)) return map;
      const next = { ...map };
      delete next[userId];
      return next;
    });
  }

  private broadcastMediaState(): void {
    const callId = this._callId();
    if (!callId) return;
    void this.hub.invoke('SendGroupMediaState', callId, this._localMicMuted(), this._localCameraOff());
  }

  // Best-effort "who's talking" for the speaker-view layout — a volume
  // threshold over each remote stream's own AudioContext, not true VAD.
  private attachSpeakingAnalyser(userId: string, stream: MediaStream | undefined): void {
    if (!stream || stream.getAudioTracks().length === 0) return;
    this.stopSpeakingAnalyser(userId);
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const interval = setInterval(() => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
        const speaking = avg > 12;
        this.updateParticipant(userId, (p) => (p.speaking === speaking ? p : { ...p, speaking }));
      }, 300);

      this.speakingAnalysers.set(userId, { ctx, interval });
    } catch {
      // Best-effort — a missing speaking indicator isn't worth surfacing an error for.
    }
  }

  private stopSpeakingAnalyser(userId: string): void {
    const entry = this.speakingAnalysers.get(userId);
    if (!entry) return;
    clearInterval(entry.interval);
    void entry.ctx.close().catch(() => {});
    this.speakingAnalysers.delete(userId);
  }

  // Original synthesized rings (see audio-tone.ts) — same pattern as 1:1
  // CallService, reused here for consistency rather than re-derived.
  private startRinging(video: boolean): void {
    this.stopRinging();
    const ring = video ? GroupCallService.playVideoRingCycle : GroupCallService.playVoiceRingCycle;
    ring();
    this.ringTimer = setInterval(ring, video ? 2600 : 2000);
  }

  private stopRinging(): void {
    clearInterval(this.ringTimer);
    this.ringTimer = undefined;
  }

  private static playVoiceRingCycle(): void {
    playTones([
      { freq: 587, start: 0, duration: 0.18 },
      { freq: 587, start: 0.26, duration: 0.18 },
    ]);
  }

  private static playVideoRingCycle(): void {
    playTones([
      { freq: 523, start: 0, duration: 0.16 },
      { freq: 659, start: 0.18, duration: 0.16 },
      { freq: 784, start: 0.36, duration: 0.24 },
    ]);
  }

  private reset(): void {
    this.stopRinging();
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.pendingIce.clear();
    for (const userId of this.speakingAnalysers.keys()) this.stopSpeakingAnalyser(userId);
    for (const track of this.localStreamRaw?.getTracks() ?? []) track.stop();
    this.localStreamRaw = null;
    this.pendingInvite = null;

    this._participants.set({});
    this._localStream.set(null);
    this._localMicMuted.set(false);
    this._localCameraOff.set(false);
    this._isVideo.set(false);
    this._chatId.set(null);
    this._callId.set(null);
    this._incomingFromProfile.set(null);
    this._invitedProfiles.set([]);
    this._state.set('idle');
  }
}
