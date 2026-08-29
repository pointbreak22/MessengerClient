import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserApiService } from '../../services/user-api.service';
import { UserProfile } from '../../interfaces/user-profile';
import { IceCandidateQueue } from '../calling/ice-candidate-queue';
import { getLocalMediaStream, setMediaTrackEnabled } from '../calling/media-devices';
import {
  PeerConnectionWatchdog,
  createDiagnosticPeerConnection,
  watchPeerConnectionFailure,
} from '../calling/peer-connection';
import { Ringer } from '../calling/ringer';
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

// 1:1 calling only — a group call needs an SFU/media server, not just a
// signaling relay over SignalR, so it's out of scope here (see chat writeup).
@Injectable({ providedIn: 'root' })
export class CallService {
  private readonly hub = inject(ChatHubService);
  private readonly userApi = inject(UserApiService);
  private readonly settings = inject(SettingsStore);

  private peerConnection: RTCPeerConnection | null = null;
  private watchdog: PeerConnectionWatchdog | null = null;
  private localStream: MediaStream | null = null;
  private pendingOffer: { fromUserId: string; chatId: string; sdp: string } | null = null;
  // Set while THIS device is in the middle of answering — see the
  // IncomingCallResolved handler for why that has to be distinguishable
  // from another of my devices having answered.
  private answeringCallId: string | null = null;
  private readonly pendingIceCandidates = new IceCandidateQueue();
  private readonly ringer = new Ringer();

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

  // ontrack fires once per track (audio, then video) but hands back the SAME
  // MediaStream instance every time, so re-setting remoteMediaStream doesn't
  // notify — signals compare by reference. Without this version counter the
  // UI would keep rendering whatever it decided when the first (audio) track
  // landed and never notice the video track arriving a moment later.
  private readonly remoteTrackVersion = signal(0);

  // Whether there's actually video to show, per side. Deliberately NOT
  // derived from isVideo(): that's "did *I* manage to open my camera", which
  // flips to false on a camera fallback and would then hide the other
  // person's video too.
  readonly remoteHasVideo = computed(() => {
    this.remoteTrackVersion();
    return (this.remoteMediaStream()?.getVideoTracks().length ?? 0) > 0;
  });
  readonly localHasVideo = computed(() => (this.localMediaStream()?.getVideoTracks().length ?? 0) > 0);

  constructor() {
    this.hub.on<IncomingCallEvent>('IncomingCall', (e) => this.handleIncomingCall(e));
    this.hub.on<CallAnsweredEvent>('CallAnswered', (e) => void this.handleCallAnswered(e));
    this.hub.on<IceCandidateEvent>('IceCandidateReceived', (e) => void this.handleRemoteIceCandidate(e));
    // Guarded against stale/duplicate delivery (e.g. replayed after a
    // SignalR auto-reconnect on a flaky connection) — without this, a late
    // CallDeclined/CallEnded for a call I've already moved on from (already
    // connected on a fresher attempt, or already reset) would spuriously
    // tear down whatever I'm actually doing now.
    // Both guards require a KNOWN local callId to reject on mismatch: an
    // outgoing call only learns its own callId when CallUser returns, and a
    // fast decline can land before that. Dropping it then would leave the
    // caller ringing forever (nothing else tears an unanswered call down —
    // the watchdog deliberately isn't armed while ringing).
    this.hub.on<CallEndedEvent>('CallDeclined', (e) => {
      if (e.callId && this.callId() && e.callId !== this.callId()) return;
      this.errorMessage.set('Call declined.');
      this.resetCall();
    });
    this.hub.on<CallEndedEvent>('CallEnded', (e) => {
      if (e.callId && this.callId() && e.callId !== this.callId()) return;
      this.resetCall();
    });
    // Another of my own tabs/devices answered or declined this same invite —
    // stop ringing here too, without notifying the caller a second time.
    // The server fans this out to ALL of my connections including the one
    // that just answered, and it can land while acceptCall() is still
    // awaiting its AnswerCall invocation (state therefore still 'incoming').
    // Without the answeringCallId check that would reset the very call this
    // device just picked up.
    this.hub.on<IncomingCallResolvedEvent>('IncomingCallResolved', (e) => {
      if (this.answeringCallId === e.callId) return;
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
    this.ringer.start(video);

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
    this.answeringCallId = this.callId();

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
      await this.pendingIceCandidates.flush(pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await this.hub.invoke('AnswerCall', fromUserId, this.callId(), answer.sdp);
      this.ringer.stop();
      this.state.set('connected');
      // Negotiation is done on this side — from here on, failing to reach a
      // live connection is a real failure rather than "still ringing".
      this.watchdog?.arm();
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
    this.endCallLocally();
  }

  // Local-side termination that also tells the other party — for any reason
  // *we* decide the call is over that they don't already know about (manual
  // hangup, or ICE giving up after connectivity failure). Deliberately not
  // folded into resetCall() itself: resetCall() also runs in REACTION to a
  // CallEnded/CallDeclined we just received *from* them, and re-sending
  // EndCall there would just bounce a notification back and forth.
  private endCallLocally(): void {
    const target = this.remoteUserId();
    const callId = this.callId();
    // callId lets the server tell an unanswered outgoing call (→ "Missed
    // call" in chat history) apart from hanging up a connected one.
    if (target) void this.hub.invoke('EndCall', target, callId);
    this.resetCall();
  }

  toggleMute(): void {
    if (!this.localStream) return;
    const next = !this.muted();
    setMediaTrackEnabled(this.localStream, 'audio', !next);
    this.muted.set(next);
  }

  toggleCamera(): void {
    if (!this.localStream || !this.isVideo()) return;
    const next = !this.cameraOff();
    setMediaTrackEnabled(this.localStream, 'video', !next);
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
      if (!newTrack) {
        // Nothing usable came back — release the device again instead of
        // leaving the freshly-opened camera/mic held by an orphaned stream.
        for (const t of stream.getTracks()) t.stop();
        return;
      }

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
    this.ringer.start(e.isVideo);
  }

  private async handleCallAnswered(e: CallAnsweredEvent): Promise<void> {
    if (!this.peerConnection || this.state() !== 'outgoing') return;
    try {
      await this.peerConnection.setRemoteDescription({ type: 'answer', sdp: e.answerSdp });
      await this.pendingIceCandidates.flush(this.peerConnection);
      this.ringer.stop();
      this.state.set('connected');
      // They picked up — the call is no longer "ringing", so start holding
      // the connection to the connect deadline.
      this.watchdog?.arm();
    } catch {
      this.errorMessage.set('Could not establish the call.');
      this.endCallLocally();
    }
  }

  private async handleRemoteIceCandidate(e: IceCandidateEvent): Promise<void> {
    const candidate: RTCIceCandidateInit = {
      candidate: e.candidate,
      sdpMid: e.sdpMid ?? undefined,
      sdpMLineIndex: e.sdpMLineIndex ?? undefined,
    };
    if (!this.peerConnection?.remoteDescription) {
      this.pendingIceCandidates.add(candidate);
      return;
    }
    // A stale/duplicate/otherwise-rejected candidate here is expected under
    // packet loss or a flaky signaling path — not worth surfacing as an
    // uncaught error, and definitely not worth doing anything else about.
    try {
      await this.peerConnection.addIceCandidate(candidate);
    } catch {
      /* best-effort */
    }
  }

  private createPeerConnection(remoteUserId: string): RTCPeerConnection {
    const pc = createDiagnosticPeerConnection(environment.iceServers, 'call');

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
      this.remoteTrackVersion.update((v) => v + 1);
    };

    // (connectionState logging lives in createDiagnosticPeerConnection now,
    // so 1:1 and group calls report it identically.)

    // Both the native 'failed'/'closed' case and the "never actually
    // connects, browser never says so" case must tell the other party
    // (endCallLocally, not a bare resetCall()) — otherwise only the side
    // that noticed the failure resets, and the other one is left stuck
    // showing a "connected"/"calling..." screen for a call that's actually
    // dead on both ends. Guarded on this.peerConnection === pc so a stale
    // watchdog from an already-replaced/reset connection can't fire late.
    // Only armed once the call is actually answered (see arm() call sites) —
    // an outgoing call may legitimately ring far longer than the connect
    // timeout before anyone picks up.
    this.watchdog = watchPeerConnectionFailure(pc, () => {
      if (this.peerConnection !== pc) return;
      this.errorMessage.set('Call connection lost.');
      this.endCallLocally();
    });

    this.peerConnection = pc;
    return pc;
  }

  private resetCall(): void {
    this.ringer.stop();
    // Cancel before close(): closing fires a 'closed' connectionstatechange
    // the watchdog would otherwise treat as a failure and bounce back into
    // endCallLocally() from inside the teardown we're already doing.
    this.watchdog?.cancel();
    this.watchdog = null;
    this.peerConnection?.close();
    this.peerConnection = null;
    for (const track of this.localStream?.getTracks() ?? []) track.stop();
    this.localStream = null;
    this.pendingOffer = null;
    this.answeringCallId = null;
    this.pendingIceCandidates.clear();
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
