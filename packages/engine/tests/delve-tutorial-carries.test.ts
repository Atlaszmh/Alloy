import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { generateItem } from '../src/loot/item-generator.js';
import { UNARMED, carriedSkills, defaultMoveset, movesetTransfer } from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { RARITY_ORDER, type Rarity } from '../src/types/gear.js';

// See the tutorial spec's carries: `carriedSkills` takes the item (its rarity and, from B3, its
// awakening). Phase A: the same skills as before for every caller.

const registry = createDefaultRegistry();
const carries = registry.getDelveBalance().movesets.carries;
const sword = (rarity: Rarity, uid = `w-${rarity}`) =>
  generateItem(
    registry,
    { uid, ilvl: 5, rarity, slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(7).fork(uid),
  );

describe('carriedSkills(item)', () => {
  it("reads the item's rarity: the carries table's chains, an awakened rare's too (until B3)", () => {
    for (const r of RARITY_ORDER) {
      expect(carriedSkills(registry, sword(r))).toEqual(carries[r]);
      expect(carriedSkills(registry, { rarity: r })).toEqual(carries[r]);
    }
    expect(carriedSkills(registry, { ...sword('rare'), awakened: true })).toEqual(carries.rare);
  });

  it('unarmed (null, or UNARMED) carries the basic chain and the Primary', () => {
    expect(carriedSkills(registry, null)).toEqual(['basic', 'primary']);
    expect(carriedSkills(registry, UNARMED)).toEqual(['basic', 'primary']);
  });

  it("threads through a moveset's owner and a transfer's target as before", () => {
    const magic = sword('magic');
    expect(Object.keys(defaultMoveset(registry, magic, 'fire').chains)).toEqual(carries.magic);
    const t = movesetTransfer(registry, sword('epic'), { ...sword('rare', 'r2'), awakened: true });
    expect(Object.keys(t.moveset.chains)).toEqual(carries.rare);
  });
});
