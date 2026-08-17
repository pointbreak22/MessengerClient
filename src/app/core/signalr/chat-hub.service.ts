import { Injectable, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class ChatHubService {
  private readonly auth = inject(AuthService);
  private connection: HubConnection | null = null;

  readonly connectionState = signal<HubConnectionState>(HubConnectionState.Disconnected);

  async connect(): Promise<void> {
    if (this.connection) return;

    const connection = new HubConnectionBuilder()
      .withUrl(`${environment.hubUrl}/chat`, {
        accessTokenFactory: () => this.auth.getAccessToken().then((token) => token ?? ''),
      })
      .withAutomaticReconnect()
      .build();

    connection.onreconnecting(() => this.connectionState.set(HubConnectionState.Reconnecting));
    connection.onreconnected(() => this.connectionState.set(HubConnectionState.Connected));
    connection.onclose(() => this.connectionState.set(HubConnectionState.Disconnected));

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
    this.connection?.on(methodName, callback);
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
