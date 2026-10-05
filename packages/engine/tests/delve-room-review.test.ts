import { describe, it, expect } from 'vitest';
import { isWalkable } from '../src/arpg/grid.js';
import { stepWorld } from '../src/arpg/step.js';
import { createFloorWorld } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { bal, gear, registry, STEP } from './fixtures/arena.js';

// The room objects' whole-feature review: each finding's guard.

const floor = (depth: number, seed: number): ArpgWorld =>
  createFloorWorld(registry, {
    depth,
    door: null,
    stats: computeHeroStats({ weapon: gear('fire') }, registry),
    chains: {},
    heroHpFrac: 1,
    potions: 3,
    phoenixAvailable: true,
    seed,
    layout: 'generated',
    loot: { nextUid: 1, find: 0, legendaryBoost: 1, patterns: [], dropsGiven: [], pair: [] },
  });
const still = { move: { x: 0, y: 0 } } as Parameters<typeof stepWorld>[2];

describe('a furnished boss room', () => {
  it('lets its boss reach melee of a still hero anywhere in it', { timeout: 120_000 }, () => {
    const misses: string[] = [];
    for (let k = 1; k <= 6; k++)
      for (let seed = 1; seed <= 8; seed++) {
        const depth = bal.dive.bossEvery * k;
        const room = floor(depth, seed * 977).map.rooms.find((r) => r.kind === 'boss')!;
        const { x, y, w, h } = room.rect;
        for (let a = 0; a < 8; a++) {
          const p = {
            x: x + 2 + ((a * 7) % (w - 4)) + 0.5,
            y: y + 2 + ((a * 5 + 3) % (h - 4)) + 0.5,
          };
          const wd = floor(depth, seed * 977);
          if (!isWalkable(wd.map, p.x, p.y)) continue;
          const boss = wd.monsters.find((m) => m.kind === 'boss')!;
          for (const m of wd.monsters) if (m !== boss) m.dead = true;
          Object.assign(boss, { aggro: true, aggroAt: 0 });
          wd.hero.hp = wd.hero.stats.maxHp = 1e12;
          let reached = false;
          for (let i = 0; i < 30 * 12 && !reached; i++) {
            stepWorld(registry, wd, still, STEP);
            Object.assign(wd.hero, p);
            const gap = Math.hypot(boss.x - p.x, boss.y - p.y) - boss.radius - wd.hero.radius;
            reached = gap <= boss.attackRange + 0.05;
          }
          if (!reached) misses.push(`d${depth} s${seed * 977} ${boss.defId} at ${p.x},${p.y}`);
        }
      }
    expect(misses).toEqual([]);
  });
});
