import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { readPng, writePng, type Image } from './image';
import { bob } from './draw';
import { cleanSprite, type CleanOptions, type CleanResult } from './clean';
import { contactSheet } from './review';

/**
 * Candidates are cleaned options for one AI asset, kept side by side until a
 * person picks one: `raw-<n>.png` (the model's image), `<n>.png` (the sprite)
 * and `<n>.json` (where it came from).
 * They come from `generate` (the Gemini API) or `import` (images saved from the
 * Gemini app), and share one numbering so both can feed the same review sheet.
 */

/** The asset a file is named after: `frost_wolf.png`, `frost_wolf-2.png`, `Frost Wolf (3).jpg`. */
export function matchAssetId(file: string, ids: readonly string[]): string | null {
  const name = basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  let best: string | null = null;
  for (const id of ids) {
    if ((name === id || name.startsWith(`${id}_`)) && (!best || id.length > best.length)) best = id;
  }
  return best;
}

/** Candidate numbers already in `dir`, ascending. */
export function candidateNumbers(dir: string): number[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => /^(\d+)\.png$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

/** Where a candidate came from: `via` is the workflow, `gemini` or `import`. */
export interface CandidateMeta {
  via: string;
  seed?: number;
  prompt?: string;
  file?: string;
}

/** Clean `raw` into the next free candidate slot. */
export function addCandidate(
  dir: string,
  raw: Image,
  clean: CleanOptions,
  meta?: CandidateMeta,
): CleanResult & { n: number } {
  mkdirSync(dir, { recursive: true });
  const taken = candidateNumbers(dir);
  const n = taken.length ? taken[taken.length - 1] + 1 : 0;
  const result = cleanSprite(raw, clean);
  writePng(join(dir, `raw-${n}.png`), raw);
  writePng(join(dir, `${n}.png`), result.image);
  if (meta) writeFileSync(join(dir, `${n}.json`), JSON.stringify(meta, null, 2) + '\n');
  return { ...result, n };
}

/** Contact sheet of every candidate (with its idle frame); returns its path. */
export function writeCandidateReview(dir: string, id: string): string {
  const items = candidateNumbers(dir).map((n) => {
    const img = readPng(join(dir, `${n}.png`));
    const metaFile = join(dir, `${n}.json`);
    const via = existsSync(metaFile)
      ? ` ${(JSON.parse(readFileSync(metaFile, 'utf8')) as CandidateMeta).via}`
      : '';
    return { label: `${id} ${n}${via}`, frames: [img, bob(img)] };
  });
  const path = join(dir, 'review.png');
  writePng(path, contactSheet(items, 8, 3));
  return path;
}
