import type { Graphics } from 'pixi.js';
import type { StyleLook } from '@alloy/engine';
import { PX, hash, manaArc, manaLine, px } from './mana-pixels';
import type { InfusionBudget, InfusionLayers, InfusionShape } from './infusion';

/**
 * Look motifs (the constructs spec §4.2): one per weapon, drawn on its casts' carriers (a cast's
 * ring at the hand, a beam's or a dash's path, a slash's arc, a blast's rim) as the infusion motifs
 * are: mana pixels on the sprites' grid, each element placed by a hash of the carrier's seed and
 * the clock (so a motif streams along its carrier and never shimmers), one budget element each.
 * A look is colour-neutral: steel and stone keep their tones, the rest take the cast's element.
 */

export const LOOKS: readonly StyleLook[] = [
  'blade',
  'crescent',
  'hatchet',
  'stone',
  'orb',
  'spark',
  'arrow',
];

const GOLDEN = 0.618034;
const TAU = Math.PI * 2;
const STEEL = 0xe8e4de;
const STEEL_DIM = 0xa8a29e;
const STONE = 0xe8d8b4;
const STONE_DIM = 0xbfa47c;

/** Elements per carrier: an orb's count, per unit along a path, per unit of rim round a ring. */
const DENSITY: Record<StyleLook, Record<InfusionShape['kind'], number>> = {
  blade: { orb: 3, path: 1.2, ring: 0.9 },
  crescent: { orb: 2, path: 0.8, ring: 0.6 },
  hatchet: { orb: 2, path: 0.7, ring: 0.5 },
  stone: { orb: 4, path: 1.4, ring: 1.2 },
  orb: { orb: 3, path: 1, ring: 0.8 },
  spark: { orb: 5, path: 2, ring: 1.4 },
  arrow: { orb: 2, path: 0.9, ring: 0.6 },
};

/** How many elements `look` draws on `shape` (the budget it spends when it has it). */
export function lookCount(look: StyleLook, shape: InfusionShape): number {
  const d = DENSITY[look][shape.kind];
  if (shape.kind === 'orb') return d;
  if (shape.kind === 'ring') return Math.max(2, Math.round(TAU * shape.r * d));
  return Math.max(1, Math.round(pathLength(shape.points) * d));
}

/** One motif element's place: a point, its unit tangent and a per-element random in [0, 1). */
interface Slot {
  x: number;
  y: number;
  tx: number;
  ty: number;
  r: number;
}

function pathLength(points: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++)
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len;
}

/** The point a fraction `f` of the way along a polyline, with its tangent. */
function alongPath(points: { x: number; y: number }[], f: number): Slot {
  let want = f * pathLength(points);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (want <= seg || i === points.length - 1) {
      const t = seg > 0 ? Math.min(1, want / seg) : 0;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        tx: seg > 0 ? (b.x - a.x) / seg : 1,
        ty: seg > 0 ? (b.y - a.y) / seg : 0,
        r: 0,
      };
    }
    want -= seg;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, tx: 1, ty: 0, r: 0 };
}

/** Element `i`: golden-ratio spaced and streaming with the clock, so every prefix spreads evenly. */
function slotAt(shape: InfusionShape, i: number, seed: number, time: number): Slot {
  const f = (i * GOLDEN + hash(seed, i) + time * 0.6) % 1;
  const r = hash(seed + 13, i);
  if (shape.kind === 'ring') {
    const a = f * TAU;
    return {
      x: shape.x + Math.cos(a) * shape.r,
      y: shape.y + Math.sin(a) * shape.r,
      tx: -Math.sin(a),
      ty: Math.cos(a),
      r,
    };
  }
  if (shape.kind === 'orb') {
    const a = f * TAU;
    const v = Math.hypot(shape.vx, shape.vy);
    return {
      x: shape.x + Math.cos(a) * shape.r,
      y: shape.y + Math.sin(a) * shape.r,
      tx: v > 0 ? shape.vx / v : 1,
      ty: v > 0 ? shape.vy / v : 0,
      r,
    };
  }
  // A path draws only as far as its carrier has grown.
  return { ...alongPath(shape.points, f * Math.max(0.05, shape.progress)), r };
}

type Motif = (g: Graphics, s: Slot, color: number, alpha: number) => void;

/** Each look's one element. Steel and stone keep their tones; the rest take the cast's colour. */
const MOTIF: Record<StyleLook, Motif> = {
  // A steel sliver along the carrier, white at its tip.
  blade: (g, s, _c, a) => {
    manaLine(
      g,
      s.x - s.tx * PX,
      s.y - s.ty * PX,
      s.x + s.tx * 2 * PX,
      s.y + s.ty * 2 * PX,
      STEEL,
      a,
      {
        thickness: 1,
      },
    );
    px(g, s.x + s.tx * 2 * PX, s.y + s.ty * 2 * PX, 0xffffff, a);
  },
  // A short arc bowed across the carrier.
  crescent: (g, s, c, a) => {
    const at = Math.atan2(s.ty, s.tx) + Math.PI / 2;
    manaArc(g, s.x, s.y, 0.25, at - 1.1, at + 1.1, c, a, 1);
  },
  // A haft along the carrier and a wide head across its end.
  hatchet: (g, s, _c, a) => {
    const hx = s.x + s.tx * PX;
    const hy = s.y + s.ty * PX;
    manaLine(g, s.x - s.tx * 2 * PX, s.y - s.ty * 2 * PX, hx, hy, STEEL_DIM, a, { thickness: 1 });
    manaLine(g, hx + s.ty * PX, hy - s.tx * PX, hx - s.ty * 2 * PX, hy + s.tx * 2 * PX, STEEL, a, {
      thickness: 2,
    });
  },
  // Pebbles and dust in stone tones, a bigger one now and then.
  stone: (g, s, _c, a) => {
    px(g, s.x, s.y, s.r < 0.5 ? STONE : STONE_DIM, a, s.r < 0.3 ? 2 : 1);
    px(g, s.x + PX, s.y - PX, STONE_DIM, a * 0.6);
  },
  // A small orb: a white heart ringed by four pixels of the element.
  orb: (g, s, c, a) => {
    px(g, s.x, s.y, 0xffffff, a);
    px(g, s.x + PX, s.y, c, a * 0.8);
    px(g, s.x - PX, s.y, c, a * 0.8);
    px(g, s.x, s.y + PX, c, a * 0.8);
    px(g, s.x, s.y - PX, c, a * 0.8);
  },
  // A white spark with a short trail of the element behind it.
  spark: (g, s, c, a) => {
    px(g, s.x, s.y, 0xffffff, a);
    manaLine(
      g,
      s.x - s.tx * 3 * PX,
      s.y - s.ty * 3 * PX,
      s.x - s.tx * PX,
      s.y - s.ty * PX,
      c,
      a * 0.7,
      {
        thickness: 1,
      },
    );
  },
  // A streak along the carrier with a chevron head.
  arrow: (g, s, c, a) => {
    manaLine(g, s.x - s.tx * 4 * PX, s.y - s.ty * 4 * PX, s.x, s.y, c, a, { thickness: 1 });
    px(g, s.x - s.tx * PX - s.ty * PX, s.y - s.ty * PX + s.tx * PX, 0xffffff, a);
    px(g, s.x - s.tx * PX + s.ty * PX, s.y - s.ty * PX - s.tx * PX, 0xffffff, a);
    px(g, s.x, s.y, 0xffffff, a);
  },
};

/**
 * Draw `look` on `shape` in `color` (the cast's element): `strength` 0–1 its alpha, `seed` the
 * carrier's, `time` the clock; each element spends one of `budget.left`, and none is drawn past it.
 */
export function drawLook(
  layers: InfusionLayers,
  look: StyleLook,
  color: number,
  shape: InfusionShape,
  time: number,
  seed: number,
  strength: number,
  budget: InfusionBudget,
): void {
  if (strength <= 0) return;
  const n = lookCount(look, shape);
  const alpha = Math.min(1, 0.9 * strength);
  for (let i = 0; i < n; i++) {
    if (budget.left <= 0) return;
    budget.left -= 1;
    MOTIF[look](layers.air, slotAt(shape, i, seed, time), color, alpha);
  }
}
