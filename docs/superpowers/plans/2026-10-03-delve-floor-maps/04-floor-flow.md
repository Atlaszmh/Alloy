# Delve floor maps · B3: the floor flow (engine) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the floor flow's stubs from Phase A: a room's last foe clears it (`roomCleared`) and pulls its foes' drops in; the exit (`exitFloor`); the interact press on what a room holds (a vault's chest bursting `drops.vault`, a sanctum's shrine prayed at for `ai.shrineChannel` and blessing the floor or the dive through `applyShrine`, an anvil alcove opening (the world keeps which: `openedAlcove`), the gate asking to leave and shut on a boss floor while the boss stands); sealed dens and boss rooms (`sealTick`); the fog of war, its exit hint and the minimap's data (`fogTick`, `hudMapOf`); the bank writing what the floor used and its dive blessings into the dive (so a replay finds them used, S1); the floor clear counting its rooms (`roomsCleared`) and the flag quests' `minRoomsCleared` (S3); the alcove's offers and its one op (`alcoveOffers`, `takeAlcove`). Every hook stays a no-op on the open room, so nothing in play moves until B1 turns the generator on.

**Architecture:** Everything lives in the files Phase A gave B3, called from the hooks Phase A placed. `arpg/interact.ts`: `onMonsterKilled` (the end of `killMonster`), `exitFloor`, `interactTick` (right after `heroTick`: the nearest unused interactable within `ai.interactRadius` prompts each step and a queued press acts on it; a prayer is `world.channel`, broken by a move, a dodge or a hit), `rollVault` (the vault's table rolled through `rollMaterialDrops` by its key, its shards `shardTierUp` up, an essence at `essenceChance`) and `applyShrine` (Find, a refill, a floor blessing on `floorBuffs`, a dive blessing on `diveBuffs` and `baseStats` and into `pending.diveBuffs`, the pool resized). `arpg/fog.ts`: `roomAt`, `fogTick` (on `world.t` marks: sight by `lineOfSight`, the walls beside what is seen, the room entered revealed whole, `fogVersion`, the exit hint once) and `hudMapOf` (pure). `arpg/seal.ts`: `doorsOf` (a room's doors: those in its wall, `Door.rooms[0]`, as B1 lays them) and `sealTick` (a den or the boss room seals while the hero stands in it with a foe of it awake; foes outside are brought in; a door waits for its doorway, the hero nudged in, then after `ai.sealGrace` whoever stands in it is put out on their side; a hero who walks out first ends it; the last foe's death unseals). `delve/dive.ts`: `bankWorld` writes `pending.used` / `diveBuffs` with the potions; `completeFloor`'s `clearFloor` event carries `roomsCleared` on a generated floor. The quests take `minRoomsCleared` (a `clearFloor` filter, which an event without `roomsCleared`, the open room's, always meets), set on Untouchable and the Dry Run template. `delve/stops.ts`: `alcoveOffers` (`stopKinds` with the haul pooled, picked on `alcove:<depth>:<roomId>` by the stop's own picker, `pickKinds`) and `takeAlcove` (on the alcove last opened: bank, run the stop's op with the lock lifted, pay from `banked`, then the haul, then the stockpile, mark used, `refreshWorldHero`; a refusal touches nothing).

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-03-delve-floor-maps-design.md` (authoritative): "Decided in the spec" S1–S3, "Interacting, special rooms and the exit", "Sealed rooms" and "Loot" (under "Movement and combat on the grid"), "Fog of war and the minimap", "Testing" (Interactions, Fog), "Phases and parallel areas" (the B3 row, "Shared files"). The contract is Phase A's plan, `01-contract.md` in this folder ("For the areas", "Where the spec left room"); the overview is `00-overview.md`.

---

## Base

- **Starts from:** `maps/main` at `26c89fe0` (Phase A and B1 merged; B1's generated dives wait behind `delve.layout.generatedDives`, off), in this area's worktree `C:/Projects/alloy-maps-b3` on branch `maps/b3`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-maps-b3 -Branch maps/b3 -Base maps/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-maps-b3` in Git Bash.
- **Needs nothing else merged.** B2 runs beside it; B3 edits none of B1's or B2's files (`world.ts`, `step.ts`, `combat.ts`, `flow.ts`, `layout/*`, the drop sites). Of the files B1 touched, only `data/schemas.ts` is B3's too (two lines in the quests' filters, far from B1's), and every anchor below was taken at `26c89fe0`. Its tests stand on small hand-built `FloorMap`s (`tests/fixtures/flow-map.ts`), so no generator is needed.
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-maps-b3
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the engine suite reads **1902 passed | 5 skipped tests in 111 passed | 1 skipped files** (the pacing rails included), the client suite **1256 tests in 154 files**. Call them **N** engine tests in **F** files; each task below says where they go. The client never changes in this plan.

## Files

| File | Change |
|---|---|
| `packages/engine/src/arpg/interact.ts` | `onMonsterKilled` and `exitFloor` (Task 1); `interactTick`, `openedAlcove`, `rollVault`, `applyShrine` (Task 2) |
| `packages/engine/src/arpg/fog.ts` | `roomAt`, `fogTick`, `hudMapOf` (Task 3) |
| `packages/engine/src/arpg/seal.ts` | `doorsOf`, `sealTick` (Task 4) |
| `packages/engine/src/delve/dive.ts` | `bankWorld` writes `used` / `diveBuffs` (Task 5); `completeFloor`'s `clearFloor` event carries `roomsCleared` on a generated floor (Task 6). Hand-edited, never formatted |
| `packages/engine/src/types/quests.ts` | `ObjectiveFilter.minRoomsCleared`, `clearFloor`'s rule takes it, `ContractFilterRules.minRoomsCleared`, the `clearFloor` event's `roomsCleared?` (Task 6) |
| `packages/engine/src/data/schemas.ts` | `minRoomsCleared` in the objective and contract template filters (Task 6) |
| `packages/engine/src/delve/quests.ts` | `matches` checks `minRoomsCleared` (Task 6) |
| `packages/engine/src/delve/contracts.ts` | the template's `minRoomsCleared` copied, `{rooms}` in its text (Task 6) |
| `packages/engine/src/data/quests.json` | Untouchable and Dry Run need 2 rooms cleared (Task 6) |
| `packages/engine/src/delve/stops.ts` | `pickKinds` out of `rollStop`; `alcoveOffers`, `takeAlcove` (Task 7) |
| `packages/engine/tests/fixtures/flow-map.ts` (new) | `twoRooms(kind, interactable?, depth)`, `onMap`, `floorWorld` |
| `packages/engine/tests/delve-maps-interact.test.ts` (new) | a room's last foe, the exit, prompts, the vault, the alcove and the gate, the shrine |
| `packages/engine/tests/delve-maps-fog.test.ts` (new) | sight, walls, room reveal, marks, `fogVersion`, the exit hint, `hudMapOf` |
| `packages/engine/tests/delve-maps-seal.test.ts` (new) | sealing, sleepers and combat rooms, foes brought in, the doorway, the grace, leaving, unsealing |
| `packages/engine/tests/delve-maps-flow.test.ts` (new) | the bank, the replays (vault, refill shrine, dive blessing), rooms cleared and `minRoomsCleared`, the alcove |
| `packages/engine/tests/delve-quest-contracts.test.ts`, `delve-quests-content.test.ts` | Dry Run's filter and text (Task 6) |

`src/index.ts` needs nothing: Phase A exports `interact.ts`, `seal.ts` and `fog.ts` whole (so `openedAlcove`, `rollVault`, `roomAt` and `doorsOf` are exported too) and `alcoveOffers` / `takeAlcove` by name.

## Cross-area needs

None of B3's tasks needs another area's edit to pass. What B3's code reads from the others, for their plans and the integrator:

**X1 · B1 (the generator, `world.ts`).**
1. **Doors (as B1's plan lays them):** every hall has two doors, and `Door.rooms[0]` is the room whose wall holds the door; sealing a room closes only its own (`doorsOf`: `rooms[0] === room.id`). The fixture map follows it.
2. **Interactables:** `${depth}:${roomId}` ids (as the spec), at their room's centre; a vault's `chest`, a sanctum's `shrine` with its drawn `shrine` id, an alcove's `alcove`, the exit room's `gate` at `map.exit`; those in `opts.used` start `used` (Phase A's contract). The exit room is the room whose `rect` holds `map.exit` (`roomAt`), the boss room on a boss floor (the boss stands on the gate's point; the gate is out of reach while it lives).
3. **Seals and clears:** a den's and the boss room's foes, the boss's adds included (B2 passes `roomId` in `bossSpecial`), carry the room's `roomId`; a room counts as cleared (`roomsCleared`) only when foes with its `roomId` spawned and all died, so unguarded vaults, sanctums, alcoves, the start and the exit hold none (a guarded vault's guards carry its `roomId`, as B1 does). Generated dives wait behind B1's `delve.layout.generatedDives`; B3's tests never need them.
4. **Fog:** a generated world starts with `fog` all 0 (Phase A's contract); B3's first fog step reveals the start room, so B1 needn't mark it `revealed`.

**X2 · B2 (`combat.ts`, the drop sites).** The room vacuum (`onMonsterKilled`) pulls the drops whose `Drop.roomId` is the room's, so every death drop needs `roomId: m.roomId ?? undefined` at spawn (`spawnDrop`, `dropMaterials`' `spawn`, `dropRune`, Siphon, Seedling), and the spawn sites' `vacuum: world.cleared` stays as is (only the open room sets `cleared`). Sealing reads `m.aggro` as "awake". **Unowned in the spec's table:** "`drops.den.gearBonus` is added to their elite gear chance" (an elite whose room is a `den`: `world.map.rooms.find((r) => r.id === m.roomId)?.kind === 'den'`) lands in `dropLoot` / `rollEncounterDrops`, B2's file; B3 doesn't touch it.

**X3 · B4 (the bot, the rails).** On `alcoveOpen` call `alcoveOffers(registry, profile, world, id)` then `takeAlcove(registry, profile, world, action)` with the same profile (it acts on the alcove the press opened; its kind must be among the offers; it banks the world itself; a refusal returns the profile as given and leaves the world untouched); on `exitRequest` call `exitFloor(world)`; end `playFloor` on `world.exited`. A prayer is `world.channel` (stand still for `ai.shrineChannel`). On generated floors Untouchable and the Dry Run contract need 2 rooms cleared.

**X4 · C2 (the HUD and the dialogs), as C2's plan asked.** `interactPrompt` fires every step while an unused interactable is in reach; its `text` is the name ("Chest", "Anvil", "Exit gate"; a shrine's "Shrine of Vigor: +20% damage for this floor"), the verb the client's. Two cases prompt nothing: a gate shut while the boss stands (it isn't in reach at all), and anything during a prayer. The prayer's bar reads `world.channel` (`start`, `until`; null again when it ends or breaks). `exitRequest.roomsUnexplored` counts unrevealed rooms; `exitFloor` only sets `world.exited`, and `completeFloor` completes on it. `takeAlcove(registry, profile, world, action)` acts on the alcove last opened on the world (`openedAlcove(world)`), runs `takeStop`'s ops under its rules, pays from `banked` first as a stop does (then the haul: a dry run through `takeStop` on a profile faked as at a stop sees only `banked` and the stockpile, so it may refuse what the haul could pay, never the reverse), and leaves the profile and the world untouched when it refuses (its own bank returns no toasts: bank first if they matter). `hudMapOf(world)` as the spec (meant for `!map.open`), `roomAt(map, x, y)` if useful.

**X5 · D (docs).** CLAUDE.md's Delve section gains the floor flow: `interact.ts` (`interactTick`, `rollVault`, `applyShrine`, `exitFloor`, `onMonsterKilled`), `seal.ts`, `fog.ts`, `alcoveOffers` / `takeAlcove`, `DiveState.used` / `diveBuffs` written by `bankWorld`, `clearFloor.roomsCleared` and `minRoomsCleared`.

## Where the spec left room

1. **Who records a shrine's use.** `applyShrine(registry, world, shrine)` (Phase A's signature) gets the shrine's definition, not its interactable, so `interactTick` records the use (`it.used`, `pending.used`) as the prayer completes and `applyShrine` only blesses. A chest's use is recorded on the press; an alcove's by `takeAlcove`; the gate is never used.
2. **The prompt's text** is the interactable's name (a shrine's with its blessing), the verb the client's (X4, as C2 asked). A shut gate isn't in reach at all (no prompt, a press does nothing); nothing prompts during a prayer, and a press then is dropped. A press with nothing in reach is dropped (`queuedInteract` clears every step).
3. **The prayer breaks** when the hero is more than `PRAYER_SLIP` (0.05 units: a wall's or a separation push-out isn't a step) from where it began, dashes, or takes a hit (`lastHitAt` at or after its start: a dodged or fully shielded hit doesn't count). A refill alone (Mercy) leaves no blessing on `floorBuffs` (nothing for the buff row to show); Find goes on `world.loot.find` for either duration (Phase A's `createFloorWorld` adds a dive blessing's Find on later floors).
4. **The vault's roll** reuses `rollMaterialDrops` with the key `'vault'` (its table is read as `drops[kind]`), so flux and shards follow the floor's depth, the door and Find exactly as a foe's; then each shard goes `shardTierUp` tiers up (capped at its affix's last) and an essence rolls at `essenceChance` × the door's `essence` × Lucky Charm's boost. Its pickups burst on `world.materialRng` around the chest, snapped walkable, with no `roomId` (a guard pack's death doesn't pull them; the magnet does).
5. **A room is revealed when the hero enters it** (the spec's fog section): its outline, icon and "explored" count come then, and its floor and walls are seen whole. Seeing into a room shows its cells in the fog layer (decision 5's "rooms appear as you see into them") without counting it explored. Walls show when a floor cell beside them is in sight. `fogVersion` moves when a fog byte changed or a room was revealed. The exit hint counts from the floor's start (`world.t`) and fires once.
6. **Sealing's edges.** The hero is nudged one radius toward the room's centre each step it stands in a closing doorway; "a free cell on its side" is the nearest walkable cell on that side of the room's edge where the circle overlaps none of the room's doors. A hero who leaves the room before every door shuts (out of the doorway, or still in it when the grace ends) ends the sealing and the doors open, so the boss room can never shut with the hero outside (its gate is the exit). A den shuts with no doors at once.
7. **The alcove's op.** `StopAction` names no alcove, so the press records the one it opened on the world (a module `WeakMap` in `interact.ts`, read by `openedAlcove(world)`: no new world field, so `world.ts` and the types stay untouched) and `takeAlcove` acts on it. Payment follows a stop's: `banked` first, then the floor's haul, then the stockpile (two `unpool` passes). Its kind is checked against `alcoveOffers` for the profile passed in, before the bank (the offers the dialog showed). A refusal returns the profile as given and puts `world.pending` back (the bank inside it emptied it), so nothing moved. A changed Find (an equipped ring) moves `world.loot.find` by the difference.
8. **`roomsCleared`** is on the `clearFloor` event only on a generated floor (`world.map.open` false): the open room clears whole, so `minRoomsCleared` never holds it back (and the flag quests keep working on the open room until B1). The threshold is 2 in the data; Dry Run's text fills `{rooms}`.
9. **`completeFloor` gets no guard** on `exited` / `cleared`: its callers end the floor (the client's `checkEnd`, the autopilot's `playFloor`), and the suites complete floors that aren't cleared.

## Conventions

The overview's shared conventions and Phase A's. In short:
- **One commit per task** on `maps/b3`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-maps-b3`.
- **Line endings:** the worktree's files are CRLF (`core.autocrlf`); keep each file's own (the Edit tool does); new files are LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** every file a commit block formats passed `prettier --check` at the base or is new. `packages/engine/src/delve/dive.ts` is only hand-edited, never formatted. The code below is already Prettier-formatted (checked on the scratch copy), so `--write` changes nothing if typed as written.
- **How the edits read** (Phase A's language): "In `f`:" names the file for the edits under it. "Replace:" (a block) "with:" (a block) is one Edit (old, new). "Append at the end of the file:" adds a blank line and the block after the last line. "Create `f`:" is a Write. "Overwrite `f` (the whole stub file):" is a Write over a Phase A stub file this area owns. Within a file, apply its edits top to bottom; every old block is unique in its file at that point.
- **Parity:** every hook returns at once on the open room (`world.map.open`), and nothing turns the generated map on, so the pacing rails and every pinned number hold. Every task runs the whole engine suite (about 80 s; the pacing rails run while the files load) and the engine typecheck.
- **Import cycles:** `arpg/combat.ts` imports `interact.ts`, which imports `material-drops.ts` and `hero-stats.ts`; `delve/stops.ts` now imports `dive.ts`, `pair.ts`, `arpg/world.ts` and `arpg/interact.ts`, which reach it back. Every such import is read only inside a function.
- **Test geometry** (`tests/fixtures/flow-map.ts`): a 26 × 12 map; room 0, the start, holds cells x 1–8, y 1–10; room 1 (the test's kind) x 13–24, y 1–10; a hall 3 wide at y 5–7, all doors: door 0 (x 9–10, `rooms` [0, 1]) in room 0's wall, door 1 (x 11–12, [1, 0]) in room 1's. The hero starts at (4.5, 6); room 1's interactable (id `<depth>:1`, depth 2 by default) and the exit sit at (19, 6). `floorWorld(map, monsters)` is the fixture arena on it (the basic attack stopped); `onMap(world, map)` puts any world on it. The fixture's foes are `dummy(x, y)` (sturdy, harmless, unmoving).
- **Checked on a scratch copy:** `git archive` of `maps/main` at `26c89fe0` with junctioned `node_modules`; the edit blocks below were generated from the scratch copy's files after each task and checked to rebuild them exactly from the base, in order (each old block unique where it applies); every FAIL, PASS, suite count, typecheck and `prettier --check` below ran on those trees.

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

## Chunk 1: A room's last foe, the exit and the interact press

### Task 1: A room's last foe, and the exit

**Files:**
- Create: `packages/engine/tests/fixtures/flow-map.ts`, `packages/engine/tests/delve-maps-interact.test.ts`
- Modify: `packages/engine/src/arpg/interact.ts`

- [ ] **Step 1: The fixture map and the failing tests**

Create `packages/engine/tests/fixtures/flow-map.ts`:

```ts
import type { ArpgWorld, MonsterEntity } from '../../src/types/arpg.js';
import type { FloorMap, Interactable, RoomKind } from '../../src/types/floor-map.js';
import { arena } from './arena.js';

/**
 * A small floor for the floor flow's tests (no generator needed), 26 × 12:
 * room 0, the start (cells x 1–8, y 1–10), and room 1 of `kind` (cells x 13–24,
 * y 1–10), joined by a hall 3 cells wide at y 5–7 that is all doors: door 0
 * (x 9–10, `rooms` [0, 1]) in room 0's wall, door 1 (x 11–12, [1, 0]) in room
 * 1's. The hero starts at (4.5, 6); room 1's centre, (19, 6), holds `it` (its id
 * `<depth>:1`) and the exit.
 */
export function twoRooms(
  kind: RoomKind,
  it?: Partial<Interactable> & Pick<Interactable, 'kind'>,
  depth = 2,
): FloorMap {
  const width = 26;
  const height = 12;
  const cells = new Uint8Array(width * height).fill(1);
  const fill = (x0: number, x1: number, y0: number, y1: number, v: 0 | 2) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells[y * width + x] = v;
  };
  fill(1, 8, 1, 10, 0);
  fill(13, 24, 1, 10, 0);
  fill(9, 12, 5, 7, 2);
  const door = (id: number, x0: number, rooms: [number, number]) => ({
    id,
    cells: [x0, x0 + 1].flatMap((x) => [5, 6, 7].map((y) => ({ x, y }))),
    rooms,
    closed: false,
  });
  return {
    width,
    height,
    cells,
    rooms: [
      {
        id: 0,
        kind: 'start',
        rect: { x: 1, y: 1, w: 8, h: 10 },
        revealed: false,
        cleared: false,
        sealed: false,
      },
      {
        id: 1,
        kind,
        rect: { x: 13, y: 1, w: 12, h: 10 },
        revealed: false,
        cleared: false,
        sealed: false,
        ...(it && { interactable: { id: `${depth}:1`, x: 19, y: 6, used: false, ...it } }),
      },
    ],
    doors: [door(0, 9, [0, 1]), door(1, 11, [1, 0])],
    start: { x: 4.5, y: 6 },
    exit: { x: 19, y: 6 },
    open: false,
  };
}

/** `w` on `map`: its size, an unseen fog, the hero at the map's start. */
export function onMap(w: ArpgWorld, map: FloorMap): ArpgWorld {
  w.map = map;
  w.width = map.width;
  w.height = map.height;
  w.fog = new Uint8Array(map.width * map.height);
  w.hero.x = map.start.x;
  w.hero.y = map.start.y;
  return w;
}

/** The fixture's arena on `map` (the hero's basic attack stopped), holding exactly `monsters`. */
export function floorWorld(map: FloorMap, monsters: Partial<MonsterEntity>[] = []): ArpgWorld {
  return onMap(arena(monsters, { noBasic: true }), map);
}
```

Create `packages/engine/tests/delve-maps-interact.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { exitFloor } from '../src/arpg/interact.js';
import type { ArpgEvent, ArpgWorld, Drop } from '../src/types/arpg.js';
import { bal, dummy, registry } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';

// The floor flow (see the floor maps spec's "Interacting, special rooms and the exit").

const of = <K extends ArpgEvent['kind']>(events: ArpgEvent[], kind: K) =>
  events.filter((e): e is Extract<ArpgEvent, { kind: K }> => e.kind === kind);

describe("a room's last foe", () => {
  const loot = (w: ArpgWorld, roomId?: number): Drop => {
    const d: Drop = {
      id: w.nextId++,
      kind: 'scrap',
      x: 20,
      y: 8,
      amount: 1,
      born: 0,
      vacuum: false,
      dead: false,
      roomId,
    };
    w.drops.push(d);
    return d;
  };

  it("clears its room (roomCleared) and pulls in its foes' drops, no other", () => {
    const w = floorWorld(twoRooms('combat'), [
      dummy(16, 3, { roomId: 1 }),
      dummy(22, 3, { roomId: 1 }),
    ]);
    const [mine, hall] = [loot(w, 1), loot(w)];
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    killMonster(ctx, w.monsters[0]);
    expect([w.map.rooms[1].cleared, of(events, 'roomCleared')]).toEqual([false, []]);
    killMonster(ctx, w.monsters[1]);
    expect(of(events, 'roomCleared')).toEqual([{ kind: 'roomCleared', roomId: 1 }]);
    expect(w.map.rooms[1].cleared).toBe(true);
    expect([mine.vacuum, hall.vacuum]).toEqual([true, false]);
  });

  it('pulls nothing in when ai.roomVacuum is off, and a roomless foe clears nothing', () => {
    const w = floorWorld(twoRooms('combat'), [dummy(16, 3, { roomId: 1 }), dummy(5, 3)]);
    const mine = loot(w, 1);
    const events: ArpgEvent[] = [];
    const ctx = {
      ...makeCtx(registry, w, events),
      bal: { ...bal, ai: { ...bal.ai, roomVacuum: false } },
    };
    killMonster(ctx, w.monsters[1]);
    killMonster(ctx, w.monsters[0]);
    expect(of(events, 'roomCleared')).toHaveLength(1);
    expect(mine.vacuum).toBe(false);
  });
});

describe('the exit', () => {
  it('exitFloor takes it: world.exited (the open room ends on cleared instead)', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }));
    expect(w.exited).toBe(false);
    exitFloor(w);
    expect(w.exited).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-interact.test.ts)`
Expected: FAIL, **3 failed (3)**: the hook is a no-op (`roomCleared` never fires, nothing is pulled in) and `exitFloor` throws "exitFloor: not implemented".

- [ ] **Step 3: The room hook and the exit**

In `packages/engine/src/arpg/interact.ts`:

Replace:

```ts
/** Take the exit: `world.exited` (the client after its confirm, the bot at once). */
export function exitFloor(_world: ArpgWorld): void {
  throw new Error('exitFloor: not implemented');
}

/** `killMonster`'s room hook: a room's last foe pulls its foes' drops in (`ai.roomVacuum`) and fires `roomCleared`. */
export function onMonsterKilled(_ctx: SimCtx, _m: MonsterEntity): void {}
```

with:

```ts
/** Take the exit: `world.exited` (the client after its confirm, the bot at once). */
export function exitFloor(world: ArpgWorld): void {
  world.exited = true;
}

/**
 * `killMonster`'s room hook: when a room's last foe dies, the room is cleared
 * (`roomCleared`) and its foes' drops are pulled to the hero (`ai.roomVacuum`).
 */
export function onMonsterKilled(ctx: SimCtx, m: MonsterEntity): void {
  const { world, bal, events } = ctx;
  if (m.roomId === null || world.monsters.some((o) => !o.dead && o.roomId === m.roomId)) return;
  const room = world.map.rooms.find((r) => r.id === m.roomId);
  if (!room || room.cleared) return;
  room.cleared = true;
  if (bal.ai.roomVacuum) for (const d of world.drops) if (d.roomId === m.roomId) d.vacuum = true;
  events.push({ kind: 'roomCleared', roomId: room.id });
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-interact.test.ts)`
Expected: PASS, 3 tests.

- [ ] **Step 5: The typecheck and the whole suite**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 3** tests pass (5 skipped) in **F + 1** files (1905 | 5 skipped in 112 | 1 skipped at the base's counts).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-maps-b3
npx prettier --end-of-line auto --write packages/engine/src/arpg/interact.ts packages/engine/tests/fixtures/flow-map.ts packages/engine/tests/delve-maps-interact.test.ts
git add packages/engine/src/arpg/interact.ts packages/engine/tests/fixtures/flow-map.ts packages/engine/tests/delve-maps-interact.test.ts
git commit -m "feat(engine): a room's last foe clears it and pulls its drops in; exitFloor" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: The interact press: the vault, the shrine, the alcove and the gate

**Files:**
- Modify: `packages/engine/src/arpg/interact.ts` (overwritten whole), `packages/engine/tests/delve-maps-interact.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-maps-interact.test.ts`:

Replace:

```ts
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { exitFloor } from '../src/arpg/interact.js';
import type { ArpgEvent, ArpgWorld, Drop } from '../src/types/arpg.js';
import { bal, dummy, registry } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';
```

with:

```ts
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { applyShrine, exitFloor, openedAlcove, rollVault } from '../src/arpg/interact.js';
import { isWalkable } from '../src/arpg/grid.js';
import { stepWorld } from '../src/arpg/step.js';
import { manaPool } from '../src/delve/hero-stats.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgEvent, ArpgWorld, Drop } from '../src/types/arpg.js';
import type { RoomKind } from '../src/types/floor-map.js';
import { arena, bal, dummy, registry, run, STEP } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';
```

Replace:

```ts
const of = <K extends ArpgEvent['kind']>(events: ArpgEvent[], kind: K) =>
  events.filter((e): e is Extract<ArpgEvent, { kind: K }> => e.kind === kind);
```

with:

```ts
const still = { x: 0, y: 0 };
const press = (w: ArpgWorld): ArpgEvent[] =>
  stepWorld(registry, w, { move: still, interact: true }, STEP);
const of = <K extends ArpgEvent['kind']>(events: ArpgEvent[], kind: K) =>
  events.filter((e): e is Extract<ArpgEvent, { kind: K }> => e.kind === kind);

/** A world on the two rooms with room 1's interactable (`kind`), the hero beside it. */
function beside(kind: 'chest' | 'alcove' | 'gate', roomKind: RoomKind = 'vault') {
  const w = floorWorld(twoRooms(roomKind, { kind }));
  Object.assign(w.hero, { x: 19, y: 7 });
  return w;
}
```

Append at the end of the file:

```ts
describe('the interactable in reach', () => {
  it('prompts each step while one is within interactRadius, never beyond it', () => {
    const w = beside('chest');
    expect(of(run(w, STEP), 'interactPrompt')).toEqual([
      { kind: 'interactPrompt', id: '2:1', interactable: 'chest', text: 'Chest' },
    ]);
    w.hero.y = 6 + bal.ai.interactRadius + 0.2;
    expect(of(run(w, STEP), 'interactPrompt')).toEqual([]);
  });

  it('drops a press with nothing in reach, and does nothing on the open room', () => {
    const w = floorWorld(twoRooms('vault', { kind: 'chest' }));
    press(w);
    expect(w.queuedInteract).toBe(false);
    Object.assign(w.hero, { x: 19, y: 7 });
    expect(of(run(w, STEP), 'drop')).toEqual([]);
    const open = arena([dummy(13, 20)]);
    expect(of(press(open), 'interactPrompt')).toEqual([]);
    expect(open.queuedInteract).toBe(false);
  });
});

describe('the vault', () => {
  it("opens once: its haul bursts onto walkable cells, materials only, and it's recorded used", () => {
    const w = beside('chest');
    const drops = of(press(w), 'drop');
    expect(drops.length).toBeGreaterThan(0);
    expect(w.drops.every((d) => d.kind === 'material' && !d.item)).toBe(true);
    expect(w.drops.every((d) => isWalkable(w.map, d.x, d.y))).toBe(true);
    expect(w.map.rooms[1].interactable!.used).toBe(true);
    expect(w.pending.used).toEqual(['2:1']);
    expect(of(press(w), 'interactPrompt')).toEqual([]);
    expect(w.drops).toHaveLength(drops.length);
  });

  it('rolls drops.vault: its flux and shards, the shards a tier up, an essence sometimes, the same from the same seed', () => {
    const w = beside('chest');
    const roll = (seed: number) => rollVault(registry, w, new SeededRNG(seed));
    expect(roll(5)).toEqual(roll(5));
    const vault = bal.drops.vault;
    let essences = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const haul = roll(seed);
      const count = (kind: string) =>
        haul.filter((h) => h.material.kind === kind).reduce((n, h) => n + h.amount, 0);
      expect(count('flux')).toBeGreaterThanOrEqual(vault.flux.count[0]);
      expect(count('flux')).toBeLessThanOrEqual(vault.flux.count[1]);
      expect(count('shard')).toBeGreaterThanOrEqual(vault.shards.count[0]);
      expect(count('shard')).toBeLessThanOrEqual(vault.shards.count[1]);
      // Depth 2 drops tier I shards (II at Find's chance): the vault's are a tier up.
      for (const { material } of haul)
        if (material.kind === 'shard') expect(material.tier).toBeGreaterThanOrEqual(2);
      expect(haul.every((h) => ['flux', 'shard', 'essence'].includes(h.material.kind))).toBe(true);
      essences += count('essence');
    }
    expect(essences).toBeGreaterThan(0);
    expect(essences).toBeLessThan(200 * vault.essenceChance * 2);
  });
});

describe('the alcove and the gate', () => {
  it('an alcove opens (alcoveOpen; the world keeps which) and stays unused until an op is taken', () => {
    const w = beside('alcove', 'alcove');
    expect(of(run(w, STEP), 'interactPrompt')[0].text).toBe('Anvil');
    expect(openedAlcove(w)).toBeNull();
    expect(of(press(w), 'alcoveOpen')).toEqual([{ kind: 'alcoveOpen', id: '2:1' }]);
    expect(openedAlcove(w)).toBe('2:1');
    expect(w.map.rooms[1].interactable!.used).toBe(false);
  });

  it('the gate asks to leave (the client confirms), counting the rooms unexplored', () => {
    const w = beside('gate', 'exit');
    w.map.rooms[1].revealed = true;
    expect(of(run(w, STEP), 'interactPrompt')[0].text).toBe('Exit gate');
    expect(of(press(w), 'exitRequest')).toEqual([{ kind: 'exitRequest', roomsUnexplored: 1 }]);
    expect(w.exited).toBe(false);
  });

  it("is shut on a boss floor until the boss is dead; foes left alive don't hold it", () => {
    const w = floorWorld(twoRooms('boss', { kind: 'gate' }), [
      dummy(22, 3, { kind: 'boss', roomId: 1 }),
      dummy(3, 3, { roomId: 0 }),
    ]);
    Object.assign(w.hero, { x: 19, y: 7 });
    expect(of(press(w), 'exitRequest')).toEqual([]);
    killMonster(makeCtx(registry, w, []), w.monsters[0]);
    expect(of(press(w), 'exitRequest')).toHaveLength(1);
  });
});

describe('the shrine', () => {
  const shrine = (id: string) => registry.getDelveData().shrines.find((s) => s.id === id)!;
  /** The hero beside a sanctum's shrine of `id`. */
  function praying(id: string) {
    const w = floorWorld(twoRooms('sanctum', { kind: 'shrine', shrine: id }));
    Object.assign(w.hero, { x: 19, y: 7 });
    return w;
  }

  it('prompts with its blessing; a press prays for ai.shrineChannel, then blesses the floor and is spent', () => {
    const w = praying('vigor');
    const prompt = of(run(w, STEP), 'interactPrompt')[0];
    expect(prompt.text).toBe('Shrine of Vigor: +20% damage for this floor');
    const damage = w.hero.stats.damageMult;
    press(w);
    expect(w.channel).toMatchObject({ id: '2:1', until: w.t + bal.ai.shrineChannel });
    run(w, bal.ai.shrineChannel - 2 * STEP);
    expect(w.hero.floorBuffs).toEqual([]);
    run(w, 3 * STEP);
    expect(w.channel).toBeNull();
    expect(w.hero.floorBuffs).toEqual([{ shrine: 'vigor', effect: shrine('vigor').effect }]);
    expect(w.hero.stats.damageMult).toBeCloseTo(damage * 1.2, 9);
    expect(w.map.rooms[1].interactable!.used).toBe(true);
    expect(w.pending.used).toEqual(['2:1']);
    expect(of(press(w), 'interactPrompt')).toEqual([]);
  });

  it('a move, a dodge or a hit breaks the prayer: nothing is spent', () => {
    const moved = praying('vigor');
    press(moved);
    run(moved, 0.1, { x: 1, y: 0 });
    const dodged = praying('vigor');
    press(dodged);
    stepWorld(registry, dodged, { move: still, dodge: true }, STEP);
    run(dodged, STEP);
    const hit = praying('vigor');
    press(hit);
    hit.hero.lastHitAt = hit.t;
    run(hit, STEP);
    for (const w of [moved, dodged, hit]) {
      expect(w.channel).toBeNull();
      run(w, 1);
      expect([w.hero.floorBuffs, w.map.rooms[1].interactable!.used]).toEqual([[], false]);
    }
  });

  it('a dive blessing goes under the floor’s and into pending.diveBuffs; mana regen resizes the pool', () => {
    const w = praying('devotion');
    applyShrine(registry, w, shrine('devotion'));
    applyShrine(registry, w, shrine('clarity'));
    const devotion = { shrine: 'devotion', effect: shrine('devotion').effect };
    expect(w.hero.diveBuffs).toEqual([devotion]);
    expect(w.pending.diveBuffs).toEqual([devotion]);
    expect(w.hero.floorBuffs.map((b) => b.shrine)).toEqual(['clarity']);
    expect(w.hero.baseStats.damageMult).toBeCloseTo(w.hero.stats.damageMult, 9);
    expect(w.hero.manaRegen).toBeCloseTo(manaPool(w.hero.stats, registry).regen, 9);
    expect(w.hero.stats.manaRegenMult).toBeCloseTo(w.hero.baseStats.manaRegenMult * 1.5, 9);
  });

  it('Find goes on the loot; a refill fills the flasks and leaves no blessing', () => {
    const w = praying('fortune');
    const find = w.loot.find;
    applyShrine(registry, w, shrine('fortune'));
    expect(w.loot.find).toBe(find + 50);
    w.hero.potions = 0;
    applyShrine(registry, w, shrine('mercy'));
    expect(w.hero.potions).toBe(bal.dive.maxPotions);
    expect(w.hero.floorBuffs.map((b) => b.shrine)).toEqual(['fortune']);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-interact.test.ts)`
Expected: FAIL, **10 failed | 4 passed (14)**: no prompt, no press acts (`interactTick` is a no-op), `rollVault` and `openedAlcove` don't exist yet and `applyShrine` throws "applyShrine: not implemented". Task 1's three pass, and so does the open room's.

- [ ] **Step 3: `interactTick`, `rollVault` and `applyShrine`**

Overwrite `packages/engine/src/arpg/interact.ts` (the whole stub file):

```ts
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { ArpgWorld, MonsterEntity, MonsterKind } from '../types/arpg.js';
import type { MaterialRef } from '../types/crafting.js';
import type { Interactable, ShrineDef } from '../types/floor-map.js';
import { applyBuffs, manaPool } from '../delve/hero-stats.js';
import { shardTiersOf } from '../loot/materials.js';
import type { SimCtx } from './combat.js';
import { dist } from './geometry.js';
import { snapToWalkable } from './grid.js';
import { rollMaterialDrops } from './material-drops.js';

/**
 * Using what the rooms hold, and the floor's flow (see the floor maps spec's
 * "Interacting, special rooms and the exit"). Each hook is a no-op on the open room.
 */

/** How far the hero may drift (a separation push, a wall's push-out) before a prayer counts as moved. */
const PRAYER_SLIP = 0.05;

/** Each kind's name in its prompt (a shrine's is its own, with its blessing); the verb is the client's. */
const NAMES = { chest: 'Chest', alcove: 'Anvil', gate: 'Exit gate' };

/** The alcove each world's hero last opened (`alcoveOpen`): `takeAlcove` acts on it. */
const opened = new WeakMap<ArpgWorld, string>();

/** The id of the alcove last opened on `world`, or null. */
export function openedAlcove(world: ArpgWorld): string | null {
  return opened.get(world) ?? null;
}

/** The interactable `id` on the world's map. */
function interactableOf(world: ArpgWorld, id: string): Interactable | undefined {
  return world.map.rooms.find((r) => r.interactable?.id === id)?.interactable;
}

function shrineOf(registry: DataRegistry, it: Interactable): ShrineDef | undefined {
  return registry.getDelveData().shrines.find((s) => s.id === it.shrine);
}

/** A boss of the floor still stands: its gate stays shut. */
function gateShut(world: ArpgWorld): boolean {
  return world.monsters.some((m) => !m.dead && m.kind === 'boss');
}

/** The nearest interactable the hero can use from where it stands, if any. */
function inReach(world: ArpgWorld, radius: number): Interactable | null {
  const h = world.hero;
  let best: Interactable | null = null;
  let bestD = radius;
  for (const room of world.map.rooms) {
    const it = room.interactable;
    if (!it || it.used || (it.kind === 'gate' && gateShut(world))) continue;
    const d = dist(h.x, h.y, it.x, it.y);
    if (d <= bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

/** One use a dive: on the world's interactable and, for the bank, in `pending.used`. */
function use(world: ArpgWorld, it: Interactable): void {
  it.used = true;
  world.pending.used.push(it.id);
}

/**
 * The interactable in reach (`ai.interactRadius`): its `interactPrompt` each
 * step, and an interact press (`ArpgWorld.queuedInteract`) acting on it: a
 * chest bursts (`drops.vault`); a shrine starts a prayer (`channel`,
 * `ai.shrineChannel`) that a move, a dodge or a hit breaks and that blesses
 * at its end (`applyShrine`); an alcove opens (`alcoveOpen`); the gate asks
 * to leave (`exitRequest`), shut on a boss floor while the boss stands. A
 * press with nothing in reach is dropped.
 */
export function interactTick(ctx: SimCtx): void {
  const { world, bal, registry, events } = ctx;
  const pressed = world.queuedInteract;
  world.queuedInteract = false;
  if (world.map.open) return;
  const h = world.hero;
  const t = world.t;

  const prayer = world.channel;
  if (prayer) {
    const broke =
      dist(h.x, h.y, prayer.x, prayer.y) > PRAYER_SLIP ||
      (!!h.dodge && t < h.dodge.until) ||
      h.lastHitAt >= prayer.start;
    if (broke) world.channel = null;
    else if (t >= prayer.until) {
      world.channel = null;
      const it = interactableOf(world, prayer.id);
      const shrine = it && shrineOf(registry, it);
      if (it && !it.used && shrine) {
        use(world, it);
        applyShrine(registry, world, shrine);
      }
    }
    return;
  }

  const it = inReach(world, bal.ai.interactRadius);
  if (!it) return;
  const shrine = it.kind === 'shrine' ? shrineOf(registry, it) : undefined;
  const text =
    it.kind === 'shrine' ? (shrine ? `${shrine.name}: ${shrine.text}` : 'Shrine') : NAMES[it.kind];
  events.push({ kind: 'interactPrompt', id: it.id, interactable: it.kind, text });
  if (!pressed) return;
  switch (it.kind) {
    case 'chest':
      use(world, it);
      openChest(ctx, it);
      break;
    case 'shrine':
      world.channel = { id: it.id, x: h.x, y: h.y, start: t, until: t + bal.ai.shrineChannel };
      break;
    case 'alcove':
      opened.set(world, it.id);
      events.push({ kind: 'alcoveOpen', id: it.id });
      break;
    case 'gate':
      events.push({
        kind: 'exitRequest',
        roomsUnexplored: world.map.rooms.filter((r) => !r.revealed).length,
      });
      break;
  }
}

/**
 * A vault chest's haul (`drops.vault`): flux and shards by the floor's depth,
 * the door and Find, the shards `shardTierUp` tiers up, and an essence at
 * `essenceChance` × the door's `essence` × Lucky Charm's boost; never gear.
 */
export function rollVault(
  registry: DataRegistry,
  world: ArpgWorld,
  rng: SeededRNG,
): { material: MaterialRef; amount: number }[] {
  const vault = registry.getDelveBalance().drops.vault;
  const loot = world.loot;
  // ponytail: rolls the vault's table through a foe's roll (`drops[kind]` reads `drops.vault`);
  // give `rollMaterialDrops` a table argument if a third caller ever needs this.
  const { materials } = rollMaterialDrops(
    registry,
    {
      depth: world.depth,
      kind: 'vault' as unknown as MonsterKind,
      biomeId: world.biomeId,
      biomeMana: world.element,
      door: world.door,
      find: loot.find,
      legendaryBoost: loot.legendaryBoost,
      firstEssence: false,
      patterns: loot.patterns,
    },
    rng,
  );
  const haul = materials.map(({ material, amount }) =>
    material.kind === 'shard'
      ? {
          material: {
            ...material,
            tier: Math.min(
              shardTiersOf(registry, material.stat).length,
              material.tier + vault.shardTierUp,
            ),
          },
          amount,
        }
      : { material, amount },
  );
  const essence = vault.essenceChance * (world.door?.mods.essence ?? 1) * loot.legendaryBoost;
  if (rng.next() < Math.min(1, essence)) {
    const legendaries = registry.getDelveData().legendaries;
    const id = legendaries[rng.nextInt(0, legendaries.length - 1)].id;
    haul.push({ material: { kind: 'essence', essence: id }, amount: 1 });
  }
  return haul;
}

/** The chest bursts its haul around it, on `world.materialRng`. */
function openChest(ctx: SimCtx, it: Interactable): void {
  const { world, registry } = ctx;
  const rng = world.materialRng;
  for (const { material, amount } of rollVault(registry, world, rng)) {
    const angle = rng.next() * Math.PI * 2;
    const r = 0.6 + rng.next() * 0.9;
    const { x, y } = snapToWalkable(
      world.map,
      it.x + Math.cos(angle) * r,
      it.y + Math.sin(angle) * r,
      1,
    );
    const id = world.nextId++;
    world.drops.push({
      id,
      kind: 'material',
      x,
      y,
      material,
      amount,
      born: world.t,
      vacuum: false,
      dead: false,
    });
    ctx.events.push({ kind: 'drop', dropId: id, x, y, dropKind: 'material' });
  }
}

/**
 * A shrine's blessing on the world's hero (`interactTick` records the use): a
 * potion refill fills the flasks; its Find goes on `world.loot.find`; the rest
 * is a blessing (none for a refill alone). A floor blessing goes on
 * `floorBuffs`; a dive blessing on `diveBuffs` and `baseStats`, and into
 * `pending.diveBuffs` for the bank. The stats are `applyBuffs` over
 * `baseStats` and the pool resizes in place.
 */
export function applyShrine(registry: DataRegistry, world: ArpgWorld, shrine: ShrineDef): void {
  const h = world.hero;
  const { effect } = shrine;
  if (effect.potions) h.potions = registry.getDelveBalance().dive.maxPotions;
  world.loot.find += effect.find ?? 0;
  if (Object.keys(effect).every((k) => k === 'potions')) return;
  const buff = { shrine: shrine.id, effect };
  if (shrine.duration === 'dive') {
    h.diveBuffs.push(buff);
    world.pending.diveBuffs.push(buff);
    h.baseStats = applyBuffs(h.baseStats, [buff]);
  } else h.floorBuffs.push(buff);
  h.stats = applyBuffs(h.baseStats, h.floorBuffs);
  const pool = manaPool(h.stats, registry);
  h.manaMax = pool.max;
  h.manaRegen = pool.regen;
  h.mana = Math.min(h.mana, pool.max);
}

/** Take the exit: `world.exited` (the client after its confirm, the bot at once). */
export function exitFloor(world: ArpgWorld): void {
  world.exited = true;
}

/**
 * `killMonster`'s room hook: when a room's last foe dies, the room is cleared
 * (`roomCleared`) and its foes' drops are pulled to the hero (`ai.roomVacuum`).
 */
export function onMonsterKilled(ctx: SimCtx, m: MonsterEntity): void {
  const { world, bal, events } = ctx;
  if (m.roomId === null || world.monsters.some((o) => !o.dead && o.roomId === m.roomId)) return;
  const room = world.map.rooms.find((r) => r.id === m.roomId);
  if (!room || room.cleared) return;
  room.cleared = true;
  if (bal.ai.roomVacuum) for (const d of world.drops) if (d.roomId === m.roomId) d.vacuum = true;
  events.push({ kind: 'roomCleared', roomId: room.id });
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-interact.test.ts)`
Expected: PASS, 14 tests.

- [ ] **Step 5: The typecheck and the whole suite**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 14** tests pass (5 skipped) in **F + 1** files; the pacing rails unchanged (the open room never prompts).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-maps-b3
npx prettier --end-of-line auto --write packages/engine/src/arpg/interact.ts packages/engine/tests/delve-maps-interact.test.ts
git add packages/engine/src/arpg/interact.ts packages/engine/tests/delve-maps-interact.test.ts
git commit -m "feat(engine): the interact press: the vault's chest, the shrine's prayer, the alcove, the gate" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The fog and the seals

### Task 3: The fog of war, the exit hint and the minimap's data

**Files:**
- Create: `packages/engine/tests/delve-maps-fog.test.ts`
- Modify: `packages/engine/src/arpg/fog.ts` (overwritten whole)

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-maps-fog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hudMapOf } from '../src/arpg/fog.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { arena, bal, dummy, run, STEP } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';

// The fog of war and the minimap (see the floor maps spec): the hero starts at (4.5, 6) in room 0.

const fogAt = (w: ArpgWorld, x: number, y: number) => w.fog[y * w.width + x];

describe('the fog', () => {
  it('shows what the hero sees (floor in sight and the walls beside it) and reveals its room', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }));
    expect(w.fog.every((c) => c === 0)).toBe(true);
    run(w, STEP);
    expect([fogAt(w, 5, 2), fogAt(w, 0, 0)]).toEqual([2, 2]);
    // Down the hall into room 1, but not through its wall.
    expect([fogAt(w, 13, 6), fogAt(w, 14, 2)]).toEqual([2, 0]);
    expect(w.map.rooms.map((r) => r.revealed)).toEqual([true, false]);
    expect(w.fogVersion).toBe(1);
  });

  it('runs on ai.fogEvery marks, and fogVersion moves only when the fog does', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }));
    run(w, STEP);
    expect(w.fogAt).toBeCloseTo(STEP + bal.ai.fogEvery, 9);
    run(w, 1);
    expect(w.fogVersion).toBe(1);
  });

  it('entering a room reveals it whole; what fell out of sight stays seen', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }));
    run(w, STEP);
    Object.assign(w.hero, { x: 23, y: 9 });
    run(w, bal.ai.fogEvery);
    expect(w.map.rooms[1].revealed).toBe(true);
    for (let y = 1; y <= 10; y++)
      for (let x = 13; x <= 24; x++) expect(fogAt(w, x, y)).toBeGreaterThanOrEqual(1);
    expect(fogAt(w, 2, 2)).toBe(1);
    expect(w.fogVersion).toBe(2);
  });

  it('points to an unfound exit once, after ai.exitHintSeconds', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }));
    const before = run(w, bal.ai.exitHintSeconds - 0.5);
    const after = run(w, 1);
    expect(before.filter((e) => e.kind === 'exitHint')).toEqual([]);
    expect(after.filter((e) => e.kind === 'exitHint')).toEqual([{ kind: 'exitHint', x: 19, y: 6 }]);
    expect(run(w, 1).filter((e) => e.kind === 'exitHint')).toEqual([]);
    const found = floorWorld(twoRooms('exit', { kind: 'gate' }));
    Object.assign(found.hero, { x: 19, y: 8 });
    expect(run(found, bal.ai.exitHintSeconds + 1).some((e) => e.kind === 'exitHint')).toBe(false);
  });

  it('the open room is all in sight and never changes', () => {
    const w = arena([dummy(13, 20)]);
    run(w, 1);
    expect([w.fog.every((c) => c === 2), w.fogVersion, w.exitHinted]).toEqual([true, 0, false]);
  });
});

describe('hudMapOf', () => {
  it('draws the revealed rooms, foes in sight and drops in seen cells; the exit once found, the hint before', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }), [dummy(3, 3), dummy(22, 3)]);
    w.drops.push(
      { id: 1, kind: 'scrap', x: 7, y: 9, amount: 1, born: 0, vacuum: false, dead: false },
      { id: 2, kind: 'scrap', x: 22, y: 9, amount: 1, born: 0, vacuum: false, dead: false },
    );
    run(w, STEP);
    w.exitHinted = true;
    expect(hudMapOf(w)).toEqual({
      width: 26,
      height: 12,
      rooms: [
        {
          id: 0,
          kind: 'start',
          rect: { x: 1, y: 1, w: 8, h: 10 },
          icon: null,
          used: false,
          cleared: false,
          sealed: false,
        },
      ],
      exit: null,
      hint: { x: 19, y: 6 },
      foes: [{ x: w.monsters[0].x, y: w.monsters[0].y, kind: 'normal' }],
      drops: [{ x: 7, y: 9, kind: 'scrap' }],
      explored: 1,
      total: 2,
      fogVersion: 1,
    });
    Object.assign(w.hero, { x: 19, y: 8 });
    run(w, bal.ai.fogEvery);
    const map = hudMapOf(w);
    expect(map.rooms.map((r) => [r.id, r.icon])).toEqual([
      [0, null],
      [1, 'gate'],
    ]);
    expect([map.exit, map.hint, map.explored]).toEqual([{ x: 19, y: 6 }, null, 2]);
  });

  it('marks a den and the boss room with a skull, and a used interactable', () => {
    const w = floorWorld(twoRooms('den'));
    w.map.rooms[0].interactable = { id: '2:0', kind: 'chest', x: 4, y: 4, used: true };
    w.map.rooms.forEach((r) => (r.revealed = true));
    expect(hudMapOf(w).rooms.map((r) => [r.icon, r.used])).toEqual([
      ['chest', true],
      ['skull', false],
    ]);
  });

  it('on the open room: its one room, every foe, no exit', () => {
    const w = arena([dummy(13, 20)]);
    const map = hudMapOf(w);
    expect([map.rooms.length, map.foes.length, map.exit, map.explored, map.total]).toEqual([
      1,
      1,
      null,
      1,
      1,
    ]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-fog.test.ts)`
Expected: FAIL, **7 failed | 1 passed (8)**: the fog never moves (`fogTick` is a no-op) and `hudMapOf` throws "hudMapOf: not implemented"; only the open room's test passes.

- [ ] **Step 3: `roomAt`, `fogTick` and `hudMapOf`**

Overwrite `packages/engine/src/arpg/fog.ts` (the whole stub file):

```ts
import type { ArpgWorld } from '../types/arpg.js';
import type { FloorMap, HudIcon, HudMap, InteractableKind, Room } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';
import { blocked, lineOfSight } from './grid.js';

/**
 * The fog of war and the minimap (see the floor maps spec).
 */

/** The room whose floor holds the point (x, y), if any (a hall's point is in none). */
export function roomAt(map: FloorMap, x: number, y: number): Room | undefined {
  return map.rooms.find(({ rect: r }) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/**
 * At `ai.fogEvery` marks (`ArpgWorld.fogAt`): what was in sight dims to seen,
 * the floor cells within `ai.sightRadius` the hero has a line of sight to are
 * in sight, and so are the walls beside them; the room the hero stands in is
 * revealed, its floor and walls seen. `fogVersion` moves when anything did.
 * After `ai.exitHintSeconds` with the exit's room unrevealed, the `exitHint`
 * fires once (`exitHinted`). A no-op on the open room.
 */
export function fogTick(ctx: SimCtx): void {
  const { world, bal, events } = ctx;
  const { map, hero: h, fog } = world;
  if (map.open || world.t < world.fogAt) return;
  world.fogAt = world.t + bal.ai.fogEvery;
  const w = map.width;
  const before = fog.slice();
  for (let i = 0; i < fog.length; i++) if (fog[i] === 2) fog[i] = 1;

  const r = bal.ai.sightRadius;
  const x0 = Math.max(0, Math.floor(h.x - r));
  const x1 = Math.min(w - 1, Math.floor(h.x + r));
  const y0 = Math.max(0, Math.floor(h.y - r));
  const y1 = Math.min(map.height - 1, Math.floor(h.y + r));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const c = { x: x + 0.5, y: y + 0.5 };
      if (blocked(map, x, y) || Math.hypot(c.x - h.x, c.y - h.y) > r) continue;
      if (lineOfSight(map, h, c)) fog[y * w + x] = 2;
    }
  // The walls beside a floor cell in sight are in sight too.
  const lit = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < map.height && !blocked(map, x, y) && fog[y * w + x] === 2;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!blocked(map, x, y)) continue;
      let near = false;
      for (let j = -1; j <= 1 && !near; j++)
        for (let i = -1; i <= 1; i++) near ||= lit(x + i, y + j);
      if (near) fog[y * w + x] = 2;
    }

  const room = roomAt(map, h.x, h.y);
  const entered = !!room && !room.revealed;
  if (room && entered) {
    room.revealed = true;
    const { x, y, w: rw, h: rh } = room.rect;
    for (let j = Math.max(0, y - 1); j <= Math.min(map.height - 1, y + rh); j++)
      for (let i = Math.max(0, x - 1); i <= Math.min(w - 1, x + rw); i++)
        fog[j * w + i] = Math.max(fog[j * w + i], 1);
  }
  if (entered || fog.some((v, i) => v !== before[i])) world.fogVersion++;

  const exit = roomAt(map, map.exit.x, map.exit.y);
  if (!world.exitHinted && world.t >= bal.ai.exitHintSeconds && exit && !exit.revealed) {
    world.exitHinted = true;
    events.push({ kind: 'exitHint', x: map.exit.x, y: map.exit.y });
  }
}

const ICONS: Record<InteractableKind, HudIcon> = {
  chest: 'chest',
  shrine: 'shrine',
  alcove: 'anvil',
  gate: 'gate',
};

/** What the minimap draws (pure): revealed rooms and their icons, the exit and its hint, foes in sight, drops in seen cells. */
export function hudMapOf(world: ArpgWorld): HudMap {
  const { map, fog } = world;
  const fogAt = (x: number, y: number) => {
    const cx = Math.min(map.width - 1, Math.max(0, Math.floor(x)));
    const cy = Math.min(map.height - 1, Math.max(0, Math.floor(y)));
    return fog[cy * map.width + cx];
  };
  const revealed = map.rooms.filter((r) => r.revealed);
  const found = !map.open && !!roomAt(map, map.exit.x, map.exit.y)?.revealed;
  return {
    width: map.width,
    height: map.height,
    rooms: revealed.map((r) => ({
      id: r.id,
      kind: r.kind,
      rect: { ...r.rect },
      icon: r.interactable
        ? ICONS[r.interactable.kind]
        : r.kind === 'den' || r.kind === 'boss'
          ? 'skull'
          : null,
      used: !!r.interactable?.used,
      cleared: r.cleared,
      sealed: r.sealed,
    })),
    exit: found ? { ...map.exit } : null,
    hint: world.exitHinted && !found ? { ...map.exit } : null,
    foes: world.monsters
      .filter((m) => !m.dead && fogAt(m.x, m.y) === 2)
      .map((m) => ({ x: m.x, y: m.y, kind: m.kind })),
    drops: world.drops
      .filter((d) => !d.dead && fogAt(d.x, d.y) >= 1)
      .map((d) => ({ x: d.x, y: d.y, kind: d.kind })),
    explored: revealed.length,
    total: map.rooms.length,
    fogVersion: world.fogVersion,
  };
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-fog.test.ts)`
Expected: PASS, 8 tests.

- [ ] **Step 5: The typecheck and the whole suite**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 22** tests pass (5 skipped) in **F + 2** files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-maps-b3
npx prettier --end-of-line auto --write packages/engine/src/arpg/fog.ts packages/engine/tests/delve-maps-fog.test.ts
git add packages/engine/src/arpg/fog.ts packages/engine/tests/delve-maps-fog.test.ts
git commit -m "feat(engine): the fog of war, the exit hint and hudMapOf" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: Sealed rooms

**Files:**
- Create: `packages/engine/tests/delve-maps-seal.test.ts`
- Modify: `packages/engine/src/arpg/seal.ts` (overwritten whole)

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-maps-seal.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { RoomKind } from '../src/types/floor-map.js';
import { bal, dummy, registry, run, STEP } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';

// Sealed rooms (see the floor maps spec's "Sealed rooms"): room 1's one door is door 1 (x 11–12).

const kinds = (events: ArpgEvent[]) =>
  events.filter((e) => e.kind === 'seal' || e.kind === 'unseal');

/** The hero at (hx, 6) in room 1 of `kind`, with an awake foe of the room and any `others`. */
function den(hx = 16, kind: RoomKind = 'den', others = [] as ReturnType<typeof dummy>[]) {
  const w = floorWorld(twoRooms(kind), [dummy(22, 3, { roomId: 1, aggro: true }), ...others]);
  Object.assign(w.hero, { x: hx, y: 6 });
  return w;
}

describe('a sealed room', () => {
  it('seals a den once the hero stands in it with a foe of it awake: nothing passes its door', () => {
    const w = den();
    expect(kinds(run(w, STEP))).toEqual([{ kind: 'seal', roomId: 1 }]);
    expect([w.map.rooms[1].sealed, w.map.doors.map((d) => d.closed)]).toEqual([
      true,
      [false, true],
    ]);
    expect(w.sealing).toBeNull();
    run(w, 2, { x: -1, y: 0 });
    expect(w.hero.x).toBeGreaterThanOrEqual(13 + w.hero.radius - 1e-9);
  });

  it("doesn't seal while its foes sleep, nor a combat room", () => {
    const asleep = den(14); // beyond monster.aggroRadius of its foe
    asleep.monsters[0].aggro = false;
    const combat = den(16, 'combat');
    expect([...kinds(run(asleep, 0.5)), ...kinds(run(combat, 0.5))]).toEqual([]);
    expect(asleep.map.doors.some((d) => d.closed) || combat.map.doors.some((d) => d.closed)).toBe(
      false,
    );
  });

  it('brings in its foes from outside', () => {
    const w = den(16, 'den', [dummy(4, 3, { roomId: 1 })]);
    run(w, STEP);
    const m = w.monsters[1];
    expect(m.x >= 13 && m.x < 25 && m.y >= 1 && m.y < 11).toBe(true);
  });

  it('a door waits while the hero stands in it, nudging the hero in', () => {
    const w = den(13.2);
    expect(kinds(run(w, STEP))).toEqual([]);
    expect(w.sealing).toMatchObject({ roomId: 1 });
    expect(w.hero.x).toBeGreaterThan(13.2 + 0.4);
    expect(kinds(run(w, STEP))).toEqual([{ kind: 'seal', roomId: 1 }]);
  });

  it('after ai.sealGrace, whoever still stands in the door is put out on its side and it closes', () => {
    const w = den(16, 'den', [dummy(12.5, 6, { roomId: null })]);
    run(w, bal.ai.sealGrace - 2 * STEP);
    expect(w.map.rooms[1].sealed).toBe(false);
    expect(kinds(run(w, 3 * STEP))).toEqual([{ kind: 'seal', roomId: 1 }]);
    expect(w.monsters[1].x).toBeLessThanOrEqual(11 - w.monsters[1].radius);
  });

  it('a hero who walks out before it shuts ends the sealing, its door open', () => {
    const w = den(16, 'den', [dummy(12.5, 6, { roomId: null })]);
    run(w, STEP);
    expect(w.sealing).not.toBeNull();
    Object.assign(w.hero, { x: 5, y: 6 });
    run(w, STEP);
    expect([w.sealing, w.map.doors[1].closed, w.map.rooms[1].sealed]).toEqual([null, false, false]);
  });

  it('opens when its last foe dies (unseal)', () => {
    const w = den();
    run(w, STEP);
    killMonster(makeCtx(registry, w, []), w.monsters[0]);
    expect(kinds(run(w, STEP))).toEqual([{ kind: 'unseal', roomId: 1 }]);
    expect([w.map.rooms[1].sealed, w.map.doors[1].closed]).toEqual([false, false]);
    expect(kinds(run(w, 0.5))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-seal.test.ts)`
Expected: FAIL, **6 failed | 1 passed (7)**: no room ever seals (`sealTick` is a no-op); the sleepers' and the combat room's test passes.

- [ ] **Step 3: `doorsOf` and `sealTick`**

Overwrite `packages/engine/src/arpg/seal.ts` (the whole stub file):

```ts
import type { Vec } from '../types/arpg.js';
import type { Door, FloorMap, Rect, Room } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';
import { roomAt } from './fog.js';
import { clamp, dirTo } from './geometry.js';
import { blocked, moveCircle } from './grid.js';

/**
 * Sealed rooms (see the floor maps spec): a den or the boss room closes its
 * doors while the hero is inside with a foe of it awake, and opens them when
 * none of its foes is left alive.
 */

interface Circle extends Vec {
  radius: number;
}

function inside(rect: Rect, p: Vec): boolean {
  return p.x >= rect.x && p.x < rect.x + rect.w && p.y >= rect.y && p.y < rect.y + rect.h;
}

/** Whether a circle overlaps cell (cx, cy). */
function overlaps(c: Circle, cell: Vec): boolean {
  const dx = c.x - clamp(c.x, cell.x, cell.x + 1);
  const dy = c.y - clamp(c.y, cell.y, cell.y + 1);
  return dx * dx + dy * dy < c.radius * c.radius;
}

function inDoor(c: Circle, doors: Door[]): boolean {
  return doors.some((d) => d.cells.some((cell) => overlaps(c, cell)));
}

/** The room's doors: those in its wall (`Door.rooms[0]`; a hall's other door is the other room's). */
export function doorsOf(map: FloorMap, room: Room): Door[] {
  return map.doors.filter((d) => d.rooms[0] === room.id);
}

/**
 * The centre of the walkable cell nearest `c` on the room's side (`within`:
 * its floor, else outside it) where a circle of its radius overlaps none of
 * `doors` (ring by ring around it); `c` itself if there is none.
 */
function freeSpot(map: FloorMap, room: Room, doors: Door[], c: Circle, within: boolean): Vec {
  const cx = Math.floor(c.x);
  const cy = Math.floor(c.y);
  for (let ring = 0; ring < Math.max(map.width, map.height); ring++) {
    let best: Vec | null = null;
    let bestD = Infinity;
    for (let j = cy - ring; j <= cy + ring; j++)
      for (let i = cx - ring; i <= cx + ring; i++) {
        if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== ring || blocked(map, i, j)) continue;
        const p = { x: i + 0.5, y: j + 0.5 };
        if (inside(room.rect, p) !== within || inDoor({ ...p, radius: c.radius }, doors)) continue;
        const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
        if (d < bestD) {
          best = p;
          bestD = d;
        }
      }
    if (best) return best;
  }
  return { x: c.x, y: c.y };
}

/**
 * A den or the boss room seals when the hero stands in it with a foe of it
 * awake (`ArpgWorld.sealing`): its foes outside are brought to free cells
 * inside, and each door closes once no one stands in it (the hero is nudged
 * inward); after `ai.sealGrace` whoever still does is put out on their side
 * and the door closes. With every door shut the room is `sealed` (`seal`). A
 * hero who leaves before it shuts ends the sealing, its doors open again. A
 * sealing or sealed room whose foes are all dead opens (`unseal`). A no-op on
 * the open room.
 */
export function sealTick(ctx: SimCtx): void {
  const { world, bal, events } = ctx;
  const { map, hero: h } = world;
  if (map.open) return;
  const foesOf = (room: Room) => world.monsters.filter((m) => !m.dead && m.roomId === room.id);
  const open = (room: Room) => {
    for (const d of doorsOf(map, room)) d.closed = false;
    if (world.sealing?.roomId === room.id) world.sealing = null;
  };

  for (const room of map.rooms) {
    if (!(room.sealed || world.sealing?.roomId === room.id) || foesOf(room).length > 0) continue;
    open(room);
    if (room.sealed) events.push({ kind: 'unseal', roomId: room.id });
    room.sealed = false;
  }

  if (!world.sealing) {
    const room = roomAt(map, h.x, h.y);
    if (!room || room.sealed || (room.kind !== 'den' && room.kind !== 'boss')) return;
    const foes = foesOf(room);
    if (!foes.some((m) => m.aggro)) return;
    world.sealing = { roomId: room.id, since: world.t };
    const doors = doorsOf(map, room);
    for (const m of foes)
      if (!inside(room.rect, m)) Object.assign(m, freeSpot(map, room, doors, m, true));
  }

  const room = map.rooms.find((r) => r.id === world.sealing!.roomId)!;
  const doors = doorsOf(map, room);
  const late = world.t >= world.sealing.since + bal.ai.sealGrace;
  if (!inside(room.rect, h) && (late || !inDoor(h, doors))) return open(room);
  const circles: Circle[] = [h, ...world.monsters.filter((m) => !m.dead)];
  for (const d of doors) {
    if (d.closed) continue;
    const standing = circles.filter((c) => inDoor(c, [d]));
    for (const c of standing) {
      if (late) Object.assign(c, freeSpot(map, room, doors, c, inside(room.rect, c)));
      else if (c === h) {
        const centre = { x: room.rect.x + room.rect.w / 2, y: room.rect.y + room.rect.h / 2 };
        const dir = dirTo(h.x, h.y, centre.x, centre.y);
        Object.assign(h, moveCircle(map, h, h.radius, dir.x * h.radius, dir.y * h.radius));
      }
    }
    if (late || standing.length === 0) d.closed = true;
  }
  if (doors.every((d) => d.closed)) {
    room.sealed = true;
    world.sealing = null;
    events.push({ kind: 'seal', roomId: room.id });
  }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-seal.test.ts)`
Expected: PASS, 7 tests.

- [ ] **Step 5: The typecheck and the whole suite**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 29** tests pass (5 skipped) in **F + 3** files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-maps-b3
npx prettier --end-of-line auto --write packages/engine/src/arpg/seal.ts packages/engine/tests/delve-maps-seal.test.ts
git add packages/engine/src/arpg/seal.ts packages/engine/tests/delve-maps-seal.test.ts
git commit -m "feat(engine): sealed dens and boss rooms" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The dive

### Task 5: The bank keeps what the floor used (the replays, S1)

**Files:**
- Create: `packages/engine/tests/delve-maps-flow.test.ts`
- Modify: `packages/engine/src/delve/dive.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-maps-flow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyShrine } from '../src/arpg/interact.js';
import { stepWorld } from '../src/arpg/step.js';
import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
import { profileStats } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { FloorMap } from '../src/types/floor-map.js';
import type { DataRegistry } from '../src/data/registry.js';
import { bal, registry, run, STEP } from './fixtures/arena.js';
import { onMap, twoRooms } from './fixtures/flow-map.js';

// The floor flow across banks and replays (see the floor maps spec's S1–S3 and "Anvil alcove").

const shrine = (id: string) => registry.getDelveData().shrines.find((s) => s.id === id)!;
const ring = generateItem(
  registry,
  { uid: 'r1', ilvl: 2, rarity: 'magic', slot: 'ring', mana: 'fire' },
  new SeededRNG(1),
);
/** A Fire hero at depth 1 with a ring in the bag and scrap: its stops and alcoves offer equip and upgrade. */
const diving = (reg: DataRegistry = registry): DelveProfile =>
  startDive(
    reg,
    {
      ...createDelveProfile(reg, 3, { primary: 'fire' }),
      bag: [ring],
      scrap: 1000,
      manaDust: 0,
      links: 0,
    },
    1,
  );

/**
 * The dive's floor on `map`, its foes gone, the hero beside room 1's
 * interactable; what the dive used starts used (as the generator marks it).
 */
function floorOf(p: DelveProfile, map: FloorMap, reg: DataRegistry = registry): ArpgWorld {
  const w = onMap(beginFloor(reg, p), map);
  w.monsters = [];
  Object.assign(w.hero, { x: 19, y: 7 });
  for (const r of map.rooms)
    if (r.interactable && p.dive!.used.includes(r.interactable.id)) r.interactable.used = true;
  return w;
}
const press = (w: ArpgWorld): ArpgEvent[] =>
  stepWorld(registry, w, { move: { x: 0, y: 0 }, interact: true }, STEP);

describe('a bank keeps what the floor used', () => {
  it('writes pending.used and pending.diveBuffs into the dive, with its potions', () => {
    const p = diving();
    const w = floorOf(p, twoRooms('sanctum', { kind: 'shrine', shrine: 'devotion' }, 1));
    w.pending.used.push('1:1');
    applyShrine(registry, w, shrine('devotion'));
    const once = bankWorld(registry, p, w).profile;
    const devotion = { shrine: 'devotion', effect: shrine('devotion').effect };
    expect([once.dive!.used, once.dive!.diveBuffs]).toEqual([['1:1'], [devotion]]);
    expect([w.pending.used, w.pending.diveBuffs]).toEqual([[], []]);
    const twice = bankWorld(registry, once, w).profile;
    expect([twice.dive!.used, twice.dive!.diveBuffs]).toEqual([['1:1'], [devotion]]);
  });
});

describe('a replayed floor (S1)', () => {
  it('finds its vault open', () => {
    const p = diving();
    const map = () => twoRooms('vault', { kind: 'chest' }, 1);
    const w = floorOf(p, map());
    expect(press(w).some((e) => e.kind === 'drop')).toBe(true);
    const banked = bankWorld(registry, p, w).profile;
    const again = floorOf(banked, map());
    expect(again.map.rooms[1].interactable!.used).toBe(true);
    expect(press(again).some((e) => e.kind === 'interactPrompt' || e.kind === 'drop')).toBe(false);
  });

  it('finds a shrine spent after its refill banked, the flasks still full', () => {
    const p = diving();
    const map = () => twoRooms('sanctum', { kind: 'shrine', shrine: 'mercy' }, 1);
    const w = floorOf(p, map());
    w.hero.potions = 0;
    press(w);
    run(w, bal.ai.shrineChannel + 0.1);
    expect(w.hero.potions).toBe(bal.dive.maxPotions);
    const banked = bankWorld(registry, p, w).profile;
    expect([banked.dive!.potions, banked.dive!.used]).toEqual([bal.dive.maxPotions, ['1:1']]);
    const again = floorOf(banked, map());
    expect([again.hero.potions, again.map.rooms[1].interactable!.used]).toEqual([
      bal.dive.maxPotions,
      true,
    ]);
  });

  it('keeps a dive blessing on the hero from the next world on', () => {
    const p = diving();
    const w = floorOf(p, twoRooms('sanctum', { kind: 'shrine', shrine: 'devotion' }, 1));
    press(w);
    run(w, bal.ai.shrineChannel + 0.1);
    const banked = bankWorld(registry, p, w).profile;
    const again = beginFloor(registry, banked);
    expect(again.hero.diveBuffs.map((b) => b.shrine)).toEqual(['devotion']);
    expect(again.hero.stats.damageMult).toBeCloseTo(
      profileStats(registry, banked).damageMult * 1.1,
      9,
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-flow.test.ts)`
Expected: FAIL, **4 failed (4)**: the bank leaves `dive.used` and `dive.diveBuffs` empty, so a replay finds the vault and the shrine unused and the next world has no blessing.

- [ ] **Step 3: `bankWorld` writes them**

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
      dropsGiven: [...world.loot.dropsGiven],
      found,
```

with:

```ts
      dropsGiven: [...world.loot.dropsGiven],
      used: [...dive.used, ...pending.used],
      diveBuffs: [...dive.diveBuffs, ...pending.diveBuffs],
      found,
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-flow.test.ts)`
Expected: PASS, 4 tests.

- [ ] **Step 5: The typecheck and the whole suite**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 33** tests pass (5 skipped) in **F + 4** files.

- [ ] **Step 6: Commit** (`dive.ts` is hand-edited, never formatted)

```bash
cd /c/Projects/alloy-maps-b3
npx prettier --end-of-line auto --write packages/engine/tests/delve-maps-flow.test.ts
git add packages/engine/src/delve/dive.ts packages/engine/tests/delve-maps-flow.test.ts
git commit -m "feat(engine): a bank keeps the floor's used interactables and dive blessings" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: The floor clear counts its rooms (S3)

**Files:**
- Modify: `packages/engine/src/delve/dive.ts`, `src/types/quests.ts`, `src/data/schemas.ts`, `src/delve/quests.ts`, `src/delve/contracts.ts`, `src/data/quests.json`, `tests/delve-maps-flow.test.ts`, `tests/delve-quest-contracts.test.ts`, `tests/delve-quests-content.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-maps-flow.test.ts`:

Replace:

```ts
import { stepWorld } from '../src/arpg/step.js';
import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
import { profileStats } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
```

with:

```ts
import { stepWorld } from '../src/arpg/step.js';
import { bankWorld, beginFloor, completeFloor, startDive } from '../src/delve/dive.js';
import { profileStats } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { applyQuestEvents } from '../src/delve/quests.js';
import { generateItem } from '../src/loot/item-generator.js';
```

Replace:

```ts
import type { FloorMap } from '../src/types/floor-map.js';
import type { DataRegistry } from '../src/data/registry.js';
import { bal, registry, run, STEP } from './fixtures/arena.js';
import { onMap, twoRooms } from './fixtures/flow-map.js';
```

with:

```ts
import type { FloorMap } from '../src/types/floor-map.js';
import type { QuestEvent } from '../src/types/quests.js';
import type { DataRegistry } from '../src/data/registry.js';
import { bal, registry, run, STEP } from './fixtures/arena.js';
import { onMap, twoRooms } from './fixtures/flow-map.js';
import { obj, quest, questRegistry, value } from './fixtures/quests.js';
```

Append at the end of the file:

```ts
describe('the floor clear counts its rooms (S3)', () => {
  const reg = questRegistry([
    quest('any', [obj('clearFloor', 99)]),
    quest('rooms', [obj('clearFloor', 99, { filter: { minRoomsCleared: 1 } })]),
  ]);
  const cleared = (p: DelveProfile, w: ArpgWorld) => completeFloor(reg, p, w).profile;

  it('a generated floor counts only its rooms cleared; the open room clears whole', () => {
    const p = diving(reg);
    const none = cleared(p, floorOf(p, twoRooms('combat'), reg));
    const roomed = floorOf(p, twoRooms('combat'), reg);
    roomed.map.rooms[1].cleared = true;
    const one = cleared(p, roomed);
    const open = cleared(p, beginFloor(reg, p));
    expect([none, one, open].map((q) => [value(q, 'any'), value(q, 'rooms')])).toEqual([
      [1, 0],
      [1, 1],
      [1, 1],
    ]);
  });

  it('minRoomsCleared holds back a floor clear with fewer, and the flag quests set it', () => {
    const p = createDelveProfile(reg, 1, { primary: 'fire' });
    const floor = (roomsCleared?: number): QuestEvent => ({
      type: 'clearFloor',
      biome: 'cinder_mines',
      depth: 3,
      noPotion: true,
      noDamage: true,
      ...(roomsCleared !== undefined && { roomsCleared }),
    });
    const q = applyQuestEvents(reg, p, [floor(0), floor(1), floor(3), floor()]);
    expect([value(q, 'any'), value(q, 'rooms')]).toEqual([4, 3]);
    const data = registry.getQuestsData();
    const untouchable = data.quests.find((x) => x.id === 'untouchable')!.objectives[0];
    const dryRun = data.contractTemplates.find((t) => t.id === 'dry_run')!;
    expect(untouchable.filter!.minRoomsCleared).toBeGreaterThan(0);
    expect(dryRun.filter!.minRoomsCleared).toBeGreaterThan(0);
  });
});
```

In `packages/engine/tests/delve-quest-contracts.test.ts`:

Replace:

```ts
    for (const o of all.filter((x) => x.type === 'clearFloor'))
      expect(o.filter).toEqual({ noPotion: true, minDepth: 12 - contracts.flagDepthBelow });
    expect(all.find((o) => o.type === 'reaction')!.text).toMatch(
```

with:

```ts
    for (const o of all.filter((x) => x.type === 'clearFloor'))
      expect(o.filter).toEqual({
        noPotion: true,
        minDepth: 12 - contracts.flagDepthBelow,
        minRoomsCleared: 2,
      });
    expect(all.find((o) => o.type === 'reaction')!.text).toMatch(
```

Replace:

```ts
      expect(o.text).toBe(
        `Clear ${o.count} ${floors} of depth ${o.filter!.minDepth} or deeper without a potion`,
      );
```

with:

```ts
      expect(o.text).toBe(
        `Clear ${o.count} ${floors} of depth ${o.filter!.minDepth} or deeper, ${o.filter!.minRoomsCleared} rooms or more, without a potion`,
      );
```

In `packages/engine/tests/delve-quests-content.test.ts`:

Replace:

```ts
      ['extract', { minDepth: 'window' }],
      ['clearFloor', { noPotion: true, minDepth: 'flag' }],
      ['boss', { biome: 'reached' }],
```

with:

```ts
      ['extract', { minDepth: 'window' }],
      ['clearFloor', { noPotion: true, minDepth: 'flag', minRoomsCleared: 2 }],
      ['boss', { biome: 'reached' }],
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-flow.test.ts tests/delve-quest-contracts.test.ts tests/delve-quests-content.test.ts)`
Expected: FAIL, **5 failed | 19 passed (24)**: the quests don't know `minRoomsCleared` yet, so a floor clear with no rooms counts and Untouchable has none (the two new flow tests), and Dry Run's filter and text lack it (two contract tests, one content test).

- [ ] **Step 3: `roomsCleared` and `minRoomsCleared`**

In `packages/engine/src/types/quests.ts`:

Replace:

```ts
  minDepth?: number;
  /** `reaction`: this reaction. */
```

with:

```ts
  minDepth?: number;
  /** `clearFloor`: at least this many rooms cleared on a generated floor (see the floor maps spec's S3). */
  minRoomsCleared?: number;
  /** `reaction`: this reaction. */
```

Replace:

```ts
    progress: 'sum',
    filters: ['biome', 'noPotion', 'noDamage', 'minDepth'],
    anvilOnly: false,
```

with:

```ts
    progress: 'sum',
    filters: ['biome', 'noPotion', 'noDamage', 'minDepth', 'minRoomsCleared'],
    anvilOnly: false,
```

Replace:

```ts
  noDamage?: true;
}
```

with:

```ts
  noDamage?: true;
  /** Copied as it is (see `ObjectiveFilter.minRoomsCleared`). */
  minRoomsCleared?: number;
}
```

Replace:

```ts
  | { type: 'reachDepth'; depth: number }
  | { type: 'clearFloor'; biome: string; depth: number; noPotion: boolean; noDamage: boolean }
  | { type: 'extract'; depth: number }
```

with:

```ts
  | { type: 'reachDepth'; depth: number }
  | {
      type: 'clearFloor';
      biome: string;
      depth: number;
      noPotion: boolean;
      noDamage: boolean;
      /** A generated floor's rooms cleared (none on the open room, which clears whole). */
      roomsCleared?: number;
    }
  | { type: 'extract'; depth: number }
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
        minDepth: z.number().int().min(1),
        reaction: ReactionIdSchema,
```

with:

```ts
        minDepth: z.number().int().min(1),
        minRoomsCleared: z.number().int().min(1),
        reaction: ReactionIdSchema,
```

Replace:

```ts
        noDamage: z.literal(true),
      })
```

with:

```ts
        noDamage: z.literal(true),
        minRoomsCleared: z.number().int().min(1),
      })
```

In `packages/engine/src/delve/quests.ts`:

Replace:

```ts
    noDamage: boolean;
    reaction: string;
```

with:

```ts
    noDamage: boolean;
    roomsCleared: number;
    reaction: string;
```

Replace:

```ts
    (f.minDepth === undefined || (v.depth ?? 0) >= f.minDepth) &&
    (!f.reaction || v.reaction === f.reaction) &&
```

with:

```ts
    (f.minDepth === undefined || (v.depth ?? 0) >= f.minDepth) &&
    // The open room has no rooms to count: it clears whole.
    (f.minRoomsCleared === undefined ||
      v.roomsCleared === undefined ||
      v.roomsCleared >= f.minRoomsCleared) &&
    (!f.reaction || v.reaction === f.reaction) &&
```

In `packages/engine/src/delve/contracts.ts`:

Replace:

```ts
 * can be offered. Its text's `{count}`, `{biome}`, `{element}`, `{reaction}`,
 * `{depth}` and `{rarity}` are filled from the data's names, and `{s}` is "s"
 * unless the count is 1. The caller moves `boardCount` on.
 */
```

with:

```ts
 * can be offered. Its text's `{count}`, `{biome}`, `{element}`, `{reaction}`,
 * `{depth}`, `{rooms}` and `{rarity}` are filled from the data's names, and `{s}`
 * is "s" unless the count is 1. The caller moves `boardCount` on.
 */
```

Replace:

```ts
  if (rule.noDamage) filter.noDamage = true;
  const grow = 1 + (countScale[t.type] ?? 0) * profile.bestDepth;
```

with:

```ts
  if (rule.noDamage) filter.noDamage = true;
  if (rule.minRoomsCleared) filter.minRoomsCleared = rule.minRoomsCleared;
  const grow = 1 + (countScale[t.type] ?? 0) * profile.bestDepth;
```

Replace:

```ts
    depth: filter.minDepth ?? '',
    rarity: filter.minRarity ? registry.getQuestsData().rarityNames[filter.minRarity] : '',
```

with:

```ts
    depth: filter.minDepth ?? '',
    rooms: filter.minRoomsCleared ?? '',
    rarity: filter.minRarity ? registry.getQuestsData().rarityNames[filter.minRarity] : '',
```

In `packages/engine/src/data/quests.json`:

Replace:

```json
          "type": "clearFloor",
          "filter": { "noPotion": true, "noDamage": true, "minDepth": 5 },
          "count": 1,
          "scope": "total",
          "text": "Clear a floor of depth 5 or deeper without a potion or taking damage"
        }
```

with:

```json
          "type": "clearFloor",
          "filter": { "noPotion": true, "noDamage": true, "minDepth": 5, "minRoomsCleared": 2 },
          "count": 1,
          "scope": "total",
          "text": "Clear a floor of depth 5 or deeper, 2 rooms or more, without a potion or taking damage"
        }
```

Replace:

```json
      "type": "clearFloor",
      "filter": { "noPotion": true, "minDepth": "flag" },
      "count": { "easy": [1, 1], "normal": [2, 3], "hard": [4, 5] },
      "scope": "total",
      "text": "Clear {count} floor{s} of depth {depth} or deeper without a potion",
      "rewards": {
```

with:

```json
      "type": "clearFloor",
      "filter": { "noPotion": true, "minDepth": "flag", "minRoomsCleared": 2 },
      "count": { "easy": [1, 1], "normal": [2, 3], "hard": [4, 5] },
      "scope": "total",
      "text": "Clear {count} floor{s} of depth {depth} or deeper, {rooms} rooms or more, without a potion",
      "rewards": {
```

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
  // The floor's quest events: a boss counts here, once a floor, never as a kill (the quests spec's S4).
  const events: QuestEvent[] = [
    { type: 'clearFloor', biome: world.biomeId, depth: dive.depth, noPotion: !world.potionDrunk, noDamage: !world.hurt },
  ];
```

with:

```ts
  // The floor's quest events: a boss counts here, once a floor, never as a kill (the quests spec's S4).
  // A generated floor counts its cleared rooms (the open room clears whole).
  const rooms = world.map.open ? {} : { roomsCleared: world.map.rooms.filter((r) => r.cleared).length };
  const events: QuestEvent[] = [
    { type: 'clearFloor', biome: world.biomeId, depth: dive.depth, noPotion: !world.potionDrunk, noDamage: !world.hurt, ...rooms },
  ];
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-flow.test.ts tests/delve-quest-contracts.test.ts tests/delve-quests-content.test.ts)`
Expected: PASS, 24 tests.

- [ ] **Step 5: The typecheck and the whole suite**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 35** tests pass (5 skipped) in **F + 4** files (the quest suites included: an event without `roomsCleared` meets every filter, so their dives on the open room count as before).

- [ ] **Step 6: Commit** (`dive.ts` is hand-edited, never formatted)

```bash
cd /c/Projects/alloy-maps-b3
npx prettier --end-of-line auto --write packages/engine/src/types/quests.ts packages/engine/src/data/schemas.ts packages/engine/src/delve/quests.ts packages/engine/src/delve/contracts.ts packages/engine/src/data/quests.json packages/engine/tests/delve-maps-flow.test.ts packages/engine/tests/delve-quest-contracts.test.ts packages/engine/tests/delve-quests-content.test.ts
git add packages/engine/src/delve/dive.ts packages/engine/src/types/quests.ts packages/engine/src/data/schemas.ts packages/engine/src/delve/quests.ts packages/engine/src/delve/contracts.ts packages/engine/src/data/quests.json packages/engine/tests/delve-maps-flow.test.ts packages/engine/tests/delve-quest-contracts.test.ts packages/engine/tests/delve-quests-content.test.ts
git commit -m "feat(engine): a floor clear counts its rooms; the flag quests need minRoomsCleared" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The anvil alcove

### Task 7: `alcoveOffers` and `takeAlcove`

**Files:**
- Modify: `packages/engine/src/delve/stops.ts`, `packages/engine/tests/delve-maps-flow.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-maps-flow.test.ts`:

Replace:

```ts
import { bankWorld, beginFloor, completeFloor, startDive } from '../src/delve/dive.js';
import { profileStats } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { applyQuestEvents } from '../src/delve/quests.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
```

with:

```ts
import { bankWorld, beginFloor, completeFloor, startDive } from '../src/delve/dive.js';
import { profileStats, worldStats } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { applyQuestEvents } from '../src/delve/quests.js';
import { alcoveOffers, takeAlcove } from '../src/delve/stops.js';
import { generateItem } from '../src/loot/item-generator.js';
import { upgradeCost } from '../src/loot/smithing.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
```

Append at the end of the file:

```ts
describe('the anvil alcove', () => {
  const map = () => twoRooms('alcove', { kind: 'alcove' }, 1);
  /** The dive's floor with its alcove opened. */
  const opened = (p: DelveProfile) => {
    const w = floorOf(p, map());
    press(w);
    return w;
  };

  it('offers 2 or 3 of the kinds that apply, the same each time it opens; none once used', () => {
    const p = diving();
    const w = floorOf(p, map());
    expect(alcoveOffers(registry, p, w, '1:1')).toEqual(['equip', 'upgrade']);
    expect(alcoveOffers(registry, p, w, '1:1')).toEqual(alcoveOffers(registry, p, w, '1:1'));
    w.map.rooms[1].interactable!.used = true;
    expect(alcoveOffers(registry, p, w, '1:1')).toEqual([]);
    expect(alcoveOffers(registry, { ...p, dive: null }, floorOf(p, map()), '1:1')).toEqual([]);
  });

  it('takes one op, paid from banked, then the haul, then the stockpile; then it is used', () => {
    const p0 = diving();
    const cost = upgradeCost(registry, ring)!;
    const p: DelveProfile = {
      ...p0,
      dive: { ...p0.dive!, banked: { ...p0.dive!.banked, scrap: 5 } },
    };
    const w = opened(p);
    w.pending.scrap = cost - 3;
    const res = takeAlcove(registry, p, w, { kind: 'upgrade', uid: 'r1' });
    expect(res.ok).toBe(true);
    const dive = res.profile.dive!;
    expect([dive.banked.scrap, dive.haul.scrap, res.profile.scrap]).toEqual([0, 2, 1000]);
    expect(res.profile.bag[0].upgrade).toBe(1);
    expect(dive.used).toEqual(['1:1']);
    expect(w.map.rooms[1].interactable!.used).toBe(true);
    expect(takeAlcove(registry, res.profile, w, { kind: 'equip', uid: 'r1' })).toMatchObject({
      ok: false,
      reason: 'No anvil here',
    });
    const again = floorOf(res.profile, map());
    expect(press(again).some((e) => e.kind === 'interactPrompt')).toBe(false);
  });

  it("refreshes the hero with the new gear, keeping the floor's blessings", () => {
    const p = diving();
    const w = opened(p);
    applyShrine(registry, w, shrine('vigor'));
    const find = w.loot.find - w.hero.stats.magicFind;
    const res = takeAlcove(registry, p, w, { kind: 'equip', uid: 'r1' });
    expect(res.ok).toBe(true);
    expect(res.profile.equipped.ring?.uid).toBe('r1');
    expect(w.hero.stats).toEqual(worldStats(registry, res.profile, w));
    expect(w.hero.floorBuffs.map((b) => b.shrine)).toEqual(['vigor']);
    expect(w.loot.find).toBeCloseTo(find + w.hero.stats.magicFind, 9);
  });

  it('refuses an alcove not opened, a kind not offered, a failed op and a dive not fighting, touching nothing', () => {
    const p = diving();
    const shut = floorOf(p, map());
    expect(takeAlcove(registry, p, shut, { kind: 'equip', uid: 'r1' })).toMatchObject({
      ok: false,
      reason: 'No anvil here',
    });
    const w = opened(p);
    expect(takeAlcove(registry, p, w, { kind: 'slot', skill: 'primary' })).toMatchObject({
      ok: false,
      reason: 'Not offered at this anvil',
    });
    w.pending.scrap = 7;
    const failed = takeAlcove(registry, p, w, { kind: 'upgrade', uid: 'nope' });
    expect(failed.ok).toBe(false);
    expect(failed.profile).toBe(p);
    expect(w.pending.scrap).toBe(7);
    expect(w.map.rooms[1].interactable!.used).toBe(false);
    const choosing = { ...p, dive: { ...p.dive!, phase: 'choosing' as const } };
    expect(takeAlcove(registry, choosing, w, { kind: 'equip', uid: 'r1' }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-flow.test.ts)`
Expected: FAIL, **4 failed | 6 passed (10)** (the alcove's four): `alcoveOffers` throws "alcoveOffers: not implemented" and `takeAlcove` "takeAlcove: not implemented".

- [ ] **Step 3: The stop's picker shared, the alcove's offers and its one op**

In `packages/engine/src/delve/stops.ts`:

Replace:

```ts
import type { ArpgWorld } from '../types/arpg.js';
import { carriedByText, movesetOf } from '../loot/moveset.js';
import { upgradeCost } from '../loot/smithing.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { runeFits, socketsOf } from '../loot/runes.js';
import { emptyHaul, stockHaul } from '../loot/materials.js';
import type { Haul } from '../types/crafting.js';
```

with:

```ts
import type { ArpgWorld } from '../types/arpg.js';
import type { Interactable } from '../types/floor-map.js';
import { refreshWorldHero } from '../arpg/world.js';
import { carriedByText, heroChains, movesetOf } from '../loot/moveset.js';
import { upgradeCost } from '../loot/smithing.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { runeFits, socketsOf } from '../loot/runes.js';
import { addHaul, emptyHaul, stockHaul } from '../loot/materials.js';
import type { Haul } from '../types/crafting.js';
```

Replace:

```ts
import { runeTargetOf, socketRune } from './runes.js';
```

with:

```ts
import { runeTargetOf, socketRune } from './runes.js';
import { bankWorld } from './dive.js';
import { openedAlcove } from '../arpg/interact.js';
import { profileStats } from './pair.js';
```

Replace:

```ts
  if (kinds.length === 0) return null;
  const rng = new SeededRNG(dive.seed).fork(`stop:${dive.depth}`);
  const count = rng.nextInt(2, 3);
```

with:

```ts
  if (kinds.length === 0) return null;
  return {
    offers: pickKinds(kinds, new SeededRNG(dive.seed).fork(`stop:${dive.depth}`)),
    taken: false,
  };
}

/** 2 or 3 of `kinds` at random on `rng` (all of them when fewer), in their order. */
function pickKinds(kinds: StopKind[], rng: SeededRNG): StopKind[] {
  const count = rng.nextInt(2, 3);
```

Replace:

```ts
  const picked = new Set(pool.slice(0, count));
  return { offers: kinds.filter((k) => picked.has(k)), taken: false };
}
```

with:

```ts
  const picked = new Set(pool.slice(0, count));
  return kinds.filter((k) => picked.has(k));
}
```

Replace:

```ts
export function alcoveOffers(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _world: ArpgWorld,
  _id: string,
): StopKind[] {
  throw new Error('alcoveOffers: not implemented');
}

/**
 * Take an alcove's one op mid-floor (while the dive is fighting): the world
 * banked first, the op run with the dive lock lifted as `takeStop` runs it,
 * paid from `banked` and the haul, then the stockpile; the alcove marked used
 * and the hero refreshed (`worldStats`).
 */
export function takeAlcove(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _world: ArpgWorld,
  _action: StopAction,
): ProfileActionResult {
  throw new Error('takeAlcove: not implemented');
}
```

with:

```ts
export function alcoveOffers(
  registry: DataRegistry,
  profile: DelveProfile,
  world: ArpgWorld,
  id: string,
): StopKind[] {
  const dive = profile.dive;
  const alcove = alcovesOf(world).find((a) => a.id === id);
  if (!dive || !alcove) return [];
  // What the floor has hauled pays too: pooled with the banked (`stopKinds` pools `banked`).
  const hauled = { ...profile, dive: { ...dive, banked: addHaul(dive.banked, dive.haul) } };
  return pickKinds(stopKinds(registry, hauled), new SeededRNG(dive.seed).fork(`alcove:${id}`));
}

/** The world's alcoves not yet used. */
function alcovesOf(world: ArpgWorld): Interactable[] {
  return world.map.rooms
    .map((r) => r.interactable)
    .filter((i): i is Interactable => i?.kind === 'alcove' && !i.used);
}

/**
 * Take the one op of the alcove last opened on `world` (`openedAlcove`)
 * mid-floor, while the dive is fighting: its kind must be among `alcoveOffers`
 * for this profile. The world banks first (`bankWorld`), then the op runs at
 * its price with the dive lock lifted as `takeStop` runs it, paid from
 * `banked` (as at a stop), then the floor's haul, then the stockpile. A refusal
 * leaves the profile and the world as they were (the alcove open, nothing
 * banked); an op taken marks the alcove used (`DiveState.used` and the
 * world's) and refreshes the hero (`refreshWorldHero` with the new gear and
 * chains, its blessings kept; a changed Find moves `world.loot.find`).
 */
export function takeAlcove(
  registry: DataRegistry,
  profile: DelveProfile,
  world: ArpgWorld,
  action: StopAction,
): ProfileActionResult {
  const h = world.hero;
  const alcove = alcovesOf(world).find((a) => a.id === openedAlcove(world));
  const live = profile.dive?.phase === 'fighting' && !profile.dive.settled;
  if (!live || !alcove) return { ok: false, profile, reason: 'No anvil here' };
  if (!alcoveOffers(registry, profile, world, alcove.id).includes(action.kind))
    return { ok: false, profile, reason: 'Not offered at this anvil' };
  const pending = world.pending;
  const banked = bankWorld(registry, profile, world).profile;
  const dive = banked.dive!;
  const withHaul = pooled({ ...banked, dive: { ...dive, banked: dive.haul } });
  const res = runStop(registry, { ...pooled({ ...withHaul, dive }), dive: null }, action);
  if (!res.ok) {
    world.pending = pending; // a refusal leaves the world as it was
    return { ...res, profile };
  }
  // `banked` pays first, as at a stop, then the haul, then the stockpile.
  const fromBanked = unpool(withHaul, res.profile, dive.banked);
  const fromHaul = unpool(banked, fromBanked.profile, dive.haul);
  alcove.used = true;
  const next: DelveProfile = {
    ...fromHaul.profile,
    dive: {
      ...dive,
      banked: fromBanked.banked,
      haul: fromHaul.banked,
      used: [...dive.used, alcove.id],
    },
  };
  const find = h.stats.magicFind;
  refreshWorldHero(
    registry,
    world,
    profileStats(registry, next),
    heroChains(registry, next.equipped, next.pair),
  );
  world.loot.find += h.stats.magicFind - find;
  return { ...res, profile: next };
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-flow.test.ts tests/delve-stops.test.ts)`
Expected: PASS, 10 flow tests and the stops' tests unchanged (`rollStop` draws exactly as before through `pickKinds`).

- [ ] **Step 5: The typecheck and the whole suite**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 39** tests pass (5 skipped) in **F + 4** files (1941 | 5 skipped in 115 | 1 skipped at the base's counts).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-maps-b3
npx prettier --end-of-line auto --write packages/engine/src/delve/stops.ts packages/engine/tests/delve-maps-flow.test.ts
git add packages/engine/src/delve/stops.ts packages/engine/tests/delve-maps-flow.test.ts
git commit -m "feat(engine): the anvil alcove's offers and its one op" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

- [ ] **The engine:** `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`: no type errors; **N + 39** tests pass (5 skipped) in **F + 4** files, the pacing rails unchanged (every hook returns at once on the open room; nothing turns the generated map on).
- [ ] **The bundle and the client:** `(cd packages/engine && npx tsup)`, then `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`: "Build success"; no type errors; the client suite unchanged (**1256 tests in 154 files** at the base's counts). The client reads none of B3's new names yet (C2's).
- [ ] **Nothing else moved:** `git diff --stat maps/main` lists only the files in **Files**.
- [ ] **The spec's lists, covered:** Interactions: the vault's drops and its replay (Tasks 2, 5); shrine buffs, floor and dive, and the channel's cancel (Tasks 2, 5); the alcove's one op and its replay (Task 7); the exit's request, `exitFloor`, the boss gate, `clearFloor` with `roomsCleared`, foes left behind (Tasks 1, 2, 6). Fog: reveal by sight and by room, `fogVersion`, the exit hint, on `world.t` marks (Task 3). Grid physics' sealing and the room vacuum (Tasks 4, 1).
