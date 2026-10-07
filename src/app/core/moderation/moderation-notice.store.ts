import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';

// Body of the API's 422 { code: 'content_violation' } (and of the hub's
// ContentViolation event): the server's auto-moderation rejected a message,
// nickname or chat name containing profanity.
export interface ContentViolation {
  code: 'content_violation';
  message: string;
  target: 'message' | 'userName' | 'chatName';
  matchedWords: string[];
  // Same text with the bad words softened ("пиздец" → "капец"), or null.
  suggestion: string | null;
  strike: number;
  maxStrikes: number;
  banned: boolean;
}

export function asContentViolation(err: unknown): ContentViolation | null {
  return err instanceof HttpErrorResponse && err.status === 422 && err.error?.code === 'content_violation'
    ? (err.error as ContentViolation)
    : null;
}

// Last moderation rejection, shown app-wide by <app-moderation-notice>. Set by
// apiAuthInterceptor, so every endpoint (send, edit, profile, group name) is
// covered without each caller handling it.
@Injectable({ providedIn: 'root' })
export class ModerationNoticeStore {
  private readonly _notice = signal<ContentViolation | null>(null);
  readonly notice = this._notice.asReadonly();

  show(violation: ContentViolation): void {
    this._notice.set(violation);
  }

  dismiss(): void {
    this._notice.set(null);
  }
}
