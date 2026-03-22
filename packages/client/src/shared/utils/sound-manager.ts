import { Howl } from 'howler';
import { useUIStore } from '@/stores/uiStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SoundCategory = 'sfx' | 'ui';

export type SoundName =
  // Draft
  | 'orbSelect'
  | 'orbConfirm'
  | 'orbPickOpponent'
  | 'forgeSlam'
  | 'forgeCreak'
  | 'gemScatter'
  // Forge
  | 'orbPlace'
  | 'orbRemove'
  | 'combineMerge'
  | 'combineFail'
  | 'upgradeTier'
  | 'forgeSubmit'
  | 'synergyActivate'
  // Duel
  | 'attack'
  | 'crit'
  | 'dodge'
  | 'block'
  | 'death'
  // Results
  | 'victory'
  | 'defeat'
  // UI
  | 'buttonClick'
  | 'phaseTransition'
  | 'timerTick'
  | 'timerUrgent'
  | 'dragStart'
  | 'dropSuccess'
  | 'fluxSpend'
  | 'matchFound'
  | 'roundStart';

interface SoundEntry {
  /** Sprite key within the audio sprite, or individual file path */
  sprite: string;
  /** Base volume 0-1 (before category/master scaling) */
  volume: number;
  /** Category for per-category volume control */
  category: SoundCategory;
  /** If true, randomize pitch ±8% on each play */
  varyPitch?: boolean;
  /** Minimum ms between plays of this sound (throttle) */
  cooldownMs?: number;
  /** Individual audio file paths relative to /assets/audio/sfx/ (used instead of sprite) */
  files?: string[];
}

// ---------------------------------------------------------------------------
// Sound Registry — single source of truth for all game sounds
// ---------------------------------------------------------------------------

const SOUND_REGISTRY: Record<SoundName, SoundEntry> = {
  // Draft
  orbSelect:       { sprite: 'orb-select',       volume: 0.6, category: 'sfx', files: ['orb-select-1.wav', 'orb-select-2.wav', 'orb-select-3.wav'] },
  orbConfirm:      { sprite: 'orb-confirm',       volume: 0.7, category: 'sfx', files: ['orb-confirm-1.wav', 'orb-confirm-2.wav', 'orb-confirm-3.wav'] },
  orbPickOpponent: { sprite: 'orb-pick-opponent', volume: 0.4, category: 'sfx', varyPitch: true },
  forgeSlam:       { sprite: 'forge-slam',        volume: 0.9, category: 'sfx', files: ['forge-slam-1.wav', 'forge-slam-2.wav', 'forge-slam-3.wav'] },
  forgeCreak:      { sprite: 'forge-creak',       volume: 0.5, category: 'sfx', files: ['forge-creak-1.wav', 'forge-creak-2.wav', 'forge-creak-3.wav'] },
  gemScatter:      { sprite: 'gem-scatter',       volume: 0.7, category: 'sfx', files: ['gem-scatter-1.wav', 'gem-scatter-2.wav', 'gem-scatter-3.wav'] },
  // Forge
  orbPlace:        { sprite: 'orb-place',         volume: 0.7, category: 'sfx', files: ['orb-place-1.wav', 'orb-place-2.wav', 'orb-place-3.wav', 'orb-place-4.wav'] },
  orbRemove:       { sprite: 'orb-remove',        volume: 0.5, category: 'sfx', files: ['orb-remove-1.wav', 'orb-remove-2.wav', 'orb-remove-3.wav'] },
  combineMerge:    { sprite: 'combine-merge',     volume: 0.8, category: 'sfx', files: ['combine-merge-1.wav', 'combine-merge-2.wav', 'combine-merge-3.wav'] },
  combineFail:     { sprite: 'combine-fail',      volume: 0.5, category: 'sfx', files: ['combine-fail-1.wav', 'combine-fail-2.wav', 'combine-fail-3.wav'] },
  upgradeTier:     { sprite: 'upgrade-tier',      volume: 0.8, category: 'sfx' },
  forgeSubmit:     { sprite: 'forge-submit',      volume: 0.7, category: 'sfx', files: ['forge-submit-1.wav', 'forge-submit-2.wav', 'forge-submit-3.wav'] },
  synergyActivate: { sprite: 'synergy-activate',  volume: 0.7, category: 'sfx' },
  // Duel
  attack:          { sprite: 'attack',            volume: 0.6, category: 'sfx', varyPitch: true, cooldownMs: 80 },
  crit:            { sprite: 'crit',              volume: 0.8, category: 'sfx', cooldownMs: 80 },
  dodge:           { sprite: 'dodge',             volume: 0.5, category: 'sfx', cooldownMs: 80 },
  block:           { sprite: 'block',             volume: 0.6, category: 'sfx', cooldownMs: 80 },
  death:           { sprite: 'death',             volume: 0.7, category: 'sfx' },
  // Results
  victory:         { sprite: 'victory',           volume: 0.8, category: 'sfx' },
  defeat:          { sprite: 'defeat',            volume: 0.7, category: 'sfx' },
  // UI
  buttonClick:     { sprite: 'button-click',      volume: 0.3, category: 'ui' },
  phaseTransition: { sprite: 'phase-transition',  volume: 0.6, category: 'sfx', files: ['phase-transition-1.wav', 'phase-transition-2.wav'] },
  timerTick:       { sprite: 'timer-tick',        volume: 0.4, category: 'ui' },
  timerUrgent:     { sprite: 'timer-urgent',      volume: 0.6, category: 'ui', files: ['timer-urgent-1.wav', 'timer-urgent-2.wav'] },
  dragStart:       { sprite: 'drag-start',        volume: 0.3, category: 'ui', files: ['drag-start-1.wav', 'drag-start-2.wav'] },
  dropSuccess:     { sprite: 'drop-success',      volume: 0.7, category: 'sfx', files: ['drop-success-1.wav', 'drop-success-2.wav', 'drop-success-3.wav'] },
  fluxSpend:       { sprite: 'flux-spend',        volume: 0.4, category: 'ui', files: ['flux-spend-1.wav', 'flux-spend-2.wav'] },
  matchFound:      { sprite: 'match-found',       volume: 0.7, category: 'sfx' },
  roundStart:      { sprite: 'round-start',       volume: 0.6, category: 'sfx' },
};

// ---------------------------------------------------------------------------
// Volume persistence keys
// ---------------------------------------------------------------------------

const STORAGE_KEY_MASTER = 'alloy:vol:master';
const STORAGE_KEY_SFX = 'alloy:vol:sfx';
const STORAGE_KEY_UI = 'alloy:vol:ui';

function loadVolume(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? parseFloat(v) : fallback;
  } catch {
    return fallback;
  }
}

function saveVolume(key: string, value: number): void {
  try { localStorage.setItem(key, String(value)); } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Synthesized audio fallback (bridge until real audio files are added)
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

function createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Map of synthesized sound generators (used when no audio sprite is loaded) */
const SYNTH_SOUNDS: Partial<Record<SoundName, (gain: number, rate: number) => void>> = {
  orbSelect(vol, rate) {
    const ctx = getAudioContext(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 261.63 * rate;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(g).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.2);
  },
  orbConfirm(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    for (const [freq, start, end] of [[329.63, 0, 0.15], [392.0, 0.15, 0.3]] as const) {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.001, t); g.gain.setValueAtTime(vol, t + start);
      g.gain.exponentialRampToValueAtTime(0.001, t + end);
      osc.connect(g).connect(ctx.destination); osc.start(t + start); osc.stop(t + end);
    }
  },
  orbPickOpponent(vol, rate) {
    const ctx = getAudioContext(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 330 * rate;
    g.gain.setValueAtTime(vol * 0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(g).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.08);
  },
  orbPlace(vol, rate) {
    const ctx = getAudioContext(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = 440.0 * rate;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(g).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.4);
  },
  orbRemove(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 330;
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.2);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(g).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.2);
  },
  timerTick(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = 587.33;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(g).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.1);
  },
  timerUrgent(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = 698.46;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(g).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.2);
  },
  attack(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const buf = createNoiseBuffer(ctx, 0.15); const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 150; f.Q.value = 1;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    src.connect(f).connect(g).connect(ctx.destination); src.start(); src.stop(ctx.currentTime + 0.15);
  },
  crit(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(); const og = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 880;
    og.gain.setValueAtTime(vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(og).connect(ctx.destination); osc.start(t); osc.stop(t + 0.1);
    const buf = createNoiseBuffer(ctx, 0.1); const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 150; f.Q.value = 1;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(vol, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.connect(f).connect(ng).connect(ctx.destination); src.start(t); src.stop(t + 0.1);
  },
  dodge(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const buf = createNoiseBuffer(ctx, 0.2); const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2000, t + 0.2); f.Q.value = 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(f).connect(g).connect(ctx.destination); src.start(t); src.stop(t + 0.2);
  },
  block(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    for (const detune of [0, 15]) {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'square'; osc.frequency.value = 164.81; osc.detune.value = detune;
      g.gain.setValueAtTime(detune === 0 ? vol : vol * 0.6, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(g).connect(ctx.destination); osc.start(t); osc.stop(t + 0.15);
    }
  },
  death(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(196, t);
    osc.frequency.exponentialRampToValueAtTime(65.41, t + 0.8);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc.connect(g).connect(ctx.destination); osc.start(t); osc.stop(t + 0.8);
  },
  victory(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    for (const [freq, start, end] of [[523.25, 0, 0.2], [659.25, 0.2, 0.4], [783.99, 0.4, 0.8]] as const) {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.001, t); g.gain.setValueAtTime(vol, t + start);
      if (freq === 783.99) { g.gain.setValueAtTime(vol, t + 0.6); }
      g.gain.exponentialRampToValueAtTime(0.001, t + end);
      osc.connect(g).connect(ctx.destination); osc.start(t + start); osc.stop(t + end);
    }
  },
  defeat(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime; const d = 0.8 / 3;
    for (const [freq, i] of [[329.63, 0], [261.63, 1], [220.0, 2]] as const) {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.001, t); g.gain.setValueAtTime(vol, t + i * d);
      g.gain.exponentialRampToValueAtTime(0.001, t + (i + 1) * d);
      osc.connect(g).connect(ctx.destination); osc.start(t + i * d); osc.stop(t + (i + 1) * d);
    }
  },
  synergyActivate(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    for (const [freq, i] of [[523.25, 0], [659.25, 1], [783.99, 2]] as const) {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = freq;
      const st = t + i * 0.1;
      g.gain.setValueAtTime(0.001, t); g.gain.setValueAtTime(vol, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.4);
      osc.connect(g).connect(ctx.destination); osc.start(st); osc.stop(st + 0.4);
    }
  },
  combineMerge(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(); const og = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.3);
    og.gain.setValueAtTime(vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(og).connect(ctx.destination); osc.start(t); osc.stop(t + 0.3);
    const buf = createNoiseBuffer(ctx, 0.2); const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 1;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(vol * 0.5, t + 0.1);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(f).connect(ng).connect(ctx.destination); src.start(t + 0.1); src.stop(t + 0.3);
  },
  buttonClick(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 440;
    g.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(g).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.05);
  },
  phaseTransition(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const buf = createNoiseBuffer(ctx, 0.4); const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(1500, t + 0.2);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.4); f.Q.value = 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + 0.2); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(f).connect(g).connect(ctx.destination); src.start(t); src.stop(t + 0.4);
  },
  combineFail(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 200;
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
    g.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(g).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.3);
  },
  upgradeTier(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    for (const [freq, start, end] of [[440, 0, 0.15], [554.37, 0.12, 0.25], [659.25, 0.22, 0.4]] as const) {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.001, t); g.gain.setValueAtTime(vol, t + start);
      g.gain.exponentialRampToValueAtTime(0.001, t + end);
      osc.connect(g).connect(ctx.destination); osc.start(t + start); osc.stop(t + end);
    }
  },
  forgeSubmit(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.2);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(g).connect(ctx.destination); osc.start(t); osc.stop(t + 0.4);
  },
  dragStart(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 350;
    g.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(g).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.08);
  },
  dropSuccess(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = 500;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g).connect(ctx.destination); osc.start(t); osc.stop(t + 0.15);
  },
  fluxSpend(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 600;
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(g).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.15);
  },
  matchFound(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    for (const [freq, start, end] of [[440, 0, 0.15], [554.37, 0.15, 0.3], [659.25, 0.3, 0.5]] as const) {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.001, t); g.gain.setValueAtTime(vol, t + start);
      g.gain.exponentialRampToValueAtTime(0.001, t + end);
      osc.connect(g).connect(ctx.destination); osc.start(t + start); osc.stop(t + end);
    }
  },
  roundStart(vol) {
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const buf = createNoiseBuffer(ctx, 0.3); const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.3); f.Q.value = 1.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(f).connect(g).connect(ctx.destination); src.start(t); src.stop(t + 0.3);
  },
};

// ---------------------------------------------------------------------------
// SoundManager singleton
// ---------------------------------------------------------------------------

export class SoundManager {
  private sprite: Howl | null = null;
  private spriteLoaded = false;
  private howls: Map<string, Howl[]> = new Map();
  private masterVolume: number;
  private categoryVolumes: Record<SoundCategory, number>;
  private lastPlayTime: Map<SoundName, number> = new Map();

  constructor() {
    this.masterVolume = loadVolume(STORAGE_KEY_MASTER, 0.8);
    this.categoryVolumes = {
      sfx: loadVolume(STORAGE_KEY_SFX, 1.0),
      ui: loadVolume(STORAGE_KEY_UI, 1.0),
    };
  }

  /**
   * Load an audio sprite. Call this when audio files are ready.
   * Until called, synthesized fallback sounds are used.
   */
  loadSprite(src: string[], spriteMap: Record<string, [number, number]>): void {
    this.sprite = new Howl({
      src,
      sprite: spriteMap,
      preload: true,
      onload: () => { this.spriteLoaded = true; },
    });
  }

  /** Load individual audio files for all registry entries that have `files`. */
  loadFiles(basePath = '/assets/audio/sfx/'): void {
    if (this.howls.size > 0) return; // Already loaded
    // Pre-compute total to avoid race between onload callbacks and loop
    let pending = 0;
    for (const entry of Object.values(SOUND_REGISTRY)) {
      pending += entry.files?.length ?? 0;
    }
    if (pending === 0) return;

    for (const [name, entry] of Object.entries(SOUND_REGISTRY)) {
      if (!entry.files?.length) continue;
      const howls: Howl[] = [];
      for (const file of entry.files) {
        const howl = new Howl({
          src: [basePath + file],
          preload: true,
          onloaderror: (_id: number, err: unknown) => {
            console.warn(`[SoundManager] Failed to load ${file}:`, err);
          },
        });
        howls.push(howl);
      }
      this.howls.set(name, howls);
    }
  }

  /** Play a sound by name. Respects mute, volume, cooldowns, and pitch variation. */
  play(name: SoundName): void {
    // Check mute
    if (useUIStore.getState().isMuted) return;

    // Check tab visibility
    if (typeof document !== 'undefined' && document.hidden) return;

    // Check cooldown
    const entry = SOUND_REGISTRY[name];
    if (entry.cooldownMs) {
      const now = performance.now();
      const last = this.lastPlayTime.get(name) ?? 0;
      if (now - last < entry.cooldownMs) return;
      this.lastPlayTime.set(name, now);
    }

    // Compute effective volume
    const effectiveVolume = entry.volume * this.masterVolume * this.categoryVolumes[entry.category];
    if (effectiveVolume <= 0) return;

    // Compute pitch variation
    const rate = entry.varyPitch ? 0.92 + Math.random() * 0.16 : 1.0;

    // Try individual file variants first (skip varyPitch — files provide natural variation)
    const variants = this.howls.get(name);
    if (variants?.length) {
      const howl = variants[Math.floor(Math.random() * variants.length)];
      const id = howl.play();
      howl.volume(effectiveVolume, id);
      // Don't apply varyPitch rate to file variants — they already differ naturally
      return;
    }

    // Then try Howler sprite (kept for future sprite support)
    if (this.spriteLoaded && this.sprite) {
      const id = this.sprite.play(entry.sprite);
      this.sprite.volume(effectiveVolume, id);
      if (rate !== 1.0) this.sprite.rate(rate, id);
      return;
    }

    // Fall back to synthesized audio
    const synth = SYNTH_SOUNDS[name];
    if (synth) synth(effectiveVolume, rate);
  }

  /** Set master volume (0-1). Persists to localStorage. */
  setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    saveVolume(STORAGE_KEY_MASTER, this.masterVolume);
  }

  getMasterVolume(): number { return this.masterVolume; }

  /** Set per-category volume (0-1). Persists to localStorage. */
  setCategoryVolume(category: SoundCategory, v: number): void {
    this.categoryVolumes[category] = Math.max(0, Math.min(1, v));
    const key = category === 'sfx' ? STORAGE_KEY_SFX : STORAGE_KEY_UI;
    saveVolume(key, this.categoryVolumes[category]);
  }

  getCategoryVolume(category: SoundCategory): number {
    return this.categoryVolumes[category];
  }

  /** Preload / unlock audio on first user interaction. */
  preload(): void {
    // Resume Web Audio context for synth sounds
    if (audioCtx?.state === 'suspended') void audioCtx.resume();
    // Howler auto-unlocks on interaction
  }
}

// ---------------------------------------------------------------------------
// Export singleton and convenience function
// ---------------------------------------------------------------------------

export const soundManager = new SoundManager();

/** Play a sound by name. Drop-in replacement for the old playSound. */
export function playSound(name: SoundName): void {
  soundManager.play(name);
}
