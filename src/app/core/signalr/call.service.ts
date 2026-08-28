import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserApiService } from '../../services/user-api.service';
import { UserProfile } from '../../interfaces/user-profile';
import { playTones } from '../../shared/audio-tone';
import { getLocalMediaStream } from '../calling/media-devices';
import { SettingsStore } from '../../stores/settings.store';
import {
  CallAnsweredEvent,
  CallEndedEvent,
  IceCandidateEvent,
  IncomingCallEvent,
  IncomingCallResolvedEvent,
} from '../../interfaces/call-events';
import { ChatHubService } from './chat-hub.service';

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connected';

const VOICE_RING_INTERVAL_MS = 2000;
const VIDEO_RING_INTERVAL_MS = 2600;

// 1:1 calling only — a group call needs an SFU/media server, not just a
// signaling relay over SignalR, so it's out of scope here (see chat writeup).
@Injectable({ providedIn: 'root' })
export class CallService {
  private readonly hub = inject(ChatHubService);
  private readonly userApi = inject(UserApiService);
  private readonly settings = inject(SettingsStore);

  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private pendingOffer: { fromUserId: string; chatId: string; sdp: string } | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private ringTimer?: ReturnType<typeof setInterval>;

  readonly state = signal<CallState>('idle');
  // Registered with IActiveCallService server-side as soon as it's known
  // (returned by CallUser, or carried on the incoming invite) — this is what
  // lets 1:1 calls show up in the same busy/presence badges as group calls.
  readonly callId = signal<string | null>(null);
  readonly isVideo = signal(false);
  readonly remoteUserId = signal<string | null>(null);
  readonly remoteProfile = signal<UserProfile | null>(null);
  readonly localMediaStream = signal<MediaStream | null>(null);
  readonly remoteMediaStream = signal<MediaStream | null>(null);
  readonly muted = signal(false);
  readonly cameraOff = signal(false);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.hub.on<IncomingCallEvent>('IncomingCall', (e) => this.handleIncomingCall(e));
    this.hub.on<CallAnsweredEvent>('CallAnswered', (e) => void this.handleCallAnswered(e));
    this.hub.on<IceCandidateEvent>('IceCandidateReceived', (e) => void this.handleRemoteIceCandidate(e));
    this.hub.on<CallEndedEvent>('CallDeclined', () => {
      this.errorMessage.set('Call declined.');
      this.resetCall();
    });
    this.hub.on<CallEndedEvent>('CallEnded', () => this.resetCall());
    // Another of my own tabs/devices answered or declined this same invite —
    // stop ringing here too, without notifying the caller a second time.
    this.hub.on<IncomingCallResolvedEvent>('IncomingCallResolved', (e) => {
      if (this.state() === 'incoming' && this.callId() === e.callId) this.resetCall();
    });

    effect(() => {
      const id = this.remoteUserId();
      if (!id) {
        this.remoteProfile.set(null);
        return;
      }
      void firstValueFrom(this.userApi.getUserById(id))
        .then((profile) => this.remoteProfile.set(profile))
        .catch(() => this.remoteProfile.set(null));
    });
  }

  async startCall(targetUserId: string, chatId: string, video: boolean): Promise<void> {
    if (this.state() !== 'idle') return;
    this.errorMessage.set(null);
    this.remoteUserId.set(targetUserId);
    this.isVideo.set(video);
    this.state.set('outgoing');
    this.startRinging(video);

    try {
      const { stream, videoFallback } = await getLocalMediaStream(video, this.settings);
      console.debug('[call] local tracks (caller)', stream.getTracks().map((t) => `${t.kind}:${t.enabled}`));
      this.localStream = stream;
      this.localMediaStream.set(stream);
      if (videoFallback) {
        this.isVideo.set(false);
        this.errorMessage.set('Camera unavailable — joined with audio only.');
      }

      const pc = this.createPeerConnection(targetUserId);
      for (const track of stream.getTracks()) pc.addTrack(track, stream);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const callId = await this.hub.invoke<string>('CallUser', targetUserId, chatId, offer.sdp, this.isVideo());
      if (!callId) throw new Error('Call rejected by server');
      this.callId.set(callId);
    } catch {
      this.errorMessage.set('Could not start the call — check camera/microphone permissions.');
      this.resetCall();
    }
  }

  async acceptCall(): Promise<void> {
    if (this.state() !== 'incoming' || !this.pendingOffer) return;
    const { fromUserId, sdp } = this.pendingOffer;

    try {
      const { stream, videoFallback } = await getLocalMediaStream(this.isVideo(), this.settings);
      console.debug('[call] local tracks (callee)', stream.getTracks().map((t) => `${t.kind}:${t.enabled}`));
      this.localStream = stream;
      this.localMediaStream.set(stream);
      if (videoFallback) {
        this.isVideo.set(false);
        this.errorMessage.set('Camera unavailable — joined with audio only.');
      }

      const pc = this.createPeerConnection(fromUserId);
      for (const track of stream.getTracks()) pc.addTrack(track, stream);

      await pc.setRemoteDescription({ type: 'offer', sdp });
      await this.flushPendingIceCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await this.hub.invoke('AnswerCall', fromUserId, this.callId(), answer.sdp);
      this.stopRinging();
      this.state.set('connected');
    } catch {
      this.errorMessage.set('Could not answer the call — check camera/microphone permissions.');
      this.declineCall();
    }
  }

  declineCall(): void {
    const target = this.remoteUserId();
    const callId = this.callId();
    if (target && callId) void this.hub.invoke('DeclineCall', target, callId);
    this.resetCall();
  }

  clearError(): void {
    this.errorMessage.set(null);
  }

  hangUp(): void {
    const target = this.remoteUserId();
    // callId lets the server tell an unanswered outgoing call (→ "Missed
    // call" in chat history) apart from hanging up a connected one.
    if (target) void this.hub.invoke('EndCall', target, this.callId());
    this.resetCall();
  }

  toggleMute(): void {
    if (!this.localStream) return;
    const next = !this.muted();
    for (const track of this.localStream.getAudioTracks()) track.enabled = !next;
    this.muted.set(next);
  }

  toggleCamera(): void {
    if (!this.localStream || !this.isVideo()) return;
    const next = !this.cameraOff();
    for (const track of this.localStream.getVideoTracks()) track.enabled = !next;
    this.cameraOff.set(next);
  }

  // Live device swap mid-call — replaces the track on the existing peer
  // connection (renegotiation-free) instead of tearing down and restarting
  // the whole call. Saves the choice as the new default via SettingsStore.
  async switchCamera(deviceId: string): Promise<void> {
    this.settings.setPreferredCameraId(deviceId);
    if (this.state() !== 'connected' || !this.isVideo() || !this.localStream) return;
    await this.replaceTrack('video', { deviceId: { exact: deviceId } });
  }

  async switchMic(deviceId: string): Promise<void> {
    this.settings.setPreferredMicId(deviceId);
    if (this.state() !== 'connected' || !this.localStream) return;
    await this.replaceTrack('audio', { deviceId: { exact: deviceId } });
  }

  private async replaceTrack(kind: 'audio' | 'video', constraint: MediaTrackConstraints): Promise<void> {
    if (!this.localStream || !this.peerConnection) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'video' ? { video: constraint } : { audio: constraint },
      );
      const [newTrack] = kind === 'video' ? stream.getVideoTracks() : stream.getAudioTracks();
      if (!newTrack) return;

      const sender = this.peerConnection.getSenders().find((s) => s.track?.kind === kind);
      await sender?.replaceTrack(newTrack);

      const oldTracks = kind === 'video' ? this.localStream.getVideoTracks() : this.localStream.getAudioTracks();
      for (const t of oldTracks) {
        t.stop();
        this.localStream.removeTrack(t);
      }
      this.localStream.addTrack(newTrack);
      // Same MediaStream instance mutated in place — re-set so the <video>/
      // <audio> element's bound signal actually re-renders with the new track.
      this.localMediaStream.set(this.localStream);
    } catch {
      this.errorMessage.set(`Could not switch ${kind === 'video' ? 'camera' : 'microphone'}.`);
    }
  }

  private handleIncomingCall(e: IncomingCallEvent): void {
    if (this.state() !== 'idle') {
      void this.hub.invoke('DeclineCall', e.fromUserId, e.callId);
      return;
    }
    this.pendingOffer = { fromUserId: e.fromUserId, chatId: e.chatId, sdp: e.offerSdp };
    this.callId.set(e.callId);
    this.remoteUserId.set(e.fromUserId);
    this.isVideo.set(e.isVideo);
    this.state.set('incoming');
    this.startRinging(e.isVideo);
  }

  private async handleCallAnswered(e: CallAnsweredEvent): Promise<void> {
    if (!this.peerConnection || this.state() !== 'outgoing') return;
    await this.peerConnection.setRemoteDescription({ type: 'answer', sdp: e.answerSdp });
    await this.flushPendingIceCandidates();
    this.stopRinging();
    this.state.set('connected');
  }

  private async handleRemoteIceCandidate(e: IceCandidateEvent): Promise<void> {
    const candidate: RTCIceCandidateInit = {
      candidate: e.candidate,
      sdpMid: e.sdpMid ?? undefined,
      sdpMLineIndex: e.sdpMLineIndex ?? undefined,
    };
    if (!this.peerConnection?.remoteDescription) {
      this.pendingIceCandidates.push(candidate);
      return;
    }
    await this.peerConnection.addIceCandidate(candidate);
  }

  private async flushPendingIceCandidates(): Promise<void> {
    const queued = this.pendingIceCandidates;
    this.pendingIceCandidates = [];
    for (const candidate of queued) {
      await this.peerConnection?.addIceCandidate(candidate);
    }
  }

  private createPeerConnection(remoteUserId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: environment.iceServers });

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void this.hub.invoke(
        'SendIceCandidate',
        remoteUserId,
        event.candidate.candidate,
        event.candidate.sdpMid,
        event.candidate.sdpMLineIndex,
      );
    };

    // Diagnostics only — helps tell apart "signaling/ICE never connects" from
    // "connects fine but nothing plays" when a call is reported as broken.
    // Check the browser console (and chrome://webrtc-internals) on both ends.
    pc.onicecandidateerror = (event) => {
      const e = event as RTCPeerConnectionIceErrorEvent;
      console.warn('[call] ICE candidate error', e.errorCode, e.errorText, e.url);
    };
    pc.oniceconnectionstatechange = () => {
      console.debug('[call] iceConnectionState ->', pc.iceConnectionState);
    };

    pc.ontrack = (event) => {
      console.debug(
        '[call] ontrack',
        event.track.kind,
        'streams:',
        event.streams.length,
        'stream tracks:',
        event.streams[0]?.getTracks().map((t) => t.kind),
      );
      this.remoteMediaStream.set(event.streams[0] ?? null);
    };

    pc.onconnectionstatechange = () => {
      console.debug('[call] connectionState ->', pc.connectionState);
      if (pc.connectionState === 'failed') {
        this.errorMessage.set('Call connection lost.');
        this.resetCall();
      } else if (pc.connectionState === 'closed') {
        this.resetCall();
      }
    };

    this.peerConnection = pc;
    return pc;
  }

  // Original synthesized rings, not lifted from any app's actual sound
  // assets — a short melodic ascending pattern for video (Skype-ish feel), a
  // sharper double-beep for voice (Discord-ish feel), looped until answered.
  private startRinging(video: boolean): void {
    this.stopRinging();
    const ring = video ? CallService.playVideoRingCycle : CallService.playVoiceRingCycle;
    ring();
    this.ringTimer = setInterval(ring, video ? VIDEO_RING_INTERVAL_MS : VOICE_RING_INTERVAL_MS);
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

  private resetCall(): void {
    this.stopRinging();
    this.peerConnection?.close();
    this.peerConnection = null;
    for (const track of this.localStream?.getTracks() ?? []) track.stop();
    this.localStream = null;
    this.pendingOffer = null;
    this.pendingIceCandidates = [];
    this.localMediaStream.set(null);
    this.remoteMediaStream.set(null);
    this.remoteUserId.set(null);
    this.muted.set(false);
    this.cameraOff.set(false);
    this.isVideo.set(false);

    // Best-effort — regardless of why we're resetting (my own hangup, remote
    // decline/end, ICE failure), tell the server I'm done with this call so
    // I stop showing up as "busy" wherever presence badges render.
    const callId = this.callId();
    if (callId) void this.hub.invoke('LeaveCall', callId);
    this.callId.set(null);

    this.state.set('idle');
  }
}
