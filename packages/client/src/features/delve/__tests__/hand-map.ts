import type { Door, FloorMap, Interactable, Rect, Room, RoomKind, Vec } from '@alloy/engine';

/** A room for `handMap`: its kind, its floor, and what stands at its centre. */
export interface HandRoom {
  kind: RoomKind;
  rect: Rect;
  interactable?: Interactable['kind'];
}

const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/**
 * A hand-built floor map, its rooms known to the tests: walls everywhere but the
 * rooms and the halls. A hall's cells in a room's wall ring (the cells
 * round its floor) are that room's door. The hero starts in the first room;
 * the exit is its gate, else the last room's centre.
 */
export function handMap(width: number, height: number, rooms: HandRoom[], halls: Rect[]): FloorMap {
  const cells = new Uint8Array(width * height).fill(1);
  const carve = (r: Rect) => {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) cells[y * width + x] = 0;
  };
  halls.forEach(carve);
  const centre = (r: Rect): Vec => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const built: Room[] = rooms.map((r, id) => {
    carve(r.rect);
    return {
      id,
      kind: r.kind,
      rect: r.rect,
      revealed: false,
      cleared: false,
      sealed: false,
      interactable: r.interactable && {
        id: `1:${id}`,
        kind: r.interactable,
        ...centre(r.rect),
        used: false,
      },
    };
  });
  const doors: Door[] = [];
  for (const h of halls) {
    const rings = rooms.map(({ rect: r }) => {
      const ring: Vec[] = [];
      const wall = { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 };
      for (let y = h.y; y < h.y + h.h; y++)
        for (let x = h.x; x < h.x + h.w; x++)
          if (inside(wall, x, y) && !inside(r, x, y)) ring.push({ x, y });
      return ring;
    });
    const joined = rings.flatMap((ring, id) => (ring.length ? [id] : []));
    for (const id of joined) {
      for (const c of rings[id]) cells[c.y * width + c.x] = 2;
      const other = joined.find((j) => j !== id) ?? id;
      doors.push({ id: doors.length, cells: rings[id], rooms: [id, other], closed: false });
    }
  }
  const gate = built.find((r) => r.interactable?.kind === 'gate')?.interactable;
  return {
    width,
    height,
    cells,
    look: new Uint8Array(width * height),
    structures: [],
    version: 0,
    rooms: built,
    doors,
    start: centre(rooms[0].rect),
    exit: gate ? { x: gate.x, y: gate.y } : centre(rooms[rooms.length - 1].rect),
    open: false,
  };
}

/**
 * A 64 × 64 ring of rooms: the start (top left), a vault with its chest (top
 * right), a sanctum with its shrine (bottom right), the exit with its gate
 * (bottom left), and a combat room in the middle off the top hall.
 */
export function ringMap(): FloorMap {
  return handMap(
    64,
    64,
    [
      { kind: 'start', rect: { x: 4, y: 4, w: 12, h: 10 } },
      { kind: 'vault', rect: { x: 44, y: 4, w: 12, h: 10 }, interactable: 'chest' },
      { kind: 'sanctum', rect: { x: 44, y: 44, w: 14, h: 12 }, interactable: 'shrine' },
      { kind: 'exit', rect: { x: 4, y: 46, w: 12, h: 10 }, interactable: 'gate' },
      { kind: 'combat', rect: { x: 24, y: 22, w: 16, h: 14 } },
    ],
    [
      { x: 16, y: 7, w: 28, h: 3 },
      { x: 48, y: 14, w: 3, h: 30 },
      { x: 16, y: 50, w: 28, h: 3 },
      { x: 8, y: 14, w: 3, h: 32 },
      { x: 30, y: 10, w: 3, h: 12 },
    ],
  );
}

/** A 64 × 64 grid of 4 × 4 rooms (12 × 10, one a coarse cell of 16), each joined to its neighbours. */
export function gridMap(): FloorMap {
  const kinds: RoomKind[] = ['start', 'combat', 'den', 'combat', 'vault', 'combat', 'sanctum'];
  const rooms: HandRoom[] = [];
  const halls: Rect[] = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      rooms.push({
        kind: r === 3 && c === 3 ? 'exit' : kinds[(r * 4 + c) % kinds.length],
        rect: { x: 2 + 16 * c, y: 3 + 16 * r, w: 12, h: 10 },
      });
      if (c < 3) halls.push({ x: 14 + 16 * c, y: 6 + 16 * r, w: 4, h: 3 });
      if (r < 3) halls.push({ x: 6 + 16 * c, y: 13 + 16 * r, w: 3, h: 6 });
    }
  return handMap(64, 64, rooms, halls);
}
