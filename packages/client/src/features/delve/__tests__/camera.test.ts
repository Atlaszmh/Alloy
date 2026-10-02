import { describe, it, expect } from 'vitest';
import { ARENA_VIEW_UNITS, arenaZoom, spritePixelScale } from '../arena/camera';

describe('the dive zoom', () => {
  it("picks the spec's whole scale at each window height (device-pixel ratio 1)", () => {
    // [window height, px per sprite px, units tall]: the spec's table.
    const table: [number, number, number][] = [
      [720, 3, 24],
      [800, 3, 26.7], // the Deck
      [1024, 4, 25.6],
      [1080, 4, 27],
      [1200, 5, 24], // a tie with 4 (30.0 units): the larger scale
      [1440, 5, 28.8],
      [2160, 8, 27],
    ];
    for (const [h, scale, tall] of table) {
      expect(spritePixelScale(h), `${h}p`).toBe(scale);
      const zoom = arenaZoom(h, 1);
      expect(zoom.scale).toBe(scale);
      expect(zoom.unitsTall).toBeCloseTo(tall, 1);
    }
    expect(ARENA_VIEW_UNITS).toBe(27);
  });

  it('runs in render pixels: at a ratio of 2 the scale doubles and the view stays', () => {
    expect(spritePixelScale(2160)).toBe(8);
    expect(arenaZoom(1080, 2)).toEqual({ scale: 8, unitsTall: 27 });
  });

  it('never goes under 2, and follows View distance', () => {
    expect(spritePixelScale(300)).toBe(2);
    expect(spritePixelScale(100)).toBe(2);
    expect(spritePixelScale(1080, 20)).toBe(5); // 21.6 units
    expect(spritePixelScale(1080, 30)).toBe(4); // 27.0, nearer 30 than 36.0
  });
});
