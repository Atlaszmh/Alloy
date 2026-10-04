// @alloy/engine — Pure TypeScript game engine for Alloy
// No UI dependencies. Deterministic. Config-driven.

export * from './types/index.js';
export * from './data/index.js';
export { SeededRNG } from './rng/seeded-rng.js';

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
export { salvageValue, upgradeCost, reforgeCost } from './loot/smithing.js';
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
  applyBuffs,
  hasMastery,
  isAttuneStat,
  basicIncome,
  strikeInterval,
  manaSupport,
  expectedHit,
  chainCycle,
} from './delve/hero-stats.js';
export type {
  ItemComparison,
  ItemStatLine,
  CombatEstimate,
  HeroStatsExtra,
  WeaponValue,
  ManaSupport,
  ChainCycle,
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
  settleDive,
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
export {
  STOP_KINDS,
  stopKinds,
  rollStop,
  takeStop,
  alcoveOffers,
  takeAlcove,
} from './delve/stops.js';
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
  RuneRefSchema,
  RunePouchSchema,
  SLOT_FORMS,
} from './delve/profile-schema.js';
export { runAutopilot, takeBestAlcove, takeBestStop } from './delve/autopilot.js';
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
  pressIndex,
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
  baseCost,
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
export {
  simulateDps,
  dpsCombos,
  dpsKey,
  runeComboSetups,
  DPS_SECONDS,
  DPS_SAMPLE,
} from './arpg/dps-sim.js';
export type { DpsSetup, DpsOptions, DpsResult } from './arpg/dps-sim.js';

// Runes (see the runes spec): every module whole, so the waves that build them never edit this file.
export * from './loot/runes.js';
export * from './delve/runes.js';
export * from './arpg/abilities/echo.js';
export * from './arpg/rune-drops.js';
export { knobHitOpts } from './arpg/abilities/impact.js';
export { guardLand } from './arpg/abilities/defend.js';

// Crafting (see the crafting spec): every module whole, so the areas that build them never edit this file.
export * from './loot/materials.js';
export * from './loot/forge.js';
export * from './loot/salvage-yield.js';
export * from './delve/crafting.js';
export * from './delve/economy.js';
export * from './arpg/material-drops.js';

// Quests (see the quests spec): every module whole, so the areas that build them never edit this file.
export * from './delve/quests.js';
export * from './delve/rewards.js';
export * from './delve/contracts.js';
export { questsDataProblems } from './data/quests-check.js';

// Floor maps (see the floor maps spec): every module whole, so the areas that build them never edit this file.
export * from './arpg/grid.js';
export * from './arpg/layout/generate.js';
export * from './arpg/flow.js';
export * from './arpg/interact.js';
export * from './arpg/seal.js';
export * from './arpg/fog.js';
