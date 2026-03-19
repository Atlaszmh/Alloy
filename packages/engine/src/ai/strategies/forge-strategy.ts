import type { AffixCategory } from '../../types/affix.js';
import type { BaseStat } from '../../types/base-stats.js';
import type { ForgeAction } from '../../types/forge-action.js';
import type { Loadout } from '../../types/item.js';
import type { OrbInstance } from '../../types/orb.js';
import type { DataRegistry } from '../../data/registry.js';
import type { SeededRNG } from '../../rng/seeded-rng.js';
// getActionCost available via flux-tracker if needed

import { orbValueScore, bestArchetype } from '../evaluation.js';
import { ARCHETYPE_TAGS } from '../../pool/archetype-validator.js';

export interface ForgeStrategy {
  plan(
    stockpile: OrbInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    opponentStockpile: OrbInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[];
}

const BASE_STATS: BaseStat[] = ['STR', 'INT', 'DEX', 'VIT'];

/**
 * Tier 1 (Apprentice) Forge Strategy:
 * Random weapon/armor split. Assign orbs to random empty slots.
 * Don't combine or upgrade. Set base stats randomly.
 */
export class Tier1ForgeStrategy implements ForgeStrategy {
  plan(
    stockpile: OrbInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    _opponentStockpile: OrbInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];
    const balance = registry.getBalance();
    let flux = fluxRemaining;

    // Set base stats in round 1 (free action)
    if (round === 1) {
      const wStat1 = BASE_STATS[rng.nextInt(0, 3)];
      const wStat2 = BASE_STATS[rng.nextInt(0, 3)];
      const aStat1 = BASE_STATS[rng.nextInt(0, 3)];
      const aStat2 = BASE_STATS[rng.nextInt(0, 3)];
      actions.push({ kind: 'set_base_stats', target: 'weapon', stat1: wStat1, stat2: wStat2 });
      actions.push({ kind: 'set_base_stats', target: 'armor', stat1: aStat1, stat2: aStat2 });
    }

    // Collect empty slots for weapon and armor
    const emptySlots: { target: 'weapon' | 'armor'; slotIndex: number }[] = [];
    for (let i = 0; i < 6; i++) {
      if (loadout.weapon.slots[i] === null) {
        emptySlots.push({ target: 'weapon', slotIndex: i });
      }
    }
    for (let i = 0; i < 6; i++) {
      if (loadout.armor.slots[i] === null) {
        emptySlots.push({ target: 'armor', slotIndex: i });
      }
    }

    // Shuffle empty slots
    for (let i = emptySlots.length - 1; i > 0; i--) {
      const j = rng.nextInt(0, i);
      [emptySlots[i], emptySlots[j]] = [emptySlots[j], emptySlots[i]];
    }

    // Assign orbs to random empty slots up to flux budget
    const assignCost = balance.fluxCosts.assignOrb;
    let orbIdx = 0;
    let slotIdx = 0;

    while (orbIdx < stockpile.length && slotIdx < emptySlots.length && flux >= assignCost) {
      const slot = emptySlots[slotIdx];
      actions.push({
        kind: 'assign_orb',
        orbUid: stockpile[orbIdx].uid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      flux -= assignCost;
      orbIdx++;
      slotIdx++;
    }

    return actions;
  }
}

/**
 * Tier 2 (Journeyman) Forge Strategy:
 * Basic synergy awareness. Try to group related orbs.
 * Try basic combinations if components are available.
 * Set base stats that complement the majority category of orbs.
 */
export class Tier2ForgeStrategy implements ForgeStrategy {
  plan(
    stockpile: OrbInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    _opponentStockpile: OrbInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];
    const balance = registry.getBalance();
    let flux = fluxRemaining;

    // Determine the dominant category among stockpile orbs
    const categoryCounts: Record<AffixCategory, number> = {
      offensive: 0,
      defensive: 0,
      sustain: 0,
      utility: 0,
      trigger: 0,
    };
    for (const orb of stockpile) {
      const affix = registry.findAffix(orb.affixId);
      if (affix) {
        categoryCounts[affix.category]++;
      }
    }

    // Set base stats in round 1 based on dominant category
    if (round === 1) {
      const dominantCategory = (Object.entries(categoryCounts) as [AffixCategory, number][])
        .sort((a, b) => b[1] - a[1])[0][0];

      const statPair = categoryToStats(dominantCategory);
      actions.push({ kind: 'set_base_stats', target: 'weapon', stat1: statPair[0], stat2: statPair[1] });
      actions.push({ kind: 'set_base_stats', target: 'armor', stat1: statPair[0], stat2: statPair[1] });
    }

    // Track which orbs we've used and which slots are occupied
    const usedOrbUids = new Set<string>();
    const occupiedSlots = {
      weapon: loadout.weapon.slots.map((s) => s !== null),
      armor: loadout.armor.slots.map((s) => s !== null),
    };

    // Try combinations first (they use 2 flux and 2 consecutive slots)
    const combineCost = balance.fluxCosts.combineOrbs;
    const assignCostForCombine = balance.fluxCosts.assignOrb;
    if (flux >= combineCost + assignCostForCombine) {
      for (let i = 0; i < stockpile.length && flux >= combineCost + assignCostForCombine; i++) {
        if (usedOrbUids.has(stockpile[i].uid)) continue;
        for (let j = i + 1; j < stockpile.length && flux >= combineCost + assignCostForCombine; j++) {
          if (usedOrbUids.has(stockpile[j].uid)) continue;

          const combo = registry.getCombination(stockpile[i].affixId, stockpile[j].affixId);
          if (!combo) continue;

          // Find two consecutive empty slots
          const slot = findConsecutiveEmptySlots(occupiedSlots, rng);
          if (!slot) break; // No more slots available for combinations

          actions.push({
            kind: 'combine',
            orbUid1: stockpile[i].uid,
            orbUid2: stockpile[j].uid,
          });
          const compoundUid = `compound_${stockpile[i].uid}_${stockpile[j].uid}`;
          actions.push({
            kind: 'assign_orb',
            orbUid: compoundUid,
            target: slot.target,
            slotIndex: slot.slotIndex,
          });
          usedOrbUids.add(stockpile[i].uid);
          usedOrbUids.add(stockpile[j].uid);
          occupiedSlots[slot.target][slot.slotIndex] = true;
          occupiedSlots[slot.target][slot.slotIndex + 1] = true;
          flux -= combineCost + assignCostForCombine;
          break; // orb i is used, move to next i
        }
      }
    }

    // Assign remaining orbs to empty slots
    const assignCost = balance.fluxCosts.assignOrb;
    for (const orb of stockpile) {
      if (usedOrbUids.has(orb.uid)) continue;
      if (flux < assignCost) break;

      // Prefer placing on weapon for offensive orbs, armor for defensive
      const affix = registry.findAffix(orb.affixId);
      const preferredTarget: 'weapon' | 'armor' =
        affix && (affix.category === 'offensive' || affix.category === 'trigger')
          ? 'weapon'
          : 'armor';

      const slot = findEmptySlot(occupiedSlots, preferredTarget, rng);
      if (!slot) continue;

      actions.push({
        kind: 'assign_orb',
        orbUid: orb.uid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedOrbUids.add(orb.uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      flux -= assignCost;
    }

    return actions;
  }
}

/**
 * Map dominant affix category to base stats.
 */
function categoryToStats(category: AffixCategory): [BaseStat, BaseStat] {
  switch (category) {
    case 'offensive':
      return ['STR', 'DEX'];
    case 'defensive':
      return ['VIT', 'STR'];
    case 'sustain':
      return ['VIT', 'INT'];
    case 'utility':
      return ['DEX', 'INT'];
    case 'trigger':
      return ['INT', 'DEX'];
  }
}

/**
 * Find an empty slot, preferring the given target. Falls back to the other target.
 */
function findEmptySlot(
  occupiedSlots: { weapon: boolean[]; armor: boolean[] },
  preferredTarget: 'weapon' | 'armor',
  _rng: SeededRNG,
): { target: 'weapon' | 'armor'; slotIndex: number } | null {
  const targets: ('weapon' | 'armor')[] =
    preferredTarget === 'weapon' ? ['weapon', 'armor'] : ['armor', 'weapon'];

  for (const target of targets) {
    for (let i = 0; i < 6; i++) {
      if (!occupiedSlots[target][i]) {
        return { target, slotIndex: i };
      }
    }
  }
  return null;
}

/**
 * Find two consecutive empty slots across weapon and armor.
 */
function findConsecutiveEmptySlots(
  occupiedSlots: { weapon: boolean[]; armor: boolean[] },
  _rng: SeededRNG,
): { target: 'weapon' | 'armor'; slotIndex: number } | null {
  const targets: ('weapon' | 'armor')[] = ['weapon', 'armor'];
  for (const target of targets) {
    for (let i = 0; i < 5; i++) {
      if (!occupiedSlots[target][i] && !occupiedSlots[target][i + 1]) {
        return { target, slotIndex: i };
      }
    }
  }
  return null;
}

/**
 * Find consecutive empty slots on a specific target.
 */
function findConsecutiveEmptySlotsOn(
  occupiedSlots: { weapon: boolean[]; armor: boolean[] },
  preferredTarget: 'weapon' | 'armor',
): { target: 'weapon' | 'armor'; slotIndex: number } | null {
  const targets: ('weapon' | 'armor')[] =
    preferredTarget === 'weapon' ? ['weapon', 'armor'] : ['armor', 'weapon'];
  for (const target of targets) {
    for (let i = 0; i < 5; i++) {
      if (!occupiedSlots[target][i] && !occupiedSlots[target][i + 1]) {
        return { target, slotIndex: i };
      }
    }
  }
  return null;
}

/**
 * Determine the best base stat pair for a given archetype.
 */
function archetypeToStats(archetype: string): [BaseStat, BaseStat] {
  switch (archetype) {
    case 'physical_burst':
      return ['STR', 'DEX'];
    case 'elemental_fire':
    case 'elemental_cold':
      return ['INT', 'DEX'];
    case 'dot_poison':
      return ['INT', 'VIT'];
    case 'crit_assassin':
      return ['DEX', 'STR'];
    case 'tank_fortress':
      return ['VIT', 'STR'];
    case 'sustain_leech':
      return ['VIT', 'STR'];
    case 'shadow_control':
      return ['INT', 'DEX'];
    default:
      return ['STR', 'VIT'];
  }
}

/**
 * Tier 3 (Artisan) Forge Strategy:
 * Sensible combinations. Balanced offense/defense split between weapon and armor.
 * Tries combinations first, then assigns remaining orbs with category awareness.
 */
export class Tier3ForgeStrategy implements ForgeStrategy {
  plan(
    stockpile: OrbInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    _opponentStockpile: OrbInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];
    const balance = registry.getBalance();
    let flux = fluxRemaining;

    // Set base stats in round 1 based on archetype
    if (round === 1) {
      const arch = bestArchetype(stockpile, registry);
      const weaponStats = archetypeToStats(arch);
      // Armor should complement: defensive stats
      const armorStats: [BaseStat, BaseStat] = arch.includes('tank') || arch.includes('sustain')
        ? ['VIT', 'STR']
        : ['VIT', 'INT'];
      actions.push({ kind: 'set_base_stats', target: 'weapon', stat1: weaponStats[0], stat2: weaponStats[1] });
      actions.push({ kind: 'set_base_stats', target: 'armor', stat1: armorStats[0], stat2: armorStats[1] });
    }

    const usedOrbUids = new Set<string>();
    const occupiedSlots = {
      weapon: loadout.weapon.slots.map((s) => s !== null),
      armor: loadout.armor.slots.map((s) => s !== null),
    };

    // Sort orbs by value (highest first)
    const sortedStockpile = [...stockpile].sort(
      (a, b) => orbValueScore(b, registry) - orbValueScore(a, registry),
    );

    // Try combinations first
    const combineCost = balance.fluxCosts.combineOrbs;
    const assignCostForCombine = balance.fluxCosts.assignOrb;
    for (let i = 0; i < sortedStockpile.length && flux >= combineCost + assignCostForCombine; i++) {
      if (usedOrbUids.has(sortedStockpile[i].uid)) continue;
      for (let j = i + 1; j < sortedStockpile.length && flux >= combineCost + assignCostForCombine; j++) {
        if (usedOrbUids.has(sortedStockpile[j].uid)) continue;

        const combo = registry.getCombination(sortedStockpile[i].affixId, sortedStockpile[j].affixId);
        if (!combo) continue;

        // Place combinations on weapon (offensive focus)
        const slot = findConsecutiveEmptySlotsOn(occupiedSlots, 'weapon');
        if (!slot) continue;

        actions.push({
          kind: 'combine',
          orbUid1: sortedStockpile[i].uid,
          orbUid2: sortedStockpile[j].uid,
        });
        const compoundUid = `compound_${sortedStockpile[i].uid}_${sortedStockpile[j].uid}`;
        actions.push({
          kind: 'assign_orb',
          orbUid: compoundUid,
          target: slot.target,
          slotIndex: slot.slotIndex,
        });
        usedOrbUids.add(sortedStockpile[i].uid);
        usedOrbUids.add(sortedStockpile[j].uid);
        occupiedSlots[slot.target][slot.slotIndex] = true;
        occupiedSlots[slot.target][slot.slotIndex + 1] = true;
        flux -= combineCost + assignCostForCombine;
        break; // i orb is consumed, move to next i
      }
    }

    // Try upgrades (same affix, different orbs)
    const upgradeCost = balance.fluxCosts.upgradeTier;
    for (let i = 0; i < sortedStockpile.length && flux >= upgradeCost; i++) {
      if (usedOrbUids.has(sortedStockpile[i].uid)) continue;
      if (sortedStockpile[i].tier >= 4) continue;
      for (let j = i + 1; j < sortedStockpile.length && flux >= upgradeCost; j++) {
        if (usedOrbUids.has(sortedStockpile[j].uid)) continue;
        if (sortedStockpile[i].affixId !== sortedStockpile[j].affixId) continue;
        if (sortedStockpile[j].tier >= 4) continue;

        const affix = registry.findAffix(sortedStockpile[i].affixId);
        const preferredTarget: 'weapon' | 'armor' =
          affix && (affix.category === 'offensive' || affix.category === 'trigger')
            ? 'weapon'
            : 'armor';

        const slot = findEmptySlot(occupiedSlots, preferredTarget, rng);
        if (!slot) continue;

        actions.push({
          kind: 'upgrade_tier',
          orbUid1: sortedStockpile[i].uid,
          orbUid2: sortedStockpile[j].uid,
          target: slot.target,
          slotIndex: slot.slotIndex,
        });
        usedOrbUids.add(sortedStockpile[i].uid);
        usedOrbUids.add(sortedStockpile[j].uid);
        occupiedSlots[slot.target][slot.slotIndex] = true;
        flux -= upgradeCost;
        break; // i orb is consumed, move to next i
      }
    }

    // Assign remaining orbs with balanced weapon/armor split
    const assignCost = balance.fluxCosts.assignOrb;
    for (const orb of sortedStockpile) {
      if (usedOrbUids.has(orb.uid)) continue;
      if (flux < assignCost) break;

      const affix = registry.findAffix(orb.affixId);
      const preferredTarget: 'weapon' | 'armor' =
        affix && (affix.category === 'offensive' || affix.category === 'trigger')
          ? 'weapon'
          : 'armor';

      const slot = findEmptySlot(occupiedSlots, preferredTarget, rng);
      if (!slot) continue;

      actions.push({
        kind: 'assign_orb',
        orbUid: orb.uid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedOrbUids.add(orb.uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      flux -= assignCost;
    }

    return actions;
  }
}

/**
 * Tier 4 (Master) Forge Strategy:
 * Optimal combinations. Reads opponent stockpile for counter-building.
 * Tries to maximize synergy bonuses. Prioritizes the highest-value combinations.
 */
export class Tier4ForgeStrategy implements ForgeStrategy {
  plan(
    stockpile: OrbInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    _opponentStockpile: OrbInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];
    const balance = registry.getBalance();
    let flux = fluxRemaining;

    // Set base stats in round 1 based on archetype
    if (round === 1) {
      const arch = bestArchetype(stockpile, registry);
      const weaponStats = archetypeToStats(arch);
      // Armor: VIT for HP + complement the weapon build
      const armorStats: [BaseStat, BaseStat] =
        arch.includes('elemental') || arch.includes('dot') || arch === 'shadow_control'
          ? ['VIT', 'INT']
          : ['VIT', 'STR'];

      actions.push({ kind: 'set_base_stats', target: 'weapon', stat1: weaponStats[0], stat2: weaponStats[1] });
      actions.push({ kind: 'set_base_stats', target: 'armor', stat1: armorStats[0], stat2: armorStats[1] });
    }

    const usedOrbUids = new Set<string>();
    const occupiedSlots = {
      weapon: loadout.weapon.slots.map((s) => s !== null),
      armor: loadout.armor.slots.map((s) => s !== null),
    };

    // Find ALL valid combinations, score them, and pick the best ones
    const combineCost = balance.fluxCosts.combineOrbs;
    interface ComboPlan {
      i: number;
      j: number;
      score: number;
    }
    const comboCandidates: ComboPlan[] = [];

    for (let i = 0; i < stockpile.length; i++) {
      for (let j = i + 1; j < stockpile.length; j++) {
        const combo = registry.getCombination(stockpile[i].affixId, stockpile[j].affixId);
        if (!combo) continue;
        // Score based on component values + combo tags
        const score = orbValueScore(stockpile[i], registry) + orbValueScore(stockpile[j], registry);
        comboCandidates.push({ i, j, score });
      }
    }

    // Sort by score descending
    comboCandidates.sort((a, b) => b.score - a.score);

    // Apply the best non-conflicting combinations
    const assignCostForCombine = balance.fluxCosts.assignOrb;
    for (const cand of comboCandidates) {
      if (flux < combineCost + assignCostForCombine) break;
      if (usedOrbUids.has(stockpile[cand.i].uid) || usedOrbUids.has(stockpile[cand.j].uid)) continue;

      const slot = findConsecutiveEmptySlotsOn(occupiedSlots, 'weapon');
      if (!slot) break;

      actions.push({
        kind: 'combine',
        orbUid1: stockpile[cand.i].uid,
        orbUid2: stockpile[cand.j].uid,
      });
      const compoundUid = `compound_${stockpile[cand.i].uid}_${stockpile[cand.j].uid}`;
      actions.push({
        kind: 'assign_orb',
        orbUid: compoundUid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedOrbUids.add(stockpile[cand.i].uid);
      usedOrbUids.add(stockpile[cand.j].uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      occupiedSlots[slot.target][slot.slotIndex + 1] = true;
      flux -= combineCost + assignCostForCombine;
    }

    // Try upgrades
    const upgradeCost = balance.fluxCosts.upgradeTier;
    const upgradeCandidates: { i: number; j: number; score: number }[] = [];
    for (let i = 0; i < stockpile.length; i++) {
      if (usedOrbUids.has(stockpile[i].uid)) continue;
      if (stockpile[i].tier >= 4) continue;
      for (let j = i + 1; j < stockpile.length; j++) {
        if (usedOrbUids.has(stockpile[j].uid)) continue;
        if (stockpile[j].tier >= 4) continue;
        if (stockpile[i].affixId !== stockpile[j].affixId) continue;
        const score = orbValueScore(stockpile[i], registry) + orbValueScore(stockpile[j], registry);
        upgradeCandidates.push({ i, j, score });
      }
    }
    upgradeCandidates.sort((a, b) => b.score - a.score);

    for (const cand of upgradeCandidates) {
      if (flux < upgradeCost) break;
      if (usedOrbUids.has(stockpile[cand.i].uid) || usedOrbUids.has(stockpile[cand.j].uid)) continue;

      const affix = registry.findAffix(stockpile[cand.i].affixId);
      const preferredTarget: 'weapon' | 'armor' =
        affix && (affix.category === 'offensive' || affix.category === 'trigger')
          ? 'weapon'
          : 'armor';
      const slot = findEmptySlot(occupiedSlots, preferredTarget, rng);
      if (!slot) continue;

      actions.push({
        kind: 'upgrade_tier',
        orbUid1: stockpile[cand.i].uid,
        orbUid2: stockpile[cand.j].uid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedOrbUids.add(stockpile[cand.i].uid);
      usedOrbUids.add(stockpile[cand.j].uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      flux -= upgradeCost;
    }

    // Assign remaining orbs sorted by value
    const assignCost = balance.fluxCosts.assignOrb;
    const remaining = stockpile
      .filter((o) => !usedOrbUids.has(o.uid))
      .sort((a, b) => orbValueScore(b, registry) - orbValueScore(a, registry));

    for (const orb of remaining) {
      if (flux < assignCost) break;

      const affix = registry.findAffix(orb.affixId);
      const preferredTarget: 'weapon' | 'armor' =
        affix && (affix.category === 'offensive' || affix.category === 'trigger')
          ? 'weapon'
          : 'armor';

      const slot = findEmptySlot(occupiedSlots, preferredTarget, rng);
      if (!slot) continue;

      actions.push({
        kind: 'assign_orb',
        orbUid: orb.uid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedOrbUids.add(orb.uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      flux -= assignCost;
    }

    return actions;
  }
}

/**
 * Tier 5 (Alloy) Forge Strategy:
 * Near-optimal forging. Exhaustive combination search.
 * Tries all valid combination pairs and picks the best.
 * Exploits matchup knowledge from opponent stockpile.
 */
export class Tier5ForgeStrategy implements ForgeStrategy {
  plan(
    stockpile: OrbInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    opponentStockpile: OrbInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];
    const balance = registry.getBalance();
    let flux = fluxRemaining;

    // Set base stats in round 1
    if (round === 1) {
      const arch = bestArchetype(stockpile, registry);
      const weaponStats = archetypeToStats(arch);
      // Counter-based armor stats
      const oppArch = opponentStockpile.length > 0
        ? bestArchetype(opponentStockpile, registry)
        : '';
      const counterArmorStats: [BaseStat, BaseStat] =
        oppArch.includes('physical') || oppArch.includes('crit')
          ? ['VIT', 'STR']
          : oppArch.includes('elemental') || oppArch.includes('dot')
            ? ['VIT', 'INT']
            : ['VIT', 'DEX'];

      actions.push({ kind: 'set_base_stats', target: 'weapon', stat1: weaponStats[0], stat2: weaponStats[1] });
      actions.push({ kind: 'set_base_stats', target: 'armor', stat1: counterArmorStats[0], stat2: counterArmorStats[1] });
    }

    const usedOrbUids = new Set<string>();
    const occupiedSlots = {
      weapon: loadout.weapon.slots.map((s) => s !== null),
      armor: loadout.armor.slots.map((s) => s !== null),
    };

    // Exhaustive combination search: find ALL valid combo pairs
    const combineCost = balance.fluxCosts.combineOrbs;
    interface ComboPlan {
      idx1: number;
      idx2: number;
      score: number;
      comboId: string;
    }
    const allCombos: ComboPlan[] = [];

    for (let i = 0; i < stockpile.length; i++) {
      for (let j = i + 1; j < stockpile.length; j++) {
        const combo = registry.getCombination(stockpile[i].affixId, stockpile[j].affixId);
        if (!combo) continue;

        // Score: component value + synergy with rest of stockpile
        let score = orbValueScore(stockpile[i], registry) + orbValueScore(stockpile[j], registry);

        // Bonus for combo tags that match our archetype
        const arch = bestArchetype(stockpile, registry);
        const archTags = ARCHETYPE_TAGS[arch];
        for (const tag of combo.tags) {
          if (archTags.includes(tag)) score += 5;
        }

        allCombos.push({ idx1: i, idx2: j, score, comboId: combo.id });
      }
    }

    // Sort by score descending
    allCombos.sort((a, b) => b.score - a.score);

    // Greedily select non-conflicting combinations
    const assignCostForCombine = balance.fluxCosts.assignOrb;
    for (const cand of allCombos) {
      if (flux < combineCost + assignCostForCombine) break;
      if (usedOrbUids.has(stockpile[cand.idx1].uid) || usedOrbUids.has(stockpile[cand.idx2].uid)) continue;

      const slot = findConsecutiveEmptySlotsOn(occupiedSlots, 'weapon');
      if (!slot) break;

      actions.push({
        kind: 'combine',
        orbUid1: stockpile[cand.idx1].uid,
        orbUid2: stockpile[cand.idx2].uid,
      });
      const compoundUid = `compound_${stockpile[cand.idx1].uid}_${stockpile[cand.idx2].uid}`;
      actions.push({
        kind: 'assign_orb',
        orbUid: compoundUid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedOrbUids.add(stockpile[cand.idx1].uid);
      usedOrbUids.add(stockpile[cand.idx2].uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      occupiedSlots[slot.target][slot.slotIndex + 1] = true;
      flux -= combineCost + assignCostForCombine;
    }

    // Try upgrades (highest value pairs first)
    const upgradeCost = balance.fluxCosts.upgradeTier;
    const upgradeCandidates: { i: number; j: number; score: number }[] = [];
    for (let i = 0; i < stockpile.length; i++) {
      if (usedOrbUids.has(stockpile[i].uid)) continue;
      if (stockpile[i].tier >= 4) continue;
      for (let j = i + 1; j < stockpile.length; j++) {
        if (usedOrbUids.has(stockpile[j].uid)) continue;
        if (stockpile[j].tier >= 4) continue;
        if (stockpile[i].affixId !== stockpile[j].affixId) continue;
        // Upgraded tier is higher, so the score should reflect the upgrade value
        const upgradedScore = orbValueScore({ ...stockpile[i], tier: Math.min(stockpile[i].tier + 1, 4) as 1 | 2 | 3 | 4 }, registry);
        upgradeCandidates.push({ i, j, score: upgradedScore });
      }
    }
    upgradeCandidates.sort((a, b) => b.score - a.score);

    for (const cand of upgradeCandidates) {
      if (flux < upgradeCost) break;
      if (usedOrbUids.has(stockpile[cand.i].uid) || usedOrbUids.has(stockpile[cand.j].uid)) continue;

      const affix = registry.findAffix(stockpile[cand.i].affixId);
      const preferredTarget: 'weapon' | 'armor' =
        affix && (affix.category === 'offensive' || affix.category === 'trigger')
          ? 'weapon'
          : 'armor';
      const slot = findEmptySlot(occupiedSlots, preferredTarget, rng);
      if (!slot) continue;

      actions.push({
        kind: 'upgrade_tier',
        orbUid1: stockpile[cand.i].uid,
        orbUid2: stockpile[cand.j].uid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedOrbUids.add(stockpile[cand.i].uid);
      usedOrbUids.add(stockpile[cand.j].uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      flux -= upgradeCost;
    }

    // Assign remaining orbs sorted by value, placing highest value first
    const assignCost = balance.fluxCosts.assignOrb;
    const remaining = stockpile
      .filter((o) => !usedOrbUids.has(o.uid))
      .sort((a, b) => orbValueScore(b, registry) - orbValueScore(a, registry));

    for (const orb of remaining) {
      if (flux < assignCost) break;

      const affix = registry.findAffix(orb.affixId);
      const preferredTarget: 'weapon' | 'armor' =
        affix && (affix.category === 'offensive' || affix.category === 'trigger')
          ? 'weapon'
          : 'armor';

      const slot = findEmptySlot(occupiedSlots, preferredTarget, rng);
      if (!slot) continue;

      actions.push({
        kind: 'assign_orb',
        orbUid: orb.uid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedOrbUids.add(orb.uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      flux -= assignCost;
    }

    return actions;
  }
}
