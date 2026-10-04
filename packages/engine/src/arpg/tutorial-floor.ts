import type { Interactable } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';

/**
 * The guided start's hand-built floors (see the tutorial spec): building them,
 * their scripted foes and their set drops. Phase A's stub: the chest hook is
 * inert until B2 fills it.
 */

/**
 * A chest on a hand-built floor: its set drops (`on: 'chest'`) burst out in
 * place of a vault's roll, and true; false off a hand-built floor (the vault's
 * roll follows).
 */
export function tutorialChest(_ctx: SimCtx, _it: Interactable): boolean {
  return false;
}
