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
      stats: { weapon: { blows: [BLOW], feel: FEEL } },
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
          chains: [{ moves: [{ element: 'frost', heft: 0.45, last }], hold: [null] }],
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
    const a = windingUp(
      world({
        chains: [{ moves: [stage(0.45)], hold: [[stage(0.45), stage(0.6), stage(0.9)]] }],
        hold: { slot: 0, step: 0, start: 1 - 0.5 * holdTime, aim: { x: 9, y: 5 } },
      } as never),
    )!;
    expect(a.progress).toBeCloseTo(0.5);
    expect(a.heft).toBeCloseTo(0.6); // stage 1
    expect(a.dir).toEqual({ x: 1, y: 0 });
    expect(a.color).toBe(MANA_HEX.nature);
  });

  it("a manual blow held at its strike point gathers with its charge, as its stage's row", () => {
    const held = { ...swing, strikeAt: 0.1, held: 1 - 0.8 * holdTime };
    const a = windingUp(world({ swing: held } as never))!;
    expect(a.progress).toBeCloseTo(0.8);
    expect(a.heft).toBeCloseTo(FEEL.hold.heft); // stage 2
  });
});
