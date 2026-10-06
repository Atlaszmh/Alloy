# Delve pad-first UI, phase 2 (the dive's edges) — plan overview

**Spec (authoritative):** `docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md` (sections 1 and 3), with the edits proposed below.

**Goal:** the stop asks one thing at a time (the power-up, then the road), Menu in a dive opens a short pause list instead of the whole hub, the HUD is lean by default (a gain feed, the map and one objective, the camera on the hero), and a new `peek` action shows the map, the purse and the finds without stopping the fight. Client only, v0.66.0.

Five plans, executed in order on one branch. Each ends green (types, unit tests, the E2E it names).

| Plan | Owns |
|---|---|
| `01-stop.md` | `stop/StopScreen.tsx` (two steps, the finds line and sheet, the risk line in the header), `stop/DoorPane.tsx` (a row of roads, `doorTerms`, the potion), `StopPanel.tsx` (the first card's `data-primary-action` only), `arena/hud/FoundLog.tsx` (`countUpgrades`), the stop's E2E call sites |
| `02-pause.md` | `hub/PauseScreen.tsx` (the list and the read-only hub), `pages/DelveRun.tsx` (the rooms props), the pause's E2E call sites |
| `03-lean-hud.md` | `stores/uiStore.ts` (`hudMode`), `hub/SettingsPanel.tsx`, `components/Toast.tsx` (`routeToasts`), `arena/hud/gain-feed.ts` and `GainFeed.tsx` (new), `arena/hud/LeanCorner.tsx` (new), `quests/QuestTracker.tsx` (`compact`), `arena/hud/HudGrid.tsx` (`insetRight`), `pages/DelveRun.tsx` (the HUD's choice), `e2e/fixtures/delve.ts` (`useFullHud`) and the E2E that read the full HUD |
| `04-peek.md` | `features/controls/controls.ts` (`peek`), `features/gamepad/arena-pad.ts`, `arena/input.ts` (`pressPeek`), `arena/useArenaCore.ts` (the pad's peek), `arena/hud/Minimap.tsx` (`large`), `arena/hud/PurseBar.tsx` (`onPeek`, `controls`), `arena/hud/PeekOverlay.tsx` (new), `delve.css`, `pages/DelveRun.tsx` (the peek's state), `e2e/delve-hud.spec.ts` (new) |
| `05-close.md` | `e2e/delve-pad-nav.spec.ts` (the stop's two steps and the pause list, PN06), the responsive specs, the full run at both sizes, `CLAUDE.md`, the version |

Why this order and these cuts: the stop and the pause are separate screens with separate tests and can each land green alone; the lean HUD changes what half the dive E2E read, so it lands after them with all of its E2E churn in one plan; the peek's Map button sits in the lean corner and the purse bar, so it comes after the HUD it decorates. The gain feed and the notices are one plan (03) because the feed is the notices' new home.

## Branch

Phase 1 must be merged into `padui/main` first. In the worktree `C:/Projects/alloy-padui` (never touch `C:/Projects/Alloy`):

```bash
cd /c/Projects/alloy-padui
git switch padui/main
git switch -c padui/p2
```

## Commands

All from `/c/Projects/alloy-padui` in Git Bash.

```bash
# Client types and unit tests
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run <path-or-filter>)
# Client E2E (starts its own Vite on :5199; one project is enough while iterating)
(cd packages/client && npx playwright test e2e/<file>.spec.ts --project=desktop)
(cd packages/client && npx playwright test e2e/<file>.spec.ts --project=desktop-1080)
# The responsive specs
(cd packages/client && npx playwright test --project=responsive e2e/responsive/specs/<file>.spec.ts)
```

If Playwright says port 5199 is in use: `netstat -ano | grep ":5199" | grep LISTENING`. This worktree's stale Vite: `taskkill //PID <pid> //F //T`; another checkout's: wait for it.

The engine is not edited in this phase (no data, no types: every guided-start target keeps its name and its screen, see `01-stop.md`). If a task finds it must be, stop and report.

**Baseline.** Before Task 1 of plan 01, on `padui/p2` fresh from `padui/main`, run `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)` and write the file and test counts into this section ("Baseline (recorded <date> on `padui/main` at `<sha>`): `tsc` clean; `vitest run` N files, M tests, all passing"). Every later "all green" compares to it. If the baseline is not green, stop: phase 1 did not close.

Baseline (recorded 2026-10-05 on `padui/main` at `02290b16`): `tsc` clean; `vitest run` 133 files, 1194 tests, all passing.

## Conventions

- Match the surrounding code: a doc comment on every export in the project's plain voice, kebab-case files for modules (`gain-feed.ts`), PascalCase for components, `UPPER_SNAKE_CASE` constants.
- No game logic in the client.
- Pixel art from the kit's `Glyph` / `PixelSprite`; never an emoji.
- Animations: the Web Animations API on the real element (the feed's fade), never a duplicate.
- TDD: the failing test first, run it, the minimal code, run it, commit.
- Commits: `feat(client): …`, `test(client): …`, `docs: …`, each message ending with

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

  (or the attribution line the executing session's instructions give).
- Never push. Never switch branches in, or write to, `C:/Projects/Alloy`.
- jsdom has no layout: unit tests give each element a box by overriding `getBoundingClientRect` (the `press` helpers in `StopScreen.test.tsx` and `PauseScreen.test.tsx`).
- **A pad press in a unit test** goes through the same two steps the nav takes (`use-gamepad-nav.ts`, near line 390): the topmost scope's prompts (`padPrompts`), and for a button none takes, its default (B presses the topmost scope's `[data-pad-back]`, Menu its `[data-pad-menu]`, else its back). Plans 01 and 02 write this as a local `padPress(button)` helper; keep the two copies identical.
- Test ids are the E2E's contract; the tables below are the whole change.

## Proposed spec edits

To make in `docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md`, section 3, in the close (plan 05, Task 4), each a sentence or two:

1. **The potion (wrong as written).** "The potion is offered on its fight button (D-pad down) when life is low, not as a stop." Outside the fight the D-pad moves the focus, so it cannot drink. Replace with: "The potion is a control in step 2's row, shown while life is below full and a potion is left."
2. **The pause's B.** "View, and 'Build and quests', open today's read-only hub. Menu and B resume." Replace with: "In the fight, View and a Found-log click open the read-only hub on their tab or item; 'Build and quests' opens it from the list. In the hub B returns to the list and Menu resumes; in the list Menu and B resume."
3. **The risk line.** Add: "The risk line sits under the title on both steps: a guided stop with no power-up (`s3-home`) opens on step 2 and highlights it." The approved decision only placed it in step 1.
4. **The finds line on both steps.** Add: "The finds line shows on both steps (a stop with no power-up opens on step 2 and would otherwise have no way to its finds)." This puts step 2 at 4 to 6 stops (the line, two or three doors, Extract, the potion), not the Evidence table's 3 or 4; the audit's ceiling records it.
5. **The lean HUD's camera.** "the right column's inset goes, so the camera centres on the hero" becomes "the right column's inset goes (the top row and the vitals keep theirs), so the camera centres on the hero across the screen".
6. **The peek under the full HUD.** Add: "Under the full HUD the peek shows the large map only: the purse and the finds are on screen already."
7. **Notices.** "notices join it" holds: add "(every toast while the fight is live: `routeToasts`)".

## Contracts between the plans

### Test ids

| Test id | Before | After |
|---|---|---|
| `door-choice` | the stop | the stop, unchanged root |
| `stop-powerup` | — | step 1's body (`data-tutorial="stop.powerup"`, was an anonymous div) |
| `stop-road` | — | step 2's body: its heading, its note and the row of roads |
| `stop-finds` | — | the finds line (a button; A or a click opens the sheet) |
| `floor-finds` | the stop's left panel | the finds sheet (a kit `Dialog`, portalled out of `door-choice`) |
| `floor-counts` | the stop's header counts | gone (the finds line says it) |
| `risk-line` | the left panel's foot | under the title, both steps |
| `roads-held` | the door pane, while a required power-up waits | step 1, beside the disabled Skip |
| `stop-taken`, `stop-skipped`, `stop-none` | `stop-taken` in `StopPanel`, `stop-skipped` in the centre | step 2's note (`StopPanel` keeps its own `stop-taken` for the alcove) |
| `door-list`, `door-<id>`, `extract-button` | a column on the right | step 2's row |
| `door-potion` | always, disabled at full life | in the row only while life is below full and a potion is left |
| `pause-screen` | the paused hub (a `Screen`) | the pause list (a kit `Dialog`, portalled out of `dive-pause`) |
| `pause-hub` | — | the read-only hub (a `Screen`, inside `dive-pause`) |
| `pause-resume`, `open-controls`, `open-settings`, `pause-skip-step`, `pause-skip-tutorial`, `pause-anvil`, `pause-abandon` | the hub's footer | the list's rows |
| `pause-build` | — | the list's "Build and quests" |
| `pause-state` | — | the dive's state beside the list |
| `pause-back`, `pause-hub-resume` | — | the hub's footer: back to the list (B, Esc), Resume (Menu) |
| `dive-hud` | — | the dive's `HudGrid` root |
| `gain-feed`, `feed-line` | — | the lean HUD's top left (`feed-line` carries `data-key`) |
| `lean-corner` | — | the lean HUD's top right: `depth-label`, `minimap`, the compact `quest-tracker`, `peek-button`, Journal, "Dive menu" |
| `peek-button` | — | the Map button (`data-pad-peek`), in the lean corner and the full purse bar |
| `peek-overlay`, `peek-map` | — | the peek |
| `hud-mode-lean`, `hud-mode-full` | — | Settings → Display → HUD |

### Store fields, functions and props

- `uiStore`: `hudMode: 'lean' | 'full'` (default `'lean'`, saved as `alloy:delve:hud`), `setHudMode(mode)` (plan 03).
- `components/Toast.tsx`: `routeToasts(fn: (text: string) => void): () => void` (plan 03).
- `arena/hud/gain-feed.ts`: `FeedLine`, `FeedTally`, `feedTally`, `feedAfter`, `feedNotice`, `FEED_MS`, `NOTICE_MS`, `FADE_MS`, `FEED_MAX` (plan 03).
- `GainFeed({ live })`, `LeanCorner({ dive, biome, quests, map, onMenu, onJournal, onPeek })`, `QuestTracker`'s `compact` (plan 03; `onPeek` wired in plan 04).
- `HudGrid`'s `insetRight` (default `true`) (plan 03).
- `controls.ts`: `'peek'` in `CONTROL_ACTIONS`, default `pad: 'up'`, `keys: 'KeyM'`; `ArenaPadActions.peek`; `pressPeek()` in `arena/input.ts` (plan 04).
- `PurseBar`'s `onPeek` and `controls` (default `true`); `Minimap`'s `large`; `PeekOverlay({ dive, map, lean })` (plan 04).
- `PauseScreen`'s `roomsExplored?` and `roomsTotal?` (plan 02).
- `DoorPane({ dive, onChoose, onExtract, onPotion })` (`padFirst` and `held` go); `doorTerms(mods)` replaces `doorLoot`; `findsSummary(n)` in `StopScreen.tsx`; `countUpgrades(items)` in `FoundLog.tsx` (plan 01).

### E2E fixture (`e2e/fixtures/delve.ts`, plan 03)

```ts
/** The dive's full HUD (the purse bar, the floor column and the Found log), for a test that reads it. Call after `seedProfile`. */
export async function useFullHud(page: Page): Promise<void>;
```

### From phase 1, relied on

`orderPrompts` (every footer's order), `[data-pad-wrap]` and the kit `Dialog`'s `wrap` (the pause list), `stepTabs` landing on `[data-pad-first]` (the paused hub's tabs), the straight-back rule in `moveFocus`, Menu opening the system menu at the Anvil, the Depart sheet (`startDive(page)` in every E2E). Phase 2 does not change the Anvil.

### The client autopilot

`alloy:delve:autopilot` plays floors only. At a stop the arena has no world (`diveWorldKey` is null while `choosing`), so the stop waits for a player, today and after: the E2E answers it (a card and its pick, or Skip; then a door or Extract). Nothing in the bot changes.
