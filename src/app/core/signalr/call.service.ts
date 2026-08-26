import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserApiService } from '../../services/user-api.service';
import { UserProfile } from '../../interfaces/user-profile';
import {
  CallAnsweredEvent,
  CallEndedEvent,
  IceCandidateEvent,
  IncomingCallEvent,
} from '../../interfaces/call-events';
import { ChatHubService } from './chat-hub.service';

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connected';

// 1:1 calling only — a group call needs an SFU/media server, not just a
// signaling relay over SignalR, so it's out of scope here (see chat writeup).
@Injectable({ providedIn: 'root' })
export class CallService {
  private readonly hub = inject(ChatHubService);
  private readonly userApi = inject(UserApiService);

  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private pendingOffer: { fromUserId: string; chatId: string; sdp: string } | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  readonly state = signal<CallState>('idle');
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
    this.hub.on<CallEndedEvent>('CallDeclined', () => this.resetCall());
    this.hub.on<CallEndedEvent>('CallEnded', () => this.resetCall());

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

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
      this.localStream = stream;
      this.localMediaStream.set(stream);

      const pc = this.createPeerConnection(targetUserId);
      for (const track of stream.getTracks()) pc.addTrack(track, stream);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await this.hub.invoke('CallUser', targetUserId, chatId, offer.sdp, video);
    } catch {
      this.errorMessage.set('Could not start the call — check camera/microphone permissions.');
      this.resetCall();
    }
  }

  async acceptCall(): Promise<void> {
    if (this.state() !== 'incoming' || !this.pendingOffer) return;
    const { fromUserId, sdp } = this.pendingOffer;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: this.isVideo() });
      this.localStream = stream;
      this.localMediaStream.set(stream);

      const pc = this.createPeerConnection(fromUserId);
      for (const track of stream.getTracks()) pc.addTrack(track, stream);

      await pc.setRemoteDescription({ type: 'offer', sdp });
      await this.flushPendingIceCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await this.hub.invoke('AnswerCall', fromUserId, answer.sdp);
      this.state.set('connected');
    } catch {
      this.errorMessage.set('Could not answer the call — check camera/microphone permissions.');
      this.declineCall();
    }
  }

  declineCall(): void {
    const target = this.remoteUserId();
    if (target) void this.hub.invoke('DeclineCall', target);
    this.resetCall();
  }

  hangUp(): void {
    const target = this.remoteUserId();
    if (target) void this.hub.invoke('EndCall', target);
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

  private handleIncomingCall(e: IncomingCallEvent): void {
    if (this.state() !== 'idle') {
      void this.hub.invoke('DeclineCall', e.fromUserId);
      return;
    }
    this.pendingOffer = { fromUserId: e.fromUserId, chatId: e.chatId, sdp: e.offerSdp };
    this.remoteUserId.set(e.fromUserId);
    this.isVideo.set(e.isVideo);
    this.state.set('incoming');
  }

  private async handleCallAnswered(e: CallAnsweredEvent): Promise<void> {
    if (!this.peerConnection || this.state() !== 'outgoing') return;
    await this.peerConnection.setRemoteDescription({ type: 'answer', sdp: e.answerSdp });
    await this.flushPendingIceCandidates();
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

    pc.ontrack = (event) => {
      this.remoteMediaStream.set(event.streams[0] ?? null);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.resetCall();
      }
    };

    this.peerConnection = pc;
    return pc;
  }

  private resetCall(): void {
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
    this.state.set('idle');
  }
}
