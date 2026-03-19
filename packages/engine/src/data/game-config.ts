import { z } from 'zod';
import { loadAndValidateData } from './loader.js';
import type { GameConfig } from '../types/game-config.js';
import {
  AffixesSchema,
  CombinationsSchema,
  SynergiesSchema,
  BaseItemsSchema,
  BalanceConfigSchema,
} from './schemas.js';

export const GameConfigSchema = z.object({
  version: z.string(),
  name: z.string(),
  affixes: AffixesSchema,
  combinations: CombinationsSchema,
  synergies: SynergiesSchema,
  baseItems: BaseItemsSchema,
  balance: BalanceConfigSchema,
});

export function defaultConfig(): GameConfig {
  const data = loadAndValidateData();
  return {
    version: '1.0.0',
    name: 'baseline',
    affixes: data.affixes,
    combinations: data.combinations,
    synergies: data.synergies,
    baseItems: data.baseItems,
    balance: data.balance,
  };
}

/**
 * Shallow merge: top-level GameConfig fields are replaced, balance fields
 * are one-level merged. This means passing { balance: { statCaps: {...} } }
 * will preserve other balance fields like fluxPerRound. Deeper nesting
 * (e.g., replacing one tier within an affix) requires passing the full
 * affixes array.
 */
export function mergeConfig(
  base: GameConfig,
  overrides: Partial<GameConfig>,
): GameConfig {
  return {
    ...base,
    ...overrides,
    balance: overrides.balance
      ? { ...base.balance, ...overrides.balance }
      : base.balance,
  };
}
