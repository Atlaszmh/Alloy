import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import {
  AiBalanceSchema,
  LayoutBalanceSchema,
  LayoutsDataSchema,
  ShrinesDataSchema,
} from '../src/data/schemas.js';
import layoutsData from '../src/data/layouts.json';
import shrinesData from '../src/data/shrines.json';
import { PROP_IDS } from '../src/types/floor-map.js';

// See the floor maps spec: "Data and tuning".

const registry = createDefaultRegistry();
const ok = (schema: { safeParse: (x: unknown) => { success: boolean } }, x: unknown) =>
  schema.safeParse(x).success;

describe('layouts.json', () => {
  const { layouts } = registry.getDelveData();

  it('rides the Delve data: rooms per biome (a default list), a boss room, the props', () => {
    expect(layouts.rooms.default.length).toBeGreaterThan(0);
    expect(layouts.boss.w).toBeGreaterThan(0);
    expect(layouts.props).toEqual({ chest: 0.9, shrine: 1.4, alcove_anvil: 1.4, exit_gate: 2.6 });
    expect(Object.keys(layouts.props)).toEqual([...PROP_IDS]);
  });

  it('names only biomes beside its default list', () => {
    const biomes = registry.getDelveData().biomes.map((b) => b.id);
    for (const id of Object.keys(layouts.rooms))
      expect(id === 'default' || biomes.includes(id), id).toBe(true);
  });

  it('refuses a template with masks (set pieces furnish rooms now), an arena drawn tall, and a list without a default', () => {
    const room = (t: object) => ({
      ...layoutsData,
      rooms: { default: [{ id: 'r', w: 12, h: 12, ...t }] },
    });
    expect(ok(LayoutsDataSchema, layoutsData)).toBe(true);
    expect(ok(LayoutsDataSchema, room({}))).toBe(true);
    expect(ok(LayoutsDataSchema, room({ masks: [] }))).toBe(false);
    expect(ok(LayoutsDataSchema, room({ w: 3 }))).toBe(false);
    expect(ok(LayoutsDataSchema, { ...layoutsData, arena: [{ id: 'a', w: 20, h: 28 }] })).toBe(
      false,
    );
    expect(ok(LayoutsDataSchema, { ...layoutsData, arena: [] })).toBe(false);
    expect(
      ok(LayoutsDataSchema, { ...layoutsData, rooms: { crypts: layoutsData.rooms.default } }),
    ).toBe(false);
  });
});

describe('shrines.json', () => {
  const shrines = registry.getDelveData().shrines;

  it('rides the Delve data: floor and dive blessings, a potion refill among them', () => {
    expect(shrines.some((s) => s.duration === 'floor')).toBe(true);
    expect(shrines.some((s) => s.duration === 'dive')).toBe(true);
    expect(shrines.some((s) => s.effect.potions)).toBe(true);
  });

  it('refuses repeated ids, an empty or unknown effect, and a refill for the dive', () => {
    const shrine = {
      id: 'a',
      name: 'A',
      text: 'A.',
      effect: { damage: 0.1 },
      duration: 'floor',
      weight: 1,
    };
    expect(ok(ShrinesDataSchema, shrinesData)).toBe(true);
    expect(ok(ShrinesDataSchema, [shrine, { ...shrine, id: 'b' }])).toBe(true);
    expect(ok(ShrinesDataSchema, [shrine, shrine])).toBe(false);
    expect(ok(ShrinesDataSchema, [{ ...shrine, effect: {} }])).toBe(false);
    expect(ok(ShrinesDataSchema, [{ ...shrine, effect: { haste: 1 } }])).toBe(false);
    expect(
      ok(ShrinesDataSchema, [{ ...shrine, effect: { potions: true }, duration: 'dive' }]),
    ).toBe(false);
  });
});

describe('delve.layout, delve.ai and the vault and den drops', () => {
  const bal = registry.getDelveBalance();

  it('holds the spec numbers; minPackDistance moved from the arena', () => {
    expect(bal.layout).toMatchObject({
      coarseCell: 24,
      coarseCols: 4,
      coarseRows: 4,
      rooms: { base: 5, perDepth: 0.1, max: 8 },
      hallWidth: 3,
      minWall: 2,
      loops: [1, 2],
      alcoveMax: 1,
      minPackDistance: 9,
      packsPerRoom: 2,
    });
    expect(bal.ai).toMatchObject({
      flowEvery: 0.25,
      flowRadius: 30,
      directRange: 4,
      sealGrace: 0.5,
    });
    expect(bal.ai).toMatchObject({ fogEvery: 0.1, exitHintSeconds: 60, shrineChannel: 0.5 });
    expect('minPackDistance' in bal.arena).toBe(false);
    expect(bal.drops.vault.essenceChance).toBeGreaterThan(0);
    expect(bal.drops.den.gearBonus).toBeGreaterThan(0);
  });

  it('fits every room template in a coarse cell inside its walls, an arena in two', () => {
    const { layouts } = registry.getDelveData();
    const fit = bal.layout.coarseCell - bal.layout.minWall;
    for (const t of [...Object.values(layouts.rooms).flat(), layouts.boss]) {
      expect(t.w, t.id).toBeLessThanOrEqual(fit);
      expect(t.h, t.id).toBeLessThanOrEqual(fit);
    }
    for (const t of layouts.arena) {
      expect(t.w, t.id).toBeLessThanOrEqual(2 * bal.layout.coarseCell - bal.layout.minWall);
      expect(t.h, t.id).toBeLessThanOrEqual(fit);
    }
  });

  it('refuses bands that skip depth 1 or fall, more rooms than the grid, and a bad ai number', () => {
    const band = (fromDepth: number) => ({ fromDepth, weights: bal.layout.kindWeights[0].weights });
    expect(ok(LayoutBalanceSchema, bal.layout)).toBe(true);
    expect(ok(LayoutBalanceSchema, { ...bal.layout, kindWeights: [band(2)] })).toBe(false);
    expect(
      ok(LayoutBalanceSchema, { ...bal.layout, kindWeights: [band(1), band(5), band(5)] }),
    ).toBe(false);
    expect(
      ok(LayoutBalanceSchema, { ...bal.layout, rooms: { base: 5, perDepth: 0, max: 17 } }),
    ).toBe(false);
    expect(ok(LayoutBalanceSchema, { ...bal.layout, minCombatRooms: 0 })).toBe(false);
    expect(ok(AiBalanceSchema, bal.ai)).toBe(true);
    expect(ok(AiBalanceSchema, { ...bal.ai, flowEvery: 0 })).toBe(false);
  });
});
