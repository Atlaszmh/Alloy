# The guided start through the new controls Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the guided start's marker leads every Anvil step this phase touched through the controls it now has: the stepper rows' done rule and a footer prompt as a marked target (unit), lesson 1 end to end (TU01, which plans 01, 04 and 05 kept green step by step), and lesson 2's Transfer and Hone by the pad (a new TU04: the take sheet, Temper's Hone row, the line pick). The engine's tutorial data and play are re-checked once, after every data change of the phase.

**Architecture:** no new code but tests. The marker reads the DOM (`findMarked`): plans 01 to 05 placed the targets (`Prompt.tutorial` on the footer's A and X under the pad, the take sheet's Transfer, the steppers' `data-tutorial-done`, the Materials bench's sub tab and Temper's Hone row). This plan holds them in place.

**Tech Stack:** Vitest (jsdom), Playwright, the engine's Vitest.

Read `00-overview.md` first ("The guided start's targets this phase moves"). Plans 01 to 05 are done.

**Every step this phase touches, and where its test lives:**

| Step | Trail / highlight | Held by |
|---|---|---|
| `l1-forge` | `forge.pattern:cuirass`, `forge.bar`, `forge.flux`, `forge.shard`, `forge.go` | TU01 (the mouse, marker by marker); `marked-trails.test.ts` (Task 1: the steppers' done rule) |
| `l1-equip` | `loadout.bag:chest.uncommon`, `loadout.equip` | TU01 (the pad: the marker on the footer's A, the focus on the tile) |
| `l1-salvage` | `loadout.bag:weapon.common`, `loadout.salvage` | TU01 (the mouse: the pane's Salvage melts at once) |
| `l1-refine` | `forge.refine:rusty` (way `forge.materials`) | TU01 (plan 04's marker checks) |
| `l2-compare` | `loadout.bag:weapon.rare`; highlight `loadout.compare` | TU04 (the verdict block) |
| `l2-transfer` | `loadout.bag:weapon.rare`, `loadout.transfer` | TU04 (the pad: the footer's A, then the take sheet's Transfer) |
| `l2-hone` | `temper.hone`, `temper.line`, `temper.go` | TU04 (the pad: the bench's way, the Hone row, the line pick) |

---

### Task 1: the marker's rules on the new controls

**Files:**
- Test: `packages/client/src/features/delve/tutorial/__tests__/marked-trails.test.ts`
- Test: `packages/client/src/features/delve/tutorial/__tests__/TutorialHighlight.test.tsx`

- [ ] **Step 1: Write the tests.** In `marked-trails.test.ts`'s `describe('findMarked')`, beside the `FORGE` step:

```ts
  const ROWS = step({
    highlight: 'hub.tab.forge',
    trail: ['forge.pattern:cuirass', 'forge.bar', 'forge.flux', 'forge.shard', 'forge.go'],
  });
  /** The Forge bench in rows: the steppers say they are done from the bench's state. */
  const rows = (o: { bar: boolean; flux: boolean }) =>
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="true" data-tutorial="hub.tab.forge"></button>
      <button id="pattern" aria-pressed="true" data-tutorial="forge.pattern:cuirass"></button>
      <div id="flux" role="spinbutton" tabindex="0" data-pad-step
        data-tutorial="forge.flux" data-tutorial-done="${o.flux}"></div>
      <div id="bar" role="spinbutton" tabindex="0" data-pad-step
        data-tutorial="forge.bar" data-tutorial-done="${o.bar}"></div>
      <div id="lines" data-tutorial="forge.shard" data-tutorial-done="false"></div>
      <button id="go" data-tutorial="forge.go"></button>
    </div>`);

  it("walks the bench's stepper rows by their done rule: the bar held, then the flux chosen, then the lines", () => {
    rows({ bar: true, flux: false });
    expect(at(findMarked(ROWS))).toEqual(['forge.flux', 'flux']);
    rows({ bar: true, flux: true });
    expect(at(findMarked(ROWS))).toEqual(['forge.shard', 'lines']);
    // No bar held: the Metal row is the line that says where bars drop, and it is marked.
    rows({ bar: false, flux: false });
    expect(at(findMarked(ROWS))).toEqual(['forge.bar', 'bar']);
  });

  it("under the pad a footer prompt is a marked target: the plain target's last match, after the pane's button", () => {
    page(`<div data-pad-scope>
      <main><button id="pane" data-tutorial="loadout.equip"></button></main>
      <footer><span id="prompt" class="k-prompt" data-tutorial="loadout.equip"></span></footer>
    </div>`);
    expect(at(findMarked(step({ trail: ['loadout.equip'] })))).toEqual(['loadout.equip', 'prompt']);
  });
```

  In `TutorialHighlight.test.tsx` add (the file's harness renders the highlight over a page and sets the device): "under the pad a marked footer prompt leaves the focus where it is (it is no D-pad stop)": a page with a focused tile (`<button id="tile" data-tutorial="loadout.bag:chest.uncommon" aria-pressed="true">`) and a prompt span carrying `loadout.equip`, a step whose trail is `['loadout.bag:chest.uncommon', 'loadout.equip']`, the device `gamepad`: after a frame the marker's `data-target` is `loadout.equip` and `document.activeElement` is still the tile.

- [ ] **Step 2: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial)`
Expected: PASS (the rules are `marked.ts`'s, unchanged; plans 01 to 05 placed the targets). A failure here is a placement bug in the plan that moved that control: fix it there.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/features/delve/tutorial/__tests__
git commit -m "test(client): the marker walks the bench's stepper rows and marks the footer's prompt under the pad"
```

---

### Task 2: TU04, lesson 2 by the pad

**Files:**
- Modify: `packages/client/e2e/delve-tutorial.spec.ts`

- [ ] **Step 1: Write the test.** After TU03 (its `seedProfile`, `installPad`, `marked` and `step` helpers; `generateItem`, `defaultMoveset`, `createDefaultRegistry`, `SeededRNG` from `@alloy/engine`):

```ts
  test("TU04: lesson 2 by the pad: the rare's Transfer through the take sheet, then a Hone on Temper's list", async ({
    page,
  }) => {
    const registry = createDefaultRegistry();
    const rare = generateItem(
      registry,
      { uid: 'grask-axe', ilvl: 5, rarity: 'rare', slot: 'weapon', baseId: 'axe', mana: 'fire' },
      new SeededRNG(5),
    );
    // A save at the lesson's Transfer, Grask's rare in the bag, the scrap for the move and a hone.
    await seedProfile(page, 4242, false, 'frost', {
      scrap: 2000,
      bag: [{ ...rare, moveset: defaultMoveset(registry, rare, 'fire') }],
      tutorial: { step: 'l2-transfer', count: 0, misses: 0 },
    });
    await installPad(page);
    await page.goto('/delve');
    const marker = page.getByTestId('tutorial-highlight');
    const marked = (target: string) => expect(marker).toHaveAttribute('data-target', target);
    await tap(page, BUTTON.down); // the pad takes the input lock

    // The rare's tile first: the marker's focus lands on it, which selects it under the pad.
    await expect(page.locator('[data-uid="grask-axe"]')).toBeFocused();
    await expect(page.getByTestId('item-verdict')).toBeVisible();
    // Then the footer's A, which on this weapon is "Equip or transfer".
    await marked('loadout.transfer');
    await expect(page.locator('.k-prompt[data-tutorial="loadout.transfer"]')).toContainText('Equip or transfer');
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('take-sheet')).toBeVisible();
    // In the sheet, its Transfer: marked and focused.
    await marked('loadout.transfer');
    await expect(page.getByTestId('take-transfer')).toBeFocused();
    await tap(page, BUTTON.a);
    await expect.poll(() => step(page)).toBe('l2-hone');

    // The Hone: the Forge tab, then its Temper bench, then the Hone row, a line and Hone.
    await marked('hub.tab.forge');
    await tap(page, BUTTON.rb);
    await tap(page, BUTTON.rb);
    await marked('forge.temper');
    await tap(page, BUTTON.rt);
    await marked('temper.hone');
    await expect(page.getByTestId('temper-op-hone')).toBeFocused();
    await tap(page, BUTTON.a);
    await marked('temper.line');
    await expect(page.getByTestId('hone-line-0')).toBeFocused();
    await tap(page, BUTTON.a);
    await marked('temper.go');
    await expect(page.getByTestId('hone-button')).toBeFocused();
    await tap(page, BUTTON.a);
    await expect.poll(() => step(page)).toBe('l2-claim');
  });
```

  What to check while writing it:
  - `seedProfile`'s fourth argument binds `frost` (lesson 1 bound the secondary); the axe in `fire` is in the pair, so no bind choice comes first.
  - The Temper bench picks the first worn item when nothing is selected (`ForgeTab`'s `item`): after the transfer that is the axe, which has rare lines to hone. If the hub's memory (plan 04) holds an earlier row, it doesn't here: the save is fresh.
  - If the marker's focus lands on the tile only after a frame, the first `toBeFocused` polls (Playwright's `expect` retries).
  - If `l2-transfer`'s `tutorialHolds` asks for the moveset moved from the starting sword (it reads "the rare equipped with the moveset moved"), the Transfer satisfies it; if the step's filter reads the rare's base (`axe` here; Grask's set weapon in the data may be another base), read `tutorial.json`'s `d2-5` set drop and use its `base` and `rarity` instead.

- [ ] **Step 2: Run it**

Run: `(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts --project=desktop -g TU04)`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/delve-tutorial.spec.ts
git commit -m "test(client): TU04 plays lesson 2's Transfer and Hone by the pad, following the marker"
```

---

### Task 3: the whole guided start, data and play, once more

- [ ] **Step 1: The engine's tutorial tests and the bot** (after every data change of the phase: `forge.materials` in plan 04, `l1-forge`'s trail in plan 05)

Run: `(cd packages/engine && npx vitest run tests/delve-tutorial-data.test.ts tests/delve-tutorial-contract.test.ts tests/delve-tutorial-review.test.ts tests/delve-tutorial-save.test.ts)`
Expected: PASS.

Run (background): `(cd packages/engine && npx vitest run tests/delve-tutorial-bot.test.ts)`
Expected: PASS: every primary with Hesta's partner and the four other pairs over four seeds end done, as at v0.66.0.

- [ ] **Step 2: TU01 to TU04 at both sizes**

Run: `(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts)`
Expected: PASS on `desktop` and `desktop-1080`.

- [ ] **Step 3: The client's tutorial unit tests**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial)`
Expected: PASS (`tutorial-targets.test.tsx` included: every target and trail entry is placed by name; `forge.materials`'s way reaches a hub tab).
