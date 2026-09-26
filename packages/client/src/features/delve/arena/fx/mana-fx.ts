import type { Graphics } from 'pixi.js';
import type { Vec } from '@alloy/engine';
import { PX, manaArc, manaDust, manaLine, manaRing, px } from './mana-pixels';

/**
 * Short-lived combat effects, drawn as mana pixels into the air layer: sparks
 * and debris, expanding rings, lightning and dash streaks, swings, beams, and
 * the casting polish (a fling of mana toward the target and pixels gathering
 * during a wind-up). Cosmetic only, so it may use Math.random.
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
}

interface Beam {
  x: number;
  y: number;
  tx: number;
  ty: number;
  width: number;
  color: number;
  life: number;
  max: number;
}

const MAX_PARTICLES = 500;
const SWEEP_SECONDS = 0.1;

export class ManaFx {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private bolts: Bolt[] = [];
  private swings: Swing[] = [];
  private beams: Beam[] = [];

  clear(): void {
    this.particles = [];
    this.rings = [];
    this.bolts = [];
    this.swings = [];
    this.beams = [];
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
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = base + (Math.random() - 0.5) * 0.9;
      const s = speed * (0.5 + Math.random() * 0.7);
      this.particles.push({
        x: x + Math.cos(base) * 0.35,
        y: y + Math.sin(base) * 0.35 - 0.3,
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

  ring(x: number, y: number, r1: number, color: number, fill = false, life = 0.35, r0 = 0.1): void {
    this.rings.push({ x, y, r0, r1, life, max: life, color, fill });
  }

  bolt(points: Vec[], color: number, life: number, jag = false): void {
    this.bolts.push({ points: jag ? jagged(points) : points, life, max: life, color });
  }

  /**
   * A melee blow: a pixel smear that travels across the arc (alternate
   * sides for a backslash), brighter and longer for heavy blows. A finisher
   * adds a shockwave at the tip; a full-circle heavy blow (a slam) bursts a
   * ring of ground pixels and dust.
   */
  swing(
    x: number,
    y: number,
    angle: number,
    arc: number,
    range: number,
    color: number,
    o: { heft?: number; reverse?: boolean; finisher?: boolean } = {},
  ): void {
    const heft = o.heft ?? 0.3;
    const life = SWEEP_SECONDS + 0.12 + 0.12 * heft + (o.finisher ? 0.08 : 0);
    // The blade has mostly swept by the moment it connects, so a hit-stop on this frame shows the arc.
    this.swings.push({
      x,
      y,
      angle,
      arc,
      range,
      color,
      age: SWEEP_SECONDS * 0.6,
      life,
      heft,
      reverse: !!o.reverse,
      finisher: !!o.finisher,
    });
    const end = o.reverse ? angle - arc / 2 : angle + arc / 2;
    const tx = x + Math.cos(end) * range;
    const ty = y + Math.sin(end) * range;
    this.burst(tx, ty, color, 3 + Math.round(heft * 5), 2.5 + heft * 2);
    if (o.finisher && arc < Math.PI * 2 - 1e-3) {
      const hx = x + Math.cos(angle) * range;
      const hy = y + Math.sin(angle) * range;
      this.ring(hx, hy, 0.5 + heft * 0.4, color, false, 0.25);
    }
    if (arc >= Math.PI * 2 - 1e-3 && heft >= 0.9) {
      this.ring(x, y, range, color, true, 0.4);
      this.burst(x, y + 0.2, 0xd6d3d1, 18, 3);
    }
  }

  beam(x: number, y: number, tx: number, ty: number, width: number, color: number): void {
    this.beams.push({ x, y, tx, ty, width, color, life: 0.22, max: 0.22 });
  }

  /** Advance and draw everything into `g` (the air layer). */
  draw(g: Graphics, dt: number, time: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
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
    }
    this.swings = this.swings.filter((s) => s.age < s.life);

    for (const b of this.beams) {
      b.life -= dt;
      const a = Math.max(0, b.life / b.max);
      const thick = Math.max(1, Math.round((b.width * 2 * a) / PX));
      manaLine(g, b.x, b.y, b.tx, b.ty, b.color, 0.75 * a, { thickness: thick, jitter: 1, time });
      manaLine(g, b.x, b.y, b.tx, b.ty, 0xffffff, 0.95 * a, { thickness: 1 });
    }
    this.beams = this.beams.filter((b) => b.life > 0);
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
