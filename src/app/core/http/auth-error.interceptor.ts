import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

// Safety net for the case MsalInterceptor doesn't cover: acquireTokenSilent
// resolves with a token MSAL still considers valid, but the API rejects it
// (expired/invalid per the backend) — without this, requests just fail
// silently forever while the dashboard keeps rendering as if nothing's wrong.
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && req.url.startsWith(environment.apiBaseUrl)) {
        auth.reauthenticate();
      }
      return throwError(() => error);
    }),
  );
};
