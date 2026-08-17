// Real API shape (GET /chats/me) — distinct from interfaces/chat.ts, which is
// the mock/UI-facing shape MockDataService still drives the current UI with.
export interface ChatMember {
  chatId: string;
  userId: string;
  joinedAt: string;
}

export interface ChatSummary {
  id: string;
  name: string | null; // null for a direct chat
  isGroup: boolean;
  ownerId: string | null; // null for a direct chat
  createdAt: string;
  members: ChatMember[];
  unreadCount: number;
}
