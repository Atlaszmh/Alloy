import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { ArpgWorld, ReactionId } from '../types/arpg.js';
import type { RuneRef } from '../types/rune.js';
import type { DelveProfile, DiveState } from '../types/delve.js';
import type { Haul, SettleOutcome } from '../types/crafting.js';
import type { GearItem, Rarity } from '../types/gear.js';
import { RARITY_ORDER, rarityIndex } from '../types/gear.js';
import { scrapLevelFactor, weightedPick } from '../loot/item-generator.js';
import { createFloorWorld, emptyPending, isBossFloor } from '../arpg/world.js';
import { profileStats } from './pair.js';
import { heroChains } from '../loot/moveset.js';
import { rollStop } from './stops.js';
import { pairElements } from './hero-stats.js';
import { addLootToBag } from './profile.js';
import { addToPouch } from '../loot/runes.js';
import { addHaul, emptyHaul, stockHaul } from '../loot/materials.js';
import { stochasticRound } from '../loot/drops.js';
import type { SetChainsOptions } from './runes.js';
import { refillBoard } from './contracts.js';
import { applyQuestEvents, resetDiveQuests } from './quests.js';
import type { QuestEvent } from '../types/quests.js';

export function isBossDepth(registry: DataRegistry, depth: number): boolean {
  return isBossFloor(registry, depth);
}

/** Depths a new dive may start from: 1, plus one past every boss you've beaten. */
export function startDepthOptions(_registry: DataRegistry, profile: DelveProfile): number[] {
  const set = new Set([1, ...profile.checkpoints.map((c) => c + 1)]);
  return [...set].sort((a, b) => a - b);
}

/** A dive under way: fighting or choosing, and not settled (an abandon settles a dive where it stands). */
export function isDiveActive(profile: DelveProfile): boolean {
  const dive = profile.dive;
  return dive !== null && !dive.settled && (dive.phase === 'fighting' || dive.phase === 'choosing');
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
    dustEarned: 0,
    linksEarned: 0,
    runesEarned: 0,
    stop: null,
    haul: emptyHaul(),
    banked: emptyHaul(),
    lost: null,
    settled: false,
    dropsGiven: [],
    found: Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>,
    bestFind: null,
    used: [],
    diveBuffs: [],
  };
  const started: DelveProfile = {
    ...profile,
    dive,
    diveCount: profile.diveCount + 1,
    bestDepth: Math.max(profile.bestDepth, startDepth),
    stats: { ...profile.stats, dives: profile.stats.dives + 1 },
  };
  // A dive's dive-scoped objectives start afresh, and it enters its first depth (see the quests spec).
  return applyQuestEvents(registry, resetDiveQuests(registry, started), [{ type: 'reachDepth', depth: startDepth }]);
}

/** The dive; with `phase`, one in that phase and not settled (a settled dive goes nowhere). */
function requireDive(profile: DelveProfile, phase?: DiveState['phase']): DiveState {
  const dive = profile.dive;
  if (!dive) throw new Error('No dive in progress');
  if (phase && dive.phase !== phase) throw new Error(`Dive is ${dive.phase}, expected ${phase}`);
  if (phase && dive.settled) throw new Error('The dive has settled');
  return dive;
}

/** Deterministic seed for the current floor (re-entering a floor replays it). */
export function floorSeed(dive: DiveState): number {
  return new SeededRNG(dive.seed).fork(`floor:${dive.depth}`).nextInt(1, 0x7fffffff);
}

/** Build the arena for the dive's current depth: a generated floor, with what the dive used and its blessings. */
export function beginFloor(registry: DataRegistry, profile: DelveProfile): ArpgWorld {
  const dive = requireDive(profile, 'fighting');
  const stats = profileStats(registry, profile);
  const mods = dive.door?.mods ?? {};
  return createFloorWorld(registry, {
    depth: dive.depth,
    door: dive.door,
    stats,
    chains: heroChains(registry, profile.equipped, profile.pair),
    heroHpFrac: dive.heroHpFrac,
    potions: dive.potions,
    phoenixAvailable: !dive.phoenixUsed,
    seed: floorSeed(dive),
    layout: 'generated',
    used: [...dive.used],
    diveBuffs: [...dive.diveBuffs],
    loot: {
      nextUid: profile.nextUid,
      find: stats.magicFind + (mods.find ?? 0),
      legendaryBoost: stats.legendaries.lucky_charm ? 2 : 1,
      firstEssence: !profile.firstEssenceGiven,
      patterns: [...profile.patterns],
      dropsGiven: [...dive.dropsGiven],
      pair: pairElements(profile.pair),
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
  /** Mana Dust from items melted by auto-salvage or a full bag. */
  dust: number;
  /** Links from weapons melted by auto-salvage or a full bag. */
  links: number;
  /** Runes picked up, into the floor's haul (see the runes spec). */
  runes: RuneRef[];
  /** Patterns picked up and learned (see the crafting spec). */
  patterns: string[];
}

/**
 * Move everything the world collected since the last bank into the profile
 * (see the crafting spec's banking): gear into the bag, patterns learned and
 * essences seen at once, kills and reactions discovered; materials, scrap,
 * Mana Dust, Links and runes into the floor's haul (`dive.haul`), which a
 * cleared floor banks. Call it whenever pickups happen so new gear can be
 * equipped mid-floor, and at floor end. Auto-salvaged weapons' runes follow the
 * parts rule (`opts.unsocket`, else the balance's). A world's first bank starts
 * the haul afresh (`WorldPending.newFloor`). Its quest events apply then, after
 * what it learned (`applyQuestEvents`), so progress counts at every bank,
 * whatever follows (see the quests spec).
 */
export function bankWorld(
  registry: DataRegistry,
  profile: DelveProfile,
  world: ArpgWorld,
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): BankResult {
  const pending = world.pending;
  const start = requireDive(profile);
  const items = pending.items;
  const runes = pending.runes;
  const bagged = addLootToBag(
    registry,
    {
      ...profile,
      nextUid: world.loot.nextUid,
      dive: pending.newFloor ? { ...start, haul: emptyHaul() } : start,
    },
    items,
    opts,
  );
  let next = bagged.profile;
  // Auto-salvage mid-dive may have put yields in the haul: take the dive after it.
  const dive = next.dive!;

  const found = { ...dive.found };
  let bestFind = dive.bestFind;
  for (const item of items) {
    found[item.rarity]++;
    bestFind = betterFind(bestFind, item);
  }
  const newReactions = pending.reactions.filter((r) => !next.reactionsSeen.includes(r));
  const scrap = pending.scrap;
  const picked: Haul = { ...pending.haul, scrap, runes: addToPouch({}, runes) };
  const patterns = [...new Set(pending.patterns)].filter((id) => !next.patterns.includes(id));
  const essences = Object.keys(picked.essences).filter((id) => !next.essencesSeen.includes(id));

  next = {
    ...next,
    patterns: [...next.patterns, ...patterns],
    essencesSeen: [...next.essencesSeen, ...essences],
    reactionsSeen: [...next.reactionsSeen, ...newReactions],
    stats: { ...next.stats, kills: next.stats.kills + pending.kills },
    dive: {
      ...dive,
      haul: addHaul(dive.haul, picked),
      kills: dive.kills + pending.kills,
      scrapEarned: dive.scrapEarned + scrap + bagged.scrap,
      dustEarned: dive.dustEarned + bagged.dust + picked.dust,
      linksEarned: dive.linksEarned + bagged.links + picked.links,
      runesEarned: dive.runesEarned + runes.length,
      potions: world.hero.potions,
      phoenixUsed: dive.phoenixUsed || world.hero.phoenixUsed,
      dropsGiven: [...world.loot.dropsGiven],
      used: [...dive.used, ...pending.used],
      diveBuffs: [...dive.diveBuffs, ...pending.diveBuffs],
      found,
      bestFind,
    },
  };
  next = applyQuestEvents(registry, next, pending.questEvents);
  world.pending = emptyPending();

  return {
    profile: next,
    kept: bagged.kept,
    salvaged: bagged.salvaged,
    bagFull: bagged.bagFull,
    newCodex: bagged.newCodex,
    newReactions,
    scrap: scrap + bagged.scrap,
    dust: bagged.dust,
    links: bagged.links,
    runes,
    patterns,
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

/**
 * The floor is cleared: bank loot (`bankWorld`, with `opts`) and the floor's haul
 * into `dive.banked`, pay the depth bounty, heal, offer doors. The first boss's
 * guaranteed essence counts as given once the haul holding it banks here
 * (`ArpgWorld.firstEssenceTaken`).
 */
export function completeFloor(
  registry: DataRegistry,
  profile: DelveProfile,
  world: ArpgWorld,
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): FloorResult {
  const bal = registry.getDelveBalance();
  requireDive(profile, 'fighting');
  const banked = bankWorld(registry, profile, world, opts);
  const dive = banked.profile.dive!;
  const mods = dive.door?.mods ?? {};
  const bossKilled = world.bossKilled;
  // The guaranteed essence itself, picked up this floor: another essence in the haul doesn't count.
  const essenceBanked = world.firstEssenceTaken;

  const bountyAdded = Math.round(
    bal.dive.bountyBase *
      scrapLevelFactor(registry, dive.depth) *
      Math.pow(bal.dive.bountyGrowth, dive.depthsCleared) *
      (mods.bountyMult ?? 1),
  );
  const hpFrac = Math.max(0, Math.min(1, world.hero.hp / world.hero.stats.maxHp));
  let nextDive: DiveState = {
    ...dive,
    haul: emptyHaul(),
    banked: addHaul(dive.banked, dive.haul),
    bounty: dive.bounty + bountyAdded,
    depthsCleared: dive.depthsCleared + 1,
    heroHpFrac: Math.min(1, hpFrac + bal.dive.healOnDepthClear),
    potions: bossKilled ? Math.min(bal.dive.maxPotions, dive.potions + bal.dive.bossPotionReward) : dive.potions,
    phase: 'choosing',
  };
  nextDive = {
    ...nextDive,
    doorChoices: rollDoorChoices(registry, nextDive),
    stop: rollStop(registry, banked.profile, nextDive),
  };

  let checkpoints = banked.profile.checkpoints;
  if (bossKilled && !checkpoints.includes(dive.depth)) checkpoints = [...checkpoints, dive.depth].sort((a, b) => a - b);

  const cleared: DelveProfile = {
    ...banked.profile,
    firstEssenceGiven: banked.profile.firstEssenceGiven || essenceBanked,
    checkpoints,
    dive: nextDive,
    stats: { ...banked.profile.stats, bossKills: banked.profile.stats.bossKills + (bossKilled ? 1 : 0) },
  };
  // The floor's quest events: a boss counts here, once a floor, never as a kill (the quests spec's S4).
  // A generated floor counts its cleared rooms (the open room clears whole).
  const rooms = world.map.open ? {} : { roomsCleared: world.map.rooms.filter((r) => r.cleared).length };
  const events: QuestEvent[] = [
    { type: 'clearFloor', biome: world.biomeId, depth: dive.depth, noPotion: !world.potionDrunk, noDamage: !world.hurt, ...rooms },
  ];
  if (bossKilled) events.push({ type: 'boss', biome: world.biomeId });

  return {
    ...banked,
    profile: applyQuestEvents(registry, cleared, events),
    bountyAdded,
    bossKilled,
  };
}

/**
 * The hero fell: bank the floor (`bankWorld`, with `opts`: its gear is kept), lose
 * the bounty, and settle the dive as a death (`settleDive`).
 */
export function failFloor(
  registry: DataRegistry,
  profile: DelveProfile,
  world: ArpgWorld,
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): BankResult {
  const banked = bankWorld(registry, profile, world, opts);
  const dive = banked.profile.dive!;
  const dead: DelveProfile = {
    ...banked.profile,
    dive: { ...dive, phase: 'dead', heroHpFrac: 0 },
    stats: { ...banked.profile.stats, deaths: banked.profile.stats.deaths + 1 },
  };
  return { ...banked, profile: settleDive(registry, dead, 'death') };
}

/** Take one of the offered doors into the next depth. */
export function chooseDoor(registry: DataRegistry, profile: DelveProfile, doorId: string): DelveProfile {
  const bal = registry.getDelveBalance();
  const dive = requireDive(profile, 'choosing');
  if (!dive.doorChoices.includes(doorId)) throw new Error(`Door not offered: ${doorId}`);
  const door = registry.getDoor(doorId);
  const depth = dive.depth + 1 + (door.mods.skip ?? 0);
  const entered: DelveProfile = {
    ...profile,
    bestDepth: Math.max(profile.bestDepth, depth),
    dive: {
      ...dive,
      depth,
      heroHpFrac: door.mods.healFull ? 1 : dive.heroHpFrac,
      potions: Math.min(bal.dive.maxPotions, dive.potions + (door.mods.potions ?? 0)),
      door,
      doorChoices: [],
      stop: null,
      dropsGiven: [],
      phase: 'fighting',
    },
  };
  return applyQuestEvents(registry, entered, [{ type: 'reachDepth', depth }]);
}

/** Leave the depths alive, cash in the bounty and settle what the dive banked (`settleDive`). */
export function extractDive(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const dive = requireDive(profile, 'choosing');
  const extracted: DelveProfile = {
    ...profile,
    scrap: profile.scrap + dive.bounty,
    dive: { ...dive, phase: 'extracted', scrapEarned: dive.scrapEarned + dive.bounty },
    stats: {
      ...profile.stats,
      extracts: profile.stats.extracts + 1,
      scrapEarned: profile.stats.scrapEarned + dive.bounty,
    },
  };
  // The extract counts before the settle, so the board's refill there comes after it.
  return settleDive(registry, applyQuestEvents(registry, extracted, [{ type: 'extract', depth: dive.depth }]), 'extract');
}

/** `haul` with each count passed through `f`, in a fixed order (its essences left out). */
function mapCounts(haul: Haul, f: (n: number) => number): Haul {
  const counts = (rec: Record<string, number>) =>
    Object.fromEntries(Object.keys(rec).sort().map((k) => [k, f(rec[k])]));
  const tiers = (rec: Partial<Record<string, number[]>>) =>
    Object.fromEntries(Object.keys(rec).sort().map((k) => [k, rec[k]!.map(f)]));
  return {
    metals: counts(haul.metals) as Haul['metals'],
    flux: counts(haul.flux) as Haul['flux'],
    shards: tiers(haul.shards),
    essences: {},
    scrap: f(haul.scrap),
    dust: f(haul.dust),
    links: f(haul.links),
    runes: tiers(haul.runes),
  };
}

/**
 * The one path from a dive's `banked` haul into the stockpile, once a dive
 * (`dive.settled`; see the crafting spec's banking): an extract keeps it all; a
 * death or an abandon loses the floor's haul and `crafting.deathLoss` of
 * `banked` (each entry rounded stochastically on `death:${seed}`, banked
 * essences exempt), recorded in `dive.lost`; `banked` keeps what reached the
 * stockpile. `extractDive`, `failFloor` and `closeDive` call it; it leaves the
 * dive's phase alone.
 */
export function settleDive(registry: DataRegistry, profile: DelveProfile, outcome: SettleOutcome): DelveProfile {
  const dive = requireDive(profile);
  if (dive.settled) return profile;
  let kept = dive.banked;
  let lost: Haul | null = null;
  if (outcome !== 'extract') {
    const loss = registry.getDelveBalance().crafting.deathLoss;
    const rng = new SeededRNG(profile.seed).fork(`death:${dive.seed}`);
    const share = mapCounts(dive.banked, (n) => stochasticRound(n * loss, rng));
    kept = addHaul(dive.banked, mapCounts(share, (n) => -n));
    lost = addHaul(dive.haul, share);
  }
  // The dive's quest events applied as it banked and extracted: its dive-scoped objectives start afresh.
  const settled = resetDiveQuests(registry, {
    ...stockHaul(profile, kept),
    dive: { ...dive, haul: emptyHaul(), banked: kept, lost, settled: true },
  });
  // A dive that cleared a depth refills the Contract board (the quests spec's S2), once there are templates.
  const refill = dive.depthsCleared > 0 && registry.getQuestsData().contractTemplates.length > 0;
  return refill ? refillBoard(registry, settled) : settled;
}

/**
 * Clear the dive record (after the summary, or to abandon — the bounty is lost).
 * A dive still under way settles first, as an abandon (`settleDive`); an
 * extracted or dead dive has settled already.
 */
export function closeDive(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const settled = isDiveActive(profile) ? settleDive(registry, profile, 'abandon') : profile;
  return { ...settled, dive: null };
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
  return profileStats(registry, profile).maxHp;
}
