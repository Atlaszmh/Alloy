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

### Components Reused As-Is

- **`GemCard`** — renders each gem in the grid with PNG art from `getGemArt(affixId)`, rarity border/animations, stat label, tier dots, name band
- **`GemInspectPanel`** — right-side slide-out overlay showing full stat tables, flavor text, rarity multiplier math, tags

### Changes to GemInspectPanel

Add a **recipe section** for compound gems:

```
Made from:
  [Fire Damage] + [Cold Damage]
```

The component receives an optional `recipe?: { component1Name: string; component2Name: string }` prop. When present, it renders a "Made from" section above or below the stat tables. Component names are resolved by the parent page via `registry.findAffix(combo.components[0])`.

Move the **rarity selector tabs** into GemInspectPanel (currently they live in the encyclopedia page body). The panel already has rarity-aware stat math — it just needs the tab UI to let users switch rarities.

### Moved Utilities

`formatCompoundStat()` and `getStatColorClass()` move from `RecipeBook.tsx` into a shared location (either inline in GemInspectPanel or a small utility file) for use in compound stat display.

## Data Flow

1. **Data source:** `useMatchStore.getState().getRegistry()` — provides `getAllAffixes()` and `getAllCombinations()`, unchanged
2. **Local state:** `activeTab` (FilterTab), `search` (string), `selectedRarity` (GemRarity), `selectedId` (string | null)
3. **Filtering:** Same `useMemo` pipeline as current encyclopedia — filter by category/compound tab, then by search text
4. **Grid rendering:** Filtered entries map to `GemCard` components. Each gets `statLabel` computed from tier 1 base stats + selected rarity multiplier
5. **Selection:** Clicking a GemCard sets `selectedId`, opens `GemInspectPanel` as overlay. For compounds, parent resolves `combo.components` via `registry.findAffix()` and passes recipe prop
6. **Art pipeline:** `GemCard` calls `getGemArt(affixId)` internally — same PNGs from `/assets/gems/{style}/`. Change once, propagates everywhere

No new stores, no engine changes, no new data fetching.

## Deletions

### Files Deleted

- `packages/client/src/pages/Collection.tsx`
- `packages/client/src/pages/RecipeBook.tsx`
- `packages/client/src/features/meta/components/RecipeEntry.tsx` (and parent dir if empty)

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
| RecipeBook | `formatCompoundStat()` utility | Moved to shared utility or GemInspectPanel |
| RecipeBook | Element color coding for compound stats | `getStatColorClass()` moved alongside |
| RecipeBook | Tag-based filtering | Search bar handles text; tag filter tabs handle categories |

Nothing is lost — all unique information has a home.

## Non-Goals

- No changes to the engine package
- No new game data or balance changes
- No changes to GemCard's visual design (reused as-is)
- No changes to the art registry or asset pipeline
- No recipe discovery/unlock system (all recipes shown openly, matching current RecipeBook behavior)
