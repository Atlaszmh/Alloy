import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem, rollAffix, rollBand } from '../src/loot/item-generator.js';
import { reforgeAffix } from '../src/loot/smithing.js';
import { rollFloor } from '../src/loot/forge.js';
import { profileStats } from '../src/delve/pair.js';
import { createDelveProfile, reforgeGear } from '../src/delve/profile.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';

// See the crafting spec: "The roll formula", "Forging an item", "The 'just right' sinks".

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();
const C = bal.crafting;

/** A Fire hero at the Anvil; `attune` more Fire attunement from a ring. */
function hero(attune = 0): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  if (!attune) return p;
  const ring = generateItem(
    registry,
    { uid: 'ring', ilvl: 1, rarity: 'common', slot: 'ring', mana: 'fire' },
    new SeededRNG(1),
  );
  const line = { stat: 'fireAttune' as const, value: attune, roll: 1 };
  return { ...p, equipped: { ...p.equipped, ring: { ...ring, affixes: [line] } } };
}

/** A rare pair of Fire gloves at item level 10. */
const gloves = (): GearItem =>
  generateItem(
    registry,
    { uid: 'r1', ilvl: 10, rarity: 'rare', slot: 'gloves', mana: 'fire' },
    new SeededRNG(1),
  );

describe('the roll formula', () => {
  it('lifts the whole draw within the band: u = floor + (1 − floor) × r', () => {
    const r = new SeededRNG(3).next();
    expect(rollBand([0.2, 0.5], 0, new SeededRNG(3))).toBeCloseTo(0.2 + 0.3 * r, 12);
    expect(rollBand([0.2, 0.5], 0.5, new SeededRNG(3))).toBeCloseTo(
      0.2 + 0.3 * (0.5 + 0.5 * r),
      12,
    );
    for (let seed = 1; seed <= 200; seed++) {
      const roll = rollBand([0.2, 0.5], 0.4, new SeededRNG(seed));
      expect(roll).toBeGreaterThanOrEqual(0.2 + 0.3 * 0.4);
      expect(roll).toBeLessThan(0.5);
    }
  });

  it("rolls an affix in a shard's band, kept on the line; else the rarity's, as drops always have", () => {
    const def = registry.getGearAffix('critChance')!;
    const shard = rollAffix(registry, def, 10, 'rare', new SeededRNG(4), {
      band: [0.6, 0.85],
      floor: 0.3,
    });
    expect(shard.band).toEqual([0.6, 0.85]);
    expect(shard.roll).toBeGreaterThanOrEqual(0.6 + 0.25 * 0.3);
    const plain = rollAffix(registry, def, 10, 'rare', new SeededRNG(4));
    const min = bal.loot.minRoll.rare;
    expect(plain.band).toBeUndefined();
    expect(plain.roll).toBe(min + (1 - min) * new SeededRNG(4).next());
  });
});

describe('the attunement floor', () => {
  it("is min(cap, perPoint × the hero's attunement) in the pair, 0 outside it", () => {
    const p = hero();
    const fire = profileStats(registry, p).attunement.fire;
    expect(fire).toBeGreaterThan(0);
    expect(rollFloor(registry, p, 'fire')).toBeCloseTo(C.attuneRoll.perPoint * fire, 12);
    expect(rollFloor(registry, p, 'frost')).toBe(0);
    expect(rollFloor(registry, hero(100), 'fire')).toBe(C.attuneRoll.cap);
  });

  it('counts every element before the choice', () => {
    const p = createDelveProfile(registry, 3);
    const earth = profileStats(registry, p).attunement.earth; // the starter chest
    expect(rollFloor(registry, p, 'earth')).toBeCloseTo(C.attuneRoll.perPoint * earth, 12);
  });
});

describe('Reforge', () => {
  it("clears the line's band and takes the floor", () => {
    const item = gloves();
    const banded = {
      ...item,
      affixes: item.affixes.map((a, i) =>
        i === 0 ? { ...a, band: [0.8, 1] as [number, number] } : a,
      ),
    };
    const min = bal.loot.minRoll.rare;
    for (let seed = 1; seed <= 50; seed++) {
      const out = reforgeAffix(registry, banded, 0, new SeededRNG(seed), 0.5);
      expect(out.affixes[0].band).toBeUndefined();
      expect(out.affixes[0].roll).toBeGreaterThanOrEqual(min + (1 - min) * 0.5);
    }
  });

  it("at the Anvil takes the hero's floor for the item's element", () => {
    const min = bal.loot.minRoll.rare;
    let p: DelveProfile = { ...hero(100), bag: [gloves()], scrap: 1e6 };
    for (let i = 0; i < 10; i++) {
      const res = reforgeGear(registry, p, 'r1', 1);
      expect(res.ok).toBe(true);
      expect(res.item!.affixes[1].roll).toBeGreaterThanOrEqual(min + (1 - min) * C.attuneRoll.cap);
      p = res.profile;
    }
  });
});
