import { describe, it, expect } from 'vitest';
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import { flowField } from '../src/arpg/flow.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { arena, bal, dummy, registry, run } from './fixtures/arena.js';
import { onMap } from './fixtures/maps.js';

// The leash (see the floor maps spec's "Leash"): a foe kept far from its room's
// centre turns home, heals and sleeps there; the open room has none.

/** Room 0 the 8 × 8 cells at (2, 2), centred on (6, 6), with its home field. */
function homeRoom(w: ArpgWorld): ArpgWorld {
  const room = w.map.rooms[0];
  room.rect = { x: 2, y: 2, w: 8, h: 8 };
  room.homeField = flowField(w.map, { x: 6, y: 6 }, 999, 1);
  return w;
}

/** A hurt, awake foe of room 0, 16 units from its centre and chasing the hero. */
const stray = () => dummy(6, 22, { roomId: 0, speed: 3, aggro: true, aggroAt: 0.5, hp: 300 });

describe('the leash', () => {
  it('a foe kept past its leash turns home, then heals and sleeps there', () => {
    const w = homeRoom(onMap(arena([stray()], { noBasic: true }), []));
    const m = w.monsters[0];
    run(w, bal.ai.leashSeconds - 0.2);
    expect(m.farSince).not.toBeNull();
    expect(m.goingHome).toBe(false);
    run(w, 0.4);
    expect(m.goingHome).toBe(true);
    run(w, 8);
    expect(m.goingHome).toBe(false);
    expect(m.aggro).toBe(false);
    expect(m.aggroAt).toBe(0);
    expect(m.farSince).toBeNull();
    expect(m.hp).toBe(m.maxHp);
    // A step from the bottom of its home field.
    const cell = Math.floor(m.y) * w.width + Math.floor(m.x);
    expect(w.map.rooms[0].homeField![cell]).toBeLessThanOrEqual(1);
  });

  it('a foe walking home that is hit turns back on the hero, its leash counted again', () => {
    const w = homeRoom(onMap(arena([stray()], { noBasic: true }), []));
    const m = w.monsters[0];
    run(w, bal.ai.leashSeconds + 0.2);
    expect(m.goingHome).toBe(true);
    hitMonster(makeCtx(registry, w, []), m, 10, null, { source: 'skill' });
    expect(m).toMatchObject({ goingHome: false, farSince: null, aggro: true });
    run(w, 0.5);
    expect(m.goingHome).toBe(false);
    expect(m.farSince).not.toBeNull();
  });

  it('coming back within it starts the count again', () => {
    const w = homeRoom(onMap(arena([stray()], { noBasic: true }), []));
    const m = w.monsters[0];
    run(w, 1);
    expect(m.farSince).not.toBeNull();
    m.y = 8;
    run(w, 1 / 30);
    expect(m.farSince).toBeNull();
  });

  it('the open room has none', () => {
    const w = homeRoom(arena([stray()], { noBasic: true }));
    run(w, bal.ai.leashSeconds + 1);
    expect(w.monsters[0]).toMatchObject({ goingHome: false, farSince: null, aggro: true });
  });
});
