import { Component, computed, inject, signal } from '@angular/core';
import { Icon } from '../icon/icon';
import { MockDataService } from '../../services/mock-data.service';

type Tab = 'chats' | 'groups' | 'friends';

@Component({
  selector: 'app-left-sidebar',
  imports: [Icon],
  templateUrl: './left-sidebar.html',
  styleUrl: './left-sidebar.css',
})
export class LeftSidebar {
  private readonly data = inject(MockDataService);

  protected readonly tab = signal<Tab>('chats');
  protected readonly query = signal('');

  protected readonly chats = this.data.chats;
  protected readonly groups = this.data.groups;
  protected readonly friends = this.data.friends;
  protected readonly selectedChatId = this.data.selectedChatId;

  protected readonly filteredChats = computed(() =>
    this.chats().filter((c) => c.name.toLowerCase().includes(this.query().toLowerCase())),
  );
  protected readonly filteredGroups = computed(() =>
    this.groups().filter((c) => c.name.toLowerCase().includes(this.query().toLowerCase())),
  );
  protected readonly filteredFriends = computed(() =>
    this.friends().filter((u) => u.name.toLowerCase().includes(this.query().toLowerCase())),
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

  setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  selectChat(id: string): void {
    this.data.selectChat(id);
  }

  messageFriend(userId: string): void {
    this.data.openDirectChatWithUser(userId);
  }
}
