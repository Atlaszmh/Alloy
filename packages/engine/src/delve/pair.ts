import type { DataRegistry } from '../data/registry.js';
import { defaultChains } from '../arpg/abilities/resolve.js';
import { ABILITY_SLOTS, type Blow, type ChainSkill, type Move } from '../types/ability.js';
import type { DelveProfile, HeroStats, ManaPair } from '../types/delve.js';
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

/** A chain's move (or blow) the pair changed: where it is, the elements it dropped, and what it is now. */
export interface ChainFix {
  skill: ChainSkill;
  index: number;
  removed: ManaType[];
  move: Move | Blow;
}

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/** Whether `mana` is the primary or the bound secondary (always true before the choice). */
export function inPair(profile: Pick<DelveProfile, 'pair'>, mana: ManaType): boolean {
  return !profile.pair.primary || pairElements(profile.pair).includes(mana);
}

/** The hero's real stats: its gear, with its basic chain, the pair's power and the two-element limit. */
export function profileStats(
  registry: DataRegistry,
  profile: Pick<DelveProfile, 'equipped' | 'pair' | 'chains'>,
): HeroStats {
  return computeHeroStats(
    profile.equipped,
    registry,
    pairExtra(profile.pair, profile.chains.basic),
  );
}

/** Mana Dust from salvaging `item`: its rarity's share when its mana is outside the pair (none before the choice). */
export function salvageDust(registry: DataRegistry, item: GearItem, pair: ManaPair): number {
  return inPair({ pair }, item.mana) ? 0 : registry.getDelveBalance().pair.salvageDust[item.rarity];
}

/**
 * Fit every move and blow to the pair. After a pair op (`was`, the pair
 * before it), an element that left the pair becomes the element that took its
 * role: the old primary's the new primary, the old secondary's the new
 * secondary (a Fire+Storm move stays fused as Fire+Nature). With no `was` (the
 * migration), a move keeps its in-pair elements, and a move left with none,
 * like a blow outside the pair, takes the primary. Kinds, forms and payments
 * stay. Returns the moves it changed, one notice each.
 */
export function fixChainsToPair(
  profile: DelveProfile,
  was?: ManaPair,
): { profile: DelveProfile; fixed: ChainFix[] } {
  const { primary, secondary } = profile.pair;
  if (!primary) return { profile, fixed: [] };
  const heir = (e: ManaType): ManaType | null =>
    e === was?.primary ? primary : e === was?.secondary ? (secondary ?? primary) : null;
  /** The elements that stay or take over, each once; none left: the primary. */
  const fit = (els: ManaType[]): ManaType[] => {
    const kept = els.map((e) => (inPair(profile, e) ? e : heir(e)));
    const out = [...new Set(kept.filter((e): e is ManaType => e !== null))];
    return out.length > 0 ? out : [primary];
  };
  const fixed: ChainFix[] = [];
  const basic = profile.chains.basic.map((blow, index) => {
    if (inPair(profile, blow.element)) return blow;
    const move = { ...blow, element: fit([blow.element])[0] };
    fixed.push({ skill: 'basic', index, removed: [blow.element], move });
    return move;
  });
  const chains = { ...profile.chains, basic };
  for (const slot of ABILITY_SLOTS) {
    const moves = chains[slot].moves.map((old, index) => {
      if (old.elements.every((e) => inPair(profile, e))) return old;
      const move = { ...old, elements: fit(old.elements) };
      fixed.push({
        skill: slot,
        index,
        removed: old.elements.filter((e) => !inPair(profile, e)),
        move,
      });
      return move;
    });
    chains[slot] = { ...chains[slot], moves };
  }
  return { profile: fixed.length > 0 ? { ...profile, chains } : profile, fixed };
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
 * re-attuned to it for free (the bag is left alone), and the chains start
 * over from `defaultChains` in it. Allowed mid-dive (a migrated save may be).
 */
export function chooseStartingMana(
  registry: DataRegistry,
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
      chains: defaultChains(registry, mana, equipped.weapon?.baseId ?? null),
    },
  };
}

/**
 * Bind a second element: free, once, between dives. The basic chain's last
 * blow takes it, as the weapon's default chain on the pair has it.
 */
export function bindSecondary(profile: DelveProfile, mana: ManaType): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Bind a second element between dives');
  const { primary, secondary } = profile.pair;
  if (!primary) return refuse(profile, 'Choose your mana first');
  if (secondary) return refuse(profile, 'Your second element is already bound');
  if (mana === primary) return refuse(profile, 'That is already your primary');
  const basic = profile.chains.basic.map((b, i, all) =>
    i === all.length - 1 ? { ...b, element: mana } : b,
  );
  return {
    ok: true,
    profile: {
      ...profile,
      pair: { primary, secondary: mana },
      chains: { ...profile.chains, basic },
    },
  };
}

/**
 * Change a bound pair (either element, or swap them) for Mana Dust and scrap,
 * between dives. Gear stays as it is; the chains follow the new pair, each
 * replaced element's moves and blows taking its role's new element.
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
  const res = fixChainsToPair(
    {
      ...profile,
      pair: { primary, secondary },
      manaDust: profile.manaDust - cost.realignDust,
      scrap: profile.scrap - cost.realignScrap,
    },
    profile.pair,
  );
  return { ok: true, profile: res.profile, fixed: res.fixed };
}

/**
 * How near a bound secondary is to overtaking: its attunement (`have`) against
 * `overtakeMargin` × the primary's (`need`). `ready` once it is above both 0
 * and `need`. Nothing to overtake while unbound.
 */
export function overtakeProgress(
  registry: DataRegistry,
  profile: Pick<DelveProfile, 'equipped' | 'pair' | 'chains'>,
): { have: number; need: number; ready: boolean } {
  const { primary, secondary } = profile.pair;
  if (!primary || !secondary) return { have: 0, need: 0, ready: false };
  const att = profileStats(registry, profile).attunement;
  const have = att[secondary];
  const need = registry.getDelveBalance().pair.overtakeMargin * att[primary];
  return { have, need, ready: have > 0 && have > need };
}

/**
 * Between dives, a bound secondary with more attunement than the primary
 * (`overtakeProgress` ready) takes its place, and the old primary becomes the
 * secondary. Chains stay valid: the pair is the same two.
 */
export function resolveOvertake(
  registry: DataRegistry,
  profile: DelveProfile,
): { profile: DelveProfile; swapped: boolean } {
  const { primary, secondary } = profile.pair;
  if (!primary || !secondary || isDiveActive(profile)) return { profile, swapped: false };
  if (!overtakeProgress(registry, profile).ready) return { profile, swapped: false };
  return {
    profile: { ...profile, pair: { primary: secondary, secondary: primary } },
    swapped: true,
  };
}

/** The Mana Dust re-attuning `item` costs (by its rarity). */
export function reattuneCost(registry: DataRegistry, item: GearItem): number {
  return registry.getDelveBalance().pair.reattuneDust[item.rarity];
}

/** Re-attune an item to either element of the pair (not its own) for Mana Dust, between dives. */
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
  const cost = reattuneCost(registry, found.item);
  if (profile.manaDust < cost) return refuse(profile, 'Not enough Mana Dust');
  const item = attuneTo(found.item, mana);
  return {
    ok: true,
    item,
    profile: { ...replaceItem(profile, item), manaDust: profile.manaDust - cost },
  };
}
