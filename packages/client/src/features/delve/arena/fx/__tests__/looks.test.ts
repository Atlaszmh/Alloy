import { describe, it, expect } from 'vitest';
import type { Graphics } from 'pixi.js';
import { LOOKS, drawLook, lookCount } from '../looks';
import type { InfusionBudget, InfusionShape } from '../infusion';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  alpha: number;
}

/** A Graphics stand-in that records every pixel (infusion.test.ts's). */
function recorder() {
  const rects: Rect[] = [];
  let at = { x: 0, y: 0, w: 0, h: 0 };
  const g = {
    rects,
    rect: (x: number, y: number, w: number, h: number) => ((at = { x, y, w, h }), g),
    fill: (f: { color: number; alpha: number }) => (
      rects.push({ ...at, color: f.color, alpha: f.alpha }),
      g
    ),
  };
  return g as unknown as Graphics & { rects: Rect[] };
}

const ORB: InfusionShape = { kind: 'orb', x: 5, y: 5, r: 0.3, vx: 8, vy: -3 };
const PATH: InfusionShape = {
  kind: 'path',
  points: [
    { x: 2, y: 8 },
    { x: 5, y: 6 },
    { x: 8, y: 7 },
  ],
  width: 0.4,
  progress: 1,
};
const RING: InfusionShape = { kind: 'ring', x: 5, y: 5, r: 2 };
const SHAPES = [ORB, PATH, RING];
const budget = (left = 1000): InfusionBudget => ({ left });

describe('drawLook', () => {
  it('draws every look on every carrier shape, in mana pixels', () => {
    for (const look of LOOKS)
      for (const shape of SHAPES) {
        const g = recorder();
        drawLook({ air: g }, look, 0xff8844, shape, 1.5, 7, 1, budget());
        expect(g.rects.length, `${look} on ${shape.kind}`).toBeGreaterThan(0);
        // On the sprites' grid: every pixel a whole number of 0.1 units wide.
        for (const r of g.rects) expect(Math.round(r.w * 10) / 10).toBe(r.w);
      }
  });

  it('is stable: the same seed and clock draw the same pixels', () => {
    const a = recorder();
    const b = recorder();
    drawLook({ air: a }, 'spark', 0xff8844, RING, 2, 11, 1, budget());
    drawLook({ air: b }, 'spark', 0xff8844, RING, 2, 11, 1, budget());
    expect(a.rects).toEqual(b.rects);
  });

  it('spends one budget element per motif element and draws nothing past the budget', () => {
    const n = lookCount('arrow', PATH);
    expect(n).toBeGreaterThan(1);
    const spent = budget(1000);
    drawLook({ air: recorder() }, 'arrow', 0xff8844, PATH, 0, 3, 1, spent);
    expect(spent.left).toBe(1000 - n);
    const none = recorder();
    drawLook({ air: none }, 'arrow', 0xff8844, PATH, 0, 3, 1, budget(0));
    expect(none.rects).toHaveLength(0);
  });

  it('fades with strength and draws nothing at 0', () => {
    const full = recorder();
    const dim = recorder();
    drawLook({ air: full }, 'orb', 0xff8844, ORB, 0, 5, 1, budget());
    drawLook({ air: dim }, 'orb', 0xff8844, ORB, 0, 5, 0.4, budget());
    expect(Math.max(...dim.rects.map((r) => r.alpha))).toBeLessThan(
      Math.max(...full.rects.map((r) => r.alpha)),
    );
    const gone = recorder();
    drawLook({ air: gone }, 'orb', 0xff8844, ORB, 0, 5, 0, budget());
    expect(gone.rects).toHaveLength(0);
  });
});
