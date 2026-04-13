---
name: Gem Blueprint Tool Design Specification
description: A dual-pane visualization and editing system for designing gems, recipes, and synergies with radial tree browser and interactive workbench
date: 2026-04-10
status: design-approved
---

# Gem Blueprint Tool — Design Specification

## Overview

The **Gem Blueprint Tool** is a specialized web-based design and testing environment for creating, editing, and validating new gems, recipes, and synergies for the Alloy game engine. It serves three primary audiences:

- **Balance/QA Team**: Quick iteration on gem configurations without code changes
- **Backend Developers**: Visual understanding of gem hierarchy, recipe chains, and synergy interactions
- **Game Designers**: Experimentation with new affixes, combinations, and game mechanics

The tool combines a **radial tree browser** for visualization and discovery with a **full-featured workbench editor** for CRUD operations on affixes, recipes, and synergies. All changes are persisted to JSON data files (`affixes.json`, `combinations.json`, `synergies.json`) and validated against the game engine's rules before saving.

---

## Section 1: Architecture & Layout

### Component Hierarchy

```
GemBlueprintApp (root)
├── TwoPane Layout
│   ├── LeftPane: Radial Tree Browser
│   │   ├── D3 SVG Canvas (polar coordinates)
│   │   ├── InteractionController (hover, click, filter, search)
│   │   ├── ZoomController (pan + reset)
│   │   └── LegendPanel (ring layers, colors, synergies)
│   │
│   └── RightPane: Workbench Editor
│       ├── TabPanel (Affixes | Recipes | Synergies)
│       ├── EditorPanel (context-aware form)
│       ├── PreviewPanel (live tree highlight + stats)
│       └── ToolbarFooter (Save | Revert | Test in Sim | Export | Import)
│
└── Zustand Store: GemBlueprintStore
    ├── affixes: Affix[]
    ├── recipes: Recipe[]
    ├── synergies: Synergy[]
    ├── selectedNode: Node | null
    ├── editMode: 'view' | 'create' | 'edit'
    ├── filterState: { depth, rarity, category, searchQuery }
    └── treeState: { zoom, pan, highlightedPath }
```

### Data Flow

1. **Load Phase**: JSON files (`affixes.json`, `combinations.json`, `synergies.json`) → Zustand store
2. **Visualization Phase**: Store state → D3 hierarchy layout → SVG DOM
3. **Interaction Phase**: User hover/click/search → Store updates → Tree re-renders + workbench highlights
4. **Editing Phase**: Workbench form changes → Store mutations → Real-time tree preview
5. **Persistence Phase**: Save action → Validate against engine rules → Write JSON + commit to git
6. **Testing Phase**: Export gem config → Run simulation engine → Display results

### State Management

The **GemBlueprintStore** is a single Zustand store managing:
- All gem data (affixes, recipes, synergies)
- UI state (selected node, edit mode, filters)
- Tree interaction state (zoom level, pan offset, highlighted paths)

**Key Actions**:
- `loadDataFromJSON()`: Initialize store from disk
- `setSelectedNode(node)`: Highlight node + populate workbench
- `updateAffix(id, partial)`: Edit affix (name, description, icon, tags)
- `createRecipe(inputs, output, depth)`: Add new recipe
- `deleteRecipe(id)`: Remove recipe
- `createSynergy(triggers, effect)`: Add new synergy
- `filterByDepth(depth)`: Toggle recipe depth visibility
- `searchByName(query)`: Fuzzy search affixes + recipes
- `saveToJSON()`: Persist store state to disk
- `testInSimulation()`: Export gem config and run engine

---

## Section 2: Radial Tree Browser

### Visual Layout (Polar Coordinates)

The tree is rendered using **D3's radial/polar hierarchy layout** with 4 concentric rings:

```
Ring 0 (center):       [Base Affixes] — 33 root nodes
                       (elemental, physical, utility, transmute, etc.)

Ring 1 (depth 1):      [Signature Recipes] — depth-1 combinations
                       (tier 2 → tier 3 recipes only)

Ring 2 (depth 2):      [Category Combos] — depth-2 chains
                       (tier 3 → tier 4, category-restricted)

Ring 3 (depth 3):      [Generic Upgrades] — depth-3 chains
                       (tier 4 → tier 5, cross-category allowed)
```

**Node sizes** scale with **affinity/weight** (how many synergies reference the node).
**Node colors** encode **rarity** (common → rare gradient).
**Edge thickness** represents **recipe output tier**.

### Interactions

#### Hover Effects
- Highlight node + label
- Fade out unrelated nodes (alpha 0.2)
- Show tooltip: affix name, rarity, tier, recipe count
- Highlight all incoming edges (recipes that produce this affix)

#### Click Actions
- Select node → populate workbench editor on right pane
- Toggle recipe chain expansion (show/hide depth-1 children)
- Trigger synergy spotlight (highlight all synergies connected to this node)

#### Filter Controls
- **Depth Filter**: Toggle rings 1, 2, 3 independently (Ring 0 always visible)
- **Rarity Filter**: Show only common/rare/unique/exotic affixes
- **Category Filter**: Show only elemental/physical/utility/etc.
- **Search Box**: Fuzzy search by affix name → highlight matches, fade others

#### Zoom & Pan
- **Scroll wheel**: Zoom in/out (1x to 3x range)
- **Click + drag**: Pan the tree
- **Double-click**: Reset zoom + pan to default
- **Fit to view**: Auto-scale tree to fill SVG canvas

### Synergy Visualization

Synergies are shown as **bezier curves** connecting trigger nodes to effect nodes:
- **Color**: By synergy type (transformation, conditional, support)
- **Dashing**: Strength indicator (solid = strong, dashed = conditional)
- **Opacity**: Hidden by default, shown on node selection or hover
- **Legend**: Synergy types + counts listed in side panel

---

## Section 3: Gem Workbench Editor

### Left Panel: Tabs

#### Tab 1: Affixes
List view of all 33+ base affixes with:
- Search/filter bar
- Sortable columns: Name | Rarity | Tier | Category | Icon
- Inline edit: Click row to select
- Actions: Edit | Duplicate | Delete | Preview in Tree

#### Tab 2: Recipes
Hierarchical tree view of recipes grouped by depth + output tier:
```
Depth 1 (Tier 2→3)
  ├─ Fire + Chill → Magma Explosion (Unique)
  └─ ...
Depth 2 (Tier 3→4)
  ├─ Magma Explosion + Electrocute → Superconductor (Exotic)
  └─ ...
Depth 3 (Tier 4→5)
  └─ ...
```
- Expandable nodes show recipe inputs + output
- Inline stats: Input slots, output tier, synergy count
- Actions: Create | Edit | Delete | View Dependencies

#### Tab 3: Synergies
Table of all synergies with:
- Columns: Trigger | Condition | Effect | Category | Strength
- Filter by trigger affix or effect type
- Actions: Create | Edit | Delete | Test in Workbench

### Right Panel: Context-Aware Editor

**Affix Editor** (when affix selected):
```
Name           [Text Input]
Rarity         [Dropdown: Common|Rare|Unique|Exotic]
Tier           [Dropdown: 1-5]
Category       [Multi-select: Elemental|Physical|Utility|Transmute]
Icon           [Icon Picker or Text/Emoji Input]
Description    [Markdown Editor]
Flavor Text    [Text Area]
Tags           [Token Input: synthesis, elemental, etc.]
[Save] [Revert] [Delete]
```

**Recipe Editor** (when recipe selected):
```
Input Slot 1   [Affix Picker: Select or search]
Input Slot 2   [Affix Picker]
Output         [Affix Picker: Locked to tier+1]
Depth          [Read-only: auto-calculated from inputs]
Recipe Type    [Dropdown: signature|category|generic]
Weight         [Slider 0.5x-2.0x: affects synergy frequency]
Notes          [Text Area: balance notes, design intent]
[Save] [Revert] [Duplicate] [Delete]
```

**Synergy Editor** (when synergy selected):
```
Trigger        [Affix Picker]
Condition      [Condition Builder]
  ├─ Affix Present: [Multi-select]
  ├─ Affix Absent: [Multi-select]
  └─ Stat Threshold: [Affix] > [Value]
Effect Type    [Dropdown: transform|apply|enhance]
Effect Value   [Stat Input: damage, health, etc.]
Category       [Dropdown: conditional|transformation|support]
Strength       [Dropdown: weak|normal|strong]
[Save] [Revert] [Test] [Delete]
```

### Footer Toolbar

```
[Save Changes]  [Revert to Last]  [Test in Sim]  [Export Config]  [Import Config]
      ↓              ↓                  ↓              ↓                ↓
    Validate     Clear edits      Run engine    Save JSON to    Load JSON from
    + persist     + reload         + show results   file            file
```

**Test in Sim** workflow:
1. Click button
2. Tool exports current gem config as temporary JSON
3. Launches simulation engine with `-c gem-blueprint-config.json` flag
4. Shows simulation results panel: gem spawn rates, combination success %, synergy triggers
5. User can adjust config and re-test without leaving tool

---

## Section 4: New Gem Content — Starter Expansion Pack

### 25 New Signature Recipes (Depth 1 & 2)

#### Elemental Mastery (6 recipes)
1. **Fire + Chill → Magma Explosion** (Tier 3, Unique)
   - Fusion of extremes creates unstable vortex
   - Synergy: Triggers "Overload" when both elements present

2. **Lightning + Water → Superconductor** (Tier 4, Exotic)
   - Sustained electrical discharge through conductive medium
   - Synergy: Reduces cooldown of lightning skills by 50%

3. **Nature + Frost → Permafrost** (Tier 3, Unique)
   - Growth frozen mid-bloom, crystalline structure
   - Synergy: Slows enemy movement by 20%

4. **Fire + Nature → Wildfire** (Tier 3, Unique)
   - Accelerated combustion of organic matter
   - Synergy: Spreads damage to adjacent enemies

5. **Lightning + Nature → Storm Surge** (Tier 3, Unique)
   - Electrical charging through living conduits
   - Synergy: Chains next spell to nearby enemies

6. **Earth + Water → Mud Slick** (Tier 3, Rare)
   - Ground softened and saturated, reduces traction
   - Synergy: Immobilizes slow-moving enemies

#### Conditional & Transformation (5 recipes)
7. **Berserk + Armor → Reinforced Rage** (Tier 3, Unique)
   - Channeling fury into structural enhancement
   - Synergy: Damage reduction scales with attack speed

8. **Slow + Haste → Temporal Paradox** (Tier 4, Exotic)
   - Conflicting timelines create unpredictable effects
   - Synergy: Randomly grants double-speed actions

9. **Chaos + Order → Symmetry Break** (Tier 3, Unique)
   - Ordered chaos that defies prediction
   - Synergy: Randomizes enemy spell targeting

10. **Poison + Healing → Regenerative Toxin** (Tier 3, Unique)
    - Toxic substance triggers immune response
    - Synergy: Damage taken converts 30% to healing

11. **Stun + Movement → Phase Shift** (Tier 3, Rare)
    - Bypass immobility through spatial displacement
    - Synergy: Teleport when stunned instead of freezing

#### Layering & Stacking (4 recipes)
12. **Critical Strike + Bleed → Hemorrhage** (Tier 3, Unique)
    - Precise cuts that won't stop bleeding
    - Synergy: Bleed damage scales with critical chance

13. **Reflect + Thorns → Counter Strike** (Tier 3, Rare)
    - Defensive counteroffensive that builds momentum
    - Synergy: Each reflection increases next melee damage

14. **Curse + Weakness → Amplified Curse** (Tier 4, Exotic)
    - Compound debuffs that cascade
    - Synergy: Each curse on target increases next curse potency

15. **Empower + Overload → Critical Overload** (Tier 4, Exotic)
    - Skill power pushed beyond safe limits
    - Synergy: Overloaded skills create aftershock waves

#### Support-Gem Style (4 recipes)
16. **Ward + Protection → Fortified Ward** (Tier 3, Unique)
    - Proactive shielding that anticipates damage
    - Synergy: Ward charges when damage is prevented

17. **Resistance + Fortification → Bulwark** (Tier 3, Unique)
    - Combined defensive structures
    - Synergy: Resistance stacks bonus armor

18. **Aura + Blessing → Sacred Aura** (Tier 3, Rare)
    - Blessed effect radiates to nearby allies
    - Synergy: Aura effects intensify per nearby buff

19. **Mana Pool + Regeneration → Endless Wellspring** (Tier 3, Unique)
    - Deep reserves that refill constantly
    - Synergy: Mana regen scales with max mana

#### Tank/Sustain & Chaos/Utility (6 recipes)
20. **Health + Regeneration → Vitality Surge** (Tier 3, Unique)
    - Passive healing that responds to damage
    - Synergy: Heal amount scales with missing health %

21. **Evasion + Dodge → Phantom Dodge** (Tier 3, Rare)
    - Becoming harder to hit after evasion
    - Synergy: Dodge chance increases per consecutive evasion

22. **Summoned Allies + Empowerment → Amplified Summons** (Tier 3, Unique)
    - Summons benefit from empowerment effects
    - Synergy: Summoned units inherit buff effects

23. **Curse + Torment → Anguish** (Tier 4, Exotic)
    - Psychological horror made manifest
    - Synergy: Cursed enemies take increased spell damage

24. **Transmute + Enhancement → Alchemical Ascension** (Tier 4, Exotic)
    - Converting base materials into superior forms
    - Synergy: Transmute outputs gain enhancement bonuses

25. **Chaos + Luck → Fortune's Gambit** (Tier 3, Unique)
    - Intentional randomness that occasionally breaks rules
    - Synergy: Random chance to double spell effects

### 25 New Synergies (One per Recipe)

#### Elemental Mastery Synergies

1. **Overload Trigger** (Transformation)
   - Trigger: Fire + Chill present
   - Effect: Activates Overload state; next damaging skill deals 50% extra damage
   - Strength: Strong

2. **Lightning Cooldown Reduction** (Support)
   - Trigger: Lightning + Water synergy active
   - Effect: Lightning skills have 50% reduced cooldown
   - Strength: Normal

3. **Permafrost Field** (Conditional)
   - Trigger: Nature + Frost present
   - Condition: Enemy movement > 0
   - Effect: Slows enemy movement by 20%
   - Strength: Normal

4. **Wildfire Spread** (Transformation)
   - Trigger: Fire + Nature combination active
   - Effect: Damage dealt spreads to adjacent enemies (50% of damage)
   - Strength: Normal

5. **Storm Surge Chaining** (Support)
   - Trigger: Lightning + Nature synergy active
   - Effect: Next spell chains to 2 nearby enemies
   - Strength: Normal

6. **Mud Slick Immobilize** (Conditional)
   - Trigger: Earth + Water combination active
   - Condition: Enemy is slowed or movement impaired
   - Effect: Immobilizes target for 1 turn
   - Strength: Normal

#### Conditional & Transformation Synergies

7. **Reinforced Defense** (Support)
   - Trigger: Berserk + Armor both active
   - Effect: Damage reduction scales with attack speed (1% per 10% AS)
   - Strength: Normal

8. **Temporal Instability** (Transformation)
   - Trigger: Slow + Haste both active
   - Effect: Randomly grants either 2x action speed or 0.5x speed for next turn
   - Strength: Strong

9. **Symmetry Break** (Conditional)
   - Trigger: Chaos + Order present
   - Effect: Randomizes enemy spell targeting (redirects 50% of spells)
   - Strength: Strong

10. **Regenerative Toxin Conversion** (Support)
    - Trigger: Poison + Healing synergy active
    - Effect: 30% of damage taken converts to healing
    - Strength: Normal

11. **Phase Shift Teleport** (Transformation)
    - Trigger: Stun + Movement active
    - Effect: When stunned, teleport to nearby location instead of freezing
    - Strength: Strong

#### Layering & Stacking Synergies

12. **Hemorrhage Scaling** (Support)
    - Trigger: Critical Strike + Bleed present
    - Effect: Bleed damage scales with critical chance (1% per 1% crit)
    - Strength: Normal

13. **Counter Momentum** (Support)
    - Trigger: Reflect + Thorns active
    - Effect: Each reflection increases next melee damage by 5% (stacks, max 50%)
    - Strength: Normal

14. **Curse Amplification** (Conditional)
    - Trigger: Curse + Weakness present
    - Condition: Target has 2+ curses
    - Effect: Each new curse is 25% more potent
    - Strength: Strong

15. **Overload Cascade** (Transformation)
    - Trigger: Empower + Overload combination cast
    - Effect: Creates area-of-effect shockwave affecting nearby enemies
    - Strength: Strong

#### Support-Gem Style Synergies

16. **Fortified Ward Charging** (Support)
    - Trigger: Ward + Protection both active
    - Effect: Ward charges by 20% whenever damage is prevented
    - Strength: Normal

17. **Bulwark Stacking** (Support)
    - Trigger: Resistance + Fortification synergy active
    - Effect: Resistance stacks grant 2% bonus armor per stack
    - Strength: Normal

18. **Sacred Aura Intensification** (Support)
    - Trigger: Aura + Blessing both active
    - Effect: Aura effects intensify by 10% per nearby buff on allies
    - Strength: Normal

19. **Wellspring Abundance** (Support)
    - Trigger: Mana Pool + Regeneration active
    - Effect: Mana regeneration scales with max mana pool (0.5% per 100 max mana)
    - Strength: Normal

#### Tank/Sustain & Chaos/Utility Synergies

20. **Vitality Surge Scaling** (Support)
    - Trigger: Health + Regeneration present
    - Effect: Healing received scales with missing health % (max heal = missing health)
    - Strength: Normal

21. **Phantom Dodge Stacking** (Conditional)
    - Trigger: Evasion + Dodge both active
    - Condition: Dodge triggered in previous turn
    - Effect: Dodge chance increases by 5% per consecutive successful evasion (stacks, max 50%)
    - Strength: Normal

22. **Amplified Summons** (Support)
    - Trigger: Summoned Allies + Empowerment active
    - Effect: Summoned units inherit all active buff effects (at 75% potency)
    - Strength: Normal

23. **Anguish Amplification** (Conditional)
    - Trigger: Curse + Torment present
    - Condition: Target is cursed
    - Effect: Cursed enemies take 25% increased spell damage
    - Strength: Strong

24. **Alchemical Ascension** (Support)
    - Trigger: Transmute + Enhancement both active
    - Effect: Transmute outputs gain 1 enhancement bonus per ingredient
    - Strength: Normal

25. **Fortune's Gambit** (Transformation)
    - Trigger: Chaos + Luck both active
    - Effect: Random chance (10%) to double spell effects and refresh cooldown
    - Strength: Strong

### Depth-2 & Depth-3 Example Chains

#### Example Depth-2 Chain: "Superconductor Mastery"
```
Tier 2: Fire + Chill
   ↓
Tier 3: Magma Explosion (Depth 1)
   ↓
Tier 4: Magma Explosion + Lightning
   ↓
Tier 4: Superconductor Enhancement (Depth 2, Category: Elemental Mastery)
        [Requires combining Magma Explosion + Lightning artifact]
        [Applies: +50% spell damage + Conductive Chain synergy]
```

#### Example Depth-3 Chain: "Cascade Destruction"
```
Tier 2: Lightning + Water
   ↓
Tier 3: Superconductor (Depth 1)
   ↓
Tier 4: Superconductor + Fire
   ↓
Tier 4: Inferno Superconductor (Depth 2, Category: Elemental Mastery)
        [Applies: Chain lightning + burn damage]
   ↓
Tier 5: Inferno Superconductor + Chaos
   ↓
Tier 5: Primordial Superconductor (Depth 3, Generic Upgrade)
        [Cross-category fusion: Elemental + Chaos]
        [Applies: All synergies activate 20% more often]
```

---

## Implementation Timeline

### Phase 1: Foundation (Week 1)
- [ ] Set up tool project structure in `packages/tools/`
- [ ] Build Zustand store + data loading
- [ ] Implement D3 radial tree renderer
- [ ] Basic hover + click interactions

### Phase 2: Workbench & Persistence (Week 2)
- [ ] Build affix/recipe/synergy editors
- [ ] Implement JSON save/load
- [ ] Add validation against engine rules
- [ ] Git commit integration

### Phase 3: Advanced Interactions (Week 3)
- [ ] Zoom, pan, search, filter controls
- [ ] Synergy visualization
- [ ] Simulation runner integration
- [ ] Import/export workflows

### Phase 4: Content & Polish (Week 4)
- [ ] Load 25 new starter recipes
- [ ] Load 25 new synergies
- [ ] UI polish + accessibility
- [ ] Documentation + tutorials

---

## Success Criteria

- ✅ All 33 base affixes visualized and editable
- ✅ Full CRUD on recipes with real-time tree updates
- ✅ Synergy visualization and testing
- ✅ JSON persistence with git-compatible output
- ✅ Simulation engine integration working
- ✅ All 25 starter recipes and 25 synergies loaded
- ✅ Tool runs without errors on Windows, macOS, Linux
- ✅ Load time < 2 seconds for full gem database

---

## References

- **Gem Refactor Plan**: `docs/superpowers/plans/2026-04-08-gem-system-refactor.md`
- **Engine Data Registry**: `packages/engine/src/data/registry.ts`
- **Existing Tools Package**: `packages/tools/`
- **D3 Radial Hierarchy**: https://observablehq.com/@d3/radial-tree-layout
