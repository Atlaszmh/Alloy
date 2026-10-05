import { describe, it, expect, vi } from 'vitest';
import type { SimCtx } from '../src/arpg/combat.js';
import { flowField } from '../src/arpg/flow.js';
import { dist } from '../src/arpg/geometry.js';
import type { DataRegistry } from '../src/data/registry.js';
import { CELL } from '../src/types/floor-map.js';
import { STEP, bal } from './fixtures/arena.js';
import { ON, packFloor, runWith, withPack } from './fixtures/pack.js';

// No pinning (see the room objects spec's "Smarter packs"): no foe stays pressed against a
// prop, a hazard or cover longer than `stuckTime`. Here the push-out stands in for B3's
// (`objectsSeparate`), and the hero's flow field is built once with nothing in it but the walls
// (`flowTick` held), so a foe coming down the column an urn stands in is pressed square on it.

vi.mock('../src/arpg/objects.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/arpg/objects.js')>()),
  objectsSeparate: (ctx: SimCtx) => {
    for (const p of ctx.world.props)
      for (const m of ctx.world.monsters) {
        const d = dist(m.x, m.y, p.x, p.y);
        const over = p.radius + m.radius - d;
        if (over <= 0 || d < 1e-9) continue;
        m.x += ((m.x - p.x) / d) * over;
        m.y += ((m.y - p.y) / d) * over;
      }
  },
}));
vi.mock('../src/arpg/flow.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/arpg/flow.js')>()),
  flowTick: () => {},
}));

/**
 * A foe walking down column 13 at a hero at (13.5, 24) with an urn at (13.5, 20)
 * between them, for `seconds`: the longest it stays pressed against the urn
 * without getting half a unit further, and whether it reached the hero.
 */
function pinned(reg: DataRegistry, seconds: number) {
  const w = packFloor([{ x: 13.5, y: 15 }]);
  Object.assign(w.hero, { x: 13.5, y: 24 });
  w.flow.small = flowField(w.map, w.hero, bal.ai.flowRadius, 1);
  w.props.push({
    ...{ type: 'prop', id: 900, kind: 'urn' },
    ...{ x: 13.5, y: 20, radius: 0.6, life: 1, dead: false },
  });
  const m = w.monsters[0];
  let since: { t: number; x: number; y: number } | null = null;
  let longest = 0;
  let reached = false;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    runWith(reg, w, STEP);
    const pressed = dist(m.x, m.y, 13.5, 20) <= m.radius + 0.6 + 0.05;
    if (!pressed) since = null;
    else if (!since || dist(m.x, m.y, since.x, since.y) > 0.5) since = { t: w.t, x: m.x, y: m.y };
    else longest = Math.max(longest, w.t - since.t);
    reached ||= dist(m.x, m.y, w.hero.x, w.hero.y) - m.radius - w.hero.radius <= m.attackRange;
  }
  return { longest, reached };
}

describe('a foe pressed against a prop', () => {
  it('with no time limit stays pinned', () => {
    const { longest, reached } = pinned(withPack({ stuckTime: 1e9 }), 6);
    expect(longest).toBeGreaterThan(4);
    expect(reached).toBe(false);
  });

  it('steps round it within stuckTime and reaches the hero', () => {
    const { longest, reached } = pinned(ON, 8);
    expect(longest).toBeLessThanOrEqual(bal.ai.pack.stuckTime);
    expect(reached).toBe(true);
  });
});

describe('a foe pressed against cover', () => {
  it('steps round it too', () => {
    // A cover cell where the urn stood: the field (built before it) still runs through it.
    const w = packFloor([{ x: 13.5, y: 15 }]);
    Object.assign(w.hero, { x: 13.5, y: 24 });
    w.flow.small = flowField(w.map, w.hero, bal.ai.flowRadius, 1);
    w.map.cells[20 * w.map.width + 13] = CELL.cover;
    const m = w.monsters[0];
    runWith(ON, w, 8);
    expect(dist(m.x, m.y, w.hero.x, w.hero.y) - m.radius - w.hero.radius).toBeLessThanOrEqual(
      m.attackRange,
    );
  });
});
