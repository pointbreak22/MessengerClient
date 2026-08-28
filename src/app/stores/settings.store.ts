import { Injectable, signal } from '@angular/core';
import { playTones } from '../shared/audio-tone';

// Client-only preferences — no backend endpoint for these exists, so they're
// persisted in localStorage rather than synced across devices.
const STORAGE_KEY_DESKTOP = 'pbm:settings:desktopNotifications';
const STORAGE_KEY_SOUND = 'pbm:settings:soundOnMessage';
const STORAGE_KEY_MUTED_CHATS = 'pbm:settings:mutedChatIds';
const STORAGE_KEY_CAMERA = 'pbm:settings:preferredCameraId';
const STORAGE_KEY_MIC = 'pbm:settings:preferredMicId';

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : raw === 'true';
}

function readStringSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly _desktopNotifications = signal(readBool(STORAGE_KEY_DESKTOP, false));
  private readonly _soundOnMessage = signal(readBool(STORAGE_KEY_SOUND, true));
  private readonly _permission = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );
  private readonly _mutedChatIds = signal<Set<string>>(readStringSet(STORAGE_KEY_MUTED_CHATS));
  private readonly _preferredCameraId = signal<string | null>(localStorage.getItem(STORAGE_KEY_CAMERA));
  private readonly _preferredMicId = signal<string | null>(localStorage.getItem(STORAGE_KEY_MIC));

  readonly desktopNotifications = this._desktopNotifications.asReadonly();
  readonly soundOnMessage = this._soundOnMessage.asReadonly();
  readonly notificationPermission = this._permission.asReadonly();
  readonly mutedChatIds = this._mutedChatIds.asReadonly();
  readonly preferredCameraId = this._preferredCameraId.asReadonly();
  readonly preferredMicId = this._preferredMicId.asReadonly();

  setPreferredCameraId(deviceId: string | null): void {
    this._preferredCameraId.set(deviceId);
    if (deviceId) localStorage.setItem(STORAGE_KEY_CAMERA, deviceId);
    else localStorage.removeItem(STORAGE_KEY_CAMERA);
  }

  setPreferredMicId(deviceId: string | null): void {
    this._preferredMicId.set(deviceId);
    if (deviceId) localStorage.setItem(STORAGE_KEY_MIC, deviceId);
    else localStorage.removeItem(STORAGE_KEY_MIC);
  }

  async setDesktopNotifications(enabled: boolean): Promise<void> {
    if (enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      this._permission.set(result);
      if (result !== 'granted') {
        this._desktopNotifications.set(false);
        localStorage.setItem(STORAGE_KEY_DESKTOP, 'false');
        return;
      }
    }
    this._desktopNotifications.set(enabled);
    localStorage.setItem(STORAGE_KEY_DESKTOP, String(enabled));
  }

  setSoundOnMessage(enabled: boolean): void {
    this._soundOnMessage.set(enabled);
    localStorage.setItem(STORAGE_KEY_SOUND, String(enabled));
  }

  isChatMuted(chatId: string): boolean {
    return this._mutedChatIds().has(chatId);
  }

  toggleChatMute(chatId: string): void {
    this._mutedChatIds.update((set) => {
      const next = new Set(set);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      localStorage.setItem(STORAGE_KEY_MUTED_CHATS, JSON.stringify([...next]));
      return next;
    });
  }

  // Called by MessageStore for a NewMessage that isn't from the current user
  // and isn't for the chat currently open — the caller already knows that,
  // this just renders the preference into an actual sound/popup. Still
  // increments the unread badge even when muted — mute only silences
  // sound/popup, same convention as every other messenger.
  notifyNewMessage(chatId: string, title: string, body: string): void {
    if (this.isChatMuted(chatId)) return;
    if (this._soundOnMessage()) this.playChime();

    if (this._desktopNotifications() && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/logo-192.png' });
    }
  }

  // Two quick ascending notes — an original "blip", not a copy of any app's
  // actual message sound.
  private playChime(): void {
    playTones([
      { freq: 740, start: 0, duration: 0.11 },
      { freq: 1020, start: 0.09, duration: 0.16 },
    ]);
  }
}
