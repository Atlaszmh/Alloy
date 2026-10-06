# The guided start through the move editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** lesson 1's Skills step (`l1-skills`) is led through the editor, marker by marker: the Primary's tab, Add slot, the last card, its Elements row, the editor's way out, the first card, its Open a socket row, its socket row, the rune grid, the way out, Apply, and the sheet's Apply. TU01 follows the marker through all of it.

**What the code already settles** (read, not assumed):
- The trail keeps its six names: `["skills.primary", "skills.addSlot", "skills.elements", "skills.socket", "skills.rune", "skills.apply"]`, highlight `skills.addSlot`. Plans 01 to 03 moved the controls carrying them (the overview's targets table); no target is new, so `TUTORIAL_TARGETS`, `TUTORIAL_KEYED_TARGETS` and `tutorialDataProblems` are untouched, and the line ("Add a slot, set the new move to {secondary}, open a socket on the first move, set the rune in it, then Apply.") still says what to do. **No engine change**, so the tutorial bot is not re-run (the test policy). Task 4 is the fallback if a line must change.
- `findMarked`'s rules need no change. With the editor open (a nested scope), an entry outside it is not on screen and its way (`WAY_TO`: `skills.elements` → `skills.card:last`, `skills.socket` and `skills.rune` → `skills.card:first`, the cards → `skills.primary`) is outside it too, so the entry is passed over; when nothing in the trail or the highlight is in the editor, `wayOut` marks its Back. That is what leads the player out of the last card's editor (Elements done) and into the first card's.
- One order the rules cannot keep: a player who opens the **first** card's editor before buying the slot is shown its socket row (the earlier entries are outside, passed over). Add slot is then off ("Apply or revert this chain first", `slotOffer`), so `findMarked` passes it as disabled; the player socketing and applying first leaves the step at two moves (`tutorialHolds` asks three), after which Add slot is on again and marked, and the bought move copies the last move's elements. The step completes either way. This is accepted, not fixed: a rule that sent the marker out of a view while an earlier entry waited outside it would break the stop's and Temper's pickers, whose openers carry no done flag. Unit Task 1 holds the normal order; nothing holds the other.

**Architecture:** tests only (and the E2E's walk). The marker reads the DOM; the placements are plans 01 to 03's.

**Tech Stack:** Vitest (jsdom), Playwright.

Read `00-overview.md` first ("The guided start's targets this phase moves"). Plans 01 to 04 are done.

**Every target the lesson's step touches, and its test:**

| Entry | Its control now | Done rule | Held by |
|---|---|---|---|
| `skills.primary` | the strip's Primary tab | `aria-selected` | Task 1 |
| `skills.addSlot` | + Slot | the Primary at the lesson's moves | Task 1 |
| `skills.card:last` (way) | the Primary's last card | its elements include the secondary | Task 1 |
| `skills.elements` | the last move's editor's Elements stepper | the same | Task 1 |
| `back` (the way out) | `move-editor-back` | — | Task 1 |
| `skills.card:first` (way) | the Primary's first card | its first socket holds a rune | Task 1 |
| `skills.socket` | the first move's editor's Open a socket row | the move has a socket | Task 1 |
| `skills.rune` | the first move's socket 0 row, then the rune grid's list | the socket holds a rune | Task 1 |
| `skills.apply` | the footer's Apply, then the Apply sheet's Apply | — (applying ends the step) | Task 1, TU01 |

---

### Task 1: the marker's walk through the Skills tab (unit)

**Files:**
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx` (`renderSkills`' `scoped`)
- Rewrite: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx`

- [ ] **Step 1: The harness.** `renderSkills(opts: { mode?; link?; scoped?: boolean })`: with `scoped`, render the `Hub` inside `<div data-pad-scope>`, as the Anvil's `Screen` is, so the editor is a nested scope with a way out. (Only this file passes it: under a scope of its own, the harness's document-wide prompts are inert, and this file presses no prompt.)

- [ ] **Step 2: Write the test.** Replace the file's three tests (their placements are in this walk; keep its `lesson()` and imports, adding `findMarked`, `edit`, `stepTo` and `type Marked`):

```tsx
import { findMarked, type Marked } from '../../../tutorial/marked';
import { edit, renderSkills, stepTo } from './harness';

const STEP = registry.getTutorialData().steps.find((s) => s.id === 'l1-skills')!;
/** What the marker points at: its target, and the marked control's test id (or its nearest). */
const at = (m: Marked | null) =>
  m && [m.id, m.el.closest('[data-testid]')?.getAttribute('data-testid') ?? null];
const marker = () => at(findMarked(STEP));

describe("the Skills tab under Hesta's lesson (l1-skills)", () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    lesson();
    // jsdom has no layout: every element a box on screen, so the scopes and targets are seen.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('the trail is the one this walk follows', () => {
    expect(STEP.trail).toEqual([
      'skills.primary', 'skills.addSlot', 'skills.elements', 'skills.socket', 'skills.rune', 'skills.apply',
    ]);
  });

  it('leads through the editor in order: the slot, the last move in the secondary, out, the first move’s socket and rune, out, Apply, the sheet’s Apply', () => {
    renderSkills({ scoped: true });
    // The Primary is the chosen skill: its tab is done, and Add slot is first.
    expect(screen.getByTestId('chain-skill-primary')).toHaveAttribute('data-tutorial', 'skills.primary');
    expect(marker()).toEqual(['skills.addSlot', 'add-slot']);
    fireEvent.click(screen.getByTestId('add-slot'));
    expect(screen.getByTestId('add-slot')).toHaveAttribute('data-tutorial-done', 'true');

    // The new last move: its card, then its editor's Elements row.
    expect(marker()).toEqual(['skills.card:last', 'move-2']);
    edit(2);
    expect(marker()).toEqual(['skills.elements', 'move-elements']);
    expect(screen.getByTestId('move-elements')).toHaveAttribute('data-tutorial-done', 'false');
    stepTo('move-elements', 'Frost');
    expect(screen.getByTestId('move-elements')).toHaveAttribute('data-tutorial-done', 'true');
    // Nothing more of the step in this editor: its way out.
    expect(marker()).toEqual(['back', 'move-editor-back']);
    fireEvent.click(screen.getByTestId('move-editor-back'));

    // The first move: its card, its Open a socket row, its socket row, the rune grid.
    expect(screen.getByTestId('move-2')).toHaveAttribute('data-tutorial-done', 'true');
    expect(marker()).toEqual(['skills.card:first', 'move-0']);
    edit(0);
    expect(marker()).toEqual(['skills.socket', 'socket-open']);
    fireEvent.click(screen.getByTestId('socket-open'));
    expect(marker()).toEqual(['skills.rune', 'inspect-socket-0']);
    fireEvent.click(screen.getByTestId('inspect-socket-0'));
    expect(marker()).toEqual(['skills.rune', 'rune-picker']);
    fireEvent.click(screen.getByTestId('rune-pick-quick'));
    expect(screen.getByTestId('inspect-socket-0')).toHaveAttribute('data-tutorial-done', 'true');
    expect(marker()).toEqual(['back', 'move-editor-back']);
    fireEvent.click(screen.getByTestId('move-editor-back'));

    // Apply: the footer's, then the sheet's.
    expect(screen.getByTestId('move-0')).toHaveAttribute('data-tutorial-done', 'true');
    expect(marker()).toEqual(['skills.apply', 'chain-apply']);
    fireEvent.click(screen.getByTestId('chain-apply'));
    expect(marker()).toEqual(['skills.apply', 'apply-sheet-confirm']);
    fireEvent.click(screen.getByTestId('apply-sheet-confirm'));
    expect(store().profile.tutorial?.step).not.toBe('l1-skills');
  });

  it("the editor's lesson targets sit on the Primary's moves only: another move's editor, or another skill's, carries none", () => {
    renderSkills({ scoped: true });
    edit(0);
    expect(document.querySelector('[data-tutorial="skills.elements"]')).toBeNull(); // not the last move
    fireEvent.click(screen.getByTestId('move-editor-back'));
    edit(1);
    expect(document.querySelector('[data-tutorial="skills.socket"]')).toBeNull(); // not the first
    fireEvent.click(screen.getByTestId('move-editor-back'));
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    edit(0);
    expect(document.querySelector('[data-tutorial^="skills."]:not([data-tutorial="skills.primary"]):not([data-tutorial="skills.mana"]):not([data-tutorial="skills.apply"])')).toBeNull();
  });
});
```

  What to check while writing it:
  - `lesson()`'s save has three Links and the scrap for one slot (it sets 5 and 500) and Quick I in the pouch; the uncommon sword's socket cap is 1, so after Open a socket the row is gone and the socket row is next. If the sword's cap is higher in the data, the Open row stays, done (`data-tutorial-done="true"`), and is passed over: the walk is the same.
  - The last line reads the step after Apply: `setChains` runs `applyTutorialEvents`, and `tutorialHolds` (three moves, the last in the secondary, a rune in the first) completes `l1-skills`. If the store's `applyDraft` does not route the tutorial events (read `delveStore`'s `applyDraft`: it calls the engine's `setChains`, which emits them), assert `chains().primary.moves.length === 3` instead and leave the step to TU01.
  - A step lands where it says only if each `marker()` is read after React rendered: `fireEvent` is synchronous under testing-library's `act`, so it is.

- [ ] **Step 3: Run it**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx)`
Expected: PASS. A failure here is a placement bug in the plan that moved the control (02 for the editor's rows and the cards' pips, 03 for the sheet): fix it there.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/features/delve/hub/skills/__tests__
git commit -m "test(client): the lesson's marker walks the Skills tab through the move editor and the Apply sheet, in order"
```

---

### Task 2: the client's tutorial tests

**Files:**
- Test: `packages/client/src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx`
- Test: `packages/client/src/features/delve/tutorial/__tests__/marked-trails.test.ts`

- [ ] **Step 1: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial)`
Expected: PASS with no change. `tutorial-targets.test.tsx` checks each target is placed by name in some source file: `'skills.primary'` (`SkillStrip.tsx`), `'skills.elements'`, `'skills.socket'`, `'skills.rune'` (`MoveRows.tsx`), `'skills.apply'` (`ApplyBar.tsx`, `ApplySheet.tsx`), `'skills.mana'` (`SkillStrip.tsx`), `'skills.card:first'` / `'skills.card:last'` (`ChainLane.tsx`). If one fails, the control lost its literal (a computed string): write it out. `marked-trails.test.ts`'s Skills cases are DOM sketches of the rules (a tab, two cards, the elements): still true, unchanged.

---

### Task 3: TU01 follows the marker; TU03's view

**Files:**
- Modify: `packages/client/e2e/delve-tutorial.spec.ts`

- [ ] **Step 1: TU01's Skills.** Replace the clicks plan 02 left (from `await page.getByTestId('chain-skill-primary').click();` to `applyDraft`) with the marker's walk, the way TU01 walks the forge:

```ts
    // The Primary: the marker leads through the editor, entry by entry: the slot, the new move
    // in frost, the way out; the first move's socket and its rune, the way out; Apply, then the
    // sheet's Apply.
    await marked('skills.addSlot');
    await page.getByTestId('add-slot').click();
    await marked('skills.card:last');
    await page.getByTestId('move-2').click();
    await marked('skills.elements');
    await stepTo(page, 'move-elements', /^Frost$/);
    await marked('back');
    await page.getByTestId('move-editor-back').click();
    await marked('skills.card:first');
    await page.getByTestId('move-0').click();
    await marked('skills.socket');
    await page.getByTestId('socket-open').click();
    await marked('skills.rune');
    await page.getByTestId('inspect-socket-0').click();
    await expect(page.getByTestId('rune-picker')).toBeVisible();
    await marked('skills.rune');
    await page.getByTestId('rune-picker').locator('[data-testid^="rune-pick-"]').first().click();
    await marked('back');
    await page.getByTestId('move-editor-back').click();
    await marked('skills.apply');
    await page.getByTestId('chain-apply').click();
    await expect(page.getByTestId('apply-sheet')).toBeVisible();
    await marked('skills.apply');
    await page.getByTestId('apply-sheet-confirm').click();
    await expect.poll(() => step(page)).toBe('l1-salvage');
```

  `marked` is TU01's (`expect(marker).toHaveAttribute('data-target', …)`); `stepTo` is the fixture's (already imported for TU02). The `mana-back` click just before stays (the Mana view was open); after it the Primary is the chosen skill, so the walk starts at Add slot. If the lesson's last move takes "Fire + Frost" as its first frost set in the stepper's order, `/^Frost$/` still finds the single (`stepTo` presses right until it matches; Frost comes before the pairs).

- [ ] **Step 2: TU03.** Its asserts read `ability-readout` (the move pane: absent while the Mana view is up, back after it) and `skills.addSlot` focused: both hold (the pane kept its id; the Mana view still replaces it). Run it; change nothing unless it fails. If "the marker and the focus are on Add slot" fails because the pad's focus lands on the chosen card first (`data-pad-first`), the marker's focus move (once per target) comes after: wait for it with `await expect(page.getByTestId('add-slot')).toBeFocused()` (Playwright retries), as written.

- [ ] **Step 3: Run it**

```bash
(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts --project=desktop --reporter=line > "$SCRATCH/e2e-05.txt" 2>&1; tail -n 20 "$SCRATCH/e2e-05.txt")
```

  Expected: PASS (TU01 to TU04). Layout and stops are untouched by this plan: `desktop` only.

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/delve-tutorial.spec.ts
git commit -m "test(client): TU01 follows the marker through the move editor and the Apply sheet"
```

---

### Task 4: only if a line changes (the engine)

Do this task only if a review of the lesson's Anvil steps finds a `line` or `objective` in `packages/engine/src/data/tutorial.json` naming a control that is gone (none did when this plan was written: `l1-skills`' line names no control; read `l1-bind` and `l2-*` too, which name "the Mana view", "Transfer", "Hone", "Temper", all still there).

- [ ] **Step 1:** Edit the text only (no trail, trigger or target).
- [ ] **Step 2:**

```bash
(cd packages/engine && npx tsc --noEmit -p . && npx tsup)
(cd packages/engine && npx vitest run tests/delve-tutorial-data.test.ts tests/delve-tutorial-contract.test.ts tests/delve-tutorial-review.test.ts tests/delve-tutorial-save.test.ts)
(cd packages/engine && npx vitest run tests/delve-tutorial-bot.test.ts)   # in the background; read the report
```

  Expected: PASS. Then rerun TU01 (Task 3, Step 3).
- [ ] **Step 3: Commit** `docs(engine): the guided start's line for <step> names the move editor` (with the trailer).
