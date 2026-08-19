import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

// Replaces @azure/msal-angular's MsalInterceptor. That one auto-fires a full-page
// acquireTokenRedirect the instant silent token acquisition fails for any protected
// request — fine when the cache entry is merely stale, but when acquisition fails
// for a real, unrecoverable reason it turns into an infinite login-window reload
// loop (every request re-triggers its own redirect). This attaches the token when
// AuthService can get one silently, and otherwise just forwards the request as-is —
// the backend 401s it and the app stays in a stable, non-looping state instead.
export const apiAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  // Проверяем, идет ли запрос на наш API (учитывая и относительные, и абсолютные URL)
  const isApiRequest = req.url.startsWith(baseUrl) || req.url.startsWith('/api');

  if (!isApiRequest) {
    return next(req);
  }

  const auth = inject(AuthService);
  return from(auth.getAccessToken()).pipe(
    switchMap((token) => {
      const authReq = token
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;
      return next(authReq);
    }),
  );
};
