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

  openModal: (id: string) => void;
  closeModal: () => void;
  toast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  clearToast: () => void;
  toggleMute: () => void;
  toggleDebug: () => void;
  setVolume: (category: 'master' | SoundCategory, value: number) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  modalOpen: null,
  toastMessage: null,
  toastType: 'info',
  isMuted: false,
  showDebug: false,
  masterVolume: loadVolume('alloy:vol:master', 0.8),
  sfxVolume: loadVolume('alloy:vol:sfx', 1.0),
  uiVolume: loadVolume('alloy:vol:ui', 1.0),

  openModal: (id) => set({ modalOpen: id }),
  closeModal: () => set({ modalOpen: null }),
  toast: (message, type = 'info') => set({ toastMessage: message, toastType: type }),
  clearToast: () => set({ toastMessage: null }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
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
}));
