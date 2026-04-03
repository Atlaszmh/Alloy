export type Element = 'fire' | 'cold' | 'lightning' | 'poison' | 'shadow' | 'chaos';

export const ALL_ELEMENTS: readonly Element[] = [
  'fire',
  'cold',
  'lightning',
  'poison',
  'shadow',
  'chaos',
] as const;

export interface DerivedStats {
  maxHP: number;
  physicalDamage: number;
  elementalDamage: Record<Element, number>;
  attackSpeed: number; // Seconds between attacks
  armor: number; // Integer points, 1 = 1% physical damage reduction
  resistances: Record<Element, number>; // Integer points, 1 = 1% elemental damage reduction
  critChance: number; // Integer percentage, 1 = 1%
  critMultiplier: number; // Integer scale, 150 = 1.5x
  critAvoidance: number; // Integer percentage, 1 = 1%
  lifestealPercent: number; // Integer percentage, 1 = 1%
  blockChance: number; // Integer percentage, 1 = 1%
  blockAmount: number; // Flat damage blocked
  blockBreakChance: number; // Integer percentage, 1 = 1%
  dodgeChance: number; // Integer percentage, 1 = 1%
  thornsDamage: number;
  barrierAmount: number;
  hpRegen: number; // HP per second
  armorPenetration: number; // Integer percentage, 1 = 1%
  elementalPenetration: number; // Integer percentage, 1 = 1%
  stunChance: number; // Integer percentage, 1 = 1%
  slowPercent: number; // Integer percentage, 1 = 1%
  dotMultiplier: number; // Integer scale, 100 = 1.0x baseline
  initiative: number; // Integer percentage, 1 = 1% faster at duel start
}

export function createEmptyDerivedStats(): DerivedStats {
  const zeroElements = Object.fromEntries(
    ALL_ELEMENTS.map((e) => [e, 0]),
  ) as Record<Element, number>;

  return {
    maxHP: 0,
    physicalDamage: 0,
    elementalDamage: { ...zeroElements },
    attackSpeed: 1.0, // 1 second between attacks
    armor: 0,
    resistances: { ...zeroElements },
    critChance: 0,
    critMultiplier: 150,
    critAvoidance: 0,
    lifestealPercent: 0,
    blockChance: 0,
    blockAmount: 0,
    blockBreakChance: 0,
    dodgeChance: 0,
    thornsDamage: 0,
    barrierAmount: 0,
    hpRegen: 0,
    armorPenetration: 0,
    elementalPenetration: 0,
    stunChance: 0,
    slowPercent: 0,
    dotMultiplier: 100,
    initiative: 0,
  };
}
