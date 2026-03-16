import { createForgeState, applyForgeAction } from '../src/forge/forge-state.js';
import type { ForgeState } from '../src/forge/forge-state.js';
import { getFluxForRound, getActionCost } from '../src/forge/flux-tracker.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import type { OrbInstance } from '../src/types/orb.js';
import type { ForgeAction } from '../src/types/forge-action.js';
import type { BalanceConfig } from '../src/types/balance.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
const balance = data.balance;

/** Helper: creates mock orbs for testing. */
function makeMockOrbs(): OrbInstance[] {
  return [
    { uid: 'orb1', affixId: 'fire_damage', tier: 1 },
    { uid: 'orb2', affixId: 'chance_on_hit', tier: 1 },
    { uid: 'orb3', affixId: 'cold_damage', tier: 1 },
    { uid: 'orb4', affixId: 'fire_damage', tier: 1 },
    { uid: 'orb5', affixId: 'crit_chance', tier: 2 },
    { uid: 'orb6', affixId: 'attack_speed', tier: 1 },
    { uid: 'orb7', affixId: 'fire_damage', tier: 4 },
    { uid: 'orb8', affixId: 'cold_damage', tier: 4 },
  ];
}

function makeState(overrides?: Partial<ForgeState>): ForgeState {
  const defaults = createForgeState(makeMockOrbs(), 'iron_sword', 'iron_armor', 1, balance, false);
  return { ...defaults, ...overrides };
}

describe('Forge System', () => {
  // --- createForgeState ---

  it('createForgeState initializes correctly', () => {
    const orbs = makeMockOrbs();
    const state = createForgeState(orbs, 'iron_sword', 'iron_armor', 1, balance, false);

    expect(state.stockpile).toHaveLength(orbs.length);
    expect(state.loadout.weapon.baseItemId).toBe('iron_sword');
    expect(state.loadout.armor.baseItemId).toBe('iron_armor');
    expect(state.round).toBe(1);
    expect(state.fluxRemaining).toBe(8);
    expect(state.isQuickMatch).toBe(false);
    // Slots should all be null
    expect(state.loadout.weapon.slots.every(s => s === null)).toBe(true);
    expect(state.loadout.armor.slots.every(s => s === null)).toBe(true);
  });

  // --- assign_orb ---

  it('assign_orb: places orb in empty slot, deducts flux, removes from stockpile', () => {
    const state = makeState();
    const action: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.loadout.weapon.slots[0]).not.toBeNull();
    expect(result.state.loadout.weapon.slots[0]!.kind).toBe('single');
    expect(result.state.fluxRemaining).toBe(7);
    expect(result.state.stockpile.find(o => o.uid === 'orb1')).toBeUndefined();
  });

  it('assign_orb: fails if slot is occupied', () => {
    let state = makeState();
    const assign1: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
    const r1 = applyForgeAction(state, assign1, registry);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const assign2: ForgeAction = { kind: 'assign_orb', orbUid: 'orb2', target: 'weapon', slotIndex: 0 };
    const r2 = applyForgeAction(r1.state, assign2, registry);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toContain('occupied');
  });

  it('assign_orb: fails if orb not in stockpile', () => {
    const state = makeState();
    const action: ForgeAction = { kind: 'assign_orb', orbUid: 'nonexistent', target: 'weapon', slotIndex: 0 };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('assign_orb: fails if insufficient flux', () => {
    const state = makeState({ fluxRemaining: 0 });
    const action: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('flux');
  });

  it('assign_orb: fails if slotIndex out of range (0-5)', () => {
    const state = makeState();
    const action: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 6 };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('range');

    const actionNeg: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: -1 };
    const resultNeg = applyForgeAction(state, actionNeg, registry);
    expect(resultNeg.ok).toBe(false);
  });

  // --- combine ---

  it('combine: creates compound in two consecutive slots, deducts 2 flux', () => {
    const state = makeState();
    // fire_damage + chance_on_hit = ignite (from combinations.json)
    const action: ForgeAction = {
      kind: 'combine',
      orbUid1: 'orb1',
      orbUid2: 'orb2',
      target: 'weapon',
      slotIndex: 0,
    };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.loadout.weapon.slots[0]).not.toBeNull();
    expect(result.state.loadout.weapon.slots[0]!.kind).toBe('compound');
    expect(result.state.loadout.weapon.slots[1]).not.toBeNull();
    expect(result.state.loadout.weapon.slots[1]!.kind).toBe('compound');
    expect(result.state.fluxRemaining).toBe(6);
    expect(result.state.stockpile.find(o => o.uid === 'orb1')).toBeUndefined();
    expect(result.state.stockpile.find(o => o.uid === 'orb2')).toBeUndefined();
  });

  it('combine: fails if combination does not exist in registry', () => {
    const state = makeState();
    // fire_damage + crit_chance is NOT a valid combination
    const action: ForgeAction = {
      kind: 'combine',
      orbUid1: 'orb1',
      orbUid2: 'orb5',
      target: 'weapon',
      slotIndex: 0,
    };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('combination');
  });

  it('combine: fails if slots not empty', () => {
    let state = makeState();
    // First assign an orb to slot 0
    const assign: ForgeAction = { kind: 'assign_orb', orbUid: 'orb5', target: 'weapon', slotIndex: 0 };
    const r1 = applyForgeAction(state, assign, registry);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const action: ForgeAction = {
      kind: 'combine',
      orbUid1: 'orb1',
      orbUid2: 'orb2',
      target: 'weapon',
      slotIndex: 0,
    };
    const result = applyForgeAction(r1.state, action, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('occupied');
  });

  it('combine: fails if orbs not in stockpile', () => {
    const state = makeState();
    const action: ForgeAction = {
      kind: 'combine',
      orbUid1: 'nonexistent1',
      orbUid2: 'orb2',
      target: 'weapon',
      slotIndex: 0,
    };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  // --- upgrade_tier ---

  it('upgrade_tier: merges two same-affix orbs into higher tier', () => {
    const state = makeState();
    // orb1 and orb4 both have affixId 'fire_damage', tier 1
    const action: ForgeAction = {
      kind: 'upgrade_tier',
      orbUid1: 'orb1',
      orbUid2: 'orb4',
      target: 'weapon',
      slotIndex: 0,
    };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slot = result.state.loadout.weapon.slots[0];
    expect(slot).not.toBeNull();
    expect(slot!.kind).toBe('upgraded');
    if (slot!.kind === 'upgraded') {
      expect(slot.orb.tier).toBe(2);
      expect(slot.originalTier).toBe(1);
      expect(slot.upgradedTier).toBe(2);
      expect(slot.orb.affixId).toBe('fire_damage');
    }
    expect(result.state.fluxRemaining).toBe(7);
    expect(result.state.stockpile.find(o => o.uid === 'orb1')).toBeUndefined();
    expect(result.state.stockpile.find(o => o.uid === 'orb4')).toBeUndefined();
  });

  it('upgrade_tier: fails if affix IDs do not match', () => {
    const state = makeState();
    const action: ForgeAction = {
      kind: 'upgrade_tier',
      orbUid1: 'orb1',
      orbUid2: 'orb2',
      target: 'weapon',
      slotIndex: 0,
    };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('same affix');
  });

  it('upgrade_tier: fails if either orb is already T4', () => {
    const state = makeState();
    // orb7 is fire_damage T4, orb1 is fire_damage T1
    const action: ForgeAction = {
      kind: 'upgrade_tier',
      orbUid1: 'orb7',
      orbUid2: 'orb1',
      target: 'weapon',
      slotIndex: 0,
    };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('T4');
  });

  // --- swap_orb ---

  it('swap_orb: replaces occupied slot, returns old orb to stockpile, costs 1 flux', () => {
    // Start in round 2 with an orb already placed
    let state = makeState({ round: 2, fluxRemaining: 4 });
    // First place an orb in round context (manually set it up)
    const assign: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
    const r1 = applyForgeAction(state, assign, registry);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const swap: ForgeAction = { kind: 'swap_orb', target: 'weapon', slotIndex: 0, newOrbUid: 'orb2' };
    const result = applyForgeAction(r1.state, swap, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.loadout.weapon.slots[0]!.kind).toBe('single');
    if (result.state.loadout.weapon.slots[0]!.kind === 'single') {
      expect(result.state.loadout.weapon.slots[0]!.orb.uid).toBe('orb2');
    }
    expect(result.state.fluxRemaining).toBe(2); // 4 - 1 (assign) - 1 (swap)
    // Old orb should be back in stockpile
    expect(result.state.stockpile.find(o => o.uid === 'orb1')).toBeDefined();
    // New orb should be gone from stockpile
    expect(result.state.stockpile.find(o => o.uid === 'orb2')).toBeUndefined();
  });

  it('swap_orb: fails in round 1', () => {
    let state = makeState({ round: 1 });
    const assign: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
    const r1 = applyForgeAction(state, assign, registry);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const swap: ForgeAction = { kind: 'swap_orb', target: 'weapon', slotIndex: 0, newOrbUid: 'orb2' };
    const result = applyForgeAction(r1.state, swap, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Round 1');
  });

  it('swap_orb: fails if slot is empty', () => {
    const state = makeState({ round: 2, fluxRemaining: 4 });
    const swap: ForgeAction = { kind: 'swap_orb', target: 'weapon', slotIndex: 0, newOrbUid: 'orb1' };
    const result = applyForgeAction(state, swap, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('empty');
  });

  // --- remove_orb ---

  it('remove_orb: removes orb from slot, returns to stockpile, costs 1 flux', () => {
    let state = makeState({ round: 2, fluxRemaining: 4 });
    const assign: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
    const r1 = applyForgeAction(state, assign, registry);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const remove: ForgeAction = { kind: 'remove_orb', target: 'weapon', slotIndex: 0 };
    const result = applyForgeAction(r1.state, remove, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.loadout.weapon.slots[0]).toBeNull();
    expect(result.state.fluxRemaining).toBe(2); // 4 - 1 (assign) - 1 (remove)
    expect(result.state.stockpile.find(o => o.uid === 'orb1')).toBeDefined();
  });

  it('remove_orb: fails in round 1', () => {
    let state = makeState({ round: 1 });
    const assign: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
    const r1 = applyForgeAction(state, assign, registry);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const remove: ForgeAction = { kind: 'remove_orb', target: 'weapon', slotIndex: 0 };
    const result = applyForgeAction(r1.state, remove, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Round 1');
  });

  it('remove_orb: fails if slot is empty', () => {
    const state = makeState({ round: 2, fluxRemaining: 4 });
    const remove: ForgeAction = { kind: 'remove_orb', target: 'weapon', slotIndex: 0 };
    const result = applyForgeAction(state, remove, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('empty');
  });

  // --- set_base_stats ---

  it('set_base_stats: sets stats for free in round 1', () => {
    const state = makeState({ round: 1 });
    const action: ForgeAction = { kind: 'set_base_stats', target: 'weapon', stat1: 'STR', stat2: 'DEX' };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.loadout.weapon.baseStats).toEqual({ stat1: 'STR', stat2: 'DEX' });
    expect(result.state.fluxRemaining).toBe(state.fluxRemaining); // No flux cost
  });

  it('set_base_stats: fails in rounds 2 and 3', () => {
    const state2 = makeState({ round: 2, fluxRemaining: 4 });
    const action: ForgeAction = { kind: 'set_base_stats', target: 'weapon', stat1: 'STR', stat2: 'DEX' };
    const result2 = applyForgeAction(state2, action, registry);
    expect(result2.ok).toBe(false);
    if (!result2.ok) expect(result2.error).toContain('Round 1');

    const state3 = makeState({ round: 3, fluxRemaining: 2 });
    const result3 = applyForgeAction(state3, action, registry);
    expect(result3.ok).toBe(false);
    if (!result3.ok) expect(result3.error).toContain('Round 1');
  });

  it('set_base_stats: allows doubling up (DEX/DEX)', () => {
    const state = makeState({ round: 1 });
    const action: ForgeAction = { kind: 'set_base_stats', target: 'weapon', stat1: 'DEX', stat2: 'DEX' };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.loadout.weapon.baseStats).toEqual({ stat1: 'DEX', stat2: 'DEX' });
  });

  // --- Flux Tracker ---

  it('Quick match flux is correct (14)', () => {
    expect(getFluxForRound(1, balance, true)).toBe(14);
  });

  it('Round flux values are correct (8, 4, 2)', () => {
    expect(getFluxForRound(1, balance, false)).toBe(8);
    expect(getFluxForRound(2, balance, false)).toBe(4);
    expect(getFluxForRound(3, balance, false)).toBe(2);
  });
});
