import type { Echo } from '../../types/arpg.js';
import type { SimCtx } from '../combat.js';

/**
 * Echo (see the runes spec): a move or a blow that lands with `echo > 0`
 * repeats `delve.runes.echoDelay` later at that fraction of its power, free,
 * without a beat, a cooldown, a cast event, Guard or a further echo.
 */

/** Queue an echo on `ArpgWorld.echoes`. */
export function queueEcho(_ctx: SimCtx, _echo: Echo): void {
  throw new Error('not built yet');
}

/** Run every echo whose time has come (called right after `castTick`). */
export function echoTick(_ctx: SimCtx): void {
  throw new Error('not built yet');
}
