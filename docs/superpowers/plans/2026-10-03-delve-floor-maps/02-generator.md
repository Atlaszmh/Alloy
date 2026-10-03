# Delve floor maps · B1: the generator — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The floor generator, and the world built on it, behind a switch. `generateFloor` (with `planFloor`, which also says where the packs go) lays out 5 to 8 rooms on the coarse grid by a random walk, joins them by the walk's spanning tree plus `layout.loops` links, carves 3-wide halls with a door where each meets a room's wall, keeps walls `minWall` thick, puts the start in the walk's first room and the exit (on a boss floor, the boss room from the `boss` template) in the room farthest from it, draws the other rooms' kinds by depth band (`kindWeights`, `alcoveMax`, `minCombatRooms`, vaults and sanctums leaning toward dead ends), sizes and dresses each room from `layouts.json` (pillar and rubble masks at `pillarChance`), places the chest, shrine (with its blessing), alcove and gate with ids `${depth}:${roomId}`, gives each room its `homeField`, and deals today's pack count over the combat rooms and dens with the overflow rules, all on the floor seed's `layout` fork. `createFloorWorld`'s generated path builds that map, starts the hero at `map.start` with the fog dark, marks used what the dive used, and spawns the boss and each room's packs in it with their `roomId` (a den's elite-led). It runs only while the new `delve.layout.generatedDives` is on, and it ships **off**: dives keep playing the open room, bit for bit, until B4 turns it on once B1 to B3 have merged, so every suite and the pacing rails stay green and unchanged.

**Architecture:** Everything new lives in `arpg/layout/generate.ts`: `floorPacks` (today's count, now shared with the open room), `planFloor(registry, seed, depth, biome, door): FloorPlan` (`{ map, packs }`, `packs[roomId]` the packs a room holds: the map has no field for it and B1 owns no type file) and `generateFloor` (the contract's stub signature, `planFloor(...).map`). Generation runs in a fixed order on one `layout` stream: the kinds are drawn first (so the overflow rule can add combat rooms before anything is placed), then the walk and the loops, then start, exit and kinds onto the rooms, then templates and masks, halls and doors, interactables and shrines, home fields, the vault guards and the deal. A room sits in its 16-cell coarse cell, centred with up to `JITTER` (2) cells of play and at least `minWall / 2` from the cell's edge, so neighbours' walls are `minWall` thick and the walls that face each other share at least a hall's width; a hall is an elbow between the facing walls' midpoints when the gap between the rooms holds a 3-wide bend with `minWall` on both sides, else straight across the rows (columns) the two walls share. The map is cropped to the coarse cells in use (at most 64 × 64). In `world.ts`, the pack placement becomes one closure (`pack(area, centers, packId, roomId, elite)`) that the open room calls with today's area (so its draws, in the same order, give the same floats: checked bit for bit over 1393 floors), and the generated path calls per room before returning early. The switch is one condition, `opts.layout === 'generated' && bal.layout.generatedDives`; the tests that build generated worlds use their own registry with it on (`createDefaultRegistry()` gives each registry its own balance), so no `FloorOptions` field is added for them.

**Tech Stack:** TypeScript 5.7, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-03-delve-floor-maps-design.md` (authoritative): "The map model" (→ "Generator", "Monster fields", "Home fields", "The world"), "Testing → Generator", decision S4, "Phases and parallel areas" (the B1 row and "Shared files"). Phase A's plan is `01-contract.md` in this folder ("For the areas" → B1, "Where the spec left room" 9, 13, 14); the overview is `00-overview.md`.

---

## Base

- **Starts from:** `maps/main` at `eb4742c5` (Phase A merged; C3's props too), in this area's worktree `C:/Projects/alloy-maps-b1` on branch `maps/b1`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-maps-b1 -Branch maps/b1 -Base maps/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-maps-b1` in Git Bash.
- **Needs nothing else merged.** B2 and B3 run beside it; B4 runs after B1, B2 and B3 and turns `generatedDives` on (X4).
- **Anchors:** every edit was generated from, and checked against, `maps/main` at `eb4742c5`: applied in this plan's order they give exactly the files the runs below were made on (see "Verification").
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-maps-b1
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the engine suite reads **1885 passed | 5 skipped** tests in **110 passed | 1 skipped** files (the pacing rails included); the client suite **1256 tests in 154 files**.

## Files

| File | Change |
|---|---|
| `packages/engine/src/arpg/layout/generate.ts` | **Overwritten** (Phase A's stub): `FloorPlan`, `floorPacks`, `generateFloor`, `planFloor`, and the private `graphSteps` (links from a room), `cellSteps` (a home field) and `hall` |
| `packages/engine/src/arpg/world.ts` | `createFloorWorld`: the generated path when `layout` is `'generated'` and `delve.layout.generatedDives` is on (`planFloor`; the dive's used interactables; the fog dark; the boss and each room's packs with their `roomId`, a den's elite-led; packs snapped to walkable cells); the pack placement as one `pack` closure; the count from `floorPacks` |
| `packages/engine/src/types/floor-map.ts` | `LayoutBalance.generatedDives` |
| `packages/engine/src/data/schemas.ts` | `generatedDives: z.boolean()` in `LayoutBalanceSchema` |
| `packages/engine/src/data/balance.json` | `delve.layout.generatedDives: false` (hand-edited, never formatted) |
| `packages/engine/tests/delve-maps-generate.test.ts` (new) | the generator (reachability, ranges per depth, the exit, dead ends, interactables, walls, doors, determinism, three seeded maps as ASCII in inline snapshots, the packs and boss floors) and the world on a generated map (the switch off by default; the rest on a registry with it on) |

The coordinator's decision put `generatedDives` in Phase A's type, schema and balance files: three one-line additions, the only edits outside B1's own files. `packages/engine/src/index.ts` already exports `arpg/layout/generate.ts` whole (`export * from './arpg/layout/generate.js'`), so `FloorPlan`, `floorPacks` and `planFloor` reach the bundle with no edit. Every other number the generator reads is Phase A's (`delve.layout`, `layouts.json`, `shrines.json`, `dive.packs*`). No test outside the new file changes: Phase A's "a dive floor is open too until the generator lands" holds as is (B4 flips it with the switch).

## Cross-area needs

**X1 · B2 (`arpg/step.ts`, `bossSpecial`).** As Phase A's contract says: the boss's adds pass `roomId: m.roomId` to `createMonsterEntity` beside `packId: m.packId`, so they inherit the boss room (the generated path gives the boss `roomId` = the boss room's id).

**X2 · B3 (`arpg/seal.ts`, `arpg/interact.ts`, `arpg/fog.ts`).** What the generator gives:
1. **Doors:** every hall has two doors, one at each end; `Door.rooms[0]` is the room whose wall holds the door and `rooms[1]` the room at the hall's other end. Sealing a room closes the doors whose `rooms[0]` is that room (closing `rooms[1]`'s too would shut the hall at both ends). Each door is `hallWidth` (3) cells, `Cell` 2, in the cell row (column) just outside its room's `rect`; two rooms whose walls are only `minWall` apart have a 2-cell hall that is all door (its two doors side by side).
2. **Interactables:** one per vault (`chest`), sanctum (`shrine`, its `shrine` id drawn by weight from `shrines.json`), alcove (`alcove`) and exit or boss room (`gate`), at the room's centre snapped to a walkable cell; `map.exit` is the gate's point. On a boss floor the boss spawns on the same point (its gate is closed until the boss dies).
3. **Rooms cleared:** a guarded vault's guard pack spawns with the vault's `roomId`, so "spawned monsters and all died" counts it; every other vault, the start, sanctum, alcove and exit rooms spawn none. The boss room spawns the boss only.
4. **Home fields:** `room.homeField[y * width + x]` is BFS steps (4-neighbour, doors open) from the cell of the room's snapped centre, `65535` where unreachable.

**X3 · B2 (`arpg/combat.ts`, the drop roll), or whoever the integrator gives `drops.den.gearBonus`.** A foe is in a den when `world.map.rooms[m.roomId]?.kind === 'den'` (`roomId` is null on the open room). The spec doesn't name the area that adds the bonus to the elite gear chance.

**X4 · B4 (the switch, the pacing rails and pinned seeds).** Turn `delve.layout.generatedDives` on in `balance.json` (hand-edited) once B1 to B3 have merged, and flip Phase A's contract test "a dive floor is open too until the generator lands, its packs placed as before" (`delve-maps-contract.test.ts`) to expect a generated floor (`map.open` false, every foe's `roomId` set). Measured on B1 alone with the switch on (the scratch copy), 26 tests fail besides that one, all of them playing a dive floor to its end, plus one client test:
- `delve-pacing.test.ts`: 9 of the 10 (the forced-pair spread passes on relative numbers); `delve-pacing-robust.test.ts`: all 8;
- `delve-banking.test.ts`: "a cleared floor banks its haul…", "doesn't drop again the gear or patterns…", "the first boss's essence and epic flux bank…", "a death before the first boss's floor banks…", "when pickups bank never changes the outcome…", "seed 8's first floor, played by the bot, drops gear…";
- `delve-dive.test.ts`: "dying forfeits the bounty…", "the first boss ever drops an essence…";
- `delve-pair.test.ts`: "binds a given secondary before the first dive…";
- the client's `arena-hud-snapshot.test.ts` "a channelled ability dims the buttons only once its channel starts, not in its conjure" (`Cannot read properties of null (reading 'conjureUntil')`): a generated start room has no foe, so its auto-aimed Bolt never winds up. Aiming the cast fixes it: replace `stepWorld(registry, w, { move: still, cast: { slot: 0, aim: null } }, STEP);` with `const aim = { x: w.hero.x, y: w.hero.y - 3 };` and `stepWorld(registry, w, { move: still, cast: { slot: 0, aim } }, STEP);`.

The banking and dive tests kill every foe and wait for the drops, which on a generated floor only the room vacuum (B2's drop `roomId`, B3's `onMonsterKilled`) brings to the hero; the rest run the bot, which needs B3's exit and B4's flow-field movement and `exited`.

**X5 · C1 (rendering).** Generated maps are at most 64 × 64 cells, cropped to the coarse cells in use (so `width` and `height` are multiples of 16); `Room.mask` holds 1 for a pillar and 2 for rubble (both walls in `cells`); `map.start` is the start room's snapped centre.

**X6 · C2 (`__tests__/arena-hud-snapshot.test.ts`).** Nothing now; when B4 turns the switch on, that test's first cast needs an aim point (X4).

**X7 · Phase A (`types/floor-map.ts`), at the integrator's choice.** `Door.rooms`' doc could say which room is which (X2.1); B1 owns no type file, so this plan leaves it.

**X8 · D (E2E).** Moot while the switch is off: dives play the open room as before.

## Where the spec left room

1. **"L-shaped" halls.** A hall joins the facing walls' midpoints with an elbow (out, along the gap's middle, in: two bends) when the gap holds a 3-wide bend with `minWall` either side (`gap ≥ hallWidth + 2 × minWall`); otherwise it runs straight across the rows (columns) the two walls share, at their middle. Rooms sit centred in their coarse cell with up to `JITTER` = 2 cells of play (a module constant with a `ponytail:` note, into `delve.layout` if rooms need to wander more), which keeps a shared stretch of at least 4 for the 8-to-14 templates, so a hall always fits.
2. **The map is cropped** to the coarse cells the walk used (64 × 64 at most, the spec's `maxSize`).
3. **Room count:** `floor(rooms.base + depth × rooms.perDepth)`, at most `rooms.max` (5 to depth 9, 6 from 10, 8 from 30).
4. **Kinds before places.** The drawn kinds are drawn first (the first `minCombatRooms` are combat, the rest by the depth band's weights, alcoves capped at `alcoveMax`), then the overflow rule adds combat rooms, then the walk places that many. Start and exit take their rooms; vaults and sanctums are placed next, a dead end (one link) weighing `deadEndWeight` against 1, then the rest in draw order.
5. **No dens on a boss floor:** its 2 packs go to combat rooms on the way, and a den without packs would be an empty sealed room.
6. **The deal.** Packs go one a room in turn over the holders, dens first (so each den gets 1–2, elite-led), then combat rooms on a shortest way from the start to the exit, then the rest by id. That is "up to `packsPerRoom` each, then 1 a room round-robin", and on a boss floor it puts the 2 packs on the way. "Don't fit" is `ceil(packs / packsPerRoom) > holders`, and the rooms added are combat rooms, at most up to `rooms.max`.
7. **A vault's guard** is one pack on top of the count (the spec spreads the count over combat rooms and dens), at `vaultGuardChance`, drawn on `layout`.
8. **Where things stand:** the start, the boss and every interactable at their room's centre, snapped to a walkable cell; pack centres 3 cells inside the room (today's margin) and at least `minPackDistance` from the start when 40 tries allow (as today), each foe snapped to a walkable cell.
9. **`planFloor`** carries the deal (`packs[roomId]`) beside the map, because `Room` has no field for it; `generateFloor` keeps the stub's signature.
10. **Every generated room** starts `revealed: false`, `cleared: false`, `sealed: false`; the fog starts all 0 (Phase A filled 2 for the open room, which keeps it).
11. **The switch:** `delve.layout.generatedDives` (the coordinator's call), read in `createFloorWorld`; `planFloor` and `generateFloor` ignore it, so the generator's own tests never depend on it.

## Conventions

The overview's shared conventions and `01-contract.md`'s "Conventions" apply. In short: one commit per task on `maps/b1`, staged by path (never `git add -A`), the trailer as the last `-m`; don't push or merge; every command from the worktree root in a subshell; keep each file's line endings (the Edit tool does; the worktree's files are CRLF, new files LF); `npx prettier --end-of-line auto` only on files a task creates or files clean at the base; **never format** `balance.json` (hand-laid-out; hand-edited only); never touch `delve-chain-feel.test.ts`. The code below is Prettier-formatted, so `--write` changes nothing if typed as written.

**How the edits read:** "In `f`:" names the file for the edits under it. "Replace:" (a block) "with:" (a block) is one Edit; each old block is unique in its file at that point, and a file's edits apply top to bottom. "Append at the end of the file:" adds a blank line and the block after the last line. "Create `f`:" is a Write; "Overwrite `f` with:" is a Write over a file read first.

**Import cycle:** `arpg/layout/generate.ts` imports `isBossFloor` from `arpg/world.ts`, which imports `planFloor` and `floorPacks` from it; each reads the other only inside functions (both are function declarations), as the overview's import rule asks.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine bundle (the client's) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |

---

## Chunk 1: The generator

### Task 1: `planFloor`: rooms, halls, kinds and packs

The whole generator, tested on its own: nothing calls it yet, so every other number stays put.

**Files:**
- Overwrite: `packages/engine/src/arpg/layout/generate.ts`
- Create: `packages/engine/tests/delve-maps-generate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/tests/delve-maps-generate.test.ts`:

```ts
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
```

The inline snapshots are the three maps as the implementation below draws them (seed 11 at depth 3, the depth-5 boss floor of seed 12, and the 8 rooms of seed 13 at depth 30): `#` wall, `.` floor, `+` door, `S` the start, `X` the gate, `A` an alcove, `C` a chest, `*` a shrine. Type them as given; if a run rewrites them, the generator differs from this plan.

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-generate.test.ts)`
Expected: FAIL: the file doesn't load, `TypeError: (0 , planFloor) is not a function` ("no tests"): the stub module has no `planFloor`.

- [ ] **Step 3: Write the generator**

Overwrite `packages/engine/src/arpg/layout/generate.ts` (Phase A's stub; read it first) with:

```ts
import type { DataRegistry } from '../../data/registry.js';
import { weightedPick } from '../../loot/item-generator.js';
import { SeededRNG } from '../../rng/seeded-rng.js';
import type { Vec } from '../../types/arpg.js';
import type { BiomeDef, DoorDef } from '../../types/delve.js';
import {
  DRAWN_ROOM_KINDS,
  type Door,
  type FloorMap,
  type Interactable,
  type InteractableKind,
  type Rect,
  type Room,
  type RoomKind,
} from '../../types/floor-map.js';
import { clamp } from '../geometry.js';
import { snapToWalkable } from '../grid.js';
import { isBossFloor } from '../world.js';

/** How far a room may sit off its coarse cell's centre, in cells (so facing walls share a hall's width). */
// ponytail: a constant; into `delve.layout` if rooms ever need to wander further.
const JITTER = 2;
const UNREACHED = 65535;
const DIRS = [
  { c: 1, r: 0 },
  { c: -1, r: 0 },
  { c: 0, r: 1 },
  { c: 0, r: -1 },
];
const INTERACTABLE: Partial<Record<RoomKind, InteractableKind>> = {
  vault: 'chest',
  sanctum: 'shrine',
  alcove: 'alcove',
  exit: 'gate',
  boss: 'gate',
};

/** A generated floor: its map, and how many packs each room holds (by room id). */
export interface FloorPlan {
  map: FloorMap;
  packs: number[];
}

/** A floor's packs: today's count (`dive.packs*`, × the door's `packs`), 2 on a boss floor. */
export function floorPacks(registry: DataRegistry, depth: number, door: DoorDef | null): number {
  const dive = registry.getDelveBalance().dive;
  const base = isBossFloor(registry, depth)
    ? 2
    : Math.min(dive.packsMax, dive.packsBase + depth * dive.packsPerDepth);
  return Math.max(1, Math.round(base * (door?.mods.packs ?? 1)));
}

/**
 * A floor's rooms and halls (see the floor maps spec's "Generator"): pure and
 * deterministic on the floor seed's `layout` fork.
 */
export function generateFloor(
  registry: DataRegistry,
  seed: number,
  depth: number,
  biome: BiomeDef,
  door: DoorDef | null,
): FloorMap {
  return planFloor(registry, seed, depth, biome, door).map;
}

/**
 * `generateFloor` with where the packs go. Rooms are placed by a random walk on
 * the coarse grid (its first steps into each cell the spanning tree), plus
 * `layout.loops` links between neighbours; the start is the walk's first room
 * and the exit (a boss floor's boss room) the farthest from it. The drawn kinds
 * are drawn first, so the overflow rule can add combat rooms before the walk.
 */
export function planFloor(
  registry: DataRegistry,
  seed: number,
  depth: number,
  biome: BiomeDef,
  door: DoorDef | null,
): FloorPlan {
  const L = registry.getDelveBalance().layout;
  const { layouts, shrines } = registry.getDelveData();
  const rng = new SeededRNG(seed).fork('layout');
  const boss = isBossFloor(registry, depth);
  const C = L.coarseCell;

  // The kinds: the drawn rooms' (at least `minCombatRooms` combat), then combat rooms
  // the packs need past `packsPerRoom` each, up to `rooms.max`.
  let n = Math.min(L.rooms.max, Math.floor(L.rooms.base + depth * L.rooms.perDepth));
  const band = [...L.kindWeights].reverse().find((b) => depth >= b.fromDepth)!;
  const drawn: RoomKind[] = [];
  for (let i = 0; i < n - 2; i++) {
    const alcoves = drawn.filter((k) => k === 'alcove').length;
    drawn.push(
      i < L.minCombatRooms
        ? 'combat'
        : weightedPick(
            DRAWN_ROOM_KINDS,
            (k) =>
              (k === 'alcove' && alcoves >= L.alcoveMax) || (k === 'den' && boss)
                ? 0
                : band.weights[k],
            rng,
          ),
    );
  }
  const packs = floorPacks(registry, depth, door);
  const holders = drawn.filter((k) => k === 'combat' || k === 'den').length;
  const extra = clamp(Math.ceil(packs / L.packsPerRoom) - holders, 0, L.rooms.max - n);
  for (let i = 0; i < extra; i++) drawn.push('combat');
  n += extra;

  // The walk: each new coarse cell a room, linked to the one it came from.
  const key = (p: { c: number; r: number }) => p.r * L.coarseCols + p.c;
  let at = { c: rng.nextInt(0, L.coarseCols - 1), r: rng.nextInt(0, L.coarseRows - 1) };
  const coarse = [at];
  const index = new Map([[key(at), 0]]);
  const links: [number, number][] = [];
  let from = 0;
  while (coarse.length < n) {
    const moves = DIRS.map((d) => ({ c: at.c + d.c, r: at.r + d.r })).filter(
      (p) => p.c >= 0 && p.r >= 0 && p.c < L.coarseCols && p.r < L.coarseRows,
    );
    at = moves[rng.nextInt(0, moves.length - 1)];
    let id = index.get(key(at));
    if (id === undefined) {
      id = coarse.length;
      coarse.push(at);
      index.set(key(at), id);
      links.push([from, id]);
    }
    from = id;
  }
  const linked = (a: number, b: number) =>
    links.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const loops: [number, number][] = [];
  coarse.forEach((p, a) =>
    coarse.forEach((q, b) => {
      if (a < b && Math.abs(p.c - q.c) + Math.abs(p.r - q.r) === 1 && !linked(a, b))
        loops.push([a, b]);
    }),
  );
  for (let k = rng.nextInt(L.loops[0], L.loops[1]); k > 0 && loops.length > 0; k--)
    links.push(loops.splice(rng.nextInt(0, loops.length - 1), 1)[0]);
  const near = coarse.map((_, a) =>
    links.flatMap(([x, y]) => (x === a ? [y] : y === a ? [x] : [])),
  );

  // Start, exit (the farthest by links, ties by seed), then the drawn kinds, the vaults
  // and sanctums first, leaning toward dead ends.
  const steps = graphSteps(near, 0);
  const far = Math.max(...steps);
  const ends = steps.flatMap((s, i) => (s === far ? [i] : []));
  const exit = ends[rng.nextInt(0, ends.length - 1)];
  const kinds: RoomKind[] = coarse.map(() => 'combat');
  kinds[0] = 'start';
  kinds[exit] = boss ? 'boss' : 'exit';
  const free = coarse.map((_, i) => i).filter((i) => i !== 0 && i !== exit);
  const deadEnd = (k: RoomKind) => k === 'vault' || k === 'sanctum';
  for (const k of [...drawn.filter(deadEnd), ...drawn.filter((k) => !deadEnd(k))]) {
    const id = weightedPick(
      free,
      (i) => (deadEnd(k) && near[i].length === 1 ? L.deadEndWeight : 1),
      rng,
    );
    free.splice(free.indexOf(id), 1);
    kinds[id] = k;
  }

  // The rooms' rects, the map cropped to the coarse cells in use.
  const c0 = Math.min(...coarse.map((p) => p.c));
  const r0 = Math.min(...coarse.map((p) => p.r));
  const width = (Math.max(...coarse.map((p) => p.c)) - c0 + 1) * C;
  const height = (Math.max(...coarse.map((p) => p.r)) - r0 + 1) * C;
  const lo = Math.ceil(L.minWall / 2);
  const hi = Math.floor(L.minWall / 2);
  const place = (origin: number, size: number) =>
    clamp(
      origin + Math.floor((C - size) / 2) + rng.nextInt(-JITTER, JITTER),
      origin + lo,
      origin + C - hi - size,
    );
  const templates = layouts.rooms[biome.id] ?? layouts.rooms.default;
  const cells = new Uint8Array(width * height).fill(1);
  const rooms: Room[] = coarse.map((p, id) => {
    const t = kinds[id] === 'boss' ? layouts.boss : templates[rng.nextInt(0, templates.length - 1)];
    const rect = { x: place((p.c - c0) * C, t.w), y: place((p.r - r0) * C, t.h), w: t.w, h: t.h };
    const masked = t.masks.length > 0 && rng.next() < L.pillarChance;
    const rows = masked ? t.masks[rng.nextInt(0, t.masks.length - 1)] : null;
    const mask = rows
      ? Uint8Array.from(rows.join(''), (ch) => (ch === '#' ? 1 : ch === '%' ? 2 : 0))
      : undefined;
    for (let j = 0; j < t.h; j++)
      for (let i = 0; i < t.w; i++)
        cells[(rect.y + j) * width + rect.x + i] = mask?.[j * t.w + i] ? 1 : 0;
    return { id, kind: kinds[id], rect, mask, revealed: false, cleared: false, sealed: false };
  });

  // The halls, each with a door where it meets each room's wall.
  const doors: Door[] = [];
  for (const [a, b] of links) {
    const [p, q] = coarse[a].c + coarse[a].r < coarse[b].c + coarse[b].r ? [a, b] : [b, a];
    const h = hall(
      rooms[p].rect,
      rooms[q].rect,
      coarse[p].r === coarse[q].r,
      L.hallWidth,
      L.minWall,
    );
    for (const v of h.floor) cells[v.y * width + v.x] = 0;
    for (const [cs, room, other] of [
      [h.doorA, p, q],
      [h.doorB, q, p],
    ] as const) {
      for (const v of cs) cells[v.y * width + v.x] = 2;
      doors.push({ id: doors.length, cells: cs, rooms: [room, other], closed: false });
    }
  }

  const map: FloorMap = {
    width,
    height,
    cells,
    rooms,
    doors,
    start: { x: 0, y: 0 },
    exit: { x: 0, y: 0 },
    open: false,
  };
  const centre = (r: Rect) => snapToWalkable(map, r.x + r.w / 2, r.y + r.h / 2);
  map.start = centre(rooms[0].rect);
  for (const room of rooms) {
    const kind = INTERACTABLE[room.kind];
    if (kind) {
      const it: Interactable = {
        id: `${depth}:${room.id}`,
        kind,
        ...centre(room.rect),
        used: false,
      };
      if (kind === 'shrine') it.shrine = weightedPick(shrines, (s) => s.weight, rng).id;
      if (kind === 'gate') map.exit = { x: it.x, y: it.y };
      room.interactable = it;
    }
    room.homeField = cellSteps(map, centre(room.rect));
  }

  // The packs: dealt one a room in turn over the dens, then the combat rooms on a shortest
  // way to the exit, then the rest; a vault may keep one as its guard.
  const back = graphSteps(near, exit);
  const onWay = (id: number) => steps[id] + back[id] === steps[exit];
  const order = rooms
    .filter((r) => r.kind === 'den' || r.kind === 'combat')
    .sort(
      (r, s) =>
        Number(r.kind !== 'den') - Number(s.kind !== 'den') ||
        Number(!onWay(r.id)) - Number(!onWay(s.id)) ||
        r.id - s.id,
    );
  const counts = rooms.map((r) => (r.kind === 'vault' && rng.next() < L.vaultGuardChance ? 1 : 0));
  for (let k = 0; k < packs && order.length > 0; k++) counts[order[k % order.length].id]++;
  return { map, packs: counts };
}

/** Links from `from` to each room (breadth first). */
function graphSteps(near: number[][], from: number): number[] {
  const steps = near.map(() => Infinity);
  steps[from] = 0;
  for (const queue = [from]; queue.length > 0; ) {
    const a = queue.shift()!;
    for (const b of near[a])
      if (steps[b] === Infinity) {
        steps[b] = steps[a] + 1;
        queue.push(b);
      }
  }
  return steps;
}

/** Steps from `p`'s cell to every cell, over cells that aren't walls (`UNREACHED` past them). */
function cellSteps(map: FloorMap, p: Vec): Uint16Array {
  const { width, height, cells } = map;
  const field = new Uint16Array(width * height).fill(UNREACHED);
  const first = Math.floor(p.y) * width + Math.floor(p.x);
  field[first] = 0;
  for (const queue = [first]; queue.length > 0; ) {
    const k = queue.shift()!;
    const x = k % width;
    const y = (k - x) / width;
    for (const d of DIRS) {
      const i = x + d.c;
      const j = y + d.r;
      const n = j * width + i;
      if (i < 0 || j < 0 || i >= width || j >= height || cells[n] === 1 || field[n] !== UNREACHED)
        continue;
      field[n] = field[k] + 1;
      queue.push(n);
    }
  }
  return field;
}

/**
 * A hall `hallWidth` cells wide from room `a` to room `b` (`b` right of `a`, or below it
 * when not `across`): an elbow between their facing walls' midpoints when the gap holds a
 * bend with `minWall` either side, else straight across the rows (columns) both walls share.
 */
function hall(
  a: Rect,
  b: Rect,
  across: boolean,
  width: number,
  minWall: number,
): { floor: Vec[]; doorA: Vec[]; doorB: Vec[] } {
  // u runs from a to b, v across it.
  const uv = (r: Rect) =>
    across ? { u: r.x, ul: r.w, v: r.y, vl: r.h } : { u: r.y, ul: r.h, v: r.x, vl: r.w };
  const A = uv(a);
  const B = uv(b);
  const half = Math.floor(width / 2);
  const u0 = A.u + A.ul;
  const u1 = B.u - 1;
  let va = A.v + Math.floor(A.vl / 2);
  let vb = B.v + Math.floor(B.vl / 2);
  const bend = va !== vb && u1 - u0 + 1 >= width + 2 * minWall;
  if (!bend && va !== vb) {
    const o0 = Math.max(A.v, B.v);
    va = vb = o0 + Math.floor((Math.min(A.v + A.vl, B.v + B.vl) - o0) / 2);
  }
  const um = u0 + Math.floor((u1 - u0 + 1 - width) / 2);
  const floor: Vec[] = [];
  const fill = (ua: number, ub: number, v: number, vEnd = v) => {
    for (let u = ua; u <= ub; u++)
      for (let w = Math.min(v, vEnd) - half; w < Math.max(v, vEnd) - half + width; w++)
        floor.push(across ? { x: u, y: w } : { x: w, y: u });
  };
  if (bend) {
    fill(u0, um + width - 1, va);
    fill(um, um + width - 1, va, vb);
    fill(um, u1, vb);
  } else fill(u0, u1, va);
  const at = (u: number) => floor.filter((p) => (across ? p.x : p.y) === u);
  return { floor, doorA: at(u0), doorB: at(u1) };
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-generate.test.ts)`
Expected: PASS, 11 tests (about 1 s).

- [ ] **Step 5: The whole engine suite and the typecheck**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1896 passed | 5 skipped** tests in **111 passed | 1 skipped** files (N + 11 in F + 1). Nothing calls the generator yet, so every pinned number holds.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-maps-b1
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/layout/generate.ts tests/delve-maps-generate.test.ts)
git add packages/engine/src/arpg/layout/generate.ts packages/engine/tests/delve-maps-generate.test.ts
git commit -m "feat(engine): the floor generator: rooms, halls, kinds and packs (planFloor)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The world on the map

### Task 2: The world on a generated floor, behind `generatedDives`

`createFloorWorld`'s generated path, switched off by `delve.layout.generatedDives: false`, so dives still play the open room.

**Files:**
- Modify: `packages/engine/src/types/floor-map.ts`, `src/data/schemas.ts`, `src/data/balance.json`, `src/arpg/world.ts`
- Modify: `packages/engine/tests/delve-maps-generate.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-maps-generate.test.ts`:

Replace:

```ts
import { isBossFloor } from '../src/arpg/world.js';
```

with:

```ts
import { createFloorWorld, isBossFloor, type FloorOptions } from '../src/arpg/world.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
```

Replace:

```ts
import { bal, registry } from './fixtures/arena.js';
```

with:

```ts
import { bal, gear, registry } from './fixtures/arena.js';
```

Replace:

```ts
/** Steps from the start's cell over every cell that isn't a wall (doors open). */
```

with:

```ts
/** A registry whose dives are generated (`delve.layout.generatedDives` is off as shipped). */
const generating = createDefaultRegistry();
generating.getDelveBalance().layout.generatedDives = true;
const world = (depth: number, seed: number, opts: Partial<FloorOptions> = {}, reg = generating) =>
  createFloorWorld(reg, {
    depth,
    door: null,
    stats: computeHeroStats({ weapon: gear('fire') }, registry),
    chains: {},
    heroHpFrac: 1,
    potions: 3,
    phoenixAvailable: true,
    seed,
    layout: 'generated',
    loot: {
      nextUid: 1,
      find: 0,
      legendaryBoost: 1,
      firstEssence: false,
      patterns: [],
      dropsGiven: [],
      pair: [],
    },
    ...opts,
  });

/** Steps from the start's cell over every cell that isn't a wall (doors open). */
```

Append at the end of the file:

```ts
describe('the world on a generated map', () => {
  it('stays the open room while generatedDives is off', () => {
    expect(L.generatedDives).toBe(false);
    expect(world(3, 11, {}, registry).map.open).toBe(true);
  });

  it('starts the hero at the start, sizes the world from the map, and hides it all', () => {
    const w = world(3, 11);
    expect(w.map).toMatchObject({ open: false, width: w.width, height: w.height });
    expect([w.hero.x, w.hero.y]).toEqual([w.map.start.x, w.map.start.y]);
    expect(w.fog.every((c) => c === 0)).toBe(true);
    expect(w.map.rooms[0].homeField).toHaveLength(w.width * w.height);
  });

  it('spawns every foe on a walkable cell of its room, packs away from the start', () => {
    for (const seed of SEEDS)
      for (const depth of DEPTHS) {
        const w = world(depth, seed);
        expect(w.totalMonsters).toBe(w.monsters.length);
        for (const m of w.monsters) {
          expect(isWalkable(w.map, m.x, m.y), `seed ${seed} depth ${depth}`).toBe(true);
          expect(m.roomId).not.toBeNull();
          expect(inRect(w.map.rooms[m.roomId!].rect, m.x, m.y)).toBe(true);
          // Its pack's centre is minPackDistance away; the pack spreads up to 3 from it.
          const away = Math.hypot(m.x - w.map.start.x, m.y - w.map.start.y);
          if (m.kind !== 'boss') expect(away).toBeGreaterThanOrEqual(L.minPackDistance - 3);
        }
        const { packs } = plan(seed, depth);
        const packIds = new Set(w.monsters.filter((m) => m.kind !== 'boss').map((m) => m.packId));
        expect(packIds.size).toBe(packs.reduce((s, n) => s + n, 0));
      }
  });

  it("leads every den pack with an elite, and stands a boss floor's boss in the boss room", () => {
    let dens = 0;
    for (const seed of SEEDS)
      for (const depth of [9, 15, 22, 30]) {
        const w = world(depth, seed);
        for (const r of w.map.rooms.filter((r) => r.kind === 'den')) {
          const ms = w.monsters.filter((m) => m.roomId === r.id);
          dens++;
          for (const p of new Set(ms.map((m) => m.packId)))
            expect(ms.some((m) => m.packId === p && m.kind === 'elite')).toBe(true);
        }
      }
    expect(dens).toBeGreaterThan(0);
    const w = world(5, 3);
    const boss = w.monsters.find((m) => m.id === w.bossId)!;
    expect(w.map.rooms[boss.roomId!].kind).toBe('boss');
    expect(w.monsters.filter((m) => m.roomId === boss.roomId)).toEqual([boss]);
  });

  it('marks used what the dive used, and spawns nothing when empty', () => {
    const fresh = world(4, 21);
    const ids = fresh.map.rooms.flatMap((r) => (r.interactable ? [r.interactable.id] : []));
    const w = world(4, 21, { used: ids.slice(0, 1) });
    expect(w.map.rooms.flatMap((r) => (r.interactable?.used ? [r.interactable.id] : []))).toEqual(
      ids.slice(0, 1),
    );
    expect(world(5, 21, { empty: true }).monsters).toHaveLength(0);
  });

  it('builds the same world for the same seed', () => {
    const strip = (w: ReturnType<typeof world>) => ({
      map: w.map,
      monsters: w.monsters,
      hero: [w.hero.x, w.hero.y],
    });
    expect(strip(world(6, 99))).toEqual(strip(world(6, 99)));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-generate.test.ts)`
Expected: FAIL, **4 failed | 13 passed**: "stays the open room while generatedDives is off" (`expected undefined to be false`: no switch yet), "starts the hero at the start…" (`expected { width: 26, height: 40, … } to match object { open: false, … }`), "spawns every foe on a walkable cell of its room…" (`expected null not to be null`) and "leads every den pack with an elite…" (`expected 0 to be greater than 0`): `createFloorWorld` still builds the open room. (The other world tests pass vacuously on the open room.)

- [ ] **Step 3: The switch**

In `packages/engine/src/types/floor-map.ts`:

Replace:

```ts
  /** Packs a combat room or den, at most (before the overflow rules). */
  packsPerRoom: number;
```

with:

```ts
  /** Packs a combat room or den, at most (before the overflow rules). */
  packsPerRoom: number;
  /** Dives play generated floors (`FloorOptions.layout: 'generated'`); off, they keep the open room. */
  generatedDives: boolean;
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
    packsPerRoom: z.number().int().positive(),
```

with:

```ts
    packsPerRoom: z.number().int().positive(),
    generatedDives: z.boolean(),
```

In `packages/engine/src/data/balance.json` (hand-edited, never formatted):

Replace:

```json
"pillarChance": 0.3, "minPackDistance": 9, "packsPerRoom": 2
```

with:

```json
"pillarChance": 0.3, "minPackDistance": 9, "packsPerRoom": 2, "generatedDives": false
```

- [ ] **Step 4: The generated path**

In `packages/engine/src/arpg/world.ts`:

Replace:

```ts
  StatusState,
  WorldPending,
} from '../types/arpg.js';
```

with:

```ts
  StatusState,
  Vec,
  WorldPending,
} from '../types/arpg.js';
```

Replace:

```ts
import type { Buff, FloorLayout } from '../types/floor-map.js';
```

with:

```ts
import type { Buff, FloorLayout, Rect } from '../types/floor-map.js';
```

Replace:

```ts
import { openRoom } from './grid.js';
```

with:

```ts
import { openRoom, snapToWalkable } from './grid.js';
import { floorPacks, planFloor } from './layout/generate.js';
```

Replace:

```ts
   * The map: `'open'` (the default: today's arena, `openRoom`) or `'generated'` (dives;
   * the generated path is the generator's to add, so until then every floor is open).
```

with:

```ts
   * The map: `'open'` (the default: today's arena, `openRoom`) or `'generated'` (dives:
   * `planFloor`'s rooms and halls, the packs spawned room by room), which builds the open
   * room too while `delve.layout.generatedDives` is off.
```

Replace:

```ts
/** Build the arena for one depth: hero at the bottom, monster packs spread above. */
```

with:

```ts
/**
 * Build the arena for one depth: the open room (the hero at the bottom, packs spread
 * above) or a generated floor (`planFloor`: the hero at its start, packs room by room).
 */
```

Replace:

```ts
  const map = openRoom(bal.arena.width, bal.arena.height);
```

with:

```ts
  const plan =
    opts.layout === 'generated' && bal.layout.generatedDives
      ? planFloor(registry, opts.seed, opts.depth, biome, opts.door)
      : null;
  const map = plan?.map ?? openRoom(bal.arena.width, bal.arena.height);
  for (const room of map.rooms)
    if (room.interactable && opts.used?.includes(room.interactable.id))
      room.interactable.used = true;
```

Replace:

```ts
    fog: new Uint8Array(width * height).fill(2),
```

with:

```ts
    fog: new Uint8Array(width * height).fill(map.open ? 2 : 0),
```

Replace:

```ts
  const basePacks = boss
    ? 2
    : Math.min(bal.dive.packsMax, bal.dive.packsBase + opts.depth * bal.dive.packsPerDepth);
  const packs = opts.empty ? 0 : Math.max(1, Math.round(basePacks * (mods.packs ?? 1)));
  const eliteChance = Math.max(bal.dive.eliteChance, mods.eliteChance ?? 0);

  const spawn = (def: MonsterDef, kind: MonsterKind, x: number, y: number, packId: number) => {
```

with:

```ts
  const packs = opts.empty ? 0 : floorPacks(registry, opts.depth, opts.door);
  const eliteChance = Math.max(bal.dive.eliteChance, mods.eliteChance ?? 0);

  const spawn = (
    def: MonsterDef,
    kind: MonsterKind,
    x: number,
    y: number,
    packId: number,
    roomId: number | null = null,
  ) => {
```

Replace:

```ts
        packId,
      },
      spawnRng,
```

with:

```ts
        packId,
        roomId,
      },
      spawnRng,
```

Replace:

```ts
  if (boss && !opts.empty) {
    const b = spawn(biome.boss, 'boss', width / 2, 9, 0);
    world.bossId = b.id;
  }

  const centers: { x: number; y: number }[] = boss ? [{ x: width / 2, y: 9 }] : [];
  for (let p = 0; p < packs; p++) {
    let cx = 0;
    let cy = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
      cx = 3 + spawnRng.next() * (width - 6);
      cy = 3 + spawnRng.next() * (height - 13);
      const farFromHero = dist(cx, cy, heroX, heroY) >= bal.layout.minPackDistance;
      const farFromPacks = centers.every((c) => dist(c.x, c.y, cx, cy) >= 5.5);
      if (farFromHero && farFromPacks) break;
    }
    centers.push({ x: cx, y: cy });
    const size = spawnRng.nextInt(bal.dive.packSize[0], bal.dive.packSize[1]);
    const elitePack = spawnRng.next() < eliteChance;
    for (let i = 0; i < size; i++) {
      const angle = (Math.PI * 2 * i) / size + spawnRng.next() * 0.6;
      const r = i === 0 && elitePack ? 0 : bal.arena.packSpacing * (0.7 + spawnRng.next() * 0.6);
      const def = biome.monsters[spawnRng.nextInt(0, biome.monsters.length - 1)];
      spawn(
        def,
        i === 0 && elitePack ? 'elite' : 'normal',
        cx + Math.cos(angle) * r,
        cy + Math.sin(angle) * r,
        p + 1,
      );
    }
  }
```

with:

```ts
  /** A pack 3 cells inside `area`, away from the hero and the other `centers`; an elite leads it at `eliteChance` (always when `elite`). */
  const pack = (
    area: Rect,
    centers: Vec[],
    packId: number,
    roomId: number | null,
    elite = false,
  ) => {
    let cx = 0;
    let cy = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
      cx = area.x + 3 + spawnRng.next() * (area.w - 6);
      cy = area.y + 3 + spawnRng.next() * (area.h - 6);
      const farFromHero = dist(cx, cy, heroX, heroY) >= bal.layout.minPackDistance;
      const farFromPacks = centers.every((c) => dist(c.x, c.y, cx, cy) >= 5.5);
      if (farFromHero && farFromPacks) break;
    }
    centers.push({ x: cx, y: cy });
    const size = spawnRng.nextInt(bal.dive.packSize[0], bal.dive.packSize[1]);
    const elitePack = spawnRng.next() < eliteChance || elite;
    for (let i = 0; i < size; i++) {
      const angle = (Math.PI * 2 * i) / size + spawnRng.next() * 0.6;
      const r = i === 0 && elitePack ? 0 : bal.arena.packSpacing * (0.7 + spawnRng.next() * 0.6);
      const def = biome.monsters[spawnRng.nextInt(0, biome.monsters.length - 1)];
      const at = snapToWalkable(map, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      spawn(def, i === 0 && elitePack ? 'elite' : 'normal', at.x, at.y, packId, roomId);
    }
  };

  // A generated floor: the boss at its room's centre, each room's packs in it (a den's
  // elite-led), every foe knowing its room.
  if (plan) {
    let packId = 0;
    for (const room of opts.empty ? [] : map.rooms) {
      const { x, y, w, h } = room.rect;
      if (room.kind === 'boss') {
        const at = snapToWalkable(map, x + w / 2, y + h / 2);
        world.bossId = spawn(biome.boss, 'boss', at.x, at.y, 0, room.id).id;
      }
      const centers: Vec[] = [];
      for (let p = 0; p < plan.packs[room.id]; p++)
        pack(room.rect, centers, ++packId, room.id, room.kind === 'den');
    }
    world.totalMonsters = world.monsters.length;
    return world;
  }

  if (boss && !opts.empty) {
    const b = spawn(biome.boss, 'boss', width / 2, 9, 0);
    world.bossId = b.id;
  }

  const centers: { x: number; y: number }[] = boss ? [{ x: width / 2, y: 9 }] : [];
  // The open room: the packs above the hero (the bottom 7 rows kept clear).
  for (let p = 0; p < packs; p++)
    pack({ x: 0, y: 0, w: width, h: height - 7 }, centers, p + 1, null);
```


- [ ] **Step 5: Run the file to see it pass**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-generate.test.ts)`
Expected: PASS, 17 tests.

- [ ] **Step 6: The whole suite and the typecheck**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1902 passed | 5 skipped** tests in **111 passed | 1 skipped** files (N + 17 in F + 1). The switch is off, so every dive plays the open room exactly as before: the pacing rails, the banking and dive tests and Phase A's "a dive floor is open too…" pass unchanged.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/alloy-maps-b1
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/world.ts src/types/floor-map.ts src/data/schemas.ts tests/delve-maps-generate.test.ts)
git add packages/engine/src/arpg/world.ts packages/engine/src/types/floor-map.ts packages/engine/src/data/schemas.ts packages/engine/src/data/balance.json packages/engine/tests/delve-maps-generate.test.ts
git commit -m "feat(engine): createFloorWorld's generated path, behind delve.layout.generatedDives (off)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

- [ ] Engine: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`: no type errors; **1902 passed | 5 skipped** tests in **111 passed | 1 skipped** files.
- [ ] Bundle: `(cd packages/engine && npx tsup)`: "Build success" (CJS, ESM, DTS).
- [ ] Client on the new bundle: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`: no type errors; **1256 tests in 154 files**, unchanged (nothing to commit).
- [ ] No `.skip` added: `git diff maps/main --stat` lists only the six files above.
- **Checked on a scratch copy:** `git archive` of `maps/main` at `eb4742c5` with junctioned `node_modules`; this plan's edits applied by a script that checks each anchor is unique where it applies, giving exactly the trees every FAIL, PASS, suite and typecheck above ran on; `prettier --check` passed on every file a commit block formats. The open layout's parity: `createFloorWorld` over seeds 1–199 × depths 1, 3, 5, 8, 10, 17, 25 × no door, Champions and Swarm (1393 floors), with no `layout` and again with `layout: 'generated'` (what `beginFloor` passes, the switch off), gave the same monsters, hero, boss id and next `rng` / `lootRng` draws from this plan's bundle as from the base's. With the switch turned on, the scratch copy measured what X4 lists.
