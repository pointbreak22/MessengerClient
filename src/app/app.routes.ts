import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';
import { guestGuard } from './core/auth/auth.guard';
import { Login } from './pages/auth/login/login';
import { Dashboard } from './pages/dashboard/dashboard';

export const routes: Routes = [
  { path: '', component: Dashboard, canActivate: [MsalGuard] },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: '**', redirectTo: '' },
];
