import { describe, it, expect } from 'vitest';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { tutorialExitHeld, tutorialTick, worldTutorialEvents } from '../src/arpg/tutorial.js';
import type { ArpgEvent, ArpgInput, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { FloorMap } from '../src/types/floor-map.js';
import type { TutorialStep } from '../src/types/tutorial.js';
import { STEP, dummy } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';
import { script } from './fixtures/tutorial-runner.js';

// See the tutorial spec: on a floor the world tallies every tutorial event from the floor's
// start, so a step done early completes as it becomes current; gates hold a door or the exit.

const still = { x: 0, y: 0 };
const tick = (w: ArpgWorld, input: Partial<ArpgInput> = {}, r = script) =>
  stepWorld(r, w, { move: still, ...input }, STEP);
const runFor = (w: ArpgWorld, seconds: number, move = still, r = script) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) tick(w, { move }, r);
};
/** The fixture's world on `map`, on `floor` at step `step`. */
function guided(
  step: string,
  map: FloorMap = twoRooms('combat'),
  floor = 'd1-1',
  monsters: Partial<MonsterEntity>[] = [],
) {
  const w = floorWorld(map, monsters);
  w.tutorialFloor = floor;
  w.tutorial = { step, count: 0, misses: 0, tally: {} };
  return w;
}
/** `events` fed to the world's tutorial as one tick's. */
function feed(w: ArpgWorld, events: ArpgEvent[], r = script): void {
  const ctx = makeCtx(r, w, []);
  ctx.events.push(...events);
  tutorialTick(ctx);
}
const step = (w: ArpgWorld) => w.tutorial?.step ?? null;

describe('a floor step', () => {
  it('holds its door shut while it is current, and lets go when the hero reaches its marker', () => {
    const w = guided('walk');
    tick(w);
    expect(w.map.doors.map((d) => !!d.held)).toEqual([true, false]);
    runFor(w, 1, { x: 1, y: 0 });
    expect(step(w)).toBe('rats');
    expect(w.map.doors.map((d) => !!d.held)).toEqual([false, false]);
  });

  it('counts what happened before it: kills while walking complete it as it becomes current', () => {
    const w = guided('walk', twoRooms('combat'), 'd1-1', [dummy(5, 3), dummy(5, 9)]);
    const ctx = makeCtx(script, w, []);
    for (const m of [...w.monsters]) killMonster(ctx, m);
    tutorialTick(ctx);
    expect(step(w)).toBe('walk');
    Object.assign(w.hero, { x: 6.5, y: 6 });
    tick(w);
    // The two kills count for the step after the walk: on to the beat.
    expect(step(w)).toBe('look');
  });

  it('a beat waits for its ack; a marker reached early completes its step at once', () => {
    const w = guided('look');
    Object.assign(w.hero, { x: 19, y: 3 });
    tick(w);
    expect(step(w)).toBe('look');
    worldTutorialEvents(script, w, [{ type: 'ack' }]);
    // `far` was reached already: on to the perfect dodge, whose gate holds the exit.
    expect(step(w)).toBe('perfect');
    expect(tutorialExitHeld(w)).toBe(true);
  });

  it('a perfect-dodge step counts each dodge as a miss, and takes a skip only at skipAfter', () => {
    // A foe stands (with none left, a step that needs one is skippable at once).
    const w = guided('perfect', twoRooms('combat'), 'd1-1', [dummy(22, 3)]);
    tick(w, { dodge: true });
    runFor(w, 1);
    worldTutorialEvents(script, w, [{ type: 'skipStep' }]);
    expect(w.tutorial).toMatchObject({ step: 'perfect', misses: 1 });
    tick(w, { dodge: true });
    runFor(w, 1);
    worldTutorialEvents(script, w, [{ type: 'skipStep' }]);
    expect(step(w)).toBe('exit');
    expect(tutorialExitHeld(w)).toBe(false);
  });

  it('the exit gate refuses the hero while a step holds it, and opens when it completes', () => {
    const map = twoRooms('exit', { kind: 'gate' });
    const w = guided('rats', map, 'd1-1', [dummy(22, 3), dummy(22, 9)]);
    Object.assign(w.hero, { x: 19, y: 7 });
    tick(w); // the gates take hold from the floor's first tick
    expect(tick(w, { interact: true }).some((e) => e.kind === 'exitRequest')).toBe(false);
    const ctx = makeCtx(script, w, []);
    for (const m of [...w.monsters]) killMonster(ctx, m);
    tutorialTick(ctx);
    expect(step(w)).toBe('look');
    expect(tick(w, { interact: true }).some((e) => e.kind === 'exitRequest')).toBe(true);
  });

  it("a skipAfter step's misses are its seconds; the pair's reactions count, others don't", () => {
    const w = guided('react', twoRooms('combat'), 'd1-2');
    w.loot.pair = ['fire', 'frost'];
    runFor(w, 3.5);
    expect(w.tutorial!.misses).toBe(3);
    const at = { x: 5, y: 5 };
    feed(w, [{ kind: 'reaction', reaction: 'melt', ...at }]);
    feed(w, [{ kind: 'reaction', reaction: 'overload', ...at }]);
    expect(w.tutorial).toMatchObject({ step: 'react', count: 1 });
    feed(w, [{ kind: 'reaction', reaction: 'melt', ...at }]);
    expect(step(w)).toBe('den');
  });

  it('a potion step completes on a drink, or once a den is cleared with nothing to drink for', () => {
    const drink = guided('den', twoRooms('den'), 'd1-2');
    feed(drink, [{ kind: 'heal', amount: 10, source: 'potion' }]);
    expect(step(drink)).toBe('exit2');
    const w = guided('den', twoRooms('den'), 'd1-2');
    w.hero.hp = w.hero.stats.maxHp / 2;
    feed(w, [{ kind: 'roomCleared', roomId: 1 }]);
    expect(step(w)).toBe('den');
    w.hero.potions = 0;
    tick(w);
    expect(step(w)).toBe('exit2');
  });

  it("stops at a step off the floor (a stop's), and does nothing without a tutorial", () => {
    const w = guided('equip');
    tick(w);
    expect([step(w), w.map.doors.some((d) => d.held)]).toEqual(['equip', false]);
    const off = floorWorld(twoRooms('combat'));
    tick(off);
    expect([off.tutorial, off.map.doors.some((d) => d.held)]).toEqual([null, false]);
  });
});

describe('the tallies', () => {
  const floorStep = (id: string, trigger: TutorialStep['trigger']): TutorialStep => ({
    id,
    where: 'floor',
    floor: 'd1-1',
    line: id,
    objective: id,
    trigger,
  });
  const tallies = new DataRegistry({
    ...loadAndValidateData(),
    tutorial: {
      ...script.getTutorialData(),
      steps: [
        floorStep('chain', { type: 'cast', filter: { slot: 0, step: 1 }, count: 1 }),
        floorStep('aim', { type: 'cast', filter: { slot: 0, aimed: true }, count: 1 }),
        floorStep('item', { type: 'pickup', filter: { dropKind: 'item' }, count: 1 }),
        floorStep('dust', { type: 'pickup', filter: { material: 'dust' }, count: 1 }),
        floorStep('chest', { type: 'interact', filter: { interactable: 'chest' }, count: 1 }),
        floorStep('anvil', { type: 'interact', filter: { interactable: 'alcove' }, count: 1 }),
        floorStep('brute', { type: 'kill', filter: { spawn: 'brute' }, count: 1 }),
        floorStep('boss', { type: 'boss', count: 1 }),
        floorStep('exit', { type: 'clearFloor', count: 1 }),
      ],
    },
  });

  it('count casts by slot, chain step and aim; pickups by kind; interactables used; foes by spawn; the boss', () => {
    const w = guided('chain', twoRooms('combat'), 'd1-1', [
      dummy(5, 3, { spawnId: 'brute' }),
      dummy(5, 9, { kind: 'boss' }),
    ]);
    const cast = (step: number, aimed: boolean): ArpgEvent =>
      ({ kind: 'cast', slot: 0, step, aimed }) as ArpgEvent;
    const pickup = (dropKind: 'item' | 'material', material?: object): ArpgEvent =>
      ({
        kind: 'pickup',
        dropId: 1,
        dropKind,
        amount: 1,
        ...(material && { material }),
      }) as ArpgEvent;
    const seen: (string | null)[] = [];
    const feeds: ArpgEvent[][] = [
      [cast(0, true)],
      [cast(1, false)],
      [pickup('material', { kind: 'dust' })],
      [pickup('item')],
      [{ kind: 'used', id: '1:1', interactable: 'chest' }],
      [{ kind: 'alcoveOpen', id: '1:2' }],
      [{ kind: 'death', id: w.monsters[0].id, x: 5, y: 3, monsterKind: 'normal', scrap: 0 }],
      [{ kind: 'death', id: w.monsters[1].id, x: 5, y: 9, monsterKind: 'boss', scrap: 0 }],
    ];
    for (const events of feeds) {
      feed(w, events, tallies);
      seen.push(step(w));
    }
    // The aimed first cast counts for `aim` once the chain's second move is cast.
    expect(seen).toEqual(['chain', 'item', 'item', 'chest', 'anvil', 'brute', 'boss', 'exit']);
  });
});
