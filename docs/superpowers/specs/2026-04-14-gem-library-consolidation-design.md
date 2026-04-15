# Gem Library Consolidation — Design Spec

**Date:** 2026-04-14
**Status:** Approved

## Summary

Consolidate three overlapping reference pages (GemEncyclopedia, RecipeBook, Collection) into a single **Gem Library** page at `/gems`. The new layout uses a responsive GemCard grid (matching the forge/duel visual style) with a slide-out GemInspectPanel for details. Recipe ingredients are shown contextually on compound gem detail views. The other two pages and their routes are deleted.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Old routes (`/recipes`, `/collection`) | Delete entirely | Pre-release, no bookmark concerns |
| Gem visuals in listings | Reuse `GemCard` component directly | Single source of art; rarity animations included; visual consistency with gameplay screens |
| Recipe info placement | Show in compound gem's inspect panel | Contextual discovery ("Made from: X + Y") rather than a separate browsing mode |
| Layout approach | Card grid + slide-out inspect panel | Visually rich, reuses existing components, matches in-game experience |

## Architecture

### Page Layout

The consolidated `GemEncyclopedia.tsx` is restructured as:

```
+-----------------------------------------------+
| <- Back          Gem Library                   |
+-----------------------------------------------+
| [All] [Offensive] [Defensive] ... [Compound]  |
+-----------------------------------------------+
| [Search gems...]                               |
+-----------------------------------------------+
|                                                |
|  [GemCard] [GemCard] [GemCard] [GemCard] ...  |
|  [GemCard] [GemCard] [GemCard] [GemCard] ...  |  <- Scrollable grid
|  [GemCard] [GemCard] [GemCard] [GemCard] ...  |
|                                                |
+-----------------------------------------------+

Click a card -> GemInspectPanel slides in from right
```

### Components Reused

- **`GemCard`** — renders each gem in the grid with PNG art from `getGemArt(affixId)`, rarity border/animations, stat label, tier dots, name band. Used as-is, no changes needed.
- **`GemInspectPanel`** — right-side slide-out overlay showing full stat tables, flavor text, rarity multiplier math, tags. Receives targeted additions (see below).

**Note:** The current `GemEncyclopedia.tsx` does NOT use `GemCard` or `GemInspectPanel`. It renders a plain text sidebar list and an inline detail panel with rarity selectors and stat tables built directly in the page. This consolidation **replaces** that inline rendering with the existing components — it is a rewrite of the page's rendering logic, not a layout tweak.

### Changes to GemInspectPanel

**1. Recipe section** for compound gems:

```
Made from:
  [Fire Damage] + [Cold Damage]
```

Add a new top-level prop `recipe?: { component1Name: string; component2Name: string }` to `GemInspectPanelProps` (alongside `gem`, `context`, `onClose`). When present, render a "Made from" section above the stat tables. Component names are resolved by the parent page via `registry.findAffix(combo.components[0])`.

**2. Rarity selector tabs** — move into GemInspectPanel from the encyclopedia page body. The panel currently accepts `rarity` as a fixed field on the `gem` prop. Change approach: add `selectedRarity` and `onRarityChange` props to `GemInspectPanelProps`. The panel renders the rarity tab UI and calls `onRarityChange` when the user switches. The parent page owns the rarity state and passes it down. This keeps the panel stateless for rarity while giving it the selector UI.

### Moved Utilities

`formatCompoundStat()` and `getStatColorClass()` move from `RecipeBook.tsx` into `packages/client/src/shared/utils/compound-stats.ts` — a small utility file. These are pure functions with no component dependencies.

## Data Flow

1. **Data source:** `useMatchStore((s) => s.getRegistry)` — reactive selector (re-renders if registry changes), provides `getAllAffixes()` and `getAllCombinations()`, unchanged
2. **Local state:** `activeTab` (FilterTab), `search` (string), `selectedRarity` (GemRarity), `selectedId` (string | null)
3. **Filtering:** Same `useMemo` pipeline as current encyclopedia — filter by category/compound tab, then by search text
4. **Grid rendering:** Filtered entries map to `GemCard` components. Each card shows tier 1 stats at common rarity (fixed baseline for the grid). The rarity selector lives inside the inspect panel, not the grid.
5. **Selection:** Clicking a GemCard sets `selectedId`, opens `GemInspectPanel` as overlay with `context='both'` (show weapon + armor). For compounds, parent resolves `combo.components` via `registry.findAffix()` and passes recipe prop. The `selectedRarity` state is passed to the panel via `selectedRarity` / `onRarityChange` props.
6. **Art pipeline:** `GemCard` calls `getGemArt(affixId)` internally — same PNGs from `/assets/gems/{style}/`. Change once, propagates everywhere

No new stores, no engine changes, no new data fetching.

## Deletions

### Files Deleted

- `packages/client/src/pages/Collection.tsx`
- `packages/client/src/pages/RecipeBook.tsx`
- `packages/client/src/features/meta/components/RecipeEntry.tsx` (only this file — other components in `features/meta/` are unrelated and must be kept)

### Routes Removed (App.tsx)

- `/collection`
- `/recipes`

### MainMenu.tsx

- Remove "Recipe Book" nav button
- Remove "Collection" nav button
- Keep "Gems" button (route `/gems`, unchanged)

## Unique Info Migration

| Source Page | Unique Info | Destination |
|-------------|-------------|-------------|
| Collection | Base affixes grouped by category | Filter tabs (already exist in encyclopedia) |
| Collection | Expandable tier details (weapon/armor per tier) | GemInspectPanel stat table (already exists) |
| Collection | Search by name/tag | New search bar in Gem Library |
| RecipeBook | Recipe inputs (A + B = compound) | "Made from" section in GemInspectPanel |
| RecipeBook | `formatCompoundStat()` utility | Moved to `shared/utils/compound-stats.ts` |
| RecipeBook | Element color coding for compound stats | `getStatColorClass()` moved alongside |
| RecipeBook | Tag-based filtering | Search bar handles text; tag filter tabs handle categories |

Collection's `CATEGORY_COLORS`, `CATEGORY_LEFT_BORDER`, and `TIER_COLORS` mappings are intentionally **not migrated** — `GemCard` provides its own visual differentiation via element gradients, rarity borders, and tier dots, which is richer and consistent with gameplay screens.

Nothing is lost — all unique information has a home.

## Migration Checks

Before deleting `RecipeBook.tsx`, verify that `formatCompoundStat` is not imported by any other file (it is currently exported). If it is, update those imports to point to the new `compound-stats.ts` utility.

## Non-Goals

- No changes to the engine package
- No new game data or balance changes
- No changes to GemCard's visual design (reused as-is)
- No changes to the art registry or asset pipeline
- No recipe discovery/unlock system (all recipes shown openly, matching current RecipeBook behavior)
