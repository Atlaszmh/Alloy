import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import { CHAIN_SKILLS, MAX_CHAIN, MOVE_KINDS, type MoveKind } from '../src/types/ability.js';
import type { ComboStepDef } from '../src/types/delve.js';
import { bal, registry } from './fixtures/arena.js';

// See the moves and chains spec.

describe('balance: delve.chains', () => {
  it('loads the chain numbers', () => {
    expect(bal.chains).toEqual({
      cap: { basic: 5, primary: 5, defensive: 5, ultimate: 5 },
      kindWeight: { light: -1, medium: 0, heavy: 1 },
      holdStageWeight: [0, 1, 2],
      holdTime: 1,
      holdMax: 2,
      holdStages: [0.33, 0.66],
      stepBonus: 0.1,
    });
    expect(bal.stacks.basicByKind).toEqual({ light: 1, medium: 1, heavy: 2, hold: 2 });
    expect(MOVE_KINDS).toEqual(['light', 'medium', 'heavy', 'hold']);
    expect(CHAIN_SKILLS).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    expect(MAX_CHAIN).toBe(5);
  });

  it('refuses a cap outside 1..MAX_CHAIN, a weight off the tables, stages out of order and a holdMax under holdTime', () => {
    const parses = (chains: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, chains: { ...balanceData.delve.chains, ...chains } },
      }).success;
    const cap = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
    expect(parses({})).toBe(true);
    expect(parses({ cap: { ...cap, basic: 0 } })).toBe(false);
    expect(parses({ cap: { ...cap, ultimate: MAX_CHAIN + 1 } })).toBe(false);
    expect(parses({ kindWeight: { light: -3, medium: 0, heavy: 1 } })).toBe(false);
    expect(parses({ holdStageWeight: [0, 1] })).toBe(false);
    expect(parses({ holdStages: [0.66, 0.33] })).toBe(false);
    expect(parses({ holdMax: 0.5 })).toBe(false);
  });
});

/** Each weapon's basic string before chains (`delve.json` `combo`, v0.45.0), and the unarmed one. */
const STRINGS: Record<string, ComboStepDef[]> = {
  dagger: [
    { time: 0.8, startup: 0.3, move: 0.25, power: 0.8, heft: 0.15 },
    { time: 0.8, startup: 0.3, move: 0.25, power: 0.8, heft: 0.15 },
    { time: 0.8, startup: 0.3, move: 0.3, power: 0.9, heft: 0.15 },
    { time: 1.4, startup: 0.35, move: 0.7, power: 1.7, heft: 0.6, arc: 150, knockback: 0.3 },
  ],
  sword: [
    { time: 0.9, startup: 0.3, move: 0.4, power: 1.0, heft: 0.3 },
    { time: 0.9, startup: 0.3, move: 0.4, power: 1.0, heft: 0.3 },
    {
      time: 1.3,
      startup: 0.4,
      move: 1.2,
      power: 1.7,
      heft: 0.8,
      arc: 50,
      reach: 0.9,
      knockback: 0.6,
    },
  ],
  axe: [
    { time: 0.9, startup: 0.35, move: 0.3, power: 1.0, heft: 0.4 },
    { time: 0.9, startup: 0.35, move: 0.3, power: 1.0, heft: 0.4 },
    { time: 1.3, startup: 0.4, move: 0.5, power: 1.7, heft: 0.8, arc: 360, knockback: 0.5 },
  ],
  maul: [
    { time: 1.0, startup: 0.45, move: 0.5, power: 1.0, heft: 0.6, arc: 140 },
    {
      time: 1.3,
      startup: 0.5,
      move: 0.7,
      power: 1.8,
      heft: 1.0,
      arc: 360,
      reach: 0.4,
      knockback: 0.8,
      stagger: true,
    },
  ],
  staff: [
    { time: 0.9, startup: 0.3, move: -0.1, power: 0.9, heft: 0.2 },
    { time: 0.9, startup: 0.3, move: -0.1, power: 0.9, heft: 0.2 },
    { time: 1.3, startup: 0.45, move: -0.3, power: 1.4, heft: 0.6, size: 1.8, explode: 1.0 },
  ],
  wand: [
    { time: 0.9, startup: 0.2, move: -0.05, power: 0.9, heft: 0.1 },
    { time: 0.9, startup: 0.2, move: -0.05, power: 0.9, heft: 0.1 },
    { time: 1.2, startup: 0.25, move: -0.1, power: 1.3, heft: 0.3, size: 1.5 },
  ],
  bow: [
    { time: 0.85, startup: 0.35, move: -0.05, power: 0.85, heft: 0.2 },
    { time: 0.85, startup: 0.35, move: -0.05, power: 0.85, heft: 0.2 },
    { time: 1.4, startup: 0.6, move: -0.2, power: 1.6, heft: 0.6, speed: 1.4 },
  ],
  unarmed: [
    { time: 0.9, startup: 0.3, move: 0.3, power: 1.0, heft: 0.2 },
    { time: 0.9, startup: 0.3, move: 0.3, power: 1.0, heft: 0.2 },
    { time: 1.2, startup: 0.35, move: 0.5, power: 1.3, heft: 0.4, knockback: 0.3 },
  ],
};

/** A weapon's feel table, its default chain and its arc (the unarmed ones from `hero`). */
function weapon(id: string) {
  if (id === 'unarmed') return { feel: bal.hero.feel, chain: bal.hero.defaultChain, arc: 90 };
  const base = registry.getGearBase(id);
  return { feel: base.feel!, chain: base.defaultChain!, arc: base.attack!.arc ?? 90 };
}

/** Every number of a row, with its defaults filled in and rounded (so 0.35 × 1.5 is 0.525). */
function numbers(row: ComboStepDef, arc: number) {
  const r = (x: number) => +x.toFixed(6);
  return {
    time: r(row.time),
    startup: r(row.startup),
    move: r(row.move),
    power: r(row.power),
    heft: r(row.heft),
    arc: r(row.arc ?? arc),
    reach: r(row.reach ?? 0),
    knockback: r(row.knockback ?? 0),
    size: r(row.size ?? 1),
    explode: r(row.explode ?? 0),
    speed: r(row.speed ?? 1),
    stagger: !!row.stagger,
  };
}

describe('data: feel tables and default chains', () => {
  it("each weapon's default chain reproduces its string blow for blow, and so does the unarmed one", () => {
    expect(registry.getGearBasesForSlot('weapon').map((b) => b.id)).toEqual(
      Object.keys(STRINGS).filter((id) => id !== 'unarmed'),
    );
    for (const [id, string] of Object.entries(STRINGS)) {
      const { feel, chain } = weapon(id);
      expect(
        chain.map((k) => feel[k]),
        id,
      ).toEqual(string);
    }
    expect(weapon('dagger').chain).toEqual(['light', 'light', 'medium', 'heavy']);
    expect(weapon('maul').chain).toEqual(['medium', 'heavy']);
    for (const id of ['sword', 'axe', 'staff', 'wand', 'bow', 'unarmed'])
      expect(weapon(id).chain, id).toEqual(['light', 'light', 'heavy']);
  });

  it('a medium row the string lacks is halfway between light and heavy in every number', () => {
    for (const id of ['sword', 'axe', 'staff', 'wand', 'bow', 'unarmed']) {
      const { feel, arc } = weapon(id);
      const [light, medium, heavy] = [feel.light, feel.medium, feel.heavy].map((row) =>
        numbers(row, arc),
      );
      for (const k of Object.keys(medium) as (keyof typeof medium)[])
        if (k !== 'stagger')
          expect(medium[k], `${id} ${k}`).toBeCloseTo(
            ((light[k] as number) + (heavy[k] as number)) / 2,
          );
    }
  });

  it("the maul's light is its medium, softer and quicker", () => {
    const { medium, light } = weapon('maul').feel;
    expect(numbers(light, 360)).toEqual(
      numbers(
        {
          ...medium,
          power: medium.power * 0.8,
          time: medium.time * 0.85,
          startup: medium.startup * 0.9,
          heft: medium.heft * 0.75,
          move: medium.move * 0.8,
        },
        360,
      ),
    );
  });

  it('a hold row is the heavy one: 50% longer to start, 30% harder and 0.2 heftier (at most 1)', () => {
    for (const id of Object.keys(STRINGS)) {
      const { feel, arc } = weapon(id);
      const { heavy } = feel;
      expect(numbers(feel.hold, arc), id).toEqual(
        numbers(
          {
            ...heavy,
            startup: heavy.startup * 1.5,
            power: heavy.power * 1.3,
            heft: Math.min(1, heavy.heft + 0.2),
          },
          arc,
        ),
      );
    }
  });

  it("each form's default chain follows its old press-combo: ≤ 0.9 light, ≤ 1.2 medium, else heavy", () => {
    const old: Record<string, number[]> = {
      bolt: [0.8, 0.8, 1, 1.5],
      volley: [1, 1, 1],
      lance: [1, 1, 1.4],
      burst: [1, 1, 1.5],
      strike: [1, 1, 1.2, 1.8],
    };
    const kind = (m: number): MoveKind => (m <= 0.9 ? 'light' : m <= 1.2 ? 'medium' : 'heavy');
    for (const form of registry.getArpgData().forms)
      expect(form.defaultChain, form.id).toEqual((old[form.id] ?? [1]).map(kind));
    expect(registry.getForm('volley').countByKind).toEqual({
      light: 3,
      medium: 3,
      heavy: 5,
      hold: 5,
    });
  });
});
