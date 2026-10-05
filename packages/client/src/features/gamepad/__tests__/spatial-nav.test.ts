import { describe, it, expect } from 'vitest';
import { CONE, pickNext, type NavRect } from '../spatial-nav';

/** A box `w` × `h` at `x`, `y`. */
const box = (id: string, x: number, y: number, w = 10, h = 10): NavRect => ({ id, x, y, w, h });
const pick = (from: NavRect, others: NavRect[], dir: Parameters<typeof pickNext>[2]) =>
  pickNext(from, [from, ...others], dir)?.id ?? null;

describe('pickNext', () => {
  it('takes only what lies beyond the edge: a box around or behind the focused one never counts', () => {
    const from = box('from', 100, 0, 100, 20);
    // Wider than `from` and under it: its centre is 10 px to the right, but it is not to the right.
    const under = box('under', 60, 300, 200, 20);
    expect(pick(from, [under], 'right')).toBeNull();
    expect(pick(from, [under], 'left')).toBeNull();
    expect(pick(from, [under], 'down')).toBe('under');
    // An overlapping neighbour whose both edges lie further right counts.
    expect(pick(from, [box('lapped', 190, 0, 100, 20)], 'right')).toBe('lapped');
  });

  it('prefers the beam: a box straight ahead beats a nearer one off to the side', () => {
    const from = box('from', 0, 0);
    const ahead = box('ahead', 100, 0);
    const aside = box('aside', 30, 40);
    expect(pick(from, [ahead, aside], 'right')).toBe('ahead');
  });

  it('in the beam the nearest wins, a tie going to the one more in line', () => {
    const from = box('from', 0, 0, 40, 10);
    expect(pick(from, [box('far', 0, 80, 40, 10), box('near', 0, 30, 40, 10)], 'down')).toBe('near');
    // Both 20 px below; `inline` shares the centre.
    const inline = box('inline', 10, 30, 20, 10);
    const offset = box('offset', 30, 30, 40, 10);
    expect(pick(from, [offset, inline], 'down')).toBe('inline');
  });

  it('off the beam, takes only what lies in the cone', () => {
    const from = box('from', 0, 0);
    // 100 px on and 20 px aside: in the cone.
    expect(pick(from, [box('near-line', 100, 30)], 'right')).toBe('near-line');
    // 20 px on and 90 px aside: a different row, not "to the right".
    expect(pick(from, [box('below', 20, 100)], 'right')).toBeNull();
  });

  it('pins the cone at CONE: a gap across of half the distance along, and no more', () => {
    expect(CONE).toBe(0.5);
    const from = box('from', 0, 0);
    // Centres 100 px apart along the press: a gap across of 49.5 px is in, 50.5 px is out.
    expect(pick(from, [box('inside', 100, 59.5)], 'right')).toBe('inside');
    expect(pick(from, [box('outside', 100, 60.5)], 'right')).toBeNull();
  });

  it('a box overlapping the focused one along the press never passes for a nearer row', () => {
    // The hub's bag at 1080p: right from a filter chip, the sort button lies straight ahead; a
    // tile under the chip's right end ends before it, but it is below the chip, not beside it.
    const chip = box('chip', 1097, 124, 136, 38);
    const sort = box('sort', 1295, 125, 71, 37);
    const tile = box('tile', 1200, 178, 84, 84);
    expect(pick(chip, [tile, sort], 'right')).toBe('sort');
  });

  it('steps a ragged, wrapped grid row by row', () => {
    // Row 1: a, b. Row 2: one short chip that sits between them. Row 3: a chip under b.
    const b = box('b', 70, 0, 60, 20);
    const gap = box('gap', 50, 30, 15, 20);
    const under = box('under', 70, 60, 60, 20);
    expect(pick(b, [box('a', 0, 0, 60, 20), gap, under], 'down')).toBe('gap');
  });

  it('never lets a far diagonal box beat the beam', () => {
    const from = box('from', 500, 0, 20, 20);
    const footer = box('footer', 0, 900, 1900, 60);
    const corner = box('corner', 300, 600, 100, 50);
    expect(pick(from, [footer, corner], 'down')).toBe('footer');
  });

  it('stays put at an edge', () => {
    const from = box('from', 0, 0);
    expect(pick(from, [box('right', 40, 0)], 'left')).toBeNull();
    expect(pick(from, [], 'down')).toBeNull();
  });
});
