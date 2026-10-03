import { describe, it, expect } from 'vitest';
import type { BotPolicy } from '../src/arpg/bot.js';
import { stepWorld } from '../src/arpg/step.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { botStep, takeBestAlcove } from '../src/delve/autopilot.js';
import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { DelveProfile } from '../src/types/delve.js';
import { STEP, bal, dummy, registry } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';
import { walledMap } from './fixtures/maps.js';

// The bot on generated floors (see the floor maps spec's "The autopilot and pacing").

/** A registry whose dives are generated, whatever the shipped switch says. */
const generating = createDefaultRegistry();
generating.getDelveBalance().layout.generatedDives = true;

/** A new Fire hero's first floor (seed `seed`), played by the bot to its end. */
function playOut(seed: number, policy: BotPolicy): ArpgWorld {
  let p = startDive(generating, createDelveProfile(generating, seed, { primary: 'fire' }), 1);
  const world = beginFloor(generating, p);
  while (!world.heroDead && !world.exited && world.t < 240)
    p = botStep(generating, p, world, STEP, policy);
  return world;
}

const ring = generateItem(
  registry,
  { uid: 'r1', ilvl: 2, rarity: 'magic', slot: 'ring', mana: 'fire' },
  new SeededRNG(1),
);
/** A Fire hero at depth 1 with a ring in the bag and scrap: an alcove offers equip and upgrade. */
const diving = (): DelveProfile =>
  startDive(
    registry,
    { ...createDelveProfile(registry, 3, { primary: 'fire' }), bag: [ring], scrap: 1000 },
    1,
  );

describe('the bot on a generated floor', () => {
  it('thorough: goes in every room, kills every foe, opens what it finds, then takes the exit', () => {
    for (const seed of [4, 17, 19]) {
      const w = playOut(seed, 'thorough');
      expect(w.exited, `seed ${seed}`).toBe(true);
      expect(w.map.rooms.every((r) => r.revealed)).toBe(true);
      expect(w.monsters.filter((m) => !m.dead)).toEqual([]);
      const found = w.map.rooms.map((r) => r.interactable).filter((i) => i && i.kind !== 'gate');
      expect(found.length, `seed ${seed}`).toBe(1);
      expect(found.every((i) => i!.used)).toBe(true);
    }
  });

  it('beeline: makes for the exit, leaving rooms and foes behind, and is out sooner', () => {
    const rush = playOut(19, 'beeline');
    expect(rush.exited).toBe(true);
    expect(rush.map.rooms.some((r) => !r.revealed)).toBe(true);
    expect(rush.monsters.some((m) => !m.dead)).toBe(true);
    expect(rush.t).toBeLessThan(playOut(19, 'thorough').t);
  });

  it('takes the exit as soon as the gate answers its press', () => {
    const p = diving();
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }));
    for (let i = 0; i < 600 && !w.exited; i++) botStep(registry, p, w, STEP, 'beeline');
    expect(w.exited).toBe(true);
    expect(Math.hypot(w.hero.x - 19, w.hero.y - 6)).toBeLessThanOrEqual(bal.ai.interactRadius);
  });

  it('takes its pick at an anvil alcove, once, through takeAlcove', () => {
    let p = diving();
    const w = floorWorld(twoRooms('alcove', { kind: 'alcove' }, 1));
    for (let i = 0; i < 600 && p.dive!.used.length === 0; i++) p = botStep(registry, p, w, STEP);
    expect(p.dive!.used).toEqual(['1:1']);
    expect(w.map.rooms[1].interactable!.used).toBe(true);
    expect(p.equipped.ring?.uid === 'r1' || p.bag[0]?.upgrade === 1).toBe(true);
    // Used, it offers nothing: the profile comes back as it was (banked, with nothing to bank).
    expect(takeBestAlcove(registry, p, w, '1:1')).toEqual(p);
  });

  it('its alcove pick is the same whether or not the world banked just before (the haul pays)', () => {
    const p = startDive(
      registry,
      { ...createDelveProfile(registry, 3, { primary: 'fire' }), scrap: 0 },
      1,
    );
    /** The alcove opened, 1000 scrap picked up and not yet banked (the upgrade it pays for). */
    const opened = () => {
      const w = floorWorld(twoRooms('alcove', { kind: 'alcove' }, 1));
      Object.assign(w.hero, { x: 19, y: 7 });
      stepWorld(registry, w, { move: { x: 0, y: 0 }, interact: true }, STEP);
      w.pending.scrap = 1000;
      return w;
    };
    const fresh = opened();
    const banked = opened();
    const a = takeBestAlcove(registry, p, fresh, '1:1');
    const b = takeBestAlcove(registry, bankWorld(registry, p, banked).profile, banked, '1:1');
    expect(b.dive!.used).toEqual(['1:1']);
    expect(a).toEqual(b);
  });

  it('walks round a one-cell gap between pillars to a foe it sees through it', () => {
    // 12 × 12: a wall across row 5 but for a one-cell gap at x 6 and a two-cell gap at x 9–10.
    const walls = Array.from({ length: 12 }, (_, x) => [x, 5] as [number, number]).filter(
      ([x]) => x !== 6 && x !== 9 && x !== 10,
    );
    const w = floorWorld(walledMap(12, 12, walls), [dummy(6.5, 1.5)]);
    for (let i = 0; i < 6 / STEP; i++) botStep(registry, diving(), w, STEP);
    expect(w.hero.y).toBeLessThan(5);
    expect(Math.hypot(w.hero.x - 6.5, w.hero.y - 1.5)).toBeLessThan(3);
  });
});
