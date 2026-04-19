import type { Loadout, EquippedSlot } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import type { TriggerDef, TriggerCondition, TriggerEffect, GladiatorRuntime } from '../types/combat.js';
import type { AffixDef, AffixTier } from '../types/affix.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { GemInstance } from '../types/gem.js';
import type { RecipeDefinition } from '../combine/recipe-registry.js';

/**
 * Placeholder DPS scaling for compound effects. Move to balance.json when
 * the other 12 compounds are wired in P1 so per-compound tuning is
 * data-driven.
 */
const COMPOUND_BASE_DPS_PER_TIER = 3;

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

      // Path A: base trigger affix (existing behavior).
      // Use findAffix to avoid throwing for compound gems, whose affixId
      // (e.g. 'ignite') is not a registered AffixDef.
      const affix = registry.findAffix(affixId);
      if (affix && affix.category === 'trigger') {
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
        continue;
      }

      // Path B: compound gem (e.g. affixId='ignite').
      // A gem whose affixId matches a signature recipe's outputAffixId is a
      // compound; its trigger effect and condition are derived from the
      // recipe's chance_* component + compound.* params.
      const recipe = registry.getRecipeByOutputAffix(affixId);
      if (!recipe || recipe.type !== 'signature') continue;

      const compoundTrigger = buildCompoundTrigger(recipe, gem);
      if (compoundTrigger) {
        triggers.push(compoundTrigger);
      }
    }
  }

  return triggers;
}

/**
 * Construct a TriggerDef for a compound gem's recipe.
 *
 * Only Ignite is wired end-to-end in P0; other compounds return null with a
 * TODO marker so they stay inert. The returned trigger's condition is
 * inherited from the chance_* component of the recipe.
 */
function buildCompoundTrigger(
  recipe: RecipeDefinition,
  gem: GemInstance,
): TriggerDef | null {
  const effect = buildCompoundEffect(recipe, gem);
  if (!effect) return null;

  // The trigger condition is inherited from the chance_* component.
  const chanceComponent = recipe.components?.find(
    (c) => c.kind === 'affix' && /^chance_/.test(c.id),
  );
  if (!chanceComponent || chanceComponent.kind !== 'affix') return null;
  const condition = CONDITION_MAP[chanceComponent.id];
  if (!condition) return null;

  const params = readCompoundParams(recipe);
  // Compound params are scale-1 fractions (0.15 = 15%), unlike base-affix
  // valueRange[0] which is percent integers. Default to 0.15 if missing.
  const chance = params.chance ?? 0.15;

  return {
    affixId: gem.affixId,
    condition,
    chance,
    // Per-compound cooldowns are a P1 concern; default to 0 so ignite can
    // stack-fire up to the DOT stacking rules the engine already enforces.
    cooldown: 0,
    effect,
  };
}

/**
 * Map a recipe to a concrete TriggerEffect. Ignite is the reference case.
 *
 * TODO(P1): Extend this switch for the other 12 compounds:
 *   frostbite, static_discharge, envenom, soulrend, pact_of_madness,
 *   bastion, aegis, sanctum, absorption_core, warriors_edge, bloodpact,
 *   resolute_strike.
 * Each compound will declare its own TriggerEffect shape (DOT / buff /
 * shield / etc.) derived from its outputBonusEffects params.
 */
function buildCompoundEffect(
  recipe: RecipeDefinition,
  gem: GemInstance,
): TriggerEffect | null {
  if (recipe.id === 'ignite') {
    const params = readCompoundParams(recipe);
    // Placeholder damage-per-second scaling (see COMPOUND_BASE_DPS_PER_TIER).
    // The recipe's dotMultiplier is applied downstream in the duel engine
    // when the DOT is pushed onto the defender, and the attacker's
    // stats.dotMultiplier (scale-100) layers on top in calculateDOTBreakdown.
    const damagePerSecond = COMPOUND_BASE_DPS_PER_TIER * (gem.tier ?? 1);
    // duration in seconds.
    const durationSeconds = params.duration ?? 12;
    return {
      kind: 'compound_dot',
      compoundId: 'ignite',
      element: 'fire',
      damagePerSecond,
      duration: durationSeconds,
      tickInterval: 1.0,
      dotMultiplier: params.dotMultiplier ?? 1.0,
    };
  }
  // All other compounds are inert until P1 wires them individually.
  return null;
}

/**
 * Read compound.<recipeId>.<key> params from a recipe's outputBonusEffects.
 * Returns a flat map keyed by the trailing segment (e.g. 'chance', 'duration',
 * 'dotMultiplier'). Values are scale-1 floats as declared in recipes.json.
 */
function readCompoundParams(recipe: RecipeDefinition): Record<string, number> {
  const prefix = `compound.${recipe.id}.`;
  const out: Record<string, number> = {};
  for (const effect of recipe.outputBonusEffects ?? []) {
    if (effect.stat.startsWith(prefix)) {
      const key = effect.stat.slice(prefix.length);
      out[key] = effect.value;
    }
  }
  return out;
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
