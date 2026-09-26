import { describe, it, expect } from 'vitest';
import type { ArpgWorld } from '@alloy/engine';
import { windingUp } from '../anticipation';

function world(over: Partial<ArpgWorld['hero']>): ArpgWorld {
  return {
    t: 1,
    hero: {
      x: 5,
      y: 5,
      swing: null,
      windup: null,
      abilities: [],
      stats: {
        weapon: {
          combo: [{ time: 1, startup: 0.3, move: 0.4, power: 1, heft: 0.8 }],
          element: 'fire',
        },
      },
      ...over,
    },
  } as unknown as ArpgWorld;
}

describe('windingUp', () => {
  it('reports a committed swing with its heft and progress', () => {
    const a = windingUp(
      world({
        swing: {
          step: 0,
          dir: { x: 1, y: 0 },
          targetId: null,
          start: 0.9,
          strikeAt: 1.1,
          committed: true,
        },
      } as never),
    )!;
    expect(a.heft).toBeCloseTo(0.8);
    expect(a.progress).toBeCloseTo(0.5);
    expect(a.dir).toEqual({ x: 1, y: 0 });
  });

  it('reports a wind-up with the press heft, toward where it aims', () => {
    const a = windingUp(
      world({
        facing: { x: 0, y: -1 },
        abilities: [{ element: 'frost', heft: 0.45, combo: [1] }],
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
    expect(a.heft).toBeCloseTo(0.45);
    expect(a.dir).toEqual({ x: 0, y: 1 });
    expect(a.progress).toBeCloseTo(0.25);
  });

  it('ignores an uncommitted swing and idle heroes', () => {
    expect(
      windingUp(
        world({
          swing: {
            step: 0,
            dir: { x: 1, y: 0 },
            targetId: null,
            start: 0.9,
            strikeAt: 1.1,
            committed: false,
          },
        } as never),
      ),
    ).toBeNull();
    expect(windingUp(world({}))).toBeNull();
  });
});
