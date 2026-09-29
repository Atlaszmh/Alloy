import type { DataRegistry } from '../data/registry.js';
import {
  basicLoadout,
  defaultChains,
  followBasic,
  isDefaultBasic,
  roleHeir,
} from '../arpg/abilities/resolve.js';
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
 * Fit every move and blow to the pair. After a pair op (`was`, the pair before
 * it) that replaced an element, every element takes its old role's new element
 * (`roleHeir`): the old primary's the new primary, the old secondary's the new
 * secondary (a Fire+Storm move stays fused as Fire+Nature, and Fire+Storm to
 * Storm+Nature makes Fire Storm and Storm Nature); any other element stays if
 * it's in the pair, else takes the primary. When nothing left the pair (a
 * swap, an overtake) or with no `was` (the migration), a move keeps its
 * in-pair elements, and a move left with none, like a blow outside the pair,
 * takes the primary. A move keeps its elements' order (the first is its body),
 * each once. Kinds, forms and payments stay. Returns the moves and blows whose
 * elements changed, one notice each, with the old elements each lost.
 */
export function fixChainsToPair(
  profile: DelveProfile,
  was?: ManaPair,
): { profile: DelveProfile; fixed: ChainFix[] } {
  const { primary, secondary } = profile.pair;
  if (!primary) return { profile, fixed: [] };
  const byRole = was ? roleHeir(was, { primary, secondary }) : null;
  const heir = (e: ManaType): ManaType | null =>
    byRole ? byRole(e) : inPair(profile, e) ? e : null;
  /** Each element's heir, each once; none left: the primary. */
  const fit = (els: ManaType[]): ManaType[] => {
    const out = [...new Set(els.map(heir).filter((e): e is ManaType => e !== null))];
    return out.length > 0 ? out : [primary];
  };
  const fixed: ChainFix[] = [];
  const basic = profile.chains.basic.map((blow, index) => {
    const [element] = fit([blow.element]);
    if (element === blow.element) return blow;
    const move = { ...blow, element };
    fixed.push({ skill: 'basic', index, removed: [blow.element], move });
    return move;
  });
  const chains = { ...profile.chains, basic };
  for (const slot of ABILITY_SLOTS) {
    const moves = chains[slot].moves.map((old, index) => {
      const elements = fit(old.elements);
      if (elements.join() === old.elements.join()) return old;
      const move = { ...old, elements };
      fixed.push({
        skill: slot,
        index,
        removed: old.elements.filter((e) => !elements.includes(e)),
        move,
      });
      return move;
    });
    chains[slot] = { ...chains[slot], moves };
  }
  return { profile: fixed.length > 0 ? { ...profile, chains } : profile, fixed };
}

/**
 * `next`, after an op on `was` that changed its weapon or pair, with the basic
 * chain following them (`followBasic`): one still on its default becomes the
 * new default, one the player built keeps its blows (mapped by role once an
 * element leaves the pair). Nothing changes before the choice.
 */
export function followBasicTo(
  registry: DataRegistry,
  was: DelveProfile,
  next: DelveProfile,
): DelveProfile {
  const before = basicLoadout(was);
  const after = basicLoadout(next);
  if (!before || !after) return next;
  const basic = followBasic(registry, was.chains.basic, before, after);
  return { ...next, chains: { ...next.chains, basic } };
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
 * Bind a second element: free, once, between dives. A basic chain still on
 * its default becomes the pair's default, its last blow the secondary; a chain
 * the player built keeps its blows.
 */
export function bindSecondary(
  registry: DataRegistry,
  profile: DelveProfile,
  mana: ManaType,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Bind a second element between dives');
  const { primary, secondary } = profile.pair;
  if (!primary) return refuse(profile, 'Choose your mana first');
  if (secondary) return refuse(profile, 'Your second element is already bound');
  if (mana === primary) return refuse(profile, 'That is already your primary');
  const next = { ...profile, pair: { primary, secondary: mana } };
  return { ok: true, profile: followBasicTo(registry, profile, next) };
}

/**
 * Change a bound pair (either element, or swap them) for Mana Dust and scrap,
 * between dives. Gear stays as it is; the chains follow the new pair
 * (`fixChainsToPair`): once an element is replaced, every move and blow takes
 * its elements' roles' new elements, a notice each. A basic chain still on its
 * default becomes the new pair's default instead, with no notice.
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
  if (!isDefaultBasic(registry, profile.chains.basic, basicLoadout(profile)!))
    return { ok: true, profile: res.profile, fixed: res.fixed };
  return {
    ok: true,
    profile: followBasicTo(registry, profile, res.profile),
    fixed: res.fixed.filter((f) => f.skill !== 'basic'),
  };
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
 * secondary. Chains stay valid: the pair is the same two. A basic chain still
 * on its default becomes the default on the swapped pair; a built one stays.
 */
export function resolveOvertake(
  registry: DataRegistry,
  profile: DelveProfile,
): { profile: DelveProfile; swapped: boolean } {
  const { primary, secondary } = profile.pair;
  if (!primary || !secondary || isDiveActive(profile)) return { profile, swapped: false };
  if (!overtakeProgress(registry, profile).ready) return { profile, swapped: false };
  const next = { ...profile, pair: { primary: secondary, secondary: primary } };
  return { profile: followBasicTo(registry, profile, next), swapped: true };
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
