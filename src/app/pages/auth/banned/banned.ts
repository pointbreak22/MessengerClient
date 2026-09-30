import { Component, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';

// Shown once the API or the hub answers "account_banned". The account is still
// signed in with Microsoft, so the only thing on offer is signing out.
@Component({
  selector: 'app-banned',
  imports: [],
  templateUrl: './banned.html',
  styleUrl: './banned.css',
})
export class Banned {
  private readonly auth = inject(AuthService);

  signOut(): void {
    this.auth.logout();
  }
}
