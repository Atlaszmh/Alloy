import { describe, it, expect } from 'vitest';
import { betweenDives, runAutopilot } from '../src/delve/autopilot.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { emptyMaterials, withMaterial } from '../src/loot/materials.js';
import { defaultMoveset, movesetOf } from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { FluxGrade } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Rarity } from '../src/types/gear.js';
import { registry, withUids } from './fixtures/arena.js';

// See the constructs spec §7: the autopilot Opens a skill when it can pay and Power rises, and a
// new save's sword starts with a Primary, so nothing forces a forge before dive 1.

/** A Fire hero after its first dive, wielding a sword of `rarity`, nothing to forge, `flux` of `grade` to spare. */
function veteran(rarity: Rarity, grade: FluxGrade, flux = 1): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  const sword = generateItem(
    registry,
    { uid: 'w', ilvl: 6, rarity, slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(2),
  );
  return withUids({
    ...p,
    equipped: {
      ...p.equipped,
      weapon: { ...sword, moveset: defaultMoveset(registry, sword, 'fire') },
    },
    materials: withMaterial(emptyMaterials(), { kind: 'flux', grade }, flux),
    links: 3,
    scrap: 1000,
    stats: { ...p.stats, dives: 1 },
  });
}

describe('the autopilot and Open a skill', () => {
  it('opens the Ultimate on the magic sword it wields when it can pay, and spends the flux', () => {
    const after = betweenDives(registry, veteran('magic', 'magic'));
    const m = movesetOf(registry, after.equipped.weapon!);
    expect(m.chains.ultimate).toBeDefined();
    expect(m.bought.ultimate).toBe(1);
    expect(after.materials.flux.magic).toBe(0);
  });

  it('leaves it be without the flux, and opens nothing on a common sword (its Ultimate ceiling is 0)', () => {
    const poor = betweenDives(registry, veteran('magic', 'magic', 0));
    expect(movesetOf(registry, poor.equipped.weapon!).chains.ultimate).toBeUndefined();
    const common = betweenDives(registry, veteran('common', 'uncommon', 2));
    expect(movesetOf(registry, common.equipped.weapon!).chains.ultimate).toBeUndefined();
  });
});

describe("a new save's bot", () => {
  it('starts with a Primary of two constructs, before any forge', () => {
    for (const primary of ['fire', 'frost'] as const)
      for (const seed of [1, 2]) {
        const { profile } = runAutopilot(registry, { seed, dives: 0, primary });
        const m = movesetOf(registry, profile.equipped.weapon!);
        expect(m.chains.primary!.moves.length, `${primary} ${seed}`).toBeGreaterThanOrEqual(2);
      }
  });
});
