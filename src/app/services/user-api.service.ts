import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiEndpoints } from '../core/http/api-endpoints';
import { FriendRequest } from '../interfaces/friend-request';
import { PagedResult } from '../interfaces/paged-result';
import { UserProfile } from '../interfaces/user-profile';

export interface ListUsersQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: 'lastseen' | 'username_desc';
  isOnline?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  getUsers(query: ListUsersQuery = {}): Observable<PagedResult<UserProfile>> {
    let params = new HttpParams()
      .set('page', query.page ?? 1)
      .set('pageSize', query.pageSize ?? 20);
    if (query.search) params = params.set('search', query.search);
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.isOnline !== undefined) params = params.set('isOnline', query.isOnline);

    return this.http.get<PagedResult<UserProfile>>(`${this.base}${ApiEndpoints.users.list}`, { params });
  }

  getMe(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.base}${ApiEndpoints.users.me}`);
  }

  getUserById(id: string): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.base}${ApiEndpoints.users.byId(id)}`);
  }

  updateMe(userName: string): Observable<void> {
    return this.http.put<void>(`${this.base}${ApiEndpoints.users.me}`, { userName });
  }

  uploadAvatar(file: File): Observable<{ avatarUrl: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.put<{ avatarUrl: string }>(`${this.base}${ApiEndpoints.users.avatar}`, formData);
  }

  deleteAvatar(): Observable<void> {
    return this.http.delete<void>(`${this.base}${ApiEndpoints.users.avatar}`);
  }

  getFriends(): Observable<UserProfile[]> {
    return this.http.get<UserProfile[]>(`${this.base}${ApiEndpoints.friends.mine}`);
  }

  getFriendRequests(): Observable<FriendRequest[]> {
    return this.http.get<FriendRequest[]>(`${this.base}${ApiEndpoints.friends.requests}`);
  }

  sendFriendRequest(friendId: string): Observable<void> {
    return this.http.post<void>(`${this.base}${ApiEndpoints.friends.sendRequest(friendId)}`, {});
  }

  acceptFriendRequest(friendId: string): Observable<void> {
    return this.http.post<void>(`${this.base}${ApiEndpoints.friends.accept(friendId)}`, {});
  }

  // Also used to decline a pending request — the spec gives one DELETE for
  // both "remove a friend" and "reject a request" (same resource/relationship).
  removeFriend(friendId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}${ApiEndpoints.friends.remove(friendId)}`);
  }
}
