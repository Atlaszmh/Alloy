# Delve room objects Implementation Plan — Overview

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bigger generated rooms (12–20 cells, one two-coarse-cell arena per floor, ~20×20 boss rooms, maps ≤ 96×96) furnished with set pieces of cover, crumbling cover, foliage and slow ground (grid cells) and breakable props and elemental hazards (entities), plus a pack director (ring slots, flankers, ranged cover, chargers stunned on walls, ambushers in foliage), so fights reward position over kiting. Ships as v0.63.0, save v12.

**Architecture:** Phase A lays the contract: cell codes and `look`/`structures`/`version` on `FloorMap`, the two predicates (`solid`, `perceives`) with every reader routed through them (behaviour identical while no new cell exists), prop and hazard entity types, `hitObject` and its call sites (no-ops), `setpieces.json` + schema, `delve.terrain` and `delve.ai.pack` balance + schemas, the coarse grid of 24 with the ≤ 96 check, the monster-life helper, `HitSource 'hazard'`, typed stubs and tick hooks in their owners' files, save v12. Phase B fills the engine (B1 rooms/furnisher, B2 terrain, B3 props/hazards, B4 the director in parallel; B5 bot + pacing after). Phase C builds the client (C1 pixel floor terrain, C2 sprites, C3 FX/minimap/refresh). Phase D: E2E, docs, balance, bump.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, React 19, PixiJS 8, Web Workers (pixel floor), Playwright; `packages/pixel-forge` for sprites.

**Spec:** `docs/superpowers/specs/2026-10-04-delve-room-objects-design.md` (authoritative).

**Branches:** integration `room/main` (worktree `C:/Projects/alloy-room`), from `claude/alloy-loot-gear-system-6upsy5` at v0.62.0 + the spec (b6bcc3c4). Areas: `room/a`, `room/b1`…`room/b5`, `room/c1`…`room/c3`, `room/d`.

| Phase | Area | Plan file | Base |
|---|---|---|---|
| A | Contract | `01-contract.md` | `room/main` |
| B | B1 rooms, arena, furnisher, set pieces, spawns | `02-rooms.md` | A merged |
| B | B2 terrain mechanics | `03-terrain.md` | A merged |
| B | B3 props and hazards | `04-props-hazards.md` | A merged |
| B | B4 pack director | `05-director.md` | A merged |
| B | B5 bot and pacing | `06-bot-pacing.md` | B1–B4 merged |
| C | C1 pixel floor terrain | `07-client-floor.md` | A merged |
| C | C2 sprites (pixel-forge) | `08-sprites.md` | A merged |
| C | C3 FX, minimap, refresh | `09-client-fx.md` | A merged |
| D | E2E, docs, balance, bump | `10-finish.md` | everything merged |

## Shared conventions

As `docs/superpowers/plans/2026-10-03-delve-tutorial/00-overview.md` → "Shared conventions" (worktrees via `scratchpad/mkwt.ps1`, removed only with `rd /s /q` from a `.cmd` file then `git worktree prune`; one commit per task with the trailer; never push or merge; keep line endings; prettier only with `--end-of-line auto`; never format `balance.json`, `dive.ts`, `autopilot.ts`, `delve-pacing*.test.ts`, `CLAUDE.md`, the specs; never touch `delve-chain-feel.test.ts`; engine tasks run the whole engine suite (~2–4 min) and the typecheck; rebuild the bundle before client checks; the whole-autopilot fingerprint where behaviour must not move; no save migrations).

## Integrator notes
- **Phase A (contract):** drafted (`01-contract.md`, 9 tasks; engine 1499 → 1539 | 5 skipped in 108, client 1014 → 1018 in 125; fingerprint identical). `blocked` → `solid(map, cx, cy)` (a door is solid only while shut; cover/crumbling solid), `solidCode(code)`; `perceives` = `sees` until B2's foliage; auto-aim picks by `perceives`, explicit aim points clipped on solid; a foe's `seen` uses `perceives`. **`coarseCell` stays 16 in A — B1 grows it to 24** (it moves every map). `LOOK_IDS` const list; `setpieces.json` keys: B1 `pieces`/`palettes`, B3 `props`/`hazards`. `hitObject` returns whether it stops the hitter (shot-stop wired at A's site). A basic shot's burst is a hit site; Echo replays excluded via `ResolvedAbility.replay`. `setDoor` bumps `version` only on a shut-state flip; fog/bot cache keys add `version`. Search goal beats director goal. Training meter skips hazard hits. Ownership: `step.ts` → B4; `grid.ts`/`flow.ts`/`action.ts`/`terrain.ts` → B2; `objects.ts`/`combat.ts`/drops/`interact.ts` → B3; `generate.ts`/`furnish.ts`/`world.ts`/`layouts.json`/`setpieces-schema.ts` → B1. No stub throws → any merge order.
- **C2 (sprites):** planned (3 tasks; client 1018 → 1026 in 126). 10 object sprites (props 2 frames whole/broken, hazards 3 ready/primed/dormant, size 2 × radius) + 7 cover looks as sprites (`SPRITE_LOOKS` in new `arena/sprite-looks.ts`: statue with crack frames by thirds, boulder, spire, ice_pillar, minecart, tomb, machinery; size 1) + `RoomSprites` (`arena/room-sprites.ts`). New C2 files: `sprite-looks.ts`, `room-sprites.ts`, `room-sprites.test.ts`. Needs routed: C3 adds 4 hookup edits in `ArenaRenderer.ts`; C1 paints SPRITE_LOOKS cells as ground; B3 keeps kind ids/radii (dead props keep their broken frame if left with `dead: true`). C2 runs after A merges.
