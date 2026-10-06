# Swap sticks and stick sensitivity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** two controller options in the Controls editor, beside the deadzones: **Swap sticks** (move on the right stick, aim on the left; the stick clicks swap with them, so L3's labels follow the move stick's press) and **stick sensitivity**, one slider a stick from 50% to 150% (at least ±50%, Xbox Accessibility Guideline 107). Both are `ControlsConfig` fields (`swapSticks`, `sensitivity`), saved per device with the rest of the setup.

**How the sticks are read (from the code).** `gamepad-hub.ts` reads the pad once a frame: `readPad(pad, config.deadzone)` (`gamepad.ts`) maps the standard axes (0/1 the left stick, 2/3 the right) through `radialDeadzone` (zero inside the deadzone, the rest rescaled to 0..1) into `PadState.left` / `.right`, and every reader takes the state from there: the arena (`padToArena`: `move` is `left`, the aim `right`'s direction and tilt), the aim preview, the menus (`use-gamepad-nav.ts`: a left-stick flick moves the focus, the right stick scrolls `[data-pad-scroll]`), and the input lock (`padClaims`). So both options belong in `readPad`, once, and every reader follows: the menus' flick and scroll swap with the fight's move and aim, which keeps "the stick you move with" one stick everywhere.

**Sensitivity is a response curve, not a gain.** A gain would either never reach full tilt (under 100%: the hero could never walk at full speed) or reach it early and lose the top of the throw (over 100%). The curve keeps both ends: past the deadzone, `out = r ^ (1 / s)` on the rescaled magnitude `r` (0..1): at 100% linear; at 150% `0.5 → 0.63` (quicker off the centre); at 50% `0.5 → 0.25` (finer near the centre); full tilt is always 1 and the deadzone's edge always 0. The direction is untouched, so the aim's direction never changes: only how far a placed ability reaches at a given tilt (`stickAimPoint`'s `tilt`), how fast the hero walks at a given push, and how soon a flick or a scroll comes in the menus.

**Architecture:**

```ts
// gamepad.ts
/** How the sticks are read: the deadzones, and (from the Controls editor) the curve and the swap. */
export interface StickSetup {
  deadzone: { left: number; right: number };
  /** Each stick's response, 0.5 to 1.5: `r ^ (1 / s)` past the deadzone (1: linear). */
  sensitivity?: { left: number; right: number };
  /** Move on the right stick and aim on the left; L3 and R3 swap with them. */
  swapSticks?: boolean;
}
```

  `readPad(pad, setup: StickSetup = { deadzone: { left: LEFT_DEADZONE, right: RIGHT_DEADZONE } })`. `ControlsConfig` satisfies `StickSetup` structurally, so the hub passes `useControlsStore.getState().config` (no import of the controls types into `gamepad.ts`: `controls.ts` already imports from it).

**Tech Stack:** TypeScript, React 19, Zustand, Vitest (jsdom).

Read `00-overview.md` first.

---

### Task 1: the config

**Files:**
- Modify: `packages/client/src/features/controls/controls.ts`
- Modify: `packages/client/src/stores/controlsStore.ts`
- Test: `packages/client/src/features/controls/__tests__/controls.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
  it('reads swapSticks and each stick's sensitivity: defaults, kept values, and out-of-range ones refused', () => {
    expect(DEFAULT_CONTROLS).toMatchObject({ swapSticks: false, sensitivity: { left: 1, right: 1 } });
    expect(SENSITIVITY_LIMITS).toEqual([0.5, 1.5]);
    const cfg = parseControls({ swapSticks: true, sensitivity: { left: 0.5, right: 1.5 } });
    expect(cfg).toMatchObject({ swapSticks: true, sensitivity: { left: 0.5, right: 1.5 } });
    expect(parseControls({ swapSticks: 1, sensitivity: { left: 0.2, right: 'fast' } })).toMatchObject({
      swapSticks: false,
      sensitivity: { left: 1, right: 1 },
    });
    const old = JSON.parse(exportControls(DEFAULT_CONTROLS));
    delete old.swapSticks;
    delete old.sensitivity;
    expect(parseControls(old)).toEqual(DEFAULT_CONTROLS);
  });
```

- [ ] **Step 2: Run it** — `(cd packages/client && npx vitest run src/features/controls/__tests__/controls.test.ts)`. Expected: FAIL.
- [ ] **Step 3: The fields.** In `ControlsConfig`, after `deadzone`:

```ts
  /** Controller only: each stick's response past its deadzone, 0.5 to 1.5 (1: linear; see `radialDeadzone`). */
  sensitivity: { left: number; right: number };
  /** Controller only: move on the right stick and aim on the left (their clicks swap too). */
  swapSticks: boolean;
```

  `export const SENSITIVITY_LIMITS = [0.5, 1.5] as const;` beside `DEADZONE_LIMITS`; defaults `sensitivity: { left: 1, right: 1 }, swapSticks: false`; in `parseControls`, `const sens = isObject(r.sensitivity) ? r.sensitivity : {};` and

```ts
    sensitivity: {
      left: inRange(sens.left, SENSITIVITY_LIMITS) ? sens.left : d.sensitivity.left,
      right: inRange(sens.right, SENSITIVITY_LIMITS) ? sens.right : d.sensitivity.right,
    },
    swapSticks: typeof r.swapSticks === 'boolean' ? r.swapSticks : d.swapSticks,
```

  `controlsStore`: `setSensitivity: (stick, value) => commit(parseControls({ ...get().config, sensitivity: { ...get().config.sensitivity, [stick]: value } }))` (the deadzone's pattern: an out-of-range value falls back) and `setSwapSticks: (on) => commit({ ...get().config, swapSticks: on })`.
- [ ] **Step 4: Run it** — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/controls packages/client/src/stores/controlsStore.ts
git commit -m "feat(client): ControlsConfig's swapSticks and per-stick sensitivity, 50 to 150%"
```

---

### Task 2: `readPad` swaps and curves

**Files:**
- Modify: `packages/client/src/features/gamepad/gamepad.ts`
- Modify: `packages/client/src/features/gamepad/gamepad-hub.ts`
- Test: `packages/client/src/features/gamepad/__tests__/gamepad.test.ts`

- [ ] **Step 1: Write the failing tests** (beside `describe('radialDeadzone')` and `describe('readPad')`; the hub's in its `describe` that fakes `navigator.getGamepads`, with `useControlsStore` imported and reset in `afterEach`):

```ts
describe('stick sensitivity', () => {
  it('curves the tilt past the deadzone, keeping the deadzone, full tilt and the direction', () => {
    const at = (x: number, s: number) => radialDeadzone(x, 0, 0.2, s).x;
    expect(at(0.6, 1)).toBeCloseTo(0.5); // linear
    expect(at(0.6, 1.5)).toBeCloseTo(0.5 ** (1 / 1.5)); // 0.63: quicker off the centre
    expect(at(0.6, 0.5)).toBeCloseTo(0.25); // finer near it
    for (const s of [0.5, 1, 1.5]) {
      expect(at(1, s)).toBeCloseTo(1);
      expect(at(0.2, s)).toBe(0);
    }
    const d = radialDeadzone(0.5, 0.5, 0.2, 1.5);
    expect(d.y / d.x).toBeCloseTo(1); // the direction holds
  });

  it('readPad applies each stick its own', () => {
    const s = readPad(fakePad([], [0.6, 0, 0.6, 0]), {
      deadzone: { left: 0.2, right: 0.2 },
      sensitivity: { left: 0.5, right: 1.5 },
    });
    expect(s.left.x).toBeCloseTo(0.25);
    expect(s.right.x).toBeCloseTo(0.5 ** (1 / 1.5));
  });
});

describe('swap sticks', () => {
  it('moves on the right stick and aims on the left, each with its role's deadzone and curve; the clicks swap', () => {
    // The right stick pushed, L3 (10) held.
    const pad = fakePad([10], [0, 0, 0.9, 0]);
    const plain = readPad(pad, { deadzone: { left: 0.2, right: 0.35 } });
    expect([plain.left.x, plain.right.x > 0.8, plain.buttons.ls, plain.buttons.rs]).toEqual([0, true, true, false]);
    const swapped = readPad(pad, { deadzone: { left: 0.2, right: 0.35 }, swapSticks: true });
    expect(swapped.left.x).toBeCloseTo((0.9 - 0.2) / 0.8); // the move stick's deadzone, 0.2
    expect(swapped.right).toEqual({ x: 0, y: 0 });
    expect([swapped.buttons.ls, swapped.buttons.rs]).toEqual([false, true]);
  });
});
```

  In the hub's `describe` (the one with `tick`, `resting` and `device`):

```ts
  it('reads the sticks through the player's setup: swapped, the right stick moves', () => {
    useControlsStore.getState().setSwapSticks(true);
    pad = fakePad([], [0, 0, 0.9, 0]);
    tick();
    expect(padState()!.left.x).toBeGreaterThan(0.8);
    expect(padState()!.right).toEqual({ x: 0, y: 0 });
    useControlsStore.getState().reset();
  });
```

  (`padState` from `'../gamepad-hub'`.)

- [ ] **Step 2: Run them** — `(cd packages/client && npx vitest run src/features/gamepad/__tests__/gamepad.test.ts)`. Expected: FAIL.
- [ ] **Step 3: `gamepad.ts`.**

```ts
/**
 * Zero a stick inside the deadzone and rescale the rest so the edge of it is 0 and full tilt is
 * 1, along the response curve `r ^ (1 / sensitivity)` (1: linear; more: quicker off the centre;
 * less: finer near it). The direction never changes.
 */
export function radialDeadzone(x: number, y: number, deadzone: number, sensitivity = 1): Vec {
  const len = Math.hypot(x, y);
  if (len <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - deadzone) / (1 - deadzone)) ** (1 / sensitivity);
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}
```

  `readPad(pad, setup = { deadzone: { left: LEFT_DEADZONE, right: RIGHT_DEADZONE } })`: read the buttons as now, then `if (setup.swapSticks) [buttons.ls, buttons.rs] = [buttons.rs, buttons.ls];`; the move stick's axes are `[2, 3]` when swapped else `[0, 1]`, the aim's the other pair; `left: radialDeadzone(axis(mx), axis(my), setup.deadzone.left, setup.sensitivity?.left ?? 1)`, `right` likewise with the right deadzone and sensitivity. `PadState`'s doc gains "`left` is the move stick and `right` the aim stick, whichever physical stick each is (`swapSticks`)".
- [ ] **Step 4: The hub.** `readPad(pad, useControlsStore.getState().config)`.
- [ ] **Step 5: Run them** — Expected: PASS, and the file's other tests (they call `readPad(fakePad(…))` with no setup: the default is today's).
- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/gamepad
git commit -m "feat(client): readPad swaps the sticks (and their clicks) and curves each by its sensitivity"
```

  Before it: `(cd packages/client && npx vitest related --run src/features/gamepad/gamepad.ts src/features/gamepad/gamepad-hub.ts)`.

---

### Task 3: the editor

**Files:**
- Modify: `packages/client/src/features/controls/ControlsPanel.tsx`
- Modify: `packages/client/src/features/controls/controls.ts` (`ACTION_LABELS` stays; only the move keys' "Left stick" cell reads the swap)
- Test: `packages/client/src/features/controls/__tests__/ControlsPanel.test.tsx`

- [ ] **Step 1: Write the failing test.**

```tsx
  it('the sticks: Swap sticks, and a sensitivity slider beside each deadzone, saved for this device', () => {
    render(<ControlsPanel onClose={() => {}} />);
    const swap = screen.getByTestId('swap-sticks');
    expect(swap).toHaveAttribute('aria-pressed', 'false');
    // The move keys' controller cell names the move stick.
    expect(screen.getAllByText('Left stick').length).toBe(4);
    fireEvent.click(swap);
    expect(useControlsStore.getState().config.swapSticks).toBe(true);
    expect(screen.getAllByText('Right stick').length).toBe(4);
    const left = screen.getByTestId('sensitivity-left');
    expect(left).toHaveAttribute('min', '0.5');
    expect(left).toHaveAttribute('max', '1.5');
    fireEvent.change(left, { target: { value: '1.25' } });
    expect(useControlsStore.getState().config.sensitivity.left).toBe(1.25);
    expect(screen.getByText('125%')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('sensitivity-right'), { target: { value: '0.5' } });
    expect(useControlsStore.getState().config.sensitivity.right).toBe(0.5);
  });
```

- [ ] **Step 2: Run it** — Expected: FAIL.
- [ ] **Step 3: The rows.** In the sticks' `section`: first the chip `<Chip pressed={cfg.swapSticks} onClick={() => store().setSwapSticks(!cfg.swapSticks)} testId="swap-sticks">Swap sticks: move on the right, aim on the left</Chip>`; then the deadzone and sensitivity sliders, a stick at a time, labelled by role: "Move stick deadzone", "Move stick sensitivity" (`sensitivity-left`, `limits={SENSITIVITY_LIMITS}`, `format={(v) => \`${Math.round(v * 100)}%\`}`, `onChange={(v) => store().setSensitivity('left', v)}`), "Aim stick deadzone", "Aim stick sensitivity" (`sensitivity-right`); then "Placed abilities at full tilt". The move keys' controller cell reads `cfg.swapSticks ? 'Right stick' : 'Left stick'`. The `Slider`'s `step={0.01}` serves both ranges.
- [ ] **Step 4: Run it** — Expected: PASS, and the file's other tests (a test that counts the editor's sliders or reads the sticks' order changes with it: name it in the commit).
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/controls
git commit -m "feat(client): the Controls editor's Swap sticks and a sensitivity slider a stick"
```

---

### Task 4: the plan's run

(If the same agent does plan 05 next, skip the E2E here: plan 05's last task runs the union.)

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run > "$SCRATCH/unit-04.txt" 2>&1; tail -n 15 "$SCRATCH/unit-04.txt")
(cd packages/client && npx playwright test e2e/delve-gamepad.spec.ts e2e/delve.spec.ts --project=desktop --reporter=line > "$SCRATCH/e2e-04.txt" 2>&1; tail -n 30 "$SCRATCH/e2e-04.txt")
```

  Expected: the unit suite at the baseline plus this plan's tests, all passing; the gamepad spec (its faked pad reads through `readPad` with the shipped setup: unchanged) and `delve.spec.ts` (D09 opens the Controls editor) PASS. No layout changed outside a dialog: no `desktop-1080`, no pad audit (the Controls editor is not audited).
