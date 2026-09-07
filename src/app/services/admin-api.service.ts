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
