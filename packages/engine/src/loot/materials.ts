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

/** How many of `ref` the pouch holds (Mana Dust and Links live outside it: 0). */
export function materialCount(pouch: MaterialsPouch, ref: MaterialRef): number {
  switch (ref.kind) {
    case 'metal':
      return pouch.metals[ref.metal] ?? 0;
    case 'flux':
      return pouch.flux[ref.grade] ?? 0;
    case 'shard':
      return pouch.shards[ref.stat]?.[ref.tier - 1] ?? 0;
    case 'essence':
      return pouch.essences[ref.essence] ?? 0;
    default:
      return 0;
  }
}

/** `pouch` with `amount` of `ref` added (negative: taken). */
export function withMaterial<P extends MaterialsPouch>(
  pouch: P,
  ref: MaterialRef,
  amount: number,
): P {
  return addMaterials(pouch, addMaterial(emptyHaul(), ref, amount));
}

/** The next grade up of `what` (a metal, a flux or a shard), or null at the top, for an essence, Mana Dust or Links. */
export function refinedRef(registry: DataRegistry, what: MaterialRef): MaterialRef | null {
  const data = registry.getCraftingData();
  if (what.kind === 'metal') {
    const ids = data.metals.map((m) => m.id);
    const metal = ids[ids.indexOf(what.metal) + 1];
    return metal ? { kind: 'metal', metal } : null;
  }
  if (what.kind === 'flux') {
    const grades = data.flux.map((f) => f.grade);
    const grade = grades[grades.indexOf(what.grade) + 1];
    return grade ? { kind: 'flux', grade } : null;
  }
  if (what.kind === 'shard' && what.tier < shardTiersOf(registry, what.stat).length)
    return { kind: 'shard', stat: what.stat, tier: what.tier + 1 };
  return null;
}

/**
 * What refining `what` costs: `count` of it and `scrap` make one of the next
 * grade (see the crafting spec); null when it doesn't refine (the top grade, a
 * shard at its affix's last tier, an essence, Mana Dust or Links).
 */
export function refineCost(
  registry: DataRegistry,
  what: MaterialRef,
): { count: number; scrap: number } | null {
  if (!refinedRef(registry, what)) return null;
  const { refine } = registry.getDelveBalance().crafting;
  if (what.kind === 'shard')
    return { count: refine.shard.count, scrap: refine.shard.scrap[what.tier - 1] };
  return { ...(what.kind === 'metal' ? refine.metal : refine.flux) };
}
