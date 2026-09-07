// Mirrors Domain.Enums.UserRole — serialised as a number, so the values are part
// of the API contract and must not be renumbered.
export enum UserRole {
  User = 0,
  SuperAdmin = 1,
}

// API shape (GET /users, /users/me, /users/{id}, /friends/me).
export interface UserProfile {
  id: string;
  userName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt: string;
  // Both only ever populated for the signed-in user (GET /users/me); listings of
  // other people leave them out. `role` decides whether the admin entry point is
  // shown — the server enforces the real thing regardless.
  email?: string | null;
  role?: UserRole;
}
