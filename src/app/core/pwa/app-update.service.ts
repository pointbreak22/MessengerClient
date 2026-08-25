import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

// The service worker only swaps in a new version on the next full reload —
// it never disrupts an already-open tab (see provideServiceWorker's comment
// in app.config.ts). For a messenger people tend to leave open for days,
// that means "check on startup" alone could leave someone on a stale build
// indefinitely, so this also polls periodically and exposes a signal a
// banner can react to, letting the user opt into reloading when it's
// convenient for them rather than reloading out from under them.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);

  readonly updateAvailable = signal(false);

  constructor() {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.updateAvailable.set(true));

    setInterval(() => void this.swUpdate.checkForUpdate(), CHECK_INTERVAL_MS);
  }

  reload(): void {
    document.location.reload();
  }
}
