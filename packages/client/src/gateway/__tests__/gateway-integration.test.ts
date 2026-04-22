import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMatchStore } from '@/stores/matchStore';
import { liveCount, liveSlots } from '@alloy/engine';
import { LocalGateway } from '../local-gateway';

describe('LocalGateway integration', () => {
  beforeEach(() => {
    useMatchStore.getState().reset();
  });

  it('full draft sequence: pick for player 0, verify pool live-count shrinks and stockpile grows', async () => {
    useMatchStore.getState().startLocalMatch(42, 'quick', 1);
    const gw = new LocalGateway('ai-integ-1');

    const stateBefore = gw.getState()!;
    expect(stateBefore.phase.kind).toBe('draft');
    const poolLiveBefore = liveCount(stateBefore.pool);
    const stockpileLiveBefore = liveCount(stateBefore.players[0].stockpile);
    const firstOrb = liveSlots(stateBefore.pool)[0];

    const result = await gw.dispatch({
      kind: 'draft_pick',
      player: 0,
      orbUid: firstOrb.uid,
    });
    expect(result.ok).toBe(true);

    const stateAfter = gw.getState()!;
    // Pool length is stable — only the live count drops since we null the slot.
    expect(liveCount(stateAfter.pool)).toBe(poolLiveBefore - 1);
    expect(liveCount(stateAfter.players[0].stockpile)).toBe(stockpileLiveBefore + 1);

    gw.destroy();
  });

  it('alternating draft picks: player 0 then player 1', async () => {
    useMatchStore.getState().startLocalMatch(42, 'quick', 1);
    const gw = new LocalGateway('ai-integ-2');

    const state0 = gw.getState()!;
    const orb0 = liveSlots(state0.pool)[0];

    // Player 0 picks
    const r0 = await gw.dispatch({ kind: 'draft_pick', player: 0, orbUid: orb0.uid });
    expect(r0.ok).toBe(true);

    // Player 1 picks a different orb — fetch the next live one since slot 0
    // (or wherever orb0 lived) is now null.
    const state1 = gw.getState()!;
    const orb1 = liveSlots(state1.pool)[0];
    const r1 = await gw.dispatch({ kind: 'draft_pick', player: 1, orbUid: orb1.uid });
    expect(r1.ok).toBe(true);

    const stateAfter = gw.getState()!;
    expect(liveCount(stateAfter.players[0].stockpile)).toBe(1);
    expect(liveCount(stateAfter.players[1].stockpile)).toBe(1);

    gw.destroy();
  });

  it('subscribe fires callback on every state change', async () => {
    useMatchStore.getState().startLocalMatch(42, 'quick', 1);
    const gw = new LocalGateway('ai-integ-3');
    const callback = vi.fn();
    gw.subscribe(callback);

    const orb = liveSlots(gw.getState()!.pool)[0];
    await gw.dispatch({ kind: 'draft_pick', player: 0, orbUid: orb.uid });

    expect(callback).toHaveBeenCalled();
    // The callback should receive a MatchState with the picked orb's slot nulled.
    const lastCall = callback.mock.calls[callback.mock.calls.length - 1][0];
    expect(
      lastCall.pool.find((o: { uid: string } | null) => o !== null && o.uid === orb.uid),
    ).toBeUndefined();

    gw.destroy();
  });

  it('onEvent fires phase_changed when draft completes and transitions to forge', async () => {
    useMatchStore.getState().startLocalMatch(42, 'quick', 1);
    const gw = new LocalGateway('ai-integ-4');
    const eventCallback = vi.fn();
    gw.onEvent(eventCallback);

    // Exhaust all draft picks to trigger phase transition
    let state = gw.getState()!;
    let player = 0;

    while (state.phase.kind === 'draft') {
      const orb = liveSlots(state.pool)[0];
      if (!orb) break;

      const result = await gw.dispatch({
        kind: 'draft_pick',
        player: player as 0 | 1,
        orbUid: orb.uid,
      });

      if (!result.ok) {
        // If pick failed (wrong turn), try the other player
        player = player === 0 ? 1 : 0;
        const retry = await gw.dispatch({
          kind: 'draft_pick',
          player: player as 0 | 1,
          orbUid: orb.uid,
        });
        if (retry.ok) {
          player = player === 0 ? 1 : 0;
        }
      } else {
        player = player === 0 ? 1 : 0;
      }

      state = gw.getState()!;
    }

    // The phase should have transitioned away from draft
    const finalState = gw.getState()!;
    expect(finalState.phase.kind).not.toBe('draft');

    // onEvent should have been called with phase_changed
    const phaseChangedEvents = eventCallback.mock.calls.filter(
      (call) => call[0].kind === 'phase_changed',
    );
    expect(phaseChangedEvents.length).toBeGreaterThan(0);
    expect(phaseChangedEvents[0][0].phase.kind).toBe(finalState.phase.kind);

    gw.destroy();
  });
});
