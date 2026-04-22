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

A new forge action:

```ts
{
  type: 'transplant_gem',
  targetGemUid: string,        // host — keeps identity, gains secondary
  sourceGemUid: string,        // consumed
  flux?: number,               // amount spent (for modifiers)
  chosenAffix?: 'primary' | 'secondary',  // valid only with sufficient flux
}
```

**Validation:**

- Target must exist and satisfy `hasSecondarySlot(target) && !target.secondary`.
- Source must exist, must not equal target.
- If `chosenAffix === 'secondary'`, source must have a filled secondary.
- If `chosenAffix` is set, `flux >= balance.transplant.chooseAffixFluxCost`.

**Resolution:**

1. Determine which of the source's affixes transplants.
   - If source has no secondary: primary transplants.
   - If source has both and `chosenAffix` is set: player's choice (flux deducted).
   - If source has both and `chosenAffix` is not set: RNG picks primary/secondary 50/50, using a deterministic fork: `rng.fork('transplant_<targetUid>_<sourceUid>')`.
2. Build the `SecondarySlot` record using the chosen affix's ID, plus the source's tier and rarity.
3. Set `target.secondary = slot`; set `target.combinable = false`.
4. Append `slot.affixId` to `target.tags` (dedup).
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

Synergy detection already reads `gem.tags[]`. Appending `secondary.affixId` to the host's tags is enough to make transplanted affixes participate in synergies alongside primaries, with zero changes to the synergy engine.

### Combinability

- A gem with an **open but empty** secondary slot is still `combinable: true`. Combining it follows existing rules; the output's open-slot status recomputes from its new tier/rarity.
- A gem with a **filled** secondary slot is `combinable: false`. The UI indicates this with a greyed-out combine affordance and a tooltip.

### Extensibility — modifier pipeline

Rather than hardcoding flux behavior into the action handler, transplant resolution flows through a `TransplantResolver` that walks a static registry of `TransplantModifier`s.

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

export function hasSecondarySlot(gem: GemInstance): boolean {
  return gem.tier + rarityIndex(gem.rarity) >= TRANSPLANT_UNLOCK_THRESHOLD;
}
```

`secondary` is optional so existing saved gems round-trip without migration. All engine tests currently creating gems continue to pass; new logic is additive.

### `packages/engine/src/types/forge-action.ts`

Add the new action variant:

```ts
| { type: 'transplant_gem'; targetGemUid: string; sourceGemUid: string; flux?: number; chosenAffix?: 'primary' | 'secondary' }
```

### `packages/engine/src/data/balance.json`

```json
"transplant": {
  "unlockThreshold": 6,
  "chooseAffixFluxCost": 3,
  "secondaryValueScalar": 1.0
}
```

## UI changes

### Unified `Workbench` component (desktop forge)

`CombineWorkbench` is repurposed into a more general `Workbench`. Same 3-slot placement UI and drag-drop wiring as today; two CTA buttons live together below the preview panel:

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

Gems with an **open empty** secondary slot show a small dashed-outline secondary gem pip below the primary icon, signaling eligibility. Gems with a **filled** secondary show the secondary affix icon in that position, identical to how primaries render today.

### First-unlock tutorial

The first time a player owns a gem with an open empty slot in a run, surface a one-time tooltip near that gem: "Drop another gem onto the Workbench with this one to transplant its affix into the empty slot." Dismiss on next forge action.

## Files

### New files

- `packages/engine/src/forge/transplant/types.ts`
- `packages/engine/src/forge/transplant/resolver.ts`
- `packages/engine/src/forge/transplant/preview.ts`
- `packages/engine/src/forge/transplant/modifiers/choose-affix.ts`
- `packages/engine/src/forge/transplant/modifiers/index.ts`
- `packages/engine/src/forge/transplant/index.ts`
- `packages/engine/tests/transplant-action.test.ts`
- `packages/engine/tests/transplant-preview.test.ts`
- `packages/engine/tests/transplant-rng.test.ts`
- `packages/engine/tests/slot-unlock.test.ts`
- `packages/engine/tests/secondary-combinability.test.ts`
- `packages/client/src/components/forge-desktop/WorkbenchDock.tsx` (renamed from `CombineDock.tsx`)
- `packages/client/src/components/forge-desktop/TransplantControls.tsx` (the affix picker + flux row)
- `packages/client/e2e/forge-transplant.spec.ts`

### Modified files

- `packages/engine/src/types/gem.ts` — new types, helper, constant
- `packages/engine/src/types/forge-action.ts` — new variant
- `packages/engine/src/data/balance.json` — new section
- `packages/engine/src/forge/action-handler.ts` — dispatch `transplant_gem` to resolver
- `packages/engine/src/forge/stat-calculator.ts` — include secondary's effect contribution
- `packages/engine/src/synergies/detect.ts` (or equivalent) — no logic change, but re-verify with secondaries present
- `packages/client/src/components/CombineWorkbench.tsx` → repurpose as `Workbench.tsx` (or keep file, rename export + add props)
- `packages/client/src/components/forge-desktop/ForgeDesktop.tsx` — use `WorkbenchDock`
- `packages/client/src/stores/forge-store.ts` — add `transplantPreview`, `transplantChosenAffix`, transplant action dispatcher

### Removed / deprecated

- `CombineDock` as a distinct component (name subsumed by `WorkbenchDock`).

## Balance knobs

All live under `balance.json → transplant`:

| Knob | Default | Purpose |
|---|---|---|
| `unlockThreshold` | 6 | Tier + rarityIndex needed to open the slot |
| `chooseAffixFluxCost` | 3 | Flux cost for deterministic affix selection |
| `secondaryValueScalar` | 1.0 | Global multiplier on secondary effect magnitudes |

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
