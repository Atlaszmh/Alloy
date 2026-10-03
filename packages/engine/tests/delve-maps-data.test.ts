import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { LayoutsDataSchema, ShrinesDataSchema } from '../src/data/schemas.js';
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

  it('refuses a mask of the wrong size or with an unknown cell, and a list without a default', () => {
    const room = (masks: string[][]) => ({
      ...layoutsData,
      rooms: { default: [{ id: 'r', w: 4, h: 4, masks }] },
    });
    expect(ok(LayoutsDataSchema, layoutsData)).toBe(true);
    expect(ok(LayoutsDataSchema, room([['....', '.#%.', '....', '....']]))).toBe(true);
    expect(ok(LayoutsDataSchema, room([['....', '....', '....']]))).toBe(false);
    expect(ok(LayoutsDataSchema, room([['....', '..x.', '....', '....']]))).toBe(false);
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
