import { describe, it, expect } from 'vitest';
import { PX, dustCount, hash, ringPoints, snap } from '../mana-pixels';

describe('mana pixels', () => {
  it('snaps to the 0.1-unit pixel grid', () => {
    expect(snap(1.234)).toBeCloseTo(1.2);
    expect(snap(-0.05)).toBeCloseTo(-0.1);
    expect(snap(3)).toBeCloseTo(3);
  });

  it('puts ring pixels on the circle, one per pixel of circumference', () => {
    const pts = ringPoints(5, 5, 2);
    expect(pts.length).toBe(Math.round((2 * Math.PI * 2) / PX));
    for (const p of pts) expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(2, 1);
    expect(ringPoints(0, 0, 0.1).length).toBeGreaterThanOrEqual(8);
  });

  it('hashes deterministically into 0..1', () => {
    expect(hash(3, 7)).toBe(hash(3, 7));
    expect(hash(3, 7)).not.toBe(hash(7, 3));
    for (let i = 0; i < 200; i++) {
      const v = hash(i, i * 13);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('caps the glitter inside big discs', () => {
    expect(dustCount(0.5, 0.2)).toBeGreaterThan(0);
    expect(dustCount(6.5, 0.2)).toBeLessThanOrEqual(260);
  });
});
