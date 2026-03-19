import type { AffixDef } from './affix.js';
import type { CompoundAffixDef } from './combination.js';
import type { SynergyDef } from './synergy.js';
import type { BaseItemDef } from './item.js';
import type { BalanceConfig } from './balance.js';

export interface GameConfig {
  version: string;
  name: string;
  affixes: AffixDef[];
  combinations: CompoundAffixDef[];
  synergies: SynergyDef[];
  baseItems: BaseItemDef[];
  balance: BalanceConfig;
}
