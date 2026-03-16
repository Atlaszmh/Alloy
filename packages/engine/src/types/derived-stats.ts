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
  attackInterval: number; // In ticks (minimum capped)
  armor: number; // Physical damage reduction %
  resistances: Record<Element, number>;
  critChance: number; // 0-1
  critMultiplier: number; // Default 1.5
  critAvoidance: number; // 0-1
  lifestealPercent: number;
  blockChance: number; // 0-1
  blockBreakChance: number; // 0-1
  dodgeChance: number; // 0-1
  thornsDamage: number;
  barrierAmount: number;
  hpRegen: number; // Per tick
  armorPenetration: number; // 0-1
  elementalPenetration: number; // 0-1
  stunChance: number; // 0-1
  slowPercent: number; // 0-1
  dotMultiplier: number; // 1 = no bonus
  initiative: number; // % faster at duel start
}

export function createEmptyDerivedStats(): DerivedStats {
  const zeroElements = Object.fromEntries(
    ALL_ELEMENTS.map((e) => [e, 0]),
  ) as Record<Element, number>;

  return {
    maxHP: 0,
    physicalDamage: 0,
    elementalDamage: { ...zeroElements },
    attackInterval: 30, // 1 second at 30 ticks/sec
    armor: 0,
    resistances: { ...zeroElements },
    critChance: 0,
    critMultiplier: 1.5,
    critAvoidance: 0,
    lifestealPercent: 0,
    blockChance: 0,
    blockBreakChance: 0,
    dodgeChance: 0,
    thornsDamage: 0,
    barrierAmount: 0,
    hpRegen: 0,
    armorPenetration: 0,
    elementalPenetration: 0,
    stunChance: 0,
    slowPercent: 0,
    dotMultiplier: 1,
    initiative: 0,
  };
}
