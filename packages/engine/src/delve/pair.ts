import type { DataRegistry } from '../data/registry.js';
import { ABILITY_SLOTS, type AbilityBuild, type AbilitySlot } from '../types/ability.js';
import type { DelveProfile, HeroStats } from '../types/delve.js';
import type { ManaType } from '../types/mana.js';
import { computeHeroStats, pairElements, pairExtra } from './hero-stats.js';

/**
 * Elemental affinity: the hero's two elements (`profile.pair`). The primary is
 * chosen once; a second is bound between dives and can overtake the primary.
 * Every op but the choice waits for the dive to end. See the elemental affinity spec.
 * profile.ts and dive.ts import this module back: keep to function declarations.
 */

/** A build slot the pair changed: the elements it dropped and the build it has now. */
export interface BuildFix {
  slot: AbilitySlot;
  removed: ManaType[];
  build: AbilityBuild;
}

/** Whether `mana` is the primary or the bound secondary (always true before the choice). */
export function inPair(profile: Pick<DelveProfile, 'pair'>, mana: ManaType): boolean {
  return !profile.pair.primary || pairElements(profile.pair).includes(mana);
}

/** The hero's real stats: its gear, with the pair's basics and the two-element limit. */
export function profileStats(
  registry: DataRegistry,
  profile: Pick<DelveProfile, 'equipped' | 'pair'>,
): HeroStats {
  return computeHeroStats(profile.equipped, registry, pairExtra(profile.pair));
}

/**
 * Keep each build's in-pair elements; a build left with none takes the
 * primary. Form, weight and payment stay. Returns the slots it changed.
 */
export function fixBuildsToPair(profile: DelveProfile): {
  profile: DelveProfile;
  fixed: BuildFix[];
} {
  const primary = profile.pair.primary;
  if (!primary) return { profile, fixed: [] };
  const abilities = { ...profile.abilities };
  const fixed: BuildFix[] = [];
  for (const slot of ABILITY_SLOTS) {
    const old = abilities[slot];
    const kept = old.elements.filter((e) => inPair(profile, e));
    if (kept.length === old.elements.length) continue;
    const build = { ...old, elements: kept.length > 0 ? kept : [primary] };
    abilities[slot] = build;
    fixed.push({ slot, removed: old.elements.filter((e) => !kept.includes(e)), build });
  }
  return { profile: fixed.length > 0 ? { ...profile, abilities } : profile, fixed };
}
