import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiEndpoints } from '../core/http/api-endpoints';
import { ChatSummary } from '../interfaces/chat-summary';
import { PagedResult } from '../interfaces/paged-result';
import { PublicGroupDto } from '../interfaces/public-group';

@Injectable({ providedIn: 'root' })
export class ChatApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  getChats(): Observable<ChatSummary[]> {
    return this.http.get<ChatSummary[]>(`${this.base}${ApiEndpoints.chats.mine}`);
  }

  createDirectChat(targetUserId: string): Observable<{ chatId: string }> {
    return this.http.post<{ chatId: string }>(`${this.base}${ApiEndpoints.chats.direct(targetUserId)}`, {});
  }

  createGroupChat(name: string, memberIds?: string[], isPublic = false): Observable<{ chatId: string }> {
    return this.http.post<{ chatId: string }>(`${this.base}${ApiEndpoints.chats.group}`, { name, memberIds, isPublic });
  }

  addMember(chatId: string, userId: string): Observable<void> {
    return this.http.post<void>(`${this.base}${ApiEndpoints.chats.addMember(chatId)}`, { userId });
  }

  // Owner-only — backend returns 403 for anyone else.
  removeMember(chatId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}${ApiEndpoints.chats.member(chatId, userId)}`);
  }

  // Owner-only — backend returns 403 for anyone else.
  deleteChat(chatId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}${ApiEndpoints.chats.byId(chatId)}`);
  }

  // No membership required — lists every public group, not just ones you're in.
  getPublicGroups(search = '', page = 1, pageSize = 20): Observable<PagedResult<PublicGroupDto>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) params = params.set('search', search);
    return this.http.get<PagedResult<PublicGroupDto>>(`${this.base}${ApiEndpoints.chats.public}`, { params });
  }

  joinChat(chatId: string): Observable<void> {
    return this.http.post<void>(`${this.base}${ApiEndpoints.chats.join(chatId)}`, {});
  }

  // Self-only, distinct from removeMember (owner-only, targets someone else):
  // this lets any member remove themselves, including from a group they don't
  // own. Backend returns 400 if the caller is the owner (delete instead).
  leaveChat(chatId: string): Observable<void> {
    return this.http.post<void>(`${this.base}${ApiEndpoints.chats.leave(chatId)}`, {});
  }
}
