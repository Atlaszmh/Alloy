import type { DataRegistry } from '../data/registry.js';
import { defaultAbilities } from '../arpg/abilities/resolve.js';
import { ABILITY_SLOTS, type AbilityBuild, type AbilitySlot } from '../types/ability.js';
import type { DelveProfile, HeroStats } from '../types/delve.js';
import { GEAR_SLOTS, type GearItem, type HeroStatKey, type StatRoll } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { isDiveActive } from './dive.js';
import { computeHeroStats, pairElements, pairExtra } from './hero-stats.js';
import { findItem, replaceItem, type ProfileActionResult } from './profile.js';

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

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
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

/**
 * `item` attuned to `mana`: its lines of the old mana convert (`*Attune`,
 * `*Power`), and a line of the new element already there swaps with its
 * counterpart, so each stat keeps one line.
 */
function attuneTo(item: GearItem, mana: ManaType): GearItem {
  const lines = [...item.implicits, ...item.affixes];
  const swap = new Map<HeroStatKey, HeroStatKey>();
  for (const kind of ['Attune', 'Power'] as const) {
    const from = `${item.mana}${kind}` as HeroStatKey;
    const to = `${mana}${kind}` as HeroStatKey;
    if (lines.some((l) => l.stat === from)) swap.set(from, to).set(to, from);
  }
  const convert = (l: StatRoll): StatRoll => ({ ...l, stat: swap.get(l.stat) ?? l.stat });
  return {
    ...item,
    mana,
    implicits: item.implicits.map(convert),
    affixes: item.affixes.map(convert),
  };
}

/**
 * The one-time choice: `mana` becomes the primary, every equipped item is
 * re-attuned to it for free (the bag is left alone), and the builds start
 * over from `defaultAbilities(mana)`. Allowed mid-dive (a migrated save may be).
 */
export function chooseStartingMana(
  _registry: DataRegistry,
  profile: DelveProfile,
  mana: ManaType,
): ProfileActionResult {
  if (profile.pair.primary) return refuse(profile, 'Your mana is already chosen');
  const equipped = { ...profile.equipped };
  for (const slot of GEAR_SLOTS) {
    const item = equipped[slot];
    if (item && item.mana !== mana) equipped[slot] = attuneTo(item, mana);
  }
  return {
    ok: true,
    profile: {
      ...profile,
      equipped,
      pair: { primary: mana, secondary: null },
      abilities: defaultAbilities(mana),
    },
  };
}

/** Bind a second element: free, once, between dives. */
export function bindSecondary(profile: DelveProfile, mana: ManaType): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Bind a second element between dives');
  const { primary, secondary } = profile.pair;
  if (!primary) return refuse(profile, 'Choose your mana first');
  if (secondary) return refuse(profile, 'Your second element is already bound');
  if (mana === primary) return refuse(profile, 'That is already your primary');
  return { ok: true, profile: { ...profile, pair: { primary, secondary: mana } } };
}

/**
 * Change a bound pair (either element, or swap them) for Mana Dust and scrap,
 * between dives. Gear stays as it is; the builds follow the new pair.
 */
export function realign(
  registry: DataRegistry,
  profile: DelveProfile,
  next: { primary?: ManaType; secondary?: ManaType },
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Realign between dives');
  const { primary: p0, secondary: s0 } = profile.pair;
  if (!p0 || !s0) return refuse(profile, 'Bind a second element first');
  const primary = next.primary ?? p0;
  const secondary = next.secondary ?? s0;
  if (primary === secondary) return refuse(profile, 'Pick two different elements');
  if (primary === p0 && secondary === s0) return refuse(profile, 'Nothing to change');
  const cost = registry.getDelveBalance().pair;
  if (profile.manaDust < cost.realignDust) return refuse(profile, 'Not enough Mana Dust');
  if (profile.scrap < cost.realignScrap) return refuse(profile, 'Not enough scrap');
  const res = fixBuildsToPair({
    ...profile,
    pair: { primary, secondary },
    manaDust: profile.manaDust - cost.realignDust,
    scrap: profile.scrap - cost.realignScrap,
  });
  return { ok: true, profile: res.profile, fixed: res.fixed };
}

/**
 * Between dives, a bound secondary with more attunement than the primary
 * (above 0 and above `overtakeMargin` × it) takes its place, and the old
 * primary becomes the secondary. Builds stay valid: the pair is the same two.
 */
export function resolveOvertake(
  registry: DataRegistry,
  profile: DelveProfile,
): { profile: DelveProfile; swapped: boolean } {
  const { primary, secondary } = profile.pair;
  if (!primary || !secondary || isDiveActive(profile)) return { profile, swapped: false };
  const att = profileStats(registry, profile).attunement;
  const margin = registry.getDelveBalance().pair.overtakeMargin;
  if (att[secondary] <= 0 || att[secondary] <= margin * att[primary])
    return { profile, swapped: false };
  return {
    profile: { ...profile, pair: { primary: secondary, secondary: primary } },
    swapped: true,
  };
}

/** Re-attune an item to the pair's other element for Mana Dust, between dives. */
export function reattuneItem(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  mana: ManaType,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Re-attune between dives');
  const found = findItem(profile, uid);
  if (!found) return refuse(profile, 'Item not found');
  if (!pairElements(profile.pair).includes(mana))
    return refuse(profile, 'Re-attune to one of your two elements');
  if (found.item.mana === mana) return refuse(profile, 'Already attuned to that element');
  const cost = registry.getDelveBalance().pair.reattuneDust[found.item.rarity];
  if (profile.manaDust < cost) return refuse(profile, 'Not enough Mana Dust');
  const item = attuneTo(found.item, mana);
  return {
    ok: true,
    item,
    profile: { ...replaceItem(profile, item), manaDust: profile.manaDust - cost },
  };
}
