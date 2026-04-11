# Gem Blueprint Tool — Design Specification

**Date:** 2026-04-10
**Status:** Approved (brainstorm complete)
**Approach:** New "Gem Workshop" section in `packages/tools/`, D3 radial tree + React workbench

## Overview

A visual blueprint explorer and gem editor for designing, browsing, and testing the gem combination system. Two pages added to the existing tools app under a new "Gem Workshop" nav section:

1. **Blueprint Explorer** — interactive radial D3 graph showing all gems, recipes, and multi-depth chains
2. **Gem Workbench** — CRUD editor for affixes, recipes, and synergies with simulation integration

### Goals

1. Visualize the full gem combination tree as an interactive "skill tree" radial graph
2. Create, edit, and delete affixes, recipes, and synergies through a visual editor
3. Test gem configurations by running simulations directly from the tool
4. Import/export gem data bundles for sharing between devs
5. Ship with a starter expansion pack of 25 new recipes + 8 new synergies

### Non-Goals

- Gem set versioning/diffing (future enhancement)
- Player-facing discovery journal UI (that's a client feature)
- Cross-run Codex integration
- Live PvP testing from the tool

### Data Model Target

This tool targets the **current (pre-refactor) data model**: `AffixDef` (T1-T4), `CompoundAffixDef`, `SynergyDef`. When the gem refactor lands (introducing `GemInstance` with rarity, `RecipeDefinition` with depth, T1-T5), the tool will be updated to match. Depth-2+ chains in the tree visualization are a **visual concept** — the current `CompoundAffixDef.components` stores flat `[affixId, affixId]` pairs, not recursive recipe references. The tree computes depth by scanning which recipes' outputs appear as other recipes' inputs.

---

## 1. Architecture

### Where It Lives

New pages in `packages/tools/` under a separate "Gem Workshop" top-level nav section. The existing "Balance Dashboard" nav section remains untouched. Both sections share the Express backend, Supabase connection, and simulation runner infrastructure.

### Data Flow

```
JSON data files (affixes.json, combinations.json, synergies.json)
       ↓ (load on page mount via API)
Gem Data Store (Zustand — in-memory working copy)
       ↓ (derived)                    ↓ (editable)               ↓ (testable)
D3 Radial Tree                  Workbench Editors           Simulation Runner
(read-only visualization)       (CRUD panels)               (existing infra)
                                      ↓ (save)
                                JSON data files (write back via API)
```

### New Files

**Backend (Express routes):**
- `packages/tools/server/routes/gem-data.ts` — CRUD endpoints for affixes, recipes, synergies
  - `GET /api/gem-data` — load all gem data (affixes, combinations, synergies)
  - `PUT /api/gem-data/affixes/:id` — create/update affix
  - `DELETE /api/gem-data/affixes/:id` — delete affix
  - `PUT /api/gem-data/recipes/:id` — create/update recipe
  - `DELETE /api/gem-data/recipes/:id` — delete recipe
  - `PUT /api/gem-data/synergies/:id` — create/update synergy
  - `DELETE /api/gem-data/synergies/:id` — delete synergy
  - `POST /api/gem-data/export` — bundle all gem data as JSON download
  - `POST /api/gem-data/import` — replace gem data from uploaded JSON bundle

**Frontend (React pages + components):**
- `packages/tools/src/pages/BlueprintExplorerPage.tsx` — radial tree page
- `packages/tools/src/pages/GemWorkbenchPage.tsx` — editor page
- `packages/tools/src/components/gem-workshop/RadialTree.tsx` — D3 radial graph component
- `packages/tools/src/components/gem-workshop/TreeControls.tsx` — filter bar (category, tags, search)
- `packages/tools/src/components/gem-workshop/NodeTooltip.tsx` — hover tooltip for tree nodes
- `packages/tools/src/components/gem-workshop/NodeDetail.tsx` — expanded detail panel on click
- `packages/tools/src/components/gem-workshop/DataBrowser.tsx` — left panel list browser (tabs: Affixes/Recipes/Synergies)
- `packages/tools/src/components/gem-workshop/AffixEditor.tsx` — affix CRUD form
- `packages/tools/src/components/gem-workshop/RecipeEditor.tsx` — recipe CRUD form
- `packages/tools/src/components/gem-workshop/SynergyEditor.tsx` — synergy CRUD form
- `packages/tools/src/components/gem-workshop/CombinePreview.tsx` — drag-two-gems combine preview modal
- `packages/tools/src/components/gem-workshop/SimTestModal.tsx` — quick simulation config + results modal
- `packages/tools/src/stores/gemDataStore.ts` — Zustand store for gem data state

**Dependencies to add:**
- `d3` (d3-hierarchy, d3-selection, d3-zoom, d3-shape, d3-interpolate) — radial tree rendering

---

## 2. Blueprint Explorer — Radial Tree

### Layout

Center-out radial graph using `d3-hierarchy` with polar coordinates.

- **Center:** Virtual root node (hidden), connects to all 33+ base affixes
- **Ring 1 (innermost):** Base gems (affixes), colored by category:
  - Offensive = red
  - Defensive = blue
  - Sustain = green
  - Trigger = yellow
  - Utility = purple
- **Ring 2:** Depth-1 recipe results — edges connect inward to their two parent gems. Node color blends the parent colors.
- **Ring 3:** Depth-2 chains — recipes using a depth-1 result as an ingredient
- **Ring 4 (outermost):** Depth-3 chains (max depth)

### Node Rendering

- Shape: hexagon (gem-shaped), sized proportionally to how many recipes the gem participates in (min 20px, max 50px)
- Label: gem name (truncated if needed), positioned outside the node radially
- Glow: subtle category-colored glow on hover

### Edge Rendering

- Curved arcs (d3 `linkRadial`) connecting recipe outputs to their input components
- Color: dominant element of the output recipe (fire=orange, cold=cyan, etc.), gray for non-elemental
- Width: 1.5px default, 3px when highlighted
- Synergy connections: dashed golden arcs between nodes whose affixes satisfy a synergy requirement

### Interactions

| Action | Behavior |
|--------|----------|
| Scroll | Zoom in/out (d3-zoom) |
| Drag canvas | Pan |
| Hover node | Show tooltip: name, category, tags, tier range, brief stat summary |
| Click node | Open detail panel (right slide-in): full stat table, recipe components, what recipes this feeds into, "Edit in Workbench" button |
| Click edge | Highlight the full chain from base gems → final result, dim everything else. Click canvas to clear. |
| Right-click node | "Explore from here" — re-centers tree with this gem at the origin, showing only its combination paths |

### Filter Controls (top bar)

- Category checkboxes: offensive, defensive, sustain, trigger, utility
- Tag dropdown: filter by elemental type or effect type
- Search input: filter by gem/recipe name
- Toggle: "Show undiscovered as ???" (simulates player discovery view — mutes names and stats of unvisited recipes)

### Graph Data Construction

The tree is computed from the gem data store:

```typescript
interface TreeNode {
  id: string;              // affixId or recipeId
  name: string;
  type: 'affix' | 'recipe';
  category: AffixCategory;
  tags: string[];
  depth: number;           // 0 = base affix, 1+ = recipe result
  parents: string[];       // IDs of input components (empty for base affixes)
  children: string[];      // IDs of recipes this feeds into
}
```

Build the graph by:
1. Create nodes for all affixes (depth 0)
2. For each recipe, create a node (depth 1) with edges to its two component nodes
3. For depth-2+ chains: scan recipes whose components include a depth-1+ recipe result. Assign depth = max(parent depths) + 1.
4. Cap at depth 3.

**Edge case handling:**
- **Orphaned recipe** (component affix was deleted): render as an error node (red border, "missing component: {id}" label). Do not filter out — makes the broken reference visible so the user can fix it.
- **Missing affix reference**: same treatment as orphaned recipe — error node with the missing ID shown.
- **Circular references** (recipe A uses recipe B's output, and B uses A's output): detect during graph construction via visited-set tracking. If a cycle is found, cap the cycle at the first revisit and render the cycle-closing edge as a dashed red line with a warning icon. Log to console.
- **Duplicate component pairs**: validated at save time (Recipe Editor prevents duplicates). If found in loaded data, the first recipe wins and the duplicate is flagged in the Data Browser with a warning badge.

### Performance

Expected ~80-200 nodes. D3 handles this without virtualization. Full re-render on gem data changes (editing an affix or adding a recipe).

---

## 3. Gem Workbench

### Layout

Dual-panel page:
- **Left panel (30% width):** Data browser with tabs
- **Right panel (70% width):** Active editor for selected item
- **Footer toolbar:** Save, Revert, Test in Sim, Export, Import

### Left Panel — Data Browser

Three tabs: **Affixes** | **Recipes** | **Synergies**

Each tab shows:
- Search input (filters by name/id)
- Scrollable list of entries, grouped by category
- Each entry shows: name, category badge, tag chips
- Click entry → loads into right panel editor
- "**+ New**" button at top of each tab
- Drag one affix onto another → opens Combine Preview modal

### Right Panel — Affix Editor

| Field | Control | Notes |
|-------|---------|-------|
| Name | Text input | Required |
| ID | Auto-generated | kebab-case from name, editable |
| Description | Textarea | Player-facing description |
| Category | Dropdown | offensive / defensive / sustain / trigger / utility |
| Tags | Multi-select chips | From existing vocabulary + free-text add |
| Tier 1-4 data | Expandable table | Each tier row has: weapon effects list, armor effects list, value range |
| Per effect | Inline row | Stat dropdown, op dropdown (flat/percent/override), value number input |
| | "+Add Effect" button per tier/slot | |

**Validation:**
- Name and ID required, ID must be unique
- At least one tier must have at least one effect
- Stat keys validated against known DerivedStats fields

### Right Panel — Recipe Editor

| Field | Control | Notes |
|-------|---------|-------|
| Name | Text input | Required |
| ID | Auto-generated | kebab-case from name |
| Component 1 | Dropdown | All affixes + existing recipe results |
| Component 2 | Dropdown | All affixes + existing recipe results |
| Flux cost | Number (default 2) | |
| Slot cost | Number (default 2) | |
| Weapon effects | Effect table | Same as affix editor |
| Armor effects | Effect table | Same as affix editor |
| Tags | Multi-select chips | |
| Chain preview | Mini radial subtree | Read-only: shows what depth-2/3 combinations this recipe enables |

**Validation:**
- Both components required
- Components must be different
- Duplicate recipe check (same components in either order)

### Right Panel — Synergy Editor

| Field | Control | Notes |
|-------|---------|-------|
| Name | Text input | Required |
| ID | Auto-generated | |
| Description | Textarea | |
| Required affixes | Multi-select list | Add/remove from all affixes |
| Condition | Text input (optional) | For count-based thresholds like `any_4_elemental`. Leave blank for simple "all required present" synergies. |
| Bonus effects | Effect table | stat/op/value rows |

### Footer Toolbar

| Button | Action |
|--------|--------|
| **Save** | Writes current gem data store back to JSON files via `PUT` API calls. Shows success/error toast. |
| **Revert** | Discards all unsaved changes, reloads from disk |
| **Test in Sim** | Opens SimTestModal: pick AI tiers (1-5 for each player), match count (1-20), mode (quick/ranked), seed. **Saves current gem data to disk first** (so the simulation runner loads the latest data), then runs simulation via existing `/api/simulations` endpoint. Shows results inline: win rates, top affixes, top recipes used, any balance flags. |
| **Export** | Downloads `gem-data-YYYY-MM-DD.json` bundle containing all affixes, recipes, synergies |
| **Import** | File upload → replaces gem data store (with confirmation dialog) |

### Combine Preview Modal

Triggered by dragging one affix onto another in the data browser:
- Shows both input gems with their stats
- Runs the 3-layer combine logic: checks signature recipe → category combo → generic upgrade
- Displays: which layer matched, the output gem's predicted tier/rarity, stat effects
- "Create Recipe" button if no signature recipe exists for this pair → pre-fills the Recipe Editor

---

## 4. Gem Data Store (Zustand)

```typescript
type WorkbenchTab = 'affixes' | 'recipes' | 'synergies';

interface GemDataState {
  // Data
  affixes: AffixDef[];
  recipes: CompoundAffixDef[];
  synergies: SynergyDef[];
  isDirty: boolean;

  // UI state
  selectedTab: WorkbenchTab;
  selectedItemId: string | null; // ID of the item loaded in the editor
  setSelectedTab: (tab: WorkbenchTab) => void;
  setSelectedItem: (id: string | null) => void;

  // Persistence
  loadFromServer: () => Promise<void>;
  saveToServer: () => Promise<void>;
  revert: () => Promise<void>;

  // Affix CRUD
  upsertAffix: (affix: AffixDef) => void;
  deleteAffix: (id: string) => void;

  // Recipe CRUD
  upsertRecipe: (recipe: CompoundAffixDef) => void;
  deleteRecipe: (id: string) => void;

  // Synergy CRUD
  upsertSynergy: (synergy: SynergyDef) => void;
  deleteSynergy: (id: string) => void;

  // Import/Export
  exportBundle: () => GemDataBundle;
  importBundle: (bundle: GemDataBundle) => void;

  // Computed
  getTreeGraph: () => TreeNode[];
}

interface GemDataBundle {
  exportedAt: string;
  affixes: AffixDef[];
  recipes: CompoundAffixDef[];
  synergies: SynergyDef[];
}
```

---

## 5. API Routes

All routes under `/api/gem-data/`:

```
GET  /                    → { affixes, recipes, synergies }
PUT  /affixes/:id         → upsert affix (body: AffixDef)
DELETE /affixes/:id       → delete affix
PUT  /recipes/:id         → upsert recipe (body: CompoundAffixDef)
DELETE /recipes/:id       → delete recipe
PUT  /synergies/:id       → upsert synergy (body: SynergyDef)
DELETE /synergies/:id     → delete synergy
GET  /export              → returns GemDataBundle JSON (frontend constructs Blob download client-side)
POST /import              → accepts GemDataBundle JSON body, validates all entries against Zod schemas, overwrites files atomically (write all 3 files or none). Returns validation errors if any entry fails.
```

**Implementation:** Routes read/write directly to the JSON data files on disk (`packages/engine/src/data/*.json`). Uses `fs.readFile` / `fs.writeFile` with JSON.parse/stringify. No database needed — the JSON files ARE the source of truth.

**Validation:** All writes (upsert, import) validate against Zod schemas (`packages/engine/src/data/schemas.ts`) before writing to disk. On validation failure, the write is rejected and the error is returned to the client. Import is atomic: if any entry in the bundle fails validation, no files are written.

---

## 6. Navigation Integration

The tools app currently has a single nav bar with pages: Overview, Simulation, Balance, Round Analysis, Distributions, Config Editor, Meta Evolution, Match Inspector.

Add a top-level section switcher:
- **Balance Dashboard** (existing pages)
- **Gem Workshop** (new: Blueprint Explorer, Gem Workbench)

Implementation: add a section toggle at the top of the sidebar (or as a top nav tab row), each section shows its own page list.

---

## 7. New Gem Content — Starter Expansion Pack

### 25 New Signature Recipes

All component names below are exact affix IDs from `affixes.json`. Pairs have been verified to not conflict with existing recipes in `combinations.json`.

#### Elemental Mastery (completing the element grid)

| Recipe | Components | Effect | Tags |
|--------|-----------|--------|------|
| **Chaos Storm** | chaos_damage + lightning_damage | Lightning strikes have 20% chance to apply random elemental DoT | compound, chaos, lightning, elemental |
| **Shadowflame** | shadow_damage + fire_damage | Burns deal shadow damage instead of fire (bypasses fire resist) | compound, shadow, fire, elemental |
| **Permafrost** | cold_damage + armor_rating | Armor scales with cold damage, slowed targets take +15% physical | compound, cold, defensive |
| **Toxic Cloud** | poison_damage + chaos_damage | Poison AoE spreads to phantom target, chaos amplifies stacks | compound, poison, chaos, elemental |
| **Void Grasp** | shadow_damage + slow_on_hit | Slowed targets take +20% shadow damage, slow duration +50% | compound, shadow, control |

#### Conditional/Transformation (Backpack Battles-inspired)

| Recipe | Components | Effect | Tags |
|--------|-----------|--------|------|
| **Executioner** | crit_damage + chance_on_low_hp | Below 30% HP: crits deal 3x instead of 1.5x | compound, crit, conditional |
| **Phoenix Ember** | fire_damage + hp_regen | When HP regen ticks during burn, heal amount doubles | compound, fire, sustain |
| **Vampiric Aura** | lifesteal + barrier | Lifesteal overheal converts to barrier (up to 20% max HP) | compound, sustain, defensive |
| **Glass Shard** | crit_chance + thorns | Thorns damage can crit (using wielder's crit chance) | compound, crit, reactive |
| **Momentum** | attack_speed + flat_physical | Each consecutive hit +5% damage, resets on miss/block | compound, physical, tempo |

#### Layering (Tower defense slow-stacking)

| Recipe | Components | Effect | Tags |
|--------|-----------|--------|------|
| **Electrocute** | lightning_damage + stun_chance | Stunned targets take stored lightning damage on stun end | compound, lightning, control |
| **Mire** | slow_on_hit + poison_damage | Slow % increases per poison stack on target | compound, control, poison |
| **Shatter** | cold_damage + crit_damage | Crits against frozen/slowed targets deal bonus cold burst | compound, cold, crit |
| **Paralysis** | lightning_damage + slow_on_hit | Slowed targets have 15% chance to be stunned on lightning hit | compound, lightning, control |

#### Support-gem style (Path of Exile inspired)

| Recipe | Components | Effect | Tags |
|--------|-----------|--------|------|
| **Amplify** | dot_multiplier + chance_on_hit | On-hit procs at 150% effectiveness but half duration | compound, trigger, multiplier |
| **Echo Strike** | attack_speed + chance_on_crit | Crit triggers repeat the last on-hit proc for free | compound, trigger, crit |
| **Siphon Link** | lifesteal + chance_on_kill | Kills restore 1 charge to all on-cooldown triggers | compound, trigger, sustain |

#### Tank/Sustain (Golem/Guardian inspired)

| Recipe | Components | Effect | Tags |
|--------|-----------|--------|------|
| **Bastion** | fortify + block_chance | Blocked hits grant stacking fortify (+2% DR, up to 20%) | compound, defensive, block_trigger |
| **Martyr** | thorns + flat_hp | Thorns scale with max HP (0.5% of max HP added to thorns) | compound, reactive, defensive |
| **Second Wind** | hp_regen + dodge_chance | Dodges trigger a 3s regen burst (5% max HP over 3s) | compound, sustain, evasion |
| **Unbreakable** | armor_rating + damage_reduction | Below 50% HP, armor doubles | compound, defensive, conditional |

#### Chaos/Utility wildcards (Gemcraft inspired)

| Recipe | Components | Effect | Tags |
|--------|-----------|--------|------|
| **Probability Field** | chaos_damage + dodge_chance | Dodges deal chaos damage back to attacker | compound, chaos, reactive  |
| **Temporal Rift** | initiative + slow_on_hit | First attack slows for 3x duration | compound, utility, control |
| **Entropy** | chaos_damage + dot_multiplier | DoTs on target have 10% chance per tick to spread a random DoT | compound, chaos, dot |
| **Hex** | shadow_damage + chance_on_taking_damage | Taking damage curses attacker: -15% hit chance for 3s | compound, shadow, defensive_trigger |

### 8 New Synergies

The existing `SynergyDef` type uses `requiredAffixes: string[]` (all must be present) and an optional `condition: string` field for count-based or negative thresholds. Synergies that need "N of M" semantics use the `condition` field — the Synergy Editor should expose this as an optional text input.

| Synergy | Required Affixes | Condition | Effect |
|---------|-----------------|-----------|--------|
| **Elemental Overload** | fire_damage, cold_damage, lightning_damage, poison_damage | `any_4_elemental` (4+ of the 6 element affixes) | All elemental damage +30%, -20% physical |
| **Poison Master** | poison_damage, slow_on_hit, dot_multiplier | — | Poison ignores 50% of target poison resist |
| **Thorns Wall** | thorns, block_chance, armor_rating | — | Blocked hits reflect 200% thorns |
| **Momentum Fighter** | attack_speed, flat_physical, crit_chance | — | After 5 consecutive hits: guaranteed crit + 2x attack speed for 2s |
| **Death's Embrace** | chance_on_low_hp, lifesteal, crit_damage | — | Below 30% HP: all attacks lifesteal at 2x rate |
| **Chaos Agent** | chaos_damage, chance_on_hit, chance_on_crit | — | All triggers +25% proc chance, effects randomize |
| **Elemental Chain** | fire_damage, cold_damage, lightning_damage | `any_3_elemental_compound` (3+ elemental compound recipes equipped) | Elemental hits chain to phantom for 30% damage |
| **Sentinel** | fortify, flat_hp, hp_regen, barrier | — | Immune to crits, +50% healing received, -30% attack speed |

### Example Depth-2+ Chains (for tree visualization)

These demonstrate the multi-depth paths the radial tree will visualize:

```
fire_damage + cold_damage → Thermal Shock (depth 1)
  Thermal Shock + crit_damage → Shatter (depth 2)

fire_damage + poison_damage → Blight (depth 1)
  Blight + shadow_damage → Shadowflame (depth 2)

lifesteal + barrier → Vampiric Aura (depth 1)
  Vampiric Aura + crit_damage → Vampiric Fury+ (depth 2)

lightning_damage + slow_on_hit → Paralysis (depth 1)
  Paralysis + poison_damage → Mire+ (depth 2) — total lockdown chain

attack_speed + flat_physical → Momentum (depth 1)
  Momentum + crit_chance → Momentum Fighter synergy unlock path

fortify + block_chance → Bastion (depth 1)
  Bastion + flat_hp → Martyr+ (depth 2) — ultimate tank chain
```

---

## 8. Testing Strategy

### Unit Tests (Vitest)

- `packages/tools/server/routes/gem-data.test.ts` — CRUD route tests (mock fs read/write)
- `packages/tools/src/stores/gemDataStore.test.ts` — store actions, computed tree graph, import/export
- `packages/tools/src/components/gem-workshop/RadialTree.test.ts` — graph data construction from gem data (unit test the data transform, not D3 rendering)

### Manual Testing

- Load Blueprint Explorer with full gem data → verify all 33+ affixes render, all recipes show connections
- Add a new recipe in Workbench → verify tree updates
- Delete an affix → verify dependent recipes flag/remove
- Export → Import round-trip preserves all data
- Test in Sim → simulation runs and returns results with current gem data

### Integration

- Existing engine tests continue to pass (gem data files are the source of truth)
- Simulation runner picks up edited gem data when "Test in Sim" is used

---

## 9. Glossary

| Term | Definition |
|------|-----------|
| Blueprint Explorer | The radial D3 tree visualization page |
| Gem Workbench | The CRUD editor page |
| Gem Workshop | The top-level nav section containing both pages |
| Gem Data Store | Zustand store holding the in-memory working copy of gem data |
| Gem Data Bundle | JSON export containing affixes, recipes, synergies for sharing |
| Signature Recipe | A specific two-gem combination with unique effects (Layer 1) |
| Category Combo | Implicit combination based on affix categories (Layer 2) |
| Generic Upgrade | Fallback combine: keep one gem, sacrifice the other, +1 tier (Layer 3) |
| Recipe Depth | How many chained combinations produced a gem (0=base, max 3) |
| Combine Preview | Modal showing predicted output of combining two gems |
