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
import type { ManaType } from '../types/mana.js';
import { MAX_SOCKETS, type RuneRef } from '../types/rune.js';
import { runeTierAt } from './drops.js';
import { socketsOf } from './runes.js';

/**
 * Weapon movesets (see the constructs spec §3): a weapon is a frame, with a
 * class, a cast style and slots by skill, holding constructs; the pure parts
 * live here: the slot table, the class rules, the default and plain fillings,
 * a drop's rolls, a weapon's parts and the Move all preview. The profile ops
 * live in `delve/moveset.ts` and `delve/constructs.ts`.
 */

/** A weapon as its moveset sees it: its base and rarity (unarmed: both null). Any `{ baseId, rarity }` pick, a `GearItem` included. */
export interface MovesetOwner {
  baseId: string | null;
  rarity: Rarity | null;
}

/** No weapon: it holds the basic chain alone, at the hero's own string. */
export const UNARMED: MovesetOwner = { baseId: null, rarity: null };

/** Each ability slot's class-free default form and payment: a Bolt, a Ward and a charged Nova. */
const DEFAULT_FORMS: Record<AbilitySlot, { form: FormId; payment: AbilityPayment }> = {
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

/** A weapon's basic string, the kinds of its default basic chain (unarmed, null: the hero's). */
export function weaponString(registry: DataRegistry, baseId: string | null): readonly MoveKind[] {
  const base = baseId ? registry.getGearBase(baseId).defaultChain : undefined;
  return base ?? registry.getDelveBalance().hero.defaultChain;
}

/** The kinds a skill's default chain plays: its class default form's, or the weapon's basic string. */
function defaultKinds(
  registry: DataRegistry,
  skill: ChainSkill,
  baseId: string | null,
): readonly MoveKind[] {
  if (skill === 'basic') return weaponString(registry, baseId);
  return registry.getForm(defaultForm(registry, skill, weaponClass(registry, baseId)).form)
    .defaultChain;
}

/**
 * The kind of a skill's default move at `index` (from 0): its default chain's
 * (the class default form's, or for the basic chain the weapon's), medium past its end.
 */
export function defaultKind(
  registry: DataRegistry,
  skill: ChainSkill,
  baseId: string | null,
  index: number,
): MoveKind {
  return defaultKinds(registry, skill, baseId)[index] ?? 'medium';
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
  const kind = defaultKind(registry, skill, owner.baseId, index);
  if (skill === 'basic') return { kind, element };
  const { form } = defaultForm(registry, skill, weaponClass(registry, owner.baseId));
  return { kind, form, elements: [element] };
}

/** A skill's default chain of `length` plain constructs, every one in `element`. */
export function defaultChain<S extends ChainSkill>(
  registry: DataRegistry,
  skill: S,
  baseId: string | null,
  element: ManaType,
  length: number,
): Chains[S] {
  const owner = { baseId, rarity: null };
  const moves = Array.from({ length }, (_, i) =>
    plainConstruct(registry, owner, skill, i, element),
  );
  if (skill === 'basic') return moves as Chains[S];
  const { payment } = defaultForm(registry, skill as AbilitySlot, weaponClass(registry, baseId));
  return { moves: moves as Move[], payment } as Chains[S];
}

/**
 * A moveset for `owner` (the constructs spec §3.2, §3.5): each skill at its
 * start (or `slots`), every slot holding a plain construct in `element`, no
 * uids, `bought` all 0. A skill at 0 slots has no chain and no slots entry.
 */
export function defaultMoveset(
  registry: DataRegistry,
  owner: MovesetOwner,
  element: ManaType,
  slots: Partial<Record<ChainSkill, number>> = {},
): Moveset {
  const n = (s: ChainSkill) => slots[s] ?? slotRange(registry, owner, s)[0];
  const skills = CHAIN_SKILLS.filter((s) => n(s) > 0);
  return {
    chains: Object.fromEntries(
      skills.map((s) => [s, defaultChain(registry, s, owner.baseId, element, n(s))]),
    ) as Moveset['chains'],
    slots: Object.fromEntries(skills.map((s) => [s, n(s)])),
    bought: {},
  };
}

/** A weapon's own moveset: its stored one, else its base defaults in its mana. */
export function movesetOf(registry: DataRegistry, weapon: GearItem): Moveset {
  return weapon.moveset ?? defaultMoveset(registry, weapon, weapon.mana);
}

/** A chain's moves, or its blows (none for a chain left out). */
export function chainMoves(chain: Chains[ChainSkill] | undefined): Construct[] {
  if (!chain) return [];
  return Array.isArray(chain) ? chain : chain.moves;
}

/** An empty chain for `skill`: no blows, or no moves at the skill's default payment. */
function emptyChain(
  registry: DataRegistry,
  owner: MovesetOwner,
  skill: ChainSkill,
): Chains[ChainSkill] {
  if (skill === 'basic') return [];
  const { payment } = defaultForm(registry, skill, weaponClass(registry, owner.baseId));
  return { moves: [], payment };
}

/** `chain` with `moves` appended (a basic chain takes blows). */
function withMoves(chain: Chains[ChainSkill], moves: Construct[]): Chains[ChainSkill] {
  if (Array.isArray(chain)) return [...chain, ...(moves as Blow[])];
  return { ...chain, moves: [...chain.moves, ...(moves as Move[])] };
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
    (chains as Record<ChainSkill, unknown>)[skill] = withMoves(chain, added);
    slots[skill] = Math.max(have, start);
  }
  return { ...moveset, chains, slots };
}

/**
 * A weapon drop's moveset: its rarity's extra slots (`movesets.extraSlots`,
 * free: not bought), each on a skill it has slots for, picked uniformly at
 * random, never past the skill's ceiling (a drop never opens a skill), every
 * slot holding a plain construct in the item's mana.
 */
export function rollMoveset(
  registry: DataRegistry,
  item: Pick<GearItem, 'baseId' | 'rarity' | 'mana'>,
  rng: SeededRNG,
): Moveset {
  const [least, most] = registry.getDelveBalance().movesets.extraSlots[item.rarity];
  const slots: Partial<Record<ChainSkill, number>> = {};
  for (const s of CHAIN_SKILLS) {
    const [start] = slotRange(registry, item, s);
    if (start > 0) slots[s] = start;
  }
  const skills = Object.keys(slots) as ChainSkill[];
  for (let extra = rng.nextInt(least, most); extra > 0; extra--) {
    const open = skills.filter((s) => slots[s]! < ceilingOf(registry, item, s));
    if (open.length === 0) break;
    slots[open[rng.nextInt(0, open.length - 1)]]!++;
  }
  return defaultMoveset(registry, item, item.mana, slots);
}

/** A move or blow copied, its elements and sockets too, so the copy never shares an array. */
function copyMove<M extends Construct>(m: M): M {
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

/** `moveset` with every chain copied (`copyChain`), its slots and bought too. */
function copyMoveset(moveset: Moveset): Moveset {
  const chains: Moveset['chains'] = {};
  for (const skill of CHAIN_SKILLS) {
    const chain = moveset.chains[skill];
    if (chain) (chains as Record<ChainSkill, unknown>)[skill] = copyChain(chain);
  }
  return { chains, slots: { ...moveset.slots }, bought: { ...moveset.bought } };
}

/**
 * A weapon drop's open sockets (see the runes spec): its rarity's count
 * (`runes.socketDrops`), each on a construct of its chains picked uniformly at
 * random (never past `MAX_SOCKETS` on one), every one empty. With none to open,
 * `moveset` comes back as it is.
 */
export function rollSockets(
  registry: DataRegistry,
  item: Pick<GearItem, 'rarity'>,
  moveset: Moveset,
  rng: SeededRNG,
): Moveset {
  const [least, most] = registry.getDelveBalance().runes.socketDrops[item.rarity];
  let open = rng.nextInt(least, most);
  if (open === 0) return moveset;
  const copy = copyMoveset(moveset);
  const moves = CHAIN_SKILLS.flatMap((skill) => chainMoves(copy.chains[skill]));
  for (; open > 0; open--) {
    const room = moves.filter((m) => socketsOf(m).length < MAX_SOCKETS);
    if (room.length === 0) break;
    const m = room[rng.nextInt(0, room.length - 1)];
    m.runes = [...socketsOf(m), null];
  }
  return copy;
}

/**
 * A weapon drop's socketed rune (the constructs spec §3.5): at
 * `runes.runeChance[rarity]`, one of its open empty sockets, picked uniformly
 * at random, takes a rune uniform over the data at the tier the item level
 * gives (`runeTierAt`, as a slain foe's). Drawn on its own fork after
 * `rollSockets`; with no chance or no empty socket, `moveset` comes back as it is.
 */
export function rollSocketedRunes(
  registry: DataRegistry,
  item: Pick<GearItem, 'rarity' | 'ilvl'>,
  moveset: Moveset,
  rng: SeededRNG,
): Moveset {
  const chance = registry.getDelveBalance().runes.runeChance[item.rarity];
  if (rng.next() >= chance) return moveset;
  const copy = copyMoveset(moveset);
  const empty = CHAIN_SKILLS.flatMap((skill) => chainMoves(copy.chains[skill])).flatMap((m) =>
    socketsOf(m).flatMap((r, i) => (r === null ? [{ m, i }] : [])),
  );
  if (empty.length === 0) return moveset;
  const { m, i } = empty[rng.nextInt(0, empty.length - 1)];
  const runes = registry.getRunes();
  const { id } = runes[rng.nextInt(0, runes.length - 1)];
  m.runes = socketsOf(m).map((r, j) => (j === i ? { id, tier: runeTierAt(registry, item.ilvl, rng) } : r));
  return copy;
}

/** The skill a construct belongs to: a blow the Basic, a move its form's slot. */
export function constructSkill(registry: DataRegistry, c: Construct): ChainSkill {
  return 'form' in c ? registry.getForm(c.form).slot : 'basic';
}

/** Whether a construct is plain: no open socket and no rune (the constructs spec §3.3's auto-salvage). */
export function isPlain(c: Construct): boolean {
  return socketsOf(c).length === 0;
}

/** Whether `weapon`'s class can play construct `c`: a blow always, a move by its form (`formAllowed`). */
function expresses(registry: DataRegistry, baseId: string | null, c: Construct): boolean {
  return !('form' in c) || formAllowed(registry, baseId, c.form);
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
      if (m.uid && !expresses(registry, weapon.baseId, m)) out.add(m.uid);
  return out;
}

/**
 * What a weapon gives back when it goes (the constructs spec §3.3): a Link for
 * each bought slot, the runes in its sockets, and its constructs. Other gear
 * gives nothing.
 */
export function weaponParts(
  registry: DataRegistry,
  weapon: GearItem,
): { links: number; runes: RuneRef[]; constructs: Construct[] } {
  if (weapon.slot !== 'weapon') return { links: 0, runes: [], constructs: [] };
  const { chains, bought } = movesetOf(registry, weapon);
  const constructs = CHAIN_SKILLS.flatMap((skill) => chainMoves(chains[skill])).map(copyMove);
  const sockets = constructs.flatMap(socketsOf);
  return {
    links: CHAIN_SKILLS.reduce((sum, s) => sum + (bought?.[s] ?? 0), 0),
    runes: sockets.filter((r): r is RuneRef => r !== null).map((r) => ({ ...r })),
    constructs,
  };
}

/**
 * The hero's chains as they play (the constructs spec §3.1, the one place
 * dormancy is decided): the equipped weapon's chains with the constructs its
 * class can't express left out and an ability chain left empty dropped (it
 * plays as an uncarried skill); unarmed, a default moveset at the hero's
 * string (never stored) in the pair's primary, or fire before the choice.
 */
export function heroChains(
  registry: DataRegistry,
  equipped: EquippedGear,
  pair: ManaPair,
): Partial<Chains> {
  const weapon = equipped.weapon;
  if (!weapon) return defaultMoveset(registry, UNARMED, pair.primary ?? 'fire').chains;
  const { chains } = movesetOf(registry, weapon);
  const out: Partial<Chains> = {};
  for (const skill of CHAIN_SKILLS) {
    const chain = chains[skill];
    if (!chain) continue;
    if (Array.isArray(chain)) {
      out.basic = chain;
      continue;
    }
    const live = chain.moves.filter((m) => expresses(registry, weapon.baseId, m));
    if (live.length === 0) continue;
    out[skill as AbilitySlot] = live.length === chain.moves.length ? chain : { ...chain, moves: live };
  }
  return out;
}

/** What Move all onto a weapon gives (`moveAllPreview`). */
export interface MoveAllPreview {
  /** The target's moveset once the worn weapon's constructs sit in its slots. */
  moveset: Moveset;
  /** The constructs that go to the bag: the worn weapon's past the target's slots, and the target's own on the chains replaced. */
  toBag: Construct[];
  /** The uids of the moved constructs the target's class can't express (they sit in their slots, dormant). */
  dormant: string[];
  /** The worn weapon's moveset refilled plain (`fillSlots`, its constructs without uids). */
  old: Moveset;
}

/**
 * Move all (the constructs spec §3.3), pure: the target's moveset once the worn
 * weapon's constructs sit in its slots slot for slot (each chain's payment with
 * them), `toBag` the constructs past its slots and the target's own on the
 * chains replaced, `dormant` the uids its class can't express (they stay, in
 * their slots), and `old` the worn weapon's moveset emptied and refilled plain
 * to its starts (its bought and extra slots kept). A target skill the worn
 * weapon moves no construct into (no chain, or a skill the target has no slots
 * for) keeps the target's own constructs. `compareItem`'s 'home' value, the
 * Loadout's verdicts and the autopilot read it and never mint; only B2's
 * `moveAll` mints the refill's uids and bumps `nextUid`.
 */
export function moveAllPreview(
  registry: DataRegistry,
  worn: GearItem,
  target: GearItem,
): MoveAllPreview {
  const from = movesetOf(registry, worn);
  const onto = copyMoveset(movesetOf(registry, target));
  const toBag: Construct[] = [];
  const dormant: string[] = [];
  const emptied: Moveset = { chains: {}, slots: { ...from.slots }, bought: { ...from.bought } };
  for (const skill of CHAIN_SKILLS) {
    const chain = from.chains[skill];
    if (!chain) continue;
    const moves = chainMoves(chain).map(copyMove);
    (emptied.chains as Record<ChainSkill, unknown>)[skill] = withMoves(
      emptyChain(registry, worn, skill),
      [],
    );
    const room = onto.slots[skill] ?? 0;
    if (room === 0 || moves.length === 0) {
      toBag.push(...moves);
      continue;
    }
    toBag.push(...chainMoves(onto.chains[skill]));
    const placed = moves.slice(0, room);
    toBag.push(...moves.slice(room));
    for (const m of placed)
      if (m.uid && !expresses(registry, target.baseId, m)) dormant.push(m.uid);
    (onto.chains as Record<ChainSkill, unknown>)[skill] = Array.isArray(chain)
      ? placed
      : { ...chain, moves: placed };
  }
  // A kept chain's payment travels with its constructs (`{ ...chain, moves }` above); an emptied
  // old chain keeps the worn weapon's payment only where B2's `moveAll` says so: here the default.
  const old = fillSlots(registry, worn, emptied, worn.mana);
  return { moveset: onto, toBag, dormant, old };
}
