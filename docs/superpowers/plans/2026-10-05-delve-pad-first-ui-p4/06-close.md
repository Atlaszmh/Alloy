# Close phase 4 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the pad audit holds the rebuilt Skills tab (the strip and chain, the move editor, the form grid and the Apply sheet: each audited, each with a ceiling, the allowances lowered), PN07 holds the spec's fourth press budget (change a move's element and apply: at most six D-pad presses), the responsive probes cover the editor and the sheet, the whole phase is green at both sizes, and the spec, `CLAUDE.md` and the version say v0.68.0.

**Tech Stack:** Playwright, Vitest.

Read `00-overview.md` first. Plans 01 to 05 are done.

---

### Task 1: the audit's new screens and their ceilings

**Files:**
- Modify: `packages/client/e2e/delve-pad-nav.spec.ts`

- [ ] **Step 1: PN01 walks them.** After `await check(page, 'skills');`:

```ts
    // The move editor over the audit save's Primary (its first card), its form grid, and the
    // Apply sheet over a change.
    await click(page, 'move-0');
    await expect(page.getByTestId('move-editor')).toBeVisible();
    await check(page, 'skills-editor');
    await click(page, 'move-form');
    await expect(page.getByTestId('form-picker')).toBeVisible();
    await check(page, 'skills-forms');
    await page.keyboard.press('Escape'); // the grid's Back
    await expect(page.getByTestId('form-picker')).toHaveCount(0);
    await page.getByTestId('move-kind').press('ArrowRight'); // a change, so the sheet has one
    await page.keyboard.press('Escape'); // the editor's Back
    await expect(page.getByTestId('move-editor')).toHaveCount(0);
    await click(page, 'chain-apply');
    await expect(page.getByTestId('apply-sheet')).toBeVisible();
    await check(page, 'apply-sheet');
    await click(page, 'apply-sheet-discard');
    await expect(page.getByTestId('apply-sheet')).toHaveCount(0);
```

  The audit save is the autopilot's after three dives: its weapon carries the Primary (it forges one before dive 1) and no dive is open, so the editor opens. If `move-kind` is at Hold (no right), press `ArrowLeft`.

- [ ] **Step 2: Measure.** `(cd packages/client && NAV_REPORT=1 npx playwright test e2e/delve-pad-nav.spec.ts -g PN01 --reporter=line > "$SCRATCH/nav.txt" 2>&1)` at both projects; read each of `skills`, `skills-editor`, `skills-forms` and `apply-sheet`'s stop count and unreversed moves in the file. A ragged row (the form grid's short last row) is fine: record it; a leap is a layout bug in plan 02 or 03 (fix it there). Then:
  - `ALLOW.skills`: lower `[2, 4]` to what was measured (never raise it: a rise is a bug to fix first). Add `'skills-editor'`, `'skills-forms'` and `'apply-sheet'` at their measured pairs.
  - `CEILING`: add each at its measured count, with a comment in the file's voice. Expected on the audit save: `skills`: the strip's Realign, the Primary's cards (one stop a move), + Move while a slot is free, + Slot while under five, and Delve: at most 9 (the spec's target, about 10; the footer's Revert and Apply are the mouse's, the strip's tabs LT/RT's). `skills-editor`: Kind, Form, Elements, a row a socket, Open a socket while under the cap, Position (two moves or more) and Payment: 5 to 9 (Back and Remove are B's and X's). `skills-forms`: the slot's forms (their count from `arpg.json`'s Primary forms; Back is B's). `apply-sheet`: Apply, Try in Training, Discard changes and the dialog's Back: 4. A count above these is a stop that should not be there (a detail-pane control without `data-pad-skip`, the card's pips): find it and fix it in the plan that built it.

- [ ] **Step 3: Run the audit at both sizes**

```bash
(cd packages/client && npx playwright test e2e/delve-pad-nav.spec.ts --reporter=line > "$SCRATCH/nav.txt" 2>&1; tail -n 20 "$SCRATCH/nav.txt")
```

  Expected: PASS on `desktop` and `desktop-1080`.

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/delve-pad-nav.spec.ts
git commit -m "test(client): the pad audit holds the Skills strip and chain, the move editor, the form grid and the Apply sheet, with ceilings"
```

---

### Task 2: PN07's fourth budget

**Files:**
- Modify: `packages/client/e2e/delve-pad-nav.spec.ts`

- [ ] **Step 1: The save pays for it.** In `seed`, give the profile Mana Dust for an element edit (the audit save has done three dives, so an edit is no longer free): `let profile = { ...sim, manaDust: sim.manaDust + 500, bag: [...sim.bag, ...bagOf(registry)] };`. Only the Skills price reads it. Add `y: 3` to `BUTTON`.

- [ ] **Step 2: The task,** at PN07's end (after the forge; the test's title gains "change a move's element and apply"):

```ts
    // 4. Change a move's element and apply: LB from the Forge to Skills (the chosen card leads),
    //    A on it, down to Elements, one step, then Y and A.
    await tap(page, BUTTON.lb);
    await expect(page.getByTestId('tab-skills')).toHaveAttribute('aria-selected', 'true');
    const card = '[data-testid^="move-"][data-pad-first]';
    const toCard = await presses(page, card);
    await page.locator(card).focus();
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('move-editor')).toBeVisible();
    await expect(page.getByTestId('move-kind')).toBeFocused(); // the editor's first row
    const toElements = await presses(page, '[data-testid="move-elements"]');
    const els = page.getByTestId('move-elements');
    await els.focus();
    const before = await els.getAttribute('aria-valuetext');
    const last = (await els.getAttribute('aria-valuenow')) === (await els.getAttribute('aria-valuemax'));
    await tap(page, last ? BUTTON.left : BUTTON.right);
    await expect(els).not.toHaveAttribute('aria-valuetext', before!);
    const element = toCard + toElements + 1;
    if (process.env.NAV_REPORT) console.log(`PN07 (${test.info().project.name}): element ${element} (${toCard} + ${toElements} + 1)`);
    expect(element, `change an element: ${toCard} to the card, ${toElements} to Elements, 1 step`).toBeLessThanOrEqual(BUDGET);
    const was = JSON.stringify((await save()).equipped.weapon.moveset.chains.primary);
    await tap(page, BUTTON.y);
    await expect(page.getByTestId('apply-sheet-confirm')).toBeFocused();
    await tap(page, BUTTON.a);
    await expect.poll(async () => JSON.stringify((await save()).equipped.weapon.moveset.chains.primary)).not.toBe(was);
```

  Expected: 0 to the card, 2 to Elements (Kind, Form, Elements), 1 step: 3. What to check:
  - If the sheet's Apply is not focused because Apply is disabled, read `apply-sheet-why`: the Mana Dust (Step 1) or an element set the engine refuses. The stepper offers only sets the move may take (`takesElements`), so the second is a bug in plan 02's `elementSets`.
  - If `move-kind` is not focused after A, the editor's first candidate is something else (a header button without `data-pad-skip`): fix plan 02's editor.

- [ ] **Step 3: Run it**

```bash
(cd packages/client && npx playwright test e2e/delve-pad-nav.spec.ts -g PN07 --reporter=line > "$SCRATCH/pn07.txt" 2>&1; tail -n 15 "$SCRATCH/pn07.txt")
```

  Expected: PASS on both projects.

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/delve-pad-nav.spec.ts
git commit -m "test(client): PN07 holds the press budget for changing a move's element and applying it"
```

---

### Task 3: the responsive probes, and the phase's full run

**Files:**
- Modify: `packages/client/e2e/responsive/specs/delve-anvil.spec.ts`

- [ ] **Step 1: Two probes,** in its viewport loop, beside the Forge's benches:

```ts
  // The Skills tab's move editor with its form grid open (its tallest state), and the Apply sheet.
  for (const view of ['skills-editor', 'apply-sheet'] as const) {
    test(`Delve Anvil ${view} @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seedProfile(page, 4242, false);
      await page.goto('/delve');
      await page.getByTestId('tab-skills').click();
      await page.getByTestId('move-0').click();
      if (view === 'skills-editor') {
        await page.getByTestId('move-form').click();
        await expect(page.getByTestId('form-picker')).toBeVisible();
      } else {
        await stepTo(page, 'move-kind', /^Heavy$/);
        await page.getByTestId('move-editor-back').click();
        await page.getByTestId('chain-apply').click();
        await expect(page.getByTestId('apply-sheet')).toBeVisible();
      }
      await runProbes(`delve-anvil-${view}`, vp, { delve: {} });
    });
  }
```

  The editor's pane scrolls (`k-scroll`, `data-pad-scroll`): an overflow at 1280×720 inside it is the pane's to scroll, not the probe's to loosen; one past the pane (the strip's carried-by lines, the lane's cards at five) is the layout's to fix.

- [ ] **Step 2: The full run** (long: in the background, each into a scratch file; read the summaries)

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run > "$SCRATCH/unit-close.txt" 2>&1; tail -n 15 "$SCRATCH/unit-close.txt")
(cd packages/client && npx playwright test e2e/delve*.spec.ts --reporter=line > "$SCRATCH/e2e-close.txt" 2>&1; tail -n 40 "$SCRATCH/e2e-close.txt")
(cd packages/client && npx playwright test --project=responsive --reporter=line > "$SCRATCH/resp-close.txt" 2>&1; tail -n 40 "$SCRATCH/resp-close.txt")
```

  Expected: the client suite at the overview's baseline plus this phase's files, all passing; every Delve spec on `desktop` and `desktop-1080`; every responsive probe. A known flake (D02, Q01, the economySim timeout under load, responsive `delve-stop` at qhd-1440p and ultrawide): rerun that one alone once (`-g "<name>"`), never the suite. The engine is untouched: no engine run (the tutorial bot only if plan 05's Task 4 ran, and then it ran there).

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/responsive
git commit -m "test(client): the responsive probes cover the move editor and the Apply sheet"
```

---

### Task 4: the spec, the docs and the version

**Files:**
- Modify: `docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md`
- Modify: `CLAUDE.md`
- Modify: `packages/client/package.json`

- [ ] **Step 1: The spec.** Make the overview's eight edits (section 5, rule 1's parenthesis, the Evidence table's Skills row with Task 1's counts, Measures with Task 2's), and in the Phases table set phase 4's plan folder: `docs/superpowers/plans/2026-10-05-delve-pad-first-ui-p4/` (copy these plans there and commit them with the spec if they are not yet in the repo).

- [ ] **Step 2: `CLAUDE.md`,** in its own voice and density, changing only what this phase changed (find each phrase with `grep -n` first):
  - **Weapon movesets:** "whose `ApplyBar` shows its price, **Apply** (all or nothing) and **Revert**; `ChainLane` shows each chain's slots and **Add slot** and a skill the weapon doesn't carry as locked, and `MoveInspector` the off-pair marks" becomes "whose `ApplyBar` shows its price, **Revert** and **Apply**, which opens the Apply sheet (`ApplySheet`: each changed chain before and after with its notes, `draftLines`; the price and what it destroys; **Apply** (all or nothing), **Try in Training** and **Discard changes**; Y or Ctrl+Enter open it too); `ChainLane` shows each chain's slots and **Add slot**, `SkillStrip` a skill the weapon doesn't carry dimmed with what carries it, and the move editor (`MoveRows`) the off-pair marks".
  - **Runes:** "the Skills tab's move cards show their sockets, and `MoveInspector` lists each socket with the picker inline, offering the pouch runes that fit, and the `ApplyBar` shows the draft's price and what it destroys" becomes "the Skills tab's move cards show their sockets (a click opens the move's editor at one), and the move editor lists each socket as a row that opens the rune picker as a grid (`RunePicker`'s `grid`), offering the pouch runes that fit, each with what it does to the chain's damage a second (`damage`), and the Apply sheet shows the draft's price and what it destroys".
  - **Guided start:** after "(`forge.materials` the Materials bench's sub tab, the way to `forge.refine`)" add nothing; after the sentence on `Prompt.tutorial` add: "In the Skills tab the lesson's targets sit on the move editor's rows (the last Primary move's Elements stepper, the first one's Open a socket and socket rows, the rune grid's list) and on the Apply sheet's Apply; with the editor open over a move that holds what the lesson wanted, the marker shows its Back (`wayOut`)."
  - **Training Grounds:** after "or **Load my build** (the equipped weapon's chains, and the sandbox's own for the skills it doesn't carry)" add "; the Anvil's Apply sheet's **Try in Training** loads an unapplied draft the same way (`draftEquipped`: the worn gear with the draft's chains on the weapon) and the Training Grounds' way back opens the Skills tab on the same skill, the draft intact (the router's state: `back` to Training, `link` to the Anvil, `AnvilHub`'s `initial`)".
  - **Client**, the Anvil's **Skills** clause becomes: "**Skills** (`hub/skills/`: `SkillStrip`, the four skills as a kit sub `Tabs` (LT/RT, `[` `]`; an uncarried one dimmed with what carries it; no fight input drawn) and the mana pair, whose Realign opens the Mana view, `ManaPanel.tsx`, in the move pane; `ChainLane`, the chain's move cards, the home row (focus selects one, the chosen one `data-pad-first`; A or a click opens its editor; drag or Alt+← → move one; X or Del removes it), slots, `ChainStats` and `RhythmStrip`; `MoveInspector`, the move pane: the chosen move's detail and numbers (`moveNumbers`, `moveBeat`; no stops), or its editor, `MoveRows` (a nested pad scope: Kind, Elements, Position and the chain's Payment as kit `Stepper`s; Form opening `FormPicker` and each socket the rune picker, grids of what fits, each option with its line and what it does to the chain's damage a second, `dps`/`dpsWith`, `damageShift`; Open a socket with its price; B or Esc back to the card, X remove); the footer's `ApplyBar` and the Apply sheet; `useAnvilChains` drives the builder's `useChainEditor` from `features/delve/chains/`)".
  - **Client**, the prompt runtime's sentence: "the pad's buttons go to the prompts (`padPrompts`) before the menu navigation, and `captureNav` hands the D-pad and A/B/X to a carried card" becomes "the pad's buttons go to the prompts (`padPrompts`) before the menu navigation"; "(`onPress`, or `onHold` for a pad hold at `padHold` (600 ms) or a key `whileHeld`; a tap that shares its button with a hold fires on a release under `TAP_MAX_MS`)" becomes "(`onPress`, or `onHold` for a key `whileHeld`; no prompt is a pad hold)" (only if plan 03 retired the hold; else leave it).
  - **Client**, the bindings list: "LT/RT a nested list (and `[` `]` the Skills list)" becomes "LT/RT a nested list (and `[` `]` the Skills strip)"; "Ctrl+Enter or Y held apply, Del or a tap of Y remove a move" becomes "Ctrl+Enter or Y the Apply sheet, Del or X remove a move".
  - **Controller:** "Reorder and Remove (a tap of Y) or Apply (Y held 600 ms) on Skills" becomes "Remove (X) and the Apply sheet (Y) on Skills"; the D-pad sentence's "and left/right nudge a focused slider, list or stepper" is unchanged.
  - The Weapon movesets paragraph's "the stop shows its power-up cards" and the rest: unchanged.

- [ ] **Step 3: The version.** `packages/client/package.json`: `"version": "0.68.0"`.

- [ ] **Step 4: Nothing reads the old version**

Run: `(cd packages/client && npx vitest run src/pages src/features/delve/hub/__tests__/SettingsPanel.test.tsx)`
Expected: PASS (the version is imported, never hard-coded).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers CLAUDE.md packages/client/package.json
git commit -m "docs: the pad-first spec's phase 4 edits and CLAUDE.md for the skill strip, the move editor, the Apply sheet and Try in Training; chore(client): bump version to 0.68.0"
```
