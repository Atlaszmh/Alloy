# Delve quests · Phase C · C2: HUD, toasts and banking — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quest progress reaches the player mid-dive: the store diffs `profile.quests` on every save and queues "Objective done: …" and "Quest complete: … · claim at the Anvil" into its `notices` (one place, every path: a bank, a floor's clear, the Anvil's ops); the dive banks pending quest events, throttled by `BANK_EVERY`, so the HUD's quest tracker moves at each bank; and the pause's "Anvil · floor restarts" banks what waits first, as Abandon already does.

**Architecture:** `questNotices(defs, was, now)` in `stores/delveStore.ts` (beside `fixNotices` and `overtakeNotice`) is a pure diff of two `ProfileQuests`: main and side quests by `progress[id]` against `quests.json`'s defs, contracts by id on the board. The store's `commit`, which `setProfile` and every action go through, calls it and appends to `notices`; `useDelveNotices` already turns `notices` into toasts on the Anvil and the run. `banksNow` (`arena/useArena.ts`) counts `pending.questEvents` with the throttled pickups. `DelveRun`'s `toAnvil` calls the arena's `flush` before it navigates. The tracker (`quests/QuestTracker.tsx`) needs no code: Phase A's `useQuests` reads `questStates` for the stored profile, so each bank's `setProfile` re-renders it; a page test pins that.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, Vitest 3 (jsdom, Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-03-delve-quests-design.md`: "Quest events (the engine)" → "Notices" and "Progress always counts"; "The client" → "Other screens" (HUD tracker, Toasts); "Phases and parallel areas" (the C2 row); "Tests" → Client (HUD, Toasts). The contract is `01-contract.md` in this folder; the overview `00-overview.md`.

---

## Base

- **Starts from:** `quest/main` at `7bc2d20` (Phase A merged: the types, save v9, `WorldPending.questEvents`, the stubs, the store's quest actions, `useQuests` on `questStates` through `questView`), in this area's worktree `C:/Projects/alloy-quest-c2` on branch `quest/c2`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-quest-c2 -Branch quest/c2 -Base quest/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-quest-c2` in Git Bash.
- **Needs nothing from B.** Every test here builds `profile.quests` by hand or mocks `questStates` (B1's), so the area runs on Phase A's stubs. With B1 and B2 merged the same code serves the real progress: the diff reads only `profile.quests`' shape (A's `ProfileQuests`) and `quests.json`'s defs.
- **Anchors:** every edit was generated from, and checked against, a scratch copy of `quest/main` at `ffa0194` with `01-contract.md`'s 109 edits applied, whose `packages/client/src` and `packages/engine/src` are identical to `quest/main` at `7bc2d20` (checked file by file): applied in this plan's order, task by task, they give exactly the files the tests below ran on.
- **Before Task 1:** build the engine once for the client's junction, and measure the client:

```bash
cd /c/Projects/alloy-quest-c2
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the client suite reads **1224 tests in 152 files** (Phase A's end). Call them **M** tests in **G** files.

## Files

| File | Change |
|---|---|
| `packages/client/src/stores/delveStore.ts` | `questNotices`: the quest diff as toast texts; `commit` appends them to `notices` |
| `packages/client/src/stores/quest-notices.test.ts` (new) | the diff (objective done, quest complete, state credit, nothing new, contracts by id) and the store queueing it on a save |
| `packages/client/src/features/delve/arena/useArena.ts` | `banksNow` banks `pending.questEvents` at most every `BANK_EVERY`; `flush`'s doc names the pause's Anvil |
| `packages/client/src/features/delve/__tests__/arena-bank.test.ts` | quest events bank on the throttle |
| `packages/client/src/pages/DelveRun.tsx` | `toAnvil` flushes the floor's pending banks before it navigates |
| `packages/client/src/pages/__tests__/DelveRun.test.tsx` | the Anvil flushes; the tracker moves at each bank and a quest done toasts (`questStates` mocked) |

`packages/client/src/features/delve/quests/QuestTracker.tsx` and `arena/hud/FloorColumn.tsx` are **not edited**: Phase A's `useQuests` (in `DelveRun`) maps `questStates(registry, profile)` for the stored profile, so the tracker's counts and bars follow every `setProfile`, a bank's included. Task 4 pins it.

## Cross-area needs

None of these edits another area's file; they are what C2 relies on, for the integrator to check at merge.

**X1 · B1 (`delve/dive.ts` `bankWorld`, `arpg/world.ts`).** `bankWorld` empties `world.pending.questEvents` once it has applied them (Phase A's contract: "bankWorld applies and clears"). Otherwise `banksNow` sees them again and the dive banks every `BANK_EVERY` for the rest of the floor (a save write each time, never a double count, since B1 applies them once; but the throttle would run flat out).

**X2 · B1 (`delve/quests.ts`).** The diff reads `profile.quests` as A defines it, and assumes what the spec says: `progress[id][i]` is objective `i` of the quest's def; a contract's progress lives on its board entry (`board[k].progress`, objective `i` of `board[k].objectives`); `done` stays true once set (a `dive` reset lowers `value`, never `done`); claiming leaves a quest's `progress` as it was, or removes it, either of which says nothing. A quest unlocked already done (state credit: an earlier bind, a deep player) toasts "Quest complete" at once, which is the point.

**X3 · D (`CLAUDE.md`, Delve section).** One line for the quests paragraph D writes: "The store diffs `profile.quests` on every save (`questNotices` in `stores/delveStore.ts`, called in its `commit`): an objective newly done queues "Objective done: <text>", a quest whose last one is "Quest complete: <name> · claim at the Anvil" (instead of its objectives); `useDelveNotices` shows them. The dive banks pending quest events with the throttled pickups (`banksNow`, `BANK_EVERY`), so the HUD tracker moves at each bank, and the pause's Anvil flushes them first, as Abandon does."

**X4 · E2E (C1 / D).** Nothing here needs a new E2E. A real dive's toast and tracker motion need B1's emission and B2's content: with both merged, the spec's E2E ("complete First Steps in a dive, claim it at the Anvil") can also assert the toast `Quest complete: First Steps · claim at the Anvil` on the run page and the tracker's `tracked-first_steps` reading done before the claim.

## Where the spec left room

1. **One place: `commit`, not only `setProfile`.** The spec says "before and after each `setProfile`". In the store every save goes through `commit` (`setProfile` is `commit`; every action's `applyResult`, `startDive`, `closeDive`, `salvage`… call it), so the diff sits there and covers the Anvil's ops (a forge, a bind, a refine) as well as the run's `setProfile` calls (a bank, a floor's clear, a door, an extract). `resetProfile` clears `notices` after its commit, so a new save never toasts.
2. **The texts.** "Objective done: <the objective's text>" per objective newly done; "Quest complete: <the quest's name> · claim at the Anvil" when its last objective is done, **instead of** that save's objective notices (one toast for the moment a single-objective quest finishes, not two). The spec's "Quest complete: claim at the Anvil" gains the name, so two quests finishing on one bank read apart.
3. **The diff's inputs.** `questNotices(defs, was, now)` takes `quests.json`'s main and side defs (`getQuestsData().quests`), not the registry, so its tests use fixture quests and never call the engine; contracts carry their own name and objective texts on the board and are matched by id (a rerolled or new contract is a new id with nothing done; a claimed one has left the board).
4. **Kills now bank on the throttle.** Before, a kill alone waited for the next bank. With B1 every kill pushes a `kill` quest event, so a fight banks at most every `BANK_EVERY` (0.08 s), the same bound materials and scrap already have; `pending.kills` alone still waits.
5. **The Anvil's flush banks everything pending**, as Abandon's does (items, runes, the haul, quest events): the floor restarts on return, and what was picked up in the last 80 ms is kept rather than lost. The pause's caption "This floor's unbanked haul is lost" now describes drops still lying on the floor; it is 3D's file (`hub/PauseScreen.tsx`) and left as is.

## Conventions

The overview's shared conventions, as Phase A's plan states them. In short:
- **One commit per task** on `quest/c2`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-quest-c2`.
- **Line endings:** the worktree's files are CRLF (`core.autocrlf`); keep each file's own (the Edit tool does); new files are LF. Prettier runs as `npx prettier --end-of-line auto`; every file this plan edits passes `prettier --check --end-of-line auto` at the base, and the code below is already formatted, so `--write` changes nothing if typed as written.
- **How the edits read:** "Replace: A with: B" is one Edit (old A, new B). "Create `f`:" is a Write. Within a file, apply its edits top to bottom; every anchor is unique in its file at that point.
- **No engine change.** The client follows the bundle built before Task 1; no task rebuilds it.
- **Every task runs the whole client suite** (about 40 s) and its typecheck. Vitest doesn't type-check tests.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(pnpm -F @alloy/client build)` |

---

## Chunk 1: Notices, banking and the tracker

### Task 1: The store's quest notices

The store diffs `profile.quests` on every save and queues the toasts.

**Files:**
- Create: `packages/client/src/stores/quest-notices.test.ts`
- Modify: `packages/client/src/stores/delveStore.ts`

- [ ] **Step 1: The failing test**

Create `packages/client/src/stores/quest-notices.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  emptyQuests,
  type Contract,
  type Objective,
  type ObjectiveProgress,
  type ProfileQuests,
  type QuestDef,
} from '@alloy/engine';
import { getDelveRegistry } from '@/features/delve/registry';
import { questNotices, useDelveStore } from './delveStore';

// See the quests spec's Notices: the store diffs `profile.quests` on every save.

const registry = getDelveRegistry();
const objective = (id: string, text: string): Objective => ({
  id,
  type: 'perfectDodge',
  count: 3,
  scope: 'total',
  text,
});
const WARDEN: QuestDef = {
  id: 'warden',
  kind: 'main',
  name: 'The Warden',
  line: 'A line.',
  objectives: [objective('boss', 'Beat the boss'), objective('forge', 'Forge a legendary')],
  rewards: [{ kind: 'scrap', count: 10 }],
};
const DODGER: QuestDef = {
  ...WARDEN,
  id: 'dodger',
  kind: 'side',
  name: 'Dodger',
  objectives: [objective('dodge', 'Dodge 3 times')],
};
const DEFS = [WARDEN, DODGER];
const at = (value: number, done = false): ObjectiveProgress => ({ value, done });
const quests = (over: Partial<ProfileQuests> = {}): ProfileQuests => ({
  ...emptyQuests(registry),
  ...over,
});
const contract = (id: string, progress: ObjectiveProgress[]): Contract => ({
  id,
  template: 'cull',
  tier: 'easy',
  name: 'Cull',
  line: 'A line.',
  objectives: [objective('kill', 'Slay 3 elites')],
  rewards: [{ kind: 'scrap', count: 30 }],
  progress,
});

describe('questNotices', () => {
  it('an objective newly done reads "Objective done", with its text', () => {
    const was = quests({ progress: { warden: [at(0), at(0)] } });
    const now = quests({ progress: { warden: [at(3, true), at(0)] } });
    expect(questNotices(DEFS, was, now)).toEqual(['Objective done: Beat the boss']);
  });

  it('a quest whose last objective is done reads "Quest complete" once, not its objectives', () => {
    const was = quests({ progress: { warden: [at(3, true), at(0)], dodger: [at(1)] } });
    const now = quests({ progress: { warden: [at(3, true), at(3, true)], dodger: [at(3, true)] } });
    expect(questNotices(DEFS, was, now)).toEqual([
      'Quest complete: The Warden · claim at the Anvil',
      'Quest complete: Dodger · claim at the Anvil',
    ]);
  });

  it('a quest unlocked already done (an earlier bind, a deep player) is complete at once', () => {
    const now = quests({ progress: { dodger: [at(3, true)] } });
    expect(questNotices(DEFS, quests(), now)).toEqual([
      'Quest complete: Dodger · claim at the Anvil',
    ]);
  });

  it('progress short of done, a dive reset, a claim or the same quests say nothing', () => {
    const was = quests({ progress: { warden: [at(3, true), at(1)], dodger: [at(1)] } });
    const now = quests({ progress: { warden: [at(0, true), at(2)], dodger: [at(2)] } });
    expect(questNotices(DEFS, was, now)).toEqual([]);
    expect(questNotices(DEFS, now, now)).toEqual([]);
    const done = quests({ progress: { dodger: [at(3, true)] } });
    expect(questNotices(DEFS, done, { ...done, claimed: ['dodger'] })).toEqual([]);
  });

  it("the board's contracts, by id: a new, rerolled or claimed contract says nothing until one is done", () => {
    const was = quests({
      board: [contract('contract:1', [at(2)]), contract('contract:2', [at(0)]), null],
    });
    const now = quests({
      board: [contract('contract:1', [at(3, true)]), null, contract('contract:3', [at(0)])],
    });
    expect(questNotices(DEFS, was, now)).toEqual(['Quest complete: Cull · claim at the Anvil']);
    expect(questNotices(DEFS, now, quests({ board: [null, null, null] }))).toEqual([]);
  });
});

describe("the store's quest notices", () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(7, 'fire');
  });

  it('queues them on every save (a bank is a save) and hands them over once', () => {
    const first = registry.getQuestsData().quests[0];
    /** Save the first quest's every objective at `value`. */
    const save = (value: number, done: boolean) => {
      const { profile } = useDelveStore.getState();
      const progress = {
        ...profile.quests.progress,
        [first.id]: first.objectives.map(() => at(value, done)),
      };
      useDelveStore.getState().setProfile({ ...profile, quests: { ...profile.quests, progress } });
    };
    save(0, false);
    useDelveStore.getState().takeNotices();
    save(1, false);
    expect(useDelveStore.getState().notices).toEqual([]);
    save(first.objectives[0].count, true);
    expect(useDelveStore.getState().takeNotices()).toEqual([
      `Quest complete: ${first.name} · claim at the Anvil`,
    ]);
    save(first.objectives[0].count, true);
    expect(useDelveStore.getState().notices).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/stores/quest-notices.test.ts)`
Expected: FAIL, 6 of 6: the five `questNotices` tests with `TypeError: (0 , questNotices) is not a function`, and the store's with `AssertionError: expected [] to deeply equal [ Array(1) ]` (the store queues nothing yet).

- [ ] **Step 3: The diff, and `commit` queueing it**

In `packages/client/src/stores/delveStore.ts`:

Replace:

```ts
  type ProfileActionResult,
  type Rarity,
```

with:

```ts
  type ProfileActionResult,
  type ProfileQuests,
  type QuestDef,
  type Rarity,
```

Replace:

```ts
/** The Anvil builder's unapplied edits (session only): one weapon's, under one pair. */
```

with:

```ts
/**
 * What quest progress gained between two saves, as toasts (see the quests spec's Notices): "Quest
 * complete: <name> · claim at the Anvil" for a quest whose last objective is newly done, else
 * "Objective done: <text>" for each objective newly done. `defs` are the main and side quests
 * (`getQuestsData().quests`); a contract on the board carries its own name and texts.
 */
export function questNotices(
  defs: readonly QuestDef[],
  was: ProfileQuests,
  now: ProfileQuests,
): string[] {
  if (was === now) return [];
  const quests = [
    ...defs.map((q) => ({ ...q, progress: now.progress[q.id], before: was.progress[q.id] })),
    ...now.board.flatMap((c) =>
      c ? [{ ...c, before: was.board.find((b) => b?.id === c.id)?.progress }] : [],
    ),
  ];
  const notices: string[] = [];
  for (const { name, objectives, progress, before } of quests) {
    const done = objectives.filter((_, i) => progress?.[i]?.done && !before?.[i]?.done);
    if (done.length === 0) continue;
    if (progress.every((p) => p.done)) notices.push(`Quest complete: ${name} · claim at the Anvil`);
    else for (const o of done) notices.push(`Objective done: ${o.text}`);
  }
  return notices;
}

/** The Anvil builder's unapplied edits (session only): one weapon's, under one pair. */
```

Replace:

```ts
    set(kept ? { profile, ...floor } : { profile, ...floor, chainDraft: null });
```

with:

```ts
    // Quest progress that finished an objective or a quest becomes a toast, whichever op saved it
    // (a bank included).
    const done = prev
      ? questNotices(getDelveRegistry().getQuestsData().quests, prev.profile.quests, profile.quests)
      : [];
    const notices = done.length > 0 ? { notices: [...prev.notices, ...done] } : {};
    set(
      kept
        ? { profile, ...floor, ...notices }
        : { profile, ...floor, ...notices, chainDraft: null },
    );
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: the Step 2 command.
Expected: PASS, 6 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 6 tests in G + 1 files pass (1230 in 153).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-c2
(cd packages/client && npx prettier --write --end-of-line auto src/stores/delveStore.ts src/stores/quest-notices.test.ts)
git add packages/client/src/stores/delveStore.ts packages/client/src/stores/quest-notices.test.ts
git commit -m "feat(client): quest progress toasts from the store's diff on every save" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: The dive banks quest events

`banksNow` counts `pending.questEvents` with the throttled pickups, so the tracker moves as a fight goes.

**Files:**
- Modify: `packages/client/src/features/delve/arena/useArena.ts`, `packages/client/src/features/delve/__tests__/arena-bank.test.ts`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/arena-bank.test.ts`:

Replace:

```ts
    expect(banksNow(pending({ kills: 3 }), 10)).toBe(false);
  });
```

with:

```ts
    expect(banksNow(pending({ kills: 3 }), 10)).toBe(false);
  });

  it('banks quest events at most every BANK_EVERY seconds too, so the HUD tracker moves as they come', () => {
    const dodge = pending({ questEvents: [{ type: 'perfectDodge' }] });
    expect(banksNow(dodge, BANK_EVERY / 2)).toBe(false);
    expect(banksNow(dodge, BANK_EVERY)).toBe(true);
    const kill = { type: 'kill', kind: 'normal', biome: 'cinder_mines', element: 'fire' } as const;
    expect(banksNow(pending({ kills: 1, questEvents: [kill] }), BANK_EVERY)).toBe(true);
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-bank.test.ts)`
Expected: FAIL, 1 of 5: `banks quest events at most every BANK_EVERY seconds too, …`: `AssertionError: expected false to be true // Object.is equality`.

- [ ] **Step 3: `banksNow` and `flush`'s doc**

In `packages/client/src/features/delve/arena/useArena.ts`:

Replace:

```ts
 * seen as it comes); materials and scrap (the floor's haul, which the purse and the Found log show
 * as it grows) at most every `BANK_EVERY`, since each bank writes the save and re-renders the run.
 * Kills alone wait for the next. The floor's end, a death and an abandon bank whatever waits.
 */
export function banksNow(pending: WorldPending, since: number): boolean {
  const { items, reactions, runes, patterns, haul, scrap } = pending;
```

with:

```ts
 * seen as it comes); materials and scrap (the floor's haul, which the purse and the Found log show
 * as it grows) and quest events (a kill, a perfect dodge: the HUD tracker moves at each bank) at
 * most every `BANK_EVERY`, since each bank writes the save and re-renders the run. A kill count
 * alone waits for the next. The floor's end, a death, an abandon and the pause's Anvil bank
 * whatever waits.
 */
export function banksNow(pending: WorldPending, since: number): boolean {
  const { items, reactions, runes, patterns, haul, scrap, questEvents } = pending;
```

Replace:

```ts
    scrap + haul.dust + haul.links > 0 ||
```

with:

```ts
    scrap + haul.dust + haul.links + questEvents.length > 0 ||
```

Replace:

```ts
  /** Bank whatever the floor under way picked up since the last bank (before an abandon settles it). */
```

with:

```ts
  /**
   * Bank whatever the floor under way picked up since the last bank (before an abandon settles it,
   * or the pause's Anvil restarts the floor).
   */
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: the Step 2 command.
Expected: PASS, 5 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 7 tests in G + 1 files pass (1231 in 153).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-c2
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/useArena.ts src/features/delve/__tests__/arena-bank.test.ts)
git add packages/client/src/features/delve/arena/useArena.ts packages/client/src/features/delve/__tests__/arena-bank.test.ts
git commit -m "feat(client): the dive banks quest events on the BANK_EVERY throttle" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: The pause's Anvil banks first

"Anvil · floor restarts" flushes the floor's pending banks before it leaves, as Abandon does, so quest progress made in the last moments counts (decision 3).

**Files:**
- Modify: `packages/client/src/pages/DelveRun.tsx`, `packages/client/src/pages/__tests__/DelveRun.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/pages/__tests__/DelveRun.test.tsx`:

Replace:

```ts
    fireEvent.click(screen.getByRole('button', { name: 'Anvil' }));
    expect(screen.getByTestId('anvil')).toBeInTheDocument();
    expect(useDelveStore.getState().profile.dive).not.toBeNull();

    cleanup();
```

with:

```ts
    fireEvent.click(screen.getByRole('button', { name: 'Anvil' }));
    expect(screen.getByTestId('anvil')).toBeInTheDocument();
    expect(useDelveStore.getState().profile.dive).not.toBeNull();
    // The floor restarts on the way back: what it picked up since the last bank banks first.
    expect(seen.calls).toEqual(['flush']);

    seen.calls.length = 0;
    cleanup();
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx)`
Expected: FAIL, 1 of 11: `the pause's Anvil goes to the Anvil keeping the dive; …`: `AssertionError: expected [] to deeply equal [ 'flush' ]`.

- [ ] **Step 3: `toAnvil` flushes**

In `packages/client/src/pages/DelveRun.tsx`:

Replace:

```ts
  const toAnvil = useCallback(() => navigate('/delve'), [navigate]);
```

with:

```ts
  /** The floor restarts when the dive resumes: what it picked up since the last bank banks first. */
  const toAnvil = useCallback(() => {
    arenaRef.current?.flush();
    navigate('/delve');
  }, [navigate]);
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: the Step 2 command.
Expected: PASS, 11 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 7 tests in G + 1 files pass (1231 in 153).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-c2
(cd packages/client && npx prettier --write --end-of-line auto src/pages/DelveRun.tsx src/pages/__tests__/DelveRun.test.tsx)
git add packages/client/src/pages/DelveRun.tsx packages/client/src/pages/__tests__/DelveRun.test.tsx
git commit -m "feat(client): the pause's Anvil banks the floor's pickups before the floor restarts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: The tracker moves at each bank

The run page end to end: a bank's `setProfile` moves the HUD tracker's count and bar, and the bank that finishes the quest checks it off and toasts. `questStates` is B1's, so the test mocks it to read the save's progress. No source changes: the test passes at once on Phase A's `useQuests` and Task 1's notices, and pins them.

**Files:**
- Modify: `packages/client/src/pages/__tests__/DelveRun.test.tsx`

- [ ] **Step 1: The test**

In `packages/client/src/pages/__tests__/DelveRun.test.tsx`:

Replace:

```ts
import { createDelveProfile, settleDive, startDive, type DelveProfile } from '@alloy/engine';
```

with:

```ts
import {
  createDelveProfile,
  questStates,
  settleDive,
  startDive,
  type DelveProfile,
  type QuestState,
} from '@alloy/engine';
```

Replace:

```ts
  return {
    ...real,
    settleDive: vi.fn(
```

with:

```ts
  return {
    ...real,
    // The engine's quests are B1's: each test says what the HUD tracker reads.
    questStates: vi.fn((): QuestState[] => []),
    settleDive: vi.fn(
```

Replace:

```ts
    seen.calls.length = 0;
    const registry = getDelveRegistry();
```

with:

```ts
    seen.calls.length = 0;
    vi.mocked(questStates).mockImplementation(() => []);
    const registry = getDelveRegistry();
```

Replace:

```ts
    expect(screen.getByText('Pattern learned: Maul')).toBeInTheDocument();
  });
```

with:

```ts
    expect(screen.getByText('Pattern learned: Maul')).toBeInTheDocument();
  });

  it('the HUD tracker moves as the dive banks, and the bank that finishes a quest toasts it', () => {
    const first = getDelveRegistry().getQuestsData().quests[0];
    const { count } = first.objectives[0];
    // `questStates` as the tracker reads it: the first quest, tracked, its progress the save's.
    vi.mocked(questStates).mockImplementation((_registry, p: DelveProfile) => [
      {
        id: first.id,
        kind: first.kind,
        status: 'active',
        isNew: false,
        tracked: true,
        name: first.name,
        line: first.line,
        objectives: first.objectives.map((o, i) => ({
          id: o.id,
          text: o.text,
          count: o.count,
          ...(p.quests.progress[first.id]?.[i] ?? { value: 0, done: false }),
        })),
        rewards: [],
      },
    ]);
    /** A bank: the save's progress on each of the first quest's objectives. */
    const bank = (value: number, done: boolean) =>
      act(() => {
        const s = useDelveStore.getState();
        const progress = { [first.id]: first.objectives.map(() => ({ value, done })) };
        s.setProfile({ ...s.profile, quests: { ...s.profile.quests, progress } });
      });
    bank(0, false);
    renderRun();
    const tracked = () => screen.getByTestId(`tracked-${first.id}`);
    expect(tracked()).toHaveTextContent(`0 / ${count}`);
    bank(1, false);
    expect(tracked()).toHaveTextContent(`1 / ${count}`);
    expect(within(tracked()).getAllByRole('progressbar')[0]).toHaveAttribute('aria-valuenow', '1');
    bank(count, true);
    expect(within(tracked()).getAllByRole('img', { name: 'Done' })).toHaveLength(
      first.objectives.length,
    );
    expect(
      screen.getByText(`Quest complete: ${first.name} · claim at the Anvil`),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx)`
Expected: PASS, 12 tests. (Without Task 1's `commit` diff, the new test fails on its last line: `Unable to find an element with the text: Quest complete: First Steps · claim at the Anvil`.)

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 8 tests in G + 1 files pass (1232 in 153).

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/alloy-quest-c2
(cd packages/client && npx prettier --write --end-of-line auto src/pages/__tests__/DelveRun.test.tsx)
git add packages/client/src/pages/__tests__/DelveRun.test.tsx
git commit -m "test(client): the HUD quest tracker moves at each bank, and a quest done toasts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

After Task 4, from the worktree root:

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
(pnpm -F @alloy/client build)
git status --short
```

Expected: no type errors; the client suite **M + 8 tests in G + 1 files** (1232 in 153); the client build succeeds; `git status` shows nothing but the three untracked `docs/superpowers/plans/2026-05-01-*.md` if they are in this worktree. Four commits on `quest/c2`. No engine file changed, so the engine suite and the pacing rails are untouched.

**After B1 and B2 merge** (the integrator, on `quest/main`): rebuild the bundle and re-run the client suite; nothing here should change, since every C2 test builds its quests by hand or mocks `questStates`. Elsewhere, a client test that asserts the exact `notices` after an op could now also see a quest toast (an op that completes a board contract or First Steps on a new save); none does at `7bc2d20` (the overtake, realign and reset tests start no quest that their ops finish), but a failure of that kind is the diff working, and the test should take its notices first. Then a manual check in a dive (or the E2E of X4): reach depth 2 on a new save, see "Quest complete: First Steps · claim at the Anvil" as a toast and the tracker's objective checked, before any claim.
