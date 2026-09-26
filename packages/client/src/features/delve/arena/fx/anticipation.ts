import { stepHeft, type ArpgWorld, type Vec } from '@alloy/engine';
import { MANA_HEX } from '../palette';

export interface WindingUp {
  /** Toward the target (unit vector). */
  dir: Vec;
  heft: number;
  /** 0 at the press, 1 at the strike or release. */
  progress: number;
  color: number;
}

/** The action the hero is winding up right now (a committed swing or an ability), or null. */
export function windingUp(w: ArpgWorld): WindingUp | null {
  const h = w.hero;
  if (h.swing?.committed) {
    const s = h.stats.weapon.combo[h.swing.step];
    const span = Math.max(1e-6, h.swing.strikeAt - h.swing.start);
    return {
      dir: h.swing.dir,
      heft: s?.heft ?? 0.3,
      progress: Math.min(1, Math.max(0, (w.t - h.swing.start) / span)),
      color: h.stats.weapon.element ? MANA_HEX[h.stats.weapon.element] : 0xd4a834,
    };
  }
  if (h.windup) {
    const ab = h.abilities[h.windup.slot];
    if (!ab) return null;
    const dx = h.windup.at.x - h.x;
    const dy = h.windup.at.y - h.y;
    const len = Math.hypot(dx, dy);
    const span = Math.max(1e-6, h.windup.until - h.windup.start);
    return {
      dir: len > 1e-6 ? { x: dx / len, y: dy / len } : { ...h.facing },
      heft: stepHeft(ab, h.windup.step),
      progress: Math.min(1, Math.max(0, (w.t - h.windup.start) / span)),
      color: MANA_HEX[ab.element],
    };
  }
  return null;
}
