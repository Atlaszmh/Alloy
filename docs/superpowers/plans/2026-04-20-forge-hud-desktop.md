# Forge HUD Desktop Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a desktop-first HUD layout for the Forge screen, activated at `(min-aspect-ratio: 3/2)`, while keeping the existing portrait mobile layout untouched below that threshold.

**Architecture:** AppShell publishes a binary `data-frame-mode="portrait"|"desktop"` signal on `:root`; `Forge.tsx` branches its render tree on that signal. Existing gem-rendering primitives (`ItemSocketView`, `CombineWorkbench`, `ForgeGemTray`, gateway actions, store selectors) are reused unchanged in the desktop tree — only the composition and layout regions are new.

**Tech Stack:** React 19, TypeScript 5.7, TailwindCSS v4 (`@theme`), Vitest 3, Playwright, Zustand 5. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-04-20-forge-hud-desktop-design.md](../specs/2026-04-20-forge-hud-desktop-design.md)

**Reference mockups** (point-in-time, pixel-for-pixel snapshots of the approved design):
- Empty state: `.superpowers/brainstorm/forge-redesign/mockup-c-hud-v2.html`
- Fully-socketed state: `.superpowers/brainstorm/forge-redesign/mockup-c-hud-v2-filled.html`

---

## File Structure

### New files

| Path | Responsibility |
|------|----------------|
| `packages/client/src/hooks/useFrameMode.ts` | Read `data-frame-mode` attribute from `:root`, subscribe to changes, return `'portrait' \| 'desktop'` |
| `packages/client/src/components/SocketGrid.tsx` | Extracted socket grid primitive (the 2×3 / 3×2 grid + its local `--gem-size` ResizeObserver), consumed by both portrait `ItemSocketView` and desktop `GearWorkspace` |
| `packages/client/src/components/forge-desktop/ForgeDesktop.tsx` | Desktop HUD shell — composes topbar, rails, gear workspace, combine dock, stockpile, ambient backdrop |
| `packages/client/src/components/forge-desktop/ForgeTopBar.tsx` | Full-width desktop topbar (lives, VS/Round, phase label, DONE CTA, Gem Library link) |
| `packages/client/src/components/forge-desktop/CharacterRail.tsx` | Left rail — HP/DMG/ARM/CRT stats + base-stat selectors for weapon/armor |
| `packages/client/src/components/forge-desktop/FluxRail.tsx` | Right rail — 20-pip flux meter, 7-pip filled variant, 3 flux action buttons |
| `packages/client/src/components/forge-desktop/GearWorkspace.tsx` | Center stage — stacks weapon + armor panels, each with `<SocketGrid>` and `<SocketedAffixList>` |
| `packages/client/src/components/forge-desktop/SocketedAffixList.tsx` | Affix line list (one row per socket, element-colored dot + affix name + stat) in socket reading order |
| `packages/client/src/components/forge-desktop/CombineDock.tsx` | Bottom-center dock wrapping `<CombineWorkbench layout="desktop-dock">` |
| `packages/client/src/components/forge-desktop/StockpileStrip.tsx` | 2-row × ≤5-col stockpile grid with empty-cell placeholders when sparse |
| `packages/client/src/components/forge-desktop/AmbientBackdrop.tsx` | CSS-painted anvil silhouette + ember embers (placeholder; real art later) |
| `packages/client/e2e/responsive/probes/forge-desktop-all-visible.ts` | Probe asserting both socket grids, both affix lists, combine dock, flux rail, and both stockpile rows are rendered inside the frame without `scrollHeight > clientHeight` |
| `packages/client/e2e/responsive/specs/forge-desktop-equip.spec.ts` | Responsive spec — desktop HUD equip state, runs at desktop viewports only |
| `packages/client/e2e/responsive/specs/forge-desktop-combine.spec.ts` | Responsive spec — desktop HUD combine state |
| `packages/client/e2e/forge-desktop.spec.ts` | E2E smoke — socket a gem on desktop, verify affix list updates |

### Modified files

| Path | Change |
|------|--------|
| `packages/client/src/components/AppShell.tsx` | ResizeObserver also writes `--frame-w` and `data-frame-mode` on `:root` |
| `packages/client/src/index.css` | New `(min-aspect-ratio: 3/2)` media query releases letterbox; new HUD layout tokens |
| `packages/client/src/components/ItemSocketView.tsx` | Replace inline socket grid with `<SocketGrid>` import |
| `packages/client/src/components/CombineWorkbench.tsx` | Accept optional `layout?: 'portrait' \| 'desktop-dock'` prop |
| `packages/client/src/pages/Forge.tsx` | Import `useFrameMode`; return `<ForgeDesktop />` when mode === 'desktop' |
| `packages/client/e2e/responsive/probes/run-all.ts` | Register `forgeDesktopAllVisible` probe |
| `packages/client/package.json` | Version bump 0.5.1-alpha → 0.6.0-alpha (feature/refactor per project convention) |

### Directory creation

Create `packages/client/src/components/forge-desktop/` at the start of Chunk 3.

---

## Chunk 1: Frame Mode Infrastructure

Establishes the runtime signal, hook, CSS breakpoint, and design tokens the rest of the plan builds on. No visual changes yet — this chunk lands and the app behaves identically to today.

### Task 1.1: `useFrameMode` hook

**Files:**
- Create: `packages/client/src/hooks/useFrameMode.ts`
- Test: `packages/client/src/hooks/useFrameMode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/hooks/useFrameMode.test.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFrameMode } from './useFrameMode';

describe('useFrameMode', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-frame-mode');
  });

  test('defaults to portrait when attribute missing', () => {
    const { result } = renderHook(() => useFrameMode());
    expect(result.current).toBe('portrait');
  });

  test('reads initial value from data-frame-mode', () => {
    document.documentElement.setAttribute('data-frame-mode', 'desktop');
    const { result } = renderHook(() => useFrameMode());
    expect(result.current).toBe('desktop');
  });

  test('updates when attribute changes', () => {
    document.documentElement.setAttribute('data-frame-mode', 'portrait');
    const { result } = renderHook(() => useFrameMode());
    expect(result.current).toBe('portrait');
    act(() => {
      document.documentElement.setAttribute('data-frame-mode', 'desktop');
    });
    expect(result.current).toBe('desktop');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
pnpm --filter @alloy/client exec vitest run src/hooks/useFrameMode.test.ts
```

Expected: FAIL with `Cannot find module './useFrameMode'`.

- [ ] **Step 3: Implement the hook**

```ts
// packages/client/src/hooks/useFrameMode.ts
import { useSyncExternalStore } from 'react';

export type FrameMode = 'portrait' | 'desktop';

function subscribe(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-frame-mode'],
  });
  return () => mo.disconnect();
}

function getSnapshot(): FrameMode {
  const value = document.documentElement.getAttribute('data-frame-mode');
  return value === 'desktop' ? 'desktop' : 'portrait';
}

function getServerSnapshot(): FrameMode {
  return 'portrait';
}

export function useFrameMode(): FrameMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```
pnpm --filter @alloy/client exec vitest run src/hooks/useFrameMode.test.ts
```

Expected: PASS 3/3.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/hooks/useFrameMode.ts packages/client/src/hooks/useFrameMode.test.ts
git commit -m "feat(client): useFrameMode hook — read :root[data-frame-mode] signal"
```

### Task 1.2: AppShell publishes frame-w + data-frame-mode

**Files:**
- Modify: `packages/client/src/components/AppShell.tsx:36-48` (the existing ResizeObserver block)

- [ ] **Step 1: Extend the ResizeObserver**

Replace the body of the `useEffect` that sets `--frame-h` with:

```ts
useEffect(() => {
  const frame = frameRef.current;
  if (!frame) return;
  const root = document.documentElement;
  const DESKTOP_MIN_ASPECT = 1.5; // 3:2 threshold — see 2026-04-20 spec
  const ro = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    root.style.setProperty('--frame-h', `${height}px`);
    root.style.setProperty('--frame-w', `${width}px`);
    // Use viewport aspect (not frame aspect) so the signal matches the
    // media query at (min-aspect-ratio: 3/2) — the frame itself is still
    // locked to 9:16 until the media query releases it in Task 1.3.
    const viewportAspect = window.innerWidth / window.innerHeight;
    const mode = viewportAspect >= DESKTOP_MIN_ASPECT ? 'desktop' : 'portrait';
    root.setAttribute('data-frame-mode', mode);
  });
  ro.observe(frame);
  // Also re-evaluate on window resize in case only the window changed aspect
  // without changing frame content dimensions.
  const onResize = () => {
    const viewportAspect = window.innerWidth / window.innerHeight;
    const mode = viewportAspect >= DESKTOP_MIN_ASPECT ? 'desktop' : 'portrait';
    root.setAttribute('data-frame-mode', mode);
  };
  window.addEventListener('resize', onResize);
  onResize();
  return () => {
    ro.disconnect();
    window.removeEventListener('resize', onResize);
    root.style.removeProperty('--frame-h');
    root.style.removeProperty('--frame-w');
    root.removeAttribute('data-frame-mode');
  };
}, []);
```

- [ ] **Step 2: Manual verification in dev**

```
pnpm --filter @alloy/client dev
```

Open http://localhost:9099 in a browser. Open DevTools and in the Elements panel inspect `<html>`. Verify:
- `style="--frame-h: …; --frame-w: …;"` attribute present
- `data-frame-mode="portrait"` when browser window is narrow
- Resize browser wide (aspect ≥ 3:2) and verify `data-frame-mode` flips to `"desktop"`

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/AppShell.tsx
git commit -m "feat(client): AppShell publishes --frame-w + data-frame-mode to :root"
```

### Task 1.3: CSS media query releases letterbox + adds HUD tokens

**Files:**
- Modify: `packages/client/src/index.css` — add aspect-ratio release + new tokens

- [ ] **Step 1: Add the desktop release media query**

Insert immediately after the existing `@media (max-aspect-ratio: 9/16)` block (around line 315):

```css
/* Desktop landscape (aspect ≥ 3/2) — release the letterbox, fill viewport */
@media (min-aspect-ratio: 3/2) {
  .app-frame {
    aspect-ratio: auto;
    width: 100%;
    height: 100%;
    border-left: none;
    border-right: none;
    border-radius: 0;
    box-shadow: none;
  }
}
```

- [ ] **Step 2: Add HUD layout tokens inside `@theme`**

Append to the `@theme { … }` block (before its closing `}`), after the existing `--tabbar-h` declaration:

```css
/* Desktop HUD layout tokens — aspect-locked to --frame-h so proportions stay
   consistent across ultrawide/4K monitors. Rationale in 2026-04-20 spec. */
--hud-rail-w:        clamp(140px, calc(var(--frame-h, 812px) * 0.20), 220px);
--hud-workbench-h:   clamp(100px, calc(var(--frame-h, 812px) * 0.14), 150px);
--hud-stockpile-h:   clamp(180px, calc(var(--frame-h, 812px) * 0.26), 280px);
--hud-topbar-h:      clamp(44px,  calc(var(--frame-h, 812px) * 0.06), 70px);

/* Tighter gem gap for HUD stockpile + any other dense grid */
--gem-gap-tight:     clamp(4px, calc(var(--frame-h, 812px) * 0.006), 8px);

/* Socket gem size — smaller clamp than the stockpile --gem-size */
--socket-gem-size:   clamp(52px, calc(var(--frame-h, 812px) * 0.085), 88px);
```

- [ ] **Step 3: Manual verification in dev**

Resize browser to 1920×1080. Confirm:
- `.app-frame` now fills the full viewport (no letterbox)
- `getComputedStyle(document.documentElement).getPropertyValue('--hud-rail-w')` returns a clamped value (not empty)

Run in DevTools console:

```js
getComputedStyle(document.documentElement).getPropertyValue('--hud-rail-w');
```

Expected: a non-empty px value (e.g. `"216px"`).

Resize back to narrow portrait — confirm letterbox returns.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/index.css
git commit -m "feat(client): desktop aspect release + HUD layout tokens

Letterbox releases at (min-aspect-ratio: 3/2). Adds --hud-rail-w,
--hud-workbench-h, --hud-stockpile-h, --hud-topbar-h, --gem-gap-tight,
--socket-gem-size — all aspect-locked to --frame-h."
```

### Task 1.4: Chunk 1 review checkpoint

- [ ] **Step 1: Sanity-check the responsive probe matrix still passes**

```
pnpm --filter @alloy/client run test:responsive
```

Expected: same pass/fail baseline as pre-change (95 pass / 1 known iphone-landscape draft exemption). The desktop aspect release should not introduce new failures because no page has opted into the full-bleed layout yet — they still use their own internal flex layouts.

If any viewport starts failing `overflow-x-inner` or `overflow-y`: most likely the now-fuller `.app-frame` on ≥3:2 viewports revealed a page whose content was relying on the letterbox clip. Fix the offending page's max-width or `mx-auto` rather than reverting the media query.

- [ ] **Step 2: Commit fixes (if any)** with a conventional message referencing the affected screen.

---

## Chunk 2: Primitive Preparation

Extract `SocketGrid` from `ItemSocketView` so both portrait and desktop trees render sockets through one primitive. Add the `layout` prop to `CombineWorkbench`. No user-visible changes in this chunk — portrait Forge should render pixel-identical after.

### Task 2.1: Extract `SocketGrid` from `ItemSocketView`

**Files:**
- Create: `packages/client/src/components/SocketGrid.tsx`
- Modify: `packages/client/src/components/ItemSocketView.tsx`
- Test: `packages/client/src/components/SocketGrid.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/components/SocketGrid.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { SocketGrid } from './SocketGrid';

describe('SocketGrid', () => {
  test('renders N empty socket buttons with data-forge-socket indices', () => {
    render(
      <SocketGrid
        cols={3}
        slots={[null, null, null, null, null, null]}
        renderFilledSocket={() => null}
        onEmptyClick={vi.fn()}
      />,
    );
    const empty = screen.getAllByRole('button');
    expect(empty).toHaveLength(6);
    expect(empty[0]).toHaveAttribute('data-forge-socket', '0');
    expect(empty[5]).toHaveAttribute('data-forge-socket', '5');
  });

  test('calls renderFilledSocket for non-null slots', () => {
    const spy = vi.fn(() => <div data-testid="filled" />);
    render(
      <SocketGrid
        cols={3}
        slots={[{ id: 'g1' }, null, null, null, null, null] as any}
        renderFilledSocket={spy}
        onEmptyClick={vi.fn()}
      />,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('filled')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
pnpm --filter @alloy/client exec vitest run src/components/SocketGrid.test.tsx
```

Expected: FAIL (`Cannot find module './SocketGrid'`).

- [ ] **Step 3: Implement `SocketGrid`**

Extract the `useRef` + `ResizeObserver` logic and the grid markup from `ItemSocketView.tsx` (lines 40–195 approximately — the block that renders the sockets grid). Keep the adaptive col-count fallback (3 → 2 → 1) and the local `--gem-size` computation.

```tsx
// packages/client/src/components/SocketGrid.tsx
import { useEffect, useRef, useState } from 'react';
import type { EquippedSlot } from '@alloy/engine';

interface SocketGridProps {
  /** Desired column count at comfortable density. Adaptively reduced if narrow. */
  cols: number;
  slots: (EquippedSlot | null)[];
  renderFilledSocket: (slot: EquippedSlot, index: number) => React.ReactNode;
  onEmptyClick: (index: number) => void;
  isDragging?: boolean;
  /** Optional override for the minimum socket size. Defaults to 48px. */
  minSocketSize?: number;
}

export function SocketGrid({
  cols: maxCols,
  slots,
  renderFilledSocket,
  onEmptyClick,
  isDragging,
  minSocketSize = 48,
}: SocketGridProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<{ size: number; cols: number } | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const styles = getComputedStyle(el);
      const parentGem = parseFloat(styles.getPropertyValue('--gem-size')) || 100;
      const gap = parseFloat(styles.getPropertyValue('--gap-sm')) || 6;
      let nextCols = 1;
      let nextSize = Math.max(minSocketSize, Math.min(parentGem, width));
      for (let c = maxCols; c >= 1; c--) {
        const fit = Math.floor((width - (c - 1) * gap) / c);
        if (fit >= minSocketSize || c === 1) {
          nextCols = c;
          nextSize = Math.max(minSocketSize, Math.min(parentGem, fit));
          break;
        }
      }
      setSocket({ size: nextSize, cols: nextCols });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxCols, minSocketSize]);

  const cols = socket?.cols ?? maxCols;
  const localGemStyle: React.CSSProperties = socket
    ? ({
        '--gem-size': `${socket.size}px`,
        '--gem-radius': `${socket.size * 0.16}px`,
      } as React.CSSProperties)
    : {};

  return (
    <div
      ref={rootRef}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, var(--gem-size))`,
        gap: 'var(--gap-sm)',
        justifyContent: 'center',
        ...localGemStyle,
      }}
    >
      {slots.map((slot, index) => {
        if (slot === null) {
          return (
            <button
              key={index}
              data-forge-socket={index}
              onClick={() => onEmptyClick(index)}
              style={{
                width: 'var(--gem-size)',
                height: 'var(--gem-size)',
                borderRadius: 'var(--gem-radius)',
                background: 'var(--color-surface-800)',
                border: isDragging
                  ? '1.5px dashed var(--color-bronze-light)'
                  : '1.5px dashed var(--color-empty-socket)',
                boxShadow: isDragging
                  ? '0 0 12px rgba(212,168,52,0.4), inset 0 2px 4px rgba(0,0,0,0.5)'
                  : 'inset 0 2px 4px rgba(0,0,0,0.5)',
                cursor: 'pointer',
                touchAction: 'none',
                padding: 0,
                transition: 'box-shadow 0.2s, border-color 0.2s',
              }}
              aria-label={`Empty socket ${index + 1}`}
            />
          );
        }
        return (
          <div key={index} data-forge-socket={index} style={{ display: 'flex', justifyContent: 'center' }}>
            {renderFilledSocket(slot, index)}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Rewire `ItemSocketView` to use `SocketGrid`**

In `packages/client/src/components/ItemSocketView.tsx`, delete the local `rootRef`, `socket`, and `useEffect` block plus the inline grid markup. Replace the grid section with:

```tsx
<SocketGrid
  cols={Math.ceil(item.slots.length / 2)}
  slots={item.slots}
  isDragging={selectedOrbUid !== null || isDragging}
  onEmptyClick={onSocketClick}
  renderFilledSocket={(slot, index) => {
    const orb = slot.gem;
    const affix = registry.getAffix(orb.affixId);
    const isLocked = plan.lockedGemUids.has(orb.uid);
    const statLabel = getStatLabel(affix, orb, cardId);
    return (
      <GemCard
        uid={orb.uid}
        affixId={orb.affixId}
        affixName={affix.name}
        tier={orb.tier}
        rarity={orb.rarity}
        category={affix.category}
        tags={affix.tags}
        statLabel={statLabel}
        onClick={isLocked ? undefined : () => onSocketRemove(index)}
        onPointerDown={isLocked ? undefined : (e) => onGemPointerDown?.(orb.uid, e)}
      />
    );
  }}
/>
```

Remove the now-unused imports (`useEffect`, `useRef`, `useState` if no longer referenced).

- [ ] **Step 5: Run unit tests**

```
pnpm --filter @alloy/client exec vitest run src/components/SocketGrid.test.tsx src/components/ItemSocketView
```

Expected: all pass.

- [ ] **Step 6: Verify portrait Forge is visually unchanged**

```
pnpm --filter @alloy/client dev
```

Open `/match/ai-run-e2e`, trigger a match (use DevDrawer), navigate into Forge. Compare to the current behavior — the socket grid should render identically (same sizing, same empty dashed borders, same filled gem layout).

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/SocketGrid.tsx packages/client/src/components/SocketGrid.test.tsx packages/client/src/components/ItemSocketView.tsx
git commit -m "refactor(client): extract SocketGrid primitive from ItemSocketView

Moves the adaptive col-count + local --gem-size ResizeObserver into a
standalone component so the desktop GearWorkspace can consume the grid
without the card chrome. Portrait ItemSocketView render is pixel-
identical to before."
```

### Task 2.2: `CombineWorkbench` gains a `layout` prop

**Files:**
- Modify: `packages/client/src/components/CombineWorkbench.tsx`

- [ ] **Step 1: Add the prop**

In the `CombineWorkbenchProps` interface, add:

```ts
  /** Layout variant. Default 'portrait' keeps today's rendering. 'desktop-dock'
   *  tightens padding and removes the top border (the dock panel provides one). */
  layout?: 'portrait' | 'desktop-dock';
```

- [ ] **Step 2: Consume the prop**

In the top-level `<div>` of the component's return (currently `style={{ padding: 'var(--gap-sm) var(--gap-md)', borderTop: '1px solid var(--color-surface-700)' }}`), branch on `layout`:

```tsx
const isDock = layout === 'desktop-dock';
return (
  <div
    style={{
      padding: isDock ? 'var(--gap-xs) var(--gap-sm)' : 'var(--gap-sm) var(--gap-md)',
      borderTop: isDock ? 'none' : '1px solid var(--color-surface-700)',
    }}
  >
    …
```

Add `layout = 'portrait'` default to the destructured props.

- [ ] **Step 3: Existing tests still pass**

```
pnpm --filter @alloy/client exec vitest run src/components/CombineWorkbench
```

Expected: all pass (no existing test asserts the padding, and the default branch is identical to today's behavior).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/CombineWorkbench.tsx
git commit -m "feat(client): CombineWorkbench accepts layout='desktop-dock' variant"
```

---

## Chunk 3: Desktop Layout Components

Build the eight new components that compose the HUD. Each is a leaf or near-leaf — no state of its own beyond what's passed in. Render-only; all interactivity flows through callbacks passed from `ForgeDesktop` (and ultimately from `Forge.tsx` via the gateway).

**Important:** Before starting, open the two mockup files referenced at the top of this plan and keep them side-by-side with the implementation. The exact CSS (colors, gradients, shadows, spacing, typography) should match the mockup. This plan provides structure and props; the mockup provides the visual truth.

### Task 3.1: Directory + `AmbientBackdrop`

**Files:**
- Create: `packages/client/src/components/forge-desktop/AmbientBackdrop.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p packages/client/src/components/forge-desktop
```

- [ ] **Step 2: Implement `AmbientBackdrop`**

Extract the `<div class="ambient-backdrop">` (or equivalent) + ember/anvil styles from `mockup-c-hud-v2.html`. Wrap the body and styles in a React component:

```tsx
// packages/client/src/components/forge-desktop/AmbientBackdrop.tsx
/**
 * Placeholder ambient backdrop — CSS-painted anvil silhouette + ember glows.
 * Will be replaced by real art assets in a follow-up commit. Positioned
 * absolutely behind all HUD panels at z-index 0; panels sit at z-index ≥ 1.
 */
export function AmbientBackdrop() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        // Paste the backdrop CSS verbatim from the mockup's corresponding
        // .ambient / .backdrop / .anvil / .embers rules — gradients,
        // radial glows, and any ::before/::after decorative layers.
        // Use <style jsx> (not supported) — instead inline the styles
        // here or lift them into index.css under a .hud-ambient-backdrop
        // class and reference that class from this div.
      }}
      className="hud-ambient-backdrop"
    />
  );
}
```

Add the ambient CSS to `index.css` under `/* ── HUD Ambient Backdrop ── */` section:

```css
.hud-ambient-backdrop {
  background:
    /* paste gradient layers from mockup */
    radial-gradient(ellipse at 50% 80%, rgba(212, 168, 52, 0.08) 0%, transparent 45%),
    radial-gradient(ellipse at 30% 60%, rgba(232, 85, 58, 0.05) 0%, transparent 35%),
    radial-gradient(ellipse at 70% 70%, rgba(232, 85, 58, 0.04) 0%, transparent 30%);
}
/* Optional: add an ::after layer with an anvil silhouette SVG when art lands */
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/forge-desktop/AmbientBackdrop.tsx packages/client/src/index.css
git commit -m "feat(client): HUD AmbientBackdrop placeholder"
```

### Task 3.2: `ForgeTopBar`

**Files:**
- Create: `packages/client/src/components/forge-desktop/ForgeTopBar.tsx`

- [ ] **Step 1: Define the component**

```tsx
// packages/client/src/components/forge-desktop/ForgeTopBar.tsx
import { HapticButton } from '@/components/HapticButton';

interface ForgeTopBarProps {
  lives: number;
  maxLives: number;
  opponentLabel: string;     // e.g. "VS AI T2"
  round: number;
  totalRounds: number;
  streak: number;            // star badge
  round1: boolean;           // true when current round === 1 → show "R1" pill
  onDone: () => void;
  onOpenGemLibrary: () => void;
}
```

- [ ] **Step 2: Render the layout**

Translate the topbar markup from `mockup-c-hud-v2.html` — the row containing hearts, lives label, "VS AI T2 / Round / ★" block, FORGE PHASE header, Gem Library link, DONE button. Use `var(--hud-topbar-h)` for the overall bar height. Wrap in `role="banner"` for accessibility.

- [ ] **Step 3: No unit test**

Pure rendering component — no logic to exercise. Covered by the E2E smoke in Chunk 5.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/forge-desktop/ForgeTopBar.tsx
git commit -m "feat(client): ForgeTopBar desktop layout"
```

### Task 3.3: `CharacterRail`

**Files:**
- Create: `packages/client/src/components/forge-desktop/CharacterRail.tsx`

- [ ] **Step 1: Define the component**

```tsx
interface CharacterRailProps {
  stats: DerivedStats | null;           // existing engine type
  statDeltas?: Partial<Record<keyof DerivedStats, number>>; // optional green +N overlays
  weaponStats: [BaseStat, BaseStat];
  armorStats: [BaseStat, BaseStat];
  onWeaponStatChange: (index: 0 | 1, stat: BaseStat) => void;
  onArmorStatChange: (index: 0 | 1, stat: BaseStat) => void;
  round: number;                         // disable selectors when round > 1
}
```

- [ ] **Step 2: Render**

Use the left-rail markup from `mockup-c-hud-v2.html` / `mockup-c-hud-v2-filled.html`. Stats readout shows HP / DMG / ARM / CRT with colored values. Green `+N` deltas (when present) are rendered next to the value in the `positive` colour (`var(--color-affix)` / `#1eff00`). Base-stat selectors are identical `<select>` elements to those in `Forge.tsx` line 713 — copy the markup and wire the `onChange` to the new callbacks.

Base-stat selectors are disabled (`disabled` attribute) when `round > 1`, matching the existing portrait-Forge behavior (selectors are only rendered at R1 there).

Width: `var(--hud-rail-w)`.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/forge-desktop/CharacterRail.tsx
git commit -m "feat(client): CharacterRail desktop left rail — stats + stat selectors"
```

### Task 3.4: `FluxRail`

**Files:**
- Create: `packages/client/src/components/forge-desktop/FluxRail.tsx`

- [ ] **Step 1: Define the component**

```tsx
interface FluxRailProps {
  currentFlux: number;
  maxFlux: number;
  onBoost: () => void;         // -3 flux, boosts next combine
  onReroll: () => void;        // -5 flux, rerolls pool
  onGuaranteeRarity: () => void; // -4 flux, guarantees rare
}
```

- [ ] **Step 2: Render**

Translate the right-rail markup from the mockups: vertical 20-pip flux meter (rotated from the existing horizontal meter in `ForgeHeader`), "X/20" counter, three `<HapticButton>` CTAs ("Boost (3)", "Reroll (5)", "Rarity (4)"), each disabled when `currentFlux < cost`. Use `role="meter"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax` on the meter container.

Width: `var(--hud-rail-w)`.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/forge-desktop/FluxRail.tsx
git commit -m "feat(client): FluxRail desktop right rail — 20-pip meter + 3 action CTAs"
```

### Task 3.5: `SocketedAffixList`

**Files:**
- Create: `packages/client/src/components/forge-desktop/SocketedAffixList.tsx`

- [ ] **Step 1: Define the component**

```tsx
import type { EquippedSlot, DataRegistry } from '@alloy/engine';

interface SocketedAffixListProps {
  slots: (EquippedSlot | null)[];
  cardId: 'weapon' | 'armor';
  registry: DataRegistry;
}
```

- [ ] **Step 2: Render**

Iterate `slots` in order. For each non-null slot: look up `registry.getAffix(slot.gem.affixId)` → find its primary element tag (from the `ELEMENTS` constant already in `ItemSocketView.tsx`) → emit a row with:
- colored dot (element color from existing `ELEMENT_EMOJIS` / `ELEMENT_GRADIENTS` maps)
- affix name (bold, white)
- stat value (right-aligned, element color, from `getStatLabel(affix, orb, cardId)`)
- optional rarity pill for Rare+ (e.g. gold border + "R" label) — see filled-state mockup for visual

Empty slots render as dim "empty" placeholder rows with dashed left-border (matching the mockup's "— no gems socketed —" treatment for the all-empty case, but per-row when partially filled).

Row order maps 1:1 to socket reading order (left-to-right, top-to-bottom) so the user can visually trace socket → affix.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/forge-desktop/SocketedAffixList.tsx
git commit -m "feat(client): SocketedAffixList — per-socket affix rows mapped to grid order"
```

### Task 3.6: `GearWorkspace`

**Files:**
- Create: `packages/client/src/components/forge-desktop/GearWorkspace.tsx`

- [ ] **Step 1: Define the component**

```tsx
interface GearWorkspaceProps {
  plan: ForgePlan;
  registry: DataRegistry;
  selectedOrbUid: string | null;
  isDragging: boolean;
  onSocketClick: (card: 'weapon' | 'armor', slotIndex: number) => void;
  onSocketRemove: (card: 'weapon' | 'armor', slotIndex: number) => void;
  onGemPointerDown: (uid: string, e: React.PointerEvent) => void;
}
```

- [ ] **Step 2: Render two gear panels (weapon on top, armor below)**

Each panel contains:
1. Item header — base item name (Mace / Plate) + type badge (WEAPON / ARMOR).
2. Base stats row — `baseItem.baseStats` entries rendered in bronze.
3. `<SocketGrid cols={Math.ceil(slots.length / 2)} slots={plan.loadout.weapon.slots} renderFilledSocket={…} onEmptyClick={…} />` — uses the primitive from Chunk 2.
4. `<SocketedAffixList slots={plan.loadout.weapon.slots} cardId="weapon" registry={registry} />` below the socket grid.

Lay out the two panels vertically with `gap: var(--gap-md)`. The panel background is a surface gradient matching the mockup's gear-panel style. Each panel has a border + subtle glow consistent with Alloy's forged-metal aesthetic.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/forge-desktop/GearWorkspace.tsx
git commit -m "feat(client): GearWorkspace — center stage with two gear panels"
```

### Task 3.7: `CombineDock`

**Files:**
- Create: `packages/client/src/components/forge-desktop/CombineDock.tsx`

- [ ] **Step 1: Define the component**

```tsx
interface CombineDockProps {
  comboSlots: [GemInstance | null, GemInstance | null, GemInstance | null];
  registry: DataRegistry;
  canAfford: boolean;
  preview: CombinePreview | null;
  isDragging: boolean;
  onSlotClick: (index: number) => void;
  onCombine: () => void;
  onClearAll: () => void;
  onPointerDown: (uid: string, e: React.PointerEvent) => void;
}
```

- [ ] **Step 2: Wrap `<CombineWorkbench>` inside a dock panel**

```tsx
import { CombineWorkbench } from '@/components/CombineWorkbench';

export function CombineDock(props: CombineDockProps) {
  return (
    <div
      role="toolbar"
      aria-label="Combine workbench"
      style={{
        height: 'var(--hud-workbench-h)',
        // dock panel surface + border per mockup
        background: 'linear-gradient(180deg, var(--color-surface-800), var(--color-surface-900))',
        borderTop: '1px solid var(--color-surface-600)',
        borderBottom: '1px solid var(--color-surface-600)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CombineWorkbench layout="desktop-dock" {...props} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/forge-desktop/CombineDock.tsx
git commit -m "feat(client): CombineDock — desktop-dock wrapper around CombineWorkbench"
```

### Task 3.8: `StockpileStrip`

**Files:**
- Create: `packages/client/src/components/forge-desktop/StockpileStrip.tsx`

- [ ] **Step 1: Define the component**

```tsx
interface StockpileStripProps {
  stockpile: GemInstance[];
  registry: DataRegistry;
  selectedOrbUid: string | null;
  equippedUids: Set<string>;
  stagedUids: Set<string>;
  onSelectOrb: (uid: string) => void;
  onPointerDown: (uid: string, e: React.PointerEvent) => void;
}
```

- [ ] **Step 2: Render a 2-row × ≤5-col grid**

- Grid: `grid-template-columns: repeat(5, minmax(0, 1fr))` with `grid-template-rows: repeat(2, 1fr)` and `gap: var(--gem-gap-tight)`.
- Height: `var(--hud-stockpile-h)`.
- Render the same `GemCard` primitives used in `ForgeGemTray` — import and reuse `GemCard`, not the entire `ForgeGemTray` (we want tight packing without the stockpile label chrome).
- When fewer than 10 gems are in the pool, render dim empty-cell placeholders for the remaining slots (subtle dashed outline, `opacity: 0.15`) so the 5×2 grid shape stays constant. This matches the filled-state mockup.
- Skip staged gems (same rule as existing `ForgeGemTray`).

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/forge-desktop/StockpileStrip.tsx
git commit -m "feat(client): StockpileStrip — 2-row tight-pack stockpile grid"
```

### Task 3.9: Chunk 3 review checkpoint

- [ ] **Step 1: Typecheck + lint**

```
pnpm --filter @alloy/client exec tsc -b
```

Expected: clean.

- [ ] **Step 2: No remaining `any`-typed props**

```
pnpm --filter @alloy/client exec eslint src/components/forge-desktop --max-warnings 0
```

Expected: zero errors, zero warnings.

- [ ] **Step 3: Unit tests** (from Chunks 1–2)

```
pnpm --filter @alloy/client exec vitest run
```

Expected: all pass.

No commit in this step — review-only.

---

## Chunk 4: Composition + Mode Branching

Compose the desktop HUD from the components built in Chunk 3 and branch `Forge.tsx` on `useFrameMode()`. This is the chunk where the desktop layout becomes user-visible.

### Task 4.1: `ForgeDesktop` composition

**Files:**
- Create: `packages/client/src/components/forge-desktop/ForgeDesktop.tsx`

- [ ] **Step 1: Accept the same prop surface `Forge.tsx` already collects**

```tsx
interface ForgeDesktopProps {
  // Run + phase state
  round: 1 | 2 | 3;
  lives: number;
  maxLives: number;
  opponentLabel: string;
  streak: number;
  totalRounds: number;

  // Stats
  derivedStats: DerivedStats | null;

  // Plan (loadout + stockpile)
  plan: ForgePlan;
  registry: DataRegistry;

  // Flux
  currentFlux: number;
  maxFlux: number;

  // Combo state
  comboSlots: [GemInstance | null, GemInstance | null, GemInstance | null];
  combinePreview: CombinePreview | null;
  canAffordCombine: boolean;

  // Base stats
  weaponStats: [BaseStat, BaseStat];
  armorStats: [BaseStat, BaseStat];

  // Callbacks (all existing, already dispatched from Forge.tsx)
  onDone: () => void;
  onOpenGemLibrary: () => void;
  onBoost: () => void;
  onReroll: () => void;
  onGuaranteeRarity: () => void;
  onWeaponStatChange: (index: 0 | 1, stat: BaseStat) => void;
  onArmorStatChange: (index: 0 | 1, stat: BaseStat) => void;
  onSocketClick: (card: 'weapon' | 'armor', slotIndex: number) => void;
  onSocketRemove: (card: 'weapon' | 'armor', slotIndex: number) => void;
  onComboSlotClick: (index: number) => void;
  onCombine: () => void;
  onClearComboSlots: () => void;
  onSelectOrb: (uid: string) => void;
  onGemPointerDown: (uid: string, e: React.PointerEvent) => void;
  selectedOrbUid: string | null;

  // Drag flag (passed through from Forge.tsx drag state)
  isDragging: boolean;

  // Derived UID sets for stockpile rendering
  equippedUids: Set<string>;
  stagedUids: Set<string>;
}
```

- [ ] **Step 2: Compose the regions**

```tsx
export function ForgeDesktop(props: ForgeDesktopProps) {
  return (
    <div
      data-screen="forge-desktop"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: 'var(--hud-rail-w) 1fr var(--hud-rail-w)',
        gridTemplateRows: 'var(--hud-topbar-h) 1fr var(--hud-workbench-h) var(--hud-stockpile-h)',
        gridTemplateAreas: `
          "topbar  topbar  topbar"
          "left    center  right"
          "dock    dock    dock"
          "stock   stock   stock"
        `,
        gap: 'var(--gap-sm)',
        padding: 'var(--gap-sm) var(--gap-md)',
        background: 'var(--color-surface-950)',
      }}
    >
      <AmbientBackdrop />
      <div style={{ gridArea: 'topbar', zIndex: 1 }}>
        <ForgeTopBar
          lives={props.lives}
          maxLives={props.maxLives}
          opponentLabel={props.opponentLabel}
          round={props.round}
          totalRounds={props.totalRounds}
          streak={props.streak}
          round1={props.round === 1}
          onDone={props.onDone}
          onOpenGemLibrary={props.onOpenGemLibrary}
        />
      </div>
      <div style={{ gridArea: 'left', zIndex: 1, overflow: 'hidden' }}>
        <CharacterRail
          stats={props.derivedStats}
          weaponStats={props.weaponStats}
          armorStats={props.armorStats}
          onWeaponStatChange={props.onWeaponStatChange}
          onArmorStatChange={props.onArmorStatChange}
          round={props.round}
        />
      </div>
      <div style={{ gridArea: 'center', zIndex: 1, overflow: 'hidden' }} data-screen-section="forge-gear">
        <GearWorkspace
          plan={props.plan}
          registry={props.registry}
          selectedOrbUid={props.selectedOrbUid}
          isDragging={props.isDragging}
          onSocketClick={props.onSocketClick}
          onSocketRemove={props.onSocketRemove}
          onGemPointerDown={props.onGemPointerDown}
        />
      </div>
      <div style={{ gridArea: 'right', zIndex: 1, overflow: 'hidden' }}>
        <FluxRail
          currentFlux={props.currentFlux}
          maxFlux={props.maxFlux}
          onBoost={props.onBoost}
          onReroll={props.onReroll}
          onGuaranteeRarity={props.onGuaranteeRarity}
        />
      </div>
      <div style={{ gridArea: 'dock', zIndex: 1 }} data-screen-section="forge-combine">
        <CombineDock
          comboSlots={props.comboSlots}
          registry={props.registry}
          canAfford={props.canAffordCombine}
          preview={props.combinePreview}
          isDragging={props.isDragging}
          onSlotClick={props.onComboSlotClick}
          onCombine={props.onCombine}
          onClearAll={props.onClearComboSlots}
          onPointerDown={props.onGemPointerDown}
        />
      </div>
      <div style={{ gridArea: 'stock', zIndex: 1 }} data-screen-section="forge-tray">
        <StockpileStrip
          stockpile={props.plan.stockpile}
          registry={props.registry}
          selectedOrbUid={props.selectedOrbUid}
          equippedUids={props.equippedUids}
          stagedUids={props.stagedUids}
          onSelectOrb={props.onSelectOrb}
          onPointerDown={props.onGemPointerDown}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/forge-desktop/ForgeDesktop.tsx
git commit -m "feat(client): ForgeDesktop composes HUD regions via CSS grid"
```

### Task 4.2: Branch `Forge.tsx` on frame mode

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

- [ ] **Step 1: Import hook + component**

Add near the existing imports at the top of `Forge.tsx`:

```ts
import { useFrameMode } from '@/hooks/useFrameMode';
import { ForgeDesktop } from '@/components/forge-desktop/ForgeDesktop';
```

- [ ] **Step 2: Read frame mode inside the component**

Early in the `Forge` function body (after the gateway subscription useEffect), add:

```ts
const frameMode = useFrameMode();
```

- [ ] **Step 3: Resolve real field names before writing the branch**

Before writing the JSX, confirm these engine-type facts against the real types (`packages/engine/src/run/run-state.ts`, `packages/client/src/stores/matchStore.ts`):

- `runState.lives: number` — current lives
- `runState.startingLives: number` — max (no separate `maxLives`)
- `runState.consecutiveWins: number`
- `runState.goalRound: number` (or null for endless — check the type)
- `matchStore.aiOpponentTier: number | null` — tier for display (live match; do NOT reach for `matchState.aiTier` — it doesn't exist on `MatchState`)

- [ ] **Step 4: Build a small `useForgeDesktopProps` helper in `Forge.tsx`**

To keep `Forge.tsx` from ballooning past the readable threshold, extract the desktop prop assembly into a local helper (still in the same file — private, not exported). This also gives us one place to resolve ambiguous fields cleanly.

```ts
// Inside Forge.tsx (above the return block). Uses values already computed
// higher in the component body. No new store reads, no new effects.
const aiTier = useMatchStore(s => s.aiOpponentTier);
const isCurrentlyDragging = false; // Drag state is ref-only (no re-renders);
                                    // desktop paints `isDragging` the same way
                                    // portrait does — always false at React-state
                                    // level. Preserves parity with portrait tree.

const forgeDesktopProps: React.ComponentProps<typeof ForgeDesktop> | null =
  plan ? {
    round,
    lives: runState?.lives ?? 3,
    maxLives: runState?.startingLives ?? 3,
    opponentLabel: isAiMatch
      ? `VS AI T${aiTier ?? 1}`
      : `VS ${matchState?.players[1]?.displayName ?? 'Player'}`,
    streak: runState?.consecutiveWins ?? 0,
    totalRounds: runState?.goalRound ?? 10,
    derivedStats,
    plan,
    registry,
    currentFlux,
    maxFlux,
    comboSlots,
    combinePreview,
    // Match portrait tree — CombineWorkbench's own `canCombine` gate is the
    // only check today (keepFilled && filledCount >= 2). Desktop passes the
    // same literal `true` portrait uses; do not introduce a new gate here.
    canAffordCombine: true,
    weaponStats: baseStatWeapon,
    armorStats: baseStatArmor,
    onDone: openConfirmModal,
    onOpenGemLibrary: () => { /* wired in Task 4.3 */ },
    onBoost: () => {
      gateway.dispatch({ kind: 'forge_action', player: 0, action: { kind: 'boost_combine' } });
    },
    onReroll: () => {
      gateway.dispatch({ kind: 'forge_action', player: 0, action: { kind: 'reroll_pool' } });
    },
    onGuaranteeRarity: () => {
      gateway.dispatch({ kind: 'forge_action', player: 0, action: { kind: 'guarantee_rarity' } });
    },
    onWeaponStatChange: (i, v) => handleBaseStatChange('weapon', i, v),
    onArmorStatChange: (i, v) => handleBaseStatChange('armor', i, v),
    onSocketClick: handleSocketClick,
    onSocketRemove: handleSocketRemove,
    onComboSlotClick: handleComboSlotClick,
    onCombine: handleCombine,
    onClearComboSlots: () => { clearComboSlots(); playSound('buttonClick'); },
    onSelectOrb: handleSelectOrb,
    onGemPointerDown: handlePointerDown,
    selectedOrbUid,
    isDragging: isCurrentlyDragging,
    equippedUids,
    stagedUids,
  } : null;
```

- [ ] **Step 5: Branch the return**

Just before the existing portrait `return (` block (around line 738), insert:

```tsx
if (frameMode === 'desktop' && forgeDesktopProps) {
  return <ForgeDesktop {...forgeDesktopProps} />;
}
```

The fallback path is the existing portrait tree, reached when `frameMode === 'portrait'` OR when the plan isn't ready yet (the `if (!plan) return null;` guard already above this branch handles the null-plan case).

- [ ] **Step 6: Manual dev verification**

```
pnpm --filter @alloy/client dev
```

- Narrow portrait browser → portrait Forge renders as today.
- Wide browser (≥ 3:2 aspect) → desktop HUD renders.
- Toggle between them by resizing — both trees mount cleanly.

- [ ] **Step 7: Run unit tests + responsive harness**

```
pnpm --filter @alloy/client exec vitest run
pnpm --filter @alloy/client run test:responsive
```

Expected: all existing tests pass (the desktop branch is inert at portrait viewports, and no responsive spec targets the new desktop mode yet).

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "feat(client): Forge branches to ForgeDesktop when frame mode is desktop"
```

### Task 4.3: Wire the Gem Library trigger

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`
- Modify: `packages/client/src/components/forge-desktop/ForgeDesktop.tsx` (if the handler needs threading further)

- [ ] **Step 1: Find the current Gem Library trigger**

Search the codebase (use the project Grep tool, not shell grep — Windows dev envs don't all have a compatible `grep` on PATH):

```
Grep --pattern "Gem Library|GemLibrary" --path packages/client/src
```

Or from bash:

```
git grep -n 'Gem Library\|GemLibrary' -- packages/client/src
```

Expected: find the portrait ForgeHeader's link + handler.

- [ ] **Step 2: Thread the same handler through `ForgeDesktop`**

Replace the TODO placeholder `onOpenGemLibrary={() => { /* TODO */ }}` with the actual handler discovered in Step 1 — same function the portrait ForgeHeader invokes.

- [ ] **Step 3: Dev verify**

Open desktop HUD, click "Gem Library" in the topbar, verify the library panel opens just like in portrait.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Forge.tsx packages/client/src/components/forge-desktop/ForgeDesktop.tsx
git commit -m "feat(client): wire Gem Library trigger through ForgeDesktop"
```

### Task 4.4: Chunk 4 review checkpoint

- [ ] **Step 1: Manual smoke pass** — start a run, land on forge, socket a gem, combine two gems, spend flux, commit the round. Verify each action works on desktop identically to portrait.

- [ ] **Step 2: Typecheck + full test run**

```
pnpm --filter @alloy/client exec tsc -b
pnpm --filter @alloy/client exec vitest run
pnpm --filter @alloy/client run test:responsive
```

Expected: all green.

---

## Chunk 5: Tests + Version Bump

Add regression protection for the new layout and ship.

### Task 5.1: `forge-desktop-all-visible` probe

**Files:**
- Create: `packages/client/e2e/responsive/probes/forge-desktop-all-visible.ts`
- Modify: `packages/client/e2e/responsive/probes/run-all.ts`

- [ ] **Step 1: Implement the probe**

```ts
// packages/client/e2e/responsive/probes/forge-desktop-all-visible.ts
import type { Probe, Finding } from './types';

const PROBE = 'forge-desktop-all-visible';

export const forgeDesktopAllVisible: Probe = async (page, ctx) => {
  // Only meaningful on the desktop HUD. Skip on portrait runs.
  const mode = await page.evaluate(() =>
    document.documentElement.getAttribute('data-frame-mode'),
  );
  if (mode !== 'desktop') return [];

  const data = await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('.app-frame');
    if (!frame) return null;
    const frameRect = frame.getBoundingClientRect();
    const required = [
      '[data-screen-section="forge-gear"]',
      '[data-screen-section="forge-combine"]',
      '[data-screen-section="forge-tray"]',
    ];
    const missing: string[] = [];
    const clipped: { selector: string; bottom: number; overflow: number }[] = [];
    const scrollbars: { selector: string; scrollHeight: number; clientHeight: number }[] = [];
    for (const sel of required) {
      const el = frame.querySelector<HTMLElement>(sel);
      if (!el) { missing.push(sel); continue; }
      const r = el.getBoundingClientRect();
      if (r.bottom > frameRect.bottom + 1) {
        clipped.push({ selector: sel, bottom: r.bottom, overflow: r.bottom - frameRect.bottom });
      }
      if (el.scrollHeight > el.clientHeight + 2) {
        scrollbars.push({ selector: sel, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
      }
    }
    // Also verify the full 2-row stockpile grid is laid out (not collapsed to 1 row)
    const stockpile = frame.querySelector<HTMLElement>('[data-screen-section="forge-tray"]');
    const stockpileRows = stockpile?.querySelectorAll('[data-stockpile-cell]').length ?? 0;
    return { missing, clipped, scrollbars, stockpileCells: stockpileRows, frameBottom: frameRect.bottom };
  });

  if (!data) return [];
  const findings: Finding[] = [];
  if (data.missing.length) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE, severity: 'fail',
      detail: `required sections missing: ${data.missing.join(', ')}`,
    });
  }
  for (const c of data.clipped) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE, severity: 'fail',
      detail: `${c.selector} spills past frame (${c.overflow.toFixed(1)}px)`,
      measured: c.bottom, expected: data.frameBottom,
    });
  }
  for (const s of data.scrollbars) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE, severity: 'fail',
      detail: `${s.selector} has vertical scrollbar (scrollHeight=${s.scrollHeight} > clientHeight=${s.clientHeight})`,
      measured: s.scrollHeight, expected: s.clientHeight,
    });
  }
  if (data.stockpileCells < 10) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE, severity: 'fail',
      detail: `stockpile rendered ${data.stockpileCells} cells; expected 10 (5×2 grid)`,
      measured: data.stockpileCells, expected: 10,
    });
  }
  return findings;
};
```

- [ ] **Step 2: Register the probe**

In `packages/client/e2e/responsive/probes/run-all.ts`, add the import and entry:

```ts
import { forgeDesktopAllVisible } from './forge-desktop-all-visible';
// …
{ name: 'forge-desktop-all-visible', fn: forgeDesktopAllVisible },
```

- [ ] **Step 3: Add `data-stockpile-cell` attribute and guarantee 10 cells**

In `StockpileStrip.tsx`, attach `data-stockpile-cell` to each grid cell (filled and empty placeholder). **The grid must always render exactly 10 cells** (5 cols × 2 rows) regardless of actual stockpile size. When `stockpile.length < 10`, render filled `<GemCard>` for the available gems and `<div data-stockpile-cell data-stockpile-cell-state="placeholder">` for the remainder. The `forge-desktop-all-visible` probe's `stockpileCells >= 10` check depends on this invariant — add a code comment in `StockpileStrip.tsx` pointing at that probe so the link is discoverable:

```tsx
// NOTE: The grid always renders exactly 10 cells (5×2). Filled cells hold a
// GemCard; remaining cells hold a dim placeholder. The forge-desktop-all-visible
// responsive probe asserts this invariant — don't shrink the cell count for
// sparse inventories.
```

Skip staged gems by filling their cell with a placeholder too (staged gems are conceptually "in the combine slots", not in the stockpile view).

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/responsive/probes/forge-desktop-all-visible.ts packages/client/e2e/responsive/probes/run-all.ts packages/client/src/components/forge-desktop/StockpileStrip.tsx
git commit -m "test(e2e): add forge-desktop-all-visible probe"
```

### Task 5.2: Desktop responsive specs

**Files:**
- Create: `packages/client/e2e/responsive/specs/forge-desktop-equip.spec.ts`
- Create: `packages/client/e2e/responsive/specs/forge-desktop-combine.spec.ts`

- [ ] **Step 1: Define a desktop viewport subset**

Pick viewports ≥ 3:2 aspect from the existing `VIEWPORTS` matrix: `desktop-1280` (1280×800 = 1.6), `fhd` (1920×1080 = 1.78), `2k-dci` (2048×1080 = 1.9), `qhd-1440p` (2560×1440 = 1.78), `ultrawide` (2560×1080 = 2.37). That's 5 viewports.

- [ ] **Step 2: Write `forge-desktop-equip.spec.ts`**

```ts
// packages/client/e2e/responsive/specs/forge-desktop-equip.spec.ts
import { test } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startRunViaStore, waitForPhase } from '../../fixtures/match';

const DESKTOP_VIEWPORTS = VIEWPORTS.filter(v => v.width / v.height >= 1.5);

for (const vp of DESKTOP_VIEWPORTS) {
  test(`Forge desktop equip @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startRunViaStore(page, { round: 1, phase: 'forge' });
    await waitForPhase(page, 'forge');
    // Assert we're in desktop mode
    const mode = await page.evaluate(() => document.documentElement.getAttribute('data-frame-mode'));
    if (mode !== 'desktop') throw new Error(`expected desktop mode at ${vp.name}, got ${mode}`);
    await runProbes('forge-desktop-equip', vp);
  });
}
```

- [ ] **Step 3: Write `forge-desktop-combine.spec.ts`**

Copy `forge-desktop-equip.spec.ts` and adjust:
- `test` name → `Forge desktop combine @ ${vp.name}`
- After `waitForPhase`, scroll (no-op on desktop, defensive) and assert `[data-combo-slot="0"]` is visible
- `runProbes('forge-desktop-combine', vp)`

- [ ] **Step 4: Run the desktop specs**

```
pnpm --filter @alloy/client exec playwright test --project=responsive --grep 'Forge desktop'
```

Expected: all 10 tests (5 viewports × 2 specs) pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/responsive/specs/forge-desktop-equip.spec.ts packages/client/e2e/responsive/specs/forge-desktop-combine.spec.ts
git commit -m "test(e2e): responsive specs for desktop HUD forge (5 viewports × 2 specs)"
```

### Task 5.3: Unit test for `SocketedAffixList`

**Files:**
- Create: `packages/client/src/components/forge-desktop/SocketedAffixList.test.tsx`

The affix-lookup, element-dot coloring, and empty-row branches have enough logic to warrant one focused test. Other desktop components are thin renderers covered by the E2E smoke + responsive probes.

- [ ] **Step 1: Write the test**

```tsx
// packages/client/src/components/forge-desktop/SocketedAffixList.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { SocketedAffixList } from './SocketedAffixList';
import { loadRegistryForTests } from '@/test-utils/registry'; // or existing helper
// Use whatever existing test-utility the project already uses to construct a
// DataRegistry in tests — check packages/client/src/test-utils/ or mirror
// what src/components/ItemSocketView tests do (if they exist).

describe('SocketedAffixList', () => {
  test('renders an affix row per filled slot in socket order', () => {
    const registry = loadRegistryForTests();
    const slots = [
      { gem: { uid: 'g1', affixId: 'fire_damage', tier: 2, rarity: 'uncommon' } as any },
      null,
      { gem: { uid: 'g2', affixId: 'armor_pen', tier: 2, rarity: 'uncommon' } as any },
    ];
    render(<SocketedAffixList slots={slots as any} cardId="weapon" registry={registry} />);
    const rows = screen.getAllByTestId('affix-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/fire/i);
    expect(rows[1]).toHaveAttribute('data-empty', 'true');
    expect(rows[2]).toHaveTextContent(/armor/i);
  });
});
```

Add `data-testid="affix-row"` and `data-empty="true"` where appropriate in `SocketedAffixList.tsx` when wiring this up.

- [ ] **Step 2: Run the test**

```
pnpm --filter @alloy/client exec vitest run src/components/forge-desktop/SocketedAffixList.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/forge-desktop/SocketedAffixList.test.tsx packages/client/src/components/forge-desktop/SocketedAffixList.tsx
git commit -m "test(client): SocketedAffixList renders affix rows in socket order"
```

### Task 5.4: E2E smoke — socket a gem on desktop

**Files:**
- Create: `packages/client/e2e/forge-desktop.spec.ts`

- [ ] **Step 1: Write the smoke test**

```ts
// packages/client/e2e/forge-desktop.spec.ts
import { test, expect } from '@playwright/test';
import { startRunViaStore } from './fixtures/match';

test('desktop HUD: sockets a gem and affix list updates', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await startRunViaStore(page, { round: 1, phase: 'forge' });
  await page.waitForSelector('[data-screen="forge-desktop"]', { timeout: 5_000 });

  // Tap the first stockpile gem to select it
  const firstGem = page.locator('[data-stockpile-cell] [data-gem-uid]').first();
  const uid = await firstGem.getAttribute('data-gem-uid');
  expect(uid).toBeTruthy();
  await firstGem.click();

  // Click the first empty weapon socket
  const firstSocket = page.locator('[data-item-card="weapon"] [data-forge-socket="0"]').first();
  await firstSocket.click();

  // Verify the weapon affix list now has one row (not "— no gems socketed —")
  const affixList = page.locator('[data-screen="forge-desktop"] [data-socketed-affix-list="weapon"]');
  await expect(affixList.locator('[data-affix-row]').first()).toBeVisible();
});
```

(Requires `data-socketed-affix-list="weapon"` / `"armor"` and `data-affix-row` attributes on `SocketedAffixList` — add them if not already present.)

- [ ] **Step 2: Run it**

```
pnpm --filter @alloy/client exec playwright test e2e/forge-desktop.spec.ts --project=desktop
```

The `desktop` Playwright project already exists in `packages/client/playwright.config.ts` (verified 2026-04-20). Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/forge-desktop.spec.ts
git commit -m "test(e2e): desktop HUD socket-a-gem smoke"
```

### Task 5.5: Version bump

**Files:**
- Modify: `packages/client/package.json`

- [ ] **Step 1: Bump 0.5.1-alpha → 0.6.0-alpha**

Minor bump per project convention (feature/refactor — see `feedback_version_bump_every_update.md`).

- [ ] **Step 2: Commit**

```bash
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.6.0-alpha

Forge HUD desktop redesign — new layout activated at
(min-aspect-ratio: 3/2). Portrait mobile layout unchanged."
```

### Task 5.6: Final regression pass

- [ ] **Step 1: Full test suite**

```
pnpm --filter @alloy/client exec tsc -b
pnpm --filter @alloy/client exec vitest run
pnpm --filter @alloy/client exec playwright test
pnpm --filter @alloy/client run test:responsive
```

Expected: same baseline as pre-change (95/96 responsive passing with the one known iphone-landscape draft exemption) PLUS the new desktop specs passing.

- [ ] **Step 2: Manual sanity pass**

At 1920×1080 (desktop HUD) and 375×667 (iPhone SE portrait):
- Run a full forge round end-to-end (select base items in R1, socket some gems, combine, spend flux, commit).
- Both surfaces should behave identically from an input/outcome standpoint.

- [ ] **Step 3: Update project memories** if anything significant emerged during implementation (e.g. a new "desktop HUD is the forge layout now" project memory alongside the existing `project_desktop_first.md`).

---

## Follow-ups (not part of this plan)

- Real art assets for `AmbientBackdrop` and gear silhouettes — separate art-pipeline spec.
- Mobile portrait polish pass — separate spec, revisits density on narrow widths.
- Apply `StockpileStrip`-style tight packing to `Draft`'s pool grid — follow-up density consistency commit.
- Full keyboard/controller pass across the HUD — separate accessibility spec.
- Gem Library desktop layout — if/when it needs its own redesign.
