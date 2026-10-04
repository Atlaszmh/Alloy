import { describe, it, expect } from 'vitest';
import { stepWorld } from '../src/arpg/step.js';
import type { ArpgEvent, ArpgInput, ArpgWorld } from '../src/types/arpg.js';
import { STEP } from './fixtures/arena.js';
import { builtWorld, TEST_FLOOR, withFloors } from './fixtures/tutorial-floors.js';

// See the tutorial spec's "Hand-built floors": a `slamOnly` foe holds its ground and only slams,
// on a fixed cadence with a long telegraph, never chasing.

const registry = withFloors(TEST_FLOOR);

/** The test floor with only its slamOnly beetle, the hero in its den at (x, y). */
function den(x: number, y: number): ArpgWorld {
  const w = builtWorld(registry, 't-1');
  w.monsters = w.monsters.filter((m) => m.script === 'slamOnly');
  Object.assign(w.hero, { x, y });
  return w;
}
/** `seconds` of the world under `input`; its events. */
function run(w: ArpgWorld, seconds: number, input: ArpgInput = { move: { x: 0, y: 0 } }) {
  const events: ArpgEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++)
    events.push(...stepWorld(registry, w, input, STEP));
  return events;
}
const slams = (events: ArpgEvent[]) => events.filter((e) => e.kind === 'explode');

describe('a slamOnly foe', () => {
  it('slams where the hero stands, a long telegraph, every few seconds, and never moves', () => {
    const w = den(6.5, 3.5);
    const [brute] = w.monsters;
    run(w, STEP);
    const [zone] = w.zones;
    expect(zone).toMatchObject({ owner: 'monster', x: 6.5, y: 3.5, radius: 2.2 });
    expect([zone.detonateAt - w.t, zone.damage, brute.windupUntil - w.t]).toEqual([
      expect.closeTo(1.5),
      2 * brute.damage,
      expect.closeTo(1.5),
    ]);
    const events = run(w, 9);
    expect(slams(events).length).toBe(3);
    expect(events.filter((e) => e.kind === 'heroHit' && e.amount > 0).length).toBe(3);
    expect([brute.x, brute.y]).toEqual([9.5, 4.5]);
  });

  it('waits where it stands while the hero is out of its reach', () => {
    const w = den(22.5, 4.5);
    w.monsters[0].aggro = true;
    run(w, 4);
    expect(w.zones).toEqual([]);
    expect([w.monsters[0].x, w.monsters[0].y]).toEqual([9.5, 4.5]);
  });

  it('a dodge just before the slam lands is a perfect dodge', () => {
    const w = den(6.5, 3.5);
    run(w, 1.4);
    const events = [
      ...stepWorld(registry, w, { move: { x: -1, y: 0 }, dodge: true }, STEP),
      ...run(w, 0.3),
    ];
    expect(events.filter((e) => e.kind === 'perfectDodge').length).toBe(1);
    expect(w.hero.hp).toBe(w.hero.stats.maxHp);
  });
});
