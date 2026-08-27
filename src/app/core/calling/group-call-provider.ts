import { Signal } from '@angular/core';
import { UserProfile } from '../../interfaces/user-profile';

export type GroupCallProviderKind = 'mesh' | 'livekit' | 'jitsi' | 'janus';
export type GroupCallState = 'idle' | 'outgoing' | 'incoming' | 'connected';

export interface ParticipantState {
  userId: string;
  profile: UserProfile | null;
  stream: MediaStream | null;
  micMuted: boolean;
  cameraOff: boolean;
  speaking: boolean; // best-effort volume heuristic, not true VAD
}

// Shared contract GroupCallPicker/GroupCallOverlay code against — swapping
// the transport (mesh today; LiveKit/Jitsi/Janus later, see core/calling/*)
// is just a matter of implementing this, no UI changes required.
export interface GroupCallProvider {
  readonly kind: GroupCallProviderKind;
  readonly state: Signal<GroupCallState>;
  readonly chatId: Signal<string | null>;
  readonly callId: Signal<string | null>;
  readonly isVideo: Signal<boolean>;
  readonly participants: Signal<Record<string, ParticipantState>>;
  readonly localStream: Signal<MediaStream | null>;
  readonly localMicMuted: Signal<boolean>;
  readonly localCameraOff: Signal<boolean>;
  readonly errorMessage: Signal<string | null>;
  // Who invited me / whose call I'm about to join — populated while state() === 'incoming'.
  readonly incomingFromProfile: Signal<UserProfile | null>;
  // Who I invited — populated while state() === 'outgoing', for the ringing screen.
  readonly invitedProfiles: Signal<UserProfile[]>;

  start(chatId: string, participantIds: string[], isVideo: boolean): Promise<void>;
  acceptIncoming(): Promise<void>;
  declineIncoming(): void;
  join(callId: string, chatId: string, isVideo: boolean): Promise<void>;
  leave(): void;
  toggleMute(): void;
  toggleCamera(): void;
  // A failed start()/join() (permission denied, over the participant cap,
  // rejected by the server) sets errorMessage but leaves state at 'idle' —
  // the UI shows it as a dismissible toast rather than gating visibility on
  // call state, so it isn't silently swallowed. Call this to dismiss it.
  clearError(): void;
}
