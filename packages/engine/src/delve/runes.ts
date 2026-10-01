import type { DataRegistry } from '../data/registry.js';
import { carriedByText, movesetOf } from '../loot/moveset.js';
import {
  addToPouch,
  runeFits,
  socketCap,
  socketPrice,
  socketsOf,
  takeFromPouch,
} from '../loot/runes.js';
import {
  CHAIN_SKILLS,
  type Blow,
  type Chains,
  type ChainSkill,
  type Move,
} from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem } from '../types/gear.js';
import {
  RUNE_TIERS,
  type ChainOrigins,
  type RunePouch,
  type RuneRef,
  type RuneTarget,
  type RuneTier,
  type UnsocketMode,
} from '../types/rune.js';
import { isDiveActive } from './dive.js';
import { chainOrigins, editPrice, movesOf, setChains, withMove } from './moveset.js';
import type { ProfileActionResult } from './profile.js';

/**
 * Runes on the hero's moves (see the runes spec): the pull rule, the parts
 * rule, the draft's rune price, opening sockets, socketing, and fusing.
 * moveset.ts, profile.ts and pair.ts import this module back: keep to
 * function declarations.
 */

export interface SetChainsOptions {
  origins?: ChainOrigins;
  unsocket?: UnsocketMode;
}

export interface RuneChange {
  /** Sockets opened. */
  links: number;
  /** Sockets opened, and pulls in 'pay'. */
  scrap: number;
  /** Sockets of removed moves (netted against `links`). */
  refundLinks: number;
  /** Out of the pouch. */
  socketed: RuneRef[];
  /** Destroyed ('destroy') or back to the pouch ('pay'). */
  pulled: RuneRef[];
  /** The pouch once Apply has taken what is socketed (and, in 'pay', given back what is pulled). */
  pouch: RunePouch;
}

export interface DraftPrice {
  dust: number;
  links: number;
  scrap: number;
  refundLinks: number;
  destroys: RuneRef[];
  returns: RuneRef[];
  /** The pouch Apply leaves (`RuneChange.pouch`). */
  pouch: RunePouch;
}

/** What a pull does: `override` (the client's dev toggle) or the balance's `runes.unsocket`. */
export function unsocketMode(registry: DataRegistry, override?: UnsocketMode | null): UnsocketMode {
  return override ?? registry.getDelveBalance().runes.unsocket;
}

/**
 * The parts rule for `runes` leaving a weapon other than through Apply (a
 * salvage, a fuse, a transfer, the choice of mana): in 'pay' they go back to
 * `pouch` free, in 'destroy' they are destroyed. The sockets' Links are the
 * caller's (one each, in both modes).
 */
export function settleParts(
  registry: DataRegistry,
  pouch: RunePouch,
  runes: readonly RuneRef[],
  unsocket?: UnsocketMode | null,
): { pouch: RunePouch; runes: RuneRef[]; destroyed: RuneRef[] } {
  const list = runes.map((r) => ({ ...r }));
  if (unsocketMode(registry, unsocket) === 'pay')
    return { pouch: addToPouch(pouch, list), runes: list, destroyed: [] };
  return { pouch, runes: [], destroyed: list };
}

const UNARMED_TEXT = 'Equip a weapon to build your moves';

/** What a rune on `m` sits on: an ability move's form, or a blow of the `baseId` weapon. */
export function runeTargetOf(baseId: string | null, m: Move | Blow): RuneTarget {
  return 'form' in m ? { form: m.form } : { weapon: baseId, kind: m.kind };
}

/** Whether two sockets hold the same: both empty, or one rune at one tier. */
function sameRune(a: RuneRef | null, b: RuneRef | null): boolean {
  return a?.id === b?.id && a?.tier === b?.tier;
}

/** What a rune doesn't fit, in a refusal: "a Bolt", "an Armor", "Bow blows". */
function fitName(registry: DataRegistry, baseId: string | null, m: Move | Blow): string {
  if (!('form' in m)) return `${baseId ? registry.getGearBase(baseId).name : 'Unarmed'} blows`;
  const name = registry.getForm(m.form).name;
  return `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
}

/**
 * Why `m`'s sockets can't be on `weapon`, or null: more than its rarity's cap,
 * an unknown rune (or tier), the same rune twice at any tier, or a rune that
 * doesn't fit the move's form or the weapon's blows.
 */
function socketRefusal(registry: DataRegistry, weapon: GearItem, m: Move | Blow): string | null {
  const sockets = socketsOf(m);
  const cap = socketCap(registry, weapon.rarity);
  if (sockets.length > cap)
    return `This weapon's moves hold at most ${cap} socket${cap === 1 ? '' : 's'}`;
  const seen = new Set<string>();
  for (const r of sockets) {
    if (!r) continue;
    const def = registry.findRune(r.id);
    if (!def || !Number.isInteger(r.tier) || r.tier < 1 || r.tier > RUNE_TIERS)
      return `Unknown rune ${r.id}`;
    if (seen.has(r.id)) return `A move takes one ${def.name}`;
    seen.add(r.id);
    if (!runeFits(def, runeTargetOf(weapon.baseId, m)))
      return `${def.name} doesn't fit ${fitName(registry, weapon.baseId, m)}`;
  }
  return null;
}

/**
 * What the draft `chains` does to the equipped weapon's sockets (see the runes
 * spec), each new move against the saved move it came from (`opts.origins`;
 * missing, the identity map): sockets past the saved move's are opened, each
 * priced by its index (`socketPrice`); at each socket both have, a different
 * rune is a pull and a socket; a saved move no new move came from gives its
 * sockets back (`refundLinks`, netted against `links`) and its runes are
 * pulled; a new move opens all of its. A pull costs `pullScrap` in 'pay'
 * (`opts.unsocket`, else the balance's). Refuses unarmed, bad origins, a
 * socket refusal (`socketRefusal`), fewer sockets on a kept move, and a pouch
 * that can't hold what is socketed (in 'pay', what is pulled goes back first).
 * Chains `chains` doesn't hold, and their origins, are left out.
 */
export function runeChange(
  registry: DataRegistry,
  profile: DelveProfile,
  chains: Partial<Chains>,
  opts: SetChainsOptions = {},
): RuneChange | { refused: string } {
  const weapon = profile.equipped.weapon;
  if (!weapon) return { refused: UNARMED_TEXT };
  const { pullScrap } = registry.getDelveBalance().runes;
  const pay = unsocketMode(registry, opts.unsocket) === 'pay';
  const saved = movesetOf(registry, weapon).chains;
  const change: Omit<RuneChange, 'pouch'> = {
    links: 0,
    scrap: 0,
    refundLinks: 0,
    socketed: [],
    pulled: [],
  };
  const add = (into: RuneRef[], r: RuneRef | null) => {
    if (r) into.push({ id: r.id, tier: r.tier });
  };
  for (const skill of CHAIN_SKILLS) {
    const chain = chains[skill];
    if (!chain) continue;
    const was = movesOf(saved[skill]);
    const now = movesOf(chain);
    const origins = chainOrigins(was.length, now.length, opts.origins?.[skill]);
    if (!origins) return { refused: 'Bad origins' };
    for (const [j, m] of now.entries()) {
      const why = socketRefusal(registry, weapon, m);
      if (why) return { refused: why };
      const o = origins[j];
      const old = o === null ? [] : socketsOf(was[o]);
      const next = socketsOf(m);
      if (next.length < old.length) return { refused: "Sockets can't be closed" };
      next.forEach((r, i) => {
        if (i >= old.length) {
          const price = socketPrice(registry, i)!;
          change.links += price.links;
          change.scrap += price.scrap;
          add(change.socketed, r);
        } else if (!sameRune(old[i], r)) {
          add(change.pulled, old[i]);
          add(change.socketed, r);
        }
      });
    }
    const from = new Set(origins);
    was.forEach((m, i) => {
      if (from.has(i)) return;
      change.refundLinks += socketsOf(m).length;
      for (const r of socketsOf(m)) add(change.pulled, r);
    });
  }
  if (pay) for (const r of change.pulled) change.scrap += pullScrap[r.tier - 1];
  const back = pay ? addToPouch(profile.runes, change.pulled) : profile.runes;
  const pouch = takeFromPouch(back, change.socketed);
  if (!pouch) return { refused: 'Not enough runes in your pouch' };
  return { ...change, pouch };
}

/**
 * The draft's one total, as Apply would charge it (see the runes spec): the
 * Mana Dust (`editPrice`, by the origins), the Links and scrap the sockets and
 * pulls cost (`runeChange`), the Links removed moves give back, the runes a
 * pull destroys ('destroy') or returns ('pay'), and the pouch it leaves; or `runeChange`'s refusal
 * (unarmed, bad origins, a socket refusal, closed sockets, a short pouch). It
 * doesn't check the chains themselves (`setChains`' refusals) or whether the
 * hero can afford the total.
 */
export function draftPrice(
  registry: DataRegistry,
  profile: DelveProfile,
  chains: Partial<Chains>,
  opts: SetChainsOptions = {},
): DraftPrice | { refused: string } {
  const change = runeChange(registry, profile, chains, opts);
  if ('refused' in change) return change;
  const pay = unsocketMode(registry, opts.unsocket) === 'pay';
  return {
    dust: editPrice(registry, profile, chains, opts.origins),
    links: change.links,
    scrap: change.scrap,
    refundLinks: change.refundLinks,
    destroys: pay ? [] : change.pulled,
    returns: pay ? change.pulled : [],
    pouch: change.pouch,
  };
}

const BETWEEN_DIVES = 'Chains can only change between dives';
const FORGE_LOCKED = 'Forge at the Anvil, between dives';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/** The equipped weapon's `skill` chain and its move `index`, or why an op can't reach them. */
function moveAt(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: ChainSkill,
  index: number,
): { chain: Chains[ChainSkill]; move: Move | Blow } | string {
  if (isDiveActive(profile)) return BETWEEN_DIVES;
  const weapon = profile.equipped.weapon;
  if (!weapon) return UNARMED_TEXT;
  const chain = movesetOf(registry, weapon).chains[skill];
  if (!chain) return carriedByText(registry, skill);
  const move = Number.isInteger(index) ? movesOf(chain)[index] : undefined;
  if (!move) return 'Pick a move the chain holds';
  return { chain, move };
}

/**
 * Open the next socket on the equipped weapon's move `index` of `skill`: one
 * `setChains` in place, so it costs `socketLinks[n]` Links and
 * `socketScrap[n]` scrap by the `n` sockets the move has. Refuses mid-dive,
 * unarmed, a skill the weapon doesn't carry, a move the chain doesn't hold, at
 * the weapon rarity's cap, and when it can't be paid.
 */
export function openSocket(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: ChainSkill,
  index: number,
): ProfileActionResult {
  const at = moveAt(registry, profile, skill, index);
  if (typeof at === 'string') return refuse(profile, at);
  const sockets = socketsOf(at.move);
  if (sockets.length >= socketCap(registry, profile.equipped.weapon!.rarity))
    return refuse(profile, 'This move has every socket');
  const move = { ...at.move, runes: [...sockets, null] };
  return setChains(registry, profile, { [skill]: withMove(at.chain, index, move) });
}

/**
 * Socket `rune`, from the pouch, into open socket `socket` of the equipped
 * weapon's move `index` of `skill`: one `setChains` in place, so a rune
 * already there is pulled (`opts.unsocket`, else the balance's). Refuses
 * mid-dive, unarmed, a socket not yet open, and whatever `setChains` refuses
 * (a rune that doesn't fit the move, one already on it, one the pouch lacks).
 */
export function socketRune(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: ChainSkill,
  index: number,
  socket: number,
  rune: RuneRef,
  opts: SetChainsOptions = {},
): ProfileActionResult {
  const at = moveAt(registry, profile, skill, index);
  if (typeof at === 'string') return refuse(profile, at);
  const sockets = socketsOf(at.move);
  if (!Number.isInteger(socket) || socket < 0 || socket >= sockets.length)
    return refuse(profile, 'Open this socket first');
  if (!rune || typeof rune !== 'object') return refuse(profile, 'Pick a rune');
  const runes = sockets.map((r, i) => (i === socket ? { id: rune.id, tier: rune.tier } : r));
  const edit = { [skill]: withMove(at.chain, index, { ...at.move, runes }) };
  return setChains(registry, profile, edit, { unsocket: opts.unsocket });
}

/** The scrap fusing `fuseCount` of `ref` into one of the next tier costs (`fuseScrap`), or null at tier V. */
export function fusePrice(registry: DataRegistry, ref: RuneRef): number | null {
  if (ref.tier >= RUNE_TIERS) return null;
  return registry.getDelveBalance().runes.fuseScrap[ref.tier - 1];
}

/**
 * Fuse `fuseCount` (3) of `ref` from the pouch into one of the next tier, for
 * scrap (`fusePrice`); nothing is rolled. Refuses mid-dive (with the forge),
 * an unknown rune, tier V, and a pouch or scrap short of it.
 */
export function fuseRunes(
  registry: DataRegistry,
  profile: DelveProfile,
  ref: RuneRef,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
  if (!registry.findRune(ref.id) || !Number.isInteger(ref.tier) || ref.tier < 1)
    return refuse(profile, `Unknown rune ${ref.id}`);
  const price = fusePrice(registry, ref);
  if (price === null) return refuse(profile, "Tier V runes don't fuse");
  const { fuseCount } = registry.getDelveBalance().runes;
  const pouch = takeFromPouch(profile.runes, Array<RuneRef>(fuseCount).fill(ref));
  if (!pouch) return refuse(profile, `Fuse ${fuseCount} of one rune and tier`);
  if (profile.scrap < price) return refuse(profile, 'Not enough scrap');
  const made: RuneRef = { id: ref.id, tier: (ref.tier + 1) as RuneTier };
  return {
    ok: true,
    runes: [made],
    profile: { ...profile, scrap: profile.scrap - price, runes: addToPouch(pouch, [made]) },
  };
}
