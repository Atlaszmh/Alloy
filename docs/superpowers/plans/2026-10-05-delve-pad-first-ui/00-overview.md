# Delve pad-first UI, phase 1 (the shell) — plan overview

**Spec (authoritative):** `docs/superpowers/specs/2026-10-05-delve-pad-first-ui-design.md` (sections 1 and 2)

**Goal:** the kit carries the button grammar, Menu opens the system menu everywhere, Delve is a Depart sheet on View, and quests are claimed where the focus is. No tab's panes are rebuilt. Client only, v0.65.0.

Four plans, executed in order on one branch. Each ends green (types, unit tests, the E2E it names).

| Plan | Owns |
|---|---|
| `01-nav-prompts.md` | `kit/prompts.ts` (`orderPrompts`), `kit/glyphs.tsx` (`PromptBar`), `features/gamepad/use-gamepad-nav.ts` (the wrap, `firstAfter`), `kit/surfaces.tsx` (`Dialog`'s `wrap`), `hub/SystemMenu.tsx` (passes it) |
| `02-shell.md` | `hub/DepartSheet.tsx` (new), `hub/HubFooter.tsx`, `hub/AnvilHub.tsx`, `hub/skills/ApplyBar.tsx`, `tutorial/marked.ts` (`WAY_TO`), `e2e/fixtures/delve.ts` and every E2E call site of the old Delve and Training buttons |
| `03-quests.md` | `hub/quests/QuestsTab.tsx` and its tests, `e2e/delve-quests.spec.ts` |
| `04-close.md` | `e2e/delve-pad-nav.spec.ts` (the sheet audited, PN05), the full run, `CLAUDE.md`, the version |

Phases 2 to 5 of the spec get their own plan folders when this one has merged.

## Branch

The work lives in its own worktree, `C:/Projects/alloy-padui` (the main checkout, `C:/Projects/Alloy`, is busy on another branch: never touch it). The integration branch is `padui/main`; this phase is `padui/p1`:

```bash
cd /c/Projects/alloy-padui
git switch -c padui/p1
```

The worktree has its own `node_modules` (a real `pnpm install`, no junctions) and its own engine build, so nothing here reaches the main checkout.

## Commands

All from `/c/Projects/alloy-padui` in Git Bash.

```bash
# Client types and unit tests
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run <path-or-filter>)
# Client E2E (starts its own Vite on :5199; one project is enough while iterating)
(cd packages/client && npx playwright test e2e/<file>.spec.ts --project=desktop)
(cd packages/client && npx playwright test e2e/<file>.spec.ts --project=desktop-1080)
```

If Playwright says port 5199 is in use, another checkout's E2E or a stale Vite holds it: `netstat -ano | grep ":5199" | grep LISTENING`. If the process is this worktree's stale Vite, `taskkill //PID <pid> //F //T`; if it belongs to another checkout, wait for it.

The engine is not edited in this phase. If a task finds it must be, stop and report: the spec says client only.

Baseline (recorded 2026-10-05 on `padui/main` at `e727dfa3`): `tsc` clean; `vitest run` 132 files, 1148 tests, all passing. Every later "all green" compares to it.

## Conventions

- Match the surrounding code: a doc comment on every export in the project's plain voice, kebab-case files, `UPPER_SNAKE_CASE` constants.
- No game logic in the client.
- Pixel art from the kit's `Glyph` / `PixelSprite`; never an emoji.
- TDD: the failing test first, run it, the minimal code, run it, commit.
- Commits: `feat(client): …`, `test(client): …`, `docs: …`, each message ending with

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

- Never push. Never switch branches in, or write to, `C:/Projects/Alloy`.
- jsdom has no layout: unit tests give each element a box by overriding `getBoundingClientRect` (see `features/gamepad/__tests__/use-gamepad-nav.test.ts` and `AnvilHub.test.tsx`'s `press`).
- Test ids are the E2E's contract. This phase moves four of them; the table below is the whole change.

## Contracts between the plans

### Test ids after plan 02

| Test id | Before | After |
|---|---|---|
| `depart-button` | — | the footer's Delve (and the Skills tab's compact Delve): opens the sheet |
| `depart-sheet` | — | the sheet (a kit `Dialog`) |
| `delve-button` | the footer's Delve: starts the dive | the sheet's Delve: starts the dive |
| `training-button` | the footer | the sheet |
| `start-depths`, `claim-count`, `draft-block`, `draft-warning`, `draft-apply`, `draft-apply-why`, `draft-discard-delve`, `lesson-block` | the footer | the sheet |
| `quest-claim-all` | — | the journal's head (plan 03) |

### E2E fixtures after plan 02 (`e2e/fixtures/delve.ts`)

```ts
/** From the Anvil: the footer's Delve opens the Depart sheet, whose Delve starts (or resumes) the dive. */
export async function startDive(page: Page): Promise<void>;
/** From the Anvil: the Depart sheet's Training. */
export async function openTraining(page: Page): Promise<void>;
```

### From plan 01, used by 02 and 04

- `orderPrompts(prompts: Prompt[]): Prompt[]` from `kit/prompts.ts`; `PromptBar` already draws through it.
- `[data-pad-wrap]` on a list container: at its edge, up and down wrap to its other end (only when nothing else lies that way).
- The kit `Dialog`'s `wrap` prop sets `data-pad-wrap` on the dialog (its Back included).
- `stepTabs` puts the focus on the new tab's `[data-pad-first]` control when it has one (plan 03's open quest row and Claim all).
