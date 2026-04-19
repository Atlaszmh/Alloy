import { createHmrStore } from './hmr-store';

interface DraftStore {
  /** @deprecated Use selectedGemUid — kept as alias for backward compat */
  selectedOrbUid: string | null;
  selectedGemUid: string | null;
  selectOrb: (uid: string) => void;
  selectGem: (uid: string) => void;
  confirmPick: () => void;
  cancelSelection: () => void;
  reset: () => void;
}

export const useDraftStore = createHmrStore<DraftStore>('draftStore', (set) => ({
  selectedOrbUid: null,
  get selectedGemUid() { return this.selectedOrbUid; },

  selectOrb: (uid) => set({ selectedOrbUid: uid }),
  selectGem: (uid) => set({ selectedOrbUid: uid }),

  confirmPick: () => set({ selectedOrbUid: null }),

  cancelSelection: () => set({ selectedOrbUid: null }),

  reset: () => set({ selectedOrbUid: null }),
}));
