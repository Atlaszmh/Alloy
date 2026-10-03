# Delve floor maps · C1: rendering (client) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw a generated floor: the pixel floor built from the world's `FloorMap` (walls as the biome's cliffs, halls as worn paths, rooms dressed per biome: rivers and pools through the wild rooms, stone plazas in the sealed arenas and special rooms, pillars and rubble as rock), seeded by the floor and simulating only the chunks round the view; the doors' frames, whose bars slide shut and glow while a room is sealed; the props (`chest`, `shrine`, `alcove_anvil`, `exit_gate`) from the atlas at their interactables, in their used state; the fog layer (unseen black, seen dimmed, foes drawn only in sight), redrawn when `fogVersion` moves; the camera on the map's bounds. The open room (the Training Grounds, and every dive until generated dives turn on) looks exactly as today.

**Architecture:** `pixel/world.ts` takes an optional `FloorPlan` (the map's cells and rooms, in map cells of `ppu` floor cells): `generatePlan` lays cliffs, paths and each room's dressing from it, and `edge` (how deep a cell lies in rock) replaces the render's margin sums; without a plan, `generate` builds today's arena bit for bit. The simulation's per-cell loops walk `active` (the awake cells' indices) instead of `0..N`: all cells until `setActive(x0, y0, x1, y1)` wakes only the 32-cell chunks under the view and every room they reach, whole. The render clears and blurs its light only round the view. `floor-engine.ts`'s `floorInit(world)` turns a world into the floor's init (the open room as before; a generated floor's plan and a seed hashed from its map) and wakes the chunks under each frame's view. `ArenaRenderer` builds the floor from `floorInit`, draws the doors (`drawDoor`) under the drops, the props (`propFrame`) among the creatures, and the fog (`paintFog`, one pixel a cell, nearest-scaled) over the floor, hiding a foe, its marks and its wind-ups out of sight (`inSight`). No engine change, and no file outside the area.

**Tech Stack:** TypeScript 5.7, PixiJS 8 (`BufferImageSource`, `Sprite`, `Graphics`), Web Workers (the pixel floor), Vitest 3 (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-03-delve-floor-maps-design.md`: "Rendering (the client)" (pixel floor, doors, props, overlays, camera, Training Grounds), "Fog of war and the minimap", "Testing → Client", and the C1 row of "Phases and parallel areas". The contract is Phase A's (`01-contract.md`, "For the areas → C1": `world.map` (`cells`, `rooms`, `doors`, `open`), `world.fog`, `getDelveData().layouts.props`). The overview is `00-overview.md` in this folder.

---

## Base

- **Starts from:** `maps/main` at `26c89fe0` (Phase A and B1 merged; C3's prop sprites in the atlas), in this area's worktree `C:/Projects/alloy-maps-c1` on branch `maps/c1`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-maps-c1 -Branch maps/c1 -Base maps/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-maps-c1` in Git Bash.
- **Needs nothing else merged.** B1's generator is in (`generateFloor` / `planFloor`; dives stay on the open room while `delve.layout.generatedDives` is off, until B4), so one test builds a real generated floor (Task 3); the rest use hand-built maps with known rooms (`__tests__/hand-map.ts`, Task 1). B3 moves the fog; the tests set it by hand. B1's maps are at most 64 × 64 (cropped to the coarse cells in use), pillars and rubble are wall cells, each hall has two doors, and an exit or boss room holds the gate: nothing here depends on more.
- **Before Task 1:** build the engine once for the client's junction, and measure the client:

```bash
cd /c/Projects/alloy-maps-c1
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the client suite reads **1256 tests in 154 files** (measured at `26c89fe0`). Call them **M** tests in **G** files; the tasks end at **M + 16** in **G** files (`hand-map.ts` is a helper, not a test file).

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/arena/pixel/world.ts` | `FloorPlan`, `PixelWorldOptions.plan`; `generatePlan` (cliffs, worn paths, paved rooms with rune circles, rivers with their springs and mouths, pools); `edge`, `drains`, `plan`; `settle` and `seedMotes` shared by both builds; a spring's cap on a generated floor (Task 1). `CHUNK`, `chunksW`/`chunksH`, `awake`, `box`, `setActive`; the fluid, field and fire loops over the awake cells; springs and rain asleep do nothing; the weather falls round the awake chunks (Task 2) |
| `packages/client/src/features/delve/arena/pixel/render.ts` | the ground's cliff shading from `pw.edge` (Task 1); the light cleared and blurred round the view only, the wind sway over the view's columns only (Task 2) |
| `packages/client/src/features/delve/arena/pixel/floor-engine.ts` | `FloorInit.plan` / `seed`; `floorInit(world)`; the engine wakes the chunks under each frame's view (Task 3) |
| `packages/client/src/features/delve/arena/ArenaRenderer.ts` | the floor from `floorInit` (Task 3); doors (`drawDoor`, `DOOR_SECONDS`) and props (`propFrame`, `makeProps`, `syncProps`) (Task 4); the fog layer (`paintFog`, `FogLayer`, `makeFog`), `inSight`, foes, their marks and wind-ups and their hits' numbers only in sight (Task 5) |
| `packages/client/src/features/delve/__tests__/hand-map.ts` (new) | `handMap`, `ringMap` (5 rooms on 64 × 64: start, vault with a chest, sanctum with a shrine, exit with the gate, a combat room), `gridMap` (4 × 4 rooms): hand-built maps until B1 |
| `packages/client/src/features/delve/__tests__/pixel-world.test.ts` | a floor built from a map (Task 1); a big floor's chunks (Task 2) |
| `packages/client/src/features/delve/__tests__/floor-engine.test.ts` | a generated floor: its init and seed, a generator's map built true, chunks round the view (Task 3) |
| `packages/client/src/features/delve/__tests__/arena-renderer.test.ts` | the props' art mocked; doors and props (Task 4); the fog, foes and their hits' numbers in sight, the camera on the map (Task 5) |

No other file changes. `useArenaCore.ts` (C2's) needs nothing: `loadFloor(world, biome)` and `update(dt)` keep their signatures, and the renderer reads the map, the fog and the props' state from the world it already holds.

## Cross-area needs

None of C1's code needs an edit in another area's file. What the others should know:

1. **B3 (`arpg/fog.ts`):** the fog layer redraws only when `world.fogVersion` changes, so bump it on every write to `world.fog`. Walls needn't be marked seen: the layer shows a wall cell by the clearest floor cell beside it.
2. **B1 / B3 (the gate):** the gate's sprite stands open while no boss lives (`world.bossId === null || world.bossKilled`), as the spec's "closed until the boss is dead". If B3 adds its own gate state, `syncProps`'s `open` reads it instead (one line).
3. **B1 (doors and props):** a door's `cells` are one straight run (a row, or a column) in its room's wall ring; its posts stand on the wall cells at either end. An interactable's `x`, `y` is its prop's spot (the sprite's base sits half its `layouts.json → props` size below it).
4. **D (docs):** CLAUDE.md's "Pixel floor" bullet gains: "A generated floor is built from the world's map (`floorInit`: walls the biome's cliffs, halls worn paths, the sealed arenas and special rooms paved, rivers and pools in the wild rooms; seeded by the map) and simulates only the 32-cell chunks under the view and the rooms they reach (`setActive`); the renderer draws its doors (`drawDoor`: bars slide shut, glowing while sealed), its props (`propFrame`) and the fog (`paintFog`: unseen black, seen dimmed; foes only in sight)."

## Where the spec left room

1. **The floor's seed.** The world doesn't keep its floor seed, and the map is the floor seed's own (the generator's `layout` fork), so `floorInit` hashes the map's cells (FNV-1a, with the depth): a replayed floor (S1) looks the same, another floor differs. The open room keeps `depth × 7919 + hash(biome)`, so it looks as it always has. No `ArpgWorld.seed` (that would be an engine field in a file no B area owns).
2. **"Stone plazas in arenas".** Read as the sealed arenas and the special rooms: dens, the boss's room, vaults, sanctums and alcoves are paved wall to wall (the mortar pattern of today's plaza), with today's rune circle at the centre of a sanctum and of the boss's room. The start, combat and exit rooms are wild ground (grass, shrubs, soil by noise, as today) and roll, on the floor's seed, a river running through (40 %, a room wide enough), a pool (35 %, a biome with pools) or neither.
3. **Rivers in rooms.** A room's river wells up along its top wall and drains at its bottom two rows (the open arena drains its bottom rows); a generated floor's springs are capped at 0.05 deep, and halls lie 0.1 above the rooms, so no water climbs into a hall (checked over seeds by the test). Pillars and rubble are rock, as the spec's "pillars as rock".
4. **Chunks.** 32 × 32 floor cells (6.4 units). Awake: the chunks under the view (no pad: a chunk's pad cost about 40 % more simulation for nothing on screen) and every room they reach, whole, so a river runs from its spring to its mouth. Asleep cells hold still (fire, frost, growth, fluid); water flowing into an asleep chunk is dropped (a `ponytail:` note: rooms wake whole, so only a hall or a clipped room can lose any). The open arena is never put to sleep. The loops walk `active` (the awake cells' indices) so their bodies are unchanged; all awake, they visit every cell in today's order.
5. **Today's look, kept.** On the open room every field and every rendered pixel is as before (checked byte for byte on a scratch copy, four biomes, two seeds, four windows, weather on): `edge` is the old margin sum, the drains are the old bottom rows, `Math.min(Infinity, v)` is `v`, the weather's box is the whole world, and the light window's blur reach (4 light cells) never touches the view inside its 7-cell pad.
6. **Doors.** Every door has its frame (two stone posts on the wall cells at its ends, ENDESGA `#5a6988`); a closed door's iron bars (`#8b9bb4`, every 0.3 units) slide across it over `DOOR_SECONDS` (0.25 s) under a pulsing red glow (`#e43b44`), and back as it opens. A door is closed only while its room is sealed, so "closed" is the sealed look.
7. **Props.** From the atlas (frame 0 / 1 as C3 drew them): a chest opens and a shrine goes dark once `used`; the gate opens while no boss lives; the alcove's anvil flickers between its frames at 3 fps until used, then stands dimmed (`#8b8b8b`). Each sprite is 0.1 units a pixel like every creature, its base half its prop size below the spot, sorted among the creatures by its base. No art, no prop (the atlas always has them since C3).
8. **The fog layer.** One pixel a map cell, nearest-scaled (the "stepped" darkness), `FLOOR_MARGIN` cells past the map so the cliffs round it darken too; black at alpha 255 unseen, 150 seen, 0 in sight; over the floor, the creatures and the effects, under the loot labels and the numbers (they live above the scaled root). It exists only on a generated floor and repaints only when `fogVersion` moves. A foe out of sight hides its sprite and life bar, its marks (`drawMonsterMarks`), its wind-ups (`drawTelegraphs`) and a hit's number and sparks (a burn ticking in the dark would give it away); its shots and zones still show (they cross into sight).
9. **The camera** already clamps to `world.width` / `world.height`, which Phase A made the map's; the test pins it on a 64 × 64 map (1 unit of cliff past each side, 1.5 above and below, as today).

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `maps/c1`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-maps-c1`.
- **Line endings:** the worktree's files are CRLF (`core.autocrlf`); keep each file's own (the Edit tool does; never Git Bash `sed -i`). New files are LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** every file this plan edits passed `npx prettier --check --end-of-line auto` at the base, and the code below is already formatted (checked on the scratch copy), so the commit blocks' `--write` changes nothing typed as written.
- **How the edits read** (the earlier plans' language): "In `f`:" names the file for the edits under it. "Replace:" (a block) "with:" (a block) is one Edit (old, new). "Create `f`:" is a Write. Within a file, apply its edits top to bottom; every old block is unique in its file at that point.
- **The client only.** No task touches `packages/engine`; the bundle built before Task 1 serves them all.
- **Map tests carry a 20 s timeout** (on their `describe`): each builds a 64 × 64 pixel floor, a third of a second alone but seconds when parallel suites load the machine (the arena's tests build theirs in the thread: jsdom has no workers).
- **Checked on a scratch copy:** `git archive` of `maps/main` at `eb4742c5`, its engine then brought to `26c89fe0` (B1's merge touched engine files only, so every client anchor is the same), with junctioned `node_modules` and the engine built; each task's edits were produced from, and applied back onto, that tree in order (every old block found exactly once where it applies, giving exactly the tested files); every FAIL and PASS below was run; the typecheck and every committed file's format were checked after each task (1256 → 1272 tests in 154 files); `vite build` bundles the floor worker.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Engine bundle (once) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(cd packages/client && npx vite build)` |

---

## Chunk 1: The pixel floor from a map

### Task 1: The floor built from a map

The hand-built maps; `FloorPlan` and `generatePlan`; `edge` for the cliff shading (today's margin sum on the open room); the open arena's drains, settling and motes shared with the new build.

**Files:**
- Create: `packages/client/src/features/delve/__tests__/hand-map.ts`
- Modify: `packages/client/src/features/delve/__tests__/pixel-world.test.ts`
- Modify: `packages/client/src/features/delve/arena/pixel/world.ts`
- Modify: `packages/client/src/features/delve/arena/pixel/render.ts`

- [ ] **Step 1: The hand-built maps and the failing tests**

Create `packages/client/src/features/delve/__tests__/hand-map.ts`:

```ts
import type { Door, FloorMap, Interactable, Rect, Room, RoomKind, Vec } from '@alloy/engine';

/** A room for `handMap`: its kind, its floor, and what stands at its centre. */
export interface HandRoom {
  kind: RoomKind;
  rect: Rect;
  interactable?: Interactable['kind'];
}

const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/**
 * A hand-built floor map, its rooms known to the tests: walls everywhere but the
 * rooms and the halls. A hall's cells in a room's wall ring (the cells
 * round its floor) are that room's door. The hero starts in the first room;
 * the exit is its gate, else the last room's centre.
 */
export function handMap(width: number, height: number, rooms: HandRoom[], halls: Rect[]): FloorMap {
  const cells = new Uint8Array(width * height).fill(1);
  const carve = (r: Rect) => {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) cells[y * width + x] = 0;
  };
  halls.forEach(carve);
  const centre = (r: Rect): Vec => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const built: Room[] = rooms.map((r, id) => {
    carve(r.rect);
    return {
      id,
      kind: r.kind,
      rect: r.rect,
      revealed: false,
      cleared: false,
      sealed: false,
      interactable: r.interactable && {
        id: `1:${id}`,
        kind: r.interactable,
        ...centre(r.rect),
        used: false,
      },
    };
  });
  const doors: Door[] = [];
  for (const h of halls) {
    const rings = rooms.map(({ rect: r }) => {
      const ring: Vec[] = [];
      const wall = { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 };
      for (let y = h.y; y < h.y + h.h; y++)
        for (let x = h.x; x < h.x + h.w; x++)
          if (inside(wall, x, y) && !inside(r, x, y)) ring.push({ x, y });
      return ring;
    });
    const joined = rings.flatMap((ring, id) => (ring.length ? [id] : []));
    for (const id of joined) {
      for (const c of rings[id]) cells[c.y * width + c.x] = 2;
      const other = joined.find((j) => j !== id) ?? id;
      doors.push({ id: doors.length, cells: rings[id], rooms: [id, other], closed: false });
    }
  }
  const gate = built.find((r) => r.interactable?.kind === 'gate')?.interactable;
  return {
    width,
    height,
    cells,
    rooms: built,
    doors,
    start: centre(rooms[0].rect),
    exit: gate ? { x: gate.x, y: gate.y } : centre(rooms[rooms.length - 1].rect),
    open: false,
  };
}

/**
 * A 64 × 64 ring of rooms: the start (top left), a vault with its chest (top
 * right), a sanctum with its shrine (bottom right), the exit with its gate
 * (bottom left), and a combat room in the middle off the top hall.
 */
export function ringMap(): FloorMap {
  return handMap(
    64,
    64,
    [
      { kind: 'start', rect: { x: 4, y: 4, w: 12, h: 10 } },
      { kind: 'vault', rect: { x: 44, y: 4, w: 12, h: 10 }, interactable: 'chest' },
      { kind: 'sanctum', rect: { x: 44, y: 44, w: 14, h: 12 }, interactable: 'shrine' },
      { kind: 'exit', rect: { x: 4, y: 46, w: 12, h: 10 }, interactable: 'gate' },
      { kind: 'combat', rect: { x: 24, y: 22, w: 16, h: 14 } },
    ],
    [
      { x: 16, y: 7, w: 28, h: 3 },
      { x: 48, y: 14, w: 3, h: 30 },
      { x: 16, y: 50, w: 28, h: 3 },
      { x: 8, y: 14, w: 3, h: 32 },
      { x: 30, y: 10, w: 3, h: 12 },
    ],
  );
}

/** A 64 × 64 grid of 4 × 4 rooms (12 × 10, one a coarse cell of 16), each joined to its neighbours. */
export function gridMap(): FloorMap {
  const kinds: RoomKind[] = ['start', 'combat', 'den', 'combat', 'vault', 'combat', 'sanctum'];
  const rooms: HandRoom[] = [];
  const halls: Rect[] = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      rooms.push({
        kind: r === 3 && c === 3 ? 'exit' : kinds[(r * 4 + c) % kinds.length],
        rect: { x: 2 + 16 * c, y: 3 + 16 * r, w: 12, h: 10 },
      });
      if (c < 3) halls.push({ x: 14 + 16 * c, y: 6 + 16 * r, w: 4, h: 3 });
      if (r < 3) halls.push({ x: 6 + 16 * c, y: 13 + 16 * r, w: 3, h: 6 });
    }
  return handMap(64, 64, rooms, halls);
}
```

In `packages/client/src/features/delve/__tests__/pixel-world.test.ts`:

Replace:

```ts
import { describe, it, expect } from 'vitest';
import type { ArpgEvent, ManaType, ReactionId } from '@alloy/engine';
import { MAX_PARTICLES, PixelWorld, MAT, PROP } from '../arena/pixel/world';
import { renderPixelWorld } from '../arena/pixel/render';
import { PIXEL_THEMES, type PixelTheme } from '../arena/pixel/themes';
import { MAX_STAMPS, applyArenaEvent, arenaToCell } from '../arena/pixel/arena-effects';

const PPU = 5;
const MARGIN = 3;
```

with:

```ts
import { describe, it, expect } from 'vitest';
import type { ArpgEvent, FloorMap, ManaType, ReactionId } from '@alloy/engine';
import { MAX_PARTICLES, PixelWorld, MAT, PROP } from '../arena/pixel/world';
import { renderPixelWorld } from '../arena/pixel/render';
import { PIXEL_THEMES, type PixelTheme } from '../arena/pixel/themes';
import { MAX_STAMPS, applyArenaEvent, arenaToCell } from '../arena/pixel/arena-effects';
import { ringMap } from './hand-map';

const PPU = 5;
const MARGIN = 3;
```

Replace:

```ts
    expect(f.stamps).toEqual([{ brush: 'nature', ...arenaToCell(10, 10, PPU, MARGIN), r: 4 }]);
  });
});
```

with:

```ts
    expect(f.stamps).toEqual([{ brush: 'nature', ...arenaToCell(10, 10, PPU, MARGIN), r: 4 }]);
  });
});

/** A floor built from `map` (ringMap's by default), with its own seed. */
function fromMap(map: FloorMap = ringMap(), seed = 7): PixelWorld {
  return new PixelWorld({
    width: (map.width + MARGIN * 2) * PPU,
    height: (map.height + MARGIN * 2) * PPU,
    margin: MARGIN * PPU,
    seed,
    theme: PIXEL_THEMES.sunken_quarry,
    weather: false,
    random: seeded(99),
    plan: { width: map.width, height: map.height, cells: map.cells, rooms: map.rooms, ppu: PPU },
  });
}

/** The floor cell in the middle of map cell (mx, my). */
const mid = (pw: PixelWorld, mx: number, my: number) =>
  (pw.margin + my * PPU + 2) * pw.width + pw.margin + mx * PPU + 2;

/** Each map cell's room (its index), or −1 in a hall or a wall. */
function roomsOf(map: FloorMap): number[] {
  const of: number[] = new Array(map.width * map.height).fill(-1);
  map.rooms.forEach(({ rect: r }, k) => {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) of[y * map.width + x] = k;
  });
  return of;
}

// Each builds a 64 × 64 floor: about a third of a second, more on a busy machine.
describe('a floor built from a map', { timeout: 20000 }, () => {
  it('raises cliffs on its walls, wears paths down its halls and paves its special rooms', () => {
    const map = ringMap();
    const pw = fromMap(map);
    const room = roomsOf(map);
    const runes = map.rooms.map(() => 0);
    for (let c = 0; c < map.cells.length; c++) {
      const i = mid(pw, c % map.width, Math.floor(c / map.width));
      if (map.cells[c] === 1) {
        // Rock, or foliage spilling over its top.
        expect([MAT.WALL, MAT.BUSH]).toContain(pw.mat[i]);
        expect(pw.edge[i]).toBeGreaterThan(0);
        continue;
      }
      expect(pw.edge[i]).toBe(0);
      const kind = map.rooms[room[c]]?.kind;
      if (!kind) expect(pw.mat[i]).toBe(MAT.SOIL);
      else if (kind === 'vault' || kind === 'sanctum') expect(pw.mat[i]).toBe(MAT.STONE);
      else expect(pw.mat[i]).not.toBe(MAT.WALL);
      for (let d = 0; d < PPU * PPU; d++) {
        const j = i - 2 - 2 * pw.width + (d % PPU) + Math.floor(d / PPU) * pw.width;
        if (room[c] >= 0 && pw.prop[j] === PROP.RUNE) runes[room[c]]++;
      }
    }
    // The rock deepens away from the floor; a rune circle marks the sanctum, none the vault.
    expect(pw.edge[mid(pw, 0, 0)]).toBeGreaterThan(10);
    expect(runes[2]).toBeGreaterThan(10);
    expect(runes[1]).toBe(0);
  });

  it('runs rivers and pools through its wild rooms, and keeps the water in them', () => {
    const map = ringMap();
    const room = roomsOf(map);
    let wet = 0;
    for (let seed = 1; seed <= 2; seed++) {
      const pw = fromMap(map, seed);
      for (let s = 0; s < 60; s++) pw.step();
      const water = map.rooms.map(() => 0);
      for (let c = 0; c < map.cells.length; c++) {
        if (map.cells[c] === 1) continue;
        const f = pw.fluid[mid(pw, c % map.width, Math.floor(c / map.width))];
        if (room[c] < 0) expect(f).toBeLessThan(0.01);
        else if (f > 0.01) water[room[c]]++;
      }
      // The wild rooms (the start, the exit and the combat room) hold the water; the paved ones none.
      wet += [0, 3, 4].filter((k) => water[k] > 4).length;
      expect(water[1] + water[2]).toBe(0);
    }
    expect(wet).toBeGreaterThan(3);
  });

  it('builds the same floor from the same map and seed, and another from another seed', () => {
    const a = fromMap();
    expect(Array.from(fromMap().mat)).toEqual(Array.from(a.mat));
    expect(Array.from(fromMap().fluid)).toEqual(Array.from(a.fluid));
    expect(Array.from(fromMap(undefined, 8).mat)).not.toEqual(Array.from(a.mat));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/pixel-world.test.ts)`
Expected: FAIL, 2 failed | 32 passed: "raises cliffs on its walls…" (`expected [ 9, 7 ] to include 1`: without the plan the world is today's arena, its grass where the map has a wall) and "runs rivers and pools…" (water in a hall). The third test passes already (two open arenas from one seed match).

- [ ] **Step 3: Build the floor from the map**

In `packages/client/src/features/delve/arena/pixel/world.ts`:

Replace:

```ts
import type { PixelTheme, RGB } from './themes';
```

with:

```ts
import type { Rect, RoomKind } from '@alloy/engine';
import type { PixelTheme, RGB } from './themes';
```

Replace:

```ts
  burnRate?: number;
}

export const MAX_PARTICLES = 7000;
```

with:

```ts
  burnRate?: number;
  /** A generated floor's map: the floor is built from it (without one, today's open arena). */
  plan?: MapPlan;
}

/**
 * A floor map as the pixel floor builds it (plain data: it crosses to the
 * worker). Map cell (mx, my) covers floor cells from (margin + mx × ppu,
 * margin + my × ppu), `ppu` on a side.
 */
export interface MapPlan {
  /** Map size in map cells (units). */
  width: number;
  height: number;
  /** The map's cells, row by row: 0 floor, 1 wall, 2 door. */
  cells: Uint8Array;
  rooms: { kind: RoomKind; rect: Rect }[];
  /** Floor cells per map cell. */
  ppu: number;
}

/** Rooms paved in stone (the sealed arenas and the special rooms); the rest are wild ground. */
const PAVED: ReadonlySet<RoomKind> = new Set(['den', 'boss', 'vault', 'sanctum', 'alcove']);
/** Paved rooms with a rune circle at their centre. */
const RUNED: ReadonlySet<RoomKind> = new Set(['sanctum', 'boss']);

/** A room's dressing, in floor cells: paved, a river running through it, a pool, or wild ground. */
type RoomLook =
  | { kind: 'paved'; x0: number; y0: number }
  | { kind: 'river'; x: (y: number) => number }
  | { kind: 'pool'; x: number; y: number; rx: number; ry: number }
  | { kind: 'wild' };

export const MAX_PARTICLES = 7000;
```

Replace:

```ts
  readonly rubble: Uint32Array;
  /** Cells where the river enters; fluid is added here every step. */
  readonly springs: number[] = [];

```

with:

```ts
  readonly rubble: Uint32Array;
  /** How many cells into the cliffs (0 on open ground): the render darkens the deep rock. */
  readonly edge: Uint8Array;
  /** The map this floor was built from, or null (the open arena). */
  readonly plan: MapPlan | null;
  /** Cells where the river enters; fluid is added here every step. */
  readonly springs: number[] = [];
  /** Cells where fluid drains away every step: the arena's bottom rows, or each river's mouth. */
  readonly drains: number[] = [];

```

Replace:

```ts
    this.rubble = new Uint32Array(n);
    this.generate();
  }
```

with:

```ts
    this.rubble = new Uint32Array(n);
    this.edge = new Uint8Array(n);
    this.plan = opts.plan ?? null;
    if (this.plan) this.generatePlan(this.plan);
    else this.generate();
  }
```

Replace:

```ts
      const rxAtY = riverX(y);
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        this.noise[i] = hash2(x, y, this.seed);
```

with:

```ts
      const rxAtY = riverX(y);
      const ey = y < M ? M - y : y >= H - M ? y - (H - M - 1) : 0;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const ex = x < M ? M - x : x >= W - M ? x - (W - M - 1) : 0;
        this.edge[i] = ex > ey ? ex : ey;
        this.noise[i] = hash2(x, y, this.seed);
```

Replace:

```ts
      this.springs.push(W + sx + dx);

    this.placeProps(rng, nz);

    // Let the river settle into its bed before the first frame.
    for (let s = 0; s < 160; s++) {
```

with:

```ts
      this.springs.push(W + sx + dx);
    // …and it drains off the bottom edge.
    for (let i = this.size - W * 2; i < this.size; i++) this.drains.push(i);

    this.placeProps(rng, nz, [this.plaza]);
    this.settle();
    this.seedMotes(rng);
  }

  /**
   * A generated floor from its map: blocked cells become the biome's cliffs
   * (pillars and rubble too), halls worn paths, and each room is dressed: the
   * sealed arenas and special rooms paved (a rune circle in a sanctum and the
   * boss's room), the rest wild ground with a river running through, a pool,
   * or neither.
   */
  private generatePlan(plan: MapPlan): void {
    const { width: W, height: H, margin: M, theme: th } = this;
    const P = plan.ppu;
    const rng = mulberry32(this.seed);
    const ox = rng() * 1000;
    const oy = rng() * 1000;
    const nz = (x: number, y: number) => fbm(x + ox, y + oy);
    const grassThr = 0.5 + (0.5 - th.grassCover) * 0.36;
    const bushThr = 0.5 + (0.5 - th.bushCover) * 0.36;
    /** The map cell a floor cell lies in, or −1 outside the map. */
    const mapCell = (x: number, y: number) => {
      const mx = Math.floor((x - M) / P);
      const my = Math.floor((y - M) / P);
      return mx < 0 || my < 0 || mx >= plan.width || my >= plan.height ? -1 : my * plan.width + mx;
    };
    const roomOf = new Int16Array(plan.width * plan.height).fill(-1);
    plan.rooms.forEach(({ rect: r }, k) => {
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) roomOf[y * plan.width + x] = k;
    });

    // How deep each cell lies in rock: 0 on open ground, then the chessboard distance to it.
    const edge = this.edge;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = mapCell(x, y);
        edge[y * W + x] = c < 0 || plan.cells[c] === 1 ? 255 : 0;
      }
    const relax = (i: number, j: number) => {
      if (edge[j] + 1 < edge[i]) edge[i] = edge[j] + 1;
    };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (x > 0) relax(i, i - 1);
        if (y > 0) {
          relax(i, i - W);
          if (x > 0) relax(i, i - W - 1);
          if (x < W - 1) relax(i, i - W + 1);
        }
      }
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        if (x < W - 1) relax(i, i + 1);
        if (y < H - 1) {
          relax(i, i + W);
          if (x < W - 1) relax(i, i + W + 1);
          if (x > 0) relax(i, i + W - 1);
        }
      }

    const rw = th.riverWidth;
    const circles: { x: number; y: number }[] = [];
    const looks: RoomLook[] = plan.rooms.map(({ kind, rect }) => {
      const x0 = M + rect.x * P;
      const y0 = M + rect.y * P;
      const w = rect.w * P;
      const h = rect.h * P;
      if (PAVED.has(kind)) {
        if (RUNED.has(kind)) circles.push({ x: Math.round(x0 + w / 2), y: Math.round(y0 + h / 2) });
        return { kind: 'paved', x0, y0 };
      }
      const roll = rng();
      if (roll < 0.4 && w >= rw * 2 + 16) {
        const cx = x0 + w / 2;
        const amp = 2 + rng() * (w / 2 - rw - 8);
        const per = 8 + rng() * 6;
        const ph = rng() * Math.PI * 2;
        const x = (y: number) =>
          clamp(cx + amp * Math.sin(y / per + ph), x0 + rw + 4, x0 + w - rw - 4);
        // It wells up at the room's top wall, and its bottom rows drain.
        for (let dx = -Math.floor(rw / 2); dx <= Math.floor(rw / 2); dx++)
          this.springs.push(y0 * W + Math.round(x(y0)) + dx);
        for (let y = y0 + h - 2; y < y0 + h; y++)
          for (let dx = 0; dx < w; dx++) this.drains.push(y * W + x0 + dx);
        return { kind: 'river', x };
      }
      if (roll < 0.75 && th.pools > 0)
        return {
          kind: 'pool',
          x: x0 + w * (0.3 + rng() * 0.4),
          y: y0 + h * (0.3 + rng() * 0.4),
          rx: Math.min(18, w / 4),
          ry: Math.min(14, h / 4),
        };
      return { kind: 'wild' };
    });

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        this.noise[i] = hash2(x, y, this.seed);
        const base = 0.36 * (1 - y / H);
        let hh = base + (nz(x / 15, y / 15) - 0.5) * 0.05;
        const c = mapCell(x, y);
        const look =
          c < 0 || plan.cells[c] === 1 ? null : roomOf[c] < 0 ? 'hall' : looks[roomOf[c]];
        const wild = () =>
          nz(x / 18 + 20, y / 18 + 7) > grassThr
            ? nz(x / 9 + 40, y / 9 + 13) > bushThr
              ? MAT.BUSH
              : MAT.GRASS
            : MAT.SOIL;
        let m: number;
        let f = 0;
        if (look === null) {
          m = MAT.WALL;
          hh = 0.6 + nz(x / 8, y / 8) * 0.12;
          this.tone[i] = Math.min(2, (nz(x / 5 + 3, y / 5 + 9) * 3.2) | 0);
          // Foliage spills over the cliff tops, as round the open arena.
          const e = edge[i];
          if (th.grassCover > 0.3 && e < 5 && nz(x / 4 + 11, y / 4 + 5) > 0.5 + (e - 1) * 0.06) {
            m = MAT.BUSH;
            this.detail[i] |= DETAIL.OVERHANG;
          }
        } else if (look === 'hall') {
          // A worn path: bare ground, a step up from the rooms so their water stays in them.
          m = MAT.SOIL;
          hh += 0.1;
        } else if (look.kind === 'paved') {
          m = MAT.STONE;
          hh = base + 0.018;
          const fx = x - look.x0;
          const fy = y - look.y0;
          const row = Math.floor(fy / 6);
          const off = (row % 2) * 4;
          const col = Math.floor((fx + off) / 9);
          if (fy % 6 === 0 || (fx + off) % 9 === 0) this.detail[i] |= DETAIL.MORTAR;
          if (nz(x / 4 + 90, y / 4 + 30) > 0.62) this.detail[i] |= DETAIL.MOSS;
          this.tone[i] = (hash2(col, row, this.seed + 1) * 255) | 0;
        } else if (look.kind === 'river') {
          const dr = Math.abs(x - look.x(y));
          hh -= 0.06 * Math.max(0, 1 - dr / (rw + 3));
          m = dr < rw + 2 ? MAT.BANK : wild();
          if (dr < rw) f = 0.018 + 0.012 * (1 - dr / rw);
        } else if (look.kind === 'pool') {
          const pd = Math.hypot((x - look.x) / look.rx, (y - look.y) / look.ry);
          hh -= 0.1 * Math.max(0, 1 - pd);
          m = pd < 1.18 ? MAT.BANK : wild();
          if (pd < 0.9) f = 0.1 * (1 - pd) - 0.012;
        } else m = wild();
        if (m !== MAT.WALL && m !== MAT.STONE && !(this.detail[i] & DETAIL.OVERHANG))
          this.tone[i] = Math.min(3, (nz(x / 3 + 7, y / 3 + 3) * 4) | 0);
        if (m === MAT.BUSH && !(this.detail[i] & DETAIL.OVERHANG)) hh += 0.014;
        this.mat[i] = m;
        this.terrain[i] = hh;
        this.fuel[i] =
          m === MAT.GRASS ? 150 + ((this.noise[i] * 90) | 0) : m === MAT.BUSH ? 255 : 0;
        if (f > 0) this.fluid[i] = f;
      }
    }

    this.placeProps(rng, nz, circles);
    this.settle();
    this.seedMotes(rng);
  }

  /** Let the rivers settle into their beds before the first frame. */
  private settle(): void {
    for (let s = 0; s < 160; s++) {
```

Replace:

```ts
    this.wet.fill(0);

    if (th.motes) {
      for (let k = 0; k < 36; k++) {
        this.spawn(
          PART.MOTE,
          M + rng() * (W - 2 * M),
          M + rng() * (H - 2 * M),
          2 + rng() * 5,
          (rng() - 0.5) * 0.2,
          (rng() - 0.5) * 0.2,
          0,
          1e9,
          0,
        );
      }
    }
```

with:

```ts
    this.wet.fill(0);
  }

  private seedMotes(rng: () => number): void {
    const { width: W, height: H, margin: M } = this;
    if (!this.theme.motes) return;
    for (let k = 0; k < 36; k++) {
      this.spawn(
        PART.MOTE,
        M + rng() * (W - 2 * M),
        M + rng() * (H - 2 * M),
        2 + rng() * 5,
        (rng() - 0.5) * 0.2,
        (rng() - 0.5) * 0.2,
        0,
        1e9,
        0,
      );
    }
```

Replace:

```ts

  private placeProps(rng: () => number, nz: (x: number, y: number) => number): void {
    const { width: W, height: H, margin: M, theme: th } = this;
    // Rune circle and glyph in the plaza.
    const { x: cx, y: cy } = this.plaza;
    for (let dy = -9; dy <= 9; dy++) {
      for (let dx = -9; dx <= 9; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const i = y * W + x;
        if (!this.inBounds(x, y) || this.mat[i] !== MAT.STONE) continue;
        const d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        const ring = Math.abs(d - 7.5) < 0.7 && Math.sin(a * 8) > -0.55;
        // Inner triangle: distance to each edge of an equilateral triangle of radius 5.
        let tri = false;
        for (let k = 0; k < 3; k++) {
          const a0 = -Math.PI / 2 + (k * Math.PI * 2) / 3;
          const a1 = a0 + (Math.PI * 2) / 3;
          const x0 = Math.cos(a0) * 5;
          const y0 = Math.sin(a0) * 5;
          const x1 = Math.cos(a1) * 5;
          const y1 = Math.sin(a1) * 5;
          const t = clamp(
            ((dx - x0) * (x1 - x0) + (dy - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2),
            0,
            1,
          );
          if (Math.hypot(dx - (x0 + t * (x1 - x0)), dy - (y0 + t * (y1 - y0))) < 0.55) tri = true;
        }
        if (ring || tri || d < 0.8) {
          this.prop[i] = PROP.RUNE;
          this.detail[i] &= ~DETAIL.MOSS;
        }
      }
    }

```

with:

```ts

  private placeProps(
    rng: () => number,
    nz: (x: number, y: number) => number,
    circles: readonly { x: number; y: number }[],
  ): void {
    const { width: W, height: H, margin: M, theme: th } = this;
    // A rune circle and glyph in each plaza.
    for (const { x: cx, y: cy } of circles)
      for (let dy = -9; dy <= 9; dy++) {
        for (let dx = -9; dx <= 9; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          const i = y * W + x;
          if (!this.inBounds(x, y) || this.mat[i] !== MAT.STONE) continue;
          const d = Math.hypot(dx, dy);
          const a = Math.atan2(dy, dx);
          const ring = Math.abs(d - 7.5) < 0.7 && Math.sin(a * 8) > -0.55;
          // Inner triangle: distance to each edge of an equilateral triangle of radius 5.
          let tri = false;
          for (let k = 0; k < 3; k++) {
            const a0 = -Math.PI / 2 + (k * Math.PI * 2) / 3;
            const a1 = a0 + (Math.PI * 2) / 3;
            const x0 = Math.cos(a0) * 5;
            const y0 = Math.sin(a0) * 5;
            const x1 = Math.cos(a1) * 5;
            const y1 = Math.sin(a1) * 5;
            const t = clamp(
              ((dx - x0) * (x1 - x0) + (dy - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2),
              0,
              1,
            );
            if (Math.hypot(dx - (x0 + t * (x1 - x0)), dy - (y0 + t * (y1 - y0))) < 0.55) tri = true;
          }
          if (ring || tri || d < 0.8) {
            this.prop[i] = PROP.RUNE;
            this.detail[i] &= ~DETAIL.MOSS;
          }
        }
      }

```

Replace:

```ts
    }
    // Crystals studding the cliffs along the arena edge.
    for (let y = 0; y < H; y++) {
```

with:

```ts
    }
    // Crystals studding the cliffs along the floor's edge.
    for (let y = 0; y < H; y++) {
```

Replace:

```ts
        if (this.mat[i] !== MAT.WALL) continue;
        const toEdge = Math.min(x - (M - 1), W - M - x, y - (M - 1), H - M - y);
        if (toEdge > -4 && toEdge <= 0 && hash2(x, y, this.seed + 9) > 0.965) {
          this.prop[i] = PROP.CRYSTAL;
```

with:

```ts
        if (this.mat[i] !== MAT.WALL) continue;
        if (this.edge[i] < 5 && hash2(x, y, this.seed + 9) > 0.965) {
          this.prop[i] = PROP.CRYSTAL;
```

Replace:

```ts
    const rate = this.isLava ? 0.012 : 0.022;
    for (const s of this.springs) this.fluid[s] += rate;
  }
```

with:

```ts
    const rate = this.isLava ? 0.012 : 0.022;
    // A room's river wells up no deeper than this, so it never climbs into the hall above.
    const cap = this.plan ? 0.05 : Infinity;
    for (const s of this.springs) this.fluid[s] = Math.min(cap, this.fluid[s] + rate);
  }
```

Replace:

```ts
  private drainEdges(): void {
    const start = this.size - this.width * 2;
    for (let i = start; i < this.size; i++) this.fluid[i] = 0;
  }
```

with:

```ts
  private drainEdges(): void {
    for (const i of this.drains) this.fluid[i] = 0;
  }
```

In `packages/client/src/features/delve/arena/pixel/render.ts`:

Replace:

```ts
  const W = pw.width;
  const H = pw.height;
  const M = pw.margin;
  const { baseR, baseG, baseB, cachedMat, cachedDetail, jitter, crack } = S;
```

with:

```ts
  const W = pw.width;
  const { baseR, baseG, baseB, cachedMat, cachedDetail, jitter, crack } = S;
```

Replace:

```ts
    detail,
  } = pw;
```

with:

```ts
    detail,
    edge: rock,
  } = pw;
```

Replace:

```ts
  for (let y = y0; y < y0 + vh; y++) {
    const ey = y < M ? M - y : y >= H - M ? y - (H - M - 1) : 0;
    const pyBase = (y - y0) * s;
```

with:

```ts
  for (let y = y0; y < y0 + vh; y++) {
    const pyBase = (y - y0) * s;
```

Replace:

```ts
      sh = sh < 0.5 ? 0.5 : sh > 1.5 ? 1.5 : sh;
      const ex = x < M ? M - x : x >= W - M ? x - (W - M - 1) : 0;
      const edge = ex > ey ? ex : ey;
      if (edge > 0) sh *= edge > 13 ? 0.42 : 1 - edge * 0.045;
```

with:

```ts
      sh = sh < 0.5 ? 0.5 : sh > 1.5 ? 1.5 : sh;
      const edge = rock[i];
      if (edge > 0) sh *= edge > 13 ? 0.42 : 1 - edge * 0.045;
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/pixel-world.test.ts)`
Expected: PASS, 34 tests.

- [ ] **Step 5: The suite and the typecheck**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **M + 3** tests in **G** files pass.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-maps-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/hand-map.ts src/features/delve/__tests__/pixel-world.test.ts src/features/delve/arena/pixel/world.ts src/features/delve/arena/pixel/render.ts)
git add packages/client/src/features/delve/__tests__/hand-map.ts packages/client/src/features/delve/__tests__/pixel-world.test.ts packages/client/src/features/delve/arena/pixel/world.ts packages/client/src/features/delve/arena/pixel/render.ts
git commit -m "feat(client): the pixel floor built from a floor map: cliffs, worn paths, paved and wild rooms" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: Only the view simulates

### Task 2: Chunks: only the view simulates

`CHUNK`, `awake`, `setActive`; the fluid, field and fire loops over the awake cells; springs and rain asleep do nothing; the weather round the awake chunks; the render's light and sway round the view.

**Files:**
- Modify: `packages/client/src/features/delve/__tests__/pixel-world.test.ts`
- Modify: `packages/client/src/features/delve/arena/pixel/world.ts`
- Modify: `packages/client/src/features/delve/arena/pixel/render.ts`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/__tests__/pixel-world.test.ts`:

Replace:

```ts
    expect(Array.from(fromMap(undefined, 8).mat)).not.toEqual(Array.from(a.mat));
  });
});
```

with:

```ts
    expect(Array.from(fromMap(undefined, 8).mat)).not.toEqual(Array.from(a.mat));
  });
});

describe("a big floor's chunks", { timeout: 20000 }, () => {
  it('simulate only near the view and through any room that reaches it; the rest sleep', () => {
    const map = ringMap();
    const pw = fromMap(map);
    const at = (mx: number, my: number) => mid(pw, mx, my);
    // Fires in the start room's far corner, in the middle of the top hall, and in the sanctum.
    const near = at(14, 12);
    const hall = at(30, 8);
    const far = at(50, 50);
    for (const i of [near, hall, far]) pw.fire[i] = 100;
    // Wake round the start room's top-left corner: the whole room wakes, the far end of the map sleeps.
    const corner = mid(pw, 4, 4);
    const cx = corner % pw.width;
    const cy = Math.floor(corner / pw.width);
    pw.setActive(cx - 10, cy - 10, cx + 10, cy + 10);
    expect(pw.awake.some((a) => a === 0)).toBe(true);
    for (let s = 0; s < 10; s++) pw.step();
    expect(pw.fire[near]).not.toBe(100);
    expect(pw.fire[hall]).toBe(100);
    expect(pw.fire[far]).toBe(100);
    // The view moves on: the sanctum wakes.
    const fx = far % pw.width;
    const fy = Math.floor(far / pw.width);
    pw.setActive(fx - 10, fy - 10, fx + 10, fy + 10);
    pw.step();
    expect(pw.fire[far]).not.toBe(100);
  });

  it('are all awake until the view is set', () => {
    const pw = fromMap();
    expect(pw.awake.every((a) => a === 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/pixel-world.test.ts)`
Expected: FAIL, 2 failed | 34 passed: `pw.setActive is not a function`, and `Cannot read properties of undefined (reading 'every')`.

- [ ] **Step 3: Simulate the awake chunks only**

In `packages/client/src/features/delve/arena/pixel/world.ts`:

Replace:

```ts

/** Rooms paved in stone (the sealed arenas and the special rooms); the rest are wild ground. */
```

with:

```ts

/** Simulation chunks are CHUNK × CHUNK cells; an asleep chunk's fluid, fields and fire hold still. */
export const CHUNK = 32;

/** Rooms paved in stone (the sealed arenas and the special rooms); the rest are wild ground. */
```

Replace:

```ts
  readonly drains: number[] = [];

```

with:

```ts
  readonly drains: number[] = [];
  /** Chunks across and down. */
  readonly chunksW: number;
  readonly chunksH: number;
  /** 1 where a chunk simulates: all of them until `setActive`. */
  readonly awake: Uint8Array;
  /** The awake cells' indices, in order: `active` is the start of `order`. */
  private readonly order: Int32Array;
  private active: Int32Array;
  /** The chunk-aligned rectangle `setActive` last woke round. */
  private woke = '';
  /** The awake chunks' bounds (cells, ends exclusive): the weather falls there. */
  box: { x0: number; y0: number; x1: number; y1: number };

```

Replace:

```ts
    this.plan = opts.plan ?? null;
    if (this.plan) this.generatePlan(this.plan);
```

with:

```ts
    this.plan = opts.plan ?? null;
    this.chunksW = Math.ceil(this.width / CHUNK);
    this.chunksH = Math.ceil(this.height / CHUNK);
    this.awake = new Uint8Array(this.chunksW * this.chunksH).fill(1);
    this.order = new Int32Array(n).map((_, i) => i);
    this.active = this.order;
    this.box = { x0: 0, y0: 0, x1: this.width, y1: this.height };
    if (this.plan) this.generatePlan(this.plan);
```

Replace:

```ts

  // ── Stepping ────────────────────────────────────────────────────────────
```

with:

```ts

  /**
   * Simulate only the chunks under the cells [x0, x1) × [y0, y1), and every
   * room those chunks reach, whole (its river runs from its spring to its
   * mouth); the rest sleep. A generated floor's view calls it every frame;
   * the open arena stays awake.
   */
  setActive(x0: number, y0: number, x1: number, y1: number): void {
    const { width: W, height: H, chunksW: CW, chunksH: CH, awake, margin: M, plan } = this;
    const cx0 = Math.max(0, Math.floor(x0 / CHUNK));
    const cy0 = Math.max(0, Math.floor(y0 / CHUNK));
    const cx1 = Math.min(CW, Math.ceil(x1 / CHUNK));
    const cy1 = Math.min(CH, Math.ceil(y1 / CHUNK));
    const key = `${cx0},${cy0},${cx1},${cy1}`;
    if (key === this.woke) return;
    this.woke = key;
    awake.fill(0);
    /** Wake the chunks under cells [ax, bx) × [ay, by). */
    const wake = (ax: number, ay: number, bx: number, by: number) => {
      for (let cy = Math.floor(ay / CHUNK); cy < Math.min(CH, Math.ceil(by / CHUNK)); cy++)
        for (let cx = Math.floor(ax / CHUNK); cx < Math.min(CW, Math.ceil(bx / CHUNK)); cx++)
          awake[cy * CW + cx] = 1;
    };
    wake(cx0 * CHUNK, cy0 * CHUNK, cx1 * CHUNK, cy1 * CHUNK);
    for (const { rect: r } of plan?.rooms ?? []) {
      const [ax, ay] = [M + r.x * plan!.ppu, M + r.y * plan!.ppu];
      const [bx, by] = [ax + r.w * plan!.ppu, ay + r.h * plan!.ppu];
      if (ax < cx1 * CHUNK && bx > cx0 * CHUNK && ay < cy1 * CHUNK && by > cy0 * CHUNK)
        wake(ax, ay, bx, by);
    }
    let n = 0;
    const box = { x0: W, y0: H, x1: 0, y1: 0 };
    for (let y = 0; y < H; y++) {
      const row = ((y / CHUNK) | 0) * CW;
      for (let cx = 0; cx < CW; cx++) {
        if (!awake[row + cx]) continue;
        const a = cx * CHUNK;
        const b = Math.min(W, a + CHUNK);
        for (let x = a; x < b; x++) this.order[n++] = y * W + x;
        box.x0 = Math.min(box.x0, a);
        box.x1 = Math.max(box.x1, b);
        box.y0 = Math.min(box.y0, y);
        box.y1 = y + 1;
      }
    }
    this.active = this.order.subarray(0, n);
    this.box = box;
  }

  private isAwake(i: number): boolean {
    const W = this.width;
    return this.awake[((i / W / CHUNK) | 0) * this.chunksW + (((i % W) / CHUNK) | 0)] === 1;
  }

  // ── Stepping ────────────────────────────────────────────────────────────
```

Replace:

```ts
    const cap = this.plan ? 0.05 : Infinity;
    for (const s of this.springs) this.fluid[s] = Math.min(cap, this.fluid[s] + rate);
  }
```

with:

```ts
    const cap = this.plan ? 0.05 : Infinity;
    for (const s of this.springs)
      if (this.isAwake(s)) this.fluid[s] = Math.min(cap, this.fluid[s] + rate);
  }
```

Replace:

```ts
  private flowFluid(rate: number): void {
    const { width: W, size: N, terrain: h, fluid: w, dw, frost } = this;
    dw.fill(0);
    const surf = (j: number) => (frost[j] > 0.5 && w[j] > 0.003 ? Infinity : h[j] + w[j]);
    for (let i = 0; i < N; i++) {
      const wi = w[i];
```

with:

```ts
  private flowFluid(rate: number): void {
    const { width: W, size: N, terrain: h, fluid: w, dw, frost, active } = this;
    // Awake cells only (a cell clears its own as it wakes): the cost follows the view, not the map.
    for (let k = 0; k < active.length; k++) dw[active[k]] = 0;
    const surf = (j: number) => (frost[j] > 0.5 && w[j] > 0.003 ? Infinity : h[j] + w[j]);
    // ponytail: water flowing into an asleep chunk is dropped (its dw is never applied); rooms
    // wake whole, so only a hall or a clipped room loses any. Gate the edges if it ever shows.
    for (let k = 0; k < active.length; k++) {
      const i = active[k];
      const wi = w[i];
```

Replace:

```ts
    }
    for (let i = 0; i < N; i++) {
      const d = dw[i];
```

with:

```ts
    }
    for (let k = 0; k < active.length; k++) {
      const i = active[k];
      const d = dw[i];
```

Replace:

```ts
    const snowing = this.weather && this.theme.weather === 'snow';
    for (let i = 0; i < N; i++) {
      let f = fluid[i];
```

with:

```ts
    const snowing = this.weather && this.theme.weather === 'snow';
    const active = this.active;
    for (let k = 0; k < active.length; k++) {
      const i = active[k];
      let f = fluid[i];
```

Replace:

```ts
  private stepFire(): void {
    const { width: W, height: H, size: N, fire, fuel, fluid, mat, frost } = this;
    const wind = this.wind;
    for (let i = 0; i < N; i++) {
      const f = fire[i];
```

with:

```ts
  private stepFire(): void {
    const { width: W, height: H, fire, fuel, fluid, mat, frost, active } = this;
    const wind = this.wind;
    for (let k = 0; k < active.length; k++) {
      const i = active[k];
      const f = fire[i];
```

Replace:

```ts
  private spawnWeather(): void {
    const { width: W, height: H, margin: M, rand: r } = this;
    switch (this.theme.weather) {
```

with:

```ts
  private spawnWeather(): void {
    // It falls round the awake chunks (all of the open arena).
    const { x0: X, y0: Y } = this.box;
    const W = this.box.x1 - X;
    const H = this.box.y1 - Y;
    const M = this.plan ? 0 : this.margin;
    const r = this.rand;
    switch (this.theme.weather) {
```

Replace:

```ts
            PART.RAIN,
            r() * (W + 40) - 20 - this.wind * 30,
            r() * H,
            30 + r() * 30,
```

with:

```ts
            PART.RAIN,
            X + r() * (W + 40) - 20 - this.wind * 30,
            Y + r() * H,
            30 + r() * 30,
```

Replace:

```ts
            PART.SNOW,
            r() * (W + 30) - 15 - this.wind * 20,
            r() * H,
            25 + r() * 35,
```

with:

```ts
            PART.SNOW,
            X + r() * (W + 30) - 15 - this.wind * 20,
            Y + r() * H,
            25 + r() * 35,
```

Replace:

```ts
        for (let k = 0; k < (r() < 0.6 ? 1 : 0); k++) {
          const x = M + r() * (W - 2 * M);
          const y = M + r() * (H - 2 * M);
          this.spawn(
```

with:

```ts
        for (let k = 0; k < (r() < 0.6 ? 1 : 0); k++) {
          const x = X + M + r() * (W - 2 * M);
          const y = Y + M + r() * (H - 2 * M);
          this.spawn(
```

Replace:

```ts
              PART.MIST,
              r() * W,
              r() * H,
              1 + r() * 3,
```

with:

```ts
              PART.MIST,
              X + r() * W,
              Y + r() * H,
              1 + r() * 3,
```

Replace:

```ts
    const r = this.rand;
    if (this.mat[i] === MAT.WALL) return;
    if (this.fluid[i] > 0.004) {
```

with:

```ts
    const r = this.rand;
    if (this.mat[i] === MAT.WALL || !this.isAwake(i)) return;
    if (this.fluid[i] > 0.004) {
```

In `packages/client/src/features/delve/arena/pixel/render.ts`:

Replace:

```ts

function boxBlur(buf: Float32Array, w: number, h: number, r: number, tmp: Float32Array): void {
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const first = buf[row];
```

with:

```ts

/** Box-blur the `w` × `h` window at (x0, y0) of a buffer `stride` wide, its edges held. */
function boxBlur(
  buf: Float32Array,
  stride: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  tmp: Float32Array,
): void {
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = (y0 + y) * stride + x0;
    const first = buf[row];
```

Replace:

```ts
  for (let x = 0; x < w; x++) {
    const first = buf[x];
    const last = buf[(h - 1) * w + x];
    let acc = first * (r + 1);
    for (let k = 1; k <= r; k++) acc += buf[(k < h ? k : h - 1) * w + x];
    for (let y = 0; y < h; y++) {
```

with:

```ts
  for (let x = 0; x < w; x++) {
    const col = y0 * stride + x0 + x;
    const first = buf[col];
    const last = buf[col + (h - 1) * stride];
    let acc = first * (r + 1);
    for (let k = 1; k <= r; k++) acc += buf[col + (k < h ? k : h - 1) * stride];
    for (let y = 0; y < h; y++) {
```

Replace:

```ts
      const si = y - r;
      acc += (ai < h ? buf[ai * w + x] : last) - (si >= 0 ? buf[si * w + x] : first);
    }
    for (let y = 0; y < h; y++) buf[y * w + x] = tmp[y];
  }
```

with:

```ts
      const si = y - r;
      acc += (ai < h ? buf[col + ai * stride] : last) - (si >= 0 ? buf[col + si * stride] : first);
    }
    for (let y = 0; y < h; y++) buf[col + y * stride] = tmp[y];
  }
```

Replace:

```ts
  const { lw, lh, lr, lg, lb } = S;
  lr.fill(0);
  lg.fill(0);
  lb.fill(0);
  const { mat, noise, fluid, frost, fire, charge, prop, propColor } = pw;
```

with:

```ts
  const { lw, lh, lr, lg, lb } = S;
  const { mat, noise, fluid, frost, fire, charge, prop, propColor } = pw;
```

Replace:

```ts
  const cy1 = Math.min(H, y0 + vh + LIGHT_PAD);
  const gr = (glow[0] / 255) * gs * 0.11;
```

with:

```ts
  const cy1 = Math.min(H, y0 + vh + LIGHT_PAD);
  // Only the light round the view is cleared and blurred, so a big floor costs no more than a small one:
  // light from farther off never reaches the view (the blur spreads 4 light cells, the pad is 7).
  const wx0 = cx0 >> 1;
  const wy0 = cy0 >> 1;
  const ww = Math.min(lw, (cx1 + 1) >> 1) - wx0;
  const wh = Math.min(lh, (cy1 + 1) >> 1) - wy0;
  for (let y = wy0; y < wy0 + wh; y++) {
    const a = y * lw + wx0;
    lr.fill(0, a, a + ww);
    lg.fill(0, a, a + ww);
    lb.fill(0, a, a + ww);
  }
  const gr = (glow[0] / 255) * gs * 0.11;
```

Replace:

```ts
  for (let pass = 0; pass < 2; pass++) {
    boxBlur(lr, lw, lh, BLUR_RADIUS, S.tmp);
    boxBlur(lg, lw, lh, BLUR_RADIUS, S.tmp);
    boxBlur(lb, lw, lh, BLUR_RADIUS, S.tmp);
  }
```

with:

```ts
  for (let pass = 0; pass < 2; pass++) {
    boxBlur(lr, lw, wx0, wy0, ww, wh, BLUR_RADIUS, S.tmp);
    boxBlur(lg, lw, wx0, wy0, ww, wh, BLUR_RADIUS, S.tmp);
    boxBlur(lb, lw, wx0, wy0, ww, wh, BLUR_RADIUS, S.tmp);
  }
```

Replace:

```ts
  const by1 = Math.min(Math.ceil(H / 4) - 1, (y0 + vh + 3) >> 2);
  for (let by = y0 >> 2; by <= by1; by++) {
    for (let bx = 0; bx < sgw; bx++) {
      const x = bx * 4 + 2;
```

with:

```ts
  const by1 = Math.min(Math.ceil(H / 4) - 1, (y0 + vh + 3) >> 2);
  const bx1 = Math.min(sgw - 1, (x0 + vw - 1) >> 2);
  for (let by = y0 >> 2; by <= by1; by++) {
    for (let bx = x0 >> 2; bx <= bx1; bx++) {
      const x = bx * 4 + 2;
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/pixel-world.test.ts src/features/delve/__tests__/floor-engine.test.ts)`
Expected: PASS, 36 and 5 tests.

- [ ] **Step 5: The suite and the typecheck**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **M + 5** tests in **G** files pass.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-maps-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/pixel-world.test.ts src/features/delve/arena/pixel/world.ts src/features/delve/arena/pixel/render.ts)
git add packages/client/src/features/delve/__tests__/pixel-world.test.ts packages/client/src/features/delve/arena/pixel/world.ts packages/client/src/features/delve/arena/pixel/render.ts
git commit -m "feat(client): the pixel floor simulates the chunks under the view and the rooms they reach" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The floor from the world, and the doors and props

### Task 3: `floorInit`: the floor from the world

**Files:**
- Modify: `packages/client/src/features/delve/__tests__/floor-engine.test.ts`
- Modify: `packages/client/src/features/delve/arena/pixel/floor-engine.ts`
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/__tests__/floor-engine.test.ts`:

Replace:

```ts
import { describe, it, expect } from 'vitest';
import { beginFloor, createDelveProfile, startDive, type ArpgEvent } from '@alloy/engine';
import {
  FloorEngine,
  FLOOR_PPU,
  FLOOR_SCALE,
  snapshotArena,
  type FloorFrame,
} from '../arena/pixel/floor-engine';
import { getDelveRegistry } from '../registry';

const registry = getDelveRegistry();

```

with:

```ts
import { describe, it, expect } from 'vitest';
import {
  beginFloor,
  createDelveProfile,
  generateFloor,
  startDive,
  type ArpgEvent,
  type FloorMap,
} from '@alloy/engine';
import {
  FloorEngine,
  FLOOR_MARGIN,
  FLOOR_PPU,
  FLOOR_SCALE,
  floorInit,
  snapshotArena,
  type FloorFrame,
} from '../arena/pixel/floor-engine';
import { getDelveRegistry } from '../registry';
import { gridMap, ringMap } from './hand-map';

const registry = getDelveRegistry();

```

Replace:

```ts
    expect(() => structuredClone(snap)).not.toThrow();
  });
});
```

with:

```ts
    expect(() => structuredClone(snap)).not.toThrow();
  });
});

describe('a generated floor', { timeout: 20000 }, () => {
  /** Today's first floor of a dive, on `map` (the generator is B1's; until then the dive is the open room). */
  function onMap(map?: FloorMap) {
    const world = beginFloor(registry, startDive(registry, createDelveProfile(registry, 99), 1));
    if (map) Object.assign(world, { map, width: map.width, height: map.height });
    return world;
  }

  it('is built from its map and seeded by it; the open arena as ever', () => {
    const open = floorInit(onMap());
    expect(open.plan).toBeUndefined();
    expect(open.seed).toBeUndefined();
    const init = floorInit(onMap(ringMap()));
    expect(init.plan).toMatchObject({ width: 64, height: 64, ppu: FLOOR_PPU });
    expect(init.plan!.rooms.map((r) => r.kind)).toEqual([
      'start',
      'vault',
      'sanctum',
      'exit',
      'combat',
    ]);
    // Plain data, for the worker; the same map, the same seed; another map, another.
    expect(() => structuredClone(init)).not.toThrow();
    expect(floorInit(onMap(ringMap())).seed).toBe(init.seed);
    expect(floorInit(onMap(gridMap())).seed).not.toBe(init.seed);
    const engine = new FloorEngine(init);
    expect(engine.world.plan).not.toBeNull();
    expect(engine.world.width).toBe((64 + 2 * FLOOR_MARGIN) * FLOOR_PPU);
  });

  it("builds a generator's floor: rock where its walls are, ground where it walks", () => {
    const map = generateFloor(registry, 11, 3, registry.getBiomeForDepth(3), null);
    const pw = new FloorEngine(floorInit(onMap(map))).world;
    const M = FLOOR_MARGIN * FLOOR_PPU;
    for (let c = 0; c < map.cells.length; c++) {
      const [mx, my] = [c % map.width, Math.floor(c / map.width)];
      const i = (M + my * FLOOR_PPU + 2) * pw.width + M + mx * FLOOR_PPU + 2;
      expect(pw.edge[i] > 0).toBe(map.cells[c] === 1);
    }
  });

  it('simulates round the view only; the open arena all of it', () => {
    const big = new FloorEngine(floorInit(onMap(ringMap())));
    big.frame(frame({ dt: 0.1, view: { left: 0, top: 0, right: 20, bottom: 14 } }));
    expect(big.world.awake.some((a) => a === 0)).toBe(true);
    const open = new FloorEngine(floorInit(onMap()));
    open.frame(frame({ dt: 0.1 }));
    expect(open.world.awake.every((a) => a === 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/floor-engine.test.ts)`
Expected: FAIL, 3 failed | 5 passed: `(0 , floorInit) is not a function`.

- [ ] **Step 3: `floorInit`, the seed, and the view's chunks**

In `packages/client/src/features/delve/arena/pixel/floor-engine.ts`:

Replace:

```ts
import type { ArpgEvent, ArpgWorld, ManaType, Rarity } from '@alloy/engine';
import { PixelWorld, type PixelLight } from './world';
import { renderPixelWorld, type RenderView } from './render';
```

with:

```ts
import type { ArpgEvent, ArpgWorld, ManaType, Rarity } from '@alloy/engine';
import { PixelWorld, type MapPlan, type PixelLight } from './world';
import { renderPixelWorld, type RenderView } from './render';
```

Replace:

```ts
  depth: number;
}
```

with:

```ts
  depth: number;
  /** A generated floor's map (without one, the open arena), and the floor's own seed. */
  plan?: MapPlan;
  seed?: number;
}
```

Replace:

```ts

/** Capture what the floor needs from the arena this frame. */
```

with:

```ts

/**
 * What a world's floor is built from: the open arena by its size (seeded by
 * its depth and biome, as ever); a generated floor by its map, seeded by the
 * map's cells, the floor seed's own (its `layout` fork).
 */
export function floorInit(w: ArpgWorld): FloorInit {
  const init = { arenaWidth: w.width, arenaHeight: w.height, biomeId: w.biomeId, depth: w.depth };
  const map = w.map;
  if (map.open) return init;
  let seed = 2166136261 ^ w.depth;
  for (const c of map.cells) seed = Math.imul(seed ^ c, 16777619);
  return {
    ...init,
    seed: seed >>> 0,
    // Plain data: no fields the floor never reads (the rooms' home fields).
    plan: {
      width: map.width,
      height: map.height,
      cells: map.cells,
      rooms: map.rooms.map(({ kind, rect }) => ({ kind, rect })),
      ppu: FLOOR_PPU,
    },
  };
}

/** Capture what the floor needs from the arena this frame. */
```

Replace:

```ts
      margin: FLOOR_MARGIN * FLOOR_PPU,
      seed: (Math.imul(init.depth, 7919) + hashString(init.biomeId)) >>> 0,
      theme: themeForBiome(init.biomeId),
```

with:

```ts
      margin: FLOOR_MARGIN * FLOOR_PPU,
      seed: init.seed ?? (Math.imul(init.depth, 7919) + hashString(init.biomeId)) >>> 0,
      theme: themeForBiome(init.biomeId),
```

Replace:

```ts
      burnRate: 3,
    });
```

with:

```ts
      burnRate: 3,
      plan: init.plan,
    });
```

Replace:

```ts
    for (const e of f.events) applyArenaEvent(this.world, e, FLOOR_PPU, FLOOR_MARGIN);
    if (f.dt > 0) {
```

with:

```ts
    for (const e of f.events) applyArenaEvent(this.world, e, FLOOR_PPU, FLOOR_MARGIN);
    // A generated floor simulates the chunks under the view, and the rooms they reach, only.
    if (this.world.plan) {
      const a = this.cell(f.view.left, f.view.top);
      const b = this.cell(f.view.right, f.view.bottom);
      this.world.setActive(a.x, a.y, b.x, b.y);
    }
    if (f.dt > 0) {
```

In `packages/client/src/features/delve/arena/ArenaRenderer.ts`:

Replace:

```ts
import { PixelFloor } from './pixel/pixel-floor';
import { SPRITE_PIXEL, spriteFrames } from './sprites';
```

with:

```ts
import { PixelFloor } from './pixel/pixel-floor';
import { floorInit } from './pixel/floor-engine';
import { SPRITE_PIXEL, spriteFrames } from './sprites';
```

Replace:

```ts
    this.pixelFloor?.destroy();
    this.pixelFloor = new PixelFloor({
      arenaWidth: world.width,
      arenaHeight: world.height,
      biomeId: biome.id,
      depth: world.depth,
    });
    this.root.addChildAt(this.pixelFloor.sprite, 1);
```

with:

```ts
    this.pixelFloor?.destroy();
    this.pixelFloor = new PixelFloor(floorInit(world));
    this.root.addChildAt(this.pixelFloor.sprite, 1);
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/floor-engine.test.ts src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: PASS, 8 and 19 tests.

- [ ] **Step 5: The suite and the typecheck**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **M + 8** tests in **G** files pass.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-maps-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/floor-engine.test.ts src/features/delve/arena/pixel/floor-engine.ts src/features/delve/arena/ArenaRenderer.ts)
git add packages/client/src/features/delve/__tests__/floor-engine.test.ts packages/client/src/features/delve/arena/pixel/floor-engine.ts packages/client/src/features/delve/arena/ArenaRenderer.ts
git commit -m "feat(client): the pixel floor from the world's map, seeded by it, awake under the view" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: Doors and props

**Files:**
- Modify: `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts`

- [ ] **Step 1: The failing tests** (the props' art is mocked: jsdom never loads the atlas, so every other sprite id stays without art, as before)

In `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`:

Replace:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CanvasTextMetrics, Container, Text, type Application, type Graphics } from 'pixi.js';
import {
  computeHeroStats,
  createSandboxWorld,
  defaultChains,
  type ArpgEvent,
  type ArpgWorld,
  type Drop,
  type GearItem,
} from '@alloy/engine';
import {
  ArenaRenderer,
  drawDrop,
  dropPlaque,
  dropPop,
  holdPing,
  pickupColor,
  pruneViews,
  stackPlaques,
} from '../arena/ArenaRenderer';
```

with:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  CanvasTextMetrics,
  Container,
  Text,
  Texture,
  type Application,
  type Graphics,
  type Sprite,
} from 'pixi.js';
import {
  computeHeroStats,
  createSandboxWorld,
  defaultChains,
  type ArpgEvent,
  type ArpgWorld,
  type Door,
  type Drop,
  type FloorMap,
  type GearItem,
} from '@alloy/engine';
import {
  ArenaRenderer,
  drawDrop,
  dropPlaque,
  drawDoor,
  dropPop,
  holdPing,
  pickupColor,
  propFrame,
  pruneViews,
  stackPlaques,
} from '../arena/ArenaRenderer';
```

Replace:

```ts
import { getDelveRegistry } from '../registry';
import { spritePixelScale } from '../arena/camera';
import { useUIStore } from '@/stores/uiStore';

/** A Graphics stand-in that records the colours it fills. */
function recorder() {
```

with:

```ts
import { getDelveRegistry } from '../registry';
import { spritePixelScale } from '../arena/camera';
import { useUIStore } from '@/stores/uiStore';
import { ringMap } from './hand-map';

// The props' art: two frames each (the atlas isn't loaded under jsdom; nothing else has art here).
vi.mock('../arena/sprites', async (importOriginal) => {
  const { Texture } = await import('pixi.js');
  const props = ['chest', 'shrine', 'alcove_anvil', 'exit_gate'];
  return {
    ...(await importOriginal<typeof import('../arena/sprites')>()),
    spriteFrames: (id: string) => (props.includes(id) ? [Texture.WHITE, Texture.EMPTY] : null),
  };
});

/** A Graphics stand-in that records the colours it fills. */
function recorder() {
```

Replace:

```ts
      }
  });
});
```

with:

```ts
      }
  });
});

/** `floor()` on a hand-built map, every cell in sight, the hero at its start. */
function onMap(map: FloorMap): ArpgWorld {
  const w = floor(map.start.x, map.start.y);
  Object.assign(w, {
    map,
    width: map.width,
    height: map.height,
    fog: new Uint8Array(map.width * map.height).fill(2),
  });
  return w;
}

// A floor on ringMap builds its 64 × 64 pixel floor in the thread (jsdom has no workers).
describe("a generated floor's doors and props", { timeout: 20000 }, () => {
  it('frames a door with stone posts; shut, iron bars slide across it, glowing red', () => {
    const door: Door = {
      id: 0,
      cells: [16, 17, 18].map((x) => ({ x, y: 9 })),
      rooms: [0, 1],
      closed: true,
    };
    const open = recorder();
    drawDoor(open.g, door, 0, 1);
    expect(open.fills).toEqual([0x5a6988, 0x5a6988]);
    const shut = recorder();
    drawDoor(shut.g, door, 1, 1);
    expect(shut.fills.slice(0, 3)).toEqual([0x5a6988, 0x5a6988, 0xe43b44]);
    // A bar every 0.3 units across its 3 cells.
    expect(shut.fills.filter((c) => c === 0x8b9bb4)).toHaveLength(10);
  });

  it("slides a door's bars shut and open over a quarter second", () => {
    const { r } = stage();
    const w = onMap(ringMap());
    show(r, w);
    const shut = (r as unknown as { doorShut: Map<number, number> }).doorShut;
    expect(shut.get(0)).toBe(0);
    w.map.doors[0].closed = true;
    r.update(0.1);
    expect(shut.get(0)).toBeCloseTo(0.4);
    r.update(0.2);
    expect(shut.get(0)).toBe(1);
    w.map.doors[0].closed = false;
    r.update(0.05);
    expect(shut.get(0)).toBeCloseTo(0.8);
  });

  it('picks each prop its frame: open, spent, a gate once it may be taken, an anvil flickering till used', () => {
    expect(propFrame('chest', false, true, 0).frame).toBe(0);
    expect(propFrame('chest', true, true, 0).frame).toBe(1);
    expect(propFrame('shrine', true, true, 0).frame).toBe(1);
    expect(propFrame('gate', false, false, 0).frame).toBe(0);
    expect(propFrame('gate', false, true, 0).frame).toBe(1);
    const flicker = [0, 0.4].map((t) => propFrame('alcove', false, true, t));
    expect(flicker.map((f) => f.frame)).toEqual([0, 1]);
    expect(propFrame('alcove', true, true, 0.4)).toEqual({ frame: 0, tint: 0x8b8b8b });
  });

  it("stands each room's prop at its interactable, in its state", () => {
    const { r } = stage();
    const w = onMap(ringMap());
    show(r, w);
    const props = (r as unknown as { props: Map<string, { sprite: Sprite }> }).props;
    expect([...props.keys()]).toEqual(['1:1', '1:2', '1:3']);
    const chest = props.get('1:1')!.sprite;
    // Centred on its spot, its base below it (a 0.9 chest), sorted among the creatures by its base.
    expect(chest.position.x).toBe(50);
    expect(chest.position.y).toBeCloseTo(9 + 0.45);
    expect(chest.zIndex).toBeCloseTo(9 + 0.45 - 0.5);
    expect(chest.texture).toBe(Texture.WHITE);
    w.map.rooms[1].interactable!.used = true;
    r.update(0.1);
    expect(chest.texture).toBe(Texture.EMPTY);
    // No boss: the gate stands open; while a boss lives, it is shut.
    const gate = props.get('1:3')!.sprite;
    expect(gate.texture).toBe(Texture.EMPTY);
    w.bossId = 99;
    r.update(0.1);
    expect(gate.texture).toBe(Texture.WHITE);
    w.bossKilled = true;
    r.update(0.1);
    expect(gate.texture).toBe(Texture.EMPTY);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: FAIL, 4 failed | 19 passed: `drawDoor is not a function`, `propFrame is not a function`, and `Cannot read properties of undefined (reading 'get')` / `(reading 'keys')` (no `doorShut`, no `props`).

- [ ] **Step 3: Draw the doors and the props**

In `packages/client/src/features/delve/arena/ArenaRenderer.ts`:

Replace:

```ts
  type ArpgWorld,
  type BiomeDef,
  type Drop,
  type GearItem,
  type ManaType,
  type MaterialRef,
  type MonsterEntity,
  type Vec,
} from '@alloy/engine';
```

with:

```ts
  type ArpgWorld,
  type BiomeDef,
  type Door,
  type Drop,
  type GearItem,
  type InteractableKind,
  type ManaType,
  type MaterialRef,
  type MonsterEntity,
  type PropId,
  type Vec,
} from '@alloy/engine';
```

Replace:

```ts
const FONT = 'Rajdhani, "DM Sans", system-ui, sans-serif';

/** Forms cast on the hero itself: they burst outward instead of flinging at a target. */
const SELF_FORMS = new Set(['nova', 'ward', 'armor', 'surge']);
```

with:

```ts
const FONT = 'Rajdhani, "DM Sans", system-ui, sans-serif';

/** A door's posts, its bars, and the glow of a sealed one (ENDESGA 32). */
const DOOR_STONE = 0x5a6988;
const DOOR_IRON = 0x8b9bb4;
const DOOR_SEAL = 0xe43b44;
/** Seconds a door's bars take to slide shut, or back open. */
const DOOR_SECONDS = 0.25;

/** Each interactable's prop in the atlas. */
const PROP_SPRITE: Record<InteractableKind, PropId> = {
  chest: 'chest',
  shrine: 'shrine',
  alcove: 'alcove_anvil',
  gate: 'exit_gate',
};

/** Forms cast on the hero itself: they burst outward instead of flinging at a target. */
const SELF_FORMS = new Set(['nova', 'ward', 'armor', 'surge']);
```

Replace:

```ts
  private floor = new Graphics();
  private pixelFloor: PixelFloor | null = null;
  private dropLayer = new Container();
  private entities = new Container();
```

with:

```ts
  private floor = new Graphics();
  private pixelFloor: PixelFloor | null = null;
  /** A generated floor's doors, under the drops, redrawn every frame. */
  private doorGfx = new Graphics();
  /** How shut each door's bars are, 0 to 1. */
  private doorShut = new Map<number, number>();
  /** The rooms' props by interactable id, with their atlas frames. */
  private props = new Map<string, { sprite: Sprite; frames: Texture[] }>();
  private dropLayer = new Container();
  private entities = new Container();
```

Replace:

```ts
      this.floor,
      this.groundFx.sprite,
      this.dropLayer,
      this.entities,
```

with:

```ts
      this.floor,
      this.groundFx.sprite,
      this.doorGfx,
      this.dropLayer,
      this.entities,
```

Replace:

```ts
    this.floats = [];
    this.drawFloor();
    this.pixelFloor?.destroy();
    this.pixelFloor = new PixelFloor(floorInit(world));
```

with:

```ts
    this.floats = [];
    this.drawFloor();
    this.doorShut.clear();
    this.makeProps(world);
    this.pixelFloor?.destroy();
    this.pixelFloor = new PixelFloor(floorInit(world));
```

Replace:

```ts
  }

  private emoji(glyph: string): Texture {
    let tex = this.textures.get(glyph);
```

with:

```ts
  }

  /** The rooms' props from the atlas, standing at their interactables (none without art). */
  private makeProps(w: ArpgWorld): void {
    for (const v of this.props.values()) v.sprite.destroy();
    this.props.clear();
    const sizes = getDelveRegistry().getDelveData().layouts.props;
    for (const { interactable: it } of w.map.rooms) {
      const frames = it && spriteFrames(PROP_SPRITE[it.kind]);
      if (!it || !frames) continue;
      // Its base on the floor below the spot, sorted among the creatures by it.
      const base = it.y + sizes[PROP_SPRITE[it.kind]] / 2;
      const sprite = new Sprite(frames[0]);
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(SPRITE_PIXEL);
      sprite.position.set(it.x, base);
      sprite.zIndex = base - 0.5;
      this.entities.addChild(sprite);
      this.props.set(it.id, { sprite, frames });
    }
  }

  private emoji(glyph: string): Texture {
    let tex = this.textures.get(glyph);
```

Replace:

```ts
    this.syncMonsters(w);
    this.syncDrops(w);
    drawZones(ground, w, this.time);
    drawLobs(ground, air, w, this.time);
```

with:

```ts
    this.syncMonsters(w);
    this.syncDrops(w);
    this.syncProps(w);
    this.drawDoors(w, dt);
    drawZones(ground, w, this.time);
    drawLobs(ground, air, w, this.time);
```

Replace:

```ts
  }

  private syncDrops(w: ArpgWorld): void {
    const alive = new Set<number>();
```

with:

```ts
  }

  /** Each prop in its state (`propFrame`); a gate opens once no boss lives. */
  private syncProps(w: ArpgWorld): void {
    const open = w.bossId === null || w.bossKilled;
    for (const { interactable: it } of w.map.rooms) {
      const v = it && this.props.get(it.id);
      if (!it || !v) continue;
      const f = propFrame(it.kind, it.used, open, this.time);
      v.sprite.texture = v.frames[f.frame % v.frames.length];
      v.sprite.tint = f.tint;
    }
  }

  /** The doors, each one's bars easing toward its state over `DOOR_SECONDS`. */
  private drawDoors(w: ArpgWorld, dt: number): void {
    const g = this.doorGfx;
    g.clear();
    for (const d of w.map.doors) {
      const was = this.doorShut.get(d.id) ?? (d.closed ? 1 : 0);
      const step = dt / DOOR_SECONDS;
      const shut = d.closed ? Math.min(1, was + step) : Math.max(0, was - step);
      this.doorShut.set(d.id, shut);
      drawDoor(g, d, shut, this.time);
    }
  }

  private syncDrops(w: ArpgWorld): void {
    const alive = new Set<number>();
```

Replace:

```ts
}

/**
 * A pickup's sparkle: the item's rarity, a rune's family, a material's
```

with:

```ts
}

/**
 * A door: a stone post at each end of its cells and, as it shuts (`shut` 0 → 1),
 * iron bars sliding across it, glowing red while they hold its room sealed.
 * Whole sprite pixels (0.1 units).
 */
export function drawDoor(g: Graphics, d: Door, shut: number, time: number): void {
  const xs = d.cells.map((c) => c.x);
  const ys = d.cells.map((c) => c.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) + 1 - x0;
  const h = Math.max(...ys) + 1 - y0;
  // Across a hall running up and down (wider than deep), or across one running sideways.
  const across = w >= h;
  if (across) {
    g.rect(x0 - 0.3, y0, 0.3, h).fill({ color: DOOR_STONE });
    g.rect(x0 + w, y0, 0.3, h).fill({ color: DOOR_STONE });
  } else {
    g.rect(x0, y0 - 0.3, w, 0.3).fill({ color: DOOR_STONE });
    g.rect(x0, y0 + h, w, 0.3).fill({ color: DOOR_STONE });
  }
  if (shut <= 0) return;
  g.rect(x0, y0, w, h).fill({ color: DOOR_SEAL, alpha: (0.25 + 0.15 * Math.sin(time * 6)) * shut });
  // A bar every 3 sprite pixels, slid `shut` of the way in.
  const bars = Math.round((across ? w : h) / 0.3);
  for (let k = 0; k < bars; k++) {
    if (across) g.rect(x0 + 0.1 + k * 0.3, y0, 0.1, h * shut).fill({ color: DOOR_IRON });
    else g.rect(x0, y0 + 0.1 + k * 0.3, w * shut, 0.1).fill({ color: DOOR_IRON });
  }
}

/**
 * A prop's atlas frame and tint: a chest opens (frame 1) and a shrine goes dark
 * once used; a gate opens once it may be taken; an anvil's glow flickers until
 * used, then it stands dimmed.
 */
export function propFrame(
  kind: InteractableKind,
  used: boolean,
  gateOpen: boolean,
  time: number,
): { frame: number; tint: number } {
  if (kind === 'gate') return { frame: gateOpen ? 1 : 0, tint: 0xffffff };
  if (kind !== 'alcove') return { frame: used ? 1 : 0, tint: 0xffffff };
  return used ? { frame: 0, tint: 0x8b8b8b } : { frame: Math.floor(time * 3) % 2, tint: 0xffffff };
}

/**
 * A pickup's sparkle: the item's rarity, a rune's family, a material's
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: PASS, 23 tests.

- [ ] **Step 5: The suite and the typecheck**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **M + 12** tests in **G** files pass.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-maps-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/arena-renderer.test.ts src/features/delve/arena/ArenaRenderer.ts)
git add packages/client/src/features/delve/__tests__/arena-renderer.test.ts packages/client/src/features/delve/arena/ArenaRenderer.ts
git commit -m "feat(client): door frames that bar shut and glow while sealed; the rooms' props in their state" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The fog

### Task 5: The fog layer, foes in sight, the camera on the map

**Files:**
- Modify: `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts`

- [ ] **Step 1: The failing tests** (the stand-in renderer gains `generateTexture`: a foe without art draws its emoji through it)

In `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`:

Replace:

```ts
  computeHeroStats,
  createSandboxWorld,
  defaultChains,
  type ArpgEvent,
  type ArpgWorld,
  type Door,
```

with:

```ts
  computeHeroStats,
  createSandboxWorld,
  defaultChains,
  spawnDummies,
  type ArpgEvent,
  type ArpgWorld,
  type Door,
```

Replace:

```ts
  drawDoor,
  dropPop,
  holdPing,
  pickupColor,
  propFrame,
  pruneViews,
```

with:

```ts
  drawDoor,
  dropPop,
  holdPing,
  paintFog,
  pickupColor,
  propFrame,
  pruneViews,
```

Replace:

```ts
/** A renderer on a stand-in app (no GPU): a `width`×`height` screen at resolution `res`. */
function stage(width = 1920, height = 1080, res = 1) {
  const app = {
    renderer: { render() {}, resolution: res },
    stage: new Container(),
    screen: { width, height },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
```

with:

```ts
/** A renderer on a stand-in app (no GPU): a `width`×`height` screen at resolution `res`. */
function stage(width = 1920, height = 1080, res = 1) {
  const app = {
    // A creature without art draws its emoji, as a generated texture.
    renderer: { render() {}, resolution: res, generateTexture: () => Texture.EMPTY },
    stage: new Container(),
    screen: { width, height },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
```

Replace:

```ts
    expect(gate.texture).toBe(Texture.EMPTY);
  });
});
```

with:

```ts
    expect(gate.texture).toBe(Texture.EMPTY);
  });
});

describe("a generated floor's fog", { timeout: 20000 }, () => {
  it('blacks out the unseen, dims the seen, clears what is in sight, and shows the walls round it', () => {
    const map = ringMap();
    const fog = new Uint8Array(64 * 64);
    const cells = (k: number) => {
      const r = map.rooms[k].rect;
      return Array.from(
        { length: r.w * r.h },
        (_, i) => (r.y + Math.floor(i / r.w)) * 64 + r.x + (i % r.w),
      );
    };
    for (const c of cells(0)) fog[c] = 2;
    for (const c of cells(1)) fog[c] = 1;
    const pad = 3;
    const out = new Uint8Array((64 + pad * 2) ** 2 * 4);
    paintFog(map, fog, pad, out);
    const alpha = (x: number, y: number) => out[((y + pad) * (64 + pad * 2) + x + pad) * 4 + 3];
    expect(alpha(8, 8)).toBe(0); // in the start room
    expect(alpha(3, 8)).toBe(0); // its wall
    expect(alpha(50, 8)).toBe(150); // the vault, seen before
    expect(alpha(50, 50)).toBe(255); // the sanctum, never seen
    expect(alpha(0, 0)).toBe(255);
    expect(alpha(-3, -3)).toBe(255); // the cliffs past the edge
    expect(out[(pad * (64 + pad * 2) + pad) * 4]).toBe(0); // black
  });

  it('lays over a generated floor (none on the open room), and redraws when the fog moves on', () => {
    const { r } = stage();
    show(r, floor());
    expect((r as unknown as { fog: unknown }).fog).toBeNull();
    const w = onMap(ringMap());
    w.fog.fill(0);
    show(r, w);
    const fog = (r as unknown as { fog: { sprite: Sprite; pixels: Uint8Array } }).fog;
    expect(fog.sprite.position.x).toBe(-3);
    const at = (x: number, y: number) => fog.pixels[((y + 3) * 70 + x + 3) * 4 + 3];
    expect(at(8, 8)).toBe(255);
    w.fog.fill(2);
    r.update(0.1);
    expect(at(8, 8)).toBe(255); // the same fogVersion: not redrawn
    w.fogVersion++;
    r.update(0.1);
    expect(at(8, 8)).toBe(0);
  });

  it('shows a foe, and the numbers of its hits, only while the hero sees it', () => {
    const { r } = stage();
    const w = onMap(ringMap());
    const [foe] = spawnDummies(getDelveRegistry(), w, { layout: 'single', element: null });
    Object.assign(foe, { x: 10, y: 8 });
    show(r, w);
    const view = () =>
      (r as unknown as { monsters: Map<number, { root: Container }> }).monsters.get(foe.id)!.root;
    expect(view().visible).toBe(true);
    const floats = () => (r as unknown as { floats: unknown[] }).floats.length;
    const hit: ArpgEvent = {
      kind: 'hit',
      id: foe.id,
      x: 10,
      y: 8,
      amount: 12,
      crit: false,
      element: null,
      heft: 0,
      source: 'basic',
    };
    r.handleEvents([hit]);
    expect(floats()).toBe(1);
    w.fog[8 * 64 + 10] = 1;
    r.update(0.1);
    expect(view().visible).toBe(false);
    r.handleEvents([hit]);
    expect(floats()).toBe(1);
  });

  it("keeps the camera on the map's bounds", () => {
    const { r } = stage();
    const w = onMap(ringMap());
    Object.assign(w.hero, { x: 2, y: 2 });
    show(r, w);
    expect(r.viewRect().left).toBeCloseTo(-1);
    expect(r.viewRect().top).toBeCloseTo(-1.5);
    const far = onMap(ringMap());
    Object.assign(far.hero, { x: 62, y: 62 });
    show(r, far);
    expect(r.viewRect().right).toBeCloseTo(65);
    expect(r.viewRect().bottom).toBeCloseTo(65.5);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: FAIL, 3 failed | 24 passed: `paintFog is not a function`, `expected undefined to be null` (no `fog`), and `expected true to be false` (the foe out of sight still shows). The camera's test passes already (Phase A made `world.width` / `height` the map's); it pins the clamp.

- [ ] **Step 3: The fog layer and the foes in sight**

In `packages/client/src/features/delve/arena/ArenaRenderer.ts`:

Replace:

```ts
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import {
  activeMove,
```

with:

```ts
import {
  Application,
  BufferImageSource,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import {
  activeMove,
```

Replace:

```ts
  type Door,
  type Drop,
  type GearItem,
  type InteractableKind,
```

with:

```ts
  type Door,
  type Drop,
  type FloorMap,
  type GearItem,
  type InteractableKind,
```

Replace:

```ts
import { MANA_HEX, NEUTRAL_HEX, RARITY_HEX, REACTION_HEX, cssToHex } from './palette';
import { PixelFloor } from './pixel/pixel-floor';
import { floorInit } from './pixel/floor-engine';
import { SPRITE_PIXEL, spriteFrames } from './sprites';
import { arenaZoom, type Insets } from './camera';
```

with:

```ts
import { MANA_HEX, NEUTRAL_HEX, RARITY_HEX, REACTION_HEX, cssToHex } from './palette';
import { PixelFloor } from './pixel/pixel-floor';
import { FLOOR_MARGIN, floorInit } from './pixel/floor-engine';
import { SPRITE_PIXEL, spriteFrames } from './sprites';
import { arenaZoom, type Insets } from './camera';
```

Replace:

```ts
}

interface Dying {
  root: Container;
```

with:

```ts
}

/** A generated floor's fog: one pixel a cell, over the map and the cliffs round it. */
interface FogLayer {
  sprite: Sprite;
  source: BufferImageSource;
  pixels: Uint8Array;
  /** The world's `fogVersion` it shows. */
  version: number;
}

interface Dying {
  root: Container;
```

Replace:

```ts
const DOOR_SECONDS = 0.25;

/** Each interactable's prop in the atlas. */
const PROP_SPRITE: Record<InteractableKind, PropId> = {
```

with:

```ts
const DOOR_SECONDS = 0.25;

/** The fog's darkness (alpha) by a cell's fog: unseen black, seen but out of sight dimmed, in sight clear. */
const FOG_ALPHA = [255, 150, 0];

/** Each interactable's prop in the atlas. */
const PROP_SPRITE: Record<InteractableKind, PropId> = {
```

Replace:

```ts
  /** The rooms' props by interactable id, with their atlas frames. */
  private props = new Map<string, { sprite: Sprite; frames: Texture[] }>();
  private dropLayer = new Container();
  private entities = new Container();
```

with:

```ts
  /** The rooms' props by interactable id, with their atlas frames. */
  private props = new Map<string, { sprite: Sprite; frames: Texture[] }>();
  /** A generated floor's fog. */
  private fog: FogLayer | null = null;
  private dropLayer = new Container();
  private entities = new Container();
```

Replace:

```ts
    this.doorShut.clear();
    this.makeProps(world);
    this.pixelFloor?.destroy();
    this.pixelFloor = new PixelFloor(floorInit(world));
```

with:

```ts
    this.doorShut.clear();
    this.makeProps(world);
    this.fog?.sprite.destroy({ texture: true, textureSource: true });
    this.fog = world.map.open ? null : this.makeFog(world.map);
    this.pixelFloor?.destroy();
    this.pixelFloor = new PixelFloor(floorInit(world));
```

Replace:

```ts
  }

  private emoji(glyph: string): Texture {
    let tex = this.textures.get(glyph);
```

with:

```ts
  }

  /** The fog layer, over everything on the floor (the labels and numbers stay above it). */
  private makeFog(map: FloorMap): FogLayer {
    const pad = FLOOR_MARGIN;
    const width = map.width + pad * 2;
    const height = map.height + pad * 2;
    const pixels = new Uint8Array(width * height * 4);
    const source = new BufferImageSource({
      resource: pixels,
      width,
      height,
      format: 'rgba8unorm',
      scaleMode: 'nearest',
    });
    const sprite = new Sprite(new Texture({ source }));
    sprite.position.set(-pad, -pad);
    this.root.addChild(sprite);
    return { sprite, source, pixels, version: -1 };
  }

  private emoji(glyph: string): Texture {
    let tex = this.textures.get(glyph);
```

Replace:

```ts
      switch (e.kind) {
        case 'hit': {
          const color = elemColor(e.element);
          this.fx.burst(e.x, e.y, color, e.crit ? 7 : 3, e.crit ? 5 : 3);
```

with:

```ts
      switch (e.kind) {
        case 'hit': {
          // Out of sight, a hit shows nothing (its number would give the foe away).
          if (!inSight(w, e.x, e.y)) break;
          const color = elemColor(e.element);
          this.fx.burst(e.x, e.y, color, e.crit ? 7 : 3, e.crit ? 5 : 3);
```

Replace:

```ts
    this.syncProps(w);
    this.drawDoors(w, dt);
    drawZones(ground, w, this.time);
    drawLobs(ground, air, w, this.time);
    drawTelegraphs(ground, w, this.time);
    drawFooting(ground, w, this.time);
    drawMonsterMarks(ground, air, w, this.time);
    this.lifecycles.update(w, this.fx, this.time);
    drawProjectiles(air, w, this.time, this.trails, (id) => this.lifecycles.bornAt(id));
```

with:

```ts
    this.syncProps(w);
    this.drawDoors(w, dt);
    const fog = this.fog;
    if (fog && fog.version !== w.fogVersion) {
      paintFog(w.map, w.fog, FLOOR_MARGIN, fog.pixels);
      fog.source.update();
      fog.version = w.fogVersion;
    }
    // A foe out of sight shows nothing: not its marks, nor its wind-ups.
    const seen = w.map.open
      ? w
      : { ...w, monsters: w.monsters.filter((m) => inSight(w, m.x, m.y)) };
    drawZones(ground, w, this.time);
    drawLobs(ground, air, w, this.time);
    drawTelegraphs(ground, seen, this.time);
    drawFooting(ground, w, this.time);
    drawMonsterMarks(ground, air, seen, this.time);
    this.lifecycles.update(w, this.fx, this.time);
    drawProjectiles(air, w, this.time, this.trails, (id) => this.lifecycles.bornAt(id));
```

Replace:

```ts
    v.root.position.set(m.x, m.y);
    v.root.zIndex = m.y;
    const flip = w.hero.x > m.x ? -1 : 1;
    const hit = t - m.lastHitAt < 0.09;
```

with:

```ts
    v.root.position.set(m.x, m.y);
    v.root.zIndex = m.y;
    v.root.visible = inSight(w, m.x, m.y);
    const flip = w.hero.x > m.x ? -1 : 1;
    const hit = t - m.lastHitAt < 0.09;
```

Replace:

```ts
}

/**
 * A prop's atlas frame and tint: a chest opens (frame 1) and a shrine goes dark
```

with:

```ts
}

/** Whether the hero sees a point now (on the open room, always). */
export function inSight(w: ArpgWorld, x: number, y: number): boolean {
  if (w.map.open) return true;
  const { width: W, height: H } = w.map;
  const cx = Math.min(W - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(H - 1, Math.max(0, Math.floor(y)));
  return w.fog[cy * W + cx] === 2;
}

/**
 * The fog layer's pixels (black, at `FOG_ALPHA`), one a cell over the map and
 * `pad` cells round it. A wall takes the clearest fog of the floor beside it,
 * so the walls round what the hero sees show; past the map's edge, the edge's.
 */
export function paintFog(map: FloorMap, fog: Uint8Array, pad: number, out: Uint8Array): void {
  const { width: W, height: H, cells } = map;
  const OW = W + pad * 2;
  for (let oy = 0; oy < H + pad * 2; oy++)
    for (let ox = 0; ox < OW; ox++) {
      const x = Math.min(W - 1, Math.max(0, ox - pad));
      const y = Math.min(H - 1, Math.max(0, oy - pad));
      let f = fog[y * W + x];
      if (cells[y * W + x] === 1)
        for (let ny = Math.max(0, y - 1); ny <= Math.min(H - 1, y + 1); ny++)
          for (let nx = Math.max(0, x - 1); nx <= Math.min(W - 1, x + 1); nx++)
            if (cells[ny * W + nx] !== 1) f = Math.max(f, fog[ny * W + nx]);
      out[(oy * OW + ox) * 4 + 3] = FOG_ALPHA[f];
    }
}

/**
 * A prop's atlas frame and tint: a chest opens (frame 1) and a shrine goes dark
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: PASS, 27 tests.

- [ ] **Step 5: The suite, the typecheck and the build**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run && npx vite build)`
Expected: no type errors; **M + 16** tests in **G** files pass; the build succeeds and lists a `floor-worker-*.js` asset.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-maps-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/arena-renderer.test.ts src/features/delve/arena/ArenaRenderer.ts)
git add packages/client/src/features/delve/__tests__/arena-renderer.test.ts packages/client/src/features/delve/arena/ArenaRenderer.ts
git commit -m "feat(client): the fog layer over a generated floor; foes drawn only in sight" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

- `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`: no type errors, **M + 16** tests in **G** files (1272 in 154 at the base's count).
- `(cd packages/client && npx vite build)` succeeds (the floor worker bundles: it imports only types from `@alloy/engine`).
- `git diff --stat maps/main` lists only the eight files above.
- **The open room is unchanged.** On the scratch copy, a script built today's `PixelWorld` and this plan's side by side (four biomes, two seeds, weather on, 60 steps of fire blasts) and compared every field and four rendered windows byte for byte: identical. The Training Grounds and every dive (generated dives stay off until B4) show today's floor.
- **The pixel floor's frame time** (a scratch harness, never committed): create it, run `(cd packages/client && npx tsx floor-bench.mts)`, delete it.

Create `packages/client/floor-bench.mts` (scratch: run it, then delete it):

```ts
// The pixel floor's cost: today's open 26 × 40 arena; a 64 × 64 map (gridMap: 16 rooms), every chunk
// awake and chunks under the view; a real floor from the generator; a 128 × 128 grid (the cost follows
// the view, not the map). A frame is one sim step and one repaint of a 1080p view (48 × 27 units)
// circling the floor. The configurations interleave frame by frame, so a busy machine slows them alike;
// each figure is the median frame.
const SRC = new URL('./src/features/delve/', import.meta.url).href;
const { FloorEngine, floorInit, FLOOR_PPU, FLOOR_MARGIN } = await import(
  SRC + 'arena/pixel/floor-engine.ts'
);
const { gridMap, handMap } = await import(SRC + '__tests__/hand-map.ts');
const { createDefaultRegistry, generateFloor } = await import(
  new URL('../engine/dist/index.js', import.meta.url).href
);
const registry = createDefaultRegistry();
/** A real generated floor: seed 13 at depth 30 is 64 × 48, eight rooms. */
const real = generateFloor(registry, 13, 30, registry.getBiomeForDepth(30), null);

/** gridMap's pattern over n × n coarse cells of 16. */
function bigGrid(n: number) {
  const rooms: any[] = [];
  const halls: any[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      rooms.push({
        kind: (r + c) % 3 ? 'combat' : 'den',
        rect: { x: 2 + 16 * c, y: 3 + 16 * r, w: 12, h: 10 },
      });
      if (c < n - 1) halls.push({ x: 14 + 16 * c, y: 6 + 16 * r, w: 4, h: 3 });
      if (r < n - 1) halls.push({ x: 6 + 16 * c, y: 13 + 16 * r, w: 3, h: 6 });
    }
  return handMap(16 * n, 16 * n, rooms, halls);
}
const world = (biomeId: string, map: any) => ({
  width: map?.width ?? 26,
  height: map?.height ?? 40,
  biomeId,
  depth: 7,
  map: map ?? { open: true },
});

const N = 400;
const WARM = 30;
for (const biome of ['sunken_quarry', 'cinder_mines']) {
  const configs = [
    { label: 'open 26 × 40 (today)', init: floorInit(world(biome, null) as any), wake: false },
    {
      label: 'gridMap 64 × 64, every chunk awake',
      init: floorInit(world(biome, gridMap()) as any),
      wake: false,
    },
    {
      label: 'gridMap 64 × 64, chunks under the view',
      init: floorInit(world(biome, gridMap()) as any),
      wake: true,
    },
    {
      label: 'generator, seed 13 depth 30 (64 × 48)',
      init: floorInit(world(biome, real) as any),
      wake: true,
    },
    {
      label: '128 × 128 grid, chunks under the view',
      init: floorInit(world(biome, bigGrid(8)) as any),
      wake: true,
    },
  ].map((c) => {
    const t0 = performance.now();
    const e = new FloorEngine(c.init);
    return { ...c, e, build: performance.now() - t0, step: [] as number[], paint: [] as number[] };
  });
  for (let k = 0; k < N + WARM; k++)
    for (const c of configs) {
      const { arenaWidth: aw, arenaHeight: ah } = c.init;
      const a = (k / N) * Math.PI * 2;
      const cx = aw / 2 + Math.cos(a) * Math.min(aw * 0.3, 25);
      const cy = ah / 2 + Math.sin(a) * Math.min(ah * 0.3, 25);
      const view = { left: cx - 24, top: cy - 13.5, right: cx + 24, bottom: cy + 13.5 };
      const f = {
        dt: 0,
        events: [],
        bodies: [['hero', cx, cy, 0.5]],
        hero: { x: cx, y: cy, element: 'fire' },
        projectiles: [],
        zones: [],
        drops: [],
        view,
      };
      const pw = c.e.world;
      if (c.wake) {
        const cell = (x: number) => Math.round((x + FLOOR_MARGIN) * FLOOR_PPU);
        pw.setActive(cell(view.left), cell(view.top), cell(view.right), cell(view.bottom));
      }
      const s0 = performance.now();
      pw.step();
      const s1 = performance.now();
      (c.e as any).paint(f);
      const s2 = performance.now();
      if (k >= WARM) {
        c.step.push(s1 - s0);
        c.paint.push(s2 - s1);
      }
    }
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
  console.log(biome);
  for (const c of configs) {
    const frame = c.step.map((s, i) => s + c.paint[i]);
    console.log(
      `  ${c.label.padEnd(44)} build ${c.build.toFixed(0).padStart(4)} ms | step ${med(c.step).toFixed(2)} | paint ${med(c.paint).toFixed(2)} | frame ${med(frame).toFixed(2)} ms`,
    );
  }
}
```

  Measured on the scratch copy (Windows 11, Node 24, a busy machine; the configurations interleave frame by frame so load slows them alike; medians over 400 frames, the sunken quarry and the cinder mines, three runs each; each cell is the range over them):

| Floor | Build | Sim step | Repaint | Frame |
|---|---|---|---|---|
| Open 26 × 40 (today) | 53–166 ms | 0.56–0.93 ms | 3.1–4.7 ms | 3.7–5.5 ms |
| `gridMap` 64 × 64, every chunk awake | 141–431 ms | 1.6–2.3 ms | 4.5–6.9 ms | 6.2–9.2 ms |
| `gridMap` 64 × 64, chunks under the view | 144–407 ms | 0.76–1.14 ms | 4.6–6.9 ms | 5.3–8.0 ms |
| The generator's seed 13, depth 30 (64 × 48), chunks under the view | 91–266 ms | 0.58–0.87 ms | 4.1–6.4 ms | 4.8–7.3 ms |
| A 128 × 128 grid, chunks under the view | 501–1495 ms | 1.3–1.7 ms | 4.7–7.2 ms | 5.9–9.1 ms |

  Reading it: a 64 × 64 floor's simulation step costs 1.2–1.5× today's (its awake area, the chunks under a 48 × 27 view and the rooms they reach, is larger than the whole 26 × 40 arena), against 2.4–3.0× with every chunk awake; the generator's real 64 × 48 floor (its rooms sparser than the grid's) about what today's arena costs; and a 128 × 128 map stays near 64 × 64's, so the cost follows the view, not the map. The repaint grows only because a 1080p view shows 48 units of a generated floor where it showed the open arena's 26 (plus dark backdrop): it is per visible pixel, as before. A whole frame stays at 1.25–1.5× today's, under 10 ms, well inside the worker's 33 ms step; above 7 ms of paint the engine already repaints every other step. Building a 64 × 64 floor (settling its rivers) takes 91–407 ms in the worker at floor load, against 53–166 ms today.
- **A look at it:** rendering `ringMap`, `gridMap` and four of the generator's floors (seeds 11, 13, 7 and 21 at depths 3, 30, 12 and 20) whole, in their biomes (scratch PNGs), shows dark cliffs round lit rooms, worn paths, paved vaults, sanctums, dens and boss rooms (rune circles in the sanctums and boss rooms), rivers and pools in the wild rooms, and no water in the halls. In the darkest biome (the cinder mines) the paths read only a shade lighter than the rock: the hero's light carries them in play.
