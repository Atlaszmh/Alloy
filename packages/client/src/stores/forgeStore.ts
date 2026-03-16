import { create } from 'zustand';

type ForgeTab = 'weapon' | 'armor';

interface ForgeStore {
  activeTab: ForgeTab;
  selectedOrbUid: string | null;
  dragSource: { orbUid: string } | null;
  showCombinations: boolean;

  setActiveTab: (tab: ForgeTab) => void;
  selectOrb: (uid: string | null) => void;
  startDrag: (orbUid: string) => void;
  endDrag: () => void;
  toggleCombinations: () => void;
  reset: () => void;
}

export const useForgeStore = create<ForgeStore>((set) => ({
  activeTab: 'weapon',
  selectedOrbUid: null,
  dragSource: null,
  showCombinations: false,

  setActiveTab: (tab) => set({ activeTab: tab }),
  selectOrb: (uid) => set({ selectedOrbUid: uid }),
  startDrag: (orbUid) => set({ dragSource: { orbUid } }),
  endDrag: () => set({ dragSource: null }),
  toggleCombinations: () => set((s) => ({ showCombinations: !s.showCombinations })),
  reset: () =>
    set({
      activeTab: 'weapon',
      selectedOrbUid: null,
      dragSource: null,
      showCombinations: false,
    }),
}));
