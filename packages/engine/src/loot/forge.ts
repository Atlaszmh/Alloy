import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { ForgePreview, ForgeRequest, ShardRef } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { inPair, profileStats } from '../delve/pair.js';

/**
 * Forging and the Temper sinks on an item (see the crafting spec): the forge's
 * preview and roll, Hone and Imprint, their prices, and the band and floor
 * math. `forgeItem` rolls exactly what `previewForge` shows.
 */

/**
 * The attunement floor on an item of `element` (see the crafting spec's roll
 * formula): in the hero's pair, min(cap, perPoint × the hero's attunement in
 * it); outside it, 0.
 */
export function rollFloor(
  registry: DataRegistry,
  profile: DelveProfile,
  element: ManaType,
): number {
  if (!inPair(profile, element)) return 0;
  const { perPoint, cap } = registry.getDelveBalance().crafting.attuneRoll;
  return Math.min(cap, perPoint * profileStats(registry, profile).attunement[element]);
}

/** Everything `forgeItem` would make but the random draws, and why it refuses (if it does). */
export function previewForge(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _req: ForgeRequest,
): ForgePreview {
  throw new Error('previewForge: not implemented');
}

/** The forged item, rolled on `rng` (`forge:${forgeCount}`); throws where the preview refuses. */
export function forgeItem(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _req: ForgeRequest,
  _rng: SeededRNG,
): GearItem {
  throw new Error('forgeItem: not implemented');
}

/** `item` with affix line `line` rerolled within its band, the attunement floor applied; `hones` + 1. */
export function honeLine(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _item: GearItem,
  _line: number,
  _rng: SeededRNG,
): GearItem {
  throw new Error('honeLine: not implemented');
}

/** `item` with affix line `line` replaced by `shard`'s affix, rolled in the shard's band. */
export function imprintLine(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _item: GearItem,
  _line: number,
  _shard: ShardRef,
  _rng: SeededRNG,
): GearItem {
  throw new Error('imprintLine: not implemented');
}

/** Scrap the next hone of `item` costs. */
export function honeCost(_registry: DataRegistry, _item: GearItem): number {
  throw new Error('honeCost: not implemented');
}

/** Scrap an imprint on `item` costs, besides the shard. */
export function imprintCost(_registry: DataRegistry, _item: GearItem): number {
  throw new Error('imprintCost: not implemented');
}
