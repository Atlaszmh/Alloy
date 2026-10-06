# Delve pad-first UI, phase 3 (Loadout and Forge) — plan overview

**Spec (authoritative):** `docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md` (sections 1 and 4), with the edits proposed below. The decisions passed down with this phase (the bag's filters on LT/RT, the compare pane's verdict, Salvage with a 5-second Undo on B, the junk sheet, Help, the bench's rows, the Materials bench, Temper's list, tab memory, the guided start's targets, the measures) are settled: these plans build them.

**Goal:** the Loadout is a bag and a doll the D-pad walks, with the compare pane following the focus and the footer's A / X / Y acting on the focused tile; X salvages at once and B takes it back for 5 seconds; Salvage junk asks through a review sheet; How to delve becomes Help (the system menu, the pause, the Codex); the Forge bench is rows (steppers over what the save holds) beside a preview with the item's Power as a range; Materials is a third bench; Temper is one list of six operations; each tab comes back to its selection. v0.67.0.

Seven plans, executed in order on one branch. Each ends green (types, unit tests, the E2E it names).

| Plan | Owns |
|---|---|
| `01-loadout.md` | `hub/types.ts` (`HubMemory`, `BagFilter`, the forge bench union), `hub/AnvilHub.tsx` (`useHubTabs`' memory), `hub/loadout/LoadoutTab.tsx` (the footer's A / X / Y / R3, the take sheet, the doll's focus), `BagPane.tsx` (the filter `Tabs`, `data-pad-first`, `data-uid`), `ComparePane.tsx` (`verdictOf`, the verdict line, `data-pad-skip` on the actions, `data-pad-scroll`), `BindChoice.tsx` (off the D-pad until asked), `EquippedPane.tsx` (focus selects; no focus tooltip under the pad; the two shortcuts off the D-pad), `TakeSheet.tsx` (new), `kit/types.ts` and `kit/glyphs.tsx` (`Prompt.tutorial`), `kit/Tile.tsx` (`data-delta`), `features/gamepad/use-gamepad-nav.ts` (the right stick scrolls `[data-pad-scroll]`), the Loadout's E2E call sites (G08, PN02, D02) |
| `02-salvage.md` | `stores/delveStore.ts` (`undo`, `undoSalvage`, `UNDO_MS`), `LoadoutTab.tsx` (X at once, the Undo prompt; the arming goes), `ComparePane.tsx` (Salvage's label), `hub/loadout/JunkSheet.tsx` (new), `BagPane.tsx` (Salvage junk opens it) |
| `03-help.md` | `hub/help/help-topics.tsx` and `hub/help/HelpDialog.tsx` (new; `hub/HowTo.tsx` goes), `hub/SystemMenu.tsx` and `hub/PauseScreen.tsx` (the Help entry), `hub/codex/CodexTab.tsx` (the Help section), `pages/DelveCamp.tsx` (met once after Jump in), `LoadoutTab.tsx` (the how-to leaves), the E2E that read `delve-howto` |
| `04-materials-temper.md` | client: `kit/controls.tsx` (`Stepper`), `kit/types.ts`, `kit/index.ts`, `kit/kit.css`, `use-gamepad-nav.ts` (`PAD_STEP`), the pad audit's `next` (a stepper owns left/right); engine: `src/types/tutorial.ts` (`forge.materials`); client: `ForgeTab.tsx` (the third bench, the bench's and gear row's memory), `MaterialsPane.tsx` (three panels: rows with Refine on the row, the shard bench's stepper, the runes), `materials-text.ts` (`DROPS_FROM`), `Temper.tsx` (the list, the detail panel), `GearList.tsx` (`data-pad-first`; the chips off the D-pad), `tutorial/marked.ts` (`WAY_TO`), the E2E that refine, fuse or temper |
| `05-forge.md` | engine: `src/delve/crafting.ts` (`forgePowerRange`), `tests/delve-forge-power.test.ts` (new), `src/data/tutorial.json` (`l1-forge`'s trail); client: `hub/forge/ForgeBench.tsx` (rows of steppers, the preview with the Power range), `ForgeTab.tsx` (the pattern's memory), `e2e/fixtures/delve.ts` (`stepTo`), the Forge bench's E2E call sites (D10, TU01's forge, the responsive Anvil spec, PN04) |
| `06-tutorial.md` | the guided start end to end: TU01 by the new controls, a new TU04 (lesson 2 by the pad: the take sheet's Transfer, Temper's Hone), `marked-trails.test.ts`, `tutorial-targets.test.tsx`, the engine's tutorial tests and bot |
| `07-close.md` | `e2e/delve-pad-nav.spec.ts` (the audit's new screens, `CEILING`, PN07's press budgets), the responsive Anvil specs, the full run at both sizes, the spec edits, `CLAUDE.md`, the version |

Why these cuts, and why Materials comes before the Forge bench (the brief suggested the other order): the Loadout (01) and Salvage (02) share `LoadoutTab.tsx`, but Undo touches the store and has its own tests, so it lands second on a Loadout already rebuilt. Help (03) is independent but removes the Loadout's how-to branch, so it follows 01. The Materials pane sits beside both benches today; moving it to its own bench first (04) frees the Forge bench's third column for the preview (05), so every E2E that refines or fuses moves once, and the kit `Stepper` lands with its first, smaller user (the shard bench) before the forge's rows lean on it. The Forge bench (05) owns the only engine helper. Each plan keeps TU01 green for the controls it moves (the refine's way in 04, the trail's forge entries in 05); 06 adds what no plan owns alone: lesson 2 by the pad, and the bot and the schema tests once all the data has changed. The tab memory is in the hub (01) with the Loadout's use; the Forge's bench and gear row (04) and pattern (05) plug into it.

## Branch

Phase 2 is merged into `padui/main` (v0.66.0). In the worktree `C:/Projects/alloy-padui` (never touch `C:/Projects/Alloy`):

```bash
cd /c/Projects/alloy-padui
git switch padui/main
git switch -c padui/p3
```

## Commands

All from `/c/Projects/alloy-padui` in Git Bash.

```bash
# Client types and unit tests
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run <path-or-filter>)
# Client E2E (starts its own Vite on :5199; one project is enough while iterating)
(cd packages/client && npx playwright test e2e/<file>.spec.ts --project=desktop)
(cd packages/client && npx playwright test e2e/<file>.spec.ts --project=desktop-1080)
# The responsive specs
(cd packages/client && npx playwright test --project=responsive e2e/responsive/specs/<file>.spec.ts)
# Engine: types, one test file, the whole suite
(cd packages/engine && npx tsc --noEmit -p .)
(cd packages/engine && npx vitest run tests/<file>.test.ts)
(cd packages/engine && npx vitest run)
# Engine build: the client reads the bundle, so rebuild after every engine src or data edit
(cd packages/engine && npx tsup)
# The guided start's data and play (after any tutorial.json or tutorial type change)
(cd packages/engine && npx vitest run tests/delve-tutorial-data.test.ts tests/delve-tutorial-contract.test.ts tests/delve-tutorial-review.test.ts)
(cd packages/engine && npx vitest run tests/delve-tutorial-bot.test.ts)   # long: run in the background
```

If Playwright says port 5199 is in use: `netstat -ano | grep ":5199" | grep LISTENING`. This worktree's stale Vite: `taskkill //PID <pid> //F //T`; another checkout's: wait for it.

**The engine is edited in this phase**, in three places only: `'forge.materials'` in `TUTORIAL_TARGETS` (plan 04), `forgePowerRange` in `src/delve/crafting.ts` (plan 05) and `l1-forge`'s trail in `src/data/tutorial.json` (plan 05). No rule, balance number or save field changes. After each, `npx tsup` in `packages/engine` before any client test, or the client runs the stale bundle (Vite's HMR can serve a stale module too: restart it). If a task finds it must change anything else in the engine, stop and report.

**Baseline.** Before Task 1 of plan 01, on `padui/p3` fresh from `padui/main`, run

```bash
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

and write both counts into this section ("Baseline (recorded <date> on `padui/main` at `<sha>`): engine `tsc` clean, `vitest run` N files, M tests; client `tsc` clean, `vitest run` N files, M tests; all passing"). Phase 2 closed at client 133 + its own files; read the real numbers, don't assume them. Every later "all green" compares to it. If the baseline is not green, stop: phase 2 did not close. The engine's run includes the long pacing and tutorial-bot files: run it in the background and read the report.

Baseline (recorded 2026-10-05 on `padui/main` at `5abdaded`): engine `tsc` clean, `vitest run` 130 files (1 skipped), 1696 tests (5 skipped); client `tsc` clean, `vitest run` 136 files, 1234 tests; all passing.

## Conventions

- Match the surrounding code: a doc comment on every export in the project's plain voice, kebab-case files for modules (`help-topics.tsx` holds components, so it is the exception the codebase already makes for `materials-text.ts`-style helpers: name the component files PascalCase, `HelpDialog.tsx`, `JunkSheet.tsx`, `TakeSheet.tsx`), `UPPER_SNAKE_CASE` constants (`UNDO_MS`, `PAD_STEP`, `STICK_SCROLL_PX`).
- No game logic in the client: the forge's Power range is the engine's (`forgePowerRange`), every price and refusal is the engine's, Undo is the store's (it restores a profile, it computes nothing).
- Pixel art from the kit's `Glyph` / `PixelSprite`; never an emoji (the stepper's arrows are text ◂ ▸, as the bag's ▲ is).
- TDD: the failing test first, run it, the minimal code, run it, commit.
- Commits: `feat(client): …`, `feat(engine): …`, `test(client): …`, `docs: …`, each message ending with

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

- Never push. Never switch branches in, or write to, `C:/Projects/Alloy`.
- jsdom has no layout: unit tests give each element a box by overriding `getBoundingClientRect` (the `boxed` helper in `AnvilHub.test.tsx`).
- **A pad press in a unit test** goes through the prompts as the nav hands it over: `padPrompts(new Set([button]), held, now)` then a release frame (the `padPress` helper in `AnvilHub.test.tsx`; copy it verbatim where a plan needs it). A D-pad press goes through `moveFocus(dir)` (exported from `use-gamepad-nav.ts`).
- Test ids are the E2E's contract; the tables below are the whole change.

## Proposed spec edits

To make in `docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md`, section 4 (and the grammar table where named), in the close (plan 07, Task 5), each a sentence or two:

1. **Full compare on R3.** Add to the Loadout's bullet: "Full compare (a weapon's moveset and every stat line of a bag item) toggles on a press of the right stick (R3), or Shift on the keys; it is a toggle, never a hold." In the grammar table, the Right stick row's examples gain "its press: the Loadout's full compare".
2. **Transfer by the pad.** Add: "A on a bag weapon that can take your moveset opens a take sheet (Equip as it is, or Transfer my moveset here, each with its Power and the transfer's price; the better one focused): a priced action gets a sheet (rule 1). Every other bag item equips on A."
3. **A worn item.** Add: "On a worn tile, X unequips (it goes to the bag) and A selects."
4. **Undo after Salvage junk too.** Add to the Undo bullet: "Salvage junk's sheet salvages through the same store op, so its Undo is offered the same way."
5. **Help in the pause.** The pause list gains Help: 8 stops, not the Evidence table's 7. The Evidence table's Pause target becomes 8.
6. **Help met once.** "A new save still meets it once" becomes: "A save that answers Jump in sees Help open as a dialog once its mana is chosen (Hesta takes its place on a guided save)."
7. **The Loadout's count.** The Evidence table's Loadout target (about 21) becomes the count plan 07 measures (expected 24: the seven worn slots, the twelve tiles, the bag's sort, Equip best, Salvage junk and Auto-salvage, and Delve), with "one stop per bag item" as its reason. The doll's two shortcuts (the attunement strip and "Skills ›") leave the D-pad: LB/RB reach the Skills tab.
8. **The Temper count.** The same for Temper (target about 15): its count is the gear rows plus the six operations plus Delve; the gear list's kind chips leave the D-pad (mouse only).
9. **The verdict when nothing changes.** "Worse" reads "About the same as what you wear" when the change is within the upgrade threshold (`UPGRADE_EPSILON`): an equal item is not worse.
10. **The forge preview's range.** Add: "Random lines are left out of both ends of the range ('before 1 random line'): what they roll is not known until the forge."
11. **The forge bench's columns.** Add: "The Forge and Temper benches are list, actions, preview (the preview has no stops); Materials is its own bench (bars, flux, shards and essences with Refine on the row; the shard bench, an affix stepper and Buy; the rune pouch with Fuse)."

## Contracts between the plans

### Test ids

| Test id | Before | After |
|---|---|---|
| `bag-filter-<all\|weapons\|armor\|jewelry\|upgrades>` | chips (`aria-pressed`) | kit sub `Tabs` (`role="tab"`, `aria-selected`), LT/RT (01) |
| `bag-item` | a tile | the same, plus `data-uid` and the kit Tile's `data-delta` (`up`, `potential`, `down`) (01) |
| `item-verdict` | — | the compare pane's first line (`data-verdict`: `up`, `home`, `worse`, `same`) (01) |
| `compare-actions` | the pane's buttons, D-pad stops | the same, `data-pad-skip` (01) |
| `take-sheet`, `take-equip`, `take-transfer` | — | the pad's take sheet for a bag weapon (01) |
| `undo-salvage` | — | none: Undo is a footer prompt (`id: 'undo'`); the E2E reads the prompt bar's text (02) |
| `junk-sheet`, `junk-row` (`data-uid`, `aria-pressed` = kept), `junk-total`, `junk-salvage` | — | the review sheet (02) |
| `salvage-junk` | salvages at once | opens the sheet (02) |
| `delve-howto` | the Loadout's default pane | the Help dialog's body and the Codex's Help detail (03) |
| `help-dialog`, `help-topic-<id>` (tabs), `open-help`, `pause-help`, `codex-section-help` | — | Help (03) |
| `howto-carries`, `howto-carry-<skill>` | inside `delve-howto` | inside the Weapons topic (03) |
| `forge-metal`, `forge-flux`, `forge-element`, `forge-essence` | — | the bench's steppers (`role="spinbutton"`, `aria-valuetext`) (05) |
| `metal-<id>`, `flux-<grade>`, `flux-none`, `element-<mana>` (the Forge bench's), `essence-<id>`, `essence-none` | segmented options | gone (05); the Skills tab's own `element-<mana>` is untouched |
| `forge-preview`, `forge-power` | — | the bench's preview pane and its Power range (05) |
| `bench-materials` | — | the third sub tab (04) |
| `materials-pane`, `material-<key>`, `refine-<key>`, `rune-pouch`, `rune-fuse-*`, `shard-bench`, `bench-buy` | the pane beside both benches | the Materials bench (04) |
| `bench-affix-<stat>` | chips | gone: `bench-affix` is a stepper (04) |
| `temper-op-<upgrade\|reforge\|hone\|imprint\|reattune-<mana>\|awaken>` | — | Temper's list rows (04); `upgrade-button`, `reforge-open`, `hone-open`, `imprint-open`, `reattune-<mana>`, `awaken-button` go (the line picks keep `<op>-pick`, `<op>-line-<i>`, `<op>-button`, `<op>-back`) |
| `temper-detail` | — | Temper's detail panel (04) |

### Store fields, functions and props

- `HubMemory` (`hub/types.ts`): `{ loadout?: { uid: string | null; filter: BagFilter }; forge?: { bench: ForgeBenchId; baseId: string | null; uid: string | null } }`, a mutable box `useHubTabs` holds in a ref; `HubTabProps.memory?: HubMemory` (absent in a tab's own unit tests: no memory). `BagFilter`, `ForgeBenchId = 'forge' | 'temper' | 'materials'` (01; the forge part used in 04 and 05).
- `HubLink`'s forge `bench` gains `'materials'`; the codex `section` gains `'help'` (01, 03).
- `Prompt.tutorial?: string`: the guided-start target the prompt bar puts on its item (`data-tutorial`) (01).
- `verdictOf(cmp, asIs): Verdict | null`, `VERDICT_TEXT` (in `ComparePane.tsx`) (01).
- `STICK_SCROLL_PX` and the right stick's scroll of `[data-pad-scroll]` in `use-gamepad-nav.ts` (01); `PAD_STEP` and `[data-pad-step]` there too (04).
- `delveStore`: `undo: SalvageUndo | null`, `undoSalvage(): boolean`, `UNDO_MS = 5000` (02).
- `JunkSheet({ uids, onClose })`, `TakeSheet({ uid, onClose })` (02, 01).
- `HELP_TOPICS`, `HelpPage({ topic })`, `HelpDialog({ onClose, topic? })` (03).
- Kit `Stepper<T>({ label, options, value, onChange, note?, tutorial?, done?, testId })` (04).
- Engine `forgePowerRange(registry, profile, req): ForgePowerRange` (`{ low, high, random }`) (05).
- `DROPS_FROM` in `materials-text.ts` (04, used again in 05).

### E2E fixture (`e2e/fixtures/delve.ts`)

```ts
/** Step a kit Stepper (`role="spinbutton"`) with the arrow keys until its value reads `value`. (plan 05) */
export async function stepTo(page: Page, testId: string, value: RegExp): Promise<void>;
```

### Engine (plan 04, plan 05)

```ts
/** src/delve/crafting.ts */
export interface ForgePowerRange { low: number; high: number; random: number }
export function forgePowerRange(registry: DataRegistry, profile: DelveProfile, req: ForgeRequest): ForgePowerRange;
```

`TUTORIAL_TARGETS` gains `'forge.materials'` (the Materials bench's sub tab). `l1-forge`'s trail becomes `["forge.pattern:cuirass", "forge.bar", "forge.flux", "forge.shard", "forge.go"]`. `TUTORIAL_KEYED_TARGETS` keeps `forge.bar` and `forge.flux` (the data may still key them; no control does now): deleting them is not this phase's.

### The guided start's targets this phase moves

| Target | Before | After | Steps |
|---|---|---|---|
| `loadout.bag:<slot>.<rarity>` | a tile, done when selected | the same; under the pad focus selects | `l1-equip`, `l1-salvage`, `l2-compare`, `l2-transfer` |
| `loadout.equip` | the pane's Equip (a stop) | the pane's Equip (the mouse's), and under the pad the footer's A prompt | `l1-equip` |
| `loadout.salvage` | the pane's Salvage | the pane's Salvage, and under the pad the footer's X prompt | `l1-salvage` |
| `loadout.transfer` | the pane's Transfer | the pane's Transfer, under the pad the footer's A prompt on a weapon that can take the moveset, and the take sheet's Transfer | `l2-transfer` |
| `loadout.compare` | the compare block | the verdict and the Power block | `l2-compare` |
| `forge.bar:<metal>`, `forge.flux:<grade>` | a segmented option each | gone: the steppers carry `forge.bar` and `forge.flux`, with `data-tutorial-done` | `l1-forge` (its trail changes) |
| `forge.refine:<metal>` | the Materials pane, beside both benches | the Materials bench; its way is `forge.materials` | `l1-refine` |
| `forge.materials` | — | the Materials bench's sub tab | the way to `forge.refine` |
| `temper.hone` | Temper's "Hone…" button | Temper's Hone row | `l2-hone` |
| `temper.line`, `temper.go` | the line pick | unchanged | `l2-hone` |

### From phases 1 and 2, relied on

`orderPrompts` (every footer's order; B sorts last, so Undo sits at the bar's end), `stepTabs` landing on `[data-pad-first]`, the kit `Dialog`'s `wrap` (the junk sheet, Help), the straight-back rule (`lastCross`), `keepFocus`, the Depart sheet (`startDive(page)` in every E2E), the pause list (plan 03 adds a row to it).
