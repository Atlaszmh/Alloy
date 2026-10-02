# Delve UI v1 · Phase 2 (The Anvil hub) Implementation Plan — Overview

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 2 of the Delve UI v1 rebuild, shipping as v0.55.0: each Anvil tab (Loadout, Skills, Forge, Codex, Quests) becomes its three panes in the forge kit, and the interim 960 px panel column goes.

**Architecture:** Step 2·0 (by the integrator) moves the shared pieces the old panels hold (`AttunementBars`, the old `Chip`, the reactions grid) and adds `hub/types.ts`. Then four areas build their tab under `features/delve/hub/<tab>/` in parallel worktrees, each exporting `<Tab>Tab(props: HubTabProps)`. The integrator wires them into `AnvilHub`, deletes the interim column and updates the E2E. One engine addition (2B: `expectedHit`, `chainCycle` in `hero-stats.ts`).

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, Vitest 3 (jsdom, Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md` — "Phase 2: The Anvil hub" (its shared contract and area lists are authoritative), the kit contract under "The forge kit (Phase 1)", "Decided in the spec" (items 36, 37 and 39 are cited by Phase 2), "The input map", "Accessibility" and Appendix A. Mockups: the session scratchpad's `ui-canvas/project/Anvil-Loadout.dc.html`, `Anvil-Skills.dc.html`, `Anvil-Quests.dc.html` and `UI-Kit.dc.html`.

**Base:** branch `ui/p1` (Phase 1, v0.54.0, at `2b51608` or later: review fixes may land on it). Phase 2 lives on branch `ui/p2`, worktree `C:/Projects/alloy-ui-p2`.

## The plan files and ownership (one owner per file, from the spec)

| Step | Area | Plan file | Owns | Base |
|---|---|---|---|---|
| 2·0 | Unblock the deletions + `hub/types.ts` | built directly by the integrator, no plan file | `items/AttunementBars.tsx`, `hub/codex/ReactionsGrid.tsx`, `hub/types.ts`, the `Chip` swaps | `ui/p1` |
| 2A | Loadout | `01-loadout.md` | `hub/loadout/`, `ItemTile.tsx`; deletes `BagPanel.tsx`, `PaperDoll.tsx`, `BindPrompt.tsx` | 2·0 |
| 2B | Skills | `02-skills.md` | `hub/skills/`, `chains/`, `ManaPanel.tsx`, `runes/SocketRow.tsx`, `runes/RunePicker.tsx`, `delveStore.ts` (`applyLabel`), deletes `AbilitiesPanel.tsx`; engine `hero-stats.ts` (+ tests) | 2·0 |
| 2C | Forge and Codex | `03-forge-codex.md` | `hub/forge/`, `hub/codex/` (except `ReactionsGrid.tsx`'s move, which 2·0 makes); deletes `ForgePanel.tsx`, `CodexPanel.tsx`, `runes/RunePouchPanel.tsx` | 2·0 |
| 2D | Quests | `04-quests.md` | `hub/quests/`, `quests/` | 2·0 |
| 2·I | Integration | done by the integrator from the spec's "Integration and E2E in Phase 2" | `hub/AnvilHub.tsx`, the E2E specs, the bump | 2A–2D merged |

2A–2D run in parallel worktrees (`git worktree add ../alloy-ui-2<x> -b ui/p2-2<x> ui/p2`). No area edits `AnvilHub.tsx`: each tab is tested on its own with a `HubTabProps` fixture (`setPrompts`, `setFooterAction`, `go` as `vi.fn()`). A unit test that today renders an old panel moves with that panel's owner. An area that needs a change in a file another area owns writes it as an exact edit under "Cross-area needs".

## Shared conventions

As `docs/superpowers/plans/2026-09-30-delve-runes/00-overview.md`'s "Shared conventions" (worktrees with PowerShell `cmd /c mklink /J` junctions, the client's `@alloy/engine` junction pointed at the worktree's own engine; one commit per task with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; never push or merge; never-format list; `prettier --end-of-line auto`; keep line endings — a fresh worktree checks out CRLF; edit language for `scratchpad/runes/w0/apply.mjs`; TDD; never touch `delve-chain-feel.test.ts`). Each client task runs the client suite (`npx vitest run`) and typecheck (`npx tsc --noEmit -p .`). Only 2B touches the engine: it rebuilds it (`(cd packages/engine && npx tsup)`), runs the whole engine suite with the pacing rails, and confirms `estimateCombat`'s numbers are unchanged. Every other area builds the engine once for the junction.

Kit first: panes use the Phase 1 kit (`features/delve/kit/index.ts`: `Panel`, `Button`, `Chip`, `Tabs`, `Segmented`, `Tile`, `Tooltip`, `Price`, `Keycap`/`PadGlyph`, `usePrompts`, …) and the item views (`features/delve/items/`). No new colours outside the kit tokens; no emoji in new UI (glyphs). Test ids the spec says are kept stay on the same behaviour.

## Carried from the Phase 1 review (for the area that first needs them)

- **Tooltip placement** (`kit/Tooltip.tsx`): placed once from `getBoundingClientRect` at render; no re-measure after a focus-driven `scrollIntoView`, on scroll or resize, and no viewport clamp. 2A's equipped-tile `ItemTooltip` is the first user: measure in a layout effect after open, re-measure on scroll (capture) and resize, flip or clamp at the viewport edge.
- **Dialog layer order** (`kit/layer.ts`, `prompts.ts` `topScope`): the topmost scope is decided by DOM order, and `RunePicker` / `StopPanel` portal straight to `<body>` after the layer. 2B's inline `RunePicker` removes one case; any sheet still portalled to `<body>` should portal into `uiLayer()` instead.
- **`items/CompareTable.tsx`**: strips the label with `formatStat(...).slice(0, -label.length - 1)`; split value and label if 2A touches it.

## Integrator notes (from the area plans)

- **2D:** render `<QuestsTab …/>` directly in the hub's main, with no padded wrapper (the tab root carries the padding and gap). `setPrompts` must be stable (a `useState` setter or `useCallback`); tabs call it from effects and clear their prompts on unmount. The hub draws the tab's prompts before its own Menu and passes the same merged array to `usePrompts`. `link.questId` opens that quest. Phase 3B: `DelveRun` calls `useQuests()` and `FloorColumn` renders `<QuestTracker quests={quests} />`.
- **2C:** render `<ForgeTab {...tabProps}/>` and `<CodexTab {...tabProps}/>` straight in `main`; delete `Records` and the `format` imports only it used. `AnvilHub.test.tsx` and E2E D04: click `codex-section-reactions` before counting `reaction-unknown` × 15. 2C's Task 7 (deleting `ForgePanel`, `CodexPanel`, `RunePouchPanel` and moving tests out of `ItemDetailSheet.test.tsx`) runs on `ui/p2` after 2A merges. Unowned emoji: `RuneGlyph` and `ItemHeader`'s mana and Melee/Ranged tags (Phase 4 or a later pass). `CLAUDE.md`'s `RunePouchPanel` mention: Phase 4 docs.
- **2A:** X1: render `LoadoutTab` directly in main (no 960 px column, zoom undo or padding); `go(link)` sets the tab and passes `link`; remove the interim Loadout block and its imports (reference diff in `01-loadout.md`). Task 9 on `ui/p2`: delete `BagPanel.tsx` and `PaperDoll.tsx`. X2: E2E D02 replacement is in `01-loadout.md` (bind choice instead of Equip for off-pair; expect "Equipped · your"). X3: `ItemDetailSheet.test.tsx` header conflicts with 2C's edit: keep neither import. X5 (3b): unused `.delve-tile*` CSS and its `kit-css.test.ts` row can go. `ItemHeader` still has 11–12 px text and emoji, unowned.
- **2B:** X1: render `SkillsTab` directly in main; while a footer action is set the footer shows it in place of its right-hand group (no second `delve-button`); the tab's prompts before Menu; pass `link` (`{tab:'skills', view:'mana'}`); remove the interim `<AbilitiesPanel />`. Task 11 on `ui/p2` after wiring: `AbilitiesPanel.test` → `SkillsTab.chains.test` + `ChainEditor.test`, delete `AbilitiesPanel.tsx` (don't edit `AbilitiesPanel.test.tsx` before it). X3 E2E: D04 `chain-price` reads "No changes" after Apply, `chain-slots` "1 of 1 slots" / "2 of 2 slots"; R01 Apply text '1 Link' and '20 scrap'; G06 steps the vertical skill list with LT/RT. Decided: `chainCycle.mana` sums each move's valued cost (a cast chain pays mana; only charge is 0), departing from the spec's literal "0 for cast".
- **Padding rule:** every tab root draws its own grid, padding and gap; the hub's `main` has none.
