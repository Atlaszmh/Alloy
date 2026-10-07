import { describe, it, expect } from 'vitest';
import {
  createDelveProfile,
  emptyHaul,
  type EconomyRow,
  type EconomyReport,
  type Haul,
} from '@alloy/engine';
import { RARITY_COLOR } from '../../format';
import { getDelveRegistry } from '../../registry';
import {
  MATERIAL_TOTALS,
  economyLines,
  economyMaterials,
  formatAmount,
  parseSeeds,
  perDive,
} from '../economy-model';

const NONE = { common: 0, uncommon: 0, magic: 0, rare: 0, epic: 0, legendary: 0 };
const NO_BOONS = {
  offense: 0,
  element: 0,
  defense: 0,
  tempo: 0,
  fortune: 0,
  pact: 0,
  floor: 0,
};
/** A report's final save: the view never reads it. */
const PROFILE = createDelveProfile(getDelveRegistry(), 1);
const haul = (over: Partial<Haul> = {}): Haul => ({ ...emptyHaul(), ...over });
function dive(n: number, over: Partial<EconomyRow> = {}): EconomyRow {
  return {
    dive: n,
    income: haul(),
    quests: haul(),
    salvaged: haul(),
    spent: haul(),
    stops: haul(),
    boons: NO_BOONS,
    forged: NONE,
    depth: n,
    died: false,
    lost: null,
    ...over,
  };
}

describe('the Economy view model', () => {
  it("counts each material a haul holds: the currencies, each kind's total, each metal and flux grade", () => {
    const empty = emptyHaul();
    const h = haul({
      scrap: 120,
      dust: 4,
      links: 1,
      metals: { ...empty.metals, rusty: 3, iron: 2 },
      flux: { ...empty.flux, magic: 1 },
      shards: { damage: [2, 1], armor: [0, 0, 1] },
      essences: { anything: 1 },
      runes: { split: [1, 0, 2] } as Haul['runes'],
    });
    const of = Object.fromEntries(economyMaterials().map((m) => [m.id, m.of(h)]));
    expect(of).toMatchObject({
      scrap: 120,
      dust: 4,
      links: 1,
      bars: 5,
      flux: 1,
      shards: 4,
      essences: 1,
      runes: 3,
      'metal:rusty': 3,
      'metal:iron': 2,
      'metal:voidforged': 0,
      'flux:magic': 1,
      'flux:epic': 0,
    });
    expect(MATERIAL_TOTALS.map((m) => m.id)).toEqual([
      'scrap',
      'dust',
      'links',
      'bars',
      'flux',
      'shards',
      'essences',
      'runes',
    ]);
    const labels = economyMaterials().map((m) => m.label);
    expect(labels).toContain('Rusty bars');
    expect(labels).toContain('Magic flux');
  });

  it("takes each dive's mean over the seeds, or a sum for deaths", () => {
    const a: EconomyReport = {
      seed: 1,
      dives: [dive(1, { depth: 3 }), dive(2, { depth: 5, died: true })],
      profile: PROFILE,
    };
    const b: EconomyReport = {
      seed: 2,
      dives: [dive(1, { depth: 4 }), dive(2, { depth: 8, died: true })],
      profile: PROFILE,
    };
    expect(perDive([a, b], (d) => d.depth)).toEqual([3.5, 6.5]);
    expect(perDive([a, b], (d) => (d.died ? 1 : 0), true)).toEqual([0, 2]);
    expect(perDive([], (d) => d.depth)).toEqual([]);
  });

  it("draws a material's income, quest rewards, Anvil salvage, spending and death loss, the items forged by rarity, the depth or the deaths", () => {
    const r: EconomyReport = {
      seed: 1,
      dives: [
        dive(1, {
          income: haul({ scrap: 50 }),
          quests: haul({ scrap: 40 }),
          salvaged: haul({ scrap: 6 }),
          spent: haul({ scrap: 20 }),
          forged: { ...NONE, magic: 1 },
          died: true,
          lost: haul({ scrap: 8 }),
        }),
        dive(2),
      ],
      profile: PROFILE,
    };
    // A dive that lost nothing (`lost: null`) counts 0.
    expect(economyLines([r], 'scrap').map((l) => [l.label, l.values])).toEqual([
      ['Scrap in', [50, 0]],
      ['Scrap from quests', [40, 0]],
      ['Scrap salvaged', [6, 0]],
      ['Scrap spent', [20, 0]],
      ['Scrap lost', [8, 0]],
    ]);
    const forged = economyLines([r], 'forged');
    expect(forged.map((l) => l.label)).toEqual([
      'Common',
      'Uncommon',
      'Magic',
      'Rare',
      'Epic',
      'Legendary',
    ]);
    expect(forged[2]).toMatchObject({ color: RARITY_COLOR.magic, values: [1, 0] });
    expect(economyLines([r], 'depth')).toMatchObject([{ label: 'Deepest depth', values: [1, 2] }]);
    expect(economyLines([r], 'deaths')).toMatchObject([{ label: 'Deaths', values: [1, 0] }]);
  });

  it('reads the seeds as whole numbers, each once, and writes amounts short', () => {
    expect(parseSeeds('1, 2,3  2 x -4 5.5')).toEqual([1, 2, 3]);
    expect(parseSeeds('')).toEqual([]);
    expect([3, 2.5, 1234].map(formatAmount)).toEqual(['3', '2.5', '1.2k']);
  });

  it('draws the boons taken, a line a family', () => {
    const r: EconomyReport = {
      seed: 1,
      dives: [dive(1, { boons: { ...NO_BOONS, offense: 2, floor: 1 } }), dive(2)],
      profile: PROFILE,
    };
    const lines = economyLines([r], 'boons');
    expect(lines.map((l) => [l.label, l.values])).toEqual([
      ['Offense', [2, 0]],
      ['Element', [0, 0]],
      ['Defense', [0, 0]],
      ['Tempo', [0, 0]],
      ['Fortune', [0, 0]],
      ['Pact', [0, 0]],
      ['Floor', [1, 0]],
    ]);
    expect(new Set(lines.map((l) => l.color)).size).toBe(7);
  });
});
