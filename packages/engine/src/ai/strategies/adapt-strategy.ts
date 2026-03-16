import type { CombatLog } from '../../types/combat.js';
import type { ForgeAction } from '../../types/forge-action.js';
import type { EquippedSlot, Loadout } from '../../types/item.js';
import type { OrbInstance } from '../../types/orb.js';
import type { DataRegistry } from '../../data/registry.js';
import type { SeededRNG } from '../../rng/seeded-rng.js';
import { extractDamageProfile, counterValue, orbValueScore } from '../evaluation.js';

export interface AdaptStrategy {
  adapt(
    previousDuelLog: CombatLog,
    opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: OrbInstance[],
    fluxRemaining: number,
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[];
}

/**
 * Tier 1 (Apprentice) Adapt Strategy:
 * No adaptation — returns empty action list.
 */
export class Tier1AdaptStrategy implements AdaptStrategy {
  adapt(
    _previousDuelLog: CombatLog,
    _opponentLoadout: Loadout,
    _myLoadout: Loadout,
    _myStockpile: OrbInstance[],
    _fluxRemaining: number,
    _registry: DataRegistry,
    _rng: SeededRNG,
  ): ForgeAction[] {
    return [];
  }
}

/**
 * Tier 2 (Journeyman) Adapt Strategy:
 * No adaptation — returns empty action list.
 */
export class Tier2AdaptStrategy implements AdaptStrategy {
  adapt(
    _previousDuelLog: CombatLog,
    _opponentLoadout: Loadout,
    _myLoadout: Loadout,
    _myStockpile: OrbInstance[],
    _fluxRemaining: number,
    _registry: DataRegistry,
    _rng: SeededRNG,
  ): ForgeAction[] {
    return [];
  }
}

/**
 * Extract orb from a slot if it is a single or upgraded slot.
 */
function getSlotOrb(slot: EquippedSlot): OrbInstance | null {
  if (slot.kind === 'single') return slot.orb;
  if (slot.kind === 'upgraded') return slot.orb;
  return null; // compound slots can't be swapped individually
}

/**
 * Find the weakest single/upgraded slot in a loadout (lowest orb value).
 */
function findWeakestSlots(
  loadout: Loadout,
  registry: DataRegistry,
  maxCount: number,
): { target: 'weapon' | 'armor'; slotIndex: number; orb: OrbInstance; score: number }[] {
  const slots: { target: 'weapon' | 'armor'; slotIndex: number; orb: OrbInstance; score: number }[] = [];
  const targets: ('weapon' | 'armor')[] = ['weapon', 'armor'];
  for (const target of targets) {
    const item = target === 'weapon' ? loadout.weapon : loadout.armor;
    for (let i = 0; i < 6; i++) {
      const slot = item.slots[i];
      if (!slot) continue;
      const orb = getSlotOrb(slot);
      if (!orb) continue;
      slots.push({ target, slotIndex: i, orb, score: orbValueScore(orb, registry) });
    }
  }
  // Sort by score ascending (weakest first)
  slots.sort((a, b) => a.score - b.score);
  return slots.slice(0, maxCount);
}

/**
 * Tier 3 (Artisan) Adapt Strategy:
 * Swaps 1-2 orbs toward countering the opponent's build.
 * Looks at the previous combat log to determine what the opponent did.
 */
export class Tier3AdaptStrategy implements AdaptStrategy {
  adapt(
    previousDuelLog: CombatLog,
    _opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: OrbInstance[],
    fluxRemaining: number,
    registry: DataRegistry,
    _rng: SeededRNG,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];
    const balance = registry.getBalance();
    const swapCost = balance.fluxCosts.swapOrb;
    let flux = fluxRemaining;

    if (myStockpile.length === 0 || flux < swapCost) return actions;

    // Analyze opponent damage
    const myPlayerIdx = previousDuelLog.result.winner === 0 ? 1 : 0;
    const opponentIdx = (myPlayerIdx === 0 ? 1 : 0) as 0 | 1;
    const damageProfile = extractDamageProfile(previousDuelLog, opponentIdx);

    if (damageProfile.totalDamage === 0) return actions;

    // Find best counter orbs from stockpile
    const counterOrbs = myStockpile
      .map((orb) => ({ orb, score: counterValue(orb, damageProfile, registry) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    if (counterOrbs.length === 0) return actions;

    // Find weakest equipped slots (1-2)
    const weakSlots = findWeakestSlots(myLoadout, registry, 2);

    // Swap up to 2 weak slots with better counter orbs
    let swapCount = 0;
    for (const weak of weakSlots) {
      if (swapCount >= 2 || flux < swapCost) break;
      if (counterOrbs.length <= swapCount) break;

      const counterOrb = counterOrbs[swapCount];
      // Only swap if counter orb is actually better
      if (counterOrb.score <= weak.score) continue;

      actions.push({
        kind: 'swap_orb',
        target: weak.target,
        slotIndex: weak.slotIndex,
        newOrbUid: counterOrb.orb.uid,
      });
      flux -= swapCost;
      swapCount++;
    }

    return actions;
  }
}

/**
 * Tier 4 (Master) Adapt Strategy:
 * Significant adaptation. Reads damage patterns from previous duel log.
 * May swap multiple orbs to counter the opponent's strategy.
 */
export class Tier4AdaptStrategy implements AdaptStrategy {
  adapt(
    previousDuelLog: CombatLog,
    _opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: OrbInstance[],
    fluxRemaining: number,
    registry: DataRegistry,
    _rng: SeededRNG,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];
    const balance = registry.getBalance();
    const swapCost = balance.fluxCosts.swapOrb;
    let flux = fluxRemaining;

    if (myStockpile.length === 0 || flux < swapCost) return actions;

    // Analyze opponent damage patterns
    const myPlayerIdx = previousDuelLog.result.winner === 0 ? 1 : 0;
    const opponentIdx = (myPlayerIdx === 0 ? 1 : 0) as 0 | 1;
    const damageProfile = extractDamageProfile(previousDuelLog, opponentIdx);

    if (damageProfile.totalDamage === 0) return actions;

    // Score all stockpile orbs by counter value
    const counterOrbs = myStockpile
      .map((orb) => ({ orb, score: counterValue(orb, damageProfile, registry) }))
      .sort((a, b) => b.score - a.score);

    // Find all swappable slots sorted by weakness
    const weakSlots = findWeakestSlots(myLoadout, registry, 4);

    // Swap weak slots with better counter orbs (up to 4)
    const usedOrbs = new Set<string>();
    for (const weak of weakSlots) {
      if (flux < swapCost) break;

      // Find the best unused counter orb
      let bestCounter: { orb: OrbInstance; score: number } | null = null;
      for (const c of counterOrbs) {
        if (usedOrbs.has(c.orb.uid)) continue;
        if (c.score > weak.score * 0.8) {
          bestCounter = c;
          break;
        }
      }
      if (!bestCounter) continue;

      actions.push({
        kind: 'swap_orb',
        target: weak.target,
        slotIndex: weak.slotIndex,
        newOrbUid: bestCounter.orb.uid,
      });
      usedOrbs.add(bestCounter.orb.uid);
      flux -= swapCost;
    }

    return actions;
  }
}

/**
 * Tier 5 (Alloy) Adapt Strategy:
 * Complete rebuild if needed. Predicts opponent adaptation based on their
 * stockpile. Swaps as many orbs as flux allows to optimize counter-build.
 */
export class Tier5AdaptStrategy implements AdaptStrategy {
  adapt(
    previousDuelLog: CombatLog,
    opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: OrbInstance[],
    fluxRemaining: number,
    registry: DataRegistry,
    _rng: SeededRNG,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];
    const balance = registry.getBalance();
    const swapCost = balance.fluxCosts.swapOrb;
    let flux = fluxRemaining;

    if (myStockpile.length === 0 || flux < swapCost) return actions;

    // Analyze opponent damage
    const myPlayerIdx = previousDuelLog.result.winner === 0 ? 1 : 0;
    const opponentIdx = (myPlayerIdx === 0 ? 1 : 0) as 0 | 1;
    const damageProfile = extractDamageProfile(previousDuelLog, opponentIdx);

    // Also analyze what orbs the opponent has in their loadout
    // to predict their build direction
    const opponentOrbIds = new Set<string>();
    const targets: ('weapon' | 'armor')[] = ['weapon', 'armor'];
    for (const target of targets) {
      const item = target === 'weapon' ? opponentLoadout.weapon : opponentLoadout.armor;
      for (let i = 0; i < 6; i++) {
        const slot = item.slots[i];
        if (!slot) continue;
        const orb = getSlotOrb(slot);
        if (orb) opponentOrbIds.add(orb.affixId);
      }
    }

    // Score stockpile orbs by counter value AND general quality
    const counterOrbs = myStockpile
      .map((orb) => {
        let score = counterValue(orb, damageProfile, registry);
        // Bonus for orbs that counter the opponent's build direction
        const affix = registry.findAffix(orb.affixId);
        if (affix) {
          // Defensive orbs counter high damage
          if (affix.category === 'defensive' && damageProfile.totalDamage > 0) {
            score += orbValueScore(orb, registry) * 0.3;
          }
        }
        return { orb, score };
      })
      .sort((a, b) => b.score - a.score);

    // Find all swappable slots
    const allSlots = findWeakestSlots(myLoadout, registry, 6);

    // Aggressively swap to counter (up to flux budget)
    const usedOrbs = new Set<string>();
    for (const slot of allSlots) {
      if (flux < swapCost) break;

      // Find the best unused counter orb that improves over current
      let bestCounter: { orb: OrbInstance; score: number } | null = null;
      for (const c of counterOrbs) {
        if (usedOrbs.has(c.orb.uid)) continue;
        // Swap if the counter orb has significant value
        if (c.score > slot.score * 0.5) {
          bestCounter = c;
          break;
        }
      }
      if (!bestCounter) continue;

      actions.push({
        kind: 'swap_orb',
        target: slot.target,
        slotIndex: slot.slotIndex,
        newOrbUid: bestCounter.orb.uid,
      });
      usedOrbs.add(bestCounter.orb.uid);
      flux -= swapCost;
    }

    return actions;
  }
}
