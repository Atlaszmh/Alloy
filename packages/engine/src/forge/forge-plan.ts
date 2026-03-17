import type { ForgeState } from './forge-state.js';
import type { ForgeAction } from '../types/forge-action.js';
import type { AffixTier } from '../types/affix.js';
import type { OrbInstance } from '../types/orb.js';
import type { EquippedSlot, Loadout, ForgedItem } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
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
      if (s.kind === 'single') return { kind: 'single' as const, orb: { ...s.orb } };
      if (s.kind === 'upgraded') return { kind: 'upgraded' as const, orb: { ...s.orb }, originalTier: s.originalTier, upgradedTier: s.upgradedTier };
      return { kind: 'compound' as const, orbs: [{ ...s.orbs[0] }, { ...s.orbs[1] }] as [OrbInstance, OrbInstance], compoundId: s.compoundId };
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
    case 'remove_orb': return planRemoveOrb(plan, action, cost);
    case 'set_base_stats': return planSetBaseStats(plan, action);
    case 'combine': return planCombine(plan, action, cost, registry);
    case 'upgrade_tier': return planUpgradeTier(plan, action, cost);
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
  if (item.slots[action.slotIndex] !== null) {
    return { ok: false, error: 'Slot already occupied' };
  }

  const next = clonePlan(plan);
  const orb = next.stockpile.splice(orbIndex, 1)[0];
  next.loadout[action.target].slots[action.slotIndex] = { kind: 'single', orb };
  next.tentativeFlux -= cost;
  next.actionLog.push(action);
  return { ok: true, plan: next };
}

function planRemoveOrb(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'remove_orb' }>,
  cost: number,
): PlanResult {
  if (plan.round === 1) return { ok: false, error: 'Remove is not available in Round 1' };
  if (plan.tentativeFlux < cost) return { ok: false, error: 'Not enough flux' };

  const item = plan.loadout[action.target];
  const slot = item.slots[action.slotIndex];
  if (!slot) return { ok: false, error: 'Slot is empty' };

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
  if (removedSlot.kind === 'single') next.stockpile.push(removedSlot.orb);
  else if (removedSlot.kind === 'upgraded') next.stockpile.push(removedSlot.orb);
  else if (removedSlot.kind === 'compound') removedSlot.orbs.forEach(o => next.stockpile.push(o));

  next.tentativeFlux -= cost;
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

  const item = plan.loadout[action.target];
  if (item.slots[action.slotIndex] !== null) {
    return { ok: false, error: 'First slot is already occupied' };
  }
  if (item.slots[action.slotIndex + 1] !== null) {
    return { ok: false, error: 'Second slot is already occupied' };
  }

  const next = clonePlan(plan);

  // Remove orbs from stockpile
  const idx1 = next.stockpile.findIndex(o => o.uid === action.orbUid1);
  const removedOrb1 = next.stockpile.splice(idx1, 1)[0];
  const idx2 = next.stockpile.findIndex(o => o.uid === action.orbUid2);
  const removedOrb2 = next.stockpile.splice(idx2, 1)[0];

  // Place compound in slots (same reference for both slots, matching forge-state.ts)
  const compoundSlot: EquippedSlot = {
    kind: 'compound',
    orbs: [removedOrb1, removedOrb2],
    compoundId: combination.id,
  };
  next.loadout[action.target].slots[action.slotIndex] = compoundSlot;
  next.loadout[action.target].slots[action.slotIndex + 1] = compoundSlot;

  // Lock both orbs and record permanent combine
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
  };

  next.loadout[action.target].slots[action.slotIndex] = upgradedSlot;

  // Lock both source orbs
  next.lockedOrbUids.add(action.orbUid1);
  next.lockedOrbUids.add(action.orbUid2);

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

export function canRemoveOrb(plan: ForgePlan, orbUid: string): boolean {
  return !plan.lockedOrbUids.has(orbUid);
}
