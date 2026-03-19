import { describe, it, expect } from 'vitest';
import { extractMatchReport } from '../src/match/match-report.js';
import { createMatch, applyAction } from '../src/match/match-controller.js';
import { AIController } from '../src/ai/ai-controller.js';
import { DataRegistry, loadAndValidateData } from '../src/data/index.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';

describe('extractMatchReport', () => {
  it('produces a valid MatchReport from a completed AI match', () => {
    const data = loadAndValidateData();
    const registry = new DataRegistry(
      data.affixes, data.combinations, data.synergies,
      data.baseItems, data.balance,
    );

    const seed = 42;
    const rng0 = new SeededRNG(seed).fork('ai_0');
    const rng1 = new SeededRNG(seed).fork('ai_1');
    const ai0 = new AIController(1, registry, rng0);
    const ai1 = new AIController(1, registry, rng1);

    let state = createMatch('test-1', seed, 'quick', ['ai-0', 'ai-1'], 'sword', 'chainmail', registry);

    // Draft phase
    while (state.phase.kind === 'draft') {
      const player = state.phase.activePlayer;
      const ai = player === 0 ? ai0 : ai1;
      const orbUid = ai.pickOrb(
        state.pool,
        state.players[player].stockpile,
        state.players[1 - player as 0 | 1].stockpile,
      );
      const result = applyAction(state, { kind: 'draft_pick', player, orbUid }, registry);
      if (!result.ok) throw new Error(`Draft failed: ${result.error}`);
      state = result.state;
    }

    // Forge + Duel rounds
    while (state.phase.kind !== 'complete') {
      if (state.phase.kind === 'forge') {
        const forgePhase = state.phase;
        for (const player of [0, 1] as const) {
          const ai = player === 0 ? ai0 : ai1;
          const actions = ai.planForge(
            state.players[player].stockpile,
            state.players[player].loadout,
            state.forgeFlux?.[player] ?? 0,
            forgePhase.round,
            state.players[1 - player as 0 | 1].stockpile,
          );
          for (const action of actions) {
            const result = applyAction(state, { kind: 'forge_action', player, action }, registry);
            if (result.ok) state = result.state;
          }
          const completeResult = applyAction(state, { kind: 'forge_complete', player }, registry);
          if (completeResult.ok) state = completeResult.state;
        }
      }

      if (state.phase.kind === 'duel') {
        const result = applyAction(state, { kind: 'advance_phase' }, registry);
        if (!result.ok) throw new Error(`Duel failed: ${result.error}`);
        state = result.state;
        const cont = applyAction(state, { kind: 'duel_continue' }, registry);
        if (!cont.ok) throw new Error(`Duel continue failed: ${cont.error}`);
        state = cont.state;
      }

      if (state.phase.kind === 'adapt') {
        const result = applyAction(state, { kind: 'advance_phase' }, registry);
        if (result.ok) {
          state = result.state;
        } else {
          break;
        }
      }
    }

    expect(state.phase.kind).toBe('complete');

    const report = extractMatchReport(state, 'simulation', seed, registry);

    expect(report.source).toBe('simulation');
    expect(report.seed).toBe(42);
    expect([0, 1, null]).toContain(report.winner);
    expect(report.rounds).toBeGreaterThanOrEqual(1);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.players).toHaveLength(2);
    expect(report.players[0].affixIds).toBeInstanceOf(Array);
    expect(report.players[0].loadout).toBeDefined();
    expect(report.players[0].playerIndex).toBe(0);
    expect(report.players[1].playerIndex).toBe(1);
    expect(report.roundDetails).toHaveLength(report.rounds);
    expect([0, 1]).toContain(report.roundDetails[0].winner);
    expect(report.roundDetails[0].p0DamageDealt).toBeGreaterThanOrEqual(0);
    expect(report.roundDetails[0].p1DamageDealt).toBeGreaterThanOrEqual(0);
    expect(report.roundDetails[0].durationTicks).toBeGreaterThan(0);
  });
});
