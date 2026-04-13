# Gem Description Unification Design

**Date:** 2026-04-13
**Status:** Approved
**Scope:** Engine, Client, Tools

---

## Problem

Gem descriptions exist in two disconnected places with no shared source of truth:

1. **`affixes.json` / `combinations.json`** — short one-liner `description` fields used by the game client. `combinations.json` has no description field at all.
2. **`packages/tools/src/utils/data-loader.ts`** — long flavorful descriptions generated in code by `generateBaseAffixDescription()` and `generateCompoundDescription()`, used only by the balance tool.

The tool descriptions are accurate and useful but isolated. The client shows only a terse one-liner. Players have no way to understand what a gem actually does mechanically without guessing or testing.

---

## Goals

- Single source of truth for all gem descriptions — data files only, no generated text
- Three distinct description fields per gem, each serving a specific purpose
- Client surfaces descriptions at two levels: at-a-glance (card) and on-demand (inspect + encyclopedia)
- Balance tool reads from engine data directly, generation functions deleted

---

## Data Model

### New Fields

All three fields are added to both base affixes and compound affixes:

| Field | Purpose | Length | Existing? |
|---|---|---|---|
| `description` | Brief one-liner shown on gem cards | 1 sentence | Yes (base only) |
| `weaponFlavorText` | Flavor + mechanical explanation for weapon use | 2–4 sentences | No |
| `armorFlavorText` | Flavor + mechanical explanation for armor use | 2–4 sentences | No |

### Engine Type Changes

**`packages/engine/src/types/affix.ts`** — `AffixDef`:
```ts
export interface AffixDef {
  id: string
  name: string
  description: string        // existing — brief card text
  weaponFlavorText: string   // new
  armorFlavorText: string    // new
  category: AffixCategory
  tags: AffixTag[]
  tiers: Record<AffixTier, AffixTierData>
}
```

**`packages/engine/src/types/combination.ts`** — `CompoundAffixDef`:
```ts
export interface CompoundAffixDef {
  id: string
  name: string
  description: string        // new — combinations.json currently has none
  weaponFlavorText: string   // new
  armorFlavorText: string    // new
  components: [string, string]
  fluxCost: number
  slotCost: number
  weaponEffect: StatModifier[]
  armorEffect: StatModifier[]
  tags: AffixTag[]
}
```

### Schema Changes

**`packages/engine/src/data/schemas.ts`** — `AffixesSchema` and `CombinationsSchema` updated to require `description`, `weaponFlavorText`, and `armorFlavorText` on every entry.

### Data Migration

**`affixes.json`** (32 entries): Add `weaponFlavorText` and `armorFlavorText` to each entry. Content migrated and cleaned from the tool's `generateBaseAffixDescription()`. The weapon and armor sections already exist in that function — they map directly to the two new fields.

**`combinations.json`** (28 entries): Add all three fields. Content migrated from `generateCompoundDescription()`. Brief `description` written fresh (one sentence each — these don't currently exist anywhere).

Descriptions are written as clean prose without emoji headers (those were a workaround for having both in one field). The weapon/armor split is now structural, not textual.

---

## Tool Changes

### Deleted

- `generateBaseAffixDescription()` in `packages/tools/src/utils/data-loader.ts`
- `generateCompoundDescription()` in `packages/tools/src/utils/data-loader.ts`

### Updated

**`packages/tools/src/store/types.ts`** — `Affix` type:

```ts
// Replace:
flavorText?: string

// With:
weaponFlavorText?: string
armorFlavorText?: string
```

**`packages/tools/src/utils/data-loader.ts`** — affix mapping reads new fields directly from engine data:

```ts
// Base affixes:
weaponFlavorText: engineAffix.weaponFlavorText,
armorFlavorText: engineAffix.armorFlavorText,

// Compound affixes:
description: compound.description,
weaponFlavorText: compound.weaponFlavorText,
armorFlavorText: compound.armorFlavorText,
```

**`packages/tools/src/components/workbench-editor.tsx`** — the Affixes tab already renders weapon and armor sections. The flavor text fields slot above each respective effect block, replacing the current combined description box.

---

## Client Changes

### Existing: GemCard / GemDetailPanel

No change to the card. `description` continues to be passed and rendered as the brief one-liner. No flavor text on the card itself — it stays compact.

### New: Inspect Panel

Triggered by clicking/long-pressing a gem during **Draft** or **Forge**. Implemented as an overlay or side panel, not a full screen change.

Shows:
- Gem name + icon + rarity
- `description` (brief)
- Contextual flavor section:
  - If viewing in weapon socket context → `weaponFlavorText`
  - If viewing in armor socket context → `armorFlavorText`
  - If context is ambiguous (e.g., pool view) → show both, labeled
- Tier effects for current tier (weapon or armor stat block)
- Close button / tap-outside to dismiss

**Location:** `packages/client/src/components/GemInspectPanel.tsx` (new file)

### New: Gem Encyclopedia

A dedicated full-screen view accessible from the main menu and from the Forge screen.

Layout:
- Filter tabs: All / Offensive / Defensive / Sustain / Utility / Compound
- Gem list (left column) — name, icon, rarity badge
- Detail panel (right column) — full description data for selected gem:
  - `description`
  - **Weapon** section: `weaponFlavorText` + weapon tier stat table (all tiers)
  - **Armor** section: `armorFlavorText` + armor tier stat table (all tiers)
  - Tags + categories

**Location:** `packages/client/src/pages/GemEncyclopedia.tsx` (new file)
**Route:** Added to the React Router config — accessible as a nav destination

---

## Build Order

1. **Engine types** — add fields to `AffixDef` and `CompoundAffixDef`
2. **Schemas** — update Zod validation to require new fields
3. **Data files** — populate `affixes.json` (32 entries) and `combinations.json` (28 entries)
4. **Tool** — delete generators, update type, wire new fields in data-loader and workbench editor
5. **Client: Inspect Panel** — `GemInspectPanel.tsx`, wire into Draft and Forge
6. **Client: Encyclopedia** — `GemEncyclopedia.tsx`, add route and nav entry

Steps 1–4 are backend/data and can be done together. Steps 5–6 are independent client features that can be built in sequence after.

---

## Out of Scope

- Editing descriptions in-game or in the tool (read-only, edit in JSON)
- Localization / i18n (descriptions are English-only for now)
- Discovery / unlock gating on encyclopedia entries
- Animated inspect panel transitions (can be added later)
