import type { DataRegistry } from '../data/registry.js';
import type { ArpgWorld, MonsterEntity } from '../types/arpg.js';
import type { ShrineDef } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';

/**
 * Using what the rooms hold, and the floor's flow (see the floor maps spec's
 * "Interacting, special rooms and the exit"; the floor flow area fills this
 * file). Each hook is a no-op on the open room.
 */

/**
 * The interactable in reach (`ai.interactRadius`): its `interactPrompt` each
 * step, and an interact press (`ArpgWorld.queuedInteract`) acting on it: a
 * chest, a shrine's prayer (`channel`), an alcove, the gate.
 */
export function interactTick(_ctx: SimCtx): void {}

/**
 * A shrine's blessing on the world's hero (`applyBuffs` over `baseStats`), its
 * Find, a potion refill, or a dive blessing into `pending.diveBuffs`; the use
 * goes into `pending.used`.
 */
export function applyShrine(_registry: DataRegistry, _world: ArpgWorld, _shrine: ShrineDef): void {
  throw new Error('applyShrine: not implemented');
}

/** Take the exit: `world.exited` (the client after its confirm, the bot at once). */
export function exitFloor(_world: ArpgWorld): void {
  throw new Error('exitFloor: not implemented');
}

/** `killMonster`'s room hook: a room's last foe pulls its foes' drops in (`ai.roomVacuum`) and fires `roomCleared`. */
export function onMonsterKilled(_ctx: SimCtx, _m: MonsterEntity): void {}
