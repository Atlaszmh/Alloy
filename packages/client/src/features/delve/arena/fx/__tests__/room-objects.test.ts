import { describe, it, expect, vi } from 'vitest';
import type { Graphics } from 'pixi.js';
import type { ArpgWorld, HazardState } from '@alloy/engine';
import { MANA_HEX } from '../../palette';
import type { ManaFx } from '../mana-fx';
import { DAZE, SPLINTER, STONE, roomObjectFx, roomObjectPoints } from '../room-objects';
import { drawHazards } from '../draw-world';

// See the room objects spec's client: each room object's event has its moment.

/** A ManaFx that records which effects were asked for. */
function spyFx() {
  const spies = {
    burst: vi.fn(),
    gather: vi.fn(),
    disperse: vi.fn(),
    ring: vi.fn(),
    infuse: vi.fn(),
  };
  return { fx: spies as unknown as ManaFx, spies };
}

describe("the room objects' moments", () => {
  it('a hazard set off flashes at its body in its element', () => {
    const { fx, spies } = spyFx();
    const shake = roomObjectFx(fx, {
      kind: 'hazardPrime',
      id: 7,
      hazard: 'frost_crystal',
      element: 'frost',
      x: 4,
      y: 6,
      radius: 2.5,
      fuse: 0.4,
    });
    expect(spies.ring.mock.calls[0].slice(0, 4)).toEqual([4, 6, 0.8, MANA_HEX.frost]);
    expect(spies.gather).toHaveBeenCalled();
    expect(shake).toBe(0);
  });

  it("a hazard's burst rings out to its reach in its element, its motif on the rim, and shakes", () => {
    const { fx, spies } = spyFx();
    const shake = roomObjectFx(fx, {
      kind: 'hazardBurst',
      id: 7,
      hazard: 'brazier',
      element: 'fire',
      x: 4,
      y: 6,
      radius: 2.5,
    });
    expect(spies.ring.mock.calls[0].slice(0, 5)).toEqual([4, 6, 2.5, MANA_HEX.fire, true]);
    expect(spies.burst.mock.calls[0].slice(0, 3)).toEqual([4, 6, MANA_HEX.fire]);
    expect(spies.infuse).toHaveBeenCalledWith('blast', 'fire', {
      kind: 'ring',
      x: 4,
      y: 6,
      r: 2.5,
    });
    expect(shake).toBeGreaterThan(0);
  });

  it('a prop breaks in a puff of splinters and dust', () => {
    const { fx, spies } = spyFx();
    roomObjectFx(fx, { kind: 'propBreak', id: 3, prop: 'crate', x: 2, y: 3 });
    expect(spies.burst.mock.calls[0].slice(0, 3)).toEqual([2, 3, SPLINTER]);
    expect(spies.disperse.mock.calls[0].slice(0, 2)).toEqual([2, 3]);
  });

  it('a crumble throws stone from every cell, and shakes harder than a slam', () => {
    const { fx, spies } = spyFx();
    const cells = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ];
    const shake = roomObjectFx(fx, { kind: 'crumble', structure: 0, cells });
    expect(spies.burst.mock.calls.map((c) => c.slice(0, 3))).toEqual([
      [5.5, 5.5, STONE],
      [6.5, 5.5, STONE],
    ]);
    expect(spies.disperse).toHaveBeenCalledTimes(2);
    expect(shake).toBeGreaterThan(
      roomObjectFx(spyFx().fx, { kind: 'wallSlam', id: 1, x: 0, y: 0 }),
    );
  });

  it('a foe slammed into a wall chips stone; a stunned charger is dazed in gold', () => {
    const slam = spyFx();
    roomObjectFx(slam.fx, { kind: 'wallSlam', id: 1, x: 2, y: 3 });
    expect(slam.spies.burst.mock.calls[0].slice(0, 3)).toEqual([2, 3, STONE]);
    const stun = spyFx();
    roomObjectFx(stun.fx, { kind: 'chargeStun', id: 1, x: 2, y: 3 });
    expect(stun.spies.burst.mock.calls[0].slice(0, 3)).toEqual([2, 3, STONE]);
    expect(stun.spies.ring.mock.calls[0].slice(0, 4)).toEqual([2, 3, 1.1, DAZE]);
  });

  it("happens where its event is: a crumble at each of its cells' centres", () => {
    expect(roomObjectPoints({ kind: 'wallSlam', id: 1, x: 2, y: 3 })).toEqual([
      { kind: 'wallSlam', id: 1, x: 2, y: 3 },
    ]);
    expect(roomObjectPoints({ kind: 'crumble', structure: 0, cells: [{ x: 5, y: 7 }] })).toEqual([
      { x: 5.5, y: 7.5 },
    ]);
  });
});

describe("a hazard's telegraph", () => {
  /** A hazard's ground pixels at world time `t`: a fuse of 0.4 s, primed till 1. */
  const pixels = (state: HazardState, t: number) => {
    const g = { rects: 0, rect: () => (g.rects++, g), fill: () => g };
    const hazard = { id: 1, element: 'fire', x: 5, y: 5, radius: 0.4, burst: 2.5, state, until: 1 };
    drawHazards(g as unknown as Graphics, { t, hazards: [hazard] } as unknown as ArpgWorld, 0, 0.4);
    return g.rects;
  };

  it('a ready one glows round its body, a primed one fills its reach as the fuse burns, a dormant one shows nothing', () => {
    const ready = pixels('ready', 0);
    expect(ready).toBeGreaterThan(0);
    expect(pixels('dormant', 0)).toBe(0);
    const lit = pixels('primed', 0.6);
    expect(lit).toBeGreaterThan(ready);
    expect(pixels('primed', 0.95)).toBeGreaterThan(lit);
  });
});
