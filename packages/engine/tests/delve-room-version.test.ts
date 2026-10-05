import { describe, it, expect } from 'vitest';
import { botInput } from '../src/arpg/bot.js';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { setDoor } from '../src/arpg/grid.js';
import { CELL } from '../src/types/floor-map.js';
import { bal, dummy, registry, run, STEP } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';
import { walledMap } from './fixtures/maps.js';

// See the room objects spec: `FloorMap.version` bumps whenever a cell changes (a crumble) or a
// door opens or shuts, and what caches the map's cells or doors keys on it.

describe('FloorMap.version', () => {
  it('bumps when a door opens or shuts, by the seal or held, and only then', () => {
    const map = twoRooms('combat');
    const d = map.doors[0];
    setDoor(map, d, 'held', true);
    expect([d.held, map.version]).toEqual([true, 1]);
    setDoor(map, d, 'held', true);
    setDoor(map, d, 'closed', true);
    expect(map.version).toBe(1);
    setDoor(map, d, 'held', false);
    expect(map.version).toBe(1);
    setDoor(map, d, 'closed', false);
    expect([d.closed, map.version]).toEqual([false, 2]);
  });

  it("a den's seal bumps it as its door shuts, and again as it opens", () => {
    const w = floorWorld(twoRooms('den'), [dummy(22, 3, { roomId: 1, aggro: true })]);
    Object.assign(w.hero, { x: 16, y: 6 });
    run(w, STEP);
    expect([w.map.rooms[1].sealed, w.map.version]).toEqual([true, 1]);
    killMonster(makeCtx(registry, w, []), w.monsters[0]);
    run(w, STEP);
    expect([w.map.rooms[1].sealed, w.map.version]).toEqual([false, 2]);
  });

  it('the fog works sight out again when it moves, though the hero and the doors stand still', () => {
    const map = walledMap(12, 12, []);
    for (let y = 0; y < 12; y++) map.cells[y * 12 + 6] = CELL.cover;
    map.start = { x: 3.5, y: 6.5 };
    const w = floorWorld(map);
    run(w, STEP);
    expect(w.fog[6 * 12 + 9]).toBe(0);
    // The cover crumbles to slow ground: unseen until the version says so.
    for (let y = 0; y < 12; y++) map.cells[y * 12 + 6] = CELL.slow;
    run(w, 2 * bal.ai.fogEvery);
    expect(w.fog[6 * 12 + 9]).toBe(0);
    map.version++;
    run(w, 2 * bal.ai.fogEvery);
    expect(w.fog[6 * 12 + 9]).toBe(2);
  });

  it("the bot's paths follow it", () => {
    const map = twoRooms('exit', { kind: 'gate' });
    map.rooms[0].revealed = true;
    const w = floorWorld(map);
    const hall = map.doors.flatMap((d) => d.cells.map((c) => c.y * map.width + c.x));
    for (const i of hall) map.cells[i] = CELL.cover;
    expect(botInput(registry, w).move).toEqual({ x: 0, y: 0 });
    for (const i of hall) map.cells[i] = CELL.door;
    expect(botInput(registry, w).move).toEqual({ x: 0, y: 0 });
    map.version++;
    expect(botInput(registry, w).move.x).toBeGreaterThan(0);
  });
});
