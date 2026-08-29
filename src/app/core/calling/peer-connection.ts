// Diagnostics-only wiring shared by every RTCPeerConnection this app creates
// (1:1 and group calls) — helps tell "signaling/ICE never connects" apart
// from "connects fine but nothing plays" when a call is reported as broken.
// Check the browser console (and chrome://webrtc-internals) on both ends.
// Callers attach their own onicecandidate/ontrack/onconnectionstatechange on
// top of the returned connection.
export function createDiagnosticPeerConnection(iceServers: RTCIceServer[], logPrefix: string): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers });

  pc.onicecandidateerror = (event) => {
    const e = event as RTCPeerConnectionIceErrorEvent;
    console.warn(`[${logPrefix}] ICE candidate error`, e.errorCode, e.errorText, e.url);
  };
  pc.oniceconnectionstatechange = () => {
    console.debug(`[${logPrefix}] iceConnectionState ->`, pc.iceConnectionState);
  };

  return pc;
}

// Native connectionState is not a reliable failure signal on its own: a
// doomed connection (NAT traversal never succeeds, no usable candidate pair)
// can sit in 'new'/'connecting'/'checking' forever without the browser ever
// declaring 'failed' — that's what left a callee's screen stuck on
// "Connected" with no media indefinitely after a call that never actually
// connected. This watchdog imposes a deadline the browser doesn't: give up
// if 'connected' isn't reached within CONNECT_TIMEOUT_MS of being ARMED, or
// if a live connection drops to 'disconnected' and doesn't recover within
// DISCONNECT_GRACE_MS. Native 'failed'/'closed' fire onFailed immediately
// whether armed or not.
//
// Arming is explicit and deliberately separate from creation: an outgoing
// 1:1 call builds its RTCPeerConnection up front (it needs an offer to send)
// but then just RINGS, potentially for a minute, before the callee picks up.
// Starting the connect deadline at creation time would tear down a perfectly
// healthy call mid-ring — arm it only once negotiation is actually underway.
const CONNECT_TIMEOUT_MS = 20_000;
const DISCONNECT_GRACE_MS = 10_000;

export interface PeerConnectionWatchdog {
  // Start the "must reach connected" deadline. Safe to call more than once;
  // only the first call arms it. No-op once the connection is already up.
  arm(): void;
  cancel(): void;
}

export function watchPeerConnectionFailure(pc: RTCPeerConnection, onFailed: () => void): PeerConnectionWatchdog {
  let settled = false;
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fail = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    onFailed();
  };

  const onChange = () => {
    if (settled) return;
    const state = pc.connectionState;
    if (state === 'connected') {
      clearTimeout(timer);
      timer = undefined;
    } else if (state === 'failed' || state === 'closed') {
      fail();
    } else if (state === 'disconnected') {
      clearTimeout(timer);
      timer = setTimeout(fail, DISCONNECT_GRACE_MS);
    }
  };

  pc.addEventListener('connectionstatechange', onChange);

  return {
    arm: () => {
      if (settled || armed) return;
      armed = true;
      if (pc.connectionState === 'connected') return;
      clearTimeout(timer);
      timer = setTimeout(fail, CONNECT_TIMEOUT_MS);
    },
    cancel: () => {
      settled = true;
      clearTimeout(timer);
      pc.removeEventListener('connectionstatechange', onChange);
    },
  };
}
