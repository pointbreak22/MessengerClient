import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';
import { guestGuard } from './core/auth/auth.guard';
import { Landing } from './pages/landing/landing';

// '' is deliberately NOT the app itself any more. It used to be Dashboard
// behind MsalGuard, which meant every visitor — search engine crawlers
// included — was bounced straight to the Microsoft sign-in page, so there
// was nothing on this domain that could ever be indexed. The app now lives
// at /app and the root is a public page describing it; Landing forwards
// anyone already signed in to /app, so for existing users the redirect is
// invisible.
//
// Landing is imported eagerly (it IS the entry point — lazy-loading it would
// just add a network round trip before anything renders), while everything
// behind it is loaded on demand. Otherwise a visitor who only ever sees the
// landing page still downloads the entire messenger — chat, sidebars, call
// overlays, group calling, emoji picker — to render a page with a heading
// and a button, which hurts both first-load speed and Core Web Vitals.
export const routes: Routes = [
  { path: '', component: Landing },
  {
    path: 'app',
    canActivate: [MsalGuard],
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/login/login').then((m) => m.Login),
  },
  { path: '**', redirectTo: '' },
];
