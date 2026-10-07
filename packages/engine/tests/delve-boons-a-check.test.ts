import { describe, it, expect } from 'vitest';
import { boonsProblems } from '../src/data/boons-check.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { BoonsBalanceSchema } from '../src/data/schemas.js';
import type { BoonDef } from '../src/types/boon.js';

// See the boons spec, "1. The boon row" (the load checks) and "4. The stop" (`delve.boons`).

const registry = createDefaultRegistry();
const data = loadAndValidateData();
const withBoons = (boons: BoonDef[]) => boonsProblems(new DataRegistry({ ...data, boons }));
const vigor = data.boons[0];
const tiers = (effect: object) => [0, 1, 2].map(() => ({ text: 'x', effect })) as BoonDef['tiers'];

describe('boonsProblems', () => {
  it('finds none in the shipped data', () => {
    expect(boonsProblems(registry)).toEqual([]);
  });

  it('catches a repeated id, a tier without text, a bad knob key, a bad role and a cap of 4', () => {
    expect(withBoons([vigor, vigor])).toEqual(['vigor: a second row with this id']);
    const blank = {
      ...vigor,
      tiers: [vigor.tiers[0], { ...vigor.tiers[1], text: ' ' }, vigor.tiers[2]],
    };
    expect(withBoons([blank as BoonDef])).toEqual(['vigor: tier 2 has no text']);
    expect(withBoons([{ ...vigor, tiers: tiers({ knobs: { haste: 1 } }) }])).toEqual([
      "vigor: tier 1's knob haste is no Knobs key",
      "vigor: tier 2's knob haste is no Knobs key",
      "vigor: tier 3's knob haste is no Knobs key",
    ]);
    expect(
      withBoons([{ ...vigor, tiers: tiers({ attune: { role: 'third', points: 4 } }) }]),
    ).toHaveLength(3);
    expect(withBoons([{ ...vigor, cap: 4 as never }])).toEqual(['vigor: a cap of 4, not 1 to 3']);
  });
});

describe('delve.boons', () => {
  it("holds the spec's offer: three cards, four bands from depth 1", () => {
    expect(registry.getDelveBalance().boons).toEqual({
      offers: 3,
      tierWeights: [
        { fromDepth: 1, weights: [80, 18, 2] },
        { fromDepth: 10, weights: [65, 28, 7] },
        { fromDepth: 20, weights: [50, 35, 15] },
        { fromDepth: 35, weights: [40, 38, 22] },
      ],
    });
  });

  it('refuses bands that start past depth 1 or fail to ascend', () => {
    const ok = (tierWeights: { fromDepth: number; weights: number[] }[]) =>
      BoonsBalanceSchema.safeParse({ offers: 3, tierWeights }).success;
    expect(
      ok([
        { fromDepth: 1, weights: [1, 1, 1] },
        { fromDepth: 5, weights: [1, 1, 1] },
      ]),
    ).toBe(true);
    expect(ok([{ fromDepth: 2, weights: [1, 1, 1] }])).toBe(false);
    expect(
      ok([
        { fromDepth: 1, weights: [1, 1, 1] },
        { fromDepth: 1, weights: [1, 1, 1] },
      ]),
    ).toBe(false);
    expect(ok([{ fromDepth: 1, weights: [1, 1] }])).toBe(false);
  });
});
