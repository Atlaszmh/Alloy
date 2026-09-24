import type { RGB } from './themes';
import { DETAIL, MAT, PART, PROP, type PixelWorld } from './world';

/**
 * Draws a PixelWorld into an RGBA buffer, lit like a night scene:
 *   color = albedo × (ambient + blurred light) + emissive
 * Glowing water, fungi, runes, fire and spells both emit (self-glow) and
 * cast light (a half-resolution buffer, box-blurred into soft halos).
 *
 * A `view` renders only part of the world, optionally at 2 output pixels per
 * cell: the simulation stays coarse while the picture gets finer detail
 * (grass blades, smooth shorelines, thin rain), and the cost follows what is
 * on screen rather than the size of the arena.
 */

export interface RenderView {
  /** Top-left cell of the view. */
  x0: number;
  y0: number;
  /** View size in cells. */
  w: number;
  h: number;
  /** Output pixels per cell (1 or 2). */
  scale: number;
}

const LIGHT_GAIN = 1.6;
const BLUR_RADIUS = 2;
/** Cells beyond the view whose light can still reach it. */
const LIGHT_PAD = 14;
const MAX_SCALE = 2;
const SUBS = MAX_SCALE * MAX_SCALE;

const SIN_SIZE = 4096;
const SIN_TABLE = new Float32Array(SIN_SIZE);
for (let k = 0; k < SIN_SIZE; k++) SIN_TABLE[k] = Math.sin((k / SIN_SIZE) * Math.PI * 2);
const SIN_SCALE = SIN_SIZE / (Math.PI * 2);
/** Table sine: plenty for shimmer and sway, and much cheaper per pixel. */
const fsin = (v: number) => SIN_TABLE[((v * SIN_SCALE) | 0) & (SIN_SIZE - 1)];

const RAIN_HEAD: RGB = [184, 210, 232];
const RAIN_TAIL: RGB = [140, 166, 196];
const SNOW: RGB = [244, 248, 255];
const SPLASH: RGB = [214, 236, 255];
const STEAM: RGB = [214, 222, 232];
const DUST: RGB = [156, 130, 98];
const MIST: RGB = [176, 186, 206];
const STEM: RGB = [206, 200, 186];
const POLLEN: RGB = [255, 240, 190];
const RIPPLE: RGB = [230, 250, 255];
const WHITE: RGB = [255, 255, 255];

/** Per-floor data that never changes: texture jitter and grass blades per sub-pixel. */
interface WorldScratch {
  lw: number;
  lh: number;
  lr: Float32Array;
  lg: Float32Array;
  lb: Float32Array;
  tmp: Float32Array;
  tint: Float32Array;
  /** Brightness jitter per cell × sub-pixel. */
  jitter: Float32Array;
  /** Bit per sub-pixel: a grass blade / a shrub leaf / a tall leaf grows here. */
  grassBlade: Uint8Array;
  bushBlade: Uint8Array;
  tallBlade: Uint8Array;
  /** Sway needed to bend each blade (per cell × sub-pixel). */
  bladeThr: Float32Array;
  /** Bit per sub-pixel: an ice crack runs through here. */
  crack: Uint8Array;
  /** Base color per cell, rebuilt when the cell's material or detail changes. */
  baseR: Uint8Array;
  baseG: Uint8Array;
  baseB: Uint8Array;
  cachedMat: Uint8Array;
  cachedDetail: Uint8Array;
  /** Wind sway per 4×4 cell block. */
  sway: Float32Array;
  sw: number;
}

interface ViewScratch {
  rw: number;
  rh: number;
  er: Float32Array;
  eg: Float32Array;
  eb: Float32Array;
  colCell: Int32Array;
  rowCell: Int32Array;
  fc0: Int32Array;
  fc1: Int32Array;
  ffx: Float32Array;
  fr0: Int32Array;
  fr1: Int32Array;
  ffy: Float32Array;
  /** Ambient + light multiplier per view cell (RGB). */
  lightF: Float32Array;
  /** 1 where fluid touches the cell's 3×3 neighbourhood. */
  wetNear: Uint8Array;
}

const worldScratch = new WeakMap<PixelWorld, WorldScratch>();
const viewScratch = new WeakMap<PixelWorld, ViewScratch>();

function getWorldScratch(pw: PixelWorld): WorldScratch {
  let s = worldScratch.get(pw);
  if (s) return s;
  const n = pw.size;
  const lw = Math.ceil(pw.width / 2);
  const lh = Math.ceil(pw.height / 2);
  const tint = new Float32Array(n);
  const jitter = new Float32Array(n * SUBS);
  const grassBlade = new Uint8Array(n);
  const bushBlade = new Uint8Array(n);
  const tallBlade = new Uint8Array(n);
  const bladeThr = new Float32Array(n * SUBS);
  const crack = new Uint8Array(n);
  const jitterMul = [1, 3.13, 5.71, 7.37];
  const bladeMul = [7.13, 11.7, 13.9, 17.3];
  for (let i = 0; i < n; i++) {
    const v = pw.noise[i];
    tint[i] = (v * 3.7) % 1;
    for (let q = 0; q < SUBS; q++) {
      jitter[i * SUBS + q] = 0.93 + ((v * jitterMul[q] * 13.1) % 1) * 0.14;
      const bh = (v * bladeMul[q]) % 1;
      if (bh > 0.52) grassBlade[i] |= 1 << q;
      if (bh > 0.36) bushBlade[i] |= 1 << q;
      if (bh > 0.8) tallBlade[i] |= 1 << q;
      bladeThr[i * SUBS + q] = 0.55 + ((tint[i] + bh) % 1) * 0.4;
      if ((v * jitterMul[q] * 7.7) % 1 > 0.86) crack[i] |= 1 << q;
    }
  }
  const sw = Math.ceil(pw.width / 4);
  s = {
    lw,
    lh,
    lr: new Float32Array(lw * lh),
    lg: new Float32Array(lw * lh),
    lb: new Float32Array(lw * lh),
    tmp: new Float32Array(Math.max(lw, lh)),
    tint,
    jitter,
    grassBlade,
    bushBlade,
    tallBlade,
    bladeThr,
    crack,
    baseR: new Uint8Array(n),
    baseG: new Uint8Array(n),
    baseB: new Uint8Array(n),
    cachedMat: new Uint8Array(n).fill(255),
    cachedDetail: new Uint8Array(n),
    sway: new Float32Array(sw * Math.ceil(pw.height / 4)),
    sw,
  };
  worldScratch.set(pw, s);
  return s;
}

function getViewScratch(pw: PixelWorld, vw: number, vh: number, s: number): ViewScratch {
  const rw = vw * s;
  const rh = vh * s;
  let v = viewScratch.get(pw);
  if (!v || v.rw !== rw || v.rh !== rh || v.lightF.length !== vw * vh * 3) {
    const n = rw * rh;
    v = {
      rw,
      rh,
      er: new Float32Array(n),
      eg: new Float32Array(n),
      eb: new Float32Array(n),
      colCell: new Int32Array(rw),
      rowCell: new Int32Array(rh),
      fc0: new Int32Array(rw),
      fc1: new Int32Array(rw),
      ffx: new Float32Array(rw),
      fr0: new Int32Array(rh),
      fr1: new Int32Array(rh),
      ffy: new Float32Array(rh),
      lightF: new Float32Array(vw * vh * 3),
      wetNear: new Uint8Array(vw * vh),
    };
    viewScratch.set(pw, v);
  }
  return v;
}

function boxBlur(buf: Float32Array, w: number, h: number, r: number, tmp: Float32Array): void {
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const first = buf[row];
    const last = buf[row + w - 1];
    let acc = first * (r + 1);
    for (let k = 1; k <= r; k++) acc += buf[row + (k < w ? k : w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[x] = acc * norm;
      const ai = x + r + 1;
      const si = x - r;
      acc += (ai < w ? buf[row + ai] : last) - (si >= 0 ? buf[row + si] : first);
    }
    for (let x = 0; x < w; x++) buf[row + x] = tmp[x];
  }
  for (let x = 0; x < w; x++) {
    const first = buf[x];
    const last = buf[(h - 1) * w + x];
    let acc = first * (r + 1);
    for (let k = 1; k <= r; k++) acc += buf[(k < h ? k : h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      tmp[y] = acc * norm;
      const ai = y + r + 1;
      const si = y - r;
      acc += (ai < h ? buf[ai * w + x] : last) - (si >= 0 ? buf[si * w + x] : first);
    }
    for (let y = 0; y < h; y++) buf[y * w + x] = tmp[y];
  }
}

function fillBase(pw: PixelWorld, S: WorldScratch, i: number): void {
  const th = pw.theme;
  const n = pw.noise[i];
  const tone = pw.tone[i];
  let c: RGB;
  let r: number;
  let g: number;
  let b: number;
  switch (pw.mat[i]) {
    case MAT.GRASS:
      c = th.grass[n > 0.92 ? Math.min(3, tone + 1) : tone];
      r = c[0];
      g = c[1];
      b = c[2];
      break;
    case MAT.BUSH:
      c = n > 0.66 ? th.bush[2] : n > 0.22 ? th.bush[1] : th.bush[0];
      r = c[0];
      g = c[1];
      b = c[2];
      break;
    case MAT.SOIL:
      c = th.soil[Math.min(2, tone)];
      r = c[0] + (n > 0.95 ? 18 : 0);
      g = c[1] + (n > 0.95 ? 16 : 0);
      b = c[2] + (n > 0.95 ? 14 : 0);
      break;
    case MAT.BANK:
      c = th.bank[n > 0.55 ? 1 : 0];
      r = c[0];
      g = c[1];
      b = c[2];
      break;
    case MAT.STONE: {
      const d = pw.detail[i];
      if (d & DETAIL.MORTAR) {
        c = d & DETAIL.MOSS ? th.moss : th.mortar;
        r = c[0];
        g = c[1];
        b = c[2];
      } else {
        const v = 0.86 + (tone / 255) * 0.26 + (n - 0.5) * 0.06;
        r = th.stone[0] * v;
        g = th.stone[1] * v;
        b = th.stone[2] * v;
        if (d & DETAIL.MOSS && n > 0.35) {
          r = r * 0.45 + th.moss[0] * 0.55;
          g = g * 0.45 + th.moss[1] * 0.55;
          b = b * 0.45 + th.moss[2] * 0.55;
        }
      }
      break;
    }
    case MAT.ASH:
      r = n > 0.8 ? 70 : 46;
      g = n > 0.8 ? 64 : 42;
      b = n > 0.8 ? 62 : 42;
      break;
    case MAT.CRATER:
      c = th.soil[n > 0.6 ? 1 : 0];
      r = c[0] * 0.8;
      g = c[1] * 0.8;
      b = c[2] * 0.8;
      break;
    case MAT.RUBBLE: {
      const p = pw.rubble[i];
      r = p & 255;
      g = (p >> 8) & 255;
      b = (p >> 16) & 255;
      break;
    }
    case MAT.OBSIDIAN:
      r = n > 0.9 ? 76 : 24;
      g = n > 0.9 ? 66 : 18;
      b = n > 0.9 ? 98 : 28;
      break;
    default:
      c = th.wall[Math.min(2, tone)];
      r = c[0];
      g = c[1];
      b = c[2];
  }
  S.baseR[i] = r;
  S.baseG[i] = g;
  S.baseB[i] = b;
  S.cachedMat[i] = pw.mat[i];
  S.cachedDetail[i] = pw.detail[i];
}

/** Everything one render call needs, shared by the passes. */
interface Frame {
  pw: PixelWorld;
  out: Uint8ClampedArray;
  t: number;
  S: WorldScratch;
  V: ViewScratch;
  x0: number;
  y0: number;
  vw: number;
  vh: number;
  s: number;
  RW: number;
  RH: number;
}

function put(F: Frame, rx: number, ry: number, r: number, g: number, b: number, a: number): void {
  if (rx < 0 || ry < 0 || rx >= F.RW || ry >= F.RH) return;
  const o = (ry * F.RW + rx) * 4;
  const out = F.out;
  out[o] += (r - out[o]) * a;
  out[o + 1] += (g - out[o + 1]) * a;
  out[o + 2] += (b - out[o + 2]) * a;
}

function blend(F: Frame, rx: number, ry: number, c: RGB, a: number): void {
  put(F, rx, ry, c[0], c[1], c[2], a);
}

function emit(F: Frame, rx: number, ry: number, r: number, g: number, b: number): void {
  if (rx < 0 || ry < 0 || rx >= F.RW || ry >= F.RH) return;
  const k = ry * F.RW + rx;
  F.V.er[k] += r;
  F.V.eg[k] += g;
  F.V.eb[k] += b;
}

function darken(F: Frame, rx: number, ry: number, f: number): void {
  if (rx < 0 || ry < 0 || rx >= F.RW || ry >= F.RH) return;
  const o = (ry * F.RW + rx) * 4;
  F.out[o] *= f;
  F.out[o + 1] *= f;
  F.out[o + 2] *= f;
}

function addLight(F: Frame, x: number, y: number, r: number, g: number, b: number): void {
  const pw = F.pw;
  if (x < 0 || y < 0 || x >= pw.width || y >= pw.height) return;
  const S = F.S;
  const li = (y >> 1) * S.lw + (x >> 1);
  S.lr[li] += r;
  S.lg[li] += g;
  S.lb[li] += b;
}

function splat(
  F: Frame,
  l: { x: number; y: number; radius: number; color: RGB; intensity: number },
  scale: number,
): void {
  const S = F.S;
  const cx = l.x / 2;
  const cy = l.y / 2;
  const rad = Math.max(1, l.radius / 2);
  const lx0 = Math.max(0, Math.floor(cx - rad));
  const lx1 = Math.min(S.lw - 1, Math.ceil(cx + rad));
  const ly0 = Math.max(0, Math.floor(cy - rad));
  const ly1 = Math.min(S.lh - 1, Math.ceil(cy + rad));
  const cr = (l.color[0] / 255) * l.intensity * scale;
  const cg = (l.color[1] / 255) * l.intensity * scale;
  const cb = (l.color[2] / 255) * l.intensity * scale;
  for (let y = ly0; y <= ly1; y++) {
    for (let x = lx0; x <= lx1; x++) {
      const d = Math.hypot(x - cx, y - cy) / rad;
      if (d >= 1) continue;
      const f = (1 - d) * (1 - d);
      const li = y * S.lw + x;
      S.lr[li] += cr * f;
      S.lg[li] += cg * f;
      S.lb[li] += cb * f;
    }
  }
}

/** Collect light from glowing cells, particles, blasts and the game; blur it; sample it per view cell. */
function buildLight(F: Frame): void {
  const { pw, S, V, t, x0, y0, vw, vh } = F;
  const th = pw.theme;
  const W = pw.width;
  const H = pw.height;
  const { lw, lh, lr, lg, lb } = S;
  lr.fill(0);
  lg.fill(0);
  lb.fill(0);
  const { mat, noise, fluid, frost, fire, charge, prop, propColor } = pw;
  const glow = th.fluidGlow;
  const gs = th.fluidGlowStrength;
  const cx0 = Math.max(0, x0 - LIGHT_PAD);
  const cx1 = Math.min(W, x0 + vw + LIGHT_PAD);
  const cy0 = Math.max(0, y0 - LIGHT_PAD);
  const cy1 = Math.min(H, y0 + vh + LIGHT_PAD);
  const gr = (glow[0] / 255) * gs * 0.11;
  const gg = (glow[1] / 255) * gs * 0.11;
  const gb = (glow[2] / 255) * gs * 0.11;
  for (let y = cy0; y < cy1; y++) {
    const lrow = (y >> 1) * lw;
    for (let x = cx0; x < cx1; x++) {
      const i = y * W + x;
      const li = lrow + (x >> 1);
      const f = fluid[i];
      if (f > 0.003 && frost[i] <= 0.5) {
        const k = f * 20 > 1 ? 1 : f * 20;
        lr[li] += gr * k;
        lg[li] += gg * k;
        lb[li] += gb * k;
      }
      const fi = fire[i];
      if (fi) {
        const a = fi / 90 > 1 ? 1 : fi / 90;
        lr[li] += 0.3 * a;
        lg[li] += 0.16 * a;
        lb[li] += 0.05 * a;
      }
      const ch = charge[i];
      if (ch > 0.05) {
        lr[li] += ch * 0.14;
        lg[li] += ch * 0.13;
        lb[li] += ch * 0.08;
      }
      const p = prop[i];
      if (p === PROP.NONE) continue;
      let c: RGB;
      let l: number;
      if (p === PROP.MUSHROOM || p === PROP.CRYSTAL) {
        if (p === PROP.MUSHROOM && fi > 0) continue;
        c = th.propColors[propColor[i] % th.propColors.length];
        l = (mat[i] === MAT.WALL ? 0.22 : 0.32) * (0.72 + 0.28 * fsin(t * 1.3 + noise[i] * 12));
      } else if (p === PROP.RUNE) {
        c = th.rune;
        l = 0.07 * (0.6 + 0.4 * fsin(t * 1.6 + (x + y) * 0.25));
      } else if (p === PROP.FLOWER && mat[i] === MAT.GRASS && !fi) {
        c = th.flowers[propColor[i] % th.flowers.length];
        l = th.flowerGlow * 0.05;
      } else continue;
      lr[li] += (c[0] / 255) * l;
      lg[li] += (c[1] / 255) * l;
      lb[li] += (c[2] / 255) * l;
    }
  }

  const { pT, pX, pY, pZ, pLife, pMax, pColor } = pw;
  const motes = th.motes;
  for (let k = 0; k < pw.particleCount; k++) {
    const type = pT[k];
    const lf = pLife[k] / pMax[k];
    const x = pX[k] | 0;
    const y = (pY[k] - pZ[k]) | 0;
    if (type === PART.SPARK) addLight(F, x, y, 0.12 * lf, 0.08 * lf, 0.03 * lf);
    else if (type === PART.EMBER) addLight(F, x, y, 0.06 * lf, 0.03 * lf, 0.01 * lf);
    else if (type === PART.MOTE && motes) {
      const blink = 0.5 + 0.5 * fsin(pw.tick * 0.18 + k * 1.7);
      const v = blink * blink * 0.35;
      addLight(F, x, y, (motes[0] / 255) * v, (motes[1] / 255) * v, (motes[2] / 255) * v);
    } else if (type === PART.WISP || type === PART.SOUL) {
      const c = pColor[k];
      const v = lf * 0.15;
      addLight(
        F,
        x,
        y,
        ((c & 255) / 255) * v,
        (((c >> 8) & 255) / 255) * v,
        (((c >> 16) & 255) / 255) * v,
      );
    }
  }
  for (const f of pw.flashes) splat(F, f, f.life * 0.5);
  for (const l of pw.lights) splat(F, l, 0.35);

  for (let pass = 0; pass < 2; pass++) {
    boxBlur(lr, lw, lh, BLUR_RADIUS, S.tmp);
    boxBlur(lg, lw, lh, BLUR_RADIUS, S.tmp);
    boxBlur(lb, lw, lh, BLUR_RADIUS, S.tmp);
  }

  // Sample the light at each view cell's centre.
  const flash = pw.flash;
  const ar = th.ambient[0] + flash * 0.9;
  const ag = th.ambient[1] + flash * 0.9;
  const ab = th.ambient[2] + flash;
  const LF = V.lightF;
  for (let y = y0; y < y0 + vh; y++) {
    const ly = Math.max(0, y / 2 - 0.25);
    const rowA = (ly | 0) * lw;
    const rowB = Math.min(lh - 1, (ly | 0) + 1) * lw;
    const fy = ly - (ly | 0);
    let kc = (y - y0) * vw * 3;
    for (let x = x0; x < x0 + vw; x++, kc += 3) {
      const lx = Math.max(0, x / 2 - 0.25);
      const a = lx | 0;
      const b = a + 1 < lw ? a + 1 : a;
      const fx = lx - a;
      const q00 = (1 - fx) * (1 - fy);
      const q10 = fx * (1 - fy);
      const q01 = (1 - fx) * fy;
      const q11 = fx * fy;
      LF[kc] =
        ar +
        (lr[rowA + a] * q00 + lr[rowA + b] * q10 + lr[rowB + a] * q01 + lr[rowB + b] * q11) *
          LIGHT_GAIN;
      LF[kc + 1] =
        ag +
        (lg[rowA + a] * q00 + lg[rowA + b] * q10 + lg[rowB + a] * q01 + lg[rowB + b] * q11) *
          LIGHT_GAIN;
      LF[kc + 2] =
        ab +
        (lb[rowA + a] * q00 + lb[rowA + b] * q10 + lb[rowB + a] * q01 + lb[rowB + b] * q11) *
          LIGHT_GAIN;
    }
  }
}

/** Cells within one step of any fluid (3×3 neighbourhood), for the view. */
function markWetNear(F: Frame): void {
  const { pw, V, x0, y0, vw, vh } = F;
  const W = pw.width;
  const H = pw.height;
  const fluid = pw.fluid;
  const near = V.wetNear;
  near.fill(0);
  for (let vy = 0; vy < vh; vy++) {
    const base = vy * vw;
    for (let dy = -1; dy <= 1; dy++) {
      const y = y0 + vy + dy;
      if (y < 0 || y >= H) continue;
      const row = y * W;
      for (let vx = 0; vx < vw; vx++) {
        if (near[base + vx]) continue;
        const x = x0 + vx;
        if (
          fluid[row + x] > 0 ||
          (x > 0 && fluid[row + x - 1] > 0) ||
          (x < W - 1 && fluid[row + x + 1] > 0)
        )
          near[base + vx] = 1;
      }
    }
  }
}

/** Ground color, shading, frost, blight, fluid and fire into albedo + emissive. */
function passGround(F: Frame): void {
  const { pw, out, t, S, V, x0, y0, vw, vh, s, RW } = F;
  const th = pw.theme;
  const W = pw.width;
  const H = pw.height;
  const M = pw.margin;
  const { baseR, baseG, baseB, cachedMat, cachedDetail, jitter, crack } = S;
  const { er, eg, eb, wetNear } = V;
  const {
    mat,
    noise,
    terrain,
    fluid,
    flow,
    wet,
    scorch,
    frost,
    charge,
    trample,
    blight,
    fire,
    detail,
  } = pw;
  const glow = th.fluidGlow;
  const gs = th.fluidGlowStrength;
  const lava = pw.isLava;
  const shallow = th.fluidShallow;
  const deep = th.fluidDeep;

  for (let y = y0; y < y0 + vh; y++) {
    const ey = y < M ? M - y : y >= H - M ? y - (H - M - 1) : 0;
    const pyBase = (y - y0) * s;
    for (let x = x0; x < x0 + vw; x++) {
      const i = y * W + x;
      if (mat[i] !== cachedMat[i] || detail[i] !== cachedDetail[i]) fillBase(pw, S, i);
      const m = mat[i];

      // Light from the top-left: slopes facing it brighten.
      const up = x > 0 && y > 0 ? terrain[i - W - 1] : terrain[i];
      let sh = 1 + (terrain[i] - up) * 20;
      sh = sh < 0.5 ? 0.5 : sh > 1.5 ? 1.5 : sh;
      const ex = x < M ? M - x : x >= W - M ? x - (W - M - 1) : 0;
      const edge = ex > ey ? ex : ey;
      if (edge > 0) sh *= edge > 13 ? 0.42 : 1 - edge * 0.045;
      const wt = wet[i];
      if (wt > 0) sh *= 1 - 0.32 * wt;
      const sc = scorch[i];
      if (sc > 0) sh *= 1 - 0.62 * sc;
      if (trample[i] > 0 && (m === MAT.GRASS || m === MAT.BUSH)) sh *= 1 - 0.18 * trample[i];
      let cr = baseR[i] * sh;
      let cg = baseG[i] * sh;
      let cb = baseB[i] * sh;

      const fr = frost[i];
      if (fr > 0 && fluid[i] <= 0.003) {
        const a = (fr > 1 ? 1 : fr) * 0.78;
        cr += (224 - cr) * a;
        cg += (236 - cg) * a;
        cb += (250 - cb) * a;
      }
      const bl = blight[i];
      let blightGlow = 0;
      if (bl > 0.02) {
        const a = bl * 0.65;
        cr += (52 - cr) * a;
        cg += (34 - cg) * a;
        cb += (74 - cb) * a;
        blightGlow = bl * (0.5 + 0.5 * fsin(t * 4 + noise[i] * 30));
      }
      const fi = fire[i];
      let fireA = 0;
      let fireR = 0;
      let fireG = 0;
      let fireB = 0;
      if (fi) {
        fireA = fi >= 90 ? 0.75 : (fi / 90) * 0.75;
        const fl = fi * (0.72 + Math.random() * 0.38);
        if (fl > 232) {
          fireR = 255;
          fireG = 226;
          fireB = 150;
        } else if (fl > 150) {
          fireR = 255;
          fireG = 168;
          fireB = 56;
        } else if (fl > 80) {
          fireR = 238;
          fireG = 94;
          fireB = 30;
        } else {
          fireR = 150;
          fireG = 42;
          fireB = 24;
        }
        const dim = 1 - 0.7 * fireA;
        cr *= dim;
        cg *= dim;
        cb *= dim;
      }
      const ch = charge[i];
      const special = blightGlow > 0 || fireA > 0 || ch > 0.05;
      const wetCell = wetNear[(y - y0) * vw + (x - x0)] === 1 && m !== MAT.WALL;
      const jitterOn = s > 1 && m !== MAT.STONE && m !== MAT.RUBBLE;
      const pxBase = (x - x0) * s;

      for (let sy = 0; sy < s; sy++) {
        const ry = pyBase + sy;
        const rowK = ry * RW;
        for (let sx = 0; sx < s; sx++) {
          const q = sx + sy * MAX_SCALE;
          const rx = pxBase + sx;
          const k = rowK + rx;
          let r = cr;
          let g = cg;
          let b = cb;
          if (jitterOn) {
            const j = jitter[i * SUBS + q];
            r *= j;
            g *= j;
            b *= j;
          }
          if (wetCell) {
            // Fluid depth, bilinear across cells for smooth shorelines.
            let f = fluid[i];
            if (s > 1) {
              const f0 = V.fr0[ry] * W;
              const f1 = V.fr1[ry] * W;
              const c0 = V.fc0[rx];
              const c1 = V.fc1[rx];
              const fx = V.ffx[rx];
              const fy = V.ffy[ry];
              const a0 = fluid[f0 + c0];
              const a1 = fluid[f1 + c0];
              f =
                (a0 + (fluid[f0 + c1] - a0) * fx) * (1 - fy) +
                (a1 + (fluid[f1 + c1] - a1) * fx) * fy;
            }
            if (f > 0.003) {
              if (fr > 0.5) {
                const cracked = (crack[i] >> q) & 1;
                r = cracked ? 232 : 170 + 20 * fr;
                g = cracked ? 246 : 214 + 14 * fr;
                b = cracked ? 255 : 236;
                er[k] += glow[0] * 0.08 * gs;
                eg[k] += glow[1] * 0.08 * gs;
                eb[k] += glow[2] * 0.08 * gs;
              } else {
                const dep = f * 7 > 1 ? 1 : f * 7;
                const a = f * 16 + 0.35 > 0.94 ? 0.94 : f * 16 + 0.35;
                r += (shallow[0] + (deep[0] - shallow[0]) * dep - r) * a;
                g += (shallow[1] + (deep[1] - shallow[1]) * dep - g) * a;
                b += (shallow[2] + (deep[2] - shallow[2]) * dep - b) * a;
                const X = x + sx / s;
                const Y = y + sy / s;
                const cw =
                  fsin(X * 0.55 + t * 1.9 + fsin(Y * 0.31 + t * 0.7) * 2) *
                  fsin(Y * 0.42 - t * 1.3 + fsin(X * 0.23) * 1.5);
                const caustic = cw > 0.45 ? (cw - 0.45) * 1.8 : 0;
                const fl = flow[i] * 140 > 1 ? 1 : flow[i] * 140;
                let em = gs * (0.2 + 0.5 * caustic + 0.35 * fl) * (f * 25 > 1 ? 1 : f * 25);
                if (lava) {
                  em *= 0.9 + 0.25 * fsin(t * 3 + noise[i] * 20);
                  if (f < 0.014 && noise[i] > 0.45) {
                    r *= 0.55;
                    g *= 0.45;
                    b *= 0.45;
                    em *= 0.35;
                  }
                }
                er[k] += glow[0] * em;
                eg[k] += glow[1] * em;
                eb[k] += glow[2] * em;
              }
            }
          }
          if (special) {
            if (blightGlow > 0) {
              er[k] += 60 * blightGlow;
              eg[k] += 20 * blightGlow;
              eb[k] += 110 * blightGlow;
            }
            if (ch > 0.05) {
              const fl = ch * (Math.random() < 0.5 ? 1 : 0.35);
              er[k] += 255 * fl;
              eg[k] += 245 * fl;
              eb[k] += 175 * fl;
            }
            if (fireA > 0) {
              er[k] += fireR * fireA;
              eg[k] += fireG * fireA;
              eb[k] += fireB * fireA;
            }
          }
          const o = k * 4;
          out[o] = r;
          out[o + 1] = g;
          out[o + 2] = b;
          out[o + 3] = 255;
        }
      }
    }
  }
}

/** Grass blades and shrub leaves, bent by the wind. */
function passFoliage(F: Frame): void {
  const { pw, out, t, S, V, x0, y0, vw, vh, s, RW } = F;
  const th = pw.theme;
  const W = pw.width;
  const H = pw.height;
  const { mat, fluid, trample, fire, frost, scorch, wet } = pw;
  const wind = pw.wind;
  const swayAmp = 0.65 + Math.min(1, Math.abs(wind)) * 0.6;
  const { sway, sw: sgw, tint, grassBlade, bushBlade, tallBlade, bladeThr } = S;
  const by1 = Math.min(Math.ceil(H / 4) - 1, (y0 + vh + 3) >> 2);
  for (let by = y0 >> 2; by <= by1; by++) {
    for (let bx = 0; bx < sgw; bx++) {
      const x = bx * 4 + 2;
      const y = by * 4 + 2;
      sway[by * sgw + bx] =
        (fsin(t * 1.7 + x * 0.21 + y * 0.09) +
          0.6 * fsin(t * 0.63 + y * 0.17 + x * 0.05) +
          wind * 0.9) *
        swayAmp;
    }
  }
  const g3 = th.grass[3];
  const gt = th.grassTip;
  const b2 = th.bush[2];
  for (let y = y0; y < y0 + vh; y++) {
    for (let x = x0; x < x0 + vw; x++) {
      const i = y * W + x;
      const m = mat[i];
      if (
        (m !== MAT.GRASS && m !== MAT.BUSH) ||
        fluid[i] > 0.003 ||
        trample[i] >= 0.35 ||
        fire[i] >= 30
      )
        continue;
      const bush = m === MAT.BUSH;
      const blades = bush ? bushBlade[i] : grassBlade[i];
      if (!blades) continue;
      const sv = sway[(y >> 2) * sgw + (x >> 2)];
      const ti = tint[i];
      let tr: number;
      let tg: number;
      let tb: number;
      if (frost[i] > 0.2) {
        tr = 230;
        tg = 242;
        tb = 255;
      } else if (bush) {
        const lift = 1.12 + ti * 0.18;
        tr = b2[0] * lift;
        tg = b2[1] * lift;
        tb = b2[2] * lift;
      } else {
        tr = g3[0] + (gt[0] - g3[0]) * ti;
        tg = g3[1] + (gt[1] - g3[1]) * ti;
        tb = g3[2] + (gt[2] - g3[2]) * ti;
      }
      const burnt = 1 - scorch[i] * 0.6 - wet[i] * 0.15;
      tr *= burnt;
      tg *= burnt;
      tb *= burnt;
      for (let sy = 0; sy < s; sy++) {
        const ry = (y - y0) * s + sy - 1;
        if (ry < 0) continue;
        for (let sx = 0; sx < s; sx++) {
          const q = sx + sy * MAX_SCALE;
          if (!((blades >> q) & 1)) continue;
          const thr = bladeThr[i * SUBS + q];
          const rx = (x - x0) * s + sx + (sv > thr ? 1 : sv < -thr ? -1 : 0);
          if (rx < 0 || rx >= RW) continue;
          const j = V.rowCell[ry] * W + V.colCell[rx];
          if ((mat[j] === MAT.WALL && !bush) || fluid[j] > 0.003) continue;
          const o = (ry * RW + rx) * 4;
          out[o] = tr;
          out[o + 1] = tg;
          out[o + 2] = tb;
          if (bush && ry > 0 && (tallBlade[i] >> q) & 1) put(F, rx, ry - 1, tr, tg, tb, 0.6);
        }
      }
    }
  }
}

/** Flowers, glowing fungi, crystals and runes. */
function passProps(F: Frame): void {
  const { pw, t, x0, y0, vw, vh, s } = F;
  const th = pw.theme;
  const W = pw.width;
  const { prop, propColor, mat, fire, trample, fluid, noise } = pw;
  for (let y = y0; y < y0 + vh; y++) {
    for (let x = x0; x < x0 + vw; x++) {
      const i = y * W + x;
      const p = prop[i];
      if (p === PROP.NONE) continue;
      const px = (x - x0) * s;
      const py = (y - y0) * s;
      const mid = px + (s >> 1);
      if (p === PROP.FLOWER) {
        if (mat[i] !== MAT.GRASS || fire[i] > 0 || trample[i] > 0.5 || fluid[i] > 0.003) continue;
        const c = th.flowers[propColor[i] % th.flowers.length];
        blend(F, mid, py - 1, c, 1);
        blend(F, mid - 1, py - 1, c, 0.25);
        blend(F, mid + 1, py - 1, c, 0.25);
        blend(F, mid, py, POLLEN, 0.35);
        const fg = th.flowerGlow * 0.45;
        emit(F, mid, py - 1, c[0] * fg, c[1] * fg, c[2] * fg);
      } else if (p === PROP.MUSHROOM) {
        if (fire[i] > 0) continue;
        const c = th.propColors[propColor[i] % th.propColors.length];
        const pulse = 0.72 + 0.28 * fsin(t * 1.3 + noise[i] * 12);
        for (let k = 0; k < s; k++) blend(F, mid, py + k, STEM, 1);
        for (let k = -1; k <= s - 1; k++) {
          blend(F, mid + k, py - 1, c, 1);
          emit(F, mid + k, py - 1, c[0] * 0.8 * pulse, c[1] * 0.8 * pulse, c[2] * 0.8 * pulse);
        }
        if (s > 1) {
          blend(F, mid, py - 2, c, 1);
          emit(F, mid, py - 2, c[0] * pulse, c[1] * pulse, c[2] * pulse);
        }
      } else if (p === PROP.CRYSTAL) {
        const c = th.propColors[propColor[i] % th.propColors.length];
        const pulse = 0.75 + 0.25 * fsin(t * 1.1 + noise[i] * 9);
        const tall = (noise[i] > 0.5 ? 2 : 1) * s;
        for (let k = -tall; k <= 0; k++) {
          blend(F, mid, py + k, c, 1);
          emit(F, mid, py + k, c[0] * 0.8 * pulse, c[1] * 0.8 * pulse, c[2] * 0.8 * pulse);
        }
        blend(F, mid, py - tall - 1, WHITE, 0.7);
        for (let k = -tall + 1; k <= 0; k++)
          put(F, mid + 1, py + k, c[0] * 0.45, c[1] * 0.45, c[2] * 0.45, 1);
      } else if (p === PROP.RUNE) {
        const c = th.rune;
        const pulse = 0.35 + 0.3 * fsin(t * 1.6 + (x + y) * 0.25);
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) {
            blend(F, px + dx, py + dy, c, 0.25);
            emit(F, px + dx, py + dy, c[0] * pulse, c[1] * pulse, c[2] * pulse);
          }
        }
      }
    }
  }
}

/** Ripples and particles (rain, snow, smoke, sparks, debris, fireflies…). */
function passParticles(F: Frame): void {
  const { pw, x0, y0, s, RW, RH, V } = F;
  const th = pw.theme;
  const W = pw.width;
  const glow = th.fluidGlow;
  const gs = th.fluidGlowStrength;
  const lava = pw.isLava;
  const ox = (x: number) => Math.floor((x - x0) * s);
  const oy = (y: number) => Math.floor((y - y0) * s);

  for (const rp of pw.ripples) {
    const k = 1 - rp.age / rp.max;
    const rad = (1 + rp.age * 0.3) * s;
    const pts = Math.max(6, Math.round(rad * 5));
    for (let q = 0; q < pts; q++) {
      const a = (q / pts) * Math.PI * 2;
      const rx = ox(rp.x + 0.5) + Math.round(Math.cos(a) * rad);
      const ry = oy(rp.y + 0.5) + Math.round(Math.sin(a) * rad * 0.7);
      if (rx < 0 || ry < 0 || rx >= RW || ry >= RH) continue;
      if (pw.fluid[V.rowCell[ry] * W + V.colCell[rx]] <= 0.003) continue;
      blend(F, rx, ry, RIPPLE, 0.35 * k);
      emit(F, rx, ry, glow[0] * 0.5 * k * gs, glow[1] * 0.5 * k * gs, glow[2] * 0.5 * k * gs);
    }
  }

  const { pT, pX, pY, pZ, pVX, pVY, pVZ, pLife, pMax, pColor } = pw;
  const motes = th.motes;
  for (let k = 0; k < pw.particleCount; k++) {
    const type = pT[k];
    const pz = pZ[k];
    const rx = ox(pX[k]);
    const ry = oy(pY[k] - pz);
    if (rx < -8 || ry < -8 || rx >= RW + 8 || ry >= RH + 8) continue;
    const lf = pLife[k] / pMax[k];
    switch (type) {
      case PART.RAIN: {
        const vx = pVX[k] * s;
        const vy = (pVY[k] - pVZ[k]) * s;
        const len = 1 + s;
        for (let q = 0; q <= len; q++) {
          const a = q === 0 ? 0.6 : 0.45 * (1 - q / (len + 1));
          blend(
            F,
            Math.round(rx - (vx * q) / len),
            Math.round(ry - (vy * q) / len),
            q === 0 ? RAIN_HEAD : RAIN_TAIL,
            a,
          );
        }
        break;
      }
      case PART.SNOW:
        blend(F, rx, ry, SNOW, 0.9);
        if (s > 1 && (k & 1) === 0) blend(F, rx + 1, ry, SNOW, 0.5);
        break;
      case PART.SPLASH:
        blend(F, rx, ry, SPLASH, 0.4 + 0.5 * lf);
        if (gs > 0 && !lava) emit(F, rx, ry, glow[0] * 0.25, glow[1] * 0.25, glow[2] * 0.25);
        break;
      case PART.SPARK: {
        if (pz > 1) darken(F, ox(pX[k]), oy(pY[k]), 0.8);
        const c = pColor[k];
        if (c)
          emit(F, rx, ry, (c & 255) * lf + 60, ((c >> 8) & 255) * lf + 40, ((c >> 16) & 255) * lf);
        else emit(F, rx, ry, 255, 200 + 55 * lf, 120 * lf);
        break;
      }
      case PART.EMBER: {
        if (Math.random() < 0.1) break;
        const v = lf * 0.8;
        emit(F, rx, ry, 255 * v, (120 + 80 * lf) * v, 40 * v);
        break;
      }
      case PART.SMOKE:
      case PART.STEAM:
      case PART.DUST:
      case PART.MIST: {
        const age = 1 - lf;
        let cr: number;
        let cg: number;
        let cb: number;
        let a: number;
        if (type === PART.SMOKE) {
          cr = 60 + 46 * age;
          cg = cr - 4;
          cb = cr + 6;
          a = 0.34 * lf + 0.04;
        } else {
          const c = type === PART.STEAM ? STEAM : type === PART.DUST ? DUST : MIST;
          cr = c[0];
          cg = c[1];
          cb = c[2];
          a =
            type === PART.STEAM
              ? 0.42 * lf
              : type === PART.DUST
                ? 0.3 * lf
                : 0.07 * Math.min(1, lf * 3, (1 - lf) * 6);
        }
        const mist = type === PART.MIST;
        puff(F, rx, ry, s, cr, cg, cb, a);
        if (age > 0.25 || mist) {
          const a2 = a * 0.6;
          puff(F, rx + s, ry, s, cr, cg, cb, a2);
          puff(F, rx - s, ry, s, cr, cg, cb, a2);
          puff(F, rx, ry + s, s, cr, cg, cb, a2);
          puff(F, rx, ry - s, s, cr, cg, cb, a2);
        }
        if (age > 0.6 || mist) {
          const a3 = a * 0.35;
          puff(F, rx + s, ry + s, s, cr, cg, cb, a3);
          puff(F, rx - s, ry - s, s, cr, cg, cb, a3);
          puff(F, rx + s, ry - s, s, cr, cg, cb, a3);
          puff(F, rx - s, ry + s, s, cr, cg, cb, a3);
          if (mist) {
            puff(F, rx + 2 * s, ry, s, cr, cg, cb, a3);
            puff(F, rx - 2 * s, ry, s, cr, cg, cb, a3);
          }
        }
        break;
      }
      case PART.DEBRIS:
      case PART.LEAF: {
        if (pz > 0.5) darken(F, ox(pX[k]), oy(pY[k]), 0.72);
        const c = pColor[k];
        const size = type === PART.DEBRIS && s > 1 && (k & 3) === 0 ? 2 : 1;
        puff(F, rx, ry, size, c & 255, (c >> 8) & 255, (c >> 16) & 255, 1);
        break;
      }
      case PART.MOTE: {
        if (!motes) break;
        const blink = 0.5 + 0.5 * fsin(pw.tick * 0.18 + k * 1.7);
        const v = blink * blink;
        emit(F, rx, ry, motes[0] * v, motes[1] * v, motes[2] * v);
        break;
      }
      case PART.WISP:
      case PART.SOUL: {
        const c = pColor[k];
        const v = lf * (type === PART.SOUL ? 1 : 0.8);
        emit(F, rx, ry, (c & 255) * v, ((c >> 8) & 255) * v, ((c >> 16) & 255) * v);
        break;
      }
      case PART.GLINT:
        if (Math.random() < 0.3) break;
        emit(F, rx, ry, 210 * lf, 236 * lf, 255 * lf);
        break;
      default:
        break;
    }
  }
}

function puff(
  F: Frame,
  rx: number,
  ry: number,
  size: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) put(F, rx + dx, ry + dy, r, g, b, a);
}

/** albedo × (ambient + light) + emissive. */
function composite(F: Frame): void {
  const { out, V, vw, s, RW, RH } = F;
  const { er, eg, eb, lightF: LF } = V;
  for (let ry = 0; ry < RH; ry++) {
    const rowK = ry * RW;
    const cellRow = ((ry / s) | 0) * vw * 3;
    for (let rx = 0; rx < RW; rx++) {
      const kc = cellRow + ((rx / s) | 0) * 3;
      const k = rowK + rx;
      const o = k * 4;
      out[o] = out[o] * LF[kc] + er[k];
      out[o + 1] = out[o + 1] * LF[kc + 1] + eg[k];
      out[o + 2] = out[o + 2] * LF[kc + 2] + eb[k];
    }
  }
}

export function renderPixelWorld(
  pw: PixelWorld,
  out: Uint8ClampedArray,
  t: number,
  view?: RenderView,
): void {
  const W = pw.width;
  const H = pw.height;
  const s = Math.min(MAX_SCALE, Math.max(1, view?.scale ?? 1));
  const vw = Math.min(W, view?.w ?? W);
  const vh = Math.min(H, view?.h ?? H);
  const x0 = Math.max(0, Math.min(W - vw, view?.x0 ?? 0));
  const y0 = Math.max(0, Math.min(H - vh, view?.y0 ?? 0));
  const S = getWorldScratch(pw);
  const V = getViewScratch(pw, vw, vh, s);
  const RW = vw * s;
  const RH = vh * s;
  V.er.fill(0);
  V.eg.fill(0);
  V.eb.fill(0);
  for (let rx = 0; rx < RW; rx++) {
    V.colCell[rx] = x0 + ((rx / s) | 0);
    const fx = Math.max(0, x0 + (rx + 0.5) / s - 0.5);
    V.fc0[rx] = Math.min(W - 1, fx | 0);
    V.fc1[rx] = Math.min(W - 1, V.fc0[rx] + 1);
    V.ffx[rx] = fx - V.fc0[rx];
  }
  for (let ry = 0; ry < RH; ry++) {
    V.rowCell[ry] = y0 + ((ry / s) | 0);
    const fy = Math.max(0, y0 + (ry + 0.5) / s - 0.5);
    V.fr0[ry] = Math.min(H - 1, fy | 0);
    V.fr1[ry] = Math.min(H - 1, V.fr0[ry] + 1);
    V.ffy[ry] = fy - V.fr0[ry];
  }
  const F: Frame = { pw, out, t, S, V, x0, y0, vw, vh, s, RW, RH };
  buildLight(F);
  markWetNear(F);
  passGround(F);
  passFoliage(F);
  passProps(F);
  passParticles(F);
  composite(F);
}
