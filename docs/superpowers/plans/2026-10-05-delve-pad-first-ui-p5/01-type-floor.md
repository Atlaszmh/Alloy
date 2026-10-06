# The type floor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nothing in the Delve is drawn under 16 design px, and anything read is 18. The kit's text classes carry it (`k-body-2` 18, a new `k-note` 18, `k-caption` and `k-label` 16, the kit's chips, steppers, glyph caps and tile marks 16), and the hard-coded sizes across the Delve UI are swept screen by screen (`text-[14px]` and `text-[15px]` to 16 or 18, `text-[16px]` that is read to 18, `text-[17px]` to 18). A new E2E, TY01/TY02, measures it the way phase 1 did (the share of text under 14, 16 and 18 px, from the DOM) and gates it (none under 16), and the responsive probe's floor rises from 10 to 12 CSS px (16 at the 0.75 zoom floor). Every screen still holds at 1920×1080 and 1280×800.

**Architecture:** CSS and class names only, plus one E2E spec and one probe constant. No component changes shape. The tiers:

| Tier | Size | Classes | What |
|---|---|---|---|
| Read | 18 | the base (`.delve-ui`), `k-body-2`, `k-note` (new), `k-btn-md` | a sentence, an item's line, a description, a refusal, a note that explains |
| Label | 16 | `k-caption`, `k-label`, `k-prompt`, `k-btn-sm`, `k-chip`, `k-seg`, `k-stepper`, `k-tab-badge`, `k-glyph-sm`, `k-tile-*` | a name, a count, a price, a short caption, a key, a prompt |

**The sweep's one rule:** a run of text that is a sentence (it has a verb, or ends in a full stop: "None yet: drops from elites", "Claim after the dive", an engine refusal) is read: 18 (`k-note` where it was a `k-caption`, `text-[18px]` where it was hard-coded). Anything else (a label, a count, a stat's name, a price, "rolls 40–100%") is 16. When unsure, 16: the gate is the 16 floor; 18 is the reading target the shares report.

**Out of scope:** the DPS Lab (`features/delve/lab/*`, `pages/DelveLab.tsx`: a dev tool behind a dev build, never probed); `KitGallery.tsx` (dev only) follows the kit by itself.

**Tech Stack:** CSS, Tailwind v4 arbitrary values, Playwright.

Read `00-overview.md` first.

---

### Task 1: the measure, and the baseline

**Files:**
- Create: `packages/client/e2e/delve-type.spec.ts`

- [ ] **Step 1: Write the spec.**

```ts
import { test, expect, type Page } from '@playwright/test';
import { ARENA_READY, seedProfile, startDive, stepTo } from './fixtures/delve';

/**
 * The Delve's type floor (the pad-first spec, 6): every drawn text's design px, the share under
 * 14, 16 and 18 per screen (TYPE_REPORT=1 prints them), and none under 16. Design px are the
 * computed font-size: the screens' zoom applies after it, and at 1920×1080 it is 1 anyway.
 */
const FLOOR = 16;

interface Run {
  size: number;
  where: string;
  text: string;
}

/** One entry per element that draws text of its own, as the responsive probe walks them. */
async function runs(page: Page): Promise<Run[]> {
  return page.evaluate(() => {
    const out: { size: number; where: string; text: string }[] = [];
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      const text = n.textContent?.trim();
      if (!el || !text || seen.has(el) || el.closest('.sr-only')) continue;
      seen.add(el);
      let box: Element | null = el;
      while (box && getComputedStyle(box).display === 'contents') box = box.parentElement;
      if (!box) continue;
      const r = box.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (!box.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      out.push({
        size: parseFloat(getComputedStyle(el).fontSize),
        where: el.closest('[data-testid]')?.getAttribute('data-testid') ?? el.tagName.toLowerCase(),
        text: text.slice(0, 40),
      });
    }
    return out;
  });
}

/** Measure the screen on show: report its shares, and hold the floor. */
async function measure(page: Page, screen: string): Promise<void> {
  const all = await runs(page);
  const share = (px: number) => Math.round((100 * all.filter((r) => r.size < px - 0.01).length) / all.length);
  const smallest = Math.min(...all.map((r) => r.size));
  if (process.env.TYPE_REPORT)
    console.log(`TY ${screen}: ${all.length} runs · <14 ${share(14)}% · <16 ${share(16)}% · <18 ${share(18)}% · smallest ${smallest}`);
  const under = all.filter((r) => r.size < FLOOR - 0.01).map((r) => `${r.size}px ${r.where}: "${r.text}"`);
  expect.soft(under, `${screen}: text under ${FLOOR} design px`).toEqual([]);
}

test.describe('the type floor', () => {
  // Design px equal CSS px only at --ui-scale 1.
  test.skip(({ viewport }) => viewport?.width !== 1920, 'measured at 1920×1080 (desktop-1080)');

  test('TY01: the Anvil: every tab, the benches, the editor, the sheets and the dialogs', async ({ page }) => {
    await seedProfile(page, 4242, false);
    await page.goto('/delve');
    for (const tab of ['loadout', 'skills', 'forge', 'codex', 'quests'] as const) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
      await measure(page, tab);
    }
    await page.getByTestId('tab-skills').click();
    await page.getByTestId('move-0').click();
    await expect(page.getByTestId('move-editor')).toBeVisible();
    await measure(page, 'skills-editor');
    await page.getByTestId('move-editor-back').click();
    await page.getByTestId('tab-forge').click();
    await page.getByTestId('pattern-cuirass').click();
    await stepTo(page, 'forge-flux', /^Uncommon/);
    await measure(page, 'forge-pattern');
    await page.getByTestId('bench-temper').click();
    await measure(page, 'temper');
    await page.getByTestId('bench-materials').click();
    await measure(page, 'materials');
    await page.getByTestId('depart-button').click();
    await expect(page.getByTestId('depart-sheet')).toBeVisible();
    await measure(page, 'depart');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape'); // the system menu
    await expect(page.getByTestId('open-settings')).toBeVisible();
    await measure(page, 'system-menu');
    await page.getByTestId('open-settings').click();
    await measure(page, 'settings');
    await page.getByTestId('settings-close').click();
    await page.getByTestId('open-controls').click();
    await expect(page.getByTestId('controls-panel')).toBeVisible();
    await measure(page, 'controls');
    await page.getByTestId('controls-close').click();
    await page.getByTestId('open-help').click();
    await expect(page.getByTestId('help-dialog')).toBeVisible();
    await measure(page, 'help');
  });

  test('TY02: the dive: the lean HUD, the pause list and the stop', async ({ page }) => {
    await seedProfile(page); // the bot clears depth 1
    await page.goto('/delve');
    await startDive(page);
    await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });
    await measure(page, 'hud');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-screen')).toBeVisible();
    await measure(page, 'pause-list');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('door-choice')).toBeVisible({ timeout: 60_000 });
    await measure(page, 'stop');
  });
});
```

  Check each test id against the code before running (`grep -rn 'data-testid="open-controls"\|testId="open-controls"' packages/client/src`): `open-settings`, `open-help` and `controls-close` exist (the pad audit and the responsive specs use them); if the system menu's Controls entry has another id, use it. The pause's Escape in TY02 resumes; with the bot driving, the stop opens on its own.

- [ ] **Step 2: Run it: the baseline.**

```bash
(cd packages/client && TYPE_REPORT=1 npx playwright test e2e/delve-type.spec.ts --project=desktop-1080 --reporter=line > "$SCRATCH/type-before.txt" 2>&1; grep "TY " "$SCRATCH/type-before.txt"; tail -n 5 "$SCRATCH/type-before.txt")
```

  Expected: FAIL (soft: every screen lists its runs under 16). Copy the `TY …` lines into this plan's Baseline below and into the commit message's body. The spec's Evidence reads "69–92% of a hub tab's text is under 18 px" at v0.64.1; record what v0.68.0 reads.

  Baseline (recorded <date> at `<sha>`): _the TY lines_.

- [ ] **Step 3: Commit** (the spec fails until Task 6: commit it with `test.fail()` on both tests and a comment "the floor lands in Task 6", removed there).

```bash
git add packages/client/e2e/delve-type.spec.ts
git commit -m "test(client): TY01 and TY02 measure the Delve's text sizes, the baseline for the type floor"
```

---

### Task 2: the kit

**Files:**
- Modify: `packages/client/src/features/delve/kit/kit.css`
- Modify: `packages/client/src/features/delve/delve.css`
- Test: `packages/client/src/features/delve/kit/__tests__/surfaces.test.tsx` (only if a snapshot or a class assertion fails)

- [ ] **Step 1: The classes** (find each with `grep -n` in `kit.css`):
  - `.k-body-2`: 16 → 18.
  - `.k-caption`: 14 → 16.
  - `.k-label`: 14 → 16.
  - New, after `.k-caption`:

    ```css
    /* A caption that is a sentence: read, so 18, in the caption's colour (the pad-first spec, 6). */
    .k-note {
      font-size: 18px;
      color: var(--k-text-3);
    }
    ```

  - `.k-glyph-sm`, `.k-chip`, `.k-tab-badge`, `.k-seg`, `.k-stepper`, `.k-tile-delta`, `.k-tile-new`: 14 → 16.
  - `.k-hold` (14): phase 4 retired the prompt runtime's hold; `grep -rn "k-hold" packages/client/src --include=*.tsx`. None: delete the rule. One: 16.
- [ ] **Step 2: `delve.css`.** Its small rules are dead: `grep -rn "delve-hpbar\|delve-tile-\|delve-slam-btn" packages/client/src --include=*.tsx` finds no user at v0.68.0. Delete `.delve-tile*` (the tile rules from `.delve-tile` to `.delve-tile-delta.up`), `.delve-hpbar*` and `.delve-slam-btn*`, re-running the grep after each, never a rule something uses. `.delve-chip` (14, used by `ChainEditor`, `MoveEditor`, `RunePicker`, `SocketRow`) → 16.
- [ ] **Step 3: Check.** `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/kit)`. Expected: PASS (no unit test reads a size; `EquippedPane.test.tsx` asserts no `text-[10px]`/`text-[12px]`, still true).
- [ ] **Step 4: Commit**

```bash
git add packages/client/src/features/delve/kit/kit.css packages/client/src/features/delve/delve.css
git commit -m "style(client): the kit's type floor: body and the new k-note at 18, captions, labels, chips, steppers and tile marks at 16; delve.css's dead small rules go"
```

---

### Task 3: the hub's screens

The files under `hub/` and the item views they show. Apply the sweep's rule to each `text-[14px]`, `text-[15px]`, `text-[16px]`, `text-[17px]` and `k-caption` (a `k-caption` that is a sentence becomes `k-note`). Counts at v0.68.0, to check you found them all (`grep -c`):

**Files:**
- Modify (`text-[14px]`): `hub/skills/ChainLane.tsx` (10), `ManaPanel.tsx` (9), `runes/RunePicker.tsx` (6), `hub/skills/MoveRows.tsx` (5), `hub/SettingsPanel.tsx` (4), `features/controls/ControlsPanel.tsx` (4), `hub/loadout/ComparePane.tsx` (3), `runes/SocketRow.tsx` (2), `items/ItemHeader.tsx` (2), `hub/skills/MoveInspector.tsx` (2), `hub/skills/FormPicker.tsx` (2), `hub/skills/ApplySheet.tsx` (2), `runes/RuneGlyph.tsx`, `materials/HaulList.tsx`, `items/MovesetView.tsx`, `items/LegendaryBox.tsx`, `items/ItemStatLines.tsx`, `hub/skills/ApplyBar.tsx`, `hub/quests/QuestsTab.tsx`, `hub/loadout/EquippedPane.tsx`, `hub/HubHeader.tsx` (1 each)
- Modify (`text-[16px]` read, `text-[17px]`): `hub/forge/ForgeBench.tsx` (4), `hub/skills/ChainLane.tsx` (3), `runes/RunePicker.tsx` (3), `hub/DepartSheet.tsx` (3), `items/ItemStatLines.tsx` (2), `hub/quests/QuestsTab.tsx` (2, and its `text-[17px]`), and one each in `items/LegendaryBox.tsx`, `items/CompareTable.tsx`, `items/AttunementBars.tsx`, `hub/skills/MoveInspector.tsx`, `hub/skills/ApplyBar.tsx`, `hub/loadout/EquippedPane.tsx`, `hub/loadout/ComparePane.tsx`, `hub/help/help-topics.tsx`, `hub/forge/Temper.tsx`, `hub/forge/ShardPicker.tsx`, `hub/forge/MaterialsPane.tsx`, `hub/SettingsPanel.tsx`, `ManaPanel.tsx`, `controls/ControlsPanel.tsx`
- Modify (`k-caption` that is a sentence → `k-note`): `hub/forge/ForgeBench.tsx` (10 captions), `hub/codex/CodexTab.tsx` (9), `hub/quests/QuestsTab.tsx` (7), `hub/forge/MaterialsPane.tsx` (7; its "None yet: …" lines), `hub/forge/Temper.tsx` (6; the operations' reasons), `hub/skills/SkillStrip.tsx` (3), `hub/loadout/EquippedPane.tsx` (3), and the rest found by `grep -rn "k-caption" packages/client/src/features/delve/hub packages/client/src/features/delve/items`

  Paths are under `packages/client/src/features/delve/` unless they start with `features/`.

- [ ] **Step 1: Sweep, a tab at a time** (Loadout and the item views; Skills, the Mana view and the rune views; Forge; Codex and Quests; the hub's header, footer, Depart sheet, system menu, Settings and Controls). A label stays one line where it was one: if a 16 px label now wraps in a fixed-width cell (a stat table's name column, a stepper's value), widen the cell before shortening the text.
- [ ] **Step 2: Check the tab's tests** after each tab: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/hub/<tab>)`. Expected: PASS (no test reads a size; a test that matches a class, `.k-caption`, follows it to `.k-note`: `grep -rn "k-caption" packages/client/src --include=*.test.tsx` lists them).
- [ ] **Step 3: Commit a tab at a time**, each with `npx vitest related --run <its files>` first:

```bash
git commit -m "style(client): the Loadout's type floor: read text at 18, labels at 16"   # and so on, a tab a commit
```

---

### Task 4: the dive's edges, the start and the Training Grounds

**Files:**
- Modify (`text-[14px]` / `text-[15px]` → 16 or 18): `StopPanel.tsx` (4 + 4), `DiveSummary.tsx`, `tutorial/GuidedChoice.tsx` (2), `ManaChoice.tsx` (2), `tutorial/TutorialPanel.tsx`, `training/TrainingPanel.tsx` (4), `training/MeterView.tsx` (2), `training/TrainingBar.tsx`, `chains/ChainEditor.tsx` (7), `chains/MoveEditor.tsx` (4 + its `text-[15px]`)
- Modify (`text-[16px]` read → 18): `stop/DoorPane.tsx` (5), `stop/StopScreen.tsx` (3), `tutorial/GuidedChoice.tsx` (2), `chains/MoveEditor.tsx` (2), `tutorial/TutorialPanel.tsx`, `tutorial/SkipTutorial.tsx`, `StopPanel.tsx`, `ManaChoice.tsx`, `LegendaryFanfare.tsx`
- Modify (`k-caption` sentences → `k-note`): `stop/StopScreen.tsx` (4), `training/TrainingPanel.tsx` (11), `chains/MoveEditor.tsx` (4), `training/MeterView.tsx` (3), `hub/PauseScreen.tsx` (2), `DiveSummary.tsx` (2), `chains/ChainEditor.tsx` (2)
- Modify: `components/Toast.tsx` (`text-sm`, 14 → `text-[16px]`)

  Paths under `packages/client/src/features/delve/` unless they start with `components/`.

- [ ] **Step 1: Sweep** by the rule. The Training dock is 400 design px wide (`DOCK_WIDTH`): its labels go to 16, never wider than the dock; a row that no longer fits wraps (its `flex-wrap`), and a chip row may take a second line. Do not widen the dock (the HUD grid's `rightWidth` follows it).
- [ ] **Step 2: Check** `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/stop src/features/delve/training src/features/delve/chains src/features/delve/tutorial src/features/delve/__tests__/DiveSummary.test.tsx)`. Expected: PASS.
- [ ] **Step 3: Commit**

```bash
git commit -m "style(client): the stop, the start, the dive summary and the Training Grounds read at 18, labels at 16"
```

---

### Task 5: the HUD

The HUD has its own scale (Settings → HUD scale) and a fixed grid (the 340 design px column, the 600 px dock): its floor is 16, and it takes no 18 except where it already draws larger.

**Files:**
- Modify (`text-[14px]` / `text-[15px]` / `text-[17px]` → 16): `arena/hud/FoundLog.tsx` (3), `arena/hud/PurseBar.tsx` (2 + 1), `arena/hud/LeanCorner.tsx` (2), `arena/hud/FloorColumn.tsx` (2 + 2), `quests/QuestTracker.tsx` (2 + 1 + its `text-[17px]` → 18), `arena/hud/BossBar.tsx`, `arena/hud/BuffRow.tsx`, `arena/hud/SkillDock.tsx`, `arena/hud/SkillTooltip.tsx`, `arena/hud/InteractPlaque.tsx`, `arena/ArenaControls.tsx`
- Modify: `pages/DelveRun.tsx` (the banner's `text-sm` → `text-[16px]`)

- [ ] **Step 1: Sweep.** A skill slot's key glyph is a `k-glyph-sm` (now 16 in its 28 px box): if a slot's glyph no longer fits its corner, give the corner room before shrinking the text.
- [ ] **Step 2: Check** `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/arena/hud src/features/delve/quests)`. Expected: PASS. `FloorColumn.test.tsx` and `SkillDock` tests read text, not sizes.
- [ ] **Step 3: Commit**

```bash
git commit -m "style(client): the HUD's type floor: nothing under 16"
```

---

### Task 6: the gate holds, and the probe's floor rises

**Files:**
- Modify: `packages/client/e2e/delve-type.spec.ts` (remove the `test.fail()`s)
- Modify: `packages/client/e2e/responsive/probes/min-size.ts`

- [ ] **Step 1: TY01 and TY02 pass.**

```bash
(cd packages/client && TYPE_REPORT=1 npx playwright test e2e/delve-type.spec.ts --project=desktop-1080 --reporter=line > "$SCRATCH/type-after.txt" 2>&1; grep "TY " "$SCRATCH/type-after.txt"; tail -n 5 "$SCRATCH/type-after.txt")
```

  Expected: PASS; every screen's smallest is 16. A run still under 16 names its test id and text: find its source (`grep -rn "<text>" packages/client/src`) and sweep it. Text drawn by a kit control's inline style (a `style={{ fontSize: 14 }}`; none at v0.68.0: `grep -rn "fontSize" packages/client/src/features --include=*.tsx`) counts the same. Record the after lines here and in the commit body: the share under 18 is the number the spec's Evidence will quote (expected well under half on each hub tab; not gated, since labels sit at 16 by design).

- [ ] **Step 2: The probe.** In `min-size.ts` set `DELVE_MIN_TEXT_PX = 12` and its comment: "nothing under 16 design px (the pad-first spec's type floor), which is 12 CSS px at the 0.75 zoom floor". The probe's own spec (`probes/__tests__/min-size.spec.ts`) tests the classic floor (8 px) only: unchanged.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e
git commit -m "test(client): the type floor holds: TY01 and TY02 find nothing under 16 design px, and the probes' text floor is 12 CSS px"
```

---

### Task 7: every screen still holds; the plan's run

**Files:**
- Modify: whatever layout the probes flag (a pane that must scroll, a label column to widen)

- [ ] **Step 1: The responsive Delve specs at today's text size** (long: in the background):

```bash
(cd packages/client && npx playwright test --project=responsive e2e/responsive/specs/delve-anvil.spec.ts e2e/responsive/specs/delve-pause.spec.ts e2e/responsive/specs/delve-stop.spec.ts e2e/responsive/specs/delve-dive.spec.ts e2e/responsive/specs/delve-training.spec.ts e2e/responsive/specs/title-screen.spec.ts --reporter=line > "$SCRATCH/resp-01.txt" 2>&1; tail -n 40 "$SCRATCH/resp-01.txt")
```

  Expected: PASS at every PC viewport. A failure is `overflow-x`/`overflow-y` (a row that no longer fits: let it wrap, or let its pane scroll with `k-scroll` and `data-pad-scroll`; never shrink the text back) or `min-size` (a text under 12 CSS px the sweep missed: sweep it). The known flake: `delve-stop` at qhd-1440p and ultrawide: rerun that one alone once.

- [ ] **Step 2: The plan's specs.** (If the same agent does plan 02 next, skip this step: plan 02's last task runs these with its own.)

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run > "$SCRATCH/unit-01.txt" 2>&1; tail -n 15 "$SCRATCH/unit-01.txt")
(cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-hud.spec.ts e2e/delve-quests.spec.ts e2e/delve-runes.spec.ts e2e/delve-training.spec.ts e2e/delve-pad-nav.spec.ts --project=desktop --project=desktop-1080 --reporter=line > "$SCRATCH/e2e-01.txt" 2>&1; tail -n 30 "$SCRATCH/e2e-01.txt")
```

  Expected: the unit suite at the baseline count, all passing; the six specs PASS on both projects. `desktop-1080` and the pad audit run because the sizes move layouts: PN01's stops can't change (no control was added or removed), but a wrap can turn a move unreversed. `ALLOW` must not rise: a new unreversed move is a layout the sweep broke (a row that now wraps under a wider one); read it with `NAV_REPORT=1` and fix the row. Known flakes: D02 and Q01 under load, alone once.

- [ ] **Step 3: Commit** any layout fixes:

```bash
git commit -m "style(client): the screens hold the type floor at every PC size"
```
