import type { DataRegistry } from '../data/registry.js';
import type { Haul } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { Rarity } from '../types/gear.js';
import { runAutopilot, type AutopilotOptions } from './autopilot.js';

/** One dive of the economy sim (the DPS Lab's Economy view). */
export interface EconomyDive {
  dive: number;
  /** What the dive brought into the stockpile, after any loss: what it banked and kept, and an extract's bounty. */
  income: Haul;
  /** What the Anvil spent between this dive and the next: forging, refining, buying, Links, runes, honing, upgrades. */
  spent: Haul;
  /** What a death or an abandon lost: the floor's haul and the death share (null: nothing). */
  lost: Haul | null;
  /** Items forged on the Anvil visit after it, by rarity (every rarity, 0 where none). */
  forged: Record<Rarity, number>;
  /** The deepest depth reached. */
  depth: number;
  died: boolean;
}

export interface EconomyReport {
  seed: number;
  /** Exactly the dives asked for, in order. */
  dives: EconomyDive[];
  /** The profile after the last dive's Anvil visit. */
  profile: DelveProfile;
}

/**
 * The autopilot over `dives` dives from a new save (`opts`: its pair), the
 * economy dive by dive: the DPS Lab's Economy view and the pacing rails.
 * Plain data, so it crosses a worker's boundary.
 */
export function economySim(
  registry: DataRegistry,
  seed: number,
  dives: number,
  opts: Pick<AutopilotOptions, 'primary' | 'secondary'> = {},
): EconomyReport {
  const { profile, economy } = runAutopilot(registry, { seed, dives, ...opts });
  return { seed, dives: economy, profile };
}
