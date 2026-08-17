import { Component, computed, inject } from '@angular/core';
import { Icon } from '../icon/icon';
import { MockDataService } from '../../services/mock-data.service';

@Component({
  selector: 'app-right-sidebar',
  imports: [Icon],
  templateUrl: './right-sidebar.html',
  styleUrl: './right-sidebar.css',
})
export class RightSidebar {
  private readonly data = inject(MockDataService);

  protected readonly currentUser = this.data.currentUser;
  protected readonly selectedChat = this.data.selectedChat;
  protected readonly selectedChatContact = this.data.selectedChatContact;
  protected readonly selectedChatMembers = this.data.selectedChatMembers;
  protected readonly onlineFriends = this.data.onlineFriends;

  protected readonly memberCount = computed(() => this.selectedChatMembers().length + 1);

  messageFriend(userId: string): void {
    this.data.openDirectChatWithUser(userId);
  }

  close(): void {
    this.data.closeChat();
  }
}
