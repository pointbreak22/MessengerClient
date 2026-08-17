import { Injectable, computed, signal } from '@angular/core';
import { Chat } from '../interfaces/chat';
import { Message } from '../interfaces/message';
import { User } from '../interfaces/user';

@Injectable({ providedIn: 'root' })
export class MockDataService {
  readonly currentUser: User = {
    id: 'me',
    name: 'Rohan Mehta',
    initials: 'RM',
    online: true,
    status: 'Online',
    role: 'Administrator',
  };

  private readonly usersById: Record<string, User> = {
    'u-alex': { id: 'u-alex', name: 'Alex Morgan', initials: 'AM', online: true, status: 'Online', bio: 'Product designer who loves traveling, photography and good coffee.', location: 'New York, USA' },
    'u-sarah': { id: 'u-sarah', name: 'Sarah Wilson', initials: 'SW', online: true, status: 'Online', bio: 'Frontend engineer, coffee addict, weekend hiker.', location: 'Austin, USA' },
    'u-john': { id: 'u-john', name: 'John Cooper', initials: 'JC', online: false, status: 'Last seen yesterday', bio: 'Backend engineer. Building things that scale.', location: 'Seattle, USA' },
    'u-michael': { id: 'u-michael', name: 'Michael Chen', initials: 'MC', online: true, status: 'Online', bio: 'Full-stack developer, open-source contributor.', location: 'Toronto, Canada' },
    'u-emma': { id: 'u-emma', name: 'Emma Davis', initials: 'ED', online: false, status: 'Last seen 3h ago', bio: 'UX researcher. Loves clean interfaces.', location: 'London, UK' },
    'u-liam': { id: 'u-liam', name: 'Liam Turner', initials: 'LT', online: true, status: 'Online', bio: 'QA engineer. Breaks things on purpose.', location: 'Dublin, Ireland' },
    'u-sophia': { id: 'u-sophia', name: 'Sophia Bennett', initials: 'SB', online: false, status: 'Last seen 5 min ago', bio: 'Product manager. Always shipping.', location: 'Berlin, Germany' },
    'u-noah': { id: 'u-noah', name: 'Noah Carter', initials: 'NC', online: true, status: 'Online', bio: 'DevOps engineer. Automates everything.', location: 'Amsterdam, Netherlands' },
  };

  readonly friends = signal<User[]>(Object.values(this.usersById));

  readonly chats = signal<Chat[]>([
    { id: 'c-alex', type: 'direct', name: 'Alex Morgan', message: 'See you tomorrow!', time: '10:42', initials: 'AM', online: true, unread: 2 },
    { id: 'g-dev', type: 'group', name: 'Development Team', message: 'Michael: I pushed the changes', time: '09:31', initials: 'DT', unread: 5, memberIds: ['me', 'u-michael', 'u-sarah', 'u-noah'] },
    { id: 'c-sarah', type: 'direct', name: 'Sarah Wilson', message: 'Thanks!', time: 'Yesterday', initials: 'SW', online: true },
    { id: 'c-john', type: 'direct', name: 'John Cooper', message: 'Can you send me the file?', time: 'Yesterday', initials: 'JC', online: false },
    { id: 'g-design', type: 'group', name: 'Design Crew', message: 'Sophia: new mockups are up', time: 'Yesterday', initials: 'DC', unread: 3, memberIds: ['me', 'u-alex', 'u-emma', 'u-sophia'] },
    { id: 'g-trip', type: 'group', name: 'Weekend Trip', message: 'Liam: who is driving?', time: 'Monday', initials: 'WT', memberIds: ['me', 'u-john', 'u-liam', 'u-sarah'] },
    { id: 'c-michael', type: 'direct', name: 'Michael Chen', message: 'Sounds good, talk soon', time: 'Monday', initials: 'MC', online: true },
  ]);

  readonly groups = computed(() => this.chats().filter((c) => c.type === 'group'));

  private readonly directChatByUserId: Record<string, string> = {
    'u-alex': 'c-alex',
    'u-sarah': 'c-sarah',
    'u-john': 'c-john',
    'u-michael': 'c-michael',
  };

  private readonly messagesByChat = signal<Record<string, Message[]>>({
    'c-alex': [
      { id: 'm1', chatId: 'c-alex', senderId: 'u-alex', senderName: 'Alex Morgan', text: 'Hey! How is the redesign going?', time: '10:12', own: false },
      { id: 'm2', chatId: 'c-alex', senderId: 'me', senderName: 'You', text: 'Almost done, finishing the right panel', time: '10:20', own: true },
      { id: 'm3', chatId: 'c-alex', senderId: 'u-alex', senderName: 'Alex Morgan', text: 'Nice, send me a preview when you can', time: '10:35', own: false },
      { id: 'm4', chatId: 'c-alex', senderId: 'u-alex', senderName: 'Alex Morgan', text: 'See you tomorrow!', time: '10:42', own: false },
    ],
    'g-dev': [
      { id: 'm5', chatId: 'g-dev', senderId: 'u-noah', senderName: 'Noah Carter', text: 'Deploy pipeline is green ✅', time: '09:10', own: false },
      { id: 'm6', chatId: 'g-dev', senderId: 'u-michael', senderName: 'Michael Chen', text: 'I pushed the changes', time: '09:31', own: false },
    ],
    'c-sarah': [
      { id: 'm7', chatId: 'c-sarah', senderId: 'me', senderName: 'You', text: 'Thanks for the review!', time: 'Yesterday', own: true },
      { id: 'm8', chatId: 'c-sarah', senderId: 'u-sarah', senderName: 'Sarah Wilson', text: 'Thanks!', time: 'Yesterday', own: false },
    ],
    'c-john': [
      { id: 'm9', chatId: 'c-john', senderId: 'u-john', senderName: 'John Cooper', text: 'Can you send me the file?', time: 'Yesterday', own: false },
    ],
    'g-design': [
      { id: 'm10', chatId: 'g-design', senderId: 'u-sophia', senderName: 'Sophia Bennett', text: 'New mockups are up', time: 'Yesterday', own: false },
    ],
    'g-trip': [
      { id: 'm11', chatId: 'g-trip', senderId: 'u-liam', senderName: 'Liam Turner', text: 'Who is driving?', time: 'Monday', own: false },
    ],
    'c-michael': [
      { id: 'm12', chatId: 'c-michael', senderId: 'u-michael', senderName: 'Michael Chen', text: 'Sounds good, talk soon', time: 'Monday', own: false },
    ],
  });

  readonly selectedChatId = signal<string | null>(null);

  readonly selectedChat = computed<Chat | null>(() => {
    const id = this.selectedChatId();
    if (!id) return null;
    return this.chats().find((c) => c.id === id) ?? null;
  });

  readonly selectedChatMessages = computed<Message[]>(() => {
    const id = this.selectedChatId();
    if (!id) return [];
    return this.messagesByChat()[id] ?? [];
  });

  readonly selectedChatMembers = computed<User[]>(() => {
    const chat = this.selectedChat();
    if (!chat?.memberIds) return [];
    return chat.memberIds
      .filter((id) => id !== 'me')
      .map((id) => this.usersById[id])
      .filter((u): u is User => !!u);
  });

  readonly selectedChatContact = computed<User | null>(() => {
    const chat = this.selectedChat();
    if (!chat || chat.type !== 'direct') return null;
    const userId = Object.keys(this.directChatByUserId).find((id) => this.directChatByUserId[id] === chat.id);
    return userId ? this.usersById[userId] : null;
  });

  readonly onlineFriends = computed(() => this.friends().filter((u) => u.online));

  selectChat(id: string): void {
    this.selectedChatId.set(id);
  }

  closeChat(): void {
    this.selectedChatId.set(null);
  }

  openDirectChatWithUser(userId: string): void {
    const existing = this.directChatByUserId[userId];
    if (existing) {
      this.selectChat(existing);
      return;
    }
    const user = this.usersById[userId];
    if (!user) return;
    const chatId = `c-${userId}`;
    this.directChatByUserId[userId] = chatId;
    this.chats.update((list) => [
      { id: chatId, type: 'direct', name: user.name, message: 'Say hi 👋', time: 'now', initials: user.initials, online: user.online },
      ...list,
    ]);
    this.selectChat(chatId);
  }

  sendMessage(chatId: string, text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const message: Message = {
      id: `m-${Date.now()}`,
      chatId,
      senderId: 'me',
      senderName: 'You',
      text: trimmed,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      own: true,
    };
    this.messagesByChat.update((byChat) => ({
      ...byChat,
      [chatId]: [...(byChat[chatId] ?? []), message],
    }));
    this.chats.update((list) =>
      list.map((c) => (c.id === chatId ? { ...c, message: trimmed, time: message.time, unread: 0 } : c)),
    );
  }
}
