import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { ArpgWorld, ReactionId } from '../types/arpg.js';
import type { DelveProfile, DiveState } from '../types/delve.js';
import type { GearItem, Rarity } from '../types/gear.js';
import { RARITY_ORDER, rarityIndex } from '../types/gem.js';
import { scrapLevelFactor, weightedPick } from '../loot/item-generator.js';
import { createFloorWorld, isBossFloor } from '../arpg/world.js';
import { computeHeroStats } from './hero-stats.js';
import { addLootToBag } from './profile.js';

export function isBossDepth(registry: DataRegistry, depth: number): boolean {
  return isBossFloor(registry, depth);
}

/** Depths a new dive may start from: 1, plus one past every boss you've beaten. */
export function startDepthOptions(_registry: DataRegistry, profile: DelveProfile): number[] {
  const set = new Set([1, ...profile.checkpoints.map((c) => c + 1)]);
  return [...set].sort((a, b) => a - b);
}

export function isDiveActive(profile: DelveProfile): boolean {
  return profile.dive !== null && (profile.dive.phase === 'fighting' || profile.dive.phase === 'choosing');
}

export function startDive(registry: DataRegistry, profile: DelveProfile, startDepth: number): DelveProfile {
  if (isDiveActive(profile)) throw new Error('A dive is already in progress');
  if (!startDepthOptions(registry, profile).includes(startDepth)) throw new Error(`Cannot start at depth ${startDepth}`);
  const bal = registry.getDelveBalance();
  const seed = new SeededRNG(profile.seed).fork(`dive:${profile.diveCount}`).nextInt(1, 0x7fffffff);
  const dive: DiveState = {
    seed,
    startDepth,
    depth: startDepth,
    heroHpFrac: 1,
    potions: bal.dive.potions,
    phoenixUsed: false,
    door: null,
    doorChoices: [],
    phase: 'fighting',
    bounty: 0,
    kills: 0,
    depthsCleared: 0,
    scrapEarned: 0,
    found: Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>,
    bestFind: null,
  };
  return {
    ...profile,
    dive,
    diveCount: profile.diveCount + 1,
    bestDepth: Math.max(profile.bestDepth, startDepth),
    stats: { ...profile.stats, dives: profile.stats.dives + 1 },
  };
}

function requireDive(profile: DelveProfile, phase?: DiveState['phase']): DiveState {
  const dive = profile.dive;
  if (!dive) throw new Error('No dive in progress');
  if (phase && dive.phase !== phase) throw new Error(`Dive is ${dive.phase}, expected ${phase}`);
  return dive;
}

/** Deterministic seed for the current floor (re-entering a floor replays it). */
export function floorSeed(dive: DiveState): number {
  return new SeededRNG(dive.seed).fork(`floor:${dive.depth}`).nextInt(1, 0x7fffffff);
}

/** Build the arena for the dive's current depth. */
export function beginFloor(registry: DataRegistry, profile: DelveProfile): ArpgWorld {
  const dive = requireDive(profile, 'fighting');
  const stats = computeHeroStats(profile.equipped, registry);
  const mods = dive.door?.mods ?? {};
  return createFloorWorld(registry, {
    depth: dive.depth,
    door: dive.door,
    stats,
    abilities: profile.abilities,
    heroHpFrac: dive.heroHpFrac,
    potions: dive.potions,
    phoenixAvailable: !dive.phoenixUsed,
    seed: floorSeed(dive),
    loot: {
      pity: profile.pity,
      nextUid: profile.nextUid,
      magicFind: stats.magicFind + (mods.magicFind ?? 0),
      legendaryBoost: stats.legendaries.lucky_charm ? 2 : 1,
      dropMult: mods.dropMult ?? 1,
      forceLegendary: !profile.firstBossLegendaryGiven,
    },
  });
}

function betterFind(a: GearItem | null, b: GearItem): GearItem {
  if (!a) return b;
  const ra = rarityIndex(a.rarity);
  const rb = rarityIndex(b.rarity);
  if (rb !== ra) return rb > ra ? b : a;
  return b.ilvl > a.ilvl ? b : a;
}

export interface BankResult {
  profile: DelveProfile;
  /** Items that went into the bag. */
  kept: GearItem[];
  /** Items melted by auto-salvage or a full bag. */
  salvaged: GearItem[];
  bagFull: boolean;
  newCodex: string[];
  newReactions: ReactionId[];
  scrap: number;
}

/**
 * Move everything the world collected since the last bank (items picked up,
 * scrap, kills, reactions discovered) into the profile. Call it whenever
 * pickups happen so new gear can be equipped mid-floor, and at floor end.
 */
export function bankWorld(registry: DataRegistry, profile: DelveProfile, world: ArpgWorld): BankResult {
  const dive = requireDive(profile);
  const pending = world.pending;
  const items = pending.items;
  const bagged = addLootToBag(registry, { ...profile, pity: world.loot.pity, nextUid: world.loot.nextUid }, items);
  let next = bagged.profile;

  const found = { ...dive.found };
  let bestFind = dive.bestFind;
  for (const item of items) {
    found[item.rarity]++;
    bestFind = betterFind(bestFind, item);
  }
  const newReactions = pending.reactions.filter((r) => !next.reactionsSeen.includes(r));
  const scrap = pending.scrap;

  next = {
    ...next,
    scrap: next.scrap + scrap,
    firstBossLegendaryGiven: next.firstBossLegendaryGiven || !world.loot.forceLegendary,
    reactionsSeen: [...next.reactionsSeen, ...newReactions],
    stats: {
      ...next.stats,
      kills: next.stats.kills + pending.kills,
      scrapEarned: next.stats.scrapEarned + scrap,
    },
    dive: {
      ...dive,
      kills: dive.kills + pending.kills,
      scrapEarned: dive.scrapEarned + scrap + bagged.scrap,
      potions: world.hero.potions,
      phoenixUsed: dive.phoenixUsed || world.hero.phoenixUsed,
      found,
      bestFind,
    },
  };
  world.pending = { items: [], scrap: 0, kills: 0, reactions: [] };

  return {
    profile: next,
    kept: bagged.kept,
    salvaged: bagged.salvaged,
    bagFull: bagged.bagFull,
    newCodex: bagged.newCodex,
    newReactions,
    scrap: scrap + bagged.scrap,
  };
}

function rollDoorChoices(registry: DataRegistry, dive: DiveState): string[] {
  const rng = new SeededRNG(dive.seed).fork(`doors:${dive.depth}`);
  const pool = registry.getDelveData().doors.slice();
  const count = Math.min(registry.getDelveBalance().dive.doorsOffered, pool.length);
  const picks: string[] = [];
  for (let i = 0; i < count; i++) {
    const door = weightedPick(pool, (d) => d.weight, rng);
    picks.push(door.id);
    pool.splice(pool.indexOf(door), 1);
  }
  return picks;
}

export interface FloorResult extends BankResult {
  bountyAdded: number;
  bossKilled: boolean;
}

/** The floor is cleared: bank loot, pay the depth bounty, heal, offer doors. */
export function completeFloor(registry: DataRegistry, profile: DelveProfile, world: ArpgWorld): FloorResult {
  const bal = registry.getDelveBalance();
  const banked = bankWorld(registry, profile, world);
  const dive = banked.profile.dive!;
  const mods = dive.door?.mods ?? {};
  const bossKilled = world.bossKilled;

  const bountyAdded = Math.round(
    bal.dive.bountyBase *
      scrapLevelFactor(registry, dive.depth) *
      Math.pow(bal.dive.bountyGrowth, dive.depthsCleared) *
      (mods.bountyMult ?? 1),
  );
  const hpFrac = Math.max(0, Math.min(1, world.hero.hp / world.hero.stats.maxHp));
  let nextDive: DiveState = {
    ...dive,
    bounty: dive.bounty + bountyAdded,
    depthsCleared: dive.depthsCleared + 1,
    heroHpFrac: Math.min(1, hpFrac + bal.dive.healOnDepthClear),
    potions: bossKilled ? Math.min(bal.dive.maxPotions, dive.potions + bal.dive.bossPotionReward) : dive.potions,
    phase: 'choosing',
  };
  nextDive = { ...nextDive, doorChoices: rollDoorChoices(registry, nextDive) };

  let checkpoints = banked.profile.checkpoints;
  if (bossKilled && !checkpoints.includes(dive.depth)) checkpoints = [...checkpoints, dive.depth].sort((a, b) => a - b);

  return {
    ...banked,
    profile: {
      ...banked.profile,
      checkpoints,
      dive: nextDive,
      stats: { ...banked.profile.stats, bossKills: banked.profile.stats.bossKills + (bossKilled ? 1 : 0) },
    },
    bountyAdded,
    bossKilled,
  };
}

/** The hero fell: keep whatever was picked up, lose the bounty. */
export function failFloor(registry: DataRegistry, profile: DelveProfile, world: ArpgWorld): BankResult {
  const banked = bankWorld(registry, profile, world);
  const dive = banked.profile.dive!;
  return {
    ...banked,
    profile: {
      ...banked.profile,
      dive: { ...dive, phase: 'dead', heroHpFrac: 0 },
      stats: { ...banked.profile.stats, deaths: banked.profile.stats.deaths + 1 },
    },
  };
}

/** Take one of the offered doors into the next depth. */
export function chooseDoor(registry: DataRegistry, profile: DelveProfile, doorId: string): DelveProfile {
  const bal = registry.getDelveBalance();
  const dive = requireDive(profile, 'choosing');
  if (!dive.doorChoices.includes(doorId)) throw new Error(`Door not offered: ${doorId}`);
  const door = registry.getDoor(doorId);
  const depth = dive.depth + 1 + (door.mods.skip ?? 0);
  return {
    ...profile,
    bestDepth: Math.max(profile.bestDepth, depth),
    dive: {
      ...dive,
      depth,
      heroHpFrac: door.mods.healFull ? 1 : dive.heroHpFrac,
      potions: Math.min(bal.dive.maxPotions, dive.potions + (door.mods.potions ?? 0)),
      door,
      doorChoices: [],
      phase: 'fighting',
    },
  };
}

/** Leave the depths alive and cash in the bounty. */
export function extractDive(_registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const dive = requireDive(profile, 'choosing');
  return {
    ...profile,
    scrap: profile.scrap + dive.bounty,
    dive: { ...dive, phase: 'extracted', scrapEarned: dive.scrapEarned + dive.bounty },
    stats: {
      ...profile.stats,
      extracts: profile.stats.extracts + 1,
      scrapEarned: profile.stats.scrapEarned + dive.bounty,
    },
  };
}

/** Clear the dive record (after the summary, or to abandon — the bounty is lost). */
export function closeDive(profile: DelveProfile): DelveProfile {
  return { ...profile, dive: null };
}

/** Drink a potion at the door screen (between floors). Null when nothing to heal. */
export function drinkPotionBetweenFloors(registry: DataRegistry, profile: DelveProfile): DelveProfile | null {
  const dive = profile.dive;
  if (!dive || dive.phase !== 'choosing' || dive.potions <= 0 || dive.heroHpFrac >= 1) return null;
  const heal = registry.getDelveBalance().dive.potionHeal;
  return { ...profile, dive: { ...dive, potions: dive.potions - 1, heroHpFrac: Math.min(1, dive.heroHpFrac + heal) } };
}

/** Life fraction the hero would enter the next floor with. */
export function heroMaxHp(registry: DataRegistry, profile: DelveProfile): number {
  return computeHeroStats(profile.equipped, registry).maxHp;
}
