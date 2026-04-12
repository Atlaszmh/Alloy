import type { ForgeState } from './forge-state.js';
import type { ForgeAction } from '../types/forge-action.js';
import type { GemInstance } from '../types/gem.js';
import type { Loadout, ForgedItem } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import { calculateStats, type StatsResult } from './stat-calculator.js';

export interface ForgePlan {
  stockpile: GemInstance[];
  loadout: Loadout;
  round: number;
  lockedGemUids: Set<string>;
  actionLog: ForgeAction[];
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

function clonePlan(plan: ForgePlan): ForgePlan {
  return {
    stockpile: plan.stockpile.map(g => ({ ...g })),
    loadout: {
      weapon: deepCloneItem(plan.loadout.weapon),
      armor: deepCloneItem(plan.loadout.armor),
    },
    round: plan.round,
    lockedGemUids: new Set(plan.lockedGemUids),
    actionLog: [...plan.actionLog],
  };
}

// ---- Public API ----

export function createForgePlan(state: ForgeState, _registry: DataRegistry): ForgePlan {
  return {
    stockpile: state.stockpile.map(g => ({ ...g })),
    loadout: {
      weapon: deepCloneItem(state.loadout.weapon),
      armor: deepCloneItem(state.loadout.armor),
    },
    round: state.round,
    lockedGemUids: new Set(),
    actionLog: [],
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
    case 'select_base_item': return planSelectBaseItem(plan, action);
    default: return { ok: false, error: `Unsupported plan action: ${(action as ForgeAction).kind}` };
  }
}

// ---- Action handlers ----

function planSocketGem(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'socket_gem' }>,
): PlanResult {
  const gemIndex = plan.stockpile.findIndex(g => g.uid === action.gemUid);
  if (gemIndex === -1) return { ok: false, error: 'Gem not in stockpile' };

  const item = plan.loadout[action.target];
  if (action.slotIndex < 0 || action.slotIndex >= item.slots.length) {
    return { ok: false, error: 'Invalid slot index' };
  }

  if (item.slots[action.slotIndex] !== null) {
    return { ok: false, error: 'Slot already occupied' };
  }

  const next = clonePlan(plan);
  const removedGem = next.stockpile.splice(gemIndex, 1)[0];

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

  // Return gem to stockpile
  next.stockpile.push(removedSlot.gem);
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
  const gemIdx1 = plan.stockpile.findIndex(g => g.uid === action.gemUid1);
  if (gemIdx1 === -1) return { ok: false, error: 'First gem not found in stockpile' };

  const gemIdx2 = plan.stockpile.findIndex(g => g.uid === action.gemUid2);
  if (gemIdx2 === -1) return { ok: false, error: 'Second gem not found in stockpile' };

  const gem1 = plan.stockpile[gemIdx1];
  const gem2 = plan.stockpile[gemIdx2];

  const combination = registry.getCombination(gem1.affixId, gem2.affixId);
  if (!combination) return { ok: false, error: 'No valid combination exists for these gems' };

  const next = clonePlan(plan);

  // Remove source gems from stockpile
  const idx1 = next.stockpile.findIndex(g => g.uid === action.gemUid1);
  next.stockpile.splice(idx1, 1);
  const idx2 = next.stockpile.findIndex(g => g.uid === action.gemUid2);
  next.stockpile.splice(idx2, 1);

  // Create combined gem in stockpile (simplified for planning purposes)
  const combinedGem: GemInstance = {
    uid: `combined_${action.gemUid1}_${action.gemUid2}`,
    affixId: gem1.affixId,
    tier: gem1.tier,
    rarity: gem1.rarity,
    recipeDepth: Math.max(gem1.recipeDepth, gem2.recipeDepth) + 1,
    combinable: true,
    tags: [...new Set([...gem1.tags, ...gem2.tags])],
  };
  next.stockpile.push(combinedGem);

  // Lock source gems
  next.lockedGemUids.add(action.gemUid1);
  next.lockedGemUids.add(action.gemUid2);

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
