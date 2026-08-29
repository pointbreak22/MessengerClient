import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Avatar } from '../avatar/avatar';
import { Icon } from '../icon/icon';
import { AuthService } from '../../core/auth/auth.service';
import { ParticipantState } from '../../core/calling/group-call-provider';
import { GroupCallService } from '../../core/signalr/group-call.service';
import { UserApiService } from '../../services/user-api.service';
import { CallPresenceStore } from '../../stores/call-presence.store';
import { ChatStore } from '../../stores/chat.store';
import { UserProfile } from '../../interfaces/user-profile';
import { getInitials } from '../../shared/user-display';

type ViewMode = 'grid' | 'speaker';

const PAGE_SIZE = 9;

@Component({
  selector: 'app-group-call-overlay',
  imports: [Icon, Avatar, NgTemplateOutlet],
  templateUrl: './group-call-overlay.html',
  styleUrl: './group-call-overlay.css',
})
export class GroupCallOverlay {
  private readonly auth = inject(AuthService);
  private readonly chatStore = inject(ChatStore);
  private readonly userApi = inject(UserApiService);
  private readonly callPresence = inject(CallPresenceStore);
  protected readonly call = inject(GroupCallService);
  protected readonly getInitials = getInitials;

  protected readonly mode = signal<ViewMode>('grid');
  protected readonly page = signal(0);

  protected readonly showInvitePanel = signal(false);
  protected readonly invitableMembers = signal<UserProfile[]>([]);
  protected readonly invitingUserId = signal<string | null>(null);

  private readonly myUserId = computed(() => this.auth.currentUserProfile()?.id ?? 'self');

  // Local participant folded into the same tile shape as everyone else, so
  // grid/speaker rendering doesn't need a special case for "me".
  protected readonly allTiles = computed<ParticipantState[]>(() => {
    const me: ParticipantState = {
      userId: this.myUserId(),
      profile: this.auth.currentUserProfile(),
      stream: this.call.localStream(),
      micMuted: this.call.localMicMuted(),
      cameraOff: this.call.localCameraOff(),
      speaking: false,
    };
    return [me, ...Object.values(this.call.participants())];
  });

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.allTiles().length / PAGE_SIZE)));

  protected readonly pagedTiles = computed(() => {
    const start = this.page() * PAGE_SIZE;
    return this.allTiles().slice(start, start + PAGE_SIZE);
  });

  // Whoever's loudest right now (best-effort volume heuristic, see
  // GroupCallService's speaking analyser) — falls back to the first remote
  // participant, then to just me if I'm alone in the room so far.
  protected readonly speakerTile = computed(() => {
    const tiles = this.allTiles();
    const remote = tiles.filter((t) => t.userId !== this.myUserId());
    return remote.find((t) => t.speaking) ?? remote[0] ?? tiles[0] ?? null;
  });

  protected readonly thumbnailTiles = computed(() => {
    const speaker = this.speakerTile();
    return this.allTiles().filter((t) => t.userId !== speaker?.userId);
  });

  isSelf(tile: ParticipantState): boolean {
    return tile.userId === this.myUserId();
  }

  // Whether to actually render this tile's video element — per-tile, based on
  // whether its own stream carries a live video track. Deliberately NOT
  // gated on call.isVideo(): that signal reflects MY OWN camera state (it
  // flips to false if my camera fails and I fall back to audio-only), and
  // gating every tile on it would hide everyone else's video just because my
  // own camera didn't come up.
  hasVideo(tile: ParticipantState): boolean {
    return !tile.cameraOff && (tile.stream?.getVideoTracks().length ?? 0) > 0;
  }

  displayName(tile: ParticipantState): string {
    if (this.isSelf(tile)) return `${tile.profile?.userName ?? 'You'} (you)`;
    return tile.profile?.userName ?? '...';
  }

  toggleMode(): void {
    this.mode.update((m) => (m === 'grid' ? 'speaker' : 'grid'));
  }

  prevPage(): void {
    this.page.update((p) => Math.max(0, p - 1));
  }

  nextPage(): void {
    this.page.update((p) => Math.min(this.totalPages() - 1, p + 1));
  }

  accept(): void {
    void this.call.acceptIncoming();
  }

  decline(): void {
    this.call.declineIncoming();
  }

  leave(): void {
    this.call.leave();
  }

  dismissError(): void {
    this.call.clearError();
  }

  toggleMute(): void {
    this.call.toggleMute();
  }

  toggleCamera(): void {
    this.call.toggleCamera();
  }

  // Chat membership isn't necessarily the chat currently open in the main
  // view — the call's own chatId is the source of truth, resolved via
  // ChatStore.chatById() (unfiltered, unlike the Chats-tab-scoped chats()).
  async toggleInvitePanel(): Promise<void> {
    const next = !this.showInvitePanel();
    this.showInvitePanel.set(next);
    if (!next) return;

    const chatId = this.call.chatId();
    const chat = chatId ? this.chatStore.chatById(chatId) : null;
    if (!chat) {
      this.invitableMembers.set([]);
      return;
    }

    const alreadyPresent = new Set([this.myUserId(), ...Object.keys(this.call.participants())]);
    const idsToResolve = chat.members.map((m) => m.userId).filter((id) => !alreadyPresent.has(id));

    const profiles = await Promise.all(
      idsToResolve.map((id) => firstValueFrom(this.userApi.getUserById(id)).catch(() => null)),
    );
    this.invitableMembers.set(profiles.filter((p): p is UserProfile => !!p));
  }

  closeInvitePanel(): void {
    this.showInvitePanel.set(false);
  }

  // Someone already on a different call — can't be pulled into two at once.
  isInviteeBusy(userId: string): boolean {
    return this.callPresence.badgeFor(userId, this.call.callId()).status === 'busy';
  }

  async invite(userId: string): Promise<void> {
    if (this.isInviteeBusy(userId) || this.invitingUserId()) return;
    this.invitingUserId.set(userId);
    try {
      await this.call.invite(userId);
      this.invitableMembers.update((list) => list.filter((p) => p.id !== userId));
    } finally {
      this.invitingUserId.set(null);
    }
  }
}
