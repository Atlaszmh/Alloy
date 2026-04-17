import type { BaseStat } from './base-stats.js';

export type ForgeAction =
  | { kind: 'socket_gem'; gemUid: string; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'unsocket_gem'; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'combine'; gemUid1: string; gemUid2: string; keepGemUid?: string }
  | { kind: 'combine3'; gemUid1: string; gemUid2: string; gemUid3: string; keepGemUid?: string }
  | { kind: 'select_base_item'; target: 'weapon' | 'armor'; baseItemId: string }
  | { kind: 'set_base_stats'; target: 'weapon' | 'armor'; stat1: BaseStat; stat2: BaseStat }
  | { kind: 'boost_combine' }
  | { kind: 'reroll_pool' }
  | { kind: 'guarantee_rarity' };
