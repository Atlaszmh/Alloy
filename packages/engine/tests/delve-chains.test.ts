import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import { activeMove, nextMove } from '../src/arpg/abilities/cast.js';
import { defendingAbility, gainCharge } from '../src/arpg/abilities/defend.js';
import {
  chargeCap,
  defaultBasic,
  defaultChains,
  resolveAbility,
  resolveChain,
} from '../src/arpg/abilities/resolve.js';
import { botInput } from '../src/arpg/bot.js';
import { applyStatus, hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import {
  CHAIN_SKILLS,
  MAX_CHAIN,
  MOVE_KINDS,
  type FormId,
  type Move,
  type MoveKind,
} from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { ComboStepDef } from '../src/types/delve.js';
import type { ManaType } from '../src/types/mana.js';
import {
  STEP,
  arena,
  bal,
  chainsWith,
  dummy,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
} from './fixtures/arena.js';

// See the moves and chains spec. The fixture arena's hero stands at (13, 36) facing up (−y);
// `dummy(x, y)` is a sturdy Fire foe that doesn't fight back.

/** A move of `form` (a Bolt by default) of `kind`, in Fire unless given. */
const m = (kind: MoveKind, form: FormId = 'bolt', elements: ManaType[] = ['fire']): Move => ({
  kind,
  form,
  elements,
});
const WINDOW = bal.abilities.comboWindow;

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

describe('resolving a chain', () => {
  const stats = computeHeroStats({}, registry);

  it("resolves each move at its kind's weight with the chain's payment, and a hold's three stages", () => {
    const moves = [m('light'), m('medium'), m('heavy'), m('hold')];
    const chain = resolveChain(registry, stats, 'primary', { moves, payment: 'cast' });
    expect(chain.payment).toBe('cast');
    expect(chain.moves.map((ab) => [ab.kind, ab.weight, ab.payment, ab.index, ab.last])).toEqual([
      ['light', -1, 'cast', 0, false],
      ['medium', 0, 'cast', 1, false],
      ['heavy', 1, 'cast', 2, false],
      ['hold', 0, 'cast', 3, true],
    ]);
    chain.moves.forEach((ab, i) =>
      expect(ab.power).toBeCloseTo(
        resolveAbility(registry, 'primary', moves[i], 'cast', stats).power,
      ),
    );
    expect(chain.hold.slice(0, 3)).toEqual([null, null, null]);
    const stages = chain.hold[3]!;
    expect(stages.map((ab) => [ab.weight, ab.stage, ab.index, ab.last])).toEqual([
      [0, 0, 3, true],
      [1, 1, 3, true],
      [2, 2, 3, true],
    ]);
    // A hold move's own row is its stage 0.
    expect(chain.moves[3]).toEqual(stages[0]);
  });

  it("fires Volley's darts by kind: a hold's stages fire a medium's, a heavy's and a hold's", () => {
    const moves = MOVE_KINDS.map((kind) => m(kind, 'volley'));
    const chain = resolveChain(registry, stats, 'primary', { moves, payment: 'mana' });
    expect(chain.moves.map((ab) => ab.count)).toEqual([3, 3, 5, 3]);
    expect(chain.hold[3]!.map((ab) => ab.count)).toEqual([3, 5, 5]);
  });

  it("needs each move's own charge (a hold's is its stage 2's), and the meter holds the largest", () => {
    const moves = [m('light', 'nova'), m('hold', 'nova')];
    const chain = resolveChain(registry, stats, 'ultimate', { moves, payment: 'charge' });
    const A = bal.abilities;
    const need = (w: number) => A.slots.ultimate.cost * (1 + A.weight.cost * w) * A.chargeRatio;
    expect(chain.moves[0].chargeNeed).toBeCloseTo(need(-1));
    for (const ab of [chain.moves[1], ...chain.hold[1]!])
      expect(ab.chargeNeed).toBeCloseTo(need(2));
    expect(chargeCap(chain)).toBeCloseTo(need(2));
  });

  it("gives a new hero each form's default chain with today's payments, and the weapon's basics", () => {
    const moves = (form: FormId) =>
      registry.getForm(form).defaultChain.map((kind) => m(kind, form, ['frost']));
    expect(defaultChains(registry, 'frost', 'maul')).toEqual({
      basic: [
        { kind: 'medium', element: 'frost' },
        { kind: 'heavy', element: 'frost' },
      ],
      primary: { moves: moves('bolt'), payment: 'mana' },
      defensive: { moves: moves('ward'), payment: 'mana' },
      ultimate: { moves: moves('nova'), payment: 'charge' },
    });
    expect(defaultChains(registry, 'frost', null).primary.moves.map((x) => x.kind)).toEqual([
      'light',
      'light',
      'medium',
      'heavy',
    ]);
    // The default basics on a pair: the last blow the secondary once one is bound.
    expect(defaultBasic(registry, 'sword', 'fire', 'storm')).toEqual([
      { kind: 'light', element: 'fire' },
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'storm' },
    ]);
    expect(defaultBasic(registry, null, 'nature').map((b) => b.kind)).toEqual(
      bal.hero.defaultChain,
    );
  });
});

describe('chain play', () => {
  it('steps through the chain and wraps, each move landing with its step bonus; a pause restarts', () => {
    const bolt = m('medium');
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      primary: { moves: [bolt, bolt, bolt, bolt] },
    });
    const shots: { damage: number; size: number }[] = [];
    const next: number[] = [];
    for (let i = 0; i < 5; i++) {
      next.push(nextMove(w.hero, 0, w.t, WINDOW).index);
      press(w, 0);
      const p = w.projectiles.at(-1)!;
      shots.push({ damage: p.damage, size: p.explodeRadius });
      run(w, 0.1);
    }
    expect(next).toEqual([0, 1, 2, 3, 0]);
    const sb = bal.chains.stepBonus;
    [0, 1, 2, 3, 0].forEach((i, k) => {
      expect(shots[k].damage / shots[0].damage).toBeCloseTo(1 + sb * i);
      expect(shots[k].size / shots[0].size).toBeCloseTo(1 + (sb * i) / 2);
    });
    run(w, WINDOW + 0.1);
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(0);
    press(w, 0);
    expect(w.hero.comboStep[0]).toBe(0);
  });

  it("each move pays its own cost and sets its own cooldown; a press waits only for the next move's", () => {
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      primary: { moves: [m('light'), m('heavy')] },
    });
    w.hero.manaRegen = 0;
    const [light, heavy] = w.hero.chains[0].moves;
    let mana = w.hero.mana;
    const t0 = w.t + STEP; // the press lands in the next step
    press(w, 0);
    expect(mana - w.hero.mana).toBeCloseTo(light.cost);
    expect(w.hero.cooldowns[0]).toEqual([t0 + light.cooldown, 0].map((c) => expect.closeTo(c, 6)));
    // The heavy is ready while the light cools.
    mana = w.hero.mana;
    press(w, 0);
    expect(w.hero.comboStep[0]).toBe(1);
    expect(mana - w.hero.mana).toBeCloseTo(heavy.cost);
    expect(w.hero.cooldowns[0][1]).toBeGreaterThan(w.t);
    // Its next move (the light, wrapped to) cooling: the press waits.
    w.hero.cooldowns[0][0] = w.t + 5;
    pressOnly(w, 0);
    expect(w.hero.windup).toBeNull();
    expect(w.queuedCast).not.toBeNull();
  });

  it("refuses a move it can't afford (noMana), and the chain doesn't advance", () => {
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      primary: { moves: [m('light'), m('heavy')] },
    });
    w.hero.manaRegen = 0;
    press(w, 0);
    w.hero.mana = moveOf(w, 0, 1).cost - 1;
    const events = press(w, 0);
    expect(events.some((e) => e.kind === 'noMana' && e.slot === 0)).toBe(true);
    expect(w.hero.comboStep[0]).toBe(0);
    w.hero.mana = w.hero.manaMax;
    press(w, 0);
    expect(w.hero.comboStep[0]).toBe(1);
  });

  it("a Ward → Blink chain's second press puts the Blink up in the Ward's place, without a burst", () => {
    const w = arena([dummy(13, 20)], {
      noBasic: true,
      defensive: { moves: [m('medium', 'ward', ['frost']), m('medium', 'blink', ['frost'])] },
    });
    press(w, 1);
    expect(w.hero.ward).not.toBeNull();
    expect(w.hero.defend).toMatchObject({ form: 'ward', move: 0, stage: 0 });
    const events = press(w, 1, { x: 13, y: 20 });
    expect(w.hero.defend).toMatchObject({ form: 'blink', move: 1, stage: 0 });
    expect(w.hero.ward).toBeNull();
    expect(events.map((e) => e.kind)).not.toContain('wardBreak');
    expect(defendingAbility(makeCtx(registry, w, []))?.form.id).toBe('blink');
    expect(activeMove(w.hero, 1)?.index).toBe(1);
  });

  it("Galvanize takes its seconds off every move of a slot; Nightstalker off the Defensive's next move", () => {
    const w = arena([dummy(13, 30), dummy(15, 30)], {
      noBasic: true,
      primary: { moves: [m('light'), m('medium'), m('heavy')] },
      defensive: { moves: [m('medium', 'ward'), m('medium', 'armor')] },
    });
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    const h = w.hero;
    const t = w.t;
    const g = bal.reactions.galvanizeSeconds;
    h.cooldowns[0] = [t + 2, t + 0.5, t + 3];
    applyStatus(ctx, w.monsters[0], 'shock', 0);
    hitMonster(ctx, w.monsters[0], 10, 'nature', { source: 'skill' });
    expect(events.some((e) => e.kind === 'reaction' && e.reaction === 'galvanize')).toBe(true);
    expect(h.cooldowns[0]).toEqual([t + 2 - g, t, t + 3 - g]);

    h.stats.legendaries.nightstalker = 30;
    h.cooldowns[1] = [t + 5, t + 5];
    h.comboStep[1] = 0;
    h.comboAt[1] = t; // the Ward just landed: the Armor is next
    killMonster(ctx, w.monsters[1]);
    expect(h.cooldowns[1]).toEqual([t + 5, t + 4]);
  });

  it("caps the charge at the chain's largest need, pays per move, and doesn't fill while a move cools", () => {
    // A dummy in reach keeps the lull from charging.
    const w = arena([dummy(13, 33)], {
      noBasic: true,
      ultimate: { moves: [m('light', 'nova'), m('heavy', 'nova')], payment: 'charge' },
    });
    const ctx = makeCtx(registry, w, []);
    const [light, heavy] = w.hero.chains[2].moves;
    gainCharge(ctx, 1e9);
    expect(w.hero.charge[2]).toBeCloseTo(heavy.chargeNeed);
    press(w, 2);
    expect(w.hero.charge[2]).toBeCloseTo(heavy.chargeNeed - light.chargeNeed);
    // The light's lockout runs: nothing charges the slot meanwhile, and the heavy can't be paid.
    gainCharge(ctx, 5);
    expect(w.hero.charge[2]).toBeCloseTo(heavy.chargeNeed - light.chargeNeed);
    expect(nextMove(w.hero, 2, w.t, WINDOW).index).toBe(1);
    pressOnly(w, 2);
    expect(w.hero.windup).toBeNull();
    w.hero.cooldowns[2][0] = w.t;
    gainCharge(ctx, 5);
    expect(w.hero.charge[2]).toBeCloseTo(heavy.chargeNeed - light.chargeNeed + 5);
  });

  it("a shortened chain clamps the step, and each move's cooldown carries over", () => {
    const bolt = m('medium');
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { moves: [bolt, bolt, bolt] } });
    for (let i = 0; i < 3; i++) {
      press(w, 0);
      run(w, 0.05);
    }
    expect(w.hero.comboStep[0]).toBe(2);
    const cooling = w.hero.cooldowns[0][1];
    refreshWorldHero(registry, w, w.hero.stats, chainsWith({ primary: { moves: [bolt, bolt] } }));
    expect(w.hero.comboStep[0]).toBe(1);
    expect(w.hero.cooldowns[0]).toEqual([expect.any(Number), cooling]);
  });

  it('the bot flows through its Primary chain', () => {
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      primary: { moves: [m('light'), m('light'), m('medium'), m('heavy')] },
    });
    w.hero.cooldowns[1] = [1e9];
    w.hero.cooldowns[2] = [1e9];
    const steps = new Set<number>();
    for (let i = 0; i < Math.round(4 / STEP); i++)
      for (const e of stepWorld(registry, w, botInput(registry, w), STEP))
        if (e.kind === 'cast' && e.slot === 0) steps.add(w.hero.comboStep[0]);
    expect([...steps].sort()).toEqual([0, 1, 2, 3]);
  });
});
