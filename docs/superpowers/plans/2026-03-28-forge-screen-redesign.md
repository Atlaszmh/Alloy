# Forge Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the forge screen from a 1170-line monolith into a two-tab layout (Plan & Combine / Equip) where all gems are visible at once alongside the active tool.

**Architecture:** Two-tab layout with a persistent gem tray at the top of both tabs. Tab 1 shows a 3-slot combination workbench with glow signals (white=basic, gold=unique). Tab 2 shows item sockets in a visual grid with a mini preview bar for the other item. The existing `forgeStore.ts` is refactored to add tab state and 3-slot combo array. All game logic remains in the engine — the UI is purely presentational over `ForgePlan`.

**Tech Stack:** React 19, Zustand 5, TailwindCSS v4, Web Animations API, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-28-forge-screen-redesign.md`
**Mockup:** `packages/client/forge-mockup-v4.html`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `stores/forgeStore.ts` | Modify | Add `activeTab`, `activeItemTab`, refactor combo slots to 3-element array |
| `stores/forgeStore.test.ts` | Modify | Test new tab state, 3-slot combo staging, reset behavior |
| `shared/utils/stat-label.ts` | Modify | Add `getStatAbbreviation()` export |
| `shared/utils/stat-label.test.ts` | Create | Test all abbreviation mappings (co-located, not in __tests__/) |
| `hooks/useForgeGemSize.ts` | Create | Forge-specific responsive gem sizing (4 breakpoints) |
| `hooks/useForgeGemSize.test.ts` | Create | Test all breakpoints, min size, container shrinking (co-located) |
| `components/ForgeHeader.tsx` | Create | 2-row header: title/timer/done + stats/flux |
| `components/ForgeGemTray.tsx` | Create | Responsive gem grid with selection, dimming, badges |
| `components/CombineWorkbench.tsx` | Create | 3-slot workbench, glow signals, combine/clear buttons |
| `components/ItemSocketView.tsx` | Create | Item display, adaptive socket grid, equipped list |
| `components/ItemMiniPreview.tsx` | Create | Compact bar showing other item's socket state |
| `pages/Forge.tsx` | Rewrite | Orchestrator: tabs, state wiring, commit flow, animations |
| `pages/__tests__/Forge.test.tsx` | Rewrite | Update component tests for new structure |
| `e2e/forge-redesign.spec.ts` | Rewrite | F01-F19 acceptance tests |

All paths relative to `packages/client/src/`.

**3-slot combine vs 2-orb engine:** The engine currently supports 2-orb combines only (`forge-action.ts: { kind: 'combine'; orbUid1: string; orbUid2: string }`). The UI renders 3 slots to prepare for the upcoming 3-gem combine mechanic. Until the engine is extended: the combine action uses the first 2 filled slots. The 3rd slot is visually available but the COMBINE button tooltip notes "3-gem recipes coming soon" when all 3 are filled and no 2-of-3 recipe matches. Glow signal logic checks all 2-pair permutations from the filled slots for valid recipes.

---

## Chunk 1: Foundation — Store, Utilities, Sizing Hook

### Task 1: Refactor forgeStore — add tab state and 3-slot combo

**Files:**
- Modify: `packages/client/src/stores/forgeStore.ts`
- Modify: `packages/client/src/stores/forgeStore.test.ts`

- [ ] **Step 1: Update existing tests and write new tests**

First, update existing tests that reference the old API:
- Replace all `comboSlotA`/`comboSlotB` references with `comboSlots[0]`/`comboSlots[1]`
- Replace `setComboSlot('a', orb)` calls with `setComboSlotByIndex(0, orb)`
- Replace `setComboSlot('b', orb)` calls with `setComboSlotByIndex(1, orb)`
- Update initial state test: change `expect(s.comboSlotA).toBeNull()` to `expect(s.comboSlots).toEqual([null, null, null])`
- Update reset test: same pattern
- Remove any `dragSource` assertions

Then add new tests to `forgeStore.test.ts`:

```ts
describe('tab state', () => {
  it('defaults activeTab to combine', () => {
    const { activeTab } = useForgeStore.getState();
    expect(activeTab).toBe('combine');
  });

  it('defaults activeItemTab to weapon', () => {
    const { activeItemTab } = useForgeStore.getState();
    expect(activeItemTab).toBe('weapon');
  });

  it('switches activeTab', () => {
    useForgeStore.getState().setActiveTab('equip');
    expect(useForgeStore.getState().activeTab).toBe('equip');
  });

  it('switches activeItemTab', () => {
    useForgeStore.getState().setActiveItemTab('armor');
    expect(useForgeStore.getState().activeItemTab).toBe('armor');
  });

  it('resets tabs on reset()', () => {
    useForgeStore.getState().setActiveTab('equip');
    useForgeStore.getState().setActiveItemTab('armor');
    useForgeStore.getState().reset();
    expect(useForgeStore.getState().activeTab).toBe('combine');
    expect(useForgeStore.getState().activeItemTab).toBe('weapon');
  });
});

describe('3-slot combo', () => {
  it('defaults comboSlots to [null, null, null]', () => {
    const { comboSlots } = useForgeStore.getState();
    expect(comboSlots).toEqual([null, null, null]);
  });

  it('sets a combo slot by index', () => {
    const mockOrb = { uid: 'orb_0', affixId: 'fire_attack', tier: 1 };
    useForgeStore.getState().setComboSlotByIndex(0, mockOrb as any);
    expect(useForgeStore.getState().comboSlots[0]).toEqual(mockOrb);
    expect(useForgeStore.getState().comboSlots[1]).toBeNull();
    expect(useForgeStore.getState().comboSlots[2]).toBeNull();
  });

  it('clears all combo slots', () => {
    const mockOrb = { uid: 'orb_0', affixId: 'fire_attack', tier: 1 };
    useForgeStore.getState().setComboSlotByIndex(0, mockOrb as any);
    useForgeStore.getState().setComboSlotByIndex(1, mockOrb as any);
    useForgeStore.getState().clearComboSlots();
    expect(useForgeStore.getState().comboSlots).toEqual([null, null, null]);
  });

  it('reset() clears combo slots', () => {
    const mockOrb = { uid: 'orb_0', affixId: 'fire_attack', tier: 1 };
    useForgeStore.getState().setComboSlotByIndex(0, mockOrb as any);
    useForgeStore.getState().reset();
    expect(useForgeStore.getState().comboSlots).toEqual([null, null, null]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd packages/client && npx vitest run src/stores/forgeStore.test.ts`
Expected: FAIL — `activeTab`, `setActiveTab`, `comboSlots`, `setComboSlotByIndex` not found

- [ ] **Step 3: Implement store changes**

In `forgeStore.ts`:
- Add fields: `activeTab: 'combine' | 'equip'` (default `'combine'`), `activeItemTab: 'weapon' | 'armor'` (default `'weapon'`)
- Replace `comboSlotA`/`comboSlotB` with `comboSlots: [OrbInstance | null, OrbInstance | null, OrbInstance | null]` (default `[null, null, null]`)
- Add actions: `setActiveTab(tab)`, `setActiveItemTab(tab)`, `setComboSlotByIndex(index, orb)`
- Update `clearComboSlots()` to reset the array
- Update `reset()` to reset `activeTab`, `activeItemTab`, and `comboSlots`
- Remove `dragSource`, `startDrag`, `endDrag` (tap-to-place replaces drag for now)
- Keep backward compatibility: `setComboSlot('a'|'b', orb)` can be removed since nothing else uses it yet

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd packages/client && npx vitest run src/stores/forgeStore.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/forgeStore.ts packages/client/src/stores/forgeStore.test.ts
git commit -m "refactor(forge): add tab state and 3-slot combo array to forgeStore"
```

---

### Task 2: Add stat abbreviations to stat-label.ts

**Files:**
- Modify: `packages/client/src/shared/utils/stat-label.ts`
- Create: `packages/client/src/shared/utils/stat-label.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { getStatAbbreviation } from './stat-label';

describe('getStatAbbreviation', () => {
  it.each([
    ['physicalDamage', 'Phys Dmg'],
    ['coldDamage', 'Cold Dmg'],
    ['poisonDamage', 'Psn Dmg'],
    ['chaosDamage', 'Chaos Dmg'],
    ['attackInterval', 'Atk Spd'],
    ['critChance', 'Crit'],
    ['maxHP', 'HP'],
    ['coldResistance', 'Cold Res'],
    ['firePenetration', 'Fire Pen'],
    ['dodgeChance', 'Dodge'],
    ['hpRegen', 'Regen'],
    ['barrier', 'Barrier'],
    ['armor', 'Armor'],
    ['blockChance', 'Block'],
  ])('abbreviates %s to %s', (stat, expected) => {
    expect(getStatAbbreviation(stat)).toBe(expected);
  });

  it('returns the stat key as-is for unknown stats', () => {
    expect(getStatAbbreviation('unknownStat')).toBe('unknownStat');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd packages/client && npx vitest run src/shared/utils/__tests__/stat-label.test.ts`
Expected: FAIL — `getStatAbbreviation` not exported

- [ ] **Step 3: Implement abbreviation map**

Add to `stat-label.ts`:

```ts
const STAT_ABBREVIATIONS: Record<string, string> = {
  physicalDamage: 'Phys Dmg',
  coldDamage: 'Cold Dmg',
  fireDamage: 'Fire Dmg',
  lightningDamage: 'Ltng Dmg',
  poisonDamage: 'Psn Dmg',
  shadowDamage: 'Shadow Dmg',
  chaosDamage: 'Chaos Dmg',
  attackInterval: 'Atk Spd',
  critChance: 'Crit',
  critMultiplier: 'Crit Mult',
  maxHP: 'HP',
  armor: 'Armor',
  coldResistance: 'Cold Res',
  fireResistance: 'Fire Res',
  lightningResistance: 'Ltng Res',
  poisonResistance: 'Psn Res',
  shadowResistance: 'Shadow Res',
  chaosResistance: 'Chaos Res',
  allResistances: 'All Res',
  firePenetration: 'Fire Pen',
  dodgeChance: 'Dodge',
  blockChance: 'Block',
  hpRegen: 'Regen',
  barrier: 'Barrier',
  thornsDamage: 'Thorns',
  stunChance: 'Stun',
  allElementalDamage: 'All Elem',
};

export function getStatAbbreviation(stat: string): string {
  return STAT_ABBREVIATIONS[stat] ?? stat;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd packages/client && npx vitest run src/shared/utils/__tests__/stat-label.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/shared/utils/stat-label.ts packages/client/src/shared/utils/stat-label.test.ts
git commit -m "feat(forge): add stat abbreviation system to stat-label.ts"
```

---

### Task 3: Create useForgeGemSize hook

**Files:**
- Create: `packages/client/src/hooks/useForgeGemSize.ts`
- Create: `packages/client/src/hooks/useForgeGemSize.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { getForgeGemSize } from './useForgeGemSize';

describe('getForgeGemSize', () => {
  it('returns large config for ≤8 gems', () => {
    const config = getForgeGemSize(8);
    expect(config.gemSize).toBe(76);
    expect(config.columns).toBe(4);
  });

  it('returns medium config for 9-12 gems', () => {
    const config = getForgeGemSize(12);
    expect(config.gemSize).toBe(68);
    expect(config.columns).toBe(4);
  });

  it('returns small config for 13-16 gems', () => {
    const config = getForgeGemSize(16);
    expect(config.gemSize).toBe(58);
    expect(config.columns).toBe(5);
  });

  it('returns xs config for 17+ gems', () => {
    const config = getForgeGemSize(20);
    expect(config.gemSize).toBe(52);
    expect(config.columns).toBe(5);
  });

  it('enforces minimum gem size of 48px', () => {
    const config = getForgeGemSize(30, 200);
    expect(config.gemSize).toBeGreaterThanOrEqual(48);
  });

  it('shrinks proportionally when container is narrow', () => {
    const normal = getForgeGemSize(8);
    const narrow = getForgeGemSize(8, 280);
    expect(narrow.gemSize).toBeLessThan(normal.gemSize);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd packages/client && npx vitest run src/hooks/__tests__/useForgeGemSize.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

Create `useForgeGemSize.ts`:

```ts
export interface ForgeGemSizeConfig {
  gemSize: number;
  columns: number;
  emojiSize: number;
  statSize: number;
  nameSize: number;
}

const BREAKPOINTS = [
  { maxCount: 8,  gemSize: 76, columns: 4, emojiSize: 28, statSize: 10, nameSize: 9 },
  { maxCount: 12, gemSize: 68, columns: 4, emojiSize: 26, statSize: 9,  nameSize: 9 },
  { maxCount: 16, gemSize: 58, columns: 5, emojiSize: 22, statSize: 8,  nameSize: 8 },
  { maxCount: Infinity, gemSize: 52, columns: 5, emojiSize: 20, statSize: 8, nameSize: 8 },
];

const MIN_GEM_SIZE = 48;

export function getForgeGemSize(poolCount: number, containerWidth?: number): ForgeGemSizeConfig {
  const bp = BREAKPOINTS.find(b => poolCount <= b.maxCount)!;
  let { gemSize, columns, emojiSize, statSize, nameSize } = bp;

  if (containerWidth) {
    const gap = 8;
    const needed = columns * gemSize + (columns - 1) * gap;
    if (needed > containerWidth) {
      const scale = containerWidth / needed;
      gemSize = Math.max(MIN_GEM_SIZE, Math.floor(gemSize * scale));
      emojiSize = Math.floor(emojiSize * scale);
      statSize = Math.max(7, Math.floor(statSize * scale));
      nameSize = Math.max(7, Math.floor(nameSize * scale));
    }
  }

  return { gemSize, columns, emojiSize, statSize, nameSize };
}

export function useForgeGemSize(poolCount: number, containerWidth?: number): ForgeGemSizeConfig {
  return useMemo(() => getForgeGemSize(poolCount, containerWidth), [poolCount, containerWidth]);
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd packages/client && npx vitest run src/hooks/__tests__/useForgeGemSize.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/hooks/useForgeGemSize.ts packages/client/src/hooks/useForgeGemSize.test.ts
git commit -m "feat(forge): add useForgeGemSize hook with 4 responsive breakpoints"
```

---

## Chunk 2: UI Components — Header, Gem Tray, Workbench

### Task 4: Create ForgeHeader component

**Files:**
- Create: `packages/client/src/components/ForgeHeader.tsx`

- [ ] **Step 1: Create ForgeHeader**

Two-row header component. Props:

```ts
interface ForgeHeaderProps {
  round: 1 | 2 | 3;
  flux: number;
  maxFlux: number;
  stats: { maxHP: number; physicalDamage: number; armor: number; critChance: number };
  timerDurationMs: number;
  onTimerExpire: () => void;
  onDone: () => void;
  baseStatSelectors?: ReactNode; // Slot for round-1 base stat UI
}
```

Row 1: "FORGE PHASE" gold, R{round} pill, Timer component, Done button.
Row 2: HP/DMG/ARM/CRT as colored pills, flux counter with danger state at 0.

Reference existing design tokens from `index.css`. Use Rajdhani for display text. Timer uses existing `<Timer>` component.

Flux at 0: text `text-danger`, animation `timer-pulse`.

- [ ] **Step 2: Verify it renders**

Temporarily import into `Forge.tsx` and confirm it renders at the correct size. Visual check only — no automated test needed for a presentational component.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/ForgeHeader.tsx
git commit -m "feat(forge): add ForgeHeader component with 2-row compact layout"
```

---

### Task 5: Create ForgeGemTray component

**Files:**
- Create: `packages/client/src/components/ForgeGemTray.tsx`

- [ ] **Step 1: Create ForgeGemTray**

Props:

```ts
interface ForgeGemTrayProps {
  stockpile: OrbInstance[];
  registry: DataRegistry;
  selectedOrbUid: string | null;
  equippedUids: Set<string>;   // Dimmed with ⚔ badge
  stagedUids: Set<string>;     // Dimmed with ⚒ badge
  onSelectOrb: (uid: string) => void;
  initialPoolCount: number;    // Locked sizing
}
```

Implementation:
- Uses `useForgeGemSize(initialPoolCount, containerWidth)` for responsive sizing
- `ResizeObserver` on container to measure width (same pattern as Draft.tsx)
- Renders GemCard for each orb with appropriate state styling
- Equipped orbs: `opacity: 0.35`, small "⚔" badge absolutely positioned top-right
- Staged orbs: `opacity: 0.35`, small "⚒" badge absolutely positioned top-right
- Empty state: "All orbs assigned" message when `stockpile.length === 0`
- Label: "STOCKPILE · {count} ORBS"
- Mobile hardening: `touchAction: 'none'`, `WebkitTouchCallout: 'none'`, `userSelect: 'none'`, `onContextMenu` override
- `overflow-y: auto` with styled scrollbar

- [ ] **Step 2: Verify it renders**

Temporarily import and test with mock data. Visual check across phone sizes.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/ForgeGemTray.tsx
git commit -m "feat(forge): add ForgeGemTray component with responsive sizing and state badges"
```

---

### Task 6: Create CombineWorkbench component

**Files:**
- Create: `packages/client/src/components/CombineWorkbench.tsx`

- [ ] **Step 1: Create CombineWorkbench**

Props:

```ts
interface CombineWorkbenchProps {
  comboSlots: [OrbInstance | null, OrbInstance | null, OrbInstance | null];
  registry: DataRegistry;
  canAfford: boolean;
  onSlotClick: (index: number) => void;     // Tap empty slot to place selected gem
  onSlotClear: (index: number) => void;     // Tap filled slot to unstage
  onCombine: () => void;
  onClearAll: () => void;
}
```

Implementation:
- 3 slots rendered horizontally with "+" symbols between and "▶" arrow to result box
- Empty slot: 52px, dashed border `#363650`, "?" placeholder
- Filled slot: 52px, solid element-colored border, shows gem emoji + abbreviated stat
- **Glow signal logic:**
  - Count filled slots. If ≥2:
    - Check `registry.getCombination()` for the filled affix IDs. If a valid compound exists → gold glow
    - Otherwise → white glow (basic stat boost)
  - If <2 filled: no glow
- Gold glow: `box-shadow: 0 0 16px rgba(212,168,52,0.5)`, border `#ecd06a`, CSS animation `pulse-glow` 1.5s
- White glow: `box-shadow: 0 0 12px rgba(255,255,255,0.3)`
- Result box: "?" (no glow), "?" pulsing white (white glow), "✦" gold shimmer (gold glow)
- COMBINE button: gold accent, disabled when <2 slots filled or !canAfford
- CLEAR button: surface-600
- Warm container glow: `box-shadow: inset 0 0 30px rgba(212,168,52,0.04)`

- [ ] **Step 2: Verify it renders with mock data**

Test with 2 mock fire orbs to confirm gold glow appears.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/CombineWorkbench.tsx
git commit -m "feat(forge): add CombineWorkbench with 3-slot layout and glow signals"
```

---

## Chunk 3: UI Components — Item View

### Task 7: Create ItemSocketView component

**Files:**
- Create: `packages/client/src/components/ItemSocketView.tsx`

- [ ] **Step 1: Create ItemSocketView**

Props:

```ts
interface ItemSocketViewProps {
  item: ForgedItem;
  cardId: 'weapon' | 'armor';
  registry: DataRegistry;
  plan: ForgePlan;
  selectedOrbUid: string | null;
  onSocketClick: (slotIndex: number) => void;
  onSocketRemove: (slotIndex: number) => void;
}
```

Implementation:
- Item name + type badge ("WEAPON"/"ARMOR" uppercase, small, #b89868 bg pill)
- Inherent bonuses in teal, negative stats in red
- Base stats in bronze
- Adaptive socket grid: `Math.ceil(slots.length / 2)` columns × 2 rows (3×2 for 6 slots)
- Each socket 48px rounded square:
  - Empty: `bg-surface-800`, dashed border, inset shadow
  - Filled: element-colored bg at 20%, solid element border, emoji centered, short affix name below
  - Locked (previous round): 🔒 overlay, no click handler
  - Available (gem selected): gold glow pulse animation
- Equipped affixes list below sockets: compact text "🔥 Fire Attack +23 Phys Dmg"
- All sockets `touchAction: 'none'`

- [ ] **Step 2: Verify it renders**

Test with mock item data — empty sockets, some filled.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/ItemSocketView.tsx
git commit -m "feat(forge): add ItemSocketView with adaptive socket grid"
```

---

### Task 8: Create ItemMiniPreview component

**Files:**
- Create: `packages/client/src/components/ItemMiniPreview.tsx`

- [ ] **Step 1: Create ItemMiniPreview**

Props:

```ts
interface ItemMiniPreviewProps {
  item: ForgedItem;
  itemType: 'weapon' | 'armor';
  registry: DataRegistry;
  onClick: () => void;
}
```

Implementation:
- 36px tall bar, full width, `bg-surface-800`, border-top `#252536`
- Left: item icon (⚔/🛡) + base item name
- Center: socket dots — filled dots colored by element, empty dots #363650
- Right: "2/6" filled count
- Cursor pointer, hover brightens, tappable

- [ ] **Step 2: Verify it renders**

Test with mock data.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/ItemMiniPreview.tsx
git commit -m "feat(forge): add ItemMiniPreview bar with socket dot indicators"
```

---

## Chunk 4: Main Page Rewrite

### Task 9: Rewrite Forge.tsx as orchestrator

**Files:**
- Rewrite: `packages/client/src/pages/Forge.tsx`
- Rewrite: `packages/client/src/pages/__tests__/Forge.test.tsx`

- [ ] **Step 1: Plan the new Forge.tsx structure**

The new file should be ~300-400 lines (down from 1170). It orchestrates:

```
Forge.tsx
├── ForgeHeader (sticky)
│   └── Base stat selectors (R1 only)
├── Tab bar (Plan & Combine | Equip)
├── ForgeGemTray (persistent, both tabs)
└── Tab content:
    ├── Tab 1: CombineWorkbench
    └── Tab 2: ItemSocketView + ItemMiniPreview
```

Key responsibilities:
- Initialize forge plan on mount / round change (keep existing logic from old Forge.tsx)
- Wire store state to child components
- Handle gem selection → slot/socket placement flow
- Handle combine execution (call `applyAction({ kind: 'combine', ... })`)
- Handle commit flow (replay plan actions through gateway)
- Handle AI forge (keep existing logic)
- Timer auto-commit
- Entry animations (phase-enter on mount)

- [ ] **Step 2: Implement the new Forge.tsx**

Port these sections from the old Forge.tsx:
- `useEffect` for plan initialization (lines 647-674)
- `useEffect` for flux popup tracking (lines 677-689)
- `handleCommit` callback (lines 692-726)
- `handleTimerExpire` (lines 729-732)
- AI forge dispatch (lines 705-722)

New logic:
- Tab state from `useForgeStore(s => s.activeTab)`
- Gem selection: `handleSelectOrb(uid)` — if in equip tab and socket available, prompt placement; if in combine tab and slot available, stage it
- Socket click handler: `handleSocketClick(slotIndex)` — if gem selected, call `applyAction({ kind: 'assign_orb', ... })`
- Combine slot click handler: `handleComboSlotClick(index)` — if gem selected, stage it; if slot filled, unstage it
- Combine handler: extract first 2 filled UIDs from `comboSlots`, call `applyAction({ kind: 'combine', orbUid1, orbUid2 })`. 3rd slot is held for future engine support.
- Tab switching: `forgeStore.setActiveTab(tab)`
- Item switching: `forgeStore.setActiveItemTab(tab)`
- `initialPoolCountRef` to lock gem sizing per round — set to `plan.stockpile.length` on plan init, reset on round change via the existing `useEffect` dependency on round
- Confirmation modal (reuse existing `<Modal>` component)
- `DisconnectOverlay` for PvP (keep existing)
- **Base stat selectors (R1 only):** Render styled pill dropdowns between header and gem tray when `round === 1`. Port existing base stat logic from old Forge.tsx (lines 643-644, 928-937). Use custom styled `<select>` elements with game UI appearance (bg #252536, border #363650, text white, Rajdhani font). Hidden for rounds 2-3.
- **Flux exhaustion toast:** When a player taps a disabled action (combine/assign with 0 flux), show a brief toast "Not enough flux" near the flux counter. Use absolute positioning, 0.8s `fadeInOut` animation, then remove from DOM. Track with `useState<string | null>` for the toast message.
- **Accessibility:** Add `role="button"` and `aria-label` to gem cards (delegated to ForgeGemTray). Add `aria-selected` to tab buttons. Add `aria-live="polite"` to combine result region in CombineWorkbench.

- [ ] **Step 3: Delete the old inline components**

The old `ItemCard`, `StatsBar`, `SynergyTracker`, `FluxCounter`, `FluxPopup`, `CombinationWorkbench`, `DragGhost` inlined in the old Forge.tsx are all replaced by the new component files. Remove them.

- [ ] **Step 3b: Update Forge.test.tsx**

Rewrite `packages/client/src/pages/__tests__/Forge.test.tsx` to test the new component structure. At minimum test:
- Renders ForgeHeader with correct round/flux
- Renders ForgeGemTray with stockpile orbs
- Tab bar renders with both tabs
- Default tab is "Plan & Combine"

- [ ] **Step 4: Verify the app builds**

Run: `cd packages/client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Verify the forge screen loads**

Start dev server, navigate to forge via an AI match. Visual check that:
- Header renders with 2 rows
- Gem tray shows all orbs
- Tab switching works
- Combine tab shows workbench
- Equip tab shows item sockets

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "feat(forge): rewrite Forge.tsx as two-tab orchestrator

Replaces 1170-line monolith with ~350-line orchestrator.
Components extracted to ForgeHeader, ForgeGemTray, CombineWorkbench,
ItemSocketView, ItemMiniPreview."
```

---

## Chunk 5: Animations and Polish

### Task 10: Add entry and combine animations

**Files:**
- Create: `packages/client/src/animation/hooks/useForgeAnimations.tsx`
- Modify: `packages/client/src/pages/Forge.tsx` (wire animations)

- [ ] **Step 1: Create useForgeAnimations hook**

Exports:
- `useForgeEntryAnimation(gemTrayRef)` — staggered gem cascade on mount
- `useCombineAnimation(callback)` — returns `triggerCombine(slotRefs, trayRef)` that runs shrink→flash→pop sequence

Entry animation: Each gem uses Web Animations API `element.animate()` with staggered delays (index × 25ms). Keyframes: `[{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'scale(1)' }]` with `easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'` (spring-like overshoot), duration 300ms. Workbench slides up via WAAPI (0.3s ease-out, translateY 20px → 0).

Combine animation: Use Web Animations API on actual DOM elements.
1. Staged gems shrink + glow (300ms)
2. Flash (100ms white overlay)
3. New gem pops in with `scale-pop` animation

- [ ] **Step 2: Wire animations into Forge.tsx**

Add refs to gem tray and workbench containers. Call `useForgeEntryAnimation` on mount. Call `triggerCombine` when combine succeeds.

- [ ] **Step 3: Visual test**

Navigate to forge, observe entry cascade. Combine two orbs, observe animation.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/animation/hooks/useForgeAnimations.tsx packages/client/src/pages/Forge.tsx
git commit -m "feat(forge): add entry cascade and combine animations"
```

---

### Task 11: Add sound effects

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

- [ ] **Step 1: Add playSound calls**

Wire sound effects per the spec's sound design table. Use existing `playSound` from `shared/utils/sound-manager.ts`. For new sounds (`clink`, `forgeHammer`), stub with existing sounds:
- `clink` → use `orbSelect`
- `forgeHammer` → use `combineMerge`

Places to add:
- `handleSelectOrb` → `playSound('orbSelect')`
- `handleComboSlotClick` (stage) → `playSound('orbSelect')` (stub for clink)
- `handleCombine` success → `playSound('combineMerge')` (stub for forgeHammer)
- `handleCombine` fail → `playSound('combineFail')`
- `handleSocketClick` (place) → `playSound('orbPlace')`
- `handleSocketRemove` → `playSound('orbRemove')`
- Tab switch → `playSound('buttonClick')`

- [ ] **Step 2: Verify sounds play**

Navigate through forge flow, confirm sounds fire on each action.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "feat(forge): wire sound effects for all forge interactions"
```

---

## Chunk 6: E2E Tests

### Task 12: Rewrite forge e2e tests

**Files:**
- Rewrite: `packages/client/e2e/forge-redesign.spec.ts`

- [ ] **Step 1: Write F01-F10 tests**

```ts
test.describe('Forge Redesign v2', () => {
  test.beforeEach(async ({ page }) => {
    await startMatch(page);
    await completeDraft(page);
    await waitForPhase(page, 'forge');
  });

  test('F01: all stockpile gems visible on load', async ({ page }) => {
    const gems = page.locator('[data-gem]');
    await expect(gems.first()).toBeVisible();
    const count = await gems.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('F02: tap gem to select, tap again to deselect', async ({ page }) => {
    const gem = page.locator('[data-gem]').first();
    await gem.click();
    await expect(gem).toHaveClass(/selected/);
    await gem.click();
    await expect(gem).not.toHaveClass(/selected/);
  });

  test('F03: tab switching preserves gem tray', async ({ page }) => {
    const gemsBefore = await page.locator('[data-gem]').count();
    await page.click('[data-tab="equip"]');
    const gemsAfter = await page.locator('[data-gem]').count();
    expect(gemsAfter).toBe(gemsBefore);
  });

  // F04-F10: stage/unstage combo slots, glow signal, combine,
  // socket placement, socket removal, item tab switching, mini preview
});
```

Implement remaining tests F04-F19 following the spec's acceptance criteria.

- [ ] **Step 2: Run e2e tests**

Run: `cd packages/client && npx playwright test forge-redesign --reporter=line`
Expected: ALL PASS across 4 device profiles

- [ ] **Step 3: Fix any failures**

Iterate on implementation until all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/forge-redesign.spec.ts
git commit -m "test(forge): rewrite e2e tests for two-tab forge redesign (F01-F19)"
```

---

## Chunk 7: Cleanup

### Task 13: Remove old forge mockup/screenshot files

**Files:**
- Delete: `packages/client/forge-mockups.html`
- Delete: `packages/client/forge-mockup-v2.html`
- Delete: `packages/client/forge-mockup-v3.html`
- Delete: `packages/client/forge-mockup-v4.html` (keep as reference? user decides)
- Delete: `packages/client/e2e/forge-screenshots.ts`
- Delete: `packages/client/e2e/forge-screenshots.spec.ts`
- Delete: `packages/client/e2e/forge-mockup-screenshots.spec.ts`
- Delete: `packages/client/e2e/take-mockup-shots.mjs`

- [ ] **Step 1: Ask user which files to keep vs delete**

The v4 mockup may be useful as a visual reference. Confirm before deleting.

- [ ] **Step 2: Delete confirmed files and commit**

```bash
git add -u
git commit -m "chore(forge): clean up mockup and screenshot files"
```

---

### Task 14: Final integration test

- [ ] **Step 1: Run full test suite**

```bash
cd packages/client && npx vitest run
cd packages/client && npx playwright test --reporter=line
```

- [ ] **Step 2: Fix any regressions**

- [ ] **Step 3: Final commit if needed**

---

## Execution Order

Tasks can be parallelized where noted:

```
Task 1 (store) ──┐
Task 2 (stats) ──┼── Independent, can run in parallel
Task 3 (sizing) ─┘
        │
        ▼
Task 4 (header) ──┐
Task 5 (gem tray) ┼── Independent, can run in parallel
Task 6 (workbench)┤
Task 7 (sockets) ─┤
Task 8 (mini bar) ┘
        │
        ▼
Task 9 (Forge.tsx rewrite) ── Sequential, depends on all above
        │
        ▼
Task 10 (animations) ─┐
Task 11 (sounds) ─────┼── Independent, can run in parallel
        │              │
        ▼              │
Task 12 (e2e tests) ◄─┘
        │
        ▼
Task 13 (cleanup) → Task 14 (final test)
```
