import type { AffixTier } from '../types/affix.js';
import type { CombatLog } from '../types/combat.js';
import type { OrbInstance } from '../types/orb.js';
import type { DataRegistry } from '../data/registry.js';
import { ARCHETYPE_TAGS } from '../pool/archetype-validator.js';
import type { ArchetypeId } from '../pool/archetype-validator.js';

/**
 * Tier value multipliers for scoring orbs.
 * Higher tier orbs are disproportionately more valuable.
 */
const TIER_VALUES: Record<AffixTier, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
};

/**
 * Score an individual orb based on its tier and the average value range of the affix.
 */
export function orbValueScore(orb: OrbInstance, registry: DataRegistry): number {
  const affix = registry.findAffix(orb.affixId);
  if (!affix) return 0;

  const tierData = affix.tiers[orb.tier];
  const baseValue = (tierData.valueRange[0] + tierData.valueRange[1]) / 2;
  return TIER_VALUES[orb.tier] * baseValue;
}

/**
 * Check whether an orb's affix tags overlap with a given archetype's tags.
 */
export function archetypeMatch(
  orb: OrbInstance,
  archetype: ArchetypeId,
  registry: DataRegistry,
): boolean {
  const affix = registry.findAffix(orb.affixId);
  if (!affix) return false;

  const archetypeTags = ARCHETYPE_TAGS[archetype];
  const orbTags = new Set(affix.tags);
  return archetypeTags.some((t) => orbTags.has(t));
}

/**
 * Measure how focused a stockpile is on a single archetype.
 * Returns a value from 0 to 1 where 1 means all orbs match one archetype.
 */
export function buildCoherence(stockpile: OrbInstance[], registry: DataRegistry): number {
  if (stockpile.length === 0) return 0;

  const archetypes = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];
  let maxMatch = 0;

  for (const arch of archetypes) {
    let matchCount = 0;
    for (const orb of stockpile) {
      if (archetypeMatch(orb, arch, registry)) {
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
export function combinationPotential(stockpile: OrbInstance[], registry: DataRegistry): number {
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
 * Compute the denial value of taking a particular orb: how much does it
 * hurt the opponent? Checks whether the orb enables combinations in
 * the opponent's stockpile.
 */
export function denialValue(
  orb: OrbInstance,
  opponentStockpile: OrbInstance[],
  registry: DataRegistry,
): number {
  let value = 0;
  // Check if this orb forms a combination with any of the opponent's orbs
  for (const oppOrb of opponentStockpile) {
    const combo = registry.getCombination(orb.affixId, oppOrb.affixId);
    if (combo) {
      value += TIER_VALUES[orb.tier] * 3; // Combinations are high-value
    }
  }
  // Check if opponent has matching affixes (denying upgrade potential)
  for (const oppOrb of opponentStockpile) {
    if (oppOrb.affixId === orb.affixId) {
      value += TIER_VALUES[orb.tier] * 2;
    }
  }
  // Also add base orb value as denial (denying a good orb is worth something)
  value += orbValueScore(orb, registry) * 0.3;
  return value;
}

/**
 * Score an orb's synergy potential with an existing stockpile.
 * Checks how many archetypes it reinforces and how many combinations it enables.
 */
export function synergyPotential(
  orb: OrbInstance,
  myStockpile: OrbInstance[],
  registry: DataRegistry,
): number {
  let score = 0;

  // Check combination potential with existing stockpile
  for (const existing of myStockpile) {
    const combo = registry.getCombination(orb.affixId, existing.affixId);
    if (combo) {
      score += TIER_VALUES[orb.tier] * 4; // Combinations are very valuable
    }
  }

  // Check upgrade potential (same affix)
  for (const existing of myStockpile) {
    if (existing.affixId === orb.affixId && orb.tier < 4) {
      score += TIER_VALUES[orb.tier] * 2;
    }
  }

  // Check archetype coherence bonus
  const archetypes = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];
  const orbAffix = registry.findAffix(orb.affixId);
  if (orbAffix) {
    const orbTags = new Set(orbAffix.tags);
    for (const arch of archetypes) {
      const archTags = ARCHETYPE_TAGS[arch];
      if (!archTags.some((t) => orbTags.has(t))) continue;
      // Count how many existing orbs match this archetype
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
 * Compute a counter-value score for an orb based on damage patterns
 * observed in a combat log. Higher score means the orb better counters
 * the opponent's damage.
 */
export function counterValue(
  orb: OrbInstance,
  damageProfile: DamageProfile,
  registry: DataRegistry,
): number {
  const affix = registry.findAffix(orb.affixId);
  if (!affix) return 0;

  let score = 0;
  const tags = new Set(affix.tags);

  // If opponent deals lots of physical damage, defensive/physical tags help
  if (damageProfile.physical > 0.3) {
    if (tags.has('defensive') || tags.has('block') || tags.has('physical')) {
      score += damageProfile.physical * TIER_VALUES[orb.tier] * 5;
    }
  }

  // Check elemental damage patterns
  for (const [element, fraction] of Object.entries(damageProfile.elemental)) {
    if (fraction > 0.1 && tags.has(element)) {
      // Orbs with the same element tag on armor give resistance
      score += fraction * TIER_VALUES[orb.tier] * 5;
    }
  }

  // Evasion/dodge counters everything
  if (tags.has('evasion') || tags.has('barrier')) {
    const totalDamage = damageProfile.physical +
      Object.values(damageProfile.elemental).reduce((s, v) => s + v, 0);
    score += totalDamage * TIER_VALUES[orb.tier] * 2;
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

  for (const tick of log.ticks) {
    for (const event of tick.events) {
      if (event.type === 'attack' && event.attacker === attackerPlayer) {
        total += event.damage;
        if (event.damageType === 'physical') {
          physical += event.damage;
        } else {
          elemental[event.damageType] = (elemental[event.damageType] ?? 0) + event.damage;
        }
      }
      if (event.type === 'dot_tick' && event.target !== attackerPlayer) {
        // DOT damage dealt by attacker
        total += event.damage;
        elemental[event.element] = (elemental[event.element] ?? 0) + event.damage;
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
 * Find the best archetype for a stockpile (most matching orbs).
 */
export function bestArchetype(
  stockpile: OrbInstance[],
  registry: DataRegistry,
): ArchetypeId {
  const archetypes = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];
  let bestArch: ArchetypeId = archetypes[0];
  let bestCount = 0;

  for (const arch of archetypes) {
    let count = 0;
    for (const orb of stockpile) {
      if (archetypeMatch(orb, arch, registry)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestArch = arch;
    }
  }

  return bestArch;
}
