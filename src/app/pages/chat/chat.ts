import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from '../../components/icon/icon';
import { AuthService } from '../../core/auth/auth.service';
import { ChatStore } from '../../stores/chat.store';
import { MessageStore } from '../../stores/message.store';
import { ChatMessage } from '../../interfaces/chat-message';
import { formatLastSeen, formatMessageTime, getInitials } from '../../shared/user-display';

@Component({
  selector: 'app-chat',
  imports: [FormsModule, Icon],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class Chat {
  private readonly auth = inject(AuthService);
  private readonly chatStore = inject(ChatStore);
  private readonly messageStore = inject(MessageStore);

  protected readonly chat = this.chatStore.selectedChat;
  protected readonly directCounterparts = this.chatStore.directCounterparts;
  protected readonly memberCount = computed(() => this.chatStore.selectedChatMemberProfiles().length);

  protected readonly messages = computed(() => {
    const chat = this.chat();
    return chat ? this.messageStore.messagesFor(chat.id)() : [];
  });

  protected readonly draft = signal('');

  protected readonly getInitials = getInitials;
  protected readonly formatLastSeen = formatLastSeen;
  protected readonly formatMessageTime = formatMessageTime;

  constructor() {
    effect(() => {
      const chat = this.chat();
      if (!chat) return;
      void this.messageStore.loadMessages(chat.id);
      void this.messageStore.markRead(chat.id);
    });
  }

  chatName(): string {
    const chat = this.chat();
    if (!chat) return '';
    return chat.isGroup ? (chat.name ?? '') : (this.directCounterparts()[chat.id]?.userName ?? '');
  }

  isOwn(message: ChatMessage): boolean {
    return message.senderId === this.auth.currentUserProfile()?.id;
  }

  senderName(message: ChatMessage): string {
    return this.chatStore.selectedChatMemberProfiles().find((m) => m.id === message.senderId)?.userName ?? '';
  }

  send(): void {
    const chat = this.chat();
    const text = this.draft().trim();
    if (!chat || !text) return;
    void this.messageStore.sendMessage(chat.id, text);
    this.draft.set('');
  }

  onEnter(event: Event): void {
    event.preventDefault();
    this.send();
  }

  close(): void {
    this.chatStore.closeChat();
  }
}
