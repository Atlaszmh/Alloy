import { createImage, isOpaque, setRGBA, type Image, type RGB } from './image';
import { labDistance, nearest, oklab, type Palette } from './palette';

/**
 * Turn an image model's "pixel art" into a real sprite:
 *   1. key out the background (flood from the edges) and drop stray specks,
 *   2. find the art's own pixel grid (block size and phase),
 *   3. sample the centre of each block and snap it to the palette,
 *   4. place it bottom-centre on the target canvas, tidy orphans,
 *      cap the color count, and optionally add a 1px outline.
 * If no clear grid is found, or the art is larger than the canvas, the
 * content is resampled to fit instead.
 */

export interface CleanOptions {
  /** Output canvas size (square). */
  size: number;
  palette: Palette;
  /** Background color in the source, or 'auto' to read it from the borders. */
  background?: RGB | 'auto';
  /** The background the model was asked for: if it painted it as a card on another page, the card is keyed too. */
  card?: RGB;
  /** OKLab distance under which a pixel counts as background. */
  tolerance?: number;
  /** Add a 1px outline in this color (null for none). */
  outline?: RGB | null;
  /** Most palette colors the sprite may use. */
  maxColors?: number;
}

export interface CleanResult {
  image: Image;
  /** Source pixels per sprite pixel. */
  cell: number;
  /** Whether the art's own grid was found (vs. resampled to fit). */
  snapped: boolean;
}

/** Pieces lying wholly past this fraction of the width and height count as a corner watermark. */
const CORNER_MARK = 0.8;

/** OKLab distance under which a lone pixel is shading noise, not a detail (ENDESGA ramp steps are 0.08–0.19). */
const SPECK = 0.24;

/** How close to the requested background a card must be, and how far the page must be from it. The nearest ENDESGA colour is 0.23 from magenta. */
const CARD = 0.2;

/** The most common opaque color among `pixels` (indices), bucketed to absorb noise. */
function commonColor(src: Image, pixels: Iterable<number>): RGB | null {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const i of pixels) {
    const [r, g, b, a] = src.data.subarray(i * 4, i * 4 + 4);
    if (a < 128) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    counts.set(key, e);
  }
  let best = { n: 0, r: 0, g: 0, b: 0 };
  for (const e of counts.values()) if (e.n > best.n) best = e;
  return best.n ? [best.r / best.n, best.g / best.n, best.b / best.n] : null;
}

/** The most common border color. */
function borderColor(src: Image): RGB {
  const { width: W, height: H } = src;
  const border: number[] = [];
  for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) border.push(y * W, y * W + W - 1);
  return commonColor(src, border) ?? [255, 0, 255];
}

/**
 * Foreground mask: not transparent and not connected to the border through
 * background-colored pixels. With `card`, a model that painted the requested
 * background as a card on some other page gets the card keyed too, in whatever
 * shade it used: the colour just inside the page, if it is near `card`. White fur
 * inside the card's outline survives, as the card flood only crosses the card.
 */
function foregroundMask(src: Image, key: RGB, tolerance: number, card?: RGB): Uint8Array {
  const { width: W, height: H } = src;
  const lab = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    lab.set(oklab(src.data[o], src.data[o + 1], src.data[o + 2]), i * 3);
  }
  const outside = new Uint8Array(W * H);
  const flood = (keyLab: number[]) => {
    const isBg = (i: number) =>
      src.data[i * 4 + 3] < 128 ||
      labDistance([lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]], keyLab) < tolerance;
    const stack: number[] = [];
    for (let i = 0; i < W * H; i++) if (outside[i]) stack.push(i);
    const seed = (i: number) => {
      if (!outside[i] && isBg(i)) {
        outside[i] = 1;
        stack.push(i);
      }
    };
    for (let x = 0; x < W; x++) {
      seed(x);
      seed((H - 1) * W + x);
    }
    for (let y = 0; y < H; y++) {
      seed(y * W);
      seed(y * W + W - 1);
    }
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      if (x > 0) seed(i - 1);
      if (x < W - 1) seed(i + 1);
      if (i >= W) seed(i - W);
      if (i < W * (H - 1)) seed(i + W);
    }
  };
  flood(oklab(key[0], key[1], key[2]));
  const cardLab = card && oklab(card[0], card[1], card[2]);
  if (cardLab && labDistance(oklab(key[0], key[1], key[2]), cardLab) > CARD) {
    const inside: number[] = [];
    for (let i = 0; i < W * H; i++) {
      const x = i % W;
      const touches =
        (x > 0 && outside[i - 1]) ||
        (x < W - 1 && outside[i + 1]) ||
        (i >= W && outside[i - W]) ||
        (i < W * (H - 1) && outside[i + W]);
      if (!outside[i] && touches) inside.push(i);
    }
    const edge = commonColor(src, inside);
    if (edge) {
      const edgeLab = oklab(edge[0], edge[1], edge[2]);
      if (labDistance(edgeLab, cardLab) < CARD) flood(edgeLab);
    }
  }
  const fg = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) fg[i] = outside[i] ? 0 : 1;
  return fg;
}

/**
 * Remove connected pieces that are tiny next to the main body, and the Gemini
 * app's sparkle watermark: a separate small piece near the bottom-right corner.
 */
function dropSpecks(fg: Uint8Array, W: number, H: number): void {
  const label = new Int32Array(W * H).fill(-1);
  const pieces: { size: number; x0: number; y0: number }[] = [];
  for (let start = 0; start < W * H; start++) {
    if (!fg[start] || label[start] >= 0) continue;
    const id = pieces.length;
    const piece = { size: 0, x0: W, y0: H };
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      const y = (i / W) | 0;
      piece.size++;
      if (x < piece.x0) piece.x0 = x;
      if (y < piece.y0) piece.y0 = y;
      const nbs = [
        x > 0 ? i - 1 : -1,
        x < W - 1 ? i + 1 : -1,
        y > 0 ? i - W : -1,
        y < H - 1 ? i + W : -1,
      ];
      for (const j of nbs) {
        if (j >= 0 && fg[j] && label[j] < 0) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    pieces.push(piece);
  }
  const largest = Math.max(0, ...pieces.map((p) => p.size));
  const min = Math.max(8, largest * 0.02);
  const drop = pieces.map(
    (p) =>
      p.size < min ||
      (p.size < largest * 0.25 && p.x0 >= W * CORNER_MARK && p.y0 >= H * CORNER_MARK),
  );
  for (let i = 0; i < W * H; i++) if (fg[i] && drop[label[i]]) fg[i] = 0;
}

function boundingBox(fg: Uint8Array, W: number, H: number) {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!fg[y * W + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Find the block size of the art: color edges of real pixel art fall on a
 * regular lattice. For each candidate period, measure how tightly edge
 * positions cluster at one phase; the true block size is the largest period
 * that clusters (its divisors cluster too, its multiples do not).
 */
function detectGrid(
  idx: Int16Array,
  W: number,
  box: { x: number; y: number; w: number; h: number },
): { cell: number; phaseX: number; phaseY: number; score: number } | null {
  const maxP = Math.min(96, Math.floor(Math.min(box.w, box.h) / 3));
  if (maxP < 4) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = box.y; y < box.y + box.h; y += 2) {
    for (let x = box.x + 1; x < box.x + box.w; x++) {
      const a = idx[y * W + x - 1];
      const b = idx[y * W + x];
      if (a !== b) xs.push(x - box.x);
    }
  }
  for (let x = box.x; x < box.x + box.w; x += 2) {
    for (let y = box.y + 1; y < box.y + box.h; y++) {
      if (idx[(y - 1) * W + x] !== idx[y * W + x]) ys.push(y - box.y);
    }
  }
  if (xs.length < 8 || ys.length < 8) return null;
  const cluster = (edges: number[], p: number) => {
    const hist = new Float32Array(p);
    for (const e of edges) hist[e % p]++;
    const win = Math.max(1, Math.round(p * 0.08));
    let best = 0;
    let phase = 0;
    for (let k = 0; k < p; k++) {
      let sum = 0;
      for (let d = -win; d <= win; d++) sum += hist[(k + d + p) % p];
      if (sum > best) {
        best = sum;
        phase = k;
      }
    }
    // Normalise against what uniformly random edges would score in the same window.
    const baseline = (2 * win + 1) / p;
    return { score: (best / edges.length - baseline) / (1 - baseline), phase };
  };
  const results: { p: number; score: number; phaseX: number; phaseY: number }[] = [];
  let top = 0;
  for (let p = 4; p <= maxP; p++) {
    const cx = cluster(xs, p);
    const cy = cluster(ys, p);
    const score = Math.min(cx.score, cy.score);
    results.push({ p, score, phaseX: cx.phase, phaseY: cy.phase });
    if (score > top) top = score;
  }
  if (top < 0.3) return null;
  let pick = results[0];
  for (const r of results) if (r.score >= top * 0.85) pick = r;
  return { cell: pick.p, phaseX: pick.phaseX, phaseY: pick.phaseY, score: pick.score };
}

export function cleanSprite(src: Image, opts: CleanOptions): CleanResult {
  const { width: W, height: H } = src;
  const pal = opts.palette;
  const key = !opts.background || opts.background === 'auto' ? borderColor(src) : opts.background;
  const fg = foregroundMask(src, key, opts.tolerance ?? 0.12, opts.card);
  dropSpecks(fg, W, H);
  const box = boundingBox(fg, W, H);
  const size = opts.size;
  const out = createImage(size, size);
  if (!box) return { image: out, cell: 1, snapped: false };

  // Palette index per foreground pixel inside the box (cached by color).
  const idx = new Int16Array(W * H).fill(-1);
  const cache = new Map<number, number>();
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = y * W + x;
      if (!fg[i]) continue;
      const o = i * 4;
      const c = (src.data[o] << 16) | (src.data[o + 1] << 8) | src.data[o + 2];
      let k = cache.get(c);
      if (k === undefined) {
        k = nearest(pal, src.data[o], src.data[o + 1], src.data[o + 2]);
        cache.set(c, k);
      }
      idx[i] = k;
    }
  }

  const pad = opts.outline ? 1 : 0;
  const inner = size - pad * 2;
  let cell: number;
  let gx0: number;
  let gy0: number;
  let snapped = false;
  const grid = detectGrid(idx, W, box);
  if (
    grid &&
    Math.ceil(box.w / grid.cell) <= inner + 1 &&
    Math.ceil(box.h / grid.cell) <= inner + 1
  ) {
    cell = grid.cell;
    gx0 = box.x + grid.phaseX - (grid.phaseX > 0 ? cell : 0);
    gy0 = box.y + grid.phaseY - (grid.phaseY > 0 ? cell : 0);
    snapped = true;
  } else {
    cell = Math.max(box.w, box.h) / inner;
    gx0 = box.x;
    gy0 = box.y;
  }
  const nx = Math.min(inner, Math.max(1, Math.round((box.x + box.w - gx0) / cell)));
  const ny = Math.min(inner, Math.max(1, Math.round((box.y + box.h - gy0) / cell)));

  // Sample the middle of each block: block edges are where models blur.
  const blocks = new Int16Array(nx * ny).fill(-1);
  const votes = new Float32Array(pal.colors.length);
  for (let by = 0; by < ny; by++) {
    for (let bx = 0; bx < nx; bx++) {
      const sx0 = gx0 + bx * cell + cell * 0.2;
      const sx1 = gx0 + (bx + 1) * cell - cell * 0.2;
      const sy0 = gy0 + by * cell + cell * 0.2;
      const sy1 = gy0 + (by + 1) * cell - cell * 0.2;
      votes.fill(0);
      let total = 0;
      let inside = 0;
      for (let y = Math.floor(sy0); y < Math.max(Math.floor(sy0) + 1, Math.ceil(sy1)); y++) {
        for (let x = Math.floor(sx0); x < Math.max(Math.floor(sx0) + 1, Math.ceil(sx1)); x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          total++;
          const k = idx[y * W + x];
          if (k >= 0) {
            votes[k]++;
            inside++;
          }
        }
      }
      if (!total || inside / total < 0.45) continue;
      let best = 0;
      for (let k = 1; k < votes.length; k++) if (votes[k] > votes[best]) best = k;
      blocks[by * nx + bx] = best;
    }
  }

  // Cap the color count: fold rare colors into their nearest kept neighbour.
  if (opts.maxColors && opts.maxColors > 0) {
    const usage = new Map<number, number>();
    for (const k of blocks) if (k >= 0) usage.set(k, (usage.get(k) ?? 0) + 1);
    if (usage.size > opts.maxColors) {
      const kept = [...usage.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, opts.maxColors)
        .map(([k]) => k);
      for (let i = 0; i < blocks.length; i++) {
        const k = blocks[i];
        if (k >= 0 && !kept.includes(k)) {
          const c = pal.colors[k];
          blocks[i] = nearest(pal, c[0], c[1], c[2], kept);
        }
      }
    }
  }

  // Smooth specks: an inner pixel whose neighbours (3 or 4) share one close color takes that
  // color. Shading neighbours are under SPECK apart; details (eyes, sparks, runes) are well over.
  const smoothed = blocks.slice();
  for (let by = 1; by < ny - 1; by++) {
    for (let bx = 1; bx < nx - 1; bx++) {
      const i = by * nx + bx;
      const k = blocks[i];
      const nbs = [blocks[i - 1], blocks[i + 1], blocks[i - nx], blocks[i + nx]];
      if (k < 0 || nbs.includes(-1)) continue;
      const c = nbs.find((n) => n !== k && nbs.filter((m) => m === n).length >= 3);
      if (c !== undefined && labDistance(pal.lab[k], pal.lab[c]) < SPECK) smoothed[i] = c;
    }
  }
  blocks.set(smoothed);

  // Place bottom-centre.
  const ox = pad + Math.floor((inner - nx) / 2);
  const oy = size - pad - ny;
  for (let by = 0; by < ny; by++) {
    for (let bx = 0; bx < nx; bx++) {
      const k = blocks[by * nx + bx];
      if (k < 0) continue;
      const c = pal.colors[k];
      setRGBA(out, ox + bx, oy + by, c[0], c[1], c[2], 255);
    }
  }

  // Orphans: single pixels with no neighbours.
  const orphans: [number, number][] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isOpaque(out, x, y)) continue;
      if (
        !isOpaque(out, x - 1, y) &&
        !isOpaque(out, x + 1, y) &&
        !isOpaque(out, x, y - 1) &&
        !isOpaque(out, x, y + 1)
      ) {
        orphans.push([x, y]);
      }
    }
  }
  for (const [x, y] of orphans) setRGBA(out, x, y, 0, 0, 0, 0);

  if (opts.outline) {
    const o = opts.outline;
    const ring: [number, number][] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isOpaque(out, x, y)) continue;
        if (
          isOpaque(out, x - 1, y) ||
          isOpaque(out, x + 1, y) ||
          isOpaque(out, x, y - 1) ||
          isOpaque(out, x, y + 1)
        ) {
          ring.push([x, y]);
        }
      }
    }
    for (const [x, y] of ring) setRGBA(out, x, y, o[0], o[1], o[2], 255);
  }

  return { image: out, cell, snapped };
}
