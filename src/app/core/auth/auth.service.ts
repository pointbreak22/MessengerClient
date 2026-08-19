import { Injectable, computed, inject, signal } from '@angular/core';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { AccountInfo, EventType, InteractionRequiredAuthError, InteractionStatus } from '@azure/msal-browser';
import { filter, firstValueFrom } from 'rxjs';
import { UserApiService } from '../../services/user-api.service';
import { UserProfile } from '../../interfaces/user-profile';
import { apiScope } from './msal.config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // If re-auth was already attempted this recently and we're still failing,
  // the problem isn't session expiry (interactive sign-in won't fix it either) —
  // stop retrying so a broken backend/config doesn't spin the browser in an
  // infinite acquireTokenRedirect loop.
  private static readonly REAUTH_COOLDOWN_KEY = 'msal_reauth_attempted_at';
  private static readonly REAUTH_COOLDOWN_MS = 30_000;

  private readonly msal = inject(MsalService);
  private readonly broadcast = inject(MsalBroadcastService);
  private readonly userApi = inject(UserApiService);

  private readonly _currentAccount = signal<AccountInfo | null>(this.msal.instance.getActiveAccount());
  private readonly _currentUserProfile = signal<UserProfile | null>(null);
  private reauthenticating = false;
  // MsalInterceptor (REST) can independently trigger its own acquireTokenRedirect on
  // failure. Track interaction status ourselves so our SignalR/401 reauth path never
  // fires a *second*, overlapping redirect — two concurrent redirects can stomp on
  // each other's PKCE verifier/state in session storage and break sign-in entirely.
  private interactionStatus: InteractionStatus = InteractionStatus.None;

  readonly currentAccount = this._currentAccount.asReadonly();
  readonly currentUserProfile = this._currentUserProfile.asReadonly();
  readonly isAuthenticated = computed(() => this._currentAccount() !== null);

  constructor() {
    this.broadcast.inProgress$.subscribe((status) => (this.interactionStatus = status));

    this.broadcast.msalSubject$
      .pipe(
        filter(
          (msg) => msg.eventType === EventType.LOGIN_SUCCESS || msg.eventType === EventType.ACQUIRE_TOKEN_SUCCESS,
        ),
      )
      .subscribe(() => {
        const active = this.msal.instance.getActiveAccount() ?? this.msal.instance.getAllAccounts()[0] ?? null;
        if (active) this.msal.instance.setActiveAccount(active);
        this._currentAccount.set(active);
        if (active) {
          sessionStorage.removeItem(AuthService.REAUTH_COOLDOWN_KEY);
          void this.loadCurrentUserProfile();
        }
      });
  }

  login(): void {
    this.msal.loginRedirect({ scopes: [apiScope] }).subscribe();
  }

  logout(): void {
    this._currentUserProfile.set(null);
    this.msal.logoutRedirect().subscribe();
  }

  async getAccessToken(scopes: string[] = [apiScope]): Promise<string | null> {
    const account = this._currentAccount();
    if (!account) return null;

    try {
      const result = await firstValueFrom(this.msal.acquireTokenSilent({ scopes, account }));
      return result.accessToken;
    } catch (error) {
      // Refresh token expired/revoked and silent renewal can't recover on its own
      // (e.g. SignalR's accessTokenFactory has no other fallback) — re-auth interactively.
      if (error instanceof InteractionRequiredAuthError) this.reauthenticate(scopes);
      return null;
    }
  }

  // Forces a fresh interactive sign-in when silent token acquisition can't recover
  // (expired session) or the API itself rejects an ostensibly-valid token as 401.
  reauthenticate(scopes: string[] = [apiScope]): void {
    if (this.reauthenticating) return;
    // Another interaction (e.g. MsalInterceptor's own redirect fallback) is already
    // running — let it resolve instead of firing a second, colliding redirect.
    if (this.interactionStatus !== InteractionStatus.None) return;

    const lastAttempt = Number(sessionStorage.getItem(AuthService.REAUTH_COOLDOWN_KEY) ?? 0);
    if (Date.now() - lastAttempt < AuthService.REAUTH_COOLDOWN_MS) {
      console.error(
        'AuthService: skipping re-authentication — already attempted recently and still failing. ' +
          'This is not a session-expiry issue (interactive sign-in would not fix it either).',
      );
      return;
    }

    this.reauthenticating = true;
    sessionStorage.setItem(AuthService.REAUTH_COOLDOWN_KEY, String(Date.now()));
    this.msal.acquireTokenRedirect({ scopes });
  }

  private async loadCurrentUserProfile(): Promise<void> {
    const profile = await firstValueFrom(this.userApi.getMe());
    this._currentUserProfile.set(profile);
  }
}
