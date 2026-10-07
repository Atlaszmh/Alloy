import type { ArpgEvent, ManaType, MoveKind, Vec } from '@alloy/engine';
import { PX, manaArc, manaDust, manaLine, manaRing, px } from './mana-pixels';
import {
  drawInfusion,
  eventSeed,
  type InfusionBudget,
  type InfusionLayers,
  type InfusionShape,
  type PathShape,
  type RingShape,
} from './infusion';

/**
 * Short-lived combat effects, drawn as mana pixels into the air layer: sparks
 * and debris, expanding rings, lightning and dash streaks, swings, beams, and
 * the casting polish (a fling of mana toward the target and pixels gathering
 * during a wind-up). It also holds the transient infusion carriers
 * (fx/infusion.ts): infused swings and beams, heavy and hold blows' rings in
 * their own element (at a blade's tip, round a full circle, or a flare at a
 * shooter's hand), blasts and blink trails. Cosmetic only, so it may use
 * Math.random.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  /** Pixels across (1 or 2). */
  size: number;
  /** Slows down (sparks) or keeps going (flings). */
  drag: number;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: number;
  fill: boolean;
}

interface Bolt {
  points: Vec[];
  life: number;
  max: number;
  color: number;
}

interface Swing {
  x: number;
  y: number;
  angle: number;
  arc: number;
  range: number;
  color: number;
  age: number;
  life: number;
  heft: number;
  /** Sweep from the other side (backslash). */
  reverse: boolean;
  finisher: boolean;
  /** The infusion drawn along the swept arc, and its motif's seed. */
  infusion: ManaType | null;
  seed: number;
}

interface Beam {
  x: number;
  y: number;
  tx: number;
  ty: number;
  width: number;
  color: number;
  age: number;
  life: number;
  infusion: ManaType | null;
  seed: number;
}

/** A transient infusion carrier: a heavy or hold blow's ring ('finisher') or a blast (rings), or a blink trail (a path). */
export type InfusedKind = 'finisher' | 'blast' | 'dash';

interface Infused {
  kind: InfusedKind;
  element: ManaType;
  shape: InfusionShape;
  seed: number;
  age: number;
  life: number;
}

/** A rune's glyph flashing over its point (fx/runes.ts). */
interface Glyph {
  x: number;
  y: number;
  /** Rows of cells, '#' lit, each a 2×2-pixel block. */
  rows: readonly string[];
  color: number;
  /** Its lit cells: what drawing it takes off the frame's budget. */
  cells: number;
  age: number;
}

/**
 * How long each transient carrier lasts, and how strongly it draws (a heavy
 * or hold blow's ring, in the blow's own element, at 1.5).
 */
const INFUSED: Record<InfusedKind, { life: number; strength: number }> = {
  finisher: { life: 0.45, strength: 1.5 },
  blast: { life: 0.45, strength: 1 },
  dash: { life: 0.4, strength: 1 },
};

const MAX_PARTICLES = 500;

/**
 * Hit moments a frame (a hit's burst, ring and shake here, its spark on the pixel floor). The
 * caps above bound the totals; this bounds a frame, so a burst of echoes can't starve the next
 * real hit (spec §8). Tune it down first if the p95 frame misses 16.7 ms.
 */
export const HIT_FX_BUDGET = 24;

/**
 * The frame's hits that draw their moment, at most `budget`: the real hits first, in order, then
 * the echoes' (`echo`) from what is left. A hit left out draws its floating number only; one
 * `keep` passes over (the renderer's: out of sight) spends nothing.
 */
export function hitFxPicks(
  events: readonly ArpgEvent[],
  budget = HIT_FX_BUDGET,
  keep: (e: ArpgEvent) => boolean = () => true,
): Set<ArpgEvent> {
  const picked = new Set<ArpgEvent>();
  for (const echo of [false, true])
    for (const e of events) {
      if (picked.size >= budget) return picked;
      if (e.kind === 'hit' && !!e.echo === echo && keep(e)) picked.add(e);
    }
  return picked;
}

const SWEEP_SECONDS = 0.1;
/** A rune glyph's flash: how long it lasts, the share of that it is white, and the pixels it rises. */
export const GLYPH_LIFE = 0.45;
const GLYPH_WHITE = 0.15;
const GLYPH_RISE = 4;

/** How far toward the aim a cast leaves the hero's hand (world units), at chest height. */
export const HAND = 0.6;

/** The hand point: `HAND` units from (x, y) toward `dir`, at chest height. */
export function handPoint(x: number, y: number, dir: Vec): Vec {
  const len = Math.hypot(dir.x, dir.y) || 1;
  return { x: x + (dir.x / len) * HAND, y: y - 0.3 + (dir.y / len) * HAND };
}

/**
 * How many pixels to spawn this frame for `rate` per 60 Hz frame: the whole
 * part, plus one more by chance for the fraction, so density doesn't depend on
 * the frame rate (and nothing spawns while the display is frozen).
 */
export function spawnCount(rate: number, dt: number, rand = Math.random): number {
  const n = rate * dt * 60;
  const whole = Math.floor(n);
  return whole + (rand() < n - whole ? 1 : 0);
}

/**
 * Where a heavy or hold basic blow rings out in its element: a ring at the
 * blade's tip (`reach` out along `dir`, sized by heft), round the hero at
 * `reach` for a full-circle blow, or, for a shot (no tip), a flare at the hand
 * (r 0.6); none for a light or medium blow. `arc` is in radians.
 */
export function finisherRing(
  e: { x: number; y: number; dir: Vec; heft: number; melee: boolean; moveKind: MoveKind },
  arc: number,
  reach: number,
): RingShape | null {
  if (e.moveKind !== 'heavy' && e.moveKind !== 'hold') return null;
  if (!e.melee) {
    const hand = handPoint(e.x, e.y, e.dir);
    return { kind: 'ring', x: hand.x, y: hand.y, r: 0.6 };
  }
  if (arc >= Math.PI * 2 - 1e-3) return { kind: 'ring', x: e.x, y: e.y, r: reach };
  const r = 0.6 + e.heft * 0.6;
  return { kind: 'ring', x: e.x + e.dir.x * reach, y: e.y + e.dir.y * reach, r };
}

export class ManaFx {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private bolts: Bolt[] = [];
  private swings: Swing[] = [];
  private beams: Beam[] = [];
  private infusions: Infused[] = [];
  private glyphs: Glyph[] = [];
  /** Display seconds so far: seeds each transient motif by when it was made. */
  private now = 0;

  clear(): void {
    this.particles = [];
    this.rings = [];
    this.bolts = [];
    this.swings = [];
    this.beams = [];
    this.infusions = [];
    this.glyphs = [];
  }

  /** Sparks and debris: pixels thrown out in every direction. */
  burst(x: number, y: number, color: number, n: number, speed = 4, big = false): void {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.45,
        max: 0.45,
        color,
        size: big || Math.random() < 0.2 ? 2 : 1,
        drag: 0.9,
      });
    }
  }

  /** A cone of mana thrown from (x, y) toward `dir`: the visible "cast" of an ability or shot. */
  fling(x: number, y: number, dir: Vec, color: number, n = 10, speed = 8): void {
    const base = Math.atan2(dir.y, dir.x);
    const hand = handPoint(x, y, dir);
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = base + (Math.random() - 0.5) * 0.9;
      const s = speed * (0.5 + Math.random() * 0.7);
      this.particles.push({
        x: hand.x,
        y: hand.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.22 + Math.random() * 0.12,
        max: 0.34,
        color: Math.random() < 0.25 ? 0xffffff : color,
        size: Math.random() < 0.3 ? 2 : 1,
        drag: 0.84,
      });
    }
  }

  /** Pixels drawn inward to (x, y) (the hand) while an action winds up. */
  gather(x: number, y: number, color: number, n = 2): void {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.3 + Math.random() * 0.7;
      const life = 0.3;
      this.particles.push({
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: (-Math.cos(a) * r) / life,
        vy: (-Math.sin(a) * r) / life,
        life,
        max: life,
        color,
        size: 1,
        drag: 1,
      });
    }
  }

  /** Something ends: its pixels scatter outward and drift up instead of vanishing. */
  disperse(x: number, y: number, r: number, color: number, n = 24): void {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: Math.cos(a) * 0.8,
        vy: Math.sin(a) * 0.8 - 0.6,
        life: 0.6 + Math.random() * 0.3,
        max: 0.9,
        color,
        size: 1,
        drag: 0.97,
      });
    }
  }

  ring(x: number, y: number, r1: number, color: number, fill = false, life = 0.35, r0 = 0.1): void {
    this.rings.push({ x, y, r0, r1, life, max: life, color, fill });
  }

  bolt(points: Vec[], color: number, life: number, jag = false): void {
    this.bolts.push({ points: jag ? jagged(points) : points, life, max: life, color });
  }

  /**
   * A melee blow: a pixel smear that travels across the arc (alternate
   * sides for a backslash), brighter and longer for heavy blows. A heavy or
   * hold blow (`finisher`) adds a shockwave at the tip, in the blow's own
   * element; a full-circle heavy blow (a slam) bursts a ring of ground pixels
   * and dust.
   */
  swing(
    x: number,
    y: number,
    angle: number,
    arc: number,
    range: number,
    color: number,
    o: { heft?: number; reverse?: boolean; finisher?: boolean; infusion?: ManaType | null } = {},
  ): void {
    const heft = o.heft ?? 0.3;
    const life = SWEEP_SECONDS + 0.12 + 0.12 * heft + (o.finisher ? 0.08 : 0);
    // The blade has swept part of its arc by the moment it connects: most of it for a blow heavy
    // enough to freeze the display (so the freeze shows the arc), less for a light one (so it sweeps).
    this.swings.push({
      x,
      y,
      angle,
      arc,
      range,
      color,
      age: SWEEP_SECONDS * (heft >= 0.3 ? 0.6 : 0.3),
      life,
      heft,
      reverse: !!o.reverse,
      finisher: !!o.finisher,
      infusion: o.infusion ?? null,
      seed: eventSeed(x, y, this.now),
    });
    const end = o.reverse ? angle - arc / 2 : angle + arc / 2;
    const tx = x + Math.cos(end) * range;
    const ty = y + Math.sin(end) * range;
    this.burst(tx, ty, color, 3 + Math.round(heft * 5), 2.5 + heft * 2);
    if (o.finisher && arc < Math.PI * 2 - 1e-3) {
      const hx = x + Math.cos(angle) * range;
      const hy = y + Math.sin(angle) * range;
      this.ring(hx, hy, 0.6 + heft * 0.6, color, true, 0.3);
    }
    if (arc >= Math.PI * 2 - 1e-3 && heft >= 0.9) {
      this.ring(x, y, range, color, true, 0.4);
      this.burst(x, y + 0.2, 0xd6d3d1, 18, 3);
    }
  }

  beam(
    x: number,
    y: number,
    tx: number,
    ty: number,
    width: number,
    color: number,
    infusion: ManaType | null = null,
  ): void {
    this.beams.push({
      x,
      y,
      tx,
      ty,
      width,
      color,
      age: 0,
      life: 0.36,
      infusion,
      seed: eventSeed(x, y, this.now),
    });
  }

  /**
   * A transient infusion carrier: a heavy or hold blow's ring in its own
   * element (at the blade's tip, round a full circle, or a flare at the hand
   * for a shot; drawn at strength 1.5), an infused blast's rim (a ring that
   * grows with the blast's own) or a blink trail (a path). Seeded from where
   * and when it was made.
   */
  infuse(kind: InfusedKind, element: ManaType, shape: InfusionShape): void {
    const at = shape.kind === 'path' ? shape.points[0] : shape;
    this.infusions.push({
      kind,
      element,
      shape,
      seed: eventSeed(at.x, at.y, this.now),
      age: 0,
      life: INFUSED[kind].life,
    });
  }

  /**
   * A rune's glyph flashing at (x, y) for `GLYPH_LIFE`: `rows` of cells ('#'
   * lit), each a 2×2-pixel block, centred on the point; white at first, then
   * `color`, rising as it fades. It is drawn in the infusion pass, so its
   * cells come off the frame's budget.
   */
  glyph(x: number, y: number, rows: readonly string[], color: number): void {
    const cells = rows.join('').split('#').length - 1;
    this.glyphs.push({ x, y, rows, color, cells, age: 0 });
  }

  /**
   * Advance and draw everything: the effects on the air layer, then the
   * infusion pass's first carriers (fx/infusion.ts) in priority order: the
   * runes' glyphs, heavy and hold blows' rings, blasts, beams and sweeps,
   * then blink trails. Only blasts and blink trails lie on the ground, so
   * only they get its layer.
   */
  draw(layers: Required<InfusionLayers>, dt: number, time: number, budget: InfusionBudget): void {
    const g = layers.air;
    this.now += dt;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Drag per 60 Hz frame, so sparks slow the same at any frame rate and keep their speed when frozen.
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      px(g, p.x, p.y, p.color, Math.max(0, p.life / p.max) * 1.2, p.size);
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const r of this.rings) {
      r.life -= dt;
      const p = 1 - Math.max(0, r.life / r.max);
      const radius = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - p, 3));
      if (r.fill) manaDust(g, r.x, r.y, radius, r.color, time, 0.12, 1 - p, r.x * 7 + r.y);
      manaRing(g, r.x, r.y, radius, r.color, time, {
        alpha: (1 - p) * 1.1,
        thickness: p < 0.4 ? 2 : 1,
        jitter: 1,
      });
    }
    this.rings = this.rings.filter((r) => r.life > 0);

    for (const b of this.bolts) {
      b.life -= dt;
      const a = Math.max(0, b.life / b.max);
      for (let i = 0; i < b.points.length - 1; i++) {
        const p0 = b.points[i];
        const p1 = b.points[i + 1];
        manaLine(g, p0.x, p0.y, p1.x, p1.y, b.color, 0.8 * a, { thickness: 2, jitter: 1, time });
        manaLine(g, p0.x, p0.y, p1.x, p1.y, 0xffffff, 0.9 * a, { every: 2 });
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);

    // Infused sweeps and beams: their motifs are drawn with the others, below.
    const paths: { element: ManaType; shape: PathShape; seed: number; strength: number }[] = [];
    for (const s of this.swings) {
      s.age += dt;
      const p = Math.min(1, s.age / SWEEP_SECONDS);
      const fade = 1 - Math.max(0, (s.age - SWEEP_SECONDS) / (s.life - SWEEP_SECONDS));
      const sign = s.reverse ? -1 : 1;
      const from = s.angle - (sign * s.arc) / 2;
      const head = from + sign * s.arc * p;
      const thick = s.heft >= 0.6 ? 3 : 2;
      manaArc(g, s.x, s.y, s.range, from, head, s.color, 0.9 * fade, thick);
      // The leading edge is white-hot while it travels.
      const edge = Math.min(0.3, s.arc * 0.2);
      manaArc(g, s.x, s.y, s.range + PX, head - sign * edge, head, 0xffffff, fade, 1);
      if (s.finisher) manaArc(g, s.x, s.y, s.range + PX * 2, from, head, s.color, 0.6 * fade, 1);
      if (s.infusion)
        paths.push({
          element: s.infusion,
          shape: {
            kind: 'path',
            points: arcPoints(s.x, s.y, s.range, from, head),
            width: 0.3,
            progress: Math.min(1, s.age / s.life),
          },
          seed: s.seed,
          strength: fade,
        });
    }
    this.swings = this.swings.filter((s) => s.age < s.life);

    for (const b of this.beams) {
      b.age += dt;
      // It extends from the hand, then fades from base to tip.
      const grow = Math.min(1, b.age / 0.06);
      const fadeP = Math.max(0, (b.age - 0.06) / (b.life - 0.06));
      const tipX = b.x + (b.tx - b.x) * grow;
      const tipY = b.y + (b.ty - b.y) * grow;
      const baseX = b.x + (b.tx - b.x) * fadeP;
      const baseY = b.y + (b.ty - b.y) * fadeP;
      const thick = Math.max(1, Math.round((b.width * 2 * (1 - fadeP)) / PX));
      manaLine(g, baseX, baseY, tipX, tipY, b.color, 0.75, { thickness: thick, jitter: 1, time });
      manaLine(g, baseX, baseY, tipX, tipY, 0xffffff, 0.95, { thickness: 1 });
      // It sheds pixels as it fades (about one a frame at 60 Hz).
      if (fadeP > 0)
        for (let i = spawnCount(1, dt); i > 0 && this.particles.length < MAX_PARTICLES; i--)
          this.particles.push({
            x: baseX,
            y: baseY,
            vx: (Math.random() - 0.5) * 1.2,
            vy: -0.8 - Math.random(),
            life: 0.4,
            max: 0.4,
            color: b.color,
            size: 1,
            drag: 0.95,
          });
      if (b.infusion)
        paths.push({
          element: b.infusion,
          shape: {
            kind: 'path',
            points: [
              { x: baseX, y: baseY },
              { x: tipX, y: tipY },
            ],
            width: b.width,
            progress: Math.min(1, b.age / b.life),
          },
          seed: b.seed,
          strength: 1 - fadeP,
        });
    }
    this.beams = this.beams.filter((b) => b.age < b.life);

    // The infusion pass starts here, with these first-priority carriers: the runes' glyphs first,
    // each drawn whole while the budget covers its cells (else skipped that frame).
    for (const gl of this.glyphs) {
      gl.age += dt;
      if (gl.age >= GLYPH_LIFE || gl.cells > budget.left) continue;
      budget.left -= gl.cells;
      const p = gl.age / GLYPH_LIFE;
      // White as it flashes, then its colour, rising a whole pixel at a time as it fades.
      const color = p < GLYPH_WHITE ? 0xffffff : gl.color;
      const alpha = Math.min(1, 1.6 * (1 - p));
      const x0 = gl.x - gl.rows[0].length * PX;
      const y0 = gl.y - gl.rows.length * PX - Math.round(p * GLYPH_RISE) * PX;
      gl.rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++)
          if (row[i] === '#') px(g, x0 + 2 * i * PX, y0 + 2 * j * PX, color, alpha, 2);
      });
    }
    this.glyphs = this.glyphs.filter((gl) => gl.age < GLYPH_LIFE);
    for (const f of this.infusions) f.age += dt;
    const air = { air: g };
    const transient = (kind: InfusedKind, l: InfusionLayers) => {
      for (const f of this.infusions)
        if (f.kind === kind)
          drawInfusion(
            l,
            f.element,
            shapeAt(f),
            time,
            f.seed,
            INFUSED[kind].strength * Math.max(0, 1 - f.age / f.life),
            budget,
          );
    };
    transient('finisher', air);
    transient('blast', layers);
    for (const q of paths) drawInfusion(air, q.element, q.shape, time, q.seed, q.strength, budget);
    transient('dash', layers);
    this.infusions = this.infusions.filter((f) => f.age < f.life);
  }
}

/** Lightning: a crooked path through `points`. */
function jagged(points: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    out.push(a);
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      out.push({
        x: a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 0.5,
        y: a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 0.5,
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Points along an arc from `a0` to `a1`, about every 0.3 units (an infused sweep's path). */
function arcPoints(x: number, y: number, r: number, a0: number, a1: number): Vec[] {
  const n = Math.max(1, Math.ceil((Math.abs(a1 - a0) * r) / 0.3));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
  });
}

/** A transient carrier's shape at its age: a blast's rim grows with its ring; a trail's progress runs. */
function shapeAt(f: Infused): InfusionShape {
  const p = Math.min(1, f.age / f.life);
  if (f.shape.kind === 'path') return { ...f.shape, progress: p };
  if (f.kind === 'blast' && f.shape.kind === 'ring')
    return { ...f.shape, r: 0.1 + (f.shape.r - 0.1) * (1 - Math.pow(1 - p, 3)) };
  return f.shape;
}
