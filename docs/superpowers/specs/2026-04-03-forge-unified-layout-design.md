# Forge Screen: Unified Single-Panel Layout

**Date:** 2026-04-03
**Status:** Design approved, pending implementation

## Problem

The current forge screen uses a two-tab layout ("Plan & Combine" / "Equip") that wastes vertical space. Both tabs have large dead zones — the equip tab shows weapon content but the armor side is often empty, and the combine tab is a small workbench floating above a void. Players must context-switch between tabs to combine gems and equip them, despite both actions drawing from the same stockpile.

Screenshots showing the dead space are in the project root (`draft-mobile.png`, `draft-mobile-v2.png`).

## Solution

Merge both tabs into a single scrollable panel. The workbench and stockpile are pinned at the bottom as a fixed action bar; the item panels (weapon + armor) scroll above.

## Layout Structure

```
┌──────────────────────────────┐
│  HEADER (fixed)              │
│  - Title, round pill, timer  │
│  - Flux bar (lightning bolts)│
│  - Stats: HP, DMG, ARM, CRT │
│  - Base stat selectors (R1)  │
├──────────────────────────────┤
│  ITEMS (scrollable)          │
│  ┌────────┐ │ ┌────────┐    │
│  │ WEAPON │ │ │ ARMOR  │    │
│  │ 3x2    │ │ │ 3x2    │    │
│  │ sockets│ │ │ sockets│    │
│  │        │ │ │        │    │
│  │ affix  │ │ │ affix  │    │
│  │ list   │ │ │ list   │    │
│  └────────┘ │ └────────┘    │
│             ↕ scrolls        │
├──────────────────────────────┤
│  WORKBENCH (pinned)          │
│  [?] + [?] ► [?]  COMBINE   │
├──────────────────────────────┤
│  STOCKPILE (pinned)          │
│  [gem] [gem] [gem] ...       │
└──────────────────────────────┘
```

### Fixed Top — Header

Unchanged from the current `ForgeHeader` component. Contains:
- Title ("FORGE PHASE") + round pill (R1/R2/R3) + timer + DONE button
- Flux bar with lightning bolt icons
- Live stats display (HP, DMG, ARM, CRT)
- Base stat selectors (round 1 only)

Uses `flex-shrink: 0` to never compress.

### Scrollable Middle — Items

The existing two-column weapon/armor layout, rendered directly without a tab wrapper:
- Two `ItemSocketView` components side-by-side with `flex: 1` each
- Vertical gradient divider between them (existing)
- Each item shows: name + badge, base item stats, base stat labels, 3x2 socket grid, affix list
- Affix list is kept — will be important for future gems with richer descriptions
- Container uses `overflow-y: auto` with `flex: 1; min-height: 0` to fill available space

### Pinned Bottom — Action Bar

Two sections pinned at the bottom with `flex-shrink: 0`:

**Combination Workbench:**
- Compact single-row layout: `[slot] + [slot] ► [result]  COMBINE  CLEAR`
- All existing CombineWorkbench functionality preserved (drag-to-slot, glow signals, combo validation)
- Separated from stockpile by a subtle `border-bottom: 1px solid var(--color-surface-700)`

**Stockpile:**
- Existing `ForgeGemTray` component, unchanged
- Dynamic gem sizing with ResizeObserver (5 gems per row)
- Staged gems hidden, equipped gems dimmed

## Components Changed

### Forge.tsx (page orchestrator)

**Remove:**
- Tab bar JSX and `activeTab` references
- `activeTab === 'combine' ? ... : ...` conditional rendering
- The wrapping `<div>` that held tab content

**Preserve:**
- The `data-item-card="weapon"` and `data-item-card="armor"` wrapper divs around each `ItemSocketView`. The drag system's `findDropTarget` uses `closest('[data-item-card]')` to determine which item a socket belongs to — these attributes are load-bearing.

**Change:**
- The scrollable middle section renders the two-column item layout directly (no condition)
- Below the scrollable area, add a new pinned section containing CombineWorkbench then ForgeGemTray
- Overall flex structure becomes:

```
flex-col h-full
  ├── ForgeHeader          (flex-shrink: 0)
  ├── Items area           (flex: 1, min-height: 0, overflow-y: auto)
  │   └── flex row: ItemSocketView | divider | ItemSocketView
  ├── CombineWorkbench     (flex-shrink: 0)
  └── ForgeGemTray         (flex-shrink: 0)
```

### forgeStore.ts

**Remove:**
- `activeTab` state property and `setActiveTab` action
- `activeItemTab` state property and `setActiveItemTab` action
- References to both in `initPlan` and `reset` methods

All tab-era state is no longer needed. Tests in `forgeStore.test.ts` that assert on `activeTab` or `activeItemTab` must be updated or removed.

### CombineWorkbench.tsx

**Change:**
- Remove the outer `<section>` with large padding, background border, and box-shadow
- Remove the "COMBINATION WORKBENCH" `<h3>` header (or shrink to a small label)
- Flatten from the current 3-row vertical stack (header → slots → buttons) into a single horizontal row:
  ```
  flex items-center justify-center gap-1.5
    [slot] + [slot] ► [result]   [COMBINE] [CLEAR]
  ```
- Wrap in a simple `div` with `padding: var(--gap-sm) var(--gap-md)` and a top border
- Keep all existing logic: combo slots, glow signals, combine/clear buttons, drop target `data-combo-slot` attributes

The component's interface (props) does not change.

### ForgeHeader.tsx, ItemSocketView.tsx, ForgeGemTray.tsx, GemCard.tsx

**No changes.** These components are reused as-is.

## Drag-and-Drop

The existing pointer-based drag system in `Forge.tsx` continues to work unchanged. Drop targets are identified by `data-combo-slot` (workbench) and `data-forge-socket` (item sockets) attributes, which remain in the same components. The only difference is that both drop target types are now visible simultaneously instead of on separate tabs.

## Responsive Behavior

All existing responsive tokens (`--socket-size`, `--gem-size`, `--gap-sm`, `--gap-md`) continue to scale with `--frame-h`. The pinned bottom section (workbench + stockpile) has a natural height based on content. On very short screens, the items area will have less scroll space, but the pinned bottom is compact enough (~140-160px) to leave adequate room.

## What's NOT Changing

- ForgeHeader (structure, props, behavior)
- ItemSocketView (structure, props, behavior)
- ForgeGemTray (structure, props, behavior)
- GemCard (structure, props, behavior)
- Drag-and-drop system (event handlers, drop target detection)
- Forge confirmation modal
- Flux toast notifications
- Sound effects
- AI forge behavior
- Any engine-side forge logic

## Testing

- Verify the items area scrolls when content exceeds available space (weapon fully socketed + armor fully socketed)
- Verify workbench + stockpile stay pinned at bottom during scroll
- Verify drag from stockpile to workbench slots works (short drag distance)
- Verify drag from stockpile to item sockets works (longer drag, may need scroll)
- Verify combine flow: stage gems → see glow → combine → result appears in stockpile
- Verify no layout overflow on the smallest supported frame height
- Verify existing forge e2e tests still pass
