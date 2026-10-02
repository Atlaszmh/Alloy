import { describe, it, expect } from 'vitest';
import { runAutopilot } from '../src/delve/autopilot.js';
import { economySim } from '../src/delve/economy.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import { registry } from './fixtures/arena.js';

// See the crafting spec: "Engine shape → Autopilot" and the Economy view.

describe('economySim', () => {
  const report = economySim(registry, 1, 3);

  it('plays exactly the dives asked for, in order, from a new save, as the autopilot does', () => {
    expect(report.seed).toBe(1);
    expect(report.dives.map((d) => d.dive)).toEqual([1, 2, 3]);
    const run = runAutopilot(registry, { seed: 1, dives: 3 });
    expect(report.profile).toEqual(run.profile);
    expect(report.dives.map((d) => d.depth)).toEqual(run.reports.map((r) => r.endDepth));
    expect(report.dives.map((d) => d.died)).toEqual(run.reports.map((r) => r.result === 'dead'));
    expect(economySim(registry, 1, 3)).toEqual(report); // seeded: the same report
  });

  it("counts every rarity forged and a death's loss, never below zero, as plain data", () => {
    for (const d of report.dives) {
      expect(Object.keys(d.forged)).toEqual(RARITY_ORDER);
      expect(d.lost === null).toBe(!d.died);
      for (const h of [d.income, d.spent, ...(d.lost ? [d.lost] : [])]) {
        const counts = [
          h.scrap,
          h.dust,
          h.links,
          ...Object.values(h.metals),
          ...Object.values(h.flux),
        ];
        expect(Math.min(...counts)).toBeGreaterThanOrEqual(0);
      }
    }
    expect(structuredClone(report)).toEqual(report);
  });

  it('plays a forced pair', () => {
    const forced = economySim(registry, 2, 1, { primary: 'frost', secondary: 'fire' });
    expect(forced.dives).toHaveLength(1);
    expect(forced.profile.pair).toEqual({ primary: 'frost', secondary: 'fire' });
  });
});
