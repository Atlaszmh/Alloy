import type { Vec } from '../types/arpg.js';

/**
 * A uniform-grid spatial hash (see the floor maps spec): bodies bucketed by
 * square cells of `cell` units, so a pass over neighbours looks only in the
 * 3 × 3 buckets round a point instead of at every body.
 */
export interface SpatialHash {
  cell: number;
  buckets: Map<number, number[]>;
}

function key(bx: number, by: number): number {
  return bx * 65536 + by;
}

/** Bucket each body's index (in `bodies`' order) by where it stands now. */
export function spatialHash(bodies: readonly Vec[], cell: number): SpatialHash {
  const buckets = new Map<number, number[]>();
  bodies.forEach((b, i) => {
    const k = key(Math.floor(b.x / cell), Math.floor(b.y / cell));
    const list = buckets.get(k);
    if (list) list.push(i);
    else buckets.set(k, [i]);
  });
  return { cell, buckets };
}

/**
 * The indices, ascending, of the bodies hashed in the 3 × 3 buckets round
 * (x, y): every body within `cell` of it (as they stood when hashed), and some
 * farther.
 */
export function nearIndices(hash: SpatialHash, x: number, y: number): number[] {
  const bx = Math.floor(x / hash.cell);
  const by = Math.floor(y / hash.cell);
  const out: number[] = [];
  for (let i = bx - 1; i <= bx + 1; i++)
    for (let j = by - 1; j <= by + 1; j++) out.push(...(hash.buckets.get(key(i, j)) ?? []));
  return out.sort((a, b) => a - b);
}
