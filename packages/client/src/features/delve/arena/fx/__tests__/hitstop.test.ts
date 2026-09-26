import { describe, it, expect } from 'vitest';
import type { ArpgEvent } from '@alloy/engine';
import { HITSTOP, HitStop, hitstopMs } from '../hitstop';

const hit = (heft: number, crit = false): ArpgEvent =>
  ({ kind: 'hit', id: 1, x: 0, y: 0, amount: 1, crit, element: null, heft }) as ArpgEvent;
const death = (monsterKind: 'normal' | 'elite' | 'boss'): ArpgEvent =>
  ({ kind: 'death', id: 1, x: 0, y: 0, monsterKind, scrap: 0 }) as ArpgEvent;

describe('hit-stop', () => {
  it('scales with the heaviest direct hit, ignores light ones, adds for crits and big kills', () => {
    expect(hitstopMs([hit(0.2)])).toBe(0);
    expect(hitstopMs([hit(0.5), hit(0.2)])).toBe(45);
    expect(hitstopMs([hit(0.5, true)])).toBe(65);
    expect(hitstopMs([death('normal')])).toBe(0);
    expect(hitstopMs([death('elite')])).toBe(HITSTOP.bigKillMs);
    expect(hitstopMs([hit(1, true), death('boss')])).toBe(HITSTOP.maxMs);
  });

  it('freezes, then waits a gap before the next freeze', () => {
    const s = new HitStop();
    s.onEvents([hit(1)], 1000);
    expect(s.frozen(1050)).toBe(true);
    expect(s.frozen(1100)).toBe(false);
    s.onEvents([hit(1)], 1150);
    expect(s.frozen(1160)).toBe(false);
    s.onEvents([hit(1)], 1000 + 90 + HITSTOP.gapMs + 1);
    expect(s.frozen(1000 + 90 + HITSTOP.gapMs + 10)).toBe(true);
  });
});
