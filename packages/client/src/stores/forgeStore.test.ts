import { describe, it, expect, beforeEach } from 'vitest';
import { useForgeStore } from './forgeStore';
import { createForgeState, loadAndValidateData, DataRegistry } from '@alloy/engine';
import type { GemInstance } from '@alloy/engine';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);

function makeGem(uid: string, affixId: string, tier: 1 | 2 | 3 | 4 | 5 = 1): GemInstance {
  return { uid, affixId, tier, rarity: 'common', recipeDepth: 0, combinable: true, tags: [affixId] };
}

function makeMockGems(): GemInstance[] {
  return [
    makeGem('orb1', 'fire_damage', 1),
    makeGem('orb2', 'cold_damage', 1),
    makeGem('orb3', 'flat_hp', 2),
    makeGem('orb4', 'armor_rating', 1),
    makeGem('orb5', 'chance_on_hit', 1),
    makeGem('orb6', 'lifesteal', 2),
    makeGem('orb7', 'fire_damage', 2),
  ];
}

function makeForgeState(round: 1 | 2 | 3 = 1) {
  return createForgeState(makeMockGems(), 'sword', 'chainmail', round, data.balance, false);
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
      expect(s.confirmModalOpen).toBe(false);
      expect(s.comboSlots).toEqual([null, null, null]);
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
    it('delegates socket_gem to engine plan and updates plan', () => {
      initStore();

      const result = useForgeStore.getState().applyAction(
        { kind: 'socket_gem', gemUid: 'orb1', target: 'weapon', slotIndex: 0 },
        registry,
      );

      expect(result.ok).toBe(true);
      const after = useForgeStore.getState().plan!;
      expect(after.stockpile.find(o => o.uid === 'orb1')).toBeUndefined();
      expect(after.loadout.weapon.slots[0]).not.toBeNull();
    });

    it('returns error when no plan is active', () => {
      const result = useForgeStore.getState().applyAction(
        { kind: 'socket_gem', gemUid: 'orb1', target: 'weapon', slotIndex: 0 },
        registry,
      );
      expect(result.ok).toBe(false);
    });

    it('does not update plan on failure', () => {
      initStore();
      const plan = useForgeStore.getState().plan!;
      // Try to assign to an invalid slot index
      const result = useForgeStore.getState().applyAction(
        { kind: 'socket_gem', gemUid: 'orb1', target: 'weapon', slotIndex: 99 },
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
        { kind: 'socket_gem', gemUid: 'orb1', target: 'weapon', slotIndex: 0 },
        registry,
      );
      useForgeStore.getState().applyAction(
        { kind: 'socket_gem', gemUid: 'orb2', target: 'armor', slotIndex: 0 },
        registry,
      );
      const actions = useForgeStore.getState().getCommitActions();
      expect(actions).toHaveLength(2);
      expect(actions[0].kind).toBe('socket_gem');
      expect(actions[1].kind).toBe('socket_gem');
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
      expect(useForgeStore.getState().canRemove('orb1')).toBe(false);
    });

    it('returns true for unlocked orbs', () => {
      initStore();
      expect(useForgeStore.getState().canRemove('orb1')).toBe(true);
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

  describe('confirm modal', () => {
    it('opens and closes', () => {
      useForgeStore.getState().openConfirmModal();
      expect(useForgeStore.getState().confirmModalOpen).toBe(true);

      useForgeStore.getState().closeConfirmModal();
      expect(useForgeStore.getState().confirmModalOpen).toBe(false);
    });
  });

  describe('combo slots', () => {
    it('sets and clears combo slots by index', () => {
      const orb: GemInstance = makeGem('orb1', 'fire_damage', 1);
      const orb2: GemInstance = makeGem('orb5', 'chance_on_hit', 1);

      useForgeStore.getState().setComboSlotByIndex(0, orb);
      expect(useForgeStore.getState().comboSlots[0]).toEqual(orb);
      expect(useForgeStore.getState().comboSlots[1]).toBeNull();

      useForgeStore.getState().setComboSlotByIndex(1, orb2);
      expect(useForgeStore.getState().comboSlots[1]).toEqual(orb2);

      useForgeStore.getState().clearComboSlots();
      expect(useForgeStore.getState().comboSlots).toEqual([null, null, null]);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      initStore();
      useForgeStore.getState().selectOrb('orb-1');
      useForgeStore.getState().openConfirmModal();
      useForgeStore.getState().setComboSlotByIndex(0, makeGem('orb1', 'fire_damage', 1));
      useForgeStore.getState().selectBaseItem('weapon', 'sword');

      useForgeStore.getState().reset();

      const s = useForgeStore.getState();
      expect(s.plan).toBeNull();
      expect(s.selectedOrbUid).toBeNull();
      expect(s.confirmModalOpen).toBe(false);
      expect(s.comboSlots).toEqual([null, null, null]);
      expect(s.itemSelectionPhase).toBe('weapon');
      expect(s.selectedWeaponId).toBeNull();
      expect(s.selectedArmorId).toBeNull();
    });
  });

  describe('item selection', () => {
    it('starts in weapon selection phase', () => {
      expect(useForgeStore.getState().itemSelectionPhase).toBe('weapon');
    });

    it('advances weapon → armor → done', () => {
      useForgeStore.getState().selectBaseItem('weapon', 'sword');
      expect(useForgeStore.getState().itemSelectionPhase).toBe('armor');
      expect(useForgeStore.getState().selectedWeaponId).toBe('sword');

      useForgeStore.getState().selectBaseItem('armor', 'chainmail');
      expect(useForgeStore.getState().itemSelectionPhase).toBe('done');
      expect(useForgeStore.getState().selectedArmorId).toBe('chainmail');
    });

    it('selectedWeaponId and selectedArmorId start null', () => {
      expect(useForgeStore.getState().selectedWeaponId).toBeNull();
      expect(useForgeStore.getState().selectedArmorId).toBeNull();
    });
  });
});
