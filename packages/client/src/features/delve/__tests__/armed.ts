import { defaultMoveset, type DelveProfile, type Rarity } from '@alloy/engine';
import { getDelveRegistry } from '../registry';

/**
 * `p` with its equipped weapon made `rarity` (uncommon by default), holding that rarity's base
 * moveset in its mana. A new save's common sword carries the basic chain alone (see the tutorial
 * spec's carries): a test of the Primary arms the hero first, as its first forge would.
 */
export function armed(p: DelveProfile, rarity: Rarity = 'uncommon'): DelveProfile {
  const w = p.equipped.weapon!;
  const moveset = defaultMoveset(getDelveRegistry(), { baseId: w.baseId, rarity }, w.mana);
  return { ...p, equipped: { ...p.equipped, weapon: { ...w, rarity, moveset } } };
}
