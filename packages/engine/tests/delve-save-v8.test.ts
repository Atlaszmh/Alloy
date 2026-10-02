import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { previewForge } from '../src/loot/forge.js';
import { emptyHaul } from '../src/loot/materials.js';

// See the crafting spec: "Profile v8" and "Loading an old save" (no migrations).

const registry = createDefaultRegistry();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('save v8', () => {
  it('starts with the starter kit: three patterns, 5 Rusty bars, 3 uncommon flux and 60 scrap', () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    expect(p.version).toBe(8);
    expect(p.patterns).toEqual(['sword', 'cuirass', 'dagger']);
    expect(p.materials.metals).toMatchObject({ rusty: 5, iron: 0 });
    expect(p.materials.flux).toEqual({ uncommon: 3, magic: 0, rare: 0, epic: 0 });
    expect(p.scrap).toBe(60);
    expect([p.materials.shards, p.materials.essences, p.essencesSeen]).toEqual([{}, {}, []]);
    expect(p.firstEssenceGiven).toBe(false);
    expect('pity' in p || 'firstBossLegendaryGiven' in p).toBe(false);
    // The kit is the data's: a new save never shares its records.
    expect(registry.getCraftingData().startingMaterials.metals).toEqual({ rusty: 5 });
  });

  it("can forge before its first dive (the crafting spec's S8): an uncommon sword from the kit", () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    const preview = previewForge(registry, p, {
      baseId: 'sword',
      metal: 'rusty',
      flux: 'uncommon',
      element: 'fire',
      shards: [],
    });
    expect(preview.price.scrap).toBeGreaterThan(0);
    expect(preview.refused).toBeNull(); // the kit's scrap pays for it
  });

  it('starts a dive with an empty haul and banked, nothing lost and not settled; it round-trips', () => {
    const p = startDive(registry, createDelveProfile(registry, 7, { primary: 'fire' }), 1);
    expect(p.dive).toMatchObject({
      haul: emptyHaul(),
      banked: emptyHaul(),
      lost: null,
      settled: false,
    });
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
  });

  it('resets a save of any other version; a version 8 save that does not fit is refused', () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    for (const version of [2, 6, 7, 9, undefined])
      expect(parseDelveProfile(registry, json({ ...p, version }))).toEqual({ reset: true });
    expect(parseDelveProfile(registry, json({ ...p, patterns: 'sword' }))).toBeNull();
    const { materials: _m, ...noPouch } = p;
    expect(parseDelveProfile(registry, json(noPouch))).toBeNull();
    expect(parseDelveProfile(registry, 'v8')).toBeNull();
  });
});
