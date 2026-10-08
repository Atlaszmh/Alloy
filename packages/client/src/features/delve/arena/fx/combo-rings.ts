import type { Graphics } from 'pixi.js';
import { chainProgress, type ArpgWorld, type DelveBalance, type MoveKind } from '@alloy/engine';
import { MANA_HEX } from '../palette';
import { PX, px, snap } from './mana-pixels';

/**
 * The combo rings: one arc per chain round the hero's feet (the basic attack's
 * innermost, then the Primary, Defensive and Ultimate outward), on the ground in
 * front of it so the sprite never hides them. Pixel art at the sprites' density:
 * each arc a faint dotted track, each move a gem in a straight row at its
 * bottom, centred under the hero, read left to right as move 1 to n, coloured by its element and sized
 * by its kind (light a dot, medium a diamond, heavy a block, a hold a capsule;
 * at most 3 pixels tall, so the rows never touch), with the sprites'
 * dark outline and a highlight pixel. The next move is a gem whose highlight
 * blinks; the string's used moves are gems that dither away as its restart
 * window drains; the moves still to come are empty sockets; a move just used
 * flashes white and throws a spark.
 */

/** The innermost arc's radius, the step out to each next one, and the arcs' squash (the floor's tilt). */
const R0 = 0.95;
const STEP = 0.55;
const SQUASH = 0.85;
/** Gems sit this far apart (world units), in a row at their arc's bottom, centred under the hero. */
const PITCH = 0.6;
/** The arc spans the front of the hero from ARC_FROM (its left) to ARC_TO (its right), in radians. */
const ARC_FROM = Math.PI * 0.94;
const ARC_TO = Math.PI * 0.06;
/** Seconds a used move shows white, and its spark flies. */
const FLASH = 0.07;
const SPARK = 0.3;
const OUTLINE = 0x0b0b12;
const TRACK = 0x3b3552;

/** Each kind's gem, rows top to bottom (`#` filled). */
const GEMS: Record<MoveKind, string[]> = {
  light: ['##', '##'],
  medium: ['.#.', '###', '.#.'],
  heavy: ['###', '###', '###'],
  hold: ['.##.', '####', '.##.'],
};

/** A gem's filled cells, its outline (the filled cells' 8 neighbours) and its highlight cell. */
interface GemShape {
  w: number;
  h: number;
  fill: [number, number][];
  outline: [number, number][];
  shine: [number, number];
}

function shapeOf(rows: string[]): GemShape {
  const fill: [number, number][] = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && fill.push([x, y])));
  const filled = new Set(fill.map(([x, y]) => `${x},${y}`));
  const seen = new Set<string>();
  const outline: [number, number][] = [];
  for (const [x, y] of fill)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = `${x + dx},${y + dy}`;
        if (filled.has(k) || seen.has(k)) continue;
        seen.add(k);
        outline.push([x + dx, y + dy]);
      }
  return { w: rows[0].length, h: rows.length, fill, outline, shine: fill[0] };
}

const SHAPES = Object.fromEntries(
  Object.entries(GEMS).map(([kind, rows]) => [kind, shapeOf(rows)]),
) as Record<MoveKind, GemShape>;

type GemState = 'flash' | 'next' | 'used' | 'empty';

interface Pip {
  element: keyof typeof MANA_HEX;
  kind: MoveKind;
}

export class ComboRings {
  /** Per chain: the next move last frame, and the move just used with its flash's start. */
  private seen = new Map<string, { next: number; flash: number; at: number }>();

  /** Redraws `g` (cleared first). */
  draw(g: Graphics, w: ArpgWorld, bal: DelveBalance, time: number): void {
    g.clear();
    const h = w.hero;
    if (w.heroDead) return;
    const cx = h.x;
    const cy = h.y + 0.42;
    // The next move's highlight blinks off one frame in three (at 12 frames a second).
    const blink = Math.floor(time * 12) % 3 !== 0;
    chainProgress(h, w.t, bal).forEach((c, ring) => {
      const pips: Pip[] =
        c.slot === 'basic'
          ? h.stats.weapon.blows.map((b) => ({ element: b.element, kind: b.kind }))
          : h.chains[c.slot]!.moves.map((m) => ({ element: m.element, kind: m.kind }));
      const key = String(c.slot);
      const was = this.seen.get(key);
      // A move just used moves the next one on with its window full; a lapsed window doesn't flash.
      if (was && was.next !== c.next && c.left > 0.9)
        this.seen.set(key, { next: c.next, flash: (c.next - 1 + c.length) % c.length, at: time });
      else if (!was || was.next !== c.next) this.seen.set(key, { next: c.next, flash: -1, at: 0 });
      const { flash, at } = this.seen.get(key)!;
      const since = flash >= 0 ? time - at : Infinity;

      const r = R0 + ring * STEP;
      const on = (a: number) => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * SQUASH });
      // The track: every other pixel along the arc.
      const n = Math.round(((ARC_FROM - ARC_TO) * r) / PX);
      for (let i = 0; i <= n; i += 2) {
        const p = on(ARC_FROM + ((ARC_TO - ARC_FROM) * i) / n);
        px(g, p.x, p.y, TRACK, 0.6);
      }
      // The gems, PITCH apart in a straight row at the arc's bottom, centred under the hero.
      const bottom = on(Math.PI / 2);
      pips.forEach((pip, i) => {
        const p = { x: cx + (i - (pips.length - 1) / 2) * PITCH, y: bottom.y };
        const shape = SHAPES[pip.kind];
        const ox = snap(p.x) - Math.floor(shape.w / 2) * PX;
        const oy = snap(p.y) - Math.floor(shape.h / 2) * PX;
        const color = MANA_HEX[pip.element];
        const state: GemState =
          i === flash && since < FLASH
            ? 'flash'
            : i === c.next
              ? 'next'
              : c.left > 0 && i < c.next
                ? 'used'
                : 'empty';
        gem(g, ox, oy, shape, color, state, c.left, blink);
        if (i === flash && since < SPARK)
          spark(g, ox + (shape.w * PX) / 2, oy + (shape.h * PX) / 2, color, since / SPARK);
      });
    });
  }
}

/** Whether a used gem's cell at grid (gx, gy) still shows with `left` of its window: all, half, a quarter. */
function dithered(gx: number, gy: number, left: number): boolean {
  if (left > 0.66) return true;
  if (left > 0.33) return (gx + gy) % 2 === 0;
  return gx % 2 === 0 && gy % 2 === 0;
}

function gem(
  g: Graphics,
  ox: number,
  oy: number,
  s: GemShape,
  color: number,
  state: GemState,
  left: number,
  blink: boolean,
): void {
  const at = (x: number, y: number) => ({ x: ox + x * PX, y: oy + y * PX });
  if (state === 'empty') {
    // An empty socket: its outline in the move's colour, dark inside.
    for (const [x, y] of s.outline) {
      const p = at(x, y);
      px(g, p.x, p.y, color, 0.55);
    }
    for (const [x, y] of s.fill) {
      const p = at(x, y);
      px(g, p.x, p.y, OUTLINE, 0.7);
    }
    return;
  }
  for (const [x, y] of s.outline) {
    const p = at(x, y);
    px(g, p.x, p.y, OUTLINE, 0.9);
  }
  for (const [x, y] of s.fill) {
    const p = at(x, y);
    if (state === 'flash') px(g, p.x, p.y, 0xffffff, 1);
    else if (state === 'next') px(g, p.x, p.y, color, 1);
    else if (dithered(Math.round(p.x / PX), Math.round(p.y / PX), left))
      px(g, p.x, p.y, color, 0.85);
  }
  if (state === 'next' && blink) {
    const p = at(s.shine[0], s.shine[1]);
    px(g, p.x, p.y, 0xffffff, 1);
  }
}

/** Four pixels flying diagonally off a used gem's centre, white then its colour, fading by `k` (0..1). */
function spark(g: Graphics, x: number, y: number, color: number, k: number): void {
  const d = 0.12 + k * 0.35;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    px(g, x + sx * d, y + sy * d * SQUASH, k < 0.3 ? 0xffffff : color, 1 - k);
}
