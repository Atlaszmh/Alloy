import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import delveData from '../src/data/delve.json';
import { BalanceConfigSchema, DelveDataSchema } from '../src/data/schemas.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import {
  STEP,
  arena,
  bal,
  chainsWith,
  dummy,
  gear,
  registry,
  strikeWorld,
} from './fixtures/arena.js';

// See the chain feel spec. The fixture arena's hero stands at (13, 36) facing up (−y);
// `dummy(x, y)` is a sturdy Fire foe that doesn't fight back.

const still = { x: 0, y: 0 };
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
