import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../../components/icon/icon';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly router = inject(Router);

  email = '';
  password = '';
  rememberMe = true;

  submit(): void {
    this.router.navigateByUrl('/');
  }
}
