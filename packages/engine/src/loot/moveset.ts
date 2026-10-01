import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import {
  CHAIN_SKILLS,
  type AbilityPayment,
  type AbilitySlot,
  type Chains,
  type ChainSkill,
  type FormId,
  type MoveKind,
} from '../types/ability.js';
import type { ManaPair } from '../types/delve.js';
import type { EquippedGear, GearItem, Moveset, Rarity } from '../types/gear.js';
import { RARITY_ORDER } from '../types/gem.js';
import type { ManaType } from '../types/mana.js';

/**
 * Weapon movesets (see the weapon movesets spec): which chains a weapon
 * carries, its base slots, its default moves, and a drop's extra slots.
 */

/** A weapon as its moveset sees it: its base and rarity (unarmed: both null). */
export interface MovesetOwner {
  baseId: string | null;
  rarity: Rarity | null;
}

/** No weapon: it carries the basic chain and the Primary, at the hero's own string. */
export const UNARMED: MovesetOwner = { baseId: null, rarity: null };

/** Each ability slot's default form and payment: a Bolt, a Ward and a charged Nova. */
export const DEFAULT_FORMS: Record<AbilitySlot, { form: FormId; payment: AbilityPayment }> = {
  primary: { form: 'bolt', payment: 'mana' },
  defensive: { form: 'ward', payment: 'mana' },
  ultimate: { form: 'nova', payment: 'charge' },
};

/** The skills a weapon of `rarity` carries (unarmed, null: basic and primary). */
export function carriedSkills(registry: DataRegistry, rarity: Rarity | null): ChainSkill[] {
  return rarity ? registry.getDelveBalance().movesets.carries[rarity] : ['basic', 'primary'];
}

/** The least rarity that carries `skill` (null for one every rarity carries). */
export function carriedFrom(registry: DataRegistry, skill: ChainSkill): Rarity | null {
  const carries = registry.getDelveBalance().movesets.carries;
  if (RARITY_ORDER.every((r) => carries[r].includes(skill))) return null;
  return RARITY_ORDER.find((r) => carries[r].includes(skill)) ?? null;
}

/**
 * Why a weapon can't hold `skill`: "Carried by magic weapons and better" (the
 * locked tab's text, and the ops' refusal). Only for a skill some rarity
 * doesn't carry (the balance's schema keeps `carries` growing with rarity).
 */
export function carriedByText(registry: DataRegistry, skill: ChainSkill): string {
  return `Carried by ${carriedFrom(registry, skill)} weapons and better`;
}

/** The kinds a skill's default chain plays: its default form's, or the weapon's basic string. */
function defaultKinds(
  registry: DataRegistry,
  skill: ChainSkill,
  baseId: string | null,
): readonly MoveKind[] {
  if (skill !== 'basic') return registry.getForm(DEFAULT_FORMS[skill].form).defaultChain;
  const base = baseId ? registry.getGearBase(baseId).defaultChain : undefined;
  return base ?? registry.getDelveBalance().hero.defaultChain;
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
  const skills = carriedSkills(registry, owner.rarity);
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
  const skills = carriedSkills(registry, item.rarity);
  const slots = Object.fromEntries(skills.map((s) => [s, baseSlots(registry, item.baseId, s)]));
  for (let extra = rng.nextInt(least, most); extra > 0; extra--) {
    const open = skills.filter((s) => slots[s] < bal.chains.cap[s]);
    if (open.length === 0) break;
    slots[open[rng.nextInt(0, open.length - 1)]]++;
  }
  return defaultMoveset(registry, item, item.mana, slots);
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
  /**
   * Links back: the extras past the cap, the extras of chains the target
   * can't carry, and the target's own extras on the chains replaced.
   */
  links: number;
  /** Scrap: `transferScrap` for each extra slot that moves. */
  scrap: number;
}

/**
 * `source`'s moveset moved onto `target`: each chain the target carries keeps
 * its extra slots over the target's base (at most the cap, the rest back as
 * Links), its moves past the new slots dropped from the end; a chain the
 * target can't carry stays behind, its extras back as Links; the target's own
 * extras on the chains replaced come back as Links; and a skill only the
 * target carries keeps the target's chain.
 */
export function movesetTransfer(
  registry: DataRegistry,
  source: GearItem,
  target: GearItem,
): MovesetTransfer {
  const bal = registry.getDelveBalance();
  const from = movesetOf(registry, source);
  const onto = movesetOf(registry, target);
  const carried = carriedSkills(registry, target.rarity);
  const chains = { ...onto.chains };
  const slots = { ...onto.slots };
  let moved = 0;
  let links = 0;
  for (const skill of CHAIN_SKILLS) {
    const chain = from.chains[skill];
    if (!chain) continue;
    const extra = from.slots[skill]! - baseSlots(registry, source.baseId, skill);
    if (!carried.includes(skill)) {
      links += extra;
      continue;
    }
    const base = baseSlots(registry, target.baseId, skill);
    const n = Math.min(base + extra, bal.chains.cap[skill]);
    links += base + extra - n + (onto.slots[skill]! - base);
    moved += n - base;
    const kept = Array.isArray(chain)
      ? chain.slice(0, n).map((b) => ({ ...b }))
      : {
          ...chain,
          moves: chain.moves.slice(0, n).map((m) => ({ ...m, elements: [...m.elements] })),
        };
    (chains as Record<ChainSkill, unknown>)[skill] = kept;
    slots[skill] = n;
  }
  return { moveset: { chains, slots }, moved, links, scrap: moved * bal.movesets.transferScrap };
}
