import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import {AccountInfo, AuthError, AuthenticationResult, EventType} from '@azure/msal-browser';
import { filter, firstValueFrom } from 'rxjs';
import { UserApiService } from '../../services/user-api.service';
import { UserProfile, UserRole } from '../../interfaces/user-profile';
import {apiScope, msalConfig} from './msal.config';

// Silent acquisition failures that only mean "no network right now". Every
// other failure means the cached session can't be renewed without the user:
// InteractionRequiredAuthError, but also BrowserAuthError "timed_out" — the
// hidden-iframe renewal that runs once the refresh token has expired, and which
// always times out when the browser blocks third-party cookies for
// ciamlogin.com. That second case was the "opens as an empty account, works
// only after Log out + Log in" bug: it isn't an InteractionRequiredAuthError,
// so the dead account stayed in place and every request went out without a token.
const TRANSIENT_AUTH_ERRORS = new Set(['no_network_connectivity', 'post_request_failed']);

// Automatic sign-in redirects are rate-limited per tab. If the API keeps
// rejecting fresh tokens (misconfiguration, clock skew), redirecting on every
// load would bounce between the app and the sign-in page forever; after the
// first automatic attempt the visitor lands on /login and presses the button.
const AUTO_LOGIN_KEY = 'auth.autoLoginAt';
const AUTO_LOGIN_COOLDOWN_MS = 2 * 60 * 1000;

// Profile load retries cover the free-tier backend cold start: the first
// requests after idle time out or answer 5xx for a while.
const PROFILE_RETRY_DELAYS_MS = [2000, 4000, 8000, 16000];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly msal = inject(MsalService);
  private readonly broadcast = inject(MsalBroadcastService);
  private readonly userApi = inject(UserApiService);
  private readonly router = inject(Router);

  private readonly _currentAccount = signal<AccountInfo | null>(this.msal.instance.getActiveAccount());
  private readonly _currentUserProfile = signal<UserProfile | null>(null);
  // Guards against re-triggering loginRedirect() from every in-flight request
  // that hits the same dead session — without this, N concurrent 401s would
  // each independently call login() and race each other into the redirect.
  private reauthTriggered = false;
  // See login() — stops a second redirect being started while the first is
  // still in flight.
  private loginInProgress = false;

  readonly currentAccount = this._currentAccount.asReadonly();
  readonly currentUserProfile = this._currentUserProfile.asReadonly();
  readonly isAuthenticated = computed(() => this._currentAccount() !== null);
  // Only decides whether admin UI is offered. The API enforces the same rule
  // server-side, so a forged value here buys nothing but a 403.
  readonly isSuperAdmin = computed(() => this._currentUserProfile()?.role === UserRole.SuperAdmin);

  // De-duplicates concurrent waits — see ensureProfileLoaded().
  private profileLoad: Promise<void> | null = null;

  constructor() {
    this.broadcast.msalSubject$
      .pipe(
        filter((msg) => msg.eventType === EventType.LOGIN_SUCCESS) // 👈 Убрали ACQUIRE_TOKEN_SUCCESS
      )
      .subscribe((msg) => {
        const payloadAccount = (msg.payload as AuthenticationResult)?.account;
        const active = payloadAccount
          ?? this.msal.instance.getActiveAccount()
          ?? this.msal.instance.getAllAccounts()[0]
          ?? null;

        if (active) {
          this.msal.instance.setActiveAccount(active);
          this._currentAccount.set(active);
          void this.loadCurrentUserProfile();
        }
      });
  }

  // Called once from app.config.ts's app initializer, after AuthService itself
  // is fully constructed and returned — never from within AuthService's own
  // constructor. Doing it there (even deferred via queueMicrotask) still hit
  // NG0200 "circular dependency": the HTTP call it triggers runs through
  // apiAuthInterceptor, which injects AuthService again, and something in that
  // chain was still resolving on the same injector record. Calling this from a
  // separate, later async initializer step sidesteps that entirely.
  // Covers plain page reloads: MSAL restores the active account from
  // localStorage synchronously (see _currentAccount's initializer above), but
  // that path never emits LOGIN_SUCCESS, so the broadcast subscription alone
  // would leave currentUserProfile null until the next interactive login.
  async initializeSession(): Promise<void> {
    if (this._currentAccount()) {
      await this.loadCurrentUserProfile();
    }
  }

  // For anything that needs the profile to have arrived before it can decide —
  // route guards in particular. The app initializer starts this load without
  // awaiting it (so a cold backend can't hold up rendering), which means a
  // guard running on a fresh page load can easily get there first and see a
  // null profile. Awaiting the same in-flight promise avoids both a premature
  // "no role, denied" and a duplicate request.
  async ensureProfileLoaded(): Promise<void> {
    if (this._currentUserProfile() || !this._currentAccount()) return;

    this.profileLoad ??= this.loadCurrentUserProfile().finally(() => {
      this.profileLoad = null;
    });
    await this.profileLoad;
  }

  // Called after a successful avatar/name change (Header) so the new value
  // shows up everywhere currentUserProfile is read, without a full refetch.
  updateProfile(patch: Partial<UserProfile>): void {
    const current = this._currentUserProfile();
    if (!current) return;
    this._currentUserProfile.set({ ...current, ...patch });
  }

  login(): void {
    // Guarded for the same reason reauthTriggered exists: two overlapping
    // loginRedirect() calls stomp on each other's state/nonce in MSAL's cache
    // and the browser comes back to ClientAuthError: state_mismatch — which
    // surfaces as a blank page. Dashboard drives one of the call sites from
    // an effect(), so a re-run must not fire a second redirect while the
    // first is still navigating away.
    if (this.loginInProgress) return;
    this.loginInProgress = true;
    this.msal.loginRedirect({ scopes: [apiScope] }).subscribe({
      error: () => {
        this.loginInProgress = false;
      },
    });
  }

  // For code paths that find the session gone (Dashboard). Sends the visitor
  // straight to the sign-in page instead of leaving an empty shell on screen,
  // unless an automatic redirect already happened moments ago — see
  // AUTO_LOGIN_COOLDOWN_MS.
  signInAgain(): void {
    if (this.loginInProgress) return;

    let lastAttempt = 0;
    try {
      lastAttempt = Number(sessionStorage.getItem(AUTO_LOGIN_KEY)) || 0;
    } catch {
      /* storage blocked: treat as no previous attempt */
    }

    if (Date.now() - lastAttempt < AUTO_LOGIN_COOLDOWN_MS) {
      void this.router.navigateByUrl('/login');
      return;
    }

    try {
      sessionStorage.setItem(AUTO_LOGIN_KEY, String(Date.now()));
    } catch {
      /* best-effort */
    }
    this.login();
  }

  logout(): void {
    const activeAccount = this.msal.instance.getActiveAccount()
      ?? this._currentAccount()
      ?? undefined;

    // Сбрасываем локальное состояние Angular
    this._currentAccount.set(null);
    this._currentUserProfile.set(null);

    // Вызываем logout с указанием authority и конкретного аккаунта
    this.msal.logoutRedirect({
      authority: msalConfig.auth.authority,
      account: activeAccount,
      postLogoutRedirectUri: msalConfig.auth.postLogoutRedirectUri,
    }).subscribe();
  }

  // Silent-first: most failures (server/config issues, transient network
  // errors) just return null instead of forcing an interactive redirect —
  // auto-triggering acquireTokenRedirect for *those* caused a login-window
  // reload loop, since every failing request fired its own redirect.
  // A failure that isn't a network error (see TRANSIENT_AUTH_ERRORS) is
  // different: it means the cached session/refresh token is dead (expired,
  // revoked in Entra, iframe renewal blocked by the browser, etc.) —
  // no amount of retrying silently will ever succeed, only an interactive
  // login can recover. Without handling it, _currentAccount stays set from
  // localStorage, isAuthenticated stays true, and the app sits there rendering
  // as "logged in" while every request 401s forever until the user manually
  // clears storage. So this one case still gets a single, guarded redirect.
  async getAccessToken(scopes: string[] = [apiScope]): Promise<string | null> {
    let account = this._currentAccount();

    if (!account) {
      const accounts = this.msal.instance.getAllAccounts();
      if (accounts.length > 0) {
        account = accounts[0];
        this._currentAccount.set(account);
      }
    }

    if (!account) return null;

    if (!this.msal.instance.getActiveAccount()) {
      this.msal.instance.setActiveAccount(account);
    }

    try {
      const result = await firstValueFrom(
        this.msal.acquireTokenSilent({
          scopes,
          account,
          authority: msalConfig.auth.authority // 👈 Исключаем mismatch
        })
      );
      return result.accessToken;
    } catch (err) {
      console.warn('MSAL silent token acquisition failed:', err);
      if (!(err instanceof AuthError && TRANSIENT_AUTH_ERRORS.has(err.errorCode))) {
        void this.triggerReauth();
      }
      return null;
    }
  }

  // Does NOT call login() itself. MsalGuard (guarding the '' route) already
  // does its own silent-acquire-then-redirect for this exact case — calling
  // login() here too raced it: two concurrent loginRedirect() calls stomp on
  // each other's state/nonce in MSAL's cache, and the browser comes back to a
  // ClientAuthError: state_mismatch. Clearing local state here just makes
  // isAuthenticated/currentUserProfile stop lying about a session that's dead;
  // the guard is the single place that owns re-authenticating.
  //
  // The MSAL cache is cleared first and the signals reset afterwards:
  // resetting _currentAccount is what makes Dashboard start the sign-in
  // redirect, and that redirect must not overlap with clearCache().
  private async triggerReauth(): Promise<void> {
    if (this.reauthTriggered) return;
    this.reauthTriggered = true;

    // Clearing the Angular signals alone was not enough, and this was the
    // "I have to press Log out before it will let me sign in again" bug.
    // MSAL keeps the account in localStorage independently of these signals,
    // and _currentAccount is re-seeded from getActiveAccount() on every
    // startup — so after a session expired, a reload resurrected the dead
    // account, isAuthenticated() went back to true, the app rendered as
    // logged in, and every single request 401'd forever. Only an explicit
    // logout wiped the cache and broke the loop. Dropping the account here
    // makes the next load start genuinely signed out instead.
    try {
      this.msal.instance.setActiveAccount(null);
      await this.msal.instance.clearCache();
    } catch {
      /* best-effort: the signals below are reset either way */
    }

    this._currentAccount.set(null);
    this._currentUserProfile.set(null);
  }

  private async loadCurrentUserProfile(): Promise<void> {
    // Защита от повторного вызова, если профиль уже загружен
    if (this._currentUserProfile()) return;

    for (let attempt = 0; ; attempt++) {
      try {
        const profile = await firstValueFrom(this.userApi.getMe());
        this._currentUserProfile.set(profile);
        return;
      } catch (err) {
        // 401 with a token attached: the API no longer accepts this session.
        // A request sent without a token (silent acquisition failed) has
        // already started re-authentication in getAccessToken().
        if (err instanceof HttpErrorResponse && err.status === 401) {
          if (this._currentAccount()) void this.triggerReauth();
          return;
        }

        const transient = err instanceof HttpErrorResponse && (err.status === 0 || err.status >= 500);
        if (!transient || attempt >= PROFILE_RETRY_DELAYS_MS.length || !this._currentAccount()) {
          console.error('Failed to load user profile:', err);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, PROFILE_RETRY_DELAYS_MS[attempt]));
      }
    }
  }
}
