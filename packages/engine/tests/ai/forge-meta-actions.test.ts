import { describe, it, expect } from 'vitest';
import { Tier4ForgeStrategy, Tier5ForgeStrategy } from '../../src/ai/strategies/forge-strategy.js';
import { loadAndValidateData } from '../../src/data/loader.js';
import { DataRegistry } from '../../src/data/registry.js';
import { SeededRNG } from '../../src/rng/seeded-rng.js';
import type { GemInstance } from '../../src/types/gem.js';
import type { Loadout } from '../../src/types/item.js';

// Recipes used in these tests:
//
// T5 capstone: "meltdown" (type: "signature3")
//   components: fire_damage + cold_damage + lightning_damage (all raw affixes)
//
// T4 binary: "ignite" (type: "signature")
//   components: chance_on_hit + fire_damage (all raw affixes)

function emptyLoadout(): Loadout {
  return {
    weapon: {
      baseItemId: 'sword',
      baseStats: null,
      slots: [null, null, null, null, null, null],
    },
    armor: {
      baseItemId: 'chainmail',
      baseStats: null,
      slots: [null, null, null, null, null, null],
    },
  } as unknown as Loadout;
}

const data = loadAndValidateData();
const registry = new DataRegistry(
  data.affixes,
  data.combinations,
  data.synergies,
  data.baseItems,
  data.balance,
  data.recipes,
);

describe('Tier 5 meta-action planning — boost_combine', () => {
  it('plans boost_combine when runStateFlux >= 3 AND a capstone (signature3) is available', () => {
    // Three gems that satisfy the "meltdown" signature3 recipe:
    //   fire_damage + cold_damage + lightning_damage → meltdown
    const stockpile: GemInstance[] = [
      {
        uid: 'fire',
        affixId: 'fire_damage',
        tier: 3,
        rarity: 'rare',
        recipeDepth: 0,
        combinable: true,
        tags: ['fire_damage'],
      },
      {
        uid: 'cold',
        affixId: 'cold_damage',
        tier: 3,
        rarity: 'rare',
        recipeDepth: 0,
        combinable: true,
        tags: ['cold_damage'],
      },
      {
        uid: 'lightning',
        affixId: 'lightning_damage',
        tier: 3,
        rarity: 'rare',
        recipeDepth: 0,
        combinable: true,
        tags: ['lightning_damage'],
      },
    ];
    const strategy = new Tier5ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      1,
      [],
      registry,
      new SeededRNG(1),
      5, // runStateFlux >= 3
    );
    expect(actions.some(a => a.kind === 'boost_combine')).toBe(true);
  });

  it('does NOT plan boost_combine when runStateFlux < 3 (below boostCombine cost)', () => {
    const stockpile: GemInstance[] = [
      {
        uid: 'fire',
        affixId: 'fire_damage',
        tier: 3,
        rarity: 'rare',
        recipeDepth: 0,
        combinable: true,
        tags: ['fire_damage'],
      },
      {
        uid: 'cold',
        affixId: 'cold_damage',
        tier: 3,
        rarity: 'rare',
        recipeDepth: 0,
        combinable: true,
        tags: ['cold_damage'],
      },
      {
        uid: 'lightning',
        affixId: 'lightning_damage',
        tier: 3,
        rarity: 'rare',
        recipeDepth: 0,
        combinable: true,
        tags: ['lightning_damage'],
      },
    ];
    const strategy = new Tier5ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      1,
      [],
      registry,
      new SeededRNG(1),
      2, // runStateFlux < 3 — not enough flux
    );
    expect(actions.some(a => a.kind === 'boost_combine')).toBe(false);
  });

  it('does NOT plan boost_combine when no signature3 recipe matches (no capstone available)', () => {
    // Only one gem — no capstone can form
    const stockpile: GemInstance[] = [
      {
        uid: 'fire',
        affixId: 'fire_damage',
        tier: 3,
        rarity: 'rare',
        recipeDepth: 0,
        combinable: true,
        tags: ['fire_damage'],
      },
    ];
    const strategy = new Tier5ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      1,
      [],
      registry,
      new SeededRNG(1),
      5, // plenty of flux, but no capstone possible
    );
    expect(actions.some(a => a.kind === 'boost_combine')).toBe(false);
  });
});

describe('Tier 4 meta-action planning — boost_combine', () => {
  it('plans boost_combine when runStateFlux >= 3 AND a binary combo is available', () => {
    // Two gems that satisfy the "ignite" signature recipe:
    //   chance_on_hit + fire_damage → ignite
    const stockpile: GemInstance[] = [
      {
        uid: 'hit',
        affixId: 'chance_on_hit',
        tier: 3,
        rarity: 'rare',
        recipeDepth: 0,
        combinable: true,
        tags: ['chance_on_hit'],
      },
      {
        uid: 'fire',
        affixId: 'fire_damage',
        tier: 3,
        rarity: 'rare',
        recipeDepth: 0,
        combinable: true,
        tags: ['fire_damage'],
      },
    ];
    const strategy = new Tier4ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      1,
      [],
      registry,
      new SeededRNG(1),
      5, // runStateFlux >= 3
    );
    expect(actions.some(a => a.kind === 'boost_combine')).toBe(true);
  });

  it('does NOT plan boost_combine when runStateFlux < 3', () => {
    const stockpile: GemInstance[] = [
      {
        uid: 'hit',
        affixId: 'chance_on_hit',
        tier: 3,
        rarity: 'rare',
        recipeDepth: 0,
        combinable: true,
        tags: ['chance_on_hit'],
      },
      {
        uid: 'fire',
        affixId: 'fire_damage',
        tier: 3,
        rarity: 'rare',
        recipeDepth: 0,
        combinable: true,
        tags: ['fire_damage'],
      },
    ];
    const strategy = new Tier4ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      1,
      [],
      registry,
      new SeededRNG(1),
      2, // runStateFlux < 3 — not enough
    );
    expect(actions.some(a => a.kind === 'boost_combine')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stockpile helpers for meta-action tests
// ---------------------------------------------------------------------------
// fortify: category=defensive, tags=["defensive","conditional"] — not physical/crit
// hp_regen: category=defensive, tags=["sustain"] — not physical/crit
// These two gems together will NOT form 2+ matches for any single archetype,
// so archetypeFitCount < 2 is satisfied for the reroll heuristic.

describe('Tier 5 meta-action planning — reroll_pool', () => {
  it('plans reroll_pool when stockpile is archetype-poor and flux >= 5', () => {
    // fortify + hp_regen: neither matches physical_burst (needs physical/crit)
    // or any archetype with 2+ matches — so archetypeFitCount(bestArch) < 2
    const stockpile: GemInstance[] = [
      {
        uid: 'a',
        affixId: 'fortify',
        tier: 2,
        rarity: 'common',
        recipeDepth: 0,
        combinable: true,
        tags: ['defensive', 'conditional'],
      },
      {
        uid: 'b',
        affixId: 'hp_regen',
        tier: 2,
        rarity: 'common',
        recipeDepth: 0,
        combinable: true,
        tags: ['sustain'],
      },
    ];
    const strategy = new Tier5ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      1,
      [],
      registry,
      new SeededRNG(1),
      6, // runStateFlux >= rerollPool cost (5)
    );
    expect(actions.some(a => a.kind === 'reroll_pool')).toBe(true);
  });

  it('does NOT plan reroll_pool when flux < 5 (below cost)', () => {
    const stockpile: GemInstance[] = [
      {
        uid: 'a',
        affixId: 'fortify',
        tier: 2,
        rarity: 'common',
        recipeDepth: 0,
        combinable: true,
        tags: ['defensive', 'conditional'],
      },
    ];
    const strategy = new Tier5ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      1,
      [],
      registry,
      new SeededRNG(1),
      4, // runStateFlux < 5 — not enough for reroll
    );
    expect(actions.some(a => a.kind === 'reroll_pool')).toBe(false);
  });
});

describe('Tier 5 meta-action planning — guarantee_rarity', () => {
  it('plans guarantee_rarity when stockpile is rarity-poor and flux >= 4', () => {
    // 4 common gems and 0 rare → lowRarityCount/total = 1.0 >= 0.7
    const stockpile: GemInstance[] = [
      { uid: 'a', affixId: 'fortify', tier: 2, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['defensive'] },
      { uid: 'b', affixId: 'hp_regen', tier: 2, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['sustain'] },
      { uid: 'c', affixId: 'armor_rating', tier: 2, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['defensive'] },
      { uid: 'd', affixId: 'block_chance', tier: 2, rarity: 'uncommon', recipeDepth: 0, combinable: true, tags: ['block', 'defensive'] },
    ];
    const strategy = new Tier5ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      1,
      [],
      registry,
      new SeededRNG(1),
      5, // runStateFlux >= guaranteeRarity cost (4), no capstone available so no boost
    );
    expect(actions.some(a => a.kind === 'guarantee_rarity')).toBe(true);
  });

  it('does NOT plan guarantee_rarity when flux < 4 (below cost)', () => {
    const stockpile: GemInstance[] = [
      { uid: 'a', affixId: 'fortify', tier: 2, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['defensive'] },
      { uid: 'b', affixId: 'hp_regen', tier: 2, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['sustain'] },
      { uid: 'c', affixId: 'armor_rating', tier: 2, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['defensive'] },
    ];
    const strategy = new Tier5ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      1,
      [],
      registry,
      new SeededRNG(1),
      3, // runStateFlux < 4 — not enough for guarantee
    );
    expect(actions.some(a => a.kind === 'guarantee_rarity')).toBe(false);
  });
});

describe('Tier 5 meta-action planning — mutex (one meta per round)', () => {
  it('does NOT plan reroll_pool or guarantee_rarity when boost_combine is planned', () => {
    // Three fire/cold/lightning gems form a capstone → boost_combine fires
    // Stockpile is also archetype-poor AND rarity-poor so both heuristics would
    // trigger if not for the mutex gate.
    const stockpile: GemInstance[] = [
      { uid: 'fire', affixId: 'fire_damage', tier: 2, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['fire', 'elemental'] },
      { uid: 'cold', affixId: 'cold_damage', tier: 2, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['cold', 'elemental'] },
      { uid: 'lightning', affixId: 'lightning_damage', tier: 2, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['lightning', 'elemental'] },
    ];
    const strategy = new Tier5ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      1,
      [],
      registry,
      new SeededRNG(1),
      10, // plenty of flux for any meta-action
    );
    // boost_combine should be planned (capstone available + flux >= 3)
    expect(actions.some(a => a.kind === 'boost_combine')).toBe(true);
    // neither reroll nor guarantee should fire (boost already planned)
    expect(actions.some(a => a.kind === 'reroll_pool')).toBe(false);
    expect(actions.some(a => a.kind === 'guarantee_rarity')).toBe(false);
  });
});

describe('Tier 4 meta-action planning — reroll_pool', () => {
  it('plans reroll_pool when stockpile is archetype-poor and flux >= 5', () => {
    const stockpile: GemInstance[] = [
      { uid: 'a', affixId: 'fortify', tier: 2, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['defensive', 'conditional'] },
      { uid: 'b', affixId: 'hp_regen', tier: 2, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['sustain'] },
    ];
    const strategy = new Tier4ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      1,
      [],
      registry,
      new SeededRNG(1),
      6, // runStateFlux >= rerollPool cost (5)
    );
    expect(actions.some(a => a.kind === 'reroll_pool')).toBe(true);
  });
});

describe('Tier 4 meta-action planning — guarantee_rarity', () => {
  it('plans guarantee_rarity when stockpile is rarity-poor and flux >= 4', () => {
    // 4 common/uncommon gems, no combos available → no boost, no reroll (fitCount check)
    // We need to pick affixes that don't form combos and don't match well-fit arch
    // flat_hp + dodge_chance + damage_reduction + barrier = all defensive/sustain,
    // scattered across archetypes, so no single arch gets 2+ matches easily.
    const stockpile: GemInstance[] = [
      { uid: 'a', affixId: 'flat_hp', tier: 1, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['sustain'] },
      { uid: 'b', affixId: 'dodge_chance', tier: 1, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['defensive'] },
      { uid: 'c', affixId: 'damage_reduction', tier: 1, rarity: 'common', recipeDepth: 0, combinable: true, tags: ['defensive'] },
      { uid: 'd', affixId: 'initiative', tier: 1, rarity: 'uncommon', recipeDepth: 0, combinable: true, tags: ['utility'] },
    ];
    const strategy = new Tier4ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      2, // round 2 — no set_base_stats to worry about
      [],
      registry,
      new SeededRNG(1),
      5, // runStateFlux >= guaranteeRarity cost (4); no combos so no boost
    );
    expect(actions.some(a => a.kind === 'guarantee_rarity')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Transplant chooseAffix tests
// ---------------------------------------------------------------------------
// Fixture design:
//   host gem: tier=4, rarity='epic' → tier + rarityIndex(epic=4) = 8 >= threshold(6) ✓
//             host.tags = ['elemental', 'fire'] — overlaps with fire_damage affix
//   source gem: primary affix = 'flat_physical' (tags: ['physical','base'])
//               secondary affix = { affixId: 'fire_damage' } (tags: ['elemental','fire','dot'])
//
//   scoreAffixForHost('flat_physical', host) = 0  (no overlap with ['elemental','fire'])
//   scoreAffixForHost('fire_damage',   host) = 2  (['elemental','fire'] ∩ ['elemental','fire','dot'])
//   → secondary wins → AI should plan chosenAffix: 'secondary' when flux >= 3

function makeTransplantStockpile(): GemInstance[] {
  return [
    {
      // Host: needs hasSecondarySlot → tier + rarityIndex(epic=4) = 4+4 = 8 >= 6
      // tags match fire_damage's tags (elemental, fire) better than flat_physical (physical, base)
      uid: 'host',
      affixId: 'fire_damage',
      tier: 4,
      rarity: 'epic',
      recipeDepth: 0,
      combinable: false,
      tags: ['elemental', 'fire'],
      secondary: undefined,
    },
    {
      // Source: primary = flat_physical (tags: physical, base)
      //         secondary = fire_damage (tags: elemental, fire, dot)
      uid: 'source',
      affixId: 'flat_physical',
      tier: 2,
      rarity: 'common',
      recipeDepth: 0,
      combinable: true,
      tags: ['flat_physical'],
      secondary: {
        affixId: 'fire_damage',
        tier: 2,
        rarity: 'common',
        sourceGemUid: 'other',
      },
    },
  ];
}

describe('Tier 5 meta-action planning — transplant chooseAffix', () => {
  it('plans chosenAffix: secondary when source secondary outscores primary AND flux >= 3', () => {
    const stockpile = makeTransplantStockpile();
    const strategy = new Tier5ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      2, // round 2: skip base stats
      [],
      registry,
      new SeededRNG(1),
      5, // runStateFlux >= transplantChooseAffix cost (3)
    );
    const transplant = actions.find(a => a.kind === 'transplant_gem');
    expect(transplant).toBeDefined();
    expect((transplant as Extract<typeof transplant, { kind: 'transplant_gem' }>)?.chosenAffix).toBe('secondary');
  });

  it('does NOT plan chosenAffix when secondary does NOT outscore primary', () => {
    // Swap: host tags match flat_physical better than fire_damage
    const stockpile: GemInstance[] = [
      {
        uid: 'host',
        affixId: 'flat_physical',
        tier: 4,
        rarity: 'epic',
        recipeDepth: 0,
        combinable: false,
        tags: ['physical', 'base'], // overlaps with flat_physical (2), not fire_damage (0)
        secondary: undefined,
      },
      {
        uid: 'source',
        affixId: 'flat_physical',
        tier: 2,
        rarity: 'common',
        recipeDepth: 0,
        combinable: true,
        tags: ['flat_physical'],
        secondary: {
          affixId: 'fire_damage',
          tier: 2,
          rarity: 'common',
          sourceGemUid: 'other',
        },
      },
    ];
    const strategy = new Tier5ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      2,
      [],
      registry,
      new SeededRNG(1),
      5,
    );
    const transplant = actions.find(a => a.kind === 'transplant_gem');
    expect(transplant).toBeDefined();
    // secondary (fire_damage: elemental,fire,dot) has 0 overlap with host tags (physical,base)
    // primary (flat_physical: physical,base) has 2 overlap → primary wins → no chosenAffix
    expect((transplant as Extract<typeof transplant, { kind: 'transplant_gem' }>)?.chosenAffix).toBeUndefined();
  });

  it('does NOT plan chosenAffix when flux < 3 (even if secondary is better)', () => {
    const stockpile = makeTransplantStockpile();
    const strategy = new Tier5ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      2,
      [],
      registry,
      new SeededRNG(1),
      2, // runStateFlux < 3 — cannot afford chooseAffix
    );
    const transplant = actions.find(a => a.kind === 'transplant_gem');
    expect(transplant).toBeDefined();
    expect((transplant as Extract<typeof transplant, { kind: 'transplant_gem' }>)?.chosenAffix).toBeUndefined();
  });
});

describe('Tier 4 meta-action planning — transplant chooseAffix', () => {
  it('plans chosenAffix: secondary when source secondary outscores primary AND flux >= 3', () => {
    const stockpile = makeTransplantStockpile();
    const strategy = new Tier4ForgeStrategy();
    const actions = strategy.plan(
      stockpile,
      emptyLoadout(),
      Number.MAX_SAFE_INTEGER,
      2,
      [],
      registry,
      new SeededRNG(1),
      5,
    );
    const transplant = actions.find(a => a.kind === 'transplant_gem');
    expect(transplant).toBeDefined();
    expect((transplant as Extract<typeof transplant, { kind: 'transplant_gem' }>)?.chosenAffix).toBe('secondary');
  });
});
