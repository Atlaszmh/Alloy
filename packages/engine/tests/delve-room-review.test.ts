import { describe, it, expect } from 'vitest';
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import { isWalkable } from '../src/arpg/grid.js';
import { stepWorld } from '../src/arpg/step.js';
import { createFloorWorld } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { CELL } from '../src/types/floor-map.js';
import { bal, dummy, gear, registry, STEP } from './fixtures/arena.js';
import { floorWorld } from './fixtures/flow-map.js';
import { block, walledMap } from './fixtures/maps.js';

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

describe('a hero hiding in foliage', () => {
  it('is found by the pack it keeps hitting from four cells deep', () => {
    const map = walledMap(30, 14, []);
    map.rooms[0].rect = { x: 0, y: 0, w: 30, h: 14 };
    for (const [x, y] of block(18, 3, 25, 10)) map.cells[y * 30 + x] = CELL.foliage;
    map.start = { x: 14.5, y: 6.5 };
    const foe = { roomId: 0, packId: 1, aggro: true, speed: 2.6, hp: 5000, maxHp: 5000, damage: 5 };
    const w = floorWorld(map, [dummy(8, 6, foe), dummy(8, 7.5, foe)]);
    w.hero.hp = w.hero.stats.maxHp = 1e9;
    for (let i = 0; i < 10; i++) stepWorld(registry, w, still, STEP);
    Object.assign(w.hero, { x: 22.5, y: 6.5 });
    let hurt = 0;
    for (let i = 0; i < 30 * 20 && hurt === 0; i++) {
      const events = stepWorld(registry, w, still, STEP);
      hurt += events.filter((e) => e.kind === 'heroHit' && e.amount > 0).length;
      if (i % 15 === 0)
        hitMonster(makeCtx(registry, w, []), w.monsters[0], 50, 'fire', { source: 'skill' });
    }
    expect(hurt).toBeGreaterThan(0);
  });
});
