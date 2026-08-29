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
// if 'connected' isn't reached within CONNECT_TIMEOUT_MS, or if a live
// connection drops to 'disconnected' and doesn't recover within
// DISCONNECT_GRACE_MS. Native 'failed'/'closed' still fire onFailed
// immediately, same as before.
const CONNECT_TIMEOUT_MS = 20_000;
const DISCONNECT_GRACE_MS = 10_000;

export function watchPeerConnectionFailure(pc: RTCPeerConnection, onFailed: () => void): () => void {
  let settled = false;
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
  timer = setTimeout(fail, CONNECT_TIMEOUT_MS);

  return () => {
    settled = true;
    clearTimeout(timer);
    pc.removeEventListener('connectionstatechange', onChange);
  };
}
