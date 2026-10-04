import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { CELL } from '../src/types/floor-map.js';
import { arena, bal, dummy, registry, run, STEP } from './fixtures/arena.js';
import { block, walledMap } from './fixtures/maps.js';

// See the room objects spec's "Wall slam": a knocked-back foe that meets cover or a wall during
// that knockback takes `slamDamage` × the knockback's hit and `slamStagger`, once a knockback.
// The balance ships both at 0 (the slam off) until the pacing pass turns it on: these tests set
// the spec's numbers on this file's registry.

const SHIPPED = { ...bal.terrain };
const slamDamage = 0.5;
const slamStagger = 0.6;
beforeEach(() => Object.assign(bal.terrain, { slamDamage, slamStagger }));
afterEach(() => Object.assign(bal.terrain, SHIPPED));

/**
 * The fixture's world (26 × 40) on a map with column 3 of `code`, a sturdy foe at (5.5, 20);
 * `knock` hits it for 100 with a knockback from `from` (its right: toward the column).
 */
function slammer(code: number = CELL.wall, open = false) {
  const w = arena([dummy(5.5, 20)], { noBasic: true });
  if (!open) {
    w.map = walledMap(w.width, w.height, []);
    for (const [x, y] of block(3, 0, 3, 39)) w.map.cells[y * w.width + x] = code;
  }
  const m = w.monsters[0];
  const knock = (from = { x: 9, y: 20 }) =>
    hitMonster(makeCtx(registry, w, []), m, 100, null, {
      source: 'skill',
      knockback: 2,
      kbFrom: from,
    });
  return { w, m, knock };
}

const slams = (events: ArpgEvent[]) => events.filter((e) => e.kind === 'wallSlam');

describe('a wall slam', () => {
  for (const [name, code] of [
    ['a wall', CELL.wall],
    ['cover', CELL.cover],
  ] as const)
    it(`a foe knocked into ${name} takes slamDamage × the knockback's hit and slamStagger, once`, () => {
      const { w, m, knock } = slammer(code);
      const hit = knock();
      expect(m.kbHit).toBe(hit);
      const hp = m.hp;
      const events: ArpgEvent[] = [];
      let at = -1;
      for (let i = 0; i < 15; i++) {
        const step = run(w, STEP);
        if (at < 0 && slams(step).length) at = w.t;
        events.push(...step);
      }
      expect(slams(events)).toEqual([{ kind: 'wallSlam', id: m.id, x: m.x, y: m.y }]);
      expect(m.x).toBeCloseTo(4 + m.radius, 6);
      const dealt = events.filter((e) => e.kind === 'hit' && e.id === m.id);
      expect(dealt).toEqual([
        expect.objectContaining({ amount: hit * slamDamage, element: null, source: 'reaction' }),
      ]);
      expect(hp - m.hp).toBeCloseTo(hit * slamDamage, 6);
      expect(m.status.staggerUntil).toBeCloseTo(at + slamStagger, 9);
      expect(m.kbHit).toBe(0);
    });

  it('a knockback that meets nothing slams nothing, and keeps its hit', () => {
    const { w, m, knock } = slammer();
    const hit = knock({ x: 3.5, y: 20 });
    expect(slams(run(w, 0.5))).toEqual([]);
    expect(m.kbHit).toBe(hit);
  });

  it('a new knockback slams again', () => {
    const { w, knock } = slammer();
    knock();
    expect(slams(run(w, 0.5))).toHaveLength(1);
    knock();
    expect(slams(run(w, 0.5))).toHaveLength(1);
  });

  it('never in the open room', () => {
    const { w, m, knock } = slammer(CELL.wall, true);
    m.x = m.radius + 0.1;
    knock({ x: 3, y: 20 });
    expect(slams(run(w, 0.5))).toEqual([]);
  });

  it('none at all with both numbers 0, as the balance ships them', () => {
    Object.assign(bal.terrain, SHIPPED);
    expect([SHIPPED.slamDamage, SHIPPED.slamStagger]).toEqual([0, 0]);
    const { w, m, knock } = slammer();
    const hit = knock();
    expect(slams(run(w, 0.5))).toEqual([]);
    expect([m.kbHit, m.status.staggerUntil]).toEqual([hit, 0]);
  });
});
