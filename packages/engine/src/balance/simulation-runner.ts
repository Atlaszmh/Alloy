import type { AITier } from '../types/ai.js';
import type { MatchMode, MatchState } from '../types/match.js';
import type { DuelResult } from '../types/combat.js';
import type { Loadout } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import { createMatch, applyAction } from '../match/match-controller.js';
import { AIController } from '../ai/ai-controller.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { computeAggregateStats, type AggregateStats } from './stats-collector.js';
import { isSynergyActive, collectAffixIds } from '../forge/stat-calculator.js';

export interface SimulationConfig {
  matchCount: number;
  aiTier1: AITier;
  aiTier2: AITier;
  seedStart: number;
  mode: MatchMode;
  baseWeaponId: string;
  baseArmorId: string;
}

export interface MatchSummary {
  seed: number;
  winner: 0 | 1 | 'draw';
  rounds: number;
  duelResults: DuelResult[];
  player0Affixes: string[];
  player1Affixes: string[];
  player0Synergies: string[];
  player1Synergies: string[];
  player0Combinations: string[];
  player1Combinations: string[];
}

export interface SimulationResult {
  config: SimulationConfig;
  matches: MatchSummary[];
  aggregateStats: AggregateStats;
  duration: number; // ms
}

export function runSimulation(config: SimulationConfig, registry: DataRegistry): SimulationResult {
  const startTime = Date.now();
  const matches: MatchSummary[] = [];

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
): MatchSummary {
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

  return extractMatchSummary(state, seed, registry);
}

function extractMatchSummary(state: MatchState, seed: number, registry: DataRegistry): MatchSummary {
  const phase = state.phase;
  let winner: 0 | 1 | 'draw' = 'draw';
  if (phase.kind === 'complete') {
    winner = phase.winner;
  }

  const rounds = state.roundResults.length;
  const duelResults = [...state.roundResults];

  // Extract affix IDs from each player's loadout
  const player0Affixes = collectAffixIds(state.players[0].loadout);
  const player1Affixes = collectAffixIds(state.players[1].loadout);

  // Extract compound IDs
  const player0Combinations = collectCompoundIds(state.players[0].loadout);
  const player1Combinations = collectCompoundIds(state.players[1].loadout);

  // Check synergies
  const player0Synergies = collectActiveSynergies(state.players[0].loadout, registry);
  const player1Synergies = collectActiveSynergies(state.players[1].loadout, registry);

  return {
    seed,
    winner,
    rounds,
    duelResults,
    player0Affixes,
    player1Affixes,
    player0Synergies,
    player1Synergies,
    player0Combinations,
    player1Combinations,
  };
}


function collectCompoundIds(loadout: Loadout): string[] {
  const ids: string[] = [];
  for (const item of [loadout.weapon, loadout.armor]) {
    for (const slot of item.slots) {
      if (!slot) continue;
      if (slot.kind === 'compound') {
        ids.push(slot.compoundId);
      }
    }
  }
  return ids;
}

function collectActiveSynergies(loadout: Loadout, registry: DataRegistry): string[] {
  const affixIds = collectAffixIds(loadout);
  const active: string[] = [];

  for (const synergy of registry.getAllSynergies()) {
    if (isSynergyActive(synergy.requiredAffixes, affixIds)) {
      active.push(synergy.id);
    }
  }

  return active;
}

