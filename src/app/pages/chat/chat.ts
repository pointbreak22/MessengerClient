import { Component, ElementRef, ViewChild, afterRenderEffect, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Icon } from '../../components/icon/icon';
import { AuthService } from '../../core/auth/auth.service';
import { CallService } from '../../core/signalr/call.service';
import { AttachmentApiService } from '../../services/attachment-api.service';
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
  private readonly attachmentApi = inject(AttachmentApiService);
  protected readonly call = inject(CallService);

  @ViewChild('fileInput') private readonly fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('messagesContainer') private readonly messagesContainer?: ElementRef<HTMLDivElement>;

  protected readonly chat = this.chatStore.selectedChat;
  protected readonly directCounterparts = this.chatStore.directCounterparts;
  protected readonly memberCount = computed(() => this.chatStore.selectedChatMemberProfiles().length);

  // MessageStore keeps history newest-first (matches the API's paging cursor,
  // which walks backward from the newest message) — reversed here purely for
  // display, so the thread reads top-to-bottom like a normal chat.
  protected readonly messages = computed(() => {
    const chat = this.chat();
    if (!chat) return [];
    return [...this.messageStore.messagesFor(chat.id)()].reverse();
  });

  // 1:1 only — a group call needs an SFU/media server, not just SignalR
  // signaling, so calling is limited to direct chats for now.
  protected readonly canCall = computed(() => {
    const chat = this.chat();
    return !!chat && !chat.isGroup && this.call.state() === 'idle';
  });

  protected readonly draft = signal('');
  protected readonly uploading = signal(false);

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

    // Keep the thread pinned to the newest message — on chat switch, on
    // history load, and on every new incoming/outgoing message.
    afterRenderEffect(() => {
      this.messages();
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
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

  // Below xl, RightSidebar is otherwise unreachable — this opens it as a
  // full-screen overlay in place of the chat (see RightSidebar.backToChat()
  // for the way back).
  openInfo(): void {
    this.chatStore.toggleMobileInfo();
  }

  startCall(video: boolean): void {
    const chat = this.chat();
    if (!chat || chat.isGroup) return;
    const counterpartId = this.directCounterparts()[chat.id]?.id;
    if (!counterpartId) return;
    void this.call.startCall(counterpartId, chat.id, video);
  }

  triggerAttach(): void {
    if (this.uploading()) return;
    this.fileInput.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file next time
    const chat = this.chat();
    if (!file || !chat) return;

    this.uploading.set(true);
    try {
      const { url } = await firstValueFrom(this.attachmentApi.upload(file));
      await this.messageStore.sendMessage(chat.id, null, url);
    } finally {
      this.uploading.set(false);
    }
  }
}
