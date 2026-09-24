import { Assets, type Spritesheet, type Texture } from 'pixi.js';

/**
 * Pixel-art sprites for the arena, packed by packages/pixel-forge into
 * public/sprites/delve/atlas.{png,json}. Anything without a sprite keeps its
 * emoji, so the art can land a few creatures at a time.
 */

/** Arena units per sprite pixel: matches the pixel floor's density (style.json pixelUnit). */
export const SPRITE_PIXEL = 0.1;

let sheet: Spritesheet | null = null;
let loading: Promise<void> | null = null;

export function loadDelveSprites(): Promise<void> {
  loading ??= Assets.load<Spritesheet>(`${import.meta.env.BASE_URL}sprites/delve/atlas.json`)
    .then((s) => {
      for (const tex of Object.values(s.textures)) tex.source.scaleMode = 'nearest';
      sheet = s;
    })
    .catch(() => {
      sheet = null;
    });
  return loading;
}

/** Animation frames for a sprite id (monster def id, or 'hero'), if it has art. */
export function spriteFrames(id: string): Texture[] | null {
  return sheet?.animations[id] ?? null;
}
