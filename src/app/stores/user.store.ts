import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ChatHubService } from '../core/signalr/chat-hub.service';
import { UserApiService } from '../services/user-api.service';
import { FriendRequest } from '../interfaces/friend-request';
import { FriendRequestAcceptedEvent } from '../interfaces/hub-events';
import { UserProfile } from '../interfaces/user-profile';

@Injectable({ providedIn: 'root' })
export class UserStore {
  private readonly api = inject(UserApiService);
  private readonly hub = inject(ChatHubService);

  private readonly _friends = signal<UserProfile[]>([]);
  private readonly _incomingRequests = signal<FriendRequest[]>([]);
  // GET /friends/requests only returns { fromUserId }, no name — resolved lazily
  // via getUserById, same pattern as ChatStore's directCounterparts.
  private readonly _requestSenders = signal<Record<string, UserProfile>>({});
  private readonly _searchResults = signal<UserProfile[]>([]);
  // No "outgoing pending requests" endpoint exists — tracked client-side only,
  // for this session, so an "Add" button can flip to "Requested" after sending.
  private readonly _sentRequestIds = signal<ReadonlySet<string>>(new Set());

  readonly friends = this._friends.asReadonly();
  readonly incomingRequests = this._incomingRequests.asReadonly();
  readonly requestSenders = this._requestSenders.asReadonly();
  readonly searchResults = this._searchResults.asReadonly();
  readonly sentRequestIds = this._sentRequestIds.asReadonly();
  readonly onlineFriends = computed(() => this._friends().filter((u) => u.isOnline));

  constructor() {
    this.hub.on<string>('UserWentOnline', (userId) => this.setPresence(userId, true));
    this.hub.on<string>('UserWentOffline', (userId) => this.setPresence(userId, false));
    this.hub.on<FriendRequestAcceptedEvent>('FriendRequestAccepted', (event) => void this.addFriend(event.by));
  }

  async loadFriends(): Promise<void> {
    const friends = await firstValueFrom(this.api.getFriends());
    this._friends.set(friends);
  }

  async loadFriendRequests(): Promise<void> {
    const requests = await firstValueFrom(this.api.getFriendRequests());
    this._incomingRequests.set(requests);

    const knownSenders = this._requestSenders();
    const missingIds = [...new Set(requests.map((r) => r.fromUserId))].filter((id) => !knownSenders[id]);
    if (!missingIds.length) return;

    const profiles = await Promise.all(missingIds.map((id) => firstValueFrom(this.api.getUserById(id))));
    this._requestSenders.update((map) => {
      const next = { ...map };
      for (const profile of profiles) next[profile.id] = profile;
      return next;
    });
  }

  async searchUsers(query: string): Promise<void> {
    const search = query.trim();
    if (!search) {
      this._searchResults.set([]);
      return;
    }
    const result = await firstValueFrom(this.api.getUsers({ search, pageSize: 20 }));
    this._searchResults.set(result.items);
  }

  clearSearchResults(): void {
    this._searchResults.set([]);
  }

  async sendFriendRequest(friendId: string): Promise<void> {
    await firstValueFrom(this.api.sendFriendRequest(friendId));
    this._sentRequestIds.update((ids) => new Set(ids).add(friendId));
  }

  async acceptFriendRequest(friendId: string): Promise<void> {
    await firstValueFrom(this.api.acceptFriendRequest(friendId));
    this.dropIncomingRequest(friendId);
    await this.addFriend(friendId);
  }

  async removeFriend(friendId: string): Promise<void> {
    await firstValueFrom(this.api.removeFriend(friendId));
    this.dropIncomingRequest(friendId);
    this._friends.update((list) => list.filter((u) => u.id !== friendId));
  }

  private dropIncomingRequest(friendId: string): void {
    this._incomingRequests.update((list) => list.filter((r) => r.fromUserId !== friendId));
    this._requestSenders.update((map) => {
      if (!(friendId in map)) return map;
      const next = { ...map };
      delete next[friendId];
      return next;
    });
  }

  private async addFriend(userId: string): Promise<void> {
    const profile = await firstValueFrom(this.api.getUserById(userId));
    this._friends.update((list) => (list.some((u) => u.id === userId) ? list : [...list, profile]));
  }

  private setPresence(userId: string, isOnline: boolean): void {
    this._friends.update((list) => list.map((u) => (u.id === userId ? { ...u, isOnline } : u)));
  }
}
