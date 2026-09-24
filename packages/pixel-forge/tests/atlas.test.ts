import { describe, it, expect } from 'vitest';
import { createImage, getRGBA, setRGBA } from '../src/image';
import { packAtlas } from '../src/atlas';

function solid(w: number, h: number, v: number) {
  const img = createImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setRGBA(img, x, y, v, v, v, 255);
  return img;
}

describe('packAtlas', () => {
  it('packs every frame without overlap and describes them for Pixi', () => {
    const { image, json } = packAtlas([
      { id: 'rat', frames: [solid(16, 16, 10), solid(16, 16, 20)] },
      { id: 'boss', frames: [solid(32, 32, 30)] },
    ]);
    expect(Object.keys(json.frames).sort()).toEqual(['boss/0', 'rat/0', 'rat/1']);
    expect(json.animations).toEqual({ rat: ['rat/0', 'rat/1'], boss: ['boss/0'] });
    expect(json.meta.image).toBe('atlas.png');
    expect(json.meta.size).toEqual({ w: image.width, h: image.height });
    // Each frame's rectangle holds that frame's pixels.
    for (const [name, v] of [
      ['rat/0', 10],
      ['rat/1', 20],
      ['boss/0', 30],
    ] as const) {
      const f = json.frames[name].frame;
      expect(getRGBA(image, f.x, f.y)[0]).toBe(v);
      expect(getRGBA(image, f.x + f.w - 1, f.y + f.h - 1)[0]).toBe(v);
    }
    // Rectangles don't overlap.
    const rects = Object.values(json.frames).map((f) => f.frame);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
  });
});
