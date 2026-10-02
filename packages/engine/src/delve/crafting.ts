import type { DataRegistry } from '../data/registry.js';
import { forgeInputs, forgeItem, previewForge } from '../loot/forge.js';
import { materialCount, refineCost, refinedRef, withMaterial } from '../loot/materials.js';
import type { ForgeRequest, MaterialRef, ShardRef } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { HeroStatKey } from '../types/gear.js';
import { isDiveActive } from './dive.js';
import { forgeRng, recordFinds, type ProfileActionResult } from './profile.js';

/**
 * The Anvil's crafting ops on the profile (see the crafting spec), each refused
 * mid-dive (the dive lock) with a reason, as the other profile ops are. Each
 * op that rolls draws on `forge:${forgeCount}` and moves the count on.
 */

const FORGE_LOCKED = 'Forge at the Anvil, between dives';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/** Forge `req` into the bag, paying its price and consuming its materials (`ProfileActionResult.item`). */
export function forge(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
): ProfileActionResult {
  const preview = previewForge(registry, profile, req);
  if (preview.refused) return refuse(profile, preview.refused.reason);
  const item = forgeItem(registry, profile, req, forgeRng(profile));
  const materials = forgeInputs(req).reduce(
    (m, ref) => withMaterial(m, ref, -1),
    profile.materials,
  );
  const paid: DelveProfile = {
    ...profile,
    materials,
    scrap: profile.scrap - preview.price.scrap,
    manaDust: profile.manaDust - preview.price.dust,
    bag: [...profile.bag, item],
    nextUid: profile.nextUid + 1,
    forgeCount: profile.forgeCount + 1,
  };
  return { ok: true, item, profile: recordFinds(paid, [item]).profile };
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
  registry: DataRegistry,
  profile: DelveProfile,
  what: MaterialRef,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
  const next = refinedRef(registry, what);
  if (!next) return refuse(profile, "Doesn't refine any higher");
  const cost = refineCost(registry, what)!;
  if (materialCount(profile.materials, what) < cost.count)
    return refuse(profile, `Needs ${cost.count} to refine`);
  if (profile.scrap < cost.scrap) return refuse(profile, 'Not enough scrap');
  return {
    ok: true,
    profile: {
      ...profile,
      materials: withMaterial(withMaterial(profile.materials, what, -cost.count), next, 1),
      scrap: profile.scrap - cost.scrap,
    },
  };
}

/** Buy a tier I shard of `stat` at the shard bench (`crafting.shardBench`). */
export function buyShard(
  registry: DataRegistry,
  profile: DelveProfile,
  stat: HeroStatKey,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
  if (!registry.getGearAffix(stat)) return refuse(profile, 'No such affix');
  const price = registry.getDelveBalance().crafting.shardBench;
  if (profile.scrap < price.scrap) return refuse(profile, 'Not enough scrap');
  if (profile.manaDust < price.dust) return refuse(profile, 'Not enough Mana Dust');
  return {
    ok: true,
    profile: {
      ...profile,
      materials: withMaterial(profile.materials, { kind: 'shard', stat, tier: 1 }, 1),
      scrap: profile.scrap - price.scrap,
      manaDust: profile.manaDust - price.dust,
    },
  };
}
