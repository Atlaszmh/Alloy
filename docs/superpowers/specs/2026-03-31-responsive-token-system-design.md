# Responsive Token System Design

**Date:** 2026-03-31
**Status:** Draft
**Scope:** All game screens, all UI components, foundational design system

## Problem

The game UI wastes significant screen real estate because components use hardcoded pixel sizes inside flexible containers. The forge screen equip area is `flex-1` but its content (socket grid at 48px fixed, gem tray at 120px minHeight) only fills ~45% of the available space. The same pattern exists across Draft, Forge, and Duel screens.

Root causes:
1. Socket grids and gem cards use fixed pixel dimensions that don't adapt to available space
2. Flex containers allocate space to sections that can't use it (equip area gets `flex-1` but nothing inside grows)
3. Gem sizing logic (`useGemSize` hook) only adapts to pool count and container width, ignoring vertical budget
4. No shared sizing vocabulary — every component independently hardcodes px values for dimensions, spacing, and text

## Goals

- Eliminate wasted vertical space across all game screens
- Establish a single, consistent sizing system that scales with frame height
- Make it trivial for future screens/components to "do the right thing" by default
- Remove all per-component sizing logic (useGemSize, per-component ResizeObservers)
- Replace all hardcoded pixel values with token references

## Non-Goals

- Changing the 9:16 aspect ratio frame or the aspect-ratio media query approach
- Adding traditional responsive breakpoints (sm/md/lg) — the frame constraint makes these unnecessary
- Redesigning individual screen layouts beyond what's needed for space utilization
- Changing the visual design language (colors, borders, gradients, animations)

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Space strategy | Grow sockets + gem tray | Both areas expand proportionally to fill available space, with max-size caps |
| Sizing mechanism | Hybrid: CSS tokens + flex layout | CSS custom properties (from `--frame-h`) for component sizing; flex/grid for section-level space distribution |
| Migration scope | Full replacement | All screens, remove useGemSize hook, no dual systems coexisting |
| Socket size range | 36px → 56px (conservative) | Sockets are secondary UI — don't need to dominate |
| Gem size range | 56px → 104px (generous) | Gems are the primary interaction with art to display — give them space |

## Architecture

### 1. The Frame Height Variable

A single `ResizeObserver` on `AppShell`'s `.app-frame` element measures the frame height and sets it as a CSS custom property:

```tsx
// AppShell.tsx
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

This is the **single source of truth** for all responsive sizing. Every token derives from `--frame-h` via `clamp()`.

### 2. Sizing Tokens

Defined in `index.css` within the `@theme` block or as standalone custom properties. All use the pattern:

```css
--token: clamp(<min>, calc(var(--frame-h) * <scale>), <max>);
```

#### Component Sizing

| Token | Scale Factor | Min | @667px | @812px | @932px | Max | Purpose |
|-------|-------------|-----|--------|--------|--------|-----|---------|
| `--socket-size` | 0.055 | 36px | 37px | 45px | 51px | 56px | Forge socket slots |
| `--gem-size` | 0.095 | 56px | 63px | 77px | 89px | 104px | Gem cards in stockpile/tray/pool |
| `--gem-size-sm` | 0.065 | 40px | 43px | 53px | 61px | 72px | Gem chips, mini previews, compact displays |
| `--icon-md` | 0.025 | 16px | 17px | 20px | 23px | 24px | Icons inside sockets and gems |

#### Spacing

| Token | Scale Factor | Min | @812px | Max | Purpose |
|-------|-------------|-----|--------|-----|---------|
| `--gap-xs` | 0.004 | 2px | 3px | 4px | Tight spacing (within components) |
| `--gap-sm` | 0.007 | 4px | 6px | 8px | Component internal spacing |
| `--gap-md` | 0.012 | 6px | 10px | 14px | Between sibling components |
| `--gap-lg` | 0.02 | 10px | 16px | 20px | Section-level spacing |

#### Typography

| Token | Scale Factor | Min | @812px | Max | Purpose |
|-------|-------------|-----|--------|-----|---------|
| `--text-2xs` | 0.01 | 7px | 8px | 10px | Socket affix labels, tier dots |
| `--text-xs` | 0.013 | 9px | 11px | 13px | Gem stats, secondary info, tab bar labels |
| `--text-sm` | 0.016 | 11px | 13px | 15px | Gem names, item bonuses, body text |
| `--text-md` | 0.02 | 14px | 16px | 18px | Item names, section headers |
| `--text-lg` | 0.028 | 18px | 23px | 26px | Phase titles, prominent UI |

#### Derived Tokens

Some components need sizes derived from other tokens:

```css
/* Gem card border radius scales with gem size */
--gem-radius: calc(var(--gem-size) * 0.16);
--gem-radius-sm: calc(var(--gem-size-sm) * 0.16);

/* Socket border radius */
--socket-radius: calc(var(--socket-size) * 0.17);

/* TabBar height */
--tabbar-h: clamp(40px, calc(var(--frame-h) * 0.055), 52px);

/* Battle canvas maintains aspect ratio, no fixed px */
/* Uses width: 100%; aspect-ratio: 15/8; on the canvas container */
```

### 3. Layout Patterns

#### Pattern A: Screen Shell

Every game screen follows this vertical flex structure:

```
┌──────────────────────────┐
│  Header   (flex-shrink:0)│  Phase info, timer, stats
├──────────────────────────┤
│                          │
│  Content  (flex: varies) │  Main interaction area
│                          │
├──────────────────────────┤
│  Tray     (flex: 1)      │  Gem stockpile, controls
├──────────────────────────┤
│  TabBar   (flex-shrink:0)│  Navigation (height: --tabbar-h)
└──────────────────────────┘
```

**Critical rule:** A section only gets `flex: 1` if its content can actually grow to fill the space. If content has a natural height, use `flex: 0 0 auto`.

Screen-specific flex assignments:

| Screen | Header | Content | Tray/Bottom |
|--------|--------|---------|-------------|
| **Forge (equip)** | shrink-0 | `flex: 0 0 auto` (items shrink to content) | `flex: 1` (gem tray fills remainder) |
| **Forge (combine)** | shrink-0 | `flex: 0 0 auto` (workbench shrink to content) | `flex: 1` (gem tray fills remainder) |
| **Draft** | shrink-0 (opponent zone) | `flex: 1` (gem pool grows) | shrink-0 (player drop zone) |
| **Duel** | shrink-0 (opponent HP + playback controls) | shrink-0 (canvas container, see Duel note) | `flex: 1` (event log grows), shrink-0 (player HP + post-duel breakdown) |

**Duel screen note:** The Duel screen has 5 vertical sections (opponent HP, playback controls, canvas+log, player HP, post-duel breakdown) rather than the strict 3-section model. It maps to the Screen Shell by treating the canvas wrapper + event log as the "Content" zone. The PixiJS canvas (`DuelRenderer`) uses a fixed internal stage resolution (600x320 with hardcoded sprite coordinates). The **canvas container** gets `width: 100%; aspect-ratio: 15/8` and the Pixi `Application` is resized via `app.renderer.resize()` on the container's ResizeObserver, with a uniform scale factor applied to the stage. This is a more involved migration than pure CSS — see the Components table for `DuelRenderer.tsx` details.
| **MainMenu** | n/a | `flex: 1` with centered content | n/a |

#### Pattern B: Responsive Grid

Collections of gems (stockpile, tray, pool) use CSS Grid with `auto-fill`:

```css
.gem-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--gem-size), 1fr));
  gap: var(--gap-md);
}
```

No JS column count calculation needed. CSS `auto-fill` determines columns from available width and gem token size. More space = gems grow toward their max, then wrap.

**Socket grids** stay explicit since they have a fixed slot count:

```css
.socket-grid {
  display: grid;
  grid-template-columns: repeat(<cols>, var(--socket-size));
  grid-template-rows: repeat(2, var(--socket-size));
  gap: var(--gap-sm);
}
```

Where `<cols>` = `Math.ceil(slots.length / 2)` (computed in React, not CSS).

#### Pattern C: Component Token Usage

Components reference tokens instead of hardcoded values. Examples:

```css
/* GemCard */
.gem-card {
  width: var(--gem-size);
  height: var(--gem-size);
  border-radius: var(--gem-radius);
}
.gem-card .name {
  font-size: var(--text-xs);
  max-width: calc(var(--gem-size) + var(--gap-lg));
}
.gem-card .stat {
  font-size: var(--text-2xs);
}

/* Socket */
.forge-socket {
  width: var(--socket-size);
  height: var(--socket-size);
  border-radius: var(--socket-radius);
}
.forge-socket .affix-label {
  font-size: var(--text-2xs);
}

/* ForgeHeader */
.forge-header {
  padding: var(--gap-sm) var(--gap-md);
  font-size: var(--text-xs);
}
.forge-header .phase-title {
  font-size: var(--text-md);
}
```

### 4. Migration Scope

#### Infrastructure (new/modified)

| File | Change |
|------|--------|
| `index.css` | Add all token definitions as `clamp()` custom properties |
| `AppShell.tsx` | Add ResizeObserver that sets `--frame-h` on `.app-frame` |

#### Components (migrate to tokens)

| File | What Changes |
|------|-------------|
| `GemCard.tsx` | `width/height/borderRadius/fontSize` → token refs. Remove gemSize prop scaling. |
| `GemChip.tsx` | Icon size → `--gem-size-sm`, padding → `--gap-xs`, text → `--text-xs` |
| `ItemSocketView.tsx` | Socket dimensions → `--socket-size`, grid gap → `--gap-sm`, text → `--text-*` |
| `ForgeGemTray.tsx` | Grid → `auto-fill` + `--gem-size`. Remove ResizeObserver and column calculation. |
| `ForgeHeader.tsx` | Font sizes → `--text-*`, padding → `--gap-*`, row heights → token-based |
| `CombineWorkbench.tsx` | Slot sizes → tokens, spacing → `--gap-*` |
| `TabBar.tsx` | Height → `--tabbar-h`, font sizes → `--text-xs`, icon sizes → `--icon-md` |
| `ItemMiniPreview.tsx` | All sizing → tokens |
| `HapticButton.tsx` | Padding/fontSize → tokens (if using hardcoded px) |
| `Modal.tsx` | Padding/fontSize → tokens |
| `DuelRenderer.tsx` | Canvas container → `width: 100%; aspect-ratio: 15/8` (remove existing inline `width/height` style). Add ResizeObserver that calls `app.renderer.resize()` with new dimensions and applies a uniform scale factor (`newWidth / STAGE_WIDTH`) to the stage container. Internal sprite coordinates (`P0_X`, `P1_X`, `GLADIATOR_Y`, etc.) stay as logical coordinates — the stage scale handles physical sizing. |

#### Screens (migrate to layout patterns)

| File | What Changes |
|------|-------------|
| `Forge.tsx` | Equip section → `flex: 0 0 auto`, tray → `flex: 1`. Remove useGemSize usage. Remove column prop threading. |
| `Draft.tsx` | Pool section → `flex: 1` with token-based gem grid. Remove ResizeObserver and useGemSize. |
| `Duel.tsx` | Layout → 5-section flex with canvas container shrink-0 (aspect-ratio based), event log `flex: 1`. Remove `maxHeight` prop from EventLog (unnecessary with flex layout). Spacing/text → tokens including inline HPBar component. Canvas resizing handled by DuelRenderer (see Components table). |
| `MainMenu.tsx` | Button/spacing sizes → tokens. |

#### Removed

| File | Reason |
|------|--------|
| `useGemSize.ts` | Fully replaced by CSS tokens + `auto-fill` grid. No callers remain. |
| `useGemSize.test.ts` | Tests for removed hook — delete alongside the hook. |

### 5. Token Addition Policy

When building new components or screens:

1. **Check existing tokens first.** The vocabulary above covers most cases.
2. **If a new size is genuinely needed**, add it to `index.css` following the `clamp(var(--frame-h) * <scale>)` pattern.
3. **Never hardcode px values.** If you're typing a raw number for width, height, fontSize, gap, or padding, use a token instead.
4. **Derive from existing tokens when possible.** `calc(var(--gem-size) * 0.5)` is better than a new token for a one-off half-size.

### 6. Testing Strategy

Every screen should be visually verified at three frame heights:

| Label | Frame Height | Represents |
|-------|-------------|------------|
| Short | 667px | iPhone SE / small Android |
| Standard | 812px | iPhone 14 / mid-range |
| Tall | 932px | iPhone 15 Pro Max / large Android |

Verification checklist:
- [ ] No wasted vertical space (content fills the frame)
- [ ] Text is readable at all sizes (min caps prevent illegibility)
- [ ] Touch targets meet 36px minimum at shortest frame
- [ ] Socket grid doesn't overflow its container width when items are side-by-side
- [ ] Gem grid wraps columns correctly at all widths
- [ ] Drag-and-drop still works (socket `data-forge-socket` attributes, hit targets)

## How to Build a New Screen

This checklist applies to every new page or major component added to the game:

1. **Use the Screen Shell pattern.** Outer container: `flex h-full flex-col`. Header gets `flex-shrink: 0`. Identify which section grows (`flex: 1`) and which sections shrink to content (`flex: 0 0 auto`). Only give `flex: 1` to sections whose content can actually grow.

2. **Reference `--text-*` for all font sizes.** Never write `fontSize: 16` — use `var(--text-md)`. The scale is: `--text-2xs` (tiny labels) → `--text-xs` (secondary) → `--text-sm` (body) → `--text-md` (headings) → `--text-lg` (phase titles).

3. **Reference `--gap-*` for all spacing.** Never write `gap: 8` or `padding: '4px 6px'`. Use `var(--gap-xs)` through `var(--gap-lg)`.

4. **Use `--gem-size` / `--socket-size` for interactive elements.** For collections, use `auto-fill` grid with the token as the minmax floor.

5. **Use `auto-fill` grid for dynamic collections.** `grid-template-columns: repeat(auto-fill, minmax(var(--gem-size), 1fr))`. No JS column calculation needed.

6. **Never hardcode px values.** If you need a new size that doesn't fit existing tokens, define a new token in `index.css` using the `clamp(min, calc(var(--frame-h) * scale), max)` pattern.

7. **Test at 667px, 812px, and 932px frame heights.** Verify no dead space, readable text, and functional touch targets.
