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

    // Nextcloud
    // (stun.services.mozilla.com and stun.matrix.org used to be listed here
    // too — both are dead: they don't resolve at all any more, NXDOMAIN from
    // a plain OS-level lookup, so every call just burned ICE gathering time
    // on them before giving up.)
    { urls: 'stun:stun.nextcloud.com:443' },

    // Open Source / VoIP Community
    { urls: 'stun:stun.sipgate.net:10000' },
    { urls: 'stun:stun.miwifi.com:3478' },

    // Open Relay Project (metered.ca) public TURN. VERIFIED NOT WORKING as of
    // 2026-08-29: it answers, but every allocation is refused ("400 TURN
    // allocate error" in the ICE logs) — these shared public credentials are
    // dead/rate-limited. Left in place only because a refused TURN costs
    // nothing beyond a failed candidate; it is NOT a working fallback.
    // Calls currently succeed only when at least one peer is directly
    // reachable (see the "connected via ... -> host" diagnostic). Two peers
    // both behind strict NAT/CGNAT still have no path. Replace these with
    // real credentials (own metered.ca account, Cloudflare TURN, or a
    // self-hosted coturn) before relying on calls in production.
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ] as RTCIceServer[],
};
