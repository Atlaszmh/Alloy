/** Deterministic display order for affixes in item cards.
 *  Ordered by category (offensive -> defensive -> sustain -> utility -> trigger),
 *  then by position within each category. */
export const AFFIX_DISPLAY_ORDER: string[] = [
  // Offensive
  'flat_physical', 'fire_damage', 'cold_damage', 'lightning_damage',
  'poison_damage', 'shadow_damage', 'chaos_damage',
  'crit_chance', 'crit_damage', 'attack_speed',
  'armor_penetration', 'elemental_penetration',
  // Defensive
  'flat_hp', 'armor_rating', 'block_chance', 'dodge_chance',
  'barrier', 'hp_regen', 'damage_reduction', 'fortify',
  // Sustain
  'lifesteal', 'thorns', 'life_on_kill',
  // Utility
  'initiative', 'dot_multiplier', 'stun_chance', 'slow_on_hit',
  // Trigger
  'chance_on_hit', 'chance_on_taking_damage', 'chance_on_crit',
  'chance_on_block', 'chance_on_kill', 'chance_on_low_hp',
];

export function getAffixDisplayIndex(affixId: string): number {
  const idx = AFFIX_DISPLAY_ORDER.indexOf(affixId);
  return idx === -1 ? AFFIX_DISPLAY_ORDER.length : idx;
}

/** Sort equipped slots by deterministic affix display order */
export function sortAffixesByDisplayOrder<T extends { affixId: string }>(affixes: T[]): T[] {
  return [...affixes].sort((a, b) => getAffixDisplayIndex(a.affixId) - getAffixDisplayIndex(b.affixId));
}
