import { Component, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../components/icon/icon';

@Component({
  selector: 'app-login',
  imports: [Icon],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly auth = inject(AuthService);

  signIn(): void {
    this.auth.login();
  }
}
