// Small original notification tones synthesized via Web Audio API — not
// copies of any app's actual sound assets (those are copyrighted), just
// short original beeps in a similar spirit (message blip, call rings).
let sharedCtx: AudioContext | undefined;

function getAudioContext(): AudioContext | undefined {
  if (sharedCtx) return sharedCtx;
  if (typeof AudioContext === 'undefined') return undefined;
  sharedCtx = new AudioContext();
  return sharedCtx;
}

// Browsers create every AudioContext "suspended" until a real user gesture
// unlocks it — without this, scheduled tones silently produce no sound (no
// error either) until the user happens to click/type/tap for some unrelated
// reason. Grab the first real interaction and resume proactively so it's
// already unlocked by the time an actual notification needs to play.
if (typeof document !== 'undefined') {
  const unlock = () => void getAudioContext()?.resume().catch(() => {});
  for (const type of ['pointerdown', 'keydown', 'touchstart']) {
    document.addEventListener(type, unlock, { passive: true });
  }
}

export interface ToneStep {
  freq: number;
  start: number; // seconds from now
  duration: number; // seconds
  gain?: number;
  type?: OscillatorType;
}

// Schedules a short set of tones on a shared AudioContext. Fire-and-forget —
// each oscillator disconnects itself once its envelope finishes.
export function playTones(steps: ToneStep[]): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state !== 'running') void ctx.resume();
    for (const step of steps) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = step.type ?? 'sine';
      osc.frequency.value = step.freq;

      const t0 = ctx.currentTime + step.start;
      const peak = step.gain ?? 0.15;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + step.duration);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + step.duration + 0.02);
    }
  } catch {
    // Browser autoplay/audio policies can silently block this — not worth
    // surfacing an error for a missed notification sound.
  }
}
