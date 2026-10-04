import { describe, it, expect } from 'vitest';
import { dist } from '../src/arpg/geometry.js';
import type { HazardEntity, PropEntity } from '../src/types/arpg.js';
import { arena, dodge, dummy, run, STEP } from './fixtures/arena.js';

// See the room objects spec: props and hazards are fixed circles. Bodies are pushed out of them as
// from a fixed dummy and they never budge; the dodge and a charger's dash pass through them.

const crate = (x: number, y: number): PropEntity => ({
  type: 'prop',
  id: 1,
  kind: 'crate',
  x,
  y,
  radius: 0.4,
  life: 99,
  dead: false,
});
// Dormant for good: a body that never bursts.
const brazier = (x: number, y: number): HazardEntity => ({
  type: 'hazard',
  id: 2,
  kind: 'brazier',
  element: 'fire',
  x,
  y,
  radius: 0.4,
  burst: 2.5,
  state: 'dormant',
  until: 1e9,
});

describe('fixed circles', () => {
  it('the hero walks up to a prop and stops at its edge; the prop stays put', () => {
    const w = arena([], { noBasic: true });
    w.props = [crate(13, 33)];
    run(w, 1.5, { x: 0, y: -1 });
    expect(w.hero.x).toBe(13);
    expect(w.hero.y).toBeCloseTo(33 + 0.4 + w.hero.radius, 6);
    expect([w.props[0].x, w.props[0].y]).toEqual([13, 33]);
  });

  it('a foe walking at the hero is held out of a hazard in its way, every tick', () => {
    const w = arena([dummy(13, 30, { speed: 2.6, aggro: true })], { noBasic: true });
    w.hazards = [brazier(13, 33)];
    const m = w.monsters[0];
    for (let i = 0; i < 45; i++) {
      run(w, STEP);
      expect(dist(m.x, m.y, 13, 33)).toBeGreaterThanOrEqual(0.4 + m.radius - 1e-9);
    }
    expect(m.y).toBeGreaterThan(31);
  });
});

describe('passing through', () => {
  it('the dodge passes through a prop', () => {
    const w = arena([], { noBasic: true });
    w.props = [crate(13, 34.4)];
    dodge(w, { x: 0, y: -1 });
    run(w, 0.3);
    expect(w.hero.y).toBeLessThan(34.4 - 0.4 - w.hero.radius);
  });

  it("a charger's dash passes through a hazard; once it ends, the hazard pushes it out (here frozen where it stopped)", () => {
    const w = arena([dummy(13, 20, { speed: 2.6, aggro: true })], { noBasic: true });
    w.hazards = [brazier(13, 22)];
    const m = w.monsters[0];
    Object.assign(m, {
      ai: 'charger',
      chargeUntil: 1e9,
      chargeDir: { x: 0, y: 1 },
      chargeHit: true,
    });
    run(w, 0.3);
    expect(m.y).toBeGreaterThan(22);
    expect(dist(m.x, m.y, 13, 22)).toBeLessThan(0.4 + m.radius);
    Object.assign(m, { chargeUntil: 0 });
    m.status.freezeUntil = 1e9;
    run(w, STEP);
    expect(dist(m.x, m.y, 13, 22)).toBeGreaterThanOrEqual(0.4 + m.radius - 1e-9);
  });
});
