import { describe, it, expect } from 'vitest';
import { createForgePlan, applyPlanAction, commitPlan, getPlannedStats, canUnsocketGem } from '../src/forge/forge-plan.js';
import { createForgeState } from '../src/forge/forge-state.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import type { GemInstance } from '../src/types/gem.js';
import { createGem } from '../src/types/gem.js';
import type { SlotArray } from '../src/types/match.js';
import { liveCount, liveSlots } from '../src/types/slot-array.js';

function findGem(stockpile: SlotArray<GemInstance>, uid: string): GemInstance | undefined {
  return liveSlots(stockpile).find((g) => g.uid === uid);
}

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance, data.recipes);

function makeMockGems(): GemInstance[] {
  return [
    createGem('gem1', 'fire_damage', 1, 'common'),
    createGem('gem2', 'cold_damage', 1, 'common'),
    createGem('gem3', 'flat_hp', 2, 'common'),
    createGem('gem4', 'armor_rating', 1, 'common'),
    createGem('gem5', 'chance_on_hit', 1, 'common'),
    createGem('gem6', 'lifesteal', 2, 'common'),
    createGem('gem7', 'fire_damage', 2, 'common'),
  ];
}

function makeForgeState(round: 1 | 2 | 3 = 1) {
  return createForgeState(makeMockGems(), 'iron_sword', 'iron_armor', round, data.balance, false);
}

describe('ForgePlan', () => {
  describe('createForgePlan', () => {
    it('snapshots stockpile and loadout', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      expect(liveCount(plan.stockpile)).toBe(liveCount(state.stockpile));
      expect(plan.round).toBe(1);
      expect(plan.lockedGemUids.size).toBe(0);
      expect(plan.actionLog).toHaveLength(0);
    });

    it('deep clones -- mutations to plan do not affect original state', () => {
      const state = makeForgeState();
      const originalLive = liveCount(state.stockpile);
      const plan = createForgePlan(state, registry);
      plan.stockpile.push(createGem('extra', 'thorns', 1, 'common'));
      expect(liveCount(state.stockpile)).toBe(originalLive);
    });
  });

  describe('applyPlanAction -- socket_gem', () => {
    it('moves gem from stockpile to loadout', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      const result = applyPlanAction(plan, {
        kind: 'socket_gem', gemUid: 'gem1', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(findGem(result.plan.stockpile, 'gem1')).toBeUndefined();
      expect(result.plan.loadout.weapon.slots[0]).not.toBeNull();
      expect(result.plan.actionLog).toHaveLength(1);
    });

    it('fails when slot occupied', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      const r1 = applyPlanAction(plan, {
        kind: 'socket_gem', gemUid: 'gem1', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      const r2 = applyPlanAction(r1.plan, {
        kind: 'socket_gem', gemUid: 'gem2', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r2.ok).toBe(false);
    });
  });

  describe('applyPlanAction -- unsocket_gem', () => {
    it('moves gem back to stockpile', () => {
      const state = makeForgeState(1);
      const plan = createForgePlan(state, registry);
      const r1 = applyPlanAction(plan, {
        kind: 'socket_gem', gemUid: 'gem1', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      const r2 = applyPlanAction(r1.plan, {
        kind: 'unsocket_gem', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r2.ok).toBe(true);
      if (!r2.ok) return;
      expect(findGem(r2.plan.stockpile, 'gem1')).toBeDefined();
    });

    it('is blocked for locked gems', () => {
      const state = makeForgeState(1);
      const plan = createForgePlan(state, registry);
      const r1 = applyPlanAction(plan, {
        kind: 'socket_gem', gemUid: 'gem1', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      r1.plan.lockedGemUids.add('gem1');
      const r2 = applyPlanAction(r1.plan, {
        kind: 'unsocket_gem', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r2.ok).toBe(false);
    });

    it('fails on empty slot', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      const r = applyPlanAction(plan, {
        kind: 'unsocket_gem', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r.ok).toBe(false);
    });
  });

  describe('applyPlanAction -- set_base_stats', () => {
    it('is reversible -- can change stats multiple times', () => {
      const state = makeForgeState(1);
      const plan = createForgePlan(state, registry);
      let r = applyPlanAction(plan, {
        kind: 'set_base_stats', target: 'weapon', stat1: 'STR', stat2: 'VIT',
      }, registry);
      expect(r.ok).toBe(true); if (!r.ok) return;
      r = applyPlanAction(r.plan, {
        kind: 'set_base_stats', target: 'weapon', stat1: 'INT', stat2: 'DEX',
      }, registry);
      expect(r.ok).toBe(true); if (!r.ok) return;
      expect(r.plan.loadout.weapon.baseStats?.stat1).toBe('INT');
      expect(r.plan.loadout.weapon.baseStats?.stat2).toBe('DEX');
    });

    it('is blocked in round 2+', () => {
      const state = makeForgeState(2);
      const plan = createForgePlan(state, registry);
      const r = applyPlanAction(plan, {
        kind: 'set_base_stats', target: 'weapon', stat1: 'STR', stat2: 'VIT',
      }, registry);
      expect(r.ok).toBe(false);
    });
  });

  describe('applyPlanAction -- combine', () => {
    it('creates combined gem in stockpile and locks source gems', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      // Combine fire_damage + chance_on_hit
      const r = applyPlanAction(plan, {
        kind: 'combine', gemUid1: 'gem1', gemUid2: 'gem5',
      }, registry);
      expect(r.ok).toBe(true); if (!r.ok) return;
      expect(r.plan.lockedGemUids.has('gem1')).toBe(true);
      expect(r.plan.lockedGemUids.has('gem5')).toBe(true);
      // Source gems removed from stockpile
      expect(findGem(r.plan.stockpile, 'gem1')).toBeUndefined();
      expect(findGem(r.plan.stockpile, 'gem5')).toBeUndefined();
      // Combined gem now in stockpile (lands in keep-gem's original slot)
      const combinedGem = liveSlots(r.plan.stockpile).find(g => g.uid.startsWith('combined_'));
      expect(combinedGem).toBeDefined();
    });
  });

  describe('commitPlan', () => {
    it('produces correct ForgeAction replay log', () => {
      const state = makeForgeState();
      let plan = createForgePlan(state, registry);
      let r = applyPlanAction(plan, { kind: 'socket_gem', gemUid: 'gem1', target: 'weapon', slotIndex: 0 }, registry);
      expect(r.ok).toBe(true); if (!r.ok) return;
      r = applyPlanAction(r.plan, { kind: 'socket_gem', gemUid: 'gem3', target: 'armor', slotIndex: 0 }, registry);
      expect(r.ok).toBe(true); if (!r.ok) return;
      const actions = commitPlan(r.plan);
      expect(actions).toHaveLength(2);
      expect(actions[0].kind).toBe('socket_gem');
      expect(actions[1].kind).toBe('socket_gem');
    });
  });

  describe('getPlannedStats', () => {
    it('returns StatsResult from plan loadout', () => {
      // Use real base item IDs that exist in the data registry
      const state = createForgeState(makeMockGems(), 'sword', 'chainmail', 1, data.balance, false);
      const plan = createForgePlan(state, registry);
      const result = getPlannedStats(plan, registry);
      expect(result.stats.maxHP).toBeGreaterThan(0);
      expect(typeof result.stats.physicalDamage).toBe('number');
    });
  });

  describe('applyPlanAction — combine3', () => {
    it('fallback: consumes winning pair, leaves third in stockpile', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      // makeMockGems in forge-plan.test.ts: gem1=fire_damage, gem5=chance_on_hit, gem3=flat_hp
      // (gem5, gem1) form Ignite; gem3 is ejected.
      const result = applyPlanAction(plan, {
        kind: 'combine3',
        gemUid1: 'gem5', gemUid2: 'gem1', gemUid3: 'gem3',
        keepGemUid: 'gem5',
      }, registry);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // gem5 and gem1 consumed, gem3 remains
      expect(findGem(result.plan.stockpile, 'gem5')).toBeUndefined();
      expect(findGem(result.plan.stockpile, 'gem1')).toBeUndefined();
      expect(findGem(result.plan.stockpile, 'gem3')).toBeDefined();
      // Output gem added with the Ignite source recipe
      expect(liveSlots(result.plan.stockpile).some(g => g.sourceRecipe === 'ignite')).toBe(true);
      // Only consumed uids are locked
      expect(result.plan.lockedGemUids.has('gem5')).toBe(true);
      expect(result.plan.lockedGemUids.has('gem1')).toBe(true);
      expect(result.plan.lockedGemUids.has('gem3')).toBe(false);
      // Action logged
      const lastAction = result.plan.actionLog[result.plan.actionLog.length - 1];
      expect(lastAction.kind).toBe('combine3');
    });

    it('fails when a gem uid is not in stockpile', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      const result = applyPlanAction(plan, {
        kind: 'combine3',
        gemUid1: 'gem1', gemUid2: 'gem5', gemUid3: 'nonexistent',
        keepGemUid: 'gem1',
      }, registry);
      expect(result.ok).toBe(false);
    });

    it('fails when a gem is non-combinable', () => {
      const gems = [
        createGem('a', 'fire_damage', 1, 'common'),
        createGem('b', 'chance_on_hit', 1, 'common'),
        createGem('c', 'flat_hp', 1, 'common', { recipeDepth: 3 }), // MAX_RECIPE_DEPTH → not combinable
      ];
      const state = createForgeState(gems, 'iron_sword', 'iron_armor', 1, data.balance, false);
      const plan = createForgePlan(state, registry);
      const result = applyPlanAction(plan, {
        kind: 'combine3',
        gemUid1: 'a', gemUid2: 'b', gemUid3: 'c',
        keepGemUid: 'a',
      }, registry);
      expect(result.ok).toBe(false);
    });

    it('ternary match: consumes all 3 gems, locks all 3, adds output', () => {
      // Meltdown: fire_damage + cold_damage + lightning_damage
      const gems = [
        createGem('a', 'fire_damage', 2, 'rare'),
        createGem('b', 'cold_damage', 2, 'rare'),
        createGem('c', 'lightning_damage', 2, 'rare'),
      ];
      const state = createForgeState(gems, 'iron_sword', 'iron_armor', 1, data.balance, false);
      const plan = createForgePlan(state, registry);
      const result = applyPlanAction(plan, {
        kind: 'combine3',
        gemUid1: 'a', gemUid2: 'b', gemUid3: 'c',
        keepGemUid: 'a',
      }, registry);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // All 3 gems consumed
      expect(findGem(result.plan.stockpile, 'a')).toBeUndefined();
      expect(findGem(result.plan.stockpile, 'b')).toBeUndefined();
      expect(findGem(result.plan.stockpile, 'c')).toBeUndefined();
      // Meltdown output present
      expect(liveSlots(result.plan.stockpile).some(g => g.sourceRecipe === 'meltdown')).toBe(true);
      // All 3 source uids locked
      expect(result.plan.lockedGemUids.has('a')).toBe(true);
      expect(result.plan.lockedGemUids.has('b')).toBe(true);
      expect(result.plan.lockedGemUids.has('c')).toBe(true);
    });
  });

  // ----------------------------------------------------------------------
  // Fixed-slot behavior regressions — these assertions catch any reintroduction
  // of auto-compaction (splice-and-push) in the stockpile mutation paths.
  // ----------------------------------------------------------------------

  describe('fixed-slot stockpile invariants', () => {
    it('socket_gem nulls the source slot in place; sibling slots do not shift', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      const originalUidBySlot = plan.stockpile.map((g) => g?.uid ?? null);

      const result = applyPlanAction(
        plan,
        { kind: 'socket_gem', gemUid: 'gem4', target: 'weapon', slotIndex: 0 },
        registry,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Array length unchanged — sparse, not compacted.
      expect(result.plan.stockpile).toHaveLength(originalUidBySlot.length);
      // Sourced slot is null.
      expect(result.plan.stockpile[3]).toBeNull();
      // Every other slot retained its original uid.
      for (let i = 0; i < originalUidBySlot.length; i++) {
        if (i === 3) continue;
        expect(result.plan.stockpile[i]?.uid ?? null).toBe(originalUidBySlot[i]);
      }
    });

    it('unsocket_gem returns the gem to the first empty slot (not the end of the array)', () => {
      let plan = createForgePlan(makeForgeState(), registry);
      // Socket gem1 (slot 0) first so the stockpile now has slot 0 = null.
      let r = applyPlanAction(
        plan,
        { kind: 'socket_gem', gemUid: 'gem1', target: 'weapon', slotIndex: 0 },
        registry,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      plan = r.plan;
      expect(plan.stockpile[0]).toBeNull();

      // Unsocket — gem1 must come back into slot 0 (first empty), not pushed past slot 6.
      r = applyPlanAction(
        plan,
        { kind: 'unsocket_gem', target: 'weapon', slotIndex: 0 },
        registry,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      expect(r.plan.stockpile[0]?.uid).toBe('gem1');
      // Array length didn't grow — we reused an existing empty slot.
      expect(r.plan.stockpile).toHaveLength(plan.stockpile.length);
    });

    it('combine lands the output in the keep-gem\'s original slot and nulls the ingredient slot', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      // gem1 is at slot 0, gem5 at slot 4 — Ignite recipe (fire + chance_on_hit).
      const gem1Slot = plan.stockpile.findIndex((g) => g?.uid === 'gem1');
      const gem5Slot = plan.stockpile.findIndex((g) => g?.uid === 'gem5');
      expect(gem1Slot).toBeGreaterThanOrEqual(0);
      expect(gem5Slot).toBeGreaterThanOrEqual(0);

      const r = applyPlanAction(
        plan,
        { kind: 'combine', gemUid1: 'gem1', gemUid2: 'gem5', keepGemUid: 'gem1' },
        registry,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      // Output lives in gem1's slot — no re-pack.
      const outputAtKeepSlot = r.plan.stockpile[gem1Slot];
      expect(outputAtKeepSlot).not.toBeNull();
      expect(outputAtKeepSlot!.uid).not.toBe('gem1'); // replaced with combined gem
      // Ingredient slot vacated.
      expect(r.plan.stockpile[gem5Slot]).toBeNull();
      // Array length preserved.
      expect(r.plan.stockpile).toHaveLength(plan.stockpile.length);
    });
  });

  describe('canUnsocketGem', () => {
    it('returns true for socketed gem', () => {
      const plan = createForgePlan(makeForgeState(), registry);
      const result = applyPlanAction(plan, { kind: 'socket_gem', gemUid: 'gem1', target: 'weapon', slotIndex: 0 }, registry);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(canUnsocketGem(result.plan, 'weapon', 0)).toBe(true);
    });

    it('returns false for empty slot', () => {
      const plan = createForgePlan(makeForgeState(), registry);
      expect(canUnsocketGem(plan, 'weapon', 0)).toBe(false);
    });

    it('returns false for locked gems', () => {
      const plan = createForgePlan(makeForgeState(), registry);
      const result = applyPlanAction(plan, { kind: 'socket_gem', gemUid: 'gem1', target: 'weapon', slotIndex: 0 }, registry);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      result.plan.lockedGemUids.add('gem1');
      expect(canUnsocketGem(result.plan, 'weapon', 0)).toBe(false);
    });
  });
});
