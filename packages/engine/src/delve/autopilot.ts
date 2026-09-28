import type { DataRegistry } from '../data/registry.js';
import type { DelveProfile } from '../types/delve.js';
import type { Rarity } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';
import { MANA_TYPES, emptyManaMap, type ManaType } from '../types/mana.js';
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
import { compareItem, itemAttunement } from './hero-stats.js';
import { bindSecondary, fixBuildsToPair, profileStats, resolveOvertake } from './pair.js';
import {
  createDelveProfile,
  equipBest,
  fuseGear,
  profilePower,
  referenceDepth,
  salvageCandidates,
  salvageItems,
  setAbility,
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
  /** A fresh profile's starting mana (default fire). */
  primary?: ManaType;
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
        refreshWorldHero(registry, world, profileStats(registry, p), p.abilities);
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

/**
 * Bind the non-primary element the bot owns the most attunement in (equipped
 * and bagged: each item's base plus its `*Attune` lines; ties in MANA_TYPES
 * order), none while that's all 0; then build the Primary from both elements,
 * so it keeps finding reactions.
 */
function bindBest(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const primary = profile.pair.primary;
  if (!primary) return profile;
  let p = profile;
  if (!p.pair.secondary) {
    const owned = emptyManaMap();
    for (const item of [...GEAR_SLOTS.map((s) => p.equipped[s]), ...p.bag]) {
      if (!item) continue;
      const a = itemAttunement(registry, item);
      for (const m of MANA_TYPES) owned[m] += a[m];
    }
    let best: ManaType | null = null;
    for (const m of MANA_TYPES) if (m !== primary && owned[m] > (best ? owned[best] : 0)) best = m;
    if (!best) return p;
    p = bindSecondary(p, best).profile;
    if (!p.pair.secondary) return p;
  }
  const elements = [p.pair.primary!, p.pair.secondary!];
  return setAbility(registry, p, 'primary', { ...p.abilities.primary, elements });
}

/**
 * Between dives, as a player would: an overtaking secondary swaps in, the
 * builds keep to the pair (a no-op for the bot's own builds; it matters for a
 * continued `opts.profile`), a second element is bound (before anything is
 * salvaged) and the Primary built from both, then the forge visit.
 */
export function betweenDives(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const settled = fixBuildsToPair(resolveOvertake(registry, profile).profile).profile;
  return visitForge(registry, bindBest(registry, settled));
}

/** Between dives: fuse spare triples, melt junk, and pour scrap into upgrades. */
function visitForge(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = equipBest(registry, profile).profile;
  const depth = referenceDepth(p);

  for (const rarity of FUSE_RARITIES) {
    for (;;) {
      const spare = p.bag.filter(
        (i) => i.rarity === rarity && !i.locked && compareItem(p.equipped, i, registry, depth, undefined, p.pair).powerPct <= 0,
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
  let p = opts.profile ?? createDelveProfile(registry, opts.seed, { primary: opts.primary ?? 'fire' });
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
    p = betweenDives(registry, closeDive(p));
  }
  return { profile: p, reports };
}
