# Delve UI v1 · Phase 3b · 3F: Training Grounds — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Training Grounds on 3a's HUD grid: a glass `TrainingBar` on top ("◂ Anvil", the depth and the meter, the DPS Lab in dev builds, Panel and Menu), the Training dock in the right column at 400 px for every device (kit `Panel` and `Tabs`, glyphs for emoji, the rune picker in place), the system menu with an Anvil entry, and the spec's pad routes: View focuses the dock and pauses, B or View again hands the pad back, the menu pauses, the mouse never does.

**Architecture:** `pages/DelveTraining.tsx` owns the state (dock open, the pad's focus in the dock, the menu) and the pause: `paused = padFocus || menuOpen || controlsOpen || picking`, handed to the arena and to `setArenaLive(!paused)` as today. The dock is a plain wrapper in `HudGrid`'s right column that becomes a `data-pad-scope` only while the pad's focus is in it; while it is, a `usePrompts` entry scoped to it takes B / Esc and View / J (hand the pad back) and Menu (open the menu). The Panel button (`data-pad-journal`) reads the input lock: under the pad (the arena's View) it opens and focuses the dock, under the mouse and keys it toggles it. `training/TrainingBar.tsx` (new) draws the bar and `DepthLabel`; `TrainingPanel.tsx` becomes one dock (the sheet, `openLayout`, `PanelLayout`, `DOCK_WIDTH`, `DOCK_MIN_WIDTH` and the second "◂ Anvil" go); `MeterView.tsx` takes the kit. `HudGrid` gains one optional prop, `rightWidth`. No engine change, no store change.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, Vitest 3 (jsdom, Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md`: "3b · Pause, stop and Training" → **3F** (layout, pad routes revision 2, the panel, ids, emoji), "Sequencing in 3b (revision 2)", "E2E in 3b"; decided items 6 (Training, revision 2), 19 (prompts, Esc / Menu ownership), 26 (focus), 27 (emoji), 33 (minimum text), 38 (the 3a zoom undo this area removes), 39 (in-pane scopes); "The input map" (Panel: click Panel / View). There is no Training mockup: the bar follows the dive's `PurseBar` (glass, the binding glyphs at the right end) and the dock the HUD's glass panels. The overview is `00-overview.md` in this folder.

---

## Base

- **Starts from:** branch `ui/p3b` at `cd13060` (Phase 3a, v0.56.0), in this area's worktree `C:/Projects/alloy-ui-3f` (`git worktree add ../alloy-ui-3f -b ui/p3b-3f ui/p3b`, then the overview's junctions). Every path below is relative to the worktree root, `/c/Projects/alloy-ui-3f` in Git Bash.
- **Nothing must merge first.** 3F needs nothing from 3D or 3E: `SystemMenu` already takes `extra` (`hub/SystemMenu.tsx`, `SystemMenuEntry`), `RunePicker` already has `variant="inline"`, and the kit has `Panel`, `Tabs`, `usePrompts` and the `lab`, `training`, `controls` and `check` glyphs.
- **3F merges before 3E removes `RunePicker`'s sheet variant** (the spec's sequencing): after Task 4 nothing in Training uses the sheet.
- **Before Task 1:** build the engine once for the junction and measure the client:

```bash
cd /c/Projects/alloy-ui-3f
(cd packages/engine && npx tsup)
(cd packages/client && npx vitest run && npx tsc --noEmit -p .)
```

  Expected: tsup's "Build success" lines; the client suite passes and the typecheck prints nothing. At `cd13060` it reads **1146 tests in 145 files**; this area ends at **1156 tests in 146 files** (+10, one new file).

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/arena/hud/HudGrid.tsx` | **Modify** (one optional prop): `rightWidth` (default 340) sets the grid's third column |
| `packages/client/src/features/delve/arena/hud/__tests__/HudGrid.test.tsx` | **Modify**: the right column takes `rightWidth` |
| `packages/client/src/features/delve/training/TrainingBar.tsx` (new) | `TrainingBar` (glass): "◂ Anvil", `DepthLabel` and `MeterChip`, `LabButton`, Panel (`data-pad-journal`) and Menu (`data-pad-menu`) with their bindings; `DepthLabel` (moved from `TrainingPanel.tsx`) |
| `packages/client/src/features/delve/__tests__/TrainingBar.test.tsx` (new) | the bar's buttons, markers and bindings; `DepthLabel` (moved from `TrainingPanel.test.tsx`) |
| `packages/client/src/features/delve/training/MeterView.tsx` | **Overwrite**: `MeterChip` and `MeterTab` in the kit (a well, `Chip`, `Button`, captions at 14 px; reaction names without their emoji) |
| `packages/client/src/features/delve/lab/dev-routes.tsx` | **Modify**: `LabButton` is a kit `Button` with the `lab` glyph (was "📈") |
| `packages/client/src/pages/DelveTraining.tsx` | **Overwrite**: the bar, the 400 px dock, the system menu with Anvil, the pad's focus in the dock and its prompts |
| `packages/client/src/pages/__tests__/DelveTraining.test.tsx` | **Overwrite**: the grid, the mouse's dock (no pause), the pad's routes (View, B, View again, Esc, Menu), the menu, the picker's pause |
| `packages/client/src/features/delve/training/TrainingPanel.tsx` | **Overwrite**: one dock (kit glass `Panel`, top-level `Tabs`, Close), the tabs in the kit at 14 px or more, glyphs for emoji; the sheet, `openLayout`, `PanelLayout`, `DOCK_WIDTH`, `DOCK_MIN_WIDTH`, `DepthLabel`, the exported `blurOnPointerUp` and `training-panel-exit` go |
| `packages/client/src/features/delve/chains/ChainEditor.tsx` | **Modify** (one line): its rune picker renders `variant="inline"` |
| `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx` | **Modify**: no layout, no exit; the picker in place; Close and the tabs; glyphs and the 14 px floor; `DepthLabel` and `openLayout` tests go |
| `packages/client/e2e/delve-training.spec.ts` | **Modify**: T01's geometry on `TrainingBar` (with Menu), the sheet helper gone, T03 rewritten for the menu |

Optional, Task 6: `TrainingPanel.tsx` and `TrainingPanel.test.tsx` again (the reactions reference under the builder).

**Outside 3F's "Owns" column** (none is owned by another 3b area; the integrator should know): `HudGrid.tsx` and its test (3A's in 3a; one optional prop, `DelveRun` untouched), `ChainEditor.tsx` (one line; only Training passes it `runes`, so 3E's `MovePick`, which passes none, never opens its picker), `dev-routes.tsx` (`LabButton`'s markup; 4B's `DelveLab.tsx` untouched).

## Cross-area needs

No edit in another 3b area's files. For the integrator and 3E:

1. **3E's sheet removal.** After Task 4, `RunePicker`'s sheet has no caller in Training (`ChainEditor` passes `variant="inline"`). If 3E removes the `variant` prop altogether (rather than the `'sheet'` value), its commit also deletes ` variant="inline"` from `chains/ChainEditor.tsx` (`{ed.picker && <RunePicker {...ed.picker} variant="inline" />}`) and `hub/skills/MoveInspector.tsx`. `pages/__tests__/DelveTraining.test.tsx`'s stand-in renders `RunePicker` with no `variant`, so it follows either way.
2. **3D's `ControlsPanel`.** Training opens it unchanged (`<ControlsPanel onClose={…} />`, from Toggles → Controls); 3D's attack toggle inside it then duplicates Training's own "Basic attack: Auto / Manual" (`training-attack-mode`, kept: the spec moves the dive's toggle, not Training's). No change needed; the integrator may drop Training's in Phase 4.
3. **`SystemMenu`** is used as it is: `extra={[{ id: 'anvil', label: 'Anvil', onSelect }]}` gives `menu-anvil`.
4. **E2E (the integrator's run):** `delve-training.spec.ts` changes here (Task 5). Ids kept on the same behaviour: `training-back`, `training-panel-toggle`, `training-panel`, `training-panel-close`, `training-tab-<id>`, `training-depth-label`, `training-slowmo`, `meter-chip`, `meter-dps`, `meter-total`, `meter-reset`, `meter-<bucket>`, `meter-reset-all`, `training-lab` (R07 goes through it), and every control id inside the tabs. New: `training-bar`, `training-menu`, `menu-anvil`. Gone: `training-panel-exit` and the panel's `data-layout`. No other spec reads a Training id.
5. **Version:** the integrator bumps 0.57.0 for the phase; this area doesn't.

## Where the spec left room

- **The Panel button and the input lock.** One button serves the arena's View (pad) and journal key (J), and the mouse. It reads `inputDeviceStore`: under the pad it opens the dock and gives it the pad's focus (pausing); otherwise it toggles the dock, never pausing (T01). J therefore toggles, as a click does.
- **The pad's focus in the dock.** The dock's wrapper is a `data-pad-scope` only while focused, so `keepFocus` keeps the pad inside it and LB/RB step its tabs (the kit's `data-pad-tabs`); the selected tab takes the focus on entry. Its prompts (`usePrompts`, scoped to it, disabled otherwise): B and Esc hand the pad back, View and the journal key too, and the pad's Menu opens the system menu over it (Resume returns to the focused dock). B is not Close: the dock stays open (spec). Handing back blurs whatever the dock held, so the arena's keys work at once.
- **The rune picker still pauses** while open (`useRunePickerOpen`, today's rule): inline in the dock it holds Space and the pad. The spec's "the mouse doesn't pause" is about opening the panel; picking is a menu.
- **Open on entry.** The dock opens with the page, as today's docked panel did on desktop; Close and Panel close it, and the camera's right inset drops to 0 (HudGrid already measures an empty column).
- **Five tabs in 360 px.** At `size="md"` they need 526 px, so the tab row wraps to a second row (`[&_.k-tabs]:flex-wrap`, a wrapper's arbitrary variant; the kit is untouched). Measured in Chromium at 1920×1080 and 1280×720: no overflow, and the inline picker's focus no longer scrolls the page sideways (an overflowing tab row did).
- **Emoji to glyphs.** Element emoji become `Glyph id={mana}` in the element's colour (a dummy element chip, now glyph-only, gets `aria-label` with the name); "🎯 Training" the `training` glyph; "🎮 Controls" the `controls` glyph; "📈 DPS Lab" the `lab` glyph; "☰ Panel" the binding glyph; "⚡ Fill charge", "🎯 One", "▮", "⁂", "↺" and "⇄" drop to their words; monster and reaction icons drop from the selects and the meter; ★/☆ on a legendary become the `check` glyph when lit. **Not 3F's:** `ChainEditor` (Abilities) and `AttunementBars` (Loadout) keep their emoji and their 10–11 px text; with 3a's zoom undo gone they scale with the HUD (unchanged at 1080p, 0.75× at 1280×720). Their owner, or Phase 4's minimum-size probe, should take them to the kit; 3E's `MovePick` shows the same `ChainEditor`.
- **The bar's Menu** carries `training-menu` (the spec names no id) and shows its binding like the purse's. "◂ Anvil" keeps `aria-label="Back to the Anvil"`.
- **Optional (Task 6): the reactions reference.** Phase 2 moved the grid to the Codex and Training lost it; Task 6 puts `hub/codex/ReactionsGrid` (as it is, every reaction discovered) under the builder on Abilities, one card a row (a wrapper's `[&_.grid-cols-2]:grid-cols-1`). Skip it and nothing else changes.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `ui/p3b-3f` (six; five without Task 6), staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-ui-3f`.
- **Line endings:** the worktree checks every file out CRLF (`core.autocrlf`). The Edit tool keeps them; an Overwrite or Create (a Write) writes LF, which git normalises, so the commit shows only real changes. Prettier runs with `--end-of-line auto`. Never `sed -i`.
- **Prettier:** every file touched here passes `npx prettier --end-of-line auto --check` at `cd13060`, and the code below is already formatted (checked on the scratch copy), so each commit block's `--write` changes nothing typed as written.
- **How the edits read** (the 4a plan's language): "Replace: A with: B" is one Edit. "Replace the lines from `A` up to (not including) `B` with: C" is one Edit from the start of the line reading `A` (ignoring its indentation) to the end of the line before the one reading `B`; "…to the end of the file" runs to the last line. "Delete the line: A" removes that whole line. "Create `f`:" and "Overwrite `f`:" are a Write. Every anchor is unique in its file at that point; apply each file's edits top to bottom.
- **Checked on a scratch copy** of `ui/p3b` at `cd13060` (`git archive`, the engine built, junctioned `node_modules`): every task's FAIL and PASS below was run, the typecheck was clean after each task, the suite went 1146 → 1147 → 1150 → 1154 → 1155 → 1156, and `delve-training.spec.ts` (3/3) and `delve-runes.spec.ts` (7/7, R07 through `training-lab`) passed on the desktop project against a dev server. A throwaway pad script (the gamepad spec's fake pad) also walked View → focus on the Loadout tab → RB → B → View → View → Menu → B → Menu → A on the real nav layer.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Engine bundle (once) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| E2E | the overview's dev server and scratch config, then `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve-training.spec.ts --project=desktop)` |

---

## Chunk 1: The grid's column, the Training bar and the page

### Task 1: `HudGrid`'s `rightWidth`

The grid's third column is 340 px for the dive; Training's dock is 400 px (spec). One optional prop, defaulting to today's width, so `DelveRun` is untouched.

**Files:**
- Modify: `packages/client/src/features/delve/arena/hud/HudGrid.tsx`
- Modify: `packages/client/src/features/delve/arena/hud/__tests__/HudGrid.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/arena/hud/__tests__/HudGrid.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('overlay').parentElement).toBe(root);
  });

  it("reports the camera's insets in viewport px, again on a resize or a HUD scale change, only when they change", () => {
```

with:

```tsx
    expect(screen.getByTestId('overlay').parentElement).toBe(root);
  });

  it('sizes its right column: 340 px, or `rightWidth` (the Training dock)', () => {
    const { rerender } = render(grid(() => {}));
    const root = screen.getByTestId('hud');
    expect(root.getAttribute('style')).toContain(
      'grid-template-columns: 380px minmax(0,1fr) 340px',
    );
    rerender(
      <HudGrid
        onInsets={() => {}}
        testId="hud"
        top={null}
        right={null}
        dock={null}
        rightWidth={400}
      />,
    );
    expect(root.getAttribute('style')).toContain(
      'grid-template-columns: 380px minmax(0,1fr) 400px',
    );
  });

  it("reports the camera's insets in viewport px, again on a resize or a HUD scale change, only when they change", () => {
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/HudGrid.test.tsx)`
Expected: FAIL, 1 failed | 6 passed: `HudGrid > sizes its right column: 340 px, or \`rightWidth\` (the Training dock)` with `AssertionError: the given combination of arguments (null and string) is invalid for this assertion` (the root has no `style` yet).

- [ ] **Step 3: The prop**

In `packages/client/src/features/delve/arena/hud/HudGrid.tsx`, replace:

```tsx
  /** Laid on the grid itself, e.g. the BossBar (3A's addition to the contract). */
  children?: ReactNode;
}
```

with:

```tsx
  /** Laid on the grid itself, e.g. the BossBar (3A's addition to the contract). */
  children?: ReactNode;
  /** The right column's width in design px: 340, or the Training Grounds' 400 px dock (3F). */
  rightWidth?: number;
}
```

Replace:

```tsx
export function HudGrid({ top, right, dock, onInsets, testId, children }: HudGridProps) {
```

with:

```tsx
export function HudGrid({
  top,
  right,
  dock,
  onInsets,
  testId,
  children,
  rightWidth = 340,
}: HudGridProps) {
```

Replace:

```tsx
      className="delve-ui delve-hud-zoom pointer-events-none absolute inset-6 z-20 grid grid-cols-[380px_minmax(0,1fr)_340px] grid-rows-[48px_minmax(0,1fr)] gap-4"
```

with:

```tsx
      className="delve-ui delve-hud-zoom pointer-events-none absolute inset-6 z-20 grid grid-rows-[48px_minmax(0,1fr)] gap-4"
      style={{ gridTemplateColumns: `380px minmax(0,1fr) ${rightWidth}px` }}
```

- [ ] **Step 4: Run it to see it pass**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/HudGrid.test.tsx && npx tsc --noEmit -p .)`
Expected: PASS, 7 tests (4 `HudGrid`, 3 `PurseBar`); the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3f
(cd packages/client && npx prettier --end-of-line auto --write src/features/delve/arena/hud/HudGrid.tsx src/features/delve/arena/hud/__tests__/HudGrid.test.tsx)
git add packages/client/src/features/delve/arena/hud/HudGrid.tsx packages/client/src/features/delve/arena/hud/__tests__/HudGrid.test.tsx
git commit -m "feat(client): HudGrid's right column takes rightWidth (340 by default) for Training's 400 px dock" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: `TrainingBar`, the meter in the kit, and the DPS Lab button's glyph

The bar is the spec's list, left to right: "◂ Anvil", `DepthLabel` and `MeterChip` centred, the DPS Lab (dev), then Panel and Menu drawn as the purse's hints (their binding glyph and a word; `noFocus` keeps a click from taking the arena's keys). `DepthLabel` moves here (the old one in `TrainingPanel.tsx` goes with Task 4). The meter's readouts take the kit now, so the bar and the Meter tab match.

**Files:**
- Create: `packages/client/src/features/delve/training/TrainingBar.tsx`
- Create: `packages/client/src/features/delve/__tests__/TrainingBar.test.tsx`
- Overwrite: `packages/client/src/features/delve/training/MeterView.tsx`
- Modify: `packages/client/src/features/delve/lab/dev-routes.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/__tests__/TrainingBar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useSandboxStore } from '@/stores/sandboxStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { DamageMeter } from '../training/meter';
import { DepthLabel, TrainingBar } from '../training/TrainingBar';

describe('TrainingBar', () => {
  beforeEach(() => {
    useSandboxStore.getState().reset();
    useInputDeviceStore.setState({ device: 'keyboard' });
  });

  const bar = (panelOpen: boolean) => {
    const on = { back: vi.fn(), panel: vi.fn(), menu: vi.fn(), reset: vi.fn() };
    const view = render(
      <MemoryRouter>
        <TrainingBar
          meter={new DamageMeter().summary(0)}
          onResetMeter={on.reset}
          panelOpen={panelOpen}
          onBack={on.back}
          onPanel={on.panel}
          onMenu={on.menu}
        />
      </MemoryRouter>,
    );
    return { on, view };
  };

  it('holds one Anvil, the depth and the meter, then Panel (the journal marker) and Menu (the menu marker)', () => {
    const { on } = bar(true);
    fireEvent.click(screen.getByTestId('training-back'));
    expect(on.back).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Back to the Anvil' })).toHaveTextContent('◂ Anvil');
    expect(screen.getByTestId('training-depth-label')).toHaveTextContent('Depth 5');
    expect(screen.getByTestId('meter-dps')).toHaveTextContent('0 DPS');
    fireEvent.click(screen.getByTestId('meter-reset'));
    expect(on.reset).toHaveBeenCalledTimes(1);

    const panel = screen.getByTestId('training-panel-toggle');
    expect(panel).toHaveAttribute('data-pad-journal');
    expect(panel).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveTextContent('JPanel');
    fireEvent.click(panel);
    expect(on.panel).toHaveBeenCalledTimes(1);
    const menu = screen.getByTestId('training-menu');
    expect(menu).toHaveAttribute('data-pad-menu');
    expect(menu).toHaveTextContent('EscMenu');
    fireEvent.click(menu);
    expect(on.menu).toHaveBeenCalledTimes(1);
    // Glyphs, not emoji.
    expect(screen.getByTestId('training-bar').textContent).not.toMatch(
      /\p{Extended_Pictographic}/u,
    );
  });

  it("Panel says when the dock is closed, and the dev build's DPS Lab button wears a glyph", () => {
    bar(false);
    expect(screen.getByTestId('training-panel-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('training-lab').querySelector('[data-glyph="lab"]')).not.toBeNull();
  });
});

describe('DepthLabel', () => {
  beforeEach(() => useSandboxStore.getState().reset());

  it('shows the depth, and the slow-motion speed when it is not 1×', () => {
    render(<DepthLabel />);
    expect(screen.getByTestId('training-depth-label')).toHaveTextContent('Depth 5');
    expect(screen.queryByTestId('training-slowmo')).toBeNull();
    act(() => useSandboxStore.getState().setSlowmo(0.5));
    expect(screen.getByTestId('training-slowmo')).toHaveTextContent('0.5×');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/TrainingBar.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../training/TrainingBar" from "src/features/delve/__tests__/TrainingBar.test.tsx". Does the file exist?`

- [ ] **Step 3: The bar, the meter and the Lab button**

Create `packages/client/src/features/delve/training/TrainingBar.tsx`:

```tsx
import { useControlsStore } from '@/stores/controlsStore';
import { useSandboxStore } from '@/stores/sandboxStore';
import { Button, InputGlyph } from '@/features/delve/kit';
import { noFocus } from '../arena/hud/SkillSlot';
import { LabButton } from '../lab/dev-routes';
import { MeterChip } from './MeterView';
import type { MeterSummary } from './meter';

/** "Depth N", plus the slow-motion speed while it isn't 1×. */
export function DepthLabel() {
  const depth = useSandboxStore((s) => s.depth);
  const slowmo = useSandboxStore((s) => s.slowmo);
  return (
    <span className="k-disp flex items-center gap-2 whitespace-nowrap text-[20px]">
      <span data-testid="training-depth-label">Depth {depth}</span>
      {slowmo !== 1 && (
        <span className="text-[var(--k-mana)]" data-testid="training-slowmo">
          {slowmo}×
        </span>
      )}
    </span>
  );
}

/**
 * The Training Grounds' top bar (glass): "◂ Anvil", the depth and the meter, the DPS Lab (dev
 * builds), then Panel (`data-pad-journal`: the journal key and View press it) and Menu
 * (`data-pad-menu`: Esc and the pad's Menu press it), each with its binding.
 */
export function TrainingBar({
  meter,
  onResetMeter,
  panelOpen,
  onBack,
  onPanel,
  onMenu,
}: {
  meter: MeterSummary;
  onResetMeter: () => void;
  panelOpen: boolean;
  onBack: () => void;
  onPanel: () => void;
  onMenu: () => void;
}) {
  const config = useControlsStore((s) => s.config);
  return (
    <div
      className="k-glass pointer-events-auto flex h-full items-center gap-4 px-4"
      data-testid="training-bar"
    >
      <Button size="sm" onClick={onBack} aria-label="Back to the Anvil" testId="training-back">
        ◂ Anvil
      </Button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-4">
        <DepthLabel />
        <MeterChip meter={meter} onReset={onResetMeter} />
      </div>
      <LabButton />
      <span className="flex items-center gap-4 whitespace-nowrap text-[14px] text-[var(--k-text-2)]">
        <button
          type="button"
          className="flex items-center gap-[6px]"
          aria-expanded={panelOpen}
          data-pad-journal
          onMouseDown={noFocus}
          onClick={onPanel}
          data-testid="training-panel-toggle"
        >
          <InputGlyph
            binding={{
              key: config.keys.journal ?? undefined,
              pad: config.pad.journal ?? undefined,
            }}
            size="sm"
          />
          Panel
        </button>
        <button
          type="button"
          className="flex items-center gap-[6px]"
          data-pad-menu
          onMouseDown={noFocus}
          onClick={onMenu}
          data-testid="training-menu"
        >
          <InputGlyph
            binding={{ key: config.keys.menu ?? undefined, pad: config.pad.menu ?? undefined }}
            size="sm"
          />
          Menu
        </button>
      </span>
    </div>
  );
}
```

Overwrite `packages/client/src/features/delve/training/MeterView.tsx`:

```tsx
import { Button, Chip } from '@/features/delve/kit';
import { formatNumber } from '../format';
import { getDelveRegistry } from '../registry';
import { BUCKET_LABEL, METER_BUCKETS, METER_WINDOW, type MeterSummary } from './meter';

/** The live readout in the Training bar: DPS · total · reset (never wraps). */
export function MeterChip({ meter, onReset }: { meter: MeterSummary; onReset: () => void }) {
  return (
    <div
      className="k-well flex items-center gap-3 whitespace-nowrap px-3 py-0.5 text-[14px]"
      data-testid="meter-chip"
    >
      <span className="k-disp text-[20px] text-[var(--k-hot)]" data-testid="meter-dps">
        {formatNumber(meter.dps)} DPS
      </span>
      <span className="text-[var(--k-text-3)]">·</span>
      <span
        className="text-[var(--k-text-2)]"
        data-testid="meter-total"
        data-total={Math.round(meter.total)}
      >
        {formatNumber(meter.total)} total
      </span>
      <Chip onClick={onReset} testId="meter-reset">
        Reset
      </Chip>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="k-well flex flex-col gap-1 p-2">
      <div className="k-disp text-[24px]">{value}</div>
      <div className="k-caption">{label}</div>
    </div>
  );
}

/** The full breakdown: damage by source, the biggest hit, and reactions by name. */
export function MeterTab({ meter, onReset }: { meter: MeterSummary; onReset: () => void }) {
  const reactions = getDelveRegistry().getArpgData().reactions;
  return (
    <div className="flex flex-col gap-3 text-[14px]" data-testid="meter-tab">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label={`DPS (last ${METER_WINDOW}s)`} value={formatNumber(meter.dps)} />
        <Stat label="Total" value={formatNumber(meter.total)} />
        <Stat label="Biggest hit" value={formatNumber(meter.biggest)} />
      </div>
      <table className="w-full">
        <thead>
          <tr className="k-caption">
            <th className="py-1 text-left font-normal">Source</th>
            <th className="text-right font-normal">Hits</th>
            <th className="text-right font-normal">Damage</th>
            <th className="text-right font-normal">Share</th>
          </tr>
        </thead>
        <tbody>
          {METER_BUCKETS.map((b) => {
            const row = meter.buckets[b];
            return (
              <tr
                key={b}
                style={{ color: row.hits > 0 ? 'var(--k-text)' : 'var(--k-text-3)' }}
                data-testid={`meter-${b}`}
                data-hits={row.hits}
                data-damage={Math.round(row.damage)}
              >
                <td className="py-0.5">{BUCKET_LABEL[b]}</td>
                <td className="text-right">{row.hits}</td>
                <td className="text-right">{formatNumber(row.damage)}</td>
                <td className="text-right">
                  {meter.total > 0 ? Math.round((row.damage / meter.total) * 100) : 0}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-3 gap-y-1" data-testid="meter-reactions">
        {reactions.map((r) => (
          <span
            key={r.id}
            style={{ color: meter.reactions[r.id] ? 'var(--k-hot-hi)' : 'var(--k-text-3)' }}
          >
            {r.name} ×{meter.reactions[r.id] ?? 0}
          </span>
        ))}
      </div>
      <p className="k-caption">
        Each reaction counts the pairs of stacks it used up. Melt, Shatter, Soulfire, Combust and
        Crystallize multiply the hit that set them off, so their damage stays in that hit&apos;s
        row; Sunder&apos;s bonus shows in later hits&apos; rows. Time is the fight&apos;s own, so
        slow motion doesn&apos;t change the DPS.
      </p>
      <Button size="sm" onClick={onReset} testId="meter-reset-all">
        Reset the meter
      </Button>
    </div>
  );
}
```

In `packages/client/src/features/delve/lab/dev-routes.tsx`, replace:

```tsx
import { useNavigate } from 'react-router';
```

with:

```tsx
import { useNavigate } from 'react-router';
import { Button, Glyph } from '@/features/delve/kit';
```

Replace the lines from `    <button` up to (not including) `  );` with:

```tsx
    <Button
      size="sm"
      onClick={() => navigate('/delve/lab')}
      aria-label="DPS Lab"
      testId="training-lab"
    >
      <Glyph id="lab" size={18} /> DPS Lab
    </Button>
```

(The lines replaced are `LabButton`'s `<button` … `</button>`, the old "📈" one.)

- [ ] **Step 4: Run it to see it pass**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/TrainingBar.test.tsx src/features/delve/lab src/features/delve/__tests__/TrainingPanel.test.tsx && npx tsc --noEmit -p .)`
Expected: PASS (`TrainingBar.test.tsx` 3 tests, `dev-routes.test.tsx` 2, the rest of `lab/` and `TrainingPanel.test.tsx` as before); the typecheck prints nothing. The whole suite reads 1150 tests in 146 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3f
(cd packages/client && npx prettier --end-of-line auto --write src/features/delve/training/TrainingBar.tsx src/features/delve/__tests__/TrainingBar.test.tsx src/features/delve/training/MeterView.tsx src/features/delve/lab/dev-routes.tsx)
git add packages/client/src/features/delve/training/TrainingBar.tsx packages/client/src/features/delve/__tests__/TrainingBar.test.tsx packages/client/src/features/delve/training/MeterView.tsx packages/client/src/features/delve/lab/dev-routes.tsx
git commit -m "feat(client): the Training bar (Anvil, depth and meter, DPS Lab, Panel and Menu with their bindings); the meter and the Lab button in the kit" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: The page: the bar, the 400 px dock, the menu and the pad's routes

`DelveTraining` drops 3a's minimal port (the inline glass bar, the zoom undo, `openLayout`, the sheet) for the spec's layout and routes. The dock wrapper is `ref`'d for the prompts' scope and becomes a `data-pad-scope` while the pad's focus is in it. `TrainingPanel` still has today's props until Task 4, so this task passes `layout="dock"` and `onExit` (Task 4 deletes both lines). The page test stands a small dock in for `TrainingPanel` (a tab list, a socket opening a `RunePicker`, Close), mocks the arena, and drives the prompt runtime as the hub's test does (every element given a box, since the scopes must be visible).

**Files:**
- Overwrite: `packages/client/src/pages/DelveTraining.tsx`
- Overwrite: `packages/client/src/pages/__tests__/DelveTraining.test.tsx`

- [ ] **Step 1: The failing test**

Overwrite `packages/client/src/pages/__tests__/DelveTraining.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { padPrompts } from '@/features/delve/kit/prompts';
import type { PadButton } from '@/features/gamepad/gamepad';
import { createArenaInput } from '@/features/delve/arena/input';
import { RunePicker } from '@/features/delve/runes/RunePicker';
import { DamageMeter } from '@/features/delve/training/meter';
import { DelveTraining } from '../DelveTraining';

const live = vi.hoisted(() => ({ calls: [] as boolean[], paused: [] as boolean[] }));

vi.mock('@/features/gamepad/gamepad-hub', async (orig) => ({
  ...(await orig<object>()),
  setArenaLive: (on: boolean) => live.calls.push(on),
}));

// The arena itself (Pixi) stands still: the page's pause is what's under test.
vi.mock('@/features/delve/training/useTrainingArena', () => ({
  useTrainingArena: (_host: unknown, opts: { paused: boolean }) => {
    live.paused.push(opts.paused);
    return {
      input: createArenaInput(),
      heroScreen: () => null,
      pixelsPerUnit: () => 30,
      hud: null,
      meter: new DamageMeter().summary(0),
      actions: { resetMeter: () => {} },
      cast: () => {},
      aim: () => {},
      cancelHold: () => {},
      potion: () => {},
      dodge: () => {},
      attack: () => {},
    };
  },
}));

/** The dock: a tab list, a socket that opens a picker (as the Abilities tab's builder does), and Close. */
vi.mock('@/features/delve/training/TrainingPanel', () => ({
  TrainingPanel: function Docked({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <aside data-testid="training-panel">
        <div role="tablist" data-pad-tabs="">
          <button type="button" role="tab" aria-selected="false">
            Loadout
          </button>
          <button type="button" role="tab" aria-selected="true">
            Targets
          </button>
        </div>
        <button type="button" onClick={() => setOpen(true)}>
          Socket 1
        </button>
        <button type="button" onClick={onClose} data-testid="training-panel-close">
          Close
        </button>
        {open && <RunePicker candidates={[]} onPick={() => {}} onClose={() => setOpen(false)} />}
      </aside>
    );
  },
}));

/** Every element given a box while `run` runs (jsdom lays nothing out; the scopes need one). */
function boxed(run: () => void) {
  const box = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
  try {
    act(run);
  } finally {
    box.mockRestore();
  }
}
const key = (code: string) => boxed(() => fireEvent.keyDown(document.body, { code }));
const pad = (button: PadButton) =>
  boxed(() => padPrompts(new Set([button]), {} as Record<PadButton, boolean>, 0));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/delve/training']}>
      <Routes>
        <Route path="/delve/training" element={<DelveTraining />} />
        <Route path="/delve" element={<div data-testid="anvil" />} />
      </Routes>
    </MemoryRouter>,
  );
}
const isPaused = () => live.paused.at(-1);
const dock = () => screen.getByTestId('training-panel').parentElement!;

describe('DelveTraining', () => {
  beforeEach(() => {
    live.calls.length = 0;
    live.paused.length = 0;
    useInputDeviceStore.setState({ device: 'keyboard' });
  });
  afterEach(() => useInputDeviceStore.setState({ device: 'keyboard' }));

  it('lays the Training bar, the 400 px dock (open on entry) and the skill dock on the HUD grid', () => {
    renderPage();
    expect(screen.getByTestId('training-bar').closest('[data-hud="top"]')).not.toBeNull();
    expect(screen.getAllByTestId('training-back')).toHaveLength(1);
    expect(screen.getByTestId('training-panel').closest('[data-hud="right"]')).not.toBeNull();
    expect(dock().getAttribute('style')).toBeNull();
    const grid = screen.getByTestId('training-panel').closest('.delve-hud-zoom')!;
    expect(grid.getAttribute('style')).toContain(
      'grid-template-columns: 380px minmax(0,1fr) 400px',
    );
    expect(screen.getByTestId('skill-bar').closest('[data-hud="dock"]')).not.toBeNull();
  });

  it('with the mouse, Panel opens and closes the dock and the fight runs on', () => {
    renderPage();
    expect(live.calls.at(-1)).toBe(true);
    const toggle = screen.getByTestId('training-panel-toggle');
    fireEvent.click(toggle);
    expect(screen.queryByTestId('training-panel')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByTestId('training-panel')).toBeInTheDocument();
    expect(dock()).not.toHaveAttribute('data-pad-scope');
    expect(isPaused()).toBe(false);
    expect(live.calls.at(-1)).toBe(true);
    fireEvent.click(screen.getByTestId('training-panel-close'));
    expect(screen.queryByTestId('training-panel')).toBeNull();
    expect(isPaused()).toBe(false);
  });

  it('under the pad, View focuses the dock and pauses; B hands the pad back, the dock staying open', () => {
    renderPage();
    useInputDeviceStore.setState({ device: 'gamepad' });
    fireEvent.click(screen.getByTestId('training-panel-toggle')); // the arena's View
    expect(dock()).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('tab', { name: 'Targets' })).toHaveFocus();
    expect(isPaused()).toBe(true);
    expect(live.calls.at(-1)).toBe(false);
    pad('b');
    expect(dock()).not.toHaveAttribute('data-pad-scope');
    expect(document.activeElement).toBe(document.body);
    expect(screen.getByTestId('training-panel')).toBeInTheDocument();
    expect(isPaused()).toBe(false);
    expect(live.calls.at(-1)).toBe(true);
  });

  it('View again, or Esc, hands the pad back too; Menu opens the menu over the focused dock', () => {
    renderPage();
    useInputDeviceStore.setState({ device: 'gamepad' });
    const toggle = screen.getByTestId('training-panel-toggle');
    fireEvent.click(toggle);
    pad('view');
    expect(isPaused()).toBe(false);
    fireEvent.click(toggle);
    key('Escape');
    expect(isPaused()).toBe(false);
    fireEvent.click(toggle);
    pad('menu');
    expect(screen.getByTestId('system-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('menu-resume'));
    expect(screen.queryByTestId('system-menu')).toBeNull();
    expect(dock()).toHaveAttribute('data-pad-scope');
    expect(isPaused()).toBe(true);
  });

  it('Menu opens the system menu over the paused fight; Resume resumes and Anvil leaves', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('training-menu'));
    const menu = screen.getByTestId('system-menu');
    expect(isPaused()).toBe(true);
    expect(live.calls.at(-1)).toBe(false);
    fireEvent.click(within(menu).getByTestId('menu-resume'));
    expect(screen.queryByTestId('system-menu')).toBeNull();
    expect(isPaused()).toBe(false);
    fireEvent.click(screen.getByTestId('training-menu'));
    fireEvent.click(screen.getByTestId('menu-anvil'));
    expect(screen.getByTestId('anvil')).toBeInTheDocument();
  });

  it('pauses the arena while a rune picker is open in the dock', () => {
    renderPage();
    expect(isPaused()).toBe(false);
    fireEvent.click(screen.getByText('Socket 1'));
    expect(live.calls.at(-1)).toBe(false);
    expect(isPaused()).toBe(true);
    fireEvent.click(screen.getByTestId('rune-picker-close'));
    expect(live.calls.at(-1)).toBe(true);
    expect(isPaused()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveTraining.test.tsx)`
Expected: FAIL, 6 failed: `Error: [vitest] No "blurOnPointerUp" export is defined on the "@/features/delve/training/TrainingPanel" mock. Did you forget to return it from "vi.mock"?` (today's page imports it, `openLayout` and `DepthLabel` from the panel).

- [ ] **Step 3: The page**

Overwrite `packages/client/src/pages/DelveTraining.tsx`:

```tsx
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useDelveStore } from '@/stores/delveStore';
import { useControlsStore } from '@/stores/controlsStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { ControlsPanel } from '@/features/controls/ControlsPanel';
import { setArenaLive } from '@/features/gamepad/gamepad-hub';
import { ToastContainer } from '@/components/Toast';
import { usePrompts, type Prompt } from '@/features/delve/kit';
import { SystemMenu } from '@/features/delve/hub/SystemMenu';
import { ArenaControls } from '@/features/delve/arena/ArenaControls';
import { HudGrid, type Insets } from '@/features/delve/arena/hud/HudGrid';
import { SkillDock } from '@/features/delve/arena/hud/SkillDock';
import { BossBar } from '@/features/delve/arena/hud/BossBar';
import { noManaToaster, playArenaEvents } from '@/features/delve/arena/arena-sounds';
import type { CoreUiEvent } from '@/features/delve/arena/useArenaCore';
import { useTrainingArena, type TrainingArena } from '@/features/delve/training/useTrainingArena';
import { TrainingBar } from '@/features/delve/training/TrainingBar';
import { TrainingPanel, type TrainingTab } from '@/features/delve/training/TrainingPanel';
import { useRunePickerOpen } from '@/features/delve/runes/RunePicker';
import '@/features/delve/delve.css';

/** The Training dock's width in design px (the HUD grid's right column). */
const DOCK_WIDTH = 400;

/**
 * The Training Grounds: the arena with the usual HUD, controls and sounds,
 * plus dummies, any monster, rule toggles and a damage meter, on a loadout of
 * its own. It never touches the Delve save. The dock (the right column) opens
 * on entry; with the mouse the fight runs on beside it. Under the pad, View
 * (the Panel button) opens it and gives it the focus, pausing; B or View
 * again hands the pad back to the fight, the dock staying open. Menu opens
 * the system menu, with an Anvil entry, pausing too.
 */
export function DelveTraining() {
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [panelOpen, setPanelOpen] = useState(true);
  /** The pad's focus is in the dock (opened with View): the fight waits. */
  const [padFocus, setPadFocus] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<TrainingTab>('loadout');
  const [controlsOpen, setControlsOpen] = useState(false);

  // A rune picker in the dock pauses too: Space and the pad belong to it.
  const picking = useRunePickerOpen();
  const paused = padFocus || menuOpen || controlsOpen || picking;
  // A layout effect, so the controller changes owner in the same commit as the pause.
  useLayoutEffect(() => {
    setArenaLive(!paused);
    return () => setArenaLive(false);
  }, [paused]);
  const manualAttack = useDelveStore((s) => s.manualAttack);

  // The dock takes the pad's focus on its selected tab, and gives it up when the pad leaves.
  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (padFocus)
      dock?.querySelector<HTMLElement>('[data-pad-tabs] [aria-selected="true"]')?.focus();
    else if (
      document.activeElement instanceof HTMLElement &&
      dock?.contains(document.activeElement)
    )
      document.activeElement.blur();
  }, [padFocus]);

  // The dive's sounds, haptics and no-mana toast.
  const arenaRef = useRef<TrainingArena | null>(null);
  const noManaToast = useMemo(() => noManaToaster(), []);
  const onUi = useCallback(
    (e: CoreUiEvent) => {
      if (e.kind === 'events') playArenaEvents(e.events);
      else noManaToast(arenaRef.current?.hud?.abilities[e.slot]?.name);
    },
    [noManaToast],
  );
  const arena = useTrainingArena(hostRef, { paused, insets, onUi, manualAttack });
  arenaRef.current = arena;

  /** The Panel button: the pad's View focuses the open dock; the mouse and keys toggle it. */
  const onPanel = () => {
    if (useInputDeviceStore.getState().device === 'gamepad') {
      setPanelOpen(true);
      setPadFocus(true);
    } else {
      setPanelOpen((open) => !open);
      setPadFocus(false);
    }
  };
  // Stable, so the memoised panel only re-renders for its own props (and the meter).
  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setPadFocus(false);
  }, []);
  const openControls = useCallback(() => setControlsOpen(true), []);
  const exit = useCallback(() => navigate('/delve'), [navigate]);
  /** The Attack slot's click in Manual: one blow, as a tap of the attack input. */
  const tapAttack = () => {
    arena.attack(true);
    arena.attack(false);
  };

  // While the dock has the pad's focus (its own scope): B or View hands it back, Menu opens the menu.
  const journal = useControlsStore((s) => s.config.keys.journal);
  const view = useControlsStore((s) => s.config.pad.journal);
  const unfocus = () => setPadFocus(false);
  const off = !padFocus;
  const dockPrompts: Prompt[] = [
    {
      id: 'back',
      label: 'Back',
      binding: { key: 'Escape', pad: 'b' },
      onPress: unfocus,
      disabled: off,
    },
    {
      id: 'view',
      label: 'Fight',
      binding: { key: journal ?? undefined, pad: view ?? undefined },
      onPress: unfocus,
      disabled: off,
    },
    {
      id: 'menu',
      label: 'Menu',
      binding: { pad: 'menu' },
      onPress: () => setMenuOpen(true),
      disabled: off,
    },
  ];
  usePrompts(dockPrompts, dockRef);

  return (
    <div className="delve-page select-none bg-black" data-testid="delve-training">
      <div ref={hostRef} className="absolute inset-0" data-testid="arena" />
      <ArenaControls
        input={arena.input}
        heroScreen={arena.heroScreen}
        pixelsPerUnit={arena.pixelsPerUnit}
        disabled={paused}
        manualAttack={manualAttack}
      />

      <HudGrid
        onInsets={setInsets}
        rightWidth={DOCK_WIDTH}
        top={
          <TrainingBar
            meter={arena.meter}
            onResetMeter={arena.actions.resetMeter}
            panelOpen={panelOpen}
            onBack={exit}
            onPanel={onPanel}
            onMenu={() => setMenuOpen(true)}
          />
        }
        right={
          panelOpen && (
            <div
              ref={dockRef}
              className="pointer-events-auto flex min-h-0 flex-1 flex-col"
              data-pad-scope={padFocus || undefined}
            >
              <TrainingPanel
                layout="dock"
                tab={tab}
                onTab={setTab}
                onClose={closePanel}
                onExit={exit}
                actions={arena.actions}
                meter={arena.meter}
                onOpenControls={openControls}
              />
            </div>
          )
        }
        dock={
          <SkillDock
            hud={arena.hud}
            world={arena.worldRef}
            onCast={arena.cast}
            onDodge={arena.dodge}
            onPotion={arena.potion}
            onAttack={tapAttack}
            manualAttack={manualAttack}
          />
        }
      >
        <BossBar hud={arena.hud} />
      </HudGrid>

      {menuOpen && (
        <SystemMenu
          onClose={() => setMenuOpen(false)}
          extra={[{ id: 'anvil', label: 'Anvil', onSelect: exit }]}
        />
      )}
      {/* After the panel: the controller's back button and focus go to the topmost one. */}
      {controlsOpen && <ControlsPanel onClose={() => setControlsOpen(false)} />}
      <ToastContainer />
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveTraining.test.tsx && npx tsc --noEmit -p .)`
Expected: PASS, 6 tests; the typecheck prints nothing. The whole suite reads 1154 tests in 146 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3f
(cd packages/client && npx prettier --end-of-line auto --write src/pages/DelveTraining.tsx src/pages/__tests__/DelveTraining.test.tsx)
git add packages/client/src/pages/DelveTraining.tsx packages/client/src/pages/__tests__/DelveTraining.test.tsx
git commit -m "feat(client): Training on the HUD grid: the bar, a 400 px dock, the menu with Anvil; View focuses the dock and pauses, B hands the pad back" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The dock

### Task 4: `TrainingPanel` as the dock, in the kit, its picker in place

One layout: a glass kit `Panel` (`aside`, "Training" with the `training` glyph, Close), the kit's top-level `Tabs` (`training-tab-<id>`, wrapping to two rows), and the open tab in a scroll well. Every tab keeps its ids and behaviour; its buttons become kit `Button`s, its boxes wells and sockets, its text 14 px or more, its emoji glyphs (see "Where the spec left room"). `blurOnPointerUp` stays, private. `ChainEditor`'s picker renders inline, so a socket's picker opens in the dock, its own scope with Back (decided item 39).

**Files:**
- Overwrite: `packages/client/src/features/delve/training/TrainingPanel.tsx`
- Modify: `packages/client/src/features/delve/chains/ChainEditor.tsx`
- Modify: `packages/client/src/pages/DelveTraining.tsx`
- Modify: `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`, replace:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
```

Delete the line:

```tsx
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
```

Replace the lines from `import {` up to (not including) `import type { TrainingActions } from '../training/useTrainingArena';` with:

```tsx
import { TrainingPanel, type TrainingTab } from '../training/TrainingPanel';
```

Replace:

```tsx
function renderPanel(tab: TrainingTab, layout: PanelLayout = 'sheet') {
```

with:

```tsx
function renderPanel(tab: TrainingTab) {
```

Delete the line:

```tsx
  const onExit = vi.fn();
```

Delete the line:

```tsx
      layout={layout}
```

Delete the line:

```tsx
      onExit={onExit}
```

Replace:

```tsx
  return { actions, onClose, onExit, showTab: (t: TrainingTab) => rerender(panel(t)) };
```

with:

```tsx
  return { actions, onClose, showTab: (t: TrainingTab) => rerender(panel(t)) };
```

Replace:

```tsx
  it('the Abilities tab sockets any rune at any tier, free, up to three a move', () => {
    renderPanel('abilities', 'dock');
```

with:

```tsx
  it('the Abilities tab sockets any rune at any tier, free, up to three a move, picked in the dock', () => {
    renderPanel('abilities');
```

Replace:

```tsx
      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: empty' }),
    );
    const picker = within(screen.getByTestId('rune-picker'));
```

with:

```tsx
      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: empty' }),
    );
    // In place in the dock, not a sheet over the fight.
    expect(within(screen.getByTestId('training-panel')).getByTestId('rune-picker')).toHaveAttribute(
      'data-pad-scope',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    const picker = within(screen.getByTestId('rune-picker'));
```

Replace the lines from `  it("the sheet's Close answers the controller's B; Back to the Anvil carries no marker", () => {` up to (not including) `  it('a control lets go of focus when the pointer does; a list only when the pointer chose it', () => {` with:

```tsx
  it("Close closes the dock (B doesn't: it hands the pad back); the tabs are the kit's top level", () => {
    const { onClose } = renderPanel('toggles');
    const close = screen.getByTestId('training-panel-close');
    expect(close).not.toHaveAttribute('data-pad-back');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();
    const tabs = screen.getByRole('tablist', { name: 'Training' });
    expect(tabs).toHaveAttribute('data-pad-tabs', '');
    expect(screen.getByTestId('training-tab-toggles')).toHaveAttribute('aria-selected', 'true');
    // One way back to the Anvil: the Training bar's.
    expect(screen.queryByTestId('training-panel-exit')).toBeNull();
  });

  it.each(['targets', 'toggles', 'meter'] as const)(
    'the %s tab wears glyphs, not emoji, and no text under 14 px',
    (tab) => {
      renderPanel(tab);
      const panel = screen.getByTestId('training-panel');
      expect(panel.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(panel.innerHTML).not.toMatch(/text-(\[(\d|1[0-3])px\]|xs\b)/);
    },
  );

```

(Loadout and Abilities are left out of the emoji and size check: `AttunementBars` and `ChainEditor` are not 3F's.)

Replace:

```tsx
  it('as a sheet it is a modal dialog, and its lists are named', () => {
    renderPanel('targets');
    expect(screen.getByRole('dialog', { name: 'Training' })).toHaveAttribute('aria-modal', 'true');
```

with:

```tsx
  it('its lists are named', () => {
    renderPanel('targets');
```

Replace:

```tsx
  it('docked, it is a labelled aside', () => {
    renderPanel('loadout', 'dock');
```

with:

```tsx
  it('is a labelled aside', () => {
    renderPanel('loadout');
```

Delete the lines from `describe('DepthLabel', () => {` to the end of the file, and the blank line before it, so the file ends with the `TrainingPanel` block's `});` (`DepthLabel`'s test moved to `TrainingBar.test.tsx` in Task 2; `openLayout` is gone).

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/TrainingPanel.test.tsx)`
Expected: FAIL, 6 failed | 11 passed (17): the picker-in-the-dock test (today's picker is a sheet, a `dialog`), the Close test (Close is the sheet's `data-pad-back`), the three glyph checks (🎯, the element emoji, the reaction icons, `text-[11px]`) and "is a labelled aside" (with no `layout` today's panel renders the sheet).

- [ ] **Step 3: The dock**

Overwrite `packages/client/src/features/delve/training/TrainingPanel.tsx`:

```tsx
import {
  memo,
  useMemo,
  useRef,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  MANA_TYPES,
  MAX_CHAIN,
  MAX_SOCKETS,
  RARITY_ORDER,
  itemStatLines,
  type DummyLayout,
  type ManaType,
  type MonsterKind,
  type SandboxToggles,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import {
  MAX_DEPTH,
  MAX_DUMMY_GROUPS,
  MAX_EXTRA_ATTUNE,
  SLOWMO_SPEEDS,
  sandboxEquipped,
  useSandboxStats,
  useSandboxStore,
  type WeaponChoice,
} from '@/stores/sandboxStore';
import { getDelveRegistry } from '../registry';
import { RARITY_LABEL, RARITY_TEXT, formatStat, legendaryText, manaStyle } from '../format';
import { Button, Chip, Glyph, Panel, Tabs, type TabsProps } from '@/features/delve/kit';
import { AttunementBars } from '../items/AttunementBars';
import { ChainEditor, type ChainRunes } from '../chains/ChainEditor';
import type { MeterSummary } from './meter';
import { MeterTab } from './MeterView';
import type { TrainingActions } from './useTrainingArena';

export type TrainingTab = 'loadout' | 'abilities' | 'targets' | 'toggles' | 'meter';

const TABS: TabsProps<TrainingTab>['tabs'] = (
  [
    ['loadout', 'Loadout'],
    ['abilities', 'Abilities'],
    ['targets', 'Targets'],
    ['toggles', 'Toggles'],
    ['meter', 'Meter'],
  ] as const
).map(([id, label]) => ({ id, label, testId: `training-tab-${id}` }));
const LAYOUTS: [DummyLayout, string][] = [
  ['single', 'One'],
  ['row', 'Row of 5'],
  ['clump', 'Clump of 5'],
];
const KINDS: [MonsterKind, string][] = [
  ['normal', 'Normal'],
  ['elite', 'Elite'],
  ['boss', 'Boss'],
];
const SWITCHES: [keyof SandboxToggles, string, string][] = [
  ['infiniteMana', 'Infinite mana', 'The pool refills every moment.'],
  [
    'noCooldowns',
    'No cooldowns',
    'Cooldowns are off and charge stays full; each move still waits its beat.',
  ],
  [
    'invulnerable',
    'Invulnerable',
    'Hits show in grey but take no life. Off: you get up at once when you fall.',
  ],
];

/**
 * A button, switch or slider lets go of focus once the pointer does, so the
 * arena's keys keep working; focus reached with Tab stays. (Lists are handled
 * in the panel: blurring one on pointer-up would close it.)
 */
function blurOnPointerUp(e: ReactPointerEvent<HTMLElement>): void {
  const el = (e.target as Element).closest('button, input');
  if (el instanceof HTMLElement) el.blur();
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="k-label m-0">{title}</h3>
      {children}
    </section>
  );
}

/** An element's glyph and name, in its colour. */
function ManaName({ mana }: { mana: ManaType }) {
  const style = manaStyle(getDelveRegistry(), mana);
  return (
    <>
      <Glyph id={mana} size={16} color={style.color} /> {style.name}
    </>
  );
}

const SELECT = 'k-well px-2 py-1.5 text-[14px] text-[var(--k-text)]';

const LoadoutTab = memo(function LoadoutTab() {
  const registry = getDelveRegistry();
  const s = useSandboxStore();
  const stats = useSandboxStats();
  const weapon = sandboxEquipped(registry, s).weapon;
  const choice = s.weapon;
  const pick = (next: Partial<WeaponChoice>) =>
    s.setWeapon({ baseId: 'sword', mana: 'fire', rarity: 'rare', ...(choice ?? {}), ...next });

  return (
    <div className="flex flex-col gap-4" data-testid="loadout-tab">
      <Section title="Weapon">
        <div className="flex flex-wrap gap-2">
          {registry.getGearBasesForSlot('weapon').map((b) => (
            <Chip
              key={b.id}
              pressed={choice?.baseId === b.id}
              onClick={() => pick({ baseId: b.id })}
              testId={`weapon-base-${b.id}`}
            >
              {b.name}
            </Chip>
          ))}
          <Chip pressed={!choice} onClick={() => s.setWeapon(null)} testId="weapon-base-none">
            Unarmed
          </Chip>
        </div>
        <fieldset
          disabled={!choice}
          className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
          style={{ opacity: choice ? 1 : 0.5 }}
        >
          <div className="flex flex-wrap gap-2">
            {MANA_TYPES.map((m) => (
              <Chip
                key={m}
                pressed={choice?.mana === m}
                onClick={() => pick({ mana: m })}
                testId={`weapon-mana-${m}`}
              >
                <ManaName mana={m} />
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {RARITY_ORDER.map((r) => (
              <Chip
                key={r}
                pressed={choice?.rarity === r}
                onClick={() => pick({ rarity: r })}
                testId={`weapon-rarity-${r}`}
              >
                <span style={{ color: RARITY_TEXT[r] }}>{RARITY_LABEL[r]}</span>
              </Chip>
            ))}
          </div>
        </fieldset>
        <div className="k-well flex flex-col gap-1 p-3 text-[14px]" data-testid="weapon-lines">
          <div
            className="k-disp text-[20px]"
            style={{ color: weapon ? RARITY_TEXT[weapon.rarity] : 'var(--k-text)' }}
            data-testid="weapon-name"
          >
            {weapon ? weapon.name : 'Unarmed'}
          </div>
          {weapon &&
            itemStatLines(weapon, registry).map((l, i) => (
              <div key={i} className="text-[var(--k-text-2)]">
                {formatStat(registry, l.stat, l.value)}
              </div>
            ))}
          {weapon?.legendary && (
            <div className="text-[var(--k-hot)]">
              {legendaryText(registry, weapon.legendary.id, weapon.legendary.value)}
            </div>
          )}
          {s.loadedWeapon ? (
            <div className="k-caption">
              Your own weapon, from Load my build. Change any option for a clean one.
            </div>
          ) : (
            weapon && (
              <div className="k-caption">
                A clean weapon: its base line, scaled by rarity and depth. Powers are below.
              </div>
            )
          )}
        </div>
      </Section>

      <Section title="Your primary">
        <div className="flex flex-wrap gap-2">
          {MANA_TYPES.map((m) => (
            <Chip
              key={m}
              pressed={s.primary === m}
              onClick={() => s.setPrimary(m)}
              testId={`sandbox-primary-${m}`}
            >
              <ManaName mana={m} />
            </Chip>
          ))}
        </div>
        <p className="k-caption m-0">
          Your primary: your basic blows strike with it, except where they pick your secondary.
        </p>
      </Section>

      <Section title="Your secondary">
        <div className="flex flex-wrap gap-2">
          <Chip pressed={!s.secondary} onClick={() => s.setSecondary(null)} testId="secondary-none">
            None
          </Chip>
          {MANA_TYPES.map((m) => (
            <Chip
              key={m}
              pressed={s.secondary === m}
              disabled={m === s.primary}
              onClick={() => s.setSecondary(m)}
              testId={`secondary-${m}`}
            >
              <ManaName mana={m} />
            </Chip>
          ))}
        </div>
        <p className="k-caption m-0">
          The second element your basic blows can pick (in Abilities, Basic). The default basic
          chain follows your weapon and pair, so binding one gives it the last blow; a chain you
          built keeps its blows.
        </p>
      </Section>

      <Section title="Legendary powers">
        <div className="flex flex-col gap-2">
          {registry.getDelveData().legendaries.map((l) => {
            const on = l.id in s.legendaries;
            // Worn on the loaded gear: on, at the gear's roll, and switched by changing the gear.
            const fromGear = !on && l.id in stats.legendaries;
            const lit = on || fromGear;
            return (
              <button
                key={l.id}
                type="button"
                className="k-socket flex flex-col items-start gap-1 p-3 text-left"
                style={{ borderColor: lit ? 'var(--k-hot)' : undefined }}
                aria-pressed={lit}
                disabled={fromGear}
                onClick={() => s.setLegendary(l.id, !on)}
                data-testid={`legendary-${l.id}`}
              >
                <span className="flex items-center gap-2">
                  {lit && <Glyph id="check" size={14} />}
                  <span
                    className="k-disp text-[18px]"
                    style={{ color: lit ? 'var(--k-hot)' : 'var(--k-text)' }}
                  >
                    {l.name}
                  </span>
                  {fromGear && <span className="k-caption">from your gear</span>}
                </span>
                <span className="k-caption">
                  {legendaryText(registry, l.id, fromGear ? stats.legendaries[l.id] : l.max)}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Attunement">
        <AttunementBars stats={stats} />
        <div className="flex flex-col gap-1" data-testid="extra-attunement">
          {MANA_TYPES.map((m) => {
            const extra = s.attunement[m] ?? 0;
            return (
              <label key={m} className="flex items-center gap-2 text-[14px]">
                <span className="flex w-24 shrink-0 items-center gap-1">
                  <ManaName mana={m} />
                </span>
                <input
                  type="range"
                  min={0}
                  max={MAX_EXTRA_ATTUNE}
                  step={1}
                  value={extra}
                  onChange={(e) => s.setAttunement(m, Number(e.currentTarget.value))}
                  className="min-w-0 flex-1 accent-[#feae34]"
                  data-testid={`extra-attune-${m}`}
                />
                <span className="w-24 shrink-0 text-right text-[var(--k-text-2)]">
                  {stats.attunement[m] - extra} + {extra} ={' '}
                  <b className="text-[var(--k-text)]">{stats.attunement[m]}</b>
                </span>
              </label>
            );
          })}
        </div>
      </Section>

      <Button
        variant="primary"
        onClick={() => s.loadMyBuild(useDelveStore.getState().profile)}
        testId="load-my-build"
      >
        Load my build
      </Button>
      <p className="k-caption m-0">
        Copies your equipped gear, your weapon's chains with their runes, and your pair in. Nothing
        here ever changes your save.
      </p>
    </div>
  );
});

const CAPS = { basic: MAX_CHAIN, primary: MAX_CHAIN, defensive: MAX_CHAIN, ultimate: MAX_CHAIN };

/**
 * The Anvil's chain builder, bound to the sandbox: never locked, any element for
 * an ability, the pair for a blow, and every rune at any tier in up to
 * MAX_SOCKETS sockets a move, free (it's a testing tool), picked in place.
 */
const TrainingAbilities = memo(function TrainingAbilities() {
  const chains = useSandboxStore((s) => s.chains);
  const primary = useSandboxStore((s) => s.primary);
  const secondary = useSandboxStore((s) => s.secondary);
  const baseId = useSandboxStore((s) => s.weapon?.baseId ?? null);
  const stats = useSandboxStats();
  const runes = useMemo<ChainRunes>(
    () => ({
      pouch: 'any',
      socketCap: MAX_SOCKETS,
      socketPrice: () => null,
      weaponBaseId: baseId,
      pullText: () => 'Pull · free',
    }),
    [baseId],
  );
  return (
    <ChainEditor
      chains={chains}
      caps={CAPS}
      stats={stats}
      locked={false}
      onChange={(skill, chain) => useSandboxStore.getState().setChain(skill, chain)}
      blowElements={secondary ? [primary, secondary] : [primary]}
      runes={runes}
    />
  );
});

const TargetsTab = memo(function TargetsTab({ actions }: { actions: TrainingActions }) {
  const registry = getDelveRegistry();
  const biomes = registry.getDelveData().biomes;
  const dummyElement = useSandboxStore((s) => s.dummyElement);
  const full = useSandboxStore((s) => s.dummies.length >= MAX_DUMMY_GROUPS);
  const depth = useSandboxStore((s) => s.depth);
  // In the store (not saved), so the picks survive tab switches.
  const { biomeId, defId, kind, count } = useSandboxStore((s) => s.spawn);
  const biome = biomes.find((b) => b.id === biomeId) ?? biomes[0];
  const defs = [...biome.monsters, biome.boss];
  const def = defs.find((d) => d.id === defId) ?? defs[0];
  const store = useSandboxStore.getState;
  const weakness = registry.getArpgData().weakness;

  return (
    <div className="flex flex-col gap-4" data-testid="targets-tab">
      <Section title="Training dummies">
        <div className="flex flex-wrap items-center gap-2">
          <span className="k-caption">Resists</span>
          <Chip
            pressed={dummyElement === null}
            onClick={() => store().setDummyElement(null)}
            testId="dummy-element-none"
          >
            Neutral
          </Chip>
          {MANA_TYPES.map((m) => (
            <Chip
              key={m}
              pressed={dummyElement === m}
              onClick={() => store().setDummyElement(m)}
              testId={`dummy-element-${m}`}
              aria-label={manaStyle(registry, m).name}
              title={`Resists ${manaStyle(registry, m).name} · weak to ${manaStyle(registry, weakness[m]).name}`}
            >
              <Glyph id={m} size={16} color={manaStyle(registry, m).color} />
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {LAYOUTS.map(([layout, label]) => (
            <Button
              key={layout}
              size="sm"
              disabled={full}
              onClick={() => actions.addDummies(layout)}
              testId={`add-dummy-${layout}`}
            >
              {label}
            </Button>
          ))}
        </div>
        {full && (
          <div className="k-caption text-[var(--k-hot)]" data-testid="dummies-full">
            {MAX_DUMMY_GROUPS} groups at most: clear the dummies to add more.
          </div>
        )}
        <Button size="sm" onClick={actions.resetDummies} testId="reset-dummies">
          Reset dummies
        </Button>
      </Section>

      <Section title="Monsters">
        <select
          className={SELECT}
          value={biome.id}
          onChange={(e) => {
            const next = biomes.find((b) => b.id === e.currentTarget.value) ?? biomes[0];
            store().setSpawn({ biomeId: next.id, defId: next.monsters[0].id });
          }}
          aria-label="Biome"
          data-testid="spawn-biome"
        >
          {biomes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          className={SELECT}
          value={def.id}
          onChange={(e) => store().setSpawn({ defId: e.currentTarget.value })}
          aria-label="Monster"
          data-testid="spawn-monster"
        >
          {defs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.id === biome.boss.id ? ' (boss)' : ''}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          {KINDS.map(([k, label]) => (
            <Chip
              key={k}
              pressed={kind === k}
              onClick={() => store().setSpawn({ kind: k })}
              testId={`spawn-kind-${k}`}
            >
              {label}
            </Chip>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[14px] text-[var(--k-text-2)]">
          Count
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={count}
            onChange={(e) => store().setSpawn({ count: Number(e.currentTarget.value) })}
            className="min-w-0 flex-1 accent-[#feae34]"
            data-testid="spawn-count"
          />
          <b className="w-4 text-right text-[var(--k-text)]">{count}</b>
        </label>
        <Button size="sm" onClick={() => actions.spawn(def.id, kind, count)} testId="spawn-button">
          Spawn {count} × {def.name}
        </Button>
      </Section>

      <Section title="Clear">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => actions.clear('monsters')} testId="clear-monsters">
            Monsters
          </Button>
          <Button size="sm" onClick={() => actions.clear('dummies')} testId="clear-dummies">
            Dummies
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => actions.clear('all')}
            testId="clear-all"
          >
            All
          </Button>
        </div>
      </Section>

      <Section title="Depth">
        <label className="flex items-center gap-2">
          <select
            className={SELECT}
            value={depth}
            onChange={(e) => store().setDepth(Number(e.currentTarget.value))}
            aria-label="Depth"
            data-testid="training-depth"
          >
            {Array.from({ length: MAX_DEPTH }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span className="k-caption">
            {registry.getBiomeForDepth(depth).name}: monsters, dummies and your weapon&apos;s item
            level follow depth. A new depth restarts the arena (dummies come back, spawned monsters
            don&apos;t).
          </span>
        </label>
      </Section>
    </div>
  );
});

const TogglesTab = memo(function TogglesTab({
  actions,
  onOpenControls,
}: {
  actions: TrainingActions;
  onOpenControls: () => void;
}) {
  const toggles = useSandboxStore((s) => s.toggles);
  const slowmo = useSandboxStore((s) => s.slowmo);
  const manual = useDelveStore((s) => s.manualAttack);
  const store = useSandboxStore.getState;

  return (
    <div className="flex flex-col gap-4" data-testid="toggles-tab">
      <Section title="Rules">
        {SWITCHES.map(([key, label, text]) => (
          <button
            key={key}
            type="button"
            className="k-socket flex items-center justify-between gap-3 p-3 text-left"
            aria-pressed={toggles[key]}
            onClick={() => store().setToggles({ ...toggles, [key]: !toggles[key] })}
            data-testid={`toggle-${key}`}
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="k-disp text-[18px]">{label}</span>
              <span className="k-caption">{text}</span>
            </span>
            <span
              className="k-disp shrink-0 text-[18px]"
              style={{ color: toggles[key] ? 'var(--k-ok)' : 'var(--k-text-3)' }}
            >
              {toggles[key] ? 'ON' : 'OFF'}
            </span>
          </button>
        ))}
        <Button size="sm" onClick={actions.fillCharge} testId="fill-charge">
          Fill charge
        </Button>
      </Section>

      <Section title="Slow motion">
        <div className="flex flex-wrap gap-2">
          {SLOWMO_SPEEDS.map((v) => (
            <Chip
              key={v}
              pressed={slowmo === v}
              onClick={() => store().setSlowmo(v)}
              testId={`slowmo-${v}`}
            >
              {v}×
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Controls">
        <Button
          size="sm"
          onClick={() => useDelveStore.getState().setManualAttack(!manual)}
          testId="training-attack-mode"
        >
          Basic attack: {manual ? 'Manual' : 'Auto'}
        </Button>
        <Button size="sm" onClick={onOpenControls} testId="training-open-controls">
          <Glyph id="controls" size={18} /> Controls
        </Button>
      </Section>
    </div>
  );
});

/**
 * The Training dock (glass, the HUD's right column): a heading with Close, the
 * kit's top-level tabs (LB/RB under the pad), and the open tab, which scrolls.
 * The page decides who has the pad's focus. Memoised, with memoised tabs, so
 * the HUD's and the meter's refreshes don't re-render every tab.
 */
export const TrainingPanel = memo(function TrainingPanel({
  tab,
  onTab,
  onClose,
  actions,
  meter,
  onOpenControls,
}: {
  tab: TrainingTab;
  onTab: (tab: TrainingTab) => void;
  onClose: () => void;
  actions: TrainingActions;
  meter: MeterSummary;
  onOpenControls: () => void;
}) {
  // A list picked with the pointer lets go of focus once it changes; one worked with keys keeps it.
  const pointerList = useRef<HTMLSelectElement | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    pointerList.current = (e.target as Element).closest('select');
  };
  // A pointer-opened list closed without a change lets go on the next key, so WASD reach the fight.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.target === pointerList.current) (e.target as HTMLElement).blur();
    pointerList.current = null;
  };
  const onChange = (e: FormEvent<HTMLElement>) => {
    if (e.target instanceof HTMLSelectElement && e.target === pointerList.current) {
      pointerList.current = null;
      e.target.blur();
    }
  };

  return (
    <Panel
      as="aside"
      material="glass"
      aria-label="Training"
      className="min-h-0 flex-1"
      title={
        <span className="flex items-center gap-2">
          <Glyph id="training" size={20} /> Training
        </span>
      }
      aside={
        <Button size="sm" variant="quiet" onClick={onClose} testId="training-panel-close">
          Close
        </Button>
      }
      testId="training-panel"
      onPointerDown={onPointerDown}
      onPointerUp={blurOnPointerUp}
      onKeyDown={onKeyDown}
      onChange={onChange}
    >
      {/* Five tabs in the dock's 360 px: they wrap to a second row. */}
      <div className="[&_.k-tabs]:flex-wrap [&_.k-tabs]:gap-x-4 [&_.k-tabs]:gap-y-0">
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={onTab}
          level="top"
          size="md"
          aria-label="Training"
        />
      </div>
      <div className="k-scroll -mr-2 min-h-0 flex-1 pr-2">
        {tab === 'loadout' && <LoadoutTab />}
        {tab === 'abilities' && <TrainingAbilities />}
        {tab === 'targets' && <TargetsTab actions={actions} />}
        {tab === 'toggles' && <TogglesTab actions={actions} onOpenControls={onOpenControls} />}
        {tab === 'meter' && <MeterTab meter={meter} onReset={actions.resetMeter} />}
      </div>
    </Panel>
  );
});
```

In `packages/client/src/features/delve/chains/ChainEditor.tsx`, replace:

```tsx
      {ed.picker && <RunePicker {...ed.picker} />}
```

with:

```tsx
      {ed.picker && <RunePicker {...ed.picker} variant="inline" />}
```

In `packages/client/src/pages/DelveTraining.tsx`, delete the line:

```tsx
                layout="dock"
```

and delete the line:

```tsx
                onExit={exit}
```

- [ ] **Step 4: Run it to see it pass**

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: PASS, 1155 tests in 146 files; the typecheck prints nothing (`openLayout`, `PanelLayout`, `DepthLabel` and the exported `blurOnPointerUp` have no importer left).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3f
(cd packages/client && npx prettier --end-of-line auto --write src/features/delve/training/TrainingPanel.tsx src/features/delve/chains/ChainEditor.tsx src/pages/DelveTraining.tsx src/features/delve/__tests__/TrainingPanel.test.tsx)
git add packages/client/src/features/delve/training/TrainingPanel.tsx packages/client/src/features/delve/chains/ChainEditor.tsx packages/client/src/pages/DelveTraining.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx
git commit -m "feat(client): the Training dock in the kit: one layout, top-level tabs, glyphs, the rune picker in place; the sheet and openLayout go" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: E2E, the reactions reference, verification

### Task 5: `delve-training.spec.ts`

T01's geometry moves onto `TrainingBar` (Menu joins the row); the sheet's `resume` helper goes (the dock never pauses the mouse's fight; the picker closes itself on a pick); T03, which drove the sheet, now checks the menu: Esc from the live fight presses the bar's Menu, Esc (its Back) resumes, and its Anvil entry leaves. T02 is unchanged but for the helper: its picker is now the inline one, with the same ids. The old T03 fails against Task 4's page (no `data-layout="sheet"`), which is this task's failing state.

**Files:**
- Modify: `packages/client/e2e/delve-training.spec.ts`

- [ ] **Step 1: The spec**

In `packages/client/e2e/delve-training.spec.ts`, replace the lines from `/** Open the Training panel: docked (and open already) on desktop, a sheet on phones. */` up to (not including) `test.describe('Delve Training Grounds', () => {` with:

```ts
/** Open the Training dock (it opens on entry; with the mouse the fight runs on beside it). */
async function openPanel(page: Page): Promise<void> {
  const panel = page.getByTestId('training-panel');
  if (!(await panel.isVisible())) await page.getByTestId('training-panel-toggle').click();
  await expect(panel).toBeVisible();
}

```

Replace the lines from `    // The top bar fits on one line: the meter sits between the two buttons.` up to (not including) `    await openPanel(page);` (the first one) with:

```ts
    // The Training bar fits on one line: Anvil, the meter, then Panel and Menu.
    const bar = (await page.getByTestId('training-bar').boundingBox())!;
    const back = (await page.getByTestId('training-back').boundingBox())!;
    const chip = (await page.getByTestId('meter-chip').boundingBox())!;
    const toggle = (await page.getByTestId('training-panel-toggle').boundingBox())!;
    const menu = (await page.getByTestId('training-menu').boundingBox())!;
    expect(chip.x).toBeGreaterThanOrEqual(back.x + back.width);
    expect(chip.x + chip.width).toBeLessThanOrEqual(toggle.x);
    expect(toggle.x + toggle.width).toBeLessThanOrEqual(menu.x);
    expect(menu.x + menu.width).toBeLessThanOrEqual(bar.x + bar.width);
    // One row: they share the glass bar's middle line.
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
    for (const b of [back, chip, toggle, menu])
      expect(Math.abs(mid(b) - mid(bar))).toBeLessThanOrEqual(2);

```

Replace:

```ts
    await expect(page.getByTestId('weapon-name')).toContainText('Staff');
    await resume(page);
```

with:

```ts
    await expect(page.getByTestId('weapon-name')).toContainText('Staff');
```

Replace:

```ts
    await expect(cards.getByTestId('socket-0')).toHaveAttribute('data-rune', 'echo:5');
    await resume(page);
```

with:

```ts
    await expect(cards.getByTestId('socket-0')).toHaveAttribute('data-rune', 'echo:5');
```

Replace the lines from `  test('T03: Esc closes the Training sheet, and opens the panel again from the fight', async ({` to the end of the file with:

```ts
  test('T03: Esc opens the menu over the paused fight, Esc resumes, and its Anvil entry leaves', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/delve/training');
    await expect(page.getByTestId('ability-0')).toBeVisible({ timeout: ARENA_READY });
    const menu = page.getByTestId('system-menu');
    // The fight is live: the arena's menu key presses the bar's Menu.
    await page.keyboard.press('Escape');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('menu-resume')).toBeFocused();
    // Paused, the menu's Back takes Esc; the dock stays as it was.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.getByTestId('training-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('menu-anvil').click();
    await expect(page).toHaveURL(/\/delve$/);
  });
});
```

- [ ] **Step 2: Run it**

Start the overview's dev server on 5288 (from this worktree's `packages/client`), create the overview's `playwright.scratch.config.ts` there, then:

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve-training.spec.ts e2e/delve-runes.spec.ts --project=desktop)`
Expected: 10 passed (T01–T03, R01–R07; R07 enters the DPS Lab through `training-lab`). Delete `playwright.scratch.config.ts` and stop the server afterwards.

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/alloy-ui-3f
(cd packages/client && npx prettier --end-of-line auto --write e2e/delve-training.spec.ts)
git add packages/client/e2e/delve-training.spec.ts
git commit -m "test(client): Training e2e on the dock: T01's geometry on the Training bar, T03 the menu instead of the sheet" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6 (optional): The reactions reference under the builder

Phase 2 moved the reactions grid to the Codex (`hub/codex/ReactionsGrid.tsx`), and Training lost it. This puts it back under the Abilities tab's builder, as it is, with every reaction discovered (the sandbox shows the whole table), one card a row in the dock. Skipping this task changes nothing else.

**Files:**
- Modify: `packages/client/src/features/delve/training/TrainingPanel.tsx`
- Modify: `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`, replace:

```tsx
  it('adds dummies through the arena, and stops at the cap', () => {
```

with:

```tsx
  it('the Abilities tab names every reaction under the builder', () => {
    renderPanel('abilities');
    const grid = within(screen.getByRole('region', { name: 'Reactions' }));
    for (const r of registry.getArpgData().reactions)
      expect(grid.getByTestId(`reaction-${r.id}`)).toHaveTextContent(r.name);
    expect(grid.queryByTestId('reaction-unknown')).toBeNull();
  });

  it('adds dummies through the arena, and stops at the cap', () => {
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/TrainingPanel.test.tsx)`
Expected: FAIL, 1 failed | 17 passed: `TestingLibraryElementError: Unable to find an accessible element with the role "region" and name "Reactions"`.

- [ ] **Step 3: The grid**

In `packages/client/src/features/delve/training/TrainingPanel.tsx`, replace:

```tsx
import { ChainEditor, type ChainRunes } from '../chains/ChainEditor';
```

with:

```tsx
import { ChainEditor, type ChainRunes } from '../chains/ChainEditor';
import { ReactionsGrid } from '../hub/codex/ReactionsGrid';
```

Replace:

```tsx
 * MAX_SOCKETS sockets a move, free (it's a testing tool), picked in place.
 */
```

with:

```tsx
 * MAX_SOCKETS sockets a move, free (it's a testing tool), picked in place; then
 * every reaction, named (the Codex's grid, all discovered).
 */
```

Replace:

```tsx
  return (
    <ChainEditor
      chains={chains}
      caps={CAPS}
      stats={stats}
      locked={false}
      onChange={(skill, chain) => useSandboxStore.getState().setChain(skill, chain)}
      blowElements={secondary ? [primary, secondary] : [primary]}
      runes={runes}
    />
  );
```

with:

```tsx
  const reactions = getDelveRegistry().getArpgData().reactions;
  return (
    <div className="flex flex-col gap-6">
      <ChainEditor
        chains={chains}
        caps={CAPS}
        stats={stats}
        locked={false}
        onChange={(skill, chain) => useSandboxStore.getState().setChain(skill, chain)}
        blowElements={secondary ? [primary, secondary] : [primary]}
        runes={runes}
      />
      {/* The Codex's grid, one card a row in the dock. */}
      <div className="[&_.grid-cols-2]:grid-cols-1">
        <ReactionsGrid reactionsSeen={reactions.map((r) => r.id)} />
      </div>
    </div>
  );
```

- [ ] **Step 4: Run it to see it pass**

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: PASS, 1156 tests in 146 files; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3f
(cd packages/client && npx prettier --end-of-line auto --write src/features/delve/training/TrainingPanel.tsx src/features/delve/__tests__/TrainingPanel.test.tsx)
git add packages/client/src/features/delve/training/TrainingPanel.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx
git commit -m "feat(client): Training's Abilities tab names every reaction again, the Codex's grid under the builder" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification (the area's end check)

- [ ] `(cd packages/client && npx vitest run)`: 1156 tests in 146 files pass (1155 without Task 6).
- [ ] `(cd packages/client && npx tsc --noEmit -p .)`: prints nothing.
- [ ] `git grep -n "openLayout\|PanelLayout\|DOCK_MIN_WIDTH\|training-panel-exit\|data-layout" -- packages/client` prints nothing.
- [ ] `git diff --stat ui/p3b` lists only the files in "Files".
- [ ] E2E (Task 5's run): `delve-training.spec.ts` T01–T03 and `delve-runes.spec.ts` R01–R07 pass on `--project=desktop`.
- [ ] By hand (dev server, 1920×1080 and 1280×720): the bar on one line; the dock at the right edge, 400 design px, its tabs on two rows with nothing cut; a socket's picker opens in the dock and the page never shifts sideways; with a pad, View focuses the selected tab and freezes the fight, RB steps the tabs, B resumes with the dock open, Menu opens the menu with Resume focused and an Anvil entry.

**E2E ids for the integrator:** see "Cross-area needs" item 4. T01's `openPanel` still clicks `training-panel-toggle` only when the dock is closed; nothing else in the Delve specs reads a Training id.
