import { Injectable, computed, inject, signal } from '@angular/core';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import {AccountInfo, AuthenticationResult, EventType} from '@azure/msal-browser';
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

  readonly currentAccount = this._currentAccount.asReadonly();
  readonly currentUserProfile = this._currentUserProfile.asReadonly();
  readonly isAuthenticated = computed(() => this._currentAccount() !== null);

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

  login(): void {
    this.msal.loginRedirect({ scopes: [apiScope] }).subscribe();
  }

  logout(): void {
    this._currentUserProfile.set(null);
    this.msal.logoutRedirect().subscribe();
  }

  // Silent-only: returns null on any failure instead of forcing an interactive
  // redirect. Auto-triggering acquireTokenRedirect from here caused a login-window
  // reload loop when silent renewal was failing for a real, unrecoverable reason
  // (server/config issue, not just an expired cache entry) — every failing request
  // fired its own redirect. Re-auth is now only ever user-initiated via login().
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

    // Подстраховка: убеждаемся, что MSAL считает этот аккаунт активным
    if (!this.msal.instance.getActiveAccount()) {
      this.msal.instance.setActiveAccount(account);
    }

    try {
      const result = await firstValueFrom(this.msal.acquireTokenSilent({ scopes, account }));
      return result.accessToken;
    } catch (err) {
      console.warn('MSAL silent token acquisition failed:', err);
      return null;
    }
  }

  private async loadCurrentUserProfile(): Promise<void> {
    // Защита от повторного вызова, если профиль уже загружен
    if (this._currentUserProfile()) return;

    try {
      const profile = await firstValueFrom(this.userApi.getMe());
      this._currentUserProfile.set(profile);
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  }
}
