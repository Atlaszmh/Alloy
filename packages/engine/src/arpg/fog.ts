import type { ArpgWorld } from '../types/arpg.js';
import type { HudMap } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';

/**
 * The fog of war and the minimap (see the floor maps spec; the floor flow area
 * fills this file).
 */

/**
 * At `ai.fogEvery` marks (`ArpgWorld.fogAt`): what the hero sees and the rooms it
 * enters revealed (`fog`, `fogVersion`), and the exit hint after
 * `ai.exitHintSeconds` (`exitHinted`). A no-op on the open room.
 */
export function fogTick(_ctx: SimCtx): void {}

/** What the minimap draws (pure): revealed rooms and their icons, the exit and its hint, foes in sight, drops in revealed cells. */
export function hudMapOf(_world: ArpgWorld): HudMap {
  throw new Error('hudMapOf: not implemented');
}
