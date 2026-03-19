# Forge Round-Locking & Tentative Flux Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make orbs socketed in the current forge round freely rearrangeable (with flux refunds), while locking orbs from previous rounds.

**Architecture:** Add `socketedRound` field to `EquippedSlot` types, replace hard-coded `round === 1` guards with `socketedRound < currentRound` checks, make `remove_orb` refund flux instead of charging, add missing `planSwapOrb` handler, and update UI locking logic.

**Tech Stack:** TypeScript, Vitest, Zustand, React

**Spec:** `docs/superpowers/specs/2026-03-18-forge-round-locking-design.md`

---

## Chunk 1: Engine type + flux-tracker changes

### Task 1: Add `socketedRound` to EquippedSlot type

**Files:**
- Modify: `packages/engine/src/types/item.ts:5-8`

- [ ] **Step 1: Update EquippedSlot type**

```typescript
export type EquippedSlot =
  | { kind: 'single'; orb: OrbInstance; socketedRound: 1 | 2 | 3 }
  | { kind: 'compound'; orbs: [OrbInstance, OrbInstance]; compoundId: string; socketedRound: 1 | 2 | 3 }
  | { kind: 'upgraded'; orb: OrbInstance; originalTier: AffixTier; upgradedTier: AffixTier; socketedRound: 1 | 2 | 3 };
```

- [ ] **Step 2: Run type check to see all breakage**

Run: `cd packages/engine && npx tsc --noEmit 2>&1 | head -60`
Expected: Multiple type errors in forge-state.ts, forge-plan.ts, and tests where slots are created without `socketedRound`. This is expected — we'll fix them in subsequent tasks. Do NOT commit yet — Task 1 is completed together with Task 2 and Task 3 so the first commit leaves the codebase compilable.

### Task 2: Update flux-tracker costs

**Files:**
- Modify: `packages/engine/src/forge/flux-tracker.ts:26-39`
- Modify: `packages/engine/tests/forge.test.ts` (flux-related assertions)

- [ ] **Step 1: Write failing test for new cost behavior**

Add to `packages/engine/tests/forge.test.ts` after the existing flux tracker tests (~line 383):

```typescript
it('remove_orb cost is 0 (refund handled by handler)', () => {
  const action: ForgeAction = { kind: 'remove_orb', target: 'weapon', slotIndex: 0 };
  expect(getActionCost(action, balance)).toBe(0);
});

it('swap_orb cost equals assignOrb cost', () => {
  const action: ForgeAction = { kind: 'swap_orb', target: 'weapon', slotIndex: 0, newOrbUid: 'x' };
  expect(getActionCost(action, balance)).toBe(balance.fluxCosts.assignOrb);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/forge.test.ts -t "remove_orb cost"`
Expected: FAIL — currently returns `balance.fluxCosts.removeOrb` (1), not 0.

- [ ] **Step 3: Update getActionCost**

In `packages/engine/src/forge/flux-tracker.ts`, change the switch:

```typescript
case 'swap_orb':
  return balance.fluxCosts.assignOrb;
case 'remove_orb':
  return 0;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/forge.test.ts -t "cost"`
Expected: New tests PASS. Note: the existing test `remove_orb: removes orb from slot, returns to stockpile, costs 1 flux` will need updating in Task 4 (it asserts old flux behavior).

- [ ] **Step 5: Commit Task 1 + Task 2 together** (first compilable checkpoint)

```bash
git add packages/engine/src/types/item.ts packages/engine/src/forge/flux-tracker.ts packages/engine/tests/forge.test.ts
git commit -m "feat: add socketedRound to EquippedSlot, update flux costs"
```

## Chunk 2: forge-state.ts round-locking + refunds

### Task 3: Update applyAssignOrb to stamp socketedRound

**Files:**
- Modify: `packages/engine/src/forge/forge-state.ts:105-166`

- [ ] **Step 1: Write failing test for socketedRound on assigned slot**

Add to `packages/engine/tests/forge.test.ts` after the existing assign tests:

```typescript
it('assign_orb: stamps socketedRound on single slot', () => {
  const state = makeState({ round: 2, fluxRemaining: 4 });
  const action: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
  const result = applyForgeAction(state, action, registry);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const slot = result.state.loadout.weapon.slots[0]!;
  expect(slot.socketedRound).toBe(2);
});

it('assign_orb: stamps socketedRound on compound slot', () => {
  let state = makeState({ round: 1 });
  // Combine fire_damage + chance_on_hit = ignite
  const combineResult = applyForgeAction(state, {
    kind: 'combine', orbUid1: 'orb1', orbUid2: 'orb2',
  }, registry);
  expect(combineResult.ok).toBe(true);
  if (!combineResult.ok) return;

  const assignResult = applyForgeAction(combineResult.state, {
    kind: 'assign_orb', orbUid: 'compound_orb1_orb2', target: 'weapon', slotIndex: 0,
  }, registry);
  expect(assignResult.ok).toBe(true);
  if (!assignResult.ok) return;
  expect(assignResult.state.loadout.weapon.slots[0]!.socketedRound).toBe(1);
  expect(assignResult.state.loadout.weapon.slots[1]!.socketedRound).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/forge.test.ts -t "socketedRound"`
Expected: FAIL — `socketedRound` is undefined.

- [ ] **Step 3: Add socketedRound to applyAssignOrb**

In `packages/engine/src/forge/forge-state.ts`, update `applyAssignOrb`:

For the compound branch (~line 134), add `socketedRound: state.round`:
```typescript
const compoundSlot: EquippedSlot = {
  kind: 'compound',
  orbs: orb.sourceOrbs,
  compoundId: orb.compoundId,
  socketedRound: state.round,
};
```

For the single branch (~line 156), add `socketedRound: state.round`:
```typescript
const newSlot: EquippedSlot = { kind: 'single', orb, socketedRound: state.round };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/forge.test.ts -t "socketedRound"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/forge-state.ts packages/engine/tests/forge.test.ts
git commit -m "feat: assign_orb stamps socketedRound on slots"
```

### Task 4: Update applyUpgradeTier to stamp socketedRound

**Files:**
- Modify: `packages/engine/src/forge/forge-state.ts:212-272`

- [ ] **Step 1: Write failing test**

Add to tests:

```typescript
it('upgrade_tier: stamps socketedRound on upgraded slot', () => {
  const state = makeState({ round: 1 });
  const action: ForgeAction = {
    kind: 'upgrade_tier', orbUid1: 'orb1', orbUid2: 'orb4',
    target: 'weapon', slotIndex: 0,
  };
  const result = applyForgeAction(state, action, registry);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.state.loadout.weapon.slots[0]!.socketedRound).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/forge.test.ts -t "upgrade_tier: stamps"`
Expected: FAIL

- [ ] **Step 3: Add socketedRound to applyUpgradeTier**

In `forge-state.ts` `applyUpgradeTier` (~line 254):

```typescript
const upgradedSlot: EquippedSlot = {
  kind: 'upgraded',
  orb: upgradedOrb,
  originalTier: orb1.tier,
  upgradedTier,
  socketedRound: state.round,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run tests/forge.test.ts -t "upgrade_tier: stamps"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/forge-state.ts packages/engine/tests/forge.test.ts
git commit -m "feat: upgrade_tier stamps socketedRound"
```

### Task 5: Update applyRemoveOrb — round locking + refund + compound support

**Files:**
- Modify: `packages/engine/src/forge/forge-state.ts:77-103` (applyForgeAction signature) and `323-360` (applyRemoveOrb)
- Modify: `packages/engine/tests/forge.test.ts`

- [ ] **Step 1: Write failing tests for new remove behavior**

Replace existing `remove_orb: fails in round 1` test and add new tests:

```typescript
it('remove_orb: succeeds in round 1 for current-round slot, refunds assignOrb cost', () => {
  let state = makeState({ round: 1 });
  const startFlux = state.fluxRemaining;
  const assign: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
  const r1 = applyForgeAction(state, assign, registry);
  expect(r1.ok).toBe(true);
  if (!r1.ok) return;

  const remove: ForgeAction = { kind: 'remove_orb', target: 'weapon', slotIndex: 0 };
  const result = applyForgeAction(r1.state, remove, registry);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.state.loadout.weapon.slots[0]).toBeNull();
  expect(result.state.fluxRemaining).toBe(startFlux); // full refund
  expect(result.state.stockpile.find(o => o.uid === 'orb1')).toBeDefined();
});

it('remove_orb: fails on previous-round slot (locked)', () => {
  // Simulate: assign in round 1, then attempt remove in round 2
  let state = makeState({ round: 1 });
  const assign: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
  const r1 = applyForgeAction(state, assign, registry);
  expect(r1.ok).toBe(true);
  if (!r1.ok) return;

  // Advance to round 2 by mutating round (simulates round transition)
  const round2State: ForgeState = { ...r1.state, round: 2, fluxRemaining: 4 };
  const remove: ForgeAction = { kind: 'remove_orb', target: 'weapon', slotIndex: 0 };
  const result = applyForgeAction(round2State, remove, registry);

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain('locked');
});

it('remove_orb: succeeds on current-round compound slot, returns compound orb', () => {
  let state = makeState({ round: 1 });
  // Combine
  const combineResult = applyForgeAction(state, {
    kind: 'combine', orbUid1: 'orb1', orbUid2: 'orb2',
  }, registry);
  expect(combineResult.ok).toBe(true);
  if (!combineResult.ok) return;

  // Assign compound
  const assignResult = applyForgeAction(combineResult.state, {
    kind: 'assign_orb', orbUid: 'compound_orb1_orb2', target: 'weapon', slotIndex: 0,
  }, registry);
  expect(assignResult.ok).toBe(true);
  if (!assignResult.ok) return;

  // Remove compound slot
  const remove: ForgeAction = { kind: 'remove_orb', target: 'weapon', slotIndex: 0 };
  const result = applyForgeAction(assignResult.state, remove, registry);
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  // Both slots cleared
  expect(result.state.loadout.weapon.slots[0]).toBeNull();
  expect(result.state.loadout.weapon.slots[1]).toBeNull();
  // Compound orb returned as single entry
  const compoundOrb = result.state.stockpile.find(o => o.compoundId === 'ignite');
  expect(compoundOrb).toBeDefined();
  expect(compoundOrb!.sourceOrbs).toHaveLength(2);
});

it('remove_orb: flux never exceeds maxFlux after refund', () => {
  const state = makeState({ round: 1 });
  const startFlux = state.fluxRemaining; // maxFlux for round 1
  const assign: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
  const r1 = applyForgeAction(state, assign, registry);
  expect(r1.ok).toBe(true);
  if (!r1.ok) return;

  const remove: ForgeAction = { kind: 'remove_orb', target: 'weapon', slotIndex: 0 };
  const result = applyForgeAction(r1.state, remove, registry);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.state.fluxRemaining).toBeLessThanOrEqual(startFlux);
});
```

Also update the existing test `remove_orb: removes orb from slot, returns to stockpile, costs 1 flux` — it runs in round 2 so the assigned slot has `socketedRound: 2` and remove should refund:

```typescript
it('remove_orb: removes current-round orb, refunds flux', () => {
  let state = makeState({ round: 2, fluxRemaining: 4 });
  const assign: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
  const r1 = applyForgeAction(state, assign, registry);
  expect(r1.ok).toBe(true);
  if (!r1.ok) return;

  const remove: ForgeAction = { kind: 'remove_orb', target: 'weapon', slotIndex: 0 };
  const result = applyForgeAction(r1.state, remove, registry);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.state.loadout.weapon.slots[0]).toBeNull();
  expect(result.state.fluxRemaining).toBe(4); // 4 - 1 (assign) + 1 (refund) = 4
  expect(result.state.stockpile.find(o => o.uid === 'orb1')).toBeDefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/forge.test.ts -t "remove_orb"`
Expected: Multiple failures — round 1 test expects success but gets "Round 1" error, locked test doesn't exist yet, refund math wrong.

- [ ] **Step 3: Rewrite applyRemoveOrb**

In `forge-state.ts`, update `applyForgeAction` to pass `registry` to `applyRemoveOrb`:

```typescript
case 'remove_orb':
  return applyRemoveOrb(state, action, registry);
```

Then rewrite `applyRemoveOrb`:

```typescript
function applyRemoveOrb(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'remove_orb' }>,
  registry: DataRegistry,
): ForgeResult {
  if (!isValidSlotIndex(action.slotIndex)) {
    return fail('Slot index out of range (must be 0-5)');
  }

  const item = getItem(state.loadout, action.target);
  const currentSlot = item.slots[action.slotIndex];
  if (currentSlot === null) {
    return fail('Cannot remove: slot is empty');
  }

  // Round locking: reject if socketed in a previous round
  if (currentSlot.socketedRound < state.round) {
    return fail('Cannot remove: slot is locked from a previous round');
  }

  const balance = registry.getBalance();
  const refund = balance.fluxCosts.assignOrb;
  const maxFlux = getFluxForRound(state.round, balance, state.isQuickMatch);

  if (currentSlot.kind === 'compound') {
    // Clear both consecutive slots. Compound orbs always occupy slotIndex and slotIndex+1
    // when assigned, but the user might click either slot. Check both neighbors.
    let newItem = setSlot(item, action.slotIndex, null);
    const neighbor = action.slotIndex + 1 <= 5 && item.slots[action.slotIndex + 1]?.kind === 'compound'
      && (item.slots[action.slotIndex + 1] as any).compoundId === currentSlot.compoundId
      ? action.slotIndex + 1
      : action.slotIndex - 1 >= 0 && item.slots[action.slotIndex - 1]?.kind === 'compound'
        && (item.slots[action.slotIndex - 1] as any).compoundId === currentSlot.compoundId
        ? action.slotIndex - 1
        : -1;
    if (neighbor >= 0) {
      newItem = setSlot(newItem, neighbor, null);
    }

    // Reconstruct compound orb for stockpile
    const compoundOrb: OrbInstance = {
      uid: `compound_${currentSlot.orbs[0].uid}_${currentSlot.orbs[1].uid}`,
      affixId: currentSlot.orbs[0].affixId,
      tier: currentSlot.orbs[0].tier,
      compoundId: currentSlot.compoundId,
      sourceOrbs: currentSlot.orbs,
    };
    const newStockpile = [...state.stockpile, compoundOrb];

    return ok({
      ...state,
      stockpile: newStockpile,
      loadout: setItem(state.loadout, action.target, newItem),
      fluxRemaining: Math.min(state.fluxRemaining + refund, maxFlux),
    });
  }

  // Single or upgraded slot
  const removedOrb: OrbInstance = currentSlot.orb;
  const newItem = setSlot(item, action.slotIndex, null);
  const newStockpile = [...state.stockpile, removedOrb];

  return ok({
    ...state,
    stockpile: newStockpile,
    loadout: setItem(state.loadout, action.target, newItem),
    fluxRemaining: Math.min(state.fluxRemaining + refund, maxFlux),
  });
}
```

Note: `applyRemoveOrb` no longer receives `cost` since remove now refunds. Update the `applyForgeAction` caller — remove the `cost` argument for `remove_orb` case and don't do the top-level flux check for it. Simplest: since `getActionCost` returns 0 for `remove_orb`, the existing `fluxRemaining < cost` check (0 < anything positive) always passes. So just change the call:

```typescript
case 'remove_orb':
  return applyRemoveOrb(state, action, registry);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/forge.test.ts -t "remove_orb"`
Expected: All remove_orb tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/forge-state.ts packages/engine/tests/forge.test.ts
git commit -m "feat: remove_orb uses socketedRound locking + flux refund"
```

### Task 6: Update applySwapOrb — round locking + socketedRound stamp

**Files:**
- Modify: `packages/engine/src/forge/forge-state.ts:274-321`
- Modify: `packages/engine/tests/forge.test.ts`

- [ ] **Step 1: Write failing tests for new swap behavior**

Replace existing `swap_orb: fails in round 1` with new tests:

```typescript
it('swap_orb: succeeds in round 1 for current-round slot', () => {
  let state = makeState({ round: 1 });
  const assign: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
  const r1 = applyForgeAction(state, assign, registry);
  expect(r1.ok).toBe(true);
  if (!r1.ok) return;

  const swap: ForgeAction = { kind: 'swap_orb', target: 'weapon', slotIndex: 0, newOrbUid: 'orb2' };
  const result = applyForgeAction(r1.state, swap, registry);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const slot = result.state.loadout.weapon.slots[0]!;
  expect(slot.kind).toBe('single');
  if (slot.kind === 'single') expect(slot.orb.uid).toBe('orb2');
  expect(slot.socketedRound).toBe(1);
  expect(result.state.stockpile.find(o => o.uid === 'orb1')).toBeDefined();
});

it('swap_orb: fails on previous-round slot (locked)', () => {
  let state = makeState({ round: 1 });
  const assign: ForgeAction = { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 };
  const r1 = applyForgeAction(state, assign, registry);
  expect(r1.ok).toBe(true);
  if (!r1.ok) return;

  const round2State: ForgeState = { ...r1.state, round: 2, fluxRemaining: 4 };
  const swap: ForgeAction = { kind: 'swap_orb', target: 'weapon', slotIndex: 0, newOrbUid: 'orb2' };
  const result = applyForgeAction(round2State, swap, registry);

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain('locked');
});
```

Also update the existing `swap_orb: replaces occupied slot` test — it uses round 2 with current-round slots so flux should be `4 - 1 (assign) - 1 (swap = assignOrb cost) = 2`. If `assignOrb` cost is 1, the math stays the same.

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd packages/engine && npx vitest run tests/forge.test.ts -t "swap_orb"`
Expected: Round 1 test fails with "Round 1" error, locked test fails.

- [ ] **Step 3: Rewrite applySwapOrb**

```typescript
function applySwapOrb(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'swap_orb' }>,
  cost: number,
): ForgeResult {
  if (!isValidSlotIndex(action.slotIndex)) {
    return fail('Slot index out of range (must be 0-5)');
  }

  const newOrbIdx = findOrbIndex(state.stockpile, action.newOrbUid);
  if (newOrbIdx === -1) {
    return fail('New orb not found in stockpile');
  }

  const item = getItem(state.loadout, action.target);
  const currentSlot = item.slots[action.slotIndex];
  if (currentSlot === null) {
    return fail('Cannot swap: slot is empty');
  }

  // Round locking
  if (currentSlot.socketedRound < state.round) {
    return fail('Cannot swap: slot is locked from a previous round');
  }

  // Extract the orb being removed from the slot
  let removedOrb: OrbInstance;
  if (currentSlot.kind === 'single') {
    removedOrb = currentSlot.orb;
  } else if (currentSlot.kind === 'upgraded') {
    removedOrb = currentSlot.orb;
  } else {
    return fail('Cannot swap a compound slot individually');
  }

  const newOrb = state.stockpile[newOrbIdx];
  const newSlot: EquippedSlot = { kind: 'single', orb: newOrb, socketedRound: state.round };
  const newItem = setSlot(item, action.slotIndex, newSlot);

  let newStockpile = removeFromStockpile(state.stockpile, action.newOrbUid);
  newStockpile = [...newStockpile, removedOrb];

  return ok({
    ...state,
    stockpile: newStockpile,
    loadout: setItem(state.loadout, action.target, newItem),
    fluxRemaining: state.fluxRemaining - cost,
  });
}
```

- [ ] **Step 4: Run all forge tests**

Run: `cd packages/engine && npx vitest run tests/forge.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/forge-state.ts packages/engine/tests/forge.test.ts
git commit -m "feat: swap_orb uses socketedRound locking"
```

## Chunk 3: forge-plan.ts changes

### Task 7: Update deepCloneItem and planAssignOrb

**Files:**
- Modify: `packages/engine/src/forge/forge-plan.ts:26-37` (deepCloneItem) and `93-143` (planAssignOrb)

- [ ] **Step 1: Update deepCloneItem to preserve socketedRound**

```typescript
function deepCloneItem(item: ForgedItem): ForgedItem {
  return {
    baseItemId: item.baseItemId,
    baseStats: item.baseStats ? { ...item.baseStats } : null,
    slots: item.slots.map(s => {
      if (!s) return null;
      if (s.kind === 'single') return { kind: 'single' as const, orb: { ...s.orb }, socketedRound: s.socketedRound };
      if (s.kind === 'upgraded') return { kind: 'upgraded' as const, orb: { ...s.orb }, originalTier: s.originalTier, upgradedTier: s.upgradedTier, socketedRound: s.socketedRound };
      return { kind: 'compound' as const, orbs: [{ ...s.orbs[0] }, { ...s.orbs[1] }] as [OrbInstance, OrbInstance], compoundId: s.compoundId, socketedRound: s.socketedRound };
    }),
  };
}
```

- [ ] **Step 2: Update planAssignOrb to stamp socketedRound**

In the compound branch (~line 123-129):
```typescript
const compoundSlot: EquippedSlot = {
  kind: 'compound',
  orbs: removedOrb.sourceOrbs,
  compoundId: removedOrb.compoundId,
  socketedRound: plan.round,
};
```

In the single branch (~line 139):
```typescript
next.loadout[action.target].slots[action.slotIndex] = { kind: 'single', orb: removedOrb, socketedRound: plan.round };
```

- [ ] **Step 3: Run forge store tests to check no regression**

Run: `cd packages/client && npx vitest run src/stores/forgeStore.test.ts`
Expected: PASS (tests don't assert socketedRound yet but shouldn't break)

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/forge/forge-plan.ts
git commit -m "feat: deepCloneItem + planAssignOrb stamp socketedRound"
```

### Task 8: Update planUpgradeTier

**Files:**
- Modify: `packages/engine/src/forge/forge-plan.ts:241-301`

- [ ] **Step 1: Add socketedRound to upgraded slot in planUpgradeTier**

At ~line 285-290:
```typescript
const upgradedSlot: EquippedSlot = {
  kind: 'upgraded',
  orb: upgradedOrb,
  originalTier: orb1.tier,
  upgradedTier,
  socketedRound: plan.round,
};
```

- [ ] **Step 2: Run forge store tests**

Run: `cd packages/client && npx vitest run src/stores/forgeStore.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/forge/forge-plan.ts
git commit -m "feat: planUpgradeTier stamps socketedRound"
```

### Task 9: Rewrite planRemoveOrb with locking + refund + compound fix

**Files:**
- Modify: `packages/engine/src/forge/forge-plan.ts:145-179`

- [ ] **Step 1: Write failing test**

Add to `packages/client/src/stores/forgeStore.test.ts`:

```typescript
describe('round locking', () => {
  it('remove_orb succeeds in round 1 for current-round slot and refunds flux', () => {
    initStore(1);
    const store = useForgeStore.getState();
    const startFlux = store.plan!.tentativeFlux;

    store.applyAction({ kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 }, registry);
    const result = store.applyAction({ kind: 'remove_orb', target: 'weapon', slotIndex: 0 }, registry);

    expect(result.ok).toBe(true);
    const plan = useForgeStore.getState().plan!;
    expect(plan.tentativeFlux).toBe(startFlux); // full refund
    expect(plan.loadout.weapon.slots[0]).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/client && npx vitest run src/stores/forgeStore.test.ts -t "round locking"`
Expected: FAIL — planRemoveOrb still has `plan.round === 1` guard.

- [ ] **Step 3: Rewrite planRemoveOrb**

```typescript
function planRemoveOrb(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'remove_orb' }>,
  _cost: number,
  balance: BalanceConfig,
): PlanResult {
  const item = plan.loadout[action.target];
  const slot = item.slots[action.slotIndex];
  if (!slot) return { ok: false, error: 'Slot is empty' };

  // Round locking
  if (slot.socketedRound < plan.round) {
    return { ok: false, error: 'Cannot remove: slot is locked from a previous round' };
  }

  // Check lockedOrbUids (permanent combines)
  const orbUids = slot.kind === 'compound'
    ? slot.orbs.map(o => o.uid)
    : [slot.orb.uid];
  for (const uid of orbUids) {
    if (plan.lockedOrbUids.has(uid)) {
      return { ok: false, error: 'Cannot remove a locked orb (part of a permanent combine)' };
    }
  }

  const refund = balance.fluxCosts.assignOrb;
  const next = clonePlan(plan);
  next.loadout[action.target].slots[action.slotIndex] = null;

  if (slot.kind === 'compound') {
    // Clear the other consecutive slot too
    const otherIndex = action.slotIndex + 1 <= 5 && item.slots[action.slotIndex + 1] === slot
      ? action.slotIndex + 1
      : action.slotIndex - 1;
    if (otherIndex >= 0 && otherIndex <= 5 && next.loadout[action.target].slots[otherIndex]?.kind === 'compound') {
      next.loadout[action.target].slots[otherIndex] = null;
    }
    // Return compound orb as single stockpile entry
    const compoundOrb: OrbInstance = {
      uid: `compound_${slot.orbs[0].uid}_${slot.orbs[1].uid}`,
      affixId: slot.orbs[0].affixId,
      tier: slot.orbs[0].tier,
      compoundId: slot.compoundId,
      sourceOrbs: slot.orbs,
    };
    next.stockpile.push(compoundOrb);
  } else if (slot.kind === 'single') {
    next.stockpile.push(slot.orb);
  } else if (slot.kind === 'upgraded') {
    next.stockpile.push(slot.orb);
  }

  next.tentativeFlux = Math.min(next.tentativeFlux + refund, next.maxFlux);
  next.actionLog.push(action);
  return { ok: true, plan: next };
}
```

Update the caller in `applyPlanAction` to pass `balance`:
```typescript
case 'remove_orb': return planRemoveOrb(plan, action, cost, balance);
```

- [ ] **Step 4: Run tests**

Run: `cd packages/client && npx vitest run src/stores/forgeStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/forge-plan.ts
git commit -m "feat: planRemoveOrb with socketedRound locking + flux refund"
```

### Task 10: Add planSwapOrb handler

**Files:**
- Modify: `packages/engine/src/forge/forge-plan.ts` (add new handler + wire into switch)

- [ ] **Step 1: Write failing test**

Add to `packages/client/src/stores/forgeStore.test.ts` inside the `round locking` describe:

```typescript
it('swap_orb succeeds in round 1 for current-round slot', () => {
  initStore(1);
  const store = useForgeStore.getState();
  store.applyAction({ kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 }, registry);

  const result = store.applyAction(
    { kind: 'swap_orb', target: 'weapon', slotIndex: 0, newOrbUid: 'orb2' },
    registry,
  );

  expect(result.ok).toBe(true);
  const plan = useForgeStore.getState().plan!;
  const slot = plan.loadout.weapon.slots[0]!;
  expect(slot.kind).toBe('single');
  if (slot.kind === 'single') expect(slot.orb.uid).toBe('orb2');
  expect(slot.socketedRound).toBe(1);
  // orb1 back in stockpile
  expect(plan.stockpile.find(o => o.uid === 'orb1')).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/client && npx vitest run src/stores/forgeStore.test.ts -t "swap_orb succeeds"`
Expected: FAIL — `Unsupported plan action: swap_orb`

- [ ] **Step 3: Implement planSwapOrb and wire into switch**

Add handler:
```typescript
function planSwapOrb(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'swap_orb' }>,
  cost: number,
): PlanResult {
  if (plan.tentativeFlux < cost) return { ok: false, error: 'Not enough flux' };

  const item = plan.loadout[action.target];
  const slot = item.slots[action.slotIndex];
  if (!slot) return { ok: false, error: 'Cannot swap: slot is empty' };

  // Round locking
  if (slot.socketedRound < plan.round) {
    return { ok: false, error: 'Cannot swap: slot is locked from a previous round' };
  }

  // Only single/upgraded slots
  let removedOrb: OrbInstance;
  if (slot.kind === 'single') {
    removedOrb = slot.orb;
  } else if (slot.kind === 'upgraded') {
    removedOrb = slot.orb;
  } else {
    return { ok: false, error: 'Cannot swap a compound slot individually' };
  }

  const newOrbIdx = plan.stockpile.findIndex(o => o.uid === action.newOrbUid);
  if (newOrbIdx === -1) return { ok: false, error: 'New orb not found in stockpile' };

  const next = clonePlan(plan);
  const newOrb = next.stockpile.splice(newOrbIdx, 1)[0];
  next.stockpile.push(removedOrb);

  next.loadout[action.target].slots[action.slotIndex] = {
    kind: 'single',
    orb: newOrb,
    socketedRound: plan.round,
  };

  next.tentativeFlux -= cost;
  next.actionLog.push(action);
  return { ok: true, plan: next };
}
```

Wire into `applyPlanAction` switch:
```typescript
case 'swap_orb': return planSwapOrb(plan, action, cost);
```

- [ ] **Step 4: Run tests**

Run: `cd packages/client && npx vitest run src/stores/forgeStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/forge-plan.ts
git commit -m "feat: add planSwapOrb handler"
```

### Task 11: Update canRemoveOrb signature

**Files:**
- Modify: `packages/engine/src/forge/forge-plan.ts:313-315`
- Modify: `packages/engine/tests/forge-plan.test.ts:237-248`
- Modify: `packages/client/src/stores/forgeStore.ts:69-73`

- [ ] **Step 1: Update canRemoveOrb in forge-plan.ts**

Replace:
```typescript
export function canRemoveOrb(plan: ForgePlan, orbUid: string): boolean {
  return !plan.lockedOrbUids.has(orbUid);
}
```

With:
```typescript
export function canRemoveOrb(plan: ForgePlan, target: 'weapon' | 'armor', slotIndex: number): boolean {
  const slot = plan.loadout[target].slots[slotIndex];
  if (!slot) return false;

  // Locked if from a previous round
  if (slot.socketedRound < plan.round) return false;

  // Locked if part of a permanent combine/upgrade
  const orbUids = slot.kind === 'compound'
    ? slot.orbs.map(o => o.uid)
    : [slot.orb.uid];
  return !orbUids.some(uid => plan.lockedOrbUids.has(uid));
}
```

- [ ] **Step 2: Update forgeStore.ts canRemove**

```typescript
canRemove: (target: 'weapon' | 'armor', slotIndex: number) => {
  const { plan } = get();
  if (!plan) return false;
  return canRemoveOrb(plan, target, slotIndex);
},
```

Update the interface type too:
```typescript
canRemove: (target: 'weapon' | 'armor', slotIndex: number) => boolean;
```

- [ ] **Step 3: Update forgeStore tests for new canRemove signature**

The existing `canRemove` tests use `canRemove('orb1')`. Update:

```typescript
describe('canRemove', () => {
  it('returns false when no plan', () => {
    expect(useForgeStore.getState().canRemove('weapon', 0)).toBe(false);
  });

  it('returns true for current-round socketed orbs', () => {
    initStore(1);
    useForgeStore.getState().applyAction(
      { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 },
      registry,
    );
    expect(useForgeStore.getState().canRemove('weapon', 0)).toBe(true);
  });

  it('returns false for empty slot', () => {
    initStore(1);
    expect(useForgeStore.getState().canRemove('weapon', 0)).toBe(false);
  });
});
```

- [ ] **Step 4: Update forge-plan.test.ts canRemoveOrb tests**

Replace the existing `canRemoveOrb` describe block in `packages/engine/tests/forge-plan.test.ts`:

```typescript
describe('canRemoveOrb', () => {
  it('returns true for current-round socketed orb', () => {
    const plan = createForgePlan(makeForgeState(), registry);
    // Assign an orb first
    const result = applyPlanAction(plan, { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 }, registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(canRemoveOrb(result.plan, 'weapon', 0)).toBe(true);
  });

  it('returns false for empty slot', () => {
    const plan = createForgePlan(makeForgeState(), registry);
    expect(canRemoveOrb(plan, 'weapon', 0)).toBe(false);
  });

  it('returns false for locked orbs (permanent combine)', () => {
    const plan = createForgePlan(makeForgeState(), registry);
    // Assign an orb, then lock its uid manually
    const result = applyPlanAction(plan, { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 }, registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.plan.lockedOrbUids.add('orb1');
    expect(canRemoveOrb(result.plan, 'weapon', 0)).toBe(false);
  });

  it('returns false for previous-round slot', () => {
    // Create a plan in round 1, assign an orb
    const plan = createForgePlan(makeForgeState(), registry);
    const result = applyPlanAction(plan, { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 }, registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Simulate advancing to round 2
    result.plan.round = 2;
    expect(canRemoveOrb(result.plan, 'weapon', 0)).toBe(false);
  });
});
```

- [ ] **Step 5: Run all test suites**

Run: `cd packages/engine && npx vitest run tests/forge-plan.test.ts tests/forge.test.ts && cd ../client && npx vitest run src/stores/forgeStore.test.ts`
Expected: PASS

- [ ] **Step 6: Update engine exports if canRemoveOrb is re-exported**

Check `packages/engine/src/index.ts` — if `canRemoveOrb` is exported, ensure the new signature is reflected. The client already imports it via `@alloy/engine`.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/forge/forge-plan.ts packages/engine/tests/forge-plan.test.ts packages/client/src/stores/forgeStore.ts packages/client/src/stores/forgeStore.test.ts
git commit -m "feat: canRemoveOrb uses socketedRound + target/slotIndex signature"
```

## Chunk 4: Client UI + AI strategy updates

### Task 12: Update Forge.tsx locking logic

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx:200`, `219-220`, `747-748`

- [ ] **Step 1: Update ItemCard compound slot lock check (~line 200)**

Replace:
```typescript
const locked = !plan || slot.orbs.every(o => plan.lockedOrbUids.has(o.uid));
```
With:
```typescript
const locked = !plan || !canRemove(cardId, index);
```

Where `canRemove` comes from the forge store (passed as prop or accessed directly). The `cardId` and `index` are already available in this scope from the `sortedSlots.map`.

- [ ] **Step 2: Update single/upgraded slot lock check (~line 219-220)**

Replace:
```typescript
const locked = plan.lockedOrbUids.has(orb.uid);
const canRemove = plan.round !== 1 && !locked;
```
With:
```typescript
const canRemoveSlot = canRemove(cardId, index);
```

Update the JSX that references `canRemove` to use `canRemoveSlot` instead (the remove button visibility, hover effects, drag handle enablement).

- [ ] **Step 3: Update handleRemoveClick (~line 747-748)**

Replace:
```typescript
const handleRemoveClick = useCallback((cardId: 'weapon' | 'armor', slotIndex: number) => {
  if (!plan || plan.round === 1) return;
  applyAction({ kind: 'remove_orb', target: cardId, slotIndex }, registry);
  playSound('orbRemove');
}, [plan, applyAction, registry]);
```
With:
```typescript
const handleRemoveClick = useCallback((cardId: 'weapon' | 'armor', slotIndex: number) => {
  if (!plan) return;
  applyAction({ kind: 'remove_orb', target: cardId, slotIndex }, registry);
  playSound('orbRemove');
}, [plan, applyAction, registry]);
```

The engine's `planRemoveOrb` enforces locking — the UI just submits the action.

- [ ] **Step 4: Manually verify in browser**

Run: `cd packages/client && npm run dev`
Test:
1. Start a match, enter forge round 1
2. Socket an orb → should see remove button (no lock icon)
3. Click remove → orb returns to stockpile, flux refunded
4. Socket it elsewhere → works
5. Combine two orbs → lock icon appears on the compound
6. Advance to round 2 → round-1 slots show lock icon, new slots do not

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "feat: Forge UI uses canRemove for round-based locking"
```

### Task 13: Update AI adapt strategy for new swap cost

**Files:**
- Modify: `packages/engine/src/ai/strategies/adapt-strategy.ts`

- [ ] **Step 1: Replace swapOrb cost references with assignOrb**

Find all instances of `balance.fluxCosts.swapOrb` in adapt-strategy.ts and replace with `balance.fluxCosts.assignOrb`. There are 3 strategy tiers that use it (~lines 112, 176, 243).

Each tier has a pattern like:
```typescript
const swapCost = balance.fluxCosts.swapOrb;
```
Change to:
```typescript
const swapCost = balance.fluxCosts.assignOrb;
```

- [ ] **Step 2: No changes to `findWeakestSlots`**

The `findWeakestSlots` function iterates all equipped slots without checking `socketedRound`. The AI's `swap_orb` actions go through `applyForgeAction` which now rejects locked slots with an error. Since the AI already handles action failures gracefully (it just skips the failed swap), no filtering is needed in `findWeakestSlots`. The engine enforces correctness at the action level.

- [ ] **Step 3: Run AI tests**

Run: `cd packages/engine && npx vitest run tests/ai.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/ai/strategies/adapt-strategy.ts
git commit -m "feat: AI uses assignOrb cost for swaps, filters locked slots"
```

### Task 14: Add missing test scenarios from spec

**Files:**
- Modify: `packages/engine/tests/forge.test.ts`

- [ ] **Step 1: Add multi-round locking and compound edge case tests**

Add these tests to `packages/engine/tests/forge.test.ts`:

```typescript
it('remove_orb: round 3 locks slots from rounds 1 and 2', () => {
  // Assign in round 1
  let state = makeState({ round: 1 });
  const r1 = applyForgeAction(state, { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 }, registry);
  expect(r1.ok).toBe(true);
  if (!r1.ok) return;

  // Assign in round 2
  let round2: ForgeState = { ...r1.state, round: 2, fluxRemaining: 4 };
  const r2 = applyForgeAction(round2, { kind: 'assign_orb', orbUid: 'orb2', target: 'weapon', slotIndex: 1 }, registry);
  expect(r2.ok).toBe(true);
  if (!r2.ok) return;

  // Advance to round 3
  const round3: ForgeState = { ...r2.state, round: 3, fluxRemaining: 2 };

  // Round 1 slot locked
  expect(applyForgeAction(round3, { kind: 'remove_orb', target: 'weapon', slotIndex: 0 }, registry).ok).toBe(false);
  // Round 2 slot locked
  expect(applyForgeAction(round3, { kind: 'remove_orb', target: 'weapon', slotIndex: 1 }, registry).ok).toBe(false);

  // Assign in round 3 and remove — should work
  const r3 = applyForgeAction(round3, { kind: 'assign_orb', orbUid: 'orb3', target: 'weapon', slotIndex: 2 }, registry);
  expect(r3.ok).toBe(true);
  if (!r3.ok) return;
  const removeR3 = applyForgeAction(r3.state, { kind: 'remove_orb', target: 'weapon', slotIndex: 2 }, registry);
  expect(removeR3.ok).toBe(true);
});

it('remove_orb: compound socketed in round 1 is locked in round 2', () => {
  let state = makeState({ round: 1 });
  // Combine
  const combineResult = applyForgeAction(state, { kind: 'combine', orbUid1: 'orb1', orbUid2: 'orb2' }, registry);
  expect(combineResult.ok).toBe(true);
  if (!combineResult.ok) return;
  // Assign compound
  const assignResult = applyForgeAction(combineResult.state, {
    kind: 'assign_orb', orbUid: 'compound_orb1_orb2', target: 'weapon', slotIndex: 0,
  }, registry);
  expect(assignResult.ok).toBe(true);
  if (!assignResult.ok) return;

  // Advance to round 2
  const round2: ForgeState = { ...assignResult.state, round: 2, fluxRemaining: 4 };
  const remove = applyForgeAction(round2, { kind: 'remove_orb', target: 'weapon', slotIndex: 0 }, registry);
  expect(remove.ok).toBe(false);
  if (!remove.ok) expect(remove.error).toContain('locked');
});

it('flux refund: assign 3, remove 2, net flux = maxFlux - 1', () => {
  const state = makeState({ round: 1 });
  const startFlux = state.fluxRemaining;

  let s = state;
  // Assign 3 orbs
  for (const [uid, slot] of [['orb1', 0], ['orb2', 1], ['orb3', 2]] as const) {
    const r = applyForgeAction(s, { kind: 'assign_orb', orbUid: uid, target: 'weapon', slotIndex: slot }, registry);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
  }
  expect(s.fluxRemaining).toBe(startFlux - 3);

  // Remove 2 orbs
  for (const slot of [0, 1]) {
    const r = applyForgeAction(s, { kind: 'remove_orb', target: 'weapon', slotIndex: slot }, registry);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
  }
  expect(s.fluxRemaining).toBe(startFlux - 1); // 3 assigns - 2 refunds = net 1
});
```

- [ ] **Step 2: Run tests**

Run: `cd packages/engine && npx vitest run tests/forge.test.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add packages/engine/tests/forge.test.ts
git commit -m "test: add multi-round locking, compound transition, and cumulative flux tests"
```

### Task 15: Add socketedRound migration default

**Files:**
- Modify: `packages/engine/src/forge/forge-plan.ts` (in `createForgePlan`)

- [ ] **Step 1: Add defaulting in createForgePlan's deepCloneItem**

In `deepCloneItem`, add a fallback for missing `socketedRound` in each branch:

```typescript
// In the single branch:
if (s.kind === 'single') return { kind: 'single' as const, orb: { ...s.orb }, socketedRound: s.socketedRound ?? 1 };
// In the upgraded branch:
if (s.kind === 'upgraded') return { kind: 'upgraded' as const, orb: { ...s.orb }, originalTier: s.originalTier, upgradedTier: s.upgradedTier, socketedRound: s.socketedRound ?? 1 };
// In the compound branch:
return { kind: 'compound' as const, orbs: [...] as [...], compoundId: s.compoundId, socketedRound: s.socketedRound ?? 1 };
```

The `?? 1` handles any persisted state that predates this feature, defaulting to round 1 (most conservative — treated as locked in rounds 2+). This is a pre-release safety measure.

- [ ] **Step 2: Run tests**

Run: `cd packages/engine && npx vitest run tests/forge-plan.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/forge/forge-plan.ts
git commit -m "feat: default socketedRound to 1 for legacy slot data"
```

### Task 16: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run all engine tests**

Run: `cd packages/engine && npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run all client tests**

Run: `cd packages/client && npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Run TypeScript type check**

Run: `cd packages/engine && npx tsc --noEmit && cd ../client && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Final commit if any loose changes**

```bash
git status
# If any unstaged changes remain, add and commit
```
