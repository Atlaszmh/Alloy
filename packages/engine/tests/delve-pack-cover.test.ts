import { describe, it, expect } from 'vitest';
import { dist } from '../src/arpg/geometry.js';
import { perceives } from '../src/arpg/grid.js';
import { CELL } from '../src/types/floor-map.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { bal } from './fixtures/arena.js';
import { ON, packFloor, pass, runWith, withPack } from './fixtures/pack.js';

// Ranged foes use cover (see the room objects spec's "Smarter packs"): the hero mid-room at
// (13, 20), a cover pillar at x 13, y 14–15 north of it and a block at (18, 14), a ranged foe
// at (16, 12).

/** The floor, with the cover unless `bare`. */
function covered(bare = false): ArpgWorld {
  const w = packFloor([{ x: 16, y: 12, ai: 'ranged', damage: 10 }]);
  w.hero.y = 20;
  if (!bare)
    for (const [x, y] of [
      [13, 14],
      [13, 15],
      [18, 14],
    ])
      w.map.cells[y * w.map.width + x] = CELL.cover;
  return w;
}

describe('a ranged foe in cover', () => {
  it('takes the nearest cell beside cover that sees the hero, in range and out of its reach', () => {
    const w = covered();
    pass(w);
    const m = w.monsters[0];
    expect(m.job).toBe('cover');
    // Four steps away, beside the pillar's lower cell; (13, 16), below it, is seven.
    expect(m.goal).toEqual({ x: 14.5, y: 14.5 });
    const d = dist(m.goal!.x, m.goal!.y, w.hero.x, w.hero.y);
    expect(d).toBeGreaterThan(bal.ai.pack.cover.coverFlee);
    expect(d).toBeLessThanOrEqual(7);
    expect(perceives(w.map, m.goal!, w.hero)).toBe(true);
  });

  it('steps behind the cover between volleys, and back out before the next', () => {
    const w = covered();
    const m = w.monsters[0];
    m.nextAttackAt = w.t + 2;
    pass(w);
    expect(m.goal).toEqual({ x: 14.5, y: 13.5 });
    expect(perceives(w.map, m.goal!, w.hero)).toBe(false);
    m.nextAttackAt = w.t + 0.5;
    pass(w);
    expect(m.goal).toEqual({ x: 14.5, y: 14.5 });
  });

  it('fights from there: it goes, fires and hides', () => {
    const w = covered();
    const m = w.monsters[0];
    const near = (x: number, y: number) => dist(m.x, m.y, x, y) < 0.6;
    let fired = false;
    let hid = false;
    for (let i = 0; i < 24; i++) {
      runWith(ON, w, 0.25);
      fired ||= w.hero.hp < w.hero.stats.maxHp;
      hid ||= near(14.5, 13.5);
    }
    expect(fired && hid).toBe(true);
    expect(near(14.5, 13.5) || near(14.5, 14.5)).toBe(true);
  });

  it('moves on when the hero comes within coverFlee', () => {
    const w = covered();
    pass(w);
    w.hero.x = 14;
    w.hero.y = 17;
    pass(w);
    const m = w.monsters[0];
    expect(m.goal).not.toEqual({ x: 14.5, y: 14.5 });
    expect(dist(m.goal!.x, m.goal!.y, w.hero.x, w.hero.y)).toBeGreaterThan(
      bal.ai.pack.cover.coverFlee,
    );
  });

  it('with no cover in reach, or the switch off, has no job and fights as before', () => {
    const bare = covered(true);
    pass(bare);
    const off = covered();
    pass(off, withPack({ cover: { ...bal.ai.pack.cover, on: false } }));
    expect([bare.monsters[0].job, off.monsters[0].job]).toEqual([null, null]);
    expect([bare.monsters[0].goal, off.monsters[0].goal]).toEqual([null, null]);
  });
});
