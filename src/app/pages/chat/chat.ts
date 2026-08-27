import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, ViewChild, afterRenderEffect, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Avatar } from '../../components/avatar/avatar';
import { Icon } from '../../components/icon/icon';
import { AuthService } from '../../core/auth/auth.service';
import { CallService } from '../../core/signalr/call.service';
import { GroupCallService } from '../../core/signalr/group-call.service';
import { AttachmentApiService } from '../../services/attachment-api.service';
import { CallPresenceStore, GroupCallActivity } from '../../stores/call-presence.store';
import { ChatStore } from '../../stores/chat.store';
import { MessageStore } from '../../stores/message.store';
import { ChatMessage } from '../../interfaces/chat-message';
import { attachmentIcon, attachmentKind, attachmentLabel } from '../../shared/attachment-display';
import { formatLastSeen, formatMessageTime, getInitials } from '../../shared/user-display';

// Mirrors AttachmentsController's limits — checked client-side first so a
// too-big/wrong-type file fails instantly instead of after a round trip.
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
];

@Component({
  selector: 'app-chat',
  imports: [FormsModule, Icon, Avatar],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class Chat {
  private readonly auth = inject(AuthService);
  private readonly chatStore = inject(ChatStore);
  private readonly messageStore = inject(MessageStore);
  private readonly attachmentApi = inject(AttachmentApiService);
  protected readonly call = inject(CallService);
  protected readonly groupCall = inject(GroupCallService);
  private readonly callPresence = inject(CallPresenceStore);

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

  protected readonly canCall = computed(() => {
    const chat = this.chat();
    return !!chat && !chat.isGroup && this.call.state() === 'idle';
  });

  // Group counterpart of canCall — every call currently running in this
  // group (there can be more than one in parallel). The header only has
  // room for a quick "join the first one" shortcut — RightSidebar's Group
  // info shows the full list with indices for picking a specific one.
  // Suppressed while I'm already on a call myself — GroupCallOverlay covers
  // that case full-screen already.
  protected readonly activeGroupCalls = computed(() => {
    const chat = this.chat();
    if (!chat?.isGroup || this.groupCall.state() !== 'idle') return [];
    return this.callPresence.activeCallsForChat(chat.id);
  });

  protected readonly draft = signal('');
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly highlightMessageId = signal<string | null>(null);
  protected readonly editingMessageId = signal<string | null>(null);
  protected readonly editDraft = signal('');
  protected readonly savingEdit = signal(false);

  protected readonly getInitials = getInitials;
  protected readonly formatLastSeen = formatLastSeen;
  protected readonly formatMessageTime = formatMessageTime;
  protected readonly attachmentKind = attachmentKind;
  protected readonly attachmentLabel = attachmentLabel;
  protected readonly attachmentIcon = attachmentIcon;

  constructor() {
    effect(() => {
      const chat = this.chat();
      if (!chat) return;
      void this.messageStore.loadMessages(chat.id);
      void this.messageStore.markRead(chat.id);
    });

    // Keep the thread pinned to the newest message — on chat switch, on
    // history load, and on every new incoming/outgoing message. Except when a
    // search result is waiting to be highlighted for this chat: then scroll
    // to that message instead, once it's actually in the rendered list.
    afterRenderEffect(() => {
      const msgs = this.messages();
      const el = this.messagesContainer?.nativeElement;
      if (!el) return;

      const pending = this.chatStore.pendingHighlight();
      if (pending && pending.chatId === this.chat()?.id) {
        const target = msgs.find((m) => m.id === pending.messageId);
        this.chatStore.clearPendingHighlight();
        if (target) {
          this.highlightMessageId.set(target.id);
          document.getElementById(`message-${target.id}`)?.scrollIntoView({ block: 'center' });
          setTimeout(() => this.highlightMessageId.set(null), 2000);
          return;
        }
      }

      el.scrollTop = el.scrollHeight;
    });
  }

  chatName(): string {
    const chat = this.chat();
    if (!chat) return '';
    return chat.isGroup ? (chat.name ?? '') : (this.directCounterparts()[chat.id]?.userName ?? '');
  }

  // Groups fall back to initials until a custom avatar is set.
  chatAvatarUrl(): string | null {
    const chat = this.chat();
    if (!chat) return null;
    return chat.isGroup ? chat.avatarUrl : (this.directCounterparts()[chat.id]?.avatarUrl ?? null);
  }

  isOwn(message: ChatMessage): boolean {
    return message.senderId === this.auth.currentUserProfile()?.id;
  }

  messageBubbleClass(message: ChatMessage): string {
    const base = this.isOwn(message)
      ? 'rounded-br-sm bg-gradient-to-br from-accent-500 to-accent2-500 text-white'
      : 'rounded-bl-sm border border-border bg-surface text-foreground';
    if (this.highlightMessageId() !== message.id) return base;
    return `${base} ring-2 ring-accent-400 ring-offset-2 ring-offset-background`;
  }

  senderName(message: ChatMessage): string {
    return this.chatStore.selectedChatMemberProfiles().find((m) => m.id === message.senderId)?.userName ?? '';
  }

  startEditMessage(message: ChatMessage): void {
    if (!this.isOwn(message)) return;
    this.editingMessageId.set(message.id);
    this.editDraft.set(message.text ?? '');
  }

  cancelEditMessage(): void {
    this.editingMessageId.set(null);
  }

  onEditDraftInput(event: Event): void {
    this.editDraft.set((event.target as HTMLInputElement).value);
  }

  async saveEditMessage(message: ChatMessage): Promise<void> {
    const text = this.editDraft().trim();
    if (!text || this.savingEdit()) return;

    this.savingEdit.set(true);
    try {
      await this.messageStore.editMessage(message.id, text);
      this.editingMessageId.set(null);
    } finally {
      this.savingEdit.set(false);
    }
  }

  deleteMessage(message: ChatMessage): void {
    if (!this.isOwn(message)) return;
    if (!confirm('Delete this message?')) return;
    void this.messageStore.deleteMessage(message.id);
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

  openGroupCallPicker(video: boolean): void {
    this.chatStore.openGroupCallPicker(video);
  }

  joinCall(call: GroupCallActivity): void {
    void this.groupCall.join(call.callId, call.chatId, call.isVideo);
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

    this.uploadError.set(null);

    if (file.size > MAX_ATTACHMENT_BYTES) {
      this.uploadError.set('File exceeds the 20 MB size limit.');
      return;
    }
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
      this.uploadError.set('That file type isn\'t supported (images, PDF, or MP4 only).');
      return;
    }

    this.uploading.set(true);
    try {
      const { url } = await firstValueFrom(this.attachmentApi.upload(file));
      await this.messageStore.sendMessage(chat.id, null, url);
    } catch (err) {
      this.uploadError.set(this.describeUploadError(err));
    } finally {
      this.uploading.set(false);
    }
  }

  dismissUploadError(): void {
    this.uploadError.set(null);
  }

  private describeUploadError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (typeof err.error === 'string' && err.error.trim()) return err.error;
      if (err.status === 503) return 'File uploads are temporarily unavailable — try again later.';
    }
    return 'Could not send the file. Please try again.';
  }
}
