// @alloy/engine — Pure TypeScript game engine for Alloy
// No UI dependencies. Deterministic. Config-driven.

export * from './types/index.js';
export * from './data/index.js';
export { SeededRNG } from './rng/seeded-rng.js';
export { generatePool } from './pool/pool-generator.js';
export { createDraftState, makePick, autoPickRandom } from './draft/draft-state.js';
export type { DraftState, DraftResult } from './draft/draft-state.js';
export { createForgeState, applyForgeAction } from './forge/forge-state.js';
export type { ForgeState, ForgeResult } from './forge/forge-state.js';
export { createForgePlan, applyPlanAction, commitPlan, getPlannedStats, canUnsocketGem } from './forge/forge-plan.js';
export type { ForgePlan, PlanResult } from './forge/forge-plan.js';
export { earnFlux, spendFlux, canSpendFlux } from './run/flux-state.js';
export { calculateStats } from './forge/stat-calculator.js';
export type { StatsResult } from './forge/stat-calculator.js';
export { validateLoadout } from './forge/loadout-validator.js';
export type { LoadoutValidationResult } from './forge/loadout-validator.js';
export { simulate } from './duel/duel-engine.js';
export { createGladiator } from './duel/gladiator.js';
export { createMatch, applyAction, createDebugMatch } from './match/match-controller.js';
export type { DebugPhaseTarget } from './match/match-controller.js';
export { getNextPhase, getNextPhaseQuick, getNextPhaseRun, countWins } from './match/phase-machine.js';
export { AIController } from './ai/ai-controller.js';
export { generateSyntheticOpponent, getTierName } from './ai/synthetic-opponent.js';
export type { SyntheticOpponent } from './ai/synthetic-opponent.js';
export { defaultConfig, mergeConfig, GameConfigSchema } from './data/game-config.js';
export { extractMatchReport } from './match/match-report.js';
export { runSimulation, runRunSimulation } from './balance/simulation-runner.js';
export { computeAggregateStats } from './balance/stats-collector.js';
export { generateBalanceReport } from './balance/balance-report.js';
export type {
  SimulationConfig,
  SimulationResult,
  RunSimulationConfig,
  RunSimulationResult,
  RunReport,
  RoundDetail,
} from './balance/simulation-runner.js';
export type { AggregateStats } from './balance/stats-collector.js';
export type { BalanceIssue } from './balance/balance-report.js';

// Gem combination system
export { CombinationEngine } from './combine/combination-engine.js';
export type { CombineResult, CombineLayer, CombineConfig } from './combine/combination-engine.js';
export { RecipeRegistry } from './combine/recipe-registry.js';
export type { RecipeDefinition, RecipeComponent } from './combine/recipe-registry.js';
export { DiscoveryState } from './combine/discovery-state.js';
export {
  computeAverageQuality,
  applyMatchingRarityBonus,
  determineOutputTierRarity,
} from './combine/combine-quality.js';

// Run system
export {
  createRunState,
  loseLife,
  winRound,
  checkLifeRecovery,
  isRunOver,
  isGoalReached,
  advanceRound,
} from './run/run-state.js';
export type { RunState, CreateRunOpts, LifeRecoveryConfig } from './run/run-state.js';
export { getPoolConfigForRound, DEFAULT_SCALING } from './run/pool-scaling.js';
export type { PoolScalingEntry } from './run/pool-scaling.js';
