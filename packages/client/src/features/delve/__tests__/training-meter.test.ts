import { describe, it, expect } from 'vitest';
import type { ArpgEvent, HitSource } from '@alloy/engine';
import { DamageMeter } from '../training/meter';

const hit = (amount: number, source: HitSource, slot?: number): ArpgEvent => ({
  kind: 'hit',
  id: 1,
  x: 0,
  y: 0,
  amount,
  crit: false,
  element: null,
  heft: 0,
  source,
  slot,
});
const melt: ArpgEvent = { kind: 'reaction', reaction: 'melt', x: 0, y: 0 };

describe('the damage meter', () => {
  it('buckets hits by source and ability slot, and counts reactions by name', () => {
    const m = new DamageMeter();
    m.record(
      [
        hit(10, 'basic'),
        hit(20, 'skill', 0),
        hit(30, 'skill', 1),
        hit(40, 'skill', 2),
        hit(50, 'skill'),
        hit(60, 'reaction', 0),
        hit(70, 'dot', 2),
        hit(80, 'thorns'),
        melt,
        melt,
      ],
      1,
    );
    const s = m.summary(1);
    expect(s.buckets).toEqual({
      basic: { hits: 1, damage: 10 },
      q: { hits: 1, damage: 20 },
      e: { hits: 1, damage: 30 },
      r: { hits: 1, damage: 40 },
      skill: { hits: 1, damage: 50 },
      reaction: { hits: 1, damage: 60 },
      dot: { hits: 1, damage: 70 },
      thorns: { hits: 1, damage: 80 },
    });
    expect(s.total).toBe(360);
    expect(s.biggest).toBe(80);
    expect(s.reactions).toEqual({ melt: 2 });
  });

  it('measures DPS over the last 5 s of sim time', () => {
    const m = new DamageMeter();
    m.record([hit(100, 'basic')], 1);
    m.record([hit(100, 'basic')], 4);
    expect(m.summary(4).dps).toBeCloseTo(200 / 3); // 3 s since the first hit
    expect(m.summary(7).dps).toBeCloseTo(100 / 5); // the t = 1 hit has left the window
    expect(m.summary(10).dps).toBe(0);
    expect(m.summary(10).total).toBe(200);
  });

  it('reset starts over', () => {
    const m = new DamageMeter();
    m.record([hit(100, 'basic'), melt], 1);
    m.reset();
    expect(m.summary(2)).toMatchObject({ dps: 0, total: 0, biggest: 0, reactions: {} });
    expect(m.summary(2).buckets.basic).toEqual({ hits: 0, damage: 0 });
  });
});
