import type { Graphics } from 'pixi.js';
import type { Vec } from '@alloy/engine';
import { SPRITE_PIXEL } from '../sprites';

/**
 * The drawing vocabulary for mana: everything is made of pixels at the
 * sprites' density (one pixel = 0.1 arena units), snapped to one grid, so an
 * ability's edge is a ring of living pixels rather than a smooth line.
 * Everything here draws in world units into a `PixelLayer`'s Graphics.
 */

export const PX = SPRITE_PIXEL;
const TAU = Math.PI * 2;
/** Glitter pixels drawn inside one disc per frame, at most. */
const DUST_CAP = 260;

export function snap(v: number): number {
  return Math.floor(v / PX + 1e-6) * PX;
}

/** A deterministic 0..1 hash of two numbers (for stable per-pixel variation). */
export function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Points around a circle, one per pixel of circumference (at least 8). */
export function ringPoints(x: number, y: number, r: number): Vec[] {
  const n = Math.max(8, Math.round((TAU * r) / PX));
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    out.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
  }
  return out;
}

/** How many glitter pixels a disc of radius `r` gets at `density` (share of its pixels). */
export function dustCount(r: number, density: number): number {
  return Math.min(DUST_CAP, Math.round(((Math.PI * r * r) / (PX * PX)) * density));
}

/** The sprite's lunge offset along its direction at progress `p` (0..1): out and back, in whole pixels. */
export function lungeOffset(p: number, pixels: number): number {
  const t = Math.min(1, Math.max(0, p));
  return Math.round(Math.sin(Math.PI * t) * pixels) * PX;
}

/** One mana pixel (or a `size`×`size` block). */
export function px(
  g: Graphics,
  x: number,
  y: number,
  color: number,
  alpha: number,
  size = 1,
): void {
  if (alpha <= 0.02) return;
  g.rect(snap(x), snap(y), PX * size, PX * size).fill({ color, alpha: Math.min(1, alpha) });
}

/** A twinkle factor 0.35..1 for pixel `i` at `time`. */
function twinkle(i: number, time: number, speed = 7): number {
  return 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * speed + hash(i, 1.7) * TAU));
}

export interface RingOpts {
  alpha?: number;
  /** Moving gaps: this many dark runs around the ring (0 = solid). */
  gaps?: number;
  /** How fast the gaps travel (radians/s). */
  spin?: number;
  /** Pixels thick. */
  thickness?: number;
  /** Pixels of radial jitter (re-rolled ~12 times a second). */
  jitter?: number;
}

/** A ring of twinkling mana pixels: the edge of a shield, zone or blast. */
export function manaRing(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  time: number,
  o: RingOpts = {},
): void {
  const alpha = o.alpha ?? 1;
  const thick = o.thickness ?? 1;
  const beat = Math.floor(time * 12);
  ringPoints(x, y, r).forEach((p, i, all) => {
    const a = (i / all.length) * TAU;
    if (o.gaps && Math.sin(a * o.gaps + time * (o.spin ?? 2)) < -0.45) return;
    const j = o.jitter ? (hash(i, beat) - 0.5) * 2 * o.jitter * PX : 0;
    const k = twinkle(i, time);
    for (let t = 0; t < thick; t++) {
      const rr = 1 - (t * PX) / Math.max(r, PX);
      px(
        g,
        x + (p.x - x) * rr + Math.cos(a) * j,
        y + (p.y - y) * rr + Math.sin(a) * j,
        color,
        alpha * k,
      );
    }
  });
}

/** Sparse glittering pixels inside a disc: the body of a shield, zone or blast. */
export function manaDust(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  time: number,
  density: number,
  alpha = 1,
  seed = 0,
): void {
  const n = dustCount(r, density);
  // Each pixel runs on its own clock: it glows at one spot for half a second,
  // then reappears somewhere else.
  for (let i = 0; i < n; i++) {
    const clock = time * 2 + hash(i, seed);
    const cycle = Math.floor(clock);
    const life = clock - cycle;
    const ang = hash(i, cycle + seed * 31) * TAU;
    const rad = Math.sqrt(hash(cycle, i + seed * 17)) * r;
    const fade = Math.sin(Math.PI * life);
    px(g, x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, color, alpha * fade);
  }
}

/** Pixels orbiting a centre with short fading trails (auras, Surge, hexes). */
export function manaMotes(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  time: number,
  n: number,
  speed: number,
  alpha = 1,
  trail = 3,
): void {
  for (let i = 0; i < n; i++) {
    const base = (i / n) * TAU + time * speed;
    const wobble = 1 + Math.sin(time * 3 + i) * 0.06;
    for (let t = 0; t < trail; t++) {
      const a = base - (t * PX * 1.6 * Math.sign(speed || 1)) / Math.max(r, PX);
      px(
        g,
        x + Math.cos(a) * r * wobble,
        y + Math.sin(a) * r * wobble,
        color,
        alpha * (1 - t / trail),
      );
    }
  }
}

/** Pixels along an arc from `a0` to `a1` (swings, the wind-up progress). */
export function manaArc(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  a0: number,
  a1: number,
  color: number,
  alpha: number,
  thickness = 1,
): void {
  const n = Math.max(2, Math.round((Math.abs(a1 - a0) * r) / PX));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    for (let t = 0; t < thickness; t++) {
      const rr = r - t * PX;
      px(g, x + Math.cos(a) * rr, y + Math.sin(a) * rr, color, alpha);
    }
  }
}

/** Pixels stepped along a segment, with optional jitter (beams, chains, sightlines). */
export function manaLine(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number,
  alpha: number,
  o: { every?: number; jitter?: number; time?: number; thickness?: number } = {},
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(len / PX));
  const every = o.every ?? 1;
  const nx = len > 0 ? -(y1 - y0) / len : 0;
  const ny = len > 0 ? (x1 - x0) / len : 0;
  const beat = Math.floor((o.time ?? 0) * 20);
  for (let i = 0; i <= n; i += every) {
    const t = i / n;
    const j = o.jitter ? (hash(i, beat) - 0.5) * 2 * o.jitter * PX : 0;
    for (let k = 0; k < (o.thickness ?? 1); k++) {
      const off = (k - ((o.thickness ?? 1) - 1) / 2) * PX + j;
      px(g, x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off, color, alpha);
    }
  }
}

/** A filled pixel disc (projectile cores), with an optional brighter centre. */
export function manaOrb(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  core: number,
  alpha = 1,
): void {
  const cells = Math.max(1, Math.round(r / PX));
  for (let i = -cells; i <= cells; i++) {
    for (let j = -cells; j <= cells; j++) {
      const d = Math.hypot(i, j) / cells;
      if (d > 1) continue;
      px(g, x + i * PX, y + j * PX, d < 0.45 ? core : color, alpha);
    }
  }
}

/** A twinkling pixel ellipse (footing rings under the hero and big foes). */
export function manaEllipse(
  g: Graphics,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: number,
  time: number,
  alpha = 1,
): void {
  const n = Math.max(12, Math.round((Math.PI * (rx + ry)) / PX));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    px(g, x + Math.cos(a) * rx, y + Math.sin(a) * ry, color, alpha * twinkle(i, time, 4));
  }
}
