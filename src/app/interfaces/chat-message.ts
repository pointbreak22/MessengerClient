// API shape (GET /messages/{chatId}, POST /messages/{chatId}, NewMessage event).
export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  editedAt: string | null;
}
