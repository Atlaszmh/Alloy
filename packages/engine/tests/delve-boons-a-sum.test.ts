import { describe, it, expect } from 'vitest';
import { applyShrine } from '../src/arpg/interact.js';
import { createHeroEntity } from '../src/arpg/world.js';
import { boonCount, buffSum } from '../src/delve/boons.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { BoonEffect, Buff } from '../src/types/boon.js';
import { DEFAULT_CHAINS, arena, gear, registry } from './fixtures/arena.js';

// See the boons spec, "2. The effect and where each field applies": `buffSum` is the combined
// view the sim reads, kept on `HeroEntity.boon`.

const buff = (boon: string, effect: BoonEffect, tier: 1 | 2 | 3 = 1): Buff => ({
  boon,
  tier,
  effect,
});

describe('buffSum', () => {
  it('is neutral with nothing worn', () => {
    expect(buffSum([])).toEqual({ knobs: [], attune: { primary: 0, secondary: 0 } });
  });

  it('sums counts and additive bonuses across entries and tiers', () => {
    const s = buffSum([
      buff('a', { find: 25, dodgeCharges: 1, scrap: 0.2, skip: 1, deathLoss: 0.1 }),
      buff('a', { find: 40, dodgeCharges: -1, scrap: 0.35, deathLoss: 0.15 }, 2),
      buff('b', { lifeRegen: 0.01, lifesteal: 0.015, dodgeWindow: 0.3, magnet: 0.4 }),
      buff('b', { lifeRegen: 0.02, lifesteal: 0.025, dodgeWindow: 0.5, metalUp: 0.1 }, 3),
    ]);
    expect(s.find).toBe(65);
    expect(s.dodgeCharges).toBe(0);
    expect(s.scrap).toBeCloseTo(0.55, 12);
    expect(s.skip).toBe(1);
    expect(s.deathLoss).toBeCloseTo(0.25, 12);
    expect(s.lifeRegen).toBeCloseTo(0.03, 12);
    expect(s.lifesteal).toBeCloseTo(0.04, 12);
    expect(s.dodgeWindow).toBeCloseTo(0.8, 12);
    expect(s.magnet).toBeCloseTo(0.4, 12);
    expect(s.metalUp).toBeCloseTo(0.1, 12);
    expect(s.damage).toBeUndefined();
  });

  it('compounds damage, mana regen, max life and tempo per entry, and multiplies the drop factors', () => {
    const s = buffSum([
      buff('a', { damage: 0.1, manaRegen: 0.5, maxLife: -0.2, tempo: 0.08, flux: 1.3 }),
      buff('b', { damage: 0.2, manaRegen: 0.2, maxLife: -0.2, tempo: 0.12, flux: 1.5, gear: 2 }),
    ]);
    expect(s.damage).toBeCloseTo(1.1 * 1.2 - 1, 12);
    expect(s.manaRegen).toBeCloseTo(1.5 * 1.2 - 1, 12);
    expect(s.maxLife).toBeCloseTo(0.8 * 0.8 - 1, 12);
    expect(s.tempo).toBeCloseTo(1 - 0.92 * 0.88, 12);
    expect(s.flux).toBeCloseTo(1.95, 12);
    expect(s.gear).toBe(2);
    expect(s.runes).toBeUndefined();
  });

  it('takes the largest hazardsFriendly, ORs the flags, and sums by kind and by role', () => {
    const s = buffSum([
      buff('a', { hazardsFriendly: 0.5, noSlow: true, byKind: { heavy: 0.2, hold: 0.2 } }),
      buff('a', {
        hazardsFriendly: 0.8,
        byKind: { heavy: 0.3 },
        attune: { role: 'primary', points: 4 },
      }),
      buff('b', { perfectAlways: true, attune: { role: 'secondary', points: 6 } }),
      buff('b', { attune: { role: 'primary', points: 10 } }),
    ]);
    expect(s.hazardsFriendly).toBe(0.8);
    expect([s.noSlow, s.perfectAlways, s.exitRevealed]).toEqual([true, true, undefined]);
    expect(s.byKind).toEqual({ heavy: 0.5, hold: 0.2 });
    expect(s.attune).toEqual({ primary: 14, secondary: 6 });
  });

  it("sums a compound field's bonus and takes its shape's largest", () => {
    const s = buffSum([
      buff('a', {
        nearFoes: { per: 0.05, cap: 4, radius: 4 },
        lowLife: { below: 0.25, mult: 0.4 },
      }),
      buff('a', {
        nearFoes: { per: 0.08, cap: 4, radius: 4 },
        lowLife: { below: 0.35, mult: 0.6 },
      }),
      buff('b', {
        freeCast: { seconds: 1.5, damage: 0.1 },
        lastStand: { below: 0.2, reduce: 0.5, seconds: 3 },
      }),
    ]);
    expect(s.nearFoes!.per).toBeCloseTo(0.13, 12);
    expect([s.nearFoes!.cap, s.nearFoes!.radius]).toEqual([4, 4]);
    expect(s.lowLife).toEqual({ below: 0.35, mult: 1 });
    expect(s.freeCast).toEqual({ seconds: 1.5, damage: 0.1 });
    expect(s.lastStand).toEqual({ below: 0.2, reduce: 0.5, seconds: 3 });
  });

  it("lists each entry's knob partial in order, for mergeKnobs", () => {
    const a = { quick: { cooldown: 0.92 } };
    const b = { echo: 0.15 };
    expect(
      buffSum([buff('a', { knobs: a }), buff('b', { damage: 0.1 }), buff('a', { knobs: b })]).knobs,
    ).toEqual([a, b]);
  });
});

describe('boonCount', () => {
  it("counts a boon's entries", () => {
    const worn = [buff('a', { find: 1 }), buff('b', { find: 1 }), buff('a', { find: 1 }, 3)];
    expect([boonCount(worn, 'a'), boonCount(worn, 'b'), boonCount(worn, 'c')]).toEqual([2, 1, 0]);
  });
});

describe('HeroEntity.boon', () => {
  it("is the dive's buffs summed at floor start, and follows a shrine's blessing", () => {
    const stats = computeHeroStats({ weapon: gear('fire') }, registry);
    const start = { hpFrac: 1, potions: 3, phoenixAvailable: true, x: 5, y: 5 };
    const worn = [buff('devotion', { damage: 0.1 }), buff('magpie', { find: 25 })];
    const h = createHeroEntity(registry, stats, DEFAULT_CHAINS, { ...start, diveBuffs: worn });
    expect(h.boon).toEqual(buffSum(worn));
    expect(createHeroEntity(registry, stats, DEFAULT_CHAINS, start).boon).toEqual(buffSum([]));
    const w = arena();
    applyShrine(registry, w, registry.getBoon('vigor')!);
    expect(w.hero.boon.damage).toBeCloseTo(0.2, 12);
    applyShrine(registry, w, registry.getBoon('devotion')!);
    expect(w.hero.boon.damage).toBeCloseTo(1.2 * 1.1 - 1, 12);
    applyShrine(registry, w, registry.getBoon('fortune')!);
    expect(w.hero.boon.find).toBe(50);
  });
});
