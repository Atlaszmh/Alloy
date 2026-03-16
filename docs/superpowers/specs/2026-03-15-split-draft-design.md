# Split Draft — Design Spec

**Date:** 2026-03-15
**Status:** Approved

---

## Problem

The initial draft phase is too long. With 30-36 orbs drafted upfront, the draft takes ~2 minutes of alternating picks before any forging happens. This front-loads all strategic decisions into one phase and makes the game feel slow to start.

## Solution

Split the single draft into three smaller drafts — one before each forge round. Front-loaded distribution: 8 picks per player in round 1, 4 in rounds 2 and 3. Each draft gets a fresh pool (no carryover). Total picks per player: 16, matching the current feel.

## New Match Flow (Ranked/Unranked)

```
Draft R1 (8pp, 16 pool) → Forge R1 → Duel R1
  → Draft R2 (4pp, 8 pool) → Forge R2 → Duel R2
    → Draft R3 (4pp, 8 pool) → Forge R3 → Duel R3
```

**Quick match:** Unchanged — single draft → forge → duel.

## Phase Machine Changes

Current:
```
draft → forge(1) → duel(1) → forge(2) → duel(2) → forge(3) → duel(3) → complete
```

New:
```
draft(1) → forge(1) → duel(1) → draft(2) → forge(2) → duel(2) → draft(3) → forge(3) → duel(3) → complete
```

After a duel in rounds 1 and 2, the next phase is `draft` (not `forge`). After duel round 3 (or when a player reaches 2 wins), the match completes as before.

## Type Changes

### MatchPhase

Draft phase gains a `round` field:

```typescript
type MatchPhase =
  | { kind: 'draft'; round: 1 | 2 | 3; pickIndex: number; activePlayer: 0 | 1 }
  | { kind: 'forge'; round: 1 | 2 | 3 }
  | { kind: 'duel'; round: 1 | 2 | 3 }
  | { kind: 'adapt'; round: 2 | 3 }
  | { kind: 'complete'; winner: 0 | 1 | 'draw'; scores: [number, number] };
```

### BalanceConfig

Replace single pool size with per-round config:

```typescript
// Remove:
draftPoolSize: { min: number; max: number };

// Add:
draftPoolPerRound: [number, number, number];  // [16, 8, 8] — total orbs in pool
draftPicksPerPlayer: [number, number, number]; // [8, 4, 4] — picks per player
```

Quick match config stays separate (`draftPoolSizeQuick` unchanged).

## Pool Generation

Three independent pools generated from the match seed:

- Round 1: `rng.fork('pool_r1')` → 16 orbs, archetype validation required
- Round 2: `rng.fork('pool_r2')` → 8 orbs, no archetype validation (supplemental)
- Round 3: `rng.fork('pool_r3')` → 8 orbs, no archetype validation (supplemental)

Each pool uses the same tier distribution ratios from `balance.json`. Only round 1 pool needs archetype validation since it's the foundation of both players' builds.

## Match Controller Changes

### createMatch()

Only generates the round 1 pool. Sets initial phase to `{ kind: 'draft', round: 1, pickIndex: 0, activePlayer: 0 }`.

### handleDraftPick()

When draft completes, transitions to `forge` for the current round (same as before, but now draft knows its round).

### Phase transitions after duel

When a duel completes and the match isn't over:
1. Generate pool for next round: `generatePool(seed, 'ranked', registry, nextRound)`
2. Set match state pool to the new pool
3. Transition to `{ kind: 'draft', round: nextRound, pickIndex: 0, activePlayer: 0 }`
4. Set flux for the upcoming forge round

### Pool generator changes

`generatePool()` gains an optional `round` parameter. When `round > 1`, it uses the smaller pool size from `draftPoolPerRound[round-1]` and skips archetype validation.

## Frontend Changes

### Draft page

Already works with whatever pool is in match state. Changes:
- Show round number in header: "ROUND 1 DRAFT" / "ROUND 2 DRAFT" / "ROUND 3 DRAFT"
- Phase transition overlay shows "ROUND 2 — DRAFT" when entering later drafts
- Drag-to-draft mechanic works identically

### Matchmaking / AI flow

`startLocalMatch()` unchanged — it calls `createMatch()` which now only generates the R1 pool.

### Navigation

After duel breakdown "Continue" button: navigates to `/match/:id/draft` for rounds 1-2, or `/match/:id/result` for round 3 / match decided. Currently navigates to `/match/:id/forge`.

## What Doesn't Change

- Forge system (flux values 8/4/2, all actions, slot mechanics)
- Duel engine (simulation, combat log, tick events)
- Stat calculator
- AI controller (`pickOrb()` and `planForge()` work with whatever state they receive)
- Draft mechanics (alternating picks, timer, two-tap/drag)
- Quick match flow
- Synergy/combination systems
- All meta screens

## Test Impact

Existing tests affected:
- `tests/match.test.ts` — phase transitions change
- `tests/draft.test.ts` — draft state needs round field
- `tests/data.test.ts` — balance config shape changes
- E2E `match-flow.spec.ts` — flow now has draft phases between duels

New tests needed:
- Phase machine: draft(1) → forge(1) → duel(1) → draft(2) → forge(2) → ...
- Pool generation per round (3 independent pools from same seed)
- Draft round field propagation
- Quick match unaffected (still single draft)
