import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, ViewChild, afterRenderEffect, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NgTemplateOutlet } from '@angular/common';
import { Avatar } from '../../components/avatar/avatar';
import { EmojiPicker } from '../../components/emoji-picker/emoji-picker';
import { Icon } from '../../components/icon/icon';
import { AuthService } from '../../core/auth/auth.service';
import { CallService } from '../../core/signalr/call.service';
import { ChatHubService } from '../../core/signalr/chat-hub.service';
import { GroupCallService } from '../../core/signalr/group-call.service';
import { AttachmentApiService } from '../../services/attachment-api.service';
import { CallPresenceStore, GroupCallActivity } from '../../stores/call-presence.store';
import { ChatStore } from '../../stores/chat.store';
import { MessageStore } from '../../stores/message.store';
import { SettingsStore } from '../../stores/settings.store';
import { TypingStore } from '../../stores/typing.store';
import { ChatMessage } from '../../interfaces/chat-message';
import { ChatSummary } from '../../interfaces/chat-summary';
import { attachmentIcon, attachmentKind, attachmentLabel } from '../../shared/attachment-display';
import { callEventLabel, parseCallEvent } from '../../shared/call-event-display';
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
  imports: [FormsModule, Icon, Avatar, EmojiPicker, NgTemplateOutlet],
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
  private readonly hub = inject(ChatHubService);
  private readonly typingStore = inject(TypingStore);
  protected readonly settings = inject(SettingsStore);

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

  // Keyed by chatId — the Chat component instance stays alive across chat
  // switches (Dashboard just swaps ChatStore.selectedChat under it), so a
  // single shared draft signal would leak unsent text from one conversation
  // into whichever one you send from next.
  private readonly draftsByChat = signal<Record<string, string>>({});
  protected readonly draft = computed(() => {
    const chat = this.chat();
    return chat ? (this.draftsByChat()[chat.id] ?? '') : '';
  });
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly showEmojiPicker = signal(false);
  protected readonly reactingToMessageId = signal<string | null>(null);
  protected readonly replyingTo = signal<ChatMessage | null>(null);
  protected readonly forwardingMessage = signal<ChatMessage | null>(null);
  protected readonly forwarded = signal(false);
  private lastTypingSentAt = 0;

  // "X is typing..." — group chats can have several people typing at once,
  // 1:1 only ever has the one other member so the id-to-name lookup is
  // skipped there entirely.
  protected readonly typingLabel = computed(() => {
    const chat = this.chat();
    if (!chat) return null;
    const ids = this.typingStore.typingUserIdsFor(chat.id)();
    if (ids.length === 0) return null;
    if (!chat.isGroup) return 'Typing...';

    const names = ids
      .map((id) => this.chatStore.selectedChatMemberProfiles().find((m) => m.id === id)?.userName)
      .filter((n): n is string => !!n);
    if (names.length === 0) return 'Typing...';
    return `${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} typing...`;
  });

  protected readonly isMuted = computed(() => {
    const chat = this.chat();
    return !!chat && this.settings.mutedChatIds().has(chat.id);
  });

  // Any other chat is a valid forward target — no restriction on group vs
  // direct, matching every other messenger's forward picker.
  protected readonly forwardTargets = computed(() =>
    this.chatStore.chats().filter((c) => c.id !== this.chat()?.id),
  );
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
  protected readonly parseCallEvent = parseCallEvent;
  protected readonly callEventLabel = callEventLabel;

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

  // Grouped by emoji for pill rendering — reactions[] from the server is a
  // flat (emoji, userId) list, one row per person, since a single user only
  // ever holds one reaction per message (enforced server-side).
  reactionGroups(message: ChatMessage): { emoji: string; count: number; mine: boolean }[] {
    const myId = this.auth.currentUserProfile()?.id;
    const groups = new Map<string, { count: number; mine: boolean }>();
    for (const r of message.reactions) {
      const g = groups.get(r.emoji) ?? { count: 0, mine: false };
      g.count++;
      if (r.userId === myId) g.mine = true;
      groups.set(r.emoji, g);
    }
    return [...groups.entries()].map(([emoji, g]) => ({ emoji, ...g }));
  }

  toggleReactionPicker(messageId: string): void {
    this.reactingToMessageId.update((id) => (id === messageId ? null : messageId));
  }

  closeReactionPicker(): void {
    this.reactingToMessageId.set(null);
  }

  onReactionPicked(messageId: string, emoji: string): void {
    void this.messageStore.toggleReaction(messageId, emoji);
    this.closeReactionPicker();
  }

  toggleReaction(messageId: string, emoji: string): void {
    void this.messageStore.toggleReaction(messageId, emoji);
  }

  setDraft(value: string): void {
    const chat = this.chat();
    if (!chat) return;
    this.draftsByChat.update((map) => ({ ...map, [chat.id]: value }));

    // Throttled — every keystroke would flood the hub, and the receiving
    // side already treats each sighting as good for a few seconds anyway.
    if (value.trim()) {
      const now = Date.now();
      if (now - this.lastTypingSentAt > 2000) {
        this.lastTypingSentAt = now;
        this.hub.sendTyping(chat.id);
      }
    }
  }

  send(): void {
    const chat = this.chat();
    const text = this.draft().trim();
    if (!chat || !text) return;
    void this.messageStore.sendMessage(chat.id, text, null, this.replyingTo()?.id ?? null);
    this.clearDraft(chat.id);
    this.replyingTo.set(null);
  }

  messageById(id: string): ChatMessage | undefined {
    return this.messages().find((m) => m.id === id);
  }

  startReply(message: ChatMessage): void {
    this.replyingTo.set(message);
  }

  cancelReply(): void {
    this.replyingTo.set(null);
  }

  scrollToMessage(messageId: string): void {
    const target = this.messages().find((m) => m.id === messageId);
    if (!target) return;
    this.highlightMessageId.set(target.id);
    document.getElementById(`message-${target.id}`)?.scrollIntoView({ block: 'center' });
    setTimeout(() => this.highlightMessageId.set(null), 2000);
  }

  startForward(message: ChatMessage): void {
    this.forwardingMessage.set(message);
  }

  cancelForward(): void {
    this.forwardingMessage.set(null);
  }

  async forwardTo(targetChatId: string): Promise<void> {
    const message = this.forwardingMessage();
    if (!message) return;
    await this.messageStore.sendMessage(targetChatId, message.text, message.attachmentUrl);
    this.forwardingMessage.set(null);
    this.forwarded.set(true);
    setTimeout(() => this.forwarded.set(false), 2000);
  }

  // Generalized versions of chatName()/chatAvatarUrl() for an arbitrary chat
  // (the forward picker lists every chat, not just the currently open one).
  forwardChatName(c: ChatSummary): string {
    return c.isGroup ? (c.name ?? '') : (this.directCounterparts()[c.id]?.userName ?? '');
  }

  forwardChatAvatarUrl(c: ChatSummary): string | null {
    return c.isGroup ? c.avatarUrl : (this.directCounterparts()[c.id]?.avatarUrl ?? null);
  }

  private clearDraft(chatId: string): void {
    this.draftsByChat.update((map) => {
      if (!(chatId in map)) return map;
      const next = { ...map };
      delete next[chatId];
      return next;
    });
  }

  toggleEmojiPicker(): void {
    this.showEmojiPicker.update((v) => !v);
  }

  closeEmojiPicker(): void {
    this.showEmojiPicker.set(false);
  }

  onEmojiPicked(emoji: string): void {
    this.setDraft(this.draft() + emoji);
  }

  onEnter(event: Event): void {
    event.preventDefault();
    this.send();
  }

  close(): void {
    this.chatStore.closeChat();
  }

  toggleMute(): void {
    const chat = this.chat();
    if (!chat) return;
    this.settings.toggleChatMute(chat.id);
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
