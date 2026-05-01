import type { Loadout, EquippedSlot } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import type {
  TriggerDef,
  TriggerCondition,
  TriggerEffect,
  CompoundEffectBlueprint,
  CompoundEffectShape,
  GladiatorRuntime,
} from '../types/combat.js';
import type { AffixDef, AffixTier } from '../types/affix.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { GemInstance } from '../types/gem.js';
import type { RecipeDefinition } from '../combine/recipe-registry.js';

/** Map affix IDs to their trigger conditions */
const CONDITION_MAP: Record<string, TriggerCondition> = {
  chance_on_hit: 'on_hit',
  chance_on_crit: 'on_crit',
  chance_on_block: 'on_block',
  chance_on_taking_damage: 'on_taking_damage',
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

      // Path A: base trigger affix.
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

        triggers.push({ affixId, condition, chance, cooldown, effects: [effect] });
        continue;
      }

      // Path B: compound gem (e.g. affixId='ignite').
      // A gem whose affixId matches a recipe's outputAffixId is a compound.
      // Its triggers are declared data-driven on the recipe via
      // `compoundEffects`. Recipes without that field produce no triggers.
      const recipe = registry.getRecipeByOutputAffix(affixId);
      if (!recipe) continue;

      triggers.push(...buildCompoundTriggers(recipe, gem));
    }
  }

  return triggers;
}

/**
 * Build TriggerDefs from a compound recipe's `compoundEffects` blueprints.
 *
 * Blueprints are grouped by their resolved condition into a single TriggerDef
 * per (compound, condition). Multi-effect compounds (e.g. frostbite = DOT +
 * slow on the same on_hit condition) thus get a single chance roll that fires
 * every effect together — keeps proc semantics intuitive. The compound's
 * chance is shared across all blueprints (read from
 * `compound.<recipeId>.chance`, defaults to 0.15).
 */
function buildCompoundTriggers(
  recipe: RecipeDefinition,
  gem: GemInstance,
): TriggerDef[] {
  const blueprints = recipe.compoundEffects;
  if (!blueprints || blueprints.length === 0) return [];

  const params = readCompoundParams(recipe);
  // Compound params are scale-1 fractions (0.15 = 15%). Default to 0.15 to
  // match the original Ignite tuning if a recipe omits an explicit chance.
  const chance = params.chance ?? 0.15;
  const inferredCondition = inferConditionFromComponents(recipe);

  // Group blueprints by their resolved condition into a single TriggerDef per
  // (affixId, condition). Preserve declaration order using an array+lookup.
  const byCondition = new Map<TriggerCondition, TriggerEffect[]>();
  const order: TriggerCondition[] = [];
  for (const blueprint of blueprints) {
    const condition = blueprint.condition ?? inferredCondition;
    if (!condition) continue;
    const effect = materializeBlueprint(blueprint, recipe, gem);
    if (!effect) continue;
    if (!byCondition.has(condition)) {
      byCondition.set(condition, []);
      order.push(condition);
    }
    byCondition.get(condition)!.push(effect);
  }

  return order.map((condition) => ({
    affixId: gem.affixId,
    condition,
    chance,
    // Per-compound cooldowns are deferred; default to 0 so DOT-style
    // compounds can stack-fire under the engine's existing stacking rules.
    cooldown: 0,
    effects: byCondition.get(condition)!,
  }));
}

/**
 * Derive a TriggerCondition from a recipe's chance_<x> component (e.g.
 * chance_on_hit → 'on_hit'). Capstone compounds without a chance_* component
 * must declare `condition` explicitly on each blueprint.
 */
function inferConditionFromComponents(recipe: RecipeDefinition): TriggerCondition | null {
  const chanceComponent = recipe.components?.find(
    (c) => c.kind === 'affix' && /^chance_/.test(c.id),
  );
  if (!chanceComponent || chanceComponent.kind !== 'affix') return null;
  return CONDITION_MAP[chanceComponent.id] ?? null;
}

/**
 * Materialize a CompoundEffectBlueprint into a concrete TriggerEffect by
 * applying gem-tier scaling. `compoundId` is auto-derived from `recipe.id`
 * for `compound_dot` so JSON declarations stay non-redundant.
 */
function materializeBlueprint(
  blueprint: CompoundEffectBlueprint,
  recipe: RecipeDefinition,
  gem: GemInstance,
): TriggerEffect | null {
  const tier = gem.tier ?? 1;
  const shape: CompoundEffectShape = blueprint.effect;
  switch (shape.kind) {
    case 'compound_dot':
      return {
        kind: 'compound_dot',
        compoundId: recipe.id,
        element: shape.element,
        damagePerSecond: shape.dpsPerTier * tier,
        duration: shape.duration,
        tickInterval: shape.tickInterval,
        dotMultiplier: shape.dotMultiplier,
      };
    case 'apply_dot':
      return {
        kind: 'apply_dot',
        element: shape.element,
        dps: shape.dpsPerTier * tier,
        duration: shape.duration,
      };
    case 'gain_barrier':
      return {
        kind: 'gain_barrier',
        amount: (shape.amount ?? 0) + (shape.amountPerTier ?? 0) * tier,
        isPercent: shape.isPercent ?? false,
        duration: shape.duration,
      };
    case 'stun':
      return { kind: 'stun', duration: shape.duration };
    case 'reflect_damage':
      return {
        kind: 'reflect_damage',
        multiplier: shape.multiplier,
        duration: shape.duration,
      };
    case 'apply_slow':
      return {
        kind: 'apply_slow',
        multiplier: shape.multiplier,
        duration: shape.duration,
      };
    case 'amplify_dot_element':
      return {
        kind: 'amplify_dot_element',
        element: shape.element,
        stackMultiplier: shape.stackMultiplier,
        tickMultiplier: shape.tickMultiplier,
        duration: shape.duration,
      };
    case 'heal':
      return {
        kind: 'heal',
        amount: (shape.amount ?? 0) + (shape.amountPerTier ?? 0) * tier,
        isPercent: shape.isPercent,
      };
    case 'bonus_damage':
      return {
        kind: 'bonus_damage',
        damageType: shape.damageType,
        amount: (shape.amount ?? 0) + (shape.amountPerTier ?? 0) * tier,
      };
    case 'bonus_damage_scaled':
      return {
        kind: 'bonus_damage_scaled',
        damageType: shape.damageType,
        multiplier: shape.multiplier,
      };
    case 'damage_current_hp':
      return { kind: 'damage_current_hp', fraction: shape.fraction };
    case 'reduce_max_hp':
      return { kind: 'reduce_max_hp', fraction: shape.fraction, duration: shape.duration };
    case 'stat_buff_add':
      return {
        kind: 'stat_buff_add',
        stat: shape.stat,
        value: (shape.value ?? 0) + (shape.valuePerTier ?? 0) * tier,
        duration: shape.duration,
      };
    case 'stat_buff_mul':
      return {
        kind: 'stat_buff_mul',
        stat: shape.stat,
        multiplier: shape.multiplier,
        duration: shape.duration,
      };
  }
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
 * Checks cooldown, rolls chance once, and returns all bundled effects on a
 * successful proc. Returns null if the trigger doesn't fire.
 */
export function evaluateTrigger(
  trigger: TriggerDef,
  condition: TriggerCondition,
  gladiator: GladiatorRuntime,
  rng: SeededRNG,
): TriggerEffect[] | null {
  // Condition must match
  if (trigger.condition !== condition) return null;

  // Cooldown key includes the condition so a compound that emits TriggerDefs
  // for multiple conditions (e.g. a future on_hit + on_block compound) gets
  // independent cooldowns rather than sharing a single slot keyed by affixId.
  const cdKey = `${trigger.affixId}:${trigger.condition}`;
  const cooldownRemaining = gladiator.cooldowns.get(cdKey) ?? 0;
  if (cooldownRemaining > 0) return null;

  // Roll chance
  if (!rng.nextBool(trigger.chance)) return null;

  // Set cooldown
  if (trigger.cooldown > 0) {
    gladiator.cooldowns.set(cdKey, trigger.cooldown);
  }

  return trigger.effects;
}
