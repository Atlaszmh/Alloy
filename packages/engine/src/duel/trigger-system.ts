import type { Loadout } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import type { TriggerDef, TriggerCondition, TriggerEffect, GladiatorRuntime } from '../types/combat.js';
import type { SeededRNG } from '../rng/seeded-rng.js';

/**
 * Extract trigger definitions from a loadout's equipped affixes.
 * Currently a stub — returns empty array since the affix JSON uses stat modifiers
 * rather than explicit trigger definitions. The architecture supports future expansion.
 */
export function extractTriggers(_loadout: Loadout, _registry: DataRegistry): TriggerDef[] {
  // Future: iterate loadout slots, find trigger-category affixes, create TriggerDef entries.
  // For now, triggers are not encoded in affix data, so we return an empty list.
  return [];
}

/**
 * Evaluate whether a trigger should fire given a condition.
 * Checks cooldown, rolls chance, and returns the effect if it procs.
 * Returns null if the trigger doesn't fire.
 */
export function evaluateTrigger(
  trigger: TriggerDef,
  condition: TriggerCondition,
  gladiator: GladiatorRuntime,
  rng: SeededRNG,
): TriggerEffect | null {
  // Condition must match
  if (trigger.condition !== condition) return null;

  // Check cooldown
  const cooldownRemaining = gladiator.cooldowns.get(trigger.affixId) ?? 0;
  if (cooldownRemaining > 0) return null;

  // Roll chance
  if (!rng.nextBool(trigger.chance)) return null;

  // Set cooldown
  if (trigger.cooldownTicks > 0) {
    gladiator.cooldowns.set(trigger.affixId, trigger.cooldownTicks);
  }

  return trigger.effect;
}
