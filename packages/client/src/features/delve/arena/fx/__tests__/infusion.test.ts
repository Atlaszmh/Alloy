import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Graphics } from 'pixi.js';
import { MANA_TYPES, type ManaType } from '@alloy/engine';
import {
  EARTH_CRACK,
  SHADOW_SMOKE,
  basicMotif,
  drawInfusion,
  eventSeed,
  type InfusionBudget,
  type InfusionShape,
} from '../infusion';
import { MANA_HEX } from '../../palette';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  alpha: number;
}

/** A Graphics stand-in that records every pixel (`px` draws one rect, then fills it). */
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
  width: 0.55,
  progress: 0.6,
};
const RING: InfusionShape = { kind: 'ring', x: 5, y: 5, r: 2 };
const SHAPES = [ORB, PATH, RING];
const DARK = new Set([SHADOW_SMOKE, EARTH_CRACK]);

/** Draw one motif into fresh layers (with a ground layer only when `onGround`). */
function draw(
  element: ManaType,
  shape: InfusionShape,
  o: {
    time?: number;
    seed?: number;
    strength?: number;
    budget?: InfusionBudget;
    onGround?: boolean;
  } = {},
) {
  const air = recorder();
  const ground = recorder();
  const budget = o.budget ?? { left: 1e6 };
  const before = budget.left;
  drawInfusion(
    o.onGround ? { air, ground } : { air },
    element,
    shape,
    o.time ?? 1.3,
    o.seed ?? 7,
    o.strength ?? 1,
    budget,
  );
  return { air: air.rects, ground: ground.rects, used: before - budget.left, left: budget.left };
}

/** The carrier's own extent: an orb's or a ring's disc, a path's points widened by half its width. */
function bounds(s: InfusionShape) {
  if (s.kind !== 'path') return { x0: s.x - s.r, x1: s.x + s.r, y0: s.y - s.r, y1: s.y + s.r };
  const xs = s.points.map((p) => p.x);
  const ys = s.points.map((p) => p.y);
  const w = s.width / 2;
  return {
    x0: Math.min(...xs) - w,
    x1: Math.max(...xs) + w,
    y0: Math.min(...ys) - w,
    y1: Math.max(...ys) + w,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('drawInfusion', () => {
  for (const element of MANA_TYPES)
    for (const shape of SHAPES)
      it(`${element} on a ${shape.kind}: pixels within a unit of the carrier, the same for the same seed and time, not for another seed`, () => {
        vi.spyOn(Math, 'random').mockImplementation(() => {
          throw new Error('motifs never use Math.random');
        });
        const b = bounds(shape);
        for (const time of [0, 0.37, 1.9]) {
          const a = draw(element, shape, { time, strength: 1.5, onGround: true });
          expect(a.air.length).toBeGreaterThan(0);
          for (const r of [...a.air, ...a.ground]) {
            expect(r.x).toBeGreaterThanOrEqual(b.x0 - 1);
            expect(r.x + r.w).toBeLessThanOrEqual(b.x1 + 1);
            expect(r.y).toBeGreaterThanOrEqual(b.y0 - 1);
            expect(r.y + r.h).toBeLessThanOrEqual(b.y1 + 1);
          }
          expect(draw(element, shape, { time, strength: 1.5, onGround: true })).toEqual(a);
          expect(
            draw(element, shape, { time, strength: 1.5, onGround: true, seed: 8 }),
          ).not.toEqual(a);
        }
      });

  it('draws dark shapes only on the ground layer, and only for ground carriers', () => {
    // The air layer is additive: a colour with no channel at 0x40 or more barely shows.
    const bright = (c: number) => Math.max((c >> 16) & 255, (c >> 8) & 255, c & 255) >= 0x40;
    for (const element of MANA_TYPES)
      for (const shape of SHAPES) {
        const onGround = draw(element, shape, { strength: 1.5, onGround: true });
        const inAir = draw(element, shape, { strength: 1.5 });
        expect(onGround.air.some((r) => DARK.has(r.color))).toBe(false);
        expect(inAir.air.some((r) => DARK.has(r.color))).toBe(false);
        for (const r of [...onGround.air, ...inAir.air]) expect(bright(r.color)).toBe(true);
        // Shadow's smoke and earth's cracks, under blasts, zones and trails (never under an orb).
        const dark = (element === 'shadow' || element === 'earth') && shape.kind !== 'orb';
        expect(onGround.ground.length > 0).toBe(dark);
        for (const r of onGround.ground) expect(DARK.has(r.color)).toBe(true);
      }
  });

  it('scales its element count with strength (fire: 1.6 per unit of rim)', () => {
    const used = (strength: number) => draw('fire', RING, { strength }).used;
    expect(used(0)).toBe(0);
    expect(used(0.5)).toBeGreaterThan(0);
    expect(used(1)).toBe(Math.round(1.6 * 2 * Math.PI * 2));
    expect(used(1.5)).toBeGreaterThan(used(1));
    expect(used(1)).toBeGreaterThan(used(0.5));
    expect(draw('fire', RING, { strength: 1.5 }).air.length).toBeGreaterThan(
      draw('fire', RING, { strength: 0.5 }).air.length,
    );
  });

  it('draws in full when the budget allows, its first half when half fits, else nothing', () => {
    const n = draw('frost', RING).used;
    const full = draw('frost', RING, { budget: { left: n } });
    expect(full.left).toBe(0);
    const half = draw('frost', RING, { budget: { left: Math.ceil(n / 2) } });
    expect(half.left).toBe(0);
    expect(half.air.length).toBeGreaterThan(0);
    expect(half.air.length).toBeLessThan(full.air.length);
    // The golden slots' first half (their most even half), exactly as the full draw starts.
    expect(half.air).toEqual(full.air.slice(0, half.air.length));
    const none = draw('frost', RING, { budget: { left: Math.ceil(n / 2) - 1 } });
    expect(none.left).toBe(Math.ceil(n / 2) - 1);
    expect(none.air).toHaveLength(0);
  });

  it('keeps every element in its place as a carrier fades: it only drops the last ones', () => {
    const at = ({ x, y }: Rect) => ({ x, y });
    // A nature vine starts (in the element's colour) right after the last one's light tip.
    const vines = (shape: InfusionShape, strength: number) => {
      const rects = draw('nature', shape, { strength }).air;
      const own = (r: Rect) => r.color === MANA_HEX.nature;
      return rects.filter((r, k) => own(r) && (k === 0 || !own(rects[k - 1]))).map(at);
    };
    // A fire flame on a path starts (in its light root) right after the last one's top.
    const flames = (strength: number) => {
      const rects = draw('fire', PATH, { strength }).air;
      const top = (r: Rect) => r.color === MANA_HEX.fire;
      return rects.filter((r, k) => !top(r) && (k === 0 || top(rects[k - 1]))).map(at);
    };
    // An earth pebble is two rects on one spot.
    const pebbles = (strength: number) =>
      draw('earth', ORB, { strength })
        .air.filter((_, k) => k % 2 === 0)
        .map(at);
    const cases = [
      [vines(RING, 1), vines(RING, 0.8)],
      [flames(1), flames(0.8)],
      [pebbles(1), pebbles(0.8)],
    ];
    for (const [full, faded] of cases) {
      expect(faded.length).toBeGreaterThan(0);
      expect(faded.length).toBeLessThan(full.length);
      expect(faded).toEqual(full.slice(0, faded.length));
    }
  });

  it("draws nature's tendrils on a path all in full green (lighter tips wash out over a beam)", () => {
    const rects = draw('nature', PATH).air;
    expect(rects.length).toBeGreaterThan(0);
    expect(rects.every((r) => r.color === MANA_HEX.nature)).toBe(true);
  });

  it('draws nothing on a path with no points', () => {
    const empty = draw('fire', { kind: 'path', points: [], width: 0.5, progress: 0.5 });
    expect(empty.air).toHaveLength(0);
    expect(empty.used).toBe(0);
  });

  it('seeds a transient carrier from where and when its event happened', () => {
    expect(eventSeed(3, 4, 1)).toBe(eventSeed(3, 4, 1));
    expect(eventSeed(3, 4, 1)).not.toBe(eventSeed(3, 4, 1.5));
    expect(eventSeed(3, 4, 1)).not.toBe(eventSeed(4, 3, 1));
  });
});

describe('basicMotif', () => {
  it("draws the weapon's infusion on a blow of another element, and none on a blow of that element", () => {
    expect(basicMotif({ infusion: 'storm' }, 'fire')).toBe('storm');
    expect(basicMotif({ infusion: 'storm' }, 'storm')).toBeNull(); // a finisher's discharge
    expect(basicMotif({ infusion: null }, 'fire')).toBeNull();
  });
});
