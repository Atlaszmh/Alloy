import { describe, it, expect } from 'vitest';
import { betweenDives, runAutopilot } from '../src/delve/autopilot.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { emptyMaterials, withMaterial } from '../src/loot/materials.js';
import { carriedSkills, defaultMoveset } from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Rarity } from '../src/types/gear.js';
import { registry } from './fixtures/arena.js';

// See the tutorial spec: the autopilot awakens its rare when it can pay and Power rises, and a
// new save's bot gets its Primary from its first forge.

/** A Fire hero after its first dive, wielding a sword of `rarity`, nothing to forge, the price of an awakening to spare. */
function veteran(rarity: Rarity, epicFlux = 1): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  const sword = generateItem(
    registry,
    { uid: 'w', ilvl: 6, rarity, slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(2),
  );
  return {
    ...p,
    equipped: {
      ...p.equipped,
      weapon: { ...sword, moveset: defaultMoveset(registry, sword, 'fire') },
    },
    materials: withMaterial(emptyMaterials(), { kind: 'flux', grade: 'epic' }, epicFlux),
    links: 2,
    scrap: 1000,
    stats: { ...p.stats, dives: 1 },
  };
}

describe('the autopilot and Awaken', () => {
  it('awakens the rare weapon it wields when it can pay, and spends the epic flux', () => {
    const after = betweenDives(registry, veteran('rare'));
    expect(after.equipped.weapon!.awakened).toBe(true);
    expect(after.equipped.weapon!.moveset!.chains.ultimate).toBeDefined();
    expect(after.materials.flux.epic).toBe(0);
  });

  it('leaves it be without the epic flux, and never awakens anything but a rare', () => {
    expect(betweenDives(registry, veteran('rare', 0)).equipped.weapon!.awakened).toBeUndefined();
    const magic = betweenDives(registry, veteran('magic'));
    expect(magic.equipped.weapon!.awakened).toBeUndefined();
    expect(magic.materials.flux.epic).toBe(1);
  });
});

describe("a new save's bot", () => {
  it('gets its Primary from its first forge, before dive 1', () => {
    for (const primary of ['fire', 'frost'] as const)
      for (const seed of [1, 2]) {
        const { profile } = runAutopilot(registry, { seed, dives: 0, primary });
        expect(carriedSkills(registry, profile.equipped.weapon!), `${primary} ${seed}`).toContain(
          'primary',
        );
        expect(profile.equipped.weapon!.moveset!.chains.primary).toBeDefined();
      }
  });
});
