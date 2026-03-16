import { create } from 'zustand';

interface DraftStore {
  selectedOrbUid: string | null;
  isConfirming: boolean;

  selectOrb: (uid: string) => void;
  confirmPick: () => void;
  cancelSelection: () => void;
  reset: () => void;
}

export const useDraftStore = create<DraftStore>((set, get) => ({
  selectedOrbUid: null,
  isConfirming: false,

  selectOrb: (uid) => {
    const { selectedOrbUid } = get();
    if (selectedOrbUid === uid) {
      // Second tap = confirm
      set({ isConfirming: true });
    } else {
      set({ selectedOrbUid: uid, isConfirming: false });
    }
  },

  confirmPick: () => {
    set({ selectedOrbUid: null, isConfirming: false });
  },

  cancelSelection: () => {
    set({ selectedOrbUid: null, isConfirming: false });
  },

  reset: () => set({ selectedOrbUid: null, isConfirming: false }),
}));
