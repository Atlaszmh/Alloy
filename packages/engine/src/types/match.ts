import type { CombatLog, DuelResult } from './combat.js';
import type { Loadout } from './item.js';
import type { GemInstance } from './gem.js';
import type { RunState } from '../run/run-state.js';
import type { DiscoveryState } from '../combine/discovery-state.js';

// --- Match Phases ---

export type MatchPhase =
  | { kind: 'draft'; round: number; pickIndex: number; activePlayer: 0 | 1 }
  | { kind: 'forge'; round: number }
  | { kind: 'duel'; round: number }
  | { kind: 'complete'; winner: 0 | 1 | 'draw'; scores: [number, number] };

export type MatchMode = 'quick' | 'unranked' | 'ranked' | 'run_async' | 'run_live';

// --- Player State ---

export interface PlayerState {
  id: string;
  stockpile: GemInstance[]; // All drafted orbs
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
  pool: GemInstance[]; // Shared draft pool (shrinks as picks happen)
  players: [PlayerState, PlayerState];
  roundResults: DuelResult[];
  duelLogs: CombatLog[];
  forgeComplete?: [boolean, boolean]; // Whether each player has completed forging
  runState?: RunState; // Present in run modes (run_async, run_live)
  discoveryState?: DiscoveryState; // Present in run modes (run_async, run_live)
}
