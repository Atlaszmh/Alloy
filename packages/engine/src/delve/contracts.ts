import type { DataRegistry } from '../data/registry.js';
import type { DelveProfile } from '../types/delve.js';
import type { Contract } from '../types/quests.js';
import type { ProfileActionResult } from './profile.js';

/**
 * The Contract board (see the quests spec): `profile.quests.board`'s
 * contracts, generated from `quests.json → contractTemplates` on forks of the
 * profile seed (reloading never rerolls), refilled after a dive that cleared a
 * depth, one reroll an Anvil visit. No expiry.
 */

/**
 * The next contract, `contract:<boardCount>`, from a template and a tier
 * (`contracts.tierWeights`) drawn on `contract:<boardCount>` from the profile
 * seed, its filter filled with only what is possible for the hero, its count
 * from the tier's range and its rewards × (1 + depthScale × bestDepth); a
 * hard one may add an essence (`essence: 'fit'`) at `essenceChance`. The
 * caller moves `boardCount` on. Stub (B2).
 */
export function generateContract(_registry: DataRegistry, _profile: DelveProfile): Contract {
  throw new Error('generateContract: not implemented');
}

/**
 * Every empty slot filled (`generateContract` each), and the visit's reroll
 * back (`rerollUsed` false). `createDelveProfile`, and `settleDive` after a
 * dive that cleared a depth, call it while `contractTemplates` holds any.
 * Stub (B2).
 */
export function refillBoard(_registry: DataRegistry, _profile: DelveProfile): DelveProfile {
  throw new Error('refillBoard: not implemented');
}

/**
 * Slot `slot`'s contract replaced (`generateContract`) for `rerollScrap`, once
 * an Anvil visit; refused mid-dive, on an empty slot, or once the visit's
 * reroll is spent. The old contract's id leaves `tracked` and `seen`. Stub (B2).
 */
export function rerollContract(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _slot: number,
): ProfileActionResult {
  throw new Error('rerollContract: not implemented');
}
