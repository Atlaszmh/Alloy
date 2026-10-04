import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { addLootToBag, createDelveProfile } from '../src/delve/profile.js';
import { startTutorial } from '../src/delve/tutorial.js';
import { rollEncounterDrops } from '../src/loot/drops.js';
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

describe('no legendary gear below essenceMinDepth', () => {
  const data = loadAndValidateData();
  const loot = data.balance.delve.loot;
  // Luck so high a boss's roll is all but always legendary where it may be.
  const lucky = new DataRegistry({
    ...data,
    balance: { ...data.balance, delve: { ...data.balance.delve, loot: { ...loot, bossLuck: 1000 } } },
  });
  const roll = (depth: number, seed: number) =>
    rollEncounterDrops(
      lucky,
      { depth, kind: 'boss', gear: 1, nextUid: 1, pair: ['fire'] },
      new SeededRNG(seed),
    ).items.map((i) => i.rarity);
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

  it('a depth-5 boss with huge luck rolls epic at most; from depth 20 a legendary again', () => {
    expect(seeds.flatMap((s) => roll(5, s)).filter((r) => r === 'legendary')).toEqual([]);
    expect(seeds.flatMap((s) => roll(5, s)).filter((r) => r === 'epic').length).toBeGreaterThan(0);
    expect(seeds.flatMap((s) => roll(20, s))).toContain('legendary');
  });
});
