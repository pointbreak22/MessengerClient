// A curated set of standard/common emoji, grouped for a lightweight picker —
// deliberately not a full Unicode emoji database (no new dependency, keeps
// bundle size down): just the ones people actually reach for most.
export interface EmojiCategory {
  label: string;
  emojis: string[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    label: 'Smileys',
    emojis: ['😀', '😂', '🤣', '😊', '😉', '😍', '😘', '😜', '🤔', '😎', '😴', '😢', '😭', '😡', '😱', '🥳'],
  },
  {
    label: 'Gestures',
    emojis: ['👍', '👎', '👋', '👏', '🙏', '💪', '🤝', '✌️', '🤞', '👌', '🤙', '🖐️'],
  },
  {
    label: 'Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💯', '✨', '🔥'],
  },
  {
    label: 'Other',
    emojis: ['🎉', '🎂', '☕', '🍕', '⚽', '🎵', '📷', '💡', '⭐', '✅', '❌', '⏰'],
  },
];
