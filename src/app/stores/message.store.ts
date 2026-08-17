import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ChatHubService } from '../core/signalr/chat-hub.service';
import { MessageApiService } from '../services/message-api.service';
import { ChatMessage } from '../interfaces/chat-message';
import { NewMessageEvent } from '../interfaces/hub-events';

@Injectable({ providedIn: 'root' })
export class MessageStore {
  private readonly api = inject(MessageApiService);
  private readonly hub = inject(ChatHubService);

  private readonly _messagesByChat = signal<Record<string, ChatMessage[]>>({});

  constructor() {
    this.hub.on<NewMessageEvent>('NewMessage', (event) => this.appendMessage(event));
  }

  messagesFor(chatId: string): Signal<ChatMessage[]> {
    return computed(() => this._messagesByChat()[chatId] ?? []);
  }

  async loadMessages(chatId: string, before?: string): Promise<void> {
    const page = await firstValueFrom(this.api.getHistory(chatId, 50, before));
    this._messagesByChat.update((byChat) => {
      const existing = byChat[chatId] ?? [];
      return { ...byChat, [chatId]: before ? [...existing, ...page] : page };
    });
  }

  // REST send — reliable across reconnects (per the spec); ChatHubService.sendMessage()
  // is the low-latency SignalR alternative for later. Either way the server
  // pushes NewMessage back to every member including the sender, so this
  // deliberately does not optimistically append — appendMessage() handles it.
  async sendMessage(chatId: string, text: string | null, attachmentUrl: string | null = null): Promise<void> {
    if (!text && !attachmentUrl) return;
    await firstValueFrom(
      this.api.sendMessage(chatId, { text, attachmentUrl, idempotencyKey: crypto.randomUUID() }),
    );
  }

  async markRead(chatId: string): Promise<void> {
    await firstValueFrom(this.api.markRead(chatId));
  }

  private appendMessage(event: NewMessageEvent): void {
    // The push event has no createdAt — approximate with receive time.
    const message: ChatMessage = {
      id: event.messageId,
      chatId: event.chatId,
      senderId: event.senderId,
      text: event.text,
      attachmentUrl: event.attachmentUrl,
      createdAt: new Date().toISOString(),
    };

    this._messagesByChat.update((byChat) => ({
      ...byChat,
      [message.chatId]: [message, ...(byChat[message.chatId] ?? [])],
    }));
  }
}
