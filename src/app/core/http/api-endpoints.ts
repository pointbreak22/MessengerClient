export const ApiEndpoints = {
  users: {
    list: '/users',
    me: '/users/me',
    byId: (id: string) => `/users/${id}`,
    avatar: '/users/me/avatar',
  },
  chats: {
    mine: '/chats/me',
    byId: (chatId: string) => `/chats/${chatId}`,
    direct: (targetUserId: string) => `/chats/direct/${targetUserId}`,
    group: '/chats/group',
    addMember: (chatId: string) => `/chats/${chatId}/members`,
    member: (chatId: string, userId: string) => `/chats/${chatId}/members/${userId}`,
    public: '/chats/public',
    join: (chatId: string) => `/chats/${chatId}/join`,
    leave: (chatId: string) => `/chats/${chatId}/leave`,
  },
  messages: {
    byChat: (chatId: string) => `/messages/${chatId}`, // GET history / POST send
    markRead: (chatId: string) => `/messages/${chatId}/read`,
    search: '/messages/search',
  },
  friends: {
    mine: '/friends/me',
    requests: '/friends/requests',
    sendRequest: (friendId: string) => `/friends/${friendId}`,
    accept: (friendId: string) => `/friends/${friendId}/accept`,
    remove: (friendId: string) => `/friends/${friendId}`,
  },
  attachments: {
    upload: '/attachments/upload',
  },
};
