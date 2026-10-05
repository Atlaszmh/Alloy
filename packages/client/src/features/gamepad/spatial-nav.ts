/** A focusable control's box (screen px). */
export interface NavRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type NavDir = 'up' | 'down' | 'left' | 'right';

/** How wide the cone off the beam is: a box's gap across the press at most this × the centres' distance along it. */
export const CONE = 0.5;
/** Edges this close (px) are level: a rounding never puts a neighbour "beyond". */
const EPS = 0.5;

/** How a box lies from the focused one, along the press and across it. */
interface Lay {
  /** The gap between the two boxes along the press (0 when they overlap). */
  along: number;
  /**
   * How far the box reaches along the press: its gap plus its whole length. A box overlapping
   * the focused one along the press (a tile under a chip) counts all of it, so it never passes
   * for a nearer row than a control straight ahead.
   */
  far: number;
  /** The gap between them across the press (0 in the beam). */
  across: number;
  /** Their spans across the press overlap. */
  beam: boolean;
  /** Between their centres, across the press and along it. */
  offset: number;
  centre: number;
}

/** How `c` lies from `from` for a press of `dir`, or null when it is not beyond `from` that way. */
function lay(from: NavRect, c: NavRect, dir: NavDir): Lay | null {
  const sideways = dir === 'left' || dir === 'right';
  const forward = dir === 'right' || dir === 'down';
  // Each box's span along the press (a) and across it (b).
  const [fa0, fa1, ca0, ca1] = sideways
    ? [from.x, from.x + from.w, c.x, c.x + c.w]
    : [from.y, from.y + from.h, c.y, c.y + c.h];
  const [fb0, fb1, cb0, cb1] = sideways
    ? [from.y, from.y + from.h, c.y, c.y + c.h]
    : [from.x, from.x + from.w, c.x, c.x + c.w];
  const beyond = forward
    ? ca0 > fa0 + EPS && ca1 > fa1 + EPS
    : ca1 < fa1 - EPS && ca0 < fa0 - EPS;
  if (!beyond) return null;
  const along = Math.max(0, forward ? ca0 - fa1 : fa0 - ca1);
  return {
    along,
    far: along + (ca1 - ca0),
    across: Math.max(0, Math.max(fb0, cb0) - Math.min(fb1, cb1)),
    beam: Math.min(fb1, cb1) - Math.max(fb0, cb0) > EPS,
    offset: Math.abs((cb0 + cb1) / 2 - (fb0 + fb1) / 2),
    centre: Math.abs((ca0 + ca1) / 2 - (fa0 + fa1) / 2),
  };
}

/**
 * The control to move focus to. Only a box beyond the focused one's edge counts. Of those in
 * its beam (their spans across the press overlap) the nearest wins, a tie to the one more in
 * line; of those off it, only ones in a cone (`CONE`), the nearest by a distance that counts
 * the gap across twice. The beam's pick wins, unless the cone's lies wholly in a nearer row
 * and no further aside than the focused box is wide (a ragged, wrapped grid steps row by
 * row). Null at an edge: the focus never wraps.
 */
export function pickNext(from: NavRect, candidates: NavRect[], dir: NavDir): NavRect | null {
  let beam: { c: NavRect; l: Lay } | null = null;
  let cone: { c: NavRect; l: Lay; d: number } | null = null;
  for (const c of candidates) {
    if (c.id === from.id) continue;
    const l = lay(from, c, dir);
    if (!l) continue;
    if (l.beam) {
      if (!beam || l.along < beam.l.along || (l.along === beam.l.along && l.offset < beam.l.offset))
        beam = { c, l };
    } else if (l.across <= l.centre * CONE) {
      const d = l.along * l.along + 4 * l.across * l.across;
      if (!cone || d < cone.d) cone = { c, l, d };
    }
  }
  if (!beam) return cone?.c ?? null;
  if (!cone) return beam.c;
  const wide = dir === 'left' || dir === 'right' ? from.h : from.w;
  return cone.l.far <= beam.l.along && cone.l.across <= wide ? cone.c : beam.c;
}
