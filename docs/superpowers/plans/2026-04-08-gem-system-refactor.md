# Gem System Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the gem system from single-axis orbs to a two-axis (tier + rarity) gem model with a three-layer combination system, run-based game loop, and async matchmaking.

**Architecture:** Engine-first, layered rebuild. Phase 1-2 rebuild core engine types and game logic. Phase 3 adds server-side async matchmaking. Phase 4 updates client UI. Phase 5-6 update tooling and E2E tests. Each phase produces working, testable software independently.

**Tech Stack:** TypeScript 5.7+, Vitest 3.x, Playwright, React 19 + Zustand 5, Supabase Edge Functions (Deno), PixiJS 8, pnpm monorepo.

**Spec:** `docs/superpowers/specs/2026-04-08-gem-system-refactor-design.md`

---

## Chunk 1: Engine — New Gem Model + Combination Engine

This chunk replaces the `OrbInstance` type with `GemInstance`, introduces the two-axis progression model (tier + rarity), builds the three-layer combination engine, and creates the recipe registry. All work is in `packages/engine/`.

### File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/types/gem.ts` | `GemInstance`, `GemRarity`, power calculation, `combinable` derivation, `outputBonusEffects`, `tags` |
| Create | `src/combine/combination-engine.ts` | Three-layer combine logic: signature → category → generic |
| Create | `src/combine/recipe-registry.ts` | Recipe lookup, registration, component matching |
| Create | `src/combine/discovery-state.ts` | Per-run discovery tracking, attempted combo logging |
| Create | `src/combine/combine-quality.ts` | Quality formulas: averageQuality, matching rarity bonus, output tier/rarity |
| Create | `src/data/recipes.json` | Signature + category recipe definitions (replaces combinations.json) |
| Create | `tests/gem-model.test.ts` | GemInstance creation, power calc, combinable flag |
| Create | `tests/combination-engine.test.ts` | All three combination layers, multi-depth chaining |
| Create | `tests/recipe-registry.test.ts` | Recipe lookup, discovery tracking |
| Create | `tests/combine-quality.test.ts` | Quality formulas, matching rarity bonus |
| Modify | `src/types/index.ts` | Re-export new gem types, deprecate orb types |
| Modify | `src/data/registry.ts` | Add recipe registry to DataRegistry |
| Modify | `src/data/loader.ts` | Load recipes.json |
| Modify | `src/data/schemas.ts` | Zod schemas for recipes, gem types |
| Modify | `src/index.ts` | Export new combine modules |

### Task 1: GemInstance Type + Power Calculation

**Files:**
- Create: `packages/engine/src/types/gem.ts`
- Create: `packages/engine/tests/gem-model.test.ts`

- [ ] **Step 1: Write failing tests for GemInstance**

```typescript
// packages/engine/tests/gem-model.test.ts
import { describe, it, expect } from 'vitest';
import {
  createGem,
  calculateEffectiveValue,
  isCombinable,
  type GemInstance,
  type GemRarity,
} from '../src/types/gem.js';

describe('GemInstance', () => {
  describe('createGem', () => {
    it('creates a base gem with defaults', () => {
      const gem = createGem('gem_1', 'fire_damage', 1, 'common');
      expect(gem.uid).toBe('gem_1');
      expect(gem.affixId).toBe('fire_damage');
      expect(gem.tier).toBe(1);
      expect(gem.rarity).toBe('common');
      expect(gem.recipeDepth).toBe(0);
      expect(gem.combinable).toBe(true);
      expect(gem.tags).toEqual(['fire_damage']);
      expect(gem.outputBonusEffects).toBeUndefined();
    });

    it('creates a recipe result gem', () => {
      const gem = createGem('gem_2', 'burn', 2, 'magic', {
        sourceRecipe: 'burn',
        recipeDepth: 1,
      });
      expect(gem.sourceRecipe).toBe('burn');
      expect(gem.recipeDepth).toBe(1);
      expect(gem.combinable).toBe(true);
    });
  });

  describe('calculateEffectiveValue', () => {
    it('returns tier * rarity multiplier', () => {
      // Tier 1 Common: 1.0 * 1.0 = 1.0
      expect(calculateEffectiveValue(1, 'common')).toBe(1.0);
      // Tier 3 Rare: 3.0 * 1.5 = 4.5
      expect(calculateEffectiveValue(3, 'rare')).toBe(4.5);
      // Tier 5 Legendary: 5.0 * 3.0 = 15.0
      expect(calculateEffectiveValue(5, 'legendary')).toBe(15.0);
    });

    it('Tier 3 Rare > Tier 4 Common', () => {
      expect(calculateEffectiveValue(3, 'rare'))
        .toBeGreaterThan(calculateEffectiveValue(4, 'common'));
    });
  });

  describe('isCombinable', () => {
    it('returns true for base gem', () => {
      expect(isCombinable({ tier: 1, rarity: 'common', recipeDepth: 0 })).toBe(true);
    });

    it('returns false when both axes maxed', () => {
      expect(isCombinable({ tier: 5, rarity: 'legendary', recipeDepth: 0 })).toBe(false);
    });

    it('returns false when at max recipe depth', () => {
      expect(isCombinable({ tier: 1, rarity: 'common', recipeDepth: 3 })).toBe(false);
    });

    it('returns true for max tier but low rarity', () => {
      expect(isCombinable({ tier: 5, rarity: 'common', recipeDepth: 0 })).toBe(true);
    });

    it('returns true for legendary but low tier', () => {
      expect(isCombinable({ tier: 1, rarity: 'legendary', recipeDepth: 0 })).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/gem-model.test.ts`
Expected: FAIL — module `../src/types/gem.js` not found

- [ ] **Step 3: Implement GemInstance type and helper functions**

```typescript
// packages/engine/src/types/gem.ts

export type GemRarity = 'common' | 'magic' | 'rare' | 'epic' | 'legendary';

export const RARITY_ORDER: GemRarity[] = ['common', 'magic', 'rare', 'epic', 'legendary'];

export const RARITY_MULTIPLIERS: Record<GemRarity, number> = {
  common: 1.0,
  magic: 1.25,
  rare: 1.5,
  epic: 2.0,
  legendary: 3.0,
};

export const TIER_VALUES = [0, 1.0, 2.0, 3.0, 4.0, 5.0] as const; // index 0 unused

export const MAX_TIER = 5;
export const MAX_RECIPE_DEPTH = 3;

export interface GemInstance {
  uid: string;
  affixId: string;
  tier: 1 | 2 | 3 | 4 | 5;
  rarity: GemRarity;
  sourceRecipe?: string;
  recipeDepth: number;
  combinable: boolean;
  tags: string[];                    // All ancestor affix IDs for synergy detection
  outputBonusEffects?: StatModifier[]; // Bonus effects from signature/category recipes
}

export function calculateEffectiveValue(
  tier: number,
  rarity: GemRarity,
): number {
  return TIER_VALUES[tier] * RARITY_MULTIPLIERS[rarity];
}

export function isCombinable(gem: {
  tier: number;
  rarity: GemRarity;
  recipeDepth: number;
}): boolean {
  if (gem.recipeDepth >= MAX_RECIPE_DEPTH) return false;
  if (gem.tier >= MAX_TIER && gem.rarity === 'legendary') return false;
  return true;
}

export function createGem(
  uid: string,
  affixId: string,
  tier: 1 | 2 | 3 | 4 | 5,
  rarity: GemRarity,
  opts?: {
    sourceRecipe?: string;
    recipeDepth?: number;
    tags?: string[];
    outputBonusEffects?: StatModifier[];
  },
): GemInstance {
  const recipeDepth = opts?.recipeDepth ?? 0;
  return {
    uid,
    affixId,
    tier,
    rarity,
    sourceRecipe: opts?.sourceRecipe,
    recipeDepth,
    combinable: isCombinable({ tier, rarity, recipeDepth }),
    tags: opts?.tags ?? [affixId],
    outputBonusEffects: opts?.outputBonusEffects,
  };
}

/** Derive synergy-relevant tags from a gem's full ancestry */
export function getGemTags(gem: GemInstance): string[] {
  return [...new Set(gem.tags)];
}

export function nextRarity(rarity: GemRarity): GemRarity | null {
  const idx = RARITY_ORDER.indexOf(rarity);
  return idx < RARITY_ORDER.length - 1 ? RARITY_ORDER[idx + 1] : null;
}

export function rarityIndex(rarity: GemRarity): number {
  return RARITY_ORDER.indexOf(rarity);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/gem-model.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/types/gem.ts packages/engine/tests/gem-model.test.ts
git commit -m "feat(engine): add GemInstance type with two-axis progression model"
```

---

### Task 2: Combine Quality Formulas

**Files:**
- Create: `packages/engine/src/combine/combine-quality.ts`
- Create: `packages/engine/tests/combine-quality.test.ts`

- [ ] **Step 1: Write failing tests for quality formulas**

```typescript
// packages/engine/tests/combine-quality.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeAverageQuality,
  determineOutputTierRarity,
  applyMatchingRarityBonus,
} from '../src/combine/combine-quality.js';
import { createGem } from '../src/types/gem.js';

describe('combine-quality', () => {
  describe('computeAverageQuality', () => {
    it('averages two gem effective values', () => {
      const a = createGem('a', 'fire_damage', 1, 'common');  // 1.0
      const b = createGem('b', 'cold_damage', 3, 'rare');     // 4.5
      expect(computeAverageQuality(a, b)).toBe(2.75);
    });
  });

  describe('applyMatchingRarityBonus', () => {
    it('adds 15% when rarities match', () => {
      expect(applyMatchingRarityBonus(4.0, true, 0.15)).toBeCloseTo(4.6);
    });

    it('no bonus when rarities differ', () => {
      expect(applyMatchingRarityBonus(4.0, false, 0.15)).toBe(4.0);
    });
  });

  describe('determineOutputTierRarity', () => {
    it('low quality produces low tier common', () => {
      const result = determineOutputTierRarity(1.0);
      expect(result.tier).toBe(1);
      expect(result.rarity).toBe('common');
    });

    it('high quality produces high tier epic', () => {
      const result = determineOutputTierRarity(7.5);
      expect(result.tier).toBe(4);
      expect(result.rarity).toBe('epic');
    });

    it('very high quality can produce legendary', () => {
      const result = determineOutputTierRarity(10.0);
      expect(result.tier).toBe(5);
      expect(result.rarity).toBe('legendary');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/combine-quality.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement quality formulas**

```typescript
// packages/engine/src/combine/combine-quality.ts
import {
  type GemInstance,
  type GemRarity,
  calculateEffectiveValue,
  RARITY_ORDER,
} from '../types/gem.js';

// Default thresholds — configurable via balance.json
const DEFAULT_RARITY_THRESHOLDS: Record<GemRarity, number> = {
  common: 0,
  magic: 2.0,
  rare: 3.5,
  epic: 5.5,
  legendary: 8.0,
};

export function computeAverageQuality(a: GemInstance, b: GemInstance): number {
  const qa = calculateEffectiveValue(a.tier, a.rarity);
  const qb = calculateEffectiveValue(b.tier, b.rarity);
  return (qa + qb) / 2;
}

export function applyMatchingRarityBonus(
  avgQuality: number,
  raritiesMatch: boolean,
  bonusPct: number,
): number {
  return raritiesMatch ? avgQuality * (1 + bonusPct) : avgQuality;
}

export function determineOutputTierRarity(
  quality: number,
  thresholds: Record<GemRarity, number> = DEFAULT_RARITY_THRESHOLDS,
): { tier: 1 | 2 | 3 | 4 | 5; rarity: GemRarity } {
  const tier = Math.min(5, Math.max(1, Math.floor(quality / 2) + 1)) as 1 | 2 | 3 | 4 | 5;

  let rarity: GemRarity = 'common';
  for (const r of RARITY_ORDER) {
    if (quality >= thresholds[r]) {
      rarity = r;
    }
  }

  return { tier, rarity };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/combine-quality.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/combine/combine-quality.ts packages/engine/tests/combine-quality.test.ts
git commit -m "feat(engine): add combination quality formulas"
```

---

### Task 3: Recipe Registry + Data

**Files:**
- Create: `packages/engine/src/combine/recipe-registry.ts`
- Create: `packages/engine/src/data/recipes.json`
- Create: `packages/engine/tests/recipe-registry.test.ts`
- Modify: `packages/engine/src/data/schemas.ts`
- Modify: `packages/engine/src/data/loader.ts`
- Modify: `packages/engine/src/data/registry.ts`

- [ ] **Step 1: Write failing tests for recipe registry**

```typescript
// packages/engine/tests/recipe-registry.test.ts
import { describe, it, expect } from 'vitest';
import { RecipeRegistry } from '../src/combine/recipe-registry.js';
import { createGem } from '../src/types/gem.js';

const TEST_RECIPES = [
  {
    id: 'burn',
    name: 'Burn',
    type: 'signature' as const,
    components: [
      { kind: 'affix' as const, id: 'fire_damage' },
      { kind: 'affix' as const, id: 'dot_multiplier' },
    ],
    outputAffixId: 'burn',
    outputBonusEffects: [{ stat: 'fireDotDamage', op: 'flat' as const, value: 5 }],
    maxDepthContribution: 1,
    tags: ['fire_damage', 'dot_multiplier'],
  },
  {
    id: 'searing_strike',
    name: 'Searing Strike',
    type: 'signature' as const,
    components: [
      { kind: 'recipe' as const, id: 'burn' },
      { kind: 'affix' as const, id: 'crit_chance' },
    ],
    outputAffixId: 'searing_strike',
    outputBonusEffects: [{ stat: 'critBurnDamage', op: 'flat' as const, value: 10 }],
    maxDepthContribution: 1,
    tags: ['fire_damage', 'dot_multiplier', 'crit_chance'],
  },
];

describe('RecipeRegistry', () => {
  it('finds a signature recipe by component affixes', () => {
    const registry = new RecipeRegistry(TEST_RECIPES);
    const gemA = createGem('a', 'fire_damage', 1, 'common');
    const gemB = createGem('b', 'dot_multiplier', 1, 'common');
    const match = registry.findSignatureRecipe(gemA, gemB);
    expect(match?.id).toBe('burn');
  });

  it('matches components in either order', () => {
    const registry = new RecipeRegistry(TEST_RECIPES);
    const gemA = createGem('a', 'dot_multiplier', 1, 'common');
    const gemB = createGem('b', 'fire_damage', 1, 'common');
    const match = registry.findSignatureRecipe(gemA, gemB);
    expect(match?.id).toBe('burn');
  });

  it('matches recipe-result components', () => {
    const registry = new RecipeRegistry(TEST_RECIPES);
    const burnGem = createGem('a', 'burn', 2, 'magic', { sourceRecipe: 'burn', recipeDepth: 1 });
    const critGem = createGem('b', 'crit_chance', 1, 'common');
    const match = registry.findSignatureRecipe(burnGem, critGem);
    expect(match?.id).toBe('searing_strike');
  });

  it('returns null when no recipe matches', () => {
    const registry = new RecipeRegistry(TEST_RECIPES);
    const gemA = createGem('a', 'fire_damage', 1, 'common');
    const gemB = createGem('b', 'cold_damage', 1, 'common');
    expect(registry.findSignatureRecipe(gemA, gemB)).toBeNull();
  });

  it('gets recipe by id', () => {
    const registry = new RecipeRegistry(TEST_RECIPES);
    expect(registry.get('burn')?.name).toBe('Burn');
  });
});
```

**Note:** `RecipeRegistry` must also implement `findCategoryRecipe(catA: string, catB: string)` which looks up category-type recipes by their `categoryRule`. The "any" wildcard matches any category. Add tests for this method alongside the category combo tests in `combination-engine.test.ts`.
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/recipe-registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement RecipeRegistry**

```typescript
// packages/engine/src/combine/recipe-registry.ts
import type { GemInstance } from '../types/gem.js';
import type { StatModifier } from '../types/affix.js';

export interface RecipeComponent {
  kind: 'affix' | 'recipe';
  id: string;
}

export interface RecipeDefinition {
  id: string;
  name: string;
  type: 'signature' | 'category';
  components?: [RecipeComponent, RecipeComponent];
  categoryRule?: { inputA: string; inputB: string };
  outputAffixId: string;
  outputBonusEffects: StatModifier[];
  maxDepthContribution: number;
  tags: string[];
}

export class RecipeRegistry {
  private recipes: Map<string, RecipeDefinition>;
  private signatureRecipes: RecipeDefinition[];

  constructor(definitions: RecipeDefinition[]) {
    this.recipes = new Map(definitions.map((r) => [r.id, r]));
    this.signatureRecipes = definitions.filter((r) => r.type === 'signature' && r.components);
  }

  get(id: string): RecipeDefinition | undefined {
    return this.recipes.get(id);
  }

  getAll(): RecipeDefinition[] {
    return [...this.recipes.values()];
  }

  findSignatureRecipe(gemA: GemInstance, gemB: GemInstance): RecipeDefinition | null {
    for (const recipe of this.signatureRecipes) {
      if (!recipe.components) continue;
      if (this.matchesComponents(gemA, gemB, recipe.components)) {
        return recipe;
      }
    }
    return null;
  }

  private matchesComponents(
    gemA: GemInstance,
    gemB: GemInstance,
    components: [RecipeComponent, RecipeComponent],
  ): boolean {
    return (
      (this.gemMatchesComponent(gemA, components[0]) &&
        this.gemMatchesComponent(gemB, components[1])) ||
      (this.gemMatchesComponent(gemA, components[1]) &&
        this.gemMatchesComponent(gemB, components[0]))
    );
  }

  private gemMatchesComponent(gem: GemInstance, component: RecipeComponent): boolean {
    if (component.kind === 'affix') {
      return gem.affixId === component.id;
    }
    // kind === 'recipe': match against sourceRecipe
    return gem.sourceRecipe === component.id;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/recipe-registry.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Create initial recipes.json data file**

Create `packages/engine/src/data/recipes.json` with the existing 30 combinations migrated to the new format plus initial category rules. Start with a subset — the existing compound affixes become signature recipes:

```json
{
  "signature": [
    {
      "id": "ignite",
      "name": "Ignite",
      "components": [
        { "kind": "affix", "id": "chance_on_hit" },
        { "kind": "affix", "id": "fire_damage" }
      ],
      "outputAffixId": "ignite",
      "outputBonusEffects": [
        { "stat": "fireDotDamage", "op": "flat", "value": 8 }
      ],
      "maxDepthContribution": 1,
      "tags": ["chance_on_hit", "fire_damage"]
    }
  ],
  "category": [
    {
      "id": "cat_off_off",
      "name": "Offensive Fusion",
      "type": "category",
      "categoryRule": { "inputA": "offensive", "inputB": "offensive" },
      "outputAffixId": "__survivor__",
      "outputBonusEffects": [{ "stat": "percentDamageBonus", "op": "percent", "value": 0.20 }],
      "maxDepthContribution": 1,
      "tags": []
    }
  ]
}
```

The full recipe set will be expanded iteratively. Start with the 30 existing compounds migrated + 6 category rules.

- [ ] **Step 6: Add Zod schemas for recipe data and wire into loader**

Modify `packages/engine/src/data/schemas.ts` to add `RecipeComponentSchema`, `RecipeDefinitionSchema`, `RecipesFileSchema`.

Modify `packages/engine/src/data/loader.ts` to load and validate `recipes.json`.

Modify `packages/engine/src/data/registry.ts` to expose `getRecipeRegistry(): RecipeRegistry`.

- [ ] **Step 7: Run full engine test suite to verify no regressions**

Run: `cd packages/engine && npx vitest run`
Expected: All existing tests PASS (new recipe loading may require updating `data.test.ts` counts)

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/combine/ packages/engine/src/data/recipes.json \
  packages/engine/src/data/schemas.ts packages/engine/src/data/loader.ts \
  packages/engine/src/data/registry.ts packages/engine/tests/recipe-registry.test.ts
git commit -m "feat(engine): add recipe registry with signature + category recipes"
```

---

### Task 4: Discovery State

**Files:**
- Create: `packages/engine/src/combine/discovery-state.ts`
- Create: `packages/engine/tests/discovery-state.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/engine/tests/discovery-state.test.ts
import { describe, it, expect } from 'vitest';
import { DiscoveryState } from '../src/combine/discovery-state.js';

describe('DiscoveryState', () => {
  it('starts empty', () => {
    const ds = new DiscoveryState();
    expect(ds.discoveredCount).toBe(0);
    expect(ds.attemptedCount).toBe(0);
  });

  it('records a discovered recipe', () => {
    const ds = new DiscoveryState();
    ds.recordDiscovery('burn');
    expect(ds.isDiscovered('burn')).toBe(true);
    expect(ds.discoveredCount).toBe(1);
  });

  it('deduplicates discoveries', () => {
    const ds = new DiscoveryState();
    ds.recordDiscovery('burn');
    ds.recordDiscovery('burn');
    expect(ds.discoveredCount).toBe(1);
  });

  it('records attempted combos with normalized keys', () => {
    const ds = new DiscoveryState();
    // Order-independent: fire+cold === cold+fire
    ds.recordAttempt('fire_damage', 'cold_damage');
    expect(ds.hasAttempted('fire_damage', 'cold_damage')).toBe(true);
    expect(ds.hasAttempted('cold_damage', 'fire_damage')).toBe(true);
  });

  it('serializes for future codex support', () => {
    const ds = new DiscoveryState();
    ds.recordDiscovery('burn');
    ds.recordAttempt('fire_damage', 'dot_multiplier');
    const serialized = ds.serialize();
    expect(serialized.discoveredRecipes).toContain('burn');
    expect(serialized.attemptedCombos).toContain('dot_multiplier+fire_damage');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/discovery-state.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement DiscoveryState**

```typescript
// packages/engine/src/combine/discovery-state.ts

export class DiscoveryState {
  private discovered = new Set<string>();
  private attempted = new Set<string>();

  get discoveredCount(): number { return this.discovered.size; }
  get attemptedCount(): number { return this.attempted.size; }

  recordDiscovery(recipeId: string): void {
    this.discovered.add(recipeId);
  }

  isDiscovered(recipeId: string): boolean {
    return this.discovered.has(recipeId);
  }

  recordAttempt(idA: string, idB: string): void {
    this.attempted.add(DiscoveryState.comboKey(idA, idB));
  }

  hasAttempted(idA: string, idB: string): boolean {
    return this.attempted.has(DiscoveryState.comboKey(idA, idB));
  }

  serialize(): { discoveredRecipes: string[]; attemptedCombos: string[] } {
    return {
      discoveredRecipes: [...this.discovered],
      attemptedCombos: [...this.attempted],
    };
  }

  static comboKey(idA: string, idB: string): string {
    return [idA, idB].sort().join('+');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/discovery-state.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/combine/discovery-state.ts packages/engine/tests/discovery-state.test.ts
git commit -m "feat(engine): add per-run discovery state tracking"
```

---

### Task 5: Combination Engine (Three Layers)

**Files:**
- Create: `packages/engine/src/combine/combination-engine.ts`
- Create: `packages/engine/tests/combination-engine.test.ts`

- [ ] **Step 1: Write failing tests for all three combination layers**

```typescript
// packages/engine/tests/combination-engine.test.ts
import { describe, it, expect } from 'vitest';
import { CombinationEngine } from '../src/combine/combination-engine.js';
import { RecipeRegistry } from '../src/combine/recipe-registry.js';
import { DiscoveryState } from '../src/combine/discovery-state.js';
import { createGem } from '../src/types/gem.js';

// Minimal test recipes
const TEST_RECIPES = [
  {
    id: 'burn',
    name: 'Burn',
    type: 'signature' as const,
    components: [
      { kind: 'affix' as const, id: 'fire_damage' },
      { kind: 'affix' as const, id: 'dot_multiplier' },
    ],
    outputAffixId: 'burn',
    outputBonusEffects: [{ stat: 'fireDotDamage', op: 'flat' as const, value: 5 }],
    maxDepthContribution: 1,
    tags: ['fire_damage', 'dot_multiplier'],
  },
];

// Minimal affix category map for testing
const CATEGORY_MAP: Record<string, string> = {
  fire_damage: 'offensive',
  cold_damage: 'offensive',
  flat_hp: 'defensive',
  armor_rating: 'defensive',
  lifesteal: 'sustain',
  dot_multiplier: 'utility',
};

describe('CombinationEngine', () => {
  function makeEngine() {
    const registry = new RecipeRegistry(TEST_RECIPES);
    const discovery = new DiscoveryState();
    return new CombinationEngine(registry, discovery, CATEGORY_MAP, {
      matchingRarityBonus: 0.15,
    });
  }

  describe('Layer 1 — Signature recipes', () => {
    it('produces a signature recipe result', () => {
      const engine = makeEngine();
      const fire = createGem('a', 'fire_damage', 2, 'magic');
      const dot = createGem('b', 'dot_multiplier', 2, 'magic');
      const result = engine.combine(fire, dot, 'gen_1');
      expect(result.gem.affixId).toBe('burn');
      expect(result.gem.sourceRecipe).toBe('burn');
      expect(result.gem.recipeDepth).toBe(1);
      expect(result.layer).toBe('signature');
    });

    it('records discovery', () => {
      const engine = makeEngine();
      const fire = createGem('a', 'fire_damage', 1, 'common');
      const dot = createGem('b', 'dot_multiplier', 1, 'common');
      engine.combine(fire, dot, 'gen_1');
      expect(engine.discovery.isDiscovered('burn')).toBe(true);
    });
  });

  describe('Layer 2 — Category combos', () => {
    it('produces a category combo for same-category gems', () => {
      const engine = makeEngine();
      const fire = createGem('a', 'fire_damage', 2, 'magic');
      const cold = createGem('b', 'cold_damage', 1, 'common');
      const result = engine.combine(fire, cold, 'gen_1');
      expect(result.layer).toBe('category');
      // Higher quality input (fire T2 Magic) survives
      expect(result.gem.affixId).toBe('fire_damage');
    });
  });

  describe('Layer 3 — Generic upgrade', () => {
    it('same-type combine upgrades rarity', () => {
      const engine = makeEngine();
      const a = createGem('a', 'lifesteal', 1, 'common');
      const b = createGem('b', 'lifesteal', 1, 'common');
      const result = engine.combine(a, b, 'gen_1');
      expect(result.layer).toBe('generic');
      expect(result.gem.affixId).toBe('lifesteal');
      expect(result.gem.rarity).toBe('magic'); // Common + Common → Magic
    });

    it('mismatched-type combine upgrades tier of kept gem', () => {
      const engine = makeEngine();
      const a = createGem('a', 'lifesteal', 2, 'magic');
      const b = createGem('b', 'flat_hp', 1, 'common');
      const result = engine.combine(a, b, 'gen_1', 'a'); // keep 'a'
      expect(result.layer).toBe('generic');
      expect(result.gem.affixId).toBe('lifesteal');
      expect(result.gem.tier).toBe(3); // T2 → T3
    });

    it('defaults to keeping higher-quality gem when keepGemUid omitted', () => {
      const engine = makeEngine();
      const a = createGem('a', 'lifesteal', 1, 'common');  // EV: 1.0
      const b = createGem('b', 'flat_hp', 3, 'rare');       // EV: 4.5
      const result = engine.combine(a, b, 'gen_1');
      expect(result.gem.affixId).toBe('flat_hp'); // b is higher quality
    });
  });

  describe('Multi-depth chaining', () => {
    it('increments recipe depth', () => {
      const engine = makeEngine();
      const fire = createGem('a', 'fire_damage', 2, 'magic');
      const dot = createGem('b', 'dot_multiplier', 2, 'magic');
      const burn = engine.combine(fire, dot, 'gen_1');
      expect(burn.gem.recipeDepth).toBe(1);
    });
  });

  describe('Non-combinable gems', () => {
    it('rejects combine when gem is at ceiling', () => {
      const engine = makeEngine();
      const maxed = createGem('a', 'fire_damage', 5, 'legendary');
      const other = createGem('b', 'cold_damage', 1, 'common');
      expect(() => engine.combine(maxed, other, 'gen_1')).toThrow(/not combinable/i);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/combination-engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement CombinationEngine**

```typescript
// packages/engine/src/combine/combination-engine.ts
import {
  type GemInstance,
  type GemRarity,
  createGem,
  calculateEffectiveValue,
  nextRarity,
  MAX_TIER,
  MAX_RECIPE_DEPTH,
} from '../types/gem.js';
import type { RecipeRegistry, RecipeDefinition } from './recipe-registry.js';
import type { DiscoveryState } from './discovery-state.js';
import {
  computeAverageQuality,
  applyMatchingRarityBonus,
  determineOutputTierRarity,
} from './combine-quality.js';

export type CombineLayer = 'signature' | 'category' | 'generic';

export interface CombineResult {
  gem: GemInstance;
  layer: CombineLayer;
  recipeId?: string;
  isNewDiscovery: boolean;
}

export interface CombineConfig {
  matchingRarityBonus: number;
}

export class CombinationEngine {
  constructor(
    private registry: RecipeRegistry,
    public discovery: DiscoveryState,
    private categoryMap: Record<string, string>,
    private config: CombineConfig,
  ) {}

  combine(
    gemA: GemInstance,
    gemB: GemInstance,
    outputUid: string,
    keepGemUid?: string,
  ): CombineResult {
    if (!gemA.combinable) throw new Error(`Gem ${gemA.uid} is not combinable`);
    if (!gemB.combinable) throw new Error(`Gem ${gemB.uid} is not combinable`);

    // Record attempt
    const idA = gemA.sourceRecipe ?? gemA.affixId;
    const idB = gemB.sourceRecipe ?? gemB.affixId;
    this.discovery.recordAttempt(idA, idB);

    // Layer 1: Signature recipe
    const recipe = this.registry.findSignatureRecipe(gemA, gemB);
    if (recipe) {
      return this.applySignatureRecipe(gemA, gemB, recipe, outputUid);
    }

    // Layer 2: Category combo (at least one gem must have a known category)
    const catA = this.categoryMap[gemA.affixId];
    const catB = this.categoryMap[gemB.affixId];
    if (catA || catB) {
      const categoryRecipe = this.registry.findCategoryRecipe(catA ?? 'any', catB ?? 'any');
      if (categoryRecipe) {
        return this.applyCategoryCombo(gemA, gemB, categoryRecipe, outputUid);
      }
    }

    // Layer 3: Generic upgrade
    return this.applyGenericUpgrade(gemA, gemB, outputUid, keepGemUid);
  }

  private applySignatureRecipe(
    gemA: GemInstance,
    gemB: GemInstance,
    recipe: RecipeDefinition,
    outputUid: string,
  ): CombineResult {
    const raritiesMatch = gemA.rarity === gemB.rarity;
    let avgQuality = computeAverageQuality(gemA, gemB);
    avgQuality = applyMatchingRarityBonus(avgQuality, raritiesMatch, this.config.matchingRarityBonus);

    const { tier, rarity } = determineOutputTierRarity(avgQuality);
    const depth = Math.max(gemA.recipeDepth, gemB.recipeDepth) + recipe.maxDepthContribution;
    const isNew = !this.discovery.isDiscovered(recipe.id);

    this.discovery.recordDiscovery(recipe.id);

    // Tags = recipe's declared tags + all ancestor tags from both inputs
    const tags = [...new Set([...recipe.tags, ...gemA.tags, ...gemB.tags])];

    return {
      gem: createGem(outputUid, recipe.outputAffixId, tier, rarity, {
        sourceRecipe: recipe.id,
        recipeDepth: depth,
        tags,
        outputBonusEffects: recipe.outputBonusEffects,
      }),
      layer: 'signature',
      recipeId: recipe.id,
      isNewDiscovery: isNew,
    };
  }

  private applyCategoryCombo(
    gemA: GemInstance,
    gemB: GemInstance,
    recipe: RecipeDefinition,
    outputUid: string,
  ): CombineResult {
    // Survivor = higher effective value; ties → gemA
    const evA = calculateEffectiveValue(gemA.tier, gemA.rarity);
    const evB = calculateEffectiveValue(gemB.tier, gemB.rarity);
    const survivor = evA >= evB ? gemA : gemB;
    const sacrificed = evA >= evB ? gemB : gemA;
    const depth = Math.max(gemA.recipeDepth, gemB.recipeDepth) + 1;

    // Tags propagate from both inputs
    const tags = [...new Set([...gemA.tags, ...gemB.tags])];

    return {
      gem: createGem(outputUid, survivor.affixId, survivor.tier, survivor.rarity, {
        recipeDepth: depth,
        tags,
        outputBonusEffects: recipe.outputBonusEffects,
      }),
      layer: 'category',
      isNewDiscovery: false,
    };
  }

  private applyGenericUpgrade(
    gemA: GemInstance,
    gemB: GemInstance,
    outputUid: string,
    keepGemUid?: string,
  ): CombineResult {
    const sameType = gemA.affixId === gemB.affixId;

    if (sameType) {
      // Rarity upgrade
      const maxRarity = gemA.rarity >= gemB.rarity ? gemA.rarity : gemB.rarity;
      const upgraded = nextRarity(maxRarity);
      const maxTier = Math.max(gemA.tier, gemB.tier) as 1 | 2 | 3 | 4 | 5;

      if (upgraded) {
        return {
          gem: createGem(outputUid, gemA.affixId, maxTier, upgraded, {
            recipeDepth: Math.max(gemA.recipeDepth, gemB.recipeDepth),
          }),
          layer: 'generic',
          isNewDiscovery: false,
        };
      } else {
        // Rarity already maxed (Legendary) — tier upgrade instead
        const newTier = Math.min(MAX_TIER, maxTier + 1) as 1 | 2 | 3 | 4 | 5;
        return {
          gem: createGem(outputUid, gemA.affixId, newTier, 'legendary', {
            recipeDepth: Math.max(gemA.recipeDepth, gemB.recipeDepth),
          }),
          layer: 'generic',
          isNewDiscovery: false,
        };
      }
    }

    // Mismatched-type: pick one to keep, tier-upgrade it
    let kept: GemInstance;
    if (keepGemUid) {
      kept = gemA.uid === keepGemUid ? gemA : gemB;
    } else {
      const evA = calculateEffectiveValue(gemA.tier, gemA.rarity);
      const evB = calculateEffectiveValue(gemB.tier, gemB.rarity);
      kept = evA >= evB ? gemA : gemB;
    }

    if (kept.tier >= MAX_TIER) {
      // Tier maxed — rarity upgrade instead
      const upgraded = nextRarity(kept.rarity);
      return {
        gem: createGem(outputUid, kept.affixId, kept.tier, upgraded ?? kept.rarity, {
          sourceRecipe: kept.sourceRecipe,
          recipeDepth: kept.recipeDepth,
        }),
        layer: 'generic',
        isNewDiscovery: false,
      };
    }

    const newTier = Math.min(MAX_TIER, kept.tier + 1) as 1 | 2 | 3 | 4 | 5;
    return {
      gem: createGem(outputUid, kept.affixId, newTier, kept.rarity, {
        sourceRecipe: kept.sourceRecipe,
        recipeDepth: kept.recipeDepth,
      }),
      layer: 'generic',
      isNewDiscovery: false,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/combination-engine.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full engine test suite**

Run: `cd packages/engine && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/combine/combination-engine.ts packages/engine/tests/combination-engine.test.ts
git commit -m "feat(engine): add three-layer combination engine with multi-depth chaining"
```

---

### Task 6: Wire New Types into Engine Exports

**Files:**
- Modify: `packages/engine/src/types/index.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Add gem type exports to types/index.ts**

Add re-exports for `GemInstance`, `GemRarity`, and related types from `./gem.js`. Keep existing `OrbInstance` export for backward compatibility during migration.

- [ ] **Step 2: Add combine module exports to src/index.ts**

Export `CombinationEngine`, `RecipeRegistry`, `DiscoveryState`, and combine-quality functions.

- [ ] **Step 3: Run full engine test suite**

Run: `cd packages/engine && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Build the engine package**

Run: `cd packages/engine && npx tsup`
Expected: Clean build, no type errors

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/types/index.ts packages/engine/src/index.ts
git commit -m "feat(engine): export new gem types and combination modules"
```

---

## Chunk 2: Engine — Run Mode + Lives System + Pool Scaling

This chunk adds the run-based game loop, lives system, pool scaling per round, revised forge actions, and updated stat pipeline. All work in `packages/engine/`.

### File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/run/run-state.ts` | RunState type, life management, round progression |
| Create | `src/run/run-controller.ts` | Run lifecycle: start, advance round, end conditions |
| Create | `src/run/pool-scaling.ts` | Per-round pool tier/rarity/size from balance config |
| Create | `tests/run-state.test.ts` | Lives system, round advancement |
| Create | `tests/run-controller.test.ts` | Full run lifecycle, goal round, endless |
| Create | `tests/pool-scaling.test.ts` | Pool generation per round |
| Modify | `src/types/balance.ts` | Add GemBalanceConfig fields (poolScaling, lives, flux, etc.) |
| Modify | `src/data/balance.json` | Add new balance config values |
| Modify | `src/types/forge-action.ts` | New ForgeAction variants (socket_gem, unsocket_gem, combine, select_base_item) |
| Modify | `src/forge/forge-state.ts` | Free removal, no flux gate, combine integration |
| Modify | `src/forge/stat-calculator.ts` | Add recipe bonus, depth bonus, synergy additive steps |
| Modify | `src/types/match.ts` | Add RunState, update MatchPhase for run-based flow |
| Modify | `src/types/item.ts` | Simplify EquippedSlot (remove socketedRound, compound) |
| Modify | `src/match/match-controller.ts` | Support run-based progression |
| Modify | `src/pool/pool-generator.ts` | Accept round-based scaling config |
| Modify | `tests/forge.test.ts` | Update for new forge actions |
| Modify | `tests/stat-calculator.test.ts` | Verify new pipeline steps |

### Task 7: Update BalanceConfig + ForgeAction Types

**Files:**
- Modify: `packages/engine/src/types/balance.ts`
- Modify: `packages/engine/src/types/forge-action.ts`
- Modify: `packages/engine/src/types/item.ts`

- [ ] **Step 1: Extend BalanceConfig with gem system fields**

Add to `packages/engine/src/types/balance.ts`:

```typescript
export interface PoolScalingEntry {
  roundRange: [number, number];
  tiers: [number, number];
  rarities: GemRarity[];
  poolSize: number;
}

export interface GemBalanceConfig {
  tierValues: number[];
  rarityMultipliers: Record<GemRarity, number>;
  matchingRarityBonus: number;
  depthBonusPerLevel: number;
  maxRecipeDepth: number;
  recipeQualityThresholds: Record<GemRarity, number>;
  poolScaling: PoolScalingEntry[];
  goalRound: number;
  endlessStartRound: number;
  lives: { default: number; min: number; max: number };
  lifeRecovery: { winStreak: number; milestoneRounds: number[]; discoveryThreshold: number };
  flux: { rewards: Record<string, number>; costs: Record<string, number> };
}
```

Extend the existing `BalanceConfig` interface with a `gem: GemBalanceConfig` field.

- [ ] **Step 2: Update ForgeAction type**

Replace `packages/engine/src/types/forge-action.ts` with the new variants:

```typescript
import type { BaseStat } from './base-stats.js';

export type ForgeAction =
  | { kind: 'socket_gem'; gemUid: string; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'unsocket_gem'; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'combine'; gemUid1: string; gemUid2: string; keepGemUid?: string }
  | { kind: 'select_base_item'; target: 'weapon' | 'armor'; baseItemId: string }
  | { kind: 'set_base_stats'; target: 'weapon' | 'armor'; stat1: BaseStat; stat2: BaseStat };
```

- [ ] **Step 3: Simplify EquippedSlot in item.ts**

Replace the three-variant `EquippedSlot` union with a single variant:

```typescript
export interface EquippedSlot {
  gem: GemInstance;
}
```

Remove `socketedRound`, `compound`, and `upgraded` variants. Update `ForgedItem` accordingly.

- [ ] **Step 4: Update balance.json with gem config**

Add the `gem` section to `packages/engine/src/data/balance.json` with all default values from the spec (pool scaling table, lives config, flux config, etc.).

- [ ] **Step 5: Run engine tests, fix any type errors**

Run: `cd packages/engine && npx vitest run`
Expected: Some existing tests will fail due to type changes. Note failures — these are addressed in subsequent tasks.

- [ ] **Step 6: Commit type changes**

```bash
git add packages/engine/src/types/balance.ts packages/engine/src/types/forge-action.ts \
  packages/engine/src/types/item.ts packages/engine/src/data/balance.json
git commit -m "feat(engine): update types for gem system — ForgeAction, EquippedSlot, BalanceConfig"
```

---

### Task 8: Run State + Lives System

**Files:**
- Create: `packages/engine/src/run/run-state.ts`
- Create: `packages/engine/tests/run-state.test.ts`

- [ ] **Step 1: Write failing tests for RunState**

```typescript
// packages/engine/tests/run-state.test.ts
import { describe, it, expect } from 'vitest';
import {
  createRunState,
  loseLife,
  checkLifeRecovery,
  isRunOver,
  isGoalReached,
  type RunState,
} from '../src/run/run-state.js';

describe('RunState', () => {
  it('creates with default 3 lives', () => {
    const run = createRunState({ startingLives: 3 });
    expect(run.lives).toBe(3);
    expect(run.round).toBe(1);
    expect(run.status).toBe('active');
  });

  it('loses a life', () => {
    const run = createRunState({ startingLives: 3 });
    const after = loseLife(run);
    expect(after.lives).toBe(2);
  });

  it('run ends when lives reach 0', () => {
    let run = createRunState({ startingLives: 1 });
    run = loseLife(run);
    expect(run.lives).toBe(0);
    expect(isRunOver(run)).toBe(true);
  });

  it('recovers life on 3-win streak (capped at starting)', () => {
    let run = createRunState({ startingLives: 3, lifeRecovery: { winStreak: 3, milestoneRounds: [], discoveryThreshold: 99 } });
    run = loseLife(run); // 2 lives
    run = { ...run, consecutiveWins: 3 };
    const after = checkLifeRecovery(run);
    expect(after.lives).toBe(3); // Recovered to cap
    expect(after.consecutiveWins).toBe(0); // Reset streak
  });

  it('does not exceed starting lives', () => {
    const run = createRunState({ startingLives: 3, lifeRecovery: { winStreak: 3, milestoneRounds: [], discoveryThreshold: 99 } });
    // Already at max
    const after = checkLifeRecovery({ ...run, consecutiveWins: 3 });
    expect(after.lives).toBe(3);
  });

  it('detects goal round reached', () => {
    const run = createRunState({ startingLives: 3, goalRound: 10 });
    expect(isGoalReached({ ...run, round: 10 })).toBe(true);
    expect(isGoalReached({ ...run, round: 9 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/run-state.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement RunState**

```typescript
// packages/engine/src/run/run-state.ts
import type { DiscoveryState } from '../combine/discovery-state.js';

export interface LifeRecoveryConfig {
  winStreak: number;
  milestoneRounds: number[];
  discoveryThreshold: number;
}

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
}

export interface CreateRunOpts {
  startingLives: number;
  goalRound?: number;
  lifeRecovery?: LifeRecoveryConfig;
}

export function createRunState(opts: CreateRunOpts): RunState {
  return {
    lives: opts.startingLives,
    startingLives: opts.startingLives,
    round: 1,
    status: 'active',
    consecutiveWins: 0,
    totalWins: 0,
    totalLosses: 0,
    goalRound: opts.goalRound ?? 10,
    lifeRecovery: opts.lifeRecovery ?? { winStreak: 3, milestoneRounds: [6, 10], discoveryThreshold: 5 },
  };
}

export function loseLife(state: RunState): RunState {
  const newLives = Math.max(0, state.lives - 1);
  return {
    ...state,
    lives: newLives,
    consecutiveWins: 0,
    totalLosses: state.totalLosses + 1,
    status: newLives === 0 ? 'lost' : state.status,
  };
}

export function winRound(state: RunState): RunState {
  return {
    ...state,
    consecutiveWins: state.consecutiveWins + 1,
    totalWins: state.totalWins + 1,
  };
}

export function checkLifeRecovery(state: RunState): RunState {
  let lives = state.lives;
  let streak = state.consecutiveWins;

  // Win streak recovery
  if (state.lifeRecovery.winStreak > 0 && streak >= state.lifeRecovery.winStreak) {
    if (lives < state.startingLives) {
      lives = Math.min(state.startingLives, lives + 1);
    }
    streak = 0;
  }

  // Milestone recovery
  if (state.lifeRecovery.milestoneRounds.includes(state.round)) {
    if (lives < state.startingLives) {
      lives = Math.min(state.startingLives, lives + 1);
    }
  }

  return { ...state, lives, consecutiveWins: streak };
}

export function isRunOver(state: RunState): boolean {
  return state.lives <= 0;
}

export function isGoalReached(state: RunState): boolean {
  return state.round >= state.goalRound;
}

export function advanceRound(state: RunState): RunState {
  return { ...state, round: state.round + 1 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/run-state.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/run/run-state.ts packages/engine/tests/run-state.test.ts
git commit -m "feat(engine): add run state with lives system and recovery triggers"
```

---

### Task 9: Pool Scaling for Run Progression

**Files:**
- Create: `packages/engine/src/run/pool-scaling.ts`
- Create: `packages/engine/tests/pool-scaling.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/engine/tests/pool-scaling.test.ts
import { describe, it, expect } from 'vitest';
import { getPoolConfigForRound, type PoolScalingEntry } from '../src/run/pool-scaling.js';

const DEFAULT_SCALING: PoolScalingEntry[] = [
  { roundRange: [1, 2], tiers: [1, 2], rarities: ['common', 'magic'], poolSize: 20 },
  { roundRange: [3, 4], tiers: [1, 3], rarities: ['common', 'magic'], poolSize: 18 },
  { roundRange: [5, 6], tiers: [2, 3], rarities: ['common', 'magic', 'rare'], poolSize: 16 },
  { roundRange: [7, 8], tiers: [2, 4], rarities: ['magic', 'rare'], poolSize: 14 },
  { roundRange: [9, 10], tiers: [3, 4], rarities: ['magic', 'rare', 'epic'], poolSize: 12 },
  { roundRange: [11, 999], tiers: [3, 5], rarities: ['rare', 'epic'], poolSize: 10 },
];

describe('getPoolConfigForRound', () => {
  it('returns round 1 config', () => {
    const config = getPoolConfigForRound(1, DEFAULT_SCALING);
    expect(config.poolSize).toBe(20);
    expect(config.tiers).toEqual([1, 2]);
    expect(config.rarities).toContain('common');
    expect(config.rarities).not.toContain('rare');
  });

  it('returns round 5 config with rare gems', () => {
    const config = getPoolConfigForRound(5, DEFAULT_SCALING);
    expect(config.poolSize).toBe(16);
    expect(config.rarities).toContain('rare');
  });

  it('returns endless config for round 15', () => {
    const config = getPoolConfigForRound(15, DEFAULT_SCALING);
    expect(config.poolSize).toBe(10);
    expect(config.tiers).toEqual([3, 5]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/pool-scaling.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement pool scaling**

```typescript
// packages/engine/src/run/pool-scaling.ts
import type { GemRarity } from '../types/gem.js';

export interface PoolScalingEntry {
  roundRange: [number, number];
  tiers: [number, number];
  rarities: GemRarity[];
  poolSize: number;
}

export function getPoolConfigForRound(
  round: number,
  scaling: PoolScalingEntry[],
): PoolScalingEntry {
  for (const entry of scaling) {
    if (round >= entry.roundRange[0] && round <= entry.roundRange[1]) {
      return entry;
    }
  }
  // Fallback to last entry
  return scaling[scaling.length - 1];
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd packages/engine && npx vitest run tests/pool-scaling.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/run/pool-scaling.ts packages/engine/tests/pool-scaling.test.ts
git commit -m "feat(engine): add per-round pool scaling config"
```

---

### Task 10: Update Forge State for New Actions

**Files:**
- Modify: `packages/engine/src/forge/forge-state.ts`
- Modify: `packages/engine/tests/forge.test.ts`

- [ ] **Step 1: Write new failing tests for revised forge actions**

Add tests in `packages/engine/tests/forge.test.ts` for:
- `socket_gem` — socket a gem from stockpile to a slot
- `unsocket_gem` — remove a gem from slot back to stockpile, free (no flux cost)
- `combine` — combine two stockpile gems, result goes to stockpile
- `select_base_item` — set weapon/armor base item (round 1 only)
- Verify no flux tracking (all actions are free)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/forge.test.ts`

- [ ] **Step 3: Rewrite forge-state.ts for new action types**

Replace the existing `applyForgeAction` function to handle the new `ForgeAction` variants. Remove flux cost checks. Remove round-locking logic. Integrate `CombinationEngine` for `combine` actions.

Key changes:
- `socket_gem`: Move gem from stockpile to slot (no flux cost)
- `unsocket_gem`: Move gem from slot back to stockpile (no flux cost, no round restriction)
- `combine`: Find both gems in stockpile, run through CombinationEngine, put result in stockpile
- `select_base_item`: Validate it's round 1, update item's baseItemId
- `set_base_stats`: Same as current but restricted to round 1

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/forge.test.ts`
Expected: All PASS

- [ ] **Step 5: Run full engine suite**

Run: `cd packages/engine && npx vitest run`
Expected: Fix any remaining test failures from type changes

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/forge/forge-state.ts packages/engine/tests/forge.test.ts
git commit -m "feat(engine): rewrite forge state for new gem actions — free removal, combine integration"
```

---

### Task 11: Update Stat Calculator Pipeline

**Files:**
- Modify: `packages/engine/src/forge/stat-calculator.ts`
- Modify: `packages/engine/tests/stat-calculator.test.ts`

- [ ] **Step 1: Write new tests for pipeline steps 4-7**

Add tests for:
- Step 4: Gem effects scaled by `tierValue × rarityMultiplier`
- Step 5: Recipe bonus — signature/category gems get bonus effects
- Step 6: Depth bonus — `1 + (depth × depthBonusPerLevel)` multiplier
- Step 7: Synergy additive bonuses when thresholds are met

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/stat-calculator.test.ts`

- [ ] **Step 3: Update stat-calculator.ts**

Modify the existing `calculateStats` function to:
1. Read gem effects using new `GemInstance` type (tier × rarity scaling)
2. Apply recipe bonus effects from `RecipeDefinition.outputBonusEffects`
3. Apply depth bonus multiplier
4. Evaluate synergy thresholds and apply additive bonuses
5. Keep existing resolve-modifiers and caps logic unchanged

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/stat-calculator.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/stat-calculator.ts packages/engine/tests/stat-calculator.test.ts
git commit -m "feat(engine): update stat pipeline with recipe bonus, depth bonus, synergy layer"
```

---

### Task 12: Update Match Controller for Run-Based Flow

**Files:**
- Modify: `packages/engine/src/match/match-controller.ts`
- Modify: `packages/engine/src/types/match.ts`
- Modify: `packages/engine/src/match/phase-machine.ts`
- Create: `packages/engine/tests/run-controller.test.ts`

- [ ] **Step 1: Write tests for run-based match flow**

```typescript
// packages/engine/tests/run-controller.test.ts
// Test: createRun → draft → forge → duel → next round → repeat
// Test: life loss on duel loss
// Test: run ends at 0 lives
// Test: goal round reached at round 10
// Test: endless mode continues beyond round 10
// Test: pool scaling per round
// Test: weapon/armor selection in first forge
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Update MatchState and MatchPhase types**

Update `packages/engine/src/types/match.ts`:
- Remove fixed `round: 1 | 2 | 3` — replace with `round: number`
- Add `RunState` field to `MatchState`
- Add `DiscoveryState` reference
- Remove `fluxPerRound` and `forgeFlux` (no flux gate)
- Add `mode: 'run_async' | 'run_live' | 'quick'` (replaces old MatchMode)

- [ ] **Step 4: Update phase-machine.ts**

Replace the fixed 3-round phase sequence with a run-based sequence:
- `draft → forge → duel → [check lives] → draft → ...` (repeating)
- Goal check at configurable round
- No fixed end — run continues until lives = 0

- [ ] **Step 5: Update match-controller.ts**

Adapt `createMatch` to create with `RunState`. Adapt `handleDuelContinue` to:
1. Check duel result → call `winRound()` or `loseLife()`
2. Check `isRunOver()` → set phase to `complete` if dead
3. Check `checkLifeRecovery()` for life restore
4. Generate new pool using `getPoolConfigForRound()` for next round
5. Advance to next draft phase

- [ ] **Step 6: Run tests, fix failures**

Run: `cd packages/engine && npx vitest run`
Expected: All tests PASS (existing match.test.ts may need updating for new types)

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/match/ packages/engine/src/types/match.ts \
  packages/engine/tests/run-controller.test.ts
git commit -m "feat(engine): run-based match controller with lives, pool scaling, goal round"
```

---

### Task 13: Update Pool Generator

**Files:**
- Modify: `packages/engine/src/pool/pool-generator.ts`
- Modify: `packages/engine/tests/pool.test.ts`

- [ ] **Step 1: Write tests for new pool generation with gem model**

Test that `generatePool` now produces `GemInstance[]` (not `OrbInstance[]`), respects tier/rarity ranges from `PoolScalingEntry`, and produces the correct pool size.

- [ ] **Step 2: Update pool-generator.ts**

Modify `generatePool` to:
- Accept a `PoolScalingEntry` config (or derive it from round number + balance config)
- Generate `GemInstance` objects with both tier and rarity
- Respect the tier range `[min, max]` and allowed rarities from the config
- Use existing seeded RNG for determinism

- [ ] **Step 3: Run tests, verify pass**

Run: `cd packages/engine && npx vitest run tests/pool.test.ts`

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/pool/pool-generator.ts packages/engine/tests/pool.test.ts
git commit -m "feat(engine): update pool generator for gem model with run-based scaling"
```

---

### Task 14: Update AI Strategies for Combining

**Files:**
- Modify: `packages/engine/src/ai/strategies/forge-strategy.ts`
- Modify: `packages/engine/tests/ai.test.ts`

- [ ] **Step 1: Write tests for AI combine strategies**

Test that AI can:
- Combine gems using the CombinationEngine
- Choose between tier-focused (always tier up) and rarity-focused (match same types) strategies
- Socket gems into appropriate slots after combining

- [ ] **Step 2: Update forge-strategy.ts**

Add AI combining logic. The AI forge strategy should:
1. Look for signature recipe matches in stockpile — combine those first
2. Look for same-type pairs to rarity-upgrade
3. Use remaining mismatched gems for tier upgrades
4. Socket the best gems into slots

- [ ] **Step 3: Run AI tests**

Run: `cd packages/engine && npx vitest run tests/ai.test.ts`

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/ai/strategies/forge-strategy.ts packages/engine/tests/ai.test.ts
git commit -m "feat(engine): add AI combine strategies for forge phase"
```

---

### Task 15: Fix Remaining Engine Test Failures

**Files:**
- Modify: `packages/engine/tests/data.test.ts`
- Modify: `packages/engine/tests/match.test.ts`
- Modify: `packages/engine/tests/duel.test.ts`
- Modify: various test files as needed

- [ ] **Step 1: Run full engine test suite, capture all failures**

Run: `cd packages/engine && npx vitest run 2>&1 | head -100`

- [ ] **Step 2: Fix each failing test**

Update tests to use `GemInstance` instead of `OrbInstance`, new `ForgeAction` variants, and run-based match flow. Keep all existing behavioral assertions — only change the types/APIs.

- [ ] **Step 3: Verify all tests pass**

Run: `cd packages/engine && npx vitest run`
Expected: 100% pass

- [ ] **Step 4: Build engine package**

Run: `cd packages/engine && npx tsup`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add packages/engine/tests/
git commit -m "fix(engine): update all tests for gem system refactor types"
```

---

## Chunk 3: Async Matchmaking + Payload System

This chunk adds the payload serialization, bracket matching, and Supabase infrastructure for async runs. Work spans `packages/engine/` and `packages/supabase/`.

### File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/run/payload.ts` (engine) | Payload serialization, power bracket calculation |
| Create | `tests/payload.test.ts` (engine) | Payload tests |
| Create | `supabase/migrations/011_run_tables.sql` | runs, run_rounds, payload_queue, discoveries tables |
| Create | `supabase/functions/run-create/index.ts` | Initialize a new run |
| Create | `supabase/functions/run-submit-payload/index.ts` | Submit forged loadout |
| Create | `supabase/functions/run-match/index.ts` | Match payloads and simulate |
| Create | `supabase/functions/run-state/index.ts` | Get current run state |
| Modify | `supabase/functions/forge-submit/index.ts` | Updated ForgeAction types |

### Task 16: Payload Serialization + Power Bracket

**Files:**
- Create: `packages/engine/src/run/payload.ts`
- Create: `packages/engine/tests/payload.test.ts`

- [ ] **Step 1: Write failing tests**

Test `serializePayload()` produces a `PlayerPayload` with correct `powerBracket` calculation. Test `deserializePayload()` round-trips correctly. Test bracket matching logic.

- [ ] **Step 2: Implement payload module**

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(engine): add payload serialization and power bracket matching"
```

---

### Task 17: Database Migration for Run Tables

**Files:**
- Create: `packages/supabase/migrations/011_run_tables.sql`

- [ ] **Step 1: Write migration SQL**

Create tables: `runs`, `run_rounds`, `payload_queue`, `discoveries`. Add indexes for matchmaking queries (payload_queue by power_bracket + round). Add RLS policies.

- [ ] **Step 2: Test migration locally**

Run: `cd packages/supabase && supabase db reset`
Expected: All migrations apply cleanly

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(supabase): add run tables migration (runs, run_rounds, payload_queue, discoveries)"
```

---

### Task 18: Run Edge Functions

**Files:**
- Create: `packages/supabase/functions/run-create/index.ts`
- Create: `packages/supabase/functions/run-submit-payload/index.ts`
- Create: `packages/supabase/functions/run-match/index.ts`
- Create: `packages/supabase/functions/run-state/index.ts`

- [ ] **Step 1: Implement run-create**

Creates a new run record in the `runs` table, returns run ID and initial state.

- [ ] **Step 2: Implement run-submit-payload**

Accepts a serialized payload, inserts into `payload_queue` with power bracket and TTL.

- [ ] **Step 3: Implement run-match**

Queries `payload_queue` for matching payloads (round delta ≤ 2, bracket delta ≤ 1). If found, simulates duel and returns result. If not found within timeout, generates AI opponent.

- [ ] **Step 4: Implement run-state**

Returns current run state (round, lives, discoveries, last duel result).

- [ ] **Step 5: Update forge-submit for new ForgeAction types**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(supabase): add run edge functions (create, submit-payload, match, state)"
```

---

## Chunk 4: Client UI Updates

This chunk adapts the client to the new gem model and run-based flow. Work in `packages/client/`.

### File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/stores/runStore.ts` | Run state management (lives, round, goal, endless) |
| Create | `src/stores/combineStore.ts` | Combine UI state (selection, preview, confirm) |
| Create | `src/stores/discoveryStore.ts` | Discovery journal UI state |
| Create | `src/stores/runStore.test.ts` | Run store tests |
| Create | `src/stores/combineStore.test.ts` | Combine store tests |
| Create | `src/stores/discoveryStore.test.ts` | Discovery store tests |
| Modify | `src/stores/draftStore.ts` | Adapt for GemInstance (tier + rarity display) |
| Modify | `src/stores/forgeStore.ts` | Free removal, combine action, no flux |
| Modify | `src/stores/matchStore.ts` | Run-based flow |
| Modify | `src/components/GemCard.tsx` | Display rarity + tier (two visual indicators) |
| Modify | `src/components/GemChip.tsx` | Rarity color coding |
| Modify | `src/pages/Draft.tsx` | GemInstance instead of OrbInstance |
| Modify | `src/pages/Forge.tsx` | Remove flux display, add combine UI, add unsocket |
| Modify | `src/gateway/local-gateway.ts` | Run-based match flow |
| Modify | `src/gateway/remote-gateway.ts` | New edge function endpoints |

### Task 19: Run Store + Discovery Store

- [ ] **Step 1: Write failing tests for runStore**
- [ ] **Step 2: Implement runStore**
- [ ] **Step 3: Write failing tests for discoveryStore**
- [ ] **Step 4: Implement discoveryStore**
- [ ] **Step 5: Run tests, verify pass**
- [ ] **Step 6: Commit**

### Task 20: Update GemCard + GemChip Components

- [ ] **Step 1: Update GemCard to show both tier and rarity**

Add a rarity border/glow color and tier number indicator. Rarity colors: Common (gray), Magic (blue), Rare (yellow), Epic (purple), Legendary (orange/gold).

- [ ] **Step 2: Update GemChip for rarity color coding**
- [ ] **Step 3: Verify no console errors in browser**
- [ ] **Step 4: Commit**

### Task 21: Update Draft Page for GemInstance

- [ ] **Step 1: Update Draft.tsx type references from OrbInstance to GemInstance**
- [ ] **Step 2: Update draftStore for GemInstance**
- [ ] **Step 3: Verify draft gestures still work (tap, drag, hold, swoop unchanged)**
- [ ] **Step 4: Run draft unit tests**
- [ ] **Step 5: Commit**

### Task 22: Rewrite Forge Page

- [ ] **Step 1: Remove flux display and flux tracking UI**
- [ ] **Step 2: Add combine UI — select two gems, preview result, confirm**
- [ ] **Step 3: Add unsocket button on socketed gems (always available)**
- [ ] **Step 4: Add weapon/armor selection UI for first forge phase**
- [ ] **Step 5: Update forgeStore for new ForgeAction types**
- [ ] **Step 6: Run forge unit tests**
- [ ] **Step 7: Commit**

### Task 23: Update Gateways + Match Store

- [ ] **Step 1: Update LocalGateway for run-based flow**
- [ ] **Step 2: Update RemoteGateway with new edge function endpoints**
- [ ] **Step 3: Update matchStore for run state management**
- [ ] **Step 4: Run gateway and matchStore tests**
- [ ] **Step 5: Commit**

### Task 24: Add Run UI (Lives Display, Round Counter, Goal Indicator)

- [ ] **Step 1: Add lives display component**
- [ ] **Step 2: Add round counter with goal progress**
- [ ] **Step 3: Add "Run Won" / "Run Over" screens**
- [ ] **Step 4: Add discovery notification toast**
- [ ] **Step 5: Commit**

---

## Chunk 5: Debug Tools + Simulation Updates

This chunk updates the balance simulation tool for run-based analysis. Work in `packages/tools/` and `packages/engine/`.

### File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `engine/src/balance/simulation-runner.ts` | Run-based simulation mode |
| Modify | `tools/server/routes/simulations.ts` | New simulation parameters |
| Modify | `tools/server/routes/reports.ts` | New report metrics |
| Modify | `tools/server/worker.ts` | Run simulation in worker |
| Delete | `tools/src/api/useSimulation.ts` | Remove divergent client-side simulation |

### Task 25: Update Engine Simulation Runner

- [ ] **Step 1: Write tests for run-based simulation**

Test that `runSimulation` can simulate full runs (N rounds with lives), track recipe discovery rates, and report per-round gem quality.

- [ ] **Step 2: Add run simulation mode to simulation-runner.ts**

New function `runRunSimulation(config: RunSimulationConfig)` that:
- Creates a run with the new RunState
- Loops: generatePool → AI draft → AI forge (with combining) → simulate duel → check lives
- Tracks: rounds survived, recipes discovered, gem quality per round, synergies activated

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

### Task 26: Update Simulation Tool Server

- [ ] **Step 1: Add new simulation parameters to routes/simulations.ts**

Accept: `mode: 'run'`, `maxRounds`, `startingLives`, `aiCombineStrategy`.

- [ ] **Step 2: Add new report metrics to routes/reports.ts**

New endpoints/parameters for: run length distribution, recipe effectiveness, power curve analysis, legendary achievement rate.

- [ ] **Step 3: Update worker.ts for run-mode simulation**
- [ ] **Step 4: Remove tools/src/api/useSimulation.ts** (divergent client-side sim)
- [ ] **Step 5: Run tools tests**

Run: `cd packages/tools && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(tools): update simulation tool for run-based analysis"
```

---

## Chunk 6: E2E Tests + Polish

This chunk adds Playwright E2E tests for the new run flow, gem combining, and async matchmaking. Updates existing acceptance tests. Work in `packages/client/e2e/`.

### Task 27: Run Flow E2E Tests

**Files:**
- Create: `packages/client/e2e/run-flow.spec.ts`

- [ ] **Step 1: Write R01-R05 tests**

```typescript
// R01: Start run, select weapon/armor, first forge
// R02: Draft pool shows only Common/Magic gems in round 1
// R03: Combine two gems, verify result in stockpile
// R04: Socket, unsocket, re-socket with no restrictions
// R05: Lose a duel, verify life lost
```

- [ ] **Step 2: Run tests, verify they pass**

Run: `cd packages/client && npx playwright test e2e/run-flow.spec.ts`

- [ ] **Step 3: Write R06-R10 tests**

```typescript
// R06: Lose all lives, verify run-over screen
// R07: Win streak restores a life
// R08: Reach goal round 10, verify "run win" state
// R09: Enter endless mode at round 11
// R10: Later rounds show higher-quality gems in pool
```

- [ ] **Step 4: Run tests, verify they pass**
- [ ] **Step 5: Commit**

### Task 28: Gem Combining E2E Tests

**Files:**
- Create: `packages/client/e2e/gem-combining.spec.ts`

- [ ] **Step 1: Write C01-C07 tests**

```typescript
// C01: Select two gems to combine, see preview
// C02: Same-type combine increases rarity
// C03: Mismatched combine lets you pick which gem to tier-upgrade
// C04: Signature recipe produces unique gem with recipe indicator
// C05: Combined gem can be re-combined (multi-depth)
// C06: Max-depth gem shows as non-combinable
// C07: Discovery journal updates when new recipe found
```

- [ ] **Step 2: Run tests, verify pass**
- [ ] **Step 3: Commit**

### Task 28b: Async Matchmaking E2E Tests

**Files:**
- Create: `packages/client/e2e/async-matchmaking.spec.ts`

- [ ] **Step 1: Write A01-A03 tests**

```typescript
// A01: Submit payload after forge — verify payload serialization and submission
// A02: Matched against opponent, duel plays out — verify bracket matching UI
// A03: Run continues to next round after duel — verify round advancement
```

Use `LocalGateway` with seeded run state. For async flow, mock the `RemoteGateway` responses to simulate payload matching and duel results.

- [ ] **Step 2: Run tests, verify pass**

Run: `cd packages/client && npx playwright test e2e/async-matchmaking.spec.ts`

- [ ] **Step 3: Commit**

```bash
git commit -m "test(e2e): add async matchmaking acceptance tests A01-A03"
```

---

### Task 29: Update Existing Acceptance Tests

**Files:**
- Modify: `packages/client/e2e/draft-acceptance.spec.ts`
- Modify: `packages/client/e2e/forge-redesign.spec.ts`
- Modify: `packages/client/e2e/match-flow.spec.ts`
- Modify: `packages/client/e2e/phase-transitions.spec.ts`

- [ ] **Step 1: Update draft-acceptance.spec.ts**

Gem cards now show rarity + tier (two visual indicators). Update D01 test to check for both.

- [ ] **Step 2: Update forge-redesign.spec.ts**

Free removal, combine action, no flux display. Update F01-F08.

- [ ] **Step 3: Update match-flow.spec.ts and phase-transitions.spec.ts**

Run-based flow instead of best-of-3.

- [ ] **Step 4: Run all E2E tests**

Run: `cd packages/client && npx playwright test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git commit -m "test(e2e): update acceptance tests for gem system refactor"
```

---

### Task 30: Final Regression Check + Engine Build

- [ ] **Step 1: Run full engine test suite**

Run: `cd packages/engine && npx vitest run`
Expected: 100% pass

- [ ] **Step 2: Run full client test suite**

Run: `cd packages/client && npx vitest run`
Expected: 100% pass

- [ ] **Step 3: Run full E2E suite**

Run: `cd packages/client && npx playwright test`
Expected: 100% pass

- [ ] **Step 4: Build all packages**

Run: `pnpm -r build`
Expected: Clean builds

- [ ] **Step 5: Final commit**

```bash
git commit -m "chore: gem system refactor complete — all tests passing"
```

---

## Implementation Notes for Agentic Workers

### Reviewer Findings (addressed in this plan)

These issues were found during plan review and have been fixed:

1. **`GemInstance` carries `tags` and `outputBonusEffects`** — tags propagate through all ancestry for synergy detection; bonus effects store recipe/category combo mechanics
2. **Category combo uses `findCategoryRecipe()` with wildcard "any" matching** — not just `catA && catB` check
3. **Migration number is `011`** (not 007 — earlier migrations already exist)
4. **Store tests go in `src/stores/` directly** (not `__tests__/` subdirectory — matches existing convention)
5. **Gateway files use kebab-case** (`local-gateway.ts`, `remote-gateway.ts`)

### Additional Guidance

- **Rarity comparisons**: Use `rarityIndex()` from `gem.ts`, NOT string comparison. `'epic' >= 'legendary'` is `true` lexicographically but wrong semantically.
- **Discovery serialization**: Include `deserialize()` on `DiscoveryState` for future Codex support.
- **Simulation tool**: Only remove the divergent client-side simulation logic (`tools/src/api/client.ts` if it contains `runSimulation`). The SSE progress hook (`tools/src/api/sse.ts`) stays — it watches the server runner.
- **Supabase simulation columns**: The simulation tool database tables (`simulation_runs`, `match_results`, etc.) need new columns for run-based data. Handle this in Chunk 3's migration or as a separate `012_simulation_run_columns.sql`.
- **E2E test infrastructure**: Use `LocalGateway` with deterministic seeding for run-based tests. For tests that need a specific round (e.g., R08: goal round 10), create a `startRunAtRound(page, round)` fixture that fast-forwards through draft/forge/duel cycles programmatically.
- **Chunks 2-6 test detail**: Chunks 2-6 are less prescriptive than Chunk 1 by design. Agentic workers should follow the same TDD pattern established in Chunk 1 (write failing test → verify fail → implement → verify pass → commit) even where the plan provides prose descriptions instead of inline code. Read the spec section referenced by each task for exact behavioral requirements.
