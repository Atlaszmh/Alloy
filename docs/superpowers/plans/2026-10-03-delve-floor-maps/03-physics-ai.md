# Delve floor maps · B2: physics and AI (engine) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every hit site and every mover on the floor grid, and foes that see, path and leash: line of sight at each hit site the spec lists (area hits from their centre, the melee arc, beams, the reactions' splash, Fire mastery's spread, Hellfire Brand, chains, Volley's targets and homing, targeting, monster attacks, the boss's slam); the gaps Phase A left (the dodge a slice a tick, Blink to the last walkable point before the first wall, aim points clipped to the hero's sight, Barrage's and scattered impacts where their point sees, a shot stopping and bursting at the wall's face, a shot's muzzle never inside a wall, foes, knockback, the shoves of separation, `pull`, the magnet and the vacuum through the grid, drops landing short of any wall from their foe and carrying its room); a spatial hash for separation; `arpg/flow.ts` (`flowField` by clearance class, `flowTick` on `world.t` marks, `downhill`, `leashTick` with home fields, healing and sleeping); foes waking on sight, pathing by the field, attacking only what they see, a boss kept in its room; and B1's two asks (the boss's adds join its room; an elite den's elites find gear more often). On the open room nothing changes: every suite and pinned number holds, and a whole-autopilot fingerprint stays bit-identical after every task.

**Architecture:** `arpg/grid.ts` gains three helpers every site uses: `sees(map, a, b)` (`lineOfSight`, always true on an open map, so the open room keeps no sight rules at all), `clipSight(map, a, b)` (`b`, or the last point before the segment's first blocked cell) and `shift(map, body, r, dx, dy)` (`moveCircle` on a map, a free move on the open room, where the end of the tick holds foes as it always has); `lineOfSight` becomes `blockedAt(…) === null`, with the same results. The hit sites add `sees` beside their distance tests; the aim, Blink, beams and impacts go through `clipSight`; every mover that wasn't on the grid goes through `shift`. `targeting.ts` gains `muzzle` (where a shot leaves the hero). `arpg/spatial.ts` is a uniform-grid hash `separate` uses (pairs in the list's order, as before). `arpg/flow.ts` fills Phase A's stubs: `flowField` (a BFS within `ai.flowRadius` over the cells a foe of a clearance fits), `downhill` (the way down a field), `flowTick` (both fields toward the hero at `ai.flowEvery` marks), `homeWay` and `leashTick`. `monstersTick` wakes foes on sight, sends them after the hero by `pursue` (straight at it on sight in `ai.directRange`, else down its class's field, holding beyond it), walks a leashed foe home, gates every attack on sight, and keeps a boss in its room (`keepInRoom`).

**Tech Stack:** TypeScript 5.7, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-03-delve-floor-maps-design.md` (authoritative): "Movement and combat on the grid" (collision, Blink, line of sight, monsters, the spatial hash), "Loot", "Testing → Grid physics", "Phases and parallel areas" (the B2 row and "Shared files"). Phase A's plan `01-contract.md` ("For the areas → B2", "Where the spec left room") is the contract this builds on; the overview is `00-overview.md`.

---

## Base

- **Starts from:** `maps/main` at `26c89fe0` (Phase A and B1 merged; `generatedDives` off, so dives still play the open room). C2's later merge (`81d43d6b`) touches only the client, so every engine anchor below holds there too. In this area's worktree `C:/Projects/alloy-maps-b2` on branch `maps/b2`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-maps-b2 -Branch maps/b2 -Base maps/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-maps-b2` in Git Bash.
- **Anchors:** every edit was generated from, and checked against, `maps/main` at `26c89fe0`: applied in this plan's order, task by task, they give exactly the files the tests below were run on (see "Checked on a scratch copy").
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-maps-b2
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's three "Build success" lines; no type errors; the engine suite reads **1902 passed | 5 skipped tests in 111 passed | 1 skipped files** (the pacing rails included); the client suite at `26c89fe0` **1256 tests in 154 files** (more at a later `maps/main`). Call them **N** engine tests in **F** files; each task says where they go.

## Files

| File | Change |
|---|---|
| `packages/engine/src/arpg/grid.ts` | `sees`, `clipSight`, `shift`; `lineOfSight` through `blockedAt` (same results). Phase A's file, no B area's: B2 adds to it (see Cross-area needs) |
| `packages/engine/src/arpg/abilities/targeting.ts` | `nearestMonster` and `bestCluster` pick only foes in sight; an explicit aim clipped to the hero's sight; `muzzle` |
| `packages/engine/src/arpg/abilities/forms.ts` | Bolt and Volley leave from the muzzle; Volley's targets in sight; a Lance beam ends at the first wall and strikes what the hero sees; Strike's arc and Blink's trail need sight; Blink stops at the first wall on its line; Barrage's impacts where the aim point sees |
| `packages/engine/src/arpg/abilities/impact.ts` | the area hit from its centre's sight; a scattered impact where the first point sees; `pull` drags only what it sees, through the grid |
| `packages/engine/src/arpg/basic.ts` | `foeAhead` and the melee arc need sight (the swing's target too); a shot blow leaves from the muzzle; `burstShot` hits what it sees |
| `packages/engine/src/arpg/combat.ts` | `nearby` (the reactions' splash), Fire mastery's spread and Hellfire Brand need sight; `spawnDrop` takes the dying foe: its drops land short of any wall from it and carry its room; an elite den's gear bonus |
| `packages/engine/src/arpg/material-drops.ts`, `rune-drops.ts` | their pickups short of any wall from their foe, in its room |
| `packages/engine/src/loot/drops.ts` | `DropContext.gearBonus` (hand-edited: not Prettier-clean at the base) |
| `packages/engine/src/arpg/dodge.ts` | the dash a slice a tick, swept from where the hero stands |
| `packages/engine/src/arpg/step.ts` | Volley's homing and a blow's Linger ticks need sight; a shot stops at the wall's face; foes, knockback, separation's shoves and the magnet through the grid (the magnet needs sight); separation over the spatial hash; foes wake on sight, `pursue` the hero by sight or the flow field, attack only what they see; the boss's slam respects walls, its adds join its room, it keeps to its room; a leashed foe walks home |
| `packages/engine/src/arpg/spatial.ts` (new) | `SpatialHash`, `spatialHash`, `nearIndices` |
| `packages/engine/src/arpg/flow.ts` | `UNREACHED`, `clearanceOf`, `flowField`, `downhill`, `flowTick`, `homeWay`, `leashTick` (Phase A's stubs filled) |
| `packages/engine/tests/fixtures/maps.ts` (new) | `walledMap`, `block`, `onMap`, `WALL_30`: hand-built maps (not open) on the fixture's world |
| `packages/engine/tests/delve-maps-sight.test.ts` (new) | `sees`, `clipSight`, `shift` |
| `packages/engine/tests/delve-maps-aim.test.ts` (new) | targets in sight, the aim point, Barrage, Blink, a Lance beam, the muzzle |
| `packages/engine/tests/delve-maps-hits.test.ts` (new) | Nova, `pull`, Strike, the melee blow, a blow's Linger, Overload's splash, Hellfire Brand, Volley's homing |
| `packages/engine/tests/delve-maps-shots.test.ts` (new) | a Bolt bursting at the wall's face |
| `packages/engine/tests/delve-maps-motion.test.ts` (new) | the dodge past a pillar, knockback, a boss's shove, the magnet, drops and their room, the den's gear |
| `packages/engine/tests/delve-maps-spatial.test.ts` (new) | the hash, and separation exactly as the all-pairs pass |
| `packages/engine/tests/delve-maps-flow.test.ts` (new) | `flowField` (walls, radius, the large class, doors), `downhill`, `flowTick` |
| `packages/engine/tests/delve-maps-ai.test.ts` (new) | waking, pathing round a wall, holding beyond the field, melee, ranged and the slam through walls, the boss in its room, its adds' room |
| `packages/engine/tests/delve-maps-leash.test.ts` (new) | turning home, healing and sleeping; the count restarting; none on the open room |
| `packages/engine/tests/delve-maps-fight.test.ts` (new) | a fight on five generated floors (B1's generator): every body on walkable ground, every boss in its room |

Nothing in `world.ts` (B1's), the types (Phase A's), `interact.ts`, `seal.ts`, `fog.ts`, `stops.ts`, `dive.ts` (B3's), `bot.ts` or `autopilot.ts` (B4's) changes, nor anything in the client.

## Cross-area needs

- **The integrator (`arpg/grid.ts`, Phase A's file).** B2 adds `sees`, `clipSight` and `shift` at its end and turns `lineOfSight`'s walk into `blockedAt` (Task 1; the Phase A grid tests stay green). If another area also adds to `grid.ts`, both additions keep. **A Phase A quirk worth knowing (no change here):** `moveCircle(map, p, r, 0, 0)` on a circle pressed into a wall above or below it resolves x first, and the wall row inside its span reads as a wall beside it, so the push-out also shoves it sideways by up to `r`. B2's movers sweep (`shift`) so they never press into walls; B3's seal nudges should move bodies by a sweep too, not place them pressed into a wall and rely on `separate`'s final push-out.
- **B3 (`arpg/interact.ts`, `onMonsterKilled`).** Every drop a foe's death makes carries `roomId` = the foe's `roomId` (items, motes, orbs, Siphon's motes, Seedling's orbs, materials, scrap, patterns, runes; none in the open room): the room vacuum can pull `world.drops.filter((d) => d.roomId === m.roomId)`. The spawn-time `vacuum: world.cleared` stays: `onMonsterKilled` runs after every drop of the death is down, and no drop from a cleared room's foe spawns later (they're all dead), so the room rule is B3's vacuum alone. `spawnDrop` stays private to `combat.ts` and now takes the dying foe (`spawnDrop(ctx, kind, from, x, y, extra)`); a chest's burst should push its drops itself (on walkable cells, `snapToWalkable`).
- **B4 (`arpg/bot.ts`, the pacing rails).** `nearestMonster` now returns only a foe its point sees (the bot's target pick at 60 and its threat checks): on a generated floor the bot needs B4's own flow-field movement. `flowField(map, target, radius, clearance)` and `downhill(map, field, from, target)` are exported for it; `world.flow.small` / `large` point at the hero, not at the bot's targets. Nothing here moves a number on the open room (the fingerprint is identical after every task), so no pinned seed changes before B4 turns the generated dives on.
- **From B1 (done here):** X1, `bossSpecial` passes `roomId: m.roomId` to the adds (Task 9); X3, `drops.den.gearBonus` is added to a den elite's gear chance, inside the `dropsGiven` guard as all gear is (Task 6).

## Where the spec left room

1. **The open room keeps no sight rules.** `sees` is true on any map with `open` set, and `clipSight` returns its far point there, so every hit site, the aim, Blink, beams and impacts are exactly as before on the open room ("LOS on an open room is always true"). Phase A's own wall tests build `openRoom` maps (`open: true`) and stay as they were; B2's tests build maps with `open: false` (`tests/fixtures/maps.ts`).
2. **Movers on the open room move freely.** `shift` is `moveCircle` on a map and a plain add on the open room, where `separate`'s final push-out holds foes in as it always did. Clamping a foe mid-tick instead would change where separation finds it, so the open room's numbers would move.
3. **"Prefer visible foes" is "only visible foes":** a Bolt at a foe behind a wall would only burst on the wall, so auto-aim, chains, the lull's charge check and every other `nearestMonster` caller see past no wall. A move with nothing in sight fails for free, as one with nothing in range does.
4. **A shot's hits need no sight test:** walls are at least a cell thick and bodies are kept out of them, so a shot (radius under 1) can't touch a foe across one; it stops at the wall's face (`clipSight` from where it was), where a Bolt bursts and a Split sheds.
5. **The dodge:** each tick it moves toward where its progress puts it (`from + dir × k`), swept from where the hero stands; once a wall has held it back (the hero farther than one slice from that point), each tick moves only its own slice, so it never lurches on past a corner. On the open room the first rule is the old placement to the bit.
6. **Blink:** its line clipped to the hero's sight, then swept (`moveCircle` by the clipped length), so it stops before the first wall and never slips round a pillar its line runs into; unclipped (the open room), the old slide along the edges exactly.
7. **The muzzle:** a Bolt, a Volley dart or a shot blow leaves from its usual point unless the hero can't see it (in a wall), then from the hero.
8. **Drops** land where their foe sees: gear, runes and the crafting pickups snapped as before, then clipped to the foe's sight; motes and orbs (never snapped) only clipped, so the open room's stay exactly where they fell. Each carries its foe's room.
9. **The magnet needs sight; the vacuum doesn't.** Both slide along walls (`shift`, a drop counting as a body of radius 0.25). A vacuumed drop caught on a pillar waits for the hero to come near.
10. **Clearance classes:** `small` for a foe up to one cell wide (radius ≤ 0.5), `large` for the rest. A field counts a cell for a foe `c` cells wide when the odd square of side `2 × ⌊c / 2⌋ + 1` round it is open (1 cell for small; the large class's clearance is `min(2, hallWidth)`, a 3 × 3), so large foes keep off pillars' one- and two-cell gaps and walk halls and doors (three wide). `moveCircle` still decides the actual collision.
11. **Steering:** `downhill` looks at the eight neighbours (orthogonal first; a diagonal only where both cells beside it are in the field) and heads for the centre of the lowest; in the target's own cell, straight at it. A foe on a cell its field doesn't hold (a large foe hugging a wall) still steps to a neighbour that it does.
12. **Who steers straight:** melee foes and chargers with sight of the hero within `ai.directRange` (centre to centre); a ranged foe on sight ("path until LOS"). A foe the field doesn't reach holds its place.
13. **Flow marks:** `flowTick` rebuilds both fields when `world.t` reaches `flow.nextAt` (0 at the start, so the first tick builds them) and sets it `ai.flowEvery` on; a field is BFS steps within `ai.flowRadius`, the hero's own cell 0 whatever stands there.
14. **The leash** counts only awake foes, from their room rect's centre. Going home (`goingHome`) a foe only walks (no attacks; a stun or a freeze stops it), down its room's `homeField` (straight at the centre without one); it is home on a cell the field counts 1 or less (B1 seeds the field at the centre's cell, pillar or not), where it heals to full and sleeps (`aggro` false, `aggroAt` 0, `farSince` null).
15. **The spatial hash is separation's.** Pairs are taken in the list's order as before, from the 3 × 3 buckets round each foe, the cells `2 ×` the largest radius `+ 1` wide; the test checks it against the all-pairs pass to the bit. The linear nearest scans stay: monster counts don't grow with the map (the spec keeps today's pack count), and a per-tick index would go stale under `pull`, knockback and B3's seal moves.
16. **A boss keeps to its room** by a clamp to its room's rect after each move and each knockback (`keepInRoom`); it paths with the large class like any big foe. Its slam hurts (and a perfect dodge counts) only where the slam's centre sees; its ring's shots stop at walls as every shot does.
17. **The den's gear bonus** is added to the elite gear chance before the door's multiplier: `(gearChance + gearBonus) × gear`.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `maps/b2`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-maps-b2`.
- **Line endings:** the worktree's files are CRLF (`core.autocrlf`); keep each file's own (the Edit tool does); new files are LF.
- **Prettier:** the commit blocks format only files a task creates and files that pass `prettier --check` at the base. `packages/engine/src/loot/drops.ts` is not clean at the base: hand-edited only, never formatted. Never touch `packages/engine/tests/delve-chain-feel.test.ts`. The code below is already Prettier-formatted (checked on the scratch copy), so `--write` changes nothing if typed as written.
- **How the edits read** (the earlier plans' language): "In `f`:" names the file for the edits under it. "Replace:" (a block) "with:" (a block) is one Edit (old, new). "Create `f`:" is a Write. Within a file, apply its edits top to bottom; every old block is unique in its file at that point.
- **Parity is the rule:** on the open room no task changes a number in play. Every task runs the whole engine suite (50–140 s; the pacing rails run while the files load) and the engine typecheck; nothing pinned may move.
- **The fingerprint (optional, recommended):** a whole-autopilot hash that must stay identical after every task. Put this in `packages/engine/tests/zz-probe.test.ts` (never committed):

```ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot } from '../src/delve/autopilot.js';

// Scratch parity probe: a fingerprint of whole autopilot runs (every floor's sim).
it('probe', () => {
  const registry = createDefaultRegistry();
  const out: Record<string, string> = {};
  for (const primary of ['fire', 'frost', 'storm'] as const)
    for (const seed of [1, 2]) {
      const r = runAutopilot(registry, { seed, dives: 4, primary });
      out[`${primary}:${seed}`] =
        createHash('sha1').update(JSON.stringify(r.reports) + JSON.stringify({ ...r.profile, version: 0 })).digest('hex') +
        ' ' + r.reports.map((d) => `${d.endDepth}/${d.kills}/${d.floorSeconds.toFixed(3)}`).join(',');
    }
  writeFileSync(process.env.PROBE_OUT!, JSON.stringify(out, null, 1));
}, 600000);
```

  Run it as `(cd packages/engine && PROBE_OUT=/tmp/probe-tN.json npx vitest run tests/zz-probe.test.ts)` at the base and after each task, then delete the file; `diff` against the base's output prints nothing. At `26c89fe0` it reads `fire:1` `2ddfe680…` (3/58/121.000, 5/84/183.000, 5/79/178.000, 5/80/164.000) and `storm:2` `f801898c…` (4/68/80.000, 5/91/87.000, 13/186/219.000, 19/242/244.000).
- **The client follows the bundle.** No task rebuilds `packages/engine/dist` until the end ("Verification"): no exported signature the client uses changes, and the client stays green against the new bundle.
- **Checked on a scratch copy:** `git archive` of `maps/main` at `26c89fe0` with junctioned `node_modules`; every task's edits applied in order (each anchor unique where the plan applies it), giving the trees every FAIL, PASS, suite and typecheck below ran on; `prettier --check` passed on every file a commit block formats; the fingerprint was identical at the base and after every task; and a stress run (60 generated floors, depths 1–15, the hero chasing, dodging and casting for 40 s each) found no body off walkable ground and no boss out of its room.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine bundle (the client's) | `(cd packages/engine && npx tsup)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |

---

## Chunk 1: Sight on the grid

### Task 1: `sees`, `clipSight`, `shift`

The three grid helpers every later task uses, and the hand-built maps the tests stand on. `lineOfSight` becomes `blockedAt(…) === null` (where along the segment it first meets a blocked cell), with the same results.

**Files:**
- Create: `packages/engine/tests/fixtures/maps.ts`, `packages/engine/tests/delve-maps-sight.test.ts`
- Modify: `packages/engine/src/arpg/grid.ts`

- [ ] **Step 1: The failing test, and its maps**

Create `packages/engine/tests/delve-maps-sight.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clipSight, isWalkable, lineOfSight, openRoom, sees, shift } from '../src/arpg/grid.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { block, walledMap } from './fixtures/maps.js';

// The grid's sight helpers (see the floor maps spec's "Line of sight"): every hit
// site asks `sees`, and `clipSight` clips what can't be seen.

/** Column 5 a wall, from top to bottom, in a 10 × 10 map. */
const WALL = walledMap(10, 10, block(5, 0, 5, 9));

describe('sees', () => {
  it('is lineOfSight on a map with walls, and always true in the open room', () => {
    expect(sees(WALL, { x: 2, y: 2 }, { x: 8, y: 2 })).toBe(false);
    expect(sees(WALL, { x: 2, y: 2 }, { x: 4, y: 8 })).toBe(true);
    const open = openRoom(10, 10);
    expect(sees(open, { x: 2, y: 2 }, { x: 8, y: 2 })).toBe(true);
    // Even from off the map: the open room keeps no sight rules at all.
    expect(sees(open, { x: -1, y: 2 }, { x: 8, y: 2 })).toBe(true);
  });
});

describe('clipSight', () => {
  it('is the far point when nothing is in the way', () => {
    expect(clipSight(WALL, { x: 2, y: 2 }, { x: 4, y: 8 })).toEqual({ x: 4, y: 8 });
  });

  it('stops a hair short of the first blocked cell, on a walkable point', () => {
    const p = clipSight(WALL, { x: 2, y: 2 }, { x: 8, y: 5 });
    expect(p.x).toBeCloseTo(5, 5);
    expect(p.x).toBeLessThan(5);
    expect(p.y).toBeCloseTo(3.5, 5);
    expect(isWalkable(WALL, p.x, p.y)).toBe(true);
    expect(lineOfSight(WALL, { x: 2, y: 2 }, p)).toBe(true);
  });

  it('stops at the map edge, and stays put from inside a wall', () => {
    const map = walledMap(10, 10, []);
    expect(clipSight(map, { x: 2, y: 2 }, { x: -3, y: 2 }).x).toBeCloseTo(0, 5);
    expect(clipSight(WALL, { x: 5.5, y: 2 }, { x: 8, y: 2 })).toEqual({ x: 5.5, y: 2 });
  });

  it('always lands where its start can see, among pillars', () => {
    const map = walledMap(12, 12, [...block(3, 3, 4, 4), ...block(7, 2, 7, 9), [2, 8]]);
    const rng = new SeededRNG(5);
    for (let i = 0; i < 500; i++) {
      const a = { x: rng.next() * 12, y: rng.next() * 12 };
      if (!isWalkable(map, a.x, a.y)) continue;
      const p = clipSight(map, a, { x: rng.next() * 14 - 1, y: rng.next() * 14 - 1 });
      expect(lineOfSight(map, a, p), `${a.x}, ${a.y} → ${p.x}, ${p.y}`).toBe(true);
    }
  });

  it('is the far point in the open room, wherever that is', () => {
    expect(clipSight(openRoom(10, 10), { x: 2, y: 2 }, { x: 14, y: 2 })).toEqual({ x: 14, y: 2 });
  });
});

describe('shift', () => {
  it('slides a body along a wall, and moves it freely in the open room', () => {
    const body = { x: 3, y: 2 };
    shift(WALL, body, 0.5, 4, 1);
    expect(body).toEqual({ x: 4.5, y: 3 });
    const free = { x: 3, y: 2 };
    shift(openRoom(10, 10), free, 0.5, 9, 1);
    expect(free).toEqual({ x: 12, y: 3 });
  });
});
```

Create `packages/engine/tests/fixtures/maps.ts`:

```ts
import { openRoom } from '../../src/arpg/grid.js';
import type { ArpgWorld } from '../../src/types/arpg.js';
import type { FloorMap } from '../../src/types/floor-map.js';

/**
 * A hand-built floor map (not the open room, so walls, sight and the AI's
 * rules hold): `width` × `height` cells, these cells walls; one room covering
 * it all.
 */
export function walledMap(width: number, height: number, walls: [number, number][]): FloorMap {
  const map = { ...openRoom(width, height), open: false };
  for (const [x, y] of walls) map.cells[y * width + x] = 1;
  return map;
}

/** The cells of the rectangle from (x0, y0) to (x1, y1), both included. */
export function block(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push([x, y]);
  return cells;
}

/** The fixture's world (26 × 40, the hero at (13, 36)) on a hand-built map with these walls. */
export function onMap(w: ArpgWorld, walls: [number, number][]): ArpgWorld {
  w.map = walledMap(w.width, w.height, walls);
  return w;
}

/** Row 30 a wall from side to side, two cells thick (rows 30 and 31): the hero starts below it. */
export const WALL_30 = block(0, 30, 25, 31);
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-sight.test.ts)`
Expected: FAIL, 7 of 7: `TypeError: (0 , clipSight) is not a function` (and `sees`, `shift`).

- [ ] **Step 3: The helpers**

In `packages/engine/src/arpg/grid.ts`:

Replace:

```ts
  let cx = cellOf(a.x, map.width);
  let cy = cellOf(a.y, map.height);
  if (blocked(map, cx, cy) || !isWalkable(map, b.x, b.y)) return false;
```

with:

```ts
  return blockedAt(map, a, b) === null;
}

/**
 * Where along the segment from `a` to `b` (0 at a, 1 at b) it first meets a
 * blocked cell, as `lineOfSight` walks it; null when nothing blocks it.
 */
function blockedAt(map: FloorMap, a: Vec, b: Vec): number | null {
  let cx = cellOf(a.x, map.width);
  let cy = cellOf(a.y, map.height);
  if (blocked(map, cx, cy)) return 0;
```

Replace:

```ts
    if (x === y && (blocked(map, cx + sx, cy) || blocked(map, cx, cy + sy))) return false;
    if (x <= y) cx += sx;
    if (y <= x) cy += sy;
    if (blocked(map, cx, cy)) return false;
  }
  return true;
}
```

with:

```ts
    if (x === y && (blocked(map, cx + sx, cy) || blocked(map, cx, cy + sy))) return x;
    if (x <= y) cx += sx;
    if (y <= x) cy += sy;
    if (blocked(map, cx, cy)) return Math.min(x, y);
  }
  return isWalkable(map, b.x, b.y) ? null : 1;
}

/**
 * Whether `a` sees `b` (see the floor maps spec's "Line of sight"): every hit
 * site asks this. The open room has no walls, so there anything sees anything.
 */
export function sees(map: FloorMap, a: Vec, b: Vec): boolean {
  return map.open || lineOfSight(map, a, b);
}

/**
 * `b` if `a` sees it, else the last point before the segment from `a` meets
 * its first blocked cell (`a` itself in a wall): where a beam ends, a shot
 * bursts, Blink lands, and an aim point or a scattered impact is clipped to.
 */
export function clipSight(map: FloorMap, a: Vec, b: Vec): Vec {
  if (map.open) return b;
  const at = blockedAt(map, a, b);
  if (at === null) return b;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  // A hair short of the blocked cell, so the point stands in the last open one.
  const k = len > 0 ? Math.max(0, at - 1e-6 / len) : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/**
 * Move a body by (dx, dy) on the grid (`moveCircle`); in the open room it
 * moves freely, as it always has (the end of the tick puts a foe back inside).
 */
export function shift(
  map: FloorMap,
  body: { x: number; y: number },
  radius: number,
  dx: number,
  dy: number,
): void {
  if (map.open) {
    body.x += dx;
    body.y += dy;
  } else Object.assign(body, moveCircle(map, body, radius, dx, dy));
}
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-sight.test.ts tests/arpg-grid.test.ts)`
Expected: PASS, 7 + 13 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 7 tests in F + 1 files pass (1909 | 5 skipped in 112 | 1 skipped).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-b2
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/grid.ts tests/fixtures/maps.ts tests/delve-maps-sight.test.ts)
git add packages/engine/src/arpg/grid.ts packages/engine/tests/fixtures/maps.ts packages/engine/tests/delve-maps-sight.test.ts
git commit -m "feat(engine): sight on the grid: sees, clipSight and shift" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: Aiming in sight

`nearestMonster` and `bestCluster` take only foes their point (the hero) sees, so auto-aim, chains and every other caller see past no wall; an explicit aim is clipped to the hero's sight after its snap (a lob can't land in an unseen room); Blink goes no further than the first wall on its line; a Lance beam ends at the first wall and strikes what the hero sees; Volley's targets are in sight; Barrage's impacts and a scattered impact land where their point sees; `muzzle` keeps a shot from leaving inside a wall.

**Files:**
- Create: `packages/engine/tests/delve-maps-aim.test.ts`
- Modify: `packages/engine/src/arpg/abilities/targeting.ts`, `abilities/forms.ts`, `abilities/impact.ts`, `packages/engine/src/arpg/basic.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-maps-aim.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeCtx } from '../src/arpg/combat.js';
import { lineOfSight } from '../src/arpg/grid.js';
import { aimPoint, bestCluster, muzzle, nearestMonster } from '../src/arpg/abilities/targeting.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { arena, damaged, dummy, moveOf, press, registry } from './fixtures/arena.js';
import { WALL_30, onMap } from './fixtures/maps.js';

// Aiming on the grid (see the floor maps spec's "Line of sight"): targets the hero
// can't see aren't picked, an aim point is clipped to its sight, Blink and beams
// stop at the first wall, a shot never leaves from inside one. The hero stands at
// (13, 36), below a wall on rows 30 and 31 (its face at y = 32).

describe('targets in sight', () => {
  it('the nearest foe and the best cluster are ones the hero sees', () => {
    const w = onMap(
      arena([dummy(13, 27), dummy(12.5, 27), dummy(13.5, 27), dummy(4, 34)], { noBasic: true }),
      WALL_30,
    );
    const ctx = makeCtx(registry, w, []);
    expect(nearestMonster(ctx, 13, 36, 20)?.id).toBe(w.monsters[3].id);
    expect(bestCluster(ctx, 20, 2)?.id).toBe(w.monsters[3].id);
    w.monsters[3].dead = true;
    expect(nearestMonster(ctx, 13, 36, 20)).toBeNull();
    expect(bestCluster(ctx, 20, 2)).toBeNull();
  });

  it('a directional move with only foes behind a wall fails for free', () => {
    const w = onMap(arena([dummy(13, 27)], { noBasic: true }), WALL_30);
    const mana = w.hero.mana;
    press(w, 0);
    expect(w.projectiles).toEqual([]);
    expect(w.hero.mana).toBe(mana);
  });
});

describe('the aim point', () => {
  it('is clipped to the hero’s sight: a lob lands this side of the wall', () => {
    const w = onMap(arena([dummy(2, 2)], { noBasic: true, primary: { form: 'burst' } }), WALL_30);
    const p = aimPoint(makeCtx(registry, w, []), moveOf(w, 0), { x: 13, y: 26 })!;
    expect(p.x).toBeCloseTo(13, 9);
    expect(p.y).toBeGreaterThan(32);
    expect(p.y).toBeCloseTo(32, 5);
    // In the open room, as before: clamped to the move's range (8).
    const open = arena([dummy(2, 2)], { noBasic: true, primary: { form: 'burst' } });
    expect(aimPoint(makeCtx(registry, open, []), moveOf(open, 0), { x: 13, y: 26 })).toEqual({
      x: 13,
      y: 28,
    });
  });

  it("each of Barrage's impacts lands where the aim point sees", () => {
    const w = onMap(
      arena([dummy(2, 2)], {
        noBasic: true,
        ultimate: { form: 'barrage', payment: 'mana' },
      }),
      WALL_30,
    );
    const aim = { x: 13, y: 32.6 };
    press(w, 2, aim);
    const impacts = w.zones.filter((z) => z.source === 'barrage');
    expect(impacts.length).toBe(moveOf(w, 2).count);
    for (const z of impacts) expect(lineOfSight(w.map, aim, z), `${z.x}, ${z.y}`).toBe(true);
  });
});

describe('Blink and beams', () => {
  it('Blink lands before the first wall on its line', () => {
    const w = onMap(arena([dummy(2, 2)], { noBasic: true, defensive: { form: 'blink' } }), WALL_30);
    w.hero.y = 34;
    press(w, 1, { x: 13, y: 20 });
    expect(w.hero.x).toBeCloseTo(13, 9);
    expect(w.hero.y).toBeCloseTo(32 + w.hero.radius, 5);
  });

  it('Blink never slips round a pillar its line runs into', () => {
    const w = onMap(arena([dummy(2, 2)], { noBasic: true, defensive: { form: 'blink' } }), [
      [12, 33],
    ]);
    w.hero.x = 10.5;
    w.hero.y = 35.2;
    press(w, 1, { x: 14.5, y: 31.2 });
    expect(w.hero.x).toBeLessThan(12.5);
    expect(w.hero.y).toBeGreaterThan(34);
  });

  it('a Lance beam ends at the wall and strikes nothing behind it', () => {
    const w = onMap(
      arena([dummy(13, 32.9), dummy(13, 28)], { noBasic: true, primary: { form: 'lance' } }),
      WALL_30,
    );
    w.hero.y = 34;
    const events: ArpgEvent[] = press(w, 0, { x: 13, y: 20 });
    const beam = events.find((e) => e.kind === 'beam');
    expect(beam && beam.kind === 'beam' && beam.ty).toBeCloseTo(32, 5);
    expect(damaged(w.monsters[0])).toBe(true);
    expect(damaged(w.monsters[1])).toBe(false);
  });
});

describe('the muzzle', () => {
  it('a shot leaves from the hero itself when its muzzle is in a wall', () => {
    const w = onMap(arena([dummy(2, 2)], { noBasic: true }), WALL_30);
    w.hero.y = 32.4;
    const ctx = makeCtx(registry, w, []);
    expect(muzzle(ctx, { x: 0, y: -1 }, 0.6)).toEqual({ x: 13, y: 32.4 });
    expect(muzzle(ctx, { x: 0, y: 1 }, 0.6)).toEqual({ x: 13, y: 33 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-aim.test.ts)`
Expected: FAIL, 7 of 8 (only "Blink lands before the first wall on its line" passes: Phase A's sweep already stops a straight Blink): the hidden foes are picked (`expected 1000 to be 1003`), the press fires (`expected [ { owner: 'hero', …(21) } ] to deeply equal []`), the lob's point stays behind the wall (`expected 28 to be greater than 32`), an impact lands unseen, Blink slips round the pillar (`expected 14.03… to be less than 12.5`), the beam runs on (`expected 26.5 to be close to 32`), `muzzle is not a function`.

- [ ] **Step 3: The targeting, the forms, the scatter and the shot blow**

In `packages/engine/src/arpg/abilities/forms.ts`:

Replace:

```ts
import { moveCircle, snapToWalkable } from '../grid.js';
import { abilityHit, chainFrom, hitOpts, impact, leaveZone } from './impact.js';
import { stepBonus, stepHeft } from './resolve.js';
import { aimPoint, alive, spawnProjectile } from './targeting.js';
```

with:

```ts
import { clipSight, moveCircle, sees, snapToWalkable } from '../grid.js';
import { abilityHit, chainFrom, hitOpts, impact, leaveZone } from './impact.js';
import { stepBonus, stepHeft } from './resolve.js';
import { aimPoint, alive, muzzle, spawnProjectile } from './targeting.js';
```

Replace:

```ts
          x: h.x + d.x * 0.6,
          y: h.y + d.y * 0.6,
```

with:

```ts
          ...muzzle(ctx, d, 0.6),
```

Replace:

```ts
        .filter((m) => dist(h.x, h.y, m.x, m.y) - m.radius <= ab.range + 2)
```

with:

```ts
        .filter((m) => dist(h.x, h.y, m.x, m.y) - m.radius <= ab.range + 2 && sees(world.map, h, m))
```

Replace:

```ts
          x: h.x + d.x * 0.5,
          y: h.y + d.y * 0.5,
```

with:

```ts
          ...muzzle(ctx, d, 0.5),
```

Replace:

```ts
      // its zone at its first, as one Lance does.
```

with:

```ts
      // its zone at its first, as one Lance does. A beam ends at the first wall.
```

Replace:

```ts
        const ex = h.x + d.x * len;
        const ey = h.y + d.y * len;
        const hits = alive(ctx)
          .filter(
            (m) =>
              !struck.has(m.id) && distToSegment(m.x, m.y, h.x, h.y, ex, ey) <= width + m.radius,
```

with:

```ts
        const { x: ex, y: ey } = clipSight(world.map, h, {
          x: h.x + d.x * len,
          y: h.y + d.y * len,
        });
        const hits = alive(ctx)
          .filter(
            (m) =>
              !struck.has(m.id) &&
              distToSegment(m.x, m.y, h.x, h.y, ex, ey) <= width + m.radius &&
              sees(world.map, h, m),
```

Replace:

```ts
      const d = Math.min(dist(h.x, h.y, p.x, p.y), ab.range);
      Object.assign(h, moveCircle(world.map, h, h.radius, dir.x * d, dir.y * d));
```

with:

```ts
      // It goes no further than the first wall on its line.
      const d = Math.min(dist(h.x, h.y, p.x, p.y), ab.range);
      const far = { x: h.x + dir.x * d, y: h.y + dir.y * d };
      const to = clipSight(world.map, h, far);
      const k = to === far ? d : dist(h.x, h.y, to.x, to.y);
      Object.assign(h, moveCircle(world.map, h, h.radius, dir.x * k, dir.y * k));
```

Replace:

```ts
          ...snapToWalkable(world.map, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r),
```

with:

```ts
          // Each where the aim point sees.
          ...clipSight(
            world.map,
            p,
            snapToWalkable(world.map, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r),
          ),
```

In `packages/engine/src/arpg/abilities/impact.ts`:

Replace:

```ts
import { snapToWalkable } from '../grid.js';
```

with:

```ts
import { clipSight, snapToWalkable } from '../grid.js';
```

Replace:

```ts
    ({ x, y } = snapToWalkable(world.map, x + Math.cos(a) * r, y + Math.sin(a) * r));
```

with:

```ts
    // Where the first point sees.
    const to = snapToWalkable(world.map, x + Math.cos(a) * r, y + Math.sin(a) * r);
    ({ x, y } = clipSight(world.map, { x, y }, to));
```

In `packages/engine/src/arpg/abilities/targeting.ts`:

Replace:

```ts
import { snapToWalkable } from '../grid.js';
```

with:

```ts
import { clipSight, sees, snapToWalkable } from '../grid.js';
```

Replace:

```ts
/** Nearest living monster whose edge is within `range` of (x, y). */
```

with:

```ts
/** Nearest living monster whose edge is within `range` of (x, y), and that (x, y) sees. */
```

Replace:

```ts
    if (d <= range && d < bestD) {
```

with:

```ts
    if (d <= range && d < bestD && sees(ctx.world.map, { x, y }, m)) {
```

Replace:

```ts
/** The in-range monster whose surroundings hold the most foes (for placed abilities). */
export function bestCluster(ctx: SimCtx, range: number, radius: number): MonsterEntity | null {
  const h = ctx.world.hero;
  const candidates = alive(ctx).filter((m) => dist(h.x, h.y, m.x, m.y) - m.radius <= range);
```

with:

```ts
/** The in-range monster the hero sees whose surroundings hold the most foes (for placed abilities). */
export function bestCluster(ctx: SimCtx, range: number, radius: number): MonsterEntity | null {
  const h = ctx.world.hero;
  const candidates = alive(ctx).filter(
    (m) => dist(h.x, h.y, m.x, m.y) - m.radius <= range && sees(ctx.world.map, h, m),
  );
```

Replace:

```ts
/** Forms fired along a way from the hero (the rest are placed, self-centred or Blink). */
```

with:

```ts

/**
 * Where a shot leaves the hero: `out` along `d`, or the hero's own place when
 * that point is in a wall or out of its sight (see the floor maps spec).
 */
export function muzzle(ctx: SimCtx, d: Vec, out: number): Vec {
  const h = ctx.world.hero;
  const p = { x: h.x + d.x * out, y: h.y + d.y * out };
  return sees(ctx.world.map, h, p) ? p : { x: h.x, y: h.y };
}
/** Forms fired along a way from the hero (the rest are placed, self-centred or Blink). */
```

Replace:

```ts
 * Where an ability goes. An explicit aim is clamped to range; otherwise
```

with:

```ts
 * Where an ability goes. An explicit aim is clamped to range and to the
 * hero's sight (a placed form can't land in an unseen room); otherwise
```

Replace:

```ts
    return snapToWalkable(world.map, h.x + (aim.x - h.x) * k, h.y + (aim.y - h.y) * k);
```

with:

```ts
    const p = snapToWalkable(world.map, h.x + (aim.x - h.x) * k, h.y + (aim.y - h.y) * k);
    return clipSight(world.map, h, p);
```

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
import { alive, nearestMonster, spawnProjectile } from './abilities/targeting.js';
```

with:

```ts
import { alive, muzzle, nearestMonster, spawnProjectile } from './abilities/targeting.js';
```

Replace:

```ts
        x: h.x + d.x * 0.5,
        y: h.y + d.y * 0.5,
```

with:

```ts
        ...muzzle(ctx, d, 0.5),
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-aim.test.ts)`
Expected: PASS, 8 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 15 tests in F + 2 files pass (1917 | 5 skipped in 113 | 1 skipped). The fingerprint is identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-b2
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/abilities/targeting.ts src/arpg/abilities/forms.ts src/arpg/abilities/impact.ts src/arpg/basic.ts tests/delve-maps-aim.test.ts)
git add packages/engine/src/arpg/abilities/targeting.ts packages/engine/src/arpg/abilities/forms.ts packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/basic.ts packages/engine/tests/delve-maps-aim.test.ts
git commit -m "feat(engine): aiming in sight: targets, aim points, Blink, beams, Barrage and the muzzle" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: Hits and shots

### Task 3: Every area hit and splash needs sight

An impact (AoE, explode, Nova, zone and Linger ticks) hits the foes its centre sees, and `pull` drags only those, through the grid; Strike's arc and Blink's trail need sight; `foeAhead` and the melee arc (the swing's target too) need the hero's; `burstShot` hits what it sees; `nearby` (Overload, Combust, Blight, Crystallize, Blackout), Fire mastery's spread and Hellfire Brand reach only what the struck foe or the corpse sees; a blow's Linger ticks what it sees; a Volley dart turns only toward a foe it sees.

**Files:**
- Create: `packages/engine/tests/delve-maps-hits.test.ts`
- Modify: `packages/engine/src/arpg/abilities/impact.ts`, `abilities/forms.ts`, `packages/engine/src/arpg/basic.ts`, `combat.ts`, `step.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-maps-hits.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { landBlow } from '../src/arpg/basic.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import { arena, damaged, dummy, press, registry, run } from './fixtures/arena.js';
import { block, onMap } from './fixtures/maps.js';

// Every hit site needs line of sight (see the floor maps spec's "Line of sight"):
// area hits from their centre, the melee arc and the reactions' splash from the
// one dealing it. Walls here are hand-built, some a single cell thick.

/** Columns 15 and 16 a wall from row 33 down: east of the hero at (13, 36). */
const EAST_WALL = block(15, 33, 16, 39);
/** Row 33 a one-cell wall across the map. */
const ROW_33 = block(0, 33, 25, 33);

describe('area hits', () => {
  it('a Nova strikes the foes its centre sees, not one behind a wall', () => {
    const w = onMap(
      arena([dummy(11, 36), dummy(17.5, 36)], {
        noBasic: true,
        ultimate: { payment: 'mana' },
      }),
      EAST_WALL,
    );
    press(w, 2);
    expect(damaged(w.monsters[0])).toBe(true);
    expect(damaged(w.monsters[1])).toBe(false);
  });

  it('a pull drags only the foes it sees, and a wall stops the drag', () => {
    const w = onMap(
      arena([dummy(3, 36), dummy(20, 36)], {
        noBasic: true,
        ultimate: { payment: 'mana', elements: ['storm', 'earth'] },
      }),
      [...EAST_WALL, [7, 35]],
    );
    press(w, 2);
    // Dragged 0.75 of the way (to 10.5), but the pillar at (7, 35) catches its edge.
    expect(w.monsters[0].x).toBeCloseTo(7 - w.monsters[0].radius, 9);
    expect(w.monsters[1].x).toBe(20);
  });

  it("a Strike's arc doesn't reach through a wall", () => {
    const w = onMap(
      arena([dummy(13, 32.5), dummy(13.6, 34.4)], { noBasic: true, primary: { form: 'strike' } }),
      ROW_33,
    );
    w.hero.y = 35.2;
    press(w, 0, { x: 13, y: 32.5 });
    expect(damaged(w.monsters[0])).toBe(false);
    expect(damaged(w.monsters[1])).toBe(true);
  });

  it("a melee blow doesn't reach through a wall, even at its own target", () => {
    const w = onMap(arena([dummy(13, 32.4)], { noBasic: true }), ROW_33);
    w.hero.y = 34.5;
    const blow = w.hero.stats.weapon.blows[0];
    const ctx = makeCtx(registry, w, []);
    const landed = landBlow(ctx, blow, blow.kind, { x: 0, y: -1 }, 1, {
      targetId: w.monsters[0].id,
    });
    expect(landed).toBe(false);
    expect(damaged(w.monsters[0])).toBe(false);
  });

  it("a blow's Linger zone ticks only the foes it sees", () => {
    const w = onMap(arena([dummy(13, 35), dummy(13, 32.4)], { noBasic: true }), ROW_33);
    w.zones.push({
      ...{ id: 900, owner: 'hero', source: 'linger', ability: null, x: 13, y: 34.2, radius: 2 },
      ...{ born: 0, until: 5, tick: 0.5, nextTick: 0.1, damage: 10, element: 'fire' },
      ...{ detonateAt: 0, dead: false },
    });
    run(w, 0.2);
    expect(damaged(w.monsters[0])).toBe(true);
    expect(damaged(w.monsters[1])).toBe(false);
  });
});

describe('splash and spreads', () => {
  it("a reaction's splash (Overload) reaches the foes the struck one sees", () => {
    const w = onMap(
      arena([dummy(13, 34.4), dummy(11.5, 34.4), dummy(13, 32.4)], { noBasic: true }),
      ROW_33,
    );
    w.monsters[0].status.stacks.fire = 2;
    w.monsters[0].status.stackUntil.fire = 99;
    const events = [] as Parameters<typeof makeCtx>[2];
    hitMonster(makeCtx(registry, w, events), w.monsters[0], 50, 'storm', { source: 'skill' });
    expect(events.some((e) => e.kind === 'reaction' && e.reaction === 'overload')).toBe(true);
    expect(damaged(w.monsters[1])).toBe(true);
    expect(damaged(w.monsters[2])).toBe(false);
  });

  it("Hellfire Brand's blast reaches the neighbours the corpse sees", () => {
    const w = onMap(
      arena([dummy(13, 34.4), dummy(11.5, 34.4), dummy(13, 32.4)], { noBasic: true }),
      ROW_33,
    );
    w.monsters[0].status.brandUntil = 99;
    killMonster(makeCtx(registry, w, []), w.monsters[0]);
    expect(damaged(w.monsters[1])).toBe(true);
    expect(damaged(w.monsters[2])).toBe(false);
  });
});

describe('homing', () => {
  it('a Volley dart never turns toward a foe it can’t see', () => {
    const w = onMap(arena([dummy(17.5, 34)], { noBasic: true }), EAST_WALL);
    const p = spawnProjectile(makeCtx(registry, w, []), {
      ...{ owner: 'hero', form: 'volley', ability: null, homingId: w.monsters[0].id },
      ...{ x: 13, y: 36, vx: 0, vy: -10, radius: 0.25, damage: 1, element: null },
      ...{ pierce: false, maxDist: 20, explodeRadius: 0, applies: [], knockback: 0 },
    });
    run(w, 0.1);
    expect(p.vx).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-hits.test.ts)`
Expected: FAIL, 8 of 8: six `expected true to be false` (the foes behind walls are struck), the pull drags freely (`expected 10.3 to be close to 6.67`), the dart turns (`expected 5.91… to be +0`).

- [ ] **Step 3: Sight at the hit sites**

In `packages/engine/src/arpg/abilities/forms.ts`:

Replace:

```ts
          (arc >= 360 || angleBetween(dir, dirTo(h.x, h.y, m.x, m.y)) <= half),
```

with:

```ts
          (arc >= 360 || angleBetween(dir, dirTo(h.x, h.y, m.x, m.y)) <= half) &&
          sees(world.map, h, m),
```

Replace:

```ts
      for (const m of alive(ctx)) {
        if (distToSegment(m.x, m.y, fromX, fromY, h.x, h.y) <= ab.radius + m.radius)
```

with:

```ts
      // The trail strikes the foes it passes that either of its ends sees.
      const from = { x: fromX, y: fromY };
      for (const m of alive(ctx)) {
        if (
          distToSegment(m.x, m.y, fromX, fromY, h.x, h.y) <= ab.radius + m.radius &&
          (sees(world.map, from, m) || sees(world.map, h, m))
        )
```

In `packages/engine/src/arpg/abilities/impact.ts`:

Replace:

```ts
import { clipSight, snapToWalkable } from '../grid.js';
```

with:

```ts
import { clipSight, sees, shift, snapToWalkable } from '../grid.js';
```

Replace:

```ts
/** Drag foes toward a point (bosses don't budge, elites half as far). */
function pull(ctx: SimCtx, x: number, y: number, reach: number, strength: number): void {
  for (const m of alive(ctx)) {
    if (m.kind === 'boss' || dist(x, y, m.x, m.y) > reach) continue;
    const k = strength * (m.kind === 'elite' ? 0.5 : 1);
    m.x += (x - m.x) * k;
    m.y += (y - m.y) * k;
```

with:

```ts
/** Drag the foes a point sees toward it, never through a wall (bosses don't budge, elites half as far). */
function pull(ctx: SimCtx, x: number, y: number, reach: number, strength: number): void {
  const map = ctx.world.map;
  for (const m of alive(ctx)) {
    if (m.kind === 'boss' || dist(x, y, m.x, m.y) > reach || !sees(map, { x, y }, m)) continue;
    const k = strength * (m.kind === 'elite' ? 0.5 : 1);
    shift(map, m, m.radius, (x - m.x) * k, (y - m.y) * k);
```

Replace:

```ts
 * any element or fusion works on any form. Returns the foes hit.
```

with:

```ts
 * any element or fusion works on any form. It hits the foes its centre sees.
 * Returns the foes hit.
```

Replace:

```ts
  const hits = alive(ctx).filter((m) => dist(x, y, m.x, m.y) <= radius + m.radius);
```

with:

```ts
  const hits = alive(ctx).filter(
    (m) => dist(x, y, m.x, m.y) <= radius + m.radius && sees(world.map, { x, y }, m),
  );
```

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
import { endPushes, startPush } from './action.js';
```

with:

```ts
import { sees } from './grid.js';
import { endPushes, startPush } from './action.js';
```

Replace:

```ts
/** The nearest foe within `range` inside the arc around `dir` (where a manual lunge stops). */
```

with:

```ts
/** The nearest foe the hero sees within `range` inside the arc around `dir` (where a manual lunge stops). */
```

Replace:

```ts
    best = m;
```

with:

```ts
    if (!sees(ctx.world.map, h, m)) continue;
    best = m;
```

Replace:

```ts
 * blow hits every foe in its reach (× its `area`) and arc, the swing's
 * `targetId` whatever its angle, with one crit roll; a shot blow fires its shot.
```

with:

```ts
 * blow hits every foe the hero sees in its reach (× its `area`) and arc, the
 * swing's `targetId` whatever its angle, with one crit roll; a shot blow fires its shot.
```

Replace:

```ts
      landed = true;
```

with:

```ts
      if (!sees(world.map, h, m)) continue;
      landed = true;
```

Replace:

```ts
 * around it (each once); with knobs, they act after the burst (`shotLands`).
```

with:

```ts
 * around it that it sees (each once); with knobs, they act after the burst (`shotLands`).
```

Replace:

```ts
    if (m !== struck && dist(p.x, p.y, m.x, m.y) > p.explodeRadius + m.radius) continue;
```

with:

```ts
    if (
      m !== struck &&
      (dist(p.x, p.y, m.x, m.y) > p.explodeRadius + m.radius || !sees(ctx.world.map, p, m))
    )
      continue;
```

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
import { snapToWalkable } from './grid.js';
```

with:

```ts
import { sees, snapToWalkable } from './grid.js';
```

Replace:

```ts
/** Every other living foe within `radius` of `m` (edge to centre, as Overload always measured). */
function nearby(ctx: SimCtx, m: MonsterEntity, radius: number): MonsterEntity[] {
  return ctx.world.monsters.filter(
    (o) => !o.dead && o.id !== m.id && dist(o.x, o.y, m.x, m.y) <= radius + o.radius,
```

with:

```ts
/**
 * Every other living foe within `radius` of `m` (edge to centre, as Overload always measured)
 * that `m` sees: the one choke point for the reactions' splash.
 */
function nearby(ctx: SimCtx, m: MonsterEntity, radius: number): MonsterEntity[] {
  return ctx.world.monsters.filter(
    (o) =>
      !o.dead &&
      o.id !== m.id &&
      dist(o.x, o.y, m.x, m.y) <= radius + o.radius &&
      sees(ctx.world.map, m, o),
```

Replace:

```ts
  // Fire mastery: flames spread from burning corpses.
  if (isBurning(ctx, m) && mastery(ctx, 'fire')) {
    for (const o of world.monsters)
      if (!o.dead && dist(o.x, o.y, m.x, m.y) <= 2.5) spreadStacks(ctx, m, o, 'fire');
```

with:

```ts
  // Fire mastery: flames spread from burning corpses to the foes they see.
  if (isBurning(ctx, m) && mastery(ctx, 'fire')) {
    for (const o of world.monsters)
      if (!o.dead && dist(o.x, o.y, m.x, m.y) <= 2.5 && sees(world.map, m, o))
        spreadStacks(ctx, m, o, 'fire');
```

Replace:

```ts
  // Hellfire Brand: branded corpses explode and brand their neighbours.
```

with:

```ts
  // Hellfire Brand: branded corpses explode and brand the neighbours they see.
```

Replace:

```ts
      if (o.dead || dist(o.x, o.y, m.x, m.y) > radius + o.radius) continue;
```

with:

```ts
      if (o.dead || dist(o.x, o.y, m.x, m.y) > radius + o.radius || !sees(world.map, m, o))
        continue;
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
import { isWalkable, moveCircle, snapToWalkable } from './grid.js';
```

with:

```ts
import { isWalkable, moveCircle, sees, snapToWalkable } from './grid.js';
```

Replace:

```ts
/** Volley darts turn toward their foe (or the next nearest once it dies). */
function steer(ctx: SimCtx, p: Projectile, dt: number): void {
  let target = ctx.world.monsters.find((m) => m.id === p.homingId && !m.dead) ?? null;
```

with:

```ts
/** Volley darts turn toward their foe while they see it (else the next nearest they see). */
function steer(ctx: SimCtx, p: Projectile, dt: number): void {
  const map = ctx.world.map;
  let target =
    ctx.world.monsters.find((m) => m.id === p.homingId && !m.dead && sees(map, p, m)) ?? null;
```

Replace:

```ts
      // A blow's Linger: each foe inside takes a basic hit (no crit) of its element.
      const applies = z.element ? [BASIC_STATUS[z.element]] : [];
      for (const m of world.monsters)
        if (!m.dead && dist(z.x, z.y, m.x, m.y) <= z.radius + m.radius)
```

with:

```ts
      // A blow's Linger: each foe inside that it sees takes a basic hit (no crit) of its element.
      const applies = z.element ? [BASIC_STATUS[z.element]] : [];
      for (const m of world.monsters)
        if (!m.dead && dist(z.x, z.y, m.x, m.y) <= z.radius + m.radius && sees(world.map, z, m))
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-hits.test.ts)`
Expected: PASS, 8 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 23 tests in F + 3 files pass (1925 | 5 skipped in 114 | 1 skipped). The fingerprint is identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-b2
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/abilities/impact.ts src/arpg/abilities/forms.ts src/arpg/basic.ts src/arpg/combat.ts src/arpg/step.ts tests/delve-maps-hits.test.ts)
git add packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/abilities/forms.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-maps-hits.test.ts
git commit -m "feat(engine): every area hit and splash needs line of sight" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: A shot stops at the wall's face

A projectile that would cross a blocked cell this tick is put back at the wall's face (`clipSight` from where it was) and ends there: a Bolt bursts at the face, a Split sheds there, a monster's shot just ends. Off the map ends it as before.

**Files:**
- Create: `packages/engine/tests/delve-maps-shots.test.ts`
- Modify: `packages/engine/src/arpg/step.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-maps-shots.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { arena, damaged, dummy, press, run } from './fixtures/arena.js';
import { WALL_30, onMap } from './fixtures/maps.js';

// Projectiles on the grid (see the floor maps spec's "Line of sight"): a shot stops
// at the wall's face, where a Bolt bursts.

describe('shots and walls', () => {
  it('a Bolt that meets a wall bursts at its face', () => {
    const w = onMap(arena([dummy(13, 28)], { noBasic: true }), WALL_30);
    const events = press(w, 0, { x: 13, y: 20 });
    events.push(...run(w, 1));
    const burst = events.find((e) => e.kind === 'explode');
    expect(burst && burst.kind === 'explode' && burst.y).toBeGreaterThan(32);
    expect(burst && burst.kind === 'explode' && burst.y).toBeCloseTo(32, 5);
    expect(damaged(w.monsters[0])).toBe(false);
    expect(w.projectiles).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-shots.test.ts)`
Expected: FAIL, 1 of 1: `expected 31.933… to be greater than 32` (the Bolt bursts inside the wall).

- [ ] **Step 3: The wall's face**

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
import { isWalkable, moveCircle, sees, snapToWalkable } from './grid.js';
```

with:

```ts
import { clipSight, isWalkable, moveCircle, sees, snapToWalkable } from './grid.js';
```

Replace:

```ts
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.traveled += Math.hypot(p.vx, p.vy) * dt;
    // In a wall or off the map.
    const outside = !isWalkable(world.map, p.x, p.y);
```

with:

```ts
    const before = { x: p.x, y: p.y };
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.traveled += Math.hypot(p.vx, p.vy) * dt;
    // A wall stops it at its face (where a bolt bursts); off the map ends it too.
    const wall = !sees(world.map, before, p);
    if (wall) Object.assign(p, clipSight(world.map, before, p));
    const outside = wall || !isWalkable(world.map, p.x, p.y);
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-shots.test.ts)`
Expected: PASS, 1 test.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 24 tests in F + 4 files pass (1926 | 5 skipped in 115 | 1 skipped). The fingerprint is identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-b2
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/step.ts tests/delve-maps-shots.test.ts)
git add packages/engine/src/arpg/step.ts packages/engine/tests/delve-maps-shots.test.ts
git commit -m "feat(engine): a shot stops at the wall's face, where a bolt bursts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: Movers and drops

### Task 5: The dodge, foes, shoves and drops through the grid

The dash a slice a tick (Where the spec left room, 5); `moveMonster`, knockback and both of separation's shoves through `shift`; the magnet draws only what it sees, and the magnet and the vacuum slide drops along walls; `spawnDrop` takes the dying foe, so every drop (items, motes, orbs, Siphon's motes, Seedling's orbs) lands short of any wall from it and carries its room, as the crafting pickups and runes do.

**Files:**
- Create: `packages/engine/tests/delve-maps-motion.test.ts`
- Modify: `packages/engine/src/arpg/dodge.ts`, `step.ts`, `combat.ts`, `material-drops.ts`, `rune-drops.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-maps-motion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { isWalkable, lineOfSight } from '../src/arpg/grid.js';
import { arena, dodge, dummy, registry, run } from './fixtures/arena.js';
import { WALL_30, block, onMap } from './fixtures/maps.js';

// Every mover goes through the grid (see the floor maps spec's "Collision"): the
// dodge a slice a tick, knockback, the shoves foes give each other and the hero,
// the magnet; and drops land short of any wall, in their foe's room.

describe('the dodge', () => {
  it('slides on past a pillar a slice a tick, never jumping the corner', () => {
    // A pillar on rows 35 and 36 at column 9, just left of the hero's edge.
    const w = onMap(arena([dummy(2, 2)], { noBasic: true }), block(9, 35, 9, 36));
    w.hero.x = 10.5;
    dodge(w, { x: -1, y: -1 });
    run(w, 0.5);
    // Up and to the left: held at the pillar until its rows are past, then one slice left.
    expect(w.hero.x).toBeLessThan(10.4);
    expect(w.hero.x).toBeGreaterThan(9.9);
    expect(w.hero.y).toBeCloseTo(36 - 3 / Math.SQRT2, 9);
  });
});

describe('foes', () => {
  it('knockback never carries a foe into a wall', () => {
    const w = onMap(arena([dummy(13, 33, { kby: -60 })], { noBasic: true }), WALL_30);
    run(w, 0.1);
    expect(w.monsters[0].y).toBeCloseTo(32 + w.monsters[0].radius, 9);
  });

  it("a boss's shove never presses a foe into a wall", () => {
    const w = onMap(
      arena([dummy(13, 32.5), dummy(13, 33.4, { kind: 'boss', radius: 1.5 })], { noBasic: true }),
      WALL_30,
    );
    w.hero.x = 3;
    run(w, 1 / 30);
    expect(w.monsters[0].y).toBeGreaterThanOrEqual(32 + w.monsters[0].radius - 1e-9);
  });
});

describe('drops', () => {
  it('a mote behind a wall stays; one in sight flies to the hero', () => {
    const w = onMap(arena([dummy(2, 2)], { noBasic: true }), WALL_30);
    w.hero.y = 33;
    w.drops.push(
      ...[29.8, 35].map((y, i) => ({
        ...{ id: 900 + i, kind: 'mote' as const, x: 13, y, mana: 'fire' as const, amount: 1 },
        ...{ born: 0, vacuum: false, dead: false },
      })),
    );
    run(w, 1);
    expect(w.drops.map((d) => d.id)).toEqual([900]);
    expect(w.drops[0].y).toBe(29.8);
  });

  it("drops land short of any wall from their foe, and carry the foe's room", () => {
    for (let seed = 0; seed < 10; seed++) {
      const w = onMap(arena([dummy(13, 32.4, { kind: 'elite', hp: 1, roomId: 3 })]), WALL_30);
      w.lootRng = w.lootRng.fork(`seed:${seed}`);
      const foe = w.monsters[0];
      killMonster(makeCtx(registry, w, []), foe);
      expect(w.drops.length).toBeGreaterThan(1);
      for (const d of w.drops) {
        expect(isWalkable(w.map, d.x, d.y), `${d.kind} ${d.x}, ${d.y}`).toBe(true);
        expect(lineOfSight(w.map, foe, d), `${d.kind} ${d.x}, ${d.y}`).toBe(true);
        expect(d.roomId).toBe(3);
      }
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-motion.test.ts)`
Expected: FAIL, 5 of 5: the dash stays at the pillar (`expected 10.5 to be less than 10.4`), knockback ends inside the wall (`expected 28.64… to be close to 32.33`), the shove presses the foe in (`expected 31.57 to be greater than or equal to 32.33`), both motes fly (`expected [] to deeply equal [ 900 ]`), the drops have no room (`expected undefined to be 3`).

- [ ] **Step 3: The movers and the drops**

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
import { sees, snapToWalkable } from './grid.js';
```

with:

```ts
import { clipSight, sees, snapToWalkable } from './grid.js';
```

Replace:

```ts
      spawnDrop(ctx, 'orb', m.x, m.y, { amount: r.seedlingHeal, mana: 'nature' });
```

with:

```ts
      spawnDrop(ctx, 'orb', m, m.x, m.y, { amount: r.seedlingHeal, mana: 'nature' });
```

Replace:

```ts
        spawnDrop(ctx, 'mote', x, y, { amount: each, mana: 'shadow', vacuum: true });
```

with:

```ts
        spawnDrop(ctx, 'mote', m, x, y, { amount: each, mana: 'shadow', vacuum: true });
```

Replace:

```ts
function spawnDrop(
  ctx: SimCtx,
  kind: DropKind,
  x: number,
  y: number,
```

with:

```ts
/**
 * A drop from foe `from` thrown toward (x, y): it lands short of any wall
 * between them, and belongs to the foe's room (see the floor maps spec).
 */
function spawnDrop(
  ctx: SimCtx,
  kind: DropKind,
  from: MonsterEntity,
  tx: number,
  ty: number,
```

Replace:

```ts
  world.drops.push({
```

with:

```ts
  const { x, y } = clipSight(world.map, from, { x: tx, y: ty });
  world.drops.push({
```

Replace:

```ts
    amount: extra.amount,
```

with:

```ts
    ...(from.roomId !== null && { roomId: from.roomId }),
    amount: extra.amount,
```

Replace:

```ts
    spawnDrop(ctx, 'item', x, y, { item, amount: 1 });
```

with:

```ts
    spawnDrop(ctx, 'item', m, x, y, { item, amount: 1 });
```

Replace:

```ts
  spawnDrop(ctx, 'mote', m.x + (lootRng.next() - 0.5), m.y + (lootRng.next() - 0.5), {
```

with:

```ts
  spawnDrop(ctx, 'mote', m, m.x + (lootRng.next() - 0.5), m.y + (lootRng.next() - 0.5), {
```

Replace:

```ts
    spawnDrop(ctx, 'orb', m.x + (lootRng.next() - 0.5) * 2, m.y + (lootRng.next() - 0.5) * 2, {
```

with:

```ts
    const x = m.x + (lootRng.next() - 0.5) * 2;
    spawnDrop(ctx, 'orb', m, x, m.y + (lootRng.next() - 0.5) * 2, {
```

In `packages/engine/src/arpg/dodge.ts`:

Replace:

```ts
/** Refill charges and carry the dash (placed by progress, so it always covers the full distance). */
```

with:

```ts
/**
 * Refill charges and carry the dash: each tick on toward where its progress puts
 * it (so it always covers the full distance), swept from where the hero stands
 * (see the floor maps spec). Once a wall has held it back, each tick moves only
 * its own slice, so it never lurches on past a corner.
 */
```

Replace:

```ts
  const k = Math.min(1, (t - d.start) / bal.dodge.duration) * bal.dodge.distance;
  // Swept from where it began, so a wall stops it.
  const from = { x: d.fromX, y: d.fromY };
  Object.assign(h, moveCircle(world.map, from, h.radius, d.dir.x * k, d.dir.y * k));
```

with:

```ts
  const at = (s: number) =>
    Math.min(1, Math.max(0, (s - d.start) / bal.dodge.duration)) * bal.dodge.distance;
  const k = at(t);
  const slice = k - at(t - dt);
  const tx = d.fromX + d.dir.x * k;
  const ty = d.fromY + d.dir.y * k;
  const late = Math.hypot(tx - h.x, ty - h.y) > slice + 1e-9;
  const dx = late ? d.dir.x * slice : tx - h.x;
  const dy = late ? d.dir.y * slice : ty - h.y;
  Object.assign(h, moveCircle(world.map, h, h.radius, dx, dy));
```

In `packages/engine/src/arpg/material-drops.ts`:

Replace:

```ts
import { snapToWalkable } from './grid.js';
```

with:

```ts
import { clipSight, snapToWalkable } from './grid.js';
```

Replace:

```ts
    const { x, y } = snapToWalkable(
      world.map,
      m.x + Math.cos(angle) * r,
      m.y + Math.sin(angle) * r,
      1,
    );
    const id = world.nextId++;
    world.drops.push({ id, x, y, ...extra, born: world.t, vacuum: world.cleared, dead: false });
```

with:

```ts
    // Short of any wall between it and its foe, in the foe's room (see the floor maps spec).
    const at = snapToWalkable(world.map, m.x + Math.cos(angle) * r, m.y + Math.sin(angle) * r, 1);
    const { x, y } = clipSight(world.map, m, at);
    const id = world.nextId++;
    world.drops.push({
      id,
      x,
      y,
      ...extra,
      ...(m.roomId !== null && { roomId: m.roomId }),
      born: world.t,
      vacuum: world.cleared,
      dead: false,
    });
```

In `packages/engine/src/arpg/rune-drops.ts`:

Replace:

```ts
import { snapToWalkable } from './grid.js';
```

with:

```ts
import { clipSight, snapToWalkable } from './grid.js';
```

Replace:

```ts
  const { x, y } = snapToWalkable(
    world.map,
    m.x + Math.cos(angle) * r,
    m.y + Math.sin(angle) * r,
    1,
  );
```

with:

```ts
  // Short of any wall between it and its foe, in the foe's room (see the floor maps spec).
  const at = snapToWalkable(world.map, m.x + Math.cos(angle) * r, m.y + Math.sin(angle) * r, 1);
  const { x, y } = clipSight(world.map, m, at);
```

Replace:

```ts
    amount: 1,
```

with:

```ts
    ...(m.roomId !== null && { roomId: m.roomId }),
    amount: 1,
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
import { clipSight, isWalkable, moveCircle, sees, snapToWalkable } from './grid.js';
```

with:

```ts
import { clipSight, isWalkable, moveCircle, sees, shift, snapToWalkable } from './grid.js';
```

Replace:

```ts
/** Rooted foes stay put (they can still attack in reach). */
function moveMonster(ctx: SimCtx, m: MonsterEntity, dir: Vec, speed: number, dt: number): void {
  if (isRooted(ctx, m)) return;
  m.x += dir.x * speed * dt;
  m.y += dir.y * speed * dt;
```

with:

```ts
/** Rooted foes stay put (they can still attack in reach); a wall stops the rest. */
function moveMonster(ctx: SimCtx, m: MonsterEntity, dir: Vec, speed: number, dt: number): void {
  if (isRooted(ctx, m)) return;
  shift(ctx.world.map, m, m.radius, dir.x * speed * dt, dir.y * speed * dt);
```

Replace:

```ts
      m.x += m.kbx * dt;
      m.y += m.kby * dt;
```

with:

```ts
      shift(world.map, m, m.radius, m.kbx * dt, m.kby * dt);
```

Replace:

```ts
function separate(ctx: SimCtx): void {
  const { world } = ctx;
```

with:

```ts
/** Foes push apart, and the hero from them, never into a wall. */
function separate(ctx: SimCtx): void {
  const { world } = ctx;
  const map = world.map;
```

Replace:

```ts
      a.x -= n.x * overlap * wa;
      a.y -= n.y * overlap * wa;
      b.x += n.x * overlap * (1 - wa);
      b.y += n.y * overlap * (1 - wa);
```

with:

```ts
      shift(map, a, a.radius, -n.x * overlap * wa, -n.y * overlap * wa);
      shift(map, b, b.radius, n.x * overlap * (1 - wa), n.y * overlap * (1 - wa));
```

Replace:

```ts
      a.x += n.x * overlap * (1 - heroShare);
      a.y += n.y * overlap * (1 - heroShare);
      h.x -= n.x * overlap * heroShare;
      h.y -= n.y * overlap * heroShare;
```

with:

```ts
      shift(map, a, a.radius, n.x * overlap * (1 - heroShare), n.y * overlap * (1 - heroShare));
      shift(map, h, h.radius, -n.x * overlap * heroShare, -n.y * overlap * heroShare);
```

Replace:

```ts
  Object.assign(h, moveCircle(world.map, h, h.radius, 0, 0));
}

/** Gear, runes, patterns and essences are walked over; everything else flies to the hero in the magnet's reach. */
```

with:

```ts
  Object.assign(h, moveCircle(world.map, h, h.radius, 0, 0));
}

/** A drop's size on the grid, as the magnet and the vacuum slide it along walls. */
const DROP_RADIUS = 0.25;

/** Gear, runes, patterns and essences are walked over; everything else flies to the hero in the magnet's reach. */
```

Replace:

```ts
    const magnet = !walkedOver(d) && gap < bal.hero.magnetRadius;
```

with:

```ts
    // The magnet draws what it sees; the vacuum, anything. Both slide along walls.
    const magnet = !walkedOver(d) && gap < bal.hero.magnetRadius && sees(world.map, d, h);
```

Replace:

```ts
      d.x += dir.x * stepLen;
      d.y += dir.y * stepLen;
```

with:

```ts
      shift(world.map, d, DROP_RADIUS, dir.x * stepLen, dir.y * stepLen);
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-motion.test.ts tests/delve-maps-movers.test.ts)`
Expected: PASS, 5 + 4 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 29 tests in F + 5 files pass (1931 | 5 skipped in 116 | 1 skipped). The fingerprint is identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-b2
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/dodge.ts src/arpg/step.ts src/arpg/combat.ts src/arpg/material-drops.ts src/arpg/rune-drops.ts tests/delve-maps-motion.test.ts)
git add packages/engine/src/arpg/dodge.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/material-drops.ts packages/engine/src/arpg/rune-drops.ts packages/engine/tests/delve-maps-motion.test.ts
git commit -m "feat(engine): the dodge a slice a tick; foes, shoves and the magnet through the grid; drops in their foe's room" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: An elite den's elites find gear more often

B1's X3: `drops.den.gearBonus` added to an elite's gear chance in a den room (`DropContext.gearBonus`), inside `dropLoot`'s `dropsGiven` guard as all gear is.

**Files:**
- Modify: `packages/engine/tests/delve-maps-motion.test.ts`, `packages/engine/src/arpg/combat.ts`, `packages/engine/src/loot/drops.ts`

- [ ] **Step 1: The failing test**

In `packages/engine/tests/delve-maps-motion.test.ts`:

Replace:

```ts
        expect(d.roomId).toBe(3);
      }
    }
  });
});
```

with:

```ts
        expect(d.roomId).toBe(3);
      }
    }
  });

  it("an elite den's elites find gear more often", () => {
    const items = (kind: 'den' | 'combat') => {
      let n = 0;
      for (let seed = 0; seed < 60; seed++) {
        const w = onMap(arena([dummy(13, 20, { kind: 'elite', hp: 1, roomId: 0 })]), []);
        w.map.rooms[0].kind = kind;
        w.lootRng = w.lootRng.fork(`seed:${seed}`);
        killMonster(makeCtx(registry, w, []), w.monsters[0]);
        n += w.drops.filter((d) => d.kind === 'item').length;
      }
      return n;
    };
    expect(items('den')).toBeGreaterThan(items('combat'));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-motion.test.ts)`
Expected: FAIL, 1 of 6: `expected 33 to be greater than 33`.

- [ ] **Step 3: The bonus** (`loot/drops.ts` hand-edited: never formatted)

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
  const drops = given
```

with:

```ts
  // An elite den's foes find gear more often (see the floor maps spec).
  const den = world.map.rooms.find((r) => r.id === m.roomId)?.kind === 'den';
  const drops = given
```

Replace:

```ts
          nextUid: loot.nextUid,
```

with:

```ts
          ...(den && { gearBonus: bal.drops.den.gearBonus }),
          nextUid: loot.nextUid,
```

In `packages/engine/src/loot/drops.ts`:

Replace:

```ts
  gear: number;
  nextUid: number;
```

with:

```ts
  gear: number;
  /** Added to an elite's gear chance (an elite den's `drops.den.gearBonus`). */
  gearBonus?: number;
  nextUid: number;
```

Replace:

```ts
 * normal foe none, an elite one at `drops.elite.gearChance` × the door's
 * `gear` (at most 1), a boss `drops.boss.gear`.
```

with:

```ts
 * normal foe none, an elite one at (`drops.elite.gearChance` + `gearBonus`) ×
 * the door's `gear` (at most 1), a boss `drops.boss.gear`.
```

Replace:

```ts
  if (ctx.kind === 'elite') return rng.next() < Math.min(1, elite.gearChance * ctx.gear) ? 1 : 0;
```

with:

```ts
  const chance = (elite.gearChance + (ctx.gearBonus ?? 0)) * ctx.gear;
  if (ctx.kind === 'elite') return rng.next() < Math.min(1, chance) ? 1 : 0;
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-motion.test.ts)`
Expected: PASS, 6 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 30 tests in F + 5 files pass (1932 | 5 skipped in 116 | 1 skipped). The fingerprint is identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-b2
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/combat.ts tests/delve-maps-motion.test.ts)
git add packages/engine/src/arpg/combat.ts packages/engine/src/loot/drops.ts packages/engine/tests/delve-maps-motion.test.ts
git commit -m "feat(engine): an elite den's elites find gear more often" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 7: A spatial hash for separation

`separate` takes each foe's partners from the 3 × 3 buckets of a uniform-grid hash instead of the whole list, in the list's order as before, so its results are the all-pairs pass's to the bit.

**Files:**
- Create: `packages/engine/src/arpg/spatial.ts`, `packages/engine/tests/delve-maps-spatial.test.ts`
- Modify: `packages/engine/src/arpg/step.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-maps-spatial.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nearIndices, spatialHash } from '../src/arpg/spatial.js';
import { dist } from '../src/arpg/geometry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { arena, dummy, run } from './fixtures/arena.js';

// The spatial hash that replaces separation's all-pairs pass (see the floor maps spec).

describe('the spatial hash', () => {
  it('finds every body within a cell of a point, ascending, wherever they stand', () => {
    const rng = new SeededRNG(9);
    const bodies = Array.from({ length: 200 }, () => ({
      x: rng.next() * 60 - 5,
      y: rng.next() * 60 - 5,
    }));
    const hash = spatialHash(bodies, 2.5);
    for (let k = 0; k < 200; k++) {
      const p = { x: rng.next() * 60 - 5, y: rng.next() * 60 - 5 };
      const near = nearIndices(hash, p.x, p.y);
      expect(near).toEqual([...near].sort((a, b) => a - b));
      bodies.forEach((b, i) => {
        if (dist(p.x, p.y, b.x, b.y) <= 2.5) expect(near).toContain(i);
      });
    }
  });

  it('separation parts a crowd exactly as the all-pairs pass did', () => {
    const rng = new SeededRNG(4);
    const w = arena(
      Array.from({ length: 30 }, () => dummy(10 + rng.next() * 6, 8 + rng.next() * 6)),
      { noBasic: true },
    );
    // The all-pairs pass, on a copy (the hero is far off, and nothing else moves them).
    const ms = w.monsters.map((m) => ({ x: m.x, y: m.y, r: m.radius }));
    for (let i = 0; i < ms.length; i++)
      for (let j = i + 1; j < ms.length; j++) {
        const [a, b] = [ms[i], ms[j]];
        const d = dist(a.x, a.y, b.x, b.y);
        const overlap = a.r + b.r - d;
        if (overlap <= 0) continue;
        const n = d > 1e-6 ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : { x: 1, y: 0 };
        a.x -= n.x * overlap * 0.5;
        a.y -= n.y * overlap * 0.5;
        b.x += n.x * overlap * 0.5;
        b.y += n.y * overlap * 0.5;
      }
    run(w, 1 / 30);
    expect(w.monsters.map((m) => [m.x, m.y])).toEqual(ms.map((m) => [m.x, m.y]));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-spatial.test.ts)`
Expected: FAIL: `Cannot find module '../src/arpg/spatial.js'`.

- [ ] **Step 3: The hash, and separation over it**

Create `packages/engine/src/arpg/spatial.ts`:

```ts
import type { Vec } from '../types/arpg.js';

/**
 * A uniform-grid spatial hash (see the floor maps spec): bodies bucketed by
 * square cells of `cell` units, so a pass over neighbours looks only in the
 * 3 × 3 buckets round a point instead of at every body.
 */
export interface SpatialHash {
  cell: number;
  buckets: Map<number, number[]>;
}

function key(bx: number, by: number): number {
  return bx * 65536 + by;
}

/** Bucket each body's index (in `bodies`' order) by where it stands now. */
export function spatialHash(bodies: readonly Vec[], cell: number): SpatialHash {
  const buckets = new Map<number, number[]>();
  bodies.forEach((b, i) => {
    const k = key(Math.floor(b.x / cell), Math.floor(b.y / cell));
    const list = buckets.get(k);
    if (list) list.push(i);
    else buckets.set(k, [i]);
  });
  return { cell, buckets };
}

/**
 * The indices, ascending, of the bodies hashed in the 3 × 3 buckets round
 * (x, y): every body within `cell` of it (as they stood when hashed), and some
 * farther.
 */
export function nearIndices(hash: SpatialHash, x: number, y: number): number[] {
  const bx = Math.floor(x / hash.cell);
  const by = Math.floor(y / hash.cell);
  const out: number[] = [];
  for (let i = bx - 1; i <= bx + 1; i++)
    for (let j = by - 1; j <= by + 1; j++) out.push(...(hash.buckets.get(key(i, j)) ?? []));
  return out.sort((a, b) => a - b);
}
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
import { fogTick } from './fog.js';

/** Seconds from aggro to a boss's first special (the Training Grounds' spawner uses it too). */
```

with:

```ts
import { fogTick } from './fog.js';
import { nearIndices, spatialHash } from './spatial.js';

/** Seconds from aggro to a boss's first special (the Training Grounds' spawner uses it too). */
```

Replace:

```ts
/** Foes push apart, and the hero from them, never into a wall. */
```

with:

```ts
/**
 * Foes push apart, and the hero from them, never into a wall. Each pair is
 * looked at in the list's order, as always, but only neighbours in a spatial
 * hash whose cells span the widest pair and a unit more for this pass's shoves.
 */
```

Replace:

```ts
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i];
    for (let j = i + 1; j < ms.length; j++) {
```

with:

```ts
  // ponytail: a crowd shoved over a unit in one pass could miss a pair; the next tick has it.
  const hash = spatialHash(ms, 2 * Math.max(0, ...ms.map((m) => m.radius)) + 1);
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i];
    for (const j of nearIndices(hash, a.x, a.y)) {
      if (j <= i) continue;
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-spatial.test.ts)`
Expected: PASS, 2 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 32 tests in F + 6 files pass (1934 | 5 skipped in 117 | 1 skipped). The fingerprint is identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-b2
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/spatial.ts src/arpg/step.ts tests/delve-maps-spatial.test.ts)
git add packages/engine/src/arpg/spatial.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-maps-spatial.test.ts
git commit -m "perf(engine): a spatial hash for separation" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: Foes

### Task 8: Flow fields

Phase A's `flowField` and `flowTick` stubs filled, with `UNREACHED`, `clearanceOf` and `downhill` beside them (Where the spec left room, 10, 11, 13). Nothing steers by them yet (Task 9); the open room builds none.

**Files:**
- Create: `packages/engine/tests/delve-maps-flow.test.ts`
- Modify: `packages/engine/src/arpg/flow.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-maps-flow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { UNREACHED, downhill, flowField } from '../src/arpg/flow.js';
import { arena, bal, dummy, run } from './fixtures/arena.js';
import { block, onMap, walledMap } from './fixtures/maps.js';

// Flow-field pathing (see the floor maps spec's "Monsters"): a BFS toward the hero
// per clearance class, rebuilt at `ai.flowEvery` marks, that foes step down.

/**
 * 12 × 7: a wall down column 6 with a one-cell gap at row 1 and a three-cell
 * gap at rows 4 to 6 (the bottom edge).
 */
const GAPS = walledMap(12, 7, [
  [6, 0],
  [6, 2],
  [6, 3],
]);
const at = (f: Uint16Array, x: number, y: number) => f[y * 12 + x];

describe('flowField', () => {
  it('counts steps to the target round walls, and stops at its radius', () => {
    const f = flowField(GAPS, { x: 10.5, y: 1.5 }, 30, 1);
    expect(at(f, 10, 1)).toBe(0);
    expect(at(f, 7, 1)).toBe(3);
    // Through the one-cell gap.
    expect(at(f, 5, 1)).toBe(5);
    expect(at(f, 6, 0)).toBe(UNREACHED);
    const near = flowField(GAPS, { x: 10.5, y: 1.5 }, 4, 1);
    expect(at(near, 7, 1)).toBe(3);
    expect(at(near, 5, 1)).toBe(UNREACHED);
  });

  it('a large foe goes round by the wide gap, never the narrow one', () => {
    const f = flowField(GAPS, { x: 10.5, y: 1.5 }, 30, 2);
    // Each counted cell's 3 × 3 is open: the one-cell gap isn't.
    expect(at(f, 6, 1)).toBe(UNREACHED);
    expect(at(f, 6, 5)).not.toBe(UNREACHED);
    expect(at(f, 4, 4)).toBeGreaterThan(at(flowField(GAPS, { x: 10.5, y: 1.5 }, 30, 1), 4, 4));
  });

  it('a closed door is a wall to it', () => {
    const map = walledMap(5, 3, [
      [2, 0],
      [2, 2],
    ]);
    map.cells[1 * 5 + 2] = 2;
    map.doors.push({ id: 0, cells: [{ x: 2, y: 1 }], rooms: [0, 1], closed: false });
    expect(at5(flowField(map, { x: 4.5, y: 1.5 }, 30, 1), 0, 1)).toBe(4);
    map.doors[0].closed = true;
    expect(at5(flowField(map, { x: 4.5, y: 1.5 }, 30, 1), 0, 1)).toBe(UNREACHED);
  });
});

const at5 = (f: Uint16Array, x: number, y: number) => f[y * 5 + x];

describe('downhill', () => {
  it('steps toward the nearer neighbour, diagonally where both sides are open', () => {
    const f = flowField(GAPS, { x: 10.5, y: 1.5 }, 30, 1);
    const d = downhill(GAPS, f, { x: 8.5, y: 3.5 }, { x: 10.5, y: 1.5 })!;
    expect(d.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(d.y).toBeCloseTo(-Math.SQRT1_2, 9);
    // In the target's own cell: straight at it.
    expect(downhill(GAPS, f, { x: 10.2, y: 1.5 }, { x: 10.5, y: 1.5 })).toEqual({ x: 1, y: 0 });
  });

  it('is null where the field doesn’t reach', () => {
    const f = flowField(GAPS, { x: 10.5, y: 1.5 }, 2, 1);
    expect(downhill(GAPS, f, { x: 2.5, y: 3.5 }, { x: 10.5, y: 1.5 })).toBeNull();
  });
});

describe('flowTick', () => {
  it('builds both fields at its marks on a map, and none in the open room', () => {
    const open = arena([dummy(2, 2)], { noBasic: true });
    run(open, 0.5);
    expect(open.flow.small).toBeNull();
    const w = onMap(arena([dummy(2, 2)], { noBasic: true }), block(0, 30, 25, 31));
    run(w, 1 / 30);
    const first = w.flow.small;
    expect(first).not.toBeNull();
    expect(w.flow.large).not.toBeNull();
    expect(w.flow.nextAt).toBeCloseTo(w.t + bal.ai.flowEvery, 9);
    run(w, 1 / 30);
    expect(w.flow.small).toBe(first);
    run(w, bal.ai.flowEvery);
    expect(w.flow.small).not.toBe(first);
    // The hero's cell is 0.
    expect(w.flow.small![Math.floor(w.hero.y) * w.width + Math.floor(w.hero.x)]).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-flow.test.ts)`
Expected: FAIL, 6 of 6: `Error: flowField: not implemented` (5) and `expected null not to be null` (no field built).

- [ ] **Step 3: The fields**

In `packages/engine/src/arpg/flow.ts`:

Replace:

```ts
import type { Vec } from '../types/arpg.js';
import type { FloorMap } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';

/**
 * Foes' pathing and leashing on the grid (see the floor maps spec's
 * "Monsters"; the physics and AI area fills this file). Each tick is a no-op
 * on the open room.
 */

/**
 * Steps from each walkable cell to `target` (BFS, within `radius` cells) for a
 * foe `clearance` cells wide; 65535 where it doesn't reach.
 */
export function flowField(
  _map: FloorMap,
  _target: Vec,
  _radius: number,
  _clearance: number,
): Uint16Array {
  throw new Error('flowField: not implemented');
}

/** Rebuild the flow fields toward the hero at `ai.flowEvery` marks (`ArpgWorld.flow`). */
export function flowTick(_ctx: SimCtx): void {}
```

with:

```ts
import type { MonsterEntity, Vec } from '../types/arpg.js';
import type { FloorMap } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';
import { dirTo } from './geometry.js';
import { blocked } from './grid.js';

/**
 * Foes' pathing and leashing on the grid (see the floor maps spec's
 * "Monsters"). Each tick is a no-op on the open room.
 */

/** A flow field's value where it doesn't reach. */
export const UNREACHED = 65535;

/** The large clearance class's width in cells (a foe wider than one cell), at most `hallWidth`. */
const LARGE = 2;

/** A foe's clearance class: `large` when it is wider than a cell. */
export function clearanceOf(m: MonsterEntity): 'small' | 'large' {
  return m.radius > 0.5 ? 'large' : 'small';
}

/** The cell a coordinate falls in, kept on the map. */
function cellAt(v: number, n: number): number {
  return Math.min(n - 1, Math.max(0, Math.floor(v)));
}

/**
 * Steps from each walkable cell to `target` (BFS over the four neighbours,
 * within `radius` steps) for a foe `clearance` cells wide: a cell counts only
 * if the odd square round it that fits such a foe is open (one cell for 1, three
 * for 2 or 3). UNREACHED where it doesn't reach. The target's own cell is 0
 * whatever stands there.
 */
export function flowField(
  map: FloorMap,
  target: Vec,
  radius: number,
  clearance: number,
): Uint16Array {
  const { width: w, height: h } = map;
  const field = new Uint16Array(w * h).fill(UNREACHED);
  const half = Math.floor(clearance / 2);
  const fits = (cx: number, cy: number) => {
    for (let y = cy - half; y <= cy + half; y++)
      for (let x = cx - half; x <= cx + half; x++) if (blocked(map, x, y)) return false;
    return true;
  };
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const start = cellAt(target.y, h) * w + cellAt(target.x, w);
  field[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const c = queue[head++];
    const d = field[c];
    if (d >= radius) continue;
    const cx = c % w;
    const cy = (c - cx) / w;
    for (const [nx, ny] of [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (field[n] !== UNREACHED || !fits(nx, ny)) continue;
      field[n] = d + 1;
      queue[tail++] = n;
    }
  }
  return field;
}

/** The eight neighbours, orthogonal first: on a tie the straight step wins. */
const AROUND = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/**
 * The way down `field` from `p`: toward the centre of the neighbouring cell
 * nearest its target (a diagonal only where both cells beside it are in the
 * field), or straight at `target` in its own cell; null where the field
 * doesn't reach (nor any neighbour) or nothing is nearer.
 */
export function downhill(map: FloorMap, field: Uint16Array, p: Vec, target: Vec): Vec | null {
  const w = map.width;
  const cx = cellAt(p.x, w);
  const cy = cellAt(p.y, map.height);
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= map.height ? UNREACHED : field[y * w + x];
  const here = at(cx, cy);
  if (here === 0) return dirTo(p.x, p.y, target.x, target.y);
  let best = here;
  let to: Vec | null = null;
  for (const [dx, dy] of AROUND) {
    const v = at(cx + dx, cy + dy);
    if (v >= best) continue;
    if (dx && dy && (at(cx + dx, cy) === UNREACHED || at(cx, cy + dy) === UNREACHED)) continue;
    best = v;
    to = { x: cx + dx + 0.5, y: cy + dy + 0.5 };
  }
  return to && dirTo(p.x, p.y, to.x, to.y);
}

/** Rebuild both flow fields toward the hero at each `ai.flowEvery` mark (`ArpgWorld.flow`). */
export function flowTick(ctx: SimCtx): void {
  const { world, bal } = ctx;
  const flow = world.flow;
  if (world.map.open || world.t < flow.nextAt) return;
  flow.nextAt = world.t + bal.ai.flowEvery;
  const { flowRadius } = bal.ai;
  flow.small = flowField(world.map, world.hero, flowRadius, 1);
  flow.large = flowField(world.map, world.hero, flowRadius, Math.min(LARGE, bal.layout.hallWidth));
}
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-flow.test.ts)`
Expected: PASS, 6 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 38 tests in F + 7 files pass (1940 | 5 skipped in 118 | 1 skipped). The fingerprint is identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-b2
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/flow.ts tests/delve-maps-flow.test.ts)
git add packages/engine/src/arpg/flow.ts packages/engine/tests/delve-maps-flow.test.ts
git commit -m "feat(engine): flow fields toward the hero, by clearance class" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: Foes that see

A foe wakes when it sees the hero within `monster.aggroRadius` (or is hit), its pack with it; it goes after the hero by `pursue` (straight on sight within `ai.directRange`, a ranged foe on sight, else down its class's field, holding beyond it); melee blows, chargers' wind-ups and ranged wind-ups and shots need sight; the slam respects walls; a boss keeps to its room after each move and knockback; its adds join its room (B1's X1), short of any wall from it.

**Files:**
- Create: `packages/engine/tests/delve-maps-ai.test.ts`
- Modify: `packages/engine/src/arpg/step.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-maps-ai.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dist } from '../src/arpg/geometry.js';
import type { SeededRNG } from '../src/rng/seeded-rng.js';
import { arena, dummy, run } from './fixtures/arena.js';
import { WALL_30, block, onMap } from './fixtures/maps.js';

// Foes on the grid (see the floor maps spec's "Monsters"): they wake on sight,
// path by the flow field, hold beyond it, attack only what they see, and a boss
// keeps to its room. The hero stands at (13, 36).

describe('waking', () => {
  it('a foe near the hero but behind a wall sleeps on; one in sight wakes', () => {
    const w = onMap(
      arena([dummy(13, 29), dummy(10, 34, { packId: 2 })], { noBasic: true }),
      WALL_30,
    );
    run(w, 0.1);
    expect(w.monsters[0].aggro).toBe(false);
    expect(w.monsters[1].aggro).toBe(true);
  });
});

describe('pathing', () => {
  it('a foe goes round a wall by the flow field to reach the hero', () => {
    // Rows 30 and 31 a wall but for a gap at columns 0 to 4.
    const w = onMap(
      arena([dummy(13, 26, { speed: 3, aggro: true })], { noBasic: true }),
      block(5, 30, 25, 31),
    );
    run(w, 10);
    const m = w.monsters[0];
    expect(dist(m.x, m.y, w.hero.x, w.hero.y) - m.radius - w.hero.radius).toBeLessThan(
      m.attackRange,
    );
  });

  it('beyond the field (here: no way through) a foe holds its place', () => {
    const w = onMap(arena([dummy(13, 20, { speed: 3, aggro: true })], { noBasic: true }), WALL_30);
    run(w, 2);
    expect(w.monsters[0]).toMatchObject({ x: 13, y: 20 });
  });
});

describe('attacks', () => {
  it("a melee foe's blow doesn't land through a wall", () => {
    const w = onMap(
      arena([dummy(13, 32.4, { aggro: true, damage: 10, windupUntil: 0.05 })], { noBasic: true }),
      block(0, 33, 25, 33),
    );
    w.hero.y = 34.5;
    run(w, 0.2);
    expect(w.hero.hp).toBe(w.hero.stats.maxHp);
  });

  it('a ranged foe fires only with sight', () => {
    const fired = (x: number, y: number) => {
      const w = onMap(
        arena([dummy(x, y, { ai: 'ranged', aggro: true, damage: 10 })], { noBasic: true }),
        WALL_30,
      );
      // Its wind-up (0.5 s) over, the shot is in flight.
      run(w, 0.55);
      return w.projectiles.length > 0;
    };
    expect(fired(13, 28)).toBe(false);
    expect(fired(5, 33)).toBe(true);
  });

  it("the boss's slam doesn't reach through a wall", () => {
    const w = onMap(arena([dummy(2, 2)], { noBasic: true }), WALL_30);
    w.hero.y = 32.5;
    w.zones.push({
      ...{ id: 900, owner: 'monster', source: null, ability: null, x: 13, y: 29.5, radius: 2.6 },
      ...{ born: 0, until: 1, tick: 0, nextTick: 0, damage: 50, element: null },
      ...{ detonateAt: 0.05, dead: false },
    });
    run(w, 0.2);
    expect(w.hero.hp).toBe(w.hero.stats.maxHp);
  });
});

describe('the boss', () => {
  it('never leaves its room', () => {
    const w = onMap(
      arena([dummy(7, 10, { kind: 'boss', roomId: 0, speed: 3, aggro: true })], { noBasic: true }),
      [],
    );
    w.map.rooms[0].rect = { x: 2, y: 2, w: 10, h: 10 };
    w.hero.y = 20;
    w.monsters[0].nextSpecialAt = 1e9;
    run(w, 3);
    const m = w.monsters[0];
    expect(m.y).toBeCloseTo(12 - m.radius, 9);
  });

  it('its adds join its room', () => {
    const w = onMap(arena([dummy(7, 10, { kind: 'boss', roomId: 0, aggro: true })]), []);
    // The special's roll picks the adds (2); every other draw its lowest.
    w.rng = {
      nextInt: (a: number, b: number) => (a === 0 && b === 2 ? 2 : a),
      next: () => 0.5,
    } as unknown as SeededRNG;
    run(w, 1 / 30);
    const adds = w.monsters.filter((m) => m.kind === 'normal');
    expect(adds.length).toBe(2);
    for (const a of adds) expect(a.roomId).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-ai.test.ts)`
Expected: FAIL, 8 of 8: the walled foe wakes (`expected true to be false`), the chaser sticks at the wall (`expected 5.49… to be less than 1.1`), the walled-off foe walks on, the blow and the slam land (`expected 118.72… to be 154`, `expected 146.94… to be 154`), the ranged foe fires, the boss leaves its room (`expected 17.71… to be close to 11.67`), its adds have no room (`expected null to be +0`).

- [ ] **Step 3: The foes**

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
import { clampLen, dirTo, dist } from './geometry.js';
```

with:

```ts
import { clamp, clampLen, dirTo, dist } from './geometry.js';
```

Replace:

```ts
import { flowTick, leashTick } from './flow.js';
```

with:

```ts
import { clearanceOf, downhill, flowTick, leashTick } from './flow.js';
```

Replace:

```ts
        const o = perfectOrigin(ctx);
        if (dist(h.x, h.y, z.x, z.y) <= z.radius + h.radius)
          hurtHero(ctx, z.damage, z.element, null);
        else if (o && dist(o.x, o.y, z.x, z.y) <= z.radius + h.radius) notePerfect(ctx);
```

with:

```ts
        // The slam reaches only what it sees.
        const o = perfectOrigin(ctx);
        if (dist(h.x, h.y, z.x, z.y) <= z.radius + h.radius && sees(world.map, z, h))
          hurtHero(ctx, z.damage, z.element, null);
        else if (o && dist(o.x, o.y, z.x, z.y) <= z.radius + h.radius && sees(world.map, z, o))
          notePerfect(ctx);
```

Replace:

```ts
  shift(ctx.world.map, m, m.radius, dir.x * speed * dt, dir.y * speed * dt);
}
```

with:

```ts
  shift(ctx.world.map, m, m.radius, dir.x * speed * dt, dir.y * speed * dt);
  keepInRoom(ctx, m);
}

/** A boss never leaves its room (see the floor maps spec); the open room's has none. */
function keepInRoom(ctx: SimCtx, m: MonsterEntity): void {
  if (m.kind !== 'boss' || m.roomId === null) return;
  const rect = ctx.world.map.rooms.find((r) => r.id === m.roomId)?.rect;
  if (!rect) return;
  m.x = clamp(m.x, rect.x + m.radius, rect.x + rect.w - m.radius);
  m.y = clamp(m.y, rect.y + m.radius, rect.y + rect.h - m.radius);
}

/**
 * Go after the hero (see the floor maps spec): straight at it (`toTarget`) in
 * the open room or when `direct`, else down the foe's clearance class's flow
 * field; beyond the field it holds its place.
 */
function pursue(
  ctx: SimCtx,
  m: MonsterEntity,
  toTarget: Vec,
  direct: boolean,
  speed: number,
  dt: number,
): void {
  const { world } = ctx;
  if (world.map.open || direct) return moveMonster(ctx, m, toTarget, speed, dt);
  const field = clearanceOf(m) === 'large' ? world.flow.large : world.flow.small;
  const way = field && downhill(world.map, field, m, world.hero);
  if (way) moveMonster(ctx, m, way, speed, dt);
}
```

Replace:

```ts
          ...snapToWalkable(world.map, m.x + (i === 0 ? -1.8 : 1.8), m.y + 1.2, 1),
          packId: m.packId,
```

with:

```ts
          ...clipSight(
            world.map,
            m,
            snapToWalkable(world.map, m.x + (i === 0 ? -1.8 : 1.8), m.y + 1.2, 1),
          ),
          packId: m.packId,
          roomId: m.roomId,
```

Replace:

```ts
      const decay = Math.exp(-10 * dt);
```

with:

```ts
      keepInRoom(ctx, m);
      const decay = Math.exp(-10 * dt);
```

Replace:

```ts
    if (!m.aggro) {
      if (dist(m.x, m.y, h.x, h.y) < bal.monster.aggroRadius) {
```

with:

```ts
    // A foe wakes when it sees the hero near (or is hit), and its pack with it.
    if (!m.aggro) {
      if (dist(m.x, m.y, h.x, h.y) < bal.monster.aggroRadius && sees(world.map, m, h)) {
```

Replace:

```ts
    const chill = Math.min(bal.stacks.frostSlowCap, s.stacks.frost * bal.stacks.frostSlowPerStack);
```

with:

```ts
    // It attacks only what it sees; with sight in `ai.directRange` it steers straight at it.
    const seen = sees(world.map, m, h);
    const near = seen && dist(m.x, m.y, h.x, h.y) <= bal.ai.directRange;
    const chill = Math.min(bal.stacks.frostSlowCap, s.stacks.frost * bal.stacks.frostSlowPerStack);
```

Replace:

```ts
        if (gap > 7.5) moveMonster(ctx, m, toTarget, speed, dt);
```

with:

```ts
        if (gap > 7.5 || !seen) pursue(ctx, m, toTarget, near, speed, dt);
```

Replace:

```ts
            spawnProjectile(ctx, {
```

with:

```ts
            // It fires only with sight.
            if (!seen) break;
            spawnProjectile(ctx, {
```

Replace:

```ts
        if (gap > 7) moveMonster(ctx, m, toTarget, speed, dt);
        else if (gap < 3.5) moveMonster(ctx, m, toTarget, -speed * 0.7, dt);
        if (gap <= 8 && world.t >= m.nextAttackAt) {
```

with:

```ts
        if (gap > 7 || !seen) pursue(ctx, m, toTarget, seen, speed, dt);
        else if (gap < 3.5) moveMonster(ctx, m, toTarget, -speed * 0.7, dt);
        if (seen && gap <= 8 && world.t >= m.nextAttackAt) {
```

Replace:

```ts
            if (gap <= m.attackRange + 0.5) damageHero(ctx, m, m.damage, true);
```

with:

```ts
            if (gap <= m.attackRange + 0.5 && seen) damageHero(ctx, m, m.damage, true);
```

Replace:

```ts
        if (gap > m.attackRange) moveMonster(ctx, m, toTarget, speed, dt);
```

with:

```ts
        if (gap > m.attackRange || !seen) pursue(ctx, m, toTarget, near, speed, dt);
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-ai.test.ts)`
Expected: PASS, 8 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 46 tests in F + 8 files pass (1948 | 5 skipped in 119 | 1 skipped). The fingerprint is identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-b2
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/step.ts tests/delve-maps-ai.test.ts)
git add packages/engine/src/arpg/step.ts packages/engine/tests/delve-maps-ai.test.ts
git commit -m "feat(engine): foes wake on sight, path by the flow field and attack only what they see; a boss keeps to its room" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 10: The leash

Phase A's `leashTick` stub filled, with `homeWay`; `monstersTick` walks a leashed foe home (Where the spec left room, 14).

**Files:**
- Create: `packages/engine/tests/delve-maps-leash.test.ts`
- Modify: `packages/engine/src/arpg/flow.ts`, `packages/engine/src/arpg/step.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-maps-leash.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { flowField } from '../src/arpg/flow.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { arena, bal, dummy, run } from './fixtures/arena.js';
import { onMap } from './fixtures/maps.js';

// The leash (see the floor maps spec's "Leash"): a foe kept far from its room's
// centre turns home, heals and sleeps there; the open room has none.

/** Room 0 the 8 × 8 cells at (2, 2), centred on (6, 6), with its home field. */
function homeRoom(w: ArpgWorld): ArpgWorld {
  const room = w.map.rooms[0];
  room.rect = { x: 2, y: 2, w: 8, h: 8 };
  room.homeField = flowField(w.map, { x: 6, y: 6 }, 999, 1);
  return w;
}

/** A hurt, awake foe of room 0, 16 units from its centre and chasing the hero. */
const stray = () => dummy(6, 22, { roomId: 0, speed: 3, aggro: true, aggroAt: 0.5, hp: 300 });

describe('the leash', () => {
  it('a foe kept past its leash turns home, then heals and sleeps there', () => {
    const w = homeRoom(onMap(arena([stray()], { noBasic: true }), []));
    const m = w.monsters[0];
    run(w, bal.ai.leashSeconds - 0.2);
    expect(m.farSince).not.toBeNull();
    expect(m.goingHome).toBe(false);
    run(w, 0.4);
    expect(m.goingHome).toBe(true);
    run(w, 8);
    expect(m.goingHome).toBe(false);
    expect(m.aggro).toBe(false);
    expect(m.aggroAt).toBe(0);
    expect(m.farSince).toBeNull();
    expect(m.hp).toBe(m.maxHp);
    // A step from the bottom of its home field.
    const cell = Math.floor(m.y) * w.width + Math.floor(m.x);
    expect(w.map.rooms[0].homeField![cell]).toBeLessThanOrEqual(1);
  });

  it('coming back within it starts the count again', () => {
    const w = homeRoom(onMap(arena([stray()], { noBasic: true }), []));
    const m = w.monsters[0];
    run(w, 1);
    expect(m.farSince).not.toBeNull();
    m.y = 8;
    run(w, 1 / 30);
    expect(m.farSince).toBeNull();
  });

  it('the open room has none', () => {
    const w = homeRoom(arena([stray()], { noBasic: true }));
    run(w, bal.ai.leashSeconds + 1);
    expect(w.monsters[0]).toMatchObject({ goingHome: false, farSince: null, aggro: true });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-leash.test.ts)`
Expected: FAIL, 2 of 3 (`expected null not to be null`: nothing counts the leash); "the open room has none" passes.

- [ ] **Step 3: The leash**

In `packages/engine/src/arpg/flow.ts`:

Replace:

```ts
import type { FloorMap } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';
import { dirTo } from './geometry.js';
```

with:

```ts
import type { FloorMap, Room } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';
import { dirTo, dist } from './geometry.js';
```

Replace:

```ts
/** Send foes past their leash home, and heal and sleep them there (`farSince`, `goingHome`). */
export function leashTick(_ctx: SimCtx): void {}
```

with:

```ts
/** A foe's room and its centre, where it leashes to; null for one with no room. */
function homeOf(map: FloorMap, m: MonsterEntity): { room: Room; at: Vec } | null {
  const room = m.roomId === null ? undefined : map.rooms.find((r) => r.id === m.roomId);
  if (!room) return null;
  const { x, y, w, h } = room.rect;
  return { room, at: { x: x + w / 2, y: y + h / 2 } };
}

/** A leashed foe's way home: down its room's `homeField` (straight without one); null when lost. */
export function homeWay(map: FloorMap, m: MonsterEntity): Vec | null {
  const home = homeOf(map, m);
  if (!home) return null;
  const field = home.room.homeField;
  return field ? downhill(map, field, m, home.at) : dirTo(m.x, m.y, home.at.x, home.at.y);
}

/** Home: a step from the bottom of its room's `homeField` (a unit from the centre without one). */
function atHome(map: FloorMap, m: MonsterEntity, home: { room: Room; at: Vec }): boolean {
  const field = home.room.homeField;
  if (!field) return dist(m.x, m.y, home.at.x, home.at.y) <= 1;
  return field[cellAt(m.y, map.height) * map.width + cellAt(m.x, map.width)] <= 1;
}

/**
 * The leash (see the floor maps spec): an awake foe farther than `ai.leashRadius`
 * from its room's centre for more than `ai.leashSeconds` turns home
 * (`goingHome`, walked in `monstersTick`); home, it heals to full and sleeps
 * again (`aggro` and `aggroAt` reset, so a boss's enrage restarts). None in the
 * open room.
 */
export function leashTick(ctx: SimCtx): void {
  const { world, bal } = ctx;
  if (world.map.open) return;
  const { leashRadius, leashSeconds } = bal.ai;
  for (const m of world.monsters) {
    if (m.dead || m.dummy) continue;
    const home = homeOf(world.map, m);
    if (!home) continue;
    if (m.goingHome) {
      if (!atHome(world.map, m, home)) continue;
      Object.assign(m, { goingHome: false, farSince: null, aggro: false, aggroAt: 0 });
      m.hp = m.maxHp;
      continue;
    }
    if (!m.aggro || dist(m.x, m.y, home.at.x, home.at.y) <= leashRadius) m.farSince = null;
    else if (m.farSince === null) m.farSince = world.t;
    else if (world.t - m.farSince > leashSeconds) {
      m.goingHome = true;
      m.windupUntil = 0;
      m.chargeUntil = 0;
    }
  }
}
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
import { clearanceOf, downhill, flowTick, leashTick } from './flow.js';
```

with:

```ts
import { clearanceOf, downhill, flowTick, homeWay, leashTick } from './flow.js';
```

Replace:

```ts
    if (m.dummy) continue;

    // A foe wakes when it sees the hero near (or is hit), and its pack with it.
```

with:

```ts
    if (m.dummy) continue;
    // A leashed foe walks home and does nothing else (`leashTick`).
    if (m.goingHome) {
      const way = isStunned(ctx, m) ? null : homeWay(world.map, m);
      if (way) moveMonster(ctx, m, way, m.speed, dt);
      continue;
    }

    // A foe wakes when it sees the hero near (or is hit), and its pack with it.
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-leash.test.ts)`
Expected: PASS, 3 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 49 tests in F + 9 files pass (1951 | 5 skipped in 120 | 1 skipped). The fingerprint is identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-b2
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/flow.ts src/arpg/step.ts tests/delve-maps-leash.test.ts)
git add packages/engine/src/arpg/flow.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-maps-leash.test.ts
git commit -m "feat(engine): the leash: foes turn home, heal and sleep" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 5: Generated floors, and the end

### Task 11: A fight on generated floors

A guard over the whole area on B1's real maps: five generated floors (a registry with `generatedDives` on), the hero unhurt in each floor's most crowded room for 20 s, auto-attacking and casting its Bolt: every hero, foe, drop and shot stays on walkable ground and every boss in its room, and the fight happens. It passes as written (the tasks above already hold it); keep it as the stage's regression guard.

**Files:**
- Create: `packages/engine/tests/delve-maps-fight.test.ts`

- [ ] **Step 1: The guard**

Create `packages/engine/tests/delve-maps-fight.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isWalkable, snapToWalkable } from '../src/arpg/grid.js';
import { stepWorld } from '../src/arpg/step.js';
import { createFloorWorld } from '../src/arpg/world.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { DEFAULT_CHAINS, STEP, gear, registry } from './fixtures/arena.js';

// The physics and the foes on real generated floors (see the floor maps spec): a
// fight in each floor's most crowded room keeps every body on walkable ground and
// every boss in its room.

/** A registry whose dives are generated (`delve.layout.generatedDives` is off as shipped). */
const generating = createDefaultRegistry();
generating.getDelveBalance().layout.generatedDives = true;

function floor(depth: number, seed: number): ArpgWorld {
  return createFloorWorld(generating, {
    depth,
    door: null,
    stats: computeHeroStats({ weapon: gear('fire') }, registry),
    chains: DEFAULT_CHAINS,
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
  });
}

/** What stands somewhere it can't: off walkable ground, or a boss outside its room. */
function strays(w: ArpgWorld): string[] {
  const out: string[] = [];
  const off = (what: string, p: { x: number; y: number }) => {
    if (!isWalkable(w.map, p.x, p.y)) out.push(`${what} at ${p.x}, ${p.y}`);
  };
  off('hero', w.hero);
  for (const m of w.monsters) {
    off(`foe ${m.id}`, m);
    const rect = w.map.rooms.find((r) => r.id === m.roomId)?.rect;
    if (m.kind === 'boss' && rect)
      if (m.x < rect.x || m.y < rect.y || m.x > rect.x + rect.w || m.y > rect.y + rect.h)
        out.push(`boss ${m.id} out of its room at ${m.x}, ${m.y}`);
  }
  for (const d of w.drops) off(`drop ${d.id}`, d);
  for (const p of w.projectiles) off(`shot ${p.id}`, p);
  return out;
}

describe('a fight on a generated floor', () => {
  it.each([
    [1, 3],
    [3, 11],
    [5, 7],
    [8, 21],
    [10, 5],
  ])('depth %i, seed %i: every body stays on walkable ground', (depth, seed) => {
    const w = floor(depth, seed);
    // The hero, unhurt, stands in the middle of the room with the most foes.
    const count = (id: number) => w.monsters.filter((m) => m.roomId === id).length;
    const room = [...w.map.rooms].sort((a, b) => count(b.id) - count(a.id))[0];
    const { x, y, w: rw, h: rh } = room.rect;
    Object.assign(w.hero, snapToWalkable(w.map, x + rw / 2, y + rh / 2));
    w.hero.invulnUntil = 1e9;
    const found: string[] = [];
    for (let i = 0; i < 30 * 20 && found.length === 0; i++) {
      const cast = i % 45 === 0 ? { slot: 0, aim: null } : null;
      stepWorld(generating, w, { move: { x: 0, y: 0 }, cast }, STEP);
      found.push(...strays(w).map((s) => `t ${w.t.toFixed(2)}: ${s}`));
    }
    expect(found).toEqual([]);
    // The fight happened: foes fell or were hurt.
    expect(w.kills > 0 || w.monsters.some((m) => m.hp < m.maxHp)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-fight.test.ts)`
Expected: PASS, 5 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 54 tests in F + 10 files pass (1956 | 5 skipped in 121 | 1 skipped). The fingerprint is identical.

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/alloy-maps-b2
(cd packages/engine && npx prettier --write --end-of-line auto tests/delve-maps-fight.test.ts)
git add packages/engine/tests/delve-maps-fight.test.ts
git commit -m "test(engine): a fight on generated floors keeps every body on walkable ground" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

- [ ] **The engine, the bundle and the client**

```bash
cd /c/Projects/alloy-maps-b2
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

Expected: no type errors; **1956 passed | 5 skipped in 121 passed | 1 skipped** (N + 54 in F + 10); tsup's three "Build success" lines; the client typechecks against the new bundle and its suite passes unchanged (1256 tests in 154 files at `26c89fe0`; nothing in the client changes).

- [ ] **The fingerprint** (see Conventions): identical to the base's.
- [ ] **Nothing else touched:** `git diff --stat maps/main` lists only the files in "Files".
- [ ] **What B3, B4 and the integrator take from here:** "Cross-area needs".
