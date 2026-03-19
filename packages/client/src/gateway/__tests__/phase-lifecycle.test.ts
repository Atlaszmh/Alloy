import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMatchStore } from '@/stores/matchStore';
import { LocalGateway } from '../local-gateway';

describe('Phase lifecycle: draft → forge → duel → complete', () => {
  beforeEach(() => {
    useMatchStore.getState().reset();
  });

  function createGateway(): LocalGateway {
    useMatchStore.getState().startLocalMatch(42, 'quick', 1);
    return new LocalGateway('ai-lifecycle');
  }

  async function drainDraft(gw: LocalGateway): Promise<void> {
    let state = gw.getState()!;
    let player = 0;

    while (state.phase.kind === 'draft') {
      const orb = state.pool[0];
      if (!orb) break;

      const result = await gw.dispatch({
        kind: 'draft_pick',
        player: player as 0 | 1,
        orbUid: orb.uid,
      });

      if (!result.ok) {
        player = player === 0 ? 1 : 0;
        await gw.dispatch({
          kind: 'draft_pick',
          player: player as 0 | 1,
          orbUid: orb.uid,
        });
        player = player === 0 ? 1 : 0;
      } else {
        player = player === 0 ? 1 : 0;
      }

      state = gw.getState()!;
    }
  }

  it('starts in draft phase', () => {
    const gw = createGateway();
    expect(gw.getState()!.phase.kind).toBe('draft');
    gw.destroy();
  });

  it('draft → forge: exhausting picks transitions to forge', async () => {
    const gw = createGateway();
    await drainDraft(gw);
    expect(gw.getState()!.phase.kind).toBe('forge');
    gw.destroy();
  });

  it('forge → duel: both players completing forge transitions to duel', async () => {
    const gw = createGateway();
    await drainDraft(gw);
    expect(gw.getState()!.phase.kind).toBe('forge');

    // Both players complete forge
    await gw.dispatch({ kind: 'forge_complete', player: 0 });
    await gw.dispatch({ kind: 'forge_complete', player: 1 });

    expect(gw.getState()!.phase.kind).toBe('duel');
    gw.destroy();
  });

  it('duel → complete: advancing past duel ends the match (quick mode)', async () => {
    const gw = createGateway();
    await drainDraft(gw);

    await gw.dispatch({ kind: 'forge_complete', player: 0 });
    await gw.dispatch({ kind: 'forge_complete', player: 1 });
    expect(gw.getState()!.phase.kind).toBe('duel');

    // Run duel simulation
    await gw.dispatch({ kind: 'advance_phase' });
    expect(gw.getState()!.phase.kind).toBe('duel');

    // Advance past duel
    await gw.dispatch({ kind: 'duel_continue' });

    // Quick mode: single round → complete
    expect(gw.getState()!.phase.kind).toBe('complete');
    gw.destroy();
  });

  it('subscription fires on every phase transition', async () => {
    const gw = createGateway();
    const phases: string[] = [];
    gw.subscribe((state) => {
      const kind = state.phase.kind;
      if (phases[phases.length - 1] !== kind) {
        phases.push(kind);
      }
    });

    // draft → forge
    await drainDraft(gw);
    // forge → duel
    await gw.dispatch({ kind: 'forge_complete', player: 0 });
    await gw.dispatch({ kind: 'forge_complete', player: 1 });
    // run duel simulation
    await gw.dispatch({ kind: 'advance_phase' });
    // duel → complete
    await gw.dispatch({ kind: 'duel_continue' });

    expect(phases).toContain('forge');
    expect(phases).toContain('duel');
    expect(phases).toContain('complete');
    gw.destroy();
  });

  it('onEvent fires phase_changed for each transition', async () => {
    const gw = createGateway();
    const events: string[] = [];
    gw.onEvent((event) => {
      if (event.kind === 'phase_changed') {
        events.push(event.phase.kind);
      }
    });

    await drainDraft(gw);
    await gw.dispatch({ kind: 'forge_complete', player: 0 });
    await gw.dispatch({ kind: 'forge_complete', player: 1 });
    await gw.dispatch({ kind: 'advance_phase' });
    await gw.dispatch({ kind: 'duel_continue' });

    expect(events).toEqual(['forge', 'duel', 'complete']);
    gw.destroy();
  });

  it('shared gateway: multiple subscribers see the same state', async () => {
    const gw = createGateway();
    const states1: string[] = [];
    const states2: string[] = [];

    gw.subscribe((state) => {
      const kind = state.phase.kind;
      if (states1[states1.length - 1] !== kind) states1.push(kind);
    });
    gw.subscribe((state) => {
      const kind = state.phase.kind;
      if (states2[states2.length - 1] !== kind) states2.push(kind);
    });

    await drainDraft(gw);

    expect(states1).toEqual(states2);
    expect(states1).toContain('forge');
    gw.destroy();
  });
});
