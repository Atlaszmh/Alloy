// NOTE (2026-04-19): The adapt phase is not wired into the phase machine
// (see phase-machine.ts — no 'adapt' case). AIController.planAdapt and these
// strategies are currently unreachable. Kept for future wiring; see
// ALPHA_READINESS.md for context. If you need to remove them, also remove
// planAdapt in ai-controller.ts and the `AdaptStrategy` export.

import type { CombatLog } from '../../types/combat.js';
import type { ForgeAction } from '../../types/forge-action.js';
import type { EquippedSlot, Loadout } from '../../types/item.js';
import type { GemInstance } from '../../types/gem.js';
import type { DataRegistry } from '../../data/registry.js';
import type { SeededRNG } from '../../rng/seeded-rng.js';
import { extractDamageProfile, counterValue, orbValueScore } from '../evaluation.js';

export interface AdaptStrategy {
  adapt(
    previousDuelLog: CombatLog,
    opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: GemInstance[],
    fluxRemaining: number,
    myPlayerIdx: 0 | 1,
    registry: DataRegistry,
    rng: SeededRNG,
    round?: number,
  ): ForgeAction[];
}

/**
 * Tier 1 (Apprentice) Adapt Strategy:
 * No adaptation -- returns empty action list.
 */
export class Tier1AdaptStrategy implements AdaptStrategy {
  adapt(
    _previousDuelLog: CombatLog,
    _opponentLoadout: Loadout,
    _myLoadout: Loadout,
    _myStockpile: GemInstance[],
    _fluxRemaining: number,
    _myPlayerIdx: 0 | 1,
    _registry: DataRegistry,
    _rng: SeededRNG,
  ): ForgeAction[] {
    return [];
  }
}

/**
 * Tier 2 (Journeyman) Adapt Strategy:
 * No adaptation -- returns empty action list.
 */
export class Tier2AdaptStrategy implements AdaptStrategy {
  adapt(
    _previousDuelLog: CombatLog,
    _opponentLoadout: Loadout,
    _myLoadout: Loadout,
    _myStockpile: GemInstance[],
    _fluxRemaining: number,
    _myPlayerIdx: 0 | 1,
    _registry: DataRegistry,
    _rng: SeededRNG,
  ): ForgeAction[] {
    return [];
  }
}

/**
 * Extract gem from a slot.
 */
function getSlotGem(slot: EquippedSlot): GemInstance {
  return slot.gem;
}

/**
 * Find the weakest slots in a loadout (lowest gem value).
 */
function findWeakestSlots(
  loadout: Loadout,
  registry: DataRegistry,
  maxCount: number,
  _currentRound?: number,
): { target: 'weapon' | 'armor'; slotIndex: number; gem: GemInstance; score: number }[] {
  const slots: { target: 'weapon' | 'armor'; slotIndex: number; gem: GemInstance; score: number }[] = [];
  const targets: ('weapon' | 'armor')[] = ['weapon', 'armor'];
  for (const target of targets) {
    const item = target === 'weapon' ? loadout.weapon : loadout.armor;
    for (let i = 0; i < 6; i++) {
      const slot = item.slots[i];
      if (!slot) continue;
      const gem = getSlotGem(slot);
      slots.push({ target, slotIndex: i, gem, score: orbValueScore(gem, registry) });
    }
  }
  // Sort by score ascending (weakest first)
  slots.sort((a, b) => a.score - b.score);
  return slots.slice(0, maxCount);
}

/**
 * Tier 3 (Artisan) Adapt Strategy:
 * Unsockets 1-2 weak gems and sockets counter gems from stockpile.
 * Looks at the previous combat log to determine what the opponent did.
 */
export class Tier3AdaptStrategy implements AdaptStrategy {
  adapt(
    previousDuelLog: CombatLog,
    _opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: GemInstance[],
    _fluxRemaining: number,
    myPlayerIdx: 0 | 1,
    registry: DataRegistry,
    _rng: SeededRNG,
    round?: number,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];

    if (myStockpile.length === 0) return actions;

    // Analyze opponent damage
    const opponentIdx = (myPlayerIdx === 0 ? 1 : 0) as 0 | 1;
    const damageProfile = extractDamageProfile(previousDuelLog, opponentIdx);

    if (damageProfile.totalDamage === 0) return actions;

    // Find best counter gems from stockpile
    const counterGems = myStockpile
      .map((gem) => ({ gem, score: counterValue(gem, damageProfile, registry) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    if (counterGems.length === 0) return actions;

    // Find weakest equipped slots (1-2)
    const weakSlots = findWeakestSlots(myLoadout, registry, 2, round);

    // Unsocket weak slots and socket better counter gems (up to 2)
    let swapCount = 0;
    for (const weak of weakSlots) {
      if (swapCount >= 2) break;
      if (counterGems.length <= swapCount) break;

      const counterGem = counterGems[swapCount];
      // Only swap if counter gem is actually better
      if (counterGem.score <= weak.score) continue;

      // Unsocket the weak gem
      actions.push({
        kind: 'unsocket_gem',
        target: weak.target,
        slotIndex: weak.slotIndex,
      });
      // Socket the counter gem
      actions.push({
        kind: 'socket_gem',
        gemUid: counterGem.gem.uid,
        target: weak.target,
        slotIndex: weak.slotIndex,
      });
      swapCount++;
    }

    return actions;
  }
}

/**
 * Tier 4 (Master) Adapt Strategy:
 * Significant adaptation. Reads damage patterns from previous duel log.
 * May swap multiple gems to counter the opponent's strategy.
 */
export class Tier4AdaptStrategy implements AdaptStrategy {
  adapt(
    previousDuelLog: CombatLog,
    _opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: GemInstance[],
    _fluxRemaining: number,
    myPlayerIdx: 0 | 1,
    registry: DataRegistry,
    _rng: SeededRNG,
    round?: number,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];

    if (myStockpile.length === 0) return actions;

    // Analyze opponent damage patterns
    const opponentIdx = (myPlayerIdx === 0 ? 1 : 0) as 0 | 1;
    const damageProfile = extractDamageProfile(previousDuelLog, opponentIdx);

    if (damageProfile.totalDamage === 0) return actions;

    // Score all stockpile gems by counter value
    const counterGems = myStockpile
      .map((gem) => ({ gem, score: counterValue(gem, damageProfile, registry) }))
      .sort((a, b) => b.score - a.score);

    // Find all swappable slots sorted by weakness
    const weakSlots = findWeakestSlots(myLoadout, registry, 4, round);

    // Swap weak slots with better counter gems (up to 4)
    const usedGems = new Set<string>();
    for (const weak of weakSlots) {
      // Find the best unused counter gem
      let bestCounter: { gem: GemInstance; score: number } | null = null;
      for (const c of counterGems) {
        if (usedGems.has(c.gem.uid)) continue;
        if (c.score > weak.score * 0.8) {
          bestCounter = c;
          break;
        }
      }
      if (!bestCounter) continue;

      // Unsocket the weak gem, then socket the counter
      actions.push({
        kind: 'unsocket_gem',
        target: weak.target,
        slotIndex: weak.slotIndex,
      });
      actions.push({
        kind: 'socket_gem',
        gemUid: bestCounter.gem.uid,
        target: weak.target,
        slotIndex: weak.slotIndex,
      });
      usedGems.add(bestCounter.gem.uid);
    }

    return actions;
  }
}

/**
 * Tier 5 (Alloy) Adapt Strategy:
 * Complete rebuild if needed. Predicts opponent adaptation based on their
 * stockpile. Unsockets and re-sockets gems as needed to optimize counter-build.
 */
export class Tier5AdaptStrategy implements AdaptStrategy {
  adapt(
    previousDuelLog: CombatLog,
    opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: GemInstance[],
    _fluxRemaining: number,
    myPlayerIdx: 0 | 1,
    registry: DataRegistry,
    _rng: SeededRNG,
    round?: number,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];

    if (myStockpile.length === 0) return actions;

    // Analyze opponent damage
    const opponentIdx = (myPlayerIdx === 0 ? 1 : 0) as 0 | 1;
    const damageProfile = extractDamageProfile(previousDuelLog, opponentIdx);

    // Also analyze what gems the opponent has in their loadout
    // to predict their build direction
    const opponentGemIds = new Set<string>();
    const targets: ('weapon' | 'armor')[] = ['weapon', 'armor'];
    for (const target of targets) {
      const item = target === 'weapon' ? opponentLoadout.weapon : opponentLoadout.armor;
      for (let i = 0; i < 6; i++) {
        const slot = item.slots[i];
        if (!slot) continue;
        opponentGemIds.add(slot.gem.affixId);
      }
    }

    // Score stockpile gems by counter value AND general quality
    const counterGems = myStockpile
      .map((gem) => {
        let score = counterValue(gem, damageProfile, registry);
        // Bonus for gems that counter the opponent's build direction
        const affix = registry.findAffix(gem.affixId);
        if (affix) {
          // Defensive gems counter high damage
          if (affix.category === 'defensive' && damageProfile.totalDamage > 0) {
            score += orbValueScore(gem, registry) * 0.3;
          }
        }
        return { gem, score };
      })
      .sort((a, b) => b.score - a.score);

    // Find all swappable slots
    const allSlots = findWeakestSlots(myLoadout, registry, 6, round);

    // Aggressively swap to counter
    const usedGems = new Set<string>();
    for (const slot of allSlots) {
      // Find the best unused counter gem that improves over current
      let bestCounter: { gem: GemInstance; score: number } | null = null;
      for (const c of counterGems) {
        if (usedGems.has(c.gem.uid)) continue;
        // Swap if the counter gem has significant value
        if (c.score > slot.score * 0.5) {
          bestCounter = c;
          break;
        }
      }
      if (!bestCounter) continue;

      // Unsocket then socket
      actions.push({
        kind: 'unsocket_gem',
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      actions.push({
        kind: 'socket_gem',
        gemUid: bestCounter.gem.uid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedGems.add(bestCounter.gem.uid);
    }

    return actions;
  }
}
