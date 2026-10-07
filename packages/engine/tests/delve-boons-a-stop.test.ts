import { describe, it, expect } from 'vitest';
import { stepWorld } from '../src/arpg/step.js';
import { DelveDataSchema } from '../src/data/schemas.js';
import delveData from '../src/data/delve.json';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { rollStop, takeAlcove, takeStop } from '../src/delve/stops.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile, DiveStop } from '../src/types/delve.js';
import { STEP, registry } from './fixtures/arena.js';
import { armed } from './fixtures/carries.js';
import { onMap, twoRooms } from './fixtures/flow-map.js';

// See the boons spec, "4. The stop": a stop is a `boons` stop or a `powerups` one. In Phase A
// every stop still rolls power-ups and a `boon` action is refused (B1 fills both).

const ring = generateItem(
  registry,
  { uid: 'r1', ilvl: 2, rarity: 'magic', slot: 'ring', mana: 'fire' },
  new SeededRNG(1),
);
const hero = (): DelveProfile => ({
  ...armed(registry, createDelveProfile(registry, 3, { primary: 'fire' })),
  bag: [ring],
  scrap: 1000,
});
/** `p` diving, on the door screen after depth 1, holding `stop`. */
function atStop(p: DelveProfile, stop: DiveStop | null): DelveProfile {
  const dive = startDive(registry, p, 1).dive!;
  return {
    ...p,
    dive: { ...dive, phase: 'choosing', depthsCleared: 1, doorChoices: ['winding'], stop },
  };
}
const BOONS: DiveStop = { kind: 'boons', offers: [{ id: 'vigor', tier: 1 }], taken: false };

describe('the stop union', () => {
  it("rolls a 'powerups' stop", () => {
    const p = hero();
    expect(rollStop(registry, p, startDive(registry, p, 1).dive!)).toMatchObject({
      kind: 'powerups',
      taken: false,
    });
  });

  it("refuses a boon on either kind of stop, and a power-up on a 'boons' stop", () => {
    const refused = { ok: false, reason: 'Not offered at this stop' };
    const powerups = atStop(hero(), { kind: 'powerups', offers: ['equip'], taken: false });
    expect(takeStop(registry, powerups, { kind: 'boon', index: 0 })).toMatchObject(refused);
    const boons = atStop(hero(), BOONS);
    expect(takeStop(registry, boons, { kind: 'boon', index: 0 })).toMatchObject(refused);
    expect(takeStop(registry, boons, { kind: 'equip', uid: 'r1' })).toMatchObject(refused);
    expect(takeStop(registry, powerups, { kind: 'equip', uid: 'r1' }).ok).toBe(true);
  });

  it('an alcove refuses a boon', () => {
    const p = startDive(registry, hero(), 1);
    const w = onMap(beginFloor(registry, p), twoRooms('alcove', { kind: 'alcove' }, 1));
    w.monsters = [];
    Object.assign(w.hero, { x: 19, y: 7 });
    stepWorld(registry, w, { move: { x: 0, y: 0 }, interact: true }, STEP);
    expect(takeAlcove(registry, p, w, { kind: 'boon', index: 0 })).toMatchObject({
      ok: false,
      reason: 'Not offered at this anvil',
    });
  });

  it("a save keeps either kind, and a door's boons", () => {
    const door = { ...registry.getDoor('winding'), mods: { boons: 0.5 } };
    for (const stop of [
      BOONS,
      { kind: 'powerups', offers: ['slot'], taken: true, required: true },
    ] as DiveStop[]) {
      const p = atStop(hero(), stop);
      const saved = { ...p, dive: { ...p.dive!, door } };
      const parsed = parseDelveProfile(registry, JSON.parse(JSON.stringify(saved)));
      expect(parsed && 'profile' in parsed ? parsed.profile.dive : null).toMatchObject({
        stop,
        door,
      });
    }
  });

  it("delve.json's doors may carry boons", () => {
    const withBoons = structuredClone(delveData);
    withBoons.doors[0].mods = { ...withBoons.doors[0].mods, boons: 0.5 } as never;
    const parsed = DelveDataSchema.parse(withBoons);
    expect(parsed.doors[0].mods.boons).toBe(0.5);
  });
});
