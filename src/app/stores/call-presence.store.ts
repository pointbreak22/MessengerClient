import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ChatHubService } from '../core/signalr/chat-hub.service';
import { CallsApiService } from '../services/calls-api.service';
import { UserCallStateChangedEvent } from '../interfaces/group-call-events';

export interface UserCallPresence {
  chatId: string;
  callId: string;
  isVideo: boolean;
}

export type CallPresenceStatus = 'with-me' | 'busy' | 'none';

export interface CallBadge {
  status: CallPresenceStatus;
  isVideo: boolean; // meaningless when status is 'none'
}

// A group can have several unrelated calls running at once (first 6 people
// call each other, then another 6 start a separate one) — this is one of
// them, with a stable 1-based index ("call #1", "call #2", ...) so they're
// distinguishable in the UI.
export interface GroupCallActivity {
  chatId: string;
  callId: string;
  isVideo: boolean;
  participantIds: string[];
  index: number;
}

// Who's currently in which call room — drives the busy/red/yellow call icons
// wherever a contact shows up, and the "ongoing call(s), tap to join"
// affordance on a group. Seeded from GET /calls/active, kept live via the
// UserCallStateChanged hub event (unscoped broadcast, same convention as
// UserWentOnline/UserWentOffline).
@Injectable({ providedIn: 'root' })
export class CallPresenceStore {
  private readonly hub = inject(ChatHubService);
  private readonly api = inject(CallsApiService);

  private readonly _byUser = signal<Record<string, UserCallPresence | undefined>>({});
  readonly byUser = this._byUser.asReadonly();

  // Not reactive on its own — only used to order concurrent calls within a
  // chat by which one appeared first, so index assignment stays stable
  // instead of jumping around as the underlying map re-serializes.
  private readonly callFirstSeenAt = new Map<string, number>();

  constructor() {
    this.hub.on<UserCallStateChangedEvent>('UserCallStateChanged', (e) => this.apply(e));
  }

  async load(): Promise<void> {
    const active = await firstValueFrom(this.api.getActiveCalls());
    const map: Record<string, UserCallPresence> = {};
    active.forEach((entry, i) => {
      map[entry.userId] = { chatId: entry.chatId, callId: entry.callId, isVideo: entry.isVideo };
      if (!this.callFirstSeenAt.has(entry.callId)) this.callFirstSeenAt.set(entry.callId, i);
    });
    this._byUser.set(map);
  }

  // Status relative to my own current call (pass null if I'm not on one).
  badgeFor(userId: string, myCallId: string | null): CallBadge {
    const entry = this._byUser()[userId];
    if (!entry) return { status: 'none', isVideo: false };
    const status: CallPresenceStatus = myCallId && entry.callId === myCallId ? 'with-me' : 'busy';
    return { status, isVideo: entry.isVideo };
  }

  // Every distinct call currently running among this chat's members —
  // there can be more than one in parallel. Ordered by first-seen so
  // "call #1" stays call #1 for as long as it's running.
  activeCallsForChat(chatId: string): GroupCallActivity[] {
    const byCallId = new Map<string, { isVideo: boolean; participantIds: string[] }>();
    for (const [userId, entry] of Object.entries(this._byUser())) {
      if (!entry || entry.chatId !== chatId) continue;
      const bucket = byCallId.get(entry.callId) ?? { isVideo: entry.isVideo, participantIds: [] };
      bucket.participantIds.push(userId);
      byCallId.set(entry.callId, bucket);
    }

    return [...byCallId.entries()]
      .sort(([a], [b]) => (this.callFirstSeenAt.get(a) ?? 0) - (this.callFirstSeenAt.get(b) ?? 0))
      .map(([callId, v], i) => ({ chatId, callId, isVideo: v.isVideo, participantIds: v.participantIds, index: i + 1 }));
  }

  // Which of this chat's (possibly several) parallel calls this specific
  // user is on right now, if any — for a per-member "join their call" icon.
  activeCallForUserInChat(userId: string, chatId: string): GroupCallActivity | null {
    const entry = this._byUser()[userId];
    if (!entry || entry.chatId !== chatId) return null;
    return this.activeCallsForChat(chatId).find((c) => c.callId === entry.callId) ?? null;
  }

  private apply(e: UserCallStateChangedEvent): void {
    this._byUser.update((map) => {
      const next = { ...map };
      if (e.chatId && e.callId) {
        next[e.userId] = { chatId: e.chatId, callId: e.callId, isVideo: e.isVideo };
        if (!this.callFirstSeenAt.has(e.callId)) this.callFirstSeenAt.set(e.callId, Date.now());
      } else {
        const leftCallId = next[e.userId]?.callId;
        delete next[e.userId];
        if (leftCallId && !Object.values(next).some((v) => v?.callId === leftCallId)) {
          this.callFirstSeenAt.delete(leftCallId);
        }
      }
      return next;
    });
  }
}
