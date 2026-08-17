import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { MsalInterceptor, MsalService } from '@azure/msal-angular';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { msalProviders } from './core/auth/msal-providers';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: MsalInterceptor, multi: true },
    ...msalProviders,
    provideAppInitializer(async () => {
      const msal = inject(MsalService);
      await msal.instance.initialize();
      await firstValueFrom(msal.handleRedirectObservable());
    }),
  ]
};
