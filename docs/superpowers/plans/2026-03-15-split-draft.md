# Split Draft Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single upfront draft into three smaller drafts (8/4/4 picks per player), one before each forge round, so the game starts faster and players get adaptation orbs between rounds.

**Architecture:** Modify the MatchPhase type to add `round` to the draft phase, update the phase machine to insert draft phases after duel rounds 1 and 2, modify pool generation to accept a pool size parameter, and update balance.json with per-round pool config. Quick match is unchanged. Frontend Draft page already works dynamically — only needs round number display and navigation updates.

**Tech Stack:** TypeScript (engine), Vitest (tests), React (client pages)

**Spec:** `docs/superpowers/specs/2026-03-15-split-draft-design.md`

---

## File Structure

```
packages/engine/
├── src/types/match.ts           # MODIFY: Add round to draft phase
├── src/types/balance.ts         # MODIFY: Replace draftPoolSize with per-round config
├── src/data/balance.json        # MODIFY: New pool size fields
├── src/data/schemas.ts          # MODIFY: Update Zod schema for new balance fields
├── src/pool/pool-generator.ts   # MODIFY: Accept poolSize parameter
├── src/match/phase-machine.ts   # MODIFY: Draft phases after duel R1/R2
├── src/match/match-controller.ts # MODIFY: Generate pools per round, handle new flow
├── tests/match.test.ts          # MODIFY: Update phase transition tests
├── tests/draft.test.ts          # MODIFY: Draft state needs round awareness
├── tests/data.test.ts           # MODIFY: Balance config shape change
├── tests/pool.test.ts           # MODIFY: Pool generation with size param
packages/client/
├── src/pages/Draft.tsx           # MODIFY: Show round number
├── src/pages/Duel.tsx            # MODIFY: Navigate to draft (not forge) after duel R1/R2
├── e2e/match-flow.spec.ts       # MODIFY: Test new draft-between-rounds flow
```

---

## Task 1: Update Types (MatchPhase + BalanceConfig)

**Files:**
- Modify: `packages/engine/src/types/match.ts`
- Modify: `packages/engine/src/types/balance.ts`

- [ ] **Step 1: Add round field to draft MatchPhase**

In `packages/engine/src/types/match.ts`, change:
```typescript
| { kind: 'draft'; pickIndex: number; activePlayer: 0 | 1 }
```
to:
```typescript
| { kind: 'draft'; round: 1 | 2 | 3; pickIndex: number; activePlayer: 0 | 1 }
```

- [ ] **Step 2: Update BalanceConfig with per-round draft fields**

In `packages/engine/src/types/balance.ts`, replace:
```typescript
draftPoolSize: { min: number; max: number };
```
with:
```typescript
draftPoolPerRound: [number, number, number];    // [16, 8, 8]
draftPicksPerPlayer: [number, number, number];  // [8, 4, 4]
```

Keep `draftPoolSizeQuick` unchanged for quick matches.

- [ ] **Step 3: Verify engine compiles**

```bash
cd packages/engine && npx tsc --noEmit 2>&1 | head -20
```

Expected: Compile errors in files that reference the old types (match-controller, phase-machine, tests). That's expected — we'll fix them in subsequent tasks.

---

## Task 2: Update Balance Data + Schema

**Files:**
- Modify: `packages/engine/src/data/balance.json`
- Modify: `packages/engine/src/data/schemas.ts`
- Modify: `packages/engine/tests/data.test.ts`

- [ ] **Step 1: Update balance.json**

Replace:
```json
"draftPoolSize": { "min": 30, "max": 36 },
```
with:
```json
"draftPoolPerRound": [16, 8, 8],
"draftPicksPerPlayer": [8, 4, 4],
```

- [ ] **Step 2: Update Zod schema in schemas.ts**

Find the balance config schema and replace the `draftPoolSize` field with:
```typescript
draftPoolPerRound: z.tuple([z.number(), z.number(), z.number()]),
draftPicksPerPlayer: z.tuple([z.number(), z.number(), z.number()]),
```

- [ ] **Step 3: Update data.test.ts if it references draftPoolSize**

Search for any test assertions about `draftPoolSize` and update them to reference `draftPoolPerRound`.

- [ ] **Step 4: Run data tests**

```bash
cd packages/engine && npx vitest run tests/data.test.ts
```

---

## Task 3: Update Pool Generator

**Files:**
- Modify: `packages/engine/src/pool/pool-generator.ts`
- Modify: `packages/engine/tests/pool.test.ts`

- [ ] **Step 1: Add poolSize and round parameters to generatePool**

Change the signature from:
```typescript
export function generatePool(
  seed: number,
  mode: 'quick' | 'ranked' | 'unranked',
  registry: DataRegistry,
): OrbInstance[]
```
to:
```typescript
export function generatePool(
  seed: number,
  mode: 'quick' | 'ranked' | 'unranked',
  registry: DataRegistry,
  round: 1 | 2 | 3 = 1,
): OrbInstance[]
```

Inside the function:
- For quick mode: use `draftPoolSizeQuick` as before
- For ranked/unranked: use `balance.draftPoolPerRound[round - 1]` as the exact pool size (no min/max range — fixed size per round)
- Fork RNG with `pool_r${round}` instead of just `pool`
- For round > 1: skip archetype validation (supplemental orbs don't need it)
- For round > 1: skip trigger orb guarantee (round 1 handles that)

- [ ] **Step 2: Update buildPool helper**

The internal `buildPool` function currently reads `draftPoolSize` from balance config. Change it to accept a `poolSize: number` parameter instead.

- [ ] **Step 3: Update pool tests**

Update `tests/pool.test.ts`:
- Existing tests pass `round` = 1 (default)
- Add tests for round 2 and 3 with smaller pool sizes
- Verify round 2/3 pools are deterministic from the same seed
- Verify round 1 and round 2 produce different orbs (different RNG fork)

- [ ] **Step 4: Run pool tests**

```bash
cd packages/engine && npx vitest run tests/pool.test.ts
```

---

## Task 4: Update Phase Machine

**Files:**
- Modify: `packages/engine/src/match/phase-machine.ts`

- [ ] **Step 1: Update getNextPhase to insert drafts between duel rounds**

Change the `'duel'` case in `getNextPhase`:

```typescript
case 'duel': {
  const round = current.round;
  const wins = countWins(roundResults);
  if (wins[0] >= 2 || wins[1] >= 2) {
    const winner = wins[0] >= 2 ? 0 : 1;
    return { kind: 'complete', winner, scores: wins };
  }
  if (round >= 3) {
    const winner = determineWinner(wins);
    return { kind: 'complete', winner, scores: wins };
  }
  // NEW: Go to draft for next round (not forge)
  const nextRound = (round + 1) as 2 | 3;
  return { kind: 'draft', round: nextRound, pickIndex: 0, activePlayer: 0 };
}
```

Change the `'draft'` case to use the draft's round:
```typescript
case 'draft':
  return { kind: 'forge', round: current.round };
```

- [ ] **Step 2: Update isValidTransition**

Update validation to allow:
- `draft(N)` → `forge(N)` (for any N)
- `duel(N)` → `draft(N+1)` (for N < 3)

```typescript
case 'draft':
  return to.kind === 'forge' && to.round === from.round;

case 'duel':
  if (to.kind === 'complete') return true;
  if (to.kind === 'draft' && from.round < 3) {
    return to.round === from.round + 1;
  }
  return false;
```

- [ ] **Step 3: Update getNextPhaseQuick — no changes needed**

Quick match flow: `draft → forge(1) → duel(1) → complete`. Verify the draft case returns `forge(1)` — it should, since `current.round` for quick match draft is 1.

But wait — the quick match draft phase needs a round field too now. Update `getNextPhaseQuick` to expect `draft` with `round: 1`.

- [ ] **Step 4: Run existing match/phase tests to see what breaks**

```bash
cd packages/engine && npx vitest run tests/match.test.ts
```

---

## Task 5: Update Match Controller

**Files:**
- Modify: `packages/engine/src/match/match-controller.ts`

- [ ] **Step 1: Update createMatch to set draft round**

Change the initial phase from:
```typescript
phase: { kind: 'draft', pickIndex: 0, activePlayer: 0 },
```
to:
```typescript
phase: { kind: 'draft', round: 1, pickIndex: 0, activePlayer: 0 },
```

- [ ] **Step 2: Update handleDraftPick to use draft round**

In the synced draft state and the transition logic, use `state.phase.round` (now available since draft has a round field). When draft completes:
- Use `state.phase.round` to determine which forge round to transition to
- Generate flux for `state.phase.round`

- [ ] **Step 3: Update handleAdvancePhase (duel completion)**

After running a duel, when the next phase is `draft` (rounds 2/3):
- Generate a new pool: `generatePool(state.seed, state.mode, registry, nextRound)`
- Set `state.pool` to the new pool
- Clear `forgeFlux` and `forgeComplete`

The key change is in `runDuel()` — after computing `nextPhase`, if `nextPhase.kind === 'draft'`:
```typescript
if (nextPhase.kind === 'draft') {
  const newPool = generatePool(state.seed, state.mode, registry, nextPhase.round);
  newState.pool = newPool;
}
```

- [ ] **Step 4: Run all engine tests**

```bash
cd packages/engine && npx vitest run
```

---

## Task 6: Fix Remaining Engine Tests

**Files:**
- Modify: `packages/engine/tests/match.test.ts`
- Modify: `packages/engine/tests/draft.test.ts`

- [ ] **Step 1: Update match integration tests**

Tests that assert phase transitions need updating:
- After draft completes → forge(1) (was forge(1), still forge(1) — but draft now has round)
- After duel(1) → draft(2) (was forge(2))
- After duel(2) → draft(3) (was forge(3))
- Full match flow tests that simulate all phases need the new draft rounds

- [ ] **Step 2: Update draft tests**

Any test that creates a draft phase or checks `state.phase` needs to include `round`:
```typescript
// Before: { kind: 'draft', pickIndex: 0, activePlayer: 0 }
// After:  { kind: 'draft', round: 1, pickIndex: 0, activePlayer: 0 }
```

- [ ] **Step 3: Run full engine test suite**

```bash
cd packages/engine && npx vitest run
```

All 167+ tests must pass.

---

## Task 7: Update Frontend

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx`
- Modify: `packages/client/src/pages/Duel.tsx`

- [ ] **Step 1: Show draft round number in Draft.tsx**

The Draft page header should show which draft round it is. Read `phase.round` from the match state:

```typescript
const draftRound = phase?.kind === 'draft' ? phase.round : 1;
```

Display: "ROUND 1 DRAFT" / "ROUND 2 DRAFT" / "ROUND 3 DRAFT" in the status bar.

- [ ] **Step 2: Update Duel.tsx navigation after duel**

In `handleContinue()`, after a duel the next phase may be `draft` instead of `forge`. Update navigation:

```typescript
const handleContinue = () => {
  if (phase?.kind === 'draft') {
    navigate(`/match/${id}/draft`, { replace: true });
  } else if (phase?.kind === 'forge') {
    navigate(`/match/${id}/forge`, { replace: true });
  } else if (phase?.kind === 'complete') {
    navigate(`/match/${id}/result`, { replace: true });
  }
};
```

Also update the auto-navigate effect that watches for phase changes.

- [ ] **Step 3: Update button text in Duel breakdown**

The "Continue to Forge" button should say "Continue to Draft" when the next phase is draft:
```typescript
{phase?.kind === 'complete' ? 'SEE RESULTS' :
 phase?.kind === 'draft' ? 'CONTINUE TO DRAFT' :
 'CONTINUE TO FORGE'}
```

- [ ] **Step 4: Run client type check**

```bash
cd packages/client && npx tsc --noEmit
```

---

## Task 8: Update E2E Tests

**Files:**
- Modify: `packages/client/e2e/match-flow.spec.ts`
- Modify: `packages/client/e2e/fixtures/match.ts`

- [ ] **Step 1: Update match flow test for new phase sequence**

The match flow now goes: draft → forge → duel → draft → forge → duel → ...

After duel R1 breakdown, clicking "Continue" now goes to draft (not forge). Update the test to handle the new draft phase between duel rounds.

Add a `completeDraftRound` helper or reuse `completeDraft` since the Draft page works the same way regardless of round.

- [ ] **Step 2: Run E2E tests**

```bash
cd packages/client && npx playwright test
```

All 24 tests must pass across all device profiles.

---

## Task 9: Final Verification

- [ ] **Step 1: Run full engine test suite**

```bash
cd packages/engine && npx vitest run
```

- [ ] **Step 2: Run client unit tests**

```bash
cd packages/client && npx vitest run
```

- [ ] **Step 3: Run E2E tests**

```bash
cd packages/client && npx playwright test
```

- [ ] **Step 4: Run client build**

```bash
pnpm -F @alloy/client build
```

- [ ] **Step 5: Verify in browser**

Start dev server, play a match against Tier 1 AI. Verify:
- Round 1 draft has ~16 orbs in pool
- After duel R1, a new draft appears with ~8 fresh orbs
- After duel R2, another new draft appears with ~8 fresh orbs
- Player stockpile accumulates across all 3 drafts
- Forge phases work correctly with the accumulated stockpile
- Quick match still has a single draft

---

## Verification Checklist

- [ ] Engine tests pass (all existing + new)
- [ ] Client unit tests pass (30 tests)
- [ ] E2E tests pass (24 across 4 devices)
- [ ] Client build succeeds
- [ ] Draft R1: 16 orb pool, 8 picks per player
- [ ] Draft R2: 8 fresh orbs, 4 picks per player
- [ ] Draft R3: 8 fresh orbs, 4 picks per player
- [ ] Stockpile accumulates across drafts
- [ ] Quick match unchanged (single draft)
- [ ] Phase machine: draft(1)→forge(1)→duel(1)→draft(2)→forge(2)→duel(2)→draft(3)→forge(3)→duel(3)
