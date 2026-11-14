/**
 * Sound effects, synthesised in the browser rather than loaded as files.
 *
 * Why synthesised: the whole app is static files on a CDN, and a handful
 * of audio files would be the only network requests at play time — the
 * slowest asset, the one most likely to 404, and the one that would make
 * the first capture of a session silent while it loaded. Synthesis is a
 * few hundred bytes of code, always ready, and the pitch can track what
 * actually happened in the game.
 *
 * Browsers refuse to start audio before a user gesture, so the context is
 * created lazily on the first real interaction and nothing is attempted
 * before then.
 */

export type Sfx =
  | 'select'      // picking a card up
  | 'rotate'      // turning it
  | 'place'       // committing it to a cell
  | 'capture'     // one card taken
  | 'cascade'     // the chain reaching further
  | 'ability'     // an ability firing
  | 'nothing'     // a placement that matched nothing
  | 'win'
  | 'lose';

let ctx: AudioContext | null = null;
let muted = false;

export const isMuted = (): boolean => muted;

export function setMuted(m: boolean): void {
  muted = m;
  try {
    if (m) localStorage.setItem('cascade.muted', '1');
    else localStorage.removeItem('cascade.muted');
  } catch { /* private browsing; the setting just will not persist */ }
}

export function loadMuted(): boolean {
  try { muted = localStorage.getItem('cascade.muted') === '1'; }
  catch { muted = false; }
  return muted;
}

function audio(): AudioContext | null {
  if (muted) return null;
  // no window at all means this is running outside a browser -- a
  // prerender, or a test. The game must carry on silently rather than
  // throw, which is what a ReferenceError here would do.
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!C) return null;            // no Web Audio: the game plays silent
    try { ctx = new C(); } catch { return null; }
  }
  // a context created before the first gesture starts suspended
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface Tone {
  freq: number;
  /** seconds */
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** ends on this frequency instead of holding */
  slideTo?: number;
  /** seconds to wait before starting */
  delay?: number;
}

function play(tones: Tone[]): void {
  const a = audio();
  if (!a) return;
  const now = a.currentTime;
  for (const t of tones) {
    const start = now + (t.delay ?? 0);
    const osc = a.createOscillator();
    const amp = a.createGain();
    osc.type = t.type ?? 'sine';
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.slideTo) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(t.slideTo, 1), start + t.dur);
    }
    // a short attack and an exponential tail: a linear fade to zero
    // clicks, and an instant start pops
    const peak = (t.gain ?? 0.18);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    osc.connect(amp).connect(a.destination);
    osc.start(start);
    osc.stop(start + t.dur + 0.02);
  }
}

/**
 * `n` lets a sound track the game: successive captures in one chain rise
 * in pitch, so a four-card cascade is audibly bigger than a one-card
 * capture without needing four different samples.
 */
export function sfx(kind: Sfx, n = 0): void {
  switch (kind) {
    case 'select':
      play([{ freq: 520, dur: 0.05, type: 'triangle', gain: 0.07 }]);
      break;
    case 'rotate':
      play([{ freq: 300, dur: 0.07, type: 'square', gain: 0.05,
              slideTo: 420 }]);
      break;
    case 'place':
      play([{ freq: 180, dur: 0.11, type: 'triangle', gain: 0.16 },
            { freq: 90, dur: 0.14, type: 'sine', gain: 0.12 }]);
      break;
    case 'capture': {
      // a fifth above the root, climbing a semitone per card in the chain
      const root = 440 * Math.pow(2, Math.min(n, 7) / 12);
      play([{ freq: root, dur: 0.1, type: 'triangle', gain: 0.14 },
            { freq: root * 1.5, dur: 0.14, type: 'sine', gain: 0.1,
              delay: 0.03 }]);
      break;
    }
    case 'cascade': {
      const root = 330 * Math.pow(2, Math.min(n, 6) / 12);
      play([{ freq: root, dur: 0.16, type: 'sine', gain: 0.13,
              slideTo: root * 2 }]);
      break;
    }
    case 'ability':
      play([{ freq: 660, dur: 0.07, type: 'square', gain: 0.07 },
            { freq: 990, dur: 0.1, type: 'sine', gain: 0.09, delay: 0.05 }]);
      break;
    case 'nothing':
      play([{ freq: 160, dur: 0.13, type: 'sine', gain: 0.1,
              slideTo: 110 }]);
      break;
    case 'win':
      play([{ freq: 523, dur: 0.16, type: 'triangle', gain: 0.14 },
            { freq: 659, dur: 0.16, type: 'triangle', gain: 0.14,
              delay: 0.11 },
            { freq: 784, dur: 0.3, type: 'triangle', gain: 0.15,
              delay: 0.22 }]);
      break;
    case 'lose':
      play([{ freq: 392, dur: 0.18, type: 'sine', gain: 0.13 },
            { freq: 311, dur: 0.18, type: 'sine', gain: 0.13,
              delay: 0.13 },
            { freq: 233, dur: 0.34, type: 'sine', gain: 0.14,
              delay: 0.26 }]);
      break;
  }
}

/** Called from the first click, so the context exists before it is needed. */
export function primeAudio(): void {
  audio();
}
