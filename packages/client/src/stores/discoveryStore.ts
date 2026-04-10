import { create } from 'zustand';

interface DiscoveryStoreState {
  discoveredRecipes: Set<string>;
  recentDiscovery: string | null;

  recordDiscovery: (recipeId: string) => void;
  clearRecentDiscovery: () => void;
  resetDiscoveries: () => void;
}

export const useDiscoveryStore = create<DiscoveryStoreState>((set, get) => ({
  discoveredRecipes: new Set(),
  recentDiscovery: null,

  recordDiscovery: (recipeId) => {
    const { discoveredRecipes } = get();
    const next = new Set(discoveredRecipes);
    next.add(recipeId);
    set({ discoveredRecipes: next, recentDiscovery: recipeId });
  },

  clearRecentDiscovery: () => set({ recentDiscovery: null }),

  resetDiscoveries: () =>
    set({
      discoveredRecipes: new Set(),
      recentDiscovery: null,
    }),
}));
