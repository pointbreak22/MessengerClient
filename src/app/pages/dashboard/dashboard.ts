import { Component, OnDestroy, effect, inject } from '@angular/core';
import { CallOverlay } from '../../components/call-overlay/call-overlay';
import { Header } from '../../components/header/header';
import { Icon } from '../../components/icon/icon';
import { LeftSidebar } from '../../components/left-sidebar/left-sidebar';
import { RightSidebar } from '../../components/right-sidebar/right-sidebar';
import { AuthService } from '../../core/auth/auth.service';
import { ChatHubService } from '../../core/signalr/chat-hub.service';
import { ChatStore } from '../../stores/chat.store';
import { UserStore } from '../../stores/user.store';
import { Chat } from '../chat/chat';

@Component({
  selector: 'app-dashboard',
  imports: [Header, LeftSidebar, RightSidebar, Chat, Icon, CallOverlay],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnDestroy {
  private readonly chatStore = inject(ChatStore);
  private readonly userStore = inject(UserStore);
  private readonly hub = inject(ChatHubService);
  private readonly auth = inject(AuthService);

  protected readonly selectedChat = this.chatStore.selectedChat;

  constructor() {
    // This route is behind MsalGuard, so we're always authenticated here —
    // on mount. But MsalGuard only re-checks on navigation, not continuously:
    // if the MSAL session dies in the background while this tab stays open
    // (AuthService.getAccessToken() catches InteractionRequiredAuthError and
    // flips isAuthenticated to false, without redirecting itself — see that
    // method's comment for why), nothing else would ever send the user back
    // to login. This is the single, uncontested place that does — unlike
    // MsalGuard's own redirect, there's nothing else racing it at this point.
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.auth.login();
      }
    });

    void this.hub.connect();
    void this.chatStore.loadChats();
    void this.userStore.loadFriends();
    void this.userStore.loadFriendRequests();
  }

  ngOnDestroy(): void {
    void this.hub.disconnect();
  }
}
