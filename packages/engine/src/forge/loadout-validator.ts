import type { Loadout, EquippedSlot } from '../types/item.js';
import type { GemInstance } from '../types/gem.js';
import type { DataRegistry } from '../data/registry.js';

export interface LoadoutValidationResult {
  valid: boolean;
  errors: string[];
}

/** Collect every gem UID referenced by a loadout's equipped slots. */
function collectSlotUids(slots: (EquippedSlot | null)[]): string[] {
  const uids: string[] = [];
  for (const slot of slots) {
    if (!slot) continue;
    uids.push(slot.gem.uid);
  }
  return uids;
}

/** Collect every affixId referenced by a loadout's equipped slots. */
function collectSlotAffixIds(slots: (EquippedSlot | null)[]): string[] {
  const ids: string[] = [];
  for (const slot of slots) {
    if (!slot) continue;
    ids.push(slot.gem.affixId);
  }
  return ids;
}

/**
 * Validates a player's loadout against their stockpile and the data registry.
 *
 * Checks:
 * 1. All affix IDs in the loadout are known to the registry
 * 2. No duplicate gem UIDs (same gem used in multiple slots)
 * 3. All gem UIDs are present in the player's stockpile
 * 4. Loadout is not completely empty (must have at least one equipped slot)
 */
export function validateLoadout(
  loadout: Loadout,
  stockpile: GemInstance[],
  registry: DataRegistry,
): LoadoutValidationResult {
  const errors: string[] = [];

  // Gather all UIDs and affix IDs from both weapon and armor
  const weaponUids = collectSlotUids(loadout.weapon.slots);
  const armorUids = collectSlotUids(loadout.armor.slots);
  const allUids = [...weaponUids, ...armorUids];

  const weaponAffixIds = collectSlotAffixIds(loadout.weapon.slots);
  const armorAffixIds = collectSlotAffixIds(loadout.armor.slots);
  const allAffixIds = [...weaponAffixIds, ...armorAffixIds];

  // 1. Check affix IDs are valid
  for (const affixId of allAffixIds) {
    if (!registry.findAffix(affixId)) {
      errors.push(`Unknown affix: ${affixId}`);
    }
  }

  // 2. Check for duplicate UIDs
  const uidSet = new Set<string>();
  for (const uid of allUids) {
    if (uidSet.has(uid)) {
      errors.push(`Duplicate gem UID: ${uid}`);
    }
    uidSet.add(uid);
  }

  // 3. Check all gems are in stockpile
  const stockpileUids = new Set(stockpile.map((g) => g.uid));
  for (const uid of allUids) {
    if (!stockpileUids.has(uid)) {
      errors.push(`Gem not in stockpile: ${uid}`);
    }
  }

  // 4. Check loadout is not completely empty
  if (allUids.length === 0) {
    errors.push('Loadout is empty — must equip at least one gem');
  }

  return { valid: errors.length === 0, errors };
}
