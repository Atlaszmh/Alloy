import type { CombatEvent, DuelResult, CombatLog } from '../types/combat.js';

export interface CombatLogBuilder {
  frames: { time: number; events: CombatEvent[] }[];
  addEvent(time: number, event: CombatEvent): void;
  finalize(result: DuelResult): CombatLog;
}

/**
 * Create a combat log builder that accumulates events by time
 * and finalizes into a frozen CombatLog.
 */
export function createCombatLog(seed: number): CombatLogBuilder {
  const timeMap = new Map<number, CombatEvent[]>();
  const frames: { time: number; events: CombatEvent[] }[] = [];

  return {
    frames,
    addEvent(time: number, event: CombatEvent): void {
      // Snap to clean 0.1s to avoid floating-point drift
      const snapped = Math.round(time * 10) / 10;
      let bucket = timeMap.get(snapped);
      if (!bucket) {
        bucket = [];
        timeMap.set(snapped, bucket);
        frames.push({ time: snapped, events: bucket });
      }
      bucket.push(event);
    },
    finalize(result: DuelResult): CombatLog {
      return Object.freeze({
        seed,
        frames: [...frames],
        result: { ...result },
      }) as CombatLog;
    },
  };
}
