import { Component, OnDestroy, inject } from '@angular/core';
import { Header } from '../../components/header/header';
import { Icon } from '../../components/icon/icon';
import { LeftSidebar } from '../../components/left-sidebar/left-sidebar';
import { RightSidebar } from '../../components/right-sidebar/right-sidebar';
import { ChatHubService } from '../../core/signalr/chat-hub.service';
import { ChatStore } from '../../stores/chat.store';
import { UserStore } from '../../stores/user.store';
import { Chat } from '../chat/chat';

@Component({
  selector: 'app-dashboard',
  imports: [Header, LeftSidebar, RightSidebar, Chat, Icon],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnDestroy {
  private readonly chatStore = inject(ChatStore);
  private readonly userStore = inject(UserStore);
  private readonly hub = inject(ChatHubService);

  protected readonly selectedChat = this.chatStore.selectedChat;

  constructor() {
    // This route is behind MsalGuard, so we're always authenticated here.
    void this.hub.connect();
    void this.chatStore.loadChats();
    void this.userStore.loadFriends();
    void this.userStore.loadFriendRequests();
  }

  ngOnDestroy(): void {
    void this.hub.disconnect();
  }
}
