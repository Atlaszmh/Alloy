import { describe, it, expect } from 'vitest';
import { Tier5ForgeStrategy } from '../../src/ai/strategies/forge-strategy.js';
import { loadAndValidateData } from '../../src/data/loader.js';
import { DataRegistry } from '../../src/data/registry.js';
import { SeededRNG } from '../../src/rng/seeded-rng.js';
import type { GemInstance } from '../../src/types/gem.js';
import type { Loadout } from '../../src/types/item.js';

// Recipe used: "ignite" (type: "signature")
//   components: [{ kind: "affix", id: "chance_on_hit" }, { kind: "affix", id: "fire_damage" }]
// Both are raw affix IDs present in affixes.json — so a gem with each affixId
// is a valid input pair for findSignatureRecipe.

describe('Tier 5 incremental forge', () => {
  const data = loadAndValidateData();
  const registry = new DataRegistry(
    data.affixes,
    data.combinations,
    data.synergies,
    data.baseItems,
    data.balance,
    data.recipes,
  );

  it('plans combine across one socketed gem and one stockpile gem when a recipe matches', () => {
    // socketedGem is currently in weapon slot 0; stockpileGem is the pair.
    // Together they satisfy the "ignite" signature recipe:
    //   chance_on_hit + fire_damage → ignite
    const socketedGem: GemInstance = {
      uid: 'soc',
      affixId: 'chance_on_hit',
      tier: 2,
      rarity: 'common',
      recipeDepth: 0,
      combinable: true,
      tags: ['chance_on_hit'],
    };
    const stockpileGem: GemInstance = {
      uid: 'stk',
      affixId: 'fire_damage',
      tier: 2,
      rarity: 'common',
      recipeDepth: 0,
      combinable: true,
      tags: ['fire_damage'],
    };

    // Loadout with socketedGem already socketed in weapon slot 0.
    // Cast via unknown — tests only need .weapon.slots and .armor.slots.
    const loadout = {
      weapon: {
        baseItemId: 'sword',
        baseStats: null,
        slots: [
          { gem: socketedGem },
          null, null, null, null, null,
        ],
      },
      armor: {
        baseItemId: 'chainmail',
        baseStats: null,
        slots: [null, null, null, null, null, null],
      },
    } as unknown as Loadout;

    const strategy = new Tier5ForgeStrategy();
    // Stockpile contains only the pair gem; loadout has the socketed gem.
    const actions = strategy.plan(
      [stockpileGem],
      loadout,
      1000,
      1,
      [],
      registry,
      new SeededRNG(1),
    );

    // Must unsocket the socketed gem (weapon slot 0) before combining
    expect(
      actions.some(a => a.kind === 'unsocket_gem' && a.target === 'weapon' && a.slotIndex === 0),
      `Expected an unsocket_gem action for weapon slot 0. Actions: ${JSON.stringify(actions)}`,
    ).toBe(true);

    // Must emit a combine that references both gem UIDs (in either order)
    expect(
      actions.some(
        a =>
          a.kind === 'combine' &&
          ((a.gemUid1 === 'soc' && a.gemUid2 === 'stk') ||
           (a.gemUid1 === 'stk' && a.gemUid2 === 'soc')),
      ),
      `Expected a combine action with uids 'soc' and 'stk'. Actions: ${JSON.stringify(actions)}`,
    ).toBe(true);
  });
});
