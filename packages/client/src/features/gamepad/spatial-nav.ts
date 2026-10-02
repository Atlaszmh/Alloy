/** A focusable control's box (screen px). */
export interface NavRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type NavDir = 'up' | 'down' | 'left' | 'right';

const AXIS: Record<NavDir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** The gap between two spans on one axis, 0 when they overlap. */
function gap(a: number, aLen: number, b: number, bLen: number): number {
  return Math.max(0, Math.max(a, b) - Math.min(a + aLen, b + bLen));
}

/**
 * The control to move focus to: the nearest one whose centre lies in the
 * pressed direction, favouring ones straight ahead over ones off to the side.
 * "Off to the side" is the gap between the two boxes across the direction (0
 * when they overlap), so a wide control right below is never skipped for a
 * small one further on. Null at the edge.
 */
export function pickNext(from: NavRect, candidates: NavRect[], dir: NavDir): NavRect | null {
  const a = AXIS[dir];
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  let best: NavRect | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    if (c.id === from.id) continue;
    const dx = c.x + c.w / 2 - cx;
    const dy = c.y + c.h / 2 - cy;
    const along = dx * a.x + dy * a.y;
    if (along <= 1) continue;
    const across = a.x === 0 ? gap(from.x, from.w, c.x, c.w) : gap(from.y, from.h, c.y, c.h);
    const score = along + across * 2;
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}
