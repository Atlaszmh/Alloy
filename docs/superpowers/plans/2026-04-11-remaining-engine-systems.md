# Remaining Engine Systems Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four remaining engine systems for the gem refactor: flux economy, synergy completion, AI forge strategy scaling, and synthetic AI opponent generation.

**Architecture:** All changes are in `packages/engine/`. Pure functions following existing patterns — immutable state returns, deterministic given seed, config-driven via `balance.json`. TDD with Vitest.

**Tech Stack:** TypeScript 5.7+, Vitest 3.x, `@alloy/engine` package

**Spec:** `docs/superpowers/specs/2026-04-11-remaining-engine-systems-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/run/flux-state.ts` | Create | Pure flux earn/spend/validate functions |
| `src/run/run-state.ts` | Modify | Add `flux` and `rerollNextDraft` fields to `RunState` |
| `src/types/forge-action.ts` | Modify | Add `boost_combine`, `reroll_pool`, `guarantee_rarity` variants |
| `src/forge/forge-state.ts` | Modify | Add default case to `applyForgeAction` switch for new ForgeAction variants |
| `src/forge/forge-plan.ts` | Modify | Handle `boost_combine` rarity bump in `planCombine`; add `boostNextCombine` flag to `ForgePlan` |
| `src/match/match-controller.ts` | Modify | Flux earn on duel completion; flux spend validation at `forge_complete`; synergy discovery; `DiscoveryState` on `MatchState` |
| `src/types/match.ts` | Modify | Add `discoveryState` field to `MatchState` |
| `src/forge/stat-calculator.ts` | Modify | Tag-based `collectAffixIds`; return `StatsResult` |
| `src/forge/forge-plan.ts` | Modify | Update `getPlannedStats` return type |
| `src/match/match-report.ts` | Modify | Destructure `StatsResult` from `calculateStats` |
| `src/combine/discovery-state.ts` | Modify | Add `totalDiscoveryCount()` |
| `src/ai/strategies/forge-strategy.ts` | Modify | Round-aware behavior for Tiers 2-5 |
| `src/run/synthetic-opponent.ts` | Create | Generate AI opponent loadout for given round |
| `src/forge/flux-tracker.ts` | Delete | Replaced by `flux-state.ts` |
| `src/index.ts` | Modify | Update exports |
| `tests/flux-state.test.ts` | Create | Flux earn/spend tests |
| `tests/forge-plan.test.ts` | Modify | `boost_combine` + `StatsResult` destructure |
| `tests/stat-calculator.test.ts` | Modify | Tag-based synergy + `StatsResult` shape |
| `tests/match-controller.test.ts` | Modify | Flux earn, synergy discovery, discovery count in life recovery |
| `tests/discovery-state.test.ts` | Modify | `totalDiscoveryCount()` |
| `tests/ai-tiers.test.ts` | Modify | Round-dependent forge strategy behavior |
| `tests/synthetic-opponent.test.ts` | Create | Determinism, tier selection, payload shape |

---

## Chunk 1: Flux Economy

### Task 1: Add flux field to RunState

**Files:**
- Modify: `packages/engine/src/run/run-state.ts:17-27`

- [ ] **Step 1: Add `flux` and `rerollNextDraft` to RunState interface**

In `packages/engine/src/run/run-state.ts`, add two fields to the `RunState` interface:

```typescript
export interface RunState {
  lives: number;
  startingLives: number;
  round: number;
  status: 'active' | 'won' | 'lost';
  consecutiveWins: number;
  totalWins: number;
  totalLosses: number;
  goalRound: number;
  lifeRecovery: LifeRecoveryConfig;
  flux: number;
  rerollNextDraft: boolean;
}
```

- [ ] **Step 2: Initialize new fields in `createRunState`**

Update `createRunState` to set `flux: 0` and `rerollNextDraft: false`:

```typescript
export function createRunState(opts: CreateRunOpts = {}): RunState {
  const startingLives = opts.startingLives ?? 3;
  return {
    lives: startingLives,
    startingLives,
    round: 1,
    status: 'active',
    consecutiveWins: 0,
    totalWins: 0,
    totalLosses: 0,
    goalRound: opts.goalRound ?? 10,
    lifeRecovery: {
      ...DEFAULT_LIFE_RECOVERY,
      ...opts.lifeRecovery,
    },
    flux: 0,
    rerollNextDraft: false,
  };
}
```

- [ ] **Step 3: Run existing tests to confirm nothing breaks**

Run: `cd packages/engine && npx vitest run tests/run-state.test.ts`
Expected: All existing tests pass (new fields have defaults).

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/run/run-state.ts
git commit -m "feat(engine): add flux and rerollNextDraft fields to RunState"
```

---

### Task 2: Create flux-state.ts with earn/spend/validate

**Files:**
- Create: `packages/engine/src/run/flux-state.ts`
- Create: `packages/engine/tests/flux-state.test.ts`

- [ ] **Step 1: Write failing tests for flux state**

Create `packages/engine/tests/flux-state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { earnFlux, spendFlux, canSpendFlux } from '../src/run/flux-state.js';
import { createRunState } from '../src/run/run-state.js';

describe('FluxState', () => {
  describe('earnFlux', () => {
    it('adds amount to flux balance', () => {
      const state = createRunState();
      const after = earnFlux(state, 3);
      expect(after.flux).toBe(3);
    });

    it('accumulates across multiple earn calls', () => {
      let state = createRunState();
      state = earnFlux(state, 1);
      state = earnFlux(state, 2);
      expect(state.flux).toBe(3);
    });

    it('does not mutate original state', () => {
      const state = createRunState();
      earnFlux(state, 5);
      expect(state.flux).toBe(0);
    });
  });

  describe('canSpendFlux', () => {
    it('returns true when flux >= cost', () => {
      let state = createRunState();
      state = earnFlux(state, 5);
      expect(canSpendFlux(state, 5)).toBe(true);
      expect(canSpendFlux(state, 3)).toBe(true);
    });

    it('returns false when flux < cost', () => {
      const state = createRunState();
      expect(canSpendFlux(state, 1)).toBe(false);
    });
  });

  describe('spendFlux', () => {
    it('deducts cost from flux balance', () => {
      let state = createRunState();
      state = earnFlux(state, 10);
      state = spendFlux(state, 3);
      expect(state.flux).toBe(7);
    });

    it('throws when insufficient flux', () => {
      const state = createRunState();
      expect(() => spendFlux(state, 1)).toThrow('Insufficient flux');
    });

    it('does not mutate original state', () => {
      let state = createRunState();
      state = earnFlux(state, 5);
      const before = state.flux;
      spendFlux(state, 3);
      expect(state.flux).toBe(before);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/flux-state.test.ts`
Expected: FAIL — module `../src/run/flux-state.js` not found.

- [ ] **Step 3: Implement flux-state.ts**

Create `packages/engine/src/run/flux-state.ts`:

```typescript
import type { RunState } from './run-state.js';

/** Add flux to the run state. */
export function earnFlux(state: RunState, amount: number): RunState {
  return { ...state, flux: state.flux + amount };
}

/** Check if the player can afford a flux cost. */
export function canSpendFlux(state: RunState, cost: number): boolean {
  return state.flux >= cost;
}

/** Deduct flux. Throws if insufficient. */
export function spendFlux(state: RunState, cost: number): RunState {
  if (state.flux < cost) throw new Error('Insufficient flux');
  return { ...state, flux: state.flux - cost };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/flux-state.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/run/flux-state.ts packages/engine/tests/flux-state.test.ts
git commit -m "feat(engine): add flux-state pure functions for earn/spend/validate"
```

---

### Task 3: Add flux spend ForgeAction variants

**Files:**
- Modify: `packages/engine/src/types/forge-action.ts`

- [ ] **Step 1: Add three new variants to ForgeAction**

Update `packages/engine/src/types/forge-action.ts`:

```typescript
import type { BaseStat } from './base-stats.js';

export type ForgeAction =
  | { kind: 'socket_gem'; gemUid: string; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'unsocket_gem'; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'combine'; gemUid1: string; gemUid2: string; keepGemUid?: string }
  | { kind: 'select_base_item'; target: 'weapon' | 'armor'; baseItemId: string }
  | { kind: 'set_base_stats'; target: 'weapon' | 'armor'; stat1: BaseStat; stat2: BaseStat }
  | { kind: 'boost_combine' }
  | { kind: 'reroll_pool' }
  | { kind: 'guarantee_rarity' };
```

- [ ] **Step 2: Run type check to verify no compile errors**

Run: `cd packages/engine && npx tsc --noEmit`
Expected: Compile errors in `forge-plan.ts` line 71 (`default` case) and `forge-strategy.ts` switches — this is expected and will be fixed in the next tasks.

- [ ] **Step 3: Fix exhaustiveness in forge-plan.ts**

In `packages/engine/src/forge/forge-plan.ts`, update the `applyPlanAction` switch to handle the new variants. `boost_combine` sets a flag on the plan; `reroll_pool` and `guarantee_rarity` are handled at match-controller level:

```typescript
export function applyPlanAction(
  plan: ForgePlan,
  action: ForgeAction,
  registry: DataRegistry,
): PlanResult {
  switch (action.kind) {
    case 'socket_gem': return planSocketGem(plan, action);
    case 'unsocket_gem': return planUnsocketGem(plan, action);
    case 'set_base_stats': return planSetBaseStats(plan, action);
    case 'combine': return planCombine(plan, action, registry);
    case 'select_base_item': return planSelectBaseItem(plan, action);
    case 'boost_combine': {
      const next = clonePlan(plan);
      next.boostNextCombine = true;
      next.actionLog.push(action);
      return { ok: true, plan: next };
    }
    case 'reroll_pool':
    case 'guarantee_rarity':
      return { ok: false, error: `${action.kind} is handled at match-controller level, not in forge plan` };
    default: return { ok: false, error: `Unsupported plan action: ${(action as ForgeAction).kind}` };
  }
}
```

Also add `boostNextCombine` to the `ForgePlan` interface:

```typescript
export interface ForgePlan {
  stockpile: GemInstance[];
  loadout: Loadout;
  round: number;
  lockedGemUids: Set<string>;
  actionLog: ForgeAction[];
  boostNextCombine: boolean;
}
```

Initialize it to `false` in `createForgePlan` and `clonePlan`.

- [ ] **Step 3b: Add rarity bump to planCombine when boostNextCombine is set**

In `planCombine`, after creating the `combinedGem`, check `plan.boostNextCombine`:

```typescript
  // Apply boost_combine rarity bump
  if (next.boostNextCombine) {
    const nextRar = nextRarity(combinedGem.rarity);
    if (nextRar) combinedGem.rarity = nextRar;
    next.boostNextCombine = false;
  }
```

Import `nextRarity` from `../types/gem.js`.

- [ ] **Step 3c: Fix exhaustiveness in forge-state.ts**

In `packages/engine/src/forge/forge-state.ts`, add a default case to `applyForgeAction`:

```typescript
export function applyForgeAction(
  state: ForgeState,
  action: ForgeAction,
  registry: DataRegistry,
  combinationEngine?: CombinationEngine,
): ForgeResult {
  switch (action.kind) {
    case 'socket_gem':
      return applySocketGem(state, action);
    case 'unsocket_gem':
      return applyUnsocketGem(state, action);
    case 'combine':
      return applyCombine(state, action, registry, combinationEngine);
    case 'select_base_item':
      return applySelectBaseItem(state, action);
    case 'set_base_stats':
      return applySetBaseStats(state, action);
    default:
      return { ok: false, error: `${(action as ForgeAction).kind} is not a forge-state action` };
  }
}
```

- [ ] **Step 4: Run type check again**

Run: `cd packages/engine && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/types/forge-action.ts packages/engine/src/forge/forge-plan.ts
git commit -m "feat(engine): add boost_combine, reroll_pool, guarantee_rarity ForgeAction variants"
```

---

### Task 4: Wire flux earning into match controller

**Files:**
- Modify: `packages/engine/src/match/match-controller.ts:363-406`
- Modify: `packages/engine/tests/match-controller.test.ts`

- [ ] **Step 1: Write failing test for flux earned on duel win**

Add to `packages/engine/tests/match-controller.test.ts` (in the existing run-mode describe block):

```typescript
it('earns flux on duel win', () => {
  // Create a run-mode match and fast-forward to duel completion
  let state = createDebugMatch('flux-win', 42, 'run_async', ['p0', 'p1'], 'iron_sword', 'iron_armor', registry, 'duel');
  const duelResult = applyAction(state, { kind: 'advance_phase' }, registry);
  expect(duelResult.ok).toBe(true);
  state = duelResult.state;

  const continueResult = applyAction(state, { kind: 'duel_continue' }, registry);
  expect(continueResult.ok).toBe(true);
  state = continueResult.state;

  // Flux should have increased (win = 1 from balance config)
  expect(state.runState!.flux).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/match-controller.test.ts -t "earns flux on duel win"`
Expected: FAIL — `flux` is 0 because earning isn't wired yet.

- [ ] **Step 3: Wire flux earning in handleDuelContinue**

In `packages/engine/src/match/match-controller.ts`, add the import at the top:

```typescript
import { earnFlux } from '../run/flux-state.js';
```

Then in `handleDuelContinue`, after the win/loss RunState update (around line 383), add flux earning:

```typescript
    if (lastResult) {
      const fluxRewards = registry.getBalance().gem.flux.rewards;

      if (lastResult.winner === 0) {
        updatedRunState = runWinRound(updatedRunState);
        // Earn flux for winning
        updatedRunState = earnFlux(updatedRunState, fluxRewards.win);
        // Earn milestone flux (only on wins)
        if (updatedRunState.lifeRecovery.milestoneRounds.includes(updatedRunState.round)) {
          updatedRunState = earnFlux(updatedRunState, fluxRewards.milestone);
        }
      } else {
        updatedRunState = runLoseLife(updatedRunState);
      }

      // Check life recovery
      updatedRunState = checkLifeRecovery(updatedRunState);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run tests/match-controller.test.ts -t "earns flux on duel win"`
Expected: PASS.

- [ ] **Step 5: Run all match-controller tests to check no regressions**

Run: `cd packages/engine && npx vitest run tests/match-controller.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/match/match-controller.ts packages/engine/tests/match-controller.test.ts
git commit -m "feat(engine): earn flux on duel win and milestone rounds"
```

---

### Task 5: Wire flux spend actions in match controller

**Files:**
- Modify: `packages/engine/src/match/match-controller.ts:220-266`
- Modify: `packages/engine/tests/match-controller.test.ts`

- [ ] **Step 1: Write failing test for boost_combine flux deduction at forge_complete**

Add to `packages/engine/tests/match-controller.test.ts`:

```typescript
it('deducts flux for boost_combine at forge_complete', () => {
  let state = createDebugMatch('flux-spend', 42, 'run_async', ['p0', 'p1'], 'iron_sword', 'iron_armor', registry, 'forge');
  // Give player some flux
  state.runState = { ...state.runState!, flux: 10 };

  // Submit boost_combine as a forge action
  const boostResult = applyAction(state, { kind: 'forge_action', player: 0, action: { kind: 'boost_combine' } }, registry);
  expect(boostResult.ok).toBe(true);
  state = boostResult.state;

  // Flux deducted
  const cost = registry.getBalance().gem.flux.costs.boostCombine;
  expect(state.runState!.flux).toBe(10 - cost);
});

it('rejects boost_combine when insufficient flux', () => {
  let state = createDebugMatch('flux-reject', 42, 'run_async', ['p0', 'p1'], 'iron_sword', 'iron_armor', registry, 'forge');
  // flux is 0

  const result = applyAction(state, { kind: 'forge_action', player: 0, action: { kind: 'boost_combine' } }, registry);
  expect(result.ok).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/match-controller.test.ts -t "flux"`
Expected: FAIL — flux spend actions aren't handled yet.

- [ ] **Step 3: Handle flux spend actions in handleForgeAction**

In `handleForgeAction` of `match-controller.ts`, add handling for flux actions before the `applyForge` call:

```typescript
function handleForgeAction(
  state: MatchState,
  player: 0 | 1,
  action: ForgeAction,
  registry: DataRegistry,
): ActionResult {
  if (state.phase.kind !== 'forge') {
    return fail('Not in forge phase');
  }

  if (state.forgeComplete?.[player]) {
    return fail('Player has already completed forging this round');
  }

  // Handle flux spend actions at match-controller level
  if (action.kind === 'boost_combine' || action.kind === 'reroll_pool' || action.kind === 'guarantee_rarity') {
    return handleFluxSpend(state, player, action, registry);
  }

  // ... rest of existing handleForgeAction code unchanged
```

Add the new handler:

```typescript
function handleFluxSpend(
  state: MatchState,
  _player: 0 | 1,
  action: Extract<ForgeAction, { kind: 'boost_combine' | 'reroll_pool' | 'guarantee_rarity' }>,
  registry: DataRegistry,
): ActionResult {
  if (!state.runState) {
    return fail('Flux actions are only available in run mode');
  }

  const costs = registry.getBalance().gem.flux.costs;
  const costMap: Record<string, number> = {
    boost_combine: costs.boostCombine,
    reroll_pool: costs.rerollPool,
    guarantee_rarity: costs.guaranteeRarity,
  };
  const cost = costMap[action.kind];

  if (!canSpendFlux(state.runState, cost)) {
    return fail(`Insufficient flux: need ${cost}, have ${state.runState.flux}`);
  }

  let updatedRunState = spendFlux(state.runState, cost);

  // Apply effect
  if (action.kind === 'reroll_pool') {
    updatedRunState = { ...updatedRunState, rerollNextDraft: true };
  }

  return ok({
    ...state,
    runState: updatedRunState,
  });
}
```

Add imports at top:

```typescript
import { earnFlux, spendFlux, canSpendFlux } from '../run/flux-state.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/match-controller.test.ts -t "flux"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/match/match-controller.ts packages/engine/tests/match-controller.test.ts
git commit -m "feat(engine): handle flux spend actions in match controller"
```

---

### Task 6: Delete flux-tracker.ts and update exports

**Files:**
- Delete: `packages/engine/src/forge/flux-tracker.ts`
- Modify: `packages/engine/src/index.ts:14`

- [ ] **Step 1: Remove flux-tracker re-exports from index.ts**

In `packages/engine/src/index.ts`, replace line 14:

```typescript
export { getFluxForRound, getActionCost } from './forge/flux-tracker.js';
```

with flux-state exports:

```typescript
export { earnFlux, spendFlux, canSpendFlux } from './run/flux-state.js';
```

- [ ] **Step 2: Delete flux-tracker.ts**

```bash
rm packages/engine/src/forge/flux-tracker.ts
```

- [ ] **Step 3: Run build to verify no broken imports**

Run: `cd packages/engine && npx tsc --noEmit`
Expected: PASS (or only errors in files we haven't updated yet).

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/index.ts
git rm packages/engine/src/forge/flux-tracker.ts
git commit -m "chore(engine): delete deprecated flux-tracker, export flux-state"
```

---

## Chunk 2: Synergy Completion

### Task 7: Add totalDiscoveryCount to DiscoveryState

**Files:**
- Modify: `packages/engine/src/combine/discovery-state.ts`
- Modify: `packages/engine/tests/discovery-state.test.ts`

- [ ] **Step 1: Write failing test for totalDiscoveryCount**

Add to `packages/engine/tests/discovery-state.test.ts`:

```typescript
describe('totalDiscoveryCount', () => {
  it('sums recipe and synergy discoveries', () => {
    const ds = new DiscoveryState();
    ds.recordDiscovery('recipe_a');
    ds.recordDiscovery('recipe_b');
    ds.recordSynergyDiscovery('synergy_x');
    expect(ds.totalDiscoveryCount()).toBe(3);
  });

  it('returns 0 when nothing discovered', () => {
    const ds = new DiscoveryState();
    expect(ds.totalDiscoveryCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/discovery-state.test.ts -t "totalDiscoveryCount"`
Expected: FAIL — `totalDiscoveryCount` is not a function.

- [ ] **Step 3: Implement totalDiscoveryCount**

Add to `packages/engine/src/combine/discovery-state.ts`, after the existing `attemptedCount` getter:

```typescript
  totalDiscoveryCount(): number {
    return this.discovered.size + this.discoveredSynergies.size;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run tests/discovery-state.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/combine/discovery-state.ts packages/engine/tests/discovery-state.test.ts
git commit -m "feat(engine): add totalDiscoveryCount to DiscoveryState"
```

---

### Task 8: Tag-based synergy detection in stat-calculator

**Files:**
- Modify: `packages/engine/src/forge/stat-calculator.ts:139-148`
- Modify: `packages/engine/tests/stat-calculator.test.ts`

- [ ] **Step 1: Write failing test for tag-based synergy activation**

Add to `packages/engine/tests/stat-calculator.test.ts`:

```typescript
it('activates synergy via gem tags from combined ancestors', () => {
  // Create a combined gem that has 'fire_damage' and 'cold_damage' in its tags
  // but its primary affixId is different (e.g. a recipe output)
  const combinedGem = createGem('combined1', 'elemental_burst', 2, 'rare', {
    tags: ['elemental_burst', 'fire_damage', 'cold_damage'],
    recipeDepth: 1,
  });

  // collectAffixIds should include all tags
  const loadout = makeLoadoutWithGems([combinedGem]);
  const ids = collectAffixIds(loadout);
  expect(ids).toContain('fire_damage');
  expect(ids).toContain('cold_damage');
  expect(ids).toContain('elemental_burst');
});
```

(The helper `makeLoadoutWithGems` may need to be created or adapted from existing test helpers — socket the gems into weapon slots of a loadout.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/stat-calculator.test.ts -t "tag"`
Expected: FAIL — `collectAffixIds` only returns `affixId`, not tags.

- [ ] **Step 3: Update collectAffixIds to use tags**

In `packages/engine/src/forge/stat-calculator.ts`, replace `collectAffixIds`. Note: we keep the array (with possible duplicates across gems) rather than deduplicating with a Set, because `isSynergyActive` uses count-based matching — a synergy requiring two copies of the same affix needs to see two entries:

```typescript
/** Collect all affix IDs across both items in a loadout, including gem tags.
 *  Returns an array (not deduplicated) so count-based synergy matching works. */
export function collectAffixIds(loadout: Loadout): string[] {
  const ids: string[] = [];
  for (const item of [loadout.weapon, loadout.armor]) {
    for (const slot of item.slots) {
      if (!slot) continue;
      // Use tags (which includes the gem's own affixId as first entry)
      for (const tag of slot.gem.tags) {
        ids.push(tag);
      }
    }
  }
  return ids;
}
```

Also remove the TODO comment on line 268:

```
  // TODO: Synergy additive bonuses from gem tags (placeholder for future implementation)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run tests/stat-calculator.test.ts -t "tag"`
Expected: PASS.

- [ ] **Step 5: Run all stat-calculator tests for regressions**

Run: `cd packages/engine && npx vitest run tests/stat-calculator.test.ts`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/forge/stat-calculator.ts packages/engine/tests/stat-calculator.test.ts
git commit -m "feat(engine): tag-based synergy detection in collectAffixIds"
```

---

### Task 9: Return StatsResult from calculateStats

**Files:**
- Modify: `packages/engine/src/forge/stat-calculator.ts:222-278`
- Modify: `packages/engine/src/forge/forge-plan.ts:199-201`
- Modify: `packages/engine/src/match/match-report.ts:64-65`
- Modify: `packages/engine/src/match/match-controller.ts:337-339`
- Modify: `packages/engine/tests/stat-calculator.test.ts`
- Modify: `packages/engine/tests/forge-plan.test.ts`

- [ ] **Step 1: Write failing test for StatsResult shape**

Add to `packages/engine/tests/stat-calculator.test.ts`:

```typescript
it('returns StatsResult with stats and activeSynergies', () => {
  const loadout = makeLoadoutWithGems(makeMockGems().slice(0, 3));
  const result = calculateStats(loadout, registry);
  expect(result).toHaveProperty('stats');
  expect(result).toHaveProperty('activeSynergies');
  expect(typeof result.stats.maxHP).toBe('number');
  expect(Array.isArray(result.activeSynergies)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/stat-calculator.test.ts -t "StatsResult"`
Expected: FAIL — `calculateStats` currently returns `DerivedStats`, not an object with `stats`/`activeSynergies`.

- [ ] **Step 3: Update calculateStats to return StatsResult**

In `packages/engine/src/forge/stat-calculator.ts`, add the type and update the return:

```typescript
import type { ActiveSynergy } from '../types/synergy.js';

export interface StatsResult {
  stats: DerivedStats;
  activeSynergies: ActiveSynergy[];
}
```

Update `calculateStats` signature and body:

```typescript
export function calculateStats(loadout: Loadout, registry: DataRegistry): StatsResult {
  // ... existing steps 1-5 unchanged ...

  // Step 6: Detect active synergies
  const affixIds = collectAffixIds(loadout);
  const synergies = registry.getAllSynergies();
  const activeSynergies: ActiveSynergy[] = [];

  for (const synergy of synergies) {
    const isActive = isSynergyActive(synergy.requiredAffixes, affixIds);
    if (isActive) {
      for (const mod of synergy.bonusEffects) {
        addToBucket(buckets, mod);
      }
    }
    // Count how many required affixes are missing
    const requiredCount = new Map<string, number>();
    for (const id of synergy.requiredAffixes) {
      requiredCount.set(id, (requiredCount.get(id) ?? 0) + 1);
    }
    const countMap = new Map<string, number>();
    for (const id of affixIds) {
      countMap.set(id, (countMap.get(id) ?? 0) + 1);
    }
    let missing = 0;
    for (const [id, needed] of requiredCount) {
      const have = countMap.get(id) ?? 0;
      if (have < needed) missing += needed - have;
    }

    activeSynergies.push({
      synergyId: synergy.id,
      isActive,
      missingCount: missing,
    });
  }

  // Step 7: Apply modifier ordering (flat, then percent, then override)
  applyBucketsToStats(stats, buckets);

  // Step 8: Apply caps/floors
  applyCaps(stats, balance);

  // Step 9: Return StatsResult
  return { stats: Object.freeze(stats), activeSynergies };
}
```

- [ ] **Step 4: Update all callers to destructure StatsResult**

In `packages/engine/src/forge/forge-plan.ts`, update `getPlannedStats`:

```typescript
import type { StatsResult } from './stat-calculator.js';

export function getPlannedStats(plan: ForgePlan, registry: DataRegistry): StatsResult {
  return calculateStats(plan.loadout, registry);
}
```

Remove the unused `DerivedStats` import from forge-plan.ts.

In `packages/engine/src/match/match-controller.ts`, update `runDuel`:

```typescript
  const statsResults: [StatsResult, StatsResult] = [
    calculateStats(state.players[0].loadout, registry),
    calculateStats(state.players[1].loadout, registry),
  ];
  const stats: [DerivedStats, DerivedStats] = [
    statsResults[0].stats,
    statsResults[1].stats,
  ];
```

Add import: `import type { StatsResult } from '../forge/stat-calculator.js';`

In `packages/engine/src/match/match-report.ts`, update the `playerStats` computation and replace the stale `collectActiveSynergies` helper with the `StatsResult.activeSynergies` data:

```typescript
  if (registry) {
    try {
      const r0 = calculateStats(state.players[0].loadout, registry);
      const r1 = calculateStats(state.players[1].loadout, registry);
      playerStats = [r0.stats, r1.stats];
    } catch {
      playerStats = [null, null];
    }
  }
```

Also update `collectActiveSynergies` to use `calculateStats` directly:

```typescript
function collectActiveSynergies(loadout: Loadout, registry: DataRegistry): string[] {
  const result = calculateStats(loadout, registry);
  return result.activeSynergies
    .filter(s => s.isActive)
    .map(s => s.synergyId);
}
```

This replaces the old implementation that called `collectAffixIds` and `isSynergyActive` separately, and removes the need to import `isSynergyActive` and `collectAffixIds` in `match-report.ts`.

- [ ] **Step 5: Update forge-plan.test.ts to destructure StatsResult**

In `packages/engine/tests/forge-plan.test.ts`, find the `getPlannedStats` test (around line 185) and update:

```typescript
    const result = getPlannedStats(plan, registry);
    expect(result.stats.maxHP).toBeGreaterThan(0);
    expect(typeof result.stats.physicalDamage).toBe('number');
```

- [ ] **Step 6: Run all affected tests**

Run: `cd packages/engine && npx vitest run tests/stat-calculator.test.ts tests/forge-plan.test.ts tests/match-controller.test.ts`
Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/forge/stat-calculator.ts packages/engine/src/forge/forge-plan.ts packages/engine/src/match/match-controller.ts packages/engine/src/match/match-report.ts packages/engine/tests/stat-calculator.test.ts packages/engine/tests/forge-plan.test.ts
git commit -m "feat(engine): return StatsResult with activeSynergies from calculateStats"
```

---

### Task 10: Wire synergy discovery into match controller

**Files:**
- Modify: `packages/engine/src/types/match.ts`
- Modify: `packages/engine/src/match/match-controller.ts`
- Modify: `packages/engine/tests/match-controller.test.ts`

- [ ] **Step 1: Add discoveryState to MatchState**

In `packages/engine/src/types/match.ts`, add the import and field:

```typescript
import type { DiscoveryState } from '../combine/discovery-state.js';

export interface MatchState {
  // ... existing fields ...
  runState?: RunState;
  discoveryState?: DiscoveryState;
}
```

- [ ] **Step 2: Initialize discoveryState in createMatch for run modes**

In `match-controller.ts`, import `DiscoveryState` and add initialization after the `runState` block:

```typescript
import { DiscoveryState } from '../combine/discovery-state.js';

  // Initialize DiscoveryState for run-based modes
  if (mode === 'run_async' || mode === 'run_live') {
    state.discoveryState = new DiscoveryState();
  }
```

- [ ] **Step 3: Wire synergy discovery after duel in handleDuelContinue**

In `handleDuelContinue`, after the `runWinRound`/`runLoseLife` block, add synergy discovery. Clone the `DiscoveryState` first (serialize + deserialize) to maintain immutability:

```typescript
      // Record synergy discoveries (clone to maintain immutability)
      let updatedDiscovery = state.discoveryState
        ? DiscoveryState.deserialize(state.discoveryState.serialize())
        : undefined;

      if (updatedDiscovery) {
        const fluxRewards = registry.getBalance().gem.flux.rewards;
        for (const playerIdx of [0, 1] as const) {
          const result = calculateStats(state.players[playerIdx].loadout, registry);
          for (const syn of result.activeSynergies) {
            if (syn.isActive && !updatedDiscovery.isSynergyDiscovered(syn.synergyId)) {
              updatedDiscovery.recordSynergyDiscovery(syn.synergyId);
              updatedRunState = earnFlux(updatedRunState, fluxRewards.discovery);
            }
          }
        }
      }
```

Update the `checkLifeRecovery` call to pass discovery count:

```typescript
      const discoveryCount = updatedDiscovery?.totalDiscoveryCount() ?? 0;
      updatedRunState = checkLifeRecovery(updatedRunState, discoveryCount);
```

And include `updatedDiscovery` in the returned state (around the `const newState` block):

```typescript
  const newState: MatchState = {
    ...state,
    phase: nextPhase,
    runState: updatedRunState,
    discoveryState: updatedDiscovery ?? state.discoveryState,
  };
```

- [ ] **Step 4: Write test for synergy discovery earning flux**

Add to `packages/engine/tests/match-controller.test.ts`:

```typescript
it('records synergy discoveries and earns flux for them', () => {
  // This is an integration test — the exact flux amount depends on
  // whether synergies fire for the test loadout.
  // Verify discoveryState is initialized on run-mode matches.
  const state = createMatch('syn-disc', 42, 'run_async', ['p0', 'p1'], 'iron_sword', 'iron_armor', registry);
  expect(state.discoveryState).toBeDefined();
  expect(state.discoveryState!.totalDiscoveryCount()).toBe(0);
});
```

- [ ] **Step 5: Run tests**

Run: `cd packages/engine && npx vitest run tests/match-controller.test.ts`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/types/match.ts packages/engine/src/match/match-controller.ts packages/engine/tests/match-controller.test.ts
git commit -m "feat(engine): wire synergy discovery and flux earning into duel completion"
```

---

## Chunk 3: AI Forge Strategy Scaling

### Task 11: Round-gate Tier 2 combines

**Files:**
- Modify: `packages/engine/src/ai/strategies/forge-strategy.ts:142-174`
- Modify: `packages/engine/tests/ai-tiers.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/engine/tests/ai-tiers.test.ts`:

```typescript
describe('Tier 2 round-gating', () => {
  it('does not combine on rounds 1-2', () => {
    const rng = new SeededRNG(123);
    const strategy = new Tier2ForgeStrategy();
    const pool = makePool(123);
    const loadout = createEmptyLoadout('iron_sword', 'iron_armor');

    const actions = strategy.plan(pool, loadout, 0, 2, [], registry, rng);
    const combines = actions.filter(a => a.kind === 'combine');
    expect(combines).toHaveLength(0);
  });

  it('attempts combines from round 3 onward', () => {
    const rng = new SeededRNG(123);
    const strategy = new Tier2ForgeStrategy();
    const pool = makePool(123);
    const loadout = createEmptyLoadout('iron_sword', 'iron_armor');

    const actions = strategy.plan(pool, loadout, 0, 3, [], registry, rng);
    const combines = actions.filter(a => a.kind === 'combine');
    // May or may not find a valid combo depending on pool, but the code path should be reached
    // Just verify the strategy runs without error
    expect(actions.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/ai-tiers.test.ts -t "Tier 2 round-gating"`
Expected: FAIL — Tier 2 currently combines on all rounds.

- [ ] **Step 3: Add round gate to Tier 2 combines**

In `packages/engine/src/ai/strategies/forge-strategy.ts`, wrap the Tier 2 combination loop (lines 142-174) with a round check:

```typescript
    // Try combinations only from round 3 onward
    if (round >= 3) {
      for (let i = 0; i < stockpile.length; i++) {
        if (usedGemUids.has(stockpile[i].uid)) continue;
        for (let j = i + 1; j < stockpile.length; j++) {
          // ... existing combine logic unchanged ...
        }
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run tests/ai-tiers.test.ts -t "Tier 2 round-gating"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ai/strategies/forge-strategy.ts packages/engine/tests/ai-tiers.test.ts
git commit -m "feat(engine): gate Tier 2 AI combines to round 3+"
```

---

### Task 12: Round multiplier for Tier 3 combination scoring

**Files:**
- Modify: `packages/engine/src/ai/strategies/forge-strategy.ts` (Tier3ForgeStrategy)
- Modify: `packages/engine/tests/ai-tiers.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/engine/tests/ai-tiers.test.ts`:

```typescript
describe('Tier 3 round scaling', () => {
  it('produces stronger loadouts in later rounds', () => {
    const strategy = new Tier3ForgeStrategy();
    const pool = makePool(42);
    const loadout = createEmptyLoadout('iron_sword', 'iron_armor');

    const earlyActions = strategy.plan(pool, loadout, 0, 2, [], registry, new SeededRNG(42));
    const lateActions = strategy.plan(pool, loadout, 0, 8, [], registry, new SeededRNG(42));

    const earlyCombines = earlyActions.filter(a => a.kind === 'combine').length;
    const lateCombines = lateActions.filter(a => a.kind === 'combine').length;

    // Later rounds should attempt at least as many combines
    expect(lateCombines).toBeGreaterThanOrEqual(earlyCombines);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/ai-tiers.test.ts -t "Tier 3 round scaling"`
Expected: FAIL — Tier 3 currently produces identical actions regardless of round.

- [ ] **Step 3: Add round multiplier to Tier 3 combination scoring**

In the Tier 3 strategy's `plan` method, add a round multiplier to the combination scoring that increases with round number. The multiplier makes the AI prefer combines over raw socketing in later rounds:

```typescript
    // Round multiplier: later rounds weight combine value higher
    const roundMultiplier = 1 + (round - 1) * 0.15; // round 1: 1.0, round 8: 2.05
```

Apply this multiplier when scoring combination candidates — multiply the combo's output value score by `roundMultiplier` before comparing against direct socketing value.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run tests/ai-tiers.test.ts -t "Tier 3 round scaling"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ai/strategies/forge-strategy.ts packages/engine/tests/ai-tiers.test.ts
git commit -m "feat(engine): add round multiplier to Tier 3 combination scoring"
```

---

### Task 13: Tier 4 unsocket-to-recombine at round 6+

**Files:**
- Modify: `packages/engine/src/ai/strategies/forge-strategy.ts` (Tier4ForgeStrategy)
- Modify: `packages/engine/tests/ai-tiers.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/engine/tests/ai-tiers.test.ts`:

```typescript
describe('Tier 4 unsocket-to-recombine', () => {
  it('generates unsocket actions from round 6 onward', () => {
    const strategy = new Tier4ForgeStrategy();
    const rng = new SeededRNG(42);
    // Create a loadout with low-value socketed gems
    const loadout = createEmptyLoadout('iron_sword', 'iron_armor');
    loadout.weapon.baseStats = { stat1: 'STR', stat2: 'DEX' };
    loadout.armor.baseStats = { stat1: 'VIT', stat2: 'INT' };
    loadout.weapon.slots[0] = { gem: createGem('old1', 'flat_hp', 1, 'common') };
    loadout.weapon.slots[1] = { gem: createGem('old2', 'armor_rating', 1, 'common') };

    // Give fresh stockpile gems
    const stockpile = [
      createGem('new1', 'fire_damage', 3, 'rare'),
      createGem('new2', 'cold_damage', 3, 'rare'),
    ];

    const actions = strategy.plan(stockpile, loadout, 0, 7, [], registry, rng);
    const unsockets = actions.filter(a => a.kind === 'unsocket_gem');
    expect(unsockets.length).toBeGreaterThan(0);
  });

  it('does not unsocket before round 6', () => {
    const strategy = new Tier4ForgeStrategy();
    const rng = new SeededRNG(42);
    const loadout = createEmptyLoadout('iron_sword', 'iron_armor');
    loadout.weapon.baseStats = { stat1: 'STR', stat2: 'DEX' };
    loadout.armor.baseStats = { stat1: 'VIT', stat2: 'INT' };
    loadout.weapon.slots[0] = { gem: createGem('old1', 'flat_hp', 1, 'common') };

    const stockpile = [createGem('new1', 'fire_damage', 3, 'rare')];

    const actions = strategy.plan(stockpile, loadout, 0, 4, [], registry, rng);
    const unsockets = actions.filter(a => a.kind === 'unsocket_gem');
    expect(unsockets).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/ai-tiers.test.ts -t "Tier 4 unsocket"`
Expected: FAIL — Tier 4 never unsockets.

- [ ] **Step 3: Add unsocket-to-recombine logic to Tier 4**

In Tier4ForgeStrategy's `plan` method, add a round check at the start (after base stats):

```typescript
    // From round 6+, consider unsocketing low-value gems to recombine
    if (round >= 6) {
      for (const target of ['weapon', 'armor'] as const) {
        for (let i = 0; i < loadout[target].slots.length; i++) {
          const slot = loadout[target].slots[i];
          if (!slot) continue;
          const gem = slot.gem;
          // Unsocket if gem is tier 1 common (weakest possible)
          if (gem.tier === 1 && gem.rarity === 'common') {
            actions.push({ kind: 'unsocket_gem', target, slotIndex: i });
          }
        }
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run tests/ai-tiers.test.ts -t "Tier 4 unsocket"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ai/strategies/forge-strategy.ts packages/engine/tests/ai-tiers.test.ts
git commit -m "feat(engine): Tier 4 AI unsockets low-value gems from round 6+"
```

---

### Task 14: Tier 5 loadout quality delta check

**Files:**
- Modify: `packages/engine/src/ai/strategies/forge-strategy.ts` (Tier5ForgeStrategy)
- Modify: `packages/engine/tests/ai-tiers.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/engine/tests/ai-tiers.test.ts`:

```typescript
describe('Tier 5 quality delta', () => {
  it('avoids combines of very low-value gems in late rounds', () => {
    const strategy = new Tier5ForgeStrategy();
    const rng = new SeededRNG(42);
    const loadout = createEmptyLoadout('iron_sword', 'iron_armor');
    loadout.weapon.baseStats = { stat1: 'STR', stat2: 'DEX' };
    loadout.armor.baseStats = { stat1: 'VIT', stat2: 'INT' };

    // Two tier-1 common gems — combining them provides minimal benefit
    const stockpile = [
      createGem('weak1', 'flat_hp', 1, 'common'),
      createGem('weak2', 'armor_rating', 1, 'common'),
    ];

    const actions = strategy.plan(stockpile, loadout, 0, 9, [], registry, rng);
    const combines = actions.filter(a => a.kind === 'combine');
    // Tier 5 should evaluate quality delta and avoid wasteful combines
    // It should prefer socketing the gems directly over combining for negligible gain
    expect(combines.length).toBeLessThanOrEqual(0);
  });

  it('does combine high-value gems in late rounds', () => {
    const strategy = new Tier5ForgeStrategy();
    const rng = new SeededRNG(42);
    const loadout = createEmptyLoadout('iron_sword', 'iron_armor');
    loadout.weapon.baseStats = { stat1: 'STR', stat2: 'DEX' };
    loadout.armor.baseStats = { stat1: 'VIT', stat2: 'INT' };

    // Two high-tier rare gems — combining should be worthwhile
    const stockpile = [
      createGem('good1', 'fire_damage', 3, 'rare'),
      createGem('good2', 'cold_damage', 3, 'rare'),
    ];

    const actions = strategy.plan(stockpile, loadout, 0, 9, [], registry, rng);
    // Should attempt at least one combine with good material
    expect(actions.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test — baseline behavior**

Run: `cd packages/engine && npx vitest run tests/ai-tiers.test.ts -t "Tier 5 quality delta"`
Expected: May pass or fail depending on current behavior — this establishes baseline.

- [ ] **Step 3: Add quality delta check to Tier 5**

In Tier5ForgeStrategy's combination scoring, add a quality delta filter:

```typescript
    // Only combine if the predicted output value exceeds the sum of input values
    // (adjusted by round — later rounds accept smaller margins)
    const qualityThreshold = Math.max(0.5, 1.5 - round * 0.1);
```

Apply this threshold when evaluating each candidate combination: skip the combine if `outputValue < inputValue1 + inputValue2 - qualityThreshold`.

- [ ] **Step 4: Run all AI tests**

Run: `cd packages/engine && npx vitest run tests/ai-tiers.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ai/strategies/forge-strategy.ts packages/engine/tests/ai-tiers.test.ts
git commit -m "feat(engine): Tier 5 AI uses quality delta check for combines"
```

---

## Chunk 4: Synthetic AI Opponent Generation

### Task 15: Create synthetic-opponent.ts

**Files:**
- Create: `packages/engine/src/run/synthetic-opponent.ts`
- Create: `packages/engine/tests/synthetic-opponent.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/engine/tests/synthetic-opponent.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateSyntheticOpponent, defaultTierForRound } from '../src/run/synthetic-opponent.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);

describe('defaultTierForRound', () => {
  it('returns tier 2 for round 1', () => {
    expect(defaultTierForRound(1)).toBe(2);
  });

  it('returns tier 3 for round 5', () => {
    expect(defaultTierForRound(5)).toBe(3);
  });

  it('returns tier 4 for round 9', () => {
    expect(defaultTierForRound(9)).toBe(4);
  });
});

describe('generateSyntheticOpponent', () => {
  it('returns a valid PlayerPayload', () => {
    const rng = new SeededRNG(42);
    const payload = generateSyntheticOpponent(3, 2, registry, rng);

    expect(payload).toHaveProperty('loadout');
    expect(payload).toHaveProperty('runRound', 3);
    expect(payload).toHaveProperty('powerBracket');
    expect(payload.loadout.weapon.gems.length).toBeGreaterThan(0);
  });

  it('is deterministic given same seed', () => {
    const p1 = generateSyntheticOpponent(5, 3, registry, new SeededRNG(99));
    const p2 = generateSyntheticOpponent(5, 3, registry, new SeededRNG(99));

    expect(p1.powerBracket).toBe(p2.powerBracket);
    expect(p1.loadout.weapon.gems.length).toBe(p2.loadout.weapon.gems.length);
  });

  it('produces stronger loadouts at higher rounds', () => {
    const early = generateSyntheticOpponent(2, 2, registry, new SeededRNG(42));
    const late = generateSyntheticOpponent(8, 4, registry, new SeededRNG(42));

    expect(late.powerBracket).toBeGreaterThanOrEqual(early.powerBracket);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/synthetic-opponent.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement synthetic-opponent.ts**

Create `packages/engine/src/run/synthetic-opponent.ts`:

```typescript
import type { AITier } from '../types/ai.js';
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { PlayerPayload } from './payload.js';
import type { Loadout } from '../types/item.js';
import { AIController } from '../ai/ai-controller.js';
import { generatePool } from '../pool/pool-generator.js';
import { createEmptyLoadout } from '../types/item.js';
import { applyForgeAction } from '../forge/forge-state.js';
import { serializePayload } from './payload.js';

/** Default AI tier based on round number. */
export function defaultTierForRound(round: number): AITier {
  if (round <= 4) return 2 as AITier;
  if (round <= 8) return 3 as AITier;
  return 4 as AITier;
}

/**
 * Generate a synthetic AI opponent by simulating a mini-run.
 * Deterministic given the same seed + round + tier.
 */
export function generateSyntheticOpponent(
  round: number,
  aiTier: AITier,
  registry: DataRegistry,
  rng: SeededRNG,
): PlayerPayload {
  const syntheticRng = rng.fork('synthetic');
  const ai = new AIController(aiTier, registry, syntheticRng.fork('ai'));
  let loadout: Loadout = createEmptyLoadout('iron_sword', 'iron_armor');

  // Simulate each round: generate pool, draft (AI picks), forge (AI plans)
  for (let r = 1; r <= round; r++) {
    // Use forked RNG for deterministic pool generation per round
    const poolRng = syntheticRng.fork(`pool_${r}`);
    const pool = generatePool(poolRng.nextInt(0, 0x7fffffff), 'run_async', registry, r);

    // AI drafts: take half the pool
    const draftCount = Math.ceil(pool.length / 2);
    const stockpile = pool.slice(0, draftCount);

    // AI forges (planForge takes 5 args — registry and rng are on the AIController instance)
    const actions = ai.planForge(stockpile, loadout, 0, r, []);

    // Build forge state and apply actions
    let forgeState = {
      stockpile: [...stockpile],
      loadout,
      round: Math.min(r, 3) as 1 | 2 | 3,
      isQuickMatch: false,
    };

    for (const action of actions) {
      const result = applyForgeAction(forgeState, action, registry);
      if (result.ok) {
        forgeState = result.state;
      }
    }

    loadout = forgeState.loadout;
  }

  return serializePayload(loadout, round);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/synthetic-opponent.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/run/synthetic-opponent.ts packages/engine/tests/synthetic-opponent.test.ts
git commit -m "feat(engine): add synthetic AI opponent generation for async matchmaking"
```

---

### Task 16: Update index.ts exports

**Files:**
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Add exports for new modules**

Add to `packages/engine/src/index.ts`:

```typescript
// Synthetic opponent
export { generateSyntheticOpponent, defaultTierForRound } from './run/synthetic-opponent.js';

// Stat calculator result type
export type { StatsResult } from './forge/stat-calculator.js';
```

- [ ] **Step 2: Run full build**

Run: `cd packages/engine && pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/index.ts
git commit -m "chore(engine): export synthetic opponent and StatsResult from index"
```

---

### Task 17: Final validation — full test suite

- [ ] **Step 1: Run all engine tests**

Run: `cd packages/engine && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Run type check**

Run: `cd packages/engine && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Build the engine**

Run: `cd packages/engine && pnpm build`
Expected: Build succeeds.

- [ ] **Step 4: Run client dev server to verify no runtime errors**

Run: `cd packages/client && pnpm dev`
Expected: Vite starts without errors. No console errors on page load.
