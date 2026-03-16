import { useUIStore } from '@/stores/uiStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SoundName =
  | 'orbSelect'
  | 'orbConfirm'
  | 'orbPlace'
  | 'timerTick'
  | 'timerUrgent'
  | 'attack'
  | 'crit'
  | 'dodge'
  | 'block'
  | 'death'
  | 'victory'
  | 'defeat'
  | 'synergyActivate'
  | 'combineMerge'
  | 'buttonClick'
  | 'phaseTransition';

// ---------------------------------------------------------------------------
// Master volume
// ---------------------------------------------------------------------------

const MASTER_VOLUME = 0.3;

// ---------------------------------------------------------------------------
// Lazy AudioContext (created on first user interaction)
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (useUIStore.getState().isMuted) return null;

  if (!audioCtx) {
    audioCtx = new AudioContext();
  }

  // Resume suspended context (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }

  return audioCtx;
}

// ---------------------------------------------------------------------------
// Noise buffer helper
// ---------------------------------------------------------------------------

function createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Sound implementations
// ---------------------------------------------------------------------------

/** Soft sine click (200ms, C4/261Hz, quick exponential fade) */
export function playOrbSelect(): void {
  const ctx = getContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = 261.63;

  gain.gain.setValueAtTime(MASTER_VOLUME, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}

/** Ascending 2-note sine (E4/330Hz -> G4/392Hz, 300ms total) */
export function playOrbConfirm(): void {
  const ctx = getContext();
  if (!ctx) return;

  const t = ctx.currentTime;

  // First note: E4
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.value = 329.63;
  gain1.gain.setValueAtTime(MASTER_VOLUME, t);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc1.connect(gain1).connect(ctx.destination);
  osc1.start(t);
  osc1.stop(t + 0.15);

  // Second note: G4
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.value = 392.0;
  gain2.gain.setValueAtTime(0.001, t);
  gain2.gain.setValueAtTime(MASTER_VOLUME, t + 0.15);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc2.connect(gain2).connect(ctx.destination);
  osc2.start(t + 0.15);
  osc2.stop(t + 0.3);
}

/** Bright triangle wave bell (400ms, A4/440Hz, longer decay) */
export function playOrbPlace(): void {
  const ctx = getContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.value = 440.0;

  gain.gain.setValueAtTime(MASTER_VOLUME, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
}

/** Short square wave bleep (100ms, D5/587Hz) */
export function playTimerTick(): void {
  const ctx = getContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.value = 587.33;

  gain.gain.setValueAtTime(MASTER_VOLUME, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
}

/** Fast square beep (200ms, F5/698Hz, louder gain 0.4) */
export function playTimerUrgent(): void {
  const ctx = getContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.value = 698.46;

  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}

/** Punchy noise thump: random noise through bandpass at 150Hz, 150ms, quick decay */
export function playAttack(): void {
  const ctx = getContext();
  if (!ctx) return;

  const buffer = createNoiseBuffer(ctx, 0.15);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 150;
  filter.Q.value = 1.0;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(MASTER_VOLUME, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
  source.stop(ctx.currentTime + 0.15);
}

/** Bright sine ding (A5/880Hz, 100ms) layered with noise thump (100ms) */
export function playCrit(): void {
  const ctx = getContext();
  if (!ctx) return;

  const t = ctx.currentTime;

  // Sine ding
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880.0;
  oscGain.gain.setValueAtTime(MASTER_VOLUME, t);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc.connect(oscGain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.1);

  // Noise thump
  const buffer = createNoiseBuffer(ctx, 0.1);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 150;
  filter.Q.value = 1.0;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(MASTER_VOLUME, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

  source.connect(filter).connect(noiseGain).connect(ctx.destination);
  source.start(t);
  source.stop(t + 0.1);
}

/** Ascending filtered noise whoosh: noise through bandpass sweeping 400Hz->2000Hz over 200ms */
export function playDodge(): void {
  const ctx = getContext();
  if (!ctx) return;

  const t = ctx.currentTime;

  const buffer = createNoiseBuffer(ctx, 0.2);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(400, t);
  filter.frequency.exponentialRampToValueAtTime(2000, t + 0.2);
  filter.Q.value = 2.0;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(MASTER_VOLUME, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(t);
  source.stop(t + 0.2);
}

/** Metallic square wave clang (E3/165Hz, 150ms, with slight detune for metallic feel) */
export function playBlock(): void {
  const ctx = getContext();
  if (!ctx) return;

  const t = ctx.currentTime;

  // Main oscillator
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'square';
  osc1.frequency.value = 164.81;
  gain1.gain.setValueAtTime(MASTER_VOLUME, t);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc1.connect(gain1).connect(ctx.destination);
  osc1.start(t);
  osc1.stop(t + 0.15);

  // Detuned oscillator for metallic feel
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'square';
  osc2.frequency.value = 164.81;
  osc2.detune.value = 15;
  gain2.gain.setValueAtTime(MASTER_VOLUME * 0.6, t);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc2.connect(gain2).connect(ctx.destination);
  osc2.start(t);
  osc2.stop(t + 0.15);
}

/** Descending sine (G3/196Hz -> C2/65Hz over 800ms, with volume fade) */
export function playDeath(): void {
  const ctx = getContext();
  if (!ctx) return;

  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(196.0, t);
  osc.frequency.exponentialRampToValueAtTime(65.41, t + 0.8);

  gain.gain.setValueAtTime(MASTER_VOLUME, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.8);
}

/** Ascending 3-note sine: C5(523Hz, 200ms) -> E5(659Hz, 200ms) -> G5(784Hz, 400ms with sustain) */
export function playVictory(): void {
  const ctx = getContext();
  if (!ctx) return;

  const t = ctx.currentTime;

  // C5
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.value = 523.25;
  gain1.gain.setValueAtTime(MASTER_VOLUME, t);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc1.connect(gain1).connect(ctx.destination);
  osc1.start(t);
  osc1.stop(t + 0.2);

  // E5
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.value = 659.25;
  gain2.gain.setValueAtTime(0.001, t);
  gain2.gain.setValueAtTime(MASTER_VOLUME, t + 0.2);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc2.connect(gain2).connect(ctx.destination);
  osc2.start(t + 0.2);
  osc2.stop(t + 0.4);

  // G5 (with sustain)
  const osc3 = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.type = 'sine';
  osc3.frequency.value = 783.99;
  gain3.gain.setValueAtTime(0.001, t);
  gain3.gain.setValueAtTime(MASTER_VOLUME, t + 0.4);
  gain3.gain.setValueAtTime(MASTER_VOLUME, t + 0.6);
  gain3.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  osc3.connect(gain3).connect(ctx.destination);
  osc3.start(t + 0.4);
  osc3.stop(t + 0.8);
}

/** Descending 3-note: E4(330Hz) -> C4(261Hz) -> A3(220Hz), minor feel, 800ms total */
export function playDefeat(): void {
  const ctx = getContext();
  if (!ctx) return;

  const t = ctx.currentTime;
  const noteDuration = 0.8 / 3;

  // E4
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.value = 329.63;
  gain1.gain.setValueAtTime(MASTER_VOLUME, t);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + noteDuration);
  osc1.connect(gain1).connect(ctx.destination);
  osc1.start(t);
  osc1.stop(t + noteDuration);

  // C4
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.value = 261.63;
  gain2.gain.setValueAtTime(0.001, t);
  gain2.gain.setValueAtTime(MASTER_VOLUME, t + noteDuration);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + noteDuration * 2);
  osc2.connect(gain2).connect(ctx.destination);
  osc2.start(t + noteDuration);
  osc2.stop(t + noteDuration * 2);

  // A3
  const osc3 = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.type = 'sine';
  osc3.frequency.value = 220.0;
  gain3.gain.setValueAtTime(0.001, t);
  gain3.gain.setValueAtTime(MASTER_VOLUME, t + noteDuration * 2);
  gain3.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  osc3.connect(gain3).connect(ctx.destination);
  osc3.start(t + noteDuration * 2);
  osc3.stop(t + 0.8);
}

/** Bright chime cascade: C5+E5+G5 staggered 100ms apart, triangle waves, 600ms total */
export function playSynergyActivate(): void {
  const ctx = getContext();
  if (!ctx) return;

  const t = ctx.currentTime;
  const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5

  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startTime = t + i * 0.1;

    osc.type = 'triangle';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.setValueAtTime(MASTER_VOLUME, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.4);
  });
}

/** Ascending sine sweep (200Hz->800Hz, 300ms) + noise burst (200ms) */
export function playCombineMerge(): void {
  const ctx = getContext();
  if (!ctx) return;

  const t = ctx.currentTime;

  // Ascending sine sweep
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(800, t + 0.3);
  oscGain.gain.setValueAtTime(MASTER_VOLUME, t);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(oscGain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.3);

  // Noise burst
  const buffer = createNoiseBuffer(ctx, 0.2);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 600;
  filter.Q.value = 1.0;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(MASTER_VOLUME * 0.5, t + 0.1);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

  source.connect(filter).connect(noiseGain).connect(ctx.destination);
  source.start(t + 0.1);
  source.stop(t + 0.3);
}

/** Subtle sine tick (50ms, A4/440Hz, very quiet gain 0.15) */
export function playButtonClick(): void {
  const ctx = getContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = 440.0;

  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.05);
}

/** Filtered noise swoosh: noise through bandpass sweeping 200Hz->1500Hz->200Hz over 400ms */
export function playPhaseTransition(): void {
  const ctx = getContext();
  if (!ctx) return;

  const t = ctx.currentTime;

  const buffer = createNoiseBuffer(ctx, 0.4);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(200, t);
  filter.frequency.exponentialRampToValueAtTime(1500, t + 0.2);
  filter.frequency.exponentialRampToValueAtTime(200, t + 0.4);
  filter.Q.value = 2.0;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(MASTER_VOLUME, t);
  gain.gain.setValueAtTime(MASTER_VOLUME, t + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(t);
  source.stop(t + 0.4);
}

// ---------------------------------------------------------------------------
// Sound dispatch map
// ---------------------------------------------------------------------------

const soundMap: Record<SoundName, () => void> = {
  orbSelect: playOrbSelect,
  orbConfirm: playOrbConfirm,
  orbPlace: playOrbPlace,
  timerTick: playTimerTick,
  timerUrgent: playTimerUrgent,
  attack: playAttack,
  crit: playCrit,
  dodge: playDodge,
  block: playBlock,
  death: playDeath,
  victory: playVictory,
  defeat: playDefeat,
  synergyActivate: playSynergyActivate,
  combineMerge: playCombineMerge,
  buttonClick: playButtonClick,
  phaseTransition: playPhaseTransition,
};

/** Play a sound by name. */
export function playSound(name: SoundName): void {
  soundMap[name]();
}
