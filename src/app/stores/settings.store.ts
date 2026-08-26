import { Injectable, signal } from '@angular/core';
import { playTones } from '../shared/audio-tone';

// Client-only preferences — no backend endpoint for these exists, so they're
// persisted in localStorage rather than synced across devices.
const STORAGE_KEY_DESKTOP = 'pbm:settings:desktopNotifications';
const STORAGE_KEY_SOUND = 'pbm:settings:soundOnMessage';

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : raw === 'true';
}

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly _desktopNotifications = signal(readBool(STORAGE_KEY_DESKTOP, false));
  private readonly _soundOnMessage = signal(readBool(STORAGE_KEY_SOUND, true));
  private readonly _permission = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );

  readonly desktopNotifications = this._desktopNotifications.asReadonly();
  readonly soundOnMessage = this._soundOnMessage.asReadonly();
  readonly notificationPermission = this._permission.asReadonly();

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

  // Called by MessageStore for a NewMessage that isn't from the current user
  // and isn't for the chat currently open — the caller already knows that,
  // this just renders the preference into an actual sound/popup.
  notifyNewMessage(title: string, body: string): void {
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
