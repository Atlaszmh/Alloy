import type { ArpgEvent } from '@alloy/engine';
import type { PixelWorld } from './world';

/** Arena units → floor cells (the floor grid includes a cliff margin). */
export function arenaToCell(
  x: number,
  y: number,
  ppu: number,
  margin: number,
): { x: number; y: number } {
  return { x: Math.round((x + margin) * ppu), y: Math.round((y + margin) * ppu) };
}

/** Replay one engine event onto the pixel floor as a visual effect. */
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
      break;
    }
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
      break;
    }
    default:
      break;
  }
}
