import type { RGB } from './image';

/** A fixed set of colors, with OKLab coordinates for perceptual matching. */
export interface Palette {
  name: string;
  colors: RGB[];
  lab: [number, number, number][];
}

export function parseHex(hex: string): RGB {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function toHex(c: RGB): string {
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function linear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** sRGB (0–255) → OKLab. */
export function oklab(r: number, g: number, b: number): [number, number, number] {
  const lr = linear(r);
  const lg = linear(g);
  const lb = linear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function labDistance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function makePalette(name: string, hexes: string[]): Palette {
  const colors = hexes.map(parseHex);
  return { name, colors, lab: colors.map((c) => oklab(c[0], c[1], c[2])) };
}

/** Index of the palette color closest to (r, g, b), optionally among `allowed` indices. */
export function nearest(
  p: Palette,
  r: number,
  g: number,
  b: number,
  allowed?: readonly number[],
): number {
  const lab = oklab(r, g, b);
  let best = 0;
  let bestD = Infinity;
  const pool = allowed ?? p.lab.map((_, i) => i);
  for (const i of pool) {
    const d = labDistance(lab, p.lab[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
