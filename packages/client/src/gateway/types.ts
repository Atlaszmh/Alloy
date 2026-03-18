import type { MatchState, MatchPhase, GameAction, ActionResult } from '@alloy/engine';

export type MatchEvent =
  | { kind: 'phase_changed'; phase: MatchPhase }
  | { kind: 'opponent_action'; action: GameAction; result: ActionResult }
  | { kind: 'opponent_disconnected' }
  | { kind: 'opponent_reconnected' }
  | { kind: 'match_forfeited'; winner: 0 | 1 }
  | { kind: 'error'; message: string };

export interface MatchGateway {
  readonly code: string;
  getState(): MatchState | null;
  dispatch(action: GameAction): Promise<ActionResult>;
  subscribe(callback: (state: MatchState) => void): () => void;
  onEvent(callback: (event: MatchEvent) => void): () => void;
  destroy(): void;
}
