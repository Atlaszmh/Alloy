import type { ArpgEvent, ManaType } from '@alloy/engine';
import { MAX_PARTICLES, type PixelWorld } from './world';

/** Arena units → floor cells (the floor grid includes a cliff margin). */
export function arenaToCell(
  x: number,
  y: number,
  ppu: number,
  margin: number,
): { x: number; y: number } {
  return { x: Math.round((x + margin) * ppu), y: Math.round((y + margin) * ppu) };
}

type Cell = { x: number; y: number };

const TAU = Math.PI * 2;

/** An infusion marks a path once per this many cells… */
const STAMP_SPACING = 5;
/**
 * …at most this many times per event (spread evenly, never cut off). Each
 * stamp is a full brush with its own burst: 12 per lance kept ~3,500 floor
 * particles alive under a fire or earth Lance's spam (half the cap); 8 keeps ~2,600.
 */
export const MAX_STAMPS = 8;

/** Each infusion element's brush (radius in cells). Storm draws one arc through the stamps instead. */
const BRUSH: Record<Exclude<ManaType, 'storm'>, (pw: PixelWorld, c: Cell) => void> = {
  nature: (pw, c) => pw.sprout(c.x, c.y, 3),
  frost: (pw, c) => pw.frostBlast(c.x, c.y, 2),
  fire: (pw, c) => pw.fireBlast(c.x, c.y, 2),
  earth: (pw, c) => pw.earthImpact(c.x, c.y, 2),
  shadow: (pw, c) => pw.shadowBlast(c.x, c.y, 2),
};

/**
 * Stamps along a path `len` cells long: one per 5 cells, 2 to 8, from t = 0
 * to t = 1. A closed path (a 360° slam, a blast's rim) spaces them k / n, so
 * its two ends don't stamp the same place twice.
 */
function along(len: number, at: (t: number) => Cell, closed = false): Cell[] {
  const n = Math.min(MAX_STAMPS, Math.max(2, Math.floor(len / STAMP_SPACING) + 1));
  return Array.from({ length: n }, (_, k) => at(k / (closed ? n : n - 1)));
}

/** Stamps along the straight path a → b. */
function line(a: Cell, b: Cell): Cell[] {
  return along(Math.hypot(b.x - a.x, b.y - a.y), (t) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }));
}

/**
 * Mark the floor with an infusion's brush at each cell (storm: one arc through
 * them, closed for a ring). Every brush but nature's spawns particles, so they
 * stop while the floor holds more than half its cap: at the cap the floor drops
 * weather, hit sparks, splashes and death bursts instead.
 */
function stamp(pw: PixelWorld, element: ManaType, cells: Cell[], closed = false): void {
  // ponytail: a flat soft cap at half the particles; per-brush costs or a stamp budget if marks vanish in real fights.
  if (element !== 'nature' && pw.particleCount > MAX_PARTICLES / 2) return;
  if (element === 'storm') pw.stormArc(closed ? [...cells, cells[0]] : cells);
  else for (const c of cells) BRUSH[element](pw, c);
}

/**
 * Replay one engine event onto the pixel floor as a visual effect. An
 * infusion also marks the floor with its element: along an infused lance,
 * slash or blink trail, and round an infused blast's rim (after the body's
 * own brush, so the body keeps its core). Basic swings never reach here.
 */
export function applyArenaEvent(pw: PixelWorld, e: ArpgEvent, ppu: number, margin: number): void {
  switch (e.kind) {
    case 'explode': {
      const c = arenaToCell(e.x, e.y, ppu, margin);
      const r = Math.max(3, Math.min(24, e.radius * ppu));
      switch (e.element) {
        case 'fire':
          pw.fireBlast(c.x, c.y, r);
          break;
        case 'frost':
          pw.frostBlast(c.x, c.y, r);
          break;
        case 'storm':
          pw.stormBlast(c.x, c.y, r);
          break;
        case 'earth':
          pw.earthImpact(c.x, c.y, Math.max(4, r * 0.8));
          break;
        case 'shadow':
          pw.shadowBlast(c.x, c.y, r);
          break;
        default:
          // Monster slams crack the ground.
          pw.earthImpact(c.x, c.y, Math.max(4, r * 0.6));
      }
      if (e.infusion) {
        const rim = along(
          TAU * r,
          (t) => ({ x: c.x + Math.cos(TAU * t) * r, y: c.y + Math.sin(TAU * t) * r }),
          true,
        );
        stamp(pw, e.infusion, rim, true);
      }
      break;
    }
    case 'beam':
      // Not under the hero's feet, where every cast would pile its marks up.
      if (e.infusion)
        stamp(
          pw,
          e.infusion,
          line(arenaToCell(e.x, e.y, ppu, margin), arenaToCell(e.tx, e.ty, ppu, margin)).slice(1),
        );
      break;
    case 'slash':
      if (e.infusion) {
        const c = arenaToCell(e.x, e.y, ppu, margin);
        const r = e.range * ppu;
        const round = e.arc >= 360;
        const span = (Math.min(360, e.arc) * Math.PI) / 180;
        const from = Math.atan2(e.dir.y, e.dir.x) - span / 2;
        const cells = along(
          r * span,
          (t) => ({
            x: c.x + Math.cos(from + span * t) * r,
            y: c.y + Math.sin(from + span * t) * r,
          }),
          round,
        );
        stamp(pw, e.infusion, cells, round);
      }
      break;
    case 'chain':
      pw.stormArc(e.points.map((p) => arenaToCell(p.x, p.y, ppu, margin)));
      break;
    case 'hit': {
      const c = arenaToCell(e.x, e.y, ppu, margin);
      pw.hitSpark(c.x, c.y, e.element);
      break;
    }
    case 'death': {
      const c = arenaToCell(e.x, e.y, ppu, margin);
      pw.soulBurst(c.x, c.y, e.monsterKind === 'boss');
      break;
    }
    case 'dash': {
      const a = arenaToCell(e.fromX, e.fromY, ppu, margin);
      const b = arenaToCell(e.toX, e.toY, ppu, margin);
      const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let s = 0; s <= steps; s++) {
        pw.hitSpark(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps, 'shadow');
      }
      pw.shadowBlast(b.x, b.y, 5);
      if (e.infusion) stamp(pw, e.infusion, line(a, b));
      break;
    }
    default:
      break;
  }
}
