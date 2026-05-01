import type { AffixCategory } from '../../types/affix.js';
import type { BalanceConfig } from '../../types/balance.js';
import type { BaseStat } from '../../types/base-stats.js';
import type { ForgeAction } from '../../types/forge-action.js';
import type { Loadout } from '../../types/item.js';
import type { GemInstance } from '../../types/gem.js';
import { hasSecondarySlot } from '../../types/gem.js';
import type { DataRegistry } from '../../data/registry.js';
import type { SeededRNG } from '../../rng/seeded-rng.js';
// getActionCost available via flux-tracker if needed

import { orbValueScore, bestArchetype, archetypeMatch } from '../evaluation.js';
import { ARCHETYPE_TAGS } from '../../pool/archetype-validator.js';
import type { ArchetypeId } from '../../pool/archetype-validator.js';

/**
 * Forge strategy cost model — IMPORTANT to understand before changing budgets:
 *
 * - In RANKED mode, the engine charges flux for basic forge actions per
 *   `balance.fluxCosts` (assignOrb=1, combineOrbs=2, etc). The strategy's
 *   `fluxRemaining` parameter caps total spend.
 * - In RUN mode, the engine treats basic forge actions as FREE (handleForgeAction
 *   in match-controller.ts). Flux is only spent on meta-actions
 *   (boost_combine, reroll_pool, guarantee_rarity, transplant_gem chooseAffix
 *   — see balance.gem.flux.costs). Run-mode callers (e.g. simulation-runner.ts)
 *   pass an effectively unlimited budget for basic actions.
 *
 * The strategies below use `balance.fluxCosts` for planning regardless of mode.
 * That's intentional — under run mode the budget never binds, so the legacy
 * cost arithmetic is harmless. If you ever want to add meta-action planning
 * (boost/reroll/guarantee), gate that on real `runState.flux` (passed via a
 * new strategy parameter), not on `fluxRemaining`.
 */

/**
 * Enumerate transplant candidates: for every gem that has an open (empty)
 * secondary slot, pair it with every other gem in the stockpile as a source.
 * Scoring is left to the caller's existing action-selection logic.
 */
function enumerateTransplantCandidates(
  stockpile: GemInstance[],
  registry: DataRegistry,
): ForgeAction[] {
  const threshold = registry.getBalance().transplant.unlockThreshold;
  const hosts = stockpile.filter(g => hasSecondarySlot(g, threshold) && !g.secondary);
  const candidates: ForgeAction[] = [];
  for (const host of hosts) {
    for (const source of stockpile) {
      if (source.uid === host.uid) continue;
      candidates.push({
        kind: 'transplant_gem',
        targetGemUid: host.uid,
        sourceGemUid: source.uid,
      });
    }
  }
  return candidates;
}

/**
 * Return true when a signature/category combine between two gems would be
 * rejected at forge-state time because at least one of them has a filled
 * secondary slot. Generic upgrades (keepGemUid path) are unaffected.
 */
function signatureCombineBlockedBySecondary(
  gemA: GemInstance,
  gemB: GemInstance,
  registry: DataRegistry,
): boolean {
  // Only signature/category combines (those that produce a CompoundAffixDef
  // result) are gated by filled secondaries in Task 3.1.
  const combo = findCombinableSignature(gemA, gemB, registry);
  if (!combo) return false; // not a signature/category pair
  return !!(gemA.secondary || gemB.secondary);
}

/**
 * Find a valid signature combine for two gems. Recipe-aware — recognises
 * compound gems (`gem.sourceRecipe` set) as recipe-component inputs, which
 * `registry.getCombination` cannot do because it only matches on raw
 * `affixId` strings.
 *
 * Returns a tag list usable for archetype scoring. Falls back to the legacy
 * combinations.json lookup so behavior is at least no worse than before.
 */
export function findCombinableSignature(
  gemA: GemInstance,
  gemB: GemInstance,
  registry: DataRegistry,
): { id: string; tags: string[] } | null {
  const recipe = registry.getRecipeRegistry().findSignatureRecipe(gemA, gemB);
  if (recipe) return { id: recipe.id, tags: recipe.tags };
  const combo = registry.getCombination(gemA.affixId, gemB.affixId);
  if (combo) return { id: combo.id, tags: combo.tags };
  return null;
}

/**
 * Find a valid signature3 (capstone) combine for three gems. Recipe-aware
 * for the same reason as findCombinableSignature.
 */
export function findCombinable3(
  gemA: GemInstance,
  gemB: GemInstance,
  gemC: GemInstance,
  registry: DataRegistry,
): { id: string; tags: string[] } | null {
  const recipe = registry.getRecipeRegistry().findTernaryRecipe(gemA, gemB, gemC);
  if (recipe) return { id: recipe.id, tags: recipe.tags };
  const combo = registry.getTernaryCombination(gemA.affixId, gemB.affixId, gemC.affixId);
  if (combo) return { id: combo.id, tags: combo.tags };
  return null;
}

/**
 * Flatten all socketed gems across both weapon and armor slots into a single
 * array. Order: weapon slot 0..5, then armor slot 0..5.
 */
export function socketedGems(loadout: Loadout): GemInstance[] {
  const result: GemInstance[] = [];
  for (const slot of loadout.weapon.slots) {
    if (slot) result.push(slot.gem);
  }
  for (const slot of loadout.armor.slots) {
    if (slot) result.push(slot.gem);
  }
  return result;
}

/**
 * Find which slot a gem is currently socketed in (if any). Returns null if the
 * gem is not currently socketed.
 */
function findSocketLocation(
  uid: string,
  loadout: Loadout,
): { target: 'weapon' | 'armor'; slotIndex: number } | null {
  for (let i = 0; i < loadout.weapon.slots.length; i++) {
    if (loadout.weapon.slots[i]?.gem.uid === uid) return { target: 'weapon', slotIndex: i };
  }
  for (let i = 0; i < loadout.armor.slots.length; i++) {
    if (loadout.armor.slots[i]?.gem.uid === uid) return { target: 'armor', slotIndex: i };
  }
  return null;
}

/**
 * Count how many gems in the given list match the archetype's tag set.
 * Used by meta-action heuristics to assess stockpile-archetype fit.
 */
function archetypeFitCount(
  gems: GemInstance[],
  archetype: ArchetypeId,
  registry: DataRegistry,
): number {
  let count = 0;
  for (const gem of gems) {
    if (archetypeMatch(gem, archetype, registry)) count++;
  }
  return count;
}

/**
 * True when most of the stockpile is low-rarity (common/uncommon). Used as
 * a guarantee_rarity trigger heuristic.
 */
function stockpileIsRarityPoor(gems: GemInstance[]): boolean {
  if (gems.length < 3) return false; // not enough sample
  const lowRarityCount = gems.filter(
    g => g.rarity === 'common' || g.rarity === 'uncommon',
  ).length;
  return lowRarityCount / gems.length >= 0.7;
}

/**
 * Score how well an affix fits a host gem — used by transplant chooseAffix
 * heuristic. Returns the count of tag overlap between the affix's tags and
 * the host gem's tags. Higher = better fit.
 */
function scoreAffixForHost(
  affixId: string,
  hostGem: GemInstance,
  registry: DataRegistry,
): number {
  const affix = registry.findAffix(affixId);
  if (!affix) return 0;
  const hostTags = new Set(hostGem.tags ?? []);
  let score = 0;
  for (const tag of affix.tags ?? []) {
    if (hostTags.has(tag)) score++;
  }
  return score;
}

export interface ForgeStrategy {
  plan(
    stockpile: GemInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    opponentStockpile: GemInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
    runStateFlux?: number, // NEW — real run-mode flux for meta-actions
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
    stockpile: GemInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    _opponentStockpile: GemInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
    _runStateFlux?: number,
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

    // Socket gems into random empty slots up to flux budget
    const assignCost = balance.fluxCosts.assignOrb;
    let orbIdx = 0;
    let slotIdx = 0;

    while (orbIdx < stockpile.length && slotIdx < emptySlots.length && flux >= assignCost) {
      const slot = emptySlots[slotIdx];
      actions.push({
        kind: 'socket_gem',
        gemUid: stockpile[orbIdx].uid,
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
    stockpile: GemInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    _opponentStockpile: GemInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
    _runStateFlux?: number,
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
            gemUid1: stockpile[i].uid,
            gemUid2: stockpile[j].uid,
          });
          const compoundUid = `combined_${stockpile[i].uid}_${stockpile[j].uid}`;
          actions.push({
            kind: 'socket_gem',
            gemUid: compoundUid,
            target: slot.target,
            slotIndex: slot.slotIndex,
          });
          usedOrbUids.add(stockpile[i].uid);
          usedOrbUids.add(stockpile[j].uid);
          occupiedSlots[slot.target][slot.slotIndex] = true;
          occupiedSlots[slot.target][slot.slotIndex + 1] = true;
          flux -= combineCost + assignCostForCombine;
          break; // gem i is used, move to next i
        }
      }
    }

    // Try generic combines on leftover orbs
    const genericResult = tryGenericCombines(stockpile, usedOrbUids, flux, balance, registry);
    actions.push(...genericResult.actions);
    flux -= genericResult.fluxSpent;
    pushGenericResults(stockpile, genericResult.actions);

    // Socket remaining gems into empty slots
    const assignCost = balance.fluxCosts.assignOrb;
    for (const gem of stockpile) {
      if (usedOrbUids.has(gem.uid)) continue;
      if (flux < assignCost) break;

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
      usedOrbUids.add(gem.uid);
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
 * Try generic combines on leftover orbs: pair the highest-value orb
 * with the lowest-value orb, consume the low one, promote the high one +1 tier.
 */
function tryGenericCombines(
  stockpile: GemInstance[],
  usedOrbUids: Set<string>,
  flux: number,
  balance: BalanceConfig,
  registry: DataRegistry,
): { actions: ForgeAction[]; fluxSpent: number } {
  const actions: ForgeAction[] = [];
  let fluxSpent = 0;
  const combineCost = balance.fluxCosts.combineOrbs;
  const remaining = stockpile
    .filter(o => !usedOrbUids.has(o.uid))
    .sort((a, b) => orbValueScore(b, registry) - orbValueScore(a, registry));
  if (remaining.length < 2) return { actions, fluxSpent };
  let left = 0;
  let right = remaining.length - 1;
  while (left < right && (flux - fluxSpent) >= combineCost) {
    const keepOrb = remaining[left];
    const sacrificeOrb = remaining[right];
    if (keepOrb.tier >= 4) { left++; continue; }
    actions.push({
      kind: 'combine',
      gemUid1: keepOrb.uid,
      gemUid2: sacrificeOrb.uid,
      keepGemUid: keepOrb.uid,
    });
    usedOrbUids.add(keepOrb.uid);
    usedOrbUids.add(sacrificeOrb.uid);
    fluxSpent += combineCost;
    left++;
    right--;
  }
  return { actions, fluxSpent };
}

/**
 * Push synthetic upgraded gems into the stockpile so downstream assignment
 * can see the results of generic combines.
 */
function pushGenericResults(
  stockpile: GemInstance[],
  genericActions: ForgeAction[],
): void {
  for (const action of genericActions) {
    if (action.kind === 'combine' && action.keepGemUid) {
      const keptGem = stockpile.find(g => g.uid === action.keepGemUid);
      if (!keptGem) continue;
      const newTier = Math.min(keptGem.tier + 1, 5) as 1 | 2 | 3 | 4 | 5;
      stockpile.push({
        // Must match the uid forge-state/forge-plan will produce when applying
        // a generic combine — otherwise a downstream socket_gem planned for
        // this simulated output fails with "Gem not in stockpile".
        uid: `combined_${action.gemUid1}_${action.gemUid2}`,
        affixId: keptGem.affixId,
        tier: newTier,
        rarity: keptGem.rarity ?? 'common',
        recipeDepth: (keptGem.recipeDepth ?? 0) + 1,
        combinable: newTier < 5,
        // keptGem.tags may be absent on test stubs built before the rarity/tags fields were required
        tags: keptGem.tags ? [...keptGem.tags] : [keptGem.affixId],
      });
    }
  }
}

/**
 * Tier 3 (Artisan) Forge Strategy:
 * Sensible combinations. Balanced offense/defense split between weapon and armor.
 * Tries combinations first, then assigns remaining orbs with category awareness.
 */
export class Tier3ForgeStrategy implements ForgeStrategy {
  plan(
    stockpile: GemInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    _opponentStockpile: GemInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
    _runStateFlux?: number,
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

    // T3 deliberately does NOT enumerate combines against socketed gems —
    // missing those is part of what defines a T3 player's skill ceiling.
    // Compare to T4/T5 which do.

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
          gemUid1: sortedStockpile[i].uid,
          gemUid2: sortedStockpile[j].uid,
        });
        const compoundUid = `combined_${sortedStockpile[i].uid}_${sortedStockpile[j].uid}`;
        actions.push({
          kind: 'socket_gem',
          gemUid: compoundUid,
          target: slot.target,
          slotIndex: slot.slotIndex,
        });
        usedOrbUids.add(sortedStockpile[i].uid);
        usedOrbUids.add(sortedStockpile[j].uid);
        occupiedSlots[slot.target][slot.slotIndex] = true;
        occupiedSlots[slot.target][slot.slotIndex + 1] = true;
        flux -= combineCost + assignCostForCombine;
        break; // gem i is consumed, move to next i
      }
    }

    // Try upgrades (same affix, different gems) — upgrade_tier is retired; use combine with keepGemUid
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

        // Emit a generic combine (keepGemUid = higher-tier gem); socket_gem follows in pushGenericResults
        actions.push({
          kind: 'combine',
          gemUid1: sortedStockpile[i].uid,
          gemUid2: sortedStockpile[j].uid,
          keepGemUid: sortedStockpile[i].uid,
        });
        usedOrbUids.add(sortedStockpile[i].uid);
        usedOrbUids.add(sortedStockpile[j].uid);
        occupiedSlots[slot.target][slot.slotIndex] = true;
        flux -= upgradeCost;
        break; // gem i is consumed, move to next i
      }
    }

    // Try generic combines on leftover gems
    const genericResult = tryGenericCombines(stockpile, usedOrbUids, flux, balance, registry);
    actions.push(...genericResult.actions);
    flux -= genericResult.fluxSpent;
    pushGenericResults(stockpile, genericResult.actions);

    // Socket remaining gems with balanced weapon/armor split
    const assignCost = balance.fluxCosts.assignOrb;
    for (const gem of sortedStockpile) {
      if (usedOrbUids.has(gem.uid)) continue;
      if (flux < assignCost) break;

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
      usedOrbUids.add(gem.uid);
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
    stockpile: GemInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    _opponentStockpile: GemInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
    runStateFlux?: number,
  ): ForgeAction[] {
    const actions: ForgeAction[] = [];
    const balance = registry.getBalance();
    let flux = fluxRemaining;

    // Compute archetype once — used for base stats (round 1) and meta-action
    // heuristics (all rounds).
    const arch = bestArchetype(stockpile, registry);

    // Set base stats in round 1 based on archetype
    if (round === 1) {
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

    // Build unified candidate pool: stockpile + currently-socketed gems.
    // T4 can recognize already-socketed gems as binary combine partners,
    // unsocketing them first before applying the combine.
    // (T4 does NOT enumerate capstones — that's T5-exclusive behaviour.)
    const socketed = socketedGems(loadout);
    const candidates = [...stockpile, ...socketed];

    // Find ALL valid binary combinations across the unified pool, score them,
    // and pick the best ones.
    const combineCost = balance.fluxCosts.combineOrbs;
    interface ComboPlan {
      i: number;
      j: number;
      score: number;
    }
    const comboCandidates: ComboPlan[] = [];

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const combo = registry.getCombination(candidates[i].affixId, candidates[j].affixId);
        if (!combo) continue;
        // Skip signature/category combines when either input has a filled secondary
        // (the forge action would reject at apply-time per Task 3.1)
        if (signatureCombineBlockedBySecondary(candidates[i], candidates[j], registry)) continue;
        // Score based on component values + combo tags
        const score = orbValueScore(candidates[i], registry) + orbValueScore(candidates[j], registry);
        comboCandidates.push({ i, j, score });
      }
    }

    // Sort by score descending
    comboCandidates.sort((a, b) => b.score - a.score);

    // Meta-action planning: boost_combine for the top-ranked binary combo.
    // T4 doesn't enumerate capstones, so we boost the best binary combo instead.
    // Must be placed BEFORE the combine it boosts — the engine pairs boost with
    // the next combine action dispatched.
    const boostCost = registry.getBalance().gem.flux.costs.boostCombine ?? 3;
    const flux0 = runStateFlux ?? 0;
    if (flux0 >= boostCost && comboCandidates.length > 0) {
      actions.push({ kind: 'boost_combine' });
    }

    // reroll_pool meta-action: heuristic — reroll when current stockpile is
    // archetype-poor (fewer than 2 matching gems) AND we haven't already spent
    // flux this round AND we have ≥5 flux.
    const rerollCost = registry.getBalance().gem.flux.costs.rerollPool ?? 5;
    const alreadyPlannedFluxSpend = actions.some(a => a.kind === 'boost_combine');
    if (
      flux0 >= rerollCost &&
      !alreadyPlannedFluxSpend &&
      archetypeFitCount(stockpile, arch, registry) < 2
    ) {
      actions.push({ kind: 'reroll_pool' });
    }

    // guarantee_rarity meta-action: heuristic — guarantee when stockpile is
    // rarity-poor (3+ gems and most are common/uncommon) AND we haven't
    // already planned any meta this round AND we have ≥4 flux.
    const guaranteeCost = registry.getBalance().gem.flux.costs.guaranteeRarity ?? 4;
    const alreadyPlannedAnyMeta = actions.some(a =>
      a.kind === 'boost_combine' || a.kind === 'reroll_pool',
    );
    if (
      (runStateFlux ?? 0) >= guaranteeCost &&
      !alreadyPlannedAnyMeta &&
      stockpileIsRarityPoor(stockpile)
    ) {
      actions.push({ kind: 'guarantee_rarity' });
    }

    // Apply the best non-conflicting combinations
    const assignCostForCombine = balance.fluxCosts.assignOrb;
    for (const cand of comboCandidates) {
      if (flux < combineCost + assignCostForCombine) break;
      const g1 = candidates[cand.i], g2 = candidates[cand.j];
      if (usedOrbUids.has(g1.uid) || usedOrbUids.has(g2.uid)) continue;

      // Unsocket any of the two that are currently socketed, freeing their slots
      for (const g of [g1, g2]) {
        const loc = findSocketLocation(g.uid, loadout);
        if (loc) {
          actions.push({ kind: 'unsocket_gem', target: loc.target, slotIndex: loc.slotIndex });
          occupiedSlots[loc.target][loc.slotIndex] = false;
        }
      }

      const slot = findConsecutiveEmptySlotsOn(occupiedSlots, 'weapon');
      if (!slot) break;

      actions.push({
        kind: 'combine',
        gemUid1: g1.uid,
        gemUid2: g2.uid,
      });
      const compoundUid = `combined_${g1.uid}_${g2.uid}`;
      actions.push({
        kind: 'socket_gem',
        gemUid: compoundUid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedOrbUids.add(g1.uid);
      usedOrbUids.add(g2.uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      occupiedSlots[slot.target][slot.slotIndex + 1] = true;
      flux -= combineCost + assignCostForCombine;
    }

    // Try upgrades (same affix) — upgrade_tier is retired; use combine with keepGemUid
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

      // Generic upgrade: emit combine with keepGemUid (the higher-tier input gem is kept)
      actions.push({
        kind: 'combine',
        gemUid1: stockpile[cand.i].uid,
        gemUid2: stockpile[cand.j].uid,
        keepGemUid: stockpile[cand.i].uid,
      });
      usedOrbUids.add(stockpile[cand.i].uid);
      usedOrbUids.add(stockpile[cand.j].uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      flux -= upgradeCost;
    }

    // Transplant: evaluate before generic combines so the source gem is reserved
    // and not consumed by the generic combine phase.
    // Only consider original stockpile gems (not synthetic combine outputs).
    const transplants = enumerateTransplantCandidates(stockpile, registry);
    if (transplants.length > 0) {
      const transplantCandidate = transplants.find(
        t =>
          t.kind === 'transplant_gem' &&
          !usedOrbUids.has(t.sourceGemUid),
      );
      if (transplantCandidate && transplantCandidate.kind === 'transplant_gem') {
        // chooseAffix upgrade: if source's secondary affix fits the host better
        // than the primary, spend flux to lock it in. Cost is transplantChooseAffix (3).
        let bestTransplant: Extract<ForgeAction, { kind: 'transplant_gem' }> = transplantCandidate;
        const chooseAffixCost = (registry.getBalance().gem.flux.costs as Record<string, number>).transplantChooseAffix ?? 3;
        const sourceGem = stockpile.find(g => g.uid === transplantCandidate.sourceGemUid);
        const hostGem = stockpile.find(g => g.uid === transplantCandidate.targetGemUid);
        if (
          sourceGem?.secondary &&
          hostGem &&
          (runStateFlux ?? 0) >= chooseAffixCost
        ) {
          const primaryScore = scoreAffixForHost(sourceGem.affixId, hostGem, registry);
          const secondaryScore = scoreAffixForHost(sourceGem.secondary.affixId, hostGem, registry);
          if (secondaryScore > primaryScore) {
            bestTransplant = { ...transplantCandidate, chosenAffix: 'secondary' };
          }
        }
        actions.push(bestTransplant);
        // Reserve the source so subsequent phases don't also consume it.
        usedOrbUids.add(bestTransplant.sourceGemUid);
      }
    }

    // Try generic combines on leftover gems
    const genericResult = tryGenericCombines(stockpile, usedOrbUids, flux, balance, registry);
    actions.push(...genericResult.actions);
    flux -= genericResult.fluxSpent;
    pushGenericResults(stockpile, genericResult.actions);

    // Socket remaining gems sorted by value
    const assignCost = balance.fluxCosts.assignOrb;
    const remaining = stockpile
      .filter((o) => !usedOrbUids.has(o.uid))
      .sort((a, b) => orbValueScore(b, registry) - orbValueScore(a, registry));

    for (const gem of remaining) {
      if (flux < assignCost) break;

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
      usedOrbUids.add(gem.uid);
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
    stockpile: GemInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    opponentStockpile: GemInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
    runStateFlux?: number,
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

    // Build unified candidate pool: stockpile + currently-socketed gems.
    // T5 can recognize already-socketed gems as combine partners, unsocketing
    // them first before applying the combine.
    const socketed = socketedGems(loadout);
    const candidates = [...stockpile, ...socketed];

    // Exhaustive combination search: find ALL valid combo pairs
    const combineCost = balance.fluxCosts.combineOrbs;
    interface ComboPlan {
      idx1: number;
      idx2: number;
      score: number;
      comboId: string;
    }
    const allCombos: ComboPlan[] = [];

    // Archetype is computed from stockpile only (socketed gems already committed)
    const arch = bestArchetype(stockpile, registry);
    const archTags = ARCHETYPE_TAGS[arch];

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        // Recipe-aware so compound gems (e.g. ignite) can combine back into
        // higher-tier capstones if a signature recipe references them.
        const combo = findCombinableSignature(candidates[i], candidates[j], registry);
        if (!combo) continue;

        // Skip signature/category combines when either input has a filled secondary
        // (the forge action would reject at apply-time per Task 3.1)
        if (signatureCombineBlockedBySecondary(candidates[i], candidates[j], registry)) continue;

        // Score: component value + synergy with rest of stockpile
        let score = orbValueScore(candidates[i], registry) + orbValueScore(candidates[j], registry);

        // Bonus for combo tags that match our archetype
        for (const tag of combo.tags) {
          if (archTags.includes(tag)) score += 5;
        }

        allCombos.push({ idx1: i, idx2: j, score, comboId: combo.id });
      }
    }

    // Sort by score descending
    allCombos.sort((a, b) => b.score - a.score);

    // Capstone (signature3) search: enumerate triples and rank by archetype fit.
    // Tier 5 prioritizes capstones over binary combines because they're the
    // strongest endgame artifacts. We score-rank capstones, take the best
    // available non-conflicting ones first, then fall through to binary
    // combines below.
    interface Combo3Plan {
      idx1: number;
      idx2: number;
      idx3: number;
      score: number;
      comboId: string;
    }
    const allCombos3: Combo3Plan[] = [];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        for (let k = j + 1; k < candidates.length; k++) {
          const combo3 = findCombinable3(candidates[i], candidates[j], candidates[k], registry);
          if (!combo3) continue;
          if (
            candidates[i].secondary || candidates[j].secondary || candidates[k].secondary
          ) continue;
          let score = orbValueScore(candidates[i], registry)
            + orbValueScore(candidates[j], registry)
            + orbValueScore(candidates[k], registry);
          for (const tag of combo3.tags) {
            if (archTags.includes(tag)) score += 8;
          }
          // Capstones are inherently more valuable than binary combos —
          // bias the score so they're preferred when they fit the archetype.
          score += 6;
          allCombos3.push({ idx1: i, idx2: j, idx3: k, score, comboId: combo3.id });
        }
      }
    }
    allCombos3.sort((a, b) => b.score - a.score);

    // Meta-action planning: boost_combine for the top-ranked capstone.
    // Strategy: only boost when (a) we have ≥ boostCombine flux, (b) there IS
    // a capstone available (allCombos3.length > 0), (c) one boost per round.
    // The boost_combine action must appear BEFORE the combine it boosts — the
    // engine pairs it with the next combine action dispatched.
    //
    // reroll_pool deferred — it's planned in forge but affects the NEXT draft's
    // pool generation. The forge strategy doesn't have draft-pool quality
    // visibility, so meaningful reroll planning needs a coordinator that can
    // see across phases. Future work.
    //
    // guarantee_rarity deferred for the same reason as reroll_pool — meaningful
    // planning needs draft-phase context not available in forge strategy.
    const boostCost = registry.getBalance().gem.flux.costs.boostCombine ?? 3;
    const flux0 = runStateFlux ?? 0;
    if (flux0 >= boostCost && allCombos3.length > 0) {
      actions.push({ kind: 'boost_combine' });
    }

    // reroll_pool meta-action: heuristic — reroll when current stockpile is
    // archetype-poor (fewer than 2 matching gems) AND we haven't already spent
    // flux this round AND we have ≥5 flux. Reroll affects the NEXT draft, so
    // its value is highest mid-run when the build is committed but the pool is
    // thin for our archetype.
    const rerollCost = registry.getBalance().gem.flux.costs.rerollPool ?? 5;
    const alreadyPlannedFluxSpend = actions.some(a => a.kind === 'boost_combine');
    if (
      flux0 >= rerollCost &&
      !alreadyPlannedFluxSpend &&
      archetypeFitCount(stockpile, arch, registry) < 2
    ) {
      actions.push({ kind: 'reroll_pool' });
    }

    // guarantee_rarity meta-action: heuristic — guarantee when stockpile is
    // rarity-poor (3+ gems and most are common/uncommon) AND we haven't
    // already planned any meta this round AND we have ≥4 flux.
    const guaranteeCost = registry.getBalance().gem.flux.costs.guaranteeRarity ?? 4;
    const alreadyPlannedAnyMeta = actions.some(a =>
      a.kind === 'boost_combine' || a.kind === 'reroll_pool',
    );
    if (
      (runStateFlux ?? 0) >= guaranteeCost &&
      !alreadyPlannedAnyMeta &&
      stockpileIsRarityPoor(stockpile)
    ) {
      actions.push({ kind: 'guarantee_rarity' });
    }

    // Greedily select non-conflicting capstones first
    const assignCostForCombine = balance.fluxCosts.assignOrb;
    for (const cand of allCombos3) {
      if (flux < combineCost + assignCostForCombine) break;
      const g1 = candidates[cand.idx1], g2 = candidates[cand.idx2], g3 = candidates[cand.idx3];
      if (
        usedOrbUids.has(g1.uid)
        || usedOrbUids.has(g2.uid)
        || usedOrbUids.has(g3.uid)
      ) continue;

      // Unsocket any of the three that are currently socketed, freeing their slots
      for (const g of [g1, g2, g3]) {
        const loc = findSocketLocation(g.uid, loadout);
        if (loc) {
          actions.push({ kind: 'unsocket_gem', target: loc.target, slotIndex: loc.slotIndex });
          occupiedSlots[loc.target][loc.slotIndex] = false;
        }
      }

      const slot = findConsecutiveEmptySlotsOn(occupiedSlots, 'weapon');
      if (!slot) break;

      actions.push({
        kind: 'combine3',
        gemUid1: g1.uid,
        gemUid2: g2.uid,
        gemUid3: g3.uid,
      });
      const capstoneUid = `combined3_${g1.uid}_${g2.uid}_${g3.uid}`;
      actions.push({
        kind: 'socket_gem',
        gemUid: capstoneUid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedOrbUids.add(g1.uid);
      usedOrbUids.add(g2.uid);
      usedOrbUids.add(g3.uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      occupiedSlots[slot.target][slot.slotIndex + 1] = true;
      flux -= combineCost + assignCostForCombine;
    }

    // Greedily select non-conflicting binary combinations (after capstones)
    for (const cand of allCombos) {
      if (flux < combineCost + assignCostForCombine) break;
      const g1 = candidates[cand.idx1], g2 = candidates[cand.idx2];
      if (usedOrbUids.has(g1.uid) || usedOrbUids.has(g2.uid)) continue;

      // Unsocket any of the two that are currently socketed, freeing their slots
      for (const g of [g1, g2]) {
        const loc = findSocketLocation(g.uid, loadout);
        if (loc) {
          actions.push({ kind: 'unsocket_gem', target: loc.target, slotIndex: loc.slotIndex });
          occupiedSlots[loc.target][loc.slotIndex] = false;
        }
      }

      const slot = findConsecutiveEmptySlotsOn(occupiedSlots, 'weapon');
      if (!slot) break;

      actions.push({
        kind: 'combine',
        gemUid1: g1.uid,
        gemUid2: g2.uid,
      });
      const compoundUid = `combined_${g1.uid}_${g2.uid}`;
      actions.push({
        kind: 'socket_gem',
        gemUid: compoundUid,
        target: slot.target,
        slotIndex: slot.slotIndex,
      });
      usedOrbUids.add(g1.uid);
      usedOrbUids.add(g2.uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      occupiedSlots[slot.target][slot.slotIndex + 1] = true;
      flux -= combineCost + assignCostForCombine;
    }

    // Try upgrades (highest value pairs first) — upgrade_tier is retired; use combine with keepGemUid
    const upgradeCost = balance.fluxCosts.upgradeTier;
    const upgradeCandidates: { i: number; j: number; score: number }[] = [];
    for (let i = 0; i < stockpile.length; i++) {
      if (usedOrbUids.has(stockpile[i].uid)) continue;
      if (stockpile[i].tier >= 4) continue;
      for (let j = i + 1; j < stockpile.length; j++) {
        if (usedOrbUids.has(stockpile[j].uid)) continue;
        if (stockpile[j].tier >= 4) continue;
        if (stockpile[i].affixId !== stockpile[j].affixId) continue;
        // Score reflects the promoted tier value
        const upgradedScore = orbValueScore({ ...stockpile[i], tier: Math.min(stockpile[i].tier + 1, 5) as 1 | 2 | 3 | 4 | 5 }, registry);
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

      // Generic upgrade: emit combine with keepGemUid
      actions.push({
        kind: 'combine',
        gemUid1: stockpile[cand.i].uid,
        gemUid2: stockpile[cand.j].uid,
        keepGemUid: stockpile[cand.i].uid,
      });
      usedOrbUids.add(stockpile[cand.i].uid);
      usedOrbUids.add(stockpile[cand.j].uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      flux -= upgradeCost;
    }

    // Transplant: evaluate before generic combines so the source gem is reserved
    // and not consumed by the generic combine phase.
    const transplants = enumerateTransplantCandidates(stockpile, registry);
    if (transplants.length > 0) {
      const transplantCandidate = transplants.find(
        t =>
          t.kind === 'transplant_gem' &&
          !usedOrbUids.has(t.sourceGemUid),
      );
      if (transplantCandidate && transplantCandidate.kind === 'transplant_gem') {
        // chooseAffix upgrade: if source's secondary affix fits the host better
        // than the primary, spend flux to lock it in. Cost is transplantChooseAffix (3).
        let bestTransplant: Extract<ForgeAction, { kind: 'transplant_gem' }> = transplantCandidate;
        const chooseAffixCost = (registry.getBalance().gem.flux.costs as Record<string, number>).transplantChooseAffix ?? 3;
        const sourceGem = stockpile.find(g => g.uid === transplantCandidate.sourceGemUid);
        const hostGem = stockpile.find(g => g.uid === transplantCandidate.targetGemUid);
        if (
          sourceGem?.secondary &&
          hostGem &&
          (runStateFlux ?? 0) >= chooseAffixCost
        ) {
          const primaryScore = scoreAffixForHost(sourceGem.affixId, hostGem, registry);
          const secondaryScore = scoreAffixForHost(sourceGem.secondary.affixId, hostGem, registry);
          if (secondaryScore > primaryScore) {
            bestTransplant = { ...transplantCandidate, chosenAffix: 'secondary' };
          }
        }
        actions.push(bestTransplant);
        // Reserve the source so subsequent phases don't also consume it.
        usedOrbUids.add(bestTransplant.sourceGemUid);
      }
    }

    // Try generic combines on leftover gems
    const genericResult = tryGenericCombines(stockpile, usedOrbUids, flux, balance, registry);
    actions.push(...genericResult.actions);
    flux -= genericResult.fluxSpent;
    pushGenericResults(stockpile, genericResult.actions);

    // Socket remaining gems sorted by value, placing highest value first
    const assignCost = balance.fluxCosts.assignOrb;
    const remaining = stockpile
      .filter((o) => !usedOrbUids.has(o.uid))
      .sort((a, b) => orbValueScore(b, registry) - orbValueScore(a, registry));

    for (const gem of remaining) {
      if (flux < assignCost) break;

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
      usedOrbUids.add(gem.uid);
      occupiedSlots[slot.target][slot.slotIndex] = true;
      flux -= assignCost;
    }

    return actions;
  }
}
