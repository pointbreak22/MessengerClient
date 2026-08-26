export const environment = {
  production: true,
  apiBaseUrl: 'https://messengerapi-gbf7dkcqfad3fpgk.canadacentral-01.azurewebsites.net/api',
  hubUrl: 'https://messengerapi-gbf7dkcqfad3fpgk.canadacentral-01.azurewebsites.net/chathub',
  // STUN-only: calls between peers on separate networks (the common case)
  // need a TURN relay to survive NATs/firewalls that block direct P2P, or
  // ICE negotiation fails a few seconds after connecting. Add one here once
  // you have credentials from a TURN provider, e.g.:
  // { urls: 'turn:your-turn-host:3478', username: '...', credential: '...' }
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] as RTCIceServer[],
};
