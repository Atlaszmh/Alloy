import { describe, it, expect } from 'vitest';
import { stepWorld } from '../src/arpg/step.js';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { applyBuffs } from '../src/delve/hero-stats.js';
import { diveStats, profileStats } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { takeAlcove } from '../src/delve/stops.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { Buff } from '../src/types/boon.js';
import type { DelveProfile } from '../src/types/delve.js';
import { STEP, registry } from './fixtures/arena.js';
import { onMap, twoRooms } from './fixtures/flow-map.js';

// See the boons spec, "2a. Knobs and attunement": `diveStats` is `profileStats` plus the dive
// boons' attunement (by role, against the pair) and their knob partials; the fight's paths
// (`beginFloor`, `takeAlcove`) wear it, while `profileStats` never sees a boon.

const PURE: Buff = {
  boon: 'pure_flame',
  tier: 1,
  effect: { attune: { role: 'primary', points: 4 } },
};
const SECOND: Buff = {
  boon: 'second_flame',
  tier: 2,
  effect: { attune: { role: 'secondary', points: 6 } },
};
const ECHO: Buff = { boon: 'echo', tier: 1, effect: { knobs: { echo: 0.15 } } };

const ring = generateItem(
  registry,
  { uid: 'r1', ilvl: 2, rarity: 'magic', slot: 'ring', mana: 'fire' },
  new SeededRNG(1),
);
/** A Fire hero (Frost bound when `bound`) diving at depth 1, wearing `buffs`, a ring in its bag. */
function diving(buffs: Buff[], bound = true): DelveProfile {
  const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
  const pair = { primary: 'fire' as const, secondary: bound ? ('frost' as const) : null };
  const p = startDive(registry, { ...p0, pair, bag: [ring], scrap: 1000 }, 1);
  return { ...p, dive: { ...p.dive!, diveBuffs: buffs } };
}

describe('diveStats', () => {
  it("is profileStats with no dive or no boons, and profileStats ignores the dive's boons", () => {
    const p = diving([PURE, SECOND, ECHO]);
    expect(diveStats(registry, { ...p, dive: null })).toEqual(profileStats(registry, p));
    expect(diveStats(registry, diving([]))).toEqual(profileStats(registry, p));
  });

  it("adds each role's points to that element of the pair, and lists the knobs", () => {
    const p = diving([PURE, SECOND, ECHO, PURE]);
    const real = profileStats(registry, p);
    const s = diveStats(registry, p);
    expect(s.attunement.fire).toBe(real.attunement.fire + 8);
    expect(s.attunement.frost).toBe(real.attunement.frost + 6);
    expect(s.attunement.storm).toBe(0);
    expect(s.boonKnobs).toEqual([{ echo: 0.15 }]);
    expect(s.weapon.blows.every((b) => b.knobs.echo === 0.15)).toBe(true);
    const perAttune = registry.getDelveBalance().pair.basicPowerPerAttune;
    const blow = s.weapon.blows[0];
    expect(blow.attunePower).toBeCloseTo(1 + perAttune * s.attunement[blow.element], 12);
  });

  it('gives a secondary boon to the primary while no secondary is bound', () => {
    const p = diving([SECOND], false);
    expect(diveStats(registry, p).attunement.fire).toBe(
      profileStats(registry, p).attunement.fire + 6,
    );
  });
});

describe("the fight's paths wear diveStats", () => {
  it('beginFloor', () => {
    const p = diving([PURE, ECHO]);
    const w = beginFloor(registry, p);
    expect(w.hero.baseStats).toEqual(applyBuffs(diveStats(registry, p), p.dive!.diveBuffs));
  });

  it("takeAlcove's refresh", () => {
    const p = diving([PURE, ECHO]);
    const w = onMap(beginFloor(registry, p), twoRooms('alcove', { kind: 'alcove' }, 1));
    w.monsters = [];
    Object.assign(w.hero, { x: 19, y: 7 });
    stepWorld(registry, w, { move: { x: 0, y: 0 }, interact: true }, STEP);
    const res = takeAlcove(registry, p, w, { kind: 'equip', uid: 'r1' });
    expect(res.ok).toBe(true);
    expect(w.hero.baseStats).toEqual(
      applyBuffs(diveStats(registry, res.profile), w.hero.diveBuffs),
    );
    expect(w.hero.baseStats.attunement.fire).toBe(
      profileStats(registry, res.profile).attunement.fire + 4,
    );
  });
});
