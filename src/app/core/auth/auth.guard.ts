import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../../interfaces/user-profile';
import { AuthService } from './auth.service';

// Authenticated-only routes use the library's `MsalGuard` (msal-providers.ts,
// registered in app.config.ts) directly. MSAL has no built-in inverse guard,
// hence this hand-written one for "already logged in, keep off /login".
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // '/app', not '/': the root is the public landing page now, and sending an
  // authenticated user there would just bounce them again (Landing forwards
  // signed-in visitors on to the app).
  return auth.isAuthenticated() ? router.createUrlTree(['/app']) : true;
};

// Gate for /admin. Cosmetic in the security sense — every admin endpoint is
// behind the server's "SuperAdmin" policy — but it keeps a normal user from
// landing on a page that would only ever render a wall of 403s.
export const superAdminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return router.createUrlTree(['/']);

  // The role lives on the profile, which loads asynchronously; without this the
  // guard would routinely run before it arrives and bounce the admin.
  await auth.ensureProfileLoaded();

  return auth.isSuperAdmin() ? true : router.createUrlTree(['/app']);
};
