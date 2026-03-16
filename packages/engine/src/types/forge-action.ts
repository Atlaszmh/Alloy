import type { BaseStat } from './base-stats.js';

export type ForgeAction =
  | { kind: 'assign_orb'; orbUid: string; target: 'weapon' | 'armor'; slotIndex: number }
  | {
      kind: 'combine';
      orbUid1: string;
      orbUid2: string;
      target: 'weapon' | 'armor';
      slotIndex: number;
    }
  | {
      kind: 'upgrade_tier';
      orbUid1: string;
      orbUid2: string;
      target: 'weapon' | 'armor';
      slotIndex: number;
    }
  | { kind: 'swap_orb'; target: 'weapon' | 'armor'; slotIndex: number; newOrbUid: string }
  | { kind: 'remove_orb'; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'set_base_stats'; target: 'weapon' | 'armor'; stat1: BaseStat; stat2: BaseStat };
