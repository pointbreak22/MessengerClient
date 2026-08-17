import { Configuration } from '@azure/msal-browser';

// TODO: replace with the real Azure AD B2C values (confirmed by the backend
// spec: "Authorization: Bearer <access_token_from_B2C>"). B2C's authority is
// NOT the standard login.microsoftonline.com/<tenant> form — it includes the
// user-flow/policy name, e.g.:
//   https://<tenant-name>.b2clogin.com/<tenant-name>.onmicrosoft.com/<policy-name>/v2.0
// and requires `knownAuthorities: ['<tenant-name>.b2clogin.com']` below.
// (Azure Portal -> Azure AD B2C -> App registrations -> this SPA's registration.)
export const msalConfig: Configuration = {
  auth: {
    clientId: 'TODO-spa-application-client-id',
    authority: 'https://TODO-tenant-name.b2clogin.com/TODO-tenant-name.onmicrosoft.com/TODO-policy-name/v2.0',
    knownAuthorities: ['TODO-tenant-name.b2clogin.com'],
    redirectUri: '/',
    postLogoutRedirectUri: '/',
  },
  cache: {
    cacheLocation: 'localStorage',
  },
};

// TODO: replace with the real exposed API scope for the .NET backend,
// e.g. 'https://<tenant-name>.onmicrosoft.com/<backend-api-name>/access_as_user'
// (B2C-exposed API scopes are full URLs, not the plain 'api://...' form).
export const apiScope = 'https://TODO-tenant-name.onmicrosoft.com/TODO-backend-api-name/access_as_user';
