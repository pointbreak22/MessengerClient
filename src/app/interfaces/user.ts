export interface User {
  id: string;
  name: string;
  initials: string;
  online: boolean;
  status: string;
  role?: string;
  bio?: string;
  location?: string;
}
