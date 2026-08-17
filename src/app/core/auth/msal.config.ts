import { Configuration } from '@azure/msal-browser';

// Microsoft Entra External ID (CIAM) tenant "messengerpointbreak22" — the SPA
// App Registration created for this project (redirect URIs, "access_as_user"
// API permission with admin consent, and a linked "Sign up and sign in" user
// flow are all configured on that registration in the Entra admin center).
export const msalConfig: Configuration = {
  auth: {
    clientId: 'e3125d24-62d4-403d-94f8-7c4a78040a02',
    authority: 'https://messengerpointbreak22.ciamlogin.com/',
    knownAuthorities: ['messengerpointbreak22.ciamlogin.com'],
    redirectUri: '/',
    postLogoutRedirectUri: '/',
  },
  cache: {
    cacheLocation: 'localStorage',
  },
};

export const apiScope = 'api://e3125d24-62d4-403d-94f8-7c4a78040a02/access_as_user';
