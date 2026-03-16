import type { CombatLog, DuelResult } from './combat.js';
import type { Loadout } from './item.js';
import type { OrbInstance } from './orb.js';

// --- Match Phases ---

export type MatchPhase =
  | { kind: 'draft'; round: 1 | 2 | 3; pickIndex: number; activePlayer: 0 | 1 }
  | { kind: 'forge'; round: 1 | 2 | 3 }
  | { kind: 'duel'; round: 1 | 2 | 3 }
  | { kind: 'adapt'; round: 2 | 3 }
  | { kind: 'complete'; winner: 0 | 1 | 'draw'; scores: [number, number] };

export type MatchMode = 'quick' | 'unranked' | 'ranked';

// --- Player State ---

export interface PlayerState {
  id: string;
  stockpile: OrbInstance[]; // All drafted orbs
  loadout: Loadout;
}

// --- Match State ---

export interface MatchState {
  matchId: string;
  seed: number;
  mode: MatchMode;
  baseWeaponId: string;
  baseArmorId: string;
  phase: MatchPhase;
  pool: OrbInstance[]; // Shared draft pool (shrinks as picks happen)
  players: [PlayerState, PlayerState];
  roundResults: DuelResult[];
  duelLogs: CombatLog[];
  fluxPerRound: [number, number, number]; // From balance config: [8, 4, 2]
  forgeFlux?: [number, number]; // Flux remaining for [player0, player1] in current forge round
  forgeComplete?: [boolean, boolean]; // Whether each player has completed forging
}
