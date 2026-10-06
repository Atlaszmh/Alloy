# Close phase 3 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the pad audit holds the rebuilt Loadout and Forge (a ceiling on each screen's stops, the allowances lowered), a new PN07 holds the spec's press budget for the three everyday tasks this phase touches (equip an upgrade, salvage an item, forge an item: six D-pad presses or fewer each), the responsive specs probe the new screens, the whole suite is green at both sizes, and the spec, `CLAUDE.md` and the version say v0.67.0.

**Architecture:** `delve-pad-nav.spec.ts` gains its new screens in PN01, their ceilings in `CEILING`, and `presses`, a BFS over the page's own `nextFocus` (memory off, as `audit` walks it), for PN07. The Evidence table's targets for Loadout and Temper count one stop per bag item and per gear row; where the measured count is above the target, the spec edit records the count and its reason (the overview's edits 7 and 8).

**Tech Stack:** Playwright, Vitest.

Read `00-overview.md` first. Plans 01 to 06 are done.

---

### Task 1: the audit's new screens and their ceilings

**Files:**
- Modify: `packages/client/e2e/delve-pad-nav.spec.ts`

- [ ] **Step 1: PN01 walks the new screens.** After `await check(page, 'temper');`:

```ts
    await page.getByRole('tab', { name: /Materials/ }).click();
    await check(page, 'materials');
```

  After `await check(page, 'loadout-item');`, the junk sheet when the bag has junk (the audit's bag is the autopilot's three dives plus `bagOf`'s dozen; read `salvage-junk`'s state):

```ts
    if (await page.getByTestId('salvage-junk').isEnabled()) {
      await click(page, 'salvage-junk');
      await expect(page.getByTestId('junk-sheet')).toBeVisible();
      await check(page, 'junk-sheet');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('junk-sheet')).toHaveCount(0);
    }
```

  If it is disabled for this seed, give `bagOf` one common helm whose slot the economy hero wears at a higher rarity (read `economySim(registry, 1, 3).profile.equipped`), so the sheet is always audited; then drop the `if`. After `await check(page, 'system-menu');`:

```ts
    await click(page, 'open-help');
    await expect(page.getByTestId('help-dialog')).toBeVisible();
    await check(page, 'help');
    await page.keyboard.press('Escape'); // back to the menu
```

  (then the existing `open-settings` click and check). Help's stops: its Back (the topics are a kit tab list, off the D-pad); `check` expects more than one stop, so assert Help with `expect(r.stops).toBeGreaterThan(0)` instead: give `check` an optional `min` (default 2) and pass 1 for `help`.

- [ ] **Step 2: Measure.** Run `(cd packages/client && NAV_REPORT=1 npx playwright test e2e/delve-pad-nav.spec.ts -g PN01)` at both sizes. For every screen this phase rebuilt (`loadout`, `loadout-item`, `forge`, `forge-pattern`, `temper`) and every new one (`materials`, `junk-sheet`, `help`), read the stop count and each unreversed move the report prints: a ragged row is fine (record it), a leap is a layout bug in the plan that built that screen (fix it there). Then:
  - `ALLOW`: lower each rebuilt screen's pair to what was measured (never raise one: a rise is a bug to fix first); add `materials`, `junk-sheet` and `help` at their measured pairs.
  - `CEILING`: add each rebuilt and new screen at its measured stop count, and raise `pause-list` from 7 to 8 (plan 03's Help row). The spec's targets, for the record: Loadout about 21, Forge about 14 (with a pattern open), Temper about 15. Expected counts on the audit save (12 bag items): `loadout` 24 (the 7 worn slots, 12 tiles, the sort chip, Equip best, Salvage junk, Auto-salvage, Delve; the filters are a kit tab list and the compare pane has no stops), `forge-pattern` at most 14 (the learned patterns, the three steppers, the Lines, Forge, Delve), `temper` the gear rows plus 6 plus Delve. A count above the expected is a stop that should not be there (a compare-pane button without `data-pad-skip`, a detail panel with a focusable child): find and fix it; a count above the spec's target that is all tiles or rows is overview edit 7 or 8.

- [ ] **Step 3: Run the audit at both sizes**

Run: `(cd packages/client && npx playwright test e2e/delve-pad-nav.spec.ts)`
Expected: PASS on `desktop` and `desktop-1080`.

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/delve-pad-nav.spec.ts
git commit -m "test(client): the pad audit holds the rebuilt Loadout and Forge, the Materials bench, the junk sheet and Help, with ceilings"
```

---

### Task 2: PN07, the press budgets

**Files:**
- Modify: `packages/client/e2e/delve-pad-nav.spec.ts`

- [ ] **Step 1: The measure.** Beside `audit`:

```ts
/**
 * The fewest D-pad presses from the focused control to `selector`'s first match: a BFS over the
 * page's own `nextFocus` with the memory off, as `audit` walks the map (a stepper's left/right
 * step it, so they are no moves). -1 when the target is not reached.
 */
async function presses(page: Page, selector: string): Promise<number> {
  return page.evaluate(async (sel) => {
    const nav = await import('/src/features/gamepad/use-gamepad-nav.ts' as string);
    const target = document.querySelector<HTMLElement>(sel);
    const start = document.activeElement;
    if (!target || !(start instanceof HTMLElement)) return -1;
    const dirs = ['up', 'down', 'left', 'right'] as const;
    const dist = new Map<HTMLElement, number>([[start, 0]]);
    const queue = [start];
    while (queue.length) {
      const el = queue.shift()!;
      if (el === target) return dist.get(el)!;
      for (const d of dirs) {
        if (el.matches('[data-pad-step]') && (d === 'left' || d === 'right')) continue;
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const to = nav.nextFocus(el, d, { memory: false }) as HTMLElement | null;
        if (to && !dist.has(to)) {
          dist.set(to, dist.get(el)! + 1);
          queue.push(to);
        }
      }
    }
    return -1;
  }, selector);
}

/** The spec's press budget: an everyday task in at most this many D-pad presses, plus its face buttons. */
const BUDGET = 6;
```

- [ ] **Step 2: PN07.**

```ts
  test('PN07: the press budgets: equip an upgrade, salvage an item and forge an item, each in six D-pad presses or fewer', async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await page.goto('/delve');
    const save = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
    /** The tab's landing: the pad takes the input lock, and the focus is where the tab puts it. */
    const land = async (selector: string) => {
      await page.locator(selector).first().focus();
      await tap(page, BUTTON.up);
      await page.locator(selector).first().focus();
    };

    // 1. Equip an upgrade: from the Loadout's landing (the bag's first tile) to the first ▲ that
    //    isn't a weapon (A on a weapon may ask through the take sheet), then A.
    await land('[data-testid="bag-item"][data-pad-first]');
    const up = '[data-testid="bag-item"][data-delta="up"]:not([data-tutorial^="loadout.bag:weapon"])';
    const equip = await presses(page, up);
    expect(equip, 'equip an upgrade: D-pad presses').toBeGreaterThanOrEqual(0);
    expect(equip).toBeLessThanOrEqual(BUDGET);
    const uid = await page.locator(up).first().getAttribute('data-uid');
    await page.locator(up).first().focus();
    await tap(page, BUTTON.a);
    await expect.poll(async () => Object.values((await save()).equipped).some((i) => (i as GearItem | undefined)?.uid === uid)).toBe(true);

    // 2. Salvage an item: RT to the Weapons filter, then to the common weapon `bagOf` seeded, X.
    await tap(page, BUTTON.rt);
    await expect(page.getByTestId('bag-filter-weapons')).toHaveAttribute('aria-selected', 'true');
    const junk = '[data-uid="audit-0"]';
    const salvage = await presses(page, junk);
    expect(salvage, 'salvage an item: D-pad presses').toBeGreaterThanOrEqual(0);
    expect(salvage).toBeLessThanOrEqual(BUDGET);
    await page.locator(junk).focus();
    await tap(page, BUTTON.x);
    await expect.poll(async () => (await save()).bag.some((i: GearItem) => i.uid === 'audit-0')).toBe(false);
    // And B takes it back.
    await tap(page, BUTTON.b);
    await expect.poll(async () => (await save()).bag.some((i: GearItem) => i.uid === 'audit-0')).toBe(true);

    // 3. Forge an item: RB twice to the Forge, A on the pattern it lands on, a flux if one is held,
    //    then Forge.
    await tap(page, BUTTON.rb);
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('bench-forge')).toHaveAttribute('aria-selected', 'true');
    const pattern = await presses(page, '[data-testid^="pattern-"][data-pad-first]');
    await page.locator('[data-testid^="pattern-"][data-pad-first]').focus();
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('forge-flux')).toBeFocused();
    const flux = (await page.getByTestId('forge-flux').getAttribute('aria-valuemax')) !== '0' ? 1 : 0;
    if (flux) await tap(page, BUTTON.right);
    const toForge = await presses(page, '[data-testid="forge-button"]');
    const forge = pattern + flux + toForge;
    expect(forge, `forge an item: ${pattern} to the pattern, ${flux} for the flux, ${toForge} to Forge`).toBeLessThanOrEqual(BUDGET);
    const bag = (await save()).bag.length;
    await page.getByTestId('forge-button').focus();
    await tap(page, BUTTON.a);
    await expect.poll(async () => (await save()).bag.length).toBe(bag + 1);
  });
```

  `GearItem` is the spec's existing import. What to check while writing it:
  - The audit save's bag must hold a non-weapon ▲ (the doll has empty slots on an economy hero: a `bagOf` ring or amulet usually is one). If none shows, give `bagOf` an item for a slot the hero leaves empty, read from `economySim(registry, 1, 3).profile.equipped`.
  - `audit-0` is `bagOf`'s first item: a common weapon. Under the Weapons filter it shares the grid with the hero's other weapons only.
  - Forge must not be refused for the landing pattern (scrap and a held bar: the economy save has both). If it is (a full bag: `bagOf` fills it near the cap), salvage one item first in the test's setup, and say so in a comment.
  - The forge route expected: 0 to the landing pattern, 1 for the flux, then down from Flux past Metal, Element and the Lines (0 to 4, by the rarity's line count) to Forge: 4 to 8. Over six means a magic or rarer flux was stepped to (more lines). The test steps once, to the lowest grade held (uncommon: one line), so it should read 5. If it reads more, check the route is the one plan 05 built (A on a pattern lands on Flux; Forge closes the column); if it is, report the number rather than reshape the bench in this plan.

- [ ] **Step 3: Run it**

Run: `(cd packages/client && npx playwright test e2e/delve-pad-nav.spec.ts -g PN07)`
Expected: PASS on both projects; the three counts printed by the assertion messages on failure.

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/delve-pad-nav.spec.ts
git commit -m "test(client): PN07 holds the press budgets for equipping, salvaging and forging"
```

---

### Task 3: the responsive specs

**Files:**
- Modify: `packages/client/e2e/responsive/specs/delve-anvil.spec.ts` (plan 04 added `materials`; plan 05 changed `forge-preview`'s flux)
- Modify: `packages/client/e2e/responsive/specs/delve-pause.spec.ts` (Help over the pause), and the system menu's spec if one exists (`ls e2e/responsive/specs`)

- [ ] **Step 1: Help.** In `delve-anvil.spec.ts` add a test in its viewport loop: open the system menu (Escape), click `open-help`, wait for `help-dialog`, `runProbes('delve-anvil-help', vp, { delve: {} })`. The page's longest topic at 1280×720 must scroll inside its body (`[data-pad-scroll]`), not overflow the dialog.
- [ ] **Step 2: The junk sheet and the take sheet** are probed only if their seeds are cheap: `seedProfile(page, 4242, false, undefined, { bag: [...] })` with two common helms under a worn epic helm opens the junk sheet (`delve-anvil-junk`); skip the take sheet (a two-button dialog, the kit's).
- [ ] **Step 3: Run them**

Run: `(cd packages/client && npx playwright test --project=responsive e2e/responsive/specs/delve-anvil.spec.ts e2e/responsive/specs/delve-pause.spec.ts)`
Expected: PASS. An overflow at 1280×720 is the layout's to fix (the Temper rows' reason column, the bench's rows), not the probe's threshold.

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/responsive
git commit -m "test(client): the responsive probes cover Help, the junk sheet and the Materials bench"
```

---

### Task 4: the whole suite

- [ ] **Step 1: Engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx tsup && npx vitest run)` (long: in the background)
Expected: types clean; the overview's baseline plus `delve-forge-power.test.ts`; all passing (the tutorial bot and the pacing rails included: no balance or rule changed).

- [ ] **Step 2: Client types and unit tests**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: types clean; the overview's baseline plus this phase's; all passing.

- [ ] **Step 3: The Delve E2E at both sizes** (long: in the background, read the report)

Run: `(cd packages/client && npx playwright test e2e/delve*.spec.ts)`
Expected: PASS on `desktop` and `desktop-1080`. D02 alone failing on a loaded machine: rerun it alone (`CLAUDE.md`, Room objects).

- [ ] **Step 4: Every responsive spec**

Run: `(cd packages/client && npx playwright test --project=responsive)`
Expected: PASS.

---

### Task 5: the spec, the docs and the version

**Files:**
- Modify: `docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md`
- Modify: `CLAUDE.md`
- Modify: `packages/client/package.json`

- [ ] **Step 1: The spec.** Make the overview's eleven edits (section 4, the grammar table's right stick row, and the Evidence table's Loadout, Temper and Pause targets with the measured counts from Task 1), and in the Phases table set phase 3's plan folder: `docs/superpowers/plans/2026-10-05-delve-pad-first-ui-p3/` (commit these plans there with the spec if they are not yet).

- [ ] **Step 2: `CLAUDE.md`.** In its own voice and density, changing only what this phase changed:
  - **Weapon movesets:** "which `MovesetView`, the chain builder's locked skill and How to delve show" becomes "… and Help show". "the Loadout's compare pane values a bag weapon both ways and offers **Transfer my moveset here**, and with Shift or LT held shows its moveset" becomes "the Loadout's compare pane values a bag weapon both ways and offers **Transfer my moveset here** (under the pad, A on the weapon opens the take sheet, `TakeSheet`: Equip as it is, or Transfer), and Full compare (R3, or Shift; a toggle) shows its moveset".
  - **Runes:** "the Forge tab's Materials pane holds the pouch and Fuse (`RunePane`)" becomes "the Forge tab's Materials bench holds the pouch and Fuse (`RunePane`)".
  - **Crafting:** "**The Temper bench** (between dives): Upgrade and Re-attune as before, **Reforge** …" keeps its rules; nothing of the UI lives there. "**The shard bench** (`buyShard`) sells a tier I shard of any affix" is unchanged. Add to the paragraph's end of the forge's part: "`forgePowerRange(registry, profile, req)` (`delve/crafting.ts`) is the forge preview's Power against what is worn: the item at the bottom and the top of its bands (the floor applied; random lines left out, `random` counting them), valued by `compareItem` (a weapon as a home)."
  - **Guided start:** after "the targets are `TUTORIAL_TARGETS`", add "(`forge.materials` the Materials bench's sub tab, the way to `forge.refine`)"; after "each control naming one carries `data-tutorial`", add "(a footer prompt too: `Prompt.tutorial`, which the Loadout sets under the pad on its A and X, so the marker sits on the button the player presses; a kit `Stepper` says it is done by its owner's state, as the Forge bench's Metal and Flux rows do: a held bar chosen, a flux chosen)"; `l1-forge`'s trail is not quoted in `CLAUDE.md`: nothing more.
  - **Client**, the Anvil's sentence, its tabs:
    - **Loadout** becomes: "(`hub/loadout/`: `EquippedPane`, the paper doll and the attunement (its two shortcuts, the attunement strip and Skills ›, the mouse's); `BagPane`, the bag's filter tabs (LT/RT, a kit sub `Tabs`), its tiles (▲, ◇, ▼, NEW, the lock; `data-uid`, the kit Tile's `data-delta`), Equip best, Salvage junk (a review sheet, `JunkSheet`: each candidate with what it gives, A keeping one back, Y or Ctrl+Enter salvaging the rest) and auto-salvage; `ComparePane`, the focused, hovered or selected item (a worn one too; the worn weapon when nothing is), led by its verdict (`verdictOf`: an upgrade as it comes, better only as a home for your moveset, worse, about the same), with its Power, stat table, `BindChoice`, and its buttons for the mouse (`data-pad-skip`: under the pad the footer's A equips, X salvages (unequips a worn item), Y locks, R3 toggles Full compare); its body scrolls on the right stick (`data-pad-scroll`). X and Del salvage at once; for `UNDO_MS` (5 s) the store keeps the save from before (`undo`, `undoSalvage`: any other commit ends it) and the footer offers Undo salvage on B or Ctrl+Z.)". The "How to delve" clause there goes.
    - **Codex** gains "and Help (How to delve, a card a topic: `hub/help/`, `HELP_TOPICS`, `HelpPage`)".
    - **Forge** becomes: "(`hub/forge/`: three benches, a sub tab (Forge | Temper | Materials, LT/RT): the Forge bench's `PatternList`, `ForgeBench`'s rows (Flux, Metal and Element, with epic flux Essence: kit `Stepper`s over what the save holds, each with where what it lacks drops, `DROPS_FROM`; a row a line opening the `ShardPicker`; Forge, Enter or A) and its preview (no stops: `previewForge` and the Power range, `forgePowerRange`); the Temper bench's `GearList`, `Temper`'s one list of six operations (Upgrade, Reforge, Hone, Imprint, Re-attune, Awaken), each row the engine's price and, when it can't be done, why on the same row, and the item's detail; the Materials bench's three panels (`MaterialsPane`: bars, flux, shards by family and tier and essences as rows with Refine on the row; the shard bench, an affix stepper and Buy; the rune pouch with Fuse, `RunePane`))". The tab's bench, its gear row and its pattern live in the hub's memory.
    - After the tabs: "Each tab comes back to its selection (the bag's tile and filter, the Forge's bench, pattern and gear row): `useHubTabs` keeps a `HubMemory` box across the tab views' remounts."
    - The system menu's list gains Help ("Resume, Controls, Settings, Help, Title screen"), and the pause's ("Resume, Build and quests, Controls, Settings, Help, …"). "How to delve, `HowTo`, …, to a save off the guided start until Strike the Anvil is claimed" becomes "A Jump in save meets Help once, as its mana is chosen (`DelveCamp`)."
    - **The kit** list gains `Stepper` ("one value of several, stepped by the D-pad's left/right (`PAD_STEP`), the arrow keys or its ◂ ▸").
    - The bindings list: "Del/X salvage" becomes "Del/X salvage (B or Ctrl+Z undoes it for 5 s)"; "Shift/LT held full compare" becomes "Shift/R3 full compare (a toggle)".
  - **Controller:** "left/right nudge a focused slider or list" becomes "left/right nudge a focused slider, list or stepper (`[data-pad-step]`, `PAD_STEP`)"; after "never moves the focus" nothing exists yet, so add after the D-pad sentence: "The right stick scrolls the topmost scope's `[data-pad-scroll]` pane (`STICK_SCROLL_PX`), never the focus." In "X and Y act only as prompts: Salvage and Lock on the Loadout", add "(B Undo salvage while it is offered; R3 Full compare)".

- [ ] **Step 3: The version.** `packages/client/package.json`: `"version": "0.67.0"`.

- [ ] **Step 4: Check nothing reads the old version in a test**

Run: `(cd packages/client && npx vitest run src/pages src/features/delve/hub/__tests__/SettingsPanel.test.tsx)`
Expected: PASS (the version is imported, never hard-coded).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md CLAUDE.md packages/client/package.json
git commit -m "docs: the pad-first spec's phase 3 edits and CLAUDE.md for the Loadout, Undo, Help, the Forge's rows and benches; chore(client): bump version to 0.67.0"
```
