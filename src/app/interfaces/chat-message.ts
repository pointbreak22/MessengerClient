// Real API shape (GET /messages/{chatId}) — distinct from interfaces/message.ts,
// which is the mock/UI-facing shape MockDataService still drives the current UI with.
export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string | null;
  attachmentUrl: string | null;
  createdAt: string;
}
