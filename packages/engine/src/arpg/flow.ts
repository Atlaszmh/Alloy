import type { Vec } from '../types/arpg.js';
import type { FloorMap } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';

/**
 * Foes' pathing and leashing on the grid (see the floor maps spec's
 * "Monsters"; the physics and AI area fills this file). Each tick is a no-op
 * on the open room.
 */

/**
 * Steps from each walkable cell to `target` (BFS, within `radius` cells) for a
 * foe `clearance` cells wide; 65535 where it doesn't reach.
 */
export function flowField(
  _map: FloorMap,
  _target: Vec,
  _radius: number,
  _clearance: number,
): Uint16Array {
  throw new Error('flowField: not implemented');
}

/** Rebuild the flow fields toward the hero at `ai.flowEvery` marks (`ArpgWorld.flow`). */
export function flowTick(_ctx: SimCtx): void {}

/** Send foes past their leash home, and heal and sleep them there (`farSince`, `goingHome`). */
export function leashTick(_ctx: SimCtx): void {}
