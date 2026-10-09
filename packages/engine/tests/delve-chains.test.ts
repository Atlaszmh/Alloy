import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import { abilityReady, activeMove, holdCharge, nextMove } from '../src/arpg/abilities/cast.js';
import { defendingAbility, gainCharge } from '../src/arpg/abilities/defend.js';
import {
  blowNumbers,
  chainMove,
  chargeCap,
  defaultBasic,
  defaultChains,
  moveNumbers,
  resolveAbility,
  resolveChain,
} from '../src/arpg/abilities/resolve.js';
import { botInput } from '../src/arpg/bot.js';
import { applyStatus, hitMonster, hurtHero, killMonster, makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { sandboxWeapon } from '../src/arpg/sandbox.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
import { SLOT_FORMS } from '../src/delve/profile-schema.js';
import {
  ABILITY_SLOTS,
  CHAIN_SKILLS,
  MAX_CHAIN,
  MOVE_KINDS,
  type Blow,
  type FormId,
  type Move,
  type MoveKind,
} from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { ComboStepDef } from '../src/types/delve.js';
import type { ManaType } from '../src/types/mana.js';
import {
  DEFAULT_CHAINS,
  STEP,
  arena,
  bal,
  chainsOf,
  chainsWith,
  dodge,
  dummy,
  firstBlow,
  gear,
  holdFor,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  strikeWorld,
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
      holdStages: [0.5, 1],
      stepBonus: 0.15,
      beat: { light: 0.25, medium: 0.4, heavy: 0.6, hold: 0.8 },
      beatSlot: { primary: 1, defensive: 0.75, ultimate: 1.5 },
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

/**
 * A row without its motion (`move`, `side`, `hop`: the weapon flow spec's
 * table, pinned in delve-weapon-flow.test.ts).
 */
function motionless({ move: _move, side: _side, hop: _hop, ...row }: ComboStepDef) {
  return row;
}

/** Every number of a row but its motion, with its defaults filled in and rounded (so 0.35 × 1.5 is 0.525). */
function numbers(row: ComboStepDef, arc: number) {
  const r = (x: number) => +x.toFixed(6);
  return {
    time: r(row.time),
    startup: r(row.startup),
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
        chain.map((k) => motionless(feel[k])),
        id,
      ).toEqual(string.map(motionless));
    }
    expect(weapon('dagger').chain).toEqual(['light', 'light', 'medium', 'heavy']);
    expect(weapon('maul').chain).toEqual(['medium', 'heavy']);
    for (const id of ['sword', 'axe', 'staff', 'wand', 'bow', 'unarmed'])
      expect(weapon(id).chain, id).toEqual(['light', 'light', 'heavy']);
  });

  it('a medium row the string lacks is halfway between light and heavy in every number but its motion', () => {
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

  it("each form's default chain: its old press-combo's (≤ 0.9 light, ≤ 1.2 medium, else heavy), as tuned", () => {
    // From the old multipliers: Bolt [0.8, 0.8, 1, 1.5] L L M H, Volley [1, 1, 1] M M M, Lance
    // [1, 1, 1.4] M M H, Burst [1, 1, 1.5] M M H, Strike [1, 1, 1.2, 1.8] M M M H. The DPS Lab
    // gate made Bolt's second move and Strike's third a step heavier (see the plan's gate decision).
    const L = 'light';
    const M = 'medium';
    const H = 'heavy';
    const want: Record<string, MoveKind[]> = {
      bolt: [L, M, M, H],
      volley: [M, M, M],
      lance: [M, M, H],
      burst: [M, M, H],
      strike: [M, M, H, H],
      // The constructs spec §2.2: a Whirl spins as a Lance strikes.
      whirl: [M, M, H],
    };
    for (const form of registry.getArpgData().forms)
      expect(form.defaultChain, form.id).toEqual(want[form.id] ?? [M]);
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

  it("gives a new hero each form's class default chain with today's payments, and the weapon's basics", () => {
    const moves = (form: FormId) =>
      registry.getForm(form).defaultChain.map((kind) => m(kind, form, ['frost']));
    // A maul is melee: its Primary's default is Strike (the constructs spec §2.4).
    expect(defaultChains(registry, 'frost', 'maul')).toEqual({
      basic: [
        { kind: 'medium', element: 'frost' },
        { kind: 'heavy', element: 'frost' },
      ],
      primary: { moves: moves('strike'), payment: 'mana' },
      defensive: { moves: moves('ward'), payment: 'mana' },
      ultimate: { moves: moves('nova'), payment: 'charge' },
    });
    expect(defaultChains(registry, 'frost', null).primary.moves.map((x) => x.kind)).toEqual([
      'light',
      'medium',
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
    // The fixture's sword adds its style's trait to the step bonus (constructs B1 Task 10).
    const sb = bal.chains.stepBonus + w.hero.chains[0]!.moves[0].knobs.stepBonus;
    [0, 1, 2, 3, 0].forEach((i, k) => {
      expect(shots[k].damage / shots[0].damage).toBeCloseTo(1 + sb * i);
      expect(shots[k].size / shots[0].size).toBeCloseTo(1 + (sb * i) / 2);
    });
    // The restart window counts from the beat's end.
    run(w, w.hero.beatUntil[0] - w.t + WINDOW + 0.1);
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(0);
    press(w, 0);
    expect(w.hero.comboStep[0]).toBe(0);
  });

  it("moveNumbers gives the hit and radius the sim uses: a Ward's burst and an Armor's strike-back without the step bonus", () => {
    const numbers = (w: ArpgWorld, slot: number, step: number) =>
      moveNumbers(w.hero.stats, bal, moveOf(w, slot, step));
    const aim = { x: 13, y: 29 };
    /** A chain of three medium `form` moves, pressed to its third. */
    const third = (form: FormId) => {
      const w = arena([dummy(13, 29)], {
        noBasic: true,
        weapon: 'staff',
        primary: { moves: [0, 1, 2].map(() => m('medium', form)) },
      });
      for (let i = 0; i < 2; i++) {
        press(w, 0, aim);
        run(w, 0.1);
      }
      press(w, 0, aim);
      return w;
    };
    // A 3rd-move Bolt's shot and a 3rd-move Burst: the step's power, and its size on the radius.
    const bolt = third('bolt');
    const shot = bolt.projectiles.at(-1)!;
    expect(shot.damage).toBeCloseTo(numbers(bolt, 0, 2).hit, 9);
    expect(shot.explodeRadius).toBeCloseTo(numbers(bolt, 0, 2).radius, 9);
    const burst = third('burst');
    const zone = burst.zones.at(-1)!;
    expect(zone.damage).toBeCloseTo(numbers(burst, 0, 2).hit, 9);
    expect(zone.radius).toBeCloseTo(numbers(burst, 0, 2).radius, 9);
    expect(numbers(burst, 0, 2).radius).toBeGreaterThan(moveOf(burst, 0, 2).radius);
    // A Ward on move 2 bursts (as it fades) for its hit without the step bonus: Shadow on a
    // Fire foe, which neither resists it nor is weak to it, and no crits.
    const ward: Move = { kind: 'medium', form: 'ward', elements: ['shadow'] };
    const w = arena([dummy(13, 35)], { noBasic: true, defensive: { moves: [ward, ward] } });
    w.hero.stats = { ...w.hero.stats, critChance: 0 };
    press(w, 1);
    press(w, 1);
    expect(w.hero.defend?.move).toBe(1);
    w.hero.defend!.until = w.t;
    const hits = run(w, STEP).filter((e) => e.kind === 'hit');
    expect(hits.map((e) => e.kind === 'hit' && e.amount)).toEqual([
      expect.closeTo(numbers(w, 1, 1).hit, 9),
    ]);
    // An Armor on move 2 strikes a melee attacker back for its hit without it too.
    const armor: Move = { kind: 'medium', form: 'armor', elements: ['shadow'] };
    const a = arena([dummy(13, 35)], { noBasic: true, defensive: { moves: [armor, armor] } });
    a.hero.stats = { ...a.hero.stats, critChance: 0 };
    press(a, 1);
    press(a, 1);
    expect(a.hero.defend?.move).toBe(1);
    const struck: ArpgEvent[] = [];
    hurtHero(makeCtx(registry, a, struck), 10, null, a.monsters[0], { melee: true });
    expect(struck.flatMap((e) => (e.kind === 'hit' ? [e.amount] : []))).toEqual([
      expect.closeTo(numbers(a, 1, 1).hit, 9),
    ]);
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
    expect(w.queuedCasts).toHaveLength(1);
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

  it("a Blink's trail hits after the defensive it replaces is gone: a Shadow Armor lends it no lifesteal", () => {
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      defensive: { moves: [m('medium', 'armor', ['shadow']), m('medium', 'blink', ['frost'])] },
    });
    press(w, 1);
    expect(w.hero.defend).toMatchObject({ form: 'armor', move: 0 });
    w.hero.hp = w.hero.stats.maxHp / 2;
    const events = press(w, 1, { x: 13, y: 30 });
    expect(events.some((e) => e.kind === 'hit' && e.slot === 1)).toBe(true);
    expect(events.filter((e) => e.kind === 'heal')).toEqual([]);
    expect(w.hero.defend).toMatchObject({ form: 'blink', move: 1 });
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

  it("a shortened chain clamps the step, each move's cooldown carries over, and a new move starts ready", () => {
    const bolt = m('medium');
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { moves: [bolt, bolt, bolt] } });
    for (let i = 0; i < 3; i++) {
      press(w, 0);
      run(w, 0.05);
    }
    expect(w.hero.comboStep[0]).toBe(2);
    const before = [...w.hero.cooldowns[0]];
    refreshWorldHero(registry, w, w.hero.stats, chainsWith({ primary: { moves: [bolt, bolt] } }));
    expect(w.hero.comboStep[0]).toBe(1);
    expect(w.hero.cooldowns[0]).toEqual(before.slice(0, 2));
    refreshWorldHero(
      registry,
      w,
      w.hero.stats,
      chainsWith({ primary: { moves: [bolt, bolt, bolt] } }),
    );
    expect(w.hero.cooldowns[0]).toEqual([...before.slice(0, 2), 0]);
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

describe('holds', () => {
  const still = { x: 0, y: 0 };
  const holdStep = (w: ReturnType<typeof arena>, slot = 0, move = still) =>
    stepWorld(registry, w, { move, holding: slot }, STEP);
  /** A Fire Bolt chain of `moves` (one hold by default), basic attacks off, a foe up the arena. */
  const holder = (moves: Move[] = [m('hold')]) =>
    arena([dummy(13, 30)], { noBasic: true, primary: { moves } });
  const casts = (events: ArpgEvent[]) =>
    events.filter((e): e is Extract<ArpgEvent, { kind: 'cast' }> => e.kind === 'cast');

  it('holding starts a charge only when the next move is a hold: walking slowed, and paying nothing yet', () => {
    const plain = holder([m('medium')]);
    holdStep(plain);
    expect(plain.hero.hold).toBeNull();
    expect(plain.hero.windup).toBeNull();

    const w = holder();
    w.hero.manaRegen = 0;
    const mana = w.hero.mana;
    const x = w.hero.x;
    holdStep(w, 0, { x: 1, y: 0 });
    expect(w.hero.hold).toMatchObject({ slot: 0, step: 0, start: w.t });
    expect(w.hero.hold!.aim).toMatchObject({ x: 13, y: 30 });
    holdStep(w, 0, { x: 1, y: 0 });
    expect(w.hero.x - x).toBeCloseTo(2 * w.hero.stats.moveSpeed * STEP * bal.feel.actionMove, 5);
    expect(w.hero.mana).toBe(mana);
    expect(activeMove(w.hero, 0)?.kind).toBe('hold');
  });

  it('a hold starting cancels a swing still in its startup', () => {
    const w = arena([dummy(13, 34.4)], { primary: { kind: 'hold' } });
    run(w, STEP);
    expect(w.hero.swing).not.toBeNull();
    holdStep(w);
    expect(w.hero.swing).toBeNull();
    expect(w.hero.hold).not.toBeNull();
  });

  it('reaches stage 1 halfway through holdTime and stage 2 at full charge, saying so each time', () => {
    const w = holder();
    const events: ArpgEvent[] = [];
    for (let i = 0; i < Math.round(1.2 / STEP); i++) events.push(...holdStep(w));
    const start = w.hero.hold!.start;
    const stages = events.filter((e) => e.kind === 'holdStage');
    expect(stages.map((e) => e.kind === 'holdStage' && [e.slot, e.stage])).toEqual([
      [0, 1],
      [0, 2],
    ]);
    const c = bal.chains;
    const at = (s: number) => holdCharge(bal, start, start + s, c.holdTime);
    expect(at(c.holdStages[0] * c.holdTime - 0.01).stage).toBe(0);
    expect(at(c.holdStages[0] * c.holdTime + 0.01).stage).toBe(1);
    expect(at(c.holdTime - 0.01).stage).toBe(1);
    expect(at(c.holdTime)).toEqual({ charge: 1, stage: 2 });
  });

  it("its release fires the stage's move at once, paying its cost and setting its cooldown and stacks", () => {
    const w = holder();
    w.hero.manaRegen = 0;
    const mana = w.hero.mana;
    const events = holdFor(w, 0, 0.5);
    const stage1 = w.hero.chains[0].hold[0]![1];
    expect(casts(events)).toHaveLength(1);
    expect(events.some((e) => e.kind === 'windup')).toBe(false);
    expect(w.hero.hold).toBeNull();
    expect(mana - w.hero.mana).toBeCloseTo(stage1.cost);
    expect(w.hero.cooldowns[0][0]).toBeCloseTo(w.t + stage1.cooldown);
    expect(w.projectiles.at(-1)!.explodeRadius).toBeCloseTo(stage1.radius);
    run(w, 1);
    expect(w.monsters[0].status.stacks.fire).toBe(stage1.stacks);
  });

  it('a tap winds up in full, as a plain medium move does: a medium hit', () => {
    const w = holder();
    const plain = holder([m('medium')]);
    w.hero.manaRegen = 0;
    const mana = w.hero.mana;
    const events = pressOnly(w, 0);
    pressOnly(plain, 0);
    expect(casts(events)).toHaveLength(0);
    const span = (x: ReturnType<typeof arena>) => x.hero.windup!.until - x.hero.windup!.start;
    expect(span(w)).toBeCloseTo(span(plain));
    expect(span(w)).toBeCloseTo(moveOf(plain, 0).castTime);
    expect(mana - w.hero.mana).toBeCloseTo(moveOf(w, 0).cost);
    expect(moveOf(w, 0).weight).toBe(0);
    expect(casts(run(w, moveOf(w, 0).castTime + STEP))).toHaveLength(1);
  });

  it("charging counts toward the stage's wind-up: a quick release waits out the rest, a full one fires at once", () => {
    const w = holder();
    holdStep(w);
    const start = w.hero.hold!.start;
    holdStep(w);
    const events = stepWorld(registry, w, { move: still, cast: { slot: 0 } }, STEP);
    const stage0 = chainMove(w.hero.chains[0], 0, 0);
    expect(casts(events)).toHaveLength(0);
    expect(w.hero.windup).toMatchObject({ step: 0, stage: 0 });
    expect(w.hero.windup!.until - start).toBeCloseTo(stage0.castTime, 6);
    expect(activeMove(w.hero, 0)).toBe(stage0);

    const full = holder();
    const stage2 = chainMove(full.hero.chains[0], 0, 2);
    expect(stage2.castTime).toBeLessThan(bal.chains.holdTime);
    expect(casts(holdFor(full, 0, bal.chains.holdTime))).toHaveLength(1);
    expect(full.hero.windup).toBeNull();
  });

  it('a cast-paid release gets its discount, waits out the rest of its channel, and cools from the landing', () => {
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      primary: { moves: [m('hold')], payment: 'cast' },
    });
    w.hero.manaRegen = 0;
    const mana = w.hero.mana;
    const events = holdFor(w, 0, 0.5);
    const stage1 = chainMove(w.hero.chains[0], 0, 1);
    const asMana = resolveAbility(registry, 'primary', m('hold'), 'mana', w.hero.stats, 1);
    expect(stage1.cost).toBeCloseTo(asMana.cost * bal.abilities.castManaMult);
    expect(mana - w.hero.mana).toBeCloseTo(stage1.cost);
    expect(casts(events)).toHaveLength(0);
    const wu = w.hero.windup!;
    expect(wu.stage).toBe(1);
    expect(activeMove(w.hero, 0)).toBe(stage1);
    expect(w.hero.cooldowns[0][0]).toBeCloseTo(wu.until + stage1.cooldown, 6);
    expect(casts(run(w, wu.until - w.t + STEP))).toHaveLength(1);
    // It lands at the stage it was released at.
    expect(w.projectiles.at(-1)!.explodeRadius).toBeCloseTo(stage1.radius);
  });

  it("a dodge in a released charge-paid hold's wind-up refunds its charge; the move is ready again", () => {
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      primary: { moves: [m('hold')], payment: 'charge' },
    });
    w.hero.manaRegen = 0;
    const need = moveOf(w, 0).chargeNeed;
    w.hero.charge[0] = need;
    const mana = w.hero.mana;
    holdStep(w);
    holdStep(w);
    stepWorld(registry, w, { move: still, cast: { slot: 0 } }, STEP);
    expect(w.hero.windup).toMatchObject({ step: 0, stage: 0 });
    expect(w.hero.charge[0]).toBe(0);
    dodge(w, { x: 1, y: 0 });
    expect(w.hero.windup).toBeNull();
    expect(w.hero.charge[0]).toBeCloseTo(need);
    expect(w.hero.cooldowns[0][0]).toBeLessThanOrEqual(w.t);
    expect(w.hero.mana).toBe(mana);
  });

  it('fires by itself at stage 2 past holdMax, and at its stage when the button lets go unreleased', () => {
    const w = holder();
    w.hero.manaRegen = 0;
    const mana = w.hero.mana;
    const events: ArpgEvent[] = [];
    for (let i = 0; i < Math.round((bal.chains.holdMax + 0.1) / STEP); i++)
      events.push(...holdStep(w));
    expect(casts(events)).toHaveLength(1);
    expect(mana - w.hero.mana).toBeCloseTo(w.hero.chains[0].hold[0]![2].cost);

    const lost = holder();
    lost.hero.manaRegen = 0;
    const before = lost.hero.mana;
    for (let i = 0; i < Math.round(0.5 / STEP); i++) holdStep(lost);
    const e = stepWorld(registry, lost, { move: still }, STEP);
    expect(casts(e)).toHaveLength(1);
    expect(before - lost.hero.mana).toBeCloseTo(lost.hero.chains[0].hold[0]![1].cost);
  });

  it('a stage it cannot afford at the release falls to the highest it can; none, and it ends unpaid', () => {
    const w = holder();
    w.hero.manaRegen = 0;
    const [stage0, stage1] = w.hero.chains[0].hold[0]!;
    for (let i = 0; i < Math.round(1.2 / STEP); i++) holdStep(w);
    w.hero.mana = stage1.cost + 0.1;
    const events = stepWorld(registry, w, { move: still, cast: { slot: 0 } }, STEP);
    expect(casts(events)).toHaveLength(1);
    expect(w.hero.mana).toBeCloseTo(0.1);

    const broke = holder();
    broke.hero.manaRegen = 0;
    holdStep(broke);
    broke.hero.mana = stage0.cost - 0.1;
    const none = holdFor(broke, 0, 0.5);
    expect(casts(none)).toHaveLength(0);
    expect(broke.hero.hold).toBeNull();
    expect(broke.hero.mana).toBeCloseTo(stage0.cost - 0.1);
    expect(broke.hero.cooldowns[0][0]).toBe(0);
  });

  it('a dodge, cancelHold and a changed chain drop it unpaid; its release, the button held on, does nothing', () => {
    const cases: [string, (w: ReturnType<typeof arena>) => void][] = [
      [
        'dodge',
        (w) => stepWorld(registry, w, { move: { x: 1, y: 0 }, holding: 0, dodge: true }, STEP),
      ],
      [
        'cancelHold',
        (w) => stepWorld(registry, w, { move: still, holding: 0, cancelHold: true }, STEP),
      ],
      [
        'refresh',
        (w) =>
          refreshWorldHero(registry, w, w.hero.stats, chainsWith({ primary: { kind: 'heavy' } })),
      ],
    ];
    for (const [name, drop] of cases) {
      const w = holder();
      w.hero.manaRegen = 0;
      const mana = w.hero.mana;
      for (let i = 0; i < 10; i++) holdStep(w);
      drop(w);
      expect(w.hero.hold, name).toBeNull();
      expect(w.holdDropped, name).toBe(0);
      expect(w.hero.mana, name).toBe(mana);
      expect(w.hero.cooldowns[0][0], name).toBe(0);
      holdStep(w);
      const e = stepWorld(registry, w, { move: still, cast: { slot: 0 } }, STEP);
      e.push(...run(w, 1));
      expect(casts(e), name).toHaveLength(0);
      expect(w.hero.mana, name).toBe(mana);
    }
  });

  it("a dropped hold's release is swallowed while its button stays held, and no new hold starts", () => {
    const drop = (w: ReturnType<typeof arena>) => {
      for (let i = 0; i < 10; i++) holdStep(w);
      stepWorld(registry, w, { move: { x: 1, y: 0 }, holding: 0, dodge: true }, STEP);
    };
    // Dodge, then let go during the dash: nothing fires and nothing is paid.
    const a = holder();
    a.hero.manaRegen = 0;
    const mana = a.hero.mana;
    drop(a);
    expect(a.hero.hold).toBeNull();
    const e1 = stepWorld(registry, a, { move: still, cast: { slot: 0 } }, STEP);
    e1.push(...run(a, 1));
    expect(casts(e1)).toHaveLength(0);
    expect(a.hero.mana).toBe(mana);
    expect(a.holdDropped).toBeNull();

    // Dodge, keep holding past the dash, then let go: no new hold, and nothing fires.
    const b = holder();
    b.hero.manaRegen = 0;
    drop(b);
    const e2: ArpgEvent[] = [];
    for (let i = 0; i < Math.round((bal.dodge.duration + 0.3) / STEP); i++) e2.push(...holdStep(b));
    expect(b.hero.hold).toBeNull();
    e2.push(...stepWorld(registry, b, { move: still, cast: { slot: 0 } }, STEP));
    e2.push(...run(b, 1));
    expect(casts(e2)).toHaveLength(0);
    expect(b.hero.mana).toBe(mana);
  });

  it("a dropped hold's mark clears once the button no longer holds its slot: the next hold starts", () => {
    const w = holder();
    for (let i = 0; i < 10; i++) holdStep(w);
    stepWorld(registry, w, { move: still, holding: 0, cancelHold: true }, STEP);
    expect(w.holdDropped).toBe(0);
    holdStep(w);
    expect(w.hero.hold).toBeNull();
    stepWorld(registry, w, { move: still, holding: null }, STEP);
    expect(w.holdDropped).toBeNull();
    holdStep(w);
    expect(w.hero.hold).toMatchObject({ slot: 0, step: 0 });
  });

  it('held past holdMax it fires once; the release after is swallowed, and the next hold charges', () => {
    const w = holder();
    const events: ArpgEvent[] = [];
    for (let i = 0; i < Math.round((bal.chains.holdMax + 0.5) / STEP); i++)
      events.push(...holdStep(w));
    expect(w.hero.hold).toBeNull();
    events.push(...stepWorld(registry, w, { move: still, cast: { slot: 0 } }, STEP));
    events.push(...run(w, 1));
    expect(casts(events)).toHaveLength(1);
    holdStep(w);
    expect(w.hero.hold).not.toBeNull();
  });

  it("gates presses as a wind-up does: another slot's press waits, unaged, and fires after the release", () => {
    const w = holder();
    holdStep(w);
    expect(abilityReady(makeCtx(registry, w, []), 1)).toBe(false);
    stepWorld(registry, w, { move: still, holding: 0, cast: { slot: 1 } }, STEP);
    for (let i = 0; i < Math.round(0.6 / STEP); i++) holdStep(w);
    expect(w.hero.windup).toBeNull();
    expect(w.queuedCasts.map((q) => q.cast)).toMatchObject([{ slot: 1 }]);
    const events = holdFor(w, 0, 0);
    events.push(...run(w, 0.5));
    expect(casts(events).map((e) => e.slot)).toEqual([0, 1]);
  });

  it("pauses the slot's combo window while it charges", () => {
    const w = holder([m('light'), m('hold')]);
    press(w, 0);
    for (let i = 0; i < Math.round(1.5 / STEP); i++) holdStep(w);
    expect(w.hero.hold?.step).toBe(1);
    // Past the window since the light landed, but not counting the hold: the hold is still next.
    dodge(w, { x: 1, y: 0 });
    expect(w.hero.hold).toBeNull();
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(1);
  });

  it('is deterministic: the same inputs give the same events twice, chains and holds included', () => {
    const play = () => {
      const w = arena([dummy(13, 30), dummy(15, 30)], {
        primary: { moves: [m('light'), m('hold'), m('heavy')] },
        defensive: { moves: [m('medium', 'ward'), m('medium', 'blink')] },
      });
      const events: ArpgEvent[] = [];
      for (let i = 0; i < Math.round(6 / STEP); i++)
        events.push(...stepWorld(registry, w, botInput(registry, w), STEP));
      return events;
    };
    const events = play();
    expect(events.some((e) => e.kind === 'holdStage')).toBe(true);
    expect(play()).toEqual(events);
  });

  it('the bot charges a hold to full, then lets go', () => {
    const w = holder();
    w.hero.cooldowns[1] = [1e9];
    w.hero.cooldowns[2] = [1e9];
    const events: ArpgEvent[] = [];
    let start = -1;
    for (let i = 0; i < Math.round(1.5 / STEP) && casts(events).length === 0; i++) {
      events.push(...stepWorld(registry, w, botInput(registry, w), STEP));
      if (w.hero.hold && start < 0) start = w.hero.hold.start;
    }
    expect(start).toBeGreaterThanOrEqual(0);
    expect(casts(events)).toHaveLength(1);
    expect(w.t - start).toBeGreaterThanOrEqual(bal.chains.holdTime - 1e-6);
  });
});

describe('basics', () => {
  const sword = { weapon: gear('fire') };
  const still = { x: 0, y: 0 };
  const basics = (events: ArpgEvent[]) =>
    events.filter((e): e is Extract<ArpgEvent, { kind: 'basic' }> => e.kind === 'basic');

  it("estimateCombat values each weapon's default chain as it valued its string (v0.45.0)", () => {
    // A rare ilvl-12 Fire weapon on a Fire/Storm pair with Twin Fang 40, at depth 5; the
    // abilities one medium move each (a Volley's, a Ward's, a Nova's numbers are as they were).
    // Re-pinned for the cast styles' numbers (constructs B1 Task 8) and traits (Task 10: the
    // dagger's crit, the axe's cleave, the wand's homing).
    const today: Record<string, number> = {
      unarmed: 13.233961,
      dagger: 184.91344,
      sword: 195.522722,
      axe: 235.071228,
      maul: 393.325829,
      staff: 144.600175,
      wand: 114.895307,
      bow: 160.731032,
    };
    const one = (form: FormId, payment: 'mana' | 'charge') => ({
      moves: [m('medium', form)],
      payment,
    });
    const chains = {
      primary: one('volley', 'mana'),
      defensive: one('ward', 'mana'),
      ultimate: one('nova', 'charge'),
    };
    for (const [id, dps] of Object.entries(today)) {
      const weapon =
        id === 'unarmed'
          ? undefined
          : sandboxWeapon(registry, { baseId: id, mana: 'fire', rarity: 'rare', ilvl: 12 });
      const stats = computeHeroStats(weapon ? { weapon } : {}, registry, {
        pair: { primary: 'fire', secondary: 'storm' },
        legendaries: { twin_fang: 40 },
      });
      expect(estimateCombat(stats, registry, 5, chains).dps, id).toBeCloseTo(dps, 5);
    }
  });

  it("each blow strikes in its own element, powered by its attunement, with its kind's stacks", () => {
    const k = bal.pair.basicPowerPerAttune;
    const w = strikeWorld(sword, {
      pair: { primary: 'fire', secondary: 'frost' },
      attunement: { frost: 5 },
      basic: [
        { kind: 'light', element: 'frost' },
        { kind: 'heavy', element: 'fire' },
      ],
    });
    const [a, b] = w.hero.stats.weapon.blows;
    expect(a).toMatchObject({ kind: 'light', element: 'frost' });
    expect(a.attunePower).toBeCloseTo(1 + 5 * k);
    expect(b.attunePower).toBeCloseTo(1 + 1 * k); // the Fire sword's own 1
    expect(basics(firstBlow(w))[0]).toMatchObject({ element: 'frost', moveKind: 'light', step: 0 });
    expect(w.monsters[0].status.stacks).toMatchObject({
      frost: bal.stacks.basicByKind.light,
      fire: 0,
    });
    expect(basics(firstBlow(w))[0]).toMatchObject({ element: 'fire', moveKind: 'heavy', step: 1 });
  });

  it('blowNumbers gives the hit and the stacks the sim deals: a light and a heavy blow', () => {
    for (const kind of ['light', 'heavy'] as const) {
      const w = strikeWorld(
        sword,
        {
          pair: { primary: 'fire', secondary: 'shadow' },
          attunement: { shadow: 5 },
          basic: [{ kind, element: 'shadow' }],
        },
        false,
        dummy(13, 34.5, { traits: [] }),
      );
      // Shadow on a Fire foe, which neither resists it nor is weak to it, and no crits.
      w.hero.stats = { ...w.hero.stats, critChance: 0 };
      const n = blowNumbers(w.hero.stats, bal, w.hero.stats.weapon.blows[0]);
      const hits = firstBlow(w).filter((e) => e.kind === 'hit');
      expect(
        hits.map((e) => e.kind === 'hit' && e.amount),
        kind,
      ).toEqual([expect.closeTo(n.hit, 9)]);
      expect(w.monsters[0].status.stacks.shadow, kind).toBe(n.stacks);
    }
  });

  it("Twin Fang doubles the chain's last blow, whatever its kind", () => {
    const w = strikeWorld(sword, {
      legendaries: { twin_fang: 100 },
      basic: [
        { kind: 'heavy', element: 'fire' },
        { kind: 'light', element: 'fire' },
      ],
    });
    const hits = (events: ArpgEvent[]) =>
      events.filter((e) => e.kind === 'hit' && e.source === 'basic').length;
    expect(hits(firstBlow(w))).toBe(1);
    expect(hits(firstBlow(w))).toBe(2);
  });

  it("a manual hold blow holds at its strike point while the attack stays held, then strikes with its stage's row", () => {
    // Its foe a little off, past where a leap is skipped.
    const w = strikeWorld(
      sword,
      { basic: [{ kind: 'hold', element: 'fire' }] },
      false,
      dummy(13, 33.5),
    );
    const f = w.hero.stats.weapon.feel;
    const iv = w.hero.stats.attackInterval;
    const held = { move: still, attack: true };
    stepWorld(registry, w, held, STEP);
    const sw = w.hero.swing!;
    // It starts as a medium blow.
    expect(sw.strikeAt - sw.start).toBeCloseTo(iv * f.medium.time * f.medium.startup);
    const events: ArpgEvent[] = [];
    while (w.t < sw.strikeAt + 0.5) events.push(...stepWorld(registry, w, held, STEP));
    expect(basics(events)).toHaveLength(0);
    expect(events.filter((e) => e.kind === 'holdStage')).toEqual([
      { kind: 'holdStage', slot: null, stage: 1 },
    ]);
    // A heavy lunges further than a medium: let go, it leaps the rest, then strikes as it
    // lands, `stepSeconds` later (see the weapon flow spec).
    const release = stepWorld(registry, w, { move: still, attack: false }, STEP);
    expect(basics(release)).toHaveLength(0);
    expect(w.hero.swing).toMatchObject({ released: 1 });
    const letGo = w.t;
    const landing: ArpgEvent[] = [];
    for (let i = 0; i < 30 && basics(landing).length === 0; i++)
      landing.push(...stepWorld(registry, w, { move: still, attack: false }, STEP));
    expect(basics(landing)[0]).toMatchObject({ moveKind: 'heavy', heft: f.heavy.heft });
    expect(w.t - letGo).toBeGreaterThanOrEqual(bal.feel.stepSeconds - 1e-6);
    expect(w.t - letGo).toBeLessThan(bal.feel.stepSeconds + STEP);
    // Its startup was spent holding: the rest of the heavy row's cycle follows the strike.
    expect(w.hero.nextAttackAt).toBeCloseTo(w.t + iv * f.heavy.time * (1 - f.heavy.startup));
    expect(w.monsters[0].status.stacks.fire).toBe(bal.stacks.basicByKind.heavy);
  });

  it('a manual hold blow let go before its strike point strikes as a medium; held past holdMax, at stage 2', () => {
    const tap = strikeWorld(sword, { basic: [{ kind: 'hold', element: 'fire' }] });
    const tapped = stepWorld(registry, tap, { move: still, attack: false, attackTap: true }, STEP);
    for (let i = 0; i < 60 && basics(tapped).length === 0; i++)
      tapped.push(...stepWorld(registry, tap, { move: still, attack: false }, STEP));
    expect(basics(tapped)[0].moveKind).toBe('medium');

    const long = strikeWorld(sword, { basic: [{ kind: 'hold', element: 'fire' }] });
    const events: ArpgEvent[] = [];
    for (let i = 0; i < Math.round((bal.chains.holdMax + 1) / STEP); i++)
      events.push(...stepWorld(registry, long, { move: still, attack: true }, STEP));
    expect(basics(events)[0].moveKind).toBe('hold');
  });

  it("a tapped hold blow keeps a medium blow's timing, though its strike point falls between ticks", () => {
    const tapped = (kind: MoveKind) => {
      const w = strikeWorld(sword, { basic: [{ kind, element: 'fire' }] });
      const events = stepWorld(registry, w, { move: still, attack: false, attackTap: true }, STEP);
      const sw = w.hero.swing!;
      for (let i = 0; i < 60 && basics(events).length === 0; i++)
        events.push(...stepWorld(registry, w, { move: still, attack: false }, STEP));
      expect(basics(events)[0].moveKind).toBe('medium');
      return { sw, next: w.hero.nextAttackAt };
    };
    const hold = tapped('hold');
    const medium = tapped('medium');
    // The tap strikes on the first tick past its strike point, a part of a tick late.
    const ticks = (hold.sw.strikeAt - hold.sw.start) / STEP;
    expect(Math.abs(ticks - Math.round(ticks))).toBeGreaterThan(0.01);
    expect(hold.sw.start).toBe(medium.sw.start);
    expect(hold.next).toBeCloseTo(medium.next, 9);
  });

  it("a held blow re-aims as it strikes, at the nearest foe or the attack's aim; a tap strikes where it began", () => {
    const staff = { weapon: gear('fire', 'weapon', 'staff') };
    /** The heading of a hold blow's shot whose foe, ahead, moves round to the hero's right before it strikes. */
    const heading = (held: boolean, aim: { x: number; y: number } | null = null) => {
      const w = strikeWorld(
        staff,
        { basic: [{ kind: 'hold', element: 'fire' }] },
        false,
        dummy(13, 30),
      );
      const press = held
        ? { move: still, attack: true }
        : { move: still, attack: false, attackTap: true };
      stepWorld(registry, w, press, STEP);
      const sw = w.hero.swing!;
      expect(sw.dir.y).toBeCloseTo(-1);
      if (held) while (w.t < sw.strikeAt + 0.4) stepWorld(registry, w, press, STEP);
      Object.assign(w.monsters[0], { x: 19, y: 36 });
      const events: ArpgEvent[] = [];
      for (let i = 0; i < 60 && basics(events).length === 0; i++)
        events.push(
          ...stepWorld(registry, w, { move: still, attack: false, attackAim: aim }, STEP),
        );
      const shot = w.projectiles.find((p) => p.owner === 'hero')!;
      return Math.atan2(shot.vy, shot.vx);
    };
    expect(heading(true)).toBeCloseTo(0); // at the foe, now to its right
    expect(heading(true, { x: 7, y: 36 })).toBeCloseTo(Math.PI); // at the aim, to its left
    expect(heading(false)).toBeCloseTo(-Math.PI / 2); // a tap: ahead, as it began
  });

  it("a held sword blow re-aims as it strikes: it turns to its foe, or to the attack's aim past it", () => {
    /** A sword hold blow held past its strike point while its foe, ahead, moves round to the hero's right. */
    const release = (aimLeft: boolean) => {
      const w = strikeWorld(sword, { basic: [{ kind: 'hold', element: 'fire' }] });
      const held = { move: still, attack: true };
      stepWorld(registry, w, held, STEP);
      const sw = w.hero.swing!;
      expect(sw.dir.y).toBeCloseTo(-1);
      while (w.t < sw.strikeAt + 0.4) stepWorld(registry, w, held, STEP);
      const h = w.hero;
      Object.assign(w.monsters[0], { x: h.x + 1.5, y: h.y });
      const attackAim = aimLeft ? { x: h.x - 5, y: h.y } : null;
      const events = stepWorld(registry, w, { move: still, attack: false, attackAim }, STEP);
      const hit = events.some((e) => e.kind === 'hit' && e.id === w.monsters[0].id);
      return { h, blow: basics(events)[0], hit };
    };
    const toFoe = release(false);
    expect(toFoe.blow.dir).toEqual({ x: expect.closeTo(1), y: expect.closeTo(0) });
    expect(toFoe.h.facing).toEqual({ x: expect.closeTo(1), y: expect.closeTo(0) });
    expect(toFoe.hit).toBe(true);
    // Let go aiming left: the blow follows the aim, and its old foe, behind, isn't struck.
    const aimed = release(true);
    const range = aimed.h.stats.weapon.range;
    expect(aimed.blow.dir).toEqual({ x: expect.closeTo(-1), y: expect.closeTo(0) });
    expect(aimed.blow.tx).toBeCloseTo(aimed.h.x - range);
    expect(aimed.blow.ty).toBeCloseTo(aimed.h.y);
    expect(aimed.hit).toBe(false);
  });

  it('an automatic hold blow plays the hold row straight: a slow, hard blow with its stacks', () => {
    const w = strikeWorld(sword, { basic: [{ kind: 'hold', element: 'fire' }] });
    const f = w.hero.stats.weapon.feel;
    run(w, STEP);
    const sw = w.hero.swing!;
    expect(sw.strikeAt - sw.start).toBeCloseTo(
      w.hero.stats.attackInterval * f.hold.time * f.hold.startup,
    );
    expect(basics(firstBlow(w))[0]).toMatchObject({ moveKind: 'hold', heft: f.hold.heft });
    expect(w.monsters[0].status.stacks.fire).toBe(bal.stacks.basicByKind.hold);
  });

  it('an ability press while a manual hold blow charges cancels it unstruck', () => {
    const w = strikeWorld(sword, { basic: [{ kind: 'hold', element: 'fire' }] });
    const held = { move: still, attack: true };
    stepWorld(registry, w, held, STEP);
    const sw = w.hero.swing!;
    while (w.t < sw.strikeAt + 0.2) stepWorld(registry, w, held, STEP);
    expect(w.hero.swing?.held).toBeTypeOf('number');
    const events = stepWorld(registry, w, { ...held, cast: { slot: 0 } }, STEP);
    events.push(...stepWorld(registry, w, { move: still, attack: false }, STEP));
    expect(basics(events)).toHaveLength(0);
    expect(w.hero.swing).toBeNull();
    expect(w.hero.windup).not.toBeNull();
  });

  it('a manual attack held on charges each hold blow to holdMax', () => {
    const w = strikeWorld(sword, { basic: [{ kind: 'hold', element: 'fire' }] });
    const blows: { t: number; kind: MoveKind }[] = [];
    for (let i = 0; i < Math.round(6 / STEP); i++)
      for (const e of basics(stepWorld(registry, w, { move: still, attack: true }, STEP)))
        blows.push({ t: w.t, kind: e.moveKind });
    expect(blows.map((b) => b.kind)).toEqual(['hold', 'hold']);
    expect(blows[1].t - blows[0].t).toBeGreaterThan(bal.chains.holdMax);
  });

  it('a basic-chain edit that changes its blows drops a swing in flight, as a weapon swap does', () => {
    // On the chain's third blow, winding up; then the chain becomes two blows.
    const w = strikeWorld(sword, {}, true);
    run(w, STEP);
    expect(w.hero.swing?.step).toBe(2);
    const two: Blow[] = [
      { kind: 'light', element: 'fire' },
      { kind: 'light', element: 'fire' },
    ];
    refreshWorldHero(
      registry,
      w,
      computeHeroStats(sword, registry, { basic: two }),
      DEFAULT_CHAINS,
    );
    expect(w.hero.swing).toBeNull();
    expect(basics(firstBlow(w))[0].step).toBe(0);
    // Only the elements changed: the swing carries on.
    const same = strikeWorld(sword, {}, true);
    run(same, STEP);
    const storm = same.hero.stats.weapon.blows.map((b) => ({
      kind: b.kind,
      element: 'storm' as const,
    }));
    refreshWorldHero(
      registry,
      same,
      computeHeroStats(sword, registry, { basic: storm }),
      DEFAULT_CHAINS,
    );
    expect(same.hero.swing?.step).toBe(2);
  });
});

describe('the save schema', () => {
  it("holds each slot's forms as arpg.json does", () => {
    for (const slot of ABILITY_SLOTS)
      expect(SLOT_FORMS[slot]).toEqual(
        registry
          .getArpgData()
          .forms.filter((f) => f.slot === slot)
          .map((f) => f.id),
      );
  });
});
