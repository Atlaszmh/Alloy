import type { BalanceConfig } from '../types/balance.js';
import type { DelveData } from '../types/delve.js';
import type { ArpgData } from '../types/arpg.js';
import type { RuneDef } from '../types/rune.js';
import type { CraftingData } from '../types/crafting.js';
import type { QuestsData } from '../types/quests.js';
import {
  BalanceConfigSchema,
  ArpgDataSchema,
  CraftingDataSchema,
  DelveDataSchema,
  LayoutsDataSchema,
  QuestsDataSchema,
  RunesSchema,
  ShrinesDataSchema,
} from './schemas.js';

import rawBalance from './balance.json';
import rawDelve from './delve.json';
import rawArpg from './arpg.json';
import rawRunes from './runes.json';
import rawCrafting from './crafting.json';
import rawQuests from './quests.json';
import rawLayouts from './layouts.json';
import rawShrines from './shrines.json';

export interface LoadedData {
  balance: BalanceConfig;
  delve: DelveData;
  arpg: ArpgData;
  crafting: CraftingData;
  quests: QuestsData;
}

export function loadAndValidateData(): LoadedData {
  const balance = BalanceConfigSchema.parse(rawBalance) as unknown as BalanceConfig;
  // layouts.json and shrines.json ride the Delve data (see the floor maps spec).
  const delve = {
    ...DelveDataSchema.parse(rawDelve),
    layouts: LayoutsDataSchema.parse(rawLayouts),
    shrines: ShrinesDataSchema.parse(rawShrines),
  } as unknown as DelveData;
  const arpg: ArpgData = {
    ...(ArpgDataSchema.parse(rawArpg) as unknown as Omit<ArpgData, 'runes'>),
    runes: RunesSchema.parse(rawRunes) as unknown as RuneDef[],
  };
  const crafting = CraftingDataSchema.parse(rawCrafting) as CraftingData;
  const quests = QuestsDataSchema.parse(rawQuests) as QuestsData;

  return { balance, delve, arpg, crafting, quests };
}
