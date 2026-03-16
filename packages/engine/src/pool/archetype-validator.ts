import type { AffixDef } from '../types/affix.js';
import type { OrbInstance } from '../types/orb.js';
import type { DataRegistry } from '../data/registry.js';

export type ArchetypeId =
  | 'physical_burst'
  | 'elemental_fire'
  | 'elemental_cold'
  | 'dot_poison'
  | 'crit_assassin'
  | 'tank_fortress'
  | 'sustain_leech'
  | 'shadow_control';

/**
 * Maps each archetype to the affix tags that contribute to it.
 * An orb contributes to an archetype if ANY of its tags overlap.
 */
export const ARCHETYPE_TAGS: Record<ArchetypeId, string[]> = {
  physical_burst: ['physical', 'crit'],
  elemental_fire: ['fire', 'elemental'],
  elemental_cold: ['cold', 'elemental'],
  dot_poison: ['poison', 'dot'],
  crit_assassin: ['crit', 'physical'],
  tank_fortress: ['defensive', 'block'],
  sustain_leech: ['lifesteal', 'sustain'],
  shadow_control: ['shadow', 'control'],
};

const ALL_ARCHETYPES = Object.keys(ARCHETYPE_TAGS) as ArchetypeId[];

/**
 * Count how many orbs in the pool contribute to each archetype.
 */
export function countArchetypeOrbs(
  pool: OrbInstance[],
  registry: DataRegistry,
): Record<ArchetypeId, number> {
  const counts = {} as Record<ArchetypeId, number>;
  for (const arch of ALL_ARCHETYPES) {
    counts[arch] = 0;
  }

  for (const orb of pool) {
    const affix = registry.findAffix(orb.affixId);
    if (!affix) continue;
    const orbTags = new Set(affix.tags);

    for (const arch of ALL_ARCHETYPES) {
      const requiredTags = ARCHETYPE_TAGS[arch];
      if (requiredTags.some((t) => orbTags.has(t))) {
        counts[arch]++;
      }
    }
  }

  return counts;
}

/**
 * Validate that at least `minArchetypes` distinct archetypes have
 * at least `archetypeMinOrbs` orbs contributing to them.
 */
export function validateArchetypes(
  pool: OrbInstance[],
  registry: DataRegistry,
  archetypeMinOrbs: number,
  minArchetypes: number = 3,
): boolean {
  const counts = countArchetypeOrbs(pool, registry);
  let viable = 0;
  for (const arch of ALL_ARCHETYPES) {
    if (counts[arch] >= archetypeMinOrbs) {
      viable++;
    }
  }
  return viable >= minArchetypes;
}
