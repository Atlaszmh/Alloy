/** The six elements. Gear is attuned to one; abilities are built from one or two. */
export type ManaType = 'fire' | 'frost' | 'storm' | 'earth' | 'shadow' | 'nature';

export const MANA_TYPES: readonly ManaType[] = ['fire', 'frost', 'storm', 'earth', 'shadow', 'nature'] as const;

export type ManaMap = Record<ManaType, number>;

export function emptyManaMap(): ManaMap {
  return { fire: 0, frost: 0, storm: 0, earth: 0, shadow: 0, nature: 0 };
}
