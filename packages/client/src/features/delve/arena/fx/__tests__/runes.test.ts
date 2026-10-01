import { describe, it, expect, vi } from 'vitest';
import type { Graphics } from 'pixi.js';
import type { ArpgWorld, RuneFamily } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { FAMILY_STYLE } from '../../../runes/rune-style';
import { MANA_HEX, cssToHex } from '../../palette';
import {
  GLYPHS,
  GLYPH_DROP,
  GLYPH_LIFT,
  familyHex,
  runeFx,
  runeHex,
  type RuneEffect,
} from '../runes';
import { GLYPH_LIFE, ManaFx } from '../mana-fx';
import { INFUSION_BUDGET } from '../infusion';
import { drawInfusions, drawProjectiles, drawZones } from '../draw-world';

/** A Graphics stand-in that counts pixels (`px` draws one rect per pixel block). */
function fakeGraphics() {
  const g = { rects: 0, rect: () => (g.rects++, g), fill: () => g };
  return g;
}
const G = () => fakeGraphics() as unknown as Graphics & { rects: number };
const B = () => ({ left: INFUSION_BUDGET });
const lit = (rows: readonly string[]) => rows.join('').split('#').length - 1;

const FAMILY: Record<RuneEffect, RuneFamily> = {
  split: 'shape',
  echo: 'tempo',
  volatile: 'elemental',
};

describe("a rune's effect firing", () => {
  it("flashes its glyph above the point (Volatile's below, clear of its reaction's label) in its rune's family colour, over a ring in the element's", () => {
    for (const effect of ['split', 'echo', 'volatile'] as const) {
      const fx = { glyph: vi.fn(), ring: vi.fn() };
      runeFx(fx as unknown as ManaFx, { kind: 'runeFx', effect, x: 4, y: 6, element: 'frost' });
      const color = cssToHex(FAMILY_STYLE[FAMILY[effect]].color);
      const y = effect === 'volatile' ? 6 + GLYPH_DROP : 6 - GLYPH_LIFT;
      expect(fx.glyph, effect).toHaveBeenCalledWith(4, y, GLYPHS[effect], color);
      expect(fx.ring.mock.calls[0].slice(0, 4), effect).toEqual([4, 6, 0.6, MANA_HEX.frost]);
      // Every glyph is 5×5 cells.
      expect(GLYPHS[effect].map((row) => row.length)).toEqual([5, 5, 5, 5, 5]);
    }
    // No element (a Volatile Soulfire carries none): the ring takes the family's colour.
    const fx = { glyph: vi.fn(), ring: vi.fn() };
    runeFx(fx as unknown as ManaFx, { kind: 'runeFx', effect: 'echo', x: 0, y: 0, element: null });
    expect(fx.ring.mock.calls[0][3]).toBe(familyHex('tempo'));
  });

  it("each family has its own colour, and a rune wears its family's", () => {
    const families = Object.keys(FAMILY_STYLE) as RuneFamily[];
    const colors = families.map(familyHex);
    for (const c of colors) expect(Number.isInteger(c)).toBe(true); // not NaN: a #rrggbb colour
    expect(new Set(colors).size).toBe(4);
    const split = getDelveRegistry().getRune('split');
    expect(runeHex({ id: 'split', tier: 3 })).toBe(familyHex(split.family));
    expect(runeHex({ id: 'no-such-rune', tier: 1 })).toBe(0xffffff);
  });
});

describe('ManaFx glyphs', () => {
  it("draw every lit cell off the frame's budget, and skip a frame the budget can't cover", () => {
    const fx = new ManaFx();
    fx.glyph(2, 2, GLYPHS.volatile, 0x22d3ee);
    const air = G();
    const budget = B();
    fx.draw({ air, ground: G() }, 0.01, 0, budget);
    expect(air.rects).toBe(lit(GLYPHS.volatile));
    expect(budget.left).toBe(INFUSION_BUDGET - lit(GLYPHS.volatile));
    const tight = { left: lit(GLYPHS.volatile) - 1 };
    const starved = G();
    fx.draw({ air: starved, ground: G() }, 0.01, 0, tight);
    expect(starved.rects).toBe(0);
    expect(tight.left).toBe(lit(GLYPHS.volatile) - 1);
  });

  it('end after their flash, and clear() lets them go', () => {
    const fx = new ManaFx();
    fx.glyph(2, 2, GLYPHS.split, 0x22d3ee);
    const air = G();
    fx.draw({ air, ground: G() }, GLYPH_LIFE, 0, B());
    expect(air.rects).toBe(0);
    const cleared = new ManaFx();
    cleared.glyph(2, 2, GLYPHS.split, 0x22d3ee);
    cleared.clear();
    const none = G();
    cleared.draw({ air: none, ground: G() }, 0.01, 0, B());
    expect(none.rects).toBe(0);
  });
});

describe('what the runes add, drawn by the existing paths', () => {
  it("draws shards as small orbs and a blow's Linger zone on the ground, neither with a motif", () => {
    const shard = { owner: 'hero', form: 'shard', x: 3, y: 3, vx: 12, vy: 0, radius: 0.2 };
    const w = {
      t: 1,
      hero: { x: 0, y: 0, defend: null, chains: [] },
      projectiles: [
        // A basic shot's shard (no move) and an ability's (a copy of its move).
        { ...shard, id: 7, element: 'fire', pierce: false, ability: null },
        { ...shard, id: 8, element: 'frost', pierce: false, ability: { elements: ['frost'] } },
      ],
      // A heavy blow's Linger: a hero zone with no ability.
      zones: [
        {
          id: 9,
          owner: 'hero',
          x: 5,
          y: 5,
          radius: 1.2,
          element: 'fire',
          source: null,
          ability: null,
          detonateAt: 0,
          born: 0,
          until: 3,
        },
      ],
    } as unknown as ArpgWorld;
    const air = G();
    drawProjectiles(air, w, 1, new Map(), () => undefined);
    expect(air.rects).toBeGreaterThan(0);
    const ground = G();
    drawZones(ground, w, 1);
    expect(ground.rects).toBeGreaterThan(0);
    const budget = B();
    drawInfusions({ air: G(), ground: G() }, w, 1, budget);
    expect(budget.left).toBe(INFUSION_BUDGET);
  });
});
