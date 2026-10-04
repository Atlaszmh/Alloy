import { describe, it, expect } from 'vitest';
import { startPush } from '../src/arpg/action.js';
import { makeCtx } from '../src/arpg/combat.js';
import { bindTerrain, openRoom } from '../src/arpg/grid.js';
import { groundSpeed } from '../src/arpg/terrain.js';
import type { ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import { CELL } from '../src/types/floor-map.js';
import { arena, bal, dodge, dummy, registry, run, STEP } from './fixtures/arena.js';
import { walledMap } from './fixtures/maps.js';

// See the room objects spec's "Slow ground": anyone walking on it moves at `slowMult` × speed
// (the hero's pushes from swings and forms too), a boss at `bossSlowMult`; the dodge, knockback
// and a charger's dash ignore it.

const { slowMult, bossSlowMult } = bal.terrain;

/** The fixture's world (the hero at (13, 36)) on a 26 × 40 map all of slow ground, or plain. */
function ground(slow: boolean, foes: Partial<MonsterEntity>[] = []): ArpgWorld {
  const w = arena(foes, { noBasic: true });
  w.map = walledMap(w.width, w.height, []);
  if (slow) w.map.cells.fill(CELL.slow);
  bindTerrain(w.map, bal.terrain);
  return w;
}

/** How far `body` of `w` moves in `seconds` of `act`'s doing, on slow ground over plain. */
function ratio(act: (w: ArpgWorld) => { x: number; y: number }, seconds: number): number {
  const moved = (slow: boolean) => {
    const w = ground(slow, [dummy(13, 10, { speed: 2 })]);
    const body = act(w);
    const from = { x: body.x, y: body.y };
    run(w, seconds);
    return Math.hypot(body.x - from.x, body.y - from.y);
  };
  const plain = moved(false);
  expect(plain).toBeGreaterThan(0.3);
  return moved(true) / plain;
}

describe('groundSpeed', () => {
  it('is slowMult on slow ground (bossSlowMult for a boss), else 1', () => {
    expect([slowMult, bossSlowMult]).toEqual([0.6, 0.8]);
    const w = ground(false);
    w.map.cells[5 * w.width + 5] = CELL.slow;
    const on = { x: 5.5, y: 5.5 };
    expect([groundSpeed(w, on), groundSpeed(w, on, true)]).toEqual([slowMult, bossSlowMult]);
    expect([groundSpeed(w, { x: 6.5, y: 5.5 }), groundSpeed(w, { x: -1, y: 5 })]).toEqual([1, 1]);
  });

  it('is 1 on a map with no terrain bound, and in the open room', () => {
    const map = walledMap(10, 10, []);
    map.cells.fill(CELL.slow);
    const w = { map } as ArpgWorld;
    expect(groundSpeed(w, { x: 5, y: 5 })).toBe(1);
    const open = openRoom(10, 10);
    bindTerrain(open, bal.terrain);
    expect(groundSpeed({ map: open } as ArpgWorld, { x: 5, y: 5 })).toBe(1);
  });
});

describe('slow ground', () => {
  it("slows the hero's walk", () => {
    const walk = (slow: boolean) => {
      const w = ground(slow);
      run(w, 0.5, { x: 1, y: 0 });
      return w.hero.x - 13;
    };
    expect(walk(true) / walk(false)).toBeCloseTo(slowMult, 6);
  });

  it("slows the hero's pushes: a swing's lunge, a blow's step, a form's step-in", () => {
    const pushed = (w: ArpgWorld) => {
      startPush(makeCtx(registry, w, []), 'step', { x: 1, y: 0 }, 2, 0.2);
      return w.hero;
    };
    expect(ratio(pushed, 0.3)).toBeCloseTo(slowMult, 6);
  });

  it("slows a foe's walk, a boss's less", () => {
    const foe = (boss: boolean) => (w: ArpgWorld) => {
      const m = w.monsters[0];
      Object.assign(m, { ai: 'melee', aggro: true, x: 13, y: 32 });
      if (boss) Object.assign(m, { kind: 'boss', nextSpecialAt: 1e9 });
      return m;
    };
    expect(ratio(foe(false), 0.2)).toBeCloseTo(slowMult, 6);
    expect(ratio(foe(true), 0.2)).toBeCloseTo(bossSlowMult, 6);
  });

  it("never slows the dodge, knockback or a charger's dash", () => {
    const dodged = (w: ArpgWorld) => {
      dodge(w, { x: 1, y: 0 });
      return w.hero;
    };
    const knocked = (w: ArpgWorld) => {
      Object.assign(w.monsters[0], { kbx: 8 });
      return w.monsters[0];
    };
    const dashing = (w: ArpgWorld) => {
      Object.assign(w.monsters[0], {
        ai: 'charger',
        aggro: true,
        chargeUntil: 1e9,
        chargeDir: { x: 0, y: 1 },
        chargeHit: true,
      });
      return w.monsters[0];
    };
    expect(ratio(dodged, 0.2)).toBe(1);
    expect(ratio(knocked, 0.2)).toBe(1);
    expect(ratio(dashing, 0.2)).toBe(1);
  });

  it('every number holds on a map with no slow ground', () => {
    const walk = (bound: boolean) => {
      const w = arena([dummy(13, 30, { speed: 2, aggro: true, ai: 'melee' })], { noBasic: true });
      w.map = walledMap(w.width, w.height, []);
      if (bound) bindTerrain(w.map, bal.terrain);
      startPush(makeCtx(registry, w, []), 'lunge', { x: 1, y: 0 }, 1.5, 0.15);
      run(w, 0.5, { x: 0.3, y: -1 });
      return [w.hero.x, w.hero.y, w.monsters[0].x, w.monsters[0].y];
    };
    expect(walk(true)).toEqual(walk(false));
  });
});
