# Delve UI v1 · Phase 3a · 3C: Arena core and renderer — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dive camera zoomed out to a whole number of render pixels per sprite pixel at a 27-unit view (`camera.ts`: `ARENA_VIEW_UNITS`, `spritePixelScale`), tunable from 20 to 30 units in Settings → Display → View distance; the camera centred in the clear rectangle the HUD's four insets leave, clamped on that rectangle and placed on whole render pixels; the drops' names as rarity plaques (rare and up, runes and upgrades always; every drop while Alt or L3 is held); the snapshot's `buffs` and `map`; the new `labels` (Alt / L3, a hold) and `journal` (J / View, a press) actions with the default dedupe; `aim-gestures.ts` becoming `aim.ts`; the joystick leaving `ArenaControls`.

**Architecture:** `arena/camera.ts` holds the zoom rule and the `Insets` type. `ArenaRenderer` takes `setInsets(Insets)`, `viewRect()`, `setLabelsHeld(held)` and `setUpgradeTest(isUpgrade)`; its `resize()` reads `uiStore.arenaViewUnits`, and `useArenaCore` re-runs it when View distance changes. `snapshot(world, renderer)` adds `buffs: HudBuff[]` and `map: HudMap` (both exported from `useArenaCore.ts`, re-exported from `useArena.ts`). The keyboard's labels hold lives on `ArenaInput.labels`; the frame loop hands `input.labels || pad.labels` to the renderer once a frame, and the pad's View and the J key press the topmost scope's `[data-pad-journal]`. No engine change, no store change (`uiStore.arenaViewUnits` landed in Phase 1).

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, PixiJS 8, Vitest 3 (jsdom, Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md`: "Phase 3 → 3a" → "Arena core and renderer", "The zoom (decided in the spec; revision)", "Parallel areas in 3a", "Sequencing in 3a", "E2E in 3a"; decided items 2, 3, 8, 9, 14, 22, 23 and 31; "The input map" (Journal, Show all loot labels). The overview is `00-overview.md` in this folder. Mockup: `Arena-HUD.dc.html` (the `.plaque` labels).

---

## Base

- **Starts from:** `ui/p3a` (cut from `ui/p2` after its review fixes, v0.55.0), in this area's worktree `C:/Projects/alloy-ui-3c` on branch `ui/p3a-3c` (`git worktree add ../alloy-ui-3c -b ui/p3a-3c ui/p3a`, with the overview's junctions: PowerShell `cmd /c mklink /J`, the client's `@alloy/engine` pointing at the worktree's own `packages/engine`). Every path below is relative to that worktree's root, `/c/Projects/alloy-ui-3c` in Git Bash.
- **Needs nothing merged first.** 3A and 3B run beside it. Task 10 alone runs later, on `ui/p3a` after 3A has merged (see "Sequencing").
- **Anchors:** every file this plan edits is one Phase 2's review fixes leave alone (they touch `hub/loadout`, `hub/skills`, `hub/forge`, `hub/codex`, `items/`, `ItemTile`, `kit.css`, `hero-stats.ts` and the gamepad E2E); `hub/SettingsPanel.tsx` and its test are unchanged since Phase 1.
- **Before Task 1:** build the engine once for the junction and measure the client:

```bash
cd /c/Projects/alloy-ui-3c
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the suite passes (at `320c087` it read **1097 tests in 139 files**). Call the measured counts **N tests in F files**. Tasks 1–9 end at **N + 21 tests in F + 2 files**; Task 10 (after 3A) takes the old aim test away (−3 tests, −1 file).

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/arena/camera.ts` (new) | `Insets`, `ARENA_VIEW_UNITS`, `spritePixelScale` (the spec's code verbatim), `arenaResolution`, `arenaZoom` |
| `packages/client/src/features/delve/__tests__/camera.test.ts` (new) | the spec's table, the tie, the minimum, View distance, a ratio of 2 |
| `packages/client/src/features/delve/arena/aim.ts` (new) | `TAP_MS`, `classifyPress`, `AimMarker`, `aimMarkerFor` from `aim-gestures.ts` (decided item 8; `classifyPress` loses its drag argument with `DRAG_PX`) |
| `packages/client/src/features/delve/__tests__/aim.test.ts` (new) | `aim-gestures.test.ts` without the `isOverButton` case |
| `packages/client/src/features/delve/arena/aim-gestures.ts`, `__tests__/aim-gestures.test.ts` | **Deleted** in Task 10, after 3A (its `ArenaHud.tsx` imports them until then) |
| `packages/client/src/features/delve/arena/input.ts` | imports `aim.ts`; `ArenaInput.labels` (Alt held: default prevented, let go on keyup and window blur) and `moved`; `pressJournal`; J presses the journal |
| `packages/client/src/features/delve/arena/fx/draw-world.ts` | the `AimMarker` import only |
| `packages/client/src/features/controls/controls.ts` | `labels` (AltLeft / `ls`) and `journal` (KeyJ / `view`) in `CONTROL_ACTIONS`; `parseControls`' default dedupe (decided item 23) |
| `packages/client/src/features/controls/__tests__/controls.test.ts` | the new defaults and the dedupe |
| `packages/client/src/features/gamepad/arena-pad.ts` | `ArenaPadActions.labels` (L3 held) and `journal` (View pressed) |
| `packages/client/src/features/delve/arena/ArenaRenderer.ts` | the zoom from `camera.ts` and View distance; `setInsets(Insets)`, `viewRect()`; the clear-rectangle centre and clamp; whole render pixels; reduced motion; loot plaques (`dropPlaque`, `stackPlaques`, `setLabelsHeld`, `setUpgradeTest`) |
| `packages/client/src/features/delve/arena/useArenaCore.ts` | `insets: Insets`; `HudBuff`, `HudMap`, `snapshot(world, renderer)` with `buffs` and `map`; View distance re-zooms; labels, journal, the upgrade test, the font load, the dev-only zoom check; imports `aim.ts` |
| `packages/client/src/features/delve/arena/useArena.ts` | `isUpgrade` (`compareItem` as it comes); re-exports the new types; insets (transitional until Task 10) |
| `packages/client/src/features/delve/training/useTrainingArena.ts` | insets (transitional until Task 10) |
| `packages/client/src/features/delve/arena/ArenaControls.tsx` | **Overwritten:** mouse only (the joystick branch, `STICK_RADIUS` and "Drag to move" go); a device-aware hint until the first move |
| `packages/client/src/features/delve/hub/SettingsPanel.tsx` | Display → View distance, 20 to 30, with "4 px per pixel · 27 units tall" (the spec gives Settings → View distance to 3C; no other 3a area touches the file) |
| `packages/client/src/features/delve/hub/__tests__/SettingsPanel.test.tsx` | the View distance slider |
| `packages/client/src/features/delve/__tests__/arena-input.test.ts` | the `aim.ts` import; labels, the journal, the pad's L3 and View, `moved`, the move hint |
| `packages/client/src/features/delve/__tests__/arena-renderer.test.ts` | the zoom, the round trip at each scale, the clear-rectangle centre and clamp, the view, the plaques (hold Alt, released on blur), the stacking |
| `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts` | `snapshot(w, null)`; `buffs` and `map` |

`uiStore.ts` is not edited: Phase 1 gave it `arenaViewUnits` (`alloy:delve:viewUnits`, default 27, clamped 20–30, `setArenaViewUnits`), which this plan reads.

## Cross-area needs

**X1 · 3A (`__tests__/ArenaHud.test.tsx`, the `hud()` fixture).** `ArenaHud` gains two required fields, so the fixture needs them:

```ts
    t: 10,
    buffs: [],
    map: {
      width: 26,
      height: 40,
      view: { left: 0, top: 0, right: 26, bottom: 40 },
      hero: { x: 13, y: 20 },
      foes: [],
      drops: [],
      terrain: [],
    },
    ...over,
```

On 3C's branch alone, from Task 7 the typecheck reports exactly this one error, in 3A's file: `src/features/delve/__tests__/ArenaHud.test.tsx(16,3): error TS2322 … Types of property 'buffs' are incompatible.` 3A's rewrite of that test (whose fixture follows the contract) removes it at merge. If the integrator wants 3C green on its own, add the lines above after `t: 10,` on 3C's branch and take 3A's side of that file at merge.

**X2 · 3A (`DelveRun.tsx`, `DelveTraining.tsx`, the HUD).** What the pages and the dock read from 3C:
1. `useArena(hostRef, { paused, insets, onUi, manualAttack })` and `useTrainingArena(…)` take `insets: Insets` (`HudGrid`'s `onInsets`, viewport px). Until Task 10 they also accept `{ top, bottom }` with the sides at 0, so today's pages keep working on 3C's branch.
2. `ArenaHud.buffs: HudBuff[]` (Riposte, Quick, the barrier, in that order, only while they last; `total` is `riposteWindow`, `lightningRodDuration` or null) for `BuffRow`; `riposte` and `barrier` stay on the snapshot.
3. `ArenaControls` keeps its props (`input`, `heroScreen`, `pixelsPerUnit`, `disabled`, `manualAttack`) and its `arena-controls` id; it now shows its own move hint (`move-hint`).
4. The J key and the pad's View click the topmost scope's `[data-pad-journal]` (the purse's Journal); Esc / the menu key and the pad's Menu click its `[data-pad-menu]` (the purse's Menu, "Dive menu") only while live, as today.
5. `useArenaCore` still imports `floatPay` from `./ArenaHud`; when 3A moves it to `arena/hud/`, the integrator changes that one import (the spec's sequencing).
6. Once 3A's slots cast with a click only, `arena.aim`, `arena.cancelHold`, `Aiming.onButton` and `ArenaInput.cancelHold` serve nothing; they are left in place (removing them is a follow-up, not 3a's).

**X3 · 3B (`Minimap`).** `HudMap` is exported from `arena/useArenaCore.ts` (and re-exported from `arena/useArena.ts`), as 3B asked. `snapshot` builds it fresh on every HUD refresh: world units, origin top-left, y down; `view` is `renderer.viewRect()` (the whole canvas, which grows with the zoom), or the whole arena with no renderer; `foes[].rank` is the monster's kind (`'normal' | 'elite' | 'boss'`, Training's dummies included); `drops` are items in `RARITY_COLOR` and runes in their family's `FAMILY_STYLE` colour (orbs, motes and scrap are left out); `terrain` is `[]`.

**X4 · The integrator.**
1. Task 10 after 3A merges.
2. The E2E check that the arena host has no zoomed ancestor (the spec's E2E list), for example in D01 once the arena shows:

```ts
    const zoomed = await page.getByTestId('arena').evaluate((host) => {
      for (let p = host.parentElement; p; p = p.parentElement) {
        const z = getComputedStyle(p).zoom;
        if (z && z !== 'normal' && parseFloat(z) !== 1) return true;
      }
      return false;
    });
    expect(zoomed).toBe(false);
```

3. The bump to 0.56.0 is the integrator's.

## Where the spec left room

- **Where the types live.** `Insets` is in `arena/camera.ts`; `HudBuff` and `HudMap` are in `arena/useArenaCore.ts` beside `ArenaHud`, which also re-exports `Insets`; `arena/useArena.ts` re-exports all three. Importers can take them from either hook module.
- **`classifyPress`** keeps the name but loses its drag argument: with `DRAG_PX` gone (decided item 8) a press is a tap when it is shorter than `TAP_MS`. Its one caller already passed 0.
- **The upgrade test** is `compareItem(equipped, item, registry, depth, pair, 'asIs').powerPct > UPGRADE_EPSILON`: ▲ means better as it comes everywhere else (the bag, the loot tray, the Found log), so the plaque reads the same value. Training sets none, so its drops never show ▲.
- **Buff totals:** Riposte's is `dodge.riposteWindow` and Quick's `reactions.lightningRodDuration`; the barrier's is null, since Obsidian and the Guard rune give it different lengths and the engine keeps only `until`.
- **One labels hold a frame.** The keyboard's hold (`ArenaInput.labels`) and the pad's L3 meet in the frame loop (`renderer.setLabelsHeld(input.labels || pad?.labels)`), so a connected pad never cancels a held Alt. The L3 hold ends on release, when the pad disconnects (no pad state) and while paused (no pad frame).
- **"Every drop"** is every item and rune drop; orbs, motes and scrap never get a plaque. The stacking pass runs whenever plaques show, not only under Alt: it changes nothing until two overlap, and two rare drops side by side should not overlap either.
- **Plaques:** text in `RARITY_TEXT` (epic in `#d7a6e8`, decided item 13) or the rune family's colour, on `rgba(10,10,16,.86)` with a 1 px border of its colour at 55%, padding 3 × 9 and letter-spacing .05em, all times the HUD's zoom (`contextZoom('hud')`), read when the drop's view is made; a HUD-scale change mid-floor reaches new drops. A rune's plaque drops its emoji ("Split II").
- **The font:** `useArenaCore` waits for `document.fonts.load('14px "Jersey 10"')` with the sprites, before the renderer exists (decided item 9).
- **The move hint** reads "WASD or hold click to move", "WASD to move · hold click to attack" (manual) or "Left stick to move" (the pad holds the input lock), and goes on the first frame any device moves the hero (`frameInput` sets `input.moved`; the page re-renders with the HUD). The autopilot's moves don't count.
- **View distance's readout** is the scale in render pixels for this window (`innerHeight × min(2, devicePixelRatio)`): "4 px per pixel · 27 units tall" at 1080p, "8 px per pixel · 27 units tall" at 200%. It reads the window when Settings renders.
- **Reduced motion** is read once, when the renderer is made: `addShake` and the strike kick do nothing under it (decided item 14); hit-stop and the perfect dodge's slow motion stay.
- **The insets until 3A merges.** `useArena` and `useTrainingArena` take `Pick<Insets, 'top' | 'bottom'> & Partial<Insets>` and fill the sides with 0, so today's pages type-check and run on 3C's branch; Task 10 tightens both to `Insets`.
- **The pixel floor's ripple** (measured on a scratch copy, see Verification): at 1080p a busy depth-10 floor paints in 3.3–3.5 ms instead of 2.6–2.7 ms (+28%), far under the 8 ms line, so the off-centre rows stay as they are.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `ui/p3a-3c` (Task 10 on `ui/p3a`, after 3A merges), staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-ui-3c`.
- **Line endings:** a fresh worktree checks these files out CRLF; keep each file's own (the Edit tool does). New files are written LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** every file the commit blocks format passed `npx prettier --check --end-of-line auto` at the base or is new, and the code below is already formatted (checked on the scratch copy), so `--write` changes nothing typed as written. `stores/uiStore.ts` is not clean at the base; this plan never edits it.
- **How the edits read** (the 4a plan's language): "Replace: A with: B" is one Edit (old A, new B). "Replace every `A` with `B`" is one Edit with `replace_all`. "Create `f`:" and "Overwrite `f`:" are a Write. "Delete `f`" is `git rm`. Every anchor is unique in its file at that point; apply each file's edits top to bottom.
- **Checked on a scratch copy:** `ui/p2` at `320c087` (`git archive`, junctions to the main tree's `node_modules`, the engine built once). This file's edits were applied task by task by a script that checks each anchor once in its file; every FAIL and PASS below was run; the typecheck and every committed file's format were checked after each task (1097 → 1118 tests, 139 → 141 files). The Delve E2E (`delve`, `delve-runes`, `delve-gamepad`, `delve-training` on `desktop`: 26 tests) passed with Tasks 1–9's source on `895fb0a` and today's pages. Task 10's anchors were checked on the Task 9 tree.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Engine bundle (once) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| E2E | `(cd packages/client && npx playwright test -c playwright.scratch.config.ts --project=desktop e2e/delve.spec.ts e2e/delve-runes.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)` (the overview's scratch config) |

## Chunk 1: The zoom rule, aim, the controls and the inputs

### Task 1: `camera.ts`: the zoom rule

The spec's `spritePixelScale` verbatim, with the `Insets` type the HUD and the renderer share, the renderer's resolution rule and `arenaZoom` (the scale and the units it shows, for the renderer and View distance's readout).

**Files:**
- Create: `packages/client/src/features/delve/__tests__/camera.test.ts`
- Create: `packages/client/src/features/delve/arena/camera.ts`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/__tests__/camera.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ARENA_VIEW_UNITS, arenaZoom, spritePixelScale } from '../arena/camera';

describe('the dive zoom', () => {
  it("picks the spec's whole scale at each window height (device-pixel ratio 1)", () => {
    // [window height, px per sprite px, units tall]: the spec's table.
    const table: [number, number, number][] = [
      [720, 3, 24],
      [800, 3, 26.7], // the Deck
      [1024, 4, 25.6],
      [1080, 4, 27],
      [1200, 5, 24], // a tie with 4 (30.0 units): the larger scale
      [1440, 5, 28.8],
      [2160, 8, 27],
    ];
    for (const [h, scale, tall] of table) {
      expect(spritePixelScale(h), `${h}p`).toBe(scale);
      const zoom = arenaZoom(h, 1);
      expect(zoom.scale).toBe(scale);
      expect(zoom.unitsTall).toBeCloseTo(tall, 1);
    }
    expect(ARENA_VIEW_UNITS).toBe(27);
  });

  it('runs in render pixels: at a ratio of 2 the scale doubles and the view stays', () => {
    expect(spritePixelScale(2160)).toBe(8);
    expect(arenaZoom(1080, 2)).toEqual({ scale: 8, unitsTall: 27 });
  });

  it('never goes under 2, and follows View distance', () => {
    expect(spritePixelScale(300)).toBe(2);
    expect(spritePixelScale(100)).toBe(2);
    expect(spritePixelScale(1080, 20)).toBe(5); // 21.6 units
    expect(spritePixelScale(1080, 30)).toBe(4); // 27.0, nearer 30 than 36.0
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/camera.test.ts)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../arena/camera" from "src/features/delve/__tests__/camera.test.ts". Does the file exist?`

- [ ] **Step 3: The zoom rule**

Create `packages/client/src/features/delve/arena/camera.ts`:

```ts
import { SPRITE_PIXEL } from './sprites';

/**
 * The dive camera's zoom (Delve UI v1, decided item 2): a whole number of
 * render pixels per sprite pixel, so the sprites, the effect pixels and the
 * floor stay crisp, chosen from the window height alone.
 */

/** The screen the HUD covers on each side, in viewport px: the camera centres in what is left. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Arena units of window height the dive aims to show: 27 is the user's 1080p choice (4 px per sprite pixel). View distance sets 20–30. */
export const ARENA_VIEW_UNITS = 27;

/**
 * Render pixels per sprite pixel: the whole number whose view height (renderH × SPRITE_PIXEL / p units)
 * is nearest `viewUnits`, ties to the larger p, at least 2. `renderH` = screen height × the renderer's resolution.
 */
export function spritePixelScale(renderH: number, viewUnits = ARENA_VIEW_UNITS): number {
  const exact = (renderH * SPRITE_PIXEL) / viewUnits;
  const lo = Math.max(2, Math.floor(exact));
  const hi = Math.max(2, Math.ceil(exact));
  const off = (p: number) => Math.abs((renderH * SPRITE_PIXEL) / p - viewUnits);
  return off(lo) < off(hi) ? lo : hi;
}

/** The arena renderer's resolution: the device-pixel ratio, at most 2. */
export function arenaResolution(): number {
  return Math.min(2, window.devicePixelRatio || 1);
}

/** The zoom at a screen height (CSS px) and resolution: its sprite-pixel scale and the units it shows. */
export function arenaZoom(
  height: number,
  resolution: number,
  viewUnits = ARENA_VIEW_UNITS,
): { scale: number; unitsTall: number } {
  const scale = spritePixelScale(height * resolution, viewUnits);
  return { scale, unitsTall: (height * resolution * SPRITE_PIXEL) / scale };
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/camera.test.ts)`
Expected: PASS (3 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 3 tests in F + 1 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/camera.test.ts src/features/delve/arena/camera.ts)
git add packages/client/src/features/delve/__tests__/camera.test.ts packages/client/src/features/delve/arena/camera.ts
git commit -m "feat(client): camera.ts: the dive's whole-pixel zoom, nearest 27 units tall" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: `aim.ts` from `aim-gestures.ts`

Decided item 8: `classifyPress`, `TAP_MS`, `aimMarkerFor` and `AimMarker` move to `arena/aim.ts`, and its importers follow (`input.ts`, `useArenaCore.ts`, `fx/draw-world.ts`, `arena-input.test.ts`). `DRAG_PX` and `isOverButton` stay behind in `aim-gestures.ts`, which 3A's `ArenaHud.tsx` imports until its rewrite merges; Task 10 deletes it.

**Files:**
- Create: `packages/client/src/features/delve/__tests__/aim.test.ts`
- Create: `packages/client/src/features/delve/arena/aim.ts`
- Modify: `packages/client/src/features/delve/arena/input.ts`, `arena/useArenaCore.ts`, `arena/fx/draw-world.ts`, `__tests__/arena-input.test.ts`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/__tests__/aim.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TAP_MS, aimMarkerFor, classifyPress } from '../arena/aim';

describe('aim', () => {
  it('a quick press is a tap; a long one aims', () => {
    expect(classifyPress(80)).toBe('tap');
    expect(classifyPress(TAP_MS - 1)).toBe('tap');
    expect(classifyPress(TAP_MS)).toBe('aim');
    expect(classifyPress(400)).toBe('aim');
  });

  it('placed forms show a circle, directional ones a line, self-centred ones nothing', () => {
    expect(aimMarkerFor('burst')).toBe('circle');
    expect(aimMarkerFor('maelstrom')).toBe('circle');
    expect(aimMarkerFor('bolt')).toBe('line');
    expect(aimMarkerFor('blink')).toBe('line');
    expect(aimMarkerFor('nova')).toBe('none');
    expect(aimMarkerFor('ward')).toBe('none');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/aim.test.ts)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../arena/aim" from "src/features/delve/__tests__/aim.test.ts". Does the file exist?`

- [ ] **Step 3: `aim.ts`, and its importers**

Create `packages/client/src/features/delve/arena/aim.ts`:

```ts
import type { FormId } from '@alloy/engine';

/** A press shorter than this is a tap: the ability auto-aims. */
export const TAP_MS = 150;

export function classifyPress(durationMs: number): 'tap' | 'aim' {
  return durationMs < TAP_MS ? 'tap' : 'aim';
}

export type AimMarker = 'circle' | 'line' | 'none';

const PLACED: FormId[] = ['burst', 'barrage', 'maelstrom'];
const DIRECTIONAL: FormId[] = ['bolt', 'volley', 'lance', 'strike', 'blink'];

/** What the arena shows while aiming: a circle where it lands, or a line where it goes. */
export function aimMarkerFor(form: FormId): AimMarker {
  if (PLACED.includes(form)) return 'circle';
  if (DIRECTIONAL.includes(form)) return 'line';
  return 'none';
}
```

In `packages/client/src/features/delve/arena/input.ts`:

Replace:

```ts
import { aimMarkerFor, classifyPress } from './aim-gestures';
```

with:

```ts
import { aimMarkerFor, classifyPress } from './aim';
```

Replace:

```ts
    const tap = classifyPress(performance.now() - a.since, 0) === 'tap' || !input.mouse;
```

with:

```ts
    const tap = classifyPress(performance.now() - a.since) === 'tap' || !input.mouse;
```

In `packages/client/src/features/delve/arena/useArenaCore.ts`:

Replace:

```ts
import { TAP_MS, aimMarkerFor } from './aim-gestures';
```

with:

```ts
import { TAP_MS, aimMarkerFor } from './aim';
```

In `packages/client/src/features/delve/arena/fx/draw-world.ts`:

Replace:

```ts
import type { AimMarker } from '../aim-gestures';
```

with:

```ts
import type { AimMarker } from '../aim';
```

In `packages/client/src/features/delve/__tests__/arena-input.test.ts`:

Replace:

```ts
import { TAP_MS } from '../arena/aim-gestures';
```

with:

```ts
import { TAP_MS } from '../arena/aim';
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/aim.test.ts src/features/delve/__tests__/arena-input.test.ts)`
Expected: PASS (2 tests in `aim.test.ts`; `arena-input.test.ts` unchanged).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 5 tests in F + 2 files pass. `grep -rn "aim-gestures" packages/client/src` lists only `arena/ArenaHud.tsx` and `__tests__/aim-gestures.test.ts`.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/aim.test.ts src/features/delve/arena/aim.ts src/features/delve/arena/input.ts src/features/delve/arena/useArenaCore.ts src/features/delve/arena/fx/draw-world.ts src/features/delve/__tests__/arena-input.test.ts)
git add packages/client/src/features/delve/__tests__/aim.test.ts packages/client/src/features/delve/arena/aim.ts packages/client/src/features/delve/arena/input.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/fx/draw-world.ts packages/client/src/features/delve/__tests__/arena-input.test.ts
git commit -m "refactor(client): aim.ts takes press classification and the aim markers from aim-gestures.ts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: The `labels` and `journal` actions, and the default dedupe

Decided item 23: `labels` (AltLeft, L3) and `journal` (KeyJ, View) join `CONTROL_ACTIONS` (so the Controls editor lists them), and `parseControls` fills an action missing from a saved setup with its default unless that setup already uses the default for another action: then the new action starts unbound.

**Files:**
- Modify: `packages/client/src/features/controls/__tests__/controls.test.ts`
- Modify: `packages/client/src/features/controls/controls.ts`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/controls/__tests__/controls.test.ts`:

Replace:

```ts
  it('exports text that parses back to the same setup', () => {
```

with:

```ts
  it('shows every loot label on hold Alt / L3 and opens the journal on J / View', () => {
    expect(DEFAULT_CONTROLS.keys).toMatchObject({ labels: 'AltLeft', journal: 'KeyJ' });
    expect(DEFAULT_CONTROLS.pad).toMatchObject({ labels: 'ls', journal: 'view' });
  });

  it("a saved setup gains a new action's default, unless it already uses it: then unbound", () => {
    const { labels: _l, journal: _j, ...pad } = { ...DEFAULT_CONTROLS.pad, primary: 'view' };
    const { labels: _k, journal: _m, ...keys } = { ...DEFAULT_CONTROLS.keys, primary: 'AltLeft' };
    const c = parseControls({ ...DEFAULT_CONTROLS, pad, keys });
    expect(c.pad).toMatchObject({ primary: 'view', labels: 'ls', journal: null });
    expect(c.keys).toMatchObject({ primary: 'AltLeft', labels: null, journal: 'KeyJ' });
    // An action saved unbound stays so, and a setup without them gains both.
    expect(parseControls({ pad: { journal: null } }).pad.journal).toBeNull();
    expect(parseControls({}).keys).toMatchObject({ labels: 'AltLeft', journal: 'KeyJ' });
  });

  it('exports text that parses back to the same setup', () => {
```


- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/controls/__tests__/controls.test.ts)`
Expected: FAIL, 2 failed (7 tests): `AssertionError: expected { primary: 'KeyQ', …(10) } to match object { labels: 'AltLeft', journal: 'KeyJ' }` and `AssertionError: expected { primary: 'view', …(6) } to match object { primary: 'view', labels: 'ls', …(1) }`.

- [ ] **Step 3: The actions and the dedupe**

In `packages/client/src/features/controls/controls.ts`:

Replace:

```ts
  'potion',
  'menu',
] as const;
```

with:

```ts
  'potion',
  'menu',
  'labels',
  'journal',
] as const;
```

Replace:

```ts
    menu: 'menu',
  },
```

with:

```ts
    menu: 'menu',
    labels: 'ls',
    journal: 'view',
  },
```

Replace:

```ts
    menu: 'Escape',

```

with:

```ts
    menu: 'Escape',
    labels: 'AltLeft',
    journal: 'KeyJ',

```

Replace:

```ts
  menu: 'Menu',
  up: 'Move up',
```

with:

```ts
  menu: 'Menu',
  labels: 'Show all loot labels (hold)',
  journal: 'Journal',
  up: 'Move up',
```

Replace:

```ts
/** Read a saved or pasted setup: valid fields are kept, anything else falls back to the default. */
```

with:

```ts
/**
 * The saved bindings, an action missing from them (or invalid) filled with its default, unless
 * the saved setup already uses that default for another action: then it starts unbound, so a
 * new action never lands on a button or key the player uses (decided item 23).
 */
function withDefaults<A extends string, V>(
  actions: readonly A[],
  saved: (a: A) => V | null | undefined,
  defaults: Record<A, V | null>,
): Record<A, V | null> {
  const given = actions.map((a) => [a, saved(a)] as const);
  const used = new Set(given.map(([, v]) => v));
  return Object.fromEntries(
    given.map(([a, v]) => [a, v !== undefined ? v : used.has(defaults[a]) ? null : defaults[a]]),
  ) as Record<A, V | null>;
}

/** Read a saved or pasted setup: valid fields are kept, anything else falls back to the default. */
```

Replace:

```ts
  const padButton = (v: unknown, fallback: PadButton | null) =>
    v === null || (typeof v === 'string' && (PAD_BUTTONS as readonly string[]).includes(v))
      ? (v as PadButton | null)
      : fallback;
  const keyCode = (v: unknown, fallback: string | null) =>
    v === null || (typeof v === 'string' && v.length > 0 && v.length < 32)
      ? (v as string | null)
      : fallback;
  return {
    version: 1,
    pad: Object.fromEntries(
      CONTROL_ACTIONS.map((a) => [a, padButton(pad[a], d.pad[a])]),
    ) as ControlsConfig['pad'],
    keys: Object.fromEntries(
      [...CONTROL_ACTIONS, ...MOVE_KEYS].map((a) => [a, keyCode(keys[a], d.keys[a])]),
    ) as ControlsConfig['keys'],
```

with:

```ts
  const padButton = (v: unknown) =>
    v === null || (typeof v === 'string' && (PAD_BUTTONS as readonly string[]).includes(v))
      ? (v as PadButton | null)
      : undefined;
  const keyCode = (v: unknown) =>
    v === null || (typeof v === 'string' && v.length > 0 && v.length < 32)
      ? (v as string | null)
      : undefined;
  return {
    version: 1,
    pad: withDefaults(CONTROL_ACTIONS, (a) => padButton(pad[a]), d.pad),
    keys: withDefaults([...CONTROL_ACTIONS, ...MOVE_KEYS], (a) => keyCode(keys[a]), d.keys),
```


- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/controls)`
Expected: PASS (`controls.test.ts` 7 tests; `ControlsPanel.test.tsx` unchanged, its table now with two more rows).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 7 tests in F + 2 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3c
(cd packages/client && npx prettier --write --end-of-line auto src/features/controls/__tests__/controls.test.ts src/features/controls/controls.ts)
git add packages/client/src/features/controls/__tests__/controls.test.ts packages/client/src/features/controls/controls.ts
git commit -m "feat(client): labels (Alt / L3) and journal (J / View) controls; a saved setup never gets a default it already uses" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: The labels hold, the journal press and the first move

`attachKeyboard` holds `labels` while Alt is down (its default prevented, so the browser's menu bar never takes the key) and lets go on its keyup or a window blur (an Alt+Tab never sends the keyup); J presses the topmost scope's `[data-pad-journal]` (`pressJournal`). `padToArena` reports L3 held and View pressed. `frameInput` marks `input.moved` on the first frame any device moves the hero (Task 8's hint).

**Files:**
- Modify: `packages/client/src/features/delve/__tests__/arena-input.test.ts`
- Modify: `packages/client/src/features/delve/arena/input.ts`
- Modify: `packages/client/src/features/gamepad/arena-pad.ts`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/arena-input.test.ts`:

Replace:

```ts
  holdingSlot,
  pressMenu,
} from '../arena/input';
```

with:

```ts
  holdingSlot,
  pressJournal,
  pressMenu,
} from '../arena/input';
```

Replace:

```ts
import { padMemory, type ArenaPadActions } from '@/features/gamepad/arena-pad';
```

with:

```ts
import { padMemory, padToArena, type ArenaPadActions } from '@/features/gamepad/arena-pad';
import { PAD_BUTTONS, type PadButton } from '@/features/gamepad/gamepad';
```

Replace:

```ts
const registry = getDelveRegistry();
/** A sandbox hero on Fire's default chains, the Primary `primary` if given. */
```

with:

```ts
describe('loot labels and the journal', () => {
  let detach = () => {};
  afterEach(() => {
    detach();
    document.body.replaceChildren();
  });

  it('Alt held shows every loot label, its default prevented; its keyup or a blur lets go', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const alt = new KeyboardEvent('keydown', { code: 'AltLeft', cancelable: true });
    window.dispatchEvent(alt);
    expect(alt.defaultPrevented).toBe(true);
    expect(input.labels).toBe(true);
    key('keyup', 'AltLeft');
    expect(input.labels).toBe(false);
    // Alt+Tab: the window loses focus and the keyup never comes.
    key('keydown', 'AltLeft');
    window.dispatchEvent(new Event('blur'));
    expect(input.labels).toBe(false);
  });

  it("J and the pad's View press the topmost scope's Journal", () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const journal = document.body.appendChild(document.createElement('button'));
    journal.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 });
    journal.setAttribute('data-pad-journal', '');
    let opened = 0;
    journal.addEventListener('click', () => opened++);
    key('keydown', 'KeyJ');
    expect(opened).toBe(1);
    pressJournal(); // useArenaCore's padFrame, on the pad's View
    expect(opened).toBe(2);
  });

  it('the pad reports L3 held as labels and a View press as the journal', () => {
    const state = (...held: PadButton[]) => ({
      left: { x: 0, y: 0 },
      right: { x: 0, y: 0 },
      buttons: Object.fromEntries(PAD_BUTTONS.map((b) => [b, held.includes(b)])) as Record<
        PadButton,
        boolean
      >,
    });
    expect(padToArena(state('ls'), new Set())).toMatchObject({ labels: true, journal: false });
    expect(padToArena(state('view'), new Set(['view']))).toMatchObject({
      labels: false,
      journal: true,
    });
  });
});

const registry = getDelveRegistry();
/** A sandbox hero on Fire's default chains, the Primary `primary` if given. */
```

Replace:

```ts
    attackTap: false,
    menu: false,
    ...over,
  });
```

with:

```ts
    attackTap: false,
    menu: false,
    labels: false,
    journal: false,
    ...over,
  });
```

Replace:

```ts
  it("the pad's button of a skill the weapon doesn't carry casts nothing", () => {
```

with:

```ts
  it('marks the first move by any device, for the move hint', () => {
    const w = world();
    const input = createArenaInput();
    const mem = padMemory();
    frameInput(registry, w, input, pad(), mem, opts);
    expect(input.moved).toBe(false);
    frameInput(registry, w, input, pad({ move: { x: 0, y: 1 } }), mem, opts);
    expect(input.moved).toBe(true);
  });

  it("the pad's button of a skill the weapon doesn't carry casts nothing", () => {
```


- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-input.test.ts)`
Expected: FAIL, 4 failed (28 tests): the Alt test's `AssertionError: expected false to be true`, the journal's `expected +0 to be 1`, the pad's `expected { move: { x: +0, y: +0 }, …(10) } to match object { labels: true, journal: false }` and the first move's `expected undefined to be false`.

- [ ] **Step 3: The keys and the pad**

In `packages/client/src/features/delve/arena/input.ts`:

Replace:

```ts
  /** The input lock as of the last frame (`frameInput`): a switch to or from the pad lets go of the other side. */
  device: InputDevice;
}
```

with:

```ts
  /** The input lock as of the last frame (`frameInput`): a switch to or from the pad lets go of the other side. */
  device: InputDevice;
  /** The labels key held (Alt): every drop's loot label shows. */
  labels: boolean;
  /** Any device has moved the hero (`frameInput`): the move hint goes. */
  moved: boolean;
}
```

Replace:

```ts
    device: 'keyboard',
  };
}
```

with:

```ts
    device: 'keyboard',
    labels: false,
    moved: false,
  };
}
```

Replace:

```ts
  const out = padLive ? padInput(registry, world, pad, mem, o) : keysInput(input, o);

```

with:

```ts
  const out = padLive ? padInput(registry, world, pad, mem, o) : keysInput(input, o);
  if (out.move.x !== 0 || out.move.y !== 0) input.moved = true;

```

Replace:

```ts
  scopedLast('[data-pad-menu]')?.click();
}

```

with:

```ts
  scopedLast('[data-pad-menu]')?.click();
}

/** The Journal, from its key or the pad's button: the topmost scope's `[data-pad-journal]`. */
export function pressJournal(): void {
  scopedLast('[data-pad-journal]')?.click();
}

```

Replace:

```ts
 * mouse (and charges a hold move) and releasing casts there. Returns a
 * cleanup function.
```

with:

```ts
 * mouse (and charges a hold move) and releasing casts there. The labels key
 * (Alt) is held: its default is prevented, and its keyup or a window blur
 * lets go (an Alt+Tab never sends the keyup). Returns a cleanup function.
```

Replace:

```ts
    const action = keyAction(e.code);
    if (!action || e.repeat) return;
```

with:

```ts
    const action = keyAction(e.code);
    if (action === 'labels') {
      input.labels = true;
      e.preventDefault();
      return;
    }
    if (!action || e.repeat) return;
```

Replace:

```ts
      input.attackAim = input.mouse;
    }
  };
```

with:

```ts
      input.attackAim = input.mouse;
    } else if (action === 'journal') {
      e.preventDefault();
      pressJournal();
    }
  };
```

Replace:

```ts
    if (action === 'attack') input.attackHeld = false;

```

with:

```ts
    if (action === 'attack') input.attackHeld = false;
    if (action === 'labels') {
      input.labels = false;
      e.preventDefault();
    }

```

Replace:

```ts
    input.aiming = null;
  };
  window.addEventListener('keydown', down);
```

with:

```ts
    input.aiming = null;
    input.labels = false;
  };
  window.addEventListener('keydown', down);
```

In `packages/client/src/features/gamepad/arena-pad.ts`:

Replace:

```ts
 * sticks: RT Primary, LT dodge, LB Defensive, R3 Ultimate, RB manual attack,
 * D-pad down potion).
```

with:

```ts
 * sticks: RT Primary, LT dodge, LB Defensive, R3 Ultimate, RB manual attack,
 * D-pad down potion, L3 held every loot label, View the journal).
```

Replace:

```ts
  attackTap: boolean;
  menu: boolean;
}
```

with:

```ts
  attackTap: boolean;
  menu: boolean;
  /** The labels button held (L3): every drop's loot label shows. */
  labels: boolean;
  /** The journal button pressed this frame (View). */
  journal: boolean;
}
```

Replace:

```ts
    menu: is(cfg.pad.menu, (b) => pressed.has(b)),

```

with:

```ts
    menu: is(cfg.pad.menu, (b) => pressed.has(b)),
    labels: is(cfg.pad.labels, (b) => state.buttons[b]),
    journal: is(cfg.pad.journal, (b) => pressed.has(b)),

```


- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-input.test.ts src/features/gamepad)`
Expected: PASS (`arena-input.test.ts` 28 tests; the gamepad tests unchanged).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 11 tests in F + 2 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/arena-input.test.ts src/features/delve/arena/input.ts src/features/gamepad/arena-pad.ts)
git add packages/client/src/features/delve/__tests__/arena-input.test.ts packages/client/src/features/delve/arena/input.ts packages/client/src/features/gamepad/arena-pad.ts
git commit -m "feat(client): Alt and L3 hold the loot labels (Alt lets go on blur), J and View press the journal" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The camera

### Task 5: The camera: the zoom, four insets, the clear rectangle and whole pixels

`resize()` sets `unit = spritePixelScale(height × resolution, uiStore.arenaViewUnits) / SPRITE_PIXEL / resolution` (rounded through the whole `scale × 10`, so 3 px is 30.0, not 30.000000000000004). `update()` centres the camera in the clear rectangle the four insets leave and clamps it on that rectangle's half extents, then rounds `root.position` to whole render pixels; `viewRect()` returns the frame's view. Reduced motion keeps the shake and the kick at 0. `useArenaCore` passes four insets, re-zooms when View distance changes and takes its resolution from `arenaResolution()`; `useArena` and `useTrainingArena` accept today's `{ top, bottom }` until Task 10.

The tests drive a real `ArenaRenderer` on a stand-in app (a `Container` stage, a no-op `render`, a screen size and a resolution): Pixi builds its scene graph in jsdom without a GPU.

**Files:**
- Modify: `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts`
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts`, `arena/useArena.ts`, `training/useTrainingArena.ts`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`:

Replace:

```ts
import { describe, it, expect } from 'vitest';
import type { Graphics } from 'pixi.js';
import type { ArpgEvent, ArpgWorld, Drop, GearItem } from '@alloy/engine';
import {
  drawDrop,
```

with:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { Container, type Application, type Graphics } from 'pixi.js';
import {
  computeHeroStats,
  createSandboxWorld,
  defaultChains,
  type ArpgEvent,
  type ArpgWorld,
  type Drop,
  type GearItem,
} from '@alloy/engine';
import {
  ArenaRenderer,
  drawDrop,
```

Replace:

```ts
import { getDelveRegistry } from '../registry';

```

with:

```ts
import { getDelveRegistry } from '../registry';
import { spritePixelScale } from '../arena/camera';
import { useUIStore } from '@/stores/uiStore';

```

Replace:

```ts
describe('runes on the floor', () => {
```

with:

```ts
/** A renderer on a stand-in app (no GPU): a `width`×`height` screen at resolution `res`. */
function stage(width = 1920, height = 1080, res = 1) {
  const app = {
    renderer: { render() {}, resolution: res },
    stage: new Container(),
    screen: { width, height },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  };
  return { app, r: new ArenaRenderer(app as unknown as Application) };
}

/** An empty sandbox floor (26 × 40 units) with the hero at `x`, `y`. */
function floor(x = 13, y = 20): ArpgWorld {
  const registry = getDelveRegistry();
  const w = createSandboxWorld(registry, {
    depth: 5,
    stats: computeHeroStats({}, registry),
    chains: defaultChains(registry, 'fire', null),
    toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
  });
  Object.assign(w.hero, { x, y });
  return w;
}

/** Put `w` on screen with its camera on the hero, and draw a still frame. */
function show(r: ArenaRenderer, w: ArpgWorld): void {
  r.loadFloor(w, getDelveRegistry().getBiomeForDepth(w.depth));
  r.update(0);
}

describe('the dive camera', () => {
  afterEach(() => useUIStore.getState().setArenaViewUnits(27));

  it('zooms to whole render pixels per sprite pixel from the height alone, and follows View distance', () => {
    expect(stage(1920, 1080).r.pixelsPerUnit()).toBe(40); // 4 px per sprite px: 27 units tall
    expect(stage(1280, 720).r.pixelsPerUnit()).toBe(30);
    expect(stage(3440, 1440).r.pixelsPerUnit()).toBe(50);
    expect(stage(1920, 1080, 2).r.pixelsPerUnit()).toBe(40); // 8 render px per sprite px
    useUIStore.getState().setArenaViewUnits(20);
    expect(stage(1920, 1080).r.pixelsPerUnit()).toBe(50); // 21.6 units
  });

  it('a point round-trips through the screen at each scale', () => {
    const { app, r } = stage();
    r.setInsets({ top: 72, right: 380, bottom: 230, left: 0 });
    const w = floor();
    show(r, w);
    for (const height of [720, 800, 1024, 1080, 1200, 1440, 2160])
      for (const res of [1, 2]) {
        Object.assign(app.screen, { width: height * 1.6, height });
        app.renderer.resolution = res;
        r.resize();
        // 10 sprite pixels a unit: the scale's px per sprite px, in CSS px.
        expect(r.pixelsPerUnit()).toBeCloseTo((spritePixelScale(height * res) * 10) / res);
        for (const [x, y] of [
          [3, 5],
          [13, 20],
          [24.5, 37.25],
        ]) {
          Object.assign(w.hero, { x, y });
          r.update(0);
          const s = r.heroScreen()!;
          const back = r.screenToWorld(s.x, s.y);
          expect(back.x, `${height}p ×${res}`).toBeCloseTo(x, 6);
          expect(back.y).toBeCloseTo(y, 6);
        }
      }
  });

  it('centres the hero in the clear rectangle the insets leave, on whole render pixels', () => {
    const { r } = stage(1920, 1080, 2);
    r.setInsets({ top: 71, right: 381, bottom: 230, left: 0 });
    show(r, floor(13, 20));
    // The arena's 26 units fit the clear width (38.5 units): it centres there; the height follows the hero.
    expect(r.heroScreen()).toEqual({ x: (1920 - 381) / 2, y: 71 + (1080 - 71 - 230) / 2 });
    const root = (r as unknown as { root: Container }).root.position;
    expect(Number.isInteger(root.x * 2) && Number.isInteger(root.y * 2)).toBe(true);
    // The view is the whole screen, in world units.
    const v = r.viewRect();
    expect(v.right - v.left).toBeCloseTo(48);
    expect(v.bottom - v.top).toBeCloseTo(27);
  });

  it("clamps on the clear rectangle's half extents: a narrow one still follows sideways", () => {
    // 1280×1024: 32 units wide, 4 px per sprite px; the right column leaves 24.9 units clear.
    const left = (right: number, heroX: number) => {
      const { r } = stage(1280, 1024);
      r.setInsets({ top: 0, right, bottom: 0, left: 0 });
      show(r, floor(heroX, 20));
      return r.viewRect().left;
    };
    expect(left(0, 2)).toBe(left(0, 24)); // the whole arena fits: centred
    expect(left(285, 2)).toBeLessThan(left(285, 24));
  });
});

describe('runes on the floor', () => {
```


- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: FAIL, 4 failed (11 tests): `AssertionError: expected 72 to be 40` (today's zoom), the round trip's `expected NaN to be close to 30` and the centre's `expected { x: 960, y: NaN } to deeply equal { x: 769.5, y: 460.5 }` (`setInsets` takes two numbers today), and `TypeError: r.viewRect is not a function`.

- [ ] **Step 3: The camera**

In `packages/client/src/features/delve/arena/ArenaRenderer.ts`:

Replace:

```ts
import { SPRITE_PIXEL, spriteFrames } from './sprites';
import { getDelveRegistry } from '../registry';

```

with:

```ts
import { SPRITE_PIXEL, spriteFrames } from './sprites';
import { arenaZoom, type Insets } from './camera';
import { getDelveRegistry } from '../registry';
import { useUIStore } from '@/stores/uiStore';

```

Replace:

```ts
  private unit = 30;
  private insets = { top: 0, bottom: 0 };
  private cam = { x: 0, y: 0 };
```

with:

```ts
  private unit = 30;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** The visible arena rectangle (world units), as of the last frame. */
  private view: ViewRect = { left: 0, top: 0, right: 0, bottom: 0 };
  /** Reduced motion: no shake and no strike kick (decided item 14). */
  private readonly still = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  private cam = { x: 0, y: 0 };
```

Replace:

```ts
  /** Screen space covered by HUD at the top/bottom, so the hero stays in the open. */
  setInsets(top: number, bottom: number): void {
    this.insets = { top, bottom };
  }

  resize(): void {
    const { width, height } = this.app.screen;
    const playH = Math.max(200, height - this.insets.top - this.insets.bottom);
    this.unit = Math.max(16, Math.min(width / 13.5, playH / 15));
  }
```

with:

```ts
  /** The screen the HUD covers on each side (viewport px): the camera centres in what is left. */
  setInsets(insets: Insets): void {
    this.insets = insets;
  }

  /** The visible arena rectangle in world units (the minimap's view box). */
  viewRect(): ViewRect {
    return this.view;
  }

  /** The zoom (camera.ts): whole render pixels per sprite pixel, from the screen height alone. */
  resize(): void {
    const res = this.app.renderer.resolution;
    const { scale } = arenaZoom(this.app.screen.height, res, useUIStore.getState().arenaViewUnits);
    this.unit = Math.round(scale / SPRITE_PIXEL) / res;
  }
```

Replace:

```ts
  addShake(amount: number): void {
    this.shake = Math.min(0.6, this.shake + amount);
```

with:

```ts
  addShake(amount: number): void {
    if (this.still) return;
    this.shake = Math.min(0.6, this.shake + amount);
```

Replace:

```ts
  private kickCamera(dir: Vec, heft: number): void {
    const len
```

with:

```ts
  private kickCamera(dir: Vec, heft: number): void {
    if (this.still) return;
    const len
```

Replace:

```ts
    // Camera
    const playTop = this.insets.top;
    const playH = height - this.insets.top - this.insets.bottom;
    const halfW = width / 2 / u;
    const halfH = playH / 2 / u;
```

with:

```ts
    // Camera: centred in the clear rectangle the HUD's insets leave, clamped to that rectangle's
    // half extents (a narrow one still follows sideways), on whole render pixels.
    const ins = this.insets;
    const clearW = Math.max(1, width - ins.left - ins.right);
    const clearH = Math.max(1, height - ins.top - ins.bottom);
    const halfW = clearW / 2 / u;
    const halfH = clearH / 2 / u;
```

Replace:

```ts
    this.root.scale.set(u);
    this.root.position.set(
      width / 2 - (cx + this.kick.x) * u + sx,
      playTop + playH / 2 - (cy + this.kick.y) * u + sy,
    );

    const left = -this.root.position.x / u;
    const top = -this.root.position.y / u;
    const view: ViewRect = { left, top, right: left + width / u, bottom: top + height / u };
    this.pixelFloor?.update(dt, w, view);
```

with:

```ts
    const res = this.app.renderer.resolution;
    const whole = (px: number) => Math.round(px * res) / res;
    this.root.scale.set(u);
    this.root.position.set(
      whole(ins.left + clearW / 2 - (cx + this.kick.x) * u + sx),
      whole(ins.top + clearH / 2 - (cy + this.kick.y) * u + sy),
    );

    const left = -this.root.position.x / u;
    const top = -this.root.position.y / u;
    const view: ViewRect = { left, top, right: left + width / u, bottom: top + height / u };
    this.view = view;
    this.pixelFloor?.update(dt, w, view);
```


In `packages/client/src/features/delve/arena/useArenaCore.ts`:

Replace:

```ts
import { HitStop } from './fx/hitstop';

```

with:

```ts
import { HitStop } from './fx/hitstop';
import { arenaResolution, type Insets } from './camera';
import { useUIStore } from '@/stores/uiStore';

```

Replace:

```ts
  paused: boolean;
  insets: { top: number; bottom: number };
  onUi: (e: CoreUiEvent) => void;
```

with:

```ts
  paused: boolean;
  /** The screen the HUD covers (viewport px): the camera centres in the rest. */
  insets: Insets;
  onUi: (e: CoreUiEvent) => void;
```

Replace:

```ts
    const hostResize = new ResizeObserver(() => app.queueResize());

```

with:

```ts
    const hostResize = new ResizeObserver(() => app.queueResize());
    let stopViewUnits = () => {};

```

Replace:

```ts
        resolution: Math.min(2, window.devicePixelRatio || 1),
```

with:

```ts
        resolution: arenaResolution(),
```

Replace:

```ts
        renderer.setInsets(insetsRef.current.top, insetsRef.current.bottom);
        rendererRef.current = renderer;
        app.renderer.on('resize', () => renderer.resize());
```

with:

```ts
        renderer.setInsets(insetsRef.current);
        rendererRef.current = renderer;
        app.renderer.on('resize', () => renderer.resize());
        // Settings → View distance zooms at once.
        stopViewUnits = useUIStore.subscribe((s, prev) => {
          if (s.arenaViewUnits !== prev.arenaViewUnits) renderer.resize();
        });
```

Replace:

```ts
          renderer.setInsets(insetsRef.current.top, insetsRef.current.bottom);
          renderer.setAim(
```

with:

```ts
          renderer.setInsets(insetsRef.current);
          renderer.setAim(
```

Replace:

```ts
      hostResize.disconnect();
      detachKeys();
```

with:

```ts
      hostResize.disconnect();
      stopViewUnits();
      detachKeys();
```

In `packages/client/src/features/delve/arena/useArena.ts`:

Replace:

```ts
import { useArenaCore, type ArenaMode, type CoreUiEvent } from './useArenaCore';

```

with:

```ts
import { useArenaCore, type ArenaMode, type CoreUiEvent } from './useArenaCore';
import type { Insets } from './camera';

```

Replace:

```ts
    paused: boolean;
    insets: { top: number; bottom: number };
    onUi: (e: ArenaUiEvent) => void;
```

with:

```ts
    paused: boolean;
    /** The HUD's insets; until the 3a page passes all four, the sides default to 0. */
    insets: Pick<Insets, 'top' | 'bottom'> & Partial<Insets>;
    onUi: (e: ArenaUiEvent) => void;
```

Replace:

```ts
  return useArenaCore(hostRef, mode, opts);
}
```

with:

```ts
  return useArenaCore(hostRef, mode, { ...opts, insets: { left: 0, right: 0, ...opts.insets } });
}
```

In `packages/client/src/features/delve/training/useTrainingArena.ts`:

Replace:

```ts
import { useArenaCore, type ArenaMode, type CoreUiEvent } from '../arena/useArenaCore';

```

with:

```ts
import { useArenaCore, type ArenaMode, type CoreUiEvent } from '../arena/useArenaCore';
import type { Insets } from '../arena/camera';

```

Replace:

```ts
    paused: boolean;
    insets: { top: number; bottom: number };
    onUi: (e: CoreUiEvent) => void;
```

with:

```ts
    paused: boolean;
    /** The HUD's insets; until the 3a page passes all four, the sides default to 0. */
    insets: Pick<Insets, 'top' | 'bottom'> & Partial<Insets>;
    onUi: (e: CoreUiEvent) => void;
```

Replace:

```ts
  const arena = useArenaCore(hostRef, mode, opts);
```

with:

```ts
  const arena = useArenaCore(hostRef, mode, {
    ...opts,
    insets: { left: 0, right: 0, ...opts.insets },
  });
```


- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: PASS (11 tests; jsdom logs "Not implemented: HTMLCanvasElement's getContext()" once, harmless).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 15 tests in F + 2 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/arena-renderer.test.ts src/features/delve/arena/ArenaRenderer.ts src/features/delve/arena/useArenaCore.ts src/features/delve/arena/useArena.ts src/features/delve/training/useTrainingArena.ts)
git add packages/client/src/features/delve/__tests__/arena-renderer.test.ts packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/useArena.ts packages/client/src/features/delve/training/useTrainingArena.ts
git commit -m "feat(client): the dive camera zooms to whole pixels, centres in the HUD's clear rectangle and follows View distance" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: Loot plaques

### Task 6: Loot plaques

Decided item 22. Every item and rune drop gets a plaque (`dropPlaque`): rarity text, ▲ for an upgrade (asked once, when the drop's view is made, through `setUpgradeTest`), a rune's name and tier. Rare and up, runes and upgrades always show; the rest while `setLabelsHeld(true)`. Shown plaques that overlap stack upward (`stackPlaques`: one greedy pass, lowest first). The test's hold-Alt case runs the real keyboard handler into the renderer, as the frame loop does, and lets go on a blur.

**Files:**
- Modify: `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`:

Replace:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { Container, type Application, type Graphics } from 'pixi.js';
```

with:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CanvasTextMetrics, Container, Text, type Application, type Graphics } from 'pixi.js';
```

Replace:

```ts
  drawDrop,
  dropLabel,
  dropPop,
  holdPing,
  pickupColor,
  pruneViews,
} from '../arena/ArenaRenderer';
import { MANA_HEX, RARITY_HEX } from '../arena/palette';
```

with:

```ts
  drawDrop,
  dropPlaque,
  dropPop,
  holdPing,
  pickupColor,
  pruneViews,
  stackPlaques,
} from '../arena/ArenaRenderer';
import { MANA_HEX, cssToHex } from '../arena/palette';
import { attachKeyboard, createArenaInput } from '../arena/input';
import { RARITY_TEXT } from '../format';
```

Replace:

```ts
    const def = getDelveRegistry().getRune('split');
    expect(dropLabel(drop({ kind: 'rune', rune: split }))).toEqual({
      text: `${def.icon} Split III`,
      color: runeHex(split),
    });
```

with:

```ts
    expect(dropPlaque(drop({ kind: 'rune', rune: split }), false)).toEqual({
      text: 'Split III',
      color: runeHex(split),
      always: true,
    });
```

Replace:

```ts
  it('names rare, epic and legendary items and runes, nothing else', () => {
    const item = (rarity: GearItem['rarity']) =>
      drop({ kind: 'item', item: { name: 'Sunfang', rarity } as GearItem });
    expect(dropLabel(item('legendary'))).toEqual({ text: 'Sunfang', color: RARITY_HEX.legendary });
    expect(dropLabel(item('magic'))).toBeNull();
    expect(dropLabel(drop({}))).toBeNull();
  });
});
```

with:

```ts
  it('labels every item and rune: rare and up, runes and upgrades (▲) always, the rest on Alt', () => {
    const item = (rarity: GearItem['rarity']) =>
      drop({ kind: 'item', item: { name: 'Sunfang', rarity } as GearItem });
    expect(dropPlaque(item('legendary'), false)).toEqual({
      text: 'Sunfang',
      color: cssToHex(RARITY_TEXT.legendary),
      always: true,
    });
    expect(dropPlaque(item('epic'), false)?.color).toBe(0xd7a6e8); // epic's text colour
    expect(dropPlaque(item('magic'), false)).toMatchObject({ text: 'Sunfang', always: false });
    expect(dropPlaque(item('magic'), true)).toMatchObject({ text: 'Sunfang ▲', always: true });
    expect(dropPlaque(drop({}), false)).toBeNull();
  });
});

describe('loot labels', () => {
  afterEach(() => vi.restoreAllMocks());

  /** The loot labels on screen: each shown plate's text. */
  const labels = (app: { stage: Container }) =>
    app.stage.children[1].children
      .filter((c) => c.visible)
      .flatMap((c) => c.children.filter((t) => t instanceof Text).map((t) => (t as Text).text));

  it('hold Alt shows every drop, and a blur (an Alt+Tab, no keyup) lets go', () => {
    // jsdom has no canvas: measure text as 7 px a character, 14 tall.
    vi.spyOn(CanvasTextMetrics, 'measureText').mockImplementation(
      (text) =>
        ({
          width: String(text).length * 7,
          height: 14,
          lines: [String(text)],
          lineWidths: [String(text).length * 7],
          lineHeight: 14,
          maxLineWidth: String(text).length * 7,
          fontProperties: { ascent: 11, descent: 3, fontSize: 14 },
        }) as unknown as CanvasTextMetrics,
    );
    const { app, r } = stage();
    const w = floor(13, 20);
    const item = (id: number, name: string, rarity: GearItem['rarity']) =>
      drop({ id, kind: 'item', x: 10 + id * 3, y: 20, item: { name, rarity } as GearItem });
    w.drops.push(
      item(1, 'Rusty Ring', 'magic'),
      item(2, 'Sunfang', 'legendary'),
      item(3, 'Better Boots', 'common'),
      drop({ id: 4, kind: 'rune', x: 22, y: 20, rune: { id: 'split', tier: 2 } }),
      drop({ id: 5, x: 13, y: 22 }), // a health orb: no label
    );
    r.setUpgradeTest((i) => i.name === 'Better Boots');
    show(r, w);
    expect(labels(app).sort()).toEqual(['Better Boots ▲', 'Split II', 'Sunfang']);

    const input = createArenaInput();
    const detach = attachKeyboard(input, () => true);
    /** One frame: what useArenaCore hands the renderer, then the draw. */
    const frame = () => {
      r.setLabelsHeld(input.labels);
      r.update(0);
    };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'AltLeft' }));
    frame();
    expect(labels(app)).toContain('Rusty Ring');
    window.dispatchEvent(new Event('blur'));
    frame();
    expect(labels(app)).not.toContain('Rusty Ring');
    detach();
  });

  it('overlapping labels stack upward, lowest first; apart ones stay', () => {
    const box = (x: number, y: number) => ({ x, y, w: 80, h: 20 });
    expect(stackPlaques([box(100, 500), box(120, 495), box(400, 500), box(100, 490)])).toEqual([
      500, 478, 500, 456,
    ]);
  });
});
```


- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: FAIL, 4 failed (13 tests): `TypeError: (0 , dropPlaque) is not a function` (twice), `TypeError: r.setUpgradeTest is not a function` and `TypeError: (0 , stackPlaques) is not a function`.

- [ ] **Step 3: The plaques**

In `packages/client/src/features/delve/arena/ArenaRenderer.ts`:

Replace:

```ts
  type Drop,
  type ManaType,
```

with:

```ts
  type Drop,
  type GearItem,
  type ManaType,
```

Replace:

```ts
import { getDelveRegistry } from '../registry';
import { useUIStore } from '@/stores/uiStore';

```

with:

```ts
import { getDelveRegistry } from '../registry';
import { RARITY_TEXT } from '../format';
import { contextZoom } from '../kit/zoom';
import { useUIStore } from '@/stores/uiStore';

```

Replace:

```ts
interface DropView {
  root: Container;
  gfx: Graphics;
  label: Text | null;
}
```

with:

```ts
interface DropView {
  root: Container;
  gfx: Graphics;
  plaque: Plaque | null;
}

/** A loot label (decided item 22): screen space, `w`×`h` px. */
interface Plaque {
  box: Container;
  w: number;
  h: number;
  /** Shown without Alt: rare and up, a rune, an upgrade. */
  always: boolean;
}
```

Replace:

```ts
  private heroPerfectUntil = 0;
  private aim: AimView | null = null;

```

with:

```ts
  private heroPerfectUntil = 0;
  private aim: AimView | null = null;
  /** Alt or L3 held: every drop's loot label shows. */
  private labelsHeld = false;
  /** Whether an item is an upgrade as it comes (▲ on its label), asked once per drop. */
  private isUpgrade: (item: GearItem) => boolean = () => false;

```

Replace:

```ts
    for (const v of this.drops.values()) {
      v.root.destroy({ children: true });
      v.label?.destroy();
    }
```

with:

```ts
    for (const v of this.drops.values()) {
      v.root.destroy({ children: true });
      v.plaque?.box.destroy({ children: true });
    }
```

Replace:

```ts
  /** Show (or hide, with null) the aim marker. */
```

with:

```ts
  /** Alt or L3 held (or let go): every drop's loot label shows. */
  setLabelsHeld(held: boolean): void {
    this.labelsHeld = held;
  }

  /** How to tell an upgrade (▲ on its label); asked once, when a drop's view is made. */
  setUpgradeTest(isUpgrade: (item: GearItem) => boolean): void {
    this.isUpgrade = isUpgrade;
  }

  /** Show (or hide, with null) the aim marker. */
```

Replace:

```ts
  private syncDrops(w: ArpgWorld): void {
    const alive = new Set<number>();
```

with:

```ts
  private syncDrops(w: ArpgWorld): void {
    const alive = new Set<number>();
    const shown: { p: Plaque; x: number; y: number }[] = [];
```

Replace:

```ts
      drawDrop(v.gfx, d, this.time, age);
      if (v.label) {
        const p = this.toScreen(d.x, d.y - pop - 0.9);
        v.label.position.set(p.x, p.y);
      }
    }
    pruneViews(this.drops, alive, (v) => {
      v.root.destroy({ children: true });
      v.label?.destroy();
    });
  }
```

with:

```ts
      drawDrop(v.gfx, d, this.time, age);
      const plaque = v.plaque;
      if (plaque) {
        plaque.box.visible = plaque.always || this.labelsHeld;
        if (plaque.box.visible) shown.push({ p: plaque, ...this.toScreen(d.x, d.y - pop - 0.9) });
      }
    }
    const bottoms = stackPlaques(shown.map(({ p, x, y }) => ({ x, y, w: p.w, h: p.h })));
    shown.forEach(({ p, x }, i) =>
      p.box.position.set(Math.round(x - p.w / 2), Math.round(bottoms[i] - p.h)),
    );
    pruneViews(this.drops, alive, (v) => {
      v.root.destroy({ children: true });
      v.plaque?.box.destroy({ children: true });
    });
  }
```

Replace:

```ts
    this.dropLayer.addChild(root);
    let label: Text | null = null;
    const named = dropLabel(d);
    if (named) {
      label = new Text({
        text: named.text,
        style: {
          fontFamily: FONT,
          fontWeight: '700',
          fontSize: 13,
          fill: named.color,
          stroke: { color: 0x000000, width: 3 },
        },
      });
      label.anchor.set(0.5, 1);
      this.textLayer.addChild(label);
    }
    return { root, gfx, label };
  }
```

with:

```ts
    this.dropLayer.addChild(root);
    const named = dropPlaque(d, !!d.item && this.isUpgrade(d.item));
    return { root, gfx, plaque: named && this.makePlaque(named) };
  }

  /** A loot label: its text in Jersey 10 at 14 × the HUD scale px on a dark plate, bordered in its colour. */
  private makePlaque(named: { text: string; color: number; always: boolean }): Plaque {
    const s = contextZoom('hud');
    const text = new Text({
      text: named.text,
      style: {
        fontFamily: '"Jersey 10", sans-serif',
        fontSize: 14 * s,
        letterSpacing: 0.7 * s,
        fill: named.color,
      },
    });
    text.position.set(Math.round(9 * s), Math.round(3 * s));
    const w = Math.ceil(text.width + 18 * s);
    const h = Math.ceil(text.height + 6 * s);
    const plate = new Graphics()
      .rect(0, 0, w, h)
      .fill({ color: 0x0a0a10, alpha: 0.86 })
      .stroke({ width: 1, color: named.color, alpha: 0.55, alignment: 1 });
    const box = new Container();
    box.addChild(plate, text);
    box.visible = false;
    this.textLayer.addChild(box);
    return { box, w, h, always: named.always };
  }
```

Replace:

```ts
/**
 * The name floating over a drop: a rare, epic or legendary item's in its
 * rarity's colour, or a rune's glyph, name and tier ("✳️ Split III") in its
 * family's; null for anything else.
 */
export function dropLabel(d: Drop): { text: string; color: number } | null {
  const rarity = d.item?.rarity;
  if (d.item && (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary'))
    return { text: d.item.name, color: RARITY_HEX[rarity] };
  const def = d.rune ? getDelveRegistry().findRune(d.rune.id) : undefined;
  if (!d.rune || !def) return null;
  return {
    text: `${def.icon} ${def.name} ${TIER_NUMERAL[d.rune.tier]}`,
    color: runeHex(d.rune),
  };
}
```

with:

```ts
/**
 * A drop's loot label (decided item 22): an item's name in its rarity's text
 * colour, with ▲ when it is an upgrade as it comes, or a rune's name and tier
 * ("Split III") in its family's. Rare and up, runes and upgrades always show;
 * anything else only while every label does. Null for drops that aren't loot.
 */
export function dropPlaque(
  d: Drop,
  isUpgrade: boolean,
): { text: string; color: number; always: boolean } | null {
  if (d.item) {
    const r = d.item.rarity;
    return {
      text: isUpgrade ? `${d.item.name} ▲` : d.item.name,
      color: cssToHex(RARITY_TEXT[r]),
      always: isUpgrade || r === 'rare' || r === 'epic' || r === 'legendary',
    };
  }
  const def = d.rune ? getDelveRegistry().findRune(d.rune.id) : undefined;
  if (!d.rune || !def) return null;
  return { text: `${def.name} ${TIER_NUMERAL[d.rune.tier]}`, color: runeHex(d.rune), always: true };
}

/** Space between stacked loot labels, px. */
const PLAQUE_GAP = 2;

/**
 * Loot labels that overlap stack upward: one greedy pass from the lowest on
 * screen up, each moved above any label already placed that it overlaps.
 * Boxes are centred on `x` with their bottom at `y` (px); returns each bottom.
 */
export function stackPlaques(boxes: { x: number; y: number; w: number; h: number }[]): number[] {
  const bottoms = boxes.map((b) => b.y);
  const placed: number[] = [];
  for (const i of boxes.map((_, i) => i).sort((a, b) => boxes[b].y - boxes[a].y)) {
    const b = boxes[i];
    // Lowest first: moving above one can only meet those placed higher.
    for (const j of placed.sort((m, n) => bottoms[n] - bottoms[m])) {
      const p = boxes[j];
      const apart =
        Math.abs(b.x - p.x) >= (b.w + p.w) / 2 ||
        bottoms[i] <= bottoms[j] - p.h ||
        bottoms[i] - b.h >= bottoms[j];
      if (!apart) bottoms[i] = bottoms[j] - p.h - PLAQUE_GAP;
    }
    placed.push(i);
  }
  return bottoms;
}
```


- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: PASS (13 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 17 tests in F + 2 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/arena-renderer.test.ts src/features/delve/arena/ArenaRenderer.ts)
git add packages/client/src/features/delve/__tests__/arena-renderer.test.ts packages/client/src/features/delve/arena/ArenaRenderer.ts
git commit -m "feat(client): loot plaques: rare, runes and upgrades always, every drop while Alt or L3 is held, stacked when they overlap" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The snapshot and the controls surface

### Task 7: The snapshot's buffs and map, and the core's wiring

`snapshot(world, renderer)` adds `buffs` (Riposte, Quick, the barrier, while they last) and `map` (the floor for the minimap; `view` from the renderer, or the arena with none). The core passes its renderer; hands the frame's labels hold (`input.labels || pad.labels`) to it; presses the journal on the pad's View; gives it the mode's upgrade test (the dive's `compareItem` as it comes); loads Jersey 10 before the renderer exists; and, in dev builds, logs when the canvas host sits under a zoom (decided item 31).

**Files:**
- Modify: `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts`
- Modify: `packages/client/src/features/delve/arena/useArena.ts`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`, every snapshot passes no renderer:
- Replace every `snapshot(w)` with `snapshot(w, null)` (16 places).
- Replace every `snapshot(on)` with `snapshot(on, null)`.
- Replace every `snapshot(off)` with `snapshot(off, null)`.
- Replace every `snapshot(sword)` with `snapshot(sword, null)`.

Then:

In `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`:

Replace:

```ts
  sandboxWeapon,
  startDive,
  stepWorld,
  type Chains,
  type HeroStatsExtra,
} from '@alloy/engine';
import { snapshot } from '../arena/useArena';
import { getDelveRegistry } from '../registry';
```

with:

```ts
  sandboxWeapon,
  startDive,
  stepWorld,
  type Chains,
  type Drop,
  type GearItem,
  type HeroStatsExtra,
  type MonsterEntity,
} from '@alloy/engine';
import { snapshot } from '../arena/useArena';
import { getDelveRegistry } from '../registry';
import { RARITY_COLOR } from '../format';
import { FAMILY_STYLE } from '../runes/rune-style';
```

Replace:

```ts
describe('arena HUD snapshot: runes', () => {
```

with:

```ts
describe('arena HUD snapshot: buffs and the map', () => {
  it("lists the hero's timed buffs with their seconds left: Riposte, Quick and the barrier", () => {
    const w = sandbox();
    w.t = 10;
    expect(snapshot(w, null).buffs).toEqual([]);
    Object.assign(w.hero, {
      riposteUntil: 11,
      quickUntil: 10.5,
      barrier: { hp: 5, max: 8, until: 14 },
    });
    const bal = registry.getDelveBalance();
    expect(snapshot(w, null).buffs).toEqual([
      { id: 'riposte', left: 1, total: bal.dodge.riposteWindow },
      { id: 'quick', left: 0.5, total: bal.reactions.lightningRodDuration },
      { id: 'barrier', left: 4, total: null },
    ]);
    w.t = 12; // Riposte and Quick are over
    expect(snapshot(w, null).buffs.map((b) => b.id)).toEqual(['barrier']);
  });

  it('maps the floor: the view (the arena with no renderer), the hero, foes by rank, loot by colour', () => {
    const w = sandbox();
    w.monsters.push({ x: 3, y: 4, kind: 'elite' } as MonsterEntity);
    const at = { born: 0, amount: 0, vacuum: false, dead: false };
    w.drops.push(
      { ...at, id: 1, kind: 'item', x: 5, y: 6, item: { rarity: 'rare' } as GearItem },
      { ...at, id: 2, kind: 'rune', x: 7, y: 8, rune: { id: 'split', tier: 1 } },
      { ...at, id: 3, kind: 'orb', x: 9, y: 9 } as Drop,
    );
    const map = snapshot(w, null).map;
    expect(map).toMatchObject({
      width: w.width,
      height: w.height,
      view: { left: 0, top: 0, right: w.width, bottom: w.height },
      hero: { x: w.hero.x, y: w.hero.y },
      foes: [{ x: 3, y: 4, rank: 'elite' }],
      drops: [
        { x: 5, y: 6, color: RARITY_COLOR.rare },
        { x: 7, y: 8, color: FAMILY_STYLE[registry.getRune('split').family].color },
      ],
      terrain: [],
    });
    const view = { left: 1, top: 2, right: 49, bottom: 29 };
    expect(snapshot(w, { viewRect: () => view }).map.view).toBe(view);
  });
});

describe('arena HUD snapshot: runes', () => {
```


- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-hud-snapshot.test.ts)`
Expected: FAIL, 2 failed (11 tests): `AssertionError: expected undefined to deeply equal []` and `AssertionError: expected undefined to match object { width: 26, height: 40, …(5) }`.

- [ ] **Step 3: The snapshot and the wiring**

In `packages/client/src/features/delve/arena/useArenaCore.ts`:

Replace:

```ts
  type ArpgEvent,
  type ArpgWorld,
  type Chains,
  type FormId,
```

with:

```ts
  type ArpgEvent,
  type ArpgWorld,
  type Chains,
  type Drop,
  type FormId,
  type GearItem,
```

Replace:

```ts
import { floatPay } from './ArenaHud';
import type { AimView } from './fx/draw-world';
```

with:

```ts
import { floatPay } from './ArenaHud';
import type { AimView } from './fx/draw-world';
import type { ViewRect } from './fx/pixel-layer';
import { RARITY_COLOR } from '../format';
import { FAMILY_STYLE } from '../runes/rune-style';
import { hasZoomedAncestor } from '../kit/zoom';
```

Replace:

```ts
  frameInput,
  pressMenu,
  type Aiming,
```

with:

```ts
  frameInput,
  pressJournal,
  pressMenu,
  type Aiming,
```

Replace:

```ts
import { arenaResolution, type Insets } from './camera';
import { useUIStore } from '@/stores/uiStore';

```

with:

```ts
import { arenaResolution, type Insets } from './camera';
import { useUIStore } from '@/stores/uiStore';

export type { Insets } from './camera';

```

Replace:

```ts
  /** The runes acting on the move a press now casts (`pressMove`), in socket order. */
  runes: RuneRef[];
}

```

with:

```ts
  /** The runes acting on the move a press now casts (`pressMove`), in socket order. */
  runes: RuneRef[];
}

/** A timed buff on the hero, for the HUD's buff row. No Galvanize: its spark is on the slots. */
export interface HudBuff {
  id: 'riposte' | 'quick' | 'barrier';
  /** Seconds left, from riposteUntil, quickUntil and barrier.until. */
  left: number;
  /** Its whole length when the balance fixes one; null for the barrier (its source sets it). */
  total: number | null;
}

/** The minimap's floor, in world units. */
export interface HudMap {
  width: number;
  height: number;
  /** The camera's view; the whole arena when there is no renderer. */
  view: ViewRect;
  hero: { x: number; y: number };
  foes: { x: number; y: number; rank: 'normal' | 'elite' | 'boss' }[];
  drops: { x: number; y: number; color: string }[];
  /** Blocked cells, if the engine ever adds terrain; [] today. */
  terrain: { x: number; y: number; w: number; h: number }[];
}

```

Replace:

```ts
  /** The world's time, for `galvanizedAt`. */
  t: number;
}
```

with:

```ts
  /** The world's time, for `galvanizedAt`. */
  t: number;
  /** Riposte, Quick and the barrier while they last, in that order. */
  buffs: HudBuff[];
  map: HudMap;
}
```

Replace:

```ts
  /** Display speed (1 = normal), times the perfect-dodge slow motion and the timescale hook. */
  speed: number;
}
```

with:

```ts
  /** Display speed (1 = normal), times the perfect-dodge slow motion and the timescale hook. */
  speed: number;
  /** Whether an item is an upgrade as it comes (▲ on its loot label); none when absent. */
  isUpgrade?: (item: GearItem) => boolean;
}
```

Replace:

```ts
export function snapshot(world: ArpgWorld): ArenaHud {
```

with:

```ts
/** A loot drop's colour on the minimap: its rarity's, or its rune family's; null for anything else. */
function mapColor(d: Drop): string | null {
  if (d.item) return RARITY_COLOR[d.item.rarity];
  const def = d.rune && getDelveRegistry().findRune(d.rune.id);
  return def ? FAMILY_STYLE[def.family].color : null;
}

export function snapshot(world: ArpgWorld, renderer: { viewRect(): ViewRect } | null): ArenaHud {
```

Replace:

```ts
        : h.reactionReadyAt.galvanize - bal.reactions.reactionCooldown,
    t,
  };
}
```

with:

```ts
        : h.reactionReadyAt.galvanize - bal.reactions.reactionCooldown,
    t,
    buffs: (
      [
        ['riposte', h.riposteUntil, bal.dodge.riposteWindow],
        ['quick', h.quickUntil, bal.reactions.lightningRodDuration],
        ['barrier', h.barrier?.until ?? 0, null],
      ] as const
    ).flatMap(([id, until, total]) => (until > t ? [{ id, left: until - t, total }] : [])),
    map: {
      width: world.width,
      height: world.height,
      view: renderer?.viewRect() ?? { left: 0, top: 0, right: world.width, bottom: world.height },
      hero: { x: h.x, y: h.y },
      foes: world.monsters.map((m) => ({ x: m.x, y: m.y, rank: m.kind })),
      drops: world.drops.flatMap((d) => {
        const color = mapColor(d);
        return color ? [{ x: d.x, y: d.y, color }] : [];
      }),
      terrain: [],
    },
  };
}
```

Replace:

```ts
    renderer.loadFloor(world, registry.getBiomeForDepth(world.depth));
    setHud(snapshot(world));
```

with:

```ts
    renderer.loadFloor(world, registry.getBiomeForDepth(world.depth));
    setHud(snapshot(world, renderer));
```

Replace:

```ts
    const host = hostRef.current;
    if (!host) return;
    let destroyed = false;
```

with:

```ts
    const host = hostRef.current;
    if (!host) return;
    // A zoomed ancestor would desync Pixi's pointer mapping and its whole-pixel scale.
    if (import.meta.env.DEV && hasZoomedAncestor(host))
      console.error('The arena host sits under a CSS zoom (Delve UI, decided item 31)');
    let destroyed = false;
```

Replace:

```ts
      .then(() => loadDelveSprites())
```

with:

```ts
      // The loot labels' font, before Pixi measures any.
      .then(() => Promise.all([loadDelveSprites(), document.fonts?.load('14px "Jersey 10"')]))
```

Replace:

```ts
        renderer.setInsets(insetsRef.current);
        rendererRef.current = renderer;
```

with:

```ts
        renderer.setInsets(insetsRef.current);
        renderer.setUpgradeTest((item) => modeRef.current.isUpgrade?.(item) ?? false);
        rendererRef.current = renderer;
```

Replace:

```ts
          renderer.setInsets(insetsRef.current);
          renderer.setAim(
```

with:

```ts
          renderer.setInsets(insetsRef.current);
          renderer.setLabelsHeld(inputRef.current.labels || !!pad?.labels);
          renderer.setAim(
```

Replace:

```ts
            setHud(snapshot(world));
          }
        });
```

with:

```ts
            setHud(snapshot(world, renderer));
          }
        });
```

Replace:

```ts
     * or while paused; Menu opens the dive menu. `frameInput` turns it into the
     * step's input (a press, a hold's release, `holding`: see `padFrameCast`).
```

with:

```ts
     * or while paused; Menu opens the dive menu and View the journal.
     * `frameInput` turns it into the step's input (a press, a hold's release,
     * `holding`: see `padFrameCast`).
```

Replace:

```ts
      if (acts.menu) pressMenu();
      return acts;
```

with:

```ts
      if (acts.menu) pressMenu();
      if (acts.journal) pressJournal();
      return acts;
```

Replace:

```ts
      refreshWorldHero(registry, world, mode.loadout.stats, mode.loadout.chains);
      setHud(snapshot(world));
```

with:

```ts
      refreshWorldHero(registry, world, mode.loadout.stats, mode.loadout.chains);
      setHud(snapshot(world, rendererRef.current));
```

In `packages/client/src/features/delve/arena/useArena.ts`:

Replace:

```ts
  completeFloor,
  failFloor,
```

with:

```ts
  compareItem,
  completeFloor,
  failFloor,
```

Replace:

```ts
import { getDelveRegistry } from '../registry';
import { useArenaCore
```

with:

```ts
import { getDelveRegistry } from '../registry';
import { UPGRADE_EPSILON } from '../format';
import { useArenaCore
```

Replace:

```ts
export { snapshot, type AbilityHud, type ArenaHud } from './useArenaCore';
```

with:

```ts
export {
  snapshot,
  type AbilityHud,
  type ArenaHud,
  type HudBuff,
  type HudMap,
  type Insets,
} from './useArenaCore';
```

Replace:

```ts
    onHeroDead: () => {},
    speed: 1,
  };
```

with:

```ts
    onHeroDead: () => {},
    speed: 1,
    // ▲ on a loot label: better as it comes, as the bag's tiles count it.
    isUpgrade: (item) => {
      const p = useDelveStore.getState().profile;
      const value = compareItem(p.equipped, item, registry, p.dive?.depth ?? 0, p.pair, 'asIs');
      return value.powerPct > UPGRADE_EPSILON;
    },
  };
```


- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-hud-snapshot.test.ts)`
Expected: PASS (11 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . ; npx vitest run)`
Expected: the typecheck reports one error, in 3A's fixture (X1): `src/features/delve/__tests__/ArenaHud.test.tsx(16,3): error TS2322: … Types of property 'buffs' are incompatible.` and nothing else; N + 19 tests in F + 2 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/arena-hud-snapshot.test.ts src/features/delve/arena/useArenaCore.ts src/features/delve/arena/useArena.ts)
git add packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/useArena.ts
git commit -m "feat(client): the HUD snapshot's buffs and minimap; the core wires labels, the journal and the upgrade test" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: `ArenaControls`: mouse only, and a hint for the device in use

Decided item 8: the joystick branch, `STICK_RADIUS` and "Drag to move" go. Every pointer walks toward the cursor (or attacks toward it, manual), as the mouse did. The hint names the way to move for the device holding the input lock and goes once the hero has moved (`input.moved`).

**Files:**
- Modify: `packages/client/src/features/delve/__tests__/arena-input.test.ts`
- Overwrite: `packages/client/src/features/delve/arena/ArenaControls.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/arena-input.test.ts`:

Replace:

```ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest';

```

with:

```ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createElement } from 'react';
import { act, render, screen } from '@testing-library/react';

```

Replace:

```ts
import { setArenaLive } from '@/features/gamepad/gamepad-hub';

```

with:

```ts
import { setArenaLive } from '@/features/gamepad/gamepad-hub';
import { ArenaControls } from '../arena/ArenaControls';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';

```

Replace:

```ts
const registry = getDelveRegistry();
/** A sandbox hero on Fire's default chains, the Primary `primary` if given. */
```

with:

```ts
describe('the move hint', () => {
  afterEach(() => useInputDeviceStore.getState().setDevice('keyboard'));

  it("names the device's way to move until the hero first moves; no joystick", () => {
    const input = createArenaInput();
    const controls = () =>
      createElement(ArenaControls, { input, heroScreen: () => null, pixelsPerUnit: () => 40 });
    const { rerender } = render(controls());
    expect(screen.getByTestId('move-hint')).toHaveTextContent('WASD or hold click to move');
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    expect(screen.getByTestId('move-hint')).toHaveTextContent('Left stick to move');
    input.moved = true; // any device moved the hero (frameInput)
    rerender(controls());
    expect(screen.queryByTestId('move-hint')).toBeNull();
  });
});

const registry = getDelveRegistry();
/** A sandbox hero on Fire's default chains, the Primary `primary` if given. */
```


- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-input.test.ts)`
Expected: FAIL, 1 failed (29 tests): `TestingLibraryElementError: Unable to find an element by: [data-testid="move-hint"]`.

- [ ] **Step 3: The controls surface**

Overwrite `packages/client/src/features/delve/arena/ArenaControls.tsx`:

```tsx
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Vec } from '@alloy/engine';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import type { ArenaInput } from './input';

interface ArenaControlsProps {
  input: ArenaInput;
  /** Hero position in screen pixels, for mouse hold-to-move. */
  heroScreen: () => Vec | null;
  pixelsPerUnit: () => number;
  disabled?: boolean;
  /** Manual basic attacks: the mouse attacks toward the cursor instead of walking. */
  manualAttack?: boolean;
}

/**
 * Movement surface over the arena: hold the mouse button and the hero walks
 * toward the cursor, or (manual basic attacks) attacks toward it while WASD
 * moves. A hint for the device in use shows until the hero first moves, by
 * any device (`input.moved`; the page re-renders with the HUD).
 */
export function ArenaControls({
  input,
  heroScreen,
  pixelsPerUnit,
  disabled,
  manualAttack,
}: ArenaControlsProps) {
  const surface = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: number; kind: 'mouse' | 'attack' } | null>(null);
  const device = useInputDeviceStore((s) => s.device);

  const update = (e: ReactPointerEvent) => {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    if (a.kind === 'attack') {
      input.attackAim = { x: e.clientX, y: e.clientY };
      return;
    }
    const r = surface.current!.getBoundingClientRect();
    const hero = heroScreen();
    if (!hero) return;
    const dx = e.clientX - r.left - hero.x;
    const dy = e.clientY - r.top - hero.y;
    const len = Math.hypot(dx, dy);
    const slow = pixelsPerUnit() * 0.6;
    input.pointer =
      len > slow * 0.3
        ? { x: (dx / len) * Math.min(1, len / slow), y: (dy / len) * Math.min(1, len / slow) }
        : { x: 0, y: 0 };
  };

  const onDown = (e: ReactPointerEvent) => {
    if (disabled || active.current) return;
    try {
      surface.current?.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    const kind = manualAttack ? 'attack' : 'mouse';
    active.current = { id: e.pointerId, kind };
    if (kind === 'attack') {
      input.attackHeld = true;
      input.attackTap = true;
      input.attackAim = { x: e.clientX, y: e.clientY };
      return;
    }
    update(e);
  };

  const onUp = (e: ReactPointerEvent) => {
    if (active.current?.id !== e.pointerId) return;
    active.current = null;
    input.pointer = { x: 0, y: 0 };
    input.attackHeld = false;
  };

  return (
    <div
      ref={surface}
      className="absolute inset-0 z-10"
      style={{ touchAction: 'none' }}
      onPointerDown={onDown}
      onPointerMove={update}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      data-testid="arena-controls"
    >
      {!input.moved && (
        <div
          className="delve-display pointer-events-none absolute bottom-[34%] left-0 right-0 text-center text-[14px] uppercase tracking-[0.25em] text-white/40"
          data-testid="move-hint"
        >
          {device === 'gamepad'
            ? 'Left stick to move'
            : manualAttack
              ? 'WASD to move · hold click to attack'
              : 'WASD or hold click to move'}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-input.test.ts)`
Expected: PASS (29 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . ; npx vitest run)`
Expected: the typecheck reports only X1's error; N + 20 tests in F + 2 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/arena-input.test.ts src/features/delve/arena/ArenaControls.tsx)
git add packages/client/src/features/delve/__tests__/arena-input.test.ts packages/client/src/features/delve/arena/ArenaControls.tsx
git commit -m "refactor(client): the arena's controls surface is mouse only, with a hint for the device in use" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 5: View distance, after 3A, and verification

### Task 9: Settings → Display → View distance

A slider from 20 to 30 (`uiStore.arenaViewUnits`) under HUD scale, and the zoom it gives in this window: "4 px per pixel · 27 units tall" at 1080p. The renderer re-zooms at once (Task 5's subscription).

**Files:**
- Modify: `packages/client/src/features/delve/hub/__tests__/SettingsPanel.test.tsx`
- Modify: `packages/client/src/features/delve/hub/SettingsPanel.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/hub/__tests__/SettingsPanel.test.tsx`:

Replace:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
```

with:

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
```

Replace:

```tsx
    useUIStore.setState({ isMuted: false, colorblindMode: 'none', hudScale: 1 });
  });

```

with:

```tsx
    useUIStore.setState({
      isMuted: false,
      colorblindMode: 'none',
      hudScale: 1,
      arenaViewUnits: 27,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

```

Replace:

```tsx
  it('shows the version, which the Delve has no TabBar for, and closes from Done', () => {
```

with:

```tsx
  it('sets View distance from 20 to 30 units, showing the zoom it gives in this window', () => {
    vi.stubGlobal('innerHeight', 1080);
    render(<SettingsPanel onClose={() => {}} />);
    const view = screen.getByTestId('view-distance');
    expect(view).toHaveAttribute('min', '20');
    expect(view).toHaveAttribute('max', '30');
    expect(screen.getByTestId('view-distance-value')).toHaveTextContent(
      '4 px per pixel · 27 units tall',
    );
    fireEvent.change(view, { target: { value: '20' } });
    expect(useUIStore.getState().arenaViewUnits).toBe(20);
    expect(localStorage.getItem('alloy:delve:viewUnits')).toBe('20');
    expect(screen.getByTestId('view-distance-value')).toHaveTextContent(
      '5 px per pixel · 21.6 units tall',
    );
  });

  it('shows the version, which the Delve has no TabBar for, and closes from Done', () => {
```


- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/SettingsPanel.test.tsx)`
Expected: FAIL, 1 failed (4 tests): `TestingLibraryElementError: Unable to find an element by: [data-testid="view-distance"]`.

- [ ] **Step 3: The slider**

In `packages/client/src/features/delve/hub/SettingsPanel.tsx`:

Replace:

```tsx
import { HUD_SCALE_RANGE, useUIStore } from '@/stores/uiStore';

```

with:

```tsx
import { HUD_SCALE_RANGE, VIEW_UNITS_RANGE, useUIStore } from '@/stores/uiStore';

```

Replace:

```tsx
import { Button, Chip, Dialog, Segmented } from '@/features/delve/kit';

```

with:

```tsx
import { Button, Chip, Dialog, Segmented } from '@/features/delve/kit';
import { arenaResolution, arenaZoom } from '@/features/delve/arena/camera';

```

Replace:

```tsx
 * the classic drawer (volumes, mute, colorblind mode), the HUD scale, and the
 * version, which the Delve has no TabBar to show.
```

with:

```tsx
 * the classic drawer (volumes, mute, colorblind mode), the HUD scale, View
 * distance, and the version, which the Delve has no TabBar to show.
```

Replace:

```tsx
  const hud = Math.round(ui.hudScale * 100);

```

with:

```tsx
  const hud = Math.round(ui.hudScale * 100);
  // What View distance gives in this window: its whole scale and the units it shows.
  const zoom = arenaZoom(window.innerHeight, arenaResolution(), ui.arenaViewUnits);

```

Replace:

```tsx
            onChange={(v) => ui.setHudScale(v / 100)}
          />
        </Section>
```

with:

```tsx
            onChange={(v) => ui.setHudScale(v / 100)}
          />
          <Slider
            id="view-distance"
            label="View distance"
            min={VIEW_UNITS_RANGE[0]}
            max={VIEW_UNITS_RANGE[1]}
            step={1}
            value={ui.arenaViewUnits}
            shown={ui.arenaViewUnits}
            onChange={(v) => ui.setArenaViewUnits(v)}
          />
          <p className="text-[14px] text-[var(--k-text-3)]" data-testid="view-distance-value">
            {zoom.scale} px per pixel · {Number(zoom.unitsTall.toFixed(1))} units tall
          </p>
        </Section>
```


- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/SettingsPanel.test.tsx)`
Expected: PASS (4 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . ; npx vitest run)`
Expected: the typecheck reports only X1's error; N + 21 tests in F + 2 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/__tests__/SettingsPanel.test.tsx src/features/delve/hub/SettingsPanel.tsx)
git add packages/client/src/features/delve/hub/__tests__/SettingsPanel.test.tsx packages/client/src/features/delve/hub/SettingsPanel.tsx
git commit -m "feat(client): Settings → View distance, 20 to 30 units, showing the zoom it gives" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 10: `aim-gestures.ts` goes, and the insets are four (integrator runs after 3A merges)

Runs on `ui/p3a` once 3A's rewrite has merged (the spec's sequencing: `ArenaHud.tsx` imports `DRAG_PX`, `classifyPress` and `isOverButton` from `aim-gestures.ts` until then), and after 3C's merge. By then 3A's pages pass `HudGrid`'s four insets, so the transitional typing goes too.

**Files:**
- Delete: `packages/client/src/features/delve/arena/aim-gestures.ts`, `packages/client/src/features/delve/__tests__/aim-gestures.test.ts`
- Modify: `packages/client/src/features/delve/arena/useArena.ts`, `packages/client/src/features/delve/training/useTrainingArena.ts`

- [ ] **Step 1: Check nothing else imports the old module**

Run: `grep -rln "aim-gestures" packages/client/src`
Expected: only `packages/client/src/features/delve/__tests__/aim-gestures.test.ts`. If `ArenaHud.tsx` (or anything else) is listed, 3A has not merged: stop.

- [ ] **Step 2: Delete it, and take the insets whole**

```bash
cd /c/Projects/alloy-ui-p3a
git rm packages/client/src/features/delve/arena/aim-gestures.ts packages/client/src/features/delve/__tests__/aim-gestures.test.ts
```

In `packages/client/src/features/delve/arena/useArena.ts`:

Replace:

```ts
    /** The HUD's insets; until the 3a page passes all four, the sides default to 0. */
    insets: Pick<Insets, 'top' | 'bottom'> & Partial<Insets>;
```

with:

```ts
    /** The screen the HUD covers (viewport px), from `HudGrid`. */
    insets: Insets;
```

Replace:

```ts
  return useArenaCore(hostRef, mode, { ...opts, insets: { left: 0, right: 0, ...opts.insets } });
```

with:

```ts
  return useArenaCore(hostRef, mode, opts);
```

In `packages/client/src/features/delve/training/useTrainingArena.ts`:

Replace:

```ts
    /** The HUD's insets; until the 3a page passes all four, the sides default to 0. */
    insets: Pick<Insets, 'top' | 'bottom'> & Partial<Insets>;
```

with:

```ts
    /** The screen the HUD covers (viewport px), from `HudGrid`. */
    insets: Insets;
```

Replace:

```ts
  const arena = useArenaCore(hostRef, mode, {
    ...opts,
    insets: { left: 0, right: 0, ...opts.insets },
  });
```

with:

```ts
  const arena = useArenaCore(hostRef, mode, opts);
```

- [ ] **Step 3: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors (3A's pages pass `Insets`, its fixture carries `buffs` and `map`, and the integrator has already pointed `useArenaCore`'s `floatPay` import at `arena/hud/`); the suite passes with 3 tests and 1 file fewer than before this task. On 3C's branch alone (old pages) this typing fails in `DelveRun.tsx` and `DelveTraining.tsx`, which is why it waits for 3A.

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/alloy-ui-p3a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/useArena.ts src/features/delve/training/useTrainingArena.ts)
git add packages/client/src/features/delve/arena/useArena.ts packages/client/src/features/delve/training/useTrainingArena.ts
git commit -m "refactor(client): aim-gestures.ts goes; the arena hooks take the HUD's four insets" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

- **After Task 9 (3C's branch):** `(cd packages/client && npx vitest run)` passes with N + 21 tests in F + 2 files; `npx tsc --noEmit -p .` reports only X1's error in 3A's `ArenaHud.test.tsx` (none once X1 is applied or 3A merges). The Delve E2E on `desktop` (`delve`, `delve-runes`, `delve-gamepad`, `delve-training`) pass unchanged with today's pages: the camera zooms to 4 px per sprite pixel at 1080p, and the old pages' `{ top, bottom }` insets still centre it.
- **After Task 10 (`ui/p3a`, with 3A and 3B merged):** typecheck clean, the client suite green, then the integrator's E2E updates.
- **E2E ids 3C keeps or adds:** `arena` (the canvas host) and `arena-controls` are kept; new: `move-hint`, `view-distance`, `view-distance-value`, and the Controls editor's `bind-pad-labels`, `bind-key-labels`, `bind-pad-journal`, `bind-key-journal`. 3C changes no id an E2E reads. The new zoomed-ancestor check is X4's snippet.
- **The pixel floor's frame time** (the spec's ripple note; measured on the scratch copy, Node, `FloorEngine` fed by the engine bot on a depth-10 floor, three seeds, 1,680 frames each at 60 fps, one view centred on the hero): at 1920×1080 today's view (35.1 × 19.7 units) painted in 2.58–2.71 ms (the engine's own paint average) with a p95 frame of 3.4–3.9 ms; v1's (48 × 27, the floor's width clipped to its 32 units) in 3.28–3.49 ms, p95 4.1–4.8 ms. That is +28%, under the 8 ms line, so nothing is lightened. A manual check in the browser (Performance panel, a busy depth-10 floor) is optional at the gate.
- **Manual, at the gate** (the spec's 1280×720, 1920×1080 and 2560×1440 pass): sprite pixels are 3, 4 and 5 screen px wide with no 5/6 shimmer; hold Alt over a floor of drops and every item and rune is named, plates stacking where they meet, and an Alt+Tab away and back leaves them hidden; L3 does the same on the pad; Settings → View distance changes the zoom at once.
