import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

// The one publicly reachable page, and the only thing search engines ever
// see: everything else is either behind MsalGuard or a sign-in screen. Its
// whole job is to say what this app is and hand the visitor over to it —
// the indexable content lives in index.html's meta tags and the no-JS
// fallback markup inside <app-root>, not here.
//
// Note there is no "am I already signed in, bounce to /app" check here:
// guestGuard on the route handles that before this component is created.
@Component({
  selector: 'app-landing',
  imports: [],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  private readonly router = inject(Router);

  openMessenger(): void {
    // MsalGuard on /app triggers the sign-in redirect itself when needed,
    // so this is the same single entry point for signed-in and new visitors.
    void this.router.navigate(['/app']);
  }
}
