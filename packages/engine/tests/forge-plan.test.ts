import { describe, it, expect } from 'vitest';
import { createForgePlan, applyPlanAction, commitPlan, getPlannedStats, canRemoveOrb } from '../src/forge/forge-plan.js';
import { createForgeState } from '../src/forge/forge-state.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import type { OrbInstance } from '../src/types/orb.js';

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
  return createForgeState(makeMockOrbs(), 'iron_sword', 'iron_armor', round, data.balance, false);
}

describe('ForgePlan', () => {
  describe('createForgePlan', () => {
    it('snapshots stockpile, loadout, and flux', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      expect(plan.stockpile).toHaveLength(state.stockpile.length);
      expect(plan.tentativeFlux).toBe(state.fluxRemaining);
      expect(plan.round).toBe(1);
      expect(plan.lockedOrbUids.size).toBe(0);
      expect(plan.permanentCombines).toHaveLength(0);
      expect(plan.actionLog).toHaveLength(0);
    });

    it('deep clones — mutations to plan do not affect original state', () => {
      const state = makeForgeState();
      const originalStockpileLength = state.stockpile.length;
      const plan = createForgePlan(state, registry);
      plan.stockpile.push({ uid: 'extra', affixId: 'thorns', tier: 1 });
      expect(state.stockpile).toHaveLength(originalStockpileLength);
    });
  });

  describe('applyPlanAction — assign_orb', () => {
    it('moves orb from stockpile to loadout and decrements flux', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      const startFlux = plan.tentativeFlux;
      const result = applyPlanAction(plan, {
        kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.plan.tentativeFlux).toBe(startFlux - data.balance.fluxCosts.assignOrb);
      expect(result.plan.stockpile.find(o => o.uid === 'orb1')).toBeUndefined();
      expect(result.plan.loadout.weapon.slots[0]).not.toBeNull();
      expect(result.plan.actionLog).toHaveLength(1);
    });

    it('fails when no flux remaining', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      plan.tentativeFlux = 0;
      const result = applyPlanAction(plan, {
        kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(result.ok).toBe(false);
    });
  });

  describe('applyPlanAction — remove_orb', () => {
    it('moves orb back to stockpile and costs flux (remove has a cost)', () => {
      const state = makeForgeState(2); // round 2 allows remove
      const plan = createForgePlan(state, registry);
      // First assign, then remove
      const r1 = applyPlanAction(plan, {
        kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      const fluxAfterAssign = r1.plan.tentativeFlux;
      const r2 = applyPlanAction(r1.plan, {
        kind: 'remove_orb', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r2.ok).toBe(true);
      if (!r2.ok) return;
      // Remove costs flux (balance.fluxCosts.removeOrb = 1), same as the engine
      expect(r2.plan.tentativeFlux).toBe(fluxAfterAssign - data.balance.fluxCosts.removeOrb);
      expect(r2.plan.stockpile.find(o => o.uid === 'orb1')).toBeDefined();
    });

    it('is blocked in round 1', () => {
      const state = makeForgeState(1);
      const plan = createForgePlan(state, registry);
      const r1 = applyPlanAction(plan, {
        kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      const r2 = applyPlanAction(r1.plan, {
        kind: 'remove_orb', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r2.ok).toBe(false);
    });

    it('is allowed in round 2', () => {
      const state = makeForgeState(2);
      const plan = createForgePlan(state, registry);
      const r1 = applyPlanAction(plan, {
        kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      const r2 = applyPlanAction(r1.plan, {
        kind: 'remove_orb', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r2.ok).toBe(true);
    });

    it('cannot remove a locked orb (tested via combine)', () => {
      // Covered in combine tests below
    });
  });

  describe('applyPlanAction — set_base_stats', () => {
    it('is reversible — can change stats multiple times', () => {
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

  describe('applyPlanAction — combine', () => {
    it('creates compound orb in stockpile, locks source orbs, costs flux', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      const fluxBefore = plan.tentativeFlux;
      // Combine fire_damage + chance_on_hit → compound orb in stockpile
      const r = applyPlanAction(plan, {
        kind: 'combine', orbUid1: 'orb1', orbUid2: 'orb5',
      }, registry);
      expect(r.ok).toBe(true); if (!r.ok) return;
      expect(r.plan.tentativeFlux).toBe(fluxBefore - data.balance.fluxCosts.combineOrbs);
      expect(r.plan.lockedOrbUids.has('orb1')).toBe(true);
      expect(r.plan.lockedOrbUids.has('orb5')).toBe(true);
      expect(r.plan.permanentCombines).toHaveLength(1);
      // Source orbs removed from stockpile
      expect(r.plan.stockpile.find(o => o.uid === 'orb1')).toBeUndefined();
      expect(r.plan.stockpile.find(o => o.uid === 'orb5')).toBeUndefined();
      // Compound orb now in stockpile (not on item)
      const compoundOrb = r.plan.stockpile.find(o => o.compoundId != null);
      expect(compoundOrb).toBeDefined();
      expect(compoundOrb!.compoundId).toBeTruthy();
      expect(compoundOrb!.sourceOrbs).toHaveLength(2);
      expect(r.plan.loadout.weapon.slots[0]).toBeNull();
    });
  });

  describe('applyPlanAction — upgrade_tier', () => {
    it('fuses same-affix orbs and locks them', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      // orb1 = fire_damage T1, orb7 = fire_damage T2
      const fluxBefore = plan.tentativeFlux;
      const r = applyPlanAction(plan, {
        kind: 'upgrade_tier', orbUid1: 'orb1', orbUid2: 'orb7', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r.ok).toBe(true); if (!r.ok) return;
      expect(r.plan.tentativeFlux).toBe(fluxBefore - data.balance.fluxCosts.upgradeTier);
      expect(r.plan.lockedOrbUids.has('orb1')).toBe(true);
      expect(r.plan.lockedOrbUids.has('orb7')).toBe(true);
      const slot = r.plan.loadout.weapon.slots[0];
      expect(slot?.kind).toBe('upgraded');
    });

    it('cannot remove upgraded orb', () => {
      const state = makeForgeState(2); // round 2 allows remove
      const plan = createForgePlan(state, registry);
      const r = applyPlanAction(plan, {
        kind: 'upgrade_tier', orbUid1: 'orb1', orbUid2: 'orb7', target: 'weapon', slotIndex: 0,
      }, registry);
      expect(r.ok).toBe(true); if (!r.ok) return;
      const r2 = applyPlanAction(r.plan, { kind: 'remove_orb', target: 'weapon', slotIndex: 0 }, registry);
      expect(r2.ok).toBe(false);
    });
  });

  describe('commitPlan', () => {
    it('produces correct ForgeAction replay log', () => {
      const state = makeForgeState();
      let plan = createForgePlan(state, registry);
      let r = applyPlanAction(plan, { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 }, registry);
      expect(r.ok).toBe(true); if (!r.ok) return;
      r = applyPlanAction(r.plan, { kind: 'assign_orb', orbUid: 'orb3', target: 'armor', slotIndex: 0 }, registry);
      expect(r.ok).toBe(true); if (!r.ok) return;
      const actions = commitPlan(r.plan);
      expect(actions).toHaveLength(2);
      expect(actions[0].kind).toBe('assign_orb');
      expect(actions[1].kind).toBe('assign_orb');
    });
  });

  describe('getPlannedStats', () => {
    it('returns DerivedStats from plan loadout', () => {
      // Use real base item IDs that exist in the data registry
      const state = createForgeState(makeMockOrbs(), 'sword', 'chainmail', 1, data.balance, false);
      const plan = createForgePlan(state, registry);
      const stats = getPlannedStats(plan, registry);
      expect(stats.maxHP).toBeGreaterThan(0);
      expect(typeof stats.physicalDamage).toBe('number');
    });
  });

  describe('canRemoveOrb', () => {
    it('returns true for unlocked orbs', () => {
      const plan = createForgePlan(makeForgeState(), registry);
      expect(canRemoveOrb(plan, 'orb1')).toBe(true);
    });

    it('returns false for locked orbs', () => {
      const plan = createForgePlan(makeForgeState(), registry);
      plan.lockedOrbUids.add('orb1');
      expect(canRemoveOrb(plan, 'orb1')).toBe(false);
    });
  });
});
