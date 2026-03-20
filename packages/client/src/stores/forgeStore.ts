import { create } from 'zustand';
import type { ForgeAction, ForgeState, ForgePlan, PlanResult, DataRegistry, DerivedStats, OrbInstance } from '@alloy/engine';
import { createForgePlan, applyPlanAction, commitPlan, getPlannedStats, canRemoveOrb } from '@alloy/engine';

export type DragSource =
  | { from: 'stockpile'; orbUid: string }
  | { from: 'card'; cardId: 'weapon' | 'armor'; slotIndex: number; orbUid: string }
  | { from: 'combo'; slot: 'a' | 'b'; orbUid: string };

interface ForgeStoreState {
  plan: ForgePlan | null;
  selectedOrbUid: string | null;
  dragSource: DragSource | null;
  confirmModalOpen: boolean;
  /** Orbs staged in combo workbench slots (not yet combined) */
  comboSlotA: OrbInstance | null;
  comboSlotB: OrbInstance | null;

  initPlan: (state: ForgeState, registry: DataRegistry) => void;
  applyAction: (action: ForgeAction, registry: DataRegistry) => PlanResult;
  getCommitActions: () => ForgeAction[];
  getStats: (registry: DataRegistry) => DerivedStats | null;
  canRemove: (target: 'weapon' | 'armor', slotIndex: number) => boolean;
  selectOrb: (uid: string | null) => void;
  startDrag: (source: DragSource) => void;
  endDrag: () => void;
  openConfirmModal: () => void;
  closeConfirmModal: () => void;
  setComboSlot: (slot: 'a' | 'b', orb: OrbInstance | null) => void;
  clearComboSlots: () => void;
  reset: () => void;
}

export const useForgeStore = create<ForgeStoreState>((set, get) => ({
  plan: null,
  selectedOrbUid: null,
  dragSource: null,
  confirmModalOpen: false,
  comboSlotA: null,
  comboSlotB: null,

  initPlan: (state, registry) => {
    const plan = createForgePlan(state, registry);
    set({ plan, selectedOrbUid: null, dragSource: null, confirmModalOpen: false, comboSlotA: null, comboSlotB: null });
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

  startDrag: (source) => set({ dragSource: source, selectedOrbUid: null }),

  endDrag: () => set({ dragSource: null }),

  openConfirmModal: () => set({ confirmModalOpen: true }),

  closeConfirmModal: () => set({ confirmModalOpen: false }),

  setComboSlot: (slot, orb) => {
    if (slot === 'a') set({ comboSlotA: orb });
    else set({ comboSlotB: orb });
  },

  clearComboSlots: () => set({ comboSlotA: null, comboSlotB: null }),

  reset: () =>
    set({
      plan: null,
      selectedOrbUid: null,
      dragSource: null,
      confirmModalOpen: false,
      comboSlotA: null,
      comboSlotB: null,
    }),
}));
