# Settings → Text size Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings → Display gains **Text size**: Small, Medium, Large (100, 115, 130%), a multiplier on the menus' zoom only (`--ui-scale`, which `.delve-zoom` reads: the hub, the pause, the stop, dialogs, tooltips), never the HUD's (`--hud-scale` keeps the plain UI scale; HUD scale is its own setting). It persists in `uiStore` (`alloy:delve:textSize`) like the other display settings. Every screen holds at Large at 1920×1080 and at Medium at 1280×800, and the responsive probes check both.

**What the code allows, read from it.** Every Delve screen is a fixed 1920×1080 design laid out by flex and grid under a CSS `zoom` (`kit.css`: `.delve-zoom { zoom: var(--ui-scale) }`; `.k-screen` is `position: absolute; inset: 0`, so a screen's design box is the window divided by the zoom). A larger zoom does not reflow anything the design fixed (the Loadout's `430px … 470px` columns, the Skills pane's 500 px, the 72 px header and 76 px footer, dialogs' widths): it only shrinks the design box the flexible parts share. Today the smallest box a screen gets is 1707 × 960 design px (1280×720 at the 0.75 floor). Large at 1920×1080 is zoom 1.3, a 1477 × 831 box; Medium at 1280×800 is 0.8625, a 1484 × 928 box. So:

- **Large at 1920×1080** must hold a 1477 × 831 box: 13% narrower and shorter than any screen holds today. Task 5 measures what breaks and fixes it.
- **Large at 1280×800 cannot be 130%.** 0.75 × 1.3 = 0.975 would leave a 1313 × 821 box, narrower than the hub's fixed columns and dialogs can hold without a reflow the fixed design doesn't have. So the menus' zoom is capped where the box would fall under **1476 × 830** design px (`MENU_MIN`, Large's own box at 1920×1080): at 1280×800 Medium and Large are both 0.86 (17.2 px body text, 13.8 px labels, against 13.5 and 12 at Small). Settings says so under the choice (`text-size-capped`). The same cap holds at 1280×720 and 1280×1024 (0.86); at 1600×900 Large is 0.97; at 2560×1440 it is the full 1.62.
- **Quarter steps.** `uiScaleFor` rounds to quarter steps so pixel fonts and 3 px borders land on whole or regular device pixels (UI v1, decided item 1). 115% and 130% of a quarter step aren't quarter steps, and rounding them to one would erase Medium (1.15 → 1 or 1.25 at 1920×1080) and break the cap. So Small keeps the quarter step exactly, and Medium and Large are floored to a hundredth: the kit's sprites snap to device pixels at any zoom (`PixelSprite`'s `snapScale`, fed the zoom from the store), Chrome draws borders in whole device pixels, and pixel fonts at a fractional zoom are already what 0.75 gives. That is the trade the player chose by picking a size.

**Architecture:** one pure function in `kit/zoom.ts`:

```ts
/** Settings → Text size: the menus' zoom over the UI scale. */
export type TextSize = 'small' | 'medium' | 'large';
export const TEXT_SIZES: Record<TextSize, number> = { small: 1, medium: 1.15, large: 1.3 };
/** The least design box every menu screen holds (Large's at 1920×1080): the text size never zooms past it. */
export const MENU_MIN = { w: 1476, h: 830 } as const;

/**
 * The menus' zoom (`--ui-scale`): the UI scale (`uiScaleFor`, quarter steps) at Small; else the UI
 * scale × `text`, capped where the window would hold less than `MENU_MIN`, never under the UI
 * scale, floored to a hundredth (see the text-size plan: no quarter step can hold 115%).
 */
export function menuScaleFor(width: number, height: number, text: number): number {
  const ui = uiScaleFor(width, height);
  if (text <= 1) return ui;
  const fit = Math.min(width / MENU_MIN.w, height / MENU_MIN.h);
  // The epsilon: 1.15 × 100 is 114.99999999999999 in floating point.
  return Math.max(ui, Math.floor(Math.min(ui * text, fit) * 100 + 1e-9) / 100);
}
```

  `uiScaleFor` lives in `kit/prompts.ts`, which imports `hudZoom` from `zoom.ts`: put `menuScaleFor` in `prompts.ts` beside `uiScaleFor` instead if importing `uiScaleFor` into `zoom.ts` makes a cycle (it would: `prompts.ts` → `zoom.ts` → `prompts.ts`). Keep `TEXT_SIZES`, `MENU_MIN` and `TextSize` with it.

  `uiStore` keeps `uiScale` as the plain UI scale (the HUD's base) and gains `menuScale` (the menus' zoom, mirrored by AppShell, not persisted) and `textSize` (persisted). AppShell sets `--ui-scale` to `menuScale` and `--hud-scale` from `uiScale`. `contextZoom('ui')`, `layerZoom` under `.delve-zoom`, `useUiScale().ui` and `PixelSprite`'s ui context read `menuScale`.

**Tech Stack:** React 19, Zustand, Vitest (jsdom), Playwright.

Read `00-overview.md` first. Plan 01 is done (the type floor is what Large multiplies).

---

### Task 1: `menuScaleFor`

**Files:**
- Modify: `packages/client/src/features/delve/kit/prompts.ts` (or `zoom.ts`; see above)
- Modify: `packages/client/src/features/delve/kit/index.ts` (export `menuScaleFor`, `TEXT_SIZES`, `MENU_MIN`, `type TextSize`)
- Modify: `packages/client/src/features/delve/kit/__tests__/kit-index.test.ts` (the export list)
- Test: `packages/client/src/features/delve/kit/__tests__/prompts.test.ts`

- [ ] **Step 1: Write the failing test** (in the `describe` that holds `uiScaleFor`'s test):

```ts
  it("menuScaleFor: Small is the UI scale's quarter step; Medium and Large multiply it, capped where the window holds less than MENU_MIN", () => {
    const { small, medium, large } = TEXT_SIZES;
    // Small: exactly today's --ui-scale, everywhere.
    for (const [w, h] of [[1280, 720], [1280, 800], [1920, 1080], [2560, 1440], [3440, 1440], [3840, 2160]])
      expect(menuScaleFor(w, h, small)).toBe(uiScaleFor(w, h));
    // 1920×1080: 115% and 130% in full; Large leaves exactly MENU_MIN.
    expect(menuScaleFor(1920, 1080, medium)).toBe(1.15);
    expect(menuScaleFor(1920, 1080, large)).toBe(1.3);
    expect(1920 / 1.3).toBeGreaterThanOrEqual(MENU_MIN.w);
    expect(1080 / 1.3).toBeGreaterThanOrEqual(MENU_MIN.h);
    // 1280×800 (UI scale 0.75): Medium in full (0.8625, floored); Large capped to the same.
    expect(menuScaleFor(1280, 800, medium)).toBe(0.86);
    expect(menuScaleFor(1280, 800, large)).toBe(0.86);
    expect(menuScaleFor(1280, 720, large)).toBe(0.86);
    // Between: 1600×900 (UI scale 0.75) has room for most of Large.
    expect(menuScaleFor(1600, 900, large)).toBe(0.97);
    // Larger windows: the quarter step times the size, under the cap.
    expect(menuScaleFor(2560, 1440, medium)).toBe(1.43);
    expect(menuScaleFor(2560, 1440, large)).toBe(1.62);
    expect(menuScaleFor(3840, 2160, large)).toBe(2.6);
    // Never under the UI scale, and every result leaves at least MENU_MIN (or is the UI scale).
    for (const [w, h] of [[1024, 640], [1280, 720], [1366, 768], [1600, 900], [1920, 1200], [2560, 1080]])
      for (const t of [medium, large]) {
        const z = menuScaleFor(w, h, t);
        expect(z).toBeGreaterThanOrEqual(uiScaleFor(w, h));
        if (z > uiScaleFor(w, h)) {
          expect(w / z).toBeGreaterThanOrEqual(MENU_MIN.w);
          expect(h / z).toBeGreaterThanOrEqual(MENU_MIN.h);
        }
      }
  });
```

  Import `menuScaleFor`, `MENU_MIN` and `TEXT_SIZES` from `'../prompts'` (or `'../zoom'`, wherever Step 3 puts them).

- [ ] **Step 2: Run it** — `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/prompts.test.ts)`. Expected: FAIL (`menuScaleFor` is not exported).
- [ ] **Step 3: Write it** (the Architecture's code). Check the arithmetic the test pins: 2560×1440 has UI scale 1.25; 1.25 × 1.15 = 1.4375 → 1.43; × 1.3 = 1.625, cap min(2560/1476, 1440/830) = 1.734 → 1.62. 1600×900: 0.975 against a cap of 1.084 → 0.97. The `+ 1e-9` is there because 1.15 × 100 is 114.99999999999999 in floating point (without it Medium at 1920×1080 reads 1.14); it can never lift a value past a hundredth it hadn't reached.
- [ ] **Step 4: Run it** — Expected: PASS. Add the four names to `kit/index.ts` and to `kit-index.test.ts`'s list; run that test too.
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/kit
git commit -m "feat(client): menuScaleFor: the menus' zoom for a text size, capped where a screen would hold less than 1476×830 design px"
```

---

### Task 2: the store, AppShell and the zoom's readers

**Files:**
- Modify: `packages/client/src/stores/uiStore.ts`
- Modify: `packages/client/src/components/AppShell.tsx`
- Modify: `packages/client/src/features/delve/kit/zoom.ts` (`contextZoom`)
- Modify: `packages/client/src/features/delve/kit/prompts.ts` (`useUiScale`)
- Modify: `packages/client/src/features/delve/kit/PixelSprite.tsx`
- Test: `packages/client/src/components/__tests__/AppShell.test.tsx`
- Modify (tests that drive the ui context by `uiScale`): `kit/__tests__/PixelSprite.test.tsx`, `kit/__tests__/Tooltip.test.tsx`, `kit/__tests__/zoom.test.ts`, `kit/__tests__/prompts.test.ts` ("useUiScale reads the mirrored UI scale and the HUD setting")

- [ ] **Step 1: Write the failing test** (in `AppShell.test.tsx`; extend its `afterEach` with `act(() => useUIStore.getState().setTextSize('small')); localStorage.removeItem('alloy:delve:textSize');`):

```ts
  it('Text size zooms the menus only: --ui-scale follows it, --hud-scale keeps the plain UI scale, and it persists', () => {
    resize(1920, 1080);
    renderAt('/delve');
    expect([rootVar('--ui-scale'), rootVar('--hud-scale')]).toEqual(['1', '1']);
    act(() => useUIStore.getState().setTextSize('large'));
    expect([rootVar('--ui-scale'), rootVar('--hud-scale')]).toEqual(['1.3', '1']);
    expect(useUIStore.getState()).toMatchObject({ uiScale: 1, menuScale: 1.3, textSize: 'large' });
    expect(localStorage.getItem('alloy:delve:textSize')).toBe('large');
    // At 1280×800 Large is capped to Medium's zoom; the HUD stays at the floor.
    resize(1280, 800);
    expect([rootVar('--ui-scale'), rootVar('--hud-scale')]).toEqual(['0.86', '0.75']);
    act(() => useUIStore.getState().setTextSize('medium'));
    expect(rootVar('--ui-scale')).toBe('0.86');
    act(() => useUIStore.getState().setTextSize('small'));
    expect(rootVar('--ui-scale')).toBe('0.75');
  });
```

  And in `uiStore`'s own test file if one exists (`grep -rln "useUIStore" packages/client/src/stores --include=*.test.ts`; none: put it in `AppShell.test.tsx`):

```ts
  it('reads a saved text size, and anything else as Small', () => {
    for (const [saved, size] of [['large', 'large'], ['medium', 'medium'], ['huge', 'small'], [null, 'small']] as const) {
      if (saved) localStorage.setItem('alloy:delve:textSize', saved);
      else localStorage.removeItem('alloy:delve:textSize');
      expect(loadTextSize()).toBe(size);
    }
  });
```

  (`loadTextSize` is exported from `uiStore.ts` for this test, as the store's initial value.)

- [ ] **Step 2: Run it** — `(cd packages/client && npx vitest run src/components/__tests__/AppShell.test.tsx)`. Expected: FAIL.
- [ ] **Step 3: `uiStore`.**

```ts
/** Delve UI: Settings → Text size (`alloy:delve:textSize`), 'small' unless saved. */
export function loadTextSize(): TextSize {
  try {
    const v = localStorage.getItem('alloy:delve:textSize');
    return v === 'medium' || v === 'large' ? v : 'small';
  } catch {
    return 'small';
  }
}
```

  Fields: `menuScale: number` ("Delve UI: the menus' zoom, `--ui-scale` (the UI scale × Text size: `menuScaleFor`), mirrored here by AppShell. Not persisted."), `textSize: TextSize`; `setUiScale(ui, menu = ui)` sets both; `setTextSize(size)` persists and sets. Import `TextSize` as a type from the kit (`import type`, so no cycle). Initial `menuScale: 1`.

- [ ] **Step 4: AppShell.**

```tsx
  const hudSetting = useUIStore((s) => s.hudScale);
  const textSize = useUIStore((s) => s.textSize);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const ui = uiScaleFor(window.innerWidth, window.innerHeight);
      const menu = menuScaleFor(window.innerWidth, window.innerHeight, TEXT_SIZES[textSize]);
      root.style.setProperty('--ui-scale', String(menu));
      root.style.setProperty('--hud-scale', String(hudScaleFor(ui, hudSetting)));
      useUIStore.getState().setUiScale(ui, menu);
    };
    …
  }, [hudSetting, textSize]);
```

  Update the doc comment ("the Delve UI's zooms set on :root: the menus' at the UI scale × Text size, the HUD's at the UI scale × HUD scale").

- [ ] **Step 5: The readers.** `contextZoom`: `context === 'hud' ? hudZoom(uiScale, hudScale) : menuScale`. `useUiScale`: `{ ui: menuScale, hud: hudScaleFor(uiScale, setting) }` (its doc: "the zooms `.delve-zoom` and `.delve-hud-zoom` apply"). `PixelSprite`: its `ui` reads `s.menuScale` for the ui context (the hud context keeps `hudZoom(uiScale, hudScale)`). `grep -rn "s.uiScale\|uiScale }" packages/client/src --include=*.tsx --include=*.ts` must then show only the HUD's base and AppShell.
- [ ] **Step 6: The tests that drive the ui context by `uiScale`.** They set the store directly (`useUIStore.setState({ uiScale: 1.5 })`) and expect the ui context's zoom to follow: set `menuScale` alongside (`{ uiScale: 1.5, menuScale: 1.5 }`) in
  - `PixelSprite.test.tsx` › "snaps to whole device pixels under the zoom of its context" (two `setState`s; the hud expectations are unchanged because `uiScale` still drives them),
  - `Tooltip.test.tsx` › "places the card from the trigger box divided by the zoom it renders under" (and its `beforeEach` reset: `{ uiScale: 1, menuScale: 1, hudScale: 1 }`),
  - `zoom.test.ts` › "reads the zoom an element sits under from its layer class" (and its `beforeEach`),
  - `prompts.test.ts` › "useUiScale reads the mirrored UI scale and the HUD setting": `setUiScale(1.25)` sets both (the default `menu = ui`), so it passes unchanged; check.
- [ ] **Step 7: Run them** — `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/components/__tests__/AppShell.test.tsx src/features/delve/kit)`. Expected: PASS.
- [ ] **Step 8: Commit**

```bash
git add packages/client/src/stores/uiStore.ts packages/client/src/components packages/client/src/features/delve/kit
git commit -m "feat(client): Text size zooms the menus (--ui-scale at the UI scale × Text size, capped); the HUD keeps the plain UI scale"
```

  Before it: `(cd packages/client && npx vitest related --run src/stores/uiStore.ts src/components/AppShell.tsx src/features/delve/kit/zoom.ts src/features/delve/kit/prompts.ts src/features/delve/kit/PixelSprite.tsx)`.

---

### Task 3: Settings → Text size

**Files:**
- Modify: `packages/client/src/features/delve/hub/SettingsPanel.tsx`
- Test: `packages/client/src/features/delve/hub/__tests__/SettingsPanel.test.tsx`

- [ ] **Step 1: Write the failing test** (its `afterEach` resets `setTextSize('small')` and removes the key):

```tsx
  it('Display holds Text size: Small, Medium, Large, saved for this device; a window too small for it says so', () => {
    Object.assign(window, { innerWidth: 1920, innerHeight: 1080 });
    render(<SettingsPanel onClose={() => {}} />);
    expect(screen.getByTestId('text-size-small')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('text-size-large'));
    expect(useUIStore.getState().textSize).toBe('large');
    expect(screen.getByTestId('text-size-large')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByTestId('text-size-capped')).toBeNull();
    cleanup();
    Object.assign(window, { innerWidth: 1280, innerHeight: 800 });
    render(<SettingsPanel onClose={() => {}} />);
    expect(screen.getByTestId('text-size-capped')).toHaveTextContent(
      'This window shows Large at 115%: the screens can grow no further here.',
    );
    fireEvent.click(screen.getByTestId('text-size-medium'));
    expect(screen.queryByTestId('text-size-capped')).toBeNull();
  });
```

- [ ] **Step 2: Run it** — Expected: FAIL.
- [ ] **Step 3: The row,** first in Display (before HUD scale):

```tsx
          <Segmented
            aria-label="Text size"
            columns={3}
            value={ui.textSize}
            onChange={(size) => ui.setTextSize(size)}
            options={TEXT_SIZE_OPTIONS}
          />
          {capped && (
            <p className="k-note" data-testid="text-size-capped">
              This window shows {TEXT_SIZE_LABEL[ui.textSize]} at {capped}%: the screens can grow no
              further here.
            </p>
          )}
```

  with, at module scope, `TEXT_SIZE_OPTIONS` (`{ id, label: 'Small · 100%' | 'Medium · 115%' | 'Large · 130%', testId: 'text-size-<id>' }`) and `TEXT_SIZE_LABEL`, and in the component:

```ts
  // What this window gives the chosen size: under its full percentage, the cap (menuScaleFor).
  const ui0 = uiScaleFor(window.innerWidth, window.innerHeight);
  const shown = Math.round((menuScaleFor(window.innerWidth, window.innerHeight, TEXT_SIZES[ui.textSize]) / ui0) * 100);
  const capped = shown < Math.round(TEXT_SIZES[ui.textSize] * 100) - 1 ? shown : null;
```

  At 1280×800 Large: 0.86 / 0.75 = 114.7% → 115; full is 130: capped, "at 115%". Medium: 0.86 / 0.75 → 115 against 115 (within the 1 point the floor costs): not capped. Give the `Segmented` a heading line the way the sliders have their label (a `span` "Text size" left of it, as `Slider` lays out), so the row reads the same as its neighbours.

- [ ] **Step 4: Run it** — Expected: PASS. Also run the whole `SettingsPanel.test.tsx`.
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub
git commit -m "feat(client): Settings → Text size: Small, Medium, Large, and a line when the window caps it"
```

---

### Task 4: the probes at Large and Medium

**Files:**
- Modify: `packages/client/e2e/responsive/viewports.ts`
- Modify: `packages/client/e2e/responsive/specs/delve-anvil.spec.ts`, `delve-pause.spec.ts`, `delve-stop.spec.ts`, `delve-dive.spec.ts`, `delve-training.spec.ts`, `title-screen.spec.ts`

- [ ] **Step 1: The views.** In `viewports.ts`:

```ts
/** Settings → Text size, for the views that carry one (seeded before the page loads). */
export type TextSizeName = 'medium' | 'large';

export interface Viewport {
  name: string;
  width: number;
  height: number;
  device: DeviceTag;
  /** The Delve's Text size for this run (none: Small). */
  text?: TextSizeName;
}

/**
 * The text-size runs (the pad-first spec, 6): every Delve screen holds Large at 1920×1080 and
 * Medium at 1280×800 (where Large is capped to Medium's zoom, so it is the same run).
 */
export const TEXT_VIEWPORTS: readonly Viewport[] = [
  { name: 'fhd-large', width: 1920, height: 1080, device: 'desktop', text: 'large' },
  { name: 'deck-medium', width: 1280, height: 800, device: 'desktop', text: 'medium' },
] as const;

/** Set `vp`'s text size before the page loads. Call after `seedProfile`, whose init script clears storage first. */
export async function textSizeFor(page: Page, vp: Viewport): Promise<void> {
  if (vp.text) await page.addInitScript((t) => localStorage.setItem('alloy:delve:textSize', t), vp.text);
}
```

  (`import type { Page } from '@playwright/test'`.) Init scripts run in the order they were added, and `seedProfile`'s clears storage once a session, so `textSizeFor` must come after it.

- [ ] **Step 2: Each spec loops over both.** In each Delve responsive spec and the title screen's: `for (const vp of [...PC_VIEWPORTS, ...TEXT_VIEWPORTS])`, and after its `seedProfile` (or, on the title screen, before `goto`) `await textSizeFor(page, vp);`. The test titles carry `vp.name`, so the new runs read "… @ fhd-large (1920×1080)". `delve-stop.spec.ts` plays a bot floor per run: two more runs.
- [ ] **Step 3: Commit** (the runs fail until Task 5; commit them anyway: Task 5's commits fix what they find)

```bash
git add packages/client/e2e/responsive
git commit -m "test(client): the responsive probes run every Delve screen at Large on 1920×1080 and Medium on 1280×800"
```

---

### Task 5: what Large breaks at 1920×1080, fixed

**Files:**
- Modify: the layouts the probes flag

- [ ] **Step 1: Run only the text-size views** (long: in the background):

```bash
(cd packages/client && npx playwright test --project=responsive e2e/responsive/specs -g "fhd-large|deck-medium" --reporter=line > "$SCRATCH/resp-text.txt" 2>&1; tail -n 60 "$SCRATCH/resp-text.txt")
```

  Read each failure's probe and selector. Expected kinds, in a 1477 × 831 design box:
  - `overflow-x` in the hub's header (the five tabs, the purse and Power side by side): the header's subtitle already gives way (`.k-header-title .k-caption`'s ellipsis); next let the purse's chips wrap under each other, then drop the purse's labels to their glyphs (`Price` draws a glyph and a number: keep the number). Never shrink the tabs' text.
  - `overflow-x` in a three-pane tab (Loadout's `430px minmax(0, 1fr) 470px`, the Forge benches' columns, Quests): turn the fixed side columns into `minmax(<80% of it>px, <it>px)` so the middle keeps at least what it has at 1280×720 today; if the middle then falls under its content's least width, let its content wrap (a tile grid's `repeat(auto-fill, …)`), never scroll a hub pane sideways.
  - `overflow-y` in a pane that doesn't scroll (a fixed stack in the footer or header, a dialog without `k-scroll` on its body): give the pane's list `k-scroll` and `data-pad-scroll` (as the Skills editor's pane has) so the right stick scrolls it; the kit `Dialog`'s body already scrolls (check `surfaces.tsx`), so a dialog's overflow is its width (`width` prop) against 1477: cap it with `min(width, 92vw / zoom)`'s design equivalent, `maxWidth: 'calc(100% - 64px)'` on the plate.
  - `min-size` text under 12 CSS px: impossible at a zoom above 0.75 once plan 01 holds; a target under 24 px likewise. If one shows, it is an inline `zoom` or `transform: scale` inside a screen: find it.
  - The footer's prompts and its one button at 1477 wide: `.k-promptbar` wraps (`flex-wrap`), and the 76 px footer row holds two lines of 16 px prompts (2 × 32 + 6). If a third line appears (the Skills tab's footer, with its Apply bar), shorten the Apply bar's label to its price before the prompts lose a line.
- [ ] **Step 2: Fix and rerun one spec at a time** (`-g "<the test's title>"`), committing a fix a screen:

```bash
git commit -m "style(client): the <screen> holds Large text at 1920×1080: <what changed>"
```

- [ ] **Step 3: Today's sizes still hold.** After the fixes, the PC viewports again (a column made flexible must not have moved a 1280×720 layout):

```bash
(cd packages/client && npx playwright test --project=responsive e2e/responsive/specs --reporter=line > "$SCRATCH/resp-02.txt" 2>&1; tail -n 40 "$SCRATCH/resp-02.txt")
```

  Expected: PASS everywhere; the known flake (`delve-stop` at qhd-1440p and ultrawide) alone once.

  If a screen cannot hold the 1477 × 831 box without a reflow the design doesn't have (stop and measure before deciding this: the fixes above cover the layouts as they stand at v0.68.0), raise `MENU_MIN` to the least box it holds and lower Large's cap with it (the unit test's `1.3` at 1920×1080 becomes the new cap, and the spec edit says Large is that at 1080p); report it, never leave a probe failing.

---

### Task 6: the plan's run

- [ ] **Step 1: The plan's specs** (plan 01's too, if the same agent skipped its run):

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run > "$SCRATCH/unit-02.txt" 2>&1; tail -n 15 "$SCRATCH/unit-02.txt")
(cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-pad-nav.spec.ts e2e/delve-type.spec.ts --project=desktop --project=desktop-1080 --reporter=line > "$SCRATCH/e2e-02.txt" 2>&1; tail -n 30 "$SCRATCH/e2e-02.txt")
```

  With plan 01's run folded in, add `e2e/delve-hud.spec.ts e2e/delve-quests.spec.ts e2e/delve-runes.spec.ts e2e/delve-training.spec.ts` to the list.

  Expected: the unit suite at the baseline plus this plan's tests, all passing; the specs PASS on both projects (D09 opens Settings; the pad audit runs because Task 5's fixes moved layouts: `ALLOW` and `CEILING` must not rise. Settings has `ALLOW.settings = [0, 0]` and no ceiling: the Text size row adds three stops; if it adds an unreversed move, read it with `NAV_REPORT=1` and lay the row out as the Colorblind row is (a full-width `Segmented`), which holds 0 today). The responsive project ran in Task 5. Known flakes: D02 alone once.

- [ ] **Step 2: Commit** whatever the run fixed:

```bash
git commit -m "test(client): Text size's runs green"
```
