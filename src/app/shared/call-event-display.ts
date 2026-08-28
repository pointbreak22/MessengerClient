// "Missed call"/"Declined call" notices are persisted as ordinary Messages
// with a plain-text marker instead of a new DB column — reuses the existing
// send/outbox/NewMessage pipeline for free (see ChatHub.DeclineCall/EndCall).
// Parsed back out here so the raw "[call:...]" text is never actually shown.
export interface CallEventInfo {
  kind: 'missed' | 'declined';
  isVideo: boolean;
}

const CALL_EVENT_RE = /^\[call:(missed|declined):(audio|video)\]$/;

export function parseCallEvent(text: string | null): CallEventInfo | null {
  if (!text) return null;
  const match = CALL_EVENT_RE.exec(text.trim());
  if (!match) return null;
  return { kind: match[1] as 'missed' | 'declined', isVideo: match[2] === 'video' };
}

export function callEventLabel(info: CallEventInfo): string {
  const what = info.isVideo ? 'video call' : 'call';
  return info.kind === 'missed' ? `Missed ${what}` : `Declined ${what}`;
}
