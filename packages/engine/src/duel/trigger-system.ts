import type { Loadout, EquippedSlot } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import type { TriggerDef, TriggerCondition, TriggerEffect, GladiatorRuntime } from '../types/combat.js';
import type { AffixDef, AffixTier } from '../types/affix.js';
import type { SeededRNG } from '../rng/seeded-rng.js';

/** Map affix IDs to their trigger conditions */
const CONDITION_MAP: Record<string, TriggerCondition> = {
  chance_on_hit: 'on_hit',
  chance_on_crit: 'on_crit',
  chance_on_block: 'on_block',
  chance_on_taking_damage: 'on_taking_damage',
  chance_on_kill: 'on_kill',
  chance_on_low_hp: 'on_low_hp',
};

/**
 * Extract trigger definitions from a loadout's equipped affixes.
 * Iterates weapon and armor slots, finds trigger-category affixes,
 * and creates TriggerDef entries from their tier data.
 */
export function extractTriggers(loadout: Loadout, registry: DataRegistry): TriggerDef[] {
  const triggers: TriggerDef[] = [];

  const targets: Array<{ item: 'weapon' | 'armor'; slots: (EquippedSlot | null)[] }> = [
    { item: 'weapon', slots: loadout.weapon.slots },
    { item: 'armor', slots: loadout.armor.slots },
  ];

  for (const { item, slots } of targets) {
    for (const slot of slots) {
      if (!slot) continue;

      const gem = slot.gem;
      const affixId = gem.affixId;
      const tier: AffixTier = gem.tier as AffixTier;

      const affix = registry.getAffix(affixId);
      if (!affix || affix.category !== 'trigger') continue;

      const condition = CONDITION_MAP[affixId];
      if (!condition) continue;

      const tierData = affix.tiers[tier];
      if (!tierData) continue;

      // valueRange: [chance_percent, cooldown_seconds]
      const chance = (tierData.valueRange[0] ?? 0) / 100;
      const cooldown = tierData.valueRange[1] ?? 0;

      // Pick effect modifiers based on weapon vs armor
      const modifiers = item === 'weapon' ? tierData.weaponEffect : tierData.armorEffect;

      const effect = buildTriggerEffect(modifiers);
      if (!effect) continue;

      triggers.push({ affixId, condition, chance, cooldown, effect });
    }
  }

  return triggers;
}

/**
 * Build a TriggerEffect from stat modifiers.
 * Maps procDamage -> bonus_damage, procHeal -> heal.
 */
function buildTriggerEffect(modifiers: AffixDef['tiers'][1]['weaponEffect']): TriggerEffect | null {
  for (const mod of modifiers) {
    if (mod.stat === 'procDamage') {
      return { kind: 'bonus_damage', amount: mod.value, damageType: 'physical' };
    }
    if (mod.stat === 'procHeal') {
      return { kind: 'heal', amount: mod.value, isPercent: false };
    }
  }
  return null;
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
  if (trigger.cooldown > 0) {
    gladiator.cooldowns.set(trigger.affixId, trigger.cooldown);
  }

  return trigger.effect;
}
