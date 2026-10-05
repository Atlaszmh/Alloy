# Delve pad navigation and guidance · 02: the strip and the marker — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hesta's guidance becomes one objective strip at the top of every screen (the dive, the Training Grounds, the stop, the Anvil) and a marker that can't be read as the focus ring, and the tutorial takes the pad's focus once per marked target and once per beat, never on a re-render.

**Architecture:** `tutorial/marked.ts` (new) holds what the marker points at (`WAY_TO`, `findTarget`, `findWay`, `findMarked`; plan 03 later replaces its rule), and `tutorial-view.ts` gains `useTutorialStep`. `TutorialHighlight.tsx` is rewritten as the marker: brackets and an arrow placed every frame round `findMarked(step)`, the focus moved once per `` `${step.id}:${marked.id}` `` onto a D-pad candidate only. `TutorialPanel.tsx` is rewritten in place as the strip (same export, same test ids), with a `place` (`'hud' | 'stop' | 'anvil'`) instead of a zoom context; the screens mount it in their own slot: `HudGrid`'s new `centre` slot (the dive and the Training Grounds), the stop's header row (`StopScreen` renders it itself), and a row above the Anvil's panes.

**Tech Stack:** TypeScript 5.7, React 19, Vitest 3 (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-delve-pad-nav-guidance-design.md` (authoritative): sections 1.5, 2.1, 2.2 and 2.4, and their tests in section 3. Not 1.1 to 1.4 (plan 01) and not 2.3 (plan 03). The overview, with the branch, the commands and the contracts, is `00-overview.md`.

---

## Base

- **Starts from:** branch `padnav` with plan 01 complete. This plan relies on plan 01's contract only: `features/gamepad/use-gamepad-nav.ts` exports `candidates(active?)` and `isCandidate(el)`, and the kit's `Tabs` tablist carries `data-pad-skip`. It was drafted against `da69a3b0`; of the files below plan 01 edits only `pages/DelveTraining.tsx` (the dock's focus effect, which no edit here touches).
- **Before Task 1:**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx tsup) && (cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: no type errors, every test passing. Note the test count; each "all green" below compares to it. Nothing in this plan touches the engine.

## Files

All under `packages/client/`.

| File | Change |
|---|---|
| `src/features/delve/tutorial/marked.ts` (new) | `WAY_TO`, `findTarget`, `findWay` moved here from `TutorialHighlight.tsx`; `Marked`; `findMarked` (Task 1) |
| `src/features/delve/tutorial/tutorial-view.ts` | `useTutorialStep` (Task 1); `SHOWN_AT.floor`, `SHOWN_AT.stop` (Task 7) |
| `src/features/delve/tutorial/TutorialHighlight.tsx` | imports from `marked.ts` (Task 1); rewritten as the marker, with the focus-once rule (Task 2) |
| `src/features/delve/tutorial/TutorialPanel.tsx` | rewritten as the strip: `place`, the layout, the folding line, the skip hint (Task 3); the hold, the tick, the chime, the pop and the count's pulse (Task 4); Continue's focus rule (Task 5) |
| `src/features/delve/arena/hud/HudGrid.tsx` | `children` becomes the `centre` slot; `hidden` (Task 6) |
| `src/features/delve/arena/hud/BossBar.tsx` | no grid placement of its own: the centre slot lays it (Task 6) |
| `src/pages/DelveRun.tsx` | `centre` (Task 6); the strip in the centre slot for floor steps, the tracker hidden, the HUD hidden under the stop, the stop's portal gone (Task 7) |
| `src/features/delve/stop/StopScreen.tsx` | the strip in its header row (Task 7) |
| `src/pages/DelveTraining.tsx` | `centre` (Task 6); the strip in the centre slot (Task 8) |
| `src/features/delve/hub/AnvilHub.tsx` | the strip as a row above the tab's panes (Task 9) |
| `src/features/delve/hub/SystemMenu.tsx` | "Skip this step" (Task 10) |
| `src/features/delve/tutorial/__tests__/marked.test.tsx` (new) | Task 1 |
| `src/features/delve/tutorial/__tests__/tutorial-view.test.ts` | `useTutorialStep` (Task 1) |
| `src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx` | imports `WAY_TO` from `../marked` (Task 1) |
| `src/features/delve/tutorial/__tests__/TutorialHighlight.test.tsx` | rewritten: the marker's look, `data-target`, the focus rule (Task 2) |
| `src/features/delve/tutorial/__tests__/TutorialPanel.test.tsx` | rewritten (Task 3), added to (Tasks 4, 5) |
| `src/features/delve/tutorial/__tests__/tutorial-fixture.ts` | a beat with a highlight, `board` (Task 5) |
| `src/features/delve/tutorial/__tests__/GuidedChoice.test.tsx` | a step change reads `data-step` (Task 4); Continue's focus needs boxes (Task 5); the Anvil's row (Task 9) |
| `src/pages/__tests__/DelveRun.tutorial.test.tsx` | `data-step` after Continue (Task 4); the centre slot, the hidden tracker, the stop's strip, the hidden HUD (Task 7) |
| `src/pages/__tests__/DelveRun.test.tsx` | the HUD hidden under the stop (Task 7) |
| `src/features/delve/arena/hud/__tests__/HudGrid.test.tsx` | the centre slot, `hidden` (Task 6) |
| `src/features/delve/stop/__tests__/StopScreen.test.tsx` | the strip between the title and the counts (Task 7) |
| `src/pages/__tests__/DelveTraining.tutorial.test.tsx` | the strip under the top bar, not in the right column (Task 8) |
| `src/features/delve/hub/__tests__/SystemMenu.test.tsx` | "Skip this step" (Task 10) |
| `e2e/fixtures/pad.ts` (new) | the fake pad, shared: `BUTTON`, `installPad`, `frames`, `tap` (Task 11) |
| `e2e/delve-tutorial.spec.ts` | one strip per screen, no HUD under the stop, a pad pass through a beat, steps read from `data-step` (Task 11) |

Not changed: `components/AppShell.tsx` (it still mounts `TutorialHighlight`), the kit, the engine, `tutorial.json`, `CLAUDE.md` and the version (plan 04).

## Where the spec left room

1. **The marker's attributes.** `data-target` is the marked target's id, set every frame (a way shows the way's id), and removed while nothing is marked; `data-arrow` is `above` or `below`. The marker renders for every current step (hidden while `findMarked` gives nothing), so plan 03's way out works on a step with no `highlight`. Its colours are literals (`#ffffff`, `#feae34`, `#181425`): it is portaled to `<body>`, outside `.delve-ui`, where the `--k-*` tokens are not defined.
2. **The marker's focus.** The key is `` `${step.id}:${marked.id}` `` plus the pad scope the marked element is found in (`closest('[data-pad-scope]')`): plan 03's pickers carry the same target as the field that opens them, and without the scope the pad would sit on the picker's Back. A dialog that holds no target changes nothing (nothing is marked under it, and the last key is kept). The key is noted whatever device holds the lock, so picking the pad up mid-step does not move the focus (`keepFocus` places it). A marked pane gives the focus to its first D-pad candidate (`candidates(...).find((c) => el.contains(c))`). The HUD is still excluded by `.delve-hud-zoom`: its slots are candidates in the code.
3. **The strip is a plain `k-glass` section**, not a kit `Panel` (a plate's frame and padding alone pass 72 px), with `data-pad-group` on every place. It carries `data-place` and `data-step` (the current step, also during a hold). The portrait is a 48 px box holding the 26 px sprite at `scale={1.75}` (2 px a sprite pixel at 1080p).
4. **`place` replaces `context`** on `TutorialPanel` (`'hud' | 'stop' | 'anvil'`; the zoom context follows from it).
5. **The folded line** is the `hidden` attribute, 8 s from when the step is shown (after its hold).
6. **The hold.** Enter waits with Continue during it. The chime is the existing `playSound('orbConfirm')`. A screen's last step is not held (the strip unmounts: "a screen change drops it").
7. **Continue's focus** moves on any device, as today's `autoFocus` did. It is given back only if the focus is still on Continue or nowhere (a player who walked off it keeps their place).
8. **The stop's strip gives way** below 720 px when the header row is short (it is `w-[720px] max-w-full min-w-0`; the title and the counts don't shrink): at 1280 × 800 the row has about 545 design px left.
9. **`HudGrid`:** `children` becomes `centre` (one flex column in the middle column: the strip, then the `BossBar`), and `hidden` is a prop.
10. **The tracker is hidden** by handing `FloorColumn` no quests while a floor step shows.
11. **The system menu's "Skip this step"** shows for the steps the Anvil shows (Anvil and Training steps), in the Anvil's menu and the Training Grounds' alike.
12. **The skip hint's glyph** is Esc / B at the Anvil (its system menu) and the menu binding elsewhere.
13. **E2E:** the test's observer records the strip's `data-step`, not its objective text: a held objective would hide a step shorter than the hold. The fake pad moves into `e2e/fixtures/pad.ts` (plan 03 uses it too); `delve-gamepad.spec.ts` keeps its own copy.

## Conventions

The overview's. In short: every command runs from the repo root in Git Bash; one commit per task on `padnav`, staged by path; the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` is the last `-m`; never push. The working tree's files are CRLF: keep each file's own endings (the Edit tool does). "Replace:" (a block) "with:" (a block) is one exact edit; blocks hold whole lines.

| What | Command |
|---|---|
| The tutorial's tests | `(cd packages/client && npx vitest run src/features/delve/tutorial)` |
| Client types | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client tests | `(cd packages/client && npx vitest run)` |

---

## Chunk 1: The marker

### Task 1: `marked.ts` and `useTutorialStep`

`WAY_TO`, `findTarget` and `findWay` move out of the component, `findWay` now returning what it stands for; `findMarked` is the one question the marker and the strip ask.

**Files:**
- Create: `packages/client/src/features/delve/tutorial/marked.ts`, `packages/client/src/features/delve/tutorial/__tests__/marked.test.tsx`
- Modify: `packages/client/src/features/delve/tutorial/tutorial-view.ts`, `TutorialHighlight.tsx`, `__tests__/tutorial-view.test.ts`, `__tests__/tutorial-targets.test.tsx`

- [ ] **Step 1: The failing tests**

Create `packages/client/src/features/delve/tutorial/__tests__/marked.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TutorialStep } from '@alloy/engine';
import { findMarked, findTarget, findWay } from '../marked';

// See the pad-nav and guidance spec (2.2): what the marker points at.

/** Where a `data-tutorial` element sits, by its target; anything else is a 10 px box at the corner. */
let boxes: Record<string, DOMRect> = {};
const step = (highlight?: TutorialStep['highlight']): TutorialStep => ({
  id: 'step',
  where: 'anvil',
  line: 'A line.',
  objective: 'Do it',
  highlight,
  trigger: { type: 'ack', count: 1 },
});
/** The hub with `tab` open: its two tabs, and Claim while `claim`. */
const hub = (tab: 'loadout' | 'quests', claim = tab === 'quests') => (
  <div data-pad-scope>
    <button role="tab" aria-selected={tab === 'loadout'} data-tutorial="hub.tab.loadout">
      Loadout
    </button>
    <button role="tab" aria-selected={tab === 'quests'} data-tutorial="hub.tab.quests">
      Quests
    </button>
    {claim && <button data-tutorial="quests.claim">Claim</button>}
  </div>
);

describe('what the marker points at', () => {
  beforeEach(() => {
    boxes = {};
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const t = this.dataset.tutorial;
      return (t && boxes[t]) || DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('findTarget: the last match in the topmost pad scope, none off screen or under another scope', () => {
    render(
      <div data-pad-scope>
        <button data-tutorial="quests.claim">First</button>
        <button data-tutorial="quests.claim">Last</button>
      </div>,
    );
    expect(findTarget('quests.claim')).toBe(screen.getByText('Last'));
    expect(findTarget('quests.board')).toBeNull();
    boxes['quests.claim'] = DOMRect.fromRect({ x: 5000, y: 0, width: 100, height: 40 });
    expect(findTarget('quests.claim')).toBeNull();
    boxes = {};
    render(
      <div data-pad-scope>
        <button>Resume</button>
      </div>,
    );
    expect(findTarget('quests.claim')).toBeNull();
  });

  it('findWay: the target, else the nearest way to it, each with the target it stands for', () => {
    const { rerender } = render(hub('loadout'));
    let way = findWay('quests.claim');
    expect(way?.el).toBe(screen.getByText('Quests'));
    expect(way?.id).toBe('hub.tab.quests');
    rerender(hub('quests'));
    way = findWay('quests.claim');
    expect(way?.el).toBe(screen.getByText('Claim'));
    expect(way?.id).toBe('quests.claim');
  });

  it('findWay passes over a way already open; a target that is itself a selected tab still counts', () => {
    render(hub('quests', false));
    expect(findWay('quests.claim')).toBeNull();
    expect(findWay('hub.tab.quests')?.el).toBe(screen.getByText('Quests'));
  });

  it("findMarked: the step's highlight by findWay, and nothing for a step that names none", () => {
    render(hub('loadout'));
    expect(findMarked(step())).toBeNull();
    expect(findMarked(step('quests.claim'))?.id).toBe('hub.tab.quests');
    expect(findMarked(step('hub.tab.loadout'))?.el).toBe(screen.getByText('Loadout'));
  });
});
```

In `packages/client/src/features/delve/tutorial/__tests__/tutorial-view.test.ts`:

Replace:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ArpgEvent } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { SHOWN_AT, stepIn, trainingEvents } from '../tutorial-view';
```
with:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ArpgEvent } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../registry';
import { SHOWN_AT, stepIn, trainingEvents, useTutorialStep } from '../tutorial-view';
```

Replace:
```ts
    expect(trainingEvents(registry, at('forge'), events)).toEqual([]);
    expect(trainingEvents(registry, null, events)).toEqual([]);
  });
});
```
with:
```ts
    expect(trainingEvents(registry, at('forge'), events)).toEqual([]);
    expect(trainingEvents(registry, null, events)).toEqual([]);
  });

  it("useTutorialStep is the save's current step's data: none with no tutorial or an unknown step", () => {
    useDelveStore.getState().resetProfile(1234, 'fire');
    const on = (step: string | null) =>
      act(() =>
        useDelveStore.setState({
          profile: { ...useDelveStore.getState().profile, tutorial: step ? at(step) : null },
        }),
      );
    const { result } = renderHook(() => useTutorialStep());
    expect(result.current).toBeUndefined();
    on('forge');
    expect(result.current?.id).toBe('forge');
    expect(result.current?.highlight).toBe('hub.tab.forge');
    on('gone');
    expect(result.current).toBeUndefined();
  });
});
```

In `packages/client/src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx`:

Replace:
```ts
import { WAY_TO } from '../TutorialHighlight';
```
with:
```ts
import { WAY_TO } from '../marked';
```

- [ ] **Step 2: Run them, and see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial)`
Expected: FAIL. `marked.test.tsx` and `tutorial-targets.test.tsx` cannot resolve `../marked`; `tutorial-view.test.ts` fails on `useTutorialStep is not a function`.

- [ ] **Step 3: `marked.ts`**

Create `packages/client/src/features/delve/tutorial/marked.ts`:

```ts
import type { TutorialStep, TutorialTarget } from '@alloy/engine';
import { scopedLast } from '../kit';

/**
 * What the guided start's marker points at (see the pad-nav and guidance spec, 2.2): a step's
 * target on screen, or the way to it. The marker (`TutorialHighlight`) and the strip's Continue
 * (`TutorialPanel`) both ask `findMarked`.
 */

/**
 * Where an Anvil target lives when it is not on screen: the control that opens its view or
 * bench, else its hub tab (each hub tab is `hub.tab.<id>`). The marker follows these to the
 * first one on screen, so the player is always shown where to go next.
 */
export const WAY_TO: Partial<Record<TutorialTarget, TutorialTarget>> = {
  'loadout.equip': 'hub.tab.loadout',
  'loadout.salvage': 'hub.tab.loadout',
  'loadout.compare': 'hub.tab.loadout',
  'loadout.transfer': 'hub.tab.loadout',
  'skills.mana': 'hub.tab.skills',
  'mana.bind': 'skills.mana',
  'skills.primary': 'hub.tab.skills',
  'skills.addSlot': 'skills.primary',
  'skills.elements': 'skills.primary',
  'skills.socket': 'skills.primary',
  'skills.apply': 'hub.tab.skills',
  'forge.pattern': 'hub.tab.forge',
  'forge.bar': 'hub.tab.forge',
  'forge.flux': 'hub.tab.forge',
  'forge.shard': 'hub.tab.forge',
  'forge.go': 'hub.tab.forge',
  'forge.refine': 'hub.tab.forge',
  'forge.temper': 'hub.tab.forge',
  'temper.hone': 'forge.temper',
  'quests.claim': 'hub.tab.quests',
  'quests.board': 'hub.tab.quests',
};

/** The last visible `[data-tutorial="<target>"]` in the topmost pad scope, on screen; else null. */
export function findTarget(target: string): HTMLElement | null {
  const el = scopedLast(`[data-tutorial="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const onScreen =
    r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
  return onScreen ? el : null;
}

/** What the marker points at: the element, and the target it stands for (the step's own, a way to it, or 'back'). */
export interface Marked {
  el: HTMLElement;
  id: string;
}

/**
 * The target on screen (`findTarget`), else the nearest way to it that is (`WAY_TO`), passing
 * over a way already open (a selected tab: what it holds just isn't showing); else null.
 */
export function findWay(target: TutorialTarget): Marked | null {
  for (let t: TutorialTarget | undefined = target; t; t = WAY_TO[t]) {
    const el = findTarget(t);
    if (el && (t === target || el.getAttribute('aria-selected') !== 'true')) return { el, id: t };
  }
  return null;
}

/** The step's marked control: its `highlight`, by `findWay`; null for a step that names none. */
export function findMarked(step: TutorialStep): Marked | null {
  return step.highlight ? findWay(step.highlight) : null;
}
```

- [ ] **Step 4: `useTutorialStep`**

In `packages/client/src/features/delve/tutorial/tutorial-view.ts`:

Replace:
```ts
  TutorialWhere,
} from '@alloy/engine';
```
with:
```ts
  TutorialWhere,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
```

Replace:
```ts
/**
 * The Training Grounds' one path into the guided start: while its step is a Training step, a
```
with:
```ts
/** The save's current guided step's data, or undefined (none running, or unknown). */
export function useTutorialStep(): TutorialStep | undefined {
  const id = useDelveStore((s) => s.profile.tutorial?.step);
  if (id === undefined) return undefined;
  return getDelveRegistry()
    .getTutorialData()
    .steps.find((s) => s.id === id);
}

/**
 * The Training Grounds' one path into the guided start: while its step is a Training step, a
```

- [ ] **Step 5: `TutorialHighlight.tsx` reads `marked.ts`**

In `packages/client/src/features/delve/tutorial/TutorialHighlight.tsx`:

Replace:
```ts
import { layerZoom, reducedMotion, scopedLast } from '../kit';
import { getDelveRegistry } from '../registry';
```
with:
```ts
import { layerZoom, reducedMotion } from '../kit';
import { getDelveRegistry } from '../registry';
import { findWay } from './marked';
```

Delete `findTarget`, `WAY_TO` and `findWay` with their doc comments: every line from `/** The target's element: the last visible …` down to the closing `}` of `findWay`, leaving `useTutorialTarget` above and `/** Under the pad, the focus moves to the target …` below.

Replace:
```ts
      const el = findWay(target);
```
with:
```ts
      const el = findWay(target)?.el ?? null;
```

- [ ] **Step 6: Run them, and see them pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/tutorial)`
Expected: no type errors; PASS, with `TutorialHighlight.test.tsx` unchanged and green.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/tutorial/marked.ts packages/client/src/features/delve/tutorial/tutorial-view.ts packages/client/src/features/delve/tutorial/TutorialHighlight.tsx packages/client/src/features/delve/tutorial/__tests__/marked.test.tsx packages/client/src/features/delve/tutorial/__tests__/tutorial-view.test.ts packages/client/src/features/delve/tutorial/__tests__/tutorial-targets.test.tsx
git commit -m "feat(client): marked.ts holds what the tutorial's marker points at" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: The marker

Brackets and a bouncing arrow instead of a gold outline, and the focus moved once per marked target (spec 1.5, 2.2).

**Files:**
- Modify (whole file): `packages/client/src/features/delve/tutorial/TutorialHighlight.tsx`, `packages/client/src/features/delve/tutorial/__tests__/TutorialHighlight.test.tsx`

- [ ] **Step 1: The failing tests**

Replace the whole of `packages/client/src/features/delve/tutorial/__tests__/TutorialHighlight.test.tsx` with:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { TutorialStep } from '@alloy/engine';
import { TutorialHighlight } from '../TutorialHighlight';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';

// See the pad-nav and guidance spec (1.5, 2.2): the marker round the current step's target.

const registry = getDelveRegistry();
const step = (id: string, highlight?: TutorialStep['highlight']): TutorialStep => ({
  id,
  where: 'anvil',
  line: 'A line.',
  objective: 'Do it',
  highlight,
  trigger: { type: 'ack', count: 1 },
});

/** Where each element sits: a `data-tutorial` one at `boxes[target]`, the rest on screen. */
let boxes: Record<string, DOMRect> = {};
let frames: FrameRequestCallback[] = [];
const nextFrame = () => act(() => frames.splice(0).forEach((f) => f(0)));

const at = (step: string | null) =>
  act(() =>
    useDelveStore.setState({
      profile: {
        ...useDelveStore.getState().profile,
        tutorial: step ? { step, count: 0, misses: 0 } : null,
      },
    }),
  );
const pad = () => act(() => useInputDeviceStore.getState().setDevice('gamepad'));
const marker = () => screen.queryByTestId('tutorial-highlight');
const placed = () => {
  const s = marker()!.style;
  return [s.display, s.left, s.top, s.width, s.height];
};

describe('TutorialHighlight (the marker)', () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234, 'fire');
    vi.spyOn(registry, 'getTutorialData').mockReturnValue({
      ...registry.getTutorialData(),
      steps: [
        step('look', 'hub.delve'),
        step('read'),
        step('hud', 'hud.potion'),
        step('bind', 'mana.bind'),
      ],
    });
    boxes = { 'hub.delve': DOMRect.fromRect({ x: 100, y: 500, width: 200, height: 40 }) };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const t = this.dataset.tutorial;
      return (t && boxes[t]) || DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 });
    });
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    useInputDeviceStore.getState().setDevice('keyboard');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws nothing with no tutorial, and hides on a step with nothing to mark', () => {
    render(<TutorialHighlight />);
    expect(marker()).toBeNull();
    at('read');
    expect(marker()!.style.display).toBe('none');
    expect(marker()).not.toHaveAttribute('data-target');
  });

  it("brackets the step's target 10 px outside it, an arrow above, and never takes the pointer", () => {
    render(
      <div data-pad-scope>
        <button data-tutorial="hub.delve">Delve</button>
      </div>,
    );
    render(<TutorialHighlight />);
    at('look');
    expect(marker()).toHaveAttribute('data-target', 'hub.delve');
    expect(marker()!.parentElement).toBe(document.body);
    expect(marker()).toHaveStyle({ pointerEvents: 'none', position: 'fixed' });
    expect(placed()).toEqual(['block', '90px', '490px', '220px', '60px']);
    expect(marker()!.querySelectorAll('[data-corner]')).toHaveLength(4);
    expect(marker()!.querySelector('[data-glyph="down"]')).not.toBeNull();
    expect(marker()).toHaveAttribute('data-arrow', 'above');
  });

  it('points from below when there is no room above the target', () => {
    boxes['hub.delve'] = DOMRect.fromRect({ x: 100, y: 20, width: 200, height: 40 });
    render(<button data-tutorial="hub.delve">Delve</button>);
    render(<TutorialHighlight />);
    at('look');
    expect(marker()).toHaveAttribute('data-arrow', 'below');
  });

  it('breathes and bounces, and stands still under reduced motion', () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
      render(<button data-tutorial="hub.delve">Delve</button>);
      const { unmount } = render(<TutorialHighlight />);
      at('look');
      expect(animate).toHaveBeenCalledTimes(2);
      unmount();
      expect(cancel).toHaveBeenCalledTimes(2);
      animate.mockClear();
      vi.stubGlobal('matchMedia', () => ({ matches: true }));
      render(<TutorialHighlight />);
      expect(marker()!.style.display).toBe('block');
      expect(animate).not.toHaveBeenCalled();
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('follows its target as the layout moves, and hides while it is off screen or gone', () => {
    const { unmount } = render(<button data-tutorial="hub.delve">Delve</button>);
    render(<TutorialHighlight />);
    at('look');
    boxes['hub.delve'] = DOMRect.fromRect({ x: 300, y: 560, width: 200, height: 40 });
    nextFrame();
    expect(placed()).toEqual(['block', '290px', '550px', '220px', '60px']);
    boxes['hub.delve'] = DOMRect.fromRect({ x: 5000, y: 560, width: 200, height: 40 });
    nextFrame();
    expect(marker()!.style.display).toBe('none');
    boxes['hub.delve'] = DOMRect.fromRect({ x: 300, y: 560, width: 200, height: 40 });
    unmount();
    nextFrame();
    expect(marker()!.style.display).toBe('none');
  });

  it('looks only in the topmost pad scope: a dialog over the target hides it', () => {
    render(
      <>
        <div data-pad-scope>
          <button data-tutorial="hub.delve">Delve</button>
        </div>
        <div data-pad-scope>
          <button>Resume</button>
        </div>
      </>,
    );
    render(<TutorialHighlight />);
    at('look');
    expect(marker()!.style.display).toBe('none');
  });

  it('under the pad, moves the focus to the target once as it appears; under the keys, leaves it', () => {
    render(
      <>
        <button data-testid="other">Other</button>
        <button data-tutorial="hub.delve">Delve</button>
      </>,
    );
    render(<TutorialHighlight />);
    at('look');
    expect(document.activeElement).toBe(document.body);
    at(null);
    pad();
    at('look');
    expect(screen.getByText('Delve')).toHaveFocus();
    act(() => screen.getByTestId('other').focus());
    nextFrame();
    expect(screen.getByTestId('other')).toHaveFocus();
  });

  it('a re-render that swaps the target for a new DOM node moves nothing', () => {
    const tree = (k: string) => (
      <>
        <button data-testid="other">Other</button>
        <button key={k} data-tutorial="hub.delve">
          Delve
        </button>
      </>
    );
    pad();
    const { rerender } = render(tree('a'));
    render(<TutorialHighlight />);
    at('look');
    const first = screen.getByText('Delve');
    expect(first).toHaveFocus();
    act(() => screen.getByTestId('other').focus());
    rerender(tree('b'));
    nextFrame();
    expect(screen.getByText('Delve')).not.toBe(first);
    expect(screen.getByTestId('other')).toHaveFocus();
    expect(marker()!.style.display).toBe('block');
  });

  it('the same target in a newly opened pad scope is a new marked target: the focus follows in, and back out', () => {
    const tree = (picker: boolean) => (
      <>
        <div data-pad-scope>
          <button data-tutorial="hub.delve">Field</button>
          <button data-testid="other">Other</button>
        </div>
        {picker && (
          <div data-pad-scope>
            <button>Back</button>
            <button data-tutorial="hub.delve">Pick</button>
          </div>
        )}
      </>
    );
    pad();
    const { rerender } = render(tree(false));
    render(<TutorialHighlight />);
    at('look');
    expect(screen.getByText('Field')).toHaveFocus();
    rerender(tree(true));
    act(() => screen.getByText('Back').focus());
    nextFrame();
    expect(screen.getByText('Pick')).toHaveFocus();
    rerender(tree(false));
    act(() => screen.getByTestId('other').focus());
    nextFrame();
    expect(screen.getByText('Field')).toHaveFocus();
  });

  it('points at the way to a target behind a tab or a view, the focus following only onto a D-pad stop', () => {
    boxes['hub.tab.skills'] = DOMRect.fromRect({ x: 400, y: 10, width: 100, height: 40 });
    boxes['skills.mana'] = DOMRect.fromRect({ x: 40, y: 500, width: 200, height: 60 });
    boxes['mana.bind'] = DOMRect.fromRect({ x: 600, y: 300, width: 300, height: 100 });
    const hub = (tab: string, view?: 'bind') => (
      <div data-pad-scope>
        <div role="tablist" data-pad-skip>
          <button role="tab" aria-selected={tab === 'loadout'} data-tutorial="hub.tab.loadout">
            Loadout
          </button>
          <button role="tab" aria-selected={tab === 'skills'} data-tutorial="hub.tab.skills">
            Skills
          </button>
        </div>
        {tab === 'skills' && <button data-tutorial="skills.mana">Mana</button>}
        {view === 'bind' && <div data-tutorial="mana.bind">Bind</div>}
      </div>
    );
    pad();
    const { rerender } = render(hub('loadout'));
    render(<TutorialHighlight />);
    at('bind');
    expect(marker()).toHaveAttribute('data-target', 'hub.tab.skills');
    expect(placed()).toEqual(['block', '390px', '0px', '120px', '60px']);
    // A kit tab is LB/RB's, never the D-pad's: the marker alone points at it.
    expect(screen.getByText('Skills')).not.toHaveFocus();
    rerender(hub('skills'));
    nextFrame();
    expect(marker()).toHaveAttribute('data-target', 'skills.mana');
    expect(placed()).toEqual(['block', '30px', '490px', '220px', '80px']);
    expect(screen.getByText('Mana')).toHaveFocus();
    rerender(hub('skills', 'bind'));
    nextFrame();
    expect(marker()).toHaveAttribute('data-target', 'mana.bind');
    expect(placed()).toEqual(['block', '590px', '290px', '320px', '120px']);
  });

  it('a marked pane gives the focus to its first D-pad stop', () => {
    boxes['mana.bind'] = DOMRect.fromRect({ x: 600, y: 300, width: 300, height: 100 });
    pad();
    render(
      <div data-tutorial="mana.bind">
        <span data-pad-skip>
          <button>Help</button>
        </span>
        <button>Frost</button>
        <button>Storm</button>
      </div>,
    );
    render(<TutorialHighlight />);
    at('bind');
    expect(screen.getByText('Frost')).toHaveFocus();
  });

  it('passes over a way already open: its tab selected, nothing to point at', () => {
    boxes['hub.tab.quests'] = DOMRect.fromRect({ x: 400, y: 10, width: 100, height: 40 });
    vi.mocked(registry.getTutorialData).mockReturnValue({
      ...registry.getTutorialData(),
      steps: [step('claim', 'quests.claim')],
    });
    render(
      <div data-pad-scope>
        <button role="tab" aria-selected data-tutorial="hub.tab.quests">
          Quests
        </button>
      </div>,
    );
    render(<TutorialHighlight />);
    at('claim');
    expect(marker()!.style.display).toBe('none');
  });

  it("never moves the pad's focus onto the HUD", () => {
    boxes['hud.potion'] = DOMRect.fromRect({ x: 10, y: 600, width: 56, height: 56 });
    render(
      <div className="delve-hud-zoom">
        <button data-tutorial="hud.potion">Potion</button>
      </div>,
    );
    pad();
    render(<TutorialHighlight />);
    at('hud');
    expect(marker()!.style.display).toBe('block');
    expect(screen.getByText('Potion')).not.toHaveFocus();
  });
});
```

- [ ] **Step 2: Run them, and see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial/__tests__/TutorialHighlight.test.tsx)`
Expected: FAIL. Among others: "draws nothing…" (the old component renders nothing on a step with no highlight, so `marker()!` is null), "brackets…" (`['block', '91px', '491px', '218px', '58px']`, no `[data-corner]`), "a re-render that swaps…" (the old rule refocuses the new node), "points at the way…" (`data-target` is `mana.bind`).

- [ ] **Step 3: The marker**

Replace the whole of `packages/client/src/features/delve/tutorial/TutorialHighlight.tsx` with:

```tsx
import { useEffect, useRef, type CSSProperties, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { candidates } from '@/features/gamepad/use-gamepad-nav';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { Glyph, layerZoom, reducedMotion } from '../kit';
import { findMarked } from './marked';
import { useTutorialStep } from './tutorial-view';

/** Design px: how far outside the target the brackets stand, and how far they breathe out. */
const GAP = 10;
const BREATH = 4;
/** Design px: a bracket's arm and its thickness. */
const ARM = 16;
const THICK = 4;
/** Design px: the arrow, its gap to the brackets and its bounce; so, the room it needs above the target. */
const ARROW = 28;
const ARROW_GAP = 6;
const BOUNCE = 6;
const ROOM = BREATH + ARROW_GAP + ARROW + BOUNCE;
/** The marker's motion: out and back, for ever. */
const SWING: KeyframeAnimationOptions = {
  duration: 600,
  direction: 'alternate',
  iterations: Infinity,
  easing: 'ease-in-out',
};

/** The marker's root, placed each frame: over everything, never taking the pointer. */
const ROOT: CSSProperties = {
  position: 'fixed',
  display: 'none',
  zIndex: 80,
  pointerEvents: 'none',
};
/** The brackets' box: the root's, under the target's zoom (set each frame), over an ink shadow (`--k-well`). */
const BOX: CSSProperties = {
  position: 'absolute',
  inset: 0,
  filter: 'drop-shadow(2px 2px 0 #181425)',
};
/** One bracket: a white corner, its two outer sides drawn. */
const CORNER: CSSProperties = { position: 'absolute', width: ARM, height: ARM, boxSizing: 'border-box' };
const LINE = `${THICK}px solid #ffffff`;
const CORNERS: CSSProperties[] = [
  { top: 0, left: 0, borderTop: LINE, borderLeft: LINE },
  { top: 0, right: 0, borderTop: LINE, borderRight: LINE },
  { bottom: 0, left: 0, borderBottom: LINE, borderLeft: LINE },
  { bottom: 0, right: 0, borderBottom: LINE, borderRight: LINE },
];
/** The arrow's arm: centred above the box (each frame turns it under the box when there is no room above). */
const ARROW_ARM: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: '100%',
  paddingBottom: ARROW_GAP,
  transform: 'translateX(-50%)',
};

/**
 * Under the pad, the focus moves to the marked control, or to the first D-pad stop inside a
 * marked pane: never onto a control the D-pad passes by (a kit tab), never onto the HUD.
 */
function focusMarked(el: HTMLElement): void {
  if (useInputDeviceStore.getState().device !== 'gamepad' || el.closest('.delve-hud-zoom')) return;
  candidates(document.activeElement)
    .find((c) => el.contains(c))
    ?.focus();
}

/**
 * The guided start's marker (see the pad-nav and guidance spec, 1.5 and 2.2): four white corner
 * brackets round the control the current step marks (`findMarked`: its target, or the way to
 * it), breathing, under a bouncing forge-orange arrow (`--k-hot`) that points at it from above,
 * or from below when there is no room. It can't be read as the focus ring, and both can sit on
 * one control. It looks only in the topmost pad scope, follows its target as the layout moves
 * (it is placed every frame), stands still under reduced motion and never takes the pointer.
 * `data-target` names what it marks. Under the pad the focus moves to the marked control once
 * each time the marked target changes: keyed on the step, the target's id and the pad scope it
 * is found in (a picker opened over a field of the same target is a new one), never on the
 * target's DOM node, so a re-render moves nothing. Mounted once, by AppShell.
 */
export function TutorialHighlight(): ReactElement | null {
  const step = useTutorialStep();
  const root = useRef<HTMLDivElement>(null);
  const brackets = useRef<HTMLDivElement>(null);
  const arrowArm = useRef<HTMLSpanElement>(null);
  const arrow = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const [div, box, arm, tip] = [root.current, brackets.current, arrowArm.current, arrow.current];
    if (!step || !div || !box || !arm || !tip) return;
    const moving = reducedMotion()
      ? []
      : [
          box.animate?.([{ inset: '0px' }, { inset: `${-BREATH}px` }], SWING),
          tip.animate?.(
            [{ transform: 'translateY(0)' }, { transform: `translateY(${-BOUNCE}px)` }],
            SWING,
          ),
        ];
    /** The marked target the focus last followed (`<step>:<target>`), and the pad scope it was in. */
    let followed = '';
    let followedIn: Element | null = null;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const marked = findMarked(step);
      div.style.display = marked ? 'block' : 'none';
      if (!marked) return div.removeAttribute('data-target');
      div.dataset.target = marked.id;
      const key = `${step.id}:${marked.id}`;
      const scope = marked.el.closest('[data-pad-scope]');
      if (key !== followed || scope !== followedIn) focusMarked(marked.el);
      followed = key;
      followedIn = scope;
      const r = marked.el.getBoundingClientRect();
      const z = layerZoom(marked.el);
      const out = GAP * z;
      div.style.left = `${r.left - out}px`;
      div.style.top = `${r.top - out}px`;
      div.style.width = `${r.width + out * 2}px`;
      div.style.height = `${r.height + out * 2}px`;
      // The brackets and the arrow are in design px, under the zoom of what they mark.
      box.style.zoom = String(z);
      const below = r.top - out < ROOM * z;
      arm.style.top = below ? '100%' : '';
      arm.style.bottom = below ? '' : '100%';
      arm.style.transform = below ? 'translateX(-50%) rotate(180deg)' : 'translateX(-50%)';
      div.dataset.arrow = below ? 'below' : 'above';
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      for (const a of moving) a?.cancel();
    };
  }, [step]);
  if (!step) return null;
  return createPortal(
    <div ref={root} aria-hidden style={ROOT} data-testid="tutorial-highlight">
      <div ref={brackets} style={BOX}>
        {CORNERS.map((corner, i) => (
          <span key={i} data-corner style={{ ...CORNER, ...corner }} />
        ))}
        <span ref={arrowArm} style={ARROW_ARM}>
          <span ref={arrow} style={{ display: 'flex' }}>
            <Glyph id="down" size={ARROW} color="#feae34" />
          </span>
        </span>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Run them, and see them pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/tutorial)`
Expected: no type errors; PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/tutorial/TutorialHighlight.tsx packages/client/src/features/delve/tutorial/__tests__/TutorialHighlight.test.tsx
git commit -m "feat(client): the tutorial's marker is brackets and an arrow, and takes the focus once per target" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 2: The strip

### Task 3: `TutorialPanel` becomes the strip

One layout for every place: the portrait, the objective large, the line; the HUD's line folds away after 8 s; "Skip this step" becomes a mouse button with the way to it from the Menu. `place` replaces `context`. Continue keeps `autoFocus` until Task 5, and the screens keep the strip where the panel was until Chunks 4 and 5.

**Files:**
- Modify (whole file): `packages/client/src/features/delve/tutorial/TutorialPanel.tsx`, `packages/client/src/features/delve/tutorial/__tests__/TutorialPanel.test.tsx`
- Modify: `packages/client/src/pages/DelveRun.tsx`, `packages/client/src/pages/DelveTraining.tsx`, `packages/client/src/features/delve/hub/AnvilHub.tsx`

- [ ] **Step 1: The failing tests**

Replace the whole of `packages/client/src/features/delve/tutorial/__tests__/TutorialPanel.test.tsx` with:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { tutorialSkippable, tutorialText, type TutorialWhere } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { LINE_MS, TutorialPanel, type TutorialPlace } from '../TutorialPanel';
import { SHOWN_AT } from '../tutorial-view';
import { at, fakeText, withSteps } from './tutorial-fixture';

// See the pad-nav and guidance spec (2.1): Hesta's objective strip.

// The runner's text and skip rule are the tutorial's B1: here the step's own words, and no skip.
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  tutorialText: vi.fn(),
  tutorialSkippable: vi.fn(),
}));

const onEvent = vi.fn();
/** The strip at `step`: in the HUD, showing the dive's steps, unless `over` says otherwise. */
const strip = (
  step: string,
  over: { where?: readonly TutorialWhere[]; count?: number; place?: TutorialPlace } = {},
) => (
  <TutorialPanel
    state={at(step, over.count)}
    where={over.where ?? SHOWN_AT.dive}
    place={over.place ?? 'hud'}
    onEvent={onEvent}
  />
);

beforeEach(() => {
  withSteps();
  vi.mocked(tutorialText).mockImplementation(fakeText);
  vi.mocked(tutorialSkippable).mockReturnValue(false);
  onEvent.mockReset();
  useDelveStore.getState().resetProfile(1234, 'fire');
  useInputDeviceStore.setState({ device: 'keyboard' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TutorialPanel (the objective strip)', () => {
  it('is one strip: Hesta, the objective with its inputs for the device in hand, then her line', () => {
    render(strip('cast'));
    const p = screen.getByTestId('tutorial-panel');
    expect(p).toHaveAccessibleName('Hesta');
    expect(p).toHaveAttribute('data-place', 'hud');
    expect(p).toHaveAttribute('data-step', 'cast');
    expect(p).toHaveAttribute('data-pad-group');
    expect(p).not.toHaveAttribute('data-pad-scope');
    expect(p.querySelector('[data-sprite="hesta"]')).not.toBeNull();
    const objective = screen.getByTestId('tutorial-objective');
    const line = screen.getByTestId('tutorial-line');
    expect(objective).toHaveTextContent('Cast with Q');
    expect(line).toHaveTextContent('Cast your Primary.');
    expect(objective.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tutorialText).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'cast',
      undefined,
    );
    act(() => useInputDeviceStore.setState({ device: 'gamepad' }));
    expect(within(objective).getByRole('img', { name: 'RT' })).toBeInTheDocument();
  });

  it('draws moving as the four keys, or the left stick under the pad', () => {
    render(strip('walk'));
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent('Walk with WASD');
    act(() => useInputDeviceStore.setState({ device: 'gamepad' }));
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent('Walk with Left stick');
  });

  it("counts a step that needs more than one, and shows nothing for another screen's step", () => {
    render(strip('cast', { count: 1 }));
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent('1 / 2');
    render(strip('forge'));
    expect(screen.getAllByTestId('tutorial-panel')).toHaveLength(1);
  });

  it('in the HUD her line folds away LINE_MS after a step begins, staying in the DOM; a new step brings it back', () => {
    vi.useFakeTimers();
    const { rerender } = render(strip('cast'));
    const line = () => screen.getByTestId('tutorial-line');
    expect(line()).toBeVisible();
    act(() => vi.advanceTimersByTime(LINE_MS));
    expect(line()).not.toBeVisible();
    expect(line()).toHaveTextContent('Cast your Primary.');
    rerender(strip('walk'));
    act(() => vi.advanceTimersByTime(1000)); // past the step's hold (Task 4), well short of LINE_MS
    expect(line()).toBeVisible();
    expect(line()).toHaveTextContent('Walk to the light.');
  });

  it('her line stays through a beat, and always at the stop and the Anvil', () => {
    vi.useFakeTimers();
    render(strip('listen'));
    render(strip('equip', { place: 'stop' }));
    render(strip('forge', { where: SHOWN_AT.anvil, place: 'anvil' }));
    act(() => vi.advanceTimersByTime(LINE_MS * 2));
    const lines = screen.getAllByTestId('tutorial-line');
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line).toBeVisible();
  });

  it('a reading beat has Continue, which sends the ack, as Enter does', () => {
    render(strip('listen'));
    const go = screen.getByTestId('tutorial-continue');
    fireEvent.click(go);
    expect(onEvent).toHaveBeenCalledWith({ type: 'ack' });
    // With nothing focused, Enter continues too.
    go.blur();
    fireEvent.keyDown(document.body, { code: 'Enter' });
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('a step to do has no Continue, and Enter is left alone', () => {
    render(strip('cast'));
    expect(screen.queryByTestId('tutorial-continue')).toBeNull();
    fireEvent.keyDown(document.body, { code: 'Enter' });
    expect(onEvent).not.toHaveBeenCalled();
    expect(screen.queryByTestId('tutorial-skip-step')).toBeNull();
  });

  it('Skip this step, when allowed, is a mouse button the D-pad passes by, with the way to it from the Menu', () => {
    vi.mocked(tutorialSkippable).mockReturnValue(true);
    render(strip('cast'));
    const skip = screen.getByTestId('tutorial-skip-step');
    expect(skip.closest('[data-pad-skip]')).not.toBeNull();
    expect(skip).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('tutorial-panel')).toHaveTextContent(
      /Stuck\? Skip this step from the\s*Esc\s*Menu/,
    );
    fireEvent.click(skip);
    expect(onEvent).toHaveBeenCalledWith({ type: 'skipStep' });
  });
});
```

- [ ] **Step 2: Run them, and see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial/__tests__/TutorialPanel.test.tsx)`
Expected: FAIL. `LINE_MS` is undefined and `place` is unknown: no `data-place`, the line never folds, the skip button has no `[data-pad-skip]` ancestor.

- [ ] **Step 3: The strip**

Replace the whole of `packages/client/src/features/delve/tutorial/TutorialPanel.tsx` with:

```tsx
import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  tutorialSkippable,
  tutorialText,
  type ArpgWorld,
  type TutorialEvent,
  type TutorialInput,
  type TutorialState,
  type TutorialTextPart,
  type TutorialWhere,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useControlsStore } from '@/stores/controlsStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { keyLabel } from '@/features/controls/controls';
import { Button, InputGlyph, Keycap, PixelSprite, usePrompts, type Binding } from '../kit';
import { bindingOf } from '../arena/hud/SkillDock';
import { getDelveRegistry } from '../registry';
import { stepIn } from './tutorial-view';

/** An input a line names, for the device in hand: the moving and aiming sticks or keys, else the action's binding. */
function InputPart({ input }: { input: TutorialInput }): ReactElement {
  const config = useControlsStore((s) => s.config);
  const pad = useInputDeviceStore((s) => s.device) === 'gamepad';
  if (input === 'move' || input === 'aim') {
    if (pad) return <Keycap size="sm" label={input === 'move' ? 'Left stick' : 'Right stick'} />;
    if (input === 'aim') return <Keycap size="sm" label="Mouse" />;
    const keys = (['up', 'left', 'down', 'right'] as const).map((k) => config.keys[k]);
    return (
      <span className="k-glyph-row">
        {keys.map((k, i) => (
          <Keycap key={i} size="sm" label={keyLabel(k)} />
        ))}
      </span>
    );
  }
  const binding = bindingOf(config, input);
  return (
    <InputGlyph binding={input === 'attack' ? { ...binding, mouse: 'lmb' } : binding} size="sm" />
  );
}

/** `tutorialText`'s parts: its runs of text, and each `{input:…}` as its glyph. */
export function TutorialParts({ parts }: { parts: TutorialTextPart[] }): ReactElement {
  return (
    <>
      {parts.map((p, i) =>
        'text' in p ? <span key={i}>{p.text}</span> : <InputPart key={i} input={p.input} />,
      )}
    </>
  );
}

/** Where the strip sits: the arena's HUD (the dive, the Training Grounds), the stop's header row, or the Anvil's row. */
export type TutorialPlace = 'hud' | 'stop' | 'anvil';

/** How long the HUD's strip shows Hesta's line after a step begins, before it folds away. */
export const LINE_MS = 8000;

export interface TutorialPanelProps {
  /** The state to show: a floor's `world.tutorial` while it is fought, else the save's. */
  state: TutorialState;
  /** The screen's steps (`SHOWN_AT`): another step shows nothing. */
  where: readonly TutorialWhere[];
  /** The floor's world, for its Primary's next move (`{primarySkill}`). */
  world?: ArpgWorld | null;
  /** Where it sits: 720 px wide in the HUD and the stop (the line under the objective), a full row at the Anvil (the line beside it). */
  place: TutorialPlace;
  /** A beat's Continue (`ack`) and "Skip this step" (`skipStep`), to the floor or the save. */
  onEvent: (event: TutorialEvent) => void;
}

/**
 * Hesta's objective strip (see the pad-nav and guidance spec, 2.1): her portrait, the objective
 * large (with the inputs drawn for the device in hand, and the count while a step needs more
 * than one), then her line, all as `tutorialText` gives them. In the HUD her line folds away
 * `LINE_MS` after a step begins (it stays in the DOM) but for a beat; at the stop and the Anvil
 * it always shows. A reading beat has Continue (A on the pad, and Enter in the screen's pad
 * scope), the strip's only D-pad stop; the strip is never a scope of its own, so the screen's
 * tabs, prompts and Menu keep working. When `tutorialSkippable` allows it, "Skip this step" is
 * a mouse button the D-pad passes by, beside the way to it from the Menu.
 */
export function TutorialPanel({
  state,
  where,
  world,
  place,
  onEvent,
}: TutorialPanelProps): ReactElement | null {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const config = useControlsStore((s) => s.config);
  const root = useRef<HTMLElement>(null);
  const step = stepIn(registry, state, where);
  /** The step on show, and whether its Continue is. */
  const shown = step;
  const beat = !!step?.beat;
  // Enter continues a beat, in whatever scope holds the strip (a focused control keeps its own).
  usePrompts(
    [
      {
        id: 'tutorial-continue',
        label: 'Continue',
        binding: { key: ['Enter', 'NumpadEnter'] },
        onPress: () => onEvent({ type: 'ack' }),
        disabled: !beat,
      },
    ],
    root,
  );
  /** The step whose line has folded away (the HUD's strip only: the others always show it). */
  const [foldedId, setFoldedId] = useState<string | null>(null);
  useEffect(() => {
    if (place !== 'hud' || !shown || shown.beat) return;
    const t = setTimeout(() => setFoldedId(shown.id), LINE_MS);
    return () => clearTimeout(t);
  }, [place, shown]);
  if (!step || !shown) return null;
  const giver = registry.getQuestsData().giver;
  const text = tutorialText(registry, profile, shown.id, world);
  const skippable = tutorialSkippable(registry, profile, state, world);
  const need = shown.trigger.count;
  /** How the Menu that holds "Skip this step" opens here: the Anvil's system menu, else the menu binding. */
  const menu: Binding =
    place === 'anvil'
      ? { key: 'Escape', pad: 'b' }
      : { key: config.keys.menu ?? undefined, pad: config.pad.menu ?? undefined };
  return (
    <section
      ref={root}
      aria-label={giver.name}
      className={`k-glass pointer-events-auto box-border flex items-center gap-4 px-4 py-2 ${
        place === 'anvil' ? 'w-full' : 'w-[720px] max-w-full min-w-0'
      }`}
      data-pad-group
      data-place={place}
      data-step={step.id}
      data-testid="tutorial-panel"
    >
      <span className="flex size-[52px] flex-none items-center justify-center">
        <PixelSprite
          id={giver.sprite}
          scale={1.75}
          context={place === 'hud' ? 'hud' : 'ui'}
          label={giver.name}
        />
      </span>
      <div
        className={`flex min-w-0 flex-1 ${place === 'anvil' ? 'items-center gap-6' : 'flex-col gap-1'}`}
      >
        <p
          className="m-0 flex origin-left flex-wrap items-center gap-x-2 gap-y-1 text-[28px] leading-none text-[var(--k-hot-hi)] [font-family:var(--k-font-display)]"
          data-testid="tutorial-objective"
        >
          <TutorialParts parts={text.objective} />
          {need > 1 && (
            <span className="inline-block text-[var(--k-text-2)]" data-testid="tutorial-count">
              {Math.min(state.count, need)} / {need}
            </span>
          )}
        </p>
        <p
          className="m-0 min-w-0 flex-1 text-[16px] leading-[1.35] text-[var(--k-text)]"
          hidden={foldedId === shown.id}
          data-testid="tutorial-line"
        >
          <TutorialParts parts={text.line} />
        </p>
      </div>
      {(beat || skippable) && (
        <div className="flex flex-none items-center gap-3">
          {skippable && (
            <span className="flex items-center gap-2 text-[14px] text-[var(--k-text-3)]" data-pad-skip>
              Stuck? Skip this step from the
              <InputGlyph binding={menu} size="sm" />
              Menu
              <Button
                variant="quiet"
                size="sm"
                tabIndex={-1}
                onClick={() => onEvent({ type: 'skipStep' })}
                testId="tutorial-skip-step"
              >
                Skip this step
              </Button>
            </span>
          )}
          {beat && (
            <Button
              variant="primary"
              binding={{ key: 'Enter', pad: 'a' }}
              onClick={() => onEvent({ type: 'ack' })}
              autoFocus
              data-pad-first
              testId="tutorial-continue"
            >
              Continue
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: The screens pass `place`**

In `packages/client/src/pages/DelveRun.tsx`:

Replace:
```tsx
                    world={world}
                    context="hud"
                    onEvent={onTutorial}
```
with:
```tsx
                    world={world}
                    place="hud"
                    onEvent={onTutorial}
```

Replace:
```tsx
                  where={SHOWN_AT.dive}
                  context="ui"
                  onEvent={onTutorial}
```
with:
```tsx
                  where={SHOWN_AT.dive}
                  place="stop"
                  onEvent={onTutorial}
```

In `packages/client/src/pages/DelveTraining.tsx`:

Replace:
```tsx
                  where={SHOWN_AT.training}
                  context="hud"
```
with:
```tsx
                  where={SHOWN_AT.training}
                  place="hud"
```

In `packages/client/src/features/delve/hub/AnvilHub.tsx`:

Replace:
```tsx
                    where={SHOWN_AT.anvil}
                    context="ui"
```
with:
```tsx
                    where={SHOWN_AT.anvil}
                    place="anvil"
```

- [ ] **Step 5: Run them, and see them pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/tutorial src/pages)`
Expected: no type errors; PASS (`GuidedChoice`, `DelveRun.tutorial` and `DelveTraining.tutorial` still find the strip where the panel was, and Continue still autofocuses).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/tutorial/TutorialPanel.tsx packages/client/src/features/delve/tutorial/__tests__/TutorialPanel.test.tsx packages/client/src/pages/DelveRun.tsx packages/client/src/pages/DelveTraining.tsx packages/client/src/features/delve/hub/AnvilHub.tsx
git commit -m "feat(client): Hesta's panel becomes one objective strip" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 3: The strip's hold and Continue's focus

### Task 4: The hold on a finished step

A step change holds the finished objective for 700 ms with a tick and a chime, then pops the current step in; a count going up pulses. Display only.

**Files:**
- Modify: `packages/client/src/features/delve/tutorial/TutorialPanel.tsx`, `__tests__/TutorialPanel.test.tsx`, `__tests__/GuidedChoice.test.tsx`, `packages/client/src/pages/__tests__/DelveRun.tutorial.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/tutorial/__tests__/TutorialPanel.test.tsx`:

Replace:
```tsx
import { LINE_MS, TutorialPanel, type TutorialPlace } from '../TutorialPanel';
```
with:
```tsx
import { playSound } from '@/shared/utils/sound-manager';
import { STEP_HOLD_MS, LINE_MS, TutorialPanel, type TutorialPlace } from '../TutorialPanel';
```

Replace:
```tsx
const onEvent = vi.fn();
```
with:
```tsx
vi.mock('@/shared/utils/sound-manager', () => ({ playSound: vi.fn() }));

const onEvent = vi.fn();
```

Replace:
```tsx
  onEvent.mockReset();
  useDelveStore.getState().resetProfile(1234, 'fire');
```
with:
```tsx
  onEvent.mockReset();
  vi.mocked(playSound).mockClear();
  useDelveStore.getState().resetProfile(1234, 'fire');
```

Append to the end of the file:

```tsx

describe("the strip's hold on a finished step", () => {
  beforeEach(() => vi.useFakeTimers());
  const objective = () => screen.getByTestId('tutorial-objective');

  it('holds the finished objective, ticked, for STEP_HOLD_MS with a chime; then the current step, the ones passed meanwhile not replayed', () => {
    const { rerender } = render(strip('cast', { count: 1 }));
    expect(playSound).not.toHaveBeenCalled();
    rerender(strip('listen'));
    expect(screen.getByTestId('tutorial-panel')).toHaveAttribute('data-step', 'listen');
    expect(objective()).toHaveTextContent('Cast with Q');
    expect(within(objective()).getByRole('img', { name: 'Done' })).toBeInTheDocument();
    expect(objective()).not.toHaveTextContent('/ 2');
    expect(playSound).toHaveBeenCalledExactlyOnceWith('orbConfirm');
    act(() => vi.advanceTimersByTime(STEP_HOLD_MS - 100));
    rerender(strip('walk'));
    expect(objective()).toHaveTextContent('Cast with Q');
    act(() => vi.advanceTimersByTime(100));
    expect(objective()).toHaveTextContent('Walk with WASD');
    expect(within(objective()).queryByRole('img', { name: 'Done' })).toBeNull();
    expect(playSound).toHaveBeenCalledTimes(1);
  });

  it('a beat shows Continue only after the hold, and Enter waits with it', () => {
    const { rerender } = render(strip('cast'));
    rerender(strip('listen'));
    expect(screen.queryByTestId('tutorial-continue')).toBeNull();
    fireEvent.keyDown(document.body, { code: 'Enter' });
    expect(onEvent).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(STEP_HOLD_MS));
    expect(screen.getByTestId('tutorial-continue')).toBeInTheDocument();
  });

  it('Skip this step waits out the hold too', () => {
    vi.mocked(tutorialSkippable).mockReturnValue(true);
    const { rerender } = render(strip('cast'));
    rerender(strip('walk'));
    expect(screen.queryByTestId('tutorial-skip-step')).toBeNull();
    act(() => vi.advanceTimersByTime(STEP_HOLD_MS));
    expect(screen.getByTestId('tutorial-skip-step')).toBeInTheDocument();
  });

  it("a screen change drops the hold: the screen's next step shows at once", () => {
    const { rerender } = render(strip('cast'));
    rerender(strip('forge')); // the Anvil's step: this screen shows nothing
    expect(screen.queryByTestId('tutorial-panel')).toBeNull();
    rerender(strip('walk'));
    expect(objective()).toHaveTextContent('Walk with WASD');
    expect(playSound).not.toHaveBeenCalled();
  });

  it('pops the current step in and pulses a count going up; under reduced motion neither moves', () => {
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
      const { rerender } = render(strip('cast'));
      expect(animate).not.toHaveBeenCalled();
      rerender(strip('cast', { count: 1 }));
      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate.mock.contexts[0]).toBe(screen.getByTestId('tutorial-count'));
      rerender(strip('walk'));
      expect(animate).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(STEP_HOLD_MS));
      expect(animate).toHaveBeenCalledTimes(2);
      expect(animate.mock.contexts[1]).toBe(objective());
      vi.stubGlobal('matchMedia', () => ({ matches: true }));
      rerender(strip('cast'));
      act(() => vi.advanceTimersByTime(STEP_HOLD_MS));
      expect(objective()).toHaveTextContent('Cast with Q');
      expect(animate).toHaveBeenCalledTimes(2);
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
      vi.unstubAllGlobals();
    }
  });
});
```

- [ ] **Step 2: Run them, and see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial/__tests__/TutorialPanel.test.tsx)`
Expected: FAIL in the new `describe` (`STEP_HOLD_MS` is undefined; the objective changes at once; `playSound` is never called). The first `describe` still passes.

- [ ] **Step 3: The hold**

In `packages/client/src/features/delve/tutorial/TutorialPanel.tsx`:

Replace:
```tsx
import { keyLabel } from '@/features/controls/controls';
import { Button, InputGlyph, Keycap, PixelSprite, usePrompts, type Binding } from '../kit';
```
with:
```tsx
import { keyLabel } from '@/features/controls/controls';
import { playSound } from '@/shared/utils/sound-manager';
import {
  Button,
  Glyph,
  InputGlyph,
  Keycap,
  PixelSprite,
  reducedMotion,
  usePrompts,
  type Binding,
} from '../kit';
```

Replace:
```tsx
/** How long the HUD's strip shows Hesta's line after a step begins, before it folds away. */
export const LINE_MS = 8000;
```
with:
```tsx
/** How long the HUD's strip shows Hesta's line after a step begins, before it folds away. */
export const LINE_MS = 8000;
/** How long the strip holds a finished objective, ticked, before it shows the current step. */
export const STEP_HOLD_MS = 700;

/** The current step arriving after a hold, and a count going up. */
const POP: Keyframe[] = [
  { transform: 'scale(1.15)', opacity: 0.3 },
  { transform: 'scale(1)', opacity: 1 },
];
const PULSE: Keyframe[] = [{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }];

/**
 * The finished step the strip is holding, or null. A change of step holds the one before it for
 * `STEP_HOLD_MS`, with a chime; steps that pass meanwhile are not held in their turn, and a screen
 * with no step to show drops the hold. Display only: the engine has already moved on.
 */
function useHeld(id: string | undefined): string | null {
  const [prev, setPrev] = useState(id);
  const [held, setHeld] = useState<string | null>(null);
  if (prev !== id) {
    setPrev(id);
    if (!id) setHeld(null);
    else if (prev && !held) setHeld(prev);
  }
  useEffect(() => {
    if (!held) return;
    playSound('orbConfirm');
    const t = setTimeout(() => setHeld(null), STEP_HOLD_MS);
    return () => clearTimeout(t);
  }, [held]);
  return held;
}
```

Replace:
```tsx
 * tabs, prompts and Menu keep working. When `tutorialSkippable` allows it, "Skip this step" is
 * a mouse button the D-pad passes by, beside the way to it from the Menu.
 */
```
with:
```tsx
 * tabs, prompts and Menu keep working. When `tutorialSkippable` allows it, "Skip this step" is
 * a mouse button the D-pad passes by, beside the way to it from the Menu. When the step changes
 * the strip holds the finished objective for `STEP_HOLD_MS` with a tick and a chime (`useHeld`),
 * then the current step pops in; a count going up pulses; under reduced motion nothing moves.
 */
```

Replace:
```tsx
  const root = useRef<HTMLElement>(null);
  const step = stepIn(registry, state, where);
  /** The step on show, and whether its Continue is. */
  const shown = step;
  const beat = !!step?.beat;
```
with:
```tsx
  const root = useRef<HTMLElement>(null);
  const objective = useRef<HTMLParagraphElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const step = stepIn(registry, state, where);
  const held = useHeld(step?.id);
  /** The step on show (the one just finished while its hold runs), and whether its Continue is. */
  const shown = (held && registry.getTutorialData().steps.find((s) => s.id === held)) || step;
  const beat = !!step?.beat && !held;
```

Replace:
```tsx
  }, [place, shown]);
  if (!step || !shown) return null;
```
with:
```tsx
  }, [place, shown]);
  // The step on show arrives with a pop (not the first one), and a count going up pulses.
  const popped = useRef(shown?.id);
  useEffect(() => {
    if (popped.current === shown?.id) return;
    popped.current = shown?.id;
    if (!reducedMotion()) objective.current?.animate?.(POP, { duration: 220, easing: 'ease-out' });
  }, [shown]);
  const counted = useRef(state.count);
  useEffect(() => {
    if (state.count > counted.current && !reducedMotion())
      counter.current?.animate?.(PULSE, { duration: 200, easing: 'ease-out' });
    counted.current = state.count;
  }, [state.count]);
  if (!step || !shown) return null;
```

Replace:
```tsx
  const skippable = tutorialSkippable(registry, profile, state, world);
```
with:
```tsx
  const skippable = !held && tutorialSkippable(registry, profile, state, world);
```

Replace:
```tsx
        <p
          className="m-0 flex origin-left flex-wrap items-center gap-x-2 gap-y-1 text-[28px] leading-none text-[var(--k-hot-hi)] [font-family:var(--k-font-display)]"
          data-testid="tutorial-objective"
        >
          <TutorialParts parts={text.objective} />
          {need > 1 && (
            <span className="inline-block text-[var(--k-text-2)]" data-testid="tutorial-count">
              {Math.min(state.count, need)} / {need}
            </span>
          )}
        </p>
```
with:
```tsx
        <p
          ref={objective}
          className="m-0 flex origin-left flex-wrap items-center gap-x-2 gap-y-1 text-[28px] leading-none text-[var(--k-hot-hi)] [font-family:var(--k-font-display)]"
          data-testid="tutorial-objective"
        >
          <TutorialParts parts={text.objective} />
          {held ? (
            <Glyph id="check" size={22} title="Done" />
          ) : (
            need > 1 && (
              <span
                ref={counter}
                className="inline-block text-[var(--k-text-2)]"
                data-testid="tutorial-count"
              >
                {Math.min(state.count, need)} / {need}
              </span>
            )
          )}
        </p>
```

- [ ] **Step 4: Two tests that read the strip right after a step change**

The strip now shows the finished step for 700 ms, so they read the current step from `data-step`.

In `packages/client/src/pages/__tests__/DelveRun.tutorial.test.tsx`:

Replace:
```tsx
    expect(seen.live.at(-1)).toBe(true);
    expect(screen.getByTestId('tutorial-panel')).toHaveTextContent('Cast your Primary.');
```
with:
```tsx
    expect(seen.live.at(-1)).toBe(true);
    expect(screen.getByTestId('tutorial-panel')).toHaveAttribute('data-step', 'cast');
```

In `packages/client/src/features/delve/tutorial/__tests__/GuidedChoice.test.tsx`:

Replace:
```tsx
    step('raise');
    expect(screen.getByTestId('tutorial-panel')).toHaveTextContent('Raise your Defensive.');
```
with:
```tsx
    step('raise');
    expect(screen.getByTestId('tutorial-panel')).toHaveAttribute('data-step', 'raise');
```

- [ ] **Step 5: Run them, and see them pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/tutorial src/pages src/features/delve/stop)`
Expected: no type errors; PASS.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/tutorial/TutorialPanel.tsx packages/client/src/features/delve/tutorial/__tests__/TutorialPanel.test.tsx packages/client/src/features/delve/tutorial/__tests__/GuidedChoice.test.tsx packages/client/src/pages/__tests__/DelveRun.tutorial.test.tsx
git commit -m "feat(client): the strip holds a finished objective with a tick and a chime" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: Continue takes the focus by its rule, and gives it back

No `autoFocus`, no `data-pad-first`. The focus moves to Continue once, when `findMarked(step)` is null or is the step's own `highlight` on screen, and only while the strip's scope is the topmost; when the beat ends it goes back to the control it came from, if the D-pad can still reach it.

**Files:**
- Modify: `packages/client/src/features/delve/tutorial/TutorialPanel.tsx`, `__tests__/TutorialPanel.test.tsx`, `__tests__/tutorial-fixture.ts`, `__tests__/GuidedChoice.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/tutorial/__tests__/tutorial-fixture.ts`:

Replace:
```ts
  {
    id: 'raise',
    where: 'training',
```
with:
```ts
  {
    id: 'board',
    where: 'anvil',
    line: 'Contracts come and go.',
    objective: 'Continue',
    highlight: 'quests.board',
    beat: true,
    trigger: { type: 'ack', count: 1 },
  },
  {
    id: 'raise',
    where: 'training',
```

Append to the end of `packages/client/src/features/delve/tutorial/__tests__/TutorialPanel.test.tsx`:

```tsx

describe("a beat's Continue and the focus", () => {
  let frames: FrameRequestCallback[] = [];
  const nextFrame = () => act(() => frames.splice(0).forEach((f) => f(0)));
  const go = () => screen.getByTestId('tutorial-continue');
  /** The hub at the `board` beat: the Quests tab (open while the board shows), and a menu over it while `menu`. */
  const hub = (board: boolean, menu = false) => (
    <>
      <div data-pad-scope>
        <button role="tab" aria-selected={board} data-tutorial="hub.tab.quests">
          Quests
        </button>
        {board && <div data-tutorial="quests.board">The board</div>}
        {strip('board', { where: SHOWN_AT.anvil, place: 'anvil' })}
      </div>
      {menu && (
        <div data-pad-scope>
          <button>Resume</button>
        </div>
      )}
    </>
  );

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    // jsdom lays nothing out: every element gets a box, so scopes and controls are visible.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('with nothing to point at, takes the focus at once; it is no data-pad-first', () => {
    render(strip('listen'));
    expect(go()).toHaveFocus();
    expect(go()).not.toHaveAttribute('data-pad-first');
  });

  it("waits until the step's highlight is on screen: a way to it is not enough", () => {
    const { rerender } = render(hub(false));
    nextFrame();
    expect(go()).not.toHaveFocus();
    rerender(hub(true));
    nextFrame();
    expect(go()).toHaveFocus();
  });

  it('waits while another scope is topmost, and moves once the strip’s own is', () => {
    const { rerender } = render(hub(true, true));
    nextFrame();
    expect(go()).not.toHaveFocus();
    rerender(hub(true));
    nextFrame();
    expect(go()).toHaveFocus();
  });

  it('takes it once: a focus moved away is left alone', () => {
    render(
      <>
        <button data-testid="other">Other</button>
        {strip('listen')}
      </>,
    );
    expect(go()).toHaveFocus();
    act(() => screen.getByTestId('other').focus());
    nextFrame();
    expect(screen.getByTestId('other')).toHaveFocus();
  });

  it('when the beat ends, gives the focus back to the control it came from', () => {
    render(<button data-testid="other">Other</button>);
    const other = screen.getByTestId('other');
    other.focus();
    const { rerender } = render(strip('listen'));
    expect(go()).toHaveFocus();
    rerender(strip('cast'));
    expect(other).toHaveFocus();
  });

  it('gives nothing back to a control the D-pad cannot reach, or over a focus the player moved', () => {
    render(
      <>
        <span data-pad-skip>
          <button data-testid="skipped">Skipped</button>
        </span>
        <button data-testid="third">Third</button>
      </>,
    );
    screen.getByTestId('skipped').focus();
    const first = render(strip('listen'));
    expect(go()).toHaveFocus();
    first.rerender(strip('cast'));
    expect(screen.getByTestId('skipped')).not.toHaveFocus();
    first.unmount();

    screen.getByTestId('third').focus();
    const second = render(strip('listen'));
    expect(go()).toHaveFocus();
    render(<button data-testid="fourth">Fourth</button>);
    act(() => screen.getByTestId('fourth').focus());
    second.rerender(strip('cast'));
    expect(screen.getByTestId('fourth')).toHaveFocus();
  });
});
```

In `packages/client/src/features/delve/tutorial/__tests__/GuidedChoice.test.tsx`:

Replace:
```tsx
    expect(screen.queryByTestId('guided-choice')).toBeNull();
    fireEvent.click(screen.getByTestId('mana-choice-fire'));
    // Hesta in place of How to delve.
```
with:
```tsx
    expect(screen.queryByTestId('guided-choice')).toBeNull();
    // jsdom lays nothing out: every element gets a box, so the hub is the topmost visible scope.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
    );
    fireEvent.click(screen.getByTestId('mana-choice-fire'));
    // Hesta in place of How to delve.
```

Replace:
```tsx
    // In the hub's own pad scope, focused on Continue.
    expect(panel.closest('[data-pad-scope]')).toBe(screen.getByTestId('hub-anvil'));
    expect(screen.getByTestId('tutorial-continue')).toHaveFocus();
```
with:
```tsx
    // In the hub's own pad scope; a beat with nothing to point at hands Continue the focus.
    expect(panel.closest('[data-pad-scope]')).toBe(screen.getByTestId('hub-anvil'));
    expect(screen.getByTestId('tutorial-continue')).toHaveFocus();
    expect(screen.getByTestId('tutorial-continue')).not.toHaveAttribute('data-pad-first');
```

- [ ] **Step 2: Run them, and see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial)`
Expected: FAIL: "it is no data-pad-first", "waits until the step's highlight…" and "waits while another scope…" (`autoFocus` takes it at once), "gives the focus back…" (nothing does), and `GuidedChoice`'s `data-pad-first` line.

- [ ] **Step 3: The rule**

In `packages/client/src/features/delve/tutorial/TutorialPanel.tsx`:

Replace:
```tsx
import { keyLabel } from '@/features/controls/controls';
import { playSound } from '@/shared/utils/sound-manager';
```
with:
```tsx
import { keyLabel } from '@/features/controls/controls';
import { isCandidate } from '@/features/gamepad/use-gamepad-nav';
import { playSound } from '@/shared/utils/sound-manager';
```

Replace:
```tsx
  reducedMotion,
  usePrompts,
  type Binding,
} from '../kit';
import { bindingOf } from '../arena/hud/SkillDock';
import { getDelveRegistry } from '../registry';
import { stepIn } from './tutorial-view';
```
with:
```tsx
  reducedMotion,
  topScope,
  usePrompts,
  type Binding,
} from '../kit';
import { bindingOf } from '../arena/hud/SkillDock';
import { getDelveRegistry } from '../registry';
import { findMarked } from './marked';
import { stepIn } from './tutorial-view';
```

Replace:
```tsx
 * it always shows. A reading beat has Continue (A on the pad, and Enter in the screen's pad
 * scope), the strip's only D-pad stop; the strip is never a scope of its own, so the screen's
 * tabs, prompts and Menu keep working. When `tutorialSkippable` allows it, "Skip this step" is
```
with:
```tsx
 * it always shows. A reading beat has Continue (A on the pad, and Enter in the screen's pad
 * scope), the strip's only D-pad stop; the strip is never a scope of its own, so the screen's
 * tabs, prompts and Menu keep working. Continue takes the focus once: when the marker has
 * nothing left to lead to (`findMarked` gives nothing, or the step's own `highlight` on screen,
 * not a way to it) and the strip's scope is the topmost; when the beat ends the focus goes back
 * to the control it came from, if the D-pad can still reach it and the player has not moved it
 * since. When `tutorialSkippable` allows it, "Skip this step" is
```

Replace:
```tsx
  const counted = useRef(state.count);
  useEffect(() => {
    if (state.count > counted.current && !reducedMotion())
      counter.current?.animate?.(PULSE, { duration: 200, easing: 'ease-out' });
    counted.current = state.count;
  }, [state.count]);
```
with:
```tsx
  const counted = useRef(state.count);
  useEffect(() => {
    if (state.count > counted.current && !reducedMotion())
      counter.current?.animate?.(PULSE, { duration: 200, easing: 'ease-out' });
    counted.current = state.count;
  }, [state.count]);
  // A beat's Continue takes the focus once, by its rule, and gives it back when the beat ends.
  useEffect(() => {
    if (!beat || !step) return;
    const button = root.current?.querySelector<HTMLElement>('[data-testid="tutorial-continue"]');
    if (!button) return;
    const scope = button.closest<HTMLElement>('[data-pad-scope]') ?? document;
    /** Where the focus was when Continue took it. */
    let before: HTMLElement | null = null;
    let took = false;
    let raf = 0;
    const frame = () => {
      const marked = findMarked(step);
      if (topScope() !== scope || (marked && marked.id !== step.highlight)) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const active = document.activeElement;
      before = active instanceof HTMLElement && active !== document.body ? active : null;
      took = true;
      button.focus({ preventScroll: true });
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      const active = document.activeElement;
      const moved = active !== button && active !== document.body && active !== null;
      if (took && !moved && before?.isConnected && isCandidate(before))
        before.focus({ preventScroll: true });
    };
  }, [beat, step]);
```

Replace:
```tsx
              onClick={() => onEvent({ type: 'ack' })}
              autoFocus
              data-pad-first
              testId="tutorial-continue"
```
with:
```tsx
              onClick={() => onEvent({ type: 'ack' })}
              testId="tutorial-continue"
```

(The kit's `Button` takes no `ref`, so the effect finds Continue by its test id inside the strip.)

- [ ] **Step 4: Run them, and see them pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/tutorial src/pages)`
Expected: no type errors; PASS. (`DelveRun.tutorial`'s beat test clicks Continue without reading the focus; in the dive the strip has no scope of its own, so the document is its scope and the topmost one.)

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/tutorial/TutorialPanel.tsx packages/client/src/features/delve/tutorial/__tests__/TutorialPanel.test.tsx packages/client/src/features/delve/tutorial/__tests__/tutorial-fixture.ts packages/client/src/features/delve/tutorial/__tests__/GuidedChoice.test.tsx
git commit -m "feat(client): a beat's Continue takes the focus by rule, once, and gives it back" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 4: The strip in the dive and at the stop

### Task 6: `HudGrid`'s centre slot, and `hidden`

The grid's loose `children` become one slot in the middle column under the top bar, which stacks the strip over the `BossBar`; `hidden` leaves the grid laid out but not drawn.

**Files:**
- Modify: `packages/client/src/features/delve/arena/hud/HudGrid.tsx`, `BossBar.tsx`, `__tests__/HudGrid.test.tsx`, `packages/client/src/pages/DelveRun.tsx`, `packages/client/src/pages/DelveTraining.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/arena/hud/__tests__/HudGrid.test.tsx`:

Replace:
```tsx
      dock={life && <div data-testid="hero-hp" />}
    >
      <span data-testid="overlay" />
    </HudGrid>
  );

  it('is the zoomed HUD root, laying its children on the grid', () => {
    render(grid(() => {}));
    const root = screen.getByTestId('hud');
    expect(root).toHaveClass('delve-ui', 'delve-hud-zoom', 'pointer-events-none');
    expect(screen.getByTestId('overlay').parentElement).toBe(root);
  });
```
with:
```tsx
      dock={life && <div data-testid="hero-hp" />}
      centre={<span data-testid="overlay" />}
    />
  );

  it('is the zoomed HUD root, with a centre slot under the top bar in the middle column', () => {
    render(grid(() => {}));
    const root = screen.getByTestId('hud');
    expect(root).toHaveClass('delve-ui', 'delve-hud-zoom', 'pointer-events-none');
    const centre = screen.getByTestId('overlay').parentElement!;
    expect(centre).toHaveAttribute('data-hud', 'centre');
    expect(centre.parentElement).toBe(root);
    expect(centre.getAttribute('style')).toContain('grid-column: 2');
  });

  it('hidden (under the stop), it is not drawn but still laid out', () => {
    const { rerender } = render(grid(() => {}));
    const root = screen.getByTestId('hud');
    expect(root).not.toHaveStyle({ visibility: 'hidden' });
    rerender(
      <HudGrid onInsets={() => {}} testId="hud" top={<div />} right={<div />} dock={null} hidden />,
    );
    expect(root).toHaveStyle({ visibility: 'hidden' });
    expect(root).toHaveClass('grid');
  });
```

- [ ] **Step 2: Run them, and see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/HudGrid.test.tsx)`
Expected: FAIL: no `overlay` (the grid ignores `centre`), and no `visibility: hidden`.

- [ ] **Step 3: The slot**

In `packages/client/src/features/delve/arena/hud/HudGrid.tsx`:

Replace:
```tsx
  /** Laid on the grid itself, e.g. the BossBar (3A's addition to the contract). */
  children?: ReactNode;
  /** The right column's width in design px: 340, or the Training Grounds' 400 px dock (3F). */
  rightWidth?: number;
  /** Under a screen (the stop, the pause): no focus or click reaches it. */
  inert?: boolean;
}
```
with:
```tsx
  /** The centre slot, under the top bar in the middle column, stacked: Hesta's strip, then the BossBar. */
  centre?: ReactNode;
  /** The right column's width in design px: 340, or the Training Grounds' 400 px dock (3F). */
  rightWidth?: number;
  /** Under a screen (the stop, the pause): no focus or click reaches it. */
  inert?: boolean;
  /** Under the stop: not drawn, but still laid out, so its insets hold. */
  hidden?: boolean;
}
```

Replace:
```tsx
 * 48 px top bar over columns 1–2, a 340 px right column over both rows, and the 600 px dock at
 * the bottom of columns 1–2, with the middle clear. Only its panels and slots take the pointer.
```
with:
```tsx
 * 48 px top bar over columns 1–2, a 340 px right column over both rows, the 600 px dock at
 * the bottom of columns 1–2, and a centre slot at the top of the middle column, with the rest of
 * the middle clear. Only its panels and slots take the pointer.
```

Replace:
```tsx
  testId,
  children,
  rightWidth = 340,
  inert,
}: HudGridProps) {
```
with:
```tsx
  testId,
  centre,
  rightWidth = 340,
  inert,
  hidden,
}: HudGridProps) {
```

Replace:
```tsx
      style={{ gridTemplateColumns: `380px minmax(0,1fr) ${rightWidth}px` }}
```
with:
```tsx
      style={{
        gridTemplateColumns: `380px minmax(0,1fr) ${rightWidth}px`,
        visibility: hidden ? 'hidden' : undefined,
      }}
```

Replace:
```tsx
        {dock}
      </div>
      {children}
    </div>
```
with:
```tsx
        {dock}
      </div>
      <div
        data-hud="centre"
        className="flex min-w-0 flex-col items-center gap-4"
        style={{ gridColumn: 2, gridRow: 2, alignSelf: 'start' }}
      >
        {centre}
      </div>
    </div>
```

In `packages/client/src/features/delve/arena/hud/BossBar.tsx`:

Replace:
```tsx
/**
 * The boss's name and life, only while a boss lives: a `HudGrid` child, under the top bar and
 * centred in the middle column.
 */
```
with:
```tsx
/**
 * The boss's name and life, only while a boss lives: in `HudGrid`'s centre slot, which lays it
 * under the top bar (and under Hesta's strip), centred in the middle column.
 */
```

Replace:
```tsx
      className="flex w-[420px] flex-col gap-2"
      style={{ gridColumn: 2, gridRow: 2, alignSelf: 'start', justifySelf: 'center' }}
      data-testid="boss-bar"
```
with:
```tsx
      className="flex w-[420px] flex-col gap-2"
      data-testid="boss-bar"
```

In `packages/client/src/pages/DelveRun.tsx`:

Replace:
```tsx
        }
      >
        <BossBar hud={arena.hud} />
      </HudGrid>

      {banners[0] && <Banner key={banners[0].id} banner={banners[0]} onDone={popBanner} />}
```
with:
```tsx
        }
        centre={<BossBar hud={arena.hud} />}
      />

      {banners[0] && <Banner key={banners[0].id} banner={banners[0]} onDone={popBanner} />}
```

In `packages/client/src/pages/DelveTraining.tsx`:

Replace:
```tsx
        }
      >
        <BossBar hud={arena.hud} />
      </HudGrid>

      {menuOpen && (
```
with:
```tsx
        }
        centre={<BossBar hud={arena.hud} />}
      />

      {menuOpen && (
```

- [ ] **Step 4: Run them, and see them pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/arena/hud src/pages)`
Expected: no type errors; PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/arena/hud/HudGrid.tsx packages/client/src/features/delve/arena/hud/BossBar.tsx packages/client/src/features/delve/arena/hud/__tests__/HudGrid.test.tsx packages/client/src/pages/DelveRun.tsx packages/client/src/pages/DelveTraining.tsx
git commit -m "feat(client): the HUD grid gets a centre slot and can be hidden" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: The dive and the stop

In the dive the strip sits in the centre slot and shows floor steps only, the tracked quests give way to it, and the HUD is hidden while the stop is up. The stop renders its own strip in its header row (stop steps only), so one `tutorial-panel` exists at a time and `DelveRun`'s portal into the stop's scope goes.

**Files:**
- Modify: `packages/client/src/features/delve/tutorial/tutorial-view.ts`, `packages/client/src/pages/DelveRun.tsx`, `packages/client/src/features/delve/stop/StopScreen.tsx`, `packages/client/src/pages/__tests__/DelveRun.tutorial.test.tsx`, `packages/client/src/pages/__tests__/DelveRun.test.tsx`, `packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/pages/__tests__/DelveRun.tutorial.test.tsx`:

Replace:
```tsx
  createDelveProfile,
  settleDive,
  startDive,
  tutorialSkippable,
  tutorialText,
  type ArpgWorld,
  type DelveProfile,
  type TutorialEvent,
} from '@alloy/engine';
```
with:
```tsx
  createDelveProfile,
  questStates,
  settleDive,
  startDive,
  tutorialSkippable,
  tutorialText,
  type ArpgWorld,
  type DelveProfile,
  type QuestState,
  type TutorialEvent,
} from '@alloy/engine';
```

Replace:
```tsx
  tutorialText: vi.fn(),
  tutorialSkippable: vi.fn(),
  applyTutorialEvents: vi.fn((_r: unknown, p: DelveProfile) => p),
  retryTutorialDepth: vi.fn((_r: unknown, p: DelveProfile) => p),
```
with:
```tsx
  tutorialText: vi.fn(),
  tutorialSkippable: vi.fn(),
  // The engine's quests are B1's: one tracked quest, for the HUD's tracker.
  questStates: vi.fn(),
  applyTutorialEvents: vi.fn((_r: unknown, p: DelveProfile) => p),
  retryTutorialDepth: vi.fn((_r: unknown, p: DelveProfile) => p),
```

Replace:
```tsx
const registry = getDelveRegistry();
const renderRun = () =>
```
with:
```tsx
const registry = getDelveRegistry();
/** `questStates` as the HUD's tracker reads it: the first quest, tracked. */
const tracked = (): QuestState[] => {
  const first = registry.getQuestsData().quests[0];
  return [
    {
      id: first.id,
      kind: first.kind,
      status: 'active',
      isNew: false,
      tracked: true,
      name: first.name,
      line: first.line,
      objectives: first.objectives.map((o) => ({
        id: o.id,
        text: o.text,
        count: o.count,
        value: 0,
        done: false,
      })),
      rewards: [],
    },
  ];
};
const renderRun = () =>
```

Replace:
```tsx
    vi.mocked(tutorialSkippable).mockReturnValue(false);
    vi.mocked(applyTutorialEvents).mockClear();
    vi.mocked(settleDive).mockClear();
```
with:
```tsx
    vi.mocked(tutorialSkippable).mockReturnValue(false);
    vi.mocked(questStates).mockImplementation(tracked);
    vi.mocked(applyTutorialEvents).mockClear();
    vi.mocked(settleDive).mockClear();
```

Replace:
```tsx
  it("shows the floor's own step above the dock, ahead of the save's", () => {
    guided('walk', 'cast');
    renderRun();
    const panel = screen.getByTestId('tutorial-panel');
    expect(panel.closest('[data-hud="dock"]')).not.toBeNull();
    expect(panel).toHaveTextContent('Cast your Primary.');
    expect(tutorialText).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'cast',
      seen.world,
    );
    expect(seen.paused.at(-1)).toBe(false);
  });
```
with:
```tsx
  it("shows the floor's own step under the top bar, ahead of the save's, in place of the tracked quests", () => {
    guided('walk', 'cast');
    renderRun();
    const panel = screen.getByTestId('tutorial-panel');
    expect(panel.closest('[data-hud="centre"]')).not.toBeNull();
    expect(panel).toHaveAttribute('data-place', 'hud');
    expect(panel).toHaveTextContent('Cast your Primary.');
    expect(tutorialText).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'cast',
      seen.world,
    );
    expect(seen.paused.at(-1)).toBe(false);
    // One goal on screen: the tracker gives way, and is back when no step shows.
    expect(screen.queryByTestId('quest-tracker')).toBeNull();
    act(() => {
      seen.world = null;
      useDelveStore.setState({ profile: { ...useDelveStore.getState().profile } });
    });
    expect(screen.queryByTestId('tutorial-panel')).toBeNull();
    expect(screen.getByTestId('quest-tracker')).toBeInTheDocument();
  });
```

Replace:
```tsx
  it("at a stop the save's step shows over the stop, and its events go to the save", () => {
    guided('equip', null);
    renderRun();
    toStop();
    const panel = screen.getByTestId('tutorial-panel');
    expect(panel).toHaveTextContent('Better weapons carry more skills.');
    // Inside the stop's own pad scope, so the pad reaches it.
    expect(panel.closest('[data-pad-scope]')).toBe(screen.getByTestId('door-choice'));
```
with:
```tsx
  it("at a stop the save's step shows in the stop's own strip, the only one, and its events go to the save", () => {
    guided('equip', null);
    renderRun();
    toStop();
    const panel = screen.getByTestId('tutorial-panel');
    expect(panel).toHaveAttribute('data-place', 'stop');
    expect(panel).toHaveTextContent('Better weapons carry more skills.');
    // Inside the stop's own pad scope, so the pad reaches it.
    expect(panel.closest('[data-pad-scope]')).toBe(screen.getByTestId('door-choice'));
    // The dive's HUD is not drawn under the stop.
    expect(screen.getByTestId('purse-bar').closest('.delve-hud-zoom')).toHaveStyle({
      visibility: 'hidden',
    });
```

In `packages/client/src/pages/__tests__/DelveRun.test.tsx`:

Replace:
```tsx
    const hud = () => screen.getByTestId('purse-bar').closest('.delve-hud-zoom')!;
    expect(hud()).not.toHaveAttribute('inert');
```
with:
```tsx
    const hud = () => screen.getByTestId('purse-bar').closest('.delve-hud-zoom')!;
    expect(hud()).not.toHaveAttribute('inert');
    expect(hud()).not.toHaveStyle({ visibility: 'hidden' });
```

Replace:
```tsx
    const stop = screen.getByTestId('door-choice').parentElement!;
    expect(hud()).toHaveAttribute('inert');
    expect(stop).not.toHaveAttribute('inert');
```
with:
```tsx
    const stop = screen.getByTestId('door-choice').parentElement!;
    expect(hud()).toHaveAttribute('inert');
    // The stop has its own counts, finds and Menu: the HUD is laid out under it, not drawn.
    expect(hud()).toHaveStyle({ visibility: 'hidden' });
    expect(stop).not.toHaveAttribute('inert');
```

In `packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx`:

Replace:
```tsx
    at('d1-3');
    expect(screen.getByTestId('extract-button')).toBeInTheDocument();
  });
});
```
with:
```tsx
    at('d1-3');
    expect(screen.getByTestId('extract-button')).toBeInTheDocument();
  });

  it("a guided stop shows Hesta's strip in the header row, between the title and the counts", () => {
    vi.spyOn(registry, 'getTutorialData').mockReturnValue({
      ...registry.getTutorialData(),
      steps: [
        {
          id: 'take',
          where: 'stop',
          floor: 'd1-1',
          line: 'Hesta speaks.',
          objective: 'Take Equip',
          trigger: { type: 'takeStop', count: 1 },
          stop: { kinds: ['equip'], doors: ['winding'], extract: false },
        },
        {
          id: 'walk',
          where: 'floor',
          floor: 'd1-1',
          line: 'On the floor.',
          objective: 'Walk',
          trigger: { type: 'ack', count: 1 },
        },
      ],
    });
    const on = (step: string) =>
      act(() =>
        store().setProfile({ ...store().profile, tutorial: { step, count: 0, misses: 0 } }),
      );
    atStop(['equip']);
    expect(screen.queryByTestId('tutorial-panel')).toBeNull();
    on('take');
    const strip = screen.getByTestId('tutorial-panel');
    expect(strip).toHaveAttribute('data-place', 'stop');
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent('Take Equip');
    expect(screen.getByTestId('tutorial-line')).toHaveTextContent('Hesta speaks.');
    const title = screen.getByRole('heading', { level: 1 });
    const counts = screen.getByTestId('floor-counts');
    expect(strip.parentElement).toBe(counts.parentElement);
    expect(title.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(counts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A floor's step is the HUD's strip's, never the stop's.
    on('walk');
    expect(screen.queryByTestId('tutorial-panel')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them, and see them fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.tutorial.test.tsx src/pages/__tests__/DelveRun.test.tsx src/features/delve/stop/__tests__/StopScreen.test.tsx)`
Expected: FAIL: the strip is under `[data-hud="dock"]`, the tracker shows beside it, `data-place` at the stop is `stop` but the HUD is not hidden, and `StopScreen` alone renders no strip.

- [ ] **Step 3: `SHOWN_AT.floor` and `SHOWN_AT.stop`**

In `packages/client/src/features/delve/tutorial/tutorial-view.ts`:

Replace:
```ts
/** Where each screen shows Hesta's panel: the dive its floors and stops, the Anvil its lessons and the Training step, the Training Grounds theirs. */
export const SHOWN_AT = {
  dive: ['floor', 'stop'],
```
with:
```ts
/**
 * Where each screen shows Hesta's strip: the dive its floors and stops (its HUD's strip the
 * floors', the stop's own strip the stops'), the Anvil its lessons and the Training step, the
 * Training Grounds theirs.
 */
export const SHOWN_AT = {
  dive: ['floor', 'stop'],
  floor: ['floor'],
  stop: ['stop'],
```

- [ ] **Step 4: The stop's strip**

In `packages/client/src/features/delve/stop/StopScreen.tsx`:

Replace:
```tsx
import { baseDisplayName, isBossDepth, type DiveState, type Haul } from '@alloy/engine';
import { useControlsStore } from '@/stores/controlsStore';
```
with:
```tsx
import {
  baseDisplayName,
  isBossDepth,
  type DiveState,
  type Haul,
  type TutorialEvent,
} from '@alloy/engine';
import { useControlsStore } from '@/stores/controlsStore';
import { useDelveStore } from '@/stores/delveStore';
```

Replace:
```tsx
import { StopPanel } from '../StopPanel';
import { DoorPane } from './DoorPane';
```
with:
```tsx
import { StopPanel } from '../StopPanel';
import { TutorialPanel } from '../tutorial/TutorialPanel';
import { SHOWN_AT } from '../tutorial/tutorial-view';
import { DoorPane } from './DoorPane';

/** A stop step's "Skip this step" (a stop has no beats): to the save. */
const sendTutorial = (event: TutorialEvent): void =>
  useDelveStore.getState().tutorialEvents([event]);
```

Replace:
```tsx
 * it. Its Menu is no `[data-pad-menu]`, so Enter with nothing focused never opens the pause.
 */
```
with:
```tsx
 * it. Its Menu is no `[data-pad-menu]`, so Enter with nothing focused never opens the pause.
 * On a guided stop Hesta's strip sits in the header row, between the title and the counts.
 */
```

Replace:
```tsx
  const menuKey = useControlsStore((s) => s.config.keys.menu);
```
with:
```tsx
  const menuKey = useControlsStore((s) => s.config.keys.menu);
  const tutorial = useDelveStore((s) => s.profile.tutorial);
```

Replace:
```tsx
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-[6px]">
```
with:
```tsx
        <div className="flex items-end justify-between gap-6">
          <div className="flex flex-none flex-col gap-[6px]">
```

Replace:
```tsx
          <div className="flex gap-9 text-[16px] text-[var(--k-text-3)]" data-testid="floor-counts">
```
with:
```tsx
          {/* Hesta's strip: a stop's steps only (it gives way when the row is short). */}
          {tutorial && (
            <TutorialPanel
              state={tutorial}
              where={SHOWN_AT.stop}
              place="stop"
              onEvent={sendTutorial}
            />
          )}
          <div
            className="flex flex-none gap-9 text-[16px] text-[var(--k-text-3)]"
            data-testid="floor-counts"
          >
```

- [ ] **Step 5: The dive**

In `packages/client/src/pages/DelveRun.tsx`:

Replace:
```tsx
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
```
with:
```tsx
import { useNavigate } from 'react-router';
```

Replace:
```tsx
  /** The stop's own pad scope (its screen), which Hesta's panel joins so the pad reaches it. */
  const stopRef = useRef<HTMLDivElement>(null);
  const [stopScope, setStopScope] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const screen = stopRef.current?.querySelector<HTMLElement>('[data-pad-scope]');
    setStopScope(choosing && !finished ? (screen ?? null) : null);
  }, [choosing, finished]);
  const manualAttack = useDelveStore((s) => s.manualAttack);
```
with:
```tsx
  // Hesta's strip in the HUD: a floor's steps only (the stop shows its own), never under the retry screen.
  const guidedFloor = !fallen && !!stepIn(registry, tutorial, SHOWN_AT.floor);
  const manualAttack = useDelveStore((s) => s.manualAttack);
```

Replace:
```tsx
        inert={!!pause || choosing || asking || fallen}
        top={<PurseBar dive={dive} onMenu={openMenu} onJournal={openJournal} />}
```
with:
```tsx
        inert={!!pause || choosing || asking || fallen}
        hidden={choosing && !finished}
        top={<PurseBar dive={dive} onMenu={openMenu} onJournal={openJournal} />}
```

Replace:
```tsx
            hud={arena.hud}
            quests={quests}
            onInspect={openItem}
```
with:
```tsx
            hud={arena.hud}
            // One goal on screen: the tracked quests give way to a guided step.
            quests={guidedFloor ? [] : quests}
            onInspect={openItem}
```

Replace:
```tsx
          !finished && (
            <>
              {/* Hesta's panel, above the dock (see the tutorial spec). */}
              {tutorial && !fallen && (
                <div className="mb-4">
                  <TutorialPanel
                    state={tutorial}
                    where={SHOWN_AT.dive}
                    world={world}
                    place="hud"
                    onEvent={onTutorial}
                  />
                </div>
              )}
              <SkillDock
                hud={arena.hud}
                world={arena.worldRef}
                onCast={arena.cast}
                onDodge={arena.dodge}
                onPotion={arena.potion}
                onAttack={tapAttack}
                manualAttack={manualAttack}
              />
            </>
          )
        }
        centre={<BossBar hud={arena.hud} />}
      />
```
with:
```tsx
          !finished && (
            <SkillDock
              hud={arena.hud}
              world={arena.worldRef}
              onCast={arena.cast}
              onDodge={arena.dodge}
              onPotion={arena.potion}
              onAttack={tapAttack}
              manualAttack={manualAttack}
            />
          )
        }
        centre={
          <>
            {/* Hesta's strip, under the top bar and over the boss's bar. */}
            {tutorial && guidedFloor && (
              <TutorialPanel
                state={tutorial}
                where={SHOWN_AT.floor}
                world={world}
                place="hud"
                onEvent={onTutorial}
              />
            )}
            <BossBar hud={arena.hud} />
          </>
        }
      />
```

Replace:
```tsx
        <div ref={stopRef} className="absolute inset-0 z-40" inert={!!pause}>
```
with:
```tsx
        <div className="absolute inset-0 z-40" inert={!!pause}>
```

Replace:
```tsx
            onInspect={openItem}
          />
          {/* Hesta's panel, in the stop's screen: top centre, between its title and its counts. */}
          {tutorial &&
            stopScope &&
            createPortal(
              <div className="absolute left-1/2 top-2 z-10 w-[560px] -translate-x-1/2">
                <TutorialPanel
                  state={tutorial}
                  where={SHOWN_AT.dive}
                  place="stop"
                  onEvent={onTutorial}
                />
              </div>,
              stopScope,
            )}
        </div>
```
with:
```tsx
            onInspect={openItem}
          />
        </div>
```

(`useLayoutEffect`, `useRef` and `useState` stay imported: the page still uses each.)

- [ ] **Step 6: Run them, and see them pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/pages src/features/delve/stop src/features/delve/tutorial)`
Expected: no type errors; PASS.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/tutorial/tutorial-view.ts packages/client/src/pages/DelveRun.tsx packages/client/src/features/delve/stop/StopScreen.tsx packages/client/src/pages/__tests__/DelveRun.tutorial.test.tsx packages/client/src/pages/__tests__/DelveRun.test.tsx packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx
git commit -m "feat(client): the strip under the dive's top bar and in the stop's header; no HUD under the stop" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 5: The strip in the Training Grounds and at the Anvil; the menu's skip

### Task 8: The Training Grounds

**Files:**
- Modify: `packages/client/src/pages/DelveTraining.tsx`, `packages/client/src/pages/__tests__/DelveTraining.tutorial.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/pages/__tests__/DelveTraining.tutorial.test.tsx`:

Replace:
```tsx
  it("on the Training step, opens on the hero's own build with Hesta's panel under the dock", () => {
    onStep('raise');
    const load = vi.spyOn(useSandboxStore.getState(), 'loadMyBuild');
    renderPage();
    expect(load).toHaveBeenCalledWith(useDelveStore.getState().profile);
    const panel = screen.getByTestId('tutorial-panel');
    const right = panel.closest('[data-hud="right"]')!;
    expect(right).not.toBeNull();
    expect(
      screen.getByTestId('training-panel').compareDocumentPosition(panel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(panel).toHaveTextContent('Raise your Defensive.');
    expect(live.paused.at(-1)).toBe(false);
    // With the dock closed, the panel still stands at the column's foot.
    fireEvent.click(screen.getByTestId('training-panel-toggle'));
```
with:
```tsx
  it("on the Training step, opens on the hero's own build with Hesta's strip under the top bar", () => {
    onStep('raise');
    const load = vi.spyOn(useSandboxStore.getState(), 'loadMyBuild');
    renderPage();
    expect(load).toHaveBeenCalledWith(useDelveStore.getState().profile);
    const panel = screen.getByTestId('tutorial-panel');
    expect(panel.closest('[data-hud="centre"]')).not.toBeNull();
    expect(panel.closest('[data-hud="right"]')).toBeNull();
    expect(panel).toHaveAttribute('data-place', 'hud');
    expect(panel).toHaveTextContent('Raise your Defensive.');
    expect(live.paused.at(-1)).toBe(false);
    // With the dock closed, the strip stays.
    fireEvent.click(screen.getByTestId('training-panel-toggle'));
```

- [ ] **Step 2: Run it, and see it fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveTraining.tutorial.test.tsx)`
Expected: FAIL: the strip is under `[data-hud="right"]`.

- [ ] **Step 3: The strip in the centre slot**

In `packages/client/src/pages/DelveTraining.tsx`:

Replace:
```tsx
 * Training step it opens on the hero's own build, with Hesta's panel at the
 * bottom of the right column (see the tutorial spec).
```
with:
```tsx
 * Training step it opens on the hero's own build, with Hesta's strip under the
 * top bar (see the tutorial spec).
```

Replace:
```tsx
            {/* Hesta's panel, docked bottom right (see the tutorial spec). */}
            {tutorial && tutorialStep && (
              <div className="mt-auto">
                <TutorialPanel
                  state={tutorial}
                  where={SHOWN_AT.training}
                  place="hud"
                  onEvent={(e) => useDelveStore.getState().tutorialEvents([e])}
                />
              </div>
            )}
          </>
        }
```
with:
```tsx
          </>
        }
```

Replace:
```tsx
        centre={<BossBar hud={arena.hud} />}
      />

      {menuOpen && (
```
with:
```tsx
        centre={
          <>
            {/* Hesta's strip, under the top bar and over the boss's bar. */}
            {tutorial && tutorialStep && (
              <TutorialPanel
                state={tutorial}
                where={SHOWN_AT.training}
                place="hud"
                onEvent={(e) => useDelveStore.getState().tutorialEvents([e])}
              />
            )}
            <BossBar hud={arena.hud} />
          </>
        }
      />

      {menuOpen && (
```

- [ ] **Step 4: Run it, and see it pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/pages)`
Expected: no type errors; PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/pages/DelveTraining.tsx packages/client/src/pages/__tests__/DelveTraining.tutorial.test.tsx
git commit -m "feat(client): the Training Grounds show Hesta's strip under the top bar" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: The Anvil's row

A full-width row between the header band and the tab's panes; the bottom-right panel goes.

**Files:**
- Modify: `packages/client/src/features/delve/hub/AnvilHub.tsx`, `packages/client/src/features/delve/tutorial/__tests__/GuidedChoice.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/tutorial/__tests__/GuidedChoice.test.tsx`:

Replace:
```tsx
    // In the hub's own pad scope; a beat with nothing to point at hands Continue the focus.
    expect(panel.closest('[data-pad-scope]')).toBe(screen.getByTestId('hub-anvil'));
```
with:
```tsx
    // One row above the tab's panes, in the screen's main.
    expect(panel).toHaveAttribute('data-place', 'anvil');
    expect(panel.closest('[data-screen-section]')).toHaveAttribute(
      'data-screen-section',
      'screen-main',
    );
    expect(
      panel.compareDocumentPosition(screen.getByTestId('paper-doll')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // In the hub's own pad scope; a beat with nothing to point at hands Continue the focus.
    expect(panel.closest('[data-pad-scope]')).toBe(screen.getByTestId('hub-anvil'));
```

- [ ] **Step 2: Run it, and see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial/__tests__/GuidedChoice.test.tsx)`
Expected: FAIL: the strip follows the paper doll (it is still under the tab's view).

- [ ] **Step 3: The row**

In `packages/client/src/features/delve/hub/AnvilHub.tsx`:

Replace:
```tsx
        <div ref={mainRef} className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1">{hub.view}</div>
          {/* Hesta's lesson, docked bottom right under the tab, so it covers none of it; she
              speaks once the mana is chosen. */}
          {profile.tutorial &&
            profile.pair.primary !== null &&
            stepIn(getDelveRegistry(), profile.tutorial, SHOWN_AT.anvil) && (
              <div className="flex justify-end px-8 pb-4">
                <div className="w-[640px]">
                  <TutorialPanel
                    state={profile.tutorial}
                    where={SHOWN_AT.anvil}
                    place="anvil"
                    onEvent={(e) => useDelveStore.getState().tutorialEvents([e])}
                  />
                </div>
              </div>
            )}
        </div>
```
with:
```tsx
        <div ref={mainRef} className="flex h-full min-h-0 flex-col">
          {/* Hesta's strip, a row between the band and the tab's panes, which give up that row
              and nothing else; she speaks once the mana is chosen. */}
          {profile.tutorial &&
            profile.pair.primary !== null &&
            stepIn(getDelveRegistry(), profile.tutorial, SHOWN_AT.anvil) && (
              <div className="flex-none px-8 pt-4">
                <TutorialPanel
                  state={profile.tutorial}
                  where={SHOWN_AT.anvil}
                  place="anvil"
                  onEvent={(e) => useDelveStore.getState().tutorialEvents([e])}
                />
              </div>
            )}
          <div className="min-h-0 flex-1">{hub.view}</div>
        </div>
```

- [ ] **Step 4: Run it, and see it pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/tutorial src/features/delve/hub)`
Expected: no type errors; PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/hub/AnvilHub.tsx packages/client/src/features/delve/tutorial/__tests__/GuidedChoice.test.tsx
git commit -m "feat(client): the Anvil shows Hesta's strip as a row under its band" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 10: "Skip this step" in the system menu

The pad's way to it at the Anvil and in the Training Grounds, as the pause's `pause-skip-step` is in a dive.

**Files:**
- Modify: `packages/client/src/features/delve/hub/SystemMenu.tsx`, `packages/client/src/features/delve/hub/__tests__/SystemMenu.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/hub/__tests__/SystemMenu.test.tsx`:

Replace:
```tsx
import { skipTutorial, type DelveProfile } from '@alloy/engine';
```
with:
```tsx
import {
  applyTutorialEvents,
  skipTutorial,
  tutorialSkippable,
  type DelveProfile,
} from '@alloy/engine';
```

Replace:
```tsx
  skipTutorial: vi.fn((p: DelveProfile) => ({ ...p, tutorial: null })),
}));
```
with:
```tsx
  skipTutorial: vi.fn((p: DelveProfile) => ({ ...p, tutorial: null })),
  // The skip rule and the runner are B1's too: each test says whether the step may be skipped.
  tutorialSkippable: vi.fn(),
  applyTutorialEvents: vi.fn((_r: unknown, p: DelveProfile) => p),
}));
```

Replace:
```tsx
    mockNavigate.mockReset();
    useDelveStore.getState().resetProfile(1234, 'fire');
  });
```
with:
```tsx
    mockNavigate.mockReset();
    vi.mocked(tutorialSkippable).mockReturnValue(false);
    vi.mocked(applyTutorialEvents).mockClear();
    useDelveStore.getState().resetProfile(1234, 'fire');
  });
```

Replace:
```tsx
  it('an ordinary save has no Skip tutorial', () => {
    renderMenu();
    expect(screen.queryByTestId('menu-skip-tutorial')).toBeNull();
  });
```
with:
```tsx
  it('an ordinary save has no Skip tutorial', () => {
    renderMenu();
    expect(screen.queryByTestId('menu-skip-tutorial')).toBeNull();
  });

  it('Skip this step shows only while the engine allows it, for an Anvil or Training step, and skips through the save', () => {
    const on = (step: string) =>
      act(() => {
        const s = useDelveStore.getState();
        s.setProfile({ ...s.profile, tutorial: { step, count: 0, misses: 0 } });
      });
    on('l1-forge');
    const onClose = vi.fn();
    renderMenu({ onClose });
    expect(screen.queryByTestId('menu-skip-step')).toBeNull();
    vi.mocked(tutorialSkippable).mockReturnValue(true);
    // A floor's step is the dive's to skip (the pause), never this menu's.
    on('d1-rats');
    expect(screen.queryByTestId('menu-skip-step')).toBeNull();
    on('l1-forge');
    fireEvent.click(screen.getByTestId('menu-skip-step'));
    expect(applyTutorialEvents).toHaveBeenCalledWith(expect.anything(), expect.anything(), [
      { type: 'skipStep' },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
```

(`l1-forge` and `d1-rats` are real steps of `tutorial.json`: an Anvil step and a floor step.)

- [ ] **Step 2: Run it, and see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/SystemMenu.test.tsx)`
Expected: FAIL: no `menu-skip-step`.

- [ ] **Step 3: The entry**

In `packages/client/src/features/delve/hub/SystemMenu.tsx`:

Replace:
```tsx
import { unsocketMode } from '@alloy/engine';
```
with:
```tsx
import { tutorialSkippable, unsocketMode } from '@alloy/engine';
```

Replace:
```tsx
import { SkipTutorialConfirm } from '../tutorial/SkipTutorial';
```
with:
```tsx
import { SkipTutorialConfirm } from '../tutorial/SkipTutorial';
import { SHOWN_AT, stepIn } from '../tutorial/tutorial-view';
```

Replace:
```tsx
 * The one Esc / B menu: Resume, Controls, Settings, any `extra` entries, Skip
 * tutorial while the guided start runs, and Title screen, plus Restart and the
 * pull rule in dev builds. Controls, Settings and Skip tutorial's confirm open
 * in its place, and their Back returns to it.
```
with:
```tsx
 * The one Esc / B menu: Resume, Controls, Settings, any `extra` entries, Skip
 * this step (while the engine allows it for an Anvil or Training step: the
 * pad's way to it, as the pause has it in a dive) and Skip tutorial while the
 * guided start runs, and Title screen, plus Restart and the pull rule in dev
 * builds. Controls, Settings and Skip tutorial's confirm open in its place,
 * and their Back returns to it.
```

Replace:
```tsx
  const guided = useDelveStore((s) => s.profile.tutorial !== null);
```
with:
```tsx
  const profile = useDelveStore((s) => s.profile);
  const guided = profile.tutorial !== null;
  const skippable =
    !!profile.tutorial &&
    !!stepIn(getDelveRegistry(), profile.tutorial, SHOWN_AT.anvil) &&
    tutorialSkippable(getDelveRegistry(), profile, profile.tutorial);
```

Replace:
```tsx
        {guided && (
          <Button onClick={() => setView('skip')} testId="menu-skip-tutorial">
```
with:
```tsx
        {skippable && (
          <Button
            onClick={() => {
              useDelveStore.getState().tutorialEvents([{ type: 'skipStep' }]);
              onClose();
            }}
            testId="menu-skip-step"
          >
            Skip this step
          </Button>
        )}
        {guided && (
          <Button onClick={() => setView('skip')} testId="menu-skip-tutorial">
```

- [ ] **Step 4: Run it, and see it pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; every client test passes (the baseline's count plus this plan's new tests).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/src/features/delve/hub/SystemMenu.tsx packages/client/src/features/delve/hub/__tests__/SystemMenu.test.tsx
git commit -m "feat(client): the system menu offers Skip this step while the engine allows it" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 6: End to end

### Task 11: TU01 sees one strip, no HUD under the stop, and a pad through a beat

**Files:**
- Create: `packages/client/e2e/fixtures/pad.ts`
- Modify: `packages/client/e2e/delve-tutorial.spec.ts`

There is no failing-first run here: the assertions are added to a test that takes minutes, so run it once, after the edits.

- [ ] **Step 1: The fake pad, and the steps the strip shows**

Create `packages/client/e2e/fixtures/pad.ts` (the helpers `delve-gamepad.spec.ts` keeps for itself, shared; that spec is left as it is). If plan 01 already made this file, keep its exports and add only what is missing here.

```ts
import type { Page } from '@playwright/test';

/**
 * A fake standard-mapping pad for E2E: Playwright has no real gamepad, so `navigator.getGamepads`
 * returns `window.__pad`, which the test presses by hand.
 */

/** The standard mapping's button indices. */
export const BUTTON = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  view: 8,
  menu: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

/** Install the pad on every page load (an init script; nothing else). It rests until pressed, so it claims no input lock. */
export async function installPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __pad: unknown };
    w.__pad = {
      connected: true,
      mapping: 'standard',
      index: 0,
      id: 'Fake Xbox controller',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      vibrationActuator: null,
    };
    navigator.getGamepads = () => [w.__pad as Gamepad];
  });
}

/** Wait for the page to draw `n` frames (the controller is read once per frame). */
export async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const step = (left: number) =>
          left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
        step(count);
      }),
    n,
  );
}

/**
 * Press and release within the page, across one frame, so the controller sees exactly one press
 * (a longer hold can trigger the D-pad's repeat when frames are slow under load).
 */
export async function tap(page: Page, button: number): Promise<void> {
  await page.evaluate(
    (i) =>
      new Promise<void>((resolve) => {
        const pad = (
          window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }
        ).__pad;
        pad.buttons[i] = { pressed: true, value: 1 };
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            pad.buttons[i] = { pressed: false, value: 0 };
            resolve();
          }),
        );
      }),
    button,
  );
  await frames(page, 2);
}
```

In `packages/client/e2e/delve-tutorial.spec.ts`:

Replace:
```ts
/** A fresh save (no profile at all), the bot playing the arena if `bot`. */
async function fresh(page: Page, bot: boolean): Promise<void> {
  await page.addInitScript((autopilot) => {
    // Every objective Hesta's panel shows, in order (a step can pass between two polls).
    const seen: string[] = [];
    (window as unknown as { __objectives: string[] }).__objectives = seen;
    new MutationObserver(() => {
      const text = document.querySelector('[data-testid="tutorial-objective"]')?.textContent;
      if (text && seen[seen.length - 1] !== text) seen.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
    if (sessionStorage.getItem('delve-e2e')) return;
```
with:
```ts
/**
 * A fresh save (no profile at all), the bot playing the arena if `bot`, with a resting fake pad
 * (`installPad`): it claims nothing until `tap`.
 */
async function fresh(page: Page, bot: boolean): Promise<void> {
  await installPad(page);
  await page.addInitScript((autopilot) => {
    // Every step Hesta's strip shows, in order (a step can pass between two polls): its
    // `data-step`, the step itself, never the finished objective the strip holds for a moment.
    const seen: string[] = [];
    (window as unknown as { __steps: string[] }).__steps = seen;
    new MutationObserver(() => {
      const id = document
        .querySelector('[data-testid="tutorial-panel"]')
        ?.getAttribute('data-step');
      if (id && seen[seen.length - 1] !== id) seen.push(id);
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-step'],
    });
    if (sessionStorage.getItem('delve-e2e')) return;
```

Replace:
```ts
const objectives = (page: Page) =>
  page.evaluate(() => (window as unknown as { __objectives: string[] }).__objectives);
```
with:
```ts
const steps = (page: Page) =>
  page.evaluate(() => (window as unknown as { __steps: string[] }).__steps);
```

Replace:
```ts
import { ARENA_READY, SAVE_KEY } from './fixtures/delve';
```
with:
```ts
import { ARENA_READY, SAVE_KEY } from './fixtures/delve';
import { BUTTON, installPad, tap } from './fixtures/pad';
```

- [ ] **Step 2: One strip at the Anvil and in the dive**

Replace:
```ts
    await expect(panel.getByTestId('tutorial-line')).toContainText('new hand');
    await expect(highlight).toBeVisible();
    expect(await step(page)).toBe('begin');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });
```
with:
```ts
    await expect(panel.getByTestId('tutorial-line')).toContainText('new hand');
    // One objective strip: at the Anvil, the row under the header band.
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveAttribute('data-place', 'anvil');
    await expect(highlight).toBeVisible();
    expect(await step(page)).toBe('begin');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });
    // In the dive, the one under the top bar.
    await expect(panel).toHaveAttribute('data-place', 'hud', { timeout: ARENA_READY });
    await expect(panel).toHaveCount(1);
```

- [ ] **Step 3: The stop: its own strip, no HUD under it; the steps by id**

Replace:
```ts
        const seen = await objectives(page);
        expect(seen.some((t) => t.startsWith('Take the exit'))).toBe(true);
        if (stops === 1) {
          expect(seen.findIndex((t) => t === 'Pick up the weapon')).toBeLessThan(
            seen.findIndex((t) => t.startsWith('Take the exit')),
          );
          // Stop 1: Equip is required; the roads wait for it.
          expect(await step(page)).toBe('s1-equip');
```
with:
```ts
        const seen = await steps(page);
        expect(seen.some((id) => id.startsWith('d1-exit'))).toBe(true);
        if (stops === 1) {
          expect(seen.indexOf('d1-weapon')).toBeLessThan(seen.indexOf('d1-exit'));
          // Stop 1: Equip is required; the roads wait for it.
          expect(await step(page)).toBe('s1-equip');
          // One strip, the stop's own, in its header row; the dive's HUD is not drawn under it.
          await expect(panel).toHaveCount(1);
          await expect(door.getByTestId('tutorial-panel')).toHaveAttribute('data-place', 'stop');
          await expect(page.getByTestId('purse-bar')).toBeHidden();
```

- [ ] **Step 4: A pad pass through the first beat**

Replace:
```ts
        beats++;
        await expect(highlight).toBeVisible();
        await page.getByTestId('tutorial-continue').click();
```
with:
```ts
        beats++;
        await expect(highlight).toBeVisible();
        const go = page.getByTestId('tutorial-continue');
        if (beats === 1) {
          // By the pad: Continue has the focus (the highlight is on screen), and A presses it.
          await expect(go).toBeFocused();
          await tap(page, BUTTON.a);
          await expect(go).toBeHidden();
        } else await go.click();
```

- [ ] **Step 5: Run it at both sizes**

Run: `(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts --project=desktop)`
Then: `(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts --project=desktop-1080)`
Expected: TU01 and TU02 pass in each. (If Playwright says port 5199 is in use, see the overview.)

If TU01 fails at `await expect(go).toBeFocused()`, the first beat (`d1-mana`) had its highlight (`hud.vitals`) off screen or another pad scope open: gather the facts before changing anything (in the failing trace, the marker's `data-target` and `document.querySelectorAll('[data-pad-scope]')` at that moment).

- [ ] **Step 6: The whole client, once more**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Then: `(cd packages/client && npx playwright test e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts e2e/delve.spec.ts --project=desktop)`
Expected: no type errors; every unit test passes; the three specs pass (they walk the dive's HUD, the stop and the Training Grounds, whose layout this plan touched).

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
git add packages/client/e2e/fixtures/pad.ts packages/client/e2e/delve-tutorial.spec.ts
git commit -m "test(client): TU01 sees one objective strip a screen, no HUD under the stop, and a pad through a beat" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## For the plans after this one

- **03 (trails):** `marked.ts` exports exactly `WAY_TO`, `findTarget`, `Marked`, `findWay`, `findMarked`; replace their bodies freely and extend `__tests__/marked.test.tsx`. The marker calls `findMarked(step)` every frame for the save's current step (`useTutorialStep`), writes `marked.id` to `data-target` on `[data-testid="tutorial-highlight"]`, and moves the pad's focus to the first D-pad candidate that is the marked element or inside it, once per `` `${step.id}:${marked.id}` `` and pad scope it is found in (so a picker carrying its field's target takes the focus when it opens). `e2e/fixtures/pad.ts` exports `BUTTON`, `installPad(page)`, `frames(page, n)` and `tap(page, button)`; TU01's `fresh()` installs the pad. The strip's Continue also calls `findMarked` (with the strip's own step, the floor's in a dive) and waits while it returns anything but null or the step's own `highlight`: for a beat with a trail, return the trail's entry until the trail is done. The strip's `data-step` is the current step's id.
- **04 (close), for `CLAUDE.md`:** `TutorialPanel` is the objective strip (`place`: the HUD grid's centre slot in the dive and the Training Grounds, the stop's header row, a row above the Anvil's panes; `LINE_MS`, `STEP_HOLD_MS`; Continue's focus rule; "Skip this step" from the Menu, `menu-skip-step` in `SystemMenu`); `TutorialHighlight` is the marker (`marked.ts`, `data-target`, the focus once per marked target); `HudGrid` has `centre` and `hidden`; `SHOWN_AT.floor` / `.stop`; the quest tracker gives way to a guided floor step.
