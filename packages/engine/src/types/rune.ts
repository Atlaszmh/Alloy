import type { FormId, MoveKind, ChainSkill, KnobsData } from './ability.js';

/**
 * Runes (see the runes spec): pouch items socketed on a move or a basic blow,
 * each tier a set of knob values merged into the move with its elements.
 */

export type RuneId = string;
export type RuneTier = 1 | 2 | 3 | 4 | 5;
export const RUNE_TIERS = 5;
/** Most sockets any move can hold (the rarity caps are at most this). */
export const MAX_SOCKETS = 3;

export interface RuneRef {
  id: RuneId;
  tier: RuneTier;
}

export type RuneFamily = 'shape' | 'tempo' | 'elemental' | 'sustain';
export const RUNE_FAMILIES: readonly RuneFamily[] = ['shape', 'tempo', 'elemental', 'sustain'];

export interface RuneFits {
  /** Ability forms it fits. */
  forms: FormId[];
  /** Weapon base ids whose basic blows it fits. */
  weapons: string[];
  /** The blow kinds it acts on (all when absent); on another kind it stays, dormant. */
  kinds?: MoveKind[];
}

export interface RuneDef {
  id: RuneId;
  name: string;
  icon: string;
  family: RuneFamily;
  fits: RuneFits;
  /** Knob values at tiers I..V (index tier − 1), the trade-off included. */
  tiers: KnobsData[];
  /** Templates filled by `runeText`: {path}, {path:%}, {path:±%}, {runes.key}. */
  effect: string;
  tradeoff: string | null;
}

/** Loose runes: rune id → counts by tier (index tier − 1). */
export type RunePouch = Record<RuneId, number[]>;

/** What a pull does: the rune is destroyed, or it costs scrap and goes back to the pouch. */
export type UnsocketMode = 'destroy' | 'pay';

/** For each chain, the saved move index each new move came from (null: a new move). */
export type ChainOrigins = Partial<Record<ChainSkill, (number | null)[]>>;

/** What a rune is socketed on: an ability move's form, or a basic blow on a weapon. */
export type RuneTarget =
  | { form: FormId }
  /** `explode`: the blow's row bursts (`ComboStepDef.explode > 0`), where `pierce` does nothing. */
  | { weapon: string | null; kind: MoveKind; explode?: boolean };
