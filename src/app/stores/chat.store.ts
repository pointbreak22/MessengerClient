import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ChatHubService } from '../core/signalr/chat-hub.service';
import { ChatApiService } from '../services/chat-api.service';
import { AddedToGroupEvent } from '../interfaces/hub-events';
import { ChatSummary } from '../interfaces/chat-summary';

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly api = inject(ChatApiService);
  private readonly hub = inject(ChatHubService);

  private readonly _chats = signal<ChatSummary[]>([]);
  private readonly _selectedChatId = signal<string | null>(null);

  readonly chats = this._chats.asReadonly();
  readonly groups = computed(() => this._chats().filter((c) => c.isGroup));
  readonly selectedChatId = this._selectedChatId.asReadonly();
  readonly selectedChat = computed<ChatSummary | null>(
    () => this._chats().find((c) => c.id === this._selectedChatId()) ?? null,
  );

  constructor() {
    // Payload has chatId/chatName but not members/createdAt/ownerId, so a full
    // refetch is simpler and more correct than fabricating a partial ChatSummary.
    this.hub.on<AddedToGroupEvent>('AddedToGroup', () => void this.loadChats());
  }

  async loadChats(): Promise<void> {
    const chats = await firstValueFrom(this.api.getChats());
    this._chats.set(chats);
  }

  selectChat(id: string): void {
    const previousId = this._selectedChatId();
    if (previousId) void this.hub.leaveChatRoom(previousId).catch(() => {});

    this._selectedChatId.set(id);
    void this.hub.joinChatRoom(id).catch(() => {});
  }

  closeChat(): void {
    const previousId = this._selectedChatId();
    if (previousId) void this.hub.leaveChatRoom(previousId).catch(() => {});
    this._selectedChatId.set(null);
  }

  async createDirectChat(targetUserId: string): Promise<void> {
    const { chatId } = await firstValueFrom(this.api.createDirectChat(targetUserId));
    await this.loadChats();
    this.selectChat(chatId);
  }

  async createGroupChat(name: string, memberIds?: string[]): Promise<void> {
    const { chatId } = await firstValueFrom(this.api.createGroupChat(name, memberIds));
    await this.loadChats();
    this.selectChat(chatId);
  }

  async addMember(chatId: string, userId: string): Promise<void> {
    await firstValueFrom(this.api.addMember(chatId, userId));
  }
}
