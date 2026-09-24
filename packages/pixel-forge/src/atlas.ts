import { blit, createImage, type Image } from './image';

export interface AtlasEntry {
  id: string;
  frames: Image[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pixi-compatible spritesheet description (TexturePacker "hash" format). */
export interface SpritesheetJson {
  frames: Record<
    string,
    {
      frame: Rect;
      rotated: false;
      trimmed: false;
      spriteSourceSize: Rect;
      sourceSize: { w: number; h: number };
    }
  >;
  animations: Record<string, string[]>;
  meta: {
    app: string;
    version: string;
    image: string;
    format: 'RGBA8888';
    size: { w: number; h: number };
    scale: '1';
  };
}

/** Shelf-pack every frame into one image, with 1px gaps. Frames are named `id/index`. */
export function packAtlas(
  entries: AtlasEntry[],
  maxWidth = 256,
  image = 'atlas.png',
): { image: Image; json: SpritesheetJson } {
  const pad = 1;
  const items = entries.flatMap((e) => e.frames.map((img, i) => ({ name: `${e.id}/${i}`, img })));
  const order = [...items].sort((a, b) => b.img.height - a.img.height);
  const placed = new Map<string, Rect>();
  let x = 0;
  let y = 0;
  let rowH = 0;
  let width = 0;
  for (const it of order) {
    const { width: w, height: h } = it.img;
    if (x > 0 && x + w > maxWidth) {
      x = 0;
      y += rowH + pad;
      rowH = 0;
    }
    placed.set(it.name, { x, y, w, h });
    x += w + pad;
    rowH = Math.max(rowH, h);
    width = Math.max(width, x - pad);
  }
  const height = y + rowH;
  const sheet = createImage(Math.max(1, width), Math.max(1, height));
  const json: SpritesheetJson = {
    frames: {},
    animations: {},
    meta: {
      app: 'alloy-pixel-forge',
      version: '1',
      image,
      format: 'RGBA8888',
      size: { w: sheet.width, h: sheet.height },
      scale: '1',
    },
  };
  for (const it of items) {
    const r = placed.get(it.name)!;
    blit(sheet, it.img, r.x, r.y);
    json.frames[it.name] = {
      frame: r,
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
      sourceSize: { w: r.w, h: r.h },
    };
  }
  for (const e of entries) json.animations[e.id] = e.frames.map((_, i) => `${e.id}/${i}`);
  return { image: sheet, json };
}
