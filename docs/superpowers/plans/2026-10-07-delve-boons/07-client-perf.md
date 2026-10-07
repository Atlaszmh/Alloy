# Delve boons · C3: client performance — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Echo hits stop costing the client what real hits cost (spec §8): an echo hit never freezes the display or shakes the camera, and plays its hit sound at half volume through the same throttle; the hit's mana-fx and pixel-floor moments draw from a per-frame budget, `HIT_FX_BUDGET` (24), real hits first and echoes from what is left, a hit over it drawing only its floating number; and a dev-only `FrameChip` in the Training bar reads the 95th-percentile frame time over the last 5 s.

**Architecture:** Everything keys on Phase A's `hit` event flag, `echo?: true`. `hitstopMs` skips echo hits. The renderer's `handleEvents` picks the frame's hits that get a moment with one pure function, `hitFxPicks(events)` (`fx/mana-fx.ts`, beside `HIT_FX_BUDGET`): two passes over the frame's events, real hits then echoes, until the budget is spent. The pixel floor is sent the frame's events with the unpicked hits filtered out (so `pixel/arena-effects.ts` is untouched: its `hit` case only ever sees picked hits), and the renderer's own `hit` case draws its burst, ring and shake only for a picked, non-echo hit (a picked echo draws burst and ring, no shake), and a 360° slash shakes only when it isn't an echo's (A's `slash` event carries `echo` too). The sound manager's `play` gains a `gain` (default 1); `playArenaEvents` passes `ECHO_GAIN` (0.5) for an echo hit, through the sound's own cooldown. `FrameChip` (`training/FrameChip.tsx`) samples `requestAnimationFrame` deltas into a `FrameWindow` (`training/frame-window.ts`, pure: a 5 s time window and a nearest-rank percentile) and shows the p95 twice a second, rendering nothing outside dev builds.

**Tech Stack:** TypeScript 5.7, React 19, PixiJS 8, Vitest 3 (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-06-delve-boons-design.md` (authoritative), §8 Performance, the client half. The overview is `00-overview.md` ("The contract": the `hit` event's `echo?: true`).

---

## Base

- **Starts from:** `boons/main` with Phase A merged, in this area's worktree:

```bash
cd /c/Projects/Alloy && git worktree add ../alloy-boons-c3 -b boons/c3 boons/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-boons-c3` in Git Bash.
- **Anchors:** written against `d3b5e447` (main) plus the contract's one line this area reads: `ArpgEvent`'s `hit` member has `echo?: true`, set at the echo sites. Nothing else from A is read. If A's executor named the flag differently, rename it in every snippet below.
- **Before Task 1:** build the engine once (the client reads its bundle; the flag must be in it, or every `echo` below fails to typecheck), and measure the client:

```bash
cd /c/Projects/alloy-boons-c3
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
```

  Expected: tsup's "Build success" lines; no type errors; the client suite all passing. Note its count; each task below adds to it.
- **No engine change**, so no engine suite, no pacing rails and no fingerprint here.

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/arena/fx/hitstop.ts` | `hitstopMs` skips echo hits (Task 1) |
| `packages/client/src/features/delve/arena/fx/__tests__/hitstop.test.ts` | echo hits never freeze (Task 1) |
| `packages/client/src/shared/utils/sound-manager.ts` | `play(name, gain = 1)`, `playSound(name, gain?)` (Task 2) |
| `packages/client/src/shared/utils/sound-manager.test.ts` | the gain scales the volume (Task 2) |
| `packages/client/src/features/delve/arena/arena-sounds.ts` | `ECHO_GAIN`; an echo hit at half volume, no buzz (Task 2) |
| `packages/client/src/features/delve/__tests__/arena-sounds.test.ts` | the echo hit's sound (Task 2) |
| `packages/client/src/features/delve/arena/fx/mana-fx.ts` | `HIT_FX_BUDGET`, `hitFxPicks` (Task 3) |
| `packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts` | the budget's ordering (Task 3) |
| `packages/client/src/features/delve/arena/ArenaRenderer.ts` | `handleEvents`: the budget, the pixel floor's filtered events, no shake from an echo (Task 4) |
| `packages/client/src/features/delve/__tests__/arena-renderer.test.ts` | the budget, and no shake from an echo's hit or 360° slash (Task 4) |
| `packages/client/src/features/delve/training/frame-window.ts` (new) | `FrameWindow`: the 5 s window, `percentile` (Task 5) |
| `packages/client/src/features/delve/__tests__/frame-window.test.ts` (new) | the window and the percentile (Task 5) |
| `packages/client/src/features/delve/training/FrameChip.tsx` (new) | the dev readout (Task 6) |
| `packages/client/src/features/delve/__tests__/FrameChip.test.tsx` (new) | dev only; the p95 it shows (Task 6) |
| `packages/client/src/features/delve/training/TrainingBar.tsx` | `<FrameChip />` beside `<LabButton />` (Task 6) |

`pixel/arena-effects.ts` needs no edit: the budget is applied where the renderer hands the pixel floor its events (Task 4), so its `hit` case (`hitSpark`, Seedling's sprout) only sees picked hits. `sound-manager.ts` isn't in the overview's C3 list, but no other area names it; its change is additive (an optional argument), so the 85 other `playSound` callers are untouched.

## Cross-area needs

- **A:** the `hit` event's `echo?: true`, set at `landBlow`'s `echo` option and on an ability with `replay` (the contract). Every test here builds its events by hand, so C3 never waits on where A sets it, only on the type.
- **A:** the `slash` event's `echo?: true` too, set when a Strike's slash comes from an echo (the contract). A 360° slash shakes the screen (`addShake(0.12)`); Task 4 guards it.
- **A / B2:** an echo makes no `basic` or `cast` event today (`echoTick` calls `landBlow`, not `strike`, and `executeForm`, not `castAbility`), so `kickCamera`'s two calls never see one. The camera moves on an echo only through `addShake` in the `hit` case (a crit, a reaction) and the `slash` case (a 360° arc), all guarded here. If A or B2 makes an echo emit `basic` or `cast`, it must carry `echo: true` and the integrator routes one guard (`if (!e.echo)`) before that `kickCamera` call to C3.
- **D:** the spec's manual check (Echo III, Split III and Multi-shot III against 12 foes at 1920×1080, Effects at 100%, with and without the budget, read on the `FrameChip`) is D's (`08-finish.md`), as are the version bump and CLAUDE.md: "Mana-pixel FX" gains `HIT_FX_BUDGET` and `hitFxPicks` (real hits first, echoes from what's left, over it a number only) and that an echo hit never freezes or shakes and sounds at half volume; "Training Grounds" gains the dev `FrameChip` (p95 over 5 s) beside the DPS Lab button. If the check misses 16.7 ms, D lowers `HIT_FX_BUDGET` first.

## Where the spec left room

1. **"Per frame" is per `handleEvents` call.** `useArenaCore` calls `stepWorld` once a display frame (the sim steps inside it) and hands that frame's events to `renderer.handleEvents` once, so the budget resets with each call; no frame counter is needed.
2. **Every hit spends the budget, in sight or not.** The pixel floor draws hits out of sight too (off screen it simulates nothing anyway), and counting only in-sight hits would need the fog in a pure function. A hit out of sight that is picked draws nothing in the renderer, as today.
3. **"Its floating number and nothing else":** over the budget a hit keeps its number (within the existing 14 a frame) and a reaction's label (a floating text too); it loses the burst, the reaction's ring, the shake and the pixel floor's spark (and a Seedling's sprout). Sound is the per-sound throttle's, unchanged.
4. **An echo's shake:** the hit case's two shakes (a crit's, a reaction's) and a 360° slash's are skipped for an echo, as hit-stop is: "never a camera kick". Its haptic too (a crit echo doesn't buzz); its sound plays at `ECHO_GAIN`.
5. **The readout** samples its own `requestAnimationFrame` loop (the arena's loop lives in `useArenaCore`; a second rAF callback sees the same frame cadence), and re-renders twice a second (`SHOW_EVERY_MS`), never every frame.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `boons/c3`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell.
- **Line endings:** `hitstop.ts`, `arena-sounds.ts`, `mana-fx.ts`, `ArenaRenderer.ts` and `TrainingBar.tsx` are CRLF, `sound-manager.ts` LF; keep each file's own (the Edit tool does); new files are LF. Prettier only as `npx prettier --end-of-line auto --write <files>`.
- **How the edits read:** "In `f`:" names the file. "Replace:" (a block) "with:" (a block) is one Edit. "Create `f`:" is a Write. Within a file, apply its edits top to bottom.
- **The check** for every task: `cd packages/client && npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot`.

---

## Task 1: Echo hits never freeze the display

**Files:** `arena/fx/hitstop.ts`, `arena/fx/__tests__/hitstop.test.ts`.

- [ ] **Step 1: Write the failing test.** In `packages/client/src/features/delve/arena/fx/__tests__/hitstop.test.ts`:

Replace:
```ts
const hit = (heft: number, crit = false): ArpgEvent =>
  ({
    kind: 'hit',
    id: 1,
    x: 0,
    y: 0,
    amount: 1,
    crit,
    element: null,
    heft,
    source: 'basic',
  }) as ArpgEvent;
```
with:
```ts
const hit = (heft: number, crit = false, echo = false): ArpgEvent =>
  ({
    kind: 'hit',
    id: 1,
    x: 0,
    y: 0,
    amount: 1,
    crit,
    element: null,
    heft,
    source: 'basic',
    ...(echo ? { echo: true } : {}),
  }) as ArpgEvent;
```

Replace:
```ts
  it('freezes, then waits a gap before the next freeze', () => {
```
with:
```ts
  it('an echo hit never freezes, however heavy; the real hits beside it still do', () => {
    expect(hitstopMs([hit(1, true, true)])).toBe(0);
    expect(hitstopMs([hit(1, true, true), hit(0.5)])).toBe(45);
    const s = new HitStop();
    s.onEvents([hit(1, true, true)], 1000);
    expect(s.frozen(1001)).toBe(false);
  });

  it('freezes, then waits a gap before the next freeze', () => {
```

- [ ] **Step 2: Run it, expect FAIL.**

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/arena/fx/__tests__/hitstop.test.ts --reporter=dot)
```

Expected: FAIL, "an echo hit never freezes…": `expected 110 to be 0`.

- [ ] **Step 3: Implement.** In `packages/client/src/features/delve/arena/fx/hitstop.ts`:

Replace:
```ts
/** How long this frame's events freeze the display, in ms (0 = no freeze). */
export function hitstopMs(events: readonly ArpgEvent[]): number {
  let ms = 0;
  for (const e of events) {
    if (e.kind === 'hit' && e.heft >= HITSTOP.minHeft)
```
with:
```ts
/**
 * How long this frame's events freeze the display, in ms (0 = no freeze). An echo's hit never
 * freezes: a heavy echo would read as a second, weaker impact, not a second hit (spec §8).
 */
export function hitstopMs(events: readonly ArpgEvent[]): number {
  let ms = 0;
  for (const e of events) {
    if (e.kind === 'hit' && !e.echo && e.heft >= HITSTOP.minHeft)
```

- [ ] **Step 4: Run it, expect PASS.** The Step 2 command. Expected: PASS, every test in the file.

- [ ] **Step 5: Commit.**

```bash
git add packages/client/src/features/delve/arena/fx/hitstop.ts packages/client/src/features/delve/arena/fx/__tests__/hitstop.test.ts
git commit -m "feat(client): an echo hit never starts hit-stop" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: An echo hit sounds at half volume

**Files:** `shared/utils/sound-manager.ts`, `shared/utils/sound-manager.test.ts`, `arena/arena-sounds.ts`, `__tests__/arena-sounds.test.ts`.

- [ ] **Step 1: Write the failing tests.** In `packages/client/src/shared/utils/sound-manager.test.ts`:

Replace:
```ts
      // Expected: 0.7 * 0.5 * 0.5 = 0.175
      expect(mockVolume).toHaveBeenCalledWith(expect.closeTo(0.175, 3), expect.any(Number));
    });
```
with:
```ts
      // Expected: 0.7 * 0.5 * 0.5 = 0.175
      expect(mockVolume).toHaveBeenCalledWith(expect.closeTo(0.175, 3), expect.any(Number));
    });

    it('scales by the play’s gain: an echo’s hit at half', () => {
      const mgr = freshManager();
      mgr.loadFiles();
      mgr.setMasterVolume(0.5);
      mgr.setCategoryVolume('sfx', 0.5);
      mgr.play('orbConfirm', 0.5);
      expect(mockVolume).toHaveBeenCalledWith(expect.closeTo(0.0875, 4), expect.any(Number));
    });
```

In `packages/client/src/features/delve/__tests__/arena-sounds.test.ts`:

Replace:
```ts
  it("Obsidian's barrier breaks with a socket's pop", () => {
```
with:
```ts
  it("an echo's hit plays its sound at half volume and doesn't buzz", () => {
    const hit = {
      kind: 'hit',
      id: 1,
      x: 0,
      y: 0,
      amount: 5,
      element: null,
      heft: 1,
      source: 'basic',
      echo: true,
    } as const;
    playArenaEvents([
      { ...hit, crit: true },
      { ...hit, crit: false },
    ]);
    expect(playSound).toHaveBeenCalledWith('crit', ECHO_GAIN);
    expect(playSound).toHaveBeenCalledWith('attack', ECHO_GAIN);
    expect(ECHO_GAIN).toBe(0.5);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("Obsidian's barrier breaks with a socket's pop", () => {
```

Replace:
```ts
import { lootCues, noManaToaster, playArenaEvents } from '../arena/arena-sounds';
```
with:
```ts
import { ECHO_GAIN, lootCues, noManaToaster, playArenaEvents } from '../arena/arena-sounds';
```

- [ ] **Step 2: Run them, expect FAIL.**

```bash
(cd packages/client && npx tsc --noEmit -p . ; npx vitest run src/shared/utils/sound-manager.test.ts src/features/delve/__tests__/arena-sounds.test.ts --reporter=dot)
```

Expected: tsc errors (`Expected 1 arguments, but got 2` on `mgr.play`; `has no exported member 'ECHO_GAIN'`), and both new tests FAIL.

- [ ] **Step 3: Implement the gain.** In `packages/client/src/shared/utils/sound-manager.ts`:

Replace:
```ts
  /** Play a sound by name. Respects mute, volume, cooldowns, and pitch variation. */
  play(name: SoundName): void {
```
with:
```ts
  /**
   * Play a sound by name. Respects mute, volume, cooldowns, and pitch variation. `gain` scales
   * this play's volume (an echo's hit plays at half); the cooldown is the sound's, whatever the gain.
   */
  play(name: SoundName, gain = 1): void {
```

Replace:
```ts
    const effectiveVolume = entry.volume * this.masterVolume * this.categoryVolumes[entry.category];
```
with:
```ts
    const effectiveVolume =
      entry.volume * this.masterVolume * this.categoryVolumes[entry.category] * gain;
```

Replace:
```ts
/** Play a sound by name. Drop-in replacement for the old playSound. */
export function playSound(name: SoundName): void {
  soundManager.play(name);
}
```
with:
```ts
/** Play a sound by name, at `gain` × its volume. Drop-in replacement for the old playSound. */
export function playSound(name: SoundName, gain?: number): void {
  soundManager.play(name, gain);
}
```

- [ ] **Step 4: Implement the echo's sound.** In `packages/client/src/features/delve/arena/arena-sounds.ts`:

Replace:
```ts
/** A drop with a sound of its own: gear that is an upgrade as it comes (▲), or an essence. */
```
with:
```ts
/** An echo's hit plays its sound at this share of the volume, through the sound's own throttle. */
export const ECHO_GAIN = 0.5;

/** A drop with a sound of its own: gear that is an upgrade as it comes (▲), or an essence. */
```

Replace:
```ts
      case 'hit':
        playSound(ev.crit ? 'crit' : 'attack');
        if (ev.crit) vibrate('light');
        break;
```
with:
```ts
      case 'hit':
        // An echo's hit: quieter, and no buzz (spec §8).
        if (ev.echo) playSound(ev.crit ? 'crit' : 'attack', ECHO_GAIN);
        else {
          playSound(ev.crit ? 'crit' : 'attack');
          if (ev.crit) vibrate('light');
        }
        break;
```

- [ ] **Step 5: Run them, expect PASS.**

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/shared/utils/sound-manager.test.ts src/features/delve/__tests__/arena-sounds.test.ts --reporter=dot)
```

Expected: no type errors; PASS, both files (the existing "plays each event's sound" test still sees `playSound('crit')` with one argument for a real hit).

- [ ] **Step 6: Commit.**

```bash
git add packages/client/src/shared/utils/sound-manager.ts packages/client/src/shared/utils/sound-manager.test.ts packages/client/src/features/delve/arena/arena-sounds.ts packages/client/src/features/delve/__tests__/arena-sounds.test.ts
git commit -m "feat(client): an echo hit sounds at half volume through the same throttle" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: The hit fx budget's ordering

**Files:** `arena/fx/mana-fx.ts`, `arena/fx/__tests__/mana-fx.test.ts`.

- [ ] **Step 1: Write the failing test.** In `packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts`:

Replace:
```ts
import type { ArpgWorld } from '@alloy/engine';
import { HAND, ManaFx, finisherRing, spawnCount } from '../mana-fx';
```
with:
```ts
import type { ArpgEvent, ArpgWorld } from '@alloy/engine';
import { HAND, HIT_FX_BUDGET, ManaFx, finisherRing, hitFxPicks, spawnCount } from '../mana-fx';
```

Append at the end of the file:
```ts
describe('the hit fx budget', () => {
  const hit = (id: number, echo = false): ArpgEvent =>
    ({
      kind: 'hit',
      id,
      x: 0,
      y: 0,
      amount: 1,
      crit: false,
      element: null,
      heft: 0,
      source: 'basic',
      ...(echo ? { echo: true } : {}),
    }) as ArpgEvent;
  const ids = (s: Set<ArpgEvent>) => [...s].map((e) => (e as { id: number }).id);

  it('is 24 hit moments a frame', () => {
    expect(HIT_FX_BUDGET).toBe(24);
  });

  it('under the budget, every hit; nothing but hits', () => {
    const death = { kind: 'death', id: 9, x: 0, y: 0, monsterKind: 'normal', scrap: 0 } as ArpgEvent;
    expect(ids(hitFxPicks([hit(1), death, hit(2, true)]))).toEqual([1, 2]);
  });

  it('real hits first, in order, then echoes from what is left', () => {
    const echoes = [10, 11, 12].map((i) => hit(i, true));
    const real = [1, 2, 3].map((i) => hit(i));
    // Echoes first in the frame, yet the real hits take the budget.
    expect(ids(hitFxPicks([...echoes, ...real], 4))).toEqual([1, 2, 3, 10]);
    expect(ids(hitFxPicks([...echoes, ...real], 2))).toEqual([1, 2]);
    expect(hitFxPicks([...echoes, ...real], 0).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.**

```bash
(cd packages/client && npx tsc --noEmit -p . ; npx vitest run src/features/delve/arena/fx/__tests__/mana-fx.test.ts --reporter=dot)
```

Expected: tsc `has no exported member 'HIT_FX_BUDGET'` / `'hitFxPicks'`; the file FAILs.

- [ ] **Step 3: Implement.** In `packages/client/src/features/delve/arena/fx/mana-fx.ts`:

Replace:
```ts
import type { ManaType, MoveKind, Vec } from '@alloy/engine';
```
with:
```ts
import type { ArpgEvent, ManaType, MoveKind, Vec } from '@alloy/engine';
```

Replace:
```ts
const MAX_PARTICLES = 500;
```
with:
```ts
const MAX_PARTICLES = 500;

/**
 * Hit moments a frame (a hit's burst, ring and shake here, its spark on the pixel floor). The
 * caps above bound the totals; this bounds a frame, so a burst of echoes can't starve the next
 * real hit (spec §8). Tune it down first if the p95 frame misses 16.7 ms.
 */
export const HIT_FX_BUDGET = 24;

/**
 * The frame's hits that draw their moment, at most `budget`: the real hits first, in order, then
 * the echoes' (`echo`) from what is left. A hit left out draws its floating number only.
 */
export function hitFxPicks(
  events: readonly ArpgEvent[],
  budget = HIT_FX_BUDGET,
): Set<ArpgEvent> {
  const picked = new Set<ArpgEvent>();
  for (const echo of [false, true])
    for (const e of events) {
      if (picked.size >= budget) return picked;
      if (e.kind === 'hit' && !!e.echo === echo) picked.add(e);
    }
  return picked;
}
```

- [ ] **Step 4: Run it, expect PASS.** The Step 2 command with `&&`:

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/arena/fx/__tests__/mana-fx.test.ts --reporter=dot)
```

Expected: PASS, every test in the file.

- [ ] **Step 5: Commit.**

```bash
git add packages/client/src/features/delve/arena/fx/mana-fx.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts
git commit -m "feat(client): HIT_FX_BUDGET, real hits first and echoes from what is left" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: The renderer spends the budget; an echo never shakes (hits and slashes)

**Files:** `arena/ArenaRenderer.ts`, `__tests__/arena-renderer.test.ts`.

- [ ] **Step 1: Write the failing tests.** In `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`:

Replace:
```ts
import type { ManaFx } from '../arena/fx/mana-fx';
```
with:
```ts
import { HIT_FX_BUDGET, type ManaFx } from '../arena/fx/mana-fx';
```

Replace:
```ts
describe('a slain foe', () => {
```
with:
```ts
describe('hits under load', () => {
  afterEach(() => vi.restoreAllMocks());

  const hit = (id: number, echo: boolean, crit = false): ArpgEvent =>
    ({
      kind: 'hit',
      id,
      x: 13,
      y: 18,
      amount: 5,
      crit,
      element: null,
      heft: 1,
      source: 'basic',
      ...(echo ? { echo: true } : {}),
    }) as ArpgEvent;

  it('draw HIT_FX_BUDGET moments a frame, real hits first; the pixel floor gets only those', () => {
    const { r } = stage();
    const w = floor();
    show(r, w);
    const view = r as unknown as {
      fx: ManaFx;
      pixelFloor: { handleEvents: (e: readonly ArpgEvent[]) => void };
      floats: unknown[];
    };
    const burst = vi.spyOn(view.fx, 'burst');
    const sent = vi.spyOn(view.pixelFloor, 'handleEvents');
    const echoes = Array.from({ length: 20 }, (_, i) => hit(100 + i, true));
    const real = Array.from({ length: 20 }, (_, i) => hit(i, false));
    r.handleEvents([...echoes, ...real]);
    expect(burst).toHaveBeenCalledTimes(HIT_FX_BUDGET);
    const floorHits = sent.mock.calls[0][0].filter((e) => e.kind === 'hit');
    expect(floorHits).toHaveLength(HIT_FX_BUDGET);
    expect(floorHits.filter((e) => e.kind === 'hit' && !e.echo)).toHaveLength(20);
    // Every hit over the budget still floats its number (the frame's 14).
    expect(view.floats).toHaveLength(14);
  });

  afterEach(() => useUIStore.getState().setFx('shake', 1));

  it("an echo's crit doesn't shake the screen; a real one does", () => {
    useUIStore.getState().setFx('shake', 1);
    const { r } = stage();
    show(r, floor());
    const view = r as unknown as { shake: number };
    r.handleEvents([hit(1, true, true)]);
    expect(view.shake).toBe(0);
    r.handleEvents([hit(2, false, true)]);
    expect(view.shake).toBeGreaterThan(0);
  });

  it("an echo's 360° slash doesn't shake the screen; a real one does", () => {
    useUIStore.getState().setFx('shake', 1);
    const { r } = stage();
    show(r, floor());
    const view = r as unknown as { shake: number };
    const slash = {
      kind: 'slash',
      x: 13,
      y: 18,
      dir: { x: 1, y: 0 },
      range: 2,
      arc: 360,
      element: 'fire',
      heft: 1,
      infusion: null,
    } as const;
    r.handleEvents([{ ...slash, echo: true }]);
    expect(view.shake).toBe(0);
    r.handleEvents([slash]);
    expect(view.shake).toBeGreaterThan(0);
  });
});

describe('a slain foe', () => {
```

- [ ] **Step 2: Run it, expect FAIL.**

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts --reporter=dot)
```

Expected: FAIL, "draw HIT_FX_BUDGET moments…" (`expected "burst" to be called 24 times, but got 40 times`), "an echo's crit…" (`expected 0.05 to be +0`) and "an echo's 360° slash…" (`expected 0.12 to be +0`).

- [ ] **Step 3: Implement.** In `packages/client/src/features/delve/arena/ArenaRenderer.ts`:

Replace:
```ts
import { ManaFx, finisherRing } from './fx/mana-fx';
```
with:
```ts
import { ManaFx, finisherRing, hitFxPicks } from './fx/mana-fx';
```

Replace:
```ts
  handleEvents(events: ArpgEvent[]): void {
    const w = this.world;
    if (!w) return;
    this.pixelFloor?.handleEvents(events);
    let numbers = 0;
    for (const e of events) {
      switch (e.kind) {
        case 'hit': {
          // Out of sight, a hit shows nothing (its number would give the foe away).
          if (!inSight(w, e.x, e.y)) break;
          const color = elemColor(e.element);
          this.fx.burst(e.x, e.y, color, e.crit ? 7 : 3, e.crit ? 5 : 3);
          if (e.reaction) {
```
with:
```ts
  handleEvents(events: ArpgEvent[]): void {
    const w = this.world;
    if (!w) return;
    // The frame's hit moments (HIT_FX_BUDGET): real hits first, echoes from what is left. A hit
    // left out floats its number and nothing else, here or on the pixel floor.
    const fxHits = hitFxPicks(events);
    this.pixelFloor?.handleEvents(events.filter((e) => e.kind !== 'hit' || fxHits.has(e)));
    let numbers = 0;
    for (const e of events) {
      switch (e.kind) {
        case 'hit': {
          // Out of sight, a hit shows nothing (its number would give the foe away).
          if (!inSight(w, e.x, e.y)) break;
          const color = elemColor(e.element);
          const moment = fxHits.has(e);
          // An echo's hit never shakes the camera (spec §8), as it never freezes it.
          const shakes = moment && !e.echo;
          if (moment) this.fx.burst(e.x, e.y, color, e.crit ? 7 : 3, e.crit ? 5 : 3);
          if (e.reaction) {
```

Replace:
```ts
            this.fx.ring(e.x, e.y, 2.2, REACTION_HEX[e.reaction], false, 0.4);
            this.addShake(0.12);
          }
```
with:
```ts
            if (moment) this.fx.ring(e.x, e.y, 2.2, REACTION_HEX[e.reaction], false, 0.4);
            if (shakes) this.addShake(0.12);
          }
```

Replace:
```ts
          if (e.crit) this.addShake(0.05);
          break;
        }
        case 'heroHit':
```
with:
```ts
          if (e.crit && shakes) this.addShake(0.05);
          break;
        }
        case 'heroHit':
```

Replace:
```ts
          if (e.arc >= 360) this.addShake(0.12);
```
with:
```ts
          // An echo's Strike swings again, but doesn't shake the camera (spec §8).
          if (e.arc >= 360 && !e.echo) this.addShake(0.12);
```

- [ ] **Step 4: Run it, expect PASS.** The Step 2 command. Expected: no type errors; PASS, every test in the file.

- [ ] **Step 5: Run the arena's other fx tests** (the pixel floor's events still flow; `arena-effects.ts` unchanged):

```bash
(cd packages/client && npx vitest run src/features/delve/arena src/features/delve/__tests__/arena-renderer.test.ts src/features/delve/__tests__/arena-sounds.test.ts --reporter=dot)
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/__tests__/arena-renderer.test.ts
git commit -m "feat(client): hit moments draw from HIT_FX_BUDGET; an echo hit never shakes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: The frame window's percentile

**Files:** `training/frame-window.ts` (new), `__tests__/frame-window.test.ts` (new).

- [ ] **Step 1: Write the failing test.** Create `packages/client/src/features/delve/__tests__/frame-window.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FrameWindow } from '../training/frame-window';

describe('FrameWindow', () => {
  it('reads nothing until a frame is in', () => {
    expect(new FrameWindow().percentile(0.95)).toBeNull();
  });

  it('takes the nearest-rank percentile of the frames in it', () => {
    const w = new FrameWindow();
    for (let i = 1; i <= 100; i++) w.push(i * 10, i);
    expect(w.percentile(0.95)).toBe(95);
    expect(w.percentile(0.5)).toBe(50);
    expect(w.percentile(1)).toBe(100);
    const one = new FrameWindow();
    one.push(0, 7);
    expect(one.percentile(0.95)).toBe(7);
  });

  it('forgets frames older than its span (5 s)', () => {
    const w = new FrameWindow();
    w.push(0, 100); // a hitch, then 5 s of smooth frames past it
    for (let t = 16; t <= 5100; t += 16) w.push(t, 16);
    expect(w.percentile(1)).toBe(16);
    const short = new FrameWindow(1000);
    short.push(0, 50);
    short.push(999, 10);
    expect(short.percentile(1)).toBe(50);
    short.push(1001, 10);
    expect(short.percentile(1)).toBe(10);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.**

```bash
(cd packages/client && npx vitest run src/features/delve/__tests__/frame-window.test.ts --reporter=dot)
```

Expected: FAIL, `Failed to resolve import "../training/frame-window"`.

- [ ] **Step 3: Implement.** Create `packages/client/src/features/delve/training/frame-window.ts`:

```ts
/**
 * Frame times over the last `spanMs` (5 s), for the dev frame readout (`FrameChip`). A plain time
 * window: at most a few hundred frames, so a sort a read is nothing.
 */
export class FrameWindow {
  private at: number[] = [];
  private ms: number[] = [];

  constructor(private readonly spanMs = 5000) {}

  /** A frame that ended at `now` (ms) and took `frameMs`. */
  push(now: number, frameMs: number): void {
    this.at.push(now);
    this.ms.push(frameMs);
    while (this.at.length > 0 && this.at[0] < now - this.spanMs) {
      this.at.shift();
      this.ms.shift();
    }
  }

  /** The nearest-rank `p` percentile (0–1] of the frames in the window; null with none. */
  percentile(p: number): number | null {
    if (this.ms.length === 0) return null;
    const sorted = [...this.ms].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1))];
  }
}
```

- [ ] **Step 4: Run it, expect PASS.**

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__/frame-window.test.ts --reporter=dot)
```

Expected: no type errors; PASS, 3 tests.

- [ ] **Step 5: Commit.**

```bash
git add packages/client/src/features/delve/training/frame-window.ts packages/client/src/features/delve/__tests__/frame-window.test.ts
git commit -m "feat(client): FrameWindow, frame times over 5 s and their percentile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: FrameChip in the Training bar, dev builds only

**Files:** `training/FrameChip.tsx` (new), `__tests__/FrameChip.test.tsx` (new), `training/TrainingBar.tsx`.

- [ ] **Step 1: Write the failing test.** Create `packages/client/src/features/delve/__tests__/FrameChip.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { FrameChip } from '../training/FrameChip';

describe('FrameChip', () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /** Run the next animation frame at `t` ms. */
  const frame = (t: number) => act(() => frames.shift()!(t));

  it("in dev: the 95th-percentile frame time, refreshed twice a second", () => {
    render(<FrameChip />);
    expect(screen.getByTestId('training-frame')).toHaveTextContent('— ms p95');
    for (let i = 0; i <= 60; i++) frame(1000 + i * 10);
    expect(screen.getByTestId('training-frame')).toHaveTextContent('10.0 ms p95');
  });

  it('outside dev: nothing', () => {
    vi.stubEnv('DEV', false);
    render(<FrameChip />);
    expect(screen.queryByTestId('training-frame')).toBeNull();
    expect(frames).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.**

```bash
(cd packages/client && npx vitest run src/features/delve/__tests__/FrameChip.test.tsx --reporter=dot)
```

Expected: FAIL, `Failed to resolve import "../training/FrameChip"`.

- [ ] **Step 3: Implement.** Create `packages/client/src/features/delve/training/FrameChip.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { FrameWindow } from './frame-window';

/** How often the readout re-renders, in ms (never every frame). */
const SHOW_EVERY_MS = 500;

/**
 * The dev frame readout in the Training bar (spec §8): the 95th-percentile frame time over the
 * last 5 s, from `requestAnimationFrame` deltas. Nothing outside dev builds.
 */
export function FrameChip() {
  return import.meta.env.DEV ? <FrameReadout /> : null;
}

function FrameReadout() {
  const [p95, setP95] = useState<number | null>(null);
  useEffect(() => {
    const frames = new FrameWindow();
    let last: number | null = null;
    let shown = -Infinity;
    let id = 0;
    const tick = (now: number) => {
      if (last !== null) frames.push(now, now - last);
      last = now;
      if (now - shown >= SHOW_EVERY_MS && frames.percentile(0.95) !== null) {
        shown = now;
        setP95(frames.percentile(0.95));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <span
      className="k-well whitespace-nowrap px-3 py-0.5 text-[16px] text-[var(--k-text-2)]"
      title="95th-percentile frame time over the last 5 s (dev builds)"
      data-testid="training-frame"
    >
      {p95 === null ? '—' : p95.toFixed(1)} ms p95
    </span>
  );
}
```

Note on the test's numbers: the first frame (1000) only sets `last`; the second (1010) pushes 10 and, `shown` being `-Infinity`, shows "10.0" at once; later frames refresh it each 500 ms. So the first assertion before any frame reads "— ms p95" and after 61 frames "10.0 ms p95".

- [ ] **Step 4: Put it in the bar.** In `packages/client/src/features/delve/training/TrainingBar.tsx`:

Replace:
```tsx
import { LabButton } from '../lab/dev-routes';
```
with:
```tsx
import { LabButton } from '../lab/dev-routes';
import { FrameChip } from './FrameChip';
```

Replace:
```tsx
 * The Training Grounds' top bar (glass): "◂ Anvil", the depth and the meter, the DPS Lab (dev
 * builds), then Panel (`data-pad-journal`: the journal key and View press it) and Menu
```
with:
```tsx
 * The Training Grounds' top bar (glass): "◂ Anvil", the depth and the meter, the frame readout
 * and the DPS Lab (dev builds), then Panel (`data-pad-journal`: the journal key and View press it) and Menu
```

Replace:
```tsx
      <LabButton />
```
with:
```tsx
      <FrameChip />
      <LabButton />
```

- [ ] **Step 5: Run it, expect PASS** (with the bar's own tests, which now mount the chip):

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__/FrameChip.test.tsx src/features/delve/__tests__/frame-window.test.ts src/features/delve/__tests__/TrainingBar.test.tsx src/features/delve/__tests__/TrainingPanel.test.tsx src/pages/__tests__/DelveTraining.test.tsx --reporter=dot)
```

Expected: no type errors; PASS, 5 files: `FrameChip.test.tsx` (2), `frame-window.test.ts` (3), and `TrainingBar.test.tsx`, `TrainingPanel.test.tsx`, `DelveTraining.test.tsx` unchanged (they now mount the chip; jsdom's `requestAnimationFrame` runs it).

- [ ] **Step 6: The area's close.** The whole client suite and a lint of the touched files:

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
(cd packages/client && npx eslint src/features/delve/arena/fx/hitstop.ts src/features/delve/arena/fx/mana-fx.ts src/features/delve/arena/ArenaRenderer.ts src/features/delve/arena/arena-sounds.ts src/shared/utils/sound-manager.ts src/features/delve/training/FrameChip.tsx src/features/delve/training/frame-window.ts src/features/delve/training/TrainingBar.tsx)
```

Expected: the base count plus 14 tests (Task 1: 1, Task 2: 2, Task 3: 3, Task 4: 3, Task 5: 3, Task 6: 2), all passing; no lint errors. The E2E (`delve-training*.spec.ts` sees the chip only in dev, which Playwright's dev server is) runs in D.

- [ ] **Step 7: Commit.**

```bash
git add packages/client/src/features/delve/training/FrameChip.tsx packages/client/src/features/delve/__tests__/FrameChip.test.tsx packages/client/src/features/delve/training/TrainingBar.tsx
git commit -m "feat(client): FrameChip, the p95 frame time in the Training bar (dev builds)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
