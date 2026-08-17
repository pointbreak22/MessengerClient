import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

// TODO: once real Azure AD App Registration values exist in
// core/auth/msal.config.ts, spread `msalProviders` (core/auth/msal-providers.ts)
// into this array and add MsalInterceptor via withInterceptorsFromDi()/
// HTTP_INTERCEPTORS, plus an APP_INITIALIZER that calls
// msalService.instance.initialize() + handleRedirectObservable().
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
  ]
};
