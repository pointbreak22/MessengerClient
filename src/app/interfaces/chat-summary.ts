// API shape (GET /chats/me).
export interface ChatMember {
  chatId: string;
  userId: string;
  joinedAt: string;
}

export interface ChatSummary {
  id: string;
  name: string | null; // null for a direct chat
  isGroup: boolean;
  isPublic: boolean; // always false for a direct chat; splits the Chats/Groups tabs
  ownerId: string | null; // null for a direct chat
  createdAt: string;
  members: ChatMember[];
  unreadCount: number;
}
