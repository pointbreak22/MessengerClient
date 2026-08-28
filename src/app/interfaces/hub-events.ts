// Confirmed server->client SignalR /chathub event payloads.

export interface NewMessageEvent {
  messageId: string;
  chatId: string;
  senderId: string;
  text: string | null;
  attachmentUrl: string | null;
  replyToMessageId: string | null;
}

export interface MessageEditedEvent {
  chatId: string;
  messageId: string;
  text: string;
  editedAt: string;
}

export interface MessageDeletedEvent {
  chatId: string;
  messageId: string;
}

export interface MessageReactionsChangedEvent {
  chatId: string;
  messageId: string;
  reactions: { emoji: string; userId: string }[];
}

export interface FriendRequestAcceptedEvent {
  by: string;
}

export interface AddedToGroupEvent {
  chatId: string;
  chatName: string;
}

// Sent to every member (not just the one who made the change) whenever a
// group's name or avatar is updated.
export interface ChatUpdatedEvent {
  chatId: string;
  name: string | null;
  avatarUrl: string | null;
}
