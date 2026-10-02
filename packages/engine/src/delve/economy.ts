import type { DataRegistry } from '../data/registry.js';
import type { Haul } from '../types/crafting.js';
import type { Rarity } from '../types/gear.js';

/** One dive of the economy sim (the DPS Lab's Economy view). */
export interface EconomyDive {
  dive: number;
  /** What the dive brought home, per material and currency. */
  income: Haul;
  /** What the Anvil spent between dives: forging, honing, refining, buying. */
  spent: Haul;
  /** Items forged, by rarity. */
  forged: Record<Rarity, number>;
  /** The deepest depth reached. */
  depth: number;
  died: boolean;
}

export interface EconomyReport {
  seed: number;
  dives: EconomyDive[];
}

/**
 * The autopilot over `dives` dives from a new save, reporting the economy dive
 * by dive (see the crafting spec's Economy view; the pacing rails call it too).
 * Stage 4c's B3 fills it; until then it throws.
 */
export function economySim(_registry: DataRegistry, _seed: number, _dives: number): EconomyReport {
  throw new Error('economySim: not implemented');
}
