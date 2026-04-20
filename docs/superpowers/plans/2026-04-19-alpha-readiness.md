# Alpha Readiness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five P0 gaps (and the Day-3 ship items) identified in `ALPHA_READINESS.md` so Alloy can be shown to strangers without bouncing them in the first three minutes.

**Architecture:** Six independent chunks — four net-new client features, one cleanup, one backend-integration. Each chunk produces self-contained, independently-shippable software. No cross-chunk dependencies; order below is risk/impact-ordered, not dependency-ordered. Each chunk should be reviewed and merged before moving to the next to keep blast radius small.

**Tech Stack:** TypeScript 5.7 strict, React 19, Zustand 5, TailwindCSS v4, Vitest 3.x, Playwright (4 device profiles), Supabase (PostgreSQL + Realtime), pnpm 9 workspaces. No new libraries.

**Spec:** `ALPHA_READINESS.md` at repo root (April 19, 2026). One scope adjustment from the spec: the engine currently completes the run at the goal round ([phase-machine.ts:97-102](../../packages/engine/src/match/phase-machine.ts#L97)); true endless-mode entry needs its own engine spec. Chunk 2 here delivers the "goal reached" celebration that is shippable today.

**Working conventions:**
- Engine tests: `cd packages/engine && pnpm vitest run <pattern>`
- Client tests: `cd packages/client && pnpm vitest run <pattern>`
- Client E2E: `cd packages/client && pnpm playwright test <pattern>`
- Client dev server: `cd packages/client && pnpm dev` (port **9099**, not the Vite default)
- Commit cadence: one green test+implementation pair per commit, no batch commits.
- Bump `packages/client/package.json#version` on any user-visible change (project convention).

---

## Chunk 1: Retire the Adapt phase

**Why first:** it's dead code, it's the smallest chunk (30 minutes), and removing it shrinks the blast-radius surface for the rest of the work. The engine's phase machine never routes to `adapt` ([phase-machine.ts](../../packages/engine/src/match/phase-machine.ts) has no adapt case), `App.tsx` has no route for it, and `PhaseRouter.renderPhase()` has no branch for it. The only surviving references are `Adapt.tsx` itself and two `e2e/fixtures/match.ts` call sites.

Engine-side AI adapt strategies (`adapt-strategy.ts`, `AIController.planAdapt`) are out of scope here — they're unused but larger to clean up, and deleting them doesn't affect the player experience. Leave them for a future cleanup pass; add a short doc note so the next person knows.

### Task 1.1: Delete the client Adapt page and its fixture references

**Files:**
- Delete: `packages/client/src/pages/Adapt.tsx`
- Modify: `packages/client/e2e/fixtures/match.ts:98-124`

- [ ] **Step 1: Find every reference to Adapt in the client package**

Run:
```bash
cd c:/Projects/Alloy && grep -RIn "Adapt" packages/client/src packages/client/e2e
```

Expected results (no more, no less):
- `packages/client/src/pages/Adapt.tsx` — the file itself
- `packages/client/e2e/fixtures/match.ts:101` — `page.getByText(/Adapt Phase/i)` inside a phase-wait helper
- `packages/client/e2e/fixtures/match.ts:122` — `if (await page.getByText(/Adapt Phase/i)...)` inside a phase-detection helper

If anything else appears (e.g. an import from a component I missed), stop and verify — the deletion is not safe yet.

- [ ] **Step 2: Delete `Adapt.tsx`**

```bash
rm packages/client/src/pages/Adapt.tsx
```

- [ ] **Step 3: Remove the adapt branches from `e2e/fixtures/match.ts`**

Open `packages/client/e2e/fixtures/match.ts` and:
- In the phase-wait helper (around line 98–103) that lists phases to wait on, remove the `page.getByText(/Adapt Phase/i)` entry from the `Promise.race` / array literal. Keep the other phase entries intact.
- In the phase-detection helper (around line 118–124), remove the `if (await page.getByText(/Adapt Phase/i).isVisible().catch(() => false)) return 'adapt';` branch.
- If the phase-name union type anywhere in this file or its callers includes `'adapt'`, remove that member.

Before editing, read the file to see the full context — the exact lines may have shifted if other work landed recently.

- [ ] **Step 4: Run the client type-check**

```bash
cd packages/client && pnpm tsc --noEmit
```
Expected: PASS. If a call site still expects `'adapt'` as a return value, fix the call site — the phase is gone.

- [ ] **Step 5: Run the full client unit test suite**

```bash
cd packages/client && pnpm vitest run
```
Expected: ALL PASS. No test is expected to reference `Adapt.tsx` directly, but this confirms.

- [ ] **Step 6: Run the existing E2E flow tests to confirm fixtures still work**

```bash
cd packages/client && pnpm playwright test --project=desktop match-flow.spec.ts run-flow.spec.ts
```
Expected: no new failures vs. `main`. If a test was previously relying on `'adapt'` as a detected phase, it would hang on the wait helper — catch that here.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(client): retire unreachable Adapt phase route

Adapt.tsx was never routed to (App.tsx has no /adapt route, PhaseRouter
has no adapt case, phase-machine never returns kind 'adapt'). The
e2e fixtures' phase-wait/phase-detect helpers still listed it, which
meant any future phase-wait would race against a selector that can
never match. Delete the page and prune the fixture references.

Engine-side AIController.planAdapt + adapt-strategy.ts are unused but
left in place; cleanup is a separate pass."
```

### Task 1.2: Add a short note to the engine AI folder flagging the unused adapt strategies

**Files:**
- Modify: `packages/engine/src/ai/strategies/adapt-strategy.ts:1-10`

- [ ] **Step 1: Prepend a one-line comment to the top of `adapt-strategy.ts`**

Add, above the first import:

```ts
// NOTE (2026-04-19): The adapt phase is not wired into the phase machine
// (see phase-machine.ts — no 'adapt' case). AIController.planAdapt and these
// strategies are currently unreachable. Kept for future wiring; see
// ALPHA_READINESS.md for context. If you need to remove them, also remove
// planAdapt in ai-controller.ts and the `AdaptStrategy` export.
```

- [ ] **Step 2: Verify the engine still compiles**

```bash
cd packages/engine && pnpm tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/ai/strategies/adapt-strategy.ts
git commit -m "docs(engine): flag AI adapt strategies as currently unreachable"
```

---

## Chunk 2: Goal-reached celebration overlay

**Why:** Reaching the goal round is the emotional payoff of a run. Today it collapses into a bare "RUN WON!" heading in PostMatch. A one-shot celebration flourish makes the moment legible without any engine work.

**Scope note:** This is *not* endless mode entry. Endless mode needs engine changes in [phase-machine.ts:97-102](../../packages/engine/src/match/phase-machine.ts#L97) to not complete the run when `status === 'won'`. That belongs in a future plan. Here we only add presentation to the existing "reached goal → complete" path.

**Approach:** Add a client-only `GoalReachedOverlay` component that mounts in PostMatch when (a) the match is a run and (b) the run ended with `status === 'won'` (not 'lost'). It overlays the PostMatch screen for ~2.5 seconds, then fades out and leaves the existing PostMatch content visible underneath. No state machine changes.

### Task 2.1: Detect "run won at goal" in PostMatch

**Files:**
- Modify: `packages/client/src/pages/PostMatch.tsx` (add derived boolean; no render change yet)
- Test: `packages/client/src/pages/__tests__/PostMatch.test.tsx` (create if it doesn't exist)

- [ ] **Step 1: Write a failing test**

If `packages/client/src/pages/__tests__/PostMatch.test.tsx` does not exist yet, create it. Use the existing page-test patterns from `project_testing_patterns.md` in memory — mock gateway, pre-seed matchStore, render, assert.

Add a test that a run-won match surfaces a `data-testid="goal-reached-overlay"` element:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostMatch } from '@/pages/PostMatch';
import { makeMockGateway, seedMatchStore } from '@/test/gateway-helpers'; // use existing helper names; adapt if different

describe('PostMatch — goal reached overlay', () => {
  beforeEach(() => {
    // Use whatever gateway mock pattern the other PostMatch tests use
  });

  it('shows GoalReachedOverlay when run ended with status=won', () => {
    const gateway = makeMockGateway({
      mode: 'run_async',
      phase: { kind: 'complete', winner: 0, scores: [1, 0] },
      runState: {
        lives: 2, startingLives: 3, round: 10, status: 'won',
        consecutiveWins: 1, totalWins: 7, totalLosses: 3,
        goalRound: 10, flux: 4, rerollNextDraft: false,
        lifeRecovery: { winStreak: 3, milestoneRounds: [5, 10], discoveryThreshold: 5 },
      },
    });
    seedMatchStore(gateway);

    render(<PostMatch />);
    expect(screen.getByTestId('goal-reached-overlay')).toBeInTheDocument();
  });

  it('does NOT show the overlay when run ended with status=lost', () => {
    const gateway = makeMockGateway({
      mode: 'run_async',
      phase: { kind: 'complete', winner: 1, scores: [0, 1] },
      runState: {
        lives: 0, startingLives: 3, round: 7, status: 'lost',
        consecutiveWins: 0, totalWins: 4, totalLosses: 3,
        goalRound: 10, flux: 1, rerollNextDraft: false,
        lifeRecovery: { winStreak: 3, milestoneRounds: [5, 10], discoveryThreshold: 5 },
      },
    });
    seedMatchStore(gateway);

    render(<PostMatch />);
    expect(screen.queryByTestId('goal-reached-overlay')).not.toBeInTheDocument();
  });

  it('does NOT show the overlay in non-run modes', () => {
    const gateway = makeMockGateway({
      mode: 'ranked',
      phase: { kind: 'complete', winner: 0, scores: [2, 1] },
      runState: undefined,
    });
    seedMatchStore(gateway);

    render(<PostMatch />);
    expect(screen.queryByTestId('goal-reached-overlay')).not.toBeInTheDocument();
  });
});
```

If the existing PostMatch test helpers differ in name/API, adjust the imports but keep the three assertions identical.

- [ ] **Step 2: Run the test; verify it fails**

```bash
cd packages/client && pnpm vitest run src/pages/__tests__/PostMatch.test.tsx
```
Expected: FAIL — `getByTestId('goal-reached-overlay')` finds nothing.

- [ ] **Step 3: Commit the failing test**

```bash
git add packages/client/src/pages/__tests__/PostMatch.test.tsx
git commit -m "test(client): failing tests for goal-reached overlay in PostMatch"
```

### Task 2.2: Build the `GoalReachedOverlay` component

**Files:**
- Create: `packages/client/src/components/GoalReachedOverlay.tsx`

- [ ] **Step 1: Create the component**

Create `packages/client/src/components/GoalReachedOverlay.tsx`:

```tsx
import { useEffect, useState } from 'react';

interface GoalReachedOverlayProps {
  roundReached: number;
  goalRound: number;
  onDismiss?: () => void;
}

const AUTO_DISMISS_MS = 2500;

export function GoalReachedOverlay({ roundReached, goalRound, onDismiss }: GoalReachedOverlayProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <div
      data-testid="goal-reached-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(212, 168, 52, 0.35), rgba(0, 0, 0, 0.6) 70%)',
        animation: 'fade-in 0.3s ease-out, fade-out 0.4s ease-in 2.1s forwards',
      }}
      aria-live="polite"
      aria-label={`Goal reached at round ${roundReached}`}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <p
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'var(--text-sm)',
            letterSpacing: '0.1em',
            color: 'var(--color-accent-400)',
            textTransform: 'uppercase',
            opacity: 0.9,
          }}
        >
          Round {roundReached} / {goalRound}
        </p>
        <h2
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'clamp(2.5rem, 9vw, 5rem)',
            fontWeight: 900,
            letterSpacing: '0.08em',
            color: 'var(--color-accent-400)',
            textShadow:
              '0 0 32px rgba(212,168,52,0.7), 0 0 8px rgba(255,255,255,0.4)',
            animation: 'scale-in 0.5s cubic-bezier(0.2, 1.4, 0.3, 1) both',
          }}
        >
          GOAL REACHED
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'var(--text-md)',
            letterSpacing: '0.05em',
            color: 'var(--color-surface-100)',
          }}
        >
          You survived all {goalRound} rounds.
        </p>
      </div>
    </div>
  );
}
```

This relies on `fade-in`, `fade-out`, and `scale-in` keyframes. Check whether they already exist in `packages/client/src/index.css` — other overlays in the codebase (e.g. `RunRoundInterstitial`, `CelebrationOverlay`) likely use them. If any are missing, add them to `index.css`:

```css
@keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes fade-out { from { opacity: 1 } to { opacity: 0 } }
@keyframes scale-in { from { transform: scale(0.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }
```

Only add the ones that are missing — do not duplicate existing definitions.

- [ ] **Step 2: Verify the component renders in isolation**

Quick inline test at the end of the same commit (optional but cheap):

Append to `packages/client/src/components/__tests__/GoalReachedOverlay.test.tsx` (create if missing):

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GoalReachedOverlay } from '@/components/GoalReachedOverlay';

describe('GoalReachedOverlay', () => {
  it('renders the headline and round numbers', () => {
    render(<GoalReachedOverlay roundReached={10} goalRound={10} />);
    expect(screen.getByText(/GOAL REACHED/i)).toBeInTheDocument();
    expect(screen.getByText(/Round 10 \/ 10/)).toBeInTheDocument();
  });
});
```

Run:
```bash
cd packages/client && pnpm vitest run src/components/__tests__/GoalReachedOverlay.test.tsx
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/GoalReachedOverlay.tsx packages/client/src/components/__tests__/GoalReachedOverlay.test.tsx packages/client/src/index.css
git commit -m "feat(client): GoalReachedOverlay component"
```

### Task 2.3: Mount the overlay in PostMatch

**Files:**
- Modify: `packages/client/src/pages/PostMatch.tsx`

- [ ] **Step 1: Read the current PostMatch.tsx to locate the render root and existing matchState access**

Open `packages/client/src/pages/PostMatch.tsx`. Identify:
- Where `matchState` / `runState` is read
- The outermost wrapper `<div>` so the overlay can be a sibling

- [ ] **Step 2: Add the import and the conditional mount**

Add at the top:
```tsx
import { GoalReachedOverlay } from '@/components/GoalReachedOverlay';
```

Inside the render, just before the existing content's closing root element, add:
```tsx
{matchState?.runState?.status === 'won' && (
  <GoalReachedOverlay
    roundReached={matchState.runState.round}
    goalRound={matchState.runState.goalRound}
  />
)}
```

This is mount-once, auto-dismisses after 2.5s. The player lands on PostMatch, gets the flourish, then sees the usual run-summary UI underneath as the overlay fades.

- [ ] **Step 3: Run the failing Task 2.1 tests**

```bash
cd packages/client && pnpm vitest run src/pages/__tests__/PostMatch.test.tsx
```
Expected: ALL PASS (the three assertions from Task 2.1).

- [ ] **Step 4: Run the full client test suite for regressions**

```bash
cd packages/client && pnpm vitest run
```
Expected: ALL PASS.

- [ ] **Step 5: Manual smoke test**

1. `cd packages/client && pnpm dev`
2. Browser → `http://localhost:9099/queue` → Start Run → Tier 1
3. Use dev tools (see `uiStore.devMode` / DevDrawer) to jump to round 10, forge, win the duel.
4. On PostMatch arrival: "GOAL REACHED" flourish fades in, holds, fades out. Run summary visible underneath.
5. Then play a run where you die: no flourish (status='lost').

- [ ] **Step 6: Bump client version (project convention)**

Edit `packages/client/package.json`, bump `version` from current (e.g. `0.2.2`) to `0.2.3`. Patch bump — a small user-visible polish change.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/pages/PostMatch.tsx packages/client/package.json
git commit -m "feat(client): goal-reached flourish on run victory + bump 0.2.3

Mounts GoalReachedOverlay in PostMatch when runState.status === 'won'.
Auto-dismisses after 2.5s and leaves the run summary visible underneath.
Only fires for runs that actually reached the goal (status 'won' is set
by advanceRound when round >= goalRound); run losses and legacy-mode
matches are unaffected."
```

---

## Chunk 3: Base item selection on round 1

**Why:** 14 base items exist in `packages/engine/src/data/base-items.json`; every match currently uses whatever `startLocalMatch` preset (sword + chainmail). The `BaseItemSelector` component exists, the engine's `select_base_item` forge action is implemented ([forge-state.ts:95](../../packages/engine/src/forge/forge-state.ts#L95)), and `forgeStore` already has an `itemSelectionPhase` flag. The whole feature is stubbed-in — we just need to flip it on for round 1.

**Approach:** On first forge mount per match, check whether the player's loadout is still at its defaults. If so, set `itemSelectionPhase = true` and block the normal forge UI behind a two-step `BaseItemSelector` modal (weapon first, then armor). On confirm of each step, dispatch `select_base_item`. Once both are picked, flip `itemSelectionPhase = false` and show the normal forge UI. The first match creation should still set sane defaults in `createMatch` so the player's loadout is valid if they somehow skip selection — that's existing behavior; we don't need to change it.

### Task 3.1: Add a per-match flag for "base items selected"

The simplest way to tell whether the player has picked yet is a boolean on the run state or a flag in forgeStore. We want this to survive page refreshes within a single match, so storing on engine state makes more sense than client-only — but engine state is owned by the controller. For alpha we'll use a client-side flag in forgeStore scoped per match, which is the minimum change and avoids engine work.

**Files:**
- Modify: `packages/client/src/stores/forgeStore.ts` — add `hasSelectedBaseItems: Record<matchId, boolean>` and setter

- [ ] **Step 1: Write a failing test**

Add to `packages/client/src/stores/forgeStore.test.ts` (reuse existing describe block if present):

```ts
import { useForgeStore } from '@/stores/forgeStore';
import { describe, it, expect, beforeEach } from 'vitest';

describe('forgeStore — hasSelectedBaseItems', () => {
  beforeEach(() => {
    useForgeStore.getState().resetForMatch?.(); // use existing reset if present
  });

  it('defaults to false for an unknown match', () => {
    expect(useForgeStore.getState().hasSelectedBaseItems('match-A')).toBe(false);
  });

  it('marks a match as selected after setHasSelectedBaseItems', () => {
    useForgeStore.getState().setHasSelectedBaseItems('match-A', true);
    expect(useForgeStore.getState().hasSelectedBaseItems('match-A')).toBe(true);
    expect(useForgeStore.getState().hasSelectedBaseItems('match-B')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/client && pnpm vitest run src/stores/forgeStore.test.ts -t hasSelectedBaseItems
```
Expected: FAIL — method doesn't exist.

- [ ] **Step 3: Add the per-match flag**

In `packages/client/src/stores/forgeStore.ts`, add:

```ts
// Inside the state interface:
hasSelectedBaseItemsMap: Record<string, boolean>;
setHasSelectedBaseItems: (matchId: string, value: boolean) => void;
hasSelectedBaseItems: (matchId: string) => boolean;

// Inside the createHmrStore factory:
hasSelectedBaseItemsMap: {},
setHasSelectedBaseItems: (matchId, value) =>
  set((s) => ({
    hasSelectedBaseItemsMap: { ...s.hasSelectedBaseItemsMap, [matchId]: value },
  })),
hasSelectedBaseItems: (matchId) => Boolean(get().hasSelectedBaseItemsMap[matchId]),
```

If the file has a reset/init action for a new match, clear the entry for that matchId in it.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/client && pnpm vitest run src/stores/forgeStore.test.ts -t hasSelectedBaseItems
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/forgeStore.ts packages/client/src/stores/forgeStore.test.ts
git commit -m "feat(client): forgeStore tracks base-item selection per match"
```

### Task 3.2: Mount the BaseItemSelector flow on round-1 forge

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

- [ ] **Step 1: Wire the flow in `Forge.tsx`**

In `packages/client/src/pages/Forge.tsx`, around the existing `round` derivation (near line 70) and `itemSelectionPhase` read (line 53), add:

```tsx
const matchId = matchState?.matchId ?? '';
const hasSelectedBaseItems = useForgeStore((s) => s.hasSelectedBaseItems(matchId));
const setHasSelectedBaseItems = useForgeStore((s) => s.setHasSelectedBaseItems);

// Two-step selector state
const [selectorStep, setSelectorStep] = useState<'weapon' | 'armor' | 'done'>(
  hasSelectedBaseItems ? 'done' : 'weapon',
);

// Only show the selector on round 1 and only if not yet done for this match
const showBaseItemSelector =
  round === 1 && !hasSelectedBaseItems && selectorStep !== 'done';
```

Get weapon/armor rosters from the registry:
```tsx
const weaponRoster = useMemo(() => registry.getBaseItemsByType('weapon'), [registry]);
const armorRoster = useMemo(() => registry.getBaseItemsByType('armor'), [registry]);
```
(If `registry.getBaseItemsByType` isn't the actual method name, check [registry.ts](../../packages/engine/src/data/registry.ts) — the memory notes `baseItemsByType: Map<string, BaseItemDef[]>` around line 24, so the getter exists in some form.)

On weapon confirm:
```tsx
const handleWeaponSelect = (item: BaseItemDef) => {
  const result = applyAction(
    { kind: 'select_base_item', target: 'weapon', baseItemId: item.id },
    registry,
  );
  if (result.ok) {
    setSelectorStep('armor');
  } else {
    showToast({ kind: 'error', message: result.error });
  }
};

const handleArmorSelect = (item: BaseItemDef) => {
  const result = applyAction(
    { kind: 'select_base_item', target: 'armor', baseItemId: item.id },
    registry,
  );
  if (result.ok) {
    setHasSelectedBaseItems(matchId, true);
    setSelectorStep('done');
  } else {
    showToast({ kind: 'error', message: result.error });
  }
};
```

Render the selector in place of the normal forge content when `showBaseItemSelector` is true:

```tsx
if (showBaseItemSelector) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <BaseItemSelector
        itemType={selectorStep === 'weapon' ? 'weapon' : 'armor'}
        items={selectorStep === 'weapon' ? weaponRoster : armorRoster}
        onSelect={selectorStep === 'weapon' ? handleWeaponSelect : handleArmorSelect}
      />
    </div>
  );
}
```

Keep the rest of the Forge render unchanged.

- [ ] **Step 2: Confirm the engine accepts `select_base_item` only on round 1**

Read `packages/engine/src/forge/forge-plan.ts:239` (`planSelectBaseItem`). Verify it returns a failure for `round > 1`. If it doesn't, add that guard — otherwise a player could dispatch it later and blow away their loadout.

If a guard is missing, add a test first in `packages/engine/tests/forge-state.test.ts`:
```ts
it('rejects select_base_item outside of round 1', () => {
  const state = /* ... set up a forge state at round 2 ... */;
  const result = applyForgeAction(state, {
    kind: 'select_base_item', target: 'weapon', baseItemId: 'dagger',
  }, registry);
  expect(result.ok).toBe(false);
});
```
Then guard the action in `forge-state.ts:272`'s `applySelectBaseItem` or in `planSelectBaseItem` with a `round === 1` check.

- [ ] **Step 3: Run the engine test suite to confirm no regression**

```bash
cd packages/engine && pnpm vitest run
```
Expected: ALL PASS.

- [ ] **Step 4: Run the client test suite**

```bash
cd packages/client && pnpm vitest run
```
Expected: ALL PASS. The existing `BaseItemSelector.test.tsx` should continue to pass.

- [ ] **Step 5: Manual smoke test**

1. Start the dev server, `/queue → Start Run → Tier 1`.
2. Complete draft.
3. On forge load: the weapon selector should appear (14 options, grid).
4. Pick a weapon → the armor selector appears.
5. Pick an armor → the normal forge UI appears, loadout reflects the chosen base items (verify in ForgeHeader stat preview).
6. Proceed to duel → stats applied correctly.
7. Complete round 1 → round 2 forge: no selector, normal UI.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/Forge.tsx packages/engine/src/forge/forge-plan.ts packages/engine/src/forge/forge-state.ts packages/engine/tests/forge-state.test.ts
git commit -m "feat(client,engine): base item selection on round 1 forge

Round-1 forge now shows a two-step selector (weapon, then armor) before
the main forge UI. Each pick dispatches select_base_item via applyAction;
the engine guards against select_base_item outside round 1 so a
misbehaving client can't overwrite loadouts later.

Fixes: everyone-plays-sword+chainmail. 14 base items now reachable."
```

### Task 3.3: E2E test for base item selection

**Files:**
- Create: `packages/client/e2e/base-item-selection.spec.ts`

- [ ] **Step 1: Write the E2E test**

Mirror the patterns in `packages/client/e2e/forge-redesign.spec.ts` for startup. A minimal test:

```ts
import { test, expect } from '@playwright/test';
import { startRunViaStore } from './fixtures/match'; // or equivalent

test.describe('Base item selection', () => {
  test('B01: round 1 forge shows weapon selector, then armor selector', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    await startRunViaStore(page, { round: 1, phase: 'forge' });

    // Weapon selector visible
    await expect(page.getByText(/Choose your weapon/i)).toBeVisible({ timeout: 10_000 });
    const firstWeapon = page.locator('[data-base-item-card]').first();
    await firstWeapon.click();
    await page.getByRole('button', { name: /Confirm/i }).click();

    // Armor selector visible
    await expect(page.getByText(/Choose your armor/i)).toBeVisible({ timeout: 5_000 });
    const firstArmor = page.locator('[data-base-item-card]').first();
    await firstArmor.click();
    await page.getByRole('button', { name: /Confirm/i }).click();

    // Normal forge UI visible
    await expect(page.getByTestId('forge-gem-tray')).toBeVisible({ timeout: 5_000 });
  });

  test('B02: round 2 forge does NOT show the selector', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    await startRunViaStore(page, { round: 2, phase: 'forge', hasSelectedBaseItems: true });

    await expect(page.getByText(/Choose your weapon/i)).not.toBeVisible();
    await expect(page.getByTestId('forge-gem-tray')).toBeVisible({ timeout: 10_000 });
  });
});
```

`[data-base-item-card]` attribute needs to be added to `BaseItemCard` — check the file and add `data-base-item-card="true"` on the outer card element if not already present.

`startRunViaStore` may not yet accept a `hasSelectedBaseItems` option — extend it to set the forgeStore flag before the page boots.

- [ ] **Step 2: Add the `data-base-item-card` attribute if missing**

Read `packages/client/src/features/forge/BaseItemCard.tsx`. Add `data-base-item-card="true"` to the outer element.

- [ ] **Step 3: Run the new spec**

```bash
cd packages/client && pnpm playwright test --project=desktop base-item-selection.spec.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/base-item-selection.spec.ts packages/client/src/features/forge/BaseItemCard.tsx packages/client/e2e/fixtures/match.ts
git commit -m "test(e2e): base item selection flow (round 1 shows selector, round 2 skips)"
```

---

## Chunk 4: Profile persistence to Supabase

**Why:** `profileStore` tracks elo/wins/losses in memory; Supabase's `profiles` table has matched the same shape for months ([001_users_profiles.sql](../../packages/supabase/migrations/001_users_profiles.sql)) but nothing reads or writes it. Any showcase right now is a fresh profile every refresh, which breaks the "show off progression" story the alpha is supposed to tell.

**Approach:** Hydrate `profileStore` from the `profiles` table on auth init (after the existing anonymous sign-in lands a session). On match completion, write through to the same row. Supabase RLS policies (migration 005) should already let the authenticated user update their own row. Stay within Supabase's JS client — no edge function needed; the profiles table is read/writable directly by the row's owner. Offline fallback (guest mode) keeps today's local-only behavior.

**Design decisions:**
- Hydration is one-shot on auth success. No live subscription.
- Write-through happens in `recordResult` *after* the local state update, fire-and-forget with error logging. We don't block the UI on network success.
- On hydration failure (network error, row missing), log + continue with local defaults — we don't want to take the game offline over a profile fetch.

### Task 4.1: Add a profile API helper

**Files:**
- Create: `packages/client/src/shared/utils/profile-api.ts`
- Test: `packages/client/src/shared/utils/profile-api.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchProfile, updateProfileStats } from './profile-api';

vi.mock('@/shared/utils/supabase', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from '@/shared/utils/supabase';

describe('profile-api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('fetchProfile returns null when supabase is unavailable', async () => {
    (getSupabase as any).mockReturnValue(null);
    const result = await fetchProfile('user-id');
    expect(result).toBeNull();
  });

  it('fetchProfile returns the row when it exists', async () => {
    (getSupabase as any).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'user-id',
                elo: 1234,
                matches_played: 5,
                matches_won: 3,
                current_streak: 2,
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    const result = await fetchProfile('user-id');
    expect(result).toEqual({
      elo: 1234,
      wins: 3,
      losses: 2, // matches_played - matches_won
      currentStreak: 2,
    });
  });

  it('fetchProfile returns null on error and logs', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (getSupabase as any).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'oops' } }),
          }),
        }),
      }),
    });
    const result = await fetchProfile('user-id');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('updateProfileStats is a no-op when supabase is unavailable', async () => {
    (getSupabase as any).mockReturnValue(null);
    await expect(updateProfileStats('user-id', {
      elo: 1001, wins: 1, losses: 0, currentStreak: 1,
    })).resolves.toBeUndefined();
  });

  it('updateProfileStats upserts the changed fields', async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    (getSupabase as any).mockReturnValue({
      from: () => ({ update }),
    });
    await updateProfileStats('user-id', {
      elo: 1100, wins: 2, losses: 1, currentStreak: 1,
    });
    expect(update).toHaveBeenCalledWith({
      elo: 1100,
      matches_played: 3,
      matches_won: 2,
      current_streak: 1,
    });
  });
});
```

- [ ] **Step 2: Run the tests; verify they fail**

```bash
cd packages/client && pnpm vitest run src/shared/utils/profile-api.test.ts
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the helpers**

```ts
// packages/client/src/shared/utils/profile-api.ts
import { getSupabase } from '@/shared/utils/supabase';

export interface ProfileStats {
  elo: number;
  wins: number;
  losses: number;
  currentStreak: number;
}

export async function fetchProfile(userId: string): Promise<ProfileStats | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('elo, matches_played, matches_won, current_streak')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.warn('[profile-api] fetchProfile failed:', error.message);
    return null;
  }

  return {
    elo: data.elo,
    wins: data.matches_won,
    losses: data.matches_played - data.matches_won,
    currentStreak: data.current_streak,
  };
}

export async function updateProfileStats(userId: string, stats: ProfileStats): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase
    .from('profiles')
    .update({
      elo: stats.elo,
      matches_played: stats.wins + stats.losses,
      matches_won: stats.wins,
      current_streak: stats.currentStreak,
    })
    .eq('id', userId);

  if (error) {
    console.warn('[profile-api] updateProfileStats failed:', error.message);
  }
}
```

- [ ] **Step 4: Run the tests; verify they pass**

```bash
cd packages/client && pnpm vitest run src/shared/utils/profile-api.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/shared/utils/profile-api.ts packages/client/src/shared/utils/profile-api.test.ts
git commit -m "feat(client): profile-api fetch + update helpers"
```

### Task 4.2: Hydrate profileStore after anonymous sign-in

**Files:**
- Modify: `packages/client/src/stores/authStore.ts:27-70`
- Modify: `packages/client/src/stores/profileStore.ts`

- [ ] **Step 1: Extend profileStore to accept a hydrate action and track currentStreak**

In `packages/client/src/stores/profileStore.ts`, add:

```ts
interface ProfileStore {
  elo: number;
  wins: number;
  losses: number;
  currentStreak: number;
  matchHistory: { matchId: string; result: 'win' | 'loss' | 'draw'; eloChange: number }[];

  hydrateFromRemote: (stats: { elo: number; wins: number; losses: number; currentStreak: number }) => void;
  recordResult: (matchId: string, result: 'win' | 'loss' | 'draw', eloChange: number) => void;
  reset: () => void;
}
```

And in the factory add `currentStreak: 0` to the initial state and an action:
```ts
hydrateFromRemote: (stats) =>
  set({ elo: stats.elo, wins: stats.wins, losses: stats.losses, currentStreak: stats.currentStreak }),
```

Update `recordResult` to also maintain `currentStreak`:
```ts
recordResult: (matchId, result, eloChange) =>
  set((s) => ({
    elo: s.elo + eloChange,
    wins: s.wins + (result === 'win' ? 1 : 0),
    losses: s.losses + (result === 'loss' ? 1 : 0),
    currentStreak: result === 'win' ? s.currentStreak + 1 : 0,
    matchHistory: [...s.matchHistory, { matchId, result, eloChange }],
  })),
```

And `reset` should also zero `currentStreak`.

- [ ] **Step 2: Hydrate in authStore.initAuth**

In `packages/client/src/stores/authStore.ts`, after `set({ playerId: ..., supabaseUserId: ... })` on lines 42 and 59 (both code paths where a real session is established), trigger hydration:

```ts
import { fetchProfile } from '@/shared/utils/profile-api';
import { useProfileStore } from '@/stores/profileStore';

// Inside the "existing session" branch (after the set({...}) around line 45):
const remoteStats = await fetchProfile(session.user.id);
if (remoteStats) useProfileStore.getState().hydrateFromRemote(remoteStats);

// Inside the "signInAnonymously" branch (after the set({...}) around line 63):
const remoteStats2 = await fetchProfile(data.user.id);
if (remoteStats2) useProfileStore.getState().hydrateFromRemote(remoteStats2);
```

Guest fallback paths do not hydrate — `profileStore` stays at defaults.

- [ ] **Step 3: Add a failing test for the hydrate path**

In `packages/client/src/stores/authStore.test.ts`, add:

```ts
it('hydrates profileStore after anonymous sign-in', async () => {
  // Mock getSupabase to return a client whose auth.signInAnonymously returns a user,
  // and whose from('profiles').select.eq.maybeSingle returns a row with elo=1234.
  // After initAuth, useProfileStore.getState().elo should be 1234.
});
```
Wire up with the existing Supabase mocks in that test file. The exact mock setup will mirror other test cases in the file.

- [ ] **Step 4: Run the test; verify it passes**

```bash
cd packages/client && pnpm vitest run src/stores/authStore.test.ts
```
Expected: PASS. Existing tests in the file should also pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/authStore.ts packages/client/src/stores/profileStore.ts packages/client/src/stores/authStore.test.ts
git commit -m "feat(client): hydrate profileStore from Supabase on auth init

After anonymous sign-in (or existing-session detection), fetch the
profile row and seed elo/wins/losses/currentStreak. Guest fallback
paths remain local-only. Fetch failures log + continue."
```

### Task 4.3: Write-through on match completion

**Files:**
- Modify: `packages/client/src/stores/profileStore.ts` (dispatch remote update)
- Modify: `packages/client/src/pages/PostMatch.tsx` or wherever `recordResult` is called today — confirm the call site

- [ ] **Step 1: Find where recordResult is called today**

```bash
cd c:/Projects/Alloy && grep -RIn "recordResult" packages/client/src
```
Expect call site(s) in PostMatch.tsx or a gateway hook. Note them.

- [ ] **Step 2: Write a failing test**

Add to `packages/client/src/stores/profileStore.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useProfileStore } from '@/stores/profileStore';
import { useAuthStore } from '@/stores/authStore';

vi.mock('@/shared/utils/profile-api', () => ({
  fetchProfile: vi.fn(),
  updateProfileStats: vi.fn(),
}));

import { updateProfileStats } from '@/shared/utils/profile-api';

describe('profileStore — write-through on recordResult', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useProfileStore.getState().reset();
    useAuthStore.setState({ playerId: 'user-1', supabaseUserId: 'user-1', isGuest: false, displayName: 'P' });
  });

  it('calls updateProfileStats with the new totals when a match is recorded', async () => {
    useProfileStore.getState().recordResult('m1', 'win', +25);
    // Writes are fire-and-forget; allow microtask queue to drain
    await Promise.resolve();
    expect(updateProfileStats).toHaveBeenCalledWith('user-1', {
      elo: 1025,
      wins: 1,
      losses: 0,
      currentStreak: 1,
    });
  });

  it('does NOT call updateProfileStats for guest users', async () => {
    useAuthStore.setState({ playerId: 'guest_x', supabaseUserId: null, isGuest: true, displayName: 'G' });
    useProfileStore.getState().recordResult('m1', 'win', +25);
    await Promise.resolve();
    expect(updateProfileStats).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test; verify it fails**

```bash
cd packages/client && pnpm vitest run src/stores/profileStore.test.ts -t write-through
```
Expected: FAIL — `updateProfileStats` is not called.

- [ ] **Step 4: Wire write-through into recordResult**

In `packages/client/src/stores/profileStore.ts`:

```ts
import { updateProfileStats } from '@/shared/utils/profile-api';
import { useAuthStore } from '@/stores/authStore';

// Inside recordResult after the local set:
recordResult: (matchId, result, eloChange) => {
  set((s) => {
    const next = {
      elo: s.elo + eloChange,
      wins: s.wins + (result === 'win' ? 1 : 0),
      losses: s.losses + (result === 'loss' ? 1 : 0),
      currentStreak: result === 'win' ? s.currentStreak + 1 : 0,
      matchHistory: [...s.matchHistory, { matchId, result, eloChange }],
    };
    // Fire-and-forget write-through for authenticated users
    const auth = useAuthStore.getState();
    if (!auth.isGuest && auth.supabaseUserId) {
      void updateProfileStats(auth.supabaseUserId, {
        elo: next.elo, wins: next.wins, losses: next.losses, currentStreak: next.currentStreak,
      });
    }
    return next;
  });
},
```

The `void` prevents an accidental await + avoids unhandled-rejection warnings (the helper catches its own error).

- [ ] **Step 5: Run the tests; verify they pass**

```bash
cd packages/client && pnpm vitest run src/stores/profileStore.test.ts
```
Expected: PASS.

- [ ] **Step 6: Manual smoke test**

1. Open the app in a browser where you have Supabase credentials configured.
2. Let anonymous auth complete (see network tab for `signInAnonymously`).
3. Start an AI match, complete it.
4. Check the `profiles` table in Supabase: the row for your user should show updated `elo`, `matches_played`, `matches_won`, `current_streak`.
5. Hard-refresh the page. MainMenu / Profile page should show the persisted elo, not 1000.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/stores/profileStore.ts packages/client/src/stores/profileStore.test.ts
git commit -m "feat(client): write-through profile stats to Supabase on match end

recordResult now fires-and-forgets a profile update for authenticated
users (isGuest === false && supabaseUserId is set). Guests remain
local-only. Errors log via profile-api and don't block the UI.

Combined with hydrateFromRemote on auth init, elo/wins/losses/streak
now persist across page refreshes for anonymous-auth sessions."
```

### Task 4.4: Client version bump for profile persistence

- [ ] **Step 1: Bump `packages/client/package.json#version`**

Minor bump — this is a feature, not a fix. e.g. 0.2.3 → 0.3.0.

- [ ] **Step 2: Commit**

```bash
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.3.0 (profile persistence)"
```

---

## Chunk 5: First-time onboarding overlay

**Why:** The most distinctive mechanic in Alloy is the three-layer discovery-gated combine, and a first-time player has no pointer to it. They draft, they forge, they fight. The mechanic is invisible. A minimal overlay that fires on first draft and tells them three things — drag to pick, combine to discover, gems shape your duel — is enough for alpha. Anything heavier is tutorial scope-creep.

**Approach:** A localStorage-backed flag (`alloy.onboarding.seen`) controls whether the overlay mounts. It fires once on the first ever Draft load. A three-step dismissable card sequence: "Drag gems to pick them" → "Combine two gems to discover recipes" → "Your gems shape the duel that follows." After dismissing step 3, flag is set to `true` and the overlay never shows again unless the player resets it from Settings.

### Task 5.1: Onboarding flag store

**Files:**
- Create: `packages/client/src/stores/onboardingStore.ts`
- Test: `packages/client/src/stores/onboardingStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useOnboardingStore } from '@/stores/onboardingStore';

describe('onboardingStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useOnboardingStore.getState().reset();
  });

  it('defaults to seen=false', () => {
    expect(useOnboardingStore.getState().seen).toBe(false);
  });

  it('markSeen sets seen=true and persists', () => {
    useOnboardingStore.getState().markSeen();
    expect(useOnboardingStore.getState().seen).toBe(true);
    expect(localStorage.getItem('alloy.onboarding.seen')).toBe('true');
  });

  it('hydrates from localStorage on first read', () => {
    localStorage.setItem('alloy.onboarding.seen', 'true');
    // Re-import / re-instantiate the store to trigger hydration
    useOnboardingStore.getState().reset();
    useOnboardingStore.getState().hydrate();
    expect(useOnboardingStore.getState().seen).toBe(true);
  });

  it('reset clears both state and localStorage', () => {
    useOnboardingStore.getState().markSeen();
    useOnboardingStore.getState().reset();
    expect(useOnboardingStore.getState().seen).toBe(false);
    expect(localStorage.getItem('alloy.onboarding.seen')).toBeNull();
  });
});
```

- [ ] **Step 2: Run; verify it fails**

```bash
cd packages/client && pnpm vitest run src/stores/onboardingStore.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// packages/client/src/stores/onboardingStore.ts
import { createHmrStore } from './hmr-store';

const STORAGE_KEY = 'alloy.onboarding.seen';

interface OnboardingStore {
  seen: boolean;
  hydrate: () => void;
  markSeen: () => void;
  reset: () => void;
}

export const useOnboardingStore = createHmrStore<OnboardingStore>('onboardingStore', (set) => ({
  seen: typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true',
  hydrate: () => {
    if (typeof localStorage === 'undefined') return;
    set({ seen: localStorage.getItem(STORAGE_KEY) === 'true' });
  },
  markSeen: () => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, 'true');
    set({ seen: true });
  },
  reset: () => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    set({ seen: false });
  },
}));
```

- [ ] **Step 4: Run; verify it passes**

```bash
cd packages/client && pnpm vitest run src/stores/onboardingStore.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/onboardingStore.ts packages/client/src/stores/onboardingStore.test.ts
git commit -m "feat(client): onboardingStore tracks first-visit flag"
```

### Task 5.2: OnboardingOverlay component

**Files:**
- Create: `packages/client/src/components/OnboardingOverlay.tsx`
- Test: `packages/client/src/components/__tests__/OnboardingOverlay.test.tsx`

- [ ] **Step 1: Write the component**

```tsx
// packages/client/src/components/OnboardingOverlay.tsx
import { useState } from 'react';

interface OnboardingOverlayProps {
  onDismiss: () => void;
}

const STEPS = [
  {
    title: 'Draft your gems',
    body: 'Drag gems from the pool into your stockpile. Each gem will shape your gladiator in the coming duel.',
  },
  {
    title: 'Combine to discover',
    body: 'In the forge, drag two gems into the combine slots and press COMBINE. New combinations reveal new recipes — experiment!',
  },
  {
    title: 'Win with what you bring',
    body: 'Equip your best gems into weapon and armor sockets, then watch the duel play out. Every round, the stakes rise.',
  },
];

export function OnboardingOverlay({ onDismiss }: OnboardingOverlayProps) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else onDismiss();
  };

  return (
    <div
      data-testid="onboarding-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(6px)',
        animation: 'fade-in 0.2s ease-out',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        className="flex max-w-md flex-col gap-4 rounded-xl p-6"
        style={{
          background: 'var(--color-surface-800)',
          border: '1px solid var(--color-surface-600)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-accent-400)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Step {step + 1} of {STEPS.length}
        </p>
        <h2
          id="onboarding-title"
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'var(--text-2xl)',
            fontWeight: 800,
            color: 'white',
            letterSpacing: '0.03em',
          }}
        >
          {s.title}
        </h2>
        <p style={{ color: 'var(--color-surface-200)', lineHeight: 1.5 }}>
          {s.body}
        </p>
        <div className="flex justify-between gap-3 pt-2">
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-sm"
            style={{
              color: 'var(--color-surface-400)',
              fontFamily: 'var(--font-family-display)',
              letterSpacing: '0.04em',
            }}
          >
            SKIP
          </button>
          <button
            onClick={next}
            data-testid="onboarding-next"
            className="rounded-lg px-6 py-2 font-bold"
            style={{
              background: 'linear-gradient(to bottom, var(--color-accent-400), var(--color-accent-500))',
              color: 'var(--color-surface-900)',
              fontFamily: 'var(--font-family-display)',
              letterSpacing: '0.04em',
              boxShadow: 'var(--shadow-button)',
            }}
          >
            {step < STEPS.length - 1 ? 'NEXT' : 'GOT IT'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write and run component tests**

```tsx
// packages/client/src/components/__tests__/OnboardingOverlay.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OnboardingOverlay } from '@/components/OnboardingOverlay';

describe('OnboardingOverlay', () => {
  it('renders step 1 on mount', () => {
    render(<OnboardingOverlay onDismiss={() => {}} />);
    expect(screen.getByText(/Draft your gems/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument();
  });

  it('advances through steps on NEXT', () => {
    render(<OnboardingOverlay onDismiss={() => {}} />);
    fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(screen.getByText(/Combine to discover/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(screen.getByText(/Win with what you bring/i)).toBeInTheDocument();
  });

  it('calls onDismiss on GOT IT', () => {
    const onDismiss = vi.fn();
    render(<OnboardingOverlay onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('onboarding-next'));
    fireEvent.click(screen.getByTestId('onboarding-next'));
    fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('calls onDismiss on SKIP', () => {
    const onDismiss = vi.fn();
    render(<OnboardingOverlay onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText(/SKIP/i));
    expect(onDismiss).toHaveBeenCalled();
  });
});
```

Run:
```bash
cd packages/client && pnpm vitest run src/components/__tests__/OnboardingOverlay.test.tsx
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/OnboardingOverlay.tsx packages/client/src/components/__tests__/OnboardingOverlay.test.tsx
git commit -m "feat(client): OnboardingOverlay 3-step dismissable card"
```

### Task 5.3: Mount the overlay on first Draft load

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx`

- [ ] **Step 1: Wire the overlay**

Open `packages/client/src/pages/Draft.tsx`. Near the top-level imports add:
```tsx
import { OnboardingOverlay } from '@/components/OnboardingOverlay';
import { useOnboardingStore } from '@/stores/onboardingStore';
```

Inside the component, near the other hooks:
```tsx
const onboardingSeen = useOnboardingStore((s) => s.seen);
const markOnboardingSeen = useOnboardingStore((s) => s.markSeen);
```

In the return tree, as a sibling inside the outermost wrapper (so it overlays the whole draft):
```tsx
{!onboardingSeen && <OnboardingOverlay onDismiss={markOnboardingSeen} />}
```

- [ ] **Step 2: Manual smoke test**

1. Clear localStorage: `localStorage.clear()` in DevTools.
2. Navigate to a draft: `/queue → Play vs AI → Tier 1`.
3. Overlay appears with Step 1. Click NEXT twice, then GOT IT. Overlay dismisses.
4. Reload the page, go through draft again: no overlay.
5. In DevTools: `localStorage.getItem('alloy.onboarding.seen')` → `"true"`.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Draft.tsx
git commit -m "feat(client): show onboarding overlay on first-ever draft visit"
```

### Task 5.4: "Show tips again" entry in Settings

**Files:**
- Modify: `packages/client/src/components/SettingsContent.tsx`

- [ ] **Step 1: Add a button**

Read `packages/client/src/components/SettingsContent.tsx` to see the existing structure. Add a section:

```tsx
import { useOnboardingStore } from '@/stores/onboardingStore';

// Inside the component:
const resetOnboarding = useOnboardingStore((s) => s.reset);
const [toast, setToast] = useState<string | null>(null);

// In the render:
<div className="flex flex-col gap-2">
  <button
    onClick={() => {
      resetOnboarding();
      setToast('Onboarding tips will show on your next draft.');
      setTimeout(() => setToast(null), 2500);
    }}
    className="rounded border border-surface-500 bg-surface-700 px-4 py-2 text-sm text-white"
  >
    Show onboarding tips again
  </button>
  {toast && <p className="text-xs text-accent-400">{toast}</p>}
</div>
```

- [ ] **Step 2: Smoke test**

1. Open Settings. Click the button.
2. Navigate to a draft. Overlay appears again. Dismiss.
3. No regression to other settings controls (audio, etc.).

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/SettingsContent.tsx
git commit -m "feat(client): Settings control to re-show onboarding tips"
```

### Task 5.5: E2E test for onboarding

**Files:**
- Create: `packages/client/e2e/onboarding.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test';

test.describe('Onboarding overlay', () => {
  test('O01: first-visit player sees 3-step overlay on draft', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    await page.addInitScript(() => localStorage.clear());

    await page.goto('/');
    await page.getByRole('button', { name: /PLAY/i }).click();
    await page.getByRole('button', { name: /Play vs AI/i }).click();
    await page.getByRole('button', { name: /Tier 1/i }).click();

    await expect(page.getByTestId('onboarding-overlay')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Step 1 of 3/i)).toBeVisible();

    await page.getByTestId('onboarding-next').click();
    await expect(page.getByText(/Step 2 of 3/i)).toBeVisible();

    await page.getByTestId('onboarding-next').click();
    await expect(page.getByText(/Step 3 of 3/i)).toBeVisible();

    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible();
  });

  test('O02: returning player does NOT see overlay', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    await page.addInitScript(() => localStorage.setItem('alloy.onboarding.seen', 'true'));

    await page.goto('/');
    await page.getByRole('button', { name: /PLAY/i }).click();
    await page.getByRole('button', { name: /Play vs AI/i }).click();
    await page.getByRole('button', { name: /Tier 1/i }).click();

    // Wait for draft to settle and assert overlay is absent
    await expect(page.locator('[data-gem]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible();
  });
});
```

Button selector text (`Play vs AI`, `Tier 1`, etc.) should match actual Matchmaking copy — verify and adjust.

- [ ] **Step 2: Run it**

```bash
cd packages/client && pnpm playwright test --project=desktop onboarding.spec.ts
```
Expected: PASS (both tests).

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/onboarding.spec.ts
git commit -m "test(e2e): onboarding overlay first-visit and returning-player paths"
```

### Task 5.6: Client version bump

- [ ] **Step 1: Bump `packages/client/package.json#version`**

Minor bump: onboarding is a feature. e.g. 0.3.0 → 0.4.0.

- [ ] **Step 2: Commit**

```bash
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.4.0 (onboarding overlay)"
```

---

## Chunk 6: Unskip E2E, opponent context, and final alpha bump

**Why:** With flux UI, base item selection, and profile persistence landed, most of the previously-blocked E2E skips are actually runnable. Un-skipping them locks the P0 work in against regression. Add opponent-tier context to phase headers (P1 item, small) and bump to 0.5.0-alpha as the shipping version.

**Approach:** Five substeps — add a `data-run-flux` test hook, un-skip flux tests, un-skip milestone/discovery life-recovery tests, add opponent tier display, version bump.

### Task 6.1: `data-run-flux` hook + opponent tier display

**Files:**
- Modify: `packages/client/src/components/ForgeHeader.tsx` or wherever flux is rendered — add `data-run-flux={value}`
- Modify: phase headers (`PhaseRouter.tsx` around line 98–116 — run-mode header bar) — add opponent tier display for AI matches

- [ ] **Step 1: Add the `data-run-flux` attribute**

Find the flux renderer in the Forge header. Add `data-run-flux={currentFlux}` to the outer element of the flux display. Confirm with:
```bash
grep -RIn 'flux' packages/client/src/components/ForgeHeader.tsx
```

- [ ] **Step 2: Add opponent tier display**

In `packages/client/src/pages/PhaseRouter.tsx`, inside the run-mode header bar (around line 107–114), add an opponent chip for AI matches:

```tsx
{matchState.aiOpponentTier && (
  <span
    data-testid="opponent-tier-chip"
    style={{
      fontFamily: 'var(--font-family-display)',
      fontSize: 'var(--text-xs)',
      color: 'var(--color-surface-300)',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
    }}
  >
    vs AI T{matchState.aiOpponentTier}
  </span>
)}
```

`matchState.aiOpponentTier` may not exist today — check `packages/engine/src/types/match.ts`. If it doesn't, add it:
- Modify `MatchState` interface to include `aiOpponentTier?: 1 | 2 | 3 | 4 | 5`
- Thread it through `createMatch` → accept as an optional param → store on the state
- Pass it from the client's `startLocalMatch` where the AI tier is already passed to the controller

If that's too much for a P1 chunk, scope down to: display the tier only if the match code starts with `ai-`, inferring tier from the original `startLocalMatch` call by stashing it on the gateway's state (pragmatic, client-only workaround).

Simplest client-only path: stash the tier in `matchStore` when `startLocalMatch` runs, and read it in the header. No engine change needed.

- [ ] **Step 3: Verify both**

Dev server, start an AI Tier 3 run. Header should show `vs AI T3`. Flux value during forge should have `data-run-flux` attribute.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(client): opponent tier chip in run header + data-run-flux test hook"
```

### Task 6.2: Unskip F01, F04, F05, F06

**Files:**
- Modify: `packages/client/e2e/run-flow.spec.ts`

- [ ] **Step 1: Un-skip F01 (flux on win)**

Replace the skip with a real test:
```ts
test('F01: winning a duel earns flux', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  await startRunViaStore(page, { round: 1, phase: 'forge', rigWinAgainst: 'ai-t1' });
  // Preconditions: flux starts at some known value (0)
  const before = await page.locator('[data-run-flux]').getAttribute('data-run-flux');
  // Play through to duel → win
  await completeForgeAndWinDuel(page);
  // After win, next forge: flux has increased
  const after = await page.locator('[data-run-flux]').getAttribute('data-run-flux');
  expect(Number(after)).toBeGreaterThan(Number(before));
});
```

`completeForgeAndWinDuel` may need to be added to `e2e/fixtures/match.ts` if not present. It should commit the forge plan and let the duel play out.

- [ ] **Step 2: Un-skip F04 (reroll_pool)**

```ts
test('F04: reroll_pool button spends flux and generates new draft pool', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  await startRunViaStore(page, { round: 2, phase: 'forge', seedFlux: 5 });

  const fluxBefore = Number(await page.locator('[data-run-flux]').getAttribute('data-run-flux'));
  await page.getByRole('button', { name: /Reroll Pool/i }).click();
  const fluxAfter = Number(await page.locator('[data-run-flux]').getAttribute('data-run-flux'));
  expect(fluxAfter).toBe(fluxBefore - 2); // reroll cost per balance.json
});
```

- [ ] **Step 3: Un-skip F05, F06 similarly**

F05: guarantee_rarity (3 flux). F06: boost_combine (1 flux). Same pattern: seed flux, click button, assert cost deducted.

- [ ] **Step 4: Run the updated run-flow spec**

```bash
cd packages/client && pnpm playwright test --project=desktop run-flow.spec.ts
```
Expected: F01, F04, F05, F06 now pass. F02 (discovery flux), F03 (milestone flux), R07b/c/d, R09 may remain skipped (some require deeper fixture work — attempt, but mark still-skipped if blocked).

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/run-flow.spec.ts packages/client/e2e/fixtures/match.ts
git commit -m "test(e2e): unskip flux-on-win, reroll, guarantee, boost tests

Pair with the fat run-flow fixtures (seedFlux, rigWinAgainst,
completeForgeAndWinDuel). F02/F03 may still need discovery/milestone
seed work — left as test.skip with an explicit reason."
```

### Task 6.3: Attempt to unskip R07b/c/d

**Files:**
- Modify: `packages/client/e2e/run-flow.spec.ts`

- [ ] **Step 1: R07b — milestone round 5 restores a life**

```ts
test('R07b: milestone round 5 restores a life', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  await startRunViaStore(page, {
    round: 5, phase: 'draft',
    runStateOverride: { lives: 1, totalWins: 4, totalLosses: 1 },
    rigWinAgainst: 'ai-t1',
  });
  await completeDraftForgeAndWinDuel(page);
  // After duel_continue: lives should be 2 (milestone +1)
  const livesCount = await page.locator('[data-testid="run-lives-display"] [data-life="filled"]').count();
  expect(livesCount).toBe(2);
});
```

- [ ] **Step 2: R07c, R07d analogous**

R07c: round 10 milestone. R07d: 5 discoveries → +1 life (seed discoveryState).

- [ ] **Step 3: Run**

```bash
cd packages/client && pnpm playwright test --project=desktop run-flow.spec.ts -g R07
```

If `runStateOverride` or `discoveryStateOverride` don't yet exist in `startRunViaStore`, extend the fixture. If they're too heavy to implement in this pass, leave these three `test.skip` with an updated comment explaining what's needed.

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/run-flow.spec.ts packages/client/e2e/fixtures/match.ts
git commit -m "test(e2e): attempt R07b/c/d life-recovery tests

Unskip or leave-skipped-with-reason depending on fixture reach."
```

### Task 6.4: Bump to 0.5.0-alpha + changelog line

**Files:**
- Modify: `packages/client/package.json`

- [ ] **Step 1: Bump the version**

Set `packages/client/package.json#version` to `0.5.0-alpha`. The `-alpha` tag is the signal this is the first showable version.

- [ ] **Step 2: Run the full client test suite + a smoke E2E**

```bash
cd packages/client && pnpm vitest run
cd packages/client && pnpm playwright test --project=desktop match-flow.spec.ts run-flow.spec.ts
```
Expected: ALL pass.

- [ ] **Step 3: Commit**

```bash
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.5.0-alpha

Early-alpha marker. Ships with the ALPHA_READINESS P0 bundle:
  - Adapt phase retired
  - Goal-reached celebration
  - Base item selection on round 1
  - Profile persistence (Supabase)
  - First-time onboarding overlay
  - Opponent tier display in run header
  - E2E coverage for flux earn/spend loops"
```

- [ ] **Step 4: Tag the alpha (optional, user may want to do this themselves)**

Do NOT push without the user's explicit confirmation. Locally:
```bash
git tag v0.5.0-alpha
```

Ask the user before pushing the tag.

---

## Post-Plan: P1/P2 items left out

These were called out in ALPHA_READINESS.md but are deliberately not in this plan:

- **P1.7 opponent context** — partially covered in Chunk 6 Task 6.1; the opponent-name display for PvP matches is deferred (AI tier is covered).
- **P1.8 main-menu polish** — open-ended creative work; deserves its own brainstorm session.
- **P1.9 `damage-calc.ts` isolated tests** — historical gap; covered by integration tests; revisit before any balance pass.
- **P1.10 keyboard nav** — accessibility pass, deserves its own plan (not alpha-blocking).
- **P2 items** — all deferred (run history, Gem Blueprint link, settings content expansion, sound audit, collection "my gems" tab).
- **True endless mode entry** — phase-machine work to let a run continue past goal. Needs engine spec; not alpha-blocking.

---

## Execution order recommendation

The six chunks are independent. The recommended order is:

1. **Chunk 1** (Adapt cleanup) — smallest, reduces noise for the rest.
2. **Chunk 2** (Goal-reached overlay) — smallest net-new feature, validates the test scaffold.
3. **Chunk 3** (Base item selection) — unblocks a designed-but-hidden feature, contained to Forge.
4. **Chunk 4** (Profile persistence) — Supabase integration, isolated from UI chunks.
5. **Chunk 5** (Onboarding) — highest first-impression lift; ship after the above polish so the tips describe the actual game.
6. **Chunk 6** (E2E + opponent chip + alpha bump) — locks everything in, final ship.

Each chunk is a separate PR. Reviewer can merge them independently without waiting for the next.
