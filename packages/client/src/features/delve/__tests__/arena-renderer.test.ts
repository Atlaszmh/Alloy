import { describe, it, expect } from 'vitest';
import type { Graphics } from 'pixi.js';
import type { ArpgEvent, ArpgWorld, Drop } from '@alloy/engine';
import { drawDrop, dropPop, holdPing, pickupColor, pruneViews } from '../arena/ArenaRenderer';
import { MANA_HEX } from '../arena/palette';

/** A Graphics stand-in that records the colours it fills. */
function recorder() {
  const fills: number[] = [];
  const g: Record<string, unknown> = {};
  for (const m of ['clear', 'rect', 'circle', 'ellipse', 'poly', 'stroke']) g[m] = () => g;
  g.fill = (f: { color: number }) => (fills.push(f.color), g);
  return { g: g as unknown as Graphics, fills };
}

const drop = (over: Partial<Drop>): Drop => ({
  id: 1,
  kind: 'orb',
  x: 0,
  y: 0,
  amount: 0.1,
  born: 0,
  vacuum: false,
  dead: false,
  ...over,
});

describe('the arena renderer', () => {
  it('forgets and destroys the views of monsters that are gone', () => {
    const views = new Map([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
    const destroyed: string[] = [];
    pruneViews(views, new Set([2]), (v) => destroyed.push(v));
    expect([...views.keys()]).toEqual([2]);
    expect(destroyed).toEqual(['a', 'c']);
  });

  it("draws a Seedling's orb as a green sprout, a health orb red, and a Siphon mote violet", () => {
    const sprout = recorder();
    drawDrop(sprout.g, drop({ mana: 'nature' }), 1, 1);
    expect(sprout.fills).toContain(MANA_HEX.nature);
    expect(sprout.fills).not.toContain(0xdc2626);
    const orb = recorder();
    drawDrop(orb.g, drop({}), 1, 1);
    expect(orb.fills).toContain(0xdc2626);
    const mote = recorder();
    drawDrop(mote.g, drop({ kind: 'mote', mana: 'shadow' }), 1, 1);
    expect(mote.fills).toContain(MANA_HEX.shadow);
  });

  it("a Seedling's sprout grows in rooted, where a health orb hops as it lands", () => {
    expect(dropPop(drop({ mana: 'nature' }), 0.17)).toBe(0);
    expect(dropPop(drop({}), 0.17)).toBeGreaterThan(1);
    expect(dropPop(drop({}), 0.35)).toBe(0);
  });

  it("a Seedling orb's pickup sparkles green, a health orb's red", () => {
    const pickup = (over: Partial<Extract<ArpgEvent, { kind: 'pickup' }>>) =>
      pickupColor({ kind: 'pickup', dropId: 1, dropKind: 'orb', amount: 0.1, ...over });
    expect(pickup({ mana: 'nature' })).toBe(MANA_HEX.nature);
    expect(pickup({})).toBe(0xf87171);
    expect(pickup({ dropKind: 'mote', mana: 'shadow' })).toBe(MANA_HEX.shadow);
  });

  it("a hold's stage pings a ring in the held move's element (a held blow's for the basic), wider at stage 2", () => {
    const w = {
      hero: {
        chains: [{ moves: [{ element: 'frost' }], hold: [null] }],
        hold: { slot: 0, step: 0, start: 0, aim: null, full: 1, max: 2 },
        windup: null,
        swing: { step: 1 },
        stats: { weapon: { blows: [{ element: 'fire' }, { element: 'storm' }] } },
      },
    } as unknown as ArpgWorld;
    const ability = holdPing(w, { slot: 0, stage: 1 });
    expect(ability.color).toBe(MANA_HEX.frost);
    expect(ability.r).toBeCloseTo(1.2);
    const blow = holdPing(w, { slot: null, stage: 2 });
    expect(blow.color).toBe(MANA_HEX.storm);
    expect(blow.r).toBeCloseTo(1.6);
  });
});
