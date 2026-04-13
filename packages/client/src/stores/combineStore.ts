import { create } from 'zustand';
import type { GemInstance } from '@alloy/engine';

interface CombineStoreState {
  selectedGemUids: string[];
  previewResult: GemInstance | null;

  selectGem: (uid: string) => void;
  deselectGem: (uid: string) => void;
  clearSelection: () => void;
  setPreviewResult: (gem: GemInstance | null) => void;
  confirmCombine: () => void;
}

const MAX_SELECTION = 2;

export const useCombineStore = create<CombineStoreState>((set, get) => ({
  selectedGemUids: [],
  previewResult: null,

  selectGem: (uid) => {
    const { selectedGemUids } = get();
    if (selectedGemUids.includes(uid)) return;
    if (selectedGemUids.length >= MAX_SELECTION) return;
    set({ selectedGemUids: [...selectedGemUids, uid] });
  },

  deselectGem: (uid) => {
    set((s) => ({
      selectedGemUids: s.selectedGemUids.filter((id) => id !== uid),
      previewResult: null,
    }));
  },

  clearSelection: () =>
    set({
      selectedGemUids: [],
      previewResult: null,
    }),

  setPreviewResult: (gem) => set({ previewResult: gem }),

  confirmCombine: () =>
    set({
      selectedGemUids: [],
      previewResult: null,
    }),
}));
