import { describe, it, expect } from 'vitest';
import { createFloorWorld, refreshWorldHero } from '../src/arpg/world.js';
import { applyBuffs, computeHeroStats, manaPool } from '../src/delve/hero-stats.js';
import type { Buff } from '../src/types/floor-map.js';
import { DEFAULT_CHAINS, arena, dummy, gear, registry, run } from './fixtures/arena.js';

// See the floor maps spec: "Shrine (sanctum room)" and its stats.

const VIGOR: Buff = { shrine: 'vigor', effect: { damage: 0.2 } };
const CLARITY: Buff = { shrine: 'clarity', effect: { manaRegen: 0.5 } };
const RENEWAL: Buff = { shrine: 'renewal', effect: { lifeRegen: 0.01 } };
const DEVOTION: Buff = { shrine: 'devotion', effect: { damage: 0.1, find: 50 } };
const STATS = computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry);

/** The fixture's floor (depth 2, no foes), the hero wearing `diveBuffs`. */
function blessed(diveBuffs: Buff[]) {
  return createFloorWorld(registry, {
    ...{ depth: 2, door: null, stats: STATS, chains: DEFAULT_CHAINS, heroHpFrac: 1, potions: 3 },
    ...{ phoenixAvailable: true, seed: 77, empty: true, diveBuffs },
    loot: {
      ...{ nextUid: 100, find: 10, legendaryBoost: 1, firstEssence: false },
      ...{ patterns: [], dropsGiven: [], pair: [] },
    },
  });
}

describe('applyBuffs', () => {
  it('multiplies damage and mana regen and adds life regen; no blessing leaves the stats as they are', () => {
    expect(applyBuffs(STATS, [])).toBe(STATS);
    const s = applyBuffs(STATS, [VIGOR, CLARITY, RENEWAL, DEVOTION]);
    expect(s.damageMult).toBeCloseTo(STATS.damageMult * 1.2 * 1.1, 12);
    expect(s.manaRegenMult).toBeCloseTo(STATS.manaRegenMult * 1.5, 12);
    expect(s.lifeRegen).toBeCloseTo(0.01, 12);
    expect({ ...s, damageMult: 0, manaRegenMult: 0, lifeRegen: 0 }).toEqual({
      ...STATS,
      damageMult: 0,
      manaRegenMult: 0,
      lifeRegen: 0,
    });
  });
});

describe("the hero's blessings", () => {
  it("wears the dive's from the start: its stats, its pool and the floor's Find", () => {
    const w = blessed([DEVOTION, CLARITY]);
    const h = w.hero;
    expect(h.diveBuffs).toEqual([DEVOTION, CLARITY]);
    expect(h.floorBuffs).toEqual([]);
    expect(h.stats).toBe(h.baseStats);
    expect(h.stats.damageMult).toBeCloseTo(STATS.damageMult * 1.1, 12);
    expect(h.manaRegen).toBeCloseTo(manaPool(applyBuffs(STATS, [CLARITY]), registry).regen, 12);
    expect(w.loot.find).toBe(60);
    expect(blessed([]).hero.stats).toBe(STATS);
  });

  it("a refresh puts the dive's and the floor's blessings back on its new gear", () => {
    const w = blessed([DEVOTION]);
    const h = w.hero;
    h.floorBuffs = [VIGOR];
    refreshWorldHero(registry, w, STATS, DEFAULT_CHAINS);
    expect(h.baseStats.damageMult).toBeCloseTo(STATS.damageMult * 1.1, 12);
    expect(h.stats.damageMult).toBeCloseTo(STATS.damageMult * 1.1 * 1.2, 12);
  });

  it("a blessing's life regen heals", () => {
    const w = arena([dummy(2, 2)], { noBasic: true });
    w.hero.floorBuffs = [RENEWAL];
    w.hero.stats = applyBuffs(w.hero.baseStats, w.hero.floorBuffs);
    w.hero.hp = w.hero.stats.maxHp / 2;
    run(w, 1);
    expect(w.hero.hp).toBeCloseTo(w.hero.stats.maxHp * 0.51, 6);
  });
});
