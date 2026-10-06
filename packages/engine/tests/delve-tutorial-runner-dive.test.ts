import { describe, it, expect } from 'vitest';
import {
  bankWorld,
  beginFloor,
  chooseDoor,
  closeDive,
  completeFloor,
  extractDive,
  failFloor,
  startDive,
} from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { alcoveOffers, stopKinds, takeStop } from '../src/delve/stops.js';
import { LESSON_UNFINISHED, skipTutorial } from '../src/delve/tutorial.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { DelveProfile } from '../src/types/delve.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';
import { onStep, script } from './fixtures/tutorial-runner.js';

// See the tutorial spec: the gates at the stops (the data's power-ups and doors, a required
// power-up, Extract only where the data says), the entry snapshot and the retry, and Abandon.

const st = (step: string, count = 0, misses = 0) => ({ step, count, misses });
const blade = generateItem(
  script,
  { uid: 'b1', ilvl: 1, rarity: 'uncommon', slot: 'weapon', baseId: 'sword', mana: 'fire' },
  new SeededRNG(9),
);
/** A guided save diving into `SCRIPT`'s first floor, a weapon in its bag. */
const diving = () => startDive(script, { ...onStep('go'), bag: [blade] }, 1);
/** `p`'s floor, its tutorial moved on to `step` (as its ticks would). */
function floorOn(p: DelveProfile, step: string): ArpgWorld {
  const w = beginFloor(script, p);
  w.tutorial = { ...st(step), tally: {} };
  return w;
}

describe('the guided dive', () => {
  it('waits while a lesson runs; a guided depth holds the profile as it entered', () => {
    expect(() => startDive(script, onStep('claim'), 1)).toThrow(LESSON_UNFINISHED);
    const p = diving();
    expect(p.tutorial).toEqual(st('walk'));
    const { tutorialEntry, ...dive } = p.dive!;
    expect(tutorialEntry).toEqual({ ...p, dive });
    const w = beginFloor(script, p);
    expect([w.tutorialFloor, w.tutorial]).toEqual(['d1-1', { ...st('walk'), tally: {} }]);
    const plain = startDive(script, createDelveProfile(script, 5, { primary: 'fire' }), 1);
    expect(plain.dive!.tutorialEntry).toBeNull();
  });

  it("banks the floor's tutorial back onto the profile", () => {
    const p = diving();
    const w = floorOn(p, 'rats');
    w.tutorial!.count = 1;
    expect(bankWorld(script, p, w).profile.tutorial).toEqual(st('rats', 1));
  });

  it('stops where the data says: its power-ups the hero can take, required, and its doors', () => {
    const p = diving();
    const stopped = completeFloor(script, p, floorOn(p, 'rats')).profile;
    expect(stopped.tutorial).toEqual(st('equip'));
    expect(stopped.dive!.stop).toEqual({
      offers: ['equip', 'upgrade'],
      taken: false,
      required: true,
    });
    expect(stopped.dive!.doorChoices).toEqual(['winding']);
    // Nothing it can take (an empty bag, no scrap): no stop, so nothing required.
    const broke = { ...p, bag: [], scrap: 0 };
    expect(completeFloor(script, broke, floorOn(broke, 'exit')).profile.dive!.stop).toBeNull();
  });

  it('holds the doors until the required power-up is taken; Extract only at a stop without doors', () => {
    const p = diving();
    const stopped = completeFloor(script, p, floorOn(p, 'exit')).profile;
    expect(() => chooseDoor(script, stopped, 'winding')).toThrow('Take the power-up first');
    expect(() => extractDive(script, stopped)).toThrow('no road home');
    const taken = takeStop(script, stopped, { kind: 'equip', uid: 'b1' });
    expect([taken.ok, taken.profile.tutorial]).toEqual([true, st('door')]);
    const next = chooseDoor(script, taken.profile, 'winding');
    expect([next.dive!.depth, next.tutorial]).toEqual([2, st('react')]);
    const { tutorialEntry, ...dive } = next.dive!;
    expect(tutorialEntry).toEqual({ ...next, dive });
    // The next floor's stop has no doors: Extract is its road, and the lesson begins.
    const home = completeFloor(script, next, floorOn(next, 'exit2')).profile;
    expect([home.tutorial, home.dive!.doorChoices]).toEqual([st('home'), []]);
    const back = extractDive(script, home);
    expect([back.dive!.phase, back.tutorial]).toEqual(['extracted', st('claim')]);
  });

  it('a death on a guided depth restarts it as it was entered: nothing lost, no death', () => {
    const p = diving();
    const w = floorOn(p, 'rats');
    w.pending.scrap = 40;
    const later = { ...p, tutorial: st('perfect'), scrap: p.scrap + 99 };
    const res = failFloor(script, later, w);
    expect(res.profile).toEqual(p);
    expect([res.scrap, res.kept]).toEqual([0, []]);
    // Skipped, the depth is an ordinary one: a death is a death.
    const dead = failFloor(script, skipTutorial(script, later), floorOn(p, 'rats')).profile;
    expect([dead.dive!.phase, dead.stats.deaths]).toEqual(['dead', 1]);
  });

  it('Abandon on a guided floor retries it, and is refused at a stop', () => {
    const p = diving();
    expect(closeDive(script, { ...p, scrap: 1, tutorial: st('rats') })).toEqual(p);
    const stopped = completeFloor(script, p, floorOn(p, 'exit')).profile;
    expect(() => closeDive(script, stopped)).toThrow('Hesta holds the stop');
    expect(closeDive(script, skipTutorial(script, stopped)).dive).toBeNull();
  });

  it('a skip at a stop lets the doors open, and the next depth is an ordinary one', () => {
    const p = diving();
    const stopped = skipTutorial(script, completeFloor(script, p, floorOn(p, 'exit')).profile);
    const next = chooseDoor(script, stopped, 'winding');
    expect([next.tutorial, next.dive!.tutorialEntry]).toEqual([null, null]);
    expect(beginFloor(script, next).tutorialFloor).toBeNull();
  });
});

describe("a guided floor's alcove", () => {
  it('offers the kinds its floor names that the hero can take, every one; skipped, as usual', () => {
    const p = { ...diving(), tutorial: st('react') };
    const w = floorWorld(twoRooms('alcove', { kind: 'alcove' }));
    w.tutorialFloor = 'd1-2';
    w.tutorial = { ...st('react'), tally: {} };
    const affordable = stopKinds(script, p);
    expect(alcoveOffers(script, p, w, '2:1')).toEqual(
      affordable.filter((k) => k === 'upgrade' || k === 'slot'),
    );
    expect(alcoveOffers(script, p, w, '2:1')).toContain('upgrade');
    w.tutorial = null;
    const usual = alcoveOffers(script, p, w, '2:1');
    expect(usual.length).toBeGreaterThanOrEqual(Math.min(2, affordable.length));
    expect(usual.every((k) => affordable.includes(k))).toBe(true);
  });
});
