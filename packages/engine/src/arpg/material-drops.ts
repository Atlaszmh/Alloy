import type { MonsterEntity } from '../types/arpg.js';
import type { SimCtx } from './combat.js';

/**
 * A slain foe's materials (see the crafting spec's drop tables): pickups that
 * burst onto the floor and magnet in, rolled on the world's own stream. Stage
 * 4c's B1 fills it and calls it from `killMonster`'s `!world.sandbox` guard;
 * until then it throws.
 */
export function dropMaterials(_ctx: SimCtx, _m: MonsterEntity): void {
  throw new Error('dropMaterials: not implemented');
}
