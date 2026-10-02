import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { SalvageResult, SalvageYield } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem } from '../types/gear.js';

/**
 * What gear gives back (see the crafting spec's Salvage): every salvage path
 * goes through `applySalvage`. Stage 4c's B2 fills these; until then each throws.
 */

/** What salvaging `item` could give (the Loadout's preview). */
export function salvageYield(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _item: GearItem,
): SalvageYield {
  throw new Error('salvageYield: not implemented');
}

/**
 * Salvage one item, drawing on `rng` (keyed on the item: see the spec): mid-dive
 * its yield goes to the floor's haul, at the Anvil to the stockpile.
 */
export function applySalvage(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _item: GearItem,
  _rng: SeededRNG,
): SalvageResult {
  throw new Error('applySalvage: not implemented');
}
