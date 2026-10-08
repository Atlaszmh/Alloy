import type { DataRegistry } from '../../src/data/registry.js';
import { defaultMoveset } from '../../src/loot/moveset.js';
import { mintMoveset } from '../../src/delve/profile.js';
import type { DelveProfile } from '../../src/types/delve.js';
import type { GearItem, Rarity } from '../../src/types/gear.js';

/**
 * A test's weapon of another rarity: its slot table's defaults (the constructs
 * spec §3.2), its constructs minted uids when it goes on a profile (`armed`).
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
  const [moveset, q] = mintMoveset(p, weapon.moveset!);
  return { ...q, equipped: { ...p.equipped, weapon: { ...weapon, moveset } } };
}
