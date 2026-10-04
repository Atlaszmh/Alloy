import { describe, it, expect, vi } from 'vitest';
import { botInput } from '../src/arpg/bot.js';
import { stepWorld } from '../src/arpg/step.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { STEP, registry } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';

// The bot among room objects (see the room objects spec's "5. The bot"): it paths round the
// props' and hazards' footprints, and a goal move that makes no headway side-steps.

/** With `hide.feet`, nothing sees the objects' footprints: only the no-progress side-step frees the bot. */
const hide = vi.hoisted(() => ({ feet: false }));
vi.mock('../src/arpg/objects-base.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/arpg/objects-base.js')>();
  return {
    ...real,
    footprints: (w: ArpgWorld) => (hide.feet ? new Set<number>() : real.footprints(w)),
  };
});

/** `w` played by the bot for up to `seconds`, until `done`. */
function play(w: ArpgWorld, seconds: number, done: () => boolean): void {
  for (let i = 0; i < Math.round(seconds / STEP) && !done(); i++)
    stepWorld(registry, w, botInput(registry, w), STEP);
}

/** Two rooms, the hero in the start's west, a crate square on its line to room 1's door. */
function crated(): ArpgWorld {
  const w = floorWorld(twoRooms('combat'));
  Object.assign(w.hero, { x: 3.5, y: 6.5 });
  w.props.push({
    type: 'prop',
    id: 900,
    kind: 'crate',
    x: 6.5,
    y: 6.5,
    radius: 0.6,
    life: 99,
    dead: false,
  });
  return w;
}

describe('the bot and room objects', () => {
  it('walks round a crate on its way instead of pressing into it', () => {
    hide.feet = false;
    const w = crated();
    play(w, 8, () => w.hero.x > 13);
    expect(w.hero.x).toBeGreaterThan(13);
  });

  it('a goal move that makes no headway side-steps until it does (footprints unseen)', () => {
    hide.feet = true;
    const w = crated();
    play(w, 10, () => w.hero.x > 13);
    hide.feet = false;
    expect(w.hero.x).toBeGreaterThan(13);
  });

  it('shut in a sealed den, it hunts the last foe before loot lying outside the door', () => {
    hide.feet = false;
    const map = twoRooms('den');
    map.rooms[1].sealed = map.rooms[1].revealed = true;
    for (const d of map.doors) d.closed = true;
    const w = floorWorld(map, [{ x: 21, y: 6, aggro: true, roomId: 1, ai: 'ranged' }]);
    Object.assign(w.hero, { x: 14, y: 6 });
    w.drops.push({
      id: 1,
      kind: 'item',
      x: 8.5,
      y: 6,
      amount: 1,
      born: 0,
      vacuum: false,
      dead: false,
    });
    expect(botInput(registry, w).move.x).toBeGreaterThan(0);
  });
});
