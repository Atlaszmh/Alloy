import { describe, it, expect } from 'vitest';
import {
  addHaul,
  addMaterial,
  addMaterials,
  emptyHaul,
  emptyMaterials,
  stockHaul,
} from '../src/loot/materials.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { createDelveProfile } from '../src/delve/profile.js';

// See the crafting spec: the materials pouch and a dive's haul.

describe('the pouch and the haul', () => {
  it('starts empty: every metal and grade at 0, no shards, essences, currencies or runes', () => {
    expect(emptyMaterials()).toEqual({
      metals: {
        rusty: 0,
        iron: 0,
        steel: 0,
        mithril: 0,
        adamant: 0,
        starforged: 0,
        voidforged: 0,
      },
      flux: { uncommon: 0, magic: 0, rare: 0, epic: 0 },
      shards: {},
      essences: {},
    });
    expect(emptyHaul()).toEqual({
      ...emptyMaterials(),
      scrap: 0,
      dust: 0,
      links: 0,
      runes: {},
      constructs: [],
    });
    // Fresh each time: no shared records.
    const a = emptyHaul();
    a.metals.iron = 3;
    expect(emptyHaul().metals.iron).toBe(0);
  });

  it('adds one material at a time: a shard at its tier, the others by id', () => {
    let h = emptyHaul();
    h = addMaterial(h, { kind: 'metal', metal: 'iron' }, 2);
    h = addMaterial(h, { kind: 'flux', grade: 'rare' });
    h = addMaterial(h, { kind: 'shard', stat: 'critChance', tier: 3 });
    h = addMaterial(h, { kind: 'shard', stat: 'critChance', tier: 1 }, 2);
    h = addMaterial(h, { kind: 'essence', essence: 'prism' });
    h = addMaterial(h, { kind: 'dust' }, 4);
    h = addMaterial(h, { kind: 'links' });
    expect(h.metals.iron).toBe(2);
    expect(h.flux.rare).toBe(1);
    expect(h.shards).toEqual({ critChance: [2, 0, 1] });
    expect(h.essences).toEqual({ prism: 1 });
    expect([h.dust, h.links, h.scrap]).toEqual([4, 1, 0]);
  });

  it('sums two hauls entry by entry, the runes and the shard tiers too, and leaves both as they were', () => {
    const a = {
      ...addMaterial(emptyHaul(), { kind: 'shard', stat: 'armor', tier: 2 }),
      scrap: 10,
      runes: { split: [1, 0, 0, 0, 0] },
    };
    const b = {
      ...addMaterial(emptyHaul(), { kind: 'shard', stat: 'armor', tier: 4 }),
      scrap: 5,
      dust: 2,
      runes: { split: [0, 2, 0, 0, 0], quick: [1, 0, 0, 0, 0] },
    };
    const sum = addHaul(a, b);
    expect(sum.shards).toEqual({ armor: [0, 1, 0, 1] });
    expect(sum.runes).toEqual({ split: [1, 2, 0, 0, 0], quick: [1, 0, 0, 0, 0] });
    expect([sum.scrap, sum.dust]).toEqual([15, 2]);
    expect(a.shards).toEqual({ armor: [0, 1] });
    expect(a.scrap).toBe(10);
  });

  it("adds a haul's materials to a pouch, keeping the pouch's own shape", () => {
    const pouch = addMaterials(
      emptyMaterials(),
      addMaterial(emptyHaul(), { kind: 'metal', metal: 'steel' }),
    );
    expect(pouch.metals.steel).toBe(1);
    expect('scrap' in pouch).toBe(false);
  });
});

describe('stocking a haul (the settle at extract, a salvage at the Anvil)', () => {
  it('adds its materials to the pouch and its currencies and runes to the profile', () => {
    const p = {
      ...createDelveProfile(createDefaultRegistry(), 3),
      runes: { echo: [0, 1, 0, 0, 0] },
    };
    const haul = {
      ...addMaterial(emptyHaul(), { kind: 'flux', grade: 'magic' }, 2),
      scrap: 40,
      dust: 3,
      links: 1,
      runes: { echo: [1, 0, 0, 0, 0] },
    };
    const next = stockHaul(p, haul);
    expect(next.materials.flux).toMatchObject({ uncommon: p.materials.flux.uncommon, magic: 2 });
    expect(next.materials.metals.rusty).toBe(5);
    expect([next.scrap, next.manaDust, next.links]).toEqual([p.scrap + 40, 3, 1]);
    expect(next.runes).toEqual({ echo: [1, 1, 0, 0, 0] });
    expect(next.stats.scrapEarned).toBe(p.stats.scrapEarned + 40);
    expect(p.materials.flux.magic).toBe(0);
  });
});
