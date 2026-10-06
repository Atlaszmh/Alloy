import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CELL } from '@alloy/engine';
import { Minimap, drawFog, drawMinimap } from '../Minimap';
import type { HudMap } from '../../useArenaCore';

/** A 2D context that records what is filled, in what colour. */
function fakeContext() {
  const fills: { x: number; y: number; w: number; h: number; color: string }[] = [];
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ x, y, w, h, color: String(this.fillStyle) });
    },
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    fills,
    clear: ctx.clearRect,
    image: ctx.drawImage,
  };
}

const MAP: HudMap = {
  width: 26,
  height: 40,
  view: { left: -5, top: 20, right: 10, bottom: 47 },
  hero: { x: 13, y: 36 },
  foes: [
    { x: 5, y: 5, rank: 'normal' },
    { x: 10, y: 5, rank: 'elite' },
    { x: 20, y: 5, rank: 'boss' },
  ],
  drops: [{ x: 13, y: 30, color: '#f77622' }],
  terrain: [{ x: 2, y: 2, w: 2, h: 1 }],
};

/** A generated floor: a chest room seen, a sealed den, the exit unfound with its hint straight up. */
const FLOOR: NonNullable<HudMap['floor']> = {
  width: 26,
  height: 40,
  rooms: [
    {
      id: 0,
      kind: 'vault',
      rect: { x: 2, y: 2, w: 10, h: 8 },
      icon: 'chest',
      used: false,
      cleared: false,
      sealed: false,
    },
    {
      id: 1,
      kind: 'den',
      rect: { x: 14, y: 20, w: 8, h: 8 },
      icon: 'skull',
      used: false,
      cleared: false,
      sealed: true,
    },
  ],
  exit: null,
  hint: { x: 13, y: 2 },
  foes: [],
  drops: [],
  explored: 2,
  total: 5,
  fogVersion: 1,
  cells: new Uint8Array(26 * 40),
  fog: new Uint8Array(26 * 40).fill(1),
  version: 0,
  hazards: [],
};
const GENERATED: HudMap = { ...MAP, terrain: [], floor: FLOOR };

describe('drawMinimap', () => {
  it('fits the arena at whole device px per unit, centred, smoothing off', () => {
    const { ctx, fills } = fakeContext();
    drawMinimap(ctx, MAP, 300, 150);
    expect(ctx.imageSmoothingEnabled).toBe(false);
    // floor(min(300 / 26, 150 / 40)) = 3 px per unit: 78 × 120, centred at (111, 15).
    const border = fills.filter((f) => f.color === '#5a6988');
    expect(border).toHaveLength(4);
    expect(border[0]).toEqual({ x: 111, y: 15, w: 78, h: 1, color: '#5a6988' });
    // A terrain cell at (2, 2), 2 × 1 units.
    expect(fills[0]).toEqual({ x: 117, y: 21, w: 6, h: 3, color: '#3a4466' });
  });

  it('draws the view clipped to the arena, the drops, the foes (elites and the boss bigger) and the hero last', () => {
    const { ctx, fills } = fakeContext();
    drawMinimap(ctx, MAP, 300, 150);
    const view = fills.filter((f) => f.color === '#2ce8f5');
    // From (0, 20) to (10, 40) in units: x 111..141, y 75..135.
    expect(view[0]).toEqual({ x: 111, y: 75, w: 30, h: 1, color: '#2ce8f5' });
    expect(fills.some((f) => f.color === '#f77622')).toBe(true);
    const foes = fills.filter((f) => f.color === '#e43b44').map((f) => f.w);
    expect(foes[0]).toBeLessThan(foes[1]);
    expect(foes[1]).toBeLessThan(foes[2]);
    const hero = fills.at(-1)!;
    expect(hero.color).toBe('#fee761');
    expect(hero.x + hero.w / 2).toBe(111 + 13 * 3);
  });
});

describe('drawMinimap on a generated floor', () => {
  const hint = '#63c74d';

  it('lays the fog layer at the origin, then frames the revealed rooms (a sealed one in red) and draws their icons', () => {
    const { ctx, fills, image } = fakeContext();
    const fog = {} as CanvasImageSource;
    drawMinimap(ctx, GENERATED, 300, 150, fog);
    // 3 px per unit, the floor at (111, 15) as above.
    expect(image).toHaveBeenCalledWith(fog, 111, 15);
    const room = fills.filter((f) => f.color === '#8b9bb4');
    expect(room[0]).toEqual({ x: 117, y: 21, w: 30, h: 1, color: '#8b9bb4' });
    const sealed = fills.filter((f) => f.color === '#a22633');
    expect(sealed[0]).toEqual({ x: 153, y: 75, w: 24, h: 1, color: '#a22633' });
    // The chest's glyph at its room's centre (7, 6): (132, 33), two device px a glyph pixel.
    const chest = fills.filter((f) => f.color === '#e4a672');
    expect(chest.length).toBeGreaterThan(0);
    for (const f of chest) {
      expect(f.x).toBeGreaterThanOrEqual(120);
      expect(f.x + f.w).toBeLessThanOrEqual(144);
    }
  });

  it('points from the hero toward the exit hint until the exit is found, then marks the exit', () => {
    const { ctx, fills } = fakeContext();
    drawMinimap(ctx, GENERATED, 300, 150);
    const arrow = fills.filter((f) => f.color === hint);
    expect(arrow).toHaveLength(3);
    for (const f of arrow) {
      expect(Math.abs(f.x + f.w / 2 - (111 + 13 * 3))).toBeLessThanOrEqual(0.5); // straight up
      expect(f.y).toBeLessThan(15 + 36 * 3);
    }
    const found = fakeContext();
    drawMinimap(found.ctx, { ...GENERATED, floor: { ...FLOOR, exit: { x: 20, y: 5 } } }, 300, 150);
    const gate = found.fills.filter((f) => f.color === hint);
    expect(gate.length).toBeGreaterThan(3);
    for (const f of gate) {
      expect(f.x).toBeGreaterThanOrEqual(164);
      expect(f.x + f.w).toBeLessThanOrEqual(178);
    }
  });

  it('draws the fog: each seen floor cell, the ones in sight brighter, never a wall', () => {
    const { ctx, fills } = fakeContext();
    const floor = {
      ...FLOOR,
      width: 3,
      height: 2,
      cells: Uint8Array.from([0, 1, 0, 2, 0, 0]),
      fog: Uint8Array.from([1, 2, 0, 1, 2, 2]),
    };
    drawFog(ctx, floor, 2);
    expect(fills).toEqual([
      { x: 0, y: 0, w: 2, h: 2, color: '#262b44' },
      { x: 0, y: 2, w: 2, h: 2, color: '#262b44' },
      { x: 2, y: 2, w: 2, h: 2, color: '#3a4466' },
      { x: 4, y: 2, w: 2, h: 2, color: '#3a4466' },
    ]);
  });

  it('draws the cover it has seen, crumbling or not, in its own colour', () => {
    const { ctx, fills } = fakeContext();
    const floor = {
      ...FLOOR,
      width: 4,
      height: 1,
      cells: Uint8Array.from([CELL.cover, CELL.crumbling, CELL.cover, CELL.wall]),
      fog: Uint8Array.from([1, 2, 0, 2]),
    };
    expect(drawFog(ctx, floor, 2)).toBe(2);
    expect(fills).toEqual([
      { x: 0, y: 0, w: 2, h: 2, color: '#5a6988' },
      { x: 2, y: 0, w: 2, h: 2, color: '#5a6988' },
    ]);
  });

  it("dots the hazards the floor's fog has seen, in their element's colour", () => {
    const { ctx, fills } = fakeContext();
    const hazards = [{ x: 20, y: 30, color: '#ff6a2b' }];
    drawMinimap(ctx, { ...GENERATED, floor: { ...FLOOR, hazards } }, 300, 150);
    // 3 px per unit, the floor at (111, 15): a 2 px dot centred on (171, 105).
    expect(fills.filter((f) => f.color === '#ff6a2b')).toEqual([
      { x: 170, y: 104, w: 2, h: 2, color: '#ff6a2b' },
    ]);
  });
});

describe('Minimap', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sizes its backing store from its box × devicePixelRatio and redraws when the map changes', () => {
    const { ctx, clear } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 231,
      height: 112.5,
    } as DOMRect);
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
    const { rerender } = render(<Minimap map={MAP} />);
    const canvas = screen.getByTestId('minimap') as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([462, 225]);
    expect(clear).toHaveBeenCalledTimes(1);
    rerender(<Minimap map={MAP} />);
    expect(clear).toHaveBeenCalledTimes(1);
    rerender(<Minimap map={{ ...MAP, hero: { x: 12, y: 30 } }} />);
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it("large, it is the peek's map: its own test id, no guided-start target, and its panel's height", () => {
    const { rerender } = render(<Minimap map={MAP} />);
    expect(screen.getByTestId('minimap')).toHaveClass('h-[150px]');
    rerender(<Minimap map={MAP} large />);
    const canvas = screen.getByTestId('peek-map');
    expect(canvas).not.toHaveAttribute('data-tutorial');
    expect(canvas).toHaveClass('h-full');
    expect(canvas).not.toHaveClass('h-[150px]');
  });

  it("keeps the fog layer while the fog stands still, and redraws it when fogVersion or the map's version moves", () => {
    const { ctx, fills, image } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
      height: 150,
    } as DOMRect);
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1);
    const seen = () => fills.filter((f) => f.color === '#262b44').length;
    const { rerender } = render(<Minimap map={GENERATED} />);
    const once = seen();
    expect(once).toBeGreaterThan(0);
    rerender(<Minimap map={{ ...GENERATED, hero: { x: 12, y: 30 } }} />);
    expect(seen()).toBe(once);
    expect(image).toHaveBeenCalledTimes(2);
    rerender(<Minimap map={{ ...GENERATED, floor: { ...FLOOR, fogVersion: 2 } }} />);
    expect(seen()).toBe(2 * once);
    rerender(<Minimap map={{ ...GENERATED, floor: { ...FLOOR, fogVersion: 2, version: 1 } }} />);
    expect(seen()).toBe(3 * once);
  });

  it('marks the cover cells and the hazards it shows on the canvas (data-cover, data-hazards)', () => {
    const { ctx } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
      height: 150,
    } as DOMRect);
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1);
    const cells = new Uint8Array(26 * 40);
    cells[3] = CELL.cover;
    cells[4] = CELL.crumbling;
    const hazards = [{ x: 20, y: 30, color: '#ff6a2b' }];
    render(<Minimap map={{ ...GENERATED, floor: { ...FLOOR, cells, hazards } }} />);
    const canvas = screen.getByTestId('minimap');
    expect(canvas.dataset.cover).toBe('2');
    expect(canvas.dataset.hazards).toBe('1');
  });
});
