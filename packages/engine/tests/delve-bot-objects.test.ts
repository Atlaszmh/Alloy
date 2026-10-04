import { describe, it, expect, vi } from 'vitest';
import { botInput } from '../src/arpg/bot.js';
import { stepWorld } from '../src/arpg/step.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { CELL } from '../src/types/floor-map.js';
import { STEP, arena, bal, registry } from './fixtures/arena.js';
import { floorWorld, onMap, twoRooms } from './fixtures/flow-map.js';

// The bot among room objects (see the room objects spec's "5. The bot"): it paths round the
// props' and hazards' footprints, and a goal move that makes no headway side-steps.

/** With `hide.feet`, nothing sees the objects' footprints: only the no-progress side-step frees the bot. */
const hide = vi.hoisted(() => ({ feet: false }));
vi.mock('../src/arpg/objects-base.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/arpg/objects-base.js')>();
  return {
    ...real,
    footprints: (w: ArpgWorld) => (hide.feet ? new Set<number>() : real.footprints(w)),
  };
});

/** `w` played by the bot for up to `seconds`, until `done`. */
function play(w: ArpgWorld, seconds: number, done: () => boolean): void {
  for (let i = 0; i < Math.round(seconds / STEP) && !done(); i++)
    stepWorld(registry, w, botInput(registry, w), STEP);
}

/** Two rooms, the hero in the start's west, a crate square on its line to room 1's door. */
function crated(): ArpgWorld {
  const w = floorWorld(twoRooms('combat'));
  Object.assign(w.hero, { x: 3.5, y: 6.5 });
  w.props.push({
    type: 'prop',
    id: 900,
    kind: 'crate',
    x: 6.5,
    y: 6.5,
    radius: 0.6,
    life: 99,
    dead: false,
  });
  return w;
}

describe('the bot and room objects', () => {
  it('walks round a crate on its way instead of pressing into it', () => {
    hide.feet = false;
    const w = crated();
    play(w, 8, () => w.hero.x > 13);
    expect(w.hero.x).toBeGreaterThan(13);
  });

  it('a goal move that makes no headway side-steps until it does (footprints unseen)', () => {
    hide.feet = true;
    const w = crated();
    play(w, 10, () => w.hero.x > 13);
    hide.feet = false;
    expect(w.hero.x).toBeGreaterThan(13);
  });

  it('shut in a sealed den, it hunts the last foe before loot lying outside the door', () => {
    hide.feet = false;
    const map = twoRooms('den');
    map.rooms[1].sealed = map.rooms[1].revealed = true;
    for (const d of map.doors) d.closed = true;
    const w = floorWorld(map, [{ x: 21, y: 6, aggro: true, roomId: 1, ai: 'ranged' }]);
    Object.assign(w.hero, { x: 14, y: 6 });
    w.drops.push({
      id: 1,
      kind: 'item',
      x: 8.5,
      y: 6,
      amount: 1,
      born: 0,
      vacuum: false,
      dead: false,
    });
    expect(botInput(registry, w).move.x).toBeGreaterThan(0);
  });
});

/** Two rooms with `cells` set to `code` (x, y pairs) in the start room. */
function painted(code: number, cells: [number, number][], basic = false): ArpgWorld {
  const map = twoRooms('combat');
  for (const [x, y] of cells) map.cells[y * map.width + x] = code;
  return basic ? onMap(arena([]), map) : floorWorld(map);
}
const block = (x0: number, x1: number, y0: number, y1: number): [number, number][] =>
  Array.from({ length: (x1 - x0 + 1) * (y1 - y0 + 1) }, (_, i) => [
    x0 + (i % (x1 - x0 + 1)),
    y0 + Math.floor(i / (x1 - x0 + 1)),
  ]);

describe('the bot and terrain', () => {
  it('slow ground costs more: of two ways as short, it takes the one on firm ground', () => {
    const w = painted(CELL.slow, block(3, 8, 1, 4));
    Object.assign(w.hero, { x: 2.5, y: 1.5 });
    let slow = 0;
    let ticks = 0;
    for (; ticks < 300 && w.hero.x < 13; ticks++) {
      stepWorld(registry, w, botInput(registry, w), STEP);
      if (w.map.cells[Math.floor(w.hero.y) * w.map.width + Math.floor(w.hero.x)] === CELL.slow)
        slow++;
    }
    expect(w.hero.x).toBeGreaterThan(13);
    expect(slow).toBeLessThan(ticks / 10);
  });

  it('steps out of a primed hazard before it bursts', () => {
    const w = floorWorld(twoRooms('combat'));
    Object.assign(w.hero, { x: 4.5, y: 6.5 });
    w.hazards.push({
      ...{ type: 'hazard', id: 901, kind: 'brazier', element: 'fire' },
      ...{ x: 6, y: 6.5, radius: 0.5, burst: 2, state: 'primed', until: w.t + 0.4 },
    } as const);
    const reach = 2 + w.hero.radius;
    expect(Math.hypot(w.hero.x - 6, w.hero.y - 6.5)).toBeLessThan(reach);
    play(w, 0.4, () => false);
    expect(Math.hypot(w.hero.x - 6, w.hero.y - 6.5)).toBeGreaterThan(reach);
  });

  it('breaks a prop that shuts its only way', () => {
    // Its basic attack on: a blow aimed at the crate breaks it.
    const w = painted(CELL.cover, [...block(6, 6, 1, 4), ...block(6, 6, 8, 10)], true);
    Object.assign(w.hero, { x: 2.5, y: 6.5 });
    w.props.push({
      type: 'prop',
      id: 900,
      kind: 'crate',
      x: 6.5,
      y: 6.5,
      radius: 0.9,
      life: 1,
      dead: false,
    });
    play(w, 10, () => w.hero.x > 13);
    expect(w.props[0].dead).toBe(true);
    expect(w.hero.x).toBeGreaterThan(13);
  });

  it("searches a room's foliage it hasn't seen into", () => {
    const map = twoRooms('combat');
    const leaves = block(21, 23, 2, 4);
    for (const [x, y] of leaves) map.cells[y * map.width + x] = CELL.foliage;
    map.rooms[0].revealed = true;
    const w = floorWorld(map);
    Object.assign(w.hero, { x: 15.5, y: 8.5 });
    // Each leaf cell's nearest the hero came: inside a patch, sight reaches foliageSight.
    const near = leaves.map(() => Infinity);
    for (let i = 0; i < Math.round(6 / STEP); i++) {
      stepWorld(registry, w, botInput(registry, w), STEP);
      leaves.forEach(
        ([x, y], j) =>
          (near[j] = Math.min(near[j], Math.hypot(x + 0.5 - w.hero.x, y + 0.5 - w.hero.y))),
      );
    }
    expect(Math.max(...near)).toBeLessThanOrEqual(bal.terrain.foliageSight);
  });
});
