import type { DataRegistry } from '../data/registry.js';
import {
  ceilingOf,
  defaultKind,
  formAllowed,
  movesetOf,
  plainConstruct,
  weaponClass,
} from '../loot/moveset.js';
import {
  ABILITY_PAYMENTS,
  CHAIN_SKILLS,
  MOVE_KINDS,
  type Blow,
  type Chain,
  type Chains,
  type ChainSkill,
  type Construct,
  type Move,
} from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem, Moveset } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { isDiveActive } from './dive.js';
import { inPair } from './pair.js';
import { mintUid, withMoveset, type ProfileActionResult } from './profile.js';
import { applyQuestEvents } from './quests.js';
import { applyTutorialEvents } from './tutorial.js';
import { runeChange, settleParts, type SetChainsOptions } from './runes.js';
import { socketsOf, takeFromPouch } from '../loot/runes.js';

/**
 * Editing a weapon's moveset (see the constructs spec §3.3): its chains'
 * constructs, priced in Mana Dust by uid, and its slots, priced in Links and
 * scrap. profile.ts and pair.ts import this module back: keep to function
 * declarations.
 */

const BETWEEN_DIVES = 'Chains can only change between dives';
const UNARMED_TEXT = 'Equip a weapon to build your moves';
/** A skill with no slot on this weapon (`slots[skill]` absent or 0). */
export const OPEN_SKILL_TEXT = 'Open this skill on the Temper bench';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/** A chain's moves or blows. */
export function movesOf(chain: Chains[ChainSkill] | undefined): Construct[] {
  if (!chain) return [];
  return Array.isArray(chain) ? chain : chain.moves;
}

/** A move's elements: its one or two, a blow's one. */
function elementsOf(m: Construct): ManaType[] {
  return 'element' in m ? [m.element] : m.elements;
}

/** A move as it is: its kind, its form and its elements (a blow: its kind and element). */
export function moveKey(m: Construct): string {
  return 'element' in m ? `${m.kind}|${m.element}` : `${m.kind}|${m.form}|${m.elements.join('+')}`;
}

/** Whether two moves hold the same sockets: each empty in both, or the same rune at the same tier. */
function sameSockets(a: Construct, b: Construct): boolean {
  const [x, y] = [socketsOf(a), socketsOf(b)];
  return x.length === y.length && x.every((r, i) => r?.id === y[i]?.id && r?.tier === y[i]?.tier);
}

/** Whether two constructs are the same one: by uid when both have one, else by `moveKey`. */
function sameConstruct(a: Construct, b: Construct): boolean {
  if (a.uid && b.uid) return a.uid === b.uid && moveKey(a) === moveKey(b);
  return moveKey(a) === moveKey(b);
}

/**
 * Whether two chains hold the same constructs in order (by uid where both
 * have one, else by `moveKey`), with the same sockets (see the runes spec),
 * and the same payment: a reorder reads as a change, an unchanged chain as none.
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
    x.length === y.length && x.every((m, i) => sameConstruct(m, y[i]) && sameSockets(m, y[i]))
  );
}

/** `chain` with move `index` replaced by `move` (its payment kept). */
export function withMove(
  chain: Chains[ChainSkill],
  index: number,
  move: Construct,
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

/** A move's elements as the price matches them ("fire+storm"). */
function els(m: Construct): string {
  return elementsOf(m).join('+');
}

/** A construct's kind and form (a blow's kind): what a changed one pays `editDust` for. */
function shape(x: Construct): string {
  return 'form' in x ? `${x.kind}|${x.form}` : x.kind;
}

/** The saved construct a draft construct is (by uid), or null for a new one. */
function savedOf(saved: readonly Construct[], m: Construct): Construct | null {
  return (m.uid && saved.find((s) => s.uid === m.uid)) || null;
}

/** The Mana Dust one chain's edit costs (see `movesetEditPrice`). */
function chainEditPrice(
  registry: DataRegistry,
  old: Chains[ChainSkill] | undefined,
  next: Chains[ChainSkill],
): number {
  const { editDust, elementDust } = registry.getDelveBalance().movesets;
  const was = movesOf(old);
  const now = movesOf(next);
  let price = 0;
  const known = new Set(was.map(els));
  const charged = new Set<string>();
  const kept = new Set<string>();
  for (const m of now) {
    const from = savedOf(was, m);
    const set = els(m);
    if (!from) {
      // A new construct, and its element set when no saved construct has it (once per Apply).
      price += editDust;
      if (known.has(set) || charged.has(set)) continue;
    } else {
      kept.add(from.uid!);
      if (shape(from) !== shape(m)) price += editDust;
      if (set === els(from) || charged.has(set)) continue;
    }
    charged.add(set);
    price += elementDust;
  }
  // Each saved construct the draft lacks: removed.
  price += was.filter((s) => !s.uid || !kept.has(s.uid)).length * editDust;
  if (old && !Array.isArray(old) && !Array.isArray(next) && old.payment !== next.payment)
    price += editDust;
  return price;
}

/**
 * The Mana Dust turning `saved` into `next` costs, over every chain `next`
 * holds (the constructs spec §3.3), by uid: a construct in `next` whose uid
 * `saved` lacks (or without a uid) is new, `editDust`; a saved uid `next`
 * lacks is removed, `editDust`; a kept uid whose kind or form changed pays
 * `editDust`, whose elements changed `elementDust`; an element set is charged
 * `elementDust` once per Apply however many constructs take it (a new
 * construct's only when no saved one has it); a changed payment costs
 * `editDust`. Position changes are free, and runes are no part of it. The
 * caller applies the first-dive freebie.
 */
export function movesetEditPrice(
  registry: DataRegistry,
  saved: Partial<Chains>,
  next: Partial<Chains>,
): number {
  return CHAIN_SKILLS.reduce((sum, skill) => {
    const chain = next[skill];
    return chain ? sum + chainEditPrice(registry, saved[skill], chain) : sum;
  }, 0);
}

/** What an edit costs `profile`: its price against the worn weapon's saved chains, but nothing before the hero's first dive. */
export function editPrice(
  registry: DataRegistry,
  profile: DelveProfile,
  next: Partial<Chains>,
): number {
  const weapon = profile.equipped.weapon;
  if (!weapon || profile.stats.dives === 0) return 0;
  return movesetEditPrice(registry, movesetOf(registry, weapon).chains, next);
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

/** "A bow can't express Strike": the class refusal (the constructs spec §3.3). */
export function classRefusal(registry: DataRegistry, weapon: GearItem, form: Move['form']): string {
  const base = registry.getGearBase(weapon.baseId).name;
  const article = /^[AEIOU]/.test(base) ? 'An' : 'A';
  return `${article} ${base.toLowerCase()} can't express ${registry.getForm(form).name}`;
}

/** Why `chain` can't be the weapon's `skill` chain, or null when it can. */
function chainRefusal(
  registry: DataRegistry,
  profile: DelveProfile,
  weapon: GearItem,
  moveset: Moveset,
  skill: ChainSkill,
  chain: Chains[ChainSkill],
): string | null {
  const slots = moveset.slots[skill] ?? 0;
  if (slots === 0) return OPEN_SKILL_TEXT;
  if (Array.isArray(chain) !== (skill === 'basic')) return `Not a ${skill} chain`;
  const moves = movesOf(chain);
  const least = skill === 'basic' ? 1 : 0;
  if (moves.length < least || moves.length > slots)
    return `A chain holds ${least} to ${slots} moves`;
  for (const m of moves) if (!MOVE_KINDS.includes(m.kind)) return `Bad kind ${m.kind}`;
  const saved = movesOf(moveset.chains[skill]);
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
      // A new or changed construct must be one the weapon's class can express; a kept dormant one may stay.
      const from = savedOf(saved, m);
      const changed = !from || !('form' in from) || from.form !== m.form;
      if (changed && !formAllowed(registry, weapon.baseId, m.form))
        return classRefusal(registry, weapon, m.form);
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
  const copy = <M extends Construct>(m: M): M =>
    m.runes ? { ...m, runes: m.runes.map((r) => r && { ...r }) } : { ...m };
  if (Array.isArray(chain)) return chain.map(copy);
  const moves = chain.moves.map((m) => ({ ...copy(m), elements: [...m.elements] }));
  return { moves, payment: chain.payment };
}

/**
 * `chain` with a fresh uid minted for each construct the saved chain lacks
 * (no uid, or one the saved chain doesn't hold): the profile's counter moves on.
 */
function mintNew(
  profile: DelveProfile,
  saved: readonly Construct[],
  chain: Chains[ChainSkill],
): [Chains[ChainSkill], DelveProfile] {
  let p = profile;
  const mint = <M extends Construct>(m: M): M => {
    if (savedOf(saved, m)) return m;
    const [uid, next] = mintUid(p);
    p = next;
    return { ...m, uid };
  };
  if (Array.isArray(chain)) return [chain.map(mint), p];
  return [{ ...chain, moves: chain.moves.map(mint) }, p];
}

/**
 * Set several of the equipped weapon's chains at once: all or nothing (the
 * constructs spec §3.3), by uid. Mana Dust (`editPrice`), and the sockets'
 * Links and scrap and the runes in and out (`runeChange`; a pull by
 * `opts.unsocket`): the hero's Links become `links − change.links +
 * change.refundLinks`, the netted amount, whatever order the edits were made
 * in (never dearer than the same edits one by one). Refuses mid-dive, unarmed,
 * when any chain is refused (a skill with no slot on the weapon; a Basic with
 * no blow, or a chain past its slots; an unknown kind, a form from another
 * slot, a form the weapon's class can't express on a new or changed construct
 * (a kept dormant one may stay), anything but one or two different known
 * elements, an unknown payment; an element set outside the pair held more
 * times than before), when the runes are refused (`runeChange`), and when the
 * Dust, the net Links or the scrap can't be paid. A construct whose uid the
 * saved chain lacks is new: it is minted a fresh uid from `profile.nextUid`.
 * Its result lists the runes pulled back to the pouch (`runes`) and those
 * destroyed (`destroyed`).
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
  let minted = profile;
  for (const skill of CHAIN_SKILLS) {
    const chain = chains[skill];
    if (!chain) continue;
    const reason = chainRefusal(registry, profile, weapon, moveset, skill, chain);
    if (reason) return refuse(profile, reason);
    const [made, p] = mintNew(minted, movesOf(moveset.chains[skill]), copyChain(chain));
    minted = p;
    (next as Record<ChainSkill, unknown>)[skill] = made;
  }
  const change = runeChange(registry, profile, chains, opts);
  if ('refused' in change) return refuse(profile, change.refused);
  const price = editPrice(registry, profile, chains);
  if (profile.manaDust < price) return refuse(profile, 'Not enough Mana Dust');
  if (profile.links < change.links - change.refundLinks) return refuse(profile, 'Not enough Links');
  if (profile.scrap < change.scrap) return refuse(profile, 'Not enough scrap');
  const settled = settleParts(registry, profile.runes, change.pulled, opts.unsocket);
  const runes = takeFromPouch(settled.pouch, change.socketed);
  if (!runes) return refuse(profile, 'Not enough runes in your pouch');
  const edited = withMoveset(minted, { ...moveset, chains: next });
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
 * at the skill's ceiling or at 0 slots (that is Open a skill's).
 */
export function slotPrice(
  registry: DataRegistry,
  weapon: GearItem,
  skill: ChainSkill,
): { links: number; scrap: number } | null {
  const bal = registry.getDelveBalance();
  const slots = movesetOf(registry, weapon).slots[skill] ?? 0;
  if (slots === 0 || slots >= ceilingOf(registry, weapon, skill)) return null;
  return { links: bal.movesets.slotLinks[slots - 1], scrap: bal.movesets.slotScrap[slots - 1] };
}

/**
 * Add a slot to the equipped weapon's `skill` chain, for Links and scrap
 * (`slotPrice`), up to the skill's ceiling; it counts as bought. It arrives
 * holding a plain construct, minted: the default kind at its position (the
 * last construct's form's default chain, or for the basic chain the weapon's,
 * medium past its end), the last construct's form (the class default on an
 * empty chain), and the last construct's elements while they're all in the
 * pair, else the pair's primary. Refuses mid-dive, unarmed, for a skill with
 * no slot (Open a skill's), at the ceiling, and when it can't be paid for.
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
  if (!moveset.slots[skill]) return refuse(profile, OPEN_SKILL_TEXT);
  const price = slotPrice(registry, weapon, skill);
  if (!price) return refuse(profile, 'This chain has every slot');
  if (profile.links < price.links) return refuse(profile, 'Not enough Links');
  if (profile.scrap < price.scrap) return refuse(profile, 'Not enough scrap');
  const chain = moveset.chains[skill]!;
  const moves = movesOf(chain);
  const last = moves[moves.length - 1];
  const primary = profile.pair.primary ?? weapon.mana;
  const [uid, minted] = mintUid(profile);
  let added: Construct;
  if (!last) added = { ...plainConstruct(registry, weapon, skill, 0, primary), uid };
  else {
    const kept = elementsOf(last).every((e) => inPair(profile, e));
    const elements = kept ? elementsOf(last) : [primary];
    if (Array.isArray(chain)) {
      const kind = defaultKind(registry, 'basic', weapon.baseId, moves.length);
      added = { uid, kind, element: elements[0] };
    } else {
      const form = (last as Move).form;
      const kind = registry.getForm(form).defaultChain[moves.length] ?? 'medium';
      added = { uid, kind, form, elements: [...elements] };
    }
  }
  const next: Chains[ChainSkill] = Array.isArray(chain)
    ? [...chain, added as Blow]
    : { ...chain, moves: [...chain.moves, added as Move] };
  const slots = { ...moveset.slots, [skill]: moveset.slots[skill]! + 1 };
  const bought = { ...moveset.bought, [skill]: (moveset.bought?.[skill] ?? 0) + 1 };
  const edited = withMoveset(minted, { chains: { ...moveset.chains, [skill]: next }, slots, bought });
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

/** The class the equipped weapon expresses, for the builder's form picker (unarmed null). */
export function wornClass(registry: DataRegistry, profile: DelveProfile) {
  return weaponClass(registry, profile.equipped.weapon?.baseId ?? null);
}
