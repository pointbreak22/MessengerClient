import { Injectable, computed, inject, signal } from '@angular/core';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { AccountInfo, EventType, InteractionRequiredAuthError } from '@azure/msal-browser';
import { filter, firstValueFrom } from 'rxjs';
import { UserApiService } from '../../services/user-api.service';
import { UserProfile } from '../../interfaces/user-profile';
import { apiScope } from './msal.config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly msal = inject(MsalService);
  private readonly broadcast = inject(MsalBroadcastService);
  private readonly userApi = inject(UserApiService);

  private readonly _currentAccount = signal<AccountInfo | null>(this.msal.instance.getActiveAccount());
  private readonly _currentUserProfile = signal<UserProfile | null>(null);
  private reauthenticating = false;

  readonly currentAccount = this._currentAccount.asReadonly();
  readonly currentUserProfile = this._currentUserProfile.asReadonly();
  readonly isAuthenticated = computed(() => this._currentAccount() !== null);

  constructor() {
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
        if (active) void this.loadCurrentUserProfile();
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
  // Guarded because acquireTokenRedirect navigates away — no need to reset the flag,
  // the page reload clears it.
  reauthenticate(scopes: string[] = [apiScope]): void {
    if (this.reauthenticating) return;
    this.reauthenticating = true;
    this.msal.acquireTokenRedirect({ scopes });
  }

  private async loadCurrentUserProfile(): Promise<void> {
    const profile = await firstValueFrom(this.userApi.getMe());
    this._currentUserProfile.set(profile);
  }
}
