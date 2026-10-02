# Delve UI v1 · Phase 1 · 1B Shell and Input Plumbing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Delve the whole window and the input plumbing the kit's screens stand on, with no visual change of its own. Every `/delve*` route drops the letterbox and the TabBar. `--ui-scale` and `--hud-scale` follow the window in quarter steps. A prompt runtime (`kit/prompts.ts`) binds each screen's hotkeys and pad buttons for the topmost scope only, times the pad's taps and holds, and owns Esc, Enter and the pad's Menu outside live combat. The menu navigation scopes every marker lookup, steps sub tab lists with LT/RT, skips disabled tabs, starts on `[data-pad-first]` and never lands on `[data-pad-skip]`. `pickNext` stops skipping wide buttons, and the arena's Menu (its key and the pad's button) acts only while the fight is live. Two E2E guards keep Esc closing the dive's menu and the Training sheet. Today's keyboard and pad play, and the input-device lock, keep working.

**Architecture:** One new module, `features/delve/kit/prompts.ts`. It holds a registry of mounted `usePrompts` calls, keyed by the `[data-pad-scope]` each sits in, behind one shared window key listener (`attachPromptKeys`, held by every `usePrompts` and by AppShell on Delve routes), and a per-frame pad hand-off (`padPrompts`) that `use-gamepad-nav.ts` calls before its own defaults. The lookups (`topScope`, `scopedLast`), the carry capture (`captureNav`) and the scale rule (`uiScaleFor`, `hudScaleFor`, `useUiScale`) live there too. `gamepad-hub.ts` exports `isArenaLive()`, which gates the runtime and the arena's menu key so that each press has exactly one owner. AppShell sets `data-frame="full"`, the scale variables and the uiStore mirror. `index.css` releases the letterbox for that frame and keeps its ring off `.delve-ui`. No engine change.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, Vitest 3 (jsdom, Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md` at `fe9a488`. It covers decided items 1, 12, 15, 19 and 26, the "What changes" rows for AppShell, `index.css`, `arena/input.ts` and the gamepad files, the kit contract's `prompts.ts` and `useUiScale`, and "Phase 1 → 1B". The overview is `00-overview.md` in this folder.

---

**Base:** branch `ui/p1` at step 1·0 (`96d620b` and its follow-up `4b468c8`: `kit/types.ts`, the stub `kit/index.ts` with a stub `useUiScale`, and uiStore's `uiScale`, `hudScale` and `arenaViewUnits` with their setters). Nothing else needs to merge first. 1B runs in parallel with 1A and 1C. It touches no file they own, except `kit/index.ts`, where it replaces 1·0's stub (see "Cross-area needs").

The worktree (PowerShell; `<base>` is `ui/p1`'s tip):

```powershell
git -C C:\Projects\Alloy worktree add ..\alloy-ui-1b -b ui/1b <base>
$W = 'C:\Projects\alloy-ui-1b'; $R = 'C:\Projects\Alloy'
cmd /c mklink /J "$W\node_modules" "$R\node_modules"
cmd /c mklink /J "$W\packages\engine\node_modules" "$R\packages\engine\node_modules"
New-Item -ItemType Directory -Force "$W\packages\client\node_modules\@alloy" | Out-Null
Get-ChildItem -Force "$R\packages\client\node_modules" | Where-Object Name -ne '@alloy' | ForEach-Object { cmd /c mklink /J "$W\packages\client\node_modules\$($_.Name)" $_.FullName }
cmd /c mklink /J "$W\packages\client\node_modules\@alloy\engine" "$W\packages\engine"
```

Then build the engine once, so the client's junction has a bundle: `(cd packages/engine && npx tsup)`. This phase never changes the engine. Remove the junctions with `cmd /c rmdir <path>` when the area is merged, and never delete through them.

**Conventions:** the overview's shared conventions, which follow the runes overview and the 4a plan. In particular:
- **Run every command from the worktree's root.** Each command runs in a subshell, and every commit block starts with `cd /c/Projects/alloy-ui-1b`.
- **One commit per task.** The trailer goes as the last `-m`. Stage by path. Don't push or merge.
- **Line endings.** A fresh worktree checks out CRLF. Every existing file this plan edits is CRLF there; every file it creates is LF. Keep each file's endings: the Edit tool does, so never rewrite a file with a script that normalises them.
- **Prettier.** Always run it as `npx prettier --end-of-line auto`. `packages/client/src/index.css` is not Prettier-clean at the base, so it is never formatted, only hand-edited. Every other file this plan edits was clean at the base (checked), and the code below is already formatted, so the commit blocks' `--write` changes nothing if you typed it as written.
- **Edits.** They use the 4a plan's edit language ("Replace: … with: …", "Append at the end of the file:", "Create `f`:"). Each `In` names a repo-relative path, every anchor is unique in its file at that point, and each file's edits apply top to bottom. The scratch copy checked this: every edit below, applied in order to `4b468c8` with `scratchpad/runes/w0/apply.mjs`, gives exactly the tested files.
- **Every task** runs the whole client suite and the client typecheck. At the base the suite has 99 files and 881 tests, and the typecheck is clean.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Engine build (once) | `(cd packages/engine && npx tsup)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client tests | `(cd packages/client && npx vitest run)`, or some files: `(cd packages/client && npx vitest run <paths>)` |
| Client build | `(pnpm -F @alloy/client build)` |
| E2E | `(cd packages/client && npx playwright test -c playwright.scratch.config.ts <specs> --project=<name>)`. Pass `--project=` with the `=`: a bare `--project desktop` swallows the spec path. |

**Dev server on 5291** (Tasks 6 and 7). The overview's 5288 belongs to the main checkout, so this area uses a spare port. The PowerShell block stops whatever owns the port, starts a detached Vite from this worktree, waits for a 200 and prints `True`:

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5291 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\alloy-ui-1b\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5291 --strictPort --force --host'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5291').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

**E2E scratch config**, `packages/client/playwright.scratch.config.ts`. Create it for Task 6, delete it at the end of Task 7, and never commit it. It reuses the 5291 server instead of Playwright's own on 5199, and drops the responsive project:

```ts
import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  globalSetup: undefined,
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://localhost:5291' },
  webServer: { command: 'echo reuse', url: 'http://localhost:5291', reuseExistingServer: true },
  projects: (base.projects ?? []).filter((p) => p.name !== 'responsive'),
});
```

A timeout under load that passes on a rerun (`-g <test> --repeat-each 2`) is flakiness. A consistent failure is a regression: debug it with logging and the page's state, not with guesses or longer timeouts.

**Files:**

| File | Change |
|---|---|
| `packages/client/src/features/gamepad/spatial-nav.ts` | `pickNext` measures "across" as the gap between the boxes (decided item 26) |
| `packages/client/src/features/gamepad/gamepad-hub.ts` | exports `isArenaLive()` |
| `packages/client/src/features/delve/kit/prompts.ts` (new) | the prompt runtime: `topScope`, `scopedLast`, the registry and `usePrompts`, `attachPromptKeys` (the shared key listener, with the Esc and Enter rules), `padPrompts` (the pad's tap and hold timing), `captureNav`/`navCapture`, `uiScaleFor`, `hudScaleFor` and `useUiScale` |
| `packages/client/src/features/delve/kit/index.ts` | replaces 1·0's stub `useUiScale` with re-exports of the contract's `prompts.ts` functions |
| `packages/client/src/features/gamepad/use-gamepad-nav.ts` | routes every button but A and the D-pad to `padPrompts` first; scoped `press` and `stepTabs`; LT/RT step `data-pad-tabs="sub"`; disabled tabs skipped; `data-pad-first`; `data-pad-skip`; `captureNav` |
| `packages/client/src/features/delve/arena/input.ts` | the menu key only: acts only while `isArenaLive()`, through a new `pressMenu()` (`scopedLast('[data-pad-menu]')`); skips a key already handled and marks its own handled (`e.preventDefault()`) |
| `packages/client/src/features/delve/arena/useArenaCore.ts` | `padFrame`'s Menu line only: `pressMenu()` (given to 1B for Phase 1; 3C owns the file in Phase 3) |
| `packages/client/src/components/AppShell.tsx` | `data-frame="full"` and `hideTabBar` on `/delve*`; `--ui-scale` and `--hud-scale` on `:root`, recomputed on resize and on a `hudScale` change, with `uiScale` mirrored into uiStore; the prompt keys held on Delve routes |
| `packages/client/src/index.css` | `.app-frame[data-frame='full']` releases the letterbox; the gamepad ring skips `.delve-ui` (CRLF, hand-edit, never format) |
| `packages/client/src/features/delve/kit/__tests__/prompts.test.ts` (new) | chords, the tap and hold split, the topmost scope only, an input focused, `defaultPrevented`, arena live; the Esc and Enter rules; `captureNav`; the scale rule |
| `packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts` | sub tabs, first focus, the scoped back, disabled tabs, `data-pad-skip`, prompts taking their buttons, a hold, a carried card |
| `packages/client/src/features/gamepad/__tests__/gamepad.test.ts` | `pickNext` reaches a wide button below a small off-centre one |
| `packages/client/src/features/delve/__tests__/arena-input.test.ts` | the menu-key tests run with the arena live, plus one for live-only, scoped and handled keys. 3C owns this file in Phase 3; in Phase 1 only these lines change. |
| `packages/client/src/components/__tests__/AppShell.test.tsx` (new) | the full frame and no TabBar on Delve routes only, the scale variables and the mirror, Esc bound on Delve routes only (the global listener) |
| `packages/client/e2e/delve.spec.ts`, `packages/client/e2e/delve-training.spec.ts` | D09 and T03: Esc opens and closes the kebab menu once, closes only the Controls editor, and closes the Training sheet. They are appended at the end of each describe, away from the lines the Phase 1 E2E step changes (`tab-bag`, `tab-abilities`). |

`packages/client/src/stores/uiStore.ts` needs no change: step 1·0 already added `uiScale`, `hudScale` and `arenaViewUnits` with their setters, and 1B only calls `setUiScale`.

**Cross-area needs:**
- **`kit/index.ts` (1·0 now, 1D later).** Task 2 replaces 1·0's stub `useUiScale` with this line: `export { captureNav, scopedLast, topScope, usePrompts, useUiScale } from './prompts';`. The coordinator assigned that replacement to 1B. 1D then adds the component exports around it and leaves the line as it is.
- **1A (`Tabs`, `PromptBar`, `Button`).** They depend on what 1B reads:
  - A `level: 'top'` tab list carries `data-pad-tabs` (empty value), and a `level: 'sub'` one carries `data-pad-tabs="sub"`.
  - Each tab is `role="tab"` with `aria-selected`. A disabled tab carries `disabled` or `aria-disabled="true"`; LB/RB and LT/RT skip both.
  - A `PromptBar` `asButton` button carries `data-pad-skip`, and `padBack` adds `data-pad-back`.
  - `Tabs` binds no keys (the coordinator's note to 1A). The digits that skip disabled tabs are 1D's prompts.
- **1D (the hub and dialogs).** Rules the runtime gives the screens:
  - **A is never a prompt's.** It always presses the focused control, so a prompt bound to pad `a` is display only. The D-pad reaches a screen only through `captureNav`.
  - **One owner per press.** A prompt bound to `Escape`, to pad `b` or to pad `menu` takes the press instead of the marker rule, never as well. The hub's "Menu" prompt can therefore be `{ binding: { key: 'Escape', pad: 'b' }, asButton: true, padBack: true, onPress }`, or have no `onPress` and leave the press to its `data-pad-back` button. Either way the system menu opens once.
  - **Esc, Enter and the pad's Menu by default** (no prompt bound):
    - Esc, or the bound menu key, presses the topmost scope's `[data-pad-back]`, else its `[data-pad-menu]`.
    - Enter, with nothing focused, presses `[data-pad-menu]`.
    - The pad's Menu presses `[data-pad-menu]`, else `[data-pad-back]`.
    - So the hub needs no Enter or Start prompt for the Delve button: its `data-pad-menu` is enough.
  - **Enter and Space.** A plain Enter or Space prompt never fires while a control has focus. Ctrl+Enter does.
  - **Full compare** is `{ key: 'ShiftLeft', pad: 'lt', whileHeld: true }` (with `ShiftRight` in a key list if wanted). It gets `onHold(true)` and `onHold(false)` from both devices.
  - **The Apply hold** is `{ key: 'Enter', ctrl: true, pad: 'y', padHold: 600 }` with `onHold`. On the keyboard, Ctrl+Enter fires its `onPress` if it has one, else `onHold(true)`.
  - **`usePrompts(prompts, scopeRef)`.** The prompts bind while `scopeRef`'s nearest `[data-pad-scope]` is the topmost visible one. With no `scopeRef` they bind only while no scope is open, so pass the screen's root ref.
  - **`ControlsPanel.test.tsx`.** If `ControlsPanel` comes to import the kit (its `Dialog`, then `prompts.ts`), the test's `gamepad-hub` mock needs the new export. Replace `vi.mock('@/features/gamepad/gamepad-hub', () => ({` with `vi.mock('@/features/gamepad/gamepad-hub', () => ({ isArenaLive: () => false,`, or spread `...(await orig<object>())` as `DelveTraining.test.tsx` does. Otherwise the window key listener throws on its first key.
- **One HUD rule (after 1A and 1B merge).** 1A's `kit/zoom.ts` exports `hudZoom(ui, hudSetting)`, the same formula as this plan's `hudScaleFor` (both are `max(0.75, round(ui × setting × 4) / 4)`). The two areas build in parallel, so neither can import the other's file. Once both are merged, the controller makes the rule live once. In `packages/client/src/features/delve/kit/prompts.ts`:
  - Replace `import type { Binding, Prompt } from './types';` with `import type { Binding, Prompt } from './types';` followed by a new line, `import { hudZoom } from './zoom';`.
  - Replace the three lines from `export function hudScaleFor(ui: number, setting: number): number {` to its closing `}` with `export const hudScaleFor = hudZoom;`.

  The callers (`useUiScale`, AppShell and `prompts.test.ts`) and their tests stay as they are. `zoom.ts` imports only uiStore and the kit types, so this makes no import cycle.

**Decisions this plan makes** (where the spec leaves room):
1. **Where the global Esc and Enter listener lives** (the coordinator's revision 2: one bubble-phase window listener, active on `/delve*` whether or not any prompts are registered, inert while live). AppShell installs it next to its `useGamepadNav()` call: `useEffect(() => (isDelve ? attachPromptKeys() : undefined), [isDelve])`. Phase 1's `DelveRun` and `DelveTraining` register no prompts, and with this they keep Esc closing the kebab menu and the Training sheet (Task 6's E2E). It is the one listener `usePrompts` holds too, reference-counted, so the screens' prompts always run first and a key they handle is `preventDefault`ed before the rules see it. The classic screens never get it.
2. **The uiStore mirror.** uiStore's `hudScale` is the Settings value (1·0), so only `uiScale` is mirrored. The effective HUD zoom is `hudScaleFor(uiScale, hudScale)`, which is what `useUiScale().hud` and `--hud-scale` both use.
3. **The pad's Menu outside combat** presses the topmost scope's `[data-pad-menu]`, else its `[data-pad-back]`. The fallback keeps today's behaviour, where Menu closes the dive's kebab menu and the Training sheet (both have a back and no menu). One side effect: on the DPS Lab, Menu (like Esc) now goes back to Training.
4. **Esc and the bound menu key** follow the same rule outside combat.
5. **`whileHeld` covers the pad too** (LT's Full compare). For the Y tap and hold pair, the prompt with `padHold` is the hold and the other one is the tap.
6. **Which tab list LB/RB steps.** `stepTabs` takes the last visible top-level list in the topmost scope, as item 19 says, where today's code took the first visible one. No screen today shows two in one scope.
7. **Phase 1 side effects, both in surfaces Phase 3 replaces:**
   - At the legacy door choice, Esc and Menu no longer open the kebab menu hidden under the overlay. That overlay is a scope with no markers.
   - Over a paused dive, Esc presses the open sheet's or menu's back.

---

## Chunk 1: The lookups and the prompt runtime

### Task 1: `pickNext` measures the gap across, so wide buttons aren't skipped

Today "across" is the distance between centres. A full-width button right below a small chip on the right scores worse than a small button further down under the chip, so the D-pad skips it (audit §7, the Delve button). The gap between the two boxes on the cross axis (0 when they overlap) fixes that and keeps every existing case.

**Files:**
- Modify: `packages/client/src/features/gamepad/spatial-nav.ts`
- Modify: `packages/client/src/features/gamepad/__tests__/gamepad.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/client/src/features/gamepad/__tests__/gamepad.test.ts`

Replace:

```ts
  it('stays put at the edge', () => {
    expect(pickNext(grid[0], grid, 'left')).toBeNull();
  });
});
```

with:

```ts
  it('stays put at the edge', () => {
    expect(pickNext(grid[0], grid, 'left')).toBeNull();
  });

  it('reaches a wide button right below a small off-centre one, not a small one further down', () => {
    const chip: NavRect = { id: 'chip', x: 900, y: 0, w: 40, h: 20 };
    const delve: NavRect = { id: 'delve', x: 0, y: 100, w: 1000, h: 40 };
    const far: NavRect = { id: 'far', x: 900, y: 200, w: 40, h: 20 };
    expect(pickNext(chip, [chip, delve, far], 'down')?.id).toBe('delve');
    expect(pickNext(far, [chip, delve, far], 'up')?.id).toBe('delve');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `(cd packages/client && npx vitest run src/features/gamepad/__tests__/gamepad.test.ts)`
Expected: 1 failed, 28 passed. The new test fails with `expected 'far' to be 'delve'`.

- [ ] **Step 3: Implement**

In `packages/client/src/features/gamepad/spatial-nav.ts`

Replace:

```ts
  right: { x: 1, y: 0 },
};

/**
 * The control to move focus to: the nearest one whose centre lies in the
 * pressed direction, favouring ones straight ahead over ones off to the side.
 * Null at the edge.
 */
```

with:

```ts
  right: { x: 1, y: 0 },
};

/** The gap between two spans on one axis, 0 when they overlap. */
function gap(a: number, aLen: number, b: number, bLen: number): number {
  return Math.max(0, Math.max(a, b) - Math.min(a + aLen, b + bLen));
}

/**
 * The control to move focus to: the nearest one whose centre lies in the
 * pressed direction, favouring ones straight ahead over ones off to the side.
 * "Off to the side" is the gap between the two boxes across the direction (0
 * when they overlap), so a wide control right below is never skipped for a
 * small one further on. Null at the edge.
 */
```

Replace:

```ts
    const across = Math.abs(dx * a.y - dy * a.x);
```

with:

```ts
    const across = a.x === 0 ? gap(from.x, from.w, c.x, c.w) : gap(from.y, from.h, c.y, c.h);
```

- [ ] **Step 4: Run the suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/gamepad/__tests__/gamepad.test.ts)`
Expected: 29 passed (the grid's four cases still pass: each straight-ahead pick overlaps on the cross axis).

Run: `(cd packages/client && npx vitest run) && (cd packages/client && npx tsc --noEmit -p .)`
Expected: 99 files, 882 tests passed; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-1b
(cd packages/client && npx prettier --end-of-line auto --write src/features/gamepad/spatial-nav.ts src/features/gamepad/__tests__/gamepad.test.ts)
git add packages/client/src/features/gamepad/spatial-nav.ts packages/client/src/features/gamepad/__tests__/gamepad.test.ts
git commit -m "fix(client): the pad's spatial focus measures the gap across, so it no longer skips a wide button" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: The prompt runtime (`kit/prompts.ts`) and `isArenaLive()`

The kit contract's `prompts.ts` (decided item 19), with `useUiScale`.

**Lookups.** `topScope()` returns the last visible `[data-pad-scope]`, else the document. `scopedLast(selector)` returns the last visible match inside it.

**Registry.** `usePrompts(prompts, scopeRef?)` registers the prompts while mounted. A prompt binds only while its ref's nearest scope is `topScope()`; with no ref it binds only while no scope is open.

**Keys.** One shared window listener (`attachPromptKeys`, reference-counted) handles every key:
- It skips repeats, keys typed into a text field, keys already `defaultPrevented`, and everything while `isArenaLive()`. A plain Enter or Space also stays with a focused control.
- A prompt whose key and Ctrl/Alt match takes the key and `preventDefault`s it. A `whileHeld` prompt gets `onHold(true)` on the key's down, and `onHold(false)` on its up or on a window blur.
- Otherwise Esc (or the bound menu key) presses the scope's back, else its menu. Enter with nothing focused presses its menu.

**Pad.** `padPrompts(pressed, held, now)` is the navigation's hand-off once a frame. It returns the presses a prompt took:
- A lone tap fires on its press.
- A tap that shares its button with a `padHold` prompt fires on a release under 400 ms. The hold fires `onHold(true)` at `padHold`, and a release in between fires neither.
- `whileHeld` gets `onHold(true)` on the press and `onHold(false)` on the release.

**Carry.** `captureNav(handler)` sets the carried card's handler, and `navCapture()` reads it.

**Scale.** `uiScaleFor` and `hudScaleFor` are the spec's quarter-step formulas (decided item 1). `useUiScale` reads uiStore's mirrored `uiScale` and its `hudScale` setting.

`gamepad-hub.ts` exports `isArenaLive()`, and `kit/index.ts` swaps 1·0's stub for the real exports.

**Files:**
- Create: `packages/client/src/features/delve/kit/prompts.ts`
- Create: `packages/client/src/features/delve/kit/__tests__/prompts.test.ts`
- Modify: `packages/client/src/features/gamepad/gamepad-hub.ts`
- Modify: `packages/client/src/features/delve/kit/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/kit/__tests__/prompts.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import {
  captureNav,
  hudScaleFor,
  navCapture,
  padPrompts,
  scopedLast,
  topScope,
  uiScaleFor,
  usePrompts,
  useUiScale,
} from '../prompts';
import type { Prompt } from '../types';
import { setArenaLive } from '@/features/gamepad/gamepad-hub';
import { PAD_BUTTONS, type PadButton } from '@/features/gamepad/gamepad';
import { useUIStore } from '@/stores/uiStore';

/** Give `el` a box, so it counts as visible. */
function shown<T extends HTMLElement>(el: T): T {
  el.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 });
  return el;
}

function add<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  parent: HTMLElement = document.body,
): HTMLElementTagNameMap[K] {
  const el = parent.appendChild(shown(document.createElement(tag)));
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const keydown = (code: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const e = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
const keyup = (code: string) =>
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));

/** The pad's buttons, with `down` held. */
const held = (...down: PadButton[]) =>
  Object.fromEntries(PAD_BUTTONS.map((b) => [b, down.includes(b)])) as Record<PadButton, boolean>;

afterEach(() => {
  setArenaLive(false);
  document.body.replaceChildren();
  (document.activeElement as HTMLElement | null)?.blur?.();
});

describe('topScope and scopedLast', () => {
  it('take the last visible scope, and the last visible match inside it', () => {
    expect(topScope()).toBe(document);
    const a = add('div', { 'data-pad-scope': '' });
    const b = add('div', { 'data-pad-scope': '' });
    const hidden = document.body.appendChild(document.createElement('div'));
    hidden.setAttribute('data-pad-scope', ''); // no box: not visible
    expect(topScope()).toBe(b);
    add('button', { 'data-pad-back': '' }, a);
    const first = add('button', { 'data-pad-back': '' }, b);
    const last = add('button', { 'data-pad-back': '' }, b);
    expect(scopedLast('[data-pad-back]')).toBe(last);
    last.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
    expect(scopedLast('[data-pad-back]')).toBe(first);
    b.remove();
    expect(scopedLast('[data-pad-menu]')).toBeNull();
  });
});

describe('usePrompts on the keyboard', () => {
  it('chords: Ctrl+Enter and Alt+Arrow fire only with their modifiers; a key list fires on any', () => {
    const apply = vi.fn();
    const left = vi.fn();
    const next = vi.fn();
    renderHook(() =>
      usePrompts([
        { id: 'apply', label: 'Apply', binding: { key: 'Enter', ctrl: true }, onPress: apply },
        { id: 'left', label: 'Left', binding: { key: 'ArrowLeft', alt: true }, onPress: left },
        { id: 'next', label: 'Next', binding: { key: ['BracketRight', 'KeyN'] }, onPress: next },
      ]),
    );
    keydown('Enter');
    keydown('ArrowLeft');
    expect(apply).not.toHaveBeenCalled();
    expect(left).not.toHaveBeenCalled();
    expect(keydown('Enter', { ctrlKey: true }).defaultPrevented).toBe(true);
    keydown('ArrowLeft', { altKey: true });
    keydown('KeyN');
    keydown('BracketRight', { ctrlKey: true }); // an extra modifier: not this binding
    expect([apply.mock.calls.length, left.mock.calls.length, next.mock.calls.length]).toEqual([
      1, 1, 1,
    ]);
    keydown('KeyN', { repeat: true });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('only the topmost scope binds: a scope opened over the screen silences its prompts', () => {
    const screen = add('div', { 'data-pad-scope': '' });
    const inner = add('div', {}, screen);
    const ref: RefObject<HTMLElement | null> = { current: inner };
    const salvage = vi.fn();
    const pageWide = vi.fn();
    renderHook(() => {
      usePrompts(
        [{ id: 's', label: 'Salvage', binding: { key: 'Delete' }, onPress: salvage }],
        ref,
      );
      usePrompts([{ id: 'p', label: 'Page', binding: { key: 'KeyP' }, onPress: pageWide }]);
    });
    keydown('Delete');
    expect(salvage).toHaveBeenCalledTimes(1);
    keydown('KeyP'); // bound to the document, but a scope is open
    expect(pageWide).not.toHaveBeenCalled();
    const dialog = add('div', { 'data-pad-scope': '' });
    keydown('Delete');
    expect(salvage).toHaveBeenCalledTimes(1);
    dialog.remove();
    screen.remove();
    keydown('KeyP');
    expect(pageWide).toHaveBeenCalledTimes(1);
  });

  it('a prompt whose ref is unmounted binds nothing', () => {
    const press = vi.fn();
    renderHook(() =>
      usePrompts([{ id: 'x', label: 'X', binding: { key: 'KeyX' }, onPress: press }], createRef()),
    );
    keydown('KeyX');
    expect(press).not.toHaveBeenCalled();
  });

  it('ignores keys typed into an input, a disabled or display-only prompt, and a key already handled', () => {
    const lock = vi.fn();
    const off = vi.fn();
    renderHook(() =>
      usePrompts([
        { id: 'show', label: 'Select', binding: { key: 'KeyS' } },
        { id: 'off', label: 'Off', binding: { key: 'KeyO' }, onPress: off, disabled: true },
        { id: 'lock', label: 'Lock', binding: { key: 'KeyL' }, onPress: lock },
      ]),
    );
    const field = add('input');
    field.focus();
    keydown('KeyL', {}, field);
    expect(lock).not.toHaveBeenCalled();
    field.blur();
    const prevent = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', prevent, true);
    keydown('KeyL');
    window.removeEventListener('keydown', prevent, true);
    expect(lock).not.toHaveBeenCalled();
    expect(keydown('KeyS').defaultPrevented).toBe(false);
    keydown('KeyO');
    expect(off).not.toHaveBeenCalled();
    keydown('KeyL');
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('is inert while the arena is live, Esc and Enter included', () => {
    const lock = vi.fn();
    const back = add('button', { 'data-pad-back': '' });
    const clicks = vi.fn();
    back.addEventListener('click', clicks);
    renderHook(() =>
      usePrompts([{ id: 'lock', label: 'Lock', binding: { key: 'KeyL' }, onPress: lock }]),
    );
    setArenaLive(true);
    keydown('KeyL');
    expect(keydown('Escape').defaultPrevented).toBe(false);
    expect(lock).not.toHaveBeenCalled();
    expect(clicks).not.toHaveBeenCalled();
    setArenaLive(false);
    keydown('Escape');
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('a held key: onHold(true) on down, onHold(false) on up or a window blur', () => {
    const compare = vi.fn();
    renderHook(() =>
      usePrompts([
        {
          id: 'compare',
          label: 'Full compare',
          binding: { key: 'ShiftLeft', whileHeld: true, pad: 'lt' },
          onHold: compare,
        },
      ]),
    );
    keydown('ShiftLeft', { shiftKey: true });
    keyup('ShiftLeft');
    keydown('ShiftLeft', { shiftKey: true });
    window.dispatchEvent(new Event('blur'));
    expect(compare.mock.calls).toEqual([[true], [false], [true], [false]]);
  });
});

describe('the Esc and Enter rules', () => {
  it("Esc presses the topmost scope's back, else its menu; a prompt bound to Esc takes it instead", () => {
    const clicks: string[] = [];
    const button = (name: string, attr: string, parent?: HTMLElement) =>
      add('button', { [attr]: '' }, parent).addEventListener('click', () => clicks.push(name));
    button('page-back', 'data-pad-back');
    const stop = add('div', { 'data-pad-scope': '' });
    button('stop-menu', 'data-pad-menu', stop);
    const { unmount } = renderHook(() => usePrompts([]));
    keydown('Escape');
    expect(clicks).toEqual(['stop-menu']);
    button('stop-back', 'data-pad-back', stop);
    keydown('Escape');
    expect(clicks).toEqual(['stop-menu', 'stop-back']);
    unmount();
    const mine = vi.fn();
    renderHook(() =>
      usePrompts([{ id: 'esc', label: 'Back', binding: { key: 'Escape' }, onPress: mine }], {
        current: stop,
      }),
    );
    keydown('Escape');
    expect(mine).toHaveBeenCalledTimes(1);
    expect(clicks).toHaveLength(2);
  });

  it('Enter presses the menu only while no control has focus, and never fights a focused button', () => {
    const delve = vi.fn();
    const menu = add('button', { 'data-pad-menu': '' });
    menu.addEventListener('click', delve);
    const plainEnter = vi.fn();
    renderHook(() =>
      usePrompts([{ id: 'go', label: 'Go', binding: { key: 'Enter' }, onPress: plainEnter }]),
    );
    const other = add('button');
    other.focus();
    expect(keydown('Enter', {}, other).defaultPrevented).toBe(false);
    other.blur();
    expect(plainEnter).not.toHaveBeenCalled();
    expect(delve).not.toHaveBeenCalled();
    keydown('Enter');
    expect(plainEnter).toHaveBeenCalledTimes(1); // the screen's own Enter prompt comes first
  });

  it('Enter with nothing focused and no Enter prompt presses the menu', () => {
    const delve = vi.fn();
    add('button', { 'data-pad-menu': '' }).addEventListener('click', delve);
    renderHook(() => usePrompts([]));
    keydown('Enter');
    keydown('Enter', { ctrlKey: true });
    expect(delve).toHaveBeenCalledTimes(1);
  });
});

describe('padPrompts: the tap and the hold', () => {
  const remove = vi.fn();
  const apply = vi.fn();
  const prompts: Prompt[] = [
    { id: 'remove', label: 'Remove', binding: { key: 'Delete', pad: 'y' }, onPress: remove },
    {
      id: 'apply',
      label: 'Apply',
      binding: { key: 'Enter', ctrl: true, pad: 'y', padHold: 600 },
      onHold: apply,
    },
  ];
  const none = new Set<PadButton>();
  const y = new Set<PadButton>(['y']);

  afterEach(() => {
    remove.mockReset();
    apply.mockReset();
  });

  it('a tap fires on its release under 400 ms; a hold at 600 ms; a release between fires neither', () => {
    renderHook(() => usePrompts(prompts));
    expect(padPrompts(y, held('y'), 1000)).toEqual(y);
    expect(remove).not.toHaveBeenCalled(); // not on the press: it might become a hold
    padPrompts(none, held(), 1300);
    expect(remove).toHaveBeenCalledTimes(1);

    padPrompts(y, held('y'), 2000);
    padPrompts(none, held('y'), 2599);
    expect(apply).not.toHaveBeenCalled();
    padPrompts(none, held('y'), 2600);
    padPrompts(none, held('y'), 2700);
    padPrompts(none, held(), 2800);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(true);
    expect(remove).toHaveBeenCalledTimes(1);

    padPrompts(y, held('y'), 3000);
    padPrompts(none, held(), 3500);
    expect([remove.mock.calls.length, apply.mock.calls.length]).toEqual([1, 1]);
  });

  it('a tap alone fires on its press; a display-only prompt takes nothing', () => {
    const salvage = vi.fn();
    renderHook(() =>
      usePrompts([
        { id: 'salvage', label: 'Salvage', binding: { pad: 'x' }, onPress: salvage },
        { id: 'select', label: 'Select', binding: { pad: 'view' } },
      ]),
    );
    const pressed = new Set<PadButton>(['x', 'view']);
    expect(padPrompts(pressed, held('x', 'view'), 0)).toEqual(new Set(['x']));
    expect(salvage).toHaveBeenCalledTimes(1);
    padPrompts(none, held(), 100);
  });

  it('a held trigger: onHold(true) on the press, onHold(false) on the release', () => {
    const compare = vi.fn();
    renderHook(() =>
      usePrompts([
        {
          id: 'compare',
          label: 'Full compare',
          binding: { key: 'ShiftLeft', pad: 'lt', whileHeld: true },
          onHold: compare,
        },
      ]),
    );
    padPrompts(new Set(['lt']), held('lt'), 0);
    padPrompts(none, held('lt'), 900);
    padPrompts(none, held(), 1000);
    expect(compare.mock.calls).toEqual([[true], [false]]);
  });

  it('answers only the topmost scope', () => {
    const scope = add('div', { 'data-pad-scope': '' });
    renderHook(() => usePrompts(prompts, { current: scope }));
    add('div', { 'data-pad-scope': '' });
    expect(padPrompts(y, held('y'), 0).size).toBe(0);
    padPrompts(none, held(), 100);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('captureNav', () => {
  it('holds the handler until released; an older release leaves a newer one', () => {
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = captureNav(first);
    expect(navCapture()).toBe(first);
    const releaseSecond = captureNav(second);
    releaseFirst();
    expect(navCapture()).toBe(second);
    releaseSecond();
    expect(navCapture()).toBeNull();
  });
});

describe('the UI scale', () => {
  it('--ui-scale fits 1920×1080 in quarter steps, rounding down, from 0.75 to 2', () => {
    expect(uiScaleFor(1280, 720)).toBe(0.75);
    expect(uiScaleFor(1600, 900)).toBe(0.75);
    expect(uiScaleFor(1920, 1080)).toBe(1);
    expect(uiScaleFor(1920, 1200)).toBe(1);
    expect(uiScaleFor(2560, 1440)).toBe(1.25);
    expect(uiScaleFor(2560, 1080)).toBe(1);
    expect(uiScaleFor(3840, 2160)).toBe(2);
    expect(uiScaleFor(7680, 4320)).toBe(2);
  });

  it('--hud-scale is the UI scale times the HUD setting, to the nearest quarter, at least 0.75', () => {
    expect(hudScaleFor(1, 1)).toBe(1);
    expect(hudScaleFor(1, 1.25)).toBe(1.25);
    expect(hudScaleFor(1.25, 1.25)).toBe(1.5);
    expect(hudScaleFor(0.75, 0.8)).toBe(0.75);
    expect(hudScaleFor(2, 0.8)).toBe(1.5);
  });

  it('useUiScale reads the mirrored UI scale and the HUD setting', () => {
    const { result } = renderHook(() => useUiScale());
    act(() => {
      useUIStore.getState().setUiScale(1.25);
      useUIStore.getState().setHudScale(1.25);
    });
    expect(result.current).toEqual({ ui: 1.25, hud: 1.5 });
    act(() => {
      useUIStore.getState().setUiScale(1);
      useUIStore.getState().setHudScale(1);
    });
    localStorage.removeItem('alloy:delve:hudScale');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit)`
Expected: the file fails to load with `Error: Failed to resolve import "../prompts" from "src/features/delve/kit/__tests__/prompts.test.ts". Does the file exist?`. The output shows `Test Files 1 failed` and `no tests`.

- [ ] **Step 3: Implement**

In `packages/client/src/features/gamepad/gamepad-hub.ts`

Replace:

```ts
/** The pad as of this frame (sticks and held buttons), or null with no pad. */
```

with:

```ts
/** Whether the arena owns the controller, Esc and the menu key now (`setArenaLive`). */
export function isArenaLive(): boolean {
  return arenaLive;
}

/** The pad as of this frame (sticks and held buttons), or null with no pad. */
```

Create `packages/client/src/features/delve/kit/prompts.ts`:

```ts
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { isArenaLive } from '@/features/gamepad/gamepad-hub';
import type { PadButton } from '@/features/gamepad/gamepad';
import type { NavDir } from '@/features/gamepad/spatial-nav';
import { useControlsStore } from '@/stores/controlsStore';
import { useUIStore } from '@/stores/uiStore';
import type { Binding, Prompt } from './types';

/**
 * The prompt runtime (Delve UI v1, decided item 19). A screen's prompts bind
 * their keys and pad buttons while it is mounted, for the topmost visible
 * `[data-pad-scope]` only. With no prompt taking a key, Esc (or the bound menu
 * key) presses the topmost scope's `[data-pad-back]`, else its
 * `[data-pad-menu]`, and Enter presses its `[data-pad-menu]` while no control
 * has focus. Everything here is inert while the arena is live: it owns Esc,
 * the menu key and the pad then. A handled key is `preventDefault`ed, and a
 * key already prevented is skipped, so no press acts twice.
 */

/** A pad tap that shares its button with a hold fires on a release under this. */
export const TAP_MAX_MS = 400;
/** A pad hold's default length (`Binding.padHold`). */
export const HOLD_MS = 600;

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** The topmost (last) visible `[data-pad-scope]`, or the document when none is open. */
export function topScope(): HTMLElement | Document {
  const scopes = [...document.querySelectorAll<HTMLElement>('[data-pad-scope]')].filter(visible);
  return scopes.at(-1) ?? document;
}

/** The last visible match for `selector` inside `topScope()`. */
export function scopedLast(selector: string): HTMLElement | null {
  return [...topScope().querySelectorAll<HTMLElement>(selector)].filter(visible).at(-1) ?? null;
}

// ── The registry ──────────────────────────────────────────────────────────

interface Entry {
  prompts: Prompt[];
  scopeRef?: RefObject<HTMLElement | null>;
}

const entries = new Set<Entry>();

/** The scope an entry binds in: its ref's nearest `[data-pad-scope]`, else the document; null while its ref is unmounted. */
function scopeOf(entry: Entry): HTMLElement | Document | null {
  if (!entry.scopeRef) return document;
  const el = entry.scopeRef.current;
  if (!el) return null;
  return el.closest<HTMLElement>('[data-pad-scope]') ?? document;
}

/** The enabled prompts of the topmost scope (none while the arena is live). */
function activePrompts(): Prompt[] {
  if (isArenaLive()) return [];
  const top = topScope();
  return [...entries]
    .filter((e) => scopeOf(e) === top)
    .flatMap((e) => e.prompts)
    .filter((p) => !p.disabled && (p.onPress || p.onHold));
}

// ── Keys ──────────────────────────────────────────────────────────────────

const MODIFIER = /^(Alt|Control|Shift|Meta)/;

function codes(b: Binding): string[] {
  if (b.key === undefined) return [];
  return Array.isArray(b.key) ? b.key : [b.key];
}

/** The key is one of the binding's, with exactly its Ctrl and Alt (a modifier key itself ignores them). */
function keyMatches(b: Binding, e: KeyboardEvent): boolean {
  if (!codes(b).includes(e.code)) return false;
  return MODIFIER.test(e.code) || (!!b.ctrl === e.ctrlKey && !!b.alt === e.altKey);
}

/** Text entry keeps every key. */
function typing(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLInputElement && t.type !== 'range' && t.type !== 'checkbox')
  );
}

/** Keys held down for a `whileHeld` prompt, by code. */
const keysHeld = new Map<string, Prompt>();

const ENTER = new Set(['Enter', 'NumpadEnter']);

function onKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.repeat || isArenaLive() || typing(e.target)) return;
  const plain = !e.ctrlKey && !e.altKey;
  const focused = document.activeElement;
  // A focused control keeps Enter and Space: its own press never fights a prompt.
  const hasFocus = focused instanceof HTMLElement && focused !== document.body;
  if (hasFocus && plain && (ENTER.has(e.code) || e.code === 'Space')) return;
  const prompt = activePrompts().find((p) => keyMatches(p.binding, e));
  if (prompt) {
    e.preventDefault();
    if (prompt.binding.whileHeld) {
      keysHeld.set(e.code, prompt);
      prompt.onHold?.(true);
    } else if (prompt.onPress) prompt.onPress();
    else prompt.onHold?.(true);
    return;
  }
  const menuKey = useControlsStore.getState().config.keys.menu;
  let target: HTMLElement | null = null;
  if (e.code === 'Escape' || e.code === menuKey) {
    target = scopedLast('[data-pad-back]') ?? scopedLast('[data-pad-menu]');
  } else if (ENTER.has(e.code) && plain) {
    target = scopedLast('[data-pad-menu]');
  }
  if (!target) return;
  e.preventDefault();
  target.click();
}

function onKeyUp(e: KeyboardEvent): void {
  const prompt = keysHeld.get(e.code);
  if (!prompt) return;
  keysHeld.delete(e.code);
  prompt.onHold?.(false);
}

/** An Alt+Tab never delivers the keyup: let go of every held key. */
function onBlur(): void {
  const held = [...keysHeld.values()];
  keysHeld.clear();
  for (const p of held) p.onHold?.(false);
}

let listeners = 0;

/**
 * Listen for the prompts' keys and the Esc / Enter rules (one window listener,
 * shared). `usePrompts` holds it while mounted, and AppShell on every Delve
 * route. Returns a release function.
 */
export function attachPromptKeys(): () => void {
  if (listeners++ === 0) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--listeners > 0) return;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}

/**
 * Binds the prompts' keys and pad buttons while mounted, for the topmost
 * visible `[data-pad-scope]` containing `scopeRef` (the document when absent).
 * Ignores keys typed into inputs and events already `defaultPrevented`, and is
 * inert while `isArenaLive()`. On the keyboard a prompt fires `onPress` on key
 * down (else `onHold(true)`), and a `whileHeld` one `onHold(true)` on down and
 * `onHold(false)` on up or a window blur; a plain Enter or Space stays with a
 * focused control. The pad's timing is `padPrompts`', and A is never a
 * prompt's (it presses the focused control).
 */
export function usePrompts(prompts: Prompt[], scopeRef?: RefObject<HTMLElement | null>): void {
  const [entry] = useState<Entry>(() => ({ prompts, scopeRef }));
  useLayoutEffect(() => {
    entry.prompts = prompts;
    entry.scopeRef = scopeRef;
  });
  useEffect(() => {
    entries.add(entry);
    const release = attachPromptKeys();
    return () => {
      entries.delete(entry);
      release();
    };
  }, [entry]);
}

// ── The pad ───────────────────────────────────────────────────────────────

interface PadPress {
  at: number;
  /** The tap that shares its button with `hold`: it fires on a release under TAP_MAX_MS. */
  tap?: Prompt;
  hold?: Prompt;
  whileHeld?: Prompt;
  fired: boolean;
}

const padHeld = new Map<PadButton, PadPress>();

/**
 * The menu navigation's hand-off, once a frame (outside live combat): the
 * buttons pressed this frame (`pressed`), the buttons held (`held`) and the
 * time. Returns the presses a prompt took, which the navigation then leaves
 * alone. A tap alone fires on its press; a tap sharing its button with a hold
 * fires on a release under `TAP_MAX_MS`, the hold's `onHold(true)` at its
 * `padHold`, and a release between them fires neither; a `whileHeld` prompt
 * gets `onHold(true)` on the press and `onHold(false)` on the release.
 */
export function padPrompts(
  pressed: ReadonlySet<PadButton>,
  held: Readonly<Record<PadButton, boolean>>,
  now: number,
): Set<PadButton> {
  for (const [button, p] of padHeld) {
    if (!held[button]) {
      padHeld.delete(button);
      if (p.whileHeld) p.whileHeld.onHold?.(false);
      else if (p.tap && !p.fired && now - p.at < TAP_MAX_MS) fire(p.tap);
    } else if (p.hold && !p.fired && now - p.at >= (p.hold.binding.padHold || HOLD_MS)) {
      p.fired = true;
      p.hold.onHold?.(true);
    }
  }
  const took = new Set<PadButton>();
  if (pressed.size === 0) return took;
  const prompts = activePrompts();
  for (const button of pressed) {
    const mine = prompts.filter((p) => p.binding.pad === button);
    if (mine.length === 0) continue;
    took.add(button);
    const whileHeld = mine.find((p) => p.binding.whileHeld);
    const hold = mine.find((p) => p.binding.padHold !== undefined);
    const tap = mine.find((p) => p !== whileHeld && p !== hold);
    if (whileHeld) {
      padHeld.set(button, { at: now, whileHeld, fired: true });
      whileHeld.onHold?.(true);
    } else if (hold) padHeld.set(button, { at: now, hold, tap, fired: false });
    else if (tap) fire(tap);
  }
  return took;
}

function fire(p: Prompt): void {
  if (p.onPress) p.onPress();
  else p.onHold?.(true);
}

/** What a carried card hears from the pad (Skills' reorder). */
export type NavInput = NavDir | 'a' | 'b' | 'x';

let carrying: ((input: NavInput) => void) | null = null;

/** While carrying (Skills' pad reorder): the D-pad and A/B/X go to `handler` instead of the nav. Returns release. */
export function captureNav(handler: (input: NavInput) => void): () => void {
  carrying = handler;
  return () => {
    if (carrying === handler) carrying = null;
  };
}

/** The handler `captureNav` set, if any (read by the menu navigation each frame). */
export function navCapture(): ((input: NavInput) => void) | null {
  return carrying;
}

// ── Scale ─────────────────────────────────────────────────────────────────

/** `--ui-scale`: the 1920×1080 design's fit, rounded down to a quarter step, 0.75 to 2. */
export function uiScaleFor(width: number, height: number): number {
  const fit = Math.floor(Math.min(width / 1920, height / 1080) * 4) / 4;
  return Math.min(2, Math.max(0.75, fit));
}

/** `--hud-scale`: the UI scale times Settings → HUD scale, to the nearest quarter, at least 0.75. */
export function hudScaleFor(ui: number, setting: number): number {
  return Math.max(0.75, Math.round(ui * setting * 4) / 4);
}

/** The zooms `.delve-zoom` and `.delve-hud-zoom` apply (AppShell keeps `uiScale` current). */
export function useUiScale(): { ui: number; hud: number } {
  const ui = useUIStore((s) => s.uiScale);
  const setting = useUIStore((s) => s.hudScale);
  return { ui, hud: hudScaleFor(ui, setting) };
}
```

In `packages/client/src/features/delve/kit/index.ts` (the line above the stub, `export type * from './types';`, stays):

Replace:

```ts
export type * from './types';

/** Stub (step 1·0): 1B replaces it with the real hook reading the computed scales. */
export function useUiScale(): { ui: number; hud: number } {
  return { ui: 1, hud: 1 };
}
```

with:

```ts
export type * from './types';
export { captureNav, scopedLast, topScope, usePrompts, useUiScale } from './prompts';
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/kit)`
Expected: 18 passed.

Run: `(cd packages/client && npx vitest run) && (cd packages/client && npx tsc --noEmit -p .)`
Expected: 100 files, 900 tests passed; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-1b
(cd packages/client && npx prettier --end-of-line auto --write src/features/delve/kit/prompts.ts src/features/delve/kit/__tests__/prompts.test.ts src/features/delve/kit/index.ts src/features/gamepad/gamepad-hub.ts)
git add packages/client/src/features/delve/kit/prompts.ts packages/client/src/features/delve/kit/__tests__/prompts.test.ts packages/client/src/features/delve/kit/index.ts packages/client/src/features/gamepad/gamepad-hub.ts
git commit -m "feat(client): the Delve kit's prompt runtime: scoped hotkeys and pad prompts, tap and hold, Esc and Enter, and the UI scale" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The navigation and the arena's Menu

### Task 3: The menu navigation: prompts first, scoped markers, sub tabs, first focus, skips and the carry

`useGamepadNav`'s frame changes in four ways:
- **Prompts first.** Every press but A and the D-pad goes to `padPrompts` first, which also runs the hold timers each frame.
- **Defaults** for a press no prompt took:
  - B presses `scopedLast('[data-pad-back]')`.
  - Menu presses `scopedLast('[data-pad-menu]')`, else the back.
  - LB/RB step the topmost scope's top-level `[data-pad-tabs]`, and LT/RT its `[data-pad-tabs="sub"]`, both past disabled tabs.
- **Carry.** While `captureNav` holds a handler, the D-pad (and a stick flick) and A, B and X go to it instead.
- **Focus.** `candidates()` (D-pad targets, `keepFocus`'s and A's) leaves out `[data-pad-skip]`, and `keepFocus` starts a scope with no remembered focus on its `[data-pad-first]`.

The D-pad, the stick flick, the repeat timing, the sliders and lists, and the input lock are unchanged.

**Files:**
- Modify: `packages/client/src/features/gamepad/use-gamepad-nav.ts`
- Modify: `packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts`

Replace:

```ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { claimDevices, keepFocus, moveFocus } from '../use-gamepad-nav';
import { useInputDeviceStore, type InputDevice } from '@/stores/inputDeviceStore';
```

with:

```ts
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { claimDevices, keepFocus, moveFocus, useGamepadNav } from '../use-gamepad-nav';
import type { GamepadLike } from '../gamepad';
import { useInputDeviceStore, type InputDevice } from '@/stores/inputDeviceStore';
import { captureNav, usePrompts } from '@/features/delve/kit/prompts';
```

Replace:

```ts
    document.body.append(first, locked, last);
    first.focus();
    moveFocus('right');
    expect(document.activeElement).toBe(last);
  });
});

const device = () => useInputDeviceStore.getState().device;
```

with:

```ts
    document.body.append(first, locked, last);
    first.focus();
    moveFocus('right');
    expect(document.activeElement).toBe(last);
  });

  it('never lands on a [data-pad-skip] control (a prompt bar button)', () => {
    const at = (left: number, skip = false) => {
      const b = document.body.appendChild(document.createElement('button'));
      if (skip) b.setAttribute('data-pad-skip', '');
      b.getBoundingClientRect = () =>
        ({ left, top: 0, width: 10, height: 10, right: left + 10, bottom: 10 }) as DOMRect;
      return b;
    };
    const first = at(0);
    at(20, true);
    const last = at(40);
    first.focus();
    moveFocus('right');
    expect(document.activeElement).toBe(last);
  });
});

const device = () => useInputDeviceStore.getState().device;
```

Replace:

```ts
    const first = button(50, 50, sheet);
    button(10, 60, sheet);
    keepFocus();
    expect(document.activeElement).toBe(first);
  });
```

with:

```ts
    const first = button(50, 50, sheet);
    button(10, 60, sheet);
    keepFocus();
    expect(document.activeElement).toBe(first);
  });

  it("a scope with no remembered focus starts on its [data-pad-first] (the hub's Delve button)", () => {
    setDevice('gamepad');
    const hub = document.body.appendChild(document.createElement('div'));
    hub.setAttribute('data-pad-scope', '');
    hub.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }) as DOMRect;
    button(0, 0, hub);
    const delve = button(100, 150, hub);
    delve.setAttribute('data-pad-first', '');
    keepFocus();
    expect(document.activeElement).toBe(delve);
  });
```

Append at the end of the file:

```ts
/** The standard mapping's button indices. */
const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, menu: 9, right: 15 } as const;

describe('the pad outside combat: scopes, tab lists and prompts', () => {
  let frames: FrameRequestCallback[] = [];
  let down: number[] = [];
  let now = 0;
  let stop = () => {};
  const pad = (): GamepadLike => ({
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: down.includes(i),
      value: down.includes(i) ? 1 : 0,
    })),
  });
  /** One animation frame, 16 ms on: the hub reads the pad once. */
  const tick = () => {
    const run = frames;
    frames = [];
    now += 16;
    for (const cb of run) cb(now);
  };
  /** Press a button for one frame, then let it go. */
  const tap = (button: number) => {
    down = [button];
    tick();
    down = [];
    tick();
  };
  /** A visible element with a box at `left`, `top`. */
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, string> = {},
    parent: HTMLElement = document.body,
    left = 0,
    top = 0,
  ): HTMLElementTagNameMap[K] => {
    const e = parent.appendChild(document.createElement(tag));
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    e.getBoundingClientRect = () =>
      ({ left, top, width: 10, height: 10, right: left + 10, bottom: top + 10 }) as DOMRect;
    return e;
  };
  const clicks: string[] = [];
  const named = (e: HTMLElement, name: string) => {
    e.addEventListener('click', () => clicks.push(name));
    return e;
  };

  beforeEach(() => {
    clicks.length = 0;
    down = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad()] });
    stop = renderHook(() => useGamepadNav()).unmount;
    tick();
  });
  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    setDevice('keyboard');
  });

  it("B presses the topmost scope's back, never the page's; Menu its menu, else its back", () => {
    named(el('button', { 'data-pad-back': '' }), 'page-back');
    named(el('button', { 'data-pad-menu': '' }), 'page-menu');
    const sheet = el('div', { 'data-pad-scope': '' });
    named(el('button', { 'data-pad-back': '' }, sheet), 'sheet-back');
    tap(PAD.b);
    tap(PAD.menu);
    expect(clicks).toEqual(['sheet-back', 'sheet-back']);
    named(el('button', { 'data-pad-menu': '' }, sheet), 'sheet-menu');
    tap(PAD.menu);
    sheet.remove();
    tap(PAD.menu);
    tap(PAD.b);
    expect(clicks).toEqual(['sheet-back', 'sheet-back', 'sheet-menu', 'page-menu', 'page-back']);
  });

  it('RB steps the top-level tabs and RT the sub list, both past disabled tabs', () => {
    const list = (attrs: Record<string, string>, ids: string[], off: string[] = []) => {
      const l = el('div', { role: 'tablist', ...attrs });
      for (const [i, id] of ids.entries()) {
        const t = el('button', { role: 'tab', 'aria-selected': String(i === 0) }, l);
        t.id = id;
        if (off.includes(id)) t.setAttribute('aria-disabled', 'true');
        t.addEventListener('click', () => {
          for (const o of l.querySelectorAll('[role="tab"]'))
            o.setAttribute('aria-selected', 'false');
          t.setAttribute('aria-selected', 'true');
        });
      }
      return () => l.querySelector('[aria-selected="true"]')?.id;
    };
    const top = list({ 'data-pad-tabs': '' }, ['loadout', 'skills', 'forge'], ['skills']);
    const sub = list({ 'data-pad-tabs': 'sub' }, ['basic', 'primary', 'defensive']);
    tap(PAD.rb);
    expect(top()).toBe('forge');
    tap(PAD.rb);
    expect(top()).toBe('loadout');
    tap(PAD.lb);
    expect(top()).toBe('forge');
    expect(sub()).toBe('basic');
    tap(PAD.rt);
    expect(sub()).toBe('primary');
    tap(PAD.lt);
    tap(PAD.lt);
    expect(sub()).toBe('defensive');
    expect(top()).toBe('forge');
  });

  it("a screen's prompt takes its button first; A still presses the focused control", () => {
    const salvage = vi.fn();
    const back = vi.fn();
    const select = vi.fn();
    renderHook(() =>
      usePrompts([
        { id: 'salvage', label: 'Salvage', binding: { pad: 'x' }, onPress: salvage },
        { id: 'back', label: 'Back', binding: { pad: 'b' }, onPress: back },
        { id: 'select', label: 'Select', binding: { pad: 'a' }, onPress: select },
      ]),
    );
    named(el('button', { 'data-pad-back': '' }), 'page-back');
    const focused = named(el('button'), 'focused');
    focused.focus();
    tap(PAD.x);
    tap(PAD.b);
    tap(PAD.a);
    expect([salvage.mock.calls.length, back.mock.calls.length, select.mock.calls.length]).toEqual([
      1, 1, 0,
    ]);
    expect(clicks).toEqual(['focused']);
  });

  it('holding Y past its hold fires the hold prompt, and never the tap', () => {
    const remove = vi.fn();
    const apply = vi.fn();
    renderHook(() =>
      usePrompts([
        { id: 'remove', label: 'Remove', binding: { pad: 'y' }, onPress: remove },
        { id: 'apply', label: 'Apply', binding: { pad: 'y', padHold: 600 }, onHold: apply },
      ]),
    );
    down = [PAD.y];
    for (let i = 0; i < 40; i++) tick(); // 640 ms
    down = [];
    tick();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    tap(PAD.y);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('while a card is carried, the D-pad and A, B and X go to it, not the focus or the back', () => {
    named(el('button', { 'data-pad-back': '' }), 'page-back');
    const first = el('button', {}, document.body, 0, 0);
    el('button', {}, document.body, 40, 0);
    first.focus();
    const heard: string[] = [];
    const release = captureNav((input) => heard.push(input));
    tap(PAD.right);
    tap(PAD.x);
    tap(PAD.a);
    tap(PAD.b);
    expect(heard).toEqual(['right', 'x', 'a', 'b']);
    expect(clicks).toEqual([]);
    expect(document.activeElement).toBe(first);
    release();
    tap(PAD.right);
    expect(document.activeElement).not.toBe(first);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `(cd packages/client && npx vitest run src/features/gamepad/__tests__/use-gamepad-nav.test.ts)`
Expected: 7 failed, 12 passed:
- the skip: `expected <button data-pad-skip></button> to be <button></button>`
- first focus: `expected <button></button> to be <button data-pad-first></button>`
- the scoped back and Menu: `expected [ 'sheet-back', 'page-menu' ] to deeply equal [ 'sheet-back', 'sheet-back' ]`
- the tab lists: `expected 'skills' to be 'forge'`
- the prompts: `expected [ +0, +0, +0 ] to deeply equal [ 1, 1, +0 ]`
- the hold: `expected "spy" to be called 1 times, but got 0 times`
- the carry: `expected [] to deeply equal [ 'right', 'x', 'a', 'b' ]`

- [ ] **Step 3: Implement**

In `packages/client/src/features/gamepad/use-gamepad-nav.ts`

Replace:

```ts
import { useInputDeviceStore, type InputDevice } from '@/stores/inputDeviceStore';
import type { PadState } from './gamepad';
```

with:

```ts
import { useInputDeviceStore, type InputDevice } from '@/stores/inputDeviceStore';
import { navCapture, padPrompts, scopedLast, topScope } from '@/features/delve/kit/prompts';
import type { PadButton, PadState } from './gamepad';
```

Replace:

```ts
 * (left/right adjust a focused slider or list), A presses it, B presses the
 * visible `[data-pad-back]`, LB/RB step through the `[data-pad-tabs]` tabs
 * and Menu presses `[data-pad-menu]`. The last visible
 * `[data-pad-scope]` (a sheet or overlay) keeps focus inside it, and while the
 * pad has the input lock the focus never gets lost (`keepFocus`). It also lets
 * the keys, the mouse and touch claim the lock (`claimDevices`).
 */
```

with:

```ts
 * (left/right adjust a focused slider or list), A presses it. Every other
 * button goes to the screen's prompts first (`padPrompts`, which also times
 * the holds); one no prompt takes does its default: B presses the topmost
 * scope's `[data-pad-back]`, Menu its `[data-pad-menu]` (else its back),
 * LB/RB step its top-level `[data-pad-tabs]` and LT/RT its
 * `[data-pad-tabs="sub"]`, past disabled tabs. The last visible
 * `[data-pad-scope]` (a sheet or overlay) keeps focus inside it, and while the
 * pad has the input lock the focus never gets lost (`keepFocus`, which starts
 * a scope on its `[data-pad-first]`). `[data-pad-skip]` controls are never
 * D-pad targets. While a card is carried (`captureNav`) the D-pad and A/B/X go
 * to it. It also lets the keys, the mouse and touch claim the lock
 * (`claimDevices`).
 */
```

Replace:

```ts
const REPEAT_EVERY_MS = 150;
```

with:

```ts
const REPEAT_EVERY_MS = 150;
const DPAD = new Set<PadButton>(['up', 'down', 'left', 'right']);
```

Replace:

```ts
function scope(): HTMLElement | Document {
  const scopes = [...document.querySelectorAll<HTMLElement>('[data-pad-scope]')].filter(visible);
  return scopes.at(-1) ?? document;
}

function candidates(): HTMLElement[] {
  return [...scope().querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
}
```

with:

```ts
function candidates(): HTMLElement[] {
  return [...topScope().querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => visible(el) && !el.closest('[data-pad-skip]'),
  );
}
```

Replace:

```ts
 * was, else the first. Under the keys or the mouse the focus is left alone.
```

with:

```ts
 * was, else its `[data-pad-first]`, else the first. Under the keys or the
 * mouse the focus is left alone.
```

Replace:

```ts
  const s = scope();
```

with:

```ts
  const s = topScope();
```

Replace:

```ts
  if (!last) return focus(els[0]);
```

with:

```ts
  if (!last) return focus(els.find((el) => el.hasAttribute('data-pad-first')) ?? els[0]);
```

Replace:

```ts
function press(selector: string): void {
  const el = [...document.querySelectorAll<HTMLElement>(selector)].filter(visible).at(-1);
  el?.click();
}

function stepTabs(delta: number): void {
  const list = [...document.querySelectorAll<HTMLElement>('[data-pad-tabs]')].filter(visible)[0];
  if (!list) return;
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
  if (tabs.length === 0) return;
  const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
  const next = tabs[(i + delta + tabs.length) % tabs.length];
  next.click();
  focus(next);
}
```

with:

```ts
const TAB_LISTS = {
  top: '[data-pad-tabs]:not([data-pad-tabs="sub"])',
  sub: '[data-pad-tabs="sub"]',
} as const;

/** Step the topmost scope's tab list (LB/RB its top level, LT/RT its sub list), past disabled tabs. */
function stepTabs(level: keyof typeof TAB_LISTS, delta: number): void {
  const list = scopedLast(TAB_LISTS[level]);
  if (!list) return;
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
  const enabled = (t: HTMLElement) => !t.matches(':disabled, [aria-disabled="true"]');
  if (!tabs.some(enabled)) return;
  let i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
  do i = (i + delta + tabs.length) % tabs.length;
  while (!enabled(tabs[i]));
  tabs[i].click();
  focus(tabs[i]);
}
```

Replace the lines from `const stop = startGamepad((state, pressed, now) => {` up to (not including) `keepFocus();` with:

```ts
    const stop = startGamepad((state, pressed, now) => {
      // A carried card (Skills' reorder) hears the D-pad and A/B/X instead of the focus.
      const carry = navCapture();
      const move = (dir: NavDir) => (carry ? carry(dir) : moveFocus(dir));
      // A stick flick moves once; it re-arms when the stick comes back near the centre.
      const flick = stickDir(state);
      if (flick && stickArmed) {
        move(flick);
        stickArmed = false;
      }
      if (Math.hypot(state.left.x, state.left.y) < 0.3) stickArmed = true;

      const dir = dpadDir(state);
      if (dir && dir !== heldDir) {
        heldDir = dir;
        repeatAt = now + REPEAT_DELAY_MS;
        move(dir);
      } else if (dir && now >= repeatAt) {
        repeatAt = now + REPEAT_EVERY_MS;
        move(dir);
      } else if (!dir) heldDir = null;

      const carried = carry ? (['a', 'b', 'x'] as const).filter((b) => pressed.has(b)) : [];
      for (const b of carried) carry?.(b);
      // The D-pad moves and A presses the focused control: never a prompt's.
      const offered = [...pressed].filter(
        (b) => !DPAD.has(b) && b !== 'a' && !(carried as readonly PadButton[]).includes(b),
      );
      const took = padPrompts(new Set(offered), state.buttons, now);
      const left = (b: PadButton) => offered.includes(b) && !took.has(b);

      if (!carry && pressed.has('a')) {
        const el = document.activeElement as HTMLElement | null;
        if (el && candidates().includes(el)) el.click();
        else moveFocus('down');
      }
      if (left('b')) scopedLast('[data-pad-back]')?.click();
      if (left('lb')) stepTabs('top', -1);
      if (left('rb')) stepTabs('top', 1);
      if (left('lt')) stepTabs('sub', -1);
      if (left('rt')) stepTabs('sub', 1);
      if (left('menu')) (scopedLast('[data-pad-menu]') ?? scopedLast('[data-pad-back]'))?.click();
```

(`keepFocus();` and the lines after it stay.)

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/gamepad)`
Expected: 2 files, 48 passed (`gamepad.test.ts` 29, `use-gamepad-nav.test.ts` 19).

Run: `(cd packages/client && npx vitest run) && (cd packages/client && npx tsc --noEmit -p .)`
Expected: 100 files, 907 tests passed; the typecheck prints nothing. These pass unchanged:
- the controls and gamepad tests (`ControlsPanel.test.tsx`, `controlsStore.test.ts`, `inputDeviceStore.test.ts`, `gamepad.test.ts`, with the hub's input-lock claims);
- `DelveCamp.test.tsx`'s `moveFocus` test;
- `TrainingPanel.test.tsx`'s pad markers.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-1b
(cd packages/client && npx prettier --end-of-line auto --write src/features/gamepad/use-gamepad-nav.ts src/features/gamepad/__tests__/use-gamepad-nav.test.ts)
git add packages/client/src/features/gamepad/use-gamepad-nav.ts packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts
git commit -m "feat(client): the pad's menu navigation: prompts first, scoped back and menu, sub tabs, disabled tabs skipped, first focus, skips and the carry" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: The arena's Menu (its key and the pad's button) acts only while the fight is live

`attachKeyboard`'s menu key used to click the document's first `[data-pad-menu]`, paused or not, and so did `useArenaCore`'s `padFrame` for the pad's Menu.

**The key.** It now acts only while `isArenaLive()`, and only on an event not already `defaultPrevented`. It clicks the topmost scope's menu through a new `pressMenu()` (`scopedLast('[data-pad-menu]')`) and calls `e.preventDefault()`, so the prompt runtime's window listener (Task 2) skips the same press. React flushes between window listeners. Without the mark, one Esc could open the Training sheet through the arena's key, and then close it again through the runtime's Esc rule, which sees the sheet's back at once. Task 6's T03 fails exactly so when the mark is taken out. Paused, the key falls to the runtime's Esc rule, which AppShell binds on Delve routes (Task 5).

**The pad.** `padFrame`'s Menu calls `pressMenu()` too; the coordinator gave 1B this line for Phase 1. It runs only while live (it gets only presses made while live).

**The tests.** The existing menu-key test runs with the arena live, and its menu button gets a box, because the scoped lookup takes only visible markers.

**Files:**
- Modify: `packages/client/src/features/delve/arena/input.ts`
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts` (the one `padFrame` line and its import; 3C owns the file in Phase 3)
- Modify: `packages/client/src/features/delve/__tests__/arena-input.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/client/src/features/delve/__tests__/arena-input.test.ts`

Replace:

```ts
import { describe, it, expect, afterEach } from 'vitest';
```

with:

```ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
```

Replace:

```ts
import { attachKeyboard, createArenaInput, frameInput, holdingSlot } from '../arena/input';
```

with:

```ts
import {
  attachKeyboard,
  createArenaInput,
  frameInput,
  holdingSlot,
  pressMenu,
} from '../arena/input';
```

Replace:

```ts
import { useControlsStore } from '@/stores/controlsStore';
```

with:

```ts
import { useControlsStore } from '@/stores/controlsStore';
import { setArenaLive } from '@/features/gamepad/gamepad-hub';
```

Replace:

```ts
describe('panel controls keep their keys', () => {
  let detach = () => {};
  afterEach(() => {
    detach();
    document.body.replaceChildren();
  });
```

with:

```ts
describe('panel controls keep their keys', () => {
  let detach = () => {};
  // The menu key is the arena's only while the fight is live.
  beforeEach(() => setArenaLive(true));
  afterEach(() => {
    detach();
    setArenaLive(false);
    document.body.replaceChildren();
  });
  /** Give `el` a box, so the scoped lookup sees it. */
  const shown = <T extends HTMLElement>(el: T): T => {
    el.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 });
    return el;
  };
```

Replace:

```ts
    const menu = document.body.appendChild(document.createElement('button'));
    menu.setAttribute('data-pad-menu', '');
    let opened = 0;
    menu.addEventListener('click', () => opened++);
    // A key reaches the focused control.
```

with:

```ts
    const menu = document.body.appendChild(shown(document.createElement('button')));
    menu.setAttribute('data-pad-menu', '');
    let opened = 0;
    menu.addEventListener('click', () => opened++);
    // A key reaches the focused control.
```

Replace:

```ts
    text.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    expect(opened).toBe(0);
    expect(input.keys).toEqual({ x: 0, y: 0 });
  });
});
```

with:

```ts
    text.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    expect(opened).toBe(0);
    expect(input.keys).toEqual({ x: 0, y: 0 });
  });

  it("the menu key acts only while the fight is live, on the topmost scope's menu, and never on a handled key", () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const opened: string[] = [];
    const menu = (name: string, parent: HTMLElement = document.body) => {
      const b = parent.appendChild(shown(document.createElement('button')));
      b.setAttribute('data-pad-menu', '');
      b.addEventListener('click', () => opened.push(name));
    };
    const esc = () => {
      const e = new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true });
      window.dispatchEvent(e);
      return e;
    };
    menu('purse');
    const dock = document.body.appendChild(shown(document.createElement('div')));
    dock.setAttribute('data-pad-scope', '');
    menu('dock', dock);
    expect(esc().defaultPrevented).toBe(true);
    expect(opened).toEqual(['dock']);
    // Paused, the prompt runtime owns the key: the arena leaves it alone.
    setArenaLive(false);
    expect(esc().defaultPrevented).toBe(false);
    setArenaLive(true);
    const handled = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', handled, true);
    esc();
    window.removeEventListener('keydown', handled, true);
    expect(opened).toEqual(['dock']);
    // The pad's Menu while live (useArenaCore's padFrame) presses the same one.
    pressMenu();
    expect(opened).toEqual(['dock', 'dock']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-input.test.ts)`
Expected: 1 failed, 23 passed. The new test fails with `expected false to be true`: the old key clicks the page's first menu, not the dock's, and never marks the key handled. The existing menu-key test still passes, because the old code clicks whether or not the arena is live. (`pressMenu` isn't exported yet, but Vitest doesn't type-check, and the test fails before it reaches that line.)

- [ ] **Step 3: Implement**

In `packages/client/src/features/delve/arena/input.ts`

Replace:

```ts
import type { InputDevice } from '@/stores/inputDeviceStore';
```

with:

```ts
import type { InputDevice } from '@/stores/inputDeviceStore';
import { isArenaLive } from '@/features/gamepad/gamepad-hub';
import { scopedLast } from '@/features/delve/kit/prompts';
```

Replace:

```ts
/** Text entry keeps every key, the menu key included. */
```

with:

```ts
/**
 * The arena's Menu, from its key or the pad's button while the fight is live:
 * the topmost scope's `[data-pad-menu]` (the dive's menu button, Training's panel).
 */
export function pressMenu(): void {
  scopedLast('[data-pad-menu]')?.click();
}

/** Text entry keeps every key, the menu key included. */
```

Replace:

```ts
    // The menu key works while paused too (so it can close the menu), and from a slider or a list.
    if (!e.repeat && keyAction(e.code) === 'menu') {
      (document.querySelector('[data-pad-menu]') as HTMLElement | null)?.click();
      return;
    }
```

with:

```ts
    // The menu key works from a slider or a list, but only while the fight is live: paused,
    // the prompt runtime owns it (Esc presses the open menu's back), so no press acts twice.
    if (!e.repeat && keyAction(e.code) === 'menu') {
      if (e.defaultPrevented || !isArenaLive()) return;
      e.preventDefault();
      pressMenu();
      return;
    }
```

In `packages/client/src/features/delve/arena/useArenaCore.ts`

Replace:

```ts
  createArenaInput,
  frameInput,
  type Aiming,
```

with:

```ts
  createArenaInput,
  frameInput,
  pressMenu,
  type Aiming,
```

Replace:

```ts
      if (acts.menu) (document.querySelector('[data-pad-menu]') as HTMLElement | null)?.click();
```

with:

```ts
      if (acts.menu) pressMenu();
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-input.test.ts src/features/delve/__tests__/TrainingPanel.test.tsx src/pages/__tests__/DelveTraining.test.tsx)`
Expected: 3 files passed (`arena-input.test.ts` 24 tests).

Run: `(cd packages/client && npx vitest run) && (cd packages/client && npx tsc --noEmit -p .)`
Expected: 100 files, 908 tests passed; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-1b
(cd packages/client && npx prettier --end-of-line auto --write src/features/delve/arena/input.ts src/features/delve/arena/useArenaCore.ts src/features/delve/__tests__/arena-input.test.ts)
git add packages/client/src/features/delve/arena/input.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/__tests__/arena-input.test.ts
git commit -m "fix(client): the arena's Menu acts only while the fight is live, on the topmost scope's menu, and marks the key handled so Esc never acts twice" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The shell

### Task 5: The shell: the Delve's full window, the UI scale and the prompt keys

AppShell does four things on Delve routes:
- **Full window.** Every `/delve*` route (`/delve` and anything under `/delve/`) gets `data-frame="full"` on `.app-frame` and no TabBar.
- **Scale variables.** On `:root`, AppShell sets `--ui-scale` (`uiScaleFor` of the window) and `--hud-scale` (`hudScaleFor` of it and uiStore's `hudScale`). It recomputes them on every resize and on a `hudScale` change, and mirrors `uiScale` into uiStore.
- **Prompt keys.** It holds the prompt runtime's keys (`attachPromptKeys`) while on a Delve route, so Esc and Enter work there before any screen calls `usePrompts`.
- **Classic routes** keep the letterbox, the TabBar, the drawers and their keys.

`index.css` changes in two places:
- **Letterbox.** `.app-frame[data-frame='full']` releases it at every aspect (it outranks the 9:16 and 3:2 rules).
- **Focus ring.** The classic gamepad ring becomes `html[data-input='gamepad'] :focus:not(.delve-ui *)`, so the Delve's own ring (1A's `kit.css`) never shows with a second one. Nothing carries `.delve-ui` until 1A and 1D land, so today's screens still show the classic ring.

**Files:**
- Modify: `packages/client/src/components/AppShell.tsx`
- Modify: `packages/client/src/index.css`
- Create: `packages/client/src/components/__tests__/AppShell.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/components/__tests__/AppShell.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppShell } from '../AppShell';
import { useUIStore } from '@/stores/uiStore';

/** A page with a visible back button, which Esc presses on a Delve route. */
function Page({ onBack }: { onBack: () => void }) {
  return (
    <button
      data-pad-back
      onClick={onBack}
      ref={(b) => {
        if (b) b.getBoundingClientRect = () => DOMRect.fromRect({ width: 10, height: 10 });
      }}
    >
      Back
    </button>
  );
}

function renderAt(path: string, onBack = () => {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<Page onBack={onBack} />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const resize = (width: number, height: number) =>
  act(() => {
    Object.assign(window, { innerWidth: width, innerHeight: height });
    window.dispatchEvent(new Event('resize'));
  });

const rootVar = (name: string) => document.documentElement.style.getPropertyValue(name);

describe('AppShell', () => {
  afterEach(() => {
    resize(1024, 768);
    act(() => useUIStore.getState().setHudScale(1));
    localStorage.removeItem('alloy:delve:hudScale');
  });

  it('gives every Delve route the full window and no TabBar; other routes keep both', () => {
    for (const path of ['/delve', '/delve/run', '/delve/training', '/delve/lab']) {
      const { container, unmount } = renderAt(path);
      expect(container.querySelector('.app-frame')).toHaveAttribute('data-frame', 'full');
      expect(container.querySelector('[data-tabbar]')).toBeNull();
      unmount();
    }
    const { container } = renderAt('/');
    expect(container.querySelector('.app-frame')).not.toHaveAttribute('data-frame');
    expect(container.querySelector('[data-tabbar]')).not.toBeNull();
  });

  it('sets --ui-scale and --hud-scale in quarter steps on resize and on a HUD scale change, mirrored in uiStore', () => {
    resize(1280, 720);
    renderAt('/delve');
    expect([rootVar('--ui-scale'), rootVar('--hud-scale')]).toEqual(['0.75', '0.75']);
    resize(2560, 1440);
    expect([rootVar('--ui-scale'), rootVar('--hud-scale')]).toEqual(['1.25', '1.25']);
    expect(useUIStore.getState().uiScale).toBe(1.25);
    act(() => useUIStore.getState().setHudScale(1.25));
    expect(rootVar('--hud-scale')).toBe('1.5');
  });

  it("binds Esc to the page's back on Delve routes only", () => {
    const back = vi.fn();
    const classic = renderAt('/', back);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(back).not.toHaveBeenCalled();
    classic.unmount();
    renderAt('/delve', back);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `(cd packages/client && npx vitest run src/components/__tests__/AppShell.test.tsx)`
Expected: 3 failed:
- the frame: `.app-frame` has no `data-frame` attribute;
- the scale: `expected [ '', '' ] to deeply equal [ '0.75', '0.75' ]`;
- Esc: `expected "spy" to be called 1 times, but got 0 times`.

- [ ] **Step 3: Implement**

In `packages/client/src/components/AppShell.tsx`

Replace:

```tsx
import { useGamepadNav } from '@/features/gamepad/use-gamepad-nav';
```

with:

```tsx
import { useGamepadNav } from '@/features/gamepad/use-gamepad-nav';
import { attachPromptKeys, hudScaleFor, uiScaleFor } from '@/features/delve/kit/prompts';
import { useUIStore } from '@/stores/uiStore';
```

Replace:

```tsx
  // Full screen: the Delve arena (its joystick and ability buttons need the space) and the DPS Lab.
  const hideTabBar = ['/delve/run', '/delve/training', '/delve/lab'].includes(location.pathname);
```

with:

```tsx
  // The Delve takes the whole window (no letterbox, no TabBar: its menus carry the version and
  // the settings), and binds the prompt runtime's keys (Esc / Enter) on every Delve route.
  const isDelve = location.pathname === '/delve' || location.pathname.startsWith('/delve/');
  const hideTabBar = isDelve;
  useEffect(() => (isDelve ? attachPromptKeys() : undefined), [isDelve]);

  // The Delve UI's zooms, on :root (quarter steps; see prompts.ts), mirrored into uiStore.
  const hudSetting = useUIStore((s) => s.hudScale);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const ui = uiScaleFor(window.innerWidth, window.innerHeight);
      root.style.setProperty('--ui-scale', String(ui));
      root.style.setProperty('--hud-scale', String(hudScaleFor(ui, hudSetting)));
      useUIStore.getState().setUiScale(ui);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [hudSetting]);
```

Replace:

```tsx
      <div className="app-frame" ref={frameRef}>
```

with:

```tsx
      <div className="app-frame" ref={frameRef} data-frame={isDelve ? 'full' : undefined}>
```

In `packages/client/src/index.css`

Replace:

```css
/* ── Atmospheric Background ── */
```

with:

```css
/* The Delve fills the window at every aspect (AppShell sets data-frame="full" on /delve*). */
.app-frame[data-frame='full'] {
  aspect-ratio: auto;
  width: 100%;
  height: 100%;
  border-left: none;
  border-right: none;
  border-radius: 0;
  box-shadow: none;
}

/* ── Atmospheric Background ── */
```

Replace:

```css
/* Controller focus ring: shown only while the gamepad is the active input. */
html[data-input='gamepad'] :focus {
```

with:

```css
/* Controller focus ring: shown only while the gamepad is the active input. The Delve UI
   (.delve-ui) draws its own ring (kit.css), so it never shows two. */
html[data-input='gamepad'] :focus:not(.delve-ui *) {
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/components/__tests__/AppShell.test.tsx)`
Expected: 3 passed.

Run: `(cd packages/client && npx vitest run) && (cd packages/client && npx tsc --noEmit -p .)`
Expected: 101 files, 911 tests passed; the typecheck prints nothing.

- [ ] **Step 5: Commit**

`index.css` is never formatted.

```bash
cd /c/Projects/alloy-ui-1b
(cd packages/client && npx prettier --end-of-line auto --write src/components/AppShell.tsx src/components/__tests__/AppShell.test.tsx)
git add packages/client/src/components/AppShell.tsx packages/client/src/components/__tests__/AppShell.test.tsx packages/client/src/index.css
git commit -m "feat(client): the Delve takes the full window with no TabBar, the UI scale in quarter steps, and Esc on every Delve route" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The E2E guards and verification

### Task 6: E2E guards: Esc still closes the kebab menu and the Training sheet

Two Playwright tests pin the keyboard behaviour that Tasks 2, 4 and 5 move between owners:
- **D09.** In a dive, Esc opens the kebab menu, and Esc closes it without opening it again. In the Controls editor, Esc closes only the editor.
- **T03.** At a page width under the dock's 1024 px, the Training panel opens as a sheet. Esc closes the sheet, and Esc in the live fight opens the panel again.

Both pass at the base (today's code) and after this area, which is the point: they guard behaviour that must not change. T03 also catches the double press. On the scratch copy, with Task 4's `e.preventDefault()` taken out, T03 failed: the second Esc opened the sheet and closed it in the same press. D09 passed, because on the dive the runtime's listener runs before the arena's.

The phone projects stop running `delve*.spec.ts` after 1D (the overview's E2E step). Until then both tests run on all four devices; T03 sets its own viewport.

**Files:**
- Modify: `packages/client/e2e/delve.spec.ts` (CRLF in the worktree)
- Modify: `packages/client/e2e/delve-training.spec.ts` (CRLF in the worktree)

- [ ] **Step 1: Write the guards**

In `packages/client/e2e/delve.spec.ts`

Replace:

```ts
    await page.getByTestId('slot-weapon').click();
    await expect(page.getByTestId('item-mana')).toContainText('Frost');
  });
});
```

with:

```ts
    await page.getByTestId('slot-weapon').click();
    await expect(page.getByTestId('item-mana')).toContainText('Frost');
  });

  test('D09: Esc opens and closes the dive menu, and in the Controls editor closes only the editor', async ({
    page,
  }) => {
    await seedProfile(page, 4242, false);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });
    const menu = page.getByTestId('attack-mode-toggle');
    await page.keyboard.press('Escape');
    await expect(menu).toBeVisible();
    // Paused, Esc presses the menu's Resume: once, so the menu doesn't open again.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(menu).toBeVisible();
    await page.getByTestId('open-controls').click();
    await expect(page.getByTestId('controls-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('controls-panel')).toBeHidden();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });
});
```

In `packages/client/e2e/delve-training.spec.ts`

Replace:

```ts
    await expect(pips).toHaveAttribute('data-rune', 'echo');
  });
});
```

with:

```ts
    await expect(pips).toHaveAttribute('data-rune', 'echo');
  });

  test('T03: Esc closes the Training sheet, and opens the panel again from the fight', async ({
    page,
  }) => {
    await seed(page);
    // Narrower than the dock's 1024 px: the panel opens as a sheet that pauses the fight.
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('/delve/training');
    await expect(page.getByTestId('ability-0')).toBeVisible({ timeout: ARENA_READY });
    const panel = page.getByTestId('training-panel');
    await page.getByTestId('training-panel-toggle').click();
    await expect(panel).toHaveAttribute('data-layout', 'sheet');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    // The fight is live again: the arena's menu key opens the panel.
    await page.keyboard.press('Escape');
    await expect(panel).toBeVisible();
  });
});
```

- [ ] **Step 2: Run them**

Start the dev server on 5291 (the block under "Dev server"; it prints `True`) and create the scratch config.

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-training.spec.ts -g "D09|T03")`
Expected: 8 passed (both tests on each of the four devices). Leave the server running for Task 7.

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/alloy-ui-1b
(cd packages/client && npx prettier --end-of-line auto --write e2e/delve.spec.ts e2e/delve-training.spec.ts)
git add packages/client/e2e/delve.spec.ts packages/client/e2e/delve-training.spec.ts
git commit -m "test(client): e2e guards: Esc opens and closes the dive menu once, closes only the Controls editor, and closes the Training sheet" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 7: The area's end check: suites, build, and today's keyboard and pad play in the browser

No commit, unless a step finds a regression. In that case, fix it in the task that introduced it, as a new commit.

- [ ] **Step 1: The client suite, the typecheck and the build**

Run: `(cd packages/client && npx vitest run) && (cd packages/client && npx tsc --noEmit -p .) && (pnpm -F @alloy/client build)`
Expected: 101 files, 911 tests passed; the typecheck prints nothing; the build (`tsc -b && vite build`) ends with `✓ built in` (and Vite's usual chunk-size warning). The engine is untouched (`git diff --stat <base> -- packages/engine` prints nothing), so no determinism check applies.

- [ ] **Step 2: The gamepad and controls tests, by name**

Run: `(cd packages/client && npx vitest run src/features/gamepad src/features/controls src/stores/controlsStore.test.ts src/stores/inputDeviceStore.test.ts src/features/delve/__tests__/arena-input.test.ts src/features/delve/kit)`
Expected: every file passes. These are the input-device lock's own tests (the hub's claims, `claimDevices`, the store), the arena's keys and pad (`padFrameCast`, `frameInput`), the Controls editor's capture, and the runtime.

- [ ] **Step 3: The Delve E2E on all four devices**

Use the server and scratch config from Task 6 (or start them again).

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts e2e/delve-runes.spec.ts)`
Expected: 104 passed (26 tests on each of iphone-se, iphone-15-pro, pixel-7 and desktop). On the scratch copy all 104 ran in about 4.5 min. They cover:
- **The pad.** G01 to G07: Menu opens the dive menu, A toggles, B resumes; LT dodges; RT repeat; a rebind from the Controls editor mid-dive; the D-pad and A through the chain builder and the rune picker (`pickNext`'s new rule on the real layout); and RB/LB through the Anvil tabs.
- **The keyboard and mouse.** The dive's keys, Training's panel and its list keys, and the runes flows.
- **Esc.** D09 and T03 (Task 6).

These specs don't change in this phase. The tab ids and the phone projects' `testIgnore` change after 1D (the overview's E2E step). On the phones, `/delve` now has no TabBar; G06 and G07 already allow for either.

- [ ] **Step 4: The classic screens are untouched**

Run the classic specs on desktop. They take about 6 to 14 minutes, depending on the machine's load.

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts --project=desktop e2e/base-item-selection.spec.ts e2e/draft-acceptance.spec.ts e2e/duel-acceptance.spec.ts e2e/forge-desktop.spec.ts e2e/forge-drag-drop.spec.ts e2e/forge-redesign.spec.ts e2e/forge-transplant.spec.ts e2e/gem-combining.spec.ts e2e/match-flow.spec.ts e2e/meta-screens.spec.ts e2e/multiplayer-routing.spec.ts e2e/onboarding.spec.ts e2e/phase-transitions.spec.ts e2e/run-flow.spec.ts)`
Expected: 94 tests: 6 skipped, and the same failures as the base. The classic E2E is stale and fails 17 tests at `4b468c8` too. The scratch copy ran the set on the base and on this area's build, and both failed exactly these 17:
- `forge-desktop` "desktop HUD: sockets a gem and affix list updates"
- `forge-redesign` F02, F03, F04, F05, F06 and F16
- `gem-combining` C02 and C09
- `match-flow` "complete match"
- `phase-transitions` "draft → forge" and "URL catch-all"
- `run-flow` R01, R03, F04, F05 and F06

Any other failure must pass on a rerun (`-g <name> --repeat-each 2`) or it is a regression. Under load, `forge-redesign` F17 failed once on the scratch copy and passed twice on the rerun. A first run there, on a machine busy with other test browsers, failed 39 tests. These screens touch none of this area's code except AppShell's frame, the scale variables (which they don't read) and the ring's `:not(.delve-ui *)`.

- [ ] **Step 5: By hand, in the browser at http://localhost:5291 (desktop window)**

Check each of these (the scratch copy ran the Anvil and dive checks as a throwaway Playwright spec, and they passed):
- **`/` (the main menu).** The 9:16 letterbox and the TabBar are as before. In the console, `getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')` reads a quarter step, for example `0.75` at 1280×800.
- **`/delve` (the Anvil).** It fills the window with no TabBar, on a narrow window too. Click the paper doll's weapon (`slot-weapon`) to open its sheet, then press Esc: the sheet closes, and a second Esc does nothing.
- **A dive.**
  - Esc opens the kebab menu, and Esc again resumes. The menu must not reopen: before this area, the arena's key and the runtime could both act.
  - Open the menu, then Controls, then press Esc: only the editor closes, and the menu stays open.
  - Esc once more resumes the fight, and WASD and Q still move and cast.
- **The Training Grounds.** Esc opens and closes the docked panel, as before.

Stop the server (the block's first line) and delete `packages/client/playwright.scratch.config.ts`.
