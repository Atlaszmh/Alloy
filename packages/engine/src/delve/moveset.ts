import type { DataRegistry } from '../data/registry.js';
import {
  carriedByText,
  defaultKind,
  defaultMoveset,
  movesetOf,
  movesetTransfer,
} from '../loot/moveset.js';
import {
  ABILITY_PAYMENTS,
  CHAIN_SKILLS,
  MOVE_KINDS,
  type Blow,
  type Chain,
  type Chains,
  type ChainSkill,
  type Move,
} from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem, Moveset } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import type { ChainOrigins } from '../types/rune.js';
import { isDiveActive } from './dive.js';
import { inPair } from './pair.js';
import { withMoveset, type ProfileActionResult } from './profile.js';
import { applyQuestEvents } from './quests.js';
import { applyTutorialEvents } from './tutorial.js';
import { runeChange, settleParts, type SetChainsOptions } from './runes.js';
import { socketsOf, takeFromPouch } from '../loot/runes.js';

/**
 * Editing a weapon's moveset (see the weapon movesets spec): its chains'
 * moves, priced in Mana Dust, and its slots, priced in Links and scrap.
 * profile.ts and pair.ts import this module back: keep to function declarations.
 */

const BETWEEN_DIVES = 'Chains can only change between dives';
const UNARMED_TEXT = 'Equip a weapon to build your moves';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/** A chain's moves or blows. */
export function movesOf(chain: Chains[ChainSkill] | undefined): (Move | Blow)[] {
  if (!chain) return [];
  return Array.isArray(chain) ? chain : chain.moves;
}

/** A move's elements: its one or two, a blow's one. */
function elementsOf(m: Move | Blow): ManaType[] {
  return 'element' in m ? [m.element] : m.elements;
}

/** A move as it is: its kind, its form and its elements (a blow: its kind and element). */
export function moveKey(m: Move | Blow): string {
  return 'element' in m ? `${m.kind}|${m.element}` : `${m.kind}|${m.form}|${m.elements.join('+')}`;
}

/** Whether two moves hold the same sockets: each empty in both, or the same rune at the same tier. */
function sameSockets(a: Move | Blow, b: Move | Blow): boolean {
  const [x, y] = [socketsOf(a), socketsOf(b)];
  return x.length === y.length && x.every((r, i) => r?.id === y[i]?.id && r?.tier === y[i]?.tier);
}

/**
 * Whether two chains hold the same moves in order (by `moveKey`), with the
 * same sockets (see the runes spec), and the same payment.
 */
export function sameChain(
  a: Chains[ChainSkill] | undefined,
  b: Chains[ChainSkill] | undefined,
): boolean {
  if (!a || !b) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const [x, y] = [movesOf(a), movesOf(b)];
  if (!Array.isArray(a) && (a as Chain).payment !== (b as Chain).payment) return false;
  return (
    x.length === y.length && x.every((m, i) => moveKey(m) === moveKey(y[i]) && sameSockets(m, y[i]))
  );
}

/** `chain` with move `index` replaced by `move` (its payment kept). */
export function withMove(
  chain: Chains[ChainSkill],
  index: number,
  move: Move | Blow,
): Chains[ChainSkill] {
  if (Array.isArray(chain)) return chain.map((b, i) => (i === index ? (move as Blow) : b));
  return { ...chain, moves: chain.moves.map((m, i) => (i === index ? (move as Move) : m)) };
}

/** An element set as the off-pair rule counts it: sorted, so a fusion's order doesn't matter. */
function elementSet(els: readonly ManaType[]): string {
  return [...els].sort().join('+');
}

/**
 * Whether a move holding `own` may take the elements `next` (the builder's
 * chips): all in `allowed` (the pair), or its own set kept. An off-pair set is
 * kept, never taken: `setChains` refuses a chain holding more of one than before.
 */
export function takesElements(
  allowed: readonly ManaType[],
  own: readonly ManaType[],
  next: readonly ManaType[],
): boolean {
  return next.every((e) => allowed.includes(e)) || elementSet(next) === elementSet(own);
}

/** Legendary powers that ride one skill: Nightstalker's (combat.ts), Rimeheart's (resolve.ts). */
const LEGENDARY_NEEDS = new Map<string, ChainSkill>([
  ['nightstalker', 'defensive'],
  ['rimeheart', 'ultimate'],
]);

/** The skill legendary `id`'s power needs (on a weapon without it, it does nothing), or null. */
export function legendaryNeeds(id: string): ChainSkill | null {
  return LEGENDARY_NEEDS.get(id) ?? null;
}

/**
 * A new chain's origins (see the runes spec): for each of its `moves` moves,
 * the index in the saved chain (`saved` moves) it came from, or null for a new
 * move. `given` is checked: one per move, each a saved index at most once;
 * null when it isn't. Without it, the identity map: move j came from saved
 * move j, if any.
 */
export function chainOrigins(
  saved: number,
  moves: number,
  given?: readonly (number | null)[],
): (number | null)[] | null {
  if (!given) return Array.from({ length: moves }, (_, j) => (j < saved ? j : null));
  if (given.length !== moves) return null;
  const seen = new Set<number>();
  for (const o of given) {
    if (o === null) continue;
    if (!Number.isInteger(o) || o < 0 || o >= saved || seen.has(o)) return null;
    seen.add(o);
  }
  return [...given];
}

/** The length of the longest strictly increasing run in `xs`, in order (at most 5 values). */
function longestRise(xs: readonly number[]): number {
  const best = xs.map(() => 1);
  for (let j = 0; j < xs.length; j++)
    for (let i = 0; i < j; i++) if (xs[i] < xs[j]) best[j] = Math.max(best[j], best[i] + 1);
  return Math.max(0, ...best);
}

/** A move's elements as the price matches them ("fire+storm"). */
function els(m: Move | Blow): string {
  return elementsOf(m).join('+');
}

/** The Mana Dust one chain's edit costs (see `movesetEditPrice`). */
function chainEditPrice(
  registry: DataRegistry,
  old: Chains[ChainSkill] | undefined,
  next: Chains[ChainSkill],
  given?: readonly (number | null)[],
): number {
  const { editDust, elementDust } = registry.getDelveBalance().movesets;
  const was = movesOf(old);
  const now = movesOf(next);
  const origins =
    chainOrigins(was.length, now.length, given) ?? chainOrigins(was.length, now.length)!;
  const kept = origins.filter((o): o is number => o !== null);
  // 1. The moves whose origins rise in order are in place, free; every other one moved.
  let price = (kept.length - longestRise(kept)) * editDust;
  // 2. Each origin pair's changes; 3. each new move, and each saved move none came from.
  const known = new Set(was.map(els));
  const charged = new Set<string>();
  const shape = (x: Move | Blow) => ('form' in x ? `${x.kind}|${x.form}` : x.kind);
  now.forEach((m, j) => {
    const o = origins[j];
    const set = els(m);
    if (o === null) {
      price += editDust;
      if (known.has(set) || charged.has(set)) return;
    } else {
      if (shape(was[o]) !== shape(m)) price += editDust;
      if (set === els(was[o]) || charged.has(set)) return;
    }
    // A new element set: charged once per Apply, however many moves take it.
    charged.add(set);
    price += elementDust;
  });
  price += (was.length - kept.length) * editDust;
  // 4. A changed payment.
  if (old && !Array.isArray(old) && !Array.isArray(next) && old.payment !== next.payment)
    price += editDust;
  return price;
}

/**
 * The Mana Dust turning `old` into `next` costs, over every chain `next`
 * holds (see the runes spec, which retires 4a's matching by what moves are):
 * each new move is priced against the saved move it came from (`origins`;
 * missing, the identity map). The moves whose origins rise in order are in
 * place, free; every other one moved, `editDust`. A pair whose kind or form
 * changed costs `editDust`, whose elements changed `elementDust`; a new move
 * `editDust`, and a saved move none came from `editDust`; an element set is
 * charged `elementDust` once per Apply however many moves take it (a new
 * move's only when no saved move has it); a changed payment costs `editDust`.
 * Runes are no part of it (`moveKey` ignores them). Origins for a chain
 * `next` doesn't hold are ignored, and bad origins price as the identity map
 * (`setChains` refuses them first). The caller applies the first-dive freebie.
 */
export function movesetEditPrice(
  registry: DataRegistry,
  old: Partial<Chains>,
  next: Partial<Chains>,
  origins?: ChainOrigins,
): number {
  return CHAIN_SKILLS.reduce((sum, skill) => {
    const chain = next[skill];
    return chain ? sum + chainEditPrice(registry, old[skill], chain, origins?.[skill]) : sum;
  }, 0);
}

/** What an edit costs `profile`: its price (by `origins`), but nothing before the hero's first dive. */
export function editPrice(
  registry: DataRegistry,
  profile: DelveProfile,
  next: Partial<Chains>,
  origins?: ChainOrigins,
): number {
  const weapon = profile.equipped.weapon;
  if (!weapon || profile.stats.dives === 0) return 0;
  return movesetEditPrice(registry, movesetOf(registry, weapon).chains, next, origins);
}

/** How many moves of `chain` hold each element set outside the pair ("fire+nature"). */
function offPairSets(profile: DelveProfile, chain: Chains[ChainSkill] | undefined) {
  const counts = new Map<string, number>();
  for (const m of movesOf(chain)) {
    const els = elementsOf(m);
    if (els.every((e) => inPair(profile, e))) continue;
    const key = elementSet(els);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Why `chain` can't be the weapon's `skill` chain, or null when it can. */
function chainRefusal(
  registry: DataRegistry,
  profile: DelveProfile,
  moveset: Moveset,
  skill: ChainSkill,
  chain: Chains[ChainSkill],
): string | null {
  const slots = moveset.slots[skill];
  if (slots === undefined) return carriedByText(registry, skill);
  if (Array.isArray(chain) !== (skill === 'basic')) return `Not a ${skill} chain`;
  const moves = movesOf(chain);
  if (moves.length < 1 || moves.length > slots) return `A chain holds 1 to ${slots} moves`;
  for (const m of moves) if (!MOVE_KINDS.includes(m.kind)) return `Bad kind ${m.kind}`;
  for (const m of moves) {
    const els = elementsOf(m);
    if (els.length < 1 || els.length > 2 || new Set(els).size !== els.length)
      return 'Pick one or two different elements';
    if (!els.every((e) => e in registry.getArpgData().mana)) return 'Unknown element';
    if ('form' in m) {
      if (!registry.getArpgData().forms.some((f) => f.id === m.form))
        return `Unknown form ${m.form}`;
      const form = registry.getForm(m.form);
      if (form.slot !== skill) return `${form.name} is not a ${skill} form`;
    }
  }
  if (!Array.isArray(chain) && !ABILITY_PAYMENTS.includes(chain.payment))
    return `Bad payment ${chain.payment}`;
  // An off-pair element set may be kept, moved or removed, never added or copied.
  const before = offPairSets(profile, moveset.chains[skill]);
  for (const [key, n] of offPairSets(profile, chain))
    if (n > (before.get(key) ?? 0)) return 'Pick from your two elements';
  return null;
}

/** A chain copied, its sockets too, so the save never shares arrays with the caller. */
function copyChain(chain: Chains[ChainSkill]): Chains[ChainSkill] {
  const copy = <M extends Move | Blow>(m: M): M =>
    m.runes ? { ...m, runes: m.runes.map((r) => r && { ...r }) } : { ...m };
  if (Array.isArray(chain)) return chain.map(copy);
  const moves = chain.moves.map((m) => ({ ...copy(m), elements: [...m.elements] }));
  return { moves, payment: chain.payment };
}

/**
 * Set several of the equipped weapon's chains at once: all or nothing (see
 * the runes spec). Mana Dust by origin (`editPrice`, by `opts.origins`), and
 * the sockets' Links and scrap and the runes in and out (`runeChange`; a pull
 * by `opts.unsocket`): the hero's Links become `links − change.links +
 * change.refundLinks`, the netted amount, whatever order the edits were made
 * in (never dearer than the same edits one by one). Refuses mid-dive, unarmed,
 * when any chain is refused (a skill the weapon doesn't carry; fewer than one
 * move or more than its slots; an unknown kind, a form from another slot,
 * anything but one or two different known elements, an unknown payment; an
 * element set outside the pair held more times than before; or bad origins),
 * when the runes are refused (`runeChange`), and when the Dust, the net Links
 * or the scrap can't be paid. Its result lists the runes pulled back to the
 * pouch (`runes`) and those destroyed (`destroyed`).
 */
export function setChains(
  registry: DataRegistry,
  profile: DelveProfile,
  chains: Partial<Chains>,
  opts: SetChainsOptions = {},
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, BETWEEN_DIVES);
  const weapon = profile.equipped.weapon;
  if (!weapon) return refuse(profile, UNARMED_TEXT);
  const moveset = movesetOf(registry, weapon);
  const next = { ...moveset.chains };
  for (const skill of CHAIN_SKILLS) {
    const chain = chains[skill];
    if (!chain) continue;
    const reason = chainRefusal(registry, profile, moveset, skill, chain);
    if (reason) return refuse(profile, reason);
    const saved = movesOf(moveset.chains[skill]).length;
    if (!chainOrigins(saved, movesOf(chain).length, opts.origins?.[skill]))
      return refuse(profile, 'Bad origins');
    (next as Record<ChainSkill, unknown>)[skill] = copyChain(chain);
  }
  const change = runeChange(registry, profile, chains, opts);
  if ('refused' in change) return refuse(profile, change.refused);
  const price = editPrice(registry, profile, chains, opts.origins);
  if (profile.manaDust < price) return refuse(profile, 'Not enough Mana Dust');
  if (profile.links < change.links - change.refundLinks) return refuse(profile, 'Not enough Links');
  if (profile.scrap < change.scrap) return refuse(profile, 'Not enough scrap');
  const settled = settleParts(registry, profile.runes, change.pulled, opts.unsocket);
  const runes = takeFromPouch(settled.pouch, change.socketed);
  if (!runes) return refuse(profile, 'Not enough runes in your pouch');
  const edited = withMoveset(profile, { ...moveset, chains: next });
  const paid: DelveProfile = {
    ...edited,
    manaDust: profile.manaDust - price,
    links: profile.links - change.links + change.refundLinks,
    scrap: profile.scrap - change.scrap,
    runes,
  };
  // Each socket the Apply opens is a quest event (see the quests spec).
  const opened = Array.from({ length: change.opened }, () => ({ type: 'openSocket' }) as const);
  const applied = applyQuestEvents(registry, paid, opened);
  return {
    ok: true,
    runes: settled.runes,
    destroyed: settled.destroyed,
    profile: applyTutorialEvents(registry, applied, [...opened, { type: 'setChains' }]),
  };
}

/** Set one of the equipped weapon's chains (`setChains` with one). */
export function setChain<S extends ChainSkill>(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: S,
  chain: Chains[S],
): ProfileActionResult {
  return setChains(registry, profile, { [skill]: chain });
}

/**
 * The next slot of `weapon`'s `skill` chain: its Links and scrap by the new
 * slot's position (`slotLinks`, `slotScrap`: the 2nd slot's first), or null
 * when the weapon doesn't carry the skill or the chain has every slot.
 */
export function slotPrice(
  registry: DataRegistry,
  weapon: GearItem,
  skill: ChainSkill,
): { links: number; scrap: number } | null {
  const bal = registry.getDelveBalance();
  const slots = movesetOf(registry, weapon).slots[skill];
  if (slots === undefined || slots >= bal.chains.cap[skill]) return null;
  return { links: bal.movesets.slotLinks[slots - 1], scrap: bal.movesets.slotScrap[slots - 1] };
}

/**
 * Add a slot to the equipped weapon's `skill` chain, for Links and scrap
 * (`slotPrice`), and a move at the chain's end: the default kind at its
 * position (the last move's form's default chain, or for the basic chain the
 * weapon's, medium past its end), the last move's form, and the last move's
 * elements while they're all in the pair, else the pair's primary. A slot the
 * chain isn't using stays free. Refuses mid-dive, unarmed, for a skill the
 * weapon doesn't carry, at the cap, and when it can't be paid for.
 */
export function addSlot(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: ChainSkill,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, BETWEEN_DIVES);
  const weapon = profile.equipped.weapon;
  if (!weapon) return refuse(profile, UNARMED_TEXT);
  const moveset = movesetOf(registry, weapon);
  if (moveset.slots[skill] === undefined) return refuse(profile, carriedByText(registry, skill));
  const price = slotPrice(registry, weapon, skill);
  if (!price) return refuse(profile, 'This chain has every slot');
  if (profile.links < price.links) return refuse(profile, 'Not enough Links');
  if (profile.scrap < price.scrap) return refuse(profile, 'Not enough scrap');
  const chain = moveset.chains[skill]!;
  const moves = movesOf(chain);
  const last = moves[moves.length - 1];
  const primary = profile.pair.primary;
  const kept = elementsOf(last).every((e) => inPair(profile, e));
  const elements = kept || !primary ? elementsOf(last) : [primary];
  let next: Chains[ChainSkill];
  if (Array.isArray(chain)) {
    const kind = defaultKind(registry, 'basic', weapon.baseId, moves.length);
    next = [...chain, { kind, element: elements[0] }];
  } else {
    const form = (last as Move).form;
    const kind = registry.getForm(form).defaultChain[moves.length] ?? 'medium';
    next = { ...chain, moves: [...chain.moves, { kind, form, elements: [...elements] }] };
  }
  const slots = { ...moveset.slots, [skill]: moveset.slots[skill]! + 1 };
  const edited = withMoveset(profile, { chains: { ...moveset.chains, [skill]: next }, slots });
  const paid = {
    ...edited,
    links: profile.links - price.links,
    scrap: profile.scrap - price.scrap,
  };
  return {
    ok: true,
    item: edited.equipped.weapon,
    // The guided start's Skills step reads the chain (as `setChains`'s Apply does).
    profile: applyTutorialEvents(registry, paid, [{ type: 'setChains' }]),
  };
}

/**
 * Move the equipped weapon's moveset onto weapon `uid` in the bag and equip
 * it, for scrap (`movesetTransfer`: its extra slots and open sockets); its
 * Links come back, and the runes that leave go by the parts rule
 * (`opts.unsocket`, else the balance's). The old weapon goes to the bag at its
 * base slots, its moves the defaults in its own mana. Refuses mid-dive,
 * unarmed, for anything but a bag weapon, and when it can't be paid for.
 */
export function transferMoveset(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Transfer your moveset between dives');
  const source = profile.equipped.weapon;
  if (!source) return refuse(profile, UNARMED_TEXT);
  const target = profile.bag.find((i) => i.uid === uid && i.slot === 'weapon');
  if (!target) return refuse(profile, 'Transfer onto a weapon in your bag');
  const t = movesetTransfer(registry, source, target);
  if (profile.scrap < t.scrap) return refuse(profile, 'Not enough scrap');
  const item = { ...target, moveset: t.moveset };
  const old = { ...source, moveset: defaultMoveset(registry, source, source.mana) };
  const settled = settleParts(registry, profile.runes, t.runes, opts.unsocket);
  const moved: DelveProfile = {
    ...profile,
    equipped: { ...profile.equipped, weapon: item },
    bag: [...profile.bag.filter((i) => i.uid !== uid), old],
    scrap: profile.scrap - t.scrap,
    links: profile.links + t.links,
    runes: settled.pouch,
  };
  return {
    ok: true,
    item,
    links: t.links,
    runes: settled.runes,
    destroyed: settled.destroyed,
    profile: applyTutorialEvents(registry, moved, [{ type: 'transfer' }]),
  };
}
