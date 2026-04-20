import type { AffixTier } from '../types/affix.js';
import type { CombatLog } from '../types/combat.js';
import type { GemInstance } from '../types/gem.js';
import type { DataRegistry } from '../data/registry.js';
import { ARCHETYPE_TAGS } from '../pool/archetype-validator.js';
import type { ArchetypeId } from '../pool/archetype-validator.js';

/**
 * Tier value multipliers for scoring gems.
 * Higher tier gems are disproportionately more valuable.
 * Tier 5 combined gems bucket to T4 for affix-tier lookups (AffixTier max is 4).
 */
const TIER_VALUES: Record<AffixTier, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
};

/**
 * Clamp a gem tier to the AffixTier range (1–4).
 * Tier 5 combined gems use T4 affix effects.
 */
function clampTier(tier: number): AffixTier {
  return Math.min(tier, 4) as AffixTier;
}

/**
 * Score an individual gem based on its tier and the average value range of the affix.
 */
export function orbValueScore(gem: GemInstance, registry: DataRegistry): number {
  const affix = registry.findAffix(gem.affixId);
  if (!affix) return 0;

  const t = clampTier(gem.tier);
  const tierData = affix.tiers[t];
  const baseValue = (tierData.valueRange[0] + tierData.valueRange[1]) / 2;
  return TIER_VALUES[t] * baseValue;
}

/**
 * Check whether a gem's affix tags overlap with a given archetype's tags.
 */
export function archetypeMatch(
  gem: GemInstance,
  archetype: ArchetypeId,
  registry: DataRegistry,
): boolean {
  const affix = registry.findAffix(gem.affixId);
  if (!affix) return false;

  const archetypeTags = ARCHETYPE_TAGS[archetype];
  const gemTags = new Set(affix.tags);
  return archetypeTags.some((t) => gemTags.has(t));
}

/**
 * Measure how focused a stockpile is on a single archetype.
 * Returns a value from 0 to 1 where 1 means all gems match one archetype.
 */
export function buildCoherence(stockpile: GemInstance[], registry: DataRegistry): number {
  if (stockpile.length === 0) return 0;

  const archetypes = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];
  let maxMatch = 0;

  for (const arch of archetypes) {
    let matchCount = 0;
    for (const gem of stockpile) {
      if (archetypeMatch(gem, arch, registry)) {
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
export function combinationPotential(stockpile: GemInstance[], registry: DataRegistry): number {
  let score = 0;
  for (let i = 0; i < stockpile.length; i++) {
    for (let j = i + 1; j < stockpile.length; j++) {
      const ti = clampTier(stockpile[i].tier);
      const tj = clampTier(stockpile[j].tier);
      const combo = registry.getCombination(stockpile[i].affixId, stockpile[j].affixId);
      if (combo) {
        // Recipe match: highest value
        score += TIER_VALUES[ti] + TIER_VALUES[tj];
      } else if (stockpile[i].affixId === stockpile[j].affixId) {
        // Same affix generic upgrade: medium value
        score += (TIER_VALUES[ti] + TIER_VALUES[tj]) * 0.6;
      } else {
        // Cross-affix generic: low but nonzero value
        score += (TIER_VALUES[ti] + TIER_VALUES[tj]) * 0.2;
      }
    }
  }
  return score;
}

/**
 * Compute the denial value of taking a particular gem: how much does it
 * hurt the opponent? Checks whether the gem enables combinations in
 * the opponent's stockpile.
 */
export function denialValue(
  gem: GemInstance,
  opponentStockpile: GemInstance[],
  registry: DataRegistry,
): number {
  let value = 0;
  const t = clampTier(gem.tier);
  // Check if this gem forms a combination with any of the opponent's gems
  for (const oppGem of opponentStockpile) {
    const combo = registry.getCombination(gem.affixId, oppGem.affixId);
    if (combo) {
      value += TIER_VALUES[t] * 3; // Combinations are high-value
    }
  }
  // Check if opponent has matching affixes (denying upgrade potential)
  for (const oppGem of opponentStockpile) {
    if (oppGem.affixId === gem.affixId) {
      value += TIER_VALUES[t] * 2;
    }
  }
  // Also add base gem value as denial (denying a good gem is worth something)
  value += orbValueScore(gem, registry) * 0.3;
  return value;
}

/**
 * Score a gem's synergy potential with an existing stockpile.
 * Checks how many archetypes it reinforces and how many combinations it enables.
 */
export function synergyPotential(
  gem: GemInstance,
  myStockpile: GemInstance[],
  registry: DataRegistry,
): number {
  let score = 0;
  const t = clampTier(gem.tier);

  // Check combination potential with existing stockpile
  for (const existing of myStockpile) {
    const combo = registry.getCombination(gem.affixId, existing.affixId);
    if (combo) {
      score += TIER_VALUES[t] * 4; // Combinations are very valuable
    }
  }

  // Check upgrade potential (same affix)
  for (const existing of myStockpile) {
    if (existing.affixId === gem.affixId && gem.tier < 4) {
      score += TIER_VALUES[t] * 2;
    }
  }

  // Check archetype coherence bonus
  const archetypes = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];
  const gemAffix = registry.findAffix(gem.affixId);
  if (gemAffix) {
    const gemTags = new Set(gemAffix.tags);
    for (const arch of archetypes) {
      const archTags = ARCHETYPE_TAGS[arch];
      if (!archTags.some((tag) => gemTags.has(tag))) continue;
      // Count how many existing gems match this archetype
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
 * Compute a counter-value score for a gem based on damage patterns
 * observed in a combat log. Higher score means the gem better counters
 * the opponent's damage.
 */
export function counterValue(
  gem: GemInstance,
  damageProfile: DamageProfile,
  registry: DataRegistry,
): number {
  const affix = registry.findAffix(gem.affixId);
  if (!affix) return 0;

  let score = 0;
  const t = clampTier(gem.tier);
  const tags = new Set(affix.tags);

  // If opponent deals lots of physical damage, defensive/physical tags help
  if (damageProfile.physical > 0.3) {
    if (tags.has('defensive') || tags.has('block') || tags.has('physical')) {
      score += damageProfile.physical * TIER_VALUES[t] * 5;
    }
  }

  // Check elemental damage patterns
  for (const [element, fraction] of Object.entries(damageProfile.elemental)) {
    if (fraction > 0.1 && tags.has(element)) {
      // Gems with the same element tag on armor give resistance
      score += fraction * TIER_VALUES[t] * 5;
    }
  }

  // Evasion/dodge counters everything
  if (tags.has('evasion') || tags.has('barrier')) {
    const totalDamage = damageProfile.physical +
      Object.values(damageProfile.elemental).reduce((s, v) => s + v, 0);
    score += totalDamage * TIER_VALUES[t] * 2;
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
 * Find the best archetype for a stockpile (most matching gems).
 */
export function bestArchetype(
  stockpile: GemInstance[],
  registry: DataRegistry,
): ArchetypeId {
  const archetypes = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];
  let bestArch: ArchetypeId = archetypes[0];
  let bestCount = 0;

  for (const arch of archetypes) {
    let count = 0;
    for (const gem of stockpile) {
      if (archetypeMatch(gem, arch, registry)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestArch = arch;
    }
  }

  return bestArch;
}
