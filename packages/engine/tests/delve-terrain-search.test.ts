import { describe, it, expect } from 'vitest';
import { makeCtx } from '../src/arpg/combat.js';
import { terrainTick } from '../src/arpg/terrain.js';
import type { ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import { CELL } from '../src/types/floor-map.js';
import { arena, bal, dummy, registry, run } from './fixtures/arena.js';
import { floorWorld } from './fixtures/flow-map.js';
import { block, walledMap } from './fixtures/maps.js';

// See the room objects spec's "Foliage": only foliage sheds aggro. A pack that loses the hero to
// foliage goes to where it last saw it and searches `searchTime`; if no member perceives the hero
// by then, it walks home and sleeps there as after a leash. Any member perceiving the hero again
// takes the chase up again. Walls and cover shed nothing.

const { searchTime } = bal.terrain;

/** A pack of two awake foes of room 0, hurt, at (8, 6) and (8, 7.5). */
const PACK: Partial<MonsterEntity>[] = [
  dummy(8, 6, { roomId: 0, packId: 1, aggro: true, speed: 2, hp: 500 }),
  dummy(8, 7.5, { roomId: 0, packId: 1, aggro: true, speed: 2, hp: 500 }),
];

/**
 * A 24 × 12 room (room 0, its centre (12, 6)) with a patch of foliage at x 18–22, y 3–9 and
 * these walls; the hero outside it at (14.5, 6.5); `tick(t)` runs `terrainTick` at time t.
 */
function hideout(walls: [number, number][] = [], foes = PACK) {
  const map = walledMap(24, 12, walls);
  for (const [x, y] of block(18, 3, 22, 9)) map.cells[y * 24 + x] = CELL.foliage;
  map.start = { x: 14.5, y: 6.5 };
  const w = floorWorld(map, foes);
  const tick = (t: number) => {
    w.t = t;
    terrainTick(makeCtx(registry, w, []));
  };
  return { w, tick, hide: () => Object.assign(w.hero, { x: 20.5, y: 6.5 }) };
}

const searches = (w: ArpgWorld) => w.monsters.map((m) => m.search);

describe('a pack losing the hero to foliage', () => {
  it('searches where it last saw the hero, for searchTime', () => {
    const { w, tick, hide } = hideout();
    tick(1);
    expect(searches(w)).toEqual([null, null]);
    hide();
    tick(1.1);
    const search = { at: { x: 14.5, y: 6.5 }, until: 1.1 + searchTime };
    expect(searches(w)).toEqual([search, search]);
    expect(w.monsters.map((m) => m.goal)).toEqual([search.at, search.at]);
    // The hero moving on, unseen, doesn't move the search.
    w.hero.y = 4.5;
    tick(2);
    expect(searches(w)).toEqual([search, search]);
  });

  it('takes the chase up again when any member perceives the hero', () => {
    const { w, tick, hide } = hideout();
    tick(1);
    hide();
    tick(1.1);
    w.monsters[1].x = 18.5;
    tick(1.2);
    expect(searches(w)).toEqual([null, null]);
    expect(w.monsters.map((m) => [m.goal, m.aggro, m.goingHome])).toEqual([
      [null, true, false],
      [null, true, false],
    ]);
  });

  it('gives up at its end: the pack walks home, and sleeps there healed', () => {
    const { w, tick, hide } = hideout();
    tick(1);
    hide();
    tick(1.1);
    tick(1.1 + searchTime - 0.01);
    expect(w.monsters.every((m) => m.search && !m.goingHome)).toBe(true);
    tick(1.1 + searchTime);
    expect(w.monsters.map((m) => [m.search, m.goal, m.goingHome])).toEqual([
      [null, null, true],
      [null, null, true],
    ]);
    run(w, 4);
    for (const m of w.monsters) {
      expect([m.aggro, m.goingHome, m.hp]).toEqual([false, false, m.maxHp]);
      expect(Math.hypot(m.x - 12, m.y - 6)).toBeLessThanOrEqual(1);
    }
  });
});

describe('only foliage sheds aggro', () => {
  it('a pack that loses the hero behind a wall keeps after it', () => {
    const { w } = hideout(block(14, 0, 14, 11));
    Object.assign(w.hero, { x: 16.5, y: 6.5 });
    run(w, searchTime + 1);
    expect(w.monsters.map((m) => [m.search, m.aggro, m.goingHome])).toEqual([
      [null, true, false],
      [null, true, false],
    ]);
  });

  it("a boss's pack and the open room never search", () => {
    const boss = [{ ...PACK[0], kind: 'boss' as const, nextSpecialAt: 1e9 }, PACK[1]];
    const { w, tick, hide } = hideout([], boss);
    tick(1);
    hide();
    tick(1.1);
    expect(searches(w)).toEqual([null, null]);
    const open = arena(PACK);
    for (const [x, y] of block(18, 3, 22, 9)) open.map.cells[y * open.width + x] = CELL.foliage;
    Object.assign(open.hero, { x: 20.5, y: 6.5 });
    terrainTick(makeCtx(registry, open, []));
    expect(searches(open)).toEqual([null, null]);
  });
});
