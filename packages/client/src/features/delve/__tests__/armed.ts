import {
  defaultMoveset,
  mintMoveset,
  type Chain,
  type DelveProfile,
  type GearItem,
  type Rarity,
} from '@alloy/engine';
import { getDelveRegistry } from '../registry';

/**
 * `p` with its equipped weapon made `rarity` (uncommon by default), holding that rarity's default
 * moveset in its mana (the slot table's starts), its constructs minted. A new save's common
 * sword holds its Basic and a two-slot Primary; an uncommon one a Defensive too.
 */
export function armed(p: DelveProfile, rarity: Rarity = 'uncommon'): DelveProfile {
  const w = p.equipped.weapon!;
  const moveset = defaultMoveset(getDelveRegistry(), { baseId: w.baseId, rarity }, w.mana);
  return wearing(p, { ...w, rarity, moveset });
}

/** `p` wearing `weapon`, its moveset's constructs minted (as a drop banks or a forge makes them). */
export function wearing(p: DelveProfile, weapon: GearItem): DelveProfile {
  const [moveset, q] = mintMoveset(p, weapon.moveset!);
  return { ...q, equipped: { ...p.equipped, weapon: { ...weapon, moveset } } };
}

/** Four kinds, each distinct enough to read in a summary: the Skills tests' Primary. */
export const LANCE_KINDS = ['light', 'medium', 'medium', 'heavy'] as const;

/**
 * A Primary of `count` Fire Lances in `LANCE_KINDS`' order: a sword expresses a Lance (a Bolt
 * would sit dormant there, the constructs spec's class rule), and the kinds tell the moves apart.
 */
export function lancePrimary(count = 4): Chain {
  return {
    moves: LANCE_KINDS.slice(0, count).map((kind) => ({ kind, form: 'lance', elements: ['fire'] })),
    payment: 'mana',
  };
}
