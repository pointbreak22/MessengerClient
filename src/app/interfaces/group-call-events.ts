// /chathub group-call contract — additive to call-events.ts, mesh WebRTC for
// N participants. Server only relays SDP/ICE + room membership, same as 1:1.

// Client -> server (hub.invoke)
// StartGroupCall(chatId: string, participantUserIds: string[], isVideo: bool)
// JoinGroupCall(callId: string, chatId: string, isVideo: bool) — accept an invite, or join an ongoing call
// LeaveGroupCall(callId: string)
// DeclineGroupCall(callId: string)
// SendGroupOffer(callId: string, targetUserId: string, sdp: string)
// SendGroupAnswer(callId: string, targetUserId: string, sdp: string)
// SendGroupIceCandidate(callId: string, targetUserId: string, candidate: string, sdpMid: string | null, sdpMLineIndex: number | null)
// SendGroupMediaState(callId: string, micMuted: bool, cameraOff: bool)

// Server -> client (hub.on)
export interface IncomingGroupCallEvent {
  callId: string;
  chatId: string;
  fromUserId: string;
  isVideo: boolean;
}

// Reply to JoinGroupCall — who's already in the room. The joiner initiates
// an offer to each of these, so nobody double-offers the same peer.
export interface GroupCallRosterEvent {
  callId: string;
  chatId: string;
  isVideo: boolean;
  participantIds: string[];
}

export interface ParticipantJoinedEvent {
  callId: string;
  userId: string;
}

export interface ParticipantLeftEvent {
  callId: string;
  userId: string;
}

export interface ParticipantDeclinedEvent {
  callId: string;
  userId: string;
}

export interface GroupOfferReceivedEvent {
  callId: string;
  fromUserId: string;
  sdp: string;
}

export interface GroupAnswerReceivedEvent {
  callId: string;
  fromUserId: string;
  sdp: string;
}

export interface GroupIceCandidateReceivedEvent {
  callId: string;
  fromUserId: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface ParticipantMediaStateChangedEvent {
  callId: string;
  userId: string;
  micMuted: boolean;
  cameraOff: boolean;
}

// Presence fan-out (unscoped, same convention as UserWentOnline/UserWentOffline)
// — chatId/callId are null when the user isn't in any call right now.
export interface UserCallStateChangedEvent {
  userId: string;
  chatId: string | null;
  callId: string | null;
  isVideo: boolean;
}
