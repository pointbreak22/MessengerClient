import { signal } from '@angular/core';
import { UserProfile } from '../../interfaces/user-profile';
import { GroupCallProvider, GroupCallProviderKind, GroupCallState, ParticipantState } from './group-call-provider';

// Placeholder for a transport that isn't wired up yet (LiveKit/Jitsi/Janus —
// see their respective services in this folder). Every action just reports
// "not configured" instead of doing anything; GET /calls/providers reports
// these as unavailable, so GroupCallPicker keeps them disabled and nothing
// ever actually calls into this. Once a provider gets real credentials,
// swap its service for a real GroupCallProvider implementation — nothing
// else needs to change, since GroupCallPicker/Overlay only depend on the
// shared interface.
export function createUnavailableProvider(kind: GroupCallProviderKind, label: string): GroupCallProvider {
  const errorMessage = signal<string | null>(null);
  const notConfigured = async (): Promise<void> => {
    errorMessage.set(`${label} isn't configured yet — add credentials in the backend settings.`);
  };

  return {
    kind,
    state: signal<GroupCallState>('idle').asReadonly(),
    chatId: signal<string | null>(null).asReadonly(),
    callId: signal<string | null>(null).asReadonly(),
    isVideo: signal(false).asReadonly(),
    participants: signal<Record<string, ParticipantState>>({}).asReadonly(),
    localStream: signal<MediaStream | null>(null).asReadonly(),
    localMicMuted: signal(false).asReadonly(),
    localCameraOff: signal(false).asReadonly(),
    errorMessage: errorMessage.asReadonly(),
    incomingFromProfile: signal<UserProfile | null>(null).asReadonly(),
    invitedProfiles: signal<UserProfile[]>([]).asReadonly(),
    start: notConfigured,
    acceptIncoming: notConfigured,
    declineIncoming: () => {},
    join: notConfigured,
    leave: () => {},
    toggleMute: () => {},
    toggleCamera: () => {},
    clearError: () => errorMessage.set(null),
  };
}
