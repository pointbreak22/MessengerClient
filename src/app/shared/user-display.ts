// Neither UserProfile nor ChatSummary carries display-ready initials or a
// presence label — both are DB-shaped, not UI-shaped. These helpers bridge that.

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function formatLastSeen(lastSeenAt: string): string {
  const elapsedMs = Date.now() - new Date(lastSeenAt).getTime();
  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 1) return 'Last seen just now';
  if (minutes < 60) return `Last seen ${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `Last seen ${days}d ago`;

  return `Last seen ${new Date(lastSeenAt).toLocaleDateString()}`;
}

export function formatMessageTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
