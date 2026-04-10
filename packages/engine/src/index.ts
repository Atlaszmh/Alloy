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
export { createForgePlan, applyPlanAction, commitPlan, getPlannedStats, canRemoveOrb } from './forge/forge-plan.js';
export type { ForgePlan, PlanResult } from './forge/forge-plan.js';
export { getFluxForRound, getActionCost } from './forge/flux-tracker.js';
export { calculateStats } from './forge/stat-calculator.js';
export { validateLoadout } from './forge/loadout-validator.js';
export type { LoadoutValidationResult } from './forge/loadout-validator.js';
export { simulate } from './duel/duel-engine.js';
export { createGladiator } from './duel/gladiator.js';
export { createMatch, applyAction, createDebugMatch } from './match/match-controller.js';
export type { DebugPhaseTarget } from './match/match-controller.js';
export { getNextPhase } from './match/phase-machine.js';
export { AIController } from './ai/ai-controller.js';
export { defaultConfig, mergeConfig, GameConfigSchema } from './data/game-config.js';
export { extractMatchReport } from './match/match-report.js';
export { runSimulation } from './balance/simulation-runner.js';
export { computeAggregateStats } from './balance/stats-collector.js';
export { generateBalanceReport } from './balance/balance-report.js';
export type { SimulationConfig, SimulationResult } from './balance/simulation-runner.js';
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
