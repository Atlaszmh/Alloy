# Delve pad-first UI, phase 4 (Skills) — plan overview

**Spec (authoritative):** `docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md` (section 1, the grammar, binds everything; section 5 is this phase), with the edits proposed below. The decisions passed down with this phase (the skill strip on LT/RT, the cards as the home row, A opening a move's editor of rows and grids, X removes and Y opens the Apply sheet with no hold anywhere, Position replacing the carry, Try in Training, the lesson's trail through the editor, the measures, v0.68.0) are settled: these plans build them.

**Goal:** the Skills tab is a strip, a chain and a pane. LT/RT step the four skills (an uncarried one dimmed with its "carried by" line; the mana pair and its Realign sit in the strip). The chain's cards are the home row: focus selects a card, A opens its editor (a nested pad scope of rows: Kind, Form, Elements, each socket, Open a socket, Position, the chain's Payment), Form and a socket open a grid of what fits, each option with its line and what it does to the chain's damage a second, and every change shows at once in the chain's numbers beside it. X removes a move; Y opens the Apply sheet (each change, the price, what is destroyed; A applies, B returns; Try in Training; Discard). No hold, no carry. v0.68.0.

Six plans, executed in order on one branch. Each ends green (types, unit tests, the E2E it names).

| Plan | Owns |
|---|---|
| `01-strip.md` | `hub/skills/SkillStrip.tsx` (new; `SkillList.tsx` goes), `hub/skills/SkillsTab.tsx` (the layout: strip over lane and pane), `ChainLane.tsx` (the summary line moves in; `data-pad-first` on the chosen card; focus selects), `__tests__/harness.tsx` (`Panes`), the tests that read the list, and the E2E heads that start from a list row (PN03, G06, G07) |
| `02-editor.md` | `chains/useChainEditor.ts` (`shift`'s focus flag, `dps` and `dpsWith`), `chains/chain-text.ts` (`damageShift`), `hub/skills/MoveRows.tsx` (new: the editor), `hub/skills/FormPicker.tsx` (new: the form grid), `runes/RunePicker.tsx` (`grid`, `damage`), `MoveInspector.tsx` (the pane: the detail with no stops, or the editor), `ChainLane.tsx` (A opens the editor; the toolbar and the payment chips go; the card's pips open the editor at a socket), `SkillsTab.tsx` (`editing`, B), the inspector's E2E call sites (D04, R01, R05, G06, G07, TU01's clicks) |
| `03-apply-sheet.md` | `hub/skills/ApplySheet.tsx` and `hub/skills/draft-lines.ts` (new), `ApplyBar.tsx` (Apply opens the sheet; Revert and Apply leave the D-pad), `SkillsTab.tsx` (X, Del, Y, Ctrl+Enter; the carry goes), `kit/prompts.ts`, `kit/index.ts`, `kit/types.ts`, `kit/glyphs.tsx`, `kit/KitGallery.tsx`, `features/gamepad/use-gamepad-nav.ts` (`captureNav`, `navCapture`, `padHold` go), `e2e/fixtures/delve.ts` (`applyDraft`), every `chain-apply` E2E call site |
| `04-try-in-training.md` | `useAnvilChains.ts` (`draftEquipped`), `ApplySheet.tsx` (Try in Training), `pages/DelveTraining.tsx` (back with the link it came with), `hub/AnvilHub.tsx` (the router state's link as `initial`), a new `delve-training.spec.ts` T04 |
| `05-tutorial.md` | the guided start through the editor: `SkillsTab.trail.test.tsx` and `marked-trails.test.ts` (the editor's order and its way out), TU01 following the marker through `l1-skills`, TU03's asserts; the engine untouched unless a line changes (then the data tests and the bot) |
| `06-close.md` | `e2e/delve-pad-nav.spec.ts` (PN01's new screens, `CEILING`, `ALLOW`, PN07's fourth budget), the responsive Anvil spec, the phase's full run, the spec edits, `CLAUDE.md`, the version |

**Why these cuts.** The strip (01) is small but moves the pad's landing (the list rows were stops; the kit tabs are not), so the E2E that start from a row are fixed once, there. The editor (02) is the bulk: it takes every inspector control off the pane and puts it in rows, so the tests that click `kind-*`, `form-*`, `element-*`, `infusion-*`, `payment-*` and the toolbar move once, with it. X / Y and the Apply sheet (03) touch the prompts and the store's apply path only; the carry and `captureNav` can only go once Position (02) exists. Try in Training (04) needs the sheet (03) as its home: the sheet is the one place every device reaches with a draft in hand (the footer's buttons leave the D-pad in 03). The tutorial (05) adds what no plan owns alone: the marker's walk through the editor end to end. The trail's six names do not change, only where they sit, so plan 02 moves the placements and keeps TU01 green by clicks, and 05 makes TU01 follow the marker.

## Grouping for implementers

Two or three plans to one agent, to save context; each group shares files and tests:

| Group | Plans | Why together |
|---|---|---|
| A | `01-strip.md` + `02-editor.md` | Both rewrite `SkillsTab.tsx`, `ChainLane.tsx`, `MoveInspector.tsx`, the harness and `SkillsTab.chains.test.tsx`; G06/G07 and PN03 are touched in both. Run 01's E2E only at 02's end if the same agent does both (see the test policy). |
| B | `03-apply-sheet.md` + `04-try-in-training.md` | 04 adds a button to 03's sheet and reads its draft; both touch `SkillsTab.test.tsx` and the store's apply path. |
| C | `05-tutorial.md` + `06-close.md` | 05's TU01 run feeds 06's full run; both are tests and docs only. |

A group runs its plans in order and commits each plan's tasks as written. When one agent does 01 and 02, it may skip 01's end-of-plan E2E and run the union of 01's and 02's specs once at 02's end.

## Branch

Phase 3 is merged into `padui/main` (v0.67.0). In the worktree `C:/Projects/alloy-padui` (never touch `C:/Projects/Alloy`):

```bash
cd /c/Projects/alloy-padui
git switch padui/main
git switch -c padui/p4
```

## Commands

All from `/c/Projects/alloy-padui` in Git Bash.

```bash
# Client types, one test file, the related tests of changed files, the whole suite
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run <path>)
(cd packages/client && npx vitest related --run <src files…>)
(cd packages/client && npx vitest run)
# Client E2E (starts its own Vite on :5199): one spec, one project, the summary into a scratch file
(cd packages/client && npx playwright test e2e/<file>.spec.ts --project=desktop --reporter=line > "$SCRATCH/e2e-<plan>.txt" 2>&1; tail -n 30 "$SCRATCH/e2e-<plan>.txt")
# The responsive specs
(cd packages/client && npx playwright test --project=responsive e2e/responsive/specs/<file>.spec.ts --reporter=line > "$SCRATCH/resp.txt" 2>&1; tail -n 30 "$SCRATCH/resp.txt")
# Engine (only if a plan changes tutorial data: plan 05's fallback)
(cd packages/engine && npx tsc --noEmit -p . && npx tsup)
(cd packages/engine && npx vitest run tests/delve-tutorial-data.test.ts tests/delve-tutorial-contract.test.ts tests/delve-tutorial-review.test.ts tests/delve-tutorial-save.test.ts)
(cd packages/engine && npx vitest run tests/delve-tutorial-bot.test.ts)   # long: in the background
```

`$SCRATCH` is the implementer's own scratchpad directory (never the repo). If Playwright says port 5199 is in use: `netstat -ano | grep ":5199" | grep LISTENING`. This worktree's stale Vite: `taskkill //PID <pid> //F //T`; another checkout's: wait for it.

**The engine is not edited in this phase.** The lesson's trail keeps its six names (`skills.primary`, `skills.addSlot`, `skills.elements`, `skills.socket`, `skills.rune`, `skills.apply`); the controls carrying them move (plan 02), so no target, trail or check changes. If a plan finds it must change `tutorial.json` (a line that names a control that is gone), it is that plan's to do, with `npx tsup` and the tutorial tests and bot after it (plan 05, Task 4). Anything else in the engine: stop and report.

**Baseline.** Before Task 1 of plan 01, on `padui/p4` fresh from `padui/main`, run

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

and write the count into this section ("Baseline (recorded <date> on `padui/main` at `<sha>`): client `tsc` clean, `vitest run` N files, M tests; all passing"). Phase 3 closed at 136 files and 1234 tests plus its own; read the real numbers. The engine's baseline is not needed: it is not touched (plan 05's fallback runs only the tutorial files). If the client baseline is not green, stop: phase 3 did not close.

Baseline (recorded 2026-10-05 on `padui/main` at `c6ae5dd5`): client `tsc` clean, `vitest run` 139 files, 1293 tests; all passing.

## Conventions

- Match the surrounding code: a doc comment on every export in the project's plain voice; components in PascalCase files (`SkillStrip.tsx`, `MoveRows.tsx`, `FormPicker.tsx`, `ApplySheet.tsx`), helpers kebab-case (`draft-lines.ts`); `UPPER_SNAKE_CASE` constants.
- No game logic in the client: every price, refusal and number is the engine's (`draftPrice`, `setChains` run dry, `chainCycle`, `resolveChain`, `moveNumbers`). The grids' "what it does to the chain's damage" is `chainCycle` on the chain with the option in place, compared with the chain as it is: a what-if through the engine, no rule of the client's.
- Pixel art from the kit's `Glyph`; never an emoji (◂ ▸ ⇄ › are text, as today).
- TDD: the failing test first, run it, the minimal code, run it, commit.
- Commits: `feat(client): …`, `test(client): …`, `refactor(client): …`, `docs: …`, each message ending with

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

- Never push. Never switch branches in, or write to, `C:/Projects/Alloy`.
- jsdom has no layout: unit tests give each element a box by overriding `getBoundingClientRect` (the `boxed` helper in `AnvilHub.test.tsx`) where a test needs `nextFocus`.
- **A pad press in a unit test** goes through the prompts as the nav hands it over: `padPrompts(new Set([button]), held(button), now)` then a release frame (`held` as `SkillsTab.test.tsx` defines it). A D-pad press goes through `moveFocus(dir)` (exported from `use-gamepad-nav.ts`); a stepper's left/right is its `PAD_STEP` event (or `keyDown` ArrowLeft/ArrowRight on it, which the kit `Stepper` handles the same).
- Test ids are the E2E's contract; the table below is the whole change.

### The test policy (the user's)

- **During a task:** only the test files the task touches (`npx vitest run <path>`), plus `npx tsc --noEmit -p .`.
- **At each commit:** `npx vitest related --run <the src files the commit changes>`.
- **The full client suite** (`npx vitest run`): once, at each plan's end.
- **E2E per plan:** only the specs covering the screens it changed, `--project=desktop`, once at the plan's end, with `--reporter=line` (or `dot`) into a scratchpad file, reading only its summary (`tail`). Add `--project=desktop-1080` only when the plan changed a layout; add `delve-pad-nav.spec.ts` only when it changed stops or focus. Each plan's last task names its specs exactly.
- **The phase's close** (plan 06): the full `delve*.spec.ts` at both sizes and the responsive project, once.
- **Engine:** only the touched tests; `delve-tutorial-bot.test.ts` only when tutorial data changes; never the pacing suites (no balance or data rule changes here).
- **Flakes** (D02, Q01, the economySim timeout under load, responsive `delve-stop` at qhd-1440p and ultrawide): rerun that one test alone once (`-g "<id>"`); never re-run a whole suite for one.

## Proposed spec edits

To make in the spec's section 5 (and the Evidence table and the grammar where named) in the close (plan 06, Task 4), each a sentence or two:

1. **The editor is a nested view.** Add: "The editor is the move pane's nested view (B, or Esc, closes it onto its card); with the editor shut the pane is the focused move's detail and has no stops. The Form and socket grids are views nested in it. Mid-dive (the pause) A only selects: nothing opens."
2. **Elements as one stepper.** Add: "Elements steps through every set the move may take: each element of the pair (and its own off-pair one), then each ordered pair, main element first ('Fire + Frost', 'Frost + Fire'); the swap button goes."
3. **What a grid option does.** Replace "what it does to the chain's damage" with "what it does to the chain's damage a second (`chainCycle`'s damage over its seconds, so a Quick rune counts); a basic blow's options show none".
4. **The Apply sheet.** Add: "Every device opens it (Y, Ctrl+Enter, the footer's Apply); it opens whenever the draft holds a change, its Apply disabled with the engine's reason when it would be refused. It also offers Try in Training and Discard changes (which reverts the draft). The footer's Revert and Apply stay for the mouse, off the D-pad."
5. **Try in Training's home.** Replace "the builder's button" with "the Apply sheet's Try in Training: it loads the draft into the sandbox as Load my build loads your build (the sandbox's own loadout is replaced), and the Training Grounds' way back opens Skills on the same skill with the draft as it was".
6. **No hold is left.** Rule 1's parenthesis gains: "phase 4 retired the prompt runtime's hold (`padHold`): no menu prompt uses one."
7. **The Evidence table's Skills row** gets the measured counts (plan 06): "Skills (strip and chain) n; the move editor n; the Apply sheet 4".
8. **The press budget** in Measures: "change a move's element and apply" measured at n D-pad presses (plan 06).

## Contracts between the plans

### Test ids

| Test id | Before | After |
|---|---|---|
| `chain-skill-<basic\|primary\|defensive\|ultimate>` | the left pane's rows (`role="tab"`, D-pad stops, combat glyphs) | the strip's kit sub `Tabs` (`aria-selected`; off the D-pad, LT/RT); `data-absent` on an uncarried skill, whose label is its "carried by" line (01) |
| `skill-strip` | — | the strip (01) |
| `mana-pair`, `mana-realign` | the left pane's box | in the strip (01) |
| `abilities-summary` | the chosen row's line | the chain lane's line under its heading (the chain's names, or the "carried by" line) (01) |
| `move-<i>` | a card; click selects | a card; focus selects; click or A opens the editor (selects only while locked); the chosen card carries `data-pad-first` (01, 02) |
| `move-left-<i>`, `move-right-<i>`, `move-remove-<i>` | the chosen card's toolbar (Anvil) | gone at the Anvil (02); the Training dock's `ChainEditor` keeps its own |
| `payment-<mana\|charge\|cast>` | the lane's segmented chips (Anvil) | gone at the Anvil: `chain-payment` (02); the dock's `ChainEditor` keeps its chips |
| `kind-<k>`, `element-<m>`, `infusion-<m>`, `swap-elements` | the inspector's segmented controls (Anvil) | gone at the Anvil: `move-kind`, `move-elements` (02); the dock's and the stop's `MoveEditor` keep theirs |
| `move-editor`, `move-editor-back`, `move-remove` | — | the editor (a nested `data-pad-scope`), its Back (B, Esc; `data-pad-back`, off the D-pad) and Remove (X, Del; off the D-pad) (02, 03) |
| `move-kind`, `move-elements`, `move-position`, `chain-payment` | — | the editor's kit `Stepper`s (`role="spinbutton"`, `aria-valuetext`) (02) |
| `move-form` | — | the editor's Form row; A opens `form-picker` (02) |
| `form-picker`, `form-picker-back`, `form-<id>`, `form-damage-<id>` | `form-<id>` were segmented options | the form grid (a nested scope): one button a form of the slot, its line and its damage shift; a form a socketed rune doesn't fit disabled with why (02) |
| `inspect-socket-<s>` | the inspector's socket rows | the editor's socket rows (A opens the rune grid) (02) |
| `socket-open` | inside the card's `sockets-<i>` | the editor's "Open a socket" row; the card's pips show no "+ socket" (02) |
| `sockets-<i>`, `socket-<s>` (on a card) | the card's pips, a tap opens the picker | the same, off the D-pad (`data-pad-skip`); a click opens the editor at that socket's grid (02) |
| `rune-damage-<id>` | — | a rune grid option's damage shift (02) |
| `ability-readout` | the inspector | the move pane: the detail (no stops), or the editor inside it (02) |
| `chain-apply` | applies (Ctrl+Enter, Y held) | opens the Apply sheet (label still "Apply · price"); `data-pad-skip` (03) |
| `chain-revert` | a footer stop | the same, `data-pad-skip` (03) |
| `apply-sheet`, `apply-line-<skill>`, `apply-sheet-price`, `apply-sheet-why`, `apply-sheet-confirm`, `apply-sheet-discard`, `apply-sheet-try` | — | the Apply sheet (03, 04) |
| `data-carried` (a card) | the pad's carried card | gone (03) |

### Store fields, functions and props

- `useChainEditor`: `shift(i, by, focus = true)` (Position passes `false`: the focus stays in the editor), `dps: number | null` (the chosen ability chain's damage a second), `dpsWith(next: Move): number | null` (the same with the chosen move replaced) (02).
- `damageShift(now, then): string | null` in `chains/chain-text.ts`: "+8% chain damage a second", "Chain damage a second unchanged" (02).
- `MoveRows({ ed, anvil, onClose })`, `FormPicker({ ed, onClose })` (02); `RunePickerProps.grid?: boolean`, `RunePickerProps.damage?: (rune: RuneRef) => string | null` (02).
- `SkillStrip({ ed, anvil, onMana })` (01).
- `draftLines(registry, stats, saved, changes): DraftLine[]` (`hub/skills/draft-lines.ts`), `ApplySheet({ skill, onClose })` (03).
- `APPLY_BINDING` becomes `{ key: 'Enter', ctrl: true, pad: 'y' }` (no `padHold`); `applyChains()` unchanged (03).
- Gone: `captureNav`, `navCapture`, `NavInput` (`kit/prompts.ts`), `Binding.padHold` and the runtime's hold (03).
- `draftEquipped(registry, equipped, chains): EquippedGear` (`useAnvilChains.ts`) (04).
- The router state: `/delve/training` takes `{ back?: HubLink }`; `/delve` takes `{ link?: HubLink }`, which `AnvilHub` hands `useHubTabs` as `initial` (04).

### E2E fixture (`e2e/fixtures/delve.ts`)

```ts
/** Apply the Skills tab's draft: the footer's Apply opens the Apply sheet, whose Apply applies it. (plan 03) */
export async function applyDraft(page: Page): Promise<void>;
```

### The guided start's targets this phase moves

| Target | Before | After | Done rule |
|---|---|---|---|
| `skills.primary` | the left pane's Primary row | the strip's Primary tab (`Tabs`' `tutorial`) | `aria-selected` |
| `skills.mana` | the mana box's Realign | the strip's Realign | none (a way) |
| `skills.card:first`, `skills.card:last` | the Primary's first and last cards | the same (A opens the editor now) | unchanged: the first holds a rune, the last a secondary |
| `skills.addSlot` | + Slot | unchanged | the Primary at the lesson's moves |
| `skills.elements` | the inspector's Elements section | the editor's Elements stepper, on the Primary's last move only (`Stepper`'s `tutorial`, `done`) | its elements include the secondary |
| `skills.socket` | the first card's pips (done at one socket) | the editor's "Open a socket" row, on the Primary's first move only | the move has a socket |
| `skills.rune` | the inspector's socket 0 row and the picker's list | the editor's socket 0 row and the rune grid's list, on the Primary's first move | the socket holds a rune |
| `skills.apply` | the footer's Apply | the footer's Apply (it opens the sheet) and the sheet's Apply | none (applying ends the step) |

`WAY_TO` is unchanged: `skills.elements` → `skills.card:last`, `skills.socket` and `skills.rune` → `skills.card:first`, and the editor's Back is the way out of it (`wayOut`, a nested scope) once its move has what the lesson wanted. No new target, so `TUTORIAL_TARGETS` and the data checks are untouched.

### From phases 1 to 3, relied on

The kit `Stepper` and `PAD_STEP` (phase 3), `keepFocus` starting a scope on its `[data-pad-first]`, `stepTabs` landing on a tab's `[data-pad-first]` control, the kit `Dialog` (its own scope, `data-pad-first` for the first focus), the Depart sheet (`startDive(page)`), `stepTo(page, testId, value)`, `wayOut` (a nested scope's Back), the pad audit's `check`, `presses` and `BUDGET`.
