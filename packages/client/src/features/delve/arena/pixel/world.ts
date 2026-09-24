import type { PixelTheme, RGB } from './themes';

/**
 * A cosmetic pixel simulation of the arena floor: terrain, lush foliage,
 * a glowing river and pools, fire, frost, rubble and weather. Nothing here
 * affects gameplay; engine events are replayed onto it as visual effects.
 *
 * Coordinates are cells (one cell = one screen pixel of the floor texture).
 * The grid includes a `margin` of cliffs around the playable arena.
 */

export const MAT = {
  GRASS: 0,
  SOIL: 1,
  STONE: 2,
  ASH: 3,
  CRATER: 4,
  RUBBLE: 5,
  OBSIDIAN: 6,
  BUSH: 7,
  BANK: 8,
  WALL: 9,
} as const;

export const PROP = { NONE: 0, MUSHROOM: 1, CRYSTAL: 2, FLOWER: 3, RUNE: 4 } as const;

/** Stone detail bits in `detail`. */
export const DETAIL = { MORTAR: 1, MOSS: 2, OVERHANG: 4 } as const;

export const PART = {
  RAIN: 1,
  SNOW: 2,
  SPLASH: 3,
  SPARK: 4,
  EMBER: 5,
  SMOKE: 6,
  STEAM: 7,
  DEBRIS: 8,
  DUST: 9,
  MOTE: 10,
  MIST: 11,
  WISP: 12,
  LEAF: 13,
  GLINT: 14,
  SOUL: 15,
} as const;

export interface PixelLight {
  x: number;
  y: number;
  radius: number;
  color: RGB;
  intensity: number;
}

export interface Flash extends PixelLight {
  life: number;
}

export interface Ripple {
  x: number;
  y: number;
  age: number;
  max: number;
}

export interface PixelWorldOptions {
  width: number;
  height: number;
  /** Cliff border (cells) around the playable area. */
  margin: number;
  seed: number;
  theme: PixelTheme;
  /** Spawn rain, snow, embers or mist. Default true. */
  weather?: boolean;
  /** Runtime randomness (effects, spread). Generation always uses `seed`. */
  random?: () => number;
  /**
   * How readily fire jumps between cells (1 = wildfire). Gameplay uses a low
   * value so blasts leave burning patches instead of torching the arena.
   */
  fireSpread?: number;
  /** Fuel burned per step by a burning cell (higher = shorter fires). */
  burnRate?: number;
}

const MAX_PARTICLES = 7000;
const MAX_RIPPLES = 140;

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x: number, y: number, salt = 0): number {
  let n =
    (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 144665)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number): number {
  return (
    (valueNoise(x, y) * 0.5 + valueNoise(x * 2, y * 2) * 0.25 + valueNoise(x * 4, y * 4) * 0.125) /
    0.875
  );
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class PixelWorld {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly margin: number;
  readonly theme: PixelTheme;
  readonly seed: number;

  /** Ground height; fluid runs from high to low. */
  readonly terrain: Float32Array;
  /** Fluid depth (water, lava or spirit-water, per theme). */
  readonly fluid: Float32Array;
  readonly flow: Float32Array;
  readonly wet: Float32Array;
  readonly scorch: Float32Array;
  /** Ice on fluid, rime on ground (0–1). */
  readonly frost: Float32Array;
  /** Electric charge from storm effects (0–1). */
  readonly charge: Float32Array;
  /** Foliage flattened by footsteps and impacts (0–1). */
  readonly trample: Float32Array;
  /** Shadow blight (0–1). */
  readonly blight: Float32Array;
  readonly mat: Uint8Array;
  readonly fuel: Uint8Array;
  readonly fire: Uint8Array;
  readonly prop: Uint8Array;
  readonly propColor: Uint8Array;
  readonly detail: Uint8Array;
  /** Per-cell palette variation. */
  readonly tone: Uint8Array;
  readonly noise: Float32Array;
  readonly rubble: Uint32Array;
  /** Cells where the river enters; fluid is added here every step. */
  readonly springs: number[] = [];

  readonly pT = new Uint8Array(MAX_PARTICLES);
  readonly pX = new Float32Array(MAX_PARTICLES);
  readonly pY = new Float32Array(MAX_PARTICLES);
  readonly pZ = new Float32Array(MAX_PARTICLES);
  readonly pVX = new Float32Array(MAX_PARTICLES);
  readonly pVY = new Float32Array(MAX_PARTICLES);
  readonly pVZ = new Float32Array(MAX_PARTICLES);
  readonly pLife = new Float32Array(MAX_PARTICLES);
  readonly pMax = new Float32Array(MAX_PARTICLES);
  readonly pColor = new Uint32Array(MAX_PARTICLES);
  particleCount = 0;

  ripples: Ripple[] = [];
  flashes: Flash[] = [];
  /** Per-frame lights from the game (hero, spells, loot); set by the caller. */
  lights: PixelLight[] = [];
  /** Plaza (ruin) centre, for callers that want to aim at it. */
  plaza = { x: 0, y: 0 };

  tick = 0;
  wind = 0.3;
  weather: boolean;
  /** Lightning flash (0–1). */
  flash = 0;

  private readonly dw: Float32Array;
  private readonly rand: () => number;
  private readonly fireSpread: number;
  private readonly burnRate: number;

  constructor(opts: PixelWorldOptions) {
    this.width = opts.width;
    this.height = opts.height;
    this.size = opts.width * opts.height;
    this.margin = opts.margin;
    this.theme = opts.theme;
    this.seed = opts.seed;
    this.weather = opts.weather ?? true;
    this.rand = opts.random ?? Math.random;
    this.fireSpread = opts.fireSpread ?? 1;
    this.burnRate = Math.max(1, Math.round(opts.burnRate ?? 1));
    const n = this.size;
    this.terrain = new Float32Array(n);
    this.fluid = new Float32Array(n);
    this.dw = new Float32Array(n);
    this.flow = new Float32Array(n);
    this.wet = new Float32Array(n);
    this.scorch = new Float32Array(n);
    this.frost = new Float32Array(n);
    this.charge = new Float32Array(n);
    this.trample = new Float32Array(n);
    this.blight = new Float32Array(n);
    this.mat = new Uint8Array(n);
    this.fuel = new Uint8Array(n);
    this.fire = new Uint8Array(n);
    this.prop = new Uint8Array(n);
    this.propColor = new Uint8Array(n);
    this.detail = new Uint8Array(n);
    this.tone = new Uint8Array(n);
    this.noise = new Float32Array(n);
    this.rubble = new Uint32Array(n);
    this.generate();
  }

  get isLava(): boolean {
    return this.theme.fluid === 'lava';
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  // ── Generation ──────────────────────────────────────────────────────────

  private generate(): void {
    const { width: W, height: H, margin: M, theme: th } = this;
    const rng = mulberry32(this.seed);
    const ox = rng() * 1000;
    const oy = rng() * 1000;
    const nz = (x: number, y: number) => fbm(x + ox, y + oy);

    const rw = th.riverWidth;
    const rx0 = M + 20 + rng() * (W - 2 * M - 40);
    const amp1 = 8 + rng() * 10;
    const per1 = 22 + rng() * 14;
    const ph1 = rng() * Math.PI * 2;
    const amp2 = 3 + rng() * 4;
    const per2 = 8 + rng() * 5;
    const ph2 = rng() * Math.PI * 2;
    const riverX = (y: number) =>
      clamp(
        rx0 + amp1 * Math.sin(y / per1 + ph1) + amp2 * Math.sin(y / per2 + ph2),
        M + rw + 4,
        W - M - rw - 4,
      );

    const pools: { x: number; y: number; rx: number; ry: number }[] = [];
    for (let p = 0; p < th.pools; p++) {
      pools.push({
        x: M + 16 + rng() * (W - 2 * M - 32),
        y: M + 18 + rng() * (H - 2 * M - 36),
        rx: 10 + rng() * 8,
        ry: 8 + rng() * 6,
      });
    }
    const poolDist = (x: number, y: number) => {
      let best = Infinity;
      for (const p of pools) best = Math.min(best, Math.hypot((x - p.x) / p.rx, (y - p.y) / p.ry));
      return best;
    };

    let bestScore = -1;
    for (let c = 0; c < 14; c++) {
      const px = M + 20 + rng() * (W - 2 * M - 40);
      const py = M + 24 + rng() * (H - 2 * M - 48);
      const score = Math.min(Math.abs(px - riverX(py)) / 20, poolDist(px, py));
      if (score > bestScore) {
        bestScore = score;
        this.plaza = { x: Math.round(px), y: Math.round(py) };
      }
    }
    const PHW = 17;
    const PHH = 14;
    const plazaX0 = this.plaza.x - PHW;
    const plazaY0 = this.plaza.y - PHH;
    const grassThr = 0.5 + (0.5 - th.grassCover) * 0.36;
    const bushThr = 0.5 + (0.5 - th.bushCover) * 0.36;

    for (let y = 0; y < H; y++) {
      const rxAtY = riverX(y);
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        this.noise[i] = hash2(x, y, this.seed);
        const base = 0.36 * (1 - y / H);
        let hh = base + (nz(x / 15, y / 15) - 0.5) * 0.05;
        const dr = Math.abs(x - rxAtY);
        hh -= 0.06 * Math.max(0, 1 - dr / (rw + 3));
        const pd = poolDist(x, y);
        hh -= 0.1 * Math.max(0, 1 - pd);
        const inside = x >= M && x < W - M && y >= M && y < H - M;
        const riverGap = dr < rw + 2;
        const edge = Math.max(Math.abs(x - this.plaza.x) / PHW, Math.abs(y - this.plaza.y) / PHH);
        const inPlaza = edge < 1 - (nz(x / 5 + 60, y / 5 + 60) - 0.5) * 0.3;

        let m: number;
        if (!inside && !riverGap) {
          m = MAT.WALL;
          hh = 0.6 + nz(x / 8, y / 8) * 0.12;
        } else if (inPlaza && pd > 1.1 && dr > rw + 2) {
          m = MAT.STONE;
          hh = base + 0.018;
          const fx = x - plazaX0;
          const fy = y - plazaY0;
          const row = Math.floor(fy / 6);
          const off = (row % 2) * 4;
          const col = Math.floor((fx + off) / 9);
          if (fy % 6 === 0 || (fx + off) % 9 === 0) this.detail[i] |= DETAIL.MORTAR;
          if (nz(x / 4 + 90, y / 4 + 30) > 0.62) this.detail[i] |= DETAIL.MOSS;
          this.tone[i] = (hash2(col, row, this.seed + 1) * 255) | 0;
        } else if (riverGap || pd < 1.18) {
          m = MAT.BANK;
        } else if (nz(x / 18 + 20, y / 18 + 7) > grassThr) {
          m = nz(x / 9 + 40, y / 9 + 13) > bushThr ? MAT.BUSH : MAT.GRASS;
        } else {
          m = MAT.SOIL;
        }
        if (m === MAT.WALL) {
          this.tone[i] = Math.min(2, (nz(x / 5 + 3, y / 5 + 9) * 3.2) | 0);
          const toEdge = Math.min(x - (M - 1), W - M - x, y - (M - 1), H - M - y);
          if (
            th.grassCover > 0.3 &&
            toEdge > -4 &&
            nz(x / 4 + 11, y / 4 + 5) > 0.5 - toEdge * 0.06
          ) {
            m = MAT.BUSH;
            this.detail[i] |= DETAIL.OVERHANG;
          }
        } else if (m !== MAT.STONE) this.tone[i] = Math.min(3, (nz(x / 3 + 7, y / 3 + 3) * 4) | 0);
        if (m === MAT.BUSH && !(this.detail[i] & DETAIL.OVERHANG)) hh += 0.014;
        this.mat[i] = m;
        this.terrain[i] = hh;
        this.fuel[i] =
          m === MAT.GRASS ? 150 + ((this.noise[i] * 90) | 0) : m === MAT.BUSH ? 255 : 0;

        if (m !== MAT.WALL && !(this.detail[i] & DETAIL.OVERHANG)) {
          let f = 0;
          if (dr < rw) f = 0.018 + 0.012 * (1 - dr / rw);
          if (pd < 0.9) f = Math.max(f, 0.1 * (1 - pd) - 0.012);
          this.fluid[i] = f;
        }
      }
    }

    // River source at the top edge.
    const sx = Math.round(riverX(1));
    for (let dx = -Math.floor(rw / 2); dx <= Math.floor(rw / 2); dx++)
      this.springs.push(W + sx + dx);

    this.placeProps(rng, nz);

    // Let the river settle into its bed before the first frame.
    for (let s = 0; s < 160; s++) {
      this.feedSprings();
      this.flowFluid(this.isLava ? 0.08 : 0.24);
      if (!this.isLava) this.flowFluid(0.24);
      this.drainEdges();
    }
    this.flow.fill(0);
    this.wet.fill(0);

    if (th.motes) {
      for (let k = 0; k < 36; k++) {
        this.spawn(
          PART.MOTE,
          M + rng() * (W - 2 * M),
          M + rng() * (H - 2 * M),
          2 + rng() * 5,
          (rng() - 0.5) * 0.2,
          (rng() - 0.5) * 0.2,
          0,
          1e9,
          0,
        );
      }
    }
  }

  private placeProps(rng: () => number, nz: (x: number, y: number) => number): void {
    const { width: W, height: H, margin: M, theme: th } = this;
    // Rune circle and glyph in the plaza.
    const { x: cx, y: cy } = this.plaza;
    for (let dy = -9; dy <= 9; dy++) {
      for (let dx = -9; dx <= 9; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const i = y * W + x;
        if (!this.inBounds(x, y) || this.mat[i] !== MAT.STONE) continue;
        const d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        const ring = Math.abs(d - 7.5) < 0.7 && Math.sin(a * 8) > -0.55;
        // Inner triangle: distance to each edge of an equilateral triangle of radius 5.
        let tri = false;
        for (let k = 0; k < 3; k++) {
          const a0 = -Math.PI / 2 + (k * Math.PI * 2) / 3;
          const a1 = a0 + (Math.PI * 2) / 3;
          const x0 = Math.cos(a0) * 5;
          const y0 = Math.sin(a0) * 5;
          const x1 = Math.cos(a1) * 5;
          const y1 = Math.sin(a1) * 5;
          const t = clamp(
            ((dx - x0) * (x1 - x0) + (dy - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2),
            0,
            1,
          );
          if (Math.hypot(dx - (x0 + t * (x1 - x0)), dy - (y0 + t * (y1 - y0))) < 0.55) tri = true;
        }
        if (ring || tri || d < 0.8) {
          this.prop[i] = PROP.RUNE;
          this.detail[i] &= ~DETAIL.MOSS;
        }
      }
    }

    const glowKind = th.prop === 'mushroom' ? PROP.MUSHROOM : PROP.CRYSTAL;
    for (let y = M; y < H - M; y++) {
      for (let x = M; x < W - M; x++) {
        const i = y * W + x;
        const m = this.mat[i];
        if (this.prop[i] !== PROP.NONE || this.fluid[i] > 0.003) continue;
        // Flowers gather in meadows.
        if (
          m === MAT.GRASS &&
          nz(x / 9 + 80, y / 9) > 0.63 &&
          hash2(x * 3, y * 7, this.seed) > 0.84
        ) {
          this.prop[i] = PROP.FLOWER;
          this.propColor[i] = (hash2(x, y, this.seed + 5) * th.flowers.length) | 0;
          continue;
        }
        // Glowing fungi / crystals cluster along shores and under shrubs.
        const eligible = m === MAT.BANK || m === MAT.BUSH ? 1 : m === MAT.SOIL ? 0.25 : 0;
        if (eligible > 0 && rng() < th.propDensity * eligible) {
          const color = (rng() * th.propColors.length) | 0;
          const n = 2 + ((rng() * 3) | 0);
          for (let k = 0; k < n; k++) {
            const px = x + Math.round((rng() - 0.5) * 5);
            const py = y + Math.round((rng() - 0.5) * 5);
            const j = py * W + px;
            if (px < M || py < M + 1 || px >= W - M || py >= H - M - 1) continue;
            if (this.fluid[j] > 0.003 || this.mat[j] === MAT.STONE || this.prop[j] !== PROP.NONE)
              continue;
            this.prop[j] = glowKind;
            this.propColor[j] = color;
          }
        }
      }
    }
    // Crystals studding the cliffs along the arena edge.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (this.mat[i] !== MAT.WALL) continue;
        const toEdge = Math.min(x - (M - 1), W - M - x, y - (M - 1), H - M - y);
        if (toEdge > -4 && toEdge <= 0 && hash2(x, y, this.seed + 9) > 0.965) {
          this.prop[i] = PROP.CRYSTAL;
          this.propColor[i] = (hash2(y, x, this.seed) * th.propColors.length) | 0;
        }
      }
    }
  }

  // ── Stepping ────────────────────────────────────────────────────────────

  step(): void {
    this.tick++;
    if (this.weather) this.spawnWeather();
    this.feedSprings();
    this.flowFluid(this.isLava ? 0.08 : 0.24);
    if (!this.isLava) this.flowFluid(0.24);
    this.drainEdges();
    this.stepFields();
    this.stepFire();
    this.stepParticles();
    for (let r = this.ripples.length - 1; r >= 0; r--) {
      if (++this.ripples[r].age >= this.ripples[r].max) this.ripples.splice(r, 1);
    }
    for (let f = this.flashes.length - 1; f >= 0; f--) {
      this.flashes[f].life -= 0.1;
      if (this.flashes[f].life <= 0) this.flashes.splice(f, 1);
    }
    this.flash *= 0.8;
  }

  private feedSprings(): void {
    const rate = this.isLava ? 0.012 : 0.022;
    for (const s of this.springs) this.fluid[s] += rate;
  }

  private drainEdges(): void {
    const start = this.size - this.width * 2;
    for (let i = start; i < this.size; i++) this.fluid[i] = 0;
  }

  private flowFluid(rate: number): void {
    const { width: W, size: N, terrain: h, fluid: w, dw, frost } = this;
    dw.fill(0);
    const surf = (j: number) => (frost[j] > 0.5 && w[j] > 0.003 ? Infinity : h[j] + w[j]);
    for (let i = 0; i < N; i++) {
      const wi = w[i];
      if (wi < 1e-4) continue;
      if (frost[i] > 0.5) continue;
      const x = i % W;
      const s = h[i] + wi;
      let d0 = 0;
      let d1 = 0;
      let d2 = 0;
      let d3 = 0;
      let tot = 0;
      let t: number;
      if (x > 0) {
        t = s - surf(i - 1);
        if (t > 0) {
          d0 = t;
          tot += t;
        }
      }
      if (x < W - 1) {
        t = s - surf(i + 1);
        if (t > 0) {
          d1 = t;
          tot += t;
        }
      }
      if (i >= W) {
        t = s - surf(i - W);
        if (t > 0) {
          d2 = t;
          tot += t;
        }
      }
      if (i < N - W) {
        t = s - surf(i + W);
        if (t > 0) {
          d3 = t;
          tot += t;
        }
      }
      if (tot <= 0) continue;
      const move = Math.min(wi, tot * rate);
      const f = move / tot;
      if (d0) dw[i - 1] += d0 * f;
      if (d1) dw[i + 1] += d1 * f;
      if (d2) dw[i - W] += d2 * f;
      if (d3) dw[i + W] += d3 * f;
      dw[i] -= move;
      if (move > this.flow[i]) this.flow[i] = move;
    }
    for (let i = 0; i < N; i++) {
      const d = dw[i];
      if (d !== 0) {
        const v = w[i] + d;
        w[i] = v > 0 ? v : 0;
      }
    }
  }

  private stepFields(): void {
    const {
      size: N,
      fluid,
      wet,
      flow,
      scorch,
      blight,
      charge,
      frost,
      trample,
      mat,
      fire,
      fuel,
    } = this;
    const lava = this.isLava;
    const snowing = this.weather && this.theme.weather === 'snow';
    for (let i = 0; i < N; i++) {
      let f = fluid[i];
      if (f > 0) {
        f -= f < 0.008 ? 0.00006 : 0.000012;
        fluid[i] = f > 0 ? f : 0;
        if (f > 0.004) {
          if (lava) {
            if (this.rand() < 0.004) this.igniteNear(i);
          } else if (wet[i] < 1) wet[i] = Math.min(1, wet[i] + 0.06);
        }
      }
      if (wet[i] > 0) wet[i] *= 0.9965;
      if (flow[i] > 0) flow[i] *= 0.9;
      if (scorch[i] > 0) scorch[i] *= 0.9996;
      if (blight[i] > 0) blight[i] *= 0.994;
      if (charge[i] > 0) charge[i] = charge[i] < 0.02 ? 0 : charge[i] * 0.86;
      if (frost[i] > 0) {
        const melt = fluid[i] > 0.003 ? 0.0012 : snowing ? 0.0003 : 0.003;
        frost[i] = frost[i] > melt ? frost[i] - melt : 0;
      }
      if (trample[i] > 0) trample[i] = trample[i] < 0.01 ? 0 : trample[i] * 0.985;
    }
    // Burned ground slowly grows back.
    for (let r = 0; r < 40; r++) {
      const i = (this.rand() * N) | 0;
      if (mat[i] === MAT.ASH && !fire[i] && fluid[i] === 0 && this.rand() < 0.03) {
        mat[i] = MAT.GRASS;
        fuel[i] = 150 + ((this.noise[i] * 90) | 0);
      }
    }
  }

  private igniteNear(i: number): void {
    const W = this.width;
    const x = (i % W) + Math.round((this.rand() - 0.5) * 4);
    const y = ((i / W) | 0) + Math.round((this.rand() - 0.5) * 4);
    if (!this.inBounds(x, y)) return;
    const j = y * W + x;
    if (this.fuel[j] > 0 && !this.fire[j] && this.fluid[j] < 0.004) this.fire[j] = 60;
  }

  private stepFire(): void {
    const { width: W, height: H, size: N, fire, fuel, fluid, mat, frost } = this;
    const wind = this.wind;
    for (let i = 0; i < N; i++) {
      const f = fire[i];
      if (!f) continue;
      const x = i % W;
      const y = (i / W) | 0;
      if ((fluid[i] > 0.006 && !this.isLava) || frost[i] > 0.4) {
        fire[i] = 0;
        if (this.rand() < 0.4) this.spawnSteam(x, y);
        continue;
      }
      if (fuel[i] > 0) {
        fuel[i] = fuel[i] > this.burnRate ? fuel[i] - this.burnRate : 0;
        fire[i] = f < 200 ? f + 6 : 200 + ((this.rand() * 40) | 0);
        if (!fuel[i]) {
          mat[i] = MAT.ASH;
          if (this.prop[i] === PROP.FLOWER || this.prop[i] === PROP.MUSHROOM)
            this.prop[i] = PROP.NONE;
        }
        if (this.rand() < 0.09 * this.fireSpread) {
          const nx = x + Math.round(this.rand() * 2 - 1 + wind * 0.9 * this.rand());
          const ny = y + Math.round(this.rand() * 2 - 1);
          if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
            const n = ny * W + nx;
            if (fuel[n] > 0 && !fire[n] && fluid[n] < 0.004 && frost[n] < 0.3) fire[n] = 40;
          }
        }
        if (mat[i] === MAT.BUSH && this.rand() < 0.01) this.spawnLeaf(x, y, true);
      } else {
        fire[i] = f > 5 ? f - 5 : 0;
      }
      if (this.rand() < 0.02) this.spawnSmoke(x, y);
      if (this.rand() < 0.006) this.spawnEmber(x, y, 1);
    }
  }

  // ── Particles ───────────────────────────────────────────────────────────

  spawn(
    t: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    color: number,
  ): void {
    if (this.particleCount >= MAX_PARTICLES) return;
    const k = this.particleCount++;
    this.pT[k] = t;
    this.pX[k] = x;
    this.pY[k] = y;
    this.pZ[k] = z;
    this.pVX[k] = vx;
    this.pVY[k] = vy;
    this.pVZ[k] = vz;
    this.pLife[k] = life;
    this.pMax[k] = life;
    this.pColor[k] = color;
  }

  private kill(k: number): void {
    const j = --this.particleCount;
    if (k === j) return;
    this.pT[k] = this.pT[j];
    this.pX[k] = this.pX[j];
    this.pY[k] = this.pY[j];
    this.pZ[k] = this.pZ[j];
    this.pVX[k] = this.pVX[j];
    this.pVY[k] = this.pVY[j];
    this.pVZ[k] = this.pVZ[j];
    this.pLife[k] = this.pLife[j];
    this.pMax[k] = this.pMax[j];
    this.pColor[k] = this.pColor[j];
  }

  private spawnSmoke(x: number, y: number): void {
    const r = this.rand;
    this.spawn(
      PART.SMOKE,
      x + r() - 0.5,
      y,
      1 + r() * 2,
      this.wind * 0.12 + (r() - 0.5) * 0.06,
      (r() - 0.5) * 0.04,
      0.12 + r() * 0.08,
      90 + r() * 70,
      0,
    );
  }

  private spawnSteam(x: number, y: number): void {
    const r = this.rand;
    this.spawn(
      PART.STEAM,
      x + r() - 0.5,
      y,
      0.5,
      this.wind * 0.1 + (r() - 0.5) * 0.08,
      0,
      0.25 + r() * 0.15,
      30 + r() * 25,
      0,
    );
  }

  private spawnEmber(x: number, y: number, z: number): void {
    const r = this.rand;
    this.spawn(
      PART.EMBER,
      x,
      y,
      z,
      (r() - 0.5) * 0.35 + this.wind * 0.15,
      (r() - 0.5) * 0.3,
      0.3 + r() * 0.5,
      25 + r() * 30,
      0,
    );
  }

  private spawnLeaf(x: number, y: number, burning = false): void {
    const r = this.rand;
    const c = burning ? this.theme.grass[3] : this.theme.bush[(r() * this.theme.bush.length) | 0];
    this.spawn(
      PART.LEAF,
      x,
      y,
      1 + r() * 2,
      (r() - 0.5) * 0.6 + this.wind * 0.2,
      (r() - 0.5) * 0.5,
      0.6 + r() * 0.8,
      120,
      packRGB(c),
    );
  }

  private spawnWeather(): void {
    const { width: W, height: H, margin: M, rand: r } = this;
    switch (this.theme.weather) {
      case 'rain':
      case 'storm': {
        const n = this.theme.weather === 'storm' ? 24 : 18;
        for (let k = 0; k < n; k++) {
          this.spawn(
            PART.RAIN,
            r() * (W + 40) - 20 - this.wind * 30,
            r() * H,
            30 + r() * 30,
            this.wind * 1.2,
            0.25,
            -(2.2 + r() * 0.6),
            200,
            0,
          );
        }
        if (this.theme.weather === 'storm' && r() < 0.004) {
          this.flash = 1;
          const i = (r() * this.size) | 0;
          if (this.fluid[i] > 0.01) this.conduct(i, 500);
        }
        break;
      }
      case 'snow':
        for (let k = 0; k < 9; k++) {
          this.spawn(
            PART.SNOW,
            r() * (W + 30) - 15 - this.wind * 20,
            r() * H,
            25 + r() * 35,
            this.wind * 0.35,
            0.05,
            -(0.35 + r() * 0.2),
            400,
            0,
          );
        }
        break;
      case 'embers':
        for (let k = 0; k < (r() < 0.6 ? 1 : 0); k++) {
          const x = M + r() * (W - 2 * M);
          const y = M + r() * (H - 2 * M);
          this.spawn(
            PART.EMBER,
            x,
            y,
            0.5,
            this.wind * 0.3 + (r() - 0.5) * 0.3,
            (r() - 0.5) * 0.2,
            0.25 + r() * 0.35,
            60 + r() * 60,
            0,
          );
        }
        break;
      case 'mist':
        if (this.tick % 2 === 0) {
          let mist = 0;
          for (let k = 0; k < this.particleCount; k++) if (this.pT[k] === PART.MIST) mist++;
          if (mist < 160) {
            this.spawn(
              PART.MIST,
              r() * W,
              r() * H,
              1 + r() * 3,
              this.wind * 0.12 + (r() - 0.5) * 0.05,
              (r() - 0.5) * 0.03,
              0,
              240 + r() * 240,
              0,
            );
          }
        }
        break;
      default:
        break;
    }
  }

  private stepParticles(): void {
    const { width: W, height: H, margin: M, rand: r } = this;
    const { pT, pX, pY, pZ, pVX, pVY, pVZ, pLife } = this;
    for (let k = this.particleCount - 1; k >= 0; k--) {
      const t = pT[k];
      pLife[k] -= 1;
      if (pLife[k] <= 0) {
        this.kill(k);
        continue;
      }
      if (t === PART.MOTE) {
        pVX[k] = clamp(pVX[k] + (r() - 0.5) * 0.03, -0.18, 0.18);
        pVY[k] = clamp(pVY[k] + (r() - 0.5) * 0.03, -0.18, 0.18);
        pX[k] += pVX[k];
        pY[k] += pVY[k];
        pZ[k] = 3.5 + Math.sin((this.tick + k * 37) * 0.05) * 2;
        if (pX[k] < M || pX[k] > W - M) pVX[k] = -pVX[k];
        if (pY[k] < M || pY[k] > H - M) pVY[k] = -pVY[k];
        continue;
      }
      if (
        t === PART.SMOKE ||
        t === PART.STEAM ||
        t === PART.DUST ||
        t === PART.EMBER ||
        t === PART.MIST ||
        t === PART.WISP ||
        t === PART.SOUL ||
        t === PART.GLINT
      ) {
        pVX[k] +=
          (this.wind * (t === PART.EMBER ? 0.15 : 0.1) - pVX[k]) * (t === PART.MIST ? 0.005 : 0.02);
        pX[k] += pVX[k];
        pY[k] += pVY[k];
        pZ[k] += pVZ[k];
        pVZ[k] *= t === PART.DUST ? 0.97 : 0.995;
        if (pX[k] < -4 || pX[k] > W + 4 || pY[k] - pZ[k] < -6) this.kill(k);
        continue;
      }
      if (t === PART.SNOW) pVX[k] = this.wind * 0.35 + Math.sin((this.tick + k) * 0.08) * 0.15;
      pX[k] += pVX[k];
      pY[k] += pVY[k];
      pZ[k] += pVZ[k];
      if (t === PART.LEAF) {
        pVZ[k] = Math.max(-0.25, pVZ[k] - 0.03);
        pVX[k] += Math.sin((this.tick + k) * 0.3) * 0.02;
      } else if (t !== PART.RAIN && t !== PART.SNOW) pVZ[k] -= t === PART.DEBRIS ? 0.12 : 0.09;
      if (pZ[k] > 0) continue;
      const x = pX[k] | 0;
      const y = pY[k] | 0;
      if (x < 0 || x >= W || y < 0 || y >= H) {
        this.kill(k);
        continue;
      }
      const i = y * W + x;
      switch (t) {
        case PART.RAIN:
          this.rainLands(i, x, y, pX[k], pY[k]);
          this.kill(k);
          break;
        case PART.SNOW:
          if (this.fluid[i] > 0.004) {
            if (this.isLava) this.spawnSteam(x, y);
          } else if (this.mat[i] !== MAT.WALL) this.frost[i] = Math.min(1, this.frost[i] + 0.25);
          this.kill(k);
          break;
        case PART.SPLASH:
          if (!this.isLava && this.mat[i] !== MAT.WALL) this.fluid[i] += 0.0006;
          this.kill(k);
          break;
        case PART.SPARK:
          if (this.fuel[i] > 0 && !this.fire[i] && r() < 0.3) this.fire[i] = 60;
          this.kill(k);
          break;
        case PART.DEBRIS:
          if (this.fluid[i] > 0.012) {
            this.spawn(PART.SPLASH, pX[k], pY[k], 0.1, 0, 0, 0.5, 16, 0);
            this.addRipple(x, y);
            this.kill(k);
          } else if (pVZ[k] < -0.6) {
            pZ[k] = 0;
            pVZ[k] = -pVZ[k] * 0.32;
            pVX[k] *= 0.55;
            pVY[k] *= 0.55;
          } else {
            if (this.mat[i] !== MAT.WALL) {
              this.mat[i] = MAT.RUBBLE;
              this.rubble[i] = this.pColor[k];
              this.fuel[i] = 0;
              this.fire[i] = 0;
              if (this.prop[i] !== PROP.RUNE) this.prop[i] = PROP.NONE;
            }
            this.kill(k);
          }
          break;
        default:
          this.kill(k);
      }
    }
  }

  private rainLands(i: number, x: number, y: number, fx: number, fy: number): void {
    const r = this.rand;
    if (this.mat[i] === MAT.WALL) return;
    if (this.fluid[i] > 0.004) {
      if (this.isLava) {
        if (r() < 0.3) this.spawnSteam(x, y);
        return;
      }
      if (r() < 0.35) this.addRipple(x, y);
    } else {
      this.wet[i] = Math.min(1, this.wet[i] + 0.3);
    }
    if (!this.isLava) this.fluid[i] += 0.0022;
    if (this.fire[i] && r() < 0.35) {
      this.fire[i] = this.fire[i] > 120 ? this.fire[i] - 120 : 0;
      this.spawnSteam(x, y);
    }
    if (r() < 0.25) {
      for (let s = 0; s < 2; s++)
        this.spawn(
          PART.SPLASH,
          fx,
          fy,
          0.1,
          (r() - 0.5) * 0.5,
          (r() - 0.5) * 0.4,
          0.3 + r() * 0.3,
          20,
          0,
        );
    }
  }

  addRipple(x: number, y: number): void {
    if (this.ripples.length >= MAX_RIPPLES) return;
    this.ripples.push({ x, y, age: 0, max: 12 + ((this.rand() * 8) | 0) });
  }

  // ── Effects (cell coordinates) ──────────────────────────────────────────

  private forDisc(
    cx: number,
    cy: number,
    r: number,
    fn: (i: number, k: number, x: number, y: number) => void,
  ): void {
    const R = Math.ceil(r);
    cx = Math.round(cx);
    cy = Math.round(cy);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!this.inBounds(x, y)) continue;
        fn(y * this.width + x, 1 - d / Math.max(1, r), x, y);
      }
    }
  }

  private burst(
    t: number,
    cx: number,
    cy: number,
    n: number,
    speed: number,
    lift: number,
    life: number,
    color = 0,
  ): void {
    const r = this.rand;
    for (let s = 0; s < n; s++) {
      const a = r() * Math.PI * 2;
      const sp = speed * (0.3 + r());
      this.spawn(
        t,
        cx,
        cy,
        1,
        Math.cos(a) * sp,
        Math.sin(a) * sp * 0.8,
        lift * (0.4 + r()),
        life * (0.7 + r() * 0.6),
        color,
      );
    }
  }

  fireBlast(cx: number, cy: number, r: number): void {
    this.forDisc(cx, cy, r, (i, k, x, y) => {
      if (this.frost[i] > 0) {
        if (this.frost[i] > 0.3 && this.rand() < 0.3) this.spawnSteam(x, y);
        this.frost[i] = 0;
      }
      if (this.fluid[i] > 0.003) {
        if (!this.isLava) {
          const e = Math.min(this.fluid[i], 0.06 * k);
          this.fluid[i] -= e;
          if (e > 0.01 && this.rand() < 0.5) this.spawnSteam(x, y);
        }
        return;
      }
      if (this.mat[i] === MAT.WALL) return;
      if (this.fuel[i] > 0) {
        // Calm floors (low spread) catch in scattered tongues, not a solid sheet.
        if (this.fireSpread >= 1 || this.rand() < 0.3 + 0.5 * k)
          this.fire[i] = Math.max(this.fire[i], 150 + ((this.rand() * 50) | 0));
      } else this.fire[i] = Math.max(this.fire[i], (55 * k) | 0);
      this.scorch[i] = Math.max(this.scorch[i], k * 0.9);
      if (this.mat[i] === MAT.BUSH && this.rand() < 0.05) this.spawnLeaf(x, y, true);
    });
    this.burst(PART.SPARK, cx, cy, 20 + r * 4, 1, 1.8, 50);
    for (let s = 0; s < 6 + r; s++)
      this.spawnSmoke(cx + (this.rand() - 0.5) * r * 1.4, cy + (this.rand() - 0.5) * r);
    this.flashes.push({
      x: cx,
      y: cy,
      radius: r * 2.4 + 6,
      color: [255, 150, 60],
      intensity: 1.4,
      life: 1,
    });
  }

  frostBlast(cx: number, cy: number, r: number): void {
    this.forDisc(cx, cy, r, (i, k, x, y) => {
      if (this.mat[i] === MAT.WALL) return;
      this.fire[i] = 0;
      if (this.fluid[i] > 0.003) {
        if (this.isLava) {
          this.fluid[i] = 0;
          this.mat[i] = MAT.OBSIDIAN;
          this.fuel[i] = 0;
          if (this.rand() < 0.3) this.spawnSteam(x, y);
        } else this.frost[i] = 1;
        return;
      }
      this.frost[i] = Math.max(this.frost[i], 0.1 + 0.9 * k);
    });
    this.burst(PART.GLINT, cx, cy, 14 + r * 2, 0.7, 0.3, 40);
    this.burst(PART.SNOW, cx, cy, 10 + r, 0.8, 1.2, 60);
    this.flashes.push({
      x: cx,
      y: cy,
      radius: r * 2 + 6,
      color: [150, 220, 255],
      intensity: 1.1,
      life: 1,
    });
  }

  stormBlast(cx: number, cy: number, r: number): void {
    let wetCell = -1;
    this.forDisc(cx, cy, r, (i, k) => {
      if (this.mat[i] === MAT.WALL) return;
      this.charge[i] = Math.max(this.charge[i], 0.6 + 0.4 * k);
      if (this.fluid[i] > 0.01) wetCell = i;
      else if (this.fuel[i] > 0 && this.rand() < 0.04) this.fire[i] = 60;
    });
    if (wetCell >= 0) this.conduct(wetCell, 900);
    this.burst(PART.SPARK, cx, cy, 16 + r * 3, 1.4, 1.2, 30, packRGB([255, 244, 150]));
    this.flashes.push({
      x: cx,
      y: cy,
      radius: r * 2.6 + 8,
      color: [220, 235, 255],
      intensity: 1.6,
      life: 1,
    });
  }

  /** Lightning spreads through connected fluid. */
  conduct(start: number, limit: number): void {
    const W = this.width;
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length > 0 && seen.size < limit) {
      const i = queue.shift()!;
      this.charge[i] = Math.max(this.charge[i], 0.9);
      const x = i % W;
      const nbs = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
      for (const j of nbs) {
        if (j < 0 || j >= this.size || seen.has(j) || this.fluid[j] <= 0.006) continue;
        seen.add(j);
        queue.push(j);
      }
    }
  }

  earthImpact(cx: number, cy: number, r: number): void {
    const R = r;
    const RR = r * 1.5;
    const ring: number[] = [];
    let displaced = 0;
    const onStone =
      this.inBounds(cx, cy) && this.mat[Math.round(cy) * this.width + Math.round(cx)] === MAT.STONE;
    this.forDisc(cx, cy, RR, (i, _k, x, y) => {
      if (this.mat[i] === MAT.WALL) return;
      const d = Math.hypot(x - cx, y - cy);
      this.trample[i] = 1;
      if (d <= R) {
        const k = 1 - (d / R) * (d / R);
        this.terrain[i] -= 0.04 * k;
        if (this.mat[i] === MAT.STONE && d > R * 0.72) {
          if (this.rand() < 0.4) this.detail[i] |= DETAIL.MORTAR;
        } else {
          this.mat[i] = MAT.CRATER;
          this.detail[i] = 0;
          if (this.prop[i] !== PROP.RUNE) this.prop[i] = PROP.NONE;
        }
        this.fuel[i] = 0;
        this.fire[i] = 0;
        displaced += this.fluid[i];
        this.fluid[i] = 0;
        this.frost[i] = 0;
      } else {
        this.terrain[i] += 0.012 * (1 - (d - R) / (RR - R));
        ring.push(i);
      }
    });
    if (displaced > 0 && ring.length) {
      const share = displaced / ring.length;
      for (const i of ring) this.fluid[i] += share;
      this.burst(PART.SPLASH, cx, cy, Math.min(50, displaced * 300), 1, 1.4, 40);
    }
    const palette = onStone
      ? [
          [118, 110, 124],
          [96, 90, 104],
          [140, 132, 146],
          [80, 74, 88],
        ]
      : [this.theme.soil[0], this.theme.soil[1], this.theme.soil[2], this.theme.bank[0]];
    const r0 = this.rand;
    for (let s = 0; s < 10 + r * 10; s++) {
      const a = r0() * Math.PI * 2;
      const sp = 0.35 + r0() * 1.25;
      const c = palette[(r0() * palette.length) | 0] as RGB;
      this.spawn(
        PART.DEBRIS,
        cx + Math.cos(a) * 2,
        cy + Math.sin(a) * 2,
        0.5,
        Math.cos(a) * sp,
        Math.sin(a) * sp * 0.8,
        1.2 + r0() * 2.4,
        600,
        packRGB(c),
      );
    }
    this.burst(PART.DUST, cx, cy, 6 + r * 3, 0.3, 0.08, 90);
    for (let s = 0; s < 4; s++)
      this.spawnLeaf(cx + (r0() - 0.5) * r * 2, cy + (r0() - 0.5) * r * 2);
    this.flashes.push({
      x: cx,
      y: cy,
      radius: r * 1.6 + 4,
      color: [255, 225, 170],
      intensity: 0.7,
      life: 0.6,
    });
  }

  shadowBlast(cx: number, cy: number, r: number): void {
    this.forDisc(cx, cy, r, (i, k) => {
      if (this.mat[i] === MAT.WALL) return;
      this.blight[i] = Math.max(this.blight[i], 0.3 + 0.7 * k);
    });
    this.burst(PART.WISP, cx, cy, 12 + r * 2, 0.35, 0.3, 60, packRGB([196, 140, 255]));
    this.flashes.push({
      x: cx,
      y: cy,
      radius: r * 2 + 6,
      color: [170, 110, 255],
      intensity: 1.1,
      life: 1,
    });
  }

  /** Molten ground under a magma zone. */
  lavaBurst(cx: number, cy: number, r: number): void {
    this.forDisc(cx, cy, r, (i, k) => {
      if (this.mat[i] === MAT.WALL || this.fluid[i] > 0.006) return;
      if (this.rand() < 0.5)
        this.fire[i] = Math.max(this.fire[i], (90 + 130 * k * this.rand()) | 0);
      this.scorch[i] = Math.max(this.scorch[i], 0.7 * k);
      this.frost[i] = 0;
    });
    if (this.rand() < 0.6)
      this.spawnEmber(cx + (this.rand() - 0.5) * r * 2, cy + (this.rand() - 0.5) * r * 2, 1);
  }

  splash(cx: number, cy: number, r: number, amount: number): void {
    this.forDisc(cx, cy, r, (i, k, x, y) => {
      if (this.mat[i] === MAT.WALL) return;
      if (this.fire[i]) {
        this.fire[i] = 0;
        this.spawnSteam(x, y);
      }
      if (this.isLava) {
        if (this.fluid[i] > 0.003) {
          this.fluid[i] = 0;
          this.mat[i] = MAT.OBSIDIAN;
          if (this.rand() < 0.4) this.spawnSteam(x, y);
        }
        this.wet[i] = 1;
        return;
      }
      this.fluid[i] += amount * (0.4 + 0.6 * k);
    });
    this.burst(PART.SPLASH, cx, cy, 30, 0.8, 1.2, 50);
  }

  soulBurst(cx: number, cy: number, big: boolean): void {
    const c = this.theme.motes ?? this.theme.fluidGlow;
    this.burst(PART.SOUL, cx, cy, big ? 40 : 8, big ? 0.5 : 0.25, 0.35, big ? 80 : 45, packRGB(c));
    if (big) this.flashes.push({ x: cx, y: cy, radius: 30, color: c, intensity: 1.5, life: 1 });
  }

  /** Entities brushing through foliage. */
  disturb(cx: number, cy: number, r: number): void {
    this.forDisc(cx, cy, r, (i, k) => {
      const v = 0.5 + 0.5 * k;
      if (this.trample[i] < v) this.trample[i] = v;
    });
  }

  /** Entities wading through fluid leave ripples and droplets. */
  wade(cx: number, cy: number): void {
    const x = Math.round(cx);
    const y = Math.round(cy);
    if (!this.inBounds(x, y) || this.fluid[y * this.width + x] < 0.01) return;
    if (this.rand() < 0.5) this.addRipple(x + Math.round((this.rand() - 0.5) * 3), y);
    if (!this.isLava && this.rand() < 0.4)
      this.spawn(
        PART.SPLASH,
        cx,
        cy,
        0.2,
        (this.rand() - 0.5) * 0.4,
        (this.rand() - 0.5) * 0.3,
        0.4,
        16,
        0,
      );
  }

  /** A rolling boulder flattens foliage and grinds a rut. */
  furrow(cx: number, cy: number, r: number): void {
    this.forDisc(cx, cy, r, (i, k) => {
      if (this.mat[i] === MAT.WALL) return;
      this.trample[i] = 1;
      if (this.terrain[i] > -0.2) this.terrain[i] -= 0.0015 * k;
      if (this.mat[i] === MAT.GRASS && k > 0.6 && this.rand() < 0.1) this.mat[i] = MAT.SOIL;
    });
    if (this.rand() < 0.5) this.burst(PART.DUST, cx, cy, 1, 0.2, 0.06, 50);
  }

  /** Chain lightning drawn across the floor. */
  stormArc(points: readonly { x: number; y: number }[]): void {
    for (let p = 0; p < points.length - 1; p++) {
      const a = points[p];
      const b = points[p + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(a.x + ((b.x - a.x) * s) / steps);
        const y = Math.round(a.y + ((b.y - a.y) * s) / steps);
        if (!this.inBounds(x, y)) continue;
        const i = y * this.width + x;
        this.charge[i] = 1;
        if (this.fluid[i] > 0.01) this.conduct(i, 300);
        if (this.rand() < 0.4)
          this.spawn(
            PART.SPARK,
            x,
            y,
            1,
            (this.rand() - 0.5) * 0.8,
            (this.rand() - 0.5) * 0.8,
            0.8,
            16,
            packRGB([255, 244, 150]),
          );
      }
    }
  }

  /** Small elemental touch where a hit lands. */
  hitSpark(cx: number, cy: number, element: string | null): void {
    const x = Math.round(cx);
    const y = Math.round(cy);
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    switch (element) {
      case 'fire':
        this.burst(PART.SPARK, cx, cy, 3, 0.8, 1, 30);
        if (this.fuel[i] > 0 && this.rand() < 0.08) this.fire[i] = 60;
        break;
      case 'frost':
        this.burst(PART.GLINT, cx, cy, 3, 0.5, 0.2, 30);
        if (this.fluid[i] < 0.003) this.frost[i] = Math.max(this.frost[i], 0.6);
        break;
      case 'storm':
        this.burst(PART.SPARK, cx, cy, 2, 1, 0.8, 20, packRGB([255, 244, 150]));
        this.charge[i] = 1;
        break;
      case 'shadow':
        this.burst(PART.WISP, cx, cy, 2, 0.2, 0.2, 40, packRGB([196, 140, 255]));
        break;
      default:
        this.burst(PART.DUST, cx, cy, 2, 0.25, 0.06, 40);
    }
  }
}

export function packRGB(c: RGB): number {
  return c[0] | (c[1] << 8) | (c[2] << 16);
}
