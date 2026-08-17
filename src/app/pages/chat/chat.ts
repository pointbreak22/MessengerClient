import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from '../../components/icon/icon';
import { MockDataService } from '../../services/mock-data.service';

@Component({
  selector: 'app-chat',
  imports: [FormsModule, Icon],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class Chat {
  private readonly data = inject(MockDataService);

  protected readonly chat = this.data.selectedChat;
  protected readonly messages = this.data.selectedChatMessages;
  protected readonly selectedChatContact = this.data.selectedChatContact;
  protected readonly selectedChatMembers = this.data.selectedChatMembers;

  protected readonly memberCount = computed(() => this.selectedChatMembers().length + 1);

  protected readonly draft = signal('');

  send(): void {
    const chat = this.chat();
    if (!chat) return;
    this.data.sendMessage(chat.id, this.draft());
    this.draft.set('');
  }

  onEnter(event: Event): void {
    event.preventDefault();
    this.send();
  }

  close(): void {
    this.data.closeChat();
  }
}
