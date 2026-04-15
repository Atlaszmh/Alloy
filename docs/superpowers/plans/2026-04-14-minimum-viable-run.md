# Minimum Viable Run — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the run loop's biggest paper cuts — missing between-round feedback, pool scaling mismatch, no combine preview, and bare PostMatch — so the run mode feels like a complete game loop.

**Architecture:** Five independent tasks: (1) fix engine pool scaling to read from balance.json, (2) add a `previewCombine` method to the engine, (3) build a between-round interstitial component shown after each duel, (4) wire combine preview into the Forge UI, (5) enrich the PostMatch screen with run summary stats. Tasks 1-2 are engine-only. Tasks 3-5 are client-only (3 depends on nothing, 4 depends on 2, 5 depends on nothing).

**Tech Stack:** TypeScript, Vitest, React 19, Zustand 5, TailwindCSS v4

**Spec:** `docs/superpowers/specs/2026-04-14-run-loop-next-steps.md` (Proposal C)

---

## Chunk 1: Engine fixes (Tasks 1-2)

### Task 1: Fix pool scaling to use balance.json

The engine's `getPoolConfigForRound()` uses a hardcoded `DEFAULT_SCALING` table that disagrees with `balance.json`'s `gem.poolScaling`. The pool generator calls `getPoolConfigForRound(round)` without passing the balance config's scaling table. This means tuning `balance.json` has no effect on run pool generation.

**Files:**
- Modify: `packages/engine/src/pool/pool-generator.ts:58` (pass balance scaling to `getPoolConfigForRound`)
- Modify: `packages/engine/src/pool/pool-generator.ts:108` (same in `buildPool`)
- Test: `packages/engine/tests/pool-scaling.test.ts`

- [ ] **Step 1: Write a test that verifies pool generator uses balance.json scaling**

Add a test in `packages/engine/tests/pool-scaling.test.ts` that calls `getPoolConfigForRound` with a custom scaling table and checks it returns the custom values, not the defaults. The key assertion: round 2 with balance.json scaling should return poolSize 20 (rounds 1-2 bracket), but round 3 should return poolSize 18 (rounds 3-4 bracket) — NOT poolSize 20 (the default's rounds 1-3 bracket).

```typescript
describe('getPoolConfigForRound with balance.json scaling', () => {
  it('round 3 uses balance.json bracket [3,4] not default bracket [1,3]', () => {
    const balanceScaling: PoolScalingEntry[] = [
      { roundRange: [1, 2], tiers: [1, 2], rarities: ['common', 'uncommon'], poolSize: 20 },
      { roundRange: [3, 4], tiers: [1, 3], rarities: ['common', 'uncommon', 'magic'], poolSize: 18 },
      { roundRange: [5, 6], tiers: [2, 3], rarities: ['uncommon', 'magic', 'rare'], poolSize: 16 },
      { roundRange: [7, 8], tiers: [2, 4], rarities: ['magic', 'rare'], poolSize: 14 },
      { roundRange: [9, 10], tiers: [3, 4], rarities: ['magic', 'rare', 'epic'], poolSize: 12 },
      { roundRange: [11, 999], tiers: [3, 5], rarities: ['rare', 'epic'], poolSize: 10 },
    ];

    const config = getPoolConfigForRound(3, balanceScaling);
    expect(config.poolSize).toBe(18);
    expect(config.tiers).toEqual([1, 3]);
    expect(config.rarities).toContain('magic');
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd packages/engine && npx vitest run tests/pool-scaling.test.ts`

Expected: PASS — `getPoolConfigForRound` already accepts a `scaling` parameter (it's the second arg with a default). This test validates the existing interface works. The real bug is that callers in `pool-generator.ts` don't pass it.

- [ ] **Step 3: Write a test that verifies `generatePool` in run mode uses balance.json scaling**

This is the integration test that catches the actual bug. Add to a new file `packages/engine/tests/pool-generator-scaling.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generatePool } from '../src/pool/pool-generator.js';
import { loadAndValidateData } from '../src/data/index.js';
import { DataRegistry } from '../src/data/registry.js';

describe('generatePool uses balance.json scaling in run mode', () => {
  const data = loadAndValidateData();
  const registry = new DataRegistry(
    data.affixes, data.combinations, data.synergies, data.baseItems, data.balance,
  );
  const balancePoolScaling = data.balance.gem.poolScaling;

  it('round 3 pool size matches balance.json bracket, not hardcoded default', () => {
    // balance.json: rounds 3-4 → poolSize 18
    // hardcoded DEFAULT_SCALING: rounds 1-3 → poolSize 20
    const pool = generatePool(42, 'run_async', registry, 3);
    const expected = balancePoolScaling.find(
      (e: { roundRange: [number, number] }) => 3 >= e.roundRange[0] && 3 <= e.roundRange[1],
    );
    expect(pool.length).toBe(expected!.poolSize);
  });

  it('round 9 pool size matches balance.json bracket', () => {
    // balance.json: rounds 9-10 → poolSize 12
    // hardcoded DEFAULT_SCALING: rounds 7-9 → poolSize 14
    const pool = generatePool(42, 'run_async', registry, 9);
    const expected = balancePoolScaling.find(
      (e: { roundRange: [number, number] }) => 9 >= e.roundRange[0] && 9 <= e.roundRange[1],
    );
    expect(pool.length).toBe(expected!.poolSize);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/pool-generator-scaling.test.ts`

Expected: FAIL — round 3 will produce poolSize 20 (hardcoded) instead of 18 (balance.json). Round 9 will produce poolSize 14 instead of 12.

- [ ] **Step 5: Fix `pool-generator.ts` to pass balance.json scaling**

In `packages/engine/src/pool/pool-generator.ts`, modify `generatePool` and `buildPool` to pass the balance config's pool scaling to `getPoolConfigForRound`:

```typescript
// In generatePool(), line ~58:
// BEFORE:
const poolConfig = getPoolConfigForRound(round);
// AFTER:
const poolConfig = getPoolConfigForRound(round, balance.gem.poolScaling);

// In buildPool(), line ~108:
// BEFORE:
const poolConfig = isRunMode ? getPoolConfigForRound(round) : null;
// AFTER:
const poolConfig = isRunMode ? getPoolConfigForRound(round, balance.gem.poolScaling) : null;
```

- [ ] **Step 6: Run both test files to verify they pass**

Run: `cd packages/engine && npx vitest run tests/pool-scaling.test.ts tests/pool-generator-scaling.test.ts`

Expected: ALL PASS

- [ ] **Step 7: Run the full engine test suite to check for regressions**

Run: `cd packages/engine && npx vitest run`

Expected: ALL PASS. The `run-async-integration.test.ts` tests may need adjustment if they assert specific pool sizes that now come from balance.json instead of the hardcoded defaults. If any fail, update the expected values to match balance.json.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/pool/pool-generator.ts packages/engine/tests/pool-generator-scaling.test.ts packages/engine/tests/pool-scaling.test.ts
git commit -m "fix(engine): use balance.json pool scaling instead of hardcoded defaults

getPoolConfigForRound was called without passing the balance config's
poolScaling table, so tuning balance.json had no effect on run pool
generation. Now passes registry.getBalance().gem.poolScaling."
```

---

### Task 2: Add `previewCombine` method with discovery gating

The combine preview should only reveal the output gem if the player has previously attempted that combination. First-time combos stay mysterious ("?") so players organically discover recipes. `DiscoveryState` already tracks attempted combos via `hasAttempted(affixIdA, affixIdB)`.

**Design:**
- `previewCombine` returns a `CombinePreview` with `known: boolean` and `gem: GemInstance | null`
- `known` is `true` only if `discovery.hasAttempted(gemA.affixId, gemB.affixId)`
- `layer` is always returned (so the UI can show gold/white glow hints for unknown combos)
- `gem` is only populated when `known` is `true`

**Files:**
- Modify: `packages/engine/src/combine/combination-engine.ts` (add `previewCombine` method + `CombinePreview` type)
- Modify: `packages/engine/src/combine/discovery-state.ts` (add `clone()`)
- Modify: `packages/engine/src/index.ts` (export `CombinePreview` type)
- Test: `packages/engine/tests/combination-engine.test.ts`

- [ ] **Step 1: Write failing tests for `previewCombine`**

Add to `packages/engine/tests/combination-engine.test.ts`. This `describe` block should go **inside** the existing `describe('CombinationEngine')` block. The existing `beforeEach` creates variables named `registry` (a `RecipeRegistry`), `discovery`, and `categoryMap`.

```typescript
describe('previewCombine', () => {
  it('returns known=false with no gem for never-attempted combos', () => {
    const freshDiscovery = new DiscoveryState();
    const previewEngine = new CombinationEngine(registry, freshDiscovery, categoryMap);

    const gemA = createGem('a', 'fire_damage', 2, 'common');
    const gemB = createGem('b', 'cold_damage', 2, 'common');

    const preview = previewEngine.previewCombine(gemA, gemB);
    expect(preview).not.toBeNull();
    expect(preview!.known).toBe(false);
    expect(preview!.gem).toBeNull();
    expect(preview!.layer).toBeDefined();

    // Discovery state should NOT be mutated
    expect(freshDiscovery.totalDiscoveryCount()).toBe(0);
    expect(freshDiscovery.hasAttempted('fire_damage', 'cold_damage')).toBe(false);
  });

  it('returns known=true with gem after combo has been attempted', () => {
    const freshDiscovery = new DiscoveryState();
    const previewEngine = new CombinationEngine(registry, freshDiscovery, categoryMap);

    const gemA = createGem('a', 'fire_damage', 2, 'common');
    const gemB = createGem('b', 'cold_damage', 2, 'common');

    // First: actually combine to record the attempt
    const actual = previewEngine.combine(gemA, gemB, 'out');
    expect(freshDiscovery.hasAttempted('fire_damage', 'cold_damage')).toBe(true);

    // Now preview should return known=true with the gem
    const gemA2 = createGem('a2', 'fire_damage', 2, 'common');
    const gemB2 = createGem('b2', 'cold_damage', 2, 'common');
    const preview = previewEngine.previewCombine(gemA2, gemB2);

    expect(preview).not.toBeNull();
    expect(preview!.known).toBe(true);
    expect(preview!.gem).not.toBeNull();
    expect(preview!.gem!.affixId).toBe(actual.gem.affixId);
    expect(preview!.gem!.tier).toBe(actual.gem.tier);
    expect(preview!.gem!.rarity).toBe(actual.gem.rarity);
    expect(preview!.layer).toBe(actual.layer);
  });

  it('returns null for non-combinable gems', () => {
    const freshDiscovery = new DiscoveryState();
    const previewEngine = new CombinationEngine(registry, freshDiscovery, categoryMap);

    const gem = createGem('a', 'fire_damage', 5, 'legendary');
    expect(gem.combinable).toBe(false);

    const other = createGem('b', 'cold_damage', 1, 'common');
    const preview = previewEngine.previewCombine(gem, other);
    expect(preview).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/combination-engine.test.ts -t "previewCombine"`

Expected: FAIL — `previewCombine` does not exist yet.

- [ ] **Step 3: Add `clone()` to `DiscoveryState`**

In `packages/engine/src/combine/discovery-state.ts`, add a method that leverages the existing `serialize`/`deserialize` round-trip:

```typescript
clone(): DiscoveryState {
  return DiscoveryState.deserialize(this.serialize());
}
```

This is a one-liner that reuses existing tested code paths and avoids any `any` casts.

- [ ] **Step 4: Implement `previewCombine` and `CombinePreview` type**

Add the type and method to `packages/engine/src/combine/combination-engine.ts`:

```typescript
// Add near the top with other exported types:
export interface CombinePreview {
  /** true if this affix pair has been attempted before (player knows the result) */
  known: boolean;
  /** which combination layer would handle this pair */
  layer: CombineLayer;
  /** the output gem — only populated when known is true */
  gem: GemInstance | null;
  /** recipe ID if signature layer and known */
  recipeId?: string;
}
```

Add inside the `CombinationEngine` class:

```typescript
/**
 * Preview what a combine would produce without mutating discovery state.
 * Returns null if either gem is not combinable.
 * Returns CombinePreview with known=false (gem=null) for never-attempted combos.
 * Returns CombinePreview with known=true (gem populated) for previously-attempted combos.
 */
previewCombine(
  gemA: GemInstance,
  gemB: GemInstance,
): CombinePreview | null {
  if (!gemA.combinable || !gemB.combinable) {
    return null;
  }

  const known = this.discovery.hasAttempted(gemA.affixId, gemB.affixId);

  // Run combine on a cloned discovery state to get the result without side effects
  const tempDiscovery = this.discovery.clone();
  const tempEngine = new CombinationEngine(
    this.registry,
    tempDiscovery,
    this.categoryMap,
    this.config,
  );

  try {
    const result = tempEngine.combine(gemA, gemB, '__preview__');
    return {
      known,
      layer: result.layer,
      gem: known ? result.gem : null,
      recipeId: known ? result.recipeId : undefined,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Export `CombinePreview` from engine index**

In `packages/engine/src/index.ts`, update the combination engine exports:

```typescript
// Change:
export type { CombineResult, CombineLayer, CombineConfig } from './combine/combination-engine.js';
// To:
export type { CombineResult, CombineLayer, CombineConfig, CombinePreview } from './combine/combination-engine.js';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/combination-engine.test.ts -t "previewCombine"`

Expected: PASS

- [ ] **Step 7: Run the full engine test suite**

Run: `cd packages/engine && npx vitest run`

Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/combine/combination-engine.ts packages/engine/src/combine/discovery-state.ts packages/engine/src/index.ts packages/engine/tests/combination-engine.test.ts
git commit -m "feat(engine): add discovery-gated previewCombine

Adds CombinationEngine.previewCombine() that returns CombinePreview:
- known=false (gem=null) for never-attempted combos — player must
  discover the result organically by actually combining
- known=true (gem populated) for previously-attempted combos
Uses DiscoveryState.hasAttempted() for gating and .clone() for
side-effect-free computation."
```

---

## Chunk 2: Client — Between-round interstitial (Task 3)

### Task 3: Between-round interstitial screen

After each duel, before the next draft, show a brief transition screen with: round result (win/loss), life change, and a continue button. This replaces the jarring duel→draft jump.

**Approach:** Add a new `RunRoundInterstitial` component. The Duel page's "NEXT ROUND" button currently dispatches `duel_continue` immediately. Instead, we'll show the interstitial first, and the interstitial's "Continue" button dispatches `duel_continue`.

The interstitial needs to know the duel outcome *before* `duel_continue` is dispatched (since `duel_continue` advances the round and changes lives). We derive this from `roundResults` (last entry's winner) and the current `runStore` state.

**Files:**
- Create: `packages/client/src/components/RunRoundInterstitial.tsx`
- Modify: `packages/client/src/pages/Duel.tsx:276-278,384-406` (show interstitial instead of inline continue button)

- [ ] **Step 1: Create `RunRoundInterstitial` component**

Create `packages/client/src/components/RunRoundInterstitial.tsx`:

**Important timing note:** The interstitial is shown BEFORE `duel_continue` is dispatched. The engine's `handleDuelContinue` is what actually updates `RunState` (lives, round, streak). So `useRunStore` would show PRE-update lives — e.g., if the player just lost and had 3 lives, the store still shows 3 (not 2). We compute the expected post-duel lives locally to show the correct value. Win-streak recovery is not reflected in this minimal version (that's Proposal A territory).

```tsx
import { useRunStore } from '@/stores/runStore';

interface RunRoundInterstitialProps {
  roundNumber: number;
  won: boolean;
  onContinue: () => void;
}

export function RunRoundInterstitial({ roundNumber, won, onContinue }: RunRoundInterstitialProps) {
  const storeLives = useRunStore((s) => s.lives);

  // Compute expected lives after this round's result is applied.
  // The engine hasn't processed duel_continue yet, so storeLives is stale.
  // On loss: lives - 1. On win: no change (streak recovery not shown here).
  const lives = won ? storeLives : Math.max(0, storeLives - 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(4px)',
        animation: 'fade-in 0.3s ease-out',
      }}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        {/* Round result */}
        <p
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'var(--text-sm)',
            letterSpacing: '0.08em',
            color: 'var(--color-surface-400)',
            textTransform: 'uppercase',
          }}
        >
          Round {roundNumber}
        </p>
        <h2
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'clamp(1.5rem, 6vw, 2.5rem)',
            fontWeight: 900,
            letterSpacing: '0.06em',
            color: won ? 'var(--color-success)' : 'var(--color-danger)',
            textShadow: won
              ? '0 0 24px rgba(74, 222, 128, 0.4)'
              : '0 0 24px rgba(248, 113, 113, 0.4)',
          }}
        >
          {won ? 'VICTORY' : 'DEFEAT'}
        </h2>

        {/* Lives display */}
        <div className="flex items-center gap-2">
          {Array.from({ length: Math.max(lives, 5) }, (_, i) => (
            <span
              key={i}
              style={{
                fontSize: 'var(--text-lg)',
                color: i < lives ? 'var(--color-danger)' : 'var(--color-surface-600)',
                textShadow: i < lives ? '0 0 8px var(--color-danger)' : undefined,
                transition: 'color 0.3s, text-shadow 0.3s',
              }}
            >
              {'\u2764'}
            </span>
          ))}
        </div>
        <p
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-surface-400)',
          }}
        >
          {won ? 'Onward!' : lives === 0 ? 'No lives remaining...' : `${lives} ${lives === 1 ? 'life' : 'lives'} remaining`}
        </p>

        {/* Continue button */}
        <button
          onClick={onContinue}
          className="mt-4 rounded-lg px-8 py-3 font-bold text-surface-900"
          style={{
            background: won
              ? 'linear-gradient(to bottom, var(--color-success), var(--color-success-dark, #16a34a))'
              : 'linear-gradient(to bottom, var(--color-accent-400), var(--color-accent-500))',
            fontFamily: 'var(--font-family-display)',
            letterSpacing: '0.04em',
            boxShadow: 'var(--shadow-button)',
          }}
        >
          {lives === 0 ? 'SEE RESULTS' : 'CONTINUE'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into Duel page**

In `packages/client/src/pages/Duel.tsx`:

Add import at the top:
```typescript
import { RunRoundInterstitial } from '@/components/RunRoundInterstitial';
```

Add state for showing interstitial (near line 119, with the other useState calls):
```typescript
const [showInterstitial, setShowInterstitial] = useState(false);
```

Reset `showInterstitial` when the combat log changes (new round or phase change), to avoid stale overlay state:
```typescript
useEffect(() => {
  setShowInterstitial(false);
}, [currentLog]);
```

Modify `handleContinue` (line ~276) to show interstitial in run mode instead of immediately dispatching:
```typescript
const handleContinue = () => {
  if (isRunMode) {
    setShowInterstitial(true);
  } else {
    gateway.dispatch({ kind: 'duel_continue' });
  }
};

const handleInterstitialContinue = () => {
  setShowInterstitial(false);
  setShowBreakdown(false);
  setShowCelebration(false);
  gateway.dispatch({ kind: 'duel_continue' });
};
```

Replace the "NEXT ROUND" / "CONTINUE" / "SEE RESULTS" button block (lines ~384-406) to add the interstitial overlay:
```tsx
{/* Between-round interstitial (run mode only) */}
{showInterstitial && currentResult && (
  <RunRoundInterstitial
    roundNumber={round}
    won={currentResult.winner === 0}
    onContinue={handleInterstitialContinue}
  />
)}
```

This goes inside the outermost `<div>` alongside the other overlays (celebration, disconnect). The existing button text and behavior remain for non-run modes.

- [ ] **Step 3: Test manually — start a run, win/lose a duel, verify interstitial appears**

Run the dev server: `cd packages/client && npx vite`

1. Navigate to /queue → Start Run → Tier 1
2. Complete draft, forge, watch duel
3. After duel playback, click "NEXT ROUND"
4. Verify: interstitial overlay appears with "Round 1 — VICTORY/DEFEAT", lives, "CONTINUE" button
5. Click "CONTINUE" → verify next draft loads

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/RunRoundInterstitial.tsx packages/client/src/pages/Duel.tsx
git commit -m "feat(client): add between-round interstitial in run mode

Shows round result (victory/defeat), current lives, and a continue
button between duel and next draft. Gives the player a moment to
process what happened before the next round begins."
```

---

## Chunk 3: Client — Combine preview + PostMatch enrichment (Tasks 4-5)

### Task 4: Wire discovery-gated combine preview into Forge UI + resize to standard gem size

Two changes in one task since they both touch `CombineWorkbench`:

1. **Discovery-gated preview:** Show the output gem only for previously-attempted combos. Unknown combos show "?" with glow hints.
2. **Standard gem sizing:** Upgrade all combine workbench slots and result box from `--socket-size` (40-72px) to `--gem-size` (90-130px) — the same size as gems in the draft grid and forge tray.

**Approach:** Pass the full `CombinePreview` (not just the gem) from Forge → CombineWorkbench. The UI checks `preview.known` to decide what to render. Slot and result box sizing changes from `--socket-size` / `--gem-size-sm` to `--gem-size` / `--gem-radius` throughout the component.

**Files:**
- Modify: `packages/client/src/components/CombineWorkbench.tsx` (accept `preview` prop, update `ResultBox` + `Slot` sizing)
- Modify: `packages/client/src/pages/Forge.tsx` (compute preview, pass to CombineWorkbench)

- [ ] **Step 1: Update CombineWorkbench — sizing + preview prop**

In `packages/client/src/components/CombineWorkbench.tsx`:

Add import for `CombinePreview`:
```typescript
import type { DataRegistry, GemInstance, CombinePreview } from '@alloy/engine';
```

Update `CombineWorkbenchProps` — replace `previewGem` with the richer `preview`:
```typescript
interface CombineWorkbenchProps {
  comboSlots: [GemInstance | null, GemInstance | null, GemInstance | null];
  registry: DataRegistry;
  canAfford: boolean;
  isDragging?: boolean;
  preview?: CombinePreview | null;
  onSlotClick: (index: number) => void;
  onCombine: () => void;
  onClearAll: () => void;
}
```

Update `ResultBox` rendering call to pass the preview:
```tsx
<ResultBox glowSignal={glowSignal} preview={preview ?? null} registry={registry} />
```

**Sizing changes in `Slot` component:**
Replace all occurrences of `--socket-size` / `--socket-radius` with `--gem-size` / `--gem-radius` in the `Slot` component. Specifically:

Empty slot:
```tsx
// BEFORE:
width: 'var(--gem-size-sm)',
height: 'var(--gem-size-sm)',
borderRadius: 'var(--gem-radius-sm)',
// AFTER:
width: 'var(--gem-size)',
height: 'var(--gem-size)',
borderRadius: 'var(--gem-radius)',
```

Filled slot:
```tsx
// BEFORE:
width: 'var(--socket-size)',
height: 'var(--socket-size)',
borderRadius: 'var(--socket-radius)',
// AFTER:
width: 'var(--gem-size)',
height: 'var(--gem-size)',
borderRadius: 'var(--gem-radius)',
```

And the gem art image inside filled slot:
```tsx
// BEFORE:
style={{ width: 'var(--gem-size-sm)', height: 'var(--gem-size-sm)', ... }}
// AFTER: (use a percentage of gem-size so it scales)
style={{ width: '70%', height: '70%', ... }}
```

**Update `ResultBox` — discovery-gated rendering + standard sizing:**
```tsx
function ResultBox({
  glowSignal,
  preview,
  registry,
}: {
  glowSignal: GlowSignal;
  preview: CombinePreview | null;
  registry: DataRegistry;
}) {
  const isGold = glowSignal === 'gold';
  const isWhite = glowSignal === 'white';
  const hasGlow = isGold || isWhite;

  const borderColor = isGold
    ? 'var(--color-compound)'
    : isWhite
      ? 'rgba(255,255,255,0.3)'
      : 'var(--color-surface-500)';

  const borderStyle = hasGlow ? 'solid' : 'dashed';

  const shadow = isGold
    ? '0 0 16px rgba(212,168,52,0.5)'
    : isWhite
      ? '0 0 12px rgba(255,255,255,0.3)'
      : 'none';

  // Known combo with gem preview — show full gem details
  if (preview?.known && preview.gem) {
    const affix = registry.findAffix(preview.gem.affixId);
    const element = affix?.tags.find((t: string) => ELEMENT_TAGS.has(t));
    const gradient = element ? ELEMENT_GRADIENTS[element] : null;
    const artUrl = getGemArt(preview.gem.affixId);

    return (
      <div
        className="flex flex-col items-center justify-center overflow-hidden"
        style={{
          width: 'var(--gem-size)',
          height: 'var(--gem-size)',
          borderRadius: 'var(--gem-radius)',
          border: `2px solid ${borderColor}`,
          background: gradient
            ? `linear-gradient(135deg, ${gradient.bg})`
            : 'var(--color-surface-800)',
          boxShadow: shadow,
          position: 'relative',
          animation: 'pulse-glow 1.5s ease-in-out infinite',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15), transparent 55%)',
            pointerEvents: 'none',
          }}
        />
        {artUrl ? (
          <img
            src={artUrl}
            alt={preview.gem.affixId}
            style={{ width: '70%', height: '70%', objectFit: 'contain', position: 'relative', zIndex: 1, opacity: 0.8 }}
          />
        ) : (
          <span style={{ fontSize: 'var(--icon-lg)', position: 'relative', zIndex: 1, opacity: 0.8 }}>
            {element ? ELEMENT_SYMBOLS[element] : '\u2726'}
          </span>
        )}
        <span
          style={{
            fontSize: 'calc(var(--gem-size) * 0.1)',
            fontFamily: 'var(--font-family-display)',
            fontWeight: 700,
            color: 'white',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            position: 'relative',
            zIndex: 1,
          }}
        >
          T{preview.gem.tier} {preview.gem.rarity.slice(0, 3)}
        </span>
      </div>
    );
  }

  // Unknown combo or no preview — show mystery "?" with glow hints
  const symbol = isGold ? '\u2726' : '?';
  const symbolColor = isGold
    ? 'var(--color-compound)'
    : isWhite
      ? 'rgba(255,255,255,0.8)'
      : 'var(--color-surface-300)';

  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: 'var(--gem-size)',
        height: 'var(--gem-size)',
        borderRadius: 'var(--gem-radius)',
        border: `2px ${borderStyle} ${borderColor}`,
        background: 'var(--color-surface-800)',
        boxShadow: shadow,
        fontSize: 'var(--icon-lg)',
        color: symbolColor,
        animation: isGold ? 'pulse-glow 1.5s ease-in-out infinite' : undefined,
      }}
      aria-live="polite"
      aria-label={
        preview && !preview.known
          ? 'Undiscovered combination'
          : isGold
            ? 'Unique compound available'
            : isWhite
              ? 'Basic combination available'
              : 'No combination'
      }
    >
      {symbol}
    </div>
  );
}
```

Note: `ELEMENT_TAGS`, `ELEMENT_SYMBOLS`, `ELEMENT_GRADIENTS`, and `getGemArt` are already imported/defined in this file.

- [ ] **Step 2: Compute preview in Forge page and pass to CombineWorkbench**

In `packages/client/src/pages/Forge.tsx`:

Add imports:
```typescript
import { CombinationEngine, DiscoveryState } from '@alloy/engine';
import type { CombinePreview } from '@alloy/engine';
```

Add two `useMemo` hooks (near the other derived values, after `statsResult`). The first memoizes the `categoryMap` since it's expensive to rebuild on every combo slot change. The second computes the discovery-gated preview:

```typescript
// Memoize categoryMap — only changes if registry changes (never during a match)
const categoryMap = useMemo(() => {
  const map: Record<string, string> = {};
  for (const affix of registry.getAllAffixes()) {
    map[affix.id] = affix.category;
  }
  return map;
}, [registry]);

const combinePreview: CombinePreview | null = useMemo(() => {
  const filled = comboSlots.filter((s): s is GemInstance => s !== null);
  if (filled.length < 2) return null;

  try {
    const recipeRegistry = registry.getRecipeRegistry();
    const discovery = matchState?.discoveryState ?? new DiscoveryState();
    const engine = new CombinationEngine(recipeRegistry, discovery, categoryMap, {
      matchingRarityBonus: registry.getBalance().gem.matchingRarityBonus,
    });
    return engine.previewCombine(filled[0], filled[1]);
  } catch {
    return null;
  }
}, [comboSlots, registry, categoryMap, matchState?.discoveryState]);
```

Pass to `CombineWorkbench`:
```tsx
<CombineWorkbench
  comboSlots={comboSlots}
  registry={registry}
  canAfford={true}
  preview={combinePreview}
  onSlotClick={handleComboSlotClick}
  onCombine={handleCombine}
  onClearAll={() => { clearComboSlots(); playSound('buttonClick'); }}
/>
```

- [ ] **Step 3: Test manually — verify discovery gating and gem sizing**

1. Start a run, complete draft, enter forge
2. **Sizing check:** Verify combine slot circles are now the same size as gems in the tray below (standard `--gem-size`, not tiny socket size)
3. **Unknown combo:** Drag two never-combined gems into slots. Result box should show "?" (gold shimmer if it's a signature recipe match, white for generic). No gem art revealed.
4. **Combine:** Click COMBINE. The gems merge — you now know this combo.
5. **Known combo:** Get or create two more gems of the same affix types. Drag into slots. Result box should now show the full preview: gem art, tier + rarity label.
6. **Non-run mode:** Verify standard (ranked/quick) matches still work — no crashes from missing discoveryState.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/CombineWorkbench.tsx packages/client/src/pages/Forge.tsx
git commit -m "feat(client): discovery-gated combine preview + standard gem sizing

Combine workbench now uses standard --gem-size for all slots (matching
the draft grid and forge tray) instead of the smaller --socket-size.

Preview shows full gem output only for previously-attempted combos.
Unknown combos show '?' with glow hints (gold for signature recipes,
white for generic). Players must actually combine to discover results,
building out their gem knowledge organically."
```

---

### Task 5: Enrich PostMatch with run summary stats

Add run-specific stats to the PostMatch screen: total rounds, win/loss record, flux earned, and recipe discovery count.

**Approach:** The `MatchState` already has `runState` (with totalWins, totalLosses, flux) and `discoveryState` (with totalDiscoveryCount). We just need to read them.

**Files:**
- Modify: `packages/client/src/pages/PostMatch.tsx` (add RunSummary section)

- [ ] **Step 1: Add `RunSummary` component to PostMatch**

In `packages/client/src/pages/PostMatch.tsx`, add a new component and wire it in:

Add import for matchStore state access:
```typescript
import { useMatchStore } from '@/stores/matchStore';
```
(Already imported.)

Add the `RunSummary` component after `MatchStatistics`:

```tsx
function RunSummary({ matchState }: { matchState: MatchState }) {
  const runState = matchState.runState;
  const discoveryState = matchState.discoveryState;
  if (!runState) return null;

  const roundsCompleted = runState.totalWins + runState.totalLosses;

  const stats = [
    { label: 'Rounds Completed', value: roundsCompleted },
    { label: 'Wins', value: runState.totalWins },
    { label: 'Losses', value: runState.totalLosses },
    { label: 'Flux Earned', value: runState.flux },
    { label: 'Recipes Found', value: discoveryState?.totalDiscoveryCount() ?? 0 },
  ];

  return (
    <div
      className="w-full max-w-md rounded-lg border border-surface-600 bg-surface-800 p-4"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <h3
        className="mb-3 text-sm font-bold uppercase text-surface-400"
        style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em' }}
      >
        Run Summary
      </h3>
      <div className="space-y-1.5">
        {stats.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between text-xs">
            <span
              className="text-surface-400"
              style={{ fontFamily: 'var(--font-family-display)', fontSize: '0.65rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}
            >
              {label}
            </span>
            <span className="stat-number text-white">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Add the import for `MatchState` type at the top of the file:
```typescript
import type { CombatLog, MatchState } from '@alloy/engine';
```

Wire it into the `PostMatch` render, right before the `MatchStatistics` section:
```tsx
{/* Run summary (run mode only) */}
{isRunMode && matchState && <RunSummary matchState={matchState} />}

{/* Match statistics */}
{duelLogs.length > 0 && <MatchStatistics duelLogs={duelLogs} />}
```

The `matchState` is already available via `gateway.getState()`.

- [ ] **Step 2: Test manually — complete a run, verify summary appears on PostMatch**

1. Start a run with Tier 1 AI
2. Play through several rounds (win and lose some)
3. When the run ends (either by reaching round 10 or losing all lives), check the PostMatch screen
4. Verify: "Run Summary" card appears with rounds played, wins, losses, flux, recipes found
5. Values should be non-zero and match the run you just played

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/PostMatch.tsx
git commit -m "feat(client): add run summary stats to PostMatch screen

Shows total rounds, wins, losses, flux earned, and recipes discovered
at the end of a run. Uses the engine's RunState and DiscoveryState
directly from the match state."
```

---

## Dependency Graph

```
Task 1 (pool scaling fix)     ──── independent
Task 2 (previewCombine)       ──── independent
Task 3 (interstitial)         ──── independent
Task 4 (combine preview UI)   ──── depends on Task 2
Task 5 (PostMatch enrichment) ──── independent
```

Tasks 1, 2, 3, and 5 can all be done in parallel. Task 4 requires Task 2 to be complete first.
