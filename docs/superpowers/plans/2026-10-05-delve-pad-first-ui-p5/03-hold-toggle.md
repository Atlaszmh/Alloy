# Hold moves by press-to-toggle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a device preference, **Hold moves: Hold / Press to toggle**, in the Controls editor beside "Basic attack". With Press to toggle, a press of an ability's button (or key) whose next move is a hold starts it charging; letting the button go keeps it charging; the next press of that button releases it. Any other move casts as it does today. Another ability's press while one charges releases it first (as a chord does today); a hold that fires by itself at full charge, or that a dodge drops, lets go of the latch, so the next press starts a new one. It is `ControlsConfig.holdToggle` (`alloy:controls:v1`), false by default.

**How a hold charges today (read from the code).** The engine charges a hold while the input's `holding` is its slot and releases it when `holding` lets go (`ArpgInput.holding`). On the pad, `padFrameCast` (`gamepad/arena-pad.ts`) makes `holding` the latest ability button pressed while it stays held (`acts.held`), and a button whose next move is a hold (`castsOnRelease`: the hold charging, or `pressMove(…).kind === 'hold'`) casts on its release, never on its press. On the keys, `attachKeyboard` (`arena/input.ts`) sets `input.aiming` on an ability key's keydown and casts it on its keyup (`release`); `keysInput` reports `holding: input.aiming?.slot`.

**Architecture:** the toggle changes only what counts as "held", never the cast rules:
- **The pad:** `latchHolds(registry, world, acts, mem)` rewrites the frame's `acts` before `padFrameCast`: a press of a slot whose next move is a hold latches it (`PadMemory.latch = { slot, started: false }`); while latched, the slot stays in `acts.held` with its button up; the next press of that slot is taken out of `cast` and `held` for that frame, so `padFrameCast` sees the button let go and casts the hold on its release, as it would a held one; another ability's press clears the latch (the chord's release casts it); once the hold has started and is no longer charging (fired by itself, or dropped by a dodge), the latch goes. `frameInput` runs it when `FrameOpts.holdToggle` is on.
- **The keys:** with the toggle on, an ability key's keyup marks the aiming `up` instead of casting; `frameInput` (which has the world) then casts it at once unless its next move is a hold (`castsOnRelease`), keeps a hold charging until the key's next keydown releases it (`releaseAiming`), and lets go without a cast when the hold ends by itself. The HUD's skill slots (a mouse press, `aiming.at` set) are unchanged.
- **The text:** a hold move's kind line (`KIND_HINT.hold`, shown by `MoveRows`, `MoveInspector` and `MoveEditor`) says "Press the button to charge it, press it again to let go: …" under the toggle (`kindHint(kind, toggle)`).

  The basic attack's held blows (RB, or the attack key) keep charging while held: the preference is for the three ability buttons, whose holds are moves the player built.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest (jsdom).

Read `00-overview.md` first.

---

### Task 1: `ControlsConfig.holdToggle`

**Files:**
- Modify: `packages/client/src/features/controls/controls.ts`
- Modify: `packages/client/src/stores/controlsStore.ts`
- Test: `packages/client/src/features/controls/__tests__/controls.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
  it('reads holdToggle: false by default, a saved boolean kept, anything else the default', () => {
    expect(DEFAULT_CONTROLS.holdToggle).toBe(false);
    expect(parseControls({}).holdToggle).toBe(false);
    expect(parseControls({ holdToggle: true }).holdToggle).toBe(true);
    expect(parseControls({ holdToggle: 'yes' }).holdToggle).toBe(false);
    // An older setup, saved before the field, keeps its bindings and gets the default.
    const old = JSON.parse(exportControls(DEFAULT_CONTROLS));
    delete old.holdToggle;
    expect(parseControls(old)).toEqual(DEFAULT_CONTROLS);
  });
```

- [ ] **Step 2: Run it** — `(cd packages/client && npx vitest run src/features/controls/__tests__/controls.test.ts)`. Expected: FAIL.
- [ ] **Step 3: The field.** `ControlsConfig.holdToggle: boolean` with the doc "Hold moves by press-to-toggle: a press starts a hold move charging and the next press of its button or key releases it (the pad and the keys; the HUD's slots and the attack keep holding)"; `DEFAULT_CONTROLS.holdToggle: false`; `parseControls`: `holdToggle: typeof r.holdToggle === 'boolean' ? r.holdToggle : d.holdToggle`. `controlsStore`: `setHoldToggle: (on: boolean) => commit({ ...get().config, holdToggle: on })` in the interface and the store.
- [ ] **Step 4: Run it** — Expected: PASS (and the file's other tests, which compare whole configs to `DEFAULT_CONTROLS`).
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/controls packages/client/src/stores/controlsStore.ts
git commit -m "feat(client): ControlsConfig.holdToggle, off by default"
```

---

### Task 2: the pad's latch

**Files:**
- Modify: `packages/client/src/features/gamepad/arena-pad.ts`
- Modify: `packages/client/src/features/delve/arena/input.ts` (`FrameOpts.holdToggle`, `padInput`)
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts` (the opts)
- Test: `packages/client/src/features/delve/__tests__/arena-input.test.ts` (in `describe("frameInput: …")`, which has `pad`, `opts`, `keys`)

- [ ] **Step 1: Write the failing tests.**

```ts
  describe('press-to-toggle hold moves on the pad', () => {
    const toggle = { ...opts, holdToggle: true };
    const holdBolt = { moves: [{ kind: 'hold', form: 'bolt', elements: ['fire'] }], payment: 'mana' } as Chain;
    /** One frame of the pad under the toggle, stepped: its input, and the casts it made. */
    const run = (w: ReturnType<typeof world>, mem = padMemory()) => {
      const input = createArenaInput();
      const STEP = registry.getDelveBalance().arena.step;
      return (acts: Partial<ArenaPadActions>) => {
        const out = frameInput(registry, w, input, pad(acts), mem, toggle);
        return { out, casts: stepWorld(registry, w, out, STEP).filter((e) => e.kind === 'cast') };
      };
    };

    it('a press starts a hold charging, the button let go keeps it, and the next press releases it', () => {
      const w = world(holdBolt);
      const frame = run(w);
      expect(frame({ cast: [0], held: [0] }).casts).toEqual([]);
      for (let i = 0; i < 5; i++) expect(frame({}).out.holding).toBe(0); // RT up: still charging
      expect(w.hero.hold?.slot).toBe(0);
      const fired = frame({ cast: [0], held: [0] });
      expect(fired.out).toMatchObject({ cast: { slot: 0, aim: null }, holding: null });
      // RT still down after the second press, then let go: nothing more charges or casts.
      expect(frame({ held: [0] }).out).toMatchObject({ cast: null, holding: null });
      expect(frame({}).out).toMatchObject({ cast: null, holding: null });
      expect(w.hero.hold).toBeNull();
    });

    it('any other move casts on the press, as without the toggle', () => {
      const w = world(); // the default Primary: no hold
      const mem = padMemory();
      expect(run(w, mem)({ cast: [0], held: [0] }).out.cast).toEqual({ slot: 0, aim: null });
      expect(mem.latch).toBeNull();
    });

    it("another ability's press releases the charging one first, as a chord does", () => {
      const w = world(holdBolt);
      const mem = padMemory();
      const frame = run(w, mem);
      frame({ cast: [0], held: [0] });
      for (let i = 0; i < 5; i++) frame({});
      expect(frame({ cast: [1], held: [1] }).out.cast).toEqual({ slot: 0, aim: null });
      expect(mem.latch).toBeNull();
    });

    it('a hold that fires by itself at full charge lets go: the next press starts a new one', () => {
      const w = world(holdBolt);
      const mem = padMemory();
      const frame = run(w, mem);
      frame({ cast: [0], held: [0] });
      let fired = false;
      for (let i = 0; i < 600 && !fired; i++) fired = frame({}).casts.length > 0;
      expect(fired).toBe(true); // auto-fire at holdMax × the tempo
      // The latch lets go quietly: no second cast as the slot stops being held.
      const after = frame({});
      expect(after.out).toMatchObject({ cast: null, holding: null });
      expect(after.casts).toEqual([]);
      expect(mem.latch).toBeNull();
      // Wait out the move's cooldown and beat, then a press charges anew rather than releasing.
      for (let i = 0; i < 300 && !abilityReady(makeCtx(registry, w, []), 0); i++) frame({});
      const again = frame({ cast: [0], held: [0] });
      expect(again.out).toMatchObject({ cast: null, holding: 0 });
    });

    it('off by default: the button let go releases the hold, as ever', () => {
      const w = world(holdBolt);
      const input = createArenaInput();
      const mem = padMemory();
      frameInput(registry, w, input, pad({ cast: [0], held: [0] }), mem, opts);
      expect(frameInput(registry, w, input, pad(), mem, opts).cast).toEqual({ slot: 0, aim: null });
    });
  });
```

  `abilityReady` and `makeCtx` come from `@alloy/engine` (`gamepad.test.ts` uses them the same way: `abilityReady(makeCtx(registry, w, []), 0)`); add them to the file's engine import. If the auto-fire's cast isn't a `cast` event, read `holdTick` in `cast.ts` for the event it emits on a release and match that.

- [ ] **Step 2: Run it** — `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-input.test.ts -t "press-to-toggle")`. Expected: FAIL (`holdToggle` unknown on the opts; nothing latches).
- [ ] **Step 3: `arena-pad.ts`.** Export `castsOnRelease` (its doc unchanged). Add to `PadMemory`

```ts
  /**
   * Press-to-toggle (`ControlsConfig.holdToggle`): the slot whose press started a hold move, held
   * for it until its next press; `started` once the world's hold is that slot's.
   */
  latch: { slot: number; started: boolean } | null;
```

  (`padMemory()` gives `latch: null`), and

```ts
/**
 * Press-to-toggle's pad (`ControlsConfig.holdToggle`): this frame's buttons with a latched hold
 * held. A press whose next move is a hold (`castsOnRelease`) latches its slot, which then counts
 * as held with its button up; that slot's next press releases it (taken out of the frame, so
 * `padFrameCast` sees the button let go and casts the hold); another ability's press lets go of the
 * latch (its chord casts the hold); and a hold that ends by itself (full charge, a dodge) lets go.
 */
export function latchHolds(
  registry: DataRegistry,
  world: ArpgWorld,
  acts: Pick<ArenaPadActions, 'cast' | 'held' | 'repeat'>,
  mem: PadMemory,
): Pick<ArenaPadActions, 'cast' | 'held' | 'repeat'> {
  const hold = world.hero.hold?.slot ?? null;
  const l = mem.latch;
  if (l && hold === l.slot) l.started = true;
  else if (l?.started) {
    // Ended by itself: its button is up, and must not cast again as `padFrameCast` sees it let go.
    mem.latch = null;
    mem.sent = l.slot;
  }
  const latched = mem.latch?.slot ?? null;
  if (latched !== null && acts.cast.length > 0) {
    mem.latch = null;
    if (acts.cast.includes(latched)) {
      const off = (s: number) => s !== latched;
      return { cast: acts.cast.filter(off), held: acts.held.filter(off), repeat: acts.repeat.filter(off) };
    }
    return acts;
  }
  if (latched !== null)
    return acts.held.includes(latched) ? acts : { ...acts, held: [...acts.held, latched].sort() };
  const press = [...acts.cast].reverse().find((s) => castsOnRelease(registry, world, s));
  if (press !== undefined) mem.latch = { slot: press, started: false };
  return acts;
}
```

  The latest press that starts a hold is the one `padFrameCast` makes `holding` (the highest of several in one frame), so it latches that one. `mem.sent = l.slot` on a hold that ended by itself uses `padFrameCast`'s own rule ("a button whose press cast lets go quietly unless its hold charges"): without it the latch letting go reads as a release, and `castsOnRelease` (the next move is the hold again) would cast a fresh tap.

- [ ] **Step 4: `input.ts`.** `FrameOpts` gains `/** Press-to-toggle hold moves (\`ControlsConfig.holdToggle\`). */ holdToggle?: boolean;`. In `padInput`: `const frame = padFrameCast(registry, world, o.holdToggle ? { ...pad, ...latchHolds(registry, world, pad, mem) } : pad, mem);`. A device switch already resets the memory (`padMemory()`), the latch with it, and drops the hold.
- [ ] **Step 5: `useArenaCore.ts`.** Where it builds the opts for `frameInput` (beside `aimReach: useControlsStore.getState().config.aimReach`): `holdToggle: useControlsStore.getState().config.holdToggle`.
- [ ] **Step 6: Run it** — Expected: PASS; then the whole `arena-input.test.ts` and `src/features/gamepad/__tests__/gamepad.test.ts` (padFrameCast's own tests; untouched, they build `padMemory()` and must still pass with the new field).
- [ ] **Step 7: Commit**

```bash
git add packages/client/src/features/gamepad/arena-pad.ts packages/client/src/features/delve/arena packages/client/src/features/delve/__tests__/arena-input.test.ts
git commit -m "feat(client): press-to-toggle hold moves on the pad: a press starts the charge, the next press releases it"
```

  Before it: `(cd packages/client && npx vitest related --run src/features/gamepad/arena-pad.ts src/features/delve/arena/input.ts src/features/delve/arena/useArenaCore.ts)`.

---

### Task 3: the keys' latch

**Files:**
- Modify: `packages/client/src/features/delve/arena/input.ts`
- Test: `packages/client/src/features/delve/__tests__/arena-input.test.ts`

- [ ] **Step 1: Write the failing tests** (in the same `describe("frameInput: …")`, which can reach `key` and `attachKeyboard`):

```ts
  describe('press-to-toggle hold moves on the keys', () => {
    let detach = () => {};
    beforeEach(() => useControlsStore.getState().setHoldToggle(true));
    afterEach(() => {
      detach();
      useControlsStore.getState().reset();
    });
    const holdBolt = { moves: [{ kind: 'hold', form: 'bolt', elements: ['fire'] }], payment: 'mana' } as Chain;

    it('Q tapped starts the hold and its key let go keeps it; Q again releases it', () => {
      const w = world(holdBolt);
      const input = createArenaInput();
      detach = attachKeyboard(input, () => true);
      const STEP = registry.getDelveBalance().arena.step;
      const mem = padMemory();
      const frame = () => {
        const out = frameInput(registry, w, input, null, mem, keys);
        stepWorld(registry, w, out, STEP);
        return out;
      };
      key('keydown', 'KeyQ');
      key('keyup', 'KeyQ');
      for (let i = 0; i < 5; i++) expect(frame()).toMatchObject({ cast: null, holding: 0 });
      expect(w.hero.hold?.slot).toBe(0);
      key('keydown', 'KeyQ');
      expect(frame()).toMatchObject({ cast: { slot: 0 }, holding: null });
      key('keyup', 'KeyQ');
      expect(frame()).toMatchObject({ cast: null, holding: null });
      expect(w.hero.hold).toBeNull();
    });

    it('a move that is not a hold casts as its key goes up, as without the toggle', () => {
      const w = world();
      const input = createArenaInput();
      detach = attachKeyboard(input, () => true);
      key('keydown', 'KeyQ');
      key('keyup', 'KeyQ');
      expect(frameInput(registry, w, input, null, padMemory(), keys)).toMatchObject({
        cast: { slot: 0, aim: null },
        holding: null,
      });
    });
  });
```

  (`beforeEach`/`afterEach` from vitest are imported at the file's top already.)

- [ ] **Step 2: Run it** — Expected: FAIL (the keyup casts at once).
- [ ] **Step 3: The keys.**
  - `Aiming` gains `/** Press-to-toggle: its key went up while the move charges on (\`frameInput\` decides). */ up?: boolean;` and `/** Press-to-toggle: the world's hold is this slot's. */ started?: boolean;`.
  - Move the closure's `release` out as an export, `releaseAiming(input: ArenaInput): void` (the same body: a tap auto-aims, a hold aims at the mouse), and call it from `attachKeyboard`.
  - `attachKeyboard`, with `const toggle = () => useControlsStore.getState().config.holdToggle;`: in `down`, before setting a new aiming for an ability key, `if (input.aiming?.up && input.aiming.slot === slot) { releaseAiming(input); return; }` (the second press releases); in `up`, `if (a && a.at === null && action && ABILITY_SLOT[action] === a.slot) { if (toggle()) a.up = true; else releaseAiming(input); }`.
  - `frameInput`, on the keys' side before `keysInput`:

```ts
/**
 * Press-to-toggle on the keys: an ability key that went up (`aiming.up`) casts now unless its
 * move is a hold (`castsOnRelease`), which charges on until the key's next press releases it; a
 * hold that ends by itself (full charge, a dodge) lets go without a cast.
 */
function latchKeys(registry: DataRegistry, world: ArpgWorld, input: ArenaInput): void {
  const a = input.aiming;
  if (!a?.up) return;
  if (world.hero.hold?.slot === a.slot) a.started = true;
  else if (a.started) input.aiming = null;
  else if (!castsOnRelease(registry, world, a.slot)) releaseAiming(input);
}
```

  `const out = padLive ? padInput(…) : (latchKeys(registry, world, input), keysInput(input, o));` (or two lines). The blur handler already lets go (`aiming = null`); another ability key's keydown already releases a key-held one (`if (input.aiming?.at === null) release()`), which now casts a latched hold too.

- [ ] **Step 4: Run it** — Expected: PASS; then the whole file (the "ability keys" tests run with the toggle off: unchanged).
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/arena/input.ts packages/client/src/features/delve/__tests__/arena-input.test.ts
git commit -m "feat(client): press-to-toggle hold moves on the keys"
```

---

### Task 4: the editor and the kind's line

**Files:**
- Modify: `packages/client/src/features/controls/ControlsPanel.tsx`
- Modify: `packages/client/src/features/delve/chains/MoveEditor.tsx` (`kindHint`), `hub/skills/MoveRows.tsx`, `hub/skills/MoveInspector.tsx`
- Test: `packages/client/src/features/controls/__tests__/ControlsPanel.test.tsx`, `packages/client/src/features/delve/hub/skills/__tests__/` (the editor's test that reads a hold's line, if one does: `grep -rn "Hold the button" packages/client/src --include=*.test.tsx`)

- [ ] **Step 1: Write the failing test** (ControlsPanel; its `afterEach` resets the controls store):

```tsx
  it('Hold moves sits beside Basic attack: Hold by default, Press to toggle once clicked, saved for this device', () => {
    render(<ControlsPanel onClose={() => {}} />);
    const button = screen.getByTestId('hold-mode-toggle');
    expect(button).toHaveTextContent('Hold moves: Hold');
    expect(button.parentElement).toBe(screen.getByTestId('attack-mode-toggle').parentElement);
    fireEvent.click(button);
    expect(button).toHaveTextContent('Hold moves: Press to toggle');
    expect(useControlsStore.getState().config.holdToggle).toBe(true);
    expect(JSON.parse(localStorage.getItem(CONTROLS_KEY)!).holdToggle).toBe(true);
  });
```

  And for the kind line, in `MoveEditor`'s test file (or the MoveRows one, wherever kind hints are asserted):

```ts
  it("a hold's line follows the toggle", () => {
    expect(kindHint('hold', false)).toBe(KIND_HINT.hold);
    expect(kindHint('hold', true)).toBe(
      'Press the button to charge it, press it again to let go: a quick pair is a medium hit, a full charge beyond heavy.',
    );
    expect(kindHint('heavy', true)).toBe(KIND_HINT.heavy);
  });
```

- [ ] **Step 2: Run them** — Expected: FAIL.
- [ ] **Step 3: The editor.** Wrap the Basic attack button and the new one in `<div className="flex flex-wrap gap-2">`; the new one: `<Button onClick={() => store().setHoldToggle(!cfg.holdToggle)} testId="hold-mode-toggle">Hold moves: {cfg.holdToggle ? 'Press to toggle' : 'Hold'}</Button>`. The editor's intro line stays.
- [ ] **Step 4: The line.** In `MoveEditor.tsx`, beside `KIND_HINT`:

```ts
/** A kind's line under its choice: a hold's says how it charges under press-to-toggle (`ControlsConfig.holdToggle`). */
export function kindHint(kind: MoveKind, toggle: boolean): string {
  return kind === 'hold' && toggle
    ? 'Press the button to charge it, press it again to let go: a quick pair is a medium hit, a full charge beyond heavy.'
    : KIND_HINT[kind];
}
```

  Its three readers (`MoveEditor` line ~333, `MoveInspector` ~89, `MoveRows` ~144) take `const toggle = useControlsStore((s) => s.config.holdToggle);` and call `kindHint(move.kind, toggle)` where they read `KIND_HINT[move.kind]`. The basic blow's line ("Hold the attack to charge it…") is unchanged: the attack still holds.
- [ ] **Step 5: Run them** — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/controls packages/client/src/features/delve/chains packages/client/src/features/delve/hub/skills
git commit -m "feat(client): the Controls editor's Hold moves toggle beside Basic attack; a hold's line says how it charges"
```

---

### Task 5: the plan's run

(If the same agent does plans 04 and 05 next, skip the E2E here: plan 05's last task runs the union.)

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run > "$SCRATCH/unit-03.txt" 2>&1; tail -n 15 "$SCRATCH/unit-03.txt")
(cd packages/client && npx playwright test e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts --project=desktop --reporter=line > "$SCRATCH/e2e-03.txt" 2>&1; tail -n 30 "$SCRATCH/e2e-03.txt")
```

  Expected: the unit suite at the baseline plus this plan's tests, all passing; G04 (holding RT through the chain) and the Training specs PASS with the toggle off, as shipped. No layout changed: no `desktop-1080`, no pad audit.
