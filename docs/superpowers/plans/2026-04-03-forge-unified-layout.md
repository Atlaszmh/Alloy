# Forge Unified Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the forge screen's two-tab layout into a single scrollable panel with pinned workbench + stockpile at the bottom.

**Architecture:** Remove tab state from `forgeStore`, render items and workbench simultaneously in `Forge.tsx`, and compact `CombineWorkbench` into an inline bar. No engine changes needed — this is a pure UI restructuring.

**Tech Stack:** React 19, Zustand 5, TailwindCSS v4, responsive tokens (`--gap-*`, `--gem-size-*`, `--socket-size`, `--text-*`)

**Design Spec:** `docs/superpowers/specs/2026-04-03-forge-unified-layout-design.md`

**Pattern References:**
- Responsive tokens: `docs/superpowers/specs/2026-03-31-responsive-token-system-design.md` — use `--gap-*`, `--text-*`, `--gem-size-*` tokens, never raw px
- Draft screen quality bar (memory: `project_draft_locked_in`) — mobile hardening, actual DOM animation, no reflows
- Screen shell pattern: `flex h-full flex-col`, header `flex-shrink: 0`, content `flex: 1`, tray `flex-shrink: 0`

---

## Chunk 1: Store Cleanup + Tests

### Task 1: Remove tab state from forgeStore

**Files:**
- Modify: `packages/client/src/stores/forgeStore.ts`
- Modify: `packages/client/src/stores/forgeStore.test.ts`

- [ ] **Step 1: Update forgeStore — remove tab state**

Remove from `ForgeStoreState` interface:
```typescript
// DELETE these lines:
activeTab: 'combine' | 'equip';
activeItemTab: 'weapon' | 'armor';
setActiveTab: (tab: 'combine' | 'equip') => void;
setActiveItemTab: (tab: 'weapon' | 'armor') => void;
```

Remove from initial state:
```typescript
// DELETE these lines:
activeTab: 'combine',
activeItemTab: 'weapon',
```

Remove from `initPlan`:
```typescript
// DELETE from the set() call inside initPlan:
activeTab: 'combine',
activeItemTab: 'weapon',
```

Remove the action implementations:
```typescript
// DELETE these lines:
setActiveTab: (tab) => set({ activeTab: tab }),
setActiveItemTab: (tab) => set({ activeItemTab: tab }),
```

Remove from `reset`:
```typescript
// DELETE from the set() call inside reset:
activeTab: 'combine',
activeItemTab: 'weapon',
```

- [ ] **Step 2: Update forgeStore.test.ts — remove tab tests, update assertions**

Delete the entire `describe('tabs', ...)` block (lines ~162-176).

Update the `'starts with no plan'` test — remove:
```typescript
expect(s.activeTab).toBe('combine');
expect(s.activeItemTab).toBe('weapon');
```

Update the `'clears all state'` reset test — remove:
```typescript
useForgeStore.getState().setActiveTab('equip');
// ...
expect(s.activeTab).toBe('combine');
expect(s.activeItemTab).toBe('weapon');
```

- [ ] **Step 3: Run forgeStore tests**

Run: `cd packages/client && npx vitest run src/stores/forgeStore.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/stores/forgeStore.ts packages/client/src/stores/forgeStore.test.ts
git commit -m "refactor: remove tab state from forgeStore"
```

---

## Chunk 2: CombineWorkbench Compact Layout

### Task 2: Flatten CombineWorkbench to a single-row bar

**Files:**
- Modify: `packages/client/src/components/CombineWorkbench.tsx`

- [ ] **Step 1: Rewrite CombineWorkbench layout**

Replace the outer `<section>` with a compact bar. The new layout is a single horizontal row: slots + arrow + result + buttons. All internal components (`Slot`, `ResultBox`) and logic (`computeGlowSignal`) stay identical.

**Deliberate token changes** (compact bar needs tighter spacing):
- `+` separator `fontSize`: `16px` → `var(--text-sm)` (responsive token)
- Arrow `marginLeft/Right`: `var(--gap-sm)` → `var(--gap-xs)` (tighter for inline layout)

Replace the return JSX of the `CombineWorkbench` function (starting from `return (` through closing `);`) with:

```tsx
return (
  <div
    style={{
      padding: 'var(--gap-sm) var(--gap-md)',
      borderTop: '1px solid var(--color-surface-700)',
    }}
  >
    <div className="flex items-center justify-center gap-1.5">
      {comboSlots.map((orb, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          {idx > 0 && (
            <span
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-surface-300)',
                fontFamily: 'var(--font-family-display)',
                fontWeight: 700,
              }}
            >
              +
            </span>
          )}
          <Slot
            index={idx}
            orb={orb}
            registry={registry}
            glowSignal={glowSignal}
            isDragging={isDragging}
            onClick={() => onSlotClick(idx)}
          />
        </div>
      ))}

      {/* Arrow */}
      <span
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-surface-300)',
          marginLeft: 'var(--gap-xs)',
          marginRight: 'var(--gap-xs)',
        }}
      >
        {'\u25B6'}
      </span>

      {/* Result box */}
      <ResultBox glowSignal={glowSignal} />

      {/* Buttons inline */}
      <div className="flex gap-1.5" style={{ marginLeft: 'var(--gap-md)' }}>
        <HapticButton
          variant="primary"
          size="sm"
          disabled={filledCount < 2 || !canAfford}
          onClick={onCombine}
        >
          COMBINE
        </HapticButton>
        <HapticButton
          variant="secondary"
          size="sm"
          disabled={filledCount === 0}
          onClick={onClearAll}
        >
          CLEAR
        </HapticButton>
      </div>
    </div>
  </div>
);
```

- [ ] **Step 2: Run Forge page tests to verify workbench still renders**

Run: `cd packages/client && npx vitest run src/pages/__tests__/Forge.test.tsx`
Expected: The test `'renders combination workbench on combine tab'` should still find COMBINE and CLEAR buttons.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/CombineWorkbench.tsx
git commit -m "refactor: compact CombineWorkbench into single-row bar"
```

---

## Chunk 3: Forge.tsx Unified Layout

### Task 3: Restructure Forge.tsx — remove tabs, unify layout

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

This is the main change. The current structure is:
```
ForgeHeader → TabBar → (Combine | Equip conditional) → GemTray
```

The new structure is:
```
ForgeHeader → Items (scrollable) → CombineWorkbench (pinned) → GemTray (pinned)
```

- [ ] **Step 1: Remove tab imports and references in Forge.tsx**

Remove the `activeTab` selector (line 49: `const activeTab = useForgeStore(s => s.activeTab);`) and `setActiveTab` from the actions destructure (line 60). Search for all remaining `activeTab` references and remove them. Remove the `tabBarJSX` block entirely (the `const tabBarJSX = (...)` and its rendering `{tabBarJSX}`) — this implicitly removes the `playSound('buttonClick')` calls that were in the tab button onClick handlers.

- [ ] **Step 2: Restructure the main return JSX**

Replace the layout from `{/* 2. Tab bar */}` through `{/* 4. Gem tray */}` closing `</div>` with the new unified layout. The key structural change:

```tsx
{/* 2. Items area — scrollable middle */}
<div
  className="overflow-y-auto"
  style={{ flex: 1, minHeight: 0, padding: 'var(--gap-sm) var(--gap-md)' }}
>
  <div style={{ display: 'flex', gap: 0 }}>
    <div style={{ flex: 1, minWidth: 0, paddingRight: 'var(--gap-md)' }} data-item-card="weapon">
      <ItemSocketView
        item={plan.loadout.weapon}
        cardId="weapon"
        registry={registry}
        plan={plan}
        selectedOrbUid={selectedOrbUid}
        onSocketClick={(slotIndex) => handleSocketClick('weapon', slotIndex)}
        onSocketRemove={(slotIndex) => handleSocketRemove('weapon', slotIndex)}
      />
    </div>
    <div style={{
      width: 1,
      alignSelf: 'stretch',
      background: 'linear-gradient(to bottom, transparent, var(--color-surface-500) 15%, var(--color-surface-500) 85%, transparent)',
      flexShrink: 0,
    }} />
    <div style={{ flex: 1, minWidth: 0, paddingLeft: 'var(--gap-md)' }} data-item-card="armor">
      <ItemSocketView
        item={plan.loadout.armor}
        cardId="armor"
        registry={registry}
        plan={plan}
        selectedOrbUid={selectedOrbUid}
        onSocketClick={(slotIndex) => handleSocketClick('armor', slotIndex)}
        onSocketRemove={(slotIndex) => handleSocketRemove('armor', slotIndex)}
      />
    </div>
  </div>
</div>

{/* 3. Combine workbench — pinned above stockpile */}
<div style={{ flexShrink: 0 }}>
  <CombineWorkbench
    comboSlots={comboSlots}
    registry={registry}
    canAfford={plan.tentativeFlux >= balance.fluxCosts.combineOrbs}
    onSlotClick={handleComboSlotClick}
    onCombine={handleCombine}
    onClearAll={() => { clearComboSlots(); playSound('buttonClick'); }}
  />
</div>

{/* 4. Gem tray — pinned at bottom */}
<div style={{ flexShrink: 0, padding: '0 var(--gap-md) var(--gap-sm)' }}>
  <ForgeGemTray
    stockpile={plan.stockpile}
    registry={registry}
    selectedOrbUid={selectedOrbUid}
    equippedUids={equippedUids}
    stagedUids={stagedUids}
    onSelectOrb={handleSelectOrb}
    onPointerDown={handlePointerDown}
    dragUid={null}
  />
</div>
```

**Critical:** Preserve the `data-item-card="weapon"` and `data-item-card="armor"` wrapper divs — the drag system's `findDropTarget` uses `closest('[data-item-card]')`.

- [ ] **Step 3: Remove the `key={activeTab}` from the scrollable area**

The old code had `key={activeTab}` to force remount on tab switch. Remove this since there are no tabs. Also remove the `animation: 'fade-in 0.2s ease-out'` style that was for the tab transition.

- [ ] **Step 4: Run all Forge tests**

Run: `cd packages/client && npx vitest run src/pages/__tests__/Forge.test.tsx`

Some tests will need updating (next task). Note which fail.

- [ ] **Step 5: Commit the layout change**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "feat: unify forge layout into single panel with pinned workbench"
```

---

### Task 4: Update Forge.test.tsx for unified layout

**Files:**
- Modify: `packages/client/src/pages/__tests__/Forge.test.tsx`

- [ ] **Step 1: Remove tab-related test setup and assertions**

In `setupStores()`, remove from the `useForgeStore.setState()` call:
```typescript
// DELETE these lines:
activeTab: 'combine',
activeItemTab: 'weapon',
```

- [ ] **Step 2: Update tests that reference tabs**

**Delete** these tests entirely (they test tab-switching which no longer exists):
- `'renders tab bar with Plan & Combine and Equip tabs'`
- `'switches to equip tab and shows item socket view'`
- `'shows item name in equip tab'`
- `'shows both items side by side in equip tab'`

**Update** `'shows empty sockets in equip tab'` — rename and simplify:
```typescript
it('shows empty sockets for both items', () => {
  setupStores();
  renderForge();

  // Both items visible by default (no tab switch needed)
  const sockets = document.querySelectorAll('[data-forge-socket]');
  expect(sockets.length).toBe(12);
});
```

**Update** `'renders combination workbench on combine tab'` — rename:
```typescript
it('renders combination workbench', () => {
  setupStores();
  renderForge();

  // Workbench always visible (no tab needed)
  expect(screen.getByRole('button', { name: 'COMBINE' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'CLEAR' })).toBeTruthy();
});
```

**Add** a new test verifying the unified layout:
```typescript
it('shows items and workbench simultaneously', () => {
  setupStores();
  renderForge();

  // Items visible
  expect(screen.getByText('Iron Sword')).toBeTruthy();
  expect(screen.getByText('Chainmail')).toBeTruthy();

  // Workbench visible at the same time
  expect(screen.getByRole('button', { name: 'COMBINE' })).toBeTruthy();
});
```

- [ ] **Step 3: Run all tests**

Run: `cd packages/client && npx vitest run src/pages/__tests__/Forge.test.tsx`
Expected: All tests pass.

- [ ] **Step 4: Also run forgeStore tests to confirm no regressions**

Run: `cd packages/client && npx vitest run src/stores/forgeStore.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/__tests__/Forge.test.tsx
git commit -m "test: update Forge tests for unified layout"
```

---

## Chunk 4: Final Verification

### Task 5: Full test suite + visual check

**Files:** None (verification only)

- [ ] **Step 1: Run entire client test suite**

Run: `cd packages/client && npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run engine tests to confirm no cross-package breakage**

Run: `cd packages/engine && npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Build client to verify no compile errors**

Run: `cd packages/client && npx vite build`
Expected: Clean build with no errors.

- [ ] **Step 4: Commit any remaining fixes if needed, then push**

```bash
git push origin main
```
