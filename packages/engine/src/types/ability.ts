import type { ManaType } from './mana.js';
import type { FormDef, FusionDef, StatusId, Vec } from './arpg.js';

/**
 * Abilities are built from parts: a form (what it does), one or two elements
 * (how it behaves), a weight (light and cheap to heavy and costly) and a
 * payment (mana, charge or cast time). `resolveAbility` compiles a build into
 * plain numbers and knobs that the combat code reads.
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

/** Swift, Quick, Balanced, Heavy, Crushing. */
export type AbilityWeight = -2 | -1 | 0 | 1 | 2;

export const ABILITY_WEIGHTS: readonly AbilityWeight[] = [-2, -1, 0, 1, 2] as const;

export type AbilityPayment = 'mana' | 'charge' | 'cast';

export const ABILITY_PAYMENTS: readonly AbilityPayment[] = ['mana', 'charge', 'cast'] as const;

export interface AbilityBuild {
  form: FormId;
  /** One element, or two distinct elements (a fusion). */
  elements: ManaType[];
  weight: AbilityWeight;
  payment: AbilityPayment;
}

export type AbilityBuilds = Record<AbilitySlot, AbilityBuild>;

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
}

/** An ability build compiled to plain numbers; the combat code reads only this. */
export interface ResolvedAbility {
  slot: AbilitySlot;
  build: AbilityBuild;
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
  /** Units moved when cast: + steps in over the conjure, − recoils after the release; before the press-combo multiplier. */
  motion: number;
  /** Charge units needed (charge payment only). */
  chargeNeed: number;
  range: number;
  radius: number;
  speed: number;
  count: number;
  duration: number;
  tick: number;
  /** Melee arc in degrees. */
  arc: number;
  /** Press-combo multipliers; `[1]` when the form has no combo. */
  combo: number[];
  comboCount: number[] | null;
  knobs: Knobs;
}
