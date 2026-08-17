import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// For protecting authenticated-only routes, use the library's `MsalGuard`
// (exported from msal-providers.ts) once it's registered in app.config.ts.
// MSAL has no built-in inverse guard, hence this hand-written one.
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree(['/']) : true;
};
