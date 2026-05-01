import type {
  CompoundEffectBlueprint,
  DataRegistry,
  ForgePlan,
  GemInstance,
  StatModifier,
} from '@alloy/engine';
import { RARITY_MULTIPLIERS } from '@alloy/engine';

/**
 * Canonical damage-type label used for both colouring and display. Matches
 * `ELEMENT_COLORS` keys in element-theme.ts so the tooltip can colour each
 * row consistently with elsewhere in the UI.
 */
export type DamageType =
  | 'physical'
  | 'fire'
  | 'cold'
  | 'lightning'
  | 'poison'
  | 'shadow'
  | 'chaos';

export interface GemDamageContribution {
  type: DamageType;
  /** Flat points contributed (post-rarity multiplier). */
  value: number;
  /**
   * Optional short badge rendered next to the value to clarify non-flat
   * mechanics — poison is DoT, shadow scales on enemy %HP.
   */
  suffix?: string;
  /**
   * Optional recipe ID when this contribution comes from a compound's
   * compoundEffects blueprint. Lets the UI label the row as "from <Name>".
   * Absent for ordinary affix-derived rows.
   */
  source?: string;
}

/** Map a raw affix stat key → damage type (if it represents a damage source). */
function classifyDamageStat(stat: string): { type: DamageType; suffix?: string } | null {
  if (stat === 'physicalDamage') return { type: 'physical' };
  if (stat === 'chaosDamage' || stat === 'elementalDamage.chaos') return { type: 'chaos' };
  if (stat === 'elementalDamage.fire') return { type: 'fire' };
  if (stat === 'elementalDamage.cold') return { type: 'cold' };
  if (stat === 'elementalDamage.lightning') return { type: 'lightning' };
  if (stat === 'dotDamage.poison') return { type: 'poison', suffix: 'DoT' };
  if (stat === 'shadowDamage.percentHP') return { type: 'shadow', suffix: '%HP' };
  return null;
}

/** Canonical display order — matches ALL_ELEMENTS plus physical up front. */
const DISPLAY_ORDER: DamageType[] = [
  'physical',
  'fire',
  'cold',
  'lightning',
  'poison',
  'shadow',
  'chaos',
];

/** Pull the stat-modifier list a gem contributes when socketed into `target`. */
function gemEffects(
  gem: GemInstance,
  registry: DataRegistry,
  target: 'weapon' | 'armor',
): StatModifier[] {
  const baseAffix = registry.findAffix(gem.affixId);
  if (baseAffix) {
    const tier = Math.min(gem.tier, 4) as 1 | 2 | 3 | 4;
    const tierData = baseAffix.tiers[tier];
    return target === 'weapon' ? tierData.weaponEffect : tierData.armorEffect;
  }
  const compound = registry.getCombinationById(gem.affixId);
  if (compound) {
    return target === 'weapon' ? compound.weaponEffect : compound.armorEffect;
  }
  return [];
}

/**
 * Estimate the average per-second damage a compound effect blueprint
 * contributes when its trigger procs at the given chance. Crude — assumes
 * roughly 1 attack/sec baseline and approximates DOT uptime by amortizing the
 * full-duration damage budget over a ~5s encounter window. Designed for an
 * at-a-glance forge preview, not exact combat math.
 */
function estimateCompoundDamage(
  blueprint: CompoundEffectBlueprint,
  chance: number,
  gemTier: number,
): { type: DamageType; value: number } | null {
  const eff = blueprint.effect;
  if (eff.kind === 'compound_dot') {
    const damagePerProc = eff.dpsPerTier * gemTier * eff.dotMultiplier * eff.duration;
    const value = (chance * damagePerProc) / 5;
    return { type: eff.element as DamageType, value };
  }
  if (eff.kind === 'apply_dot') {
    const damagePerProc = eff.dpsPerTier * gemTier * eff.duration;
    const value = (chance * damagePerProc) / 5;
    return { type: eff.element as DamageType, value };
  }
  if (eff.kind === 'bonus_damage') {
    const amt = (eff.amount ?? 0) + (eff.amountPerTier ?? 0) * gemTier;
    return { type: eff.damageType as DamageType, value: chance * amt };
  }
  if (eff.kind === 'bonus_damage_scaled') {
    // Hard to estimate without knowing baseline attack damage; assume a
    // 100-damage attack baseline — designers can recalibrate later.
    const baseline = 100;
    return { type: eff.damageType as DamageType, value: chance * baseline * eff.multiplier };
  }
  // Other kinds (heal/gain_barrier/stun/buffs/debuffs) don't produce damage.
  return null;
}

/**
 * Read compound.<recipeId>.chance from outputBonusEffects; fall back to 0.15
 * which matches the default ignite chance and is the most common authored
 * value across recipes.
 */
function readCompoundChance(recipe: {
  id: string;
  outputBonusEffects: StatModifier[];
}): number {
  const key = `compound.${recipe.id}.chance`;
  for (const eff of recipe.outputBonusEffects) {
    if (eff.stat === key) return eff.value;
  }
  return 0.15;
}

/**
 * Walk equipped gems and aggregate their damage contributions per type.
 * Weapon slots contribute via weaponEffect; armor slots are skipped because
 * armor-side mods are defensive (resistances, maxHP, armor%). Gem rarity
 * multiplier is applied to match stat-calculator.
 *
 * Returns only types with a positive total, sorted into canonical order, then
 * appends compound trigger contributions as separate labeled rows so the UI
 * can render "+15 fire from Ignite" instead of folding it into the base row.
 */
export function buildGemDamageBreakdown(
  plan: ForgePlan,
  registry: DataRegistry,
): GemDamageContribution[] {
  const totals = new Map<DamageType, { value: number; suffix?: string }>();

  for (const slot of plan.loadout.weapon.slots) {
    if (!slot) continue;
    const gem = slot.gem;
    const rarityMult = RARITY_MULTIPLIERS[gem.rarity];
    const mods: StatModifier[] = [
      ...gemEffects(gem, registry, 'weapon'),
      ...(gem.outputBonusEffects ?? []),
    ];
    for (const mod of mods) {
      const hit = classifyDamageStat(mod.stat);
      if (!hit) continue;
      // Only flat additions represent raw damage points — percent/override
      // affect scaling and aren't legible on a per-gem breakdown.
      if (mod.op !== 'flat') continue;
      const prev = totals.get(hit.type);
      totals.set(hit.type, {
        value: (prev?.value ?? 0) + mod.value * rarityMult,
        suffix: hit.suffix,
      });
    }
  }

  const out: GemDamageContribution[] = [];
  for (const type of DISPLAY_ORDER) {
    const entry = totals.get(type);
    if (!entry || entry.value <= 0) continue;
    out.push({ type, value: entry.value, suffix: entry.suffix });
  }

  // SECOND PASS: append compound trigger contributions as separate labeled rows.
  // Each compound becomes its own entry tagged with `source` so the UI can
  // render "+15 fire from Ignite" instead of folding it into the base row.
  for (const slot of plan.loadout.weapon.slots) {
    if (!slot) continue;
    const gem = slot.gem;
    const recipe = registry.getRecipeByOutputAffix(gem.affixId);
    if (!recipe?.compoundEffects || recipe.compoundEffects.length === 0) continue;
    const chance = readCompoundChance(recipe);
    for (const blueprint of recipe.compoundEffects) {
      const est = estimateCompoundDamage(blueprint, chance, gem.tier ?? 1);
      if (!est || est.value <= 0) continue;
      out.push({
        type: est.type,
        value: est.value,
        source: recipe.id,
      });
    }
  }

  return out;
}

/** Sum of every gem-damage contribution, for use in the headline DMG stat. */
export function sumGemDamage(breakdown: GemDamageContribution[]): number {
  let total = 0;
  for (const row of breakdown) total += row.value;
  return total;
}
