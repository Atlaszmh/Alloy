# Delve floor maps · Phase A: the contract and the grid core — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the floor maps stage's contract so B1, B2, B3 (and B4 after them) and C1, C2 can work in parallel without editing each other's files, and build the grid core they all stand on: the map types (`types/floor-map.ts`); `layouts.json`, `shrines.json` and the `delve.layout` / `delve.ai` / `drops.vault` / `drops.den` blocks with their schemas and starter content; the world on a `FloorMap` (`openRoom` by default) with every new field initialised; `arpg/grid.ts` implemented (`moveCircle`, `lineOfSight`, `isWalkable`, `snapToWalkable`, `blocked`); every rectangle clamp in the sim swapped for the grid helpers; the hero's blessings (`applyBuffs`, `baseStats`, `worldStats`); save v10 with the dive's used interactables and blessings, older saves reset; `beginFloor`'s pass-through (`layout: 'generated'`, `used`, `diveBuffs`); `ArpgInput.interact` and the new events; typed stubs in their owners' files with `tick()` and `killMonster` calling the hooks; and the `interact` control (pad A, key C) with the no-clash rule. Nothing changes in play: on the open room every number is as before (the suites and the pacing rails pass unchanged, and a whole-autopilot fingerprint is bit-identical).

**Architecture:** `src/types/floor-map.ts` holds every shape the areas trade in (the map, rooms, doors, interactables, shrines and blessings, the layouts data, the two balance blocks, the HUD's map). `layouts.json` and `shrines.json` ride the Delve data (`registry.getDelveData().layouts` / `.shrines`), loaded and checked as `runes.json` rides the ARPG data, so no registry signature changes. `arpg/grid.ts` is the one place that knows walls: `moveCircle` sweeps a circle's bounding square along each axis to the first blocked cell (no tunnelling, out of bounds is wall, and on the open room it is the old `clamp(v, r, size − r)` to the bit); `snapToWalkable` is the old margin clamp plus a snap out of walls; `isWalkable` is the old "outside" test inverted; `lineOfSight` is a DDA walk. Every mover and placement that clamped to the arena rectangle now calls one of them. The world gets `map` (its `width`/`height` come from it), `fog`, the flow fields, the seal, channel and exit state; `createFloorWorld` builds `openRoom` whatever `layout` asks for until the generator area adds the generated path. Each B-area hook is a typed stub in the file that area owns: the ticks are no-ops (called from `tick()` in a fixed order), `onMonsterKilled` is a no-op (called at the end of `killMonster`), and the rest throw `"<name>: not implemented"` and are called by nothing yet.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, React 19, Zustand 5.

**Spec:** `docs/superpowers/specs/2026-10-03-delve-floor-maps-design.md` (authoritative): "Phases and parallel areas" (the Phase A row and "Shared files"), "The map model", "Movement and combat on the grid", "Interacting, special rooms and the exit", "Fog of war and the minimap", "Data and tuning". The overview is `00-overview.md` in this folder.

---

## Base

- **Starts from:** `maps/main` at `5dfd7d66` (v0.59.0, the spec, the overview, and C3's prop sprites merged), in this area's worktree `C:/Projects/alloy-maps-a` on branch `maps/a`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-maps-a -Branch maps/a -Base maps/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-maps-a` in Git Bash.
- **Anchors:** every edit was generated from, and checked against, `maps/main` at `5dfd7d66`: applied in this plan's order, task by task, they give exactly the files the tests below were run on (see "Checked on a scratch copy").
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-maps-a
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the engine suite reads **1846 passed | 5 skipped tests in 104 passed | 1 skipped files** (the pacing rails included); the client suite **1252 tests in 154 files**. Call them **N** engine tests in **F** files and **M** client tests in **G** files; each task below says where they go.

## Files

| File | Change |
|---|---|
| `packages/engine/src/types/floor-map.ts` (new) | Every floor-map shape: `Cell`, `Rect`, `RoomKind`, `DRAWN_ROOM_KINDS`/`DrawnRoomKind`, `InteractableKind`, `ShrineId`, `Interactable`, `Room`, `Door`, `FloorMap`, `FloorLayout`, `ShrineEffect`, `ShrineDef`, `Buff`, `PROP_IDS`/`PropId`, `RoomTemplate`, `LayoutsData`, `LayoutBalance`, `AiBalance`, `HudIcon`, `HudRoom`, `HudMap` |
| `packages/engine/src/types/index.ts` | exports `floor-map.ts` |
| `packages/engine/src/data/layouts.json` (new) | room templates (`default`, `bone_crypts`) with pillar and rubble masks, the boss room, the props' sizes (chest 0.9, shrine 1.4, alcove_anvil 1.4, exit_gate 2.6) |
| `packages/engine/src/data/shrines.json` (new) | six shrines: four floor blessings (damage, life regen, mana regen, Find), a potion refill, one dive blessing |
| `packages/engine/src/data/schemas.ts` | `ShrinesDataSchema`, `BuffSchema`, `LayoutsDataSchema` (Task 1); `LayoutBalanceSchema`, `AiBalanceSchema`, `drops.vault` / `drops.den`, `delve.layout` / `delve.ai` in the Delve balance, the arena's whole-cell size and no `minPackDistance` (Task 2) |
| `packages/engine/src/data/loader.ts` | `layouts.json` and `shrines.json` into the Delve data |
| `packages/engine/src/data/balance.json` | `delve.layout`, `delve.ai`, `delve.drops.vault` / `den`; `minPackDistance` moves from `arena` to `layout` (hand-edited, never formatted) |
| `packages/engine/src/types/delve.ts` | `DelveData.layouts` / `shrines`; `DelveBalance.layout` / `ai`; `HeroStats.lifeRegen`; `DiveState.used` / `diveBuffs`; `DelveProfile` v10 |
| `packages/engine/src/types/crafting.ts` | `DropsBalance.vault` / `den` |
| `packages/engine/src/arpg/grid.ts` (new) | `openRoom`, `blocked`, `isWalkable`, `moveCircle`, `snapToWalkable`, `lineOfSight` (implemented) |
| `packages/engine/src/types/arpg.ts` | `ArpgWorld.map`, `fog`, `fogVersion`, `fogAt`, `exitHinted`, `flow`, `sealing`, `channel`, `exited`, `queuedInteract`; `MonsterEntity.roomId`, `farSince`, `goingHome`; `Drop.roomId`; `HeroEntity.baseStats`, `floorBuffs`, `diveBuffs`; `WorldPending.used`, `diveBuffs`; `ArpgInput.interact`; the events `interactPrompt`, `exitRequest`, `alcoveOpen`, `seal`, `unseal`, `roomCleared`, `exitHint` |
| `packages/engine/src/arpg/world.ts` | `FloorOptions.layout` / `diveBuffs` / `used`; the world on `openRoom`; every new field's starting value; `MonsterSpawn.roomId`; the hero's blessings (`createHeroEntity`, `refreshWorldHero`); `emptyPending`'s new lists; packs at `layout.minPackDistance` |
| `packages/engine/src/arpg/step.ts` | the walk, the projectiles' end, the boss's adds and the final push-out on the grid; a blessing's life regen; the interact press queued; the floor-map hooks in `tick()`; only the open room clears |
| `packages/engine/src/arpg/dodge.ts`, `action.ts`, `abilities/forms.ts`, `abilities/targeting.ts`, `abilities/impact.ts`, `combat.ts`, `material-drops.ts`, `rune-drops.ts` | their arena clamps through `moveCircle` / `snapToWalkable`; `killMonster` → `onMonsterKilled` |
| `packages/engine/src/delve/hero-stats.ts` | `applyBuffs` (implemented) |
| `packages/engine/src/delve/pair.ts` | `worldStats` (implemented) |
| `packages/engine/src/delve/profile-schema.ts`, `profile.ts` | save v10: the dive's `used` and `diveBuffs`; every other version resets |
| `packages/engine/src/delve/dive.ts` | `startDive`'s new fields; `beginFloor` passes `layout: 'generated'`, `used`, `diveBuffs` (hand-edited, never formatted) |
| `packages/engine/src/arpg/layout/generate.ts` (new, B1's) | stub `generateFloor` |
| `packages/engine/src/arpg/flow.ts` (new, B2's) | stubs `flowField`, `flowTick`, `leashTick` |
| `packages/engine/src/arpg/interact.ts` (new, B3's) | stubs `interactTick`, `applyShrine`, `exitFloor`, `onMonsterKilled` |
| `packages/engine/src/arpg/seal.ts` (new, B3's) | stub `sealTick` |
| `packages/engine/src/arpg/fog.ts` (new, B3's) | stubs `fogTick`, `hudMapOf` |
| `packages/engine/src/delve/stops.ts` | stubs `alcoveOffers`, `takeAlcove` (B3's) |
| `packages/engine/src/index.ts` | the floor-map modules exported whole; `applyBuffs`, `worldStats`, `alcoveOffers`, `takeAlcove` |
| `packages/engine/tests/delve-maps-data.test.ts` (new) | the data, the schemas' refusals, the balance numbers |
| `packages/engine/tests/arpg-grid.test.ts` (new) | the grid core: the open room's parity, sliding, no tunnelling, edges, doors, never ending in a wall, snapping, line of sight |
| `packages/engine/tests/delve-maps-contract.test.ts` (new) | the world's fields, the interact press, the open-room-only clear, every export |
| `packages/engine/tests/delve-maps-movers.test.ts` (new) | a wall stops the walk, the dodge, a pressed foe, a shot, and loot lands walkable |
| `packages/engine/tests/delve-maps-buffs.test.ts` (new) | `applyBuffs`, the hero's blessings, a refresh, `worldStats`, life regen |
| `packages/engine/tests/delve-maps-save.test.ts` (new) | save v10, its resets and refusals, `beginFloor`'s pass-through |
| `packages/engine/tests/delve-save-v8.test.ts`, `delve-dive.test.ts`, `delve-pair.test.ts`, `delve-profile-abilities.test.ts`, `delve-runes-contract.test.ts`, `delve-quests-save.test.ts` | version 10 |
| `packages/client/src/stores/delveStore.test.ts` | version 10 |
| `packages/client/src/features/delve/__tests__/arena-bank.test.ts` | its pending fixture's `used` and `diveBuffs` |
| `packages/client/src/features/delve/__tests__/sprite-atlas.test.ts` | the props' size rule reads `layouts.json → props`; its `PROP_SIZES` goes (hand-edited, never formatted) |
| `packages/client/src/features/controls/controls.ts`, `ControlsPanel.tsx` | the `interact` action (A, C); the editor flags an unbound action |
| `packages/client/src/features/delve/arena/input.ts`, `features/gamepad/arena-pad.ts` | C and A send `ArpgInput.interact` |
| tests: `features/controls/__tests__/controls.test.ts`, `ControlsPanel.test.tsx`, `features/gamepad/__tests__/gamepad.test.ts`, `features/delve/__tests__/arena-input.test.ts` | the above |

## What Phase A implements, and what it leaves

**Implemented (and tested):** the types; `layouts.json`, `shrines.json` and their schemas; `delve.layout`, `delve.ai`, `drops.vault`, `drops.den` and their schemas; the grid core (`openRoom`, `blocked`, `isWalkable`, `moveCircle`, `snapToWalkable`, `lineOfSight`); the world on a map with every new field initialised; the clamp swap (14 sites, below); `applyBuffs`, `HeroEntity.baseStats` / `floorBuffs` / `diveBuffs` and their upkeep in `createFloorWorld` and `refreshWorldHero`, `worldStats`, a blessing's life regen and Find; save v10; `beginFloor`'s pass-through; `ArpgInput.interact` queued as `world.queuedInteract`; the events (types only: nothing emits them yet); the hooks' call sites; only the open room clears; the `interact` control, its flag in the editor, and its wiring to the arena.

**The clamp swap** (each on the open room exactly as before): `step.ts` the walk (`moveCircle`), a projectile's end (`!isWalkable`), the boss's adds (`snapToWalkable`, margin 1), the end-of-tick push-out of foes and hero (`moveCircle` by 0, 0); `dodge.ts` the dash (`moveCircle` swept from where it began); `action.ts` a push's slice (`moveCircle`); `forms.ts` Blink (`moveCircle`) and Barrage's scatter (`snapToWalkable`); `targeting.ts` an explicit aim point (`snapToWalkable`); `impact.ts` an impact's scatter (`snapToWalkable`); `combat.ts` item drops, `material-drops.ts` and `rune-drops.ts` their pickups (`snapToWalkable`, margin 1). The Training Grounds' two placement clamps in `sandbox.ts` stay (the spec keeps the open room there; nothing in B touches the sandbox). Motes, orbs, Siphon's and Seedling's drops, `moveMonster`, knockback, `pull`, the magnet and the vacuum never clamped (the final push-out held them): they are B2's to put through `moveCircle` / `snapToWalkable`.

**Stubs** (each in the file its area owns; "throws" is `"<name>: not implemented"`):

| Stub | File | Area | Until then | Called from |
|---|---|---|---|---|
| `generateFloor(registry, seed, depth, biome, door): FloorMap` | `arpg/layout/generate.ts` | B1 | throws | nothing: B1 adds the generated path to `createFloorWorld` |
| `flowField(map, target, radius, clearance): Uint16Array` | `arpg/flow.ts` | B2 | throws | nothing yet |
| `flowTick(ctx)`, `leashTick(ctx)` | `arpg/flow.ts` | B2 | no-ops | `tick()`: before and after `monstersTick` |
| `sealTick(ctx)` | `arpg/seal.ts` | B3 | no-op | `tick()`: after `separate` |
| `fogTick(ctx)` | `arpg/fog.ts` | B3 | no-op | `tick()`: last, after `dropsTick` |
| `hudMapOf(world): HudMap` | `arpg/fog.ts` | B3 | throws | nothing yet (C2's snapshot) |
| `interactTick(ctx)` | `arpg/interact.ts` | B3 | no-op | `tick()`: right after `heroTick` |
| `applyShrine(registry, world, shrine)` | `arpg/interact.ts` | B3 | throws | nothing yet |
| `exitFloor(world)` | `arpg/interact.ts` | B3 | throws | nothing yet (C2's exit confirm, B4's bot) |
| `onMonsterKilled(ctx, m)` | `arpg/interact.ts` | B3 | no-op | the end of `killMonster`, after every drop of the death |
| `alcoveOffers(registry, profile, world, id): StopKind[]` | `delve/stops.ts` | B3 | throws | nothing yet |
| `takeAlcove(registry, profile, world, action: StopAction): ProfileActionResult` | `delve/stops.ts` | B3 | throws | nothing yet |

No Phase A test calls a stub that throws, and none asserts a stub's placeholder behaviour (the contract test checks only that every op is exported).

**For the areas (the contract in one place):**
- **B1** owns `arpg/world.ts` and `arpg/layout/*`. In `createFloorWorld`, `opts.layout === 'generated'` builds `generateFloor(registry, seed, depth, biome, door)` in place of `openRoom(bal.arena.width, bal.arena.height)`; the hero starts at `map.start` (already read from the map); `fog` starts all 0 on a generated map (A fills it with 2, the open room's); interactables whose `id` is in `opts.used` start `used`; foes are spawned per room through `MonsterSpawn.roomId` (`createMonsterEntity` copies it; `farSince: null`, `goingHome: false` are set there); boss adds inherit it in `step.ts` (B2's file: B2 passes `roomId: m.roomId` in `bossSpecial`); packs keep `bal.layout.minPackDistance`. `beginFloor` already passes `layout: 'generated'`, `used` and `diveBuffs`: nothing in `dive.ts` changes for B1. Turning the generated path on changes the pacing rails (B4's to re-measure); B1 may gate it behind its own tests until B4.
- **B2** owns `arpg/flow.ts`, `arpg/spatial.ts`, `step.ts`'s movement and attacks, and the drop spawn sites. The world has `flow: { small, large, nextAt }`; foes have `roomId`, `farSince`, `goingHome`; drops have `roomId?` (set it at spawn: `spawnDrop`, `dropMaterials`' `spawn`, `dropRune`, Siphon, Seedling). The A swap leaves: `moveMonster`, knockback, `pull`, the magnet and vacuum, motes and orbs to route through the grid; the dodge sweeps from where it began each tick (the spec's per-tick deltas are B2's call); Blink slides with `moveCircle` (the spec wants the last walkable point before the first blocked cell); an aim point is snapped, not yet clipped to sight; a projectile dies where `isWalkable` fails but doesn't burst at the wall or check its spawn point. LOS at every hit site is B2's, with `lineOfSight`.
- **B3** owns `arpg/interact.ts`, `arpg/seal.ts`, `arpg/fog.ts`, `delve/stops.ts`' alcove ops and `delve/dive.ts`. State it can use without touching `world.ts`: `world.queuedInteract` (set by a press; `interactTick` clears it), `channel`, `sealing`, `fogAt`, `exitHinted`, `exited`, `fog`, `fogVersion`, `map.rooms[].revealed/cleared/sealed/interactable`, `map.doors[].closed` (`blocked` reads a closed door's cells as walls), `pending.used`, `pending.diveBuffs`, `hero.floorBuffs`, `hero.diveBuffs`, `hero.baseStats`. A floor blessing: push it on `hero.floorBuffs` and set `hero.stats = applyBuffs(hero.baseStats, hero.floorBuffs)`; a dive blessing: push it on `hero.diveBuffs` and `pending.diveBuffs` and set `hero.baseStats = applyBuffs(hero.baseStats, [buff])` before the floor's (never on `floorBuffs`, or `worldStats` counts it twice); its Find goes on `world.loot.find`; resize the pool with `manaPool(hero.stats, registry)`. `bankWorld` writes `pending.used` / `pending.diveBuffs` into `DiveState.used` / `diveBuffs` (`emptyPending()` already holds both). `refreshWorldHero(registry, world, profileStats(...), chains)` puts both kinds of blessing back on; `worldStats(registry, profile, world)` is what it gives.
- **B4** sends `ArpgInput.interact` from the bot and ends `playFloor` on `world.exited` (only the open room sets `cleared` now).
- **C1** reads `world.map` (`cells`, `rooms`, `doors`, `open`), `world.fog` and `getDelveData().layouts.props`.
- **C2** reads the new events, `hudMapOf` (once B3 fills it), `world.channel`, `world.exited`; the client already sends `ArpgInput.interact` from the bound key or button (C and A by default), and the Controls editor flags an unbound action.
- **C3** (merged): `sprite-atlas.test.ts` reads its prop sizes from `layouts.json → props` (Task 9).

## Where the spec left room

1. **How `moveCircle` sweeps.** Rather than sub-steps, each axis scans the cells the circle's bounding square (half-side `radius`) would cross, from its centre's neighbour to the move's end, and stops at the first blocked one; the map's edges bound it at `radius` too. That can't tunnel at any speed, needs no step size, and on the open room is `clamp(v + d, r, size − r)` exactly (the same expression, so every pinned number holds). A circle already pressed into a wall beside it is put back out; a centre inside a wall cell is left alone (nothing puts one there). The square is a hair conservative at a wall's outside corner.
2. **The map is the closed rectangle.** A point on the far edge (`x = width`) is in the last cell, as the arena's clamps and its "outside" test had it, so `isWalkable` on the open room is exactly the old `!(x < 0 || y < 0 || x > w || y > h)`.
3. **Blessings live on the hero.** `HeroEntity.diveBuffs` (the dive's, as the floor began, plus any taken on it) and `floorBuffs`; `baseStats = applyBuffs(gear, diveBuffs)`, `stats = applyBuffs(baseStats, floorBuffs)`. `refreshWorldHero` now takes the gear's stats (as every caller already passes: `profileStats`, or the test's `w.hero.stats` with no blessings) and puts both back on, so no caller changes and no refresh can wipe a blessing; `worldStats` is the spec's formula with the hero's dive blessings in place of `DiveState.diveBuffs` (the same once banked, and right before a bank too).
4. **What a blessing is.** `Buff = { shrine, effect }` (the id for its name in the HUD, the effect so `applyBuffs` stays pure); `ShrineEffect` holds `damage`, `lifeRegen`, `manaRegen` (multipliers or a fraction of max life a second), `find` (points) and `potions` (a refill, refused on a dive blessing). Life regen had no stat: `HeroStats.lifeRegen?` is new, and `heroTick` heals by it.
5. **Where the data lives.** `layouts.json` and `shrines.json` ride `DelveData` (`registry.getDelveData().layouts` / `.shrines`), as `runes.json` rides `ArpgData`: no new registry argument, so no test registry changes. Their cross-file checks (biome ids, rooms fitting a coarse cell) are tests, as the quests' checks were for what the schema can't see.
6. **`interactPrompt`'s kind** is `interactable` (the event union's discriminant is already `kind`).
7. **Signatures.** `applyShrine(registry, world, shrine: ShrineDef)` (resizing the pool needs the registry); `onMonsterKilled(ctx, m)` and the ticks take the `SimCtx` (they emit events); `takeAlcove` returns a `ProfileActionResult`.
8. **State beyond the spec's list,** so B2 and B3 never edit `world.ts` or the types: `fogAt` and `exitHinted` (fog marks and the hint), `sealing` (the closing room and its grace), `channel` (a prayer under way), `queuedInteract`, `flow.nextAt`; foes' `farSince` and `goingHome` (the leash).
9. **The open room's foes** have `roomId: null`, so B's room rules never fire there; `cleared` stays the open room's (`world.map.open`), and a generated floor ends on `exited`.
10. **`beginFloor` already asks for `'generated'`;** `createFloorWorld` builds the open room whatever it asks for until B1, so dives play exactly as before through Phase A.
11. **The arena's size** is now whole cells in the schema (`.int()`); it always was (26 × 40).
12. **The no-clash rule** was already `parseControls`' for any new action (a default the saved setup uses starts unbound), so `interact` needed only its defaults; the editor's flag ("Not bound: …") covers any unbound action but the keyboard's manual attack (a click by design).
13. **Starter numbers** for B and D to tune: `layout` as the spec says, `kindWeights` combat 6 / den 1 / vault 1 / sanctum 1 / alcove 1 from depth 1 and 5 / 2 / 1 / 1 / 1 from depth 6, `deadEndWeight` 3, `minCombatRooms` 2, `vaultGuardChance` 0.35, `pillarChance` 0.3; `ai.leashRadius` 12, `leashSeconds` 3, `sightRadius` 10, `interactRadius` 1.5 (the rest as the spec says); `drops.vault` flux 1–2 and shards 2–3 at chance 1, `shardTierUp` 1, `essenceChance` 0.1; `drops.den.gearBonus` 0.25.
14. **A room's `mask`** is a record of its template's dressing; `cells` holds the pillars and rubble as walls (one truth for collision and sight). The open room's one room is a `'combat'` room, and its `exit` is its start (it has no gate).

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `maps/a`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-maps-a`.
- **Line endings:** the worktree's files are CRLF (`core.autocrlf`); keep each file's own (the Edit tool does); new files are LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** the commit blocks format only files a task creates or files that pass `prettier --check` at the base. These are **only hand-edited, never formatted**: `packages/engine/src/data/balance.json`, `packages/engine/src/delve/dive.ts` and `packages/client/src/features/delve/__tests__/sprite-atlas.test.ts` (not clean at the base). Never touch `packages/engine/tests/delve-chain-feel.test.ts` (raw 0xD7 byte). The code below is already Prettier-formatted (checked on the scratch copy), so `--write` changes nothing if typed as written.
- **How the edits read** (the earlier plans' language): "In `f`:" names the file for the edits under it. "Replace:" (a block) "with:" (a block) is one Edit (old, new). "Append at the end of the file:" adds a blank line and the block after the last line. "Create `f`:" is a Write. Within a file, apply its edits top to bottom; every old block is unique in its file at that point.
- **Parity is the rule** until B: Tasks 1–8 change no number in play. Every engine task runs the whole engine suite (about 50 s; the pacing rails run while the files load) and the engine typecheck; nothing pinned may move.
- **The client follows the bundle.** Tasks 1–8 never rebuild `packages/engine/dist`, so the client stays green on the base bundle through them. Task 9 rebuilds it: against the new bundle the client's typecheck fails in `arena-bank.test.ts` (its pending fixture lacks `used` and `diveBuffs`) and two store tests fail (they expect version 9) until Task 9's commit. Vitest doesn't type-check tests.
- **Import cycles:** `delve/profile.ts`, `dive.ts`, `pair.ts`, `hero-stats.ts`, `moveset.ts`, `stops.ts`, `quests.ts` and `contracts.ts` import each other; `arpg/combat.ts` and the new `arpg/interact.ts` will too once B3 fills it: read such an import only inside a function. `types/floor-map.ts` imports only types.
- **Checked on a scratch copy:** `git archive` of `maps/main` at `5dfd7d66` with junctioned `node_modules`; every task's edits applied by a script that checks each anchor (154 edits, each unique where the plan applies it), giving the trees every FAIL, PASS, suite and typecheck below ran on; `prettier --check` passed on every file a commit block formats. A whole-autopilot fingerprint (six runs of four dives, every report and the final profile hashed) was identical at the base and after each of Tasks 5 to 8 (the clamp swap, the blessings, the save and the hooks).

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
| Client build | `(pnpm -F @alloy/client build)` |

---

## Chunk 1: The map's data

### Task 1: The floor-map types, `layouts.json`, `shrines.json` and their schemas

Every shape the areas trade in, the room templates and prop sizes, the shrines, their schemas, and both files in the Delve data.

**Files:**
- Create: `packages/engine/src/types/floor-map.ts`, `packages/engine/src/data/layouts.json`, `packages/engine/src/data/shrines.json`, `packages/engine/tests/delve-maps-data.test.ts`
- Modify: `packages/engine/src/types/index.ts`, `src/types/delve.ts`, `src/data/schemas.ts`, `src/data/loader.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-maps-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { LayoutsDataSchema, ShrinesDataSchema } from '../src/data/schemas.js';
import layoutsData from '../src/data/layouts.json';
import shrinesData from '../src/data/shrines.json';
import { PROP_IDS } from '../src/types/floor-map.js';

// See the floor maps spec: "Data and tuning".

const registry = createDefaultRegistry();
const ok = (schema: { safeParse: (x: unknown) => { success: boolean } }, x: unknown) =>
  schema.safeParse(x).success;

describe('layouts.json', () => {
  const { layouts } = registry.getDelveData();

  it('rides the Delve data: rooms per biome (a default list), a boss room, the props', () => {
    expect(layouts.rooms.default.length).toBeGreaterThan(0);
    expect(layouts.boss.w).toBeGreaterThan(0);
    expect(layouts.props).toEqual({ chest: 0.9, shrine: 1.4, alcove_anvil: 1.4, exit_gate: 2.6 });
    expect(Object.keys(layouts.props)).toEqual([...PROP_IDS]);
  });

  it('names only biomes beside its default list', () => {
    const biomes = registry.getDelveData().biomes.map((b) => b.id);
    for (const id of Object.keys(layouts.rooms))
      expect(id === 'default' || biomes.includes(id), id).toBe(true);
  });

  it('refuses a mask of the wrong size or with an unknown cell, and a list without a default', () => {
    const room = (masks: string[][]) => ({
      ...layoutsData,
      rooms: { default: [{ id: 'r', w: 4, h: 4, masks }] },
    });
    expect(ok(LayoutsDataSchema, layoutsData)).toBe(true);
    expect(ok(LayoutsDataSchema, room([['....', '.#%.', '....', '....']]))).toBe(true);
    expect(ok(LayoutsDataSchema, room([['....', '....', '....']]))).toBe(false);
    expect(ok(LayoutsDataSchema, room([['....', '..x.', '....', '....']]))).toBe(false);
    expect(
      ok(LayoutsDataSchema, { ...layoutsData, rooms: { crypts: layoutsData.rooms.default } }),
    ).toBe(false);
  });
});

describe('shrines.json', () => {
  const shrines = registry.getDelveData().shrines;

  it('rides the Delve data: floor and dive blessings, a potion refill among them', () => {
    expect(shrines.some((s) => s.duration === 'floor')).toBe(true);
    expect(shrines.some((s) => s.duration === 'dive')).toBe(true);
    expect(shrines.some((s) => s.effect.potions)).toBe(true);
  });

  it('refuses repeated ids, an empty or unknown effect, and a refill for the dive', () => {
    const shrine = {
      id: 'a',
      name: 'A',
      text: 'A.',
      effect: { damage: 0.1 },
      duration: 'floor',
      weight: 1,
    };
    expect(ok(ShrinesDataSchema, shrinesData)).toBe(true);
    expect(ok(ShrinesDataSchema, [shrine, { ...shrine, id: 'b' }])).toBe(true);
    expect(ok(ShrinesDataSchema, [shrine, shrine])).toBe(false);
    expect(ok(ShrinesDataSchema, [{ ...shrine, effect: {} }])).toBe(false);
    expect(ok(ShrinesDataSchema, [{ ...shrine, effect: { haste: 1 } }])).toBe(false);
    expect(
      ok(ShrinesDataSchema, [{ ...shrine, effect: { potions: true }, duration: 'dive' }]),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-data.test.ts)`
Expected: FAIL: `Error: Cannot find module '../src/data/layouts.json' imported from '…/tests/delve-maps-data.test.ts'` (no test runs).

- [ ] **Step 3: The types**

Create `packages/engine/src/types/floor-map.ts`:

```ts
import type { DropKind, MonsterKind, Vec } from './arpg.js';

// Delve floor maps (see the floor maps spec): the grid, its rooms and doors,
// what can be used in them, the shrines' blessings, the data and the HUD's map.

/** A grid cell: 0 floor, 1 wall, 2 door (a wall while its door is closed). */
export type Cell = 0 | 1 | 2;

/** A rectangle of cells: its top-left cell and its size. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RoomKind =
  | 'start'
  | 'combat'
  | 'den'
  | 'vault'
  | 'sanctum'
  | 'alcove'
  | 'exit'
  | 'boss';

/** The kinds a generated room draws from `layout.kindWeights` (the rest are placed). */
export const DRAWN_ROOM_KINDS = ['combat', 'den', 'vault', 'sanctum', 'alcove'] as const;
export type DrawnRoomKind = (typeof DRAWN_ROOM_KINDS)[number];

export type InteractableKind = 'chest' | 'shrine' | 'alcove' | 'gate';

/** A shrine's id in `shrines.json`. */
export type ShrineId = string;

/** Something in a room the hero uses with `interact`. */
export interface Interactable {
  /** `${depth}:${roomId}`: one use a dive (`DiveState.used`). */
  id: string;
  kind: InteractableKind;
  x: number;
  y: number;
  used: boolean;
  /** A shrine's blessing, drawn at generation. */
  shrine?: ShrineId;
}

export interface Room {
  id: number;
  kind: RoomKind;
  /** Its floor, in cells (its walls are outside it). */
  rect: Rect;
  /** Its template's dressing over `rect`, row by row (0 floor, 1 pillar, 2 rubble); `cells` holds it as walls. */
  mask?: Uint8Array;
  /** BFS steps from each map cell to its centre, for a leashed foe going home (65535: unreachable). */
  homeField?: Uint16Array;
  revealed: boolean;
  cleared: boolean;
  sealed: boolean;
  interactable?: Interactable;
}

export interface Door {
  id: number;
  /** Its cells (`Cell` 2), where a hall meets a room's wall. */
  cells: Vec[];
  rooms: [number, number];
  closed: boolean;
}

export interface FloorMap {
  width: number;
  height: number;
  /** `Cell`s, row by row (`y * width + x`). */
  cells: Uint8Array;
  rooms: Room[];
  doors: Door[];
  /** Where the hero starts. */
  start: Vec;
  /** The exit gate (the open room has none: its start). */
  exit: Vec;
  /** Today's one open room (`openRoom`): no leash, no fog, no gate; it clears when every foe is dead. */
  open: boolean;
}

/** Which map a floor gets: `'open'` (the default) or a generated one (dives; see `FloorOptions.layout`). */
export type FloorLayout = 'open' | 'generated';

// ── Shrines (shrines.json) ─────────────────────────────────────────────────

/** What a shrine's blessing does; each part is optional. */
export interface ShrineEffect {
  /** Damage dealt × (1 + this). */
  damage?: number;
  /** Life regained a second, as a fraction of max life. */
  lifeRegen?: number;
  /** Mana regen × (1 + this). */
  manaRegen?: number;
  /** Find, in percentage points (`world.loot.find`). */
  find?: number;
  /** Refills the potions (at once: a floor shrine only). */
  potions?: true;
}

export interface ShrineDef {
  id: ShrineId;
  name: string;
  /** Player-facing: what it does, for the prompt. */
  text: string;
  effect: ShrineEffect;
  /** How long it lasts: the floor, or the rest of the dive. */
  duration: 'floor' | 'dive';
  /** Its chance to be a sanctum's shrine, against the others'. */
  weight: number;
}

/** A blessing on the hero: its shrine (for its name) and what it does. */
export interface Buff {
  shrine: ShrineId;
  effect: ShrineEffect;
}

// ── Layouts (layouts.json) ─────────────────────────────────────────────────

export const PROP_IDS = ['chest', 'shrine', 'alcove_anvil', 'exit_gate'] as const;
export type PropId = (typeof PROP_IDS)[number];

/** A room's shape: its floor in cells, and the dressings one of which it may wear. */
export interface RoomTemplate {
  id: string;
  w: number;
  h: number;
  /** Each `h` rows of `w` characters: '.' floor, '#' a pillar, '%' rubble (both block). */
  masks: string[][];
}

export interface LayoutsData {
  /** Room templates by biome id; `default` serves a biome without its own. */
  rooms: Record<string, RoomTemplate[]>;
  /** The boss room. */
  boss: RoomTemplate;
  /** Each prop's size in units (its sprite is 16 px a unit). */
  props: Record<PropId, number>;
}

// ── Balance (balance.json → delve.layout, delve.ai) ────────────────────────

/** How a floor is generated (see the floor maps spec's "Generator"). */
export interface LayoutBalance {
  /** Rooms sit in coarse cells of this many units, on a `coarseCols` × `coarseRows` grid. */
  coarseCell: number;
  coarseCols: number;
  coarseRows: number;
  /** Rooms a floor: `base` + depth × `perDepth`, at most `max`. */
  rooms: { base: number; perDepth: number; max: number };
  /** A hall's width in cells. */
  hallWidth: number;
  /** The thinnest wall between rooms and halls, in cells. */
  minWall: number;
  /** Links past the spanning tree: from the first to the second. */
  loops: [number, number];
  /** The drawn kinds' weights by depth band, each from its `fromDepth` on (the first from 1). */
  kindWeights: { fromDepth: number; weights: Record<DrawnRoomKind, number> }[];
  /** Anvil alcoves a floor, at most. */
  alcoveMax: number;
  /** Vaults and sanctums weigh this much more in dead ends. */
  deadEndWeight: number;
  minCombatRooms: number;
  /** Chance a vault holds a guard pack. */
  vaultGuardChance: number;
  /** Chance a room wears one of its template's masks. */
  pillarChance: number;
  /** Packs spawn at least this far from the start. */
  minPackDistance: number;
  /** Packs a combat room or den, at most (before the overflow rules). */
  packsPerRoom: number;
}

/** How foes move and see, and the floor's timings (see the floor maps spec). */
export interface AiBalance {
  /** Seconds between flow-field rebuilds. */
  flowEvery: number;
  /** A flow field's reach, in cells. */
  flowRadius: number;
  /** A foe with sight of the hero this close steers straight at it. */
  directRange: number;
  /** A foe farther than this from its room's centre for `leashSeconds` goes home. */
  leashRadius: number;
  leashSeconds: number;
  /** Seconds a sealing door waits for the doorway to clear. */
  sealGrace: number;
  /** A room's last kill pulls its foes' drops to the hero. */
  roomVacuum: boolean;
  /** How far the hero sees, in units. */
  sightRadius: number;
  /** Seconds between fog updates. */
  fogEvery: number;
  /** Seconds before the minimap points to an unfound exit. */
  exitHintSeconds: number;
  /** How near an interactable must be to use it. */
  interactRadius: number;
  /** Seconds a shrine's prayer takes. */
  shrineChannel: number;
}

// ── The HUD's map (`hudMapOf`) ─────────────────────────────────────────────

export type HudIcon = 'chest' | 'shrine' | 'anvil' | 'skull' | 'gate';

export interface HudRoom {
  id: number;
  kind: RoomKind;
  rect: Rect;
  icon: HudIcon | null;
  /** Its interactable is used (an open chest, a spent shrine). */
  used: boolean;
  cleared: boolean;
  sealed: boolean;
}

/** What the minimap draws: revealed rooms only, foes the hero sees, drops in revealed cells. */
export interface HudMap {
  width: number;
  height: number;
  rooms: HudRoom[];
  /** The exit gate once its room is revealed. */
  exit: Vec | null;
  /** Where the compass points after `ai.exitHintSeconds` without the exit. */
  hint: Vec | null;
  foes: { x: number; y: number; kind: MonsterKind }[];
  drops: { x: number; y: number; kind: DropKind }[];
  /** Rooms explored n / m: revealed, and all. */
  explored: number;
  total: number;
  /** `ArpgWorld.fogVersion`: the fog layer redraws only when it moves. */
  fogVersion: number;
}
```

In `packages/engine/src/types/index.ts`:

Replace:
```ts
export * from './quests.js';
```
with:
```ts
export * from './quests.js';
export * from './floor-map.js';
```

In `packages/engine/src/types/delve.ts`:

Replace:
```ts
import type { ProfileQuests, QuestsBalance } from './quests.js';
```
with:
```ts
import type { ProfileQuests, QuestsBalance } from './quests.js';
import type { LayoutsData, ShrineDef } from './floor-map.js';
```

Replace:
```ts
  slotWeights: Record<GearSlot, number>;
```
with:
```ts
  slotWeights: Record<GearSlot, number>;
  /** `layouts.json`: room templates and prop sizes (see the floor maps spec). */
  layouts: LayoutsData;
  /** `shrines.json`: the sanctums' blessings. */
  shrines: ShrineDef[];
```

- [ ] **Step 4: The data and its schemas**

Create `packages/engine/src/data/layouts.json`:

```json
{
  "rooms": {
    "default": [
      {
        "id": "square",
        "w": 8,
        "h": 8,
        "masks": [
          [
            "........",
            "........",
            "..#..#..",
            "........",
            "........",
            "..#..#..",
            "........",
            "........"
          ]
        ]
      },
      {
        "id": "long",
        "w": 10,
        "h": 8,
        "masks": []
      },
      {
        "id": "hall",
        "w": 10,
        "h": 10,
        "masks": [
          [
            "..........",
            "..........",
            "..%....%..",
            "..........",
            "....##....",
            "....##....",
            "..........",
            "..%....%..",
            "..........",
            ".........."
          ]
        ]
      },
      {
        "id": "wide",
        "w": 12,
        "h": 10,
        "masks": []
      },
      {
        "id": "great",
        "w": 14,
        "h": 12,
        "masks": [
          [
            "..............",
            "..............",
            "..#...##...#..",
            "..............",
            "..............",
            "..............",
            "..............",
            "..............",
            "..............",
            "..#...##...#..",
            "..............",
            ".............."
          ]
        ]
      }
    ],
    "bone_crypts": [
      {
        "id": "crypt",
        "w": 12,
        "h": 12,
        "masks": [
          [
            "............",
            "............",
            "..#.#..#.#..",
            "............",
            "............",
            "............",
            "............",
            "............",
            "............",
            "..#.#..#.#..",
            "............",
            "............"
          ]
        ]
      },
      {
        "id": "ossuary",
        "w": 8,
        "h": 8,
        "masks": []
      }
    ]
  },
  "boss": {
    "id": "boss",
    "w": 14,
    "h": 14,
    "masks": []
  },
  "props": {
    "chest": 0.9,
    "shrine": 1.4,
    "alcove_anvil": 1.4,
    "exit_gate": 2.6
  }
}
```

Create `packages/engine/src/data/shrines.json`:

```json
[
  {
    "id": "vigor",
    "name": "Shrine of Vigor",
    "text": "+20% damage for this floor",
    "effect": {
      "damage": 0.2
    },
    "duration": "floor",
    "weight": 3
  },
  {
    "id": "renewal",
    "name": "Shrine of Renewal",
    "text": "Regain 1% of your life a second for this floor",
    "effect": {
      "lifeRegen": 0.01
    },
    "duration": "floor",
    "weight": 3
  },
  {
    "id": "clarity",
    "name": "Shrine of Clarity",
    "text": "+50% mana regen for this floor",
    "effect": {
      "manaRegen": 0.5
    },
    "duration": "floor",
    "weight": 3
  },
  {
    "id": "fortune",
    "name": "Shrine of Fortune",
    "text": "+50 Find for this floor",
    "effect": {
      "find": 50
    },
    "duration": "floor",
    "weight": 2
  },
  {
    "id": "mercy",
    "name": "Shrine of Mercy",
    "text": "Refill your potions",
    "effect": {
      "potions": true
    },
    "duration": "floor",
    "weight": 2
  },
  {
    "id": "devotion",
    "name": "Shrine of Devotion",
    "text": "+10% damage for the rest of the dive",
    "effect": {
      "damage": 0.1
    },
    "duration": "dive",
    "weight": 1
  }
]
```

In `packages/engine/src/data/schemas.ts`:

Replace:
```ts
});

/** A count and a power (`split`, `extraShots`). */
```
with:
```ts
});

// --- Floor maps (see the floor maps spec) ---

/** A shrine's blessing: at least one part, and nothing else. */
const ShrineEffectSchema = z
  .object({
    damage: z.number().positive().optional(),
    lifeRegen: z.number().positive().optional(),
    manaRegen: z.number().positive().optional(),
    find: z.number().positive().optional(),
    potions: z.literal(true).optional(),
  })
  .strict()
  .refine((e) => Object.keys(e).length > 0, 'a shrine does something');

/** A blessing on the hero (`HeroEntity.floorBuffs`, `DiveState.diveBuffs`). */
export const BuffSchema = z.object({ shrine: z.string().min(1), effect: ShrineEffectSchema });

/** `shrines.json`: a potion refill is a floor shrine (it acts at once). */
export const ShrinesDataSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      text: z.string().min(1),
      effect: ShrineEffectSchema,
      duration: z.enum(['floor', 'dive']),
      weight: z.number().positive(),
    }),
  )
  .min(1)
  .refine(distinctIds, 'shrine ids differ')
  .refine(
    (ss) => ss.every((s) => s.duration === 'floor' || !s.effect.potions),
    'a refill lasts the floor',
  );

/** A room template: a mask is `h` rows of `w` cells, each '.', '#' or '%'. */
const RoomTemplateSchema = z
  .object({
    id: z.string().min(1),
    w: z.number().int().min(4),
    h: z.number().int().min(4),
    masks: z.array(z.array(z.string())),
  })
  .refine(
    (t) =>
      t.masks.every(
        (m) => m.length === t.h && m.every((row) => row.length === t.w && /^[.#%]+$/.test(row)),
      ),
    'a mask is h rows of w cells',
  );

/** `layouts.json` (the generator checks the sizes against `delve.layout`'s coarse grid). */
export const LayoutsDataSchema = z.object({
  rooms: z
    .record(z.string(), z.array(RoomTemplateSchema).min(1))
    .refine((r) => 'default' in r, 'a default room list'),
  boss: RoomTemplateSchema,
  props: z.object({
    chest: z.number().positive(),
    shrine: z.number().positive(),
    alcove_anvil: z.number().positive(),
    exit_gate: z.number().positive(),
  }),
});

/** A count and a power (`split`, `extraShots`). */
```

In `packages/engine/src/data/loader.ts`:

Replace:
```ts
  QuestsDataSchema,
  RecipesSchema,
  RunesSchema,
```
with:
```ts
  LayoutsDataSchema,
  QuestsDataSchema,
  RecipesSchema,
  RunesSchema,
  ShrinesDataSchema,
```

Replace:
```ts
import rawQuests from './quests.json';
```
with:
```ts
import rawQuests from './quests.json';
import rawLayouts from './layouts.json';
import rawShrines from './shrines.json';
```

Replace:
```ts
  const delve = DelveDataSchema.parse(rawDelve) as unknown as DelveData;
```
with:
```ts
  // layouts.json and shrines.json ride the Delve data (see the floor maps spec).
  const delve = {
    ...DelveDataSchema.parse(rawDelve),
    layouts: LayoutsDataSchema.parse(rawLayouts),
    shrines: ShrinesDataSchema.parse(rawShrines),
  } as unknown as DelveData;
```

- [ ] **Step 5: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-data.test.ts)`
Expected: PASS, 5 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 5 tests in F + 1 files pass (1851 | 5 skipped in 105 | 1 skipped).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-maps-a
(cd packages/engine && npx prettier --write --end-of-line auto src/types/floor-map.ts src/types/index.ts src/types/delve.ts src/data/layouts.json src/data/shrines.json src/data/schemas.ts src/data/loader.ts tests/delve-maps-data.test.ts)
git add packages/engine/src/types/floor-map.ts packages/engine/src/types/index.ts packages/engine/src/types/delve.ts packages/engine/src/data/layouts.json packages/engine/src/data/shrines.json packages/engine/src/data/schemas.ts packages/engine/src/data/loader.ts packages/engine/tests/delve-maps-data.test.ts
git commit -m "feat(engine): floor-map types, layouts.json and shrines.json" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The balance and the grid core

### Task 2: `delve.layout`, `delve.ai`, the vault's and the den's drops

The generator's and the AI's numbers, the vault and den drop tables, `minPackDistance` moved from `arena` to `layout` (the pack placement reads it there; the same 9).

**Files:**
- Modify: `packages/engine/src/data/balance.json` (hand-edited), `src/data/schemas.ts`, `src/types/delve.ts`, `src/types/crafting.ts`, `src/arpg/world.ts`; `packages/engine/tests/delve-maps-data.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-maps-data.test.ts`:

Replace:
```ts
import { LayoutsDataSchema, ShrinesDataSchema } from '../src/data/schemas.js';
```
with:
```ts
import {
  AiBalanceSchema,
  LayoutBalanceSchema,
  LayoutsDataSchema,
  ShrinesDataSchema,
} from '../src/data/schemas.js';
```

Append at the end of the file:
```ts
describe('delve.layout, delve.ai and the vault and den drops', () => {
  const bal = registry.getDelveBalance();

  it('holds the spec numbers; minPackDistance moved from the arena', () => {
    expect(bal.layout).toMatchObject({
      coarseCell: 16,
      coarseCols: 4,
      coarseRows: 4,
      rooms: { base: 5, perDepth: 0.1, max: 8 },
      hallWidth: 3,
      minWall: 2,
      loops: [1, 2],
      alcoveMax: 1,
      minPackDistance: 9,
      packsPerRoom: 2,
    });
    expect(bal.ai).toMatchObject({
      flowEvery: 0.25,
      flowRadius: 30,
      directRange: 4,
      sealGrace: 0.5,
    });
    expect(bal.ai).toMatchObject({ fogEvery: 0.1, exitHintSeconds: 60, shrineChannel: 0.5 });
    expect('minPackDistance' in bal.arena).toBe(false);
    expect(bal.drops.vault.essenceChance).toBeGreaterThan(0);
    expect(bal.drops.den.gearBonus).toBeGreaterThan(0);
  });

  it('fits every room template in a coarse cell inside its walls', () => {
    const { layouts } = registry.getDelveData();
    const fit = bal.layout.coarseCell - bal.layout.minWall;
    for (const t of [...Object.values(layouts.rooms).flat(), layouts.boss]) {
      expect(t.w, t.id).toBeLessThanOrEqual(fit);
      expect(t.h, t.id).toBeLessThanOrEqual(fit);
    }
  });

  it('refuses bands that skip depth 1 or fall, more rooms than the grid, and a bad ai number', () => {
    const band = (fromDepth: number) => ({ fromDepth, weights: bal.layout.kindWeights[0].weights });
    expect(ok(LayoutBalanceSchema, bal.layout)).toBe(true);
    expect(ok(LayoutBalanceSchema, { ...bal.layout, kindWeights: [band(2)] })).toBe(false);
    expect(
      ok(LayoutBalanceSchema, { ...bal.layout, kindWeights: [band(1), band(5), band(5)] }),
    ).toBe(false);
    expect(
      ok(LayoutBalanceSchema, { ...bal.layout, rooms: { base: 5, perDepth: 0, max: 17 } }),
    ).toBe(false);
    expect(ok(AiBalanceSchema, bal.ai)).toBe(true);
    expect(ok(AiBalanceSchema, { ...bal.ai, flowEvery: 0 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-data.test.ts)`
Expected: FAIL: 3 of 8: `AssertionError: expected undefined to match object { coarseCell: 16, coarseCols: 4, …(8) }` (no `delve.layout`), `TypeError: Cannot read properties of undefined (reading 'coarseCell')`, and `TypeError: Cannot read properties of undefined (reading 'safeParse')` (no `LayoutBalanceSchema`).

- [ ] **Step 3: The numbers, their types and schemas**

In `packages/engine/src/data/balance.json`:

Replace:
```json
        "essenceChance": 0.15, "patternChance": 0.35
      },
```
with:
```json
        "essenceChance": 0.15, "patternChance": 0.35
      },
      "vault": { "flux": { "chance": 1, "count": [1, 2] }, "shards": { "chance": 1, "count": [2, 3] }, "shardTierUp": 1, "essenceChance": 0.1 },
      "den": { "gearBonus": 0.25 },
```

Replace:
```json
    "arena": { "step": 0.03333333333333333, "width": 26, "height": 40, "packSpacing": 1.8, "minPackDistance": 9 }
```
with:
```json
    "layout": {
      "coarseCell": 16, "coarseCols": 4, "coarseRows": 4, "rooms": { "base": 5, "perDepth": 0.1, "max": 8 },
      "hallWidth": 3, "minWall": 2, "loops": [1, 2],
      "kindWeights": [
        { "fromDepth": 1, "weights": { "combat": 6, "den": 1, "vault": 1, "sanctum": 1, "alcove": 1 } },
        { "fromDepth": 6, "weights": { "combat": 5, "den": 2, "vault": 1, "sanctum": 1, "alcove": 1 } }
      ],
      "alcoveMax": 1, "deadEndWeight": 3, "minCombatRooms": 2, "vaultGuardChance": 0.35,
      "pillarChance": 0.3, "minPackDistance": 9, "packsPerRoom": 2
    },
    "ai": {
      "flowEvery": 0.25, "flowRadius": 30, "directRange": 4, "leashRadius": 12, "leashSeconds": 3, "sealGrace": 0.5,
      "roomVacuum": true, "sightRadius": 10, "fogEvery": 0.1, "exitHintSeconds": 60, "interactRadius": 1.5, "shrineChannel": 0.5
    },
    "arena": { "step": 0.03333333333333333, "width": 26, "height": 40, "packSpacing": 1.8 }
```

In `packages/engine/src/types/crafting.ts`:

Replace:
```ts
    patternChance: number;
  };
  /** A kill's scrap by foe kind: `scrapLevelFactor(ilvl)` × this × (1 + scrapFind / 100). */
```
with:
```ts
    patternChance: number;
  };
  /**
   * A treasure vault's chest (see the floor maps spec): no gear; its shards come
   * `shardTierUp` tiers above the floor's, and an essence at `essenceChance`.
   */
  vault: { flux: DropEntry; shards: DropEntry; shardTierUp: number; essenceChance: number };
  /** An elite den: added to its elites' gear chance. */
  den: { gearBonus: number };
  /** A kill's scrap by foe kind: `scrapLevelFactor(ilvl)` × this × (1 + scrapFind / 100). */
```

In `packages/engine/src/types/delve.ts`:

Replace:
```ts
import type { LayoutsData, ShrineDef } from './floor-map.js';
```
with:
```ts
import type { AiBalance, LayoutBalance, LayoutsData, ShrineDef } from './floor-map.js';
```

Replace:
```ts
  arena: {
    /** Fixed simulation step in seconds. */
    step: number;
    width: number;
    height: number;
    packSpacing: number;
    minPackDistance: number;
```
with:
```ts
  /** How a floor is generated (see the floor maps spec). */
  layout: LayoutBalance;
  /** How foes path, leash and see, and the floor's timings. */
  ai: AiBalance;
  arena: {
    /** Fixed simulation step in seconds. */
    step: number;
    /** The open room's size, in cells. */
    width: number;
    height: number;
    packSpacing: number;
```

In `packages/engine/src/data/schemas.ts`:

Replace:
```ts
});

/** A count and a power (`split`, `extraShots`). */
```
with:
```ts
});

/** `balance.json → delve.layout`. */
export const LayoutBalanceSchema = z
  .object({
    coarseCell: z.number().int().positive(),
    coarseCols: z.number().int().positive(),
    coarseRows: z.number().int().positive(),
    rooms: z
      .object({
        base: z.number().int().min(2),
        perDepth: z.number().min(0),
        max: z.number().int().min(2),
      })
      .refine((r) => r.base <= r.max, 'base ≤ max'),
    hallWidth: z.number().int().positive(),
    minWall: z.number().int().positive(),
    loops: z
      .tuple([z.number().int().min(0), z.number().int().min(0)])
      .refine(([lo, hi]) => lo <= hi, 'loops run low to high'),
    kindWeights: z
      .array(
        z.object({
          fromDepth: z.number().int().min(1),
          weights: z.object({
            combat: z.number().min(0),
            den: z.number().min(0),
            vault: z.number().min(0),
            sanctum: z.number().min(0),
            alcove: z.number().min(0),
          }),
        }),
      )
      .min(1)
      .refine(
        (bs) =>
          bs[0].fromDepth === 1 && bs.every((b, i) => i === 0 || b.fromDepth > bs[i - 1].fromDepth),
        'bands from depth 1, rising',
      ),
    alcoveMax: z.number().int().min(0),
    deadEndWeight: z.number().min(0),
    minCombatRooms: z.number().int().min(0),
    vaultGuardChance: z.number().min(0).max(1),
    pillarChance: z.number().min(0).max(1),
    minPackDistance: z.number().positive(),
    packsPerRoom: z.number().int().positive(),
  })
  .refine((l) => l.rooms.max <= l.coarseCols * l.coarseRows, 'the rooms fit the coarse grid');

/** `balance.json → delve.ai`. */
export const AiBalanceSchema = z.object({
  flowEvery: z.number().positive(),
  flowRadius: z.number().int().positive(),
  directRange: z.number().min(0),
  leashRadius: z.number().positive(),
  leashSeconds: z.number().min(0),
  sealGrace: z.number().min(0),
  roomVacuum: z.boolean(),
  sightRadius: z.number().positive(),
  fogEvery: z.number().positive(),
  exitHintSeconds: z.number().min(0),
  interactRadius: z.number().positive(),
  shrineChannel: z.number().min(0),
});

/** A count and a power (`split`, `extraShots`). */
```

Replace:
```ts
    patternChance: z.number().min(0).max(1),
  }),
  scrapByKind: perFoe(z.number().min(0)),
```
with:
```ts
    patternChance: z.number().min(0).max(1),
  }),
  vault: z.object({
    flux: DropEntrySchema,
    shards: DropEntrySchema,
    shardTierUp: z.number().int().min(0),
    essenceChance: z.number().min(0).max(1),
  }),
  den: z.object({ gearBonus: z.number().min(0).max(1) }),
  scrapByKind: perFoe(z.number().min(0)),
```

Replace:
```ts
  arena: z.object({
    step: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    packSpacing: z.number().positive(),
    minPackDistance: z.number().positive(),
```
with:
```ts
  layout: LayoutBalanceSchema,
  ai: AiBalanceSchema,
  arena: z.object({
    step: z.number().positive(),
    // The open room's grid: whole cells.
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    packSpacing: z.number().positive(),
```

In `packages/engine/src/arpg/world.ts`:

Replace:
```ts
      const farFromHero = dist(cx, cy, heroX, heroY) >= bal.arena.minPackDistance;
```
with:
```ts
      const farFromHero = dist(cx, cy, heroX, heroY) >= bal.layout.minPackDistance;
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-data.test.ts)`
Expected: PASS, 8 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 8 tests in F + 1 files pass (1854 | 5 skipped in 105 | 1 skipped): the packs stand where they stood.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-a
(cd packages/engine && npx prettier --write --end-of-line auto src/types/delve.ts src/types/crafting.ts src/data/schemas.ts src/arpg/world.ts tests/delve-maps-data.test.ts)
git add packages/engine/src/data/balance.json packages/engine/src/types/delve.ts packages/engine/src/types/crafting.ts packages/engine/src/data/schemas.ts packages/engine/src/arpg/world.ts packages/engine/tests/delve-maps-data.test.ts
git commit -m "feat(engine): delve.layout, delve.ai and the vault and den drops" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: The grid core

`openRoom`, `blocked`, `isWalkable`, `moveCircle`, `snapToWalkable`, `lineOfSight`, implemented and tested on their own (nothing calls them yet).

**Files:**
- Create: `packages/engine/src/arpg/grid.ts`, `packages/engine/tests/arpg-grid.test.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/arpg-grid.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  blocked,
  isWalkable,
  lineOfSight,
  moveCircle,
  openRoom,
  snapToWalkable,
} from '../src/arpg/grid.js';
import { clamp } from '../src/arpg/geometry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { FloorMap } from '../src/types/floor-map.js';

// See the floor maps spec: "Movement and combat on the grid".

/** A map from rows: '.' floor, '#' wall, 'D' one door's cells (closed when `closed`). */
function mapOf(rows: string[], closed = false): FloorMap {
  const map = openRoom(rows[0].length, rows.length);
  const door: { x: number; y: number }[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      map.cells[y * map.width + x] = ch === '#' ? 1 : ch === 'D' ? 2 : 0;
      if (ch === 'D') door.push({ x, y });
    }),
  );
  if (door.length) map.doors.push({ id: 0, cells: door, rooms: [0, 1], closed });
  return map;
}

/** Column 5 a wall, from top to bottom, in a 10 × 10 map. */
const WALL = mapOf(Array.from({ length: 10 }, () => '.....#....'));
/** The same, its row 5 a door. */
const DOORWAY = Array.from({ length: 10 }, (_, y) => (y === 5 ? '.....D....' : '.....#....'));
const R = 0.4;

/** Whether a circle's bounding square overlaps a blocked cell. */
function overlaps(map: FloorMap, p: { x: number; y: number }, r: number): boolean {
  for (let cy = Math.floor(p.y - r + 1e-9); cy <= Math.floor(p.y + r - 1e-9); cy++)
    for (let cx = Math.floor(p.x - r + 1e-9); cx <= Math.floor(p.x + r - 1e-9); cx++)
      if (blocked(map, cx, cy)) return true;
  return false;
}

describe('the open room', () => {
  const room = openRoom(26, 40);

  it("is today's arena: one open room, the hero at (w/2, h − 4)", () => {
    expect(room).toMatchObject({ width: 26, height: 40, open: true, start: { x: 13, y: 36 } });
    expect(room.rooms).toHaveLength(1);
    expect(room.doors).toEqual([]);
    expect(room.cells.every((c) => c === 0)).toBe(true);
  });

  it("moves a circle exactly as the arena's clamp did, from anywhere, by anything", () => {
    const rng = new SeededRNG(5);
    for (let i = 0; i < 2000; i++) {
      const r = 0.2 + rng.next() * 1.4;
      const p = { x: rng.next() * 30 - 2, y: rng.next() * 44 - 2 };
      const dx = (rng.next() - 0.5) * 60;
      const dy = (rng.next() - 0.5) * 60;
      expect(moveCircle(room, p, r, dx, dy)).toEqual({
        x: clamp(p.x + dx, r, 26 - r),
        y: clamp(p.y + dy, r, 40 - r),
      });
    }
  });

  it('snaps a point as the clamps did, and is walkable on exactly the closed rectangle', () => {
    const rng = new SeededRNG(6);
    for (let i = 0; i < 2000; i++) {
      const x = rng.next() * 40 - 7;
      const y = rng.next() * 54 - 7;
      for (const margin of [0, 1])
        expect(snapToWalkable(room, x, y, margin)).toEqual({
          x: Math.max(margin, Math.min(26 - margin, x)),
          y: Math.max(margin, Math.min(40 - margin, y)),
        });
      expect(isWalkable(room, x, y)).toBe(!(x < 0 || y < 0 || x > 26 || y > 40));
    }
    expect([isWalkable(room, 26, 40), isWalkable(room, 0, 0)]).toEqual([true, true]);
  });

  it('lets any two points on it see each other', () => {
    const rng = new SeededRNG(7);
    for (let i = 0; i < 500; i++) {
      const a = { x: rng.next() * 26, y: rng.next() * 40 };
      const b = { x: rng.next() * 26, y: rng.next() * 40 };
      expect(lineOfSight(room, a, b)).toBe(true);
    }
    expect(lineOfSight(room, { x: 0, y: 0 }, { x: 26, y: 40 })).toBe(true);
  });
});

describe('moveCircle', () => {
  it('slides along a wall: the blocked axis stops at it, the other moves on', () => {
    expect(moveCircle(WALL, { x: 3.5, y: 5 }, R, 3, 1)).toEqual({ x: 5 - R, y: 6 });
    expect(moveCircle(WALL, { x: 7.5, y: 5 }, R, -3, -1)).toEqual({ x: 6 + R, y: 4 });
  });

  it('never tunnels, however far one step goes', () => {
    expect(moveCircle(WALL, { x: 1, y: 5 }, R, 100, 0).x).toBe(5 - R);
    expect(moveCircle(WALL, { x: 9, y: 5 }, R, -100, 0).x).toBe(6 + R);
  });

  it('holds the map edges as walls', () => {
    expect(moveCircle(WALL, { x: 1, y: 1 }, R, -5, -5)).toEqual({ x: R, y: R });
    expect(moveCircle(WALL, { x: 9, y: 9 }, R, 5, 5)).toEqual({ x: 10 - R, y: 10 - R });
  });

  it('puts a circle pressed into a wall back out; a closed door stops it, an open one not', () => {
    expect(moveCircle(WALL, { x: 4.9, y: 5 }, R, 0, 0)).toEqual({ x: 5 - R, y: 5 });
    expect(moveCircle(mapOf(DOORWAY, true), { x: 3.5, y: 5.5 }, R, 3, 0).x).toBe(5 - R);
    expect(moveCircle(mapOf(DOORWAY, false), { x: 3.5, y: 5.5 }, R, 3, 0).x).toBe(6.5);
  });

  it('never ends inside a wall: random moves among pillars', () => {
    const map = mapOf([
      '............',
      '..#.....#...',
      '.....##.....',
      '..#.....#...',
      '........##..',
      '.##.........',
      '......#.....',
      '............',
    ]);
    const rng = new SeededRNG(9);
    let p = { x: 0.5, y: 0.5 };
    for (let i = 0; i < 5000; i++) {
      const r = 0.25 + rng.next() * 0.2;
      if (overlaps(map, p, r)) p = { x: 0.5, y: 0.5 };
      p = moveCircle(map, p, r, (rng.next() - 0.5) * 6, (rng.next() - 0.5) * 6);
      expect(overlaps(map, p, r), `${p.x}, ${p.y} r ${r}`).toBe(false);
    }
  });
});

describe('snapToWalkable', () => {
  it('moves a point in a wall to the nearest walkable cell, inside the margin', () => {
    expect(snapToWalkable(WALL, 5.2, 3.5)).toEqual({ x: 4.5, y: 3.5 });
    expect(snapToWalkable(WALL, 5.8, 3.5)).toEqual({ x: 6.5, y: 3.5 });
    expect(snapToWalkable(WALL, -3, 20, 1)).toEqual({ x: 1, y: 9 });
  });
});

describe('lineOfSight', () => {
  it('stops at a wall, a closed door and the map edge; passes an open door', () => {
    expect(lineOfSight(WALL, { x: 2, y: 2 }, { x: 8, y: 8 })).toBe(false);
    expect(lineOfSight(WALL, { x: 2, y: 2 }, { x: 4.9, y: 9 })).toBe(true);
    expect(lineOfSight(WALL, { x: 2, y: 2 }, { x: 5.5, y: 2 })).toBe(false);
    expect(lineOfSight(WALL, { x: 2, y: 2 }, { x: -1, y: 2 })).toBe(false);
    expect(lineOfSight(mapOf(DOORWAY, false), { x: 2, y: 5.5 }, { x: 8, y: 5.5 })).toBe(true);
    expect(lineOfSight(mapOf(DOORWAY, true), { x: 2, y: 5.5 }, { x: 8, y: 5.5 })).toBe(false);
  });

  it('sees past a pillar only where nothing is in the way, never through a diagonal crack', () => {
    const map = mapOf(['......', '..#...', '......', '......']);
    expect(lineOfSight(map, { x: 0.5, y: 0.5 }, { x: 5.5, y: 0.5 })).toBe(true);
    expect(lineOfSight(map, { x: 0.5, y: 1.5 }, { x: 5.5, y: 1.5 })).toBe(false);
    expect(lineOfSight(map, { x: 0.5, y: 2.5 }, { x: 5.5, y: 0.5 })).toBe(false);
    expect(lineOfSight(mapOf(['.#', '#.']), { x: 0.5, y: 0.5 }, { x: 1.5, y: 1.5 })).toBe(false);
  });

  it('is the same both ways', () => {
    const map = mapOf(['........', '..#..#..', '...##...', '........', '.#....#.']);
    const rng = new SeededRNG(3);
    for (let i = 0; i < 500; i++) {
      const a = { x: rng.next() * 8, y: rng.next() * 5 };
      const b = { x: rng.next() * 8, y: rng.next() * 5 };
      expect(lineOfSight(map, a, b)).toBe(lineOfSight(map, b, a));
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/arpg-grid.test.ts)`
Expected: FAIL: `Error: Cannot find module '../src/arpg/grid.js' imported from '…/tests/arpg-grid.test.ts'` (no test runs).

- [ ] **Step 3: The grid**

Create `packages/engine/src/arpg/grid.ts`:

```ts
import type { Vec } from '../types/arpg.js';
import type { FloorMap } from '../types/floor-map.js';
import { clamp } from './geometry.js';

/**
 * The floor grid (see the floor maps spec): 1-unit cells, out of bounds a
 * wall, a closed door's cells walls too. A point on the map's far edge
 * (x = width, y = height) is in its last cell, so the map is the closed
 * rectangle [0, width] × [0, height], as the arena's clamps had it.
 */

const EPS = 1e-9;

/** Today's arena as a map: one open room, the hero starting at (w/2, h − 4). */
export function openRoom(width: number, height: number): FloorMap {
  const start = { x: width / 2, y: height - 4 };
  return {
    width,
    height,
    cells: new Uint8Array(width * height),
    rooms: [
      {
        id: 0,
        kind: 'combat',
        rect: { x: 0, y: 0, w: width, h: height },
        revealed: true,
        cleared: false,
        sealed: false,
      },
    ],
    doors: [],
    start,
    exit: { ...start },
    open: true,
  };
}

/** Whether cell (cx, cy) stops movement and sight: out of bounds, a wall, or a closed door's. */
export function blocked(map: FloorMap, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return true;
  const cell = map.cells[cy * map.width + cx];
  if (cell !== 2) return cell === 1;
  // ponytail: scans the doors for each door cell; index them if sealing ever runs hot.
  return map.doors.some((d) => d.closed && d.cells.some((c) => c.x === cx && c.y === cy));
}

/** The cell a coordinate falls in along an axis of `n` cells (the far edge is the last cell's). */
function cellOf(v: number, n: number): number {
  return v === n ? n - 1 : Math.floor(v);
}

/** Whether the point (x, y) stands on a cell nothing blocks (out of the map counts as blocked). */
export function isWalkable(map: FloorMap, x: number, y: number): boolean {
  return !blocked(map, cellOf(x, map.width), cellOf(y, map.height));
}

/**
 * Move a circle by (dx, dy), sliding along walls: x first, then y, each axis
 * stopping where the circle's bounding square (half-side `radius`) would
 * touch the first blocked cell along its sweep, so nothing tunnels however
 * far it moves. A circle already pressed into a wall beside it is put back
 * out, and the map's edges hold it `radius` inside. In the open room this is
 * the arena's clamp to [r, width − r] × [r, height − r] exactly.
 */
export function moveCircle(map: FloorMap, pos: Vec, radius: number, dx: number, dy: number): Vec {
  const x = slide(map, pos.x, pos.y, radius, dx, true);
  return { x, y: slide(map, pos.y, x, radius, dy, false) };
}

/** One axis of `moveCircle`: `at` along the axis (x when `alongX`), `across` the other coordinate. */
function slide(
  map: FloorMap,
  at: number,
  across: number,
  r: number,
  d: number,
  alongX: boolean,
): number {
  const n = alongX ? map.width : map.height;
  const m = alongX ? map.height : map.width;
  // The rows (or columns) the square covers across the axis.
  const first = Math.max(0, Math.floor(across - r + EPS));
  const last = Math.min(m - 1, Math.floor(across + r - EPS));
  const wall = (c: number) => {
    for (let k = first; k <= last; k++)
      if (alongX ? blocked(map, c, k) : blocked(map, k, c)) return true;
    return false;
  };
  const c0 = Math.floor(at);
  let lo = r;
  let hi = n - r;
  const ahead = at + Math.max(0, d) + r;
  for (let c = Math.max(0, c0 + 1); c < n && c < ahead - EPS; c++)
    if (wall(c)) {
      hi = Math.min(hi, c - r);
      break;
    }
  const behind = at + Math.min(0, d) - r;
  for (let c = Math.min(n - 1, c0 - 1); c >= 0 && c + 1 > behind + EPS; c--)
    if (wall(c)) {
      lo = Math.max(lo, c + 1 + r);
      break;
    }
  return clamp(at + d, lo, hi);
}

/**
 * (x, y) kept `margin` inside the map's edges; if that is a blocked cell, the
 * centre of the nearest walkable cell instead (ring by ring around it). In the
 * open room this is the arena's clamp to [margin, width − margin] ×
 * [margin, height − margin] exactly.
 */
export function snapToWalkable(map: FloorMap, x: number, y: number, margin = 0): Vec {
  const p = { x: clamp(x, margin, map.width - margin), y: clamp(y, margin, map.height - margin) };
  if (isWalkable(map, p.x, p.y)) return p;
  const cx = cellOf(p.x, map.width);
  const cy = cellOf(p.y, map.height);
  for (let ring = 1; ring < Math.max(map.width, map.height); ring++) {
    let best: Vec | null = null;
    let bestD = Infinity;
    for (let j = cy - ring; j <= cy + ring; j++)
      for (let i = cx - ring; i <= cx + ring; i++) {
        if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== ring || blocked(map, i, j)) continue;
        const d = (i + 0.5 - p.x) ** 2 + (j + 0.5 - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: i + 0.5, y: j + 0.5 };
        }
      }
    if (best) return best;
  }
  return p;
}

/**
 * Whether nothing blocks the segment from `a` to `b`: a DDA walk of the cells
 * it crosses, both ends included. A segment through a cell corner is blocked
 * if either cell beside the corner is, so nothing sees through a diagonal
 * crack. In the open room any two points on the map see each other.
 */
export function lineOfSight(map: FloorMap, a: Vec, b: Vec): boolean {
  let cx = cellOf(a.x, map.width);
  let cy = cellOf(a.y, map.height);
  if (blocked(map, cx, cy) || !isWalkable(map, b.x, b.y)) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  // Where along the segment (0 at a, 1 at b) it crosses the next column (row) line, worked out
  // afresh each step so no error builds up.
  const tx = () => (sx ? (cx + (sx > 0 ? 1 : 0) - a.x) / dx : Infinity);
  const ty = () => (sy ? (cy + (sy > 0 ? 1 : 0) - a.y) / dy : Infinity);
  for (let x = tx(), y = ty(); Math.min(x, y) < 1; x = tx(), y = ty()) {
    if (x === y && (blocked(map, cx + sx, cy) || blocked(map, cx, cy + sy))) return false;
    if (x <= y) cx += sx;
    if (y <= x) cy += sy;
    if (blocked(map, cx, cy)) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/arpg-grid.test.ts)`
Expected: PASS, 13 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 21 tests in F + 2 files pass (1867 | 5 skipped in 106 | 1 skipped).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-a
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/grid.ts tests/arpg-grid.test.ts)
git add packages/engine/src/arpg/grid.ts packages/engine/tests/arpg-grid.test.ts
git commit -m "feat(engine): the floor grid: moveCircle, lineOfSight, walkable and snap helpers, openRoom" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The world on the grid

### Task 4: The world on a map

`ArpgWorld.map` (the open room), its fog, flow, seal, channel and exit fields; foes' room and leash fields; drops' room; `FloorOptions.layout`.

**Files:**
- Create: `packages/engine/tests/delve-maps-contract.test.ts`
- Modify: `packages/engine/src/types/arpg.ts`, `src/arpg/world.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-maps-contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { arena, dummy, registry } from './fixtures/arena.js';

// The floor maps contract (see the floor maps spec's "Phases and parallel areas"):
// the fields and hooks the areas fill exist from the start, and the open room plays as before.

const diving = () => startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);

describe('the world on a map', () => {
  it("stands on the open room, the hero at its start; the map's fields start empty", () => {
    const w = arena([dummy(13, 20)]);
    expect(w.map.open).toBe(true);
    expect([w.width, w.height]).toEqual([w.map.width, w.map.height]);
    expect([w.hero.x, w.hero.y]).toEqual([w.map.start.x, w.map.start.y]);
    expect(w.fog).toHaveLength(w.width * w.height);
    expect(w.fog.every((c) => c === 2)).toBe(true);
    expect(w).toMatchObject({
      fogVersion: 0,
      exitHinted: false,
      flow: { small: null, large: null },
      sealing: null,
      channel: null,
      exited: false,
    });
    expect(w.monsters[0]).toMatchObject({ roomId: null, farSince: null, goingHome: false });
  });

  it('a dive floor is open too until the generator lands, its packs placed as before', () => {
    const w = beginFloor(registry, diving());
    expect(w.map.open).toBe(true);
    expect(w.monsters.length).toBeGreaterThan(0);
    expect(w.monsters.every((m) => m.roomId === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-contract.test.ts)`
Expected: FAIL: 2 of 2: `TypeError: Cannot read properties of undefined (reading 'open')` (no `world.map`).

- [ ] **Step 3: The fields and their starting values**

In `packages/engine/src/types/arpg.ts`:

Replace:
```ts
import type { QuestEvent } from './quests.js';
```
with:
```ts
import type { QuestEvent } from './quests.js';
import type { FloorMap } from './floor-map.js';
```

Replace:
```ts
  packId: number;
```
with:
```ts
  packId: number;
  /** Its room on a generated floor (see the floor maps spec); null in the open room. */
  roomId: number | null;
  /** Since when it has been beyond its leash (`ai.leashRadius` from its room's centre), else null. */
  farSince: number | null;
  /** Leashed: going home along its room's `homeField`, to heal and sleep. */
  goingHome: boolean;
```

Replace:
```ts
  firstEssence?: boolean;
```
with:
```ts
  firstEssence?: boolean;
  /** The room of the foe it fell from (none: a hall's, or the open room's): its last kill pulls it in. */
  roomId?: number;
```

Replace:
```ts
  width: number;
  height: number;
```
with:
```ts
  /** The floor's grid, rooms and doors (see the floor maps spec): `width` and `height` are its size. */
  map: FloorMap;
  width: number;
  height: number;
  /** Each cell's fog: 0 unseen, 1 seen, 2 in sight now (the open room's: all 2). */
  fog: Uint8Array;
  /** Moves on whenever `fog` changes: the minimap redraws its fog then. */
  fogVersion: number;
  /** When `fogTick` next runs (an `ai.fogEvery` mark). */
  fogAt: number;
  /** The exit hint has fired. */
  exitHinted: boolean;
  /**
   * The flow fields toward the hero (`flowTick`), one per clearance class (`large`:
   * big foes'): steps by cell, null until built; rebuilt at `nextAt`.
   */
  flow: { small: Uint16Array | null; large: Uint16Array | null; nextAt: number };
  /** The room whose doors are closing, since when (they wait `ai.sealGrace` for the doorway), or null. */
  sealing: { roomId: number; since: number } | null;
  /** A shrine's prayer under way (`interactTick`): its interactable, where and when it began, its end. */
  channel: { id: string; x: number; y: number; start: number; until: number } | null;
  /** The hero took the exit (`exitFloor`): a generated floor ends on it, the open room on `cleared`. */
  exited: boolean;
```

In `packages/engine/src/arpg/world.ts`:

Replace:
```ts
import type { ManaType } from '../types/mana.js';
```
with:
```ts
import type { ManaType } from '../types/mana.js';
import type { FloorLayout } from '../types/floor-map.js';
```

Replace:
```ts
import { dist } from './geometry.js';
```
with:
```ts
import { dist } from './geometry.js';
import { openRoom } from './grid.js';
```

Replace:
```ts
  empty?: boolean;
```
with:
```ts
  empty?: boolean;
  /**
   * The map: `'open'` (the default: today's arena, `openRoom`) or `'generated'` (dives;
   * the generated path is the generator's to add, so until then every floor is open).
   */
  layout?: FloorLayout;
```

Replace:
```ts
  packId: number;
```
with:
```ts
  packId: number;
  /** Its room on a generated floor (default none). */
  roomId?: number | null;
```

Replace:
```ts
    packId: spawn.packId,
```
with:
```ts
    packId: spawn.packId,
    roomId: spawn.roomId ?? null,
    farSince: null,
    goingHome: false,
```

Replace:
```ts
  const { width, height } = bal.arena;
  const heroX = width / 2;
  const heroY = height - 4;
```
with:
```ts
  const map = openRoom(bal.arena.width, bal.arena.height);
  const { width, height } = map;
  const { x: heroX, y: heroY } = map.start;
```

Replace:
```ts
    width,
    height,
```
with:
```ts
    map,
    width,
    height,
    fog: new Uint8Array(width * height).fill(2),
    fogVersion: 0,
    fogAt: 0,
    exitHinted: false,
    flow: { small: null, large: null, nextAt: 0 },
    sealing: null,
    channel: null,
    exited: false,
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-contract.test.ts)`
Expected: PASS, 2 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 23 tests in F + 3 files pass (1869 | 5 skipped in 107 | 1 skipped).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-a
(cd packages/engine && npx prettier --write --end-of-line auto src/types/arpg.ts src/arpg/world.ts tests/delve-maps-contract.test.ts)
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/tests/delve-maps-contract.test.ts
git commit -m "feat(engine): the arena stands on a FloorMap (the open room) with the floor-map fields" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: Every arena clamp through the grid

The 14 sites listed in "The clamp swap". A refactor: on the open room every result is the old clamp's, to the bit; a wall now holds.

**Files:**
- Create: `packages/engine/tests/delve-maps-movers.test.ts`
- Modify: `packages/engine/src/arpg/step.ts`, `dodge.ts`, `action.ts`, `combat.ts`, `material-drops.ts`, `rune-drops.ts`, `abilities/forms.ts`, `abilities/targeting.ts`, `abilities/impact.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-maps-movers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isWalkable, openRoom } from '../src/arpg/grid.js';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { arena, dodge, dummy, registry, run } from './fixtures/arena.js';

// The arena's rectangle clamps go through the grid (see the floor maps spec's
// "Movement and combat on the grid"): in the open room nothing changes; a wall
// now holds. The rest of the movers and every hit site are B2's.

/** The fixture's world with walls at these cells (its open room otherwise). */
function walled(w: ArpgWorld, cells: [number, number][]): ArpgWorld {
  w.map = openRoom(w.width, w.height);
  for (const [x, y] of cells) w.map.cells[y * w.width + x] = 1;
  return w;
}
/** Row 30 a wall from side to side: the hero starts below it, at (13, 36). */
const ROW_30 = Array.from({ length: 26 }, (_, x) => [x, 30] as [number, number]);

describe('the clamps on the grid', () => {
  it('a wall stops the walk and the dodge', () => {
    const w = walled(arena([dummy(2, 2)], { noBasic: true }), ROW_30);
    run(w, 3, { x: 0, y: -1 });
    expect(w.hero.y).toBeCloseTo(31 + w.hero.radius, 9);
    w.hero.y = 32;
    dodge(w, { x: 0, y: -1 });
    run(w, 0.5);
    expect(w.hero.y).toBeCloseTo(31 + w.hero.radius, 9);
  });

  it('a foe pressed into a wall is put back out', () => {
    const w = walled(arena([dummy(13, 29.8)], { noBasic: true }), ROW_30);
    run(w, 0.1);
    expect(w.monsters[0].y).toBeCloseTo(30 - w.monsters[0].radius, 9);
  });

  it('a shot ends in a wall', () => {
    const w = walled(arena([dummy(2, 2)], { noBasic: true }), ROW_30);
    spawnProjectile(makeCtx(registry, w, []), {
      ...{ owner: 'monster', form: null, ability: null, homingId: null, x: 13, y: 33 },
      ...{ vx: 0, vy: -8, radius: 0.3, damage: 1, element: null, pierce: false, maxDist: 20 },
      ...{ explodeRadius: 0, applies: [], knockback: 0 },
    });
    run(w, 0.5);
    expect(w.projectiles).toEqual([]);
  });

  it("a foe's loot lands on a walkable cell, even when it falls in a pocket", () => {
    // A nook three cells tall, (13, 18) to (13, 20), walled all round.
    const pocket: [number, number][] = [];
    for (let y = 17; y <= 23; y++)
      for (let x = 10; x <= 16; x++)
        if (!(x === 13 && (y === 20 || y === 19 || y === 18))) pocket.push([x, y]);
    const w = walled(arena([dummy(13.5, 20.5, { kind: 'elite', hp: 1 })]), pocket);
    killMonster(makeCtx(registry, w, []), w.monsters[0]);
    const placed = w.drops.filter((d) => d.kind !== 'mote' && d.kind !== 'orb');
    expect(placed.length).toBeGreaterThan(0);
    for (const d of placed)
      expect(isWalkable(w.map, d.x, d.y), `${d.kind} ${d.x}, ${d.y}`).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-movers.test.ts)`
Expected: FAIL, 4 of 4: `expected 20.40000000000012 to be close to 31.5` (the hero walks through the wall), `expected 29.8 to be close to 29.67` (the foe stays in it), `expected [ { owner: 'monster', …(20) } ] to deeply equal []` (the shot flies on) and `scrap 12.33…, 20.67…: expected false to be true` (a pickup lands in the wall).

- [ ] **Step 3: The swap**

In `packages/engine/src/arpg/step.ts`:

Replace:
```ts
import { clamp, clampLen, dirTo, dist } from './geometry.js';
```
with:
```ts
import { clampLen, dirTo, dist } from './geometry.js';
import { isWalkable, moveCircle, snapToWalkable } from './grid.js';
```

Replace:
```ts
    h.x = clamp(h.x + v.x * pace * dt, h.radius, world.width - h.radius);
    h.y = clamp(h.y + v.y * pace * dt, h.radius, world.height - h.radius);
```
with:
```ts
    Object.assign(h, moveCircle(world.map, h, h.radius, v.x * pace * dt, v.y * pace * dt));
```

Replace:
```ts
    const outside = p.x < 0 || p.y < 0 || p.x > world.width || p.y > world.height;
```
with:
```ts
    // In a wall or off the map.
    const outside = !isWalkable(world.map, p.x, p.y);
```

Replace:
```ts
          x: clamp(m.x + (i === 0 ? -1.8 : 1.8), 1, world.width - 1),
          y: clamp(m.y + 1.2, 1, world.height - 1),
```
with:
```ts
          ...snapToWalkable(world.map, m.x + (i === 0 ? -1.8 : 1.8), m.y + 1.2, 1),
```

Replace:
```ts
  for (const m of ms) {
    m.x = clamp(m.x, m.radius, world.width - m.radius);
    m.y = clamp(m.y, m.radius, world.height - m.radius);
  }
  h.x = clamp(h.x, h.radius, world.width - h.radius);
  h.y = clamp(h.y, h.radius, world.height - h.radius);
```
with:
```ts
  // Whatever the moves and pushes left pressed into a wall goes back out.
  for (const m of ms) Object.assign(m, moveCircle(world.map, m, m.radius, 0, 0));
  Object.assign(h, moveCircle(world.map, h, h.radius, 0, 0));
```

In `packages/engine/src/arpg/dodge.ts`:

Replace:
```ts
import { clamp, clampLen, dirTo } from './geometry.js';
```
with:
```ts
import { clampLen, dirTo } from './geometry.js';
import { moveCircle } from './grid.js';
```

Replace:
```ts
  h.x = clamp(d.fromX + d.dir.x * k, h.radius, world.width - h.radius);
  h.y = clamp(d.fromY + d.dir.y * k, h.radius, world.height - h.radius);
```
with:
```ts
  // Swept from where it began, so a wall stops it.
  const from = { x: d.fromX, y: d.fromY };
  Object.assign(h, moveCircle(world.map, from, h.radius, d.dir.x * k, d.dir.y * k));
```

In `packages/engine/src/arpg/action.ts`:

Replace:
```ts
import { clamp } from './geometry.js';
```
with:
```ts
import { moveCircle } from './grid.js';
```

Replace:
```ts
 * clamped to the arena, and cut at its stop foe's contact gap. Returns whether
```
with:
```ts
 * stopped at walls, and cut at its stop foe's contact gap. Returns whether
```

Replace:
```ts
  const x = clamp(h.x + dx, h.radius, world.width - h.radius);
  const y = clamp(h.y + dy, h.radius, world.height - h.radius);
```
with:
```ts
  const { x, y } = moveCircle(world.map, h, h.radius, dx, dy);
```

In `packages/engine/src/arpg/abilities/forms.ts`:

Replace:
```ts
import { angleBetween, clamp, dirTo, dist, distToSegment } from '../geometry.js';
```
with:
```ts
import { angleBetween, dirTo, dist, distToSegment } from '../geometry.js';
import { moveCircle, snapToWalkable } from '../grid.js';
```

Replace:
```ts
      h.x = clamp(h.x + dir.x * d, h.radius, world.width - h.radius);
      h.y = clamp(h.y + dir.y * d, h.radius, world.height - h.radius);
```
with:
```ts
      Object.assign(h, moveCircle(world.map, h, h.radius, dir.x * d, dir.y * d));
```

Replace:
```ts
          x: clamp(p.x + Math.cos(a) * r, 0, world.width),
          y: clamp(p.y + Math.sin(a) * r, 0, world.height),
```
with:
```ts
          ...snapToWalkable(world.map, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r),
```

In `packages/engine/src/arpg/abilities/targeting.ts`:

Replace:
```ts
import { clamp, dirTo, dist } from '../geometry.js';
```
with:
```ts
import { dirTo, dist } from '../geometry.js';
import { snapToWalkable } from '../grid.js';
```

Replace:
```ts
    return {
      x: clamp(h.x + (aim.x - h.x) * k, 0, world.width),
      y: clamp(h.y + (aim.y - h.y) * k, 0, world.height),
    };
```
with:
```ts
    return snapToWalkable(world.map, h.x + (aim.x - h.x) * k, h.y + (aim.y - h.y) * k);
```

In `packages/engine/src/arpg/abilities/impact.ts`:

Replace:
```ts
import { dirTo, dist } from '../geometry.js';
```
with:
```ts
import { dirTo, dist } from '../geometry.js';
import { snapToWalkable } from '../grid.js';
```

Replace:
```ts
    x = Math.max(0, Math.min(world.width, x + Math.cos(a) * r));
    y = Math.max(0, Math.min(world.height, y + Math.sin(a) * r));
```
with:
```ts
    ({ x, y } = snapToWalkable(world.map, x + Math.cos(a) * r, y + Math.sin(a) * r));
```

In `packages/engine/src/arpg/combat.ts`:

Replace:
```ts
import { dirTo, dist } from './geometry.js';
```
with:
```ts
import { dirTo, dist } from './geometry.js';
import { snapToWalkable } from './grid.js';
```

Replace:
```ts
    const x = Math.max(1, Math.min(world.width - 1, m.x + Math.cos(angle) * r));
    const y = Math.max(1, Math.min(world.height - 1, m.y + Math.sin(angle) * r));
```
with:
```ts
    const { x, y } = snapToWalkable(
      world.map,
      m.x + Math.cos(angle) * r,
      m.y + Math.sin(angle) * r,
      1,
    );
```

In `packages/engine/src/arpg/material-drops.ts`:

Replace:
```ts
import type { SimCtx } from './combat.js';
```
with:
```ts
import type { SimCtx } from './combat.js';
import { snapToWalkable } from './grid.js';
```

Replace:
```ts
    const x = Math.max(1, Math.min(world.width - 1, m.x + Math.cos(angle) * r));
    const y = Math.max(1, Math.min(world.height - 1, m.y + Math.sin(angle) * r));
```
with:
```ts
    const { x, y } = snapToWalkable(
      world.map,
      m.x + Math.cos(angle) * r,
      m.y + Math.sin(angle) * r,
      1,
    );
```

In `packages/engine/src/arpg/rune-drops.ts`:

Replace:
```ts
import type { SimCtx } from './combat.js';
```
with:
```ts
import type { SimCtx } from './combat.js';
import { snapToWalkable } from './grid.js';
```

Replace:
```ts
  const x = Math.max(1, Math.min(world.width - 1, m.x + Math.cos(angle) * r));
  const y = Math.max(1, Math.min(world.height - 1, m.y + Math.sin(angle) * r));
```
with:
```ts
  const { x, y } = snapToWalkable(
    world.map,
    m.x + Math.cos(angle) * r,
    m.y + Math.sin(angle) * r,
    1,
  );
```

- [ ] **Step 4: Run it to see it pass, then the suite (parity)**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-movers.test.ts)`
Expected: PASS, 4 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 27 tests in F + 4 files pass (1873 | 5 skipped in 108 | 1 skipped). Every pinned number holds (the DPS Lab's, the rune gates', the pacing rails'): the swap is exact on the open room. If one moves, a site was swapped with a different expression (each new call computes `old + delta` as the clamp did); compare it with the clamp it replaced before going on.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-a
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/step.ts src/arpg/dodge.ts src/arpg/action.ts src/arpg/combat.ts src/arpg/material-drops.ts src/arpg/rune-drops.ts src/arpg/abilities/forms.ts src/arpg/abilities/targeting.ts src/arpg/abilities/impact.ts tests/delve-maps-movers.test.ts)
git add packages/engine/src/arpg/step.ts packages/engine/src/arpg/dodge.ts packages/engine/src/arpg/action.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/material-drops.ts packages/engine/src/arpg/rune-drops.ts packages/engine/src/arpg/abilities/forms.ts packages/engine/src/arpg/abilities/targeting.ts packages/engine/src/arpg/abilities/impact.ts packages/engine/tests/delve-maps-movers.test.ts
git commit -m "refactor(engine): every arena clamp goes through the grid (identical on the open room)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: Blessings and the save

### Task 6: The hero's blessings

`applyBuffs`, `HeroStats.lifeRegen`, `HeroEntity.baseStats` / `floorBuffs` / `diveBuffs`, `FloorOptions.diveBuffs` (with their Find), `refreshWorldHero` putting them back on, `worldStats`, and a blessing's life regen in `heroTick`. With no blessing every stat object is the one passed in.

**Files:**
- Create: `packages/engine/tests/delve-maps-buffs.test.ts`
- Modify: `packages/engine/src/types/delve.ts`, `src/types/arpg.ts`, `src/delve/hero-stats.ts`, `src/delve/pair.ts`, `src/arpg/world.ts`, `src/arpg/step.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-maps-buffs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createFloorWorld, refreshWorldHero } from '../src/arpg/world.js';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { applyBuffs, computeHeroStats, manaPool } from '../src/delve/hero-stats.js';
import { profileStats, worldStats } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { heroChains } from '../src/loot/moveset.js';
import type { Buff } from '../src/types/floor-map.js';
import { DEFAULT_CHAINS, arena, dummy, gear, registry, run } from './fixtures/arena.js';

// See the floor maps spec: "Shrine (sanctum room)" and its stats.

const VIGOR: Buff = { shrine: 'vigor', effect: { damage: 0.2 } };
const CLARITY: Buff = { shrine: 'clarity', effect: { manaRegen: 0.5 } };
const RENEWAL: Buff = { shrine: 'renewal', effect: { lifeRegen: 0.01 } };
const DEVOTION: Buff = { shrine: 'devotion', effect: { damage: 0.1, find: 50 } };
const STATS = computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry);

/** The fixture's floor (depth 2, no foes), the hero wearing `diveBuffs`. */
function blessed(diveBuffs: Buff[]) {
  return createFloorWorld(registry, {
    ...{ depth: 2, door: null, stats: STATS, chains: DEFAULT_CHAINS, heroHpFrac: 1, potions: 3 },
    ...{ phoenixAvailable: true, seed: 77, empty: true, diveBuffs },
    loot: {
      ...{ nextUid: 100, find: 10, legendaryBoost: 1, firstEssence: false },
      ...{ patterns: [], dropsGiven: [], pair: [] },
    },
  });
}

describe('applyBuffs', () => {
  it('multiplies damage and mana regen and adds life regen; no blessing leaves the stats as they are', () => {
    expect(applyBuffs(STATS, [])).toBe(STATS);
    const s = applyBuffs(STATS, [VIGOR, CLARITY, RENEWAL, DEVOTION]);
    expect(s.damageMult).toBeCloseTo(STATS.damageMult * 1.2 * 1.1, 12);
    expect(s.manaRegenMult).toBeCloseTo(STATS.manaRegenMult * 1.5, 12);
    expect(s.lifeRegen).toBeCloseTo(0.01, 12);
    expect({ ...s, damageMult: 0, manaRegenMult: 0, lifeRegen: 0 }).toEqual({
      ...STATS,
      damageMult: 0,
      manaRegenMult: 0,
      lifeRegen: 0,
    });
  });
});

describe("the hero's blessings", () => {
  it("wears the dive's from the start: its stats, its pool and the floor's Find", () => {
    const w = blessed([DEVOTION, CLARITY]);
    const h = w.hero;
    expect(h.diveBuffs).toEqual([DEVOTION, CLARITY]);
    expect(h.floorBuffs).toEqual([]);
    expect(h.stats).toBe(h.baseStats);
    expect(h.stats.damageMult).toBeCloseTo(STATS.damageMult * 1.1, 12);
    expect(h.manaRegen).toBeCloseTo(manaPool(applyBuffs(STATS, [CLARITY]), registry).regen, 12);
    expect(w.loot.find).toBe(60);
    expect(blessed([]).hero.stats).toBe(STATS);
  });

  it("a refresh puts the dive's and the floor's blessings back on its new gear", () => {
    const w = blessed([DEVOTION]);
    const h = w.hero;
    h.floorBuffs = [VIGOR];
    refreshWorldHero(registry, w, STATS, DEFAULT_CHAINS);
    expect(h.baseStats.damageMult).toBeCloseTo(STATS.damageMult * 1.1, 12);
    expect(h.stats.damageMult).toBeCloseTo(STATS.damageMult * 1.1 * 1.2, 12);
  });

  it("worldStats is the profile's stats as the world's hero wears them", () => {
    const p = startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);
    const w = beginFloor(registry, p);
    expect(worldStats(registry, p, w)).toEqual(profileStats(registry, p));
    w.hero.diveBuffs = [DEVOTION];
    w.hero.floorBuffs = [VIGOR, CLARITY];
    refreshWorldHero(
      registry,
      w,
      profileStats(registry, p),
      heroChains(registry, p.equipped, p.pair),
    );
    expect(worldStats(registry, p, w)).toEqual(w.hero.stats);
  });

  it("a blessing's life regen heals", () => {
    const w = arena([dummy(2, 2)], { noBasic: true });
    w.hero.floorBuffs = [RENEWAL];
    w.hero.stats = applyBuffs(w.hero.baseStats, w.hero.floorBuffs);
    w.hero.hp = w.hero.stats.maxHp / 2;
    run(w, 1);
    expect(w.hero.hp).toBeCloseTo(w.hero.stats.maxHp * 0.51, 6);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-buffs.test.ts)`
Expected: FAIL: 5 of 5: `TypeError: (0 , applyBuffs) is not a function` (twice), `TypeError: (0 , worldStats) is not a function`, `AssertionError: expected undefined to deeply equal [ { shrine: 'devotion', …(1) }, …(1) ]` (no `hero.diveBuffs`) and `TypeError: Cannot read properties of undefined (reading 'damageMult')` (no `baseStats`).

- [ ] **Step 3: The blessings**

In `packages/engine/src/types/delve.ts`:

Replace:
```ts
  manaRegenMult: number;
```
with:
```ts
  manaRegenMult: number;
  /** Life regained a second, as a fraction of max life (a shrine's blessing; see the floor maps spec). */
  lifeRegen?: number;
```

In `packages/engine/src/types/arpg.ts`:

Replace:
```ts
import type { FloorMap } from './floor-map.js';
```
with:
```ts
import type { Buff, FloorMap } from './floor-map.js';
```

Replace:
```ts
  stats: HeroStats;
```
with:
```ts
  /** Its stats: `baseStats` under the floor's blessings (`applyBuffs`). */
  stats: HeroStats;
  /** Its stats before the floor's blessings: its gear's under the dive's (see the floor maps spec). */
  baseStats: HeroStats;
  /** The blessings it took on this floor (a sanctum's shrine). */
  floorBuffs: Buff[];
  /** The dive's blessings: those it began the floor with, and any taken on it. */
  diveBuffs: Buff[];
```

In `packages/engine/src/delve/hero-stats.ts`:

Replace:
```ts
import { MANA_TYPES, emptyManaMap, type ManaMap, type ManaType } from '../types/mana.js';
```
with:
```ts
import { MANA_TYPES, emptyManaMap, type ManaMap, type ManaType } from '../types/mana.js';
import type { Buff } from '../types/floor-map.js';
```

Replace:
```ts
}

// ── Mana ───────────────────────────────────────────────────────────────────
```
with:
```ts
}

/**
 * `stats` under blessings (see the floor maps spec): each multiplies damage
 * and mana regen and adds life regen (Find and potions act on the world, not
 * here). No blessings: `stats` itself.
 */
export function applyBuffs(stats: HeroStats, buffs: readonly Buff[]): HeroStats {
  if (buffs.length === 0) return stats;
  let { damageMult, manaRegenMult } = stats;
  let lifeRegen = stats.lifeRegen ?? 0;
  for (const { effect } of buffs) {
    damageMult *= 1 + (effect.damage ?? 0);
    manaRegenMult *= 1 + (effect.manaRegen ?? 0);
    lifeRegen += effect.lifeRegen ?? 0;
  }
  return { ...stats, damageMult, manaRegenMult, lifeRegen };
}

// ── Mana ───────────────────────────────────────────────────────────────────
```

In `packages/engine/src/delve/pair.ts`:

Replace:
```ts
import type { DataRegistry } from '../data/registry.js';
```
with:
```ts
import type { DataRegistry } from '../data/registry.js';
import type { ArpgWorld } from '../types/arpg.js';
```

Replace:
```ts
import { computeHeroStats, pairElements, pairExtra } from './hero-stats.js';
```
with:
```ts
import { applyBuffs, computeHeroStats, pairElements, pairExtra } from './hero-stats.js';
```

Replace:
```ts
}

/** Mana Dust from salvaging `item`: its rarity's share when its mana is outside the pair (none before the choice). */
```
with:
```ts
}

/**
 * The hero's stats in `world` (see the floor maps spec): its real stats under its
 * blessings, the dive's and then the floor's, as `refreshWorldHero` puts them on.
 */
export function worldStats(
  registry: DataRegistry,
  profile: Pick<DelveProfile, 'equipped' | 'pair'>,
  world: ArpgWorld,
): HeroStats {
  const h = world.hero;
  return applyBuffs(applyBuffs(profileStats(registry, profile), h.diveBuffs), h.floorBuffs);
}

/** Mana Dust from salvaging `item`: its rarity's share when its mana is outside the pair (none before the choice). */
```

In `packages/engine/src/arpg/world.ts`:

Replace:
```ts
import type { FloorLayout } from '../types/floor-map.js';
```
with:
```ts
import type { Buff, FloorLayout } from '../types/floor-map.js';
```

Replace:
```ts
import { manaPool } from '../delve/hero-stats.js';
```
with:
```ts
import { applyBuffs, manaPool } from '../delve/hero-stats.js';
```

Replace:
```ts
  layout?: FloorLayout;
```
with:
```ts
  layout?: FloorLayout;
  /** The dive's blessings (`DiveState.diveBuffs`): the hero wears them from the start (default none). */
  diveBuffs?: Buff[];
```

Replace:
```ts
  stats: HeroStats,
  chains: Partial<Pick<Chains, AbilitySlot>>,
  opts: { hpFrac: number; potions: number; phoenixAvailable: boolean; x: number; y: number },
): HeroEntity {
```
with:
```ts
  unbuffed: HeroStats,
  chains: Partial<Pick<Chains, AbilitySlot>>,
  opts: {
    hpFrac: number;
    potions: number;
    phoenixAvailable: boolean;
    x: number;
    y: number;
    /** The dive's blessings, worn from the start. */
    diveBuffs?: Buff[];
  },
): HeroEntity {
  const diveBuffs = [...(opts.diveBuffs ?? [])];
  const stats = applyBuffs(unbuffed, diveBuffs);
```

Replace:
```ts
    hp: Math.max(1, stats.maxHp * Math.min(1, opts.hpFrac)),
    stats,
```
with:
```ts
    hp: Math.max(1, stats.maxHp * Math.min(1, opts.hpFrac)),
    stats,
    baseStats: stats,
    floorBuffs: [],
    diveBuffs,
```

Replace:
```ts
 */
export function refreshWorldHero(
  registry: DataRegistry,
  world: ArpgWorld,
  stats: HeroStats,
  chains: Partial<Pick<Chains, AbilitySlot>>,
): void {
  const h = world.hero;
```
with:
```ts
 * `unbuffed` is the hero's gear (`profileStats`): its dive's and floor's
 * blessings go back on (see the floor maps spec), so a refresh never wipes them.
 */
export function refreshWorldHero(
  registry: DataRegistry,
  world: ArpgWorld,
  unbuffed: HeroStats,
  chains: Partial<Pick<Chains, AbilitySlot>>,
): void {
  const h = world.hero;
  const base = applyBuffs(unbuffed, h.diveBuffs);
  const stats = applyBuffs(base, h.floorBuffs);
```

Replace:
```ts
  h.stats = stats;
```
with:
```ts
  h.stats = stats;
  h.baseStats = base;
```

Replace:
```ts
      y: heroY,
```
with:
```ts
      y: heroY,
      diveBuffs: opts.diveBuffs,
```

Replace:
```ts
    loot: { ...opts.loot, dropsGiven: [...opts.loot.dropsGiven] },
```
with:
```ts
    loot: {
      ...opts.loot,
      // A blessing's Find counts all dive.
      find: (opts.diveBuffs ?? []).reduce((f, b) => f + (b.effect.find ?? 0), opts.loot.find),
      dropsGiven: [...opts.loot.dropsGiven],
    },
```

In `packages/engine/src/arpg/step.ts`:

Replace:
```ts
  h.mana = world.sandbox?.infiniteMana ? h.manaMax : Math.min(h.manaMax, h.mana + h.manaRegen * dt);
```
with:
```ts
  h.mana = world.sandbox?.infiniteMana ? h.manaMax : Math.min(h.manaMax, h.mana + h.manaRegen * dt);
  // A blessing's life regen (see the floor maps spec).
  if (h.stats.lifeRegen)
    h.hp = Math.min(h.stats.maxHp, h.hp + h.stats.maxHp * h.stats.lifeRegen * dt);
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-buffs.test.ts)`
Expected: PASS, 5 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 32 tests in F + 5 files pass (1878 | 5 skipped in 109 | 1 skipped).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-a
(cd packages/engine && npx prettier --write --end-of-line auto src/types/delve.ts src/types/arpg.ts src/delve/hero-stats.ts src/delve/pair.ts src/arpg/world.ts src/arpg/step.ts tests/delve-maps-buffs.test.ts)
git add packages/engine/src/types/delve.ts packages/engine/src/types/arpg.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/delve/pair.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-maps-buffs.test.ts
git commit -m "feat(engine): the hero's blessings: applyBuffs, baseStats, worldStats, life regen" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 7: Save v10 and `beginFloor`'s pass-through

`DiveState.used` and `diveBuffs` (and the world's pending ones), the schema, version 10 with every other version reset (no migration), and `beginFloor` asking for the generated layout with the dive's used interactables and blessings.

**Files:**
- Create: `packages/engine/tests/delve-maps-save.test.ts`
- Modify: `packages/engine/src/types/delve.ts`, `src/types/arpg.ts`, `src/arpg/world.ts`, `src/delve/dive.ts` (hand-edited), `src/delve/profile-schema.ts`, `src/delve/profile.ts`; `packages/engine/tests/delve-save-v8.test.ts`, `delve-dive.test.ts`, `delve-pair.test.ts`, `delve-profile-abilities.test.ts`, `delve-runes-contract.test.ts`, `delve-quests-save.test.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-maps-save.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { createFloorWorld, emptyPending } from '../src/arpg/world.js';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Buff } from '../src/types/floor-map.js';

// See the floor maps spec: save v10 (no migration) and `beginFloor`'s pass-through.

vi.mock('../src/arpg/world.js', async (original) => {
  const world = await original<typeof import('../src/arpg/world.js')>();
  return { ...world, createFloorWorld: vi.fn(world.createFloorWorld) };
});

const registry = createDefaultRegistry();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));
const DEVOTION: Buff = { shrine: 'devotion', effect: { damage: 0.1 } };
const diving = () => startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);
/** `p`'s dive having used two interactables and taken a blessing. */
const blessed = (p: DelveProfile): DelveProfile => ({
  ...p,
  dive: { ...p.dive!, used: ['1:2', '1:5'], diveBuffs: [DEVOTION] },
});

describe('save v10', () => {
  it('a dive starts with nothing used and no blessings; a world has nothing pending', () => {
    const p = diving();
    expect(p.version).toBe(10);
    expect(p.dive).toMatchObject({ used: [], diveBuffs: [] });
    expect(emptyPending()).toMatchObject({ used: [], diveBuffs: [] });
  });

  it('round-trips what the dive used and its blessings', () => {
    const p = blessed(diving());
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
  });

  it('resets a version 9 save; refuses a dive without the new fields or with a bad blessing', () => {
    const p = blessed(diving());
    expect(parseDelveProfile(registry, json({ ...p, version: 9 }))).toEqual({ reset: true });
    const { used: _u, ...noUsed } = p.dive!;
    expect(parseDelveProfile(registry, json({ ...p, dive: noUsed }))).toBeNull();
    const bad = { ...p.dive!, diveBuffs: [{ shrine: 'devotion', effect: { haste: 1 } }] };
    expect(parseDelveProfile(registry, json({ ...p, dive: bad }))).toBeNull();
  });
});

describe('beginFloor', () => {
  it("asks for a generated floor with the dive's used interactables and blessings", () => {
    const p = blessed(diving());
    const w = beginFloor(registry, p);
    expect(createFloorWorld).toHaveBeenLastCalledWith(
      registry,
      expect.objectContaining({ layout: 'generated', used: ['1:2', '1:5'], diveBuffs: [DEVOTION] }),
    );
    expect(w.hero.diveBuffs).toEqual([DEVOTION]);
  });
});
```

The tests that read the version:

In `packages/engine/tests/delve-save-v8.test.ts`:

Replace:
```ts
    expect(p.version).toBe(9);
```
with:
```ts
    expect(p.version).toBe(10);
```

Replace:
```ts
  it('resets a save of any other version; a version 9 save that does not fit is refused', () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    for (const version of [2, 6, 7, 8, undefined])
```
with:
```ts
  it('resets a save of any other version; a version 10 save that does not fit is refused', () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    for (const version of [2, 6, 7, 8, 9, undefined])
```

In `packages/engine/tests/delve-dive.test.ts`:

Replace:
```ts
    expect(p.version).toBe(9);
```
with:
```ts
    expect(p.version).toBe(10);
```

In `packages/engine/tests/delve-pair.test.ts`:

Replace:
```ts
  it('a new profile is version 9 with no pair yet, no Mana Dust, no Links and no runes, and round-trips', () => {
    const p = createDelveProfile(registry, 3);
    expect(p).toMatchObject({
      version: 9,
```
with:
```ts
  it('a new profile is version 10 with no pair yet, no Mana Dust, no Links and no runes, and round-trips', () => {
    const p = createDelveProfile(registry, 3);
    expect(p).toMatchObject({
      version: 10,
```

In `packages/engine/tests/delve-profile-abilities.test.ts`:

Replace:
```ts
    expect(p.version).toBe(9);
```
with:
```ts
    expect(p.version).toBe(10);
```

In `packages/engine/tests/delve-runes-contract.test.ts`:

Replace:
```ts
  it('a new profile is version 9 with an empty pouch; a version 6 or 7 save resets', () => {
    const p = fresh();
    expect(p).toMatchObject({ version: 9, runes: {} });
```
with:
```ts
  it('a new profile is version 10 with an empty pouch; a version 6 or 7 save resets', () => {
    const p = fresh();
    expect(p).toMatchObject({ version: 10, runes: {} });
```

In `packages/engine/tests/delve-quests-save.test.ts`:

Replace:
```ts
    expect(p.version).toBe(9);
```
with:
```ts
    expect(p.version).toBe(10);
```

Replace:
```ts
  it('resets a version 8 save; a version 9 save without its quests, or a bad contract, is refused', () => {
```
with:
```ts
  it('resets a version 8 save; a version 10 save without its quests, or a bad contract, is refused', () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-save.test.ts tests/delve-save-v8.test.ts tests/delve-dive.test.ts tests/delve-pair.test.ts tests/delve-profile-abilities.test.ts tests/delve-runes-contract.test.ts tests/delve-quests-save.test.ts)`
Expected: FAIL: 11 of 128: the four in `delve-maps-save.test.ts` (a new save is version 9 and its dive has no `used`; a version 9 save loads; `beginFloor` passes no `layout`) and the seven that read the version in the other six files.

- [ ] **Step 3: The save**

In `packages/engine/src/types/delve.ts`:

Replace:
```ts
import type { AiBalance, LayoutBalance, LayoutsData, ShrineDef } from './floor-map.js';
```
with:
```ts
import type { AiBalance, Buff, LayoutBalance, LayoutsData, ShrineDef } from './floor-map.js';
```

Replace:
```ts
  bestFind: GearItem | null;
```
with:
```ts
  bestFind: GearItem | null;
  /**
   * The interactables used this dive (`${depth}:${roomId}`; see the floor maps
   * spec): a replayed floor finds them used.
   */
  used: string[];
  /** The dive's blessings: each floor's hero wears them from the start. */
  diveBuffs: Buff[];
```

Replace:
```ts
  version: 9;
```
with:
```ts
  version: 10;
```

In `packages/engine/src/types/arpg.ts`:

Replace:
```ts
  questEvents: QuestEvent[];
```
with:
```ts
  questEvents: QuestEvent[];
  /** Interactables used since the last bank: `DiveState.used` takes them (see the floor maps spec). */
  used: string[];
  /** Dive blessings taken since the last bank: `DiveState.diveBuffs` takes them. */
  diveBuffs: Buff[];
```

In `packages/engine/src/arpg/world.ts`:

Replace:
```ts
  /** The dive's blessings (`DiveState.diveBuffs`): the hero wears them from the start (default none). */
  diveBuffs?: Buff[];
```
with:
```ts
  /** The dive's blessings (`DiveState.diveBuffs`): the hero wears them from the start (default none). */
  diveBuffs?: Buff[];
  /** The interactables used this dive (`DiveState.used`): a generated floor marks them used (default none). */
  used?: string[];
```

Replace:
```ts
    questEvents: [],
```
with:
```ts
    questEvents: [],
    used: [],
    diveBuffs: [],
```

In `packages/engine/src/delve/dive.ts`:

Replace:
```ts
    bestFind: null,
```
with:
```ts
    bestFind: null,
    used: [],
    diveBuffs: [],
```

Replace:
```ts
/** Build the arena for the dive's current depth. */
```
with:
```ts
/** Build the arena for the dive's current depth: a generated floor, with what the dive used and its blessings. */
```

Replace:
```ts
    seed: floorSeed(dive),
```
with:
```ts
    seed: floorSeed(dive),
    layout: 'generated',
    used: [...dive.used],
    diveBuffs: [...dive.diveBuffs],
```

In `packages/engine/src/delve/profile-schema.ts`:

Replace:
```ts
  RewardSchema,
```
with:
```ts
  RewardSchema,
  BuffSchema,
```

Replace:
```ts
/** Zod schema for persisted Delve saves (version 9 only) — rejects corrupt or foreign data. */
```
with:
```ts
/** Zod schema for persisted Delve saves (version 10 only) — rejects corrupt or foreign data. */
```

Replace:
```ts
  bestFind: GearItemSchema.nullable(),
```
with:
```ts
  bestFind: GearItemSchema.nullable(),
  used: z.array(z.string()),
  diveBuffs: z.array(BuffSchema),
```

Replace:
```ts
/** Version 9: the quests (see the quests spec); older saves reset. */
export const DelveProfileSchema = z.object({
  version: z.literal(9),
```
with:
```ts
/** Version 10: the dive's used interactables and blessings (see the floor maps spec); older saves reset. */
export const DelveProfileSchema = z.object({
  version: z.literal(10),
```

In `packages/engine/src/delve/profile.ts`:

Replace:
```ts
    version: 9,
```
with:
```ts
    version: 10,
```

Replace:
```ts
 * Validate an unknown JSON blob as a save. A version 9 save is fitted to the
 * data (`fitMovesets`); a save of any other version is `{ reset: true }`. Null
 * when it isn't an object, or a version 9 save doesn't fit the schema.
 */
export function parseDelveProfile(registry: DataRegistry, raw: unknown): ParsedDelveProfile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  if ((raw as { version?: unknown }).version !== 9) return { reset: true };
```
with:
```ts
 * Validate an unknown JSON blob as a save. A version 10 save is fitted to the
 * data (`fitMovesets`); a save of any other version is `{ reset: true }`. Null
 * when it isn't an object, or a version 10 save doesn't fit the schema.
 */
export function parseDelveProfile(registry: DataRegistry, raw: unknown): ParsedDelveProfile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  if ((raw as { version?: unknown }).version !== 10) return { reset: true };
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: the same seven files.
Expected: PASS, 128 tests in 7 files.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 36 tests in F + 6 files pass (1882 | 5 skipped in 110 | 1 skipped).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-a
(cd packages/engine && npx prettier --write --end-of-line auto src/types/delve.ts src/types/arpg.ts src/arpg/world.ts src/delve/profile-schema.ts src/delve/profile.ts tests/delve-maps-save.test.ts tests/delve-save-v8.test.ts tests/delve-dive.test.ts tests/delve-pair.test.ts tests/delve-profile-abilities.test.ts tests/delve-runes-contract.test.ts tests/delve-quests-save.test.ts)
git add packages/engine/src/types/delve.ts packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/delve/dive.ts packages/engine/src/delve/profile-schema.ts packages/engine/src/delve/profile.ts packages/engine/tests/delve-maps-save.test.ts packages/engine/tests/delve-save-v8.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-profile-abilities.test.ts packages/engine/tests/delve-runes-contract.test.ts packages/engine/tests/delve-quests-save.test.ts
git commit -m "feat(engine): save v10: the dive's used interactables and blessings; beginFloor passes them on" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 5: The hooks

### Task 8: The interact press, the events and the areas' stubs

`ArpgInput.interact` (queued as `world.queuedInteract`), the seven events, every stub in its owner's file, `tick()` calling the hooks, `killMonster` calling `onMonsterKilled`, only the open room clearing, and the index exporting it all.

**Files:**
- Create: `packages/engine/src/arpg/layout/generate.ts`, `src/arpg/flow.ts`, `src/arpg/interact.ts`, `src/arpg/seal.ts`, `src/arpg/fog.ts`
- Modify: `packages/engine/src/types/arpg.ts`, `src/arpg/world.ts`, `src/arpg/step.ts`, `src/arpg/combat.ts`, `src/delve/stops.ts`, `src/index.ts`; `packages/engine/tests/delve-maps-contract.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-maps-contract.test.ts`:

Replace:
```ts
import { arena, dummy, registry } from './fixtures/arena.js';
```
with:
```ts
import { stepWorld } from '../src/arpg/step.js';
import * as engine from '../src/index.js';
import { arena, dummy, registry, run } from './fixtures/arena.js';
```

Append at the end of the file:
```ts
describe('the inputs, the hooks and the stubs', () => {
  it('an interact press waits for interactTick', () => {
    const w = arena([dummy(13, 20)]);
    stepWorld(registry, w, { move: { x: 0, y: 0 }, interact: true }, 0);
    expect(w.queuedInteract).toBe(true);
  });

  it('the open room clears once its foes are dead; a generated floor waits for its exit', () => {
    const open = arena();
    const generated = arena();
    generated.map = { ...generated.map, open: false };
    run(open, 0.1);
    run(generated, 0.1);
    expect([open.cleared, generated.cleared]).toEqual([true, false]);
  });

  it("every area's op is exported", () => {
    const ops = [
      ...['openRoom', 'moveCircle', 'lineOfSight', 'isWalkable', 'snapToWalkable', 'blocked'],
      ...['applyBuffs', 'worldStats', 'generateFloor', 'flowField', 'flowTick', 'leashTick'],
      ...['sealTick', 'fogTick', 'hudMapOf', 'interactTick', 'applyShrine', 'exitFloor'],
      ...['onMonsterKilled', 'alcoveOffers', 'takeAlcove'],
    ];
    for (const op of ops)
      expect((engine as Record<string, unknown>)[op], op).toBeTypeOf('function');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-contract.test.ts)`
Expected: FAIL: 3 of 5: `AssertionError: expected undefined to be true` (no `queuedInteract`), `AssertionError: expected [ true, true ] to deeply equal [ true, false ]` (a generated floor clears) and `AssertionError: openRoom: expected undefined to be type of 'function'` (the index doesn't export the grid); the two world tests pass.

- [ ] **Step 3: The input and the events**

In `packages/engine/src/types/arpg.ts`:

Replace:
```ts
import type { Buff, FloorMap } from './floor-map.js';
```
with:
```ts
import type { Buff, FloorMap, InteractableKind } from './floor-map.js';
```

Replace:
```ts
  dodge?: boolean;
```
with:
```ts
  dodge?: boolean;
  /** Use the interactable in reach: a chest, a shrine, an alcove, the gate (a press; see the floor maps spec). */
  interact?: boolean;
```

Replace:
```ts
      element: ManaType | null;
    }
```
with:
```ts
      element: ManaType | null;
    }
  /** An interactable in reach, each step one is: what a press does to it (see the floor maps spec). */
  | { kind: 'interactPrompt'; id: string; interactable: InteractableKind; text: string }
  /** The gate was used: the client confirms (`roomsUnexplored`), then `exitFloor`. */
  | { kind: 'exitRequest'; roomsUnexplored: number }
  /** An anvil alcove opened: the client (or the bot) offers `alcoveOffers`. */
  | { kind: 'alcoveOpen'; id: string }
  | { kind: 'seal'; roomId: number }
  | { kind: 'unseal'; roomId: number }
  /** A room's last foe died. */
  | { kind: 'roomCleared'; roomId: number }
  /** The exit unfound after `ai.exitHintSeconds`: the compass points at it. */
  | { kind: 'exitHint'; x: number; y: number }
```

Replace:
```ts
  queuedDodge: boolean;
```
with:
```ts
  queuedDodge: boolean;
  /** An interact press waiting for `interactTick`. */
  queuedInteract: boolean;
```

In `packages/engine/src/arpg/world.ts`:

Replace:
```ts
    queuedDodge: false,
```
with:
```ts
    queuedDodge: false,
    queuedInteract: false,
```

- [ ] **Step 4: The stubs**

Create `packages/engine/src/arpg/layout/generate.ts`:

```ts
import type { DataRegistry } from '../../data/registry.js';
import type { BiomeDef, DoorDef } from '../../types/delve.js';
import type { FloorMap } from '../../types/floor-map.js';

/**
 * A floor's rooms and halls (see the floor maps spec's "Generator"; the
 * generator area fills this directory): pure and deterministic on the floor
 * seed's `layout` fork.
 */
export function generateFloor(
  _registry: DataRegistry,
  _seed: number,
  _depth: number,
  _biome: BiomeDef,
  _door: DoorDef | null,
): FloorMap {
  throw new Error('generateFloor: not implemented');
}
```

Create `packages/engine/src/arpg/flow.ts`:

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

/** Send foes past their leash home, and heal and sleep them there (`farSince`, `goingHome`). */
export function leashTick(_ctx: SimCtx): void {}
```

Create `packages/engine/src/arpg/interact.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { ArpgWorld, MonsterEntity } from '../types/arpg.js';
import type { ShrineDef } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';

/**
 * Using what the rooms hold, and the floor's flow (see the floor maps spec's
 * "Interacting, special rooms and the exit"; the floor flow area fills this
 * file). Each hook is a no-op on the open room.
 */

/**
 * The interactable in reach (`ai.interactRadius`): its `interactPrompt` each
 * step, and an interact press (`ArpgWorld.queuedInteract`) acting on it: a
 * chest, a shrine's prayer (`channel`), an alcove, the gate.
 */
export function interactTick(_ctx: SimCtx): void {}

/**
 * A shrine's blessing on the world's hero (`applyBuffs` over `baseStats`), its
 * Find, a potion refill, or a dive blessing into `pending.diveBuffs`; the use
 * goes into `pending.used`.
 */
export function applyShrine(_registry: DataRegistry, _world: ArpgWorld, _shrine: ShrineDef): void {
  throw new Error('applyShrine: not implemented');
}

/** Take the exit: `world.exited` (the client after its confirm, the bot at once). */
export function exitFloor(_world: ArpgWorld): void {
  throw new Error('exitFloor: not implemented');
}

/** `killMonster`'s room hook: a room's last foe pulls its foes' drops in (`ai.roomVacuum`) and fires `roomCleared`. */
export function onMonsterKilled(_ctx: SimCtx, _m: MonsterEntity): void {}
```

Create `packages/engine/src/arpg/seal.ts`:

```ts
import type { SimCtx } from './combat.js';

/**
 * Sealed rooms (see the floor maps spec): a den or the boss room closes its
 * doors while the hero is inside with a foe of it awake (`ArpgWorld.sealing`,
 * `seal`), and opens them when none is left alive (`unseal`). The floor flow
 * area fills it; a no-op on the open room.
 */
export function sealTick(_ctx: SimCtx): void {}
```

Create `packages/engine/src/arpg/fog.ts`:

```ts
import type { ArpgWorld } from '../types/arpg.js';
import type { HudMap } from '../types/floor-map.js';
import type { SimCtx } from './combat.js';

/**
 * The fog of war and the minimap (see the floor maps spec; the floor flow area
 * fills this file).
 */

/**
 * At `ai.fogEvery` marks (`ArpgWorld.fogAt`): what the hero sees and the rooms it
 * enters revealed (`fog`, `fogVersion`), and the exit hint after
 * `ai.exitHintSeconds` (`exitHinted`). A no-op on the open room.
 */
export function fogTick(_ctx: SimCtx): void {}

/** What the minimap draws (pure): revealed rooms and their icons, the exit and its hint, foes in sight, drops in revealed cells. */
export function hudMapOf(_world: ArpgWorld): HudMap {
  throw new Error('hudMapOf: not implemented');
}
```

In `packages/engine/src/delve/stops.ts`:

Replace:
```ts
import type { DataRegistry } from '../data/registry.js';
```
with:
```ts
import type { DataRegistry } from '../data/registry.js';
import type { ArpgWorld } from '../types/arpg.js';
```

Append at the end of the file:
```ts
/**
 * An anvil alcove's offers (see the floor maps spec): 2 or 3 of the kinds the
 * hero can take and pay for (`stopKinds`), on `alcove:<depth>:<roomId>`, so a
 * reopened alcove offers the same.
 */
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

- [ ] **Step 5: The hooks and the exports**

In `packages/engine/src/arpg/step.ts`:

Replace:
```ts
import { addMaterial } from '../loot/materials.js';
```
with:
```ts
import { addMaterial } from '../loot/materials.js';
import { flowTick, leashTick } from './flow.js';
import { interactTick } from './interact.js';
import { sealTick } from './seal.js';
import { fogTick } from './fog.js';
```

Replace:
```ts
  if (input.dodge) world.queuedDodge = true;
```
with:
```ts
  if (input.dodge) world.queuedDodge = true;
  if (input.interact) world.queuedInteract = true;
```

Replace:
```ts
  projectilesTick(ctx, dt);
  zonesTick(ctx);
  monstersTick(ctx, dt);
  separate(ctx);
  dropsTick(ctx, dt);
```
with:
```ts
  // The floor map's hooks (see the floor maps spec): each a no-op on the open room.
  interactTick(ctx);
  projectilesTick(ctx, dt);
  zonesTick(ctx);
  flowTick(ctx);
  monstersTick(ctx, dt);
  leashTick(ctx);
  separate(ctx);
  sealTick(ctx);
  dropsTick(ctx, dt);
  fogTick(ctx);
```

Replace:
```ts
  // A Training Grounds world never clears (so it never ends).
  if (!world.sandbox && !world.cleared && world.monsters.length === 0) {
```
with:
```ts
  // A Training Grounds world never clears (so it never ends); a generated floor ends at its exit
  // (`exited`), so only the open room clears when its last foe dies.
  if (!world.sandbox && world.map.open && !world.cleared && world.monsters.length === 0) {
```

In `packages/engine/src/arpg/combat.ts`:

Replace:
```ts
import { dropMaterials } from './material-drops.js';
```
with:
```ts
import { dropMaterials } from './material-drops.js';
import { onMonsterKilled } from './interact.js';
```

Replace:
```ts
      });
    }
  }
}
```
with:
```ts
      });
    }
  }
  // Its room's hook, once everything the death drops is down (see the floor maps spec).
  onMonsterKilled(ctx, m);
}
```

In `packages/engine/src/index.ts`:

Replace:
```ts
  manaPool,
```
with:
```ts
  manaPool,
  applyBuffs,
```

Replace:
```ts
export { STOP_KINDS, stopKinds, rollStop, takeStop } from './delve/stops.js';
```
with:
```ts
export {
  STOP_KINDS,
  stopKinds,
  rollStop,
  takeStop,
  alcoveOffers,
  takeAlcove,
} from './delve/stops.js';
```

Replace:
```ts
  profileStats,
```
with:
```ts
  profileStats,
  worldStats,
```

Append at the end of the file:
```ts
// Floor maps (see the floor maps spec): every module whole, so the areas that build them never edit this file.
export * from './arpg/grid.js';
export * from './arpg/layout/generate.js';
export * from './arpg/flow.js';
export * from './arpg/interact.js';
export * from './arpg/seal.js';
export * from './arpg/fog.js';
```

- [ ] **Step 6: Run them to see them pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-maps-contract.test.ts)`
Expected: PASS, 5 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 39 tests in F + 6 files pass (1885 | 5 skipped in 110 | 1 skipped).

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/alloy-maps-a
(cd packages/engine && npx prettier --write --end-of-line auto src/types/arpg.ts src/arpg/world.ts src/arpg/layout/generate.ts src/arpg/flow.ts src/arpg/interact.ts src/arpg/seal.ts src/arpg/fog.ts src/delve/stops.ts src/arpg/step.ts src/arpg/combat.ts src/index.ts tests/delve-maps-contract.test.ts)
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/layout/generate.ts packages/engine/src/arpg/flow.ts packages/engine/src/arpg/interact.ts packages/engine/src/arpg/seal.ts packages/engine/src/arpg/fog.ts packages/engine/src/delve/stops.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/combat.ts packages/engine/src/index.ts packages/engine/tests/delve-maps-contract.test.ts
git commit -m "feat(engine): the interact press, the floor-map events, and the areas' typed stubs and hooks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 6: The client

### Task 9: The client on the new bundle

Rebuild the engine bundle; the store's tests read version 10, the bank test's pending fixture gains its two lists, and the atlas test's prop sizes come from `layouts.json → props` (its `PROP_SIZES` goes).

**Files:**
- Modify: `packages/client/src/stores/delveStore.test.ts`, `src/features/delve/__tests__/arena-bank.test.ts`, `src/features/delve/__tests__/sprite-atlas.test.ts` (hand-edited)

- [ ] **Step 1: Rebuild the bundle and see the client fail**

Run: `(cd packages/engine && npx tsup)`, then `(cd packages/client && npx tsc --noEmit -p . ; npx vitest run)`
Expected: tsup's "Build success" lines; one type error, `src/features/delve/__tests__/arena-bank.test.ts(15,70): error TS2322` (its pending fixture lacks `used` and `diveBuffs`); and 2 failed, 1250 passed: `delveStore > resets a save of another version, and falls back to a new profile when the save is corrupt` (`expected { reset: true } to be null`: it writes version 9) and `delveStore > a save of another version starts afresh: written back at once, with one notice` (it expects version 9).

- [ ] **Step 2: The tests on version 10 and the data's prop sizes**

In `packages/client/src/stores/delveStore.test.ts`:

Replace:
```ts
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":8,"broken":true}');
    expect(loadDelveProfile()).toEqual({ reset: true });
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":9,"broken":true}');
```
with:
```ts
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":9,"broken":true}');
    expect(loadDelveProfile()).toEqual({ reset: true });
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":10,"broken":true}');
```

Replace:
```ts
    const old = { ...useDelveStore.getState().profile, version: 8, scrap: 999 };
```
with:
```ts
    const old = { ...useDelveStore.getState().profile, version: 9, scrap: 999 };
```

Replace:
```ts
    expect(fresh.getState().profile).toMatchObject({ version: 9, scrap: 50 }); // the kit's
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!)).toMatchObject({
      version: 9,
```
with:
```ts
    expect(fresh.getState().profile).toMatchObject({ version: 10, scrap: 50 }); // the kit's
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!)).toMatchObject({
      version: 10,
```

In `packages/client/src/features/delve/__tests__/arena-bank.test.ts`:

Replace:
```ts
  questEvents: [],
```
with:
```ts
  questEvents: [],
  used: [],
  diveBuffs: [],
```

In `packages/client/src/features/delve/__tests__/sprite-atlas.test.ts`:

Replace:
```ts
/** The floor-map props' sizes in units (the values `layouts.json → props` holds once it exists). */
const PROP_SIZES: Record<string, number> = {
  chest: 0.9,
  shrine: 1.4,
  alcove_anvil: 1.4,
  exit_gate: 2.6,
};

describe('delve sprite atlas', () => {
  const registry = getDelveRegistry();
  const monsterIds = new Set(
    registry.getDelveData().biomes.flatMap((b) => [...b.monsters.map((m) => m.id), b.boss.id]),
  );
  /** Everything drawn from the atlas: the hero, the training dummy (size 1), the monsters, Hesta, the Anvil-keeper, and the floor-map props. */
  const known = new Set(['hero', 'dummy', 'hesta', ...monsterIds, ...Object.keys(PROP_SIZES)]);
```
with:
```ts
describe('delve sprite atlas', () => {
  const registry = getDelveRegistry();
  /** The floor-map props' sizes in units (`layouts.json → props`). */
  const props = registry.getDelveData().layouts.props;
  const monsterIds = new Set(
    registry.getDelveData().biomes.flatMap((b) => [...b.monsters.map((m) => m.id), b.boss.id]),
  );
  /** Everything drawn from the atlas: the hero, the training dummy (size 1), the monsters, Hesta, the Anvil-keeper, and the floor-map props. */
  const known = new Set(['hero', 'dummy', 'hesta', ...monsterIds, ...Object.keys(props)]);
```

Replace:
```ts
    for (const id of Object.keys(PROP_SIZES)) {
```
with:
```ts
    for (const id of Object.keys(props)) {
```

Replace:
```ts
    for (const [id, size] of Object.entries(PROP_SIZES)) sizes.set(id, size);
```
with:
```ts
    for (const [id, size] of Object.entries(props)) sizes.set(id, size);
```

- [ ] **Step 3: Run the client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M tests in G files pass (1252 in 154).

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/alloy-maps-a
(cd packages/client && npx prettier --write --end-of-line auto src/stores/delveStore.test.ts src/features/delve/__tests__/arena-bank.test.ts)
git add packages/client/src/stores/delveStore.test.ts packages/client/src/features/delve/__tests__/arena-bank.test.ts packages/client/src/features/delve/__tests__/sprite-atlas.test.ts
git commit -m "test(client): save v10, the bank fixture's lists, prop sizes from layouts.json" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 10: The `interact` control

A new control action, pad A and key C by default, left unbound where a saved setup already uses either (`parseControls`' rule for new actions); the Controls editor flags an unbound action; the press reaches the arena as `ArpgInput.interact` from either device.

**Files:**
- Modify: `packages/client/src/features/controls/controls.ts`, `ControlsPanel.tsx`, `src/features/delve/arena/input.ts`, `src/features/gamepad/arena-pad.ts`; tests `src/features/controls/__tests__/controls.test.ts`, `ControlsPanel.test.tsx`, `src/features/gamepad/__tests__/gamepad.test.ts`, `src/features/delve/__tests__/arena-input.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/controls/__tests__/controls.test.ts`:

Append at the end of the file:
```ts
describe('interact', () => {
  it('is A and C, left unbound where a saved setup already uses either', () => {
    expect([DEFAULT_CONTROLS.pad.interact, DEFAULT_CONTROLS.keys.interact]).toEqual(['a', 'KeyC']);
    const { interact: _p, ...pad } = DEFAULT_CONTROLS.pad;
    const { interact: _k, ...keys } = DEFAULT_CONTROLS.keys;
    expect(parseControls({ ...DEFAULT_CONTROLS, pad, keys })).toEqual(DEFAULT_CONTROLS);
    const taken = parseControls({
      ...DEFAULT_CONTROLS,
      pad: { ...pad, primary: 'a' },
      keys: { ...keys, potion: 'KeyC' },
    });
    expect([taken.pad.interact, taken.keys.interact]).toEqual([null, null]);
  });
});
```

In `packages/client/src/features/controls/__tests__/ControlsPanel.test.tsx`:

Append at the end of the file:
```tsx
describe('ControlsPanel: an unbound action', () => {
  beforeEach(() => useControlsStore.getState().reset());

  it('is flagged, and nothing is while every action is bound', () => {
    render(<ControlsPanel onClose={() => {}} />);
    expect(screen.queryByTestId('controls-unbound')).toBeNull();
    act(() =>
      useControlsStore.setState({
        config: { ...DEFAULT_CONTROLS, pad: { ...DEFAULT_CONTROLS.pad, interact: null } },
      }),
    );
    expect(screen.getByTestId('controls-unbound')).toHaveTextContent('Not bound: Interact.');
  });
});
```

In `packages/client/src/features/gamepad/__tests__/gamepad.test.ts`:

Append at the end of the file:
```ts
describe('interact', () => {
  it('A interacts by default; a rebound interact follows its button', () => {
    const prev = readPad(fakePad());
    const act = (held: number[], cfg = DEFAULT_CONTROLS) => {
      const next = readPad(fakePad(held));
      return padToArena(next, edges(prev, next), cfg);
    };
    expect(act([0]).interact).toBe(true);
    expect(act([1]).interact).toBe(false);
    const onX = bindPad(DEFAULT_CONTROLS, 'interact', 'x');
    expect([act([0], onX).interact, act([2], onX).interact]).toEqual([false, true]);
  });
});
```

In `packages/client/src/features/delve/__tests__/arena-input.test.ts`:

Replace:
```ts
    dodge: false,
    potion: false,
```
with:
```ts
    dodge: false,
    potion: false,
    interact: false,
```

Append at the end of the file:
```ts
describe('interact', () => {
  let detach = () => {};
  afterEach(() => detach());

  it('C interacts, and frameInput sends the press once', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    key('keydown', 'KeyC');
    expect(input.interact).toBe(true);
    const w = world();
    const mem = padMemory();
    const o = { manual: false, aimReach: 1, toWorld: (p: Vec) => p, device: 'keyboard' as const };
    expect(frameInput(registry, w, input, null, mem, o).interact).toBe(true);
    expect(frameInput(registry, w, input, null, mem, o).interact).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/controls src/features/gamepad src/features/delve/__tests__/arena-input.test.ts)`
Expected: FAIL, 4 of 98, one in each new describe: `controls > interact` (`expected [ undefined, undefined ] to deeply equal [ 'a', 'KeyC' ]`), `gamepad > interact` (`expected undefined to be true`), `ControlsPanel: an unbound action` (`Unable to find an element by: [data-testid="controls-unbound"]`) and `arena-input > interact` (`expected undefined to be true`).

- [ ] **Step 3: The action, the flag and the wiring**

In `packages/client/src/features/controls/controls.ts`:

Replace:
```ts
  'potion',
```
with:
```ts
  'potion',
  'interact',
```

Replace:
```ts
    potion: 'down',
```
with:
```ts
    potion: 'down',
    // The rooms' chests, shrines, alcoves and the gate (see the floor maps spec).
    interact: 'a',
```

Replace:
```ts
    potion: 'KeyF',
```
with:
```ts
    potion: 'KeyF',
    interact: 'KeyC',
```

Replace:
```ts
  potion: 'Potion',
```
with:
```ts
  potion: 'Potion',
  interact: 'Interact',
```

In `packages/client/src/features/controls/ControlsPanel.tsx`:

Replace:
```tsx
  const caption = 'text-[14px] uppercase tracking-[0.06em] text-[var(--k-text-3)]';
```
with:
```tsx
  const caption = 'text-[14px] uppercase tracking-[0.06em] text-[var(--k-text-3)]';
  // An action left unbound (a new one whose default the setup already used: see `parseControls`).
  const unbound = CONTROL_ACTIONS.filter(
    (a) => cfg.pad[a] === null || (a !== 'attack' && cfg.keys[a] === null),
  );
```

Replace:
```tsx
          already uses it, the two swap. Changes apply at once.
        </p>
```
with:
```tsx
          already uses it, the two swap. Changes apply at once.
        </p>
        {unbound.length > 0 && (
          <p className="text-[var(--k-bad-text)]" data-testid="controls-unbound">
            Not bound: {unbound.map((a) => ACTION_LABELS[a]).join(', ')}. Pick a button or key.
          </p>
        )}
```

In `packages/client/src/features/gamepad/arena-pad.ts`:

Replace:
```ts
 * D-pad down potion, L3 held every loot label, View the journal).
```
with:
```ts
 * D-pad down potion, A interact, L3 held every loot label, View the journal).
```

Replace:
```ts
  potion: boolean;
```
with:
```ts
  potion: boolean;
  /** The interact button pressed this frame (A by default). */
  interact: boolean;
```

Replace:
```ts
    potion: is(cfg.pad.potion, (b) => pressed.has(b)),
```
with:
```ts
    potion: is(cfg.pad.potion, (b) => pressed.has(b)),
    interact: is(cfg.pad.interact, (b) => pressed.has(b)),
```

In `packages/client/src/features/delve/arena/input.ts`:

Replace:
```ts
  dodge: boolean;
```
with:
```ts
  dodge: boolean;
  /** Interact pressed (a chest, a shrine, an alcove, the gate). */
  interact: boolean;
```

Replace:
```ts
    dodge: false,
```
with:
```ts
    dodge: false,
    interact: false,
```

Replace:
```ts
  input.dodge = false;
```
with:
```ts
  input.dodge = false;
  input.interact = false;
```

Replace:
```ts
    dodge: input.dodge,
```
with:
```ts
    dodge: input.dodge,
    interact: input.interact,
```

Replace:
```ts
    dodge: pad.dodge,
```
with:
```ts
    dodge: pad.dodge,
    interact: pad.interact,
```

Replace:
```ts
      input.potion = true;
```
with:
```ts
      input.potion = true;
    } else if (action === 'interact') {
      input.interact = true;
```

- [ ] **Step 4: Run them to see them pass, then the client**

Run: the same three paths.
Expected: PASS, 98 tests in 5 files.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 4 tests in G files pass (1256 in 154).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-a
(cd packages/client && npx prettier --write --end-of-line auto src/features/controls/controls.ts src/features/controls/ControlsPanel.tsx src/features/delve/arena/input.ts src/features/gamepad/arena-pad.ts src/features/controls/__tests__/controls.test.ts src/features/controls/__tests__/ControlsPanel.test.tsx src/features/gamepad/__tests__/gamepad.test.ts src/features/delve/__tests__/arena-input.test.ts)
git add packages/client/src/features/controls packages/client/src/features/delve/arena/input.ts packages/client/src/features/gamepad/arena-pad.ts packages/client/src/features/gamepad/__tests__/gamepad.test.ts packages/client/src/features/delve/__tests__/arena-input.test.ts
git commit -m "feat(client): the interact control (A, C), flagged when unbound, sent to the arena" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

After Task 10, from the worktree root:

```bash
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
(pnpm -F @alloy/client build)
git status --short
```

Expected: tsup's "Build success" lines; both typechecks clean; the engine suite **N + 39 tests in F + 6 files** (1885 | 5 skipped in 110 | 1 skipped; the pacing rails pass unchanged: nothing in A takes a draw or moves anything on the open room); the client suite **M + 4 tests in G files** (1256 in 154); the client build succeeds; `git status` shows nothing but the three untracked `docs/superpowers/plans/2026-05-01-*.md` if they are in this worktree. Ten commits on `maps/a`. A version 9 save resets with the existing toast ("The forge changed: your save was reset"). The Delve E2E is the C and D phases' to run: dives still play on the open room (the generator comes with B1), and its fixtures build saves with `createDelveProfile`, so they write version 10.
