import { Component, computed, inject } from '@angular/core';
import { Icon } from '../icon/icon';
import { AuthService } from '../../core/auth/auth.service';
import { ChatStore } from '../../stores/chat.store';
import { UserStore } from '../../stores/user.store';
import { formatLastSeen, getInitials } from '../../shared/user-display';

@Component({
  selector: 'app-right-sidebar',
  imports: [Icon],
  templateUrl: './right-sidebar.html',
  styleUrl: './right-sidebar.css',
})
export class RightSidebar {
  private readonly auth = inject(AuthService);
  private readonly chatStore = inject(ChatStore);
  private readonly userStore = inject(UserStore);

  protected readonly currentUser = this.auth.currentUserProfile;
  protected readonly selectedChat = this.chatStore.selectedChat;
  protected readonly directCounterparts = this.chatStore.directCounterparts;
  protected readonly onlineFriends = this.userStore.onlineFriends;

  protected readonly getInitials = getInitials;
  protected readonly formatLastSeen = formatLastSeen;

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

  chatName(): string {
    const chat = this.selectedChat();
    if (!chat) return '';
    return chat.isGroup ? (chat.name ?? '') : (this.selectedChatContact()?.userName ?? '');
  }

  messageFriend(userId: string): void {
    void this.chatStore.createDirectChat(userId);
  }

  close(): void {
    this.chatStore.closeChat();
  }
}
