import { describe, it, expect } from 'vitest';
import { blocked, isWalkable } from '../src/arpg/grid.js';
import { floorPacks, generateFloor, planFloor } from '../src/arpg/layout/generate.js';
import { isBossFloor } from '../src/arpg/world.js';
import type { DoorDef } from '../src/types/delve.js';
import type { FloorMap, Room } from '../src/types/floor-map.js';
import { bal, registry } from './fixtures/arena.js';

// The floor generator (see the floor maps spec's "Generator" and "Testing"):
// rooms and halls on the coarse grid, their kinds, the packs and the world on them.

const L = bal.layout;
const DEPTHS = [1, 2, 4, 5, 9, 10, 15, 22, 30, 45];
const SEEDS = Array.from({ length: 24 }, (_, i) => 1 + i * 7919);
const swarm = registry.getDoor('swarm');
const plan = (seed: number, depth: number, door: DoorDef | null = null) =>
  planFloor(registry, seed, depth, registry.getBiomeForDepth(depth), door);
/** Every (seed, depth) pair's plan, with no door and through the Swarm. */
const ALL = SEEDS.flatMap((seed) =>
  DEPTHS.flatMap((depth) =>
    [null, swarm].map((door) => ({ seed, depth, door, ...plan(seed, depth, door) })),
  ),
);

/** Steps from the start's cell over every cell that isn't a wall (doors open). */
function reach(map: FloorMap): Set<number> {
  const seen = new Set([Math.floor(map.start.y) * map.width + Math.floor(map.start.x)]);
  for (const queue = [...seen]; queue.length > 0; ) {
    const k = queue.shift()!;
    const x = k % map.width;
    const y = (k - x) / map.width;
    for (const [i, j] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const n = j * map.width + i;
      if (!blocked(map, i, j) && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** Doors crossed from room `from` to each room, the fewest (a hall's two doors count once). */
function roomSteps(map: FloorMap, from: number): number[] {
  const d = map.rooms.map(() => Infinity);
  d[from] = 0;
  for (const queue = [from]; queue.length > 0; ) {
    const a = queue.shift()!;
    for (const door of map.doors)
      if (door.rooms[0] === a && d[door.rooms[1]] === Infinity) {
        d[door.rooms[1]] = d[a] + 1;
        queue.push(door.rooms[1]);
      }
  }
  return d;
}

const inRect = (r: Room['rect'], x: number, y: number) =>
  x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;

/** The map as text: '#' wall, '.' floor, '+' door, 'S' start, and each interactable's letter. */
function ascii(map: FloorMap): string {
  const rows = Array.from({ length: map.height }, (_, y) =>
    Array.from({ length: map.width }, (_, x) => '.#+'[map.cells[y * map.width + x]]),
  );
  const mark = (p: { x: number; y: number }, ch: string) =>
    (rows[Math.floor(p.y)][Math.floor(p.x)] = ch);
  mark(map.start, 'S');
  for (const r of map.rooms)
    if (r.interactable)
      mark(
        r.interactable,
        { chest: 'C', shrine: '*', alcove: 'A', gate: 'X' }[r.interactable.kind],
      );
  return '\n' + rows.map((r) => r.join('')).join('\n') + '\n';
}

describe('the generated map', () => {
  it('reaches every floor cell, so every room and the exit, from the start', () => {
    for (const { map, seed, depth } of ALL) {
      const seen = reach(map);
      const walkable = map.cells.filter((c) => c !== 1).length;
      expect(seen.size, `seed ${seed} depth ${depth}`).toBe(walkable);
      expect(isWalkable(map, map.exit.x, map.exit.y)).toBe(true);
      const start = Math.floor(map.start.y) * map.width + Math.floor(map.start.x);
      for (const r of map.rooms) expect(r.homeField![start]).toBeLessThan(65535);
    }
  });

  it('keeps its counts, sizes and kinds in range for the depth', () => {
    const { layouts } = registry.getDelveData();
    for (const { map, depth } of ALL) {
      const n = Math.min(L.rooms.max, Math.floor(L.rooms.base + depth * L.rooms.perDepth));
      const kinds = map.rooms.map((r) => r.kind);
      const count = (k: string) => kinds.filter((x) => x === k).length;
      expect(map.rooms.length).toBeGreaterThanOrEqual(n);
      expect(map.rooms.length).toBeLessThanOrEqual(L.rooms.max);
      expect(map.width).toBeLessThanOrEqual(L.coarseCell * L.coarseCols);
      expect(map.height).toBeLessThanOrEqual(L.coarseCell * L.coarseRows);
      expect(map.open).toBe(false);
      expect(map.rooms[0].kind).toBe('start');
      expect(count('start')).toBe(1);
      expect(count(isBossFloor(registry, depth) ? 'boss' : 'exit')).toBe(1);
      expect(count('exit') + count('boss')).toBe(1);
      expect(count('alcove')).toBeLessThanOrEqual(L.alcoveMax);
      expect(count('combat')).toBeGreaterThanOrEqual(L.minCombatRooms);
      const biome = registry.getBiomeForDepth(depth);
      const sizes = (layouts.rooms[biome.id] ?? layouts.rooms.default).map((t) => `${t.w}x${t.h}`);
      for (const r of map.rooms)
        expect(r.kind === 'boss' ? [`${layouts.boss.w}x${layouts.boss.h}`] : sizes).toContain(
          `${r.rect.w}x${r.rect.h}`,
        );
    }
  });

  it('puts the exit in the room farthest from the start, its gate there', () => {
    for (const { map } of ALL) {
      const exit = map.rooms.find((r) => r.kind === 'exit' || r.kind === 'boss')!;
      const steps = roomSteps(map, 0);
      expect(steps[exit.id]).toBe(Math.max(...steps));
      expect(exit.interactable).toMatchObject({ kind: 'gate', x: map.exit.x, y: map.exit.y });
      expect(inRect(exit.rect, map.exit.x, map.exit.y)).toBe(true);
      expect(inRect(map.rooms[0].rect, map.start.x, map.start.y)).toBe(true);
    }
  });

  it('leans vaults and sanctums toward dead ends', () => {
    const rate = (kinds: string[]) => {
      const rooms = ALL.flatMap(({ map }) =>
        map.rooms.filter((r) => kinds.includes(r.kind)).map((r) => ({ map, r })),
      );
      const ends = rooms.filter(
        ({ map, r }) => map.doors.filter((d) => d.rooms[0] === r.id).length === 1,
      );
      return ends.length / rooms.length;
    };
    expect(rate(['vault', 'sanctum'])).toBeGreaterThan(rate(['combat', 'den', 'alcove']) + 0.05);
  });

  it('gives each special room its interactable, with ids by depth and room, a shrine its blessing', () => {
    const shrineIds = registry.getDelveData().shrines.map((s) => s.id);
    for (const { map, depth } of ALL)
      for (const r of map.rooms) {
        const want = {
          vault: 'chest',
          sanctum: 'shrine',
          alcove: 'alcove',
          exit: 'gate',
          boss: 'gate',
        }[r.kind as string];
        expect(r.interactable?.kind).toBe(want);
        if (!r.interactable) continue;
        expect(r.interactable).toMatchObject({ id: `${depth}:${r.id}`, used: false });
        expect(isWalkable(map, r.interactable.x, r.interactable.y)).toBe(true);
        if (r.kind === 'sanctum') expect(shrineIds).toContain(r.interactable.shrine);
      }
  });

  it("keeps walls at least minWall thick, but for a room's pillars and rubble", () => {
    for (const { map, seed, depth } of ALL) {
      const pillar = (x: number, y: number) =>
        map.rooms.some(
          (r) =>
            x >= r.rect.x &&
            y >= r.rect.y &&
            x < r.rect.x + r.rect.w &&
            y < r.rect.y + r.rect.h &&
            !!r.mask?.[(y - r.rect.y) * r.rect.w + x - r.rect.x],
        );
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++) {
          if (blocked(map, x, y)) continue;
          // From a floor cell, a wall (not a pillar) right or below runs minWall cells on.
          for (const [dx, dy] of [
            [1, 0],
            [0, 1],
          ]) {
            if (!blocked(map, x + dx, y + dy) || pillar(x + dx, y + dy)) continue;
            for (let k = 2; k <= L.minWall; k++)
              expect(
                blocked(map, x + k * dx, y + k * dy),
                `seed ${seed} depth ${depth} at ${x},${y}`,
              ).toBe(true);
          }
        }
    }
  });

  it("puts every door in a hall where it meets its room's wall, and gives dens and boss rooms doors", () => {
    for (const { map } of ALL) {
      for (const d of map.doors) {
        expect(d.cells).toHaveLength(L.hallWidth);
        expect(d.closed).toBe(false);
        const r = map.rooms[d.rooms[0]].rect;
        for (const c of d.cells) {
          expect(map.cells[c.y * map.width + c.x]).toBe(2);
          const touching =
            c.x === r.x - 1 || c.x === r.x + r.w || c.y === r.y - 1 || c.y === r.y + r.h;
          expect(touching && inRect(r, c.x + 0.5, c.y + 0.5) === false).toBe(true);
        }
      }
      for (const r of map.rooms.filter((r) => r.kind === 'den' || r.kind === 'boss'))
        expect(map.doors.some((d) => d.rooms[0] === r.id)).toBe(true);
    }
  });

  it('is the same map for the same seed, and another for another', () => {
    const a = generateFloor(registry, 4242, 7, registry.getBiomeForDepth(7), null);
    expect(generateFloor(registry, 4242, 7, registry.getBiomeForDepth(7), null)).toEqual(a);
    expect(generateFloor(registry, 4243, 7, registry.getBiomeForDepth(7), null)).not.toEqual(a);
  });

  it('draws a few seeded maps (for the eye)', () => {
    expect(ascii(plan(11, 3).map)).toMatchInlineSnapshot(`
      "
      ################################
      ################################
      ################################
      ###################..........###
      ###################..........###
      ###################..........###
      ###################..........###
      ###################..........###
      ###################.....X....###
      ###################..........###
      ###################..........###
      ###################..........###
      ###################..........###
      ######################+++#######
      ######################...#######
      ######################...#######
      ######################...#######
      ######################+++#######
      ##################..........####
      ##################..........####
      ####........######..........####
      ####........######..........####
      ####........######..........####
      ####........+....+..........####
      ####....S...+....+..........####
      ####........+....+..........####
      ####........######..........####
      ####........######..........####
      ######+++#############+++#######
      ######...#############...#######
      ######...#############...#######
      ######...#############...#######
      ######...#############...#######
      ######+++#############...#######
      ###........###########...#######
      ###........###########...#######
      ###........###########...#######
      ###........+....######+++#######
      ###........+....##..........####
      ###........+....##..........####
      ###........##...##..........####
      ###........##....+..........####
      #############....+..........####
      #############....+..........####
      ##################..........####
      ##################..........####
      ################################
      ################################
      "
    `);
    expect(ascii(plan(12, 5).map)).toMatchInlineSnapshot(`
      "
      ################################
      #################..............#
      #################..............#
      #################..............#
      #################..............#
      #################..............#
      #################..............#
      #################..............#
      #################.......X......#
      #################..............#
      #################..............#
      #################..............#
      #################..............#
      #################..............#
      #################..............#
      #####################+++########
      #####################...########
      #####################...########
      #####################...########
      #####################+++########
      ##################........######
      ###............###........######
      ###............###..#..#..######
      ###............+.+........######
      ###............+.+........######
      ###............+.+..#..#..######
      ###......S.....###........######
      ###............###........######
      ###............######+++########
      ###............######...########
      ###............######...########
      ########+++##########...########
      ########+++##########+++########
      #..............###............##
      #..............###............##
      #..............###............##
      #..............###............##
      #..............+.+............##
      #..............+.+............##
      #..............+.+............##
      #..............###............##
      #..............###............##
      #..............###............##
      #..............#################
      #..............#################
      ################################
      ################################
      ################################
      "
    `);
    expect(ascii(plan(13, 30).map)).toMatchInlineSnapshot(`
      "
      ################################################################
      #################..............#################################
      #################..............#################################
      #################..............##..............#################
      #################..............##..............#################
      #################..............##..............#################
      #################..............##..............#################
      #################..............##..............#################
      #################.......X......++..............#################
      #################..............++..............#################
      #################..............++..............#################
      #################..............##..............#################
      #################..............##..............#################
      #################..............##..............#################
      #################..............##..............#################
      #######################################+++######################
      #######################################+++######################
      #################............####..............#################
      #################............####..............#################
      #################............####..............#################
      #################............####..............#################
      #################............+..+..............#################
      #################......A.....+..+..............#################
      #################............+..+..............#################
      #################............####..............#################
      #################............####..............#################
      #################............####..............#################
      ######################+++########..............#################
      ######################...########..............#################
      ######################...##############+++######################
      ######################...##############...######################
      ######################...##############...######################
      ######################...#############....######################
      ######################...#############....######################
      ###............#######...#############....######################
      ###............#######...#############...#######################
      ###............#######+++#############...############..........#
      ###............###..........##########+++############..........#
      ###............###..........######..........#########..........#
      ###............+.+..........######..........#########..........#
      ###............+.+..........+....+..........###.....+..........#
      ###............+.+.....S....+....+..........+.......+.....C....#
      ###............###..........+....+..........+.......+..........#
      ###............###..........######..........+.....###..........#
      ##################..........######..........#########..........#
      ##################################..........#########..........#
      ################################################################
      ################################################################
      "
    `);
  });
});

describe('the packs', () => {
  it("spreads today's count over the combat rooms and dens, adding rooms when they don't fit", () => {
    for (const { map, packs, depth, door } of ALL) {
      const holders = map.rooms.filter((r) => r.kind === 'combat' || r.kind === 'den');
      const dealt = holders.reduce((s, r) => s + packs[r.id], 0);
      expect(dealt).toBe(floorPacks(registry, depth, door));
      const most = Math.max(...holders.map((r) => packs[r.id]));
      if (map.rooms.length < L.rooms.max) expect(most).toBeLessThanOrEqual(L.packsPerRoom);
      expect(most - Math.min(...holders.map((r) => packs[r.id]))).toBeLessThanOrEqual(1);
      for (const r of map.rooms) {
        if (r.kind === 'vault') expect(packs[r.id]).toBeLessThanOrEqual(1);
        else if (r.kind !== 'combat' && r.kind !== 'den') expect(packs[r.id]).toBe(0);
      }
    }
    // The Swarm's extra packs need more rooms somewhere.
    expect(
      ALL.some(
        ({ map, door, seed, depth }) =>
          door && map.rooms.length > plan(seed, depth).map.rooms.length,
      ),
    ).toBe(true);
  });

  it('on a boss floor puts its 2 packs in combat rooms on the way to the boss room', () => {
    for (const { map, packs, depth, door } of ALL.filter(({ depth }) =>
      isBossFloor(registry, depth),
    )) {
      expect(map.rooms.filter((r) => r.kind === 'den')).toHaveLength(0);
      const combat = map.rooms.filter((r) => r.kind === 'combat');
      const total = floorPacks(registry, depth, door);
      expect(combat.reduce((s, r) => s + packs[r.id], 0)).toBe(total);
      // A room is on the way when it lies on a shortest walk from the start to the boss.
      const boss = map.rooms.findIndex((r) => r.kind === 'boss');
      const [there, back] = [roomSteps(map, 0), roomSteps(map, boss)];
      const onWay = combat.filter((r) => there[r.id] + back[r.id] === there[boss]);
      const packed = combat.filter((r) => packs[r.id] > 0);
      if (onWay.length >= total) expect(packed.every((r) => onWay.includes(r))).toBe(true);
      else expect(onWay.every((r) => packed.includes(r))).toBe(true);
    }
  });
});
