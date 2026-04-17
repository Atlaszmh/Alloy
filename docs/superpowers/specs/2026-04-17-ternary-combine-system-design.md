# Ternary Combine System + Recipe Library Expansion — Design Spec

**Date:** 2026-04-17
**Status:** Draft, pending review
**Supersedes:** `2026-04-16-three-new-gem-combos-design.md` (the 3 binary recipes from that spec are absorbed into this one's content roster)

## Purpose

Extend the combine engine to support **3-gem combines** alongside the existing 2-gem system, and ship a meaningfully larger recipe library that exercises the new shapes. Today the engine is strictly binary — `CombinationEngine.combine(gemA, gemB)` — and the forge UI, despite having a 3-slot workbench, silently ignores a third gem. This spec pipes ternary combines end-to-end and adds ~15 new recipes across all input shapes (basic/basic/basic, basic/basic/compound, basic/compound/compound, compound/compound/compound).

## Architecture Decisions (approved)

1. **Keep binary alongside ternary.** Binary combines remain the early-game/tutorial path; ternary is where the combinatorial depth lives. All 31 existing binary recipes continue to work unchanged.
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

Existing 31 recipes keep `type: "signature"` with 2 components — no data migration. New ternary recipes use `type: "signature3"` with 3 components.

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

1. Reject if any gem is non-combinable (parallel to binary).
2. Record a ternary discovery attempt: `discovery.recordAttempt3(a.affixId, b.affixId, c.affixId)`.
3. **Try ternary signature match** via `registry.findTernaryRecipe(a, b, c)`. If hit:
   - Average quality over 3 gems: `(Q(a) + Q(b) + Q(c)) / 3`.
   - Matching-rarity bonus applies only if **all three** rarities match (unanimous). Use the existing `matchingRarityBonus` from `CombineConfig`.
   - `recipeDepth = max(a, b, c).recipeDepth + recipe.maxDepthContribution`.
   - Merge tags from recipe + all three gems, dedup.
   - Emit `{ gem, layer: 'signature', recipeId, isNewDiscovery }`.
4. **If no ternary match → delegate to "best binary pair + eject":**
   - Enumerate the 3 pairs: (A,B), (A,C), (B,C).
   - For each pair, call the existing binary `combine()` logic **without committing discovery attempts** — use a cloned `DiscoveryState` for the probe.
   - Pick the pair that yields the highest-layer result: prefer `signature` > `category` > `generic`. Break ties by the pair's sum of effective values.
   - Re-run the real binary `combine()` on the chosen pair against the actual discovery state (records the discovery attempt for that pair, consumes those 2 gems).
   - The third gem is not consumed — it stays in the stockpile. The plan-layer (`planCombine3`) is responsible for eject bookkeeping.
5. If even the fallback can't produce anything (e.g., all 3 gems are at max tier/rarity and same affix), throw — parallel to the binary engine's edge case.

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
  fallbackPair?: [string, string]; // NEW — populated only by previewCombineTriple
  ejectedUid?: string;              // NEW — gem that would be returned to stockpile
}
```

### 4. Quality calculation generalization

`packages/engine/src/combine/combine-quality.ts`:

- Keep `computeAverageQuality(a, b)` for binary.
- Add `computeAverageQualityN(...gems: GemInstance[]): number` — average of `calculateEffectiveValue` across N gems.
- Keep `applyMatchingRarityBonus` unchanged. In the ternary path, "raritiesMatch" means all three match — evaluated inline in `combine3`, not in the helper.

### 5. DiscoveryState — ternary attempt keys

`packages/engine/src/combine/discovery-state.ts`:

- Add `recordAttempt3(idA, idB, idC)` and `hasAttempted3(idA, idB, idC)`. Key = `[idA, idB, idC].sort().join('+')` — same namespace as binary (a 3-element key can't collide with a 2-element key because `+` separator count differs).
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
- **Consumption rules:**
  - If `result.layer !== 'generic'` from a ternary signature: consume all 3 gems, push the output gem.
  - If fallback fired (binary pair + eject): consume only the 2 gems the binary combine used; the third remains in stockpile unchanged. Record the ejected uid in the action log for UI feedback.
- Lock all 3 source uids? **No** — only lock the uids actually consumed. The ejected gem is untouched and can still participate in subsequent combines.

`packages/engine/src/forge/forge-state.ts`:

- Add a `case 'combine3'` branch in `applyForgeAction` that calls the new `planCombine3`, otherwise mirrors the existing `case 'combine'`.

### 8. UI plumbing

`packages/client/src/pages/Forge.tsx handleCombine`:

```ts
const filled = comboSlots.filter((s): s is GemInstance => s !== null);
const keep = comboSlots[0];
if (!keep) return;

if (filled.length >= 3) {
  const [, b, c] = comboSlots;
  const result = applyAction(
    { kind: 'combine3', gemUid1: keep.uid, gemUid2: b!.uid, gemUid3: c!.uid, keepGemUid: keep.uid },
    registry,
  );
  // ...
} else if (filled.length === 2) {
  // existing binary path
}
```

`packages/client/src/components/CombineWorkbench.tsx computeGlowSignal`:

- Extend to count filled non-KEEP slots.
- If all 3 slots filled: check `registry.getTernaryCombination(...)` (new DataRegistry helper that wraps `recipeRegistry.findTernaryRecipe`) — gold glow if ternary hit.
- Else if no ternary hit but any binary pair hits: gold glow (the fallback path would still produce a known recipe).
- Else if filled count ≥ 2: white glow (generic upgrade possible).
- Else: no glow.

`ResultBox` preview rendering already accepts a `CombinePreview`; no changes needed beyond reading optional `ejectedUid` / `fallbackPair` to surface a subtle "will eject gem X" hint when fallback fires. That hint is a nice-to-have — if deferred, the UI still behaves correctly (the user just doesn't get the warning until commit-time).

### 9. AI strategies — triple-aware evaluation

Call sites that currently use `registry.getCombination(a, b)` for evaluating combo potential:

- `packages/engine/src/ai/evaluation.ts:79, 108, 137`
- `packages/engine/src/ai/strategies/forge-strategy.ts:159, 436, 584, 760`
- `packages/engine/src/ai/strategies/draft-strategy.ts:288`

**Approach:** add a parallel `registry.getTernaryCombination(a, b, c)` helper and, at each call site that iterates stockpile pairs, add a triple loop for eligible 3-gem combinations. To bound the search, only consider triples where each gem is distinct by uid and at least one gem is part of a promising pair (i.e., don't evaluate every C(n,3) — prune by existing pair signal).

This is the most finicky part of the implementation. The spec's position: **each call site is a small local edit**, and the AI impact is graceful degradation — if we miss a triple, the AI just doesn't see that opportunity; it doesn't break. An implementation plan can batch these changes.

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

These land in `recipes.json` as `type: "signature"` (binary) alongside the existing 31.

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

1. **`registry.getAffix(compoundId)` throws.** Compounds aren't in `affixes.json`; any socketed compound gem crashes `stat-calculator.applyEquippedSlots` at line 328. Affects all 31 existing compounds equally; fixing is a separate workstream.
2. **`compound.*` stat keys are inert at runtime.** No duel code reads them to produce procs. All 15 new recipes' effects will be equally inert until the compound-procs wiring lands.
3. **Flux cost.** Ternary combines use the existing `fluxCosts.combineOrbs`. Separate cost key deferred.

## Testing Strategy

### Unit tests — engine

New file: `packages/engine/tests/combination-engine-ternary.test.ts`

- **Ternary signature hit (each shape):** BBB, BBC, BCC, CCC — for each, build the right gem trio, call `combine3`, assert `layer === 'signature'`, correct `outputAffixId`, correct `outputBonusEffects`, correct tags merge, `recipeDepth = max(parents) + maxDepthContribution`.
- **Ordering invariance:** combine the same trio in all 6 permutations; all yield the same result.
- **Fallback to binary pair:** build a trio with no ternary match but a binary hit for 2 of the 3 gems; assert `combine3` returns the binary result, the ejected uid is the third gem, plan layer leaves it in stockpile.
- **Fallback with no recipe anywhere:** build a trio that can only generic-upgrade; assert sensible generic fallback on the best pair (typically KEEP + highest-EV other), third ejected.
- **Unanimous rarity bonus:** 3 gems all rare → quality × (1 + bonus); 2 rare + 1 magic → no bonus applied.
- **Non-combinable rejection:** any gem with `combinable: false` throws.
- **Discovery attempt recording:** ternary attempt key written; repeated combine records same key (no dup).

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
5. AI triple-aware evaluators (one file at a time; incremental).
6. Content authoring: 3 binary + 12 ternary recipes in `recipes.json` + matching `combinations.json` entries.
7. Tests along the way (TDD) + full suite regression pass.

Each step lands behind the existing binary path without breaking it — the new code is additive. A feature flag is unnecessary because `type: "signature3"` only activates new behavior when data is present.

## Non-Goals

- Flux cost changes / separate `combineOrbs3` balance key.
- Fixing the `registry.getAffix(compoundId)` latent crash.
- Wiring `compound.*` stat keys into duel simulation.
- New category recipes or category rules.
- Rebalancing existing compounds.
- UI redesign of the forge screen — the current 3-slot workbench is sufficient.
- **Capstone visual treatment** — the `"capstone"` tag is written into data but the UI doesn't distinguish it. Follow-up.
- **Ejected-gem UI hint** — `CombinePreview.ejectedUid` is exposed but not required to surface visually in this pass; a commit-time toast is sufficient.

## Open Questions

None blocking. Flux cost is deferred by explicit user direction.
