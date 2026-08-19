import { provideHttpClient, withInterceptors, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { MsalInterceptor, MsalService } from '@azure/msal-angular';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router'; // <-- Добавлен импорт
import { firstValueFrom } from 'rxjs';

import { msalProviders } from './core/auth/msal-providers';
import { authErrorInterceptor } from './core/http/auth-error.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withEnabledBlockingInitialNavigation() // <-- Обязательно для корректной работы MsalGuard
    ),
    provideHttpClient(withInterceptorsFromDi(), withInterceptors([authErrorInterceptor])),
    { provide: HTTP_INTERCEPTORS, useClass: MsalInterceptor, multi: true },
    ...msalProviders,
    provideAppInitializer(async () => {
      const msal = inject(MsalService);
      await msal.instance.initialize();
      await firstValueFrom(msal.handleRedirectObservable());
    }),
  ]
};
