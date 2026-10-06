# Close phase 5 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the pad audit's ceilings and allowances hold (none rises; the Forge's fall where the fold took stops), the type measure's shares are recorded at v0.69.0, the whole phase is green at both sizes and in the responsive project (Large at 1920×1080 and Medium at 1280×800 included), and the spec, `CLAUDE.md` and the version say v0.69.0.

**Tech Stack:** Playwright, Vitest.

Read `00-overview.md` first. Plans 01 to 06 are done.

---

### Task 1: the pad audit holds

**Files:**
- Modify: `packages/client/e2e/delve-pad-nav.spec.ts`

- [ ] **Step 1: Measure.** `(cd packages/client && NAV_REPORT=1 npx playwright test e2e/delve-pad-nav.spec.ts -g PN01 --reporter=line > "$SCRATCH/nav.txt" 2>&1)` on both projects; read each screen's stop count and unreversed moves in the file, and PN07's budgets (`-g PN07` with `NAV_REPORT=1`).
- [ ] **Step 2: Nothing rises.** For every screen in `CEILING` and `ALLOW`, the measured count is at most the recorded one. A rise is a layout this phase broke (a row that wraps at 16 px under a wider one; a Settings row laid out ragged); fix it in the plan that made it (01, 02 or 05), never raise the number. Expected falls:
  - `forge-pattern` (14 at v0.67.0): the audit save holds no flux, so the Flux row is a line (−1), and if it holds no shard, the Lines are text (− its line buttons). Lower `CEILING['forge-pattern']` to the count measured, its comment: "with a pattern open, its Metal and Element rows (a save with no flux sees one line for it, and none of its lines is a stop without a shard) and Forge".
  - PN07's forge budget may fall by one (no flux step): leave `BUDGET` as it is; record the measured counts for the spec.
  - `settings` has no ceiling and `ALLOW.settings = [0, 0]` holds (Text size and Effects added stops, not unreversed moves).
- [ ] **Step 3: Run the audit at both sizes**

```bash
(cd packages/client && npx playwright test e2e/delve-pad-nav.spec.ts --reporter=line > "$SCRATCH/nav.txt" 2>&1; tail -n 20 "$SCRATCH/nav.txt")
```

  Expected: PASS on `desktop` and `desktop-1080`.
- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/delve-pad-nav.spec.ts
git commit -m "test(client): the pad audit holds through phase 5; the Forge's pattern view lost its folded stops"
```

---

### Task 2: the type measure's record, and the phase's full run

- [ ] **Step 1: The shares at v0.69.0.**

```bash
(cd packages/client && TYPE_REPORT=1 npx playwright test e2e/delve-type.spec.ts --project=desktop-1080 --reporter=line > "$SCRATCH/type-close.txt" 2>&1; grep "TY " "$SCRATCH/type-close.txt")
```

  Write the hub tabs' range of "<18" into the spec edit 6 (the overview), beside plan 01's baseline.

- [ ] **Step 2: The full run** (long: in the background, each into a scratch file; read the summaries)

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run > "$SCRATCH/unit-close.txt" 2>&1; tail -n 15 "$SCRATCH/unit-close.txt")
(cd packages/client && npx playwright test e2e/delve*.spec.ts --reporter=line > "$SCRATCH/e2e-close.txt" 2>&1; tail -n 40 "$SCRATCH/e2e-close.txt")
(cd packages/client && npx playwright test --project=responsive --reporter=line > "$SCRATCH/resp-close.txt" 2>&1; tail -n 40 "$SCRATCH/resp-close.txt")
```

  Expected: the client suite at the overview's baseline plus this phase's files, all passing; every Delve spec on `desktop` and `desktop-1080` (`delve-type.spec.ts` skips on `desktop` by design); every responsive probe, the `fhd-large` and `deck-medium` runs included. A known flake or failure (D02, Q01, the `economySim` timeout under load, responsive `delve-stop` at qhd-1440p and ultrawide): rerun that one alone once (`-g "<name>"`), never the suite. The engine is untouched: no engine run (unless plan 05's fallback ran, and then its one test ran there).

- [ ] **Step 3: Commit** whatever the run fixed (nothing expected).

---

### Task 3: the spec, the docs and the version

**Files:**
- Modify: `docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md`
- Modify: `CLAUDE.md`
- Modify: `packages/client/package.json`
- Create: `docs/superpowers/plans/2026-10-05-delve-pad-first-ui-p5/` (these plans, if not yet in the repo)

- [ ] **Step 1: The spec.** Make the overview's seven edits (section 6, the Evidence table's Text line with Task 2's shares, the Phases table's folder), and copy these plans into `docs/superpowers/plans/2026-10-05-delve-pad-first-ui-p5/`.
- [ ] **Step 2: `CLAUDE.md`,** in its own voice and density, changing only what this phase changed (find each phrase with `grep -n` first; a phrase that reads otherwise now: change the sentence that says the same thing):
  - **Client**, the zoom: "`.delve-zoom` (the hub, the pause, the stop, dialogs, tooltips) reads `--ui-scale` (the design's fit rounded down to a quarter step, 0.75 to 2: `uiScaleFor`)" becomes "`.delve-zoom` (the hub, the pause, the stop, dialogs, tooltips) reads `--ui-scale`, the menus' zoom (the design's fit rounded down to a quarter step, 0.75 to 2, `uiScaleFor`, times Settings → Text size: Small, Medium, Large, 100, 115, 130%, `uiStore.textSize`, `alloy:delve:textSize`; past Small floored to a hundredth and capped where a screen would hold less than 1476 × 830 design px, `menuScaleFor`, `MENU_MIN`: at 1280×800 Medium and Large are both 0.86)"; "(the UI scale × Settings → HUD scale" stays (the HUD never takes the text size); "mirrors the UI scale into `uiStore`" becomes "mirrors both into `uiStore` (`uiScale`, the HUD's base; `menuScale`, which `contextZoom('ui')` and `PixelSprite` read)".
  - **Client**, the kit: after "`kit.css` is the forge theme: wood, riveted steel and glowing mana in ENDESGA 32, Jersey 10 / Pixelify Sans / Silkscreen" add "; its type floor is 18 design px for anything read (`k-body-2`, `k-note`: a caption that is a sentence) and 16 for labels (`k-caption`, `k-label`, the chips, steppers, glyph caps and tile marks), nothing in the Delve under 16, the HUD included (`e2e/delve-type.spec.ts`: TY01 the Anvil, TY02 the dive; the responsive probe's text floor is 12 CSS px)".
  - **Client**, the prompt runtime: after the `Prompt`'s fields add "`hint`, onboarding's line: the prompt pulses (`data-pulse`) and `Footer` draws the line over the plank (`onboarding-hint`)".
  - **Client**, Settings: the sentence listing what Settings holds gains "Text size" after "HUD scale" … and "Effects (Screen shake, Hit-stop, Flashes, 0–100%, each off at 0: `uiStore.shake`, `hitstop`, `flash`, `alloy:delve:fx:*`)".
  - **Client**, the Forge clause: after "`ForgeBench` (a bar, a flux, with epic flux an essence, …)" add "(a save with no flux sees one line for its Flux row, and with no shard its Lines as text; a guided save folds nothing)".
  - **Client**, a sentence after the Anvil's tabs: "**Onboarding** (`features/delve/onboarding.ts`): Loadout, Skills, Forge, Quests and the stop pulse their main prompt with one line over the footer on a first visit (`ONBOARDING`, `useOnboarding`), until that action (equip, a move's editor opened, a forge, a claim, a power-up taken) is done once on this device (`uiStore.seen`, `alloy:delve:seen`, never the save); never on a guided save nor in the pause, and an action done in the guided start counts. Unit tests start with every hint seen (`src/test-setup.ts`), the E2E too (`seedProfile`; `showOnboarding` brings them back)."
  - **Client**, the dive: after "a loot plaque carries ▲ for an upgrade as it comes" (Weapon movesets) or in the arena-sounds mention (Training Grounds' "one set of arena sounds (`arena/arena-sounds.ts`)"): "an upgrade drop (▲) and an essence each play their own sound (`lootUpgrade`, `lootEssence`; `lootCues` reads the drop from `world.drops` by the event's id, the upgrade by the plaque's own `isUpgrade`)".
  - **Mana-pixel FX:** "Hits carry heft: heavy ones freeze the display briefly (`fx/hitstop.ts`) and kick the camera" becomes "Hits carry heft: heavy ones freeze the display briefly (`fx/hitstop.ts`, × Settings → Effects → Hit-stop) and kick the camera (× Screen shake, as every shake; the OS's reduced motion turns both off)"; and after the pixel floor's "lit by what glows" in **Pixel floor**: "(its lightning and blast flashes × Settings → Effects → Flashes: `PixelWorld.flashStrength`, sent on each frame as `FloorFrame.flash`)".
  - **Controller:** "Both thumbs stay on the sticks: left moves, right aims" becomes "Both thumbs stay on the sticks: left moves, right aims (Swap sticks swaps them and their clicks, and each stick has its sensitivity, a response curve from 50 to 150%: `readPad`, `radialDeadzone`)"; "a hold move charges while held and fires on release" becomes "a hold move charges while held and fires on release (with Hold moves: Press to toggle, from a press to the next: `latchHolds`; the keys alike)".
  - **Custom controls:** "every controller and keyboard binding, hold-to-repeat per ability (…), stick deadzones and aim reach live in a `ControlsConfig`" becomes "… stick deadzones, each stick's sensitivity (`sensitivity`), Swap sticks (`swapSticks`), hold moves by press-to-toggle (`holdToggle`) and aim reach live in a `ControlsConfig`"; "(…; it also holds the Basic attack Auto/Manual toggle)" becomes "(…; it also holds the Basic attack Auto/Manual toggle and, beside it, Hold moves: Hold / Press to toggle)".
  - **Guided start:** after "How to delve is hidden on a guided save" add "; so are the onboarding hints and the Forge bench's folds".
- [ ] **Step 3: The version.** `packages/client/package.json`: `"version": "0.69.0"`.
- [ ] **Step 4: Nothing reads the old version**

Run: `(cd packages/client && npx vitest run src/pages src/features/delve/hub/__tests__/SettingsPanel.test.tsx)`
Expected: PASS (the version is imported, never hard-coded).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers CLAUDE.md packages/client/package.json
git commit -m "docs: the pad-first spec's phase 5 edits and CLAUDE.md for the type floor, Text size, the fight's options, the loot sounds and onboarding; chore(client): bump version to 0.69.0"
```
