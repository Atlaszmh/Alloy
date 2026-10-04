import type { Vec } from '../types/arpg.js';
import type { Door, FloorMap, Rect, Room } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';
import { roomAt } from './fog.js';
import { clamp, dirTo } from './geometry.js';
import { isWalkable, moveCircle, solid } from './grid.js';

/**
 * Sealed rooms (see the floor maps spec): a den or the boss room closes its
 * doors while the hero is inside with a foe of it awake, and opens them when
 * none of its foes is left alive.
 */

interface Circle extends Vec {
  radius: number;
}

function inside(rect: Rect, p: Vec): boolean {
  return p.x >= rect.x && p.x < rect.x + rect.w && p.y >= rect.y && p.y < rect.y + rect.h;
}

/** Whether a circle overlaps cell (cx, cy). */
function overlaps(c: Circle, cell: Vec): boolean {
  const dx = c.x - clamp(c.x, cell.x, cell.x + 1);
  const dy = c.y - clamp(c.y, cell.y, cell.y + 1);
  return dx * dx + dy * dy < c.radius * c.radius;
}

function inDoor(c: Circle, doors: Door[]): boolean {
  return doors.some((d) => d.cells.some((cell) => overlaps(c, cell)));
}

/** The room's doors: those in its wall (`Door.rooms[0]`; a hall's other door is the other room's). */
export function doorsOf(map: FloorMap, room: Room): Door[] {
  return map.doors.filter((d) => d.rooms[0] === room.id);
}

/**
 * The centre of the walkable cell nearest `c` on the room's side (`within`:
 * its floor, else outside it) where a circle of its radius overlaps none of
 * `doors` (ring by ring around it); `c` itself if there is none.
 */
function freeSpot(map: FloorMap, room: Room, doors: Door[], c: Circle, within: boolean): Vec {
  const cx = Math.floor(c.x);
  const cy = Math.floor(c.y);
  for (let ring = 0; ring < Math.max(map.width, map.height); ring++) {
    let best: Vec | null = null;
    let bestD = Infinity;
    for (let j = cy - ring; j <= cy + ring; j++)
      for (let i = cx - ring; i <= cx + ring; i++) {
        if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== ring || solid(map, i, j)) continue;
        const p = { x: i + 0.5, y: j + 0.5 };
        if (inside(room.rect, p) !== within || inDoor({ ...p, radius: c.radius }, doors)) continue;
        const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
        if (d < bestD) {
          best = p;
          bestD = d;
        }
      }
    if (best) return best;
  }
  return { x: c.x, y: c.y };
}

/**
 * A den or the boss room seals when the hero stands in it with a foe of it
 * awake (`ArpgWorld.sealing`): its foes outside are brought to free cells
 * inside, and each door closes once no one stands in it (the hero is nudged
 * inward); after `ai.sealGrace` whoever still does is put out on their side
 * and the door closes. With every door shut the room is `sealed` (`seal`). A
 * hero who leaves before it shuts ends the sealing, its doors open again. A
 * sealing or sealed room whose foes are all dead opens (`unseal`). A foe of a
 * den or the boss room whose centre is in a blocked cell is put back on its
 * floor, so a sealed room can always finish. A no-op on the open room.
 */
export function sealTick(ctx: SimCtx): void {
  const { world, bal, events } = ctx;
  const { map, hero: h } = world;
  if (map.open) return;
  const foesOf = (room: Room) => world.monsters.filter((m) => !m.dead && m.roomId === room.id);
  const open = (room: Room) => {
    for (const d of doorsOf(map, room)) d.closed = false;
    if (world.sealing?.roomId === room.id) world.sealing = null;
  };

  for (const room of map.rooms)
    if (room.kind === 'den' || room.kind === 'boss')
      for (const m of foesOf(room))
        if (!isWalkable(map, m.x, m.y))
          Object.assign(m, freeSpot(map, room, doorsOf(map, room), m, true));

  for (const room of map.rooms) {
    if (!(room.sealed || world.sealing?.roomId === room.id) || foesOf(room).length > 0) continue;
    open(room);
    if (room.sealed) events.push({ kind: 'unseal', roomId: room.id });
    room.sealed = false;
  }

  if (!world.sealing) {
    const room = roomAt(map, h.x, h.y);
    if (!room || room.sealed || (room.kind !== 'den' && room.kind !== 'boss')) return;
    const foes = foesOf(room);
    if (!foes.some((m) => m.aggro)) return;
    world.sealing = { roomId: room.id, since: world.t };
    const doors = doorsOf(map, room);
    for (const m of foes)
      if (!inside(room.rect, m)) Object.assign(m, freeSpot(map, room, doors, m, true));
  }

  const room = map.rooms.find((r) => r.id === world.sealing!.roomId)!;
  const doors = doorsOf(map, room);
  const late = world.t >= world.sealing.since + bal.ai.sealGrace;
  if (!inside(room.rect, h) && (late || !inDoor(h, doors))) return open(room);
  const circles: Circle[] = [h, ...world.monsters.filter((m) => !m.dead)];
  for (const d of doors) {
    if (d.closed) continue;
    const standing = circles.filter((c) => inDoor(c, [d]));
    for (const c of standing) {
      // The room's own foes go inside, whichever side of the door they stand.
      const own = c !== h && (c as { roomId?: number | null }).roomId === room.id;
      if (late) Object.assign(c, freeSpot(map, room, doors, c, own || inside(room.rect, c)));
      else if (c === h) {
        const centre = { x: room.rect.x + room.rect.w / 2, y: room.rect.y + room.rect.h / 2 };
        const dir = dirTo(h.x, h.y, centre.x, centre.y);
        Object.assign(h, moveCircle(map, h, h.radius, dir.x * h.radius, dir.y * h.radius));
      }
    }
    if (late || standing.length === 0) d.closed = true;
  }
  if (doors.every((d) => d.closed)) {
    room.sealed = true;
    world.sealing = null;
    events.push({ kind: 'seal', roomId: room.id });
  }
}
