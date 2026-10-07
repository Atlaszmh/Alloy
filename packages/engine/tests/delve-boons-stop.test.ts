import { describe, it, expect } from 'vitest';
import type { DataRegistry } from '../src/data/registry.js';
import { rollBoons } from '../src/delve/boons.js';
import { economySim } from '../src/delve/economy.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { BOON_FAMILIES, type BoonDef, type BoonOffer, type Buff } from '../src/types/boon.js';
import type { DiveState } from '../src/types/delve.js';
import { bal, registry } from './fixtures/arena.js';

// See the boons spec §4: the roll.

type Rolled = Pick<DiveState, 'depth' | 'door' | 'diveBuffs'>;
const at = (depth: number, over: Partial<Rolled> = {}): Rolled => ({
  depth,
  door: null,
  diveBuffs: [],
  ...over,
});
const roll = (dive: Rolled, seed: number, reg: DataRegistry = registry): BoonOffer[] =>
  rollBoons(reg, dive, new SeededRNG(seed).fork(`stop:${dive.depth}`));
const family = (o: BoonOffer) => registry.getBoon(o.id)!.family;
const buff = (id: string, n: number): Buff[] =>
  Array.from({ length: n }, () => ({
    boon: id,
    tier: 1 as const,
    effect: registry.getBoon(id)!.tiers[0].effect,
  }));
/** `registry` with these tier weights at every depth, and optionally these rows. */
function tuned(weights: [number, number, number], rows?: BoonDef[]): DataRegistry {
  const balance = { ...bal, boons: { offers: 3, tierWeights: [{ fromDepth: 1, weights }] } };
  return Object.assign(Object.create(registry) as DataRegistry, {
    getDelveBalance: () => balance,
    ...(rows && { getBoons: () => rows }),
  });
}

describe('rollBoons', () => {
  it('offers three boons of three families, the same for the same seed', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const offers = roll(at(8), seed);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map(family)).size).toBe(3);
      for (const o of offers) expect([1, 2, 3]).toContain(o.tier);
      expect(roll(at(8), seed)).toEqual(offers);
    }
    const seeds = Array.from({ length: 20 }, (_, i) => JSON.stringify(roll(at(8), i + 1)));
    expect(new Set(seeds).size).toBeGreaterThan(10);
  });

  it('never offers a boon worn to its cap', () => {
    const worn = [...buff('keen-edge', 3), ...buff('third-wind', 1), ...buff('magpie', 1)];
    let magpie = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const ids = roll(at(8, { diveBuffs: worn }), seed).map((o) => o.id);
      expect(ids).not.toContain('keen-edge');
      expect(ids).not.toContain('third-wind');
      if (ids.includes('magpie')) magpie++;
    }
    expect(magpie).toBeGreaterThan(0); // under its cap of 2: still offered
  });

  it('offers a boon only from its minDepth', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++)
      for (const o of roll(at(1), seed)) {
        expect(registry.getBoon(o.id)!.minDepth ?? 1).toBeLessThanOrEqual(1);
        seen.add(o.id);
      }
    expect(seen.has('echo')).toBe(false);
    const deep = new Set<string>();
    for (let seed = 1; seed <= 600; seed++) for (const o of roll(at(6), seed)) deep.add(o.id);
    expect(deep.has('blood-price')).toBe(true);
    expect(deep.has('echo')).toBe(true);
  });

  it('draws the tier by the depth band, leaning rarer deeper', () => {
    const epics = (depth: number) => {
      let n = 0;
      for (let seed = 1; seed <= 300; seed++)
        n += roll(at(depth), seed).filter((o) => o.tier === 3).length;
      return n;
    };
    expect(epics(40)).toBeGreaterThan(epics(1));
    for (let seed = 1; seed <= 20; seed++)
      expect(roll(at(5), seed, tuned([0, 0, 100])).every((o) => o.tier === 3)).toBe(true);
  });

  it("bumps a card one tier at the door's boons chance; epic stays epic", () => {
    const door = { ...registry.getDoor('gilded'), mods: { boons: 1 } };
    for (let seed = 1; seed <= 20; seed++) {
      expect(roll(at(5, { door }), seed, tuned([100, 0, 0])).every((o) => o.tier === 2)).toBe(true);
      expect(roll(at(5, { door }), seed, tuned([0, 0, 100])).every((o) => o.tier === 3)).toBe(true);
    }
  });

  it('falls back to a lower tier, then a higher one, when a tier has no row left', () => {
    const only = (weight: BoonDef['weight']) =>
      registry
        .getBoons()
        .filter((b) => b.weight.common > 0)
        .map((b) => ({ ...b, weight }));
    const commons = only({ common: 1, rare: 0, epic: 0 });
    const rares = only({ common: 0, rare: 1, epic: 0 });
    for (let seed = 1; seed <= 20; seed++) {
      expect(roll(at(8), seed, tuned([0, 0, 100], commons)).map((o) => o.tier)).toEqual([1, 1, 1]);
      expect(roll(at(8), seed, tuned([100, 0, 0], rares)).map((o) => o.tier)).toEqual([2, 2, 2]);
    }
  });

  it('ends the offer when no family is left, and offers nothing with no row', () => {
    const two = registry.getBoons().filter((b) => b.id === 'keen-edge' || b.id === 'magpie');
    expect(
      roll(at(8), 1, tuned([80, 18, 2], two))
        .map((o) => o.id)
        .sort(),
    ).toEqual(['keen-edge', 'magpie']);
    expect(roll(at(8), 1, tuned([80, 18, 2], registry.getBoons().slice(0, 6)))).toEqual([]);
  });
});

describe("economySim's boons", () => {
  it('counts the boons each dive took by family, every family, never a pact', () => {
    const report = economySim(registry, 1, 4);
    let total = 0;
    for (const d of report.dives) {
      expect(Object.keys(d.boons)).toEqual([...BOON_FAMILIES]);
      expect(d.boons.pact).toBe(0);
      for (const n of Object.values(d.boons)) expect(Number.isInteger(n) && n >= 0).toBe(true);
      total += Object.values(d.boons).reduce((a, b) => a + b, 0);
    }
    expect(total).toBeGreaterThan(0); // seed 1 clears depths in its first four dives
    expect(structuredClone(report.dives)).toEqual(report.dives);
  }, 60000);
});
