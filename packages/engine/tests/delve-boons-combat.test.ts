import { describe, it, expect } from 'vitest';
import { applyBuffs, computeHeroStats } from '../src/delve/hero-stats.js';
import { buffSum } from '../src/delve/boons.js';
import { hitMonster, hurtHero, makeCtx } from '../src/arpg/combat.js';
import { dodgeMax, dodgeRecharge, perfectOrigin, refundDodgeCharge } from '../src/arpg/dodge.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { BoonEffect, Buff } from '../src/types/boon.js';
import { canAfford, lifeCost } from '../src/arpg/abilities/cast.js';
import { guardLand } from '../src/arpg/abilities/defend.js';
import { abilityHit, knobHitOpts } from '../src/arpg/abilities/impact.js';
import { NEUTRAL, stepBonus } from '../src/arpg/abilities/resolve.js';
import {
  arena,
  bal,
  dodge,
  dummy,
  firstBlow,
  gear,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  STEP,
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

describe('the dodge (dodge.ts)', () => {
  it('dodgeCharges: more charges (at least 1), refunded and refilled to the new max', () => {
    const w = wear(arena([], { noBasic: true }), { dodgeCharges: 1 });
    const max = bal.dodge.charges + 1;
    expect(dodgeMax(bal, w.hero.boon)).toBe(max);
    expect(dodgeMax(bal, buffSum([buff({ dodgeCharges: -5 })]))).toBe(1);
    w.hero.dodgeCharges = max - 1;
    refundDodgeCharge(ctxOf(w));
    expect(w.hero.dodgeCharges).toBe(max);
    w.hero.dodgeCharges = 0;
    w.hero.dodgeRechargeAt = w.t + bal.dodge.recharge;
    run(w, bal.dodge.recharge * max + 0.1);
    expect([w.hero.dodgeCharges, w.hero.dodgeRechargeAt]).toEqual([max, 0]);
  });

  it('dodgeRecharge: a charge comes back sooner, at most twice as fast', () => {
    const fast = dodgeRecharge(bal, buffSum([buff({ dodgeRecharge: 0.9 })]));
    expect(fast).toBeCloseTo(bal.dodge.recharge * 0.5, 12);
    const w = wear(arena([], { noBasic: true }), { dodgeRecharge: 0.2 });
    dodge(w);
    expect(w.hero.dodgeRechargeAt - w.hero.dodge!.start).toBeCloseTo(bal.dodge.recharge * 0.8, 9);
  });

  it('dodgeWindow lengthens the perfect window, never past the i-frames', () => {
    const { perfectWindow: pw, iframes } = bal.dodge;
    const late = (pw + iframes) / 2;
    const perfectAt = (seconds: number, ...effects: BoonEffect[]) => {
      const w = wear(arena([], { noBasic: true }), ...effects);
      dodge(w);
      w.t = w.hero.dodge!.start + seconds;
      return perfectOrigin(ctxOf(w)) !== null;
    };
    expect(perfectAt(late)).toBe(false);
    expect(perfectAt(late, { dodgeWindow: late / pw - 1 + 0.01 })).toBe(true);
    expect(perfectAt(iframes + 0.01, { dodgeWindow: 5 })).toBe(false);
  });

  it('perfectAlways: a hit anywhere in the i-frames makes a perfect dodge', () => {
    const perfect = (always: boolean) => {
      const w = arena([], { noBasic: true });
      if (always) wear(w, { perfectAlways: true });
      dodge(w);
      w.t = w.hero.dodge!.start + bal.dodge.iframes - 0.01;
      const events: ArpgEvent[] = [];
      hurtHero(makeCtx(registry, w, events), 50, null, null);
      return events.some((e) => e.kind === 'perfectDodge');
    };
    expect([perfect(false), perfect(true)]).toEqual([false, true]);
  });
});

describe('Free Cast (cast.ts)', () => {
  const caster = (damage: number) => {
    const w = noCrit(
      wear(arena([dummy(13, 30)], { noBasic: true }), { freeCast: { seconds: 1.5, damage } }),
    );
    w.hero.manaRegen = 0;
    return w;
  };
  /** Mana a press spends after `wait` seconds (from a dodge, or not). */
  const spent = (dodged: boolean, wait: number) => {
    const w = caster(0);
    if (dodged) dodge(w, { x: 1, y: 0 });
    run(w, wait);
    const mana = w.hero.mana;
    press(w, 0);
    return mana - w.hero.mana;
  };

  it('the first ability within its seconds of a dodge is free; later, or without one, it pays', () => {
    const soon = bal.dodge.duration + STEP;
    expect(spent(true, soon)).toBe(0);
    expect(spent(false, soon)).toBeGreaterThan(0);
    expect(spent(true, 1.6)).toBeGreaterThan(0);
  });

  it("its hits carry the boon's damage", () => {
    const hit = (damage: number) => {
      const w = caster(damage);
      dodge(w, { x: 1, y: 0 });
      run(w, bal.dodge.duration + STEP);
      return firstHit([...press(w, 0), ...run(w, 1)], 'skill');
    };
    expect(hit(0.25)).toBeCloseTo(hit(0) * 1.25, 6);
  });
});

describe('Blood Price (cast.ts, basic.ts)', () => {
  const bleeder = () => {
    const w = wear(arena([dummy(13, 30)], { noBasic: true }), { bloodPrice: 0.5 });
    w.hero.manaRegen = 0;
    w.hero.stats = { ...w.hero.stats, lifeRegen: 0 };
    return w;
  };

  it('an ability costs life, not mana: cost / manaMax × p × maxHp', () => {
    const w = bleeder();
    const h = w.hero;
    const cost = moveOf(w, 0).cost;
    const life = lifeCost(h, cost);
    expect(life).toBeCloseTo((cost / h.manaMax) * 0.5 * h.stats.maxHp, 9);
    const [hp, mana] = [h.hp, h.mana];
    pressOnly(w, 0);
    expect(h.mana).toBe(mana);
    expect(h.hp).toBeCloseTo(hp - life, 9);
  });

  it('refuses a cast that would leave under 1 life; a move costing no mana costs no life', () => {
    const w = bleeder();
    const ab = moveOf(w, 0);
    w.hero.hp = lifeCost(w.hero, ab.cost) + 0.5;
    const events = pressOnly(w, 0);
    expect(events.some((e) => e.kind === 'noMana')).toBe(true);
    expect(w.hero.windup).toBeNull();
    expect(canAfford(w, { ...ab, cost: 0 })).toBe(true);
  });

  it('Drain gives no mana under it', () => {
    const drained = (blood: boolean) => {
      const w = bleeder();
      if (!blood) wear(w);
      w.hero.mana = 0;
      w.hero.drainLeft[0] = 10;
      hitMonster(ctxOf(w), w.monsters[0], 10, null, { source: 'skill', slot: 0, manaOnHit: 2 });
      return w.hero.mana;
    };
    expect([drained(false), drained(true)]).toEqual([2, 0]);
  });

  it('basic hits give no mana under it', () => {
    const gain = (blood: boolean) => {
      const w = arena([dummy(13, 34.5)]);
      if (blood) wear(w, { bloodPrice: 0.5 });
      w.hero.manaRegen = 0;
      w.hero.mana = 0;
      firstBlow(w);
      return w.hero.mana;
    };
    expect(gain(false)).toBeGreaterThan(0);
    expect(gain(true)).toBe(0);
  });
});

describe("the Defensive's duration (forms.ts buff)", () => {
  it('defendDuration lengthens its effect', () => {
    const warded = (x: number) => {
      const w = arena([dummy(13, 30)], { noBasic: true });
      if (x) wear(w, { defendDuration: x });
      press(w, 1);
      return w;
    };
    const plain = warded(0);
    const long = warded(0.5);
    const d = moveOf(plain, 1).duration;
    const cast = plain.hero.defend!.until - d;
    expect(long.hero.defend!.until - cast).toBeCloseTo(d * 1.5, 9);
  });
});

describe('Last Stand (combat.ts hurtHero)', () => {
  it('once a floor, crossing under its threshold takes less damage for its seconds', () => {
    const w = wear(arena([], { noBasic: true }), {
      lastStand: { below: 0.2, reduce: 0.5, seconds: 2 },
    });
    const ctx = ctxOf(w);
    const h = w.hero;
    const max = h.stats.maxHp;
    /** Life lost to a hit of `f` × max life, as a fraction of max life. */
    const hurt = (f: number) => {
      const before = h.hp;
      hurtHero(ctx, f * max, null, null, { unavoidable: true });
      return (before - h.hp) / max;
    };
    h.hp = 0.3 * max;
    expect(hurt(0.05)).toBeCloseTo(0.05, 9); // to 0.25: above it
    expect(hurt(0.1)).toBeCloseTo(0.1, 9); // to 0.15: the crossing hit lands in full
    expect(hurt(0.04)).toBeCloseTo(0.02, 9); // halved while it runs
    w.t += 2.1;
    expect(hurt(0.02)).toBeCloseTo(0.02, 9); // over
    h.hp = 0.5 * max;
    hurt(0.4); // crosses again: once a floor
    expect(hurt(0.02)).toBeCloseTo(0.02, 9);
  });
});

describe("Hunted's gear chance (combat.ts dropLoot)", () => {
  it("gear multiplies an elite's gear chance", () => {
    const items = (gear: number) => {
      const w = wear(arena([{ ...dummy(13, 30), kind: 'elite', hp: 1 }], { noBasic: true }), {
        gear,
      });
      hitMonster(ctxOf(w), w.monsters[0], 100, null, { source: 'skill' });
      return w.drops.filter((d) => d.kind === 'item').length;
    };
    // `drops.elite.gearChance` is 0.5: × 2 always, × 0 never.
    expect([items(2), items(0)]).toEqual([1, 0]);
  });
});

describe('a floor-long barrier (Stone Skin)', () => {
  const floorBarrier = () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    w.hero.barrier = { hp: 1000, max: 1000, until: Infinity };
    return w;
  };

  /** Set off Obsidian (fire onto earth) under a barrier of `hp`; its `until` after. */
  const obsidian = (hp: number) => {
    const w = floorBarrier();
    w.hero.barrier!.hp = hp;
    const [m] = w.monsters;
    m.status.stacks.earth = 1;
    m.status.stackUntil.earth = 1e9;
    hitMonster(ctxOf(w), m, 10, 'fire', { source: 'skill', stacks: 1 });
    return w.hero.barrier!.until;
  };

  it('Obsidian, smaller or larger, keeps it floor-long', () => {
    expect(obsidian(1000)).toBe(Infinity); // smaller: extends
    expect(obsidian(1e-6)).toBe(Infinity); // larger: replaces
  });

  it('Guard, larger, takes it over and keeps it floor-long; on a timed barrier it times as before', () => {
    const w = floorBarrier();
    w.hero.barrier!.hp = 1;
    guardLand(ctxOf(w), { ...NEUTRAL, guardOnLand: 0.5 });
    expect(w.hero.barrier).toMatchObject({ hp: w.hero.stats.maxHp * 0.5, until: Infinity });
    w.hero.barrier = { hp: 1, max: 1, until: w.t + 1 };
    guardLand(ctxOf(w), { ...NEUTRAL, guardOnLand: 0.5 });
    expect(w.hero.barrier!.until).toBeCloseTo(w.t + bal.runes.guardSeconds, 9);
  });
});

describe('review fixes', () => {
  it("lowLife reaches a thrown Burst's hit", () => {
    const burst = (boon: boolean) => {
      const w = noCrit(
        arena([dummy(13, 30)], {
          noBasic: true,
          primary: { moves: [{ kind: 'medium', form: 'burst', elements: ['fire'] }] },
        }),
      );
      if (boon) wear(w, { lowLife: { below: 0.25, mult: 0.4 } });
      w.monsters[0].hp = w.monsters[0].maxHp * 0.1;
      return firstHit([...press(w, 0), ...run(w, 2)], 'skill');
    };
    expect(burst(true)).toBeCloseTo(burst(false) * 1.4, 6);
  });

  it('lifeCost is 0 with no mana pool', () => {
    const w = wear(arena([], { noBasic: true }), { bloodPrice: 0.5 });
    w.hero.manaMax = 0;
    expect(lifeCost(w.hero, 10)).toBe(0);
  });

  it('a hit without stackTime never shortens a longer stack timer', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    const ctx = ctxOf(w);
    const [m] = w.monsters;
    hitMonster(ctx, m, 10, 'fire', { source: 'skill', applies: ['burn'], stacks: 1, stackTime: 1 });
    hitMonster(ctx, m, 10, 'fire', { source: 'skill', applies: ['burn'], stacks: 1 });
    expect(m.status.stackUntil.fire).toBeCloseTo(w.t + bal.stacks.duration.fire * 2, 9);
  });
});
