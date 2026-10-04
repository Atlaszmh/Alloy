import type { DataRegistry } from '../data/registry.js';
import type { ArpgWorld } from '../types/arpg.js';
import { clamp } from './geometry.js';
import type { Furnishing } from './layout/furnish.js';
import type { RoomObject } from './objects.js';

/**
 * The room objects' standing parts (see the room objects spec): placing them on
 * a world and their footprints (the cells their circles cover, which the
 * furnisher, the flow fields, spawns and drops treat as blocked). Apart from
 * `objects.ts`, which re-exports all of it, because that file imports the hit
 * code (`combat.ts`, and through it the dive): `world.ts` and the drop sites
 * import this one.
 */

/** A circle's footprint: every cell (its index, `y × width + x`) it overlaps, on the map. */
export function footprint(
  map: { width: number; height: number },
  c: { x: number; y: number; radius: number },
): number[] {
  const cells: number[] = [];
  const y1 = Math.min(map.height - 1, Math.floor(c.y + c.radius));
  const x1 = Math.min(map.width - 1, Math.floor(c.x + c.radius));
  for (let y = Math.max(0, Math.floor(c.y - c.radius)); y <= y1; y++)
    for (let x = Math.max(0, Math.floor(c.x - c.radius)); x <= x1; x++) {
      const dx = c.x - clamp(c.x, x, x + 1);
      const dy = c.y - clamp(c.y, y, y + 1);
      if (dx * dx + dy * dy < c.radius * c.radius) cells.push(y * map.width + x);
    }
  return cells;
}

/** The unbroken props and every hazard (a dormant one is still a body). */
export function standing(world: ArpgWorld): RoomObject[] {
  return [...world.props.filter((p) => !p.dead), ...world.hazards];
}

/** Every standing object's footprint, as one set of cells. */
export function footprints(world: ArpgWorld): Set<number> {
  const cells = new Set<number>();
  for (const o of standing(world)) for (const c of footprint(world.map, o)) cells.add(c);
  return cells;
}

/**
 * Stand a furnishing's props and hazards on the world (`createFloorWorld`
 * calls it): ids from `nextId` in order, the props first; each body (and a
 * hazard's burst) from `setpieces.json`; a prop's life `terrain.propLife`;
 * every hazard ready.
 */
export function placeObjects(registry: DataRegistry, world: ArpgWorld, f: Furnishing): void {
  const data = registry.getSetPieces();
  const life = registry.getDelveBalance().terrain.propLife;
  for (const { kind, x, y } of f.props) {
    const def = data.props.find((d) => d.id === kind);
    if (!def) throw new Error(`no prop ${kind}`);
    world.props.push({
      type: 'prop',
      id: world.nextId++,
      kind,
      x,
      y,
      radius: def.radius,
      life,
      dead: false,
    });
  }
  for (const { kind, element, x, y } of f.hazards) {
    const def = data.hazards.find((d) => d.id === kind);
    if (!def) throw new Error(`no hazard ${kind}`);
    world.hazards.push({
      type: 'hazard',
      id: world.nextId++,
      kind,
      element,
      x,
      y,
      radius: def.radius,
      burst: def.burst,
      state: 'ready',
      until: 0,
    });
  }
}
