import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import {
  addCandidate,
  candidateNumbers,
  matchAssetId,
  writeCandidateReview,
} from '../src/candidates';
import { createImage, decodeImage, encodePng, fill, readPng, setRGBA } from '../src/image';
import { makePalette } from '../src/palette';

const PALETTE = makePalette('test', ['#181425', '#e43b44', '#feae34']);
const IDS = ['storm_hawk', 'storm', 'frost_wolf', 'skeleton'];

/** A 12-block red square with a yellow eye, 20px blocks, on magenta. */
function modelImage() {
  const img = createImage(400, 400);
  fill(img, [255, 0, 255]);
  for (let y = 80; y < 320; y++) for (let x = 80; x < 320; x++) setRGBA(img, x, y, 228, 59, 68);
  for (let y = 140; y < 160; y++) for (let x = 140; x < 160; x++) setRGBA(img, x, y, 254, 174, 52);
  return img;
}

describe('matchAssetId', () => {
  it('matches a file named after an asset, with or without a number', () => {
    expect(matchAssetId('frost_wolf.png', IDS)).toBe('frost_wolf');
    expect(matchAssetId('frost_wolf-2.png', IDS)).toBe('frost_wolf');
    expect(matchAssetId('Frost Wolf (3).jpg', IDS)).toBe('frost_wolf');
    expect(matchAssetId('/some/dir/skeleton.jpeg', IDS)).toBe('skeleton');
  });

  it('prefers the longest id', () => {
    expect(matchAssetId('storm_hawk_1.png', IDS)).toBe('storm_hawk');
    expect(matchAssetId('storm-1.png', IDS)).toBe('storm');
  });

  it('returns null for names that do not start with an id', () => {
    expect(matchAssetId('Gemini_Generated_Image_abc123.png', IDS)).toBeNull();
    expect(matchAssetId('skeletons.png', IDS)).toBeNull();
  });
});

describe('candidates', () => {
  const clean = { size: 16, palette: PALETTE, outline: null, background: 'auto' as const };

  it('numbers new candidates after the ones already there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-'));
    expect(candidateNumbers(dir)).toEqual([]);
    expect(addCandidate(dir, modelImage(), clean).n).toBe(0);
    expect(addCandidate(dir, modelImage(), clean).n).toBe(1);
    expect(candidateNumbers(dir)).toEqual([0, 1]);
    expect(existsSync(join(dir, 'raw-1.png'))).toBe(true);
    const sprite = readPng(join(dir, '1.png'));
    expect(sprite.width).toBe(16);
  });

  it('records where a candidate came from', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-'));
    const meta = { via: 'klein4b-edit', seed: 7, prompt: 'a wolf' };
    const { n } = addCandidate(dir, modelImage(), clean, meta);
    expect(JSON.parse(readFileSync(join(dir, `${n}.json`), 'utf8'))).toEqual(meta);
  });

  it('writes a review sheet covering every candidate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-'));
    addCandidate(dir, modelImage(), clean);
    addCandidate(dir, modelImage(), clean);
    const review = writeCandidateReview(dir, 'frost_wolf');
    expect(existsSync(review)).toBe(true);
    expect(readPng(review).width).toBeGreaterThan(16 * 8 * 2);
  });
});

describe('decodeImage', () => {
  it('reads PNG and JPEG by their bytes', () => {
    const img = modelImage();
    expect(decodeImage(encodePng(img)).width).toBe(400);
    const jpg = jpeg.encode({ data: Buffer.from(img.data), width: 400, height: 400 }, 90).data;
    expect(decodeImage(jpg).height).toBe(400);
  });

  it('explains unsupported formats', () => {
    const webp = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary');
    expect(() => decodeImage(webp)).toThrow(/WebP/);
  });
});
