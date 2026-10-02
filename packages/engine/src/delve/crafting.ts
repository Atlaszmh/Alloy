import type { DataRegistry } from '../data/registry.js';
import type { ForgeRequest, MaterialRef, ShardRef } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { HeroStatKey } from '../types/gear.js';
import type { ProfileActionResult } from './profile.js';

/**
 * The Anvil's crafting ops on the profile (see the crafting spec), each refused
 * mid-dive (the dive lock) with a reason, as the other profile ops are. Stage
 * 4c's B2 fills these; until then each throws.
 */

/** Forge `req` into the bag, paying its price and consuming its materials (`ProfileActionResult.item`). */
export function forge(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _req: ForgeRequest,
): ProfileActionResult {
  throw new Error('forge: not implemented');
}

/** Hone affix line `line` of item `uid`, for scrap. */
export function hone(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _uid: string,
  _line: number,
): ProfileActionResult {
  throw new Error('hone: not implemented');
}

/** Imprint `shard` on affix line `line` of item `uid`, for the shard and scrap. */
export function imprint(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _uid: string,
  _line: number,
  _shard: ShardRef,
): ProfileActionResult {
  throw new Error('imprint: not implemented');
}

/** Refine `refine.<kind>.count` of a bar, a flux or a shard into one of the next grade, for scrap. */
export function refine(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _what: MaterialRef,
): ProfileActionResult {
  throw new Error('refine: not implemented');
}

/** Buy a tier I shard of `stat` at the shard bench (`crafting.shardBench`). */
export function buyShard(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _stat: HeroStatKey,
): ProfileActionResult {
  throw new Error('buyShard: not implemented');
}
