import type { DataRegistry } from '../data/registry.js';
import type { DelveProfile } from '../types/delve.js';
import type { Rarity } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';
import { upgradeCost } from '../loot/smithing.js';
import { botInput } from '../arpg/bot.js';
import { stepWorld } from '../arpg/step.js';
import { refreshWorldHero } from '../arpg/world.js';
import {
  bankWorld,
  beginFloor,
  chooseDoor,
  closeDive,
  completeFloor,
  extractDive,
  failFloor,
  startDepthOptions,
  startDive,
} from './dive.js';
import { compareItem, computeHeroStats } from './hero-stats.js';
import {
  createDelveProfile,
  equipBest,
  fuseGear,
  profilePower,
  referenceDepth,
  salvageCandidates,
  salvageItems,
  upgradeGear,
} from './profile.js';

/**
 * Plays whole dives with the arena bot, like a sensible player: fights every
 * floor, equips upgrades as they drop, picks doors, extracts when spent, and
 * forges between dives. Used by the pacing test and for balance sweeps.
 */

export interface AutopilotOptions {
  seed: number;
  dives: number;
  /** Safety cap on depth per dive. */
  maxDepth?: number;
  /** A floor that runs longer than this counts as a death. */
  maxFloorSeconds?: number;
  /** Continue from an existing profile instead of a fresh one. */
  profile?: DelveProfile;
}

export interface AutopilotDiveReport {
  dive: number;
  startDepth: number;
  endDepth: number;
  result: 'dead' | 'extracted' | 'capped';
  power: number;
  kills: number;
  floorSeconds: number;
  legendariesOwned: number;
  reactionsSeen: number;
  scrap: number;
}

const DOOR_PREFERENCE = ['winding', 'gilded', 'swarm', 'champions', 'cursed', 'plunge', 'shrine'];
const FUSE_RARITIES: Rarity[] = ['magic', 'rare', 'epic'];
const STEP = 1 / 30;

function playFloor(
  registry: DataRegistry,
  profile: DelveProfile,
  maxSeconds: number,
): { profile: DelveProfile; seconds: number; died: boolean } {
  let p = profile;
  const world = beginFloor(registry, p);
  while (!world.heroDead && world.t < maxSeconds) {
    stepWorld(registry, world, botInput(registry, world), STEP);
    if (world.pending.items.length > 0) {
      p = bankWorld(registry, p, world).profile;
      const best = equipBest(registry, p);
      if (best.equipped.length > 0) {
        p = best.profile;
        refreshWorldHero(registry, world, computeHeroStats(p.equipped, registry), p.skillSlots);
      }
    }
    if (world.cleared && (world.drops.length === 0 || world.t - world.clearedAt > 3)) break;
  }
  if (world.heroDead || !world.cleared) {
    return { profile: failFloor(registry, p, world).profile, seconds: world.t, died: true };
  }
  return { profile: completeFloor(registry, p, world).profile, seconds: world.t, died: false };
}

function pickDoor(profile: DelveProfile): string | null {
  const dive = profile.dive!;
  if (dive.heroHpFrac < 0.35 && dive.potions === 0 && !dive.doorChoices.includes('shrine')) return null;
  if (dive.heroHpFrac < 0.5 && dive.doorChoices.includes('shrine')) return 'shrine';
  for (const id of DOOR_PREFERENCE) if (dive.doorChoices.includes(id)) return id;
  return dive.doorChoices[0];
}

/** Between dives: fuse spare triples, melt junk, and pour scrap into upgrades. */
function visitForge(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = equipBest(registry, profile).profile;
  const depth = referenceDepth(p);

  for (const rarity of FUSE_RARITIES) {
    for (;;) {
      const spare = p.bag.filter(
        (i) => i.rarity === rarity && !i.locked && compareItem(p.equipped, i, registry, depth).powerPct <= 0,
      );
      if (spare.length < 3) break;
      const res = fuseGear(
        registry,
        p,
        spare.slice(0, 3).map((i) => i.uid),
      );
      if (!res.ok) break;
      p = equipBest(registry, res.profile).profile;
    }
  }

  p = salvageItems(registry, p, salvageCandidates(registry, p, 'epic')).profile;

  for (;;) {
    let cheapest: { uid: string; cost: number } | null = null;
    for (const slot of GEAR_SLOTS) {
      const item = p.equipped[slot];
      if (!item) continue;
      const cost = upgradeCost(registry, item);
      if (cost !== null && (!cheapest || cost < cheapest.cost)) cheapest = { uid: item.uid, cost };
    }
    if (!cheapest || cheapest.cost > p.scrap) break;
    p = upgradeGear(registry, p, cheapest.uid).profile;
  }
  return p;
}

export function runAutopilot(
  registry: DataRegistry,
  opts: AutopilotOptions,
): { profile: DelveProfile; reports: AutopilotDiveReport[] } {
  const maxDepth = opts.maxDepth ?? 100;
  const maxFloorSeconds = opts.maxFloorSeconds ?? 240;
  let p = opts.profile ?? createDelveProfile(registry, opts.seed);
  const reports: AutopilotDiveReport[] = [];

  for (let n = 0; n < opts.dives; n++) {
    const options = startDepthOptions(registry, p);
    const startDepth = options[options.length - 1];
    p = startDive(registry, p, startDepth);
    let seconds = 0;
    let result: AutopilotDiveReport['result'] = 'dead';

    while (p.dive && (p.dive.phase === 'fighting' || p.dive.phase === 'choosing')) {
      if (p.dive.phase === 'fighting') {
        const played = playFloor(registry, p, maxFloorSeconds);
        p = played.profile;
        seconds += played.seconds;
        continue;
      }
      if (p.dive.depth >= maxDepth) {
        p = extractDive(registry, p);
        result = 'capped';
        break;
      }
      const door = pickDoor(p);
      if (!door) {
        p = extractDive(registry, p);
        result = 'extracted';
        break;
      }
      p = chooseDoor(registry, p, door);
    }

    const dive = p.dive!;
    reports.push({
      dive: n + 1,
      startDepth,
      endDepth: dive.depth,
      result: dive.phase === 'dead' ? 'dead' : result,
      power: profilePower(registry, p),
      kills: dive.kills,
      floorSeconds: Math.round(seconds),
      legendariesOwned: Object.keys(p.codex).length,
      reactionsSeen: p.reactionsSeen.length,
      scrap: p.scrap,
    });
    p = visitForge(registry, closeDive(p));
  }
  return { profile: p, reports };
}
