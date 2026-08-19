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
  const urlWithoutSlash = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;

  // Скоупы указываются прямо здесь
  protectedResourceMap.set(urlWithSlash, [apiScope]);
  protectedResourceMap.set(urlWithoutSlash, [apiScope]);

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
