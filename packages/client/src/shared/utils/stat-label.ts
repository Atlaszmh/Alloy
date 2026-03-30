import type { AffixDef, AffixTier, OrbInstance } from '@alloy/engine';

const STAT_ABBREVIATIONS: Record<string, string> = {
  physicalDamage: 'Phys Dmg',
  coldDamage: 'Cold Dmg',
  fireDamage: 'Fire Dmg',
  lightningDamage: 'Ltng Dmg',
  poisonDamage: 'Psn Dmg',
  shadowDamage: 'Shadow Dmg',
  chaosDamage: 'Chaos Dmg',
  attackInterval: 'Atk Spd',
  critChance: 'Crit',
  critMultiplier: 'Crit Mult',
  maxHP: 'HP',
  armor: 'Armor',
  coldResistance: 'Cold Res',
  fireResistance: 'Fire Res',
  lightningResistance: 'Ltng Res',
  poisonResistance: 'Psn Res',
  shadowResistance: 'Shadow Res',
  chaosResistance: 'Chaos Res',
  allResistances: 'All Res',
  firePenetration: 'Fire Pen',
  dodgeChance: 'Dodge',
  blockChance: 'Block',
  hpRegen: 'Regen',
  barrier: 'Barrier',
  thornsDamage: 'Thorns',
  stunChance: 'Stun',
  allElementalDamage: 'All Elem',
};

export function getStatAbbreviation(stat: string): string {
  return STAT_ABBREVIATIONS[stat] ?? stat;
}

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
