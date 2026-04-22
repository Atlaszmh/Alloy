import type { StatModifier } from './affix.js';

export type GemRarity = 'common' | 'uncommon' | 'magic' | 'rare' | 'epic' | 'legendary';

export const RARITY_ORDER: GemRarity[] = ['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary'];

export const RARITY_MULTIPLIERS: Record<GemRarity, number> = {
  common: 1.0,
  uncommon: 1.1,
  magic: 1.25,
  rare: 1.5,
  epic: 2.0,
  legendary: 3.0,
};

export const TIER_VALUES = [0, 1.0, 2.0, 3.0, 4.0, 5.0] as const; // index 0 unused

export const MAX_TIER = 5;
export const MAX_RECIPE_DEPTH = 3;

export interface SecondaryModifier {
  kind: string;
  payload?: unknown;
}

export interface SecondarySlot {
  affixId: string;
  tier: 1 | 2 | 3 | 4 | 5;
  rarity: GemRarity;
  sourceGemUid: string;
  modifiers?: SecondaryModifier[];
}

export interface GemInstance {
  uid: string;
  affixId: string;
  tier: 1 | 2 | 3 | 4 | 5;
  rarity: GemRarity;
  sourceRecipe?: string;
  recipeDepth: number;
  combinable: boolean;
  tags: string[]; // All ancestor affix IDs for synergy detection
  outputBonusEffects?: StatModifier[]; // Bonus effects from signature/category recipes
  secondary?: SecondarySlot;
}

export function calculateEffectiveValue(
  tier: number,
  rarity: GemRarity,
): number {
  return TIER_VALUES[tier] * RARITY_MULTIPLIERS[rarity];
}

export function isCombinable(gem: {
  tier: number;
  rarity: GemRarity;
  recipeDepth: number;
}): boolean {
  if (gem.recipeDepth >= MAX_RECIPE_DEPTH) return false;
  if (gem.tier >= MAX_TIER && gem.rarity === 'legendary') return false;
  return true;
}

export function createGem(
  uid: string,
  affixId: string,
  tier: 1 | 2 | 3 | 4 | 5,
  rarity: GemRarity,
  opts?: {
    sourceRecipe?: string;
    recipeDepth?: number;
    tags?: string[];
    outputBonusEffects?: StatModifier[];
  },
): GemInstance {
  const recipeDepth = opts?.recipeDepth ?? 0;
  return {
    uid,
    affixId,
    tier,
    rarity,
    sourceRecipe: opts?.sourceRecipe,
    recipeDepth,
    combinable: isCombinable({ tier, rarity, recipeDepth }),
    tags: opts?.tags ?? [affixId],
    outputBonusEffects: opts?.outputBonusEffects,
  };
}

/** Derive synergy-relevant tags from a gem's full ancestry */
export function getGemTags(gem: GemInstance): string[] {
  return [...new Set(gem.tags)];
}

export function nextRarity(rarity: GemRarity): GemRarity | null {
  const idx = RARITY_ORDER.indexOf(rarity);
  return idx < RARITY_ORDER.length - 1 ? RARITY_ORDER[idx + 1] : null;
}

export function rarityIndex(rarity: GemRarity): number {
  return RARITY_ORDER.indexOf(rarity);
}

export function hasSecondarySlot(gem: GemInstance, threshold: number): boolean {
  return gem.tier + rarityIndex(gem.rarity) >= threshold;
}
