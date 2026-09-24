import type { Vec } from '../types/arpg.js';

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** Unit vector from (ax, ay) toward (bx, by); zero vector when coincident. */
export function dirTo(ax: number, ay: number, bx: number, by: number): Vec {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  return len > 1e-9 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
}

export function clampLen(v: Vec, max = 1): Vec {
  const len = Math.hypot(v.x, v.y);
  if (len <= max || len < 1e-9) return { x: v.x, y: v.y };
  return { x: (v.x / len) * max, y: (v.y / len) * max };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Distance from point P to segment AB. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  const t = len2 > 0 ? clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

/** Absolute angle (radians) between two direction vectors. */
export function angleBetween(a: Vec, b: Vec): number {
  const dot = a.x * b.x + a.y * b.y;
  const la = Math.hypot(a.x, a.y);
  const lb = Math.hypot(b.x, b.y);
  if (la < 1e-9 || lb < 1e-9) return 0;
  return Math.acos(clamp(dot / (la * lb), -1, 1));
}
