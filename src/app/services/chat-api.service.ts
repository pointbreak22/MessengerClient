import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiEndpoints } from '../core/http/api-endpoints';
import { ChatSummary } from '../interfaces/chat-summary';

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

  createGroupChat(name: string, memberIds?: string[]): Observable<{ chatId: string }> {
    return this.http.post<{ chatId: string }>(`${this.base}${ApiEndpoints.chats.group}`, { name, memberIds });
  }

  addMember(chatId: string, userId: string): Observable<void> {
    return this.http.post<void>(`${this.base}${ApiEndpoints.chats.addMember(chatId)}`, { userId });
  }
}
