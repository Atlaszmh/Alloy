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
