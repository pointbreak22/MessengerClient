import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  Injector,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  runInInjectionContext,
} from '@angular/core';
import { MsalService } from '@azure/msal-angular';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router'; // <-- Добавлен импорт
import { provideServiceWorker } from '@angular/service-worker';
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
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(async () => {
      const msal = inject(MsalService);
      const injector = inject(Injector);

      // Everything MSAL-related is wrapped: an app initializer that rejects
      // aborts bootstrap outright, and the user gets a permanently blank page
      // with no UI to recover from. handleRedirectObservable() in particular
      // throws on a half-finished redirect (state_mismatch,
      // interaction_in_progress after a closed tab, a stale hash in the URL),
      // which is exactly the "blank on first open, fine after F5" symptom —
      // the reload clears the hash, so the second attempt succeeds. Failing
      // soft instead leaves the app running and lands the visitor on the
      // public landing page, from which they can simply sign in again.
      try {
        // Must fully complete before anything (including AuthService's field
        // initializer, which reads getActiveAccount()) touches msal.instance —
        // calling that first threw BrowserAuthError: uninitialized_public_client_application.
        await msal.instance.initialize();

        const result = await firstValueFrom(msal.handleRedirectObservable());
        if (result?.account) {
          msal.instance.setActiveAccount(result.account);
        } else if (!msal.instance.getActiveAccount() && msal.instance.getAllAccounts().length > 0) {
          msal.instance.setActiveAccount(msal.instance.getAllAccounts()[0]);
        }
      } catch (err) {
        console.error('[auth] MSAL initialization failed, continuing unauthenticated', err);
      }

      // inject() needs an active injection context, which normally only exists
      // synchronously before the first `await` — runInInjectionContext
      // re-establishes it here so AuthService can still be constructed (and
      // only now, with msal.instance fully initialized and the account set).
      //
      // Deliberately NOT awaited. initializeSession() fetches GET /users/me,
      // and this backend cold-starts: awaiting an HTTP round trip here holds
      // the entire bootstrap — nothing renders until it answers, which is the
      // other half of the "blank page on first visit, fine on reload" report
      // (the second visit hits an already-warm backend). The profile arrives
      // through a signal, so the UI fills in on its own once it lands.
      const auth = runInInjectionContext(injector, () => inject(AuthService));
      void auth.initializeSession();
    }),
  ],
};
