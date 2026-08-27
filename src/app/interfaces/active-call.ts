// GET /calls/active — initial presence snapshot (who's in which call room
// right now), refined live afterward by UserCallStateChangedEvent.
export interface ActiveCallDto {
  userId: string;
  chatId: string;
  callId: string;
  isVideo: boolean;
}

// GET /calls/providers — which group-call transports are actually usable.
export interface GroupCallProvidersDto {
  mesh: { available: boolean; maxParticipants: number };
  liveKit: { available: boolean };
  jitsi: { available: boolean };
  janus: { available: boolean };
}
