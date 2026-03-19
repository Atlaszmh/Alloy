import type { ForgeAction } from './forge-action.js';
import type { MatchState } from './match.js';

export type GameAction =
  | { kind: 'draft_pick'; player: 0 | 1; orbUid: string }
  | { kind: 'forge_action'; player: 0 | 1; action: ForgeAction }
  | { kind: 'forge_complete'; player: 0 | 1 }
  | { kind: 'advance_phase' }
  | { kind: 'duel_continue' };

export type ActionResult =
  | { ok: true; state: MatchState }
  | { ok: false; error: string };
