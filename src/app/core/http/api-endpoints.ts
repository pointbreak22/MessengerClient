export const ApiEndpoints = {
  users: {
    list: '/users',
    me: '/users/me',
    byId: (id: string) => `/users/${id}`,
    avatar: '/users/me/avatar',
  },
  chats: {
    mine: '/chats/me',
    direct: (targetUserId: string) => `/chats/direct/${targetUserId}`,
    group: '/chats/group',
    addMember: (chatId: string) => `/chats/${chatId}/members`,
  },
  messages: {
    byChat: (chatId: string) => `/messages/${chatId}`, // GET history / POST send
    markRead: (chatId: string) => `/messages/${chatId}/read`,
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
