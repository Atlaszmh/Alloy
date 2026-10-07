import { afterAll, afterEach, describe, it, expect } from 'vitest';
import { botInput } from '../src/arpg/bot.js';
import { exitFloor } from '../src/arpg/interact.js';
import { stepWorld } from '../src/arpg/step.js';
import { takeBestAlcove } from '../src/delve/autopilot.js';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { Blow, MoveKind, Move } from '../src/types/ability.js';
import type { RuneRef } from '../src/types/rune.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { Buff } from '../src/types/boon.js';
import type { DelveProfile } from '../src/types/delve.js';
import { registry, STEP, withChains } from './fixtures/arena.js';

/**
 * The boons spec's §8 engine check: the worst case boons make, on generated floors. An epic bow
 * whose Primary (a two-move Volley) and three blows each hold Echo III, Split III and Multi-shot
 * III, a dive wearing Hunted (every pack elite-led) and Echo at their epic tiers, from depth 20,
 * six seeds × 90 s of sim. The hero is immortal and never starved, so it fights and casts at every
 * chance. Prints µs a step, the worst step, hits (and echo hits) and events a second; asserts only
 * that the worst step stays under 8 ms (a quarter of a 33 ms tick): wall-clock means aren't
 * asserted. Skipped unless SIM_PERF is set (about a minute):
 * `SIM_PERF=1 npx vitest run tests/delve-sim-perf.test.ts`.
 */

const DEPTH = 20;
const SECONDS = 90;
const SEEDS = [1, 2, 3, 4, 5, 6];
const WORST_MS = 8;

const RUNES: RuneRef[] = [
  { id: 'echo', tier: 3 },
  { id: 'split', tier: 3 },
  { id: 'multishot', tier: 3 },
];

/** A boon at its epic tier, as `takeStop` would wear it. */
function boon(id: string): Buff {
  const def = registry.getBoon(id);
  if (!def) throw new Error(`no boon ${id}`);
  return { boon: id, tier: 3, effect: def.tiers[2].effect };
}

/** The worst-case hero on a dive at `DEPTH`. */
function hero(seed: number): DelveProfile {
  let p = createDelveProfile(registry, seed, { primary: 'fire' });
  const bow = generateItem(
    registry,
    { uid: 'perf-bow', ilvl: DEPTH, rarity: 'epic', slot: 'weapon', baseId: 'bow', mana: 'fire' },
    new SeededRNG(seed),
  );
  p = { ...p, equipped: { ...p.equipped, weapon: bow } };
  const blow = (kind: MoveKind): Blow => ({ kind, element: 'fire', runes: [...RUNES] });
  const volley = (kind: MoveKind): Move => ({ kind, form: 'volley', elements: ['fire'], runes: [...RUNES] });
  p = withChains(p, {
    basic: [blow('light'), blow('light'), blow('heavy')],
    primary: { moves: [volley('medium'), volley('heavy')], payment: 'mana' },
  });
  p = startDive(registry, p, 1);
  return {
    ...p,
    dive: { ...p.dive!, depth: DEPTH, seed: seed * 1009 + DEPTH * 7, diveBuffs: [boon('hunted'), boon('echo')] },
  };
}

interface Tally {
  steps: number;
  ms: number;
  worst: number;
  hits: number;
  echoes: number;
  events: number;
  floors: number;
}

/** `SECONDS` of sim for `seed`, floor after floor; each `stepWorld` timed alone. */
function run(seed: number): Tally {
  const t: Tally = { steps: 0, ms: 0, worst: 0, hits: 0, echoes: 0, events: 0, floors: 0 };
  let p = hero(seed);
  let simmed = 0;
  while (simmed < SECONDS) {
    const world: ArpgWorld = beginFloor(registry, p);
    t.floors++;
    const h = world.hero;
    const immortal = () => {
      h.stats = h.baseStats = { ...h.stats, maxHp: 1e9 };
      h.hp = 1e9;
    };
    immortal();
    while (!world.exited && simmed + world.t < SECONDS) {
      h.mana = h.manaMax;
      const input = botInput(registry, world);
      const t0 = performance.now();
      const events = stepWorld(registry, world, input, STEP);
      const ms = performance.now() - t0;
      t.steps++;
      t.ms += ms;
      t.worst = Math.max(t.worst, ms);
      t.events += events.length;
      for (const e of events) {
        if (e.kind === 'hit') {
          t.hits++;
          if (e.echo) t.echoes++;
        } else if (e.kind === 'exitRequest') exitFloor(world);
        else if (e.kind === 'alcoveOpen') {
          p = takeBestAlcove(registry, p, world, e.id);
          immortal(); // an alcove re-applies the hero's stats
        }
      }
    }
    simmed += world.t;
    p = { ...p, dive: { ...p.dive!, depth: p.dive!.depth + 1, seed: p.dive!.seed + 1 } };
  }
  return t;
}

// Each test yields to the event loop as it ends (see CLAUDE.md's Testing).
afterEach(() => new Promise((r) => setTimeout(r)));

describe.skipIf(!process.env.SIM_PERF)(`the sim under boons (depth ${DEPTH}, ${SEEDS.length} seeds × ${SECONDS} s)`, () => {
  const rows: string[] = [];
  afterAll(() => {
    console.log(['seed | µs a step | worst ms | hits | echo hits | events/s | floors', ...rows].join('\n'));
  });

  for (const seed of SEEDS)
    it(`seed ${seed}: the worst step under ${WORST_MS} ms`, () => {
      const t = run(seed);
      rows.push(
        [
          seed,
          ((t.ms / t.steps) * 1000).toFixed(1),
          t.worst.toFixed(2),
          t.hits,
          t.echoes,
          (t.events / SECONDS).toFixed(0),
          t.floors,
        ].join(' | '),
      );
      expect(t.hits, 'the build must fight').toBeGreaterThan(0);
      expect(t.worst).toBeLessThan(WORST_MS);
    }, 120_000);
});
