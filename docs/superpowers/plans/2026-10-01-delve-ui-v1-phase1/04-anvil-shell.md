# Delve UI v1 · Phase 1 · 1D: the Anvil Shell and Menus — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put today's Anvil inside the forge kit, and ship Phase 1 as v0.54.0. `DelveCamp` renders `AnvilHub`: a kit `Screen` on the wall, with the steel header (anvil glyph, "The Anvil", "Deepest N · n of 12 legendaries", five top tabs, the purse as `Price` glyphs, Power) and the plank footer (prompts, the "Menu" button, Training, the start depths, the hot-metal Delve button, and the chain draft's block). The main area holds today's panels in a centred 960 px column, one tab at a time, with a Quests empty state. Esc / B opens one `SystemMenu` (Resume, Controls, Settings, Main menu; Restart and the pull rule in dev builds). `SettingsPanel` holds the volumes, mute, colorblind mode, HUD scale and the version. `ControlsPanel` and `ManaChoice` become kit `Dialog`s, "How to delve" speaks the device in hand with `InputGlyph`s, `ItemTooltip` is ready for Phases 2 and 3, and `kit/index.ts` exports the whole kit. The Delve E2E follows (phones skip it, the new tab ids, G03, D01, R04, D04), the version goes to 0.54.0, and the whole phase is verified.

**Architecture:** Composition only: 1A drew the kit, 1B wired the prompts and the pad, 1C split the item views, and 1D assembles them. `hub/AnvilHub.tsx` owns the tab, the selected item, the menu and the prompts (one `usePrompts` call: the drawn Select and Menu prompts, plus Training's T / View and the digits 1–5, scoped by a ref inside the screen). `hub/HubHeader.tsx` reads the purse and Power from the store; `hub/HubFooter.tsx` owns the dive's start (the draft check, the start depths, `startDive`) as `DelveCamp` did. `DelveCamp` keeps only the page: the hub (inert under the mana choice), `ManaChoice` and the toasts. The menu's Controls and Settings open in its place, and their Close comes back to it. No engine change, no store change.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, Vitest 3 (jsdom, Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md` at `fe9a488`: the kit contract ("The forge kit (Phase 1)"), "Phase 1: Foundation" → **1D**, "Contract between the Phase 1 areas", "E2E in Phase 1" and the input map. The overview is `00-overview.md` in this folder. The coordinator's additions from the spec review are folded in: `SystemMenu`'s `extra` entries, `ItemTooltip` under `items/`, the hub binding the digits, the interim column's `zoom: calc(1 / var(--ui-scale))`, the `mana-strip` on the interim Loadout tab, D04's `links-count`, and G06 / G07's path to the Primary.

---

## Base

- **Starts from:** branch `ui/p1` after the controller merges step 1·0 (`96d620b`, `4b468c8`), **1A**, **1B** and **1C**. Call that commit `<merge>`. 1D runs alone, in the `ui/p1` worktree `C:\Projects\alloy-ui-p1` (the overview's worktree rules; the client's `@alloy/engine` junction points at the worktree's own `packages/engine`). Every path below is relative to that worktree's root, `/c/Projects/alloy-ui-p1` in Git Bash.
- **What 1D needs from each, as the spec assigns it (and as their drafts build it):**
  - **1·0:** `kit/types.ts` (every prop type of the contract, `Binding`, `Prompt`, `GlyphId`, `TooltipProps`), and `useUIStore`'s `hudScale` with `setHudScale(scale)` persisting `alloy:delve:hudScale`.
  - **1A** (`kit/`): `glyphs.tsx` (`Keycap`, `PadGlyph`, `InputGlyph`, `Glyph`, `Price`, `PromptBar`), `controls.tsx` (`Button`, `Chip`, `Tabs`, `Segmented`, `Bar`), `surfaces.tsx` (`Panel`, `Screen`, `Header`, `Footer`, `Dialog`), `layer.ts` (`uiLayer`), `zoom.ts` (`layerZoom`, `hasZoomedAncestor`), `Tile.tsx`, `Tooltip.tsx` (`Tooltip`, `TooltipCard`), `PixelSprite.tsx`, and `kit.css` (imported by its components), with the `--k-*` tokens on `.delve-ui` and `.delve-page`. `format.ts`'s `RARITY_TEXT`.
  - **1B** (`kit/prompts.ts`): `usePrompts`, `captureNav`, `topScope`, `scopedLast`, `useUiScale`, already exported from `kit/index.ts`. AppShell's `data-frame="full"`, the TabBar hidden on `/delve*`, `--ui-scale` on `:root`; the nav's scoped `press` / `stepTabs`, `data-pad-first`, `data-pad-skip`.
  - **1C** (`items/`): `useItemComparison.ts`, `PowerDelta.tsx` (`{ cmp, label? }`), `ItemStatLines.tsx`, `LegendaryBox.tsx` (null for a non-legendary).
- **Anchors that depend on the merge.** Every file 1D edits is 1D's alone in Phase 1 (the spec's ownership list), so its anchors are checked against HEAD `fe9a488` (identical at `4b468c8`): `pages/DelveCamp.tsx`, `pages/__tests__/DelveCamp.test.tsx`, `features/controls/ControlsPanel.tsx` and its test, `features/delve/ManaChoice.tsx`, `playwright.config.ts`, the three Delve E2E specs and `package.json`. Two places depend on the others' output:
  - `kit/index.ts` is **overwritten** whole (a Write, not an Edit), whatever 1·0, 1A and 1B left in it. Its module names are 1A's and 1B's files above. If 1A named a file differently, the controller renames that one `from` path (Task 1's typecheck fails on a wrong one).
  - `ItemTooltip.tsx` imports 1C's four files by the names above.
- **Before Task 1:** build the engine for the client's junction and measure the merged client:

```bash
cd /c/Projects/alloy-ui-p1
(cd packages/engine && npx tsup)
(cd packages/client && npx vitest run && npx tsc --noEmit -p .)
```

  Expected: tsup's "Build success" lines; the client suite passes and the typecheck prints nothing. `ui/p1` at `4b468c8` reads 881 tests in 99 files; 1A, 1B and 1C add their own. Call the measured counts **N tests in F files**. This area ends at **N + 22 tests in F + 6 files**.

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/kit/index.ts` | **Overwritten:** the contract's types, then every component and hook, from 1A's and 1B's modules |
| `packages/client/src/features/delve/kit/__tests__/kit-index.test.ts` (new) | every contract name is a function the index exports |
| `packages/client/src/features/delve/hub/types.ts` (new) | `HubMode`, `HubTab` (the first two lines of the spec's Phase 2 hub contract) |
| `packages/client/src/features/delve/hub/AnvilHub.tsx` (new) | the hub screen: tabs, the interim column per tab (how-to, paper doll, `mana-strip`, bag; Skills; Forge; Codex with the lifetime stats; the Quests empty state), the item sheet, the system menu, the prompts |
| `packages/client/src/features/delve/hub/HubHeader.tsx` (new) | the header band: anvil glyph, title, subtitle, the tabs slot, `scrap-count`, `links-count`, `dust-count`, `hero-power` |
| `packages/client/src/features/delve/hub/HubFooter.tsx` (new) | the footer planks: prompts, the draft block, Training, the start depths, the Delve button (`TRAINING_BINDING`) |
| `packages/client/src/features/delve/hub/HowTo.tsx` (new) | "How to delve" (`delve-howto`) per device, with `InputGlyph`s of the player's bindings |
| `packages/client/src/features/delve/hub/SystemMenu.tsx` (new) | the Esc / B menu (`system-menu`): Resume, Controls, Settings, `extra`, Main menu; dev Restart and the pull chip |
| `packages/client/src/features/delve/hub/SettingsPanel.tsx` (new) | Settings (`settings-panel`): volumes, mute, colorblind mode, HUD scale, the version |
| `packages/client/src/features/delve/items/ItemTooltip.tsx` (new) | `ItemTooltipCard` and `ItemTooltip` (1C's pieces in a `TooltipCard`) |
| `packages/client/src/features/delve/hub/__tests__/{AnvilHub,HowTo,SystemMenu,SettingsPanel}.test.tsx` (new) | their render and behaviour tests |
| `packages/client/src/features/delve/items/__tests__/ItemTooltip.test.tsx` (new) | the card and the tooltip |
| `packages/client/src/pages/DelveCamp.tsx` | rewritten: the page, the hub (inert under the choice), `ManaChoice`, the toasts |
| `packages/client/src/pages/__tests__/DelveCamp.test.tsx` | the tab badge, the glyph purse, Restart through the menu, the kit dialog; the pull chip's tests move to `SystemMenu.test.tsx` |
| `packages/client/src/features/controls/ControlsPanel.tsx` | in a kit `Dialog`; kit `Chip`s and `Button`s; 14 px text at the least |
| `packages/client/src/features/controls/__tests__/ControlsPanel.test.tsx` | one test: a kit dialog in the UI layer |
| `packages/client/src/features/delve/ManaChoice.tsx` | in a forced kit `Dialog`; mana glyphs for the emoji |
| `packages/client/playwright.config.ts` | the three phone projects ignore `delve*.spec.ts` |
| `packages/client/e2e/delve.spec.ts` | D01's real scrap assertion; D04's `links-count` and `mana-strip`; D08's `tab-skills` |
| `packages/client/e2e/delve-runes.spec.ts` | `tab-skills` (R01, R05, R06); R04's `'0 scrap'` |
| `packages/client/e2e/delve-gamepad.spec.ts` | `padToPrimary`; G06 and G07's tab ids and path; G03 over the five tabs |
| `packages/client/package.json` | version 0.54.0 |

Nothing else changes: `delve-training.spec.ts` (its `training-button` keeps its id), `TabBar.tsx` and `SettingsDrawer.tsx` (the classic screens keep them), and every file another area owns.

## Cross-area needs

No edit in another area's files. What 1D relies on, for the controller to check at the merge (each holds in the area's draft as of this writing):

1. **1A, `Price`:** draws every amount it's given, 0 included, and leaves out an absent one; Links pluralise ("1 Link", "3 Links"); its text content is exactly its label ("0 scrap", "1 Link", "40 Mana Dust", thousands with commas). R04 (`'0 scrap'`), D01 (`/[1-9][\d,]* scrap/`), D04 (`'1 Link'`) and the hub's tests read `scrap-count` and `links-count` through it.
2. **1A, `Dialog`:** `role="dialog"`, `aria-modal="true"`, named by its `title`, inside a `[data-pad-scope]` in `uiLayer()` (`#delve-ui-layer`), `testId` on an element inside that scope, a Back with `data-pad-back` when `onClose` is given (none when forced), and the `footer` slot. 1A's draft focuses the first control on open (the Back), which is fine here.
3. **1A, `Button` and `Chip`:** spread their other props onto the `<button>` (1D passes `data-pad-menu`, `data-pad-first`, `aria-describedby`, `disabled`, `className`, `onBlur`), and `Chip` sets `aria-pressed` from `pressed`.
4. **1A, `Tabs`:** `role="tablist"` named by `aria-label`, `data-pad-tabs` on it, `role="tab"` buttons carrying each tab's `testId` and `aria-selected`, and the `badge` drawn inside the tab. **Digits:** the coordinator's rule is that the hub binds 1–5 (through `usePrompts`) and `Tabs` only draws their glyphs. 1A's draft also binds them in `Tabs`; either way one handler acts first and calls `preventDefault`, the other skips the event, and both pick the same tab, so 1D works with or without it.
5. **1A, `Screen`:** its root is the `[data-pad-scope]` and carries `testId`; it fills its positioned parent (1A's draft: `position: absolute; inset: 0`). `Footer` draws `children` at the right of the prompts. `PromptBar` draws an `asButton` prompt as a `<button>` with `data-pad-skip`, and `data-pad-back` when `padBack`.
6. **1B, `usePrompts`:** a prompt binds in the scope of its ref's nearest `[data-pad-scope]`, only while that scope is the topmost visible one, and a prompt that handles a key calls `preventDefault`, so the hub's Escape-bound Menu prompt and the global Esc rule never both act.
7. **1C:** `useItemComparison(uid)` returns `{ item, where, cmp }`; `PowerDelta` takes `label`; `LegendaryBox` returns null for a non-legendary.

## Where the spec left room

- **The draft count** moves into the Skills tab's badge as a number (`draft-count`, `aria-label` "1 unapplied change"); the footer's draft block still says why the Delve button waits.
- **The lifetime stats** sit under `CodexPanel` on the Codex tab until 2C's Records (the spec moves them there; Phase 1 has no scrolling column to keep them in).
- **Prompts drawn and bound.** The footer draws Select and Menu. The hub's `usePrompts` call takes those two plus Training (T / View; its button draws the glyph) and the digits 1–5 (the tabs draw them), so the "same array" rule holds for what the footer draws.
- **Esc / B in the hub.** The "Menu" prompt is bound to Escape and B and is the `data-pad-back` button: the registry runs it once, and the global Esc rule would press the same button. Opening the menu is idempotent either way.
- **The menu's Controls and Settings** open in its place (one dialog at a time), and their Close returns to the menu. Restart closes the menu once the save is wiped, which brings up the mana choice.
- **`SettingsPanel`** has a "Done" in its footer (`settings-close`) beside the dialog's Back, as `ControlsPanel` keeps its Close (`controls-close`). Volumes are sliders 0–100%, the HUD scale a slider 80–125% in steps of 5 (`hud-scale`, `hud-scale-value`), colorblind mode a `Segmented` (`colorblind-<mode>`), mute a `Chip` (`settings-mute`), the version `settings-version` ("Alloy v0.54.0").
- **`ItemTooltip`** is `{ uid } & Omit<TooltipProps, 'content'>`, its card `ItemTooltipCard({ uid })`: the name in `RARITY_TEXT`, "Rarity Base · Slot" (" · Equipped" when worn), a bag item's `PowerDelta` under "Against what you wear", `ItemStatLines` and `LegendaryBox`. Nothing renders it in Phase 1; 2A puts it on the equipped tiles and 3A on the Found log.
- **The how-to** keeps today's paragraphs, rewritten for the device: the pad's sticks and triggers, or the WASD keys and the mouse, each glyph from the player's own bindings (left out when unbound on that device). It still says the manual attack switches "in the dive menu" (3b moves the toggle to Controls).
- **Emoji:** the header and currencies use glyphs (1D's assignment). The `mana-strip`'s element emoji become element glyphs, and so do `ManaChoice`'s; the fusion names lose their emoji. The legacy panels keep theirs until their phase.
- **The interim column** undoes the screen's zoom (`zoom: calc(1 / var(--ui-scale, 1))`, the coordinator's rule), so today's 10–13 px panel text stays at its size at the 0.75 scale.
- **The page root** keeps `data-testid="delve-camp"` on `DelveCamp`'s `delve-page`, which also takes `delve-ui` so the legacy item sheet and the toasts (siblings of the screen, outside its zoom) get the forge look; the screen's own id is `hub-anvil` (`hub-${mode}`).
- **G06 and G07** reach the Primary through `padToPrimary` (down from the Skills tab until the skill row has the focus, then along it), so the header's layout can't break them. **G03** steps all five tabs with RB and wraps, as `stepTabs` does today.

## Conventions

The overview's shared conventions (the runes overview's, which amend the 4a plan's). In short:
- **One commit per task** on `ui/p1` (nine), staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-ui-p1`.
- **Line endings:** a fresh worktree checks every existing file here out CRLF except `package.json` (LF); `file <path>` tells. Keep each file's own. New files are written LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** every existing file edited here passed `npx prettier --check --end-of-line auto` at HEAD, and the code below is already formatted (checked on the scratch copy), so each commit block's `--write` changes nothing typed as written. Never format `CLAUDE.md` or the specs (this plan touches neither).
- **How the edits read:** the 4a plan's language. "Replace: A with: B" is one Edit. "Replace the lines from `A` up to (not including) `B` with: C", "…to the end of the file with: C", "Delete the lines from `A` up to (not including) `B`." and "Create `f`:" (a Write) as there; "Overwrite `f`:" is a Write over an existing file. Every anchor is unique in its file at that point; apply each file's edits top to bottom.
- **Checked on a scratch copy:** `ui/p1` at `4b468c8` (`git archive`), with stand-ins for 1A and 1B written from the contract (and 1A's and 1B's drafts), and 1C's four files from its draft. This plan's edits were applied task by task, every FAIL and PASS below was run, the typecheck and the client build were clean, and the client suite went from 881 tests in 99 files to 903 in 105 (+22, +6). The E2E edits were applied with a script that checked each anchor once in its file, and `playwright test --list` shows the 24 Delve tests on `desktop` only. The E2E itself runs at Task 8, on the merged kit.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Engine bundle (once) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(cd packages/client && npx tsc -b && npx vite build)` (the package's `build` script) |
| E2E (Task 8) | `(cd packages/client && npx playwright test -c playwright.scratch.config.ts --project=desktop <specs>)` |

---

## Chunk 1: The kit's index, Settings, the dialogs and the menu

### Task 1: The kit index exports the whole kit

Every screen imports the kit from `@/features/delve/kit`. 1·0 left the index with the types (and 1B added its hooks), so 1D fills in the rest.

**Files:**
- Overwrite: `packages/client/src/features/delve/kit/index.ts`
- Create: `packages/client/src/features/delve/kit/__tests__/kit-index.test.ts`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/kit/__tests__/kit-index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as kit from '../index';

/** Every component and hook of the spec's kit contract, as screens import them. */
const CONTRACT = [
  'usePrompts',
  'captureNav',
  'topScope',
  'scopedLast',
  'useUiScale',
  'Keycap',
  'PadGlyph',
  'InputGlyph',
  'Glyph',
  'Price',
  'PromptBar',
  'Panel',
  'Screen',
  'Header',
  'Footer',
  'Dialog',
  'uiLayer',
  'layerZoom',
  'hasZoomedAncestor',
  'Button',
  'Tabs',
  'Chip',
  'Segmented',
  'Bar',
  'Tile',
  'Tooltip',
  'TooltipCard',
  'PixelSprite',
] as const;

describe('the kit index', () => {
  it('exports every component and hook of the kit contract', () => {
    const missing = CONTRACT.filter((name) => typeof kit[name] !== 'function');
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/kit-index.test.ts)`
Expected: FAIL, 1 failed: `expected [ 'Keycap', 'PadGlyph', …(21) ] to deeply equal []`. The 23 names are 1A's components; 1B's five hooks are already exported. (If 1B's index did not export them, they head the list.)

- [ ] **Step 3: The index**

Overwrite `packages/client/src/features/delve/kit/index.ts`:

```ts
// The forge kit's public surface (Delve UI v1): the contract's types, then every component and hook.
export type * from './types';
export { captureNav, scopedLast, topScope, usePrompts, useUiScale } from './prompts';
export { Glyph, InputGlyph, Keycap, PadGlyph, Price, PromptBar } from './glyphs';
export { Dialog, Footer, Header, Panel, Screen } from './surfaces';
export { uiLayer } from './layer';
export { hasZoomedAncestor, layerZoom } from './zoom';
export { Bar, Button, Chip, Segmented, Tabs } from './controls';
export { Tile } from './Tile';
export { Tooltip, TooltipCard } from './Tooltip';
export { PixelSprite } from './PixelSprite';
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/kit-index.test.ts)`
Expected: PASS (1 test).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors (a wrong module name is a TS2307 here: rename that `from`); N + 1 tests pass in F + 1 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/kit/index.ts src/features/delve/kit/__tests__/kit-index.test.ts)
git add packages/client/src/features/delve/kit/index.ts packages/client/src/features/delve/kit/__tests__/kit-index.test.ts
git commit -m "feat(client): the Delve UI kit's index exports every component and hook" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: `SettingsPanel`

The Delve's Settings: the classic drawer's `uiStore` fields, the HUD scale, and the version the Delve has no TabBar to show.

**Files:**
- Create: `packages/client/src/features/delve/hub/SettingsPanel.tsx`
- Create: `packages/client/src/features/delve/hub/__tests__/SettingsPanel.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/__tests__/SettingsPanel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';
import { useUIStore } from '@/stores/uiStore';
import { version } from '../../../../../package.json';

describe('SettingsPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ isMuted: false, colorblindMode: 'none', hudScale: 1 });
  });

  it('binds the volumes, the mute and the colorblind mode to the ui store', () => {
    render(<SettingsPanel onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('volume-sfx'), { target: { value: '40' } });
    expect(useUIStore.getState().sfxVolume).toBeCloseTo(0.4);
    fireEvent.change(screen.getByTestId('volume-master'), { target: { value: '55' } });
    expect(useUIStore.getState().masterVolume).toBeCloseTo(0.55);
    const mute = screen.getByTestId('settings-mute');
    expect(mute).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(mute);
    expect(useUIStore.getState().isMuted).toBe(true);
    expect(mute).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('colorblind-tritanopia'));
    expect(useUIStore.getState().colorblindMode).toBe('tritanopia');
  });

  it('sets the HUD scale from 80% to 125%, kept on this device', () => {
    render(<SettingsPanel onClose={() => {}} />);
    const hud = screen.getByTestId('hud-scale');
    expect(hud).toHaveAttribute('min', '80');
    expect(hud).toHaveAttribute('max', '125');
    expect(screen.getByTestId('hud-scale-value')).toHaveTextContent('100%');
    fireEvent.change(hud, { target: { value: '110' } });
    expect(useUIStore.getState().hudScale).toBeCloseTo(1.1);
    expect(localStorage.getItem('alloy:delve:hudScale')).toBe('1.1');
    expect(screen.getByTestId('hud-scale-value')).toHaveTextContent('110%');
  });

  it('shows the version, which the Delve has no TabBar for, and closes from Done', () => {
    const onClose = vi.fn();
    render(<SettingsPanel onClose={onClose} />);
    expect(screen.getByTestId('settings-version')).toHaveTextContent(`v${version}`);
    fireEvent.click(screen.getByTestId('settings-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/SettingsPanel.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../SettingsPanel" from "src/features/delve/hub/__tests__/SettingsPanel.test.tsx". Does the file exist?`

- [ ] **Step 3: The panel**

Create `packages/client/src/features/delve/hub/SettingsPanel.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Button, Chip, Dialog, Segmented } from '@/features/delve/kit';
import { version } from '../../../../package.json';

type Colorblind = 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';

const COLORBLIND: { id: Colorblind; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'deuteranopia', label: 'Deuteranopia' },
  { id: 'protanopia', label: 'Protanopia' },
  { id: 'tritanopia', label: 'Tritanopia' },
];

/** Settings → HUD scale, in percent (the spec's 80 to 125%). */
const HUD_PERCENT = [80, 125] as const;

/**
 * The Delve's Settings (from the system menu): the same `uiStore` fields as
 * the classic drawer (volumes, mute, colorblind mode), the HUD scale, and the
 * version, which the Delve has no TabBar to show.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const ui = useUIStore();
  const volume = (category: 'master' | 'sfx' | 'ui', label: string, value: number) => (
    <Slider
      id={`volume-${category}`}
      label={label}
      min={0}
      max={100}
      step={1}
      value={Math.round(value * 100)}
      shown={`${Math.round(value * 100)}%`}
      onChange={(v) => {
        ui.setVolume(category, v / 100);
        playSound('buttonClick');
      }}
    />
  );
  const hud = Math.round(ui.hudScale * 100);
  return (
    <Dialog
      title="Settings"
      onClose={onClose}
      width={600}
      testId="settings-panel"
      footer={
        <Button onClick={onClose} testId="settings-close">
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-6 text-[16px] text-[var(--k-text-2)]">
        <Section title="Audio">
          {volume('master', 'Master volume', ui.masterVolume)}
          {volume('sfx', 'Effects', ui.sfxVolume)}
          {volume('ui', 'Interface sounds', ui.uiVolume)}
          <Chip pressed={ui.isMuted} onClick={ui.toggleMute} testId="settings-mute">
            Mute all sound
          </Chip>
        </Section>
        <Section title="Colorblind mode">
          <Segmented
            aria-label="Colorblind mode"
            columns={4}
            value={ui.colorblindMode}
            onChange={(id) => ui.setColorblindMode(id)}
            options={COLORBLIND.map((c) => ({ ...c, testId: `colorblind-${c.id}` }))}
          />
        </Section>
        <Section title="Display">
          <Slider
            id="hud-scale"
            label="HUD scale"
            min={HUD_PERCENT[0]}
            max={HUD_PERCENT[1]}
            step={5}
            value={hud}
            shown={<span data-testid="hud-scale-value">{hud}%</span>}
            onChange={(v) => ui.setHudScale(v / 100)}
          />
        </Section>
        <p className="text-[14px] text-[var(--k-text-3)]" data-testid="settings-version">
          Alloy v{version}
        </p>
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[14px] uppercase tracking-[0.06em] text-[var(--k-text-3)] [font-family:var(--k-font-label)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Slider({
  id,
  label,
  min,
  max,
  step,
  value,
  shown,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  shown: ReactNode;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-4">
      <span className="w-48 shrink-0 text-[var(--k-text)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="min-w-0 flex-1 accent-[#feae34]"
        data-testid={id}
      />
      <span className="w-16 shrink-0 text-right">{shown}</span>
    </label>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/SettingsPanel.test.tsx)`
Expected: PASS (3 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 4 tests pass in F + 2 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/SettingsPanel.tsx src/features/delve/hub/__tests__/SettingsPanel.test.tsx)
git add packages/client/src/features/delve/hub/SettingsPanel.tsx packages/client/src/features/delve/hub/__tests__/SettingsPanel.test.tsx
git commit -m "feat(client): the Delve's Settings: volumes, mute, colorblind mode, HUD scale and the version" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: `ControlsPanel` and `ManaChoice` in kit dialogs

The same content in a kit `Dialog`: the Controls editor with a Back (and its own Close), the mana choice forced (no back, no Esc). Both portal into the zoomed UI layer. The Controls editor's own Esc handler stays: it cancels a key capture first, and its `preventDefault` keeps the kit from acting on the same press.

**Files:**
- Modify: `packages/client/src/features/controls/ControlsPanel.tsx`
- Modify: `packages/client/src/features/controls/__tests__/ControlsPanel.test.tsx`
- Modify: `packages/client/src/features/delve/ManaChoice.tsx`
- Modify: `packages/client/src/pages/__tests__/DelveCamp.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/controls/__tests__/ControlsPanel.test.tsx`:

Replace:

```tsx
  it('closes with its Close button or Esc', () => {
```

with:

```tsx
  it('opens as a kit dialog: a modal named Controls, in the UI layer, holding the pad', () => {
    render(<ControlsPanel onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Controls' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.closest('[data-pad-scope]')).not.toBeNull();
    expect(dialog.closest('#delve-ui-layer')).not.toBeNull();
  });

  it('closes with its Close button or Esc', () => {
```

In `packages/client/src/pages/__tests__/DelveCamp.test.tsx`:

Replace:

```tsx
    expect(choice).toHaveAttribute('data-pad-scope');
```

with:

```tsx
    expect(choice.closest('[data-pad-scope]')).not.toBeNull();
```

Replace:

```tsx
    expect(screen.getByRole('dialog', { name: 'Choose your mana' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
```

with:

```tsx
    const dialog = screen.getByRole('dialog', { name: 'Choose your mana' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // A kit dialog: in the zoomed UI layer, over the hub.
    expect(dialog.closest('#delve-ui-layer')).not.toBeNull();
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/controls/__tests__/ControlsPanel.test.tsx src/pages/__tests__/DelveCamp.test.tsx)`
Expected: FAIL, 2 failed: ControlsPanel's new test (`Unable to find an accessible element with the role "dialog" and name "Controls"`) and DelveCamp's "the choice holds the keyboard and the pad: the Anvil behind it is inert" (`expected null not to be null`: the choice renders inline today). The rest pass: 6 of 7 in the ControlsPanel file, 13 of 14 in DelveCamp's.

- [ ] **Step 3: The dialogs**

In `packages/client/src/features/controls/ControlsPanel.tsx`:

Replace:

```tsx
import { capturePadButton } from '@/features/gamepad/gamepad-hub';
```

with:

```tsx
import { capturePadButton } from '@/features/gamepad/gamepad-hub';
import { Button, Chip, Dialog, Glyph } from '@/features/delve/kit';
```

Replace the lines from `const cell = (id: string, label: string, active: boolean, onClick: () => void) => (` up to the end of the file with:

```tsx
  const cell = (id: string, label: string, active: boolean, onClick: () => void) => (
    <Chip pressed={active} onClick={onClick} className="min-w-[96px] justify-center" testId={id}>
      {active ? 'Press…' : label}
    </Chip>
  );
  const isCapturing = (kind: Capture['kind'], action: KeyAction) =>
    capturing?.kind === kind && capturing.action === action;
  const caption = 'text-[14px] uppercase tracking-[0.06em] text-[var(--k-text-3)]';

  return (
    <Dialog
      title={
        <span className="flex items-center gap-3">
          <Glyph id="controls" size={28} /> Controls
        </span>
      }
      onClose={onClose}
      width={680}
      testId="controls-panel"
      footer={
        <Button onClick={onClose} testId="controls-close">
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-[16px] text-[var(--k-text-2)]">
        <p>
          Pick a cell, then press the button or key you want (Esc cancels). If another action
          already uses it, the two swap. Changes apply at once.
        </p>

        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2">
          <span className={caption}>Action</span>
          <span className={`${caption} text-center`}>Controller</span>
          <span className={`${caption} text-center`}>Keyboard</span>
          {CONTROL_ACTIONS.map((a) => (
            <div key={a} className="contents">
              <span className="text-[var(--k-text)]">{ACTION_LABELS[a]}</span>
              {cell(`bind-pad-${a}`, padLabel(cfg.pad[a]), isCapturing('pad', a), () =>
                setCapturing({ kind: 'pad', action: a }),
              )}
              {cell(
                `bind-key-${a}`,
                a === 'attack' && !cfg.keys.attack ? 'Click' : keyLabel(cfg.keys[a]),
                isCapturing('key', a),
                () => setCapturing({ kind: 'key', action: a }),
              )}
            </div>
          ))}
          {MOVE_KEYS.map((a) => (
            <div key={a} className="contents">
              <span className="text-[var(--k-text)]">{ACTION_LABELS[a]}</span>
              <span className="text-center text-[14px]">Left stick</span>
              {cell(`bind-key-${a}`, keyLabel(cfg.keys[a]), isCapturing('key', a), () =>
                setCapturing({ kind: 'key', action: a }),
              )}
            </div>
          ))}
        </div>

        <section className="flex flex-col gap-2">
          <div className={caption}>Controller: hold to keep casting</div>
          <div className="flex flex-wrap gap-2">
            {REPEAT_ACTIONS.map((a) => (
              <Chip
                key={a}
                pressed={cfg.repeat[a]}
                onClick={() => store().setRepeat(a, !cfg.repeat[a])}
                testId={`repeat-${a}`}
              >
                {ACTION_LABELS[a]}
              </Chip>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <Slider
            id="deadzone-left"
            label="Move stick deadzone"
            value={cfg.deadzone.left}
            limits={DEADZONE_LIMITS.left}
            format={(v) => v.toFixed(2)}
            onChange={(v) => store().setDeadzone('left', v)}
          />
          <Slider
            id="deadzone-right"
            label="Aim stick deadzone"
            value={cfg.deadzone.right}
            limits={DEADZONE_LIMITS.right}
            format={(v) => v.toFixed(2)}
            onChange={(v) => store().setDeadzone('right', v)}
          />
          <Slider
            id="aim-reach"
            label="Placed abilities at full tilt"
            value={cfg.aimReach}
            limits={AIM_REACH_LIMITS}
            format={(v) => `${Math.round(v * 100)}% of range`}
            onChange={(v) => store().setAimReach(v)}
          />
        </section>

        <div className="flex flex-wrap gap-2">
          <Button onClick={copy} testId="controls-copy">
            {copied ? 'Copied' : 'Copy setup'}
          </Button>
          <Button onClick={() => store().reset()} testId="controls-reset">
            Reset to default
          </Button>
        </div>
        {text && (
          <textarea
            readOnly
            className="h-40 w-full bg-[var(--k-well)] p-2 font-mono text-[14px] text-[var(--k-text-2)]"
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            data-testid="controls-text"
          />
        )}
      </div>
    </Dialog>
  );
}

function Slider({
  id,
  label,
  value,
  limits,
  format,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  limits: readonly [number, number];
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-56 shrink-0 text-[var(--k-text)]">{label}</span>
      <input
        type="range"
        min={limits[0]}
        max={limits[1]}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="min-w-0 flex-1 accent-[#feae34]"
        data-testid={id}
      />
      <span className="w-36 shrink-0 text-right text-[14px]">{format(value)}</span>
    </label>
  );
}
```

In `packages/client/src/features/delve/ManaChoice.tsx`:

Replace:

```tsx
import { manaStyle } from './format';
```

with:

```tsx
import { manaStyle } from './format';
import { Dialog, Glyph } from './kit';
```

Replace the lines from `/**` up to the end of the file with:

```tsx
/**
 * The one-time "Choose your mana" screen, over the Anvil while the hero has
 * no primary: your starting gear attunes to it and your first abilities use it.
 * A forced kit dialog: no back, no Esc.
 */
export function ManaChoice() {
  const registry = getDelveRegistry();
  const fusions = registry.getArpgData().fusions;
  const choose = (mana: ManaType) => {
    playSound('orbConfirm');
    vibrate('success');
    useDelveStore.getState().chooseMana(mana);
  };
  return (
    <Dialog title="Choose your mana" width={1080} testId="mana-choice">
      <div className="flex flex-col gap-4">
        <p className="text-center text-[18px] text-[var(--k-text-2)]">
          Your gear attunes to it, your blows strike with it, and your first abilities use it.
          Between dives you'll bind a second element, to build into your moves and blows.
        </p>
        <div className="grid grid-cols-3 gap-4">
          {MANA_TYPES.map((m) => {
            const st = manaStyle(registry, m);
            const mixes = fusions.filter((f) => f.elements.includes(m));
            return (
              <button
                key={m}
                type="button"
                className="delve-panel flex flex-col items-start gap-2 p-4 text-left"
                style={{ borderColor: st.color }}
                onClick={() => choose(m)}
                data-testid={`mana-choice-${m}`}
              >
                <span className="flex items-center gap-2 text-[24px] [font-family:var(--k-font-display)]">
                  <Glyph id={m} size={24} color={st.color} /> {st.name}
                </span>
                <span className="text-[16px] text-[var(--k-text)]">{PLAY_STYLE[m]}</span>
                <span className="text-[14px] text-[var(--k-text-2)]">
                  Every blow applies a stack of {st.name}: {title(BASIC_STATUS[m])}
                </span>
                <span className="text-[14px] text-[var(--k-text-3)]">
                  Fusions: {mixes.map((f) => f.name).join(' · ')}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
```

(The line reading `/**` alone is the `ManaChoice` doc comment's first line; the one above `PLAY_STYLE` is a one-line `/** … */`.)

- [ ] **Step 4: Run them to see them pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/controls/__tests__/ControlsPanel.test.tsx src/pages/__tests__/DelveCamp.test.tsx)`
Expected: PASS (7 and 14 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 5 tests pass in F + 2 files. `DelveRun` and `DelveTraining` open the same `ControlsPanel`, now a dialog over the arena; nothing else about them changes.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p1
(cd packages/client && npx prettier --write --end-of-line auto src/features/controls/ControlsPanel.tsx src/features/controls/__tests__/ControlsPanel.test.tsx src/features/delve/ManaChoice.tsx src/pages/__tests__/DelveCamp.test.tsx)
git add packages/client/src/features/controls/ControlsPanel.tsx packages/client/src/features/controls/__tests__/ControlsPanel.test.tsx packages/client/src/features/delve/ManaChoice.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git commit -m "feat(client): the Controls editor and the mana choice as kit dialogs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: `SystemMenu`

The one Esc / B menu: Resume, Controls, Settings, any `extra` entries (3F's "Anvil"), Main menu, and in dev builds Restart and the pull rule, which leave `DelveCamp` here (their tests move with them in Task 7).

**Files:**
- Create: `packages/client/src/features/delve/hub/SystemMenu.tsx`
- Create: `packages/client/src/features/delve/hub/__tests__/SystemMenu.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/__tests__/SystemMenu.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SystemMenu } from '../SystemMenu';
import { UNSOCKET_KEY, useDelveStore } from '@/stores/delveStore';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderMenu = (props: Partial<Parameters<typeof SystemMenu>[0]> = {}) =>
  render(
    <MemoryRouter>
      <SystemMenu onClose={() => {}} {...props} />
    </MemoryRouter>,
  );

describe('SystemMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it('is a kit dialog: Resume closes it, Main menu leaves for the main menu', () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(menu.closest('#delve-ui-layer')).not.toBeNull();
    fireEvent.click(screen.getByTestId('menu-resume'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('menu-main'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('opens Controls and Settings in its place, and their Close comes back to it', () => {
    renderMenu();
    fireEvent.click(screen.getByTestId('open-controls'));
    expect(screen.getByTestId('controls-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('system-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('controls-close'));
    expect(screen.getByTestId('system-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('open-settings'));
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-close'));
    expect(screen.getByTestId('system-menu')).toBeInTheDocument();
  });

  it("lists a screen's extra entries", () => {
    const onSelect = vi.fn();
    renderMenu({ extra: [{ id: 'anvil', label: 'Anvil', onSelect }] });
    fireEvent.click(screen.getByTestId('menu-anvil'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('Restart Delve (dev) wipes the save on a second press, and closes the menu', () => {
    const s = useDelveStore.getState();
    s.startDive(1);
    s.setProfile({ ...useDelveStore.getState().profile, scrap: 500 });
    const onClose = vi.fn();
    renderMenu({ onClose });
    fireEvent.click(screen.getByTestId('restart-delve'));
    // The first press only asks.
    expect(useDelveStore.getState().profile.scrap).toBe(500);
    expect(screen.getByTestId('restart-delve')).toHaveTextContent(/wipe/i);
    fireEvent.click(screen.getByTestId('restart-delve'));
    const p = useDelveStore.getState().profile;
    expect(p).toMatchObject({ scrap: 0, dive: null, pair: { primary: null } });
    expect(p.stats.dives).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the dev chip flips the pull rule and keeps it on this device', () => {
    act(() => useDelveStore.setState({ unsocket: null }));
    renderMenu();
    const chip = screen.getByTestId('unsocket-chip');
    expect(chip).toHaveTextContent('Pull: destroys'); // the balance's rule
    fireEvent.click(chip);
    expect(chip).toHaveTextContent('Pull: pays');
    expect(useDelveStore.getState().unsocket).toBe('pay');
    expect(localStorage.getItem(UNSOCKET_KEY)).toBe('pay');
    fireEvent.click(chip);
    expect(chip).toHaveTextContent('Pull: destroys');
  });

  it('a production build shows neither Restart nor the pull chip', () => {
    const dev = import.meta.env.DEV;
    import.meta.env.DEV = false as unknown as boolean;
    try {
      renderMenu();
      expect(screen.queryByTestId('restart-delve')).toBeNull();
      expect(screen.queryByTestId('unsocket-chip')).toBeNull();
    } finally {
      import.meta.env.DEV = dev;
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/SystemMenu.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../SystemMenu" from "src/features/delve/hub/__tests__/SystemMenu.test.tsx". Does the file exist?`

- [ ] **Step 3: The menu**

Create `packages/client/src/features/delve/hub/SystemMenu.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { unsocketMode } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { ControlsPanel } from '@/features/controls/ControlsPanel';
import { Button, Chip, Dialog, Glyph } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';
import { SettingsPanel } from './SettingsPanel';

/** An entry a screen adds to the menu, above Main menu (the Training Grounds' "Anvil", 3F). */
export interface SystemMenuEntry {
  id: string;
  label: string;
  onSelect: () => void;
}

/**
 * The one Esc / B menu: Resume, Controls, Settings, any `extra` entries and
 * Main menu, plus Restart and the pull rule in dev builds. Controls and
 * Settings open in its place, and their Back returns to it.
 */
export function SystemMenu({
  onClose,
  extra = [],
}: {
  onClose: () => void;
  extra?: SystemMenuEntry[];
}) {
  const navigate = useNavigate();
  const unsocket = useDelveStore((s) => s.unsocket);
  const [view, setView] = useState<'menu' | 'controls' | 'settings'>('menu');
  const [confirmRestart, setConfirmRestart] = useState(false);
  // Dev builds: what pulling a rune does here (the balance's rule until the chip picks one).
  const pull = unsocketMode(getDelveRegistry(), unsocket);

  if (view === 'controls') return <ControlsPanel onClose={() => setView('menu')} />;
  if (view === 'settings') return <SettingsPanel onClose={() => setView('menu')} />;
  return (
    <Dialog title="Menu" onClose={onClose} width={440} testId="system-menu">
      <div className="flex flex-col gap-3">
        <Button variant="primary" size="lg" onClick={onClose} testId="menu-resume">
          Resume
        </Button>
        <Button onClick={() => setView('controls')} testId="open-controls">
          <Glyph id="controls" size={20} /> Controls
        </Button>
        <Button onClick={() => setView('settings')} testId="open-settings">
          <Glyph id="settings" size={20} /> Settings
        </Button>
        {extra.map((e) => (
          <Button key={e.id} onClick={e.onSelect} testId={`menu-${e.id}`}>
            {e.label}
          </Button>
        ))}
        <Button onClick={() => navigate('/')} testId="menu-main">
          Main menu
        </Button>
        {import.meta.env.DEV && (
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Chip
              onClick={() => {
                if (!confirmRestart) return setConfirmRestart(true);
                setConfirmRestart(false);
                useDelveStore.getState().resetProfile();
                onClose();
              }}
              onBlur={() => setConfirmRestart(false)}
              testId="restart-delve"
            >
              {confirmRestart ? 'Press again to wipe this save' : 'Restart Delve (dev)'}
            </Chip>
            <Chip
              onClick={() =>
                useDelveStore.getState().setUnsocket(pull === 'destroy' ? 'pay' : 'destroy')
              }
              testId="unsocket-chip"
            >
              {pull === 'destroy' ? 'Pull: destroys' : 'Pull: pays'}
            </Chip>
          </div>
        )}
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/SystemMenu.test.tsx)`
Expected: PASS (6 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 11 tests pass in F + 3 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/SystemMenu.tsx src/features/delve/hub/__tests__/SystemMenu.test.tsx)
git add packages/client/src/features/delve/hub/SystemMenu.tsx packages/client/src/features/delve/hub/__tests__/SystemMenu.test.tsx
git commit -m "feat(client): one system menu for the Delve: Resume, Controls, Settings, Main menu, dev chips" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The item tooltip and the how-to

### Task 5: `ItemTooltip`

1C's item views in a kit `TooltipCard`, for the hub's equipped tiles (2A) and the HUD's Found log (3A, inline with `portal={false}`).

**Files:**
- Create: `packages/client/src/features/delve/items/ItemTooltip.tsx`
- Create: `packages/client/src/features/delve/items/__tests__/ItemTooltip.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/items/__tests__/ItemTooltip.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { baseDisplayName } from '@alloy/engine';
import { ItemTooltip, ItemTooltipCard } from '../ItemTooltip';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../registry';

const worn = () => useDelveStore.getState().profile.equipped;

describe('ItemTooltip', () => {
  beforeEach(() => {
    localStorage.clear();
    // A fire hero in a common sword and a common chest.
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it("names an equipped item, what it is and that it's worn", () => {
    const sword = worn().weapon!;
    render(<ItemTooltipCard uid={sword.uid} />);
    expect(screen.getByText(sword.name)).toBeInTheDocument();
    const what = `Common ${baseDisplayName(getDelveRegistry(), sword)} · Weapon · Equipped`;
    expect(screen.getByText(what)).toBeInTheDocument();
    expect(screen.queryByText('Against what you wear')).toBeNull();
  });

  it('compares a bag item with what is worn', () => {
    const chest = worn().chest!;
    act(() => useDelveStore.getState().unequip('chest'));
    render(<ItemTooltipCard uid={chest.uid} />);
    expect(screen.getByText(chest.name)).toBeInTheDocument();
    expect(screen.getByText('Against what you wear')).toBeInTheDocument();
  });

  it('shows nothing for an item the save no longer holds', () => {
    const { container } = render(<ItemTooltipCard uid="gone" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the card over its child', () => {
    const sword = worn().weapon!;
    render(
      <ItemTooltip uid={sword.uid} openWhile>
        <button type="button">tile</button>
      </ItemTooltip>,
    );
    expect(screen.getByRole('button', { name: 'tile' })).toBeInTheDocument();
    expect(screen.getByText(sword.name)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/items/__tests__/ItemTooltip.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../ItemTooltip" from "src/features/delve/items/__tests__/ItemTooltip.test.tsx". Does the file exist?`

- [ ] **Step 3: The tooltip**

Create `packages/client/src/features/delve/items/ItemTooltip.tsx`:

```tsx
import type { ReactElement } from 'react';
import { baseDisplayName } from '@alloy/engine';
import { Tooltip, TooltipCard, type TooltipProps } from '../kit';
import { getDelveRegistry } from '../registry';
import { RARITY_COLOR, RARITY_LABEL, RARITY_TEXT, SLOT_LABEL } from '../format';
import { useItemComparison } from './useItemComparison';
import { PowerDelta } from './PowerDelta';
import { ItemStatLines } from './ItemStatLines';
import { LegendaryBox } from './LegendaryBox';

/**
 * An item's card: its name in its rarity, what it is and where, how a bag item
 * compares with what's worn, its stat lines and its legendary power.
 */
export function ItemTooltipCard({ uid }: { uid: string }): ReactElement | null {
  const { item, where, cmp } = useItemComparison(uid);
  if (!item) return null;
  const what = `${RARITY_LABEL[item.rarity]} ${baseDisplayName(getDelveRegistry(), item)}`;
  return (
    <TooltipCard
      title={<span style={{ color: RARITY_TEXT[item.rarity] }}>{item.name}</span>}
      subtitle={`${what} · ${SLOT_LABEL[item.slot]}${where === 'equipped' ? ' · Equipped' : ''}`}
      accent={RARITY_COLOR[item.rarity]}
      width={380}
    >
      {where === 'bag' && <PowerDelta cmp={cmp} label="Against what you wear" />}
      <ItemStatLines item={item} />
      <LegendaryBox item={item} />
    </TooltipCard>
  );
}

/**
 * Hover or focus shows the item's card: the hub's equipped tiles (Phase 2) and
 * the HUD's Found log (Phase 3, with `portal={false}`).
 */
export function ItemTooltip({
  uid,
  ...rest
}: { uid: string } & Omit<TooltipProps, 'content'>): ReactElement {
  return <Tooltip {...rest} content={() => <ItemTooltipCard uid={uid} />} />;
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/items/__tests__/ItemTooltip.test.tsx)`
Expected: PASS (4 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 15 tests pass in F + 4 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/items/ItemTooltip.tsx src/features/delve/items/__tests__/ItemTooltip.test.tsx)
git add packages/client/src/features/delve/items/ItemTooltip.tsx packages/client/src/features/delve/items/__tests__/ItemTooltip.test.tsx
git commit -m "feat(client): an item tooltip card from the item views" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: "How to delve" per device

Today's how-to, rewritten for the device that holds the input lock, its glyphs from the player's own bindings.

**Files:**
- Create: `packages/client/src/features/delve/hub/HowTo.tsx`
- Create: `packages/client/src/features/delve/hub/__tests__/HowTo.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/__tests__/HowTo.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { HowTo } from '../HowTo';
import { useControlsStore } from '@/stores/controlsStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';

describe('HowTo', () => {
  beforeEach(() => {
    localStorage.clear();
    useControlsStore.getState().reset();
    act(() => useInputDeviceStore.getState().setDevice('keyboard'));
  });

  it('speaks mouse and keys with the keys in hand, and names the Skills tab', () => {
    render(<HowTo />);
    const howto = screen.getByTestId('delve-howto');
    expect(howto).toHaveTextContent('hold one to aim with the mouse');
    expect(howto).not.toHaveTextContent('left stick');
    expect(howto).toHaveTextContent('Skills');
    expect(howto).not.toHaveTextContent('Abilities');
  });

  it('speaks the controller once the pad has the input lock', () => {
    render(<HowTo />);
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    const howto = screen.getByTestId('delve-howto');
    expect(howto).toHaveTextContent('The left stick moves and the right stick aims');
    expect(howto).not.toHaveTextContent('hold one to aim with the mouse');
  });

  it("draws the player's own bindings", () => {
    act(() => useControlsStore.getState().setKey('dodge', 'KeyZ'));
    render(<HowTo />);
    expect(screen.getByTestId('delve-howto')).toHaveTextContent('Z dodges');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/HowTo.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../HowTo" from "src/features/delve/hub/__tests__/HowTo.test.tsx". Does the file exist?`

- [ ] **Step 3: The how-to**

Create `packages/client/src/features/delve/hub/HowTo.tsx`:

```tsx
import { useControlsStore } from '@/stores/controlsStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import type { KeyAction } from '@/features/controls/controls';
import { InputGlyph, Panel } from '@/features/delve/kit';

/**
 * "How to delve", on a first save: the controls in the glyphs of the device in
 * hand, from the player's own bindings, then the loop.
 */
export function HowTo() {
  const cfg = useControlsStore((s) => s.config);
  const pad = useInputDeviceStore((s) => s.device) === 'gamepad';
  /** An action's glyph on the device in hand; nothing when it is unbound there. */
  const g = (a: KeyAction) => {
    const key = cfg.keys[a];
    const button = a in cfg.pad ? cfg.pad[a as keyof typeof cfg.pad] : null;
    if (pad ? !button : !key) return null;
    return <InputGlyph size="sm" binding={{ key: key ?? undefined, pad: button ?? undefined }} />;
  };
  return (
    <Panel
      title="How to delve"
      testId="delve-howto"
      scroll={false}
      className="text-[16px] leading-relaxed text-[var(--k-text-2)]"
    >
      <div className="flex flex-col gap-2">
        {pad ? (
          <p>
            The left stick moves and the right stick aims. {g('primary')} casts your Primary,{' '}
            {g('defensive')} your Defensive and {g('ultimate')} your Ultimate. The D-pad and{' '}
            <InputGlyph size="sm" binding={{ pad: 'a' }} /> work every menu.
          </p>
        ) : (
          <p>
            {g('up')}
            {g('left')}
            {g('down')}
            {g('right')} move you (or hold the mouse to walk toward it). {g('primary')}{' '}
            {g('defensive')} {g('ultimate')} cast your Primary, Defensive and Ultimate: hold one to
            aim with the mouse.
          </p>
        )}
        <p>
          Your hero attacks whatever is in reach and builds mana (or attack by hand: switch it in
          the dive menu). {g('dodge')} dodges: dodge through a blow just as it lands for a{' '}
          <b className="text-[var(--k-hot-hi)]">PERFECT</b>, and your next hit crits and staggers.
        </p>
        <p>
          Each skill is a chain of moves, carried by your weapon: build them on the{' '}
          <b className="text-[var(--k-text)]">Skills</b> tab, each move a kind (light, medium,
          heavy, or a hold you charge), a form and one or two elements. Each press casts the chain's
          next move, each harder than the last; a pause starts it over. Better weapons carry more
          skills, and Links from salvaged weapons buy more slots. Gear attunes you to its element
          and powers those moves.
        </p>
        <p>
          Loot bursts from monsters: walk over it, and equip it here between dives. A green{' '}
          <b className="text-[var(--k-ok)]">▲</b> means it's an upgrade.
        </p>
        <p>
          Between depths, push deeper or <b className="text-[var(--k-hot)]">extract</b> to bank your
          bounty. Die and you lose the bounty but keep every item.
        </p>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/HowTo.test.tsx)`
Expected: PASS (3 tests). The third reads 1A's keycap for `KeyZ` as "Z" (`InputGlyph` draws the key's label, as `keyLabel` does).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 18 tests pass in F + 5 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/HowTo.tsx src/features/delve/hub/__tests__/HowTo.test.tsx)
git add packages/client/src/features/delve/hub/HowTo.tsx packages/client/src/features/delve/hub/__tests__/HowTo.test.tsx
git commit -m "feat(client): How to delve speaks the device in hand, with its glyphs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The hub

### Task 7: `AnvilHub`, its header and footer, and `DelveCamp`

The Anvil becomes one kit screen. `DelveCamp` keeps the page; the hub keeps everything else, and today's panels sit in its interim column.

**Files:**
- Create: `packages/client/src/features/delve/hub/types.ts`
- Create: `packages/client/src/features/delve/hub/HubHeader.tsx`
- Create: `packages/client/src/features/delve/hub/HubFooter.tsx`
- Create: `packages/client/src/features/delve/hub/AnvilHub.tsx`
- Create: `packages/client/src/features/delve/hub/__tests__/AnvilHub.test.tsx`
- Modify: `packages/client/src/pages/DelveCamp.tsx` (rewritten)
- Modify: `packages/client/src/pages/__tests__/DelveCamp.test.tsx`

- [ ] **Step 1: The failing tests**

Create `packages/client/src/features/delve/hub/__tests__/AnvilHub.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AnvilHub } from '../AnvilHub';
import { useDelveStore } from '@/stores/delveStore';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderHub = () =>
  render(
    <MemoryRouter>
      <AnvilHub mode="anvil" />
    </MemoryRouter>,
  );
/** The hub's own tabs (the chain builder has tabs of its own). */
const hubTabs = () =>
  within(screen.getByRole('tablist', { name: 'The Anvil' })).getAllByRole('tab');
const selected = () =>
  hubTabs()
    .filter((t) => t.getAttribute('aria-selected') === 'true')
    .map((t) => t.getAttribute('data-testid'));
/** A key press as the window hears it, with every element given a box (jsdom lays nothing out). */
const press = (code: string) => {
  const box = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
  try {
    fireEvent.keyDown(document.body, { code });
  } finally {
    box.mockRestore();
  }
};

describe('AnvilHub', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it('is a kit screen whose header holds the five tabs, the purse and Power', () => {
    renderHub();
    const hub = screen.getByTestId('hub-anvil');
    expect(hub).toHaveAttribute('data-pad-scope');
    expect(hubTabs().map((t) => t.getAttribute('data-testid'))).toEqual([
      'tab-loadout',
      'tab-skills',
      'tab-forge',
      'tab-codex',
      'tab-quests',
    ]);
    expect(selected()).toEqual(['tab-loadout']);
    expect(screen.getByRole('tablist', { name: 'The Anvil' })).toHaveAttribute('data-pad-tabs');
    expect(screen.getByTestId('scrap-count')).toHaveTextContent(/^0 scrap$/);
    expect(screen.getByTestId('links-count')).toHaveTextContent(/^0 Links$/);
    expect(screen.getByTestId('dust-count')).toHaveTextContent(/Mana Dust$/);
    expect(screen.getByTestId('hero-power')).toBeInTheDocument();
    expect(hub).toHaveTextContent('Deepest 0 · 0 of 12 legendaries');
  });

  it('shows each tab: Loadout with the how-to, Skills, Forge, Codex and the Quests empty state', () => {
    renderHub();
    expect(screen.getByTestId('delve-howto')).toBeInTheDocument();
    expect(screen.getByTestId('paper-doll')).toBeInTheDocument();
    expect(screen.getByTestId('bag-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-skills'));
    expect(screen.getByTestId('abilities-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-forge'));
    expect(screen.getByTestId('forge-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-codex'));
    expect(screen.getByTestId('codex-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-quests'));
    expect(screen.getByTestId('quests-empty')).toHaveTextContent('Quests arrive in a later update');
  });

  it("the Loadout's attunement line opens Skills, and the how-to goes after the first dive", () => {
    act(() => {
      const p = useDelveStore.getState().profile;
      useDelveStore.getState().setProfile({ ...p, stats: { ...p.stats, dives: 1 } });
    });
    renderHub();
    expect(screen.queryByTestId('delve-howto')).toBeNull();
    const strip = screen.getByTestId('mana-strip');
    expect(strip).toHaveTextContent('Skills ›');
    fireEvent.click(strip);
    expect(selected()).toEqual(['tab-skills']);
  });

  it('the digits 1–5 pick a tab, and T opens the Training Grounds', () => {
    renderHub();
    press('Digit4');
    expect(selected()).toEqual(['tab-codex']);
    press('Digit2');
    expect(selected()).toEqual(['tab-skills']);
    press('KeyT');
    expect(mockNavigate).toHaveBeenCalledWith('/delve/training');
  });

  it("the footer's Menu (Esc / B) opens the system menu, and Resume closes it", () => {
    renderHub();
    const menu = document.querySelector<HTMLElement>('[data-pad-back]')!;
    expect(menu).toHaveTextContent('Menu');
    expect(menu).toHaveAttribute('data-pad-skip');
    fireEvent.click(menu);
    expect(screen.getByTestId('system-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('menu-resume'));
    expect(screen.queryByTestId('system-menu')).toBeNull();
  });

  it('the footer holds Training, the start depths and the Delve button, the first focus', () => {
    act(() => {
      const p = useDelveStore.getState().profile;
      useDelveStore.getState().setProfile({ ...p, bestDepth: 6, checkpoints: [5] });
    });
    renderHub();
    expect(screen.getByTestId('training-button')).toHaveTextContent('Training');
    expect(screen.getByTestId('start-depths')).toBeInTheDocument();
    const delve = screen.getByTestId('delve-button');
    expect(delve).toHaveAttribute('data-pad-menu');
    expect(delve).toHaveAttribute('data-pad-first');
    fireEvent.click(delve);
    expect(mockNavigate).toHaveBeenCalledWith('/delve/run');
  });
});
```

In `packages/client/src/pages/__tests__/DelveCamp.test.tsx`:

Replace:

```tsx
import { UNSOCKET_KEY, useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
import { useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
import { moveFocus } from '@/features/gamepad/use-gamepad-nav';
```

with:

```tsx
import { moveFocus } from '@/features/gamepad/use-gamepad-nav';
import { uiLayer } from '@/features/delve/kit';
```

Replace:

```tsx
    expect(screen.getByTestId('draft-count')).toHaveTextContent('1 unapplied change');
```

with:

```tsx
    const count = screen.getByTestId('draft-count');
    expect(count).toHaveTextContent(/^1$/);
    expect(count).toHaveAttribute('aria-label', '1 unapplied change');
```

Delete the lines from `it('the dev chip flips the pull rule and keeps it on this device', () => {` up to (not including) `it('Discard changes & delve reverts the draft and starts the dive in one press', () => {`.

The two tests it deletes, the pull chip's and the production build's, are `SystemMenu.test.tsx`'s now.

Replace:

```tsx
    expect(screen.getByTestId('links-count')).toHaveTextContent('🔗 3 Links');
```

with:

```tsx
    expect(screen.getByTestId('links-count')).toHaveTextContent(/^3 Links$/);
```

Replace:

```tsx
    expect(screen.getByTestId('links-count')).toHaveTextContent(/^🔗 1 Link$/);
```

with:

```tsx
    expect(screen.getByTestId('links-count')).toHaveTextContent(/^1 Link$/);
```

Replace:

```tsx
  it('Restart Delve (dev) wipes the save on a second press, back to the mana choice', () => {
```

with:

```tsx
  it('Restart Delve (dev), from the system menu, wipes the save back to the mana choice', () => {
```

Replace:

```tsx
    fireEvent.click(screen.getByTestId('restart-delve'));
    // The first press only asks.
```

with:

```tsx
    // The footer's Menu (Esc / B) opens the system menu.
    fireEvent.click(document.querySelector<HTMLElement>('[data-pad-back]')!);
    fireEvent.click(screen.getByTestId('restart-delve'));
    // The first press only asks.
```

Replace:

```tsx
    expect(screen.getByTestId('mana-choice')).toBeInTheDocument();
  });

  it('asks nothing once the mana is chosen', () => {
```

with:

```tsx
    expect(screen.getByTestId('mana-choice')).toBeInTheDocument();
    expect(screen.queryByTestId('system-menu')).toBeNull();
  });

  it('asks nothing once the mana is chosen', () => {
```

Replace:

```tsx
    expect(screen.getByTestId('open-controls').closest('[inert]')).not.toBeNull();
```

with:

```tsx
    expect(screen.getByTestId('training-button').closest('[inert]')).not.toBeNull();
```

Replace:

```tsx
    // jsdom lays nothing out: give every element a box so the pad sees them.
```

with:

```tsx
    // In the app the UI layer follows the page; here an earlier test's layer may precede it.
    document.body.append(uiLayer());
    // jsdom lays nothing out: give every element a box so the pad sees them.
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/AnvilHub.test.tsx src/pages/__tests__/DelveCamp.test.tsx)`
Expected: FAIL. `AnvilHub.test.tsx`, no tests: `Error: Failed to resolve import "../AnvilHub" from "src/features/delve/hub/__tests__/AnvilHub.test.tsx". Does the file exist?`. `DelveCamp.test.tsx`: 3 failed, 9 passed:
- "a pending chain draft blocks the Delve button…" (`toHaveTextContent`: "1 unapplied change" isn't `/^1$/`)
- "shows the Links beside the scrap" (`toHaveTextContent`: the emoji)
- "Restart Delve (dev), from the system menu…" (`Unable to fire a "click" event - please provide a DOM element.`: no Menu button yet)

- [ ] **Step 3: The hub's types, header and footer**

Create `packages/client/src/features/delve/hub/types.ts`:

```ts
// The Anvil hub's shared types (the spec's "Shared contract (the hub)"; Phase 2 adds the rest).

export type HubMode = 'anvil' | 'pause';
export type HubTab = 'loadout' | 'skills' | 'forge' | 'codex' | 'quests';
```

Create `packages/client/src/features/delve/hub/HubHeader.tsx`:

```tsx
import { useMemo, type ReactNode } from 'react';
import { profilePower } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Glyph, Header, Price } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';
import { useCountUp } from '../useCountUp';
import { formatNumber } from '../format';

/**
 * The hub's steel band: the anvil and "The Anvil", the deepest depth and the
 * legendaries found, the tabs (`nav`), then the purse and Power.
 */
export function HubHeader({ nav }: { nav: ReactNode }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const power = useMemo(() => profilePower(registry, profile), [registry, profile]);
  const shownPower = useCountUp(power);
  const found = Object.keys(profile.codex).length;
  const legendaries = registry.getDelveData().legendaries.length;
  return (
    <Header
      title={
        <span className="flex items-center gap-3">
          <Glyph id="anvil" size={40} /> The Anvil
        </span>
      }
      subtitle={`Deepest ${profile.bestDepth} · ${found} of ${legendaries} legendaries`}
      nav={nav}
      aside={
        <>
          <span data-testid="scrap-count">
            <Price scrap={profile.scrap} />
          </span>
          <span data-testid="links-count">
            <Price links={profile.links} />
          </span>
          <span data-testid="dust-count">
            <Price dust={profile.manaDust} />
          </span>
          <span aria-hidden className="h-[30px] w-[2px] bg-[var(--k-steel-2)]" />
          <span className="flex items-baseline gap-2">
            <span
              className="text-[30px] text-[var(--k-hot-hi)] [font-family:var(--k-font-display)]"
              data-testid="hero-power"
            >
              {formatNumber(shownPower)}
            </span>
            <span className="text-[14px] uppercase tracking-[0.06em] text-[var(--k-text-3)] [font-family:var(--k-font-label)]">
              Power
            </span>
          </span>
        </>
      }
    />
  );
}
```

Create `packages/client/src/features/delve/hub/HubFooter.tsx`:

```tsx
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { isDiveActive, startDepthOptions } from '@alloy/engine';
import { applyLabel, selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Chip, Footer, Glyph, type Binding, type Prompt } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';

/** Training's inputs: T, or View on the pad. The hub binds it through usePrompts; the button draws it. */
export const TRAINING_BINDING: Binding = { key: 'KeyT', pad: 'view' };

/**
 * The hub's planks: the prompts, then Training, the start depths and the hot
 * metal Delve button (Enter with nothing focused, or Start). An unapplied chain
 * draft blocks the dive, and its block (apply, or discard and delve) sits
 * before the button until Phase 2's Apply bar.
 */
export function HubFooter({ prompts, onTraining }: { prompts: Prompt[]; onTraining: () => void }) {
  const navigate = useNavigate();
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const id = useId();
  const starts = startDepthOptions(registry, profile);
  const [start, setStart] = useState(starts[starts.length - 1]);
  const active = isDiveActive(profile);
  // The chain builder's unapplied changes: a new dive waits until they're applied or discarded.
  // The builder's Apply, here too: its total, and the engine's op as a dry run (why it can't go).
  const view = useDelveStore(selectDraftApply);
  const blocked = Object.keys(view.changes).length > 0 && !active;
  const applying = blocked ? view.dry : null;
  const applyWhy = applying && !applying.ok ? applying.reason : null;
  const depth = starts.includes(start) ? start : 1;

  const onDelve = () => {
    if (!active && !useDelveStore.getState().startDive(depth)) return;
    playSound('phaseTransition');
    vibrate('medium');
    navigate('/delve/run');
  };
  const onApply = () => {
    const res = useDelveStore.getState().applyDraft();
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
  };
  const onDiscardAndDelve = () => {
    useDelveStore.getState().revertDraft();
    onDelve();
  };

  return (
    <Footer prompts={prompts}>
      {blocked && (
        <div className="flex items-center gap-3" data-testid="draft-block">
          <div className="flex max-w-[280px] flex-col text-[14px] leading-tight">
            <span id={`${id}-draft`} className="text-[var(--k-hot)]" data-testid="draft-warning">
              Unapplied changes: apply or discard them to delve
            </span>
            {applyWhy && (
              <span
                id={`${id}-apply`}
                className="text-[var(--k-bad-text)]"
                data-testid="draft-apply-why"
              >
                {applyWhy}
              </span>
            )}
          </div>
          <Button
            variant="go"
            size="sm"
            disabled={!applying?.ok}
            onClick={onApply}
            aria-describedby={applyWhy ? `${id}-apply` : undefined}
            testId="draft-apply"
          >
            {applyLabel(registry, view.price)}
          </Button>
          <Button size="sm" onClick={onDiscardAndDelve} testId="draft-discard-delve">
            Discard changes &amp; delve
          </Button>
        </div>
      )}
      <Button onClick={onTraining} binding={TRAINING_BINDING} testId="training-button">
        <Glyph id="training" size={20} /> Training
      </Button>
      {!active && starts.length > 1 && (
        <div className="flex items-center gap-2" data-testid="start-depths">
          <span className="text-[14px] text-[var(--k-wood-text)]">Start at</span>
          {starts.map((d) => (
            <Chip key={d} pressed={start === d} onClick={() => setStart(d)}>
              {d}
            </Chip>
          ))}
        </div>
      )}
      <Button
        variant="primary"
        size="lg"
        onClick={onDelve}
        disabled={blocked}
        aria-describedby={blocked ? `${id}-draft` : undefined}
        binding={{ key: 'Enter', pad: 'menu' }}
        data-pad-menu
        data-pad-first
        testId="delve-button"
      >
        {active ? `Resume dive · depth ${profile.dive!.depth}` : `Delve ▸ depth ${depth}`}
      </Button>
    </Footer>
  );
}
```

- [ ] **Step 4: The hub**

Create `packages/client/src/features/delve/hub/AnvilHub.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { MANA_TYPES, profileStats } from '@alloy/engine';
import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Glyph, Panel, Screen, Tabs, usePrompts, type Prompt } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';
import { PaperDoll } from '../PaperDoll';
import { BagPanel } from '../BagPanel';
import { ForgePanel } from '../ForgePanel';
import { CodexPanel } from '../CodexPanel';
import { AbilitiesPanel } from '../AbilitiesPanel';
import { ItemDetailSheet } from '../ItemDetailSheet';
import { RARITY_LABEL, RARITY_TEXT, formatNumber, manaStyle } from '../format';
import { HubHeader } from './HubHeader';
import { HubFooter, TRAINING_BINDING } from './HubFooter';
import { HowTo } from './HowTo';
import { SystemMenu } from './SystemMenu';
import type { HubMode, HubTab } from './types';

const TABS: { id: HubTab; label: string }[] = [
  { id: 'loadout', label: 'Loadout' },
  { id: 'skills', label: 'Skills' },
  { id: 'forge', label: 'Forge' },
  { id: 'codex', label: 'Codex' },
  { id: 'quests', label: 'Quests' },
];

/**
 * The Anvil hub: a kit Screen with the steel header (tabs 1–5 or LB/RB), the
 * wood footer (prompts, Training, the start depths, Delve) and the system
 * menu on Esc / B. Phase 1's main area is today's panels in a centred 960 px
 * column; Phase 2 makes each tab its panes, and wires `mode: 'pause'`.
 */
export function AnvilHub({ mode }: { mode: HubMode }) {
  const navigate = useNavigate();
  const profile = useDelveStore((s) => s.profile);
  const newCount = useDelveStore((s) => Object.keys(s.newUids).length);
  const unapplied = Object.keys(useDelveStore(selectDraftApply).changes).length;
  const [tab, setTab] = useState<HubTab>('loadout');
  const [selected, setSelected] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const go = (to: HubTab) => {
    setTab(to);
    playSound('buttonClick');
  };
  const openItem = (uid: string) => {
    playSound('orbSelect');
    useDelveStore.getState().markSeen([uid]);
    setSelected(uid);
  };
  const onTraining = () => navigate('/delve/training');

  // The footer's prompts; the hub also binds Training (its button draws the glyph) and the digits.
  const prompts: Prompt[] = [
    { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
    {
      id: 'menu',
      label: 'Menu',
      binding: { key: 'Escape', pad: 'b' },
      onPress: () => setMenuOpen(true),
      asButton: true,
      padBack: true,
    },
  ];
  usePrompts(
    [
      ...prompts,
      { id: 'training', label: 'Training', binding: TRAINING_BINDING, onPress: onTraining },
      ...TABS.map((t, i) => ({
        id: `tab-${t.id}`,
        label: t.label,
        binding: { key: [`Digit${i + 1}`, `Numpad${i + 1}`] },
        onPress: () => go(t.id),
      })),
    ],
    mainRef,
  );

  const { equipped, pair } = profile;
  const attunement = useMemo(
    () => profileStats(getDelveRegistry(), { equipped, pair }).attunement,
    [equipped, pair],
  );

  return (
    <>
      <Screen
        backdrop="wall"
        headerStyle="band"
        testId={`hub-${mode}`}
        header={
          <HubHeader
            nav={
              <Tabs
                aria-label="The Anvil"
                level="top"
                digits
                glyphs
                value={tab}
                onChange={go}
                tabs={TABS.map((t) => ({
                  ...t,
                  testId: `tab-${t.id}`,
                  badge:
                    t.id === 'loadout' && newCount > 0 ? (
                      <span aria-label={`${newCount} new`}>{newCount}</span>
                    ) : t.id === 'skills' && unapplied > 0 ? (
                      <span
                        aria-label={`${unapplied} unapplied change${unapplied === 1 ? '' : 's'}`}
                        data-testid="draft-count"
                      >
                        {unapplied}
                      </span>
                    ) : undefined,
                }))}
              />
            }
          />
        }
        footer={<HubFooter prompts={prompts} onTraining={onTraining} />}
      >
        <div ref={mainRef} className="h-full overflow-y-auto px-8 py-6">
          {/* Today's panels until Phase 2's panes, at their own size: the column undoes the UI zoom. */}
          <div className="mx-auto flex w-[960px] max-w-full flex-col gap-4 [zoom:calc(1/var(--ui-scale,1))]">
            {tab === 'loadout' && (
              <>
                {profile.stats.dives === 0 && <HowTo />}
                <PaperDoll onSelect={openItem} />
                <button
                  type="button"
                  className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[14px]"
                  onClick={() => go('skills')}
                  data-testid="mana-strip"
                >
                  {MANA_TYPES.filter((m) => attunement[m] > 0).map((m) => {
                    const style = manaStyle(getDelveRegistry(), m);
                    return (
                      <span key={m} className="flex items-center gap-1" title={style.name}>
                        <Glyph id={m} size={16} color={style.color} /> {attunement[m]}
                      </span>
                    );
                  })}
                  <span className="text-[var(--k-text-2)]">· Skills ›</span>
                </button>
                <BagPanel onSelect={openItem} />
              </>
            )}
            {tab === 'skills' && <AbilitiesPanel />}
            {tab === 'forge' && <ForgePanel onSelect={openItem} />}
            {tab === 'codex' && (
              <>
                <CodexPanel />
                {profile.stats.dives > 0 && <Records />}
              </>
            )}
            {tab === 'quests' && (
              <Panel title="Quests" testId="quests-empty" scroll={false}>
                <p className="text-[16px] text-[var(--k-text-2)]">
                  Quests arrive in a later update. The journal and the HUD tracker are ready for
                  them.
                </p>
              </Panel>
            )}
          </div>
        </div>
      </Screen>
      {selected && (
        <ItemDetailSheet
          uid={selected}
          onClose={() => setSelected(null)}
          onBuild={() => {
            setSelected(null);
            setTab('skills');
          }}
        />
      )}
      {menuOpen && <SystemMenu onClose={() => setMenuOpen(false)} />}
    </>
  );
}

/** The lifetime stats, on the Codex until Phase 2's Records. */
function Records() {
  const stats = useDelveStore((s) => s.profile.stats);
  return (
    <div className="delve-panel grid grid-cols-3 gap-2 p-3 text-center text-[14px] text-[var(--k-text-3)]">
      {(
        [
          [stats.dives, 'dives'],
          [formatNumber(stats.kills), 'kills'],
          [stats.bossKills, 'bosses'],
        ] as const
      ).map(([n, label]) => (
        <div key={label}>
          <div className="text-[18px] text-[var(--k-text)]">{n}</div>
          {label}
        </div>
      ))}
      <div className="col-span-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {(['uncommon', 'magic', 'rare', 'epic', 'legendary'] as const).map((r) => (
          <span key={r} style={{ color: RARITY_TEXT[r] }}>
            {stats.itemsFound[r]} {RARITY_LABEL[r]}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `DelveCamp` renders the hub**

In `packages/client/src/pages/DelveCamp.tsx`:

Replace the lines from `import { useEffect, useId, useMemo, useState } from 'react';` up to the end of the file with:

```tsx
import { useEffect } from 'react';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import { useDelveNotices } from '@/features/delve/useDelveNotices';
import { ManaChoice } from '@/features/delve/ManaChoice';
import { AnvilHub } from '@/features/delve/hub/AnvilHub';
import '@/features/delve/delve.css';

/** The Anvil (`/delve`): the hub, and on a new save the mana choice over it. */
export function DelveCamp() {
  const phase = useDelveStore((s) => s.profile.dive?.phase);
  const choosing = useDelveStore((s) => s.profile.pair.primary === null);
  useDelveNotices();

  // A finished dive's summary was shown on the run screen — clear it here.
  useEffect(() => {
    if (phase === 'dead' || phase === 'extracted') useDelveStore.getState().closeDive();
  }, [phase]);

  return (
    <div className="delve-page delve-ui" data-testid="delve-camp">
      {/* Until the mana is chosen, nothing behind the choice takes focus or clicks. */}
      <div className="relative min-h-0 flex-1" inert={choosing}>
        <AnvilHub mode="anvil" />
      </div>
      {choosing && <ManaChoice />}
      <ToastContainer />
    </div>
  );
}
```

- [ ] **Step 6: Run them to see them pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/AnvilHub.test.tsx src/pages/__tests__/DelveCamp.test.tsx)`
Expected: PASS (6 and 12 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 22 tests pass in F + 6 files** (AnvilHub adds 6; DelveCamp's file loses the 2 that moved to `SystemMenu.test.tsx`).

Run: `(cd packages/client && npx tsc -b && npx vite build)`
Expected: `✓ built in …` (the usual chunk-size warning only).

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/alloy-ui-p1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/types.ts src/features/delve/hub/HubHeader.tsx src/features/delve/hub/HubFooter.tsx src/features/delve/hub/AnvilHub.tsx src/features/delve/hub/__tests__/AnvilHub.test.tsx src/pages/DelveCamp.tsx src/pages/__tests__/DelveCamp.test.tsx)
git add packages/client/src/features/delve/hub/types.ts packages/client/src/features/delve/hub/HubHeader.tsx packages/client/src/features/delve/hub/HubFooter.tsx packages/client/src/features/delve/hub/AnvilHub.tsx packages/client/src/features/delve/hub/__tests__/AnvilHub.test.tsx packages/client/src/pages/DelveCamp.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git commit -m "feat(client): the Anvil as one kit screen: header, five tabs, footer, system menu" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The E2E, the version and the verification

### Task 8: The Delve E2E on the hub

The spec's "E2E in Phase 1": the phones skip the Delve; `tab-bag` and `tab-abilities` become `tab-loadout` and `tab-skills`; G03 steps the five tabs; D01, R04 and D04 read the glyph purse and the Skills strip. G06 and G07 walk to the Primary from the header's Skills tab (`padToPrimary`).

**Files:**
- Modify: `packages/client/playwright.config.ts`
- Modify: `packages/client/e2e/delve.spec.ts`
- Modify: `packages/client/e2e/delve-runes.spec.ts`
- Modify: `packages/client/e2e/delve-gamepad.spec.ts`

- [ ] **Step 1: The dev server on 5297, and the scratch config**

5288 belongs to other sessions; 1D uses **5297**. PowerShell (it stops whatever owns 5297, starts a detached Vite from this worktree's client, waits for a 200 and prints `True`):

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5297 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\alloy-ui-p1\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5297 --strictPort --force --host'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5297').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

Create `packages/client/playwright.scratch.config.ts` (never commit it; delete it in Task 9):

```ts
import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  globalSetup: undefined,
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://localhost:5297' },
  webServer: { command: 'echo reuse', url: 'http://localhost:5297', reuseExistingServer: true },
  projects: (base.projects ?? []).filter((p) => p.name !== 'responsive'),
});
```

- [ ] **Step 2: Run the Delve specs to see them fail**

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts --project=desktop e2e/delve.spec.ts e2e/delve-runes.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`
Expected: FAIL, 9 failed and 15 passed of the 24. Add `--timeout=20000` to cut the missing-id waits short. The failures read the old ids and texts:
- `delve.spec.ts`: D04 (`links-count` reads "1 Link", not "🔗 1 Link") and D08 (no `tab-abilities`). D01 still passes: its old assertion is a `not`, which the glyph purse meets.
- `delve-runes.spec.ts`: R01, R05 and R06 (no `tab-abilities`), and R04 (`scrap-count` reads "0 scrap").
- `delve-gamepad.spec.ts`: G03, G06 and G07 (no `tab-bag`).
- `delve-training.spec.ts`: both pass.

- [ ] **Step 3: The edits**

In `packages/client/playwright.config.ts`:

Replace:

```ts
      name: 'iphone-se',
      testIgnore: ['responsive/**'],
```

with:

```ts
      name: 'iphone-se',
      // The Delve is PC-only (Delve UI v1): the desktop project runs its specs.
      testIgnore: ['responsive/**', 'delve*.spec.ts'],
```

Replace:

```ts
      name: 'iphone-15-pro',
      testIgnore: ['responsive/**'],
```

with:

```ts
      name: 'iphone-15-pro',
      testIgnore: ['responsive/**', 'delve*.spec.ts'],
```

Replace:

```ts
      name: 'pixel-7',
      testIgnore: ['responsive/**'],
```

with:

```ts
      name: 'pixel-7',
      testIgnore: ['responsive/**', 'delve*.spec.ts'],
```

In `packages/client/e2e/delve.spec.ts`:

Replace:

```ts
    await expect(page.getByTestId('scrap-count')).not.toHaveText('⚙ 0 scrap');
```

with:

```ts
    await expect(page.getByTestId('scrap-count')).toHaveText(/[1-9][\d,]* scrap/);
```

Replace:

```ts
    await expect(page.getByTestId('links-count')).toHaveText('🔗 1 Link');
    await expect(page.getByTestId('mana-strip')).toContainText('Abilities');
```

with:

```ts
    await expect(page.getByTestId('links-count')).toHaveText('1 Link');
    await expect(page.getByTestId('mana-strip')).toContainText('Skills');
```

Replace:

```ts
    await page.getByTestId('tab-abilities').click();
```

with:

```ts
    await page.getByTestId('tab-skills').click();
```

In `packages/client/e2e/delve-runes.spec.ts`:

Replace:

```ts
    await page.getByTestId('tab-abilities').click();
    const cards = page.getByTestId('chain-cards');
```

with:

```ts
    await page.getByTestId('tab-skills').click();
    const cards = page.getByTestId('chain-cards');
```

Replace:

```ts
    await expect(page.getByTestId('scrap-count')).toHaveText('⚙ 0 scrap');
```

with:

```ts
    await expect(page.getByTestId('scrap-count')).toHaveText('0 scrap');
```

Replace:

```ts
    await page.getByTestId('tab-abilities').click();

    // The move's readout: its loaded cost, the runes' share of it, and what attunement takes off.
```

with:

```ts
    await page.getByTestId('tab-skills').click();

    // The move's readout: its loaded cost, the runes' share of it, and what attunement takes off.
```

Replace:

```ts
    await page.getByTestId('tab-abilities').click();
    await page.getByTestId('chain-skill-ultimate').click();
```

with:

```ts
    await page.getByTestId('tab-skills').click();
    await page.getByTestId('chain-skill-ultimate').click();
```

In `packages/client/e2e/delve-gamepad.spec.ts`:

Replace:

```ts
test.describe('Delve with a controller', () => {
```

with:

```ts
/**
 * From the Skills tab in the hub's header, down by D-pad into the chain builder's skill row,
 * then along it to the Primary (where the row meets the tab depends on the header's layout).
 */
async function padToPrimary(page: Page): Promise<void> {
  const row = ['basic', 'primary', 'defensive', 'ultimate'].map((s) => `chain-skill-${s}`);
  const at = async () =>
    row.indexOf(
      await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? ''),
    );
  for (let i = 0; i < 4 && (await at()) < 0; i++) await tap(page, BUTTON.down);
  for (let i = 0; i < 3 && (await at()) >= 0 && (await at()) !== 1; i++) {
    await tap(page, (await at()) < 1 ? BUTTON.right : BUTTON.left);
  }
  await expect(page.getByTestId('chain-skill-primary')).toBeFocused();
}

test.describe('Delve with a controller', () => {
```

Replace:

```ts
    await expect(page.getByTestId('tab-bag')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-abilities')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.down);
    await expect(page.getByTestId('chain-skill-primary')).toBeFocused();
    await tap(page, BUTTON.left);
```

with:

```ts
    await expect(page.getByTestId('tab-loadout')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-skills')).toHaveAttribute('aria-selected', 'true');
    await padToPrimary(page);
    await tap(page, BUTTON.left);
```

Replace:

```ts
    await expect(page.getByTestId('tab-bag')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-abilities')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.down);
    await expect(page.getByTestId('chain-skill-primary')).toBeFocused();
    const focused = () =>
```

with:

```ts
    await expect(page.getByTestId('tab-loadout')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-skills')).toHaveAttribute('aria-selected', 'true');
    await padToPrimary(page);
    const focused = () =>
```

Replace:

```ts
  test('G03: RB and LB step through the Anvil tabs', async ({ page }) => {
    await setup(page, true);
    await page.goto('/delve');
    await expect(page.getByTestId('tab-bag')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-abilities')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.lb);
    await expect(page.getByTestId('tab-bag')).toHaveAttribute('aria-selected', 'true');
```

with:

```ts
  test('G03: RB and LB step through the five Anvil tabs, wrapping round', async ({ page }) => {
    await setup(page, true);
    await page.goto('/delve');
    await expect(page.getByTestId('tab-loadout')).toHaveAttribute('aria-selected', 'true');
    for (const tab of ['skills', 'forge', 'codex', 'quests', 'loadout']) {
      await tap(page, BUTTON.rb);
      await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
    }
    await tap(page, BUTTON.lb);
    await expect(page.getByTestId('tab-quests')).toHaveAttribute('aria-selected', 'true');
```

- [ ] **Step 4: Run the Delve specs to see them pass, and the phones skip them**

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts --list | grep -c "delve")`
Expected: `24`, every one `[desktop]` (the phones list none).

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts --project=desktop e2e/delve.spec.ts e2e/delve-runes.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`
Expected: 24 passed (about four minutes).

A timeout under load that passes on a rerun (`-g <test> --repeat-each 2`) is flakiness. A consistent failure is a regression: debug it from the page's state, not by lengthening timeouts. The places to look first, if one fails:
- **G06 / G07 in `padToPrimary`:** print the focused test id after each tap. If "down" from the Skills tab lands in the footer, the interim column's first row isn't below the tab: report it (1B's `pickNext` and 1A's header layout decide it), don't move focus by hand.
- **G03 at the wrap:** if `stepTabs` stops at the ends, the expected tab after the fifth RB is `tab-quests`; ask the controller whether 1B meant to stop wrapping before changing the test.
- **Esc or Enter acting twice:** check which handler ran (a `console.log` in the prompt's `onPress` and in 1B's global rule).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p1
(cd packages/client && npx prettier --write --end-of-line auto playwright.config.ts e2e/delve.spec.ts e2e/delve-runes.spec.ts e2e/delve-gamepad.spec.ts)
git add packages/client/playwright.config.ts packages/client/e2e/delve.spec.ts packages/client/e2e/delve-runes.spec.ts packages/client/e2e/delve-gamepad.spec.ts
git commit -m "test(client): the Delve E2E on the Anvil hub: tab ids, five tabs, glyph purse; desktop only" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: v0.54.0 and the full verification

**Files:**
- Modify: `packages/client/package.json`
- Create (scratchpad, not the repo): `$S/ui-p1-shots/shots.mjs` and its PNGs, where `S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad`

- [ ] **Step 1: The version**

In `packages/client/package.json`:

Replace:

```json
  "version": "0.53.0",
```

with:

```json
  "version": "0.54.0",
```

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/SettingsPanel.test.tsx)`
Expected: PASS (3 tests): Settings reads `v0.54.0` from the same file.

- [ ] **Step 2: The client suite, the typecheck and the build**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run && npx tsc -b && npx vite build)`
Expected: no type errors; N + 22 tests pass in F + 6 files; `✓ built in …`.

Run: `(cd packages/engine && git diff --quiet <merge> -- . && echo "engine untouched")`
Expected: `engine untouched` (Phase 1 changes no engine file, so no number moves).

- [ ] **Step 3: The Delve E2E on the desktop project**

The dev server from Task 8 still runs on 5297 (if not, run Task 8's Step 1 block again).

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts --project=desktop e2e/delve.spec.ts e2e/delve-runes.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`
Expected: 24 passed.

- [ ] **Step 4: The hub at 1920×1080 and 1280×720**

Run: `mkdir -p $S/ui-p1-shots`, then create `$S/ui-p1-shots/shots.mjs` (it loads Playwright from the worktree's client and drives the dev server on 5297; a new save chooses Fire first):

```js
// The Anvil hub at 1920×1080 and 1280×720 (Delve UI v1, Phase 1 · 1D), from the dev server on 5297.
import { createRequire } from 'node:module';

const CLIENT = 'C:/Projects/alloy-ui-p1/packages/client/package.json';
const OUT =
  'C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/ui-p1-shots';
const { chromium } = createRequire(CLIENT)('@playwright/test');

const browser = await chromium.launch();
for (const [w, h] of [
  [1920, 1080],
  [1280, 720],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.addInitScript(() => localStorage.setItem('alloy:muted', 'true'));
  await page.goto('http://localhost:5297/delve');
  // A new save: choose Fire, then the hub.
  await page.getByTestId('mana-choice-fire').click();
  await page.getByTestId('delve-button').waitFor();
  await page.mouse.move(0, 0);
  const ui = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
  );
  const height = async (sel) =>
    Math.round((await page.locator(sel).first().boundingBox())?.height ?? -1);
  const header = await height('[data-testid="hub-anvil"] > header');
  const footer = await height('[data-testid="hub-anvil"] > footer');
  console.log(`${w}x${h} ui ${ui}: header ${header}, footer ${footer}`);
  await page.screenshot({ path: `${OUT}/hub-${w}-loadout.png` });
  await page.getByTestId('tab-skills').click();
  await page.screenshot({ path: `${OUT}/hub-${w}-skills.png` });
  await page.close();
}
await browser.close();
```

Run: `(node C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/ui-p1-shots/shots.mjs)`
Expected: two lines and four PNGs in `$S/ui-p1-shots/`:
- `1920x1080 ui 1: header 72, footer 76` and `1280x720 ui 0.75: header 54, footer 57`: the band and the planks at 72 and 76 design px under the quarter-step scale. (If 1A's `Screen` draws them as elements other than `<header>` and `<footer>`, the script prints -1: read the heights off the PNGs instead.)
- `hub-1920-loadout.png`, `hub-1920-skills.png`, `hub-1280-loadout.png` and `hub-1280-skills.png`.

(The script was run on the scratch copy, against stand-in kit components with no styles, to check that it drives the page; the numbers above are what the merged kit must give.)

Then compare the PNGs (Read them) with the mockup's Anvil · Loadout board (`$S/ui-canvas/project/Anvil-Loadout.dc.html`, or the canvas artifact https://claude.ai/artifact/FYid3YsXypifppvgVe4VzD). What must match: the steel band with its rivets and the cyan mana line; the anvil glyph, "THE ANVIL" in Jersey 10 gold, "Deepest 0 · 0 of 12 legendaries"; the tabs with the 1 / 5 keycaps (LB / RB under the pad), Loadout active in gold with the orange underline; the scrap, Links and Mana Dust glyphs, a divider and Power at the right; the wood planks with Select and Menu prompts at the left; Training with its T keycap, and the hot-metal "DELVE ▸ DEPTH 1" with its Enter keycap at the right; the wall's planks and floor glow behind. What differs by design: the main area is the 960 px interim column (Phase 2 brings the three panes), no "Start at" chips on a new save (no checkpoint), and the 14 px floor for small text (the spec's departures). At 1280×720 everything shrinks to 0.75 with nothing clipped or overlapping, while the interim column keeps today's text size. Report anything else that differs.

- [ ] **Step 5: Clean up, and commit the version**

Stop the dev server (PowerShell: `try { $ids = (Get-NetTCPConnection -LocalPort 5297 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}`), then delete the scratch config: `rm packages/client/playwright.scratch.config.ts`. `git status --short` lists nothing of this area's but `package.json`.

```bash
cd /c/Projects/alloy-ui-p1
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.54.0" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification (the area's end check)

- Client: `npx tsc --noEmit -p .` clean, `npx vitest run` at **N + 22 tests in F + 6 files**, `npx tsc -b && npx vite build` green.
- Engine: untouched (`git diff <merge> -- packages/engine` is empty), so the determinism check is trivially held: no number moves in this phase.
- E2E: the 24 Delve tests pass on `desktop`; the phone projects list none of them.
- The hub's screenshots at 1920×1080 and 1280×720 match the Anvil · Loadout board's header and footer, as Task 9 lists.
- `package.json` reads 0.54.0, and Settings shows `Alloy v0.54.0`.
