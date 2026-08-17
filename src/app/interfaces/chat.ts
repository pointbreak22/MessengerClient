export type ChatType = 'direct' | 'group';

export interface Chat {
  id: string;
  type: ChatType;
  name: string;
  message: string;
  time: string;
  initials: string;
  unread?: number;
  online?: boolean;
  memberIds?: string[];
}
