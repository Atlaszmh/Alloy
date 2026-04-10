import type { AffixTier } from '../types/affix.js';
import type { CombatLog } from '../types/combat.js';
import type { DataRegistry } from '../data/registry.js';
import { ARCHETYPE_TAGS } from '../pool/archetype-validator.js';
import type { ArchetypeId } from '../pool/archetype-validator.js';

/**
 * Minimal orb/gem shape needed for evaluation functions.
 * Works with both OrbInstance and GemInstance.
 */
interface EvalUnit {
  uid: string;
  affixId: string;
  tier: number;
}

/**
 * Tier value multipliers for scoring orbs/gems.
 * Higher tier units are disproportionately more valuable.
 */
const TIER_VALUES: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
  5: 8,
};

/**
 * Score an individual orb/gem based on its tier and the average value range of the affix.
 */
export function orbValueScore(unit: EvalUnit, registry: DataRegistry): number {
  const affix = registry.findAffix(unit.affixId);
  if (!affix) return 0;

  // Clamp tier to valid AffixTier range for data lookup
  const lookupTier = Math.min(unit.tier, 4) as AffixTier;
  const tierData = affix.tiers[lookupTier];
  const baseValue = (tierData.valueRange[0] + tierData.valueRange[1]) / 2;
  return (TIER_VALUES[unit.tier] ?? TIER_VALUES[4]) * baseValue;
}

/**
 * Check whether a unit's affix tags overlap with a given archetype's tags.
 */
export function archetypeMatch(
  unit: EvalUnit,
  archetype: ArchetypeId,
  registry: DataRegistry,
): boolean {
  const affix = registry.findAffix(unit.affixId);
  if (!affix) return false;

  const archetypeTags = ARCHETYPE_TAGS[archetype];
  const unitTags = new Set(affix.tags);
  return archetypeTags.some((t) => unitTags.has(t));
}

/**
 * Measure how focused a stockpile is on a single archetype.
 * Returns a value from 0 to 1 where 1 means all units match one archetype.
 */
export function buildCoherence(stockpile: EvalUnit[], registry: DataRegistry): number {
  if (stockpile.length === 0) return 0;

  const archetypes = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];
  let maxMatch = 0;

  for (const arch of archetypes) {
    let matchCount = 0;
    for (const unit of stockpile) {
      if (archetypeMatch(unit, arch, registry)) {
        matchCount++;
      }
    }
    if (matchCount > maxMatch) {
      maxMatch = matchCount;
    }
  }

  return maxMatch / stockpile.length;
}

/**
 * Count how many valid pairwise combinations could be formed from the stockpile.
 */
export function combinationPotential(stockpile: EvalUnit[], registry: DataRegistry): number {
  let count = 0;
  for (let i = 0; i < stockpile.length; i++) {
    for (let j = i + 1; j < stockpile.length; j++) {
      const combo = registry.getCombination(stockpile[i].affixId, stockpile[j].affixId);
      if (combo) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Compute the denial value of taking a particular unit: how much does it
 * hurt the opponent? Checks whether the unit enables combinations in
 * the opponent's stockpile.
 */
export function denialValue(
  unit: EvalUnit,
  opponentStockpile: EvalUnit[],
  registry: DataRegistry,
): number {
  let value = 0;
  const tierVal = TIER_VALUES[unit.tier] ?? TIER_VALUES[4];
  // Check if this unit forms a combination with any of the opponent's units
  for (const oppUnit of opponentStockpile) {
    const combo = registry.getCombination(unit.affixId, oppUnit.affixId);
    if (combo) {
      value += tierVal * 3; // Combinations are high-value
    }
  }
  // Check if opponent has matching affixes (denying upgrade potential)
  for (const oppUnit of opponentStockpile) {
    if (oppUnit.affixId === unit.affixId) {
      value += tierVal * 2;
    }
  }
  // Also add base unit value as denial (denying a good unit is worth something)
  value += orbValueScore(unit, registry) * 0.3;
  return value;
}

/**
 * Score a unit's synergy potential with an existing stockpile.
 * Checks how many archetypes it reinforces and how many combinations it enables.
 */
export function synergyPotential(
  unit: EvalUnit,
  myStockpile: EvalUnit[],
  registry: DataRegistry,
): number {
  let score = 0;
  const tierVal = TIER_VALUES[unit.tier] ?? TIER_VALUES[4];

  // Check combination potential with existing stockpile
  for (const existing of myStockpile) {
    const combo = registry.getCombination(unit.affixId, existing.affixId);
    if (combo) {
      score += tierVal * 4; // Combinations are very valuable
    }
  }

  // Check upgrade potential (same affix)
  for (const existing of myStockpile) {
    if (existing.affixId === unit.affixId && unit.tier < 4) {
      score += tierVal * 2;
    }
  }

  // Check archetype coherence bonus
  const archetypes = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];
  const unitAffix = registry.findAffix(unit.affixId);
  if (unitAffix) {
    const unitTags = new Set(unitAffix.tags);
    for (const arch of archetypes) {
      const archTags = ARCHETYPE_TAGS[arch];
      if (!archTags.some((t) => unitTags.has(t))) continue;
      // Count how many existing units match this archetype
      let matchCount = 0;
      for (const existing of myStockpile) {
        if (archetypeMatch(existing, arch, registry)) matchCount++;
      }
      score += matchCount * 0.5; // Reinforce existing archetypes
    }
  }

  return score;
}

/**
 * Compute a counter-value score for a unit based on damage patterns
 * observed in a combat log. Higher score means the unit better counters
 * the opponent's damage.
 */
export function counterValue(
  unit: EvalUnit,
  damageProfile: DamageProfile,
  registry: DataRegistry,
): number {
  const affix = registry.findAffix(unit.affixId);
  if (!affix) return 0;

  let score = 0;
  const tags = new Set(affix.tags);
  const tierVal = TIER_VALUES[unit.tier] ?? TIER_VALUES[4];

  // If opponent deals lots of physical damage, defensive/physical tags help
  if (damageProfile.physical > 0.3) {
    if (tags.has('defensive') || tags.has('block') || tags.has('physical')) {
      score += damageProfile.physical * tierVal * 5;
    }
  }

  // Check elemental damage patterns
  for (const [element, fraction] of Object.entries(damageProfile.elemental)) {
    if (fraction > 0.1 && tags.has(element)) {
      // Units with the same element tag on armor give resistance
      score += fraction * tierVal * 5;
    }
  }

  // Evasion/dodge counters everything
  if (tags.has('evasion') || tags.has('barrier')) {
    const totalDamage = damageProfile.physical +
      Object.values(damageProfile.elemental).reduce((s, v) => s + v, 0);
    score += totalDamage * tierVal * 2;
  }

  return score;
}

/**
 * Damage profile extracted from a combat log, representing what fraction
 * of total damage came from each source.
 */
export interface DamageProfile {
  physical: number; // 0-1 fraction
  elemental: Record<string, number>; // element -> 0-1 fraction
  totalDamage: number;
}

/**
 * Analyze a combat log to extract a damage profile for a given attacker.
 */
export function extractDamageProfile(
  log: CombatLog,
  attackerPlayer: 0 | 1,
): DamageProfile {
  let physical = 0;
  const elemental: Record<string, number> = {};
  let total = 0;

  for (const frame of log.frames) {
    for (const event of frame.events) {
      if (event.type === 'attack' && event.attacker === attackerPlayer) {
        const bd = event.breakdown;
        total += bd.totalNet;
        physical += bd.physical.net;
        for (const [elem, elemBd] of Object.entries(bd.elemental)) {
          if (elemBd) {
            elemental[elem] = (elemental[elem] ?? 0) + elemBd.net;
          }
        }
      }
      if (event.type === 'dot_tick' && event.target !== attackerPlayer) {
        // DOT damage dealt by attacker
        const bd = event.breakdown;
        total += bd.netDamage;
        elemental[bd.element] = (elemental[bd.element] ?? 0) + bd.netDamage;
      }
    }
  }

  // Normalize to fractions
  if (total > 0) {
    physical /= total;
    for (const key of Object.keys(elemental)) {
      elemental[key] /= total;
    }
  }

  return { physical, elemental, totalDamage: total };
}

/**
 * Find the best archetype for a stockpile (most matching units).
 */
export function bestArchetype(
  stockpile: EvalUnit[],
  registry: DataRegistry,
): ArchetypeId {
  const archetypes = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];
  let bestArch: ArchetypeId = archetypes[0];
  let bestCount = 0;

  for (const arch of archetypes) {
    let count = 0;
    for (const unit of stockpile) {
      if (archetypeMatch(unit, arch, registry)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestArch = arch;
    }
  }

  return bestArch;
}
