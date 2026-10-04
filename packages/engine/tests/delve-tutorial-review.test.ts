import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { addLootToBag, createDelveProfile } from '../src/delve/profile.js';
import { startTutorial } from '../src/delve/tutorial.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';

// The guided start's whole-feature review: each finding's fix.

const registry = createDefaultRegistry();
const fresh = (primary: 'fire' | 'frost' = 'fire') =>
  createDelveProfile(registry, 7, { primary });

describe('auto-salvage waits for the tutorial', () => {
  it('keeps an uncommon set drop with uncommon auto-salvage on, while the tutorial runs', () => {
    const on = fresh();
    const p = { ...on, autoSalvage: { ...on.autoSalvage, uncommon: true } };
    const blade = generateItem(
      registry,
      { uid: 'gB', ilvl: 1, rarity: 'uncommon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(1),
    );
    expect(addLootToBag(registry, startTutorial(registry, p), [blade]).kept).toEqual([blade]);
    expect(addLootToBag(registry, p, [blade]).salvaged).toEqual([blade]);
  });
});
