// Real API shape (GET /users, /users/me, /users/{id}, /friends/me) — distinct
// from interfaces/user.ts, which is the mock/UI-facing shape MockDataService
// still drives the current UI with.
export interface UserProfile {
  id: string;
  userName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt: string;
}
