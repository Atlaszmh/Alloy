import type { AffixTier } from '../types/affix.js';
import type { BalanceConfig } from '../types/balance.js';
import type { ForgeAction } from '../types/forge-action.js';
import type { ForgedItem, Loadout, EquippedSlot } from '../types/item.js';
import type { OrbInstance } from '../types/orb.js';
import type { DataRegistry } from '../data/registry.js';
import { createEmptyLoadout } from '../types/item.js';
import { getFluxForRound, getActionCost } from './flux-tracker.js';

export interface ForgeState {
  stockpile: OrbInstance[];
  loadout: Loadout;
  round: 1 | 2 | 3;
  fluxRemaining: number;
  isQuickMatch: boolean;
}

export type ForgeResult =
  | { ok: true; state: ForgeState }
  | { ok: false; error: string };

export function createForgeState(
  stockpile: OrbInstance[],
  weaponBaseId: string,
  armorBaseId: string,
  round: 1 | 2 | 3,
  balance: BalanceConfig,
  isQuickMatch: boolean,
): ForgeState {
  return {
    stockpile: [...stockpile],
    loadout: createEmptyLoadout(weaponBaseId, armorBaseId),
    round,
    fluxRemaining: getFluxForRound(round, balance, isQuickMatch),
    isQuickMatch,
  };
}

function fail(error: string): ForgeResult {
  return { ok: false, error };
}

function ok(state: ForgeState): ForgeResult {
  return { ok: true, state };
}

function getItem(loadout: Loadout, target: 'weapon' | 'armor'): ForgedItem {
  return target === 'weapon' ? loadout.weapon : loadout.armor;
}

function setItem(loadout: Loadout, target: 'weapon' | 'armor', item: ForgedItem): Loadout {
  return target === 'weapon'
    ? { ...loadout, weapon: item }
    : { ...loadout, armor: item };
}

function findOrbIndex(stockpile: OrbInstance[], uid: string): number {
  return stockpile.findIndex(o => o.uid === uid);
}

function removeFromStockpile(stockpile: OrbInstance[], uid: string): OrbInstance[] {
  const idx = stockpile.findIndex(o => o.uid === uid);
  if (idx === -1) return stockpile;
  return [...stockpile.slice(0, idx), ...stockpile.slice(idx + 1)];
}

function isValidSlotIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index <= 5;
}

function setSlot(item: ForgedItem, index: number, slot: EquippedSlot | null): ForgedItem {
  const newSlots = [...item.slots];
  newSlots[index] = slot;
  return { ...item, slots: newSlots };
}

export function applyForgeAction(
  state: ForgeState,
  action: ForgeAction,
  registry: DataRegistry,
): ForgeResult {
  const cost = getActionCost(action, registry.getBalance());

  // Check flux (set_base_stats costs 0 so this always passes for it)
  if (state.fluxRemaining < cost) {
    return fail('Insufficient flux');
  }

  switch (action.kind) {
    case 'assign_orb':
      return applyAssignOrb(state, action, cost);
    case 'combine':
      return applyCombine(state, action, cost, registry);
    case 'upgrade_tier':
      return applyUpgradeTier(state, action, cost);
    case 'swap_orb':
      return applySwapOrb(state, action, cost);
    case 'remove_orb':
      return applyRemoveOrb(state, action, registry);
    case 'set_base_stats':
      return applySetBaseStats(state, action);
  }
}

function applyAssignOrb(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'assign_orb' }>,
  cost: number,
): ForgeResult {
  if (!isValidSlotIndex(action.slotIndex)) {
    return fail('Slot index out of range (must be 0-5)');
  }

  const orbIdx = findOrbIndex(state.stockpile, action.orbUid);
  if (orbIdx === -1) {
    return fail('Orb not found in stockpile');
  }

  const orb = state.stockpile[orbIdx];
  const item = getItem(state.loadout, action.target);

  // Compound orbs require 2 consecutive slots
  if (orb.compoundId && orb.sourceOrbs) {
    if (!isValidSlotIndex(action.slotIndex + 1)) {
      return fail('Compound orb requires two consecutive slots');
    }
    if (item.slots[action.slotIndex] !== null) {
      return fail('First slot is already occupied');
    }
    if (item.slots[action.slotIndex + 1] !== null) {
      return fail('Second slot is already occupied');
    }

    const compoundSlot: EquippedSlot = {
      kind: 'compound',
      orbs: orb.sourceOrbs,
      compoundId: orb.compoundId,
      socketedRound: state.round,
    };
    let newItem = setSlot(item, action.slotIndex, compoundSlot);
    newItem = setSlot(newItem, action.slotIndex + 1, compoundSlot);
    const newStockpile = removeFromStockpile(state.stockpile, action.orbUid);

    return ok({
      ...state,
      stockpile: newStockpile,
      loadout: setItem(state.loadout, action.target, newItem),
      fluxRemaining: state.fluxRemaining - cost,
    });
  }

  // Regular single orb
  if (item.slots[action.slotIndex] !== null) {
    return fail('Slot is already occupied');
  }

  const newSlot: EquippedSlot = { kind: 'single', orb, socketedRound: state.round };
  const newItem = setSlot(item, action.slotIndex, newSlot);
  const newStockpile = removeFromStockpile(state.stockpile, action.orbUid);

  return ok({
    ...state,
    stockpile: newStockpile,
    loadout: setItem(state.loadout, action.target, newItem),
    fluxRemaining: state.fluxRemaining - cost,
  });
}

function applyCombine(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'combine' }>,
  cost: number,
  registry: DataRegistry,
): ForgeResult {
  const orbIdx1 = findOrbIndex(state.stockpile, action.orbUid1);
  if (orbIdx1 === -1) {
    return fail('First orb not found in stockpile');
  }

  const orbIdx2 = findOrbIndex(state.stockpile, action.orbUid2);
  if (orbIdx2 === -1) {
    return fail('Second orb not found in stockpile');
  }

  const orb1 = state.stockpile[orbIdx1];
  const orb2 = state.stockpile[orbIdx2];

  const combination = registry.getCombination(orb1.affixId, orb2.affixId);
  if (!combination) {
    return fail('No valid combination exists for these orbs');
  }

  // Remove source orbs and create a compound orb in stockpile
  let newStockpile = removeFromStockpile(state.stockpile, action.orbUid1);
  newStockpile = removeFromStockpile(newStockpile, action.orbUid2);

  const compoundOrb: OrbInstance = {
    uid: `compound_${action.orbUid1}_${action.orbUid2}`,
    affixId: orb1.affixId,
    tier: orb1.tier,
    compoundId: combination.id,
    sourceOrbs: [orb1, orb2],
  };
  newStockpile = [...newStockpile, compoundOrb];

  return ok({
    ...state,
    stockpile: newStockpile,
    fluxRemaining: state.fluxRemaining - cost,
  });
}

function applyUpgradeTier(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'upgrade_tier' }>,
  cost: number,
): ForgeResult {
  if (!isValidSlotIndex(action.slotIndex)) {
    return fail('Slot index out of range (must be 0-5)');
  }

  const orbIdx1 = findOrbIndex(state.stockpile, action.orbUid1);
  if (orbIdx1 === -1) {
    return fail('First orb not found in stockpile');
  }

  const orbIdx2 = findOrbIndex(state.stockpile, action.orbUid2);
  if (orbIdx2 === -1) {
    return fail('Second orb not found in stockpile');
  }

  const orb1 = state.stockpile[orbIdx1];
  const orb2 = state.stockpile[orbIdx2];

  if (orb1.affixId !== orb2.affixId) {
    return fail('Both orbs must have the same affix ID to upgrade');
  }

  if (orb1.tier === 4 || orb2.tier === 4) {
    return fail('Cannot upgrade: one or both orbs are already at max tier (T4)');
  }

  const item = getItem(state.loadout, action.target);
  if (item.slots[action.slotIndex] !== null) {
    return fail('Slot is already occupied');
  }

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
    socketedRound: state.round,
  };

  const newItem = setSlot(item, action.slotIndex, upgradedSlot);

  let newStockpile = removeFromStockpile(state.stockpile, action.orbUid1);
  newStockpile = removeFromStockpile(newStockpile, action.orbUid2);

  return ok({
    ...state,
    stockpile: newStockpile,
    loadout: setItem(state.loadout, action.target, newItem),
    fluxRemaining: state.fluxRemaining - cost,
  });
}

function applySwapOrb(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'swap_orb' }>,
  cost: number,
): ForgeResult {
  if (!isValidSlotIndex(action.slotIndex)) {
    return fail('Slot index out of range (must be 0-5)');
  }

  const item = getItem(state.loadout, action.target);
  const currentSlot = item.slots[action.slotIndex];
  if (currentSlot === null) {
    return fail('Cannot swap: slot is empty');
  }

  if (currentSlot.socketedRound < state.round) {
    return fail('Cannot swap: slot is locked from a previous round');
  }

  const newOrbIdx = findOrbIndex(state.stockpile, action.newOrbUid);
  if (newOrbIdx === -1) {
    return fail('New orb not found in stockpile');
  }

  // Extract the orb being removed from the slot
  let removedOrb: OrbInstance;
  if (currentSlot.kind === 'single') {
    removedOrb = currentSlot.orb;
  } else if (currentSlot.kind === 'upgraded') {
    removedOrb = currentSlot.orb;
  } else {
    return fail('Cannot swap a compound slot individually');
  }

  const newOrb = state.stockpile[newOrbIdx];
  const newSlot: EquippedSlot = { kind: 'single', orb: newOrb, socketedRound: state.round };
  const newItem = setSlot(item, action.slotIndex, newSlot);

  let newStockpile = removeFromStockpile(state.stockpile, action.newOrbUid);
  newStockpile = [...newStockpile, removedOrb];

  return ok({
    ...state,
    stockpile: newStockpile,
    loadout: setItem(state.loadout, action.target, newItem),
    fluxRemaining: state.fluxRemaining - cost,
  });
}

function applyRemoveOrb(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'remove_orb' }>,
  registry: DataRegistry,
): ForgeResult {
  if (!isValidSlotIndex(action.slotIndex)) {
    return fail('Slot index out of range (must be 0-5)');
  }

  const item = getItem(state.loadout, action.target);
  const currentSlot = item.slots[action.slotIndex];
  if (currentSlot === null) {
    return fail('Cannot remove: slot is empty');
  }

  if (currentSlot.socketedRound < state.round) {
    return fail('Cannot remove: slot is locked from a previous round');
  }

  const balance = registry.getBalance();
  const refund = balance.fluxCosts.assignOrb;
  const maxFlux = getFluxForRound(state.round, balance, state.isQuickMatch);

  if (currentSlot.kind === 'compound') {
    // Find the neighbor slot sharing the same compoundId
    const neighborIdx = item.slots.findIndex(
      (s, i) => i !== action.slotIndex && s !== null && s.kind === 'compound' && s.compoundId === currentSlot.compoundId,
    );
    let newItem = setSlot(item, action.slotIndex, null);
    if (neighborIdx !== -1) {
      newItem = setSlot(newItem, neighborIdx, null);
    }

    // Return compound orb to stockpile
    const compoundOrb: OrbInstance = {
      uid: `compound_${currentSlot.orbs[0].uid}_${currentSlot.orbs[1].uid}`,
      affixId: currentSlot.orbs[0].affixId,
      tier: currentSlot.orbs[0].tier,
      compoundId: currentSlot.compoundId,
      sourceOrbs: currentSlot.orbs,
    };
    const newStockpile = [...state.stockpile, compoundOrb];

    return ok({
      ...state,
      stockpile: newStockpile,
      loadout: setItem(state.loadout, action.target, newItem),
      fluxRemaining: Math.min(state.fluxRemaining + refund, maxFlux),
    });
  }

  // Single or upgraded slot
  let removedOrb: OrbInstance;
  if (currentSlot.kind === 'single') {
    removedOrb = currentSlot.orb;
  } else {
    removedOrb = currentSlot.orb;
  }

  const newItem = setSlot(item, action.slotIndex, null);
  const newStockpile = [...state.stockpile, removedOrb];

  return ok({
    ...state,
    stockpile: newStockpile,
    loadout: setItem(state.loadout, action.target, newItem),
    fluxRemaining: Math.min(state.fluxRemaining + refund, maxFlux),
  });
}

function applySetBaseStats(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'set_base_stats' }>,
): ForgeResult {
  if (state.round !== 1) {
    return fail('Base stats can only be set in Round 1');
  }

  const item = getItem(state.loadout, action.target);
  const newItem: ForgedItem = {
    ...item,
    baseStats: { stat1: action.stat1, stat2: action.stat2 },
  };

  return ok({
    ...state,
    loadout: setItem(state.loadout, action.target, newItem),
  });
}
