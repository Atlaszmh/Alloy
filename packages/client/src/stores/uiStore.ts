import { create } from 'zustand';

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

  openModal: (id: string) => void;
  closeModal: () => void;
  toast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  clearToast: () => void;
  toggleMute: () => void;
  toggleDebug: () => void;
  setVolume: (category: 'master' | SoundCategory, value: number) => void;
  toggleDevMode: () => void;
  setColorblindMode: (mode: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia') => void;
  setHapticEnabled: (enabled: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
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
}));
