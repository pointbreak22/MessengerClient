import { Component, computed, inject, input } from '@angular/core';
import { GroupCallService } from '../../core/signalr/group-call.service';
import { CallPresenceStore, GroupCallActivity } from '../../stores/call-presence.store';
import { Icon } from '../icon/icon';

// Call/video icon pair for a single contact, reused wherever one shows up
// (group members, friends lists) — the same pair, just recolored/repurposed
// by their current status instead of being a separate badge:
//
// - Not on any call: plain icons. If `chatId` is set (a group-members
//   context), they're buttons that start a call with just this one person.
// - On a call within `chatId` (this group): a single green icon (call or
//   video, matching that call) with a small index badge — click to join.
//   Not shown if it's *my own* current call (nothing to join).
// - On a call anywhere else (or in this group but chatId wasn't given —
//   friends lists have no group context): the icon matching their call type
//   turns busy-yellow (or danger-red if it's a call I'm already on), the
//   other one dims — informational only, not clickable.
@Component({
  selector: 'app-call-action-icons',
  imports: [Icon],
  templateUrl: './call-action-icons.html',
  styleUrl: './call-action-icons.css',
})
export class CallActionIcons {
  private readonly callPresence = inject(CallPresenceStore);
  protected readonly groupCall = inject(GroupCallService);

  readonly userId = input.required<string>();
  // Omit for a plain friends-list context (informational only, no join/start actions).
  readonly chatId = input<string | null>(null);

  protected readonly badge = computed(() => this.callPresence.badgeFor(this.userId(), this.groupCall.callId()));

  protected readonly joinableCall = computed<GroupCallActivity | null>(() => {
    const chatId = this.chatId();
    if (!chatId) return null;
    const call = this.callPresence.activeCallForUserInChat(this.userId(), chatId);
    if (!call || call.callId === this.groupCall.callId()) return null; // nothing to "join" on my own call
    return call;
  });

  protected readonly canStartCall = computed(() => !!this.chatId() && this.badge().status === 'none');

  async join(call: GroupCallActivity): Promise<void> {
    if (this.groupCall.state() !== 'idle') return;
    await this.groupCall.join(call.callId, call.chatId, call.isVideo);
  }

  async startCall(isVideo: boolean): Promise<void> {
    const chatId = this.chatId();
    if (!chatId || this.groupCall.state() !== 'idle') return;
    await this.groupCall.start(chatId, [this.userId()], isVideo);
  }
}
