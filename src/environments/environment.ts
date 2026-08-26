export const environment = {
  production: false,
  apiBaseUrl: 'https://localhost:5001/api',
  hubUrl: 'https://localhost:5001/chathub',
  // STUN alone only works when at least one peer has a directly reachable
  // (non-symmetric-NAT) address — calls across most real-world networks need
  // a TURN relay too, or WebRTC negotiation fails ~10-20s after connecting.
  // Add one here once you have credentials, e.g.:
  // { urls: 'turn:your-turn-host:3478', username: '...', credential: '...' }
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] as RTCIceServer[],
};
