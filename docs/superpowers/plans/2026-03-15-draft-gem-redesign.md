# Draft Gem Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the draft screen gems to use Style B (stat value inside the gem shape, name + category below) with auto-scaling based on pool count, plus an asset system that lets custom art replace placeholder emoji when available.

**Architecture:** Create a new `GemCard` component that replaces the current `DraftOrb` + `OrbIcon` combo on the draft screen. The gem renders a square shape with emoji/art + stat value inside, name below, category below that. Size is controlled by CSS custom properties, calculated dynamically from pool count. An `ArtRegistry` maps affix IDs to image URLs — when art exists, it replaces the emoji. The pool area uses CSS Grid with dynamic column count instead of flex-wrap.

**Tech Stack:** React, CSS Grid, CSS custom properties for sizing, optional image assets

**Design reference mockup:** `packages/client/public/mockups/draft-b-quick32.html`

---

## File Structure

```
packages/client/src/
├── components/
│   ├── GemCard.tsx                # CREATE: New gem component with stat-inside + art support
│   ├── OrbIcon.tsx                # KEEP: Still used in forge, stockpile chips, etc.
│   └── GemChip.tsx                # CREATE: Compact chip for stockpile zones (icon + name + stat)
├── shared/
│   └── utils/
│       └── art-registry.ts        # CREATE: Maps affix IDs to custom art URLs
├── pages/
│   └── Draft.tsx                  # MODIFY: Replace DraftOrb with GemCard, add auto-scaling grid
├── hooks/
│   └── useGemSize.ts              # CREATE: Computes gem size + column count from pool length
└── public/
    └── assets/
        └── gems/                  # CREATE: Directory for custom gem art (empty initially)
            └── .gitkeep
```

---

## Task 1: Art Registry

**Files:**
- Create: `packages/client/src/shared/utils/art-registry.ts`

This is the system that maps affix IDs to custom artwork. When no art exists, components fall back to emoji. When art is added later, just register the URL here.

- [ ] **Step 1: Create art-registry.ts**

```typescript
// Art registry — maps affix IDs to custom gem artwork URLs.
// When custom art is available, add entries here. Components
// check this registry and fall back to emoji if no art exists.

const artMap = new Map<string, string>();

/**
 * Register custom art for an affix.
 * Call this at app startup to load art, or dynamically as assets load.
 * @param affixId — e.g., 'fire_damage'
 * @param url — path to image, e.g., '/assets/gems/fire_damage.png'
 */
export function registerGemArt(affixId: string, url: string): void {
  artMap.set(affixId, url);
}

/**
 * Bulk register multiple gems at once.
 */
export function registerAllGemArt(entries: Record<string, string>): void {
  for (const [id, url] of Object.entries(entries)) {
    artMap.set(id, url);
  }
}

/**
 * Get custom art URL for an affix, or null if none registered.
 */
export function getGemArt(affixId: string): string | null {
  return artMap.get(affixId) ?? null;
}

/**
 * Check if custom art exists for an affix.
 */
export function hasGemArt(affixId: string): boolean {
  return artMap.has(affixId);
}
```

- [ ] **Step 2: Create the gems asset directory**

```bash
mkdir -p packages/client/public/assets/gems
touch packages/client/public/assets/gems/.gitkeep
```

- [ ] **Step 3: Verify it compiles**

```bash
cd packages/client && npx tsc --noEmit
```

---

## Task 2: useGemSize Hook

**Files:**
- Create: `packages/client/src/hooks/useGemSize.ts`

Computes gem size and grid column count dynamically based on how many orbs are in the pool. Uses the breakpoints from the approved mockup.

- [ ] **Step 1: Create useGemSize.ts**

```typescript
import { useMemo } from 'react';

interface GemSizeConfig {
  gemSize: number;      // px — width/height of the gem shape
  columns: number;      // grid column count
  emojiSize: number;    // px — emoji font size
  statSize: number;     // px — stat value font size inside gem
  nameSize: number;     // px — name font size below gem
  catSize: number;      // px — category font size below name
}

/**
 * Compute gem rendering sizes based on pool count.
 * Fewer gems = bigger gems. Matches the approved mockup sizing:
 *   ≤8 gems:  110px, 4 cols
 *   ≤16 gems: 100px, 4 cols (ranked R1)
 *   ≤20 gems: 90px,  5 cols
 *   >20 gems: 82px,  5 cols (quick match full pool)
 */
export function useGemSize(poolCount: number): GemSizeConfig {
  return useMemo(() => {
    if (poolCount <= 8) {
      return { gemSize: 110, columns: 4, emojiSize: 40, statSize: 16, nameSize: 17, catSize: 14 };
    }
    if (poolCount <= 16) {
      return { gemSize: 100, columns: 4, emojiSize: 36, statSize: 15, nameSize: 16, catSize: 13 };
    }
    if (poolCount <= 20) {
      return { gemSize: 90, columns: 5, emojiSize: 32, statSize: 14, nameSize: 14, catSize: 12 };
    }
    // 21+ (quick match full pool)
    return { gemSize: 82, columns: 5, emojiSize: 30, statSize: 14, nameSize: 13, catSize: 11 };
  }, [poolCount]);
}
```

- [ ] **Step 2: Write test**

Create `packages/client/src/hooks/useGemSize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGemSize } from './useGemSize';

describe('useGemSize', () => {
  it('returns largest size for ≤8 gems', () => {
    const { result } = renderHook(() => useGemSize(8));
    expect(result.current.gemSize).toBe(110);
    expect(result.current.columns).toBe(4);
  });

  it('returns medium size for 16 gems (ranked R1)', () => {
    const { result } = renderHook(() => useGemSize(16));
    expect(result.current.gemSize).toBe(100);
    expect(result.current.columns).toBe(4);
  });

  it('returns compact size for 20 gems', () => {
    const { result } = renderHook(() => useGemSize(20));
    expect(result.current.gemSize).toBe(90);
    expect(result.current.columns).toBe(5);
  });

  it('returns smallest size for 32 gems (quick full)', () => {
    const { result } = renderHook(() => useGemSize(32));
    expect(result.current.gemSize).toBe(82);
    expect(result.current.columns).toBe(5);
  });
});
```

- [ ] **Step 3: Run test**

```bash
cd packages/client && npx vitest run src/hooks/useGemSize.test.ts
```

---

## Task 3: GemCard Component

**Files:**
- Create: `packages/client/src/components/GemCard.tsx`

The core new component. A gem shape with emoji (or custom art) + stat value inside, name below, category below that. Supports selection glow, hover scale, drag initiation.

- [ ] **Step 1: Create GemCard.tsx**

Key features:
- Renders a square shape at `gemSize` px with element-colored gradient background + border
- Inside the shape: emoji or `<img>` (if art registered) + stat value text
- Below shape: affix name + category label
- Hover: scale 1.08 + brightness
- Selected: element-colored glow drop-shadow
- Supports `onPointerDown` for drag initiation
- Uses `getGemArt()` from art-registry to check for custom art
- All text sizes controlled by props (from useGemSize)

Element colors, gradients, and glow colors match the existing design system defined in `index.css`.

Category labels use full words: "Offensive", "Defense", "Sustain", "Trigger", "Utility".

- [ ] **Step 2: Verify it compiles**

```bash
cd packages/client && npx tsc --noEmit
```

---

## Task 4: GemChip Component

**Files:**
- Create: `packages/client/src/components/GemChip.tsx`

Compact chip for the opponent/player stockpile zones. Shows icon (32px) + name + stat in a horizontal pill. Replaces the inline chip markup currently in Draft.tsx.

- [ ] **Step 1: Create GemChip.tsx**

Key features:
- 32px icon (emoji or custom art) with element gradient background
- Name (12-13px, Rajdhani bold, white)
- Stat (10-11px, Rajdhani, accent-300)
- Element-colored border on the icon
- `newest` prop triggers bounce-in animation
- Optional `empty` prop renders a dashed placeholder

- [ ] **Step 2: Verify it compiles**

```bash
cd packages/client && npx tsc --noEmit
```

---

## Task 5: Rewrite Draft.tsx

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx`

Replace the current `DraftOrb` function and pool rendering with `GemCard` in a CSS Grid, using `useGemSize` for dynamic sizing. Replace inline stockpile chips with `GemChip`.

- [ ] **Step 1: Replace DraftOrb with GemCard**

- Import `GemCard` and `useGemSize`
- Remove the old `DraftOrb` local function
- Call `useGemSize(pool.length)` to get sizing config
- Render pool as CSS Grid: `grid-template-columns: repeat(columns, 1fr)`
- Pass sizing props to each `GemCard`

- [ ] **Step 2: Replace inline stockpile chips with GemChip**

- Import `GemChip`
- Replace the `StockpileStrip` function's inline chip HTML with `<GemChip>` components
- Stockpile zones use 4-column grid layout
- Empty slots render `<GemChip empty />`

- [ ] **Step 3: Update drag ghost to use GemCard**

The floating drag ghost should render a `GemCard` at `lg` size with glow effect.

- [ ] **Step 4: Verify it compiles and renders**

```bash
cd packages/client && npx tsc --noEmit
```

Start dev server and manually verify the draft screen renders correctly with auto-scaling gems.

---

## Task 6: Update E2E Tests

**Files:**
- Modify: `packages/client/e2e/match-flow.spec.ts`
- Modify: `packages/client/e2e/fixtures/match.ts`

The orb selectors in E2E tests may need updating since the DOM structure changed (GemCard vs old OrbIcon).

- [ ] **Step 1: Update pickOrb selector**

The `pickOrb` helper in `fixtures/match.ts` currently finds orbs by `button[title*="(T"]:not([disabled])`. Update to match the new GemCard's structure — look for the gem's clickable container.

- [ ] **Step 2: Update completeDraft selectors**

Ensure `completeDraft` still works with the new component structure.

- [ ] **Step 3: Run E2E tests**

```bash
cd packages/client && npx playwright test
```

All 24 tests must pass across all 4 device profiles.

---

## Task 7: Final Verification

- [ ] **Step 1: Run client unit tests**

```bash
cd packages/client && npx vitest run
```

- [ ] **Step 2: Run E2E tests**

```bash
cd packages/client && npx playwright test
```

- [ ] **Step 3: Run client build**

```bash
pnpm -F @alloy/client build
```

- [ ] **Step 4: Visual verification**

Start dev server, play a match. Verify:
- Ranked R1 draft (16 gems): 4 columns, ~100px gems, stat inside, name + category below
- Quick match draft (30+ gems): 5 columns, ~82px gems, scrollable
- Late draft (8 gems remaining): 4 columns, ~110px gems, very large
- Stockpile chips show icon + name + stat in 4-column grid
- Opponent chips clearly readable
- Drag-to-draft still works with new GemCard
- Double-tap still works

---

## Verification Checklist

- [ ] Client unit tests pass (including new useGemSize tests)
- [ ] E2E tests pass (24 across 4 devices)
- [ ] Client build succeeds
- [ ] GemCard auto-scales: 82px at 32 gems → 110px at 8 gems
- [ ] Stat value displayed inside gem shape
- [ ] Name + category displayed below gem
- [ ] Art registry loads custom art when registered
- [ ] Emoji fallback works when no art registered
- [ ] Stockpile chips use GemChip with 4-column grid
- [ ] Drag-to-draft functional
- [ ] Double-tap-to-draft functional

---

## How to Add Custom Art Later

When art assets are ready:

1. Place PNG/WebP files in `packages/client/public/assets/gems/` named by affix ID:
   ```
   gems/fire_damage.png
   gems/cold_damage.png
   gems/flat_physical.png
   ...
   ```

2. In `main.tsx` (or a startup module), register all art:
   ```typescript
   import { registerAllGemArt } from '@/shared/utils/art-registry';

   registerAllGemArt({
     fire_damage: '/assets/gems/fire_damage.png',
     cold_damage: '/assets/gems/cold_damage.png',
     flat_physical: '/assets/gems/flat_physical.png',
     // ... all affixes
   });
   ```

3. GemCard automatically picks up the art — no other code changes needed. The `<img>` replaces the emoji inside the gem shape.

4. Art should be square, ideally 256×256 or 512×512 PNG with transparency. The gem shape clips it with border-radius.
