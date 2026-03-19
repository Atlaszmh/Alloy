import type { AITier } from '../types/ai.js';
import type { MatchMode } from '../types/match.js';
import type { MatchReport } from '../types/match-report.js';
import type { DataRegistry } from '../data/registry.js';
import { createMatch, applyAction } from '../match/match-controller.js';
import { AIController } from '../ai/ai-controller.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { computeAggregateStats, type AggregateStats } from './stats-collector.js';
import { extractMatchReport } from '../match/match-report.js';

export interface SimulationConfig {
  matchCount: number;
  aiTier1: AITier;
  aiTier2: AITier;
  seedStart: number;
  mode: MatchMode;
  baseWeaponId: string;
  baseArmorId: string;
}

export interface SimulationResult {
  config: SimulationConfig;
  matches: MatchReport[];
  aggregateStats: AggregateStats;
  duration: number; // ms
}

export function runSimulation(config: SimulationConfig, registry: DataRegistry): SimulationResult {
  const startTime = Date.now();
  const matches: MatchReport[] = [];

  for (let i = 0; i < config.matchCount; i++) {
    const seed = config.seedStart + i;
    const summary = runAIMatch(seed, config.aiTier1, config.aiTier2, config, registry);
    matches.push(summary);
  }

  const aggregateStats = computeAggregateStats(matches);
  const duration = Date.now() - startTime;

  return { config, matches, aggregateStats, duration };
}

function runAIMatch(
  seed: number,
  tier1: AITier,
  tier2: AITier,
  config: SimulationConfig,
  registry: DataRegistry,
): MatchReport {
  let state = createMatch(
    'sim_' + seed,
    seed,
    config.mode,
    ['ai_0', 'ai_1'],
    config.baseWeaponId,
    config.baseArmorId,
    registry,
  );

  const rng0 = new SeededRNG(seed).fork('ai_0');
  const rng1 = new SeededRNG(seed).fork('ai_1');
  const ai0 = new AIController(tier1, registry, rng0);
  const ai1 = new AIController(tier2, registry, rng1);

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
          // Skip invalid actions silently
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

    // Handle adapt phase by skipping it (advance to next forge/duel)
    if (state.phase.kind === 'adapt') {
      // No adapt actions for now; just advance
      const result = applyAction(state, { kind: 'advance_phase' }, registry);
      if (result.ok) {
        state = result.state;
      } else {
        // If advance_phase doesn't work for adapt, we need to handle it differently
        // For now, just break to avoid infinite loop
        break;
      }
    }
  }

  return extractMatchReport(state, 'simulation', seed, registry);
}

