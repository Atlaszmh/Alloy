import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import {
  emptyMaterials,
  materialCount,
  refineCost,
  shardTiersOf,
  withMaterial,
} from '../src/loot/materials.js';
import { buyShard, refine } from '../src/delve/crafting.js';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { FLUX_GRADES, type MaterialRef } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';

// See the crafting spec: "The materials" (refining 3 → 1), the shard bench, "Tuning".

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();
const C = bal.crafting;
const R = C.refine;
const FORGE_LOCKED = 'Forge at the Anvil, between dives';

/** A Fire hero holding only `materials`, with scrap and Mana Dust to spare. */
function hero(...materials: [MaterialRef, number][]): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  const pouch = materials.reduce((m, [ref, n]) => withMaterial(m, ref, n), emptyMaterials());
  return { ...p, materials: pouch, scrap: 1000, manaDust: 100 };
}

const iron: MaterialRef = { kind: 'metal', metal: 'iron' };
const armor = (tier: number): MaterialRef => ({ kind: 'shard', stat: 'armor', tier });

describe('the pouch', () => {
  it('counts a material and adds or takes it', () => {
    const m = withMaterial(withMaterial(emptyMaterials(), armor(2), 3), iron, 2);
    expect(materialCount(m, armor(2))).toBe(3);
    expect(materialCount(m, armor(1))).toBe(0);
    expect(materialCount(m, iron)).toBe(2);
    expect(materialCount(withMaterial(m, armor(2), -1), armor(2))).toBe(2);
    expect(materialCount(m, { kind: 'dust' })).toBe(0);
  });
});

describe('refineCost', () => {
  it('prices metals, flux and shards by the data (a shard by the tier refined)', () => {
    expect(refineCost(registry, { kind: 'metal', metal: 'rusty' })).toEqual(R.metal);
    expect(refineCost(registry, { kind: 'flux', grade: 'uncommon' })).toEqual(R.flux);
    for (const tier of [1, 2, 3, 4])
      expect(refineCost(registry, armor(tier))).toEqual({
        count: R.shard.count,
        scrap: R.shard.scrap[tier - 1],
      });
  });

  it("is null at the top grade, past an affix's own tiers, and for essences, Mana Dust and Links", () => {
    expect(refineCost(registry, { kind: 'metal', metal: 'voidforged' })).toBeNull();
    expect(refineCost(registry, { kind: 'flux', grade: 'epic' })).toBeNull();
    expect(refineCost(registry, armor(5))).toBeNull();
    expect(shardTiersOf(registry, 'fireAttune')).toHaveLength(2);
    expect(refineCost(registry, { kind: 'shard', stat: 'fireAttune', tier: 1 })).not.toBeNull();
    expect(refineCost(registry, { kind: 'shard', stat: 'fireAttune', tier: 2 })).toBeNull();
    expect(refineCost(registry, { kind: 'essence', essence: 'pyroclasm' })).toBeNull();
    expect(refineCost(registry, { kind: 'dust' })).toBeNull();
    expect(refineCost(registry, { kind: 'links' })).toBeNull();
  });
});

describe('refine', () => {
  it('turns count of a grade and scrap into one of the next', () => {
    const p = hero([iron, 4]);
    const res = refine(registry, p, iron);
    expect(res.ok).toBe(true);
    expect(materialCount(res.profile.materials, iron)).toBe(4 - R.metal.count);
    expect(materialCount(res.profile.materials, { kind: 'metal', metal: 'steel' })).toBe(1);
    expect(res.profile.scrap).toBe(p.scrap - R.metal.scrap);

    const flux = refine(registry, hero([{ kind: 'flux', grade: 'magic' }, 3]), {
      kind: 'flux',
      grade: 'magic',
    });
    expect(materialCount(flux.profile.materials, { kind: 'flux', grade: 'rare' })).toBe(1);

    const shard = refine(registry, hero([armor(2), 3]), armor(2));
    expect(materialCount(shard.profile.materials, armor(2))).toBe(0);
    expect(materialCount(shard.profile.materials, armor(3))).toBe(1);
    expect(shard.profile.scrap).toBe(1000 - R.shard.scrap[1]);
  });

  it('refuses with a reason, changing nothing', () => {
    const p = hero([iron, 2], [{ kind: 'metal', metal: 'voidforged' }, 9]);
    expect(refine(registry, p, iron)).toEqual({
      ok: false,
      profile: p,
      reason: `Needs ${R.metal.count} to refine`,
    });
    expect(refine(registry, p, { kind: 'metal', metal: 'voidforged' }).reason).toBe(
      "Doesn't refine any higher",
    );
    expect(refine(registry, p, { kind: 'dust' }).reason).toBe("Doesn't refine any higher");
    expect(refine(registry, { ...hero([iron, 3]), scrap: 0 }, iron).reason).toBe(
      'Not enough scrap',
    );
    expect(refine(registry, startDive(registry, hero([iron, 3]), 1), iron).reason).toBe(
      FORGE_LOCKED,
    );
  });
});

describe('the shard bench', () => {
  it('sells a tier I shard for scrap and Mana Dust', () => {
    const p = hero();
    const res = buyShard(registry, p, 'critChance');
    expect(res.ok).toBe(true);
    expect(
      materialCount(res.profile.materials, { kind: 'shard', stat: 'critChance', tier: 1 }),
    ).toBe(1);
    expect(res.profile.scrap).toBe(p.scrap - C.shardBench.scrap);
    expect(res.profile.manaDust).toBe(p.manaDust - C.shardBench.dust);
  });

  it('refuses with a reason', () => {
    const p = hero();
    expect(buyShard(registry, { ...p, scrap: 0 }, 'armor').reason).toBe('Not enough scrap');
    expect(buyShard(registry, { ...p, manaDust: 0 }, 'armor').reason).toBe('Not enough Mana Dust');
    expect(buyShard(registry, startDive(registry, p, 1), 'armor').reason).toBe(FORGE_LOCKED);
  });
});

describe('the tier tables agree', () => {
  it('five shard tiers; the per-tier lists, the leanings and the patterns match the data', () => {
    const data = registry.getCraftingData();
    const delve = registry.getDelveData();
    const D = bal.drops;
    const tiers = data.shardTiers.length;
    expect(tiers).toBe(5);
    for (const own of Object.values(data.affixShardTiers))
      expect(own!.length).toBeLessThanOrEqual(tiers);
    expect(R.shard.scrap).toHaveLength(tiers - 1); // I→II to IV→V
    expect(C.salvageShardTier).toHaveLength(tiers - 1); // II to V
    expect(D.shardTierDepths).toHaveLength(tiers);
    expect(D.tierWeights).toHaveLength(tiers);
    expect(D.fluxGradeDepths).toHaveLength(FLUX_GRADES.length);
    const biomes = delve.biomes.map((b) => b.id);
    for (const id of Object.keys(D.biomeShardWeights)) expect(biomes).toContain(id);
    const doors = delve.doors.map((d) => d.id);
    for (const id of Object.keys(D.doors)) expect(doors).toContain(id);
    for (const id of data.startingPatterns) expect(() => registry.getGearBase(id)).not.toThrow();
  });
});
