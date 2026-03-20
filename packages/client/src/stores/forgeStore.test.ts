import { describe, it, expect, beforeEach } from 'vitest';
import { useForgeStore } from './forgeStore';
import type { DragSource } from './forgeStore';
import { createForgeState, loadAndValidateData, DataRegistry } from '@alloy/engine';
import type { OrbInstance } from '@alloy/engine';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);

function makeMockOrbs(): OrbInstance[] {
  return [
    { uid: 'orb1', affixId: 'fire_damage', tier: 1 },
    { uid: 'orb2', affixId: 'cold_damage', tier: 1 },
    { uid: 'orb3', affixId: 'flat_hp', tier: 2 },
    { uid: 'orb4', affixId: 'armor_rating', tier: 1 },
    { uid: 'orb5', affixId: 'chance_on_hit', tier: 1 },
    { uid: 'orb6', affixId: 'lifesteal', tier: 2 },
    { uid: 'orb7', affixId: 'fire_damage', tier: 2 },
  ];
}

function makeForgeState(round: 1 | 2 | 3 = 1) {
  return createForgeState(makeMockOrbs(), 'sword', 'chainmail', round, data.balance, false);
}

function initStore(round: 1 | 2 | 3 = 1) {
  const state = makeForgeState(round);
  useForgeStore.getState().initPlan(state, registry);
}

describe('forgeStore', () => {
  beforeEach(() => {
    useForgeStore.getState().reset();
  });

  describe('initial state', () => {
    it('starts with no plan', () => {
      const s = useForgeStore.getState();
      expect(s.plan).toBeNull();
      expect(s.selectedOrbUid).toBeNull();
      expect(s.dragSource).toBeNull();
      expect(s.confirmModalOpen).toBe(false);
      expect(s.comboSlotA).toBeNull();
      expect(s.comboSlotB).toBeNull();
    });
  });

  describe('initPlan', () => {
    it('creates a plan from forge state', () => {
      initStore();
      const { plan } = useForgeStore.getState();
      expect(plan).not.toBeNull();
      expect(plan!.stockpile).toHaveLength(7);
      expect(plan!.round).toBe(1);
    });

    it('resets UI state on init', () => {
      useForgeStore.getState().selectOrb('orb-1');
      useForgeStore.getState().openConfirmModal();
      initStore();
      const s = useForgeStore.getState();
      expect(s.selectedOrbUid).toBeNull();
      expect(s.confirmModalOpen).toBe(false);
    });
  });

  describe('applyAction', () => {
    it('delegates assign_orb to engine plan and updates plan', () => {
      initStore();
      const before = useForgeStore.getState().plan!;
      const startFlux = before.tentativeFlux;

      const result = useForgeStore.getState().applyAction(
        { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 },
        registry,
      );

      expect(result.ok).toBe(true);
      const after = useForgeStore.getState().plan!;
      expect(after.tentativeFlux).toBe(startFlux - data.balance.fluxCosts.assignOrb);
      expect(after.stockpile.find(o => o.uid === 'orb1')).toBeUndefined();
      expect(after.loadout.weapon.slots[0]).not.toBeNull();
    });

    it('returns error when no plan is active', () => {
      const result = useForgeStore.getState().applyAction(
        { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 },
        registry,
      );
      expect(result.ok).toBe(false);
    });

    it('does not update plan on failure', () => {
      initStore();
      const plan = useForgeStore.getState().plan!;
      // Try to assign to an invalid slot index
      const result = useForgeStore.getState().applyAction(
        { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 99 },
        registry,
      );
      expect(result.ok).toBe(false);
      // Plan should be unchanged (same reference since we didn't set)
      expect(useForgeStore.getState().plan).toBe(plan);
    });
  });

  describe('getCommitActions', () => {
    it('returns empty array when no plan', () => {
      expect(useForgeStore.getState().getCommitActions()).toEqual([]);
    });

    it('returns action log from plan', () => {
      initStore();
      useForgeStore.getState().applyAction(
        { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 },
        registry,
      );
      useForgeStore.getState().applyAction(
        { kind: 'assign_orb', orbUid: 'orb2', target: 'armor', slotIndex: 0 },
        registry,
      );
      const actions = useForgeStore.getState().getCommitActions();
      expect(actions).toHaveLength(2);
      expect(actions[0].kind).toBe('assign_orb');
      expect(actions[1].kind).toBe('assign_orb');
    });
  });

  describe('getStats', () => {
    it('returns null when no plan', () => {
      expect(useForgeStore.getState().getStats(registry)).toBeNull();
    });

    it('returns derived stats from plan loadout', () => {
      initStore();
      const stats = useForgeStore.getState().getStats(registry);
      expect(stats).not.toBeNull();
      expect(stats!.maxHP).toBeGreaterThan(0);
    });
  });

  describe('canRemove', () => {
    it('returns false when no plan', () => {
      expect(useForgeStore.getState().canRemove('weapon', 0)).toBe(false);
    });

    it('returns true for current-round socketed orbs', () => {
      initStore(1);
      useForgeStore.getState().applyAction(
        { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 },
        registry,
      );
      expect(useForgeStore.getState().canRemove('weapon', 0)).toBe(true);
    });

    it('returns false for empty slot', () => {
      initStore(1);
      expect(useForgeStore.getState().canRemove('weapon', 0)).toBe(false);
    });
  });

  describe('round locking', () => {
    it('remove_orb succeeds in round 1 for current-round slot and refunds flux', () => {
      initStore(1);
      const startFlux = useForgeStore.getState().plan!.tentativeFlux;
      useForgeStore.getState().applyAction({ kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 }, registry);
      const result = useForgeStore.getState().applyAction({ kind: 'remove_orb', target: 'weapon', slotIndex: 0 }, registry);
      expect(result.ok).toBe(true);
      expect(useForgeStore.getState().plan!.tentativeFlux).toBe(startFlux);
      expect(useForgeStore.getState().plan!.loadout.weapon.slots[0]).toBeNull();
    });

    it('swap_orb succeeds in round 1 for current-round slot', () => {
      initStore(1);
      useForgeStore.getState().applyAction({ kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 }, registry);
      const result = useForgeStore.getState().applyAction(
        { kind: 'swap_orb', target: 'weapon', slotIndex: 0, newOrbUid: 'orb2' }, registry,
      );
      expect(result.ok).toBe(true);
      const plan = useForgeStore.getState().plan!;
      const slot = plan.loadout.weapon.slots[0]!;
      expect(slot.kind).toBe('single');
      if (slot.kind === 'single') expect(slot.orb.uid).toBe('orb2');
      expect(slot.socketedRound).toBe(1);
      expect(plan.stockpile.find(o => o.uid === 'orb1')).toBeDefined();
    });
  });

  describe('selectOrb', () => {
    it('selects and deselects orbs', () => {
      useForgeStore.getState().selectOrb('orb-1');
      expect(useForgeStore.getState().selectedOrbUid).toBe('orb-1');

      useForgeStore.getState().selectOrb(null);
      expect(useForgeStore.getState().selectedOrbUid).toBeNull();
    });
  });

  describe('drag state', () => {
    it('tracks drag source from stockpile', () => {
      const src: DragSource = { from: 'stockpile', orbUid: 'orb-1' };
      useForgeStore.getState().startDrag(src);
      expect(useForgeStore.getState().dragSource).toEqual(src);
      expect(useForgeStore.getState().selectedOrbUid).toBeNull();
    });

    it('tracks drag source from card', () => {
      const src: DragSource = { from: 'card', cardId: 'weapon', slotIndex: 0, orbUid: 'orb-1' };
      useForgeStore.getState().startDrag(src);
      expect(useForgeStore.getState().dragSource).toEqual(src);
    });

    it('tracks drag source from combo slot', () => {
      const src: DragSource = { from: 'combo', slot: 'a', orbUid: 'orb-1' };
      useForgeStore.getState().startDrag(src);
      expect(useForgeStore.getState().dragSource).toEqual(src);
    });

    it('clears drag on endDrag', () => {
      useForgeStore.getState().startDrag({ from: 'stockpile', orbUid: 'orb-1' });
      useForgeStore.getState().endDrag();
      expect(useForgeStore.getState().dragSource).toBeNull();
    });

    it('clears selectedOrbUid when drag starts', () => {
      useForgeStore.getState().selectOrb('orb-1');
      useForgeStore.getState().startDrag({ from: 'stockpile', orbUid: 'orb-2' });
      expect(useForgeStore.getState().selectedOrbUid).toBeNull();
    });
  });

  describe('confirm modal', () => {
    it('opens and closes', () => {
      useForgeStore.getState().openConfirmModal();
      expect(useForgeStore.getState().confirmModalOpen).toBe(true);

      useForgeStore.getState().closeConfirmModal();
      expect(useForgeStore.getState().confirmModalOpen).toBe(false);
    });
  });

  describe('combo slots', () => {
    it('sets and clears combo slots', () => {
      const orb: OrbInstance = { uid: 'orb1', affixId: 'fire_damage', tier: 1 };
      const orb2: OrbInstance = { uid: 'orb5', affixId: 'chance_on_hit', tier: 1 };

      useForgeStore.getState().setComboSlot('a', orb);
      expect(useForgeStore.getState().comboSlotA).toEqual(orb);
      expect(useForgeStore.getState().comboSlotB).toBeNull();

      useForgeStore.getState().setComboSlot('b', orb2);
      expect(useForgeStore.getState().comboSlotB).toEqual(orb2);

      useForgeStore.getState().clearComboSlots();
      expect(useForgeStore.getState().comboSlotA).toBeNull();
      expect(useForgeStore.getState().comboSlotB).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      initStore();
      useForgeStore.getState().selectOrb('orb-1');
      useForgeStore.getState().startDrag({ from: 'stockpile', orbUid: 'orb-2' });
      useForgeStore.getState().openConfirmModal();
      useForgeStore.getState().setComboSlot('a', { uid: 'orb1', affixId: 'fire_damage', tier: 1 });

      useForgeStore.getState().reset();

      const s = useForgeStore.getState();
      expect(s.plan).toBeNull();
      expect(s.selectedOrbUid).toBeNull();
      expect(s.dragSource).toBeNull();
      expect(s.confirmModalOpen).toBe(false);
      expect(s.comboSlotA).toBeNull();
      expect(s.comboSlotB).toBeNull();
    });
  });
});
