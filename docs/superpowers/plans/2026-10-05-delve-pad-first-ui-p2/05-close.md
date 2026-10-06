# Close phase 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the pad audit covers the stop's two steps and the pause list (with a ceiling on their stops), the responsive specs probe the new screens, the whole suite is green at both sizes, and the spec, the docs and the version say v0.66.0.

**Architecture:** the audit spec gains a seed at a stop (a dive whose first floor is cleared, as `delve-runes.spec.ts` R03 builds one) and a walk, PN06; `check` gains a per-screen ceiling on stops (the spec's Measures); the responsive specs gain a probe after each new step; `CLAUDE.md` is brought up to date in its own voice; the version is bumped once.

**Tech Stack:** Playwright, Vitest.

Read `00-overview.md` first. Plans 01 to 04 are done.

---

### Task 1: the audit knows the stop and the pause list

**Files:**
- Modify: `packages/client/e2e/delve-pad-nav.spec.ts`

- [ ] **Step 1: The seed at a stop.** Import `beginFloor`, `completeFloor` and `startDive` from `@alloy/engine` (the spec's `startDive` fixture is not imported here, so the names don't clash; if they do, alias the engine's as `engineStartDive`). Give `seed` an optional second argument:

```ts
/**
 * A mid-game save (three dives of the autopilot) with a filled bag, and a fake pad to press; with
 * `atStop`, its next dive's first floor cleared, so it opens at the stop (its bag offers Equip).
 */
async function seed(page: Page, atStop = false): Promise<void> {
  const registry = createDefaultRegistry();
  const sim = economySim(registry, 1, 3).profile;
  let profile = { ...sim, bag: [...sim.bag, ...bagOf(registry)] };
  if (atStop) {
    profile = startDive(registry, profile, 1);
    profile = completeFloor(registry, profile, beginFloor(registry, profile)).profile;
  }
  const save = JSON.stringify(profile);
  // … the init script as now, with `save`
}
```

- [ ] **Step 2: A ceiling on stops.** Beside `ALLOW`:

```ts
/**
 * The most D-pad stops a rebuilt screen may hold (the pad-first spec's Measures: the Evidence
 * table's targets as each screen is rebuilt). The stop's road holds the finds line, up to three
 * doors and Extract (the seeded hero's life is full: no potion).
 */
const CEILING: Record<string, number> = {
  'stop-powerup': 4,
  'stop-road': 5,
  'pause-list': 7,
};
```

  and in `check`, after the stops expectation: `if (CEILING[name]) expect(r.stops, `${name}: at most ${CEILING[name]} stops`).toBeLessThanOrEqual(CEILING[name]);`. Add to `ALLOW`: `'stop-powerup': [0, 0], 'stop-road': [0, 0], 'pause-list': [0, 0]`. Add `x: 2, menu: 9` to the spec's `BUTTON` if phase 1 did not (it added `view` and `menu` for PN05).

- [ ] **Step 3: PN06.**

```ts
  test('PN06: the stop by the pad: the cards, X to the road, B back; Menu opens the pause list on Resume, B resumes', async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, true);
    await page.goto('/delve/run');
    const stop = page.getByTestId('door-choice');
    await expect(stop).toBeVisible({ timeout: 30_000 });
    // The stop wakes ARM_MS after it mounts.
    await expect(stop.locator('main > div')).not.toHaveAttribute('inert', '');
    await tap(page, BUTTON.up); // the pad takes the input lock
    await stop.locator('[data-pad-first]').focus();
    expect((await where(page)).id).toMatch(/^stop-(equip|slot|move|upgrade|rune)$/);
    await check(page, 'stop-powerup');

    await tap(page, BUTTON.x);
    await expect(stop.getByTestId('stop-road')).toBeVisible();
    expect((await where(page)).id).toMatch(/^door-/);
    await check(page, 'stop-road');

    await tap(page, BUTTON.b);
    await expect(stop.getByTestId('stop-powerup')).toBeVisible();
    expect((await where(page)).id).toMatch(/^stop-/);

    await tap(page, BUTTON.menu);
    await expect(page.getByTestId('pause-screen')).toBeVisible();
    expect((await where(page)).id).toBe('pause-resume');
    await check(page, 'pause-list');
    // Down from the last row comes back round (the list wraps, its Back included).
    let presses = 0;
    do {
      await tap(page, BUTTON.down);
      presses++;
    } while ((await where(page)).id !== 'pause-resume' && presses < 10);
    expect((await where(page)).id).toBe('pause-resume');
    await tap(page, BUTTON.b);
    await expect(page.getByTestId('pause-screen')).toHaveCount(0);
    await expect(stop.getByTestId('stop-powerup')).toBeVisible();
  });
```

  If `completeFloor` refuses the unplayed generated floor in this save (R03's hero is not this one), build the floor as R03 does and read the refusal: the fallback is `seedProfile` and the bot (`localStorage['alloy:delve:autopilot'] = '1'` in the init script) with `FLOOR_CLEAR` to reach the stop, and `test.setTimeout(240_000)`.

- [ ] **Step 4: Re-measure the changed screens.** Settings gained the HUD row (plan 03): run `(cd packages/client && NAV_REPORT=1 npx playwright test e2e/delve-pad-nav.spec.ts)` at both sizes. For `settings` and each new entry, read every unreversed move the report prints: a ragged row is fine (record the number in `ALLOW`), a leap is a bug in the screen's layout to fix. The ratchet only goes down: never raise an existing entry without reading the moves.

- [ ] **Step 5: Run the audit at both sizes**

Run: `(cd packages/client && npx playwright test e2e/delve-pad-nav.spec.ts)`
Expected: PASS on `desktop` and `desktop-1080`.

- [ ] **Step 6: Commit**

```bash
git add packages/client/e2e/delve-pad-nav.spec.ts
git commit -m "test(client): the pad audit covers the stop's two steps and the pause list, with a ceiling on stops; PN06 walks them"
```

---

### Task 2: the responsive specs

**Files:**
- Modify: `packages/client/e2e/responsive/specs/delve-stop.spec.ts`, `delve-pause.spec.ts`, `delve-dive.spec.ts`

- [ ] **Step 1: The stop's road.** After `runProbes('delve-stop', …)`:

```ts
    await toRoad(page);
    await runProbes('delve-stop-road', vp, { delve: {} });
```

  (`toRoad` from `../../fixtures/delve`.) Step 1's reachability probe finds the first card's `data-primary-action="powerup"`, step 2's the first door's `door`.

- [ ] **Step 2: The paused hub.** After `runProbes('delve-pause', …)`:

```ts
    await page.getByTestId('pause-build').click();
    await expect(page.getByTestId('pause-hub')).toBeVisible();
    await runProbes('delve-pause-hub', vp, { delve: {} });
```

- [ ] **Step 3: The full HUD too.** The dive spec now probes the lean HUD (the default). Add a second test in its loop, the same with `await useFullHud(page);` after `seedProfile` and the screen name `delve-dive-full`.

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx playwright test --project=responsive e2e/responsive/specs/delve-dive.spec.ts e2e/responsive/specs/delve-pause.spec.ts e2e/responsive/specs/delve-stop.spec.ts)`
Expected: PASS. A failure at 1280×720 on the road row (an overflow) is the layout's to fix (`DoorPane`'s short-screen classes), not the probe's threshold.

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/responsive
git commit -m "test(client): the responsive probes cover the stop's road, the paused hub and the full HUD"
```

---

### Task 3: the whole suite

- [ ] **Step 1: Types and unit tests**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: types clean; all passing (the overview's baseline plus this phase's).

- [ ] **Step 2: The Delve E2E at both sizes** (long: run it in the background and read the report)

Run: `(cd packages/client && npx playwright test e2e/delve*.spec.ts)`
Expected: PASS on `desktop` and `desktop-1080`. D02 alone failing on a loaded machine: rerun it alone (`CLAUDE.md`, Room objects).

- [ ] **Step 3: Every responsive spec that starts a dive or opens the Anvil**

Run: `(cd packages/client && npx playwright test --project=responsive)`
Expected: PASS.

---

### Task 4: the spec, the docs and the version

**Files:**
- Modify: `docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md`
- Modify: `CLAUDE.md`
- Modify: `packages/client/package.json`

- [ ] **Step 1: The spec.** Make the overview's seven edits in section 3 (the potion; the pause's B; the risk line; the finds line on both steps; the camera's insets; the peek under the full HUD; the notices), and in the Phases table set phase 2's plan folder: `docs/superpowers/plans/2026-10-05-delve-pad-first-ui-p2/` (or wherever these plans were committed; if they were not, commit them there now with the spec).

- [ ] **Step 2: `CLAUDE.md`.** In its own voice and density, changing only what this phase changed:
  - The **Client** paragraph's bindings list: after "in the fight C/A interact", add ", M or D-pad up the peek".
  - The **dive**'s sentence (`pages/DelveRun.tsx`): before "the top bar is `PurseBar`", say: "Settings → HUD picks the lean HUD (the default) or the full one (`uiStore.hudMode`, `alloy:delve:hud`). The lean HUD's top left is the gain feed (`arena/hud/GainFeed.tsx`, its model `gain-feed.ts`: each pickup a line for `FEED_MS`, a kind's gains merging into its showing line, at most `FEED_MAX`, then a fade; while the fight is live every toast is a line too, `routeToasts` in `components/Toast.tsx`), its top right `LeanCorner` (the depth, the `Minimap`, the first tracked quest's next objective, the `QuestTracker`'s `compact`, and Map, Journal and Menu for the mouse), and its corner takes no camera inset (`HudGrid`'s `insetRight`), so the camera centres on the hero. The full HUD is today's:" and keep the rest. After the camera's sentence, add: "**The peek** (`peek`: D-pad up, M, or the HUD's Map, `data-pad-peek`, `pressPeek`) toggles `PeekOverlay` over the running fight: the large map (`Minimap`'s `large`) and, under the lean HUD, the purse and the floor's finds; it is inert and takes no pointer (`.delve-peek`), and whatever pauses the fight closes it."
  - The **pause**'s sentence becomes: "Esc or Menu opens **the pause** (`hub/PauseScreen.tsx`: a short list in a kit dialog that wraps for the pad, `pause-screen`: Resume, Build and quests, Controls, Settings, the guided start's skips, Anvil · floor restarts (its unbanked haul lost) and Abandon · counts as a death, beside the dive's state: the depth, the rooms explored, what is banked, the death-loss line and the tracked objective; its Back, B, Esc and Menu resume. Build and quests opens the hub's tabs read-only, the Forge locked (`pause-hub`), where B and Esc return to the list and Menu resumes), and J or View opens that hub on Quests, a Found-log click on its item."
  - The **stop**'s sentence becomes: "After each depth **the stop** (`stop/StopScreen.tsx`, a bare header over the arena) asks in two steps. Its header: "Depth N cleared", the risk line ("Banked this dive · dying loses 40% of it", from `deathLoss`) and the finds line ("26 scrap bounty · 18 materials · 1 rune · ▲ 1 upgrade waiting", `findsSummary`), which opens the floor's finds as a sheet (an item in it opens the pause on that item). Step 1, while a power-up is on offer: the cards (`StopPanel.tsx`: each expands in place to its picker, its own scope), A taking, X or S skipping (not a guided stop's required one, which holds the step). Step 2, the road (`stop/DoorPane.tsx`): the doors, each with its cost and its gain on their own lines (`doorTerms`), Extract, and the potion while life is below full and one is left; B or Backspace goes back to the cards while nothing was taken. A Menu opens the pause over it; Y does nothing there."
  - The **Controller** paragraph: the default list gains "D-pad up the peek"; "In the fight Menu and View click the topmost scope's `[data-pad-menu]` and `[data-pad-journal]` (`pressMenu`, `pressJournal` in `arena/input.ts`)" gains "and D-pad up its `[data-pad-peek]` (`pressPeek`)"; in the list of what X and Y do as prompts, "Inspect and Skip at the stop" becomes "Skip at the stop (X; B goes back to the cards)".
  - The **Guided start** paragraph: "the stop disables its doors, Extract and Skip while a required power-up waits (`roads-held`)" becomes "the stop holds its first step while a required power-up waits (Skip disabled, `roads-held`)".

- [ ] **Step 3: The version.** `packages/client/package.json`: `"version": "0.66.0"`.

- [ ] **Step 4: Check nothing reads the old version in a test**

Run: `(cd packages/client && npx vitest run src/pages src/features/delve/hub/__tests__/SettingsPanel.test.tsx)`
Expected: PASS (the version is imported, never hard-coded).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md CLAUDE.md packages/client/package.json
git commit -m "docs: the pad-first spec's phase 2 edits and CLAUDE.md for the stop, the pause list, the lean HUD and the peek; chore(client): bump version to 0.66.0"
```
