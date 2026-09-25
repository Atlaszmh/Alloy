import type { ArpgEvent, ArpgWorld, ManaType, Rarity } from '@alloy/engine';
import { PixelWorld, type PixelLight } from './world';
import { renderPixelWorld, type RenderView } from './render';
import { themeForBiome, type RGB } from './themes';
import { applyArenaEvent, arenaToCell } from './arena-effects';

/**
 * The pixel floor without any rendering backend: it steps the PixelWorld from
 * snapshots of the arena and paints the on-screen window into a pixel buffer.
 * It runs in a Web Worker in the game (see floor-worker.ts) and in-thread as
 * a fallback.
 */

/** Floor cells per arena unit, and cliff border (arena units) around it. */
export const FLOOR_PPU = 5;
export const FLOOR_MARGIN = 3;
/** Output pixels per floor cell: the picture is drawn finer than the simulation. */
export const FLOOR_SCALE = 2;
/** Extra cells rendered around the camera so movement between repaints never shows an edge. */
const VIEW_PAD = 6;
const STEP = 1 / 30;
/** Above this render cost (ms), repaint every other step. */
const SLOW_RENDER_MS = 7;

export interface FloorInit {
  arenaWidth: number;
  arenaHeight: number;
  biomeId: string;
  depth: number;
}

/** Everything the floor needs from one game frame, as plain data (it crosses to a worker). */
export interface FloorFrame {
  dt: number;
  events: ArpgEvent[];
  /** Moving bodies: key, x, y, radius (arena units). */
  bodies: [string, number, number, number][];
  hero: { x: number; y: number; element: ManaType | null };
  projectiles: {
    x: number;
    y: number;
    radius: number;
    /** The ability form that fired it (null for basic bolts and monster shots). */
    source: string | null;
    pierce: boolean;
    element: ManaType | null;
    owner: 'hero' | 'monster';
  }[];
  zones: {
    x: number;
    y: number;
    radius: number;
    source: string | null;
    element: ManaType | null;
    owner: 'hero' | 'monster';
  }[];
  drops: { x: number; y: number; rarity: Rarity }[];
  /** Visible arena rectangle (arena units). */
  view: { left: number; top: number; right: number; bottom: number };
}

export interface FloorPicture {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  /** Top-left of the picture, in arena units. */
  x: number;
  y: number;
}

const ELEMENT_LIGHT: Record<ManaType, RGB> = {
  fire: [255, 150, 60],
  frost: [150, 220, 255],
  storm: [255, 240, 150],
  earth: [212, 163, 90],
  shadow: [190, 130, 255],
  nature: [140, 230, 110],
};

const RARITY_LIGHT: Partial<Record<Rarity, RGB>> = {
  rare: [252, 211, 77],
  epic: [192, 132, 252],
  legendary: [251, 146, 60],
};

/** An Earth bolt that pierces rolls like a boulder and ploughs the ground. */
function isBoulder(p: FloorFrame['projectiles'][number]): boolean {
  return p.source === 'bolt' && p.pierce && p.element === 'earth';
}

/** Engine event kinds the floor reacts to; the rest are dropped before crossing threads. */
const FLOOR_EVENTS = new Set<ArpgEvent['kind']>(['explode', 'chain', 'hit', 'death', 'dash']);

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Capture what the floor needs from the arena this frame. */
export function snapshotArena(
  w: ArpgWorld,
  dt: number,
  events: readonly ArpgEvent[],
  view: FloorFrame['view'],
): FloorFrame {
  const bodies: FloorFrame['bodies'] = [['hero', w.hero.x, w.hero.y, w.hero.radius]];
  for (const m of w.monsters) bodies.push([`m${m.id}`, m.x, m.y, m.radius]);
  const drops: FloorFrame['drops'] = [];
  for (const d of w.drops)
    if (d.item && RARITY_LIGHT[d.item.rarity])
      drops.push({ x: d.x, y: d.y, rarity: d.item.rarity });
  return {
    dt,
    events: events.filter((e) => FLOOR_EVENTS.has(e.kind)),
    bodies,
    hero: { x: w.hero.x, y: w.hero.y, element: w.hero.stats.weapon.element },
    projectiles: w.projectiles.map((p) => ({
      x: p.x,
      y: p.y,
      radius: p.radius,
      source: p.form,
      pierce: p.pierce,
      element: p.element,
      owner: p.owner,
    })),
    zones: w.zones
      .filter((z) => !z.dead)
      .map((z) => ({
        x: z.x,
        y: z.y,
        radius: z.radius,
        source: z.source,
        element: z.element,
        owner: z.owner,
      })),
    drops,
    view,
  };
}

export class FloorEngine {
  readonly world: PixelWorld;
  private pixels: Uint8ClampedArray | null = null;
  private viewW = 0;
  private viewH = 0;
  private acc = 0;
  private time = 0;
  private renderEvery = 1;
  private sinceRender = 0;
  private cost = 0;
  private painted = false;
  private readonly lastPos = new Map<string, number>();

  constructor(init: FloorInit) {
    this.world = new PixelWorld({
      width: (init.arenaWidth + FLOOR_MARGIN * 2) * FLOOR_PPU,
      height: (init.arenaHeight + FLOOR_MARGIN * 2) * FLOOR_PPU,
      margin: FLOOR_MARGIN * FLOOR_PPU,
      seed: (Math.imul(init.depth, 7919) + hashString(init.biomeId)) >>> 0,
      theme: themeForBiome(init.biomeId),
      // Blasts leave burning patches instead of torching the whole arena.
      fireSpread: 0.12,
      burnRate: 3,
    });
  }

  /** Average milliseconds per repaint. */
  get renderCost(): number {
    return this.cost;
  }

  /** Apply a frame; returns a fresh picture when one is due, else null. */
  frame(f: FloorFrame, reuse?: Uint8ClampedArray): FloorPicture | null {
    for (const e of f.events) applyArenaEvent(this.world, e, FLOOR_PPU, FLOOR_MARGIN);
    if (f.dt > 0) {
      this.acc += f.dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 3) {
        this.acc -= STEP;
        steps++;
        this.time += STEP;
        this.step(f);
      }
      if (steps === 3) this.acc = 0;
      this.sinceRender += steps;
    }
    if (this.painted && this.sinceRender < this.renderEvery) return null;
    this.sinceRender = 0;
    this.painted = true;
    if (
      !this.pixels &&
      reuse &&
      reuse.length === this.viewW * FLOOR_SCALE * this.viewH * FLOOR_SCALE * 4
    )
      this.pixels = reuse;
    const t0 = performance.now();
    const picture = this.paint(f);
    this.cost = this.cost * 0.9 + (performance.now() - t0) * 0.1;
    if (this.cost > SLOW_RENDER_MS) this.renderEvery = 2;
    else if (this.cost < SLOW_RENDER_MS * 0.6) this.renderEvery = 1;
    return picture;
  }

  private cell(x: number, y: number) {
    return arenaToCell(x, y, FLOOR_PPU, FLOOR_MARGIN);
  }

  private step(f: FloorFrame): void {
    const pw = this.world;
    pw.wind = 0.3 + 0.25 * Math.sin(this.time * 0.11);
    for (const [key, x, y, radius] of f.bodies) {
      const c = this.cell(x, y);
      const packed = c.y * pw.width + c.x;
      if (this.lastPos.get(key) === packed) continue;
      this.lastPos.set(key, packed);
      pw.disturb(c.x, c.y, Math.max(2, radius * FLOOR_PPU * 0.9));
      pw.wade(c.x, c.y + Math.round(radius * FLOOR_PPU * 0.5));
    }
    for (const p of f.projectiles) {
      const c = this.cell(p.x, p.y);
      if (isBoulder(p)) pw.furrow(c.x, c.y, p.radius * FLOOR_PPU);
      else if (p.source === 'bolt' && p.element === 'fire' && Math.random() < 0.5)
        pw.hitSpark(c.x, c.y, 'fire');
    }
    for (const z of f.zones) {
      if (z.owner !== 'hero') continue;
      const c = this.cell(z.x, z.y);
      const r = z.radius * FLOOR_PPU;
      if (z.source === 'barrage') continue;
      if (z.element === 'fire') pw.lavaBurst(c.x, c.y, r);
      else if (z.element === 'frost' && Math.random() < 0.35) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * r;
        pw.frostBlast(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 3);
      }
    }
    pw.step();
  }

  private lights(f: FloorFrame): PixelLight[] {
    const lights: PixelLight[] = [];
    const h = this.cell(f.hero.x, f.hero.y);
    lights.push({ x: h.x, y: h.y, radius: 40, color: [255, 214, 150], intensity: 0.9 });
    lights.push({
      x: h.x,
      y: h.y,
      radius: 14,
      color: f.hero.element ? ELEMENT_LIGHT[f.hero.element] : [255, 214, 150],
      intensity: 0.6,
    });
    for (const p of f.projectiles) {
      if (!p.element || isBoulder(p)) continue;
      const c = this.cell(p.x, p.y);
      lights.push({
        x: c.x,
        y: c.y,
        radius: 18,
        color: ELEMENT_LIGHT[p.element],
        intensity: p.owner === 'hero' ? 1.3 : 0.9,
      });
    }
    for (const d of f.drops) {
      const c = this.cell(d.x, d.y);
      lights.push({
        x: c.x,
        y: c.y,
        radius: d.rarity === 'legendary' ? 26 : 16,
        color: RARITY_LIGHT[d.rarity]!,
        intensity: 1,
      });
    }
    for (const z of f.zones) {
      const c = this.cell(z.x, z.y);
      const color: RGB =
        z.owner === 'monster'
          ? [255, 70, 60]
          : z.element
            ? ELEMENT_LIGHT[z.element]
            : [255, 255, 255];
      lights.push({
        x: c.x,
        y: c.y,
        radius: z.radius * FLOOR_PPU * 1.6,
        color,
        intensity: z.owner === 'monster' ? 0.6 : 0.8,
      });
    }
    return lights;
  }

  private paint(f: FloorFrame): FloorPicture {
    const pw = this.world;
    const { left, top, right, bottom } = f.view;
    const needW = Math.min(pw.width, Math.ceil((right - left) * FLOOR_PPU) + VIEW_PAD * 2);
    const needH = Math.min(pw.height, Math.ceil((bottom - top) * FLOOR_PPU) + VIEW_PAD * 2);
    if (needW > this.viewW || needH > this.viewH || !this.pixels) {
      this.viewW = Math.max(needW, this.viewW);
      this.viewH = Math.max(needH, this.viewH);
      this.pixels = new Uint8ClampedArray(this.viewW * FLOOR_SCALE * this.viewH * FLOOR_SCALE * 4);
    }
    const cx = ((left + right) / 2 + FLOOR_MARGIN) * FLOOR_PPU;
    const cy = ((top + bottom) / 2 + FLOOR_MARGIN) * FLOOR_PPU;
    const view: RenderView = {
      x0: Math.max(0, Math.min(pw.width - this.viewW, Math.round(cx - this.viewW / 2))),
      y0: Math.max(0, Math.min(pw.height - this.viewH, Math.round(cy - this.viewH / 2))),
      w: this.viewW,
      h: this.viewH,
      scale: FLOOR_SCALE,
    };
    pw.lights = this.lights(f);
    renderPixelWorld(pw, this.pixels, this.time, view);
    return {
      pixels: this.pixels,
      width: this.viewW * FLOOR_SCALE,
      height: this.viewH * FLOOR_SCALE,
      x: view.x0 / FLOOR_PPU - FLOOR_MARGIN,
      y: view.y0 / FLOOR_PPU - FLOOR_MARGIN,
    };
  }

  /** Hand the buffer over (a worker transfers it); the caller may return one via `frame(…, reuse)`. */
  release(): void {
    this.pixels = null;
  }
}
