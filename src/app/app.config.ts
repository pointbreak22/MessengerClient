import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { MsalService } from '@azure/msal-angular';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router'; // <-- Добавлен импорт
import { firstValueFrom } from 'rxjs';

import { msalProviders } from './core/auth/msal-providers';
import { apiAuthInterceptor } from './core/http/api-auth.interceptor';
import { routes } from './app.routes';

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
      await msal.instance.initialize();
      msal.handleRedirectObservable().subscribe((result) => {
        if (result?.account) {
          msal.instance.setActiveAccount(result.account);
        } else if (msal.instance.getAllAccounts().length > 0) {
          msal.instance.setActiveAccount(msal.instance.getAllAccounts()[0]);
        }
      }); // Запускаем подписку без await
    }),
  ]
};
