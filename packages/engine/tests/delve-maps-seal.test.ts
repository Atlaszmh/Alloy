import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { RoomKind } from '../src/types/floor-map.js';
import { bal, dummy, registry, run, STEP } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';

// Sealed rooms (see the floor maps spec's "Sealed rooms"): room 1's one door is door 1 (x 11–12).

const kinds = (events: ArpgEvent[]) =>
  events.filter((e) => e.kind === 'seal' || e.kind === 'unseal');

/** The hero at (hx, 6) in room 1 of `kind`, with an awake foe of the room and any `others`. */
function den(hx = 16, kind: RoomKind = 'den', others = [] as ReturnType<typeof dummy>[]) {
  const w = floorWorld(twoRooms(kind), [dummy(22, 3, { roomId: 1, aggro: true }), ...others]);
  Object.assign(w.hero, { x: hx, y: 6 });
  return w;
}

describe('a sealed room', () => {
  it('seals a den once the hero stands in it with a foe of it awake: nothing passes its door', () => {
    const w = den();
    expect(kinds(run(w, STEP))).toEqual([{ kind: 'seal', roomId: 1 }]);
    expect([w.map.rooms[1].sealed, w.map.doors.map((d) => d.closed)]).toEqual([
      true,
      [false, true],
    ]);
    expect(w.sealing).toBeNull();
    run(w, 2, { x: -1, y: 0 });
    expect(w.hero.x).toBeGreaterThanOrEqual(13 + w.hero.radius - 1e-9);
  });

  it("doesn't seal while its foes sleep, nor a combat room", () => {
    const asleep = den(14); // beyond monster.aggroRadius of its foe
    asleep.monsters[0].aggro = false;
    const combat = den(16, 'combat');
    expect([...kinds(run(asleep, 0.5)), ...kinds(run(combat, 0.5))]).toEqual([]);
    expect(asleep.map.doors.some((d) => d.closed) || combat.map.doors.some((d) => d.closed)).toBe(
      false,
    );
  });

  it('brings in its foes from outside', () => {
    const w = den(16, 'den', [dummy(4, 3, { roomId: 1 })]);
    run(w, STEP);
    const m = w.monsters[1];
    expect(m.x >= 13 && m.x < 25 && m.y >= 1 && m.y < 11).toBe(true);
  });

  it('a door waits while the hero stands in it, nudging the hero in', () => {
    const w = den(13.2);
    expect(kinds(run(w, STEP))).toEqual([]);
    expect(w.sealing).toMatchObject({ roomId: 1 });
    expect(w.hero.x).toBeGreaterThan(13.2 + 0.4);
    expect(kinds(run(w, STEP))).toEqual([{ kind: 'seal', roomId: 1 }]);
  });

  it('after ai.sealGrace, whoever still stands in the door is put out on its side and it closes', () => {
    const w = den(16, 'den', [dummy(12.5, 6, { roomId: null })]);
    run(w, bal.ai.sealGrace - 2 * STEP);
    expect(w.map.rooms[1].sealed).toBe(false);
    expect(kinds(run(w, 3 * STEP))).toEqual([{ kind: 'seal', roomId: 1 }]);
    expect(w.monsters[1].x).toBeLessThanOrEqual(11 - w.monsters[1].radius);
  });

  it("after ai.sealGrace, the den's own foe in the door goes inside, never shut out", () => {
    const w = den(16, 'den', [dummy(12.5, 6, { roomId: null }), dummy(20, 8, { roomId: 1 })]);
    run(w, STEP);
    Object.assign(w.monsters[2], { x: 12.4, y: 6 }); // its centre outside the room's floor
    run(w, bal.ai.sealGrace);
    expect(w.map.rooms[1].sealed).toBe(true);
    expect(w.monsters[1].x).toBeLessThanOrEqual(11 - w.monsters[1].radius);
    expect(w.monsters[2].x).toBeGreaterThanOrEqual(13);
  });

  it('a hero who walks out before it shuts ends the sealing, its door open', () => {
    const w = den(16, 'den', [dummy(12.5, 6, { roomId: null })]);
    run(w, STEP);
    expect(w.sealing).not.toBeNull();
    Object.assign(w.hero, { x: 5, y: 6 });
    run(w, STEP);
    expect([w.sealing, w.map.doors[1].closed, w.map.rooms[1].sealed]).toEqual([null, false, false]);
  });

  it('opens when its last foe dies (unseal)', () => {
    const w = den();
    run(w, STEP);
    killMonster(makeCtx(registry, w, []), w.monsters[0]);
    expect(kinds(run(w, STEP))).toEqual([{ kind: 'unseal', roomId: 1 }]);
    expect([w.map.rooms[1].sealed, w.map.doors[1].closed]).toEqual([false, false]);
    expect(kinds(run(w, 0.5))).toEqual([]);
  });
});
