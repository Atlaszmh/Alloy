# Delve pad navigation and guidance · 03: trails — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guided step may name a trail of targets, and the marker shows the first one still to do, a way to it, or the way out of a view left open over it, so Hesta's marker leads every click of a multi-click step.
**Architecture:** The engine only carries and checks the trail (`TutorialStep.trail`, the schema, `tutorialDataProblems`, `tutorial.json`); no rule and no bot reads it. The client's one rule, `findMarked` in `features/delve/tutorial/marked.ts`, reads the DOM of the topmost pad scope: a control names its target with `data-tutorial` (`<target>` or `<target>:<key>`) and says it is done with an attribute it sets from state it already holds (`aria-selected`, `aria-pressed`, `aria-checked` or `data-tutorial-done`, each `"true"`). Plan 02's marker calls `findMarked(step)` every frame and is not edited here.
**Tech Stack:** TypeScript 5.7, React 19, Zod 3, Vitest 3, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-04-delve-pad-nav-guidance-design.md` (authoritative): section 2.3 whole, and in section 3 the `findMarked` unit tests, the engine tests, TU01 following the marker and the stuck state. Sections 1.x, 2.1, 2.2 and 2.4 are plans 01 and 02. The overview is `00-overview.md`.

---

## Base

- **Starts from:** branch `padnav` with plans 01 and 02 done (every task committed, green). This plan was drafted against `da69a3b0` while 01 and 02 were being written, from their contracts in the overview and from what 02's drafter confirmed:
  - `features/delve/tutorial/marked.ts` exports exactly `WAY_TO`, `findTarget`, `Marked`, `findWay`, `findMarked`. Task 5 replaces the whole file.
  - The marker (`TutorialHighlight`) keeps `data-testid="tutorial-highlight"` and sets `data-target` to `marked.id` every frame (removed while nothing is marked). It runs for every current step, with or without a `highlight`.
  - Under the pad it focuses the first D-pad candidate that is the marked element or inside it, once each time `` `${step.id}:${marked.id}` `` or the marked element's pad scope changes (so a picker that carries its field's target takes the focus as it opens).
  - `useTutorialStep()` is exported from `tutorial/tutorial-view.ts`.
  - 02 writes `tutorial/__tests__/marked.test.tsx` (today's `findWay` / `findMarked`). This plan adds its own file beside it and must leave 02's green.
  - 02 creates `e2e/fixtures/pad.ts` (`BUTTON`, `installPad`, `frames`, `tap`), imports it in `e2e/delve-tutorial.spec.ts`, and TU01's `fresh()` installs the resting pad.
  - The strip holds a finished objective for 700 ms: the E2E here reads the step from the save and the marker's `data-target`, never from the objective's text.
- **Anchors:** every "Replace" block below quotes the file as it is at `da69a3b0`. Files this plan edits that 01 or 02 also edit: `kit/controls.tsx` and `kit/types.ts` (01: `data-pad-skip` on `Tabs`), `tutorial/__tests__/tutorial-targets.test.tsx` (02: the `WAY_TO` import path), `e2e/delve-tutorial.spec.ts` (02: the strip, the stop, a beat by the pad). The quoted blocks are chosen away from those edits; if one no longer matches, find the same lines by their test id and apply the same change.
- **What the draft was run against:** Tasks 1 to 15's edits were applied in order to a scratch copy of `da69a3b0`, with a stand-in for 02's `useTutorialStep` (02's `marked.ts` is replaced whole by Task 5). There: the engine's data test passed (17 tests), the bot test passed (42), the client typechecked, and the tutorial's, the hub's, the runes' and the stop's client tests passed. `findMarked` was also called on the real page at 1280×800 and 1920×1080 after every click of `l1-bind` into `l1-skills` (the way out included), `l1-forge`, `l1-equip` and `l2-hone`, and returned the trail's next entry each time; with the Temper bench open at `l1-forge` it returned the Forge sub tab (`forge.bench`), and with no shard held it went from the flux straight to `forge.go`. Not run: the E2E's marker and pad assertions (TU03, TU01), which need 01's and 02's code.
- **Before Task 1:**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: no type errors, every test passing (the counts 02 ended on).

## Files

| File | Change |
|---|---|
| `packages/engine/src/types/tutorial.ts` | seven new targets in `TUTORIAL_TARGETS` (six of the spec's table, and `forge.bench`, the Forge sub tab); `TUTORIAL_KEYED_TARGETS`, `TutorialKeyedTarget`, `TutorialTrailTarget`; `TutorialStep.trail` (Task 1) |
| `packages/engine/src/data/tutorial-schema.ts` | `trail` on `TutorialStepSchema` (Task 1) |
| `packages/engine/src/data/tutorial-check.ts` | the trail's checks (Task 2) |
| `packages/engine/src/data/tutorial.json` | 15 `trail` arrays (Task 3) |
| `packages/engine/tests/delve-tutorial-data.test.ts` | the `trails` tests (Tasks 1 to 3) |
| `packages/client/src/features/delve/tutorial/marked.ts` | rewritten: keyed `findTarget`, `isDone`, `findWay` by the done rule, `WAY_TO`'s new ways, `findMarked` over the trail, the way out (Tasks 5, 6) |
| `packages/client/src/features/delve/tutorial/__tests__/marked-trails.test.ts` (new) | the rule's unit tests (Tasks 5, 6) |
| `packages/client/src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx` | the new targets allowed until placed, then required; trail entries and ways placed (Tasks 3, 5, 15) |
| `packages/client/src/features/delve/kit/types.ts`, `kit/controls.tsx` | `Segmented` options take `tutorial` (Task 7) |
| `.../hub/forge/ForgeTab.tsx`, `PatternList.tsx`, `ForgeBench.tsx` | `forge.bench` on the Forge sub tab, `forge.pattern:<base>`, `forge.bar:<metal>`, `forge.flux:<grade>`, the Lines field's done (Task 7) |
| `.../hub/forge/ShardPicker.tsx` | `heldShards`: the picker's list as a function, which the bench asks too (Task 7) |
| `.../hub/forge/MaterialsPane.tsx`, `Temper.tsx` | `forge.refine:<metal>`; `temper.line`, `temper.go` (Task 8) |
| `.../hub/quests/QuestsTab.tsx` | `quests.done` (Task 9) |
| `.../hub/loadout/BagPane.tsx` | `loadout.bag:<slot>.<rarity>` (Task 10) |
| `.../ManaPanel.tsx` | `mana.bind`'s done, `mana.confirm` (Task 11) |
| `.../hub/skills/ChainLane.tsx` | `skills.card:first` / `:last`, `skills.addSlot`'s and `skills.socket`'s done (Task 12) |
| `.../hub/skills/MoveInspector.tsx`, `.../runes/RunePicker.tsx` | `skills.elements` on the last move with its done, `skills.rune` on the socket row and the picker (Task 13) |
| `.../StopPanel.tsx` | `stop.card:<kind>`, `stop.pick` (Task 14) |
| the component tests beside them, and `.../hub/skills/__tests__/SkillsTab.trail.test.tsx` (new) | one test a control (Tasks 7 to 14) |
| `packages/client/e2e/delve-tutorial.spec.ts` | TU03, the stuck state, on 02's fake pad (Tasks 4, 11); TU01 follows the marker (Task 16) |

`...` is `packages/client/src/features/delve`. The engine's `src/index.ts` needs no edit: it already exports `./types/index.js` whole, and `types/index.ts` exports `./tutorial.js` whole. `TutorialHighlight.tsx`, `TutorialPanel.tsx`, the bot and every engine rule stay as they are.

## Where the spec left room

1. **The keyed table lives in the engine** as `TUTORIAL_KEYED_TARGETS` (target → what its key names). `forge.pattern`, `forge.bar`, `forge.flux` and `forge.refine` stay plain targets too (the whole list or field, as today); `loadout.bag`, `skills.card` and `stop.card` are keyed only, so never a `highlight`. `skills.card` is in the table (its `first` / `last` are checked) though only the client's `WAY_TO` uses it; the engine does not refuse it in a trail.
2. **A `stop.card` key is checked against its own step's `stop.kinds`**, which is stricter than "a stop kind" and needs no second list of kinds in the data layer.
3. **Done is the string `"true"`** on any of the four attributes. React writes `data-tutorial-done={false}` as `"false"`, so presence alone can't be the test.
4. **`temper.hone` and `stop.card` need no done attribute.** "Hone is open" and "open or taken" both mean the control is no longer in the topmost scope, and neither has a way, so the walk passes them over by itself.
5. **The way out is offered only for a step that has a trail or a `highlight`.** A step that marks nothing anywhere marks no Back either.
6. **Only a done way is passed over**, as today's selected tab is. A disabled way (a hub tab in the pause) is still marked, as today.
7. **`skills.rune` sits on the move's first socket row**, done when any socket of the move holds a rune (the engine's own test in `tutorialHolds`).
8. **`quests.done` is the first `complete` quest in `questStates`' order**, which is the journal's display order (main, side, the board by slot).
9. **The Lines field is also done when no shard held fits the item.** The lesson's forge needs no shard (its trigger is the slot and the rarity), and the spec's "a line holds a shard" alone would lead a hero without one from the field into an empty picker, out by the way out, and round again. The bench asks the list the shard picker offers (`heldShards`, lifted out of `ShardPicker` unchanged: no new engine call), so the marker goes on to Forge.
10. **The stuck state's save holds 3 Links**, so Add slot can be bought and is marked. Without them Add slot is disabled, passed over, and the marker rightly goes to the elements.
11. **The targets test's source scan leaves `marked.ts` out**, or every name in `WAY_TO` would count as placed on a control.
12. **A card is done as a way by more than being selected.** The spec's table says "selected", but `skills.elements` and `skills.rune` are on screen only while their move is selected: with the first move selected for its socket, the finished elements entry is off screen and its way (the last card) unselected, so the marker bounced between the two cards (seen on the real page while drafting). Each card therefore also sets `data-tutorial-done` from the draft it already draws: the last when its move holds the secondary, the first when its move holds a rune. The rule is unchanged: a done way is passed over.
13. **`forge.bench`, a target the spec does not have** (the coordinator's addition): the Forge tab's "Forge" sub tab. With the Temper bench open during `l1-forge` no entry of the trail is on screen and their only way, the hub tab, is selected already, so nothing useful was marked. The bench's five controls now go `forge.bench` → `hub.tab.forge`; `forge.refine` keeps the tab alone, since the Materials pane sits beside both benches (`ForgeTab.tsx` renders `MaterialsPane` outside the bench switch).

## Targets

Every target of the spec's table. "Exists" is at `da69a3b0`. Paths are under `packages/client/src/features/delve`.

| Target | File and element | Done |
|---|---|---|
| `quests.done` | `hub/quests/QuestsTab.tsx`: the `QuestRow` button of the first `status === 'complete'` quest | `data-tutorial-done={on}` (the row is open) |
| `quests.claim` | exists: the Claim `Button` | never |
| `forge.pattern:<base>` | `hub/forge/PatternList.tsx`: each learned pattern's row button (the `Panel` keeps `forge.pattern`) | its `aria-pressed` (exists) |
| `forge.bar:<metal>` | `hub/forge/ForgeBench.tsx`: each Metal `Segmented` option, through the kit's new per-option `tutorial` | its `aria-checked` (exists) |
| `forge.flux:<grade>` | same, each Flux option but None | its `aria-checked` (exists) |
| `forge.bench` (not in the spec's table: decision 13) | `hub/forge/ForgeTab.tsx`: the Forge sub tab, through the kit `Tabs`' per-tab `tutorial`. A way only: to `forge.pattern`, `forge.bar`, `forge.flux`, `forge.shard` and `forge.go` | its `aria-selected` (exists) |
| `forge.shard` | exists twice: the bench's Lines `Field`, and `ShardPicker`'s root inside the `shard-pick` scope | the `Field`: `data-tutorial-done`, a line holds a shard or no shard held fits the item (`heldShards`, decision 9); the picker: never |
| `forge.go` | exists: Forge | never |
| `forge.refine:<metal>` | `hub/forge/MaterialsPane.tsx`: a bar row's Refine `Button` (the Bars section keeps `forge.refine`) | never |
| `loadout.bag:<slot>.<rarity>` | `hub/loadout/BagPane.tsx`: every bag `ItemTile` (`findTarget` takes the first) | the tile's `aria-pressed` (exists: `selected`) |
| `loadout.equip`, `loadout.salvage`, `loadout.transfer` | exist: the compare pane's buttons | never |
| `mana.bind` | exists: `ManaPanel.tsx`'s `bind-section` | `data-tutorial-done={binding !== null}` |
| `mana.confirm` | `ManaPanel.tsx`: the `mana-bind-confirm` `Button` | never |
| `skills.primary` | exists: the Primary's row in `SkillList` | its `aria-selected` (exists) |
| `skills.addSlot` | exists: `hub/skills/ChainLane.tsx`'s `add-slot` | `data-tutorial-done={entries.length >= Number(step?.trigger.filter?.moves)}`, `step` from `useTutorialStep()` |
| `skills.card:first`, `skills.card:last` | `ChainLane.tsx`: the Primary's first and last card buttons (`data-card`) | their `aria-pressed` (exists), or `data-tutorial-done`: the first move holds a rune, the last move the secondary (decision 12) |
| `skills.elements` | `hub/skills/MoveInspector.tsx`: the elements section, now only while the Primary's last move is selected | `data-tutorial-done`: the move holds the pair's secondary |
| `skills.socket` | exists: `ChainLane.tsx`'s `sockets-0` span (empty, so not on screen, unless the card is selected or has a socket) | `data-tutorial-done={socketsOf(e).length > 0}` |
| `skills.rune` | `MoveInspector.tsx`: the first socket row, only while the Primary's first move is selected; `runes/RunePicker.tsx`: its list of runes, through a new `tutorial` prop the inspector passes | the row: `data-tutorial-done`, a socket of the move holds a rune; the picker: never |
| `skills.apply` | exists: Apply | never |
| `temper.hone` | exists: `hub/forge/Temper.tsx`'s `hone-open` | none needed (decision 4) |
| `temper.line` | `Temper.tsx`: a new `div` round the picker's lines, a target while the op is Hone | `data-tutorial-done={line !== null}` |
| `temper.go` | `Temper.tsx`: the picker's confirm `Button`, a target while the op is Hone | never |
| `stop.card:<kind>` | `StopPanel.tsx`: each power-up card button | none needed (decision 4) |
| `stop.pick` | `StopPanel.tsx`: a new `div` round the open picker's body, inside the `stop-picker` scope | never |

## Conventions

The overview's. In short:

- **One commit per task** on `padnav`, staged by path, never `git add -A`. Every message ends with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Don't push, don't merge.
- **Every command runs from the repo root** (`/c/Projects/Alloy`) in Git Bash, in a subshell.
- **The engine is bundled:** after any edit under `packages/engine/src`, `(cd packages/engine && npx tsup)` before the client reads it.
- **How the edits read:** "In `f`:" names the file. "Replace:" (a block) "with:" (a block) is one Edit; blocks hold whole lines and each old block is unique in its file. "Create `f`:" is a Write. Keep each file's own line endings (the Edit tool does).
- **Prettier:** the code below is formatted for it (100 columns). If in doubt, `npx prettier --check <file>` from the repo root.
- **No game logic in the client.** A control declares done from state its component already holds; nothing here keeps a list of done predicates.

| What | Command |
|---|---|
| Engine build | `(cd packages/engine && npx tsup)` |
| The trail's engine tests | `(cd packages/engine && npx vitest run tests/delve-tutorial-data.test.ts)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| The tutorial's client tests | `(cd packages/client && npx vitest run src/features/delve/tutorial)` |
| The tutorial's E2E | `(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts --project=desktop)` |

---

## Chunk 1: The engine

### Task 1: The trail on a step, the new targets and the keyed table

**Files:**
- Modify: `packages/engine/src/types/tutorial.ts`, `packages/engine/src/data/tutorial-schema.ts`
- Test: `packages/engine/tests/delve-tutorial-data.test.ts`

- [ ] **Step 1: The failing test**

In `packages/engine/tests/delve-tutorial-data.test.ts`:

Replace:
```ts
import type { TutorialData, TutorialStep } from '../src/types/tutorial.js';
```
with:
```ts
import type { StopKind } from '../src/types/delve.js';
import {
  TUTORIAL_KEYED_TARGETS,
  type TutorialData,
  type TutorialStep,
} from '../src/types/tutorial.js';
```

Append at the end of the file:
```ts

// See the pad navigation and guidance spec, 2.3: a step's trail, carried and checked.
describe('trails', () => {
  /** An Anvil step with `trail` (any strings: the checks name the bad ones). */
  const anvil = (...trail: string[]): TutorialStep => ({
    id: 'forge',
    where: 'anvil',
    line: 'Forge it.',
    objective: 'Forge',
    trigger: { type: 'forge', count: 1 },
    trail: trail as TutorialStep['trail'],
  });
  /** A stop step offering `kinds`, with `trail`. */
  const atStop = (kinds: StopKind[], ...trail: string[]): TutorialStep => ({
    ...STEP,
    where: 'stop',
    marker: undefined,
    gate: undefined,
    stop: { kinds, doors: ['winding'], extract: false },
    trail: trail as TutorialStep['trail'],
  });

  it('the schema takes a trail of names (never an empty one), and the new targets as highlights', () => {
    const step = (s: object) => ok({ ...rawTutorial, steps: [{ ...STEP, ...s }] });
    expect(step({ trail: ['quests.done', 'forge.pattern:cuirass'] })).toBe(true);
    expect(step({ trail: [] })).toBe(false);
    expect(step({ trail: [''] })).toBe(false);
    expect(step({ trail: 'quests.done' })).toBe(false);
    for (const t of [
      'quests.done',
      'mana.confirm',
      'skills.rune',
      'forge.bench',
      'temper.line',
      'temper.go',
      'stop.pick',
    ])
      expect(step({ highlight: t })).toBe(true);
    // One control among several is never a highlight.
    for (const t of ['loadout.bag', 'skills.card', 'stop.card'])
      expect(step({ highlight: t })).toBe(false);
    expect(TUTORIAL_KEYED_TARGETS).toEqual({
      'forge.pattern': 'base',
      'forge.bar': 'metal',
      'forge.flux': 'flux',
      'forge.refine': 'metal',
      'loadout.bag': 'slotRarity',
      'skills.card': 'end',
      'stop.card': 'stopKind',
    });
  });
});
```

(`anvil` and `atStop` are used from Task 2 on.)

- [ ] **Step 2: Run it, and see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-tutorial-data.test.ts)`
Expected: FAIL in "the schema takes a trail…": `expected false to be true` (the strict schema refuses the unknown `trail` key). The other tests of the file pass.

- [ ] **Step 3: The types**

In `packages/engine/src/types/tutorial.ts`:

Replace:
```ts
  'stop.risk',
  'hub.tab.loadout',
```
with:
```ts
  'stop.risk',
  'stop.pick',
  'hub.tab.loadout',
```

Replace:
```ts
  'forge.go',
  'forge.temper',
```
with:
```ts
  'forge.go',
  'forge.bench',
  'forge.temper',
```

Replace:
```ts
  'temper.hone',
  'skills.mana',
  'mana.bind',
  'skills.primary',
```
with:
```ts
  'temper.hone',
  'temper.line',
  'temper.go',
  'skills.mana',
  'mana.bind',
  'mana.confirm',
  'skills.primary',
```

Replace:
```ts
  'skills.socket',
  'skills.apply',
  'quests.claim',
```
with:
```ts
  'skills.socket',
  'skills.rune',
  'skills.apply',
  'quests.done',
  'quests.claim',
```

Replace:
```ts
export type TutorialTarget = (typeof TUTORIAL_TARGETS)[number];
```
with:
```ts
export type TutorialTarget = (typeof TUTORIAL_TARGETS)[number];

/**
 * The targets that are one control among several, named `<target>:<key>`, and
 * what each key is: a gear base's id, a metal's id, a flux grade,
 * `<slot>.<rarity>`, `first` or `last`, or a stop's power-up kind
 * (`tutorialDataProblems` checks each against the data).
 */
export const TUTORIAL_KEYED_TARGETS = {
  'forge.pattern': 'base',
  'forge.bar': 'metal',
  'forge.flux': 'flux',
  'forge.refine': 'metal',
  'loadout.bag': 'slotRarity',
  'skills.card': 'end',
  'stop.card': 'stopKind',
} as const;
export type TutorialKeyedTarget = keyof typeof TUTORIAL_KEYED_TARGETS;

/** An entry of a step's trail: a target, or one control of a keyed target (`forge.pattern:cuirass`). */
export type TutorialTrailTarget = TutorialTarget | `${TutorialKeyedTarget}:${string}`;
```

Replace:
```ts
  highlight?: TutorialTarget;
  /** A reading beat: the arena pauses until Continue (`ack`). */
```
with:
```ts
  highlight?: TutorialTarget;
  /**
   * The clicks of an Anvil, Training or stop step, in order: the client marks
   * the first still to do, then the `highlight`. Carried and checked only: no
   * rule reads it.
   */
  trail?: TutorialTrailTarget[];
  /** A reading beat: the arena pauses until Continue (`ack`). */
```

- [ ] **Step 4: The schema**

In `packages/engine/src/data/tutorial-schema.ts`:

Replace:
```ts
    highlight: z.enum(TUTORIAL_TARGETS).optional(),
```
with:
```ts
    highlight: z.enum(TUTORIAL_TARGETS).optional(),
    // Each entry's target and key are `tutorialDataProblems`'.
    trail: z.array(z.string().min(1)).min(1).optional(),
```

- [ ] **Step 5: Run it, and see it pass**

Run: `(cd packages/engine && npx vitest run tests/delve-tutorial-data.test.ts)`
Expected: PASS, every test of the file.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
git add packages/engine/src/types/tutorial.ts packages/engine/src/data/tutorial-schema.ts packages/engine/tests/delve-tutorial-data.test.ts
git commit -m "feat(engine): a guided step's trail, its new targets and the keyed ones" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: The trail's checks

**Files:**
- Modify: `packages/engine/src/data/tutorial-check.ts`
- Test: `packages/engine/tests/delve-tutorial-data.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-tutorial-data.test.ts`, inside `describe('trails', …)`, after the test Task 1 added (before the describe's closing `});`), add:
```ts

  it('passes the known targets, and the keys the data holds', () => {
    expect(
      steps(
        anvil(
          'quests.done',
          'quests.claim',
          'forge.pattern',
          'forge.pattern:cuirass',
          'forge.bar:rusty',
          'forge.flux:uncommon',
          'forge.refine:iron',
          'loadout.bag:chest.uncommon',
          'skills.card:last',
        ),
      ),
    ).toEqual([]);
    expect(steps(atStop(['equip'], 'stop.card:equip', 'stop.pick'))).toEqual([]);
  });

  it('names an unknown target, and a key on a target that takes none', () => {
    expect(steps(anvil('forge.anvil'))).toEqual(['forge: no target forge.anvil']);
    expect(steps(anvil('forge.anvil:big'))).toEqual(['forge: no target forge.anvil']);
    // A keyed-only target without its key is no target.
    expect(steps(anvil('loadout.bag'))).toEqual(['forge: no target loadout.bag']);
    expect(steps(anvil('quests.claim:first'))).toEqual(['forge: quests.claim takes no key']);
  });

  it('names a key the data lacks', () => {
    expect(steps(anvil('forge.pattern:spoon'))).toEqual(['forge: no forge.pattern spoon']);
    expect(steps(anvil('forge.bar:tin'))).toEqual(['forge: no forge.bar tin']);
    expect(steps(anvil('forge.refine:tin'))).toEqual(['forge: no forge.refine tin']);
    expect(steps(anvil('forge.flux:common'))).toEqual(['forge: no forge.flux common']);
    expect(steps(anvil('loadout.bag:chest'))).toEqual(['forge: no loadout.bag chest']);
    expect(steps(anvil('loadout.bag:hat.rare'))).toEqual(['forge: no loadout.bag hat.rare']);
    expect(steps(anvil('loadout.bag:chest.shiny'))).toEqual(['forge: no loadout.bag chest.shiny']);
    expect(steps(anvil('loadout.bag:chest.rare.x'))).toEqual([
      'forge: no loadout.bag chest.rare.x',
    ]);
    expect(steps(anvil('skills.card:middle'))).toEqual(['forge: no skills.card middle']);
    // A stop card's key is a kind its own stop offers.
    expect(steps(atStop(['equip'], 'stop.card:move'))).toEqual(['walk: no stop.card move']);
    expect(steps(anvil('stop.card:equip'))).toEqual(['forge: no stop.card equip']);
  });

  it('names a trail on a floor step', () => {
    expect(steps({ ...STEP, trail: ['quests.claim'] })).toEqual([
      'walk: a trail on an Anvil, Training or stop step',
    ]);
  });
```

- [ ] **Step 2: Run them, and see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-tutorial-data.test.ts)`
Expected: FAIL in the last three (`expected [] to deeply equal [ 'forge: no target forge.anvil' ]` and the like). "passes the known targets…" passes already.

- [ ] **Step 3: The checks**

In `packages/engine/src/data/tutorial-check.ts`:

Replace:
```ts
import { TUTORIAL_INPUTS, type TutorialStep } from '../types/tutorial.js';
import type { DataRegistry } from './registry.js';
```
with:
```ts
import type { StopKind } from '../types/delve.js';
import { GEAR_SLOTS, RARITY_ORDER } from '../types/gear.js';
import {
  TUTORIAL_INPUTS,
  TUTORIAL_KEYED_TARGETS,
  TUTORIAL_TARGETS,
  type TutorialKeyedTarget,
  type TutorialStep,
} from '../types/tutorial.js';
import type { DataRegistry } from './registry.js';
```

Replace:
```ts
/**
 * `tutorial.json`'s steps checked against the floors and the other data
```
with:
```ts
/** Whether `key` names one of `target`'s controls: a thing of its kind in the data (a stop card: a kind `s`'s stop offers). */
function keyKnown(
  registry: DataRegistry,
  s: TutorialStep,
  target: TutorialKeyedTarget,
  key: string,
): boolean {
  switch (TUTORIAL_KEYED_TARGETS[target]) {
    case 'base':
      return registry.getDelveData().bases.some((b) => b.id === key);
    case 'metal':
      return registry.getCraftingData().metals.some((m) => m.id === key);
    case 'flux':
      return registry.getCraftingData().flux.some((f) => f.grade === key);
    case 'slotRarity': {
      const [slot, rarity, more] = key.split('.');
      return (
        more === undefined &&
        (GEAR_SLOTS as readonly string[]).includes(slot) &&
        (RARITY_ORDER as readonly string[]).includes(rarity)
      );
    }
    case 'end':
      return key === 'first' || key === 'last';
    case 'stopKind':
      return !!s.stop?.kinds.includes(key as StopKind);
  }
}

/** What is wrong with one entry of `s`'s trail, or null: an unknown target, a key on a target that takes none, or a key the data lacks. */
function trailProblem(registry: DataRegistry, s: TutorialStep, entry: string): string | null {
  const known = (t: string) => (TUTORIAL_TARGETS as readonly string[]).includes(t);
  const at = entry.indexOf(':');
  if (at < 0) return known(entry) ? null : `no target ${entry}`;
  const target = entry.slice(0, at);
  const key = entry.slice(at + 1);
  if (!Object.hasOwn(TUTORIAL_KEYED_TARGETS, target))
    return known(target) ? `${target} takes no key` : `no target ${target}`;
  return keyKnown(registry, s, target as TutorialKeyedTarget, key) ? null : `no ${target} ${key}`;
}

/**
 * `tutorial.json`'s steps checked against the floors and the other data
```

Replace:
```ts
 * only known tokens. One line a problem; `createDefaultRegistry` refuses data
 * with any.
```
with:
```ts
 * only known tokens; a trail only on an Anvil, Training or stop step, each
 * entry a known target, a key only on a keyed one (`TUTORIAL_KEYED_TARGETS`)
 * and present in the data. One line a problem; `createDefaultRegistry` refuses
 * data with any.
```

Replace:
```ts
    check(s, s.where === 'stop' || !s.stop, 'a stop on a stop step');
```
with:
```ts
    check(s, s.where === 'stop' || !s.stop, 'a stop on a stop step');
    check(s, s.where !== 'floor' || !s.trail, 'a trail on an Anvil, Training or stop step');
    for (const entry of s.trail ?? []) {
      const problem = trailProblem(registry, s, entry);
      if (problem) problems.push(`${s.id}: ${problem}`);
    }
```

- [ ] **Step 4: Run them, and see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-tutorial-data.test.ts)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
git add packages/engine/src/data/tutorial-check.ts packages/engine/tests/delve-tutorial-data.test.ts
git commit -m "feat(engine): check a guided step's trail against the targets and the data" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: The trails in `tutorial.json`

**Files:**
- Modify: `packages/engine/src/data/tutorial.json`, `packages/client/src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx`
- Test: `packages/engine/tests/delve-tutorial-data.test.ts`

- [ ] **Step 1: The failing test**

In `packages/engine/tests/delve-tutorial-data.test.ts`, inside `describe('trails', …)`, after the last test, add:
```ts

  it("ships the spec's trails, each on its step, and they pass the checks", () => {
    const claim = ['quests.done', 'quests.claim'];
    const pick = (kind: string) => [`stop.card:${kind}`, 'stop.pick'];
    const shipped = Object.fromEntries(
      data.steps.flatMap((s) => (s.trail ? [[s.id, s.trail]] : [])),
    );
    expect(shipped).toEqual({
      's1-equip': pick('equip'),
      's2-move': pick('move'),
      's4-upgrade': pick('upgrade'),
      'l1-claim': claim,
      'l1-forge': [
        'forge.pattern:cuirass',
        'forge.bar:rusty',
        'forge.flux:uncommon',
        'forge.shard',
        'forge.go',
      ],
      'l1-equip': ['loadout.bag:chest.uncommon', 'loadout.equip'],
      'l1-bind': ['mana.bind', 'mana.confirm'],
      'l1-skills': [
        'skills.primary',
        'skills.addSlot',
        'skills.elements',
        'skills.socket',
        'skills.rune',
        'skills.apply',
      ],
      'l1-salvage': ['loadout.bag:weapon.common', 'loadout.salvage'],
      'l1-refine': ['forge.refine:rusty'],
      'l1-claim2': claim,
      'l2-compare': ['loadout.bag:weapon.rare'],
      'l2-transfer': ['loadout.bag:weapon.rare', 'loadout.transfer'],
      'l2-hone': ['temper.hone', 'temper.line', 'temper.go'],
      'l2-claim': claim,
    });
    expect(tutorialDataProblems(registry)).toEqual([]);
  });
```

- [ ] **Step 2: Run it, and see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-tutorial-data.test.ts)`
Expected: FAIL: `expected {} to deeply equal { 's1-equip': […], … }`.

- [ ] **Step 3: The trails**

In `packages/engine/src/data/tutorial.json`, fifteen edits, each adding one `trail` under a step's `highlight`. Nothing else of a step changes.

Replace:
```json
      "objective": "Take Equip",
      "highlight": "stop.powerup",
```
with:
```json
      "objective": "Take Equip",
      "highlight": "stop.powerup",
      "trail": ["stop.card:equip", "stop.pick"],
```

Replace:
```json
      "objective": "Take Adjust a move",
      "highlight": "stop.powerup",
```
with:
```json
      "objective": "Take Adjust a move",
      "highlight": "stop.powerup",
      "trail": ["stop.card:move", "stop.pick"],
```

Replace:
```json
      "line": "Welcome back! Quests pay out here at the Anvil: claim what you finished.",
      "objective": "Claim your completed quests",
      "highlight": "quests.claim",
```
with:
```json
      "line": "Welcome back! Quests pay out here at the Anvil: claim what you finished.",
      "objective": "Claim your completed quests",
      "highlight": "quests.claim",
      "trail": ["quests.done", "quests.claim"],
```

Replace:
```json
      "objective": "Forge an uncommon cuirass",
      "highlight": "hub.tab.forge",
```
with:
```json
      "objective": "Forge an uncommon cuirass",
      "highlight": "hub.tab.forge",
      "trail": [
        "forge.pattern:cuirass",
        "forge.bar:rusty",
        "forge.flux:uncommon",
        "forge.shard",
        "forge.go"
      ],
```

Replace:
```json
      "objective": "Equip the cuirass",
      "highlight": "loadout.equip",
```
with:
```json
      "objective": "Equip the cuirass",
      "highlight": "loadout.equip",
      "trail": ["loadout.bag:chest.uncommon", "loadout.equip"],
```

Replace:
```json
      "objective": "Bind a second element",
      "highlight": "mana.bind",
```
with:
```json
      "objective": "Bind a second element",
      "highlight": "mana.bind",
      "trail": ["mana.bind", "mana.confirm"],
```

Replace:
```json
      "objective": "Add a slot, set {secondary}, socket the rune, Apply",
      "highlight": "skills.addSlot",
```
with:
```json
      "objective": "Add a slot, set {secondary}, socket the rune, Apply",
      "highlight": "skills.addSlot",
      "trail": [
        "skills.primary",
        "skills.addSlot",
        "skills.elements",
        "skills.socket",
        "skills.rune",
        "skills.apply"
      ],
```

Replace:
```json
      "objective": "Salvage the old sword",
      "highlight": "loadout.salvage",
```
with:
```json
      "objective": "Salvage the old sword",
      "highlight": "loadout.salvage",
      "trail": ["loadout.bag:weapon.common", "loadout.salvage"],
```

Replace:
```json
      "objective": "Refine an Iron bar",
      "highlight": "forge.refine",
```
with:
```json
      "objective": "Refine an Iron bar",
      "highlight": "forge.refine",
      "trail": ["forge.refine:rusty"],
```

Replace:
```json
      "line": "More quests done. Claim them before you go.",
      "objective": "Claim your completed quests",
      "highlight": "quests.claim",
```
with:
```json
      "line": "More quests done. Claim them before you go.",
      "objective": "Claim your completed quests",
      "highlight": "quests.claim",
      "trail": ["quests.done", "quests.claim"],
```

Replace:
```json
      "objective": "Take Upgrade",
      "highlight": "stop.powerup",
```
with:
```json
      "objective": "Take Upgrade",
      "highlight": "stop.powerup",
      "trail": ["stop.card:upgrade", "stop.pick"],
```

Replace:
```json
      "objective": "Continue",
      "highlight": "loadout.compare",
```
with:
```json
      "objective": "Continue",
      "highlight": "loadout.compare",
      "trail": ["loadout.bag:weapon.rare"],
```

Replace:
```json
      "objective": "Transfer your moveset",
      "highlight": "loadout.transfer",
```
with:
```json
      "objective": "Transfer your moveset",
      "highlight": "loadout.transfer",
      "trail": ["loadout.bag:weapon.rare", "loadout.transfer"],
```

Replace:
```json
      "objective": "Hone a line",
      "highlight": "temper.hone",
```
with:
```json
      "objective": "Hone a line",
      "highlight": "temper.hone",
      "trail": ["temper.hone", "temper.line", "temper.go"],
```

Replace:
```json
      "line": "Claim what you finished down there.",
      "objective": "Claim your completed quests",
      "highlight": "quests.claim",
```
with:
```json
      "line": "Claim what you finished down there.",
      "objective": "Claim your completed quests",
      "highlight": "quests.claim",
      "trail": ["quests.done", "quests.claim"],
```

- [ ] **Step 4: Run it, and see it pass**

Run: `(cd packages/engine && npx vitest run tests/delve-tutorial-data.test.ts)`
Expected: PASS.

- [ ] **Step 5: Rebuild the engine, and play the guided start again**

The data changed; play must not. The bot test is the slowest of the tutorial's files (it plays the whole guided start for ten pairs over four seeds: 42 tests, about 10 s on the drafting machine; allow more under load).

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx tsup)
(cd packages/engine && npx vitest run tests/delve-tutorial-bot.test.ts)
(cd packages/engine && npx vitest run tests/delve-tutorial)
```

Expected: tsup's "Build success" lines; the bot test PASS, 42 tests as before; every `delve-tutorial-*` file PASS.

- [ ] **Step 6: The client's targets test, red on the seven new targets**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx)`
Expected: FAIL in two tests: "every target is placed by name" lists `stop.pick`, `forge.bench`, `temper.line`, `temper.go`, `mana.confirm`, `skills.rune`, `quests.done`; "every step's target is on the screen…" lists the six of them behind the hub's tabs (no way yet).

- [ ] **Step 7: Allow them until their tasks place them**

The seven are placed by Tasks 7 to 14 and get their ways in Task 5; until then the test names them as pending. It also stops counting a name in `marked.ts`'s `WAY_TO` as a control.

In `packages/client/src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx`:

Replace:
```ts
  .filter((f) => /\.tsx?$/.test(f) && !/__tests__|\.test\./.test(f))
```
with:
```ts
  // `marked.ts` names targets as ways, not on controls.
  .filter((f) => /\.tsx?$/.test(f) && !/__tests__|\.test\.|tutorial[\\/]marked\.ts$/.test(f))
```

Replace:
```ts
const placed = (t: string) => sources.some((s) => s.includes(`'${t}'`) || s.includes(`"${t}"`));
```
with:
```ts
const placed = (t: string) => sources.some((s) => s.includes(`'${t}'`) || s.includes(`"${t}"`));
/** The trails' new targets, until plan 03's tasks place them (Task 15 empties and removes this). */
const PENDING: TutorialTarget[] = [
  'stop.pick',
  'forge.bench',
  'temper.line',
  'temper.go',
  'mana.confirm',
  'skills.rune',
  'quests.done',
];
```

Replace:
```ts
    const named = TUTORIAL_TARGETS.filter((t) => !t.startsWith('hub.tab.') && t !== 'temper.hone');
```
with:
```ts
    const named = TUTORIAL_TARGETS.filter(
      (t) => !t.startsWith('hub.tab.') && t !== 'temper.hone' && !PENDING.includes(t),
    );
```

Replace:
```ts
    const behind = TUTORIAL_TARGETS.filter((t) => !/^(hud|stop|hub)\./.test(t));
```
with:
```ts
    const behind = TUTORIAL_TARGETS.filter(
      (t) => !/^(hud|stop|hub)\./.test(t) && !PENDING.includes(t),
    );
```

- [ ] **Step 8: Run the client's checks**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run src/features/delve/tutorial)
```

Expected: no type errors; PASS. If "every target is placed by name" now lists a target that is not in `PENDING`, it was named only in `WAY_TO`: stop and report it, don't add it to `PENDING`.

- [ ] **Step 9: Commit**

```bash
cd /c/Projects/Alloy
git add packages/engine/src/data/tutorial.json packages/engine/tests/delve-tutorial-data.test.ts packages/client/src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx
git commit -m "feat(engine): the guided start's trails, one for each multi-click step" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 2: The rule

### Task 4: The stuck state, failing

A save seeded at the lesson's bind. After the bind the Mana view stays open over the next step's controls; today the marker goes dark and the pad is held in the view.

**Files:**
- Modify: `packages/client/e2e/delve-tutorial.spec.ts`

The fake pad is plan 02's: `e2e/fixtures/pad.ts` (`BUTTON`, `installPad`, `frames`, `tap`), already imported by this spec (`import { BUTTON, installPad, tap } from './fixtures/pad';`, under the `./fixtures/delve` import).

- [ ] **Step 1: The failing test**

In `packages/client/e2e/delve-tutorial.spec.ts`:

Replace:
```ts
import { ARENA_READY, SAVE_KEY } from './fixtures/delve';
```
with:
```ts
import { ARENA_READY, SAVE_KEY, seedProfile } from './fixtures/delve';
```

Replace:
```ts
  test('TU02: a Jump in save has only the Basic until its first forge gives it a Primary', async ({
```
with:
```ts
  test('TU03: a view left open over the next step shows its way out, and the pad follows the marker', async ({
    page,
  }) => {
    // A save at the lesson's bind, with the Links the next step's slot costs.
    await seedProfile(page, 4242, false, undefined, {
      links: 3,
      tutorial: { step: 'l1-bind', count: 0, misses: 0 },
    });
    await installPad(page);
    await page.goto('/delve');
    const marker = page.getByTestId('tutorial-highlight');
    const marked = (target: string) => expect(marker).toHaveAttribute('data-target', target);

    // The bind lives in the Skills tab's Mana view: the marker leads there, way by way.
    await marked('hub.tab.skills');
    await page.getByTestId('tab-skills').click();
    await marked('skills.mana');
    await page.getByTestId('mana-realign').click();
    await marked('mana.bind');
    await page.getByTestId('mana-bind-frost').click();

    // The pad takes over on the confirm: A binds, and the step moves on with the view still up.
    await page.getByTestId('mana-bind-confirm').focus();
    await tap(page, BUTTON.a);
    await expect.poll(() => step(page)).toBe('l1-skills');
    await expect(page.getByTestId('mana-view')).toBeVisible();
    await expect(page.getByTestId('ability-readout')).toHaveCount(0);
    // Nothing of the next step is in the view: the marker shows the way out, with the focus on it.
    await marked('back');
    await expect(page.getByTestId('mana-back')).toBeFocused();

    // One A later the inspector is back, and the marker and the focus are on Add slot.
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('mana-view')).toHaveCount(0);
    await expect(page.getByTestId('ability-readout')).toBeVisible();
    await marked('skills.addSlot');
    await expect(page.getByTestId('add-slot')).toBeFocused();
  });

  test('TU02: a Jump in save has only the Basic until its first forge gives it a Primary', async ({
```

- [ ] **Step 2: Run it, and see it fail**

Run: `(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts --project=desktop -g TU03)`
Expected: FAIL at `marked('back')`: the marker has no `data-target` (nothing of `skills.addSlot` or its ways is in the Mana view's scope). Everything before that line passes.

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/e2e/delve-tutorial.spec.ts
git commit -m "test(client): TU03, the marker's way out of a view left open (failing)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: Keyed targets, done, and the ways

**Files:**
- Create: `packages/client/src/features/delve/tutorial/__tests__/marked-trails.test.ts`
- Modify: `packages/client/src/features/delve/tutorial/marked.ts` (whole), `packages/client/src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx`

- [ ] **Step 1: The failing tests**

Create `packages/client/src/features/delve/tutorial/__tests__/marked-trails.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findTarget, findWay, isDone, type Marked } from '../marked';

// See the pad navigation and guidance spec, 2.3: keyed targets, done, the ways, the trail and
// the way out. The rule reads the DOM alone, so each test writes the page it needs.

const page = (html: string) => {
  document.body.innerHTML = html;
};
/** What is marked: its id and the element's. */
const at = (m: Marked | null) => m && [m.id, m.el.id];

beforeEach(() => {
  // jsdom has no layout: every element is a 10 px box on screen, one with `data-off` far off it.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const x = this.hasAttribute('data-off') ? 5000 : 0;
    return DOMRect.fromRect({ x, y: 0, width: 10, height: 10 });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('findTarget', () => {
  it("takes the first of a keyed target's controls, the last of a plain one's", () => {
    page(`<div data-pad-scope>
      <button id="a" data-tutorial="loadout.bag:chest.uncommon"></button>
      <button id="b" data-tutorial="loadout.bag:chest.uncommon"></button>
      <button id="c" data-tutorial="hub.delve"></button>
      <button id="d" data-tutorial="hub.delve"></button>
    </div>`);
    expect(findTarget('loadout.bag:chest.uncommon')?.id).toBe('a');
    expect(findTarget('hub.delve')?.id).toBe('d');
    expect(findTarget('loadout.bag:weapon.rare')).toBeNull();
  });

  it('sees nothing off screen, or outside the topmost pad scope', () => {
    page(`<div data-pad-scope>
      <button id="a" data-tutorial="forge.go"></button>
      <div data-pad-scope>
        <button id="b" data-off data-tutorial="forge.pattern:cuirass"></button>
        <button id="c" data-tutorial="forge.shard"></button>
      </div>
    </div>`);
    // Outside the topmost (nested) scope; off screen inside it; on screen inside it.
    expect(findTarget('forge.go')).toBeNull();
    expect(findTarget('forge.pattern:cuirass')).toBeNull();
    expect(findTarget('forge.shard')?.id).toBe('c');
  });
});

describe('isDone', () => {
  it.each(['aria-selected', 'aria-pressed', 'aria-checked', 'data-tutorial-done'])(
    '%s="true" is done; "false" or absent is not',
    (attr) => {
      page(`<button id="a" ${attr}="true"></button><button id="b" ${attr}="false"></button>
        <button id="c"></button>`);
      const done = (id: string) => isDone(document.getElementById(id)!);
      expect([done('a'), done('b'), done('c')]).toEqual([true, false, false]);
    },
  );
});

describe('findWay', () => {
  /** The Skills tab: the Primary's row, its first and last cards, and the elements if shown. */
  const skills = (o: { primary: boolean; last: boolean; elements?: boolean }) =>
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="true" data-tutorial="hub.tab.skills"></button>
      <button id="primary" role="tab" aria-selected="${o.primary}"
        data-tutorial="skills.primary"></button>
      <button id="first" aria-pressed="${!o.last}" data-tutorial="skills.card:first"></button>
      <button id="last" aria-pressed="${o.last}" data-tutorial="skills.card:last"></button>
      ${o.elements ? '<section id="elements" data-tutorial="skills.elements"></section>' : ''}
    </div>`);

  it('is the target itself while it is on screen', () => {
    skills({ primary: true, last: true, elements: true });
    expect(at(findWay('skills.elements'))).toEqual(['skills.elements', 'elements']);
  });

  it('else the control that shows it: a keyed way, the card to select', () => {
    skills({ primary: true, last: false });
    expect(at(findWay('skills.elements'))).toEqual(['skills.card:last', 'last']);
    // The first card is selected already, as are the skill's row and the tab: no way to show.
    expect(findWay('skills.socket')).toBeNull();
  });

  it('passes over a way that is done, by any done attribute, on to the next', () => {
    // The last card is selected already (`aria-pressed`): the way is the skill's row.
    skills({ primary: false, last: true });
    expect(at(findWay('skills.elements'))).toEqual(['skills.primary', 'primary']);
    // Every way open and the target still not showing: nothing to point at.
    skills({ primary: true, last: true });
    expect(findWay('skills.elements')).toBeNull();
  });

  it("looks a keyed target's way up without its key", () => {
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="false" data-tutorial="hub.tab.forge"></button>
    </div>`);
    expect(at(findWay('forge.pattern:cuirass'))).toEqual(['hub.tab.forge', 'tab']);
    expect(at(findWay('forge.refine:rusty'))).toEqual(['hub.tab.forge', 'tab']);
  });

  it("the Forge bench's controls go by its sub tab; the Materials pane's Refine, beside both benches, by the tab alone", () => {
    /** The Forge tab open, on the Temper bench or the Forge bench (nothing of either showing). */
    const forge = (on: 'forge' | 'temper') =>
      page(`<div data-pad-scope>
        <button id="tab" role="tab" aria-selected="true" data-tutorial="hub.tab.forge"></button>
        <button id="bench" role="tab" aria-selected="${on === 'forge'}"
          data-tutorial="forge.bench"></button>
        <button id="temper" role="tab" aria-selected="${on === 'temper'}"
          data-tutorial="forge.temper"></button>
      </div>`);
    forge('temper');
    for (const t of ['forge.pattern:cuirass', 'forge.bar:rusty', 'forge.flux:uncommon'] as const)
      expect(at(findWay(t))).toEqual(['forge.bench', 'bench']);
    expect(at(findWay('forge.shard'))).toEqual(['forge.bench', 'bench']);
    expect(at(findWay('forge.go'))).toEqual(['forge.bench', 'bench']);
    expect(findWay('forge.refine:rusty')).toBeNull();
    // The Forge bench open already: its sub tab is done, and so is the tab.
    forge('forge');
    expect(findWay('forge.go')).toBeNull();
  });
});
```

(Task 6's `findMarked` tests go in this file too.)

- [ ] **Step 2: Run them, and see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial/__tests__/marked-trails.test.ts)`
Expected: FAIL: `isDone is not a function` (02's `marked.ts` has no `isDone`), and "takes the first of a keyed target's controls" gets `b`.

- [ ] **Step 3: The rule's parts**

Replace the whole of `packages/client/src/features/delve/tutorial/marked.ts` with:
```ts
import type {
  TutorialKeyedTarget,
  TutorialStep,
  TutorialTarget,
  TutorialTrailTarget,
} from '@alloy/engine';
import { scopedLast, topScope } from '../kit';

/**
 * What the guided start's marker points at (see the pad navigation and guidance spec, 2.3): the
 * first control of the step's trail still to do, a way to it, the step's `highlight`, or the way
 * out of a view left open over them. All of it is read from the topmost pad scope's DOM: a
 * control names its target with `data-tutorial` (`<target>`, or `<target>:<key>` for one control
 * among several) and says it is done with an attribute it sets itself (`isDone`).
 */

/** A target as `WAY_TO` knows it: without its key. */
type Bare = TutorialTarget | TutorialKeyedTarget;

/** `forge.pattern:cuirass` is `forge.pattern`. */
const bare = (target: string): Bare => target.split(':')[0] as Bare;

/**
 * Where a target lives when it is not on screen: the control that opens its view or bench or
 * selects its move, else its hub tab (each hub tab is `hub.tab.<id>`). Keyed on the target
 * without its key (every pattern row's way is the Forge tab); a way may itself be keyed
 * (`skills.card:last`: the card to select).
 */
export const WAY_TO: Partial<Record<Bare, TutorialTrailTarget>> = {
  'loadout.bag': 'hub.tab.loadout',
  'loadout.equip': 'hub.tab.loadout',
  'loadout.salvage': 'hub.tab.loadout',
  'loadout.compare': 'hub.tab.loadout',
  'loadout.transfer': 'hub.tab.loadout',
  'skills.mana': 'hub.tab.skills',
  'mana.bind': 'skills.mana',
  'mana.confirm': 'mana.bind',
  'skills.primary': 'hub.tab.skills',
  'skills.card': 'skills.primary',
  'skills.addSlot': 'skills.primary',
  'skills.elements': 'skills.card:last',
  'skills.socket': 'skills.card:first',
  'skills.rune': 'skills.card:first',
  'skills.apply': 'hub.tab.skills',
  'forge.bench': 'hub.tab.forge',
  'forge.pattern': 'forge.bench',
  'forge.bar': 'forge.bench',
  'forge.flux': 'forge.bench',
  'forge.shard': 'forge.bench',
  'forge.go': 'forge.bench',
  // The Materials pane sits beside both benches.
  'forge.refine': 'hub.tab.forge',
  'forge.temper': 'hub.tab.forge',
  'temper.hone': 'forge.temper',
  'temper.line': 'temper.hone',
  'temper.go': 'temper.hone',
  'quests.done': 'hub.tab.quests',
  'quests.claim': 'hub.tab.quests',
  'quests.board': 'hub.tab.quests',
};

/** What the marker points at: the element, and the target it stands for (an entry of the trail, the step's `highlight`, a way to one of them, or `'back'`). */
export interface Marked {
  el: HTMLElement;
  id: string;
}

function shown(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function onScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
}

/**
 * The target's element in the topmost pad scope, on screen; else null. Of several visible
 * `[data-tutorial="<target>"]`, a keyed target takes the first (the bag's first tile of that
 * slot and rarity), a plain one the last, as ever.
 */
export function findTarget(target: string): HTMLElement | null {
  const selector = `[data-tutorial="${target}"]`;
  const el = target.includes(':')
    ? [...topScope().querySelectorAll<HTMLElement>(selector)].find(shown)
    : scopedLast(selector);
  return el && onScreen(el) ? el : null;
}

const DONE = ['aria-selected', 'aria-pressed', 'aria-checked', 'data-tutorial-done'];

/** Whether a control says its click is made: chosen, selected or pressed, or `data-tutorial-done`, each `"true"`. */
export function isDone(el: HTMLElement): boolean {
  return DONE.some((attr) => el.getAttribute(attr) === 'true');
}

/**
 * The target on screen (`findTarget`), else the nearest way to it that is (`WAY_TO`), passing
 * over one that is done (a selected tab or card: what it shows is open already); else null.
 */
export function findWay(target: TutorialTrailTarget): Marked | null {
  const own = findTarget(target);
  if (own) return { el: own, id: target };
  for (let way = WAY_TO[bare(target)]; way; way = WAY_TO[bare(way)]) {
    const el = findTarget(way);
    if (el && !isDone(el)) return { el, id: way };
  }
  return null;
}

/** The step's marked control: its `highlight`, by `findWay`. (Task 6 gives it the trail and the way out.) */
export function findMarked(step: TutorialStep): Marked | null {
  return step.highlight ? findWay(step.highlight) : null;
}
```

- [ ] **Step 4: The targets test follows the keyed ways**

In `packages/client/src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx`:

Replace:
```ts
    const ways = (t: TutorialTarget): string[] => [t, ...(WAY_TO[t] ? ways(WAY_TO[t]!) : [])];
    const bad = getDelveRegistry()
      .getTutorialData()
      .steps.filter((s) => s.highlight)
      .filter((s) => !ways(s.highlight!).at(-1)!.startsWith(screenOf[s.where]))
      .map((s) => `${s.id}: ${ways(s.highlight!).join(' < ')}`);
    expect(bad).toEqual([]);
```
with:
```ts
    const ways = (t: string): string[] => {
      const next = WAY_TO[t.split(':')[0] as keyof typeof WAY_TO];
      return [t, ...(next ? ways(next) : [])];
    };
    // A step's highlight, and every entry of its trail.
    const bad = getDelveRegistry()
      .getTutorialData()
      .steps.flatMap((s) =>
        [...(s.highlight ? [s.highlight] : []), ...(s.trail ?? [])]
          .filter((t) => !ways(t).at(-1)!.startsWith(screenOf[s.where]))
          .map((t) => `${s.id}: ${ways(t).join(' < ')}`),
      );
    expect(bad).toEqual([]);
```

Replace:
```ts
    const behind = TUTORIAL_TARGETS.filter(
      (t) => !/^(hud|stop|hub)\./.test(t) && !PENDING.includes(t),
    );
```
with:
```ts
    const behind = TUTORIAL_TARGETS.filter((t) => !/^(hud|stop|hub)\./.test(t));
```

- [ ] **Step 5: Run the tutorial's client tests**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run src/features/delve/tutorial)
```

Expected: no type errors; PASS, 02's `marked.test.tsx` and `TutorialHighlight.test.tsx` included (without a trail the rule is as it was: a selected tab is still passed over, a plain target is still the last match).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/tutorial/marked.ts packages/client/src/features/delve/tutorial/__tests__/marked-trails.test.ts packages/client/src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx
git commit -m "feat(client): keyed tutorial targets, the done rule and the new ways" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: The trail and the way out

**Files:**
- Modify: `packages/client/src/features/delve/tutorial/marked.ts`
- Test: `packages/client/src/features/delve/tutorial/__tests__/marked-trails.test.ts`, `packages/client/e2e/delve-tutorial.spec.ts` (TU03, unchanged)

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/tutorial/__tests__/marked-trails.test.ts`:

Replace:
```ts
import { findTarget, findWay, isDone, type Marked } from '../marked';
```
with:
```ts
import type { TutorialStep } from '@alloy/engine';
import { findMarked, findTarget, findWay, isDone, type Marked } from '../marked';
```

Append at the end of the file:
```ts

describe('findMarked', () => {
  const step = (over: Partial<TutorialStep> = {}): TutorialStep => ({
    id: 'lesson',
    where: 'anvil',
    line: 'A line.',
    objective: 'Do it',
    trigger: { type: 'ack', count: 1 },
    ...over,
  });
  const FORGE = step({
    highlight: 'hub.tab.forge',
    trail: ['forge.pattern:cuirass', 'forge.flux:uncommon', 'forge.go'],
  });
  /** The Forge bench: the pattern picked or not, the flux chosen, off or neither, Forge on or off. */
  const bench = (o: { pattern?: boolean; flux?: boolean | 'off'; go?: 'off' } = {}) =>
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="true" data-tutorial="hub.tab.forge"></button>
      <button id="pattern" aria-pressed="${!!o.pattern}"
        data-tutorial="forge.pattern:cuirass"></button>
      <button id="flux" role="radio" aria-checked="${o.flux === true}"
        ${o.flux === 'off' ? 'disabled' : ''} data-tutorial="forge.flux:uncommon"></button>
      <button id="go" ${o.go ? 'disabled' : ''} data-tutorial="forge.go"></button>
    </div>`);

  it('marks the first entry of the trail still to do, a done one passed over', () => {
    bench();
    expect(at(findMarked(FORGE))).toEqual(['forge.pattern:cuirass', 'pattern']);
    bench({ pattern: true });
    expect(at(findMarked(FORGE))).toEqual(['forge.flux:uncommon', 'flux']);
    bench({ pattern: true, flux: true });
    expect(at(findMarked(FORGE))).toEqual(['forge.go', 'go']);
  });

  it('passes over a disabled entry', () => {
    bench({ pattern: true, flux: 'off' });
    expect(at(findMarked(FORGE))).toEqual(['forge.go', 'go']);
  });

  it("marks the step's highlight once the trail is done or passed over", () => {
    bench({ pattern: true, flux: true, go: 'off' });
    expect(at(findMarked(FORGE))).toEqual(['hub.tab.forge', 'tab']);
  });

  it('marks an entry that is not on screen by its way, and passes it over when no way shows', () => {
    // On another tab: the way to the first entry is the Forge tab.
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="false" data-tutorial="hub.tab.forge"></button>
    </div>`);
    expect(at(findMarked(FORGE))).toEqual(['hub.tab.forge', 'tab']);
    // On the tab, the pattern row not showing: its way is open, so the walk goes on to the flux.
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="true" data-tutorial="hub.tab.forge"></button>
      <button id="flux" role="radio" aria-checked="false"
        data-tutorial="forge.flux:uncommon"></button>
    </div>`);
    expect(at(findMarked(FORGE))).toEqual(['forge.flux:uncommon', 'flux']);
  });

  it('with the Temper bench open, marks the Forge sub tab: the way to every entry of the forge', () => {
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="true" data-tutorial="hub.tab.forge"></button>
      <button id="bench" role="tab" aria-selected="false" data-tutorial="forge.bench"></button>
      <button id="temper" role="tab" aria-selected="true" data-tutorial="forge.temper"></button>
    </div>`);
    expect(at(findMarked(FORGE))).toEqual(['forge.bench', 'bench']);
  });

  it('with no trail marks the highlight, as before; with neither, nothing', () => {
    bench();
    expect(at(findMarked(step({ highlight: 'forge.go' })))).toEqual(['forge.go', 'go']);
    expect(findMarked(step())).toBeNull();
  });

  describe('the way out', () => {
    const SKILLS = step({
      highlight: 'skills.addSlot',
      trail: ['skills.primary', 'skills.addSlot'],
    });
    /** The Skills tab with a view nested in it, holding `inside`. */
    const nested = (inside: string) =>
      page(`<div data-pad-scope>
        <button id="primary" role="tab" aria-selected="true" data-tutorial="skills.primary"></button>
        <button id="slot" data-tutorial="skills.addSlot"></button>
        <aside data-pad-scope><button id="back" data-pad-back></button>${inside}</aside>
      </div>`);

    it("marks the Back of a view nested in the screen that holds none of the step's controls", () => {
      nested('');
      expect(at(findMarked(SKILLS))).toEqual(['back', 'back']);
    });

    it("marks an entry the nested view does hold (a picker carries its field's target)", () => {
      nested('<div id="list" data-tutorial="skills.addSlot"></div>');
      expect(at(findMarked(SKILLS))).toEqual(['skills.addSlot', 'list']);
    });

    it('never out of a dialog (a scope not nested in another), nor for a step that marks nothing', () => {
      page(`<div data-pad-scope><button id="slot" data-tutorial="skills.addSlot"></button></div>
        <div data-pad-scope><button id="back" data-pad-back></button></div>`);
      expect(findMarked(SKILLS)).toBeNull();
      nested('');
      expect(findMarked(step())).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run them, and see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial/__tests__/marked-trails.test.ts)`
Expected: FAIL in `findMarked`: the trail tests get `['hub.tab.forge', 'tab']` (the highlight), and "marks the Back…" gets `null`. Task 5's tests pass.

- [ ] **Step 3: The rule**

In `packages/client/src/features/delve/tutorial/marked.ts`:

Replace:
```ts
/** The step's marked control: its `highlight`, by `findWay`. (Task 6 gives it the trail and the way out.) */
export function findMarked(step: TutorialStep): Marked | null {
  return step.highlight ? findWay(step.highlight) : null;
}
```
with:
```ts
/**
 * The way out of a view or picker left open inside the screen: the topmost scope's
 * `[data-pad-back]`, when that scope is nested in another (the Mana view, a rune or shard
 * picker, a stop card's picker). A kit dialog or the pause is not nested: the player opened it
 * on purpose, and it gets no marker.
 */
function wayOut(): Marked | null {
  const scope = topScope();
  if (!(scope instanceof HTMLElement) || !scope.parentElement?.closest('[data-pad-scope]'))
    return null;
  const el = scopedLast('[data-pad-back]');
  return el && onScreen(el) ? { el, id: 'back' } : null;
}

/**
 * The step's marked control. Its trail is walked in order: an entry on screen that is done
 * (`isDone`) or disabled is passed over; the first one on screen, enabled and not done is
 * marked; one that is not on screen is marked by its way (`findWay`), or passed over when no way
 * shows. After the trail, the step's `highlight` (by `findWay`, as ever). When none of that gives
 * anything in the topmost scope, the way out of it (`wayOut`).
 */
export function findMarked(step: TutorialStep): Marked | null {
  for (const entry of step.trail ?? []) {
    const el = findTarget(entry);
    if (el && (isDone(el) || el.matches(':disabled, [aria-disabled="true"]'))) continue;
    const marked = el ? { el, id: entry } : findWay(entry);
    if (marked) return marked;
  }
  const own = step.highlight ? findWay(step.highlight) : null;
  return own ?? (step.trail || step.highlight ? wayOut() : null);
}
```

- [ ] **Step 4: Run the unit tests, and see them pass**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run src/features/delve/tutorial)
```

Expected: no type errors; PASS, 02's tests included. If one of 02's `TutorialHighlight` or `TutorialPanel` tests renders a nested `[data-pad-scope]` and now sees `back` marked, that is the new rule: say so in the report rather than weakening `wayOut`.

- [ ] **Step 5: Run TU03, and see it pass**

Run: `(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts --project=desktop -g TU03)`
Expected: PASS. (The controls of `l1-skills` are not keyed yet; `skills.primary` is done by its `aria-selected` and `skills.addSlot` exists, which is all TU03 reads.)

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/tutorial/marked.ts packages/client/src/features/delve/tutorial/__tests__/marked-trails.test.ts
git commit -m "feat(client): the marker walks a step's trail and shows the way out of an open view" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 3: The controls: Forge and Quests

Each task adds one test beside the component's own (its harness is there), sees it fail on the missing attribute, and adds the attribute. Paths are under `packages/client/src/features/delve`.

### Task 7: The bench: its sub tab, patterns, bar, flux and the Lines field

**Files:**
- Modify: `kit/types.ts`, `kit/controls.tsx`, `hub/forge/ForgeTab.tsx`, `hub/forge/PatternList.tsx`, `hub/forge/ShardPicker.tsx`, `hub/forge/ForgeBench.tsx`
- Test: `hub/forge/__tests__/ForgeBench.test.tsx`, `hub/forge/__tests__/ForgeTab.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx`:

Replace:
```tsx
  it('lists the learned patterns, then the unknown ones greyed with where they come from', () => {
```
with:
```tsx
  it("carries the guided start's trail: a keyed pattern, bar and flux, and the Lines field done once a line holds a shard", () => {
    withMaterials({
      metals: { ...emptyMaterials().metals, rusty: 5 },
      flux: { ...emptyMaterials().flux, uncommon: 2 },
      shards: { maxHp: [1] },
    });
    bench();
    const pattern = screen.getByTestId('pattern-cuirass');
    expect(pattern).toHaveAttribute('data-tutorial', 'forge.pattern:cuirass');
    fireEvent.click(pattern);
    expect(pattern).toHaveAttribute('aria-pressed', 'true');
    // The first bar held is the bench's own pick: chosen from the start.
    expect(screen.getByTestId('metal-rusty')).toHaveAttribute('data-tutorial', 'forge.bar:rusty');
    expect(screen.getByTestId('metal-rusty')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('flux-none')).not.toHaveAttribute('data-tutorial');
    const flux = screen.getByTestId('flux-uncommon');
    expect(flux).toHaveAttribute('data-tutorial', 'forge.flux:uncommon');
    fireEvent.click(flux);
    expect(screen.getByTestId('flux-uncommon')).toHaveAttribute('aria-checked', 'true');
    const lines = () => document.querySelector('[data-tutorial="forge.shard"]')!;
    expect(lines()).toHaveAttribute('data-tutorial-done', 'false');
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    // In the picker's own scope the picker is the target.
    expect(lines()).toBe(screen.getByTestId('shard-picker'));
    fireEvent.click(screen.getByTestId('shard-pick-maxHp-1'));
    expect(lines()).toHaveAttribute('data-tutorial-done', 'true');
  });

  it('the Lines field is done at once when no shard held fits the item: the forge needs none', () => {
    // A Crit Chance shard fits no cuirass; a Max Life one does.
    const holding = (shards: MaterialsPouch['shards']) =>
      withMaterials({
        metals: { ...emptyMaterials().metals, rusty: 5 },
        flux: { ...emptyMaterials().flux, uncommon: 2 },
        shards,
      });
    holding({ critChance: [2] });
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    fireEvent.click(screen.getByTestId('flux-uncommon'));
    const lines = () => document.querySelector('[data-tutorial="forge.shard"]')!;
    expect(lines()).toHaveAttribute('data-tutorial-done', 'true');
    expect(screen.getByTestId('forge-button')).toBeEnabled();
    act(() => holding({ critChance: [2], maxHp: [1] }));
    expect(lines()).toHaveAttribute('data-tutorial-done', 'false');
    act(() => holding({}));
    expect(lines()).toHaveAttribute('data-tutorial-done', 'true');
  });

  it('lists the learned patterns, then the unknown ones greyed with where they come from', () => {
```

In `packages/client/src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx`:

Replace:
```tsx
  it('opens on the Forge bench; Temper lists what you wear first, then the bag, filtered by kind', () => {
```
with:
```tsx
  it("names both benches' sub tabs for the guided start: forge.bench, the way to the bench's controls, and forge.temper", () => {
    render(<ForgeTab {...props()} />);
    expect(screen.getByTestId('bench-forge')).toHaveAttribute('data-tutorial', 'forge.bench');
    expect(screen.getByTestId('bench-forge')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('bench-temper')).toHaveAttribute('data-tutorial', 'forge.temper');
  });

  it('opens on the Forge bench; Temper lists what you wear first, then the bag, filtered by kind', () => {
```

- [ ] **Step 2: Run it, and see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx)`
Expected: FAIL, three tests: `pattern-cuirass` has no `data-tutorial`; the Lines field has no `data-tutorial-done`; `bench-forge` has no `data-tutorial`.

- [ ] **Step 3: The kit's `Segmented` takes a target per option**

In `packages/client/src/features/delve/kit/types.ts`:

Replace:
```ts
export interface SegmentedProps<T extends string> {
  options: { id: T; label: ReactNode; color?: string; disabled?: boolean; title?: string; testId?: string }[];
```
with:
```ts
export interface SegmentedProps<T extends string> {
  /** `tutorial`: the option's guided-start target (`data-tutorial`), e.g. `forge.bar:rusty`. */
  options: { id: T; label: ReactNode; color?: string; disabled?: boolean; title?: string; testId?: string; tutorial?: string }[];
```

In `packages/client/src/features/delve/kit/controls.tsx`:

Replace:
```tsx
            data-testid={o.testId}
            className="k-seg"
```
with:
```tsx
            data-testid={o.testId}
            data-tutorial={o.tutorial}
            className="k-seg"
```

- [ ] **Step 4: The Forge sub tab and the pattern rows**

In `packages/client/src/features/delve/hub/forge/ForgeTab.tsx`:

Replace:
```tsx
          { id: 'forge', label: 'Forge', testId: 'bench-forge' },
```
with:
```tsx
          { id: 'forge', label: 'Forge', testId: 'bench-forge', tutorial: 'forge.bench' },
```

(The kit's `Tabs` already writes a tab's `tutorial` as its `data-tutorial`, as the Temper sub tab's `forge.temper` beside it; a selected tab is `aria-selected`, so `findWay` passes the Forge sub tab over while its bench is open.)

In `packages/client/src/features/delve/hub/forge/PatternList.tsx`:

Replace:
```tsx
              data-testid={`pattern-${b.id}`}
```
with:
```tsx
              data-testid={`pattern-${b.id}`}
              data-tutorial={`forge.pattern:${b.id}`}
```

- [ ] **Step 5: The bench's bar, flux and Lines**

In `packages/client/src/features/delve/hub/forge/ForgeBench.tsx`:

Replace:
```tsx
function Field({
  label,
  tutorial,
  children,
}: {
  label: string;
  tutorial?: TutorialTarget;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2" data-tutorial={tutorial}>
```
with:
```tsx
function Field({
  label,
  tutorial,
  done,
  children,
}: {
  label: string;
  tutorial?: TutorialTarget;
  /** The guided start's trail: this field's click is made (`data-tutorial-done`). */
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2" data-tutorial={tutorial} data-tutorial-done={done}>
```

Replace:
```tsx
                  disabled: metals[m] === 0,
                  testId: `metal-${m}`,
```
with:
```tsx
                  disabled: metals[m] === 0,
                  testId: `metal-${m}`,
                  tutorial: `forge.bar:${m}`,
```

Replace:
```tsx
                    disabled: fluxHeld[g] === 0,
                    testId: `flux-${g}`,
```
with:
```tsx
                    disabled: fluxHeld[g] === 0,
                    testId: `flux-${g}`,
                    tutorial: `forge.flux:${g}`,
```

Replace:
```tsx
import { ShardPicker } from './ShardPicker';
```
with:
```tsx
import { ShardPicker, heldShards } from './ShardPicker';
```

Replace:
```tsx
        .map(([s, n]) => `${SKILL_NAME[s as keyof typeof SKILL_NAME]} +${n}`)
    : [];
```
with:
```tsx
        .map(([s, n]) => `${SKILL_NAME[s as keyof typeof SKILL_NAME]} +${n}`)
    : [];
  // The guided start's trail: the Lines are done once one holds a shard, or at once when no
  // shard held fits the item (the forge needs none), so the marker goes on to Forge.
  const linesDone =
    shards.length > 0 ||
    (!!preview && heldShards(registry, profile.materials.shards, preview.slot, []).length === 0);
```

Replace:
```tsx
            <Field label="Lines" tutorial="forge.shard">
```
with:
```tsx
            <Field label="Lines" tutorial="forge.shard" done={linesDone}>
```

`linesDone` asks the shard picker's own list whether any shard held fits, so the field and the picker can never disagree. That list becomes a function:

In `packages/client/src/features/delve/hub/forge/ShardPicker.tsx`:

Replace:
```tsx
import { shardTiersOf, type GearSlot, type HeroStatKey, type ShardRef } from '@alloy/engine';
```
with:
```tsx
import {
  shardTiersOf,
  type DataRegistry,
  type GearSlot,
  type HeroStatKey,
  type MaterialsPouch,
  type ShardRef,
} from '@alloy/engine';
```

Replace:
```tsx
/**
 * The shards held that a line of a `slot` item can take: each affix the slot
 * allows, but `exclude`, at every tier held, with its count and roll band. A
 * plain list: the caller holds the pad scope and its Back.
 */
```
with:
```tsx
/**
 * The shards of `pouch` that a line of a `slot` item can take: each affix the
 * slot allows, but `exclude`, at every tier held, with its count and roll band.
 */
export function heldShards(
  registry: DataRegistry,
  pouch: MaterialsPouch['shards'],
  slot: GearSlot,
  exclude: readonly HeroStatKey[],
) {
  return registry
    .getDelveData()
    .affixes.filter((a) => a.slots.includes(slot) && !exclude.includes(a.stat))
    .flatMap((a) =>
      shardTiersOf(registry, a.stat).flatMap((band) => {
        const n = pouch[a.stat]?.[band.tier - 1] ?? 0;
        return n > 0 ? [{ shard: { stat: a.stat, tier: band.tier }, n, band }] : [];
      }),
    );
}

/**
 * The shards held that a line of a `slot` item can take (`heldShards`). A
 * plain list: the caller holds the pad scope and its Back.
 */
```

Replace:
```tsx
  const held = registry
    .getDelveData()
    .affixes.filter((a) => a.slots.includes(slot) && !exclude.includes(a.stat))
    .flatMap((a) =>
      shardTiersOf(registry, a.stat).flatMap((band) => {
        const n = pouch[a.stat]?.[band.tier - 1] ?? 0;
        return n > 0 ? [{ shard: { stat: a.stat, tier: band.tier }, n, band }] : [];
      }),
    );
  if (held.length === 0)
```
with:
```tsx
  const held = heldShards(registry, pouch, slot, exclude);
  if (held.length === 0)
```

- [ ] **Step 6: Run it, and see it pass**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run src/features/delve/hub/forge src/features/delve/kit)
```

Expected: no type errors; PASS.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/kit/types.ts packages/client/src/features/delve/kit/controls.tsx packages/client/src/features/delve/hub/forge/ForgeTab.tsx packages/client/src/features/delve/hub/forge/PatternList.tsx packages/client/src/features/delve/hub/forge/ShardPicker.tsx packages/client/src/features/delve/hub/forge/ForgeBench.tsx packages/client/src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx packages/client/src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx
git commit -m "feat(client): the Forge bench's trail targets (its sub tab, pattern, bar, flux, lines)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: A bar's Refine, and Hone's lines and confirm

**Files:**
- Modify: `hub/forge/MaterialsPane.tsx`, `hub/forge/Temper.tsx`
- Test: `hub/forge/__tests__/MaterialsPane.test.tsx`, `hub/forge/__tests__/Temper.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/hub/forge/__tests__/MaterialsPane.test.tsx`:

Replace:
```tsx
  it("lists what's held by kind, shards by family and tier, and refines 3 → 1 at the engine's price", () => {
```
with:
```tsx
  it("keys each bar's Refine by its metal for the guided start (forge.refine), and no other row's", () => {
    held({
      metals: { ...emptyMaterials().metals, rusty: 5 },
      flux: { ...emptyMaterials().flux, uncommon: 3 },
    });
    pane();
    expect(screen.getByTestId('refine-metal-rusty')).toHaveAttribute(
      'data-tutorial',
      'forge.refine:rusty',
    );
    expect(screen.getByTestId('refine-flux-uncommon')).not.toHaveAttribute('data-tutorial');
    expect(screen.getByTestId('materials-bars')).toHaveAttribute('data-tutorial', 'forge.refine');
  });

  it("lists what's held by kind, shards by family and tier, and refines 3 → 1 at the engine's price", () => {
```

In `packages/client/src/features/delve/hub/forge/__tests__/Temper.test.tsx`:

Replace:
```tsx
  it('hones a line through the engine, at its price, which grows with each hone', () => {
```
with:
```tsx
  it("Hone's picker carries the guided start's trail: its lines, done once one is picked, then its confirm", () => {
    bench(helm('fire', [{ stat: 'armor', value: 4, roll: 0.3 }]), { scrap: 10_000 });
    fireEvent.click(screen.getByTestId('hone-open'));
    const lines = document.querySelector('[data-tutorial="temper.line"]')!;
    expect(lines).toContainElement(screen.getByTestId('hone-line-0'));
    expect(lines).toHaveAttribute('data-tutorial-done', 'false');
    expect(screen.getByTestId('hone-button')).toHaveAttribute('data-tutorial', 'temper.go');
    expect(screen.getByTestId('hone-button')).toBeDisabled();
    fireEvent.click(screen.getByTestId('hone-line-0'));
    expect(lines).toHaveAttribute('data-tutorial-done', 'true');
    expect(screen.getByTestId('hone-button')).toBeEnabled();
    // Reforge's picker is no lesson's.
    fireEvent.click(screen.getByTestId('hone-back'));
    fireEvent.click(screen.getByTestId('reforge-open'));
    expect(document.querySelector('[data-tutorial="temper.line"]')).toBeNull();
    expect(screen.getByTestId('reforge-button')).not.toHaveAttribute('data-tutorial');
  });

  it('hones a line through the engine, at its price, which grows with each hone', () => {
```

- [ ] **Step 2: Run them, and see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/MaterialsPane.test.tsx src/features/delve/hub/forge/__tests__/Temper.test.tsx)`
Expected: FAIL: `refine-metal-rusty` has no `data-tutorial`; `lines` is null.

- [ ] **Step 3: Refine**

In `packages/client/src/features/delve/hub/forge/MaterialsPane.tsx`:

Replace:
```tsx
            testId={`refine-${key}`}
```
with:
```tsx
            testId={`refine-${key}`}
            data-tutorial={what.kind === 'metal' ? `forge.refine:${what.metal}` : undefined}
```

- [ ] **Step 4: Hone's lines and confirm**

In `packages/client/src/features/delve/hub/forge/Temper.tsx`:

Replace:
```tsx
          {affixes.map((l, i) => (
            <button
              key={`${i}-${l.stat}`}
              type="button"
              className="k-well p-2 text-left"
              style={{ borderColor: line === i ? 'var(--k-hot)' : undefined }}
              aria-pressed={line === i}
              data-pad-first={i === 0 ? '' : undefined}
              onClick={() => {
                setLine(i);
                setShard(null); // a shard for one line may sit on another
              }}
              data-testid={`${op}-line-${i}`}
            >
              <AffixLine line={l} />
            </button>
          ))}
```
with:
```tsx
          <div
            className="flex flex-col gap-3"
            data-tutorial={op === 'hone' ? 'temper.line' : undefined}
            data-tutorial-done={line !== null}
          >
            {affixes.map((l, i) => (
              <button
                key={`${i}-${l.stat}`}
                type="button"
                className="k-well p-2 text-left"
                style={{ borderColor: line === i ? 'var(--k-hot)' : undefined }}
                aria-pressed={line === i}
                data-pad-first={i === 0 ? '' : undefined}
                onClick={() => {
                  setLine(i);
                  setShard(null); // a shard for one line may sit on another
                }}
                data-testid={`${op}-line-${i}`}
              >
                <AffixLine line={l} />
              </button>
            ))}
          </div>
```

Replace:
```tsx
            aria-describedby={opShort ? `${id}-op` : undefined}
            testId={`${op}-button`}
```
with:
```tsx
            aria-describedby={opShort ? `${id}-op` : undefined}
            data-tutorial={op === 'hone' ? 'temper.go' : undefined}
            testId={`${op}-button`}
```

(The wrapper keeps the lines' 12 px gap: its parent is the same `flex flex-col gap-3`.)

- [ ] **Step 5: Run them, and see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge)`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/hub/forge/MaterialsPane.tsx packages/client/src/features/delve/hub/forge/Temper.tsx packages/client/src/features/delve/hub/forge/__tests__/MaterialsPane.test.tsx packages/client/src/features/delve/hub/forge/__tests__/Temper.test.tsx
git commit -m "feat(client): trail targets on a bar's Refine and on Hone's lines and confirm" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: The journal's first completed row

**Files:**
- Modify: `hub/quests/QuestsTab.tsx`
- Test: `hub/quests/__tests__/QuestsTab.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx`:

Replace:
```tsx
  it('claims a completed quest from its button and from Enter, naming what it gave', () => {
```
with:
```tsx
  it("marks the first completed quest's row for the guided start (quests.done), done once it is open", () => {
    shown.quests = [
      MAIN,
      { ...KINDLING, status: 'complete' },
      { ...DEEP_ROOTS, status: 'complete' },
    ];
    renderTab();
    const row = screen.getByTestId('quest-kindling');
    expect(row).toHaveAttribute('data-tutorial', 'quests.done');
    expect(row).toHaveAttribute('data-tutorial-done', 'false');
    // Only the first that waits, and never the open one that doesn't.
    expect(screen.getByTestId('quest-deep-roots')).not.toHaveAttribute('data-tutorial');
    expect(screen.getByTestId('quest-frozen-foreman')).not.toHaveAttribute('data-tutorial');
    fireEvent.click(row);
    expect(row).toHaveAttribute('data-tutorial-done', 'true');
    expect(screen.getByTestId('quest-claim')).toHaveAttribute('data-tutorial', 'quests.claim');
  });

  it('claims a completed quest from its button and from Enter, naming what it gave', () => {
```

- [ ] **Step 2: Run it, and see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx)`
Expected: FAIL: `quest-kindling` has no `data-tutorial`.

- [ ] **Step 3: The row**

In `packages/client/src/features/delve/hub/quests/QuestsTab.tsx`:

Replace:
```tsx
  const row = (q: QuestView) => (
    <QuestRow key={q.id} quest={q} on={q.id === open} onOpen={onOpen} />
  );
```
with:
```tsx
  // The guided start's `quests.done`: the first row that waits to be claimed, in the journal's order.
  const waiting = quests.find((q) => q.status === 'complete')?.id;
  const row = (q: QuestView) => (
    <QuestRow key={q.id} quest={q} on={q.id === open} waiting={q.id === waiting} onOpen={onOpen} />
  );
```

Replace:
```tsx
function QuestRow({
  quest: q,
  on,
  onOpen,
}: {
  quest: QuestView;
  on: boolean;
  onOpen: (id: string) => void;
}) {
```
with:
```tsx
function QuestRow({
  quest: q,
  on,
  waiting,
  onOpen,
}: {
  quest: QuestView;
  on: boolean;
  /** The journal's first quest that waits to be claimed: the guided start's `quests.done`. */
  waiting: boolean;
  onOpen: (id: string) => void;
}) {
```

Replace:
```tsx
      aria-current={on}
      data-testid={`quest-${q.id}`}
```
with:
```tsx
      aria-current={on}
      data-testid={`quest-${q.id}`}
      data-tutorial={waiting ? 'quests.done' : undefined}
      data-tutorial-done={waiting ? on : undefined}
```

- [ ] **Step 4: Run it, and see it pass**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run src/features/delve/hub/quests)
```

Expected: no type errors; PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/hub/quests/QuestsTab.tsx packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx
git commit -m "feat(client): quests.done, the journal's first row that waits to be claimed" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 4: The controls: Loadout, Skills and the stop

### Task 10: The bag's tiles

**Files:**
- Modify: `hub/loadout/BagPane.tsx`
- Test: `hub/loadout/__tests__/BagPane.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/hub/loadout/__tests__/BagPane.test.tsx`:

Replace:
```tsx
  it('counts the bag, and marks each tile ▲ better as it is, ◇ better only as a home, NEW', () => {
```
with:
```tsx
  it('keys each tile for the guided start by its slot and rarity (loadout.bag), pressed once selected', () => {
    put(gear('h1', 'helm'), gear('c1', 'chest', 'uncommon'));
    const props = { locked: false, onSelect: vi.fn(), onHover: vi.fn(), onEquip: vi.fn() };
    render(<BagPane {...props} selected="c1" />);
    expect(tile('c1')).toHaveAttribute('data-tutorial', 'loadout.bag:chest.uncommon');
    expect(tile('c1')).toHaveAttribute('aria-pressed', 'true');
    expect(tile('h1')).toHaveAttribute('data-tutorial', 'loadout.bag:helm.magic');
    expect(tile('h1')).toHaveAttribute('aria-pressed', 'false');
  });

  it('counts the bag, and marks each tile ▲ better as it is, ◇ better only as a home, NEW', () => {
```

- [ ] **Step 2: Run it, and see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/BagPane.test.tsx)`
Expected: FAIL: the tile has no `data-tutorial`.

- [ ] **Step 3: The tiles**

In `packages/client/src/features/delve/hub/loadout/BagPane.tsx`:

Replace:
```tsx
                selected={selected === item.uid}
                testId="bag-item"
```
with:
```tsx
                selected={selected === item.uid}
                testId="bag-item"
                data-tutorial={`loadout.bag:${item.slot}.${item.rarity}`}
```

(`ItemTile` passes it to the kit `Tile`'s button with the rest of its props; `selected` is already the tile's `aria-pressed`.)

- [ ] **Step 4: Run it, and see it pass**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/hub/loadout/BagPane.tsx packages/client/src/features/delve/hub/loadout/__tests__/BagPane.test.tsx
git commit -m "feat(client): loadout.bag, each bag tile keyed by its slot and rarity" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 11: The bind and its confirm

**Files:**
- Modify: `ManaPanel.tsx`, `packages/client/e2e/delve-tutorial.spec.ts` (one line of TU03)
- Test: `hub/skills/__tests__/ManaView.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/hub/skills/__tests__/ManaView.test.tsx`:

Replace:
```tsx
  it("offers every element while Hesta's lesson asks for the bind, gear of it or not", () => {
```
with:
```tsx
  it("the lesson's bind: the choices are done while one awaits its confirm, and the confirm is its own target", () => {
    store().setProfile({ ...store().profile, tutorial: { step: 'l1-bind', count: 0, misses: 0 } });
    renderMana();
    const bind = screen.getByTestId('bind-section');
    expect(bind).toHaveAttribute('data-tutorial', 'mana.bind');
    expect(bind).toHaveAttribute('data-tutorial-done', 'false');
    fireEvent.click(screen.getByTestId('mana-bind-frost'));
    expect(bind).toHaveAttribute('data-tutorial-done', 'true');
    expect(screen.getByTestId('mana-bind-confirm')).toHaveAttribute(
      'data-tutorial',
      'mana.confirm',
    );
    fireEvent.click(screen.getByTestId('mana-bind-cancel'));
    expect(bind).toHaveAttribute('data-tutorial-done', 'false');
  });

  it("offers every element while Hesta's lesson asks for the bind, gear of it or not", () => {
```

- [ ] **Step 2: Run it, and see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/ManaView.test.tsx)`
Expected: FAIL: `bind-section` has no `data-tutorial-done`.

- [ ] **Step 3: The attributes**

In `packages/client/src/features/delve/ManaPanel.tsx`:

Replace:
```tsx
        <div className="flex flex-col gap-2" data-testid="bind-section" data-tutorial="mana.bind">
```
with:
```tsx
        <div
          className="flex flex-col gap-2"
          data-testid="bind-section"
          data-tutorial="mana.bind"
          data-tutorial-done={binding !== null}
        >
```

Replace:
```tsx
                onClick={() => onBind(binding)}
                testId="mana-bind-confirm"
```
with:
```tsx
                onClick={() => onBind(binding)}
                data-tutorial="mana.confirm"
                testId="mana-bind-confirm"
```

- [ ] **Step 4: TU03 reads the confirm**

In `packages/client/e2e/delve-tutorial.spec.ts` (TU03):

Replace:
```ts
    await page.getByTestId('mana-bind-frost').click();

    // The pad takes over on the confirm: A binds, and the step moves on with the view still up.
```
with:
```ts
    await page.getByTestId('mana-bind-frost').click();
    await marked('mana.confirm');

    // The pad takes over on the confirm: A binds, and the step moves on with the view still up.
```

- [ ] **Step 5: Run them, and see them pass**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/ManaView.test.tsx)
(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts --project=desktop -g TU03)
```

Expected: PASS, both.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/ManaPanel.tsx packages/client/src/features/delve/hub/skills/__tests__/ManaView.test.tsx packages/client/e2e/delve-tutorial.spec.ts
git commit -m "feat(client): the bind's choices done while one awaits its confirm, and mana.confirm" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 12: The lane: the cards to select, Add slot and the sockets

**Files:**
- Create: `hub/skills/__tests__/SkillsTab.trail.test.tsx`
- Modify: `hub/skills/ChainLane.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { defaultMoveset } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { renderSkills } from './harness';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

// See the pad navigation and guidance spec, 2.3: the lesson's Primary (`l1-skills`), click by
// click, on the real engine: add a slot, the new move in the secondary, a socket on the first
// move, the rune, Apply.

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const target = (t: string) => document.querySelector<HTMLElement>(`[data-tutorial="${t}"]`);
const done = (t: string) => target(t)?.getAttribute('data-tutorial-done');

/** The hero at `l1-skills`: an uncommon sword whose Primary holds two moves, frost bound, Links, scrap and a rune in hand. */
function lesson() {
  const p = armed(store().profile);
  const sword = p.equipped.weapon!;
  const moveset = defaultMoveset(registry, sword, 'fire', { primary: 2 });
  store().setProfile({
    ...p,
    equipped: { ...p.equipped, weapon: { ...sword, moveset } },
    pair: { primary: 'fire', secondary: 'frost' },
    links: 5,
    scrap: 500,
    runes: { quick: [1, 0, 0, 0, 0] },
    tutorial: { step: 'l1-skills', count: 0, misses: 0 },
  });
}

describe("the Skills tab under Hesta's lesson (l1-skills)", () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    lesson();
  });

  it("the lane: the first and last cards are keyed, Add slot is done at the lesson's moves, the first move's sockets once it has one", () => {
    renderSkills();
    expect(screen.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('move-0')).toHaveAttribute('data-tutorial', 'skills.card:first');
    expect(screen.getByTestId('move-1')).toHaveAttribute('data-tutorial', 'skills.card:last');
    // Two moves of the lesson's three.
    expect(done('skills.addSlot')).toBe('false');
    fireEvent.click(screen.getByTestId('add-slot'));
    expect(done('skills.addSlot')).toBe('true');
    expect(screen.getByTestId('move-1')).not.toHaveAttribute('data-tutorial');
    expect(screen.getByTestId('move-2')).toHaveAttribute('data-tutorial', 'skills.card:last');
    // The first move stays selected: its sockets show "+ socket", and are done once one is open.
    expect(target('skills.socket')).toBe(screen.getByTestId('sockets-0'));
    expect(done('skills.socket')).toBe('false');
    fireEvent.click(within(screen.getByTestId('sockets-0')).getByTestId('socket-open'));
    expect(done('skills.socket')).toBe('true');
    // Another skill's cards and Add slot are no targets.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(target('skills.card:first')).toBeNull();
    expect(target('skills.addSlot')).toBeNull();
  });

  it('a card is done as a way once its move holds what selecting it is for: the last the secondary, the first a rune', () => {
    renderSkills();
    expect(done('skills.card:last')).toBe('false');
    fireEvent.click(screen.getByTestId('move-1'));
    fireEvent.click(screen.getByTestId('element-frost'));
    expect(done('skills.card:last')).toBe('true');
    expect(done('skills.card:first')).toBe('false');
    fireEvent.click(screen.getByTestId('move-0'));
    fireEvent.click(within(screen.getByTestId('sockets-0')).getByTestId('socket-open'));
    // An open, empty socket is not yet what the card is for.
    expect(done('skills.card:first')).toBe('false');
    fireEvent.click(screen.getByTestId('inspect-socket-0'));
    fireEvent.click(screen.getByTestId('rune-pick-quick'));
    expect(done('skills.card:first')).toBe('true');
  });
});
```

- [ ] **Step 2: Run it, and see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx)`
Expected: FAIL: `move-0` has no `data-tutorial`.

- [ ] **Step 3: The lane**

In `packages/client/src/features/delve/hub/skills/ChainLane.tsx`:

Replace:
```tsx
import { Glyph, Panel, Price, Segmented, layerZoom } from '@/features/delve/kit';
```
with:
```tsx
import { useDelveStore } from '@/stores/delveStore';
import { Glyph, Panel, Price, Segmented, layerZoom } from '@/features/delve/kit';
```

Replace:
```tsx
import { PAYMENTS, offPair, type ChainEditorModel } from '../../chains/useChainEditor';
```
with:
```tsx
import { PAYMENTS, offPair, type ChainEditorModel } from '../../chains/useChainEditor';
import { useTutorialStep } from '../../tutorial/tutorial-view';
```

Replace:
```tsx
  const message = useChainMessage((s) => s.text);
```
with:
```tsx
  const message = useChainMessage((s) => s.text);
  // The guided start's lesson: its step names how many moves the Primary should hold, and its
  // last move takes the pair's secondary.
  const lessonMoves = Number(useTutorialStep()?.trigger.filter?.moves);
  const secondary = useDelveStore((s) => s.profile.pair.secondary);
```

Replace:
```tsx
                  data-testid={`move-${i}`}
```
with:
```tsx
                  data-testid={`move-${i}`}
                  data-tutorial={
                    skill !== 'primary'
                      ? undefined
                      : i === 0
                        ? 'skills.card:first'
                        : i === entries.length - 1
                          ? 'skills.card:last'
                          : undefined
                  }
                  // As a way, a card is done once its move holds what selecting it is for.
                  data-tutorial-done={
                    i === 0
                      ? socketsOf(e).some((r) => r !== null)
                      : 'elements' in e && !!secondary && e.elements.includes(secondary)
                  }
```

Replace:
```tsx
                      data-tutorial={skill === 'primary' && i === 0 ? 'skills.socket' : undefined}
```
with:
```tsx
                      data-tutorial={skill === 'primary' && i === 0 ? 'skills.socket' : undefined}
                      data-tutorial-done={socketsOf(e).length > 0}
```

Replace:
```tsx
            data-tutorial={skill === 'primary' ? 'skills.addSlot' : undefined}
```
with:
```tsx
            data-tutorial={skill === 'primary' ? 'skills.addSlot' : undefined}
            data-tutorial-done={entries.length >= lessonMoves}
```

(With no lesson, or a step that names no `moves`, `lessonMoves` is `NaN` and the comparison is false. A Primary of one move has one card, keyed `first`; `skills.card:last` then finds nothing and the way goes on to the skill's row, which is right: its only move is selected.)

Why the cards say done themselves: `skills.elements` and `skills.rune` are on screen only while their move is selected, so once the player has set the last move's element and selected the first move for its socket, the elements' entry is off screen again and its way, the last card, is unselected. Without the card's own done the marker would send the player back to it (measured on the real page while drafting: the marker bounced between the two cards). With it, the walk passes the finished entry over.

- [ ] **Step 4: Run it, and see it pass**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run src/features/delve/hub/skills)
```

Expected: no type errors; PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/hub/skills/ChainLane.tsx packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx
git commit -m "feat(client): the chain lane's trail targets (the cards to select, Add slot, the sockets)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 13: The inspector: the elements, the socket row and the rune picker

**Files:**
- Modify: `hub/skills/MoveInspector.tsx`, `runes/RunePicker.tsx`
- Test: `hub/skills/__tests__/SkillsTab.trail.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx`, inside the describe, after the lane's test, add:
```tsx

  it('the inspector: the elements are a target on the last move only, done in the secondary; the socket row and its picker are skills.rune', () => {
    renderSkills();
    // Move 1 of 2 is selected: its elements are not the lesson's.
    expect(target('skills.elements')).toBeNull();
    fireEvent.click(screen.getByTestId('move-1'));
    expect(done('skills.elements')).toBe('false');
    fireEvent.click(screen.getByTestId('element-frost'));
    expect(done('skills.elements')).toBe('true');
    // The first move's socket row, once it has a socket.
    fireEvent.click(screen.getByTestId('move-0'));
    expect(target('skills.rune')).toBeNull();
    fireEvent.click(within(screen.getByTestId('sockets-0')).getByTestId('socket-open'));
    expect(target('skills.rune')).toBe(screen.getByTestId('inspect-socket-0'));
    expect(done('skills.rune')).toBe('false');
    // Its picker, a scope of its own, carries the same target on its list of runes.
    fireEvent.click(screen.getByTestId('inspect-socket-0'));
    const list = screen
      .getByTestId('rune-picker')
      .querySelector<HTMLElement>('[data-tutorial="skills.rune"]')!;
    fireEvent.click(within(list).getByTestId('rune-pick-quick'));
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(done('skills.rune')).toBe('true');
    expect(screen.getByTestId('chain-apply')).toHaveAttribute('data-tutorial', 'skills.apply');
    expect(screen.getByTestId('chain-apply')).toBeEnabled();
  });
```

- [ ] **Step 2: Run it, and see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx)`
Expected: FAIL at the first line after `renderSkills()`: `skills.elements` is on the first move's section (today it is a target whenever the Primary is chosen).

- [ ] **Step 3: The rune picker takes a target**

In `packages/client/src/features/delve/runes/RunePicker.tsx`:

Replace:
```tsx
  /** A pick, then `onClose`. */
  onPick: (rune: RuneRef) => void;
```
with:
```tsx
  /** The guided start's target the list of runes carries (`data-tutorial`): its field's, e.g. `skills.rune`. */
  tutorial?: string;
  /** A pick, then `onClose`. */
  onPick: (rune: RuneRef) => void;
```

Replace:
```tsx
  payment,
  ease,
  onPick,
  onPull,
  onClose,
}: RunePickerProps) {
```
with:
```tsx
  payment,
  ease,
  tutorial,
  onPick,
  onPull,
  onClose,
}: RunePickerProps) {
```

Replace:
```tsx
      <div className="flex flex-col gap-2">
        {rows.map(({ rune, count, dormant: idle }) => {
```
with:
```tsx
      <div className="flex flex-col gap-2" data-tutorial={tutorial}>
        {rows.map(({ rune, count, dormant: idle }) => {
```

(The target sits on the list, not on the picker's root: the root is the pad scope itself, and the marker looks inside the topmost scope. With no rune to offer the list is empty, so nothing is marked in the picker and the way out marks its Back.)

- [ ] **Step 4: The inspector**

In `packages/client/src/features/delve/hub/skills/MoveInspector.tsx`:

Replace:
```tsx
import { Button, Panel, Segmented } from '@/features/delve/kit';
```
with:
```tsx
import { useDelveStore } from '@/stores/delveStore';
import { Button, Panel, Segmented } from '@/features/delve/kit';
```

Replace:
```tsx
  const { stats, runes } = anvil.editor;
  if (ed.absent || !move)
```
with:
```tsx
  const { stats, runes } = anvil.editor;
  const secondary = useDelveStore((s) => s.profile.pair.secondary);
  if (ed.absent || !move)
```

Replace:
```tsx
  const offText = (m: ManaType) => (off.includes(m) ? ' · off-pair' : '');
```
with:
```tsx
  const offText = (m: ManaType) => (off.includes(m) ? ' · off-pair' : '');
  // The guided start's lesson (`l1-skills`): the Primary's last move takes the secondary, its
  // first move the rune. Each control is a target only on that move.
  const lessonLast = ed.skill === 'primary' && index === ed.entries.length - 1;
  const lessonFirst = ed.skill === 'primary' && index === 0;
```

Replace:
```tsx
          data-tutorial={ed.skill === 'primary' ? 'skills.elements' : undefined}
```
with:
```tsx
          data-tutorial={lessonLast ? 'skills.elements' : undefined}
          data-tutorial-done={
            'elements' in move && !!secondary && move.elements.includes(secondary)
          }
```

Replace:
```tsx
                  onClick={() => ed.openPicker(index, s)}
                  data-testid={`inspect-socket-${s}`}
```
with:
```tsx
                  onClick={() => ed.openPicker(index, s)}
                  data-testid={`inspect-socket-${s}`}
                  data-tutorial={lessonFirst && s === 0 ? 'skills.rune' : undefined}
                  data-tutorial-done={ed.sockets.some((x) => x !== null)}
```

Replace:
```tsx
        <RunePicker {...ed.picker} />
```
with:
```tsx
        <RunePicker {...ed.picker} tutorial={lessonFirst ? 'skills.rune' : undefined} />
```

- [ ] **Step 5: Run it, and see it pass**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run src/features/delve/hub/skills src/features/delve/runes src/features/delve/__tests__/StopPanel.test.tsx src/features/delve/__tests__/TrainingPanel.test.tsx)
```

Expected: no type errors; PASS (the stop's and the Training dock's pickers pass no `tutorial` and are as they were).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/hub/skills/MoveInspector.tsx packages/client/src/features/delve/runes/RunePicker.tsx packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx
git commit -m "feat(client): the move inspector's trail targets (elements on the last move, the socket row, the rune picker)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 14: The stop's cards and the open card's picker

**Files:**
- Modify: `StopPanel.tsx`
- Test: `__tests__/StopPanel.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`:

Replace:
```tsx
  it('shows the offered kinds as cards that expand in place to their picker, and once one is taken, says so', () => {
```
with:
```tsx
  it("keys each card for the guided start by its kind (stop.card), and marks the open card's picker (stop.pick)", () => {
    atStop(['equip', 'upgrade']);
    expect(screen.getByTestId('stop-equip')).toHaveAttribute('data-tutorial', 'stop.card:equip');
    expect(screen.getByTestId('stop-upgrade')).toHaveAttribute(
      'data-tutorial',
      'stop.card:upgrade',
    );
    fireEvent.click(screen.getByTestId('stop-equip'));
    // Open, the cards are gone; the picker's body is the target, inside the picker's own scope.
    expect(document.querySelector('[data-tutorial^="stop.card"]')).toBeNull();
    const pick = document.querySelector('[data-tutorial="stop.pick"]')!;
    expect(screen.getByTestId('stop-picker')).toContainElement(pick as HTMLElement);
    expect(pick).toContainElement(screen.getByTestId('stop-equip-item'));
    expect(pick).not.toContainElement(back());
  });

  it('shows the offered kinds as cards that expand in place to their picker, and once one is taken, says so', () => {
```

- [ ] **Step 2: Run it, and see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/StopPanel.test.tsx)`
Expected: FAIL: `stop-equip` has no `data-tutorial`.

- [ ] **Step 3: The cards and the picker's body**

In `packages/client/src/features/delve/StopPanel.tsx`:

Replace:
```tsx
              data-pad-first={i === 0 || undefined}
              data-testid={`stop-${kind}`}
```
with:
```tsx
              data-pad-first={i === 0 || undefined}
              data-testid={`stop-${kind}`}
              data-tutorial={`stop.card:${kind}`}
```

Replace:
```tsx
      {kind === 'equip' && <EquipPick take={take} />}
      {kind === 'slot' && <SlotPick take={take} dryRun={ops.dry} />}
      {kind === 'move' && <MovePick take={take} dryRun={ops.dry} />}
      {kind === 'upgrade' && <UpgradePick take={take} />}
      {kind === 'rune' && <RunePick take={take} />}
```
with:
```tsx
      {/* The guided start's `stop.pick`: the picker's body (its root is the pad scope itself). */}
      <div data-tutorial="stop.pick">
        {kind === 'equip' && <EquipPick take={take} />}
        {kind === 'slot' && <SlotPick take={take} dryRun={ops.dry} />}
        {kind === 'move' && <MovePick take={take} dryRun={ops.dry} />}
        {kind === 'upgrade' && <UpgradePick take={take} />}
        {kind === 'rune' && <RunePick take={take} />}
      </div>
```

- [ ] **Step 4: Run it, and see it pass**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/StopPanel.test.tsx src/features/delve/__tests__/FloorDialogs.test.tsx)`
Expected: PASS (the alcove's dialog shows the same cards; a kit dialog is not nested, so it gets no way out).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/StopPanel.tsx packages/client/src/features/delve/__tests__/StopPanel.test.tsx
git commit -m "feat(client): stop.card and stop.pick, the stop's power-up cards and the open card's picker" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 15: Every target is placed

**Files:**
- Modify: `tutorial/__tests__/tutorial-targets.test.tsx`

- [ ] **Step 1: The test, with nothing pending**

In `packages/client/src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx`:

Replace:
```ts
/** The trails' new targets, until plan 03's tasks place them (Task 15 empties and removes this). */
const PENDING: TutorialTarget[] = [
  'stop.pick',
  'forge.bench',
  'temper.line',
  'temper.go',
  'mana.confirm',
  'skills.rune',
  'quests.done',
];
```
with:
```ts
/** A keyed target is placed by its template (`` `forge.bar:${…}` ``) or by its whole name (`'skills.card:last'`). */
const placedKeyed = (t: string) =>
  sources.some((s) => s.includes('`' + t.split(':')[0] + ':${') || s.includes(`'${t}'`));
```

Replace:
```ts
    const named = TUTORIAL_TARGETS.filter(
      (t) => !t.startsWith('hub.tab.') && t !== 'temper.hone' && !PENDING.includes(t),
    );
    expect(named.filter((t) => !placed(t))).toEqual([]);
  });
```
with:
```ts
    const named = TUTORIAL_TARGETS.filter((t) => !t.startsWith('hub.tab.') && t !== 'temper.hone');
    expect(named.filter((t) => !placed(t))).toEqual([]);
  });

  it('every trail entry and every way is placed too, a keyed one by its template or its whole name', () => {
    const steps = getDelveRegistry().getTutorialData().steps;
    const named = new Set<string>(
      [...steps.flatMap((s) => s.trail ?? []), ...Object.values(WAY_TO)].filter(
        (t) => !t.startsWith('hub.tab.'),
      ),
    );
    expect([...named].filter((t) => !(t.includes(':') ? placedKeyed(t) : placed(t)))).toEqual([]);
  });
```

`PENDING` was the file's last use of the `TutorialTarget` type, and the client's `tsc` refuses an unused import:

Replace:
```ts
import { TUTORIAL_TARGETS, type TutorialTarget } from '@alloy/engine';
```
with:
```ts
import { TUTORIAL_TARGETS } from '@alloy/engine';
```

- [ ] **Step 2: Run the whole client suite**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run)
```

Expected: no type errors; PASS, with the baseline's count plus this plan's new tests. A target listed by either placement test has no control: go back to its task in the Targets table.

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx
git commit -m "test(client): every tutorial target, trail entry and way sits on a control" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 5: The E2E

### Task 16: TU01 follows the marker

TU01 takes about five minutes a run (the bot plays dive 1), so it is written once, here, with every control in place; it is expected to pass first time. A failing `marked(…)` names the trail entry whose control lacks its attribute or its done state.

**Files:**
- Modify: `packages/client/e2e/delve-tutorial.spec.ts`

The blocks quoted below are TU01's as of `da69a3b0`, and plan 02's drafter confirmed 02 leaves each of them as quoted (02 changes `fresh()`'s body, which now installs the resting pad, the lines after `'new hand'`, the stop's first three lines and the beat branch). `await expect(highlight).toBeVisible();` occurs three times in TU01: the stop's block below is the one followed by the `stop-equip` click.

- [ ] **Step 1: The marker's helper**

Replace:
```ts
    const highlight = page.getByTestId('tutorial-highlight');
    await expect(panel.getByTestId('tutorial-line')).toContainText('new hand');
```
with:
```ts
    const highlight = page.getByTestId('tutorial-highlight');
    /** The marker is on `target`: a trail's entry, a way to it, or the step's highlight. */
    const marked = (target: string) => expect(highlight).toHaveAttribute('data-target', target);
    await expect(panel.getByTestId('tutorial-line')).toContainText('new hand');
```

- [ ] **Step 2: The stops' trails**

Replace:
```ts
          await expect(highlight).toBeVisible();
          await door.getByTestId('stop-equip').click();
          await door.getByTestId('stop-equip-item').first().click();
```
with:
```ts
          // The marker leads both clicks: the card, then its picker.
          await marked('stop.card:equip');
          await door.getByTestId('stop-equip').click();
          await marked('stop.pick');
          await door.getByTestId('stop-equip-item').first().click();
```

Replace:
```ts
          await expect(roads.first()).toBeDisabled();
          await door.getByTestId('stop-move').click();
          const picker = door.getByTestId('stop-picker');
```
with:
```ts
          await expect(roads.first()).toBeDisabled();
          await marked('stop.card:move');
          await door.getByTestId('stop-move').click();
          await marked('stop.pick');
          const picker = door.getByTestId('stop-picker');
```

- [ ] **Step 3: The forge's trail, click by click, and the cuirass by the pad**

Replace:
```ts
    // Forge an uncommon cuirass and wear it.
    await expect.poll(() => step(page)).toBe('l1-forge');
    await page.getByTestId('tab-forge').click();
    await page.getByTestId('pattern-cuirass').click();
    await page.getByTestId('flux-uncommon').click();
    await page.getByTestId('forge-button').click();
    await expect.poll(() => step(page)).toBe('l1-equip');
    await page.getByTestId('tab-loadout').click();
    await page.locator('[data-testid="bag-item"][aria-label*="Cuirass"]').first().click();
    await page.getByTestId('equip-button').click();
```
with:
```ts
    // Forge an uncommon cuirass: the marker leads every click of the trail.
    await expect.poll(() => step(page)).toBe('l1-forge');
    await marked('hub.tab.forge');
    await page.getByTestId('tab-forge').click();
    await marked('forge.pattern:cuirass');
    await page.getByTestId('pattern-cuirass').click();
    // The Rusty bar is the bench's own first pick, done already: on to the flux.
    await marked('forge.flux:uncommon');
    await page.getByTestId('flux-uncommon').click();
    await marked('forge.shard');
    await page.getByTestId('shard-slot-0').click();
    // In the shard picker's own scope the picker is the target (the chest's Max Life shard).
    await expect(page.getByTestId('shard-picker')).toBeVisible();
    await marked('forge.shard');
    await page.getByTestId('shard-pick-maxHp-1').click();
    await marked('forge.go');
    await page.getByTestId('forge-button').click();

    // Wear it, by the pad: LB steps to the Loadout (the first press takes the input lock). The
    // marker's focus lands on the cuirass, a focused tile is selected, so that entry is done and
    // the marker and the focus move on to Equip; A equips.
    await expect.poll(() => step(page)).toBe('l1-equip');
    await marked('hub.tab.loadout');
    await tap(page, BUTTON.lb);
    await tap(page, BUTTON.lb);
    await expect(page.getByTestId('loadout-tab')).toBeVisible();
    await marked('loadout.equip');
    await expect(page.getByTestId('item-sheet')).toContainText('Cuirass');
    await expect(page.getByTestId('equip-button')).toBeFocused();
    await tap(page, BUTTON.a);
```

(The tabs run Loadout, Skills, Forge, Codex, Quests: two LB from Forge. The next lines of TU01 poll for `l1-bind` and go on with the mouse, which takes the lock back.)

- [ ] **Step 4: Run TU01 at both sizes**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts --project=desktop -g TU01)
(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts --project=desktop-1080 -g TU01)
```

Expected: PASS, both (about five minutes each). If `marked('loadout.equip')` times out with the marker still on `loadout.bag:chest.uncommon`, the pad's focus did not reach the tile: check that the marker's focus rule (plan 02) fired for the new marked id, before touching this plan's code.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/e2e/delve-tutorial.spec.ts
git commit -m "test(client): TU01 follows the marker along the stops', the forge's and the cuirass's trails" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 17: The whole check

**Files:** none.

- [ ] **Step 1: The engine**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx tsup)
(cd packages/engine && npx vitest run tests/delve-tutorial)
```

Expected: "Build success"; every `delve-tutorial-*` file PASS (the bot's included: slow).

- [ ] **Step 2: The client**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-pad-nav.spec.ts --project=desktop)
(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-pad-nav.spec.ts --project=desktop-1080)
```

Expected: no type errors; every unit test PASS; TU01, TU02, TU03, the gamepad spec and 01's audit PASS at both sizes. (The audit's seeded save has no tutorial, so no control is marked and its allowances don't move; a bag tile, a card and a Segmented option gain an attribute, never a stop.)

- [ ] **Step 3: Report**

Nothing to commit. Report to the caller: the tasks' commits, the test counts, and either of these if it turned up: a target the placement test listed outside `PENDING` (Task 3), or one of 02's tests that met the way out (Task 6).

## For plan 04's hand walk

A field and its picker carry the same target (`forge.shard`: the Lines field and the shard picker; `skills.rune`: the socket row and the rune picker), so pressing A on the marked field changes the topmost scope but not the marked id. Plan 02's marker refocuses on either change (its key is the step and marked id, plus the marked element's pad scope). On a real pad at `l1-forge` and `l1-skills`, check that opening each picker puts the focus on its marked list, not on its Back.
