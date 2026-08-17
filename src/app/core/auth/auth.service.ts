import { Injectable, computed, inject, signal } from '@angular/core';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { AccountInfo, EventType } from '@azure/msal-browser';
import { filter, firstValueFrom } from 'rxjs';
import { apiScope } from './msal.config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly msal = inject(MsalService);
  private readonly broadcast = inject(MsalBroadcastService);

  private readonly _currentAccount = signal<AccountInfo | null>(this.msal.instance.getActiveAccount());

  readonly currentAccount = this._currentAccount.asReadonly();
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
      });
  }

  login(): void {
    this.msal.loginRedirect({ scopes: [apiScope] }).subscribe();
  }

  logout(): void {
    this.msal.logoutRedirect().subscribe();
  }

  async getAccessToken(scopes: string[] = [apiScope]): Promise<string | null> {
    const account = this._currentAccount();
    if (!account) return null;

    try {
      const result = await firstValueFrom(this.msal.acquireTokenSilent({ scopes, account }));
      return result.accessToken;
    } catch {
      return null;
    }
  }
}
