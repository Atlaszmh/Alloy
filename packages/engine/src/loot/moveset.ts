import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import {
  CHAIN_SKILLS,
  type AbilityPayment,
  type AbilitySlot,
  type Blow,
  type Chains,
  type ChainSkill,
  type Construct,
  type FormId,
  type Move,
  type MoveKind,
  type WeaponClass,
} from '../types/ability.js';
import type { ManaPair } from '../types/delve.js';
import type { EquippedGear, GearItem, Moveset, Rarity } from '../types/gear.js';
import { RARITY_ORDER } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import type { RuneRef } from '../types/rune.js';
import { runeFits, socketCap, socketsOf } from './runes.js';

/**
 * Weapon movesets (see the weapon movesets spec): which chains a weapon
 * carries, its base slots, its default moves, and a drop's extra slots.
 */

/** A weapon as its moveset sees it: its base, rarity and awakening (unarmed: base and rarity null). */
export interface MovesetOwner {
  baseId: string | null;
  rarity: Rarity | null;
  /** An awakened rare (see the tutorial spec's Awaken). */
  awakened?: boolean;
}

/** No weapon: it carries the basic chain alone, at the hero's own string. */
export const UNARMED: MovesetOwner = { baseId: null, rarity: null };

/** Each ability slot's default form and payment: a Bolt, a Ward and a charged Nova. */
export const DEFAULT_FORMS: Record<AbilitySlot, { form: FormId; payment: AbilityPayment }> = {
  primary: { form: 'bolt', payment: 'mana' },
  defensive: { form: 'ward', payment: 'mana' },
  ultimate: { form: 'nova', payment: 'charge' },
};

/**
 * A slot's default form and payment by weapon class (the constructs spec §2.4):
 * the Primary's Strike on a melee weapon, Bolt otherwise (unarmed too); the
 * Defensive's Ward and the Ultimate's charged Nova for both.
 */
export function defaultForm(
  registry: DataRegistry,
  slot: AbilitySlot,
  cls: WeaponClass | null,
): { form: FormId; payment: AbilityPayment } {
  if (slot === 'primary' && cls === 'melee') return { form: 'strike', payment: 'mana' };
  const { form, payment } = DEFAULT_FORMS[slot];
  if (!registry.getArpgData().forms.some((f) => f.id === form)) throw new Error(`No form ${form}`);
  return { form, payment };
}

/** A weapon base's class (the constructs spec §2.1); unarmed null. */
export function weaponClass(registry: DataRegistry, baseId: string | null): WeaponClass | null {
  return baseId ? (registry.getGearBase(baseId).class ?? null) : null;
}

/** Whether a weapon of `baseId` can express `form`: a shared form, or one of its class; unarmed none. */
export function formAllowed(registry: DataRegistry, baseId: string | null, form: FormId): boolean {
  const cls = weaponClass(registry, baseId);
  if (!cls) return false;
  const own = registry.getForm(form).class;
  return own === 'both' || own === cls;
}

/**
 * A skill's slots on `owner`, `[start, ceiling]` by its rarity
 * (`movesets.slots`; the constructs spec §3.2): the Basic's start its weapon's
 * string (a string longer than the ceiling keeps its length); unarmed the
 * Basic at its string and every other skill `[0, 0]`.
 */
export function slotRange(
  registry: DataRegistry,
  owner: MovesetOwner,
  skill: ChainSkill,
): [start: number, ceiling: number] {
  const string = weaponString(registry, owner.baseId).length;
  if (!owner.rarity) return skill === 'basic' ? [string, string] : [0, 0];
  const [start, ceiling] = registry.getDelveBalance().movesets.slots[owner.rarity][skill];
  if (skill !== 'basic') return [start, ceiling];
  return [string, Math.max(string, ceiling)];
}

/** The most slots `owner`'s `skill` can hold (`slotRange`'s ceiling). */
export function ceilingOf(registry: DataRegistry, owner: MovesetOwner, skill: ChainSkill): number {
  return slotRange(registry, owner, skill)[1];
}

/**
 * A plain construct for slot `index` of `owner`'s `skill` (the constructs spec
 * §3.5): the skill's default kind at its index (the class default form's
 * chain, or the weapon's string; medium past its end), the class default form,
 * in `element`; no sockets, no uid (the caller mints one when it enters the
 * profile).
 */
export function plainConstruct(
  registry: DataRegistry,
  owner: MovesetOwner,
  skill: ChainSkill,
  index: number,
  element: ManaType,
): Construct {
  if (skill === 'basic') return { kind: defaultKind(registry, 'basic', owner.baseId, index), element };
  const { form } = defaultForm(registry, skill, weaponClass(registry, owner.baseId));
  const kind = registry.getForm(form).defaultChain[index] ?? 'medium';
  return { kind, form, elements: [element] };
}

/** The skill a construct belongs to: a blow the Basic, a move its form's slot. */
export function constructSkill(registry: DataRegistry, c: Construct): ChainSkill {
  return 'form' in c ? registry.getForm(c.form).slot : 'basic';
}

/** Whether a construct is plain: no open socket and no rune (the constructs spec §3.3's auto-salvage). */
export function isPlain(c: Construct): boolean {
  return socketsOf(c).length === 0;
}

/**
 * The uids of `weapon`'s constructs its class can't express (the constructs
 * spec §3.1's dormancy): the moves whose form isn't the class's or shared. A
 * blow is never dormant (a rune that doesn't fit the weapon's blows is dormant
 * on its own, in `runeKnobs`). A construct without a uid can't be named: none.
 */
export function dormantUids(registry: DataRegistry, weapon: GearItem): Set<string> {
  const out = new Set<string>();
  const { chains } = movesetOf(registry, weapon);
  for (const skill of CHAIN_SKILLS)
    for (const m of chainMoves(chains[skill]))
      if ('form' in m && m.uid && !formAllowed(registry, weapon.baseId, m.form)) out.add(m.uid);
  return out;
}

/**
 * `moveset` with each skill's slots raised to its start on `owner` and its
 * empty slots below the start plain-filled in `element` (the constructs spec
 * §3.2's Upgrade, §3.3's Move all): a chain the moveset lacks is made at its
 * skill's default payment; slots and constructs past the start stay as they
 * are. Nothing is minted: the caller gives the new constructs their uids.
 */
export function fillSlots(
  registry: DataRegistry,
  owner: MovesetOwner,
  moveset: Moveset,
  element: ManaType,
): Moveset {
  const chains = { ...moveset.chains };
  const slots = { ...moveset.slots };
  for (const skill of CHAIN_SKILLS) {
    const [start] = slotRange(registry, owner, skill);
    const have = slots[skill] ?? 0;
    if (start === 0 && !chains[skill]) continue;
    const chain = chains[skill] ?? emptyChain(registry, owner, skill);
    const moves = chainMoves(chain);
    if (have >= start && moves.length >= start) continue;
    const added = Array.from({ length: Math.max(0, start - moves.length) }, (_, i) =>
      plainConstruct(registry, owner, skill, moves.length + i, element),
    );
    (chains as Record<ChainSkill, unknown>)[skill] = Array.isArray(chain)
      ? [...chain, ...(added as Blow[])]
      : { ...chain, moves: [...chain.moves, ...(added as Move[])] };
    slots[skill] = Math.max(have, start);
  }
  return { ...moveset, chains, slots };
}

/** An empty chain for `skill`: no blows, or no moves at the skill's default payment. */
function emptyChain(registry: DataRegistry, owner: MovesetOwner, skill: ChainSkill): Chains[ChainSkill] {
  if (skill === 'basic') return [];
  const { payment } = defaultForm(registry, skill, weaponClass(registry, owner.baseId));
  return { moves: [], payment };
}

/**
 * The skills `item` carries, by its rarity (`movesets.carries`), and the
 * Ultimate too once awakened (see the tutorial spec's Awaken); unarmed (null,
 * or `UNARMED`): the basic chain alone.
 */
export function carriedSkills(
  registry: DataRegistry,
  item: Pick<MovesetOwner, 'rarity' | 'awakened'> | null,
): readonly ChainSkill[] {
  if (!item?.rarity) return ['basic'];
  const carried = registry.getDelveBalance().movesets.carries[item.rarity];
  if (!item.awakened || carried.includes('ultimate')) return carried;
  return [...carried, 'ultimate'];
}

/**
 * The least rarity that carries `skill`, or null for one every rarity carries
 * (the balance's schema has the legendary carry all four, so some rarity does).
 */
export function carriedFrom(registry: DataRegistry, skill: ChainSkill): Rarity | null {
  const carries = registry.getDelveBalance().movesets.carries;
  if (RARITY_ORDER.every((r) => carries[r].includes(skill))) return null;
  return RARITY_ORDER.find((r) => carries[r].includes(skill)) ?? null;
}

/**
 * Why a weapon can't hold `skill`: "Carried by rare weapons and better" (the
 * locked tab's text, and the ops' refusal); the Ultimate adds ", or an
 * awakened rare" (`awaken`). The balance's schema keeps `carries` growing with
 * rarity; a skill every rarity carries (missing only from a hand-edited save)
 * reads "Not carried by this weapon".
 */
export function carriedByText(registry: DataRegistry, skill: ChainSkill): string {
  const from = carriedFrom(registry, skill);
  if (!from) return 'Not carried by this weapon';
  const text = `Carried by ${from} weapons and better`;
  return skill === 'ultimate' ? `${text}, or an awakened rare` : text;
}

/** A weapon's basic string, the kinds of its default basic chain (unarmed, null: the hero's). */
export function weaponString(registry: DataRegistry, baseId: string | null): readonly MoveKind[] {
  const base = baseId ? registry.getGearBase(baseId).defaultChain : undefined;
  return base ?? registry.getDelveBalance().hero.defaultChain;
}

/** The kinds a skill's default chain plays: its default form's, or the weapon's basic string. */
function defaultKinds(
  registry: DataRegistry,
  skill: ChainSkill,
  baseId: string | null,
): readonly MoveKind[] {
  if (skill !== 'basic') return registry.getForm(DEFAULT_FORMS[skill].form).defaultChain;
  return weaponString(registry, baseId);
}

/**
 * The kind of a skill's default move at `index` (from 0): its default chain's
 * (the default form's, or for the basic chain the weapon's), medium past its end.
 */
export function defaultKind(
  registry: DataRegistry,
  skill: ChainSkill,
  baseId: string | null,
  index: number,
): MoveKind {
  return defaultKinds(registry, skill, baseId)[index] ?? 'medium';
}

/** A skill's slots to start with: the basic chain's weapon string length (unarmed, the hero's), else 1. */
export function baseSlots(
  registry: DataRegistry,
  baseId: string | null,
  skill: ChainSkill,
): number {
  return skill === 'basic' ? defaultKinds(registry, 'basic', baseId).length : 1;
}

/** A skill's default chain of `length` moves, every one in `element`. */
export function defaultChain<S extends ChainSkill>(
  registry: DataRegistry,
  skill: S,
  baseId: string | null,
  element: ManaType,
  length: number,
): Chains[S] {
  const kinds = Array.from({ length }, (_, i) => defaultKind(registry, skill, baseId, i));
  if (skill === 'basic') return kinds.map((kind) => ({ kind, element })) as Chains[S];
  const { form, payment } = DEFAULT_FORMS[skill as AbilitySlot];
  return {
    moves: kinds.map((kind) => ({ kind, form, elements: [element] })),
    payment,
  } as Chains[S];
}

/**
 * A moveset for `owner`: each skill it carries at `slots` (its base slots
 * where left out), every slot holding its default move in `element`.
 */
export function defaultMoveset(
  registry: DataRegistry,
  owner: MovesetOwner,
  element: ManaType,
  slots: Partial<Record<ChainSkill, number>> = {},
): Moveset {
  const skills = carriedSkills(registry, owner);
  const n = (s: ChainSkill) => slots[s] ?? baseSlots(registry, owner.baseId, s);
  return {
    chains: Object.fromEntries(
      skills.map((s) => [s, defaultChain(registry, s, owner.baseId, element, n(s))]),
    ) as Moveset['chains'],
    slots: Object.fromEntries(skills.map((s) => [s, n(s)])),
  };
}

/** A weapon's own moveset: its stored one, else its base defaults in its mana. */
export function movesetOf(registry: DataRegistry, weapon: GearItem): Moveset {
  return weapon.moveset ?? defaultMoveset(registry, weapon, weapon.mana);
}

/** A weapon's extra slots: its slots past each chain's base, summed. */
export function extraSlots(registry: DataRegistry, weapon: GearItem): number {
  if (weapon.slot !== 'weapon') return 0;
  const { slots } = movesetOf(registry, weapon);
  return (Object.keys(slots) as ChainSkill[]).reduce(
    (sum, s) => sum + slots[s]! - baseSlots(registry, weapon.baseId, s),
    0,
  );
}

/**
 * A weapon drop's moveset: its rarity's extra slots (`movesets.extraSlots`),
 * each on a chain it carries picked uniformly at random (never past the
 * chain's cap), every slot holding its default move in the item's mana.
 */
export function rollMoveset(
  registry: DataRegistry,
  item: Pick<GearItem, 'baseId' | 'rarity' | 'mana'>,
  rng: SeededRNG,
): Moveset {
  const bal = registry.getDelveBalance();
  const [least, most] = bal.movesets.extraSlots[item.rarity];
  const skills = carriedSkills(registry, item);
  const slots = Object.fromEntries(skills.map((s) => [s, baseSlots(registry, item.baseId, s)]));
  for (let extra = rng.nextInt(least, most); extra > 0; extra--) {
    const open = skills.filter((s) => slots[s] < bal.chains.cap[s]);
    if (open.length === 0) break;
    slots[open[rng.nextInt(0, open.length - 1)]]++;
  }
  return defaultMoveset(registry, item, item.mana, slots);
}

/** A chain's moves, or its blows (none for a chain left out). */
function chainMoves(chain: Chains[ChainSkill] | undefined): (Move | Blow)[] {
  if (!chain) return [];
  return Array.isArray(chain) ? chain : chain.moves;
}

/** A move or blow copied, its elements and sockets too, so the copy never shares an array. */
function copyMove<M extends Move | Blow>(m: M): M {
  const copy = { ...m };
  if ('elements' in copy) copy.elements = [...copy.elements];
  if (copy.runes) copy.runes = copy.runes.map((r) => r && { ...r });
  return copy;
}

/** A chain copied move by move (`copyMove`). */
function copyChain<C extends Chains[ChainSkill]>(chain: C): C {
  if (Array.isArray(chain)) return chain.map(copyMove) as C;
  return { ...chain, moves: chain.moves.map(copyMove) };
}

/**
 * A weapon drop's open sockets (see the runes spec): its rarity's count
 * (`runes.socketDrops`), each on a move or blow of the chains it carries
 * picked uniformly at random (never past the rarity's cap on a move), every
 * one empty. With none to open, `moveset` comes back as it is.
 */
export function rollSockets(
  registry: DataRegistry,
  item: Pick<GearItem, 'rarity'>,
  moveset: Moveset,
  rng: SeededRNG,
): Moveset {
  const [least, most] = registry.getDelveBalance().runes.socketDrops[item.rarity];
  const cap = socketCap(registry, item.rarity);
  let open = rng.nextInt(least, most);
  if (open === 0) return moveset;
  const chains: Moveset['chains'] = {};
  for (const skill of CHAIN_SKILLS) {
    const chain = moveset.chains[skill];
    if (chain) (chains as Record<ChainSkill, unknown>)[skill] = copyChain(chain);
  }
  const moves = CHAIN_SKILLS.flatMap((skill) => chainMoves(chains[skill]));
  for (; open > 0; open--) {
    const room = moves.filter((m) => socketsOf(m).length < cap);
    if (room.length === 0) break;
    const m = room[rng.nextInt(0, room.length - 1)];
    m.runes = [...socketsOf(m), null];
  }
  return { chains, slots: { ...moveset.slots } };
}

/**
 * What a weapon gives back when it goes (salvaged, fused, rebuilt): a Link
 * for each extra slot and each open socket, and the runes in its sockets
 * (which leave by the parts rule). Other gear gives nothing. Salvage pays
 * only the Links past a forge's free extras (`salvageYield`).
 */
export function weaponParts(
  registry: DataRegistry,
  weapon: GearItem,
): { links: number; runes: RuneRef[] } {
  if (weapon.slot !== 'weapon') return { links: 0, runes: [] };
  const { chains } = movesetOf(registry, weapon);
  const sockets = CHAIN_SKILLS.flatMap((skill) => chainMoves(chains[skill])).flatMap(socketsOf);
  return {
    links: extraSlots(registry, weapon) + sockets.length,
    runes: sockets.filter((r): r is RuneRef => r !== null).map((r) => ({ ...r })),
  };
}

/**
 * The hero's chains: the equipped weapon's moveset's; unarmed, a default
 * moveset at base slots (never stored) in the pair's primary, or fire before
 * the choice. A skill the weapon doesn't carry has no chain.
 */
export function heroChains(
  registry: DataRegistry,
  equipped: EquippedGear,
  pair: ManaPair,
): Partial<Chains> {
  const weapon = equipped.weapon;
  if (weapon) return movesetOf(registry, weapon).chains;
  return defaultMoveset(registry, UNARMED, pair.primary ?? 'fire').chains;
}

/** What moving one weapon's moveset onto another gives (see `movesetTransfer`). */
export interface MovesetTransfer {
  /** The target's moveset once the chains have moved onto it. */
  moveset: Moveset;
  /** Extra slots that move: the price counts these. */
  moved: number;
  /** Open sockets that move (on the moves the target keeps, within its cap): the price counts these too. */
  sockets: number;
  /**
   * Links back: the extras past the cap, the extras of chains the target
   * can't carry, and the target's own extras on the chains replaced; and one
   * for each open socket that doesn't move (past the target's cap, on a move
   * the transfer drops, or the target's own on the chains replaced).
   */
  links: number;
  /**
   * The runes that leave, by the parts rule: those in the sockets that don't
   * move, and a kept blow's rune that doesn't fit the target weapon (its socket moves, empty).
   */
  runes: RuneRef[];
  /** Scrap: `transferScrap` for each extra slot and each open socket that moves. */
  scrap: number;
}

/**
 * `source`'s moveset moved onto `target`: each chain the target carries keeps
 * its extra slots over the target's base (at most the cap, the rest back as
 * Links), its moves past the new slots dropped from the end; a chain the
 * target can't carry stays behind, its extras back as Links; the target's own
 * extras on the chains replaced come back as Links; and a skill only the
 * target carries keeps the target's chain. Sockets go with their moves (see
 * the runes spec): a kept move's sockets past the target's cap come back from
 * the end, and so do all of a dropped move's and of the target's replaced
 * moves, each as a Link with its rune leaving; a kept blow's rune that
 * doesn't fit the target weapon leaves too, its socket staying open.
 */
export function movesetTransfer(
  registry: DataRegistry,
  source: GearItem,
  target: GearItem,
): MovesetTransfer {
  const bal = registry.getDelveBalance();
  const from = movesetOf(registry, source);
  const onto = movesetOf(registry, target);
  const carried = carriedSkills(registry, target);
  const cap = socketCap(registry, target.rarity);
  const chains = { ...onto.chains };
  const slots = { ...onto.slots };
  let moved = 0;
  let sockets = 0;
  let links = 0;
  const runes: RuneRef[] = [];
  /** Sockets that don't move: a Link each, their runes leaving. */
  const leave = (gone: (RuneRef | null)[]) => {
    links += gone.length;
    for (const r of gone) if (r) runes.push({ ...r });
  };
  /** A move the target keeps: its sockets within the cap, and a blow's runes that fit the target. */
  const keep = <M extends Move | Blow>(m: M): M => {
    const copy = copyMove(m);
    const own = socketsOf(copy);
    if (own.length === 0) return copy;
    leave(own.slice(cap));
    copy.runes = own.slice(0, cap).map((r) => {
      if (!r || 'form' in copy) return r;
      const def = registry.findRune(r.id);
      if (def && runeFits(def, { weapon: target.baseId, kind: copy.kind })) return r;
      runes.push(r);
      return null;
    });
    sockets += copy.runes.length;
    return copy;
  };
  for (const skill of CHAIN_SKILLS) {
    const chain = from.chains[skill];
    if (!chain) continue;
    const extra = from.slots[skill]! - baseSlots(registry, source.baseId, skill);
    if (!carried.includes(skill)) {
      links += extra;
      for (const m of chainMoves(chain)) leave(socketsOf(m));
      continue;
    }
    const base = baseSlots(registry, target.baseId, skill);
    const n = Math.min(base + extra, bal.chains.cap[skill]);
    links += base + extra - n + (onto.slots[skill]! - base);
    moved += n - base;
    for (const m of chainMoves(onto.chains[skill])) leave(socketsOf(m));
    for (const m of chainMoves(chain).slice(n)) leave(socketsOf(m));
    const kept = Array.isArray(chain)
      ? chain.slice(0, n).map(keep)
      : { ...chain, moves: chain.moves.slice(0, n).map(keep) };
    (chains as Record<ChainSkill, unknown>)[skill] = kept;
    slots[skill] = n;
  }
  return {
    moveset: { chains, slots },
    moved,
    sockets,
    links,
    runes,
    scrap: (moved + sockets) * bal.movesets.transferScrap,
  };
}
