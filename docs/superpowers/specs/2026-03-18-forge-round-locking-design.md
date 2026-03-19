# Forge Round-Locking & Tentative Flux

**Date:** 2026-03-18
**Status:** Draft

## Problem

Currently the forge has two issues:
1. **Round 1 is too rigid.** Orbs socketed in round 1 cannot be removed or rearranged at all — the player must commit perfectly on the first try.
2. **Rounds 2-3 are too loose.** All socketed orbs (including those from previous rounds) can be removed/swapped, undermining the permanence of earlier decisions.

The desired behavior: within any forge round, orbs socketed **that round** are freely rearrangeable. Orbs from **previous rounds** are locked. Combining remains the only permanent within-round action.

## Design

### 1. `socketedRound` on EquippedSlot

Add a `socketedRound` field to every `EquippedSlot` variant in `types/item.ts`:

```typescript
export type EquippedSlot =
  | { kind: 'single'; orb: OrbInstance; socketedRound: 1 | 2 | 3 }
  | { kind: 'compound'; orbs: [OrbInstance, OrbInstance]; compoundId: string; socketedRound: 1 | 2 | 3 }
  | { kind: 'upgraded'; orb: OrbInstance; originalTier: AffixTier; upgradedTier: AffixTier; socketedRound: 1 | 2 | 3 };
```

When any action creates a slot (`assign_orb`, `upgrade_tier`, `swap_orb`), it stamps `socketedRound: currentRound`. This value persists across rounds.

### 2. Locking model

A slot is **locked** when `slot.socketedRound < currentRound`.

| Scenario | Round 1 | Round 2 | Round 3 |
|----------|---------|---------|---------|
| Orb socketed round 1 | Removable | Locked | Locked |
| Orb socketed round 2 | N/A | Removable | Locked |
| Orb socketed round 3 | N/A | N/A | Removable |

This replaces the current hard-coded `round === 1` guard on `remove_orb` and `swap_orb`. Both actions become available in **all rounds** for current-round slots (including round 1, which was previously fully blocked).

The existing `lockedOrbUids` set in `ForgePlan` (which prevents removing orbs consumed by combines/upgrades) remains orthogonal and unchanged. `canRemoveOrb()` checks **both**: `lockedOrbUids` AND `socketedRound < currentRound`.

**Compound slots:** Compound orbs span 2 consecutive slots (both reference the same slot object). Both share the same `socketedRound`. If locked, both are locked. If removable, removing clears both slots and returns the compound orb to stockpile as a single entry (not decomposed into source orbs). Note: the current `planRemoveOrb` implementation pushes individual source orbs back — this needs to be fixed to return the compound orb instead, consistent with how it was assigned.

**Combine lock interaction:** When two orbs are combined, the source orb UIDs are added to `lockedOrbUids`. If the resulting compound orb is then socketed in the same round, the slot has `socketedRound === currentRound` so it passes the round check. However, the compound slot's source orb UIDs are checked against `lockedOrbUids` and found locked — so the compound slot is still non-removable. This is intentional: combining is permanent.

### 3. Tentative flux with refunds

Flux becomes a live preview during forging. The player sees their remaining budget go up and down as they arrange and rearrange orbs.

**Refund rule:** `remove_orb` on a current-round slot **refunds** the `assignOrb` flux cost instead of charging the `removeOrb` cost. Net effect: assigning then removing the same orb costs 0 flux.

**`swap_orb` rule:** `swap_orb` on a current-round slot costs `assignOrb` flux (the old orb is effectively removed for free, and the new orb is assigned). On a previous-round slot, `swap_orb` is blocked (slot is locked). Implementation: `getActionCost` returns `assignOrb` for `swap_orb` (replacing the current `swapOrb` cost). AI strategies that budget using `balance.fluxCosts.swapOrb` must be updated to use `balance.fluxCosts.assignOrb` instead.

Example flow (round 2, starting with 4 flux, `assignOrb` cost = 1):
1. Assign orb A → flux shows **3**
2. Assign orb B → flux shows **2**
3. Remove orb A → flux shows **3** (refund)
4. Assign orb A elsewhere → flux shows **2**

**Permanent actions (no refund):**
- `combine` — source orbs are destroyed, flux is consumed, `lockedOrbUids` prevents removal
- `upgrade_tier` — same as combine, permanent and non-refundable

**Top-level flux check:** The existing `applyForgeAction` checks `fluxRemaining < cost` before dispatching to handlers. For `remove_orb`, since the action now refunds rather than charges, the cost lookup must return 0 (or the top-level check must be skipped/adjusted for remove). Simplest approach: `getActionCost` returns 0 for `remove_orb` unconditionally; the refund logic lives in the handler.

**Flux cap:** Refunds cannot push `tentativeFlux` above `maxFlux`. In practice this can't happen (a refund only restores what a prior assign charged), but the invariant should be enforced with a `Math.min(flux + refund, maxFlux)` cap.

### 4. File-by-file changes

#### `packages/engine/src/types/item.ts`
- Add `socketedRound: 1 | 2 | 3` to all three `EquippedSlot` variants.

#### `packages/engine/src/forge/forge-state.ts`
- `applyAssignOrb`: stamp `socketedRound: state.round` on created `single` and `compound` slots.
- `applyUpgradeTier`: stamp `socketedRound: state.round` on created `upgraded` slot.
- `applySwapOrb`: remove the `round === 1` guard. Add `slot.socketedRound < state.round` check (reject if locked). Stamp `socketedRound: state.round` on the new `single` slot. Charge `assignOrb` cost (not `swapOrb`).
- `applyRemoveOrb`: remove the `round === 1` guard. Add `slot.socketedRound < state.round` check (reject if locked). Refund: `fluxRemaining + assignOrbCost` instead of `fluxRemaining - cost`. Pass `balance` to get `assignOrb` cost (add parameter or use caller). Also support compound slot removal: currently rejects with "Cannot remove a compound slot individually" — change to allow removal of current-round compound slots, clearing both consecutive slots and returning the compound orb to stockpile as a single entry (reconstruct from `slot.orbs` and `slot.compoundId`).
- `applyForgeAction`: adjust so `remove_orb` is not blocked by the top-level flux check (since it refunds rather than charges).

#### `packages/engine/src/forge/forge-plan.ts`
- `deepCloneItem`: preserve `socketedRound` on all three slot branches (`single`, `upgraded`, `compound`). Each branch must explicitly copy the field.
- `planAssignOrb`: stamp `socketedRound: plan.round` on created `single` and `compound` slots.
- `planUpgradeTier`: stamp `socketedRound: plan.round` on created `upgraded` slot.
- `planRemoveOrb`: remove the `plan.round === 1` guard. Add `slot.socketedRound < plan.round` check (reject if locked). Refund `assignOrb` cost instead of charging `removeOrb` cost. Fix compound removal to return the compound orb as a single stockpile entry (not individual source orbs).
- Add `planSwapOrb` handler: currently missing from `applyPlanAction`'s switch. Implement with `socketedRound < plan.round` locking check, charge `assignOrb` cost, stamp `socketedRound: plan.round` on new slot.
- `canRemoveOrb`: change signature to `canRemoveOrb(plan: ForgePlan, target: 'weapon' | 'armor', slotIndex: number): boolean`. Looks up the slot from `plan.loadout[target].slots[slotIndex]`. Returns false if slot is null, if `slot.socketedRound < plan.round`, or if any orb uid in the slot is in `lockedOrbUids`.

#### `packages/engine/src/forge/flux-tracker.ts`
- `getActionCost`: return 0 for `remove_orb` (refund logic lives in handler, not in cost lookup). Return `balance.fluxCosts.assignOrb` for `swap_orb` (replacing `balance.fluxCosts.swapOrb`), since swapping a current-round slot is effectively a free remove + new assign.

#### `packages/engine/src/types/forge-action.ts`
- No changes. Existing action shapes work as-is.

#### `packages/client/src/stores/forgeStore.ts`
- `canRemove`: update to accept `target: 'weapon' | 'armor'` and `slotIndex: number` (in addition to or instead of `orbUid`). Delegate to engine's updated `canRemoveOrb`.

#### `packages/client/src/pages/Forge.tsx`
- **`ItemCard` compound slot lock check** (~line 200): replace `slot.orbs.every(o => plan.lockedOrbUids.has(o.uid))` with a call through `canRemove(target, slotIndex)` or replicate the new `socketedRound` + `lockedOrbUids` check.
- **`ItemCard` single/upgraded slot lock check** (~line 219-220): replace `plan.round !== 1 && !locked` with `canRemove(cardId, index)` from the store.
- **`handleRemoveClick`** (~line 748): remove the `plan.round === 1` early return. The engine's `planRemoveOrb` now enforces locking via `socketedRound`.
- Lock icon (🔒) shown on slots where `canRemove` returns false.
- Remove button and drag-from-slot enabled only where `canRemove` returns true.
- Flux counter already reads `tentativeFlux` — naturally reflects refunds.

#### AI strategies (`packages/engine/src/ai/strategies/adapt-strategy.ts`)
- AI emits `swap_orb` actions that go through `applyForgeAction` (server-side). The `socketedRound` check will now enforce locking. The AI's adapt strategy targets slots from the current round's own assignments (since rounds 2-3 adapt by swapping in newly drafted orbs), so this should work naturally. However, if the AI tries to swap a previous-round slot, it will now get an error instead of succeeding — verify this path is safe or add a `socketedRound` check in the strategy before emitting `swap_orb`.

### 5. Migration

This is a pre-release system with no in-flight matches to migrate. However, as a safety measure, any `EquippedSlot` read from persisted state that lacks `socketedRound` should default to `1` — the most conservative option, treating the slot as locked in rounds 2+. This can be handled at deserialization time (e.g., in `createForgePlan` when building from `ForgeState`, or wherever loadouts are loaded from the database).

### 6. Invariants

- `socketedRound` is always `<= currentRound` (you can't socket something in a future round).
- A slot with `socketedRound < currentRound` can never be modified — no remove, no swap.
- Combine and upgrade_tier are always permanent regardless of round (enforced by `lockedOrbUids`).
- Flux can never exceed `maxFlux` after refunds.
- `remove_orb` on a current-round slot refunds exactly `assignOrb` cost. `remove_orb` on a previous-round slot is rejected.
- `swap_orb` on a current-round slot charges `assignOrb` cost. `swap_orb` on a previous-round slot is rejected.

### 7. What does NOT change

- Combine/upgrade_tier behavior and `lockedOrbUids` tracking — unchanged.
- `set_base_stats` — still round-1 only, still free.
- `commitPlan` / action log replay — the server still receives and replays the full action log. The log will contain assign + remove pairs for rearranged orbs, which replay correctly.
- Match phase machine and round progression — unchanged.
- Flux budget per round — unchanged.

### 8. Testing focus

- **Round 1 rearrangement:** assign an orb, remove it (should succeed, flux refunded), assign elsewhere.
- **Round 2 locking:** verify round-1 slots are locked (remove fails with error), round-2 slots are removable.
- **Round 3 locking:** verify round-1 and round-2 slots are locked, round-3 slots removable.
- **Swap in round 1:** swap a current-round orb (should succeed, costs `assignOrb` flux).
- **Swap in round 2 on previous-round slot:** should fail (locked).
- **Swap in round 2 on current-round slot:** should succeed.
- **Combine + remove in same round:** combine in round 1, socket compound, try to remove → blocked by `lockedOrbUids`.
- **Combine + round transition:** combine in round 1, socket compound in round 1, enter round 2 → compound slot locked by `socketedRound`.
- **Compound removal in current round:** combine in round 2, socket compound, remove compound → compound orb returns to stockpile as single entry (source orbs permanently gone).
- **Flux refund:** assign 3 orbs, remove 2 → flux = maxFlux - 1 (only 1 net assign).
- **Flux cap:** flux never exceeds `maxFlux` after refunds.
- **AI forge:** AI completes forge successfully under new rules (rounds 1-3).
- **Plan swap_orb:** verify `planSwapOrb` handler works through `applyPlanAction`.
