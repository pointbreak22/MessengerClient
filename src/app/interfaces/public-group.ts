// API shape (GET /chats/public). Deliberately lighter than ChatSummary — no
// members/unreadCount, since those aren't meaningful before you've joined.
export interface PublicGroupDto {
  id: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
  isMember: boolean;
}
