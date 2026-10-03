import type { ArpgWorld } from '../types/arpg.js';
import type { FloorMap, HudIcon, HudMap, InteractableKind, Room } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';
import { blocked, lineOfSight } from './grid.js';

/**
 * The fog of war and the minimap (see the floor maps spec).
 */

/** The room whose floor holds the point (x, y), if any (a hall's point is in none). */
export function roomAt(map: FloorMap, x: number, y: number): Room | undefined {
  return map.rooms.find(({ rect: r }) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/** The sight each world's fog was last lit for: the hero's cell and which doors are shut. */
const sightKeys = new WeakMap<ArpgWorld, string>();

/**
 * At `ai.fogEvery` marks (`ArpgWorld.fogAt`): what was in sight dims to seen,
 * the floor cells within `ai.sightRadius` the hero has a line of sight to are
 * in sight, and so are the walls beside them; the room the hero stands in is
 * revealed, its floor and walls seen. `fogVersion` moves when anything did.
 * After `ai.exitHintSeconds` with the exit's room unrevealed, the `exitHint`
 * fires once (`exitHinted`). A no-op on the open room.
 */
export function fogTick(ctx: SimCtx): void {
  const { world, bal, events } = ctx;
  const { map, hero: h, fog } = world;
  if (map.open || world.t < world.fogAt) return;
  world.fogAt = world.t + bal.ai.fogEvery;
  const w = map.width;
  // Sight is taken from the centre of the hero's cell, so it moves only when
  // that cell or a door does: only then is it worked out again.
  const cx = Math.floor(h.x);
  const cy = Math.floor(h.y);
  const key = `${cy * w + cx}:${map.doors.map((d) => +d.closed).join('')}`;
  let changed = false;
  if (sightKeys.get(world) !== key) {
    sightKeys.set(world, key);
    const o = { x: cx + 0.5, y: cy + 0.5 };
    const before = fog.slice();
    for (let i = 0; i < fog.length; i++) if (fog[i] === 2) fog[i] = 1;

    const r = bal.ai.sightRadius;
    const x0 = Math.max(0, Math.floor(o.x - r));
    const x1 = Math.min(w - 1, Math.floor(o.x + r));
    const y0 = Math.max(0, Math.floor(o.y - r));
    const y1 = Math.min(map.height - 1, Math.floor(o.y + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const c = { x: x + 0.5, y: y + 0.5 };
        if (blocked(map, x, y) || Math.hypot(c.x - o.x, c.y - o.y) > r) continue;
        if (lineOfSight(map, o, c)) fog[y * w + x] = 2;
      }
    // The walls beside a floor cell in sight are in sight too.
    const lit = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < w && y < map.height && !blocked(map, x, y) && fog[y * w + x] === 2;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!blocked(map, x, y)) continue;
        let near = false;
        for (let j = -1; j <= 1 && !near; j++)
          for (let i = -1; i <= 1; i++) near ||= lit(x + i, y + j);
        if (near) fog[y * w + x] = 2;
      }
    changed = fog.some((v, i) => v !== before[i]);
  }

  const room = roomAt(map, h.x, h.y);
  const entered = !!room && !room.revealed;
  if (room && entered) {
    room.revealed = true;
    const { x, y, w: rw, h: rh } = room.rect;
    for (let j = Math.max(0, y - 1); j <= Math.min(map.height - 1, y + rh); j++)
      for (let i = Math.max(0, x - 1); i <= Math.min(w - 1, x + rw); i++)
        fog[j * w + i] = Math.max(fog[j * w + i], 1);
  }
  if (entered || changed) world.fogVersion++;

  const exit = roomAt(map, map.exit.x, map.exit.y);
  if (!world.exitHinted && world.t >= bal.ai.exitHintSeconds && exit && !exit.revealed) {
    world.exitHinted = true;
    events.push({ kind: 'exitHint', x: map.exit.x, y: map.exit.y });
  }
}

const ICONS: Record<InteractableKind, HudIcon> = {
  chest: 'chest',
  shrine: 'shrine',
  alcove: 'anvil',
  gate: 'gate',
};

/** What the minimap draws (pure): revealed rooms and their icons, the exit and its hint, foes in sight, drops in seen cells. */
export function hudMapOf(world: ArpgWorld): HudMap {
  const { map, fog } = world;
  const fogAt = (x: number, y: number) => {
    const cx = Math.min(map.width - 1, Math.max(0, Math.floor(x)));
    const cy = Math.min(map.height - 1, Math.max(0, Math.floor(y)));
    return fog[cy * map.width + cx];
  };
  const revealed = map.rooms.filter((r) => r.revealed);
  const found = !map.open && !!roomAt(map, map.exit.x, map.exit.y)?.revealed;
  return {
    width: map.width,
    height: map.height,
    rooms: revealed.map((r) => ({
      id: r.id,
      kind: r.kind,
      rect: { ...r.rect },
      icon: r.interactable
        ? ICONS[r.interactable.kind]
        : r.kind === 'den' || r.kind === 'boss'
          ? 'skull'
          : null,
      used: !!r.interactable?.used,
      cleared: r.cleared,
      sealed: r.sealed,
    })),
    exit: found ? { ...map.exit } : null,
    hint: world.exitHinted && !found ? { ...map.exit } : null,
    foes: world.monsters
      .filter((m) => !m.dead && fogAt(m.x, m.y) === 2)
      .map((m) => ({ x: m.x, y: m.y, kind: m.kind })),
    drops: world.drops
      .filter((d) => !d.dead && fogAt(d.x, d.y) >= 1)
      .map((d) => ({ x: d.x, y: d.y, kind: d.kind })),
    explored: revealed.length,
    total: map.rooms.length,
    fogVersion: world.fogVersion,
  };
}
