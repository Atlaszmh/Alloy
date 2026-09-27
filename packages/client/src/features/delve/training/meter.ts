import type { ArpgEvent, ReactionId } from '@alloy/engine';

/** DPS is measured over this many seconds of sim time. */
export const METER_WINDOW = 5;

export const METER_BUCKETS = [
  'basic',
  'q',
  'e',
  'r',
  'skill',
  'reaction',
  'dot',
  'thorns',
] as const;
export type MeterBucket = (typeof METER_BUCKETS)[number];

export const BUCKET_LABEL: Record<MeterBucket, string> = {
  basic: 'Basic attack',
  q: 'Q · Primary',
  e: 'E · Defensive',
  r: 'R · Ultimate',
  skill: 'Other skill',
  reaction: 'Reaction splash',
  dot: 'Damage over time',
  thorns: 'Thorns',
};

export interface MeterSummary {
  /** Damage per second over the last METER_WINDOW seconds of sim time. */
  dps: number;
  total: number;
  biggest: number;
  buckets: Record<MeterBucket, { hits: number; damage: number }>;
  /** Reactions set off, by name. */
  reactions: Partial<Record<ReactionId, number>>;
}

type HitEvent = Extract<ArpgEvent, { kind: 'hit' }>;
const SLOT_BUCKET: MeterBucket[] = ['q', 'e', 'r'];

/** Skill hits go to their slot (none, as Hellfire Brand's: Other skill); the rest by source. */
function bucketOf(e: HitEvent): MeterBucket {
  if (e.source !== 'skill') return e.source;
  return e.slot === undefined ? 'skill' : (SLOT_BUCKET[e.slot] ?? 'skill');
}

function emptyBuckets(): MeterSummary['buckets'] {
  return Object.fromEntries(
    METER_BUCKETS.map((b) => [b, { hits: 0, damage: 0 }]),
  ) as MeterSummary['buckets'];
}

/**
 * The Training Grounds damage meter. It only reads the fight's events. Time is
 * the world's sim time (`world.t`), so hit-stop and slow motion don't skew DPS.
 * Melt, Shatter and Soulfire multiply the hit that set them off, so their
 * damage stays in that hit's bucket.
 */
export class DamageMeter {
  private recent: { t: number; amount: number }[] = [];
  private start: number | null = null;
  private total = 0;
  private biggest = 0;
  private buckets = emptyBuckets();
  private reactions: MeterSummary['reactions'] = {};

  record(events: readonly ArpgEvent[], t: number): void {
    for (const e of events) {
      if (e.kind === 'reaction') this.reactions[e.reaction] = (this.reactions[e.reaction] ?? 0) + 1;
      if (e.kind !== 'hit') continue;
      this.start ??= t;
      this.total += e.amount;
      this.biggest = Math.max(this.biggest, e.amount);
      const b = this.buckets[bucketOf(e)];
      b.hits++;
      b.damage += e.amount;
      this.recent.push({ t, amount: e.amount });
    }
    while (this.recent.length > 0 && this.recent[0].t <= t - METER_WINDOW) this.recent.shift();
  }

  summary(t: number): MeterSummary {
    const since = t - METER_WINDOW;
    const recent = this.recent.reduce((sum, h) => (h.t > since ? sum + h.amount : sum), 0);
    // Early on, divide by the time since the first hit (at least a second), not the whole window.
    const span = this.start === null ? 1 : Math.max(1, Math.min(METER_WINDOW, t - this.start));
    return {
      dps: recent / span,
      total: this.total,
      biggest: this.biggest,
      buckets: Object.fromEntries(
        METER_BUCKETS.map((b) => [b, { ...this.buckets[b] }]),
      ) as MeterSummary['buckets'],
      reactions: { ...this.reactions },
    };
  }

  reset(): void {
    this.recent = [];
    this.start = null;
    this.total = 0;
    this.biggest = 0;
    this.buckets = emptyBuckets();
    this.reactions = {};
  }
}
