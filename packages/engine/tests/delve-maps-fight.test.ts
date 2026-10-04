import { describe, it, expect } from 'vitest';
import { isWalkable, snapToWalkable } from '../src/arpg/grid.js';
import { stepWorld } from '../src/arpg/step.js';
import { createFloorWorld } from '../src/arpg/world.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { DEFAULT_CHAINS, STEP, gear, registry } from './fixtures/arena.js';

// The physics and the foes on real generated floors (see the floor maps spec): a
// fight in each floor's most crowded room keeps every body on walkable ground and
// every boss in its room.

/** A registry whose dives are generated (`delve.layout.generatedDives`, on as shipped, set here whatever the data says). */
const generating = createDefaultRegistry();
generating.getDelveBalance().layout.generatedDives = true;

function floor(depth: number, seed: number): ArpgWorld {
  return createFloorWorld(generating, {
    depth,
    door: null,
    stats: computeHeroStats({ weapon: gear('fire') }, registry),
    chains: DEFAULT_CHAINS,
    heroHpFrac: 1,
    potions: 3,
    phoenixAvailable: true,
    seed,
    layout: 'generated',
    loot: {
      nextUid: 1,
      find: 0,
      legendaryBoost: 1,
      patterns: [],
      dropsGiven: [],
      pair: [],
    },
  });
}

/** What stands somewhere it can't: off walkable ground, or a boss outside its room. */
function strays(w: ArpgWorld): string[] {
  const out: string[] = [];
  const off = (what: string, p: { x: number; y: number }) => {
    if (!isWalkable(w.map, p.x, p.y)) out.push(`${what} at ${p.x}, ${p.y}`);
  };
  off('hero', w.hero);
  for (const m of w.monsters) {
    off(`foe ${m.id}`, m);
    const rect = w.map.rooms.find((r) => r.id === m.roomId)?.rect;
    if (m.kind === 'boss' && rect)
      if (m.x < rect.x || m.y < rect.y || m.x > rect.x + rect.w || m.y > rect.y + rect.h)
        out.push(`boss ${m.id} out of its room at ${m.x}, ${m.y}`);
  }
  for (const d of w.drops) off(`drop ${d.id}`, d);
  for (const p of w.projectiles) off(`shot ${p.id}`, p);
  return out;
}

describe('a fight on a generated floor', () => {
  it.each([
    [1, 3],
    [3, 11],
    [5, 7],
    [8, 21],
    [10, 5],
  ])('depth %i, seed %i: every body stays on walkable ground', (depth, seed) => {
    const w = floor(depth, seed);
    // The hero, unhurt, stands in the middle of the room with the most foes.
    const count = (id: number) => w.monsters.filter((m) => m.roomId === id).length;
    const room = [...w.map.rooms].sort((a, b) => count(b.id) - count(a.id))[0];
    const { x, y, w: rw, h: rh } = room.rect;
    Object.assign(w.hero, snapToWalkable(w.map, x + rw / 2, y + rh / 2));
    w.hero.invulnUntil = 1e9;
    const found: string[] = [];
    for (let i = 0; i < 30 * 20 && found.length === 0; i++) {
      const cast = i % 45 === 0 ? { slot: 0, aim: null } : null;
      stepWorld(generating, w, { move: { x: 0, y: 0 }, cast }, STEP);
      found.push(...strays(w).map((s) => `t ${w.t.toFixed(2)}: ${s}`));
    }
    expect(found).toEqual([]);
    // The fight happened: foes fell or were hurt.
    expect(w.kills > 0 || w.monsters.some((m) => m.hp < m.maxHp)).toBe(true);
  });
});
