import { describe, it, expect } from 'vitest';
import { completionSheet, cropSlot } from '../src/sheet';
import { createImage, fill, getRGBA, setRGBA, type Image } from '../src/image';

const MAGENTA = [255, 0, 255] as const;

function sprite(w: number, h: number, rgb: [number, number, number]): Image {
  const img = createImage(w, h);
  fill(img, rgb);
  return img;
}

describe('completionSheet', () => {
  it('lays out the references with an empty cell for the new sprite', () => {
    const refs = [sprite(16, 16, [255, 0, 0]), sprite(10, 8, [0, 255, 0])];
    const { image, slot, block, placed } = completionSheet(refs, 16, [...MAGENTA]);
    expect(block).toBe(12);
    expect(placed).toBe(2);
    expect(slot.size).toBe(16 * 12);
    // The empty cell is plain background.
    for (const [x, y] of [
      [slot.x, slot.y],
      [slot.x + slot.size - 1, slot.y + slot.size - 1],
    ]) {
      expect(getRGBA(image, x, y).slice(0, 3)).toEqual([...MAGENTA]);
    }
    // References stand on the bottom of their cells, centred.
    let red = 0;
    let green = 0;
    for (let i = 0; i < image.width * image.height; i++) {
      const [r, g, b] = [image.data[i * 4], image.data[i * 4 + 1], image.data[i * 4 + 2]];
      if (r === 255 && g === 0 && b === 0) red++;
      if (r === 0 && g === 255 && b === 0) green++;
    }
    expect(red).toBe(16 * 16 * 144);
    expect(green).toBe(10 * 8 * 144);
  });

  it('leaves out references too big for the cell', () => {
    const { image, placed } = completionSheet([sprite(32, 32, [0, 0, 255])], 16, [...MAGENTA]);
    expect(placed).toBe(0);
    let other = 0;
    for (let i = 0; i < image.width * image.height; i++) if (image.data[i * 4] !== 255) other++;
    expect(other).toBe(0);
  });
});

describe('cropSlot', () => {
  it('cuts the new sprite out of a model output at a different scale', () => {
    const { image: sheet, slot } = completionSheet([sprite(16, 16, [255, 0, 0])], 16, [...MAGENTA]);
    // The "model" returns the sheet at 1.5× with the empty cell painted yellow.
    const k = 1.5;
    const out = createImage(Math.round(sheet.width * k), Math.round(sheet.height * k));
    for (let y = 0; y < out.height; y++)
      for (let x = 0; x < out.width; x++) {
        const [r, g, b] = getRGBA(sheet, (x / k) | 0, (y / k) | 0);
        const inSlot =
          x >= slot.x * k &&
          x < (slot.x + slot.size) * k &&
          y >= slot.y * k &&
          y < (slot.y + slot.size) * k;
        setRGBA(out, x, y, inSlot ? 250 : r, inSlot ? 250 : g, inSlot ? 0 : b, 255);
      }
    const crop = cropSlot(out, sheet, slot);
    expect(crop.width).toBe(Math.round(slot.size * k));
    expect(getRGBA(crop, 1, 1).slice(0, 3)).toEqual([250, 250, 0]);
    expect(getRGBA(crop, crop.width - 2, crop.height - 2).slice(0, 3)).toEqual([250, 250, 0]);
  });
});
