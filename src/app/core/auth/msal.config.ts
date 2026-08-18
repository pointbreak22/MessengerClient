import { Configuration, LogLevel } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId: 'e3125d24-62d4-403d-94f8-7c4a78040a02',
    authority: 'https://messengerpointbreak22.ciamlogin.com/',
    knownAuthorities: ['messengerpointbreak22.ciamlogin.com'],
    // Заменяем '/' на полный Origin (работает и на localhost, и на Azure Static Web Apps)
    redirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4200',
    postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4200',
  },
  cache: {
    cacheLocation: 'localStorage',
  },
  system: {
    // MsalGuard swallows every internal MSAL error into a bare `catchError(() => of(false))`
    // and only reports it through this logger — without a callback wired up, auth failures
    // (bad authority, network, config) fail the guard completely silently, no console output.
    loggerOptions: {
      loggerCallback: (level, message) => {
        if (level === LogLevel.Error) console.error(message);
        else if (level === LogLevel.Warning) console.warn(message);
      },
      logLevel: LogLevel.Warning,
    },
  },
};

export const apiScope = 'api://e3125d24-62d4-403d-94f8-7c4a78040a02/access_as_user';
