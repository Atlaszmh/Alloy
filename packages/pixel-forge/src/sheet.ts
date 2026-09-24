import { blit, createImage, fill, getRGBA, setRGBA, upscale, type Image, type RGB } from './image';

/**
 * Sprite-sheet completion: image models copy a style (and above all its pixel
 * size) far better when they fill a gap in a sheet of existing sprites than
 * when they are shown a reference and asked for a new picture. The sheet is a
 * 3×2 grid of cells, one per sprite, with the last cell left empty for the new
 * sprite; `cropSlot` cuts that cell back out of the model's output.
 */

/** Sheet pixels per sprite pixel. */
const BLOCK = 12;
const COLS = 3;
const ROWS = 2;

export interface Slot {
  x: number;
  y: number;
  size: number;
}

/** Up to five references (those that fit a `size`-pixel cell), bottom-centred, and an empty cell. */
export function completionSheet(
  refs: readonly Image[],
  size: number,
  background: RGB,
): { image: Image; slot: Slot; block: number; placed: number } {
  const cell = size * BLOCK;
  const pad = 2 * BLOCK;
  const image = createImage(COLS * (cell + pad) + pad, ROWS * (cell + pad) + pad);
  fill(image, background);
  const at = (i: number) => ({
    x: pad + (i % COLS) * (cell + pad),
    y: pad + Math.floor(i / COLS) * (cell + pad),
  });
  const fits = refs.filter((r) => r.width <= size && r.height <= size).slice(0, COLS * ROWS - 1);
  fits.forEach((r, i) => {
    const { x, y } = at(i);
    blit(
      image,
      upscale(r, BLOCK),
      x + ((cell - r.width * BLOCK) >> 1),
      y + cell - r.height * BLOCK,
    );
  });
  return {
    image,
    slot: { ...at(COLS * ROWS - 1), size: cell },
    block: BLOCK,
    placed: fits.length,
  };
}

/** The empty cell's contents in `out`, a model's version of `sheet` at any scale. */
export function cropSlot(out: Image, sheet: Image, slot: Slot): Image {
  const sx = out.width / sheet.width;
  const sy = out.height / sheet.height;
  const x0 = Math.round(slot.x * sx);
  const y0 = Math.round(slot.y * sy);
  const crop = createImage(Math.round(slot.size * sx), Math.round(slot.size * sy));
  for (let y = 0; y < crop.height; y++)
    for (let x = 0; x < crop.width; x++) {
      const [r, g, b, a] = getRGBA(out, x0 + x, y0 + y);
      setRGBA(crop, x, y, r, g, b, a);
    }
  return crop;
}
