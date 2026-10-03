import { describe, it, expect } from 'vitest';
import { nearIndices, spatialHash } from '../src/arpg/spatial.js';
import { dist } from '../src/arpg/geometry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { arena, dummy, run } from './fixtures/arena.js';

// The spatial hash that replaces separation's all-pairs pass (see the floor maps spec).

describe('the spatial hash', () => {
  it('finds every body within a cell of a point, ascending, wherever they stand', () => {
    const rng = new SeededRNG(9);
    const bodies = Array.from({ length: 200 }, () => ({
      x: rng.next() * 60 - 5,
      y: rng.next() * 60 - 5,
    }));
    const hash = spatialHash(bodies, 2.5);
    for (let k = 0; k < 200; k++) {
      const p = { x: rng.next() * 60 - 5, y: rng.next() * 60 - 5 };
      const near = nearIndices(hash, p.x, p.y);
      expect(near).toEqual([...near].sort((a, b) => a - b));
      bodies.forEach((b, i) => {
        if (dist(p.x, p.y, b.x, b.y) <= 2.5) expect(near).toContain(i);
      });
    }
  });

  it('separation parts a crowd exactly as the all-pairs pass did', () => {
    const rng = new SeededRNG(4);
    const w = arena(
      Array.from({ length: 30 }, () => dummy(10 + rng.next() * 6, 8 + rng.next() * 6)),
      { noBasic: true },
    );
    // The all-pairs pass, on a copy (the hero is far off, and nothing else moves them).
    const ms = w.monsters.map((m) => ({ x: m.x, y: m.y, r: m.radius }));
    for (let i = 0; i < ms.length; i++)
      for (let j = i + 1; j < ms.length; j++) {
        const [a, b] = [ms[i], ms[j]];
        const d = dist(a.x, a.y, b.x, b.y);
        const overlap = a.r + b.r - d;
        if (overlap <= 0) continue;
        const n = d > 1e-6 ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : { x: 1, y: 0 };
        a.x -= n.x * overlap * 0.5;
        a.y -= n.y * overlap * 0.5;
        b.x += n.x * overlap * 0.5;
        b.y += n.y * overlap * 0.5;
      }
    run(w, 1 / 30);
    expect(w.monsters.map((m) => [m.x, m.y])).toEqual(ms.map((m) => [m.x, m.y]));
  });
});
