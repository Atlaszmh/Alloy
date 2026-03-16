import type { AffixDef } from '../types/affix.js';
import type { BalanceConfig } from '../types/balance.js';
import type { CompoundAffixDef } from '../types/combination.js';
import type { BaseItemDef } from '../types/item.js';
import type { SynergyDef } from '../types/synergy.js';
import {
  AffixesSchema,
  BalanceConfigSchema,
  BaseItemsSchema,
  CombinationsSchema,
  SynergiesSchema,
} from './schemas.js';

import rawAffixes from './affixes.json';
import rawCombinations from './combinations.json';
import rawSynergies from './synergies.json';
import rawBaseItems from './base-items.json';
import rawBalance from './balance.json';

export interface LoadedData {
  affixes: AffixDef[];
  combinations: CompoundAffixDef[];
  synergies: SynergyDef[];
  baseItems: BaseItemDef[];
  balance: BalanceConfig;
}

export function loadAndValidateData(): LoadedData {
  const affixes = AffixesSchema.parse(rawAffixes) as unknown as AffixDef[];
  const combinations = CombinationsSchema.parse(rawCombinations) as unknown as CompoundAffixDef[];
  const synergies = SynergiesSchema.parse(rawSynergies) as unknown as SynergyDef[];
  const flatBaseItems = [...(rawBaseItems as any).weapons, ...(rawBaseItems as any).armors];
  const baseItems = BaseItemsSchema.parse(flatBaseItems) as unknown as BaseItemDef[];
  const balance = BalanceConfigSchema.parse(rawBalance) as unknown as BalanceConfig;

  return { affixes, combinations, synergies, baseItems, balance };
}
