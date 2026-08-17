import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../icon/icon';
import { getInitials } from '../../shared/user-display';

@Component({
  selector: 'app-header',
  imports: [Icon],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private readonly auth = inject(AuthService);

  protected readonly currentUser = this.auth.currentUserProfile;
  protected readonly getInitials = getInitials;

  signOut(): void {
    this.auth.logout();
  }
}
