# Ternary Combine System + Recipe Library Expansion — Design Spec

**Date:** 2026-04-17
**Status:** Draft, pending review
**Supersedes:** `2026-04-16-three-new-gem-combos-design.md` (the 3 binary recipes from that spec are absorbed into this one's content roster)

## Purpose

Extend the combine engine to support **3-gem combines** alongside the existing 2-gem system, and ship a meaningfully larger recipe library that exercises the new shapes. Today the engine is strictly binary — `CombinationEngine.combine(gemA, gemB)` — and the forge UI, despite having a 3-slot workbench, silently ignores a third gem. This spec pipes ternary combines end-to-end and adds ~15 new recipes across all input shapes (basic/basic/basic, basic/basic/compound, basic/compound/compound, compound/compound/compound).

## Architecture Decisions (approved)

1. **Keep binary alongside ternary.** Binary combines remain the early-game/tutorial path; ternary is where the combinatorial depth lives. All 29 existing binary signature recipes (plus 6 category recipes) continue to work unchanged.
2. **~15 new recipes in this pass**: 3 binary (ported from the superseded spec) + ~12 ternary spanning all shapes.
3. **Precedence when the workbench has 3 gems:** ternary signature match wins if present; otherwise fall back to a binary signature/category match on the best pair and eject the third gem back to the stockpile (not consumed).
4. **UI model:** the existing 3-slot workbench stays as-is. No new layouts.
5. **Flux cost:** explicitly **deferred**. Ternary combines use the same `fluxCosts.combineOrbs` as binary for now; a separate cost key is a follow-up tuning decision, not part of this spec.

## What the UI already supports (context)

- `CombineWorkbench.tsx` renders `comboSlots: [GemInstance|null, GemInstance|null, GemInstance|null]` — 3 visible slots with slot 0 marked `KEEP`.
- `Forge.tsx handleCombine` (line 509) currently does: `const other = comboSlots[1] ?? comboSlots[2]` — dispatches a binary `combine` action using KEEP + first non-null other, **silently dropping the third gem**. The third gem is never consumed (plan layer only touches 2 gems) so no data is lost, but the intent-to-use is lost.
- `computeGlowSignal` in `CombineWorkbench.tsx:35` iterates over non-KEEP slots checking each pair against `registry.getCombination(keep.affixId, other.affixId)` — purely pairwise.

So the UI frame is already correct; the wiring beneath it isn't.

## Engine Changes

### 1. Recipe schema — add a third signature shape

`packages/engine/src/data/schemas.ts`:

```ts
const RecipeDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['signature', 'signature3', 'category']),
  // binary signature: 2 components; ternary signature: 3 components
  components: z.union([
    z.tuple([RecipeComponentSchema, RecipeComponentSchema]),
    z.tuple([RecipeComponentSchema, RecipeComponentSchema, RecipeComponentSchema]),
  ]).optional(),
  categoryRule: CategoryRuleSchema.optional(),
  outputAffixId: z.string(),
  outputBonusEffects: z.array(StatModifierSchema),
  maxDepthContribution: z.number().int().nonnegative(),
  tags: z.array(z.string()),
});
```

Existing 29 signature recipes keep `type: "signature"` with 2 components — no data migration. New ternary recipes use `type: "signature3"` with 3 components.

**TS interface mirror** (`packages/engine/src/combine/recipe-registry.ts`, lines 10–20) updated in lock-step: `type: 'signature' | 'signature3' | 'category'` and `components?: [RecipeComponent, RecipeComponent] | [RecipeComponent, RecipeComponent, RecipeComponent]`.

### 2. RecipeRegistry — ternary keyspace + lookup

`packages/engine/src/combine/recipe-registry.ts`:

- Add `ternaryMap: Map<string, RecipeDefinition>` alongside `signatureMap`.
- Add `ternaryKey(a, b, c) = [a,b,c].sort().join('+')` — same shape as `signatureKey` but for 3 identifiers.
- Build-time: iterate recipes; for `type === 'signature3'` compute the triple key from `${kind}:${id}` strings per component, store in `ternaryMap`.
- **New public method:**
  ```ts
  findTernaryRecipe(
    gemA: GemForLookup,
    gemB: GemForLookup,
    gemC: GemForLookup,
  ): RecipeDefinition | null
  ```
  Each gem contributes its `affix:<affixId>` identifier and, if `sourceRecipe` is set, also `recipe:<sourceRecipe>`. Lookup iterates the cartesian product (up to 2×2×2 = 8 identifier combinations) and returns the first `ternaryMap` hit.
- The existing `findSignatureRecipe` binary lookup is untouched.

### 3. CombinationEngine — ternary combine path

`packages/engine/src/combine/combination-engine.ts`:

**New public method:**

```ts
combine3(
  gemA: GemInstance,
  gemB: GemInstance,
  gemC: GemInstance,
  outputUid: string,
  keepGemUid?: string,
): CombineResult
```

Algorithm:

1. Reject if any gem is non-combinable (parallel to binary). **UI-level invariant:** non-combinable gems should never enter the workbench in the first place — the forge gates gem placement on the same `combinable` flag used by the binary engine. `combine3` mirrors binary's throw-on-violation for defensive purposes.
2. Record a ternary discovery attempt: `discovery.recordAttempt3(a.affixId, b.affixId, c.affixId)`.
3. **Try ternary signature match** via `registry.findTernaryRecipe(a, b, c)`. If hit:
   - Average quality over 3 gems: `(Q(a) + Q(b) + Q(c)) / 3`.
   - Matching-rarity bonus applies only if **all three rarities are strictly equal** (e.g., all `rare`; tier differences are irrelevant — only rarity level matters, matching the binary engine's convention). Use the existing `matchingRarityBonus` from `CombineConfig`.
   - `recipeDepth = Math.max(a.recipeDepth, b.recipeDepth, c.recipeDepth) + recipe.maxDepthContribution`.
   - Merge tags from recipe + all three gems, dedup.
   - Emit `{ gem, layer: 'signature', recipeId, isNewDiscovery }`.
4. **If no ternary match → "KEEP-anchored binary fallback + eject":**
   - The KEEP gem (slot 0 at the UI level; surfaced by `keepGemUid` at the engine level) must participate in the combined pair — user intent says the KEEP gem is preserved/upgraded. This rules out the non-KEEP pair (B, C).
   - Enumerate only the 2 pairs involving KEEP: `(KEEP, other₁)` and `(KEEP, other₂)`. If `keepGemUid` is unset, default to `gemA` as KEEP (matches binary engine convention).
   - For each pair, probe via `previewCombine()` (which already uses a cloned `DiscoveryState` internally) to rank without recording attempts.
   - Rank by layer preference `signature` > `category` > `generic`; break ties by pair's sum of `calculateEffectiveValue`.
   - Re-run the real binary `combine()` on the winning pair against the authoritative `DiscoveryState` — this consumes those 2 gems and records the pair's discovery attempt.
   - **Dual discovery recording in the fallback case is intentional:** the ternary attempt key was recorded in step 2, and the binary attempt key for the winning pair is recorded here in step 4. Both combinations were genuinely attempted from the player's perspective; a discovery-history audit will show both entries. The ternary-match path (step 3) records only the ternary key.
   - The third gem (the one not in the winning pair) is ejected: not consumed, not locked, remains in stockpile. The plan-layer (`planCombine3`) records the ejected uid in the action log.
5. If both probe pairs throw (e.g., all 3 gems are at max tier/rarity and same affix, so neither KEEP-anchored pair can even generic-upgrade), throw — parallel to the binary engine's edge case. (Non-combinable KEEP is already rejected by step 1.)

**`CombineResult` extension (additive):**

```ts
export interface CombineResult {
  gem: GemInstance;
  layer: CombineLayer;
  recipeId?: string;
  isNewDiscovery: boolean;
  consumedUids: string[];  // NEW — uids the caller should remove from stockpile
  ejectedUid?: string;     // NEW — uid to leave in stockpile (combine3 fallback only)
}
```

For `combine()` (binary), `consumedUids = [gemA.uid, gemB.uid]` and `ejectedUid` is undefined. For `combine3()`, `consumedUids` has all 3 uids on ternary match, or 2 on fallback with the third reported via `ejectedUid`. This keeps the plan layer a thin projection — it doesn't re-derive consumption from `layer`.

**New preview method:**

```ts
previewCombineTriple(a: GemInstance, b: GemInstance, c: GemInstance): CombinePreview | null
```

Returns a `CombinePreview` with an extra `fallbackPair?: [uid, uid]` field identifying which two gems the fallback path would combine (null if a ternary recipe matched directly).

**Preview-type extension (additive, no break to binary callers):**

```ts
export interface CombinePreview {
  known: boolean;
  layer: CombineLayer;
  gem: GemInstance | null;
  recipeId?: string;
  fallbackPair?: [string, string]; // NEW — populated only by previewCombineTriple, and only when the ternary recipe did NOT match (i.e., fallback path would fire)
  ejectedUid?: string;              // NEW — gem that would be returned to stockpile. Undefined when a ternary signature match consumes all 3 gems; defined only when fallbackPair is also defined.
}
```

Binary preview callers do not see either new field (they continue to call `previewCombine`, which never sets them).

### 4. Quality calculation generalization

`packages/engine/src/combine/combine-quality.ts`:

- Keep `computeAverageQuality(a, b)` for binary.
- Add `computeAverageQualityN(...gems: GemInstance[]): number` — average of `calculateEffectiveValue` across N gems.
- Keep `applyMatchingRarityBonus` unchanged. In the ternary path, "raritiesMatch" means all three match — evaluated inline in `combine3`, not in the helper.

### 5. DiscoveryState — ternary attempt keys

`packages/engine/src/combine/discovery-state.ts`:

- Add `recordAttempt3(idA, idB, idC)` and `hasAttempted3(idA, idB, idC)`. Key = `[idA, idB, idC].sort().join('+')` — same namespace as binary (a 3-element key can't collide with a 2-element key because `+` separator count differs). **Assumes no `+` in affix/recipe IDs** — verified against current `affixes.json` and `recipes.json` at spec time; enforce with a test that walks both files and asserts absence.
- Serialize/deserialize: include 3-tuple attempts in the same `attemptedCombos` array (format is just strings, existing data round-trips).

### 6. ForgeAction — new variant

`packages/engine/src/types/forge-action.ts`:

```ts
export type ForgeAction =
  | ...
  | { kind: 'combine';  gemUid1: string; gemUid2: string; keepGemUid?: string }
  | { kind: 'combine3'; gemUid1: string; gemUid2: string; gemUid3: string; keepGemUid?: string }
  | ...
```

### 7. Plan layer — `planCombine3`

`packages/engine/src/forge/forge-plan.ts`:

- Mirror `planCombine`. Find all 3 gems in stockpile, verify combinable, call `engine.combine3(...)`.
- The engine distinguishes the two outcomes via a new field on `CombineResult`: `consumedUids: string[]` — the uids that should be removed from stockpile. `combine3` populates it with all 3 when a ternary signature matches, or with the 2 members of the winning pair when fallback fires. (This avoids the plan layer having to re-derive consumption from `layer`.)
- **Consumption rules:**
  - Ternary signature matched (`findTernaryRecipe` hit): `consumedUids` has all 3 uids; push output gem, lock all 3 source uids.
  - Fallback fired: `consumedUids` has the 2 uids of the winning pair; push output gem, lock only those 2; the third uid remains in stockpile unchanged.
  - In both cases: `next.actionLog.push(action)` including the ejected uid when present (UI reads this to show an eject toast).

`packages/engine/src/forge/forge-state.ts`:

- Add a `case 'combine3'` branch in `applyForgeAction` that calls the new `planCombine3`, otherwise mirrors the existing `case 'combine'`.

### 8. UI plumbing

`packages/client/src/pages/Forge.tsx handleCombine`:

**Invariant:** slot 0 must be filled for any combine to fire. If `keep` is null, the handler returns early regardless of other slot state (matches current behavior).

```ts
const keep = comboSlots[0];
if (!keep) return;
const filled = comboSlots.filter((s): s is GemInstance => s !== null);

if (filled.length >= 3) {
  const b = comboSlots[1]!;
  const c = comboSlots[2]!;
  const result = applyAction(
    { kind: 'combine3', gemUid1: keep.uid, gemUid2: b.uid, gemUid3: c.uid, keepGemUid: keep.uid },
    registry,
  );
  // ...
} else if (filled.length === 2) {
  // existing binary path (unchanged)
}
```

`packages/client/src/components/CombineWorkbench.tsx computeGlowSignal`:

- Extend to count filled non-KEEP slots.
- If all 3 slots filled: check `registry.getTernaryCombination(...)` (new DataRegistry helper that wraps `recipeRegistry.findTernaryRecipe`) — gold glow if ternary hit.
- Else if no ternary hit but any binary pair hits: gold glow (the fallback path would still produce a known recipe).
- Else if filled count ≥ 2: white glow (generic upgrade possible).
- Else: no glow.

`ResultBox` preview rendering already accepts a `CombinePreview`; no changes needed beyond reading optional `ejectedUid` / `fallbackPair` to surface a subtle "will eject gem X" hint when fallback fires. That hint is a nice-to-have — if deferred, the UI still behaves correctly (the user just doesn't get the warning until commit-time).

### 9. AI strategies — deferred

Call sites that currently use `registry.getCombination(a, b)` for evaluating combo potential:

- `packages/engine/src/ai/evaluation.ts:79, 108, 137`
- `packages/engine/src/ai/strategies/forge-strategy.ts:159, 436, 584, 760`
- `packages/engine/src/ai/strategies/draft-strategy.ts:288`

**Decision: not in this spec.** Extending these 8 call sites to evaluate ternary triples requires pruning heuristics (combinatorial blow-up: `C(n, 3)` vs. `C(n, 2)` over a stockpile of 10–20 gems) and is the most novel part of the work. Graceful degradation applies — an AI that only considers binary combos misses ternary opportunities but doesn't break; player-facing ternary combines work fully without AI awareness.

This is listed as a follow-up spec in Non-Goals. The implementation plan for *this* spec will leave AI call sites untouched; a separate spec (`ai-ternary-evaluation-design.md`) drives the AI extension.

### 10. DataRegistry helpers

`packages/engine/src/data/registry.ts`:

```ts
getTernaryCombination(affixId1: string, affixId2: string, affixId3: string): CompoundAffixDef | null
```

Mirrors `getCombination` but for triples. Keyed on sorted-triple in a new `ternaryCombinationMap`. Populated from `combinations.json` entries whose `components` array has length 3 (see schema change below).

`combinations.json` `CompoundAffixDef.components` becomes `z.union([z.tuple([z.string(), z.string()]), z.tuple([z.string(), z.string(), z.string()])])`. Existing entries with 2 components untouched.

## Content Roster (new recipes)

### Binary additions — 3 recipes (ported from superseded spec)

Full JSON lives in `2026-04-16-three-new-gem-combos-design.md`. Summaries:

| Name | Components | Shape | Category |
|---|---|---|---|
| Combustion | `chance_on_crit + fire_damage` | basic + basic | trigger |
| Thornfrost | `recipe:retribution_aura + cold_damage` | compound + basic | defensive_trigger |
| Soul Eclipse | `recipe:soul_rend + recipe:soul_siphon` | compound + compound | trigger (capstone) |

These land in `recipes.json` as `type: "signature"` (binary) alongside the existing 29 signature recipes.

### Ternary additions — 12 recipes

Listed by input shape.

#### BBB shape — 4 recipes

| Name | Components | Archetype / Hook |
|---|---|---|
| **Meltdown** | `fire_damage + cold_damage + lightning_damage` | Tri-element capstone. Any element proc has a chance to trigger one of the other two. |
| **Warrior's Edge** | `crit_chance + crit_damage + attack_speed` | Pure DPS capstone. Crits gain a stacking attack-speed buff. |
| **Bastion** | `armor_rating + block_chance + flat_hp` | Pure tank capstone. Blocks refresh a small HP shield. |
| **Blood Pact** | `lifesteal + hp_regen + flat_hp` | Sustain capstone. Overheal converts to flat HP ceiling for the round. |

#### BBC shape — 4 recipes

| Name | Components | Archetype / Hook |
|---|---|---|
| **Detonator** | `recipe:ignite + chance_on_crit + fire_damage` | Crits consume Ignite stacks for a burst detonation. |
| **Frost Nova** | `recipe:frostbite + chance_on_block + cold_damage` | Blocks release a chill cone; Frostbite-slowed enemies inside take bonus cold. |
| **Thunderbrand** | `recipe:static_discharge + attack_speed + lightning_damage` | Faster attacks grow the chain; each chain segment adds +10% lightning dmg. |
| **Plague Carrier** | `recipe:envenom + poison_damage + chance_on_hit` | Poison spreads to nearby enemies on proc; stacks transfer with spread. |

#### BCC shape — 3 recipes

| Name | Components | Archetype / Hook |
|---|---|---|
| **Oathbound Fury** | `recipe:desperation + recipe:blood_frenzy + attack_speed` | Low-HP triggers compound: +massive AS stacked with massive lifesteal. Once-per-fight cap. |
| **Phoenix Embers** | `recipe:immolation + recipe:reactive_shield + fire_damage` | Taking damage → barrier + AoE burn; kills while ignited self-heal 10%. |
| **Crystal Aegis** | `recipe:frostbite + recipe:fortress + cold_damage` | Fortress threshold (<80% HP) also applies AoE chill, slowing attackers 30%. |

#### CCC shape — 1 recipe

| Name | Components | Archetype / Hook |
|---|---|---|
| **Worldfire** | `recipe:ignite + recipe:storm_of_flames + recipe:thermal_shock` | Ultimate fire capstone. Burns, cross-element procs, and thermal stuns unified; requires deep fire commitment to build. |

### Exemplar full-JSON definitions (one per shape)

These show the complete recipe JSON format; the other 11 ternary recipes follow the same pattern and will be filled in during the implementation plan (the simulation tool in `packages/tools/` should drive balance iteration before the numbers are locked).

**BBB — Meltdown (`recipes.json` addition):**

```json
{
  "id": "meltdown",
  "name": "Meltdown",
  "type": "signature3",
  "components": [
    { "kind": "affix", "id": "fire_damage" },
    { "kind": "affix", "id": "cold_damage" },
    { "kind": "affix", "id": "lightning_damage" }
  ],
  "outputAffixId": "meltdown",
  "outputBonusEffects": [
    { "stat": "compound.meltdown.active", "op": "flat", "value": 1 },
    { "stat": "compound.meltdown.crossElementChance", "op": "flat", "value": 0.25 },
    { "stat": "compound.meltdown.allElementBonus", "op": "percent", "value": 0.15 }
  ],
  "maxDepthContribution": 2,
  "tags": ["compound", "fire", "cold", "lightning", "elemental", "capstone"]
}
```

**BBC — Detonator:**

```json
{
  "id": "detonator",
  "name": "Detonator",
  "type": "signature3",
  "components": [
    { "kind": "recipe", "id": "ignite" },
    { "kind": "affix",  "id": "chance_on_crit" },
    { "kind": "affix",  "id": "fire_damage" }
  ],
  "outputAffixId": "detonator",
  "outputBonusEffects": [
    { "stat": "compound.detonator.active", "op": "flat", "value": 1 },
    { "stat": "compound.detonator.stackConsumeChance", "op": "flat", "value": 0.40 },
    { "stat": "compound.detonator.burstMultiplier", "op": "flat", "value": 2.5 }
  ],
  "maxDepthContribution": 1,
  "tags": ["compound", "fire", "crit", "trigger"]
}
```

**BCC — Phoenix Embers:**

```json
{
  "id": "phoenix_embers",
  "name": "Phoenix Embers",
  "type": "signature3",
  "components": [
    { "kind": "recipe", "id": "immolation" },
    { "kind": "recipe", "id": "reactive_shield" },
    { "kind": "affix",  "id": "fire_damage" }
  ],
  "outputAffixId": "phoenix_embers",
  "outputBonusEffects": [
    { "stat": "compound.phoenix_embers.active", "op": "flat", "value": 1 },
    { "stat": "compound.phoenix_embers.aoeBurnOnHit", "op": "flat", "value": 1.5 },
    { "stat": "compound.phoenix_embers.killHealPercent", "op": "flat", "value": 0.10 }
  ],
  "maxDepthContribution": 2,
  "tags": ["compound", "fire", "barrier", "defensive_trigger"]
}
```

**CCC — Worldfire:**

```json
{
  "id": "worldfire",
  "name": "Worldfire",
  "type": "signature3",
  "components": [
    { "kind": "recipe", "id": "ignite" },
    { "kind": "recipe", "id": "storm_of_flames" },
    { "kind": "recipe", "id": "thermal_shock" }
  ],
  "outputAffixId": "worldfire",
  "outputBonusEffects": [
    { "stat": "compound.worldfire.active", "op": "flat", "value": 1 },
    { "stat": "compound.worldfire.fireDamageBonus", "op": "percent", "value": 0.50 },
    { "stat": "compound.worldfire.igniteAoeRadius", "op": "flat", "value": 3 },
    { "stat": "compound.worldfire.thermalStunOnBurn", "op": "flat", "value": 0.20 }
  ],
  "maxDepthContribution": 3,
  "tags": ["compound", "fire", "lightning", "cold", "elemental", "capstone"]
}
```

Each ternary recipe also needs a `CompoundAffixDef` entry in `combinations.json` (metadata: flavor text, weapon/armor effect split, the 3-entry `components` tuple). Same authoring pattern as existing binary compounds, just with 3 components.

## Pre-existing limitations (inherited, out of scope)

1. **`registry.getAffix(compoundId)` throws.** Compounds aren't in `affixes.json`; any socketed compound gem crashes `stat-calculator.applyEquippedSlots` at line 328. Affects all 29 existing compounds equally; fixing is a separate workstream.
2. **`compound.*` stat keys are inert at runtime.** No duel code reads them to produce procs. All 15 new recipes' effects will be equally inert until the compound-procs wiring lands.
3. **Flux cost.** Ternary combines use the existing `fluxCosts.combineOrbs`. Separate cost key deferred.
4. **`forge-state.ts` legacy non-engine fallback** (lines 203–224) uses `registry.getCombination` when no `CombinationEngine` is passed. In production this path is dead (the engine is always threaded in). `combine3` intentionally does not implement a matching legacy fallback. If a future caller omits the engine on a `combine3` action, it fails — acceptable, mirrors the dead-path convention.

## Testing Strategy

### Unit tests — engine

New file: `packages/engine/tests/combination-engine-ternary.test.ts`

- **Ternary signature hit (each shape):** BBB, BBC, BCC, CCC — for each, build the right gem trio, call `combine3`, assert `layer === 'signature'`, correct `outputAffixId`, correct `outputBonusEffects`, correct tags merge, `recipeDepth = max(parents) + maxDepthContribution`.
- **Ordering invariance:** combine the same trio in all 6 permutations; all yield the same result.
- **Fallback to binary pair (KEEP-anchored):** build a trio with no ternary match but a binary hit on `(KEEP, other₁)`; assert `combine3` returns that binary result, `consumedUids` has the pair, `ejectedUid = other₂.uid`, plan layer leaves other₂ in stockpile.
- **Fallback prefers higher layer when both KEEP pairs hit:** trio where `(KEEP, other₁)` has a category match and `(KEEP, other₂)` has a signature match; assert signature wins.
- **Fallback EV tie-break:** trio where both KEEP pairs hit the same layer; assert higher sum-of-EV wins.
- **Fallback non-KEEP pair is never chosen:** trio where only `(other₁, other₂)` has a signature match; KEEP has no match with either other; assert the engine falls through to a generic KEEP-anchored combine (not the non-KEEP pair).
- **Fallback with no recipe anywhere:** build a trio that can only generic-upgrade; assert sensible generic fallback on the KEEP-anchored pair with higher EV; third gem ejected.
- **Unanimous rarity bonus:** 3 gems all `rare` rarity → quality × (1 + bonus). Mixed rarities (e.g., 2 rare + 1 magic) → no bonus. **Tiers are irrelevant** to the bonus — only rarity level matters (matches binary convention). Tests include a case "3 rare gems at tiers 1, 3, 4 → bonus applies" to pin this invariant.
- **Non-combinable rejection:** any gem with `combinable: false` throws.
- **Discovery attempt recording:** ternary attempt key written; repeated combine records same key (no dup).
- **Ternary match short-circuits fallback:** when `findTernaryRecipe` hits, no binary `combine()` is called internally (assert via spy/mock on the binary path) and only the ternary discovery key is recorded.
- **Fallback dual-recording:** when the fallback fires, both the ternary attempt key and the winning-pair binary attempt key are present in `DiscoveryState`.

Extended `recipe-registry.test.ts`:

- `findTernaryRecipe` returns correct recipe for all `kind:'affix'`/`kind:'recipe'` identifier mixes.
- Ordering invariance at the registry level.
- Unknown triple returns null.

Extended `data.test.ts`:

- `getTernaryCombination('fire_damage', 'cold_damage', 'lightning_damage')` resolves Meltdown.
- Schema validation passes for `combinations.json` entries with 3-string `components`.

### Unit tests — forge plan

Extended `forge-plan.test.ts`:

- `planCombine3` with a ternary recipe hit: all 3 gems consumed, locked; output gem added.
- `planCombine3` with fallback: 2 gems consumed and locked; 3rd untouched in stockpile; action log records the ejected uid.
- `planCombine3` with gem uid not in stockpile → error.
- `planCombine3` with non-combinable gem → error.

### Integration / E2E

- Extend `packages/client/e2e/gem-combining.spec.ts`:
  - Drag 3 gems that form a known ternary recipe → combine button shows gold glow → commit → 3 gems removed, output gem appears.
  - Drag 3 gems where only 2 form a binary recipe → combine → 2 gems consumed, 3rd remains.
  - Drag 3 gems with no recipe at all → generic fallback on best pair; 3rd remains.

### Regression

All 23 existing tests in `combination-engine.test.ts` continue to pass untouched. All forge/match/ai tests continue to pass — no changes to the binary code paths.

## Implementation Sequence (high-level — detailed plan comes next)

1. Schema + registry plumbing (`schemas.ts`, `recipe-registry.ts`, `discovery-state.ts`, `DataRegistry`).
2. Engine combine3 path (`combination-engine.ts`, `combine-quality.ts`).
3. Plan + action layer (`forge-plan.ts`, `forge-state.ts`, `types/forge-action.ts`).
4. UI wiring (`Forge.tsx handleCombine`, `CombineWorkbench.tsx computeGlowSignal`).
5. Content authoring: 3 binary + 12 ternary recipes in `recipes.json` + matching `combinations.json` entries. The 11 ternary recipes without full JSON in this spec get authored here, balance-iterated via the simulation tool.
6. Tests along the way (TDD) + full suite regression pass.

Each step lands behind the existing binary path without breaking it — the new code is additive. A feature flag is unnecessary because `type: "signature3"` only activates new behavior when data is present.

AI triple-aware evaluation is a separate spec; this implementation does not touch AI call sites.

## Non-Goals

- Flux cost changes / separate `combineOrbs3` balance key.
- Fixing the `registry.getAffix(compoundId)` latent crash.
- Wiring `compound.*` stat keys into duel simulation.
- New category recipes or category rules.
- Rebalancing existing compounds.
- UI redesign of the forge screen — the current 3-slot workbench is sufficient.
- **AI triple-aware evaluation** — deferred to a follow-up spec (`ai-ternary-evaluation-design.md`). Graceful degradation applies: binary-only AI still works, just misses ternary opportunities.
- **Capstone visual treatment** — the `"capstone"` tag is written into data but the UI doesn't distinguish it. Follow-up.
- **Ejected-gem UI hint** — `CombinePreview.ejectedUid` is exposed but not required to surface visually in this pass; a commit-time toast is sufficient.
- **Authoring the final 11 ternary recipe JSONs.** Only 4 exemplars are fully specified in this doc; the remaining 11 named recipes are component-specified but need stat-modifier JSON authored during the implementation plan. The plan should treat "author remaining 11 ternary recipe JSONs + matching combinations.json entries" as a distinct milestone, with balance iteration driven by the simulation tool in `packages/tools/`.
- **Telemetry/logging parity.** Binary combines play sound effects on merge/fail and emit an action-log entry. Ternary combines reuse the same sound hooks (`playSound('combineMerge')` / `'combineFail'`) and log entries; no new telemetry surface added in this spec.

## Open Questions

None blocking. Flux cost is deferred by explicit user direction.
