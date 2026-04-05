import type { Loadout } from './item.js';
import type { CombatLog } from './combat.js';
import type { DerivedStats } from './derived-stats.js';

export interface MatchReport {
  seed?: number;
  source: 'simulation' | 'live';
  winner: 0 | 1 | null;
  rounds: number;
  durationMs: number;
  players: PlayerReport[];
  roundDetails: RoundReport[];
  combatLogs?: CombatLog[];
  playerStats?: [DerivedStats | null, DerivedStats | null];
}

export interface PlayerReport {
  playerIndex: 0 | 1;
  aiTier?: number;
  finalHP: number;
  affixIds: string[];
  combinationIds: string[];
  synergyIds: string[];
  loadout: Loadout;
}

export interface RoundReport {
  round: number;
  winner: 0 | 1;
  duration: number; // seconds
  p0HpFinal: number;
  p1HpFinal: number;
  p0DamageDealt: number;
  p1DamageDealt: number;
}
