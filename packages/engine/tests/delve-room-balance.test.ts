import { describe, it, expect } from 'vitest';
import { createMonsterEntity, depthGrowth } from '../src/arpg/world.js';
import rawBalance from '../src/data/balance.json';
import {
  LayoutBalanceSchema,
  PackAiBalanceSchema,
  TerrainBalanceSchema,
} from '../src/data/schemas.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { bal, registry } from './fixtures/arena.js';

// See the room objects spec: `delve.terrain` and `delve.ai.pack` (schema-checked), maps at most
// 96 × 96, and the depth's foe growth that crumbling structures and hazards scale by.

const raw = rawBalance.delve;

describe('delve.terrain and delve.ai.pack', () => {
  it('load with the balance', () => {
    expect(bal.terrain).toMatchObject({ slowMult: 0.6, bossSlowMult: 0.8, fuse: 0.4 });
    expect(bal.ai.pack).toMatchObject({ directorEvery: 0.25, ring: { on: false } });
  });

  it('refuse a misspelled number and a slow ground that speeds up', () => {
    expect(TerrainBalanceSchema.safeParse({ ...raw.terrain, slowMul: 0.6 }).success).toBe(false);
    expect(TerrainBalanceSchema.safeParse({ ...raw.terrain, slowMult: 1.2 }).success).toBe(false);
    const pack = raw.ai.pack;
    expect(PackAiBalanceSchema.safeParse({ ...pack, ring: { on: 1 } }).success).toBe(false);
    expect(
      PackAiBalanceSchema.safeParse({ ...pack, ambush: { ...pack.ambush, ambushChance: 2 } })
        .success,
    ).toBe(false);
  });
});

describe('delve.layout', () => {
  it('keeps maps at most 96 × 96: the coarse grid times its cell', () => {
    const ok = (coarseCell: number) =>
      LayoutBalanceSchema.safeParse({ ...raw.layout, coarseCell }).success;
    expect([ok(raw.layout.coarseCell), ok(24), ok(25)]).toEqual([true, true, false]);
  });
});

describe('depthGrowth', () => {
  it("is a foe's life and damage growth, ramp included", () => {
    const def = registry.getBiomeForDepth(1).monsters[0];
    for (const depth of [1, 2, 4, 5, 9, 17]) {
      const g = depthGrowth(registry, depth);
      const m = createMonsterEntity(
        registry,
        { id: 1, def, kind: 'normal', depth, door: null, element: 'fire', x: 0, y: 0, packId: 1 },
        new SeededRNG(1),
      );
      expect(m.maxHp).toBe(Math.round(bal.monster.baseHp * g.hp * def.hp * g.ramp));
      expect(m.damage).toBe(Math.round(bal.monster.baseDmg * g.dmg * def.dmg * g.ramp));
    }
    expect(depthGrowth(registry, 1)).toEqual({ hp: 1, dmg: 1, ramp: bal.monster.earlyRamp[0] });
    expect(depthGrowth(registry, 9).ramp).toBe(1);
  });
});
