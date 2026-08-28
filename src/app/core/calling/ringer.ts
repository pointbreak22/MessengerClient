import { playTones } from '../../shared/audio-tone';

const VOICE_RING_INTERVAL_MS = 2000;
const VIDEO_RING_INTERVAL_MS = 2600;

// Original synthesized rings, not lifted from any app's actual sound assets —
// a short melodic ascending pattern for video (Skype-ish feel), a sharper
// double-beep for voice (Discord-ish feel), looped until answered. Shared by
// CallService (1:1) and GroupCallService — both rang identically before this
// was pulled out, so there's nothing per-service to parameterize beyond
// "video or not".
export class Ringer {
  private timer?: ReturnType<typeof setInterval>;

  start(video: boolean): void {
    this.stop();
    const ring = video ? Ringer.playVideoRingCycle : Ringer.playVoiceRingCycle;
    ring();
    this.timer = setInterval(ring, video ? VIDEO_RING_INTERVAL_MS : VOICE_RING_INTERVAL_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private static playVoiceRingCycle(): void {
    playTones([
      { freq: 587, start: 0, duration: 0.18 },
      { freq: 587, start: 0.26, duration: 0.18 },
    ]);
  }

  private static playVideoRingCycle(): void {
    playTones([
      { freq: 523, start: 0, duration: 0.16 },
      { freq: 659, start: 0.18, duration: 0.16 },
      { freq: 784, start: 0.36, duration: 0.24 },
    ]);
  }
}
