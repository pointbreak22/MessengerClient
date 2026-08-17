export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string;
  own: boolean;
}
