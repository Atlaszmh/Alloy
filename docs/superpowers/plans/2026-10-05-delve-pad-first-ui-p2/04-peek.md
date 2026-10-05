# The peek Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a new bindable action, `peek` (D-pad up on the pad, M on the keys, rebindable in the Controls editor), whose press toggles an overlay of the large map and, under the lean HUD, the purse with this dive's gains and the floor's finds. The fight keeps running under it, and it never takes the pointer.

**Architecture:** `peek` joins `CONTROL_ACTIONS`; the pad's frame and the keys press the topmost scope's `[data-pad-peek]` (`pressPeek`), exactly as View and J press `[data-pad-journal]`. That target is a small Map button in the HUD (the lean corner's, or the full purse bar's), whose click toggles `DelveRun`'s `peek` state; the Training Grounds have no such button, so the action does nothing there. The overlay (`PeekOverlay`) reuses the `Minimap` (at a large size), `PurseBar` (without its buttons) and `FoundLog`, under a root that is `inert` and lets every pointer event through. A pause closes it.

**Tech Stack:** React 19, Zustand, Vitest (jsdom), Playwright.

Read `00-overview.md` first. Spec: section 3, "The peek", with the overview's edit 6. Plans 01 to 03 are done.

**Checked against the code:**
- *Saved controls still load.* `parseControls` fills an action missing from a saved setup through `withDefaults`: its default (`'up'`, `'KeyM'`), unless the saved setup already uses that default for another action, when it starts unbound and the Controls editor flags it ("Not bound: Peek…"). A setup saved before this phase has no `peek` key, so it gains D-pad up and M unless the player put something there. No version bump: `ControlsConfig.version` stays 1.
- *D-pad up is free in the fight.* `padToArena` maps no action to `'up'` in `DEFAULT_CONTROLS` (the D-pad's only fight binding is `potion: 'down'`), the left stick alone moves (`readPad`'s `left` is the axes), and while the arena is live `gamepad-hub.ts` sends every press to the arena, never to the menu navigation. Outside the fight the D-pad keeps moving the focus: the peek is the fight's only.
- *M is free in the defaults.* The keys bind Q, E, R, Space, F, C, Escape, Left Alt, J and W/A/S/D.

---

### Task 1: the `peek` action

**Files:**
- Modify: `packages/client/src/features/controls/controls.ts`
- Test: `packages/client/src/features/controls/__tests__/controls.test.ts`, `packages/client/src/features/controls/__tests__/ControlsPanel.test.tsx`

- [ ] **Step 1: Write the failing tests** (in `controls.test.ts`, beside the `interact` describe)

```ts
describe('peek', () => {
  it('is D-pad up and M, labelled for the editor', () => {
    expect([DEFAULT_CONTROLS.pad.peek, DEFAULT_CONTROLS.keys.peek]).toEqual(['up', 'KeyM']);
    expect(ACTION_LABELS.peek).toBe('Peek: map, purse and finds');
  });

  it('a setup saved before it gains it, unless that setup already uses D-pad up or M: then unbound', () => {
    const { peek: _p, ...pad } = DEFAULT_CONTROLS.pad;
    const { peek: _k, ...keys } = DEFAULT_CONTROLS.keys;
    expect(parseControls({ ...DEFAULT_CONTROLS, pad, keys })).toEqual(DEFAULT_CONTROLS);
    const taken = parseControls({
      ...DEFAULT_CONTROLS,
      pad: { ...pad, potion: 'up' },
      keys: { ...keys, interact: 'KeyM' },
    });
    expect([taken.pad.peek, taken.keys.peek]).toEqual([null, null]);
  });
});
```

  (import `ACTION_LABELS` if the file lacks it). In `ControlsPanel.test.tsx`, add to an existing render test (or a new one with the file's set-up): `expect(screen.getByTestId('bind-pad-peek')).toHaveTextContent('D-pad ▲'); expect(screen.getByTestId('bind-key-peek')).toHaveTextContent('M');`.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/controls)`
Expected: FAIL, `peek` is undefined.

- [ ] **Step 3: Implement.** In `controls.ts`: `'peek'` at the end of `CONTROL_ACTIONS`; `DEFAULT_CONTROLS.pad.peek: 'up'` (with a comment: "The fight's map, purse and finds (the pad-first spec, 3): the D-pad is free in the fight but for the potion.") and `keys.peek: 'KeyM'`; `ACTION_LABELS.peek: 'Peek: map, purse and finds'`. The file's head comment is unchanged; `ControlsPanel` lists the new row on its own (it walks `CONTROL_ACTIONS`).

- [ ] **Step 4: Run them to see them pass, then the suite's types**

Run: `(cd packages/client && npx vitest run src/features/controls && npx tsc --noEmit -p .)`
Expected: PASS; `tsc` may now fail where a `Record<ControlAction, …>` literal lists every action (a test's fixture, a gallery): add `peek` there with the default. List each in the commit body.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src
git commit -m "feat(client): a bindable peek action, D-pad up and M by default; a saved setup gains it unless it uses either"
```

---

### Task 2: the pad and the keys press the peek

**Files:**
- Modify: `packages/client/src/features/gamepad/arena-pad.ts` (`ArenaPadActions.peek`)
- Modify: `packages/client/src/features/delve/arena/input.ts` (`pressPeek`, the keys)
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts` (the pad's frame)
- Test: `packages/client/src/features/delve/__tests__/arena-input.test.ts`, `packages/client/src/features/gamepad/__tests__/gamepad.test.ts`

- [ ] **Step 1: Write the failing tests.** In `arena-input.test.ts`, import `pressPeek` beside `pressJournal`, add `peek: false` to the `pad()` helper of the `frameInput` describe (it builds a whole `ArenaPadActions`), and in the "loot labels and the journal" describe:

```ts
  it("M and the pad's D-pad up press the topmost scope's Map (the peek), only while the fight is live", () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const map = document.body.appendChild(document.createElement('button'));
    map.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 });
    map.setAttribute('data-pad-peek', '');
    let peeks = 0;
    map.addEventListener('click', () => peeks++);
    key('keydown', 'KeyM');
    expect(peeks).toBe(1);
    pressPeek(); // useArenaCore's padFrame, on the pad's D-pad up
    expect(peeks).toBe(2);
    detach();
    detach = attachKeyboard(createArenaInput(), () => false); // paused
    key('keydown', 'KeyM');
    expect(peeks).toBe(2);
  });
```

  and in "the pad reports L3 held as labels and a View press as the journal" (rename it "…, a View press as the journal and D-pad up as the peek"):

```ts
    expect(padToArena(state('up'), new Set(['up']))).toMatchObject({ peek: true, potion: false });
    expect(padToArena(state('down'), new Set(['down']))).toMatchObject({ peek: false, potion: true });
```

  In `gamepad.test.ts`'s "maps the default bindings…", after the D-pad down line: `expect(act([12]).peek).toBe(true); // D-pad up` and, in the face-button loop's expectation, nothing changes.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-input.test.ts src/features/gamepad/__tests__/gamepad.test.ts)`
Expected: FAIL, `pressPeek` is not exported and `peek` is undefined.

- [ ] **Step 3: Implement.**
  - `arena-pad.ts`: `ArenaPadActions` gains `/** The peek button pressed this frame (D-pad up). */ peek: boolean;`; `padToArena` returns `peek: is(cfg.pad.peek, (b) => pressed.has(b))`; the interface's doc comment's default list gains "D-pad up the peek".
  - `input.ts`, after `pressJournal`:

```ts
/** The peek, from its key or the pad's button: the topmost scope's `[data-pad-peek]` (the HUD's Map). */
export function pressPeek(): void {
  scopedLast('[data-pad-peek]')?.click();
}
```

    and in `attachKeyboard`'s `down`, after the journal branch: `} else if (action === 'peek') { pressPeek(); }`. (It sits after `isEnabled()`: paused, M does nothing; the prompt runtime owns the keys then.)
  - `useArenaCore.ts`'s `padFrame`: `if (acts.peek) pressPeek();` after the journal line, and the import. Its doc comment: "Menu opens the dive menu, View the journal and D-pad up the peek."

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__/arena-input.test.ts src/features/gamepad)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src
git commit -m "feat(client): D-pad up and M press the HUD's Map in the fight (pressPeek)"
```

---

### Task 3: the Map button and the overlay

**Files:**
- Create: `packages/client/src/features/delve/arena/hud/PeekOverlay.tsx`
- Modify: `packages/client/src/features/delve/arena/hud/Minimap.tsx` (`large`)
- Modify: `packages/client/src/features/delve/arena/hud/PurseBar.tsx` (`onPeek`, `controls`; `onMenu` optional)
- Modify: `packages/client/src/features/delve/arena/hud/LeanCorner.tsx` (`onPeek`)
- Modify: `packages/client/src/features/delve/delve.css` (`.delve-peek`)
- Modify: `packages/client/src/pages/DelveRun.tsx`
- Test: `packages/client/src/pages/__tests__/DelveRun.test.tsx`, `packages/client/src/features/delve/arena/hud/__tests__/LeanCorner.test.tsx`, `packages/client/src/features/delve/arena/hud/__tests__/Minimap.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `DelveRun.test.tsx`'s lean `describe` (plan 03), reset `seen.live.length = 0` in its `beforeEach` too, and add:

```tsx
  it('the Map button (the peek) toggles the large map, the purse and the finds over the running fight, taking no pointer', () => {
    renderRun();
    expect(screen.queryByTestId('peek-overlay')).toBeNull();
    const map = screen.getByTestId('peek-button');
    expect(map).toHaveAttribute('data-pad-peek');
    fireEvent.click(map);
    const peek = screen.getByTestId('peek-overlay');
    expect(within(peek).getByTestId('peek-map')).toBeInTheDocument();
    expect(within(peek).getByTestId('purse-bar')).toBeInTheDocument();
    expect(within(peek).getByTestId('pickup-feed')).toBeInTheDocument();
    expect(peek).toHaveAttribute('inert');
    expect(peek).toHaveClass('delve-peek');
    // Its purse has no buttons: the HUD's Journal, Menu and Map stay the only targets.
    expect(peek.querySelector('[data-pad-menu], [data-pad-journal], [data-pad-peek]')).toBeNull();
    // The fight runs on.
    expect(seen.paused.at(-1)).toBe(false);
    expect(seen.live.at(-1)).toBe(true);
    fireEvent.click(map);
    expect(screen.queryByTestId('peek-overlay')).toBeNull();
  });

  it('the pause closes the peek, and it stays closed on Resume', () => {
    renderRun();
    fireEvent.click(screen.getByTestId('peek-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
    expect(screen.queryByTestId('peek-overlay')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByTestId('peek-overlay')).toBeNull();
  });

  it('under the full HUD the peek is the large map alone (the purse and the finds are on screen)', () => {
    act(() => useUIStore.setState({ hudMode: 'full' }));
    renderRun();
    fireEvent.click(within(screen.getByTestId('purse-bar')).getByTestId('peek-button'));
    const peek = screen.getByTestId('peek-overlay');
    expect(within(peek).getByTestId('peek-map')).toBeInTheDocument();
    expect(within(peek).queryByTestId('purse-bar')).toBeNull();
    expect(within(peek).queryByTestId('pickup-feed')).toBeNull();
  });
```

  In `LeanCorner.test.tsx`, pass `onPeek` in `corner()`'s handlers and add: `fireEvent.click(screen.getByTestId('peek-button')); expect(on.onPeek).toHaveBeenCalledOnce();`. In `Minimap.test.tsx`, add: rendered `large`, the canvas is `peek-map`, carries no `data-tutorial`, and is taller than the HUD's (its class holds `h-[640px]`, the default's `h-[150px]`).

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx src/features/delve/arena/hud)`
Expected: FAIL, `peek-button` is not found.

- [ ] **Step 3: `Minimap`'s `large`.** It takes `large = false`; on its canvas: `data-testid={large ? 'peek-map' : 'minimap'}`, `data-tutorial={large ? undefined : 'hud.minimap'}`, and the height class `large ? 'h-[640px]' : 'h-[150px]'` in place of today's fixed `h-[150px]`. Its doc comment gains "Large, it is the peek's map (`peek-map`)." Everything else (the scale, the fog layer, `data-cover`) holds at any size.

- [ ] **Step 4: `PurseBar`.** Props: `onMenu?: () => void` (optional now), `onPeek?: () => void`, `controls = true`. With `controls` false the right-end group (the Labels hint, Journal, Menu) is not rendered. With `onPeek`, the group starts with the Map button:

```tsx
        {onPeek && (
          <button
            type="button"
            className="flex min-h-8 items-center gap-[6px]"
            data-pad-peek
            onMouseDown={noFocus}
            onClick={onPeek}
            data-testid="peek-button"
          >
            <InputGlyph
              binding={{ key: config.keys.peek ?? undefined, pad: config.pad.peek ?? undefined }}
              size="sm"
            />
            Map
          </button>
        )}
```

  The doc comment: "…and at the right end (unless `controls` is off: the peek's copy) the Map (`data-pad-peek`, the peek), the Labels hint, Journal and Menu". The Menu button's `onClick={onMenu}` is unchanged (undefined only where `controls` is off).

- [ ] **Step 5: `LeanCorner`'s `onPeek`.** A required prop; the same Map button as `PurseBar`'s, first in the corner's button row, with `data-testid="peek-button"`. The doc comment's buttons gain "Map (`data-pad-peek`, the peek, which the fight's D-pad up presses)".

- [ ] **Step 6: The overlay**

```tsx
// packages/client/src/features/delve/arena/hud/PeekOverlay.tsx
import type { ReactElement } from 'react';
import type { DiveState } from '@alloy/engine';
import type { HudMap } from '../useArenaCore';
import { FoundLog } from './FoundLog';
import { Minimap } from './Minimap';
import { PurseBar } from './PurseBar';

const nothing = () => {};

/**
 * The peek (the pad-first spec, 3): over the running fight, the large map and, under the lean HUD,
 * the purse with this dive's gains and the floor's finds (the full HUD shows those already). It is
 * `inert` and passes every pointer event through (`.delve-peek`), so the fight's clicks and aim
 * reach the arena under it.
 */
export function PeekOverlay({
  dive,
  map,
  lean,
}: {
  dive: DiveState;
  map: HudMap | null;
  lean: boolean;
}): ReactElement {
  return (
    <div
      className="delve-ui delve-hud-zoom delve-peek absolute inset-0 z-30 grid place-items-center"
      inert
      data-testid="peek-overlay"
    >
      <div className="flex w-[1400px] flex-col gap-4">
        {lean && (
          <div className="h-12">
            <PurseBar dive={dive} controls={false} />
          </div>
        )}
        <div className="flex h-[680px] gap-4">
          <div className="k-glass min-w-0 flex-1 p-4">
            <Minimap map={map} large />
          </div>
          {lean && (
            <div className="flex w-[380px] flex-none flex-col">
              <FoundLog onInspect={nothing} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

  In `delve.css`:

```css
/* The peek takes no pointer: its panels' own pointer-events-auto included. */
.delve-peek,
.delve-peek * {
  pointer-events: none !important;
}
```

  Check: `k-glass` is the HUD's glass class (`PurseBar` uses it); `FoundLog` measures its rows against its panel's parent column, which is 680 design px here. If the peek's 1400 × 750 design px block overflows at 1280×800 under the HUD's zoom (`hudZoom` never under 0.75: 1400 × 0.75 = 1050 px wide), it fits; if a later HUD scale makes it overflow, cap the width with `max-w-[calc(100%-48px)]`.

- [ ] **Step 7: `DelveRun`.** Beside the other state:

```tsx
  /** The peek (D-pad up, M, the HUD's Map): the large map, the purse and the finds over the fight. */
  const [peek, setPeek] = useState(false);
  const togglePeek = useCallback(() => setPeek((p) => !p), []);
```

  after `paused` is computed:

```tsx
  // Anything that stops the fight (the pause, the stop, a dialog, a beat) closes the peek.
  useEffect(() => {
    if (paused) setPeek(false);
  }, [paused]);
```

  pass `onPeek={togglePeek}` to `LeanCorner` and `PurseBar`, and after `<HudGrid …/>`:

```tsx
      {peek && !paused && <PeekOverlay dive={dive} map={arena.hud?.map ?? null} lean={lean} />}
```

  Both hooks sit above the early `if (!dive) return null`.

- [ ] **Step 8: Run them to see them pass, then the suite**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: types clean; all passing. `HudGrid.test.tsx` renders `PurseBar` with `onMenu`: still valid.

- [ ] **Step 9: Commit**

```bash
git add packages/client/src
git commit -m "feat(client): the peek: the large map, the purse and the finds over the running fight, from the HUD's Map, D-pad up or M"
```

---

### Task 4: H02, the peek in the browser

**Files:**
- Modify: `packages/client/e2e/delve-hud.spec.ts`

- [ ] **Step 1: Write the test** (import `installPad`, `tap` and `BUTTON` from `./fixtures/pad`)

```ts
  test('H02: M or the D-pad up toggles the peek over the running fight; it takes no pointer', async ({ page }) => {
    await installPad(page);
    // No bot: the hero stands, the fight runs.
    await seedProfile(page, 4242, false);
    await page.goto('/delve');
    await startDive(page);
    await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });
    const peek = page.getByTestId('peek-overlay');
    await page.keyboard.press('m');
    await expect(peek).toBeVisible();
    await expect(peek.getByTestId('peek-map')).toBeVisible();
    await expect(peek.getByTestId('purse-bar')).toBeVisible();
    await expect(peek.getByTestId('pickup-feed')).toBeVisible();
    // Not a pause: no pause screen, and the HUD stays live.
    await expect(page.getByTestId('pause-screen')).toHaveCount(0);
    await expect(page.getByTestId('dive-hud')).not.toHaveAttribute('inert', '');
    // The pointer passes through it to what lies under.
    const box = (await peek.getByTestId('peek-map').boundingBox())!;
    const caught = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="peek-overlay"]'),
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(caught).toBe(false);
    await page.keyboard.press('m');
    await expect(peek).toBeHidden();
    // The pad: D-pad up opens it (taking the input lock), and again closes it.
    await tap(page, BUTTON.up);
    await expect(peek).toBeVisible();
    await tap(page, BUTTON.up);
    await expect(peek).toBeHidden();
  });
```

- [ ] **Step 2: Run it at both sizes**

Run: `(cd packages/client && npx playwright test e2e/delve-hud.spec.ts)`
Expected: PASS on `desktop` and `desktop-1080` (H01 and H02).

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/delve-hud.spec.ts
git commit -m "test(client): H02, the peek by M and the D-pad, over the running fight"
```
