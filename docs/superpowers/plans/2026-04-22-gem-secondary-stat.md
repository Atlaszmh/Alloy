# Gem Secondary Stat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secondary affix slot to high-tier, high-rarity gems, filled via a new transplant forge action that consumes a donor gem and copies one of its affixes onto the host.

**Architecture:** Engine-first, then client. The engine gains a `SecondarySlot` type on `GemInstance`, a `transplant_gem` `ForgeAction` with full plan/state support, stat-pipeline and synergy integration, and a combine-engine refinement that blocks signature/category combos for filled-secondary inputs while allowing generic tier/rarity upgrades. The client repurposes the existing combine workbench into a unified `Workbench` with Combine and Transplant CTAs sharing the same 3-slot placement UI (slot 0 = host, slot 1 = source for transplant).

**Tech Stack:** TypeScript 5.7, Vitest for engine unit tests, React 19 + Zustand 5 + TailwindCSS v4 for client, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-04-22-gem-secondary-stat-design.md`

---

## Chunk 1: Engine foundation — types, balance, action variant

### Task 1.1: Add `SecondarySlot` / `SecondaryModifier` types to `gem.ts`

**Files:**
- Modify: `packages/engine/src/types/gem.ts`
- Test: `packages/engine/tests/gem-model.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/tests/gem-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { GemInstance, SecondarySlot } from '../src/types/gem.js';
import { createGem } from '../src/types/gem.js';

describe('SecondarySlot', () => {
  it('GemInstance accepts an optional secondary slot', () => {
    const base = createGem('g1', 'flat_physical', 5, 'rare');
    const slot: SecondarySlot = {
      affixId: 'flat_life',
      tier: 3,
      rarity: 'magic',
      sourceGemUid: 'src-1',
    };
    const gem: GemInstance = { ...base, secondary: slot };
    expect(gem.secondary?.affixId).toBe('flat_life');
    expect(gem.secondary?.tier).toBe(3);
    expect(gem.secondary?.rarity).toBe('magic');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/engine test gem-model` — expect compile error on `SecondarySlot` import.

- [ ] **Step 3: Add the types to `packages/engine/src/types/gem.ts`**

Insert above `GemInstance`:

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
```

Extend `GemInstance`:

```ts
export interface GemInstance {
  // ...existing fields...
  outputBonusEffects?: StatModifier[];
  secondary?: SecondarySlot;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @alloy/engine test gem-model` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/types/gem.ts packages/engine/tests/gem-model.test.ts
git commit -m "feat(engine): add SecondarySlot and SecondaryModifier types"
```

---

### Task 1.2: Add `hasSecondarySlot` + `hasSecondarySlotFromRegistry` helpers

**Files:**
- Modify: `packages/engine/src/types/gem.ts`
- Test: `packages/engine/tests/slot-unlock.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `packages/engine/tests/slot-unlock.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createGem, hasSecondarySlot, RARITY_ORDER } from '../src/types/gem.js';

const THRESHOLD = 6;

describe('hasSecondarySlot', () => {
  it('returns true when tier + rarityIndex >= threshold', () => {
    // Legendary T2 = 5 + 2 = 7 ✓
    expect(hasSecondarySlot(createGem('g', 'flat_physical', 2, 'legendary'), THRESHOLD)).toBe(true);
    // Rare T3 = 3 + 3 = 6 ✓
    expect(hasSecondarySlot(createGem('g', 'flat_physical', 3, 'rare'), THRESHOLD)).toBe(true);
    // Uncommon T5 = 5 + 1 = 6 ✓
    expect(hasSecondarySlot(createGem('g', 'flat_physical', 5, 'uncommon'), THRESHOLD)).toBe(true);
  });

  it('returns false when tier + rarityIndex < threshold', () => {
    // Common T5 = 5 + 0 = 5 ✗
    expect(hasSecondarySlot(createGem('g', 'flat_physical', 5, 'common'), THRESHOLD)).toBe(false);
    // Magic T3 = 3 + 2 = 5 ✗
    expect(hasSecondarySlot(createGem('g', 'flat_physical', 3, 'magic'), THRESHOLD)).toBe(false);
  });

  it('Common gems can never unlock', () => {
    for (let t = 1; t <= 5; t++) {
      expect(hasSecondarySlot(createGem('g', 'flat_physical', t as 1|2|3|4|5, 'common'), THRESHOLD)).toBe(false);
    }
  });

  it('exhaustive table matches threshold 6', () => {
    const expected: Record<string, number[]> = {
      // rarity: tiers that unlock
      common: [],
      uncommon: [5],
      magic: [4, 5],
      rare: [3, 4, 5],
      epic: [2, 3, 4, 5],
      legendary: [1, 2, 3, 4, 5].filter(t => t + 5 >= 6), // [1, 2, 3, 4, 5]
    };
    for (const rarity of RARITY_ORDER) {
      for (let t = 1; t <= 5; t++) {
        const unlocked = hasSecondarySlot(createGem('g', 'flat_physical', t as 1|2|3|4|5, rarity), THRESHOLD);
        expect(unlocked).toBe(expected[rarity].includes(t));
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/engine test slot-unlock` — expect FAIL (function undefined).

- [ ] **Step 3: Implement the helper**

Add to `packages/engine/src/types/gem.ts` below `rarityIndex`:

```ts
export function hasSecondarySlot(gem: GemInstance, threshold: number): boolean {
  return gem.tier + rarityIndex(gem.rarity) >= threshold;
}
```

For the registry convenience wrapper, add a separate file to avoid a circular import from `gem.ts` → `registry`:

Create `packages/engine/src/types/gem-secondary.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { GemInstance } from './gem.js';
import { hasSecondarySlot } from './gem.js';

export function hasSecondarySlotFromRegistry(gem: GemInstance, registry: DataRegistry): boolean {
  return hasSecondarySlot(gem, registry.getBalance().transplant.unlockThreshold);
}
```

(This separation keeps `gem.ts` free of registry imports. `hasSecondarySlotFromRegistry` will be exported from the package once the balance schema update lands in Task 1.3.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @alloy/engine test slot-unlock` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/types/gem.ts packages/engine/src/types/gem-secondary.ts packages/engine/tests/slot-unlock.test.ts
git commit -m "feat(engine): hasSecondarySlot helper gates on tier + rarityIndex threshold"
```

---

### Task 1.3: Add balance.json entries + schema update

**Files:**
- Modify: `packages/engine/src/data/balance.json`
- Modify: `packages/engine/src/data/schemas.ts` (balance Zod schema)
- Modify: `packages/engine/src/types/balance.ts` (if types are separately declared)
- Test: `packages/engine/tests/balance-schema.test.ts` (new or extend existing)

- [ ] **Step 1: Inspect current balance schema**

Read: `packages/engine/src/data/schemas.ts` — look for `BalanceSchema` or equivalent Zod schema for `balance.json`. Read: `packages/engine/src/types/balance.ts` to see if there's a hand-rolled type mirroring the schema.

- [ ] **Step 2: Write the failing test**

Create or append to `packages/engine/tests/balance-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BalanceSchema } from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';

describe('balance schema — transplant section', () => {
  it('parses balance.json including new transplant section', () => {
    const parsed = BalanceSchema.parse(balanceData);
    expect(parsed.transplant.unlockThreshold).toBe(6);
    expect(parsed.transplant.secondaryValueScalar).toBe(1.0);
  });

  it('includes new gem.flux.costs entries for transplant', () => {
    const parsed = BalanceSchema.parse(balanceData);
    expect(parsed.gem.flux.costs.transplantGem).toBe(0);
    expect(parsed.gem.flux.costs.transplantChooseAffix).toBe(3);
  });
});
```

(Adjust import path for `BalanceSchema` to match what's actually exported from `schemas.ts`.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @alloy/engine test balance-schema` — expect FAIL on missing keys.

- [ ] **Step 4: Update `balance.json`**

Add `transplantGem` and `transplantChooseAffix` to the existing `gem.flux.costs` block (do NOT touch legacy top-level `fluxCosts`). Add a new top-level `transplant` section:

```json
{
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
}
```

- [ ] **Step 5: Update schema in `schemas.ts`**

Extend the `gem.flux.costs` object schema and add a `transplant` object:

```ts
// Inside BalanceSchema — adjust to match existing shape
gem: z.object({
  flux: z.object({
    costs: z.object({
      boostCombine: z.number(),
      rerollPool: z.number(),
      guaranteeRarity: z.number(),
      transplantGem: z.number(),
      transplantChooseAffix: z.number(),
    }),
    // ...existing sibling fields...
  }),
  // ...existing sibling fields...
}),
transplant: z.object({
  unlockThreshold: z.number().int().min(1),
  secondaryValueScalar: z.number(),
}),
```

Mirror the same shape in `packages/engine/src/types/balance.ts` if hand-rolled types exist.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @alloy/engine test balance-schema` and `pnpm --filter @alloy/engine test` (full). Expect PASS and no regressions.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/data/balance.json packages/engine/src/data/schemas.ts packages/engine/src/types/balance.ts packages/engine/tests/balance-schema.test.ts
git commit -m "feat(engine): add transplant balance section + gem.flux.costs entries"
```

---

### Task 1.4: Add `transplant_gem` variant to `ForgeAction`

**Files:**
- Modify: `packages/engine/src/types/forge-action.ts`

- [ ] **Step 1: Add the variant**

Append to the `ForgeAction` union in `packages/engine/src/types/forge-action.ts`:

```ts
| {
    kind: 'transplant_gem';
    targetGemUid: string;
    sourceGemUid: string;
    chosenAffix?: 'primary' | 'secondary';
  };
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @alloy/engine typecheck` (or `pnpm -r typecheck`) — expect errors from every `switch (action.kind)` that does not yet handle `transplant_gem`. That is expected; later tasks add the cases.

Temporary mitigation: the existing switches end with a `default:` that returns `fail`. This means the new variant type-narrows to never inside the default clauses; compile should still pass as long as the switches are *exhaustive fall-through* to default. If TS complains about a specific `never` assignment, leave a `// TODO(transplant)` comment on that line for Task 2.x to resolve cleanly.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/types/forge-action.ts
git commit -m "feat(engine): add transplant_gem variant to ForgeAction"
```

---

## Chunk 2: Engine transplant core — resolver, preview, plan, apply

### Task 2.1: Scaffold `forge/transplant/` module with types

**Files:**
- Create: `packages/engine/src/forge/transplant/types.ts`
- Create: `packages/engine/src/forge/transplant/index.ts`

- [ ] **Step 1: Create `types.ts`**

```ts
import type { GemInstance, SecondarySlot } from '../../types/gem.js';
import type { SeededRNG } from '../../rng/seeded-rng.js';

/** Inputs the resolver receives before walking the modifier pipeline. */
export interface TransplantContext {
  target: GemInstance;
  source: GemInstance;
  chosenAffix?: 'primary' | 'secondary';
  rng: SeededRNG;
}

/** A modifier can adjust the context (e.g., force a choice) or short-circuit
 *  by returning a final slot. If it returns void, the pipeline continues. */
export interface TransplantModifier {
  id: string;
  priority: number; // lower priority runs first
  apply(ctx: TransplantContext): TransplantContext | SecondarySlot | void;
}

/** Preview returned by `planTransplantGem` — drives the UI result card. */
export interface TransplantPreview {
  targetUid: string;
  sourceUid: string;
  /** When true, the specific affix is not determined until commit (RNG). */
  isRandom: boolean;
  /** For the random case, both possibilities are surfaced so UI can show "A or B". */
  possibleAffixes: Array<{ affixId: string; tier: 1 | 2 | 3 | 4 | 5; rarity: string }>;
  /** For the chosen case, the single resolved slot preview. */
  resolvedSlot: SecondarySlot | null;
  /** Flux cost that would be deducted at commit (0 for random path). */
  fluxCost: number;
}
```

- [ ] **Step 2: Create `index.ts`**

```ts
export * from './types.js';
export * from './resolver.js';
export * from './preview.js';
```

(The later two exports won't resolve until Tasks 2.3 and 2.4 — typecheck will fail temporarily.)

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/forge/transplant/
git commit -m "feat(engine): scaffold transplant module with types"
```

---

### Task 2.2: Implement `choose-affix` modifier + modifier registry

**Files:**
- Create: `packages/engine/src/forge/transplant/modifiers/choose-affix.ts`
- Create: `packages/engine/src/forge/transplant/modifiers/index.ts`
- Test: `packages/engine/tests/transplant-modifiers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { chooseAffixModifier } from '../src/forge/transplant/modifiers/choose-affix.js';
import type { TransplantContext } from '../src/forge/transplant/types.js';
import { createGem } from '../src/types/gem.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';

function makeCtx(partial: Partial<TransplantContext> = {}): TransplantContext {
  const rng = new SeededRNG('t');
  return {
    target: createGem('tgt', 'flat_physical', 5, 'rare'),
    source: createGem('src', 'flat_life', 4, 'epic'),
    rng,
    ...partial,
  };
}

describe('chooseAffixModifier', () => {
  it('passes ctx through unchanged when chosenAffix is not set', () => {
    const ctx = makeCtx();
    const result = chooseAffixModifier.apply(ctx);
    expect(result).toBe(ctx); // identity pass-through
  });

  it('passes ctx through unchanged when chosenAffix is set (handled at resolver)', () => {
    const ctx = makeCtx({ chosenAffix: 'primary' });
    const result = chooseAffixModifier.apply(ctx);
    expect(result).toBe(ctx);
  });
});
```

(Note: the resolver uses `chosenAffix` directly; the modifier is a placeholder for the pipeline pattern and a hook for future cost-modifying logic. We're verifying the modifier doesn't rewrite context.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/engine test transplant-modifiers` — FAIL (not exported).

- [ ] **Step 3: Implement the modifier**

`packages/engine/src/forge/transplant/modifiers/choose-affix.ts`:

```ts
import type { TransplantContext, TransplantModifier } from '../types.js';

/** Hook for the chooseAffix path. Kept minimal: the resolver reads
 *  `ctx.chosenAffix` directly. This modifier exists as the first entry
 *  in the pipeline so future flux-driven modifiers can assume a stable
 *  insertion point. */
export const chooseAffixModifier: TransplantModifier = {
  id: 'choose-affix',
  priority: 10,
  apply(ctx: TransplantContext): TransplantContext {
    return ctx;
  },
};
```

`packages/engine/src/forge/transplant/modifiers/index.ts`:

```ts
import type { TransplantModifier } from '../types.js';
import { chooseAffixModifier } from './choose-affix.js';

export const TRANSPLANT_MODIFIERS: TransplantModifier[] = [chooseAffixModifier];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @alloy/engine test transplant-modifiers` — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/transplant/modifiers/ packages/engine/tests/transplant-modifiers.test.ts
git commit -m "feat(engine): scaffold transplant modifier pipeline with choose-affix placeholder"
```

---

### Task 2.3: Implement `resolver.ts` — the core transplant resolution logic

**Files:**
- Create: `packages/engine/src/forge/transplant/resolver.ts`
- Test: `packages/engine/tests/transplant-resolver.test.ts`
- Test: `packages/engine/tests/transplant-rng.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/engine/tests/transplant-resolver.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveTransplant } from '../src/forge/transplant/resolver.js';
import { createGem, type SecondarySlot } from '../src/types/gem.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';

const rng = () => new SeededRNG('test-seed');

describe('resolveTransplant', () => {
  it('source with no secondary → primary transplants; slot records source tier/rarity', () => {
    const target = createGem('t', 'flat_physical', 5, 'rare');
    const source = createGem('s', 'flat_life', 3, 'magic');
    const slot = resolveTransplant({ target, source, rng: rng() });
    expect(slot.affixId).toBe('flat_life');
    expect(slot.tier).toBe(3);
    expect(slot.rarity).toBe('magic');
    expect(slot.sourceGemUid).toBe('s');
  });

  it('source with filled secondary + chosenAffix=primary → primary transplants', () => {
    const sourceSecondary: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const source = { ...createGem('s', 'flat_life', 4, 'epic'), secondary: sourceSecondary };
    const target = createGem('t', 'flat_physical', 5, 'rare');
    const slot = resolveTransplant({ target, source, chosenAffix: 'primary', rng: rng() });
    expect(slot.affixId).toBe('flat_life');
    expect(slot.tier).toBe(4);
    expect(slot.rarity).toBe('epic');
  });

  it('source with filled secondary + chosenAffix=secondary → secondary transplants', () => {
    const sourceSecondary: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const source = { ...createGem('s', 'flat_life', 4, 'epic'), secondary: sourceSecondary };
    const target = createGem('t', 'flat_physical', 5, 'rare');
    const slot = resolveTransplant({ target, source, chosenAffix: 'secondary', rng: rng() });
    expect(slot.affixId).toBe('flat_armor');
    expect(slot.tier).toBe(2);
    expect(slot.rarity).toBe('magic');
  });

  it('source with filled secondary + no chosenAffix → RNG picks between primary/secondary', () => {
    const sourceSecondary: SecondarySlot = { affixId: 'flat_armor', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const source = { ...createGem('s', 'flat_life', 4, 'epic'), secondary: sourceSecondary };
    const target = createGem('t', 'flat_physical', 5, 'rare');
    // Deterministic: SeededRNG('test-seed').next() is predictable
    const slot = resolveTransplant({ target, source, rng: rng() });
    expect(['flat_life', 'flat_armor']).toContain(slot.affixId);
  });
});
```

`packages/engine/tests/transplant-rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveTransplant } from '../src/forge/transplant/resolver.js';
import { createGem, type SecondarySlot } from '../src/types/gem.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';

describe('transplant RNG determinism', () => {
  it('same seed + same uids = same random result', () => {
    const sourceSecondary: SecondarySlot = { affixId: 'A', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const sourceA = { ...createGem('s', 'flat_life', 3, 'epic'), secondary: sourceSecondary };
    const sourceB = { ...createGem('s', 'flat_life', 3, 'epic'), secondary: sourceSecondary };
    const target = createGem('t', 'flat_physical', 5, 'rare');

    const r1 = resolveTransplant({ target, source: sourceA, rng: new SeededRNG('seed-1').fork('transplant_t_s') });
    const r2 = resolveTransplant({ target, source: sourceB, rng: new SeededRNG('seed-1').fork('transplant_t_s') });

    expect(r1.affixId).toBe(r2.affixId);
  });

  it('different seeds can produce different results', () => {
    const sourceSecondary: SecondarySlot = { affixId: 'A', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const source = { ...createGem('s', 'flat_life', 3, 'epic'), secondary: sourceSecondary };
    const target = createGem('t', 'flat_physical', 5, 'rare');

    const results = new Set<string>();
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) {
      const slot = resolveTransplant({ target, source, rng: new SeededRNG(seed).fork('transplant_t_s') });
      results.add(slot.affixId);
    }
    expect(results.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @alloy/engine test transplant-resolver transplant-rng` — expect FAIL (function undefined).

- [ ] **Step 3: Implement the resolver**

`packages/engine/src/forge/transplant/resolver.ts`:

```ts
import type { GemInstance, SecondarySlot } from '../../types/gem.js';
import type { TransplantContext, TransplantModifier } from './types.js';
import { TRANSPLANT_MODIFIERS } from './modifiers/index.js';

/** Resolve a transplant: walks the modifier pipeline, then computes the
 *  final SecondarySlot based on context (chosenAffix or RNG). */
export function resolveTransplant(
  input: TransplantContext,
  modifiers: TransplantModifier[] = TRANSPLANT_MODIFIERS,
): SecondarySlot {
  // Walk modifiers in priority order; any modifier that returns a SecondarySlot
  // short-circuits (reserved for future flux-driven overrides).
  let ctx = input;
  const sorted = [...modifiers].sort((a, b) => a.priority - b.priority);
  for (const mod of sorted) {
    const out = mod.apply(ctx);
    if (!out) continue;
    if ('affixId' in out) return out; // SecondarySlot short-circuit
    ctx = out;
  }

  const { target: _target, source, chosenAffix, rng } = ctx;
  const hasSourceSecondary = source.secondary !== undefined;

  let pickPrimary: boolean;
  if (chosenAffix === 'primary' || !hasSourceSecondary) pickPrimary = true;
  else if (chosenAffix === 'secondary') pickPrimary = false;
  else pickPrimary = rng.next() < 0.5; // random 50/50

  if (pickPrimary) {
    return {
      affixId: source.affixId,
      tier: source.tier,
      rarity: source.rarity,
      sourceGemUid: source.uid,
    };
  }
  const sec = source.secondary!;
  return {
    affixId: sec.affixId,
    tier: sec.tier,
    rarity: sec.rarity,
    sourceGemUid: source.uid,
  };
}
```

Verify `SeededRNG` exposes a `.next()` that returns `[0, 1)`. If the existing method is named differently (e.g. `nextFloat()`, `random()`), adjust.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @alloy/engine test transplant-resolver transplant-rng` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/transplant/resolver.ts packages/engine/tests/transplant-resolver.test.ts packages/engine/tests/transplant-rng.test.ts
git commit -m "feat(engine): transplant resolver with modifier pipeline + deterministic RNG"
```

---

### Task 2.4: Implement `planTransplantGem` in `forge-plan.ts`

**Files:**
- Modify: `packages/engine/src/forge/forge-plan.ts`
- Create: `packages/engine/src/forge/transplant/preview.ts`
- Test: `packages/engine/tests/transplant-preview.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createForgePlan } from '../src/forge/forge-plan.js';
import { applyPlanAction } from '../src/forge/forge-plan.js';
import { createGem } from '../src/types/gem.js';
// … set up a minimal DataRegistry + ForgeState; reuse test helpers if present

describe('planTransplantGem', () => {
  it('rejects when target does not have an open slot', () => {
    // target tier 3 common (value 3+0=3 < 6) → no slot
    // Construct a plan with both gems in stockpile, call applyPlanAction with transplant_gem,
    // expect { ok: false, error: /does not have.*slot/ }
  });

  it('rejects when target already has a filled secondary', () => { /* ... */ });

  it('rejects when source === target', () => { /* ... */ });

  it('rejects when chosenAffix=secondary but source has no secondary', () => { /* ... */ });

  it('succeeds with valid inputs; output stockpile has host with new secondary, source removed', () => {
    // target: Rare T5 (open empty), source: Magic T3
    // After apply: target.secondary = { affixId: source.affixId, tier: 3, rarity: 'magic', sourceGemUid: source.uid }
    // source is no longer in stockpile
  });

  it('appends secondary affixId to target.tags (deduped)', () => { /* ... */ });
});
```

Look at existing test helpers in `packages/engine/tests/` — `forge-plan.test.ts` and similar — for the `DataRegistry` + `ForgeState` boilerplate; reuse whatever factory functions exist.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @alloy/engine test transplant-preview` — FAIL.

- [ ] **Step 3: Implement `planTransplantGem` in `forge-plan.ts`**

Add near `planCombine` (~line 159):

```ts
import { resolveTransplant } from './transplant/resolver.js';
import { hasSecondarySlot, type SecondarySlot } from '../types/gem.js';

function planTransplantGem(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'transplant_gem' }>,
  registry: DataRegistry,
): PlanResult {
  if (action.targetGemUid === action.sourceGemUid) {
    return { ok: false, error: 'Target and source must be different gems' };
  }

  const targetIdx = findSlotIndex(plan.stockpile, g => g.uid === action.targetGemUid);
  if (targetIdx === -1) return { ok: false, error: 'Target gem not found in stockpile' };

  const sourceIdx = findSlotIndex(plan.stockpile, g => g.uid === action.sourceGemUid);
  if (sourceIdx === -1) return { ok: false, error: 'Source gem not found in stockpile' };

  const target = plan.stockpile[targetIdx]!;
  const source = plan.stockpile[sourceIdx]!;

  const threshold = registry.getBalance().transplant.unlockThreshold;
  if (!hasSecondarySlot(target, threshold)) {
    return { ok: false, error: 'Target does not have an open secondary slot' };
  }
  if (target.secondary) {
    return { ok: false, error: 'Target secondary slot is already filled' };
  }
  if (action.chosenAffix === 'secondary' && !source.secondary) {
    return { ok: false, error: 'Source has no secondary affix to choose' };
  }

  // Deterministic RNG fork — planTransplantGem runs at commit, so this must use the same
  // rng the match-controller seeded. Pass it in via plan if available; else use a stable fork.
  const rng = plan.rng.fork(`transplant_${target.uid}_${source.uid}`);
  const slot: SecondarySlot = resolveTransplant({ target, source, chosenAffix: action.chosenAffix, rng });

  const next = clonePlan(plan);
  const updatedTarget = {
    ...target,
    secondary: slot,
    tags: target.tags.includes(slot.affixId) ? target.tags : [...target.tags, slot.affixId],
  };

  next.stockpile = setSlot(next.stockpile, targetIdx, updatedTarget);
  next.stockpile = clearSlot(next.stockpile, sourceIdx);

  next.lockedGemUids.add(action.targetGemUid);
  next.lockedGemUids.add(action.sourceGemUid);

  next.actionLog.push(action);
  return { ok: true, plan: next };
}
```

**Adjust the RNG access path.** Read `forge-plan.ts` to see how `plan.rng` (or equivalent) is seeded. If there is no rng on `ForgePlan`, the resolver must accept one threaded from the match-controller; in that case add an optional `rng?` field to `ForgePlan` (seeded during `createForgePlan`) or pull from a helper like `plan.matchSeed`. Read the existing file to decide — don't invent API.

Also extend the top-level `applyPlanAction` switch to route `transplant_gem` to `planTransplantGem`.

- [ ] **Step 4: Create `preview.ts`**

`packages/engine/src/forge/transplant/preview.ts`:

```ts
import type { DataRegistry } from '../../data/registry.js';
import type { GemInstance } from '../../types/gem.js';
import type { TransplantPreview } from './types.js';
import { hasSecondarySlot } from '../../types/gem.js';

export function previewTransplant(
  target: GemInstance,
  source: GemInstance,
  registry: DataRegistry,
  chosenAffix?: 'primary' | 'secondary',
): TransplantPreview | null {
  const threshold = registry.getBalance().transplant.unlockThreshold;
  if (!hasSecondarySlot(target, threshold)) return null;
  if (target.secondary) return null;
  if (source.uid === target.uid) return null;

  const sourceHasSecondary = source.secondary !== undefined;
  const fluxCosts = registry.getBalance().gem.flux.costs;
  const fluxCost = chosenAffix ? fluxCosts.transplantChooseAffix : fluxCosts.transplantGem;

  if (!sourceHasSecondary || chosenAffix === 'primary') {
    return {
      targetUid: target.uid,
      sourceUid: source.uid,
      isRandom: false,
      possibleAffixes: [{ affixId: source.affixId, tier: source.tier, rarity: source.rarity }],
      resolvedSlot: {
        affixId: source.affixId,
        tier: source.tier,
        rarity: source.rarity,
        sourceGemUid: source.uid,
      },
      fluxCost,
    };
  }

  if (chosenAffix === 'secondary') {
    const sec = source.secondary!;
    return {
      targetUid: target.uid,
      sourceUid: source.uid,
      isRandom: false,
      possibleAffixes: [{ affixId: sec.affixId, tier: sec.tier, rarity: sec.rarity }],
      resolvedSlot: {
        affixId: sec.affixId,
        tier: sec.tier,
        rarity: sec.rarity,
        sourceGemUid: source.uid,
      },
      fluxCost,
    };
  }

  // Random path — both possibilities surfaced
  const sec = source.secondary!;
  return {
    targetUid: target.uid,
    sourceUid: source.uid,
    isRandom: true,
    possibleAffixes: [
      { affixId: source.affixId, tier: source.tier, rarity: source.rarity },
      { affixId: sec.affixId, tier: sec.tier, rarity: sec.rarity },
    ],
    resolvedSlot: null,
    fluxCost,
  };
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @alloy/engine test transplant` — expect PASS for all transplant suites.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/forge/forge-plan.ts packages/engine/src/forge/transplant/preview.ts packages/engine/tests/transplant-preview.test.ts
git commit -m "feat(engine): planTransplantGem + previewTransplant"
```

---

### Task 2.5: Implement `applyTransplantGem` in `forge-state.ts`

**Files:**
- Modify: `packages/engine/src/forge/forge-state.ts`
- Test: `packages/engine/tests/transplant-action.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/transplant-action.test.ts` — mirror the validation cases from Task 2.4 but at the `applyForgeAction` level. Cover: valid input success, each rejection path, source full consumption, target retains uid/primary, tags dedup.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/engine test transplant-action` — FAIL.

- [ ] **Step 3: Add the case to `applyForgeAction`**

Around line 84 of `packages/engine/src/forge/forge-state.ts`:

```ts
case 'transplant_gem':
  return applyTransplantGem(state, action, registry);
```

Add the function below the existing `applyCombine` / `applyCombine3` pattern — the shape is parallel to `planTransplantGem` but works on `ForgeState` instead of `ForgePlan`. Read `forge-state.ts` to see the exact state shape and helper functions available (`findSlotIndex`, `setSlot`, `clearSlot`, etc. — match `forge-plan.ts` naming).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @alloy/engine test transplant-action` — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/forge-state.ts packages/engine/tests/transplant-action.test.ts
git commit -m "feat(engine): applyTransplantGem forge action handler"
```

---

## Chunk 3: Combine engine refinement for filled-secondary gems

### Task 3.1: Combine skips signature/category for filled-secondary inputs

**Files:**
- Modify: `packages/engine/src/combine/combination-engine.ts`
- Test: `packages/engine/tests/secondary-combinability.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { CombinationEngine } from '../src/combine/combination-engine.js';
// Reuse test fixtures for recipe/discovery/category-map (see combination-engine.test.ts)
import { createGem, type SecondarySlot } from '../src/types/gem.js';

describe('combine with filled-secondary inputs', () => {
  it('rejects signature recipe match when either input has filled secondary', () => {
    // Build a pair of gems whose affix pair hits a known signature recipe.
    // Give one of them a filled secondary. Combine must reject.
    const sec: SecondarySlot = { affixId: 'X', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const g1 = { ...createGem('a', 'SIGNATURE_AFFIX_1', 2, 'rare'), secondary: sec };
    const g2 = createGem('b', 'SIGNATURE_AFFIX_2', 2, 'rare');
    // ... expect engine.combine(g1, g2, ...) to throw or return a reason
  });

  it('rejects category combo match when either input has filled secondary', () => { /* similar */ });

  it('succeeds on generic upgrade when both inputs share affix', () => {
    // Same-affix pair, one with filled secondary → output with surviving gem's secondary
    const sec: SecondarySlot = { affixId: 'X', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const g1 = { ...createGem('a', 'flat_physical', 3, 'rare'), secondary: sec };
    const g2 = createGem('b', 'flat_physical', 3, 'rare');
    // With keepGemUid=a → output has g1's secondary; with keepGemUid=b → output has no secondary
  });

  it('preserves keepGemUid gems secondary, discards the other', () => { /* ... */ });

  it('deterministic fallback when both filled and no keepGemUid: higher rarity → higher tier → uid', () => {
    const secA: SecondarySlot = { affixId: 'A', tier: 2, rarity: 'magic', sourceGemUid: 'x' };
    const secB: SecondarySlot = { affixId: 'B', tier: 2, rarity: 'magic', sourceGemUid: 'y' };
    const g1 = { ...createGem('a', 'flat_physical', 3, 'rare'), secondary: secA };
    const g2 = { ...createGem('b', 'flat_physical', 3, 'epic'), secondary: secB }; // higher rarity → g2 wins
    // Output secondary = secB
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/engine test secondary-combinability` — FAIL.

- [ ] **Step 3: Update `combination-engine.ts`**

Locate the recipe-resolution entry point (probably `combine()` around line 80). Add a filter: if either input has `secondary !== undefined`, bypass signature + category recipe lookup and route directly to the generic-upgrade path. If generic upgrade does not match (different affixIds, or tier/rarity already maxed), return a specific error code:

```ts
const REASON_FILLED_SECONDARY_NOT_GENERIC =
  'Filled-secondary gems can only combine via generic tier/rarity upgrade with a same-affix partner';

// inside combine(…):
const eitherFilled = gemA.secondary !== undefined || gemB.secondary !== undefined;
if (eitherFilled) {
  const genericResult = this.tryGenericUpgrade(gemA, gemB, outputUid, keepGemUid);
  if (!genericResult) {
    throw new Error(REASON_FILLED_SECONDARY_NOT_GENERIC);
  }
  return this.carryOverSecondary(genericResult, gemA, gemB, keepGemUid);
}
// existing signature → category → generic pass continues for non-filled inputs
```

`carryOverSecondary` is a new helper: decide which input survives (`keepGemUid` if set; otherwise higher-rarity → higher-tier → lexicographic uid fallback). Copy that input's `secondary` onto the output gem.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @alloy/engine test secondary-combinability` and `pnpm --filter @alloy/engine test combination-engine` — expect both PASS; existing combination-engine tests should continue to pass since non-filled paths are untouched.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/combine/combination-engine.ts packages/engine/tests/secondary-combinability.test.ts
git commit -m "feat(engine): combine filters signature/category for filled-secondary gems"
```

---

### Task 3.2: Update `planCombine` / `planCombine3` error surfacing

**Files:**
- Modify: `packages/engine/src/forge/forge-plan.ts`
- Test: extend `packages/engine/tests/secondary-combinability.test.ts`

- [ ] **Step 1: Add tests for plan-level rejection**

Extend the combinability suite to call `applyPlanAction` with a `combine` action against filled-secondary inputs and verify the returned `{ ok: false, error }` matches the new reason string from Task 3.1.

- [ ] **Step 2: Verify `planCombine` already surfaces the engine's error**

Read the existing `planCombine` implementation (lines ~159–208). It already wraps `engine.combine(...)` in try/catch and returns `{ ok: false, error: err.message }`. If that's the case, the test should pass without further code changes. If the code swallows or rewrites the error, adjust to pass the original reason through.

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @alloy/engine test secondary-combinability` — PASS.

- [ ] **Step 4: Commit (may be empty if no code change)**

```bash
git add packages/engine/tests/secondary-combinability.test.ts
git commit -m "test(engine): verify plan-level error surfacing for filled-secondary combines"
```

(If `forge-plan.ts` was also edited: add it to the stage.)

---

## Chunk 4: Stat pipeline + synergy integration

### Task 4.1: Secondary effect contribution in `stat-calculator.ts`

**Files:**
- Modify: `packages/engine/src/forge/stat-calculator.ts`
- Test: extend `packages/engine/tests/stat-calculator.test.ts`

- [ ] **Step 1: Locate the affix-iteration loop**

Read `stat-calculator.ts`. Find where per-socketed-gem effects are emitted — a loop over weapon sockets emitting `weaponEffect[]` from the gem's affix, and a parallel loop for armor sockets. Mark the insertion point.

- [ ] **Step 2: Write the failing test**

Extend `stat-calculator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateStats } from '../src/forge/stat-calculator.js';
import { createGem, type SecondarySlot, RARITY_MULTIPLIERS } from '../src/types/gem.js';
// ... reuse existing fixtures for a minimal loadout + registry

describe('secondary affix stat contribution', () => {
  it('adds secondary effects when host is in weapon slot and affix has weaponEffect', () => {
    const sec: SecondarySlot = { affixId: 'flat_physical', tier: 3, rarity: 'magic', sourceGemUid: 's' };
    const host = { ...createGem('h', 'flat_life', 5, 'rare'), secondary: sec };
    // Socket host into weapon slot 0
    // calculateStats should emit primary (flat_life weaponEffect) AND secondary (flat_physical weaponEffect)
    // Secondary value = affixes.flat_physical.tiers[3].weaponEffect × RARITY_MULTIPLIERS.magic × secondaryValueScalar
  });

  it('adds secondary armor effects when host is in armor slot', () => { /* parallel */ });

  it('contributes nothing when affix has no effect for the host slot type', () => {
    // affix with only weaponEffect, host in armor → secondary contributes 0
  });

  it('applies secondaryValueScalar multiplier from balance.transplant', () => {
    // Set secondaryValueScalar to 0.5 via test registry override; expect half values
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @alloy/engine test stat-calculator` — FAIL.

- [ ] **Step 4: Implement secondary emission**

Inside `stat-calculator.ts`, for each socketed gem iteration, after emitting primary effects, check `gem.secondary`. If present:

```ts
if (gem.secondary) {
  const sec = gem.secondary;
  const affix = registry.getAffix(sec.affixId);
  const tierDef = affix.tiers[sec.tier];
  const effectList = slotType === 'weapon' ? tierDef.weaponEffect : tierDef.armorEffect;
  if (effectList && effectList.length > 0) {
    const rarityMult = RARITY_MULTIPLIERS[sec.rarity];
    const globalScalar = registry.getBalance().transplant.secondaryValueScalar;
    for (const mod of effectList) {
      emitModifier({
        ...mod,
        value: mod.value * rarityMult * globalScalar,
      });
    }
  }
}
```

Adjust `emitModifier` / `slotType` / registry accessor names to match actual file shape — this sketch captures the logic, not the literal API.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @alloy/engine test stat-calculator` — PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/forge/stat-calculator.ts packages/engine/tests/stat-calculator.test.ts
git commit -m "feat(engine): secondary affixes contribute to stat pipeline with rarity + scalar"
```

---

### Task 4.2: Synergies include transplanted affixes via `tags[]`

**Files:**
- Modify: `packages/engine/src/forge/stat-calculator.ts` (update `collectAffixIds` helper)
- Test: `packages/engine/tests/secondary-synergy.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
// ... reuse loadout fixture
import { createGem, type SecondarySlot } from '../src/types/gem.js';

describe('synergies with transplanted affixes', () => {
  it('fires when synergy affix exists only as a secondary on weapon', () => {
    // Pick a known synergy from synergies.json (e.g., one requiring affixes X, Y on weapon+armor).
    // Put X on weapon as primary, Y on armor ONLY as a secondary (transplanted).
    // Expect computeActiveSynergies to mark that synergy active.
  });

  it('fires when synergy affix exists only as a secondary on armor', () => { /* parallel */ });

  it('does not fire when tags[] is missing the synergy affix', () => { /* negative */ });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/engine test secondary-synergy` — FAIL.

- [ ] **Step 3: Update `collectAffixIds`**

In `stat-calculator.ts`, locate `collectAffixIds` (helper used by `computeActiveSynergies`, ~line 195). Change it from iterating `gem.affixId` per socketed gem to iterating `gem.tags` (dedup). Since `tags` always includes the primary `affixId` and transplant appends secondary's `affixId`, this captures both automatically.

```ts
function collectAffixIds(gems: GemInstance[]): string[] {
  const ids = new Set<string>();
  for (const gem of gems) {
    for (const tag of gem.tags) ids.add(tag);
  }
  return [...ids];
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @alloy/engine test secondary-synergy` and `pnpm --filter @alloy/engine test stat-calculator` — expect PASS. Also run full synergy suite (if there is one) to verify no regressions.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/stat-calculator.ts packages/engine/tests/secondary-synergy.test.ts
git commit -m "feat(engine): synergies include transplanted affixes via gem.tags"
```

---

## Chunk 5: Match-controller flux integration + AI strategy

### Task 5.1: Add `transplant_gem` to match-controller flux switch

**Files:**
- Modify: `packages/engine/src/match/match-controller.ts`
- Test: `packages/engine/tests/match-controller-transplant.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
// ... reuse match-controller test fixtures

describe('match-controller transplant_gem', () => {
  it('no flux deducted when chosenAffix absent (random path)', () => {
    // Setup: run mode, player 0, target with open empty slot, source with primary only
    // Dispatch { kind: 'transplant_gem', targetGemUid, sourceGemUid } without chosenAffix
    // Expect state.runState.flux unchanged; transplant applied
  });

  it('deducts transplantChooseAffix cost when chosenAffix is set', () => {
    // Setup: runState.flux = 10; chooseAffix cost = 3
    // Dispatch transplant_gem with chosenAffix='primary'
    // Expect state.runState.flux === 7; transplant applied
  });

  it('rejects when chosenAffix set but insufficient flux', () => {
    // runState.flux = 2, cost = 3
    // Expect { ok: false, error: /insufficient flux/i }; state unchanged
  });

  it('non-run modes skip the flux half but apply transplant when chosenAffix absent', () => {
    // mode: 'quick'; expect transplant succeeds; no runState mutation
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/engine test match-controller-transplant` — FAIL.

- [ ] **Step 3: Update `match-controller.ts`**

Inside the flux-switch (~line 248), add after `guarantee_rarity`:

```ts
case 'transplant_gem': {
  if (action.chosenAffix && state.runState) {
    const cost = fluxCosts.transplantChooseAffix ?? 3;
    if (!canSpendFlux(state.runState.flux, cost)) {
      return fail(`Insufficient flux for transplant_gem chooseAffix (need ${cost}, have ${state.runState.flux})`);
    }
    state = { ...state, runState: { ...state.runState, flux: spendFlux(state.runState.flux, cost) } };
  }
  // intentional break — falls through to forge-action apply path
  break;
}
```

**Careful:** the existing flux-switch cases use `return ok(...)` to short-circuit (they don't need a subsequent forge-apply step). Transplant is different — we need the state mutation. Refactor slightly: bind the potentially-updated `state` to a mutable `let` at the top of the dispatch, then let the switch re-assign it on flux success and fall through; after the switch, the forge-apply pathway uses the (possibly updated) `state`. Inspect the existing function shape and adopt the minimal-impact variant.

If that refactor is too invasive, an alternative: handle transplant flux *after* the existing flux-switch (as a separate check) using the same pattern but returning `ok({ ...state, runState: updatedRunState })` wrapped around a recursive call or explicit forge-apply invocation. Pick whichever pattern reads cleanest against the current match-controller.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @alloy/engine test match-controller-transplant` and `pnpm --filter @alloy/engine test match-controller` — expect PASS. No regression on `boost_combine` / `reroll_pool` / `guarantee_rarity`.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/match/match-controller.ts packages/engine/tests/match-controller-transplant.test.ts
git commit -m "feat(engine): match-controller deducts flux for transplant chooseAffix path"
```

---

### Task 5.2: AI strategy awareness

**Files:**
- Modify: `packages/engine/src/ai/strategies/forge-strategy.ts`
- Test: `packages/engine/tests/forge-strategy-transplant.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
// ... set up AI state fixtures

describe('AI forge strategy — transplant', () => {
  it('considers transplant when owning a host with open empty slot + an affix-appropriate source', () => {
    // Build a stockpile: T5 Rare host (open empty), low-tier donor whose affix scores high in host slot type
    // Run forge-strategy → expect at least one transplant_gem action in the output plan
  });

  it('does not transplant when host has no open slot', () => { /* negative */ });

  it('skips signature/category combine when filled-secondary inputs present', () => {
    // Build inputs that would match a signature recipe but one has filled secondary
    // Strategy should NOT emit that combine; may still consider generic upgrade
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/engine test forge-strategy-transplant` — FAIL.

- [ ] **Step 3: Update `forge-strategy.ts`**

Read the existing file to understand how combine/socket/remove actions are scored. Add a transplant-evaluation branch:

- For each stockpile gem `host` with `hasSecondarySlot(host, threshold) && !host.secondary`:
  - For each other stockpile gem `source`:
    - Compute the "gain" of transplanting source's primary (or secondary) into host:
      - Use the existing stat-evaluation heuristic to score host with a hypothetical secondary.
      - Compare to baseline (host without secondary).
    - If the gain exceeds a threshold AND the source is not already the primary of a better plan (e.g., would itself be a more valuable socket), emit a candidate action.
- Keep v1 simple: use default `chosenAffix=undefined` (random path, no flux cost) unless the evaluator detects both affixes have meaningfully different scores, in which case emit `chosenAffix=primary` (or `secondary`) and budget the flux cost.

Filter combine candidates: when scoring signature/category matches, skip any pair where either input has `secondary !== undefined` (the engine would reject them).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @alloy/engine test forge-strategy-transplant` and `pnpm --filter @alloy/engine test forge-strategy` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ai/strategies/forge-strategy.ts packages/engine/tests/forge-strategy-transplant.test.ts
git commit -m "feat(engine): AI forge strategy evaluates transplant and skips invalid combines"
```

---

## Chunk 6: Client — Workbench rename + store changes

### Task 6.1: Rename `CombineWorkbench` → `Workbench`

**Files:**
- Rename: `packages/client/src/components/CombineWorkbench.tsx` → `Workbench.tsx`
- Rename: `packages/client/src/components/CombineWorkbench.test.tsx` → `Workbench.test.tsx`
- Modify: all importers

- [ ] **Step 1: Find all importers**

```bash
grep -rn "CombineWorkbench" packages/client/src packages/client/e2e
```

Expected: imports in `CombineDock.tsx`, the test file (self-reference), and any stories/showcase pages.

- [ ] **Step 2: Rename files**

```bash
git mv packages/client/src/components/CombineWorkbench.tsx packages/client/src/components/Workbench.tsx
git mv packages/client/src/components/CombineWorkbench.test.tsx packages/client/src/components/Workbench.test.tsx
```

- [ ] **Step 3: Rename the export inside `Workbench.tsx`**

`CombineWorkbench` → `Workbench`, and the props interface `CombineWorkbenchProps` → `WorkbenchProps`. Update the `computeGlowSignal` export name if desired (leave it as-is for less churn; it's not a component).

- [ ] **Step 4: Update importers**

In each file that imported `CombineWorkbench`, change to `Workbench`. Use Edit tool per file.

- [ ] **Step 5: Run tests + typecheck**

```bash
pnpm --filter @alloy/client typecheck
pnpm --filter @alloy/client test Workbench
```

Expect PASS (same logic, renamed).

- [ ] **Step 6: Commit**

```bash
git add packages/client/
git commit -m "refactor(client): rename CombineWorkbench to Workbench"
```

---

### Task 6.2: Rename `CombineDock` → `WorkbenchDock`

**Files:**
- Rename: `packages/client/src/components/forge-desktop/CombineDock.tsx` → `WorkbenchDock.tsx`
- Modify: `packages/client/src/components/forge-desktop/ForgeDesktop.tsx`
- Modify: any other importers

- [ ] **Step 1: Find importers**

```bash
grep -rn "CombineDock" packages/client/src
```

- [ ] **Step 2: Rename**

```bash
git mv packages/client/src/components/forge-desktop/CombineDock.tsx packages/client/src/components/forge-desktop/WorkbenchDock.tsx
```

- [ ] **Step 3: Rename the export inside `WorkbenchDock.tsx`**

`CombineDock` → `WorkbenchDock`, `CombineDockProps` → `WorkbenchDockProps`.

- [ ] **Step 4: Update `ForgeDesktop.tsx` to use the new name**

- [ ] **Step 5: Run typecheck + tests**

```bash
pnpm --filter @alloy/client typecheck
pnpm --filter @alloy/client test ForgeDesktop
```

- [ ] **Step 6: Commit**

```bash
git add packages/client/
git commit -m "refactor(client): rename CombineDock to WorkbenchDock"
```

---

### Task 6.3: Extend `forgeStore` with transplant slot state

**Files:**
- Modify: `packages/client/src/stores/forgeStore.ts`
- Test: `packages/client/src/stores/forgeStore.test.ts`

- [ ] **Step 1: Write the failing test**

Extend `forgeStore.test.ts`:

```ts
describe('forgeStore transplant', () => {
  it('initial transplant state is empty', () => {
    const store = useForgeStore.getState();
    expect(store.transplantChosenAffix).toBe(null);
    expect(store.transplantHostUid).toBe(null);
    expect(store.transplantPreview).toBe(null);
  });

  it('setTransplantChosenAffix updates the pick', () => {
    useForgeStore.getState().setTransplantChosenAffix('primary');
    expect(useForgeStore.getState().transplantChosenAffix).toBe('primary');
  });

  it('computeTransplantPreview derives preview from slot 0 + slot 1 of comboSlots', () => {
    // Seed comboSlots with a valid host+source pair
    // Call computeTransplantPreview(registry)
    // Expect result.isRandom / possibleAffixes to match previewTransplant output
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/client test forgeStore` — FAIL.

- [ ] **Step 3: Extend the store**

Add to `forgeStore.ts`:

```ts
import { previewTransplant, type TransplantPreview } from '@alloy/engine';

interface ForgeStoreState {
  // ...existing...
  transplantHostUid: string | null;
  transplantChosenAffix: 'primary' | 'secondary' | null;
  transplantPreview: TransplantPreview | null;

  setTransplantHostUid: (uid: string | null) => void;
  setTransplantChosenAffix: (val: 'primary' | 'secondary' | null) => void;
  computeTransplantPreview: (registry: DataRegistry) => TransplantPreview | null;
  clearTransplantState: () => void;
}
```

Implementation of `computeTransplantPreview`:

```ts
computeTransplantPreview: (registry) => {
  const { comboSlots, transplantHostUid, transplantChosenAffix } = get();
  const [a, b] = comboSlots;
  if (!a || !b) {
    set({ transplantPreview: null });
    return null;
  }
  // Host inference: respect transplantHostUid if set; else use deterministic rule
  const host = transplantHostUid === a.uid ? a : transplantHostUid === b.uid ? b : pickHostDeterministic(a, b, registry);
  const source = host.uid === a.uid ? b : a;
  const preview = previewTransplant(host, source, registry, transplantChosenAffix ?? undefined);
  set({ transplantPreview: preview });
  return preview;
},
```

Add `pickHostDeterministic`: higher tier → higher rarityIndex → first-placed (slot 0) wins.

Also reset `transplantChosenAffix` and `transplantHostUid` inside `clearComboSlots` and `reset`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @alloy/client test forgeStore` — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/forgeStore.ts packages/client/src/stores/forgeStore.test.ts
git commit -m "feat(client): forgeStore transplant slot state + preview derivation"
```

---

### Task 6.4: Workbench renders dual CTAs + transplant controls

**Files:**
- Modify: `packages/client/src/components/Workbench.tsx`
- Create: `packages/client/src/components/forge-desktop/TransplantControls.tsx`
- Modify: `packages/client/src/components/forge-desktop/WorkbenchDock.tsx`
- Test: `packages/client/src/components/Workbench.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

Extend `Workbench.test.tsx`:

```ts
describe('Workbench dual CTAs', () => {
  it('Combine button enabled when a recipe match exists (existing behavior)', () => { /* ... */ });
  it('Transplant button disabled when fewer than 2 slots filled', () => { /* ... */ });
  it('Transplant button disabled when neither gem has open empty slot', () => { /* ... */ });
  it('Transplant button enabled when slot 3 empty and host + source valid', () => { /* ... */ });

  it('shows affix picker when source has filled secondary', () => {
    // Render with a host + source-with-secondary
    // Expect dice icon (random), primary pill, secondary pill visible
  });

  it('picker defaults to random; clicking primary pill switches and shows flux cost', () => { /* ... */ });

  it('preview card shows both affixes with dice marker for random mode', () => { /* ... */ });

  it('clicking Transplant emits transplant_gem action with correct payload', () => {
    const onTransplant = vi.fn();
    // Render with valid host+source; click Transplant
    // Expect onTransplant called with { targetGemUid, sourceGemUid, chosenAffix: undefined | 'primary' | 'secondary' }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @alloy/client test Workbench` — FAIL.

- [ ] **Step 3: Create `TransplantControls.tsx`**

```tsx
import type { GemInstance, TransplantPreview } from '@alloy/engine';

interface Props {
  host: GemInstance;
  source: GemInstance;
  preview: TransplantPreview;
  chosenAffix: 'primary' | 'secondary' | null;
  onChooseAffix: (val: 'primary' | 'secondary' | null) => void;
  onConfirm: () => void;
  canAffordChoiceFlux: boolean;
}

export function TransplantControls({ host, source, preview, chosenAffix, onChooseAffix, onConfirm, canAffordChoiceFlux }: Props) {
  // Render:
  //  - affix pills (Random 🎲 default, primary, secondary if source.secondary)
  //  - flux cost row when a specific pill is selected (show canAffordChoiceFlux gating)
  //  - Confirm button labeled "Transplant" or "Transplant (− N flux)"
  // Use existing HapticButton / button token styles in the component layer.
}
```

- [ ] **Step 4: Extend `Workbench.tsx`**

Add props:

```ts
interface WorkbenchProps {
  // ...existing combine props...
  transplantPreview?: TransplantPreview | null;
  transplantHost?: GemInstance | null;
  transplantSource?: GemInstance | null;
  transplantChosenAffix: 'primary' | 'secondary' | null;
  canAffordTransplantChoice: boolean;
  onChooseTransplantAffix: (val: 'primary' | 'secondary' | null) => void;
  onTransplant: () => void;
}
```

Add two CTAs below the existing preview region (or next to Combine, matching mockup). Combine button enablement logic is unchanged. Transplant button enablement:

```ts
const transplantEnabled = Boolean(
  transplantPreview &&
  comboSlots[0] && comboSlots[1] && !comboSlots[2],
);
```

When `transplantEnabled` and `transplantPreview`, render `<TransplantControls ... />` below the button row. Preview card shows:

- Random mode → "🎲 +A or +B (source T/rarity)"
- Chosen mode → "+X (source T/rarity)"

- [ ] **Step 5: Update `WorkbenchDock.tsx`**

Pass the new transplant props through from `ForgeDesktop.tsx` → `WorkbenchDock` → `Workbench`. `ForgeDesktop` reads `transplantPreview` etc. from `forgeStore`.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @alloy/client test Workbench` — PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/Workbench.tsx packages/client/src/components/forge-desktop/TransplantControls.tsx packages/client/src/components/forge-desktop/WorkbenchDock.tsx packages/client/src/components/Workbench.test.tsx
git commit -m "feat(client): Workbench dual CTAs + TransplantControls"
```

---

## Chunk 7: Client — ForgeDesktop wiring + stockpile pip

### Task 7.1: Wire ForgeDesktop to dispatch `transplant_gem`

**Files:**
- Modify: `packages/client/src/components/forge-desktop/ForgeDesktop.tsx`
- Test: `packages/client/src/components/forge-desktop/ForgeDesktop.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Extend `ForgeDesktop.test.tsx`:

```ts
it('dropping two transplantable gems enables Transplant button; clicking dispatches transplant_gem', async () => {
  // Render ForgeDesktop with a stockpile containing a valid host + source
  // Programmatically seed comboSlots via store setters
  // computeTransplantPreview runs; Transplant button enables
  // Click Transplant → mock applyAction receives { kind: 'transplant_gem', targetGemUid, sourceGemUid }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/client test ForgeDesktop` — FAIL.

- [ ] **Step 3: Update `ForgeDesktop.tsx`**

Read store transplant state, wire into `<WorkbenchDock>`. Dispatch helper:

```ts
const onTransplant = () => {
  const { comboSlots, transplantHostUid, transplantChosenAffix } = useForgeStore.getState();
  const [a, b] = comboSlots;
  if (!a || !b) return;
  const host = transplantHostUid === a.uid ? a : transplantHostUid === b.uid ? b : pickHostDeterministic(a, b, registry);
  const source = host.uid === a.uid ? b : a;
  applyAction({
    kind: 'transplant_gem',
    targetGemUid: host.uid,
    sourceGemUid: source.uid,
    chosenAffix: transplantChosenAffix ?? undefined,
  }, registry);
  clearComboSlots();
  clearTransplantState();
};
```

After a successful apply, also trigger a flux cost deduction visual (reuse existing flux-toast pattern if any).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @alloy/client test ForgeDesktop` — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/forge-desktop/ForgeDesktop.tsx packages/client/src/components/forge-desktop/ForgeDesktop.test.tsx
git commit -m "feat(client): wire ForgeDesktop to dispatch transplant_gem"
```

---

### Task 7.2: Stockpile gem pip for secondary slot state

**Files:**
- Modify: `packages/client/src/components/forge-desktop/StockpileStrip.tsx` (or the `StockpileGem` child, whichever renders the gem tile)
- Test: `packages/client/src/components/forge-desktop/StockpileStrip.test.tsx` (extend or create)

- [ ] **Step 1: Locate the gem-render component**

Read `StockpileStrip.tsx`. Find where each gem is rendered as a tile. Identify whether the render sits inline or in a child component.

- [ ] **Step 2: Write the failing test**

```ts
describe('StockpileStrip secondary pip', () => {
  it('renders dashed-outline pip for open-empty secondary slot', () => {
    // Gem: T5 Rare, no secondary
    // Expect element with data-testid="gem-secondary-slot-open" and data-gem-uid
  });

  it('renders filled pip with affix id for filled secondary', () => {
    // Gem: T5 Rare, secondary = { affixId: 'flat_life', ... }
    // Expect data-testid="gem-secondary-slot-filled", data-secondary-affix="flat_life"
  });

  it('renders no pip when gem does not meet threshold', () => {
    // Gem: T3 Common
    // Expect no gem-secondary-slot-* elements
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @alloy/client test StockpileStrip` — FAIL.

- [ ] **Step 4: Implement the pip**

In the gem render, import `hasSecondarySlotFromRegistry` and compute:

```tsx
const hasSlot = hasSecondarySlotFromRegistry(gem, registry);
const filled = gem.secondary !== undefined;
```

Render conditionally below the primary icon:

```tsx
{hasSlot && !filled && (
  <div data-testid="gem-secondary-slot-open" data-gem-uid={gem.uid} className="... dashed outline …" />
)}
{hasSlot && filled && (
  <div data-testid="gem-secondary-slot-filled" data-gem-uid={gem.uid} data-secondary-affix={gem.secondary.affixId} className="… solid …">
    <GemAffixIcon affixId={gem.secondary.affixId} />
  </div>
)}
```

Use existing gem-icon tokens so the pip inherits the visual language.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @alloy/client test StockpileStrip` — PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/forge-desktop/StockpileStrip.tsx packages/client/src/components/forge-desktop/StockpileStrip.test.tsx
git commit -m "feat(client): stockpile gem pip renders open/filled secondary slots"
```

---

### Task 7.3: Tooltip for "filled-secondary cannot signature/category combine"

**Files:**
- Modify: `packages/client/src/components/Workbench.tsx` (or wherever combine-button tooltip lives)

- [ ] **Step 1: Write the failing test**

Extend `Workbench.test.tsx`:

```ts
it('Combine button shows tooltip when filled-secondary inputs block signature/category but no generic match', () => {
  // Render with two filled-secondary gems of different affixes (no generic upgrade possible)
  // Combine disabled with tooltip "Filled-secondary gems only combine for generic tier/rarity upgrades."
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/client test Workbench` — FAIL.

- [ ] **Step 3: Implement tooltip**

When `combinePreview === null && hasFilledSecondaryInputs(comboSlots)`, attach the tooltip message to the combine button's disabled state.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @alloy/client test Workbench` — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/Workbench.tsx packages/client/src/components/Workbench.test.tsx
git commit -m "feat(client): Workbench combine tooltip clarifies filled-secondary restriction"
```

---

## Chunk 8: Onboarding tutorial + E2E

### Task 8.1: Onboarding flag + tutorial tooltip

**Files:**
- Modify: `packages/client/src/stores/onboardingStore.ts`
- Create: `packages/client/src/components/forge-desktop/TransplantTutorialTooltip.tsx`
- Modify: `packages/client/src/components/forge-desktop/StockpileStrip.tsx` (mount the tooltip)

- [ ] **Step 1: Write the failing test**

Extend `onboardingStore.test.ts`:

```ts
it('hasSeenTransplantTutorial starts false, flips true on markTransplantTutorialSeen', () => {
  const s = useOnboardingStore.getState();
  expect(s.hasSeenTransplantTutorial).toBe(false);
  s.markTransplantTutorialSeen();
  expect(useOnboardingStore.getState().hasSeenTransplantTutorial).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/client test onboardingStore` — FAIL.

- [ ] **Step 3: Add the flag + action**

```ts
hasSeenTransplantTutorial: boolean;
markTransplantTutorialSeen: () => void;
```

Persist alongside other onboarding flags (follow existing pattern in the file).

- [ ] **Step 4: Implement `TransplantTutorialTooltip.tsx`**

Component that renders a small tooltip near the first gem with an open-empty secondary slot, visible only when `!hasSeenTransplantTutorial`. Dismisses on any forge action (subscribe to `forgeStore.plan.actionLog.length` or a dedicated flag; whichever is cleaner).

Message: *"Drop another gem onto the Workbench with this one to transplant its affix into the empty slot."*

- [ ] **Step 5: Mount in `StockpileStrip`**

Conditionally render `<TransplantTutorialTooltip />` when any gem meets the condition and the flag is false. Only one tooltip on screen at a time.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @alloy/client test onboardingStore StockpileStrip` — PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/stores/onboardingStore.ts packages/client/src/stores/onboardingStore.test.ts packages/client/src/components/forge-desktop/TransplantTutorialTooltip.tsx packages/client/src/components/forge-desktop/StockpileStrip.tsx
git commit -m "feat(client): first-unlock transplant tutorial tooltip"
```

---

### Task 8.2: E2E happy-path transplant

**Files:**
- Create: `packages/client/e2e/forge-transplant.spec.ts`

- [ ] **Step 1: Scaffold the spec**

```ts
import { test, expect } from '@playwright/test';
import { startRunWithStockpile } from './helpers/run-fixtures'; // pre-existing helper pattern; adjust if named differently

test.describe('Forge — transplant happy path', () => {
  test('unlock secondary slot, transplant, verify resulting stats', async ({ page }) => {
    // 1. Start a run in a state where the player owns a T5 Rare gem + a T3 Magic donor
    // 2. Navigate to forge; drop both gems into Workbench slots 0 and 1
    // 3. Verify the Transplant button enables
    // 4. Click Transplant (random mode, no flux)
    // 5. Verify the source gem is removed, host now shows filled-secondary pip (data-testid="gem-secondary-slot-filled")
    // 6. Open stats panel; verify secondary affix's contribution appears in the stat breakdown
  });
});
```

- [ ] **Step 2: Inspect existing e2e fixtures**

Read `packages/client/e2e/helpers/` (if present) or any existing `forge-*.spec.ts` to understand the preferred fixture pattern. Reuse; do not reinvent.

- [ ] **Step 3: Run the spec**

```bash
pnpm --filter @alloy/client e2e forge-transplant --project=desktop
```

Expect PASS. If fixtures need extension (e.g., to seed a specific gem pair), add a helper and commit separately.

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/forge-transplant.spec.ts packages/client/e2e/helpers/
git commit -m "test(client): E2E happy-path for gem transplant"
```

---

## Chunk 9: Version bump + smoke verification

### Task 9.1: Bump client version

**Files:**
- Modify: `packages/client/package.json`

- [ ] **Step 1: Read current version**

`pnpm --filter @alloy/client pkg get version`

- [ ] **Step 2: Bump to 0.(minor+1).0** (this is a feature, not a fix)

```bash
pnpm --filter @alloy/client version minor --no-git-tag-version
```

- [ ] **Step 3: Run typecheck + tests (full)**

```bash
pnpm -r typecheck
pnpm -r test
pnpm --filter @alloy/client e2e
```

All green.

- [ ] **Step 4: Commit**

```bash
git add packages/client/package.json
git commit -m "chore(client): bump version for gem secondary stat feature"
```

---

## Notes on execution

- **Engine first, client second.** Do not start Chunk 6 until Chunks 1–5 are green.
- **TDD discipline:** every task starts with a failing test. Do not skip the "run test to verify it fails" step — it catches test-import bugs and confirms the test actually exercises the thing.
- **Frequent commits.** Each task ends with a commit even when trivial; this keeps the working tree clean and makes bisect fast if something regresses.
- **Check existing patterns before reinventing.** Particularly: test fixtures (`packages/engine/tests/` for gem/forge fixtures), store patterns (`createHmrStore`), component tokens (TailwindCSS v4 theme in `packages/client/src/index.css`).
- **Deferred work.** Mobile transplant UX and `packages/tools/` balance-simulation coverage are not in this plan — see spec "Out of scope" section.
