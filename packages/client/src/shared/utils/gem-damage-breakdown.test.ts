import { describe, it, expect } from 'vitest';
import {
  createForgePlan,
  createForgeState,
  applyPlanAction,
  DataRegistry,
  loadAndValidateData,
  SeededRNG,
} from '@alloy/engine';
import type { ForgePlan, GemInstance } from '@alloy/engine';
import {
  buildGemDamageBreakdown,
  sumGemDamage,
} from './gem-damage-breakdown';

const data = loadAndValidateData();
const registry = new DataRegistry(
  data.affixes,
  data.combinations,
  data.synergies,
  data.baseItems,
  data.balance,
  data.recipes,
);

function makeGem(
  uid: string,
  affixId: string,
  tier: 1 | 2 | 3 | 4 = 1,
  rarity: GemInstance['rarity'] = 'common',
): GemInstance {
  return { uid, affixId, tier, rarity, recipeDepth: 0, combinable: true, tags: [affixId] };
}

/** Build a ForgePlan with `gems` pre-socketed into the weapon (slot 0, 1, …). */
function planWithWeaponGems(gems: GemInstance[]): ForgePlan {
  const state = createForgeState(gems, 'sword', 'chainmail', 1, data.balance, false);
  let plan = createForgePlan(state, registry, new SeededRNG(0));
  gems.forEach((gem, idx) => {
    const result = applyPlanAction(
      plan,
      { kind: 'socket_gem', gemUid: gem.uid, target: 'weapon', slotIndex: idx },
      registry,
    );
    if (!result.ok) throw new Error(`socket failed: ${result.error}`);
    plan = result.plan;
  });
  return plan;
}

/** Same as above but sockets into armor slots — used to verify the helper
 *  ignores armor gems (they contribute defenses, not damage). */
function planWithArmorGems(gems: GemInstance[]): ForgePlan {
  const state = createForgeState(gems, 'sword', 'chainmail', 1, data.balance, false);
  let plan = createForgePlan(state, registry, new SeededRNG(0));
  gems.forEach((gem, idx) => {
    const result = applyPlanAction(
      plan,
      { kind: 'socket_gem', gemUid: gem.uid, target: 'armor', slotIndex: idx },
      registry,
    );
    if (!result.ok) throw new Error(`socket failed: ${result.error}`);
    plan = result.plan;
  });
  return plan;
}

describe('buildGemDamageBreakdown', () => {
  it('returns empty array when nothing is socketed', () => {
    const state = createForgeState([], 'sword', 'chainmail', 1, data.balance, false);
    const plan = createForgePlan(state, registry, new SeededRNG(0));
    expect(buildGemDamageBreakdown(plan, registry)).toEqual([]);
  });

  it('returns empty array when only defensive armor gems are socketed', () => {
    // flat_hp is an armor stat — armor slots never contribute to damage.
    const plan = planWithArmorGems([makeGem('a', 'flat_hp', 1)]);
    expect(buildGemDamageBreakdown(plan, registry)).toEqual([]);
  });

  it('surfaces a chaos_damage weapon gem with the chaos type', () => {
    // Regression for the user-visible bug where chaos never showed up in the
    // DMG tooltip because the engine dropped it before it reached DerivedStats.
    const plan = planWithWeaponGems([makeGem('c', 'chaos_damage', 1)]);
    const rows = buildGemDamageBreakdown(plan, registry);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'chaos', value: 2 }); // T1 = 2, common = 1.0x
    expect(rows[0].suffix).toBeUndefined();
  });

  it('tags poison damage with a DoT suffix', () => {
    const plan = planWithWeaponGems([makeGem('p', 'poison_damage', 1)]);
    const rows = buildGemDamageBreakdown(plan, registry);
    const poison = rows.find((r) => r.type === 'poison');
    expect(poison).toBeDefined();
    expect(poison?.value).toBeGreaterThan(0);
    expect(poison?.suffix).toBe('DoT');
  });

  it('tags shadow damage with a %HP suffix', () => {
    const plan = planWithWeaponGems([makeGem('s', 'shadow_damage', 1)]);
    const rows = buildGemDamageBreakdown(plan, registry);
    const shadow = rows.find((r) => r.type === 'shadow');
    expect(shadow).toBeDefined();
    expect(shadow?.value).toBeGreaterThan(0);
    expect(shadow?.suffix).toBe('%HP');
  });

  it('aggregates multiple gems of the same type into a single row', () => {
    const plan = planWithWeaponGems([
      makeGem('f1', 'fire_damage', 1),
      makeGem('f2', 'fire_damage', 2),
    ]);
    const rows = buildGemDamageBreakdown(plan, registry);
    const fire = rows.find((r) => r.type === 'fire');
    expect(fire).toBeDefined();
    // fire_damage T1 weaponEffect = 3, T2 = 5 → 8 total.
    expect(fire?.value).toBe(8);
    // Only one row per type — consolidation, not duplication.
    expect(rows.filter((r) => r.type === 'fire')).toHaveLength(1);
  });

  it('applies rarity multiplier to gem contributions', () => {
    // Rare multiplier = 1.5x. chaos_damage T1 weaponEffect value = 2 → 3.
    const plan = planWithWeaponGems([makeGem('cr', 'chaos_damage', 1, 'rare')]);
    const rows = buildGemDamageBreakdown(plan, registry);
    const chaos = rows.find((r) => r.type === 'chaos');
    expect(chaos?.value).toBeCloseTo(3, 5);
  });

  it('ignores armor-socketed damage gems (armor slot adds resistance, not damage)', () => {
    const plan = planWithArmorGems([makeGem('c', 'chaos_damage', 1)]);
    const rows = buildGemDamageBreakdown(plan, registry);
    // Armor effect of chaos_damage is resistances.chaos, not a damage stat.
    expect(rows.find((r) => r.type === 'chaos')).toBeUndefined();
  });

  it('returns rows in canonical display order (physical → fire → cold → lightning → poison → shadow → chaos)', () => {
    const plan = planWithWeaponGems([
      makeGem('c', 'chaos_damage', 1),
      makeGem('p', 'poison_damage', 1),
      makeGem('f', 'fire_damage', 1),
      makeGem('l', 'lightning_damage', 1),
      makeGem('co', 'cold_damage', 1),
      makeGem('sh', 'shadow_damage', 1),
    ]);
    const rows = buildGemDamageBreakdown(plan, registry);
    const order = rows.map((r) => r.type);
    // We may not have 'physical' in this set, but every element present
    // should follow the canonical ordering.
    const canonical = ['physical', 'fire', 'cold', 'lightning', 'poison', 'shadow', 'chaos'];
    const expected = canonical.filter((t) => order.includes(t as typeof order[number]));
    expect(order).toEqual(expected);
  });

  it('lands every non-percentHP damage family at > 0 when one gem of each is socketed', () => {
    // Regression for "chaos/poison/shadow are invisible" — the helper must
    // report every damage family that has a socketed gem, not just the three
    // (fire/cold/lightning) the engine handles cleanly.
    const plan = planWithWeaponGems([
      makeGem('c', 'chaos_damage', 1),
      makeGem('p', 'poison_damage', 1),
      makeGem('s', 'shadow_damage', 1),
    ]);
    const rows = buildGemDamageBreakdown(plan, registry);
    const types = rows.map((r) => r.type);
    expect(types).toContain('chaos');
    expect(types).toContain('poison');
    expect(types).toContain('shadow');
    for (const row of rows) expect(row.value).toBeGreaterThan(0);
  });
});

describe('buildGemDamageBreakdown — compound contributions', () => {
  it('socketed Ignite gem contributes a fire-DPS row attributed to the compound', () => {
    const igniteGem: GemInstance = {
      uid: 'ignite_uid',
      affixId: 'ignite',
      tier: 2,
      rarity: 'common',
      recipeDepth: 1,
      combinable: true,
      tags: ['ignite', 'compound', 'fire'],
      sourceRecipe: 'ignite',
    };
    const plan = planWithWeaponGems([igniteGem]);
    const breakdown = buildGemDamageBreakdown(plan, registry);
    const fireRow = breakdown.find((r) => r.type === 'fire' && r.source === 'ignite');
    expect(fireRow).toBeDefined();
    expect(fireRow!.value).toBeGreaterThan(0);
  });

  it('socketed non-compound gem (fire_damage) does NOT have a source field', () => {
    const plan = planWithWeaponGems([makeGem('fire_uid', 'fire_damage', 2)]);
    const breakdown = buildGemDamageBreakdown(plan, registry);
    const fireRow = breakdown.find((r) => r.type === 'fire');
    expect(fireRow).toBeDefined();
    expect(fireRow?.source).toBeUndefined();
  });
});

describe('sumGemDamage', () => {
  it('returns 0 for empty breakdown', () => {
    expect(sumGemDamage([])).toBe(0);
  });

  it('sums every row regardless of damage type', () => {
    const total = sumGemDamage([
      { type: 'physical', value: 5 },
      { type: 'chaos', value: 4 },
      { type: 'poison', value: 8, suffix: 'DoT' },
    ]);
    expect(total).toBe(17);
  });
});
