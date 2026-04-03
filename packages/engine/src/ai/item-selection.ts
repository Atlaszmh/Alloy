import type { AITier } from '../types/ai.js';
import type { BaseItemDef } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';

const ELEMENTS = ['fire', 'cold', 'lightning', 'poison', 'shadow', 'chaos'] as const;

/**
 * Select weapon and armor for an AI opponent based on tier.
 *
 * - Tier 1-2 (Easy): Random weapon and armor
 * - Tier 3 (Medium): Favor balanced items (closest to median stats)
 * - Tier 4-5 (Hard): Counter-pick based on player's gem draft
 */
export function selectAIItems(
  tier: AITier,
  playerDraftedGems: Array<{ tags: string[] }>,
  registry: DataRegistry,
  rng: SeededRNG,
): { weapon: BaseItemDef; armor: BaseItemDef } {
  const weapons = registry.getBaseItemsByType('weapon');
  const armors = registry.getBaseItemsByType('armor');

  if (weapons.length === 0 || armors.length === 0) {
    throw new Error('No weapons or armors available in registry');
  }

  if (tier <= 2) {
    return selectEasy(weapons, armors, rng);
  } else if (tier === 3) {
    return selectMedium(weapons, armors, rng);
  } else {
    return selectHard(weapons, armors, playerDraftedGems, rng);
  }
}

function selectEasy(
  weapons: BaseItemDef[],
  armors: BaseItemDef[],
  rng: SeededRNG,
): { weapon: BaseItemDef; armor: BaseItemDef } {
  const weapon = weapons[rng.nextInt(0, weapons.length - 1)];
  const armor = armors[rng.nextInt(0, armors.length - 1)];
  return { weapon, armor };
}

function selectMedium(
  weapons: BaseItemDef[],
  armors: BaseItemDef[],
  rng: SeededRNG,
): { weapon: BaseItemDef; armor: BaseItemDef } {
  // Pick weapon closest to median attack speed
  const sortedBySpeed = [...weapons].sort(
    (a, b) => (a.baseStats.attackSpeed ?? 0) - (b.baseStats.attackSpeed ?? 0),
  );
  const medianWeaponIdx = Math.floor(sortedBySpeed.length / 2);
  const medianSpeed = sortedBySpeed[medianWeaponIdx].baseStats.attackSpeed ?? 0;
  const weaponsByDistance = [...weapons].sort(
    (a, b) =>
      Math.abs((a.baseStats.attackSpeed ?? 0) - medianSpeed) -
      Math.abs((b.baseStats.attackSpeed ?? 0) - medianSpeed),
  );
  // Pick from the top balanced candidates with slight randomness
  const weaponCandidateCount = Math.max(1, Math.ceil(weaponsByDistance.length / 3));
  const weapon = weaponsByDistance[rng.nextInt(0, weaponCandidateCount - 1)];

  // Pick armor closest to median armor value
  const sortedByArmor = [...armors].sort(
    (a, b) => (a.baseStats.armor ?? 0) - (b.baseStats.armor ?? 0),
  );
  const medianArmorIdx = Math.floor(sortedByArmor.length / 2);
  const medianArmor = sortedByArmor[medianArmorIdx].baseStats.armor ?? 0;
  const armorsByDistance = [...armors].sort(
    (a, b) =>
      Math.abs((a.baseStats.armor ?? 0) - medianArmor) -
      Math.abs((b.baseStats.armor ?? 0) - medianArmor),
  );
  const armorCandidateCount = Math.max(1, Math.ceil(armorsByDistance.length / 3));
  const armor = armorsByDistance[rng.nextInt(0, armorCandidateCount - 1)];

  return { weapon, armor };
}

function selectHard(
  weapons: BaseItemDef[],
  armors: BaseItemDef[],
  playerDraftedGems: Array<{ tags: string[] }>,
  _rng: SeededRNG,
): { weapon: BaseItemDef; armor: BaseItemDef } {
  // Pick weapon with highest physical damage
  const weapon = [...weapons].sort(
    (a, b) => (b.baseStats.physicalDamage ?? 0) - (a.baseStats.physicalDamage ?? 0),
  )[0];

  // Count element tags from player's gems to find dominant element
  const elementCounts = new Map<string, number>();
  for (const gem of playerDraftedGems) {
    for (const tag of gem.tags) {
      if ((ELEMENTS as readonly string[]).includes(tag)) {
        elementCounts.set(tag, (elementCounts.get(tag) ?? 0) + 1);
      }
    }
  }

  // Find dominant element
  let dominantElement: string | null = null;
  let maxCount = 0;
  for (const [element, count] of elementCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantElement = element;
    }
  }

  // Pick armor with highest resistance to dominant element.
  // Base items use `fireResistance`, `coldResistance`, etc. for per-element,
  // and `allResistances` for blanket resistance. We check the specific key first,
  // then fall back to allResistances.
  let armor: BaseItemDef;

  if (dominantElement) {
    const resistKey = `${dominantElement}Resistance`;
    armor = [...armors].sort((a, b) => {
      const aResist = (a.baseStats[resistKey] ?? 0) + (a.baseStats.allResistances ?? 0);
      const bResist = (b.baseStats[resistKey] ?? 0) + (b.baseStats.allResistances ?? 0);
      return bResist - aResist;
    })[0];
  } else {
    // No elemental gems — pick highest allResistances
    armor = [...armors].sort(
      (a, b) => (b.baseStats.allResistances ?? 0) - (a.baseStats.allResistances ?? 0),
    )[0];
  }

  return { weapon, armor };
}
