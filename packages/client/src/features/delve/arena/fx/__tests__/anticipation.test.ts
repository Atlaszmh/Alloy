import { describe, it, expect } from 'vitest';
import type { ArpgWorld } from '@alloy/engine';
import { windingUp } from '../anticipation';
import { MANA_HEX } from '../../palette';
import { getDelveRegistry } from '../../../registry';

const ROW = { time: 1, startup: 0.3, move: 0.4, power: 1, heft: 0.8 };
const FEEL = {
  light: ROW,
  medium: { ...ROW, heft: 0.5 },
  heavy: { ...ROW, heft: 0.8 },
  hold: { ...ROW, heft: 1 },
};
const BLOW = { ...ROW, kind: 'light', element: 'fire', attunePower: 1 };
const { holdTime } = getDelveRegistry().getDelveBalance().chains;

function world(over: Partial<ArpgWorld['hero']>): ArpgWorld {
  return {
    t: 1,
    hero: {
      x: 5,
      y: 5,
      facing: { x: 0, y: -1 },
      swing: null,
      windup: null,
      hold: null,
      defend: null,
      chains: [],
      stats: { weapon: { blows: [BLOW], feel: FEEL }, tempo: 1 },
      ...over,
    },
  } as unknown as ArpgWorld;
}

const swing = {
  step: 0,
  dir: { x: 1, y: 0 },
  targetId: null,
  start: 0.9,
  strikeAt: 1.1,
  committed: true,
  held: null,
};

describe('windingUp', () => {
  it('reports a committed swing with its heft and progress', () => {
    const a = windingUp(world({ swing } as never))!;
    expect(a.heft).toBeCloseTo(0.8);
    expect(a.progress).toBeCloseTo(0.5);
    expect(a.dir).toEqual({ x: 1, y: 0 });
  });

  it("reports a wind-up with its move's heft (+0.2 for a chain's last), toward where it aims", () => {
    const winding = (last: boolean) =>
      windingUp(
        world({
          chains: [
            { moves: [{ element: 'frost', heft: 0.45, last, castTime: 0.4 }], hold: [null] },
          ],
          windup: {
            slot: 0,
            aim: null,
            at: { x: 5, y: 9 },
            start: 0.9,
            until: 1.3,
            step: 0,
            conjureUntil: 1.3,
            chargePaid: 0,
          },
        } as never),
      )!;
    const a = winding(false);
    expect(a.heft).toBeCloseTo(0.45);
    expect(a.dir).toEqual({ x: 0, y: 1 });
    expect(a.progress).toBeCloseTo(0.25);
    expect(a.color).toBe(MANA_HEX.frost);
    expect(winding(true).heft).toBeCloseTo(0.65);
  });

  it('ignores an uncommitted swing and idle heroes', () => {
    expect(windingUp(world({ swing: { ...swing, committed: false } } as never))).toBeNull();
    expect(windingUp(world({}))).toBeNull();
  });

  it('a blow winds up in its own element', () => {
    const blows = [BLOW, { ...BLOW, kind: 'heavy', element: 'storm' }];
    const colour = (step: number) =>
      windingUp(
        world({ swing: { ...swing, step }, stats: { weapon: { blows, feel: FEEL } } } as never),
      )!.color;
    expect(colour(1)).toBe(MANA_HEX.storm);
    expect(colour(0)).toBe(MANA_HEX.fire);
  });

  it('a hold gathers with its charge, as heavy as the stage it has reached', () => {
    const stage = (heft: number) => ({ element: 'nature', heft, last: false });
    const holding = (full: number) =>
      windingUp(
        world({
          chains: [{ moves: [stage(0.45)], hold: [[stage(0.45), stage(0.6), stage(0.9)]] }],
          hold: {
            slot: 0,
            step: 0,
            start: 1 - 0.5 * holdTime,
            aim: { x: 9, y: 5 },
            full,
            max: 2 * full,
          },
        } as never),
      )!;
    const a = holding(holdTime);
    expect(a.progress).toBeCloseTo(0.5);
    expect(a.heft).toBeCloseTo(0.6); // stage 1
    expect(a.dir).toEqual({ x: 1, y: 0 });
    expect(a.color).toBe(MANA_HEX.nature);
    // Its own charge time (a slower tempo's, fixed when it began): half as far, still stage 0.
    const slow = holding(2 * holdTime);
    expect(slow.progress).toBeCloseTo(0.25);
    expect(slow.heft).toBeCloseTo(0.45);
  });

  it('a hold leans toward the aim marker while one shows, the point its release will take', () => {
    const stage = { element: 'nature', heft: 0.45, last: false };
    const w = world({
      chains: [{ moves: [stage], hold: [[stage, stage, stage]] }],
      hold: {
        slot: 0,
        step: 0,
        start: 1 - 0.5 * holdTime,
        aim: { x: 9, y: 5 },
        full: holdTime,
        max: 2 * holdTime,
      },
    } as never);
    expect(windingUp(w, { x: 5, y: 1 })!.dir).toEqual({ x: 0, y: -1 });
    expect(windingUp(w, null)!.dir).toEqual({ x: 1, y: 0 });
  });

  it("a released hold's wind-up carries on from what the charge counted, rather than starting over", () => {
    // Stage 1 of a 0.5 s wind-up, released after 0.3 s of charge: 0.2 s left, 0.1 s of it gone.
    const stage = (castTime: number) => ({ element: 'fire', heft: 0.6, last: false, castTime });
    const a = windingUp(
      world({
        chains: [{ moves: [stage(0.3)], hold: [[stage(0.3), stage(0.5), stage(0.7)]] }],
        windup: {
          slot: 0,
          aim: null,
          at: { x: 9, y: 5 },
          start: 0.9,
          until: 1.1,
          step: 0,
          stage: 1,
          conjureUntil: 1.1,
          chargePaid: 0,
        },
      } as never),
    )!;
    expect(a.progress).toBeCloseTo(0.8);
  });

  it("a manual blow held at its strike point gathers with its charge over holdTime × the tempo, as its stage's row", () => {
    const held = { ...swing, strikeAt: 0.1, held: 1 - 0.8 * holdTime };
    const a = windingUp(world({ swing: held } as never))!;
    expect(a.progress).toBeCloseTo(0.8);
    expect(a.heft).toBeCloseTo(FEEL.heavy.heft); // stage 1
    const stats = { weapon: { blows: [BLOW], feel: FEEL }, tempo: 2 };
    const slow = windingUp(world({ swing: held, stats } as never))!;
    expect(slow.progress).toBeCloseTo(0.4);
    expect(slow.heft).toBeCloseTo(FEEL.medium.heft); // stage 0
    const full = windingUp(world({ swing: { ...held, held: 1 - holdTime } } as never))!;
    expect(full.heft).toBeCloseTo(FEEL.hold.heft); // stage 2: full power at 100%
  });
});
