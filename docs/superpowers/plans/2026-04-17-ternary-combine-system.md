# Ternary Combine System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the combine engine to support 3-gem ("ternary") combines alongside the existing 2-gem system, and add 15 new recipes (3 binary + 12 ternary across BBB/BBC/BCC/CCC shapes) that exercise the new code paths.

**Architecture:** Additive — existing binary recipes and call paths remain untouched. A new `type: "signature3"` recipe shape activates new engine logic; a new `{kind: 'combine3'}` forge action threads through the plan/state layer; UI branches on filled-slot count to dispatch either the existing binary or the new ternary action. The fallback rule when a ternary recipe is not matched is "KEEP-anchored binary pair + eject third gem."

**Tech Stack:** TypeScript 5.7, Zod 3 (data validation), Vitest 3 (unit tests), Playwright (E2E), pnpm workspaces. No new libraries introduced.

**Spec:** `docs/superpowers/specs/2026-04-17-ternary-combine-system-design.md`

**Working conventions this plan assumes:**
- Run engine tests: `cd packages/engine && pnpm vitest run <pattern>`
- Run client tests: `cd packages/client && pnpm vitest run <pattern>`
- Run E2E: `cd packages/client && pnpm playwright test <pattern>`
- Run the whole suite before landing: `cd <pkg> && pnpm vitest run` (no pattern)
- Use `createGem(uid, affixId, tier, rarity, opts?)` from `packages/engine/src/types/gem.ts` to build gem fixtures.
- Tests live next to their target: engine tests in `packages/engine/tests/`, client tests in `packages/client/src/**/*.test.{ts,tsx}`.
- Commit after each green test + implementation pair. Small commits beat batch commits.

---

## Chunk 1: Schema + Registry Plumbing

Adds the data-shape foundation: recipes can carry 3 components, `RecipeRegistry` knows how to look them up, `DiscoveryState` can record ternary attempts, and `DataRegistry` exposes ternary compound lookups. No combine behavior yet — just the surfaces.

### Task 1.1: Assert no `+` in affix/recipe IDs (invariant guard)

**Why first:** the ternary discovery key format `[a,b,c].sort().join('+')` depends on this. Pinning the invariant with a test before touching any other code prevents silent collisions later.

**Files:**
- Create: `packages/engine/tests/id-format-invariant.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { loadAndValidateData } from '../src/data/loader.js';

describe('Data ID format invariant', () => {
  const data = loadAndValidateData();

  it('no affix ID contains "+"', () => {
    const offenders = data.affixes.filter(a => a.id.includes('+'));
    expect(offenders).toHaveLength(0);
  });

  it('no recipe ID contains "+"', () => {
    const offenders = data.recipes.filter(r => r.id.includes('+'));
    expect(offenders).toHaveLength(0);
  });

  it('no compound ID contains "+"', () => {
    const offenders = data.combinations.filter(c => c.id.includes('+'));
    expect(offenders).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd packages/engine && pnpm vitest run tests/id-format-invariant.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add packages/engine/tests/id-format-invariant.test.ts
git commit -m "test(engine): assert no '+' in affix/recipe/compound IDs"
```

---

### Task 1.2: Update Zod schema for `signature3` recipe type

**Files:**
- Modify: `packages/engine/src/data/schemas.ts:52-72`

- [ ] **Step 1: Write a test that a ternary recipe definition validates**

Append to `packages/engine/tests/data.test.ts` (inside an existing `describe`):

```ts
import { RecipesSchema } from '../src/data/schemas.js';

it('RecipesSchema accepts signature3 with 3 components', () => {
  const ternary = [{
    id: 'test_triple',
    name: 'Test Triple',
    type: 'signature3',
    components: [
      { kind: 'affix', id: 'fire_damage' },
      { kind: 'affix', id: 'cold_damage' },
      { kind: 'affix', id: 'lightning_damage' },
    ],
    outputAffixId: 'test_triple',
    outputBonusEffects: [],
    maxDepthContribution: 1,
    tags: [],
  }];
  expect(() => RecipesSchema.parse(ternary)).not.toThrow();
});

it('RecipesSchema rejects signature3 with only 2 components', () => {
  const bad = [{
    id: 'bad', name: 'Bad', type: 'signature3',
    components: [
      { kind: 'affix', id: 'fire_damage' },
      { kind: 'affix', id: 'cold_damage' },
    ],
    outputAffixId: 'bad', outputBonusEffects: [],
    maxDepthContribution: 1, tags: [],
  }];
  expect(() => RecipesSchema.parse(bad)).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && pnpm vitest run tests/data.test.ts -t signature3`
Expected: FAIL (schema rejects `signature3` — not in the enum).

- [ ] **Step 3: Update the schema**

Edit `packages/engine/src/data/schemas.ts:62-72`:

```ts
const RecipeDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['signature', 'signature3', 'category']),
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

- [ ] **Step 4: Run the test suite to verify it passes and existing recipes still validate**

Run: `cd packages/engine && pnpm vitest run tests/data.test.ts`
Expected: all existing tests still PASS, new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/data/schemas.ts packages/engine/tests/data.test.ts
git commit -m "feat(engine): Zod schema accepts signature3 recipe type with 3 components"
```

---

### Task 1.3: Update `RecipeDefinition` TS interface

**Files:**
- Modify: `packages/engine/src/combine/recipe-registry.ts:10-20`

- [ ] **Step 1: Edit the interface**

Replace lines 10–20 with:

```ts
export interface RecipeDefinition {
  id: string;
  name: string;
  type: 'signature' | 'signature3' | 'category';
  components?: [RecipeComponent, RecipeComponent] | [RecipeComponent, RecipeComponent, RecipeComponent];
  categoryRule?: { inputA: string; inputB: string };
  outputAffixId: string;
  outputBonusEffects: StatModifier[];
  maxDepthContribution: number;
  tags: string[];
}
```

- [ ] **Step 2: Run the engine test suite**

Run: `cd packages/engine && pnpm vitest run`
Expected: ALL tests PASS (no behavioral change; type still satisfies all current usages because `[C, C]` is a subtype of the union).

- [ ] **Step 3: Run TypeScript type-check across workspaces**

Run: `pnpm -r exec tsc --noEmit`
Expected: no new type errors. (If errors appear in consumers that narrow on `components.length`, those consumers must handle the wider shape; none are expected today, but check.)

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/combine/recipe-registry.ts
git commit -m "feat(engine): widen RecipeDefinition type to admit signature3 + 3-component tuple"
```

---

### Task 1.4: Add `findTernaryRecipe` to `RecipeRegistry`

**Files:**
- Modify: `packages/engine/src/combine/recipe-registry.ts`
- Modify: `packages/engine/tests/recipe-registry.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/engine/tests/recipe-registry.test.ts` (inside the main describe block):

```ts
describe('findTernaryRecipe', () => {
  const ternaryRecipes: RecipeDefinition[] = [
    {
      id: 'meltdown', name: 'Meltdown', type: 'signature3',
      components: [
        { kind: 'affix', id: 'fire_damage' },
        { kind: 'affix', id: 'cold_damage' },
        { kind: 'affix', id: 'lightning_damage' },
      ],
      outputAffixId: 'meltdown', outputBonusEffects: [],
      maxDepthContribution: 2, tags: [],
    },
    {
      id: 'mixed', name: 'Mixed', type: 'signature3',
      components: [
        { kind: 'recipe', id: 'ignite' },
        { kind: 'affix', id: 'chance_on_crit' },
        { kind: 'affix', id: 'fire_damage' },
      ],
      outputAffixId: 'mixed', outputBonusEffects: [],
      maxDepthContribution: 1, tags: [],
    },
  ];

  const registry = new RecipeRegistry(ternaryRecipes);

  it('resolves all-basic ternary by affixId', () => {
    const result = registry.findTernaryRecipe(
      { affixId: 'fire_damage' },
      { affixId: 'cold_damage' },
      { affixId: 'lightning_damage' },
    );
    expect(result?.id).toBe('meltdown');
  });

  it('is order-invariant (all 6 permutations hit)', () => {
    const gems = [
      { affixId: 'fire_damage' },
      { affixId: 'cold_damage' },
      { affixId: 'lightning_damage' },
    ];
    const perms = [
      [0,1,2], [0,2,1], [1,0,2], [1,2,0], [2,0,1], [2,1,0],
    ];
    for (const [i,j,k] of perms) {
      expect(registry.findTernaryRecipe(gems[i], gems[j], gems[k])?.id).toBe('meltdown');
    }
  });

  it('resolves mixed-kind ternary using sourceRecipe', () => {
    const result = registry.findTernaryRecipe(
      { affixId: 'ignite', sourceRecipe: 'ignite' },
      { affixId: 'chance_on_crit' },
      { affixId: 'fire_damage' },
    );
    expect(result?.id).toBe('mixed');
  });

  it('returns null when no recipe matches', () => {
    const result = registry.findTernaryRecipe(
      { affixId: 'fire_damage' },
      { affixId: 'cold_damage' },
      { affixId: 'thorns' },
    );
    expect(result).toBeNull();
  });

  it('does not match binary signature recipes', () => {
    const binary: RecipeDefinition[] = [{
      id: 'ignite', name: 'Ignite', type: 'signature',
      components: [
        { kind: 'affix', id: 'chance_on_hit' },
        { kind: 'affix', id: 'fire_damage' },
      ],
      outputAffixId: 'ignite', outputBonusEffects: [],
      maxDepthContribution: 1, tags: [],
    }];
    const r = new RecipeRegistry(binary);
    expect(r.findTernaryRecipe(
      { affixId: 'chance_on_hit' },
      { affixId: 'fire_damage' },
      { affixId: 'anything' },
    )).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && pnpm vitest run tests/recipe-registry.test.ts -t findTernaryRecipe`
Expected: FAIL — `registry.findTernaryRecipe is not a function`.

- [ ] **Step 3: Implement**

Edit `packages/engine/src/combine/recipe-registry.ts`. Add a ternary key helper, the `ternaryMap`, and the lookup method:

```ts
// Near the top, alongside signatureKey:
function ternaryKey(a: string, b: string, c: string): string {
  return [a, b, c].sort().join('+');
}
```

Inside the class:

```ts
private ternaryMap: Map<string, RecipeDefinition>;
```

In the constructor (after `signatureMap` build), add:

```ts
this.ternaryMap = new Map();
for (const recipe of recipes) {
  if (recipe.type === 'signature3' && recipe.components && recipe.components.length === 3) {
    const [c1, c2, c3] = recipe.components;
    const keyA = `${c1.kind}:${c1.id}`;
    const keyB = `${c2.kind}:${c2.id}`;
    const keyC = `${c3.kind}:${c3.id}`;
    this.ternaryMap.set(ternaryKey(keyA, keyB, keyC), recipe);
  }
}
```

New public method (place after `findSignatureRecipe`):

```ts
findTernaryRecipe(
  gemA: { affixId: string; sourceRecipe?: string },
  gemB: { affixId: string; sourceRecipe?: string },
  gemC: { affixId: string; sourceRecipe?: string },
): RecipeDefinition | null {
  const idsFor = (g: { affixId: string; sourceRecipe?: string }) => {
    const ids = [`affix:${g.affixId}`];
    if (g.sourceRecipe) ids.push(`recipe:${g.sourceRecipe}`);
    return ids;
  };
  const idsA = idsFor(gemA);
  const idsB = idsFor(gemB);
  const idsC = idsFor(gemC);

  for (const a of idsA) for (const b of idsB) for (const c of idsC) {
    const hit = this.ternaryMap.get(ternaryKey(a, b, c));
    if (hit) return hit;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && pnpm vitest run tests/recipe-registry.test.ts`
Expected: all tests PASS (including the existing ones).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/combine/recipe-registry.ts packages/engine/tests/recipe-registry.test.ts
git commit -m "feat(engine): RecipeRegistry.findTernaryRecipe with sorted-triple keys"
```

---

### Task 1.5: Add `recordAttempt3` / `hasAttempted3` to `DiscoveryState`

**Files:**
- Modify: `packages/engine/src/combine/discovery-state.ts`
- Modify: `packages/engine/tests/discovery-state.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
describe('DiscoveryState — ternary attempts', () => {
  it('records a ternary attempt with a sorted-triple key', () => {
    const ds = new DiscoveryState();
    ds.recordAttempt3('fire_damage', 'cold_damage', 'lightning_damage');
    expect(ds.hasAttempted3('fire_damage', 'cold_damage', 'lightning_damage')).toBe(true);
  });

  it('ternary attempt is order-invariant', () => {
    const ds = new DiscoveryState();
    ds.recordAttempt3('c', 'a', 'b');
    expect(ds.hasAttempted3('a', 'b', 'c')).toBe(true);
    expect(ds.hasAttempted3('b', 'c', 'a')).toBe(true);
  });

  it('ternary and binary attempt namespaces do not collide', () => {
    const ds = new DiscoveryState();
    ds.recordAttempt('a', 'b');           // key "a+b"
    ds.recordAttempt3('a', 'b', 'c');     // key "a+b+c"
    expect(ds.hasAttempted('a', 'b')).toBe(true);
    expect(ds.hasAttempted3('a', 'b', 'c')).toBe(true);
    // Cross-lookups must be false
    expect(ds.hasAttempted3('a', 'b', 'b')).toBe(false);
  });

  it('serialize/deserialize round-trips ternary attempts', () => {
    const ds = new DiscoveryState();
    ds.recordAttempt3('x', 'y', 'z');
    const restored = DiscoveryState.deserialize(ds.serialize());
    expect(restored.hasAttempted3('x', 'y', 'z')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && pnpm vitest run tests/discovery-state.test.ts -t ternary`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Implement**

Edit `packages/engine/src/combine/discovery-state.ts`. Add:

```ts
recordAttempt3(idA: string, idB: string, idC: string): void {
  this.attempted.add(DiscoveryState.comboKey3(idA, idB, idC));
}

hasAttempted3(idA: string, idB: string, idC: string): boolean {
  return this.attempted.has(DiscoveryState.comboKey3(idA, idB, idC));
}

static comboKey3(idA: string, idB: string, idC: string): string {
  return [idA, idB, idC].sort().join('+');
}
```

Serialize/deserialize need no changes — all attempts live in the same `Set<string>` and round-trip as strings.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && pnpm vitest run tests/discovery-state.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/combine/discovery-state.ts packages/engine/tests/discovery-state.test.ts
git commit -m "feat(engine): DiscoveryState.recordAttempt3 + hasAttempted3"
```

---

### Task 1.6: Update `CompoundAffixDef` schema + `DataRegistry.getTernaryCombination`

**Files:**
- Modify: `packages/engine/src/data/schemas.ts` (`CompoundAffixDefSchema`)
- Modify: `packages/engine/src/types/combination.ts`
- Modify: `packages/engine/src/data/registry.ts`
- Modify: `packages/engine/tests/data.test.ts`

- [ ] **Step 1: Write failing test**

Append to `data.test.ts`:

```ts
describe('DataRegistry — ternary compound lookup', () => {
  it('getTernaryCombination resolves a 3-component compound (once data is added)', () => {
    // Placeholder test — will pass once the 15 recipes are added in Chunk 5/6.
    // For now we only verify the method exists and returns null for unknown triples.
    const data = loadAndValidateData();
    const registry = new DataRegistry(
      data.affixes, data.combinations, data.synergies,
      data.baseItems, data.balance, data.recipes,
    );
    expect(registry.getTernaryCombination('x', 'y', 'z')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && pnpm vitest run tests/data.test.ts -t getTernaryCombination`
Expected: FAIL — method does not exist.

- [ ] **Step 3: Widen the `CompoundAffixDef` schema**

Edit `packages/engine/src/data/schemas.ts` (the `CompoundAffixDefSchema`):

```ts
const CompoundAffixDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  weaponFlavorText: z.string(),
  armorFlavorText: z.string(),
  components: z.union([
    z.tuple([z.string(), z.string()]),
    z.tuple([z.string(), z.string(), z.string()]),
  ]),
  fluxCost: z.number().int().positive(),
  slotCost: z.number().int().positive(),
  weaponEffect: z.array(StatModifierSchema),
  armorEffect: z.array(StatModifierSchema),
  tags: z.array(z.string()),
});
```

Edit `packages/engine/src/types/combination.ts` to match:

```ts
export interface CompoundAffixDef {
  id: string;
  name: string;
  description: string;
  weaponFlavorText: string;
  armorFlavorText: string;
  components: [string, string] | [string, string, string];
  fluxCost: number;
  slotCost: number;
  weaponEffect: StatModifier[];
  armorEffect: StatModifier[];
  tags: AffixTag[];
}
```

- [ ] **Step 4: Add `getTernaryCombination` to `DataRegistry`**

Edit `packages/engine/src/data/registry.ts`. In the constructor, after the binary `combinationMap` build:

```ts
this.ternaryCombinationMap = new Map();
for (const combo of combinations) {
  if (combo.components.length === 3) {
    const [a, b, c] = combo.components;
    const key = [a, b, c].sort().join('+');
    this.ternaryCombinationMap.set(key, combo);
  }
}
```

Declare the field near the top of the class:

```ts
private ternaryCombinationMap: Map<string, CompoundAffixDef>;
```

Add the public method (next to `getCombination`):

```ts
getTernaryCombination(
  affixId1: string,
  affixId2: string,
  affixId3: string,
): CompoundAffixDef | null {
  const key = [affixId1, affixId2, affixId3].sort().join('+');
  return this.ternaryCombinationMap.get(key) ?? null;
}
```

The existing binary `combinationMap` build must guard against 3-component compounds. Update it to:

```ts
this.combinationMap = new Map();
this.combinationById = new Map();
for (const combo of combinations) {
  this.combinationById.set(combo.id, combo);
  if (combo.components.length === 2) {
    const [a, b] = combo.components;
    const key = combinationKey(a, b);
    this.combinationMap.set(key, combo);
  }
}
```

- [ ] **Step 5: Run tests**

Run: `cd packages/engine && pnpm vitest run tests/data.test.ts`
Expected: all tests PASS, including the new one and all existing `getCombination` tests.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/data/schemas.ts packages/engine/src/types/combination.ts packages/engine/src/data/registry.ts packages/engine/tests/data.test.ts
git commit -m "feat(engine): DataRegistry.getTernaryCombination + 3-tuple components in CompoundAffixDef"
```

---

### Task 1.7: Chunk 1 regression gate

- [ ] **Step 1: Run the full engine suite**

Run: `cd packages/engine && pnpm vitest run`
Expected: 100% green. If anything fails, stop and fix before moving to Chunk 2.

- [ ] **Step 2: Type-check all packages**

Run: `pnpm -r exec tsc --noEmit`
Expected: clean.

---

## Chunk 2: Engine `combine3` path

Implements the core combine behavior. Starts with quality helpers and additive result-type extensions, then builds `combine3` and `previewCombineTriple`.

### Task 2.1: Add `computeAverageQualityN`

**Files:**
- Modify: `packages/engine/src/combine/combine-quality.ts`
- Modify: `packages/engine/tests/combine-quality.test.ts`

- [ ] **Step 1: Write failing test**

Append to `combine-quality.test.ts`:

```ts
import { computeAverageQualityN } from '../src/combine/combine-quality.js';

describe('computeAverageQualityN', () => {
  it('averages effective values over N gems', () => {
    const a = createGem('a', 'fire_damage', 1, 'common');  // EV 1
    const b = createGem('b', 'cold_damage', 2, 'common');  // EV 2
    const c = createGem('c', 'lightning_damage', 3, 'common'); // EV 3
    expect(computeAverageQualityN(a, b, c)).toBeCloseTo(2.0);
  });

  it('works for binary too (parity with computeAverageQuality)', () => {
    const a = createGem('a', 'fire_damage', 1, 'common');
    const b = createGem('b', 'cold_damage', 3, 'common');
    expect(computeAverageQualityN(a, b)).toBeCloseTo(computeAverageQuality(a, b));
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd packages/engine && pnpm vitest run tests/combine-quality.test.ts -t computeAverageQualityN`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

Edit `packages/engine/src/combine/combine-quality.ts`:

```ts
export function computeAverageQualityN(...gems: GemInstance[]): number {
  if (gems.length === 0) return 0;
  const sum = gems.reduce(
    (acc, g) => acc + calculateEffectiveValue(g.tier, g.rarity),
    0,
  );
  return sum / gems.length;
}
```

- [ ] **Step 4: Run test — verify PASS**

Run: `cd packages/engine && pnpm vitest run tests/combine-quality.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/combine/combine-quality.ts packages/engine/tests/combine-quality.test.ts
git commit -m "feat(engine): computeAverageQualityN for n-gem combines"
```

---

### Task 2.2: Extend `CombineResult` and `CombinePreview` (additive fields)

**Files:**
- Modify: `packages/engine/src/combine/combination-engine.ts:20-40`

- [ ] **Step 1: Edit the interfaces**

Replace lines 20–40:

```ts
export interface CombineResult {
  gem: GemInstance;
  layer: CombineLayer;
  recipeId?: string;
  isNewDiscovery: boolean;
  consumedUids: string[];  // NEW — uids to remove from stockpile
  ejectedUid?: string;     // NEW — combine3 fallback only
}

export interface CombineConfig {
  matchingRarityBonus: number;
}

export interface CombinePreview {
  known: boolean;
  layer: CombineLayer;
  gem: GemInstance | null;
  recipeId?: string;
  fallbackPair?: [string, string];  // NEW — only set by previewCombineTriple on fallback
  ejectedUid?: string;              // NEW — gem that would remain in stockpile
}
```

- [ ] **Step 2: Populate `consumedUids` in the existing binary `combine()`**

Edit the 5 places in `combination-engine.ts` that return a `CombineResult` from a binary path — `trySignature` (line ~150), `tryCategory` (line ~187), `genericSameType` (two returns around lines 232, 247), `genericDifferentType` (two returns around lines 282, 292). For each, add `consumedUids: [gemA.uid, gemB.uid]` to the returned object.

Example diff for `trySignature`:

```ts
return {
  gem,
  layer: 'signature',
  recipeId: recipe.id,
  isNewDiscovery,
  consumedUids: [gemA.uid, gemB.uid],
};
```

- [ ] **Step 3: Run the engine suite — existing tests still pass**

Run: `cd packages/engine && pnpm vitest run`
Expected: PASS. Existing tests don't assert on `consumedUids`, so additive field is invisible.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/combine/combination-engine.ts
git commit -m "feat(engine): additive consumedUids/ejectedUid on CombineResult + CombinePreview"
```

---

### Task 2.3: Scaffold `combine3` — ternary-match path only

**Files:**
- Modify: `packages/engine/src/combine/combination-engine.ts`
- Create: `packages/engine/tests/combination-engine-ternary.test.ts`

- [ ] **Step 1: Write failing tests (ternary match path only — no fallback yet)**

Create `packages/engine/tests/combination-engine-ternary.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CombinationEngine } from '../src/combine/combination-engine.js';
import { RecipeRegistry, type RecipeDefinition } from '../src/combine/recipe-registry.js';
import { DiscoveryState } from '../src/combine/discovery-state.js';
import { createGem } from '../src/types/gem.js';

const ternaryRecipes: RecipeDefinition[] = [
  {
    id: 'meltdown', name: 'Meltdown', type: 'signature3',
    components: [
      { kind: 'affix', id: 'fire_damage' },
      { kind: 'affix', id: 'cold_damage' },
      { kind: 'affix', id: 'lightning_damage' },
    ],
    outputAffixId: 'meltdown',
    outputBonusEffects: [
      { stat: 'compound.meltdown.active', op: 'flat', value: 1 },
    ],
    maxDepthContribution: 2,
    tags: ['compound', 'elemental'],
  },
];

const categoryMap: Record<string, string> = {
  fire_damage: 'offensive',
  cold_damage: 'offensive',
  lightning_damage: 'offensive',
  chance_on_hit: 'trigger',
};

describe('combine3 — ternary signature match', () => {
  let engine: CombinationEngine;
  let discovery: DiscoveryState;

  beforeEach(() => {
    const registry = new RecipeRegistry(ternaryRecipes);
    discovery = new DiscoveryState();
    engine = new CombinationEngine(registry, discovery, categoryMap);
  });

  it('builds the expected output gem', () => {
    const a = createGem('a', 'fire_damage', 2, 'rare');
    const b = createGem('b', 'cold_damage', 2, 'rare');
    const c = createGem('c', 'lightning_damage', 2, 'rare');

    const result = engine.combine3(a, b, c, 'out', 'a');

    expect(result.layer).toBe('signature');
    expect(result.recipeId).toBe('meltdown');
    expect(result.gem.affixId).toBe('meltdown');
    expect(result.gem.outputBonusEffects).toEqual([
      { stat: 'compound.meltdown.active', op: 'flat', value: 1 },
    ]);
    expect(result.consumedUids).toEqual(['a', 'b', 'c']);
    expect(result.ejectedUid).toBeUndefined();
    expect(result.isNewDiscovery).toBe(true);
  });

  it('recipeDepth = max(parents) + maxDepthContribution', () => {
    const a = createGem('a', 'fire_damage', 1, 'common', { recipeDepth: 1 });
    const b = createGem('b', 'cold_damage', 1, 'common', { recipeDepth: 3 });
    const c = createGem('c', 'lightning_damage', 1, 'common', { recipeDepth: 2 });
    const result = engine.combine3(a, b, c, 'out');
    expect(result.gem.recipeDepth).toBe(3 + 2);  // max=3 + maxDepthContribution=2
  });

  it('records ternary attempt on discovery state', () => {
    const a = createGem('a', 'fire_damage', 1, 'common');
    const b = createGem('b', 'cold_damage', 1, 'common');
    const c = createGem('c', 'lightning_damage', 1, 'common');
    engine.combine3(a, b, c, 'out');
    expect(discovery.hasAttempted3('fire_damage', 'cold_damage', 'lightning_damage')).toBe(true);
  });

  it('second combine is not a new discovery', () => {
    const a = createGem('a', 'fire_damage', 1, 'common');
    const b = createGem('b', 'cold_damage', 1, 'common');
    const c = createGem('c', 'lightning_damage', 1, 'common');
    engine.combine3(a, b, c, 'out1');
    const second = engine.combine3(a, b, c, 'out2');
    expect(second.isNewDiscovery).toBe(false);
  });

  it('unanimous rarity → bonus; mixed → no bonus', () => {
    // 3 rare → bonus applied
    const a1 = createGem('a', 'fire_damage', 2, 'rare');
    const b1 = createGem('b', 'cold_damage', 2, 'rare');
    const c1 = createGem('c', 'lightning_damage', 2, 'rare');
    const r1 = engine.combine3(a1, b1, c1, 'out1');

    // 2 rare + 1 magic → no bonus (rebuild engine for clean discovery)
    const registry = new RecipeRegistry(ternaryRecipes);
    const engine2 = new CombinationEngine(registry, new DiscoveryState(), categoryMap);
    const a2 = createGem('a', 'fire_damage', 2, 'rare');
    const b2 = createGem('b', 'cold_damage', 2, 'rare');
    const c2 = createGem('c', 'lightning_damage', 2, 'magic');
    const r2 = engine2.combine3(a2, b2, c2, 'out2');

    // Unanimous quality should be >= mixed quality
    const q1 = r1.gem.tier * (r1.gem.rarity === 'epic' ? 2 : 1.5);
    const q2 = r2.gem.tier * (r2.gem.rarity === 'epic' ? 2 : 1.5);
    expect(q1).toBeGreaterThanOrEqual(q2);
  });

  it('non-combinable gem throws', () => {
    const a = createGem('a', 'fire_damage', 1, 'common', { combinable: false });
    const b = createGem('b', 'cold_damage', 1, 'common');
    const c = createGem('c', 'lightning_damage', 1, 'common');
    expect(() => engine.combine3(a, b, c, 'out')).toThrow();
  });

  it('is order-invariant', () => {
    const a = createGem('a', 'fire_damage', 2, 'rare');
    const b = createGem('b', 'cold_damage', 2, 'rare');
    const c = createGem('c', 'lightning_damage', 2, 'rare');
    const perms = [
      [a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a],
    ];
    const registry = new RecipeRegistry(ternaryRecipes);
    for (const [x, y, z] of perms) {
      const eng = new CombinationEngine(registry, new DiscoveryState(), categoryMap);
      const r = eng.combine3(x, y, z, 'out', x.uid);
      expect(r.recipeId).toBe('meltdown');
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && pnpm vitest run tests/combination-engine-ternary.test.ts`
Expected: FAIL — `engine.combine3 is not a function`.

- [ ] **Step 3: Implement `combine3` (ternary-match path only; fallback stubbed to throw)**

Edit `packages/engine/src/combine/combination-engine.ts`. Add imports as needed:

```ts
import { computeAverageQualityN } from './combine-quality.js';
```

Add the public method inside the class:

```ts
combine3(
  gemA: GemInstance,
  gemB: GemInstance,
  gemC: GemInstance,
  outputUid: string,
  keepGemUid?: string,
): CombineResult {
  // 1. Non-combinable rejection
  for (const g of [gemA, gemB, gemC]) {
    if (!g.combinable) throw new Error(`Gem ${g.uid} is not combinable`);
  }

  // 2. Record ternary attempt
  this.discovery.recordAttempt3(gemA.affixId, gemB.affixId, gemC.affixId);

  // 3. Try ternary signature
  const recipe = this.registry.findTernaryRecipe(gemA, gemB, gemC);
  if (recipe) {
    const avgQ = computeAverageQualityN(gemA, gemB, gemC);
    const unanimousRarity =
      gemA.rarity === gemB.rarity && gemB.rarity === gemC.rarity;
    const boosted = applyMatchingRarityBonus(
      avgQ, unanimousRarity, this.config.matchingRarityBonus,
    );
    const { tier, rarity } = determineOutputTierRarity(boosted);

    const recipeDepth =
      Math.max(gemA.recipeDepth, gemB.recipeDepth, gemC.recipeDepth)
      + recipe.maxDepthContribution;
    const tags = [...new Set([
      ...recipe.tags, ...gemA.tags, ...gemB.tags, ...gemC.tags,
    ])];

    const isNewDiscovery = !this.discovery.isDiscovered(recipe.id);
    this.discovery.recordDiscovery(recipe.id);

    const gem = createGem(outputUid, recipe.outputAffixId, tier, rarity, {
      sourceRecipe: recipe.id,
      recipeDepth,
      tags,
      outputBonusEffects: recipe.outputBonusEffects,
    });

    return {
      gem,
      layer: 'signature',
      recipeId: recipe.id,
      isNewDiscovery,
      consumedUids: [gemA.uid, gemB.uid, gemC.uid],
    };
  }

  // 4. Fallback — implemented in next task
  throw new Error('combine3 fallback not yet implemented');
}
```

Also import `applyMatchingRarityBonus`, `determineOutputTierRarity` (they're already imported for binary). Import `computeAverageQualityN` from `./combine-quality.js`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && pnpm vitest run tests/combination-engine-ternary.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/combine/combination-engine.ts packages/engine/tests/combination-engine-ternary.test.ts
git commit -m "feat(engine): combine3 ternary-signature match path"
```

---

### Task 2.4: Implement `combine3` KEEP-anchored fallback

**Files:**
- Modify: `packages/engine/src/combine/combination-engine.ts`
- Modify: `packages/engine/tests/combination-engine-ternary.test.ts`

- [ ] **Step 1: Write failing fallback tests**

Append to the ternary test file:

```ts
describe('combine3 — KEEP-anchored fallback', () => {
  const binarySignatures: RecipeDefinition[] = [
    {
      id: 'ignite', name: 'Ignite', type: 'signature',
      components: [
        { kind: 'affix', id: 'chance_on_hit' },
        { kind: 'affix', id: 'fire_damage' },
      ],
      outputAffixId: 'ignite',
      outputBonusEffects: [{ stat: 'compound.ignite.chance', op: 'flat', value: 0.15 }],
      maxDepthContribution: 1,
      tags: ['compound', 'fire', 'trigger'],
    },
  ];

  function makeEngine(recipes: RecipeDefinition[]) {
    const registry = new RecipeRegistry(recipes);
    const discovery = new DiscoveryState();
    const engine = new CombinationEngine(registry, discovery, categoryMap);
    return { engine, discovery };
  }

  it('falls back to a KEEP-anchored binary signature; ejects third gem', () => {
    const { engine, discovery } = makeEngine(binarySignatures);
    const keep = createGem('keep', 'chance_on_hit', 1, 'common');
    const other1 = createGem('o1', 'fire_damage', 1, 'common');     // pairs with KEEP for Ignite
    const other2 = createGem('o2', 'lightning_damage', 1, 'common'); // irrelevant

    const result = engine.combine3(keep, other1, other2, 'out', 'keep');

    expect(result.layer).toBe('signature');
    expect(result.recipeId).toBe('ignite');
    expect(result.consumedUids.sort()).toEqual(['keep', 'o1'].sort());
    expect(result.ejectedUid).toBe('o2');
    // Ternary attempt AND winning-pair binary attempt both recorded
    expect(discovery.hasAttempted3('chance_on_hit', 'fire_damage', 'lightning_damage')).toBe(true);
    expect(discovery.hasAttempted('chance_on_hit', 'fire_damage')).toBe(true);
  });

  it('non-KEEP pair is NOT chosen even if it would produce a signature', () => {
    // Construct a case where (other1, other2) would match a binary signature
    // but (KEEP, other1) and (KEEP, other2) do not.
    const { engine } = makeEngine(binarySignatures);
    const keep = createGem('keep', 'flat_hp', 1, 'common');          // no binary match with either other
    const other1 = createGem('o1', 'chance_on_hit', 1, 'common');
    const other2 = createGem('o2', 'fire_damage', 1, 'common');

    const result = engine.combine3(keep, other1, other2, 'out', 'keep');

    // Must NOT have resolved to Ignite (that would need the non-KEEP pair)
    expect(result.recipeId).toBeUndefined();
    // KEEP must have been part of the consumed pair (even if only a generic upgrade)
    expect(result.consumedUids).toContain('keep');
  });

  it('higher-layer KEEP pair wins over lower-layer KEEP pair', () => {
    const signatures: RecipeDefinition[] = [
      ...binarySignatures,
      // Make (keep, other2) a category hit; (keep, other1) a signature hit.
      // Ignite already defined for (chance_on_hit, fire_damage).
      // Add a category rule so (chance_on_hit, armor_rating) yields a category combo.
      {
        id: 'cat_trigger_any', name: 'Trigger Fusion', type: 'category',
        categoryRule: { inputA: 'trigger', inputB: 'defensive' },
        outputAffixId: '__trigger_def__',
        outputBonusEffects: [{ stat: 'armor', op: 'flat', value: 1 }],
        maxDepthContribution: 1, tags: [],
      },
    ];
    const mapExt = { ...categoryMap, fire_damage: 'offensive', armor_rating: 'defensive' };
    const registry = new RecipeRegistry(signatures);
    const engine = new CombinationEngine(registry, new DiscoveryState(), mapExt);

    const keep = createGem('keep', 'chance_on_hit', 1, 'common');
    const other1 = createGem('o1', 'fire_damage', 1, 'common');     // KEEP+o1 = Ignite (signature)
    const other2 = createGem('o2', 'armor_rating', 1, 'common');    // KEEP+o2 = category

    const result = engine.combine3(keep, other1, other2, 'out', 'keep');

    expect(result.recipeId).toBe('ignite'); // signature beats category
    expect(result.ejectedUid).toBe('o2');
  });

  it('ternary match short-circuits: binary discovery is NOT recorded', () => {
    const recipes = [...ternaryRecipes, ...binarySignatures];
    const { engine, discovery } = makeEngine(recipes);
    const a = createGem('a', 'fire_damage', 1, 'common');
    const b = createGem('b', 'cold_damage', 1, 'common');
    const c = createGem('c', 'lightning_damage', 1, 'common');

    engine.combine3(a, b, c, 'out');

    // Only the ternary key should be in discovery; no binary attempts recorded.
    expect(discovery.hasAttempted3('fire_damage', 'cold_damage', 'lightning_damage')).toBe(true);
    expect(discovery.hasAttempted('fire_damage', 'cold_damage')).toBe(false);
    expect(discovery.hasAttempted('fire_damage', 'lightning_damage')).toBe(false);
    expect(discovery.hasAttempted('cold_damage', 'lightning_damage')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && pnpm vitest run tests/combination-engine-ternary.test.ts -t fallback`
Expected: FAIL (some with the "not yet implemented" throw, others with wrong behavior).

- [ ] **Step 3: Implement the fallback**

Edit `packages/engine/src/combine/combination-engine.ts`. Replace the placeholder throw at the bottom of `combine3` with:

```ts
  // 4. Fallback: KEEP-anchored pair + eject third
  const keep = keepGemUid
    ? [gemA, gemB, gemC].find(g => g.uid === keepGemUid) ?? gemA
    : gemA;
  const others = [gemA, gemB, gemC].filter(g => g.uid !== keep.uid);
  if (others.length !== 2) {
    throw new Error('combine3 fallback: expected exactly 2 non-KEEP gems');
  }
  const [o1, o2] = others;

  const layerRank: Record<CombineLayer, number> = {
    signature: 3, category: 2, generic: 1,
  };

  // Probe both KEEP-anchored pairs via previewCombine (does not record attempts).
  const probe1 = this.previewCombine(keep, o1);
  const probe2 = this.previewCombine(keep, o2);

  // Pick the winning pair.
  const cand: Array<{ other: GemInstance; preview: CombinePreview | null }> = [
    { other: o1, preview: probe1 },
    { other: o2, preview: probe2 },
  ];
  cand.sort((a, b) => {
    const la = a.preview ? layerRank[a.preview.layer] : 0;
    const lb = b.preview ? layerRank[b.preview.layer] : 0;
    if (la !== lb) return lb - la;  // higher layer first
    const eva = calculateEffectiveValue(keep.tier, keep.rarity)
      + calculateEffectiveValue(a.other.tier, a.other.rarity);
    const evb = calculateEffectiveValue(keep.tier, keep.rarity)
      + calculateEffectiveValue(b.other.tier, b.other.rarity);
    return evb - eva;  // higher EV sum first
  });

  const winner = cand[0];
  const ejected = cand[1].other;

  // Re-run the real binary combine() on the winning pair to commit discovery + build the output.
  const binaryResult = this.combine(keep, winner.other, outputUid, keep.uid);

  return {
    ...binaryResult,
    consumedUids: [keep.uid, winner.other.uid],
    ejectedUid: ejected.uid,
  };
```

Ensure `calculateEffectiveValue` is imported (it is already imported at the top of this file for the existing binary path).

- [ ] **Step 4: Run tests**

Run: `cd packages/engine && pnpm vitest run tests/combination-engine-ternary.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run the full engine suite**

Run: `cd packages/engine && pnpm vitest run`
Expected: all PASS. The existing binary tests must still pass untouched.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/combine/combination-engine.ts packages/engine/tests/combination-engine-ternary.test.ts
git commit -m "feat(engine): combine3 KEEP-anchored fallback + eject"
```

---

### Task 2.5: Implement `previewCombineTriple`

**Files:**
- Modify: `packages/engine/src/combine/combination-engine.ts`
- Modify: `packages/engine/tests/combination-engine-ternary.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
describe('previewCombineTriple', () => {
  it('returns a preview for a known ternary recipe', () => {
    const { engine } = makeEngine(ternaryRecipes);
    const a = createGem('a', 'fire_damage', 1, 'common');
    const b = createGem('b', 'cold_damage', 1, 'common');
    const c = createGem('c', 'lightning_damage', 1, 'common');

    // First: unknown (never attempted)
    let preview = engine.previewCombineTriple(a, b, c);
    expect(preview?.known).toBe(false);
    expect(preview?.layer).toBe('signature');
    expect(preview?.fallbackPair).toBeUndefined();

    // Commit it, then preview again
    engine.combine3(a, b, c, 'out');
    preview = engine.previewCombineTriple(a, b, c);
    expect(preview?.known).toBe(true);
    expect(preview?.gem?.affixId).toBe('meltdown');
  });

  it('returns fallback preview when no ternary match', () => {
    const { engine } = makeEngine(binarySignatures);
    const keep = createGem('keep', 'chance_on_hit', 1, 'common');
    const o1 = createGem('o1', 'fire_damage', 1, 'common');
    const o2 = createGem('o2', 'lightning_damage', 1, 'common');

    const preview = engine.previewCombineTriple(keep, o1, o2);
    expect(preview?.fallbackPair).toBeDefined();
    expect(preview?.fallbackPair?.sort()).toEqual(['keep', 'o1'].sort());
    expect(preview?.ejectedUid).toBe('o2');
  });

  it('previewCombineTriple does NOT record an attempt', () => {
    const { engine, discovery } = makeEngine(ternaryRecipes);
    const a = createGem('a', 'fire_damage', 1, 'common');
    const b = createGem('b', 'cold_damage', 1, 'common');
    const c = createGem('c', 'lightning_damage', 1, 'common');
    engine.previewCombineTriple(a, b, c);
    expect(discovery.hasAttempted3('fire_damage', 'cold_damage', 'lightning_damage')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd packages/engine && pnpm vitest run tests/combination-engine-ternary.test.ts -t previewCombineTriple`
Expected: FAIL — method missing.

- [ ] **Step 3: Implement**

Edit `combination-engine.ts`. Add the public method, mirroring the existing `previewCombine` pattern (use a cloned discovery state, run `combine3`, catch exceptions):

```ts
previewCombineTriple(
  gemA: GemInstance,
  gemB: GemInstance,
  gemC: GemInstance,
): CombinePreview | null {
  if (!gemA.combinable || !gemB.combinable || !gemC.combinable) return null;

  const tempDiscovery = this.discovery.clone();
  const tempEngine = new CombinationEngine(
    this.registry, tempDiscovery, this.categoryMap, this.config,
  );

  const ternaryRecipe = this.registry.findTernaryRecipe(gemA, gemB, gemC);
  const ternaryKnown = this.discovery.hasAttempted3(
    gemA.affixId, gemB.affixId, gemC.affixId,
  );

  try {
    const result = tempEngine.combine3(gemA, gemB, gemC, '__preview__');
    const preview: CombinePreview = {
      known: ternaryRecipe ? ternaryKnown : false,
      layer: result.layer,
      gem: ternaryRecipe ? (ternaryKnown ? result.gem : null) : result.gem,
      recipeId: ternaryRecipe ? (ternaryKnown ? result.recipeId : undefined) : result.recipeId,
    };
    // If fallback fired, populate fallbackPair + ejectedUid
    if (!ternaryRecipe) {
      preview.fallbackPair = result.consumedUids as [string, string];
      preview.ejectedUid = result.ejectedUid;
    }
    return preview;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests — verify PASS**

Run: `cd packages/engine && pnpm vitest run tests/combination-engine-ternary.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/combine/combination-engine.ts packages/engine/tests/combination-engine-ternary.test.ts
git commit -m "feat(engine): previewCombineTriple with fallback-pair reporting"
```

---

### Task 2.6: Chunk 2 regression gate

- [ ] **Step 1: Run the full engine suite**

Run: `cd packages/engine && pnpm vitest run`
Expected: 100% green. If anything in the existing binary tests broke, that's a regression — stop and fix.

---

## Chunk 3: Plan + Action Layer

Wires the ternary combine into the forge-plan layer so the UI can dispatch it.

### Task 3.1: Add `combine3` to `ForgeAction`

**Files:**
- Modify: `packages/engine/src/types/forge-action.ts`

- [ ] **Step 1: Edit the type**

Add the new variant to the union:

```ts
export type ForgeAction =
  | { kind: 'socket_gem'; gemUid: string; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'unsocket_gem'; gemUid: string }
  | { kind: 'combine'; gemUid1: string; gemUid2: string; keepGemUid?: string }
  | { kind: 'combine3'; gemUid1: string; gemUid2: string; gemUid3: string; keepGemUid?: string }
  | { kind: 'boost_combine' }
  | ...; // rest unchanged
```

Match the exact shape of the existing union — preserve order and formatting.

- [ ] **Step 2: Type-check**

Run: `pnpm -r exec tsc --noEmit`
Expected: new type errors will flag any switch statements missing a case for `'combine3'`. Fix minimal things to satisfy the compiler (add fall-through `case 'combine3':` cases that throw `not implemented` — real handlers come in the next task).

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/types/forge-action.ts packages/engine/src/forge/forge-plan.ts packages/engine/src/forge/forge-state.ts
git commit -m "feat(engine): add combine3 variant to ForgeAction (handlers stubbed)"
```

(If the stubs touched more files than expected, add them. A common site is exhaustiveness-asserting `default` branches.)

---

### Task 3.2: Implement `planCombine3`

**Files:**
- Modify: `packages/engine/src/forge/forge-plan.ts`
- Modify: `packages/engine/tests/forge-plan.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `forge-plan.test.ts` a new describe block. Seed the plan's stockpile with gems matching a ternary recipe from real data (Meltdown once Chunk 5 lands — but for now, **the test uses a recipe-registry override**: build a fake engine instance with a minimal ternary recipe and verify the plan layer correctly projects `consumedUids` / `ejectedUid` into stockpile state).

Actually, easier: skip registry substitution and instead test the plan layer against **fallback behavior** using existing binary recipes (Ignite). We assert that:
- Ternary match (covered by Chunk 5 integration test once data lands)
- Fallback: two of three consumed + locked; third remains in stockpile.

```ts
describe('applyPlanAction — combine3', () => {
  it('fallback: consumes winning pair, leaves third in stockpile', () => {
    const state = makeForgeState();
    const plan = createForgePlan(state, registry);
    // gems: gem1=fire_damage, gem5=chance_on_hit, gem3=flat_hp (irrelevant)
    // (gem5, gem1) form Ignite; gem3 is ejected.
    const result = applyPlanAction(plan, {
      kind: 'combine3',
      gemUid1: 'gem5', gemUid2: 'gem1', gemUid3: 'gem3',
      keepGemUid: 'gem5',
    }, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // gem5 and gem1 consumed, gem3 remains
    expect(result.plan.stockpile.find(g => g.uid === 'gem5')).toBeUndefined();
    expect(result.plan.stockpile.find(g => g.uid === 'gem1')).toBeUndefined();
    expect(result.plan.stockpile.find(g => g.uid === 'gem3')).toBeDefined();
    // Output gem added
    expect(result.plan.stockpile.some(g => g.sourceRecipe === 'ignite')).toBe(true);
    // Only consumed uids are locked
    expect(result.plan.lockedGemUids.has('gem5')).toBe(true);
    expect(result.plan.lockedGemUids.has('gem1')).toBe(true);
    expect(result.plan.lockedGemUids.has('gem3')).toBe(false);
    // Action logged
    expect(result.plan.actionLog[result.plan.actionLog.length - 1]).toMatchObject({
      kind: 'combine3',
    });
  });

  it('fails when a gem uid is not in stockpile', () => {
    const state = makeForgeState();
    const plan = createForgePlan(state, registry);
    const result = applyPlanAction(plan, {
      kind: 'combine3',
      gemUid1: 'gem1', gemUid2: 'gem5', gemUid3: 'nonexistent',
      keepGemUid: 'gem1',
    }, registry);
    expect(result.ok).toBe(false);
  });

  it('fails when a gem is non-combinable', () => {
    const gems = [
      createGem('a', 'fire_damage', 1, 'common'),
      createGem('b', 'chance_on_hit', 1, 'common'),
      createGem('c', 'flat_hp', 1, 'common', { combinable: false }),
    ];
    const state = createForgeState(gems, 'iron_sword', 'iron_armor', 1, data.balance, false);
    const plan = createForgePlan(state, registry);
    const result = applyPlanAction(plan, {
      kind: 'combine3',
      gemUid1: 'a', gemUid2: 'b', gemUid3: 'c',
      keepGemUid: 'a',
    }, registry);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd packages/engine && pnpm vitest run tests/forge-plan.test.ts -t combine3`
Expected: FAIL — handler not implemented.

- [ ] **Step 3: Implement**

Edit `packages/engine/src/forge/forge-plan.ts`. In the action dispatch switch:

```ts
case 'combine3': return planCombine3(plan, action, registry);
```

Then define `planCombine3` below `planCombine` (mirror it, using `consumedUids` from the engine result):

```ts
function planCombine3(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'combine3' }>,
  registry: DataRegistry,
): PlanResult {
  const find = (uid: string) => plan.stockpile.find(g => g.uid === uid);
  const g1 = find(action.gemUid1);
  const g2 = find(action.gemUid2);
  const g3 = find(action.gemUid3);
  if (!g1 || !g2 || !g3) return { ok: false, error: 'Gem not found in stockpile' };
  if (!g1.combinable || !g2.combinable || !g3.combinable) {
    return { ok: false, error: 'Gem is not combinable' };
  }

  const recipeRegistry = registry.getRecipeRegistry();
  const categoryMap: Record<string, string> = {};
  for (const affix of registry.getAllAffixes()) categoryMap[affix.id] = affix.category;
  const engine = new CombinationEngine(recipeRegistry, new DiscoveryState(), categoryMap);

  const outputUid = `combined3_${action.gemUid1}_${action.gemUid2}_${action.gemUid3}`;
  let result;
  try {
    result = engine.combine3(g1, g2, g3, outputUid, action.keepGemUid);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const next = clonePlan(plan);
  // Remove consumed uids from stockpile
  for (const uid of result.consumedUids) {
    const idx = next.stockpile.findIndex(g => g.uid === uid);
    if (idx !== -1) next.stockpile.splice(idx, 1);
  }
  // Push output gem
  next.stockpile.push(result.gem);
  // Lock only consumed uids
  for (const uid of result.consumedUids) next.lockedGemUids.add(uid);
  // Ejected uid (if any) remains in stockpile, untouched.

  next.actionLog.push(action);
  return { ok: true, plan: next };
}
```

- [ ] **Step 4: Run tests — verify PASS**

Run: `cd packages/engine && pnpm vitest run tests/forge-plan.test.ts`
Expected: all PASS (including the 3 new `combine3` tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/forge-plan.ts packages/engine/tests/forge-plan.test.ts
git commit -m "feat(engine): planCombine3 consumes winning pair, leaves ejected gem in stockpile"
```

---

### Task 3.3: Wire `combine3` into `forge-state.applyForgeAction`

**Files:**
- Modify: `packages/engine/src/forge/forge-state.ts`
- Modify: `packages/engine/tests/forge.test.ts`

- [ ] **Step 1: Write failing test**

Append to `forge.test.ts`:

```ts
it('applyForgeAction — combine3 dispatches correctly', () => {
  const state = makeState();
  const action: ForgeAction = {
    kind: 'combine3',
    gemUid1: 'gem2', gemUid2: 'gem1', gemUid3: 'gem3',
    keepGemUid: 'gem2',
  };
  const result = applyForgeAction(state, action, registry);
  expect(result.ok).toBe(true);
});
```

- [ ] **Step 2: Run test — verify FAIL**

Run: `cd packages/engine && pnpm vitest run tests/forge.test.ts -t combine3`
Expected: FAIL — unhandled action kind.

- [ ] **Step 3: Implement**

Edit `packages/engine/src/forge/forge-state.ts`. In the `applyForgeAction` switch, add:

```ts
case 'combine3':
  return applyCombine3(state, action, registry);
```

And implement `applyCombine3` mirroring the existing `applyCombine`:

```ts
function applyCombine3(
  state: ForgeState,
  action: Extract<ForgeAction, { kind: 'combine3' }>,
  registry: DataRegistry,
): ApplyResult {
  const plan = createForgePlan(state, registry);
  const planResult = applyPlanAction(plan, action, registry);
  if (!planResult.ok) return { ok: false, error: planResult.error };
  return { ok: true, state: commitPlan(planResult.plan, state) };
}
```

(Use the existing commit/projection helpers; don't re-invent the plan→state conversion. If the binary `applyCombine` doesn't use this exact idiom, mirror whatever it does instead.)

- [ ] **Step 4: Run tests — verify PASS**

Run: `cd packages/engine && pnpm vitest run tests/forge.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/forge-state.ts packages/engine/tests/forge.test.ts
git commit -m "feat(engine): applyForgeAction dispatches combine3"
```

---

### Task 3.4: Chunk 3 regression gate

- [ ] **Step 1: Run the full engine suite**

Run: `cd packages/engine && pnpm vitest run`
Expected: 100% green.

---

## Chunk 4: UI Wiring

Connects the 3-slot workbench to the new action. Pure client-side changes.

### Task 4.1: Extend `computeGlowSignal` to check ternary first

**Files:**
- Modify: `packages/client/src/components/CombineWorkbench.tsx`

- [ ] **Step 1: Add a test (Vitest + jsdom)**

Create `packages/client/src/components/CombineWorkbench.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CombineWorkbench } from './CombineWorkbench';
// ... setup a mock registry where a triple of (fire_damage, cold_damage, lightning_damage)
// resolves to a ternary combination.
```

(Concrete test content: render with three slots filled, a mock `registry.getTernaryCombination` returning a compound, and assert `data-glow="gold"` on the result box. Consult existing client tests in `packages/client/src/components/` for the render-and-query pattern.)

A simpler approach: test `computeGlowSignal` directly by exporting it.

- [ ] **Step 2: Export + test `computeGlowSignal`**

In `CombineWorkbench.tsx`, add `export` to the `computeGlowSignal` function so it can be imported by the test. Write the test:

```ts
import { computeGlowSignal } from './CombineWorkbench';
// Mock registry with getCombination + getTernaryCombination
it('returns gold for a ternary recipe match', () => {
  const fakeRegistry = {
    getCombination: () => null,
    getTernaryCombination: (a: string, b: string, c: string) =>
      ([a,b,c].sort().join(',') === ['fire_damage','cold_damage','lightning_damage'].sort().join(','))
        ? { id: 'meltdown' } as any : null,
  } as any;
  const slots: any = [
    { affixId: 'fire_damage' }, { affixId: 'cold_damage' }, { affixId: 'lightning_damage' },
  ];
  expect(computeGlowSignal(slots, fakeRegistry)).toBe('gold');
});
```

- [ ] **Step 3: Run test — verify FAIL**

Run: `cd packages/client && pnpm vitest run src/components/CombineWorkbench.test.tsx`
Expected: FAIL — `getTernaryCombination` isn't checked.

- [ ] **Step 4: Update `computeGlowSignal`**

Edit `packages/client/src/components/CombineWorkbench.tsx:35-50`:

```ts
export function computeGlowSignal(
  slots: [GemInstance | null, GemInstance | null, GemInstance | null],
  registry: DataRegistry,
): GlowSignal {
  const keep = slots[0];
  if (!keep) return 'none';
  const others = [slots[1], slots[2]].filter((s): s is GemInstance => s !== null);
  if (others.length === 0) return 'none';

  // If 3 slots filled, check ternary first.
  if (others.length === 2) {
    const ternary = registry.getTernaryCombination(keep.affixId, others[0].affixId, others[1].affixId);
    if (ternary) return 'gold';
  }

  // Fall back to any KEEP-anchored pair hitting a binary recipe.
  for (const other of others) {
    const result = registry.getCombination(keep.affixId, other.affixId);
    if (result) return 'gold';
  }
  return 'white';
}
```

- [ ] **Step 5: Run tests — verify PASS**

Run: `cd packages/client && pnpm vitest run src/components/CombineWorkbench.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/CombineWorkbench.tsx packages/client/src/components/CombineWorkbench.test.tsx
git commit -m "feat(client): glow signal checks ternary recipe before binary pairs"
```

---

### Task 4.2: Update `handleCombine` to branch on filled count

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx:505-521`

- [ ] **Step 1: Edit the handler**

Replace the existing `handleCombine` (~line 505):

```ts
const handleCombine = useCallback(() => {
  if (!plan) return;
  const keep = comboSlots[0];
  if (!keep) return;
  const filled = comboSlots.filter((s): s is GemInstance => s !== null);

  if (filled.length >= 3) {
    const b = comboSlots[1]!;
    const c = comboSlots[2]!;
    const result = applyAction(
      {
        kind: 'combine3',
        gemUid1: keep.uid, gemUid2: b.uid, gemUid3: c.uid,
        keepGemUid: keep.uid,
      },
      registry,
    );
    if (result.ok) { playSound('combineMerge'); clearComboSlots(); }
    else { playSound('combineFail'); }
    return;
  }

  // Binary path (unchanged)
  const other = comboSlots[1] ?? comboSlots[2];
  if (!other) return;
  const result = applyAction(
    { kind: 'combine', gemUid1: keep.uid, gemUid2: other.uid, keepGemUid: keep.uid },
    registry,
  );
  if (result.ok) { playSound('combineMerge'); clearComboSlots(); }
  else { playSound('combineFail'); }
}, [plan, comboSlots, applyAction, registry, clearComboSlots]);
```

- [ ] **Step 2: Run the client test suite**

Run: `cd packages/client && pnpm vitest run`
Expected: all PASS (no test asserted on this handler previously; if any do, they should still pass since binary behavior is preserved).

- [ ] **Step 3: Manually smoke-test in the dev server**

Run: `cd packages/client && pnpm dev`
Open the browser, go to a forge screen with at least 3 gems, drag 3 gems into the combine slots. Verify:
- 3-gem combine produces a new gem from the ternary path (once data lands) OR binary fallback (if no ternary matches) with the third gem preserved in stockpile.
- 2-gem combine behaves exactly as before.

If the dev server can't be started in this environment, skip this step; the E2E test in Task 4.3 covers the end-to-end verification.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "feat(client): Forge.handleCombine branches on filled-slot count (binary vs combine3)"
```

---

### Task 4.3: E2E test — 3-gem combine

**Files:**
- Modify: `packages/client/e2e/gem-combining.spec.ts`

- [ ] **Step 1: Write the E2E test**

Append a test case:

```ts
test('3-gem fallback combine consumes 2, leaves 1 in stockpile', async ({ page }) => {
  // Scenario setup: seed match state with Ignite-forming gems + a third unrelated gem.
  // (Consult the existing gem-combining.spec.ts helpers for how state is seeded.)

  // Drag chance_on_hit to slot 0 (KEEP), fire_damage to slot 1, flat_hp to slot 2.
  // Click Combine. Assert:
  //  - A new gem with affixId "ignite" appears in stockpile.
  //  - chance_on_hit and fire_damage gems are gone.
  //  - flat_hp gem is still in stockpile.
});
```

(Look at the existing tests in the same file for drag/click/assert idioms. Keep this test small — its purpose is to prove wiring, not to re-test engine behavior.)

- [ ] **Step 2: Run**

Run: `cd packages/client && pnpm playwright test e2e/gem-combining.spec.ts`
Expected: PASS. If the test needs fixture data that doesn't exist yet (because Chunk 5 hasn't run), either skip this specific test with a clear comment, or push it into Task 5.4 after binary recipes are added.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/gem-combining.spec.ts
git commit -m "test(client): E2E — 3-gem fallback combine leaves ejected gem in stockpile"
```

---

### Task 4.4: Chunk 4 regression gate

- [ ] **Step 1: Run all unit tests**

Run: `cd packages/engine && pnpm vitest run && cd ../client && pnpm vitest run`
Expected: 100% green.

- [ ] **Step 2: Type-check**

Run: `pnpm -r exec tsc --noEmit`
Expected: clean.

---

## Chunk 5: Content — Binary Recipe Additions

Adds the 3 binary recipes carried over from the superseded spec (Combustion, Thornfrost, Soul Eclipse). All land in `recipes.json` with `type: "signature"` and matching `CompoundAffixDef` entries in `combinations.json`.

### Task 5.1: Add Combustion (`chance_on_crit + fire_damage`)

**Files:**
- Modify: `packages/engine/src/data/recipes.json`
- Modify: `packages/engine/src/data/combinations.json`

- [ ] **Step 1: Append the recipe entry to `recipes.json`**

Add (before the category recipes block):

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

- [ ] **Step 2: Append the compound entry to `combinations.json`**

(Full JSON per the spec — see `docs/superpowers/specs/2026-04-16-three-new-gem-combos-design.md` for the flavor text.)

- [ ] **Step 3: Run the engine data tests**

Run: `cd packages/engine && pnpm vitest run tests/data.test.ts`
Expected: PASS (schemas validate the new entry).

- [ ] **Step 4: Run the combination-engine test suite**

Run: `cd packages/engine && pnpm vitest run tests/combination-engine.test.ts`
Expected: PASS (no new tests yet, just verifying the new data doesn't break existing ones).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/data/recipes.json packages/engine/src/data/combinations.json
git commit -m "content(combos): add Combustion (chance_on_crit + fire_damage)"
```

---

### Task 5.2: Add Thornfrost (`recipe:retribution_aura + cold_damage`)

**Files:**
- Modify: `packages/engine/src/data/recipes.json`
- Modify: `packages/engine/src/data/combinations.json`

- [ ] **Step 1: Append the recipe entry**

Full JSON per the superseded spec (uses `{ "kind": "recipe", "id": "retribution_aura" }` as one component).

- [ ] **Step 2: Append the compound metadata entry**

`combinations.json` — `components: ["retribution_aura", "cold_damage"]`.

- [ ] **Step 3: Verify schema validation and combine lookups**

Run: `cd packages/engine && pnpm vitest run tests/data.test.ts tests/combination-engine.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/data/recipes.json packages/engine/src/data/combinations.json
git commit -m "content(combos): add Thornfrost (retribution_aura + cold_damage)"
```

---

### Task 5.3: Add Soul Eclipse (`recipe:soul_rend + recipe:soul_siphon`)

**Files:**
- Modify: `packages/engine/src/data/recipes.json`
- Modify: `packages/engine/src/data/combinations.json`

- [ ] **Step 1: Append the recipe**

Full JSON per the superseded spec. Note `fluxCost: 3`, `slotCost: 3`, `maxDepthContribution: 2`, capstone tag.

- [ ] **Step 2: Append the compound metadata**

`combinations.json` — `components: ["soul_rend", "soul_siphon"]`, `fluxCost: 3`, `slotCost: 3`.

- [ ] **Step 3: Verify**

Run: `cd packages/engine && pnpm vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/data/recipes.json packages/engine/src/data/combinations.json
git commit -m "content(combos): add Soul Eclipse (soul_rend + soul_siphon capstone)"
```

---

### Task 5.4: Chunk 5 integration tests

**Files:**
- Modify: `packages/engine/tests/data.test.ts`
- Modify: `packages/engine/tests/combination-engine.test.ts` (optional, for end-to-end data coverage)

- [ ] **Step 1: Add lookup verification tests**

In `data.test.ts`:

```ts
it('resolves Combustion via getCombination(chance_on_crit, fire_damage)', () => {
  const combo = registry.getCombination('chance_on_crit', 'fire_damage');
  expect(combo?.id).toBe('combustion');
});
it('resolves Thornfrost via getCombination(retribution_aura, cold_damage)', () => {
  const combo = registry.getCombination('retribution_aura', 'cold_damage');
  expect(combo?.id).toBe('thornfrost');
});
it('resolves Soul Eclipse via getCombination(soul_rend, soul_siphon)', () => {
  const combo = registry.getCombination('soul_rend', 'soul_siphon');
  expect(combo?.id).toBe('soul_eclipse');
});
```

- [ ] **Step 2: Run and verify**

Run: `cd packages/engine && pnpm vitest run tests/data.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/tests/data.test.ts
git commit -m "test(engine): verify new binary compound lookups resolve"
```

---

## Chunk 6: Content — Ternary Recipe Additions

Adds the 12 ternary recipes. One subtask per recipe for clean commit history and easy balance iteration.

For each recipe: append to `recipes.json` (`type: "signature3"`) + append to `combinations.json` (`components` tuple of length 3). Full stat-modifier JSON for the 4 exemplars is specified in the spec; the remaining 8 follow the same shape pattern — author stats using the balance notes in the spec as starting points, then balance-iterate with `packages/tools/` before locking numbers.

### Task 6.1: Meltdown (BBB) — fully specified in spec

- [ ] **Step 1: Append recipe + compound entries using the exemplar JSON in the spec.**
- [ ] **Step 2: `cd packages/engine && pnpm vitest run tests/data.test.ts`**
- [ ] **Step 3: Commit `"content(combos): add Meltdown (BBB — fire + cold + lightning)"`**

### Task 6.2: Warrior's Edge (BBB) — `crit_chance + crit_damage + attack_speed`

Stat sketch (refine via sim tool):

```json
"outputBonusEffects": [
  { "stat": "compound.warriors_edge.active", "op": "flat", "value": 1 },
  { "stat": "compound.warriors_edge.critAttackSpeedStack", "op": "flat", "value": 0.10 },
  { "stat": "compound.warriors_edge.maxStacks", "op": "flat", "value": 5 }
]
```

- [ ] Append recipe + compound.
- [ ] Test + commit `"content(combos): add Warrior's Edge (BBB — crit/AS capstone)"`.

### Task 6.3: Bastion (BBB) — `armor_rating + block_chance + flat_hp`

Stat sketch:

```json
"outputBonusEffects": [
  { "stat": "compound.bastion.active", "op": "flat", "value": 1 },
  { "stat": "compound.bastion.shieldOnBlock", "op": "flat", "value": 0.10 },
  { "stat": "compound.bastion.shieldDuration", "op": "flat", "value": 30 }
]
```

- [ ] Append recipe + compound.
- [ ] Test + commit `"content(combos): add Bastion (BBB — tank capstone)"`.

### Task 6.4: Blood Pact (BBB) — `lifesteal + hp_regen + flat_hp`

Stat sketch:

```json
"outputBonusEffects": [
  { "stat": "compound.blood_pact.active", "op": "flat", "value": 1 },
  { "stat": "compound.blood_pact.overhealToHpCap", "op": "flat", "value": 0.20 }
]
```

- [ ] Append recipe + compound.
- [ ] Test + commit `"content(combos): add Blood Pact (BBB — sustain capstone)"`.

### Task 6.5: Detonator (BBC) — fully specified in spec

- [ ] Append recipe + compound using the exemplar JSON.
- [ ] Test + commit `"content(combos): add Detonator (BBC — ignite + crit + fire)"`.

### Task 6.6: Frost Nova (BBC) — `recipe:frostbite + chance_on_block + cold_damage`

Stat sketch:

```json
"outputBonusEffects": [
  { "stat": "compound.frost_nova.active", "op": "flat", "value": 1 },
  { "stat": "compound.frost_nova.coneOnBlockChance", "op": "flat", "value": 0.50 },
  { "stat": "compound.frost_nova.coneDamage", "op": "flat", "value": 2 },
  { "stat": "compound.frost_nova.bonusColdOnChilled", "op": "flat", "value": 0.30 }
]
```

- [ ] Append + test + commit.

### Task 6.7: Thunderbrand (BBC) — `recipe:static_discharge + attack_speed + lightning_damage`

```json
"outputBonusEffects": [
  { "stat": "compound.thunderbrand.active", "op": "flat", "value": 1 },
  { "stat": "compound.thunderbrand.chainExtension", "op": "flat", "value": 2 },
  { "stat": "compound.thunderbrand.perSegmentLightningBonus", "op": "flat", "value": 0.10 }
]
```

- [ ] Append + test + commit.

### Task 6.8: Plague Carrier (BBC) — `recipe:envenom + poison_damage + chance_on_hit`

```json
"outputBonusEffects": [
  { "stat": "compound.plague_carrier.active", "op": "flat", "value": 1 },
  { "stat": "compound.plague_carrier.spreadRadius", "op": "flat", "value": 3 },
  { "stat": "compound.plague_carrier.stackTransferPercent", "op": "flat", "value": 0.50 }
]
```

- [ ] Append + test + commit.

### Task 6.9: Oathbound Fury (BCC) — `recipe:desperation + recipe:blood_frenzy + attack_speed`

```json
"outputBonusEffects": [
  { "stat": "compound.oathbound_fury.active", "op": "flat", "value": 1 },
  { "stat": "compound.oathbound_fury.asStack", "op": "flat", "value": 3.0 },
  { "stat": "compound.oathbound_fury.lifestealStack", "op": "flat", "value": 4.0 },
  { "stat": "compound.oathbound_fury.duration", "op": "flat", "value": 90 },
  { "stat": "compound.oathbound_fury.oncePerFight", "op": "flat", "value": 1 }
]
```

- [ ] Append + test + commit.

### Task 6.10: Phoenix Embers (BCC) — fully specified in spec

- [ ] Append + test + commit.

### Task 6.11: Crystal Aegis (BCC) — `recipe:frostbite + recipe:fortress + cold_damage`

```json
"outputBonusEffects": [
  { "stat": "compound.crystal_aegis.active", "op": "flat", "value": 1 },
  { "stat": "compound.crystal_aegis.chillOnFortress", "op": "flat", "value": 0.30 },
  { "stat": "compound.crystal_aegis.auraRadius", "op": "flat", "value": 3 }
]
```

- [ ] Append + test + commit.

### Task 6.12: Worldfire (CCC) — fully specified in spec

- [ ] Append + test + commit using the CCC exemplar JSON.

### Task 6.13: Chunk 6 integration tests

**Files:**
- Modify: `packages/engine/tests/data.test.ts`

- [ ] **Step 1: Add ternary lookup tests for all 12 new recipes**

For each recipe, add a test along these lines:

```ts
it('resolves Meltdown via getTernaryCombination', () => {
  const combo = registry.getTernaryCombination('fire_damage', 'cold_damage', 'lightning_damage');
  expect(combo?.id).toBe('meltdown');
});
// ...repeat for the other 11
```

Also add **one end-to-end combine test** that goes through the real engine:

```ts
it('combine3 with live data resolves Meltdown', () => {
  const a = createGem('a', 'fire_damage', 2, 'rare');
  const b = createGem('b', 'cold_damage', 2, 'rare');
  const c = createGem('c', 'lightning_damage', 2, 'rare');
  const recipeRegistry = registry.getRecipeRegistry();
  const map: Record<string, string> = {};
  for (const affix of registry.getAllAffixes()) map[affix.id] = affix.category;
  const engine = new CombinationEngine(recipeRegistry, new DiscoveryState(), map);
  const result = engine.combine3(a, b, c, 'out', 'a');
  expect(result.recipeId).toBe('meltdown');
});
```

- [ ] **Step 2: Run and verify**

Run: `cd packages/engine && pnpm vitest run tests/data.test.ts`
Expected: 100% green.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/tests/data.test.ts
git commit -m "test(engine): verify all 12 ternary compounds resolve + end-to-end combine3"
```

---

## Final Regression + Landing

- [ ] **Step 1: Run the whole engine suite**

Run: `cd packages/engine && pnpm vitest run`
Expected: 100% green. Record count of passing tests; should have grown by at least ~15–25 new tests across chunks.

- [ ] **Step 2: Run the whole client suite**

Run: `cd packages/client && pnpm vitest run`
Expected: 100% green.

- [ ] **Step 3: Run the E2E suite (at least gem-combining and forge-critical specs)**

Run: `cd packages/client && pnpm playwright test e2e/gem-combining.spec.ts e2e/forge.spec.ts`
Expected: PASS.

- [ ] **Step 4: Type-check workspaces**

Run: `pnpm -r exec tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Manual forge smoke test in dev server**

Run: `cd packages/client && pnpm dev`
Verify:
- Drag 3 gems forming Meltdown (fire + cold + lightning) — gold glow, combine produces a Meltdown compound gem.
- Drag 3 gems with no ternary match but a binary on 2 of them — gold glow (binary fallback), combine consumes 2 and leaves the ejected gem in stockpile.
- Drag just 2 gems as before — behaves exactly as before (no regressions).

- [ ] **Step 6: Update `CLAUDE.md` if any patterns changed**

If the testing conventions or the combine engine's public API drifted from what's documented, bring CLAUDE.md in line.

---

## Out of Scope (explicit)

- **Flux-cost differentiation for `combine3`.** Uses existing `fluxCosts.combineOrbs`. Follow-up.
- **AI triple evaluation.** Call sites in `ai/evaluation.ts`, `ai/strategies/*.ts` untouched. Follow-up (separate spec).
- **Compound gem socket crash** (`registry.getAffix(compoundId)` throws for compound IDs). Pre-existing; applies to all compounds equally.
- **`compound.*` stat keys wired into duel combat.** Still inert across all compounds.
- **Balance iteration on the 8 ternary recipes with sketched stats.** Real numbers come after running `packages/tools/` simulations — another PR.
- **Capstone visual badge.** `"capstone"` tag present in data but UI treats all tags uniformly.

---

## Notes for the Executor

- Every task has a TDD cycle: failing test → minimal implementation → green test → commit. Do not skip the "verify failing" step — it confirms the test is actually exercising new behavior.
- When in doubt about an existing pattern, read the binary analogue (e.g., `planCombine` for `planCombine3`) and mirror it. Consistency matters more than cleverness here.
- If a test fails in a way the plan didn't anticipate, stop and investigate. Don't band-aid — the spec is the contract, not the plan's wording.
- Commit messages follow the existing style (see `git log --oneline`). Prefix with `feat(engine|client)`, `test(engine|client)`, or `content(combos)` as appropriate.
