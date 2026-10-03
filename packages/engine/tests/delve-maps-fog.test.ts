import { describe, it, expect } from 'vitest';
import { hudMapOf } from '../src/arpg/fog.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { arena, bal, dummy, run, STEP } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';

// The fog of war and the minimap (see the floor maps spec): the hero starts at (4.5, 6) in room 0.

const fogAt = (w: ArpgWorld, x: number, y: number) => w.fog[y * w.width + x];

describe('the fog', () => {
  it('shows what the hero sees (floor in sight and the walls beside it) and reveals its room', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }));
    expect(w.fog.every((c) => c === 0)).toBe(true);
    run(w, STEP);
    expect([fogAt(w, 5, 2), fogAt(w, 0, 0)]).toEqual([2, 2]);
    // Down the hall into room 1, but not through its wall.
    expect([fogAt(w, 13, 6), fogAt(w, 14, 2)]).toEqual([2, 0]);
    expect(w.map.rooms.map((r) => r.revealed)).toEqual([true, false]);
    expect(w.fogVersion).toBe(1);
  });

  it('runs on ai.fogEvery marks, and fogVersion moves only when the fog does', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }));
    run(w, STEP);
    expect(w.fogAt).toBeCloseTo(STEP + bal.ai.fogEvery, 9);
    run(w, 1);
    expect(w.fogVersion).toBe(1);
  });

  it('entering a room reveals it whole; what fell out of sight stays seen', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }));
    run(w, STEP);
    Object.assign(w.hero, { x: 23, y: 9 });
    run(w, bal.ai.fogEvery);
    expect(w.map.rooms[1].revealed).toBe(true);
    for (let y = 1; y <= 10; y++)
      for (let x = 13; x <= 24; x++) expect(fogAt(w, x, y)).toBeGreaterThanOrEqual(1);
    expect(fogAt(w, 2, 2)).toBe(1);
    expect(w.fogVersion).toBe(2);
  });

  it('points to an unfound exit once, after ai.exitHintSeconds', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }));
    const before = run(w, bal.ai.exitHintSeconds - 0.5);
    const after = run(w, 1);
    expect(before.filter((e) => e.kind === 'exitHint')).toEqual([]);
    expect(after.filter((e) => e.kind === 'exitHint')).toEqual([{ kind: 'exitHint', x: 19, y: 6 }]);
    expect(run(w, 1).filter((e) => e.kind === 'exitHint')).toEqual([]);
    const found = floorWorld(twoRooms('exit', { kind: 'gate' }));
    Object.assign(found.hero, { x: 19, y: 8 });
    expect(run(found, bal.ai.exitHintSeconds + 1).some((e) => e.kind === 'exitHint')).toBe(false);
  });

  it('the open room is all in sight and never changes', () => {
    const w = arena([dummy(13, 20)]);
    run(w, 1);
    expect([w.fog.every((c) => c === 2), w.fogVersion, w.exitHinted]).toEqual([true, 0, false]);
  });
});

describe('hudMapOf', () => {
  it('draws the revealed rooms, foes in sight and drops in seen cells; the exit once found, the hint before', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }), [dummy(3, 3), dummy(22, 3)]);
    w.drops.push(
      { id: 1, kind: 'scrap', x: 7, y: 9, amount: 1, born: 0, vacuum: false, dead: false },
      { id: 2, kind: 'scrap', x: 22, y: 9, amount: 1, born: 0, vacuum: false, dead: false },
    );
    run(w, STEP);
    w.exitHinted = true;
    expect(hudMapOf(w)).toEqual({
      width: 26,
      height: 12,
      rooms: [
        {
          id: 0,
          kind: 'start',
          rect: { x: 1, y: 1, w: 8, h: 10 },
          icon: null,
          used: false,
          cleared: false,
          sealed: false,
        },
      ],
      exit: null,
      hint: { x: 19, y: 6 },
      foes: [{ x: w.monsters[0].x, y: w.monsters[0].y, kind: 'normal' }],
      drops: [{ x: 7, y: 9, kind: 'scrap' }],
      explored: 1,
      total: 2,
      fogVersion: 1,
    });
    Object.assign(w.hero, { x: 19, y: 8 });
    run(w, bal.ai.fogEvery);
    const map = hudMapOf(w);
    expect(map.rooms.map((r) => [r.id, r.icon])).toEqual([
      [0, null],
      [1, 'gate'],
    ]);
    expect([map.exit, map.hint, map.explored]).toEqual([{ x: 19, y: 6 }, null, 2]);
  });

  it('marks a den and the boss room with a skull, and a used interactable', () => {
    const w = floorWorld(twoRooms('den'));
    w.map.rooms[0].interactable = { id: '2:0', kind: 'chest', x: 4, y: 4, used: true };
    w.map.rooms.forEach((r) => (r.revealed = true));
    expect(hudMapOf(w).rooms.map((r) => [r.icon, r.used])).toEqual([
      ['chest', true],
      ['skull', false],
    ]);
  });

  it('on the open room: its one room, every foe, no exit', () => {
    const w = arena([dummy(13, 20)]);
    const map = hudMapOf(w);
    expect([map.rooms.length, map.foes.length, map.exit, map.explored, map.total]).toEqual([
      1,
      1,
      null,
      1,
      1,
    ]);
  });
});
