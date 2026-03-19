import type { Loadout } from './item.js';

export interface MatchReport {
  seed?: number;
  source: 'simulation' | 'live';
  winner: 0 | 1 | null;
  rounds: number;
  durationMs: number;
  players: PlayerReport[];
  roundDetails: RoundReport[];
  combatLog?: unknown[];
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
  durationTicks: number;
  p0HpFinal: number;
  p1HpFinal: number;
  p0DamageDealt: number;
  p1DamageDealt: number;
}
