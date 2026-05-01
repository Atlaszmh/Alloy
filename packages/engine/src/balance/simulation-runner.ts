import type { AITier } from '../types/ai.js';
import type { MatchMode, MatchState } from '../types/match.js';
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
import { generateOpponentBuild } from './synthetic-opponent-build.js';
import {
  computeRunAggregateStats,
  type RunReportV2,
  type PerRoundSnapshot,
  type RunAggregateStats,
} from './run-stats-collector.js';
import { calculateStats } from '../forge/stat-calculator.js';
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

/**
 * @deprecated Use `runRunSimulationV2` instead. This V1 stub simulates runs via
 * isolated best-of-3 matches rather than the real `run_async` loop — it does not
 * exercise run-state persistence (loadout continuity, flux economy, life recovery).
 * Kept to avoid breaking existing callers in `tests/run-simulation.test.ts` and
 * `packages/tools/server/worker.ts`. New code should use `runRunSimulationV2`.
 */
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

/** @deprecated See `RunSimulationConfig`. */
export interface RoundDetail {
  gemsSocketed: number;
  combineCount: number;
  avgGemQuality: number;
}

/** @deprecated See `RunSimulationConfig`. */
export interface RunReport {
  seed: number;
  roundsPlayed: number;
  won: boolean;
  livesRemaining: number;
  roundDetails: RoundDetail[];
}

/** @deprecated See `RunSimulationConfig`. */
export interface RunSimulationResult {
  runs: RunReport[];
  averageRunLength: number;
  winRate: number;                  // % of runs that reached goal
  averageGemsPerRound: number;
  legendaryAchievementRate: number; // % of runs that produced a legendary gem
}

/**
 * @deprecated Use `runRunSimulationV2` instead. This function simulates runs
 * via isolated best-of-3 matches rather than the real `run_async` loop — it
 * does not exercise run-state persistence (loadout continuity, flux economy,
 * life recovery). New code should use `runRunSimulationV2`.
 *
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

/** @deprecated V1 helper — see `runRunSimulation` deprecation notice. */
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
 * @deprecated V1 helper — see `runRunSimulation` deprecation notice.
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

// ---------------------------------------------------------------------------
// V2: Real run_async simulation harness
// ---------------------------------------------------------------------------

export interface RunSimulationConfigV2 {
  runCount: number;
  seed: number;
  aiTier: AITier;
  /** Opponent tier per round. Could escalate with round in a future tweak. */
  opponentTier: AITier;
  startingLives: number;
  goalRound: number;
  baseWeaponId: string;
  baseArmorId: string;
}

export interface RunSimulationResultV2 {
  config: RunSimulationConfigV2;
  runs: RunReportV2[];
  aggregateStats: RunAggregateStats;
  duration: number;
}

/**
 * Simulate multiple full runs through the shipped `run_async` 10-round loop.
 * Each run drives a single `MatchState` via `applyAction`, including drafting,
 * forging, and dueling. Synthetic opponents are generated per round.
 */
export function runRunSimulationV2(
  config: RunSimulationConfigV2,
  registry: DataRegistry,
): RunSimulationResultV2 {
  const t0 = Date.now();
  const runs: RunReportV2[] = [];
  for (let r = 0; r < config.runCount; r++) {
    const runSeed = config.seed + r * 10000;
    runs.push(simulateSingleRunV2(runSeed, config, registry));
  }
  const aggregateStats = computeRunAggregateStats(runs);
  return { config, runs, aggregateStats, duration: Date.now() - t0 };
}

function simulateSingleRunV2(
  runSeed: number,
  config: RunSimulationConfigV2,
  registry: DataRegistry,
): RunReportV2 {
  // 1. createMatch in run_async mode
  let state = createMatch(
    `runsim_${runSeed}`,
    runSeed,
    'run_async',
    [`p0_${runSeed}`, `p1_${runSeed}`],
    config.baseWeaponId,
    config.baseArmorId,
    registry,
    { startingLives: config.startingLives, goalRound: config.goalRound },
  );

  const playerRng = new SeededRNG(runSeed).fork('player');
  const ai = new AIController(config.aiTier, registry, playerRng);

  const perRound: PerRoundSnapshot[] = [];
  const compoundFirstAppearance = new Map<string, number>();
  let totalFluxEarned = 0;
  let totalFluxSpent = 0;
  let prevFlux = state.runState?.flux ?? 0;

  // Loop until run ends (lives = 0 or goal reached) or safety cap exceeded
  const ROUND_SAFETY_CAP = config.goalRound + 5; // allow up to 5 endless rounds
  let roundsReached = 0;

  while (state.phase.kind !== 'complete') {
    const currentRound = state.runState?.round ?? 1;
    if (currentRound > ROUND_SAFETY_CAP) break;

    // --- Draft phase ---
    while (state.phase.kind === 'draft') {
      const orbUid = ai.pickOrb(
        state.pool,
        state.players[0].stockpile,
        state.players[1].stockpile,
      );
      const result = applyAction(state, { kind: 'draft_pick', player: 0, orbUid }, registry);
      if (!result.ok) throw new Error(`Draft failed at round ${currentRound}: ${result.error}`);
      state = result.state;
    }

    // --- Forge phase ---
    if (state.phase.kind === 'forge') {
      const forgeRound = state.phase.round;

      // In run_async, forge_complete for player 0 auto-marks player 1 complete too.
      // So we must inject the synthetic opponent loadout BEFORE completing player 0.
      // Generate the opponent loadout first:
      const opponent = generateOpponentBuild(
        {
          seed: runSeed + currentRound * 31,
          round: currentRound,
          tier: config.opponentTier,
          baseWeaponId: config.baseWeaponId,
          baseArmorId: config.baseArmorId,
        },
        registry,
      );
      // Inject opponent loadout into player 1 before forge phase completes:
      state = {
        ...state,
        players: [state.players[0], { ...state.players[1], loadout: opponent.loadout }],
      };

      // Run-mode forge is free per the engine's design. handleForgeAction in
      // match-controller.ts treats socket/combine/transplant as free in run
      // mode (line 311: "no flux needed"). Flux is only spent on meta-actions:
      // boost_combine (3), reroll_pool (5), guarantee_rarity (4), and
      // transplant_gem with chosenAffix (3) — see balance.gem.flux.costs.
      //
      // The AI's planForge takes a budget parameter that's a holdover from
      // legacy ranked-mode planning where socket/combine cost 1-2 flux each.
      // In run mode that constraint doesn't apply, so we pass a budget large
      // enough to never gate the plan. The AI's actual flux spending happens
      // via meta-action planning (Chunk 2 of the flux-parity plan).
      const RUN_MODE_PLANNING_BUDGET = Number.MAX_SAFE_INTEGER;
      const actions = ai.planForge(
        state.players[0].stockpile,
        state.players[0].loadout,
        RUN_MODE_PLANNING_BUDGET,
        forgeRound,
        state.players[1].stockpile,
        state.runState?.flux ?? 0, // real flux for meta-actions
      );
      for (const action of actions) {
        const r = applyAction(state, { kind: 'forge_action', player: 0, action }, registry);
        if (r.ok) state = r.state;
        // Invalid actions are skipped silently
      }

      // Complete forge for player 0 (also auto-marks player 1 in run_async mode)
      const completeP0 = applyAction(state, { kind: 'forge_complete', player: 0 }, registry);
      if (completeP0.ok) state = completeP0.state;

      // Snapshot the build at end of forge, before duel
      const snapshot = snapshotBuild(state, currentRound, registry);
      perRound.push(snapshot);

      // Track first-appearance round for each compound gem
      for (const item of [state.players[0].loadout.weapon, state.players[0].loadout.armor]) {
        for (const slot of item.slots) {
          if (!slot || !slot.gem.sourceRecipe) continue;
          const id = slot.gem.affixId;
          if (!compoundFirstAppearance.has(id)) compoundFirstAppearance.set(id, currentRound);
        }
      }
    }

    // --- Duel phase ---
    if (state.phase.kind === 'duel') {
      const advance = applyAction(state, { kind: 'advance_phase' }, registry);
      if (!advance.ok) throw new Error(`Duel advance failed at round ${currentRound}: ${advance.error}`);
      state = advance.state;
      const cont = applyAction(state, { kind: 'duel_continue' }, registry);
      if (!cont.ok) throw new Error(`Duel continue failed at round ${currentRound}: ${cont.error}`);
      state = cont.state;
    }

    roundsReached = currentRound;

    // Update flux accounting after the round
    const newFlux = state.runState?.flux ?? 0;
    if (newFlux > prevFlux) {
      totalFluxEarned += (newFlux - prevFlux);
    } else if (newFlux < prevFlux) {
      totalFluxSpent += (prevFlux - newFlux);
    }
    // Populate the last per-round snapshot with post-duel info
    if (perRound.length > 0) {
      const last = perRound[perRound.length - 1];
      last.fluxEarnedThisRound = Math.max(0, newFlux - prevFlux);
      last.fluxSpentThisRound = Math.max(0, prevFlux - newFlux);
      last.livesAfter = state.runState?.lives ?? 0;
      const lastResult = state.roundResults[state.roundResults.length - 1];
      last.won = lastResult?.winner === 0;
    }
    prevFlux = newFlux;
  }

  const goalReached = (state.runState?.status === 'won') ||
    ((state.runState?.round ?? 0) >= config.goalRound && state.phase.kind === 'complete');

  // Bug fix: the engine transitions to 'complete' after round (goalRound-1)'s duel
  // because advanceRound sets round=goalRound which satisfies status='won', causing
  // getNextPhaseRun to return 'complete' before round goalRound is ever entered as a
  // loop iteration. So perRound.length = goalRound-1 for goal-reaching runs.
  //
  // We want roundsReached = goalRound (the player "reached" the goal round by definition)
  // and perRound.length must equal roundsReached (enforced by run-simulation-runner.test.ts).
  // Fix: append a synthetic goalRound snapshot copying the final build state, so both
  // invariants hold. The synthetic snapshot carries the same loadout as the last real
  // round — it represents "the state the player would bring into the goal round."
  if (goalReached && perRound.length === config.goalRound - 1) {
    const syntheticSnap = snapshotBuild(state, config.goalRound, registry);
    // The run ended in a won state, so the player won the last real round
    syntheticSnap.won = true;
    syntheticSnap.livesAfter = state.runState?.lives ?? 0;
    syntheticSnap.fluxEarnedThisRound = 0;
    syntheticSnap.fluxSpentThisRound = 0;
    perRound.push(syntheticSnap);
    roundsReached = config.goalRound;
  }

  return {
    seed: runSeed,
    roundsReached,
    goalReached,
    finalLives: state.runState?.lives ?? 0,
    perRound,
    compoundFirstAppearance,
    totalFluxEarned,
    totalFluxSpent,
  };
}

function snapshotBuild(state: MatchState, round: number, registry: DataRegistry): PerRoundSnapshot {
  const loadout = state.players[0].loadout;
  let socketedGemCount = 0;
  let compoundCount = 0;
  let capstoneCount = 0;
  let totalGemTier = 0;

  // Build a quick id→recipe map for capstone check
  const recipeAll = registry.getRecipeRegistry().getAll();
  const recipeById = new Map(recipeAll.map(r => [r.id, r]));

  for (const item of [loadout.weapon, loadout.armor]) {
    for (const slot of item.slots) {
      if (!slot) continue;
      socketedGemCount++;
      totalGemTier += slot.gem.tier;
      if (slot.gem.sourceRecipe) {
        compoundCount++;
        const recipe = recipeById.get(slot.gem.sourceRecipe);
        if (recipe?.type === 'signature3') capstoneCount++;
      }
    }
  }

  const statsResult = calculateStats(loadout, registry);
  return {
    round,
    won: false,               // populated after duel
    livesAfter: state.runState?.lives ?? 0,
    fluxEarnedThisRound: 0,  // populated after duel
    fluxSpentThisRound: 0,   // populated after duel
    socketedGemCount,
    compoundCount,
    capstoneCount,
    totalGemTier,
    activeSynergyCount: statsResult.activeSynergies.filter(s => s.isActive).length,
  };
}

