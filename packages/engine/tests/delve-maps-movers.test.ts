import { describe, it, expect } from 'vitest';
import { isWalkable, openRoom } from '../src/arpg/grid.js';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { arena, dodge, dummy, registry, run } from './fixtures/arena.js';

// The arena's rectangle clamps go through the grid (see the floor maps spec's
// "Movement and combat on the grid"): in the open room nothing changes; a wall
// now holds. The rest of the movers and every hit site are B2's.

/** The fixture's world with walls at these cells (its open room otherwise). */
function walled(w: ArpgWorld, cells: [number, number][]): ArpgWorld {
  w.map = openRoom(w.width, w.height);
  for (const [x, y] of cells) w.map.cells[y * w.width + x] = 1;
  return w;
}
/** Row 30 a wall from side to side: the hero starts below it, at (13, 36). */
const ROW_30 = Array.from({ length: 26 }, (_, x) => [x, 30] as [number, number]);

describe('the clamps on the grid', () => {
  it('a wall stops the walk and the dodge', () => {
    const w = walled(arena([dummy(2, 2)], { noBasic: true }), ROW_30);
    run(w, 3, { x: 0, y: -1 });
    expect(w.hero.y).toBeCloseTo(31 + w.hero.radius, 9);
    w.hero.y = 32;
    dodge(w, { x: 0, y: -1 });
    run(w, 0.5);
    expect(w.hero.y).toBeCloseTo(31 + w.hero.radius, 9);
  });

  it('a foe pressed into a wall is put back out', () => {
    const w = walled(arena([dummy(13, 29.8)], { noBasic: true }), ROW_30);
    run(w, 0.1);
    expect(w.monsters[0].y).toBeCloseTo(30 - w.monsters[0].radius, 9);
  });

  it('a shot ends in a wall', () => {
    const w = walled(arena([dummy(2, 2)], { noBasic: true }), ROW_30);
    spawnProjectile(makeCtx(registry, w, []), {
      ...{ owner: 'monster', form: null, ability: null, homingId: null, x: 13, y: 33 },
      ...{ vx: 0, vy: -8, radius: 0.3, damage: 1, element: null, pierce: false, maxDist: 20 },
      ...{ explodeRadius: 0, applies: [], knockback: 0 },
    });
    run(w, 0.5);
    expect(w.projectiles).toEqual([]);
  });

  it("a foe's loot lands on a walkable cell, even when it falls in a pocket", () => {
    // A nook three cells tall, (13, 18) to (13, 20), walled all round.
    const pocket: [number, number][] = [];
    for (let y = 17; y <= 23; y++)
      for (let x = 10; x <= 16; x++)
        if (!(x === 13 && (y === 20 || y === 19 || y === 18))) pocket.push([x, y]);
    const w = walled(arena([dummy(13.5, 20.5, { kind: 'elite', hp: 1 })]), pocket);
    killMonster(makeCtx(registry, w, []), w.monsters[0]);
    const placed = w.drops.filter((d) => d.kind !== 'mote' && d.kind !== 'orb');
    expect(placed.length).toBeGreaterThan(0);
    for (const d of placed)
      expect(isWalkable(w.map, d.x, d.y), `${d.kind} ${d.x}, ${d.y}`).toBe(true);
  });
});
