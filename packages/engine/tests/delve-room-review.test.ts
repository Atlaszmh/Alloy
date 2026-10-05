import { describe, it, expect } from 'vitest';
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import { botInput } from '../src/arpg/bot.js';
import { UNREACHED } from '../src/arpg/flow.js';
import { isWalkable, moveCircle } from '../src/arpg/grid.js';
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

describe('a generated floor', () => {
  it('spawns no foe wedged where it cannot move', { timeout: 60_000 }, () => {
    const wedged: string[] = [];
    for (let depth = 1; depth <= 30; depth++)
      for (let seed = 1; seed <= 20; seed++) {
        const w = floor(depth, seed);
        for (const m of w.monsters) {
          const moved = [
            [0.2, 0],
            [-0.2, 0],
            [0, 0.2],
            [0, -0.2],
          ].map(([dx, dy]) => {
            const p = moveCircle(w.map, m, m.radius, dx, dy);
            return Math.hypot(p.x - m.x, p.y - m.y);
          });
          if (Math.max(...moved) < 1e-6) wedged.push(`d${depth} s${seed} ${m.defId} r ${m.radius}`);
        }
      }
    expect(wedged).toEqual([]);
  });
});

describe('a foe after the hero', () => {
  // A foe that wants to move (awake, in its field's reach, out of reach of the hero, no wind-up,
  // charge or stagger, not holding cover or its goal, touching no other foe) yet stays put.
  it('never stalls 3 s on a floor the bot fights through', { timeout: 180_000 }, () => {
    const stalls: string[] = [];
    for (let s = 4; s <= 7; s++)
      for (let depth = 1; depth <= 20; depth++) {
        const w = floor(depth, 1000 + s * 7919);
        w.hero.hp = w.hero.stats.maxHp = 1e12;
        const since = new Map<number, { x: number; y: number; t: number }>();
        for (let i = 0; i < 90 / STEP && !w.exited; i++) {
          stepWorld(registry, w, botInput(registry, w, 'thorough'), STEP);
          for (const m of w.monsters) {
            const gap = Math.hypot(m.x - w.hero.x, m.y - w.hero.y) - m.radius - w.hero.radius;
            const cell = Math.floor(m.y) * w.map.width + Math.floor(m.x);
            const wants =
              !m.dead &&
              m.aggro &&
              !m.goingHome &&
              (w.flow.small?.[cell] ?? UNREACHED) <= 20 &&
              m.windupUntil <= 0 &&
              m.chargeUntil <= w.t &&
              w.t >= m.status.staggerUntil &&
              gap > m.attackRange + 0.5 &&
              m.job !== 'cover' &&
              !(m.goal && Math.hypot(m.x - m.goal.x, m.y - m.goal.y) < 0.6) &&
              !w.monsters.some(
                (o) =>
                  o !== m &&
                  !o.dead &&
                  Math.hypot(o.x - m.x, o.y - m.y) < o.radius + m.radius + 0.15,
              );
            const at = since.get(m.id);
            if (!wants) since.delete(m.id);
            else if (!at || Math.hypot(m.x - at.x, m.y - at.y) > 0.3)
              since.set(m.id, { x: m.x, y: m.y, t: w.t });
            else if (w.t - at.t >= 3) {
              stalls.push(`d${depth} s${1000 + s * 7919} ${m.defId} at ${m.x},${m.y}`);
              since.delete(m.id);
            }
          }
        }
      }
    expect(stalls).toEqual([]);
  });
});
