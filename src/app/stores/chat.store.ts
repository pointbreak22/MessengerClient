import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HubConnectionState } from '@microsoft/signalr';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { ChatHubService } from '../core/signalr/chat-hub.service';
import { ChatApiService } from '../services/chat-api.service';
import { UserApiService } from '../services/user-api.service';
import { AddedToGroupEvent } from '../interfaces/hub-events';
import { ChatSummary } from '../interfaces/chat-summary';
import { PublicGroupDto } from '../interfaces/public-group';
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
  // Every public group, member or not — GET /chats/public doesn't require
  // membership (see PublicGroupDto). This is what the Groups tab renders,
  // not the member-only subset of _chats, so groups you haven't joined yet
  // are actually discoverable.
  private readonly _publicGroups = signal<PublicGroupDto[]>([]);
  // Below xl, RightSidebar is otherwise unreachable (hidden ... xl:flex) —
  // this drives a full-screen toggle in its place, opened from a button in
  // the chat header. Irrelevant at xl+, where the sidebar is always visible
  // regardless of this flag.
  private readonly _mobileInfoOpen = signal(false);

  // "Chats" tab = direct chats + private groups.
  readonly chats = computed(() => this._chats().filter((c) => !c.isGroup || !c.isPublic));
  readonly publicGroups = this._publicGroups.asReadonly();
  readonly mobileInfoOpen = this._mobileInfoOpen.asReadonly();
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

    // Without these, a user who gets kicked or whose group gets deleted by the
    // owner just keeps sitting in that chat until they happen to reload — the
    // backend also force-unsubscribes the connection from the SignalR group
    // itself, so this is UI cleanup, not the only thing standing between them
    // and stale access. Payload shape doesn't matter here since both handlers
    // just drop the chat and refetch, same pattern as AddedToGroup.
    this.hub.on<{ chatId: string }>('RemovedFromGroup', (e) => void this.handleGoneChat(e.chatId));
    this.hub.on<{ chatId: string }>('ChatDeleted', (e) => void this.handleGoneChat(e.chatId));

    // Sent (best-effort) to the chat's group when someone leaves, so members
    // who still have it open see the roster update live instead of on next
    // reload — same refetch-on-event pattern as AddedToGroup.
    this.hub.on<{ chatId: string }>('GroupMemberRemoved', () => void this.loadChats());

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
    this._mobileInfoOpen.set(false);
    void this.hub.joinChatRoom(id).catch(() => {});
  }

  closeChat(): void {
    const previousId = this._selectedChatId();
    if (previousId) void this.hub.leaveChatRoom(previousId).catch(() => {});
    this._selectedChatId.set(null);
    this._mobileInfoOpen.set(false);
  }

  toggleMobileInfo(): void {
    this._mobileInfoOpen.update((v) => !v);
  }

  closeMobileInfo(): void {
    this._mobileInfoOpen.set(false);
  }

  async createDirectChat(targetUserId: string): Promise<void> {
    const { chatId } = await firstValueFrom(this.api.createDirectChat(targetUserId));
    await this.loadChats();
    this.selectChat(chatId);
  }

  async createGroupChat(name: string, memberIds?: string[], isPublic = false): Promise<void> {
    const { chatId } = await firstValueFrom(this.api.createGroupChat(name, memberIds, isPublic));
    await this.loadChats();
    this.selectChat(chatId);
  }

  async addMember(chatId: string, userId: string): Promise<void> {
    await firstValueFrom(this.api.addMember(chatId, userId));
    await this.loadChats();
  }

  // Owner-only, enforced by the backend — the button that calls this is
  // hidden client-side for non-owners, but the server must reject it too.
  async removeMember(chatId: string, userId: string): Promise<void> {
    await firstValueFrom(this.api.removeMember(chatId, userId));
    await this.loadChats();
  }

  // Owner-only, same caveat as removeMember.
  async deleteChat(chatId: string): Promise<void> {
    await firstValueFrom(this.api.deleteChat(chatId));
    await this.handleGoneChat(chatId);
  }

  async loadPublicGroups(search = ''): Promise<void> {
    const result = await firstValueFrom(this.api.getPublicGroups(search));
    this._publicGroups.set(result.items);
  }

  async joinGroup(chatId: string, search = ''): Promise<void> {
    await firstValueFrom(this.api.joinChat(chatId));
    await this.loadChats();
    await this.loadPublicGroups(search);
    this.selectChat(chatId);
  }

  // Self-removal — any member, not just the owner. The owner never reaches
  // this: the UI only shows "Delete" to them, and the backend would 400 anyway.
  async leaveChat(chatId: string): Promise<void> {
    await firstValueFrom(this.api.leaveChat(chatId));
    await this.handleGoneChat(chatId);
  }

  private async handleGoneChat(chatId: string): Promise<void> {
    if (this._selectedChatId() === chatId) {
      this.closeChat();
    }
    await this.loadChats();
    await this.loadPublicGroups();
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
