// /chathub contract for 1:1 WebRTC signaling. Server only relays SDP/ICE —
// never touches media. callId is registered in IActiveCallService (same
// store group calls use) so 1:1 calls participate in the same busy/presence
// badges everywhere, not just group calls.

// Client -> server (hub.invoke)
// CallUser(targetUserId: string, chatId: string, offerSdp: string, isVideo: bool): string (callId)
// AnswerCall(targetUserId: string, callId: string, answerSdp: string)
// SendIceCandidate(targetUserId: string, candidate: string, sdpMid: string | null, sdpMLineIndex: number | null)
// DeclineCall(targetUserId: string, callId: string)
// EndCall(targetUserId: string)
// LeaveCall(callId: string) — best-effort presence cleanup, call whenever local state resets to idle

// Server -> client (hub.on)
export interface IncomingCallEvent {
  callId: string;
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

// Sent to every connection I have (all my open tabs/devices) when I answer
// or decline an incoming call from one of them — the rest should stop
// ringing for the same callId instead of sitting there indefinitely.
export interface IncomingCallResolvedEvent {
  callId: string;
}
