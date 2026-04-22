import { describe, it, expect, beforeEach } from 'vitest';
import { useForgeStore } from './forgeStore';
import { createForgeState, loadAndValidateData, DataRegistry, SeededRNG } from '@alloy/engine';
import type { GemInstance } from '@alloy/engine';

const data = loadAndValidateData();
const registry = new DataRegistry(
  data.affixes,
  data.combinations,
  data.synergies,
  data.baseItems,
  data.balance,
  data.recipes,
);

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

function makeForgeState(round: number = 1) {
  return createForgeState(makeMockGems(), 'sword', 'chainmail', round, data.balance, false);
}

function initStore(round: number = 1) {
  const state = makeForgeState(round);
  useForgeStore.getState().initPlan(state, registry, new SeededRNG(0));
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
      expect(after.stockpile.find(o => o !== null && o.uid === 'orb1')).toBeUndefined();
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
      const result = useForgeStore.getState().getStats(registry);
      expect(result).not.toBeNull();
      expect(result!.stats.maxHP).toBeGreaterThan(0);
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

  describe('hasSelectedBaseItems per-match flag', () => {
    it('returns false by default for any matchId', () => {
      expect(useForgeStore.getState().hasSelectedBaseItems('match-A')).toBe(false);
    });

    it('setHasSelectedBaseItems sets the flag for the given match only', () => {
      useForgeStore.getState().setHasSelectedBaseItems('match-A', true);
      expect(useForgeStore.getState().hasSelectedBaseItems('match-A')).toBe(true);
      expect(useForgeStore.getState().hasSelectedBaseItems('match-B')).toBe(false);
    });

    it('can set false after true', () => {
      useForgeStore.getState().setHasSelectedBaseItems('match-A', true);
      useForgeStore.getState().setHasSelectedBaseItems('match-A', false);
      expect(useForgeStore.getState().hasSelectedBaseItems('match-A')).toBe(false);
    });

    it('reset clears the hasSelectedBaseItemsMap', () => {
      useForgeStore.getState().setHasSelectedBaseItems('match-A', true);
      useForgeStore.getState().reset();
      expect(useForgeStore.getState().hasSelectedBaseItems('match-A')).toBe(false);
    });
  });

  describe('forgeStore transplant', () => {
    // Rare T5: tier(5) + rarityIndex('rare'=3) = 8 >= unlockThreshold(6) → has secondary slot
    // No existing secondary → valid host
    function makeRareT5(uid: string): GemInstance {
      return { uid, affixId: 'fire_damage', tier: 5, rarity: 'rare', recipeDepth: 0, combinable: true, tags: ['fire_damage'] };
    }

    // Magic T3: tier(3) + rarityIndex('magic'=2) = 5 < 6 → no secondary slot → valid source (no secondary)
    function makeMagicT3(uid: string): GemInstance {
      return { uid, affixId: 'cold_damage', tier: 3, rarity: 'magic', recipeDepth: 0, combinable: true, tags: ['cold_damage'] };
    }

    it('initial transplant state is empty', () => {
      const store = useForgeStore.getState();
      expect(store.transplantChosenAffix).toBe(null);
      expect(store.transplantHostUid).toBe(null);
      expect(store.transplantPreview).toBe(null);
    });

    it('setTransplantChosenAffix updates the pick', () => {
      useForgeStore.getState().setTransplantChosenAffix('primary');
      expect(useForgeStore.getState().transplantChosenAffix).toBe('primary');
      useForgeStore.getState().setTransplantChosenAffix(null);
      expect(useForgeStore.getState().transplantChosenAffix).toBe(null);
    });

    it('setTransplantHostUid updates host', () => {
      useForgeStore.getState().setTransplantHostUid('gem-1');
      expect(useForgeStore.getState().transplantHostUid).toBe('gem-1');
    });

    it('computeTransplantPreview returns null when fewer than 2 slots filled', () => {
      const host = makeRareT5('host-1');
      useForgeStore.getState().setComboSlotByIndex(0, host);
      // slot 1 is still null
      const result = useForgeStore.getState().computeTransplantPreview(registry);
      expect(result).toBeNull();
      expect(useForgeStore.getState().transplantPreview).toBeNull();
    });

    it('computeTransplantPreview returns preview when host + source are valid', () => {
      const host = makeRareT5('host-1');
      const source = makeMagicT3('source-1');
      useForgeStore.getState().setComboSlotByIndex(0, host);
      useForgeStore.getState().setComboSlotByIndex(1, source);
      useForgeStore.getState().setTransplantHostUid('host-1');

      const result = useForgeStore.getState().computeTransplantPreview(registry);
      expect(result).not.toBeNull();
      expect(result!.targetUid).toBe('host-1');
      expect(result!.sourceUid).toBe('source-1');
      expect(useForgeStore.getState().transplantPreview).toEqual(result);
    });

    it('computeTransplantPreview picks host deterministically when no explicit host uid set', () => {
      // Higher tier wins: Rare T5 should be host over Magic T3
      const rareT5 = makeRareT5('host-auto');
      const magicT3 = makeMagicT3('source-auto');
      useForgeStore.getState().setComboSlotByIndex(0, rareT5);
      useForgeStore.getState().setComboSlotByIndex(1, magicT3);
      // No explicit host uid set

      const result = useForgeStore.getState().computeTransplantPreview(registry);
      expect(result).not.toBeNull();
      expect(result!.targetUid).toBe('host-auto');
      expect(result!.sourceUid).toBe('source-auto');
    });

    it('clearComboSlots also clears transplant state', () => {
      useForgeStore.getState().setTransplantChosenAffix('primary');
      useForgeStore.getState().setTransplantHostUid('gem-1');
      const host = makeRareT5('host-1');
      const source = makeMagicT3('source-1');
      useForgeStore.getState().setComboSlotByIndex(0, host);
      useForgeStore.getState().setComboSlotByIndex(1, source);
      useForgeStore.getState().setTransplantHostUid('host-1');
      useForgeStore.getState().computeTransplantPreview(registry);

      useForgeStore.getState().clearComboSlots();

      const s = useForgeStore.getState();
      expect(s.transplantChosenAffix).toBeNull();
      expect(s.transplantHostUid).toBeNull();
      expect(s.transplantPreview).toBeNull();
      expect(s.comboSlots).toEqual([null, null, null]);
    });

    it('reset also clears transplant state', () => {
      useForgeStore.getState().setTransplantChosenAffix('secondary');
      useForgeStore.getState().setTransplantHostUid('gem-2');

      useForgeStore.getState().reset();

      const s = useForgeStore.getState();
      expect(s.transplantChosenAffix).toBeNull();
      expect(s.transplantHostUid).toBeNull();
      expect(s.transplantPreview).toBeNull();
    });
  });
});
