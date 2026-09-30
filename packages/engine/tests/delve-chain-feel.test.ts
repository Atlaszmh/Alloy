import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import delveData from '../src/data/delve.json';
import { BalanceConfigSchema, DelveDataSchema } from '../src/data/schemas.js';
import { inBeat, nextMove, pressMove } from '../src/arpg/abilities/cast.js';
import { beatFor, chainMove, holdFull, resolveChain } from '../src/arpg/abilities/resolve.js';
import { respawnHero } from '../src/arpg/sandbox.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import {
  computeHeroStats,
  damagePerUse,
  estimateCombat,
  useInterval,
  valuedMove,
} from '../src/delve/hero-stats.js';
import type { AbilityPayment, AbilitySlot, Move, MoveKind } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import {
  STEP,
  arena,
  bal,
  chainsWith,
  dodge,
  dummy,
  gear,
  holdFor,
  press,
  pressOnly,
  registry,
  run,
  strikeWorld,
  type ArenaOpts,
  type ChainOpts,
} from './fixtures/arena.js';

// See the chain feel spec. The fixture arena's hero stands at (13, 36) facing up (−y);
// `dummy(x, y)` is a sturdy Fire foe that doesn't fight back.

const still = { x: 0, y: 0 };
const WINDOW = bal.abilities.comboWindow;
/** A move of `kind`: a Fire Bolt. */
const m = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
/** Basic attacks off, a foe up the arena, the Primary a chain of `moves` (two mediums by default). */
const beater = (moves: Move[] = [m('medium'), m('medium')], o: ArenaOpts = {}) =>
  arena([dummy(13, 30)], { noBasic: true, primary: { moves }, ...o });
/** Step (with `input`) until `done` says so of a step's events: every event, and the time then. */
function until(w: ArpgWorld, done: (events: ArpgEvent[]) => boolean, input = {}) {
  const events: ArpgEvent[] = [];
  for (let i = 0; i < 300; i++) {
    const e = stepWorld(registry, w, { move: still, ...input }, STEP);
    events.push(...e);
    if (done(e)) return { events, at: w.t };
  }
  throw new Error('never came');
}
const windup = (slot: number) => (events: ArpgEvent[]) =>
  events.some((e) => e.kind === 'windup' && e.slot === slot);
const castSlots = (events: ArpgEvent[]) =>
  events.flatMap((e) => (e.kind === 'cast' ? [e.slot] : []));
const MAUL: EquippedGear = {
  weapon: gear('fire', 'weapon', 'maul'),
  chest: gear('earth', 'chest'),
};
const casts = (events: ArpgEvent[]) =>
  events.filter((e): e is Extract<ArpgEvent, { kind: 'cast' }> => e.kind === 'cast');
/** Seconds after `from` of each `holdStage` event (its stage) while `step` runs `seconds`. */
function stageTimes(w: ArpgWorld, from: () => number, seconds: number, step: () => ArpgEvent[]) {
  const out: [number, number][] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++)
    for (const e of step()) if (e.kind === 'holdStage') out.push([e.stage, w.t - from()]);
  return out;
}
/** `at` is the first tick at or after `time`. */
const tickAfter = (at: number, time: number) => {
  expect(at).toBeGreaterThanOrEqual(time - 1e-6);
  expect(at).toBeLessThan(time + STEP);
};

const TEMPO: Record<string, number> = {
  wand: 0.8,
  dagger: 0.85,
  bow: 0.95,
  sword: 1,
  staff: 1.05,
  axe: 1.15,
  maul: 1.3,
};

describe('balance: tempo, hold stages and beats', () => {
  it('loads the numbers', () => {
    expect(bal.hero.tempo).toBe(1);
    expect(bal.chains.holdStages).toEqual([0.5, 1]);
    expect(bal.chains.beat).toEqual({ light: 0.25, medium: 0.4, heavy: 0.6, hold: 0.8 });
    expect(bal.chains.beatSlot).toEqual({ primary: 1, defensive: 0.75, ultimate: 1.5 });
    const weapons = registry.getGearBasesForSlot('weapon');
    expect(Object.fromEntries(weapons.map((b) => [b.id, b.tempo]))).toEqual(TEMPO);
  });

  it('refuses a stage past full charge, a beat or tempo that is not positive, and a weapon with no tempo', () => {
    const chains = (o: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, chains: { ...balanceData.delve.chains, ...o } },
      }).success;
    const hero = (o: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, hero: { ...balanceData.delve.hero, ...o } },
      }).success;
    expect(chains({})).toBe(true);
    expect(chains({ holdStages: [0.5, 1.1] })).toBe(false);
    expect(chains({ holdStages: [1, 1] })).toBe(false);
    expect(chains({ beat: { ...bal.chains.beat, heavy: 0 } })).toBe(false);
    expect(chains({ beatSlot: { ...bal.chains.beatSlot, ultimate: -1 } })).toBe(false);
    expect(hero({ tempo: 0 })).toBe(false);

    const bases = (edit: (b: Record<string, unknown>) => Record<string, unknown>) =>
      DelveDataSchema.safeParse({
        ...delveData,
        bases: delveData.bases.map((b) => (b.id === 'maul' ? edit(b) : b)),
      }).success;
    expect(bases((b) => b)).toBe(true);
    expect(bases(({ tempo: _tempo, ...b }) => b)).toBe(false);
    expect(bases((b) => ({ ...b, tempo: 0 }))).toBe(false);
  });

  it('names the base missing its tempo, and refuses a tempo on a base that is no weapon', () => {
    const parse = (id: string, edit: (b: Record<string, unknown>) => Record<string, unknown>) =>
      DelveDataSchema.safeParse({
        ...delveData,
        bases: delveData.bases.map((b) => (b.id === id ? edit(b) : b)),
      });
    const maul = delveData.bases.findIndex((b) => b.id === 'maul');
    const missing = parse('maul', ({ tempo: _tempo, ...b }) => b);
    expect(missing.error?.issues.map((i) => i.path)).toEqual([['bases', maul, 'tempo']]);
    const armor = delveData.bases.findIndex((b) => b.slot !== 'weapon');
    const worn = parse(delveData.bases[armor].id, (b) => ({ ...b, tempo: 1 }));
    expect(worn.error?.issues.map((i) => i.path)).toEqual([['bases', armor, 'tempo']]);
  });
});

describe('tempo', () => {
  it("is the weapon's, and the hero's unarmed", () => {
    for (const [baseId, tempo] of Object.entries(TEMPO)) {
      const weapon = gear('fire', 'weapon', baseId);
      expect(computeHeroStats({ weapon }, registry).tempo, baseId).toBe(tempo);
    }
    expect(computeHeroStats({}, registry).tempo).toBe(bal.hero.tempo);
  });
});

describe('holds by tempo', () => {
  const holdStep = (w: ArpgWorld) => stepWorld(registry, w, { move: still, holding: 0 }, STEP);
  /** A one-hold Fire Bolt chain on a sword (or `equipped`), basic attacks off, a foe up the arena. */
  const holder = (equipped?: EquippedGear) =>
    arena([dummy(13, 30)], { noBasic: true, primary: { kind: 'hold' }, equipped });

  it('reach full charge at holdTime � tempo (holdFull)', () => {
    expect(holdFull(bal, 1)).toBe(bal.chains.holdTime);
    expect(holdFull(bal, 1.3)).toBeCloseTo(bal.chains.holdTime * 1.3);
    expect(holdFull({ ...bal, chains: { ...bal.chains, holdTime: 2 } }, 0.8)).toBeCloseTo(1.6);
  });

  it('reaches stage 1 at half its time and full power at 100%, scaled by tempo', () => {
    for (const [w, tempo] of [
      [holder(), 1],
      [holder(MAUL), 1.3],
    ] as const) {
      holdStep(w);
      const hold = w.hero.hold!;
      expect(hold).toMatchObject({
        full: bal.chains.holdTime * tempo,
        max: bal.chains.holdMax * tempo,
      });
      const stages = stageTimes(
        w,
        () => hold.start,
        1.5 * tempo,
        () => holdStep(w),
      );
      expect(stages.map(([s]) => s)).toEqual([1, 2]);
      tickAfter(stages[0][1], 0.5 * hold.full);
      tickAfter(stages[1][1], hold.full);
    }
  });

  it('fires by itself at holdMax × tempo', () => {
    const w = holder(MAUL);
    holdStep(w);
    const start = w.hero.hold!.start;
    let fired = -1;
    for (let i = 0; i < Math.round(3 / STEP) && fired < 0; i++)
      if (casts(holdStep(w)).length > 0) fired = w.t - start;
    tickAfter(fired, bal.chains.holdMax * 1.3);
  });

  it('a manual hold blow charges and fires by itself the same way', () => {
    const w = strikeWorld(MAUL, { basic: [{ kind: 'hold', element: 'fire' }] });
    const attack = () => stepWorld(registry, w, { move: still, attack: true }, STEP);
    for (let i = 0; i < 60 && w.hero.swing?.held == null; i++) attack();
    const held = w.hero.swing!.held!;
    let struck = -1;
    const stages = stageTimes(
      w,
      () => held,
      3,
      () => {
        const events = attack();
        if (struck < 0 && events.some((e) => e.kind === 'basic')) struck = w.t - held;
        return events;
      },
    );
    expect(stages.slice(0, 2).map(([s]) => s)).toEqual([1, 2]);
    tickAfter(stages[0][1], 0.5 * bal.chains.holdTime * 1.3);
    tickAfter(stages[1][1], bal.chains.holdTime * 1.3);
    tickAfter(struck, bal.chains.holdMax * 1.3);
  });

  it("a weapon swap mid-charge doesn't make the charge jump", () => {
    const w = holder();
    holdStep(w);
    const start = w.hero.hold!.start;
    for (let i = 0; i < Math.round(0.3 / STEP); i++) holdStep(w);
    refreshWorldHero(
      registry,
      w,
      computeHeroStats(MAUL, registry),
      chainsWith({ primary: { kind: 'hold' } }),
    );
    expect(w.hero.stats.tempo).toBe(1.3);
    expect(w.hero.hold).toMatchObject({ start, full: bal.chains.holdTime });
    const stages = stageTimes(
      w,
      () => start,
      1,
      () => holdStep(w),
    );
    expect(stages.map(([s]) => s)).toEqual([1, 2]);
    tickAfter(stages[1][1], bal.chains.holdTime);
  });
});

describe('beats', () => {
  const beatOf = (w: ArpgWorld, slot = 0) => w.hero.beatUntil[slot] - w.hero.beatFrom[slot];

  it("each kind's and slot's beat, by tempo; a hold's by its stage: a tap's the medium's, a half charge the heavy's, a full charge the hold's", () => {
    const light = beater([m('light')], { equipped: MAUL });
    press(light, 0);
    expect(beatOf(light)).toBeCloseTo(0.25 * 1.3);
    const ult = beater([m('medium')], { ultimate: { kind: 'heavy' } });
    ult.hero.charge[2] = 100;
    press(ult, 2);
    expect(beatOf(ult, 2)).toBeCloseTo(0.6 * 1.5);
    const ward = beater();
    press(ward, 1);
    expect(beatOf(ward, 1)).toBeCloseTo(0.4 * 0.75);
    const tap = beater([m('hold')]);
    press(tap, 0);
    expect(beatOf(tap)).toBeCloseTo(bal.chains.beat.medium);
    const half = beater([m('hold')]);
    holdFor(half, 0, 0.6);
    expect(beatOf(half)).toBeCloseTo(bal.chains.beat.heavy);
    const full = beater([m('hold')]);
    holdFor(full, 0, bal.chains.holdTime);
    expect(beatOf(full)).toBeCloseTo(bal.chains.beat.hold);
  });

  it("a press during the beat waits and fires at the beat's end", () => {
    const w = beater();
    press(w, 0);
    const end = w.hero.beatUntil[0];
    expect(inBeat(w.hero, 0, w.t)).toBe(true);
    pressOnly(w, 0);
    expect(w.hero.windup).toBeNull();
    expect(w.queuedCasts.map((q) => q.cast.slot)).toEqual([0]);
    tickAfter(until(w, windup(0)).at, end);
  });

  it('a Q press waiting on its beat survives an E press, and both fire', () => {
    const w = beater();
    press(w, 0);
    pressOnly(w, 0);
    const events = pressOnly(w, 1);
    expect(windup(1)(events)).toBe(true);
    expect(w.queuedCasts.map((q) => q.cast.slot)).toEqual([0]);
    expect(castSlots(until(w, windup(0)).events)).toEqual([1]);
    expect(w.queuedCasts).toEqual([]);
  });

  it('waiting presses fire in press order; a re-press of a slot goes last', () => {
    const order = (presses: number[]) => {
      const w = beater();
      w.hero.charge[2] = 100;
      pressOnly(w, 0);
      // Pressed while Q winds up, all in the same moment.
      for (const slot of presses) stepWorld(registry, w, { move: still, cast: { slot } }, 0);
      return castSlots(run(w, 3));
    };
    expect(order([1, 2])).toEqual([0, 1, 2]);
    expect(order([1, 2, 1])).toEqual([0, 2, 1]);
  });

  it('a press whose move is still cooling after the beat ages through the buffer, as before', () => {
    const cooling = (extra: number) => {
      const w = beater();
      press(w, 0);
      w.hero.cooldowns[0][1] = w.hero.beatUntil[0] + extra;
      pressOnly(w, 0);
      return w;
    };
    const soon = cooling(bal.feel.buffer / 2);
    const ready = soon.hero.cooldowns[0][1];
    tickAfter(until(soon, windup(0)).at, ready);
    const late = cooling(bal.feel.buffer + 0.2);
    expect(windup(0)(run(late, 1))).toBe(false);
    expect(late.queuedCasts).toEqual([]);
  });

  it("a hold held through the beat starts charging at the beat's end", () => {
    const w = beater([m('light'), m('hold')]);
    press(w, 0);
    const end = w.hero.beatUntil[0];
    until(w, () => w.hero.hold !== null, { holding: 0 });
    tickAfter(w.hero.hold!.start, end);
  });

  it('other slots and the dodge stay free during a beat, and a dodge neither ends nor shortens it', () => {
    const e = beater();
    press(e, 0);
    expect(windup(1)(pressOnly(e, 1))).toBe(true);
    expect(inBeat(e.hero, 0, e.t)).toBe(true);

    const d = beater();
    press(d, 0);
    const end = d.hero.beatUntil[0];
    expect(dodge(d, { x: 1, y: 0 }).some((ev) => ev.kind === 'dodge')).toBe(true);
    expect(d.hero.beatUntil[0]).toBe(end);
    pressOnly(d, 0);
    tickAfter(until(d, windup(0)).at, end);
  });

  it("the restart window counts from the beat's end; during the beat a press reads the chain's next move", () => {
    const w = beater();
    press(w, 0);
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(1);
    run(w, w.hero.beatUntil[0] - w.t + WINDOW - 0.1);
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(1);
    run(w, 0.2);
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(0);
  });

  it('a changed chain clears its beat and its waiting press; the other slots keep theirs', () => {
    const w = beater();
    press(w, 1);
    press(w, 0);
    pressOnly(w, 0);
    const ward = w.hero.beatUntil[1];
    expect(inBeat(w.hero, 1, w.t)).toBe(true);
    refreshWorldHero(
      registry,
      w,
      w.hero.stats,
      chainsWith({ primary: { moves: [m('heavy'), m('medium')] } }),
    );
    expect(inBeat(w.hero, 0, w.t)).toBe(false);
    // The restart window counts from now, not from the cleared beat's end.
    expect(w.hero.comboAt[0]).toBeLessThanOrEqual(w.t);
    expect(w.queuedCasts).toEqual([]);
    expect(w.hero.beatUntil[1]).toBe(ward);
  });

  it('a respawn clears every beat and waiting press', () => {
    const w = beater();
    press(w, 1);
    press(w, 0);
    pressOnly(w, 0);
    respawnHero(registry, w);
    for (const slot of [0, 1, 2]) expect(inBeat(w.hero, slot, w.t)).toBe(false);
    expect(w.queuedCasts).toEqual([]);
  });
});

describe('the basic swing while a press waits', () => {
  /** Basic attacks on (a sword, or `equipped`) at a foe in reach, the Primary two medium Bolts; the weapon idle until armed. */
  const fighter = (equipped?: EquippedGear, moves?: Move[]) => {
    const w = beater(moves, { equipped });
    w.monsters = arena([dummy(13, 34.4)]).monsters;
    w.hero.nextAttackAt = 1e9;
    return w;
  };
  /** Seconds from a swing of the chain's first blow to its strike. */
  const startup = (w: ArpgWorld) => {
    const b = w.hero.stats.weapon.blows[0];
    return w.hero.stats.attackInterval * b.time * b.startup;
  };
  /** Step, the weapon idle, until a swing starting next tick would strike after `at`. */
  const idleUntilPast = (w: ArpgWorld, at: number, input = {}) => {
    while (w.t + STEP + startup(w) <= at) stepWorld(registry, w, { move: still, ...input }, STEP);
  };
  /** Step until `done`: the swings that start, and the blows and wind-ups in order. */
  const watch = (w: ArpgWorld, done: () => boolean, input = {}) => {
    let swings = 0;
    const order: string[] = [];
    for (let i = 0; i < 300 && !done(); i++) {
      const before = w.hero.swing;
      for (const e of stepWorld(registry, w, { move: still, ...input }, STEP))
        if (e.kind === 'basic' || e.kind === 'windup') order.push(e.kind);
      if (w.hero.swing && w.hero.swing !== before) swings++;
    }
    return { swings, order, at: w.t };
  };
  const windingUp = (w: ArpgWorld) => () => w.hero.windup !== null;
  const arm = (w: ArpgWorld) => {
    w.hero.nextAttackAt = w.t;
  };

  it("a swing that strikes by the press's tick starts and lands first; one that wouldn't doesn't start", () => {
    const fits = fighter();
    press(fits, 0);
    const end = fits.hero.beatUntil[0];
    pressOnly(fits, 0);
    watch(fits, () => fits.hero.pushes.length === 0); // the Bolt's recoil
    expect(end - fits.t).toBeGreaterThan(startup(fits) + STEP);
    arm(fits);
    const a = watch(fits, windingUp(fits));
    expect(a.order).toEqual(['basic', 'windup']);
    tickAfter(a.at, end);

    const late = fighter();
    press(late, 0);
    const lateEnd = late.hero.beatUntil[0];
    pressOnly(late, 0);
    idleUntilPast(late, lateEnd);
    arm(late);
    const b = watch(late, windingUp(late));
    expect(b).toMatchObject({ swings: 0, order: ['windup'] });
    tickAfter(b.at, lateEnd);
  });

  it('the same for a press waiting on its move cooling after the beat', () => {
    const cooling = () => {
      const w = fighter();
      press(w, 0);
      const ready = w.hero.beatUntil[0] + 0.19;
      w.hero.cooldowns[0][1] = ready;
      pressOnly(w, 0);
      return { w, ready };
    };
    // Too late for the beat alone, in time for the cooldown.
    const fits = cooling();
    idleUntilPast(fits.w, fits.w.hero.beatUntil[0]);
    arm(fits.w);
    const a = watch(fits.w, windingUp(fits.w));
    expect(a.order).toEqual(['basic', 'windup']);
    tickAfter(a.at, fits.ready);

    const late = cooling();
    idleUntilPast(late.w, late.ready);
    arm(late.w);
    expect(watch(late.w, windingUp(late.w))).toMatchObject({ swings: 0, order: ['windup'] });
  });

  it("a held ability button waiting on its beat or cooldown counts as a press; a dropped hold's doesn't", () => {
    /** Swings that start before slot 0's beat (or, `cooling`, the Ward's cooldown) ends. */
    const swings = (input: object, o: { dropped?: boolean; cooling?: boolean } = {}) => {
      const w = fighter();
      const slot = o.cooling ? 1 : 0;
      press(w, slot);
      if (o.cooling) {
        run(w, w.hero.beatUntil[1] - w.t + STEP);
        w.hero.cooldowns[1][0] = w.t + 0.5;
      }
      const ready = Math.max(w.hero.beatUntil[slot], w.hero.cooldowns[slot][0]);
      idleUntilPast(w, ready, input);
      if (o.dropped) w.holdDropped = slot;
      arm(w);
      return watch(w, () => w.t + STEP >= ready - 1e-9, input).swings;
    };
    expect(swings({ holding: 0 })).toBe(0);
    expect(swings({})).toBe(1);
    expect(swings({ holding: 0 }, { dropped: true })).toBe(1);
    expect(swings({ holding: 1 }, { cooling: true })).toBe(0);
    expect(swings({}, { cooling: true })).toBe(1);
  });

  it("a held button whose next move can't be paid for holds no swing back", () => {
    /** Swings that start before `slot`'s beat ends, held, with the pool (or its charge) emptied. */
    const swings = (slot: number) => {
      const w = fighter();
      w.hero.charge[2] = 1e9;
      press(w, slot);
      w.hero.manaRegen = 0;
      w.hero.charge[slot] = 0;
      w.hero.cooldowns[slot].fill(0);
      // A mana-paid move a point short; a charge-paid one with a full pool.
      w.hero.mana = slot === 0 ? nextMove(w.hero, 0, w.t, WINDOW).cost - 1 : w.hero.manaMax;
      const ready = w.hero.beatUntil[slot];
      idleUntilPast(w, ready, { holding: slot });
      arm(w);
      return watch(w, () => w.t + STEP >= ready - 1e-9, { holding: slot }).swings;
    };
    expect(swings(0)).toBe(1);
    expect(swings(2)).toBe(1);
  });

  it("a blow striking on a waiting press's last buffered tick doesn't cost the press its buffer", () => {
    const w = fighter();
    press(w, 0);
    watch(w, () => !inBeat(w.hero, 0, w.t) && w.hero.pushes.length === 0);
    // A swing starts, then Q is pressed with its move cooling.
    arm(w);
    stepWorld(registry, w, { move: still }, STEP);
    const strikeAt = w.hero.swing!.strikeAt;
    w.hero.cooldowns[0][1] = 1e9;
    pressOnly(w, 0);
    // The move comes off cooldown on the last tick the press would wait, as the blow strikes.
    const until = w.queuedCasts[0].until;
    let last = w.t;
    while (last + STEP <= until) last += STEP;
    tickAfter(last, strikeAt);
    w.hero.cooldowns[0][1] = last;
    const times: Record<string, number> = {};
    for (let i = 0; i < 30; i++)
      for (const e of stepWorld(registry, w, { move: still }, STEP)) times[e.kind] ??= w.t;
    expect(times.basic).toBeCloseTo(last);
    expect(times.windup).toBeCloseTo(last + STEP);
  });

  it('a blow due in the tick the press fires lands first, the press a tick later; so does a held hold', () => {
    const w = fighter();
    press(w, 0);
    const end = w.hero.beatUntil[0];
    pressOnly(w, 0);
    idleUntilPast(w, end - STEP);
    arm(w);
    const times: Record<string, number> = {};
    for (let i = 0; i < 60 && !w.hero.windup; i++)
      for (const e of stepWorld(registry, w, { move: still }, STEP)) times[e.kind] ??= w.t;
    tickAfter(times.basic, end);
    expect(times.windup - times.basic).toBeCloseTo(STEP);

    const h = fighter(undefined, [m('medium'), m('hold')]);
    press(h, 0);
    const hEnd = h.hero.beatUntil[0];
    const holding = { holding: 0 };
    idleUntilPast(h, hEnd - STEP, holding);
    arm(h);
    let struck = -1;
    for (let i = 0; i < 60 && !h.hero.hold; i++)
      if (stepWorld(registry, h, { move: still, ...holding }, STEP).some((e) => e.kind === 'basic'))
        struck = h.t;
    tickAfter(struck, hEnd);
    expect(h.hero.hold!.start - struck).toBeCloseTo(STEP);
  });

  it("a press that will run out before its move cools doesn't hold a swing back", () => {
    const w = fighter(MAUL);
    press(w, 0);
    watch(w, () => !inBeat(w.hero, 0, w.t) && w.hero.pushes.length === 0);
    // The press ages from now; its move cools just past its buffer, before the maul's blow.
    const ready = w.t + bal.feel.buffer + 0.05;
    expect(ready).toBeLessThan(w.t + STEP + startup(w));
    w.hero.cooldowns[0][1] = ready;
    arm(w);
    pressOnly(w, 0);
    expect(w.hero.swing).not.toBeNull();
  });

  it("a manual attack tap held back by a waiting press doesn't age", () => {
    const w = fighter(MAUL);
    press(w, 0);
    const end = w.hero.beatUntil[0];
    pressOnly(w, 0);
    const manual = { attack: false };
    watch(w, () => w.hero.pushes.length === 0, manual);
    // Held back from now to the beat's end: longer than the buffer.
    expect(end - w.t).toBeLessThan(startup(w));
    expect(end - w.t).toBeGreaterThan(bal.feel.buffer + STEP);
    arm(w);
    stepWorld(registry, w, { move: still, ...manual, attackTap: true }, STEP);
    const r = watch(w, () => w.hero.swing !== null, manual);
    expect(r).toMatchObject({ swings: 1, order: ['windup'] });
  });

  it('no swing that starts while a press waits is cut by it: mashing Q fills the beats with blows', () => {
    const w = fighter();
    w.hero.nextAttackAt = 0;
    const waited = new Set<object>();
    let cut = 0;
    let blows = 0;
    for (let i = 0; i < Math.round(6 / STEP); i++) {
      const before = w.hero.swing;
      const waiting = w.queuedCasts.length > 0;
      const events = stepWorld(registry, w, { move: still, cast: { slot: 0 } }, STEP);
      const struck = events.some((e) => e.kind === 'basic');
      if (struck) blows++;
      if (before && waited.has(before) && w.hero.swing !== before && !struck) cut++;
      if (w.hero.swing && w.hero.swing !== before && waiting) waited.add(w.hero.swing);
    }
    expect(waited.size).toBeGreaterThan(0);
    expect(blows).toBeGreaterThan(0);
    expect(cut).toBe(0);
  });
});

describe('repeat presses', () => {
  it("a waiting repeat press that would fire a hold move is dropped, and the held button's charge starts that tick", () => {
    const w = beater([m('light'), m('hold')]);
    pressOnly(w, 0);
    // Pressed during the light's wind-up (the hold is next), with the button held.
    const held = { holding: 0 };
    stepWorld(registry, w, { move: still, ...held, cast: { slot: 0, repeat: true } }, STEP);
    expect(w.queuedCasts.map((q) => q.cast)).toEqual([{ slot: 0, repeat: true }]);
    const { events } = until(w, () => !w.hero.windup && w.hero.beatUntil[0] > w.t, held);
    const end = w.hero.beatUntil[0];
    const rest = until(w, () => w.hero.hold !== null, held);
    tickAfter(rest.at, end);
    expect(w.queuedCasts).toEqual([]);
    expect(castSlots([...events, ...rest.events])).toEqual([0]);

    // An ordinary press there taps the hold instead.
    const tap = beater([m('light'), m('hold')]);
    pressOnly(tap, 0);
    pressOnly(tap, 0);
    run(tap, 1);
    expect(tap.hero.comboStep[0]).toBe(1);
  });

  it("a repeat press dropped at a hold doesn't take the tick's one press from the next ready one", () => {
    const w = beater([m('hold')]);
    stepWorld(registry, w, { move: still, cast: { slot: 0, repeat: true } }, 0);
    const events = stepWorld(registry, w, { move: still, cast: { slot: 1 } }, STEP);
    expect(windup(1)(events)).toBe(true);
    expect(w.queuedCasts).toEqual([]);
  });

  it('a repeat press refused for mana or charge is dropped without a noMana event', () => {
    const noMana = (repeat: boolean) => {
      const w = beater();
      w.hero.mana = 1;
      w.hero.manaRegen = 0;
      const events = stepWorld(registry, w, { move: still, cast: { slot: 0, repeat } }, STEP);
      expect(w.queuedCasts).toEqual([]);
      return events.some((e) => e.kind === 'noMana');
    };
    expect(noMana(true)).toBe(false);
    expect(noMana(false)).toBe(true);

    const w = beater();
    w.hero.charge[2] = 0;
    const events = stepWorld(registry, w, { move: still, cast: { slot: 2, repeat: true } }, STEP);
    expect(w.queuedCasts).toEqual([]);
    expect(events.some((e) => e.kind === 'noMana' || e.kind === 'windup')).toBe(false);
  });

  it("a press during the slot's own wind-up reads the move after the winding one", () => {
    const w = beater([m('light'), m('hold')]);
    pressOnly(w, 0);
    expect(w.hero.windup?.step).toBe(0);
    expect(nextMove(w.hero, 0, w.t, WINDOW).kind).toBe('light');
    expect(pressMove(w.hero, 0, w.t, WINDOW).kind).toBe('hold');
    expect(pressMove(w.hero, 1, w.t, WINDOW)).toBe(nextMove(w.hero, 1, w.t, WINDOW));
  });
});

describe('aiming', () => {
  it("a held button pauses its slot's restart window, however long it aims", () => {
    const w = beater();
    press(w, 0);
    for (let i = 0; i < Math.round((WINDOW + 1) / STEP); i++)
      stepWorld(registry, w, { move: still, holding: 0 }, STEP);
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(1);
    run(w, w.hero.comboAt[0] - w.t + WINDOW + 0.1);
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(0);
  });

  it("a charging hold's window is paused once a tick, not twice", () => {
    const w = beater([m('light'), m('hold')]);
    press(w, 0);
    until(w, () => w.hero.hold !== null, { holding: 0 });
    const before = w.hero.comboAt[0];
    for (let i = 0; i < 10; i++) stepWorld(registry, w, { move: still, holding: 0 }, STEP);
    expect(w.hero.comboAt[0] - before).toBeCloseTo(10 * STEP);
  });
});

describe('determinism', () => {
  it('a scripted fight gives the same events at 30, 60 and 120 frames a second', () => {
    const fight = (frames: number) => {
      const w = arena([dummy(13, 34.4), dummy(12, 33), dummy(14, 33)], {
        primary: {
          moves: [m('light'), m('medium'), m('medium'), m('heavy')],
        },
        ultimate: { moves: [{ kind: 'hold', form: 'nova', elements: ['fire'] }] },
      });
      w.hero.charge[2] = 100;
      const events: ArpgEvent[] = [];
      for (let k = 0; k < Math.round(8 / STEP); k++) {
        const input = {
          move: k >= 150 && k < 160 ? { x: 1, y: 0 } : still,
          holding: k >= 200 && k < 250 ? 2 : k % 40 < 20 ? 0 : null,
          cast:
            k === 250
              ? { slot: 2 }
              : k === 100
                ? { slot: 1 }
                : k % 7 === 0
                  ? { slot: 0, repeat: k % 2 === 0 }
                  : null,
          dodge: k === 155,
        };
        // The presses go on a tick's first frame; movement and holding on every frame.
        for (let f = 0; f < frames; f++)
          events.push(
            ...stepWorld(
              registry,
              w,
              f === 0 ? input : { move: input.move, holding: input.holding },
              STEP / frames,
            ),
          );
      }
      return events;
    };
    const at30 = fight(1);
    expect(at30.filter((e) => e.kind === 'cast').length).toBeGreaterThan(5);
    expect(fight(2)).toEqual(at30);
    expect(fight(4)).toEqual(at30);
  });
});

describe('Power', () => {
  const stats = computeHeroStats({ weapon: gear('fire') }, registry);
  const resolved = (slot: AbilitySlot, moves: Move[], payment: AbilityPayment = 'mana') =>
    resolveChain(registry, stats, slot, { moves, payment });

  it("counts each move's cadence, its wind-up plus its beat, beside its cooldown and its cost", () => {
    const bolt = resolved('primary', [m('medium')]);
    const ab = bolt.moves[0];
    // Plenty of mana: the cadence outlasts the cooldown.
    expect(ab.castTime + 0.4).toBeGreaterThan(ab.cooldown);
    expect(useInterval(bal, bolt, 1, 1e9, 1)).toBeCloseTo(ab.castTime + 0.4);
    expect(useInterval(bal, bolt, 1.3, 1e9, 1)).toBeCloseTo(ab.castTime + 0.4 * 1.3);
    // Short of mana, the cost sets it.
    expect(useInterval(bal, bolt, 1, ab.cost / 5, 1)).toBeCloseTo(5);
  });

  it('values a hold at full charge: a cast-paid Ultimate that winds up longer than it charges', () => {
    const ult = resolved('ultimate', [{ kind: 'hold', form: 'nova', elements: ['fire'] }], 'cast');
    const full = ult.hold[0]![2];
    expect(valuedMove(ult, 0)).toBe(full);
    expect(full.castTime).toBeGreaterThan(bal.chains.holdTime);
    // Its cooldown counts from the landing; its beat follows it too.
    const beat = beatFor(bal, 'ultimate', 'hold', 1);
    expect(useInterval(bal, ult, 1, 1e9, 1e9)).toBeCloseTo(
      full.castTime + Math.max(full.cooldown, beat),
    );
    // Its damage is the full charge's, not the tap's.
    const tap = { ...ult, hold: [null] };
    expect(damagePerUse(ult, 10, stats, bal) / damagePerUse(tap, 10, stats, bal)).toBeCloseTo(
      full.power / ult.moves[0].power,
    );
  });

  it('a hold charged quicker than it winds up counts its charge time, by tempo', () => {
    const bolt = resolved('primary', [m('hold')]);
    const full = bolt.hold[0]![2];
    expect(full.castTime).toBeLessThan(bal.chains.holdTime);
    const beat = beatFor(bal, 'primary', 'hold', 1.3);
    expect(useInterval(bal, bolt, 1.3, 1e9, 1)).toBeCloseTo(
      bal.chains.holdTime * 1.3 + Math.max(full.cooldown, beat),
    );
  });

  it("a Defensive hold's effect is its full charge's, in survival too", () => {
    const moves: Move[] = [{ kind: 'hold', form: 'ward', elements: ['frost'] }];
    const ward = resolved('defensive', moves);
    const guard = valuedMove(ward, 0);
    expect(guard).toBe(chainMove(ward, 0, 2));
    expect(guard.effect).toBeGreaterThan(ward.moves[0].effect);
    // Survival counts it: the Ward's life over its uptime, against a Defensive that adds none.
    const ehp = (defensive: ChainOpts) =>
      estimateCombat(stats, registry, 5, chainsWith({ defensive })).ehp;
    const uptime = Math.min(1, guard.duration / useInterval(bal, ward, stats.tempo, 1e9, 1e9));
    expect(uptime).toBeLessThan(1);
    expect(ehp({ moves }) / ehp({ form: 'surge' })).toBeCloseTo(1 + 2 * guard.effect * uptime);
  });

  it("the weapon's tempo slows the abilities Power counts", () => {
    // A cast-paid Primary: no mana to wait for, so its cadence sets its pace.
    const chains = chainsWith({ primary: { payment: 'cast' } });
    const power = (tempo: number) => estimateCombat({ ...stats, tempo }, registry, 5, chains).dps;
    expect(power(1.3)).toBeLessThan(power(1));
    expect(power(0.8)).toBeGreaterThan(power(1));
  });
});
