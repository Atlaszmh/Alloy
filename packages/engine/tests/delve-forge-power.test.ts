import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import type { SeededRNG } from '../src/rng/seeded-rng.js';
import { forgeItem, previewForge } from '../src/loot/forge.js';
import { withMaterial } from '../src/loot/materials.js';
import { forgePowerRange } from '../src/delve/crafting.js';
import { compareItem } from '../src/delve/hero-stats.js';
import { createDelveProfile, referenceDepth } from '../src/delve/profile.js';
import type { ForgeRequest } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';

// See the pad-first spec, 4: the forge preview's Power against what is worn, as a range.

const registry = createDefaultRegistry();
/** A Fire hero at the Anvil with the kit, plus one Max Life shard and the scrap to forge. */
function hero(): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  return {
    ...p,
    scrap: 1000,
    materials: withMaterial(p.materials, { kind: 'shard', stat: 'maxHp', tier: 1 }, 1),
  };
}
/** A draw that always gives `u`: `forgeItem` at the bottom (0) or the top (just under 1) of every band. */
const always = (u: number) => ({ next: () => u }) as unknown as SeededRNG;
const power = (p: DelveProfile, item: GearItem) =>
  compareItem(p.equipped, item, registry, referenceDepth(p), p.pair).powerPct;

const CUIRASS: ForgeRequest = {
  baseId: 'cuirass',
  metal: 'rusty',
  flux: 'uncommon',
  element: 'fire',
  shards: [{ stat: 'maxHp', tier: 1 }],
};

describe('forgePowerRange', () => {
  it("spans what the forge can roll: its low is the item at every band's floor, its high at every top", () => {
    const p = hero();
    expect(previewForge(registry, p, CUIRASS).refused).toBeNull();
    const r = forgePowerRange(registry, p, CUIRASS);
    expect(r.random).toBe(0); // the uncommon's one line is the shard's
    expect(r.low).toBeLessThan(r.high);
    expect(r.low).toBeCloseTo(power(p, forgeItem(registry, p, CUIRASS, always(0))), 6);
    expect(r.high).toBeCloseTo(power(p, forgeItem(registry, p, CUIRASS, always(1 - 1e-9))), 4);
  });

  it('leaves random lines out of both ends, and counts them', () => {
    const p = hero();
    const r = forgePowerRange(registry, p, { ...CUIRASS, shards: [] });
    expect(r.random).toBe(1);
    // Without the shard's line the item is weaker at the top than with it.
    expect(r.high).toBeLessThan(forgePowerRange(registry, p, CUIRASS).high);
  });

  it("values a weapon as a home for your moveset, as the bag's tiles are valued", () => {
    const p = hero();
    const req: ForgeRequest = { baseId: 'sword', metal: 'rusty', flux: 'uncommon', element: 'fire', shards: [] };
    const r = forgePowerRange(registry, p, req);
    // The forged sword at its top, its random line taken off (the range leaves it out).
    const top = { ...forgeItem(registry, p, req, always(1 - 1e-9)), affixes: [] };
    // compareItem's default ('home') moves the worn weapon's moveset onto it: the range's value.
    expect(r.high).toBeCloseTo(power(p, top), 4);
    const asIs = compareItem(p.equipped, top, registry, referenceDepth(p), p.pair, 'asIs').powerPct;
    // Only checked to differ where the two valuations do (the worn sword's chains against the kit's).
    if (Math.abs(asIs - power(p, top)) > 1e-6) expect(r.high).not.toBeCloseTo(asIs, 6);
  });

  it('asks nothing of the purse: a request the forge refuses still has its range', () => {
    const p = { ...hero(), scrap: 0 };
    expect(previewForge(registry, p, CUIRASS).refused).not.toBeNull();
    const r = forgePowerRange(registry, p, CUIRASS);
    expect(Number.isFinite(r.low) && Number.isFinite(r.high)).toBe(true);
    expect(r).toEqual(forgePowerRange(registry, hero(), CUIRASS));
  });
});
