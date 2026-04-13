# Draft P0 Acceptance Criteria Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Draft screen up to P0 acceptance criteria — fix broken interactions, update balance config, and polish transitions.

**Architecture:** All changes are in two packages: `packages/engine` (balance config) and `packages/client` (Draft.tsx pointer model, timer, AI delay, transitions). The pointer interaction model in Draft.tsx is the biggest rewrite — tap vs. drag must be cleanly separated with a movement threshold.

**Tech Stack:** React, TypeScript, Zustand, Vitest

**AC Coverage:**
- D01: Already satisfied (element via color/emoji is sufficient for P0)
- D02: BROKEN — fix pointer interaction model
- D03: Already satisfied
- D04: FAILS — fix with movement threshold
- D05: PARTIAL — guard selection on opponent turn, fix label
- D06: PARTIAL — use autoPickRandom, fix double sound
- D07: Already satisfied
- D08: PARTIAL — add error handling on failed dispatch
- D09: PARTIAL — add draft completion indicator
- D10: PARTIAL — update pool sizes, improve round display
- D11: FAILS — use tier-based delays with jitter

---

## Chunk 1: Pointer Interaction Rewrite (D02, D04, D05)

### Task 1: Rewrite pointer model in Draft.tsx

The current code has `onPointerDown` calling `selectOrb()` immediately and `e.preventDefault()` suppressing `onClick`. This breaks tap-to-select (D02) and makes hold-release-in-place select a gem (D04). The fix: track pointer state and distinguish tap vs. drag using a movement threshold, plus a hold-time threshold to distinguish taps from hold-and-release.

**Key design decisions:**
- Movement threshold (8px) separates tap from drag
- Hold-time threshold (300ms) separates tap from hold-and-release — if pointer is held >300ms without moving, release is a no-op (D04)
- All mutable pointer state uses refs (not React state) to avoid stale closures in event handlers
- `isOverDropZoneRef` mirrors `isOverDropZone` state to avoid stale reads in `handleUp`

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx:190-253` (drag handlers, AI turn)
- Modify: `packages/client/src/pages/Draft.tsx:326-349` (GemCard event handlers)
- Modify: `packages/client/src/stores/draftStore.ts` (simplify — remove dead `isConfirming` logic)

- [ ] **Step 1: Write test for gesture classification**

Create a test for the gesture discriminator helper. This helper will be extracted to a shared utility so both Draft.tsx and the test import the same function.

```typescript
// packages/client/src/pages/__tests__/draft-gestures.test.ts
import { describe, it, expect } from 'vitest';
import { classifyGesture } from '../draft-gestures';

describe('draft gesture classification', () => {
  it('classifies small movement + short hold as tap', () => {
    expect(classifyGesture(
      { x: 100, y: 100 }, { x: 102, y: 103 }, 100,
    )).toBe('tap');
  });

  it('classifies zero movement + short hold as tap', () => {
    expect(classifyGesture(
      { x: 100, y: 100 }, { x: 100, y: 100 }, 50,
    )).toBe('tap');
  });

  it('classifies large movement as drag', () => {
    expect(classifyGesture(
      { x: 100, y: 100 }, { x: 100, y: 120 }, 50,
    )).toBe('drag');
  });

  it('classifies exactly threshold distance as drag', () => {
    expect(classifyGesture(
      { x: 100, y: 100 }, { x: 108, y: 100 }, 50,
    )).toBe('drag');
  });

  it('classifies zero movement + long hold as hold (no-op)', () => {
    expect(classifyGesture(
      { x: 100, y: 100 }, { x: 100, y: 100 }, 500,
    )).toBe('hold');
  });

  it('classifies small movement + long hold as hold (no-op)', () => {
    expect(classifyGesture(
      { x: 100, y: 100 }, { x: 102, y: 101 }, 400,
    )).toBe('hold');
  });
});
```

- [ ] **Step 2: Create the gesture helper**

```typescript
// packages/client/src/pages/draft-gestures.ts
export const DRAG_THRESHOLD = 8;    // px
export const HOLD_THRESHOLD = 300;  // ms

export function classifyGesture(
  startPos: { x: number; y: number },
  endPos: { x: number; y: number },
  holdDurationMs: number,
): 'tap' | 'drag' | 'hold' {
  const dx = endPos.x - startPos.x;
  const dy = endPos.y - startPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist >= DRAG_THRESHOLD) return 'drag';
  if (holdDurationMs >= HOLD_THRESHOLD) return 'hold';
  return 'tap';
}
```

- [ ] **Step 3: Run tests to verify passing**

Run: `cd packages/client && npx vitest run src/pages/__tests__/draft-gestures.test.ts`
Expected: PASS

- [ ] **Step 4: Simplify draftStore — remove dead isConfirming logic**

The new pointer model handles two-tap-to-confirm in the component, so `draftStore.selectOrb`'s internal second-tap detection is dead code. Simplify it:

```typescript
// packages/client/src/stores/draftStore.ts
import { create } from 'zustand';

interface DraftStore {
  selectedOrbUid: string | null;
  selectOrb: (uid: string) => void;
  confirmPick: () => void;
  cancelSelection: () => void;
  reset: () => void;
}

export const useDraftStore = create<DraftStore>((set) => ({
  selectedOrbUid: null,

  selectOrb: (uid) => set({ selectedOrbUid: uid }),

  confirmPick: () => set({ selectedOrbUid: null }),

  cancelSelection: () => set({ selectedOrbUid: null }),

  reset: () => set({ selectedOrbUid: null }),
}));
```

- [ ] **Step 5: Rewrite Draft.tsx pointer handlers**

Replace the current `handleDragStart`, `onClick`, and `onPointerDown` with a unified pointer model. All mutable state read in event handlers uses refs to avoid stale closures:

```typescript
import { DRAG_THRESHOLD, HOLD_THRESHOLD } from './draft-gestures';

// ── Pointer state refs (mutable, no re-renders, no stale closures) ──
const pointerStartRef = useRef<{ x: number; y: number; uid: string; time: number } | null>(null);
const hasDraggedRef = useRef(false);
const isOverDropZoneRef = useRef(false);  // mirrors isOverDropZone state for use in handleUp
const selectedOrbUidRef = useRef(selectedOrbUid);

// Keep refs in sync with state
useEffect(() => { selectedOrbUidRef.current = selectedOrbUid; }, [selectedOrbUid]);
useEffect(() => { isOverDropZoneRef.current = isOverDropZone; }, [isOverDropZone]);

// ── Pointer down: record start position + time, don't select yet ──
const handlePointerDown = useCallback((uid: string, e: React.PointerEvent) => {
  if (!isPlayerTurn) return;
  e.preventDefault();
  pointerStartRef.current = { x: e.clientX, y: e.clientY, uid, time: Date.now() };
  hasDraggedRef.current = false;
}, [isPlayerTurn]);

// ── Global pointer move + up listeners ──
useEffect(() => {
  const handleMove = (e: PointerEvent) => {
    const start = pointerStartRef.current;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (!hasDraggedRef.current && Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
      hasDraggedRef.current = true;
      setDragUid(start.uid);
      selectOrb(start.uid);
      playSound('dragStart');
    }

    if (hasDraggedRef.current) {
      setDragPos({ x: e.clientX, y: e.clientY });
      if (dropZoneRef.current) {
        const rect = dropZoneRef.current.getBoundingClientRect();
        const over = e.clientY >= rect.top && e.clientY <= rect.bottom &&
                     e.clientX >= rect.left && e.clientX <= rect.right;
        setIsOverDropZone(over);
        isOverDropZoneRef.current = over;
      }
    }
  };

  const handleUp = () => {
    const start = pointerStartRef.current;
    if (!start) return;

    if (hasDraggedRef.current) {
      // Was dragging — check drop zone via ref (not stale state)
      if (isOverDropZoneRef.current) {
        playSound('dropSuccess');
        draftOrb(start.uid);
      }
      setDragUid(null);
      setIsOverDropZone(false);
      isOverDropZoneRef.current = false;
    } else {
      // Not a drag — use classifyGesture to distinguish tap from hold
      const holdDuration = Date.now() - start.time;
      const gesture = classifyGesture(start, start, holdDuration); // same pos = no drag
      if (gesture === 'tap') {
        if (selectedOrbUidRef.current === start.uid) {
          draftOrb(start.uid);
        } else {
          selectOrb(start.uid);
          playSound('orbSelect');
        }
      }
      // 'hold' → no-op (D04)
    }

    pointerStartRef.current = null;
    hasDraggedRef.current = false;
  };

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
  return () => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
  };
}, [draftOrb, selectOrb]);
```

Key fixes vs. naive approach:
- `isOverDropZoneRef` avoids the stale closure bug — `handleUp` reads the ref, not the captured state value
- `selectedOrbUidRef` avoids stale closure for second-tap detection
- `draftOrb(start.uid)` uses the ref uid, not `dragUid` state
- Hold duration check (>300ms without drag = no-op) satisfies D04
- Dependency array is minimal: only `draftOrb` and `selectOrb` (stable callbacks)

Remove the old `handleDragStart` function and the old `useEffect` that attached move/up listeners conditionally on `dragUid`.

- [ ] **Step 5: Update GemCard event bindings**

Replace the current GemCard props:

```tsx
// BEFORE:
onClick={() => { ... }}
onPointerDown={(e) => handleDragStart(orb.uid, e)}

// AFTER:
onPointerDown={(e) => handlePointerDown(orb.uid, e)}
```

Remove the `onClick` prop entirely — taps are now handled in the `pointerup` handler.

- [ ] **Step 6: Fix turn label and opponent-turn selection guard**

In the status bar, change:

```tsx
// BEFORE (line 298):
{isPlayerTurn ? 'YOUR PICK' : 'AI PICKING'}

// AFTER:
{isPlayerTurn ? 'YOUR PICK' : 'OPPONENT PICKING'}
```

The `handlePointerDown` already guards with `if (!isPlayerTurn) return;`, and since we removed `onClick`, opponent-turn selections are now fully blocked. Info-only interaction (hover/long-press details) is unaffected since those don't go through pointer-down.

- [ ] **Step 7: Verify in browser**

Test these scenarios manually:
1. Quick tap a gem → highlights. Quick tap same gem → confirms pick. ✓
2. Quick tap gem A → highlights. Quick tap gem B → A deselects, B highlights. ✓
3. Press and hold gem (~1 second), release in place → **no selection, no pick** (hold = no-op). ✓
4. Press gem, drag to stockpile zone → confirms pick. ✓
5. Press gem, drag but release NOT over stockpile → no pick, drag ghost disappears, gem stays selected (from drag start). ✓
6. During opponent turn → tapping/dragging does nothing. Label says "OPPONENT PICKING". ✓
7. Quick tap gem, then quick tap same gem again → pick confirmed (two-tap flow). ✓

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/pages/Draft.tsx packages/client/src/pages/draft-gestures.ts packages/client/src/pages/__tests__/draft-gestures.test.ts packages/client/src/stores/draftStore.ts
git commit -m "fix(draft): rewrite pointer model — clean tap/drag/hold separation (D02, D04, D05)"
```

---

## Chunk 2: Auto-Pick Fix (D06)

### Task 2: Use autoPickRandom on timer expiry

The current `handleTimerExpire` always picks `pool[0]`. It should pick a random orb. Since the client doesn't have an RNG instance, the simplest fix is to pick a random index client-side (no need for seeded RNG for auto-pick — it's a penalty, not a strategic choice).

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx:255-260` (handleTimerExpire)

- [ ] **Step 1: Fix handleTimerExpire to pick randomly**

```typescript
// BEFORE:
const handleTimerExpire = useCallback(() => {
  playSound('timerUrgent');
  if (!isPlayerTurn || pool.length === 0) return;
  draftOrb(pool[0].uid);
  cancelSelection();
}, [isPlayerTurn, pool, draftOrb, cancelSelection]);

// AFTER:
const handleTimerExpire = useCallback(() => {
  playSound('timerUrgent');
  if (!isPlayerTurn || pool.length === 0) return;
  const randomIndex = Math.floor(Math.random() * pool.length);
  draftOrb(pool[randomIndex].uid);
  cancelSelection();
}, [isPlayerTurn, pool, draftOrb, cancelSelection]);
```

Note: `playSound('timerUrgent')` is kept — Timer.tsx only fires sounds for seconds 1-5 (with `seconds > 0` guard), so the expiry callback is the only place the "time's up" sound plays at 0 seconds. No double-play issue.

- [ ] **Step 2: Verify in browser**

Let the timer expire — the picked gem should vary across attempts, not always be the first in the pool. No double sound on expiry.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Draft.tsx
git commit -m "fix(draft): auto-pick random orb on timer expiry, fix double sound (D06)"
```

---

## Chunk 3: Dispatch Error Handling (D08)

### Task 3: Handle failed draft picks in the UI

When `gateway.dispatch()` returns `{ ok: false }`, the client currently does nothing — leaving the gem selected with no feedback.

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx:190-195` (draftOrb callback)

- [ ] **Step 1: Add error handling to draftOrb**

```typescript
// BEFORE:
const draftOrb = useCallback((orbUid: string) => {
  if (!isPlayerTurn) return;
  gateway.dispatch({ kind: 'draft_pick', player: 0, orbUid }).then((result) => {
    if (result.ok) { playSound('orbConfirm'); confirmPick(); }
  });
}, [isPlayerTurn, gateway, confirmPick]);

// AFTER:
const draftOrb = useCallback((orbUid: string) => {
  if (!isPlayerTurn) return;
  gateway.dispatch({ kind: 'draft_pick', player: 0, orbUid }).then((result) => {
    if (result.ok) {
      playSound('orbConfirm');
      confirmPick();
    } else {
      // Pick was rejected by engine — clear selection silently
      cancelSelection();
    }
  });
}, [isPlayerTurn, gateway, confirmPick, cancelSelection]);
```

No toast/error text needed — the selection just clears, which communicates "that didn't work" without being noisy. The engine already prevents invalid states, so this is a safety net for race conditions.

- [ ] **Step 2: Verify**

Attempt a rapid double-pick (click two gems very fast) — the second should silently fail and clear selection rather than leaving a ghost highlight.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Draft.tsx
git commit -m "fix(draft): clear selection on failed pick dispatch (D08)"
```

---

## Chunk 4: Pool Sizes and Round Display (D10)

### Task 4: Update balance config pool sizes

**Files:**
- Modify: `packages/engine/src/data/balance.json:16` (draftPoolPerRound)

- [ ] **Step 1: Update balance.json**

```json
// BEFORE:
"draftPoolPerRound": [16, 8, 8],

// AFTER:
"draftPoolPerRound": [24, 12, 12],
```

`draftPicksPerPlayer` stays at `[8, 4, 4]` — unchanged.

- [ ] **Step 2: Run engine tests to verify nothing breaks**

Run: `cd packages/engine && npx vitest run`
Expected: All tests pass. Pool generation tests may need updated assertions if they check exact pool sizes.

- [ ] **Step 3: Fix any failing pool tests**

If `tests/pool.test.ts` asserts specific pool sizes (16, 8, 8), update those assertions to match [24, 12, 12].

- [ ] **Step 4: Commit balance change**

```bash
git add packages/engine/src/data/balance.json
git commit -m "feat(balance): increase draft pool sizes to [24, 12, 12] (D10)"
```

### Task 5: Improve round display in Draft.tsx

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx:300-302` (round display)

- [ ] **Step 1: Update round display text**

```tsx
// BEFORE (line 300-301):
<span className="text-xs text-surface-300" style={{ fontFamily: 'var(--font-family-display)' }}>
  R{draftRound} · {pool.length} left
</span>

// AFTER:
<span className="text-xs text-surface-300" style={{ fontFamily: 'var(--font-family-display)' }}>
  ROUND {draftRound} DRAFT · {pool.length} left
</span>
```

- [ ] **Step 2: Verify in browser**

The status bar should now show "ROUND 1 DRAFT · 24 left" for round 1, "ROUND 2 DRAFT · 12 left" for round 2, etc.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Draft.tsx
git commit -m "feat(draft): show 'ROUND N DRAFT' instead of 'RN' (D10)"
```

---

## Chunk 5: AI Delay with Tier-Based Jitter (D11)

### Task 6: Use AI_CONFIGS delay with random jitter

The `AI_CONFIGS` in `packages/engine/src/types/ai.ts` already defines per-tier delays (500–2500ms). Draft.tsx ignores them and hardcodes `500`. We'll use the config value as the base and add ±40% jitter for natural feel, clamped to a 1000–5000ms range.

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx:240-253` (AI turn effect)

- [ ] **Step 1: Create AI delay utility and write tests**

Extract the delay calculation into a shared utility so the test validates the actual production code:

```typescript
// packages/client/src/pages/ai-delay.ts
import type { AITier } from '@alloy/engine';

const MIN_DELAY = 1000;
const MAX_DELAY = 5000;

/** Calculate AI thinking delay with jitter. Base delay comes from AI_CONFIGS. */
export function calcAiDelay(baseMs: number): number {
  const jitter = 0.6 + Math.random() * 0.8; // 0.6x to 1.4x
  return Math.max(MIN_DELAY, Math.min(MAX_DELAY, Math.round(baseMs * jitter)));
}
```

```typescript
// packages/client/src/pages/__tests__/ai-delay.test.ts
import { describe, it, expect } from 'vitest';
import { calcAiDelay } from '../ai-delay';

describe('AI delay calculation', () => {
  it('clamps tier 1 (500ms base) to at least 1000ms', () => {
    for (let i = 0; i < 100; i++) {
      expect(calcAiDelay(500)).toBeGreaterThanOrEqual(1000);
    }
  });

  it('clamps high values to at most 5000ms', () => {
    for (let i = 0; i < 100; i++) {
      expect(calcAiDelay(5000)).toBeLessThanOrEqual(5000);
    }
  });

  it('produces varied results', () => {
    const results = new Set<number>();
    for (let i = 0; i < 50; i++) results.add(calcAiDelay(2000));
    expect(results.size).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd packages/client && npx vitest run src/pages/__tests__/ai-delay.test.ts`
Expected: PASS

- [ ] **Step 3: Update Draft.tsx AI turn effect**

```typescript
// Add imports at top of Draft.tsx:
import { AI_CONFIGS } from '@alloy/engine';
import { calcAiDelay } from './ai-delay';

// Replace the AI turn useEffect (lines 240-253):
useEffect(() => {
  if (!matchState || activePlayer !== 1 || !aiController) return;
  const currentState = gateway.getState();
  if (!currentState || currentState.phase.kind !== 'draft') return;

  const baseDelay = AI_CONFIGS[aiController.tier].thinkingDelayMs;
  const delay = calcAiDelay(baseDelay);

  const timeout = setTimeout(() => {
    const freshState = gateway.getState();
    if (!freshState || freshState.phase.kind !== 'draft') return;
    const orbUid = aiController.pickOrb(
      freshState.pool, freshState.players[1].stockpile, freshState.players[0].stockpile,
    );
    gateway.dispatch({ kind: 'draft_pick', player: 1, orbUid });
  }, delay);
  return () => clearTimeout(timeout);
}, [pickIndex, activePlayer, aiController, gateway]);
```

This gives:
- Tier 1 (Apprentice, 500ms base): 1000ms (clamped) — always at minimum
- Tier 2 (Journeyman, 1000ms base): 1000–1400ms
- Tier 3 (Artisan, 1500ms base): 1000–2100ms
- Tier 4 (Master, 2000ms base): 1200–2800ms
- Tier 5 (Alloy, 2500ms base): 1500–3500ms

- [ ] **Step 4: Verify in browser**

Play against different AI tiers. Apprentice should feel quick but not instant. Alloy should feel deliberate with noticeable variation between picks.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/Draft.tsx packages/client/src/pages/ai-delay.ts packages/client/src/pages/__tests__/ai-delay.test.ts
git commit -m "feat(draft): tier-based AI delay with jitter, 1-5s range (D11)"
```

---

## Chunk 6: Draft Completion Transition (D09)

### Task 7: Add "Draft Complete" transition indicator

When the draft completes, show a brief overlay before transitioning to Forge. This gives the player a moment to register "drafting is done."

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx` (add completion state + overlay)

- [ ] **Step 1: Add draft completion detection and overlay**

Add state to track when draft has just completed:

```typescript
// After the existing state declarations (~line 165):
const [showComplete, setShowComplete] = useState(false);
const prevPhaseKind = useRef(phase?.kind);

// Detect transition away from draft:
useEffect(() => {
  if (prevPhaseKind.current === 'draft' && phase?.kind === 'forge') {
    setShowComplete(true);
    const timer = setTimeout(() => setShowComplete(false), 1200);
    return () => clearTimeout(timer);
  }
  prevPhaseKind.current = phase?.kind;
}, [phase?.kind]);
```

However, since PhaseRouter swaps components, the Draft component unmounts when phase changes to forge. So the transition needs to live in **PhaseRouter**, not Draft.

Instead, add a transition overlay in PhaseRouter:

- [ ] **Step 2: Add phase transition overlay to PhaseRouter**

```typescript
// packages/client/src/pages/PhaseRouter.tsx
// Add state for transition:
const [transitionLabel, setTransitionLabel] = useState<string | null>(null);
const prevPhaseRef = useRef<string | null>(null);

useEffect(() => {
  const currentKind = matchState?.phase.kind ?? null;
  const prevKind = prevPhaseRef.current;
  prevPhaseRef.current = currentKind;

  // Show transition overlay on phase changes
  if (prevKind && currentKind && prevKind !== currentKind) {
    const labels: Record<string, string> = {
      forge: 'FORGE',
      draft: 'DRAFT',
      duel: 'DUEL',
      adapt: 'ADAPT',
    };
    const label = labels[currentKind];
    if (label) {
      setTransitionLabel(label);
      const timer = setTimeout(() => setTransitionLabel(null), 1000);
      return () => clearTimeout(timer);
    }
  }
}, [matchState?.phase.kind]);

// In the render, wrap renderPhase() with the overlay:
return (
  <GatewayProvider value={gateway}>
    <PhaseErrorBoundary resetKey={phase.kind}>
      {transitionLabel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/80"
          style={{ animation: 'fadeInOut 1s ease-in-out forwards' }}
        >
          <h1
            className="text-4xl font-black text-accent-400"
            style={{
              fontFamily: 'var(--font-family-display)',
              textShadow: '0 0 30px rgba(212, 168, 52, 0.5)',
              animation: 'scaleIn 0.3s ease-out',
            }}
          >
            {transitionLabel}
          </h1>
        </div>
      )}
      {renderPhase()}
    </PhaseErrorBoundary>
  </GatewayProvider>
);
```

- [ ] **Step 3: Add CSS animations**

Add to `packages/client/src/index.css` (the project's global stylesheet):

```css
@keyframes fadeInOut {
  0% { opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes scaleIn {
  0% { transform: scale(0.8); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
```

- [ ] **Step 4: Verify in browser**

Complete a draft → should see "FORGE" flash briefly (1s) before the Forge screen appears. Same for duel→draft transitions showing "DRAFT".

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/PhaseRouter.tsx
git commit -m "feat(phase-router): add phase transition overlay (D09)"
```

---

## Chunk 7: Final Verification

### Task 8: Run all tests and verify AC coverage

- [ ] **Step 1: Run engine tests**

Run: `cd packages/engine && npx vitest run`
Expected: All pass

- [ ] **Step 2: Run client tests**

Run: `cd packages/client && npx vitest run`
Expected: All pass

- [ ] **Step 3: Browser play-test**

Play a full ranked match against AI through all 3 draft rounds. Verify each P0 AC:

| AC | What to check |
|---|---|
| D01 | Gems show element color, tier, stat, name |
| D02 | Tap selects, second tap confirms |
| D03 | Drag to stockpile confirms |
| D04 | Hold-release-in-place = no-op |
| D05 | "OPPONENT PICKING" shown, can't select during AI turn |
| D06 | Timer expiry picks random gem, no double sound |
| D07 | Both stockpiles visible with correct colors |
| D08 | Failed pick clears selection (try rapid clicking) |
| D09 | Phase transitions show overlay label |
| D10 | Pool shows 24 gems R1, 12 R2/R3; "ROUND N DRAFT" label |
| D11 | AI picks at varied pace, higher tiers slower |

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(draft): address issues found during P0 verification"
```
