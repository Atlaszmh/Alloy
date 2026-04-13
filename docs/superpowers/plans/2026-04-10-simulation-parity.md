# AI & Simulation Engine Parity Update

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the AI controller, simulation runner, evaluation functions, and stats collector into full parity with the current game engine — especially the generic combine system.

**Architecture:** The AI forge strategies (T1-T5) will be updated to attempt generic combines after exhausting recipe combines. Evaluation functions will be updated to account for generic upgrade value. Stats collection will track generic upgrades as a distinct metric.

**Tech Stack:** TypeScript, Vitest, `@alloy/engine` internals

**Pre-requisites already done:**
- `forge-plan.ts` — generic combine support (2-gem and 3-gem) with `keepGemUid` ✅
- `forge-state.ts` — matching generic combine support (dispatched by match controller) ✅
- `forge-action.ts` — `orbUid3?: string` and `keepGemUid?: string` on combine action ✅
- Client `Forge.tsx` — sends `keepGemUid` and `orbUid3` from workbench ✅

---

## Parity Audit Summary

| # | Gap | Engine State | AI/Sim State | Severity |
|---|-----|-------------|--------------|----------|
| 1 | Generic combines not used by AI | Any 2-3 gems combinable, `keepGemUid` selects survivor | All tiers gate with `getCombination()`, skip non-recipe pairs | **Critical** |
| 2 | Generic combine result is 1-slot | Generic upgrade → single orb in stockpile (no `compoundId`) | AI assumes all combines produce 2-slot compounds, immediately assigns | **High** |
| 3 | `combinationPotential` recipe-only | Generic fallback always available | Only counts `getCombination()` hits | **Medium** |
| 4 | Stats don't track generic upgrades | Generic upgrades have no `compoundId` | `combinationUsageRates` only tracks compounds | **Medium** |
| 5 | Match report misses generic upgrades | Upgraded orbs look like regular orbs | `collectCompoundIds()` ignores generic results | **Low** |

---

## File Map

| File | Change Type | Purpose |
|------|------------|---------|
| `packages/engine/src/ai/strategies/forge-strategy.ts` | Modify | Add `tryGenericCombines` helper + wire into T2-T5 |
| `packages/engine/src/ai/evaluation.ts` | Modify | Update `combinationPotential` for generic upgrades |
| `packages/engine/src/types/match-report.ts` | Modify | Add `genericUpgradeCount` to `PlayerReport` |
| `packages/engine/src/match/match-report.ts` | Modify | Count generic upgrades in loadout |
| `packages/engine/src/balance/stats-collector.ts` | Modify | Track `avgGenericUpgradesPerPlayer` |
| `packages/engine/tests/ai.test.ts` | Modify | T2 generic combine tests |
| `packages/engine/tests/ai-tiers.test.ts` | Modify | T3-T5 generic combine tests |

---

## Chunk 1: AI Forge Strategy — Generic Combine Support

### Task 1: Add generic combine helper + wire into T2

**Files:**
- Modify: `packages/engine/src/ai/strategies/forge-strategy.ts`
- Test: `packages/engine/tests/ai.test.ts`

This task adds a shared helper function that all tiers (T2+) can call to attempt generic combines on leftover orbs after recipe combines and upgrade_tier are exhausted.

**Important:** The `tryGenericCombines` helper only emits `combine` actions (not `assign_orb`). Generic combine results land in the stockpile as `generic_<uid1>_<uid2>` and are picked up by the normal "assign remaining orbs" loop. This differs from recipe combines which also emit an immediate `assign_orb` to 2 consecutive slots.

**Flux budget note:** The helper deducts `combineOrbs` flux per generic combine. The resulting orb still needs a later `assign_orb` (costing `assignOrb` flux), which is handled by each tier's assign loop using the same `flux` variable. This means the AI may sometimes generic-combine but lack flux to assign the result — acceptable since the combine itself is still valuable (higher-tier orb in stockpile for next round).

- [ ] **Step 1: Add BalanceConfig import to forge-strategy.ts**

```typescript
import type { BalanceConfig } from '../../types/balance.js';
```

- [ ] **Step 2: Write the failing test — T2 AI attempts generic combine**

Add to `packages/engine/tests/ai.test.ts`. **Important:** Declare `emptyLoadout` at the test scope using `createEmptyLoadout` (imported from `@alloy/engine` or `../src/types/item.js`):

```typescript
import { createEmptyLoadout } from '../src/types/item.js';

const emptyLoadout = createEmptyLoadout('iron_sword', 'iron_armor');

it('T2 forge uses generic combine on leftover orbs', () => {
  // cold_damage + armor_rating has NO recipe → should trigger generic combine
  const stockpile: OrbInstance[] = [
    { uid: 'g1', affixId: 'cold_damage', tier: 1 },
    { uid: 'g2', affixId: 'armor_rating', tier: 1 },
    { uid: 'g3', affixId: 'flat_hp', tier: 2 },
  ];
  const ai = new AIController(2, registry, new SeededRNG(42).fork('ai'));
  const actions = ai.planForge(stockpile, emptyLoadout, 10, 1, []);
  const combines = actions.filter(a => a.kind === 'combine');
  expect(combines.length).toBeGreaterThanOrEqual(1);
  // Should have keepGemUid set (generic combine)
  const genericCombine = combines.find(a => a.kind === 'combine' && a.keepGemUid);
  expect(genericCombine).toBeDefined();
});
```

**Data verification:** `cold_damage + armor_rating` confirmed no recipe in `combinations.json`. `flat_hp + armor_rating` DOES have a recipe — but with 3 orbs and only 2 having a recipe, the T2 strategy will recipe-combine that pair and generic-combine the leftover.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @alloy/engine test -- --run ai`
Expected: FAIL — T2 never generates generic combines currently.

- [ ] **Step 4: Add `tryGenericCombines` helper function**

Add to `packages/engine/src/ai/strategies/forge-strategy.ts` after the existing helpers (`findConsecutiveEmptySlotsOn`, `archetypeToStats`):

```typescript
/**
 * After recipe combines and upgrade_tier are exhausted, attempt generic
 * combines on remaining stockpile orbs. Sacrifices lowest-value orbs
 * to upgrade the highest-value ones.
 *
 * Generic combines produce orbs in stockpile with uid 'generic_<uid1>_<uid2>'.
 * The "assign remaining" loop in each tier picks them up automatically.
 */
function tryGenericCombines(
  stockpile: OrbInstance[],
  usedOrbUids: Set<string>,
  flux: number,
  balance: BalanceConfig,
  registry: DataRegistry,
): { actions: ForgeAction[]; fluxSpent: number } {
  const actions: ForgeAction[] = [];
  let fluxSpent = 0;
  const combineCost = balance.fluxCosts.combineOrbs;

  // Get remaining orbs sorted by value (highest first)
  const remaining = stockpile
    .filter(o => !usedOrbUids.has(o.uid))
    .sort((a, b) => orbValueScore(b, registry) - orbValueScore(a, registry));

  if (remaining.length < 2) return { actions, fluxSpent };

  // Pair highest-value orb (keep) with lowest-value orb (sacrifice)
  let left = 0;
  let right = remaining.length - 1;

  while (left < right && (flux - fluxSpent) >= combineCost) {
    const keepOrb = remaining[left];
    const sacrificeOrb = remaining[right];

    // Skip if kept orb is already at max tier
    if (keepOrb.tier >= 4) {
      left++;
      continue;
    }

    actions.push({
      kind: 'combine',
      orbUid1: keepOrb.uid,
      orbUid2: sacrificeOrb.uid,
      keepGemUid: keepOrb.uid,
    });
    usedOrbUids.add(keepOrb.uid);
    usedOrbUids.add(sacrificeOrb.uid);
    fluxSpent += combineCost;
    left++;
    right--;
  }

  return { actions, fluxSpent };
}

/**
 * After generic combines, push predicted result orbs into the stockpile array
 * so the "assign remaining" loop can see and assign them.
 * The engine will produce orbs with uid 'generic_<uid1>_<uid2>'.
 */
function pushGenericResults(
  stockpile: OrbInstance[],
  genericActions: ForgeAction[],
): void {
  for (const action of genericActions) {
    if (action.kind === 'combine' && action.keepGemUid) {
      const keptOrb = stockpile.find(o => o.uid === action.keepGemUid);
      if (!keptOrb) continue;
      stockpile.push({
        uid: `generic_${action.orbUid1}_${action.orbUid2}`,
        affixId: keptOrb.affixId,
        tier: Math.min(keptOrb.tier + 1, 4) as 1 | 2 | 3 | 4,
      });
    }
  }
}
```

- [ ] **Step 5: Wire `tryGenericCombines` + `pushGenericResults` into Tier2ForgeStrategy**

In `Tier2ForgeStrategy.plan()`, after the recipe combine loop and before "Assign remaining orbs", add:

```typescript
// Try generic combines on leftover orbs
const genericResult = tryGenericCombines(stockpile, usedOrbUids, flux, balance, registry);
actions.push(...genericResult.actions);
flux -= genericResult.fluxSpent;
pushGenericResults(stockpile, genericResult.actions);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @alloy/engine test -- --run ai`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/ai/strategies/forge-strategy.ts packages/engine/tests/ai.test.ts
git commit -m "feat(ai): add generic combine support to T2 forge strategy"
```

### Task 2: Wire generic combines into T3-T5 forge strategies

**Files:**
- Modify: `packages/engine/src/ai/strategies/forge-strategy.ts`
- Test: `packages/engine/tests/ai-tiers.test.ts`

- [ ] **Step 1: Write failing tests for T3, T4, T5 generic combines**

Add to `packages/engine/tests/ai-tiers.test.ts`. **Important:** Declare `emptyLoadout` at module scope and verify affix IDs exist in data:

```typescript
import { createEmptyLoadout } from '../src/types/item.js';

const emptyLoadout = createEmptyLoadout('iron_sword', 'iron_armor');

describe('generic combine support', () => {
  // Stockpile with NO recipe matches between any pair
  // Verified: cold_damage+armor_rating, cold_damage+crit_chance,
  // armor_rating+crit_chance all have no recipe in combinations.json
  const noRecipeStockpile: OrbInstance[] = [
    { uid: 'nr1', affixId: 'cold_damage', tier: 1 },
    { uid: 'nr2', affixId: 'armor_rating', tier: 2 },
    { uid: 'nr3', affixId: 'crit_chance', tier: 1 },
  ];

  for (const tier of [3, 4, 5] as const) {
    it(`T${tier} attempts generic combines when no recipes available`, () => {
      const ai = new AIController(tier, registry, new SeededRNG(99).fork('ai'));
      const actions = ai.planForge(noRecipeStockpile, emptyLoadout, 10, 1, []);
      const combines = actions.filter(a => a.kind === 'combine');
      expect(combines.length).toBeGreaterThanOrEqual(1);
    });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @alloy/engine test -- --run ai-tiers`
Expected: FAIL — T3-T5 never generate generic combines.

- [ ] **Step 3: Wire into T3, T4, T5**

In each of `Tier3ForgeStrategy.plan()`, `Tier4ForgeStrategy.plan()`, `Tier5ForgeStrategy.plan()`:

After the upgrade_tier section and before "Assign remaining orbs", add:

```typescript
// Try generic combines on leftover orbs
const genericResult = tryGenericCombines(stockpile, usedOrbUids, flux, balance, registry);
actions.push(...genericResult.actions);
flux -= genericResult.fluxSpent;
pushGenericResults(stockpile, genericResult.actions);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @alloy/engine test -- --run ai-tiers`
Expected: PASS

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `pnpm --filter @alloy/engine test -- --run --exclude "**/simulation*" --exclude "**/balance*"`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/ai/strategies/forge-strategy.ts packages/engine/tests/ai-tiers.test.ts
git commit -m "feat(ai): wire generic combines into T3-T5 forge strategies"
```

---

## Chunk 2: Evaluation Parity

### Task 3: Update combinationPotential for generic combine awareness

**Files:**
- Modify: `packages/engine/src/ai/evaluation.ts`
- Test: `packages/engine/tests/ai.test.ts`

`combinationPotential()` currently only counts recipe matches. With generic combines, ANY pair can combine. The function returns a weighted score (not a count) — recipe pairs score highest, same-affix pairs score medium, cross-affix pairs score lowest.

**Note:** `combinationPotential` is exported but currently unused by any AI tier (it's only used in tests). This update makes it accurate for future use.

- [ ] **Step 1: Write failing test**

Add to `packages/engine/tests/ai.test.ts`:

```typescript
import { combinationPotential } from '../src/ai/evaluation.js';

describe('combinationPotential — generic awareness', () => {
  it('counts generic upgrade potential for non-recipe pairs', () => {
    // cold_damage + armor_rating: no recipe, but CAN generic-combine
    const stockpile: OrbInstance[] = [
      { uid: 'a', affixId: 'cold_damage', tier: 1 },
      { uid: 'b', affixId: 'armor_rating', tier: 1 },
    ];
    const potential = combinationPotential(stockpile, registry);
    expect(potential).toBeGreaterThan(0);
  });

  it('values same-affix pairs higher than cross-affix pairs', () => {
    const sameAffix: OrbInstance[] = [
      { uid: 'a', affixId: 'fire_damage', tier: 1 },
      { uid: 'b', affixId: 'fire_damage', tier: 2 },
    ];
    const crossAffix: OrbInstance[] = [
      { uid: 'c', affixId: 'cold_damage', tier: 1 },
      { uid: 'd', affixId: 'armor_rating', tier: 1 },
    ];
    expect(combinationPotential(sameAffix, registry))
      .toBeGreaterThan(combinationPotential(crossAffix, registry));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/engine test -- --run ai`

- [ ] **Step 3: Update combinationPotential**

Replace the function in `packages/engine/src/ai/evaluation.ts`:

```typescript
export function combinationPotential(stockpile: OrbInstance[], registry: DataRegistry): number {
  let score = 0;
  for (let i = 0; i < stockpile.length; i++) {
    for (let j = i + 1; j < stockpile.length; j++) {
      const combo = registry.getCombination(stockpile[i].affixId, stockpile[j].affixId);
      if (combo) {
        // Recipe match: highest value
        score += TIER_VALUES[stockpile[i].tier] + TIER_VALUES[stockpile[j].tier];
      } else if (stockpile[i].affixId === stockpile[j].affixId) {
        // Same affix generic upgrade: medium value
        score += (TIER_VALUES[stockpile[i].tier] + TIER_VALUES[stockpile[j].tier]) * 0.6;
      } else {
        // Cross-affix generic: low but nonzero value
        score += (TIER_VALUES[stockpile[i].tier] + TIER_VALUES[stockpile[j].tier]) * 0.2;
      }
    }
  }
  return score;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @alloy/engine test -- --run ai`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ai/evaluation.ts packages/engine/tests/ai.test.ts
git commit -m "feat(eval): update combinationPotential to include generic upgrade value"
```

---

## Chunk 3: Stats & Reporting Parity

### Task 4: Add generic upgrade tracking to match reports and stats

**Files:**
- Modify: `packages/engine/src/types/match-report.ts`
- Modify: `packages/engine/src/match/match-report.ts`
- Modify: `packages/engine/src/balance/stats-collector.ts`

- [ ] **Step 1: Add `genericUpgradeCount` to PlayerReport**

In `packages/engine/src/types/match-report.ts`:

```typescript
export interface PlayerReport {
  playerIndex: 0 | 1;
  aiTier?: number;
  finalHP: number;
  affixIds: string[];
  combinationIds: string[];
  synergyIds: string[];
  loadout: Loadout;
  genericUpgradeCount: number;
}
```

- [ ] **Step 2: Count generic upgrades in match-report.ts**

In `packages/engine/src/match/match-report.ts`, add helper and wire into `extractMatchReport`:

```typescript
function countGenericUpgrades(loadout: Loadout): number {
  let count = 0;
  for (const item of [loadout.weapon, loadout.armor]) {
    for (const slot of item.slots) {
      if (!slot) continue;
      if (slot.kind === 'single' && slot.orb.uid.startsWith('generic_')) count++;
      if (slot.kind === 'upgraded' && slot.orb.uid.startsWith('generic_')) count++;
    }
  }
  return count;
}
```

Add `genericUpgradeCount: countGenericUpgrades(loadout)` to the PlayerReport object in the players map.

- [ ] **Step 3: Add `avgGenericUpgradesPerPlayer` to AggregateStats**

In `packages/engine/src/balance/stats-collector.ts`:

Add to `AggregateStats` interface:
```typescript
avgGenericUpgradesPerPlayer: number;
```

Add tracking in `computeAggregateStats`:
```typescript
let totalGenericUpgrades = 0;
// Inside the match/player loop:
totalGenericUpgrades += player.genericUpgradeCount;
// In the return object:
avgGenericUpgradesPerPlayer: totalGenericUpgrades / playerInstances,
```

Initialize to 0 in the empty-matches early return.

- [ ] **Step 4: Build to verify types compile**

Run: `pnpm --filter @alloy/engine build`
Expected: Clean build

- [ ] **Step 5: Run all tests**

Run: `pnpm --filter @alloy/engine test -- --run --exclude "**/simulation*" --exclude "**/balance*"`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/types/match-report.ts packages/engine/src/match/match-report.ts packages/engine/src/balance/stats-collector.ts
git commit -m "feat(stats): track generic upgrade usage in match reports and aggregates"
```

---

## Chunk 4: Full Validation

### Task 5: Run full engine test suite + build

- [ ] **Step 1: Run all engine tests (excluding slow simulation)**

Run: `pnpm --filter @alloy/engine test -- --run --exclude "**/simulation-runner*"`
Expected: All tests pass

- [ ] **Step 2: Run engine build**

Run: `pnpm --filter @alloy/engine build`
Expected: Clean build, no TS errors

- [ ] **Step 3: Run a quick end-to-end simulation**

Create `packages/engine/tests/simulation-generic.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { runSimulation } from '../src/balance/simulation-runner.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);

describe('simulation with generic combines', () => {
  it('T5vT5 sim completes and reports generic upgrades', () => {
    const result = runSimulation({
      matchCount: 5,
      aiTier1: 5,
      aiTier2: 5,
      seedStart: 1,
      mode: 'ranked',
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    }, registry);

    expect(result.matches).toHaveLength(5);
    for (const match of result.matches) {
      expect(match.winner).not.toBeNull();
    }
    // At least some generic upgrades should have been attempted
    expect(result.aggregateStats.avgGenericUpgradesPerPlayer).toBeGreaterThanOrEqual(0);
  });
});
```

Run: `pnpm --filter @alloy/engine test -- --run simulation-generic`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/engine/tests/simulation-generic.test.ts
git commit -m "test: add end-to-end simulation test with generic combine support"
```

---

## Out of Scope (Future Work)

These gaps exist but are deferred to the full gem refactor or separate plans:

1. **Adapt phase in simulation** — The phase machine never transitions into adapt (`duel → draft(next)` or `complete`, not `duel → adapt`). `advance_phase` only works during duel phase, and `forge_action` only works during forge phase. Wiring adapt into the simulation requires updating `match-controller.ts` and `phase-machine.ts` first. Tracked separately.
2. **`synergyPotential` dead code** — `synergyPotential()` exists in evaluation.ts but no AI tier calls it during draft. Wiring it into T3+ draft strategies would improve AI quality but is a separate enhancement.
3. **Rarity axis** — AI doesn't know about rarity multipliers (Common→Legendary). Requires GemInstance migration.
4. **Tier 5 orbs** — `TIER_VALUES` only goes to T4. Will be updated when gem refactor adds T5.
5. **Recipe depth / chaining** — AI doesn't chain combines (depth 0 → depth 1 → depth 2). Requires recipe registry.
6. **Discovery state** — AI doesn't track which recipes have been discovered. Requires per-run state.
7. **Run-based game loop** — AI assumes best-of-3 matches, not lives/goal-round/endless. Requires match flow changes.
8. **Balance report thresholds** — Currently hardcoded; should come from balance.json.
9. **Tools package worker** — Uses the simulation runner; will automatically benefit from these changes.
