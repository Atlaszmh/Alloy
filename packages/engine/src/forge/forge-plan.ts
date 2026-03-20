import type { ForgeState } from './forge-state.js';
import type { ForgeAction } from '../types/forge-action.js';
import type { AffixTier } from '../types/affix.js';
import type { OrbInstance } from '../types/orb.js';
import type { EquippedSlot, Loadout, ForgedItem } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import type { BalanceConfig } from '../types/balance.js';
import type { DerivedStats } from '../types/derived-stats.js';
import { calculateStats } from './stat-calculator.js';
import { getActionCost } from './flux-tracker.js';

export interface ForgePlan {
  stockpile: OrbInstance[];
  loadout: Loadout;
  tentativeFlux: number;
  maxFlux: number;
  round: 1 | 2 | 3;
  lockedOrbUids: Set<string>;
  permanentCombines: Array<{ compoundId: string; orbs: [OrbInstance, OrbInstance] }>;
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
      if (s.kind === 'single') return { kind: 'single' as const, orb: { ...s.orb }, socketedRound: s.socketedRound ?? 1 };
      if (s.kind === 'upgraded') return { kind: 'upgraded' as const, orb: { ...s.orb }, originalTier: s.originalTier, upgradedTier: s.upgradedTier, socketedRound: s.socketedRound ?? 1 };
      return { kind: 'compound' as const, orbs: [{ ...s.orbs[0] }, { ...s.orbs[1] }] as [OrbInstance, OrbInstance], compoundId: s.compoundId, socketedRound: s.socketedRound ?? 1 };
    }),
  };
}

function clonePlan(plan: ForgePlan): ForgePlan {
  return {
    stockpile: plan.stockpile.map(o => ({ ...o })),
    loadout: {
      weapon: deepCloneItem(plan.loadout.weapon),
      armor: deepCloneItem(plan.loadout.armor),
    },
    tentativeFlux: plan.tentativeFlux,
    maxFlux: plan.maxFlux,
    round: plan.round,
    lockedOrbUids: new Set(plan.lockedOrbUids),
    permanentCombines: [...plan.permanentCombines],
    actionLog: [...plan.actionLog],
  };
}

// ---- Public API ----

export function createForgePlan(state: ForgeState, _registry: DataRegistry): ForgePlan {
  return {
    stockpile: state.stockpile.map(o => ({ ...o })),
    loadout: {
      weapon: deepCloneItem(state.loadout.weapon),
      armor: deepCloneItem(state.loadout.armor),
    },
    tentativeFlux: state.fluxRemaining,
    maxFlux: state.fluxRemaining,
    round: state.round,
    lockedOrbUids: new Set(),
    permanentCombines: [],
    actionLog: [],
  };
}

export function applyPlanAction(
  plan: ForgePlan,
  action: ForgeAction,
  registry: DataRegistry,
): PlanResult {
  const balance = registry.getBalance();
  const cost = getActionCost(action, balance);

  switch (action.kind) {
    case 'assign_orb': return planAssignOrb(plan, action, cost);
    case 'remove_orb': return planRemoveOrb(plan, action, cost, balance);
    case 'set_base_stats': return planSetBaseStats(plan, action);
    case 'combine': return planCombine(plan, action, cost, registry);
    case 'upgrade_tier': return planUpgradeTier(plan, action, cost);
    case 'swap_orb': return planSwapOrb(plan, action, cost);
    default: return { ok: false, error: `Unsupported plan action: ${(action as ForgeAction).kind}` };
  }
}

// ---- Action handlers ----

function planAssignOrb(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'assign_orb' }>,
  cost: number,
): PlanResult {
  if (plan.tentativeFlux < cost) return { ok: false, error: 'Not enough flux' };

  const orbIndex = plan.stockpile.findIndex(o => o.uid === action.orbUid);
  if (orbIndex === -1) return { ok: false, error: 'Orb not in stockpile' };

  const item = plan.loadout[action.target];
  if (action.slotIndex < 0 || action.slotIndex >= item.slots.length) {
    return { ok: false, error: 'Invalid slot index' };
  }

  const next = clonePlan(plan);
  const removedOrb = next.stockpile.splice(orbIndex, 1)[0];

  // Compound orbs require 2 consecutive slots
  if (removedOrb.compoundId && removedOrb.sourceOrbs) {
    if (action.slotIndex + 1 >= item.slots.length) {
      return { ok: false, error: 'Compound orb requires two consecutive slots' };
    }
    if (item.slots[action.slotIndex] !== null) {
      return { ok: false, error: 'First slot already occupied' };
    }
    if (item.slots[action.slotIndex + 1] !== null) {
      return { ok: false, error: 'Second slot already occupied' };
    }

    const compoundSlot: EquippedSlot = {
      kind: 'compound',
      orbs: removedOrb.sourceOrbs,
      compoundId: removedOrb.compoundId,
      socketedRound: plan.round,
    };
    next.loadout[action.target].slots[action.slotIndex] = compoundSlot;
    next.loadout[action.target].slots[action.slotIndex + 1] = compoundSlot;
    next.tentativeFlux -= cost;
    next.actionLog.push(action);
    return { ok: true, plan: next };
  }

  // Regular single orb
  if (item.slots[action.slotIndex] !== null) {
    return { ok: false, error: 'Slot already occupied' };
  }
  next.loadout[action.target].slots[action.slotIndex] = { kind: 'single', orb: removedOrb, socketedRound: plan.round };
  next.tentativeFlux -= cost;
  next.actionLog.push(action);
  return { ok: true, plan: next };
}

function planRemoveOrb(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'remove_orb' }>,
  _cost: number,
  balance: BalanceConfig,
): PlanResult {
  const item = plan.loadout[action.target];
  const slot = item.slots[action.slotIndex];
  if (!slot) return { ok: false, error: 'Slot is empty' };

  // Round-locking: cannot remove orbs socketed in a previous round
  if (slot.socketedRound < plan.round) {
    return { ok: false, error: 'Cannot remove an orb socketed in a previous round' };
  }

  // Check locked orbs
  const orbUids = slot.kind === 'compound'
    ? slot.orbs.map(o => o.uid)
    : [slot.orb.uid];
  for (const uid of orbUids) {
    if (plan.lockedOrbUids.has(uid)) {
      return { ok: false, error: 'Cannot remove a locked orb (part of a permanent combine)' };
    }
  }

  const next = clonePlan(plan);
  const removedSlot = next.loadout[action.target].slots[action.slotIndex]!;
  next.loadout[action.target].slots[action.slotIndex] = null;

  // Return orb(s) to stockpile
  if (removedSlot.kind === 'single') {
    next.stockpile.push(removedSlot.orb);
  } else if (removedSlot.kind === 'upgraded') {
    next.stockpile.push(removedSlot.orb);
  } else if (removedSlot.kind === 'compound') {
    // Clear the second consecutive slot as well
    const nextSlotIdx = action.slotIndex + 1;
    if (nextSlotIdx < next.loadout[action.target].slots.length) {
      next.loadout[action.target].slots[nextSlotIdx] = null;
    }
    // Return as single compound orb
    const compoundOrb: OrbInstance = {
      uid: `compound_${removedSlot.orbs[0].uid}_${removedSlot.orbs[1].uid}`,
      affixId: removedSlot.orbs[0].affixId,
      tier: removedSlot.orbs[0].tier,
      compoundId: removedSlot.compoundId,
      sourceOrbs: [removedSlot.orbs[0], removedSlot.orbs[1]],
    };
    next.stockpile.push(compoundOrb);
  }

  // Refund assignOrb cost (capped at maxFlux)
  next.tentativeFlux = Math.min(next.tentativeFlux + balance.fluxCosts.assignOrb, next.maxFlux);
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
  cost: number,
  registry: DataRegistry,
): PlanResult {
  if (plan.tentativeFlux < cost) return { ok: false, error: 'Not enough flux' };

  const orbIdx1 = plan.stockpile.findIndex(o => o.uid === action.orbUid1);
  if (orbIdx1 === -1) return { ok: false, error: 'First orb not found in stockpile' };

  const orbIdx2 = plan.stockpile.findIndex(o => o.uid === action.orbUid2);
  if (orbIdx2 === -1) return { ok: false, error: 'Second orb not found in stockpile' };

  const orb1 = plan.stockpile[orbIdx1];
  const orb2 = plan.stockpile[orbIdx2];

  const combination = registry.getCombination(orb1.affixId, orb2.affixId);
  if (!combination) return { ok: false, error: 'No valid combination exists for these orbs' };

  const next = clonePlan(plan);

  // Remove source orbs from stockpile
  const idx1 = next.stockpile.findIndex(o => o.uid === action.orbUid1);
  const removedOrb1 = next.stockpile.splice(idx1, 1)[0];
  const idx2 = next.stockpile.findIndex(o => o.uid === action.orbUid2);
  const removedOrb2 = next.stockpile.splice(idx2, 1)[0];

  // Create compound orb in stockpile
  const compoundOrb: OrbInstance = {
    uid: `compound_${action.orbUid1}_${action.orbUid2}`,
    affixId: orb1.affixId,
    tier: orb1.tier,
    compoundId: combination.id,
    sourceOrbs: [removedOrb1, removedOrb2],
  };
  next.stockpile.push(compoundOrb);

  // Lock source orbs and record permanent combine
  next.lockedOrbUids.add(action.orbUid1);
  next.lockedOrbUids.add(action.orbUid2);
  next.permanentCombines.push({ compoundId: combination.id, orbs: [removedOrb1, removedOrb2] });

  next.tentativeFlux -= cost;
  next.actionLog.push(action);
  return { ok: true, plan: next };
}

function planUpgradeTier(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'upgrade_tier' }>,
  cost: number,
): PlanResult {
  if (plan.tentativeFlux < cost) return { ok: false, error: 'Not enough flux' };

  const orbIdx1 = plan.stockpile.findIndex(o => o.uid === action.orbUid1);
  if (orbIdx1 === -1) return { ok: false, error: 'First orb not found in stockpile' };

  const orbIdx2 = plan.stockpile.findIndex(o => o.uid === action.orbUid2);
  if (orbIdx2 === -1) return { ok: false, error: 'Second orb not found in stockpile' };

  const orb1 = plan.stockpile[orbIdx1];
  const orb2 = plan.stockpile[orbIdx2];

  if (orb1.affixId !== orb2.affixId) {
    return { ok: false, error: 'Both orbs must have the same affix ID to upgrade' };
  }

  if (orb1.tier === 4 || orb2.tier === 4) {
    return { ok: false, error: 'Cannot upgrade: one or both orbs are already at max tier (T4)' };
  }

  const item = plan.loadout[action.target];
  if (item.slots[action.slotIndex] !== null) {
    return { ok: false, error: 'Slot is already occupied' };
  }

  const next = clonePlan(plan);

  // Remove orbs from stockpile
  const idx1 = next.stockpile.findIndex(o => o.uid === action.orbUid1);
  next.stockpile.splice(idx1, 1);
  const idx2 = next.stockpile.findIndex(o => o.uid === action.orbUid2);
  next.stockpile.splice(idx2, 1);

  const upgradedTier = Math.min(orb1.tier + 1, 4) as AffixTier;
  const upgradedOrb: OrbInstance = {
    uid: orb1.uid,
    affixId: orb1.affixId,
    tier: upgradedTier,
  };

  const upgradedSlot: EquippedSlot = {
    kind: 'upgraded',
    orb: upgradedOrb,
    originalTier: orb1.tier,
    upgradedTier,
    socketedRound: plan.round,
  };

  next.loadout[action.target].slots[action.slotIndex] = upgradedSlot;

  // Lock both source orbs
  next.lockedOrbUids.add(action.orbUid1);
  next.lockedOrbUids.add(action.orbUid2);

  next.tentativeFlux -= cost;
  next.actionLog.push(action);
  return { ok: true, plan: next };
}

function planSwapOrb(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'swap_orb' }>,
  cost: number,
): PlanResult {
  if (plan.tentativeFlux < cost) return { ok: false, error: 'Not enough flux' };

  const item = plan.loadout[action.target];
  const slot = item.slots[action.slotIndex];
  if (!slot) return { ok: false, error: 'Slot is empty' };

  // Round-locking: cannot swap orbs socketed in a previous round
  if (slot.socketedRound < plan.round) {
    return { ok: false, error: 'Cannot swap an orb socketed in a previous round' };
  }

  // Only allow single/upgraded slots
  if (slot.kind === 'compound') {
    return { ok: false, error: 'Cannot swap a compound slot individually' };
  }

  // Find new orb in stockpile
  const newOrbIndex = plan.stockpile.findIndex(o => o.uid === action.newOrbUid);
  if (newOrbIndex === -1) return { ok: false, error: 'New orb not in stockpile' };

  const next = clonePlan(plan);
  const oldSlot = next.loadout[action.target].slots[action.slotIndex]!;
  const newOrb = next.stockpile.splice(newOrbIndex, 1)[0];

  // Return old orb to stockpile
  if (oldSlot.kind === 'single') next.stockpile.push(oldSlot.orb);
  else if (oldSlot.kind === 'upgraded') next.stockpile.push(oldSlot.orb);

  // Place new orb in slot
  next.loadout[action.target].slots[action.slotIndex] = {
    kind: 'single',
    orb: newOrb,
    socketedRound: plan.round,
  };

  next.tentativeFlux -= cost;
  next.actionLog.push(action);
  return { ok: true, plan: next };
}

// ---- Query / commit functions ----

export function commitPlan(plan: ForgePlan): ForgeAction[] {
  return [...plan.actionLog];
}

export function getPlannedStats(plan: ForgePlan, registry: DataRegistry): DerivedStats {
  return calculateStats(plan.loadout, registry);
}

export function canRemoveOrb(plan: ForgePlan, target: 'weapon' | 'armor', slotIndex: number): boolean {
  const slot = plan.loadout[target].slots[slotIndex];
  if (!slot) return false;
  if (slot.socketedRound < plan.round) return false;

  const orbUids = slot.kind === 'compound'
    ? slot.orbs.map(o => o.uid)
    : [slot.orb.uid];
  for (const uid of orbUids) {
    if (plan.lockedOrbUids.has(uid)) return false;
  }
  return true;
}
