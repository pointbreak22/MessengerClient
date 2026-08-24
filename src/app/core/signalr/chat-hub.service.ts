import { Injectable, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class ChatHubService {
  private readonly auth = inject(AuthService);
  private connection: HubConnection | null = null;
  // Stores/services register listeners in their constructors, which can run
  // before Dashboard calls connect() (e.g. ChatStore/UserStore are injected
  // by Dashboard's own field initializers, ahead of the connect() call in its
  // constructor body) — on() used to silently drop those via `this.connection?.on`.
  // Queue them here and replay onto the real connection once one exists.
  private readonly pendingHandlers: { methodName: string; callback: (payload: unknown) => void }[] = [];

  readonly connectionState = signal<HubConnectionState>(HubConnectionState.Disconnected);

  async connect(): Promise<void> {
    if (this.connection) return;

    const connection = new HubConnectionBuilder()
      .withUrl(environment.hubUrl, {
        accessTokenFactory: () => this.auth.getAccessToken().then((token) => token ?? ''),
      })
      .withAutomaticReconnect()
      .build();

    connection.onreconnecting(() => this.connectionState.set(HubConnectionState.Reconnecting));
    connection.onreconnected(() => this.connectionState.set(HubConnectionState.Connected));
    connection.onclose(() => this.connectionState.set(HubConnectionState.Disconnected));

    for (const { methodName, callback } of this.pendingHandlers) {
      connection.on(methodName, callback);
    }
    this.pendingHandlers.length = 0;

    this.connection = connection;
    await connection.start();
    this.connectionState.set(HubConnectionState.Connected);
  }

  async disconnect(): Promise<void> {
    await this.connection?.stop();
    this.connection = null;
    this.connectionState.set(HubConnectionState.Disconnected);
  }

  on<T>(methodName: string, callback: (payload: T) => void): void {
    if (this.connection) {
      this.connection.on(methodName, callback as (payload: unknown) => void);
    } else {
      this.pendingHandlers.push({ methodName, callback: callback as (payload: unknown) => void });
    }
  }

  invoke<T>(methodName: string, ...args: unknown[]): Promise<T> {
    if (!this.connection) {
      return Promise.reject(new Error('ChatHubService: cannot invoke before connect()'));
    }
    return this.connection.invoke<T>(methodName, ...args);
  }

  // Call on chat open/close.
  joinChatRoom(chatId: string): Promise<void> {
    return this.invoke<void>('JoinChatRoom', chatId);
  }

  leaveChatRoom(chatId: string): Promise<void> {
    return this.invoke<void>('LeaveChatRoom', chatId);
  }

  // Low-latency alternative to MessageApiService.sendMessage() while the
  // WebSocket is open. MessageStore defaults to the REST path (reliable
  // across reconnects, per the spec) — this is here for future use.
  sendMessage(
    chatId: string,
    text: string | null,
    attachmentUrl: string | null,
    idempotencyKey: string,
  ): Promise<void> {
    return this.invoke<void>('SendMessage', chatId, text, attachmentUrl, idempotencyKey);
  }
}
