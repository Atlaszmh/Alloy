import type { DataRegistry } from '../data/registry.js';
import { weightedPick } from '../loot/item-generator.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import {
  BOON_TIER_NAMES,
  type BoonId,
  type BoonSum,
  type Buff,
  type BoonDef,
  type BoonFamily,
  type BoonOffer,
  type BoonTierIndex,
} from '../types/boon.js';
import type { DiveState } from '../types/delve.js';

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

/** A tier, then the lower ones, then the higher ones (the boons spec §4's fallback). */
const FALLBACK: Record<BoonTierIndex, BoonTierIndex[]> = {
  1: [1, 2, 3],
  2: [2, 1, 3],
  3: [3, 2, 1],
};
const TIERS = [1, 2, 3] as const;

/** A row's stop weight at a tier. */
const weightAt = (b: BoonDef, t: BoonTierIndex) => b.weight[BOON_TIER_NAMES[t - 1]];

/**
 * A stop's boon offer (the boons spec §4), drawn on `rng` (the dive seed's
 * `stop:<depth>` fork): up to `delve.boons.offers` cards, each a tier by the
 * depth's band (the last `tierWeights` entry from at most `dive.depth`), one
 * tier up at the chance of the door that led here (`DoorMods.boons`), then a row
 * by its weight at that tier among those with `minDepth` met, under their `cap`
 * in `dive.diveBuffs`, and of a family not yet offered. A tier with no such row
 * falls back lower, then higher; with none at all the offer ends. The bump is
 * drawn for every card, even at a chance of 0, so the draws (and the offers a
 * seed gives) don't depend on the door.
 */
export function rollBoons(
  registry: DataRegistry,
  dive: Pick<DiveState, 'depth' | 'door' | 'diveBuffs'>,
  rng: SeededRNG,
): BoonOffer[] {
  const { offers, tierWeights } = registry.getDelveBalance().boons;
  const band = tierWeights.filter((b) => b.fromDepth <= dive.depth).at(-1) ?? tierWeights[0];
  const bump = dive.door?.mods.boons ?? 0;
  const open = registry
    .getBoons()
    .filter((b) => (b.minDepth ?? 1) <= dive.depth && boonCount(dive.diveBuffs, b.id) < b.cap);
  const families = new Set<BoonFamily>();
  const out: BoonOffer[] = [];
  for (let n = 0; n < offers; n++) {
    let tier: BoonTierIndex = weightedPick(TIERS, (t) => band.weights[t - 1], rng);
    if (rng.next() < bump) tier = Math.min(3, tier + 1) as BoonTierIndex;
    const left = open.filter((b) => !families.has(b.family));
    const t = FALLBACK[tier].find((x) => left.some((b) => weightAt(b, x) > 0));
    if (t === undefined) break;
    const row = weightedPick(
      left.filter((b) => weightAt(b, t) > 0),
      (b) => weightAt(b, t),
      rng,
    );
    families.add(row.family);
    out.push({ id: row.id, tier: t });
  }
  return out;
}
