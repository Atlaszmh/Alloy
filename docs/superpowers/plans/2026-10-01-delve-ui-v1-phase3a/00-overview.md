# Delve UI v1 · Phase 3a (The HUD, the map and the zoom) Implementation Plan — Overview

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 3a of the Delve UI v1 rebuild, shipping as v0.56.0: the dive HUD as one grid (Purse top bar, Hades-style skill dock with long life and mana bars bottom-left, a right column with the floor panel and minimap, the quest tracker and the Found log), the camera zoomed out to whole px-per-sprite-pixel at a 27-unit view (View distance 20–30), the new `labels` / `journal` inputs, and a minimal Training port onto the grid.

**Architecture:** Three areas in parallel worktrees, one owner per file (spec table "Parallel areas in 3a"): 3A the HUD dock and top bar (and the `DelveRun` / `DelveTraining` page wiring), 3B the right column, 3C the arena core and renderer (camera, insets, the snapshot's `buffs` and `map`, inputs). They meet at the spec's TypeScript contract (`Insets`, `HudMap`, `HudBuff`, `HudGridProps`, `SkillDockProps`, `FloorColumnProps`). The integrator merges 3A, 3B, 3C, then 3C's deferred `aim-gestures.ts` deletion, the `floatPay` import fix and the E2E updates. No engine change.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, PixiJS 8, Vitest 3 (jsdom, Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md` — "Phase 3 → 3a" (authoritative: the grid, each panel's contents and ids, the contract, the zoom rule and its table, the sequencing, the E2E list), the kit contract, "Decided in the spec" (items 8, 22, 23, 31 are cited), "The input map", "Accessibility", Appendix A. Mockup: the session scratchpad's `ui-canvas/project/Arena-HUD.dc.html` (and `UI-Kit.dc.html`).

**Base:** branch `ui/p2` after its review fixes (v0.55.0). Phase 3a lives on branch `ui/p3a`, worktree `C:/Projects/alloy-ui-p3a`; areas branch `ui/p3a-3a`, `ui/p3a-3b`, `ui/p3a-3c` from it.

## The plan files and ownership

| Area | Plan file | Owns (from the spec) |
|---|---|---|
| 3A · HUD dock and top bar | `01-hud-dock.md` | `arena/hud/HudGrid`, `PurseBar`, `SkillDock`, `SkillSlot`, `SkillTooltip`, `BuffRow`, `Vitals`, `BossBar`; `ArenaHud.tsx`; `DelveRun.tsx`; `DelveTraining.tsx` (minimal port); `ArenaHud.test.tsx` |
| 3B · Right column | `02-right-column.md` | `FloorColumn`, `Minimap`, `FoundLog`, `PickupFeed.tsx` (deleted); `delveStore.ts` (`floorDropsFrom`, `floorRunesFrom`); the `QuestTracker` wiring |
| 3C · Arena core and renderer | `03-arena-core.md` | `camera.ts`, `aim.ts` (from `aim-gestures.ts`), `ArenaRenderer.ts`, `useArenaCore.ts`, `useArena.ts`, `useTrainingArena.ts`, `ArenaControls.tsx`, `input.ts`, `fx/draw-world.ts` (the import), `controls.ts`, `arena-pad.ts`, `uiStore` (`arenaViewUnits`), Settings → View distance; their tests |

Where an area needs another's contract before it exists, it codes against the spec's types with a local stub or fixture inside its own tests, never by editing the other area's files. `DelveRun.tsx` (3A) composes `FloorColumn` (3B) and passes `insets` to `useArena` (3C): 3A writes that wiring against the contract; if the other side isn't merged yet its own tests use a stub.

## Shared conventions

As Phase 2's (`docs/superpowers/plans/2026-10-01-delve-ui-v1-phase2/00-overview.md` → "Shared conventions"). Each client task runs the client suite (`npx vitest run`) and typecheck (`npx tsc --noEmit -p .`). The engine is untouched (build it once for the junction). Kit first; no new colours outside the kit tokens; no emoji in new UI. Test ids the spec keeps stay on the same behaviour.

## Integrator notes (from the area plans)

- **3B:** `DelveRun.tsx` (3A) calls `useQuests()` and renders `<FloorColumn dive biome hud={arena.hud} quests onInspect={openItem} onJournal />` as `HudGrid`'s `right` (fills column 3, rows 1–2; root `h-full`). Drop `PickupFeed`. `bounty` id stays on the purse only. 3C must export `HudMap` from `useArenaCore.ts` and add `ArenaHud.map` (arena units, origin top-left, y down; `view` = `viewRect()` or the arena; drop colour `RARITY_COLOR` or the rune family colour; `rank` `'boss'`/`'elite'`/`'normal'`). After merges: 3B Task 6 (delete `PickupFeed.tsx` and its 3 tests in `LootTray.test.tsx`), Task 7 (import `HudMap` from `useArenaCore.ts`, drop the local one). E2E: D01 unchanged (`DEPTH N` uppercase kept); D02 clicks the Found log's `loot-item` button.
- **3C:** `Insets` lives in `camera.ts`; `HudBuff` and `HudMap` in `useArenaCore.ts` (re-exported from `useArena.ts`). Until 3A merges the hooks take `{top, bottom}`; after, Task 10 tightens `insets` to `Insets` and deletes `aim-gestures.ts` + its test. X1: 3C's branch carries a stand-in `ArenaHud.test.tsx` fixture (`buffs: []`, `map`); take 3A's side of that file at merge, adding `buffs`/`map` if 3A's fixture lacks them. X2: pages pass `insets` from `HudGrid`; `BuffRow` reads `hud.buffs`; purse carries `data-pad-journal` / `data-pad-menu`; fix `useArenaCore`'s `floatPay` import after it moves to `arena/hud/`; `arena.aim`, `arena.cancelHold`, `Aiming.onButton` become dead after 3A — remove them if nothing uses them. X4: the E2E zoomed-ancestor check (snippet in `03-arena-core.md`), then bump 0.56.0. Pixel floor at 1080p measured +28% paint (3.3–3.5 ms avg), under the 8 ms line.
- **3A:** merge order on `ui/p3a`: 3A Tasks 1–4 → 3B Tasks 1–5 → 3A Task 5 (DelveRun on the grid; run on `ui/p3a`) → 3B Task 6 (delete `PickupFeed.tsx`) → 3C → 3B Task 7 + 3C Task 10 (delete `aim-gestures.ts`, tighten `insets`) → cleanup → E2E → bump. After 3C: `useArenaCore` imports `floatPay` from `./hud/floatPay`, delete `ArenaHud.tsx`; `HudGrid`'s `Insets` from `../camera`, `BuffRow`'s `HudBuff` from `../useArenaCore`; `SkillDock`'s buffs cast → `hud?.buffs ?? []`; the purse's Labels and Journal glyphs read the player's bindings (`labels` / `journal`). Contract additions: `SkillDockProps.world`, `HudGridProps.children`. Purse shows glyphs with screen-reader names (no words; 1280×720 overflow). Journal is a disabled button with `data-pad-journal` until 3b. Floating spend reads "−78 charge".
