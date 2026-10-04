import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import {
  CHAIN_SKILLS,
  type AbilityPayment,
  type AbilitySlot,
  type Blow,
  type Chains,
  type ChainSkill,
  type FormId,
  type Move,
  type MoveKind,
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

/** No weapon: it carries the basic chain and the Primary, at the hero's own string. */
export const UNARMED: MovesetOwner = { baseId: null, rarity: null };

/** Each ability slot's default form and payment: a Bolt, a Ward and a charged Nova. */
export const DEFAULT_FORMS: Record<AbilitySlot, { form: FormId; payment: AbilityPayment }> = {
  primary: { form: 'bolt', payment: 'mana' },
  defensive: { form: 'ward', payment: 'mana' },
  ultimate: { form: 'nova', payment: 'charge' },
};

/**
 * The skills `item` carries, by its rarity (and, once Awaken lands, its
 * awakening); unarmed (null, or `UNARMED`): basic and primary.
 */
export function carriedSkills(
  registry: DataRegistry,
  item: Pick<MovesetOwner, 'rarity' | 'awakened'> | null,
): readonly ChainSkill[] {
  const rarity = item?.rarity ?? null;
  return rarity ? registry.getDelveBalance().movesets.carries[rarity] : ['basic', 'primary'];
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
 * Why a weapon can't hold `skill`: "Carried by magic weapons and better" (the
 * locked tab's text, and the ops' refusal). The balance's schema keeps
 * `carries` growing with rarity; a skill every rarity carries (missing only
 * from a hand-edited save) reads "Not carried by this weapon".
 */
export function carriedByText(registry: DataRegistry, skill: ChainSkill): string {
  const from = carriedFrom(registry, skill);
  return from ? `Carried by ${from} weapons and better` : 'Not carried by this weapon';
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
