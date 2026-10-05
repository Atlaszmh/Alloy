import { describe, it, expect } from 'vitest';
import type { ArpgWorld } from '../src/types/arpg.js';
import { arena, bal, dummy, run } from './fixtures/arena.js';
import { onMap } from './fixtures/maps.js';

// See the room objects spec's "The leash": measured from the room's rect, so a pack anywhere
// inside its room (the arena included) never leashes. A foe leashes only past `leashMargin`
// outside the rect, however near its centre.

const { leashMargin } = bal.terrain;
const { leashSeconds } = bal.ai;

/** Room 0 an arena-sized room, 26 × 22 cells at (0, 2), centred on (13, 13); an awake foe at (x, y). */
function arenaRoom(x: number, y: number): ArpgWorld {
  const w = onMap(
    arena([dummy(x, y, { roomId: 0, aggro: true, aggroAt: 0.5 })], { noBasic: true }),
    [],
  );
  w.map.rooms[0].rect = { x: 0, y: 2, w: 26, h: 22 };
  return w;
}

describe('the leash, from the room', () => {
  it('never leashes a foe anywhere inside its room, however far from its centre', () => {
    // In its corner, 16 from its centre.
    const w = arenaRoom(0.6, 23.4);
    run(w, leashSeconds + 1);
    expect(w.monsters[0]).toMatchObject({ farSince: null, goingHome: false, aggro: true });
  });

  it('leashes one past leashMargin outside it', () => {
    const w = arenaRoom(13, 24 + leashMargin + 0.5);
    const m = w.monsters[0];
    run(w, leashSeconds - 0.2);
    expect([m.farSince !== null, m.goingHome]).toEqual([true, false]);
    run(w, 0.4);
    expect(m.goingHome).toBe(true);
  });

  it('keeps one outside it but within leashMargin of its edge', () => {
    expect(leashMargin).toBeGreaterThan(0.5);
    const w = arenaRoom(13, 24 + leashMargin - 0.5);
    const m = w.monsters[0];
    run(w, leashSeconds + 1);
    expect(m).toMatchObject({ farSince: null, goingHome: false });
  });
});
