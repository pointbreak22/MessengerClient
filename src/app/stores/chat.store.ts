import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HubConnectionState } from '@microsoft/signalr';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { ChatHubService } from '../core/signalr/chat-hub.service';
import { ChatApiService } from '../services/chat-api.service';
import { UserApiService } from '../services/user-api.service';
import { AddedToGroupEvent } from '../interfaces/hub-events';
import { ChatSummary } from '../interfaces/chat-summary';
import { UserProfile } from '../interfaces/user-profile';

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly api = inject(ChatApiService);
  private readonly userApi = inject(UserApiService);
  private readonly auth = inject(AuthService);
  private readonly hub = inject(ChatHubService);

  private readonly _chats = signal<ChatSummary[]>([]);
  private readonly _selectedChatId = signal<string | null>(null);
  // Direct chats have no display name/avatar of their own (ChatSummary.name is
  // null) — keyed by chatId, resolved from `members` minus the current user.
  private readonly _directCounterparts = signal<Record<string, UserProfile>>({});
  private readonly _selectedChatMemberProfiles = signal<UserProfile[]>([]);

  readonly chats = this._chats.asReadonly();
  readonly groups = computed(() => this._chats().filter((c) => c.isGroup));
  readonly selectedChatId = this._selectedChatId.asReadonly();
  readonly selectedChat = computed<ChatSummary | null>(
    () => this._chats().find((c) => c.id === this._selectedChatId()) ?? null,
  );
  readonly directCounterparts = this._directCounterparts.asReadonly();
  // Full member-profile list of the selected chat, including the current user.
  readonly selectedChatMemberProfiles = this._selectedChatMemberProfiles.asReadonly();

  constructor() {
    // Payload has chatId/chatName but not members/createdAt/ownerId, so a full
    // refetch is simpler and more correct than fabricating a partial ChatSummary.
    this.hub.on<AddedToGroupEvent>('AddedToGroup', () => void this.loadChats());

    effect(() => {
      void this.resolveSelectedChatMembers(this.selectedChat());
    });

    // SignalR groups are keyed by ConnectionId — automatic reconnect gets a new
    // one, so the server drops prior group membership. Rejoin the open chat's
    // room whenever the connection comes back, or NewMessage stops arriving.
    effect(() => {
      if (this.hub.connectionState() !== HubConnectionState.Connected) return;
      const id = untracked(() => this._selectedChatId());
      if (id) void this.hub.joinChatRoom(id).catch(() => {});
    });
  }

  async loadChats(): Promise<void> {
    const chats = await firstValueFrom(this.api.getChats());
    this._chats.set(chats);
    await this.resolveDirectCounterparts(chats);
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

  private async resolveDirectCounterparts(chats: ChatSummary[]): Promise<void> {
    const myId = this.auth.currentUserProfile()?.id;
    const known = this._directCounterparts();
    const toResolve = chats.filter((c) => !c.isGroup && !known[c.id]);
    if (!toResolve.length) return;

    const resolved = await Promise.all(
      toResolve.map(async (chat) => {
        const otherId = chat.members.find((m) => m.userId !== myId)?.userId;
        if (!otherId) return null;
        const profile = await firstValueFrom(this.userApi.getUserById(otherId));
        return [chat.id, profile] as const;
      }),
    );

    this._directCounterparts.update((map) => {
      const next = { ...map };
      for (const entry of resolved) if (entry) next[entry[0]] = entry[1];
      return next;
    });
  }

  private async resolveSelectedChatMembers(chat: ChatSummary | null): Promise<void> {
    if (!chat) {
      this._selectedChatMemberProfiles.set([]);
      return;
    }
    const profiles = await Promise.all(chat.members.map((m) => firstValueFrom(this.userApi.getUserById(m.userId))));
    this._selectedChatMemberProfiles.set(profiles);
  }
}
