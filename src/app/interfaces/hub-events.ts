// Confirmed server->client SignalR /chathub event payloads.

export interface NewMessageEvent {
  messageId: string;
  chatId: string;
  senderId: string;
  text: string | null;
  attachmentUrl: string | null;
}

export interface FriendRequestAcceptedEvent {
  by: string;
}

export interface AddedToGroupEvent {
  chatId: string;
  chatName: string;
}
