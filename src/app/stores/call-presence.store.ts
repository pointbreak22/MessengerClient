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

// Who's currently in which call room — drives the red/yellow call-status
// icons (red = sharing a call with me, yellow = in some other call) and the
// green "ongoing call, tap to join" affordance on a group. Seeded from
// GET /calls/active, kept live via the UserCallStateChanged hub event
// (unscoped broadcast, same convention as UserWentOnline/UserWentOffline).
@Injectable({ providedIn: 'root' })
export class CallPresenceStore {
  private readonly hub = inject(ChatHubService);
  private readonly api = inject(CallsApiService);

  private readonly _byUser = signal<Record<string, UserCallPresence | undefined>>({});
  readonly byUser = this._byUser.asReadonly();

  constructor() {
    this.hub.on<UserCallStateChangedEvent>('UserCallStateChanged', (e) => this.apply(e));
  }

  async load(): Promise<void> {
    const active = await firstValueFrom(this.api.getActiveCalls());
    const map: Record<string, UserCallPresence> = {};
    for (const entry of active) {
      map[entry.userId] = { chatId: entry.chatId, callId: entry.callId, isVideo: entry.isVideo };
    }
    this._byUser.set(map);
  }

  statusFor(userId: string, myCallId: string | null): CallPresenceStatus {
    const entry = this._byUser()[userId];
    if (!entry) return 'none';
    if (myCallId && entry.callId === myCallId) return 'with-me';
    return 'busy';
  }

  // Active call among the given member ids, scoped to this specific chat —
  // a member can be on a call in some *other* chat they're also in, which
  // isn't "an ongoing call in this group" and shouldn't light up its join
  // affordance. For a group's "ongoing call, tap to join" button.
  activeCallForChat(chatId: string, memberIds: string[]): UserCallPresence | null {
    const map = this._byUser();
    for (const id of memberIds) {
      const entry = map[id];
      if (entry && entry.chatId === chatId) return entry;
    }
    return null;
  }

  private apply(e: UserCallStateChangedEvent): void {
    this._byUser.update((map) => {
      const next = { ...map };
      if (e.chatId && e.callId) {
        next[e.userId] = { chatId: e.chatId, callId: e.callId, isVideo: e.isVideo };
      } else {
        delete next[e.userId];
      }
      return next;
    });
  }
}
