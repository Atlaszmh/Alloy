import { describe, it, expect } from 'vitest';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { arena, dummy, registry } from './fixtures/arena.js';

// The floor maps contract (see the floor maps spec's "Phases and parallel areas"):
// the fields and hooks the areas fill exist from the start, and the open room plays as before.

const diving = () => startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);

describe('the world on a map', () => {
  it("stands on the open room, the hero at its start; the map's fields start empty", () => {
    const w = arena([dummy(13, 20)]);
    expect(w.map.open).toBe(true);
    expect([w.width, w.height]).toEqual([w.map.width, w.map.height]);
    expect([w.hero.x, w.hero.y]).toEqual([w.map.start.x, w.map.start.y]);
    expect(w.fog).toHaveLength(w.width * w.height);
    expect(w.fog.every((c) => c === 2)).toBe(true);
    expect(w).toMatchObject({
      fogVersion: 0,
      exitHinted: false,
      flow: { small: null, large: null },
      sealing: null,
      channel: null,
      exited: false,
    });
    expect(w.monsters[0]).toMatchObject({ roomId: null, farSince: null, goingHome: false });
  });

  it('a dive floor is open too until the generator lands, its packs placed as before', () => {
    const w = beginFloor(registry, diving());
    expect(w.map.open).toBe(true);
    expect(w.monsters.length).toBeGreaterThan(0);
    expect(w.monsters.every((m) => m.roomId === null)).toBe(true);
  });
});
