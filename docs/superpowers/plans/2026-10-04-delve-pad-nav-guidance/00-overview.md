# Delve pad navigation and guidance — plan overview

**Spec (authoritative):** `docs/superpowers/specs/2026-10-04-delve-pad-nav-guidance-design.md`

**Goal:** the D-pad moves predictably through every Delve menu, and Hesta's guidance is one strip in one place with a marker that leads every click.

Four plans, executed in order on one branch. Each ends green (types, unit tests, the E2E it names).

| Plan | Phase | Owns |
|---|---|---|
| `01-nav-core.md` | Navigation core | `features/gamepad/spatial-nav.ts`, `use-gamepad-nav.ts`, the kit's pad attributes, `e2e/delve-pad-nav.spec.ts` |
| `02-guidance.md` | The strip and the marker | `features/delve/tutorial/*` (but `marked.ts`'s rule body, see below), the strip's places (`HudGrid`, `BossBar`, `DelveRun`, `StopScreen`, `AnvilHub`, `DelveTraining`), the skip entries, `e2e/fixtures/pad.ts` |
| `03-trails.md` | Trails | the engine's `trail` (types, schema, checks, `tutorial.json`), `tutorial/marked.ts`'s rule, the controls' `data-tutorial` and done attributes |
| `04-close.md` | Close | the hand walks, `CLAUDE.md`, the version |

## Branch

```bash
cd /c/Projects/Alloy
git switch -c padnav
```

From `da69a3b0` (v0.63.0). One branch, no worktrees: the phases are sequential.

## Commands

All from the repo root in Git Bash.

```bash
# The engine is bundled: rebuild it after ANY edit under packages/engine/src, or the client runs stale.
(cd packages/engine && npx tsup)
# Engine tests (one file)
(cd packages/engine && npx vitest run tests/<file>.test.ts)
# Client types and unit tests
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run <path-or-filter>)
# Client E2E (starts its own Vite on :5199; one project is enough while iterating)
(cd packages/client && npx playwright test e2e/<file>.spec.ts --project=desktop)
(cd packages/client && npx playwright test e2e/<file>.spec.ts --project=desktop-1080)
```

If Playwright says port 5199 is in use, a stale Vite is holding it: `netstat -ano | grep ":5199" | grep LISTENING`, then `taskkill //PID <pid> //F //T`.

Baseline before Task 1 of plan 01 (record the counts; every later "all green" compares to them):

```bash
(cd packages/engine && npx tsup) && (cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

## Conventions

- Match the surrounding code: its comment density (a doc comment on every export, in the project's plain voice), naming and idiom. Files kebab-case, constants `UPPER_SNAKE_CASE`.
- No game logic in the client. The engine only carries and checks the trail.
- Animations: the Web Animations API on the real element, never a duplicate; `reducedMotion()` from the kit turns motion off.
- Pixel art comes from the kit's `Glyph` / `PixelSprite`; never an emoji.
- TDD: the failing test first, run it, the minimal code, run it, commit.
- Commits: `feat(client): …`, `test(client): …`, `feat(engine): …`, each message ending with

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

- jsdom has no layout: unit tests give each element a box by overriding `getBoundingClientRect` (see `features/gamepad/__tests__/use-gamepad-nav.test.ts`).

## Contracts between the plans

### From 01 (navigation), used by 02 and 03

`features/gamepad/use-gamepad-nav.ts` exports:

```ts
/** What the pad's focus can land on (the menu navigation's own list). */
export const FOCUSABLE: string;
/** The D-pad's candidates in the topmost scope, as seen from `active` (the clipped rule depends on it). */
export function candidates(active?: Element | null): HTMLElement[];
/** True when `el` is one of them. */
export function isCandidate(el: HTMLElement): boolean;
/** The control a press of `dir` on `el` would focus, or null. `memory: false`: by the picks alone. */
export function nextFocus(el: HTMLElement, dir: NavDir, opts?: { memory?: boolean }): HTMLElement | null;
export function moveFocus(dir: NavDir): void;
export function keepFocus(): void;
```

The kit sets `data-pad-group` on `Panel` (plate and glass, never a well), `Footer` and `Header`, and `data-pad-skip` on the `Tabs` tablist. A component that builds its own pane gives it `data-pad-group` by hand.

### From 02 (guidance), used by 03

`features/delve/tutorial/marked.ts` (new in 02; the functions move out of `TutorialHighlight.tsx`):

```ts
/** Where a target lives when it is not on screen (moved from TutorialHighlight.tsx, unchanged). */
export const WAY_TO: Partial<Record<TutorialTarget, TutorialTarget>>;
/** The last visible `[data-tutorial="<target>"]` in the topmost pad scope, on screen; else null. */
export function findTarget(target: string): HTMLElement | null;
/** What the marker points at: the element, and the target it stands for (the step's own, a way to it, or 'back'). */
export interface Marked {
  el: HTMLElement;
  id: string;
}
/** The target on screen, else the nearest way to it that is, passing over a way already open. */
export function findWay(target: TutorialTarget): Marked | null;
/** The step's marked control. In 02: its `highlight`, by `findWay`. 03 gives it the trail, done and the way out. */
export function findMarked(step: TutorialStep): Marked | null;
```

`features/delve/tutorial/tutorial-view.ts` gains:

```ts
/** The save's current guided step's data, or undefined (none running, or unknown). */
export function useTutorialStep(): TutorialStep | undefined;
```

`TutorialHighlight` (the marker) calls `findMarked(step)` every frame and moves the pad's focus once per `` `${step.id}:${marked.id}` `` **and the pad scope the element was found in** (a field and its picker share a target: the picker opening is a new place to focus), only onto a candidate. 03 changes only what `findMarked` returns, so the marker and its focus rule need no edit in 03.

02 also adds `packages/client/e2e/fixtures/pad.ts` (`BUTTON`, `installPad`, `frames`, `tap`: the fake pad, shared by the tutorial E2E of 02 and 03). 01's `delve-pad-nav.spec.ts` keeps its own copies, as `delve-gamepad.spec.ts` does; folding the three onto the fixture is not in these plans.

The strip's Continue (a beat) takes the focus when `findMarked(step)` is null, or is the step's own `highlight` on screen (not a way to it). With 03's trails that waits for the trail by itself.

### From 03 (trails)

The engine exports `TutorialTrailTarget` (a string: a `TutorialTarget`, or `<target>:<key>`) and `TutorialStep.trail?: TutorialTrailTarget[]`. Rebuild the engine before the client reads them.

In `marked.ts`, 03 widens what 02 built without breaking its callers: `findWay` takes a `TutorialTrailTarget`, `WAY_TO` is keyed on targets without their key while its values may be keyed (`skills.card:last`), and `isDone(el)` is exported.

## How the plans were checked

- **01:** its rule was prototyped in the page and run over the real hub screens (the spec's §1.1 table); its unit tests were traced by hand, not run.
- **02:** drafted, not run; a reviewer applied all 85 of its edits in order to in-memory copies of the files (every anchor matched) and traced the tests of Tasks 1 to 7 and 10. Approved with no blocking issue.
- **03:** its drafter applied every task in a scratch copy: the engine's data test and the tutorial bot pass, the client type-checks, the affected client tests pass, and `findMarked` was probed on the real page. Its TU01 and TU03 marker and pad assertions need 01's and 02's code and were not run.

So the first run of each E2E, and of 01's and 02's unit tests, happens in execution: a failure there is information about the plan, to be read before it is "fixed".

## Order and merge

01 → 02 → 03 → 04, each committed task by task on `padnav`. 02 builds on 01's `isCandidate`; 03 on 02's `marked.ts`. Nothing is pushed or merged by these plans: the last task of 04 stops at a green branch and reports.
