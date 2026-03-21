import { create } from 'zustand';

interface DraftStore {
  selectedOrbUid: string | null;
  selectOrb: (uid: string) => void;
  confirmPick: () => void;
  cancelSelection: () => void;
  reset: () => void;
}

export const useDraftStore = create<DraftStore>((set) => ({
  selectedOrbUid: null,

  selectOrb: (uid) => set({ selectedOrbUid: uid }),

  confirmPick: () => set({ selectedOrbUid: null }),

  cancelSelection: () => set({ selectedOrbUid: null }),

  reset: () => set({ selectedOrbUid: null }),
}));
