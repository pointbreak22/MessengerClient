import { Component, inject } from '@angular/core';
import { Header } from '../../components/header/header';
import { Icon } from '../../components/icon/icon';
import { LeftSidebar } from '../../components/left-sidebar/left-sidebar';
import { RightSidebar } from '../../components/right-sidebar/right-sidebar';
import { MockDataService } from '../../services/mock-data.service';
import { Chat } from '../chat/chat';

@Component({
  selector: 'app-dashboard',
  imports: [Header, LeftSidebar, RightSidebar, Chat, Icon],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly data = inject(MockDataService);
  protected readonly selectedChat = this.data.selectedChat;
}
