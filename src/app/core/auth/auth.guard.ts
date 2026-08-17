import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Authenticated-only routes use the library's `MsalGuard` (msal-providers.ts,
// registered in app.config.ts) directly. MSAL has no built-in inverse guard,
// hence this hand-written one for "already logged in, keep off /login".
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree(['/']) : true;
};
