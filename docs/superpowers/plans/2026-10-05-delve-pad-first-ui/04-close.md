# Close phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the pad audit covers the new shell, the whole suite is green at both sizes, and the docs and the version say v0.65.0.

**Architecture:** the existing audit spec gains the Depart sheet as a screen and a scripted walk (PN05); `CLAUDE.md`'s Client and Controller paragraphs are brought up to date; the version is bumped once.

**Tech Stack:** Playwright, Vitest.

Read `00-overview.md` first. Spec: section 2.7. Plans 01 to 03 are done.

---

### Task 1: the audit knows the sheet

**Files:**
- Modify: `packages/client/e2e/delve-pad-nav.spec.ts`

- [ ] **Step 1: PN01.** After the `quests` check and before the system menu's, open the sheet and audit it:

```ts
    await click(page, 'depart-button');
    await expect(page.getByTestId('depart-sheet')).toBeVisible();
    await check(page, 'depart');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('depart-sheet')).toHaveCount(0);
```

  Add `depart: [0, 0]` to `ALLOW`. Run with `NAV_REPORT=1` on both projects; if the sheet's layout leaves unreversed moves, record the measured numbers (read each move first: a ragged row is fine, a leap is a bug to fix in the sheet's layout).

- [ ] **Step 2: Re-record the footer's change.** The hub's screens lost four footer stops. Run PN01 with `NAV_REPORT=1` at both sizes; where a screen's unreversed count fell, lower its `ALLOW` entry to the measured number (the ratchet only goes down). Never raise one without reading the new moves.

- [ ] **Step 3: PN05, the shell by the pad.**

```ts
  test('PN05: Menu opens the system menu, whose list wraps; View opens the Depart sheet and A dives', async ({ page }) => {
    await seed(page);
    await page.goto('/delve');
    await expect(page.getByTestId('depart-button')).toBeVisible();
    await tap(page, BUTTON.up); // the pad takes the input lock

    await tap(page, BUTTON.menu);
    await expect(page.getByTestId('system-menu')).toBeVisible();
    expect((await where(page)).id).toBe('menu-resume');
    // Down from Resume comes back round to it (the dev chips and Back are on the way).
    let presses = 0;
    do {
      await tap(page, BUTTON.down);
      presses++;
    } while ((await where(page)).id !== 'menu-resume' && presses < 12);
    expect((await where(page)).id).toBe('menu-resume');
    expect(presses).toBeGreaterThan(3);
    // And B closes it: no dive began.
    await tap(page, BUTTON.b);
    await expect(page.getByTestId('system-menu')).toHaveCount(0);
    await expect(page).toHaveURL(/\/delve$/);

    // B at the root does nothing.
    await tap(page, BUTTON.b);
    await expect(page.getByTestId('system-menu')).toHaveCount(0);

    await tap(page, BUTTON.view);
    await expect(page.getByTestId('depart-sheet')).toBeVisible();
    expect((await where(page)).id).toBe('delve-button');
    await tap(page, BUTTON.a);
    await expect(page).toHaveURL(/\/delve\/run$/);
  });
```

  `BUTTON` in this spec lacks `b`? It has `a, b, lb, rb, lt, rt` and the D-pad: add `view: 8, menu: 9` (the standard mapping). The seeded save has no dive open and no draft, so Delve is enabled.

- [ ] **Step 4: Run the audit at both sizes**

Run: `(cd packages/client && npx playwright test e2e/delve-pad-nav.spec.ts)`
Expected: PASS on `desktop` and `desktop-1080`.

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/delve-pad-nav.spec.ts
git commit -m "test(client): the pad audit covers the Depart sheet; PN05 walks Menu, the wrapping list, View and A"
```

---

### Task 2: the whole suite

- [ ] **Step 1: Types and unit tests**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: types clean; all passing (the baseline's 1148 plus this phase's).

- [ ] **Step 2: The Delve E2E at both sizes** (long: run it in the background and read the report)

Run: `(cd packages/client && npx playwright test e2e/delve*.spec.ts)`
Expected: PASS on `desktop` and `desktop-1080`. D02 alone failing on a loaded machine: rerun it alone (see `CLAUDE.md`, Room objects).

- [ ] **Step 3: The responsive specs that start a dive**

Run: `(cd packages/client && npx playwright test --project=responsive e2e/responsive/specs/delve-dive.spec.ts e2e/responsive/specs/delve-pause.spec.ts e2e/responsive/specs/delve-stop.spec.ts)`
Expected: PASS (they start the dive through the fixture now). If a hub probe reports the primary action missing, the footer's `depart-button` lost `data-primary-action="delve"`: put it back.

---

### Task 3: the docs and the version

**Files:**
- Modify: `CLAUDE.md`
- Modify: `packages/client/package.json`

- [ ] **Step 1: `CLAUDE.md`.** In the Client paragraph:
  - the prompt runtime's sentence gains: "`PromptBar` draws every footer's prompts in one order (`orderPrompts`: A, X, Y, LB/RB, LT/RT, the sticks, View, Menu, B)";
  - the bindings list: "Enter/Menu delve" becomes "Enter/View the Depart sheet (then Enter or A to delve), Esc/Menu the system menu"; "T/View Training" becomes "T Training";
  - the Anvil's planks sentence becomes: "Its planks (`HubFooter`) hold the tab's prompts and Menu, then one Delve button (`depart-button`, `data-pad-menu`, `data-pad-first`), or a tab's own group (Skills: the `ApplyBar` and a compact Delve). Delve opens the **Depart sheet** (`hub/DepartSheet.tsx`, a kit dialog: the start-depth chips, the tracked quests, the quests to claim, an unapplied draft's Apply or Discard changes & delve, a lesson's hold, then Delve, its first focus, and Training). Esc or Menu opens the one system menu (B does nothing at the hub's root)…";
  - the Quests sentence in the Quests paragraph's client part gains: "the tab opens on the first quest that waits; under the pad A on the open, complete row claims it and the next one opens; **Claim all** (`quest-claim-all`) shows in the journal's head while two or more wait".

  In the Controller paragraph: "View is Training at the Anvil" becomes "View opens the Depart sheet at the Anvil"; after the sentence on `[data-pad-skip]`, add: "a stepped tab's focus lands on its `[data-pad-first]` control when it has one; at an edge, up and down wrap inside a `[data-pad-wrap]` list (the kit `Dialog`'s `wrap`: the system menu)"; "B presses the topmost scope's `[data-pad-back]`, Menu its `[data-pad-menu]`" stays (the hub's own Menu prompt takes Menu first).

  In the Guided start paragraph, where it lists `SkipTutorial`'s places or the hub's Delve block: "the hub's Delve says why a lesson holds it (`lesson-block`…)" becomes "the Depart sheet says why a lesson holds it (`lesson-block`, no "Discard changes & delve" then)"; and `WAY_TO` is mentioned with "Training's way is the footer's Delve".

  Add the spec to the Delve section's spec list: "pad-first UI (the grammar, the Depart sheet, five phases): `docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md`".

  Match the file's voice and density; change only what this phase changed.

- [ ] **Step 2: The version.** `packages/client/package.json`: `"version": "0.65.0"`.

- [ ] **Step 3: Check nothing reads the old version in a test**

Run: `(cd packages/client && npx vitest run src/pages src/features/delve/hub/__tests__/SettingsPanel.test.tsx)`
Expected: PASS (they import the version; none hard-codes it. If one does, it asserts the format, not the number: leave it).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md packages/client/package.json
git commit -m "docs: CLAUDE.md for the pad-first shell; chore(client): bump version to 0.65.0"
```
