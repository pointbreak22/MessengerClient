import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../../components/icon/icon';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  private readonly router = inject(Router);

  fullName = '';
  email = '';
  password = '';
  confirmPassword = '';
  agreeTerms = true;

  submit(): void {
    this.router.navigateByUrl('/');
  }
}
