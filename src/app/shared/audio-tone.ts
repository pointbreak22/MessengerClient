// Small original notification tones synthesized via Web Audio API — not
// copies of any app's actual sound assets (those are copyrighted), just
// short original beeps in a similar spirit (message blip, call rings).
let sharedCtx: AudioContext | undefined;

function getAudioContext(): AudioContext {
  sharedCtx ??= new AudioContext();
  return sharedCtx;
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
