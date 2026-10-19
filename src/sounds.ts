/// Game sounds, synthesised with the Web Audio API: no files to download.
import { useSyncExternalStore } from 'react';

const KEY = 'tressette.sound';

function savedOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    // Storage can be unavailable (private mode, blocked site data): sounds stay on.
    return true;
  }
}

let on = savedOn();
const listeners = new Set<() => void>();

export function setSoundOn(value: boolean) {
  on = value;
  try {
    localStorage.setItem(KEY, value ? 'on' : 'off');
  } catch {
    // Not remembering the choice is fine.
  }
  listeners.forEach((l) => l());
}

/** The sound setting, kept in step across every component that shows it. */
export function useSoundOn(): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => on,
  );
  return [value, setSoundOn];
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

/** The audio context, made on first use (after the player has clicked, so browsers allow it to play). */
function audio(): { ctx: AudioContext; out: GainNode; noise: AudioBuffer } | null {
  if (!on) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, out: master!, noise: noise! };
  } catch {
    return null;
  }
}

/** A burst of filtered noise: the sound of card on card or card on cloth. */
function burst(opts: { duration: number; gain: number; type: BiquadFilterType; from: number; to?: number; q?: number; delay?: number }) {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + (opts.delay ?? 0);
  const src = a.ctx.createBufferSource();
  src.buffer = a.noise;
  const filter = a.ctx.createBiquadFilter();
  filter.type = opts.type;
  filter.Q.value = opts.q ?? 1;
  filter.frequency.setValueAtTime(opts.from, t);
  if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, t + opts.duration);
  const env = a.ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(opts.gain, t + Math.min(0.01, opts.duration / 4));
  env.gain.exponentialRampToValueAtTime(0.001, t + opts.duration);
  src.connect(filter).connect(env).connect(a.out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + opts.duration + 0.02);
}

/** A soft plucked note. */
function note(freq: number, opts: { delay?: number; duration?: number; gain?: number; type?: OscillatorType; slideTo?: number } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + (opts.delay ?? 0);
  const duration = opts.duration ?? 0.3;
  const osc = a.ctx.createOscillator();
  osc.type = opts.type ?? 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + duration);
  const env = a.ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(opts.gain ?? 0.25, t + 0.01);
  env.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(env).connect(a.out);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// Notes of C major, for the little phrases.
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, A4 = 440, F4 = 349.23, D4 = 293.66;

export const sounds = {
  /** A card dealt onto the table. */
  deal: () => burst({ duration: 0.04, gain: 0.18, type: 'bandpass', from: 3200, q: 1.5 }),
  /** A card played: a very soft brush on the cloth. */
  play: () => {
    burst({ duration: 0.05, gain: 0.06, type: 'bandpass', from: 2500, q: 0.8 });
    note(120, { duration: 0.06, gain: 0.04, type: 'sine', slideTo: 70 });
  },
  /** Cards drawn from the deck: each slides off the top and lands with a light flick, one after the other. */
  draw: () => {
    for (const delay of [0, 0.16]) {
      burst({ duration: 0.11, gain: 0.07, type: 'lowpass', from: 2200, to: 900, delay });
      burst({ duration: 0.025, gain: 0.05, type: 'bandpass', from: 3400, q: 1.5, delay: delay + 0.1 });
    }
  },
  /** A trick gathered up; brighter when our side takes it. */
  collect: (ours: boolean) => {
    burst({ duration: 0.28, gain: 0.18, type: 'bandpass', from: 2400, to: 600, q: 1.2 });
    if (ours) note(G5, { delay: 0.12, duration: 0.25, gain: 0.12 });
  },
  /** An accuso or a signal announced. */
  announce: () => {
    note(E5, { duration: 0.25, gain: 0.18 });
    note(C6, { delay: 0.12, duration: 0.35, gain: 0.16 });
  },
  /** The end of a hand (after the last trick's own sound). */
  hand: (won: boolean) =>
    (won ? [C5, E5, G5] : [A4, F4]).forEach((f, i) => note(f, { delay: 0.35 + i * 0.13, duration: 0.35, gain: 0.18 })),
  /** The end of the game. */
  game: (won: boolean) =>
    (won ? [C5, E5, G5, C6, G5, C6] : [A4, F4, D4]).forEach((f, i, all) =>
      note(f, { delay: 0.35 + i * 0.15, duration: i === all.length - 1 ? 0.8 : 0.3, gain: 0.2 }),
    ),
};
