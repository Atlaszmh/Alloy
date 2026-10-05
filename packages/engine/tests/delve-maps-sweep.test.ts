import { afterEach, describe, it, expect } from 'vitest';
import type { BotPolicy } from '../src/arpg/bot.js';
import { isWalkable } from '../src/arpg/grid.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { botStep } from '../src/delve/autopilot.js';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { STEP } from './fixtures/arena.js';

// A regression sweep over generated floors (see the floor maps spec): a bot that can't die
// and kills at once must reach every floor's exit, and no body ever stands in a wall.

const generating = createDefaultRegistry();
generating.getDelveBalance().layout.generatedDives = true;

/** Floor `depth` of seed `seed`, its hero immortal and overwhelming, played by the bot. */
function sweep(seed: number, depth: number, policy: BotPolicy): string[] {
  let p = startDive(generating, createDelveProfile(generating, seed, { primary: 'fire' }), 1);
  p = { ...p, dive: { ...p.dive!, depth, seed: seed * 1009 + depth * 7 } };
  const world = beginFloor(generating, p);
  const h = world.hero;
  const buff = () => {
    h.stats = h.baseStats = { ...h.stats, maxHp: 1e9, damageMult: 1000 };
    h.hp = 1e9;
  };
  buff();
  const bad: string[] = [];
  while (!world.heroDead && !world.exited && world.t < 300) {
    const before = p;
    p = botStep(generating, p, world, STEP, policy);
    if (p !== before) buff(); // an alcove re-applies the hero's stats
    for (const b of [h, ...world.monsters.filter((m) => !m.dead)])
      if (!isWalkable(world.map, b.x, b.y)) bad.push(`t ${world.t.toFixed(1)} at ${b.x}, ${b.y}`);
  }
  if (!world.exited) bad.push(`ended at t ${world.t.toFixed(1)} without exiting`);
  return bad.slice(0, 3);
}

// Each test yields to the event loop as it ends: these tests run synchronously for many
// seconds, and a worker that holds its event loop past 60 s in all leaves vitest's pending
// task update to time out ("Timeout calling onTaskUpdate"), though every test passes.
afterEach(() => new Promise((r) => setTimeout(r)));

// A test a policy and a depth, so none runs long.
describe('generated floors, swept', () => {
  for (const policy of ['thorough', 'beeline'] as const)
    for (const depth of [3, 8, 13, 18, 22, 28])
      it(`${policy}, depth ${depth}: every floor reaches its exit and no body stands in a wall`, () => {
        for (let seed = 1; seed <= 20; seed++)
          expect(sweep(seed, depth, policy), `seed ${seed}`).toEqual([]);
      }, 60_000);
});
