import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type {
  DelveProfile,
  DiveState,
  FightEvent,
  FightState,
  MonsterInstance,
  MonsterKind,
} from '../types/delve.js';
import type { GearItem, Rarity } from '../types/gear.js';
import { RARITY_ORDER, rarityIndex } from '../types/gem.js';
import { rollEncounterDrops } from '../loot/drops.js';
import { scrapLevelFactor, weightedPick } from '../loot/item-generator.js';
import { createFight, healHeroInFight } from './combat.js';
import { computeHeroStats } from './hero-stats.js';
import { createMonster } from './monsters.js';
import { addLootToBag } from './profile.js';

export interface FightOutcome {
  victory: boolean;
  monster: MonsterInstance;
  /** Drops that landed in the bag. */
  drops: GearItem[];
  /** Drops melted by auto-salvage or a full bag. */
  salvaged: GearItem[];
  bagFull: boolean;
  /** Kill scrap + salvage scrap. */
  scrap: number;
  depthCleared: boolean;
  bossKilled: boolean;
  bountyAdded: number;
  /** Legendary ids seen for the first time. */
  newCodex: string[];
}

export function isBossDepth(registry: DataRegistry, depth: number): boolean {
  return depth % registry.getDelveBalance().dive.bossEvery === 0;
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
    encounterIndex: 0,
    encountersInDepth: bal.dive.fightsPerDepth,
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

/** Deterministic per-encounter RNG stream. */
function encounterRng(dive: DiveState, label: string): SeededRNG {
  return new SeededRNG(dive.seed).fork(`${label}:${dive.depth}:${dive.encounterIndex}`);
}

export function encounterKind(registry: DataRegistry, dive: DiveState): MonsterKind {
  if (isBossDepth(registry, dive.depth) && dive.encounterIndex === dive.encountersInDepth - 1) return 'boss';
  const chance = Math.max(registry.getDelveBalance().dive.eliteChance, dive.door?.mods.eliteChance ?? 0);
  return encounterRng(dive, 'kind').next() < chance ? 'elite' : 'normal';
}

function requireDive(profile: DelveProfile, phase?: DiveState['phase']): DiveState {
  const dive = profile.dive;
  if (!dive) throw new Error('No dive in progress');
  if (phase && dive.phase !== phase) throw new Error(`Dive is ${dive.phase}, expected ${phase}`);
  return dive;
}

export function currentMonster(registry: DataRegistry, profile: DelveProfile): MonsterInstance {
  const dive = requireDive(profile, 'fighting');
  return createMonster(
    registry,
    { depth: dive.depth, kind: encounterKind(registry, dive), door: dive.door },
    encounterRng(dive, 'monster'),
  );
}

/** Set up the current encounter. Re-calling yields the identical fight. */
export function beginFight(registry: DataRegistry, profile: DelveProfile): FightState {
  const dive = requireDive(profile, 'fighting');
  return createFight(
    registry,
    {
      hero: computeHeroStats(profile.equipped, registry),
      monster: currentMonster(registry, profile),
      heroHpFrac: dive.heroHpFrac,
      depth: dive.depth,
      phoenixAvailable: !dive.phoenixUsed,
    },
    encounterRng(dive, 'fight'),
  );
}

function rollDoorChoices(registry: DataRegistry, dive: DiveState): string[] {
  const rng = encounterRng(dive, 'doors');
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

function betterFind(a: GearItem | null, b: GearItem): GearItem {
  if (!a) return b;
  const ra = rarityIndex(a.rarity);
  const rb = rarityIndex(b.rarity);
  if (rb !== ra) return rb > ra ? b : a;
  return b.ilvl > a.ilvl ? b : a;
}

const KILL_SCRAP_MULT: Record<MonsterKind, number> = { normal: 1, elite: 3, boss: 10 };

/** Apply a finished fight to the profile: loot, scrap, progression, or death. */
export function resolveFight(
  registry: DataRegistry,
  profile: DelveProfile,
  fight: FightState,
): { profile: DelveProfile; outcome: FightOutcome } {
  if (!fight.over) throw new Error('Fight is not over');
  const bal = registry.getDelveBalance();
  const dive = requireDive(profile, 'fighting');
  const monster = fight.monster;
  const phoenixUsed = dive.phoenixUsed || fight.phoenixUsed;

  const baseOutcome: FightOutcome = {
    victory: fight.winner === 'hero',
    monster,
    drops: [],
    salvaged: [],
    bagFull: false,
    scrap: 0,
    depthCleared: false,
    bossKilled: false,
    bountyAdded: 0,
    newCodex: [],
  };

  if (fight.winner !== 'hero') {
    return {
      profile: {
        ...profile,
        dive: { ...dive, phase: 'dead', heroHpFrac: 0, phoenixUsed },
        stats: { ...profile.stats, deaths: profile.stats.deaths + 1 },
      },
      outcome: baseOutcome,
    };
  }

  const hero = fight.hero;
  const mods = dive.door?.mods ?? {};
  const forceLegendary = monster.kind === 'boss' && !profile.firstBossLegendaryGiven;
  const drops = rollEncounterDrops(
    registry,
    {
      depth: dive.depth,
      kind: monster.kind,
      magicFind: hero.magicFind + (mods.magicFind ?? 0),
      pity: profile.pity,
      dropMult: mods.dropMult ?? 1,
      legendaryBoost: hero.legendaries.lucky_charm ? 2 : 1,
      forceLegendary,
      nextUid: profile.nextUid,
    },
    encounterRng(dive, 'loot'),
  );

  const killScrap = Math.round(
    bal.loot.scrapPerKill *
      scrapLevelFactor(registry, dive.depth) *
      KILL_SCRAP_MULT[monster.kind] *
      (1 + hero.scrapFind / 100),
  );

  const bagged = addLootToBag(registry, { ...profile, pity: drops.pity, nextUid: drops.nextUid }, drops.items);
  let next = bagged.profile;
  const scrap = killScrap + bagged.scrap;

  const found = { ...dive.found };
  let bestFind = dive.bestFind;
  for (const item of drops.items) {
    found[item.rarity]++;
    bestFind = betterFind(bestFind, item);
  }

  let nextDive: DiveState = {
    ...dive,
    encounterIndex: dive.encounterIndex + 1,
    kills: dive.kills + 1,
    heroHpFrac: Math.max(0, Math.min(1, fight.heroHp / hero.maxHp)),
    phoenixUsed,
    scrapEarned: dive.scrapEarned + scrap,
    found,
    bestFind,
  };

  const bossKilled = monster.kind === 'boss';
  let checkpoints = next.checkpoints;
  let bossKills = next.stats.bossKills;
  if (bossKilled) {
    if (!checkpoints.includes(dive.depth)) checkpoints = [...checkpoints, dive.depth].sort((a, b) => a - b);
    bossKills++;
    nextDive = { ...nextDive, potions: Math.min(bal.dive.maxPotions, nextDive.potions + bal.dive.bossPotionReward) };
  }

  let bountyAdded = 0;
  const depthCleared = nextDive.encounterIndex >= nextDive.encountersInDepth;
  if (depthCleared) {
    bountyAdded = Math.round(
      bal.dive.bountyBase *
        scrapLevelFactor(registry, dive.depth) *
        Math.pow(bal.dive.bountyGrowth, dive.depthsCleared) *
        (mods.bountyMult ?? 1),
    );
    nextDive = {
      ...nextDive,
      bounty: nextDive.bounty + bountyAdded,
      depthsCleared: nextDive.depthsCleared + 1,
      heroHpFrac: Math.min(1, nextDive.heroHpFrac + bal.dive.healOnDepthClear),
      phase: 'choosing',
    };
    nextDive = { ...nextDive, doorChoices: rollDoorChoices(registry, nextDive) };
  }

  next = {
    ...next,
    scrap: next.scrap + killScrap,
    checkpoints,
    firstBossLegendaryGiven: next.firstBossLegendaryGiven || forceLegendary,
    dive: nextDive,
    stats: {
      ...next.stats,
      kills: next.stats.kills + 1,
      bossKills,
      scrapEarned: next.stats.scrapEarned + killScrap,
    },
  };

  return {
    profile: next,
    outcome: {
      ...baseOutcome,
      drops: bagged.kept,
      salvaged: bagged.salvaged,
      bagFull: bagged.bagFull,
      scrap,
      depthCleared,
      bossKilled,
      bountyAdded,
      newCodex: bagged.newCodex,
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
      encounterIndex: 0,
      encountersInDepth: door.mods.fights ?? bal.dive.fightsPerDepth,
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

/**
 * Drink a potion. Mid-fight it heals the live fight (mutating it); between
 * fights it heals the stored life fraction. Returns a null event when there
 * is nothing to heal or no potion left.
 */
export function drinkPotion(
  registry: DataRegistry,
  profile: DelveProfile,
  fight: FightState | null,
): { profile: DelveProfile; event: FightEvent | null } {
  const bal = registry.getDelveBalance();
  const dive = profile.dive;
  if (!dive || !isDiveActive(profile) || dive.potions <= 0) return { profile, event: null };

  if (fight && !fight.over) {
    const event = healHeroInFight(fight, bal.dive.potionHeal);
    if (!event) return { profile, event: null };
    return {
      profile: { ...profile, dive: { ...dive, potions: dive.potions - 1, heroHpFrac: fight.heroHp / fight.hero.maxHp } },
      event,
    };
  }

  if (dive.heroHpFrac >= 1) return { profile, event: null };
  const frac = Math.min(1, dive.heroHpFrac + bal.dive.potionHeal);
  const maxHp = computeHeroStats(profile.equipped, registry).maxHp;
  return {
    profile: { ...profile, dive: { ...dive, potions: dive.potions - 1, heroHpFrac: frac } },
    event: { kind: 'heal', t: 0, target: 'hero', amount: (frac - dive.heroHpFrac) * maxHp, source: 'potion' },
  };
}
