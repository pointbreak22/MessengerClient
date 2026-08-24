// PROPOSED /chathub contract for WebRTC signaling — unlike hub-events.ts,
// none of this is backend-confirmed yet. The server's only job is to relay
// these to Clients.User(targetUserId); it never touches media, only SDP/ICE
// text. See the chat with the user for the full backend write-up.

// Client -> server (hub.invoke)
// CallUser(targetUserId: string, chatId: string, offerSdp: string, isVideo: bool)
// AnswerCall(targetUserId: string, answerSdp: string)
// SendIceCandidate(targetUserId: string, candidate: string, sdpMid: string | null, sdpMLineIndex: number | null)
// DeclineCall(targetUserId: string)
// EndCall(targetUserId: string)

// Server -> client (hub.on)
export interface IncomingCallEvent {
  fromUserId: string;
  chatId: string;
  offerSdp: string;
  isVideo: boolean;
}

export interface CallAnsweredEvent {
  fromUserId: string;
  answerSdp: string;
}

export interface IceCandidateEvent {
  fromUserId: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface CallEndedEvent {
  fromUserId: string;
}
