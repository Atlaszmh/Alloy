import type { DataRegistry, ForgePlan, GemInstance, StatModifier } from '@alloy/engine';
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
 * Walk equipped gems and aggregate their damage contributions per type.
 * Weapon slots contribute via weaponEffect; armor slots are skipped because
 * armor-side mods are defensive (resistances, maxHP, armor%). Gem rarity
 * multiplier is applied to match stat-calculator.
 *
 * Returns only types with a positive total, sorted into canonical order.
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
  return out;
}

/** Sum of every gem-damage contribution, for use in the headline DMG stat. */
export function sumGemDamage(breakdown: GemDamageContribution[]): number {
  let total = 0;
  for (const row of breakdown) total += row.value;
  return total;
}
