import type { Rect, RoomKind, Vec } from '@alloy/engine';
import type { PixelTheme, RGB } from './themes';

/**
 * A cosmetic pixel simulation of the arena floor: terrain, lush foliage,
 * a glowing river and pools, fire, frost, rubble and weather. Nothing here
 * affects gameplay; engine events are replayed onto it as visual effects.
 * A generated floor is painted from its map's cells: only they make ruins,
 * foliage, water and slow ground (see the room objects spec), and the
 * effects mark those cells but never change what they are.
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
  /** Cover and crumbling cover: a low ruin (its look: `lookAt`). */
  RUIN: 10,
  /** Slow ground but shallow water: mud, a snowdrift, oil… (its look: `lookAt`). */
  SLOW: 11,
} as const;

/**
 * The engine's cell codes and `LOOK_IDS`, mirrored because the floor's worker
 * never loads the engine (`pixel-terrain.test.ts` holds them equal): a map
 * cell's `look` is its index in `FLOOR_LOOKS`.
 */
export const FLOOR_CELL = { wall: 1, cover: 3, crumbling: 4, foliage: 5, slow: 6 } as const;
export const FLOOR_LOOKS = [
  'plain',
  'ruin',
  'timber',
  'minecart',
  'ice_pillar',
  'machinery',
  'boulder',
  'tomb',
  'statue',
  'spire',
  'cracked_wall',
  'vines',
  'undergrowth',
  'coal_rubble',
  'snowdrift',
  'oil',
  'shallow_water',
  'mud',
  'ash',
  'rubble',
] as const;
export const LOOK = Object.fromEntries(FLOOR_LOOKS.map((id, k) => [id, k])) as Record<
  (typeof FLOOR_LOOKS)[number],
  number
>;
/** Shallow water's depth: a spring in each of its cells holds it there. */
const SHALLOW = 0.05;

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
  /** A generated floor's map: the floor is built from it (without one, today's open arena). */
  plan?: MapPlan;
}

/**
 * A floor map as the pixel floor builds it (plain data: it crosses to the
 * worker). Map cell (mx, my) covers floor cells from (margin + mx × ppu,
 * margin + my × ppu), `ppu` on a side.
 */
export interface MapPlan {
  /** Map size in map cells (units). */
  width: number;
  height: number;
  /** The map's cells, row by row: the engine's `Cell` codes (`solidCell` reads them). */
  cells: Uint8Array;
  /** Each map cell's look (`FLOOR_LOOKS` index), row by row. */
  look: Uint8Array;
  /** Each crumbling structure's cells, by its id (`setCracks` follows their wear). */
  structures: Vec[][];
  rooms: { kind: RoomKind; rect: Rect }[];
  /** Floor cells per map cell. */
  ppu: number;
}

/**
 * Whether a map cell's code is solid (a wall, cover or crumbling cover): the
 * engine's `solidCode`, mirrored here because the floor's worker never loads
 * the engine (`room-contract.test.ts` holds the two together).
 */
export function solidCell(code: number): boolean {
  return code === 1 || code === 3 || code === 4;
}

/** Simulation chunks are CHUNK × CHUNK cells; an asleep chunk's fluid, fields and fire hold still. */
export const CHUNK = 32;

/** Rooms paved in stone (the sealed arenas and the special rooms); the rest are wild ground. */
const PAVED: ReadonlySet<RoomKind> = new Set(['den', 'boss', 'vault', 'sanctum', 'alcove']);
/** Paved rooms with a rune circle at their centre. */
const RUNED: ReadonlySet<RoomKind> = new Set(['sanctum', 'boss']);

export const MAX_PARTICLES = 7000;
const MAX_RIPPLES = 140;
/** Growth moves this far toward its target per step (in over ~0.5 s)… */
const GROW_STEP = 1 / 15;
/** …and a target falls this much per step: 1.5 → 1 (held full, ~1.5 s), then 1 → 0 (~3 s). */
const GROW_FADE = 1 / 88;
/** A sprout's target: past full, so the vines hold before they fade. */
const GROW_PEAK = 1.5;

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
  /** Nature infusion's vines, as drawn (0–1): they follow `growthTarget`, and never spread or burn. */
  readonly growth: Float32Array;
  /** Where the growth is heading (0–1.5, drawn up to 1): a `sprout` sets it to 1.5, then it falls to 0. */
  readonly growthTarget: Float32Array;
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
  /** How many cells into the cliffs (0 on open ground): the render darkens the deep rock. */
  readonly edge: Uint8Array;
  /** The map this floor was built from, or null (the open arena). */
  readonly plan: MapPlan | null;
  /** Each floor cell's map cell (−1 outside the map), on a generated floor. */
  private readonly mapOf: Int32Array | null;
  /** Each map cell's crumbling structure (its index), −1 for none. */
  private readonly structOf: Int16Array | null;
  /** How worn each crumbling structure is (0 whole, 1 about to crumble): its cracks. */
  readonly damage: Float32Array;
  /** Each map cell's room (its index), −1 in a hall or a wall. */
  private roomOf: Int16Array | null = null;
  /** Each room's paving origin (floor cells), or null for its wild ground. */
  private paved: ({ x0: number; y0: number } | null)[] = [];
  /** The generator's seeded noise, kept to repaint a cell. */
  private nz: (x: number, y: number) => number = fbm;
  /** Cells where the river enters; fluid is added here every step. */
  readonly springs: number[] = [];
  /** Cells where fluid drains away every step: the arena's bottom rows, or each river's mouth. */
  readonly drains: number[] = [];
  /** Chunks across and down. */
  readonly chunksW: number;
  readonly chunksH: number;
  /** 1 where a chunk simulates: all of them until `setActive`. */
  readonly awake: Uint8Array;
  /** The awake cells' indices, in order: `active` is the start of `order`. */
  private readonly order: Int32Array;
  private active: Int32Array;
  /** The chunk-aligned rectangle `setActive` last woke round. */
  private woke = '';
  /** The awake chunks' bounds (cells, ends exclusive): the weather falls there. */
  box: { x0: number; y0: number; x1: number; y1: number };

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
    this.growth = new Float32Array(n);
    this.growthTarget = new Float32Array(n);
    this.mat = new Uint8Array(n);
    this.fuel = new Uint8Array(n);
    this.fire = new Uint8Array(n);
    this.prop = new Uint8Array(n);
    this.propColor = new Uint8Array(n);
    this.detail = new Uint8Array(n);
    this.tone = new Uint8Array(n);
    this.noise = new Float32Array(n);
    this.rubble = new Uint32Array(n);
    this.edge = new Uint8Array(n);
    this.plan = opts.plan ?? null;
    this.mapOf = this.plan ? new Int32Array(n) : null;
    this.structOf = this.plan ? new Int16Array(this.plan.cells.length).fill(-1) : null;
    this.damage = new Float32Array(this.plan?.structures.length ?? 0);
    this.plan?.structures.forEach((cells, k) => {
      for (const { x, y } of cells) this.structOf![y * this.plan!.width + x] = k;
    });
    this.chunksW = Math.ceil(this.width / CHUNK);
    this.chunksH = Math.ceil(this.height / CHUNK);
    this.awake = new Uint8Array(this.chunksW * this.chunksH).fill(1);
    this.order = new Int32Array(n).map((_, i) => i);
    this.active = this.order;
    this.box = { x0: 0, y0: 0, x1: this.width, y1: this.height };
    if (this.plan) this.generatePlan(this.plan);
    else this.generate();
  }

  get isLava(): boolean {
    return this.theme.fluid === 'lava';
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Floor cell `i`'s map cell code (`FLOOR_CELL`): a wall off the map, 0 on the open arena. */
  codeAt(i: number): number {
    if (!this.mapOf) return 0;
    const c = this.mapOf[i];
    return c < 0 ? FLOOR_CELL.wall : this.plan!.cells[c];
  }

  /** Floor cell `i`'s look (`LOOK`): `plain` off the map and on the open arena. */
  lookAt(i: number): number {
    const c = this.mapOf ? this.mapOf[i] : -1;
    return c < 0 ? LOOK.plain : this.plan!.look[c];
  }

  /** A ruin, foliage or slow ground: the effects mark it but never change what it is. */
  isTerrain(i: number): boolean {
    return this.codeAt(i) >= FLOOR_CELL.cover;
  }

  /** How cracked floor cell `i` is drawn (0–1): crumbling cover from a quarter, more as its structure wears. */
  crackAt(i: number): number {
    if (this.codeAt(i) !== FLOOR_CELL.crumbling) return 0;
    const k = this.structOf![this.mapOf![i]];
    return 0.25 + 0.75 * (k < 0 ? 0 : this.damage[k]);
  }

  /** Each crumbling structure's wear (0–1), in the map's order. */
  setCracks(damage: readonly number[]): void {
    for (let k = 0; k < this.damage.length; k++) this.damage[k] = damage[k] ?? 0;
  }

  /**
   * Repaint the map cells that changed (flat triples: cell, code, look): a
   * crumbled structure's rubble. A cell that was solid and is no longer throws
   * up its stone.
   */
  setCells(changes: readonly number[]): void {
    const plan = this.plan;
    if (!plan) return;
    const P = plan.ppu;
    for (let k = 0; k < changes.length; k += 3) {
      const c = changes[k];
      const was = plan.cells[c];
      plan.cells[c] = changes[k + 1];
      plan.look[c] = changes[k + 2];
      const x0 = this.margin + (c % plan.width) * P;
      const y0 = this.margin + Math.floor(c / plan.width) * P;
      for (let y = y0; y < y0 + P; y++)
        for (let x = x0; x < x0 + P; x++) this.paint(y * this.width + x, x, y);
      if (solidCell(was) && !solidCell(plan.cells[c])) this.crumble(x0 + P / 2, y0 + P / 2);
    }
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
      const ey = y < M ? M - y : y >= H - M ? y - (H - M - 1) : 0;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const ex = x < M ? M - x : x >= W - M ? x - (W - M - 1) : 0;
        this.edge[i] = ex > ey ? ex : ey;
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
    // …and it drains off the bottom edge.
    for (let i = this.size - W * 2; i < this.size; i++) this.drains.push(i);

    this.placeProps(rng, nz, [this.plaza]);
    this.settle();
    this.seedMotes(rng);
  }

  /**
   * A generated floor from its map, cell by cell (`paint`): walls become the
   * biome's cliffs, cover and crumbling cover low ruins, foliage shrubs, slow
   * ground its look (shallow water a pool held full), halls worn paths, and a
   * room's floor its ground: the sealed arenas and special rooms paved (a rune
   * circle in a sanctum and the boss's room), the rest grass and bare soil.
   * Nothing else makes water or shrubs, so nothing cosmetic reads as terrain.
   */
  private generatePlan(plan: MapPlan): void {
    const { width: W, height: H, margin: M } = this;
    const P = plan.ppu;
    const rng = mulberry32(this.seed);
    const ox = rng() * 1000;
    const oy = rng() * 1000;
    this.nz = (x, y) => fbm(x + ox, y + oy);
    const roomOf = new Int16Array(plan.width * plan.height).fill(-1);
    plan.rooms.forEach(({ rect: r }, k) => {
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) roomOf[y * plan.width + x] = k;
    });
    this.roomOf = roomOf;
    const circles: { x: number; y: number }[] = [];
    this.paved = plan.rooms.map(({ kind, rect }) => {
      if (!PAVED.has(kind)) return null;
      const x0 = M + rect.x * P;
      const y0 = M + rect.y * P;
      if (RUNED.has(kind))
        circles.push({
          x: Math.round(x0 + (rect.w * P) / 2),
          y: Math.round(y0 + (rect.h * P) / 2),
        });
      return { x0, y0 };
    });

    // Each floor cell's map cell, and how deep it lies in rock: 0 off it, then the chessboard distance.
    const { edge, mapOf } = this;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const mx = Math.floor((x - M) / P);
        const my = Math.floor((y - M) / P);
        const c =
          mx < 0 || my < 0 || mx >= plan.width || my >= plan.height ? -1 : my * plan.width + mx;
        mapOf![y * W + x] = c;
        edge[y * W + x] = c < 0 || plan.cells[c] === FLOOR_CELL.wall ? 255 : 0;
      }
    const relax = (i: number, j: number) => {
      if (edge[j] + 1 < edge[i]) edge[i] = edge[j] + 1;
    };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (x > 0) relax(i, i - 1);
        if (y > 0) {
          relax(i, i - W);
          if (x > 0) relax(i, i - W - 1);
          if (x < W - 1) relax(i, i - W + 1);
        }
      }
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        if (x < W - 1) relax(i, i + 1);
        if (y < H - 1) {
          relax(i, i + W);
          if (x < W - 1) relax(i, i + W + 1);
          if (x > 0) relax(i, i + W - 1);
        }
      }

    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        this.noise[i] = hash2(x, y, this.seed);
        this.paint(i, x, y);
      }

    // Nothing to settle: each pool is laid level and full, and its springs hold it there.
    this.placeProps(rng, this.nz, circles);
    this.seedMotes(rng);
  }

  /**
   * Paint floor cell `i` (at x, y) from its map cell: rock (or foliage spilling
   * over it), a low ruin, foliage, slow ground, or its room's or hall's ground.
   */
  private paint(i: number, x: number, y: number): void {
    const { theme: th, nz } = this;
    const c = this.mapOf![i];
    const code = this.codeAt(i);
    const look = this.lookAt(i);
    const base = 0.36 * (1 - y / this.height);
    let hh = base + (nz(x / 15, y / 15) - 0.5) * 0.05;
    let m: number;
    let fuel = 0;
    this.detail[i] = 0;
    this.fluid[i] = 0;
    if (code === FLOOR_CELL.wall) {
      m = MAT.WALL;
      hh = 0.6 + nz(x / 8, y / 8) * 0.12;
      this.tone[i] = Math.min(2, (nz(x / 5 + 3, y / 5 + 9) * 3.2) | 0);
      // Foliage spills over the cliff tops, as round the open arena.
      const e = this.edge[i];
      if (th.grassCover > 0.3 && e < 5 && nz(x / 4 + 11, y / 4 + 5) > 0.5 + (e - 1) * 0.06) {
        m = MAT.BUSH;
        fuel = 255;
        this.detail[i] |= DETAIL.OVERHANG;
      }
    } else if (code === FLOOR_CELL.cover || code === FLOOR_CELL.crumbling) {
      // A low ruin of blocks: a step above the ground, well under the cliffs.
      m = MAT.RUIN;
      hh = base + 0.16;
      const row = Math.floor(y / 3);
      const off = (row % 2) * 2;
      if (y % 3 === 0 || (x + off) % 5 === 0) this.detail[i] |= DETAIL.MORTAR;
      this.tone[i] = (hash2(Math.floor((x + off) / 5), row, this.seed + 3) * 255) | 0;
    } else if (code === FLOOR_CELL.foliage) {
      // Shrubs that never burn away: the foliage stays where the map has it.
      m = MAT.BUSH;
      hh += 0.014;
    } else if (code === FLOOR_CELL.slow && look === LOOK.shallow_water && !this.isLava) {
      // A pool dug in, held full by a spring in each of its cells.
      m = MAT.BANK;
      hh -= 0.08;
      this.fluid[i] = SHALLOW;
      this.springs.push(i);
    } else if (code === FLOOR_CELL.slow) {
      m = MAT.SLOW;
      if (look === LOOK.snowdrift || look === LOOK.rubble) hh += 0.03 * nz(x / 4, y / 4);
    } else {
      const pave = this.roomOf![c] < 0 ? undefined : this.paved[this.roomOf![c]];
      if (pave === undefined) {
        // A hall's worn path: bare ground, a step up from the rooms so their water stays in them.
        m = MAT.SOIL;
        hh += 0.1;
      } else if (pave) {
        m = MAT.STONE;
        hh = base + 0.018;
        const fx = x - pave.x0;
        const fy = y - pave.y0;
        const row = Math.floor(fy / 6);
        const off = (row % 2) * 4;
        const col = Math.floor((fx + off) / 9);
        if (fy % 6 === 0 || (fx + off) % 9 === 0) this.detail[i] |= DETAIL.MORTAR;
        if (nz(x / 4 + 90, y / 4 + 30) > 0.62) this.detail[i] |= DETAIL.MOSS;
        this.tone[i] = (hash2(col, row, this.seed + 1) * 255) | 0;
      } else {
        const grassThr = 0.5 + (0.5 - th.grassCover) * 0.36;
        m = nz(x / 18 + 20, y / 18 + 7) > grassThr ? MAT.GRASS : MAT.SOIL;
      }
    }
    if (m !== MAT.WALL && m !== MAT.STONE && m !== MAT.RUIN && !(this.detail[i] & DETAIL.OVERHANG))
      this.tone[i] = Math.min(3, (nz(x / 3 + 7, y / 3 + 3) * 4) | 0);
    if (m === MAT.GRASS) fuel = 150 + ((this.noise[i] * 90) | 0);
    this.mat[i] = m;
    this.terrain[i] = hh;
    this.fuel[i] = fuel;
  }

  /** Let the rivers settle into their beds before the first frame. */
  private settle(): void {
    for (let s = 0; s < 160; s++) {
      this.feedSprings();
      this.flowFluid(this.isLava ? 0.08 : 0.24);
      if (!this.isLava) this.flowFluid(0.24);
      this.drainEdges();
    }
    this.flow.fill(0);
    this.wet.fill(0);
  }

  private seedMotes(rng: () => number): void {
    const { width: W, height: H, margin: M } = this;
    if (!this.theme.motes) return;
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

  private placeProps(
    rng: () => number,
    nz: (x: number, y: number) => number,
    circles: readonly { x: number; y: number }[],
  ): void {
    const { width: W, height: H, margin: M, theme: th } = this;
    // A rune circle and glyph in each plaza.
    for (const { x: cx, y: cy } of circles)
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
    // Crystals studding the cliffs along the floor's edge.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (this.mat[i] !== MAT.WALL) continue;
        if (this.edge[i] < 5 && hash2(x, y, this.seed + 9) > 0.965) {
          this.prop[i] = PROP.CRYSTAL;
          this.propColor[i] = (hash2(y, x, this.seed) * th.propColors.length) | 0;
        }
      }
    }
  }

  /**
   * Simulate only the chunks under the cells [x0, x1) × [y0, y1), and every
   * room those chunks reach, whole (its river runs from its spring to its
   * mouth); the rest sleep. A generated floor's view calls it every frame;
   * the open arena stays awake.
   */
  setActive(x0: number, y0: number, x1: number, y1: number): void {
    const { width: W, height: H, chunksW: CW, chunksH: CH, awake, margin: M, plan } = this;
    const cx0 = Math.max(0, Math.floor(x0 / CHUNK));
    const cy0 = Math.max(0, Math.floor(y0 / CHUNK));
    const cx1 = Math.min(CW, Math.ceil(x1 / CHUNK));
    const cy1 = Math.min(CH, Math.ceil(y1 / CHUNK));
    const key = `${cx0},${cy0},${cx1},${cy1}`;
    if (key === this.woke) return;
    this.woke = key;
    awake.fill(0);
    /** Wake the chunks under cells [ax, bx) × [ay, by). */
    const wake = (ax: number, ay: number, bx: number, by: number) => {
      for (let cy = Math.floor(ay / CHUNK); cy < Math.min(CH, Math.ceil(by / CHUNK)); cy++)
        for (let cx = Math.floor(ax / CHUNK); cx < Math.min(CW, Math.ceil(bx / CHUNK)); cx++)
          awake[cy * CW + cx] = 1;
    };
    wake(cx0 * CHUNK, cy0 * CHUNK, cx1 * CHUNK, cy1 * CHUNK);
    for (const { rect: r } of plan?.rooms ?? []) {
      const [ax, ay] = [M + r.x * plan!.ppu, M + r.y * plan!.ppu];
      const [bx, by] = [ax + r.w * plan!.ppu, ay + r.h * plan!.ppu];
      if (ax < cx1 * CHUNK && bx > cx0 * CHUNK && ay < cy1 * CHUNK && by > cy0 * CHUNK)
        wake(ax, ay, bx, by);
    }
    let n = 0;
    const box = { x0: W, y0: H, x1: 0, y1: 0 };
    for (let y = 0; y < H; y++) {
      const row = ((y / CHUNK) | 0) * CW;
      for (let cx = 0; cx < CW; cx++) {
        if (!awake[row + cx]) continue;
        const a = cx * CHUNK;
        const b = Math.min(W, a + CHUNK);
        for (let x = a; x < b; x++) this.order[n++] = y * W + x;
        box.x0 = Math.min(box.x0, a);
        box.x1 = Math.max(box.x1, b);
        box.y0 = Math.min(box.y0, y);
        box.y1 = y + 1;
      }
    }
    this.active = this.order.subarray(0, n);
    this.box = box;
  }

  private isAwake(i: number): boolean {
    const W = this.width;
    return this.awake[((i / W / CHUNK) | 0) * this.chunksW + (((i % W) / CHUNK) | 0)] === 1;
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
    // A room's river wells up no deeper than this, so it never climbs into the hall above.
    const cap = this.plan ? 0.05 : Infinity;
    for (const s of this.springs)
      if (this.isAwake(s)) this.fluid[s] = Math.min(cap, this.fluid[s] + rate);
  }

  private drainEdges(): void {
    for (const i of this.drains) this.fluid[i] = 0;
  }

  private flowFluid(rate: number): void {
    const { width: W, size: N, terrain: h, fluid: w, dw, frost, active } = this;
    // Awake cells only (a cell clears its own as it wakes): the cost follows the view, not the map.
    for (let k = 0; k < active.length; k++) dw[active[k]] = 0;
    const surf = (j: number) => (frost[j] > 0.5 && w[j] > 0.003 ? Infinity : h[j] + w[j]);
    // ponytail: water flowing into an asleep chunk is dropped (its dw is never applied); rooms
    // wake whole, so only a hall or a clipped room loses any. Gate the edges if it ever shows.
    for (let k = 0; k < active.length; k++) {
      const i = active[k];
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
    for (let k = 0; k < active.length; k++) {
      const i = active[k];
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
      growth,
      growthTarget,
      charge,
      frost,
      trample,
      mat,
      fire,
      fuel,
    } = this;
    const lava = this.isLava;
    const snowing = this.weather && this.theme.weather === 'snow';
    const active = this.active;
    for (let k = 0; k < active.length; k++) {
      const i = active[k];
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
      const gt = growthTarget[i];
      if (gt > 0 || growth[i] > 0) {
        const g = growth[i];
        const top = gt < 1 ? gt : 1;
        growth[i] = g < top ? Math.min(top, g + GROW_STEP) : Math.max(top, g - GROW_STEP);
        growthTarget[i] = gt > GROW_FADE ? gt - GROW_FADE : 0;
      }
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
    const { width: W, height: H, fire, fuel, fluid, mat, frost, active } = this;
    const wind = this.wind;
    for (let k = 0; k < active.length; k++) {
      const i = active[k];
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
    // It falls round the awake chunks (all of the open arena).
    const { x0: X, y0: Y } = this.box;
    const W = this.box.x1 - X;
    const H = this.box.y1 - Y;
    const M = this.plan ? 0 : this.margin;
    const r = this.rand;
    switch (this.theme.weather) {
      case 'rain':
      case 'storm': {
        const n = this.theme.weather === 'storm' ? 24 : 18;
        for (let k = 0; k < n; k++) {
          this.spawn(
            PART.RAIN,
            X + r() * (W + 40) - 20 - this.wind * 30,
            Y + r() * H,
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
            X + r() * (W + 30) - 15 - this.wind * 20,
            Y + r() * H,
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
          const x = X + M + r() * (W - 2 * M);
          const y = Y + M + r() * (H - 2 * M);
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
              X + r() * W,
              Y + r() * H,
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
            if (this.mat[i] !== MAT.WALL && !this.isTerrain(i)) {
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
    if (this.mat[i] === MAT.WALL || !this.isAwake(i)) return;
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

  /** Stone thrown up where a structure's cell crumbles, and its dust. */
  private crumble(cx: number, cy: number): void {
    const r = this.rand;
    const stone = packRGB(this.theme.stone);
    for (let s = 0; s < 8; s++) {
      const a = r() * Math.PI * 2;
      const sp = 0.3 + r() * 0.8;
      this.spawn(
        PART.DEBRIS,
        cx,
        cy,
        2,
        Math.cos(a) * sp,
        Math.sin(a) * sp * 0.8,
        1 + r() * 2,
        600,
        stone,
      );
    }
    this.burst(PART.DUST, cx, cy, 6, 0.3, 0.08, 90);
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
        } else if (!this.isTerrain(i)) {
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

  /** Nature infusion: vines grow in over the cells within `r` (see `growth`). */
  sprout(cx: number, cy: number, r: number): void {
    this.forDisc(cx, cy, r, (i) => {
      if (this.mat[i] !== MAT.WALL) this.growthTarget[i] = GROW_PEAK;
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
