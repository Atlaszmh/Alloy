import type { AffixCategory } from '../../types/affix.js';
import type { BaseStat } from '../../types/base-stats.js';
import type { ForgeAction } from '../../types/forge-action.js';
import type { Loadout } from '../../types/item.js';
import type { GemInstance } from '../../types/gem.js';
import type { DataRegistry } from '../../data/registry.js';
import type { SeededRNG } from '../../rng/seeded-rng.js';

import { orbValueScore, bestArchetype } from '../evaluation.js';
import { ARCHETYPE_TAGS } from '../../pool/archetype-validator.js';

export interface ForgeStrategy {
  plan(
    stockpile: GemInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: number,
    opponentStockpile: GemInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[];
}

const BASE_STATS: BaseStat[] = ['STR', 'INT', 'DEX', 'VIT'];

/**
 * Tier 1 (Apprentice) Forge Strategy:
 * Random weapon/armor split. Socket gems to random empty slots.
 * Don't combine. Set base stats randomly.
 */
export class Tier1ForgeStrategy implements ForgeStrategy {
  plan(
    stockpile: GemInstance[],
    loadout: Loadout,
    _fluxRemaining: number,
    round: number,
    _opponentStockpile: GemInstance[],
    _registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];

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

    // Socket gems to random empty slots (no flux cost)
    let gemIdx = 0;
    let slotIdx = 0;

    while (gemIdx < stockpile.length && slotIdx < emptySlots.length) {
      const slot = emptySlots[slotIdx];
      actions.push({
        kind: 'socket_gem',
        gemUid: stockpile[gemIdx].uid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      gemIdx++;
      slotIdx++;
    }

    return actions;
  }
}

/**
 * Tier 2 (Journeyman) Forge Strategy:
 * Basic synergy awareness. Try to group related gems.
 * Try basic combinations if components are available.
 * Set base stats that complement the majority category of gems.
 */
export class Tier2ForgeStrategy implements ForgeStrategy {
  plan(
    stockpile: GemInstance[],
    loadout: Loadout,
    _fluxRemaining: number,
    round: number,
    _opponentStockpile: GemInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];

    // Determine the dominant category among stockpile gems
    const categoryCounts: Record<AffixCategory, number> = {
      offensive: 0,
      defensive: 0,
      sustain: 0,
      utility: 0,
      trigger: 0,
    };
    for (const gem of stockpile) {
      const affix = registry.findAffix(gem.affixId);
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

    // Track which gems we've used and which slots are occupied
    const usedGemUids = new Set<string>();
    const occupiedSlots = {
      weapon: loadout.weapon.slots.map((s) => s !== null),
      armor: loadout.armor.slots.map((s) => s !== null),
    };

    // Try combinations first
    for (let i = 0; i < stockpile.length; i++) {
      if (usedGemUids.has(stockpile[i].uid)) continue;
      for (let j = i + 1; j < stockpile.length; j++) {
        if (usedGemUids.has(stockpile[j].uid)) continue;

        const combo = registry.getCombination(stockpile[i].affixId, stockpile[j].affixId);
        if (!combo) continue;

        actions.push({
          kind: 'combine',
          gemUid1: stockpile[i].uid,
          gemUid2: stockpile[j].uid,
        });

        // Socket the result
        const combinedUid = `combined_${stockpile[i].uid}_${stockpile[j].uid}`;
        const slot = findEmptySlot(occupiedSlots, 'weapon', rng);
        if (slot) {
          actions.push({
            kind: 'socket_gem',
            gemUid: combinedUid,
            target: slot.target,
            slotIndex: slot.slotIndex,
          });
          occupiedSlots[slot.target][slot.slotIndex] = true;
        }

        usedGemUids.add(stockpile[i].uid);
        usedGemUids.add(stockpile[j].uid);
        break; // gem i is used, move to next i
      }
    }

    // Socket remaining gems to empty slots
    for (const gem of stockpile) {
      if (usedGemUids.has(gem.uid)) continue;

      // Prefer placing on weapon for offensive gems, armor for defensive
      const affix = registry.findAffix(gem.affixId);
      const preferredTarget: 'weapon' | 'armor' =
        affix && (affix.category === 'offensive' || affix.category === 'trigger')
          ? 'weapon'
          : 'armor';

      const slot = findEmptySlot(occupiedSlots, preferredTarget, rng);
      if (!slot) continue;

      actions.push({
        kind: 'socket_gem',
        gemUid: gem.uid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedGemUids.add(gem.uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
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
 * Tries combinations first, then sockets remaining gems with category awareness.
 */
export class Tier3ForgeStrategy implements ForgeStrategy {
  plan(
    stockpile: GemInstance[],
    loadout: Loadout,
    _fluxRemaining: number,
    round: number,
    _opponentStockpile: GemInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];

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

    const usedGemUids = new Set<string>();
    const occupiedSlots = {
      weapon: loadout.weapon.slots.map((s) => s !== null),
      armor: loadout.armor.slots.map((s) => s !== null),
    };

    // Sort gems by value (highest first)
    const sortedStockpile = [...stockpile].sort(
      (a, b) => orbValueScore(b, registry) - orbValueScore(a, registry),
    );

    // Try combinations first
    for (let i = 0; i < sortedStockpile.length; i++) {
      if (usedGemUids.has(sortedStockpile[i].uid)) continue;
      for (let j = i + 1; j < sortedStockpile.length; j++) {
        if (usedGemUids.has(sortedStockpile[j].uid)) continue;

        const combo = registry.getCombination(sortedStockpile[i].affixId, sortedStockpile[j].affixId);
        if (!combo) continue;

        actions.push({
          kind: 'combine',
          gemUid1: sortedStockpile[i].uid,
          gemUid2: sortedStockpile[j].uid,
        });
        const combinedUid = `combined_${sortedStockpile[i].uid}_${sortedStockpile[j].uid}`;
        const slot = findEmptySlot(occupiedSlots, 'weapon', rng);
        if (slot) {
          actions.push({
            kind: 'socket_gem',
            gemUid: combinedUid,
            target: slot.target,
            slotIndex: slot.slotIndex,
          });
          occupiedSlots[slot.target][slot.slotIndex] = true;
        }
        usedGemUids.add(sortedStockpile[i].uid);
        usedGemUids.add(sortedStockpile[j].uid);
        break; // i gem is consumed, move to next i
      }
    }

    // Socket remaining gems with balanced weapon/armor split
    for (const gem of sortedStockpile) {
      if (usedGemUids.has(gem.uid)) continue;

      const affix = registry.findAffix(gem.affixId);
      const preferredTarget: 'weapon' | 'armor' =
        affix && (affix.category === 'offensive' || affix.category === 'trigger')
          ? 'weapon'
          : 'armor';

      const slot = findEmptySlot(occupiedSlots, preferredTarget, rng);
      if (!slot) continue;

      actions.push({
        kind: 'socket_gem',
        gemUid: gem.uid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedGemUids.add(gem.uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
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
    stockpile: GemInstance[],
    loadout: Loadout,
    _fluxRemaining: number,
    round: number,
    _opponentStockpile: GemInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];

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

    const usedGemUids = new Set<string>();
    const occupiedSlots = {
      weapon: loadout.weapon.slots.map((s) => s !== null),
      armor: loadout.armor.slots.map((s) => s !== null),
    };

    // Find ALL valid combinations, score them, and pick the best ones
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
    for (const cand of comboCandidates) {
      if (usedGemUids.has(stockpile[cand.i].uid) || usedGemUids.has(stockpile[cand.j].uid)) continue;

      const slot = findEmptySlot(occupiedSlots, 'weapon', rng);
      if (!slot) break;

      actions.push({
        kind: 'combine',
        gemUid1: stockpile[cand.i].uid,
        gemUid2: stockpile[cand.j].uid,
      });
      const combinedUid = `combined_${stockpile[cand.i].uid}_${stockpile[cand.j].uid}`;
      actions.push({
        kind: 'socket_gem',
        gemUid: combinedUid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedGemUids.add(stockpile[cand.i].uid);
      usedGemUids.add(stockpile[cand.j].uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
    }

    // Socket remaining gems sorted by value
    const remaining = stockpile
      .filter((g) => !usedGemUids.has(g.uid))
      .sort((a, b) => orbValueScore(b, registry) - orbValueScore(a, registry));

    for (const gem of remaining) {
      const affix = registry.findAffix(gem.affixId);
      const preferredTarget: 'weapon' | 'armor' =
        affix && (affix.category === 'offensive' || affix.category === 'trigger')
          ? 'weapon'
          : 'armor';

      const slot = findEmptySlot(occupiedSlots, preferredTarget, rng);
      if (!slot) continue;

      actions.push({
        kind: 'socket_gem',
        gemUid: gem.uid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedGemUids.add(gem.uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
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
    stockpile: GemInstance[],
    loadout: Loadout,
    _fluxRemaining: number,
    round: number,
    opponentStockpile: GemInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];

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

    const usedGemUids = new Set<string>();
    const occupiedSlots = {
      weapon: loadout.weapon.slots.map((s) => s !== null),
      armor: loadout.armor.slots.map((s) => s !== null),
    };

    // Exhaustive combination search: find ALL valid combo pairs
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
    for (const cand of allCombos) {
      if (usedGemUids.has(stockpile[cand.idx1].uid) || usedGemUids.has(stockpile[cand.idx2].uid)) continue;

      const slot = findEmptySlot(occupiedSlots, 'weapon', rng);
      if (!slot) break;

      actions.push({
        kind: 'combine',
        gemUid1: stockpile[cand.idx1].uid,
        gemUid2: stockpile[cand.idx2].uid,
      });
      const combinedUid = `combined_${stockpile[cand.idx1].uid}_${stockpile[cand.idx2].uid}`;
      actions.push({
        kind: 'socket_gem',
        gemUid: combinedUid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedGemUids.add(stockpile[cand.idx1].uid);
      usedGemUids.add(stockpile[cand.idx2].uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
    }

    // Socket remaining gems sorted by value, placing highest value first
    const remaining = stockpile
      .filter((g) => !usedGemUids.has(g.uid))
      .sort((a, b) => orbValueScore(b, registry) - orbValueScore(a, registry));

    for (const gem of remaining) {
      const affix = registry.findAffix(gem.affixId);
      const preferredTarget: 'weapon' | 'armor' =
        affix && (affix.category === 'offensive' || affix.category === 'trigger')
          ? 'weapon'
          : 'armor';

      const slot = findEmptySlot(occupiedSlots, preferredTarget, rng);
      if (!slot) continue;

      actions.push({
        kind: 'socket_gem',
        gemUid: gem.uid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedGemUids.add(gem.uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
    }

    return actions;
  }
}
