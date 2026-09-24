import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { makePalette, parseHex, type Palette } from './palette';
import type { RGB } from './image';

/** How a project's sprites should look: palette, outline, scale, and the prompt template. */
export interface StyleGuide {
  name: string;
  palette: { name: string; colors: string[] };
  /** Outline color added around cleaned AI sprites. */
  outline: string;
  /** Solid background the model is asked to paint (keyed out on cleanup). */
  background: string;
  /** World units per sprite pixel in the game. */
  pixelUnit: number;
  maxColors: number;
  /** Default image model. */
  model: string;
  /** Prompt lines; `{size}`, `{subject}` and `{maxColors}` are filled per asset. */
  prompt: string[];
}

export interface AssetSpec {
  id: string;
  /** Canvas size in pixels (square). */
  size: number;
  /** 'code' = drawn in a TypeScript module, 'ai' = generated then cleaned. */
  source: 'code' | 'ai';
  /** Code sprite module, relative to the manifest. */
  file?: string;
  /** What the sprite depicts (used in prompts). */
  subject: string;
}

export interface Manifest {
  style: string;
  atlas: { png: string; json: string };
  review: string;
  assets: AssetSpec[];
}

export interface Project {
  dir: string;
  manifest: Manifest;
  style: StyleGuide;
  palette: Palette;
  outline: RGB;
  background: RGB;
}

export function loadProject(manifestPath: string): Project {
  const path = resolve(manifestPath);
  const dir = dirname(path);
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  const style = JSON.parse(readFileSync(resolve(dir, manifest.style), 'utf8')) as StyleGuide;
  return {
    dir,
    manifest,
    style,
    palette: makePalette(style.palette.name, style.palette.colors),
    outline: parseHex(style.outline),
    background: parseHex(style.background),
  };
}
