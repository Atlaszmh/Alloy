# Delve floor maps · B4: the bot and the pacing rails (engine) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the generated dives on. The bot (`arpg/bot.ts`) learns generated floors: it walks by flow fields to what it wants, explores when no foe is in sight (`nearestMonster` returns only foes in sight), and plays one of two policies, **thorough** (every room, every foe, what it sees on the floor, the chests, the shrines and the alcove, then the exit) and **beeline** (the exit, fighting only what comes at it); it presses `interact` at what it uses, and its loop (`botStep`, exported from `delve/autopilot.ts`) answers the gate's `exitRequest` with `exitFloor` and an alcove's `alcoveOpen` with `takeBestAlcove(registry, profile, world, id)` (C2's Task 9 imports it). `playFloor` ends a floor on `world.exited`, `maxFloorSeconds` rises to 420, and then `delve.layout.generatedDives` goes on. The tests that played a dive floor to its end follow the spec's floor (the exit, not every foe dead; drops picked up, not vacuumed through walls), and the pacing rails are re-measured and re-banded on generated floors: a beeline and a full clear each in a floor-time band, a beeline's depth at least 80% of a full clear's, the pinned seeds re-picked, and the run time budgeted (the forced-pair sweep in its own file, four dives).

**Architecture:** All of the bot's new behaviour is a no-op on the open room (`world.map.open`): its target pick, movement and casts there are today's exactly, so the whole-autopilot fingerprint is bit-identical after Task 1 and only Task 2's switch moves a number. On a generated floor: `foeInSight` keeps after the foe it last went after (even round a wall's edge) unless one in sight is `SWITCH` (3) nearer; `foeFor` lets a beeline fight only foes awake within `BEELINE_FIGHT` (8) and out of their den, or anything in a room it is sealed in; a thorough bot with no potions left plays as a beeline. With no foe to fight, `explore` picks a `Goal` (a point and a flow field toward it): sealed in, the room's foes; a beeline's `gateGoal` (the gate once its room is found or hinted, the boss while it keeps it shut, else the nearest room not yet entered, dens last); a thorough bot's `thoroughGoal` (drops in seen cells, foes of entered rooms, unused chests, shrines and alcoves, rooms not entered, then the gate). Fields come from B2's `flowField` over `heroMap(map)` (the map with every one-cell gap walled: the grid holds the hero's bounding square, radius 0.5, so a one-cell gap between pillars is passable only dead on its centre line) and are cached per world and target cell until a door opens or shuts (`fieldTo`); `walk` steps down one with B2's `downhill`, first sidestepping onto its cell's centre line when a wall's edge holds the bounding square. Candidates are ranked by `world.flow.small` (B2's field toward the hero, so by path within `ai.flowRadius`), then in a straight line. `takeBestAlcove` runs the stop's ladder (`bestStop`, `takeBestStop`'s body) on a dry run through `takeStop` (the profile as if at a stop offering the alcove's kinds, its haul banked) and takes the pick through B3's `takeAlcove`.

**Tech Stack:** TypeScript 5.7, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-03-delve-floor-maps-design.md` (authoritative): "The autopilot and pacing", "Interacting, special rooms and the exit" (the exit gate, the anvil alcove), "Testing" (Determinism: bank-timing invariance on generated floors), "Data and tuning" (`maxFloorSeconds`), "Phases and parallel areas" (the B4 row). The overview is `00-overview.md` in this folder ("Integrator notes": B1 revised / X4, B3's B4 note, B2's notes); B1's, B2's and B3's plans (`02-generator.md`, `03-physics-ai.md`, `04-floor-flow.md`) say what this builds on.

---

## Base

- **Starts from:** `maps/main` at `010417cf` (Phase A, B1, C2, C1, B3 and B2 merged; generated dives wait behind `delve.layout.generatedDives`, off), in this area's worktree `C:/Projects/alloy-maps-b4` on branch `maps/b4`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-maps-b4 -Branch maps/b4 -Base maps/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-maps-b4` in Git Bash. B2's flow-field tests are `tests/delve-maps-flowfield.test.ts` there (B3 owns `delve-maps-flow.test.ts`).
- **Needs:** B1 (the generator, `generatedDives`), B2 (`flowField`, `downhill`, `world.flow`, sight-only `nearestMonster`, the drops' `roomId`), B3 (`interactTick`, `exitFloor`, `exitRequest`, `alcoveOffers`, `takeAlcove`, `openedAlcove`, `roomAt`, seals, fog, `completeFloor` on `exited`). All merged at the base.
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-maps-b4
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's three "Build success" lines; no type errors; the engine suite reads **1995 passed | 5 skipped tests in 125 passed | 1 skipped files** (the pacing rails included, about 70 s), the client suite **1300 tests in 157 files**. Call them **N** engine tests in **F** files.

## Files

| File | Change |
|---|---|
| `packages/engine/src/arpg/bot.ts` | `BotPolicy`; `botInput(registry, world, policy = 'thorough')`: on a generated floor the prayer, the kept foe, the policies, flow-field movement and `explore` (Task 1) |
| `packages/engine/src/delve/autopilot.ts` | `botStep`, `takeBestAlcove`, `bestStop` (`takeBestStop`'s ladder); `playFloor` ends on `exited`; `AutopilotOptions.policy` (Task 1); `maxFloorSeconds` 420, `pickDoor` extracts for an essence only with the epic flux to forge it (Task 2). Hand-edited, never formatted |
| `packages/engine/src/index.ts` | exports `takeBestAlcove` (Task 1) |
| `packages/engine/src/data/balance.json` | `delve.layout.generatedDives` true (Task 2). Hand-edited, never formatted |
| `packages/engine/tests/delve-maps-bot.test.ts` (new) | the bot on generated floors: thorough, beeline, the gate, the alcove, a one-cell gap (Task 1) |
| `packages/engine/tests/delve-maps-contract.test.ts` | Phase A's "a dive floor is open too…" flipped: a dive floor is generated (Task 2) |
| `packages/engine/tests/delve-maps-generate.test.ts` | B1's "stays the open room while generatedDives is off" flipped (Task 2) |
| `packages/engine/tests/delve-maps-flow.test.ts` | B3's rooms-cleared test builds its open room itself (Task 2) |
| `packages/engine/tests/delve-banking.test.ts`, `delve-dive.test.ts` | `clearFloor` walks the hero over each drop; the bot loops end on `exited` through `botStep`; seeds 8 → 61 and 39 (Task 2) |
| `packages/engine/tests/delve-pacing.test.ts` | the beeline runs, the floor-time bands, the rushing rail; the forced-pair sweep moves out (Task 2). Hand-edited, never formatted |
| `packages/engine/tests/delve-pacing-pairs.test.ts` (new) | the forced-pair sweep, four dives (Task 2) |
| `packages/engine/tests/fixtures/pacing.ts` | `essenceForgedAtOnce` finds the first boss's essence by its epic flux (Task 2). Hand-edited, never formatted |
| `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts` | the channelled cast aims (B1's X6) (Task 3) |
| `packages/client/src/features/delve/__tests__/floor-engine.test.ts` | its "open arena" builds the open room itself (Task 3) |

Of these, `delve-maps-contract`, `-generate`, `-flow`, `arena-hud-snapshot` and `floor-engine` are Phase A's, B1's, B3's, C2's and C1's tests: the switch breaks them (they read "a dive floor" as the open room), so they change in the switch's own commits, as B1's X4 and X6 asked; their areas are merged and nothing else in them changes.

## Cross-area needs

**X1 · B3 (`arpg/seal.ts`): a den's own foe can be shut out of it (a softlock).** After `ai.sealGrace` a circle still in a doorway goes to a free cell "on its side"; a den's own foe standing in the doorway goes outside, the doors close, and the room can never unseal (its last foe can't reach the hero, nor the hero it). Seen once in ~600 bot floors (seed 22, depth 13, a 5-dive hero, beeline: sealed for the rest of the floor; `maxFloorSeconds` counts it a death). The fix, checked on the scratch copy (the floor then exits in 15 s): in `sealTick`, replace

```ts
      if (late) Object.assign(c, freeSpot(map, room, doors, c, inside(room.rect, c)));
```

with

```ts
      // The room's own foes go inside, whichever side of the door they stand.
      const own = c !== h && (c as { roomId?: number | null }).roomId === room.id;
      if (late) Object.assign(c, freeSpot(map, room, doors, c, own || inside(room.rect, c)));
```

  Nothing in this plan depends on it (no rail or pinned seed hits it).

**X2 · B3 (`arpg/fog.ts`), optional, run time.** `fogTick` and `lineOfSight` (mostly its calls) are about 36% of a generated floor's sim time, `flowField` (the foes' fields and the bot's) about 14%. Recomputing sight only when the hero's cell or a door's state changed (and taking sight from the cell's centre so the cache is exact) cut a forced-pair run by 32% on the scratch copy, the same depths. The engine suite runs about 3.7 min after Task 2 (about 70 s before); this would bring it near 2.6.

**X3 · C2 Task 9.** `takeBestAlcove(registry, profile, world, id): DelveProfile` is exported from `src/index.ts` with exactly C2's X2 signature; it returns the profile it was given (the same object) when the alcove offers nothing or the ladder takes nothing, so the client can test `!==`. The client's autopilot calls `botInput(registry, world)` (policy `thorough` by default). The bot keeps two `WeakMap`s keyed on the world (the foe it chases, its flow fields): one world per floor, as the client keeps.

**X4 · Phase D (E2E, docs, balance).**
1. **E2E D02** (`e2e/delve.spec.ts`): `seedProfile(page, 8)` → `seedProfile(page, 39)` and its comment ("seed 39's first floor … drops gear at any frame rate"): seed 8's first generated floor drops no gear; seed 39's drops 3 pieces, the first 7 s in, and the bot takes the exit at 54 s (pinned by Task 2's banking test). Every autopilot E2E dive now ends floors at the gate: a depth-1 floor takes the thorough bot 30–65 s of sim time.
2. **CLAUDE.md** (the Delve section): the bot's policies and `explore` (`arpg/bot.ts`), `botStep` and `takeBestAlcove` (`delve/autopilot.ts`), `playFloor` ending on `exited`, `maxFloorSeconds` 420, `pickDoor`'s essence rule, `AutopilotOptions.policy`; "Pacing guard rails": the forced-pair sweep is `tests/delve-pacing-pairs.test.ts`, four dives over eight seeds; the floor-time bands and the rushing rail; the measured numbers below (they replace "Measured at v0.58.0 / v0.59.0" lines where those described the open room).
3. **The spec's floor-time bands are a player's, not the bot's** (see "Where the spec left room" 1): if the user wants the bot's floors in 45–90 s and 120–180 s, that is about 2.7 times today's content per floor (rooms, packs or map size in `delve.layout`), a balance pass.
4. **Rushing out-paces clearing a little** (measured below: a beeline's dive-12 depth is 97–98% of a full clear's): the extra rooms' loot doesn't buy depth. A balance question for Phase D's Economy pass, not a rail failure.

**X5 · B1 / B2, observations (no edit needed here).**
1. Pillar masks leave one-cell gaps (e.g. `##44#4#44#4#44`): a hero (radius 0.5, its bounding square on the grid) passes one only exactly on its centre line, so players will snag there too. The bot walls them off in its own map (`heroMap`). A mask rule "no one-cell gap" (B1) or a hero radius under 0.5 would remove the trap.
2. `clearanceOf` makes every foe with radius over 0.5 `large` (the base monster radius is 0.55, so nearly all of them): a large foe needs a 3 × 3 square, so pillar gaps and two-wide gaps hold it in place; awake foes standing still behind pillars were common in the traces. The bot walks to them, so nothing here depends on it.
3. B2's `tests/delve-maps-fight.test.ts` still says "`delve.layout.generatedDives` is off as shipped" in a comment; stale after Task 2 (left for the integrator or D: the file is otherwise untouched).

## Where the spec left room

1. **The floor-time bands.** The spec's "beeline 45–90 s, full clear 120–180 s" (decision 3's "a beeline ~45–90 s, a full clear ~2–3 min") are a player's times. The bot knows where rooms are, never hesitates and fights efficiently: measured over the rails' runs it clears a floor in about 42 s and rushes one in about 28–30 s (a ratio of 1.4–1.5, the spec's midpoints 2.2). The rails band the bot's own times around what it measures (full clear 30–60 s, beeline 20–45 s, a full clear at least 1.25 × a beeline), with the formula the old "snackable" rail used (each dive's floor seconds over its floors, a death's floor counted). See X4.3.
2. **What the bot knows.** Both policies read the map's room list (where the unentered rooms are, as a player reads the halls) and the room kinds; neither reads foes it can't see, except the foe it last went after and, thorough, the foes of rooms it has entered. A beeline doesn't know the exit: it explores the nearest unentered room (dens last) until the exit's room is entered or the exit hint fires (`world.exitHinted`), then makes for the gate. Drops count once their cell has been seen (`fog > 0`).
3. **"Fight what blocks it."** A beeline fights a foe that is awake, within 8 units (edge) and not standing in its den, or any foe of a room it is sealed in; it never follows one into a den. A thorough bot with no potions left plays as a beeline for the rest of the floor (a sensible player, spent, makes for the exit); with these two rules every seed's first dive clears the opening floors again (16 of 16 seeds; seed 1 died in a depth-2 den without them).
4. **The rushing rail's x** is 80%: a beeline's dive-12 depth at least 0.8 × a full clear's (measured 0.97).
5. **Runtime.** On generated floors a sim second costs about 3.4 times the open room's (fog and flow, X2) and floors run longer, so the old pacing file would take about 5 min. The forced-pair sweep moves to its own file (Vitest runs files in parallel) and drops to four dives: its spread over eight seeds is the same by dive 4 (0.82–1.28 × the median) as by dive 6 (0.82–1.23); four seeds were too close to the 0.6 floor (0.68). The engine suite runs about 3.7 min.
6. **Extracting for an essence.** `pickDoor` extracted on any banked essence; vaults now bank random ones (`drops.vault.essenceChance`), which ended first dives at depth 1–2 for an essence nothing could forge yet. A banked essence is never lost (death loss exempts essences), so it now extracts for an essence only when the stockpile holds the epic flux to forge it (epic flux in `banked` still extracts at once).
7. **The pacing fixture's "first essence".** `essenceForgedAtOnce` looked at the first dive that banked any essence; a vault's can now come first. The target is the first boss's essence, which comes with an epic flux, so the fixture finds the first dive that brought both.
8. **The banking and dive tests' `clearFloor`.** It killed every foe and let the vacuum bring the drops; on a generated floor the vacuum slides drops straight at the hero and walls stop them (B2), so the helper now walks the hero over each drop in turn (sets its position). What the tests assert is unchanged.
9. **`takeBestAlcove`'s dry run** fakes the stop the way C2's `atStop` does (`phase: 'choosing'`, `stop.offers` the alcove's) and pools the floor's haul into `banked`, so the ladder sees what `takeAlcove` will spend (B3: `banked`, then the haul, then the stockpile). The ladder never takes `move`, as at a stop.
10. **`maxFloorSeconds`** rises to 420 in Task 2 with the switch (Task 1 keeps 240, so the open room's fingerprint holds through Task 1).

### Measured (the scratch copy after Task 2; Fire unless named; eight seeds unless named)

| | dive 1 | dive 6 | dive 9 | dive 12 | s / floor | dives that die |
|---|---|---|---|---|---|---|
| thorough (the autopilot's default) | 3.4 (min 3) | 24.0 | 34.3 | 41.3 | 41.1 | 55% |
| beeline | 3.5 (min 3) | 23.9 | 35.0 | 40.4 | 30.5 | 71% |
| thorough, Frost | 4.3 (min 3) | 27.4 | 37.6 | 43.9 | 44.0 | 49% |
| the open room (v0.59.0's autopilot) | 3.0 | 17.6 | 27.4 | 35.8 | 23.1 | ~70% |

- **The rails' own seeds** (1–4; Frost 1–2): full clear 42.3 s a floor, beeline 28.2 s; dive 12 at 45.3 (thorough) and 43.8 (beeline); dive 1 at 4, 4, 3, 3.
- **The forced pairs** (eight seeds, dive 4): median 19.0, every pair 0.82–1.28 × it (Storm+Fire and Earth+Shadow highest, Earth+Frost and Storm+Nature lowest).
- **The economy** (`economySim`, eight seeds, 12 dives): the first epic forged after dive 2 or 3 (mean 2.6; the same bot on the open room 3.1); the first boss's essence forged on the visit after its dive, 8 of 8; kept scrap +22% and epic flux +60% over the open room (vaults' flux); the crafting targets and the robust levers (±20%) all hold.
- **Single floors** (20 seeds, a 5-dive hero, every other depth to its best, both policies): 388 floors, every one ended at the gate; a full clear's mean 25.3 s, a beeline's 15.4 s. The one floor that ever ran out the clock in these sweeps is X1's.

## Conventions

The overview's shared conventions and Phase A's. In short:
- **One commit per task** on `maps/b4`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-maps-b4`.
- **Line endings:** keep each file's own (the Edit tool does); new files are LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** every file a commit block formats passed `prettier --check` at the base or is new. `src/delve/autopilot.ts`, `src/data/balance.json`, `tests/delve-pacing.test.ts` and `tests/fixtures/pacing.ts` are not clean at the base: hand-edited only, never formatted. The code below is already Prettier-formatted (checked on the scratch copy), so `--write` changes nothing if typed as written.
- **How the edits read** (Phase A's language): "In `f`:" names the file for the edits under it. "Replace:" (a block) "with:" (a block) is one Edit (old, new). "Append at the end of the file:" adds a blank line and the block after the last line. "Create `f`:" is a Write. Within a file, apply its edits top to bottom; every old block is unique in its file at that point.
- **Determinism:** the bot draws no random numbers; its memory (the foe it chases, its fields) is per world and filled in the order the sim asks, so a seeded floor plays the same at any frame rate (Task 2's bank-timing and E2E-seed tests run 60, 45, 30 and 20 frames a second).
- **Parity in Task 1:** every new branch is behind `!world.map.open`, so the open room plays as before: on the scratch copy the whole-autopilot fingerprint (Fire, Frost and Storm × seeds 1–2 × 4 dives, every report and the final profile hashed) was identical at the base and after Task 1.
- **Import cycles:** `arpg/bot.ts` now imports `interact.ts`, `fog.ts`, `flow.ts` and `grid.ts` (none imports the bot); `delve/autopilot.ts` imports `arpg/interact.ts` and `stops.ts`' `alcoveOffers` / `takeAlcove`, read only inside functions.
- **Checked on a scratch copy:** a clone of `maps/main` at `010417cf` with junctioned `node_modules`; each task's edits applied in order (every old block unique where it applies), test edits first (each FAIL below is what it printed), then the source (each PASS, suite count, typecheck and `prettier --check` below ran on those trees); the edit blocks were checked to rebuild each task's files exactly from the base.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine bundle (the client's) | `(cd packages/engine && npx tsup)` |
| Client tests | `(cd packages/client && npx vitest run)`, or some files: `(cd packages/client && npx vitest run <paths>)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |

---

## Chunk 1: The bot on generated floors

### Task 1: The bot walks generated floors, takes the exit and the alcove

**Files:**
- Create: `packages/engine/tests/delve-maps-bot.test.ts`
- Modify: `packages/engine/src/arpg/bot.ts`, `packages/engine/src/delve/autopilot.ts`, `packages/engine/src/index.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-maps-bot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { BotPolicy } from '../src/arpg/bot.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { botStep, takeBestAlcove } from '../src/delve/autopilot.js';
import { beginFloor, startDive } from '../src/delve/dive.js';
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
    // Used, it offers nothing: the profile comes back as it was.
    expect(takeBestAlcove(registry, p, w, '1:1')).toBe(p);
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
```

(The floors: seeds 4, 17 and 19 at depth 1 each hold one chest or shrine; seed 19's beeline leaves 7 foes and a room unentered and is out at 37 s against the full clear's 55 s. `twoRooms` and `floorWorld` are B3's fixture: room 1's interactable and the exit at (19, 6). The last test's one-cell gap at x 6 is straight above the hero, and the foe is in sight through it.)

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-bot.test.ts)`
Expected: FAIL, 5 of 5: `TypeError: (0 , botStep) is not a function`.

- [ ] **Step 3: The bot**

In `packages/engine/src/arpg/bot.ts`:

Replace:

```ts
import type { ArpgInput, ArpgWorld, Vec } from '../types/arpg.js';
import { makeCtx } from './combat.js';
import { dirTo, dist } from './geometry.js';
import { abilityReady, holdCharge, nextMove } from './abilities/cast.js';
import { nearestMonster } from './abilities/targeting.js';
```

with:

```ts
import type { ArpgInput, ArpgWorld, MonsterEntity, Vec } from '../types/arpg.js';
import type { FloorMap, Room } from '../types/floor-map.js';
import { makeCtx } from './combat.js';
import { dirTo, dist } from './geometry.js';
import { abilityReady, holdCharge, nextMove } from './abilities/cast.js';
import { nearestMonster } from './abilities/targeting.js';
import { UNREACHED, downhill, flowField } from './flow.js';
import { moveCircle, sees } from './grid.js';
import { roomAt } from './fog.js';
import { openedAlcove } from './interact.js';

/**
 * How the bot plays a generated floor (see the floor maps spec's "The autopilot
 * and pacing"): `thorough` clears every room, picks up what it sees, opens the
 * chests, prays at the shrines and opens the alcove, then takes the exit;
 * `beeline` makes for the exit, fighting only foes awake near it and what a
 * sealed room shuts it in with.
 */
export type BotPolicy = 'thorough' | 'beeline';

/** How near (edge) an awake foe must be for a beeline to turn and fight it. */
const BEELINE_FIGHT = 8;
```

Replace:

```ts
 * charges to full before it lets go (the bot never taps one). Drives the pacing
 * tests.
 */
export function botInput(registry: DataRegistry, world: ArpgWorld): ArpgInput {
```

with:

```ts
 * charges to full before it lets go (the bot never taps one). On a generated
 * floor it walks by flow fields, plays `policy` (`explore`) and presses
 * interact at what it uses; its loop answers `exitRequest` and `alcoveOpen`
 * (`botStep`). Drives the pacing tests.
 */
export function botInput(
  registry: DataRegistry,
  world: ArpgWorld,
  policy: BotPolicy = 'thorough',
): ArpgInput {
```

Replace:

```ts
  const target = nearestMonster(ctx, h.x, h.y, 60);
  if (!target) {
```

with:

```ts
  // A prayer holds still until it is said.
  if (world.channel) return input;

  // Spent (no potions left), a thorough bot makes for the exit.
  const plan = h.potions === 0 ? 'beeline' : policy;
  const target = foeFor(world, foeInSight(world, nearestMonster(ctx, h.x, h.y, 60)), plan);
  if (!world.map.open) chasing.set(world, target?.id ?? null);
  if (!target) {
    if (!world.map.open) return explore(registry, world, input, plan);
```

Replace:

```ts
  let move: Vec = { x: 0, y: 0 };
  if (w.kind === 'melee') {
    if (gap > w.range * 0.8) move = dirTo(h.x, h.y, target.x, target.y);
  } else if (gap > w.range * 0.8) move = dirTo(h.x, h.y, target.x, target.y);
```

with:

```ts
  let move: Vec = { x: 0, y: 0 };
  // Out of reach, or out of sight round a wall's edge: go to it.
  const far = gap > w.range * 0.8 || !sees(world.map, h, target);
  if (w.kind === 'melee') {
    if (far) move = toward(world, target);
  } else if (far) move = toward(world, target);
```

Replace:

```ts
    if (item) move = dirTo(h.x, h.y, item.x, item.y);
```

with:

```ts
    if (item) move = toward(world, item);
```

Append at the end of the file:

```ts
/**
 * The foe the bot fights: any for `thorough`; for a beeline one awake and near
 * that isn't in its den, or any in a room it's shut in.
 */
function foeFor(
  world: ArpgWorld,
  foe: MonsterEntity | null,
  policy: BotPolicy,
): MonsterEntity | null {
  if (!foe || world.map.open || policy === 'thorough') return foe;
  if (foe.roomId === shutIn(world)?.id) return foe;
  const h = world.hero;
  const near = foe.aggro && dist(h.x, h.y, foe.x, foe.y) - foe.radius <= BEELINE_FIGHT;
  return near && roomAt(world.map, foe.x, foe.y)?.kind !== 'den' ? foe : null;
}

/** Each world's foe the bot last went after (none in the open room). */
const chasing = new WeakMap<ArpgWorld, number | null>();

/** How much nearer than the foe it is after another must be for the bot to turn to it. */
const SWITCH = 3;

/**
 * The foe to go after: the one it last went after while it lives, even out of
 * sight round a wall's edge, unless `seen` is `SWITCH` nearer; else `seen`.
 */
function foeInSight(world: ArpgWorld, seen: MonsterEntity | null): MonsterEntity | null {
  const id = chasing.get(world);
  const last = world.monsters.find((m) => m.id === id && !m.dead);
  if (!last) return seen;
  const h = world.hero;
  const nearer = seen && dist(h.x, h.y, seen.x, seen.y) < dist(h.x, h.y, last.x, last.y) - SWITCH;
  return nearer ? seen : last;
}

/** The room sealed (or sealing) round the hero, if any. */
function shutIn(world: ArpgWorld): Room | undefined {
  const room = roomAt(world.map, world.hero.x, world.hero.y);
  return room && (room.sealed || world.sealing?.roomId === room.id) ? room : undefined;
}

/**
 * Each world's map as the hero walks it (`heroMap`) and the bot's flow fields
 * on it toward the cells it walks to, kept until a door opens or shuts.
 */
const paths = new WeakMap<
  ArpgWorld,
  { map: FloorMap; doors: string; byCell: Map<number, Uint16Array> }
>();

/**
 * `map` with every one-cell gap walled (a floor cell with a wall on each side
 * across it, as between two pillars): the hero's bounding square (radius 0.5)
 * passes one only dead on its centre line, which a step at its pace rarely
 * lands on.
 */
function heroMap(map: FloorMap): FloorMap {
  const { width: w, height: h } = map;
  const wall = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h || map.cells[y * w + x] === 1;
  const cells = map.cells.slice();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const squeezed = (wall(x - 1, y) && wall(x + 1, y)) || (wall(x, y - 1) && wall(x, y + 1));
      if (cells[y * w + x] === 0 && squeezed) cells[y * w + x] = 1;
    }
  return { ...map, cells };
}

function cellOf(world: ArpgWorld, p: Vec): number {
  const { width: w, height: h } = world.map;
  const cx = Math.min(w - 1, Math.max(0, Math.floor(p.x)));
  const cy = Math.min(h - 1, Math.max(0, Math.floor(p.y)));
  return cy * w + cx;
}

/** A flow field over the hero's map toward `p`'s cell, as the doors stand now. */
function fieldTo(world: ArpgWorld, p: Vec): Uint16Array {
  const doors = world.map.doors.map((d) => (d.closed ? 1 : 0)).join('');
  let kept = paths.get(world);
  if (!kept || kept.doors !== doors)
    paths.set(world, (kept = { map: kept?.map ?? heroMap(world.map), doors, byCell: new Map() }));
  const cell = cellOf(world, p);
  let field = kept.byCell.get(cell);
  if (!field) {
    field = flowField(kept.map, p, world.map.width * world.map.height, 1);
    kept.byCell.set(cell, field);
  }
  return field;
}

/** Steps down `field` from the hero (from a neighbour when it stands in a walled gap); UNREACHED if none. */
function stepsFrom(world: ArpgWorld, field: Uint16Array): number {
  const { width: w, height: h } = world.map;
  const c = cellOf(world, world.hero);
  const x = c % w;
  let best = field[c];
  if (x > 0) best = Math.min(best, field[c - 1] + 1);
  if (x < w - 1) best = Math.min(best, field[c + 1] + 1);
  if (c >= w) best = Math.min(best, field[c - w] + 1);
  if (c < w * (h - 1)) best = Math.min(best, field[c + w] + 1);
  return Math.min(best, UNREACHED);
}

/** The way to `p`: straight in the open room; on a generated floor, down a flow field toward its cell. */
function toward(world: ArpgWorld, p: Vec): Vec {
  const h = world.hero;
  if (world.map.open) return dirTo(h.x, h.y, p.x, p.y);
  return walk(world, fieldTo(world, p), p);
}

/**
 * Down `field` toward `p` (straight at it where the field doesn't reach). A
 * hero square-on to a wall's edge across its way (the grid holds its bounding
 * square) first steps sideways onto its cell's centre line.
 */
function walk(world: ArpgWorld, field: Uint16Array, p: Vec): Vec {
  const h = world.hero;
  const d = downhill(world.map, field, h, p) ?? dirTo(h.x, h.y, p.x, p.y);
  const probe = 0.1;
  const to = moveCircle(world.map, h, h.radius, d.x * probe, d.y * probe);
  const held = (along: number, moved: number) =>
    Math.abs(along) > 0.5 && Math.abs(moved) < Math.abs(along) * probe * 0.5;
  const centre = (v: number) => Math.floor(v) + 0.5 - v;
  if (held(d.y, to.y - h.y) && Math.abs(centre(h.x)) > 1e-3)
    return { x: Math.sign(centre(h.x)), y: 0 };
  if (held(d.x, to.x - h.x) && Math.abs(centre(h.y)) > 1e-3)
    return { x: 0, y: Math.sign(centre(h.y)) };
  return d;
}

/** Where the bot walks next on a generated floor, and the field that leads there; `use` presses interact on arrival. */
interface Goal {
  at: Vec;
  field: Uint16Array;
  use?: boolean;
}

/**
 * The nearest of `points` the hero can walk to, by path where the foes' field
 * toward the hero reaches (`flow.small`, `ai.flowRadius` steps), else in a
 * straight line; null if none.
 */
function nearestReachable(world: ArpgWorld, points: Vec[]): Goal | null {
  const h = world.hero;
  const steps = (p: Vec) => world.flow.small?.[cellOf(world, p)] ?? UNREACHED;
  const sorted = [...points].sort(
    (a, b) => steps(a) - steps(b) || dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y),
  );
  for (const at of sorted) {
    const field = fieldTo(world, at);
    if (stepsFrom(world, field) !== UNREACHED) return { at, field };
  }
  return null;
}

/** The nearest by path of `rooms`: their centres, or their interactables when `use`. */
function nearestRoom(world: ArpgWorld, rooms: Room[], use = false): Goal | null {
  let best: (Goal & { steps: number }) | null = null;
  for (const room of rooms) {
    const { x, y, w, h } = room.rect;
    const at = (use && room.interactable) || { x: x + w / 2, y: y + h / 2 };
    const field = fieldTo(world, at);
    const steps = stepsFrom(world, field);
    if (steps < (best?.steps ?? UNREACHED)) best = { at, field, use, steps };
  }
  return best;
}

/**
 * The gate (its room's interactable), or the boss that keeps it shut; while
 * its room is neither found nor hinted (`exitHinted`), the nearest room not
 * yet been in, a den only when no other is left.
 */
function gateGoal(world: ArpgWorld): Goal | null {
  const { rooms } = world.map;
  const room = rooms.find((r) => r.interactable?.kind === 'gate');
  if (!room) return null;
  if (!room.revealed && !world.exitHinted) {
    const unseen = rooms.filter((r) => !r.revealed);
    const calm = unseen.filter((r) => r.kind !== 'den');
    return nearestRoom(world, calm.length > 0 ? calm : unseen);
  }
  const boss = world.monsters.find((m) => !m.dead && m.kind === 'boss');
  return boss ? nearestReachable(world, [boss]) : nearestRoom(world, [room], true);
}

/**
 * The `thorough` bot's next goal with no foe in sight: what it has seen lying
 * on the floor; a foe of a room it has been in; an unused chest, shrine or
 * alcove (an alcove once opened is done, taken or not); the nearest room it
 * hasn't been in; then the gate.
 */
function thoroughGoal(world: ArpgWorld): Goal | null {
  const { map, fog } = world;
  const seen = world.drops.filter((d) => !d.dead && fog[cellOf(world, d)] > 0);
  const foes = world.monsters.filter(
    (m) => !m.dead && (m.roomId === null || map.rooms[m.roomId]?.revealed),
  );
  const opened = openedAlcove(world);
  const unused = map.rooms.filter(({ revealed, interactable: it }) => {
    return revealed && it && !it.used && it.kind !== 'gate' && it.id !== opened;
  });
  return (
    nearestReachable(world, seen) ??
    nearestReachable(world, foes) ??
    nearestRoom(world, unused, true) ??
    nearestRoom(
      world,
      map.rooms.filter((r) => !r.revealed),
    ) ??
    gateGoal(world)
  );
}

/**
 * The bot's way on a generated floor with no foe to fight: shut in a sealed
 * room, to its foes; else to its policy's goal (a beeline's is the gate),
 * pressing interact once in reach of an interactable. Stands still with
 * nowhere to go.
 */
function explore(
  registry: DataRegistry,
  world: ArpgWorld,
  input: ArpgInput,
  policy: BotPolicy,
): ArpgInput {
  const h = world.hero;
  const room = shutIn(world);
  const goal = room
    ? nearestReachable(
        world,
        world.monsters.filter((m) => !m.dead && m.roomId === room.id),
      )
    : policy === 'beeline'
      ? gateGoal(world)
      : thoroughGoal(world);
  if (!goal) return input;
  const reach = registry.getDelveBalance().ai.interactRadius * 0.8;
  if (goal.use && dist(h.x, h.y, goal.at.x, goal.at.y) <= reach) {
    input.interact = true;
    return input;
  }
  input.move = walk(world, goal.field, goal.at);
  return input;
}
```

- [ ] **Step 4: `botStep`, `takeBestAlcove` and `playFloor` on the exit**

In `packages/engine/src/delve/autopilot.ts`:

Replace:

```ts
import { botInput } from '../arpg/bot.js';
import { stepWorld } from '../arpg/step.js';
```

with:

```ts
import { botInput, type BotPolicy } from '../arpg/bot.js';
import { exitFloor } from '../arpg/interact.js';
import { stepWorld } from '../arpg/step.js';
import type { ArpgWorld } from '../types/arpg.js';
```

Replace:

```ts
import { takeStop, type StopAction } from './stops.js';
```

with:

```ts
import { alcoveOffers, takeAlcove, takeStop, type StopAction } from './stops.js';
```

Replace:

```ts
  maxFloorSeconds?: number;
```

with:

```ts
  maxFloorSeconds?: number;
  /** How the bot plays a generated floor (default `thorough`). */
  policy?: BotPolicy;
```

Replace:

```ts
function playFloor(
  registry: DataRegistry,
  profile: DelveProfile,
  maxSeconds: number,
): { profile: DelveProfile; seconds: number; died: boolean } {
  let p = profile;
  const world = beginFloor(registry, p);
  while (!world.heroDead && world.t < maxSeconds) {
    stepWorld(registry, world, botInput(registry, world), STEP);
    if (world.pending.items.length > 0) p = bankWorld(registry, p, world).profile;
    if (world.cleared && (world.drops.length === 0 || world.t - world.clearedAt > 3)) break;
  }
  if (world.heroDead || !world.cleared) {
```

with:

```ts
/**
 * One step of the bot on `world` (`dt` seconds): its input, then what the
 * step asks of it: the gate's `exitRequest` takes the exit at once
 * (`exitFloor`) and an alcove's `alcoveOpen` takes its pick (`takeBestAlcove`).
 * Returns the profile, changed only by an alcove's op.
 */
export function botStep(
  registry: DataRegistry,
  profile: DelveProfile,
  world: ArpgWorld,
  dt: number,
  policy?: BotPolicy,
): DelveProfile {
  let p = profile;
  for (const e of stepWorld(registry, world, botInput(registry, world, policy), dt)) {
    if (e.kind === 'exitRequest') exitFloor(world);
    else if (e.kind === 'alcoveOpen') p = takeBestAlcove(registry, p, world, e.id);
  }
  return p;
}

function playFloor(
  registry: DataRegistry,
  profile: DelveProfile,
  maxSeconds: number,
  policy: BotPolicy,
): { profile: DelveProfile; seconds: number; died: boolean } {
  let p = profile;
  const world = beginFloor(registry, p);
  while (!world.heroDead && world.t < maxSeconds) {
    p = botStep(registry, p, world, STEP, policy);
    if (world.pending.items.length > 0) p = bankWorld(registry, p, world).profile;
    if (world.exited) break;
    if (world.cleared && (world.drops.length === 0 || world.t - world.clearedAt > 3)) break;
  }
  if (world.heroDead || !(world.cleared || world.exited)) {
```

Replace:

```ts
export function takeBestStop(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const stop = profile.dive?.stop;
  if (!stop || stop.taken) return profile;
  const take = (action: StopAction) => {
    const res = takeStop(registry, profile, action);
    return res.ok ? res.profile : null;
  };
```

with:

```ts
export function takeBestStop(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  return bestStop(registry, profile, (action) => {
    const res = takeStop(registry, profile, action);
    return res.ok ? res.profile : null;
  });
}

/**
 * At an anvil alcove mid-floor, the bot's pick (the stop's preference ladder over
 * `alcoveOffers`), taken through `takeAlcove`; the profile unchanged when it takes nothing.
 * The ladder runs on a dry run: the profile as if at a stop offering the alcove's kinds,
 * its floor's haul banked.
 */
export function takeBestAlcove(
  registry: DataRegistry,
  profile: DelveProfile,
  world: ArpgWorld,
  id: string,
): DelveProfile {
  const dive = profile.dive;
  const offers = alcoveOffers(registry, profile, world, id);
  if (!dive || offers.length === 0) return profile;
  const stop = { offers, taken: false };
  const banked = addHaul(dive.banked, dive.haul);
  const atStop: DelveProfile = { ...profile, dive: { ...dive, phase: 'choosing', banked, stop } };
  const picks = new Map<DelveProfile, StopAction>();
  const picked = bestStop(registry, atStop, (action) => {
    const res = takeStop(registry, atStop, action);
    if (res.ok) picks.set(res.profile, action);
    return res.ok ? res.profile : null;
  });
  const action = picks.get(picked);
  return action ? takeAlcove(registry, profile, world, action).profile : profile;
}

/** `takeBestStop`'s ladder over `profile`'s stop, each kind tried through `take`. */
function bestStop(
  registry: DataRegistry,
  profile: DelveProfile,
  take: (action: StopAction) => DelveProfile | null,
): DelveProfile {
  const stop = profile.dive?.stop;
  if (!stop || stop.taken) return profile;
```

Replace:

```ts
        const played = playFloor(registry, p, maxFloorSeconds);
```

with:

```ts
        const played = playFloor(registry, p, maxFloorSeconds, opts.policy ?? 'thorough');
```

In `packages/engine/src/index.ts`:

Replace:

```ts
export { runAutopilot, takeBestStop } from './delve/autopilot.js';
```

with:

```ts
export { runAutopilot, takeBestAlcove, takeBestStop } from './delve/autopilot.js';
```

- [ ] **Step 5: Run them to see them pass, and the whole suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-bot.test.ts)`
Expected: PASS, 5 of 5.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 5 passed | 5 skipped in F + 1 passed | 1 skipped files** (2000 in 126 at the base's counts). Nothing else moves: the dives are still the open room (the switch is off), where every new branch is skipped, so the pacing rails pass unchanged (about 70 s).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-maps-b4
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/bot.ts src/index.ts tests/delve-maps-bot.test.ts)
git add packages/engine/src/arpg/bot.ts packages/engine/src/delve/autopilot.ts packages/engine/src/index.ts packages/engine/tests/delve-maps-bot.test.ts
git commit -m "feat(engine): the bot walks generated floors: flow fields, thorough and beeline, the exit and the alcove" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The switch and the rails

### Task 2: Dives on generated floors, and the pacing rails re-banded

**Files:**
- Create: `packages/engine/tests/delve-pacing-pairs.test.ts`
- Modify: `packages/engine/src/data/balance.json`, `packages/engine/src/delve/autopilot.ts`, `packages/engine/tests/delve-maps-contract.test.ts`, `packages/engine/tests/delve-maps-generate.test.ts`, `packages/engine/tests/delve-maps-flow.test.ts`, `packages/engine/tests/delve-banking.test.ts`, `packages/engine/tests/delve-dive.test.ts`, `packages/engine/tests/delve-pacing.test.ts`, `packages/engine/tests/fixtures/pacing.ts`

- [ ] **Step 1: The failing tests: a dive floor is generated**

In `packages/engine/tests/delve-maps-contract.test.ts`:

Replace:

```ts
  it('a dive floor is open too until the generator lands, its packs placed as before', () => {
    const w = beginFloor(registry, diving());
    expect(w.map.open).toBe(true);
    expect(w.monsters.length).toBeGreaterThan(0);
    expect(w.monsters.every((m) => m.roomId === null)).toBe(true);
  });
```

with:

```ts
  it('a dive floor is generated, every foe in a room', () => {
    const w = beginFloor(registry, diving());
    expect(w.map.open).toBe(false);
    expect(w.monsters.length).toBeGreaterThan(0);
    expect(w.monsters.every((m) => m.roomId !== null)).toBe(true);
  });
```

In `packages/engine/tests/delve-maps-generate.test.ts`:

Replace:

```ts
/** A registry whose dives are generated (`delve.layout.generatedDives` is off as shipped). */
```

with:

```ts
/** A registry whose dives are generated (`delve.layout.generatedDives`, on as shipped). */
```

Replace:

```ts
  it('stays the open room while generatedDives is off', () => {
    expect(L.generatedDives).toBe(false);
    expect(world(3, 11, {}, registry).map.open).toBe(true);
  });
```

with:

```ts
  it('is on as shipped; with generatedDives off a dive floor stays the open room', () => {
    expect(L.generatedDives).toBe(true);
    const off = createDefaultRegistry();
    off.getDelveBalance().layout.generatedDives = false;
    expect(world(3, 11, {}, off).map.open).toBe(true);
  });
```

Run: `(cd packages/engine && npx vitest run tests/delve-maps-contract.test.ts tests/delve-maps-generate.test.ts)`
Expected: FAIL, 2: "a dive floor is generated, every foe in a room" (`expected true to be false`) and "is on as shipped; …" (`expected false to be true`).

- [ ] **Step 2: Turn the switch on, and see what it breaks**

In `packages/engine/src/data/balance.json` (hand-edited):

Replace:

```json
      "pillarChance": 0.3, "minPackDistance": 9, "packsPerRoom": 2, "generatedDives": false
```

with:

```json
      "pillarChance": 0.3, "minPackDistance": 9, "packsPerRoom": 2, "generatedDives": true
```

Run: `(cd packages/engine && npx vitest run)`
Expected: the two tests above pass; 11 tests fail, every one a test that played a dive floor to its end or read "a dive floor" as the open room:
- `delve-banking.test.ts` (4): "doesn't drop again the gear or patterns…" (`expected 0 to be greater than 0`), "the first boss's essence and epic flux bank…" (`Legendary not found: undefined`), "a death before the first boss's floor banks…" (`expected +0 to be 1`), "seed 8's first floor…" (`expected false to be true`): the vacuum no longer reaches the hero through walls, and a generated floor ends at the gate, not on `cleared`;
- `delve-dive.test.ts` (1): "the first boss ever drops an essence…" (`expected false to be true`: the same vacuum);
- `delve-maps-flow.test.ts` (1): "a generated floor counts only its rooms cleared; the open room clears whole" (`expected [ [ 1, +0 ], [ 1, 1 ], [ 1, +0 ] ] to deeply equal …`: its "open room" is now generated);
- `delve-pacing.test.ts` (2): "first dive is a short scouting run…" (`expected 2 to be greater than or equal to 3`: seed 3's first dive extracts at depth 2 to bank a vault's essence) and "the first boss's essence becomes a forged legendary…" (`seed 3: expected false to be true`: a vault's essence came home first);
- `delve-pacing-robust.test.ts` (3): "the first essence is forged at once, and a first epic by dive 6" under three of the four levers (seeds 3, 3 and 2: the same essence).
"when pickups bank never changes the outcome" still passes, vacuously (its loop never sees `cleared`); Step 3 makes it end on the exit.

- [ ] **Step 3: The autopilot on generated floors: 420 s a floor, and extracting for an essence**

In `packages/engine/src/delve/autopilot.ts` (hand-edited):

Replace:

```ts
  /** A floor that runs longer than this counts as a death. */
```

with:

```ts
  /** A floor that runs longer than this counts as a death (default 420). */
```

Replace:

```ts
 * shrine), or to bring home an essence or epic flux it has banked.
 */
function pickDoor(profile: DelveProfile): string | null {
  const dive = profile.dive!;
  if (dive.banked.flux.epic > 0 || Object.values(dive.banked.essences).some((n) => n > 0)) return null;
```

with:

```ts
 * shrine), or to bring home the epic flux it has banked, or an essence it has
 * the epic flux to forge (a banked essence is never lost, but a vault's alone
 * isn't worth ending the dive for).
 */
function pickDoor(profile: DelveProfile): string | null {
  const dive = profile.dive!;
  const essence = Object.values(dive.banked.essences).some((n) => n > 0);
  if (dive.banked.flux.epic > 0 || (essence && profile.materials.flux.epic > 0)) return null;
```

Replace:

```ts
  const maxFloorSeconds = opts.maxFloorSeconds ?? 240;
```

with:

```ts
  const maxFloorSeconds = opts.maxFloorSeconds ?? 420;
```

- [ ] **Step 4: The tests that play a floor to its end**

In `packages/engine/tests/delve-maps-flow.test.ts`:

Replace:

```ts
import { applyShrine } from '../src/arpg/interact.js';
```

with:

```ts
import { openRoom } from '../src/arpg/grid.js';
import { applyShrine } from '../src/arpg/interact.js';
```

Replace:

```ts
    const open = cleared(p, beginFloor(reg, p));
```

with:

```ts
    const open = cleared(p, onMap(beginFloor(reg, p), openRoom(bal.arena.width, bal.arena.height)));
```

In `packages/engine/tests/delve-dive.test.ts`:

Replace:

```ts
/** Kill everything on the floor and let the loot vacuum in. */
function clearFloor(world: ArpgWorld): void {
  const ctx = makeCtx(registry, world, []);
  for (const m of [...world.monsters]) hitMonster(ctx, m, 1e12, null, { source: 'skill' });
  for (let i = 0; i < 150 && world.drops.length > 0; i++)
    stepWorld(registry, world, { move: { x: 0, y: 0 } }, 1 / 30);
}
```

with:

```ts
/** Kill everything on the floor and pick up what it dropped. */
function clearFloor(world: ArpgWorld): void {
  const ctx = makeCtx(registry, world, []);
  for (const m of [...world.monsters]) hitMonster(ctx, m, 1e12, null, { source: 'skill' });
  // Walls stop the vacuum on a generated floor: the hero goes to each drop in turn.
  for (let i = 0; i < 150 && world.drops.length > 0; i++) {
    const drop = world.drops.find((d) => !d.dead);
    if (drop) Object.assign(world.hero, { x: drop.x, y: drop.y });
    stepWorld(registry, world, { move: { x: 0, y: 0 } }, 1 / 30);
  }
}
```

In `packages/engine/tests/delve-banking.test.ts`:

Replace:

```ts
import { botInput } from '../src/arpg/bot.js';
```

with:

```ts
import { botStep } from '../src/delve/autopilot.js';
```

Replace:

```ts
/** Kill everything on the floor and let the loot vacuum in. */
function clearFloor(world: ArpgWorld): void {
  const ctx = makeCtx(registry, world, []);
  for (const m of [...world.monsters]) hitMonster(ctx, m, 1e12, null, { source: 'skill' });
  for (let i = 0; i < 150 && world.drops.length > 0; i++)
    stepWorld(registry, world, { move: { x: 0, y: 0 } }, 1 / 30);
}
```

with:

```ts
/** Kill everything on the floor and pick up what it dropped. */
function clearFloor(world: ArpgWorld): void {
  const ctx = makeCtx(registry, world, []);
  for (const m of [...world.monsters]) hitMonster(ctx, m, 1e12, null, { source: 'skill' });
  // Walls stop the vacuum on a generated floor: the hero goes to each drop in turn.
  for (let i = 0; i < 150 && world.drops.length > 0; i++) {
    const drop = world.drops.find((d) => !d.dead);
    if (drop) Object.assign(world.hero, { x: drop.x, y: drop.y });
    stepWorld(registry, world, { move: { x: 0, y: 0 } }, 1 / 30);
  }
}
```

Replace:

```ts
    for (let i = 0; i < fps * 120 && !world.heroDead; i++) {
      stepWorld(registry, world, botInput(registry, world), 1 / fps);
      if (everyFrame) p = bankWorld(registry, p, world).profile;
      if (world.cleared && world.drops.length === 0) break;
    }
    return world.cleared
```

with:

```ts
    for (let i = 0; i < fps * 120 && !world.heroDead && !world.exited; i++) {
      p = botStep(registry, p, world, 1 / fps);
      if (everyFrame) p = bankWorld(registry, p, world).profile;
    }
    return world.exited
```

Replace:

```ts
      [8, 1], // cleared, with two elites' gear
```

with:

```ts
      [61, 1], // taken to the exit, with two pieces of elites' gear
```

Replace:

```ts
  it("seed 8's first floor, played by the bot, drops gear at any frame rate (delve.spec.ts D02 relies on it)", () => {
    const p = startDive(registry, createDelveProfile(registry, 8, { primary: 'fire' }), 1);
    for (const fps of [60, 45, 30, 20]) {
      const world = beginFloor(registry, p);
      const items: unknown[] = [];
      for (let i = 0; i < fps * 120 && !world.heroDead && !world.cleared; i++) {
        stepWorld(registry, world, botInput(registry, world), 1 / fps);
        items.push(...world.drops.filter((d) => d.kind === 'item' && !items.includes(d)));
      }
      expect(world.cleared).toBe(true);
```

with:

```ts
  it("seed 39's first floor, played by the bot, drops gear at any frame rate (delve.spec.ts D02 relies on it)", () => {
    const p = startDive(registry, createDelveProfile(registry, 39, { primary: 'fire' }), 1);
    for (const fps of [60, 45, 30, 20]) {
      const world = beginFloor(registry, p);
      const items: unknown[] = [];
      for (let i = 0, q = p; i < fps * 120 && !world.heroDead && !world.exited; i++) {
        q = botStep(registry, q, world, 1 / fps);
        items.push(...world.drops.filter((d) => d.kind === 'item' && !items.includes(d)));
      }
      expect(world.exited).toBe(true);
```

(The seeds, re-picked on generated floors: seed 61's first floor, the bot thorough, gives two pieces of gear at 60 and at 20 frames a second, the bank-timing test's "two" (seed 8's gives none); seed 3's depth 5 still kills the starter hero at every rate. Seed 39's first floor drops three pieces at every rate, the first 7 s in, and the bot takes the exit at 54 s: the E2E's D02 moves to it, X4.1.)

- [ ] **Step 5: The pacing rails**

In `packages/engine/tests/fixtures/pacing.ts` (hand-edited):

Replace:

```ts
/** Whether the first dive to bring an essence home forged a legendary on the visit after it (false: none came). */
export function essenceForgedAtOnce(e: EconomyReport): boolean {
  const first = e.dives.find((d) => Object.values(d.income.essences).some((n) => n > 0));
```

with:

```ts
/**
 * Whether the first boss's essence forged a legendary on the visit after the dive that brought it
 * home (false: none came). It comes with an epic flux, which tells it from a vault's essence.
 */
export function essenceForgedAtOnce(e: EconomyReport): boolean {
  const first = e.dives.find(
    (d) => d.income.flux.epic > 0 && Object.values(d.income.essences).some((n) => n > 0),
  );
```

In `packages/engine/tests/delve-pacing.test.ts` (hand-edited):

Replace:

```ts
const frostRuns: AutopilotDiveReport[][] = frostResults.map((r) => r.reports);

/**
 * Every pair forced from the start: a fused Primary sets off its own reaction
 * on every hit after the first, so none may run away or stall. One seed's depth
 * swings far more than one pair's from another's (one pair went from 12 to 51
 * over ten seeds while the pairs' means ran 19 to 28), so each pair is its mean
 * over `SWEEP_SEEDS`.
 */
const SWEEP_DIVES = 6;
const SWEEP_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const sweep = registry.getArpgData().reactions.map(({ elements: [primary, secondary] }) => ({
  pair: `${primary}+${secondary}`,
  depth: avg(
    SWEEP_SEEDS.map(
      (seed) =>
        runAutopilot(registry, { seed, dives: SWEEP_DIVES, primary, secondary }).reports[SWEEP_DIVES - 1].endDepth,
    ),
  ),
}));
```

with:

```ts
const frostRuns: AutopilotDiveReport[][] = frostResults.map((r) => r.reports);
/** The same Fire heroes rushing every floor: the bot makes for the exit (see the floor maps spec). */
const rushRuns: AutopilotDiveReport[][] = SEEDS.map(
  (seed) => runAutopilot(registry, { seed, dives: DIVES, policy: 'beeline' }).reports,
);
```

Replace:

```ts
const endDepthAt = (dive: number) => avg(runs.map((r) => r[dive - 1].endDepth));
```

with:

```ts
const endDepthAt = (dive: number) => avg(runs.map((r) => r[dive - 1].endDepth));
/** Each dive's floor time over its floors (a death's floor counts). */
const perFloor = (r: AutopilotDiveReport[]) =>
  r.map((d) => d.floorSeconds / Math.max(1, d.endDepth - d.startDepth + 1));
```

Replace:

```ts
  it('no pair runs away or stalls: each forced pair reaches 0.6–1.6 × the median depth by dive 6 (its mean over the seeds)', () => {
    const depths = sweep.map((s) => s.depth).sort((a, b) => a - b);
    const median = depths[Math.floor(depths.length / 2)];
    for (const s of sweep) {
      expect(s.depth, s.pair).toBeGreaterThanOrEqual(0.6 * median);
      expect(s.depth, s.pair).toBeLessThanOrEqual(1.6 * median);
    }
  });

  it('floors are a snackable length', () => {
    const perFloor = runs.flatMap((r) =>
      r.map((d) => d.floorSeconds / Math.max(1, d.endDepth - d.startDepth + 1)),
    );
    expect(avg(perFloor)).toBeGreaterThan(8);
    expect(avg(perFloor)).toBeLessThan(60);
  });
```

with:

```ts
  it('floors are a snackable length: a full clear takes longer than a rush to the exit', () => {
    const clear = avg(runs.flatMap(perFloor));
    const rush = avg(rushRuns.flatMap(perFloor));
    expect(clear).toBeGreaterThan(30);
    expect(clear).toBeLessThan(60);
    expect(rush).toBeGreaterThan(20);
    expect(rush).toBeLessThan(45);
    expect(clear).toBeGreaterThan(1.25 * rush);
  });

  it("rushing still progresses: a beeline reaches at least 80% of the full clear's depth by dive 12", () => {
    const rush = avg(rushRuns.map((r) => r[DIVES - 1].endDepth));
    expect(rush).toBeGreaterThanOrEqual(0.8 * endDepthAt(DIVES));
  });
```

Create `packages/engine/tests/delve-pacing-pairs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot } from '../src/delve/autopilot.js';

/**
 * Every pair forced from the start: a fused Primary sets off its own reaction
 * on every hit after the first, so none may run away or stall. One seed's depth
 * swings far more than one pair's from another's (one pair went from 12 to 51
 * over ten seeds while the pairs' means ran 19 to 28), so each pair is its mean
 * over `SEEDS`. Its own file, so it runs beside the other pacing rails; four
 * dives keep it in budget on generated floors (the pairs' spread is the same by
 * dive 4 as by dive 6).
 */

const registry = createDefaultRegistry();
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const DIVES = 4;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const sweep = registry.getArpgData().reactions.map(({ elements: [primary, secondary] }) => ({
  pair: `${primary}+${secondary}`,
  depth: avg(
    SEEDS.map(
      (seed) =>
        runAutopilot(registry, { seed, dives: DIVES, primary, secondary }).reports[DIVES - 1]
          .endDepth,
    ),
  ),
}));

describe('Delve ARPG pacing: the forced pairs (autopilot)', () => {
  it('no pair runs away or stalls: each forced pair reaches 0.6–1.6 × the median depth by dive 4 (its mean over the seeds)', () => {
    const depths = sweep.map((s) => s.depth).sort((a, b) => a - b);
    const median = depths[Math.floor(depths.length / 2)];
    for (const s of sweep) {
      expect(s.depth, s.pair).toBeGreaterThanOrEqual(0.6 * median);
      expect(s.depth, s.pair).toBeLessThanOrEqual(1.6 * median);
    }
  });
});
```

- [ ] **Step 6: Run the whole suite**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 6 passed | 5 skipped in F + 2 passed | 1 skipped files** (2001 in 127). About 3.7 min: the forced pairs' file is the longest, `delve-pacing` about 65 s of runs on its own, the robust levers about 40 s (X2).

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/alloy-maps-b4
(cd packages/engine && npx prettier --write --end-of-line auto tests/delve-maps-contract.test.ts tests/delve-maps-generate.test.ts tests/delve-maps-flow.test.ts tests/delve-banking.test.ts tests/delve-dive.test.ts tests/delve-pacing-pairs.test.ts)
git add packages/engine/src/data/balance.json packages/engine/src/delve/autopilot.ts packages/engine/tests/delve-maps-contract.test.ts packages/engine/tests/delve-maps-generate.test.ts packages/engine/tests/delve-maps-flow.test.ts packages/engine/tests/delve-banking.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-pacing.test.ts packages/engine/tests/delve-pacing-pairs.test.ts packages/engine/tests/fixtures/pacing.ts
git commit -m "feat(engine): dives on generated floors; the pacing rails re-measured" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The client follows the bundle

### Task 3: The client's tests on generated dives

**Files:**
- Modify: `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`, `packages/client/src/features/delve/__tests__/floor-engine.test.ts`

- [ ] **Step 1: Build the bundle, and see what fails**

Run: `(cd packages/engine && npx tsup)` then `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__/arena-hud-snapshot.test.ts src/features/delve/__tests__/floor-engine.test.ts)`
Expected: tsup's three "Build success" lines; no type errors; FAIL, 3 of 24:
- "a channelled ability dims the buttons only once its channel starts, not in its conjure" (`TypeError: Cannot read properties of null (reading 'conjureUntil')`: the start room holds no foe for the auto-aimed Bolt, so it never winds up; B1's X6);
- "is built from its map and seeded by it; the open arena as ever" (`expected { width: 32, height: 48, …(3) } to be undefined`) and "simulates round the view only; the open arena all of it" (`expected false to be true`): their open arena is a dive's first floor, now generated.

- [ ] **Step 2: Aim the cast; build the open arena**

In `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`:

Replace:

```ts
    stepWorld(registry, w, { move: still, cast: { slot: 0, aim: null } }, STEP);
    const wu = w.hero.windup!;
```

with:

```ts
    // Aimed: the start room holds no foe for an auto-aimed Bolt.
    const aim = { x: w.hero.x, y: w.hero.y - 3 };
    stepWorld(registry, w, { move: still, cast: { slot: 0, aim } }, STEP);
    const wu = w.hero.windup!;
```

In `packages/client/src/features/delve/__tests__/floor-engine.test.ts`:

Replace:

```ts
  generateFloor,
  startDive,
```

with:

```ts
  generateFloor,
  openRoom,
  startDive,
```

Replace:

```ts
  /** Today's first floor of a dive, on `map` (the generator is B1's; until then the dive is the open room). */
  function onMap(map?: FloorMap) {
    const world = beginFloor(registry, startDive(registry, createDelveProfile(registry, 99), 1));
    if (map) Object.assign(world, { map, width: map.width, height: map.height });
    return world;
  }
```

with:

```ts
  /** A dive's first floor, on `map`, or on the open arena without one. */
  function onMap(map?: FloorMap) {
    const world = beginFloor(registry, startDive(registry, createDelveProfile(registry, 99), 1));
    const { width, height } = registry.getDelveBalance().arena;
    const on = map ?? openRoom(width, height);
    Object.assign(world, { map: on, width: on.width, height: on.height });
    return world;
  }
```

(`openRoom` reaches the client through the bundle: `src/index.ts` exports `arpg/grid.ts` whole.)

- [ ] **Step 3: Run the client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1300 tests in 157 files** pass (the base's counts).

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/alloy-maps-b4
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/arena-hud-snapshot.test.ts src/features/delve/__tests__/floor-engine.test.ts)
git add packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts packages/client/src/features/delve/__tests__/floor-engine.test.ts
git commit -m "test(client): the HUD and the pixel floor's tests on generated dives" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

- [ ] **The whole stack**

```bash
cd /c/Projects/alloy-maps-b4
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

Expected: no type errors; the engine **N + 6 passed | 5 skipped in F + 2 passed | 1 skipped files** (2001 in 127; about 3.7 min); tsup's three "Build success" lines; the client **1300 tests in 157 files**.

- [ ] **What the integrator and the other areas take from here:** "Cross-area needs" (X1 is a softlock fix for B3's `seal.ts`; X3 is C2 Task 9's import; X4 is Phase D's E2E seed, docs and balance questions).
- [ ] **By hand, optional:** in the dev server with `alloy:delve:autopilot = "1"`, a dive's floors play to the gate: the bot clears the rooms, opens the chests, prays at the shrines (standing still through the bar), takes what it wants at an alcove without a dialog (C2's Task 9) and leaves by the gate on the confirm-less exit.
