import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { doorShut, isWalkable, lineOfSight, solid } from '../src/arpg/grid.js';
import { bal, dummy, registry, run, STEP } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';

// See the tutorial spec's gates: `Door.held` holds a door shut whatever the seal does, and
// `doorShut` replaces every read of `closed` (blocking, sight, the fog's key, the bot's key).

const door = (closed: boolean, held?: boolean) => ({
  id: 0,
  cells: [],
  rooms: [0, 1] as [number, number],
  closed,
  ...(held !== undefined && { held }),
});

describe('doorShut', () => {
  it('is closed or held', () => {
    expect([door(false), door(true), door(false, true), door(false, false)].map(doorShut)).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it('a held door blocks movement and sight as a closed one does', () => {
    const map = twoRooms('combat');
    expect([solid(map, 9, 6), isWalkable(map, 9.5, 6.5)]).toEqual([false, true]);
    expect(lineOfSight(map, { x: 4.5, y: 6 }, { x: 19, y: 6 })).toBe(true);
    map.doors[0].held = true;
    expect([solid(map, 9, 6), isWalkable(map, 9.5, 6.5)]).toEqual([true, false]);
    expect(lineOfSight(map, { x: 4.5, y: 6 }, { x: 19, y: 6 })).toBe(false);
  });

  it('a door held while the hero stands still cuts the sight through it (the fog works it out again)', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }));
    run(w, STEP);
    expect(w.fog[6 * w.width + 13]).toBe(2);
    w.map.doors[1].held = true;
    run(w, bal.ai.fogEvery);
    expect(w.fog[6 * w.width + 13]).toBe(1);
  });

  it('the hero walks into a held door and stops', () => {
    const w = floorWorld(twoRooms('combat'));
    w.map.doors[0].held = true;
    run(w, 2, { x: 1, y: 0 });
    expect(w.hero.x).toBeLessThanOrEqual(9 - w.hero.radius + 1e-9);
  });

  it("a seal's opening never lets a held door go", () => {
    const w = floorWorld(twoRooms('den'), [dummy(22, 3, { roomId: 1, aggro: true })]);
    Object.assign(w.hero, { x: 16, y: 6 });
    w.map.doors[1].held = true;
    run(w, STEP);
    expect(w.map.rooms[1].sealed).toBe(true);
    killMonster(makeCtx(registry, w, []), w.monsters[0]);
    run(w, STEP);
    expect([w.map.rooms[1].sealed, w.map.doors[1].closed, w.map.doors[1].held]).toEqual([
      false,
      false,
      true,
    ]);
    expect(solid(w.map, 11, 6)).toBe(true);
  });
});
