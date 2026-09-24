import { describe, it, expect } from 'vitest';
import { createImage, getRGBA, setRGBA, type Image } from '../src/image';
import { makePalette } from '../src/palette';
import { cleanSprite } from '../src/clean';

const PALETTE = makePalette('test', [
  '#181425',
  '#e43b44',
  '#feae34',
  '#63c74d',
  '#0099db',
  '#ffffff',
]);

/** A 10×10 test sprite: outlined red body, yellow eye, green feet. */
const SPRITE = [
  '..kkkkkk..',
  '.krrrrrrk.',
  'krrrrrrrrk',
  'krryrrrrrk',
  'krrrrrrrrk',
  'krrrrrrrrk',
  '.krrrrrrk.',
  '..kkkkkk..',
  '..kg..gk..',
  '..kk..kk..',
];
const COLORS: Record<string, [number, number, number]> = {
  k: [0x18, 0x14, 0x25],
  r: [0xe4, 0x3b, 0x44],
  y: [0xfe, 0xae, 0x34],
  g: [0x63, 0xc7, 0x4d],
};

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Mimic what an image model returns: big soft blocks, noise, off-palette tints, a keyed background. */
function fakeAiImage(scale: number, offset: number): Image {
  const r = rand(7);
  const size = 512;
  const img = createImage(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Slightly uneven magenta background.
      setRGBA(img, x, y, (250 - (y / size) * 12) | 0, 6 + ((r() * 8) | 0), 248, 255);
    }
  }
  for (let sy = 0; sy < SPRITE.length; sy++) {
    for (let sx = 0; sx < SPRITE[sy].length; sx++) {
      const ch = SPRITE[sy][sx];
      if (ch === '.') continue;
      const c = COLORS[ch];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = offset + sx * scale + dx;
          const y = offset + sy * scale + dy;
          const edge = dx < 2 || dy < 2 || dx >= scale - 2 || dy >= scale - 2;
          const n = () => ((r() - 0.5) * (edge ? 70 : 24)) | 0;
          setRGBA(img, x, y, c[0] + 10 + n(), c[1] - 6 + n(), c[2] + 8 + n(), 255);
        }
      }
    }
  }
  return img;
}

describe('cleanSprite', () => {
  it('recovers a crisp, palette-locked sprite from a noisy upscaled image', () => {
    const { image } = cleanSprite(fakeAiImage(32, 70), {
      size: 12,
      palette: PALETTE,
      outline: null,
    });
    expect(image.width).toBe(12);
    expect(image.height).toBe(12);
    // Every opaque pixel uses a palette color.
    const allowed = new Set(PALETTE.colors.map((c) => c.join(',')));
    let opaque = 0;
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        const [r, g, b, a] = getRGBA(image, x, y);
        if (a === 0) continue;
        opaque++;
        expect(allowed.has(`${r},${g},${b}`)).toBe(true);
      }
    }
    // Content is centred horizontally and sits on the bottom edge; compare to the source art.
    let match = 0;
    let total = 0;
    for (let sy = 0; sy < 10; sy++) {
      for (let sx = 0; sx < 10; sx++) {
        const ch = SPRITE[sy][sx];
        const [r, g, b, a] = getRGBA(image, sx + 1, sy + 2);
        total++;
        if (ch === '.') match += a === 0 ? 1 : 0;
        else if (a === 255 && r === COLORS[ch][0] && g === COLORS[ch][1] && b === COLORS[ch][2])
          match++;
      }
    }
    expect(match / total).toBeGreaterThan(0.95);
    expect(opaque).toBeGreaterThan(60);
  });

  it('keys out the background and leaves the corners transparent', () => {
    const { image } = cleanSprite(fakeAiImage(20, 150), {
      size: 16,
      palette: PALETTE,
      outline: null,
    });
    expect(getRGBA(image, 0, 0)[3]).toBe(0);
    expect(getRGBA(image, 15, 0)[3]).toBe(0);
  });

  it('adds a one-pixel outline when asked', () => {
    const white: [number, number, number] = [255, 255, 255];
    const { image } = cleanSprite(fakeAiImage(32, 70), {
      size: 12,
      palette: PALETTE,
      outline: white,
    });
    // Native 10×10 art sits inside a 1px ring: under each foot, not between the feet.
    expect(getRGBA(image, 3, 11)).toEqual([255, 255, 255, 255]);
    expect(getRGBA(image, 8, 11)).toEqual([255, 255, 255, 255]);
    expect(getRGBA(image, 5, 11)[3]).toBe(0);
    expect(getRGBA(image, 5, 5)).toEqual([0xe4, 0x3b, 0x44, 255]);
  });

  it('limits how many palette colors a sprite may use', () => {
    const { image } = cleanSprite(fakeAiImage(32, 70), {
      size: 12,
      palette: PALETTE,
      outline: null,
      maxColors: 3,
    });
    const used = new Set<string>();
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 12; x++) {
        const [r, g, b, a] = getRGBA(image, x, y);
        if (a) used.add(`${r},${g},${b}`);
      }
    expect(used.size).toBeLessThanOrEqual(3);
  });

  it('drops stray single pixels', () => {
    const src = createImage(40, 40);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) setRGBA(src, x, y, 255, 0, 255, 255);
    for (let y = 10; y < 38; y++)
      for (let x = 10; x < 30; x++) setRGBA(src, x, y, 0xe4, 0x3b, 0x44, 255);
    // A lone speck far from the body.
    for (let y = 2; y < 4; y++)
      for (let x = 36; x < 38; x++) setRGBA(src, x, y, 0xfe, 0xae, 0x34, 255);
    const { image } = cleanSprite(src, { size: 16, palette: PALETTE, outline: null });
    let yellow = 0;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const [r, , , a] = getRGBA(image, x, y);
        if (a && r === 0xfe) yellow++;
      }
    expect(yellow).toBe(0);
  });
});
