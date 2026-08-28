export const environment = {
  production: false,
  apiBaseUrl: 'https://localhost:5001/api',
  hubUrl: 'https://localhost:5001/chathub',
  // Several STUN hosts across different providers/domains — if one hostname
  // is DNS-blocked (ad/privacy blockers, some VPNs and corporate DNS filters
  // block *.google.com STUN specifically) the others still have a chance.
  // Still STUN-only: calls across most real-world networks generally need a
  // TURN relay too, or WebRTC negotiation fails ~10-20s after connecting.
  // Add one here once you have credentials, e.g.:
  // { urls: 'turn:your-turn-host:3478', username: '...', credential: '...' }
  iceServers: [
    // Google
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },

    // Cloudflare
    { urls: 'stun:stun.cloudflare.com:3478' },

    // Twilio
    { urls: 'stun:global.stun.twilio.com:3478' },

    // Mozilla (Firefox Infrastructure)
    { urls: 'stun:stun.services.mozilla.com:3478' },

    // Matrix.org & Nextcloud
    { urls: 'stun:stun.matrix.org:3478' },
    { urls: 'stun:stun.nextcloud.com:443' },

    // Open Source / VoIP Community
    { urls: 'stun:stun.sipgate.net:10000' },
    { urls: 'stun:stun.miwifi.com:3478' },
  ] as RTCIceServer[],
};
