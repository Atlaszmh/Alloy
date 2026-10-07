import { describe, it, expect } from 'vitest';
import { applyBuffs, computeHeroStats } from '../src/delve/hero-stats.js';
import { buffSum } from '../src/delve/boons.js';
import { makeCtx } from '../src/arpg/combat.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { BoonEffect, Buff } from '../src/types/boon.js';
import { gear, registry } from './fixtures/arena.js';

// The boons spec §2: each combat field at its one site. Without the boon, nothing moves.

const STATS = computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry);
const buff = (effect: BoonEffect): Buff => ({ boon: 'test', tier: 1, effect });

/** The hero wears these boons: its `boon` view only (its stats stay as built). */
function wear(w: ArpgWorld, ...effects: BoonEffect[]): ArpgWorld {
  w.hero.boon = buffSum(effects.map(buff));
  return w;
}
const ctxOf = (w: ArpgWorld) => makeCtx(registry, w, []);

/** The first hit's amount from `source` in `events` (NaN: none). */
function firstHit(events: ArpgEvent[], source: 'basic' | 'skill'): number {
  const e = events.find((x) => x.kind === 'hit' && x.source === source);
  return e?.kind === 'hit' ? e.amount : NaN;
}

describe('applyBuffs (hero-stats.ts)', () => {
  it('maxLife multiplies max life per entry, the product floored at 0.3', () => {
    const s = applyBuffs(STATS, [buff({ maxLife: -0.2 }), buff({ maxLife: 0.5 })]);
    expect(s.maxHp).toBeCloseTo(STATS.maxHp * 0.8 * 1.5, 9);
    const floor = applyBuffs(STATS, [buff({ maxLife: -0.5 }), buff({ maxLife: -0.5 })]);
    expect(floor.maxHp).toBeCloseTo(STATS.maxHp * 0.3, 9);
  });

  it('tempo multiplies the tempo by (1 − x) per entry, the product floored at 0.5', () => {
    const s = applyBuffs(STATS, [buff({ tempo: 0.1 }), buff({ tempo: 0.2 })]);
    expect(s.tempo).toBeCloseTo(STATS.tempo * 0.9 * 0.8, 12);
    const floor = applyBuffs(STATS, [buff({ tempo: 0.4 }), buff({ tempo: 0.4 })]);
    expect(floor.tempo).toBeCloseTo(STATS.tempo * 0.5, 12);
  });

  it('lifesteal adds', () => {
    const s = applyBuffs(STATS, [buff({ lifesteal: 0.015 }), buff({ lifesteal: 0.025 })]);
    expect(s.lifesteal).toBeCloseTo(STATS.lifesteal + 0.04, 12);
  });

  it('Blood Price stops mana regen; a boon without these fields leaves them be', () => {
    const blood = applyBuffs(STATS, [buff({ manaRegen: 0.5 }), buff({ bloodPrice: 0.5 })]);
    expect(blood.manaRegenMult).toBe(0);
    const plain = applyBuffs(STATS, [buff({ damage: 0.2 })]);
    expect([plain.maxHp, plain.tempo, plain.lifesteal, plain.manaRegenMult]).toEqual([
      STATS.maxHp,
      STATS.tempo,
      STATS.lifesteal,
      STATS.manaRegenMult,
    ]);
  });
});
