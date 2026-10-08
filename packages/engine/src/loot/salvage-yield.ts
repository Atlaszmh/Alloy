import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { SalvageResult, SalvageYield, ShardRef } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem, HeroStatKey } from '../types/gear.js';
import { isDiveActive } from '../delve/dive.js';
import { salvageDust } from '../delve/pair.js';
import { applyQuestEvents } from '../delve/quests.js';
import { settleParts, type SetChainsOptions } from '../delve/runes.js';
import { addHaul, addMaterial, emptyHaul, shardTiersOf, stockHaul } from './materials.js';
import { weaponParts } from './moveset.js';
import { salvageValue } from './smithing.js';

/**
 * What gear gives back (see the crafting spec's Salvage): every salvage path
 * goes through `applySalvage`.
 */

/**
 * A salvaged line's shard tier: 1 + the `salvageShardTier` thresholds its roll
 * reaches, but never past the highest of its affix's own tiers whose band holds
 * the roll, so an imprinted line can't salvage above its shard.
 */
function salvageTier(registry: DataRegistry, stat: HeroStatKey, roll: number): number {
  const passed = registry
    .getDelveBalance()
    .crafting.salvageShardTier.filter((t) => roll >= t).length;
  const held = shardTiersOf(registry, stat).filter((t) => t.min <= roll).length;
  return Math.max(1, Math.min(1 + passed, held));
}

/**
 * What salvaging `item` could give (the Loadout's preview). A weapon's Links
 * are one per bought slot (`weaponParts`; the constructs spec §3.3): free extra
 * slots and open sockets give nothing, so forging or finding a weapon and
 * melting it mints no Links.
 */
export function salvageYield(
  registry: DataRegistry,
  profile: DelveProfile,
  item: GearItem,
): SalvageYield {
  const parts = weaponParts(registry, item);
  const essence = item.legendary?.id ?? null;
  const shards: ShardRef[] = essence
    ? []
    : item.affixes
        .filter((a) => registry.getGearAffix(a.stat))
        .map((a) => ({ stat: a.stat, tier: salvageTier(registry, a.stat, a.roll) }));
  return {
    scrap: salvageValue(registry, item),
    dust: salvageDust(registry, item, profile.pair),
    links: parts.links,
    shards,
    extraShard: shards.length > 1 ? registry.getDelveBalance().crafting.salvageExtraShard : 0,
    pattern: profile.patterns.includes(item.baseId) ? null : item.baseId,
    essence,
    runes: parts.runes,
    // B2 sends them to the bag; in Phase A they leave with the weapon as before.
    constructs: [],
  };
}

/**
 * The stream one salvage draws on, keyed on the item (see the crafting spec):
 * mid-dive the dive seed's `salvage:<uid>`, at the Anvil the profile seed's
 * `salvage:<forgeCount>:<uid>` (the caller moves `forgeCount` on).
 */
export function salvageRng(profile: DelveProfile, item: GearItem): SeededRNG {
  return isDiveActive(profile)
    ? new SeededRNG(profile.dive!.seed).fork(`salvage:${item.uid}`)
    : new SeededRNG(profile.seed).fork(`salvage:${profile.forgeCount}:${item.uid}`);
}

/**
 * Salvage one item, drawing on `rng` (keyed on the item: `salvageRng`): scrap,
 * one of its lines' shards and maybe a second (a legendary its essence
 * instead), Mana Dust off the pair, a weapon's Links and its runes by the parts
 * rule (`opts.unsocket`, else the balance's). Mid-dive the yield goes to the
 * floor's haul (`dive.haul`), at the Anvil to the stockpile; its pattern is
 * learned and its essence seen at once. The item itself is the caller's to remove.
 */
export function applySalvage(
  registry: DataRegistry,
  profile: DelveProfile,
  item: GearItem,
  rng: SeededRNG,
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): SalvageResult {
  const y = salvageYield(registry, profile, item);
  const shards: ShardRef[] = [];
  if (y.shards.length > 0) {
    const first = rng.nextInt(0, y.shards.length - 1);
    shards.push(y.shards[first]);
    if (rng.next() < y.extraShard) {
      const rest = y.shards.filter((_, i) => i !== first);
      shards.push(rest[rng.nextInt(0, rest.length - 1)]);
    }
  }
  const settled = settleParts(registry, {}, y.runes, opts.unsocket);
  let haul = { ...emptyHaul(), scrap: y.scrap, dust: y.dust, links: y.links, runes: settled.pouch };
  for (const s of shards) haul = addMaterial(haul, { kind: 'shard', ...s });
  if (y.essence) haul = addMaterial(haul, { kind: 'essence', essence: y.essence });
  let learned = y.pattern ? { ...profile, patterns: [...profile.patterns, y.pattern] } : profile;
  if (y.essence && !learned.essencesSeen.includes(y.essence))
    learned = { ...learned, essencesSeen: [...learned.essencesSeen, y.essence] };
  // A pattern learned is a quest state (`knowPatterns`): read it again.
  if (y.pattern) learned = applyQuestEvents(registry, learned, []);
  const dive = profile.dive;
  return {
    profile:
      dive && isDiveActive(profile)
        ? { ...learned, dive: { ...dive, haul: addHaul(dive.haul, haul) } }
        : stockHaul(learned, haul),
    scrap: y.scrap,
    dust: y.dust,
    links: y.links,
    shards,
    pattern: y.pattern,
    essence: y.essence,
    runes: settled.runes,
    destroyed: settled.destroyed,
    constructs: [],
  };
}
