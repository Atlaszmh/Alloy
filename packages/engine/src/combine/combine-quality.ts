import {
  type GemInstance,
  type GemRarity,
  calculateEffectiveValue,
  RARITY_ORDER,
} from '../types/gem.js';

// Default thresholds — configurable via balance.json
const DEFAULT_RARITY_THRESHOLDS: Record<GemRarity, number> = {
  common: 0,
  uncommon: 1.0,
  magic: 2.0,
  rare: 3.5,
  epic: 5.5,
  legendary: 8.0,
};

export function computeAverageQuality(a: GemInstance, b: GemInstance): number {
  const qa = calculateEffectiveValue(a.tier, a.rarity);
  const qb = calculateEffectiveValue(b.tier, b.rarity);
  return (qa + qb) / 2;
}

export function applyMatchingRarityBonus(
  avgQuality: number,
  raritiesMatch: boolean,
  bonusPct: number,
): number {
  return raritiesMatch ? avgQuality * (1 + bonusPct) : avgQuality;
}

export function determineOutputTierRarity(
  quality: number,
  thresholds: Record<GemRarity, number> = DEFAULT_RARITY_THRESHOLDS,
): { tier: 1 | 2 | 3 | 4 | 5; rarity: GemRarity } {
  const tier = Math.min(5, Math.max(1, Math.floor(quality / 2) + 1)) as 1 | 2 | 3 | 4 | 5;

  let rarity: GemRarity = 'common';
  for (const r of RARITY_ORDER) {
    if (quality >= thresholds[r]) {
      rarity = r;
    }
  }

  return { tier, rarity };
}
