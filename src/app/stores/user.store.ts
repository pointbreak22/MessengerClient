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

  readonly friends = this._friends.asReadonly();
  readonly incomingRequests = this._incomingRequests.asReadonly();
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
  }

  async sendFriendRequest(friendId: string): Promise<void> {
    await firstValueFrom(this.api.sendFriendRequest(friendId));
  }

  async acceptFriendRequest(friendId: string): Promise<void> {
    await firstValueFrom(this.api.acceptFriendRequest(friendId));
    this._incomingRequests.update((list) => list.filter((r) => r.fromUserId !== friendId));
    await this.addFriend(friendId);
  }

  async removeFriend(friendId: string): Promise<void> {
    await firstValueFrom(this.api.removeFriend(friendId));
    this._incomingRequests.update((list) => list.filter((r) => r.fromUserId !== friendId));
    this._friends.update((list) => list.filter((u) => u.id !== friendId));
  }

  private async addFriend(userId: string): Promise<void> {
    const profile = await firstValueFrom(this.api.getUserById(userId));
    this._friends.update((list) => (list.some((u) => u.id === userId) ? list : [...list, profile]));
  }

  private setPresence(userId: string, isOnline: boolean): void {
    this._friends.update((list) => list.map((u) => (u.id === userId ? { ...u, isOnline } : u)));
  }
}
