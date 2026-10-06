# Delve pad-first UI, phase 5 (reading and options) — plan overview

**Spec (authoritative):** `docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md` (section 1, the grammar, binds everything; section 6 is this phase), with the edits proposed below. The decisions passed down with this phase (the type floor, Settings → Text size, hold moves by press-to-toggle, swap sticks, stick sensitivity, the effects' strength, the upgrade and essence sounds, the onboarding hints and folds, the measures, v0.69.0) are settled: these plans build them.

**Goal:** the menus read at 18 design px (16 for labels; nothing under 16 anywhere in the Delve, the HUD included), and a Text size setting (Small, Medium, Large: 100, 115, 130%) grows them further on a window that can hold it. The fight gains the options a couch or Deck player expects: hold moves by press-to-toggle (pad and keys), swap sticks, stick sensitivity, and a strength for screen shake, hit-stop and flashes, each off at 0. An upgrade (▲) and an essence each drop with a sound of its own. A screen's first visit pulses its main prompt with one line above the footer until that action is done once; the forge folds what the save holds none of into one line. No engine change. v0.69.0.

Seven plans, executed in order on one branch. Each ends green (types, unit tests, the E2E it names).

| Plan | Owns |
|---|---|
| `01-type-floor.md` | `e2e/delve-type.spec.ts` (new: the measure, TY01, and its gate), `kit/kit.css` (the text classes, a new `k-note`), `delve.css` (its dead small rules go), the `text-[14px]` / `text-[15px]` / `text-[16px]` / `text-[17px]` sweep by screen, `Toast.tsx`, `DelveRun.tsx`'s banner, the responsive probe's text floor (10 → 12 CSS px) |
| `02-text-size.md` | `kit/zoom.ts` (`TEXT_SIZES`, `MENU_MIN`, `menuScaleFor`), `stores/uiStore.ts` (`textSize`, `menuScale`), `AppShell.tsx`, `kit/prompts.ts` (`useUiScale`), `PixelSprite.tsx`, `SettingsPanel.tsx` (Text size), the responsive specs (`TEXT_VIEWPORTS`: fhd at Large, deck at Medium), the layout fixes Large needs at 1920×1080 |
| `03-hold-toggle.md` | `features/controls/controls.ts` (`holdToggle`), `stores/controlsStore.ts`, `ControlsPanel.tsx`, `gamepad/arena-pad.ts` (`castsOnRelease` exported, `PadMemory.latch`, `latchHolds`), `arena/input.ts` (`Aiming.up`/`started`, `FrameOpts.holdToggle`, `releaseAiming`, the keys' latch), `arena/useArenaCore.ts` (the opts) |
| `04-sticks.md` | `gamepad/gamepad.ts` (`radialDeadzone`'s curve, `readPad`'s `StickSetup`: swap and sensitivity), `controls.ts` (`swapSticks`, `sensitivity`, `SENSITIVITY_LIMITS`), `controlsStore.ts`, `gamepad-hub.ts`, `ControlsPanel.tsx` |
| `05-effects-sounds.md` | `uiStore.ts` (`shake`, `hitstop`, `flash`), `SettingsPanel.tsx` (Effects), `ArenaRenderer.ts` (shake, kick, the hero's flash), `fx/hitstop.ts` (`strength`), `useArenaCore.ts`, `pixel/world.ts` + `render.ts` + `floor-engine.ts` + `pixel-floor.ts` (`PixelWorld.flashStrength`, `FloorFrame.flash`), `shared/utils/sound-manager.ts` (`lootUpgrade`, `lootEssence`), `arena/arena-sounds.ts` (`lootCues`, `playArenaEvents`' cues), `useArenaCore.ts`'s `events` ui event, `pages/DelveRun.tsx` |
| `06-onboarding.md` | `uiStore.ts` (`seen`, `markSeen`), `features/delve/onboarding.ts` (new: `ONBOARDING`, `useOnboarding`), `kit/types.ts` (`Prompt.hint`), `kit/glyphs.tsx` (`PromptBar`'s pulse), `kit/surfaces.tsx` (`Footer`'s line), `kit/kit.css`, the five screens' main prompts (Loadout, Skills, Forge, Quests, the stop), `ForgeBench.tsx`'s two folds, `src/test-setup.ts` (unit tests start with every hint seen), `e2e/fixtures/delve.ts` (`seedProfile` marks every hint seen; `showOnboarding`), a new `delve.spec.ts` D11 |
| `07-close.md` | `e2e/delve-pad-nav.spec.ts` (the ceilings and allowances hold), `delve-type.spec.ts`'s recorded shares, the phase's full run, the spec edits, `CLAUDE.md`, the version |

**Why these cuts.** The type floor (01) comes first because it moves every screen's text, and Text size (02) has to be measured on the screens as they will read. 01 is a sweep with a gate (TY01: no text under 16 design px), 02 is one function and the probes that hold it, plus whatever Large breaks. The three option plans (03, 04, 05) touch the fight's input and its feel, each a field or two in a store and a pure function at the bottom, so each is testable without a browser. Onboarding (06) is last of the features: it puts a line over the footer and must not be confused with layout problems 01 and 02 find. The close (07) is measures and words.

## Grouping for implementers

Two or three plans to one agent, to save context; each group shares files and tests:

| Group | Plans | Why together |
|---|---|---|
| A | `01-type-floor.md` + `02-text-size.md` | Both are about how the menus read; both run the responsive probes and fix the layouts the probes flag (01 at today's sizes, 02 at Large and Medium). The same agent knows which layout fix belongs to which. Run 01's E2E only at 02's end if the same agent does both (see the test policy). |
| B | `03-hold-toggle.md` + `04-sticks.md` + `05-effects-sounds.md` | The fight's options: all three touch `ControlsConfig` / `uiStore` and the settings dialogs (`ControlsPanel`, `SettingsPanel`), and 03 and 04 the same pad code (`gamepad.ts`, `arena-pad.ts`, `input.ts`) and `arena-input.test.ts` / `gamepad.test.ts`. 05 follows 04 in `SettingsPanel` (02 added Text size there first). |
| C | `06-onboarding.md` + `07-close.md` | 06's footer line and folds change what PN01 and the probes see; 07 measures them and closes. |

A group runs its plans in order and commits each plan's tasks as written. When one agent does consecutive plans whose last tasks name overlapping specs, it may skip the earlier plan's end-of-plan E2E and run the union once at the later plan's end.

## Branch

Phase 4 is merged into `padui/main` (v0.68.0). In the worktree `C:/Projects/alloy-padui` (never touch `C:/Projects/Alloy`):

```bash
cd /c/Projects/alloy-padui
git switch padui/main
git switch -c padui/p5
```

## Commands

All from `/c/Projects/alloy-padui` in Git Bash.

```bash
# Client types, one test file, the related tests of changed files, the whole suite
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run <path>)
(cd packages/client && npx vitest related --run <src files…>)
(cd packages/client && npx vitest run)
# Client E2E (starts its own Vite on :5199): one spec, one project, the summary into a scratch file
(cd packages/client && npx playwright test e2e/<file>.spec.ts --project=desktop --reporter=line > "$SCRATCH/e2e-<plan>.txt" 2>&1; tail -n 30 "$SCRATCH/e2e-<plan>.txt")
# The responsive specs
(cd packages/client && npx playwright test --project=responsive e2e/responsive/specs/<file>.spec.ts --reporter=line > "$SCRATCH/resp.txt" 2>&1; tail -n 30 "$SCRATCH/resp.txt")
# The type measure (plan 01): the shares printed per screen
(cd packages/client && TYPE_REPORT=1 npx playwright test e2e/delve-type.spec.ts --project=desktop-1080 --reporter=line > "$SCRATCH/type.txt" 2>&1; grep "TY01" "$SCRATCH/type.txt")
```

`$SCRATCH` is the implementer's own scratchpad directory (never the repo). If Playwright says port 5199 is in use: `netstat -ano | grep ":5199" | grep LISTENING`. This worktree's stale Vite: `taskkill //PID <pid> //F //T`; another checkout's: wait for it.

**The engine is not edited in this phase.** The upgrade and essence sounds read the drop from the world the client already holds (`world.drops` by the event's `dropId`) and the upgrade test the loot plaque already asks (`compareItem` through the mode's `isUpgrade`): no rule of the client's. If plan 05 finds the drop gone from `world.drops` by the time the client handles its event (it should not: `step.ts` prunes only dead drops, and a gear or essence drop is walked over after `drops.pickupDelay`), its fallback is one field on the engine's `drop` event (plan 05, Task 5, step 6), with its own test; anything else in the engine: stop and report.

**Baseline.** Before Task 1 of plan 01, on `padui/p5` fresh from `padui/main`, run

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

and write the count into this section ("Baseline (recorded <date> on `padui/main` at `<sha>`): client `tsc` clean, `vitest run` N files, M tests; all passing"). Phase 4 started at 139 files and 1293 tests and added its own; read the real numbers. If the baseline is not green, stop: phase 4 did not close. Plan 01's Task 1 also records the type baseline (TY01's shares at v0.68.0) before any text changes.

## Conventions

- Match the surrounding code: a doc comment on every export in the project's plain voice; components in PascalCase files, helpers kebab-case (`onboarding.ts`); `UPPER_SNAKE_CASE` constants.
- No game logic in the client: the upgrade cue is the plaque's own `isUpgrade` (`compareItem`, `UPGRADE_EPSILON`), the essence cue reads the drop's `material`; the folds read what the profile holds.
- Pixel art from the kit's `Glyph`; never an emoji (▲ ◂ ▸ are text, as today).
- TDD: the failing test first, run it, the minimal code, run it, commit.
- Commits: `feat(client): …`, `test(client): …`, `refactor(client): …`, `style(client): …`, `docs: …`, each message ending with

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

- Never push. Never switch branches in, or write to, `C:/Projects/Alloy`.
- jsdom has no layout and no `zoom`: unit tests give an element a box by overriding `getBoundingClientRect` where they need one; the zoom's composition is tested on the pure function (`menuScaleFor`) and on the `:root` variables AppShell sets.
- localStorage keys are UI preferences of this device, never the save: `alloy:delve:textSize`, `alloy:delve:fx:shake`, `alloy:delve:fx:hitstop`, `alloy:delve:fx:flash`, `alloy:delve:seen`; the pad and key options ride `alloy:controls:v1` (`ControlsConfig`, still `version: 1`: `parseControls` fills a missing field with its default).

### The test policy (the user's)

- **During a task:** only the test files the task touches (`npx vitest run <path>`), plus `npx tsc --noEmit -p .`.
- **At each commit:** `npx vitest related --run <the src files the commit changes>`.
- **The full client suite** (`npx vitest run`): once, at each plan's end.
- **E2E per plan:** only the specs covering the screens it changed, `--project=desktop`, once at the plan's end, with `--reporter=line` into a scratchpad file, reading only its summary (`tail`). Add `--project=desktop-1080` only when the plan changed a layout; add `delve-pad-nav.spec.ts` only when it changed stops or focus. Each plan's last task names its specs exactly.
- **The phase's close** (plan 07): the full `delve*.spec.ts` at both sizes and the whole responsive project, once.
- **Engine:** only the touched tests; never the pacing suites. This phase should need no engine change (see above).
- **Known flakes and failures** (D02 and Q01 under load; the engine's `economySim` timeout under load; the responsive `delve-stop` at qhd-1440p and ultrawide): rerun that one test alone, once (`-g "<id>"`); never re-run a whole suite for one.

## Proposed spec edits

To make in the spec's section 6 (and the Evidence table and Measures where named) in the close (plan 07, Task 3), each a sentence or two:

1. **The type floor's tiers.** Replace the bullet with: "**Type floor:** 18 design px for anything read (a sentence, an item's line, a body), 16 for labels (a name, a count, a price, a caption, a prompt), from 14: `k-body-2` and the new `k-note` (a caption that is a sentence) at 18, `k-caption`, `k-label` and the kit's chips, steppers and tile marks at 16, and every hard-coded size swept by screen. Nothing in the Delve is under 16 design px, the HUD included (it keeps its own sizes above that, under HUD scale); the DPS Lab, a dev tool, is left out. The responsive probe's text floor rises to 12 CSS px (16 at the 0.75 zoom floor)."
2. **Text size's composition.** Replace "a multiplier on `--ui-scale` for the menus" with: "a multiplier on the menus' zoom only (`--ui-scale`, which `.delve-zoom` reads; the HUD's `--hud-scale` keeps the plain UI scale): `menuScaleFor(w, h, size)` is the UI scale at Small (its quarter steps unchanged), else the UI scale × 1.15 or 1.3, never so large that the window holds less than 1476 × 830 design px (`MENU_MIN`, Large's area at 1920×1080), never under the UI scale, floored to a hundredth (not a quarter step: the kit's sprites snap to device pixels at any zoom). At 1280×800 (UI scale 0.75) Medium is 0.86 and Large is capped to the same 0.86: Settings says so."
3. **The options' places.** Add: "Hold moves by press-to-toggle, swap sticks and stick sensitivity (50–150% a stick, a response curve that keeps full tilt full) are `ControlsConfig` fields (`holdToggle`, `swapSticks`, `sensitivity`), in the Controls editor beside Basic attack and the deadzones; press-to-toggle serves the pad's buttons and the keys. Screen shake (the camera kick included), hit-stop and flash (the floor's lightning and light flashes, the hero's hurt flash) are three Settings sliders, 0 to 100%, each off at 0, after the OS's reduced motion."
4. **The loot sounds.** Add: "The client tells an upgrade drop by the loot plaque's own test (`isUpgrade`) and an essence by the drop's material, both read from `world.drops` by the event's `dropId`; neither needs an engine field."
5. **Onboarding's scope.** Replace the bullet with: "**Onboarding:** five screens (Loadout, Skills, Forge, Quests, the stop) pulse their main prompt with one line above the footer on their first visit, until that action (equip, open a move's editor, forge, claim, take a power-up) is done once on this device (`alloy:delve:seen`, never the save); the action done during the guided start counts. A guided save shows none of it, and nothing in the pause. The Forge bench folds what the save holds none of: no flux, one line for the Flux row; no shard, the Lines as text, not buttons."
6. **The Evidence table's Text line** gains the measured shares at v0.69.0 (plan 07): "at 1920×1080 no text is under 16 px and n–m% of a hub tab's text is under 18 px; at 1280×800 the smallest is 12 px."
7. **Phases table**: phase 5's plan folder `docs/superpowers/plans/2026-10-05-delve-pad-first-ui-p5/`.

## Contracts between the plans

### Test ids

| Test id | Before | After |
|---|---|---|
| `text-size-small`, `text-size-medium`, `text-size-large` | — | Settings → Display → Text size, a kit `Segmented` (02) |
| `text-size-capped` | — | the line under it when this window can't show the chosen size in full (02) |
| `hold-mode-toggle` | — | the Controls editor's "Hold moves: Hold / Press to toggle" beside `attack-mode-toggle` (03) |
| `swap-sticks` | — | the Controls editor's chip (04) |
| `sensitivity-left`, `sensitivity-right` | — | the Controls editor's sliders, beside `deadzone-left`/`-right` (04) |
| `fx-shake`, `fx-hitstop`, `fx-flash` | — | Settings → Effects sliders, 0–100 (05) |
| `onboarding-hint` | — | the line above a screen's footer (06) |
| `data-pulse` (on a `.k-prompt`) | — | the prompt the hint is about (06) |
| `forge-flux-none` | — | the Forge bench's one line for no flux, in place of `forge-flux` (06) |
| `shard-slot-<i>` | a button a line | a button while a shard is held; with none, `forge-line-<i>` text and one `forge-lines-none` line (06) |

### Store fields, functions and props

- `TEXT_SIZES: Record<TextSize, number>` (`small` 1, `medium` 1.15, `large` 1.3), `MENU_MIN = { w: 1476, h: 830 }`, `menuScaleFor(width, height, text: number): number` in `kit/zoom.ts`; `uiScaleFor` unchanged (02).
- `uiStore`: `textSize: TextSize`, `setTextSize`, `menuScale` (mirrored by AppShell; not persisted), `setUiScale(ui, menu = ui)` (02); `shake`, `hitstop`, `flash` (0–1), `setFx(kind, v)` (05); `seen: string[]`, `markSeen(id)` (06).
- `contextZoom('ui')` and `PixelSprite`'s ui context read `menuScale`; `useUiScale()` returns `{ ui: menuScale, hud }` (`hud` still from the plain `uiScale`) (02).
- `ControlsConfig`: `holdToggle: boolean` (03); `swapSticks: boolean`, `sensitivity: { left: number; right: number }` (04). `SENSITIVITY_LIMITS = [0.5, 1.5]` (04). `controlsStore`: `setHoldToggle`, `setSwapSticks`, `setSensitivity` (03, 04).
- `castsOnRelease` exported from `arena-pad.ts`; `PadMemory.latch: { slot: number; started: boolean } | null`; `latchHolds(registry, world, acts, mem)` (03).
- `Aiming.up?: boolean`, `Aiming.started?: boolean`, `FrameOpts.holdToggle?: boolean`, `releaseAiming(input)` in `arena/input.ts` (03).
- `radialDeadzone(x, y, deadzone, sensitivity = 1)`; `StickSetup`; `readPad(pad, setup?: StickSetup)` (04).
- `HitStop.onEvents(events, now, strength = 1)` (05); `PixelWorld.flashStrength` (0–1), `FloorFrame.flash?: number` (05).
- `SoundName` gains `lootUpgrade`, `lootEssence`; `LootCue = 'upgrade' | 'essence'`; `lootCues(world, events, isUpgrade?)`, `playArenaEvents(events, cues?)`; the core ui event `{ kind: 'events'; events; cues }` (05).
- `Prompt.hint?: string` (06); `ONBOARDING`, `OnboardingId`, `useOnboarding(id, active = true): { hint: string | undefined; done: () => void }` (06).

### E2E fixtures (`e2e/fixtures/delve.ts`, `e2e/responsive/viewports.ts`)

```ts
/** Every onboarding hint seen, so no test meets one it didn't ask for (plan 06). Inside seedProfile's init script. */
/** The onboarding hints back, for the test that reads them. Call after `seedProfile`. (plan 06) */
export async function showOnboarding(page: Page): Promise<void>;
/** The Delve's text-size views: 1920×1080 at Large and 1280×800 at Medium (plan 02). */
export const TEXT_VIEWPORTS: readonly Viewport[];
/** Set a view's text size before the page loads; after `seedProfile` (whose init script clears storage first). (plan 02) */
export async function textSizeFor(page: Page, vp: Viewport): Promise<void>;
```

### From phases 1 to 4, relied on

The kit's `Screen`, `Footer`, `PromptBar` and `Prompt` (phase 1's `orderPrompts`), the kit `Segmented` and `Stepper`, the responsive probes (`runProbes`, `delve: {}`), the pad audit's `check`, `CEILING`, `ALLOW` and `BUDGET`, the hub's `useHubTabs` and `HubMode` (`'anvil' | 'pause'`), the store's `startTutorial`, `undoSalvage`.
