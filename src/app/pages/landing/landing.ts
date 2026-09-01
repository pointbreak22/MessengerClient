import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

// The one publicly reachable page, and the only thing search engines ever
// see: everything else is either behind MsalGuard or a sign-in screen. Its
// whole job is to say what this app is and hand the visitor over to it —
// the indexable content lives in index.html's meta tags and the no-JS
// fallback markup inside <app-root>, not here.
@Component({
  selector: 'app-landing',
  imports: [],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    // MSAL's redirectUri is the origin (msal.config.ts), so coming back from
    // a Microsoft sign-in always lands here rather than on the app. Anyone
    // already signed in has no reason to look at a marketing page — send
    // them straight through. Runs after the app initializer has resolved
    // handleRedirectObservable(), so the account is known by now.
    if (this.auth.isAuthenticated()) {
      void this.router.navigate(['/app'], { replaceUrl: true });
    }
  }

  openMessenger(): void {
    // MsalGuard on /app triggers the sign-in redirect itself when needed,
    // so this is the same single entry point for signed-in and new visitors.
    void this.router.navigate(['/app']);
  }
}
