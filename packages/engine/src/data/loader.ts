import type { AffixDef } from '../types/affix.js';
import type { BalanceConfig } from '../types/balance.js';
import type { CompoundAffixDef } from '../types/combination.js';
import type { BaseItemDef } from '../types/item.js';
import type { SynergyDef } from '../types/synergy.js';
import type { DelveData } from '../types/delve.js';
import type { RecipeDefinition } from '../combine/recipe-registry.js';
import {
  AffixesSchema,
  BalanceConfigSchema,
  BaseItemsSchema,
  CombinationsSchema,
  DelveDataSchema,
  RecipesSchema,
  SynergiesSchema,
} from './schemas.js';

import rawAffixes from './affixes.json';
import rawCombinations from './combinations.json';
import rawRecipes from './recipes.json';
import rawSynergies from './synergies.json';
import rawBaseItems from './base-items.json';
import rawBalance from './balance.json';
import rawDelve from './delve.json';

interface RawBaseItemsJSON {
  weapons: unknown[];
  armors: unknown[];
}

export interface LoadedData {
  affixes: AffixDef[];
  combinations: CompoundAffixDef[];
  recipes: RecipeDefinition[];
  synergies: SynergyDef[];
  baseItems: BaseItemDef[];
  balance: BalanceConfig;
  delve: DelveData;
}

export function loadAndValidateData(): LoadedData {
  const affixes = AffixesSchema.parse(rawAffixes) as unknown as AffixDef[];
  const combinations = CombinationsSchema.parse(rawCombinations) as unknown as CompoundAffixDef[];
  const recipes = RecipesSchema.parse(rawRecipes) as unknown as RecipeDefinition[];
  const synergies = SynergiesSchema.parse(rawSynergies) as unknown as SynergyDef[];
  const raw = rawBaseItems as RawBaseItemsJSON;
  const flatBaseItems = [...raw.weapons, ...raw.armors];
  const baseItems = BaseItemsSchema.parse(flatBaseItems) as unknown as BaseItemDef[];
  const balance = BalanceConfigSchema.parse(rawBalance) as unknown as BalanceConfig;
  const delve = DelveDataSchema.parse(rawDelve) as unknown as DelveData;

  return { affixes, combinations, recipes, synergies, baseItems, balance, delve };
}
