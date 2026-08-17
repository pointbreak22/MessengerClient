// API shape (GET /users, /users/me, /users/{id}, /friends/me).
export interface UserProfile {
  id: string;
  userName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt: string;
}
