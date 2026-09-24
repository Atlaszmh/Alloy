/** The five kinds of mana. Gear is attuned to one; spells spend them. */
export type ManaType = 'fire' | 'frost' | 'storm' | 'earth' | 'shadow';

export const MANA_TYPES: readonly ManaType[] = ['fire', 'frost', 'storm', 'earth', 'shadow'] as const;

export type ManaMap = Record<ManaType, number>;

export function emptyManaMap(): ManaMap {
  return { fire: 0, frost: 0, storm: 0, earth: 0, shadow: 0 };
}
