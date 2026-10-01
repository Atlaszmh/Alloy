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
export {
  createForgePlan,
  applyPlanAction,
  commitPlan,
  getPlannedStats,
  canUnsocketGem,
} from './forge/forge-plan.js';
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
export {
  getNextPhase,
  getNextPhaseQuick,
  getNextPhaseRun,
  countWins,
} from './match/phase-machine.js';
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
export type {
  CombineResult,
  CombineLayer,
  CombineConfig,
  CombinePreview,
} from './combine/combination-engine.js';
export { RecipeRegistry } from './combine/recipe-registry.js';
export type { RecipeDefinition, RecipeComponent } from './combine/recipe-registry.js';
export { DiscoveryState } from './combine/discovery-state.js';
export {
  computeAverageQuality,
  applyMatchingRarityBonus,
  determineOutputTierRarity,
} from './combine/combine-quality.js';

// Transplant system
export { previewTransplant } from './forge/transplant/preview.js';
export type {
  TransplantPreview,
  TransplantContext,
  TransplantModifier,
} from './forge/transplant/types.js';

// Run system
export {
  createRunState,
  loseLife,
  winRound,
  checkLifeRecovery,
  isRunOver,
  isGoalReached,
  advanceRound,
  previewRoundResult,
} from './run/run-state.js';
export type { RunState, CreateRunOpts, LifeRecoveryConfig, RoundPreview } from './run/run-state.js';
export { getPoolConfigForRound, DEFAULT_SCALING } from './run/pool-scaling.js';
export type { PoolScalingEntry } from './run/pool-scaling.js';

// Delve (loot-crawler mode)
export { createDefaultRegistry } from './data/default-registry.js';
export {
  generateItem,
  rollRarity,
  rarityWeights,
  materialName,
  baseDisplayName,
  itemLevelScale,
} from './loot/item-generator.js';
export type { ItemGenOptions, RarityRollContext } from './loot/item-generator.js';
export { rollEncounterDrops } from './loot/drops.js';
export { salvageValue, upgradeCost, reforgeCost, fuseCost, checkFusion } from './loot/smithing.js';
export {
  computeHeroStats,
  computeAttunement,
  estimateCombat,
  compareItem,
  heroPower,
  itemStatLines,
  itemAffinityAttunement,
  itemAttunement,
  attuneElement,
  pairElements,
  upgradeMultiplier,
  armorReduction,
  manaPool,
  hasMastery,
  isAttuneStat,
} from './delve/hero-stats.js';
export type {
  ItemComparison,
  ItemStatLine,
  CombatEstimate,
  HeroStatsExtra,
  WeaponValue,
} from './delve/hero-stats.js';
export {
  isBossDepth,
  isDiveActive,
  startDepthOptions,
  startDive,
  floorSeed,
  beginFloor,
  bankWorld,
  completeFloor,
  failFloor,
  chooseDoor,
  extractDive,
  closeDive,
  drinkPotionBetweenFloors,
} from './delve/dive.js';
export type { BankResult, FloorResult } from './delve/dive.js';
export {
  createDelveProfile,
  parseDelveProfile,
  referenceDepth,
  profilePower,
  findItem,
  equipItem,
  unequipSlot,
  toggleLock,
  setAutoSalvage,
  salvageItems,
  salvageCandidates,
  equipBest,
  EQUIP_BEST_SLOTS,
  upgradeGear,
  reforgeGear,
  fuseGear,
  chainFromBuild,
} from './delve/profile.js';
export {
  setChain,
  setChains,
  movesetEditPrice,
  editPrice,
  addSlot,
  slotPrice,
  transferMoveset,
  movesOf,
  moveKey,
  sameChain,
  withMove,
  takesElements,
  legendaryNeeds,
} from './delve/moveset.js';
export { STOP_KINDS, stopKinds, rollStop, takeStop } from './delve/stops.js';
export type { StopAction } from './delve/stops.js';
export type { ProfileActionResult, ParsedDelveProfile } from './delve/profile.js';
export {
  inPair,
  profileStats,
  fixChainsToPair,
  chooseStartingMana,
  bindSecondary,
  realign,
  resolveOvertake,
  overtakeProgress,
  reattuneItem,
  reattuneCost,
  salvageDust,
} from './delve/pair.js';
export type { ChainFix } from './delve/pair.js';
export {
  heroChains,
  movesetOf,
  defaultMoveset,
  extraSlots,
  baseSlots,
  carriedSkills,
  carriedByText,
  movesetTransfer,
} from './loot/moveset.js';
export type { MovesetTransfer } from './loot/moveset.js';
export {
  GearItemSchema,
  MoveSchema,
  BlowSchema,
  ChainSchema,
  SLOT_FORMS,
} from './delve/profile-schema.js';
export { runAutopilot, takeBestStop } from './delve/autopilot.js';
export type { AutopilotOptions, AutopilotDiveReport } from './delve/autopilot.js';

// ARPG arena simulation
export {
  createFloorWorld,
  refreshWorldHero,
  createMonsterEntity,
  biomeCycle,
  isBossFloor,
} from './arpg/world.js';
export type { FloorOptions } from './arpg/world.js';
export { stepWorld } from './arpg/step.js';
export { basicStep } from './arpg/basic.js';
export { botInput } from './arpg/bot.js';
export { dropHold } from './arpg/action.js';
export {
  castAbility,
  abilityReady,
  canAfford,
  pressStep,
  nextMove,
  pressMove,
  activeMove,
  holdCharge,
  inBeat,
  windupDir,
} from './arpg/abilities/cast.js';
export {
  resolveAbility,
  resolveChain,
  moveWeight,
  chainMove,
  chargeCap,
  stepBonus,
  beatFor,
  moveBeat,
  holdFull,
  playedKind,
  moveNumbers,
  blowNumbers,
  mergeKnobs,
  NEUTRAL,
  defaultBasic,
  defaultChains,
  stepHeft,
  basicLoadout,
  isDefaultBasic,
  followBasic,
} from './arpg/abilities/resolve.js';
export type { BasicLoadout } from './arpg/abilities/resolve.js';
export { makeCtx, BASIC_STATUS } from './arpg/combat.js';
export {
  createSandboxWorld,
  setSandboxToggles,
  spawnDummies,
  resetDummies,
  spawnMonsters,
  clearMonsters,
  fillCharge,
  respawnHero,
  sandboxWeapon,
} from './arpg/sandbox.js';
export type { SandboxWorldOptions } from './arpg/sandbox.js';
export { simulateDps, dpsCombos, dpsKey, DPS_SECONDS, DPS_SAMPLE } from './arpg/dps-sim.js';
export type { DpsSetup, DpsOptions, DpsResult } from './arpg/dps-sim.js';

// Runes (see the runes spec): every module whole, so the waves that build them never edit this file.
export * from './loot/runes.js';
export * from './delve/runes.js';
export * from './arpg/abilities/echo.js';
export * from './arpg/rune-drops.js';
export { knobHitOpts } from './arpg/abilities/impact.js';
export { guardLand } from './arpg/abilities/defend.js';
