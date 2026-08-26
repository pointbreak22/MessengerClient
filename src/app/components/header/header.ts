import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { MessageApiService } from '../../services/message-api.service';
import { UserApiService } from '../../services/user-api.service';
import { ChatStore } from '../../stores/chat.store';
import { UserStore } from '../../stores/user.store';
import { Avatar } from '../avatar/avatar';
import { Icon } from '../icon/icon';
import { ChatMessage } from '../../interfaces/chat-message';
import { ChatSummary } from '../../interfaces/chat-summary';
import { getInitials } from '../../shared/user-display';

@Component({
  selector: 'app-header',
  imports: [Icon, Avatar],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private readonly auth = inject(AuthService);
  private readonly userApi = inject(UserApiService);
  private readonly messageApi = inject(MessageApiService);
  private readonly userStore = inject(UserStore);
  private readonly chatStore = inject(ChatStore);

  private messageSearchDebounce?: ReturnType<typeof setTimeout>;
  private messageSearchToken = 0;

  @ViewChild('avatarFileInput') private readonly avatarFileInput!: ElementRef<HTMLInputElement>;

  protected readonly currentUser = this.auth.currentUserProfile;
  protected readonly getInitials = getInitials;

  protected readonly incomingRequests = this.userStore.incomingRequests;
  protected readonly requestSenders = this.userStore.requestSenders;

  protected readonly showProfileMenu = signal(false);
  protected readonly showNotifications = signal(false);
  protected readonly uploadingAvatar = signal(false);
  protected readonly editingName = signal(false);
  protected readonly nameDraft = signal('');
  protected readonly savingName = signal(false);

  protected readonly searchQuery = signal('');
  protected readonly showSearchDropdown = signal(false);

  private readonly chats = this.chatStore.chats;
  private readonly friends = this.userStore.friends;
  private readonly directCounterparts = this.chatStore.directCounterparts;

  // Friends who already have a direct chat show up via matchedChats instead —
  // this avoids listing the same person twice under two different sections.
  private readonly directChatUserIds = computed(() => {
    const counterparts = this.directCounterparts();
    return new Set(
      this.chats()
        .filter((c) => !c.isGroup)
        .map((c) => counterparts[c.id]?.id)
        .filter((id): id is string => !!id),
    );
  });

  protected readonly matchedChats = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return [];
    return this.chats()
      .filter((c) => this.chatDisplayName(c).toLowerCase().includes(q))
      .slice(0, 6);
  });

  protected readonly matchedFriends = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return [];
    const existing = this.directChatUserIds();
    return this.friends()
      .filter((f) => !existing.has(f.id) && f.userName.toLowerCase().includes(q))
      .slice(0, 6);
  });

  protected readonly matchedMessages = signal<ChatMessage[]>([]);
  protected readonly searchingMessages = signal(false);

  messageChatName(message: ChatMessage): string {
    const chat = this.chats().find((c) => c.id === message.chatId);
    return chat ? this.chatDisplayName(chat) : 'Chat';
  }

  chatDisplayName(chat: ChatSummary): string {
    return chat.isGroup ? (chat.name ?? '') : (this.directCounterparts()[chat.id]?.userName ?? '');
  }

  chatAvatarUrl(chat: ChatSummary): string | null {
    return chat.isGroup ? null : (this.directCounterparts()[chat.id]?.avatarUrl ?? null);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    const trimmed = value.trim();
    this.showSearchDropdown.set(trimmed.length > 0);

    clearTimeout(this.messageSearchDebounce);
    if (!trimmed) {
      this.matchedMessages.set([]);
      this.searchingMessages.set(false);
      return;
    }
    this.searchingMessages.set(true);
    this.messageSearchDebounce = setTimeout(() => void this.runMessageSearch(trimmed), 300);
  }

  private async runMessageSearch(query: string): Promise<void> {
    const token = ++this.messageSearchToken;
    try {
      const results = await firstValueFrom(this.messageApi.searchMessages(query));
      if (token !== this.messageSearchToken) return; // a newer keystroke already superseded this request
      this.matchedMessages.set(results);
    } finally {
      if (token === this.messageSearchToken) this.searchingMessages.set(false);
    }
  }

  openSearchDropdown(): void {
    if (this.searchQuery().trim()) this.showSearchDropdown.set(true);
  }

  closeSearchDropdown(): void {
    this.showSearchDropdown.set(false);
  }

  selectChatResult(chatId: string): void {
    this.chatStore.selectChat(chatId);
    this.clearSearch();
  }

  selectFriendResult(userId: string): void {
    void this.chatStore.createDirectChat(userId);
    this.clearSearch();
  }

  selectMessageResult(message: ChatMessage): void {
    this.chatStore.openMessage(message.chatId, message.id);
    this.clearSearch();
  }

  private clearSearch(): void {
    this.searchQuery.set('');
    this.showSearchDropdown.set(false);
    this.matchedMessages.set([]);
    this.searchingMessages.set(false);
  }

  toggleNotifications(): void {
    const next = !this.showNotifications();
    this.showNotifications.set(next);
    if (next) this.showProfileMenu.set(false);
  }

  closeNotifications(): void {
    this.showNotifications.set(false);
  }

  requestSenderName(fromUserId: string): string {
    return this.requestSenders()[fromUserId]?.userName ?? '';
  }

  requestSenderAvatarUrl(fromUserId: string): string | null {
    return this.requestSenders()[fromUserId]?.avatarUrl ?? null;
  }

  acceptRequest(fromUserId: string): void {
    void this.userStore.acceptFriendRequest(fromUserId);
  }

  declineRequest(fromUserId: string): void {
    void this.userStore.removeFriend(fromUserId);
  }

  signOut(): void {
    this.auth.logout();
  }

  toggleProfileMenu(): void {
    const next = !this.showProfileMenu();
    this.showProfileMenu.set(next);
    if (next) this.showNotifications.set(false);
    if (!next) this.editingName.set(false);
  }

  closeProfileMenu(): void {
    this.showProfileMenu.set(false);
    this.editingName.set(false);
  }

  triggerAvatarUpload(): void {
    if (this.uploadingAvatar()) return;
    this.avatarFileInput.nativeElement.click();
  }

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file next time
    if (!file) return;

    this.uploadingAvatar.set(true);
    try {
      const { avatarUrl } = await firstValueFrom(this.userApi.uploadAvatar(file));
      this.auth.updateProfile({ avatarUrl });
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  async removeAvatar(): Promise<void> {
    if (this.uploadingAvatar()) return;
    this.uploadingAvatar.set(true);
    try {
      await firstValueFrom(this.userApi.deleteAvatar());
      this.auth.updateProfile({ avatarUrl: null });
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  startEditName(): void {
    this.nameDraft.set(this.currentUser()?.userName ?? '');
    this.editingName.set(true);
  }

  cancelEditName(): void {
    this.editingName.set(false);
  }

  onNameDraftInput(event: Event): void {
    this.nameDraft.set((event.target as HTMLInputElement).value);
  }

  async saveName(): Promise<void> {
    const userName = this.nameDraft().trim();
    if (!userName || this.savingName()) return;

    this.savingName.set(true);
    try {
      await firstValueFrom(this.userApi.updateMe(userName));
      this.auth.updateProfile({ userName });
      this.editingName.set(false);
    } finally {
      this.savingName.set(false);
    }
  }
}
