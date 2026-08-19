import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  Injector,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  runInInjectionContext,
} from '@angular/core';
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
      const injector = inject(Injector);

      // Must fully complete before anything (including AuthService's field
      // initializer, which reads getActiveAccount()) touches msal.instance —
      // calling that first threw BrowserAuthError: uninitialized_public_client_application.
      await msal.instance.initialize();

      const result = await firstValueFrom(msal.handleRedirectObservable());
      if (result?.account) {
        msal.instance.setActiveAccount(result.account);
      } else if (msal.instance.getAllAccounts().length > 0) {
        msal.instance.setActiveAccount(msal.instance.getAllAccounts()[0]);
      }

      // inject() needs an active injection context, which normally only exists
      // synchronously before the first `await` — runInInjectionContext
      // re-establishes it here so AuthService can still be constructed (and
      // only now, with msal.instance fully initialized and the account set).
      const auth = runInInjectionContext(injector, () => inject(AuthService));
      await auth.initializeSession();
    }),
  ]
};
