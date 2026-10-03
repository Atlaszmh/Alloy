import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { exitFloor } from '../src/arpg/interact.js';
import type { ArpgEvent, ArpgWorld, Drop } from '../src/types/arpg.js';
import { bal, dummy, registry } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';

// The floor flow (see the floor maps spec's "Interacting, special rooms and the exit").

const of = <K extends ArpgEvent['kind']>(events: ArpgEvent[], kind: K) =>
  events.filter((e): e is Extract<ArpgEvent, { kind: K }> => e.kind === kind);

describe("a room's last foe", () => {
  const loot = (w: ArpgWorld, roomId?: number): Drop => {
    const d: Drop = {
      id: w.nextId++,
      kind: 'scrap',
      x: 20,
      y: 8,
      amount: 1,
      born: 0,
      vacuum: false,
      dead: false,
      roomId,
    };
    w.drops.push(d);
    return d;
  };

  it("clears its room (roomCleared) and pulls in its foes' drops, no other", () => {
    const w = floorWorld(twoRooms('combat'), [
      dummy(16, 3, { roomId: 1 }),
      dummy(22, 3, { roomId: 1 }),
    ]);
    const [mine, hall] = [loot(w, 1), loot(w)];
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    killMonster(ctx, w.monsters[0]);
    expect([w.map.rooms[1].cleared, of(events, 'roomCleared')]).toEqual([false, []]);
    killMonster(ctx, w.monsters[1]);
    expect(of(events, 'roomCleared')).toEqual([{ kind: 'roomCleared', roomId: 1 }]);
    expect(w.map.rooms[1].cleared).toBe(true);
    expect([mine.vacuum, hall.vacuum]).toEqual([true, false]);
  });

  it('pulls nothing in when ai.roomVacuum is off, and a roomless foe clears nothing', () => {
    const w = floorWorld(twoRooms('combat'), [dummy(16, 3, { roomId: 1 }), dummy(5, 3)]);
    const mine = loot(w, 1);
    const events: ArpgEvent[] = [];
    const ctx = {
      ...makeCtx(registry, w, events),
      bal: { ...bal, ai: { ...bal.ai, roomVacuum: false } },
    };
    killMonster(ctx, w.monsters[1]);
    killMonster(ctx, w.monsters[0]);
    expect(of(events, 'roomCleared')).toHaveLength(1);
    expect(mine.vacuum).toBe(false);
  });
});

describe('the exit', () => {
  it('exitFloor takes it: world.exited (the open room ends on cleared instead)', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }));
    expect(w.exited).toBe(false);
    exitFloor(w);
    expect(w.exited).toBe(true);
  });
});
