import type { ArpgEvent } from '@alloy/engine';

/** Display-only freezes on heavy hits: the rules never pause, only the display clock. */
export const HITSTOP = {
  minHeft: 0.3,
  msPerHeft: 90,
  critMs: 20,
  bigKillMs: 120,
  maxMs: 120,
  /** A new freeze waits this long after the last one ended, so a flurry doesn't stutter. */
  gapMs: 150,
} as const;

/** How long this frame's events freeze the display, in ms (0 = no freeze). */
export function hitstopMs(events: readonly ArpgEvent[]): number {
  let ms = 0;
  for (const e of events) {
    if (e.kind === 'hit' && e.heft >= HITSTOP.minHeft)
      ms = Math.max(ms, HITSTOP.msPerHeft * e.heft + (e.crit ? HITSTOP.critMs : 0));
    else if (e.kind === 'death' && e.monsterKind !== 'normal') ms = Math.max(ms, HITSTOP.bigKillMs);
  }
  return Math.min(HITSTOP.maxMs, Math.round(ms));
}

/** The freeze in progress, with the gap between freezes. */
export class HitStop {
  private until = -Infinity;

  frozen(now: number): boolean {
    return now < this.until;
  }

  onEvents(events: readonly ArpgEvent[], now: number): void {
    if (now < this.until + HITSTOP.gapMs) return;
    const ms = hitstopMs(events);
    if (ms > 0) this.until = now + ms;
  }
}
