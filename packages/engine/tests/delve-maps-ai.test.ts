import { describe, it, expect } from 'vitest';
import { dist } from '../src/arpg/geometry.js';
import type { SeededRNG } from '../src/rng/seeded-rng.js';
import { arena, dummy, run } from './fixtures/arena.js';
import { WALL_30, block, onMap } from './fixtures/maps.js';

// Foes on the grid (see the floor maps spec's "Monsters"): they wake on sight,
// path by the flow field, hold beyond it, attack only what they see, and a boss
// keeps to its room. The hero stands at (13, 36).

describe('waking', () => {
  it('a foe near the hero but behind a wall sleeps on; one in sight wakes', () => {
    const w = onMap(
      arena([dummy(13, 29), dummy(10, 34, { packId: 2 })], { noBasic: true }),
      WALL_30,
    );
    run(w, 0.1);
    expect(w.monsters[0].aggro).toBe(false);
    expect(w.monsters[1].aggro).toBe(true);
  });
});

describe('pathing', () => {
  it('a foe goes round a wall by the flow field to reach the hero', () => {
    // Rows 30 and 31 a wall but for a gap at columns 0 to 4.
    const w = onMap(
      arena([dummy(13, 26, { speed: 3, aggro: true })], { noBasic: true }),
      block(5, 30, 25, 31),
    );
    run(w, 10);
    const m = w.monsters[0];
    expect(dist(m.x, m.y, w.hero.x, w.hero.y) - m.radius - w.hero.radius).toBeLessThan(
      m.attackRange,
    );
  });

  it('beyond the field (here: no way through) a foe holds its place', () => {
    const w = onMap(arena([dummy(13, 20, { speed: 3, aggro: true })], { noBasic: true }), WALL_30);
    run(w, 2);
    expect(w.monsters[0]).toMatchObject({ x: 13, y: 20 });
  });
});

describe('attacks', () => {
  it("a melee foe's blow doesn't land through a wall", () => {
    const w = onMap(
      arena([dummy(13, 32.4, { aggro: true, damage: 10, windupUntil: 0.05 })], { noBasic: true }),
      block(0, 33, 25, 33),
    );
    w.hero.y = 34.5;
    run(w, 0.2);
    expect(w.hero.hp).toBe(w.hero.stats.maxHp);
  });

  it('a ranged foe fires only with sight', () => {
    const fired = (x: number, y: number) => {
      const w = onMap(
        arena([dummy(x, y, { ai: 'ranged', aggro: true, damage: 10 })], { noBasic: true }),
        WALL_30,
      );
      // Its wind-up (0.5 s) over, the shot is in flight.
      run(w, 0.55);
      return w.projectiles.length > 0;
    };
    expect(fired(13, 28)).toBe(false);
    expect(fired(5, 33)).toBe(true);
  });

  it("the boss's slam doesn't reach through a wall", () => {
    const w = onMap(arena([dummy(2, 2)], { noBasic: true }), WALL_30);
    w.hero.y = 32.5;
    w.zones.push({
      ...{ id: 900, owner: 'monster', source: null, ability: null, x: 13, y: 29.5, radius: 2.6 },
      ...{ born: 0, until: 1, tick: 0, nextTick: 0, damage: 50, element: null },
      ...{ detonateAt: 0.05, dead: false },
    });
    run(w, 0.2);
    expect(w.hero.hp).toBe(w.hero.stats.maxHp);
  });
});

describe('the boss', () => {
  it('never leaves its room', () => {
    const w = onMap(
      arena([dummy(7, 10, { kind: 'boss', roomId: 0, speed: 3, aggro: true })], { noBasic: true }),
      [],
    );
    w.map.rooms[0].rect = { x: 2, y: 2, w: 10, h: 10 };
    w.hero.y = 20;
    w.monsters[0].nextSpecialAt = 1e9;
    run(w, 3);
    const m = w.monsters[0];
    expect(m.y).toBeCloseTo(12 - m.radius, 9);
  });

  it('its adds join its room', () => {
    const w = onMap(arena([dummy(7, 10, { kind: 'boss', roomId: 0, aggro: true })]), []);
    // The special's roll picks the adds (2); every other draw its lowest.
    w.rng = {
      nextInt: (a: number, b: number) => (a === 0 && b === 2 ? 2 : a),
      next: () => 0.5,
    } as unknown as SeededRNG;
    run(w, 1 / 30);
    const adds = w.monsters.filter((m) => m.kind === 'normal');
    expect(adds.length).toBe(2);
    for (const a of adds) expect(a.roomId).toBe(0);
  });
});
