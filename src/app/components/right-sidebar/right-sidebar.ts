import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { Avatar } from '../avatar/avatar';
import { CallActionIcons } from '../call-action-icons/call-action-icons';
import { Icon } from '../icon/icon';
import { AuthService } from '../../core/auth/auth.service';
import { CallService } from '../../core/signalr/call.service';
import { GroupCallService } from '../../core/signalr/group-call.service';
import { CallPresenceStore, GroupCallActivity } from '../../stores/call-presence.store';
import { ChatStore } from '../../stores/chat.store';
import { MessageStore } from '../../stores/message.store';
import { UserStore } from '../../stores/user.store';
import { attachmentIcon, attachmentKind } from '../../shared/attachment-display';
import { formatLastSeen, getInitials } from '../../shared/user-display';

@Component({
  selector: 'app-right-sidebar',
  imports: [Icon, Avatar, CallActionIcons],
  templateUrl: './right-sidebar.html',
  styleUrl: './right-sidebar.css',
})
export class RightSidebar {
  private readonly auth = inject(AuthService);
  private readonly chatStore = inject(ChatStore);
  private readonly userStore = inject(UserStore);
  private readonly messageStore = inject(MessageStore);
  protected readonly call = inject(CallService);
  protected readonly groupCall = inject(GroupCallService);
  private readonly callPresence = inject(CallPresenceStore);

  protected readonly currentUser = this.auth.currentUserProfile;
  protected readonly selectedChat = this.chatStore.selectedChat;
  protected readonly directCounterparts = this.chatStore.directCounterparts;
  protected readonly onlineFriends = this.userStore.onlineFriends;
  // Below xl this aside is otherwise unreachable (hidden ... xl:flex) — this
  // flag, toggled from a button in the chat header, makes it take over
  // full-screen there instead.
  protected readonly mobileInfoOpen = this.chatStore.mobileInfoOpen;
  // Adding a member searches all users (not just friends) — anyone can add
  // anyone. Removing/deleting is owner-only, gated by isOwner() below.
  protected readonly memberSearchResults = this.userStore.searchResults;

  protected readonly getInitials = getInitials;
  protected readonly formatLastSeen = formatLastSeen;

  protected readonly showAddMember = signal(false);
  protected readonly addMemberQuery = signal('');
  private addMemberDebounce?: ReturnType<typeof setTimeout>;

  // Name/avatar editing — any member can do this, not just the owner (unlike
  // remove-member/delete, which stay owner-only below).
  @ViewChild('groupAvatarInput') private readonly groupAvatarInput!: ElementRef<HTMLInputElement>;
  protected readonly editingGroupName = signal(false);
  protected readonly groupNameDraft = signal('');
  protected readonly savingGroupName = signal(false);
  protected readonly uploadingGroupAvatar = signal(false);

  protected readonly isOwner = computed(() => {
    const chat = this.selectedChat();
    const myId = this.currentUser()?.id;
    return !!chat && chat.isGroup && !!myId && chat.ownerId === myId;
  });

  protected readonly selectedChatContact = computed(() => {
    const chat = this.selectedChat();
    if (!chat || chat.isGroup) return null;
    return this.directCounterparts()[chat.id] ?? null;
  });

  // Group members excluding the current user.
  protected readonly otherMembers = computed(() => {
    const myId = this.currentUser()?.id;
    return this.chatStore.selectedChatMemberProfiles().filter((m) => m.id !== myId);
  });

  // Every call currently running in this group — there can be more than one
  // in parallel (first 6 people call each other, another 6 start a separate
  // one). Suppressed while I'm already on a call myself — GroupCallOverlay
  // covers that case full-screen already.
  protected readonly activeGroupCalls = computed(() => {
    const chat = this.selectedChat();
    if (!chat?.isGroup || this.groupCall.state() !== 'idle') return [];
    return this.callPresence.activeCallsForChat(chat.id);
  });

  // Derived from whatever message history is already loaded for this chat —
  // there's no dedicated "list attachments" endpoint, so older attachments
  // outside the loaded page of history won't show up here yet.
  protected readonly sharedMedia = computed(() => {
    const chat = this.selectedChat();
    if (!chat) return [];
    return this.messageStore
      .messagesFor(chat.id)()
      .filter((m) => !!m.attachmentUrl);
  });

  protected readonly attachmentKind = attachmentKind;
  protected readonly attachmentIcon = attachmentIcon;

  startCall(video: boolean): void {
    const chat = this.selectedChat();
    const contactId = this.selectedChatContact()?.id;
    if (!chat || chat.isGroup || !contactId) return;
    void this.call.startCall(contactId, chat.id, video);
  }

  openGroupCallPicker(video: boolean): void {
    this.chatStore.openGroupCallPicker(video);
  }

  joinCall(call: GroupCallActivity): void {
    void this.groupCall.join(call.callId, call.chatId, call.isVideo);
  }

  chatName(): string {
    const chat = this.selectedChat();
    if (!chat) return '';
    return chat.isGroup ? (chat.name ?? '') : (this.selectedChatContact()?.userName ?? '');
  }

  // Groups fall back to initials until a custom avatar is set.
  chatAvatarUrl(): string | null {
    const chat = this.selectedChat();
    if (!chat) return null;
    return chat.isGroup ? chat.avatarUrl : (this.selectedChatContact()?.avatarUrl ?? null);
  }

  messageFriend(userId: string): void {
    void this.chatStore.createDirectChat(userId);
  }

  close(): void {
    this.chatStore.closeChat();
  }

  // Distinct from close(): this only collapses the mobile info overlay back
  // to the chat, it doesn't deselect the conversation.
  backToChat(): void {
    this.chatStore.closeMobileInfo();
  }

  toggleAddMember(): void {
    const next = !this.showAddMember();
    this.showAddMember.set(next);
    if (!next) {
      this.addMemberQuery.set('');
      this.userStore.clearSearchResults();
    }
  }

  onAddMemberQueryInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.addMemberQuery.set(value);
    clearTimeout(this.addMemberDebounce);
    if (!value.trim()) {
      this.userStore.clearSearchResults();
      return;
    }
    this.addMemberDebounce = setTimeout(() => void this.userStore.searchUsers(value), 300);
  }

  isMember(userId: string): boolean {
    return this.chatStore.selectedChatMemberProfiles().some((m) => m.id === userId);
  }

  addMember(userId: string): void {
    const chat = this.selectedChat();
    if (!chat) return;
    void this.chatStore.addMember(chat.id, userId);
  }

  removeMember(userId: string): void {
    const chat = this.selectedChat();
    if (!chat || !this.isOwner()) return;
    void this.chatStore.removeMember(chat.id, userId);
  }

  deleteGroup(): void {
    const chat = this.selectedChat();
    if (!chat || !this.isOwner()) return;
    void this.chatStore.deleteChat(chat.id);
  }

  leaveGroup(): void {
    const chat = this.selectedChat();
    if (!chat || this.isOwner()) return;
    void this.chatStore.leaveChat(chat.id);
  }

  startEditGroupName(): void {
    this.groupNameDraft.set(this.selectedChat()?.name ?? '');
    this.editingGroupName.set(true);
  }

  cancelEditGroupName(): void {
    this.editingGroupName.set(false);
  }

  onGroupNameDraftInput(event: Event): void {
    this.groupNameDraft.set((event.target as HTMLInputElement).value);
  }

  async saveGroupName(): Promise<void> {
    const chat = this.selectedChat();
    const name = this.groupNameDraft().trim();
    if (!chat || !name || this.savingGroupName()) return;

    this.savingGroupName.set(true);
    try {
      await this.chatStore.renameChat(chat.id, name);
      this.editingGroupName.set(false);
    } finally {
      this.savingGroupName.set(false);
    }
  }

  triggerGroupAvatarUpload(): void {
    if (this.uploadingGroupAvatar()) return;
    this.groupAvatarInput.nativeElement.click();
  }

  async onGroupAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file next time
    const chat = this.selectedChat();
    if (!file || !chat) return;

    this.uploadingGroupAvatar.set(true);
    try {
      await this.chatStore.uploadGroupAvatar(chat.id, file);
    } finally {
      this.uploadingGroupAvatar.set(false);
    }
  }

  async removeGroupAvatar(): Promise<void> {
    const chat = this.selectedChat();
    if (!chat || this.uploadingGroupAvatar()) return;

    this.uploadingGroupAvatar.set(true);
    try {
      await this.chatStore.removeGroupAvatar(chat.id);
    } finally {
      this.uploadingGroupAvatar.set(false);
    }
  }
}
