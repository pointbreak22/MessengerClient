import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HubConnectionState } from '@microsoft/signalr';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { ChatHubService } from '../core/signalr/chat-hub.service';
import { ChatApiService } from '../services/chat-api.service';
import { UserApiService } from '../services/user-api.service';
import { AddedToGroupEvent, ChatUpdatedEvent } from '../interfaces/hub-events';
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
  // Set by header search when a message result is clicked — Chat reads this
  // once its history for that chat has loaded, and scrolls/highlights the
  // message if it's among what got fetched (only the most recent page is
  // loaded up front, so an older match just falls back to opening the chat).
  private readonly _pendingHighlight = signal<{ chatId: string; messageId: string } | null>(null);
  // Toggled by the "start group call" buttons in Chat/RightSidebar — read by
  // GroupCallPicker, which is mounted once in Dashboard. Which of the two
  // buttons (call vs video call) was clicked decides groupCallPickerVideo,
  // so the picker doesn't need to ask the call-type question a second time.
  private readonly _showGroupCallPicker = signal(false);
  private readonly _groupCallPickerVideo = signal(false);

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
  readonly pendingHighlight = this._pendingHighlight.asReadonly();
  readonly showGroupCallPicker = this._showGroupCallPicker.asReadonly();
  readonly groupCallPickerVideo = this._groupCallPickerVideo.asReadonly();

  // A popular public group can see many joins/leaves in a short burst (e.g.
  // 100 people joining around the same time) — refetching once per event, per
  // every client watching that group, would multiply into thousands of
  // GET /chats/me calls in a few seconds. Coalescing rapid-fire events into
  // one refresh keeps that at a handful of calls regardless of burst size.
  private refreshDebounceTimer?: ReturnType<typeof setTimeout>;
  private static readonly REFRESH_DEBOUNCE_MS = 400;

  constructor() {
    // Payload has chatId/chatName but not members/createdAt/ownerId, so a full
    // refetch is simpler and more correct than fabricating a partial ChatSummary.
    this.hub.on<AddedToGroupEvent>('AddedToGroup', () => this.scheduleChatsRefresh());

    // Without these, a user who gets kicked or whose group gets deleted by the
    // owner just keeps sitting in that chat until they happen to reload — the
    // backend also force-unsubscribes the connection from the SignalR group
    // itself, so this is UI cleanup, not the only thing standing between them
    // and stale access. Not debounced like the events below — this is about
    // *my own* membership changing, so it should react immediately rather
    // than wait out a coalescing window.
    this.hub.on<{ chatId: string }>('RemovedFromGroup', (e) => void this.handleGoneChat(e.chatId));
    this.hub.on<{ chatId: string }>('ChatDeleted', (e) => void this.handleGoneChat(e.chatId));

    // Sent (best-effort) to the chat's group when someone leaves/joins, so
    // members who still have it open see the roster update live instead of
    // on next reload. Both confirmed: JoinGroupCommandHandler/AddMemberCommandHandler
    // commit the membership row before sending this, so a refetch on receipt
    // never races ahead of the write.
    this.hub.on<{ chatId: string }>('GroupMemberRemoved', () => this.scheduleChatsRefresh());
    this.hub.on<{ chatId: string }>('GroupMemberAdded', () => this.scheduleChatsRefresh());

    // Pushed to every member (including whoever made the change) — patched
    // in directly rather than a full refetch, and reaches the actor too so
    // renameChat()/uploadGroupAvatar() don't need to update state themselves.
    this.hub.on<ChatUpdatedEvent>('ChatUpdated', (e) => {
      this._chats.update((chats) =>
        chats.map((c) => (c.id === e.chatId ? { ...c, name: e.name, avatarUrl: e.avatarUrl } : c)),
      );
    });

    // UserStore.setPresence only patches its own _friends list — this store
    // caches its own separate UserProfile snapshots (direct-chat counterparts,
    // selected chat's member list) resolved once via getUserById, which were
    // never being kept in sync with these events. Without this, the online
    // dot in a chat header or a group's member list would go stale the moment
    // you resolved it once, even though the same person's row in the Friends
    // tab kept updating live.
    this.hub.on<string>('UserWentOnline', (userId) => this.setMemberPresence(userId, true));
    this.hub.on<string>('UserWentOffline', (userId) => this.setMemberPresence(userId, false));

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

  // Unfiltered lookup by id — chats() drops public groups you're a member of
  // (that's the Chats-tab-vs-Groups-tab split), but callers like GroupCallOverlay
  // need any chat regardless of which tab it'd show up in.
  chatById(id: string): ChatSummary | null {
    return this._chats().find((c) => c.id === id) ?? null;
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

  // Used by header search: open the chat a matched message belongs to, and
  // remember which message to try to scroll to/highlight once it renders.
  openMessage(chatId: string, messageId: string): void {
    this.selectChat(chatId);
    this._pendingHighlight.set({ chatId, messageId });
  }

  clearPendingHighlight(): void {
    this._pendingHighlight.set(null);
  }

  openGroupCallPicker(video: boolean): void {
    this._groupCallPickerVideo.set(video);
    this._showGroupCallPicker.set(true);
  }

  closeGroupCallPicker(): void {
    this._showGroupCallPicker.set(false);
  }

  // unreadCount only ever arrives via GET /chats/me — nothing pushes updates
  // to it over SignalR, so MessageStore calls these directly on NewMessage /
  // markRead so the badge in the chat list reacts without a full refetch.
  incrementUnread(chatId: string): void {
    this._chats.update((chats) =>
      chats.map((c) => (c.id === chatId ? { ...c, unreadCount: c.unreadCount + 1 } : c)),
    );
  }

  clearUnread(chatId: string): void {
    this._chats.update((chats) =>
      chats.map((c) => (c.id === chatId && c.unreadCount ? { ...c, unreadCount: 0 } : c)),
    );
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

  // Any member can rename/re-avatar a group, not just the owner. No local
  // state mutation here — the ChatUpdated push (sent to every member
  // including the caller) is what actually updates _chats.
  async renameChat(chatId: string, name: string): Promise<void> {
    await firstValueFrom(this.api.renameChat(chatId, name));
  }

  async uploadGroupAvatar(chatId: string, file: File): Promise<void> {
    await firstValueFrom(this.api.uploadGroupAvatar(chatId, file));
  }

  async removeGroupAvatar(chatId: string): Promise<void> {
    await firstValueFrom(this.api.deleteGroupAvatar(chatId));
  }

  private setMemberPresence(userId: string, isOnline: boolean): void {
    // _directCounterparts is keyed by chatId, not userId — find the entry
    // whose counterpart *is* this user (there's at most one, direct chats
    // are unique per pair).
    this._directCounterparts.update((map) => {
      let changed = false;
      const next: Record<string, UserProfile> = {};
      for (const [chatId, profile] of Object.entries(map)) {
        if (profile.id === userId && profile.isOnline !== isOnline) {
          next[chatId] = { ...profile, isOnline };
          changed = true;
        } else {
          next[chatId] = profile;
        }
      }
      return changed ? next : map;
    });

    this._selectedChatMemberProfiles.update((list) => {
      if (!list.some((m) => m.id === userId && m.isOnline !== isOnline)) return list;
      return list.map((m) => (m.id === userId ? { ...m, isOnline } : m));
    });
  }

  private scheduleChatsRefresh(): void {
    clearTimeout(this.refreshDebounceTimer);
    this.refreshDebounceTimer = setTimeout(() => void this.loadChats(), ChatStore.REFRESH_DEBOUNCE_MS);
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
