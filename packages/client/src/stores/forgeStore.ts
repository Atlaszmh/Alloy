import type { ForgeAction, ForgeState, ForgePlan, PlanResult, DataRegistry, GemInstance, StatsResult } from '@alloy/engine';
import { createForgePlan, applyPlanAction, commitPlan, getPlannedStats, canUnsocketGem, SeededRNG } from '@alloy/engine';
import { createHmrStore } from './hmr-store';

interface ForgeStoreState {
  plan: ForgePlan | null;
  selectedOrbUid: string | null;
  confirmModalOpen: boolean;

  /** 3-slot combine workbench — all 3 slots are active (slot 0 = KEEP) */
  comboSlots: [GemInstance | null, GemInstance | null, GemInstance | null];

  /** Item selection phase — weapon first, then armor, then done */
  itemSelectionPhase: 'weapon' | 'armor' | 'done';
  selectedWeaponId: string | null;
  selectedArmorId: string | null;

  /** Per-match flag tracking whether the player has completed base item selection */
  hasSelectedBaseItemsMap: Record<string, boolean>;
  setHasSelectedBaseItems: (matchId: string, value: boolean) => void;
  hasSelectedBaseItems: (matchId: string) => boolean;

  initPlan: (state: ForgeState, registry: DataRegistry, rng?: SeededRNG) => void;
  applyAction: (action: ForgeAction, registry: DataRegistry) => PlanResult;
  getCommitActions: () => ForgeAction[];
  getStats: (registry: DataRegistry) => StatsResult | null;
  canRemove: (gemUid: string) => boolean;
  selectOrb: (uid: string | null) => void;
  selectBaseItem: (itemType: 'weapon' | 'armor', itemId: string) => void;
  setComboSlotByIndex: (index: number, gem: GemInstance | null) => void;
  clearComboSlots: () => void;
  openConfirmModal: () => void;
  closeConfirmModal: () => void;
  reset: () => void;
}

const EMPTY_COMBO: [GemInstance | null, GemInstance | null, GemInstance | null] = [null, null, null];

export const useForgeStore = createHmrStore<ForgeStoreState>('forgeStore', (set, get) => ({
  plan: null,
  selectedOrbUid: null,
  confirmModalOpen: false,
  comboSlots: [...EMPTY_COMBO],
  itemSelectionPhase: 'weapon',
  selectedWeaponId: null,
  selectedArmorId: null,
  hasSelectedBaseItemsMap: {},

  setHasSelectedBaseItems: (matchId, value) =>
    set((s) => ({ hasSelectedBaseItemsMap: { ...s.hasSelectedBaseItemsMap, [matchId]: value } })),

  hasSelectedBaseItems: (matchId) => get().hasSelectedBaseItemsMap[matchId] ?? false,

  initPlan: (state, registry, rng) => {
    const resolvedRng = rng ?? new SeededRNG(0); // Fallback: Forge.tsx passes match-seed-derived rng when available
    const plan = createForgePlan(state, registry, resolvedRng);
    set({
      plan,
      selectedOrbUid: null,
      confirmModalOpen: false,
      comboSlots: [...EMPTY_COMBO],
    });
  },

  applyAction: (action, registry) => {
    const { plan } = get();
    if (!plan) return { ok: false, error: 'No active plan' } as PlanResult;
    const result = applyPlanAction(plan, action, registry);
    if (result.ok) {
      set({ plan: result.plan });
    }
    return result;
  },

  getCommitActions: () => {
    const { plan } = get();
    if (!plan) return [];
    return commitPlan(plan);
  },

  getStats: (registry) => {
    const { plan } = get();
    if (!plan) return null;
    return getPlannedStats(plan, registry);
  },

  canRemove: (gemUid) => {
    const { plan } = get();
    if (!plan) return false;
    // Find which item+slot holds this gem
    for (const target of ['weapon', 'armor'] as const) {
      const item = plan.loadout[target];
      for (let i = 0; i < item.slots.length; i++) {
        const slot = item.slots[i];
        if (!slot) continue;
        if (slot.gem.uid === gemUid) {
          return canUnsocketGem(plan, target, i);
        }
      }
    }
    // Gem not found in any slot — it's in stockpile, not equipped
    return true;
  },

  selectOrb: (uid) => set({ selectedOrbUid: uid }),

  selectBaseItem: (itemType, itemId) => {
    if (itemType === 'weapon') {
      set({ selectedWeaponId: itemId, itemSelectionPhase: 'armor' });
    } else {
      set({ selectedArmorId: itemId, itemSelectionPhase: 'done' });
    }
  },

  setComboSlotByIndex: (index, gem) => {
    const slots = [...get().comboSlots] as [GemInstance | null, GemInstance | null, GemInstance | null];
    slots[index] = gem;
    set({ comboSlots: slots });
  },

  clearComboSlots: () => set({ comboSlots: [...EMPTY_COMBO] }),

  openConfirmModal: () => set({ confirmModalOpen: true }),

  closeConfirmModal: () => set({ confirmModalOpen: false }),

  reset: () =>
    set({
      plan: null,
      selectedOrbUid: null,
      confirmModalOpen: false,
      comboSlots: [...EMPTY_COMBO],
      itemSelectionPhase: 'weapon',
      selectedWeaponId: null,
      selectedArmorId: null,
      hasSelectedBaseItemsMap: {},
    }),
}));

// Expose store for E2E testing
if (import.meta.env.DEV) {
  (window as any).__ZUSTAND_STORES__ = (window as any).__ZUSTAND_STORES__ ?? {};
  (window as any).__ZUSTAND_STORES__.forgeStore = useForgeStore;
}
