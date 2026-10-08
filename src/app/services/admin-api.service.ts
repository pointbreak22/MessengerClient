import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiEndpoints } from '../core/http/api-endpoints';
import { UserRole } from '../interfaces/user-profile';

// Deliberately separate from UserProfile: this is the admin projection, and it
// carries the login (email) and role, which the ordinary user listings never
// return.
export interface AdminUser {
  id: string;
  userName: string;
  email: string | null;
  role: UserRole;
  isOnline: boolean;
  lastSeenAt: string;
  avatarUrl: string | null;
  isBanned: boolean;
  bannedAt: string | null;
  // Auto-moderation warnings currently counting towards a ban (they expire
  // after a quiet period server-side, and reset on unban).
  moderationStrikes: number;
  lastStrikeAt: string | null;
  // IP of the most recent sign-in (GET /users/me), null if never recorded.
  lastIpAddress: string | null;
}

// One auto-moderation hit, newest first (GET /admin/users/{id}/violations).
export interface AdminViolation {
  id: string;
  target: 'Message' | 'UserName' | 'ChatName';
  content: string;
  matchedWords: string;
  // 0 = no strike (superadmin), otherwise which warning this was.
  strikeNumber: number;
  resultedInBan: boolean;
  ipAddress: string | null;
  createdAt: string;
}

export interface AdminIpBan {
  id: string;
  ipAddress: string;
  reason: string;
  isAutomatic: boolean;
  createdAt: string;
  // null = permanent.
  expiresAt: string | null;
}

export interface AdminChat {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  ownerId: string | null;
  createdAt: string;
  memberCount: number;
}

export interface AdminPage<T> {
  items: T[];
  total: number;
}

// Every call here requires the SuperAdmin policy server-side; a non-admin gets
// 403 even if they reach these URLs by hand.
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  listUsers(page = 1, pageSize = 50, search?: string): Observable<AdminPage<AdminUser>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) params = params.set('search', search);
    return this.http.get<AdminPage<AdminUser>>(`${this.base}${ApiEndpoints.admin.users}`, { params });
  }

  renameUser(id: string, userName: string): Observable<AdminUser> {
    return this.http.put<AdminUser>(`${this.base}${ApiEndpoints.admin.user(id)}`, { userName });
  }

  // A banned user can't call the API or the hub and is hidden from everyone
  // else (search, friends, chats, messages). Nothing is deleted: unban restores it.
  banUser(id: string): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${this.base}${ApiEndpoints.admin.ban(id)}`, {});
  }

  unbanUser(id: string): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${this.base}${ApiEndpoints.admin.unban(id)}`, {});
  }

  listViolations(userId: string): Observable<AdminViolation[]> {
    return this.http.get<AdminViolation[]>(`${this.base}${ApiEndpoints.admin.violations(userId)}`);
  }

  // Active bans only — expired ones aren't returned.
  listIpBans(): Observable<AdminIpBan[]> {
    return this.http.get<AdminIpBan[]>(`${this.base}${ApiEndpoints.admin.ipBans}`);
  }

  // days null/0 = permanent. Never affects the superadmin, so banning your own IP is safe.
  banIp(ipAddress: string, reason: string | null, days: number | null): Observable<AdminIpBan> {
    return this.http.post<AdminIpBan>(`${this.base}${ApiEndpoints.admin.ipBans}`, { ipAddress, reason, days });
  }

  unbanIp(banId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}${ApiEndpoints.admin.ipBan(banId)}`);
  }

  listPublicChats(page = 1, pageSize = 50, search?: string): Observable<AdminPage<AdminChat>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) params = params.set('search', search);
    return this.http.get<AdminPage<AdminChat>>(`${this.base}${ApiEndpoints.admin.chats}`, { params });
  }

  updateChat(chatId: string, patch: { name?: string; isPublic?: boolean }): Observable<AdminChat> {
    return this.http.put<AdminChat>(`${this.base}${ApiEndpoints.admin.chat(chatId)}`, patch);
  }

  deleteChat(chatId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}${ApiEndpoints.admin.chat(chatId)}`);
  }
}
