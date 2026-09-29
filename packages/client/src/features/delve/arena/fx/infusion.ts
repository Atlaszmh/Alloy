import type { Graphics } from 'pixi.js';
import type { ManaType, Vec } from '@alloy/engine';
import { MANA_HEX } from '../palette';
import { PX, hash, manaLine, px } from './mana-pixels';

/**
 * Infusion motifs. A spell that mixes two mana types keeps its first element
 * as its body and shows the second (its infusion) as that element's motif, on
 * whatever carries it: an `orb` (a projectile, a lob), a `path` (a beam, a
 * sweep, a blink trail) or a `ring` (a blast, a zone rim, an aura). Each
 * element has one motif in three shapes, so any pair works on any form. It is
 * all mana pixels on the sprites' 0.1-unit grid, and every random choice
 * hashes `seed` and `time`, so a motif is stable per carrier and never
 * shimmers (no Math.random). See the infusion visuals spec.
 */

const TAU = Math.PI * 2;
/**
 * Golden-ratio slots: element `i` sits at fraction `i × GOLDEN` (plus the
 * carrier's own offset) round a ring or along a path. Every prefix is evenly
 * spread, so a fading carrier (fewer elements) only drops its last ones and
 * the rest keep their places.
 */
const GOLDEN = 0.618034;

export interface OrbShape {
  kind: 'orb';
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
}

export interface PathShape {
  kind: 'path';
  points: Vec[];
  width: number;
  /** 0–1 as the carrier grows and fades. */
  progress: number;
}

export interface RingShape {
  kind: 'ring';
  x: number;
  y: number;
  r: number;
}

export type InfusionShape = OrbShape | PathShape | RingShape;

/**
 * The pixel layers a motif draws on. Every bright pixel goes on the additive
 * `air` layer (above the sprites); the dark shapes go on the normal-blend
 * `ground` layer (under them), which callers pass only for carriers on the
 * ground (blasts, zones, blink trails): its absence means an air carrier.
 */
export interface InfusionLayers {
  air: Graphics;
  ground?: Graphics;
}

/** The frame's allowance of motif elements, spent in the order the infusion pass draws. */
export interface InfusionBudget {
  left: number;
}

export const INFUSION_BUDGET = 600;

/** The dark shapes, drawn only on the ground layer. */
export const SHADOW_SMOKE = 0x1d1129;
export const EARTH_CRACK = 0x2b2017;
/** Light stone, so pebbles and rubble read on the additive layer. */
const STONE = 0xe8d8b4;
const STONE_DIM = 0xbfa47c;
const EMBER = 0xffc46b;

/** A storm arc's length along a rim, in units. */
const STORM_ARC = 0.9;

/** Elements per carrier: an orb's count, per unit of length along a path, per unit of rim round a ring. */
const DENSITY: Record<ManaType, Record<InfusionShape['kind'], number>> = {
  storm: { orb: 3, path: 1 / 1.2, ring: 0.7 },
  nature: { orb: 4, path: 1.8, ring: 0.9 },
  frost: { orb: 6, path: 2, ring: 1.4 },
  fire: { orb: 6, path: 2.2, ring: 1.6 },
  earth: { orb: 4, path: 1.5, ring: 0.8 },
  shadow: { orb: 4, path: 1.3, ring: 1.4 },
};

/** A seed for a transient carrier, from where and when its event happened. */
export function eventSeed(x: number, y: number, t: number): number {
  return hash(x * 3.7 + t * 11.3, y * 5.3 - t * 7.1);
}

/** What drawing one motif element needs: the layers, the palette, the clock and the strength's effects. */
interface Pen {
  air: Graphics;
  ground: Graphics | undefined;
  color: number;
  light: number;
  deep: number;
  time: number;
  seed: number;
  alpha: number;
  reach: number;
  /** Behind an orb carrier and across it (see `behind`). */
  back: Back;
}

/** A point along a path, with its unit tangent and normal. */
interface PathPoint {
  x: number;
  y: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
}

interface Motif {
  /** Element `i` round a moving ball. */
  orb: (p: Pen, o: OrbShape, i: number) => void;
  /** Element `i` at a point along a path. */
  path: (p: Pen, s: PathShape, at: PathPoint, i: number) => void;
  /** Element `i` at angle `a` on a rim. */
  ring: (p: Pen, o: RingShape, a: number, i: number) => void;
}

/** A 0..1 value fixed for element `i` of this carrier (`k` picks one of several). */
function fixed(p: Pen, i: number, k: number): number {
  return hash(i * 1.37 + k * 7.91, p.seed);
}

/** A 0..1 value for element `i`, re-rolled `rate` times a second. */
function flick(p: Pen, i: number, k: number, rate: number): number {
  return hash(i * 2.11 + k * 5.3, p.seed + Math.floor(p.time * rate) * 0.731);
}

/** `a` blended toward `b` by `k` (0x rrggbb colours). */
function mix(a: number, b: number, k: number): number {
  const ch = (s: number) => {
    const x = (a >> s) & 255;
    return Math.round(x + (((b >> s) & 255) - x) * k) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

/** A path's length, and the point at fraction `t` of it; null when it has no points. */
function sampler(points: Vec[]): { len: number; at: (t: number) => PathPoint } | null {
  if (points.length === 0) return null;
  const pts = points.length > 1 ? points : [points[0], points[0]];
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const len = cum[cum.length - 1];
  return {
    len,
    at: (t) => {
      const d = t * len;
      let i = 1;
      while (i < pts.length - 1 && cum[i] < d) i++;
      const a = pts[i - 1];
      const b = pts[i];
      const seg = cum[i] - cum[i - 1];
      const k = seg > 0 ? Math.min(1, Math.max(0, (d - cum[i - 1]) / seg)) : 0;
      const tx = seg > 0 ? (b.x - a.x) / seg : 0;
      const ty = seg > 0 ? (b.y - a.y) / seg : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, tx, ty, nx: -ty, ny: tx };
    },
  };
}

/** A point on a path's edge, `side` (1 or −1) of its centre line. */
function edge(s: PathShape, at: PathPoint, side: number): Vec {
  const w = (s.width / 2) * side;
  return { x: at.x + at.nx * w, y: at.y + at.ny * w };
}

interface Back {
  dx: number;
  dy: number;
  qx: number;
  qy: number;
}

/** Behind something moving at (vx, vy) (straight down while it stands still), and across it. */
function behind(vx: number, vy: number): Back {
  const v = Math.hypot(vx, vy);
  const dx = v > 1e-6 ? -vx / v : 0;
  const dy = v > 1e-6 ? -vy / v : 1;
  return { dx, dy, qx: -dy, qy: dx };
}

/** Pixels stepped from (x, y) along (dx, dy) for `len` units, turning `turn` radians on the way; returns the tip. */
function curl(
  g: Graphics,
  x: number,
  y: number,
  dx: number,
  dy: number,
  len: number,
  turn: number,
  color: number,
  alpha: number,
): Vec {
  const steps = Math.max(1, Math.round(len / PX));
  let a = Math.atan2(dy, dx);
  for (let k = 0; k < steps; k++) {
    x += Math.cos(a) * PX;
    y += Math.sin(a) * PX;
    a += turn / steps;
    px(g, x, y, color, alpha * (1 - (0.5 * k) / steps));
  }
  return { x, y };
}

/** A crooked line (lightning, cracks): `k` segments whose bends `h` throws up to `bend` units sideways. */
function crooked(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number,
  alpha: number,
  bend: number,
  k: number,
  h: (j: number) => number,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  let ax = x0;
  let ay = y0;
  for (let j = 1; j <= k; j++) {
    const off = j < k ? (h(j) - 0.5) * 2 * bend : 0;
    const bx = x0 + ((x1 - x0) * j) / k + nx * off;
    const by = y0 + ((y1 - y0) * j) / k + ny * off;
    manaLine(g, ax, ay, bx, by, color, alpha);
    ax = bx;
    ay = by;
  }
}

/** A flame tongue rising `h` units from (x, y): bright at the root, flickering sideways. */
function flame(p: Pen, x: number, y: number, h: number, i: number): void {
  const steps = Math.max(1, Math.round(h / PX));
  for (let k = 0; k < steps; k++) {
    const t = k / steps;
    const sway = Math.sin(p.time * 14 + i * 1.7 + k * 0.8) * 0.05 * t;
    px(p.air, x + sway, y - k * PX, t < 0.4 ? p.light : p.color, p.alpha * (1 - 0.7 * t));
  }
}

const MOTIFS: Record<ManaType, Motif> = {
  // Storm: jagged arcs crackling off the carrier, re-rolled about 15 times a second.
  storm: {
    orb: (p, o, i) => {
      const a = TAU * flick(p, i, 0, 15);
      const out = a + (flick(p, i, 1, 15) - 0.5) * 0.8;
      const r1 = o.r + (0.3 + 0.3 * flick(p, i, 2, 15)) * p.reach;
      const x1 = o.x + Math.cos(out) * r1;
      const y1 = o.y + Math.sin(out) * r1;
      crooked(
        p.air,
        o.x + Math.cos(a) * o.r,
        o.y + Math.sin(a) * o.r,
        x1,
        y1,
        p.color,
        p.alpha,
        0.14,
        3,
        (j) => flick(p, i, 3 + j, 15),
      );
      px(p.air, x1, y1, 0xffffff, p.alpha);
    },
    path: (p, s, at, i) => {
      const side = fixed(p, i, 0) < 0.5 ? -1 : 1;
      const tilt = (flick(p, i, 0, 15) - 0.5) * 0.9;
      const dx = at.nx * side * Math.cos(tilt) + at.tx * Math.sin(tilt);
      const dy = at.ny * side * Math.cos(tilt) + at.ty * Math.sin(tilt);
      const e = edge(s, at, side);
      const len = (0.25 + 0.3 * flick(p, i, 1, 15)) * p.reach;
      crooked(p.air, e.x, e.y, e.x + dx * len, e.y + dy * len, p.color, p.alpha, 0.12, 3, (j) =>
        flick(p, i, 2 + j, 15),
      );
      px(p.air, e.x + dx * len, e.y + dy * len, 0xffffff, p.alpha);
    },
    ring: (p, o, a, i) => {
      if (flick(p, i, 0, 15) < 0.25) return; // it crackles on and off
      // A set length of rim (not a share of it), so golden-spaced arcs never pile up or shrink when thinned.
      const span = Math.min(TAU / 3, (STORM_ARC * p.reach) / Math.max(0.1, o.r));
      let prev: Vec | null = null;
      for (let j = 0; j <= 4; j++) {
        const aj = a + span * (j / 4 - 0.5);
        const rr = o.r + (j % 2 ? 0.18 : -0.06) * p.reach + (flick(p, i, 1 + j, 15) - 0.5) * 0.08;
        const q = { x: o.x + Math.cos(aj) * rr, y: o.y + Math.sin(aj) * rr };
        if (prev) manaLine(p.air, prev.x, prev.y, q.x, q.y, p.color, p.alpha);
        if (j % 2) px(p.air, q.x, q.y, 0xffffff, p.alpha);
        prev = q;
      }
    },
  },

  // Nature: a curling vine and leaf sprigs behind a ball, tendrils off a path, roots out of a rim.
  nature: {
    orb: (p, o, i) => {
      const b = p.back;
      const x0 = o.x + b.dx * o.r;
      const y0 = o.y + b.dy * o.r;
      if (i === 0) {
        // A hashed phase, so vines on different projectiles don't curl in lockstep.
        const turn = Math.sin(p.time * 4 + fixed(p, 0, 5) * TAU) * 2.2;
        curl(p.air, x0, y0, b.dx, b.dy, 0.5 * p.reach, turn, p.color, p.alpha);
        return;
      }
      const d = (0.1 + 0.4 * fixed(p, i, 0)) * p.reach;
      const side = i % 2 ? 1 : -1;
      const sway = Math.sin(p.time * 6 + i) * 0.04;
      const sx = x0 + b.dx * d + b.qx * side * 0.08;
      const sy = y0 + b.dy * d + b.qy * side * 0.08;
      px(p.air, sx, sy, p.color, p.alpha);
      px(p.air, sx + b.qx * side * (0.1 + sway), sy + b.qy * side * (0.1 + sway), p.light, p.alpha);
      px(
        p.air,
        sx + b.qx * side * (0.2 + sway) + b.dx * PX,
        sy + b.qy * side * (0.2 + sway) + b.dy * PX,
        p.light,
        p.alpha * 0.8,
      );
    },
    path: (p, s, at, i) => {
      const side = i % 2 ? 1 : -1;
      const e = edge(s, at, side);
      // Tendrils sprout sideways from two pixels past the edge (off a beam's bright body,
      // where green still reads on the additive layer), all in full green, and curl
      // tighter as the carrier's progress rises.
      const x0 = e.x + at.nx * side * 2 * PX;
      const y0 = e.y + at.ny * side * 2 * PX;
      const len = (0.2 + 0.35 * fixed(p, i, 0)) * p.reach * Math.min(1, 0.3 + 1.5 * s.progress);
      const turn = side * (fixed(p, i, 1) < 0.5 ? 1 : -1) * (0.6 + 2.2 * s.progress);
      const tip = curl(p.air, x0, y0, at.nx * side, at.ny * side, len, turn, p.color, p.alpha);
      px(p.air, tip.x, tip.y, p.color, p.alpha);
      px(p.air, tip.x + at.tx * PX, tip.y + at.ty * PX, p.color, p.alpha * 0.8);
    },
    ring: (p, o, a, i) => {
      const len = (0.2 + 0.35 * fixed(p, i, 0)) * p.reach;
      const tip = curl(
        p.air,
        o.x + Math.cos(a) * o.r,
        o.y + Math.sin(a) * o.r,
        Math.cos(a),
        Math.sin(a),
        len,
        (fixed(p, i, 1) - 0.5) * 2.4,
        p.color,
        p.alpha,
      );
      // A sprout at the root's tip.
      px(p.air, tip.x, tip.y - PX, p.light, p.alpha);
      px(
        p.air,
        tip.x + PX,
        tip.y - 2 * PX,
        p.light,
        p.alpha * (0.6 + 0.4 * Math.sin(p.time * 3 + i)),
      );
    },
  },

  // Frost: ice shards and spikes with white tips, a rime trail, glints.
  frost: {
    orb: (p, o, i) => {
      if (i < 3) {
        const a = (TAU * i) / 3 + p.time * 5;
        const r0 = o.r + 0.1;
        const r1 = r0 + 0.22 * p.reach;
        const c = Math.cos(a);
        const s = Math.sin(a);
        manaLine(p.air, o.x + c * r0, o.y + s * r0, o.x + c * r1, o.y + s * r1, p.light, p.alpha);
        px(p.air, o.x + c * r1, o.y + s * r1, 0xffffff, p.alpha);
        return;
      }
      // The rime trail behind it.
      const b = p.back;
      const k = ((i - 3) % 3) + 1;
      const d = o.r + k * 0.14 * p.reach;
      const off = (fixed(p, i, 0) - 0.5) * 0.2;
      px(
        p.air,
        o.x + b.dx * d + b.qx * off,
        o.y + b.dy * d + b.qy * off,
        p.light,
        p.alpha * (1 - k * 0.2),
      );
    },
    path: (p, s, at, i) => {
      const side = i % 2 ? 1 : -1;
      const e = edge(s, at, side);
      // Crystal spikes grow from both edges as the carrier's progress rises.
      const len = (0.15 + 0.35 * fixed(p, i, 0)) * p.reach * Math.min(1, 0.25 + 4 * s.progress);
      const tilt = (fixed(p, i, 1) - 0.5) * 0.7;
      const dx = at.nx * side * Math.cos(tilt) + at.tx * Math.sin(tilt);
      const dy = at.ny * side * Math.cos(tilt) + at.ty * Math.sin(tilt);
      manaLine(p.air, e.x, e.y, e.x + dx * len, e.y + dy * len, p.light, p.alpha);
      px(p.air, e.x + dx * len, e.y + dy * len, 0xffffff, p.alpha);
    },
    ring: (p, o, a, i) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const r1 = o.r + (0.18 + 0.35 * fixed(p, i, 0)) * p.reach;
      manaLine(p.air, o.x + c * o.r, o.y + s * o.r, o.x + c * r1, o.y + s * r1, p.light, p.alpha);
      const glint = 0.5 + 0.5 * Math.sin(p.time * 9 + fixed(p, i, 1) * TAU);
      px(p.air, o.x + c * r1, o.y + s * r1, 0xffffff, p.alpha * glint);
    },
  },

  // Fire: flame tongues licking upward, and embers rising.
  fire: {
    orb: (p, o, i) => {
      if (i % 2 === 0) {
        const h = (0.15 + 0.35 * flick(p, i, 0, 12)) * p.reach;
        flame(p, o.x + (fixed(p, i, 0) - 0.5) * o.r * 1.4, o.y - o.r * 0.5, h, i);
        return;
      }
      const ph = (p.time * 1.4 + fixed(p, i, 1)) % 1;
      const x = o.x + (fixed(p, i, 2) - 0.5) * o.r * 2;
      px(p.air, x, o.y - o.r - ph * 0.6 * p.reach, EMBER, p.alpha * (1 - ph));
    },
    path: (p, s, at, i) => {
      const x = at.x + (fixed(p, i, 0) - 0.5) * s.width;
      const y = at.y + (fixed(p, i, 1) - 0.5) * s.width * 0.5;
      flame(p, x, y, (0.18 + 0.35 * flick(p, i, 0, 12)) * p.reach, i);
    },
    ring: (p, o, a, i) => {
      const x = o.x + Math.cos(a) * o.r;
      const y = o.y + Math.sin(a) * o.r;
      if (i % 3 !== 2) {
        flame(p, x, y, (0.2 + 0.35 * flick(p, i, 0, 12)) * p.reach, i);
        return;
      }
      const ph = (p.time * 1.2 + fixed(p, i, 0)) % 1;
      px(
        p.air,
        x + Math.sin(p.time * 3 + i) * 0.06,
        y - ph * 0.6 * p.reach,
        EMBER,
        p.alpha * (1 - ph),
      );
    },
  },

  // Earth: light stone pebbles and rubble on the air layer; cracks on the ground under ground carriers.
  earth: {
    orb: (p, o, i) => {
      const a = TAU * (i * GOLDEN + fixed(p, 0, 9)) + p.time * 3.5;
      const rr = o.r + 0.14 + 0.05 * Math.sin(p.time * 2 + i);
      const x = o.x + Math.cos(a) * rr;
      const y = o.y + Math.sin(a) * rr;
      px(p.air, x, y, i % 2 ? STONE_DIM : STONE, p.alpha, 2);
      px(p.air, x, y, 0xffffff, p.alpha * 0.5);
    },
    path: (p, s, at, i) => {
      // A rubble chunk kicked up and out, hopping as it goes.
      const ph = (p.time * 2.2 + fixed(p, i, 0)) % 1;
      const side = i % 2 ? 1 : -1;
      const off = side * (s.width * 0.25 + ph * 0.35 * p.reach);
      const lift = Math.sin(Math.PI * ph) * 0.35 * p.reach;
      const x = at.x + at.nx * off;
      const y = at.y + at.ny * off - lift;
      px(p.air, x, y, i % 3 ? STONE : STONE_DIM, p.alpha * (1 - 0.5 * ph), 2);
      if (p.ground) {
        const bend = (fixed(p, i, 1) - 0.5) * 0.2;
        manaLine(
          p.ground,
          at.x - at.tx * 0.15,
          at.y - at.ty * 0.15,
          at.x + at.tx * 0.15 + at.nx * bend,
          at.y + at.ty * 0.15 + at.ny * bend,
          EARTH_CRACK,
          0.9 * p.alpha,
        );
      }
    },
    ring: (p, o, a, i) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      // A rock thrown outward from the rim.
      const ph = (p.time * 1.3 + fixed(p, i, 0)) % 1;
      const d = o.r + ph * 0.4 * p.reach;
      const lift = Math.sin(Math.PI * ph) * 0.25 * p.reach;
      px(
        p.air,
        o.x + c * d,
        o.y + s * d - lift,
        i % 2 ? STONE_DIM : STONE,
        p.alpha * (1 - 0.6 * ph),
        2,
      );
      if (p.ground) {
        // The rim cracks.
        const r0 = o.r - 0.12;
        const r1 = o.r + (0.15 + 0.25 * fixed(p, i, 1)) * p.reach;
        crooked(
          p.ground,
          o.x + c * r0,
          o.y + s * r0,
          o.x + c * r1,
          o.y + s * r1,
          EARTH_CRACK,
          0.9 * p.alpha,
          0.05,
          3,
          (j) => fixed(p, i, 2 + j),
        );
      }
    },
  },

  // Shadow: wisps and smoke in the shadow palette's purples on the air layer; dark smoke and void on the ground.
  shadow: {
    orb: (p, o, i) => {
      const b = p.back;
      const side = (i % 2 ? 1 : -1) * 0.05 * ((i + 1) >> 1);
      const phase = fixed(p, 0, 9) * TAU;
      for (let k = 0; k < 5; k++) {
        const d = o.r * 0.6 + (k + 1) * 0.1 * p.reach;
        const wave = Math.sin(p.time * 5 + k * 0.9 + i * 2.1 + phase) * 0.1 * (k / 4) + side;
        px(
          p.air,
          o.x + b.dx * d + b.qx * wave,
          o.y + b.dy * d + b.qy * wave,
          k < 2 ? p.color : p.deep,
          p.alpha * (1 - k / 5),
        );
      }
    },
    path: (p, s, at, i) => {
      const side = i % 2 ? 1 : -1;
      const e = edge(s, at, side);
      // A smoke tendril curling up off the edge.
      const len = (0.2 + 0.3 * fixed(p, i, 0)) * p.reach;
      const turn = side * (1.2 + Math.sin(p.time * 3 + i));
      curl(p.air, e.x, e.y, at.nx * side, at.ny * side - 0.8, len, turn, p.deep, p.alpha);
      if (p.ground) {
        const x = at.x + (fixed(p, i, 1) - 0.5) * s.width;
        const y = at.y + (fixed(p, i, 2) - 0.5) * s.width;
        px(p.ground, x, y, SHADOW_SMOKE, 0.7 * p.alpha, 2);
      }
    },
    ring: (p, o, a, i) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      if (i % 2 === 0) {
        // A wisp rising off the rim.
        const len = (0.2 + 0.35 * fixed(p, i, 0)) * p.reach;
        const turn = Math.sin(p.time * 3 + i) * 1.5;
        curl(p.air, o.x + c * o.r, o.y + s * o.r, c * 0.3, -1, len, turn, p.color, p.alpha);
        return;
      }
      // A void mote pulled inward across the rim.
      const ph = (p.time * 0.9 + fixed(p, i, 0)) % 1;
      const d = o.r + 0.5 * p.reach - ph * (0.5 * p.reach + o.r * 0.6);
      const x = o.x + c * d;
      const y = o.y + s * d;
      if (p.ground) px(p.ground, x, y, SHADOW_SMOKE, p.alpha * (0.4 + 0.6 * ph), 2);
      px(p.air, x, y, p.color, p.alpha * Math.sin(Math.PI * ph));
    },
  },
};

/**
 * Draw `element`'s motif on one carrier. `strength` (0–1.5: carriers pass
 * their fade; a heavy or hold blow's ring, in the blow's own element, draws
 * at 1.5) scales the element count (`round(base × strength)`, where the base
 * grows with the carrier's size), the alpha (`min(1, strength)`) and the
 * reach (`× (0.8 + 0.2 × strength)`).
 * The count is checked against `budget` first: drawn in full if it fits,
 * its first half if that fits (the golden slots' most even half), else
 * skipped; what is drawn comes off it.
 */
export function drawInfusion(
  layers: InfusionLayers,
  element: ManaType,
  shape: InfusionShape,
  time: number,
  seed: number,
  strength: number,
  budget: InfusionBudget,
): void {
  const s = Math.min(1.5, strength);
  if (!(s > 0)) return;
  const path = shape.kind === 'path' ? sampler(shape.points) : null;
  const size = shape.kind === 'orb' ? 1 : shape.kind === 'ring' ? TAU * shape.r : (path?.len ?? 0);
  const n = Math.round(DENSITY[element][shape.kind] * size * s);
  const count = n <= budget.left ? n : Math.ceil(n / 2) <= budget.left ? Math.ceil(n / 2) : 0;
  if (count <= 0) return;
  const color = MANA_HEX[element];
  const p: Pen = {
    air: layers.air,
    ground: layers.ground,
    color,
    light: mix(color, 0xffffff, 0.45),
    deep: mix(color, 0x000000, 0.3),
    time,
    seed,
    alpha: Math.min(1, s),
    reach: 0.8 + 0.2 * s,
    back: shape.kind === 'orb' ? behind(shape.vx, shape.vy) : behind(0, 0),
  };
  const m = MOTIFS[element];
  const offset = fixed(p, 0, 9);
  const slot = (i: number) => (i * GOLDEN + offset) % 1;
  for (let i = 0; i < count; i++) {
    if (shape.kind === 'orb') m.orb(p, shape, i);
    else if (shape.kind === 'ring') m.ring(p, shape, TAU * slot(i), i);
    else if (path) m.path(p, shape, path.at(slot(i)), i);
  }
  budget.left -= count;
}
