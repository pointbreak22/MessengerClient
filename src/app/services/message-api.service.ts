import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiEndpoints } from '../core/http/api-endpoints';
import { ChatMessage } from '../interfaces/chat-message';

export interface SendMessageRequest {
  text?: string | null;
  attachmentUrl?: string | null;
  idempotencyKey?: string;
}

@Injectable({ providedIn: 'root' })
export class MessageApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  // Returns newest-to-oldest, per the spec. `before` = createdAt of the oldest
  // already-loaded message, for backward pagination.
  getHistory(chatId: string, limit = 50, before?: string): Observable<ChatMessage[]> {
    let params = new HttpParams().set('limit', Math.min(limit, 100));
    if (before) params = params.set('before', before);

    return this.http.get<ChatMessage[]>(`${this.base}${ApiEndpoints.messages.byChat(chatId)}`, { params });
  }

  // REST send — reliable across reconnects (per the spec). A low-latency
  // SignalR alternative exists as ChatHubService.sendMessage().
  sendMessage(chatId: string, request: SendMessageRequest): Observable<{ messageId: string }> {
    return this.http.post<{ messageId: string }>(`${this.base}${ApiEndpoints.messages.byChat(chatId)}`, request);
  }

  markRead(chatId: string): Observable<void> {
    return this.http.post<void>(`${this.base}${ApiEndpoints.messages.markRead(chatId)}`, {});
  }
}
