# Delve UI v1 · Phase 1 · 1A: Kit Visuals — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The forge kit's look, built before anything mounts it: self-hosted fonts, `kit.css` (tokens, materials, the focus ring, `.delve-zoom` and `.delve-hud-zoom`), every kit component in the contract except the prompt runtime and `useUiScale`, `layer.ts` and `zoom.ts`, the ENDESGA rarity colours with `RARITY_TEXT`, pixel item icons, the legacy `delve.css` classes re-skinned to the forge materials, and a dev-only gallery at `/delve/kit` to hold against the mockups.

**Architecture:** One folder, `packages/client/src/features/delve/kit/`, next to step 1·0's `types.ts`. The components are presentational: props in, callbacks out, no game rules, no store writes. They group by the contract's sections: `glyphs.tsx` (Keycap, PadGlyph, InputGlyph, Glyph, Price, PromptBar, with the pixel art in `glyph-art.ts`), `controls.tsx` (Button, Chip, Tabs, Segmented, Bar), `surfaces.tsx` (Panel, Screen, Header, Footer, Dialog), `Tile.tsx`, `Tooltip.tsx` (Tooltip, TooltipCard) and `PixelSprite.tsx`; `layer.ts` makes the portal root and `zoom.ts` holds the zoom maths. `kit.css` is loaded once, by an `@import` at the top of `delve.css`, which every Delve page already imports. Components import each other from their own files: 1D fills `kit/index.ts`.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5 (read only: `inputDeviceStore`, `uiStore`), plain CSS, Vitest 3 (jsdom, Testing Library), Playwright (the screenshots only).

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md` at `fe9a488`: "The forge kit (Phase 1)" (tokens, materials, focus, the kit contract), "Phase 1: Foundation → 1A", decided items 9, 10, 11, 13, 31, 32 and 33, "Accessibility" and Appendix A. The overview is `00-overview.md` in this folder. Where this file and the spec disagree, the spec wins; report it.

---

## Base

- **Starts from:** step 1·0, commit `96d620b` on branch `ui/p1` ("feat(client): the Delve UI kit's shared types and the ui store's scale fields"). It gives `kit/types.ts` (the contract's types; `PanelProps` extends `Omit<HTMLAttributes<HTMLElement>, 'title'>`), a types-only `kit/index.ts`, and `useUIStore`'s `uiScale` (default 1, AppShell mirrors `--ui-scale` into it in 1B), `hudScale` (the 80–125 % Settings multiplier, default 1) and `arenaViewUnits`. Nothing else needs to merge first: 1A never imports from 1B's `prompts.ts` or 1C's `items/`.
- **Worktree** (the overview's rule; skip it if the controller already made `C:\Projects\alloy-ui-1a`). PowerShell:

```powershell
git -C C:\Projects\Alloy worktree add ..\alloy-ui-1a -b ui/p1-1a ui/p1
$W = 'C:\Projects\alloy-ui-1a'; $R = 'C:\Projects\Alloy'
cmd /c mklink /J "$W\node_modules" "$R\node_modules"
cmd /c mklink /J "$W\packages\engine\node_modules" "$R\packages\engine\node_modules"
New-Item -ItemType Directory -Force "$W\packages\client\node_modules\@alloy" | Out-Null
Get-ChildItem -Force "$R\packages\client\node_modules" | Where-Object Name -ne '@alloy' | ForEach-Object { cmd /c mklink /J "$W\packages\client\node_modules\$($_.Name)" $_.FullName }
cmd /c mklink /J "$W\packages\client\node_modules\@alloy\engine" "$W\packages\engine"
```

  (From Git Bash, `cmd //c mklink /J` mangles the switch; use PowerShell for the links. Remove them with `cmd /c rmdir`, never by deleting through them.)
- **Before Task 1, build the engine once** (its `dist` is git-ignored; this phase never changes it) and take the baseline:

```bash
cd /c/Projects/alloy-ui-1a
(cd packages/engine && pnpm build)
(cd packages/client && npx vitest run)
(cd packages/client && npx tsc --noEmit -p .)
```

  Expected: **881 tests in 99 files**, all passing (measured at `96d620b`); the typecheck prints nothing. This area ends at **925 tests in 109 files**.

## Files

| File | Responsibility |
|---|---|
| `packages/client/public/fonts/jersey-10/Jersey10-Regular.woff2` + `OFL.txt` | Jersey 10 (display, numbers), unmodified, with its licence |
| `packages/client/public/fonts/pixelify-sans/PixelifySans-Variable.woff2` + `OFL.txt` | Pixelify Sans (body), the variable 400–700 file, unmodified (renamed from `PixelifySans[wght].woff2`) |
| `packages/client/public/fonts/silkscreen/Silkscreen-Regular.woff2` + `OFL.txt` | Silkscreen (labels, key glyphs), unmodified |
| `packages/client/src/features/delve/kit/kit.css` (new) | `@font-face`, the tokens on `.delve-ui`, the global rules, the type scale, the materials (`.k-wall`, `.k-plate`, `.k-glass`, `.k-well`, `.k-band`, `.k-planks`, `.k-hot`, `.k-plank`, `.k-go`, `.k-danger`, `.k-socket`, `.k-mana`, `.k-lifeframe`), the one focus ring, `.delve-zoom`, `.delve-hud-zoom`, `#delve-ui-layer`, and each component's classes |
| `packages/client/src/features/delve/kit/zoom.ts` (new) | `hudZoom`, `contextZoom`, `snapScale`, `layerZoom`, `hasZoomedAncestor` |
| `packages/client/src/features/delve/kit/layer.ts` (new) | `uiLayer()`: the `#delve-ui-layer` portal root (`.delve-ui.delve-zoom`) |
| `packages/client/src/features/delve/kit/glyph-art.ts` (new) | `GLYPH_ART`: a pixel grid for every `GlyphId`; `pixelRuns` (grid → rects) |
| `packages/client/src/features/delve/kit/glyphs.tsx` (new) | `Keycap`, `PadGlyph`, `InputGlyph`, `Glyph`, `Price`, `PromptBar` |
| `packages/client/src/features/delve/kit/controls.tsx` (new) | `Button`, `Chip`, `Tabs`, `Segmented`, `Bar`; `blurAfterMouse`, `contrast` |
| `packages/client/src/features/delve/kit/surfaces.tsx` (new) | `Panel`, `Screen`, `Header`, `Footer`, `Dialog` |
| `packages/client/src/features/delve/kit/Tile.tsx` (new) | `Tile`: an item socket with its marks |
| `packages/client/src/features/delve/kit/Tooltip.tsx` (new) | `Tooltip`, `TooltipCard` |
| `packages/client/src/features/delve/kit/PixelSprite.tsx` (new) | `PixelSprite`: an atlas frame as a snapped background |
| `packages/client/src/features/delve/kit/KitGallery.tsx` (new) | dev only: every kit piece on one 1080p board |
| `packages/client/src/features/delve/kit/__tests__/*.test.ts(x)` (new, 9 files) | `zoom`, `kit-css`, `glyphs`, `controls`, `surfaces`, `Tile`, `Tooltip`, `PixelSprite`, `KitGallery` |
| `packages/client/src/features/delve/format.ts` | `RARITY_COLOR` takes the ENDESGA values; `RARITY_TEXT` added |
| `packages/client/src/features/delve/ItemIcon.tsx` | the 12 SVG silhouettes become 10×10 pixel maps (13: the bow gets its own), same props |
| `packages/client/src/features/delve/__tests__/ItemIcon.test.tsx` (new) | every base has a map; fill, outline, ghost, fallback |
| `packages/client/src/features/delve/__tests__/format.test.ts` | the rarity colours |
| `packages/client/src/features/delve/delve.css` | `@import './kit/kit.css'`; the legacy classes re-skinned (`.delve-btn` plank, `-gold` hot metal, `-green` go, `-danger`, `.delve-chip`, `.delve-panel` plate, `.delve-tile` socket, `.delve-sheet` steel, `.delve-hpbar`, `.delve-quality`, `.delve-display`) |
| `packages/client/src/App.tsx` | the dev-only `/delve/kit` route (see Cross-area needs) |

Component tests live in `kit/__tests__/`, as `features/delve/__tests__/` does today (CLAUDE.md's "not `__tests__`" rule is for store tests).

## Cross-area needs

1. **`App.tsx` (no Phase 1 owner).** Task 10 adds one dev-only route, `/delve/kit`, the same way `DEV_LAB` does. The spec's ownership list doesn't name `App.tsx`; the controller may approve it as is or move the route. Nothing else in the plan depends on it.
2. **The arena's drop colours (`arena/palette.ts`, no Phase 1 owner; Phase 3's 3A/3C later).** The spec says "`RARITY_COLOR` takes the ENDESGA values, so every Delve use (tiles, the arena's drop tint, the codex) changes at once", but the arena reads its own `RARITY_HEX` in `arena/palette.ts`, not `RARITY_COLOR`. Without this edit the floor's drops keep the old Tailwind hues. Checked on the scratch copy: tsc clean, `arena-renderer.test.ts` 7/7 (it reads `RARITY_HEX` symbolically). The worker doesn't import `palette.ts`.

   In `packages/client/src/features/delve/arena/palette.ts`:

   Replace:

   ```ts
   import type { ManaType, Rarity, ReactionId } from '@alloy/engine';
   ```

   with:

   ```ts
   import type { ManaType, Rarity, ReactionId } from '@alloy/engine';
   import { RARITY_COLOR } from '../format';
   ```

   Replace:

   ```ts
   export const RARITY_HEX: Record<Rarity, number> = {
     common: 0xb9b9c4,
     uncommon: 0x4ade80,
     magic: 0x60a5fa,
     rare: 0xfcd34d,
     epic: 0xc084fc,
     legendary: 0xfb923c,
   };
   ```

   with:

   ```ts
   /** The rarities' colours as numbers: format.ts's RARITY_COLOR, so the drops match the tiles. */
   export const RARITY_HEX = Object.fromEntries(
     Object.entries(RARITY_COLOR).map(([r, c]) => [r, parseInt(c.slice(1), 16)]),
   ) as Record<Rarity, number>;
   ```

3. **1D fills `kit/index.ts`** with these re-exports (every 1A export the contract names, plus `snapScale`, which the spec's tests name):

   ```ts
   export { Bar, Button, Chip, Segmented, Tabs } from './controls';
   export { Glyph, InputGlyph, Keycap, PadGlyph, Price, PromptBar } from './glyphs';
   export { uiLayer } from './layer';
   export { PixelSprite } from './PixelSprite';
   export { Dialog, Footer, Header, Panel, Screen } from './surfaces';
   export { Tile } from './Tile';
   export { Tooltip, TooltipCard } from './Tooltip';
   export { hasZoomedAncestor, layerZoom, snapScale } from './zoom';
   ```

4. **1B, for the merge (no edit asked of 1A's files):**
   - The kit's focus ring relies on 1B's `index.css` change (`html[data-input='gamepad'] :focus:not(.delve-ui *)`): the classic ring is `!important`, so until it lands a pad-focused kit control draws both rings.
   - `useUiScale()`'s HUD value is the same rule as `zoom.ts`'s `hudZoom(ui, hudSetting)` (`max(0.75, round(ui × hud × 4) / 4)`, the coordinator's decision). 1B may import it after the merge so the rule lives once; 1A uses it in `layerZoom` and `PixelSprite`.
   - `Tabs` binds the digit keys itself (its `digits` prop), only when its list sits in the last `[data-pad-scope]` in the document, and never for an event already `defaultPrevented` or typed into a field. When 1B's `topScope()` lands, 1D may swap `inTopScope` in `controls.tsx` for it (it also checks visibility).

## Where the spec left room

- **Font sources.** The Google Fonts repository (`github.com/google/fonts`, `ofl/jersey10`, `ofl/pixelifysans`, `ofl/silkscreen`) holds TTF files only, no woff2. Each font's `METADATA.pb` there names its upstream repository and commit, and each upstream ships unmodified woff2 builds in `fonts/webfonts/`. Task 2 downloads those, pinned to the commits Google Fonts took (exact URLs in the task), with the upstream `OFL.txt`. Each font sits in its own folder because each has its own `OFL.txt`. Pixelify Sans is the variable file (`wght` 400–700, the weights the mockups use), renamed to drop the brackets; renaming changes no byte.
- **Tokens only on `.delve-ui`**, as the spec says. The re-skinned legacy classes use literal colours, because legacy sheets portal outside any Delve root.
- **`kit.css` loads through `delve.css`.** One `@import` at the top of `delve.css` gives every Delve page (all four import it) the fonts and the kit; no component imports CSS.
- **Thirteen gear bases, not twelve.** `delve.json` has a `bow`, which today's `ItemIcon` draws as the ring. It gets its own map.
- **Item icon outlines are computed.** Each map holds only the item (`#`); every empty pixel beside it (four-neighbour) gets the `#181425` outline, so the maps keep a 1 px margin. A ghost draws the shape in `#5a6988` at 35 % with no outline.
- **Glyph art** is new pixel art on 7×7 grids (9×9 for `training`, 10×10 for `bolt`, the mockups' anvil 20×12, chest 12×10 and padlock 8×10, copied from their SVGs). `#` takes the `color` prop, else the glyph's own default (`scrap #c0cbdc`, `link #2ce8f5`, `dust #e8b796` as on the Loadout board; `up` green, `down` red), else `currentColor`; the elements default to `currentColor`, so callers pass `manaStyle(...).color`.
- **`Segmented`'s swatch rule is computed** (WCAG ratio ≥ 4.5 against `#3a4466`). The spec's "Frost, Shadow and Nature labels get a swatch" assumed palette colours; with today's `arpg.json` element colours the rule swatches **Fire (3.34), Earth (4.18) and Shadow (3.26)** and tints Frost (5.68), Storm (7.11) and Nature (4.88). A selected segment draws its label in hot-metal ink, plus the swatch if the colour has none of its own on steel.
- **`PixelSprite` and `layerZoom` read the zoom from `uiStore`** (`uiScale`, and `hudZoom(uiScale, hudScale)` for the HUD), not from computed styles: jsdom has no layout, and AppShell keeps the store and the CSS variables in step. `PixelSprite` re-renders on either change. A device-pixel-ratio change (dragging the window to another monitor) re-snaps at the next render, not at once.
- **`Tooltip`** places its card from the trigger's `getBoundingClientRect()` divided by the zoom it renders under (the layer's when portalled, the trigger's own when `portal={false}`), 12 design px from the trigger. It doesn't flip at a screen edge (`ponytail`: add a flip when a pane's tooltip first clips). `openWhile` forces it open.
- **`Dialog`** is 640 design px wide by default. It focuses `initialFocus`, else its first control (Back when it has one), and gives the focus back to whatever had it when it opened. It handles no keys itself: Esc and B reach its `data-pad-back` Back through 1B's runtime.
- **`Tile`** speaks its marks in its label ("Ember Fang, upgrade, new, locked, equipped"); the marks themselves are `aria-hidden`. `selected` is `aria-pressed`, absent when not given.
- **`Price`** lists Links, then scrap, then Mana Dust (the contract's "1 Link · 20 scrap"); a currency shows whenever its prop is given, 0 included, so 1D's purse reads `0 scrap` (R04). "Link" is singular only for ±1. `signed` prefixes `+`; a negative is always `−` (U+2212).
- **`InputGlyph`** draws the pad side only when the pad holds the lock and the binding has a pad button; otherwise the keys (and `Ctrl`/`Alt` first), else the mouse gesture. A side the binding lacks draws nothing. Short names: `Del`, `Esc`, `[`, `]`, `Shift`, `Alt`, `Ctrl`; the rest is `controls.ts`'s `keyLabel` (`Digit1` → `1`). Pad labels are `controls.ts`'s `padHint` (`ls` → `L3`, the D-pad as arrows).
- **The focus ring** is the outline plus `filter: drop-shadow(4px 4px 0 #181425)`, not a box-shadow, so it keeps the materials' bevels and glows.
- **The legacy `.delve-tile`** keeps `ItemTile`'s inline background and box-shadow (selection, glow), which no stylesheet can beat without `!important`. The socket's steel insets go on a `::before`, so the tile still reads as a socket. 2A replaces `ItemTile` with the kit `Tile`.

## Conventions

The overview's shared conventions, plus:
- Run every command from the worktree root, `/c/Projects/alloy-ui-1a` (Git Bash). Every command line runs in a subshell, as the 4a plan's do.
- **Prettier:** every commit block formats only the files its task creates or edits, by path, with `--end-of-line auto`. `format.ts`, `ItemIcon.tsx`, `delve.css`, `App.tsx` and `__tests__/format.test.ts` pass `npx prettier --check --end-of-line auto` at `96d620b`. **Never run Prettier on the whole `kit/` folder:** step 1·0's `kit/types.ts` isn't Prettier-clean and isn't 1A's. The code below is already Prettier-formatted (checked on the scratch copy).
- **Line endings:** a fresh worktree checks `format.ts`, `ItemIcon.tsx`, `delve.css`, `App.tsx` and `format.test.ts` out CRLF; the Edit tool keeps them. New files are LF.
- **Checked on a scratch copy.** Every task below was applied to `96d620b`'s client in the session scratchpad (`ui-1a/`, `node_modules` junctioned to the main repo's) and run: each test fails as stated first, then passes; the suite went from 881 tests in 99 files to 925 in 109; the typecheck stayed clean; `vite build` drops the gallery and copies the fonts. The screenshots from that run are `ui-1a/shots/kit-keys.png`, `kit-pad-tooltip.png` and `kit-dialog.png` in the scratchpad.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| The kit's tests | `(cd packages/client && npx vitest run src/features/delve/kit)` |
| One test file | `(cd packages/client && npx vitest run <path from packages/client>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(pnpm -F @alloy/client build)` |

---

## Chunk 1: Colours, fonts, the kit sheet and zoom

### Task 1: ENDESGA rarity colours and `RARITY_TEXT`

**Files:**
- Modify: `packages/client/src/features/delve/format.ts`
- Test: `packages/client/src/features/delve/__tests__/format.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/client/src/features/delve/__tests__/format.test.ts`:

Replace:

```ts
  manaStyle,
  manaStyles,
} from '../format';
```

with:

```ts
  manaStyle,
  manaStyles,
  RARITY_COLOR,
  RARITY_TEXT,
} from '../format';
```

Append at the end of the file:

```ts
describe('rarity colours', () => {
  it('are ENDESGA 32, and as text the same but for epic', () => {
    expect(RARITY_COLOR).toEqual({
      common: '#c0cbdc',
      uncommon: '#63c74d',
      magic: '#0099db',
      rare: '#fee761',
      epic: '#b55088',
      legendary: '#f77622',
    });
    expect(RARITY_TEXT).toEqual({ ...RARITY_COLOR, epic: '#d7a6e8' });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/format.test.ts)`
Expected: FAIL, 1 failed | 5 passed (6): `AssertionError: expected { common: '#b9b9c4', …(5) } to deeply equal { common: '#c0cbdc', …(5) }`.

- [ ] **Step 3: Write the colours**

In `packages/client/src/features/delve/format.ts`:

Replace:

```ts
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b9b9c4',
  uncommon: '#4ade80',
  magic: '#60a5fa',
  rare: '#fcd34d',
  epic: '#c084fc',
  legendary: '#fb923c',
};
```

with:

```ts
/** Each rarity's colour (ENDESGA 32): borders, fills and swatches. */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#c0cbdc',
  uncommon: '#63c74d',
  magic: '#0099db',
  rare: '#fee761',
  epic: '#b55088',
  legendary: '#f77622',
};

/** Each rarity as text: its colour, except epic, whose #b55088 is too dark on steel (2.96:1). */
export const RARITY_TEXT: Record<Rarity, string> = { ...RARITY_COLOR, epic: '#d7a6e8' };
```

- [ ] **Step 4: Run it to see it pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/format.test.ts)`
Expected: PASS, 6 tests.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 882 tests in 99 files, all passing (no test reads the old hues); the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-1a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/format.ts src/features/delve/__tests__/format.test.ts)
git add packages/client/src/features/delve/format.ts packages/client/src/features/delve/__tests__/format.test.ts
git commit -m "feat(client): ENDESGA rarity colours, and RARITY_TEXT with a readable epic" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: The fonts, `kit.css`, `zoom.ts` and `layer.ts`

The base of the kit sheet (fonts, tokens, global rules, type, materials, the focus ring, the zoom classes, the layer); later tasks append their components' classes to it.

**Files:**
- Create: the six font files under `packages/client/public/fonts/`
- Create: `packages/client/src/features/delve/kit/kit.css`, `zoom.ts`, `layer.ts`
- Test: `packages/client/src/features/delve/kit/__tests__/zoom.test.ts`, `kit-css.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/features/delve/kit/__tests__/zoom.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { useUIStore } from '@/stores/uiStore';
import { hasZoomedAncestor, hudZoom, layerZoom, snapScale } from '../zoom';
import { uiLayer } from '../layer';

afterEach(() => {
  document.body.innerHTML = '';
  useUIStore.setState({ uiScale: 1, hudScale: 1 });
});

function nest(...classes: string[]): HTMLElement {
  let parent: HTMLElement = document.body;
  for (const c of classes) {
    const el = document.createElement('div');
    el.className = c;
    parent.appendChild(el);
    parent = el;
  }
  return parent;
}

describe('the kit zoom', () => {
  it('snaps a sprite scale to whole device pixels per sprite pixel', () => {
    expect(snapScale(10, 1, 1)).toBe(10);
    expect(snapScale(10, 1.25, 1)).toBe(10.4); // 12.5 rounds to 13 device px
    expect(snapScale(4, 0.75, 1)).toBe(4); // 3 device px
    expect(snapScale(4, 0.75, 2)).toBeCloseTo(4, 10); // 6 device px
    expect(snapScale(4, 1.5, 1.25)).toBeCloseTo(8 / 1.875, 10); // 7.5 device px rounds to 8
    expect(snapScale(0.1, 1, 1)).toBe(1); // never under one device pixel
  });

  it('steps the HUD zoom by quarters, never under 0.75', () => {
    expect(hudZoom(1, 1)).toBe(1);
    expect(hudZoom(1.5, 1.1)).toBe(1.75); // 1.65 → 1.75
    expect(hudZoom(0.75, 0.8)).toBe(0.75); // 0.6 → the floor
    expect(hudZoom(2, 1.1)).toBe(2.25);
  });

  it('reads the zoom an element sits under from its layer class', () => {
    useUIStore.setState({ uiScale: 1.5, hudScale: 1.1 });
    expect(layerZoom(nest('a', 'b'))).toBe(1);
    expect(layerZoom(nest('delve-ui delve-zoom', 'x'))).toBe(1.5);
    expect(layerZoom(nest('delve-hud-zoom', 'x'))).toBe(1.75);
    expect(layerZoom(nest('delve-zoom'))).toBe(1.5); // the layer itself
  });

  it('finds a zoomed ancestor by class or by a zoom style, never the element itself', () => {
    expect(hasZoomedAncestor(nest('delve-ui', 'host'))).toBe(false);
    expect(hasZoomedAncestor(nest('delve-zoom', 'wrap', 'host'))).toBe(true);
    expect(hasZoomedAncestor(nest('delve-hud-zoom', 'host'))).toBe(true);
    expect(hasZoomedAncestor(nest('delve-zoom'))).toBe(false);
    const styled = nest('wrap', 'host');
    styled.parentElement!.style.zoom = '1.5';
    expect(hasZoomedAncestor(styled)).toBe(true);
  });

  it('makes the portal layer once, zoomed with the kit look', () => {
    const layer = uiLayer();
    expect(layer.id).toBe('delve-ui-layer');
    expect(layer).toHaveClass('delve-ui', 'delve-zoom');
    expect(layer.parentElement).toBe(document.body);
    expect(uiLayer()).toBe(layer);
    expect(document.querySelectorAll('#delve-ui-layer')).toHaveLength(1);
  });
});
```

Create `packages/client/src/features/delve/kit/__tests__/kit-css.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../kit.css'), 'utf8');
const pub = resolve(__dirname, '../../../../../public');

/** The body of a top-level rule, e.g. `.delve-btn { … }`. */
function rule(sheet: string, selector: string): string {
  const at = sheet.indexOf(`\n${selector} {`);
  return at < 0 ? '' : sheet.slice(at, sheet.indexOf('}', at));
}

describe('kit.css', () => {
  it('self-hosts its three fonts, each beside its licence', () => {
    const faces = [...css.matchAll(/font-family: '([^']+)';\s+src: url\('([^']+)'\)/g)];
    expect(faces.map((f) => f[1])).toEqual(['Jersey 10', 'Pixelify Sans', 'Silkscreen']);
    for (const [, family, url] of faces) {
      const file = resolve(pub, `.${url}`);
      expect(readFileSync(file).subarray(0, 4).toString('latin1'), family).toBe('wOF2');
      expect(readFileSync(resolve(dirname(file), 'OFL.txt'), 'utf8')).toMatch(
        /SIL OPEN FONT LICENSE Version 1\.1/,
      );
    }
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it('keeps the zoom off .delve-ui, on its own two classes', () => {
    expect(rule(css, '.delve-zoom')).toContain('zoom: var(--ui-scale, 1);');
    expect(rule(css, '.delve-hud-zoom')).toContain('zoom: var(--hud-scale, 1);');
    for (const [, body] of css.matchAll(/\n\.delve-ui \{([^}]*)\}/g)) {
      expect(body).not.toMatch(/zoom/);
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit)`
Expected: FAIL, 2 files, no tests: `Error: Failed to resolve import "../zoom" from "src/features/delve/kit/__tests__/zoom.test.ts". Does the file exist?` and `Error: ENOENT: no such file or directory, open '…\packages\client\src\features\delve\kit\kit.css'`.

- [ ] **Step 3: Download the fonts**

Unmodified woff2 builds from each font's own repository, at the commit the Google Fonts repository's `METADATA.pb` names (`github.com/google/fonts`, `ofl/<font>/METADATA.pb` → `source { repository_url, commit }`), with that repository's `OFL.txt`:

```bash
cd /c/Projects/alloy-ui-1a/packages/client/public
mkdir -p fonts/jersey-10 fonts/pixelify-sans fonts/silkscreen
J=https://raw.githubusercontent.com/scfried/soft-type-jersey/d8446c4c9c2ba14cf408c295be35213c006e19ff
P=https://raw.githubusercontent.com/eifetx/Pixelify-Sans/39df74aba80df8157546034b878e8be1eb565ced
S=https://raw.githubusercontent.com/googlefonts/silkscreen/206ccf3f5234c281461e63ecc59cbc6b0563472b
curl -sSfL -o fonts/jersey-10/Jersey10-Regular.woff2 "$J/fonts/webfonts/Jersey10-Regular.woff2"
curl -sSfL -o fonts/jersey-10/OFL.txt "$J/OFL.txt"
curl -sSfL -o fonts/pixelify-sans/PixelifySans-Variable.woff2 "$P/fonts/webfonts/PixelifySans%5Bwght%5D.woff2"
curl -sSfL -o fonts/pixelify-sans/OFL.txt "$P/OFL.txt"
curl -sSfL -o fonts/silkscreen/Silkscreen-Regular.woff2 "$S/fonts/webfonts/Silkscreen-Regular.woff2"
curl -sSfL -o fonts/silkscreen/OFL.txt "$S/OFL.txt"
sha256sum fonts/*/*
```

Expected (as downloaded on 2026-10-01; a different hash means the pinned file moved, so stop and report):

```
db9b73d03e2f41e9140072dcbe1df006f92d578613c03cbc719be61bf8dc7e1f *fonts/jersey-10/Jersey10-Regular.woff2
436d5836064cec796c7ddde6fb4faeabdb6f2f17443a24a30d0c38b75d13f922 *fonts/jersey-10/OFL.txt
b66ba46f511a851ab09998b5a5a9fdbb102545a3864cb993095e1745996873a7 *fonts/pixelify-sans/OFL.txt
807d95f498d0ccc257522b02d34ed48efe4e01496ffa345dab3779dd84ad08f5 *fonts/pixelify-sans/PixelifySans-Variable.woff2
86c5e9c9382cdcc5948704fdfe60f2aa164a719746931219a42736ecd9cefbd3 *fonts/silkscreen/OFL.txt
a8509db65e47b89daa545d8c9e0b4ffaf0e153fa19d754ec9d4a3a13878d77a9 *fonts/silkscreen/Silkscreen-Regular.woff2
```

(20,488, 22,984 and 9,048 bytes for the three fonts. The source pages, for the record: `https://github.com/scfried/soft-type-jersey`, `https://github.com/eifetx/Pixelify-Sans`, `https://github.com/googlefonts/silkscreen`.)

- [ ] **Step 4: Write the kit sheet, the zoom maths and the layer**

Create `packages/client/src/features/delve/kit/kit.css`:

```css
/* ══════════════════════════════════════════
   The forge kit: tokens, fonts, materials and the focus ring (Delve UI v1).
   Sizes are design px at 1920×1080; .delve-zoom / .delve-hud-zoom scale them.
   Values from the spec's Appendix A (the mockups' theme CSS).
   ══════════════════════════════════════════ */

/* Self-hosted, unmodified, SIL OFL 1.1: each folder holds its OFL.txt. */
@font-face {
  font-family: 'Jersey 10';
  src: url('/fonts/jersey-10/Jersey10-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: block;
}

@font-face {
  font-family: 'Pixelify Sans';
  src: url('/fonts/pixelify-sans/PixelifySans-Variable.woff2') format('woff2');
  font-weight: 400 700;
  font-style: normal;
  font-display: block;
}

@font-face {
  font-family: 'Silkscreen';
  src: url('/fonts/silkscreen/Silkscreen-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: block;
}

/* ── Tokens ── */

.delve-ui {
  --k-well: #181425;
  --k-steel: #262b44;
  --k-steel-1: #3a4466;
  --k-steel-2: #5a6988;
  --k-steel-3: #8b9bb4;
  --k-text: #ffffff;
  --k-text-2: #c0cbdc;
  --k-text-3: #8b9bb4;
  --k-wood-0: #3e2731;
  --k-wood-1: #733e39;
  --k-wood-hi: #b86f50;
  --k-wood-text: #ead4aa;
  --k-hot: #feae34;
  --k-hot-hi: #fee761;
  --k-hot-lo: #f77622;
  --k-hot-ink: #3e2731;
  --k-mana: #2ce8f5;
  --k-mana-1: #0099db;
  --k-mana-2: #124e89;
  --k-ok: #63c74d;
  --k-bad: #e43b44;
  --k-bad-text: #f6757a;
  --r-common: #c0cbdc;
  --r-uncommon: #63c74d;
  --r-magic: #0099db;
  --r-rare: #fee761;
  --r-epic: #b55088;
  --r-legendary: #f77622;
  --rt-common: #c0cbdc;
  --rt-uncommon: #63c74d;
  --rt-magic: #0099db;
  --rt-rare: #fee761;
  --rt-epic: #d7a6e8;
  --rt-legendary: #f77622;
  --k-font-display: 'Jersey 10', sans-serif;
  --k-font-body: 'Pixelify Sans', sans-serif;
  --k-font-label: 'Silkscreen', monospace;
}

/* ── Global rules ── */

.delve-ui {
  font-family: var(--k-font-body);
  font-size: 18px;
  color: var(--k-text);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.delve-ui,
.delve-ui *,
.delve-ui *::before,
.delve-ui *::after {
  border-radius: 0;
}

.delve-ui svg {
  shape-rendering: crispEdges;
}

/* The zoom lives on these, never on .delve-ui (spec, decided item 31). */
.delve-zoom {
  zoom: var(--ui-scale, 1);
}

.delve-hud-zoom {
  zoom: var(--hud-scale, 1);
}

/* ── Type ── */

.k-disp,
.k-display,
.k-heading,
.k-section {
  font-family: var(--k-font-display);
  font-weight: 400;
  font-size-adjust: 0.56;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-shadow: 2px 2px 0 var(--k-well);
  line-height: 1;
}

.k-display {
  font-size: 64px;
}

.k-heading {
  font-size: 32px;
}

.k-section {
  font-size: 22px;
}

.k-body-2 {
  font-size: 16px;
  color: var(--k-text-2);
}

.k-caption {
  font-size: 14px;
  color: var(--k-text-3);
}

.k-label {
  font-family: var(--k-font-label);
  font-size: 14px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--k-text-3);
}

/* ── Materials ── */

.k-wall {
  background:
    radial-gradient(
      ellipse at 50% 115%,
      rgba(247, 118, 34, 0.2) 0 28%,
      rgba(247, 118, 34, 0.1) 28% 44%,
      transparent 44%
    ),
    repeating-linear-gradient(90deg, rgba(24, 20, 37, 0.35) 0 3px, transparent 3px 190px),
    repeating-linear-gradient(
      0deg,
      #2d1e24 0 52px,
      #22161b 52px 56px,
      #33222a 56px 108px,
      #22161b 108px 112px
    );
}

.k-plate {
  background:
    linear-gradient(#8b9bb4, #8b9bb4) 10px 10px / 4px 4px no-repeat,
    linear-gradient(#8b9bb4, #8b9bb4) calc(100% - 14px) 10px / 4px 4px no-repeat,
    linear-gradient(#8b9bb4, #8b9bb4) 10px calc(100% - 14px) / 4px 4px no-repeat,
    linear-gradient(#8b9bb4, #8b9bb4) calc(100% - 14px) calc(100% - 14px) / 4px 4px no-repeat,
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.025) 0 2px, transparent 2px 6px),
    #262b44;
  border: 6px solid #733e39;
  box-shadow:
    0 0 0 3px #181425,
    inset 0 0 0 2px #3e2731,
    inset 0 3px 0 2px #5a6988,
    6px 6px 0 3px rgba(24, 20, 37, 0.6);
}

.k-glass {
  background:
    linear-gradient(#5a6988, #5a6988) 10px 10px / 4px 4px no-repeat,
    linear-gradient(#5a6988, #5a6988) calc(100% - 14px) 10px / 4px 4px no-repeat,
    linear-gradient(#5a6988, #5a6988) 10px calc(100% - 14px) / 4px 4px no-repeat,
    linear-gradient(#5a6988, #5a6988) calc(100% - 14px) calc(100% - 14px) / 4px 4px no-repeat,
    rgba(38, 43, 68, 0.94);
  border: 4px solid #3a4466;
  box-shadow:
    0 0 0 2px #181425,
    inset 0 2px 0 #5a6988;
}

.k-well {
  background: #181425;
  border: 2px solid #262b44;
  box-shadow: inset 3px 3px 0 rgba(0, 0, 0, 0.45);
}

.k-band {
  position: relative;
  z-index: 1;
  background:
    repeating-linear-gradient(90deg, transparent 0 58px, #8b9bb4 58px 62px, transparent 62px 120px)
      0 8px / 100% 4px no-repeat,
    repeating-linear-gradient(90deg, transparent 0 58px, #181425 58px 62px, transparent 62px 120px)
      0 calc(100% - 12px) / 100% 4px no-repeat,
    #3a4466;
  border-bottom: 4px solid #181425;
  box-shadow:
    inset 0 3px 0 #5a6988,
    0 4px 0 #0099db,
    0 8px 0 rgba(44, 232, 245, 0.28);
}

.k-planks {
  background: repeating-linear-gradient(0deg, #5c3434 0 22px, #4a2a2e 22px 24px), #733e39;
  border-top: 4px solid #181425;
  box-shadow: inset 0 3px 0 #b86f50;
}

.k-hot {
  background: #feae34;
  color: #3e2731;
  border: 3px solid #181425;
  box-shadow:
    inset 0 3px 0 #fee761,
    inset 0 -4px 0 #f77622,
    0 0 0 3px rgba(247, 118, 34, 0.55),
    0 0 0 8px rgba(247, 118, 34, 0.18);
}

.k-plank {
  background: repeating-linear-gradient(0deg, #733e39 0 10px, #6a3934 10px 12px);
  color: #ead4aa;
  border: 3px solid #181425;
  box-shadow:
    inset 0 3px 0 #b86f50,
    inset 0 -3px 0 #3e2731;
}

.k-go {
  background: #63c74d;
  color: #193c3e;
  border: 3px solid #181425;
  box-shadow:
    inset 0 3px 0 #a8e090,
    inset 0 -4px 0 #3e8948;
}

.k-danger {
  background: #3e2731;
  color: #f6757a;
  border: 3px solid #a22633;
}

.k-socket {
  background: #181425;
  border: 3px solid #5a6988;
  box-shadow:
    inset 0 0 0 3px #262b44,
    inset 0 0 0 5px #3a4466,
    3px 3px 0 #181425;
}

.k-mana {
  box-shadow:
    0 0 0 3px #181425,
    0 0 0 6px #0099db,
    0 0 0 10px rgba(44, 232, 245, 0.22),
    0 0 0 14px rgba(44, 232, 245, 0.08);
}

.k-lifeframe {
  box-shadow:
    0 0 0 3px #181425,
    0 0 0 6px #5a6988,
    0 0 0 9px #181425;
}

/* ── Focus: one ring, for keys (focus-visible) and the pad (any focus), never a mouse click ── */

.delve-ui :focus-visible,
html[data-input='gamepad'] .delve-ui :focus {
  outline: 3px solid #fee761;
  outline-offset: 3px;
  filter: drop-shadow(4px 4px 0 #181425);
}

/* ── The portal layer (uiLayer): over the screen, letting clicks through to it ── */

#delve-ui-layer {
  position: fixed;
  inset: 0;
  z-index: 70;
  pointer-events: none;
}
```

Create `packages/client/src/features/delve/kit/zoom.ts`:

```ts
import { useUIStore } from '@/stores/uiStore';
import type { ScaleContext } from './types';

/** The classes that carry a zoom: the hub, dialogs and tooltips (`--ui-scale`), and the HUD (`--hud-scale`). */
const ZOOMED = '.delve-zoom, .delve-hud-zoom';

/** The HUD's zoom: the UI scale times Settings → HUD scale, in quarter steps, never under 0.75 (spec, decided item 1). */
export function hudZoom(ui: number, hudSetting: number): number {
  return Math.max(0.75, Math.round(ui * hudSetting * 4) / 4);
}

/** The zoom a context sits under now, from the ui store (AppShell mirrors `--ui-scale` into it). */
export function contextZoom(context: ScaleContext): number {
  const { uiScale, hudScale } = useUIStore.getState();
  return context === 'hud' ? hudZoom(uiScale, hudScale) : uiScale;
}

/**
 * A sprite scale snapped to whole device pixels per sprite pixel under zoom `z` at
 * `dpr`: round(scale × z × dpr) / (z × dpr), at least one device pixel.
 */
export function snapScale(scale: number, z: number, dpr: number): number {
  return Math.max(1, Math.round(scale * z * dpr)) / (z * dpr);
}

/** The zoom an element sits under, from the class it sits under (itself included); 1 when none. */
export function layerZoom(el: Element): number {
  const layer = el.closest(ZOOMED);
  if (!layer) return 1;
  return contextZoom(layer.classList.contains('delve-hud-zoom') ? 'hud' : 'ui');
}

/** True when any ancestor of `el` is zoomed: the Pixi canvas host must never be (spec, decided item 31). */
export function hasZoomedAncestor(el: Element): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.matches(ZOOMED)) return true;
    const z = p.style.zoom || getComputedStyle(p).zoom;
    if (z && z !== 'normal' && parseFloat(z) !== 1) return true;
  }
  return false;
}
```

Create `packages/client/src/features/delve/kit/layer.ts`:

```ts
const LAYER_ID = 'delve-ui-layer';

/** The portal root for dialogs and portalled tooltips: #delve-ui-layer (.delve-ui.delve-zoom), made on first call. */
export function uiLayer(): HTMLElement {
  const found = document.getElementById(LAYER_ID);
  if (found) return found;
  const layer = document.createElement('div');
  layer.id = LAYER_ID;
  layer.className = 'delve-ui delve-zoom';
  document.body.appendChild(layer);
  return layer;
}
```

- [ ] **Step 5: Run them to see them pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/kit)`
Expected: PASS, 7 tests in 2 files.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 889 tests in 101 files, all passing; the typecheck prints nothing.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-ui-1a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/kit/kit.css src/features/delve/kit/zoom.ts src/features/delve/kit/layer.ts src/features/delve/kit/__tests__/zoom.test.ts src/features/delve/kit/__tests__/kit-css.test.ts)
git add packages/client/public/fonts packages/client/src/features/delve/kit/kit.css packages/client/src/features/delve/kit/zoom.ts packages/client/src/features/delve/kit/layer.ts packages/client/src/features/delve/kit/__tests__/zoom.test.ts packages/client/src/features/delve/kit/__tests__/kit-css.test.ts
git commit -m "feat(client): the forge kit's fonts, tokens, materials, focus ring and zoom" -m "Self-hosts Jersey 10, Pixelify Sans and Silkscreen (SIL OFL 1.1, unmodified woff2 with their OFL.txt). kit.css carries the tokens on .delve-ui, the materials and the one focus ring; .delve-zoom and .delve-hud-zoom carry the zoom; zoom.ts snaps sprite scales and finds a zoomed ancestor; layer.ts makes the portal root." -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Git may warn that `pixelify-sans/OFL.txt`'s CRLF becomes LF in the index; that is `core.autocrlf` and harmless. The woff2 files are binary and stored as they are.)

## Chunk 2: The glyphs

### Task 3: The glyphs

Keycaps, pad glyphs, the glyph for whichever device holds the lock, the pixel glyphs, prices and the prompt bar.

**Files:**
- Create: `packages/client/src/features/delve/kit/glyph-art.ts`, `glyphs.tsx`
- Modify: `packages/client/src/features/delve/kit/kit.css`
- Test: `packages/client/src/features/delve/kit/__tests__/glyphs.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/kit/__tests__/glyphs.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { GLYPH_ART, pixelRuns } from '../glyph-art';
import { Glyph, InputGlyph, Keycap, PadGlyph, Price, PromptBar } from '../glyphs';
import type { Prompt } from '../types';

afterEach(() => act(() => useInputDeviceStore.getState().setDevice('keyboard')));

describe('the kit glyphs', () => {
  it('draws a keycap at its size', () => {
    render(<Keycap label="Esc" size="sm" />);
    expect(screen.getByText('Esc')).toHaveClass('k-key', 'k-glyph-sm');
  });

  it('colours the face buttons and marks a hold', () => {
    const { rerender } = render(<PadGlyph button="b" />);
    expect(screen.getByRole('img', { name: 'B' }).firstElementChild).toHaveStyle({
      background: '#e43b44',
    });
    rerender(<PadGlyph button="lt" hold />);
    const hold = screen.getByRole('img', { name: 'Hold LT' });
    expect(hold.firstElementChild).toHaveStyle({ background: '#c0cbdc' });
    expect(hold).toHaveTextContent('LThold');
  });

  it('draws the side of a binding for the device that holds the input lock', () => {
    const binding = { key: ['Delete', 'Backspace'], pad: 'x' as const };
    render(<InputGlyph binding={binding} />);
    expect(screen.getByText('Del').tagName).toBe('KBD');
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    expect(screen.getByRole('img', { name: 'X' })).toBeInTheDocument();
    expect(screen.queryByText('Del')).toBeNull();
    act(() => useInputDeviceStore.getState().setDevice('touch'));
    expect(screen.getByText('Del')).toBeInTheDocument();
  });

  it('draws modifiers and mouse gestures as keycaps, and nothing for a side the binding lacks', () => {
    const { container, rerender } = render(<InputGlyph binding={{ key: 'Enter', ctrl: true }} />);
    expect([...container.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual([
      'Ctrl',
      'Enter',
    ]);
    rerender(<InputGlyph binding={{ mouse: 'rmb', pad: 'a' }} />);
    expect(screen.getByText('RMB')).toBeInTheDocument();
    rerender(<InputGlyph binding={{ pad: 'view' }} />);
    expect(container.querySelectorAll('kbd, [role="img"]')).toHaveLength(0);
  });

  it('draws every glyph from a rectangular grid, in its own colour or the one given', () => {
    for (const [id, art] of Object.entries(GLYPH_ART)) {
      const widths = new Set(art.rows.map((r) => r.length));
      expect(widths.size, id).toBe(1);
      for (const ch of art.rows.join('').replace(/[.#]/g, '')) {
        expect(art.palette?.[ch], `${id} ${ch}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    const { container, rerender } = render(<Glyph id="scrap" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelectorAll('rect')).toHaveLength(pixelRuns(GLYPH_ART.scrap.rows).length);
    expect(svg.querySelector('rect')).toHaveAttribute('fill', '#c0cbdc');
    rerender(<Glyph id="fire" color="#ff6a2b" size={21} title="Fire" />);
    const fire = screen.getByRole('img', { name: 'Fire' });
    expect(fire).toHaveAttribute('width', '21');
    expect(fire.querySelector('rect')).toHaveAttribute('fill', '#ff6a2b');
    rerender(<Glyph id="anvil" size={40} />);
    expect(container.querySelector('svg')).toHaveAttribute('height', '24');
  });

  it('merges a row into runs of one colour', () => {
    expect(pixelRuns(['.##a', '#..#'])).toEqual([
      { x: 1, y: 0, w: 2, ch: '#' },
      { x: 3, y: 0, w: 1, ch: 'a' },
      { x: 0, y: 1, w: 1, ch: '#' },
      { x: 3, y: 1, w: 1, ch: '#' },
    ]);
  });

  it('reads a price the same in text and label', () => {
    const { rerender } = render(<Price links={1} scrap={20} />);
    const price = screen.getByRole('img', { name: '1 Link · 20 scrap' });
    expect(price).toHaveTextContent('1 Link · 20 scrap');
    rerender(<Price scrap={2412} links={5} dust={40} />);
    expect(screen.getByRole('img')).toHaveTextContent('5 Links · 2,412 scrap · 40 Mana Dust');
    rerender(<Price scrap={0} />);
    expect(screen.getByRole('img', { name: '0 scrap' })).toHaveTextContent('0 scrap');
    rerender(<Price scrap={38} links={-1} signed />);
    expect(screen.getByRole('img', { name: '−1 Link · +38 scrap' })).toBeInTheDocument();
  });

  it('draws prompts, and a prompt drawn as a button clicks but stays out of the pad nav', () => {
    const onPress = vi.fn();
    const prompts: Prompt[] = [
      { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
      {
        id: 'menu',
        label: 'Menu',
        binding: { key: 'Escape', pad: 'b' },
        onPress,
        asButton: true,
        padBack: true,
      },
      { id: 'salvage', label: 'Salvage', binding: { key: 'Delete', pad: 'x' }, disabled: true },
    ];
    render(<PromptBar prompts={prompts} />);
    expect(screen.getByText('Select')).toHaveTextContent('ClickSelect');
    expect(screen.getByText('Salvage')).toHaveAttribute('aria-disabled', 'true');
    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(menu).toHaveAttribute('data-pad-skip');
    expect(menu).toHaveAttribute('data-pad-back');
    expect(menu).toHaveAttribute('tabindex', '-1');
    fireEvent.click(menu);
    expect(onPress).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/glyphs.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../glyph-art" from "src/features/delve/kit/__tests__/glyphs.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the art, the glyphs and their classes**

Create `packages/client/src/features/delve/kit/glyph-art.ts`:

```ts
import type { GlyphId } from './types';

/**
 * The kit's pixel glyphs as ASCII grids, one character a pixel: `.` is empty, `#` takes the
 * glyph's colour (the `color` prop, else `color` here, else `currentColor`), and any other
 * character is a fixed colour from `palette`.
 */
export interface GlyphArt {
  rows: string[];
  color?: string;
  palette?: Record<string, string>;
}

export const GLYPH_ART: Record<GlyphId, GlyphArt> = {
  // ── currencies and items ──
  scrap: {
    color: '#c0cbdc',
    rows: ['..###..', '.#####.', '###.###', '##...##', '###.###', '.#####.', '..###..'],
  },
  link: {
    color: '#2ce8f5',
    rows: ['.###...', '#...#..', '#..###.', '#.#.#.#', '.###..#', '..#...#', '...###.'],
  },
  dust: {
    color: '#e8b796',
    rows: ['...#...', '..###..', '...#...', '.#...#.', '.......', '.#.#.#.', '#######'],
  },
  rune: {
    color: '#2ce8f5',
    rows: ['...#...', '..###..', '.##.##.', '##.#.##', '.##.##.', '..###..', '...#...'],
  },
  potion: {
    color: '#e43b44',
    rows: ['..###..', '...#...', '..###..', '.#####.', '#######', '#######', '.#####.'],
  },
  dodge: {
    rows: ['....###', '.......', '.######', '.......', '#######', '.......', '...####'],
  },
  attack: {
    rows: ['.....##', '....###', '...###.', '#.###..', '.###...', '..#....', '##.#...'],
  },
  lock: {
    palette: { c: '#c0cbdc', y: '#fee761', g: '#feae34', d: '#3e2731' },
    rows: [
      '..cccc..',
      '.c....c.',
      '.c....c.',
      '.c....c.',
      'yyyyyyyy',
      'gggggggg',
      'gggddggg',
      'gggddggg',
      'gggggggg',
      'gggggggg',
    ],
  },
  check: {
    color: '#63c74d',
    rows: ['.......', '......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'],
  },
  skull: {
    rows: ['.#####.', '#######', '#..#..#', '#..#..#', '###.###', '.#####.', '.#.#.#.'],
  },
  anvil: {
    palette: {
      o: '#f77622',
      y: '#fee761',
      c: '#c0cbdc',
      g: '#8b9bb4',
      s: '#5a6988',
      d: '#3a4466',
      k: '#181425',
    },
    rows: [
      '........oyyyo.......',
      '....ccccccccccccc...',
      'gggggggggggggggggss.',
      '.gggggggggggggggg...',
      '.ssssssssssssssss...',
      '.......dsddddd......',
      '.......dsddddd......',
      '.......dsddddd......',
      '.....sssssssssss....',
      '....dsssssssssssd...',
      '....ddddddddddddd...',
      '....kkkkkkkkkkkkk...',
    ],
  },
  chest: {
    palette: {
      h: '#e4a672',
      w: '#b86f50',
      d: '#3e2731',
      g: '#feae34',
      y: '#fee761',
      m: '#733e39',
      k: '#181425',
    },
    rows: [
      '............',
      '.hhhhhhhhhh.',
      '.wwwwwwwwww.',
      '.wwwwwwwwww.',
      'dddddggddddd',
      '.mmmmyymmmm.',
      '.mmmmggmmmm.',
      '.mmmmmmmmmm.',
      '.mmmmmmmmmm.',
      '.kkkkkkkkkk.',
    ],
  },
  // ── marks ──
  up: {
    color: '#63c74d',
    rows: ['.......', '...#...', '..###..', '.#####.', '#######', '.......', '.......'],
  },
  down: {
    color: '#e43b44',
    rows: ['.......', '.......', '#######', '.#####.', '..###..', '...#...', '.......'],
  },
  new: {
    color: '#fee761',
    rows: ['...#...', '...#...', '.#.#.#.', '..###..', '.#.#.#.', '...#...', '...#...'],
  },
  potential: {
    color: '#2ce8f5',
    rows: ['...#...', '..#.#..', '.#...#.', '#.....#', '.#...#.', '..#.#..', '...#...'],
  },
  // ── menus ──
  controls: {
    rows: ['.......', '.##.##.', '#######', '##.#.##', '#######', '##...##', '#.....#'],
  },
  settings: {
    rows: ['.#.#.#.', '.#####.', '###.###', '.#...#.', '###.###', '.#####.', '.#.#.#.'],
  },
  training: {
    rows: [
      '..#####..',
      '.#.....#.',
      '#..###..#',
      '#.#...#.#',
      '#.#.#.#.#',
      '#.#...#.#',
      '#..###..#',
      '.#.....#.',
      '..#####..',
    ],
  },
  menu: {
    rows: ['.......', '#######', '.......', '#######', '.......', '#######', '.......'],
  },
  journal: {
    rows: ['######.', '#.....#', '#.###.#', '#.....#', '#.###.#', '#.....#', '######.'],
  },
  lab: {
    rows: ['......#', '....#.#', '....#.#', '..#.#.#', '..#.#.#', '#.#.#.#', '#######'],
  },
  door: {
    rows: ['.#####.', '##...##', '#.....#', '#.....#', '#...#.#', '#.....#', '#.....#'],
  },
  extract: {
    rows: ['...#...', '..###..', '.#.#.#.', '...#...', '#.....#', '#.....#', '#######'],
  },
  // ── buffs ──
  riposte: {
    rows: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '##...##'],
  },
  quick: {
    rows: ['.......', '#..#...', '.#..#..', '..#..#.', '.#..#..', '#..#...', '.......'],
  },
  barrier: {
    color: '#ead4aa',
    rows: ['#######', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
  },
  galvanize: {
    color: '#fee761',
    rows: ['....#..', '...##..', '..##...', '.#####.', '...##..', '..##...', '..#....'],
  },
  // ── elements (callers pass the element's colour) ──
  fire: {
    rows: ['...#...', '..##...', '..###.#', '.#####.', '##.####', '##..###', '.#####.'],
  },
  frost: {
    rows: ['...#...', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '...#...'],
  },
  storm: {
    rows: ['...###.', '..###..', '.###...', '######.', '...###.', '..###..', '.##....'],
  },
  earth: {
    rows: ['.......', '...#...', '..###..', '..####.', '.######', '#######', '#######'],
  },
  shadow: {
    rows: ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
  },
  nature: {
    rows: ['....###', '..#####', '.####.#', '.###.##', '.#.####', '#.####.', '#......'],
  },
  // ── forms ──
  bolt: {
    rows: [
      '..........',
      '.....####.',
      '......###.',
      '......###.',
      '.....#..#.',
      '....#.....',
      '...#......',
      '..#.......',
      '.#........',
      '..........',
    ],
  },
  volley: {
    rows: ['.#.#.#.', '#######', '.#.#.#.', '.#.#.#.', '.#.#.#.', '.#.#.#.', '.......'],
  },
  lance: {
    rows: ['.....##', '....###', '...##..', '..##...', '.##....', '##.....', '#......'],
  },
  burst: {
    rows: ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#'],
  },
  strike: {
    rows: ['....#.#', '...#.#.', '..#.#.#', '.#.#.#.', '#.#.#..', '.#.#...', '#.#....'],
  },
  ward: {
    rows: ['..###..', '.#...#.', '#.....#', '#..#..#', '#.....#', '.#...#.', '..###..'],
  },
  armor: {
    rows: ['##...##', '#######', '.#####.', '.##.##.', '.#####.', '.##.##.', '.#####.'],
  },
  surge: {
    rows: ['.......', '.##....', '#..#..#', '....##.', '.##....', '#..#..#', '....##.'],
  },
  blink: {
    rows: ['.......', '....#..', '.....#.', '#.#.###', '.....#.', '....#..', '.......'],
  },
  nova: {
    rows: ['#..#..#', '.#####.', '.#...#.', '##...##', '.#...#.', '.#####.', '#..#..#'],
  },
  barrage: {
    rows: ['#...#..', '.#...#.', '..#...#', '#...#..', '.#...#.', '..#...#', '.......'],
  },
  maelstrom: {
    rows: ['.#####.', '#.....#', '#.###.#', '#.#.#.#', '#.#..#.', '#..##..', '.##....'],
  },
};

/** A grid as runs of pixels: one run per same-character stretch of a row, empty (`.`) skipped. */
export function pixelRuns(rows: string[]): { x: number; y: number; w: number; ch: string }[] {
  const runs: { x: number; y: number; w: number; ch: string }[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const ch = row[x];
      let w = 1;
      while (row[x + w] === ch) w++;
      if (ch !== '.') runs.push({ x, y, w, ch });
      x += w;
    }
  });
  return runs;
}
```

Create `packages/client/src/features/delve/kit/glyphs.tsx`:

```tsx
import type { ReactElement } from 'react';
import { keyLabel, padHint } from '@/features/controls/controls';
import type { PadButton } from '@/features/gamepad/gamepad';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { GLYPH_ART, pixelRuns } from './glyph-art';
import type { Binding, GlyphId, Prompt } from './types';

type GlyphSize = 'sm' | 'md';

/** A keyboard key or mouse button as a keycap: sm 28 px tall (14 px text), md 32 px (16 px). */
export function Keycap({ label, size = 'md' }: { label: string; size?: GlyphSize }): ReactElement {
  return <kbd className={`k-key k-glyph-${size}`}>{label}</kbd>;
}

const PAD_COLOR: Partial<Record<PadButton, string>> = {
  a: '#63c74d',
  b: '#e43b44',
  x: '#0099db',
  y: '#fee761',
};

/** An octagonal pad glyph: A green, B red, X blue, Y yellow, the rest light steel; ink #181425. */
export function PadGlyph({
  button,
  hold = false,
  size = 'md',
}: {
  button: PadButton;
  hold?: boolean;
  size?: GlyphSize;
}): ReactElement {
  const label = padHint(button);
  return (
    <span className="k-glyph-row" role="img" aria-label={hold ? `Hold ${label}` : label}>
      <span
        aria-hidden
        className={`k-pad k-glyph-${size}`}
        style={{ background: PAD_COLOR[button] ?? '#c0cbdc' }}
      >
        {label}
      </span>
      {hold && (
        <span aria-hidden className="k-hold">
          hold
        </span>
      )}
    </span>
  );
}

/** Short names for the keys the Delve's prompts use; everything else is controls.ts's `keyLabel`. */
const KEY_SHORT: Record<string, string> = {
  Delete: 'Del',
  Escape: 'Esc',
  BracketLeft: '[',
  BracketRight: ']',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
};

const MOUSE_LABEL: Record<NonNullable<Binding['mouse']>, string> = {
  click: 'Click',
  rmb: 'RMB',
  lmb: 'LMB',
  drag: 'Drag',
  hover: 'Hover',
};

/** The keycaps or the pad glyph for the device that holds the input lock ('touch' draws the mouse and key side). */
export function InputGlyph({
  binding,
  size = 'md',
}: {
  binding: Binding;
  size?: GlyphSize;
}): ReactElement {
  const device = useInputDeviceStore((s) => s.device);
  if (device === 'gamepad' && binding.pad) {
    return <PadGlyph button={binding.pad} hold={binding.padHold !== undefined} size={size} />;
  }
  const key = Array.isArray(binding.key) ? binding.key[0] : binding.key;
  const caps = [
    binding.ctrl && 'Ctrl',
    binding.alt && 'Alt',
    key && (KEY_SHORT[key] ?? keyLabel(key)),
    !key && binding.mouse && MOUSE_LABEL[binding.mouse],
  ].filter((c): c is string => Boolean(c));
  return (
    <span className="k-glyph-row">
      {caps.map((c, i) => (
        <Keycap key={i} label={c} size={size} />
      ))}
    </span>
  );
}

/** A pixel glyph drawn as crisp SVG rects (the Delve's chrome uses these, not emoji). */
export function Glyph({
  id,
  size = 16,
  color,
  title,
}: {
  id: GlyphId;
  size?: number;
  color?: string;
  title?: string;
}): ReactElement {
  const art = GLYPH_ART[id];
  const w = art.rows[0].length;
  const h = art.rows.length;
  const fill = color ?? art.color ?? 'currentColor';
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-glyph={id}
      style={{ display: 'inline-block', flex: 'none' }}
    >
      {pixelRuns(art.rows).map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={1}
          fill={r.ch === '#' ? fill : art.palette?.[r.ch]}
        />
      ))}
    </svg>
  );
}

function amount(n: number, signed: boolean): string {
  const text = Math.abs(n).toLocaleString('en-US');
  if (n < 0) return `−${text}`;
  return signed ? `+${text}` : text;
}

/** A price or a purse amount with its glyphs: "1 Link · 20 scrap". Its text reads the same as its label. */
export function Price({
  scrap,
  links,
  dust,
  signed = false,
}: {
  scrap?: number;
  links?: number;
  dust?: number;
  signed?: boolean;
}): ReactElement {
  const parts: { glyph: GlyphId; n: number; unit: string }[] = [];
  if (links !== undefined)
    parts.push({ glyph: 'link', n: links, unit: Math.abs(links) === 1 ? 'Link' : 'Links' });
  if (scrap !== undefined) parts.push({ glyph: 'scrap', n: scrap, unit: 'scrap' });
  if (dust !== undefined) parts.push({ glyph: 'dust', n: dust, unit: 'Mana Dust' });
  const text = parts.map((p) => `${amount(p.n, signed)} ${p.unit}`).join(' · ');
  return (
    <span className="k-price" role="img" aria-label={text}>
      {parts.map((p, i) => (
        <span key={p.glyph} className="k-price-part">
          {i > 0 && <span className="k-price-unit">{' · '}</span>}
          <Glyph id={p.glyph} size={18} />
          <b>{amount(p.n, signed)}</b> <span className="k-price-unit">{p.unit}</span>
        </span>
      ))}
    </span>
  );
}

/** Prompts in a row: a glyph and a label each. Draws only; the screen binds them with usePrompts. */
export function PromptBar({
  prompts,
  className = '',
}: {
  prompts: Prompt[];
  className?: string;
}): ReactElement {
  return (
    <div className={`k-promptbar ${className}`}>
      {prompts.map((p) =>
        p.asButton ? (
          <button
            key={p.id}
            type="button"
            className="k-prompt k-prompt-btn"
            aria-label={p.label}
            tabIndex={-1}
            data-pad-skip
            data-pad-back={p.padBack ? '' : undefined}
            disabled={p.disabled}
            onClick={p.onPress}
          >
            <InputGlyph binding={p.binding} size="sm" />
            {p.label}
          </button>
        ) : (
          <span key={p.id} className="k-prompt" aria-disabled={p.disabled || undefined}>
            <InputGlyph binding={p.binding} size="sm" />
            {p.label}
          </span>
        ),
      )}
    </div>
  );
}
```

In `packages/client/src/features/delve/kit/kit.css`:

Append at the end of the file:

```css
/* ── Glyphs ── */

.k-glyph-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.k-key,
.k-pad {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  font-family: var(--k-font-label);
  font-weight: 400;
  line-height: 1;
  white-space: nowrap;
}

.k-key {
  background: #3a4466;
  border: 2px solid #8b9bb4;
  border-bottom-width: 4px;
  color: #ffffff;
  box-shadow: inset 0 2px 0 #8b9bb4;
}

.k-pad {
  color: #181425;
  clip-path: polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%);
}

.k-glyph-sm {
  min-width: 28px;
  height: 28px;
  padding: 0 7px;
  font-size: 14px;
}

.k-glyph-md {
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  font-size: 16px;
}

.k-hold {
  font-family: var(--k-font-label);
  font-size: 14px;
  color: var(--k-text-2);
  text-transform: uppercase;
}

.k-price {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.k-price-part {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.k-price-unit {
  color: var(--k-text-3);
}

.k-promptbar {
  display: flex;
  align-items: center;
  gap: 28px;
}

.k-prompt {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  color: var(--k-text-2);
  white-space: nowrap;
}

.k-prompt-btn {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  cursor: pointer;
}

.k-prompt[aria-disabled='true'],
.k-prompt-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/glyphs.test.tsx)`
Expected: PASS, 8 tests.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 897 tests in 102 files, all passing; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-1a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/kit/glyph-art.ts src/features/delve/kit/glyphs.tsx src/features/delve/kit/kit.css src/features/delve/kit/__tests__/glyphs.test.tsx)
git add packages/client/src/features/delve/kit/glyph-art.ts packages/client/src/features/delve/kit/glyphs.tsx packages/client/src/features/delve/kit/kit.css packages/client/src/features/delve/kit/__tests__/glyphs.test.tsx
git commit -m "feat(client): the kit's glyphs: keycaps, pad glyphs, pixel glyphs, prices and prompts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The controls

### Task 4: The controls

Buttons in the materials, chips, tab lists with their digit keys, segments with the contrast rule, and bars.

**Files:**
- Create: `packages/client/src/features/delve/kit/controls.tsx`
- Modify: `packages/client/src/features/delve/kit/kit.css`
- Test: `packages/client/src/features/delve/kit/__tests__/controls.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/kit/__tests__/controls.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { Bar, Button, Chip, contrast, Segmented, Tabs } from '../controls';

afterEach(() => act(() => useInputDeviceStore.getState().setDevice('keyboard')));

const TABS = [
  { id: 'loadout', label: 'Loadout', testId: 'tab-loadout' },
  { id: 'skills', label: 'Skills', badge: 2 },
  { id: 'forge', label: 'Forge', disabled: true },
  { id: 'codex', label: 'Codex' },
] as const;
type Tab = (typeof TABS)[number]['id'];

describe('the kit controls', () => {
  it('draws a button in its material, with its glyph out of its name', () => {
    const onClick = vi.fn();
    render(
      <Button
        variant="primary"
        size="lg"
        binding={{ key: 'Enter', pad: 'menu' }}
        testId="go"
        onClick={onClick}
      >
        Delve
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delve' });
    expect(button).toHaveClass('k-btn', 'k-btn-lg', 'k-hot');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-testid', 'go');
    expect(button).toHaveTextContent('DelveEnter');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('lets go of focus after a mouse click, never after a pen, touch, key or pad', () => {
    render(<Button>Equip</Button>);
    const button = screen.getByRole('button', { name: 'Equip' });
    button.focus();
    fireEvent.pointerUp(button, { pointerType: 'touch' });
    expect(button).toHaveFocus();
    fireEvent.keyUp(button, { key: 'Enter' });
    expect(button).toHaveFocus();
    fireEvent.pointerUp(button, { pointerType: 'mouse' });
    expect(button).not.toHaveFocus();
  });

  it('toggles a chip by aria-pressed', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Chip pressed={false} onClick={onClick} testId="chip-all">
        All
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'All' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledOnce();
    rerender(
      <Chip pressed onClick={onClick} testId="chip-all">
        All
      </Chip>,
    );
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('draws tabs with the selected one marked and a marker per level', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Tabs<Tab>
        tabs={[...TABS]}
        value="skills"
        onChange={onChange}
        level="top"
        aria-label="Anvil"
      />,
    );
    const list = screen.getByRole('tablist', { name: 'Anvil' });
    expect(list).toHaveAttribute('data-pad-tabs', '');
    expect(screen.getByRole('tab', { name: 'Skills 2' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-loadout')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Forge' })).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: 'Codex' }));
    expect(onChange).toHaveBeenCalledWith('codex');
    rerender(
      <Tabs<Tab>
        tabs={[...TABS]}
        value="skills"
        onChange={onChange}
        level="sub"
        aria-label="Skill"
      />,
    );
    expect(screen.getByRole('tablist')).toHaveAttribute('data-pad-tabs', 'sub');
  });

  it('takes the digit keys with `digits`, skipping disabled tabs, typing and lower scopes', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <div data-pad-scope>
        <Tabs<Tab>
          tabs={[...TABS]}
          value="loadout"
          onChange={onChange}
          level="top"
          digits
          aria-label="Anvil"
        />
        <input aria-label="Search" />
      </div>,
    );
    fireEvent.keyDown(window, { code: 'Digit2' });
    expect(onChange).toHaveBeenLastCalledWith('skills');
    fireEvent.keyDown(window, { code: 'Digit3' }); // Forge is disabled
    fireEvent.keyDown(window, { code: 'Digit9' }); // no ninth tab
    fireEvent.keyDown(window, { code: 'Digit4', ctrlKey: true });
    fireEvent.keyDown(screen.getByRole('textbox'), { code: 'Digit4' });
    expect(onChange).toHaveBeenCalledOnce();
    rerender(
      <>
        <div data-pad-scope>
          <Tabs<Tab>
            tabs={[...TABS]}
            value="loadout"
            onChange={onChange}
            level="top"
            digits
            aria-label="Anvil"
          />
        </div>
        <div data-pad-scope>a dialog</div>
      </>,
    );
    fireEvent.keyDown(window, { code: 'Digit4' });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('draws the stepping inputs at both ends for the locked device', () => {
    const { container } = render(
      <Tabs<Tab>
        tabs={[...TABS]}
        value="loadout"
        onChange={() => {}}
        level="top"
        digits
        glyphs
        aria-label="Anvil"
      />,
    );
    expect([...container.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['1', '4']);
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    expect(screen.getByRole('tablist')).toHaveTextContent(/^LB.*RB$/);
  });

  it('tints a segment only with a colour that reads on raised steel, else draws a swatch', () => {
    expect(contrast('#ffffff', '#3a4466')).toBeCloseTo(9.55, 2);
    expect(contrast('#8b9bb4', '#3a4466')).toBeCloseTo(3.39, 2);
    const onChange = vi.fn();
    render(
      <Segmented
        aria-label="Element"
        value="fire"
        onChange={onChange}
        columns={3}
        options={[
          { id: 'fire', label: 'Fire', color: '#ff6a2b' },
          { id: 'storm', label: 'Storm', color: '#f5e049', testId: 'el-storm' },
          { id: 'shadow', label: 'Shadow', color: '#b07cff' },
        ]}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Element' });
    expect(group).toHaveStyle({ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' });
    expect(screen.getByRole('radio', { name: 'Fire' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('el-storm')).toHaveStyle({ color: '#f5e049' });
    const shadow = screen.getByRole('radio', { name: 'Shadow' });
    expect(shadow).not.toHaveAttribute('style');
    expect(shadow.querySelector('.k-swatch')).toHaveStyle({ background: '#b07cff' });
    fireEvent.click(shadow);
    expect(onChange).toHaveBeenCalledWith('shadow');
  });

  it('reports a bar as a progressbar, its extra after the fill', () => {
    const { container } = render(
      <Bar
        kind="life"
        value={226}
        max={289}
        extra={{ value: 34, color: '#ead4aa' }}
        label="226 / 289"
        testId="life"
      />,
    );
    const bar = screen.getByRole('progressbar', { name: 'Life' });
    expect(bar).toHaveAttribute('aria-valuenow', '226');
    expect(bar).toHaveAttribute('aria-valuemax', '289');
    expect(bar).toHaveAttribute('aria-valuetext', '226 / 289');
    expect(bar).toHaveClass('k-lifeframe');
    expect(bar).toHaveStyle({ height: '32px' });
    const fill = container.querySelector<HTMLElement>('.k-bar-fill')!;
    const extra = container.querySelector<HTMLElement>('.k-bar-extra')!;
    expect(parseFloat(fill.style.width)).toBeCloseTo((226 / 289) * 100, 5);
    expect(extra.style.left).toBe(fill.style.width);
    expect(parseFloat(extra.style.width)).toBeCloseTo((34 / 289) * 100, 5);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/controls.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../controls" from "src/features/delve/kit/__tests__/controls.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the controls and their classes**

Create `packages/client/src/features/delve/kit/controls.tsx`:

```tsx
import { useEffect, useRef, type PointerEvent, type ReactElement } from 'react';
import { InputGlyph } from './glyphs';
import type { BarProps, Binding, ButtonProps, ChipProps, SegmentedProps, TabsProps } from './types';

/** Kit controls let go of focus after a mouse click (so Enter and Esc reach the screen), never after a key or pad press. */
export function blurAfterMouse(e: PointerEvent<HTMLElement>): void {
  if (e.pointerType === 'mouse') e.currentTarget.blur();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG 2.1 contrast ratio of two `#rrggbb` colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'k-hot',
  secondary: 'k-plank',
  danger: 'k-danger',
  go: 'k-go',
  quiet: 'k-btn-quiet',
};

/** A kit button: hot metal (primary), a plank (secondary), danger, go or quiet; its binding's glyph at the right end. */
export function Button({
  variant = 'secondary',
  size = 'md',
  binding,
  testId,
  className = '',
  type = 'button',
  children,
  onPointerUp,
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      {...rest}
      type={type}
      className={`k-btn k-btn-${size} ${VARIANT[variant]} ${className}`}
      data-testid={testId}
      onPointerUp={(e) => {
        onPointerUp?.(e);
        blurAfterMouse(e);
      }}
    >
      {children}
      {binding && (
        <span aria-hidden className="k-glyph-row">
          <InputGlyph binding={binding} size={size === 'sm' ? 'sm' : 'md'} />
        </span>
      )}
    </button>
  );
}

/** A toggle chip (`aria-pressed`), as the old AbilitiesPanel Chip. */
export function Chip({
  pressed,
  testId,
  className = '',
  type = 'button',
  children,
  onPointerUp,
  ...rest
}: ChipProps): ReactElement {
  return (
    <button
      {...rest}
      type={type}
      className={`k-chip ${className}`}
      aria-pressed={pressed}
      data-testid={testId}
      onPointerUp={(e) => {
        onPointerUp?.(e);
        blurAfterMouse(e);
      }}
    >
      {children}
    </button>
  );
}

/** True when `el` sits in the topmost `[data-pad-scope]` (the last in the document), or no scope exists. */
function inTopScope(el: Element): boolean {
  const scopes = document.querySelectorAll('[data-pad-scope]');
  const top = scopes[scopes.length - 1];
  return !top || top.contains(el);
}

/**
 * A tab list. 'top' is stepped by LB/RB (and the digit keys 1..n with `digits`), 'sub' by LT/RT;
 * the pad nav finds it by `data-pad-tabs`. Disabled tabs are skipped. `glyphs` draws the
 * stepping inputs at both ends.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  level,
  digits = false,
  glyphs = false,
  size = 'lg',
  'aria-label': ariaLabel,
}: TabsProps<T>): ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!digits) return;
    const onKey = (e: KeyboardEvent) => {
      const digit = /^Digit([1-9])$/.exec(e.code);
      const list = ref.current;
      if (!digit || !list || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!inTopScope(list)) return;
      const tab = tabs[Number(digit[1]) - 1];
      if (!tab || tab.disabled) return;
      e.preventDefault();
      onChange(tab.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [digits, tabs, onChange]);

  const ends: [Binding, Binding] =
    level === 'top'
      ? [
          { key: digits ? 'Digit1' : undefined, pad: 'lb' },
          { key: digits ? `Digit${tabs.length}` : undefined, pad: 'rb' },
        ]
      : [{ pad: 'lt' }, { pad: 'rt' }];

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={ariaLabel}
      className="k-tabs"
      data-pad-tabs={level === 'sub' ? 'sub' : ''}
    >
      {glyphs && (
        <span aria-hidden className="k-glyph-row">
          <InputGlyph binding={ends[0]} size="sm" />
        </span>
      )}
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          disabled={t.disabled}
          title={t.title}
          data-testid={t.testId}
          className={`k-tab k-tab-${size}`}
          onClick={() => onChange(t.id)}
          onPointerUp={blurAfterMouse}
        >
          {t.label}
          {t.badge !== undefined && (
            <>
              {' '}
              <span className="k-tab-badge">{t.badge}</span>
            </>
          )}
        </button>
      ))}
      {glyphs && (
        <span aria-hidden className="k-glyph-row">
          <InputGlyph binding={ends[1]} size="sm" />
        </span>
      )}
    </div>
  );
}

/** The raised steel a segment sits on: a colour tints its label only if it reads there (4.5:1). */
const SEGMENT_GROUND = '#3a4466';

/** One choice of several (`role="radio"`). A colour that fails on raised steel shows as a swatch instead. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  columns,
  'aria-label': ariaLabel,
}: SegmentedProps<T>): ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="k-segs"
      style={
        columns
          ? { display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {options.map((o) => {
        const on = o.id === value;
        const tint = !on && !!o.color && contrast(o.color, SEGMENT_GROUND) >= 4.5;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            title={o.title}
            data-testid={o.testId}
            className="k-seg"
            style={tint ? { color: o.color } : undefined}
            onClick={() => onChange(o.id)}
            onPointerUp={blurAfterMouse}
          >
            {o.color && !tint && (
              <span aria-hidden className="k-swatch" style={{ background: o.color }} />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const BAR_FILL: Record<BarProps['kind'], string> = {
  life: 'repeating-linear-gradient(90deg, #63c74d 0 12px, #3e8948 12px 14px)',
  mana: 'repeating-linear-gradient(90deg, #2ce8f5 0 2px, #0099db 2px 12px, #124e89 12px 14px)',
  charge: 'repeating-linear-gradient(90deg, #fee761 0 2px, #feae34 2px 12px, #f77622 12px 14px)',
  progress: '#feae34',
};

const BAR_FRAME: Record<BarProps['kind'], string> = {
  life: 'k-lifeframe',
  mana: 'k-mana',
  charge: 'k-lifeframe',
  progress: 'k-bar-progress',
};

const BAR_HEIGHT: Record<BarProps['kind'], number> = {
  life: 32,
  mana: 24,
  charge: 12,
  progress: 12,
};

const BAR_NAME: Record<BarProps['kind'], string> = {
  life: 'Life',
  mana: 'Mana',
  charge: 'Charge',
  progress: 'Progress',
};

/** 8 px segments with 2 px gaps, cut out of whatever fill sits under it. */
const SEGMENTS = 'repeating-linear-gradient(90deg, #000 0 8px, transparent 8px 10px)';

/** A stepped bar: life (green), mana (in the mana glow), charge (hot metal) or progress; `extra` follows the fill (a barrier). */
export function Bar({
  value,
  max,
  kind,
  extra,
  label,
  height = BAR_HEIGHT[kind],
  segmented = false,
  testId,
}: BarProps): ReactElement {
  const frac = (v: number) => (max > 0 ? Math.max(0, Math.min(1, v / max)) : 0);
  const fill = frac(value);
  const more = extra ? Math.min(frac(extra.value), 1 - fill) : 0;
  const mask = segmented ? { maskImage: SEGMENTS, WebkitMaskImage: SEGMENTS } : undefined;
  return (
    <div
      role="progressbar"
      aria-label={BAR_NAME[kind]}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={typeof label === 'string' ? label : undefined}
      data-testid={testId}
      className={`k-bar ${BAR_FRAME[kind]}`}
      style={{ height }}
    >
      <div
        className="k-bar-fill"
        style={{ left: 0, width: `${fill * 100}%`, background: BAR_FILL[kind], ...mask }}
      />
      {extra && more > 0 && (
        <div
          className="k-bar-extra"
          style={{
            left: `${fill * 100}%`,
            width: `${more * 100}%`,
            background: `repeating-linear-gradient(90deg, transparent 0 12px, rgba(24, 20, 37, 0.35) 12px 14px), ${extra.color}`,
            ...mask,
          }}
        />
      )}
      {label !== undefined && (
        <span
          className="k-bar-label k-disp"
          style={{ fontSize: Math.max(14, Math.round(height * 0.7)) }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
```

In `packages/client/src/features/delve/kit/kit.css`:

Append at the end of the file:

```css
/* ── Controls ── */

.k-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  box-sizing: border-box;
  font-family: var(--k-font-display);
  font-weight: 400;
  font-size-adjust: 0.56;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}

.k-btn:active:not(:disabled) {
  transform: translateY(2px);
}

.k-btn-sm {
  padding: 6px 12px;
  min-height: 36px;
  font-family: var(--k-font-body);
  font-size: 16px;
  font-size-adjust: none;
  letter-spacing: 0;
  text-transform: none;
}

.k-btn-md {
  padding: 12px 18px;
  min-height: 48px;
  font-size: 18px;
}

.k-btn-lg {
  padding: 12px 26px;
  min-height: 56px;
  font-size: 22px;
}

.k-btn-quiet {
  background: none;
  border: 3px solid transparent;
  color: var(--k-text-2);
}

.k-btn-quiet:hover:not(:disabled) {
  color: var(--k-text);
}

.k-btn:disabled {
  background: #262b44;
  color: #5a6988;
  border-color: #3a4466;
  box-shadow: none;
  cursor: not-allowed;
}

.k-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-family: var(--k-font-body);
  font-weight: 600;
  font-size: 14px;
  color: #ffffff;
  background: #3a4466;
  border: 2px solid #5a6988;
  cursor: pointer;
}

.k-chip[aria-pressed='true'],
.k-seg[aria-checked='true'] {
  background: #feae34;
  border-color: #fee761;
  color: #3e2731;
  box-shadow: 0 0 0 3px rgba(247, 118, 34, 0.45);
}

.k-chip:disabled,
.k-seg:disabled {
  color: #5a6988;
  background: #262b44;
  border-color: #3a4466;
  cursor: not-allowed;
}

.k-tabs {
  display: flex;
  align-items: center;
  gap: 22px;
}

.k-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 0;
  border-bottom: 4px solid transparent;
  font-family: var(--k-font-display);
  font-weight: 400;
  font-size-adjust: 0.56;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #8b9bb4;
  cursor: pointer;
}

.k-tab-lg {
  font-size: 24px;
  padding: 20px 6px 16px;
}

.k-tab-md {
  font-size: 18px;
  padding: 8px 6px 6px;
}

.k-tab[aria-selected='true'] {
  color: #fee761;
  border-bottom-color: #feae34;
  text-shadow:
    2px 2px 0 #181425,
    0 3px 0 #f77622;
}

.k-tab:disabled {
  color: #5a6988;
  cursor: not-allowed;
}

.k-tab-badge {
  font-family: var(--k-font-body);
  font-size: 14px;
  text-transform: none;
  letter-spacing: 0;
  color: var(--k-text-2);
  text-shadow: none;
}

.k-segs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.k-seg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  min-height: 36px;
  font-family: var(--k-font-label);
  font-size: 14px;
  color: #ffffff;
  background: #3a4466;
  border: 2px solid #5a6988;
  cursor: pointer;
}

.k-swatch {
  width: 10px;
  height: 10px;
  flex: none;
  box-shadow: 0 0 0 2px #181425;
}

.k-bar {
  position: relative;
  background: #181425;
  overflow: hidden;
}

.k-bar-progress {
  box-shadow: 0 0 0 2px #3a4466;
}

.k-bar-fill,
.k-bar-extra {
  position: absolute;
  top: 0;
  bottom: 0;
}

.k-bar-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/controls.test.tsx)`
Expected: PASS, 8 tests.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 905 tests in 103 files, all passing; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-1a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/kit/controls.tsx src/features/delve/kit/kit.css src/features/delve/kit/__tests__/controls.test.tsx)
git add packages/client/src/features/delve/kit/controls.tsx packages/client/src/features/delve/kit/kit.css packages/client/src/features/delve/kit/__tests__/controls.test.tsx
git commit -m "feat(client): the kit's controls: buttons, chips, tabs, segments and bars" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The surfaces

### Task 5: The surfaces

Panels in their materials, the zoomed screen with its band and planks, the header and footer rows, and the dialog in the zoomed layer.

**Files:**
- Create: `packages/client/src/features/delve/kit/surfaces.tsx`
- Modify: `packages/client/src/features/delve/kit/kit.css`
- Test: `packages/client/src/features/delve/kit/__tests__/surfaces.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/kit/__tests__/surfaces.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog, Footer, Header, Panel, Screen } from '../surfaces';

afterEach(() => document.getElementById('delve-ui-layer')?.remove());

describe('the kit surfaces', () => {
  it('draws a panel as a region named by its title, in its material', () => {
    const { rerender } = render(
      <Panel title="Bag" aside={<span>22 / 40</span>} testId="bag-panel">
        tiles
      </Panel>,
    );
    const panel = screen.getByRole('region', { name: 'Bag' });
    expect(panel).toHaveClass('k-panel', 'k-plate');
    expect(panel).toHaveAttribute('data-testid', 'bag-panel');
    expect(panel).toHaveTextContent('Bag22 / 40tiles');
    expect(panel.lastElementChild).toHaveClass('k-scroll');
    rerender(
      <Panel as="aside" material="glass" accent="#fee761" aria-label="Floor">
        map
      </Panel>,
    );
    const glass = screen.getByRole('complementary', { name: 'Floor' });
    expect(glass).toHaveClass('k-glass');
    expect(glass).toHaveStyle({ borderColor: '#fee761' });
    expect(glass.lastElementChild).not.toHaveClass('k-scroll');
  });

  it('makes a zoomed screen with a header band, a main area and a plank footer', () => {
    render(
      <Screen
        backdrop="wall"
        testId="anvil"
        header={
          <Header
            title="The Anvil"
            subtitle="Deepest 7"
            nav={<span>tabs</span>}
            aside={<span>Power</span>}
          />
        }
        footer={
          <Footer prompts={[{ id: 'menu', label: 'Menu', binding: { key: 'Escape' } }]}>
            Delve
          </Footer>
        }
      >
        panes
      </Screen>,
    );
    const root = screen.getByTestId('anvil');
    expect(root).toHaveClass('delve-ui', 'delve-zoom', 'k-wall');
    expect(root).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('banner')).toHaveClass('k-band');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The AnvilDeepest 7');
    expect(screen.getByRole('navigation')).toHaveTextContent('tabs');
    expect(screen.getByRole('main')).toHaveTextContent('panes');
    expect(screen.getByRole('contentinfo')).toHaveClass('k-planks');
    expect(screen.getByRole('contentinfo')).toHaveTextContent('EscMenuDelve');
  });

  it('keeps the stop header bare over the arena', () => {
    render(
      <Screen backdrop="arena-stop" headerStyle="bare" header="Depth 3 cleared" footer={null}>
        cards
      </Screen>,
    );
    expect(screen.getByRole('banner')).not.toHaveClass('k-band');
    expect(screen.getByRole('banner').parentElement).toHaveClass('k-screen-arena-stop');
  });

  it('opens a dialog in the zoomed layer, a scope with its Back, and gives the focus back', () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Controls
          </button>
          {open && (
            <Dialog title="Controls" onClose={() => setOpen(false)} testId="controls-dialog">
              <button type="button">Rebind</button>
            </Dialog>
          )}
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Controls' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Controls' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('data-testid', 'controls-dialog');
    expect(dialog.closest('#delve-ui-layer')).toHaveClass('delve-ui', 'delve-zoom');
    expect(dialog.parentElement).toHaveAttribute('data-pad-scope');
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toHaveAttribute('data-pad-back');
    expect(back).toHaveFocus();
    fireEvent.click(back);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('forces a dialog with no onClose: no Back, the focus on initialFocus', () => {
    function Forced() {
      const pick = useRef<HTMLButtonElement>(null);
      return (
        <Dialog title="Choose your mana" initialFocus={pick} footer={<span>footer</span>}>
          <button type="button">Fire</button>
          <button type="button" ref={pick}>
            Frost
          </button>
        </Dialog>
      );
    }
    render(<Forced />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(document.querySelector('[data-pad-back]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Frost' })).toHaveFocus();
    expect(screen.getByRole('dialog')).toHaveTextContent('footer');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/surfaces.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../surfaces" from "src/features/delve/kit/__tests__/surfaces.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the surfaces and their classes**

Create `packages/client/src/features/delve/kit/surfaces.tsx`:

```tsx
import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './controls';
import { PromptBar } from './glyphs';
import { uiLayer } from './layer';
import type { DialogProps, PanelProps, Prompt, ScreenProps } from './types';

/** A pane: a plate (wood-framed riveted steel, the hub), glass (HUD steel) or a well (a dark inset). */
export function Panel({
  as: Tag = 'section',
  material = 'plate',
  title,
  aside,
  accent,
  scroll = material === 'plate',
  testId,
  className = '',
  style,
  children,
  ...rest
}: PanelProps): ReactElement {
  const titleId = useId();
  return (
    <Tag
      {...rest}
      className={`k-panel k-${material} ${className}`}
      style={accent ? { ...style, borderColor: accent } : style}
      aria-labelledby={title !== undefined && !rest['aria-label'] ? titleId : undefined}
      data-testid={testId}
    >
      {(title !== undefined || aside !== undefined) && (
        <div className="k-panel-head">
          {title !== undefined && (
            <h2 id={titleId} className="k-section" style={{ margin: 0 }}>
              {title}
            </h2>
          )}
          {aside}
        </div>
      )}
      <div className={`k-panel-body ${scroll ? 'k-scroll' : ''}`}>{children}</div>
    </Tag>
  );
}

/** A 1080p-design screen (.delve-ui.delve-zoom, a pad scope): a 72 px header, the main area, a 76 px plank footer. */
export function Screen({
  header,
  footer,
  children,
  backdrop,
  headerStyle = 'band',
  testId,
}: ScreenProps): ReactElement {
  return (
    <div
      className={`delve-ui delve-zoom k-screen ${backdrop === 'wall' ? 'k-wall' : `k-screen-${backdrop}`}`}
      data-pad-scope
      data-testid={testId}
    >
      <header className={`k-screen-head ${headerStyle === 'band' ? 'k-band' : ''}`}>
        {header}
      </header>
      <main className="k-screen-main">{children}</main>
      <footer className="k-screen-foot k-planks">{footer}</footer>
    </div>
  );
}

/** A screen's header row: the title and subtitle, the nav (tabs), and the right-hand group. */
export function Header({
  title,
  subtitle,
  nav,
  aside,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  nav?: ReactNode;
  aside?: ReactNode;
}): ReactElement {
  return (
    <div className="k-header">
      <h1 className="k-header-title">
        <span className="k-disp">{title}</span>
        {subtitle !== undefined && <span className="k-caption">{subtitle}</span>}
      </h1>
      {nav !== undefined && <nav className="k-header-nav">{nav}</nav>}
      {aside !== undefined && <div className="k-header-aside">{aside}</div>}
    </div>
  );
}

/** A screen's footer row: its prompts, then `children` at the right. Draws only: the screen calls usePrompts. */
export function Footer({
  prompts,
  children,
}: {
  prompts: Prompt[];
  children?: ReactNode;
}): ReactElement {
  return (
    <div className="k-footer">
      <PromptBar prompts={prompts} />
      {children !== undefined && <div className="k-footer-aside">{children}</div>}
    </div>
  );
}

/**
 * A centred plate in uiLayer() (zoomed), its own pad scope. Back carries `data-pad-back` (Esc and B
 * press it); with no `onClose` the dialog is forced and has no Back. The focus goes to
 * `initialFocus`, else the first control, and back to the opener on close.
 */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  width = 640,
  initialFocus,
  testId,
}: DialogProps): ReactElement {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    const first =
      initialFocus?.current ??
      ref.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ??
      ref.current;
    first?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [initialFocus, opener]);

  return createPortal(
    <div className="k-dialog-backdrop" data-pad-scope>
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="k-panel k-plate k-dialog"
        style={{ width }}
        data-testid={testId}
      >
        <div className="k-panel-head">
          <h2 id={titleId} className="k-heading" style={{ margin: 0 }}>
            {title}
          </h2>
          {onClose && (
            <Button
              variant="quiet"
              size="sm"
              binding={{ key: 'Escape', pad: 'b' }}
              data-pad-back
              onClick={onClose}
            >
              Back
            </Button>
          )}
        </div>
        <div className="k-panel-body k-scroll">{children}</div>
        {footer !== undefined && <div className="k-footer">{footer}</div>}
      </section>
    </div>,
    uiLayer(),
  );
}
```

In `packages/client/src/features/delve/kit/kit.css`:

Append at the end of the file:

```css
/* ── Surfaces ── */

.k-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  min-height: 0;
  padding: 22px;
  box-sizing: border-box;
}

.k-panel.k-glass {
  padding: 14px 16px;
  gap: 12px;
}

.k-panel.k-well {
  padding: 14px;
  gap: 8px;
}

.k-panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.k-panel-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  flex: 1 1 auto;
}

.k-scroll {
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #5a6988 #181425;
}

.k-screen {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: 72px minmax(0, 1fr) 76px;
  overflow: hidden;
}

.k-screen-arena-pause {
  background: rgba(24, 20, 37, 0.86);
}

.k-screen-arena-stop {
  background: rgba(6, 6, 11, 0.82);
}

.k-screen-head {
  display: flex;
  align-items: center;
  padding: 0 32px;
  box-sizing: border-box;
}

.k-screen-main {
  min-height: 0;
  overflow: hidden;
}

.k-screen-foot {
  display: flex;
  align-items: center;
  padding: 0 32px;
  box-sizing: border-box;
}

.k-header {
  display: flex;
  align-items: center;
  gap: 32px;
  width: 100%;
}

.k-header-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 0;
  font-weight: 400;
}

.k-header-title .k-disp {
  font-size: 30px;
  color: var(--k-hot-hi);
}

.k-header-nav {
  display: flex;
  align-items: center;
  gap: 22px;
}

.k-header-aside {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 22px;
  font-size: 16px;
}

.k-footer {
  display: flex;
  align-items: center;
  gap: 28px;
  width: 100%;
}

.k-footer-aside {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
}

.k-dialog-backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(24, 20, 37, 0.72);
  pointer-events: auto;
}

.k-dialog {
  max-width: calc(100% - 64px);
  max-height: calc(100% - 64px);
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/surfaces.test.tsx)`
Expected: PASS, 5 tests.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 910 tests in 104 files, all passing; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-1a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/kit/surfaces.tsx src/features/delve/kit/kit.css src/features/delve/kit/__tests__/surfaces.test.tsx)
git add packages/client/src/features/delve/kit/surfaces.tsx packages/client/src/features/delve/kit/kit.css packages/client/src/features/delve/kit/__tests__/surfaces.test.tsx
git commit -m "feat(client): the kit's surfaces: panels, screens, headers, footers and dialogs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 5: Items and tooltips

### Task 6: The item tile and the pixel item icons

**Files:**
- Create: `packages/client/src/features/delve/kit/Tile.tsx`
- Modify: `packages/client/src/features/delve/ItemIcon.tsx`, `packages/client/src/features/delve/kit/kit.css`
- Test: `packages/client/src/features/delve/kit/__tests__/Tile.test.tsx`, `packages/client/src/features/delve/__tests__/ItemIcon.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/features/delve/kit/__tests__/Tile.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RARITY_COLOR } from '../../format';
import { ItemIcon } from '../../ItemIcon';
import { Tile } from '../Tile';

describe('the kit tile', () => {
  it('is a socket with the rarity border, its icon and its size', () => {
    const onClick = vi.fn();
    render(
      <Tile
        rarity="epic"
        icon={<ItemIcon baseId="cuirass" rarity="epic" />}
        size={64}
        label="Voidweave Plate, epic"
        testId="bag-item"
        onClick={onClick}
      />,
    );
    const tile = screen.getByRole('button', { name: 'Voidweave Plate, epic' });
    expect(tile).toHaveClass('k-tile', 'k-socket');
    expect(tile).toHaveStyle({ width: '64px', height: '64px', borderColor: RARITY_COLOR.epic });
    expect(tile).toHaveAttribute('data-rarity', 'epic');
    expect(tile).toHaveAttribute('data-testid', 'bag-item');
    expect(tile).not.toHaveAttribute('aria-pressed');
    expect(tile.querySelector('svg[data-base="cuirass"]')).not.toBeNull();
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('draws and speaks its states', () => {
    const { rerender } = render(
      <Tile rarity="rare" label="Ember Fang" delta="up" fresh locked equipped selected />,
    );
    const tile = screen.getByRole('button', {
      name: 'Ember Fang, upgrade, new, locked, equipped',
    });
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    expect(tile.querySelector('[data-glyph="up"]')).not.toBeNull();
    expect(tile.querySelector('[data-glyph="lock"]')).not.toBeNull();
    expect(tile).toHaveTextContent('NEW');
    expect(tile).toHaveTextContent('E');
    rerender(<Tile rarity="rare" label="Ember Fang" delta="down" selected={false} />);
    expect(screen.getByRole('button', { name: 'Ember Fang, downgrade' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(tile.querySelector('[data-glyph="down"]')).not.toBeNull();
    rerender(<Tile rarity="rare" label="Ember Fang" delta="potential" />);
    expect(
      screen.getByRole('button', { name: 'Ember Fang, potential upgrade' }),
    ).toBeInTheDocument();
    expect(tile.querySelector('[data-glyph="potential"]')).not.toBeNull();
  });

  it('draws an empty slot with no rarity', () => {
    render(<Tile rarity={null} label="Empty helm slot" />);
    const tile = screen.getByRole('button', { name: 'Empty helm slot' });
    expect(tile).not.toHaveAttribute('data-rarity');
    expect(tile.style.borderColor).toBe('');
  });
});
```

Create `packages/client/src/features/delve/__tests__/ItemIcon.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RARITY_COLOR } from '../format';
import { ItemIcon } from '../ItemIcon';
import { getDelveRegistry } from '../registry';

function fills(svg: Element): string[] {
  return [...new Set([...svg.querySelectorAll('rect')].map((r) => r.getAttribute('fill')!))];
}

describe('ItemIcon', () => {
  it('draws every gear base from its own pixel map', () => {
    for (const base of getDelveRegistry().getDelveData().bases) {
      const { container, unmount } = render(<ItemIcon baseId={base.id} rarity="magic" />);
      expect(container.querySelector('svg')).toHaveAttribute('data-base', base.id);
      unmount();
    }
  });

  it('fills the rarity colour inside a #181425 outline, on a crisp 10×10 grid', () => {
    const { container } = render(<ItemIcon baseId="sword" rarity="legendary" size={40} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('viewBox', '0 0 10 10');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveAttribute('shape-rendering', 'crispEdges');
    expect(fills(svg).sort()).toEqual(['#181425', RARITY_COLOR.legendary].sort());
  });

  it('falls back to the ring, and draws a ghost dim with no outline', () => {
    const { container, rerender } = render(<ItemIcon baseId="nope" rarity="common" />);
    expect(container.querySelector('svg')).toHaveAttribute('data-base', 'ring');
    rerender(<ItemIcon baseId="helm" rarity="common" ghost />);
    const svg = container.querySelector('svg')!;
    expect(fills(svg)).toEqual(['#5a6988']);
    expect(svg).toHaveStyle({ opacity: '0.35' });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/Tile.test.tsx src/features/delve/__tests__/ItemIcon.test.tsx)`
Expected: FAIL. `Tile.test.tsx`, no tests: `Error: Failed to resolve import "../Tile" from "src/features/delve/kit/__tests__/Tile.test.tsx". Does the file exist?` `ItemIcon.test.tsx`: 3 failed (3): today's silhouettes have no `data-base`, fill with a gradient and draw a ghost in it.

- [ ] **Step 3: Write the tile, the pixel maps and the tile's classes**

Create `packages/client/src/features/delve/kit/Tile.tsx`:

```tsx
import type { ReactElement } from 'react';
import { RARITY_COLOR } from '../format';
import { blurAfterMouse } from './controls';
import { Glyph } from './glyphs';
import type { TileProps } from './types';

/**
 * An item socket: a well with the rarity border, its icon, and its marks (▲ ▼ ◇ delta, NEW, lock,
 * equipped). The marks are drawn for the eye and spoken in the label.
 */
export function Tile({
  rarity,
  icon,
  size = 84,
  delta = null,
  fresh = false,
  locked = false,
  equipped = false,
  selected,
  label,
  testId,
  className = '',
  type = 'button',
  style,
  onPointerUp,
  ...rest
}: TileProps): ReactElement {
  const states = [
    delta === 'up' && 'upgrade',
    delta === 'down' && 'downgrade',
    delta === 'potential' && 'potential upgrade',
    fresh && 'new',
    locked && 'locked',
    equipped && 'equipped',
  ].filter(Boolean);
  return (
    <button
      {...rest}
      type={type}
      className={`k-tile k-socket ${className}`}
      style={{
        ...style,
        width: size,
        height: size,
        borderColor: rarity ? RARITY_COLOR[rarity] : undefined,
      }}
      aria-label={[label, ...states].join(', ')}
      aria-pressed={selected}
      data-rarity={rarity ?? undefined}
      data-testid={testId}
      onPointerUp={(e) => {
        onPointerUp?.(e);
        blurAfterMouse(e);
      }}
    >
      {icon && (
        <span aria-hidden className="k-tile-icon">
          {icon}
        </span>
      )}
      {delta && (
        <span aria-hidden className="k-tile-mark k-tile-delta">
          <Glyph id={delta} size={14} />
        </span>
      )}
      {fresh && (
        <span aria-hidden className="k-tile-mark k-tile-new">
          NEW
        </span>
      )}
      {locked && (
        <span aria-hidden className="k-tile-mark k-tile-lock">
          <Glyph id="lock" size={12} />
        </span>
      )}
      {equipped && (
        <span aria-hidden className="k-tile-mark k-tile-eq">
          E
        </span>
      )}
    </button>
  );
}
```

In `packages/client/src/features/delve/ItemIcon.tsx`:

Replace the lines from `import { useId } from 'react';` up to the end of the file with:

```tsx
import type { Rarity } from '@alloy/engine';
import { RARITY_COLOR } from './format';
import { pixelRuns } from './kit/glyph-art';

/**
 * One 10×10 pixel map per gear base (`#` is the item). It is drawn in the rarity colour, and
 * every empty pixel beside it gets the #181425 outline, so the shapes keep a 1 px margin.
 */
const MAPS: Record<string, string[]> = {
  dagger: [
    '..........',
    '..........',
    '......##..',
    '.....###..',
    '..#.###...',
    '...###....',
    '...##.....',
    '..#..#....',
    '.#........',
    '..........',
  ],
  sword: [
    '..........',
    '.......##.',
    '......###.',
    '.....###..',
    '..#.###...',
    '...###....',
    '...##.....',
    '..#..#....',
    '.#........',
    '..........',
  ],
  axe: [
    '..........',
    '...#.##...',
    '...######.',
    '...#####..',
    '...#.##...',
    '...#......',
    '...#......',
    '...#......',
    '...#......',
    '..........',
  ],
  maul: [
    '..........',
    '.########.',
    '.########.',
    '.########.',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '..........',
  ],
  staff: [
    '..........',
    '....##....',
    '...####...',
    '...####...',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '..........',
  ],
  wand: [
    '..........',
    '......#...',
    '.....###..',
    '......#...',
    '.....#....',
    '....#.....',
    '...#......',
    '..#.......',
    '.#........',
    '..........',
  ],
  bow: [
    '..........',
    '...##..#..',
    '....#..#..',
    '.....#.#..',
    '.....#.#..',
    '.....#.#..',
    '.....#.#..',
    '....#..#..',
    '...##..#..',
    '..........',
  ],
  helm: [
    '..........',
    '..........',
    '...####...',
    '..######..',
    '.########.',
    '.###..###.',
    '.##....##.',
    '.##....##.',
    '..........',
    '..........',
  ],
  cuirass: [
    '..........',
    '..##..##..',
    '.########.',
    '.########.',
    '..######..',
    '..######..',
    '..######..',
    '..######..',
    '..######..',
    '..........',
  ],
  gauntlets: [
    '..........',
    '..#.#.#...',
    '..#.#.#.#.',
    '..#######.',
    '..#######.',
    '..######..',
    '...####...',
    '...####...',
    '...####...',
    '..........',
  ],
  greaves: [
    '..........',
    '..####....',
    '..####....',
    '..####....',
    '..####....',
    '..#####...',
    '..######..',
    '..#######.',
    '..#######.',
    '..........',
  ],
  amulet: [
    '..........',
    '.#......#.',
    '..#....#..',
    '...#..#...',
    '....##....',
    '...####...',
    '..######..',
    '...####...',
    '....##....',
    '..........',
  ],
  ring: [
    '..........',
    '....##....',
    '....##....',
    '..........',
    '...####...',
    '..#....#..',
    '..#....#..',
    '..#....#..',
    '...####...',
    '..........',
  ],
};

const NEIGHBOURS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/** The map with its outline: an empty pixel beside a filled one becomes `o`. */
function outlined(rows: string[]): string[] {
  return rows.map((row, y) =>
    [...row]
      .map((ch, x) =>
        ch === '.' && NEIGHBOURS.some(([dx, dy]) => rows[y + dy]?.[x + dx] === '#') ? 'o' : ch,
      )
      .join(''),
  );
}

const RUNS = Object.fromEntries(
  Object.entries(MAPS).map(([id, rows]) => [id, pixelRuns(outlined(rows))]),
);

export interface ItemIconProps {
  baseId: string;
  rarity: Rarity;
  size?: number | string;
  /** Render as a dim outline (empty paper-doll slot / unknown codex entry). */
  ghost?: boolean;
}

/** A gear base's pixel map in its rarity colour; an unknown base draws the ring. */
export function ItemIcon({ baseId, rarity, size = '100%', ghost = false }: ItemIconProps) {
  const base = MAPS[baseId] ? baseId : 'ring';
  const fill = ghost ? '#5a6988' : RARITY_COLOR[rarity];
  return (
    <svg
      viewBox="0 0 10 10"
      width={size}
      height={size}
      aria-hidden="true"
      shapeRendering="crispEdges"
      data-base={base}
      style={{ display: 'block', opacity: ghost ? 0.35 : 1 }}
    >
      {RUNS[base]
        .filter((r) => !ghost || r.ch === '#')
        .map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={r.w}
            height={1}
            fill={r.ch === '#' ? fill : '#181425'}
          />
        ))}
    </svg>
  );
}
```

In `packages/client/src/features/delve/kit/kit.css`:

Append at the end of the file:

```css
/* ── Items ── */

.k-tile {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  box-sizing: border-box;
  padding: 0;
  cursor: pointer;
}

/* The mockups' 40 px icon in an 84 px socket. */
.k-tile-icon {
  display: flex;
  width: 48%;
  height: 48%;
}

.k-tile[aria-pressed='true'] {
  outline: 2px solid #fee761;
  outline-offset: 3px;
}

.k-tile-mark {
  position: absolute;
  line-height: 1;
}

.k-tile-delta {
  right: 6px;
  bottom: 5px;
  font-size: 14px;
  font-weight: 700;
}

.k-tile-new {
  left: 6px;
  top: 6px;
  padding: 1px 3px;
  font-family: var(--k-font-label);
  font-size: 14px;
  color: #3e2731;
  background: #fee761;
}

.k-tile-lock {
  right: 6px;
  top: 6px;
}

.k-tile-eq {
  left: 6px;
  bottom: 5px;
  font-family: var(--k-font-display);
  font-size: 16px;
  color: #feae34;
  text-shadow: 1px 1px 0 #181425;
}
```

- [ ] **Step 4: Run them to see them pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/Tile.test.tsx src/features/delve/__tests__/ItemIcon.test.tsx)`
Expected: PASS, 6 tests in 2 files.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 916 tests in 106 files, all passing (`ItemTile`, `CodexPanel` and `LegendaryFanfare` keep `ItemIcon`'s props); the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-1a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/kit/Tile.tsx src/features/delve/ItemIcon.tsx src/features/delve/kit/kit.css src/features/delve/kit/__tests__/Tile.test.tsx src/features/delve/__tests__/ItemIcon.test.tsx)
git add packages/client/src/features/delve/kit/Tile.tsx packages/client/src/features/delve/ItemIcon.tsx packages/client/src/features/delve/kit/kit.css packages/client/src/features/delve/kit/__tests__/Tile.test.tsx packages/client/src/features/delve/__tests__/ItemIcon.test.tsx
git commit -m "feat(client): the kit's item tile, and pixel item icons for every gear base" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 7: The tooltips

**Files:**
- Create: `packages/client/src/features/delve/kit/Tooltip.tsx`
- Modify: `packages/client/src/features/delve/kit/kit.css`
- Test: `packages/client/src/features/delve/kit/__tests__/Tooltip.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/kit/__tests__/Tooltip.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useUIStore } from '@/stores/uiStore';
import { Tooltip, TooltipCard } from '../Tooltip';

afterEach(() => {
  document.getElementById('delve-ui-layer')?.remove();
  useUIStore.setState({ uiScale: 1, hudScale: 1 });
});

/** Puts the trigger at a known viewport box (jsdom lays nothing out). */
function at(el: HTMLElement, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    }) as DOMRect;
}

describe('the kit tooltip', () => {
  it('opens on hover and on focus, described by the trigger, in the zoomed layer', () => {
    render(
      <Tooltip content={() => <TooltipCard title="Voidweave Plate">Armor 41</TooltipCard>}>
        <button type="button">Chest</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Chest' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(trigger);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Voidweave PlateArmor 41');
    expect(tip.closest('#delve-ui-layer')).not.toBeNull();
    expect(trigger).toHaveAttribute('aria-describedby', tip.id);
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('places the card from the trigger box divided by the zoom it renders under', () => {
    useUIStore.setState({ uiScale: 1.5, hudScale: 1 });
    const { rerender } = render(
      <Tooltip content={() => 'tip'}>
        <button type="button">Slot</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button');
    at(trigger, 300, 150, 60, 30);
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toHaveStyle({ left: '252px', top: '100px' }); // 360 / 1.5 + 12
    rerender(
      <Tooltip content={() => 'tip'} placement="top">
        <button type="button">Slot</button>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveStyle({
      left: '220px', // (300 + 30) / 1.5
      top: '88px', // 150 / 1.5 − 12
      transform: 'translate(-50%, -100%)',
    });
  });

  it('renders inline under the HUD zoom with portal off, and stays open while asked', () => {
    useUIStore.setState({ uiScale: 1, hudScale: 1.25 });
    const ref = createRef<HTMLButtonElement>();
    render(
      <div className="delve-hud-zoom">
        <Tooltip content={() => 'Plasma Bolt'} portal={false} openWhile>
          <button type="button" ref={ref}>
            Q
          </button>
        </Tooltip>
      </div>,
    );
    const tip = screen.getByRole('tooltip');
    expect(tip.closest('.delve-hud-zoom')).not.toBeNull();
    expect(document.getElementById('delve-ui-layer')).toBeNull();
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Q' }));
  });

  it('draws a card as a plate or glass, with its accent and prompts', () => {
    const { container, rerender } = render(
      <TooltipCard
        title="Voidweave Plate"
        subtitle="Epic chest"
        accent="#b55088"
        prompts={[{ id: 'equip', label: 'Equip', binding: { mouse: 'rmb', pad: 'a' } }]}
      >
        stats
      </TooltipCard>,
    );
    const card = container.firstElementChild!;
    expect(card).toHaveClass('k-tipcard', 'k-plate');
    expect(card).toHaveStyle({ width: '420px', borderColor: '#b55088' });
    expect(card).toHaveTextContent('Voidweave PlateEpic cheststatsRMBEquip');
    rerender(
      <TooltipCard title="Plasma Bolt" material="glass" width={320}>
        hit
      </TooltipCard>,
    );
    expect(container.firstElementChild).toHaveClass('k-glass');
    expect(container.firstElementChild).toHaveStyle({ width: '320px' });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/Tooltip.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../Tooltip" from "src/features/delve/kit/__tests__/Tooltip.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the tooltip, its card and their classes**

Create `packages/client/src/features/delve/kit/Tooltip.tsx`:

```tsx
import {
  cloneElement,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { PromptBar } from './glyphs';
import { uiLayer } from './layer';
import type { Prompt, TooltipProps } from './types';
import { layerZoom } from './zoom';

/** The gap between a trigger and its card, in design px. */
const GAP = 12;

type TriggerProps = {
  onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
  'aria-describedby'?: string;
  ref?: Ref<HTMLElement>;
};

/** Where the card goes: the trigger's viewport box ÷ the zoom the card renders under, beside it. */
function place(
  rect: DOMRect,
  z: number,
  placement: NonNullable<TooltipProps['placement']>,
): CSSProperties {
  const midX = (rect.left + rect.width / 2) / z;
  switch (placement) {
    case 'right':
      return { left: rect.right / z + GAP, top: rect.top / z };
    case 'left':
      return { left: rect.left / z - GAP, top: rect.top / z, transform: 'translateX(-100%)' };
    case 'top':
      return { left: midX, top: rect.top / z - GAP, transform: 'translate(-50%, -100%)' };
    case 'bottom':
      return { left: midX, top: rect.bottom / z + GAP, transform: 'translateX(-50%)' };
  }
}

/**
 * Shows `content()` beside its child on hover and on focus (the pad's focus too), or while
 * `openWhile`. Portalled into uiLayer() by default; `portal={false}` renders it inline, under
 * the zoom the child sits under (the HUD).
 */
export function Tooltip({
  content,
  children,
  placement = 'right',
  openWhile,
  portal = true,
}: TooltipProps): ReactElement {
  const id = useId();
  const anchor = useRef<HTMLElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [, rerender] = useState(0);
  const open = (openWhile ?? false) || hovered || focused;
  const own = children.props as TriggerProps;
  const ownRef = own.ref;

  const ref = useCallback(
    (el: HTMLElement | null) => {
      anchor.current = el;
      if (typeof ownRef === 'function') ownRef(el);
      else if (ownRef) ownRef.current = el;
    },
    [ownRef],
  );

  // `openWhile` on the first render: draw again once the trigger is in the DOM.
  useLayoutEffect(() => {
    if (openWhile) rerender((n) => n + 1);
  }, [openWhile]);

  const trigger = cloneElement(children as ReactElement<TriggerProps>, {
    ref,
    onMouseEnter: (e) => {
      own.onMouseEnter?.(e);
      setHovered(true);
    },
    onMouseLeave: (e) => {
      own.onMouseLeave?.(e);
      setHovered(false);
    },
    onFocus: (e) => {
      own.onFocus?.(e);
      setFocused(true);
    },
    onBlur: (e) => {
      own.onBlur?.(e);
      setFocused(false);
    },
    'aria-describedby': open ? id : own['aria-describedby'],
  });

  let card: ReactNode = null;
  const el = anchor.current;
  if (open && el) {
    const z = layerZoom(portal ? uiLayer() : el);
    card = (
      <div
        role="tooltip"
        id={id}
        className="k-tip"
        style={place(el.getBoundingClientRect(), z, placement)}
      >
        {content()}
      </div>
    );
    if (portal) card = createPortal(card, uiLayer());
  }

  return (
    <>
      {trigger}
      {card}
    </>
  );
}

/** A tooltip's card: a plate (the hub) or glass (the HUD), with a title row and optional prompts. */
export function TooltipCard({
  title,
  subtitle,
  accent,
  children,
  prompts,
  material = 'plate',
  width = 420,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  accent?: string;
  children: ReactNode;
  prompts?: Prompt[];
  material?: 'plate' | 'glass';
  width?: number;
}): ReactElement {
  return (
    <div className={`k-tipcard k-${material}`} style={{ width, borderColor: accent }}>
      <div className="k-tipcard-head">
        <span className="k-disp">{title}</span>
        {subtitle !== undefined && <span className="k-caption">{subtitle}</span>}
      </div>
      {children}
      {prompts && prompts.length > 0 && <PromptBar prompts={prompts} />}
    </div>
  );
}
```

In `packages/client/src/features/delve/kit/kit.css`:

Append at the end of the file:

```css
/* ── Tooltips ── */

.k-tip {
  position: fixed;
  z-index: 80;
  pointer-events: none;
}

.k-tipcard {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  box-sizing: border-box;
}

.k-tipcard.k-glass {
  padding: 14px 16px;
  gap: 8px;
}

.k-tipcard-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.k-tipcard-head .k-disp {
  font-size: 24px;
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/Tooltip.test.tsx)`
Expected: PASS, 4 tests.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 920 tests in 107 files, all passing; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-1a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/kit/Tooltip.tsx src/features/delve/kit/kit.css src/features/delve/kit/__tests__/Tooltip.test.tsx)
git add packages/client/src/features/delve/kit/Tooltip.tsx packages/client/src/features/delve/kit/kit.css packages/client/src/features/delve/kit/__tests__/Tooltip.test.tsx
git commit -m "feat(client): the kit's tooltips, placed through the zoom they render under" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 6: Sprites and the legacy re-skin

### Task 8: `PixelSprite`

**Files:**
- Create: `packages/client/src/features/delve/kit/PixelSprite.tsx`
- Modify: `packages/client/src/features/delve/kit/kit.css`
- Test: `packages/client/src/features/delve/kit/__tests__/PixelSprite.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/kit/__tests__/PixelSprite.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useUIStore } from '@/stores/uiStore';
import { PixelSprite } from '../PixelSprite';

const ATLAS = {
  frames: {
    'hero/0': { frame: { x: 154, y: 180, w: 16, h: 16 } },
    'hero/1': { frame: { x: 171, y: 180, w: 16, h: 16 } },
  },
  animations: { hero: ['hero/0', 'hero/1'] },
  meta: { image: 'atlas.png', size: { w: 255, h: 228 } },
};

const fetchAtlas = vi.fn(async () => ({ json: async () => ATLAS }));

beforeAll(() => {
  vi.stubGlobal('fetch', fetchAtlas);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  useUIStore.setState({ uiScale: 1, hudScale: 1 });
});

describe('PixelSprite', () => {
  it('draws a frame of the atlas at its scale, fetching the atlas once', async () => {
    render(
      <>
        <PixelSprite id="hero" scale={10} context="ui" label="Your hero" />
        <PixelSprite id="hero" scale={4} context="ui" frame={1} />
      </>,
    );
    const hero = await screen.findByRole('img', { name: 'Your hero' });
    await waitFor(() => expect(hero).toHaveStyle({ width: '160px' }));
    expect(hero).toHaveStyle({
      height: '160px',
      backgroundImage: 'url(/sprites/delve/atlas.png)',
      backgroundSize: '2550px 2280px',
      backgroundPosition: '-1540px -1800px',
    });
    const small = document.querySelectorAll('[data-sprite="hero"]')[1];
    expect(small).toHaveAttribute('aria-hidden', 'true');
    expect(small).toHaveStyle({ width: '64px', backgroundPosition: '-684px -720px' });
    expect(fetchAtlas).toHaveBeenCalledOnce();
  });

  it('snaps to whole device pixels under the zoom of its context', async () => {
    useUIStore.setState({ uiScale: 1, hudScale: 1.25 });
    render(
      <>
        <PixelSprite id="hero" scale={3.3} context="ui" label="ui" />
        <PixelSprite id="hero" scale={3.3} context="hud" label="hud" />
      </>,
    );
    const ui = await screen.findByRole('img', { name: 'ui' });
    const hud = screen.getByRole('img', { name: 'hud' });
    const width = (el: HTMLElement) => parseFloat(el.style.width);
    await waitFor(() => expect(width(ui)).toBe(48)); // 3.3 device px → 3 a sprite pixel
    expect(width(hud)).toBeCloseTo(16 * (4 / 1.25), 5); // zoom 1.25: 4.125 → 4 device px
    act(() => useUIStore.setState({ uiScale: 1.5 }));
    expect(width(ui)).toBeCloseTo(16 * (5 / 1.5), 5); // 4.95 → 5
    expect(width(hud)).toBeCloseTo(16 * (7 / 2), 5); // zoom 1.875 → 2: 6.6 → 7
  });

  it('stays empty for an id without art', async () => {
    render(<PixelSprite id="chest" scale={4} context="ui" label="Chest" />);
    await act(async () => {});
    expect(screen.getByRole('img', { name: 'Chest' })).not.toHaveAttribute('style');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/PixelSprite.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../PixelSprite" from "src/features/delve/kit/__tests__/PixelSprite.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the sprite and its class**

Create `packages/client/src/features/delve/kit/PixelSprite.tsx`:

```tsx
import { useEffect, useState, type ReactElement } from 'react';
import { useUIStore } from '@/stores/uiStore';
import type { PixelSpriteProps } from './types';
import { hudZoom, snapScale } from './zoom';

/** The parts of public/sprites/delve/atlas.json the DOM reads (the arena's own atlas). */
interface Atlas {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  animations: Record<string, string[]>;
  meta: { image: string; size: { w: number; h: number } };
}

const DIR = `${import.meta.env.BASE_URL}sprites/delve/`;
let atlas: Promise<Atlas | null> | null = null;

/** The atlas, fetched once for every sprite on the page. */
function loadAtlas(): Promise<Atlas | null> {
  atlas ??= fetch(`${DIR}atlas.json`)
    .then((r) => r.json() as Promise<Atlas>)
    .catch(() => null);
  return atlas;
}

/**
 * A sprite from the arena's atlas, drawn as a background-position of the atlas at `scale` px per
 * sprite pixel, snapped to whole device pixels under the zoom of its `context`. Empty until the
 * atlas loads, and for an id without art.
 */
export function PixelSprite({
  id,
  scale,
  context,
  frame = 0,
  label,
}: PixelSpriteProps): ReactElement {
  const [data, setData] = useState<Atlas | null>(null);
  const ui = useUIStore((s) => s.uiScale);
  const hud = useUIStore((s) => s.hudScale);

  useEffect(() => {
    void loadAtlas().then(setData);
  }, []);

  const frames = data?.animations[id];
  const rect = frames?.length ? data?.frames[frames[frame % frames.length]]?.frame : undefined;
  const z = context === 'hud' ? hudZoom(ui, hud) : ui;
  const s = snapScale(scale, z, window.devicePixelRatio || 1);

  return (
    <span
      className="k-sprite"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-sprite={id}
      style={
        data && rect
          ? {
              width: rect.w * s,
              height: rect.h * s,
              backgroundImage: `url(${DIR}${data.meta.image})`,
              backgroundSize: `${data.meta.size.w * s}px ${data.meta.size.h * s}px`,
              backgroundPosition: `${-rect.x * s}px ${-rect.y * s}px`,
            }
          : undefined
      }
    />
  );
}
```

In `packages/client/src/features/delve/kit/kit.css`:

Append at the end of the file:

```css
/* ── Art ── */

.k-sprite {
  display: inline-block;
  background-repeat: no-repeat;
  image-rendering: pixelated;
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/PixelSprite.test.tsx)`
Expected: PASS, 3 tests.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 923 tests in 108 files, all passing; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-1a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/kit/PixelSprite.tsx src/features/delve/kit/kit.css src/features/delve/kit/__tests__/PixelSprite.test.tsx)
git add packages/client/src/features/delve/kit/PixelSprite.tsx packages/client/src/features/delve/kit/kit.css packages/client/src/features/delve/kit/__tests__/PixelSprite.test.tsx
git commit -m "feat(client): PixelSprite, the arena's atlas in the DOM, snapped to whole device pixels" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: Re-skin the legacy `delve.css` classes

The screens Phase 1 doesn't rebuild (the dive, Training, the Lab, today's panels inside the hub) take the forge look through their classes, and every Delve page loads the kit with them.

**Files:**
- Modify: `packages/client/src/features/delve/delve.css`
- Test: `packages/client/src/features/delve/kit/__tests__/kit-css.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/client/src/features/delve/kit/__tests__/kit-css.test.ts`:

Replace:

```ts
const pub = resolve(__dirname, '../../../../../public');
```

with:

```ts
const legacy = readFileSync(resolve(__dirname, '../../delve.css'), 'utf8');
const pub = resolve(__dirname, '../../../../../public');
```

Replace the lines from `it('keeps the zoom off .delve-ui, on its own two classes', () => {` up to the end of the file with:

```ts
  it('keeps the zoom off .delve-ui, on its own two classes', () => {
    expect(rule(css, '.delve-zoom')).toContain('zoom: var(--ui-scale, 1);');
    expect(rule(css, '.delve-hud-zoom')).toContain('zoom: var(--hud-scale, 1);');
    for (const [, body] of css.matchAll(/\n\.delve-ui \{([^}]*)\}/g)) {
      expect(body).not.toMatch(/zoom/);
    }
  });

  it('re-skins the legacy classes square in the forge materials, and loads the kit with them', () => {
    expect(legacy).toMatch(/^@import '\.\/kit\/kit\.css';\r?$/m);
    const looks: [string, string][] = [
      ['.delve-btn', 'repeating-linear-gradient(0deg, #733e39 0 10px, #6a3934 10px 12px)'],
      ['.delve-btn-gold', 'background: #feae34;'],
      ['.delve-panel', 'border: 6px solid #733e39;'],
      ['.delve-tile', 'border: 3px solid;'],
      ['.delve-chip', 'background: #3a4466;'],
      ['.delve-sheet', 'border: 4px solid #3a4466;'],
      ['.delve-hpbar', 'background: #181425;'],
    ];
    for (const [selector, look] of looks) {
      const body = rule(legacy, selector);
      expect(body, selector).toContain(look);
      expect(body, selector).not.toMatch(/border-radius: (?!0;)/);
    }
    expect(legacy).not.toMatch(/linear-gradient\(180deg/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/kit-css.test.ts)`
Expected: FAIL, 1 failed | 2 passed (3): `AssertionError: expected '/* ═══…' to match /^@import '\.\/kit\/kit\.css';\r?$/m` (Vitest cuts the string).

- [ ] **Step 3: Re-skin the classes**

In `packages/client/src/features/delve/delve.css`:

Replace:

```css
.delve-page {
```

with:

```css
@import './kit/kit.css';

.delve-page {
```

Replace:

```css
.delve-display {
  font-family: var(--font-family-display);
  letter-spacing: 0.04em;
}
```

with:

```css
.delve-display {
  font-family: 'Jersey 10', sans-serif;
  font-weight: 400;
  font-size-adjust: 0.56;
  letter-spacing: 0.05em;
}
```

Replace the lines from `.delve-tile {` up to (not including) `` /* An ability button waiting (a cooldown or its beat): a dark sweep over `--delve-sweep`, an `` with:

```css
.delve-tile {
  position: relative;
  flex-shrink: 0;
  border: 3px solid;
  border-radius: 0;
  padding: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* A socket's steel insets, drawn over the tile's own (inline) background. */
.delve-tile::before {
  content: '';
  position: absolute;
  inset: 0;
  box-shadow:
    inset 0 0 0 3px #262b44,
    inset 0 0 0 5px #3a4466;
  pointer-events: none;
}

.delve-tile:active {
  transform: translateY(2px);
}

.delve-tile-icon {
  position: absolute;
  inset: 16%;
  display: block;
  filter: drop-shadow(2px 2px 0 #181425);
}

.delve-tile-upgrade {
  position: absolute;
  top: 3px;
  left: 4px;
  font-family: 'Jersey 10', sans-serif;
  font-size: 14px;
  line-height: 1;
  color: #fee761;
  text-shadow: 1px 1px 0 #181425;
}

.delve-tile-lock {
  position: absolute;
  top: 4px;
  right: 4px;
  color: #c0cbdc;
}

.delve-tile-new {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  background: #fee761;
  box-shadow: 0 0 0 2px #181425;
}

.delve-tile-equipped {
  position: absolute;
  bottom: 2px;
  left: 4px;
  font-family: 'Jersey 10', sans-serif;
  font-size: 14px;
  color: #feae34;
  text-shadow: 1px 1px 0 #181425;
}

.delve-tile-mana {
  position: absolute;
  bottom: -4px;
  left: 50%;
  width: 10px;
  height: 10px;
  margin-left: -5px;
  border: 2px solid #181425;
}

.delve-tile-delta {
  position: absolute;
  bottom: -3px;
  right: -3px;
  min-width: 16px;
  height: 16px;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  font-weight: 700;
  box-shadow: 2px 2px 0 #181425;
}

.delve-tile-delta.up {
  background: #63c74d;
  color: #193c3e;
}

.delve-tile-delta.down {
  background: #3e2731;
  color: #f6757a;
}

/* A legendary's stepped orange glow (it was a spinning ring). */
.delve-tile-legendary::after {
  content: '';
  position: absolute;
  inset: -3px;
  box-shadow:
    0 0 0 3px rgba(247, 118, 34, 0.55),
    0 0 0 8px rgba(247, 118, 34, 0.18);
  pointer-events: none;
}

```

Delete the lines from `@keyframes delve-spin {` up to (not including) `/* ── Buttons ── */`.

Replace the lines from `/* ── Buttons ── */` up to (not including) `.delve-sheet-backdrop {` with:

```css
/* ── Buttons (the kit's materials: a plank, hot metal, go, danger) ── */

.delve-btn {
  font-family: 'Jersey 10', sans-serif;
  font-weight: 400;
  font-size-adjust: 0.56;
  letter-spacing: 0.06em;
  border-radius: 0;
  border: 3px solid #181425;
  background: repeating-linear-gradient(0deg, #733e39 0 10px, #6a3934 10px 12px);
  color: #ead4aa;
  padding: 10px 14px;
  cursor: pointer;
  box-shadow:
    inset 0 3px 0 #b86f50,
    inset 0 -3px 0 #3e2731;
  -webkit-tap-highlight-color: transparent;
}

.delve-btn:active:not(:disabled) {
  transform: translateY(2px);
}

.delve-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.delve-btn-gold {
  background: #feae34;
  color: #3e2731;
  box-shadow:
    inset 0 3px 0 #fee761,
    inset 0 -4px 0 #f77622,
    0 0 0 3px rgba(247, 118, 34, 0.55),
    0 0 0 8px rgba(247, 118, 34, 0.18);
}

.delve-btn-green {
  background: #63c74d;
  color: #193c3e;
  box-shadow:
    inset 0 3px 0 #a8e090,
    inset 0 -4px 0 #3e8948;
}

.delve-btn-danger {
  background: #3e2731;
  border-color: #a22633;
  color: #f6757a;
  box-shadow: none;
}

.delve-chip {
  font-family: 'Pixelify Sans', sans-serif;
  font-weight: 600;
  font-size: 14px;
  border-radius: 0;
  padding: 4px 10px;
  border: 2px solid #5a6988;
  background: #3a4466;
  color: #ffffff;
  cursor: pointer;
}

.delve-chip[disabled] {
  opacity: 0.35;
  cursor: default;
}

.delve-chip[aria-pressed='true'] {
  background: #feae34;
  border-color: #fee761;
  color: #3e2731;
  box-shadow: 0 0 0 3px rgba(247, 118, 34, 0.45);
}

/* â”€â”€ Panels & sheets â”€â”€ */

/* A plate: a wood frame around riveted steel. */
.delve-panel {
  background:
    linear-gradient(#8b9bb4, #8b9bb4) 10px 10px / 4px 4px no-repeat,
    linear-gradient(#8b9bb4, #8b9bb4) calc(100% - 14px) 10px / 4px 4px no-repeat,
    linear-gradient(#8b9bb4, #8b9bb4) 10px calc(100% - 14px) / 4px 4px no-repeat,
    linear-gradient(#8b9bb4, #8b9bb4) calc(100% - 14px) calc(100% - 14px) / 4px 4px no-repeat,
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.025) 0 2px, transparent 2px 6px),
    #262b44;
  border: 6px solid #733e39;
  border-radius: 0;
  box-shadow:
    0 0 0 3px #181425,
    inset 0 0 0 2px #3e2731,
    inset 0 3px 0 2px #5a6988,
    6px 6px 0 3px rgba(24, 20, 37, 0.6);
}

```

Replace the lines from `.delve-sheet {` up to (not including) `/* ── Dive stage ── */` with:

```css
/* A steel plate, square, rising from the bottom. */
.delve-sheet {
  width: 100%;
  max-width: 560px;
  max-height: 88%;
  overflow-y: auto;
  border-radius: 0;
  background:
    linear-gradient(#5a6988, #5a6988) 10px 10px / 4px 4px no-repeat,
    linear-gradient(#5a6988, #5a6988) calc(100% - 14px) 10px / 4px 4px no-repeat,
    #262b44;
  border: 4px solid #3a4466;
  border-bottom: 0;
  box-shadow:
    0 0 0 3px #181425,
    inset 0 3px 0 #5a6988;
  animation: drawer-up 0.22s cubic-bezier(0.2, 0.9, 0.3, 1);
  padding: 16px 16px calc(16px + var(--spacing-safe-bottom));
}

.delve-quality {
  height: 4px;
  background: #181425;
  overflow: hidden;
}

.delve-quality > span {
  display: block;
  height: 100%;
}

```

Replace the lines from `.delve-hpbar {` up to (not including) `.delve-monster {` with:

```css
.delve-hpbar {
  position: relative;
  height: 14px;
  background: #181425;
  box-shadow:
    0 0 0 2px #181425,
    0 0 0 4px #5a6988;
  overflow: hidden;
}

.delve-hpbar > .lag {
  position: absolute;
  inset: 0 auto 0 0;
  background: #ead4aa;
  opacity: 0.55;
  transition: width 0.5s ease 0.25s;
}

.delve-hpbar > .fill {
  position: absolute;
  inset: 0 auto 0 0;
  transition: width 0.12s ease-out;
}

.delve-hpbar > .text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Jersey 10', sans-serif;
  font-weight: 400;
  font-size: 12px;
  font-size-adjust: 0.56;
  text-shadow: 1px 1px 0 #181425;
}

```

- [ ] **Step 4: Run it to see it pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/kit-css.test.ts)`
Expected: PASS, 3 tests.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 924 tests in 108 files, all passing (Vitest doesn't load CSS, so no component test moves); the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-1a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/delve.css src/features/delve/kit/__tests__/kit-css.test.ts)
git add packages/client/src/features/delve/delve.css packages/client/src/features/delve/kit/__tests__/kit-css.test.ts
git commit -m "style(client): the Delve's legacy classes in the forge materials, loading the kit" -m "Buttons become planks (gold: hot metal, green: go), panels plates, tiles sockets, sheets steel; chips, bars and the display font follow. delve.css imports kit.css, so every Delve page has the fonts and the kit." -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 7: The gallery

### Task 10: The kit gallery, and the look against the mockups

A dev-only page that puts every kit piece on one 1080p board, a smoke test for it, and screenshots to hold against the mockups.

**Files:**
- Create: `packages/client/src/features/delve/kit/KitGallery.tsx`
- Modify: `packages/client/src/App.tsx`
- Test: `packages/client/src/features/delve/kit/__tests__/KitGallery.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/kit/__tests__/KitGallery.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLYPH_ART } from '../glyph-art';
import { KitGallery } from '../KitGallery';

describe('the kit gallery (dev)', () => {
  it('draws every kit piece on one screen', () => {
    render(<KitGallery />);
    expect(screen.getByTestId('kit-gallery')).toBeInTheDocument();
    for (const id of Object.keys(GLYPH_ART)) {
      expect(screen.getByRole('img', { name: id })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('tablist')).toHaveLength(2);
    expect(screen.getAllByRole('progressbar')).toHaveLength(4);
    expect(screen.getByRole('radiogroup', { name: 'Auto-salvage up to' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ember Fang, downgrade, locked, equipped' }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/KitGallery.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../KitGallery" from "src/features/delve/kit/__tests__/KitGallery.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the gallery and its route**

Create `packages/client/src/features/delve/kit/KitGallery.tsx`:

```tsx
import { useState, type ReactElement } from 'react';
import type { Rarity } from '@alloy/engine';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { RARITY_COLOR, RARITY_TEXT } from '../format';
import { ItemIcon } from '../ItemIcon';
import '../delve.css';
import { Bar, Button, Chip, Segmented, Tabs } from './controls';
import { GLYPH_ART } from './glyph-art';
import { Glyph, InputGlyph, Price, PromptBar } from './glyphs';
import { PixelSprite } from './PixelSprite';
import { Dialog, Footer, Header, Panel, Screen } from './surfaces';
import { Tile } from './Tile';
import { TooltipCard, Tooltip } from './Tooltip';
import type { GlyphId, Prompt } from './types';

const RARITIES: Rarity[] = ['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary'];
const BASES = [
  ...['sword', 'dagger', 'axe', 'maul', 'staff', 'wand', 'bow'],
  ...['helm', 'cuirass', 'gauntlets', 'greaves', 'amulet', 'ring'],
];
const TABS = ['loadout', 'skills', 'forge', 'codex', 'quests'] as const;
type Tab = (typeof TABS)[number];

const PROMPTS: Prompt[] = [
  { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
  { id: 'equip', label: 'Equip', binding: { mouse: 'rmb', pad: 'a' } },
  {
    id: 'compare',
    label: 'Full compare',
    binding: { key: 'ShiftLeft', pad: 'lt', whileHeld: true },
  },
  { id: 'salvage', label: 'Salvage', binding: { key: 'Delete', pad: 'x' } },
  { id: 'apply', label: 'Apply', binding: { key: 'Enter', ctrl: true, pad: 'y', padHold: 600 } },
  {
    id: 'menu',
    label: 'Menu',
    binding: { key: 'Escape', pad: 'b' },
    asButton: true,
    padBack: true,
  },
];

/** Dev-only: every kit piece on one 1080p board, to hold against the mockups' UI kit board. */
export function KitGallery(): ReactElement {
  const device = useInputDeviceStore((s) => s.device);
  const setDevice = useInputDeviceStore((s) => s.setDevice);
  const [tab, setTab] = useState<Tab>('loadout');
  const [rarity, setRarity] = useState<Rarity>('epic');
  const [dialog, setDialog] = useState(false);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} data-testid="kit-gallery">
      <Screen
        backdrop="wall"
        header={
          <Header
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Glyph id="anvil" size={40} />
                The kit
              </span>
            }
            subtitle="Delve UI v1 · dev gallery"
            nav={
              <Tabs<Tab>
                aria-label="Gallery tabs"
                level="top"
                digits
                glyphs
                value={tab}
                onChange={setTab}
                tabs={TABS.map((t) => ({ id: t, label: t, disabled: t === 'quests' }))}
              />
            }
            aside={
              <>
                <Price scrap={2412} />
                <Price links={5} />
                <Price dust={40} />
              </>
            }
          />
        }
        footer={
          <Footer prompts={PROMPTS}>
            <Chip pressed={device !== 'gamepad'} onClick={() => setDevice('keyboard')}>
              Keys
            </Chip>
            <Chip pressed={device === 'gamepad'} onClick={() => setDevice('gamepad')}>
              Pad
            </Chip>
            <Button variant="primary" size="lg" binding={{ key: 'Enter', pad: 'menu' }}>
              Delve ▸ depth 6
            </Button>
          </Footer>
        }
      >
        <div
          style={{
            height: '100%',
            boxSizing: 'border-box',
            padding: '24px 32px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 24,
          }}
        >
          <Panel title="Type · colour">
            <div className="k-display">Display 64</div>
            <div className="k-heading">Heading 32</div>
            <div className="k-section">Section 22</div>
            <div>Body 18 · item names, readouts</div>
            <div className="k-body-2">Body 16 · descriptions and prompts</div>
            <div className="k-caption">Caption 14 · the smallest size anywhere</div>
            <div className="k-label">Label 14 · Silkscreen</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
              {RARITIES.map((r) => (
                <span key={r} style={{ color: RARITY_TEXT[r] }}>
                  <span style={{ display: 'block', height: 28, background: RARITY_COLOR[r] }} />
                  {r}
                </span>
              ))}
            </div>
            <span className="k-label">Glyphs</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {(Object.keys(GLYPH_ART) as GlyphId[]).map((id) => (
                <Glyph key={id} id={id} size={21} title={id} />
              ))}
            </div>
            <span className="k-label">Sprites</span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
              <PixelSprite id="hero" scale={10} context="ui" label="Hero" />
              <PixelSprite id="hero" scale={4} context="ui" frame={1} label="Hero, frame 2" />
              <PixelSprite id="dummy" scale={4} context="ui" label="Dummy" />
            </div>
          </Panel>

          <Panel title="Controls" aside={<InputGlyph binding={{ key: 'KeyT', pad: 'view' }} />}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="go">▲ Equip best (8)</Button>
              <Button variant="quiet">Quiet</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Button size="sm" binding={{ mouse: 'rmb', pad: 'a' }}>
                Equip
              </Button>
              <Button
                size="sm"
                binding={{ key: 'Delete', pad: 'x' }}
                onClick={() => setDialog(true)}
              >
                Open a dialog
              </Button>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Chip pressed>All</Chip>
              <Chip pressed={false}>Weapons</Chip>
              <Chip pressed={false}>▲ Upgrades 8</Chip>
              <Chip pressed={false} disabled>
                Disabled
              </Chip>
            </div>
            <Segmented<Rarity>
              aria-label="Auto-salvage up to"
              value={rarity}
              onChange={setRarity}
              columns={3}
              options={RARITIES.map((r) => ({ id: r, label: r, color: RARITY_COLOR[r] }))}
            />
            <Tabs<Tab>
              aria-label="Sub tabs"
              level="sub"
              size="md"
              glyphs
              value={tab}
              onChange={setTab}
              tabs={TABS.slice(0, 3).map((t) => ({
                id: t,
                label: t,
                badge: t === 'skills' ? 2 : undefined,
              }))}
            />
            <Bar
              kind="life"
              value={226}
              max={289}
              extra={{ value: 34, color: '#ead4aa' }}
              label="226 / 289"
            />
            <Bar kind="mana" value={74} max={102} label="74 / 102" />
            <Bar kind="charge" value={2} max={3} />
            <Bar kind="progress" value={6} max={10} segmented />
            <PromptBar prompts={PROMPTS.slice(0, 4)} />
          </Panel>

          <Panel title="Items · surfaces">
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <Tile
                rarity={null}
                label="Empty slot"
                icon={<ItemIcon baseId="helm" rarity="common" ghost />}
              />
              <Tile
                rarity="magic"
                label="Magic wand"
                icon={<ItemIcon baseId="wand" rarity="magic" />}
              />
              <Tooltip
                content={() => (
                  <TooltipCard
                    title={<span style={{ color: RARITY_TEXT.epic }}>Voidweave Plate</span>}
                    subtitle="Epic chest"
                    accent={RARITY_COLOR.epic}
                    prompts={PROMPTS.slice(1, 3)}
                  >
                    <span>Armor 41 · Life +64</span>
                  </TooltipCard>
                )}
              >
                <Tile
                  rarity="epic"
                  label="Voidweave Plate"
                  delta="up"
                  fresh
                  icon={<ItemIcon baseId="cuirass" rarity="epic" />}
                />
              </Tooltip>
              <Tile
                rarity="legendary"
                label="Ember Fang"
                delta="down"
                locked
                equipped
                selected
                icon={<ItemIcon baseId="sword" rarity="legendary" />}
              />
              <Tile
                rarity="rare"
                label="Rare bow"
                delta="potential"
                icon={<ItemIcon baseId="bow" rarity="rare" />}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 40px)', gap: 8 }}>
              {BASES.map((b, i) => (
                <ItemIcon key={b} baseId={b} rarity={RARITIES[i % 6]} size={40} />
              ))}
            </div>
            <Panel as="div" material="well" title="Well">
              A dark inset
            </Panel>
            <Panel as="div" material="glass" title="Glass">
              HUD steel
            </Panel>
            <TooltipCard
              title="Plasma Bolt"
              subtitle="move 3 of 4 · medium"
              material="glass"
              width={320}
            >
              <span>Hit 412 · Beat after 0.32 s</span>
            </TooltipCard>
          </Panel>
        </div>
      </Screen>
      {dialog && (
        <Dialog
          title="Controls"
          onClose={() => setDialog(false)}
          footer={<Button variant="primary">Save</Button>}
        >
          <p>
            A centred plate in the zoomed layer. Esc or B presses Back once the prompt runtime
            lands.
          </p>
        </Dialog>
      )}
    </div>
  );
}
```

In `packages/client/src/App.tsx`:

Replace:

```tsx
import { Suspense } from 'react';
```

with:

```tsx
import { lazy, Suspense } from 'react';
```

Replace:

```tsx
function MatchRedirect() {
```

with:

```tsx
/** The kit gallery (Delve UI v1), in dev builds only: a production build drops it. */
const DEV_KIT = import.meta.env.DEV
  ? lazy(() => import('./features/delve/kit/KitGallery').then((m) => ({ default: m.KitGallery })))
  : null;

function MatchRedirect() {
```

Replace:

```tsx
        {DEV_LAB && (
```

with:

```tsx
        {DEV_KIT && (
          <Route
            path="/delve/kit"
            element={
              <Suspense fallback={null}>
                <DEV_KIT />
              </Suspense>
            }
          />
        )}
        {DEV_LAB && (
```

- [ ] **Step 4: Run it to see it pass, then the whole suite, the typecheck and the build**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/KitGallery.test.tsx)`
Expected: PASS, 1 test.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 925 tests in 109 files, all passing; the typecheck prints nothing.

Run: `(pnpm -F @alloy/client build)` then `grep -l "kit-gallery" packages/client/dist/assets/*.js; ls packages/client/dist/fonts`
Expected: the build succeeds (only the usual chunk-size warning); the grep prints nothing (the gallery is dropped); `ls` lists `jersey-10  pixelify-sans  silkscreen`.

- [ ] **Step 5: Look at it next to the mockups**

Start a dev server on **5291** (not 5288, which the integration uses). PowerShell, from anywhere; it prints `True` once the server answers:

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5291 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\alloy-ui-1a\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5291 --strictPort --force'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5291').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

Take three screenshots at 1920×1080 (keys; the pad's glyphs with a tooltip open; a dialog). Save this script as `packages/client/kit-shots.tmp.mjs` (it sits in the client so Node finds `@playwright/test`; never commit it):

```js
// The kit gallery at 1920×1080: keys, then the pad with a tooltip and a dialog open.
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5291/delve/kit';
const out = process.argv[3] ?? '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(url);
await page.getByTestId('kit-gallery').waitFor();
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${out}/kit-keys.png` });
// The pad's glyphs: claim the lock with the chip, then focus (a mouse move would claim it back).
await page.getByRole('button', { name: 'Pad', exact: true }).click();
await page.getByRole('button', { name: /^Voidweave Plate/ }).focus();
await page.getByRole('tooltip').waitFor();
await page.screenshot({ path: `${out}/kit-pad-tooltip.png` });
await page.getByRole('button', { name: 'Open a dialog' }).click();
await page.getByRole('dialog', { name: 'Controls' }).waitFor();
await page.screenshot({ path: `${out}/kit-dialog.png` });
await browser.close();
```

```bash
cd /c/Projects/alloy-ui-1a/packages/client
SHOTS=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/ui-1a-shots
mkdir -p $SHOTS
node kit-shots.tmp.mjs http://localhost:5291/delve/kit $SHOTS
rm kit-shots.tmp.mjs
ls $SHOTS
```

Expected: `kit-dialog.png  kit-keys.png  kit-pad-tooltip.png`. Open them (the Read tool shows images) and hold them against the mockups: the canvas "Alloy PC UI Redesign" (https://claude.ai/artifact/FYid3YsXypifppvgVe4VzD, boards "UI kit" and "Anvil · Loadout"; their source is the session scratchpad's `ui-canvas/project/UI-Kit.dc.html` and `Anvil-Loadout.dc.html`), and the scratch run's own shots in the scratchpad's `ui-1a/shots/`. Check:
- the wall: dark wood planks with the stepped orange glow from below;
- plates: a 6 px wood frame, steel inside, four rivets, a hard drop shadow; glass: a 4 px steel border, rivets; the well: flat `#181425`;
- the header band: steel with two rivet rows and the cyan mana line under it; the footer: wood planks with a light top edge;
- the type: Jersey 10 display in caps with a 2 px shadow, Pixelify Sans body, Silkscreen labels and key glyphs; no font falls back to a system face;
- buttons: hot metal with a gold bevel and an orange stepped glow, planks in wood, green go, red danger, a grey disabled;
- tabs: the selected one gold with an amber underline; `1` and `5` keycaps (keys) or `LB` / `RB` octagons (pad) at the ends;
- the pad shot: A green, B red, X blue, Y yellow, the rest light grey, octagonal, with `HOLD` beside the hold-Y Apply; the focused tile has the yellow ring and its tooltip is a plate to its right;
- tiles: rarity borders, socket insets, ▲ ▼ ◇, NEW, the lock and E; pixel icons crisp with a dark outline;
- bars: striped life with the barrier after it, mana in its cyan glow;
- the dialog: a centred plate over a dim backdrop, Back with its `Esc` keycap;
- no rounded corners, no blur, no smooth gradients anywhere.

A difference that isn't a deliberate departure ("Departures from the mockups" in the spec, or "Where the spec left room" above) is a bug: fix it in the task that wrote the class, and rerun that task's tests. Then stop the server:

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5291 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
```

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-ui-1a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/kit/KitGallery.tsx src/features/delve/kit/__tests__/KitGallery.test.tsx src/App.tsx)
git add packages/client/src/features/delve/kit/KitGallery.tsx packages/client/src/features/delve/kit/__tests__/KitGallery.test.tsx packages/client/src/App.tsx
git commit -m "feat(client): a dev-only kit gallery at /delve/kit" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Verification

- [ ] **The area's end check**

```bash
cd /c/Projects/alloy-ui-1a
(cd packages/client && npx vitest run src/features/delve/kit src/features/delve/__tests__/ItemIcon.test.tsx src/features/delve/__tests__/format.test.ts)
(cd packages/client && npx vitest run)
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx prettier --check --end-of-line auto src/features/delve/kit/kit.css src/features/delve/kit/*.tsx src/features/delve/kit/zoom.ts src/features/delve/kit/layer.ts src/features/delve/kit/glyph-art.ts src/features/delve/kit/__tests__ src/features/delve/ItemIcon.tsx src/features/delve/format.ts src/features/delve/delve.css src/features/delve/__tests__/ItemIcon.test.tsx src/features/delve/__tests__/format.test.ts src/App.tsx)
git status --short
git log --oneline ui/p1..HEAD
```

Expected:
- the kit, `ItemIcon` and `format` tests: 49 tests in 11 files, all passing;
- the client suite: **925 tests in 109 files** (881 + 44 in 99 + 10), all passing;
- the typecheck prints nothing; Prettier: "All matched files use Prettier code style!";
- `git status` shows nothing to commit (the junctions are git-ignored `node_modules`);
- ten commits, one per task, touching only `public/fonts/`, `features/delve/kit/` (never `types.ts` or `index.ts`), `format.ts`, `ItemIcon.tsx`, `delve.css`, the two `__tests__` files and `App.tsx`.

The engine is untouched, so there is no determinism check: no engine number can move. No version bump here: the overview bumps to v0.54.0 after 1D. No E2E either: nothing here changes a Delve test id or the text the specs read (the legacy re-skin changes styles only; `ItemIcon` keeps its props).
