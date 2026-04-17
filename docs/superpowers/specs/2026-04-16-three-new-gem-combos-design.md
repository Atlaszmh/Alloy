# Three New Gem Combos — Design Spec

**Date:** 2026-04-16
**Status:** Draft, pending review

## Purpose

Expand the gem-combo network with three new compound recipes that (a) slot cohesively into the existing 31-compound library and (b) exercise the deeper recipe-tree shapes the engine already supports but no current recipe uses: `compound + basic` and `compound + compound`.

The goal is richer archetype choice for the player — a crit-fire build alternative, a cold-tank branch, and a true endgame capstone — without expanding engine scope.

## Context

### Engine support for deep trees (existing, unused)

`RecipeRegistry` already matches signature recipes on either `{kind:'affix', id}` or `{kind:'recipe', id}` components (`packages/engine/src/combine/recipe-registry.ts:58`). During combine, each gem contributes both identifiers:

- `affix:<gem.affixId>` — always
- `recipe:<gem.sourceRecipe>` — if the gem was produced by a recipe

All 31 existing recipes use `affix + affix`. This spec adds the first recipes that use `recipe + affix` and `recipe + recipe`.

### Stat-key convention (mirrored, not extended)

Existing compounds express effects as stat modifiers with keys of the form `compound.<id>.<suffix>` (e.g. `compound.ignite.chance`, `compound.ignite.dotMultiplier`). The modifiers flow through `stat-calculator.applyEquippedSlots()` and propagate to the loadout. The three new compounds follow the same pattern — no new infrastructure.

### Known pre-existing limitation (explicitly out of scope)

`registry.getAffix()` throws for compound IDs because compounds live in `combinations.json`, not `affixes.json`. This means socketing ANY compound gem into a loadout crashes `stat-calculator.applyEquippedSlots()` at the call to `registry.getAffix(gem.affixId)` (`packages/engine/src/forge/stat-calculator.ts:328`). The new combos inherit this limitation exactly. Fixing it is a separate workstream (touches all 31 existing compounds + stat calculation) and is deliberately deferred.

Similarly, no duel-system code currently reads `compound.*` stat keys to produce in-combat procs. All compound effects (existing and new) are inert at runtime. Wiring them up is separate.

## The Three Combos

### 1. Combustion — `chance_on_crit + fire_damage`

- **Type:** signature, depth 1 (basic + basic)
- **Category:** `trigger`
- **Tree position:** Sibling to Ignite in the fire tree. First recipe to use `chance_on_crit` (previously unused by any compound).
- **Fantasy:** A critical hit detonates the target in a fire burst, stamping burn stacks and boosting fire DoT globally.
- **Weapon effect:** Crits have chance to trigger an AoE fire detonation; successful procs apply burn stacks.
- **Armor effect:** Nearby enemies take fire damage when the wearer is crit.

Output stat modifiers (`recipes.json`, flattened; combat hook-up deferred):

```json
[
  { "stat": "compound.combustion.chance", "op": "flat", "value": 0.50 },
  { "stat": "compound.combustion.aoeRadius", "op": "flat", "value": 2 },
  { "stat": "compound.combustion.critBurnStacks", "op": "flat", "value": 3 },
  { "stat": "compound.combustion.fireDotBonus", "op": "flat", "value": 0.30 }
]
```

Tags: `["compound", "fire", "crit", "trigger"]`
`maxDepthContribution`: 1

**Why it's interesting:** Creates a meaningful fork in the fire archetype. Ignite builds funnel through `chance_on_hit`; Combustion builds funnel through `chance_on_crit`. Drafters who lean into crit stats now have a payoff compound.

### 2. Thornfrost — `recipe:retribution_aura + affix:cold_damage`

- **Type:** signature, depth 2 (compound + basic → new compound)
- **Category:** `defensive_trigger`
- **Tree position:** Extends Retribution Aura (itself `chance_on_taking_damage + thorns`) by adding a cold elemental layer.
- **Fantasy:** Thorns retaliate with frostbite, slowing attackers who break themselves against your plate.
- **Weapon effect:** Thorn damage from Retribution Aura ticks gains +50% as cold and has a chance to apply a chill stack.
- **Armor effect:** Each thorn proc applies a 40% slow to the attacker for 30 seconds.

Output stat modifiers:

```json
[
  { "stat": "compound.thornfrost.active", "op": "flat", "value": 1 },
  { "stat": "compound.thornfrost.slowOnThornHit", "op": "flat", "value": 0.40 },
  { "stat": "compound.thornfrost.slowDuration", "op": "flat", "value": 30 },
  { "stat": "compound.thornfrost.coldThornDamageBonus", "op": "flat", "value": 0.50 },
  { "stat": "compound.thornfrost.chillStackChance", "op": "flat", "value": 0.20 }
]
```

Tags: `["compound", "thorns", "cold", "defensive_trigger"]`
`maxDepthContribution`: 1 (added on top of Retribution Aura's depth)

**Why it's interesting:** Tank archetypes currently have no elemental identity. Thornfrost makes an armored defender a slow-aura that punishes pressure — a strategic counter to fast/glass-cannon opponents. And it deepens the combo tree: the player must first build Retribution Aura, then combine it with a cold_damage gem.

### 3. Soul Eclipse — `recipe:soul_rend + recipe:soul_siphon`

- **Type:** signature, depth 3 (compound + compound → capstone)
- **Category:** `trigger` (inherits on-hit heritage)
- **Tree position:** Capstone fusing Soul Rend (chance_on_hit + shadow_damage) and Soul Siphon (chance_on_hit + lifesteal). Both parents share the `chance_on_hit` node, so they sit in the same branch of the tree — a natural convergence.
- **Fantasy:** Soul drain and soul rending cross-pollinate. Shadow procs heal; lifesteal procs rend souls; overheal bursts outward as shadow damage.
- **Weapon effect:** Soul-rend procs heal the wielder for 10% of damage dealt; lifesteal procs have 20% chance to apply Soul Rend; while both buffs are active, the wielder deals +2% of target current HP as bonus damage.
- **Armor effect:** Overhealing (healing past max HP) is dealt as AoE shadow damage at 50% of the excess.

Output stat modifiers:

```json
[
  { "stat": "compound.soul_eclipse.active", "op": "flat", "value": 1 },
  { "stat": "compound.soul_eclipse.hpStealOnShadowProc", "op": "flat", "value": 0.10 },
  { "stat": "compound.soul_eclipse.shadowChanceOnLifesteal", "op": "flat", "value": 0.20 },
  { "stat": "compound.soul_eclipse.overhealBurst", "op": "flat", "value": 0.50 },
  { "stat": "compound.soul_eclipse.hpDamageBonus", "op": "flat", "value": 0.02 }
]
```

Tags: `["compound", "shadow", "lifesteal", "trigger", "capstone"]`
`maxDepthContribution`: 2 (deeper capstone contribution, reflecting its position at tree depth 3)

**Why it's interesting:** A true endgame combo. The player must hit 4 basics + 2 intermediate combines along the way: `chance_on_hit + shadow_damage → Soul Rend` AND `chance_on_hit + lifesteal → Soul Siphon` AND finally `Soul Rend + Soul Siphon → Soul Eclipse`. Rewards deep commitment to the vampiric-shadow archetype and creates an aspirational build target.

## Data Changes

### `packages/engine/src/data/recipes.json`

Append 3 entries:

```json
{
  "id": "combustion",
  "name": "Combustion",
  "type": "signature",
  "components": [
    { "kind": "affix", "id": "chance_on_crit" },
    { "kind": "affix", "id": "fire_damage" }
  ],
  "outputAffixId": "combustion",
  "outputBonusEffects": [
    { "stat": "compound.combustion.chance", "op": "flat", "value": 0.50 },
    { "stat": "compound.combustion.aoeRadius", "op": "flat", "value": 2 },
    { "stat": "compound.combustion.critBurnStacks", "op": "flat", "value": 3 },
    { "stat": "compound.combustion.fireDotBonus", "op": "flat", "value": 0.30 }
  ],
  "maxDepthContribution": 1,
  "tags": ["compound", "fire", "crit", "trigger"]
}
```

```json
{
  "id": "thornfrost",
  "name": "Thornfrost",
  "type": "signature",
  "components": [
    { "kind": "recipe", "id": "retribution_aura" },
    { "kind": "affix", "id": "cold_damage" }
  ],
  "outputAffixId": "thornfrost",
  "outputBonusEffects": [
    { "stat": "compound.thornfrost.active", "op": "flat", "value": 1 },
    { "stat": "compound.thornfrost.slowOnThornHit", "op": "flat", "value": 0.40 },
    { "stat": "compound.thornfrost.slowDuration", "op": "flat", "value": 30 },
    { "stat": "compound.thornfrost.coldThornDamageBonus", "op": "flat", "value": 0.50 },
    { "stat": "compound.thornfrost.chillStackChance", "op": "flat", "value": 0.20 }
  ],
  "maxDepthContribution": 1,
  "tags": ["compound", "thorns", "cold", "defensive_trigger"]
}
```

```json
{
  "id": "soul_eclipse",
  "name": "Soul Eclipse",
  "type": "signature",
  "components": [
    { "kind": "recipe", "id": "soul_rend" },
    { "kind": "recipe", "id": "soul_siphon" }
  ],
  "outputAffixId": "soul_eclipse",
  "outputBonusEffects": [
    { "stat": "compound.soul_eclipse.active", "op": "flat", "value": 1 },
    { "stat": "compound.soul_eclipse.hpStealOnShadowProc", "op": "flat", "value": 0.10 },
    { "stat": "compound.soul_eclipse.shadowChanceOnLifesteal", "op": "flat", "value": 0.20 },
    { "stat": "compound.soul_eclipse.overhealBurst", "op": "flat", "value": 0.50 },
    { "stat": "compound.soul_eclipse.hpDamageBonus", "op": "flat", "value": 0.02 }
  ],
  "maxDepthContribution": 2,
  "tags": ["compound", "shadow", "lifesteal", "trigger", "capstone"]
}
```

### `packages/engine/src/data/combinations.json`

Append 3 `CompoundAffixDef` entries (metadata — flavor text, `fluxCost`, `slotCost`, and the weapon/armor effect split used by UI / future combat code).

Note on the `components` field: the schema is `[string, string]` with no `kind` discriminator. For `Thornfrost` and `Soul Eclipse`, we list the parent recipe IDs as strings (`"retribution_aura"`, `"soul_rend"`, `"soul_siphon"`). The field is documentation/UI-only — the authoritative input identity lives in `recipes.json`. `registry.getCombination(affixId1, affixId2)` is used for UI metadata lookup from two gem affixIds; because a compound gem's `affixId` equals the recipe's `outputAffixId`, `getCombination('retribution_aura', 'cold_damage')` correctly resolves to the Thornfrost entry.

```json
{
  "id": "combustion",
  "name": "Combustion",
  "description": "Crits detonate fire at the target; wearer radiates flame when struck critically.",
  "weaponFlavorText": "Every crit becomes an ignition point. Fire bursts outward from the target, stamping burn stacks on everything within the blast. Crit-heavy builds finally get a fire payoff that doesn't gate on `chance_on_hit`.",
  "armorFlavorText": "When enemies crit you, they catch fire. Your armor radiates heat under pressure — the harder they hit, the more they burn for it.",
  "components": ["chance_on_crit", "fire_damage"],
  "fluxCost": 2,
  "slotCost": 2,
  "weaponEffect": [
    { "stat": "compound.combustion.chance", "op": "flat", "value": 0.50 },
    { "stat": "compound.combustion.aoeRadius", "op": "flat", "value": 2 },
    { "stat": "compound.combustion.critBurnStacks", "op": "flat", "value": 3 },
    { "stat": "compound.combustion.fireDotBonus", "op": "flat", "value": 0.30 }
  ],
  "armorEffect": [
    { "stat": "compound.combustion.chance", "op": "flat", "value": 0.50 },
    { "stat": "compound.combustion.aoeRadius", "op": "flat", "value": 2 }
  ],
  "tags": ["compound", "fire", "crit", "trigger"]
}
```

```json
{
  "id": "thornfrost",
  "name": "Thornfrost",
  "description": "Retaliation thorns gain cold damage and slow attackers who hit you.",
  "weaponFlavorText": "Your thorns aren't just spikes — they're needles of frost. Each retaliation tick deals +50% of its damage as cold, and has a chance to apply a chill stack. Stack enough chill and the attacker's next swing is dangerously slow.",
  "armorFlavorText": "Whenever thorns fire, the attacker is slowed by 40% for 30 seconds. The more they hit you, the slower they get. Aggressive enemies dig their own grave.",
  "components": ["retribution_aura", "cold_damage"],
  "fluxCost": 2,
  "slotCost": 2,
  "weaponEffect": [
    { "stat": "compound.thornfrost.active", "op": "flat", "value": 1 },
    { "stat": "compound.thornfrost.coldThornDamageBonus", "op": "flat", "value": 0.50 },
    { "stat": "compound.thornfrost.chillStackChance", "op": "flat", "value": 0.20 }
  ],
  "armorEffect": [
    { "stat": "compound.thornfrost.active", "op": "flat", "value": 1 },
    { "stat": "compound.thornfrost.slowOnThornHit", "op": "flat", "value": 0.40 },
    { "stat": "compound.thornfrost.slowDuration", "op": "flat", "value": 30 }
  ],
  "tags": ["compound", "thorns", "cold", "defensive_trigger"]
}
```

```json
{
  "id": "soul_eclipse",
  "name": "Soul Eclipse",
  "description": "Soul Rend and Soul Siphon fused — drain life while destroying it; overheal bursts as shadow.",
  "weaponFlavorText": "Two soul powers converge into one. Soul Rend procs heal you for 10% of the damage they deal. Lifesteal hits have a 20% chance to apply Soul Rend. And while both buffs are active, every strike deals an additional 2% of the target's current HP as damage. You are a slow, certain death.",
  "armorFlavorText": "When healing would take you past maximum HP, the excess bursts outward as shadow damage in an AoE — 50% of the overflow, converted to a shockwave. Standing near you during a heal spike is unsurvivable.",
  "components": ["soul_rend", "soul_siphon"],
  "fluxCost": 3,
  "slotCost": 3,
  "weaponEffect": [
    { "stat": "compound.soul_eclipse.active", "op": "flat", "value": 1 },
    { "stat": "compound.soul_eclipse.hpStealOnShadowProc", "op": "flat", "value": 0.10 },
    { "stat": "compound.soul_eclipse.shadowChanceOnLifesteal", "op": "flat", "value": 0.20 },
    { "stat": "compound.soul_eclipse.hpDamageBonus", "op": "flat", "value": 0.02 }
  ],
  "armorEffect": [
    { "stat": "compound.soul_eclipse.active", "op": "flat", "value": 1 },
    { "stat": "compound.soul_eclipse.overhealBurst", "op": "flat", "value": 0.50 }
  ],
  "tags": ["compound", "shadow", "lifesteal", "trigger", "capstone"]
}
```

### Higher `fluxCost` / `slotCost` on Soul Eclipse

Soul Eclipse is a depth-3 capstone and demands more investment. Bumping its `fluxCost` from 2 → 3 and `slotCost` from 2 → 3 reflects that in the forge economy without requiring new balance machinery.

## Implementation Sequence

1. Add the 3 entries to `recipes.json`.
2. Add the 3 entries to `combinations.json`.
3. Run `pnpm -F @alloy/engine test` — Zod schemas validate both files at load; any malformed entry fails the suite.
4. Add unit tests:
   - `recipe-registry.test.ts`: signature lookup for each combo via both `affix:` and `recipe:` identifiers; ordering is symmetric.
   - `combination-engine.test.ts`: combining the right pair triggers the right signature path; output gem has expected `outputBonusEffects`, tags, `recipeDepth`.
   - `data.test.ts`: `getCombination('chance_on_crit','fire_damage') === Combustion`; `getCombination('retribution_aura','cold_damage') === Thornfrost`; `getCombination('soul_rend','soul_siphon') === Soul Eclipse`.
5. No engine-code changes required.

## Testing Strategy

**New engine unit tests:**

- **Combustion:** `combine(chance_on_crit gem, fire_damage gem)` → layer `'signature'`, `recipeId: 'combustion'`, `outputAffixId: 'combustion'`, all 4 `compound.combustion.*` modifiers present. New-discovery on first attempt; repeat recorded as non-discovery.
- **Thornfrost:** Build a Retribution Aura gem (mark `sourceRecipe: 'retribution_aura'`); combine with a `cold_damage` gem; assert signature match on `recipe:retribution_aura` + `affix:cold_damage`. Verify `recipeDepth = retribution_aura.recipeDepth + 1` and tag merge.
- **Soul Eclipse:** Build Soul Rend and Soul Siphon gems; combine; assert recipe match on both `recipe:` components; `recipeDepth = max(parents) + 2`; capstone tag present.
- **Asymmetry / ordering:** For each, swap arg order; verify `findSignatureRecipe` still resolves.
- **No incorrect matches:** `combine(retribution_aura gem, fire_damage gem)` must NOT trigger Thornfrost; falls through to generic/category.

**Existing 23 tests in `combination-engine.test.ts` must still pass** — none of the changes touch engine code paths.

## Balance Notes (First Pass)

Values were chosen to mirror existing compounds in their respective categories:

- **Combustion.chance = 0.50** — higher than the 0.15 proc rate of Ignite-style compounds because `chance_on_crit` is a *nested* chance (already gated on crit rolls). Expected end-to-end proc rate ≈ `crit_chance × 0.50` which for a mid-crit build (~25% crit) lands near 12.5% — comparable to Ignite's 15%.
- **Thornfrost.slowOnThornHit = 0.40** — matches Frostbite's `slowMultiplier` family. 30s duration is mid-range.
- **Soul Eclipse.hpDamageBonus = 0.02** — deliberately small (~same as Necrosis `maxHpPerStack`), because `hpStealOnShadowProc 0.10` and `shadowChanceOnLifesteal 0.20` already compound multiplicatively.

These are *starting* values. Balance iteration should happen after combat hook-up via the simulation tool in `packages/tools/`.

## Non-Goals

- Fixing the `registry.getAffix(compoundId)` crash that prevents any compound gem from being socketed today. Impacts all 31 existing compounds; separate workstream.
- Wiring `compound.*` stat keys into actual duel procs. Currently inert across all compounds.
- Adding new category recipes (`cat_*`) or category rules.
- Rebalancing existing compounds.
- UI work beyond what the existing combine workbench already does (compound + basic combines are already expressible in the UI today; Soul Eclipse relies on the user dragging two compound gems together, which the forge already supports).

## Open Questions

1. **Soul Eclipse is a true capstone** — do we want to signal that to the player somehow (e.g., special "capstone" tag rendered differently in the inspect panel)? The `"capstone"` tag is included in the spec, but the UI currently treats all tags the same. If desired, a follow-up can add a capstone badge — this is trivial and deferred.
2. **Discovery rewards** — the discovery system exists (`DiscoveryState`); should first-time discoveries of these specific combos grant extra flux / life recovery per `lifeRecovery.discoveryThreshold` in balance config? This is existing infrastructure applying uniformly; no change needed for the combos to participate.
