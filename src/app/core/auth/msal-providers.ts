import {
  MSAL_GUARD_CONFIG,
  MSAL_INSTANCE,
  MSAL_INTERCEPTOR_CONFIG,
  MsalBroadcastService,
  MsalGuard,
  MsalGuardConfiguration,
  MsalInterceptorConfiguration,
  MsalService,
} from '@azure/msal-angular';
import { InteractionType, IPublicClientApplication, PublicClientApplication } from '@azure/msal-browser';
import { Provider } from '@angular/core';
import { environment } from '../../../environments/environment';
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

function msalInterceptorConfigFactory(): MsalInterceptorConfiguration {
  const protectedResourceMap = new Map<string, Array<string> | null>();

  const rawUrl = environment.apiBaseUrl.trim();
  const urlWithSlash = rawUrl.endsWith('/') ? rawUrl : `${rawUrl}/`;

  // strictMatching (default in @azure/msal-angular v6) anchors the pathname match
  // (^...$), so a bare "/api/" key only matches the literal path "/api/" — every
  // real endpoint like "/api/chats/me" was falling through unmatched, meaning the
  // interceptor decided no scopes applied and forwarded requests with no
  // Authorization header at all. The trailing "*" is required for prefix matching.
  protectedResourceMap.set(`${urlWithSlash}*`, [apiScope]);

  return {
    interactionType: InteractionType.Redirect,
    protectedResourceMap,
  };
}

// Registered in app.config.ts. Backed by the real Entra External ID (CIAM)
// App Registration values in msal.config.ts.
export const msalProviders: Provider[] = [
  { provide: MSAL_INSTANCE, useFactory: msalInstanceFactory },
  { provide: MSAL_GUARD_CONFIG, useFactory: msalGuardConfigFactory },
  { provide: MSAL_INTERCEPTOR_CONFIG, useFactory: msalInterceptorConfigFactory },
  MsalService,
  MsalGuard,
  MsalBroadcastService,
];
