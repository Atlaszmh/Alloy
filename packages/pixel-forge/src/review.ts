import { createImage, getRGBA, setRGBA, type Image } from './image';
import { drawText } from './font';

export interface SheetItem {
  label: string;
  frames: Image[];
}

/**
 * A labelled contact sheet: every frame upscaled on a checkerboard (so
 * transparency and outlines read clearly), for reviewing a batch at a glance.
 */
export function contactSheet(items: SheetItem[], scale = 6, columns = 4): Image {
  const gap = 10;
  const labelH = 5 * 2 + 8;
  const tileW = Math.max(
    ...items.map((it) => it.frames.reduce((w, f) => w + f.width * scale + 4, -4)),
    80,
  );
  const tileH =
    Math.max(...items.map((it) => Math.max(...it.frames.map((f) => f.height)) * scale)) + labelH;
  const cols = Math.min(columns, items.length);
  const rows = Math.ceil(items.length / cols);
  const sheet = createImage(gap + cols * (tileW + gap), gap + rows * (tileH + gap));
  for (let y = 0; y < sheet.height; y++)
    for (let x = 0; x < sheet.width; x++) setRGBA(sheet, x, y, 21, 19, 27, 255);
  items.forEach((it, n) => {
    const tx = gap + (n % cols) * (tileW + gap);
    const ty = gap + Math.floor(n / cols) * (tileH + gap);
    drawText(sheet, it.label.slice(0, Math.floor(tileW / 8)), tx, ty, [200, 196, 214], 2);
    let fx = tx;
    for (const f of it.frames) {
      for (let y = 0; y < f.height * scale; y++) {
        for (let x = 0; x < f.width * scale; x++) {
          const checker = ((x / scale) ^ (y / scale)) & 1 ? 44 : 36;
          const [r, g, b, a] = getRGBA(f, (x / scale) | 0, (y / scale) | 0);
          if (a) setRGBA(sheet, fx + x, ty + labelH + y, r, g, b, 255);
          else setRGBA(sheet, fx + x, ty + labelH + y, checker, checker - 2, checker + 6, 255);
        }
      }
      fx += f.width * scale + 4;
    }
  });
  return sheet;
}
