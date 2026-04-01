# Responsive Token System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded pixel values across the game UI with a responsive CSS token system driven by frame height, eliminating wasted space on all screens.

**Architecture:** A single ResizeObserver on AppShell sets `--frame-h` as a CSS custom property. All sizing tokens (`--socket-size`, `--gem-size`, `--text-*`, `--gap-*`) derive from it via `clamp()`. Screens use flex/grid layout patterns to distribute vertical space. The `useGemSize` hook and per-component ResizeObservers are removed entirely.

**Tech Stack:** React, CSS custom properties, Tailwind CSS v4, PixiJS (Duel canvas)

**Spec:** `docs/superpowers/specs/2026-03-31-responsive-token-system-design.md`

---

## Chunk 1: Infrastructure — Token Definitions + AppShell ResizeObserver

### Task 1: Define responsive tokens in index.css

**Files:**
- Modify: `packages/client/src/index.css:74-75` (after existing spacing tokens in @theme block)

- [ ] **Step 1: Add sizing tokens after the existing `--spacing-safe-bottom` line**

In `packages/client/src/index.css`, add the responsive token block immediately after line 75 (`--spacing-safe-bottom`), still inside the `@theme` block:

```css
  /* ── Responsive Sizing Tokens ──
     All derive from --frame-h (set by AppShell ResizeObserver).
     Pattern: clamp(min, calc(var(--frame-h) * scale), max)
     Fallback: --frame-h defaults to 812px for SSR/tests */

  /* Component sizing */
  --socket-size: clamp(36px, calc(var(--frame-h, 812px) * 0.055), 56px);
  --gem-size: clamp(56px, calc(var(--frame-h, 812px) * 0.095), 104px);
  --gem-size-sm: clamp(40px, calc(var(--frame-h, 812px) * 0.065), 72px);
  --icon-md: clamp(16px, calc(var(--frame-h, 812px) * 0.025), 24px);

  /* Spacing */
  --gap-xs: clamp(2px, calc(var(--frame-h, 812px) * 0.004), 4px);
  --gap-sm: clamp(4px, calc(var(--frame-h, 812px) * 0.007), 8px);
  --gap-md: clamp(6px, calc(var(--frame-h, 812px) * 0.012), 14px);
  --gap-lg: clamp(10px, calc(var(--frame-h, 812px) * 0.02), 20px);

  /* Typography */
  --text-2xs: clamp(7px, calc(var(--frame-h, 812px) * 0.01), 10px);
  --text-xs: clamp(9px, calc(var(--frame-h, 812px) * 0.013), 13px);
  --text-sm: clamp(11px, calc(var(--frame-h, 812px) * 0.016), 15px);
  --text-md: clamp(14px, calc(var(--frame-h, 812px) * 0.02), 18px);
  --text-lg: clamp(18px, calc(var(--frame-h, 812px) * 0.028), 26px);

  /* Derived */
  --gem-radius: calc(var(--gem-size) * 0.16);
  --gem-radius-sm: calc(var(--gem-size-sm) * 0.16);
  --socket-radius: calc(var(--socket-size) * 0.17);
  --tabbar-h: clamp(40px, calc(var(--frame-h, 812px) * 0.055), 52px);
```

- [ ] **Step 2: Verify CSS parses correctly**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs` with no CSS parse errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/index.css
git commit -m "feat: add responsive sizing tokens to CSS design system"
```

---

### Task 2: Add ResizeObserver to AppShell

**Files:**
- Modify: `packages/client/src/components/AppShell.tsx:1,44-46`

- [ ] **Step 1: Add useEffect and useRef imports**

At line 1 of `AppShell.tsx`, add `useRef` and `useEffect` to the existing import (they're already imported, confirm `useRef` is present — if not, add it):

```tsx
import { useState, useCallback, useEffect, useRef } from 'react';
```

- [ ] **Step 2: Add frameRef and ResizeObserver**

Inside the `AppShell` function body, after the existing state declarations (after line 15 `const [pendingDestination, setPendingDestination] = useState('/');`), add:

```tsx
  // Measure app-frame height and set --frame-h for responsive tokens
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(([entry]) => {
      frame.style.setProperty('--frame-h', `${entry.contentRect.height}px`);
    });
    ro.observe(frame);
    return () => ro.disconnect();
  }, []);
```

- [ ] **Step 3: Attach ref to app-frame div**

Change line 46 from:
```tsx
      <div className="app-frame">
```
to:
```tsx
      <div className="app-frame" ref={frameRef}>
```

- [ ] **Step 4: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/AppShell.tsx
git commit -m "feat: add ResizeObserver to AppShell for --frame-h token"
```

---

## Chunk 2: Component Migrations — Forge Components

### Task 3: Migrate ItemSocketView to tokens

**Files:**
- Modify: `packages/client/src/components/ItemSocketView.tsx`

The socket grid currently uses `minmax(36px, 48px)` for columns/rows (from our earlier side-by-side change) and sockets use `width: '100%'; aspectRatio: '1'`. We need to switch to the token-based explicit sizing.

- [ ] **Step 1: Replace socket grid template**

Find the socket grid div (around line 116-122). Replace the grid styles:

Old:
```tsx
gridTemplateColumns: `repeat(${cols}, minmax(36px, 48px))`,
gridTemplateRows: 'repeat(2, minmax(36px, 48px))',
gap: 6,
```

New:
```tsx
gridTemplateColumns: `repeat(${cols}, var(--socket-size))`,
gridTemplateRows: 'repeat(2, var(--socket-size))',
gap: 'var(--gap-sm)',
```

- [ ] **Step 2: Replace empty socket button styles**

Find the empty socket button (around line 129-151). Replace size properties:

Old:
```tsx
width: '100%',
aspectRatio: '1',
borderRadius: 8,
```

New:
```tsx
width: 'var(--socket-size)',
height: 'var(--socket-size)',
borderRadius: 'var(--socket-radius)',
```

- [ ] **Step 3: Replace locked socket div styles**

Find the locked socket div (around line 166-181). Replace:

Old:
```tsx
width: '100%',
aspectRatio: '1',
borderRadius: 8,
```

New:
```tsx
width: 'var(--socket-size)',
height: 'var(--socket-size)',
borderRadius: 'var(--socket-radius)',
```

And the lock emoji font size (around line 183):
Old: `fontSize: 16`
New: `fontSize: 'var(--icon-md)'`

- [ ] **Step 4: Replace filled socket button styles**

Find the filled socket button (around line 193-207). Replace:

Old:
```tsx
width: '100%',
aspectRatio: '1',
borderRadius: 8,
```

New:
```tsx
width: 'var(--socket-size)',
height: 'var(--socket-size)',
borderRadius: 'var(--socket-radius)',
```

Replace gem art image size (around line 210):
Old: `width: 20, height: 20`
New: `width: 'var(--icon-md)', height: 'var(--icon-md)'`

Replace emoji size (around line 212):
Old: `fontSize: 20`
New: `fontSize: 'var(--icon-md)'`

Replace affix label text (around line 216):
Old: `fontSize: 7`
New: `fontSize: 'var(--text-2xs)'`

- [ ] **Step 5: Replace item info text sizes**

Replace item name fontSize (around line 49):
Old: `fontSize: 16`
New: `fontSize: 'var(--text-md)'`

Replace badge fontSize (around line 58):
Old: `fontSize: 8`
New: `fontSize: 'var(--text-2xs)'`

Replace inherent bonus fontSize (around line 87):
Old: `fontSize: 11`
New: `fontSize: 'var(--text-xs)'`

Replace base stat fontSize (around line 103):
Old: `fontSize: 10`
New: `fontSize: 'var(--text-xs)'`

Replace equipped affix list fontSize (around line 248):
Old: `fontSize: 10`
New: `fontSize: 'var(--text-xs)'`

Replace gap values:
- Item info gap (line 41): `gap: 10` → `gap: 'var(--gap-md)'`
- Inner gap (line 43): `gap: 4` → `gap: 'var(--gap-xs)'`
- Name + badge gap (line 44): `gap: 8` → `gap: 'var(--gap-sm)'`
- Inherent bonuses gap (line 74): `gap: 8` → `gap: 'var(--gap-sm)'`
- Equipped list gap (line 234): `gap: 3` → `gap: 'var(--gap-xs)'`
- Affix row gap (line 253): `gap: 4` → `gap: 'var(--gap-xs)'`

- [ ] **Step 6: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/ItemSocketView.tsx
git commit -m "refactor: migrate ItemSocketView to responsive tokens"
```

---

### Task 4: Migrate ForgeHeader to tokens

**Files:**
- Modify: `packages/client/src/components/ForgeHeader.tsx`

- [ ] **Step 1: Replace all hardcoded font sizes and spacing**

Apply these replacements throughout the file:

| Line (approx) | Old Value | New Value | Context |
|------|-----------|-----------|---------|
| 40 | `minHeight: 28` | `minHeight: 'var(--text-lg)'` | Row 1 height |
| 45 | `fontSize: 14` | `fontSize: 'var(--text-md)'` | Phase title |
| 58 | `fontSize: 10` | `fontSize: 'var(--text-xs)'` | Round badge |
| 59 | `lineHeight: '18px'` | `lineHeight: 1.5` | Round badge |
| 82 | `minHeight: 40` | remove (let content determine height) | Flux row |
| 94 | `fontSize: 18` | `fontSize: 'var(--text-lg)'` | Flux icons |
| 110 | `fontSize: 12` | `fontSize: 'var(--text-sm)'` | Stat values |
| 121 | `minHeight: 24` | remove (let content determine height) | Base stat row |
| 157 | `fontSize: 9` | `fontSize: 'var(--text-2xs)'` | Selector labels |
| 168 | `fontSize: 11` | `fontSize: 'var(--text-xs)'` | Selector values |

Replace padding values with tokens where inline styles use px numbers.

- [ ] **Step 2: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/ForgeHeader.tsx
git commit -m "refactor: migrate ForgeHeader to responsive tokens"
```

---

### Task 5: Migrate CombineWorkbench to tokens

**Files:**
- Modify: `packages/client/src/components/CombineWorkbench.tsx`

- [ ] **Step 1: Replace slot dimensions and text sizes**

The combine slots are functionally similar to sockets. Apply these replacements:

| Approx Line | Old | New | Context |
|-------------|-----|-----|---------|
| 202-203 | `width: '52px', height: '52px'` | `width: 'var(--socket-size)', height: 'var(--socket-size)'` | Empty slot |
| 204 | `borderRadius: '8px'` | `borderRadius: 'var(--socket-radius)'` | Empty slot |
| 208 | `fontSize: '16px'` | `fontSize: 'var(--icon-md)'` | Question mark |
| 246-247 | `width: '52px', height: '52px'` | `width: 'var(--socket-size)', height: 'var(--socket-size)'` | Filled slot |
| 248 | `borderRadius: '8px'` | `borderRadius: 'var(--socket-radius)'` | Filled slot |
| 269 | `width: 36, height: 36` | `width: 'var(--gem-size-sm)', height: 'var(--gem-size-sm)'` | Art image — note: --gem-size-sm is 40-72px, but clamp keeps it reasonable |
| 272 | `fontSize: '20px'` | `fontSize: 'var(--icon-md)'` | Emoji |
| 310-311 | `width: '52px', height: '52px'` | `width: 'var(--socket-size)', height: 'var(--socket-size)'` | Result box |
| 312 | `borderRadius: '8px'` | `borderRadius: 'var(--socket-radius)'` | Result box |
| 316 | `fontSize: '16px'` | `fontSize: 'var(--icon-md)'` | Result symbol |

Replace all gap and padding px values with `var(--gap-sm)` or `var(--gap-md)` as appropriate.

- [ ] **Step 2: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/CombineWorkbench.tsx
git commit -m "refactor: migrate CombineWorkbench to responsive tokens"
```

---

### Task 6: Migrate ForgeGemTray to tokens + auto-fill grid

**Files:**
- Modify: `packages/client/src/components/ForgeGemTray.tsx`

This is a key migration — removes ResizeObserver, column calculation, and useGemSize dependency.

- [ ] **Step 1: Remove ResizeObserver and useGemSize imports/usage**

Remove the `useGemSize` import. Remove the `containerRef`, `containerWidth` state, and the ResizeObserver `useEffect` (lines 33-43). Remove the `useGemSize` call (line 45-46) and `columns` variable.

- [ ] **Step 2: Replace grid with auto-fill + token**

Find the grid container (around line 122). Replace:

Old:
```tsx
gridTemplateColumns: `repeat(${columns}, 1fr)`,
gap: 8,
```

New:
```tsx
gridTemplateColumns: 'repeat(auto-fill, minmax(var(--gem-size), 1fr))',
gap: 'var(--gap-md)',
```

- [ ] **Step 3: Replace minHeight values**

Old (line 85): `minHeight: 120` → remove or replace with `minHeight: 0` (flex:1 will handle sizing from Forge.tsx)
Old (line 108): `minHeight: 100` → remove or replace with `minHeight: 0`

- [ ] **Step 4: Replace other hardcoded px values**

- `marginBottom: 6` → `marginBottom: 'var(--gap-sm)'`
- Badge `width: 16, height: 16` → `width: 'var(--icon-md)', height: 'var(--icon-md)'`
- Badge `fontSize: 8` → `fontSize: 'var(--text-2xs)'`

- [ ] **Step 5: Remove gemSizing prop threading**

Remove props that pass gem size info (`gemSize`, `columns`, etc.) — the CSS tokens handle this now. Update the component's prop types accordingly.

- [ ] **Step 6: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/ForgeGemTray.tsx
git commit -m "refactor: migrate ForgeGemTray to auto-fill grid + responsive tokens"
```

---

### Task 7: Migrate GemCard to tokens

**Files:**
- Modify: `packages/client/src/components/GemCard.tsx`

GemCard currently accepts `gemSize`, `emojiSize`, `statSize`, `nameSize`, `catSize` props from `useGemSize`. These all become CSS token references.

- [ ] **Step 1: Remove size props from interface**

Remove `gemSize`, `emojiSize`, `statSize`, `nameSize`, `catSize` from the component props interface. Keep other props (uid, affix, element, tier, onClick, etc.).

- [ ] **Step 2: Replace all size prop references with token vars**

| Current Prop Usage | New Token Value |
|-------------------|-----------------|
| `width: gemSize, height: gemSize` | `width: 'var(--gem-size)', height: 'var(--gem-size)'` |
| `borderRadius: gemSize * 0.16` | `borderRadius: 'var(--gem-radius)'` |
| `fontSize: emojiSize` | `fontSize: 'var(--icon-md)'` |
| `fontSize: statSize` | `fontSize: 'var(--text-2xs)'` |
| `fontSize: nameSize` | `fontSize: 'var(--text-xs)'` |
| `fontSize: catSize` | `fontSize: 'var(--text-2xs)'` |
| `maxWidth: gemSize + 16` | `maxWidth: 'calc(var(--gem-size) + var(--gap-lg))'` |

Replace tier dot sizing:
- `Math.max(3, gemSize * 0.07)` → `calc(var(--gem-size) * 0.07)` (clamp floor is handled by --gem-size min of 56px, so 56*0.07=3.9 which is fine)
- `gap: Math.max(2, gemSize * 0.03)` → `gap: 'var(--gap-xs)'`

Replace `border: '2.5px solid'` → keep as-is (decorative, not responsive)
Replace `marginTop: 2` → `marginTop: 'var(--gap-xs)'`

- [ ] **Step 3: Update all GemCard callers**

Search for all `<GemCard` usages. Remove the `gemSize`, `emojiSize`, `statSize`, `nameSize`, `catSize` props from every call site. Key files:
- `ForgeGemTray.tsx`
- `Draft.tsx` (pool grid)
- Any other callers

Run: `grep -rn "gemSize\|emojiSize\|statSize\|nameSize\|catSize" packages/client/src/ --include="*.tsx"`

Remove all matches that pass these props to GemCard.

- [ ] **Step 4: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/GemCard.tsx packages/client/src/components/ForgeGemTray.tsx packages/client/src/pages/Draft.tsx
git commit -m "refactor: migrate GemCard to responsive tokens, remove size props"
```

---

### Task 8: Migrate GemChip to tokens

**Files:**
- Modify: `packages/client/src/components/GemChip.tsx`

- [ ] **Step 1: Replace all hardcoded px values**

| Approx Line | Old | New | Context |
|-------------|-----|-----|---------|
| 37 | `borderRadius: 7` | `borderRadius: 'var(--gem-radius-sm)'` | Empty state |
| 39 | `minHeight: 38` | `minHeight: 'var(--gem-size-sm)'` | Empty state |
| 56 | `padding: '4px 6px 4px 4px'` | `padding: 'var(--gap-xs) var(--gap-sm) var(--gap-xs) var(--gap-xs)'` | Chip |
| 57 | `borderRadius: 7` | `borderRadius: 'var(--gem-radius-sm)'` | Chip |
| 66-67 | `width: 30, height: 30` | `width: 'var(--gem-size-sm)', height: 'var(--gem-size-sm)'` | Icon — note: --gem-size-sm range is 40-72px. The current 30px is very small. This is fine — the icon will grow slightly. If it looks too big, add a `--gem-size-xs` token later. |
| 68 | `borderRadius: 6` | `borderRadius: 'var(--gem-radius-sm)'` | Icon |
| 73 | `fontSize: 15` | `fontSize: 'var(--text-sm)'` | Emoji |
| 88 | `borderRadius: 5` | `borderRadius: 'var(--gem-radius-sm)'` | Art image |
| 99 | `fontSize: 12` | `fontSize: 'var(--text-sm)'` | Name |
| 112 | `fontSize: 10` | `fontSize: 'var(--text-xs)'` | Stat |

- [ ] **Step 2: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/GemChip.tsx
git commit -m "refactor: migrate GemChip to responsive tokens"
```

---

## Chunk 3: Component Migrations — Shared Components + Forge Screen Layout

### Task 9: Migrate TabBar to tokens

**Files:**
- Modify: `packages/client/src/components/TabBar.tsx`

- [ ] **Step 1: Replace height and text sizes**

| Approx Line | Old | New | Context |
|-------------|-----|-----|---------|
| 31 | `height: 46` | `height: 'var(--tabbar-h)'` | Main container |
| 100 | `gap: '[2px]'` | `gap: 'var(--gap-xs)'` | Button inner |
| 101 | `padding: '6px 12px'` | `padding: 'var(--gap-sm) var(--gap-md)'` | Button |
| 108 | `height: 2` | keep as-is (1-2px decorative lines are fine) | Active indicator |
| 120 | `fontSize: 9` | `fontSize: 'var(--text-2xs)'` | Label |

- [ ] **Step 2: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/TabBar.tsx
git commit -m "refactor: migrate TabBar to responsive tokens"
```

---

### Task 10: Migrate Forge.tsx layout — equip shrink-to-content, tray flex-1

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

This is the key layout fix that eliminates the wasted space.

- [ ] **Step 1: Remove useGemSize import and usage**

Remove the `useGemSize` import. Remove any `useGemSize` call and its return value destructuring. Remove `columns` and related variables that were passed to ForgeGemTray.

- [ ] **Step 2: Change the action area flex to shrink-to-content**

Find the action area div (around line 538):

Old:
```tsx
<div className="flex-1 overflow-y-auto px-3 py-2" key={activeTab} style={{ animation: 'fade-in 0.2s ease-out' }}>
```

New:
```tsx
<div className="overflow-y-auto" key={activeTab} style={{ flex: '0 0 auto', padding: 'var(--gap-sm) var(--gap-md)', animation: 'fade-in 0.2s ease-out' }}>
```

- [ ] **Step 3: Make ForgeGemTray flex-1**

Find the ForgeGemTray component (around line 587). Wrap it or add a style to make it grow:

Add `style={{ flex: 1, minHeight: 0 }}` to the ForgeGemTray container or to the ForgeGemTray component itself if it accepts a style/className prop. If it doesn't, wrap it:

```tsx
<div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
  <ForgeGemTray ... />
</div>
```

- [ ] **Step 4: Replace remaining hardcoded spacing in Forge.tsx**

Replace any inline px padding/gap values with token references.

- [ ] **Step 5: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "refactor: Forge layout — equip shrink-to-content, tray flex-1"
```

---

### Task 11: Migrate ItemMiniPreview to tokens

**Files:**
- Modify: `packages/client/src/components/ItemMiniPreview.tsx`

Note: ItemMiniPreview was removed from the Forge equip view in the side-by-side change, but it may still be imported elsewhere. Check if it's still used. If no callers remain, delete it. If it's still used, migrate it.

- [ ] **Step 1: Check for remaining callers**

Run: `grep -rn "ItemMiniPreview" packages/client/src/ --include="*.tsx" --include="*.ts"`

If no callers: delete `ItemMiniPreview.tsx` and skip to commit.
If callers exist: proceed with migration below.

- [ ] **Step 2: Replace hardcoded values (if file is kept)**

| Approx Line | Old | New |
|-------------|-----|-----|
| 28 | `height: 36` | `height: 'var(--tabbar-h)'` (similar scale) |
| 38 | `padding: '0 10px'` | `padding: '0 var(--gap-md)'` |
| 58 | `fontSize: 14` | `fontSize: 'var(--text-md)'` |
| 62 | `fontSize: 11` | `fontSize: 'var(--text-xs)'` |
| 81 | `fontSize: 8` | `fontSize: 'var(--text-2xs)'` |
| 100 | `fontSize: 8` | `fontSize: 'var(--text-2xs)'` |
| 115 | `fontSize: 10` | `fontSize: 'var(--text-xs)'` |

- [ ] **Step 3: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/ItemMiniPreview.tsx
git commit -m "refactor: migrate or remove ItemMiniPreview"
```

---

### Task 11b: Confirm HapticButton and Modal need no changes

**Files:**
- Check: `packages/client/src/components/HapticButton.tsx`
- Check: `packages/client/src/components/Modal.tsx`

The spec lists these for migration, but codebase analysis shows they use Tailwind classes (`px-3 py-1.5`, `max-w-md`, `p-5`) with no hardcoded inline px values. Tailwind spacing utilities are acceptable — they scale with Tailwind's theme and don't need token replacement.

- [ ] **Step 1: Verify no hardcoded inline px values**

Run: `grep -n "fontSize:\|width:\|height:\|padding:\|gap:" packages/client/src/components/HapticButton.tsx packages/client/src/components/Modal.tsx`

Expected: No matches for hardcoded numeric px values in inline styles. If any are found, replace with appropriate `--text-*`, `--gap-*` tokens and commit.

- [ ] **Step 2: If changes needed, verify build and commit**

Only if Step 1 finds values to replace.

---

## Chunk 4: Screen Migrations — Draft, Duel, MainMenu

### Task 12: Migrate Draft.tsx to tokens + remove useGemSize

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx`

- [ ] **Step 1: Remove useGemSize import and usage**

Remove the `useGemSize` import. Remove the `containerRef`, `containerWidth` state, and ResizeObserver `useEffect` (around lines 181-189). Remove the `useGemSize` call (around line 202) and all variables derived from it (`gemSizing`, `columns`, etc.).

- [ ] **Step 2: Replace pool grid with auto-fill + token**

Find the pool grid container. Replace:

Old:
```tsx
gridTemplateColumns: `repeat(${gemSizing.columns}, minmax(0, 1fr))`,
gap: 4,
```

New:
```tsx
gridTemplateColumns: 'repeat(auto-fill, minmax(var(--gem-size), 1fr))',
gap: 'var(--gap-md)',
```

- [ ] **Step 3: Replace pool container padding**

Old: `padding: 6`
New: `padding: 'var(--gap-sm)'`

- [ ] **Step 4: Replace timer bar height**

Old (around line 595): `height: 32`
New: `height: 'clamp(28px, var(--frame-h, 812px) * 0.04, 36px)'` or define as inline clamp since this is a one-off.

- [ ] **Step 5: Update GemCard calls — remove size props**

GemCard calls in the pool grid should already have size props removed (from Task 7). Verify no `gemSize` etc. props remain.

- [ ] **Step 6: Replace StockpileZone spacing**

If StockpileZone is inline in Draft.tsx, replace its hardcoded values:
- `margin: '5px 7px 0'` → `margin: 'var(--gap-sm) var(--gap-sm) 0'`
- `gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))'` → `gridTemplateColumns: 'repeat(auto-fill, minmax(var(--gem-size), 1fr))'`
- `gap: 3` → `gap: 'var(--gap-sm)'`

- [ ] **Step 7: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/pages/Draft.tsx
git commit -m "refactor: migrate Draft to responsive tokens, remove useGemSize"
```

---

### Task 13: Migrate Duel.tsx + DuelRenderer.tsx

**Files:**
- Modify: `packages/client/src/pages/Duel.tsx`
- Modify: `packages/client/src/components/DuelRenderer.tsx`

This is the most complex migration due to the PixiJS canvas.

- [ ] **Step 1: Update DuelRenderer canvas container**

In `DuelRenderer.tsx`, find where the Pixi Application is created (around the init/mount logic). The canvas container currently has fixed `width: STAGE_WIDTH, height: STAGE_HEIGHT` inline style.

Replace the container's inline style:
Old: `width: STAGE_WIDTH, height: STAGE_HEIGHT` (or similar fixed dimensions)
New: `width: '100%', aspectRatio: '15 / 8'`

- [ ] **Step 2: Add ResizeObserver for Pixi stage scaling in DuelRenderer**

After the Pixi Application is created, add a ResizeObserver on the canvas container. The RO fires immediately on `.observe()`, so no separate initial sizing call is needed — the first callback sets the correct dimensions before any meaningful rendering occurs.

```tsx
const ro = new ResizeObserver(([entry]) => {
  const { width } = entry.contentRect;
  if (width === 0) return; // container not visible yet
  const height = width / (15 / 8); // maintain aspect ratio
  app.renderer.resize(width, height);
  // Scale the stage so logical coordinates (600x320) map to physical pixels
  app.stage.scale.set(width / STAGE_WIDTH);
});
ro.observe(containerEl);
```

Add `ro.disconnect()` to the existing cleanup/destroy function — find where `app.destroy()` is called (the component's unmount path) and add `ro.disconnect()` immediately before it.

Keep `STAGE_WIDTH`, `STAGE_HEIGHT`, `P0_X`, `P1_X`, `GLADIATOR_Y` as logical coordinate constants — they remain unchanged. The stage scale handles physical sizing.

- [ ] **Step 3: Update Duel.tsx layout**

Replace the canvas container's `minHeight: 280` with `flex-shrink: 0` (the aspect-ratio CSS handles sizing).

Replace EventLog `maxHeight: '120px'` or similar → remove maxHeight, let flex-1 handle it:
```tsx
<div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
  <EventLog ... /> {/* Remove maxHeight prop */}
</div>
```

- [ ] **Step 4: Replace hardcoded spacing/text in Duel.tsx**

Audit all inline styles in Duel.tsx. Specific known replacements:

- HP bar `height: 3` → keep as-is (decorative, 3px bar)
- `minHeight: 280` on canvas container → remove (aspect-ratio handles it)
- `maxHeight: '32'` or similar on log container → remove (flex handles it)
- `gap: 3` (Tailwind class) → keep as-is (Tailwind utilities are acceptable)
- Any inline `fontSize` px values → `var(--text-xs)` / `var(--text-sm)` as appropriate
- Any inline `padding` / `gap` px values → `var(--gap-sm)` / `var(--gap-md)` as appropriate

**Boundary rule:** Tailwind spacing utilities (`gap-3`, `px-6`, `p-2`) are acceptable and don't need token replacement. Only replace hardcoded px values in inline `style={{}}` attributes.

- [ ] **Step 5: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/Duel.tsx packages/client/src/components/DuelRenderer.tsx
git commit -m "refactor: migrate Duel + DuelRenderer to responsive tokens with stage scaling"
```

---

### Task 14: Migrate MainMenu.tsx to tokens

**Files:**
- Modify: `packages/client/src/pages/MainMenu.tsx`

- [ ] **Step 1: Replace hardcoded values**

| Approx Line | Old | New | Context |
|-------------|-----|-----|---------|
| 9 | `gap-10` | keep (Tailwind, but could use `gap: 'var(--gap-lg)'` if inline) | Main layout |
| 15 | `width: 300, height: 200` | `width: '80%', maxWidth: 300, height: 200` | Glow backdrop (decorative, keep mostly fixed) |

MainMenu uses mostly Tailwind classes (`text-6xl`, `max-w-xs`, `gap-3`, `px-6`, `py-4`). **Boundary rule:** Tailwind spacing utilities are acceptable — they scale with Tailwind's theme and don't need token replacement. Only replace hardcoded px values in inline `style={{}}` attributes.

- [ ] **Step 2: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/MainMenu.tsx
git commit -m "refactor: migrate MainMenu inline px values to responsive tokens"
```

---

## Chunk 5: Cleanup + Documentation

### Task 15: Delete useGemSize hook and tests

**Files:**
- Delete: `packages/client/src/hooks/useGemSize.ts`
- Delete: `packages/client/src/hooks/useGemSize.test.ts`

- [ ] **Step 1: Verify no remaining imports**

Run: `grep -rn "useGemSize" packages/client/src/ --include="*.tsx" --include="*.ts"`
Expected: No results (all callers removed in previous tasks)

- [ ] **Step 2: Delete files**

```bash
rm packages/client/src/hooks/useGemSize.ts packages/client/src/hooks/useGemSize.test.ts
```

- [ ] **Step 3: Verify build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 4: Commit**

```bash
git add -u packages/client/src/hooks/useGemSize.ts packages/client/src/hooks/useGemSize.test.ts
git commit -m "chore: remove useGemSize hook — replaced by CSS responsive tokens"
```

---

### Task 16: Update project memory

**Files:**
- Create: `~/.claude/projects/c--Projects-Alloy/memory/project_responsive_system.md`
- Modify: `~/.claude/projects/c--Projects-Alloy/memory/MEMORY.md`

- [ ] **Step 1: Create responsive system memory file**

Write to `project_responsive_system.md`:

```markdown
---
name: responsive-token-system
description: How the game UI handles responsive sizing — token vocabulary, layout patterns, and how to build new screens
type: project
---

## Responsive Token System

All UI sizing derives from `--frame-h` (set by ResizeObserver in AppShell on `.app-frame`).

### Token Vocabulary (defined in index.css)

**Sizing:** `--socket-size` (36-56px), `--gem-size` (56-104px), `--gem-size-sm` (40-72px), `--icon-md` (16-24px)
**Spacing:** `--gap-xs` (2-4px), `--gap-sm` (4-8px), `--gap-md` (6-14px), `--gap-lg` (10-20px)
**Text:** `--text-2xs` (7-10px), `--text-xs` (9-13px), `--text-sm` (11-15px), `--text-md` (14-18px), `--text-lg` (18-26px)
**Derived:** `--gem-radius`, `--gem-radius-sm`, `--socket-radius`, `--tabbar-h`

### Layout Pattern: Screen Shell

Every screen: outer `flex h-full flex-col`. Header `flex-shrink: 0`. Only give `flex: 1` to sections whose content can grow. Gem tray typically gets `flex: 1`.

### How to Build a New Screen

1. Screen Shell pattern (flex col, header shrink-0, content flex varies, tray flex-1)
2. `--text-*` for all font sizes, never raw px
3. `--gap-*` for all spacing, never raw px
4. `--gem-size` / `--socket-size` for interactive elements
5. `auto-fill` grid for gem collections: `repeat(auto-fill, minmax(var(--gem-size), 1fr))`
6. Never hardcode px values — define a token if needed
7. Test at 667px, 812px, 932px frame heights

**Why:** Established March 2026 to eliminate wasted vertical space and create consistent sizing across all screens. See spec: `docs/superpowers/specs/2026-03-31-responsive-token-system-design.md`

**How to apply:** Reference these tokens in every new component and screen. Never use hardcoded pixel values for sizing, spacing, or typography.
```

- [ ] **Step 2: Add entry to MEMORY.md**

Add under the Project section:
```
- [project_responsive_system.md](project_responsive_system.md) — Responsive token system: token vocabulary, layout patterns, and how to build new screens
```

- [ ] **Step 3: Commit memory update** (no git commit needed for memory files)

---

### Task 17: Final verification — full build + visual check

- [ ] **Step 1: Full build**

Run: `cd packages/client && npx vite build --mode development 2>&1 | tail -5`
Expected: `✓ built in Xs`, no new errors

- [ ] **Step 2: Run existing tests**

Run: `cd packages/client && npx vitest run 2>&1 | tail -20`
Expected: All existing tests pass (some pre-existing failures may remain)

- [ ] **Step 3: Visual verification at 3 frame heights**

Start dev server: `cd packages/client && npx vite dev`

Check at these heights (use browser DevTools device toolbar):
- 375×667 (iPhone SE) — verify min sizes, no overflow
- 390×812 (iPhone 14) — verify standard sizing
- 430×932 (iPhone 15 Pro Max) — verify max sizes, space filled

Verification checklist:
- [ ] No wasted vertical space on Forge equip screen
- [ ] No wasted vertical space on Draft pool screen
- [ ] Gem tray fills available space on Forge
- [ ] Sockets scale appropriately
- [ ] Text is readable at smallest frame
- [ ] Gem pool grid wraps columns correctly on Draft screen
- [ ] Drag-and-drop works on Forge (socket targets still receive drops)
- [ ] Duel canvas scales without distortion

- [ ] **Step 4: Commit any visual fixes**

If adjustments are needed (token values, layout tweaks), fix and commit individually.
