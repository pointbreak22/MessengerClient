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
