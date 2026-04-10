import type { GemInstance } from '../types/gem.js';
import type { Loadout } from '../types/item.js';
import type { BaseStatAllocation } from '../types/base-stats.js';
import { calculateEffectiveValue } from '../types/gem.js';

export interface PlayerPayload {
  loadout: {
    weapon: { baseItemId: string; baseStats: BaseStatAllocation | null; gems: GemInstance[] };
    armor: { baseItemId: string; baseStats: BaseStatAllocation | null; gems: GemInstance[] };
  };
  runRound: number;
  powerBracket: number;
}

/** Extract gems from a loadout's equipped slots */
export function extractGemsFromLoadout(loadout: Loadout): { weapon: GemInstance[]; armor: GemInstance[] } {
  const weaponGems = loadout.weapon.slots
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map(s => s.gem);
  const armorGems = loadout.armor.slots
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map(s => s.gem);
  return { weapon: weaponGems, armor: armorGems };
}

/** Compute total loadout quality = sum of all socketed gems' effective values */
export function computeLoadoutQuality(loadout: Loadout): number {
  const { weapon, armor } = extractGemsFromLoadout(loadout);
  return [...weapon, ...armor].reduce(
    (sum, gem) => sum + calculateEffectiveValue(gem.tier, gem.rarity),
    0,
  );
}

/** Power bracket for matchmaking: floor(totalQuality / bracketSize) */
export function computePowerBracket(loadout: Loadout, bracketSize: number = 5.0): number {
  return Math.floor(computeLoadoutQuality(loadout) / bracketSize);
}

/** Serialize a loadout + round into a payload for async matchmaking */
export function serializePayload(loadout: Loadout, runRound: number, bracketSize?: number): PlayerPayload {
  const { weapon, armor } = extractGemsFromLoadout(loadout);
  return {
    loadout: {
      weapon: { baseItemId: loadout.weapon.baseItemId, baseStats: loadout.weapon.baseStats, gems: weapon },
      armor: { baseItemId: loadout.armor.baseItemId, baseStats: loadout.armor.baseStats, gems: armor },
    },
    runRound,
    powerBracket: computePowerBracket(loadout, bracketSize),
  };
}

/** Check if two payloads are in matching range */
export function isMatchable(a: PlayerPayload, b: PlayerPayload, maxRoundDelta: number = 2, maxBracketDelta: number = 1): boolean {
  return Math.abs(a.runRound - b.runRound) <= maxRoundDelta
    && Math.abs(a.powerBracket - b.powerBracket) <= maxBracketDelta;
}
