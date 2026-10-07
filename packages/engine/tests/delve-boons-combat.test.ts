import { describe, it, expect } from 'vitest';
import { applyBuffs, computeHeroStats } from '../src/delve/hero-stats.js';
import { buffSum } from '../src/delve/boons.js';
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { BoonEffect, Buff } from '../src/types/boon.js';
import { abilityHit, knobHitOpts } from '../src/arpg/abilities/impact.js';
import { NEUTRAL, stepBonus } from '../src/arpg/abilities/resolve.js';
import {
  arena,
  bal,
  dummy,
  firstBlow,
  gear,
  moveOf,
  press,
  registry,
  run,
} from './fixtures/arena.js';

// The boons spec §2: each combat field at its one site. Without the boon, nothing moves.

const STATS = computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry);
const buff = (effect: BoonEffect): Buff => ({ boon: 'test', tier: 1, effect });

/** The hero wears these boons: its `boon` view only (its stats stay as built). */
function wear(w: ArpgWorld, ...effects: BoonEffect[]): ArpgWorld {
  w.hero.boon = buffSum(effects.map(buff));
  return w;
}
const ctxOf = (w: ArpgWorld) => makeCtx(registry, w, []);

/** The first hit's amount from `source` in `events` (NaN: none). */
function firstHit(events: ArpgEvent[], source: 'basic' | 'skill'): number {
  const e = events.find((x) => x.kind === 'hit' && x.source === source);
  return e?.kind === 'hit' ? e.amount : NaN;
}

describe('applyBuffs (hero-stats.ts)', () => {
  it('maxLife multiplies max life per entry, the product floored at 0.3', () => {
    const s = applyBuffs(STATS, [buff({ maxLife: -0.2 }), buff({ maxLife: 0.5 })]);
    expect(s.maxHp).toBeCloseTo(STATS.maxHp * 0.8 * 1.5, 9);
    const floor = applyBuffs(STATS, [buff({ maxLife: -0.5 }), buff({ maxLife: -0.5 })]);
    expect(floor.maxHp).toBeCloseTo(STATS.maxHp * 0.3, 9);
  });

  it('tempo multiplies the tempo by (1 − x) per entry, the product floored at 0.5', () => {
    const s = applyBuffs(STATS, [buff({ tempo: 0.1 }), buff({ tempo: 0.2 })]);
    expect(s.tempo).toBeCloseTo(STATS.tempo * 0.9 * 0.8, 12);
    const floor = applyBuffs(STATS, [buff({ tempo: 0.4 }), buff({ tempo: 0.4 })]);
    expect(floor.tempo).toBeCloseTo(STATS.tempo * 0.5, 12);
  });

  it('lifesteal adds', () => {
    const s = applyBuffs(STATS, [buff({ lifesteal: 0.015 }), buff({ lifesteal: 0.025 })]);
    expect(s.lifesteal).toBeCloseTo(STATS.lifesteal + 0.04, 12);
  });

  it('Blood Price stops mana regen; a boon without these fields leaves them be', () => {
    const blood = applyBuffs(STATS, [buff({ manaRegen: 0.5 }), buff({ bloodPrice: 0.5 })]);
    expect(blood.manaRegenMult).toBe(0);
    const plain = applyBuffs(STATS, [buff({ damage: 0.2 })]);
    expect([plain.maxHp, plain.tempo, plain.lifesteal, plain.manaRegenMult]).toEqual([
      STATS.maxHp,
      STATS.tempo,
      STATS.lifesteal,
      STATS.manaRegenMult,
    ]);
  });
});

const BOLT = { kind: 'medium', form: 'bolt', elements: ['fire'] } as const;

/** No crits, so twin worlds roll alike whatever their timing. */
function noCrit(w: ArpgWorld): ArpgWorld {
  w.hero.stats = { ...w.hero.stats, critChance: 0 };
  return w;
}

describe('the damage path: kind, first move, step bonus (impact.ts, resolve.ts)', () => {
  it("byKind and firstMove scale an ability's hit by its kind and its chain step", () => {
    const w = arena([], {
      noBasic: true,
      primary: { moves: [BOLT, { ...BOLT, kind: 'heavy' }] },
    });
    const ctx = ctxOf(w);
    const [first, second] = [moveOf(w, 0, 0), moveOf(w, 0, 1)];
    const before = [abilityHit(ctx, first), abilityHit(ctx, second)];
    wear(w, { byKind: { heavy: 0.3 } }, { firstMove: 0.25 });
    expect(abilityHit(ctx, first)).toBeCloseTo(before[0] * 1.25, 9);
    expect(abilityHit(ctx, second)).toBeCloseTo(before[1] * 1.3, 9);
  });

  it('byKind scales a basic blow by the kind it plays as', () => {
    const blow = (boon: boolean) => {
      const w = noCrit(arena([dummy(13, 34.5)]));
      if (boon) wear(w, { byKind: { light: 0.5, medium: 0.5, heavy: 0.5, hold: 0.5 } });
      return firstHit(firstBlow(w), 'basic');
    };
    expect(blow(true)).toBeCloseTo(blow(false) * 1.5, 6);
  });

  it('stepBonus adds to the chain step bonus, its power and its size', () => {
    const s = bal.chains.stepBonus;
    expect(stepBonus(bal, 0, 0.05)).toEqual(stepBonus(bal, 0));
    expect(stepBonus(bal, 2, 0.05).power).toBeCloseTo(1 + (s + 0.05) * 2, 12);
    expect(stepBonus(bal, 2, 0.05).size).toBeCloseTo(1 + s + 0.05, 12);
  });

  it("a chain's second move lands with the boon's step bonus", () => {
    const second = (boon: boolean) => {
      const w = noCrit(arena([dummy(13, 30)], { noBasic: true, primary: { moves: [BOLT, BOLT] } }));
      if (boon) wear(w, { stepBonus: 0.1 });
      // The last move landed now: the next press casts the second.
      w.hero.comboStep[0] = 0;
      w.hero.comboAt[0] = w.t;
      return firstHit([...press(w, 0), ...run(w, 1)], 'skill');
    };
    const s = bal.chains.stepBonus;
    expect(second(true)).toBeCloseTo((second(false) * (1 + s + 0.1)) / (1 + s), 6);
  });
});

describe('the damage path: per foe (combat.ts)', () => {
  it("lowLife: more on a foe under its threshold, from the hero's hits only", () => {
    const w = wear(arena([dummy(13, 30)], { noBasic: true }), {
      lowLife: { below: 0.25, mult: 0.4 },
    });
    const ctx = ctxOf(w);
    const [m] = w.monsters;
    m.hp = m.maxHp * 0.5;
    expect(hitMonster(ctx, m, 100, null, { source: 'skill' })).toBeCloseTo(100, 9);
    m.hp = m.maxHp * 0.2;
    expect(hitMonster(ctx, m, 100, null, { source: 'skill' })).toBeCloseTo(140, 9);
    expect(hitMonster(ctx, m, 100, null, { source: 'dot' })).toBeCloseTo(100, 9);
  });

  it('nearFoes: more per awake foe within its radius of the hero, to its cap', () => {
    const near = (aggro: boolean) => [
      dummy(13, 34, { aggro }),
      dummy(14, 35, { aggro }),
      dummy(12, 35, { aggro }),
    ];
    const boon = { nearFoes: { per: 0.05, cap: 2, radius: 4 } };
    const awake = wear(
      arena([...near(true), dummy(13, 20, { aggro: true })], { noBasic: true }),
      boon,
    );
    expect(hitMonster(ctxOf(awake), awake.monsters[3], 100, null, { source: 'skill' })).toBeCloseTo(
      110,
      9,
    );
    const asleep = wear(arena(near(false), { noBasic: true }), boon);
    expect(
      hitMonster(ctxOf(asleep), asleep.monsters[0], 100, null, { source: 'skill' }),
    ).toBeCloseTo(100, 9);
  });
});

describe('stackTime (combat.ts applyStacks)', () => {
  it('lengthens the stacks a hit applies; a hit carries the knob through knobHitOpts', () => {
    expect(knobHitOpts({ ...NEUTRAL, stackTime: 0.3 }).stackTime).toBe(0.3);
    const w = arena([dummy(13, 30)], { noBasic: true });
    const ctx = ctxOf(w);
    const [m] = w.monsters;
    const fire = { source: 'skill', applies: ['burn'], stacks: 1 } as const;
    hitMonster(ctx, m, 10, 'fire', { ...fire, applies: [...fire.applies] });
    expect(m.status.stackUntil.fire).toBeCloseTo(w.t + bal.stacks.duration.fire, 9);
    hitMonster(ctx, m, 10, 'fire', { ...fire, applies: [...fire.applies], stackTime: 0.5 });
    expect(m.status.stackUntil.fire).toBeCloseTo(w.t + bal.stacks.duration.fire * 1.5, 9);
  });
});
