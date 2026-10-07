import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { BoonEffectSchema, BoonsDataSchema } from '../src/data/schemas.js';
import boonsData from '../src/data/boons.json';
import type { BoonDef } from '../src/types/boon.js';

// See the boons spec, "1. The boon row": one file, `boons.json`, the six shrines its first rows.

const registry = createDefaultRegistry();
const ok = (schema: { safeParse: (x: unknown) => { success: boolean } }, x: unknown) =>
  schema.safeParse(x).success;

/** A stop row: one tier's effect copied into all three. */
const row = (o: Partial<BoonDef> = {}): BoonDef => {
  const tier = { text: '+10% damage', effect: { damage: 0.1 } };
  return {
    ...{ id: 'a', name: 'A', family: 'offense', duration: 'dive', cap: 1 },
    ...{ weight: { common: 1, rare: 1, epic: 1 }, tiers: [tier, tier, tier] },
    ...o,
  } as BoonDef;
};

describe('boons.json and the registry', () => {
  it("holds the six shrines first, in shrines.json's order, each a shrine and never at a stop", () => {
    const shrines = registry.shrineBoons();
    expect(shrines.map((b) => [b.id, b.shrine, b.duration, b.family])).toEqual([
      ['vigor', 3, 'floor', 'offense'],
      ['renewal', 3, 'floor', 'defense'],
      ['clarity', 3, 'floor', 'tempo'],
      ['fortune', 2, 'floor', 'fortune'],
      ['mercy', 2, 'floor', 'fortune'],
      ['devotion', 1, 'dive', 'offense'],
    ]);
    expect(registry.getBoons().slice(0, 6)).toEqual(shrines);
    for (const b of shrines) {
      expect(b.cap).toBe(1);
      expect(b.weight).toEqual({ common: 0, rare: 0, epic: 0 });
      expect(b.tiers[1]).toEqual(b.tiers[0]);
      expect(b.tiers[2]).toEqual(b.tiers[0]);
    }
    expect(shrines.map((b) => b.tiers[0].effect)).toEqual([
      { damage: 0.2 },
      { lifeRegen: 0.01 },
      { manaRegen: 0.5 },
      { find: 50 },
      { potions: true },
      { damage: 0.1 },
    ]);
  });

  it('finds a row by id, and gives undefined for an unknown one', () => {
    expect(registry.getBoon('mercy')?.name).toBe('Shrine of Mercy');
    expect(registry.getBoon('nope')).toBeUndefined();
  });
});

describe('BoonsDataSchema and BoonEffectSchema', () => {
  it('takes the shipped rows and refuses repeated ids, an empty or unknown effect, and a refill for the dive', () => {
    expect(ok(BoonsDataSchema, boonsData)).toBe(true);
    expect(ok(BoonsDataSchema, [row(), row({ id: 'b' })])).toBe(true);
    expect(ok(BoonsDataSchema, [row(), row()])).toBe(false);
    const tiers = (effect: object) => [0, 1, 2].map(() => ({ text: 'x', effect }));
    expect(ok(BoonsDataSchema, [row({ tiers: tiers({}) as BoonDef['tiers'] })])).toBe(false);
    expect(ok(BoonsDataSchema, [row({ tiers: tiers({ haste: 1 }) as BoonDef['tiers'] })])).toBe(
      false,
    );
    const refill = tiers({ potions: true }) as BoonDef['tiers'];
    expect(ok(BoonsDataSchema, [row({ tiers: refill, duration: 'floor' })])).toBe(true);
    expect(ok(BoonsDataSchema, [row({ tiers: refill, duration: 'dive' })])).toBe(false);
  });

  it('refuses a cap of 4, an unknown family and two tiers', () => {
    expect(ok(BoonsDataSchema, [row({ cap: 4 as never })])).toBe(false);
    expect(ok(BoonsDataSchema, [row({ family: 'luck' as never })])).toBe(false);
    expect(ok(BoonsDataSchema, [row({ tiers: row().tiers.slice(0, 2) as never })])).toBe(false);
  });

  it('takes every field of the first batch in its units', () => {
    const all = {
      ...{ damage: 0.25, manaRegen: 0.2, lifeRegen: 0.01, maxLife: -0.2, tempo: 0.08 },
      ...{ lifesteal: 0.015, bloodPrice: 0.5, attune: { role: 'secondary', points: 4 } },
      ...{ knobs: { catalyst: 0.25, quick: { cooldown: 0.92 }, echo: 0.15 } },
      ...{ byKind: { heavy: 0.2, hold: 0.2 }, firstMove: 0.25, stepBonus: 0.05 },
      ...{ lowLife: { below: 0.25, mult: 0.4 }, nearFoes: { per: 0.05, cap: 4, radius: 4 } },
      ...{ dodgeCharges: -1, dodgeWindow: 0.3, dodgeRecharge: 0.15, perfectAlways: true },
      ...{ freeCast: { seconds: 1.5, damage: 0 }, defendDuration: 0.25, barrierOnFloor: 0.08 },
      ...{ healOnClear: 0.04, lastStand: { below: 0.2, reduce: 0.4, seconds: 2 } },
      ...{ find: 25, magnet: 0.4, metalUp: 0.1, flux: 1.3, runes: 1.3, gear: 1.5, scrap: 0.2 },
      ...{ deathLoss: 0.1, potions: true, noPotions: true, eliteChance: 1, skip: 1 },
      ...{ exitRevealed: true, shrinesLastDive: true, noSlow: true, hazardsFriendly: 0.5 },
    };
    expect(BoonEffectSchema.safeParse(all).error).toBeUndefined();
    expect(ok(BoonEffectSchema, { attune: { role: 'tertiary', points: 4 } })).toBe(false);
    expect(ok(BoonEffectSchema, { knobs: { haste: 1 } })).toBe(false);
    expect(ok(BoonEffectSchema, { maxLife: -1 })).toBe(false);
    expect(ok(BoonEffectSchema, { tempo: 1 })).toBe(false);
  });
});
