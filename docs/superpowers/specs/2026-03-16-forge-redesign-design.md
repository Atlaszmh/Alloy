# Forge Screen Redesign — Design Spec

**Date:** 2026-03-16
**Status:** Approved
**Mockup reference:** `packages/client/public/mockups/forge-v3-hybrid.html`

## Problem

The forge screen uses a utilitarian tabbed layout that hides half the loadout at a time, displays orbs as simple SVG icons without stat labels, has no drag-and-drop, and forces immediate commitment of each action. The draft screen received polished UI/UX improvements (GemCard visuals, drag-and-drop, responsive sizing) that are now inconsistent with the forge screen.

## Goals

1. Both weapon and armor always visible (no tabs)
2. WoW-style item tooltip cards with deterministic affix ordering
3. Combination workbench with visual preview before committing
4. GemCard visuals in the forge stockpile (matching draft quality)
5. Full drag-and-drop between stockpile, item cards, and workbench
6. Flexible placement until "Done" — engine planning mode (ForgePlan)
7. Flux tracking with live UI feedback
8. Confirmation modal on "Done Forging"
9. Documentation, regression tests, and updated Playwright screenshots

---

## 1. Engine — ForgePlan System

### New file: `packages/engine/src/forge/forge-plan.ts`

#### Types

```typescript
interface ForgePlan {
  /** Working copy of player stockpile */
  stockpile: OrbInstance[];
  /** Working copy of player loadout */
  loadout: Loadout;
  /** Flux remaining in this plan (decrements on assign/combine, increments on remove) */
  tentativeFlux: number;
  /** Max flux for validation */
  maxFlux: number;
  /** Round number (affects what actions are allowed) */
  round: 1 | 2 | 3;
  /** Orb UIDs locked by permanent combines — these cannot be removed */
  lockedOrbUids: Set<string>;
  /** Permanent compound records created during this plan */
  permanentCombines: Array<{ compoundId: string; orbs: [OrbInstance, OrbInstance] }>;
  /** Ordered log of actions applied to this plan — used by commitPlan to produce replay sequence */
  actionLog: ForgeAction[];
}
```

#### Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `createForgePlan` | `(state: ForgeState, registry: DataRegistry) → ForgePlan` | Snapshots current stockpile, loadout, and flux into a working copy. Deep-clones all mutable data. Stores registry ref for flux cost lookups. |
| `applyPlanAction` | `(plan: ForgePlan, action: ForgeAction, registry: DataRegistry) → Result<ForgePlan>` | Validates and applies action to the plan's working copy. Uses `getActionCost()` from balance config for flux pricing. Returns new plan (immutable pattern) or error. |
| `commitPlan` | `(plan: ForgePlan) → ForgeAction[]` | Returns the ordered list of `ForgeAction[]` that reproduces the plan's final state. The caller replays these through `matchStore.dispatch()` to write back to `MatchState`. See "Commit flow" below. |
| `getPlannedStats` | `(plan: ForgePlan, registry: DataRegistry) → DerivedStats` | Runs `calculateStats` against the plan's working loadout for live preview. |
| `canRemoveOrb` | `(plan: ForgePlan, orbUid: string) → boolean` | Returns false if the orb UID is in `lockedOrbUids` (part of a permanent combine). |

#### Commit flow

`commitPlan` does NOT produce a `ForgeState` directly — it produces an ordered `ForgeAction[]` replay log. The client commit flow is:

1. `const actions = commitPlan(plan)` — get the canonical action sequence
2. For each action: `matchStore.dispatch({ kind: 'forge_action', player: 0, action })` — replay through the real engine
3. `matchStore.dispatch({ kind: 'forge_complete', player: 0 })` — finalize

This approach uses the existing `matchStore.dispatch` pathway, requires no new setters on `MatchState`, and guarantees the engine validates every action on commit. The `ForgePlan` tracks an internal action log to make this possible.

#### Action behaviors within the plan

| Action | Flux cost | Reversible? | Notes |
|--------|-----------|-------------|-------|
| `assign_orb` | Per `balance.fluxCosts.assignOrb` | Yes | Move orb from plan stockpile to plan loadout slot |
| `remove_orb` | Per `balance.fluxCosts.removeOrb` (costs flux, currently 1) | Yes | Move orb from plan loadout back to plan stockpile. **Blocked in Round 1** (same restriction as engine). Blocked if `lockedOrbUids` contains it. |
| `combine` | Per `balance.fluxCosts.combine` | **No** | Consumes both orbs, creates compound in plan loadout. Both orb UIDs added to `lockedOrbUids`. Cannot be undone within the plan. |
| `upgrade_tier` | Per `balance.fluxCosts.upgradeTier` | **No** | Fuses two same-affix orbs into one higher-tier orb. Both source UIDs added to `lockedOrbUids`. Cannot be undone within the plan. |
| `set_base_stats` | 0 | Yes | Updates plan loadout base stats. **Only valid in Round 1** (same restriction as engine). |
| `swap_orb` | Not used in planning mode | — | Replaced by remove + assign |

All flux costs are read from `registry.getBalance().fluxCosts` via `getActionCost()`, not hardcoded. The UI's floating flux popups display the actual cost from the balance config.

#### Export from engine

Add `forge-plan.ts` exports to `packages/engine/src/index.ts`:
```typescript
export { createForgePlan, applyPlanAction, commitPlan, getPlannedStats, canRemoveOrb } from './forge/forge-plan';
export type { ForgePlan } from './forge/forge-plan';
```

### Existing files — no breaking changes

- `forge-state.ts` and `applyForgeAction` remain unchanged (AI still uses them directly)
- `stat-calculator.ts` unchanged (used by `getPlannedStats`)

---

## 2. UI — Forge Page Rewrite

### New file: `packages/client/src/pages/Forge.tsx` (full rewrite)

#### Component tree

```
Forge (page orchestrator)
├── ForgeHeader
│   ├── Title ("FORGE PHASE")
│   ├── Round + FluxCounter (live, color-coded: green/yellow/red)
│   ├── Timer
│   └── "Done Forging" button → opens ConfirmModal
├── ItemCardsRow (flex row)
│   ├── ItemCard (weapon, always visible)
│   │   ├── CardHeader (icon + name + type/subtype)
│   │   ├── CardDivider
│   │   ├── InherentBonuses (teal text)
│   │   ├── CardDivider
│   │   ├── BaseStats (vertical: "STR\nVIT", bronze)
│   │   ├── CardDivider
│   │   ├── AffixLine[] (deterministic order, green text, orb icon, tier pill, ✕ remove)
│   │   ├── CompoundLine[] (gold ✦, 🔒 locked)
│   │   ├── CardDivider
│   │   └── EmptySocket[] (dashed circles) + slot count
│   └── ItemCard (armor, always visible)
├── CombinationWorkbench
│   ├── Title ("◆ FORGE ◆")
│   ├── ComboSocket A + "+" + ComboSocket B + "▶" + ResultPreview
│   └── COMBINE button + CLEAR button
├── SynergyTracker (compact pills row)
├── ForgeStockpile (scrollable)
│   ├── Header ("STOCKPILE (N)")
│   └── Grid (4 cols) of GemCard[] at 72px
├── StatsBar (4-col grid: HP, DMG, Armor%, Crit%)
├── ConfirmModal ("Commit your forge?" — CONFIRM / CANCEL)
└── DragGhost (fixed, follows pointer)
```

#### Extracted shared utility

Move `getStatLabel` from `Draft.tsx` to `packages/client/src/shared/utils/stat-label.ts`:
```typescript
export function getStatLabel(affix: AffixDef, orb: OrbInstance, target: 'weapon' | 'armor' = 'weapon'): string
```
Update Draft.tsx to import from shared location.

#### ForgeStore updates (`forgeStore.ts`)

Replace current store with:

```typescript
/** Discriminated union for drag sources */
type DragSource =
  | { from: 'stockpile'; orbUid: string }
  | { from: 'card'; cardId: 'weapon' | 'armor'; slotIndex: number; orbUid: string }
  | { from: 'combo'; slot: 'a' | 'b'; orbUid: string };

interface ForgeStore {
  plan: ForgePlan | null;
  selectedOrbUid: string | null;
  dragSource: DragSource | null;
  confirmModalOpen: boolean;

  initPlan(state: ForgeState, registry: DataRegistry): void;
  applyAction(action: ForgeAction, registry: DataRegistry): Result;
  getCommitActions(): ForgeAction[];
  selectOrb(uid: string | null): void;
  startDrag(source: DragSource): void;
  endDrag(): void;
  openConfirmModal(): void;
  closeConfirmModal(): void;
  reset(): void;
}
```

The store wraps engine `ForgePlan` functions. The `Forge.tsx` page calls `initPlan()` on mount, `applyAction()` on drag/click interactions, and `getCommitActions()` on confirm to get the replay sequence for `matchStore.dispatch()`.

**Commit flow in Forge.tsx:**
```typescript
function handleConfirm() {
  const actions = forgeStore.getCommitActions();
  for (const action of actions) {
    matchStore.dispatch({ kind: 'forge_action', player: 0, action });
  }
  matchStore.dispatch({ kind: 'forge_complete', player: 0 });
  // AI forge follows...
}
```

#### Deterministic affix ordering

Affixes displayed in item cards follow this fixed order by category, then alphabetical within category:

1. **Offensive**: Flat Physical, Fire Damage, Cold Damage, Lightning Damage, Poison Damage, Shadow Damage, Chaos Damage, Crit Chance, Crit Multiplier, Attack Speed, Armor Pen, Elemental Pen
2. **Defensive**: Flat HP, Armor, Block Chance, Dodge, Barrier, HP Regen, Damage Reduction, Fortify
3. **Sustain**: Lifesteal, Thorns, Life on Kill
4. **Utility**: Initiative, DoT Multiplier, Stun Chance, Slow on Hit
5. **Trigger**: Chance on Hit, Chance on Taking Damage, Chance on Crit, Chance on Block, Chance on Kill, Chance on Low HP
6. **Compounds**: Listed last with ✦ prefix

Define the ordering as a constant array `AFFIX_DISPLAY_ORDER: string[]` in a shared util so it can be reused.

#### WoW-style color coding

| Element | Color | Usage |
|---------|-------|-------|
| Player-socketed affixes | `#1eff00` (green) | Affix text lines |
| Compounds | `#ecd06a` (gold) | Compound name + ✦ |
| Inherent bonuses | `#2dd4bf` (teal) | Base item perks |
| Base stats | `#b89868` (bronze) | STR, VIT allocation |
| Empty sockets | `#4a4a68` (grey) | Dashed circles |
| Locked indicator | `#6a6a88` | 🔒 icon |

#### Drag-and-drop system

Uses native pointer events (same pattern as Draft screen):

| Drag source | Drop target | Flux | Behavior |
|-------------|-------------|------|----------|
| Stockpile gem | Item card / empty socket | -1⚡ | `assign_orb` plan action |
| Stockpile gem | Combo socket | Free | Moves to workbench (no plan action) |
| Item card affix orb | Stockpile | -1⚡ (remove costs flux) | `remove_orb` plan action |
| Item card affix orb | Other item card | Net 0 | Remove + assign |
| Combo socket | Stockpile | Free | Returns to stockpile |
| Combo socket | Item card | -1⚡ | `assign_orb` plan action |

**Implementation details:**
- Drag threshold: 6px movement before drag starts
- Drag ghost: 80px GemCard with golden drop-shadow, follows cursor
- Drop target highlighting: gold border + glow on valid targets
- Click-to-select fallback: short clicks without movement use select-then-click model
- `touch-action: none` on all draggable elements

#### Flux counter

- Displayed in header: "Flux: **N**" with N in JetBrains Mono
- Color states: green (>2), yellow (≤2), red (0)
- Floating popup on change: "+1⚡" green or "-1⚡" red, animates upward and fades (0.8s)

#### Confirmation modal

- Triggered by "Done Forging" button click
- Uses existing `Modal.tsx` component
- Content: "Commit your forge?" with two buttons:
  - **CONFIRM** (gold primary) — calls `commitPlan()`, triggers AI forge, transitions to duel
  - **CANCEL** (surface secondary) — closes modal, returns to forge
- Timer expiry auto-commits without showing modal
- **Race condition:** If the timer expires while the modal is open, auto-commit proceeds immediately and the modal is dismissed. The commit handler checks a `committed` flag to prevent double-commit.

#### `getStatLabel` armor context

The extracted `getStatLabel(affix, orb, target)` reads `weaponEffect[0]` when `target === 'weapon'` and `armorEffect[0]` when `target === 'armor'`. This matters because the same affix (e.g., "Fire Damage") provides different stats on weapon (flat fire damage) vs armor (fire resistance). Draft.tsx always passes `'weapon'` (default) since draft displays pool orbs before they're slotted — this preserves existing behavior.

---

## 3. Shared utility extraction

| Utility | From | To | Notes |
|---------|------|----|-------|
| `getStatLabel()` | `Draft.tsx` (inline) | `packages/client/src/shared/utils/stat-label.ts` | Enhanced to accept `target` param for weapon vs armor context |
| `AFFIX_DISPLAY_ORDER` | New | `packages/client/src/shared/utils/affix-order.ts` | Constant array defining deterministic display order |
| `ELEMENT_COLORS` / `ELEMENT_GRADIENTS` | Duplicated in OrbIcon + GemCard | `packages/client/src/shared/utils/element-theme.ts` | Single source of truth for element visual data |

---

## 4. Testing

### Engine tests: `packages/engine/tests/forge-plan.test.ts`

| Test | Description |
|------|-------------|
| `createForgePlan snapshots state` | Verify deep clone of stockpile, loadout, flux |
| `assign_orb decrements tentativeFlux` | Place orb, verify flux -1 |
| `remove_orb increments tentativeFlux` | Remove orb, verify flux +1 |
| `assign then remove is net zero` | Place and remove same orb, verify original state |
| `combine is permanent` | Combine two orbs, verify `lockedOrbUids` populated |
| `cannot remove locked orb` | After combine, attempt remove → error |
| `combine costs 2 flux` | Verify flux -2 on combine |
| `no flux blocks assign` | Attempt assign with 0 flux → error |
| `commitPlan produces correct ForgeState` | Full plan → commit → verify final state matches |
| `getPlannedStats returns live stats` | Verify stats recalculation against plan loadout |
| `set_base_stats is reversible` | Change stats, change again, verify latest applies |
| `set_base_stats blocked in round 2+` | Attempt set_base_stats with round=2 → error |
| `remove_orb blocked in round 1` | Attempt remove in round 1 → error |
| `upgrade_tier is permanent` | Upgrade two same-affix orbs, verify lockedOrbUids, verify flux cost |
| `cannot remove upgraded orb` | After upgrade_tier, attempt remove → error |
| `plan mutations do not affect original state` | Create plan, mutate plan's stockpile, verify original ForgeState.stockpile unchanged |
| `commitPlan produces correct action replay log` | Full plan with assign+combine → commitPlan → verify ForgeAction[] sequence |

### Component tests: `packages/client/src/pages/__tests__/Forge.test.tsx`

| Test | Description |
|------|-------------|
| `renders both item cards without tabs` | Verify weapon + armor visible simultaneously |
| `displays affixes in deterministic order` | Add affixes in random order, verify render order matches spec |
| `flux counter updates on place/remove` | Place → verify -1, remove → verify +1 |
| `confirmation modal opens on Done click` | Click Done → modal with "Commit your forge?" visible |
| `locked affixes show lock icon and cannot be removed` | After combine, verify 🔒 and no ✕ on hover |
| `empty sockets pulse when gem selected` | Select gem → verify pulse animation class on sockets |
| `GemCard renders in stockpile with stat labels` | Verify stockpile uses GemCard, not OrbIcon |

### Playwright E2E: `packages/client/e2e/forge-redesign.spec.ts`

| Test | Description |
|------|-------------|
| `forge page shows both items` | Navigate to forge, verify weapon + armor cards visible |
| `place gem via click` | Select stockpile gem, click empty socket, verify affix appears |
| `place gem via drag` | Drag from stockpile to item card |
| `remove gem click` | Click equipped affix ✕, verify returns to stockpile |
| `combine in workbench` | Place 2 gems in combo sockets, verify preview, click COMBINE |
| `confirm modal flow` | Click Done → modal → CONFIRM → verify phase transition |
| `cancel modal returns to forge` | Click Done → modal → CANCEL → still on forge |
| `flux tracks correctly` | Place 3 gems, remove 1, verify flux = startFlux - 2 |
| `drag gem between item cards` | Drag orb from weapon to armor, verify net zero flux change |
| `timer expires while modal open` | Open confirm modal, let timer expire, verify auto-commit and phase transition |

**Screenshot updates:**
- Update `match-flow.spec.ts` forge helper (`placeOrbs`) to use new selectors (GemCard instead of OrbIcon button)
- Regenerate all forge-phase screenshots for 4 viewports (iphone-se, iphone-15-pro, pixel-7, desktop)

### Existing test updates

| File | Change |
|------|--------|
| `e2e/fixtures/match.ts` | Update `placeOrbs()` selectors for new forge layout. Update `completeForge()` to click CONFIRM in the new modal after clicking "Done Forging" — without this, all existing match-flow tests will timeout waiting for duel phase. |
| `e2e/match-flow.spec.ts` | Update forge step screenshots |
| `forgeStore.test.ts` | Rewrite for new store shape (plan-based) |

---

## 5. Documentation updates

| File | Change |
|------|--------|
| `docs/HANDOFF.md` | Add ForgePlan architecture section, update forge UI description, update test gaps (mark component tests as added) |

---

## 6. Files changed / created summary

### New files
| File | Purpose |
|------|---------|
| `packages/engine/src/forge/forge-plan.ts` | ForgePlan system (create, apply, commit, stats) |
| `packages/engine/tests/forge-plan.test.ts` | Unit tests for ForgePlan |
| `packages/client/src/shared/utils/stat-label.ts` | Extracted `getStatLabel()` |
| `packages/client/src/shared/utils/affix-order.ts` | Deterministic affix display order constant |
| `packages/client/src/shared/utils/element-theme.ts` | Consolidated element color/gradient maps |
| `packages/client/src/pages/__tests__/Forge.test.tsx` | Component tests for new Forge page |
| `packages/client/e2e/forge-redesign.spec.ts` | Playwright E2E tests |

### Modified files
| File | Change |
|------|---------|
| `packages/engine/src/index.ts` | Export ForgePlan types and functions |
| `packages/client/src/pages/Forge.tsx` | Full rewrite — new layout, drag-and-drop, plan integration |
| `packages/client/src/stores/forgeStore.ts` | Rewrite — plan-based state, drag source tracking, confirm modal |
| `packages/client/src/pages/Draft.tsx` | Import `getStatLabel` from shared util instead of inline |
| `packages/client/src/components/GemCard.tsx` | Add tier visual indicator (tier-colored border glow on T3+, small tier dots or badge). The `tier` prop is already accepted but not rendered — add rendering. |
| `packages/client/src/components/OrbIcon.tsx` | No changes (still used in item card affix lines at 26px) |
| `packages/client/e2e/fixtures/match.ts` | Update forge selectors |
| `packages/client/e2e/match-flow.spec.ts` | Update forge screenshots |
| `packages/client/src/stores/__tests__/forgeStore.test.ts` | Rewrite for new store shape |
| `docs/HANDOFF.md` | Architecture and test gap updates |

### Unchanged files
- `packages/engine/src/forge/forge-state.ts` — untouched, AI still uses it directly
- `packages/engine/src/forge/stat-calculator.ts` — untouched, called by `getPlannedStats`

### Minor CSS addition
- `packages/client/src/index.css` — add `flux-pop` keyframe animation for floating flux change popup (small addition to existing file)
