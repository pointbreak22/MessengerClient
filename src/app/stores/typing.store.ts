import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { ChatHubService } from '../core/signalr/chat-hub.service';

export interface UserTypingEvent {
  chatId: string;
  userId: string;
}

// The hub only ever sends "someone is typing", never "someone stopped" —
// so each sighting is treated as valid for a few seconds and self-expires
// via timeout, same UX every other messenger uses instead of relying on a
// dedicated (and easy to miss) stop-typing signal.
const TYPING_TIMEOUT_MS = 3000;

@Injectable({ providedIn: 'root' })
export class TypingStore {
  private readonly hub = inject(ChatHubService);

  private readonly _typingByChat = signal<Record<string, string[]>>({});
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    this.hub.on<UserTypingEvent>('UserTyping', (e) => this.apply(e));
  }

  typingUserIdsFor(chatId: string): Signal<string[]> {
    return computed(() => this._typingByChat()[chatId] ?? []);
  }

  private apply(e: UserTypingEvent): void {
    const key = `${e.chatId}:${e.userId}`;
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(
      key,
      setTimeout(() => this.remove(e.chatId, e.userId), TYPING_TIMEOUT_MS),
    );

    this._typingByChat.update((map) => {
      const current = map[e.chatId] ?? [];
      if (current.includes(e.userId)) return map;
      return { ...map, [e.chatId]: [...current, e.userId] };
    });
  }

  private remove(chatId: string, userId: string): void {
    this.timers.delete(`${chatId}:${userId}`);
    this._typingByChat.update((map) => {
      const current = map[chatId];
      if (!current?.includes(userId)) return map;
      return { ...map, [chatId]: current.filter((id) => id !== userId) };
    });
  }
}
