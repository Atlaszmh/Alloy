import type { ManaType } from './mana.js';
import type { FormDef, FusionDef, StatusId, Vec } from './arpg.js';

/**
 * Each ability slot holds a chain of moves (see the moves and chains spec): a
 * move is a kind (light, medium, heavy or hold), a form (what it does) and one
 * or two elements (how it behaves); the chain has one payment (mana, charge or
 * cast time). `resolveChain` compiles a chain into plain numbers and knobs that
 * the combat code reads.
 */

export type AbilitySlot = 'primary' | 'defensive' | 'ultimate';

export const ABILITY_SLOTS: readonly AbilitySlot[] = ['primary', 'defensive', 'ultimate'] as const;

export type FormId =
  | 'bolt'
  | 'volley'
  | 'lance'
  | 'burst'
  | 'strike'
  | 'ward'
  | 'armor'
  | 'surge'
  | 'blink'
  | 'nova'
  | 'barrage'
  | 'maelstrom';

/** Swift, Quick, Balanced, Heavy, Crushing: the per-weight tables' index − 2 (a version 4 build's weight). */
export type AbilityWeight = -2 | -1 | 0 | 1 | 2;

export type AbilityPayment = 'mana' | 'charge' | 'cast';

export const ABILITY_PAYMENTS: readonly AbilityPayment[] = ['mana', 'charge', 'cast'] as const;

/** A version 4 save's ability (see `chainFromBuild`). */
export interface AbilityBuild {
  form: FormId;
  /** One element, or two distinct elements (a fusion). */
  elements: ManaType[];
  weight: AbilityWeight;
  payment: AbilityPayment;
}

export type AbilityBuilds = Record<AbilitySlot, AbilityBuild>;

/** How a move lands: light, medium or heavy, or a hold that charges while the button is held. */
export type MoveKind = 'light' | 'medium' | 'heavy' | 'hold';

export const MOVE_KINDS: readonly MoveKind[] = ['light', 'medium', 'heavy', 'hold'] as const;

/** The kinds whose numbers a hold's three stages take (Volley's darts, a basic hold's rows). */
export const HOLD_STAGE_KINDS: readonly MoveKind[] = ['medium', 'heavy', 'hold'] as const;

/** One move of an ability chain: its kind, a form of the chain's slot, and one or two elements. */
export interface Move {
  kind: MoveKind;
  form: FormId;
  /** One element, or two distinct elements (a fusion). */
  elements: ManaType[];
}

/** An ability slot's chain: each press casts its next move; one payment for every move. */
export interface Chain {
  moves: Move[];
  payment: AbilityPayment;
}

/** One blow of the basic chain: the weapon's row for its kind, in its element. */
export interface Blow {
  kind: MoveKind;
  element: ManaType;
}

/** A skill that holds a chain: the basic attack or an ability slot. */
export type ChainSkill = 'basic' | AbilitySlot;

export const CHAIN_SKILLS: readonly ChainSkill[] = [
  'basic',
  'primary',
  'defensive',
  'ultimate',
] as const;

export interface Chains {
  basic: Blow[];
  primary: Chain;
  defensive: Chain;
  ultimate: Chain;
}

/** Most moves a chain can hold (each skill's own cap, on the profile, is at most this). */
export const MAX_CHAIN = 5;

/** Lingering ground left where an ability lands. */
export interface ZoneKnob {
  seconds: number;
  /** Damage per 0.5 s tick, as a multiple of the ability's hit. */
  tickPower: number;
}

/** Behaviour contributed by elements and fusions; merged into every ability. */
export interface Knobs {
  /** Damage multiplier. */
  power: number;
  /** Radius / size multiplier. */
  area: number;
  applies: StatusId[];
  /** Extra foes each hit jumps to. */
  chain: number;
  pierce: boolean;
  knockback: number;
  /** Fraction of ability damage healed. */
  lifesteal: number;
  zone: ZoneKnob | null;
  /** Drag foes to the impact point before it lands. */
  pull: boolean;
  /** Frozen foes below this life fraction shatter (0 = off). */
  execute: number;
  /** 0..1: impacts land this far off-target (fraction of their radius), and vary in size. */
  scatter: number;
  /** On a kill, the foe's poison and hex spread to its neighbours. */
  spread: boolean;
}

/** A queued cast: which slot, and where the player aimed (world units), if they did. */
export interface AbilityCast {
  slot: number;
  aim?: Vec | null;
  /**
   * A repeat press (the pad's hold-to-repeat, the DPS sim's held button), made
   * early to wait in the buffer: at a hold move it's dropped (the held button
   * charges it), and refused for mana it makes no `noMana` event.
   */
  repeat?: boolean;
}

/** A move compiled to plain numbers; the combat code reads only this. */
export interface ResolvedAbility {
  slot: AbilitySlot;
  kind: MoveKind;
  /** The weight it resolved at (its kind's; a hold's stage's). */
  weight: number;
  /** A hold move's stage (0 for any other move). */
  stage: number;
  payment: AbilityPayment;
  /** Its place in the chain (from 0), and whether it is the last move of a chain of 2 or more. */
  index: number;
  last: boolean;
  form: FormDef;
  /** "Wildfire Burst", "Frost Ward". */
  name: string;
  icon: string;
  /** The damage element (the first one). */
  element: ManaType;
  elements: ManaType[];
  fusion: FusionDef | null;
  /** Damage as a multiple of the hero's weapon hit. */
  power: number;
  /** Defensive magnitude (see `FormDef.effect`); 0 for offensive forms. */
  effect: number;
  /** Mana spent per use (0 when paid by charge). */
  cost: number;
  cooldown: number;
  /** Wind-up seconds: conjure + channel. */
  castTime: number;
  /** Seconds of anticipation from the weight (every ability). */
  conjure: number;
  /** Seconds of slowed movement after it lands (0 for the Defensive). */
  recovery: number;
  /** Seconds of channel (cast payment only). */
  channel: number;
  /** 0–1: how hard its direct hits land (client feel only). */
  heft: number;
  /** Extra knockback on direct hits (Heavy, Crushing). */
  heavyKnockback: number;
  /** Direct hits stagger (Crushing). */
  heavyStagger: boolean;
  /** Stacks each direct hit applies (by weight, `stacks.byWeight`). */
  stacks: number;
  /** Units moved when cast: + steps in over the conjure, − recoils after the release; before the step bonus. */
  motion: number;
  /** Charge units needed (charge payment only; a hold's is its stage 2's). */
  chargeNeed: number;
  range: number;
  radius: number;
  speed: number;
  count: number;
  duration: number;
  tick: number;
  /** Melee arc in degrees. */
  arc: number;
  knobs: Knobs;
}

/** A slot's chain compiled: its moves (a hold's at stage 0) and each hold move's three stages. */
export interface ResolvedChain {
  moves: ResolvedAbility[];
  payment: AbilityPayment;
  hold: (ResolvedAbility[] | null)[];
}
