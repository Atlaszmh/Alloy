import type { AITier } from '../types/ai.js';
import type { Loadout } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { generatePool } from '../pool/pool-generator.js';
import { liveSlots } from '../types/slot-array.js';
import { AIController } from '../ai/ai-controller.js';
import { createEmptyLoadout } from '../types/item.js';
import { applyForgeAction } from '../forge/forge-state.js';
import { CombinationEngine } from '../combine/combination-engine.js';
import { DiscoveryState } from '../combine/discovery-state.js';

export interface GenerateOpponentBuildOpts {
  seed: number;
  round: number;
  tier: AITier;
  baseWeaponId: string;
  baseArmorId: string;
}

export interface OpponentBuild {
  loadout: Loadout;
  tier: AITier;
}

/**
 * Build a synthetic opponent loadout for a given run round.
 *
 * Strategy: generate a fresh pool of the round's size, let an AIController
 * draft half + forge it, then return the resulting loadout. Pool scaling is
 * already round-aware via generatePool, so the opponent's available gems
 * naturally escalate with round number.
 *
 * This is sim-only — the shipped game does not fill player 1's loadout in
 * run_async mode.
 */
export function generateOpponentBuild(
  opts: GenerateOpponentBuildOpts,
  registry: DataRegistry,
): OpponentBuild {
  const rng = new SeededRNG(opts.seed).fork(`opponent_round_${opts.round}`);
  const pool = generatePool(opts.seed, 'run_async', registry, opts.round);

  const ai = new AIController(opts.tier, registry, rng);

  // Draft half the pool
  const livePool = liveSlots(pool);
  const draftCount = Math.ceil(livePool.length / 2);
  const stockpile: typeof livePool = [];
  const remaining = [...livePool];

  for (let i = 0; i < draftCount && remaining.length > 0; i++) {
    const uid = ai.pickOrb(remaining, stockpile, []);
    const idx = remaining.findIndex(g => g.uid === uid);
    if (idx >= 0) {
      stockpile.push(remaining[idx]);
      remaining.splice(idx, 1);
    }
  }

  // Build a CombinationEngine using the same pattern as forge-plan.ts
  const categoryMap: Record<string, string> = {};
  for (const affix of registry.getAllAffixes()) {
    categoryMap[affix.id] = affix.category;
  }
  const combinationEngine = new CombinationEngine(
    registry.getRecipeRegistry(),
    new DiscoveryState(),
    categoryMap,
    { matchingRarityBonus: registry.getBalance().gem.matchingRarityBonus },
  );

  // Forge: run AI plan against an empty loadout, apply via forge-state
  let forgeState = {
    stockpile: stockpile as typeof stockpile,
    loadout: createEmptyLoadout(opts.baseWeaponId, opts.baseArmorId),
    round: opts.round as (1 | 2 | 3),
    isQuickMatch: false,
    rng,
  };

  const actions = ai.planForge(
    stockpile,
    forgeState.loadout,
    1000,
    opts.round,
    [],
  );

  for (const action of actions) {
    const result = applyForgeAction(forgeState, action, registry, combinationEngine);
    if (result.ok) {
      forgeState = result.state;
    }
  }

  // Fallback: if armor has no socketed gems (AI placed everything in weapon
  // because all drafted gems were offensive), force-socket the first available
  // stockpile gem into armor slot 0. This ensures a minimal contested loadout
  // for simulation purposes.
  const armorEmpty = forgeState.loadout.armor.slots.every(s => s === null);
  if (armorEmpty) {
    const firstStockpileGem = liveSlots(forgeState.stockpile)[0];
    if (firstStockpileGem) {
      const fallback = applyForgeAction(
        forgeState,
        { kind: 'socket_gem', gemUid: firstStockpileGem.uid, target: 'armor', slotIndex: 0 },
        registry,
        combinationEngine,
      );
      if (fallback.ok) {
        forgeState = fallback.state;
      }
    }
  }

  return { loadout: forgeState.loadout, tier: opts.tier };
}
