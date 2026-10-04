import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { tutorialDataProblems } from '../src/data/tutorial-check.js';
import { tutorialDoorCount, tutorialFloorProblems } from '../src/data/tutorial-floor-schema.js';
import { TutorialDataSchema } from '../src/data/tutorial-schema.js';
import rawTutorial from '../src/data/tutorial.json';
import { MANA_TYPES } from '../src/types/mana.js';
import type { TutorialData, TutorialStep } from '../src/types/tutorial.js';
import type { TutorialFloorDef } from '../src/types/tutorial-floor.js';

// See the tutorial spec: "The script" and "Hand-built floors" (Phase A's skeleton).

const registry = createDefaultRegistry();
const data = registry.getTutorialData();
const ok = (x: unknown) => TutorialDataSchema.safeParse(x).success;
/** A registry whose tutorial data is `tutorial`. */
const withTutorial = (tutorial: TutorialData) =>
  new DataRegistry({ ...loadAndValidateData(), tutorial });
const STEP: TutorialStep = {
  id: 'walk',
  where: 'floor',
  floor: 'd1-1',
  line: 'Walk, {primary} wielder.',
  objective: 'Walk with {input:move}',
  marker: 'walk',
  gate: { door: 0 },
  trigger: { type: 'marker', filter: { id: 'walk' }, count: 1 },
};
const steps = (...ss: TutorialStep[]) => tutorialDataProblems(withTutorial({ ...data, steps: ss }));
const floor = (f: Partial<TutorialFloorDef>) =>
  tutorialFloorProblems(withTutorial({ ...data, floors: [{ ...data.floors[0], ...f }] }));

describe('tutorial.json', () => {
  it('rides the registry: a partner for every primary, and the eight floors of the two dives', () => {
    for (const m of MANA_TYPES) expect(data.partners[m]).not.toBe(m);
    expect(data.floors.map((f) => [f.id, f.dive, f.depth])).toEqual([
      ['d1-1', 1, 1],
      ['d1-2', 1, 2],
      ['d1-3', 1, 3],
      ['d2-1', 2, 1],
      ['d2-2', 2, 2],
      ['d2-3', 2, 3],
      ['d2-4', 2, 4],
      ['d2-5', 2, 5],
    ]);
    expect(data.steps.length).toBeGreaterThan(0);
  });

  it('keeps the anchors the script names: door 0 on every floor, the walk marker on the first', () => {
    for (const f of data.floors) expect(tutorialDoorCount(f)).toBeGreaterThan(0);
    expect(data.floors[0].markers.map((m) => m.id)).toContain('walk');
    expect(tutorialDataProblems(registry)).toEqual([]);
    expect(tutorialFloorProblems(registry)).toEqual([]);
  });

  it('refuses a partner of itself or none, an unknown trigger, target or key, and repeated ids', () => {
    expect(ok(rawTutorial)).toBe(true);
    expect(ok({ ...rawTutorial, steps: [STEP] })).toBe(true);
    expect(ok({ ...rawTutorial, partners: { ...rawTutorial.partners, fire: 'fire' } })).toBe(false);
    const { fire: _f, ...noFire } = rawTutorial.partners;
    expect(ok({ ...rawTutorial, partners: noFire })).toBe(false);
    const step = (s: object) => ok({ ...rawTutorial, steps: [{ ...STEP, ...s }] });
    expect(step({ trigger: { type: 'jump', count: 1 } })).toBe(false);
    expect(step({ highlight: 'hud.nothing' })).toBe(false);
    expect(step({ voice: 'hesta.ogg' })).toBe(false);
    expect(step({ trigger: { type: 'ack', count: 0 } })).toBe(false);
    expect(ok({ ...rawTutorial, steps: [STEP, STEP] })).toBe(false);
  });
});

describe('tutorialDataProblems', () => {
  it('passes a floor step on its floor, its marker and its door', () => {
    expect(steps(STEP)).toEqual([]);
  });

  it('names a floor or stop step without its floor, and an Anvil step with one', () => {
    expect(steps({ ...STEP, floor: undefined })).toContain('walk: names its floor');
    expect(steps({ ...STEP, floor: 'd9-9' })).toContain('walk: names its floor');
    const anvil: TutorialStep = { ...STEP, where: 'anvil', marker: undefined, gate: undefined };
    expect(steps(anvil)).toEqual(['walk: no floor']);
  });

  it('names a marker or door its floor lacks, and a gate or a stop off its kind of step', () => {
    expect(steps({ ...STEP, marker: 'nowhere' })).toEqual(['walk: no marker nowhere']);
    expect(steps({ ...STEP, gate: { door: 1 } })).toEqual(['walk: no door 1']);
    const stop = { kinds: [], doors: ['winding'], extract: false };
    expect(steps({ ...STEP, stop })).toEqual(['walk: a stop on a stop step']);
    expect(steps({ ...STEP, where: 'stop' })).toEqual([
      'walk: marker, gate and alcove on a floor step',
    ]);
  });

  it("names a stop's unknown door and one that skips a depth", () => {
    const stop = (doors: string[]) => ({
      ...STEP,
      where: 'stop' as const,
      marker: undefined,
      gate: undefined,
      stop: { kinds: [], doors, extract: false },
    });
    expect(steps(stop(['winding']))).toEqual([]);
    expect(steps(stop(['nowhere']))).toEqual(['walk: no door nowhere']);
    expect(steps(stop(['plunge']))).toEqual(['walk: door plunge skips a depth']);
  });

  it('names a token tutorialText cannot fill', () => {
    expect(
      steps({ ...STEP, line: '{partner} and {reaction}, {secondary}, {primarySkill}' }),
    ).toEqual([]);
    expect(steps({ ...STEP, line: 'Hi {name}' })).toEqual(['walk: no token {name}']);
    expect(steps({ ...STEP, objective: 'Press {input:jump}' })).toEqual([
      'walk: no token {input:jump}',
    ]);
  });
});

describe('tutorialFloorProblems', () => {
  const rows = data.floors[0].rows;

  it('names a second start, a missing door number and a room outside the rows', () => {
    expect(floor({ rows: rows.map((r) => r.replace('X', 'S')) })).toContain('d1-1: one S');
    expect(floor({ rows: rows.map((r) => r.replace('0', '1')) })).toContain('d1-1: no door 0');
    const rooms = [{ id: 0, kind: 'start' as const, rect: { x: 1, y: 1, w: 30, h: 3 } }];
    expect(floor({ rooms })).toContain('d1-1: room 0 inside the rows');
  });

  it('names an unknown monster, a spawn on a wall, a marker on a wall and a drop on nothing', () => {
    const spawn = { id: 'rat', monster: 'mine_rat', at: { x: 2.5, y: 2.5 }, room: 0 };
    expect(floor({ spawns: [spawn] })).toEqual([]);
    expect(floor({ spawns: [{ ...spawn, monster: 'dragon' }] })).toEqual([
      'd1-1: no monster dragon',
    ]);
    expect(floor({ spawns: [{ ...spawn, at: { x: 0.5, y: 0.5 } }] })).toEqual([
      "d1-1: spawn rat on its room's floor",
    ]);
    expect(floor({ markers: [{ id: 'walk', at: { x: 4.5, y: 1.5 } }] })).toEqual([
      'd1-1: marker walk on a wall',
    ]);
    const drop = { id: 'd', on: 'chest', drop: { kind: 'scrap' as const, count: 5 } };
    expect(floor({ drops: [drop] })).toEqual(['d1-1: drop d falls on nothing (chest)']);
  });

  it("names gear of an unknown base, and dive 1's gear outside the primary", () => {
    const spawns = [{ id: 'rat', monster: 'mine_rat', at: { x: 2.5, y: 2.5 }, room: 0 }];
    const gear = (base: string, element: 'primary' | 'secondary') => [
      {
        id: 'g',
        on: 'spawn:rat',
        drop: { kind: 'gear' as const, base, rarity: 'uncommon' as const, element },
      },
    ];
    expect(floor({ spawns, drops: gear('sword', 'primary') })).toEqual([]);
    expect(floor({ spawns, drops: gear('spoon', 'primary') })).toEqual(['d1-1: no base spoon']);
    expect(floor({ spawns, drops: gear('sword', 'secondary') })).toEqual([
      "d1-1: drop g: dive 1's gear is in the primary",
    ]);
  });
});
