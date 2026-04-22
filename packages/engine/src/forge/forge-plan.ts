import type { ForgeState } from './forge-state.js';
import type { ForgeAction } from '../types/forge-action.js';
import type { GemInstance } from '../types/gem.js';
import { hasSecondarySlot, type SecondarySlot } from '../types/gem.js';
import type { Loadout, ForgedItem } from '../types/item.js';
import type { SlotArray } from '../types/match.js';
import {
  clearSlot,
  findSlotIndex,
  placeInFirstEmpty,
  setSlot,
} from '../types/slot-array.js';
import type { DataRegistry } from '../data/registry.js';
import { calculateStats, type StatsResult } from './stat-calculator.js';
import { CombinationEngine } from '../combine/combination-engine.js';
import { DiscoveryState } from '../combine/discovery-state.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { resolveTransplant } from './transplant/resolver.js';

export interface ForgePlan {
  /**
   * Fixed-slot stockpile. `null` entries are empty slots — positions are
   * preserved across sockets/combines so the player's arrangement never
   * shifts. Combine output lands in the keep-gem's original slot; unsocket
   * returns the gem to the first empty slot.
   */
  stockpile: SlotArray<GemInstance>;
  loadout: Loadout;
  round: number;
  lockedGemUids: Set<string>;
  actionLog: ForgeAction[];
  /** Deterministic RNG for plan-time operations (e.g. transplant_gem). Shared (not cloned) across plan snapshots. */
  rng: SeededRNG;
}

export type PlanResult = { ok: true; plan: ForgePlan } | { ok: false; error: string };

// ---- Deep clone helpers ----

function deepCloneItem(item: ForgedItem): ForgedItem {
  return {
    baseItemId: item.baseItemId,
    baseStats: item.baseStats ? { ...item.baseStats } : null,
    slots: item.slots.map(s => {
      if (!s) return null;
      return { gem: { ...s.gem } };
    }),
  };
}

function cloneStockpile(stockpile: SlotArray<GemInstance>): SlotArray<GemInstance> {
  return stockpile.map(g => (g === null ? null : { ...g }));
}

function clonePlan(plan: ForgePlan): ForgePlan {
  return {
    stockpile: cloneStockpile(plan.stockpile),
    loadout: {
      weapon: deepCloneItem(plan.loadout.weapon),
      armor: deepCloneItem(plan.loadout.armor),
    },
    round: plan.round,
    lockedGemUids: new Set(plan.lockedGemUids),
    actionLog: [...plan.actionLog],
    // Share the rng reference — forks give independent streams;
    // cloning the state would break determinism.
    rng: plan.rng,
  };
}

// ---- Public API ----

export function createForgePlan(state: ForgeState, _registry: DataRegistry, rng: SeededRNG): ForgePlan {
  return {
    stockpile: cloneStockpile(state.stockpile),
    loadout: {
      weapon: deepCloneItem(state.loadout.weapon),
      armor: deepCloneItem(state.loadout.armor),
    },
    round: state.round,
    lockedGemUids: new Set(),
    actionLog: [],
    rng,
  };
}

export function applyPlanAction(
  plan: ForgePlan,
  action: ForgeAction,
  registry: DataRegistry,
): PlanResult {
  switch (action.kind) {
    case 'socket_gem': return planSocketGem(plan, action);
    case 'unsocket_gem': return planUnsocketGem(plan, action);
    case 'set_base_stats': return planSetBaseStats(plan, action);
    case 'combine': return planCombine(plan, action, registry);
    case 'combine3': return planCombine3(plan, action, registry);
    case 'select_base_item': return planSelectBaseItem(plan, action);
    case 'transplant_gem': return planTransplantGem(plan, action, registry);
    default: return { ok: false, error: `Unsupported plan action: ${(action as ForgeAction).kind}` };
  }
}

// ---- Action handlers ----

function planSocketGem(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'socket_gem' }>,
): PlanResult {
  const gemIndex = findSlotIndex(plan.stockpile, g => g.uid === action.gemUid);
  if (gemIndex === -1) return { ok: false, error: 'Gem not in stockpile' };

  const item = plan.loadout[action.target];
  if (action.slotIndex < 0 || action.slotIndex >= item.slots.length) {
    return { ok: false, error: 'Invalid slot index' };
  }

  if (item.slots[action.slotIndex] !== null) {
    return { ok: false, error: 'Slot already occupied' };
  }

  const next = clonePlan(plan);
  const removedGem = next.stockpile[gemIndex]!;
  // Leave the stockpile slot empty rather than compacting — the player's
  // arrangement stays fixed across sockets.
  next.stockpile = clearSlot(next.stockpile, gemIndex);

  next.loadout[action.target].slots[action.slotIndex] = { gem: removedGem };
  next.actionLog.push(action);
  return { ok: true, plan: next };
}

function planUnsocketGem(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'unsocket_gem' }>,
): PlanResult {
  const item = plan.loadout[action.target];
  const slot = item.slots[action.slotIndex];
  if (!slot) return { ok: false, error: 'Slot is empty' };

  // Check locked gems
  if (plan.lockedGemUids.has(slot.gem.uid)) {
    return { ok: false, error: 'Cannot unsocket a locked gem' };
  }

  const next = clonePlan(plan);
  const removedSlot = next.loadout[action.target].slots[action.slotIndex]!;
  next.loadout[action.target].slots[action.slotIndex] = null;

  // Return gem to the first empty stockpile slot; if every slot is filled
  // the helper grows the array by one so the gem is never dropped.
  next.stockpile = placeInFirstEmpty(next.stockpile, removedSlot.gem);
  next.actionLog.push(action);
  return { ok: true, plan: next };
}

function planSetBaseStats(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'set_base_stats' }>,
): PlanResult {
  if (plan.round !== 1) return { ok: false, error: 'Base stats can only be set in Round 1' };

  const next = clonePlan(plan);
  next.loadout[action.target].baseStats = { stat1: action.stat1, stat2: action.stat2 };
  next.actionLog.push(action);
  return { ok: true, plan: next };
}

function planCombine(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'combine' }>,
  registry: DataRegistry,
): PlanResult {
  const gemIdx1 = findSlotIndex(plan.stockpile, g => g.uid === action.gemUid1);
  if (gemIdx1 === -1) return { ok: false, error: 'First gem not found in stockpile' };

  const gemIdx2 = findSlotIndex(plan.stockpile, g => g.uid === action.gemUid2);
  if (gemIdx2 === -1) return { ok: false, error: 'Second gem not found in stockpile' };

  const gem1 = plan.stockpile[gemIdx1]!;
  const gem2 = plan.stockpile[gemIdx2]!;

  if (!gem1.combinable) return { ok: false, error: 'First gem is not combinable' };
  if (!gem2.combinable) return { ok: false, error: 'Second gem is not combinable' };

  // Use the real 3-layer combine engine so plan preview matches the commit-time result.
  // A fresh DiscoveryState keeps this preview independent of the run's actual discoveries;
  // the commit path re-runs through the authoritative state and records any new recipe finds.
  const recipeRegistry = registry.getRecipeRegistry();
  const categoryMap: Record<string, string> = {};
  for (const affix of registry.getAllAffixes()) {
    categoryMap[affix.id] = affix.category;
  }
  const engine = new CombinationEngine(recipeRegistry, new DiscoveryState(), categoryMap);

  const outputUid = `combined_${action.gemUid1}_${action.gemUid2}`;
  let result;
  try {
    result = engine.combine(gem1, gem2, outputUid, action.keepGemUid);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const next = clonePlan(plan);

  // Combine output lands in the keep-gem's original slot so the player's
  // arrangement stays stable; the other ingredient's slot becomes empty.
  const keepIdx = action.keepGemUid === action.gemUid1 ? gemIdx1 : gemIdx2;
  const ingredientIdx = keepIdx === gemIdx1 ? gemIdx2 : gemIdx1;
  next.stockpile = setSlot(next.stockpile, keepIdx, result.gem);
  next.stockpile = clearSlot(next.stockpile, ingredientIdx);

  // Lock source gems
  next.lockedGemUids.add(action.gemUid1);
  next.lockedGemUids.add(action.gemUid2);

  next.actionLog.push(action);
  return { ok: true, plan: next };
}

function planCombine3(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'combine3' }>,
  registry: DataRegistry,
): PlanResult {
  const idx1 = findSlotIndex(plan.stockpile, g => g.uid === action.gemUid1);
  if (idx1 === -1) return { ok: false, error: 'First gem not found in stockpile' };
  const idx2 = findSlotIndex(plan.stockpile, g => g.uid === action.gemUid2);
  if (idx2 === -1) return { ok: false, error: 'Second gem not found in stockpile' };
  const idx3 = findSlotIndex(plan.stockpile, g => g.uid === action.gemUid3);
  if (idx3 === -1) return { ok: false, error: 'Third gem not found in stockpile' };

  const g1 = plan.stockpile[idx1]!;
  const g2 = plan.stockpile[idx2]!;
  const g3 = plan.stockpile[idx3]!;

  if (!g1.combinable) return { ok: false, error: 'First gem is not combinable' };
  if (!g2.combinable) return { ok: false, error: 'Second gem is not combinable' };
  if (!g3.combinable) return { ok: false, error: 'Third gem is not combinable' };

  const recipeRegistry = registry.getRecipeRegistry();
  const categoryMap: Record<string, string> = {};
  for (const affix of registry.getAllAffixes()) categoryMap[affix.id] = affix.category;
  const engine = new CombinationEngine(recipeRegistry, new DiscoveryState(), categoryMap);

  const outputUid = `combined3_${action.gemUid1}_${action.gemUid2}_${action.gemUid3}`;
  let result;
  try {
    result = engine.combine3(g1, g2, g3, outputUid, action.keepGemUid);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const next = clonePlan(plan);

  // Output lands in the keep-gem's slot; consumed ingredients vacate theirs.
  const slotByUid: Record<string, number> = {
    [action.gemUid1]: idx1,
    [action.gemUid2]: idx2,
    [action.gemUid3]: idx3,
  };
  const keepUid = action.keepGemUid ?? action.gemUid1;
  const keepIdx = slotByUid[keepUid] ?? idx1;
  next.stockpile = setSlot(next.stockpile, keepIdx, result.gem);
  // Clear consumed slots, but never the keep-slot — the combination engine
  // may list the kept gem as "consumed" logically, but its slot now holds
  // the output and must not be emptied.
  for (const uid of result.consumedUids) {
    const idx = slotByUid[uid];
    if (idx !== undefined && idx !== keepIdx) {
      next.stockpile = clearSlot(next.stockpile, idx);
    }
  }
  // Lock only consumed uids (ejected gem stays unlocked and can combine again)
  for (const uid of result.consumedUids) next.lockedGemUids.add(uid);

  next.actionLog.push(action);
  return { ok: true, plan: next };
}

function planTransplantGem(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'transplant_gem' }>,
  registry: DataRegistry,
): PlanResult {
  if (action.targetGemUid === action.sourceGemUid) {
    return { ok: false, error: 'Target and source must be different gems' };
  }

  const targetIdx = findSlotIndex(plan.stockpile, g => g.uid === action.targetGemUid);
  if (targetIdx === -1) return { ok: false, error: 'Target gem not found in stockpile' };

  const sourceIdx = findSlotIndex(plan.stockpile, g => g.uid === action.sourceGemUid);
  if (sourceIdx === -1) return { ok: false, error: 'Source gem not found in stockpile' };

  const target = plan.stockpile[targetIdx]!;
  const source = plan.stockpile[sourceIdx]!;

  const threshold = registry.getBalance().transplant.unlockThreshold;
  if (!hasSecondarySlot(target, threshold)) {
    return { ok: false, error: 'Target does not have an open secondary slot' };
  }
  if (target.secondary) {
    return { ok: false, error: 'Target secondary slot is already filled' };
  }
  if (action.chosenAffix === 'secondary' && !source.secondary) {
    return { ok: false, error: 'Source has no secondary affix to choose' };
  }

  const rng = plan.rng.fork(`transplant_${target.uid}_${source.uid}`);
  const slot: SecondarySlot = resolveTransplant({ target, source, chosenAffix: action.chosenAffix, rng });

  const next = clonePlan(plan);
  const updatedTarget: GemInstance = {
    ...target,
    secondary: slot,
    tags: target.tags.includes(slot.affixId) ? target.tags : [...target.tags, slot.affixId],
  };

  next.stockpile = setSlot(next.stockpile, targetIdx, updatedTarget);
  next.stockpile = clearSlot(next.stockpile, sourceIdx);

  next.lockedGemUids.add(action.targetGemUid);
  next.lockedGemUids.add(action.sourceGemUid);

  next.actionLog.push(action);
  return { ok: true, plan: next };
}

function planSelectBaseItem(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'select_base_item' }>,
): PlanResult {
  if (plan.round !== 1) return { ok: false, error: 'Base item can only be selected in Round 1' };

  const next = clonePlan(plan);
  next.loadout[action.target].baseItemId = action.baseItemId;
  next.actionLog.push(action);
  return { ok: true, plan: next };
}

// ---- Query / commit functions ----

export function commitPlan(plan: ForgePlan): ForgeAction[] {
  return [...plan.actionLog];
}

export function getPlannedStats(plan: ForgePlan, registry: DataRegistry): StatsResult {
  return calculateStats(plan.loadout, registry);
}

export function canUnsocketGem(plan: ForgePlan, target: 'weapon' | 'armor', slotIndex: number): boolean {
  const slot = plan.loadout[target].slots[slotIndex];
  if (!slot) return false;

  if (plan.lockedGemUids.has(slot.gem.uid)) return false;
  return true;
}
