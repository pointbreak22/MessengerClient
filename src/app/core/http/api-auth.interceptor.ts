import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { asContentViolation, ModerationNoticeStore } from '../moderation/moderation-notice.store';

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
  const moderationNotice = inject(ModerationNoticeStore);
  return from(auth.getAccessToken()).pipe(
    switchMap((token) => {
      const authReq = token
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;
      return next(authReq);
    }),
    // BanEnforcementMiddleware answers every request of a blocked account with
    // 403 { code: 'account_banned' }, and of a blocked IP with 'ip_banned'.
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 403) {
        if (err.error?.code === 'account_banned') auth.markBanned('account');
        else if (err.error?.code === 'ip_banned') auth.markBanned('ip');
      }
      // Auto-moderation rejected the text (422 content_violation) — show why,
      // whichever screen sent it. Callers may still react (e.g. restore a draft).
      const violation = asContentViolation(err);
      if (violation) moderationNotice.show(violation);
      return throwError(() => err);
    }),
  );
};
