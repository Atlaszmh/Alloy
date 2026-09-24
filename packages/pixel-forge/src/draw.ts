import { createImage, getRGBA, setRGBA, type Image } from './image';
import { parseHex } from './palette';

/**
 * Sprites drawn in code: each frame is a list of rows, one character per
 * pixel, colored through a legend ('.' and ' ' are transparent). Art is
 * placed bottom-centre on a square canvas.
 */
export interface CodeSprite {
  size: number;
  legend: Record<string, string>;
  frames: string[][];
  /** Rows hold the left half; the right half is its mirror image. */
  mirror?: boolean;
  /** With a single frame, add a breathing idle frame (default) or not. */
  idle?: 'bob' | 'none';
}

function expand(rows: string[], mirror: boolean | undefined): string[] {
  if (!mirror) return rows;
  return rows.map((r) => r + [...r].reverse().join(''));
}

export function renderFrame(sprite: CodeSprite, rows: string[]): Image {
  const full = expand(rows, sprite.mirror);
  const w = Math.max(...full.map((r) => r.length));
  const h = full.length;
  const img = createImage(sprite.size, sprite.size);
  const ox = Math.floor((sprite.size - w) / 2);
  const oy = sprite.size - h;
  const colors: Record<string, ReturnType<typeof parseHex>> = {};
  for (const [ch, hex] of Object.entries(sprite.legend)) colors[ch] = parseHex(hex);
  full.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return;
      const c = colors[ch];
      if (!c) throw new Error(`Character "${ch}" is not in the legend`);
      setRGBA(img, ox + x, oy + y, c[0], c[1], c[2], 255);
    });
  });
  return img;
}

/** Idle "breath": the upper half of the body dips one pixel; the legs stay planted. */
export function bob(img: Image): Image {
  const out = createImage(img.width, img.height);
  out.data.set(img.data);
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (getRGBA(img, x, y)[3] > 0) {
        if (top < 0) top = y;
        bottom = y;
      }
    }
  }
  if (top < 0) return out;
  const mid = top + Math.floor((bottom - top) / 2);
  for (let y = mid; y >= top; y--) {
    for (let x = 0; x < img.width; x++) {
      const [r, g, b, a] = getRGBA(img, x, y);
      setRGBA(out, x, y + 1, r, g, b, a);
    }
  }
  for (let x = 0; x < img.width; x++) setRGBA(out, x, top, 0, 0, 0, 0);
  return out;
}

export function renderSprite(sprite: CodeSprite): Image[] {
  const frames = sprite.frames.map((rows) => renderFrame(sprite, rows));
  if (frames.length === 1 && sprite.idle !== 'none') frames.push(bob(frames[0]));
  return frames;
}
