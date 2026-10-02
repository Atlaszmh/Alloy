# Delve UI v1 · Phase 3b (Pause, stop and Training) Implementation Plan — Overview

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 3b of the Delve UI v1 rebuild, shipping as v0.57.0: the pause screen (the hub, read-only, over the dimmed arena) replacing the dive's kebab menu; the full-screen stop between depths (found this floor, power-up cards expanding to their pickers in place, the doors with art) replacing the door overlay and loot tray; the dive summary and legendary fanfare in the kit; and the Training Grounds' dock finished on the HUD grid.

**Architecture:** Three areas in parallel worktrees, one owner per file (spec "3b · Pause, stop and Training"): 3D the pause (`hub/PauseScreen.tsx`, its header and footer, `ControlsPanel.tsx`'s attack toggle; deletes `ItemDetailSheet.tsx`), 3E the stop and summary (`DelveRun.tsx` wires `PauseScreen`; `stop/`, `StopPanel.tsx`, `RunePicker.tsx`, `DiveSummary.tsx`, `LegendaryFanfare.tsx`; deletes `DoorChoice.tsx`, `LootTray.tsx`, `.delve-sheet`), 3F Training (`DelveTraining.tsx`, `TrainingPanel.tsx`, `TrainingBar.tsx`, `MeterView.tsx`). 3F merges before 3E removes `RunePicker`'s sheet variant. No engine change.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, PixiJS 8, Vitest 3 (jsdom, Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md` — "3b · Pause, stop and Training" (authoritative: `PauseScreenProps`, each screen's contents and ids, the Esc/B rules, the pad routes, the sequencing, the E2E list), the kit contract, "Decided in the spec", "The input map", "Accessibility", Appendix A. Mockups: the session scratchpad's `ui-canvas/project/Pause.dc.html`, `Stop.dc.html`, `UI-Kit.dc.html`.

**Base:** branch `ui/p3a` (v0.56.0, shipped). Phase 3b lives on branch `ui/p3b`, worktree `C:/Projects/alloy-ui-p3b`; areas branch `ui/p3b-3d`, `ui/p3b-3e`, `ui/p3b-3f` from it.

## The plan files and ownership

| Area | Plan file | Owns (from the spec) |
|---|---|---|
| 3D · Pause | `01-pause.md` | `hub/PauseScreen.tsx` and the pause's header/footer pieces, `features/controls/ControlsPanel.tsx` (the attack toggle); deletes `ItemDetailSheet.tsx` and its test |
| 3E · Stop and summary | `02-stop.md` | `pages/DelveRun.tsx` (wires `PauseScreen`), `stop/`, `StopPanel.tsx`, `runes/RunePicker.tsx` (removing the sheet variant, last, after 3F), `DiveSummary.tsx`, `LegendaryFanfare.tsx`; deletes `DoorChoice.tsx`, `LootTray.tsx`, `.delve-sheet` |
| 3F · Training | `03-training.md` | `pages/DelveTraining.tsx`, `training/TrainingPanel.tsx`, `TrainingBar.tsx`, `MeterView.tsx` |

Where an area needs another's piece before it exists (3E renders 3D's `PauseScreen`), it codes against the spec's contract with a stub inside its own tests, never by editing the other area's files. Hub tabs already support `mode: 'pause'` (Phase 2); 3D reuses them.

## Shared conventions

As Phase 2's (`docs/superpowers/plans/2026-10-01-delve-ui-v1-phase2/00-overview.md` → "Shared conventions"). Each client task runs the client suite (`npx vitest run`) and typecheck (`npx tsc --noEmit -p .`). The engine is untouched (build it once for the junction). Kit first; no new colours outside the kit tokens; no emoji in new UI. Test ids the spec keeps stay on the same behaviour. Git Bash `sed -i` strips CRLF: don't use it on CRLF files.

## Integrator notes (from the area plans)

- **3D:** `AnvilHub.tsx` exports `useHubTabs(mode, onDelve, initial?)` and the pause reuses it (3D edits `AnvilHub.tsx`, `ComparePane.tsx`, `LoadoutTab.tsx`). Test ids: `pause-screen`, `pause-resume`, `pause-anvil`, `pause-abandon`, `pause-note`, `open-controls`, `open-settings`. 3E's `DelveRun`: render `<PauseScreen …>` while `menuOpen`, after the HUD and after `StopScreen`; `foesLeft={arena.hud?.monstersLeft ?? 0}`; a `pauseLink` set by the Found log / stop item click (`{tab:'loadout', uid}`) and the journal (`{tab:'quests'}`), read once at mount; remove the kebab, `controlsOpen` + its `ControlsPanel`, and `ItemDetailSheet` + `sheetUid`. 3D Task 5 (delete `ItemDetailSheet.tsx` + test) runs after 3E merges. E2E beyond the spec list: D09 and G05 use `pause-screen` as the menu marker instead of `attack-mode-toggle`. 3F optional: Training's `training-attack-mode` duplicates the Controls toggle.
- **3F:** edits outside 3b ownership: `HudGrid.tsx` (+ test) gains optional `rightWidth` (default 340); `ChainEditor.tsx` one line (`RunePicker variant="inline"`); `dev-routes.tsx` `LabButton` markup. E2E ids new: `training-bar`, `training-menu`, `menu-anvil`; gone: `training-panel-exit`, `data-layout`. T03 rewritten (sheet gone). If 3E drops `RunePicker`'s `variant` prop entirely, also remove `variant="inline"` from `ChainEditor.tsx` and `MoveInspector.tsx`. Phase 4: `ChainEditor` (Training Abilities, the stop's MovePick) still has 10–11 px text and emoji.
- **3E:** order on `ui/p3b`: 3D 1–4 (merged) → 3E 1–4 → 3F → 3E Task 5 (wire `PauseScreen` into `DelveRun`, `dive-pause` wrapper; drop kebab, `ControlsPanel`, `ItemDetailSheet`) → 3D Task 5 (delete `ItemDetailSheet`) → 3E Task 6 (RunePicker inline-only, `.delve-sheet` CSS out) → E2E (exact edit text for D01, D02, D03, D05, D09, G01, G05, R03 in `02-stop.md`; G01 is a sketch) → bump 0.57.0. New ids: `floor-finds`, `floor-counts`, `boss-slain`, `stop-skipped`, `dive-pause`; gone: `loot-tray`, `equip-upgrades`. `useFloorFinds` duplicates `FoundLog`'s ~15-line item valuation — dedupe at integration if cheap. The HUD stays under the stop (faintly visible through its backdrop).
