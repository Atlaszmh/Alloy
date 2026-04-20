# Post-Alpha Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the pre-existing debt and deferred E2E skips surfaced by the alpha-readiness work, so the repo lands at a "solid and clean" baseline — engine tsc green, engine tests green, balance tool green, no flaky E2E, no drifted skips.

**Architecture:** Four independent cleanup chunks. None touch product behavior the player can see — this is pure debt paydown. Each chunk is independently shippable and has clear completion criteria. Explicitly **out of scope:** R09 endless-mode entry (needs its own feature spec — the engine currently completes the run at the goal round; enabling endless requires a phase-machine change that isn't cleanup).

**Tech Stack:** TypeScript 5.7 strict, Vitest 3, Playwright (4 device profiles), pnpm 9 workspaces. No new libraries.

**Branching:** Feature branch off `feat/alpha-readiness-p0` (or after merging it, off `main`). Suggested branch name: `chore/post-alpha-cleanup`.

**Working conventions:**
- Engine tests: `cd packages/engine && pnpm vitest run [pattern]`
- Client tests: `cd packages/client && pnpm vitest run [pattern]`
- Client E2E: `cd packages/client && pnpm playwright test --project=desktop [pattern]`
- Tools tests: `cd packages/tools && pnpm test`
- Type-checks: `pnpm tsc --noEmit` at each package root.
- Dev server: port **9099**.
- No user-visible changes in this plan → `packages/client/package.json#version` stays at `0.5.0-alpha`.

---

## Pre-flight: capture the "before" baseline

Before executing, document the current failing state so the "green" end state is measurable. From `feat/alpha-readiness-p0`:

- `packages/engine`: `pnpm tsc --noEmit` → ~20+ errors in `ai/strategies/*.ts` (`OrbInstance` vs `GemInstance` tier mismatches)
- `packages/engine`: `pnpm vitest run` → 499/510 passing; 11 failures in `tests/ai.test.ts` and `tests/ai-tiers.test.ts` (stale action kinds `assign_orb`, `combine` with `orbUid1`/`orbUid2`)
- `packages/tools`: `pnpm tsc --noEmit` → 5+ errors (`signature3` recipe type drift in `data-loader.ts`; `this` implicit any in `__tests__/*.tsx`; unused imports)
- `packages/tools`: `pnpm test` → 13 failures across integration/layout-regression tests
- `packages/client/e2e`: `match-flow.spec.ts` and `multiplayer-routing.spec.ts` fail on `getByText('Choose Opponent')` — copy has drifted to `'Play vs AI'` + `'Choose AI Tier'`
- `packages/client/e2e`: `duel-acceptance.spec.ts DU01` flaky (canvas render timing)
- `packages/client/e2e/run-flow.spec.ts` skips with unresolved fixtures: F01, R07b, R07c, R07d

Done when:
- Engine `pnpm tsc --noEmit` → 0 errors
- Engine `pnpm vitest run` → 510/510 passing
- Tools `pnpm tsc --noEmit` → 0 errors
- Tools `pnpm test` → all passing (or the genuinely-obsolete ones removed with notes)
- `match-flow` + `multiplayer-routing` E2E pass
- DU01 no longer flakes across 3 consecutive runs
- F01, R07b, R07c, R07d unskipped and passing

---

## Chunk 1: Engine AI migration (OrbInstance → GemInstance)

**Why first:** The engine-side debt is the biggest and blocks the clean "pnpm tsc --noEmit" / "pnpm vitest run" story across the repo. Until the engine is green, no other package can be trusted. The AI strategies were written against the old `OrbInstance` type and never updated when the April 2026 gem refactor landed; the adapt-phase strategies additionally emit stale forge-action kinds (`assign_orb` instead of `socket_gem`; `combine` with `orbUid1`/`orbUid2` instead of `gemUid1`/`gemUid2`).

Three concrete symptoms to eliminate:
1. `adapt-strategy.ts` and `draft-strategy.ts` pass `GemInstance` into functions typed `OrbInstance` — tsc errors.
2. AI forge planning (in `adapt-strategy.ts` specifically — `forge-strategy.ts` is already clean per the current source) emits `{kind:'assign_orb',orbUid,...}` — runtime "Unknown action kind".
3. AI forge planning also emits `{kind:'combine',orbUid1,orbUid2}` — field-name mismatch; the new shape is `gemUid1`/`gemUid2`.

Since the adapt phase itself is unreachable (see alpha-readiness Chunk 1), some of this code is dead. But dead code that doesn't compile is still debt — fix it cleanly rather than delete it, so the strategy files remain available when endless/adapt gets its own spec.

### Task 1.1: Inventory the drift

**Files to read (no edits yet):**
- `packages/engine/src/types/gem.ts`
- `packages/engine/src/types/affix.ts`
- `packages/engine/src/types/forge-action.ts`
- `packages/engine/src/ai/strategies/draft-strategy.ts`
- `packages/engine/src/ai/strategies/adapt-strategy.ts`
- `packages/engine/src/ai/evaluation.ts` (where `orbValueScore` is defined — is its signature `OrbInstance` or `GemInstance`?)

- [ ] **Step 1: Record what's stale**

Produce a plain-text list (in the commit body or a scratch comment) of every `OrbInstance` reference in `packages/engine/src/ai/` and every occurrence of stale action kinds in the same directory:

```bash
cd c:/Projects/Alloy/packages/engine
grep -RIn "OrbInstance" src/ai/
grep -RIn "assign_orb\|orbUid1\|orbUid2" src/ai/ tests/
```

Expected findings:
- `draft-strategy.ts`: multiple `OrbInstance` parameter types (the errors we already saw — lines around 75, 113, 121, 137, 140).
- `adapt-strategy.ts`: multiple `OrbInstance` types (lines 91, 128, 196, 276, 282 per earlier tsc output) and action emissions using `assign_orb` / `orbUid1` / `orbUid2`.
- `evaluation.ts`: `orbValueScore` function — check its actual parameter type.
- `tests/ai.test.ts`: may manually construct `{kind:'assign_orb',...}` or `{kind:'combine',orbUid1,...}` as fixtures (Chunk 2 handles this, but noting here).

No commit; this is just an audit.

### Task 1.2: Migrate `OrbInstance` → `GemInstance` in AI strategy files

**Files:**
- Modify: `packages/engine/src/ai/strategies/draft-strategy.ts`
- Modify: `packages/engine/src/ai/strategies/adapt-strategy.ts`
- Modify (if necessary): `packages/engine/src/ai/evaluation.ts`

**Approach:** The type difference between `OrbInstance` and `GemInstance` is mainly that `GemInstance` has a wider `tier` range (1–5 vs 1–4) and includes `rarity`, `sourceRecipe?`, `recipeDepth`, `combinable`, `tags[]`, `outputBonusEffects?`. Strategy code that reads `tier`, `affixId`, `uid` works identically on both. The call sites where TS errors are: functions expecting `OrbInstance` being passed a `GemInstance`.

Fix: rename parameters from `orb: OrbInstance` to `gem: GemInstance` and update imports. If a downstream function (`orbValueScore`, `bestArchetype`, etc.) still expects `OrbInstance`, update its signature too — same rename. Anywhere a tier is narrowed to `AffixTier` (1|2|3|4), keep the narrowing only where affix data is actually read (e.g., `registry.getAffix(id).tiers[tier - 1]`) — use `Math.min(gem.tier, 4) as AffixTier` at those call sites.

- [ ] **Step 1: Check `evaluation.ts` for function signatures**

Read `packages/engine/src/ai/evaluation.ts`. If `orbValueScore`, `bestArchetype`, or any helper takes an `OrbInstance`, change the signature to `GemInstance`. Check if any internal logic breaks because of the wider tier range — e.g., if it does `affixDef.tiers[gem.tier - 1]`, that's fine for tier 1–4, but for tier 5 would exceed the affix's 4-tier definition. Where this happens, clamp:

```ts
const clampedTier = Math.min(gem.tier, 4) as AffixTier;
const tierDef = affixDef.tiers[clampedTier - 1];
```

Document the clamp with a one-line comment explaining why (tier 5 gems are combined results whose affix-tier bucketing uses T4 effects).

- [ ] **Step 2: Migrate `draft-strategy.ts`**

Replace every `OrbInstance` occurrence with `GemInstance`. Update the import at top:
```ts
// Before:
import type { OrbInstance } from '../../types/orb.js';
// After:
import type { GemInstance } from '../../types/gem.js';
```

Go line by line through parameter types — search for `: OrbInstance` and `: OrbInstance[]`. Each one becomes `: GemInstance` / `: GemInstance[]`. Rename local parameter names from `orb` to `gem` for clarity (optional, but the plan requires it for consistency).

- [ ] **Step 3: Migrate `adapt-strategy.ts`**

Same migration. Additionally, `adapt-strategy.ts` is where the stale forge-action emissions live. Find every `{ kind: 'assign_orb', orbUid, ... }` and replace with `{ kind: 'socket_gem', gemUid, ... }`. Find every `{ kind: 'combine', orbUid1, orbUid2 }` and replace with `{ kind: 'combine', gemUid1, gemUid2 }`.

If any action uses a kind that no longer exists in `ForgeAction` (check `packages/engine/src/types/forge-action.ts`), remove that emission. Current valid kinds are: `socket_gem`, `unsocket_gem`, `combine`, `combine3`, `select_base_item`, `set_base_stats`, `boost_combine`, `reroll_pool`, `guarantee_rarity`.

- [ ] **Step 4: Run engine tsc**

```bash
cd c:/Projects/Alloy/packages/engine && pnpm tsc --noEmit
```

Expected: 0 errors. If residual errors remain, they're almost certainly in files you didn't touch — read them and decide whether to fix in this chunk or call out.

- [ ] **Step 5: Run engine unit tests (partial — confirm no regressions beyond the known 11)**

```bash
cd c:/Projects/Alloy/packages/engine && pnpm vitest run --reporter=basic
```

Expected: still 499 passing / 11 failing (the 11 are Chunk 2's target; they're independent of this migration because they manually construct stale actions in test fixtures). If the passing count drops, investigate — the migration may have introduced a regression.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/ai/strategies/draft-strategy.ts packages/engine/src/ai/strategies/adapt-strategy.ts packages/engine/src/ai/evaluation.ts
git commit -m "$(cat <<'EOF'
refactor(engine): migrate AI strategies OrbInstance → GemInstance

The April 2026 gem refactor replaced OrbInstance with GemInstance
throughout the public surface, but AI strategies (draft-strategy,
adapt-strategy, evaluation) kept the old type. tsc was red with 20+
errors where GemInstance was passed to functions typed OrbInstance.

Changes:
- Parameter types: OrbInstance → GemInstance, OrbInstance[] → GemInstance[]
- Import: types/orb → types/gem
- Stale forge-action emissions in adapt-strategy updated to current
  shapes (socket_gem, combine with gemUid1/gemUid2)
- Tier clamp where affix-tier bucketing is required (tier 5 combined
  gems use T4 effects)

Adapt phase is unreachable today (see ALPHA_READINESS.md) but the
strategies are kept in place for future wiring; fixing types keeps
tsc green and makes future endless/adapt work cleaner.
EOF
)"
```

### Task 1.3: Delete `types/orb.ts` if no consumers remain

**Files:**
- Potentially delete: `packages/engine/src/types/orb.ts`

- [ ] **Step 1: Audit consumers**

```bash
cd c:/Projects/Alloy
grep -RIn "types/orb\|OrbInstance\|AffixTier" packages/
```

If every `OrbInstance` and `AffixTier` reference is gone from `packages/engine/src/` (tests excluded — they're Chunk 2's concern), delete `types/orb.ts`. If any non-test consumer remains, skip deletion and note the remaining consumer.

**Do NOT force deletion if any reference remains.** The migration goal is "green tsc", not "fewer files".

- [ ] **Step 2: Commit or note**

If deleted:
```bash
git rm packages/engine/src/types/orb.ts
git commit -m "chore(engine): drop unused types/orb.ts (superseded by types/gem.ts)"
```

Otherwise, note the remaining consumer in the chunk's final summary and leave the file in place.

---

## Chunk 2: Engine test suite greening

**Why:** Chunk 1 made the engine source compile. Chunk 2 makes the engine test suite pass. The 11 failing tests in `tests/ai.test.ts` and `tests/ai-tiers.test.ts` manually construct `ForgeAction` fixtures with stale shapes — they were not updated during the gem refactor. Additionally, Chunk 2 is a good place to verify the Chunk 1 migration end-to-end by running the full engine suite.

The core transformation pattern is a find/replace inside test bodies:
- `{ kind: 'assign_orb', orbUid: X, target, slotIndex }` → `{ kind: 'socket_gem', gemUid: X, target, slotIndex }`
- `{ kind: 'combine', orbUid1: X, orbUid2: Y }` → `{ kind: 'combine', gemUid1: X, gemUid2: Y }`
- Variable name `orbUid` in draft context may or may not need renaming — drafts still use `orbUid` in some action shapes (check `GameAction` in `types/game-action.ts`). Keep variable names correct at the emit site.

### Task 2.1: Fix `tests/ai.test.ts`

**Files:**
- Modify: `packages/engine/tests/ai.test.ts`

- [ ] **Step 1: Inventory stale action emissions in the test file**

```bash
cd c:/Projects/Alloy/packages/engine
grep -n "assign_orb\|orbUid1\|orbUid2\|upgrade_tier" tests/ai.test.ts
```

Expected: multiple hits. Note each line number.

- [ ] **Step 2: Apply the shape migration**

For each hit:
- `{ kind: 'assign_orb', orbUid: <expr>, target, slotIndex }` → `{ kind: 'socket_gem', gemUid: <expr>, target, slotIndex }`
- `{ kind: 'combine', orbUid1: <a>, orbUid2: <b> }` → `{ kind: 'combine', gemUid1: <a>, gemUid2: <b> }`
- `{ kind: 'upgrade_tier', ... }` — no current equivalent. Delete the test case OR re-frame it as a category-upgrade combine (two same-affix gems → tier up). Prefer deletion with a comment explaining the action kind was retired in the gem refactor.

Keep variable names (`orbUid`, `orbUid1`, etc.) as they are — they're local identifiers; only the object-key names matter for the ForgeAction shape.

If the test relies on `applyForgeAction` returning specific state shape for these actions, the fix is automatic — `applyForgeAction` handles `socket_gem` and the new `combine` shape correctly per engine source.

- [ ] **Step 3: Run `ai.test.ts` alone**

```bash
cd c:/Projects/Alloy/packages/engine && pnpm vitest run tests/ai.test.ts
```

Expected: all tests in this file PASS. If a test still fails because of AI determinism / state-shape assertions, inspect:
- Did the AI strategy return a different action sequence after Chunk 1's migration? (It shouldn't — the migration is pure typing.) If it did, look at the clamp in `evaluation.ts`.
- Is the test asserting on a stat field that changed with the gem refactor? If so, update the assertion to reflect the current shape.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/tests/ai.test.ts
git commit -m "test(engine): update ai.test.ts to current ForgeAction shapes

Tests were authored against pre-gem-refactor actions (assign_orb,
combine/orbUid1/orbUid2, upgrade_tier) and never updated. Now emit
socket_gem / combine with gemUid1/gemUid2; upgrade_tier assertions
deleted since that action kind was retired.

All ai.test.ts tests now pass. Part of the gem-refactor cleanup
surfaced by ALPHA_READINESS."
```

### Task 2.2: Fix `tests/ai-tiers.test.ts`

**Files:**
- Modify: `packages/engine/tests/ai-tiers.test.ts`

Same migration pattern as Task 2.1.

- [ ] **Step 1: Inventory**

```bash
grep -n "assign_orb\|orbUid1\|orbUid2\|upgrade_tier" tests/ai-tiers.test.ts
```

- [ ] **Step 2: Apply migration**

Same transform rules as Task 2.1. Watch for test names that promise specific tier behavior (`test('Tier 3 AI combines for upgrade')` etc.) — if the test asserts something the new combine engine does differently, update the assertion to match current behavior rather than forcing the old assertion.

- [ ] **Step 3: Run `ai-tiers.test.ts` alone**

```bash
cd c:/Projects/Alloy/packages/engine && pnpm vitest run tests/ai-tiers.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/tests/ai-tiers.test.ts
git commit -m "test(engine): update ai-tiers.test.ts to current ForgeAction shapes"
```

### Task 2.3: Full engine suite green

- [ ] **Step 1: Run the whole engine suite**

```bash
cd c:/Projects/Alloy/packages/engine && pnpm vitest run
```

Expected: **510/510 passing**. If not:
- Read each remaining failure.
- Is it caused by Chunk 1's migration? (E.g., a test that imported `OrbInstance` directly.) Fix it here.
- Is it a test that's genuinely out-of-date vs the gem-refactor product state? Update the assertion or delete the test with a note in the commit.
- Is it a simulation-runner / balance test that depends on something real we broke? That's a bigger signal — escalate.

- [ ] **Step 2: Run engine tsc one more time**

```bash
cd c:/Projects/Alloy/packages/engine && pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: If tests were added or removed, commit**

Only commit if any tests were added/modified beyond 2.1 and 2.2. Otherwise this step is a no-op.

---

## Chunk 3: Balance tool rehabilitation

**Why:** The balance tool (`packages/tools/`) has accumulated drift that makes its own suite unreliable. Since this tool is how we eyeball pool distributions, AI win-rate curves, and match distributions before tuning balance, it needs to work end-to-end. Nothing here touches the engine or the client — it's self-contained.

Observed issues from tools `pnpm tsc --noEmit`:
1. `src/utils/data-loader.ts:87` — the tool's local `Recipe` type accepts `"category" | "signature" | "generic"` but `recipes.json` now contains `"signature3"` (landed in the ternary combine work). Type union needs widening or the tool needs to filter.
2. `src/__tests__/*.tsx` — ~15 `'this' implicitly any` errors in `vi.mock('d3', ...)` factories (lines 8-15 in each test file).
3. Unused imports / declared-but-unused variable warnings across `src/components/` and `src/store/`. Low-value but clean.

Observed issues from tools `pnpm test`:
- 13 failures across server integration tests, layout-regression test, and gem-blueprint-app integration test. Most trace back to the `this`-implicit-any blocking the mock from working, or to test assertions against a CSS class structure that may have drifted. Examine each failure category before fixing.

### Task 3.1: Fix `data-loader.ts` to accept `signature3`

**Files:**
- Modify: `packages/tools/src/utils/data-loader.ts` (around line 87 where the Recipe shape is constructed)
- Modify (if present): the `Recipe` type declaration upstream of that file.

**Approach:** The tool's local `Recipe` interface predates `signature3`. Widen the type union to include the new kind. Since the tool isn't wired into the live combine engine, it probably doesn't need to do anything new with `signature3` recipes — just accept them in the data.

- [ ] **Step 1: Locate the Recipe type**

```bash
cd c:/Projects/Alloy/packages/tools
grep -RIn "type Recipe\|interface Recipe" src/
```

Find where `type: "category" | "signature" | "generic"` is declared. Widen to `type: "category" | "signature" | "signature3" | "generic"`.

- [ ] **Step 2: Make sure the tool's UI handles signature3 gracefully**

Look at any switch/case on `recipe.type` in `src/components/`. If there's a `switch` with a non-exhaustive default, signature3 will fall through silently — acceptable for now. If the code asserts exhaustive (e.g., `never`-typed default), add a signature3 branch that treats it like `signature` (display similarly).

- [ ] **Step 3: Run tsc on just this file**

```bash
cd c:/Projects/Alloy/packages/tools && pnpm tsc --noEmit 2>&1 | grep -i "data-loader\|Recipe"
```

Expected: no errors on data-loader. Other unrelated errors may remain; those are Task 3.2 / 3.3.

- [ ] **Step 4: Commit**

```bash
git add packages/tools/src/utils/data-loader.ts packages/tools/src/<wherever-Recipe-type-lives>
git commit -m "fix(tools): Recipe type accepts signature3 (ternary combine recipes)

The ternary combine work added a 'signature3' recipe kind to the
engine's recipes.json. The balance tool's local Recipe interface
predates it and threw at data load. Widen the union."
```

### Task 3.2: Fix `this` implicit any in vi.mock factories

**Files:**
- Modify: `packages/tools/src/__tests__/gem-blueprint-app.integration.test.tsx`
- Modify: `packages/tools/src/__tests__/layout-regression.test.tsx`

The issue is in the D3 mock factories:
```ts
vi.mock('d3', () => ({
  select: vi.fn(() => ({
    attr: vi.fn(function () { return this }),   // <-- this: any
    // ...
  })),
}));
```

Fix: type the `this` explicitly. Either:
```ts
attr: vi.fn(function (this: Record<string, unknown>) { return this })
```
or (cleaner) return a stable chain object:
```ts
const chain = {
  attr: vi.fn(() => chain),
  selectAll: vi.fn(() => chain),
  data: vi.fn(() => chain),
  join: vi.fn(() => chain),
  append: vi.fn(() => chain),
  on: vi.fn(() => chain),
  style: vi.fn(() => chain),
  text: vi.fn(() => chain),
};
vi.mock('d3', () => ({ select: vi.fn(() => chain), /* ... */ }));
```

The chain-object pattern is cleaner and matches what D3's fluent API looks like — arrow functions don't need `this` at all. Prefer that.

- [ ] **Step 1: Refactor `layout-regression.test.tsx` mock to chain-object pattern**

Modify the `vi.mock('d3', ...)` block at lines 7-26 to return a shared `chain` object from all chainable methods. Keep the `hierarchy` and `tree` mocks as they are — they're not chainable in the same way.

- [ ] **Step 2: Do the same for `gem-blueprint-app.integration.test.tsx`**

Same transform. Confirm the file's remaining `vi.mock` blocks are clean.

- [ ] **Step 3: Run tools tsc**

```bash
cd c:/Projects/Alloy/packages/tools && pnpm tsc --noEmit
```

Expected: the `this implicitly any` errors are gone. Remaining errors are unused-import warnings (Task 3.3).

- [ ] **Step 4: Run tools tests**

```bash
cd c:/Projects/Alloy/packages/tools && pnpm test
```

Inspect which tests now pass and which still fail. Commit this task's work even if other tests still fail — each step is narrow.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/__tests__/gem-blueprint-app.integration.test.tsx packages/tools/src/__tests__/layout-regression.test.tsx
git commit -m "test(tools): fix 'this' implicit-any in D3 mocks using chain-object pattern

D3 mocks used function() { return this } which TS5.7 strict flagged.
Switched to a shared chain object returned from each chainable
method — matches D3's fluent semantics without relying on `this`."
```

### Task 3.3: Clean up unused imports and dead declarations

**Files:** whichever tools files have TS6133 warnings. Most likely:
- `packages/tools/src/utils/data-loader.ts` (if not already clean from 3.1)
- `packages/tools/src/components/radial-tree-browser.tsx` (`CENTER` declared but not used)
- `packages/tools/src/components/workbench-editor.tsx` (`isIngredient` unused)
- `packages/tools/src/store/gem-blueprint-store.ts` (`Affix` unused import)
- `packages/tools/src/__tests__/gem-blueprint-app.integration.test.tsx` (`waitFor` unused)

**Approach:** Delete the unused declarations. These are genuine dead code — no need to underscore-prefix or comment them out. If any "unused" item is actually used at runtime via a pattern tsc can't see (e.g., JSX.Element rendered only in a case), verify before deleting.

- [ ] **Step 1: List all TS6133 errors**

```bash
cd c:/Projects/Alloy/packages/tools && pnpm tsc --noEmit 2>&1 | grep "TS6133"
```

- [ ] **Step 2: Remove each unused declaration**

Go one by one. For imports, remove the import. For variables, remove the declaration (and check whether it's referenced in a comment — if so, just remove the comment too).

- [ ] **Step 3: Run tsc**

```bash
cd c:/Projects/Alloy/packages/tools && pnpm tsc --noEmit
```

Expected: **0 errors**.

- [ ] **Step 4: Commit**

```bash
git add packages/tools/src/
git commit -m "chore(tools): drop unused imports and declarations (TS6133 cleanup)"
```

### Task 3.4: Address remaining tools test failures

**Files:** whichever tests still fail after 3.1–3.3.

At this point, the expected remaining failure categories are:
- `server/integration.test.ts` (3): simulation server connectivity — possibly requires a server to be running during tests. Read the test setup.
- `server/routes.test.ts` (3): hardcoded port reference assertions — easy fix, update to current port.
- `src/__tests__/*.tsx` (remaining): may have pass now that `this` mocks are fixed. Re-run.

For each remaining failure, classify:

**A. Test is correct, product is broken** — fix the product.
**B. Test is stale, product is current** — update the test to match current behavior, OR delete the test if it no longer tests anything meaningful.
**C. Test is a flake / environment issue** — add appropriate setup/timeout, or skip with a documented reason.

- [ ] **Step 1: Run tools tests**

```bash
cd c:/Projects/Alloy/packages/tools && pnpm test
```

Count failures and categorize each.

- [ ] **Step 2: For each failure, choose A/B/C and apply**

Don't batch — work through failures one at a time. Commit after each logical group (e.g., "all server tests", "all layout-regression tests").

Example for `server/routes.test.ts` port drift:
```ts
// if test asserts port 3000 but tool now defaults to 3001
expect(response.url).toContain('localhost:3001');
```

Example for a stale layout assertion:
```ts
// old: expect(classList).toContain('h-screen');
// if the component now correctly uses h-full, the assertion IS the test intent — passes.
// if the old assertion was preventing a regression we no longer care about, delete the test.
```

- [ ] **Step 3: Final verification**

```bash
cd c:/Projects/Alloy/packages/tools && pnpm tsc --noEmit && pnpm test
```

Expected: tsc 0 errors; all tests either passing or intentionally skipped with a documented reason in the test comment.

- [ ] **Step 4: Commit**

Commit messages should reflect what was changed, e.g.:
- `test(tools): update server/routes port assertions to current default`
- `test(tools): delete obsolete layout-regression tests for removed components`
- `test(tools): skip integration tests requiring live server (document prereq)`

If tests were skipped rather than fixed, the commit body MUST state what prerequisite was missing. Don't leave silent skips.

---

## Chunk 4: E2E copy drift + DU01 flake stabilization

**Why:** Two separate forms of E2E debt, both small:

1. **Copy drift:** `match-flow.spec.ts` and `multiplayer-routing.spec.ts` both assert on the text `'Choose Opponent'` on the matchmaking screen. That screen now shows `'Choose AI Tier'` (for AI selection) or no intermediate heading for other flows. The tests are outdated and need updating.
2. **DU01 flake:** `duel-acceptance.spec.ts DU01` asserts `page.locator('canvas').toBeVisible()` within 15s after reaching the duel phase. Occasional failures (observed ~1/7 runs) suggest a race between canvas mount and PIXI initialization. Stabilize with a more specific wait condition.

### Task 4.1: Update `match-flow.spec.ts` and `multiplayer-routing.spec.ts` for copy drift

**Files:**
- Modify: `packages/client/e2e/match-flow.spec.ts`
- Modify: `packages/client/e2e/multiplayer-routing.spec.ts`

**Current copy reality** (verified during plan writing):
- `MainMenu.tsx`: button text is `PLAY` (uppercase, per MainMenu CSS display style)
- `Matchmaking.tsx:224`: `<h2>Choose AI Tier</h2>` — this is the text after clicking "Play vs AI"
- The intermediate "Choose Opponent" screen referenced by the old tests is GONE — the Matchmaking flow went straight from Play → view selector (AI / Run / PvP buttons) → AI tier selection.

- [ ] **Step 1: Find every "Choose Opponent" reference in E2E**

```bash
cd c:/Projects/Alloy/packages/client
grep -RIn "Choose Opponent" e2e/
```

Expected files: `match-flow.spec.ts:28`, `multiplayer-routing.spec.ts:12,39,85`.

- [ ] **Step 2: For each, determine what the test actually wants to assert**

Read each test to understand intent:
- `match-flow.spec.ts:28` — "after clicking Play, we're on matchmaking screen" — replace `'Choose Opponent'` with `'Play vs AI'` (or another button visible on the matchmaking menu view).
- `multiplayer-routing.spec.ts:12` — "after Play, we see the matchmaking root" — same.
- `multiplayer-routing.spec.ts:16` — already asserts `'Choose AI Tier'` (good), no change.
- `multiplayer-routing.spec.ts:39` — "PvP buttons hidden when offline" test — the outer assertion is we're on matchmaking. Again `'Play vs AI'` (which is also hidden offline? check the test intent) or simply `page.getByRole('heading', { name: /Matchmaking/i })`.
- `multiplayer-routing.spec.ts:85` — "navigating back from draft" — asserts we landed on matchmaking menu. `'Play vs AI'` again.

Decide for each whether to use:
- `page.getByText('Play vs AI')` — reliable, matches actual button text
- `page.getByRole('heading')` / `page.getByRole('button')` with a semantic name — more robust to copy changes
- A `data-testid` — most robust but requires adding the attribute to the component

Recommend `page.getByRole('button', { name: 'Play vs AI' })` as the most stable update.

- [ ] **Step 3: Apply updates**

Do one file at a time. Keep the tests otherwise unchanged.

- [ ] **Step 4: Run the updated specs**

```bash
cd c:/Projects/Alloy/packages/client && pnpm playwright test --project=desktop match-flow.spec.ts multiplayer-routing.spec.ts
```

Some multiplayer-routing tests may still fail for reasons other than copy (they're network-dependent) — that's out of scope for this task. Only confirm the tests you updated no longer fail on the previously-failing line.

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/match-flow.spec.ts packages/client/e2e/multiplayer-routing.spec.ts
git commit -m "test(e2e): update matchmaking assertions after 'Choose Opponent' copy drift

Matchmaking.tsx no longer shows a 'Choose Opponent' heading — the
view went from a single-page heading to per-button entry (Play vs AI,
Start Run, PvP). Update assertions to getByRole('button', {name:'Play vs AI'})
which is stable across the current matchmaking menu layout."
```

### Task 4.2: Stabilize DU01 canvas check

**File:**
- Modify: `packages/client/e2e/duel-acceptance.spec.ts:23-26`

**Current test:**
```ts
test('DU01: canvas renders during duel', async ({ page }) => {
  await reachDuel(page);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
});
```

**Why it flakes:** `page.locator('canvas')` matches any canvas. The PIXI canvas is mounted inside a `usePixiApp` hook — there's a brief window after duel phase mount where the canvas element exists but isn't yet sized/visible. The 15s timeout hides most races but not all.

**Fix:** Assert on the canvas being non-empty (has layout). Example stable selector:

```ts
test('DU01: canvas renders during duel', async ({ page }) => {
  await reachDuel(page);
  // Wait for the canvas element AND for it to have non-zero size.
  // PIXI mounts the canvas element before sizing it; until the ResizeObserver
  // fires, the element is 0x0 and not really "visible".
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  }).toPass({ timeout: 5_000 });
});
```

This asserts:
1. Canvas element exists and is visible (existing assertion).
2. Canvas has real dimensions (new — eliminates the "element mounted but not sized" race).

- [ ] **Step 1: Apply the fix**

Edit DU01 as above.

- [ ] **Step 2: Run DU01 three consecutive times to confirm stability**

```bash
cd c:/Projects/Alloy/packages/client
for i in 1 2 3; do
  pnpm playwright test --project=desktop duel-acceptance.spec.ts -g DU01 --reporter=line || echo "FAIL on run $i"
done
```

Expected: all three runs pass. If any run fails, the stabilization is incomplete — investigate further (maybe need to wait for `page.waitForLoadState('networkidle')` or a custom `data-testid` on the duel scene root).

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/duel-acceptance.spec.ts
git commit -m "test(e2e): stabilize DU01 canvas check with size assertion

The canvas element mounts before PIXI's ResizeObserver sizes it.
Adding a boundingBox check after visibility eliminates the 0x0
false-positive race (occasional failure ~1/7 runs before fix)."
```

---

## Chunk 5: E2E fixture expansion + unskipped tests

**Why:** Four `test.skip` entries in `run-flow.spec.ts` (F01, R07b, R07c, R07d) are blocked on fixture plumbing. With fresh fixture helpers, they become real tests and we stop lying in the skip comments.

**Not in scope:** R09 (endless mode) — requires engine change to `phase-machine.ts` to stop completing the run at goal. That's a feature, not cleanup. Update the R09 skip comment to be explicit about the engine dependency.

### Task 5.1: Add `runStateOverride` support to `startRunViaStore`

**File:**
- Modify: `packages/client/e2e/fixtures/match.ts`

**Approach:** The existing `startRunViaStore(page, opts)` seeds `matchState.runState` through `matchStore.startDebugMatch`. Add an optional `runStateOverride?: Partial<RunState>` option that, after the match is initialized, patches the engine-side run state.

The engine's `RunState` lives inside `matchState.runState` (a field on the controller's state, dispatched through the gateway). Direct mutation from the client requires a path. Two options:

**A. Fixture monkey-patches matchStore state** (fast, fragile):
```ts
await page.evaluate((runStateOverride) => {
  // access the window-exposed store (must be exposed in dev for this to work)
  window.__matchStore?.setState((s) => ({
    ...s,
    matchState: { ...s.matchState, runState: { ...s.matchState.runState, ...runStateOverride } },
  }));
}, override);
```

**B. Extend `startDebugMatch` to accept runStateOverride** (clean, requires client store change):
Add a `runStateOverride?: Partial<RunState>` param to `startDebugMatch`. After creating the run state, shallow-merge the override. This is properly typed and doesn't depend on window globals.

Prefer **B** — it keeps the override mechanism inside the store/engine contract rather than scattered in fixtures.

- [ ] **Step 1: Extend `matchStore.startDebugMatch`**

Find the action signature in `packages/client/src/stores/matchStore.ts`. Add an optional param:

```ts
startDebugMatch: (opts: {
  seed?: number; mode?: MatchMode; aiTier?: 1|2|3|4|5;
  round?: number; phase?: PhaseKind;
  runConfig?: { startingLives?: number; goalRound?: number };
  runStateOverride?: Partial<RunState>;
}) => void;
```

Inside the action, after creating `matchState` and advancing to the requested round/phase, apply the override:

```ts
if (opts.runStateOverride && matchState.runState) {
  matchState.runState = { ...matchState.runState, ...opts.runStateOverride };
  // Re-sync runStore to mirror
  syncRunStore(matchState.runState);
}
```

- [ ] **Step 2: Thread `runStateOverride` through `startRunViaStore` fixture**

In `packages/client/e2e/fixtures/match.ts`, extend the `RunViaStoreOpts` interface with `runStateOverride?: Partial<RunState>` and pass it through to `startDebugMatch`.

- [ ] **Step 3: Add a test for the override path**

Write a unit test in `packages/client/src/stores/matchStore.test.ts` asserting that `startDebugMatch({ runStateOverride: { lives: 1 } })` produces a matchState with `runState.lives === 1`. This locks the contract.

- [ ] **Step 4: Run**

```bash
cd c:/Projects/Alloy/packages/client && pnpm vitest run src/stores/matchStore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/matchStore.ts packages/client/src/stores/matchStore.test.ts packages/client/e2e/fixtures/match.ts
git commit -m "feat(client): runStateOverride support in startDebugMatch + E2E fixture

Lets tests seed a run with specific lives/totalWins/etc. Needed to
unskip R07b/c/d life-recovery E2E tests."
```

### Task 5.2: Unskip R07b (milestone round 5 restores a life)

**File:**
- Modify: `packages/client/e2e/run-flow.spec.ts` (the `test.skip('R07b: ...')` around line 261)

- [ ] **Step 1: Replace the skip with a real test**

```ts
test('R07b: milestone round 5 restores a life', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  await startRunViaStore(page, {
    round: 5, phase: 'draft',
    runStateOverride: { lives: 1, totalWins: 4, totalLosses: 1, consecutiveWins: 0 },
    rigWinAgainst: 'ai-t1',  // or other option to ensure the player wins round 5
  });
  // Force win through whatever mechanism the fixtures expose
  await completeDraftForgeAndWinDuel(page);
  // duel_continue dispatch → checkLifeRecovery → milestone round (5) grants +1
  const livesCount = await page.locator('[data-testid="run-lives-display"] [data-life="filled"]').count();
  expect(livesCount).toBe(2);
});
```

**`rigWinAgainst` / `completeDraftForgeAndWinDuel` dependency:** This helper may not exist yet — it's the same helper F01 needs. If so, scope it in this task AND F01 — see Task 5.4.

If building a real completeDraftForgeAndWinDuel is too heavy in one task, alternative simpler approach: use `forceRunResult` (mentioned in fixture code) combined with an explicit `duel_continue` dispatch. Read `fixtures/match.ts` to see what's available.

**Fallback:** if the fixture is too heavy to build mid-chunk, write R07b as a `matchStore`-level test (in a *.test.ts file) that exercises the engine directly — that's where the life-recovery logic actually lives. E2E coverage for R07b/c/d isn't strictly necessary if the engine test coverage is solid.

Decide in code review whether the E2E test or the engine unit test is the right home. Prefer E2E for regression resistance, but don't build a whole duel simulator to get there.

- [ ] **Step 2: Run**

```bash
cd c:/Projects/Alloy/packages/client && pnpm playwright test --project=desktop run-flow.spec.ts -g R07b
```

Expected: PASS. If the fixture isn't ready, leave skipped with an updated reason.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/run-flow.spec.ts
git commit -m "test(e2e): unskip R07b milestone life recovery"
```

### Task 5.3: Unskip R07c (milestone round 10 restores a life)

**File:**
- Modify: `packages/client/e2e/run-flow.spec.ts` (the `test.skip('R07c: ...')` around line 266)

Important note: round 10 is the default goal round — when the player wins round 10, `advanceRound` marks status='won' and the match completes. Milestone life recovery happens BEFORE advancement. Decide:
- (a) Test asserts lives recovered at the PostMatch screen (won state, lives == 2 visible somewhere in run summary).
- (b) Increase `goalRound` to 15 via `runConfig` so round 10 is a normal mid-run milestone.

Prefer **b** — cleaner test semantics.

- [ ] **Step 1: Write the test**

```ts
test('R07c: milestone round 10 restores a life', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  await startRunViaStore(page, {
    round: 10, phase: 'draft',
    goalRound: 15, // so round 10 isn't the end of the run
    runStateOverride: { lives: 1, totalWins: 8, totalLosses: 2, consecutiveWins: 0 },
    rigWinAgainst: 'ai-t1',
  });
  await completeDraftForgeAndWinDuel(page);
  const livesCount = await page.locator('[data-testid="run-lives-display"] [data-life="filled"]').count();
  expect(livesCount).toBe(2);
});
```

- [ ] **Step 2: Run and commit**

Same pattern as R07b.

### Task 5.4: Unskip R07d (5th discovery restores a life) + discoveryStateOverride fixture

**Files:**
- Modify: `packages/client/src/stores/matchStore.ts` (add `discoveryStateOverride`)
- Modify: `packages/client/e2e/fixtures/match.ts`
- Modify: `packages/client/e2e/run-flow.spec.ts`

Discovery life recovery fires when `discoveryCount >= 5` (balance.json's `lifeRecovery.discoveryThreshold`). Seeding 5 discoveries requires populating the engine-side `DiscoveryState`.

- [ ] **Step 1: Extend `startDebugMatch` with discoveryStateOverride**

Similar to Task 5.1 but for discovery. Add:
```ts
discoveryStateOverride?: { attempts?: Array<{ affixA: string; affixB: string }>; discoveries?: string[] };
```

Inside the action, if provided, build a DiscoveryState and patch `matchState.discoveryState`. Reference `packages/engine/src/combine/discovery-state.ts` for the shape (likely has `addAttempt`/`addDiscovery` methods; may also have `deserialize`).

Simplest form: accept `{ count: number }` and seed N fake attempts (affixA1+affixB1, etc.). The recovery only cares about `discoveryCount`, which is the length of unique attempt keys.

- [ ] **Step 2: Thread through fixture**

Add `discoveryStateOverride?: Partial<DiscoveryState> | { count?: number }` to `RunViaStoreOpts`.

- [ ] **Step 3: Write R07d**

```ts
test('R07d: 5th discovery restores a life', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  await startRunViaStore(page, {
    round: 3, phase: 'draft',
    runStateOverride: { lives: 1, totalWins: 2, totalLosses: 0, consecutiveWins: 2 },
    discoveryStateOverride: { count: 5 },
    rigWinAgainst: 'ai-t1',
  });
  await completeDraftForgeAndWinDuel(page);
  // checkLifeRecovery sees discoveryCount=5 >= threshold, grants +1 life
  const livesCount = await page.locator('[data-testid="run-lives-display"] [data-life="filled"]').count();
  expect(livesCount).toBe(2);
});
```

- [ ] **Step 4: Run and commit**

### Task 5.5: Build `completeDraftForgeAndWinDuel` fixture + unskip F01

**Files:**
- Modify: `packages/client/e2e/fixtures/match.ts`
- Modify: `packages/client/e2e/run-flow.spec.ts`

**What the helper does:**
1. From a draft phase, pick gems until draft is complete (use existing `completeDraft` or build on it).
2. From forge, commit with a stockpile-based default loadout (may need to auto-socket gems into the weapon).
3. From duel, advance through phases until result. If the AI is guaranteed to lose (rigged win), final result is `winner === 0`.

**Rigging a win:** Options:
- (a) Seed an AI tier 1 opponent with a weak loadout so the player's loadout wins — fragile, needs balance.json knowledge.
- (b) Bypass the duel simulation by dispatching a `duel_continue` with a pre-computed `DuelResult` — cleanest but requires adding a fixture hook in `matchStore` for test-only "force outcome".
- (c) Let the duel run its natural course and don't assert on outcome — only works for tests that don't need a win.

For F01 (flux earned on win), we NEED a guaranteed win. Prefer **b** — add a test-only `forceDuelResult(winner)` action to `matchStore` that dispatches a synthetic `duel_continue` with a rigged outcome. Gate it behind `devMode` or a `__TEST__` flag so it can't be hit in production.

- [ ] **Step 1: Add `forceDuelResult` to matchStore**

```ts
// matchStore.ts
forceDuelResult: (winner: 0 | 1) => void;

// Inside the factory:
forceDuelResult: (winner) => {
  const state = get();
  if (!state.matchState) return;
  // Dispatch a synthetic duel result through the gateway
  // Reuse the engine's duel_continue handler with a fabricated DuelResult.
  // Implementation detail: this may require a new ActionKind or a direct state patch.
},
```

Look at how the real `duel_continue` is dispatched today to model this correctly.

- [ ] **Step 2: Add `completeDraftForgeAndWinDuel` to fixtures**

```ts
export async function completeDraftForgeAndWinDuel(page: Page): Promise<void> {
  await completeDraft(page);
  await waitForPhase(page, 'forge');
  await completeForge(page);
  await waitForPhase(page, 'duel');
  // Skip the duel animation and force a win
  await page.evaluate(() => {
    window.__matchStore?.getState().forceDuelResult(0);
  });
  await waitForPhase(page, 'draft'); // or 'complete' if this is the final round
}
```

`window.__matchStore` needs to be exposed — check if it already is in dev mode; if not, expose it conditionally in `main.tsx`.

- [ ] **Step 3: Unskip F01**

```ts
test('F01: winning a duel earns flux', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  await startRunViaStore(page, { round: 1, phase: 'forge' });
  // Read initial flux
  const before = Number(await page.locator('[data-run-flux]').getAttribute('data-run-flux'));
  // Complete forge, force a win, reach next forge
  await completeDraftForgeAndWinDuel(page);
  // Check flux increased (win reward = balance.json gem.flux.rewards.win)
  const after = Number(await page.locator('[data-run-flux]').getAttribute('data-run-flux'));
  expect(after).toBeGreaterThan(before);
});
```

- [ ] **Step 4: Run**

```bash
cd c:/Projects/Alloy/packages/client && pnpm playwright test --project=desktop run-flow.spec.ts -g F01
```

Expected: PASS. Run 2-3 times to confirm stability.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/matchStore.ts packages/client/e2e/fixtures/match.ts packages/client/e2e/run-flow.spec.ts
git commit -m "feat(client,test): forceDuelResult store action + completeDraftForgeAndWinDuel fixture

Adds a dev/test-only store action to skip a duel and force a winner.
E2E helper chains draft+forge+force-win+continue so fixture-heavy
tests (F01, R07b/c/d) can reach end-of-round state deterministically.

F01 unskipped and passing: flux increases after a won duel."
```

### Task 5.6: Update R09 skip comment for clarity

**File:**
- Modify: `packages/client/e2e/run-flow.spec.ts` (the `test.skip('R09: round 11 enters endless mode')` around line 235)

- [ ] **Step 1: Update the skip comment**

Current comment:
```ts
test.skip('R09: round 11 enters endless mode', async () => {
  // Blocked: phase-machine.ts:97-102 currently completes the run at goal.
  // Needs engine path for post-goal endless + "Continue Endless" UI.
});
```

Update to reference the deferred feature plan:
```ts
test.skip('R09: round 11 enters endless mode', async () => {
  // Deferred feature. Engine path does not exist:
  //   packages/engine/src/match/phase-machine.ts:97-102 marks the run
  //   'complete' the moment runState.status === 'won' (goal reached).
  // Enabling endless requires:
  //   (1) a new RunState flag (e.g., `continueEndless: boolean`)
  //   (2) phase-machine branch that, if continueEndless, skips the complete
  //       transition and returns a fresh draft phase at round+1 instead
  //   (3) client UI: an "Continue Endless" prompt on the goal-reached
  //       overlay, wired to set continueEndless=true
  // See ALPHA_READINESS.md "endless mode" section. Not alpha-blocking.
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/e2e/run-flow.spec.ts
git commit -m "docs(e2e): clarify R09 endless-mode skip is a deferred feature"
```

### Task 5.7: Full E2E suite final check

- [ ] **Step 1: Run the desktop suite in full**

```bash
cd c:/Projects/Alloy/packages/client && pnpm playwright test --project=desktop --reporter=line
```

Compare the failure list to the pre-flight baseline:
- F01 now PASSES
- R07b, R07c, R07d now PASS
- R09 still skipped (intentional)
- F02, F03 still skipped (separate deferred work — not in this plan)
- Pre-existing failures (match-flow, multiplayer-routing, forge-redesign, phase-transitions, duel-acceptance) — count and compare.

Any new regressions MUST be investigated and fixed before this chunk is done.

- [ ] **Step 2: Document the final state in the branch**

Update or create a one-paragraph summary at the bottom of `ALPHA_READINESS.md` noting the cleanup landed:
```md
## Post-Alpha Cleanup (2026-04-19)

Cleanup chunk 1–5 landed: engine tsc green (20+ errors → 0), engine tests 510/510,
balance tool tsc+tests green, E2E copy drift fixed, DU01 stabilized, F01+R07b/c/d
unskipped. R09 (endless mode) remains an intentionally-deferred feature.
```

Commit:
```bash
git add ALPHA_READINESS.md
git commit -m "docs: note post-alpha cleanup outcome in ALPHA_READINESS.md"
```

---

## Execution order

The chunks are mostly independent but have one ordering constraint:
- **Chunk 1 → Chunk 2**: engine source must compile before engine tests can all pass.
- **Chunks 3, 4, 5**: independent of the above and of each other.

Suggested order for a single pass: 1 → 2 → 3 → 4 → 5.

For parallel execution across multiple workers (if available): dispatch Chunk 1 first, then 2 on its completion; in parallel, dispatch 3 and 4; then 5 last (depends on no other chunk but benefits from a stable engine for fixture testing).

Each chunk is independently shippable — reviewer can merge chunk-by-chunk or as one PR.

## Out of scope (explicitly deferred)

- **R09 endless mode** — needs its own feature spec. Engine change + UI.
- **F02 (flux on discovery) / F03 (flux on milestone round)** — similar fixture shape to F01 but need different hooks (discovery dispatch + round advancement). Can be added in a follow-up after Chunk 5 lands the `forceDuelResult` primitive.
- **Matchmaking copy canonicalization** — Chunk 4 updates E2E tests to match current copy; it does NOT rename the buttons or add `data-testid` attributes for future stability. That's a separate UX polish.
- **Adapt phase engine cleanup** — the AI strategies now type-check but are still unreachable. Actual deletion (removing `AIController.planAdapt`, `AdaptStrategy` type, the 5 tier classes) is a larger refactor worth its own plan.

Done when:
- `cd packages/engine && pnpm tsc --noEmit` returns 0.
- `cd packages/engine && pnpm vitest run` returns 510/510.
- `cd packages/tools && pnpm tsc --noEmit && pnpm test` passes (or any skips documented).
- `cd packages/client && pnpm playwright test --project=desktop` shows no new regressions vs pre-flight baseline, plus F01 and R07b/c/d now passing.
