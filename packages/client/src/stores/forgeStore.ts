import { create } from 'zustand';
import type { ForgeAction, ForgeState, ForgePlan, PlanResult, DataRegistry, GemInstance, StatsResult } from '@alloy/engine';
import { createForgePlan, applyPlanAction, commitPlan, getPlannedStats, canUnsocketGem } from '@alloy/engine';

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

  initPlan: (state: ForgeState, registry: DataRegistry) => void;
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

export const useForgeStore = create<ForgeStoreState>((set, get) => ({
  plan: null,
  selectedOrbUid: null,
  confirmModalOpen: false,
  comboSlots: [...EMPTY_COMBO],
  itemSelectionPhase: 'weapon',
  selectedWeaponId: null,
  selectedArmorId: null,

  initPlan: (state, registry) => {
    const plan = createForgePlan(state, registry);
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
    }),
}));

// Expose store for E2E testing
if (import.meta.env.DEV) {
  (window as any).__ZUSTAND_STORES__ = (window as any).__ZUSTAND_STORES__ ?? {};
  (window as any).__ZUSTAND_STORES__.forgeStore = useForgeStore;
}
