import type { AITier } from '../types/ai.js';
import type { MatchMode } from '../types/match.js';
import type { MatchReport } from '../types/match-report.js';
import type { DataRegistry } from '../data/registry.js';
import { createMatch, applyAction } from '../match/match-controller.js';
import { AIController } from '../ai/ai-controller.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { computeAggregateStats, type AggregateStats } from './stats-collector.js';
import { extractMatchReport } from '../match/match-report.js';
import { calculateEffectiveValue } from '../types/gem.js';
import {
  createRunState,
  loseLife,
  winRound,
  advanceRound,
  checkLifeRecovery,
  isRunOver,
  isGoalReached,
} from '../run/run-state.js';
// Pool scaling is now integrated into generatePool

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

// --- Run Simulation (multi-round with lives) ---

export interface RunSimulationConfig {
  runCount: number;        // Number of runs to simulate
  maxRounds: number;       // Max rounds per run (e.g., 20)
  startingLives: number;   // Default: 3
  goalRound: number;       // Default: 10
  seed: number;
  aiTier: AITier;          // AI tier for draft + forge decisions
  mode: MatchMode;
  baseWeaponId: string;
  baseArmorId: string;
}

export interface RoundDetail {
  gemsSocketed: number;
  combineCount: number;
  avgGemQuality: number;
}

export interface RunReport {
  seed: number;
  roundsPlayed: number;
  won: boolean;
  livesRemaining: number;
  roundDetails: RoundDetail[];
}

export interface RunSimulationResult {
  runs: RunReport[];
  averageRunLength: number;
  winRate: number;                  // % of runs that reached goal
  averageGemsPerRound: number;
  legendaryAchievementRate: number; // % of runs that produced a legendary gem
}

/**
 * Simulate full runs (multiple rounds with lives) using the run-state system.
 * Each run plays matches until lives run out or the goal round is reached.
 */
export function runRunSimulation(
  config: RunSimulationConfig,
  registry: DataRegistry,
): RunSimulationResult {
  const runs: RunReport[] = [];

  for (let r = 0; r < config.runCount; r++) {
    const runSeed = config.seed + r * 10000;
    const report = simulateSingleRun(runSeed, config, registry);
    runs.push(report);
  }

  const totalRounds = runs.reduce((sum, r) => sum + r.roundsPlayed, 0);
  const averageRunLength = runs.length > 0 ? totalRounds / runs.length : 0;
  const winRate = runs.length > 0
    ? (runs.filter(r => r.won).length / runs.length) * 100
    : 0;

  // Average gems per round across all runs
  let totalGems = 0;
  let totalRoundDetails = 0;
  let runsWithLegendary = 0;

  for (const run of runs) {
    let hasLegendary = false;
    for (const rd of run.roundDetails) {
      totalGems += rd.gemsSocketed;
      totalRoundDetails++;
      // A legendary gem has quality >= 3.0 (tier 1 * legendary 3.0 multiplier)
      if (rd.avgGemQuality >= 3.0) hasLegendary = true;
    }
    if (hasLegendary) runsWithLegendary++;
  }

  const averageGemsPerRound = totalRoundDetails > 0 ? totalGems / totalRoundDetails : 0;
  const legendaryAchievementRate = runs.length > 0
    ? (runsWithLegendary / runs.length) * 100
    : 0;

  return {
    runs,
    averageRunLength,
    winRate,
    averageGemsPerRound,
    legendaryAchievementRate,
  };
}

function simulateSingleRun(
  runSeed: number,
  config: RunSimulationConfig,
  registry: DataRegistry,
): RunReport {
  let runState = createRunState({
    startingLives: config.startingLives,
    goalRound: config.goalRound,
  });

  const roundDetails: RoundDetail[] = [];

  while (runState.status === 'active' && runState.round <= config.maxRounds) {
    const roundSeed = runSeed + runState.round;
    // Pool scaling is now handled inside generatePool via getPoolConfigForRound

    // Run one match (best-of-3) for this round
    const matchReport = runAIMatch(
      roundSeed,
      config.aiTier,
      config.aiTier, // opponent is same tier for now
      {
        matchCount: 1,
        aiTier1: config.aiTier,
        aiTier2: config.aiTier,
        seedStart: roundSeed,
        mode: config.mode,
        baseWeaponId: config.baseWeaponId,
        baseArmorId: config.baseArmorId,
      },
      registry,
    );

    // Extract round metrics from the match report
    const detail = extractRoundDetail(matchReport);
    roundDetails.push(detail);

    // Determine if the "run player" (player 0) won or lost this round
    const player0Won = matchReport.winner === 0;

    if (player0Won) {
      runState = winRound(runState);
    } else {
      runState = loseLife(runState);
    }

    // Check for life recovery
    runState = checkLifeRecovery(runState);

    // Check termination conditions before advancing
    if (isRunOver(runState) || isGoalReached(runState)) {
      break;
    }

    runState = advanceRound(runState);
  }

  return {
    seed: runSeed,
    roundsPlayed: roundDetails.length,
    won: runState.status === 'won' || isGoalReached(runState),
    livesRemaining: runState.lives,
    roundDetails,
  };
}

/**
 * Extract per-round metrics from a completed match report.
 */
function extractRoundDetail(report: MatchReport): RoundDetail {
  // Count gems socketed from player 0's loadout
  const loadout = report.players[0]?.loadout;
  let gemsSocketed = 0;
  let totalQuality = 0;

  if (loadout) {
    for (const item of [loadout.weapon, loadout.armor]) {
      for (const slot of item.slots) {
        if (slot) {
          gemsSocketed++;
          totalQuality += calculateEffectiveValue(slot.gem.tier, slot.gem.rarity);
        }
      }
    }
  }

  const avgGemQuality = gemsSocketed > 0 ? totalQuality / gemsSocketed : 0;

  // combineCount: count gems with recipeDepth > 0 (they were produced by combining)
  let combineCount = 0;
  if (loadout) {
    for (const item of [loadout.weapon, loadout.armor]) {
      for (const slot of item.slots) {
        if (slot && slot.gem.recipeDepth > 0) {
          combineCount++;
        }
      }
    }
  }

  return { gemsSocketed, combineCount, avgGemQuality };
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

  // Forge + Duel rounds (with draft for rounds 2/3 in ranked mode)
  while (state.phase.kind !== 'complete') {
    // Handle draft phases for rounds 2/3
    if (state.phase.kind === 'draft') {
      while (state.phase.kind === 'draft') {
        const player = state.phase.activePlayer;
        const ai = player === 0 ? ai0 : ai1;
        const orbUid = ai.pickOrb(
          state.pool,
          state.players[player].stockpile,
          state.players[1 - player as 0 | 1].stockpile,
        );
        const result = applyAction(state, { kind: 'draft_pick', player, orbUid }, registry);
        if (!result.ok) throw new Error(`Draft (round ${state.phase.round}) failed: ${result.error}`);
        state = result.state;
      }
    }

    if (state.phase.kind === 'forge') {
      const forgePhase = state.phase;
      for (const player of [0, 1] as const) {
        const ai = player === 0 ? ai0 : ai1;
        const actions = ai.planForge(
          state.players[player].stockpile,
          state.players[player].loadout,
          // Generous flux budget — match-controller no longer gates forge
          // actions on flux for simulation, but the AI strategies still use
          // flux as their action budget. Passing a high value lets the AI
          // exercise its full plan (socket every gem, combine eligible
          // pairs/triples) without artificial cap.
          1000,
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
  }

  return extractMatchReport(state, 'simulation', seed, registry);
}

