import { Component, computed, inject, signal } from '@angular/core';
import { Icon } from '../icon/icon';
import { ChatStore } from '../../stores/chat.store';
import { UserStore } from '../../stores/user.store';
import { ChatSummary } from '../../interfaces/chat-summary';
import { formatLastSeen, getInitials } from '../../shared/user-display';

type Tab = 'chats' | 'groups' | 'friends';

@Component({
  selector: 'app-left-sidebar',
  imports: [Icon],
  templateUrl: './left-sidebar.html',
  styleUrl: './left-sidebar.css',
})
export class LeftSidebar {
  private readonly chatStore = inject(ChatStore);
  private readonly userStore = inject(UserStore);

  protected readonly tab = signal<Tab>('chats');
  protected readonly query = signal('');

  protected readonly chats = this.chatStore.chats;
  protected readonly groups = this.chatStore.groups;
  protected readonly friends = this.userStore.friends;
  protected readonly selectedChatId = this.chatStore.selectedChatId;
  protected readonly directCounterparts = this.chatStore.directCounterparts;

  protected readonly getInitials = getInitials;
  protected readonly formatLastSeen = formatLastSeen;

  protected readonly filteredChats = computed(() =>
    this.chats().filter((c) => this.chatName(c).toLowerCase().includes(this.query().toLowerCase())),
  );
  protected readonly filteredGroups = computed(() =>
    this.groups().filter((c) => this.chatName(c).toLowerCase().includes(this.query().toLowerCase())),
  );
  protected readonly filteredFriends = computed(() =>
    this.friends().filter((u) => u.userName.toLowerCase().includes(this.query().toLowerCase())),
  );

  protected readonly count = computed(() => {
    switch (this.tab()) {
      case 'chats':
        return this.chats().length;
      case 'groups':
        return this.groups().length;
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
  }

  onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  selectChat(id: string): void {
    this.chatStore.selectChat(id);
  }

  messageFriend(userId: string): void {
    void this.chatStore.createDirectChat(userId);
  }
}
