import type { AffixDef, AffixTier, OrbInstance } from '@alloy/engine';

export function getStatLabel(
  affix: AffixDef,
  orb: OrbInstance,
  target: 'weapon' | 'armor' = 'weapon',
): string {
  const tierData = affix.tiers[orb.tier as AffixTier];
  const effects = target === 'weapon' ? tierData?.weaponEffect : tierData?.armorEffect;
  const stat = effects?.[0];
  if (!stat) return '';
  return stat.op === 'percent'
    ? `${Math.round(stat.value * 100)}%`
    : `+${stat.value}`;
}
