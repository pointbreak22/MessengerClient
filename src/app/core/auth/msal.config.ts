import { Configuration, LogLevel } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId: 'e3125d24-62d4-403d-94f8-7c4a78040a02',
    // ⚠️ Без /v2.0 на конце!
    authority: 'https://57a5831e-59a5-4fd7-941e-47ce69ea69d0.ciamlogin.com/57a5831e-59a5-4fd7-941e-47ce69ea69d0',
    knownAuthorities: ['57a5831e-59a5-4fd7-941e-47ce69ea69d0.ciamlogin.com'],

    redirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
    postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
  },
  cache: {
    cacheLocation: 'localStorage',
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message) => {
        if (level === LogLevel.Error) console.error(message);
        else if (level === LogLevel.Warning) console.warn(message);
      },
      logLevel: LogLevel.Warning,
      piiLoggingEnabled: true,
    },
  },
};

export const apiScope = 'api://e3125d24-62d4-403d-94f8-7c4a78040a02/access_as_user';
