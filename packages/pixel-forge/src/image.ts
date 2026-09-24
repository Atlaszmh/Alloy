import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';

/** An RGBA image, row-major, 4 bytes per pixel. */
export interface Image {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type RGB = readonly [number, number, number];

export function createImage(width: number, height: number): Image {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function getRGBA(img: Image, x: number, y: number): [number, number, number, number] {
  const o = (y * img.width + x) * 4;
  return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]];
}

export function setRGBA(
  img: Image,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const o = (y * img.width + x) * 4;
  img.data[o] = r;
  img.data[o + 1] = g;
  img.data[o + 2] = b;
  img.data[o + 3] = a;
}

export function isOpaque(img: Image, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return false;
  return img.data[(y * img.width + x) * 4 + 3] > 0;
}

export function decodePng(buffer: Buffer): Image {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

export function encodePng(img: Image): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  return PNG.sync.write(png);
}

export function readPng(path: string): Image {
  return decodePng(readFileSync(path));
}

export function writePng(path: string, img: Image): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(img));
}

/** Copy `src` onto `dst` at (x, y), skipping transparent pixels. */
export function blit(dst: Image, src: Image, x: number, y: number): void {
  for (let sy = 0; sy < src.height; sy++) {
    for (let sx = 0; sx < src.width; sx++) {
      const [r, g, b, a] = getRGBA(src, sx, sy);
      if (a > 0) setRGBA(dst, x + sx, y + sy, r, g, b, a);
    }
  }
}

/** Integer nearest-neighbour upscale (for previews). */
export function upscale(img: Image, k: number): Image {
  const out = createImage(img.width * k, img.height * k);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const [r, g, b, a] = getRGBA(img, (x / k) | 0, (y / k) | 0);
      setRGBA(out, x, y, r, g, b, a);
    }
  }
  return out;
}

export function fill(img: Image, c: RGB, a = 255): void {
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) setRGBA(img, x, y, c[0], c[1], c[2], a);
}
