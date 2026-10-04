import { describe, it, expect } from 'vitest';
import { createMonsterEntity } from '../src/arpg/world.js';
import { tutorialFloorProblems } from '../src/data/tutorial-floor-schema.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { builtWorld, TEST_FLOOR, withFloors } from './fixtures/tutorial-floors.js';

// See the tutorial spec's "Hand-built floors": with the tutorial on, the world builds the step's
// floor (`FloorOptions.tutorial`) from its rows, rooms and spawns instead of generating one.

const registry = withFloors(TEST_FLOOR);

describe("a hand-built floor's map", () => {
  const w = builtWorld(registry, 't-1');
  const { map } = w;

  it('is the rows: walls, floor and doors, the start and the gate at their cells', () => {
    expect([map.open, map.width, map.height, w.width, w.height]).toEqual([false, 24, 7, 24, 7]);
    const cell = (x: number, y: number) => map.cells[y * map.width + x];
    expect([cell(0, 0), cell(2, 2), cell(4, 3), cell(12, 1), cell(13, 3)]).toEqual([1, 0, 2, 1, 0]);
    expect([map.start, map.exit]).toEqual([
      { x: 2.5, y: 2.5 },
      { x: 21.5, y: 2.5 },
    ]);
    expect([w.hero.x, w.hero.y]).toEqual([2.5, 2.5]);
    expect(w.fog.every((f) => f === 0)).toBe(true);
  });

  it("is the data's rooms, each with the interactable its cells place and a home field", () => {
    expect(map.rooms.map((r) => [r.id, r.kind, r.rect])).toEqual(
      TEST_FLOOR.rooms.map((r) => [r.id, r.kind, r.rect]),
    );
    expect(map.rooms.map((r) => r.interactable)).toEqual([
      { id: '3:0', kind: 'shrine', x: 1.5, y: 3.5, used: false, shrine: 'vigor' },
      { id: '3:1', kind: 'chest', x: 8.5, y: 2.5, used: false },
      { id: '3:2', kind: 'gate', x: 21.5, y: 2.5, used: false },
    ]);
    const home = map.rooms[1].homeField!;
    expect([home[3 * 24 + 8], home[3 * 24 + 2], home[0]]).toEqual([0, 6, 65535]);
  });

  it('numbers its doors by digit, each its rooms (one that seals first) and open', () => {
    expect(map.doors).toEqual([
      { id: 0, cells: [2, 3, 4].map((y) => ({ x: 4, y })), rooms: [1, 0], closed: false },
      { id: 1, cells: [2, 3, 4].map((y) => ({ x: 11, y })), rooms: [1, 1], closed: false },
      { id: 2, cells: [2, 3, 4].map((y) => ({ x: 14, y })), rooms: [2, 2], closed: false },
    ]);
  });

  it('marks the interactables the dive has used', () => {
    expect(builtWorld(registry, 't-1', { used: ['3:1'] }).map.rooms[1].interactable!.used).toBe(
      true,
    );
  });

  it('passes the floor checks', () => {
    expect(tutorialFloorProblems(registry)).toEqual([]);
  });
});

describe("a hand-built floor's foes", () => {
  const w = builtWorld(registry, 't-1');
  const [champ, brute, grask] = w.monsters;

  it("stand where the data puts them, in their rooms, a room one pack, the boss the floor's", () => {
    expect(
      w.monsters.map((m) => [m.spawnId, m.defId, m.kind, m.x, m.y, m.roomId, m.packId, m.script]),
    ).toEqual([
      ['champ', 'mine_rat', 'elite', 7.5, 3.5, 1, 2, undefined],
      ['brute', 'slag_beetle', 'normal', 9.5, 4.5, 1, 2, 'slamOnly'],
      ['grask', 'foreman_grask', 'boss', 18.5, 3.5, 2, 3, undefined],
    ]);
    expect([w.bossId, w.totalMonsters]).toEqual([grask.id, 3]);
  });

  it("an elite has the data's traits, and its life and damage × the data's", () => {
    const plain = createMonsterEntity(
      registry,
      {
        id: 1,
        def: registry.getBiomeForDepth(3).monsters[0],
        kind: 'elite',
        depth: 3,
        door: null,
        element: 'fire',
        x: 0,
        y: 0,
        packId: 1,
        traits: ['swift'],
      },
      new SeededRNG(1),
    );
    expect(champ.traits).toEqual(['swift']);
    expect(Math.abs(champ.maxHp - 2 * plain.maxHp)).toBeLessThanOrEqual(1);
    expect(Math.abs(champ.damage - 0.5 * plain.damage)).toBeLessThanOrEqual(1);
    expect(brute.traits).toEqual(['armored']);
  });
});

describe('the tutorial off', () => {
  it('a floor not on the list, or none, is generated as before', () => {
    const plain = builtWorld(registry, 't-1', { tutorial: undefined, layout: 'generated' });
    const unknown = builtWorld(registry, 'nowhere', { layout: 'generated' });
    expect([plain.tutorialFloor, unknown.tutorialFloor]).toEqual([null, null]);
    expect(unknown.map.width).toBe(plain.map.width);
    expect(unknown.monsters.length).toBe(plain.monsters.length);
  });
});
