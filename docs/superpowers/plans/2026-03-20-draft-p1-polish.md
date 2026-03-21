# Draft P1 Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Draft screen up to P1 acceptance criteria — gem detail tooltips, archetype grouping, opponent pick animation, pool entrance animation, sound polish, responsive layout, and disconnect UX.

**Architecture:** All changes are in `packages/client`. Tasks are independent — they touch different components and can be implemented in any order. Each task is a self-contained improvement.

**Tech Stack:** React, TypeScript, CSS animations, Howler.js (sound)

**Spec:** `docs/superpowers/specs/2026-03-20-draft-screen-acceptance-criteria.md` (P1 section)

---

## Chunk 1: Gem Detail Tooltip (D12)

### Task 1: Add gem detail tooltip on hover/long-press

When hovering or long-pressing a gem in the pool, show a detail panel with the full affix description, tags as pills, and category. The existing `Tooltip` component renders above the target — we need a richer content panel.

**Key constraint:** Long-press (>300ms hold without drag) is currently a no-op per D04. For D12, long-press should open the detail panel instead. This applies to BOTH player's turn and opponent's turn (the pool is "informationally interactive" during opponent's turn per D05).

**Files:**
- Create: `packages/client/src/components/GemDetailPanel.tsx`
- Modify: `packages/client/src/components/GemCard.tsx` (add description prop, wire tooltip)
- Modify: `packages/client/src/pages/Draft.tsx` (pass description, handle long-press → detail)

- [ ] **Step 1: Create GemDetailPanel component**

```tsx
// packages/client/src/components/GemDetailPanel.tsx
interface GemDetailPanelProps {
  affixName: string;
  description: string;
  category: string;
  tags: string[];
  statLabel: string;
  tier: number;
}

export function GemDetailPanel({ affixName, description, category, tags, statLabel, tier }: GemDetailPanelProps) {
  return (
    <div className="flex flex-col gap-1.5 max-w-[220px]">
      <div className="flex items-center justify-between">
        <span className="font-bold text-white text-sm" style={{ fontFamily: 'var(--font-family-display)' }}>
          {affixName}
        </span>
        <span className="text-xs font-bold text-accent-300">{statLabel}</span>
      </div>
      <p className="text-xs text-surface-300 leading-snug">{description}</p>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-surface-600 px-2 py-0.5 text-[10px] font-semibold text-surface-200"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-surface-400">
        <span>{category}</span>
        <span>Tier {tier}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `description` field to AffixDef and all 33 affixes**

The engine `AffixDef` type (`packages/engine/src/types/affix.ts`) has no `description` field. Add one:

```typescript
export interface AffixDef {
  id: string;
  name: string;
  description: string; // NEW — e.g., "Adds flat physical damage to weapon attacks"
  category: AffixCategory;
  tags: AffixTag[];
  tiers: Record<AffixTier, AffixTierData>;
}
```

Then add a `description` string to each of the 33 entries in `packages/engine/src/data/affixes.json`. Generate descriptions from the affix name + category + effects. Example:

```json
{
  "id": "flat_physical",
  "name": "Flat Physical Damage",
  "description": "Adds raw physical damage to weapon; reinforces armor on defense.",
  ...
}
```

Run `cd packages/engine && pnpm build` to verify the type change compiles.

- [ ] **Step 3: Fix Tooltip whitespace-nowrap for rich content**

The existing `Tooltip` component (`packages/client/src/components/Tooltip.tsx` line 32) has `whitespace-nowrap` which will clip the multi-line GemDetailPanel. Remove it and add `whitespace-normal` instead:

```tsx
// BEFORE:
className="... whitespace-nowrap ..."

// AFTER:
className="... whitespace-normal ..."
```

- [ ] **Step 4: Add description prop to GemCard and wire Tooltip**

In `GemCard.tsx`, add an optional `description?: string` prop. Wrap the existing card content with the `Tooltip` component when a description is provided:

```tsx
// Add to GemCardProps:
description?: string;

// Wrap the outer div with Tooltip when description is present:
const card = (
  <div data-gem={affixId} className="..." ...>
    {/* existing card content */}
  </div>
);

return description ? (
  <Tooltip content={<GemDetailPanel affixName={affixName} description={description} category={categoryLabel ?? ''} tags={tags} statLabel={statLabel} tier={tier} />}>
    {card}
  </Tooltip>
) : card;
```

- [ ] **Step 5: Thread affix description from Draft.tsx to GemCard**

In `Draft.tsx`, pass the description to each GemCard in the pool grid:

```tsx
<GemCard
  ...existing props...
  description={affix.description}
/>
```

- [ ] **Step 4: Handle long-press → show detail during opponent turn**

In Draft.tsx's pointer model, the long-press (hold >300ms) is currently a no-op. Update the `handleUp` callback's hold branch to show a detail popup. The simplest approach: on long-press, select the gem (which highlights it and activates the tooltip's hover state) but don't initiate a pick.

Alternative simpler approach: Since Tooltip already shows on hover (300ms delay), long-press detail may already "just work" on touch devices via the Tooltip component. Verify this works and only add additional handling if needed.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/GemDetailPanel.tsx packages/client/src/components/GemCard.tsx packages/client/src/pages/Draft.tsx
git commit -m "feat(draft): add gem detail tooltip on hover with description, tags, tier (D12)"
```

---

## Chunk 2: Archetype Grouping in Stockpile (D13)

### Task 2: Group stockpile orbs by element

Sort orbs in `StockpileZone` by their primary element tag so fire gems cluster together, cold together, etc. Each group gets a subtle colored left-border or divider.

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx` (StockpileZone component, ~lines 20-97)

- [ ] **Step 1: Add element grouping logic to StockpileZone**

Before rendering the grid, sort orbs by primary element tag:

```typescript
const ELEMENT_ORDER = ['fire', 'cold', 'lightning', 'poison', 'shadow', 'chaos', 'physical'];

function getPrimaryElement(affix: AffixDef): string {
  return affix.tags.find((t) => ELEMENT_ORDER.includes(t)) ?? 'physical';
}

// In StockpileZone, sort orbs before rendering:
const sortedOrbs = [...orbs].sort((a, b) => {
  const aEl = getPrimaryElement(affixMap.get(a.affixId)!);
  const bEl = getPrimaryElement(affixMap.get(b.affixId)!);
  return ELEMENT_ORDER.indexOf(aEl) - ELEMENT_ORDER.indexOf(bEl);
});
```

- [ ] **Step 2: Add element-colored left border to each GemChip**

Pass the primary element's border color to GemChip so each chip in the stockpile shows its element identity. GemChip already has element-based border coloring, so grouping by sort order alone may be sufficient — visually, fire chips (red borders) will cluster, cold chips (blue borders) will cluster, etc.

- [ ] **Step 3: Verify in browser**

Pick gems of different elements. The stockpile should show them grouped by element color, not in pick order.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Draft.tsx
git commit -m "feat(draft): group stockpile orbs by element for archetype guidance (D13)"
```

---

## Chunk 3: Opponent Pick Animation (D14)

### Task 3: Animate opponent picks with swooping motion

When the opponent picks a gem, animate it flying from its pool position to the opponent's stockpile zone with a swooping arc.

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx` (track opponent picks, render flying gem)
- Modify: `packages/client/src/index.css` (add swoop keyframe)

- [ ] **Step 1: Cache gem positions and track opponent picks**

The key challenge: by the time we detect a pool change in `useEffect`, React has already re-rendered and the removed gem's DOM element is gone. Solution: cache all gem positions on every render using `useLayoutEffect`, then look up the cached position when a pick is detected.

```typescript
// Cache gem positions BEFORE React commits DOM changes
const gemPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

useLayoutEffect(() => {
  const positions = new Map<string, { x: number; y: number }>();
  for (const orb of pool) {
    // Use uid-based data attribute for unique lookup
    const el = document.querySelector(`[data-gem-uid="${orb.uid}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      positions.set(orb.uid, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
  }
  gemPositionsRef.current = positions;
}, [pool]);

const prevPoolRef = useRef<OrbInstance[]>(pool);

const [flyingOrb, setFlyingOrb] = useState<{
  orb: OrbInstance;
  startPos: { x: number; y: number };
} | null>(null);

useEffect(() => {
  const prevPool = prevPoolRef.current;
  prevPoolRef.current = pool;

  // Only detect opponent picks (pool shrunk but we didn't pick)
  if (!isPlayerTurn && prevPool.length > pool.length) {
    const removedOrb = prevPool.find((o) => !pool.some((p) => p.uid === o.uid));
    if (removedOrb) {
      // Use cached position from BEFORE the re-render
      const cachedPos = gemPositionsRef.current.get(removedOrb.uid);
      if (cachedPos) {
        setFlyingOrb({ orb: removedOrb, startPos: cachedPos });
        playSound('orbPickOpponent');
        setTimeout(() => setFlyingOrb(null), 500);
      }
    }
  }
}, [pool, isPlayerTurn]);
```

**Important:** Also add `data-gem-uid={orb.uid}` to each GemCard in the pool grid (in addition to the existing `data-gem={affixId}`). This gives us a unique selector per orb since multiple orbs can share the same affixId:

```tsx
// In the GemCard rendering, add to GemCardProps:
uid?: string;

// In GemCard.tsx, add to the outer div:
data-gem-uid={uid}
```
```

- [ ] **Step 2: Render flying gem with swoop animation**

```tsx
{flyingOrb && (() => {
  const affix = affixMap.get(flyingOrb.orb.affixId);
  if (!affix) return null;
  // Target: opponent stockpile zone (top of screen)
  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        left: flyingOrb.startPos.x - 20,
        top: flyingOrb.startPos.y - 20,
        animation: 'swoop-to-top 0.5s ease-in-out forwards',
      }}
    >
      <GemChip
        affixId={flyingOrb.orb.affixId}
        affixName={affix.name.split(' ')[0]}
        statLabel={getStatLabel(affix, flyingOrb.orb)}
        tags={affix.tags}
      />
    </div>
  );
})()}
```

- [ ] **Step 3: Add CSS keyframe for swoop animation**

In `packages/client/src/index.css`:

```css
@keyframes swoop-to-top {
  0% { transform: translate(0, 0) scale(1); opacity: 1; }
  50% { transform: translate(-20px, -40%) scale(0.8); opacity: 0.9; }
  100% { transform: translate(0, -80vh) scale(0.5); opacity: 0; }
}
```

- [ ] **Step 4: Add opponent pick sound**

Add `orbPickOpponent` to the `SoundName` type, registry, and synth fallbacks in `sound-manager.ts`:

```typescript
// Add to SoundName type:
| 'orbPickOpponent'

// Add to SOUND_REGISTRY:
orbPickOpponent: { sprite: 'orb-pick-opponent', volume: 0.4, category: 'sfx', varyPitch: true },

// Add to SYNTH_SOUNDS map (provides synthesized fallback when no audio files exist):
orbPickOpponent: { type: 'sine', freq: 330, duration: 0.08, gain: 0.15 },
```

Play it in Draft.tsx when an opponent pick is detected (in the same `useEffect` that sets `flyingOrb`):

```typescript
playSound('orbPickOpponent');
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/Draft.tsx packages/client/src/index.css packages/client/src/shared/utils/sound-manager.ts
git commit -m "feat(draft): animate opponent picks with swoop + sound (D14, D16)"
```

---

## Chunk 4: Pool Entrance Animation (D15)

### Task 4: Stagger gem entrance when pool appears

When the draft screen loads or transitions between rounds, gems should cascade in with a staggered animation rather than appearing all at once.

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx` (add staggered animation delay per gem)
- Modify: `packages/client/src/index.css` (add gem-enter keyframe)

- [ ] **Step 1: Add gem-enter keyframe**

In `packages/client/src/index.css`:

```css
@keyframes gem-enter {
  0% { transform: scale(0.7); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
```

- [ ] **Step 2: Apply staggered animation to pool GemCards**

In Draft.tsx, add an `animationDelay` based on the gem's index. Use a `poolEnteredRef` flag keyed on `draftRound` to only animate on fresh pool loads (not on every pick):

```tsx
// Track which round's pool has been animated
const animatedRoundRef = useRef<number>(0);
const shouldAnimate = animatedRoundRef.current !== draftRound;
if (shouldAnimate) {
  // Will be set to current round after first render with this pool
  // Use a timeout to flip it after animation completes
}

useEffect(() => {
  if (animatedRoundRef.current !== draftRound) {
    const timer = setTimeout(() => { animatedRoundRef.current = draftRound; }, 800);
    return () => clearTimeout(timer);
  }
}, [draftRound]);

// In the pool grid:
{pool.map((orb, index) => {
  const affix = affixMap.get(orb.affixId);
  if (!affix) return null;
  return (
    <div
      key={orb.uid}
      style={shouldAnimate ? {
        animation: 'gem-enter 0.3s ease-out both',
        animationDelay: `${index * 25}ms`,
      } : undefined}
    >
      <GemCard ... />
    </div>
  );
})}
```

The `shouldAnimate` flag ensures entrance animation only plays once per draft round, not on every pick. With 24 gems at 25ms stagger, the cascade completes in ~900ms.

- [ ] **Step 3: Delay phase transition overlay slightly**

In `PhaseRouter.tsx`, increase both the JS timeout AND the CSS animation duration in sync — change timeout from `1000` to `1200` ms, and change the CSS animation from `fadeInOut 1s` to `fadeInOut 1.2s`. Both must change together or there will be a gap/mismatch. Also update the `@keyframes fadeInOut` duration comment in `index.css` if present.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Draft.tsx packages/client/src/index.css packages/client/src/pages/PhaseRouter.tsx
git commit -m "feat(draft): staggered gem entrance animation on pool load (D15)"
```

---

## Chunk 5: Sound Polish (D16)

### Task 5: Fill sound gaps — timer warning band, mute persistence

**Files:**
- Modify: `packages/client/src/components/Timer.tsx` (add sounds for 6-10s warning band)
- Modify: `packages/client/src/stores/uiStore.ts` (persist isMuted to localStorage)

- [ ] **Step 1: Add timer sounds for the 6-10s warning band**

In `Timer.tsx`, the current sound logic plays `timerTick` for seconds 4-5 and `timerUrgent` for 1-3. Extend to play a softer tick for 6-10:

```typescript
// BEFORE (Timer.tsx ~line 21):
if (seconds !== prevSecondsRef.current && seconds <= 5 && seconds > 0) {
  playSound(seconds <= 3 ? 'timerUrgent' : 'timerTick');
}

// AFTER:
if (seconds !== prevSecondsRef.current && seconds <= 10 && seconds > 0) {
  playSound(seconds <= 3 ? 'timerUrgent' : 'timerTick');
}
```

This extends the tick sound to the 6-10 second range, matching the visual warning band.

- [ ] **Step 2: Persist isMuted to localStorage**

In `uiStore.ts`, the existing `toggleMute` action (line 48) doesn't persist. Update it:

```typescript
// BEFORE (line 38):
isMuted: false,

// AFTER:
isMuted: (() => { try { return localStorage.getItem('alloy:muted') === 'true'; } catch { return false; } })(),

// BEFORE (line 48):
toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),

// AFTER:
toggleMute: () => set((s) => {
  const next = !s.isMuted;
  try { localStorage.setItem('alloy:muted', String(next)); } catch { /* noop */ }
  return { isMuted: next };
}),
```

Uses the same `alloy:` key prefix pattern as volume storage (`alloy:vol:master`, etc.).

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/Timer.tsx packages/client/src/stores/uiStore.ts
git commit -m "feat(draft): extend timer sounds to warning band, persist mute setting (D16)"
```

---

## Chunk 6: Responsive Layout (D17)

### Task 6: Make gem grid and status bar viewport-aware

The current `useGemSize` keys off pool count, not viewport width. On narrow screens (<400px), gems can overflow. Add viewport awareness.

**Files:**
- Modify: `packages/client/src/hooks/useGemSize.ts` (add viewport width parameter)
- Modify: `packages/client/src/pages/Draft.tsx` (pass viewport width, wrap status bar)

- [ ] **Step 1: Add viewport width awareness to useGemSize**

Update `useGemSize` to accept an optional `containerWidth` parameter and cap the gem size + columns so they fit:

```typescript
export function useGemSize(poolCount: number, containerWidth?: number): GemSizeConfig {
  return useMemo(() => {
    // Start with pool-count-based defaults
    let config: GemSizeConfig;
    if (poolCount <= 8) {
      config = { gemSize: 100, columns: 4, emojiSize: 36, statSize: 15, nameSize: 15, catSize: 12 };
    } else if (poolCount <= 12) {
      config = { gemSize: 88, columns: 4, emojiSize: 32, statSize: 14, nameSize: 14, catSize: 12 };
    } else if (poolCount <= 16) {
      config = { gemSize: 82, columns: 4, emojiSize: 30, statSize: 14, nameSize: 13, catSize: 11 };
    } else if (poolCount <= 24) {
      config = { gemSize: 68, columns: 5, emojiSize: 26, statSize: 12, nameSize: 11, catSize: 10 };
    } else {
      config = { gemSize: 62, columns: 5, emojiSize: 24, statSize: 12, nameSize: 11, catSize: 10 };
    }

    // If container width is known, shrink to fit
    if (containerWidth && containerWidth > 0) {
      const gap = 4;
      const padding = 12; // 6px padding on each side
      const availableWidth = containerWidth - padding;
      const maxGemWidth = Math.floor((availableWidth - (config.columns - 1) * gap) / config.columns);

      const MIN_GEM_SIZE = 48; // Minimum touch target size
      if (maxGemWidth < config.gemSize) {
        const clampedWidth = Math.max(MIN_GEM_SIZE, maxGemWidth);
        const scale = clampedWidth / config.gemSize;
        config = {
          ...config,
          gemSize: clampedWidth,
          emojiSize: Math.round(config.emojiSize * scale),
          statSize: Math.round(config.statSize * scale),
          nameSize: Math.round(config.nameSize * scale),
          catSize: Math.round(config.catSize * scale),
        };
      }
    }

    return config;
  }, [poolCount, containerWidth]);
}
```

- [ ] **Step 2: Measure container width in Draft.tsx**

Add a `ResizeObserver` to measure the pool grid container width:

```typescript
const poolContainerRef = useRef<HTMLDivElement>(null);
const [containerWidth, setContainerWidth] = useState(0);

useEffect(() => {
  const el = poolContainerRef.current;
  if (!el) return;
  const observer = new ResizeObserver((entries) => {
    setContainerWidth(entries[0].contentRect.width);
  });
  observer.observe(el);
  return () => observer.disconnect();
}, []);

const gemSizing = useGemSize(pool.length, containerWidth);
```

Add `ref={poolContainerRef}` to the pool grid's outer div.

- [ ] **Step 3: Make status bar wrap on narrow screens**

Add `flex-wrap` to the status bar so the round label and timer don't overflow:

```tsx
<div className="my-1 flex flex-wrap items-center justify-between gap-1 px-1">
```

- [ ] **Step 4: Update useGemSize tests**

Add a test case for the `containerWidth` parameter:

```typescript
it('shrinks gems when container is narrow', () => {
  const { result } = renderHook(() => useGemSize(24, 300));
  expect(result.current.gemSize).toBeLessThan(68); // default for 24 is 68
  expect(result.current.columns).toBe(5);
});
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/hooks/useGemSize.ts packages/client/src/hooks/useGemSize.test.ts packages/client/src/pages/Draft.tsx
git commit -m "feat(draft): viewport-aware gem sizing and responsive status bar (D17)"
```

---

## Chunk 7: Disconnect UX Polish (D18)

### Task 7: Improve disconnect overlay messaging

Add outcome messaging to the disconnect overlay so the player knows what happens at t=0.

**Files:**
- Modify: `packages/client/src/components/DisconnectOverlay.tsx`
- Modify: `packages/client/src/hooks/useDisconnectTimer.ts` (export timeout constant)

- [ ] **Step 1: Add outcome messaging to DisconnectOverlay**

```tsx
// Update DisconnectOverlay to show what happens at t=0:
export function DisconnectOverlay({
  isDisconnected,
  secondsLeft,
}: {
  isDisconnected: boolean;
  secondsLeft: number;
}) {
  if (!isDisconnected) return null;

  const isExpiring = secondsLeft <= 5;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70">
      <div className="flex flex-col items-center gap-4 rounded-xl bg-surface-700 p-8 shadow-lg">
        <h2 className="text-xl font-bold text-danger">Opponent Disconnected</h2>
        {secondsLeft > 0 ? (
          <>
            <p className="text-surface-300">
              Waiting for reconnect... <span className="font-mono font-bold text-white">{secondsLeft}s</span>
            </p>
            {isExpiring && (
              <p className="text-xs text-warning">
                If they don't reconnect, you win by forfeit.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm font-bold text-accent-400">
            Opponent forfeited. Claiming victory...
          </p>
        )}
        <div className="h-2 w-48 overflow-hidden rounded-full bg-surface-600">
          <div
            className="h-full rounded-full bg-warning transition-all duration-1000"
            style={{ width: `${(secondsLeft / 60) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Play alert sound on disconnect**

In Draft.tsx (or in `useDisconnectTimer`), play a sound when disconnect is detected:

```typescript
// In Draft.tsx, add effect:
useEffect(() => {
  if (isDisconnected) {
    playSound('phaseTransition');
  }
}, [isDisconnected]);
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/DisconnectOverlay.tsx packages/client/src/pages/Draft.tsx
git commit -m "feat(draft): improve disconnect overlay with outcome messaging and sound (D18)"
```

---

## Chunk 8: Final Verification

### Task 8: Run all tests and browser play-test

- [ ] **Step 1: Run engine tests**

Run: `cd packages/engine && npx vitest run`
Expected: All pass

- [ ] **Step 2: Run client tests**

Run: `cd packages/client && npx vitest run`
Expected: All pass (excluding pre-existing failures in Forge, Matchmaking, remote-gateway)

- [ ] **Step 3: Browser play-test P1 criteria**

| AC | What to check |
|---|---|
| D12 | Hover over gem in pool → tooltip shows name, description, tags, tier |
| D13 | Stockpile gems grouped by element (fire together, cold together, etc.) |
| D14 | Opponent picks animate with swoop from pool to their stockpile + sound |
| D15 | Pool gems cascade in with staggered animation on draft start |
| D16 | Timer ticks from 10s, urgent at 3s; opponent pick has sound; mute persists across reload |
| D17 | On narrow window (~350px wide), all gems fit without clipping |
| D18 | In multiplayer, disconnect shows countdown + "you win by forfeit" at ≤5s |

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(draft): address issues found during P1 verification"
```
