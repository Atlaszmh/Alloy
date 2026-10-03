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
export function exitFloor(world: ArpgWorld): void {
  world.exited = true;
}

/**
 * `killMonster`'s room hook: when a room's last foe dies, the room is cleared
 * (`roomCleared`) and its foes' drops are pulled to the hero (`ai.roomVacuum`).
 */
export function onMonsterKilled(ctx: SimCtx, m: MonsterEntity): void {
  const { world, bal, events } = ctx;
  if (m.roomId === null || world.monsters.some((o) => !o.dead && o.roomId === m.roomId)) return;
  const room = world.map.rooms.find((r) => r.id === m.roomId);
  if (!room || room.cleared) return;
  room.cleared = true;
  if (bal.ai.roomVacuum) for (const d of world.drops) if (d.roomId === m.roomId) d.vacuum = true;
  events.push({ kind: 'roomCleared', roomId: room.id });
}
