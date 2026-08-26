export const environment = {
  production: true,
  apiBaseUrl: 'https://messengerapi-gbf7dkcqfad3fpgk.canadacentral-01.azurewebsites.net/api',
  hubUrl: 'https://messengerapi-gbf7dkcqfad3fpgk.canadacentral-01.azurewebsites.net/chathub',
  // Several STUN hosts across different providers/domains — if one hostname
  // is DNS-blocked (ad/privacy blockers, some VPNs and corporate DNS filters
  // block *.google.com STUN specifically) the others still have a chance.
  // Still STUN-only: calls between peers on separate networks (the common
  // case) generally need a TURN relay too, or ICE negotiation fails a few
  // seconds after connecting. Add one here once you have credentials from a
  // TURN provider, e.g.:
  // { urls: 'turn:your-turn-host:3478', username: '...', credential: '...' }
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ] as RTCIceServer[],
};
