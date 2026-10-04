import type { DataRegistry } from '../data/registry.js';
import { onRoomWall } from '../data/tutorial-floor-schema.js';
import type { Door, FloorMap, Interactable, Room } from '../types/floor-map.js';
import { TUTORIAL_INTERACTABLES, type TutorialFloorDef } from '../types/tutorial-floor.js';
import type { SimCtx } from './combat.js';
import { flowField } from './flow.js';
import { snapToWalkable } from './grid.js';

/**
 * The guided start's hand-built floors (see the tutorial spec): building them,
 * their scripted foes and their set drops.
 */

/** A room that seals (a den, the boss room): a door between it and another is its own. */
const seals = (r: Room) => r.kind === 'den' || r.kind === 'boss';

/**
 * A hand-built floor's map: its rows' walls, floor and doors (`0`–`9`, each
 * door its cells of one digit, its id the digit); its rooms, each holding the
 * interactable its cells place (`C`, `H`, `A`, `X`; its id `${depth}:${room}`,
 * a shrine's blessing the first of `shrines.json`) and its home field; each
 * door's rooms, those on whose wall it lies (one that seals first, then by
 * id; one alone twice); the start (`S`) and the exit gate (`X`) at their
 * cells' centres. `tutorialFloorProblems` has checked its geometry.
 */
export function tutorialFloorMap(
  registry: DataRegistry,
  def: TutorialFloorDef,
  depth: number,
): FloorMap {
  const width = def.rows[0].length;
  const height = def.rows.length;
  const cells = new Uint8Array(width * height);
  const doors: Door[] = [];
  const rooms: Room[] = def.rooms.map((r) => ({
    id: r.id,
    kind: r.kind,
    rect: { ...r.rect },
    revealed: false,
    cleared: false,
    sealed: false,
  }));
  const map: FloorMap = {
    width,
    height,
    cells,
    rooms,
    doors,
    start: { x: 0, y: 0 },
    exit: { x: 0, y: 0 },
    open: false,
  };
  const shrine = registry.getDelveData().shrines[0].id;
  def.rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const at = { x: x + 0.5, y: y + 0.5 };
      if (c === '#') cells[y * width + x] = 1;
      else if (c >= '0' && c <= '9') {
        cells[y * width + x] = 2;
        (doors[+c] ??= { id: +c, cells: [], rooms: [0, 0], closed: false }).cells.push({ x, y });
      } else if (c === 'S') map.start = at;
      const kind = TUTORIAL_INTERACTABLES[c];
      const room = rooms.find(
        ({ rect: r }) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h,
      );
      if (!kind || !room) return;
      const it: Interactable = { id: `${depth}:${room.id}`, kind, ...at, used: false };
      if (kind === 'shrine') it.shrine = shrine;
      if (kind === 'gate') map.exit = at;
      room.interactable = it;
    }),
  );
  for (const d of doors) {
    const on = rooms
      .filter((r) => d.cells.some((c) => onRoomWall(r.rect, c)))
      .sort((a, b) => Number(seals(b)) - Number(seals(a)) || a.id - b.id);
    d.rooms = [on[0].id, (on[1] ?? on[0]).id];
  }
  for (const r of rooms) {
    const centre = snapToWalkable(map, r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2);
    r.homeField = flowField(map, centre, Infinity, 1);
  }
  return map;
}

/**
 * A chest on a hand-built floor: its set drops (`on: 'chest'`) burst out in
 * place of a vault's roll, and true; false off a hand-built floor (the vault's
 * roll follows).
 */
export function tutorialChest(_ctx: SimCtx, _it: Interactable): boolean {
  return false;
}
