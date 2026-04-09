# Gem System Refactor — Design Specification

**Date:** 2026-04-08
**Status:** Approved (brainstorm complete)
**Approach:** Engine-First, Layered Rebuild

## Overview

Refactor the gem system from "put gem in, make number go higher" to a deep crafting/discovery game centered on combining gems to build synergies, discover recipes, and iterate on builds across a run-based progression loop.

### Goals

1. Make combining gems the core gameplay loop — not just socketing for stats
2. Create a rich discovery space with hundreds of recipes, branching pathways, and multi-depth chains
3. Shift the game loop to a run-based format (Backpack Battles-style async + live head-to-head)
4. Ensure gems are always removable and re-combinable — no "lock-in" anxiety
5. Reward mastery and build planning over luck

### Non-Goals

- Full UI redesign of existing screens (adapt existing screens to new data model)
- Monetization, cosmetics, or account systems
- Cross-run progression Codex (designed for, but not implemented in this phase)

---

## 1. Gem Data Model

### Current Model

```typescript
{ uid: string, affixId: string, tier: 1|2|3|4 }
```

Single axis of progression. Tier determines power. Orbs spawn at all 4 tiers during draft.

### New Model

Two independent progression axes: **Tier** (power level) and **Rarity** (quality multiplier).

```typescript
interface GemInstance {
  uid: string;
  affixId: string;
  tier: 1 | 2 | 3 | 4 | 5;
  rarity: GemRarity;
  sourceRecipe?: string;      // Recipe ID if produced by a signature/category combo
  recipeDepth: number;        // 0 = base gem, 1+ = result of chained combines
  combinable: boolean;        // Derived: see Combinable Flag Derivation below
}

type GemRarity = 'common' | 'magic' | 'rare' | 'epic' | 'legendary';
```

### Power Calculation

```
effectiveValue = baseTierValue[tier] × rarityMultiplier[rarity]
```

| Tier | Base Value | | Rarity | Multiplier |
|------|------------|-|--------|------------|
| 1 | 1.0 | | Common | 1.0x |
| 2 | 2.0 | | Magic | 1.25x |
| 3 | 3.0 | | Rare | 1.5x |
| 4 | 4.0 | | Epic | 2.0x |
| 5 | 5.0 | | Legendary | 3.0x |

A Tier 3 Rare gem (3.0 × 1.5 = 4.5) is stronger than a Tier 4 Common (4.0 × 1.0 = 4.0). Both axes matter.

### Combinable Flag Derivation

The `combinable` flag is a derived boolean, not manually set. It is `false` when ANY of these conditions is true:

```typescript
combinable = !(
  (tier === 5 && rarity === 'legendary') ||  // Both axes maxed
  recipeDepth >= maxRecipeDepth               // End of recipe chain (default max: 3)
)
```

A Tier 5 Legendary gem at depth 0 is NOT combinable (both axes maxed). A depth-3 gem at Common Tier 1 is NOT combinable (max depth reached). A Tier 5 Common depth-0 gem IS combinable (can still rarity-upgrade). A Legendary Tier 1 depth-0 gem IS combinable (can still tier-upgrade).

### Tier Cap

5 tiers (up from 4) — gives more room for the combine-to-progress loop.

### Rarity Cap

Legendary is the 5th rarity. Only reachable through multiple combines in late-run rounds (typically rounds 8-10+). It is a reward for mastery, not a random drop.

---

## 2. Combination System

Three layers, with multi-depth chaining. All layers treat their outputs uniformly — any gem can be input to any recipe that accepts it, regardless of which layer produced it.

### Layer 1 — Signature Recipes

Specific pairs with unique mechanics. These produce gems with special effects not obtainable any other way.

**Examples:**
- Fire + DoT → **Burn** (fire damage per second, unique DoT mechanic)
- Cold + Crit → **Frozen Strike** (crits against slowed targets freeze)
- Lightning + Shadow → **Void Shock** (shadow damage chains on lightning hits)

**Rules:**
- Discovery-based — hidden until the player tries the combination
- Once discovered, remembered for the rest of the run
- Input quality (tier × rarity of both gems) scales the output's power
- Signature gems retain their recipe identity (`sourceRecipe`) and can feed into higher-depth recipes
- Category combo results can be required ingredients for signature recipes

### Layer 2 — Category Combos

When two gems don't match a signature recipe but share or cross affix categories, they produce a thematic result.

**Output Affix Resolution:** The output gem carries the `affixId` of whichever input has the higher effective value (`tier × rarityMultiplier`). On ties, the first input (`gemUid1`) wins. The output gem gains a bonus effect from the category interaction table below.

| Input A Category | Input B Category | Output Bonus | Power Modifier |
|------------------|------------------|-------------|----------------|
| Offensive | Offensive | +20% to the surviving affix's effects | 1.0x (full power) |
| Defensive | Defensive | Secondary defensive stat from sacrificed gem at 30% value | 1.0x |
| Offensive | Defensive | Both effects present — offensive at 80%, defensive at 50% | 0.8x primary |
| Sustain | Any | Surviving gem gains sustain rider (heal/regen) at 40% of sustain gem's value | 1.0x |
| Trigger | Any | Surviving gem gains proc chance from trigger gem at 60% value | 1.0x |
| Utility | Any | Surviving gem gains utility modifier at 50% value | 1.0x |

**Output tier/rarity:** The output inherits the tier and rarity of the higher-quality input gem. It does NOT get a tier or rarity upgrade — the benefit is the bonus effect.

**Rules:**
- Less exciting than signatures but always produce something useful beyond raw stats
- Category combo results can themselves be ingredients for signature recipes
- Output retains category tags from both inputs for synergy detection
- The bonus effect is stored as `outputBonusEffects` on the gem, applied during stat calculation step 5

### Layer 3 — Generic Upgrade (Fallback)

When no signature or category combo applies:

- **Same affix type** → rarity upgrade: output rarity = `max(inputA.rarity, inputB.rarity) + 1`. Output tier = `max(inputA.tier, inputB.tier)`. If output rarity would exceed Legendary, the combine instead performs a tier upgrade (tier + 1, rarity stays Legendary). If both rarity AND tier are at maximum (Legendary + Tier 5), the gem is at its ceiling and `combinable` is `false`.
- **Different affix types** → pick one gem to keep (via `keepGemUid`), it gains +1 tier. If `keepGemUid` is not provided, the engine defaults to keeping the gem with the higher effective value (`tier × rarityMultiplier`); on ties, `gemUid1` wins. The sacrificed gem's rarity provides a bonus: if `sacrificedRarity >= keptRarity`, the tier-up gets the matching rarity bonus (+15% to the new tier's base value). If the kept gem is already Tier 5, the combine instead performs a rarity upgrade (+1 rarity). If both are maxed, `combinable` is `false`.

Always available. Nothing is wasted.

### Combination Quality

The quality of inputs affects the quality of outputs across all layers. The core formula:

```
inputQuality(gem) = tierValues[gem.tier] × rarityMultipliers[gem.rarity]
averageQuality = (inputQuality(gemA) + inputQuality(gemB)) / 2
```

**Signature recipe output determination:**
- Output tier = `floor(averageQuality / 2) + 1`, clamped to [1, 5]
- Output rarity = rarity tier corresponding to `averageQuality` thresholds: <2.0 = Common, <3.5 = Magic, <5.5 = Rare, <8.0 = Epic, ≥8.0 = Legendary
- These thresholds are configurable in `balance.json` as `recipeQualityThresholds`

**Matching rarity bonus:** When both inputs share the same rarity, `averageQuality` gets a +15% bonus before threshold evaluation. This means Rare+Rare produces a noticeably better result than Common+Rare even at the same average tier.

**Depth bonus:** Output effective value is multiplied by `1 + (recipeDepth × depthBonusPerLevel)`. A depth-2 gem at default settings gets a 1.2x multiplier on top of its tier×rarity base.

### Multi-Depth Chaining

Combined gems can be combined further, creating build trees:

```
Depth 0:  [Fire] + [DoT]           →  [Burn]           (signature)
Depth 1:  [Burn] + [Crit]          →  [Searing Strike]  (signature, uses depth-0 result)
Depth 2:  [Searing Strike] + [Lifesteal] → [Vampiric Inferno] (depth-2 chain)
```

- Each depth produces a more powerful and specialized gem
- Deeper recipes require more investment (you consumed 4+ base gems to reach depth 2)
- Legendary rarity is most naturally reached at depth 2-3 with high-quality inputs
- **Max depth per recipe chain: 3** — at the end, the gem hits its ceiling (`combinable: false`)
- Depth bonus: each recipe depth adds a configurable power bonus (default +10%)

### Category Combos as Recipe Ingredients

Category combo results are full gems that can participate in any recipe:

```
[Fire] + [Cold]    →  [Thermal]   (category combo: offensive + offensive)
[Thermal] + [DoT]  →  [Meltdown]  (signature recipe using category result)
```

This means experimentation with category combos can reveal signature recipe paths.

---

## 3. Discovery System

### Per-Run Tracking

```typescript
interface RunDiscoveryState {
  discoveredRecipes: Set<string>;   // Recipe IDs found this run
  attemptedCombos: Set<string>;     // Combo pairs tried (for "already tried" hints)
}
```

- Players start each run with a blank discovery slate
- No recipe book shown upfront — experimentation is the point
- Failed signature attempts fall through to Layer 2 or 3 — nothing is wasted
- Attempted combos are logged so the UI can show "you've tried this pair"
- **Combo key normalization:** Keys in `attemptedCombos` are generated by sorting the two input identifiers alphabetically and joining with `+`. For base gems, use `affixId`. For recipe results, use `sourceRecipe`. Example: `"cold_damage+fire_damage"` or `"burn+crit_chance"`. This ensures order-independence.

### Cross-Run Codex (Future)

Designed for but not implemented in this phase:

- Persistent profile tracks every recipe ever discovered
- Shows what you've found but NOT what you haven't
- Progress indicator: "23 of ??? recipes discovered"
- Run stats: longest streak, deepest chain, most synergies, etc.

The engine's discovery tracking should be structured to support serialization to a profile in the future.

---

## 4. Run Mode & Game Loop

### Run Structure

- Player starts a run with **3 lives** (configurable: 1-5+) and an empty loadout
- Each round: **Draft → Forge → Duel** against an opponent
- Lose a duel → lose a life
- Lose all lives → run ends
- **Goal round: 10** — completing it counts as a "run win" for ranking/rewards
- **Endless mode** starts at round 11 — same loop, tougher opponents, richer pools

### Life System

- Default: 3 lives (configurable in balance.json)
- Lives cap at starting amount (can't stockpile beyond 3)
- Life recovery triggers (configurable):
  - 3-win streak → restore 1 life
  - Reach milestone rounds (e.g., round 6, round 10) → restore 1 life
  - Discover N signature recipes in a single run → restore 1 life

### Draft Pool Scaling

Pools get smaller but higher quality as the run progresses:

| Round | Pool Tiers | Pool Rarities | Pool Size |
|-------|-----------|---------------|-----------|
| 1-2 | Tier 1-2 | Common, Magic | 20 |
| 3-4 | Tier 1-3 | Common, Magic | 18 |
| 5-6 | Tier 2-3 | Common, Magic, Rare | 16 |
| 7-8 | Tier 2-4 | Magic, Rare | 14 |
| 9-10 | Tier 3-4 | Magic, Rare, Epic | 12 |
| 11+ (endless) | Tier 3-5 | Rare, Epic | 10 |

Pool sizes are exact defaults stored in `balance.json` as `poolScaling[]` entries. Each entry specifies `{ roundRange: [min, max], tiers: [min, max], rarities: GemRarity[], poolSize: number }`. These can be tuned without code changes.

### Async Mode (Primary)

- After forging, the player's loadout is serialized as a "payload" (full gem state + item config)
- Server matches the payload against another player's payload using bracket matching
- Duel is simulated server-side; both players watch the result

**Bracket Matching Algorithm:**
- `powerBracket = floor(totalLoadoutQuality / bracketSize)` where `totalLoadoutQuality = sum of effectiveValue for all socketed gems` and `bracketSize` is configurable (default: 5.0)
- Match criteria: `|payloadA.runRound - payloadB.runRound| <= 2` AND `|payloadA.powerBracket - payloadB.powerBracket| <= 1`
- **Widening:** If no match found within 10 seconds, widen round delta to ±4 and bracket delta to ±2. After 30 seconds, match against any available payload.
- **Fallback:** If no human payload is available after 60 seconds, generate a synthetic AI opponent at the appropriate power level using the existing AI controller with a combine strategy scaled to the round number.
- Payloads are stored in a Supabase queue table with TTL of 5 minutes. Matched payloads are consumed (one-time use).

### Live Head-to-Head Mode

- Same run structure as async
- Both players draft from the **same pool** (alternating picks, like current system)
- **Shared pool sizing:** Pool sizes from the scaling table are **doubled** for live mode (e.g., round 1-2 = ~40 gems shared, so each player gets ~20 picks). Tier and rarity distributions follow the same scaling table. This ensures each player's draft volume matches async mode.
- Both players duel each other every round
- Both players have their own life pools (configurable, default 3, host can set 1-5+)
- Loser of each duel loses a life
- Run ends when one player hits 0 lives — the other wins
- If both players are still alive at the goal round, keep going until someone drops (or both agree to draw)

### Weapon/Armor Selection

- Happens at the **start of the first forge phase** (after first draft, before socketing)
- Full weapon roster (7 weapons) and armor roster available — not locked to sword/chainmail
- Selection is **static for the run** by default
- Designed with the door open for future configurability (re-selection, gear as merchant/commodity system)

---

## 5. Item & Slot System

### Slot Structure

- **6 slots per item** (weapon + armor = 12 total) — unchanged
- Combined gems occupy **1 slot** each (not 2 like current compounds)
- This means 12 slots can hold 12 powerful combined gems in a late-run build

### Free Removal

- **Slot locking is removed entirely** — no `socketedRound` tracking
- Any gem can be unsocketed from any slot at any time during the forge phase
- No cost for removal
- The strategic cost is opportunity: time spent with a gem socketed is time not spent combining it

### Forge Actions (Revised)

```typescript
type ForgeAction =
  | { kind: 'socket_gem'; gemUid: string; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'unsocket_gem'; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'combine'; gemUid1: string; gemUid2: string; keepGemUid?: string }
  | { kind: 'select_base_item'; target: 'weapon' | 'armor'; baseItemId: string }
  | { kind: 'set_base_stats'; target: 'weapon' | 'armor'; stat1: BaseStat; stat2: BaseStat }
```

- **No flux gate** — all forge actions are free, unlimited per round
- `combine` accepts a `keepGemUid` for mismatched-affix combines (pick which gem to tier-upgrade). If omitted, engine defaults to keeping the higher-quality gem (see Layer 3 rules).
- `select_base_item` — first forge phase of the run only. Engine rejects this action in rounds 2+.
- `set_base_stats` — first forge phase of the run only. Engine rejects in rounds 2+. Same restriction as current system.
- `upgrade_tier` is removed as a separate action — absorbed into `combine`
- `swap_orb` is removed — use unsocket + socket instead

### Flux as Optional Booster

- Flux is **earned** from wins, discoveries, and milestones (not a per-round budget)
- Spend flux to:
  - **Boost combine** — adds +1 to the output's rarity tier (e.g., what would be Magic becomes Rare). Cannot exceed Legendary.
  - **Reroll pool** — discard current draft pool and generate a new one with the same round parameters
  - **Guarantee rarity** — when combining with a discovered recipe, output rarity is set to one step above what the quality formula would produce (capped at Legendary)
- Entirely optional — a full run works without spending any flux

```typescript
interface FluxConfig {
  rewards: { win: number; discovery: number; milestone: number };
  costs: { boostCombine: number; rerollPool: number; guaranteeRarity: number };
}
```

---

## 6. Synergies as Additive Bonus Layer

### Current System

14 cross-item synergies that check for specific affixes across weapon AND armor. Currently non-functional (`synergy.*` stat keys are filtered out).

### New Behavior

Synergies are an **additive layer on top of gem effects** — they don't replace anything, they add a new bonus effect when gem thresholds are met across the loadout. Similar to Deadlock rogue synergies.

**Example:** Having Fire + Crit + Attack Speed gems across your loadout → unlocks **Assassin** synergy → "First hit is a guaranteed crit, +15% crit damage"

### Synergy Threshold Model

Each synergy defines a `requiredTags` list — affix IDs (or recipe result IDs) that must be present across the player's full loadout (weapon + armor combined). The check is presence-based: at least one socketed gem must carry each required tag.

```typescript
interface SynergyDefinition {
  id: string;
  name: string;
  requiredTags: string[];          // All must be present across loadout
  minGemCount?: number;            // Optional: minimum total gems with matching tags (default: requiredTags.length)
  bonusEffects: StatModifier[];    // Additive effects applied during stat calc step 7
  description: string;             // Human-readable description of the bonus
}
```

**Example definitions:**
- **Assassin**: `requiredTags: ['crit_chance', 'crit_damage', 'attack_speed']` — all three must be present
- **Elementalist**: `requiredTags: ['fire_damage', 'cold_damage', 'lightning_damage']`, `minGemCount: 3` — need all three elements
- **Immolator**: `requiredTags: ['fire_damage', 'dot_multiplier']`, `minGemCount: 3` — need fire on both weapon and armor + DoT

Tier and rarity of the gems do NOT affect synergy activation — only presence matters. The synergy bonus values are fixed per synergy definition (configurable in data).

### Combined Gem Synergy Tags

Combined gems carry tags from their full ancestry for synergy detection:
- A base gem carries its own `affixId` as a tag
- A signature recipe result carries: its own `outputAffixId` + both source component `affixId`s
- A category combo result carries: its surviving `affixId` + the sacrificed gem's `affixId`
- Tags propagate through depth: a depth-2 gem carries tags from all 4+ base gems that went into it

```typescript
function getGemTags(gem: GemInstance, registry: RecipeRegistry): string[] {
  const tags = [gem.affixId];
  if (gem.sourceRecipe) {
    const recipe = registry.get(gem.sourceRecipe);
    tags.push(...recipe.tags);  // Includes all ancestor affix IDs
  }
  return [...new Set(tags)];  // Deduplicated
}
```

Deeper combined gems can satisfy multiple synergy requirements at once — another reward for deep recipe chains.

### Synergy Discovery

Synergies are also discovery-based:
- Players don't see the full synergy list upfront
- Synergies activate (with a visual indicator) when thresholds are met
- Discovered synergies are remembered for the rest of the run
- Discovery is tracked in the same `RunDiscoveryState` alongside recipe discoveries

---

## 7. Stat Calculation Pipeline (Revised)

1. Empty stats
2. Base item stats (weapon/armor choice)
3. Base stat scaling (STR/INT/DEX/VIT allocation)
4. **Gem effects** — for each socketed gem, apply effects scaled by `baseTierValue[tier] × rarityMultiplier[rarity]`
5. **Recipe bonus** — signature and category combo gems get an additional bonus effect (the unique mechanic that makes combining worthwhile beyond raw stats)
6. **Depth bonus** — each recipe depth adds a configurable power bonus (default +10% per depth)
7. **Synergy bonuses** — additive layer, triggers when gem thresholds are met across the loadout
8. Resolve modifiers (flat → percent → override — same resolution order as current)
9. Apply caps (critChance 0-0.95, dodgeChance 0-0.75, blockChance 0-0.75, resistances 0-0.90)

---

## 8. Balance Configuration

All key values live in `balance.json` and are configurable:

```typescript
interface GemBalanceConfig {
  tierValues: number[];                    // [1, 2, 3, 4, 5]
  rarityMultipliers: Record<GemRarity, number>;  // { common: 1.0, magic: 1.25, ... }
  matchingRarityBonus: number;             // 0.15 (bonus when inputs share rarity)
  depthBonusPerLevel: number;              // 0.10 (per recipe depth)
  maxRecipeDepth: number;                  // 3

  poolScaling: PoolScalingEntry[];         // Per-round tier/rarity/size table
  goalRound: number;                       // 10
  endlessStartRound: number;              // 11

  lives: { default: number; min: number; max: number };  // { 3, 1, 5 }
  lifeRecovery: {
    winStreak: number;                     // 3 consecutive wins
    milestoneRounds: number[];             // [6, 10]
    discoveryThreshold: number;            // N recipes discovered
  };

  flux: FluxConfig;                        // Earn rates and spend costs
}
```

### Power Curve Targets

| Phase | Round | Gem Quality | Expected Power | Notes |
|-------|-------|-------------|----------------|-------|
| Early | 1-2 | Common/Magic T1-2 | ~1x | Laying foundations, experimenting |
| Mid | 3-4 | Common/Magic T1-3 | ~2-3x | First combines, basic recipes |
| Mid-Late | 5-6 | Up to Rare T2-3 | ~4-5x | Signature recipes coming online |
| Late | 7-8 | Up to Rare T2-4 | ~6-8x | Depth-1 recipes, 1-2 synergies |
| Goal | 9-10 | Up to Epic T3-4 | ~10-15x | Legendary window, multiple synergies |
| Endless | 11+ | Up to Epic T3-5 | ~20x+ | Full build potential, depth-2+ chains |

---

## 9. Debug Tools & Simulation Updates

### Balance Simulation Tool (`packages/tools/`)

The existing simulation tool needs significant updates to support the new gem system. The server-side simulation runner (`packages/tools/server/`) and its Express API are **extended**, not replaced. The worker pool architecture (thread-based distribution, progress callbacks, cancellation) carries over unchanged. The client-side `tools/useSimulation.ts` (which diverges from the engine's `runSimulation()`) should be **removed** in favor of using the engine's simulation runner exclusively.

**Note:** The existing report routes (`/api/reports/overview`, `/api/reports/affix-stats`, `/api/reports/round-stats`) are extended with new metrics. The simulation routes gain new parameters. The Supabase tables (`simulation_runs`, `match_results`, `match_player_stats`, `match_round_details`) need new columns for run-based data (round number, lives remaining, recipes discovered, gem quality metrics).

**New Simulation Parameters:**
- Run length (number of rounds to simulate)
- Starting lives configuration
- AI combining strategies (greedy, discovery-focused, tier-focused, rarity-focused)
- Recipe discovery rate tracking
- Pool scaling validation per round

**New Report Metrics:**
- Average run length (rounds survived)
- Win rate by round number
- Most effective recipes (win rate when present)
- Recipe discovery rate per run
- Average gem quality (tier × rarity) by round
- Synergy activation frequency
- Legendary gem achievement rate and round achieved
- Power curve actual vs. target comparison
- Combine action frequency per round

**New Simulation Modes:**
- Full run simulation (not just single match)
- Bracket simulation (async matchmaking — match payloads by round/power)
- Recipe balance analysis (identify dominant/useless recipes)
- Pool scaling validation (verify the progression curve feels right)

### Engine Test Harness

A CLI-style test harness in the engine for simulating `draft → forge → combine → duel` cycles without the full UI:

```typescript
interface RunSimulationConfig {
  matchCount: number;
  maxRounds: number;
  startingLives: number;
  aiCombineStrategy: 'greedy' | 'discovery' | 'tier_focused' | 'rarity_focused';
  poolScaling: PoolScalingEntry[];
  seed: number;
}
```

---

## 10. Testing Strategy

### Engine Unit Tests (Vitest)

**New test files needed:**

1. **gem-model.test.ts** — GemInstance creation, tier/rarity validation, power calculation, combinable flag
2. **combination-engine.test.ts** — All three layers:
   - Signature recipe matching and output scaling
   - Category combo resolution
   - Generic upgrade (same-type rarity up, mismatched tier up)
   - Multi-depth chaining up to depth 3
   - Ceiling detection (`combinable: false`)
   - Input quality affects output quality (matching rarity bonus)
   - Category combo results as signature recipe ingredients
3. **recipe-registry.test.ts** — Recipe lookup, discovery tracking, attempted combo logging
4. **discovery-state.test.ts** — Per-run discovery tracking, attempted combo dedup
5. **run-controller.test.ts** — Run lifecycle:
   - Lives system (lose life on duel loss, life recovery triggers)
   - Round progression with pool scaling
   - Goal round detection, endless mode transition
   - Configurable life counts
6. **pool-generator-v2.test.ts** — New pool generation:
   - Tier/rarity distribution per round
   - Pool size scaling
   - No Rare+ gems in rounds 1-2
   - Epic gems appearing in rounds 9-10
7. **forge-v2.test.ts** — Revised forge actions:
   - Free socket/unsocket
   - Combine with keepGemUid
   - Base item selection (first forge only)
   - No flux gate
8. **stat-calculator-v2.test.ts** — Revised pipeline:
   - Gem effects with tier × rarity scaling
   - Recipe bonus application
   - Depth bonus stacking
   - Synergy additive layer
9. **synergy-v2.test.ts** — Synergies as additive bonuses:
   - Combined gem tag inheritance
   - Threshold detection across loadout
   - Synergy discovery tracking
10. **flux-v2.test.ts** — Flux earn/spend:
    - Earn from wins, discoveries, milestones
    - Spend to boost combine, reroll pool, guarantee rarity
11. **async-matchmaking.test.ts** — Payload serialization, bracket matching, round/power similarity

**Update existing test files:**
- `match.test.ts` — Run-based match flow instead of best-of-3
- `duel.test.ts` — Verify stat pipeline changes don't break combat
- `balance.test.ts` — New power curve targets
- `ai.test.ts` — AI combining strategies
- `forge.test.ts` — Updated forge action types
- `data.test.ts` — Updated data counts for new gem/recipe data files

### Client Unit Tests (Vitest)

**New test files:**
1. **runStore.test.ts** — Run state management (lives, round, goal, endless, discovery)
2. **combineStore.test.ts** — Combine UI state (selected gems, preview outcome, confirm)
3. **discoveryStore.test.ts** — Discovery journal UI state

**Update existing test files:**
- `draftStore.test.ts` — Adapt to new gem model (tier + rarity)
- `forgeStore.test.ts` — Free removal, no flux gate, combine action
- `matchStore.test.ts` — Run-based flow instead of best-of-3

### E2E / Playwright Tests

**New spec files:**

1. **run-flow.spec.ts** — Full run lifecycle:
   - R01: Start run, select weapon/armor, first forge
   - R02: Draft pool shows only Common/Magic gems in round 1
   - R03: Combine two gems, verify result in stockpile
   - R04: Socket, unsocket, re-socket with no restrictions
   - R05: Lose a duel, verify life lost
   - R06: Lose all lives, verify run-over screen
   - R07: Win streak restores a life
   - R08: Reach goal round 10, verify "run win" state
   - R09: Enter endless mode at round 11
   - R10: Later rounds show higher-quality gems in pool

2. **gem-combining.spec.ts** — Combination UX:
   - C01: Select two gems to combine, see preview
   - C02: Same-type combine increases rarity
   - C03: Mismatched combine lets you pick which gem to tier-upgrade
   - C04: Signature recipe produces unique gem with recipe indicator
   - C05: Combined gem can be re-combined (multi-depth)
   - C06: Max-depth gem shows as non-combinable
   - C07: Discovery journal updates when new recipe found

3. **async-matchmaking.spec.ts** — Async run flow:
   - A01: Submit payload after forge
   - A02: Matched against opponent, duel plays out
   - A03: Run continues to next round after duel

**Update existing spec files:**
- `draft-acceptance.spec.ts` — Gem cards show rarity + tier (two visual indicators)
- `forge-redesign.spec.ts` — Free removal, combine action, no flux display
- `match-flow.spec.ts` — Run-based flow instead of best-of-3
- `phase-transitions.spec.ts` — New phase sequence with run progression

### Regression Guards

Key regressions to guard against during the refactor:

1. **Stat calculation backward compatibility** — Existing combat formulas (damage, armor, resistance, DOT) must produce identical results for equivalent gem power levels
2. **Deterministic seeding** — All new systems (pool generation, combination outcomes, discovery) must be deterministic given the same seed
3. **Draft gesture system** — The locked-in draft screen gestures (tap, drag, hold, swoop) must work unchanged with the new gem model
4. **Duel simulation** — Combat tick loop, DOTs, triggers, death checks unchanged
5. **AI opponents** — AI must be able to combine gems intelligently (new AI strategies needed)

---

## 11. Migration & Backward Compatibility

### Data Migration

- Current `OrbInstance` → `GemInstance`: tier carries over, rarity defaults to `common` for existing tier 1, `magic` for tier 2, `rare` for tier 3, `epic` for tier 4
- Current `CompoundAffixDef` → becomes signature recipes in the new recipe registry
- Current synergy definitions → updated with additive bonus effects
- `combinations.json` → becomes `recipes.json` with signature, category, and chain definitions

### Breaking Changes

- `OrbInstance` type replaced by `GemInstance`
- `ForgeAction` type updated (removed: `upgrade_tier`, `swap_orb`; added: `unsocket_gem`, `select_base_item`; modified: `combine`)
- Match flow: `MatchController` must support run-based progression (not just best-of-3)
- Pool generation: completely new algorithm with run-round-based scaling
- Stat pipeline: new steps 5-7 (recipe bonus, depth bonus, synergy bonuses)
- Flux system: from per-round budget to earn/spend economy

### Phased Rollout

The engine-first approach means:
1. **Phase 1:** New gem model + combination engine + recipe registry (engine only)
2. **Phase 2:** Run mode + lives system + pool scaling (engine only)
3. **Phase 3:** Async matchmaking + payload system (engine + supabase)
4. **Phase 4:** Client UI updates (draft, forge, duel screens)
5. **Phase 5:** Debug tools + simulation updates
6. **Phase 6:** E2E tests + polish

### Supabase Edge Function Impact

Phase 3 requires these Supabase changes:

**New edge functions:**
- `run-create` — Initialize a new run (create run record, set starting lives)
- `run-submit-payload` — Submit forged loadout for async matchmaking
- `run-match` — Match payloads and simulate duel, return result
- `run-state` — Get current run state (round, lives, discoveries)

**Updated edge functions:**
- `match-create` → updated to support live H2H run creation with configurable lives
- `draft-pick` → unchanged (draft mechanics stay the same)
- `forge-submit` → updated for new ForgeAction types (combine, unsocket, select_base_item)
- `match-state` → extended with run-level state (lives, round, discoveries)

**Deprecated edge functions:**
- `matchmaking` → replaced by `run-match` for async mode

**New database tables/columns:**
- `runs` table — id, player_id, round, lives, starting_lives, status (active/won/lost), created_at
- `run_rounds` table — run_id, round_number, payload_json, opponent_payload_json, duel_result, lives_after
- `payload_queue` table — id, payload_json, run_round, power_bracket, created_at, matched_at, ttl
- `discoveries` table — run_id, recipe_id, round_discovered

---

## Appendix A: Recipe Data Structure

```typescript
interface RecipeComponent {
  kind: 'affix' | 'recipe';  // Distinguishes base affix IDs from recipe result IDs
  id: string;                 // The affixId or recipeId to match against
}

interface RecipeDefinition {
  id: string;
  name: string;
  type: 'signature' | 'category';
  // For signature recipes:
  components?: [RecipeComponent, RecipeComponent];  // Order-independent matching
  // For category recipes:
  categoryRule?: {
    inputA: AffixCategory;
    inputB: AffixCategory;
  };
  outputAffixId: string;          // The affix the result gem carries
  outputBonusEffects: StatModifier[];  // Additional effects beyond base affix
  maxDepthContribution: number;   // How much this recipe adds to depth (usually 1)
  tags: string[];                 // All ancestor affix IDs, for synergy detection
}
```

**Component matching:** When checking if two gems match a signature recipe, the engine checks each component:
- `kind: 'affix'` — matches if the gem's `affixId` equals `component.id`
- `kind: 'recipe'` — matches if the gem's `sourceRecipe` equals `component.id`

Components are order-independent: `[A, B]` matches gems in either order.

## Appendix B: Payload Serialization (Async)

```typescript
interface PlayerPayload {
  loadout: {
    weapon: { baseItemId: string; baseStats: BaseStatAllocation; slots: GemInstance[] };
    armor: { baseItemId: string; baseStats: BaseStatAllocation; slots: GemInstance[] };
  };
  runRound: number;
  powerBracket: number;  // Calculated from total gem quality for matchmaking
}
```

## Appendix C: Glossary

| Term | Definition |
|------|-----------|
| Gem | A socketable item with an affix, tier, and rarity (replaces "Orb") |
| Tier | Power level axis (1-5), upgraded by combining mismatched gems |
| Rarity | Quality axis (Common→Legendary), upgraded by combining same-type gems |
| Signature Recipe | A specific two-gem combination that produces a unique effect |
| Category Combo | A thematic combination based on affix categories |
| Generic Upgrade | Fallback when no recipe applies — same-type = rarity up, mismatched = tier up |
| Recipe Depth | How many chained combinations produced this gem (0 = base, 3 = max) |
| Run | A series of rounds with lives, progressing toward a goal |
| Payload | Serialized loadout state submitted for async matchmaking |
| Flux | Optional booster currency earned from wins/discoveries |
| Codex | (Future) Cross-run recipe discovery profile |
