import { createForgeState, applyForgeAction } from '../src/forge/forge-state.js';
import type { ForgeState } from '../src/forge/forge-state.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import type { GemInstance } from '../src/types/gem.js';
import { createGem } from '../src/types/gem.js';
import type { ForgeAction } from '../src/types/forge-action.js';
import type { BalanceConfig } from '../src/types/balance.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
const balance = data.balance;

/** Helper: creates mock gems for testing. */
function makeMockGems(): GemInstance[] {
  return [
    createGem('gem1', 'fire_damage', 1, 'common'),
    createGem('gem2', 'chance_on_hit', 1, 'common'),
    createGem('gem3', 'cold_damage', 1, 'common'),
    createGem('gem4', 'fire_damage', 1, 'common'),
    createGem('gem5', 'crit_chance', 2, 'common'),
    createGem('gem6', 'attack_speed', 1, 'common'),
    createGem('gem7', 'fire_damage', 4, 'common'),
    createGem('gem8', 'cold_damage', 4, 'common'),
  ];
}

function makeState(overrides?: Partial<ForgeState>): ForgeState {
  const defaults = createForgeState(makeMockGems(), 'iron_sword', 'iron_armor', 1, balance, false);
  return { ...defaults, ...overrides };
}

describe('Forge System', () => {
  // --- createForgeState ---

  it('createForgeState initializes correctly', () => {
    const gems = makeMockGems();
    const state = createForgeState(gems, 'iron_sword', 'iron_armor', 1, balance, false);

    expect(state.stockpile).toHaveLength(gems.length);
    expect(state.loadout.weapon.baseItemId).toBe('iron_sword');
    expect(state.loadout.armor.baseItemId).toBe('iron_armor');
    expect(state.round).toBe(1);
    expect(state.isQuickMatch).toBe(false);
    // Slots should all be null
    expect(state.loadout.weapon.slots.every(s => s === null)).toBe(true);
    expect(state.loadout.armor.slots.every(s => s === null)).toBe(true);
  });

  // --- socket_gem ---

  it('socket_gem: places gem in empty slot, removes from stockpile', () => {
    const state = makeState();
    const action: ForgeAction = { kind: 'socket_gem', gemUid: 'gem1', target: 'weapon', slotIndex: 0 };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.loadout.weapon.slots[0]).not.toBeNull();
    expect(result.state.loadout.weapon.slots[0]!.gem.uid).toBe('gem1');
    expect(result.state.stockpile.find(g => g.uid === 'gem1')).toBeUndefined();
  });

  it('socket_gem: fails if slot is occupied', () => {
    let state = makeState();
    const assign1: ForgeAction = { kind: 'socket_gem', gemUid: 'gem1', target: 'weapon', slotIndex: 0 };
    const r1 = applyForgeAction(state, assign1, registry);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const assign2: ForgeAction = { kind: 'socket_gem', gemUid: 'gem2', target: 'weapon', slotIndex: 0 };
    const r2 = applyForgeAction(r1.state, assign2, registry);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toContain('occupied');
  });

  it('socket_gem: fails if gem not in stockpile', () => {
    const state = makeState();
    const action: ForgeAction = { kind: 'socket_gem', gemUid: 'nonexistent', target: 'weapon', slotIndex: 0 };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('socket_gem: fails if slotIndex out of range (0-5)', () => {
    const state = makeState();
    const action: ForgeAction = { kind: 'socket_gem', gemUid: 'gem1', target: 'weapon', slotIndex: 6 };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('range');

    const actionNeg: ForgeAction = { kind: 'socket_gem', gemUid: 'gem1', target: 'weapon', slotIndex: -1 };
    const resultNeg = applyForgeAction(state, actionNeg, registry);
    expect(resultNeg.ok).toBe(false);
  });

  // --- combine ---

  it('combine: creates combined gem in stockpile', () => {
    const state = makeState();
    // fire_damage + chance_on_hit = combination exists in registry
    const action: ForgeAction = {
      kind: 'combine',
      gemUid1: 'gem1',
      gemUid2: 'gem2',
    };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Source gems removed from stockpile
    expect(result.state.stockpile.find(g => g.uid === 'gem1')).toBeUndefined();
    expect(result.state.stockpile.find(g => g.uid === 'gem2')).toBeUndefined();
    // Combined gem created in stockpile
    const combinedGem = result.state.stockpile.find(g => g.uid.startsWith('combined_'));
    expect(combinedGem).toBeDefined();
    // Items unchanged
    expect(result.state.loadout.weapon.slots[0]).toBeNull();
  });

  it('combine: combined gem can be socketed', () => {
    const state = makeState();
    // First combine to get combined gem in stockpile
    const combineResult = applyForgeAction(state, {
      kind: 'combine', gemUid1: 'gem1', gemUid2: 'gem2',
    }, registry);
    expect(combineResult.ok).toBe(true);
    if (!combineResult.ok) return;

    // Find the combined gem
    const combinedGem = combineResult.state.stockpile.find(g => g.uid.startsWith('combined_'));
    expect(combinedGem).toBeDefined();

    // Then socket combined gem to weapon slot 0
    const socketResult = applyForgeAction(combineResult.state, {
      kind: 'socket_gem', gemUid: combinedGem!.uid, target: 'weapon', slotIndex: 0,
    }, registry);
    expect(socketResult.ok).toBe(true);
    if (!socketResult.ok) return;
    expect(socketResult.state.loadout.weapon.slots[0]!.gem.uid).toBe(combinedGem!.uid);
    expect(socketResult.state.stockpile.find(g => g.uid === combinedGem!.uid)).toBeUndefined();
  });

  it('combine: fails if combination does not exist in registry', () => {
    const state = makeState();
    // fire_damage + crit_chance is NOT a valid combination
    const action: ForgeAction = {
      kind: 'combine',
      gemUid1: 'gem1',
      gemUid2: 'gem5',
    };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('combination');
  });

  it('combine: fails if gems not in stockpile', () => {
    const state = makeState();
    const action: ForgeAction = {
      kind: 'combine',
      gemUid1: 'nonexistent1',
      gemUid2: 'gem2',
    };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  // --- unsocket_gem ---

  it('unsocket_gem: removes gem from slot, returns to stockpile', () => {
    let state = makeState();
    // Socket a gem first
    const socketResult = applyForgeAction(state, {
      kind: 'socket_gem', gemUid: 'gem1', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(socketResult.ok).toBe(true);
    if (!socketResult.ok) return;

    // Unsocket it
    const unsocketResult = applyForgeAction(socketResult.state, {
      kind: 'unsocket_gem', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(unsocketResult.ok).toBe(true);
    if (!unsocketResult.ok) return;
    expect(unsocketResult.state.loadout.weapon.slots[0]).toBeNull();
    expect(unsocketResult.state.stockpile.find(g => g.uid === 'gem1')).toBeDefined();
  });

  it('unsocket_gem: fails if slot is empty', () => {
    const state = makeState();
    const result = applyForgeAction(state, {
      kind: 'unsocket_gem', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('empty');
  });

  // --- select_base_item ---

  it('select_base_item: changes base item in round 1', () => {
    const state = makeState({ round: 1 });
    const action: ForgeAction = { kind: 'select_base_item', target: 'weapon', baseItemId: 'axe' };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.loadout.weapon.baseItemId).toBe('axe');
  });

  it('select_base_item: fails in rounds 2 and 3', () => {
    const state2 = makeState({ round: 2 });
    const action: ForgeAction = { kind: 'select_base_item', target: 'weapon', baseItemId: 'axe' };
    const result2 = applyForgeAction(state2, action, registry);
    expect(result2.ok).toBe(false);
    if (!result2.ok) expect(result2.error).toContain('Round 1');
  });

  // --- set_base_stats ---

  it('set_base_stats: sets stats in round 1', () => {
    const state = makeState({ round: 1 });
    const action: ForgeAction = { kind: 'set_base_stats', target: 'weapon', stat1: 'STR', stat2: 'DEX' };
    const result = applyForgeAction(state, action, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.loadout.weapon.baseStats).toEqual({ stat1: 'STR', stat2: 'DEX' });
  });

  it('set_base_stats: fails in rounds 2 and 3', () => {
    const state2 = makeState({ round: 2 });
    const action: ForgeAction = { kind: 'set_base_stats', target: 'weapon', stat1: 'STR', stat2: 'DEX' };
    const result2 = applyForgeAction(state2, action, registry);
    expect(result2.ok).toBe(false);
    if (!result2.ok) expect(result2.error).toContain('Round 1');

    const state3 = makeState({ round: 3 });
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

  // --- Socket/unsocket round-trip ---

  it('socket then unsocket restores original stockpile count', () => {
    const state = makeState();
    const startCount = state.stockpile.length;

    // Socket 3 gems
    let s = state;
    for (const [uid, slot] of [['gem1', 0], ['gem2', 1], ['gem3', 2]] as const) {
      const r = applyForgeAction(s, { kind: 'socket_gem', gemUid: uid, target: 'weapon', slotIndex: slot }, registry);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.state;
    }
    expect(s.stockpile.length).toBe(startCount - 3);

    // Unsocket 2
    for (const slot of [0, 1]) {
      const r = applyForgeAction(s, { kind: 'unsocket_gem', target: 'weapon', slotIndex: slot }, registry);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.state;
    }
    expect(s.stockpile.length).toBe(startCount - 1);
  });
});
