import type { BoonId, BoonSum, Buff } from '../types/boon.js';

// The boons' pure parts (see the boons spec): the combined view the sim reads, and a boon's count.

/** The fields that sum across entries (counts and additive bonuses). */
const SUMMED = [
  'lifeRegen',
  'lifesteal',
  'bloodPrice',
  'firstMove',
  'stepBonus',
  'dodgeCharges',
  'dodgeWindow',
  'dodgeRecharge',
  'defendDuration',
  'barrierOnFloor',
  'healOnClear',
  'find',
  'magnet',
  'metalUp',
  'scrap',
  'deathLoss',
  'eliteChance',
  'skip',
] as const;

/** Bonuses that multiply per entry, each as (1 + x): the sum keeps the added fraction, Π(1 + x) − 1. */
const COMPOUNDED = ['damage', 'manaRegen', 'maxLife'] as const;

/** Raw factors that multiply per entry. */
const FACTORS = ['flux', 'runes', 'gear'] as const;

/** Flags: on when any entry sets them. */
const FLAGS = [
  'perfectAlways',
  'potions',
  'noPotions',
  'exitRevealed',
  'shrinesLastDive',
  'noSlow',
] as const;

/**
 * The buffs combined by the spec's stacking rule (§2): counts and additive bonuses sum; `damage`,
 * `manaRegen` and `maxLife` compound (Π(1 + x) − 1), `tempo` too as Π(1 − x) read back as
 * 1 − Π(1 − x), and the drop factors multiply; `hazardsFriendly` takes the largest; flags OR; a
 * compound field's bonus part sums and its shape (a threshold, a cap, a radius, seconds) takes the
 * largest; `byKind` sums per kind; `attune` sums by role; `knobs` lists each entry's partial, in
 * order, for `mergeKnobs`. A field no entry sets is absent (neutral). Pure.
 */
export function buffSum(buffs: readonly Buff[]): BoonSum {
  const sum: BoonSum = { knobs: [], attune: { primary: 0, secondary: 0 } };
  for (const { effect: e } of buffs) {
    for (const k of SUMMED) if (e[k] !== undefined) sum[k] = (sum[k] ?? 0) + e[k];
    for (const k of COMPOUNDED)
      if (e[k] !== undefined) sum[k] = (1 + (sum[k] ?? 0)) * (1 + e[k]) - 1;
    for (const k of FACTORS) if (e[k] !== undefined) sum[k] = (sum[k] ?? 1) * e[k];
    for (const k of FLAGS) if (e[k]) sum[k] = true;
    if (e.tempo !== undefined) sum.tempo = 1 - (1 - (sum.tempo ?? 0)) * (1 - e.tempo);
    if (e.hazardsFriendly !== undefined)
      sum.hazardsFriendly = Math.max(sum.hazardsFriendly ?? 0, e.hazardsFriendly);
    if (e.byKind) {
      const by = { ...sum.byKind };
      for (const [kind, x] of Object.entries(e.byKind) as [keyof typeof by, number][])
        by[kind] = (by[kind] ?? 0) + x;
      sum.byKind = by;
    }
    if (e.lowLife)
      sum.lowLife = {
        below: Math.max(sum.lowLife?.below ?? 0, e.lowLife.below),
        mult: (sum.lowLife?.mult ?? 0) + e.lowLife.mult,
      };
    if (e.nearFoes)
      sum.nearFoes = {
        per: (sum.nearFoes?.per ?? 0) + e.nearFoes.per,
        cap: Math.max(sum.nearFoes?.cap ?? 0, e.nearFoes.cap),
        radius: Math.max(sum.nearFoes?.radius ?? 0, e.nearFoes.radius),
      };
    if (e.freeCast)
      sum.freeCast = {
        seconds: Math.max(sum.freeCast?.seconds ?? 0, e.freeCast.seconds),
        damage: (sum.freeCast?.damage ?? 0) + e.freeCast.damage,
      };
    if (e.lastStand)
      sum.lastStand = {
        below: Math.max(sum.lastStand?.below ?? 0, e.lastStand.below),
        reduce: Math.max(sum.lastStand?.reduce ?? 0, e.lastStand.reduce),
        seconds: Math.max(sum.lastStand?.seconds ?? 0, e.lastStand.seconds),
      };
    if (e.attune) sum.attune[e.attune.role] += e.attune.points;
    if (e.knobs) sum.knobs.push(e.knobs);
  }
  return sum;
}

/** How many of `id` the hero wears: its entries (a boon's stacks). */
export function boonCount(buffs: readonly Buff[], id: BoonId): number {
  return buffs.filter((b) => b.boon === id).length;
}
