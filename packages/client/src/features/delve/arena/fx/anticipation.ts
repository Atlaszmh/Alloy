import {
  HOLD_STAGE_KINDS,
  activeMove,
  chainMove,
  holdCharge,
  holdFull,
  stepHeft,
  windupDir,
  type ArpgWorld,
  type Vec,
} from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { MANA_HEX } from '../palette';

export interface WindingUp {
  /** Toward the target (unit vector). */
  dir: Vec;
  heft: number;
  /** 0 at the press, 1 at the strike or release. */
  progress: number;
  color: number;
}

/** From the hero toward `at` (unit vector), or its facing when there. */
function toward(w: ArpgWorld, at: Vec): Vec {
  const h = w.hero;
  const dx = at.x - h.x;
  const dy = at.y - h.y;
  const len = Math.hypot(dx, dy);
  return len > 1e-6 ? { x: dx / len, y: dy / len } : { ...h.facing };
}

/**
 * The action the hero is winding up right now (a swing in its startup, an
 * ability or a hold charging), or null. A blow winds up in its own element; a
 * hold (an ability's, or a manual blow held at its strike point) gathers with
 * its charge, as heavy as the stage it has reached, toward `aim` (the aim
 * marker's point, where its release will go) while one shows; a hold blow's
 * ends as it is let go (its leap is no wind-up). A released hold's wind-up
 * carries on from what the charge already counted of it. A wind-up leans the
 * way the hero faces it (`windupDir`).
 */
export function windingUp(w: ArpgWorld, aim: Vec | null = null): WindingUp | null {
  const h = w.hero;
  const bal = getDelveRegistry().getDelveBalance();
  if (h.swing) {
    if (h.swing.released !== null) return null;
    const wpn = h.stats.weapon;
    const blow = wpn.blows[h.swing.step];
    const color = MANA_HEX[blow.element];
    if (h.swing.held !== null) {
      const { charge, stage } = holdCharge(bal, h.swing.held, w.t, holdFull(bal, h.stats.tempo));
      const heft = wpn.feel[HOLD_STAGE_KINDS[stage]].heft ?? 0.3;
      return { dir: h.swing.dir, heft, progress: charge, color };
    }
    const span = Math.max(1e-6, h.swing.strikeAt - h.swing.start);
    return {
      dir: h.swing.dir,
      heft: blow.heft ?? 0.3,
      progress: Math.min(1, Math.max(0, (w.t - h.swing.start) / span)),
      color,
    };
  }
  if (h.hold) {
    const { charge, stage } = holdCharge(bal, h.hold.start, w.t, h.hold.full);
    const ab = chainMove(h.chains[h.hold.slot], h.hold.step, stage);
    const at = aim ?? h.hold.aim;
    return {
      dir: at ? toward(w, at) : { ...h.facing },
      heft: stepHeft(ab),
      progress: charge,
      color: MANA_HEX[ab.element],
    };
  }
  if (h.windup) {
    const ab = activeMove(h, h.windup.slot);
    if (!ab) return null;
    // Out of the move's whole wind-up: a released hold's starts part-way, where its charge left it.
    const left = (h.windup.until - w.t) / Math.max(1e-6, ab.castTime);
    return {
      dir: windupDir(h, h.windup) ?? { ...h.facing },
      heft: stepHeft(ab),
      progress: Math.min(1, Math.max(0, 1 - left)),
      color: MANA_HEX[ab.element],
    };
  }
  return null;
}
