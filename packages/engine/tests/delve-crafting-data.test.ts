import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { CraftingDataSchema } from '../src/data/schemas.js';
import craftingData from '../src/data/crafting.json';
import delveData from '../src/data/delve.json';
import { materialName } from '../src/loot/item-generator.js';
import { metalAt, shardTiersOf } from '../src/loot/materials.js';
import { METAL_IDS } from '../src/types/crafting.js';
import { HERO_STAT_KEYS } from '../src/types/gear.js';

// See the crafting spec: "Tuning: every number in data".

const registry = createDefaultRegistry();
const data = registry.getCraftingData();

describe('crafting.json', () => {
  it('loads the seven metals, lowest first, their bands partitioning the item levels', () => {
    expect(data.metals.map((m) => m.id)).toEqual([...METAL_IDS]);
    expect(data.metals.map((m) => m.band)).toEqual([
      [1, 4],
      [5, 9],
      [10, 15],
      [16, 23],
      [24, 33],
      [34, 47],
      [48, null],
    ]);
    expect(data.flux.map((f) => f.grade)).toEqual(['uncommon', 'magic', 'rare', 'epic']);
    expect('materials' in delveData).toBe(false);
  });

  it('names an item after the metal whose band holds its level', () => {
    expect([0, 1, 4, 5, 15, 16, 47, 48, 200].map((ilvl) => metalAt(registry, ilvl).id)).toEqual([
      'rusty',
      'rusty',
      'rusty',
      'iron',
      'steel',
      'mithril',
      'starforged',
      'voidforged',
      'voidforged',
    ]);
    expect(materialName(registry, 12)).toBe('Steel');
    expect(materialName(registry, 48)).toBe('Voidforged');
  });

  it('gives every affix a family and five shard tiers, the Attune shards two', () => {
    expect(Object.keys(data.families).sort()).toEqual([...HERO_STAT_KEYS].sort());
    for (const a of registry.getDelveData().affixes) expect(data.families[a.stat]).toBeDefined();
    expect(shardTiersOf(registry, 'damage').map((t) => t.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(shardTiersOf(registry, 'fireAttune')).toEqual([
      { tier: 1, min: 0, max: 0.5 },
      { tier: 2, min: 0.5, max: 1 },
    ]);
  });

  it("knows the starter kit: the sword's, the cuirass's and the dagger's patterns, 5 Rusty bars and an uncommon flux", () => {
    expect(data.startingPatterns).toEqual(['sword', 'cuirass', 'dagger']);
    for (const id of data.startingPatterns) expect(registry.getGearBase(id).id).toBe(id);
    expect(data.startingMaterials).toEqual({ metals: { rusty: 5 }, flux: { uncommon: 1 } });
  });
});

describe('CraftingDataSchema', () => {
  const ok = (over: object) => CraftingDataSchema.safeParse({ ...craftingData, ...over }).success;
  const metals = (bands: [number, number | null][]) =>
    craftingData.metals.map((m, i) => ({ ...m, band: bands[i] }));

  it('accepts the data', () => {
    expect(ok({})).toBe(true);
  });

  it('refuses metal bands that leave a gap, overlap, start above 1 or close the last', () => {
    const good: [number, number | null][] = [
      [1, 4],
      [5, 9],
      [10, 15],
      [16, 23],
      [24, 33],
      [34, 47],
      [48, null],
    ];
    expect(ok({ metals: metals(good) })).toBe(true);
    const at = (i: number, band: [number, number | null]) =>
      metals(good.map((b, j) => (j === i ? band : b)));
    expect(ok({ metals: at(1, [6, 9]) })).toBe(false); // a gap at 5
    expect(ok({ metals: at(1, [4, 9]) })).toBe(false); // 4 twice
    expect(ok({ metals: at(0, [2, 4]) })).toBe(false); // nothing at 1
    expect(ok({ metals: at(6, [48, 60]) })).toBe(false); // the last closed
    expect(ok({ metals: at(3, [16, 15]) })).toBe(false); // runs backwards
    expect(ok({ metals: [...craftingData.metals].reverse() })).toBe(false);
  });

  it('refuses a missing family, tiers out of order and a band that runs backwards', () => {
    const { damage: _d, ...families } = craftingData.families;
    expect(ok({ families })).toBe(false);
    const [one, two, ...rest] = craftingData.shardTiers;
    expect(ok({ shardTiers: [two, one, ...rest] })).toBe(false);
    expect(ok({ shardTiers: [{ tier: 1, min: 0.5, max: 0.2 }] })).toBe(false);
  });
});
