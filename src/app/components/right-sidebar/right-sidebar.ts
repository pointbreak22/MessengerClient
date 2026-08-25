import { Component, computed, inject, signal } from '@angular/core';
import { Avatar } from '../avatar/avatar';
import { Icon } from '../icon/icon';
import { AuthService } from '../../core/auth/auth.service';
import { CallService } from '../../core/signalr/call.service';
import { ChatStore } from '../../stores/chat.store';
import { MessageStore } from '../../stores/message.store';
import { UserStore } from '../../stores/user.store';
import { formatLastSeen, getInitials } from '../../shared/user-display';

@Component({
  selector: 'app-right-sidebar',
  imports: [Icon, Avatar],
  templateUrl: './right-sidebar.html',
  styleUrl: './right-sidebar.css',
})
export class RightSidebar {
  private readonly auth = inject(AuthService);
  private readonly chatStore = inject(ChatStore);
  private readonly userStore = inject(UserStore);
  private readonly messageStore = inject(MessageStore);
  protected readonly call = inject(CallService);

  protected readonly currentUser = this.auth.currentUserProfile;
  protected readonly selectedChat = this.chatStore.selectedChat;
  protected readonly directCounterparts = this.chatStore.directCounterparts;
  protected readonly onlineFriends = this.userStore.onlineFriends;
  // Below xl this aside is otherwise unreachable (hidden ... xl:flex) — this
  // flag, toggled from a button in the chat header, makes it take over
  // full-screen there instead.
  protected readonly mobileInfoOpen = this.chatStore.mobileInfoOpen;
  // Adding a member searches all users (not just friends) — anyone can add
  // anyone. Removing/deleting is owner-only, gated by isOwner() below.
  protected readonly memberSearchResults = this.userStore.searchResults;

  protected readonly getInitials = getInitials;
  protected readonly formatLastSeen = formatLastSeen;

  protected readonly showAddMember = signal(false);
  protected readonly addMemberQuery = signal('');
  private addMemberDebounce?: ReturnType<typeof setTimeout>;

  protected readonly isOwner = computed(() => {
    const chat = this.selectedChat();
    const myId = this.currentUser()?.id;
    return !!chat && chat.isGroup && !!myId && chat.ownerId === myId;
  });

  protected readonly selectedChatContact = computed(() => {
    const chat = this.selectedChat();
    if (!chat || chat.isGroup) return null;
    return this.directCounterparts()[chat.id] ?? null;
  });

  // Group members excluding the current user.
  protected readonly otherMembers = computed(() => {
    const myId = this.currentUser()?.id;
    return this.chatStore.selectedChatMemberProfiles().filter((m) => m.id !== myId);
  });

  // Derived from whatever message history is already loaded for this chat —
  // there's no dedicated "list attachments" endpoint, so older attachments
  // outside the loaded page of history won't show up here yet.
  protected readonly sharedMedia = computed(() => {
    const chat = this.selectedChat();
    if (!chat) return [];
    return this.messageStore
      .messagesFor(chat.id)()
      .filter((m) => !!m.attachmentUrl);
  });

  isImageAttachment(url: string): boolean {
    return /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url);
  }

  startCall(video: boolean): void {
    const chat = this.selectedChat();
    const contactId = this.selectedChatContact()?.id;
    if (!chat || chat.isGroup || !contactId) return;
    void this.call.startCall(contactId, chat.id, video);
  }

  chatName(): string {
    const chat = this.selectedChat();
    if (!chat) return '';
    return chat.isGroup ? (chat.name ?? '') : (this.selectedChatContact()?.userName ?? '');
  }

  // null for groups — no group avatar concept, Avatar falls back to initials.
  chatAvatarUrl(): string | null {
    const chat = this.selectedChat();
    if (!chat || chat.isGroup) return null;
    return this.selectedChatContact()?.avatarUrl ?? null;
  }

  messageFriend(userId: string): void {
    void this.chatStore.createDirectChat(userId);
  }

  close(): void {
    this.chatStore.closeChat();
  }

  // Distinct from close(): this only collapses the mobile info overlay back
  // to the chat, it doesn't deselect the conversation.
  backToChat(): void {
    this.chatStore.closeMobileInfo();
  }

  toggleAddMember(): void {
    const next = !this.showAddMember();
    this.showAddMember.set(next);
    if (!next) {
      this.addMemberQuery.set('');
      this.userStore.clearSearchResults();
    }
  }

  onAddMemberQueryInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.addMemberQuery.set(value);
    clearTimeout(this.addMemberDebounce);
    if (!value.trim()) {
      this.userStore.clearSearchResults();
      return;
    }
    this.addMemberDebounce = setTimeout(() => void this.userStore.searchUsers(value), 300);
  }

  isMember(userId: string): boolean {
    return this.chatStore.selectedChatMemberProfiles().some((m) => m.id === userId);
  }

  addMember(userId: string): void {
    const chat = this.selectedChat();
    if (!chat) return;
    void this.chatStore.addMember(chat.id, userId);
  }

  removeMember(userId: string): void {
    const chat = this.selectedChat();
    if (!chat || !this.isOwner()) return;
    void this.chatStore.removeMember(chat.id, userId);
  }

  deleteGroup(): void {
    const chat = this.selectedChat();
    if (!chat || !this.isOwner()) return;
    void this.chatStore.deleteChat(chat.id);
  }

  leaveGroup(): void {
    const chat = this.selectedChat();
    if (!chat || this.isOwner()) return;
    void this.chatStore.leaveChat(chat.id);
  }
}
