import { create } from 'zustand';
import type { ForgeAction, ForgeState, ForgePlan, PlanResult, DataRegistry, DerivedStats, OrbInstance } from '@alloy/engine';
import { createForgePlan, applyPlanAction, commitPlan, getPlannedStats, canRemoveOrb } from '@alloy/engine';

export type DragSource =
  | { from: 'stockpile'; orbUid: string }
  | { from: 'card'; cardId: 'weapon' | 'armor'; slotIndex: number; orbUid: string }
  | { from: 'combo'; slot: 'a' | 'b'; orbUid: string };

type ComboSlots = [OrbInstance | null, OrbInstance | null, OrbInstance | null];

interface ForgeStoreState {
  plan: ForgePlan | null;
  selectedOrbUid: string | null;
  confirmModalOpen: boolean;
  activeTab: 'combine' | 'equip';
  activeItemTab: 'weapon' | 'armor';
  /** Orbs staged in combo workbench slots (not yet combined) */
  comboSlots: ComboSlots;

  initPlan: (state: ForgeState, registry: DataRegistry) => void;
  applyAction: (action: ForgeAction, registry: DataRegistry) => PlanResult;
  getCommitActions: () => ForgeAction[];
  getStats: (registry: DataRegistry) => DerivedStats | null;
  canRemove: (target: 'weapon' | 'armor', slotIndex: number) => boolean;
  selectOrb: (uid: string | null) => void;
  setActiveTab: (tab: 'combine' | 'equip') => void;
  setActiveItemTab: (tab: 'weapon' | 'armor') => void;
  openConfirmModal: () => void;
  closeConfirmModal: () => void;
  setComboSlotByIndex: (index: number, orb: OrbInstance | null) => void;
  clearComboSlots: () => void;
  reset: () => void;
}

const initialComboSlots: ComboSlots = [null, null, null];

export const useForgeStore = create<ForgeStoreState>((set, get) => ({
  plan: null,
  selectedOrbUid: null,
  confirmModalOpen: false,
  activeTab: 'combine',
  activeItemTab: 'weapon',
  comboSlots: [...initialComboSlots],

  initPlan: (state, registry) => {
    const plan = createForgePlan(state, registry);
    set({ plan, selectedOrbUid: null, confirmModalOpen: false, comboSlots: [...initialComboSlots] });
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

  canRemove: (target, slotIndex) => {
    const { plan } = get();
    if (!plan) return false;
    return canRemoveOrb(plan, target, slotIndex);
  },

  selectOrb: (uid) => set({ selectedOrbUid: uid }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setActiveItemTab: (tab) => set({ activeItemTab: tab }),

  openConfirmModal: () => set({ confirmModalOpen: true }),

  closeConfirmModal: () => set({ confirmModalOpen: false }),

  setComboSlotByIndex: (index, orb) => {
    const slots = [...get().comboSlots] as ComboSlots;
    slots[index] = orb;
    set({ comboSlots: slots });
  },

  clearComboSlots: () => set({ comboSlots: [...initialComboSlots] }),

  reset: () =>
    set({
      plan: null,
      selectedOrbUid: null,
      confirmModalOpen: false,
      activeTab: 'combine',
      activeItemTab: 'weapon',
      comboSlots: [...initialComboSlots],
    }),
}));
