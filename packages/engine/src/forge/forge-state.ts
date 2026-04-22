import type { BalanceConfig } from '../types/balance.js';
import type { ForgeAction } from '../types/forge-action.js';
import type { ForgedItem, Loadout, EquippedSlot } from '../types/item.js';
import type { GemInstance } from '../types/gem.js';
import type { SlotArray } from '../types/match.js';
import {
  clearSlot,
  findSlotIndex,
  placeInFirstEmpty,
  setSlot as setSlotInSparse,
} from '../types/slot-array.js';
import { createGem } from '../types/gem.js';
import type { DataRegistry } from '../data/registry.js';
import { createEmptyLoadout } from '../types/item.js';
import type { CombinationEngine } from '../combine/combination-engine.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import { resolveTransplantMutation } from './forge-plan.js';

export interface ForgeState {
  /** Fixed-slot stockpile — nulls preserve empty positions (see forge-plan.ts). */
  stockpile: SlotArray<GemInstance>;
  loadout: Loadout;
  round: number;
  isQuickMatch: boolean;
  /** Deterministic RNG — required for actions that need randomness (e.g. transplant_gem). */
  rng?: SeededRNG;
}

export type ForgeResult =
  | { ok: true; state: ForgeState }
  | { ok: false; error: string };

export interface ForgeContext {
  registry: DataRegistry;
  combinationEngine?: CombinationEngine;
}

export function createForgeState(
  stockpile: SlotArray<GemInstance>,
  weaponBaseId: string,
  armorBaseId: string,
  round: number,
  _balance: BalanceConfig,
  _isQuickMatch: boolean,
): ForgeState {
  return {
    stockpile: [...stockpile],
    loadout: createEmptyLoadout(weaponBaseId, armorBaseId),
    round,
    isQuickMatch: _isQuickMatch,
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

function isValidSlotIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index <= 5;
}

function setItemSlot(item: ForgedItem, index: number, slot: EquippedSlot | null): ForgedItem {
  const newSlots = [...item.slots];
  newSlots[index] = slot;
  return { ...item, slots: newSlots };
}

export function applyForgeAction(
  state: ForgeState,
  action: ForgeAction,
  registry: DataRegistry,
  combinationEngine?: CombinationEngine,
): ForgeResult {
  switch (action.kind) {
    case 'socket_gem':
      return applySocketGem(state, action);
    case 'unsocket_gem':
      return applyUnsocketGem(state, action);
    case 'combine':
      return applyCombine(state, action, registry, combinationEngine);
    case 'combine3':
      return applyCombine3(state, action, registry, combinationEngine);
    case 'select_base_item':
      return applySelectBaseItem(state, action);
    case 'set_base_stats':
      return applySetBaseStats(state, action);
    case 'transplant_gem':
      return applyTransplantGem(state, action, registry);
    case 'boost_combine':
    case 'reroll_pool':
    case 'guarantee_rarity':
      // These flux spend actions are handled at match-controller level
      return fail(`Flux action '${action.kind}' must be handled by match controller`);
    default:
      return fail(`Unknown action kind`);
  }
}

function applyTransplantGem(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'transplant_gem' }>,
  registry: DataRegistry,
): ForgeResult {
  if (!state.rng) {
    return fail('ForgeState is missing rng — required for transplant_gem');
  }
  const rng = state.rng.fork(`transplant_${action.targetGemUid}_${action.sourceGemUid}`);
  const res = resolveTransplantMutation(state.stockpile, action, registry, rng);
  if (!res.ok) return fail(res.error);

  const newStockpile1 = setSlotInSparse(state.stockpile, res.targetIdx, res.updatedTarget);
  const newStockpile2 = clearSlot(newStockpile1, res.sourceIdx);
  return ok({ ...state, stockpile: newStockpile2 });
}

function applySocketGem(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'socket_gem' }>,
): ForgeResult {
  if (!isValidSlotIndex(action.slotIndex)) {
    return fail('Slot index out of range (must be 0-5)');
  }

  const gemIdx = findSlotIndex(state.stockpile, g => g.uid === action.gemUid);
  if (gemIdx === -1) {
    return fail('Gem not found in stockpile');
  }

  const gem = state.stockpile[gemIdx]!;
  const item = getItem(state.loadout, action.target);

  if (item.slots[action.slotIndex] !== null) {
    return fail('Slot is already occupied');
  }

  const newSlot: EquippedSlot = { gem };
  const newItem = setItemSlot(item, action.slotIndex, newSlot);
  // Clear the stockpile slot in place so sibling gems don't shift.
  const newStockpile = clearSlot(state.stockpile, gemIdx);

  return ok({
    ...state,
    stockpile: newStockpile,
    loadout: setItem(state.loadout, action.target, newItem),
  });
}

function applyUnsocketGem(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'unsocket_gem' }>,
): ForgeResult {
  if (!isValidSlotIndex(action.slotIndex)) {
    return fail('Slot index out of range (must be 0-5)');
  }

  const item = getItem(state.loadout, action.target);
  const currentSlot = item.slots[action.slotIndex];
  if (currentSlot === null) {
    return fail('Cannot unsocket: slot is empty');
  }

  // Return gem to the first empty stockpile slot (grows array if every slot
  // is full). Prior gems never shift.
  const removedGem = currentSlot.gem;
  const newItem = setItemSlot(item, action.slotIndex, null);
  const newStockpile = placeInFirstEmpty(state.stockpile, removedGem);

  return ok({
    ...state,
    stockpile: newStockpile,
    loadout: setItem(state.loadout, action.target, newItem),
  });
}

function applyCombine(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'combine' }>,
  registry: DataRegistry,
  combinationEngine?: CombinationEngine,
): ForgeResult {
  const gemIdx1 = findSlotIndex(state.stockpile, g => g.uid === action.gemUid1);
  if (gemIdx1 === -1) {
    return fail('First gem not found in stockpile');
  }

  const gemIdx2 = findSlotIndex(state.stockpile, g => g.uid === action.gemUid2);
  if (gemIdx2 === -1) {
    return fail('Second gem not found in stockpile');
  }

  const gem1 = state.stockpile[gemIdx1]!;
  const gem2 = state.stockpile[gemIdx2]!;

  // Helper: drop both ingredients and place the output in the keep-gem's slot.
  const writeResult = (resultGem: GemInstance): SlotArray<GemInstance> => {
    const keepIdx = action.keepGemUid === action.gemUid1 ? gemIdx1 : gemIdx2;
    const otherIdx = keepIdx === gemIdx1 ? gemIdx2 : gemIdx1;
    let next = setSlotInSparse(state.stockpile, keepIdx, resultGem);
    next = clearSlot(next, otherIdx);
    return next;
  };

  // If we have a CombinationEngine, use it for the full combine logic
  if (combinationEngine) {
    try {
      const outputUid = `combined_${action.gemUid1}_${action.gemUid2}`;
      const result = combinationEngine.combine(gem1, gem2, outputUid, action.keepGemUid);
      return ok({ ...state, stockpile: writeResult(result.gem) });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // Generic combine: when keepGemUid is set, promote the kept gem +1 tier
  if (action.keepGemUid) {
    const keptGem = action.keepGemUid === action.gemUid1 ? gem1 : gem2;
    const newTier = Math.min(keptGem.tier + 1, 5) as 1 | 2 | 3 | 4 | 5;
    const resultGem = createGem(
      `combined_${action.gemUid1}_${action.gemUid2}`,
      keptGem.affixId,
      newTier,
      keptGem.rarity,
      {
        tags: [...new Set([...gem1.tags, ...gem2.tags])],
        recipeDepth: Math.max(gem1.recipeDepth, gem2.recipeDepth) + 1,
      },
    );
    return ok({ ...state, stockpile: writeResult(resultGem) });
  }

  // Fallback: legacy combine using registry's compound affix lookup
  const combination = registry.getCombination(gem1.affixId, gem2.affixId);
  if (!combination) {
    return fail('No valid combination exists for these gems');
  }

  // Create a simple combined gem using the first gem's properties
  const combinedGem: GemInstance = createGem(
    `combined_${action.gemUid1}_${action.gemUid2}`,
    gem1.affixId,
    gem1.tier,
    gem1.rarity,
    {
      tags: [...new Set([...gem1.tags, ...gem2.tags])],
      recipeDepth: Math.max(gem1.recipeDepth, gem2.recipeDepth) + 1,
    },
  );

  return ok({ ...state, stockpile: writeResult(combinedGem) });
}

function applyCombine3(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'combine3' }>,
  _registry: DataRegistry,
  combinationEngine?: CombinationEngine,
): ForgeResult {
  const idx1 = findSlotIndex(state.stockpile, g => g.uid === action.gemUid1);
  if (idx1 === -1) return fail('First gem not found in stockpile');
  const idx2 = findSlotIndex(state.stockpile, g => g.uid === action.gemUid2);
  if (idx2 === -1) return fail('Second gem not found in stockpile');
  const idx3 = findSlotIndex(state.stockpile, g => g.uid === action.gemUid3);
  if (idx3 === -1) return fail('Third gem not found in stockpile');

  const gem1 = state.stockpile[idx1]!;
  const gem2 = state.stockpile[idx2]!;
  const gem3 = state.stockpile[idx3]!;

  if (!combinationEngine) {
    return fail('combine3 requires a CombinationEngine');
  }

  try {
    const outputUid = `combined3_${action.gemUid1}_${action.gemUid2}_${action.gemUid3}`;
    const result = combinationEngine.combine3(gem1, gem2, gem3, outputUid, action.keepGemUid);

    const slotByUid: Record<string, number> = {
      [action.gemUid1]: idx1,
      [action.gemUid2]: idx2,
      [action.gemUid3]: idx3,
    };
    const keepUid = action.keepGemUid ?? action.gemUid1;
    const keepIdx = slotByUid[keepUid] ?? idx1;

    let newStockpile = setSlotInSparse(state.stockpile, keepIdx, result.gem);
    // Only consumed uids vacate their slots; the ejected (non-kept, non-consumed)
    // gem stays put.
    for (const uid of result.consumedUids) {
      const idx = slotByUid[uid];
      if (idx !== undefined && idx !== keepIdx) {
        newStockpile = clearSlot(newStockpile, idx);
      }
    }

    return ok({ ...state, stockpile: newStockpile });
  } catch (e) {
    return fail((e as Error).message);
  }
}

function applySelectBaseItem(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'select_base_item' }>,
): ForgeResult {
  if (state.round !== 1) {
    return fail('Base item can only be selected in Round 1');
  }

  const item = getItem(state.loadout, action.target);
  const newItem: ForgedItem = {
    ...item,
    baseItemId: action.baseItemId,
  };

  return ok({
    ...state,
    loadout: setItem(state.loadout, action.target, newItem),
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
