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
  //
  // This is a PERMANENT registry, not a one-shot queue. It used to be cleared
  // as soon as its contents were copied onto the first connection, which broke
  // every connection after the first: Dashboard disconnects in ngOnDestroy, so
  // leaving /app and coming back built a fresh connection with zero handlers
  // and no NewMessage/call events ever arrived again until a full page reload.
  // Keeping the list lets every (re)connect re-attach the same handlers.
  private readonly handlers: { methodName: string; callback: (payload: unknown) => void }[] = [];

  // In-flight connect(), so concurrent callers share one attempt instead of
  // racing to build competing connections.
  private connecting: Promise<void> | null = null;
  // Set by disconnect() to abort a retry loop that is currently sleeping.
  private stopped = false;

  // The backend is an Azure App Service that unloads itself when idle, so the
  // first connect after a quiet spell can fail for tens of seconds while it
  // cold-starts (the browser reports those failures as CORS errors, because a
  // platform-level 5xx carries no Access-Control-Allow-Origin header).
  // withAutomaticReconnect() does not help here — it only revives a connection
  // that was successfully established at least once, never a failed initial
  // start. Hence an explicit backoff, capped and then repeated indefinitely:
  // the server will come back, and until it does there is nothing to do but
  // keep asking.
  private static readonly RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000];

  readonly connectionState = signal<HubConnectionState>(HubConnectionState.Disconnected);

  async connect(): Promise<void> {
    // Cleared first, before anything else looks at it: a retry loop that
    // disconnect() just told to stop may still be mid-sleep, and reviving it
    // is exactly right for the leave-and-come-back-to-/app case. Doing this
    // after the `this.connecting` check would instead hand the caller back a
    // promise that is about to bail out, leaving the hub permanently down.
    this.stopped = false;

    if (this.connection?.state === HubConnectionState.Connected) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.connectWithRetry();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async connectWithRetry(): Promise<void> {
    for (let attempt = 0; !this.stopped; attempt++) {
      const connection = this.buildConnection();
      try {
        await connection.start();
        // disconnect() may have been called while start() was in flight.
        if (this.stopped) {
          void connection.stop().catch(() => {});
          return;
        }
        this.connection = connection;
        this.connectionState.set(HubConnectionState.Connected);
        return;
      } catch (err) {
        // Critically, the failed connection is NOT stored. It used to be
        // assigned before start(), so a failure left a dead object in place
        // and the `if (this.connection) return` at the top of connect() made
        // every later attempt a silent no-op — the hub stayed dead for the
        // whole session while the UI happily pretended otherwise.
        this.connectionState.set(HubConnectionState.Disconnected);
        const delay = ChatHubService.RETRY_DELAYS_MS[
          Math.min(attempt, ChatHubService.RETRY_DELAYS_MS.length - 1)
        ];
        console.warn(`[hub] connect failed, retrying in ${delay}ms`, err);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private buildConnection(): HubConnection {
    const connection = new HubConnectionBuilder()
      .withUrl(environment.hubUrl, {
        accessTokenFactory: () => this.auth.getAccessToken().then((token) => token ?? ''),
      })
      .withAutomaticReconnect()
      .build();

    connection.onreconnecting(() => this.connectionState.set(HubConnectionState.Reconnecting));
    connection.onreconnected(() => this.connectionState.set(HubConnectionState.Connected));
    connection.onclose(() => this.connectionState.set(HubConnectionState.Disconnected));

    for (const { methodName, callback } of this.handlers) {
      connection.on(methodName, callback);
    }

    return connection;
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    const connection = this.connection;
    this.connection = null;
    this.connectionState.set(HubConnectionState.Disconnected);
    await connection?.stop().catch(() => {});
  }

  // Registering always records the handler, and additionally attaches it to
  // the live connection when there is one. Every subsequent connection picks
  // the whole registry up again in buildConnection(), so handlers survive
  // reconnects, retries and leaving/re-entering the app.
  on<T>(methodName: string, callback: (payload: T) => void): void {
    const entry = { methodName, callback: callback as (payload: unknown) => void };
    this.handlers.push(entry);
    this.connection?.on(entry.methodName, entry.callback);
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

  // Fire-and-forget — a dropped notification just means the "typing..."
  // indicator is a beat late on the other end, not worth surfacing an error.
  sendTyping(chatId: string): void {
    void this.invoke<void>('Typing', chatId).catch(() => {});
  }
}
