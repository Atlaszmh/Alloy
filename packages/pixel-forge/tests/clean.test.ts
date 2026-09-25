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
function fakeAiImage(scale: number, offset: number, size = 512): Image {
  const r = rand(7);
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

/** The Gemini app's visible watermark: a pale four-point sparkle near the bottom-right corner. */
function stampSparkle(img: Image, cx: number, cy: number, radius: number): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.sqrt(Math.abs(dx)) + Math.sqrt(Math.abs(dy)) > Math.sqrt(radius)) continue;
      const [r, g, b] = getRGBA(img, cx + dx, cy + dy);
      setRGBA(img, cx + dx, cy + dy, (r + 3 * 255) / 4, (g + 3 * 255) / 4, (b + 3 * 255) / 4, 255);
    }
  }
}

/** Fraction of SPRITE reproduced at (dx, dy) in the output. */
function matchSprite(image: Image, dx: number, dy: number): number {
  let match = 0;
  for (let sy = 0; sy < 10; sy++) {
    for (let sx = 0; sx < 10; sx++) {
      const ch = SPRITE[sy][sx];
      const [r, g, b, a] = getRGBA(image, sx + dx, sy + dy);
      if (ch === '.') match += a === 0 ? 1 : 0;
      else if (a === 255 && r === COLORS[ch][0] && g === COLORS[ch][1] && b === COLORS[ch][2])
        match++;
    }
  }
  return match / 100;
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

  it('ignores the Gemini app sparkle watermark in the bottom-right corner', () => {
    // A small sprite in a big image, so the sparkle is not tiny next to it.
    const img = fakeAiImage(12, 300, 1024);
    stampSparkle(img, 980, 980, 26);
    const { image, snapped } = cleanSprite(img, { size: 12, palette: PALETTE, outline: null });
    expect(snapped).toBe(true);
    expect(matchSprite(image, 1, 2)).toBeGreaterThan(0.95);
  });

  it('reads the background color from the borders when none is given', () => {
    const img = fakeAiImage(32, 70);
    // Repaint the magenta backdrop a flat teal.
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const [r, g, b] = getRGBA(img, x, y);
        if (r > 200 && b > 200 && g < 40) setRGBA(img, x, y, 40, 160, 150, 255);
      }
    const { image } = cleanSprite(img, {
      size: 12,
      palette: PALETTE,
      outline: null,
      background: 'auto',
    });
    expect(matchSprite(image, 1, 2)).toBeGreaterThan(0.95);
  });

  it('keys a magenta-ish card that a model painted on a white page', () => {
    const img = fakeAiImage(32, 70);
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const [r, g, b] = getRGBA(img, x, y);
        if (x < 40 || y < 40 || x >= 472 || y >= 472) setRGBA(img, x, y, 255, 255, 255, 255);
        // A darker magenta than asked for, as models often paint.
        else if (r > 200 && b > 200 && g < 40) setRGBA(img, x, y, 190, 5, 165, 255);
      }
    const { image } = cleanSprite(img, {
      size: 12,
      palette: PALETTE,
      outline: null,
      card: [255, 0, 255],
    });
    expect(matchSprite(image, 1, 2)).toBeGreaterThan(0.95);
  });

  it('smooths low-contrast specks but keeps high-contrast details', () => {
    const pal = makePalette('t', ['#181425', '#e43b44', '#be4a2f', '#feae34']);
    const rows = ['kkkkkkkk', 'krrrrrrk', 'krrdrrrk', 'krrrrryk', 'krrrrrrk', 'kkkkkkkk'];
    const colors: Record<string, [number, number, number]> = {
      k: [0x18, 0x14, 0x25],
      r: [0xe4, 0x3b, 0x44],
      d: [0xbe, 0x4a, 0x2f],
      y: [0xfe, 0xae, 0x34],
    };
    const img = createImage(240, 240);
    for (let y = 0; y < 240; y++)
      for (let x = 0; x < 240; x++) setRGBA(img, x, y, 255, 0, 255, 255);
    rows.forEach((row, by) =>
      [...row].forEach((ch, bx) => {
        for (let y = 0; y < 20; y++)
          for (let x = 0; x < 20; x++)
            setRGBA(img, 40 + bx * 20 + x, 40 + by * 20 + y, ...colors[ch], 255);
      }),
    );
    const { image } = cleanSprite(img, { size: 10, palette: pal, outline: null });
    // 8×6 art sits bottom-centre on the 10×10 canvas, at (1, 4).
    expect(getRGBA(image, 1 + 3, 4 + 2).slice(0, 3)).toEqual(colors.r);
    expect(getRGBA(image, 1 + 6, 4 + 3).slice(0, 3)).toEqual(colors.y);
  });

  it('keeps the outline colour for the outline: dark bodies take the next-darkest colour', () => {
    const pal = makePalette('t', ['#181425', '#262b44', '#f77622']);
    // A black lizard with one ember, as models draw "black-scaled" creatures.
    const rows = ['kkkkkkkk', 'kkkkekkk', 'kkkkkkkk', 'kkkkkkkk'];
    const colors: Record<string, [number, number, number]> = {
      k: [0x10, 0x0e, 0x18],
      e: [0xf7, 0x76, 0x22],
    };
    const img = createImage(240, 240);
    for (let y = 0; y < 240; y++)
      for (let x = 0; x < 240; x++) setRGBA(img, x, y, 255, 0, 255, 255);
    rows.forEach((row, by) =>
      [...row].forEach((ch, bx) => {
        for (let y = 0; y < 20; y++)
          for (let x = 0; x < 20; x++)
            setRGBA(img, 40 + bx * 20 + x, 40 + by * 20 + y, ...colors[ch], 255);
      }),
    );
    const black: [number, number, number] = [0x18, 0x14, 0x25];
    const { image } = cleanSprite(img, { size: 12, palette: pal, outline: black });
    const isBlack = (x: number, y: number) => {
      const [r, g, b, a] = getRGBA(image, x, y);
      return a === 255 && r === black[0] && g === black[1] && b === black[2];
    };
    const opaque = (x: number, y: number) => getRGBA(image, x, y)[3] === 255;
    let inner = 0;
    let innerBlack = 0;
    let ember = 0;
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 12; x++) {
        if (!opaque(x, y)) continue;
        if (getRGBA(image, x, y)[0] === 0xf7) ember++;
        const surrounded =
          opaque(x - 1, y) && opaque(x + 1, y) && opaque(x, y - 1) && opaque(x, y + 1);
        if (!surrounded) expect(isBlack(x, y), `edge (${x},${y}) is outline`).toBe(true);
        else {
          inner++;
          if (isBlack(x, y)) innerBlack++;
        }
      }
    expect(inner).toBeGreaterThan(10);
    expect(innerBlack).toBe(0);
    expect(ember).toBeGreaterThan(0);
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
