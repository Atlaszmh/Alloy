import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { isWalkable, lineOfSight } from '../src/arpg/grid.js';
import { arena, dodge, dummy, registry, run } from './fixtures/arena.js';
import { WALL_30, block, onMap } from './fixtures/maps.js';

// Every mover goes through the grid (see the floor maps spec's "Collision"): the
// dodge a slice a tick, knockback, the shoves foes give each other and the hero,
// the magnet; and drops land short of any wall, in their foe's room.

describe('the dodge', () => {
  it('slides on past a pillar a slice a tick, never jumping the corner', () => {
    // A pillar on rows 35 and 36 at column 9, just left of the hero's edge.
    const w = onMap(arena([dummy(2, 2)], { noBasic: true }), block(9, 35, 9, 36));
    w.hero.x = 10.5;
    dodge(w, { x: -1, y: -1 });
    run(w, 0.5);
    // Up and to the left: held at the pillar until its rows are past, then one slice left.
    expect(w.hero.x).toBeLessThan(10.4);
    expect(w.hero.x).toBeGreaterThan(9.9);
    expect(w.hero.y).toBeCloseTo(36 - 3 / Math.SQRT2, 9);
  });
});

describe('foes', () => {
  it('knockback never carries a foe into a wall', () => {
    const w = onMap(arena([dummy(13, 33, { kby: -60 })], { noBasic: true }), WALL_30);
    run(w, 0.1);
    expect(w.monsters[0].y).toBeCloseTo(32 + w.monsters[0].radius, 9);
  });

  it("a boss's shove never presses a foe into a wall", () => {
    const w = onMap(
      arena([dummy(13, 32.5), dummy(13, 33.4, { kind: 'boss', radius: 1.5 })], { noBasic: true }),
      WALL_30,
    );
    w.hero.x = 3;
    run(w, 1 / 30);
    expect(w.monsters[0].y).toBeGreaterThanOrEqual(32 + w.monsters[0].radius - 1e-9);
  });
});

describe('drops', () => {
  it('a mote behind a wall stays; one in sight flies to the hero', () => {
    const w = onMap(arena([dummy(2, 2)], { noBasic: true }), WALL_30);
    w.hero.y = 33;
    w.drops.push(
      ...[29.8, 35].map((y, i) => ({
        ...{ id: 900 + i, kind: 'mote' as const, x: 13, y, mana: 'fire' as const, amount: 1 },
        ...{ born: 0, vacuum: false, dead: false },
      })),
    );
    run(w, 1);
    expect(w.drops.map((d) => d.id)).toEqual([900]);
    expect(w.drops[0].y).toBe(29.8);
  });

  it("drops land short of any wall from their foe, and carry the foe's room", () => {
    for (let seed = 0; seed < 10; seed++) {
      const w = onMap(arena([dummy(13, 32.4, { kind: 'elite', hp: 1, roomId: 3 })]), WALL_30);
      w.lootRng = w.lootRng.fork(`seed:${seed}`);
      const foe = w.monsters[0];
      killMonster(makeCtx(registry, w, []), foe);
      expect(w.drops.length).toBeGreaterThan(1);
      for (const d of w.drops) {
        expect(isWalkable(w.map, d.x, d.y), `${d.kind} ${d.x}, ${d.y}`).toBe(true);
        expect(lineOfSight(w.map, foe, d), `${d.kind} ${d.x}, ${d.y}`).toBe(true);
        expect(d.roomId).toBe(3);
      }
    }
  });
});
