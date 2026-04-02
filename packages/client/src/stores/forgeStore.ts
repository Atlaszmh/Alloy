import { create } from 'zustand';
import type { ForgeAction, ForgeState, ForgePlan, PlanResult, DataRegistry, DerivedStats, OrbInstance } from '@alloy/engine';
import { createForgePlan, applyPlanAction, commitPlan, getPlannedStats, canRemoveOrb } from '@alloy/engine';

interface ForgeStoreState {
  plan: ForgePlan | null;
  selectedOrbUid: string | null;
  confirmModalOpen: boolean;

  /** Two-tab layout state */
  activeTab: 'combine' | 'equip';
  activeItemTab: 'weapon' | 'armor';

  /** 3-slot combine workbench (engine only uses first 2 currently) */
  comboSlots: [OrbInstance | null, OrbInstance | null, OrbInstance | null];

  /** Item selection phase — weapon first, then armor, then done */
  itemSelectionPhase: 'weapon' | 'armor' | 'done';
  selectedWeaponId: string | null;
  selectedArmorId: string | null;

  initPlan: (state: ForgeState, registry: DataRegistry) => void;
  applyAction: (action: ForgeAction, registry: DataRegistry) => PlanResult;
  getCommitActions: () => ForgeAction[];
  getStats: (registry: DataRegistry) => DerivedStats | null;
  canRemove: (orbUid: string) => boolean;
  selectOrb: (uid: string | null) => void;
  selectBaseItem: (itemType: 'weapon' | 'armor', itemId: string) => void;
  setActiveTab: (tab: 'combine' | 'equip') => void;
  setActiveItemTab: (tab: 'weapon' | 'armor') => void;
  setComboSlotByIndex: (index: number, orb: OrbInstance | null) => void;
  clearComboSlots: () => void;
  openConfirmModal: () => void;
  closeConfirmModal: () => void;
  reset: () => void;
}

const EMPTY_COMBO: [OrbInstance | null, OrbInstance | null, OrbInstance | null] = [null, null, null];

export const useForgeStore = create<ForgeStoreState>((set, get) => ({
  plan: null,
  selectedOrbUid: null,
  confirmModalOpen: false,
  activeTab: 'combine',
  activeItemTab: 'weapon',
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
      activeTab: 'combine',
      activeItemTab: 'weapon',
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

  canRemove: (orbUid) => {
    const { plan } = get();
    if (!plan) return false;
    return canRemoveOrb(plan, orbUid);
  },

  selectOrb: (uid) => set({ selectedOrbUid: uid }),

  selectBaseItem: (itemType, itemId) => {
    if (itemType === 'weapon') {
      set({ selectedWeaponId: itemId, itemSelectionPhase: 'armor' });
    } else {
      set({ selectedArmorId: itemId, itemSelectionPhase: 'done' });
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setActiveItemTab: (tab) => set({ activeItemTab: tab }),

  setComboSlotByIndex: (index, orb) => {
    const slots = [...get().comboSlots] as [OrbInstance | null, OrbInstance | null, OrbInstance | null];
    slots[index] = orb;
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
      activeTab: 'combine',
      activeItemTab: 'weapon',
      comboSlots: [...EMPTY_COMBO],
      itemSelectionPhase: 'weapon',
      selectedWeaponId: null,
      selectedArmorId: null,
    }),
}));
