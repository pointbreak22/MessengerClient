import { Injectable, computed, inject, signal } from '@angular/core';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import {AccountInfo, AuthenticationResult, EventType, InteractionRequiredAuthError} from '@azure/msal-browser';
import { filter, firstValueFrom } from 'rxjs';
import { UserApiService } from '../../services/user-api.service';
import { UserProfile } from '../../interfaces/user-profile';
import {apiScope, msalConfig} from './msal.config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly msal = inject(MsalService);
  private readonly broadcast = inject(MsalBroadcastService);
  private readonly userApi = inject(UserApiService);

  private readonly _currentAccount = signal<AccountInfo | null>(this.msal.instance.getActiveAccount());
  private readonly _currentUserProfile = signal<UserProfile | null>(null);
  // Guards against re-triggering loginRedirect() from every in-flight request
  // that hits the same dead session — without this, N concurrent 401s would
  // each independently call login() and race each other into the redirect.
  private reauthTriggered = false;

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

  // Called after a successful avatar/name change (Header) so the new value
  // shows up everywhere currentUserProfile is read, without a full refetch.
  updateProfile(patch: Partial<UserProfile>): void {
    const current = this._currentUserProfile();
    if (!current) return;
    this._currentUserProfile.set({ ...current, ...patch });
  }

  login(): void {
    this.msal.loginRedirect({ scopes: [apiScope] }).subscribe();
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
  // InteractionRequiredAuthError is different: it specifically means the
  // cached session/refresh token is dead (expired, revoked in Entra, etc.) —
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
      if (err instanceof InteractionRequiredAuthError) {
        this.triggerReauth();
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
  private triggerReauth(): void {
    if (this.reauthTriggered) return;
    this.reauthTriggered = true;
    this._currentAccount.set(null);
    this._currentUserProfile.set(null);
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
