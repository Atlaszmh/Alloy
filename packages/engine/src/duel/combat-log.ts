import type { TickEvent, DuelResult, CombatLog } from '../types/combat.js';

export interface CombatLogBuilder {
  ticks: { tick: number; events: TickEvent[] }[];
  addEvent(tick: number, event: TickEvent): void;
  finalize(result: DuelResult): CombatLog;
}

/**
 * Create a combat log builder that accumulates tick events
 * and finalizes into a frozen CombatLog.
 */
export function createCombatLog(seed: number): CombatLogBuilder {
  const tickMap = new Map<number, TickEvent[]>();
  const ticks: { tick: number; events: TickEvent[] }[] = [];

  return {
    ticks,
    addEvent(tick: number, event: TickEvent): void {
      let bucket = tickMap.get(tick);
      if (!bucket) {
        bucket = [];
        tickMap.set(tick, bucket);
        ticks.push({ tick, events: bucket });
      }
      bucket.push(event);
    },
    finalize(result: DuelResult): CombatLog {
      return Object.freeze({
        seed,
        ticks: [...ticks],
        result: { ...result },
      }) as CombatLog;
    },
  };
}
