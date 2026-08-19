import { MSAL_GUARD_CONFIG, MSAL_INSTANCE, MsalBroadcastService, MsalGuard, MsalGuardConfiguration, MsalService } from '@azure/msal-angular';
import { InteractionType, IPublicClientApplication, PublicClientApplication } from '@azure/msal-browser';
import { Provider } from '@angular/core';
import { apiScope, msalConfig } from './msal.config';

function msalInstanceFactory(): IPublicClientApplication {
  return new PublicClientApplication(msalConfig);
}

function msalGuardConfigFactory(): MsalGuardConfiguration {
  return {
    interactionType: InteractionType.Redirect,
    authRequest: { scopes: [apiScope] },
  };
}

// Registered in app.config.ts. Backed by the real Entra External ID (CIAM)
// App Registration values in msal.config.ts. REST auth headers are attached by our
// own apiAuthInterceptor (core/http/api-auth.interceptor.ts), not MsalInterceptor —
// see that file for why.
export const msalProviders: Provider[] = [
  { provide: MSAL_INSTANCE, useFactory: msalInstanceFactory },
  { provide: MSAL_GUARD_CONFIG, useFactory: msalGuardConfigFactory },
  MsalService,
  MsalGuard,
  MsalBroadcastService,
];
