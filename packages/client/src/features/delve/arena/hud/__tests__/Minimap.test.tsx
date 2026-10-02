import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Minimap, drawMinimap } from '../Minimap';
import type { HudMap } from '../../useArenaCore';

/** A 2D context that records what is filled, in what colour. */
function fakeContext() {
  const fills: { x: number; y: number; w: number; h: number; color: string }[] = [];
  const ctx = {
    fillStyle: '',
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ x, y, w, h, color: String(this.fillStyle) });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, clear: ctx.clearRect };
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
});
