import { describe, it, expect } from 'vitest';
import { arena, damaged, dummy, press, run } from './fixtures/arena.js';
import { WALL_30, onMap } from './fixtures/maps.js';

// Projectiles on the grid (see the floor maps spec's "Line of sight"): a shot stops
// at the wall's face, where a Bolt bursts.

describe('shots and walls', () => {
  it('a Bolt that meets a wall bursts at its face', () => {
    const w = onMap(arena([dummy(13, 28)], { noBasic: true }), WALL_30);
    const events = press(w, 0, { x: 13, y: 20 });
    events.push(...run(w, 1));
    const burst = events.find((e) => e.kind === 'explode');
    expect(burst && burst.kind === 'explode' && burst.y).toBeGreaterThan(32);
    expect(burst && burst.kind === 'explode' && burst.y).toBeCloseTo(32, 5);
    expect(damaged(w.monsters[0])).toBe(false);
    expect(w.projectiles).toEqual([]);
  });
});
