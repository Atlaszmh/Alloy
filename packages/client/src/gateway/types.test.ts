import { describe, it, expect } from 'vitest';
import type { MatchEvent, MatchGateway } from './types';

describe('MatchGateway types', () => {
  it('MatchEvent covers all 6 kinds', () => {
    // Compile-time check: each kind is assignable to MatchEvent
    const events: MatchEvent[] = [
      { kind: 'phase_changed', phase: { kind: 'draft', round: 1, pickIndex: 0, activePlayer: 0 } },
      { kind: 'opponent_action', action: { kind: 'advance_phase' }, result: { ok: false, error: 'test' } },
      { kind: 'opponent_disconnected' },
      { kind: 'opponent_reconnected' },
      { kind: 'match_forfeited', winner: 0 },
      { kind: 'error', message: 'test error' },
    ];

    const kinds = events.map(e => e.kind);
    expect(kinds).toEqual([
      'phase_changed',
      'opponent_action',
      'opponent_disconnected',
      'opponent_reconnected',
      'match_forfeited',
      'error',
    ]);
    expect(kinds).toHaveLength(6);
  });

  it('MatchGateway interface shape is importable', () => {
    // Type-level check: ensure the interface is importable and usable
    const _check: MatchGateway | null = null;
    expect(_check).toBeNull();
  });
});
