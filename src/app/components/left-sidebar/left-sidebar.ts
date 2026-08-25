import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Icon } from '../icon/icon';
import { ChatStore } from '../../stores/chat.store';
import { UserStore } from '../../stores/user.store';
import { ChatSummary } from '../../interfaces/chat-summary';
import { formatLastSeen, getInitials } from '../../shared/user-display';

type Tab = 'chats' | 'groups' | 'friends';

@Component({
  selector: 'app-left-sidebar',
  imports: [Icon, NgTemplateOutlet],
  templateUrl: './left-sidebar.html',
  styleUrl: './left-sidebar.css',
})
export class LeftSidebar {
  private readonly chatStore = inject(ChatStore);
  private readonly userStore = inject(UserStore);

  private searchDebounce?: ReturnType<typeof setTimeout>;

  protected readonly tab = signal<Tab>('chats');
  protected readonly query = signal('');
  protected readonly showCreateGroup = signal(false);
  protected readonly groupName = signal('');
  protected readonly selectedMemberIds = signal<ReadonlySet<string>>(new Set());
  protected readonly showAddFriends = signal(false);
  protected readonly addFriendsQuery = signal('');

  protected readonly chats = this.chatStore.chats;
  protected readonly publicGroups = this.chatStore.publicGroups;
  protected readonly friends = this.userStore.friends;
  protected readonly selectedChatId = this.chatStore.selectedChatId;
  private readonly mobileInfoOpen = this.chatStore.mobileInfoOpen;

  // Same reasoning as Dashboard.mainDisplayClass: below xl, the info panel
  // (opened from the chat header) takes over full-screen, so this hides too —
  // otherwise it'd still be forced visible by its own md:flex two-pane rule.
  protected readonly asideDisplayClass = computed(() => {
    if (this.mobileInfoOpen()) return 'hidden';
    return this.selectedChatId() ? 'hidden md:flex' : 'flex';
  });
  protected readonly directCounterparts = this.chatStore.directCounterparts;
  protected readonly incomingRequests = this.userStore.incomingRequests;
  protected readonly requestSenders = this.userStore.requestSenders;
  protected readonly searchResults = this.userStore.searchResults;
  protected readonly sentRequestIds = this.userStore.sentRequestIds;

  protected readonly getInitials = getInitials;
  protected readonly formatLastSeen = formatLastSeen;

  protected readonly filteredChats = computed(() =>
    this.chats().filter((c) => this.chatName(c).toLowerCase().includes(this.query().toLowerCase())),
  );
  protected readonly filteredFriends = computed(() =>
    this.friends().filter((u) => u.userName.toLowerCase().includes(this.query().toLowerCase())),
  );
  protected readonly canCreateGroup = computed(
    () => this.groupName().trim().length > 0 && this.selectedMemberIds().size > 0,
  );

  protected readonly count = computed(() => {
    switch (this.tab()) {
      case 'chats':
        return this.chats().length;
      case 'groups':
        return this.publicGroups().length;
      case 'friends':
        return this.friends().length;
    }
  });

  chatName(chat: ChatSummary): string {
    return chat.isGroup ? (chat.name ?? '') : (this.directCounterparts()[chat.id]?.userName ?? '');
  }

  chatInitials(chat: ChatSummary): string {
    return getInitials(this.chatName(chat));
  }

  chatIsOnline(chat: ChatSummary): boolean {
    return !chat.isGroup && (this.directCounterparts()[chat.id]?.isOnline ?? false);
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'friends') {
      void this.userStore.loadFriendRequests();
    } else if (tab === 'groups') {
      void this.chatStore.loadPublicGroups(this.query());
    }
  }

  onQueryInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);

    if (this.tab() !== 'groups') return;
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => void this.chatStore.loadPublicGroups(value), 300);
  }

  selectChat(id: string): void {
    this.chatStore.selectChat(id);
  }

  messageFriend(userId: string): void {
    void this.chatStore.createDirectChat(userId);
  }

  isFriend(userId: string): boolean {
    return this.friends().some((f) => f.id === userId);
  }

  isPending(userId: string): boolean {
    return this.sentRequestIds().has(userId);
  }

  requestSenderName(fromUserId: string): string {
    return this.requestSenders()[fromUserId]?.userName ?? '';
  }

  sendFriendRequest(userId: string): void {
    void this.userStore.sendFriendRequest(userId);
  }

  acceptRequest(fromUserId: string): void {
    void this.userStore.acceptFriendRequest(fromUserId);
  }

  declineRequest(fromUserId: string): void {
    void this.userStore.removeFriend(fromUserId);
  }

  removeFriend(friendId: string): void {
    void this.userStore.removeFriend(friendId);
  }

  toggleCreateGroup(): void {
    const next = !this.showCreateGroup();
    this.showCreateGroup.set(next);
    if (!next) {
      this.groupName.set('');
      this.selectedMemberIds.set(new Set());
    }
  }

  onGroupNameInput(event: Event): void {
    this.groupName.set((event.target as HTMLInputElement).value);
  }

  isSelectedMember(userId: string): boolean {
    return this.selectedMemberIds().has(userId);
  }

  toggleMember(userId: string): void {
    this.selectedMemberIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async submitCreateGroup(): Promise<void> {
    if (!this.canCreateGroup()) return;
    // No public/private toggle in the form — it's implied by which tab the
    // panel was opened from: a multichat started from Chats is private, one
    // started from Groups is public. Same panel, same submit, different flag.
    const isPublic = this.tab() === 'groups';
    await this.chatStore.createGroupChat(this.groupName().trim(), [...this.selectedMemberIds()], isPublic);
    if (isPublic) {
      void this.chatStore.loadPublicGroups(this.query());
    }
    this.toggleCreateGroup();
  }

  joinGroup(chatId: string): void {
    void this.chatStore.joinGroup(chatId, this.query());
  }

  toggleAddFriends(): void {
    const next = !this.showAddFriends();
    this.showAddFriends.set(next);
    if (!next) {
      this.addFriendsQuery.set('');
      this.userStore.clearSearchResults();
    }
  }

  onAddFriendsQueryInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.addFriendsQuery.set(value);
    clearTimeout(this.searchDebounce);
    if (!value.trim()) {
      this.userStore.clearSearchResults();
      return;
    }
    this.searchDebounce = setTimeout(() => void this.userStore.searchUsers(value), 300);
  }
}
