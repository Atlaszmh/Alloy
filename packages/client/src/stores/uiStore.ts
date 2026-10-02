import { createHmrStore } from './hmr-store';

type SoundCategory = 'sfx' | 'ui';

// Read initial volumes from localStorage (same keys as sound-manager.ts)
function loadVolume(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? parseFloat(v) : fallback;
  } catch {
    return fallback;
  }
}

export type DuelSpeed = 1 | 2 | 3;

interface UIStore {
  modalOpen: string | null;
  toastMessage: string | null;
  toastType: 'info' | 'success' | 'warning' | 'error';
  isMuted: boolean;
  showDebug: boolean;
  masterVolume: number;
  sfxVolume: number;
  uiVolume: number;
  devMode: boolean;
  colorblindMode: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';
  hapticEnabled: boolean;
  duelSpeed: DuelSpeed;
  /** Delve UI: the computed `--ui-scale` (quarter steps), mirrored here by AppShell. Not persisted. */
  uiScale: number;
  /** Delve UI: Settings → HUD scale, 0.8 to 1.25 (`alloy:delve:hudScale`). */
  hudScale: number;
  /** Delve UI: Settings → View distance, the arena's target view height in units, 20 to 30 (`alloy:delve:viewUnits`). */
  arenaViewUnits: number;

  openModal:(id: string) => void;
  closeModal: () => void;
  toast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  clearToast: () => void;
  toggleMute: () => void;
  toggleDebug: () => void;
  setVolume: (category: 'master' | SoundCategory, value: number) => void;
  toggleDevMode: () => void;
  setColorblindMode: (mode: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia') => void;
  setHapticEnabled: (enabled: boolean) => void;
  setDuelSpeed: (speed: DuelSpeed) => void;
  setUiScale: (scale: number) => void;
  setHudScale: (scale: number) => void;
  setArenaViewUnits: (units: number) => void;
}

/** Settings → HUD scale's range (the spec's 80 to 125%). */
export const HUD_SCALE_RANGE = [0.8, 1.25] as const;
/** Settings → View distance's range, in arena units of view height. */
export const VIEW_UNITS_RANGE = [20, 30] as const;

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

function loadNumber(key: string, fallback: number, range: readonly [number, number]): number {
  try {
    const v = parseFloat(localStorage.getItem(key) ?? '');
    return Number.isFinite(v) ? clamp(v, range) : fallback;
  } catch {
    return fallback;
  }
}

function loadDuelSpeed(): DuelSpeed {
  try {
    const raw = Number(localStorage.getItem('alloy:duelSpeed'));
    if (raw === 1 || raw === 2 || raw === 3) return raw;
  } catch {
    /* noop */
  }
  return 1;
}

export const useUIStore = createHmrStore<UIStore>('uiStore', (set) => ({
  modalOpen: null,
  toastMessage: null,
  toastType: 'info',
  isMuted: (() => { try { return localStorage.getItem('alloy:muted') === 'true'; } catch { return false; } })(),
  showDebug: false,
  masterVolume: loadVolume('alloy:vol:master', 0.8),
  sfxVolume: loadVolume('alloy:vol:sfx', 1.0),
  uiVolume: loadVolume('alloy:vol:ui', 1.0),
  devMode: (() => { try { return localStorage.getItem('alloy:devMode') === 'true'; } catch { return false; } })(),
  colorblindMode: (() => { try { return (localStorage.getItem('alloy:colorblindMode') as UIStore['colorblindMode']) ?? 'none'; } catch { return 'none' as const; } })(),
  hapticEnabled: (() => { try { return localStorage.getItem('alloy:hapticEnabled') !== 'false'; } catch { return true; } })(),
  duelSpeed: loadDuelSpeed(),
  uiScale: 1,
  hudScale: loadNumber('alloy:delve:hudScale', 1, HUD_SCALE_RANGE),
  arenaViewUnits: loadNumber('alloy:delve:viewUnits', 27, VIEW_UNITS_RANGE),

  openModal: (id) => set({ modalOpen: id }),
  closeModal: () => set({ modalOpen: null }),
  toast: (message, type = 'info') => set({ toastMessage: message, toastType: type }),
  clearToast: () => set({ toastMessage: null }),
  toggleMute: () => set((s) => {
    const next = !s.isMuted;
    try { localStorage.setItem('alloy:muted', String(next)); } catch { /* noop */ }
    return { isMuted: next };
  }),
  toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),
  setVolume: (category, value) => {
    // Lazy import to avoid circular dependency (sound-manager imports uiStore for mute check)
    import('@/shared/utils/sound-manager').then(({ soundManager }) => {
      if (category === 'master') {
        soundManager.setMasterVolume(value);
      } else {
        soundManager.setCategoryVolume(category, value);
      }
    });
    if (category === 'master') {
      set({ masterVolume: value });
    } else {
      set(category === 'sfx' ? { sfxVolume: value } : { uiVolume: value });
    }
  },
  toggleDevMode: () => set((s) => {
    const next = !s.devMode;
    try { localStorage.setItem('alloy:devMode', String(next)); } catch { /* noop */ }
    return { devMode: next };
  }),
  setColorblindMode: (mode) => {
    try { localStorage.setItem('alloy:colorblindMode', mode); } catch { /* noop */ }
    set({ colorblindMode: mode });
  },
  setHapticEnabled: (enabled) => {
    try { localStorage.setItem('alloy:hapticEnabled', String(enabled)); } catch { /* noop */ }
    set({ hapticEnabled: enabled });
  },
  setDuelSpeed: (speed) => {
    // Runtime clamp — types enforce 1|2|3 but guard defensively.
    const clamped: DuelSpeed = speed === 1 || speed === 2 || speed === 3 ? speed : 1;
    try { localStorage.setItem('alloy:duelSpeed', String(clamped)); } catch { /* noop */ }
    set({ duelSpeed: clamped });
  },
  setUiScale: (scale) => set({ uiScale: scale }),
  setHudScale: (value) => {
    const scale = clamp(value, HUD_SCALE_RANGE);
    try { localStorage.setItem('alloy:delve:hudScale', String(scale)); } catch { /* noop */ }
    set({ hudScale: scale });
  },
  setArenaViewUnits: (value) => {
    const units = clamp(value, VIEW_UNITS_RANGE);
    try { localStorage.setItem('alloy:delve:viewUnits', String(units)); } catch { /* noop */ }
    set({ arenaViewUnits: units });
  },
}));
