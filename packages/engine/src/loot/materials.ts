import type { DataRegistry } from '../data/registry.js';
import type { DelveProfile } from '../types/delve.js';
import {
  FLUX_GRADES,
  METAL_IDS,
  type FluxGrade,
  type Haul,
  type MaterialRef,
  type MaterialsPouch,
  type MetalDef,
  type MetalId,
  type ShardTierDef,
} from '../types/crafting.js';
import type { HeroStatKey } from '../types/gear.js';

/**
 * The materials (see the crafting spec): the data's lookups, the pouch and
 * haul ops every area shares, and refining.
 */

/** The metal whose band holds `ilvl` (below 1 counts as 1). */
export function metalAt(registry: DataRegistry, ilvl: number): MetalDef {
  // The bands run from 1 up and the last is open, so one always holds it.
  return registry
    .getCraftingData()
    .metals.find(({ band: [, hi] }) => hi === null || Math.max(1, ilvl) <= hi)!;
}

/** An affix's shard tiers: its own (`affixShardTiers`), else the default ones. */
export function shardTiersOf(registry: DataRegistry, stat: HeroStatKey): ShardTierDef[] {
  const data = registry.getCraftingData();
  return data.affixShardTiers[stat] ?? data.shardTiers;
}

// ── The pouch and the haul (shared by drops, banking, salvage and the forge) ──

/** An empty pouch: every metal and grade at 0, no shards or essences. */
export function emptyMaterials(): MaterialsPouch {
  return {
    metals: Object.fromEntries(METAL_IDS.map((m) => [m, 0])) as Record<MetalId, number>,
    flux: Object.fromEntries(FLUX_GRADES.map((g) => [g, 0])) as Record<FluxGrade, number>,
    shards: {},
    essences: {},
  };
}

/** An empty haul: no materials, scrap, Mana Dust, Links or runes. */
export function emptyHaul(): Haul {
  return { ...emptyMaterials(), scrap: 0, dust: 0, links: 0, runes: {} };
}

/** Counts by tier summed (a missing tier counts 0; the longer length is kept). */
function sumTiers(a: readonly number[] = [], b: readonly number[] = []): number[] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
}

/** `a` with each of `b`'s keys added in. */
function sumKeys<T>(
  a: Partial<Record<string, T>>,
  b: Partial<Record<string, T>>,
  add: (x: T | undefined, y: T) => T,
): Record<string, T> {
  const out = { ...a } as Record<string, T>;
  for (const [k, v] of Object.entries(b)) if (v !== undefined) out[k] = add(a[k], v);
  return out;
}

const plus = (x = 0, y = 0) => x + y;

/** `a` (a pouch or a haul, its other fields kept) with `b`'s materials added. */
export function addMaterials<P extends MaterialsPouch>(a: P, b: MaterialsPouch): P {
  return {
    ...a,
    metals: sumKeys(a.metals, b.metals, plus),
    flux: sumKeys(a.flux, b.flux, plus),
    shards: sumKeys(a.shards, b.shards, sumTiers),
    essences: sumKeys(a.essences, b.essences, plus),
  };
}

/** Two hauls summed: materials, scrap, Mana Dust, Links and runes. */
export function addHaul(a: Haul, b: Haul): Haul {
  return {
    ...addMaterials(a, b),
    scrap: a.scrap + b.scrap,
    dust: a.dust + b.dust,
    links: a.links + b.links,
    runes: sumKeys(a.runes, b.runes, sumTiers),
  };
}

/** `haul` with `amount` of one material added (a pickup, a salvaged shard or essence). */
export function addMaterial(haul: Haul, ref: MaterialRef, amount = 1): Haul {
  const one = emptyHaul();
  switch (ref.kind) {
    case 'metal':
      one.metals[ref.metal] = amount;
      break;
    case 'flux':
      one.flux[ref.grade] = amount;
      break;
    case 'shard':
      one.shards[ref.stat] = [...Array<number>(ref.tier - 1).fill(0), amount];
      break;
    case 'essence':
      one.essences[ref.essence] = amount;
      break;
    case 'dust':
      one.dust = amount;
      break;
    case 'links':
      one.links = amount;
      break;
  }
  return addHaul(haul, one);
}

/** `profile` with `haul` in its stockpile: materials, scrap (counted as earned), Mana Dust, Links and runes. */
export function stockHaul(profile: DelveProfile, haul: Haul): DelveProfile {
  return {
    ...profile,
    materials: addMaterials(profile.materials, haul),
    scrap: profile.scrap + haul.scrap,
    manaDust: profile.manaDust + haul.dust,
    links: profile.links + haul.links,
    runes: sumKeys(profile.runes, haul.runes, sumTiers),
    stats: { ...profile.stats, scrapEarned: profile.stats.scrapEarned + haul.scrap },
  };
}
