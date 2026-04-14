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
| `description` | Brief summary shown on gem cards — must mention both weapon and armor effects in plain mechanical terms | 1 sentence | Yes (base only, needs rewrite) |
| `weaponFlavorText` | Flavor + mechanical explanation for weapon use | 2–4 sentences | No |
| `armorFlavorText` | Flavor + mechanical explanation for armor use | 2–4 sentences | No |

**`description` authoring rule:** The one-liner must convey both axes at a glance. Use the pattern `"[weapon effect]; [armor effect]."` For gems with only one active side, just describe that side. Examples:
- `"Adds flat fire damage to every strike; grants fire resistance on armor."` ✓
- `"Adds flat fire damage to every strike."` ✓ (weapon-only gem)
- `"Adds flat fire elemental damage."` ✗ (omits armor — too vague)

Existing `description` strings in `affixes.json` are single-axis and must be rewritten during the data migration step to include both effects where applicable.

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

**`packages/engine/src/data/schemas.ts`** — two updates required:

1. `AffixDefSchema` currently does **not** include a `description` field in its Zod definition (it exists in the type and JSON but was never added to the schema). Add `description: z.string()` alongside the two new fields.
2. Add `weaponFlavorText: z.string()` and `armorFlavorText: z.string()` to both `AffixDefSchema` and `CombinationsSchema`.

> ⚠️ **Atomic commit required:** The schema changes to both `AffixDefSchema` and `CombinationsSchema`, plus all new flavor text fields across all 60 entries (32 `affixes.json` + 28 `combinations.json`), and the 28 new `description` strings for combinations, must all land in a single commit. `AffixDefSchema` currently lacks `description` — adding it is safe because all 32 base affix JSON entries already have that field. The risk is the two new flavor fields (`weaponFlavorText`, `armorFlavorText`): `loadAndValidateData()` will throw until every entry in both files has them. Do not merge the schema change alone.

### Data Migration

**`affixes.json`** (32 entries): Add `weaponFlavorText` and `armorFlavorText` to each entry. Content migrated and cleaned from the tool's `generateBaseAffixDescription()`. The weapon and armor sections already exist in that function — they map directly to the two new fields.

**`combinations.json`** (28 entries): Add all three fields. Content migrated from `generateCompoundDescription()`. Brief `description` written fresh (one sentence each — these don't currently exist anywhere).

Descriptions are written as clean prose without emoji headers (those were a workaround for having both in one field). The weapon/armor split is now structural, not textual.

**One-sided gems:** Some affixes have no effect on one item type (e.g. `armor_rating` has an empty `weaponEffect` array). For these, the corresponding flavor text field (`weaponFlavorText` or `armorFlavorText`) is still required in the JSON but should contain an empty string `""`. The client and tool omit the section entirely when the field is empty — no placeholder text, no "N/A".

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

> `flavorText` is currently declared optional but is never set in `data-loader.ts` and never read in `workbench-editor.tsx` or any other tool component — confirmed zero consumers, safe to drop without a search-and-replace pass.

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

**`packages/tools/src/components/workbench-editor.tsx`** — the Affixes tab currently renders a single combined description box (lines 86–93). That box is **removed**. The effects display is also restructured from its current per-tier grouping (Tier 1 → weapon + armor effects, Tier 2 → weapon + armor effects, …) into a per-axis layout:

1. **Weapon section** — `weaponFlavorText` prose block, then a tier table showing weapon effects for all tiers (Tier 1–4 rows, stat columns)
2. **Armor section** — `armorFlavorText` prose block, then a tier table showing armor effects for all tiers

If a gem has no weapon effect (e.g. `armor_rating`), the Weapon section is omitted entirely. If a gem has no armor effect, the Armor section is omitted. Empty string flavor text also triggers omission — no placeholder text is shown.

---

## Client Changes

### Existing: GemCard / GemDetailPanel

No change to the card. `description` continues to be passed and rendered as the brief one-liner. No flavor text on the card itself — it stays compact.

### New: Inspect Panel

Triggered by a **long-press hold of 500 ms or more** on a gem during **Draft** or **Forge**. `draft-gestures.ts` already has `HOLD_THRESHOLD = 300` which marks any gesture ≥ 300 ms as `'hold'`. A new `INSPECT_THRESHOLD = 500` constant is added alongside it. `classifyGesture()` itself is **not changed** — callers check duration against `INSPECT_THRESHOLD` independently after receiving a `'hold'` result. Gestures in the 300–499 ms range are classified as `'hold'` but do not trigger inspect; they continue to select/toggle the gem (same as a short tap). A gesture ≥ 500 ms opens the inspect panel instead of selecting. In Forge, inspect is accessible from gems in the tray only — tapping an occupied socket slot continues its existing behavior (select/unsocket). Implemented as an overlay or side panel, not a full screen change.

Shows:
- Gem name + icon + rarity
- `description` (brief)
- Contextual flavor section:
  - If viewing in weapon socket context → `weaponFlavorText`
  - If viewing in armor socket context → `armorFlavorText`
  - If context is ambiguous (Draft pool view) → show both, with "On Weapon" / "On Armor" labels
- Tier effects for current tier (weapon or armor stat block)
- Close button / tap-outside to dismiss

**Context signal:** The panel receives a `context: 'weapon' | 'armor' | 'both'` prop. Callers are responsible for passing the right value:
- **Forge:** derives context from which item card (`'weapon'` or `'armor'`) the gem is currently socketed in or being dragged toward. Gems in the forge tray that are not yet socketed use `'both'`, consistent with Draft pool behavior.
- **Draft:** always passes `'both'` — gems in the pool have not been assigned to a socket yet

**Location:** `packages/client/src/components/GemInspectPanel.tsx` (new file)

### New: Gem Encyclopedia

A dedicated full-screen view accessible from the main menu and from the Forge screen.

Layout:
- Filter tabs: All / Offensive / Defensive / Sustain / Utility / Trigger / Compound
- Gem list (left column) — name, icon, rarity badge
- Detail panel (right column) — full description data for selected gem:
  - `description`
  - **Weapon** section: `weaponFlavorText` + weapon tier stat table (all tiers)
  - **Armor** section: `armorFlavorText` + armor tier stat table (all tiers)
  - Tags + categories

**Data source:** The encyclopedia reads from both `registry.getAllAffixes()` (base affixes) and `registry.getAllCombinations()` (compound affixes), merged into a single list. The Compound filter tab shows only `CompoundAffixDef` entries — the `'compound'` label is not an `AffixCategory` value; it is derived from the data source type. The other filter tabs (Offensive, Defensive, Sustain, Utility, Trigger) map directly to `AffixCategory` values on base affixes. Compound affixes have no `category` field and appear only under All and Compound.

**Location:** `packages/client/src/pages/GemEncyclopedia.tsx` (new file)
**Route:** `/gems` — added to the React Router config
**Nav:** Add a **"Gems"** button to `MainMenu.tsx` alongside the existing Recipe Book and Collection buttons. Do not add a tab bar entry — the `TabBar` is reserved for core navigation (Home, Ranks, Settings, Dev). Also accessible via a small "Gem Library" text link or icon button in the Forge header area, right-aligned alongside the Done button.

**Stat table for compounds:** `CompoundAffixDef` has a single flat `weaponEffect: StatModifier[]` and `armorEffect: StatModifier[]` (no tiers). In the encyclopedia detail panel, compounds show a simplified single-row effect table rather than a multi-tier table. The same weapon/armor split and omission rules apply.

If either `weaponFlavorText` or `armorFlavorText` is an empty string for a given gem, that section (flavor text + stat table) is omitted from the detail panel entirely.

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
