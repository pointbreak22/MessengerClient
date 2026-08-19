import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { MsalService } from '@azure/msal-angular';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router'; // <-- Добавлен импорт
import { firstValueFrom } from 'rxjs';

import { msalProviders } from './core/auth/msal-providers';
import { apiAuthInterceptor } from './core/http/api-auth.interceptor';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withEnabledBlockingInitialNavigation() // <-- Обязательно для корректной работы MsalGuard
    ),
    provideHttpClient(withInterceptors([apiAuthInterceptor])),
    ...msalProviders,
    provideAppInitializer(async () => {
      const msal = inject(MsalService);
      // AuthService must exist (and its constructor must fully return) before
      // any HTTP call happens, otherwise apiAuthInterceptor's inject(AuthService)
      // races the injector still resolving it — see initializeSession()'s comment.
      const auth = inject(AuthService);

      await msal.instance.initialize();

      const result = await firstValueFrom(msal.handleRedirectObservable());
      if (result?.account) {
        msal.instance.setActiveAccount(result.account);
      } else if (msal.instance.getAllAccounts().length > 0) {
        msal.instance.setActiveAccount(msal.instance.getAllAccounts()[0]);
      }

      await auth.initializeSession();
    }),
  ]
};
