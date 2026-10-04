import type { DataRegistry } from '../../src/data/registry.js';
import { defaultMoveset } from '../../src/loot/moveset.js';
import type { DelveProfile } from '../../src/types/delve.js';
import type { GearItem, Rarity } from '../../src/types/gear.js';

/**
 * A new save's common sword carries the basic chain alone (see the tutorial
 * spec's carries): a test of the Primary arms the hero first, as its first
 * forge would.
 */

/** Weapon `w` made `rarity` (uncommon by default), holding that rarity's base moveset in its mana. */
export function armedWeapon(
  registry: DataRegistry,
  w: GearItem,
  rarity: Rarity = 'uncommon',
): GearItem {
  return { ...w, rarity, moveset: defaultMoveset(registry, { baseId: w.baseId, rarity }, w.mana) };
}

/** `p` with its equipped weapon armed (`armedWeapon`). */
export function armed(
  registry: DataRegistry,
  p: DelveProfile,
  rarity: Rarity = 'uncommon',
): DelveProfile {
  const weapon = armedWeapon(registry, p.equipped.weapon!, rarity);
  return { ...p, equipped: { ...p.equipped, weapon } };
}
