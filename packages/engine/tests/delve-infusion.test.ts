import { describe, it, expect } from 'vitest';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { gear, registry } from './fixtures/arena.js';

// The fixture arena's hero starts at (13, 36), facing up (-y).

describe('the weapon infusion (display only)', () => {
  const staff = { weapon: gear('fire', 'weapon', 'staff') };

  it("comes from extra.basicInfusion; none when unarmed or the weapon's own element", () => {
    expect(computeHeroStats(staff, registry).weapon.infusion).toBeNull();
    expect(computeHeroStats(staff, registry, { basicInfusion: 'storm' }).weapon.infusion).toBe(
      'storm',
    );
    expect(computeHeroStats(staff, registry, { basicInfusion: 'fire' }).weapon.infusion).toBeNull();
    expect(computeHeroStats({}, registry, { basicInfusion: 'storm' }).weapon.infusion).toBeNull();
  });
});
