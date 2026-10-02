# Delve UI v1 · Phase 3b · 3E: Stop and summary — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The stop between depths as one full kit screen over the dimmed arena (`StopScreen`, `door-choice` on its root): "Depth N cleared" with the bounty and the floor's finds; "Found this floor" on the left; the power-up cards in the centre, each expanding in place to its picker (its own pad scope with Back); the doors on the right as plate buttons with art, Extract and the potion below them; Esc and the pad's Menu open the pause over it. `DiveSummary` and `LegendaryFanfare` take the kit. `DelveRun` renders the stop, then (at integration) 3D's `PauseScreen` in place of the kebab menu: the Found log's items open it on Loadout, the Journal on Quests. `DoorChoice`, `LootTray`, `RunePicker`'s sheet variant and the `.delve-sheet`, `.delve-column` and `.delve-door` CSS go. Emoji become glyphs on the stop and the summary.

**Architecture:** `features/delve/stop/StopScreen.tsx` is a kit `Screen` (`backdrop="arena-stop"`, `headerStyle="bare"`) whose main holds the header and a `380px minmax(0,1fr) 420px` grid: the found panel (`useFloorFinds`, from the store's `floorDropsFrom` / `floorRunesFrom`), `StopPanel` (the cards and the pickers, which keep their code and lose the portal sheet) and `stop/DoorPane.tsx`. The footer draws Take, Inspect item and Skip power-up (`usePrompts`) and a Menu button carrying `data-pad-menu`, so the prompt runtime's Esc rule (the topmost scope's `[data-pad-back]`, else its `[data-pad-menu]`) opens the pause at the top level and presses the picker's Back while one is open. `DelveRun` keeps one `pause` state (`{ link?: HubLink } | null`) for every way in. No engine change, no store change.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, Vitest 3 (jsdom, Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md`: "3b · Pause, stop and Training" → **3E** (authoritative), its sequencing (revision 2) and E2E list; decided items 19 (the Esc / Menu rules), 20 (stop cards), 21 ("Found this floor"), 27 (emoji), 33 (14 px floor), 39 (in-pane sub-modes are scopes); the input map's stop row (Take · inspect · skip: Click · hover · S / A · Y · X; Pause: Esc / Menu); the kit contract. Mockup: `Stop.dc.html` (the session scratchpad's `ui-canvas/project/`). The overview is `00-overview.md` in this folder.

---

## Base

- **Starts from:** `ui/p3b` at `cd13060` (Phase 3a, v0.56.0). Tasks 1–4 run in this area's worktree, `C:/Projects/alloy-ui-3e` on branch `ui/p3b-3e` (`powershell -File <scratchpad>/mkwt.ps1 alloy-ui-3e ui/p3b-3e ui/p3b`: the Phase 2 junction rules, the client's `@alloy/engine` pointing at the worktree's own engine). Every path below is relative to the worktree root, `/c/Projects/alloy-ui-3e` in Git Bash.
- **Tasks 5 and 6 run at integration, on `ui/p3b`** (`/c/Projects/alloy-ui-p3b`), like Phase 2's 2A Task 9:
  - **Task 5** (the pause in `DelveRun`) after 3D has merged: it imports 3D's `hub/PauseScreen.tsx`, which doesn't exist on this branch. It must also land **before** 3D deletes `ItemDetailSheet.tsx`, which `DelveRun` imports until Task 5 (X2).
  - **Task 6** (`RunePicker` inline only, the `.delve-sheet` CSS) after 3F has merged (the spec's revision 2: `TrainingPanel` uses the sheet until 3F) and after 3D's deletion of `ItemDetailSheet.tsx` (the other `.delve-sheet` user). It is this area's last commit.
- **Until Task 5** the stop's Menu and a find's click open today's kebab menu and `ItemDetailSheet`, which Task 3 draws after the stop so they sit on top. Every Delve E2E passes unchanged on Tasks 1–4 (checked: 24 of 24 on `desktop`).
- **Before Task 1:** build the engine once for the junction and measure the client:

```bash
cd /c/Projects/alloy-ui-3e
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; at `cd13060` the suite reads **1146 tests in 145 files**. Call the measured counts **N tests in F files**. Tasks 1–4 end at **N + 7 tests in F + 1 files**; Task 5 adds 2 tests and Task 6 removes 1, on top of whatever `ui/p3b` reads then.

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/StopPanel.tsx` | **Overwritten (Task 1):** the cards as plates in three columns (glyph, name, text, price), each expanding in place to its picker (`stop-picker`, a `role="group"` pad scope with a kit Back); the pickers keep their code with kit Buttons and `Price`; `RunePick` uses `RunePicker variant="inline"`; no portal, no emoji. Task 6 drops `variant="inline"` |
| `packages/client/src/features/delve/__tests__/StopPanel.test.tsx` | **Overwritten (Task 1):** in place, not a sheet; prices as `Price` text; the rune picker inside the stop's picker |
| `packages/client/src/features/delve/stop/StopScreen.tsx` (new, Task 2) | `StopScreen`: the kit screen, the header, the found panel (`useFloorFinds`), the centre (`StopPanel`, or "skipped" / "no power-up"), `DoorPane`, the footer prompts and Menu |
| `packages/client/src/features/delve/stop/DoorPane.tsx` (new, Task 2) | "Choose your path": doors as plate buttons with 84×96 doorway art, Extract with the hero, life and potions, `door-potion` |
| `packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx` (new, Task 2) | the header, the floor's finds, the doors, Esc / Menu, Esc in a picker, Skip, Y |
| `packages/client/src/pages/DelveRun.tsx` | Task 3: the stop replaces the `choosing` overlay. Task 5 (integration): `PauseScreen` replaces the kebab menu, `ControlsPanel` and `ItemDetailSheet` |
| `packages/client/src/pages/__tests__/DelveRun.test.tsx` | Task 3: the stop and its Menu. Task 5: **overwritten**, with `PauseScreen` stubbed to its contract |
| `packages/client/src/features/delve/DoorChoice.tsx`, `LootTray.tsx`, `__tests__/LootTray.test.tsx` | **Deleted (Task 3).** LootTray's test follows its component: the found rows, their marks and the grouped runes are `StopScreen.test`'s |
| `packages/client/src/features/delve/delve.css` | Task 3: `.delve-column` and `.delve-door` go (no user left). Task 6: `.delve-sheet-backdrop` and `.delve-sheet` go |
| `packages/client/src/features/delve/DiveSummary.tsx`, `LegendaryFanfare.tsx` | **Overwritten (Task 4):** kit roots and materials, glyphs for emoji; content and ids unchanged |
| `packages/client/src/features/delve/__tests__/DiveSummary.test.tsx` | **Overwritten (Task 4):** the kit root, the bounty both ways, no emoji |
| `packages/client/src/features/delve/__tests__/LegendaryFanfare.test.tsx` (new, Task 4) | the kit root, the name, the codex line, a click goes on |
| `packages/client/src/features/delve/runes/RunePicker.tsx` | Task 6: the sheet variant and the `variant` prop go; always inline |
| `packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx` | Task 6: a group, not a dialog; the backdrop and UI-layer cases go |

Outside the Owns column, and why (all in Task 6, each forced by removing the sheet): `hub/skills/MoveInspector.tsx` (one line: it passes `variant="inline"`, which no longer exists) and `kit/__tests__/kit-css.test.ts` (its `.delve-sheet` row asserts the rule Task 6 deletes). No other file outside the area changes.

## Cross-area needs

**X1 · 3D (`hub/PauseScreen.tsx`): the contract Task 5 codes against.** `export interface PauseScreenProps` exactly as the spec (`dive`, `biome`, `foesLeft`, `link?: HubLink`, `onResume`, `onAnvil`, `onAbandon`) and `export function PauseScreen(props: PauseScreenProps)`; `DelveRun.test.tsx` imports the type and stubs the component. What `DelveRun` does with it:
1. It renders `<PauseScreen …/>` inside `<div className="absolute inset-0 z-40" data-testid="dive-pause">`, after the stop (so over it, and the topmost pad scope by DOM order) and above the HUD grid (`z-20`). The pause's root should be a kit `Screen` (absolutely filling that wrapper) and needs no z-index of its own.
2. `link`: `undefined` from the purse's Menu, Esc in the fight and the stop's Menu (the pause's default tab); `{ tab: 'loadout', uid }` from a find (the HUD's Found log or the stop's found panel; the item is `markSeen` first, as opening it always did); `{ tab: 'quests' }` from the Journal (the purse's button, `data-pad-journal`, which the arena's `journal` action clicks, and the tracker). A new `link` can arrive only by closing and reopening.
3. `onResume` closes it (`DelveRun` drops it; the arena or the stop is live again). `onAnvil` navigates to `/delve` (the floor restarts). `onAbandon` closes the dive (`closeDive`) and navigates to `/delve`.
4. Resume must carry `data-pad-back` (Esc and B resume, the spec's footer) and `data-pad-menu`; `DelveRun` renders no `ControlsPanel` any more, so the pause's own Controls (`open-controls`) holds `attack-mode-toggle`.

**X2 · 3D: delete `ItemDetailSheet.tsx` after Task 5.** `DelveRun.tsx` imports it until Task 5 lands on `ui/p3b`; 3D's deletion commit runs after that (and Task 6 after the deletion, since `.delve-sheet` is the sheet's style).

**X3 · 3F: Task 6 runs after 3F merges.** After it, every `RunePicker` is inline: `ChainEditor`'s `<RunePicker {...ed.picker} />` (the Training dock's Abilities tab) draws in place at the editor's foot with no change to `ChainEditor`. If 3F passes `variant="inline"` to a `RunePicker` anywhere, Task 6's grep finds it and removes it. `useRunePickerOpen` stays while anything imports it (today `DelveTraining.tsx`); Task 6 deletes it only when 3F has dropped that import.

**X4 · Integrator: the E2E.** The specs are the integrator's files. Ids this area keeps, with the same behaviour: `door-choice` (now the stop screen's root), `stop`, `stop-<kind>`, `stop-picker`, `stop-taken`, `stop-equip-item`, `stop-equip-weapon-note`, `stop-slot-<skill>`, `stop-move-take`, `stop-upgrade-item`, `stop-rune-move-<skill>-<i>`, `rune-picker` (now inside `stop-picker`), `loot-item`, `loot-runes`, `loot-rune`, `door-<id>`, `extract-button`, `door-potion`, `dive-summary`, `return-camp`, `dive-again`, `dive-dust`, `dive-links`, `dive-runes`, `legendary-fanfare`, `fanfare-name`. New: `floor-finds`, `floor-counts`, `boss-slain`, `stop-skipped`, `dive-pause` (Task 5). Gone: `loot-tray`, `equip-upgrades`, and the stop's copies of `upgrades-locked` / `upgrades-potential` (the HUD's Found log keeps both). The edits, by owner of the behaviour:

*This area's (D03 and R03 as written here passed on the scratch copy; D01's insertion waits for 3D's pause):*
- **D03** becomes the stop screen. Replace the lines from `  test('D03: the door screen offers a power-up, and a door leads to the next depth', async ({` up to (not including) `  test('D07: diving again at the same depth starts a fresh floor', async ({ page }) => {` with:

```ts
  test('D03: the stop shows the floor, a power-up expanding in place, and a door to the next depth', async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();

    const door = page.getByTestId('door-choice');
    await expect(door).toBeVisible({ timeout: 60_000 });
    await expect(door.getByRole('heading', { level: 1 })).toHaveText('Depth 1 cleared');
    await expect(door.getByTestId('floor-finds')).toContainText('Banked when you leave this stop.');
    // The first card expands in place to its picker; Esc presses the picker's Back and the
    // focus returns to the card. Skipping the power-up is taking a door.
    const stop = door.getByTestId('stop');
    const card = stop.locator('[data-testid^="stop-"]').first();
    await card.click();
    const picker = stop.getByTestId('stop-picker');
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await expect(card).toBeFocused();
    await door.locator('[data-testid^="door-"]').first().click();
    await expect(door).toBeHidden();
    await expect(page.getByTestId('depth-label')).not.toHaveText('DEPTH 1');
    await expect(page.getByTestId('monsters-left')).toContainText('foes');
  });

```

- **R03** (`delve-runes.spec.ts`): the card expands in place. Replace: `    const stopPicker = page.getByTestId('stop-picker');` with: `    const stopPicker = page.getByTestId('stop').getByTestId('stop-picker');`. Replace:

```ts
    await stopPicker.getByTestId('stop-rune-move-primary-0').getByTestId('socket-0').click();
    const picker = page.getByTestId('rune-picker');
```

with:

```ts
    await stopPicker.getByTestId('stop-rune-move-primary-0').getByTestId('socket-0').click();
    const picker = stopPicker.getByTestId('rune-picker');
```
- **D07:** unchanged (`extract-button`, `dive-summary` "EXTRACTED", `dive-again`).
- **D01** ("pause, then return", after Task 5 and 3D): after the line `    await expect(page.getByTestId('dodge-button')).toBeVisible();` insert:

```ts
    // Esc pauses the dive over the arena; Esc again (Resume) returns to the fight.
    await page.keyboard.press('Escape');
    const pause = page.getByTestId('dive-pause');
    await expect(pause).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pause).toBeHidden();
```

*Through 3D's pause (Task 5 wires it; the texts and ids inside are 3D's):*
- **D02:** replace the lines from `    // Inspected from the right column's "Found this floor" log.` up to (not including) `    await page.getByTestId('bag-item').first().click();` with:

```ts
    // Inspected from the right column's "Found this floor" log: the pause opens on Loadout.
    const loot = page.getByTestId('pickup-feed').getByTestId('loot-item').first();
    await expect(loot).toBeVisible({ timeout: 60_000 });
    await loot.click();
    const pause = page.getByTestId('dive-pause');
    await expect(pause).toBeVisible();
    await expect(pause.getByTestId('item-name')).not.toBeEmpty();
    // Gear is locked mid-dive.
    await expect(pause.getByTestId('equip-button')).toHaveCount(0);
    await expect(pause.getByTestId('equip-locked')).toHaveText('Locked during the dive');

    // Abandon the dive (items are kept), and equip it at the Anvil (answering an off-pair
    // item's bind choice, which the compare pane shows in place of Equip; the pane stays).
    await pause.getByRole('button', { name: 'Abandon · lose bounty' }).click();
    await expect(page.getByTestId('delve-camp')).toBeVisible();
    const sheet = page.getByTestId('item-sheet');
```

- **D05:** replace:

```ts
    await page.getByRole('button', { name: 'Dive menu' }).click();
    const toggle = page.getByTestId('attack-mode-toggle');
```

with:

```ts
    await page.getByRole('button', { name: 'Dive menu' }).click();
    await page.getByTestId('open-controls').click();
    const toggle = page.getByTestId('attack-mode-toggle');
```

The rest of D05 stands as long as 3D's toggle reads "Auto" / "Manual".
- **D09:** replace: `    const menu = page.getByTestId('attack-mode-toggle');` with: `    const menu = page.getByTestId('dive-pause');` (Esc opens the pause and Esc resumes; in the Controls dialog, Esc closes only the dialog).
- **G01** (`delve-gamepad.spec.ts`) becomes the spec's "Menu opens the pause with Resume focused; RB steps its tabs, skipping Forge; B resumes; Menu opens it again, and A on Resume resumes". A sketch against 3D's ids (the pause's tabs as the hub's `tab-<id>`, Resume by name):

```ts
  test('G01: Menu opens the pause with Resume focused; RB skips Forge; B resumes; A on Resume resumes', async ({
    page,
  }) => {
    await setup(page, true);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });

    await tap(page, BUTTON.menu);
    const pause = page.getByTestId('dive-pause');
    const resume = pause.getByRole('button', { name: 'Resume' });
    await expect(resume).toBeFocused();
    await expect(pause.getByTestId('tab-loadout')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(pause.getByTestId('tab-skills')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(pause.getByTestId('tab-codex')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.b);
    await expect(pause).toBeHidden();
    await tap(page, BUTTON.menu);
    await expect(resume).toBeFocused();
    await tap(page, BUTTON.a);
    await expect(pause).toBeHidden();
  });
```

- **G05:** replace: `    await expect(page.getByTestId('attack-mode-toggle')).toBeHidden();` with: `    await expect(page.getByTestId('dive-pause')).toBeHidden();` (B closes the editor, then B resumes).
- T01 and T02 are 3F's.

**X5 · Integrator:** the `0.57.0` bump and Phase 4's `CLAUDE.md` rewrite (the stop: `StopScreen`, `DoorPane`; the pause wiring) are not this area's.

## Where the spec left room

- **The header sits in the main, not in `Screen`'s header row.** The kit's `Screen` has a fixed 72 px header row, and the stop's header (a 14 px label, the 64 px "Depth N cleared", the boss line) is 90–115 px. So the stop passes `header={null}` with `headerStyle="bare"`: the empty 72 px row stands in for the mockup's 56 px top padding, and the main holds the header and the grid at 72 px sides (the mockup's), the grid with a 28 px gap and bottom padding. No kit change.
- **The HUD stays under the stop,** as 3a left it (its dock already hidden while choosing): the stop sits at `z-40` over the grid's `z-20`, and the backdrop's 82 % hides most of it. The purse's `bounty` (D01 reads it at the door) stays.
- **The cards** name their kind and pre-pick nothing (decided item 20): the kind's glyph (`up`, `link`, `dust`, `anvil`, `rune`), its name, what it does and a price well ("Free", "Links and scrap", "Mana Dust", "Scrap"). Taking a card replaces the cards with its picker in the centre column; Back (or Esc) brings the cards back and focuses the card again (`flushSync`, then a lookup by id, since the card remounts); a take moves the focus to the first door, as today.
- **Skip power-up** (S / X): the engine has no skip (skipping is choosing a door), so it is the screen's own state: the cards give way to "Power-up skipped. On to the next depth." (`stop-skipped`) and the focus goes to the first door. It is disabled when there is nothing to skip.
- **Inspect item** (Hover / Y): hover or focus shows a find's `ItemTooltip` (placed right, into the centre); Y opens the focused find in the pause, as a click does. **Take** (Click / A) is display only.
- **Menu** is a kit `Button` in the footer (quiet, `binding` Esc / Menu, `data-pad-menu`, `data-pad-skip`, `tabIndex={-1}`): `PromptBar`'s `asButton` can carry `data-pad-back` but not `data-pad-menu`, and the stop's top level must have no Back. B at the top level does nothing; Menu and Esc open the pause; with a picker open, Esc and B press its Back.
- **Door art:** a door that raises Magic Find (Gilded Halls, Cursed Crypt) shows the chest glyph; any other the first monster of the next depth's biome (`getBiomeForDepth(depth + 1 + skip)`), a `PixelSprite` at 4 in `context: 'ui'`, standing at the doorway's foot. The doorway clips with `overflow: hidden`: the Storm Foundry's 1.4-size sentry (90 px at 4) loses a few px at each side. Extract shows the hero and "Leave with N scrap and M finds" (M: `dive.found`'s total). Each door also shows "Depth N" and, before a boss, a skull and "Boss". Extract sits outside the doors' scroll list, so at the 0.75 floor (where a third door scrolls) it is always on screen.
- **The found panel** lists the floor's items, newest first (a 36 px box with the item's icon in its rarity, the name in `RARITY_TEXT`, "Rare Gauntlets", ▲ / ◇ / ▼ as the HUD's Found log marks them), then its runes grouped (a family-coloured rune glyph, "Split III ×2", "Rune, to your pouch"), then "Banked when you leave this stop." `useFloorFinds` repeats `FoundLog`'s fifteen-line valuation, since `FoundLog.tsx` is not this area's; a later pass can share it. The upgrade notes (`upgrades-locked`, `upgrades-potential`) stay on the HUD; the rows carry the marks here. LootTray's after-the-dive "Equip upgrades" goes: the tray only ever rendered while choosing.
- **Counts:** "n scrap bounty" is the dive's bounty; "n items" and "n runes" are this floor's (the rows' count, and the runes summed).
- **First focus on the pad:** the first door carries `data-pad-first` (Phase 4's reachability names the first door the stop's primary action).
- **The summary and the fanfare** keep their content and ids. Each root becomes `.delve-ui.delve-zoom` (so it scales with `--ui-scale`) with stepped glows instead of soft ones, kit type, a plate for the stats, kit Buttons (Return is hot metal and `data-pad-first`) and `Price` / `Glyph` for ⚙ ✦ 🔗 ◈. The fanfare drops its blur and drop-shadow filters (no blur in the kit) and keeps "Tap to continue" (content unchanged).
- **`dive-pause`** is `DelveRun`'s wrapper, so the E2E never depends on the pause's own root id.

## Conventions

The overview's shared conventions. In short:
- **One commit per task**, staged by path, never `git add -A`. Tasks 1–4 on `ui/p3b-3e`; Tasks 5 and 6 on `ui/p3b` at integration. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell; every commit block starts with `cd` to it.
- **Line endings:** `packages/client/src/pages/DelveRun.tsx` is **CRLF** in the working tree (every other file here is LF): edit it with the Edit tool only (never `sed -i`, never a Write), which keeps its endings. New files are written LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** every file the commit blocks format passed `npx prettier --check --end-of-line auto` at the base or is new, and the code below is already formatted (checked on the scratch copy), so `--write` changes nothing typed as written.
- **How the edits read** (the 4a plan's language): "Replace: A with: B" is one Edit. "Replace the lines from `A` up to (not including) `B` with: C" is one Edit from the start of the line reading `A` (ignoring its indentation) to the end of the line before the one reading `B`; a blank line at C's end stays. "Delete the lines from `A` up to (not including) `B`." removes them. "Create `f`:" and "Overwrite `f`:" are a Write. Every anchor is unique in its file at that point; apply each file's edits top to bottom.
- **Checked on a scratch copy:** `git archive ui/p3b` (`cd13060`) with junctions to the main tree's `node_modules`. Every task's edits were applied in order by a script that checks each anchor once in its file, and every FAIL and PASS below was run. Task 5 ran against a stand-in `hub/PauseScreen.tsx` (the spec's contract, rendering nothing; never committed) and Task 6 after deleting `ItemDetailSheet.tsx` and its test (3D's X2). The client typecheck stayed clean and every file formatted. The Delve E2E (`delve`, `delve-runes`, `delve-gamepad` on `desktop`) passed 24 of 24 on Tasks 1–4 with the specs unchanged; with Tasks 5–6, D01, D03 (as X4), D04, D06, D07 and R03 (as X4) passed.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Engine bundle (once) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| E2E (integration) | `(cd packages/client && npx playwright test -c playwright.scratch.config.ts --project=desktop e2e/delve.spec.ts e2e/delve-runes.spec.ts e2e/delve-gamepad.spec.ts)` (the Phase 2 overview's scratch config and dev server on 5288) |

---

## Chunk 1: The power-ups in place

### Task 1: `StopPanel`: kit cards that expand in place to their pickers

The cards become plates in three columns; a card's picker replaces them in the centre column as its own pad scope (`role="group"`, a kit Back with `data-pad-back`), never a sheet over the screen. The five pickers keep their logic: kit Buttons, `Price` for every price, `RunePicker variant="inline"` for the rune pick (inside the stop's picker: decided item 39). No emoji.

**Files:**
- Overwrite: `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`
- Overwrite: `packages/client/src/features/delve/StopPanel.tsx`

- [ ] **Step 1: The failing test**

Overwrite `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  generateItem,
  heroChains,
  movesetOf,
  pouchCount,
  SeededRNG,
  upgradeCost,
  type Chains,
  type StopKind,
} from '@alloy/engine';
import { StopPanel } from '../StopPanel';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import { pricedRegistry } from '../runes/__tests__/priced-registry';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
const helm = generateItem(
  registry,
  { uid: 'h1', ilvl: 3, rarity: 'rare', slot: 'helm', mana: 'fire' },
  new SeededRNG(4),
);
const back = () => screen.getByRole('button', { name: 'Back' });

/** At the door screen after depth 1, a stop offering `offers`; the panel reads the store's. */
function atStop(offers: StopKind[], over: Partial<ReturnType<typeof store>['profile']> = {}) {
  store().setProfile({ ...store().profile, bag: [helm], ...over });
  store().startDive(1);
  const dive = store().profile.dive!;
  store().setProfile({
    ...store().profile,
    dive: { ...dive, phase: 'choosing', stop: { offers, taken: false } },
  });
  const Panel = () => {
    const stop = useDelveStore((s) => s.profile.dive!.stop!);
    return (
      <div data-pad-scope>
        <StopPanel stop={stop} />
        <button data-testid="door-first">The first door</button>
        <ToastContainer />
      </div>
    );
  };
  return render(<Panel />);
}

describe('StopPanel (the stop between depths)', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('shows the offered kinds as cards that expand in place to their picker, and once one is taken, says so', () => {
    atStop(['equip', 'upgrade']);
    const stop = screen.getByTestId('stop');
    expect(stop).toHaveTextContent('Take one power-up');
    expect(screen.getByTestId('stop-equip')).toHaveTextContent('Equip');
    expect(screen.getByTestId('stop-equip')).toHaveTextContent('PriceFree');
    expect(screen.getByTestId('stop-upgrade')).toHaveTextContent('Upgrade');
    expect(screen.queryByTestId('stop-slot')).toBeNull();
    fireEvent.click(screen.getByTestId('stop-equip'));
    // In place of the cards, inside the stop: its own pad scope, with the pad's back button.
    const picker = screen.getByTestId('stop-picker');
    expect(stop).toContainElement(picker);
    expect(screen.queryByTestId('stop-upgrade')).toBeNull();
    expect(picker).toHaveAttribute('data-pad-scope');
    expect(back()).toHaveAttribute('data-pad-back');
    fireEvent.click(back());
    expect(screen.queryByTestId('stop-picker')).toBeNull();
    fireEvent.click(screen.getByTestId('stop-equip'));
    fireEvent.click(screen.getByTestId('stop-equip-item'));
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
    expect(screen.queryByTestId('stop-picker')).toBeNull();
    expect(screen.getByText('Equip: done')).toBeInTheDocument();
  });

  it('Back has the focus; Escape closes the picker, and the focus returns to its card', () => {
    atStop(['equip', 'upgrade']);
    fireEvent.click(screen.getByTestId('stop-upgrade'));
    const picker = screen.getByRole('group', { name: 'Upgrade' });
    expect(back()).toHaveFocus();
    fireEvent.keyDown(picker, { key: 'Escape' });
    expect(screen.queryByTestId('stop-picker')).toBeNull();
    expect(screen.getByTestId('stop-upgrade')).toHaveFocus();
  });

  it('after a take, the focus goes on to the first door, not the card that has gone', () => {
    atStop(['equip', 'upgrade']);
    fireEvent.click(screen.getByTestId('stop-equip'));
    fireEvent.click(screen.getByTestId('stop-equip-item'));
    expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
    expect(screen.getByTestId('door-first')).toHaveFocus();
  });

  it('a weapon to equip brings its own moves, which the picker says', () => {
    const sword = store().profile.equipped.weapon!;
    atStop(['equip'], { bag: [helm, { ...sword, uid: 'w2' }] });
    fireEvent.click(screen.getByTestId('stop-equip'));
    expect(screen.getByTestId('stop-equip-weapon-note')).toHaveTextContent(
      `A weapon brings its own moves; yours stay on ${sword.name}.`,
    );
  });

  it("adds a slot to a chain at its price; one it can't pay for is off", () => {
    atStop(['slot'], { links: 1, scrap: 20 });
    fireEvent.click(screen.getByTestId('stop-slot'));
    expect(screen.getByTestId('stop-slot-primary')).toHaveTextContent(
      'Primary 1/5 · + a slot · 1 Link · 20 scrap',
    );
    const basic = screen.getByTestId('stop-slot-basic');
    expect(basic).toBeDisabled(); // its 4th slot: 3 Links
    // It says why, in the engine's words.
    const why = document.getElementById(basic.getAttribute('aria-describedby')!);
    expect(why).toHaveTextContent('Not enough Links');
    expect(screen.getByTestId('stop-slot-primary')).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByTestId('stop-slot-defensive')).toBeNull(); // not carried
    fireEvent.click(screen.getByTestId('stop-slot-primary'));
    expect(chains().primary.moves).toHaveLength(2);
    expect(store().profile).toMatchObject({ links: 0, scrap: 0 });
  });

  it('adjusts one move: a later change replaces an earlier one, at its price', () => {
    const p = store().profile;
    // A two-slot Primary holding one move: a free builder would offer to add one.
    const sword = p.equipped.weapon!;
    const moveset = movesetOf(registry, sword);
    const weapon = { ...sword, moveset: { ...moveset, slots: { ...moveset.slots, primary: 2 } } };
    atStop(['move'], {
      manaDust: 20,
      stats: { ...p.stats, dives: 1 },
      equipped: { ...p.equipped, weapon },
    });
    fireEvent.click(screen.getByTestId('stop-move'));
    expect(screen.getByTestId('stop-move-take')).toBeDisabled();
    expect(screen.queryByTestId('move-add')).toBeNull();
    expect(screen.queryByTestId('attune-fire')).toBeNull(); // no attunement bars either
    // A blow of the basic chain, then the Primary's Bolt: only the Bolt's change is taken.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    fireEvent.click(screen.getByTestId('kind-heavy'));
    fireEvent.click(screen.getByTestId('chain-skill-primary'));
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Lance');
    expect(screen.getByTestId('stop-move-take')).toHaveTextContent(
      "Change Primary's move 1 · 5 Mana Dust",
    );
    fireEvent.click(screen.getByTestId('stop-move-take'));
    expect(chains().primary.moves[0].form).toBe('lance');
    expect(chains().basic[0].kind).toBe('light');
    expect(store().profile.manaDust).toBe(15);
    expect(store().profile.dive!.stop!.taken).toBe(true);
  });

  it("a move it can't pay for is off, and says why", () => {
    const p = store().profile;
    atStop(['move'], { manaDust: 4, stats: { ...p.stats, dives: 1 } });
    fireEvent.click(screen.getByTestId('stop-move'));
    fireEvent.click(screen.getByTestId('form-lance'));
    const take = screen.getByTestId('stop-move-take');
    expect(take).toBeDisabled();
    const why = document.getElementById(take.getAttribute('aria-describedby')!);
    expect(why).toHaveTextContent('Not enough Mana Dust');
  });

  it('an unaffordable upgrade is dimmed, and taking it says why, keeping the stop open', () => {
    const cost = upgradeCost(registry, helm)!;
    atStop(['upgrade'], { scrap: cost - 1 });
    fireEvent.click(screen.getByTestId('stop-upgrade'));
    const tile = screen.getByRole('button', {
      name: `Upgrade ${helm.name} for ${cost} scrap`,
    });
    expect(tile).toHaveStyle({ opacity: '0.35' });
    fireEvent.click(tile);
    expect(screen.getByTestId('stop-picker')).toHaveTextContent('Not enough scrap');
    expect(store().profile.dive!.stop!.taken).toBe(false);
  });

  it('upgrades an item, worn or in the bag, at its price', () => {
    const cost = upgradeCost(registry, helm)!;
    atStop(['upgrade'], { scrap: cost });
    fireEvent.click(screen.getByTestId('stop-upgrade'));
    const items = screen.getAllByTestId('stop-upgrade-item');
    expect(items.length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('button', { name: `Upgrade ${helm.name} for ${cost} scrap` }));
    expect(store().profile.bag[0].upgrade).toBe(1);
    expect(store().profile.scrap).toBe(0);
  });

  /** At a stop offering a rune: the sword's Bolt has one open, empty socket. */
  function atRuneStop() {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    const moveset = movesetOf(registry, sword);
    const primary = moveset.chains.primary!;
    const moves = [{ ...primary.moves[0], runes: [null] }];
    const weapon = {
      ...sword,
      moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } },
    };
    atStop(['rune'], {
      equipped: { ...p.equipped, weapon },
      runes: { split: [1, 0, 0, 0, 0], widen: [1, 0, 0, 0, 0] },
    });
    fireEvent.click(screen.getByTestId('stop-rune'));
    const move = screen.getByTestId('stop-rune-move-primary-0');
    expect(move).toHaveTextContent('Primary · light Fire Bolt');
    fireEvent.click(within(move).getByRole('button', { name: 'Socket 1: empty' }));
    return within(screen.getByTestId('rune-picker'));
  }

  it('sockets a fitting pouch rune into an empty socket, free, and the focus goes on to the doors', () => {
    const picker = atRuneStop();
    // Inline, inside the stop's picker: no sheet over the screen.
    expect(screen.getByTestId('stop-picker')).toContainElement(screen.getByTestId('rune-picker'));
    // Widen doesn't fit a Bolt.
    expect(picker.queryByRole('button', { name: /^Widen/ })).toBeNull();
    fireEvent.click(picker.getByRole('button', { name: 'Split I ×1' }));
    expect(chains().primary.moves[0].runes).toEqual([{ id: 'split', tier: 1 }]);
    expect(pouchCount(store().profile.runes, { id: 'split', tier: 1 })).toBe(0);
    expect(store().profile.dive!.stop!.taken).toBe(true);
    expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
    expect(screen.getByText('Socket a rune: done')).toBeInTheDocument();
    expect(screen.getByTestId('door-first')).toHaveFocus();
  });

  it("prices a rune in the saved chain's payment, eased by the move's attunement", () => {
    pricedRegistry();
    const picker = atRuneStop();
    // Split I's 0.27, eased 6% by the starting sword's and chest's 2 Fire.
    expect(picker.getByTestId('rune-pick-split')).toHaveTextContent('+25% cost');
  });

  it("Escape closes the rune picker, not the stop's", () => {
    atRuneStop();
    fireEvent.keyDown(screen.getByTestId('rune-picker'), { key: 'Escape' });
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(screen.getByTestId('stop-picker')).toBeInTheDocument();
    expect(store().profile.dive!.stop!.taken).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/StopPanel.test.tsx)`
Expected: FAIL, `6 failed | 6 passed (12)`: the first with `expect(element).toHaveTextContent()` (the old header reads "A power-up: take one, or skip it"); `Unable to find an accessible element with the role "group" and name "Upgrade"` (the old picker is a dialog); the slot and move prices (the old text has 🔗 and ✦); the rune pick's `toContainElement` (the old rune picker is a sheet in the UI layer); and `Unable to find an element by: [data-testid="stop-picker"]` in the Escape test.

- [ ] **Step 3: The panel**

Overwrite `packages/client/src/features/delve/StopPanel.tsx`:

```tsx
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  CHAIN_SKILLS,
  GEAR_SLOTS,
  carriedByText,
  compareItem,
  editPrice,
  heroChains,
  moveKey,
  movesOf,
  movesetOf,
  pairElements,
  profileStats,
  referenceDepth,
  resolveChain,
  runeTargetOf,
  slotPrice,
  socketCap,
  socketsOf,
  takeStop,
  upgradeCost,
  withMove,
  type AbilitySlot,
  type Blow,
  type ChainSkill,
  type DiveStop,
  type GearItem,
  type Move,
  type StopAction,
  type StopKind,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Glyph, Price, type GlyphId } from './kit';
import { getDelveRegistry } from './registry';
import { ItemTile } from './ItemTile';
import { SKILL_NAME, blowText, markIdle, moveText, runeCandidates } from './chains/chain-text';
import { ChainEditor } from './chains/ChainEditor';
import { RunePicker } from './runes/RunePicker';
import { SocketRow } from './runes/SocketRow';

/** Each power-up kind as its card says it: its glyph, its name, what it does and what it costs. */
export const STOP_TEXT: Record<
  StopKind,
  { glyph: GlyphId; name: string; text: string; price: string }
> = {
  equip: {
    glyph: 'up',
    name: 'Equip',
    text: 'Put on one item from your bag, as it is.',
    price: 'Free',
  },
  slot: {
    glyph: 'link',
    name: 'Add a slot',
    text: 'One more slot on a chain.',
    price: 'Links and scrap',
  },
  move: {
    glyph: 'dust',
    name: 'Adjust a move',
    text: 'Change one move of one chain.',
    price: 'Mana Dust',
  },
  upgrade: {
    glyph: 'anvil',
    name: 'Upgrade',
    text: 'One forge upgrade of an item.',
    price: 'Scrap',
  },
  rune: {
    glyph: 'rune',
    name: 'Socket a rune',
    text: 'One rune from your pouch into an open socket.',
    price: 'Free',
  },
};

/**
 * The stop's power-ups (see the weapon movesets spec): the kinds offered after the depth just
 * cleared, as plate cards. A card expands in place to its picker, its own pad scope with a Back;
 * taking one spends the stop (the engine's `takeStop`), and skipping it is choosing a door.
 */
export function StopPanel({ stop }: { stop: DiveStop }) {
  const [open, setOpen] = useState<StopKind | null>(null);
  const section = useRef<HTMLElement | null>(null);
  // Back (the stop not taken): the cards come back, and the focus goes to the one that opened it.
  const close = () => {
    const kind = open;
    flushSync(() => setOpen(null));
    section.current?.querySelector<HTMLElement>(`[data-testid="stop-${kind}"]`)?.focus();
  };
  // Taken, the cards go: the focus goes on to the next control after them (the first door).
  const taken = () => {
    setOpen(null);
    nextControl(section.current)?.focus();
  };
  if (stop.taken)
    return (
      <p className="k-body-2 m-0" data-testid="stop-taken">
        Power-up taken. On to the next depth.
      </p>
    );
  return (
    <section
      ref={section}
      aria-label="Power-up"
      className="flex min-h-0 flex-1 flex-col gap-4"
      data-testid="stop"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="k-section m-0 text-[26px] text-[var(--k-hot-hi)]">Take one power-up</h2>
        <span className="text-[15px] text-[var(--k-text-3)]">or skip it</span>
      </div>
      {open ? (
        <StopPicker kind={open} onClose={close} onTaken={taken} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-[18px]">
          {stop.offers.map((kind) => (
            <button
              key={kind}
              type="button"
              className="k-plate flex flex-col gap-[14px] p-6 text-left text-[var(--k-text)]"
              onClick={() => {
                playSound('buttonClick');
                setOpen(kind);
              }}
              data-testid={`stop-${kind}`}
            >
              <Glyph id={STOP_TEXT[kind].glyph} size={32} />
              <span className="k-disp text-[30px]">{STOP_TEXT[kind].name}</span>
              <span className="text-[15px] leading-normal text-[var(--k-text-2)]">
                {STOP_TEXT[kind].text}
              </span>
              <span className="mt-auto flex justify-between gap-2 bg-[var(--k-well)] px-[14px] py-3 text-[15px]">
                <span className="text-[var(--k-text-3)]">Price</span>
                <b className="text-[var(--k-hot-hi)]">{STOP_TEXT[kind].price}</b>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** The first enabled control after `el` in its pad scope (or the page), outside it. */
function nextControl(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  const within = el.closest('[data-pad-scope]') ?? document;
  return (
    [...within.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')].find(
      (c) => !el.contains(c) && el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING,
    ) ?? null
  );
}

/**
 * One kind's picker, in place of the cards: what to take, with its price. Its own pad scope:
 * Back has the focus and is the pad's back, and Escape closes it.
 */
function StopPicker({
  kind,
  onClose,
  onTaken,
}: {
  kind: StopKind;
  onClose: () => void;
  onTaken: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const take = (action: StopAction) => {
    const res = useDelveStore.getState().takeStop(action);
    if (res.ok) {
      playSound('upgradeTier');
      vibrate('success');
      showToast(`${STOP_TEXT[kind].name}: done`);
      onTaken();
    } else {
      playSound('combineFail');
      setMessage(res.reason ?? 'Cannot take it');
    }
  };
  return (
    <div
      role="group"
      aria-label={STOP_TEXT[kind].name}
      className="k-plate k-scroll flex min-h-0 flex-1 flex-col gap-4 p-6"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        onClose();
      }}
      data-testid="stop-picker"
      data-pad-scope
    >
      <div className="flex items-center justify-between">
        <span className="k-disp flex items-center gap-3 text-[30px]">
          <Glyph id={STOP_TEXT[kind].glyph} size={28} />
          {STOP_TEXT[kind].name}
        </span>
        <Button
          variant="quiet"
          size="sm"
          binding={{ key: 'Escape', pad: 'b' }}
          onClick={onClose}
          autoFocus
          data-pad-back
        >
          Back
        </Button>
      </div>
      {kind === 'equip' && <EquipPick take={take} />}
      {kind === 'slot' && <SlotPick take={take} />}
      {kind === 'move' && <MovePick take={take} />}
      {kind === 'upgrade' && <UpgradePick take={take} />}
      {kind === 'rune' && <RunePick take={take} />}
      {message && (
        <p className="m-0 text-[15px] text-[var(--k-bad-text)]" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

type Take = (action: StopAction) => void;

/** What the hero has to pay with. */
function Wallet() {
  const profile = useDelveStore((s) => s.profile);
  return (
    <div className="flex items-center gap-2 text-[14px] text-[var(--k-text-3)]">
      You have <Price links={profile.links} scrap={profile.scrap} dust={profile.manaDust} />
    </div>
  );
}

/** A bag item to put on as it is (a weapon brings its own moveset). */
function EquipPick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const depth = referenceDepth(profile);
  const worn = profile.equipped.weapon;
  const { bag, equipped, pair } = profile;
  const deltas = useMemo(
    () =>
      new Map(
        bag.map((i) => [i.uid, compareItem(equipped, i, registry, depth, pair, 'asIs').powerPct]),
      ),
    [registry, bag, equipped, pair, depth],
  );
  if (profile.bag.length === 0) return <p className="k-body-2 m-0">Your bag is empty.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {profile.bag.map((item) => (
          <ItemTile
            key={item.uid}
            item={item}
            size={64}
            delta={deltas.get(item.uid)}
            onClick={() => take({ kind: 'equip', uid: item.uid })}
            testId="stop-equip-item"
          />
        ))}
      </div>
      {worn && profile.bag.some((i) => i.slot === 'weapon') && (
        <p className="m-0 text-[14px] text-[var(--k-hot)]" data-testid="stop-equip-weapon-note">
          A weapon brings its own moves; yours stay on {worn.name}.
        </p>
      )}
    </div>
  );
}

/** A chain of the equipped weapon to grow by a slot, at its price; one it can't take says why. */
function SlotPick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const id = useId();
  const weapon = profile.equipped.weapon;
  if (!weapon) return null;
  const { slots } = movesetOf(registry, weapon);
  const cap = registry.getDelveBalance().chains.cap;
  return (
    <div className="flex flex-col gap-3">
      {CHAIN_SKILLS.filter((s) => slots[s] !== undefined).map((s) => {
        const price = slotPrice(registry, weapon, s);
        // The engine's own op as a dry run: whether it goes through, and why not.
        const dry = takeStop(registry, profile, { kind: 'slot', skill: s });
        const why = !price || dry.ok ? null : dry.reason;
        return (
          <div key={s} className="flex flex-col gap-1">
            <Button
              size="sm"
              className="justify-start"
              disabled={!dry.ok}
              onClick={() => take({ kind: 'slot', skill: s })}
              aria-describedby={why ? `${id}-${s}` : undefined}
              testId={`stop-slot-${s}`}
            >
              {SKILL_NAME[s]} {slots[s]}/{cap[s]}
              {price ? (
                <>
                  {' · + a slot · '}
                  <Price links={price.links} scrap={price.scrap} />
                </>
              ) : (
                ' · every slot'
              )}
            </Button>
            {why && (
              <span id={`${id}-${s}`} className="text-[14px] text-[var(--k-hot)]">
                {why}
              </span>
            )}
          </div>
        );
      })}
      <Wallet />
    </div>
  );
}

/** The chain builder, limited to one move: the latest change replaces any earlier one. */
function MovePick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const whyId = useId();
  const { equipped, pair } = profile;
  const weapon = equipped.weapon;
  const [edit, setEdit] = useState<{ skill: ChainSkill; index: number; move: Move | Blow } | null>(
    null,
  );
  const saved = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  const chains = useMemo(
    () =>
      edit
        ? { ...saved, [edit.skill]: withMove(saved[edit.skill]!, edit.index, edit.move) }
        : saved,
    [saved, edit],
  );
  const stats = useMemo(
    () =>
      profileStats(registry, {
        pair,
        equipped: weapon
          ? {
              ...equipped,
              weapon: { ...weapon, moveset: { ...movesetOf(registry, weapon), chains } },
            }
          : equipped,
      }),
    [registry, equipped, pair, weapon, chains],
  );
  if (!weapon) return null;
  const changed = !!edit && moveKey(edit.move) !== moveKey(movesOf(saved[edit.skill])[edit.index]);
  const price =
    edit && changed ? editPrice(registry, profile, { [edit.skill]: chains[edit.skill] }) : 0;
  // The engine's own op as a dry run: whether the change goes through, and why not.
  const dry = edit && changed ? takeStop(registry, profile, { kind: 'move', ...edit }) : null;
  const why = dry && !dry.ok ? dry.reason : null;
  const elements = pairElements(pair);
  return (
    <div className="flex flex-col gap-3">
      <ChainEditor
        chains={chains}
        caps={movesetOf(registry, weapon).slots}
        stats={stats}
        locked={false}
        fixedShape
        absentText={(s) => carriedByText(registry, s)}
        onChange={(skill, chain) => {
          const now = movesOf(chain);
          const shown = movesOf(chains[skill]);
          const index = now.findIndex((m, i) => !shown[i] || moveKey(m) !== moveKey(shown[i]));
          if (index >= 0) setEdit({ skill, index, move: now[index] });
        }}
        elements={elements.length > 0 ? elements : undefined}
      />
      <Button
        variant="primary"
        disabled={!dry?.ok}
        onClick={() => edit && take({ kind: 'move', ...edit })}
        aria-describedby={why ? whyId : undefined}
        testId="stop-move-take"
      >
        {changed ? (
          <>
            Change {SKILL_NAME[edit!.skill]}&apos;s move {edit!.index + 1}
            {price > 0 && (
              <>
                {' · '}
                <Price dust={price} />
              </>
            )}
          </>
        ) : (
          'Change one move'
        )}
      </Button>
      {why && (
        <span id={whyId} className="text-[14px] text-[var(--k-hot)]">
          {why}
        </span>
      )}
      <Wallet />
    </div>
  );
}

/** An item, worn or in the bag, to upgrade once at its price. */
function UpgradePick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const items = [...GEAR_SLOTS.map((s) => profile.equipped[s]), ...profile.bag].filter(
    (i): i is GearItem => !!i && upgradeCost(registry, i) !== null,
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {items.map((item) => {
          const cost = upgradeCost(registry, item)!;
          return (
            <div key={item.uid} className="flex flex-col items-center gap-1">
              <ItemTile
                item={item}
                size={64}
                dim={cost > profile.scrap}
                onClick={() => take({ kind: 'upgrade', uid: item.uid })}
                label={`Upgrade ${item.name} for ${cost} scrap`}
                testId="stop-upgrade-item"
              />
              <Price scrap={cost} />
            </div>
          );
        })}
      </div>
      <Wallet />
    </div>
  );
}

/**
 * Each move of the equipped weapon with an empty socket, with its sockets: tapping an empty one
 * opens the rune picker (the pouch's runes that fit the move and aren't on it), and a pick takes
 * the stop. A filled socket stays as it is: the stop never pulls.
 */
function RunePick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const { equipped, pair } = profile;
  const [at, setAt] = useState<{ skill: ChainSkill; index: number; socket: number } | null>(null);
  // The pick is taken once the picker has closed (and given the focus back to its socket), so
  // the take's own move of the focus, on to the first door, comes last.
  const [chosen, setChosen] = useState<StopAction | null>(null);
  useEffect(() => {
    if (!chosen) return;
    setChosen(null);
    take(chosen);
  }, [chosen, take]);
  const chains = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [registry, equipped, pair],
  );
  const weapon = equipped.weapon;
  if (!weapon) return null;
  const rows = CHAIN_SKILLS.flatMap((skill) => {
    const chain = chains[skill];
    if (!chain) return [];
    const resolved = Array.isArray(chain)
      ? null
      : resolveChain(registry, stats, skill as AbilitySlot, chain);
    const names = Array.isArray(chain)
      ? chain.map((b) => blowText(registry, b))
      : resolved!.moves.map(moveText);
    // An ability move's ease prices its runes (a blow has none).
    return movesOf(chain).flatMap((move, index) =>
      socketsOf(move).includes(null)
        ? [{ skill, index, move, name: names[index], ease: resolved?.moves[index].ease }]
        : [],
    );
  });
  const picked = at && rows.find((r) => r.skill === at.skill && r.index === at.index);
  // An ability move's saved chain: its payment words the runes' prices (a blow has none).
  const ability =
    at && picked && picked.skill !== 'basic'
      ? { slot: picked.skill, chain: chains[picked.skill]! }
      : null;
  return (
    <div className="flex flex-col gap-3">
      {rows.map(({ skill, index, move, name }) => (
        <div
          key={`${skill}-${index}`}
          role="group"
          aria-label={`${SKILL_NAME[skill]} · ${name}`}
          className="k-well flex items-center justify-between gap-2 p-3 text-[16px]"
          data-testid={`stop-rune-move-${skill}-${index}`}
        >
          <span>
            {SKILL_NAME[skill]} · {name}
          </span>
          <SocketRow
            runes={socketsOf(move)}
            cap={socketCap(registry, weapon.rarity)}
            nextPrice={null}
            emptyOnly
            onSocketTap={(socket) => setAt({ skill, index, socket })}
          />
        </div>
      ))}
      {at && picked && (
        <RunePicker
          variant="inline"
          candidates={markIdle(
            registry,
            stats,
            ability && { ...ability, index: at.index, socket: at.socket },
            runeCandidates(
              registry,
              runeTargetOf(weapon.baseId, picked.move),
              socketsOf(picked.move),
              profile.runes,
            ),
          )}
          on={runeTargetOf(weapon.baseId, picked.move)}
          payment={ability?.chain.payment}
          ease={picked.ease}
          onPick={(rune) => setChosen({ kind: 'rune', ...at, rune })}
          onClose={() => setAt(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/StopPanel.test.tsx)`
Expected: PASS (12 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N tests pass in F files (the panel's twelve tests replace its twelve).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3e
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/StopPanel.tsx src/features/delve/__tests__/StopPanel.test.tsx)
git add packages/client/src/features/delve/StopPanel.tsx packages/client/src/features/delve/__tests__/StopPanel.test.tsx
git commit -m "feat(client): the stop's power-ups as kit cards that expand in place to their pickers" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The stop screen and its wiring

### Task 2: `StopScreen` and `DoorPane`

The full stop: the header, "Found this floor" from the floor's indexes (`loot-item`, `loot-runes`, `loot-rune`), `StopPanel` in the centre, the doors with art on the right, and the footer's prompts. The pad's Y is checked through the prompt runtime's own `padPrompts`; the keys through a window `keydown` with every element given a box (jsdom lays nothing out), as `AnvilHub.test` does.

**Files:**
- Create: `packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx`
- Create: `packages/client/src/features/delve/stop/DoorPane.tsx`
- Create: `packages/client/src/features/delve/stop/StopScreen.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { generateItem, isBossDepth, SeededRNG, type DiveState, type StopKind } from '@alloy/engine';
import { StopScreen } from '../StopScreen';
import { padPrompts } from '../../kit/prompts';
import type { PadButton } from '@/features/gamepad/gamepad';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const item = (uid: string, slot: 'helm' | 'weapon' | 'ring', seed: number) =>
  generateItem(registry, { uid, ilvl: 3, rarity: 'rare', slot, mana: 'fire' }, new SeededRNG(seed));

/** A key press as the window hears it, with every element given a box (jsdom lays nothing out). */
const press = (code: string) => {
  const box = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
  try {
    fireEvent.keyDown(document.body, { code });
  } finally {
    box.mockRestore();
  }
};

/**
 * Depth 1 cleared, at a stop offering `offers`: the bag holds a helm, a weapon and a ring, and
 * the floor found the helm and the weapon (the ring was an earlier floor's), Split III twice and
 * Quick I (Widen was an earlier floor's).
 */
function atStop(offers: StopKind[] | null, over: Partial<DiveState> = {}) {
  store().setProfile({
    ...store().profile,
    bag: [item('h1', 'helm', 4), item('w1', 'weapon', 5), item('r1', 'ring', 6)],
  });
  store().startDive(1);
  const dive = store().profile.dive!;
  store().setProfile({
    ...store().profile,
    dive: {
      ...dive,
      phase: 'choosing',
      bounty: 26,
      doorChoices: ['winding', 'gilded'],
      stop: offers ? { offers, taken: false } : null,
      ...over,
    },
  });
  useDelveStore.setState({
    diveDrops: ['w1', 'h1', 'r1'],
    floorDropsFrom: 1,
    diveRunes: [
      { id: 'quick', tier: 1 },
      { id: 'split', tier: 3 },
      { id: 'split', tier: 3 },
      { id: 'widen', tier: 1 },
    ],
    floorRunesFrom: 1,
  });
  const props = {
    onChoose: vi.fn(),
    onExtract: vi.fn(),
    onPotion: vi.fn(),
    onMenu: vi.fn(),
    onInspect: vi.fn(),
  };
  const Stop = () => {
    const d = useDelveStore((s) => s.profile.dive!);
    return <StopScreen dive={d} {...props} />;
  };
  render(<Stop />);
  return props;
}

describe('StopScreen (between depths)', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it("is a kit screen over the arena: the depth cleared, its biome, the bounty and the floor's finds", () => {
    atStop(['equip']);
    const root = screen.getByTestId('door-choice');
    expect(root).toHaveClass('delve-ui', 'delve-zoom', 'k-screen-arena-stop');
    expect(root).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Depth 1 cleared');
    expect(root).toHaveTextContent(registry.getBiomeForDepth(1).name);
    expect(screen.getByTestId('floor-counts')).toHaveTextContent('26 scrap bounty2 items3 runes');
    expect(screen.queryByTestId('boss-slain')).toBeNull();
  });

  it('on a boss floor, says the boss is slain and where the checkpoint is', () => {
    let depth = 1;
    while (!isBossDepth(registry, depth)) depth++;
    atStop(['equip'], { depth });
    expect(screen.getByTestId('boss-slain')).toHaveTextContent(
      `Boss slain · checkpoint at depth ${depth + 1}`,
    );
  });

  it("lists this floor's items with their marks and its runes grouped, banked on leaving", () => {
    const { onInspect } = atStop(['equip']);
    const found = screen.getByTestId('floor-finds');
    const items = within(found).getAllByTestId('loot-item');
    // Newest first; the ring was an earlier floor's.
    expect(items.map((b) => b.dataset.uid)).toEqual(['w1', 'h1']);
    expect(items[1]).toHaveTextContent(item('h1', 'helm', 4).name);
    expect(items[1]).toHaveTextContent('▲'); // the helm slot is empty
    const runes = within(within(found).getByTestId('loot-runes')).getAllByTestId('loot-rune');
    expect(runes.map((r) => r.textContent)).toEqual([
      'Quick IRune, to your pouch',
      'Split III ×2Rune, to your pouch',
    ]);
    expect(found).toHaveTextContent('Banked when you leave this stop.');
    fireEvent.click(items[1]);
    expect(onInspect).toHaveBeenCalledWith('h1');
  });

  it('shows the doors with their art and depth, Extract with the hero, and the potion', () => {
    const { onChoose, onExtract, onPotion } = atStop(['equip'], { heroHpFrac: 0.5, potions: 2 });
    const dive = store().profile.dive!;
    const first = dive.doorChoices[0];
    const door = screen.getByTestId(`door-${first}`);
    expect(door).toHaveTextContent(registry.getDoor(first).name);
    expect(door).toHaveAttribute('data-pad-first');
    expect(door.querySelector('[data-sprite], [data-glyph="chest"]')).not.toBeNull();
    fireEvent.click(door);
    expect(onChoose).toHaveBeenCalledWith(first);
    const extract = screen.getByTestId('extract-button');
    expect(extract).toHaveTextContent('Leave with 26 scrap');
    expect(extract.querySelector('[data-sprite="hero"]')).not.toBeNull();
    fireEvent.click(extract);
    expect(onExtract).toHaveBeenCalledOnce();
    expect(screen.getByTestId('door-choice')).toHaveTextContent('Life 50% · 2 potions');
    fireEvent.click(screen.getByTestId('door-potion'));
    expect(onPotion).toHaveBeenCalledOnce();
  });

  it('has no back at its top level: Esc presses its Menu, which opens the pause', () => {
    const { onMenu } = atStop(['equip']);
    const root = screen.getByTestId('door-choice');
    expect(root.querySelector('[data-pad-back]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('data-pad-menu');
    press('Escape');
    expect(onMenu).toHaveBeenCalledOnce();
  });

  it("with a card's picker open, Esc presses the picker's Back, not the Menu", () => {
    const { onMenu } = atStop(['equip', 'upgrade']);
    fireEvent.click(screen.getByTestId('stop-equip'));
    expect(screen.getByTestId('stop-picker')).toBeInTheDocument();
    press('Escape');
    expect(screen.queryByTestId('stop-picker')).toBeNull();
    expect(onMenu).not.toHaveBeenCalled();
  });

  it('S skips the power-up: the cards go and the focus moves to the first door', () => {
    atStop(['equip', 'upgrade']);
    expect(screen.getByTestId('door-choice')).toHaveTextContent('Skip power-up');
    press('KeyS');
    expect(screen.queryByTestId('stop')).toBeNull();
    expect(screen.getByTestId('stop-skipped')).toHaveTextContent('Power-up skipped');
    const first = store().profile.dive!.doorChoices[0];
    expect(screen.getByTestId(`door-${first}`)).toHaveFocus();
  });

  it('with no power-up to offer, says so', () => {
    atStop(null);
    expect(screen.queryByTestId('stop')).toBeNull();
    expect(screen.getByTestId('door-choice')).toHaveTextContent('No power-up at this stop.');
  });

  it('Y (Inspect item) opens the focused find', () => {
    const { onInspect } = atStop(['equip']);
    expect(screen.getByTestId('door-choice')).toHaveTextContent('Inspect item');
    within(screen.getByTestId('floor-finds')).getAllByTestId('loot-item')[1].focus();
    const box = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
    try {
      padPrompts(new Set<PadButton>(['y']), {} as Record<PadButton, boolean>, 0);
    } finally {
      box.mockRestore();
    }
    expect(onInspect).toHaveBeenCalledWith('h1');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/stop)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../StopScreen" from "src/features/delve/stop/__tests__/StopScreen.test.tsx". Does the file exist?`

- [ ] **Step 3: The doors and the screen**

Create `packages/client/src/features/delve/stop/DoorPane.tsx`:

```tsx
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { RARITY_ORDER, isBossDepth, type DiveState } from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Glyph, PixelSprite } from '../kit';
import { getDelveRegistry } from '../registry';
import { formatNumber } from '../format';

/** The 84×96 doorway each choice's art stands in. */
function Doorway({ fill, children }: { fill: string; children: ReactNode }): ReactElement {
  const frame: CSSProperties = {
    background: fill,
    border: '4px solid var(--k-steel-2)',
    borderBottom: 0,
    boxShadow: 'inset 0 0 0 3px var(--k-well), 0 -4px 0 var(--k-steel-1)',
  };
  return (
    <span
      className="flex h-24 w-[84px] flex-none items-end justify-center overflow-hidden"
      style={frame}
    >
      {children}
    </span>
  );
}

function DoorButton({
  art,
  title,
  body,
  aside,
  first,
  onClick,
  testId,
}: {
  art: ReactNode;
  title: ReactNode;
  body: ReactNode;
  aside?: ReactNode;
  first?: boolean;
  onClick: () => void;
  testId: string;
}): ReactElement {
  return (
    <button
      type="button"
      className="k-plate flex flex-none items-center gap-4 p-5 text-left text-[var(--k-text)]"
      onClick={onClick}
      data-door
      data-pad-first={first || undefined}
      data-testid={testId}
    >
      {art}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="k-disp text-[22px]">{title}</span>
        <span className="text-[14px] text-[var(--k-text-3)]">{body}</span>
      </span>
      {aside}
    </button>
  );
}

/**
 * "Choose your path": each door as a plate with its art in a doorway (the next depth's first
 * monster, or the chest for a door that raises Magic Find), its depth and a boss mark; Extract,
 * with the hero leaving; then the hero's life and potions, and a potion to drink.
 */
export function DoorPane({
  dive,
  onChoose,
  onExtract,
  onPotion,
}: {
  dive: DiveState;
  onChoose: (doorId: string) => void;
  onExtract: () => void;
  onPotion: () => void;
}): ReactElement {
  const registry = getDelveRegistry();
  const finds = RARITY_ORDER.reduce((n, r) => n + dive.found[r], 0);
  return (
    <section aria-label="Doors" className="flex min-h-0 flex-col gap-4">
      <h2 className="k-section m-0 text-[26px]">Choose your path</h2>
      <div className="k-scroll flex min-h-0 flex-col gap-4">
        {dive.doorChoices.map((id, i) => {
          const door = registry.getDoor(id);
          const next = dive.depth + 1 + (door.mods.skip ?? 0);
          const monster = registry.getBiomeForDepth(next).monsters[0];
          const treasure = (door.mods.magicFind ?? 0) > 0;
          return (
            <DoorButton
              key={id}
              first={i === 0}
              testId={`door-${id}`}
              art={
                <Doorway fill={treasure ? 'var(--k-wood-0)' : 'var(--k-mana-2)'}>
                  {treasure ? (
                    <span className="pb-[6px]">
                      <Glyph id="chest" size={60} />
                    </span>
                  ) : (
                    <PixelSprite id={monster.id} scale={4} context="ui" label={monster.name} />
                  )}
                </Doorway>
              }
              title={door.name}
              body={door.text}
              aside={
                <span className="flex flex-none flex-col items-end gap-1 text-[14px]">
                  <span className="k-disp text-[18px] text-[var(--k-text-2)]">Depth {next}</span>
                  {isBossDepth(registry, next) && (
                    <span className="flex items-center gap-1 text-[var(--k-bad-text)]">
                      <Glyph id="skull" size={14} /> Boss
                    </span>
                  )}
                </span>
              }
              onClick={() => {
                playSound('phaseTransition');
                vibrate('medium');
                onChoose(id);
              }}
            />
          );
        })}
      </div>
      <DoorButton
        testId="extract-button"
        art={
          <Doorway fill="var(--k-steel)">
            <PixelSprite id="hero" scale={4} context="ui" label="Your hero leaving" />
          </Doorway>
        }
        title="Extract"
        body={`Leave with ${formatNumber(dive.bounty)} scrap and ${finds} finds.`}
        onClick={() => {
          playSound('victory');
          vibrate('success');
          onExtract();
        }}
      />
      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="text-[16px] text-[var(--k-text-2)]">
          Life {Math.round(dive.heroHpFrac * 100)}% · {dive.potions} potion
          {dive.potions === 1 ? '' : 's'}
        </span>
        <Button
          size="sm"
          onClick={onPotion}
          disabled={dive.potions <= 0 || dive.heroHpFrac >= 1}
          testId="door-potion"
        >
          <Glyph id="potion" size={18} /> Drink potion
        </Button>
      </div>
    </section>
  );
}
```

Create `packages/client/src/features/delve/stop/StopScreen.tsx`:

```tsx
import { useMemo, useRef, useState, type ReactElement } from 'react';
import {
  baseDisplayName,
  compareItem,
  findItem,
  isBossDepth,
  referenceDepth,
  type DiveState,
  type GearItem,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Button, Footer, Glyph, Panel, Screen, usePrompts, type Prompt } from '../kit';
import { getDelveRegistry } from '../registry';
import { ItemIcon } from '../ItemIcon';
import { deltaMark } from '../ItemTile';
import { ItemTooltip } from '../items/ItemTooltip';
import { RARITY_COLOR, RARITY_LABEL, RARITY_TEXT, formatNumber } from '../format';
import { countRunes } from '../chains/chain-text';
import { FAMILY_STYLE, runeName } from '../runes/rune-style';
import { StopPanel } from '../StopPanel';
import { DoorPane } from './DoorPane';

const MARK = {
  up: { text: '▲', color: 'var(--k-ok)', label: 'upgrade' },
  down: { text: '▼', color: 'var(--k-bad)', label: 'downgrade' },
  potential: { text: '◇', color: 'var(--k-mana)', label: 'potential upgrade' },
} as const;

const ROW = 'flex w-full flex-none items-center gap-3 bg-[var(--k-well)] px-3 py-[10px] text-left';

export interface StopScreenProps {
  dive: DiveState;
  onChoose: (doorId: string) => void;
  onExtract: () => void;
  onPotion: () => void;
  /** The footer's Menu (Esc, the pad's Menu): the pause, over the stop. */
  onMenu: () => void;
  /** A find clicked, or Y on a focused one: the pause's Loadout, on that item. */
  onInspect: (uid: string) => void;
}

/**
 * The stop between depths, over the dimmed arena: "Depth N cleared" with the bounty and the
 * floor's finds; this floor's items and runes on the left; the power-up cards in the centre,
 * each expanding in place to its picker; the doors on the right. At its top level there is no
 * back: Esc and the pad's Menu press its Menu, which opens the pause over it.
 */
export function StopScreen({
  dive,
  onChoose,
  onExtract,
  onPotion,
  onMenu,
  onInspect,
}: StopScreenProps): ReactElement {
  const registry = getDelveRegistry();
  const biome = registry.getBiomeForDepth(dive.depth);
  const { items, runes } = useFloorFinds();
  const [skipped, setSkipped] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const stop = dive.stop;
  const offering = !!stop && !stop.taken && !skipped;
  const runeCount = runes.reduce((n, r) => n + r.count, 0);

  const prompts: Prompt[] = [
    { id: 'take', label: 'Take', binding: { mouse: 'click', pad: 'a' } },
    {
      id: 'inspect',
      label: 'Inspect item',
      binding: { mouse: 'hover', pad: 'y' },
      onPress: () => {
        const uid = (document.activeElement as HTMLElement | null)?.dataset.uid;
        if (uid) onInspect(uid);
      },
    },
    {
      id: 'skip',
      label: 'Skip power-up',
      binding: { key: 'KeyS', pad: 'x' },
      onPress: () => {
        setSkipped(true);
        mainRef.current?.querySelector<HTMLElement>('[data-door]')?.focus();
      },
      disabled: !offering,
    },
  ];
  usePrompts(prompts, mainRef);

  return (
    <Screen
      backdrop="arena-stop"
      headerStyle="bare"
      testId="door-choice"
      header={null}
      footer={
        <Footer prompts={prompts}>
          <Button
            variant="quiet"
            size="sm"
            binding={{ key: 'Escape', pad: 'menu' }}
            onClick={onMenu}
            tabIndex={-1}
            data-pad-menu
            data-pad-skip
          >
            Menu
          </Button>
        </Footer>
      }
    >
      <div ref={mainRef} className="box-border flex h-full flex-col gap-8 px-[72px]">
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-[6px]">
            <span className="k-label" style={{ color: 'var(--k-mana)' }}>
              {biome.name}
            </span>
            <h1 className="k-display m-0">Depth {dive.depth} cleared</h1>
            {isBossDepth(registry, dive.depth) && (
              <span className="k-section text-[var(--k-hot-hi)]" data-testid="boss-slain">
                Boss slain · checkpoint at depth {dive.depth + 1}
              </span>
            )}
          </div>
          <div className="flex gap-9 text-[16px] text-[var(--k-text-3)]" data-testid="floor-counts">
            <span>
              <b className="k-disp text-[30px] text-[var(--k-hot-hi)]">
                {formatNumber(dive.bounty)}
              </b>{' '}
              scrap bounty
            </span>
            <span>
              <b className="k-disp text-[30px] text-[var(--k-text)]">{items.length}</b>{' '}
              {items.length === 1 ? 'item' : 'items'}
            </span>
            <span>
              <b className="k-disp text-[30px] text-[var(--k-mana)]">{runeCount}</b>{' '}
              {runeCount === 1 ? 'rune' : 'runes'}
            </span>
          </div>
        </div>
        <div
          className="grid min-h-0 flex-1 gap-7 pb-7"
          style={{ gridTemplateColumns: '380px minmax(0,1fr) 420px' }}
        >
          <Panel title="Found this floor" testId="floor-finds">
            {items.length === 0 && runes.length === 0 && (
              <span className="k-caption">Nothing found on this floor.</span>
            )}
            {items.map(({ item, delta, asIs }) => {
              const mark = deltaMark(delta, asIs);
              return (
                <ItemTooltip key={item.uid} uid={item.uid} placement="right">
                  <button
                    type="button"
                    className={ROW}
                    aria-label={mark ? `${item.name}, ${MARK[mark].label}` : item.name}
                    onClick={() => onInspect(item.uid)}
                    data-uid={item.uid}
                    data-testid="loot-item"
                  >
                    <span
                      className="size-9 flex-none border-2 p-[2px]"
                      style={{ borderColor: RARITY_COLOR[item.rarity] }}
                    >
                      <ItemIcon baseId={item.baseId} rarity={item.rarity} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate" style={{ color: RARITY_TEXT[item.rarity] }}>
                        {item.name}
                      </span>
                      <span className="k-caption">
                        {RARITY_LABEL[item.rarity]} {baseDisplayName(registry, item)}
                      </span>
                    </span>
                    {mark && (
                      <span className="ml-auto" style={{ color: MARK[mark].color }}>
                        {MARK[mark].text}
                      </span>
                    )}
                  </button>
                </ItemTooltip>
              );
            })}
            {runes.length > 0 && (
              <div className="flex flex-col gap-4" data-testid="loot-runes">
                {runes.map(({ rune, count }) => {
                  const color = FAMILY_STYLE[registry.getRune(rune.id).family].color;
                  return (
                    <div key={`${rune.id}-${rune.tier}`} className={ROW} data-testid="loot-rune">
                      <span
                        className="flex size-9 flex-none items-center justify-center border-2"
                        style={{ borderColor: color }}
                      >
                        <Glyph id="rune" size={20} color={color} />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span>
                          {runeName(registry, rune)}
                          {count > 1 && ` ×${count}`}
                        </span>
                        <span className="k-caption">Rune, to your pouch</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <span className="k-caption mt-auto">Banked when you leave this stop.</span>
          </Panel>
          <div className="flex min-w-0 flex-col">
            {!stop ? (
              <p className="k-body-2 m-0">No power-up at this stop.</p>
            ) : skipped && !stop.taken ? (
              <p className="k-body-2 m-0" data-testid="stop-skipped">
                Power-up skipped. On to the next depth.
              </p>
            ) : (
              <StopPanel stop={stop} />
            )}
          </div>
          <DoorPane dive={dive} onChoose={onChoose} onExtract={onExtract} onPotion={onPotion} />
        </div>
      </div>
    </Screen>
  );
}

/**
 * This floor's finds (decided item 21): the items since `floorDropsFrom`, newest first, each with
 * its Power change as a home for your moveset (`delta`) and as it is (`asIs`), and the runes since
 * `floorRunesFrom`, grouped.
 */
function useFloorFinds() {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const diveDrops = useDelveStore((s) => s.diveDrops);
  const diveRunes = useDelveStore((s) => s.diveRunes);
  const dropsFrom = useDelveStore((s) => s.floorDropsFrom);
  const runesFrom = useDelveStore((s) => s.floorRunesFrom);
  const depth = referenceDepth(profile);
  const items = useMemo(() => {
    const out: { item: GearItem; delta: number | null; asIs: number | null }[] = [];
    for (const uid of diveDrops.slice(0, diveDrops.length - dropsFrom)) {
      const found = findItem(profile, uid);
      if (!found) continue;
      const { item } = found;
      const equipped = found.where === 'equipped';
      const value = (as: 'home' | 'asIs') =>
        compareItem(profile.equipped, item, registry, depth, profile.pair, as).powerPct;
      const delta = equipped ? null : value('home');
      // Only a weapon carries a moveset: anything else is the same either way.
      const asIs = equipped || item.slot !== 'weapon' ? delta : value('asIs');
      out.push({ item, delta, asIs });
    }
    return out;
  }, [diveDrops, dropsFrom, profile, registry, depth]);
  const runes = countRunes(diveRunes.slice(0, diveRunes.length - runesFrom));
  return { items, runes };
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/stop)`
Expected: PASS (9 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 9 tests pass in F + 1 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3e
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/stop)
git add packages/client/src/features/delve/stop/StopScreen.tsx packages/client/src/features/delve/stop/DoorPane.tsx packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx
git commit -m "feat(client): the stop screen: found this floor, the power-ups, the doors with art, Esc to the menu" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: `DelveRun` renders the stop; `DoorChoice` and `LootTray` go

The stop replaces the `choosing` overlay, at `z-40` over the HUD grid. Until Task 5 its Menu opens today's kebab menu and a find opens `ItemDetailSheet`, both drawn after it. LootTray's test goes with it (its rows are `StopScreen.test`'s now).

**Files:**
- Modify: `packages/client/src/pages/__tests__/DelveRun.test.tsx`
- Modify: `packages/client/src/pages/DelveRun.tsx` (CRLF: Edit tool only)
- Modify: `packages/client/src/features/delve/delve.css`
- Delete: `packages/client/src/features/delve/DoorChoice.tsx`, `packages/client/src/features/delve/LootTray.tsx`, `packages/client/src/features/delve/__tests__/LootTray.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/pages/__tests__/DelveRun.test.tsx`:

Replace: `import { fireEvent, render, screen } from '@testing-library/react';` with: `import { fireEvent, render, screen, within } from '@testing-library/react';`

Replace:

```tsx
    expect(screen.getByTestId('attack-mode-toggle')).toBeInTheDocument();
  });
});
```

with:

```tsx
    expect(screen.getByTestId('attack-mode-toggle')).toBeInTheDocument();
  });

  it('at the stop, the stop screen covers the arena and its Menu opens the dive menu over it', () => {
    const { profile } = useDelveStore.getState();
    useDelveStore.setState({
      profile: {
        ...profile,
        dive: {
          ...profile.dive!,
          phase: 'choosing',
          doorChoices: ['winding'],
          stop: { offers: ['equip'], taken: false },
        },
      },
    });
    render(
      <MemoryRouter>
        <DelveRun />
      </MemoryRouter>,
    );
    const stop = screen.getByTestId('door-choice');
    expect(screen.getByTestId('door-winding')).toBeInTheDocument();
    expect(screen.queryByTestId('skill-bar')).toBeNull();
    fireEvent.click(within(stop).getByRole('button', { name: 'Menu' }));
    const menu = screen.getByTestId('attack-mode-toggle');
    expect(stop.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx)`
Expected: FAIL, `1 failed | 2 passed (3)`: `Unable to find an accessible element with the role "button" and name "Menu"` (the old door overlay has no Menu).

- [ ] **Step 3: The wiring, and the deletions**

In `packages/client/src/pages/DelveRun.tsx`:

Delete the line: `import { DoorChoice } from '@/features/delve/DoorChoice';`

Delete the line: `import { LootTray } from '@/features/delve/LootTray';`

Replace: `import { useArena, type ArenaUiEvent } from '@/features/delve/arena/useArena';` with:

```tsx
import { StopScreen } from '@/features/delve/stop/StopScreen';
import { useArena, type ArenaUiEvent } from '@/features/delve/arena/useArena';
```

Delete the lines from `      {choosing && (` up to (not including) `      {finished && (`. That removes the old overlay (`DoorChoice`, its potion row and `LootTray`) and the blank line after it.

Replace: `      {menuOpen && (` with:

```tsx
      {choosing && (
        <div className="absolute inset-0 z-40">
          <StopScreen
            dive={dive}
            onChoose={onChooseDoor}
            onExtract={onExtract}
            onPotion={onDoorPotion}
            onMenu={() => setMenuOpen(true)}
            onInspect={openItem}
          />
        </div>
      )}

      {menuOpen && (
```

(The stop now comes before the kebab menu, `ControlsPanel` and `ItemDetailSheet`, so until Task 5 they draw over it and are the topmost pad scope.)

In `packages/client/src/features/delve/delve.css`:

Delete the lines from `.delve-column {` up to (not including) `.delve-display {`.

Delete the lines from `.delve-door {` up to (not including) `.delve-embers {`.

Then delete the three files:

```bash
cd /c/Projects/alloy-ui-3e
git rm -q packages/client/src/features/delve/DoorChoice.tsx packages/client/src/features/delve/LootTray.tsx packages/client/src/features/delve/__tests__/LootTray.test.tsx
grep -rn "DoorChoice\|LootTray\|delve-column\|delve-door" packages/client/src || echo "no users left"
```

Expected: `no users left`.

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx)`
Expected: PASS (3 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 4 tests pass in F files (LootTray's six tests and file gone, one `DelveRun` test added).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3e
(cd packages/client && npx prettier --write --end-of-line auto src/pages/DelveRun.tsx src/pages/__tests__/DelveRun.test.tsx src/features/delve/delve.css)
git add packages/client/src/pages/DelveRun.tsx packages/client/src/pages/__tests__/DelveRun.test.tsx packages/client/src/features/delve/delve.css
git commit -m "feat(client): the dive draws the stop screen between depths; DoorChoice and LootTray go" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(The `git rm` in Step 3 already staged the three deletions.)

## Chunk 3: The summary and the fanfare

### Task 4: `DiveSummary` and `LegendaryFanfare` in the kit

Same content and ids; kit roots (`.delve-ui.delve-zoom`), stepped glows, kit type and Buttons, and glyphs for ⚙ ✦ 🔗 ◈.

**Files:**
- Overwrite: `packages/client/src/features/delve/__tests__/DiveSummary.test.tsx`
- Create: `packages/client/src/features/delve/__tests__/LegendaryFanfare.test.tsx`
- Overwrite: `packages/client/src/features/delve/DiveSummary.tsx`
- Overwrite: `packages/client/src/features/delve/LegendaryFanfare.tsx`

- [ ] **Step 1: The failing tests**

Overwrite `packages/client/src/features/delve/__tests__/DiveSummary.test.tsx`:

```tsx
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createDelveProfile, startDive } from '@alloy/engine';
import { DiveSummary } from '../DiveSummary';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

beforeAll(() => {
  // jsdom has no Web Animations; the title's entrance is cosmetic.
  if (!Element.prototype.animate)
    Element.prototype.animate = function () {
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
});

function summary(
  dustEarned: number,
  linksEarned = 0,
  runesEarned = 0,
  phase: 'extracted' | 'dead' = 'extracted',
) {
  const registry = getDelveRegistry();
  const dive = startDive(registry, createDelveProfile(registry, 1, { primary: 'fire' }), 1).dive!;
  const props = { onCamp: vi.fn(), onAgain: vi.fn() };
  render(
    <DiveSummary
      dive={{ ...dive, phase, bounty: 40, dustEarned, linksEarned, runesEarned }}
      biomeName="Test"
      againLabel="Again"
      {...props}
    />,
  );
  return props;
}

describe('DiveSummary', () => {
  it('is a kit screen: the outcome, the bounty with its glyph, and the two ways on', () => {
    const { onCamp, onAgain } = summary(3, 1);
    const root = screen.getByTestId('dive-summary');
    expect(root).toHaveClass('delve-ui', 'delve-zoom');
    expect(root).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('EXTRACTED');
    expect(root).toHaveTextContent('Bounty claimed: 40 scrap');
    expect(root.querySelector('[data-glyph="scrap"]')).not.toBeNull();
    // Glyphs, not emoji.
    expect(root.textContent).not.toMatch(/[⚙✦◈]|🔗/u);
    fireEvent.click(screen.getByTestId('return-camp'));
    expect(onCamp).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('dive-again'));
    expect(onAgain).toHaveBeenCalledOnce();
  });

  it('a fall loses the bounty', () => {
    summary(0, 0, 0, 'dead');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('YOU FELL');
    expect(screen.getByTestId('dive-summary')).toHaveTextContent('Bounty lost: 40 scrap');
  });

  it('shows the Mana Dust salvage gave this dive', () => {
    summary(7);
    expect(screen.getByTestId('dive-dust')).toHaveTextContent('7 Mana Dust from salvage');
  });

  it('says nothing about Mana Dust or Links when there were none', () => {
    summary(0);
    expect(screen.queryByTestId('dive-dust')).toBeNull();
    expect(screen.queryByTestId('dive-links')).toBeNull();
  });

  it('shows the Links salvaged weapons gave this dive', () => {
    summary(0, 2);
    expect(screen.getByTestId('dive-links')).toHaveTextContent('2 Links from salvaged weapons');
    expect(screen.queryByTestId('dive-runes')).toBeNull();
  });

  it('counts the runes found this dive, and names them', () => {
    useDelveStore.getState().pushDiveRunes([
      { id: 'split', tier: 3 },
      { id: 'quick', tier: 1 },
    ]);
    summary(0, 0, 2);
    expect(screen.getByTestId('dive-runes')).toHaveTextContent('2 runes found: Quick I, Split III');
  });
});
```

Create `packages/client/src/features/delve/__tests__/LegendaryFanfare.test.tsx`:

```tsx
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { generateItem, SeededRNG } from '@alloy/engine';
import { LegendaryFanfare } from '../LegendaryFanfare';
import { getDelveRegistry } from '../registry';

beforeAll(() => {
  // jsdom has no Web Animations; the entrance is cosmetic.
  if (!Element.prototype.animate)
    Element.prototype.animate = function () {
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
});

describe('LegendaryFanfare', () => {
  it('celebrates the legendary in the kit, and a click goes on', () => {
    const item = generateItem(
      getDelveRegistry(),
      { uid: 'l1', ilvl: 10, rarity: 'legendary', slot: 'weapon', mana: 'fire' },
      new SeededRNG(1),
    );
    const onDone = vi.fn();
    render(<LegendaryFanfare item={item} firstTime onDone={onDone} />);
    const root = screen.getByTestId('legendary-fanfare');
    expect(root).toHaveClass('delve-ui', 'delve-zoom');
    expect(screen.getByTestId('fanfare-name')).toHaveTextContent(item.name);
    expect(root).toHaveTextContent('New codex entry!');
    fireEvent.click(root);
    expect(onDone).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/DiveSummary.test.tsx src/features/delve/__tests__/LegendaryFanfare.test.tsx)`
Expected: FAIL, `3 failed | 4 passed (7)`: both kit-root checks with `expect(element).toHaveClass("delve-ui delve-zoom")`, and the fall with `Unable to find an accessible element with the role "heading"`.

- [ ] **Step 3: The two screens**

Overwrite `packages/client/src/features/delve/DiveSummary.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import type { DiveState } from '@alloy/engine';
import { RARITY_ORDER } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Button, Glyph, Price } from './kit';
import { ItemTile } from './ItemTile';
import { RARITY_LABEL, RARITY_TEXT, formatNumber } from './format';
import { countRunes } from './chains/chain-text';
import { getDelveRegistry } from './registry';
import { runeName } from './runes/rune-style';

interface DiveSummaryProps {
  dive: DiveState;
  biomeName: string;
  onCamp: () => void;
  onAgain: () => void;
  againLabel: string;
}

/** A stepped glow behind the title: red for a fall, forge orange for an extract. */
const glow = (rgb: string) =>
  `radial-gradient(ellipse at 50% 35%, rgba(${rgb},0.22) 0 30%, rgba(${rgb},0.1) 30% 48%, transparent 48%), rgba(6,6,11,0.94)`;

/**
 * The dive's end, extracted or fallen: the depth and biome, what it cleared, killed and found, the
 * best find, the bounty claimed or lost and what salvage gave, then back to the Anvil or straight
 * in again.
 */
export function DiveSummary({ dive, biomeName, onCamp, onAgain, againLabel }: DiveSummaryProps) {
  const died = dive.phase === 'dead';
  const titleRef = useRef<HTMLHeadingElement>(null);
  const registry = getDelveRegistry();
  // The runes picked up this dive by name: this session's (after a reload, only their count).
  const diveRunes = useDelveStore((s) => s.diveRunes);
  const runeNames = countRunes(diveRunes)
    .map(({ rune, count }) => `${runeName(registry, rune)}${count > 1 ? ` ×${count}` : ''}`)
    .join(', ');

  useEffect(() => {
    titleRef.current?.animate(
      [
        { transform: 'scale(2.2)', opacity: 0, letterSpacing: '0.5em' },
        { transform: 'scale(1)', opacity: 1, letterSpacing: '0.05em' },
      ],
      { duration: 550, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
    );
  }, []);

  const totalFound = RARITY_ORDER.reduce((n, r) => n + dive.found[r], 0);
  const stats: [number, string][] = [
    [dive.depthsCleared, 'depths cleared'],
    [dive.kills, 'kills'],
    [totalFound, 'items found'],
  ];

  return (
    <div
      className="delve-ui delve-zoom absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8"
      style={{ background: glow(died ? '228,59,68' : '247,118,34') }}
      data-testid="dive-summary"
      data-pad-scope
    >
      <h1
        ref={titleRef}
        className="k-display m-0"
        style={{ color: died ? 'var(--k-bad-text)' : 'var(--k-hot-hi)' }}
      >
        {died ? 'YOU FELL' : 'EXTRACTED'}
      </h1>
      <p className="k-body-2 m-0">
        Depth {dive.depth} · {biomeName}
      </p>

      <div className="k-plate grid w-[560px] grid-cols-3 gap-4 p-[22px] text-center">
        {stats.map(([n, label]) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="k-disp text-[40px]">{n}</span>
            <span className="k-caption">{label}</span>
          </div>
        ))}
        {totalFound > 0 && (
          <div className="col-span-3 flex flex-wrap justify-center gap-x-4 gap-y-1 bg-[var(--k-well)] px-3 py-2 text-[14px]">
            {RARITY_ORDER.filter((r) => dive.found[r] > 0).map((r) => (
              <span key={r} style={{ color: RARITY_TEXT[r] }}>
                {dive.found[r]} {RARITY_LABEL[r]}
              </span>
            ))}
          </div>
        )}
      </div>

      {dive.bestFind && (
        <div className="flex items-center gap-4">
          <ItemTile item={dive.bestFind} size={64} />
          <div className="flex flex-col gap-1">
            <span className="k-label">Best find</span>
            <span
              className="k-disp text-[26px]"
              style={{ color: RARITY_TEXT[dive.bestFind.rarity] }}
            >
              {dive.bestFind.name}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-2 text-center">
        {died ? (
          <span className="text-[18px] text-[var(--k-text-2)]">
            Bounty lost:{' '}
            <s className="text-[var(--k-bad-text)]">
              <Price scrap={dive.bounty} />
            </s>
          </span>
        ) : (
          <span className="text-[18px] text-[var(--k-text-2)]">
            Bounty claimed:{' '}
            <b className="text-[var(--k-hot)]">
              <Price scrap={dive.bounty} />
            </b>
          </span>
        )}
        <span className="flex flex-wrap items-center justify-center gap-x-2 text-[15px] text-[var(--k-text-3)]">
          <span>
            <Price scrap={dive.scrapEarned} /> earned this dive
          </span>
          {dive.dustEarned > 0 && (
            <span className="flex items-center gap-1" data-testid="dive-dust">
              · <Glyph id="dust" size={16} /> {formatNumber(dive.dustEarned)} Mana Dust from salvage
            </span>
          )}
          {dive.linksEarned > 0 && (
            <span className="flex items-center gap-1" data-testid="dive-links">
              · <Glyph id="link" size={16} /> {dive.linksEarned} Link
              {dive.linksEarned > 1 ? 's' : ''} from salvaged weapons
            </span>
          )}
          {dive.runesEarned > 0 && (
            <span className="flex items-center gap-1" data-testid="dive-runes">
              · <Glyph id="rune" size={16} /> {dive.runesEarned} rune
              {dive.runesEarned > 1 ? 's' : ''} found
              {runeNames && `: ${runeNames}`}
            </span>
          )}
        </span>
      </div>

      <div className="flex w-[560px] flex-col gap-3">
        <Button variant="primary" size="lg" onClick={onCamp} data-pad-first testId="return-camp">
          RETURN TO THE ANVIL
        </Button>
        <Button onClick={onAgain} testId="dive-again">
          {againLabel}
        </Button>
      </div>
    </div>
  );
}
```

Overwrite `packages/client/src/features/delve/LegendaryFanfare.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import type { GearItem } from '@alloy/engine';
import { baseDisplayName } from '@alloy/engine';
import { getDelveRegistry } from './registry';
import { ItemIcon } from './ItemIcon';
import { legendaryText } from './format';

interface LegendaryFanfareProps {
  item: GearItem;
  firstTime: boolean;
  onDone: () => void;
}

/** Full-screen celebration for a legendary drop, in the forge kit. Tap to continue. */
export function LegendaryFanfare({ item, firstTime, onDone }: LegendaryFanfareProps) {
  const registry = getDelveRegistry();
  const rootRef = useRef<HTMLButtonElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    titleRef.current?.animate(
      [
        { transform: 'scale(3)', opacity: 0 },
        { transform: 'scale(0.95)', opacity: 1, offset: 0.6 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 520, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
    );
    iconRef.current?.animate(
      [
        { transform: 'translateY(60px) scale(0.2) rotate(-40deg)', opacity: 0 },
        { transform: 'translateY(-10px) scale(1.2) rotate(8deg)', opacity: 1, offset: 0.6 },
        { transform: 'translateY(0) scale(1) rotate(0)', opacity: 1 },
      ],
      { duration: 700, delay: 150, easing: 'cubic-bezier(0.2, 1.3, 0.4, 1)', fill: 'backwards' },
    );
    const id = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <button
      ref={rootRef}
      type="button"
      onClick={onDone}
      className="delve-ui delve-zoom absolute inset-0 z-[70] flex flex-col items-center justify-center gap-4 overflow-hidden border-0 px-8 text-center text-[var(--k-text)]"
      style={{
        background:
          'radial-gradient(circle at 50% 42%, rgba(247,118,34,0.45) 0 22%, rgba(247,118,34,0.22) 22% 40%, transparent 40%), rgba(24,20,37,0.96)',
      }}
      data-testid="legendary-fanfare"
    >
      {/* Rotating rays */}
      <div
        className="pointer-events-none absolute left-1/2 top-[42%] h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            'repeating-conic-gradient(from 0deg, rgba(254,231,97,0.16) 0deg 8deg, transparent 8deg 22deg)',
          animation: 'delve-rays 12s linear infinite',
          maskImage: 'radial-gradient(circle, #000 0 30%, transparent 30%)',
          WebkitMaskImage: 'radial-gradient(circle, #000 0 30%, transparent 30%)',
        }}
      />
      <div ref={titleRef} className="k-display relative" style={{ color: 'var(--k-hot-hi)' }}>
        LEGENDARY!
      </div>
      <div ref={iconRef} className="relative h-36 w-36">
        <ItemIcon baseId={item.baseId} rarity="legendary" />
      </div>
      <div className="relative flex flex-col gap-2">
        <div className="k-disp text-[44px]" data-testid="fanfare-name">
          {item.name}
        </div>
        <div className="text-[16px] text-[var(--k-wood-text)]">
          Legendary {baseDisplayName(registry, item)}
        </div>
      </div>
      {item.legendary && (
        <div className="relative max-w-[520px] text-[18px]">
          {legendaryText(registry, item.legendary.id, item.legendary.value)}
        </div>
      )}
      {firstTime && (
        <div className="k-label relative" style={{ color: 'var(--k-hot)' }}>
          New codex entry!
        </div>
      )}
      <div className="k-label relative">Tap to continue</div>
    </button>
  );
}
```

- [ ] **Step 4: Run them to see them pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/DiveSummary.test.tsx src/features/delve/__tests__/LegendaryFanfare.test.tsx)`
Expected: PASS (7 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 7 tests in F + 1 files** (1153 in 146 at `cd13060`).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3e
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/DiveSummary.tsx src/features/delve/LegendaryFanfare.tsx src/features/delve/__tests__/DiveSummary.test.tsx src/features/delve/__tests__/LegendaryFanfare.test.tsx)
git add packages/client/src/features/delve/DiveSummary.tsx packages/client/src/features/delve/LegendaryFanfare.tsx packages/client/src/features/delve/__tests__/DiveSummary.test.tsx packages/client/src/features/delve/__tests__/LegendaryFanfare.test.tsx
git commit -m "style(client): the dive summary and the legendary fanfare in the forge kit, glyphs for emoji" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: At integration

### Task 5: The pause replaces the kebab menu (on `ui/p3b`, after 3D merges; before 3D deletes `ItemDetailSheet`)

`DelveRun` keeps one `pause` state. The purse's Menu (and Esc or the pad's Menu in the fight, through it), the stop's Menu, a find (the Found log or the stop's panel: Loadout on that item) and the Journal (Quests) open 3D's `PauseScreen`; Resume closes it; the kebab menu, `ControlsPanel` and `ItemDetailSheet` leave `DelveRun`.

**Files:**
- Overwrite: `packages/client/src/pages/__tests__/DelveRun.test.tsx`
- Modify: `packages/client/src/pages/DelveRun.tsx` (CRLF: Edit tool only)

- [ ] **Step 0: Check the base**

```bash
cd /c/Projects/alloy-ui-p3b
git merge-base --is-ancestor ui/p3b-3e ui/p3b && git merge-base --is-ancestor ui/p3b-3d ui/p3b && echo "3D and 3E merged"
grep -n "export function PauseScreen\|export interface PauseScreenProps" packages/client/src/features/delve/hub/PauseScreen.tsx
ls packages/client/src/features/delve/ItemDetailSheet.tsx
```

Expected: `3D and 3E merged`; both exports found; `ItemDetailSheet.tsx` still listed (3D's deletion waits for this task, X2).

- [ ] **Step 1: The failing test**

Overwrite `packages/client/src/pages/__tests__/DelveRun.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createDelveProfile, startDive } from '@alloy/engine';
import { createArenaInput } from '@/features/delve/arena/input';
import { getDelveRegistry } from '@/features/delve/registry';
import { useDelveStore } from '@/stores/delveStore';
import type { PauseScreenProps } from '@/features/delve/hub/PauseScreen';
import { DelveRun } from '../DelveRun';

// The arena itself (Pixi) stands still: the page's HUD is what's under test.
vi.mock('@/features/delve/arena/useArena', () => ({
  useArena: () => ({
    input: createArenaInput(),
    heroScreen: () => null,
    pixelsPerUnit: () => 30,
    hud: null,
    worldRef: { current: null },
    cast: () => {},
    potion: () => {},
    dodge: () => {},
    attack: () => {},
  }),
}));

// The pause (3D's) as its contract: which tab it opens on, and Resume.
vi.mock('@/features/delve/hub/PauseScreen', () => ({
  PauseScreen: ({ link, onResume }: PauseScreenProps) => (
    <div data-testid="pause-stub" data-link={JSON.stringify(link ?? null)}>
      <button type="button" onClick={onResume}>
        Resume
      </button>
    </div>
  ),
}));

const renderRun = () =>
  render(
    <MemoryRouter>
      <DelveRun />
    </MemoryRouter>,
  );
const pauseLink = () => JSON.parse(screen.getByTestId('pause-stub').dataset.link!);

describe('DelveRun', () => {
  beforeEach(() => {
    const registry = getDelveRegistry();
    useDelveStore.setState({
      profile: startDive(registry, createDelveProfile(registry, 7), 1),
      diveDrops: [],
      floorDropsFrom: 0,
    });
  });

  it('lays the purse, the right column and the skill dock on the HUD grid, beside the arena host', () => {
    renderRun();
    const top = screen.getByTestId('purse-bar').closest('[data-hud="top"]');
    expect(top).not.toBeNull();
    expect(screen.getByTestId('skill-bar').closest('[data-hud="dock"]')).not.toBeNull();
    const grid = top!.parentElement!;
    expect(grid).toHaveClass('delve-hud-zoom');
    expect(grid.contains(screen.getByTestId('arena'))).toBe(false);
  });

  it("the purse's Menu opens the pause and never toggles it closed; Resume returns to the fight", () => {
    renderRun();
    const menu = screen.getByRole('button', { name: 'Dive menu' });
    fireEvent.click(menu);
    expect(screen.getByTestId('dive-pause')).toHaveClass('z-40');
    expect(pauseLink()).toBeNull();
    fireEvent.click(menu);
    expect(screen.getByTestId('pause-stub')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByTestId('pause-stub')).toBeNull();
    // The kebab menu is gone.
    expect(screen.queryByTestId('attack-mode-toggle')).toBeNull();
  });

  it('the Journal opens the pause on Quests', () => {
    const { container } = renderRun();
    fireEvent.click(container.querySelector<HTMLElement>('[data-pad-journal]')!);
    expect(pauseLink()).toEqual({ tab: 'quests' });
  });

  it("a find in the Found log opens the pause's Loadout on it", () => {
    const uid = useDelveStore.getState().profile.equipped.weapon!.uid;
    useDelveStore.getState().pushDiveDrops([uid]);
    renderRun();
    fireEvent.click(within(screen.getByTestId('pickup-feed')).getByTestId('loot-item'));
    expect(pauseLink()).toEqual({ tab: 'loadout', uid });
  });

  it('at the stop, the stop screen covers the arena; its Menu opens the pause over it, and Resume returns to it', () => {
    const { profile } = useDelveStore.getState();
    useDelveStore.setState({
      profile: {
        ...profile,
        dive: {
          ...profile.dive!,
          phase: 'choosing',
          doorChoices: ['winding'],
          stop: { offers: ['equip'], taken: false },
        },
      },
    });
    renderRun();
    const stop = screen.getByTestId('door-choice');
    expect(screen.getByTestId('door-winding')).toBeInTheDocument();
    expect(screen.queryByTestId('skill-bar')).toBeNull();
    fireEvent.click(within(stop).getByRole('button', { name: 'Menu' }));
    const pause = screen.getByTestId('pause-stub');
    expect(stop.compareDocumentPosition(pause) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByTestId('pause-stub')).toBeNull();
    expect(screen.getByTestId('door-choice')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx)`
Expected: FAIL, `4 failed | 1 passed (5)`: `Unable to find an element by: [data-testid="dive-pause"]`, then three times `[data-testid="pause-stub"]`.

- [ ] **Step 3: The wiring**

In `packages/client/src/pages/DelveRun.tsx`:

Delete the line: `import { ControlsPanel } from '@/features/controls/ControlsPanel';`

Replace: `import { ItemDetailSheet } from '@/features/delve/ItemDetailSheet';` with:

```tsx
import { PauseScreen } from '@/features/delve/hub/PauseScreen';
import type { HubLink } from '@/features/delve/hub/types';
```

Replace: `  const [sheetUid, setSheetUid] = useState<string | null>(null);` with: `  const [pause, setPause] = useState<{ link?: HubLink } | null>(null);`

Delete the lines:

```tsx
  const [menuOpen, setMenuOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
```

Replace:

```tsx
  const paused =
    !!sheetUid || fanfares.length > 0 || menuOpen || controlsOpen || choosing || finished;
```

with:

```tsx
  const paused = !!pause || fanfares.length > 0 || choosing || finished;
```

Replace:

```tsx
  const openItem = (uid: string) => {
    useDelveStore.getState().markSeen([uid]);
    setSheetUid(uid);
  };
```

with:

```tsx
  /** The pause over the dive or the stop, on `link`'s tab (Loadout without one). */
  const openPause = (link?: HubLink) => setPause({ link });
  /** A find, from the Found log or the stop: the pause's Loadout, on that item. */
  const openItem = (uid: string) => {
    useDelveStore.getState().markSeen([uid]);
    openPause({ tab: 'loadout', uid });
  };
  const openJournal = () => openPause({ tab: 'quests' });
```

Replace: `        top={<PurseBar dive={dive} onMenu={() => setMenuOpen(true)} />}` with: `        top={<PurseBar dive={dive} onMenu={() => openPause()} onJournal={openJournal} />}`

Replace: `            onJournal={() => {}}` with: `            onJournal={openJournal}`

Replace: `            onMenu={() => setMenuOpen(true)}` (the stop's) with: `            onMenu={() => openPause()}`

Replace the lines from `      {menuOpen && (` up to (not including) `      {finished && (` with:

```tsx
      {pause && (
        <div className="absolute inset-0 z-40" data-testid="dive-pause">
          <PauseScreen
            dive={dive}
            biome={biome}
            foesLeft={arena.hud?.monstersLeft ?? 0}
            link={pause.link}
            onResume={() => setPause(null)}
            onAnvil={() => navigate('/delve')}
            onAbandon={() => {
              setPause(null);
              onCamp();
            }}
          />
        </div>
      )}

```

(That removes the kebab menu, the Controls comment and `ControlsPanel`.)

Delete the line: `      {sheetUid && <ItemDetailSheet uid={sheetUid} onClose={() => setSheetUid(null)} />}`

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx)`
Expected: PASS (5 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; two tests more than before this task, in the same files. Then the integrator's E2E with X4's D01, D02, D05, D09, G01 and G05 edits.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p3b
(cd packages/client && npx prettier --write --end-of-line auto src/pages/DelveRun.tsx src/pages/__tests__/DelveRun.test.tsx)
git add packages/client/src/pages/DelveRun.tsx packages/client/src/pages/__tests__/DelveRun.test.tsx
git commit -m "feat(client): the pause replaces the dive's kebab menu; finds open it on Loadout, the Journal on Quests" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: `RunePicker` is inline only; the sheet CSS goes (on `ui/p3b`, last: after 3F merges and 3D deletes `ItemDetailSheet`)

**Files:**
- Modify: `packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx`
- Modify: `packages/client/src/features/delve/runes/RunePicker.tsx`
- Modify: `packages/client/src/features/delve/StopPanel.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/MoveInspector.tsx` (outside the area: its one `variant="inline"`)
- Modify: `packages/client/src/features/delve/delve.css`
- Modify: `packages/client/src/features/delve/kit/__tests__/kit-css.test.ts` (outside the area: its `.delve-sheet` row)

- [ ] **Step 0: Check the base**

```bash
cd /c/Projects/alloy-ui-p3b
ls packages/client/src/features/delve/ItemDetailSheet.tsx 2>/dev/null || echo "sheet gone"
grep -rn "delve-sheet" packages/client/src --include=*.tsx --include=*.ts
git merge-base --is-ancestor ui/p3b-3f ui/p3b && echo "3F merged"
grep -rn "variant=\"sheet\"\|variant: 'sheet'" packages/client/src || echo "no sheet callers"
```

Expected: `sheet gone`; the `delve-sheet` grep lists only `runes/RunePicker.tsx` (its sheet branch) and `kit/__tests__/kit-css.test.ts`; `3F merged`; `no sheet callers`. Otherwise stop: this task waits for 3F's merge and 3D's deletion.

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx`:

Replace:

```tsx
    expect(screen.getByRole('dialog', { name: 'Socket a rune' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
```

with:

```tsx
    expect(screen.getByRole('group', { name: 'Socket a rune' })).toBe(
      screen.getByTestId('rune-picker'),
    );
```

Replace: `  it("is a modal: Back has the focus and is the pad's back; Escape, a pick or the backdrop close it, the focus back on its opener", () => {` with: `  it("Back has the focus and is the pad's back; Escape or a pick close it, the focus back on its opener", () => {`

Replace: `    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });` with: `    fireEvent.keyDown(screen.getByTestId('rune-picker'), { key: 'Escape' });`

Replace:

```tsx
    expect(opener).toHaveFocus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByTestId('rune-picker'));
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("the sheet sits in the kit's UI layer, over the screen", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Socket 1' }));
    expect(screen.getByTestId('rune-picker').parentElement).toBe(
      document.getElementById('delve-ui-layer'),
    );
  });

  it('inline, it is drawn in place as its own pad scope: Back has the focus, Escape closes it', () => {
    const onClose = vi.fn();
    const { container } = render(
      <RunePicker
        variant="inline"
        candidates={[{ rune: { id: 'split', tier: 1 }, count: 2 }]}
```

with:

```tsx
    expect(opener).toHaveFocus();
  });

  it('is drawn in place as its own pad scope, no sheet: Back has the focus, Escape closes it', () => {
    const onClose = vi.fn();
    const { container } = render(
      <RunePicker
        candidates={[{ rune: { id: 'split', tier: 1 }, count: 2 }]}
```

Replace: `    expect(screen.getByRole('dialog', { name: 'Linger II' })).toBeInTheDocument();` with: `    expect(screen.getByRole('group', { name: 'Linger II' })).toBeInTheDocument();`

Replace: `    expect(screen.getByRole('dialog')).toHaveTextContent('68.75%');` with: `    expect(screen.getByTestId('rune-picker')).toHaveTextContent('68.75%');`

Replace: `    expect(screen.getByRole('dialog')).toHaveTextContent('84.375%');` with: `    expect(screen.getByTestId('rune-picker')).toHaveTextContent('84.375%');`

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/RunePicker.test.tsx)`
Expected: FAIL, `4 failed | 5 passed (9)`, the first with `Unable to find an accessible element with the role "group" and name "Socket a rune"` (the default is still the sheet's dialog).

- [ ] **Step 3: Inline only**

In `packages/client/src/features/delve/runes/RunePicker.tsx`:

Delete the line: `import { createPortal } from 'react-dom';`

Delete the line: `import { uiLayer } from '@/features/delve/kit';`

Delete the lines:

```tsx
  /**
   * 'sheet' (the default: Training and the stop until 3b): a modal over the screen, in the kit's
   * UI layer (taking the clicks the layer lets through, at its own unzoomed size until 3b).
   * 'inline' (the Skills inspector): drawn in place, its own pad scope.
   */
  variant?: 'sheet' | 'inline';
```

Replace:

```tsx
 * price). The Training Grounds pick the tier here (I–V chips). Its own pad
 * scope either way: Back has the focus and is the pad's back, Escape closes
 * it, and closing it (a pick, a pull or Back) returns the focus to the control
 * that opened it. The sheet is a modal dialog in the kit's UI layer, which its
 * backdrop closes too; inline, it is drawn in place (the Skills inspector).
```

with:

```tsx
 * price). The Training Grounds pick the tier here (I–V chips). Drawn in
 * place (the Skills inspector, the stop's rune pick, the Training dock), its
 * own pad scope: Back has the focus and is the pad's back, Escape closes it,
 * and closing it (a pick, a pull or Back) returns the focus to the control
 * that opened it.
```

Delete the line: `  variant = 'sheet',`

Replace:

```tsx
  const body = (
    <>
```

with:

```tsx
  return (
    <div
      className="flex flex-col gap-3"
      role="group"
      aria-label={title}
      onKeyDown={onKeyDown}
      data-testid="rune-picker"
      data-pad-scope
    >
```

Replace the lines from `    </>` up to the end of the file with:

```tsx
    </div>
  );
}
```

(That removes the `inline` return and the portal sheet.)

Every caller that named the variant loses it:

```bash
cd /c/Projects/alloy-ui-p3b
grep -rn 'variant="inline"' packages/client/src
```

Expected at least: `features/delve/StopPanel.tsx` (`          variant="inline"`, on its own line after `        <RunePicker`) and `features/delve/hub/skills/MoveInspector.tsx` (`<RunePicker variant="inline" {...ed.picker} />`), plus any `RunePicker` 3F gave one (nothing else in the client passes `variant="inline"`). In `StopPanel.tsx`, delete the line `          variant="inline"`. In `MoveInspector.tsx`, replace: `<RunePicker variant="inline" {...ed.picker} />` with: `<RunePicker {...ed.picker} />`. Remove any other the grep lists the same way.

**Only if nothing imports `useRunePickerOpen` any more** (`grep -rn useRunePickerOpen packages/client/src` lists only `RunePicker.tsx`, because 3F dropped it from `DelveTraining.tsx`): in `RunePicker.tsx` also delete the lines:

```tsx
// How many pickers are open: an arena under one pauses (`useRunePickerOpen`).
let openPickers = 0;
const pickerListeners = new Set<() => void>();
function countPicker(by: number) {
  openPickers += by;
  pickerListeners.forEach((l) => l());
}
function onPickers(l: () => void) {
  pickerListeners.add(l);
  return () => void pickerListeners.delete(l);
}

/** Whether any rune picker is open (the Training Grounds pause the arena under one). */
export function useRunePickerOpen(): boolean {
  return useSyncExternalStore(onPickers, () => openPickers > 0);
}

```

delete the lines

```tsx
  useLayoutEffect(() => {
    countPicker(1);
    return () => countPicker(-1);
  }, []);
```

and replace the first line's `import { useId, useLayoutEffect, useState, useSyncExternalStore, type KeyboardEvent } from 'react';` with `import { useId, useState, type KeyboardEvent } from 'react';`. Otherwise leave them.

In `packages/client/src/features/delve/delve.css`:

Delete the lines from `.delve-sheet-backdrop {` up to (not including) `.delve-quality {`.

In `packages/client/src/features/delve/kit/__tests__/kit-css.test.ts`:

Delete the line: `      ['.delve-sheet', 'border: 4px solid #3a4466;'],`

```bash
grep -rn "delve-sheet" packages/client/src || echo "no sheet left"
```

Expected: `no sheet left`.

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/runes src/features/delve/__tests__/StopPanel.test.tsx src/features/delve/kit/__tests__/kit-css.test.ts)`
Expected: PASS (the rune picker's 9 tests among them).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; one test fewer than before this task, in the same files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p3b
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/runes/RunePicker.tsx src/features/delve/runes/__tests__/RunePicker.test.tsx src/features/delve/StopPanel.tsx src/features/delve/hub/skills/MoveInspector.tsx src/features/delve/delve.css src/features/delve/kit/__tests__/kit-css.test.ts)
git add packages/client/src/features/delve/runes/RunePicker.tsx packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx packages/client/src/features/delve/StopPanel.tsx packages/client/src/features/delve/hub/skills/MoveInspector.tsx packages/client/src/features/delve/delve.css packages/client/src/features/delve/kit/__tests__/kit-css.test.ts
git commit -m "refactor(client): the rune picker is inline only; the bottom-sheet CSS goes" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Stage any other file Step 3's grep made you edit too.)

## Verification (the area's end check)

- **After Task 4** (`ui/p3b-3e`): the client typecheck is clean and the suite reads **N + 7 tests in F + 1 files** (1153 in 146 at `cd13060`); `git diff --stat ui/p3b` lists only this plan's files; the engine is untouched. Every Delve E2E on `desktop` passes with the specs unchanged (24 of 24 on the scratch copy).
- **After Task 5** (`ui/p3b`, 3D merged): two tests more; the E2E with X4's edits: D01 (pause, then return), D02 (a find opens the pause; "Locked during the dive"; "Abandon · lose bounty"), D03 (the stop), D05 (the toggle in Controls, from the pause), D07, R03, G01, G05.
- **After Task 6** (`ui/p3b`, 3F merged, `ItemDetailSheet` gone): one test fewer; `grep -rn "delve-sheet\|createPortal" packages/client/src/features/delve/runes packages/client/src/features/delve/StopPanel.tsx` prints nothing; T01 and T02 (3F's) still pass with the dock's picker inline.
- **A manual look** (dev server, a save at the door screen, 1920×1080 and 1280×720): the header, the three columns at 380 / flexible / 420, a card expanding in place and Back (or Esc) returning, S skipping, Esc opening the pause and Resume returning to the stop; with the pad, the first door focused, A takes, X skips, Y opens the focused find, B in a picker backs out, Menu opens the pause.
