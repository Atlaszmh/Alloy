# Gem Secondary Stat — Design

**Status:** Design
**Date:** 2026-04-22
**Depends on:** 2026-04-08 gem system refactor (landed on `main`)

## Summary

Add a **secondary affix slot** to high-tier, high-rarity gems. The slot unlocks automatically when a gem reaches a combined tier + rarity threshold, and is filled via a new **transplant** forge action that consumes a second gem and copies one of its affixes onto the host. Secondary and primary affixes each contribute independently to the stat pipeline — there is no compound bonus between them.

The feature exists to:

1. Give high-tier gems a **qualitatively new** power at the top of the progression ladder, rather than only bigger numbers.
2. Create **meaningful forge decisions** at late game — which gems to sacrifice, which affix to extract, and whether to spend flux for a deterministic pick.

## Non-goals

- Not a replacement for the combine system. Combine continues to handle signature / category / generic upgrades.
- No compound synergy between a gem's primary and secondary (e.g., no "fire + life = +X% life regen"). Secondary is purely additive.
- No mobile UX work (desktop-first per current project direction).
- No discovery gating for transplant — the mechanic is global and teachable via a tooltip.

## Core mechanics

### Unlock threshold

A gem's secondary slot becomes **open** (empty, ready to fill) when:

```
tier + rarityIndex ≥ TRANSPLANT_UNLOCK_THRESHOLD  (default 6)
```

`rarityIndex` is the index into `RARITY_ORDER` (common=0, uncommon=1, magic=2, rare=3, epic=4, legendary=5).

With threshold = 6:

| Rarity \ Tier | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| Legendary  (5) | — | ✓ | ✓ | ✓ | ✓ |
| Epic       (4) | — | ✓ | ✓ | ✓ | ✓ |
| Rare       (3) | — | — | ✓ | ✓ | ✓ |
| Magic      (2) | — | — | — | ✓ | ✓ |
| Uncommon   (1) | — | — | — | — | ✓ |
| Common     (0) | — | — | — | — | — |

Common gems can never unlock a secondary slot — they must be upgraded to at least Uncommon T5.

### Transplant action

A new forge action, following the existing `ForgeAction` discriminator pattern (`kind:`, not `type:`). Flux is **not** a payload field — it is handled externally following the active gem-era pattern: costs at `balance.gem.flux.costs`, deduction via `canSpendFlux`/`spendFlux` from `packages/engine/src/run/flux-state.ts`, dispatch in `packages/engine/src/match/match-controller.ts`. (`flux-tracker.ts` is a deprecated stub from the orb era — do not use.)

```ts
| { kind: 'transplant_gem';
    targetGemUid: string;       // host — keeps identity, gains secondary
    sourceGemUid: string;       // consumed
    chosenAffix?: 'primary' | 'secondary'  // optional; when set, costs extra flux
  }
```

New entries under `balance.json → gem.flux.costs`, alongside existing `boostCombine` / `rerollPool` / `guaranteeRarity`:

```json
"gem": {
  "flux": {
    "costs": {
      "boostCombine": 3,
      "rerollPool": 5,
      "guaranteeRarity": 4,
      "transplantGem": 0,
      "transplantChooseAffix": 3
    }
  }
}
```

Unlike `boost_combine` / `reroll_pool` / `guarantee_rarity` (which are flag-setting actions fully handled at match-controller level and never reach `applyForgeAction`), transplant is a **hybrid**: it both spends flux (conditionally) and mutates forge state. The match-controller dispatch adds a new case that handles the flux half, then forwards the same action into `applyForgeAction` for the mutation:

```ts
// in match-controller.ts, inside the existing `switch (action.kind)` around line 248:
case 'transplant_gem': {
  if (action.chosenAffix && state.runState) {
    const cost = fluxCosts.transplantChooseAffix ?? 3;
    if (!canSpendFlux(state.runState.flux, cost)) {
      return fail(`Insufficient flux for transplant_gem chooseAffix (need ${cost})`);
    }
    state = { ...state, runState: { ...state.runState, flux: spendFlux(state.runState.flux, cost) } };
  }
  // fall through to the forge-action path below — do NOT return here
  break;
}
```

After the switch, the existing forge-action path runs and calls `applyForgeAction` which dispatches to `applyTransplantGem` in `forge-state.ts`. Non-run modes skip the flux half entirely (transplant still works, but `chosenAffix` without flux is rejected at validation).

**Validation (in `forge-plan.ts` and `forge-state.ts`):**

- Target must exist and satisfy `hasSecondarySlot(target) && !target.secondary`.
- Source must exist, must not equal target.
- If `chosenAffix === 'secondary'`, source must have a filled secondary.
- Host's socket state is irrelevant — transplant works on a gem regardless of whether it is currently socketed; the stat pipeline recomputes naturally after mutation.
- Flux validation (sufficient balance, correct cost) lives at the match-controller layer, identical to how `boost_combine` and `reroll_pool` are handled today.

**Resolution (in `forge-state.ts → applyTransplantGem`):**

1. Determine which of the source's affixes transplants.
   - If source has no secondary: primary transplants.
   - If source has both and `chosenAffix` is set: player's choice (flux already deducted at match-controller layer).
   - If source has both and `chosenAffix` is not set: RNG picks primary/secondary 50/50, using a deterministic fork: `rng.fork('transplant_<targetUid>_<sourceUid>')`.
2. Build the `SecondarySlot` record using the chosen affix's ID, plus the source's tier and rarity.
3. Set `target.secondary = slot`; explicitly set `target.combinable = false` (overrides what `isCombinable()` would compute from tier/rarity alone — filled-secondary gems are a new terminal case). Update `recomputeCombinable(gem)` helper to account for `gem.secondary` so any downstream consumer reading `combinable` stays consistent.
4. Append `slot.affixId` to `target.tags` if not already present (explicit pre-dedup at write time; `getGemTags()` dedups on read but we keep the stored array tidy).
5. Remove the source gem from the stockpile (fully consumed). If source had a filled secondary, that secondary is lost along with the source gem — only the chosen affix survives.

**Determinism:** all RNG goes through the match's root seeded RNG with a named fork, guaranteeing replay integrity.

### Power contribution

The secondary's effect scales off the **source gem's** tier and rarity, stored on the slot at transplant time. The host's tier/rarity are irrelevant for the secondary's effect.

During stat calculation:

- If the host is socketed in a **weapon** slot, read `affixes.json → [secondary.affixId].tiers[secondary.tier].weaponEffect[]`, multiply each `StatModifier.value` by `RARITY_MULTIPLIERS[secondary.rarity]`, then feed into the 9-step pipeline as if it were a normal affix effect.
- If the host is socketed in an **armor** slot, same with `armorEffect[]`.
- If the affix definition has no `weaponEffect[]`/`armorEffect[]` for the host's slot type, the secondary contributes nothing — identical behavior to primary affixes today. The player must pick host/source combos that produce effects for the intended equipment.

A global scalar `balance.transplant.secondaryValueScalar` (default 1.0) multiplies the resulting effect values, serving as the tuning knob if secondaries prove too strong.

No compound rule between primary and secondary. They are two independent contributions flowing into the existing stat pipeline.

### Synergy interaction

Synergy detection lives in `packages/engine/src/forge/stat-calculator.ts → computeActiveSynergies` and its affix-collecting helper `collectAffixIds` (same file, ~line 195). The helper currently reads `affixId` from each socketed gem; update it to also include entries from `gem.tags[]`. Because transplant appends the secondary's `affixId` to the host's `tags[]`, this one change makes transplanted affixes participate in synergies alongside primaries. Verify via a new test (`secondary-synergy.test.ts`) that a synergy keyed on affix X fires when X appears only as a secondary on the weapon or armor.

### Combinability

- A gem with an **open but empty** secondary slot is still `combinable: true`. Combining it follows existing rules; the output's open-slot status recomputes from its new tier/rarity via `hasSecondarySlot(output)`. Combine can produce an output whose threshold is no longer met (e.g., via a generic rarity bump that also resets tier) — that is acceptable; the open-empty state simply disappears on the new gem.
- A gem with a **filled** secondary slot is `combinable: false` — but is still eligible as a transplant *source* (its primary or, with flux, its secondary may be selected and copied to a new host). "Filled secondary" is terminal only with respect to *combine*; transplant can keep the affix economy flowing. Update `isCombinable()` to also return `false` when `gem.secondary !== undefined`. Verify all current readers of `combinable` (listed below) pick up the new invariant correctly:
  - `packages/engine/src/forge/forge-plan.ts` (combine + combine3 validation)
  - `packages/engine/src/combine/combination-engine.ts` (preview + apply paths)
  - AI strategy `packages/engine/src/ai/strategies/forge-strategy.ts`
- Client UI greys out the combine affordance and shows a tooltip: "Has secondary affix — cannot combine."

### Extensibility — modifier pipeline

For v1 there is exactly one modifier (`choose-affix`). A simple inline conditional in the resolver would work. But because the user explicitly asked for an extensibility hook "so that paying flux can change the outcome in different ways" (future modifiers like rarity bumps, tier bumps, slot reseeds), we introduce the pipeline shape up-front. This is a small amount of scaffolding that avoids retrofit churn when the second modifier lands.

Transplant resolution flows through a `TransplantResolver` that walks a static registry of `TransplantModifier`s.

```ts
// packages/engine/src/forge/transplant/
//   types.ts
//   resolver.ts
//   modifiers/
//     choose-affix.ts          — v1 modifier: burn flux to pick which affix
//     index.ts
```

```ts
interface TransplantContext {
  target: GemInstance;
  source: GemInstance;
  flux: number;
  chosenAffix?: 'primary' | 'secondary';
  rng: SeededRNG;
}

interface TransplantModifier {
  id: string;
  priority: number;  // lower runs first
  apply(ctx: TransplantContext): TransplantContext;
}
```

Adding a future modifier (e.g., "spend 5 flux to bump secondary's rarity by 1 step") is a new file in `modifiers/` plus a registry entry — no changes to the action handler, resolver, or type signatures.

## Data model changes

### `packages/engine/src/types/gem.ts`

```ts
export interface SecondaryModifier {
  kind: string;
  payload?: unknown;
}

export interface SecondarySlot {
  affixId: string;
  tier: 1 | 2 | 3 | 4 | 5;
  rarity: GemRarity;
  sourceGemUid: string;
  modifiers?: SecondaryModifier[];
}

export interface GemInstance {
  uid: string;
  affixId: string;
  tier: 1 | 2 | 3 | 4 | 5;
  rarity: GemRarity;
  sourceRecipe?: string;
  recipeDepth: number;
  combinable: boolean;
  tags: string[];
  outputBonusEffects?: StatModifier[];
  secondary?: SecondarySlot;            // NEW — undefined when slot empty or not unlocked
}

export function hasSecondarySlot(gem: GemInstance, threshold: number): boolean {
  return gem.tier + rarityIndex(gem.rarity) >= threshold;
}
```

The threshold is the single source of truth at `balance.json → transplant.unlockThreshold`, read by callers via `registry.getBalance().transplant.unlockThreshold`. The signature takes `threshold` explicitly (not `gem` alone) because `gem.ts` has no access to the registry and we want the helper to stay pure — this differs slightly from `isCombinable(gem)` which uses hard-coded constants, but is deliberate: threshold is a balance knob, not a hard-coded constant, so it belongs out of the pure type helpers. A thin convenience wrapper `hasSecondarySlotFromRegistry(gem, registry)` lives next to it for UI callers that already hold a registry.

`secondary` is optional so existing saved gems round-trip without migration. All engine tests currently creating gems continue to pass; new logic is additive.

### `packages/engine/src/types/forge-action.ts`

Add the new action variant (matching existing `kind:` discriminator):

```ts
| { kind: 'transplant_gem'; targetGemUid: string; sourceGemUid: string; chosenAffix?: 'primary' | 'secondary' }
```

### `packages/engine/src/data/balance.json`

Two edits. (a) Extend the existing `gem.flux.costs` block with two new keys (leave `boostCombine` / `rerollPool` / `guaranteeRarity` untouched); (b) add a new top-level `transplant` section:

```json
"gem": {
  "flux": {
    "costs": {
      "boostCombine": 3,
      "rerollPool": 5,
      "guaranteeRarity": 4,
      "transplantGem": 0,
      "transplantChooseAffix": 3
    }
  }
},
"transplant": {
  "unlockThreshold": 6,
  "secondaryValueScalar": 1.0
}
```

Do **not** touch the top-level legacy `fluxCosts` block (orb-era, kept for backward compat). Data schema in `packages/engine/src/data/schemas.ts` (and `types/balance.ts` if the shape is typed there) needs a Zod/type update to validate the new keys.

## UI changes

### Unified `Workbench` component (desktop forge)

`packages/client/src/components/CombineWorkbench.tsx` (top-level `components/`, not under `forge-desktop/`) is **renamed** to `Workbench.tsx`. Its colocated test file `CombineWorkbench.test.tsx` renames to `Workbench.test.tsx`. All importers are updated (currently: `CombineDock.tsx` and any story/test files). Same 3-slot placement UI and drag-drop wiring as today; two CTA buttons live together below the preview panel:

- **Combine** — enabled when slot contents match a recipe (existing logic).
- **Transplant** — enabled when exactly 2 slots are filled, slot 3 is empty, and at least one of the two gems has an open-but-empty secondary slot.

**Host inference:** if only one of the two placed gems has an open empty secondary slot, it is the host and the other is the source automatically. If both are eligible, a deterministic tiebreaker selects the host (higher tier wins; rarity is secondary tiebreaker; if still tied, the first-placed gem). No toggle in v1.

**Affix picker:** when Transplant is enabled, a row under the button exposes the picker:

- "🎲 Random" (default) — free, no flux
- Primary affix pill — click to pick; shows flux cost
- Secondary affix pill — visible only when source has a filled secondary; click to pick; shows flux cost

Clicking a specific-affix pill marks the button as "Transplant (− N flux)". Clicking Random (or default) keeps it free.

**Preview panel:** shows the result of the last-hovered button. Defaults to the first-valid operation when the player has not hovered either CTA. For transplant, the result card shows the host with its new secondary row; random mode renders the secondary as "🎲 +X or +Y (source tier/rarity)".

### Dock wrapper

`CombineDock` → rename to `WorkbenchDock`. Structural chrome unchanged (same height token, bronze accent, gradient). Passes the superset of props into the new `Workbench` component.

### Stockpile gems

`packages/client/src/components/forge-desktop/StockpileStrip.tsx` (and any `StockpileGem` child) updates to render:

- Gems with an **open empty** secondary slot — dashed-outline secondary gem pip below the primary icon. Wrapper element gets `data-testid="gem-secondary-slot-open"` and `data-gem-uid={uid}` so unit and E2E tests can assert eligibility.
- Gems with a **filled** secondary — secondary affix icon rendered in the same pip position. Wrapper gets `data-testid="gem-secondary-slot-filled"` and `data-secondary-affix={affixId}`.
- No pip at all when `hasSecondarySlot(gem, threshold) === false`.

### First-unlock tutorial

The first time a player owns a gem with an open empty slot in a run, surface a one-time tooltip near that gem: "Drop another gem onto the Workbench with this one to transplant its affix into the empty slot." Dismiss on next forge action. Flag lives in `packages/client/src/stores/onboardingStore.ts` as `hasSeenTransplantTutorial: boolean`, set on dismiss and persisted alongside other onboarding flags.

## Files

### New files

- `packages/engine/src/forge/transplant/types.ts` — `TransplantContext`, `TransplantModifier`, `TransplantPreview`
- `packages/engine/src/forge/transplant/resolver.ts` — walks modifier pipeline, returns `SecondarySlot`
- `packages/engine/src/forge/transplant/preview.ts` — pure `planTransplant(state, action, registry)` function producing `TransplantPreview | null`; parallel to the existing `forge-plan.ts` convention
- `packages/engine/src/forge/transplant/modifiers/choose-affix.ts`
- `packages/engine/src/forge/transplant/modifiers/index.ts`
- `packages/engine/src/forge/transplant/index.ts`
- `packages/engine/tests/transplant-action.test.ts`
- `packages/engine/tests/transplant-preview.test.ts`
- `packages/engine/tests/transplant-rng.test.ts`
- `packages/engine/tests/slot-unlock.test.ts`
- `packages/engine/tests/secondary-combinability.test.ts`
- `packages/engine/tests/secondary-synergy.test.ts`
- `packages/client/src/components/Workbench.tsx` (renamed from `CombineWorkbench.tsx`)
- `packages/client/src/components/Workbench.test.tsx` (renamed from `CombineWorkbench.test.tsx`)
- `packages/client/src/components/forge-desktop/WorkbenchDock.tsx` (renamed from `CombineDock.tsx`)
- `packages/client/src/components/forge-desktop/TransplantControls.tsx` — the affix picker + flux-cost row
- `packages/client/e2e/forge-transplant.spec.ts`

### Modified files

- `packages/engine/src/types/gem.ts` — `SecondarySlot`, `SecondaryModifier`, `GemInstance.secondary?`, `hasSecondarySlot(gem, threshold)`, `hasSecondarySlotFromRegistry(gem, registry)`; update `isCombinable()` to return `false` when `gem.secondary` is set. The existing `isCombinable()` takes a structural subset `{ tier, rarity, recipeDepth }` — widen the parameter type to include optional `secondary?: SecondarySlot` so all current callers continue to compile
- `packages/engine/src/types/forge-action.ts` — new `transplant_gem` variant
- `packages/engine/src/data/balance.json` — new top-level `transplant` section + new keys added to existing `gem.flux.costs` block (do NOT touch the legacy top-level `fluxCosts` block)
- `packages/engine/src/data/schemas.ts` — Zod schema updates for the new balance keys
- `packages/engine/src/match/match-controller.ts` — add `transplant_gem` case inside the existing flux-spend switch (around line 248) that deducts `chooseAffix` flux when applicable, then falls through to the forge-action path
- `packages/engine/src/forge/forge-state.ts` — new switch case in `applyForgeAction` adding `case 'transplant_gem': return applyTransplantGem(...)`; new `applyTransplantGem` function
- `packages/engine/src/forge/forge-plan.ts` — parallel validation `planTransplantGem` (matches existing `planCombine` pattern)
- `packages/engine/src/forge/stat-calculator.ts` — new step in the pipeline that iterates `gem.secondary` and emits modifiers per slot type; update `computeActiveSynergies` (or its affix-collecting helper) to read `tags[]` so transplanted affixes participate in synergies
- `packages/engine/src/combine/combination-engine.ts` — no logic change, but verify that `!gem.combinable` already guards against filled-secondary gems (it will, once `isCombinable()` is updated)
- `packages/engine/src/ai/strategies/forge-strategy.ts` — add transplant evaluation: AI considers transplant when it owns a host with open empty slot + a source whose affix scores higher in the target's slot type than leaving the slot empty. Scoring uses existing evaluation heuristics; no new AI framework. v1 is allowed to be simple (only transplants when target has a strictly better source available).
- `packages/client/src/components/forge-desktop/ForgeDesktop.tsx` — use `WorkbenchDock`, wire new store actions
- `packages/client/src/components/forge-desktop/StockpileStrip.tsx` — render open/filled secondary pip with the test hooks noted in the UI section
- `packages/client/src/stores/forgeStore.ts` — add `transplantPreview`, `transplantChosenAffix`, `transplantHostUid`, dispatcher method
- `packages/client/src/stores/onboardingStore.ts` — `hasSeenTransplantTutorial` flag

### Removed / deprecated

- `CombineDock` as a distinct component (subsumed by `WorkbenchDock`).
- `CombineWorkbench` as a distinct component (renamed to `Workbench`).

### Out of scope for this spec (deferred)

- Simulation tooling (`packages/tools/`) updates to cover transplant in balance runs. Tag as follow-up once v1 data exists.
- Mobile forge UX for transplant. Desktop-first per current project direction.

## Balance knobs

| Knob | Location | Default | Purpose |
|---|---|---|---|
| `unlockThreshold` | `balance.transplant.unlockThreshold` | 6 | Tier + rarityIndex needed to open the slot |
| `transplantGem` cost | `balance.gem.flux.costs.transplantGem` | 0 | Base flux cost for the action (random affix path) |
| `transplantChooseAffix` cost | `balance.gem.flux.costs.transplantChooseAffix` | 3 | Extra flux cost when `chosenAffix` is provided |
| `secondaryValueScalar` | `balance.transplant.secondaryValueScalar` | 1.0 | Global multiplier on secondary effect magnitudes |

## Testing strategy

### Engine unit tests

- `slot-unlock.test.ts` — exhaustive table of (tier, rarity) combinations matches the threshold rule.
- `transplant-action.test.ts` — valid inputs produce correct output gem state; invalid inputs (closed slot, filled slot, same-uid, missing gems, missing flux for choice) reject cleanly.
- `transplant-rng.test.ts` — same seed + same uids produces same random affix; different seeds diverge; replay through a match snapshot is deterministic.
- `transplant-preview.test.ts` — preview function returns the correct `TransplantPreview` object for each variant.
- `secondary-combinability.test.ts` — filled-secondary gem has `combinable: false`; open-empty-slot gem still combines and the output re-derives slot state.
- `stat-calculator` — extend existing tests: secondary contributes weaponEffect when host is in weapon slot, armorEffect when in armor slot, nothing when the affix lacks an effect for that slot type. Rarity multiplier applies to secondary value. `secondaryValueScalar` applies globally.
- `synergies` — extend to verify transplanted affixes participate in synergy detection via `tags[]`.

### Client unit tests

- `Workbench.test.tsx` — button enablement logic under combinations: (no gems, 1 gem, 2 combinable gems, 2 transplantable gems, 2 both-valid gems, 3 gems).
- `TransplantControls.test.tsx` — affix picker toggle behavior, flux cost display, button text changes.
- `ForgeDesktop.test.tsx` — integration: drop two gems, transplant succeeds, stockpile updates.

### E2E

- `forge-transplant.spec.ts` — happy path: start run, reach state with transplantable gem pair, perform transplant, verify resulting gem shows both affixes in stats panel.

## Open questions

1. **Host-inference tiebreaker when both eligible** — v1 picks deterministically by tier then rarity; if that feels surprising in playtesting, add a toggle or surface the decision in UI. Decision: ship v1 deterministic, revisit after playtesting.
2. **Transplant of the transplanted** — a gem with a filled secondary currently cannot be combined. Should it be usable as a *source* in another transplant? v1 answer: yes — when chosen, either its primary or (for flux) its secondary can be picked. This means the secondary system is not strictly terminal; affixes can migrate between gems over time.
3. **Secondary scalar tuning** — `secondaryValueScalar` default of 1.0 assumes secondaries should feel "full power." If playtesting shows they dominate, drop to 0.75.

## Migration

No save-format migration needed. `secondary?: SecondarySlot` is optional on `GemInstance`; any gem loaded from a pre-feature save simply has `undefined` there and behaves as before. The unlock threshold is computed at read time from tier + rarity, so old saves with high-tier gems automatically reveal open slots on next forge.
