# Delve quests · B1: quest events and progress — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill in the quests' engine half that Phase A left as stubs in `delve/quests.ts`, and emit every quest event. That means objectives advance from engine events (sum, max and state, `total` and `dive` scope, capped, latching), unlocks run (the main chain, side conditions, state credit), and the journal's view, tracking, NEW and claims work. Kills, reactions, perfect dodges, floors, bosses, depths, extracts, forges, refines, binds, sockets and patterns all count. Progress always counts (each bank applies it, before any death settles), and the Training Grounds count nothing.

**Architecture:** One pure function, `applyQuestEvents(registry, profile, events)`, advances every unlocked, unclaimed quest's objectives and every board contract's (their progress lives on the board entry). It reads each type's progress mode from Phase A's `OBJECTIVE_RULES`, re-reads the state types (`reachDepth`'s `bestDepth`, `bind`, `knowPatterns`, `discoverReaction`) from the profile on every call, then runs the unlocks: a new quest's state types are credited at once, and a new main quest takes the tracked slot of the quest it comes after. `resetDiveQuests` zeroes unfinished `dive`-scoped objectives at a dive's start and settle. During a dive the arena pushes events into `WorldPending.questEvents` under `!world.sandbox`, and sets the floor flags `potionDrunk` / `hurt`. `bankWorld` applies the events and clears them. The dive ops and the Anvil ops call `applyQuestEvents` themselves, so no op's result type changes. `questStates` is the journal's data view, and `claimQuest` goes through Phase A's `grantRewards`.

**Tech Stack:** TypeScript 5.7, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-03-delve-quests-design.md` (authoritative): "The quest model" (the objective table, scope, state types, unlocks, claiming, tracking, seen), "Quest events (the engine)", "Tests → Engine", and "Phases and parallel areas" (the B1 row). Phase A's plan `01-contract.md` lays the contract this builds on. The overview is `00-overview.md`.

---

## Base

- **Starts from:** `quest/main` at `d61d7b4` (Phase A, B2, C1 and C2 merged; none of them touch this plan's files), in this area's worktree `C:/Projects/alloy-quest-b1` on branch `quest/b1`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-quest-b1 -Branch quest/b1 -Base quest/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-quest-b1` in Git Bash.
- **Anchors:** every edit was generated from `quest/main` at `7bc2d20` and checked again at `d61d7b4` (this plan's files are the same at both). Applied in this plan's order, task by task, they give exactly the files the tests below were run on (see "Checked on a scratch copy").
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-quest-b1
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines, and no type errors. The client suite reads **1244 tests in 153 files**; the engine suite reads **1809 passed | 5 skipped** tests in **101 passed | 1 skipped** files (the pacing rails included). Each task below gives its expected totals.

## Files

| File | Change |
|---|---|
| `packages/engine/src/delve/quests.ts` | `applyQuestEvents` (matching, sum / max / state, the cap, latching, unlocks with state credit and the main quest's tracked slot), `resetDiveQuests` (new), `questStates`, `trackQuest`, `markQuestSeen`, `claimQuest` past the dive lock; `emptyQuests` and `grantRewards` unchanged |
| `packages/engine/src/arpg/combat.ts` | `killMonster`: a `kill` event under its sandbox guard (bosses excluded); `noteReaction`: a `reaction` event per reaction; `hurtHero`: `world.hurt` once damage gets through |
| `packages/engine/src/arpg/dodge.ts` | `notePerfect`: a `perfectDodge` event |
| `packages/engine/src/arpg/step.ts` | `world.potionDrunk` where a potion is drunk |
| `packages/engine/src/delve/dive.ts` | `startDive` (the dive-scope reset, `reachDepth`), `bankWorld` (applies and clears the events), `completeFloor` (`clearFloor` with the flags, `boss` when the boss fell), `chooseDoor` (`reachDepth`), `extractDive` (`extract`, before its settle), `settleDive` (the dive-scope reset, before the refill) — hand-edited, never formatted |
| `packages/engine/src/delve/crafting.ts` | `forge` (`forge` with the item's rarity), `refine` (`refine`) |
| `packages/engine/src/delve/pair.ts` | `bindSecondary` (`bind`: a state, re-read) |
| `packages/engine/src/delve/runes.ts` | `RuneChange.opened`: the sockets an Apply opens (`openSocket` goes through `setChains`, so it counts there) |
| `packages/engine/src/delve/moveset.ts` | `setChains`: one `openSocket` event per socket opened |
| `packages/engine/src/loot/salvage-yield.ts` | `applySalvage`: the state types re-read after a pattern is learned |
| `packages/engine/tests/fixtures/quests.ts` (new) | `questRegistry` (the default data with fixture quests and no contract templates), `obj`, `quest`, `value` |
| `packages/engine/tests/delve-quests-progress.test.ts` (new) | objectives, scope, unlocks, the view, tracking, NEW |
| `packages/engine/tests/delve-quests-claim.test.ts` (new) | claims (rewards through a mocked `resolveReward`), the next main quest, state credit, a contract's claim |
| `packages/engine/tests/delve-quests-emission.test.ts` (new) | every emission site, the sandbox, progress through a death, bank timing, the boss replay, the dive scope's resets |

## Cross-area needs

- **Client tests: none left.** A new save unlocks a main quest once B1 lands, so the Quests tab leaves its empty state. C1, merged at `d61d7b4`, stubs `useQuests` in `AnvilHub.test.tsx` and `PauseScreen.test.tsx`, so the client suite stays green (checked: 1244 of 1244 pass on B1's bundle).
- **B2.** None in B2's files. B2 relies on the order B1 gives, and this plan keeps it:
  - `extractDive` applies `extract` before `settleDive`.
  - `failFloor` banks (applying the floor's events) before it settles.
  - `settleDive` resets the dive scope before its `refillBoard` line. That line and its guard stay as Phase A wrote them, and B1 doesn't touch them. If B2 wants the guard gone, that edit is in `dive.ts`, B1's file: route it through the integrator.
  - A contract's progress is advanced in place on its board entry (any objective ids; B2's single `'goal'` objective included).
  - A contract's claim goes through `grantRewards` with its id, so its stream is `quest:contract:<n>:<claimCount>`.
- **C2.** No edits. What C2's notice diff reads holds:
  - `bankWorld` empties `pending.questEvents` (`world.pending = emptyPending()`, after applying them).
  - `profile.quests.progress[id][i]` is objective `i` of quest `id`.
  - A contract's progress is on its board entry.
  - `done` never goes back.
  - A quest that unlocks already complete (state credit) is complete in the same call.
- **C1.** No edits. `questStates` gives what C1 reads:
  - concrete rewards as `{ ref, count }`, and only the four rules (`metal: 'depth'`, a `shard` by family and tier, `essence: 'fit'`, `pattern: 'unknown'`) as `{ rule }`;
  - claimed main and side quests with `status: 'claimed'`;
  - contracts by their `contract:<n>` ids;
  - in order: the main quests by the chain, then the side quests in data order, then the contracts by board slot.
- **Phase D.** The autopilot's claims call `claimQuest` (which refuses mid-dive). `applyQuestEvents` runs at every bank and op, and the pacing rails pass with it, unchanged.

## Where the spec left room

1. **What a `total` objective counts.** A sum counts the events applied after its quest unlocked. Events in the same call as the unlock don't count: they happened before it. A state type, and a `total` `reachDepth` (which reads `bestDepth`), credit at once, at the unlock and at every call.
2. **A `dive`-scoped state type** (`discoverReaction` may be one) reads the same profile-wide number as a `total` one. No content uses one; a per-dive baseline can come when one does.
3. **`boss` fires from `world.bossKilled`** at `completeFloor`, the same flag that counts `stats.bossKills` and the checkpoints. A replayed boss floor completes once, so its boss counts once. The boss's own kill emits nothing.
4. **`hurt`** is set once damage gets past dodges, blinds, armour and every shield (`dmg > 0` after `shieldHero`). A blocked hit in the Training Grounds sets it too, which is harmless: a sandbox never completes a floor.
5. **`openSocket` (`delve/runes.ts`) emits nothing of its own.** It is one `setChains`, which counts each socket an Apply opens (`RuneChange.opened`). An emission in both places would count it twice.
6. **`bind` is a state type.** `bindSecondary` still passes `{ type: 'bind' }`, as the spec has it emit one. The applier reads the state either way.
7. **The tracked slot.** A newly unlocked main quest takes the slot of the quest named in its `unlock.after`, if that quest is tracked, else the first free one. `claimQuest` runs the unlocks before it takes the claimed quest off `tracked`, so the next main quest lands in the old one's slot. The first main quest (no `after`) is tracked on a new save, in the first free slot.
8. **Refusals.**
   - `claimQuest`: "Claim at the Anvil, between dives" (Phase A's), "No such quest" (unknown or locked), "Already claimed", "Finish its objectives first".
   - `trackQuest`: "No such quest" (not unlocked, already claimed, or not on the board), "Track at most N quests". Tracking a quest already tracked is a no-op `ok`, and untracking never refuses.
   - `markQuestSeen` returns the profile unchanged for an unknown, locked or seen id.
9. **`isNew`** is "not in `seen`" for any unclaimed quest. A claimed quest is never NEW.

## Conventions

As the overview's shared conventions and Phase A's (`01-contract.md` → "Conventions"). In short:

- **Commits:** one commit per task on `quest/b1`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Line endings:** keep each file's own: the worktree's source files are CRLF, and the Edit tool keeps them. New files are LF.
- **Prettier:** run it as `npx prettier --end-of-line auto`. **`packages/engine/src/delve/dive.ts` is hand-edited, never formatted** (it isn't clean at the base). Every other file this plan touches passes `prettier --check` at the base. The code below is already formatted (checked on the scratch copy), so `--write` changes nothing if it is typed as written.
- **How the edits read:**
  - "Replace: A with: B" is one Edit (old A, new B).
  - "Append at the end of the file:" adds a blank line and the block after the last line.
  - "Create `f`:" is a Write.
  - Within a file, apply its edits top to bottom. Every anchor is unique in its file at that point.
- **Import cycles:** `quests.ts` imports `dive.ts`, and `dive.ts`, `pair.ts`, `crafting.ts`, `moveset.ts` and `loot/salvage-yield.ts` now import `quests.ts`. Every such import is read only inside a function, as the cycle rule asks.
- **Running checks:**
  - Every task runs the whole engine suite (about 85 s with the pacing rails) and the engine typecheck.
  - The client follows the bundle, which Tasks 1–6 never rebuild. "Verification" rebuilds it and runs the client.
- **Checked on a scratch copy:** `git archive` of `quest/main` at `7bc2d20`, and again at `d61d7b4`, with junctioned `node_modules`. Every task's edits were applied in order by a script that checks each anchor, giving the trees that every FAIL, PASS, suite, typecheck and `prettier --check` below ran on.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine bundle | `(cd packages/engine && npx tsup)` |
| Client tests, typecheck | `(cd packages/client && npx vitest run)`, `(cd packages/client && npx tsc --noEmit -p .)` |

---

## Chunk 1: Progress

### Task 1: `applyQuestEvents`, the unlocks and the dive scope's reset

Each objective type counts its own events through its filters (sum), `reachDepth` keeps the deepest (max), and the state types read the profile. Progress is capped at the count and a done objective stays done. The unlocks run on every call, crediting a new quest's state types at once. `resetDiveQuests` zeroes unfinished `dive` objectives. The tests run on fixture quests: the default data with the test's own quests and no contract templates.

**Files:**
- Create: `packages/engine/tests/fixtures/quests.ts`, `packages/engine/tests/delve-quests-progress.test.ts`
- Modify: `packages/engine/src/delve/quests.ts`

- [ ] **Step 1: The fixture and the failing tests**

Create `packages/engine/tests/fixtures/quests.ts`:

```ts
import { loadAndValidateData } from '../../src/data/loader.js';
import { DataRegistry } from '../../src/data/registry.js';
import type { DelveProfile } from '../../src/types/delve.js';
import type { Objective, QuestDef } from '../../src/types/quests.js';

// Fixture quests for the quests' engine tests: the default data with the
// test's own quests and no contract templates (the content is B2's).

const data = loadAndValidateData();

/** The default data, its quests `quests` and no contract templates. */
export function questRegistry(quests: QuestDef[]): DataRegistry {
  const d = data;
  return new DataRegistry(
    d.affixes,
    d.combinations,
    d.synergies,
    d.baseItems,
    d.balance,
    d.recipes,
    d.delve,
    d.arpg,
    d.crafting,
    { ...d.quests, quests, contractTemplates: [] },
  );
}

/** An objective: `count` of `type`, scoped `total` unless `more` says otherwise. */
export function obj(
  type: Objective['type'],
  count: number,
  more: Partial<Objective> = {},
): Objective {
  return { id: type, type, count, scope: 'total', text: `${count} ${type}`, ...more };
}

/** A side quest with `objectives`, no unlock and no rewards, unless `more` says otherwise. */
export function quest(id: string, objectives: Objective[], more: Partial<QuestDef> = {}): QuestDef {
  return { id, kind: 'side', name: id, line: `${id}'s line`, objectives, rewards: [], ...more };
}

/** Objective `i`'s progress value of quest `id`. */
export const value = (p: DelveProfile, id: string, i = 0) => p.quests.progress[id]?.[i]?.value;
```

Create `packages/engine/tests/delve-quests-progress.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDelveProfile } from '../src/delve/profile.js';
import { applyQuestEvents, resetDiveQuests } from '../src/delve/quests.js';
import type { ManaType } from '../src/types/mana.js';
import type { Rarity } from '../src/types/gear.js';
import type { Objective, QuestEvent } from '../src/types/quests.js';
import { obj, quest, questRegistry, value } from './fixtures/quests.js';

// Quest progress (see the quests spec's quest model and objective table), on fixture quests.

const kill = (kind: 'normal' | 'elite', biome = 'cinder_mines', element: ManaType = 'fire') =>
  ({ type: 'kill', kind, biome, element }) as const;
const floor = (depth: number, noPotion = true, noDamage = true, biome = 'cinder_mines') =>
  ({ type: 'clearFloor', biome, depth, noPotion, noDamage }) as const;
const forged = (rarity: Rarity, legendary = false) =>
  ({ type: 'forge', rarity, legendary }) as const;
const REFINE: QuestEvent = { type: 'refine' };
const DODGE: QuestEvent = { type: 'perfectDodge' };
const BOUND = { primary: 'fire', secondary: 'frost' } as const;

describe('objectives', () => {
  it('each type counts its own events, through every filter it gives', () => {
    const events: QuestEvent[] = [
      kill('elite'),
      kill('normal'),
      kill('elite', 'frostvault', 'frost'),
      floor(4),
      floor(4, false),
      floor(4, true, false),
      floor(2),
      floor(5, true, true, 'frostvault'),
      { type: 'extract', depth: 3 },
      { type: 'extract', depth: 6 },
      { type: 'boss', biome: 'cinder_mines' },
      { type: 'boss', biome: 'frostvault' },
      { type: 'reaction', reaction: 'melt' },
      { type: 'reaction', reaction: 'overload' },
      { type: 'reaction', reaction: 'melt' },
      DODGE,
      forged('uncommon'),
      forged('rare'),
      forged('legendary', true),
      REFINE,
      REFINE,
      { type: 'openSocket' },
      { type: 'bind' },
    ];
    const counts: [Objective, number][] = [
      [obj('kill', 99), 3],
      [obj('kill', 99, { filter: { kind: 'elite' } }), 2],
      [obj('kill', 99, { filter: { biome: 'frostvault' } }), 1],
      [obj('kill', 99, { filter: { element: 'fire' } }), 2],
      [obj('clearFloor', 99), 5],
      [obj('clearFloor', 99, { filter: { noPotion: true, noDamage: true, minDepth: 3 } }), 2],
      [obj('clearFloor', 99, { filter: { biome: 'cinder_mines', minDepth: 4 } }), 3],
      [obj('extract', 99), 2],
      [obj('extract', 99, { filter: { minDepth: 5 } }), 1],
      [obj('boss', 99, { filter: { biome: 'cinder_mines' } }), 1],
      [obj('reaction', 99), 3],
      [obj('reaction', 99, { filter: { reaction: 'melt' } }), 2],
      [obj('perfectDodge', 99), 1],
      [obj('forge', 99), 3],
      [obj('forge', 99, { filter: { minRarity: 'rare' } }), 2],
      [obj('forge', 99, { filter: { legendary: true } }), 1],
      [obj('refine', 99), 2],
      [obj('openSocket', 99), 1],
    ];
    const reg = questRegistry(counts.map(([o], i) => quest(`q${i}`, [o])));
    const p = applyQuestEvents(reg, createDelveProfile(reg, 1, { primary: 'fire' }), events);
    expect(counts.map((_, i) => value(p, `q${i}`))).toEqual(counts.map(([, n]) => n));
  });

  it("a pair filter counts the hero's pair's reaction, read when the event applies", () => {
    const reg = questRegistry([quest('pair', [obj('reaction', 99, { filter: { pair: true } })])]);
    const ours: QuestEvent = { type: 'reaction', reaction: reg.getReactionFor('fire', 'frost').id };
    const other: QuestEvent = {
      type: 'reaction',
      reaction: reg.getReactionFor('fire', 'storm').id,
    };
    let p = applyQuestEvents(reg, createDelveProfile(reg, 1, { primary: 'fire' }), [ours]);
    expect(value(p, 'pair')).toBe(0);
    p = applyQuestEvents(reg, { ...p, pair: BOUND }, [ours, other, ours]);
    expect(value(p, 'pair')).toBe(2);
  });

  it('reachDepth keeps the deepest depth entered; a total one reads bestDepth too', () => {
    const reg = questRegistry([
      quest('deep', [obj('reachDepth', 10)]),
      quest('dive', [obj('reachDepth', 10, { scope: 'dive' })]),
    ]);
    const enter = (depth: number): QuestEvent => ({ type: 'reachDepth', depth });
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    p = applyQuestEvents(reg, { ...p, bestDepth: 6 }, []);
    expect([value(p, 'deep'), value(p, 'dive')]).toEqual([6, 0]);
    p = applyQuestEvents(reg, p, [enter(3), enter(4)]);
    expect([value(p, 'deep'), value(p, 'dive')]).toEqual([6, 4]);
    p = applyQuestEvents(reg, p, [enter(2)]);
    expect(value(p, 'dive')).toBe(4);
    p = applyQuestEvents(reg, { ...p, bestDepth: 12 }, [enter(12)]);
    expect(p.quests.progress.deep).toEqual([{ value: 10, done: true }]);
    expect(p.quests.progress.dive).toEqual([{ value: 10, done: true }]);
  });

  it('the state types read the profile on every call, with events or none', () => {
    const reg = questRegistry([
      quest('bind', [obj('bind', 1)]),
      quest('patterns', [obj('knowPatterns', 6)]),
      quest('reactions', [obj('discoverReaction', 5)]),
    ]);
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    const known = p.patterns.length;
    expect([value(p, 'bind'), value(p, 'patterns'), value(p, 'reactions')]).toEqual([0, known, 0]);
    p = applyQuestEvents(
      reg,
      { ...p, pair: BOUND, patterns: [...p.patterns, 'axe'], reactionsSeen: ['melt', 'overload'] },
      [],
    );
    expect([value(p, 'bind'), value(p, 'patterns'), value(p, 'reactions')]).toEqual([
      1,
      known + 1,
      2,
    ]);
    expect(p.quests.progress.bind).toEqual([{ value: 1, done: true }]);
  });

  it('progress is capped at the count, and a done objective stays done', () => {
    const reg = questRegistry([quest('two', [obj('refine', 2), obj('perfectDodge', 1)])]);
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    p = applyQuestEvents(reg, p, [REFINE, REFINE, REFINE]);
    expect(p.quests.progress.two).toEqual([
      { value: 2, done: true },
      { value: 0, done: false },
    ]);
    p = applyQuestEvents(reg, p, [DODGE, REFINE]);
    expect(p.quests.progress.two).toEqual([
      { value: 2, done: true },
      { value: 1, done: true },
    ]);
  });

  it('resetDiveQuests zeroes unfinished dive-scoped objectives, contracts too; a done one survives', () => {
    const reg = questRegistry([
      quest('dive', [obj('perfectDodge', 3, { scope: 'dive' })]),
      quest('total', [obj('perfectDodge', 3)]),
      quest('quick', [obj('perfectDodge', 1, { scope: 'dive' })]),
    ]);
    const contract = {
      id: 'contract:0',
      template: 'dodges',
      tier: 'easy' as const,
      name: 'Light Feet',
      line: 'Dance.',
      objectives: [obj('perfectDodge', 5, { scope: 'dive' })],
      rewards: [],
      progress: [{ value: 0, done: false }],
    };
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    p = { ...p, quests: { ...p.quests, board: [contract, null, null] } };
    p = applyQuestEvents(reg, p, [DODGE, DODGE]);
    expect(p.quests.board[0]!.progress).toEqual([{ value: 2, done: false }]);
    p = resetDiveQuests(reg, p);
    expect(['dive', 'total', 'quick'].map((id) => value(p, id))).toEqual([0, 2, 1]);
    expect(p.quests.progress.quick).toEqual([{ value: 1, done: true }]);
    expect(p.quests.board[0]!.progress).toEqual([{ value: 0, done: false }]);
  });
});

describe('unlocks', () => {
  it('a new save unlocks every quest without an unlock, and tracks the first main quest', () => {
    const reg = questRegistry([
      quest('m1', [obj('refine', 1)], { kind: 'main' }),
      quest('m2', [obj('refine', 1)], { kind: 'main', unlock: { after: 'm1' } }),
      quest('side', [obj('refine', 1)]),
    ]);
    const p = createDelveProfile(reg, 1, { primary: 'fire' });
    expect(p.quests).toMatchObject({ unlocked: ['m1', 'side'], tracked: ['m1'] });
    expect(p.quests.progress).toEqual({
      m1: [{ value: 0, done: false }],
      side: [{ value: 0, done: false }],
    });
  });

  it('a side quest unlocks once every condition it gives holds, checked at every call', () => {
    const o = [obj('refine', 1)];
    const reg = questRegistry([
      quest('deep', o, { unlock: { bestDepth: 6 } }),
      quest('seen', o, { unlock: { reactionsSeen: 2 } }),
      quest('known', o, { unlock: { patterns: 4 } }),
      quest('bound', o, { unlock: { pair: true } }),
      quest('both', o, { unlock: { bestDepth: 6, pair: true } }),
    ]);
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    expect(p.quests.unlocked).toEqual([]);
    p = applyQuestEvents(reg, { ...p, bestDepth: 6 }, []);
    expect(p.quests.unlocked).toEqual(['deep']);
    p = applyQuestEvents(
      reg,
      { ...p, reactionsSeen: ['melt', 'overload'], patterns: [...p.patterns, 'axe'] },
      [],
    );
    expect(p.quests.unlocked).toEqual(['deep', 'seen', 'known']);
    p = applyQuestEvents(reg, { ...p, pair: BOUND }, []);
    expect(p.quests.unlocked).toEqual(['deep', 'seen', 'known', 'bound', 'both']);
    expect(p.quests.tracked).toEqual([]);
  });

  it('a sum counts from the unlock on; a state credits at once (an early bind completes a bind quest)', () => {
    const reg = questRegistry([
      quest('refines', [obj('refine', 5)], { unlock: { bestDepth: 3 } }),
      quest('second', [obj('bind', 1)], { unlock: { bestDepth: 3 } }),
    ]);
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    p = applyQuestEvents(reg, { ...p, pair: BOUND }, [REFINE]);
    p = applyQuestEvents(reg, { ...p, bestDepth: 3 }, [REFINE]);
    expect(p.quests.unlocked).toEqual(['refines', 'second']);
    expect(value(p, 'refines')).toBe(0);
    expect(p.quests.progress.second).toEqual([{ value: 1, done: true }]);
    p = applyQuestEvents(reg, p, [REFINE]);
    expect(value(p, 'refines')).toBe(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-progress.test.ts)`
Expected: FAIL, 9 of 9: every objective test reads no progress (`expected [ undefined, undefined, …(16) ] to deeply equal [ 3, 2, 1, 2, 5, 2, 3, 2, 1, 1, …(8) ]` and the like: the stub applies nothing), `resetDiveQuests zeroes …` (`expected [ { value: +0, done: false } ] to deeply equal [ { value: 2, done: false } ]`), and the three unlock tests (`expected [] to deeply equal [ 'deep' ]` and the like: nothing unlocks).

- [ ] **Step 3: The progress**

In `packages/engine/src/delve/quests.ts`:

Replace:

```ts
import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { DelveProfile } from '../types/delve.js';
import type {
  ProfileQuests,
  QuestEvent,
  QuestId,
  QuestState,
  Reward,
  RewardGrant,
} from '../types/quests.js';
```

with:

```ts
import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { DelveProfile } from '../types/delve.js';
import { rarityIndex } from '../types/gem.js';
import {
  OBJECTIVE_RULES,
  type Objective,
  type ObjectiveProgress,
  type ObjectiveType,
  type ProfileQuests,
  type QuestDef,
  type QuestEvent,
  type QuestId,
  type QuestState,
  type Reward,
  type RewardGrant,
} from '../types/quests.js';
```

Replace:

```ts
/**
 * The profile with `events` applied: every unlocked, unclaimed quest's
 * matching objectives (the board's contracts' too) advance, the state types
 * are read again from the profile, then the unlocks run (a newly unlocked
 * main quest takes the old main's tracked slot, or the first free one). Pure
 * and deterministic: every op that emits calls it and returns its result, and
 * an op that only changes a state calls it with no events. Stub (B1): until
 * then it applies nothing and returns `profile`, so the calls already wired
 * to it (`createDelveProfile`'s first unlocks) change nothing.
 */
export function applyQuestEvents(
  _registry: DataRegistry,
  profile: DelveProfile,
  _events: readonly QuestEvent[],
): DelveProfile {
  return profile;
}
```

with:

```ts
function questDef(registry: DataRegistry, id: QuestId): QuestDef | undefined {
  return registry.getQuestsData().quests.find((q) => q.id === id);
}

function withQuests(profile: DelveProfile, quests: Partial<ProfileQuests>): DelveProfile {
  return { ...profile, quests: { ...profile.quests, ...quests } };
}

/** Whether `e` counts for `o`: its type, and every filter `o` gives (`pair`: the pair's reaction). */
function matches(
  registry: DataRegistry,
  profile: DelveProfile,
  o: Objective,
  e: QuestEvent,
): boolean {
  if (e.type !== o.type) return false;
  const f = o.filter ?? {};
  const v = e as Partial<{
    kind: string;
    biome: string;
    element: string;
    depth: number;
    noPotion: boolean;
    noDamage: boolean;
    reaction: string;
    rarity: Parameters<typeof rarityIndex>[0];
    legendary: boolean;
  }>;
  const { primary, secondary } = profile.pair;
  return (
    (!f.kind || v.kind === f.kind) &&
    (!f.biome || v.biome === f.biome) &&
    (!f.element || v.element === f.element) &&
    (!f.noPotion || !!v.noPotion) &&
    (!f.noDamage || !!v.noDamage) &&
    (f.minDepth === undefined || (v.depth ?? 0) >= f.minDepth) &&
    (!f.reaction || v.reaction === f.reaction) &&
    (!f.pair ||
      (!!primary &&
        !!secondary &&
        v.reaction === registry.getReactionFor(primary, secondary).id)) &&
    (!f.minRarity || (!!v.rarity && rarityIndex(v.rarity) >= rarityIndex(f.minRarity))) &&
    (!f.legendary || !!v.legendary)
  );
}

/** A state type's value, read from the profile. */
function stateValue(profile: DelveProfile, type: ObjectiveType): number {
  if (type === 'bind') return profile.pair.secondary ? 1 : 0;
  if (type === 'knowPatterns') return profile.patterns.length;
  if (type === 'discoverReaction') return profile.reactionsSeen.length;
  return 0;
}

/**
 * `objectives`' progress with `events` applied: a sum adds each matching
 * event, `reachDepth` (max) takes the deepest depth entered (a `total` one
 * also `bestDepth`), a state type reads the profile; capped at the count. A
 * done objective stays as it is.
 */
function advance(
  registry: DataRegistry,
  profile: DelveProfile,
  objectives: readonly Objective[],
  progress: readonly ObjectiveProgress[] | undefined,
  events: readonly QuestEvent[],
): ObjectiveProgress[] {
  return objectives.map((o, i) => {
    const was = progress?.[i] ?? { value: 0, done: false };
    if (was.done) return was;
    const rule = OBJECTIVE_RULES[o.type].progress;
    const hits = events.filter((e) => matches(registry, profile, o, e));
    const grown =
      rule === 'state'
        ? stateValue(profile, o.type)
        : rule === 'max'
          ? Math.max(
              was.value,
              o.scope === 'total' ? profile.bestDepth : 0,
              ...hits.map((e) => (e.type === 'reachDepth' ? e.depth : 0)),
            )
          : was.value + hits.length;
    const value = Math.min(o.count, grown);
    return { value, done: value >= o.count };
  });
}

function unlockMet(def: QuestDef, profile: DelveProfile): boolean {
  const u = def.unlock ?? {};
  return (
    (!u.after || profile.quests.claimed.includes(u.after)) &&
    profile.bestDepth >= (u.bestDepth ?? 0) &&
    profile.reactionsSeen.length >= (u.reactionsSeen ?? 0) &&
    profile.patterns.length >= (u.patterns ?? 0) &&
    (!u.pair || profile.pair.secondary !== null)
  );
}

/**
 * The profile with `events` applied: every unlocked, unclaimed quest's
 * matching objectives (the board's contracts' too) advance, the state types
 * are read again from the profile, then the unlocks run: a newly unlocked
 * quest starts with its state types read (an early bind counts at once), and
 * a newly unlocked main quest takes the tracked slot of the quest it comes
 * after, or the first free one. Pure and deterministic: every op that emits
 * calls it and returns its result, and an op that only changes a state calls
 * it with no events.
 */
export function applyQuestEvents(
  registry: DataRegistry,
  profile: DelveProfile,
  events: readonly QuestEvent[],
): DelveProfile {
  const q = profile.quests;
  const progress = { ...q.progress };
  for (const id of q.unlocked) {
    const def = questDef(registry, id);
    if (def && !q.claimed.includes(id))
      progress[id] = advance(registry, profile, def.objectives, progress[id], events);
  }
  const board = q.board.map(
    (c) => c && { ...c, progress: advance(registry, profile, c.objectives, c.progress, events) },
  );
  const unlocked = [...q.unlocked];
  const tracked = [...q.tracked];
  const { maxTracked } = registry.getDelveBalance().quests;
  for (const def of registry.getQuestsData().quests) {
    if (unlocked.includes(def.id) || !unlockMet(def, profile)) continue;
    unlocked.push(def.id);
    progress[def.id] = advance(registry, profile, def.objectives, undefined, []);
    if (def.kind !== 'main') continue;
    const slot = def.unlock?.after ? tracked.indexOf(def.unlock.after) : -1;
    if (slot >= 0) tracked[slot] = def.id;
    else if (tracked.length < maxTracked) tracked.push(def.id);
  }
  return withQuests(profile, { progress, board, unlocked, tracked });
}

/**
 * Every unfinished `dive`-scoped objective back to 0 (a done one stays done):
 * a dive's start and its settle call it.
 */
export function resetDiveQuests(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const q = profile.quests;
  const reset = (objectives: readonly Objective[], progress: readonly ObjectiveProgress[]) =>
    progress.map((p, i) =>
      objectives[i]?.scope === 'dive' && !p.done ? { value: 0, done: false } : p,
    );
  const progress = Object.fromEntries(
    Object.entries(q.progress).map(([id, p]) => {
      const def = questDef(registry, id);
      return [id, def ? reset(def.objectives, p) : p];
    }),
  );
  const board = q.board.map((c) => c && { ...c, progress: reset(c.objectives, c.progress) });
  return withQuests(profile, { progress, board });
}
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-progress.test.ts)`
Expected: PASS, 9 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1818 passed | 5 skipped** in **102 passed | 1 skipped** files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-b1
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/quests.ts tests/fixtures/quests.ts tests/delve-quests-progress.test.ts)
git add packages/engine/src/delve/quests.ts packages/engine/tests/fixtures/quests.ts packages/engine/tests/delve-quests-progress.test.ts
git commit -m "feat(engine): quest events advance objectives; unlocks credit states at once; the dive scope resets" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: `questStates`, `trackQuest` and `markQuestSeen`

The journal's data: every unlocked quest (the main ones by the chain, then the side ones, then the board's contracts by slot) with its status, NEW, tracked, objectives and rewards (concrete ones as refs, the four rules as rules). Tracking up to `maxTracked`, and NEW, both allowed mid-dive.

**Files:**
- Modify: `packages/engine/src/delve/quests.ts`, `packages/engine/tests/delve-quests-progress.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-quests-progress.test.ts`:

Replace:

```ts
import { createDelveProfile } from '../src/delve/profile.js';
import { applyQuestEvents, resetDiveQuests } from '../src/delve/quests.js';
import type { ManaType } from '../src/types/mana.js';
import type { Rarity } from '../src/types/gear.js';
import type { Objective, QuestEvent } from '../src/types/quests.js';
```

with:

```ts
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import {
  applyQuestEvents,
  markQuestSeen,
  questStates,
  resetDiveQuests,
  trackQuest,
} from '../src/delve/quests.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { ManaType } from '../src/types/mana.js';
import type { Rarity } from '../src/types/gear.js';
import type { Contract, Objective, QuestEvent, Reward } from '../src/types/quests.js';
```

Append at the end of the file:

```ts
describe('the quest view, tracking and NEW', () => {
  const REWARDS: Reward[] = [
    { kind: 'scrap', count: 40 },
    { kind: 'metal', id: 'depth', count: 3 },
    { kind: 'metal', id: 'iron', count: 2 },
    { kind: 'flux', grade: 'magic', count: 1 },
    { kind: 'shard', family: 'offense', tier: 3, count: 1 },
    { kind: 'essence', id: 'fit', count: 1 },
    { kind: 'pattern', id: 'unknown', count: 1, fallback: { kind: 'dust', count: 5 } },
  ];
  // Out of order in the data: the view lists the main quests by the chain.
  const reg = questRegistry([
    quest('a', [obj('refine', 1)]),
    quest('m2', [obj('refine', 1)], { kind: 'main', unlock: { after: 'm1' } }),
    quest('m1', [obj('refine', 2, { text: 'Refine twice' })], {
      kind: 'main',
      chapter: 'One',
      rewards: REWARDS,
    }),
    quest('b', [obj('refine', 1)]),
    quest('c', [obj('refine', 1)]),
    quest('locked', [obj('refine', 1)], { unlock: { bestDepth: 9 } }),
  ]);
  const contract: Contract = {
    id: 'contract:0',
    template: 'dodges',
    tier: 'easy',
    name: 'Light Feet',
    line: 'Dance.',
    objectives: [obj('perfectDodge', 3, { text: 'Dodge 3' })],
    rewards: [{ kind: 'dust', count: 4 }],
    progress: [{ value: 1, done: false }],
  };
  const start = (): DelveProfile => {
    const p = applyQuestEvents(reg, createDelveProfile(reg, 1, { primary: 'fire' }), [REFINE]);
    return { ...p, quests: { ...p.quests, board: [null, contract, null] } };
  };

  it('shows the main quests by the chain, the side quests, then the contracts; rewards as refs, or rules', () => {
    const states = questStates(reg, start());
    expect(states.map((s) => s.id)).toEqual(['m1', 'a', 'b', 'c', 'contract:0']);
    expect(states[0]).toEqual({
      id: 'm1',
      kind: 'main',
      status: 'active',
      isNew: true,
      tracked: true,
      name: 'm1',
      line: "m1's line",
      chapter: 'One',
      objectives: [{ id: 'refine', text: 'Refine twice', value: 1, count: 2, done: false }],
      rewards: [
        { ref: { kind: 'scrap' }, count: 40 },
        { rule: REWARDS[1] },
        { ref: { kind: 'metal', metal: 'iron' }, count: 2 },
        { ref: { kind: 'flux', grade: 'magic' }, count: 1 },
        { rule: REWARDS[4] },
        { rule: REWARDS[5] },
        { rule: REWARDS[6] },
      ],
    });
    expect(states[4]).toEqual({
      id: 'contract:0',
      kind: 'contract',
      status: 'active',
      isNew: true,
      tracked: false,
      name: 'Light Feet',
      line: 'Dance.',
      objectives: [{ id: 'perfectDodge', text: 'Dodge 3', value: 1, count: 3, done: false }],
      rewards: [{ ref: { kind: 'dust' }, count: 4 }],
    });
  });

  it('a contract advances on the board; complete once every objective is done, claimed once claimed', () => {
    let p = applyQuestEvents(reg, start(), [DODGE, DODGE, REFINE]);
    expect(p.quests.board[1]!.progress).toEqual([{ value: 3, done: true }]);
    expect(questStates(reg, p).every((s) => s.status === 'complete')).toBe(true);
    p = applyQuestEvents(reg, { ...p, quests: { ...p.quests, claimed: ['m1'] } }, []);
    expect(questStates(reg, p).map((s) => [s.id, s.status, s.isNew])).toEqual([
      ['m1', 'claimed', false],
      ['m2', 'active', true],
      ['a', 'complete', true],
      ['b', 'complete', true],
      ['c', 'complete', true],
      ['contract:0', 'complete', true],
    ]);
  });

  it('tracks up to maxTracked and untracks; only an open quest; mid-dive too', () => {
    const max = reg.getDelveBalance().quests.maxTracked;
    let p = start();
    expect(p.quests.tracked).toEqual(['m1']);
    p = trackQuest(reg, p, 'a', true).profile;
    p = trackQuest(reg, p, 'contract:0', true).profile;
    expect(p.quests.tracked).toEqual(['m1', 'a', 'contract:0']);
    expect(trackQuest(reg, p, 'b', true)).toEqual({
      ok: false,
      profile: p,
      reason: `Track at most ${max} quests`,
    });
    expect(trackQuest(reg, p, 'a', true)).toEqual({ ok: true, profile: p });
    for (const id of ['locked', 'nope'])
      expect(trackQuest(reg, p, id, true).reason).toBe('No such quest');
    p = trackQuest(reg, p, 'm1', false).profile;
    expect(p.quests.tracked).toEqual(['a', 'contract:0']);
    const diving = startDive(reg, p, 1);
    expect(trackQuest(reg, diving, 'b', true).profile.quests.tracked).toEqual([
      'a',
      'contract:0',
      'b',
    ]);
  });

  it('a quest opened in the journal is NEW no more; mid-dive too', () => {
    const p = startDive(reg, start(), 1);
    const seen = markQuestSeen(reg, markQuestSeen(reg, p, 'a'), 'contract:0');
    expect(seen.quests.seen).toEqual(['a', 'contract:0']);
    expect(questStates(reg, seen).map((s) => s.isNew)).toEqual([true, false, true, true, false]);
    expect(markQuestSeen(reg, seen, 'a')).toBe(seen);
    expect(markQuestSeen(reg, seen, 'locked')).toBe(seen);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-progress.test.ts)`
Expected: FAIL, 4 of 13: the two view tests (`expected [] to deeply equal [ 'm1', 'a', 'b', 'c', 'contract:0' ]`, `expected [] to deeply equal [ [ 'm1', 'claimed', false ], …(5) ]`), `tracks up to maxTracked …` (`Error: trackQuest: not implemented`) and `a quest opened in the journal …` (`Error: markQuestSeen: not implemented`); Task 1's 9 pass.

- [ ] **Step 3: The view, tracking and NEW**

In `packages/engine/src/delve/quests.ts`:

Replace:

```ts
import { SeededRNG } from '../rng/seeded-rng.js';
import type { DelveProfile } from '../types/delve.js';
```

with:

```ts
import { SeededRNG } from '../rng/seeded-rng.js';
import type { MetalId } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
```

Replace:

```ts
  type QuestId,
  type QuestState,
  type Reward,
  type RewardGrant,
} from '../types/quests.js';
```

with:

```ts
  type QuestId,
  type QuestKind,
  type QuestState,
  type Reward,
  type RewardGrant,
  type RewardRef,
  type RewardView,
} from '../types/quests.js';
```

Replace:

```ts
  return { ...profile, quests: { ...profile.quests, ...quests } };
}
```

with:

```ts
  return { ...profile, quests: { ...profile.quests, ...quests } };
}

const without = (ids: readonly QuestId[], id: QuestId) => ids.filter((x) => x !== id);
```

Replace:

```ts
/**
 * Every unlocked quest, main, side and the board's contracts, as the journal
 * and the HUD draw it: data, never text the engine made. Stub (B1): until
 * then it shows none.
 */
export function questStates(_registry: DataRegistry, _profile: DelveProfile): QuestState[] {
  return [];
}
```

with:

```ts
/** A reward as the quest view shows it: concrete, or a rule until it is claimed. */
function rewardView(r: Reward): RewardView {
  const ref: RewardRef | null =
    r.kind === 'scrap' || r.kind === 'dust' || r.kind === 'links'
      ? { kind: r.kind }
      : r.kind === 'metal' && r.id && r.id !== 'depth'
        ? { kind: 'metal', metal: r.id as MetalId }
        : r.kind === 'flux' && r.grade
          ? { kind: 'flux', grade: r.grade }
          : r.kind === 'essence' && r.id && r.id !== 'fit'
            ? { kind: 'essence', essence: r.id }
            : r.kind === 'pattern' && r.id && r.id !== 'unknown'
              ? { kind: 'pattern', pattern: r.id }
              : null;
  return ref ? { ref, count: r.count } : { rule: r };
}

function stateOf(
  q: ProfileQuests,
  kind: QuestKind,
  quest: Pick<QuestDef, 'id' | 'name' | 'line' | 'chapter' | 'objectives' | 'rewards'>,
  progress: readonly ObjectiveProgress[] | undefined,
): QuestState {
  const objectives = quest.objectives.map((o, i) => ({
    id: o.id,
    text: o.text,
    value: progress?.[i]?.value ?? 0,
    count: o.count,
    done: progress?.[i]?.done ?? false,
  }));
  const claimed = q.claimed.includes(quest.id);
  return {
    id: quest.id,
    kind,
    status: claimed ? 'claimed' : objectives.every((o) => o.done) ? 'complete' : 'active',
    isNew: !claimed && !q.seen.includes(quest.id),
    tracked: q.tracked.includes(quest.id),
    name: quest.name,
    line: quest.line,
    ...(quest.chapter ? { chapter: quest.chapter } : {}),
    objectives,
    rewards: quest.rewards.map(rewardView),
  };
}

/** How far down the main chain `def` is: 0 for the first main quest. */
function chainRank(registry: DataRegistry, def: QuestDef): number {
  const after = def.unlock?.after && questDef(registry, def.unlock.after);
  return after ? 1 + chainRank(registry, after) : 0;
}

/**
 * Every unlocked quest, claimed ones included: the main quests in chain
 * order, the side quests in `quests.json`'s, then the board's contracts by
 * slot, as the journal and the HUD draw them: data, never text the engine
 * made.
 */
export function questStates(registry: DataRegistry, profile: DelveProfile): QuestState[] {
  const q = profile.quests;
  const open = registry.getQuestsData().quests.filter((d) => q.unlocked.includes(d.id));
  const main = open
    .filter((d) => d.kind === 'main')
    .sort((a, b) => chainRank(registry, a) - chainRank(registry, b));
  const quests = [...main, ...open.filter((d) => d.kind !== 'main')].map((d) =>
    stateOf(q, d.kind, d, q.progress[d.id]),
  );
  const contracts = q.board.flatMap((c) => (c ? [stateOf(q, 'contract', c, c.progress)] : []));
  return [...quests, ...contracts];
}
```

Replace:

```ts
/**
 * Track `questId` on the HUD (`on`), up to `delve.quests.maxTracked`, or stop
 * tracking it; allowed mid-dive (the pause). Stub (B1).
 */
export function trackQuest(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _questId: QuestId,
  _on: boolean,
): ProfileActionResult {
  throw new Error('trackQuest: not implemented');
}

/** The journal opened `questId`: it is NEW no more. Allowed mid-dive. Stub (B1). */
export function markQuestSeen(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _questId: QuestId,
): DelveProfile {
  throw new Error('markQuestSeen: not implemented');
}
```

with:

```ts
/** Whether `questId` is open in the journal: an unlocked, unclaimed quest or a contract on the board. */
function isOpen(q: ProfileQuests, questId: QuestId): boolean {
  return (
    (q.unlocked.includes(questId) && !q.claimed.includes(questId)) ||
    q.board.some((c) => c?.id === questId)
  );
}

/**
 * Track `questId` on the HUD (`on`), up to `delve.quests.maxTracked`, or stop
 * tracking it; allowed mid-dive (the pause). Refuses a quest that isn't open
 * and a tracker that is full.
 */
export function trackQuest(
  registry: DataRegistry,
  profile: DelveProfile,
  questId: QuestId,
  on: boolean,
): ProfileActionResult {
  const q = profile.quests;
  if (!on)
    return { ok: true, profile: withQuests(profile, { tracked: without(q.tracked, questId) }) };
  if (!isOpen(q, questId)) return { ok: false, profile, reason: 'No such quest' };
  if (q.tracked.includes(questId)) return { ok: true, profile };
  const { maxTracked } = registry.getDelveBalance().quests;
  if (q.tracked.length >= maxTracked)
    return { ok: false, profile, reason: `Track at most ${maxTracked} quests` };
  return { ok: true, profile: withQuests(profile, { tracked: [...q.tracked, questId] }) };
}

/** The journal opened `questId`: it is NEW no more. Allowed mid-dive. */
export function markQuestSeen(
  _registry: DataRegistry,
  profile: DelveProfile,
  questId: QuestId,
): DelveProfile {
  const q = profile.quests;
  if (q.seen.includes(questId) || !(q.unlocked.includes(questId) || isOpen(q, questId)))
    return profile;
  return withQuests(profile, { seen: [...q.seen, questId] });
}
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-progress.test.ts)`
Expected: PASS, 13 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1822 passed | 5 skipped** in **102 passed | 1 skipped** files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-b1
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/quests.ts tests/delve-quests-progress.test.ts)
git add packages/engine/src/delve/quests.ts packages/engine/tests/delve-quests-progress.test.ts
git commit -m "feat(engine): questStates for the journal and the HUD; trackQuest and markQuestSeen" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: Claims and the arena

### Task 3: `claimQuest`

A claim at the Anvil grants the rewards through Phase A's `grantRewards` (`ProfileActionResult.rewards`) and runs the unlocks: the next main quest takes the claimed one's tracked slot, and state types are re-read, so a pattern reward counts. A claimed contract leaves the board, `tracked` and `seen`, and `contractsClaimed` counts it. What a reward becomes is `resolveReward`'s (B2's): this task's tests mock it, so they test the claim's path whether or not B2 has landed.

**Files:**
- Create: `packages/engine/tests/delve-quests-claim.test.ts`
- Modify: `packages/engine/src/delve/quests.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-quests-claim.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { startDive } from '../src/delve/dive.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { applyQuestEvents, claimQuest, questStates, trackQuest } from '../src/delve/quests.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Contract, QuestEvent, Reward } from '../src/types/quests.js';
import { obj, quest, questRegistry, value } from './fixtures/quests.js';

// Claiming (see the quests spec's "Claiming"), on fixture quests. What a reward
// becomes is `resolveReward`'s (B2's, tested with it): here a pattern reward
// teaches its pattern and any other is its count in scrap.
vi.mock('../src/delve/rewards.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/delve/rewards.js')>()),
  resolveReward: (_registry: unknown, profile: DelveProfile, reward: Reward) =>
    reward.kind === 'pattern'
      ? {
          profile: { ...profile, patterns: [...profile.patterns, reward.id!] },
          granted: { ref: { kind: 'pattern', pattern: reward.id! }, count: 1 },
        }
      : {
          profile: { ...profile, scrap: profile.scrap + reward.count },
          granted: { ref: { kind: 'scrap' }, count: reward.count },
        },
}));

const REFINE: QuestEvent = { type: 'refine' };
const reg = questRegistry([
  quest('m1', [obj('refine', 1)], {
    kind: 'main',
    rewards: [
      { kind: 'scrap', count: 40 },
      { kind: 'dust', count: 2 },
    ],
  }),
  quest('side', [obj('refine', 1)]),
  quest('m2', [obj('bind', 1)], { kind: 'main', unlock: { after: 'm1' } }),
  quest('teach', [obj('refine', 1)], { rewards: [{ kind: 'pattern', id: 'axe', count: 1 }] }),
  quest('collector', [obj('knowPatterns', 4)], { unlock: { after: 'teach' } }),
]);
/** At the Anvil: m1 and side tracked, every refine quest done. */
function done(): DelveProfile {
  const p = createDelveProfile(reg, 1, { primary: 'fire' });
  return applyQuestEvents(reg, trackQuest(reg, p, 'side', true).profile, [REFINE]);
}

describe('claiming', () => {
  it("grants the rewards and claims; the next main quest unlocks into the claimed one's tracked slot", () => {
    const p = done();
    const r = claimQuest(reg, p, 'm1');
    expect(r.ok).toBe(true);
    expect(r.rewards).toEqual([
      { ref: { kind: 'scrap' }, count: 40 },
      { ref: { kind: 'scrap' }, count: 2 },
    ]);
    expect(r.profile.scrap).toBe(p.scrap + 42);
    expect(r.profile.quests).toMatchObject({
      claimed: ['m1'],
      unlocked: ['m1', 'side', 'teach', 'm2'],
      tracked: ['m2', 'side'],
      claimCount: 1,
    });
    expect(questStates(reg, r.profile).map((s) => [s.id, s.status])).toEqual([
      ['m1', 'claimed'],
      ['m2', 'active'],
      ['side', 'complete'],
      ['teach', 'complete'],
    ]);
  });

  it('the next main quest takes the first free slot when the claimed one was not tracked', () => {
    const p = trackQuest(reg, done(), 'm1', false).profile;
    expect(claimQuest(reg, p, 'm1').profile.quests.tracked).toEqual(['side', 'm2']);
  });

  it('an early bind completes the main quest that asks for one when it unlocks', () => {
    const p = bindSecondary(reg, done(), 'frost').profile;
    const r = claimQuest(reg, p, 'm1');
    expect(r.profile.quests.progress.m2).toEqual([{ value: 1, done: true }]);
    expect(questStates(reg, r.profile).find((s) => s.id === 'm2')!.status).toBe('complete');
  });

  it('reads the state types again: a pattern its rewards teach counts at once', () => {
    const r = claimQuest(reg, done(), 'teach');
    expect(r.rewards).toEqual([{ ref: { kind: 'pattern', pattern: 'axe' }, count: 1 }]);
    expect(r.profile.quests.unlocked).toContain('collector');
    expect(value(r.profile, 'collector')).toBe(r.profile.patterns.length);
  });

  it('refuses mid-dive, an unfinished, locked, unknown or claimed quest, changing nothing', () => {
    const p = createDelveProfile(reg, 1, { primary: 'fire' });
    const refused = (q: DelveProfile, id: string) => {
      const r = claimQuest(reg, q, id);
      expect(r.profile).toBe(q);
      return [r.ok, r.reason];
    };
    expect(refused(p, 'm1')).toEqual([false, 'Finish its objectives first']);
    expect(refused(p, 'm2')).toEqual([false, 'No such quest']);
    expect(refused(p, 'nope')).toEqual([false, 'No such quest']);
    expect(refused(claimQuest(reg, done(), 'm1').profile, 'm1')).toEqual([
      false,
      'Already claimed',
    ]);
    expect(refused(startDive(reg, done(), 1), 'm1')).toEqual([
      false,
      'Claim at the Anvil, between dives',
    ]);
  });

  it('a claimed contract leaves the board, tracked and seen, and counts', () => {
    const contract: Contract = {
      id: 'contract:4',
      template: 'refines',
      tier: 'easy',
      name: 'Smelting',
      line: 'Melt it down.',
      objectives: [obj('refine', 2)],
      rewards: [{ kind: 'scrap', count: 25 }],
      progress: [{ value: 1, done: false }],
    };
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    p = { ...p, quests: { ...p.quests, board: [null, contract, null], seen: ['contract:4'] } };
    p = trackQuest(reg, p, 'contract:4', true).profile;
    expect(claimQuest(reg, p, 'contract:4').reason).toBe('Finish its objectives first');
    p = applyQuestEvents(reg, p, [REFINE]);
    const r = claimQuest(reg, p, 'contract:4');
    expect(r.rewards).toEqual([{ ref: { kind: 'scrap' }, count: 25 }]);
    expect(r.profile.scrap).toBe(p.scrap + 25);
    expect(r.profile.quests).toMatchObject({
      board: [null, null, null],
      tracked: ['m1'],
      seen: [],
      contractsClaimed: 1,
      claimCount: 1,
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-claim.test.ts)`
Expected: FAIL, 6 of 6: `Error: claimQuest: not implemented` (the refusal test included: its first claim is at the Anvil).

- [ ] **Step 3: The claim**

In `packages/engine/src/delve/quests.ts`:

Replace:

```ts
const CLAIM_AT_ANVIL = 'Claim at the Anvil, between dives';

/**
 * Claim a completed, unclaimed quest or contract: its rewards into the
 * stockpile (`grantRewards`, `ProfileActionResult.rewards`); it leaves
 * `tracked`; a main quest's claim unlocks the next; a contract leaves the
 * board (`contractsClaimed` + 1, its id out of `seen`). Refused mid-dive. Stub
 * (B1) past the dive lock.
 */
export function claimQuest(
  _registry: DataRegistry,
  profile: DelveProfile,
  _questId: QuestId,
): ProfileActionResult {
  if (isDiveActive(profile)) return { ok: false, profile, reason: CLAIM_AT_ANVIL };
  throw new Error('claimQuest: not implemented');
}
```

with:

```ts
const CLAIM_AT_ANVIL = 'Claim at the Anvil, between dives';
const NOT_DONE = 'Finish its objectives first';

/**
 * Claim a completed, unclaimed quest or contract: its rewards into the
 * stockpile (`grantRewards`, `ProfileActionResult.rewards`); it leaves
 * `tracked`; a main quest's claim unlocks the next, which takes its tracked
 * slot; a contract leaves the board (`contractsClaimed` + 1, its id out of
 * `seen`). Then the state types are read again (a pattern reward). Refused
 * mid-dive.
 */
export function claimQuest(
  registry: DataRegistry,
  profile: DelveProfile,
  questId: QuestId,
): ProfileActionResult {
  if (isDiveActive(profile)) return { ok: false, profile, reason: CLAIM_AT_ANVIL };
  const q = profile.quests;
  const slot = q.board.findIndex((c) => c?.id === questId);
  if (slot >= 0) {
    const contract = q.board[slot]!;
    if (!contract.progress.every((p) => p.done)) return { ok: false, profile, reason: NOT_DONE };
    const r = grantRewards(registry, profile, questId, contract.rewards);
    const left = withQuests(r.profile, {
      board: r.profile.quests.board.map((c, i) => (i === slot ? null : c)),
      contractsClaimed: r.profile.quests.contractsClaimed + 1,
      tracked: without(r.profile.quests.tracked, questId),
      seen: without(r.profile.quests.seen, questId),
    });
    return { ok: true, rewards: r.granted, profile: applyQuestEvents(registry, left, []) };
  }
  const def = questDef(registry, questId);
  if (!def || !q.unlocked.includes(questId)) return { ok: false, profile, reason: 'No such quest' };
  if (q.claimed.includes(questId)) return { ok: false, profile, reason: 'Already claimed' };
  if (!def.objectives.every((_, i) => q.progress[questId]?.[i]?.done))
    return { ok: false, profile, reason: NOT_DONE };
  const r = grantRewards(registry, profile, questId, def.rewards);
  const claimed = withQuests(r.profile, { claimed: [...r.profile.quests.claimed, questId] });
  // The next main quest unlocks into this one's tracked slot; then this one leaves `tracked`.
  const next = applyQuestEvents(registry, claimed, []);
  return {
    ok: true,
    rewards: r.granted,
    profile: withQuests(next, { tracked: without(next.quests.tracked, questId) }),
  };
}
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-claim.test.ts)`
Expected: PASS, 6 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1828 passed | 5 skipped** in **103 passed | 1 skipped** files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-b1
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/quests.ts tests/delve-quests-claim.test.ts)
git add packages/engine/src/delve/quests.ts packages/engine/tests/delve-quests-claim.test.ts
git commit -m "feat(engine): claimQuest: rewards through grantRewards, the next main quest, contracts off the board" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: The arena's events and the floor flags

A kill carries its kind, biome and element; a boss's kill carries nothing (S4). Each reaction and each perfect dodge adds one event. Every push sits under `!world.sandbox`. `hurt` is set once damage gets through, and `potionDrunk` when a potion is drunk.

**Files:**
- Create: `packages/engine/tests/delve-quests-emission.test.ts`
- Modify: `packages/engine/src/arpg/combat.ts`, `src/arpg/dodge.ts`, `src/arpg/step.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-quests-emission.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  BASIC_STATUS,
  applyStatus,
  hitMonster,
  hurtHero,
  killMonster,
  makeCtx,
} from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { STEP, arena, dodge, dummy, registry, run } from './fixtures/arena.js';

// Where quest events come from (see the quests spec's "Quest events (the engine)").

const ctxOf = (w: ArpgWorld) => makeCtx(registry, w, []);
/** Set off fire + frost's reaction on the world's first foe. */
function react(w: ArpgWorld): void {
  const ctx = ctxOf(w);
  applyStatus(ctx, w.monsters[0], BASIC_STATUS.fire, 100, true);
  hitMonster(ctx, w.monsters[0], 10, 'frost', { source: 'skill' });
}

describe('quest events in the arena', () => {
  it("a kill carries the foe's kind, biome and element; a boss's carries nothing", () => {
    const w = arena([
      dummy(13, 20),
      dummy(15, 20, { kind: 'elite', element: 'frost' }),
      dummy(17, 20, { kind: 'boss' }),
    ]);
    for (const m of [...w.monsters]) killMonster(ctxOf(w), m);
    expect(w.pending.questEvents).toEqual([
      { type: 'kill', kind: 'normal', biome: w.biomeId, element: 'fire' },
      { type: 'kill', kind: 'elite', biome: w.biomeId, element: 'frost' },
    ]);
  });

  it('a reaction and a perfect dodge each add one', () => {
    const w = arena([dummy(13, 20)], { noBasic: true });
    react(w);
    dodge(w);
    hurtHero(ctxOf(w), 50, null, null);
    expect(w.pending.questEvents).toEqual([
      { type: 'reaction', reaction: registry.getReactionFor('fire', 'frost').id },
      { type: 'perfectDodge' },
    ]);
  });

  it('the floor flags: damage taken (not a dodged hit) and a potion drunk', () => {
    const w = arena([], { noBasic: true });
    dodge(w);
    hurtHero(ctxOf(w), 50, null, null);
    expect([w.hurt, w.potionDrunk]).toEqual([false, false]);
    run(w, 1);
    hurtHero(ctxOf(w), 50, null, null);
    expect([w.hurt, w.potionDrunk]).toEqual([true, false]);
    stepWorld(registry, w, { move: { x: 0, y: 0 }, potion: true }, STEP);
    expect(w.potionDrunk).toBe(true);
  });

  it('the Training Grounds add none', () => {
    const w = arena([dummy(13, 20), dummy(15, 20)], { noBasic: true });
    w.sandbox = { infiniteMana: false, noCooldowns: false, invulnerable: false };
    react(w);
    killMonster(ctxOf(w), w.monsters[1]);
    dodge(w);
    hurtHero(ctxOf(w), 50, null, null);
    expect(w.pending.questEvents).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-emission.test.ts)`
Expected: FAIL, 3 of 4: the kill test (`expected [] to deeply equal [ { type: 'kill', …(3) }, …(1) ]`), the reaction and perfect dodge test (`expected [] to deeply equal [ { type: 'reaction', …(1) }, …(1) ]`) and the flags test (`expected [ false, false ] to deeply equal [ true, false ]`). `the Training Grounds add none` passes already (nothing emits yet).

- [ ] **Step 3: The pushes and the flags**

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
  if (!ctx.world.pending.reactions.includes(reaction)) ctx.world.pending.reactions.push(reaction);
}
```

with:

```ts
  if (!ctx.world.pending.reactions.includes(reaction)) ctx.world.pending.reactions.push(reaction);
  if (!ctx.world.sandbox) ctx.world.pending.questEvents.push({ type: 'reaction', reaction });
}
```

Replace:

```ts
  if (!world.sandbox) {
    // A replayed floor's foe that already gave gear or a pattern this dive gives neither again.
```

with:

```ts
  if (!world.sandbox) {
    // A boss counts for the quests only when its floor completes (`boss`), so a replay can't double it.
    if (m.kind !== 'boss')
      world.pending.questEvents.push({
        type: 'kill',
        kind: m.kind,
        biome: world.biomeId,
        element: m.element,
      });
    // A replayed floor's foe that already gave gear or a pattern this dive gives neither again.
```

Replace:

```ts
  if (dmg <= 0) return;
```

with:

```ts
  if (dmg <= 0) return;
  world.hurt = true;
```

In `packages/engine/src/arpg/dodge.ts`:

Replace:

```ts
  ctx.events.push({ kind: 'perfectDodge', x: h.x, y: h.y });
```

with:

```ts
  ctx.events.push({ kind: 'perfectDodge', x: h.x, y: h.y });
  if (!world.sandbox) world.pending.questEvents.push({ type: 'perfectDodge' });
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
      h.potions--;
```

with:

```ts
      h.potions--;
      world.potionDrunk = true;
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-emission.test.ts)`
Expected: PASS, 4 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1832 passed | 5 skipped** in **104 passed | 1 skipped** files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-b1
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/combat.ts src/arpg/dodge.ts src/arpg/step.ts tests/delve-quests-emission.test.ts)
git add packages/engine/src/arpg/combat.ts packages/engine/src/arpg/dodge.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-quests-emission.test.ts
git commit -m "feat(engine): the arena's quest events (kills, reactions, perfect dodges) and floor flags" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The dive and the Anvil

### Task 5: The dive's events: banks, floors, depths, extracts and the dive scope

`bankWorld` applies the world's events and empties them, so progress counts at every bank, whatever follows; bank timing doesn't change totals. `completeFloor` counts `clearFloor` with its flags, and `boss` when the boss fell, once a floor. `startDive` and `chooseDoor` count the depth entered, and `extractDive` the extract, before its settle. A dive's start and its settle reset the dive scope; the settle does it before the board's refill.

**Files:**
- Modify: `packages/engine/src/delve/dive.ts` (hand-edited, never formatted), `packages/engine/tests/delve-quests-emission.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-quests-emission.test.ts`:

Replace:

```ts
import { stepWorld } from '../src/arpg/step.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { STEP, arena, dodge, dummy, registry, run } from './fixtures/arena.js';
```

with:

```ts
import { stepWorld } from '../src/arpg/step.js';
import {
  bankWorld,
  beginFloor,
  chooseDoor,
  closeDive,
  completeFloor,
  extractDive,
  failFloor,
  startDive,
} from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { applyQuestEvents } from '../src/delve/quests.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { QuestEvent } from '../src/types/quests.js';
import { STEP, arena, dodge, dummy, registry, run } from './fixtures/arena.js';
import { obj, quest, questRegistry, value } from './fixtures/quests.js';
```

Append at the end of the file:

```ts
describe('quest events in a dive', () => {
  const PERFECT: QuestEvent = { type: 'perfectDodge' };
  const BOSS_DEPTH = registry.getDelveBalance().dive.bossEvery;
  const reg = questRegistry([
    quest('kills', [obj('kill', 99)]),
    quest('floors', [obj('clearFloor', 99)]),
    quest('clean', [obj('clearFloor', 99, { filter: { noPotion: true, noDamage: true } })]),
    quest('dry', [obj('clearFloor', 99, { filter: { noPotion: true } })]),
    quest('boss', [
      obj('boss', 99, { filter: { biome: registry.getBiomeForDepth(BOSS_DEPTH).id } }),
    ]),
    quest('depth', [obj('reachDepth', 99, { scope: 'dive' })]),
    quest('out', [obj('extract', 99, { filter: { minDepth: 2 } })]),
    quest('dodges', [obj('perfectDodge', 3, { scope: 'dive' })]),
    quest('dodge', [obj('perfectDodge', 1, { scope: 'dive' })]),
  ]);
  const diving = () => startDive(reg, createDelveProfile(reg, 4, { primary: 'fire' }), 1);
  /** Kill the floor's first `n` foes, banking after each kill or only once, then fall. */
  function killThenFall(p: DelveProfile, n: number, bankEach: boolean): DelveProfile {
    const w = beginFloor(reg, p);
    let q = p;
    for (const m of w.monsters.slice(0, n)) {
      killMonster(makeCtx(reg, w, []), m);
      if (bankEach) q = bankWorld(reg, q, w).profile;
    }
    return failFloor(reg, q, w).profile;
  }
  /** Clear the floor, then take the first door. */
  function nextFloor(p: DelveProfile, flags: Partial<ArpgWorld> = {}): DelveProfile {
    const w = Object.assign(beginFloor(reg, p), flags);
    const cleared = completeFloor(reg, p, w).profile;
    return chooseDoor(reg, cleared, cleared.dive!.doorChoices[0]);
  }

  it("a bank applies the world's quest events and empties them", () => {
    const p = diving();
    const w = beginFloor(reg, p);
    killMonster(makeCtx(reg, w, []), w.monsters[0]);
    w.pending.questEvents.push(PERFECT);
    const banked = bankWorld(reg, p, w).profile;
    expect([value(banked, 'kills'), value(banked, 'dodges')]).toEqual([1, 1]);
    expect(w.pending.questEvents).toEqual([]);
    expect(bankWorld(reg, banked, w).profile.quests).toEqual(banked.quests);
  });

  it('progress counts even when the hero falls, whenever the world banks', () => {
    const once = killThenFall(diving(), 3, false);
    const each = killThenFall(diving(), 3, true);
    expect(once.dive!.phase).toBe('dead');
    expect([value(once, 'kills'), value(each, 'kills')]).toEqual([3, 3]);
    expect(each.quests).toEqual(once.quests);
  });

  it('a cleared floor counts with its flags: a potion or a hit spoils it for noPotion / noDamage', () => {
    let p = nextFloor(diving());
    p = nextFloor(p, { hurt: true });
    p = nextFloor(p, { potionDrunk: true });
    expect(['floors', 'clean', 'dry'].map((id) => value(p, id))).toEqual([3, 1, 2]);
  });

  it("a boss counts once, when its floor completes: a replayed floor's boss doesn't double it", () => {
    const p0 = diving();
    const p = { ...p0, dive: { ...p0.dive!, depth: BOSS_DEPTH } };
    // The boss falls, the world banks, and the hero leaves for the Anvil: the floor replays.
    const first = beginFloor(reg, p);
    killMonster(makeCtx(reg, first, []), first.monsters.find((m) => m.kind === 'boss')!);
    const left = bankWorld(reg, p, first).profile;
    expect(value(left, 'boss')).toBe(0);
    const replay = beginFloor(reg, left);
    killMonster(makeCtx(reg, replay, []), replay.monsters.find((m) => m.kind === 'boss')!);
    const won = completeFloor(reg, left, replay).profile;
    expect([value(won, 'boss'), value(won, 'kills')]).toEqual([1, 0]);
  });

  it('a dive enters its first depth, each door the next; an extract counts with its depth', () => {
    let p = diving();
    expect(value(p, 'depth')).toBe(1);
    p = nextFloor(p);
    expect(value(p, 'depth')).toBe(p.dive!.depth);
    const w = beginFloor(reg, p);
    const out = extractDive(reg, completeFloor(reg, p, w).profile);
    expect(value(out, 'out')).toBe(1);
  });

  it('dive-scoped progress starts afresh when a dive starts and when it settles; a done one stays', () => {
    let p = applyQuestEvents(reg, createDelveProfile(reg, 4, { primary: 'fire' }), [PERFECT]);
    expect([value(p, 'dodges'), value(p, 'dodge')]).toEqual([1, 1]);
    p = startDive(reg, p, 1);
    expect([value(p, 'dodges'), value(p, 'dodge')]).toEqual([0, 1]);
    const w = beginFloor(reg, p);
    w.pending.questEvents.push(PERFECT, PERFECT);
    p = bankWorld(reg, p, w).profile;
    expect(value(p, 'dodges')).toBe(2);
    p = closeDive(reg, p);
    expect([value(p, 'dodges'), value(p, 'depth'), value(p, 'dodge')]).toEqual([0, 0, 1]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-emission.test.ts)`
Expected: FAIL, 6 of 10, the new ones: nothing counts yet (`expected [ +0, +0 ] to deeply equal [ 1, 1 ]`, `… [ 3, 3 ]`, `expected [ +0, +0, +0 ] to deeply equal [ 3, 1, 2 ]`, `expected [ +0, +0 ] to deeply equal [ 1, +0 ]`, `expected +0 to be 1`) and nothing resets (`expected [ 1, 1 ] to deeply equal [ +0, 1 ]`); Task 4's 4 pass.

- [ ] **Step 3: The dive's events**

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
import { refillBoard } from './contracts.js';
```

with:

```ts
import { refillBoard } from './contracts.js';
import { applyQuestEvents, resetDiveQuests } from './quests.js';
import type { QuestEvent } from '../types/quests.js';
```

Replace:

```ts
  return {
    ...profile,
    dive,
    diveCount: profile.diveCount + 1,
    bestDepth: Math.max(profile.bestDepth, startDepth),
    stats: { ...profile.stats, dives: profile.stats.dives + 1 },
  };
}
```

with:

```ts
  const started: DelveProfile = {
    ...profile,
    dive,
    diveCount: profile.diveCount + 1,
    bestDepth: Math.max(profile.bestDepth, startDepth),
    stats: { ...profile.stats, dives: profile.stats.dives + 1 },
  };
  // A dive's dive-scoped objectives start afresh, and it enters its first depth (see the quests spec).
  return applyQuestEvents(registry, resetDiveQuests(registry, started), [{ type: 'reachDepth', depth: startDepth }]);
}
```

Replace:

```ts
 * parts rule (`opts.unsocket`, else the balance's). A world's first bank starts
 * the haul afresh (`WorldPending.newFloor`).
 */
```

with:

```ts
 * parts rule (`opts.unsocket`, else the balance's). A world's first bank starts
 * the haul afresh (`WorldPending.newFloor`). Its quest events apply then, after
 * what it learned (`applyQuestEvents`), so progress counts at every bank,
 * whatever follows (see the quests spec).
 */
```

Replace:

```ts
  world.pending = emptyPending();
```

with:

```ts
  next = applyQuestEvents(registry, next, pending.questEvents);
  world.pending = emptyPending();
```

Replace:

```ts
  return {
    ...banked,
    profile: {
      ...banked.profile,
      firstEssenceGiven: banked.profile.firstEssenceGiven || essenceBanked,
      checkpoints,
      dive: nextDive,
      stats: { ...banked.profile.stats, bossKills: banked.profile.stats.bossKills + (bossKilled ? 1 : 0) },
    },
    bountyAdded,
```

with:

```ts
  const cleared: DelveProfile = {
    ...banked.profile,
    firstEssenceGiven: banked.profile.firstEssenceGiven || essenceBanked,
    checkpoints,
    dive: nextDive,
    stats: { ...banked.profile.stats, bossKills: banked.profile.stats.bossKills + (bossKilled ? 1 : 0) },
  };
  // The floor's quest events: a boss counts here, once a floor, never as a kill (the quests spec's S4).
  const events: QuestEvent[] = [
    { type: 'clearFloor', biome: world.biomeId, depth: dive.depth, noPotion: !world.potionDrunk, noDamage: !world.hurt },
  ];
  if (bossKilled) events.push({ type: 'boss', biome: world.biomeId });

  return {
    ...banked,
    profile: applyQuestEvents(registry, cleared, events),
    bountyAdded,
```

Replace:

```ts
  const depth = dive.depth + 1 + (door.mods.skip ?? 0);
  return {
    ...profile,
```

with:

```ts
  const depth = dive.depth + 1 + (door.mods.skip ?? 0);
  const entered: DelveProfile = {
    ...profile,
```

Replace:

```ts
      dropsGiven: [],
      phase: 'fighting',
    },
  };
}
```

with:

```ts
      dropsGiven: [],
      phase: 'fighting',
    },
  };
  return applyQuestEvents(registry, entered, [{ type: 'reachDepth', depth }]);
}
```

Replace:

```ts
  return settleDive(registry, extracted, 'extract');
```

with:

```ts
  // The extract counts before the settle, so the board's refill there comes after it.
  return settleDive(registry, applyQuestEvents(registry, extracted, [{ type: 'extract', depth: dive.depth }]), 'extract');
```

Replace:

```ts
  const settled: DelveProfile = {
    ...stockHaul(profile, kept),
    dive: { ...dive, haul: emptyHaul(), banked: kept, lost, settled: true },
  };
```

with:

```ts
  // The dive's quest events applied as it banked and extracted: its dive-scoped objectives start afresh.
  const settled = resetDiveQuests(registry, {
    ...stockHaul(profile, kept),
    dive: { ...dive, haul: emptyHaul(), banked: kept, lost, settled: true },
  });
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-emission.test.ts)`
Expected: PASS, 10 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1838 passed | 5 skipped** in **104 passed | 1 skipped** files (the pacing rails unchanged).

- [ ] **Step 5: Commit**

`dive.ts` isn't formatted (hand-edited, as Phase A's).

```bash
cd /c/Projects/alloy-quest-b1
(cd packages/engine && npx prettier --write --end-of-line auto tests/delve-quests-emission.test.ts)
git add packages/engine/src/delve/dive.ts packages/engine/tests/delve-quests-emission.test.ts
git commit -m "feat(engine): banks apply the dive's quest events; floors, bosses, depths and extracts count; the dive scope resets" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: The Anvil's events: forge, refine, bind, sockets and patterns

`forge` counts with the item's rarity and `legendary`, and `refine` counts each refine. `bindSecondary` passes `bind`, a state that is re-read at once. `setChains` counts each socket its Apply opens; `openSocket` is one `setChains`, so it counts once. `applySalvage` re-reads the state types after it learns a pattern, at the Anvil or mid-dive.

**Files:**
- Modify: `packages/engine/src/delve/crafting.ts`, `src/delve/pair.ts`, `src/delve/runes.ts`, `src/delve/moveset.ts`, `src/loot/salvage-yield.ts`, `packages/engine/tests/delve-quests-emission.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-quests-emission.test.ts`:

Replace:

```ts
import { stepWorld } from '../src/arpg/step.js';
```

with:

```ts
import { stepWorld } from '../src/arpg/step.js';
import { forge, refine } from '../src/delve/crafting.js';
```

Replace:

```ts
import { createDelveProfile } from '../src/delve/profile.js';
import { applyQuestEvents } from '../src/delve/quests.js';
import type { ArpgWorld } from '../src/types/arpg.js';
```

with:

```ts
import { setChains } from '../src/delve/moveset.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile, salvageItems } from '../src/delve/profile.js';
import { applyQuestEvents } from '../src/delve/quests.js';
import { openSocket } from '../src/delve/runes.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { ForgeRequest } from '../src/types/crafting.js';
```

Replace:

```ts
import { STEP, arena, dodge, dummy, registry, run } from './fixtures/arena.js';
```

with:

```ts
import { STEP, arena, chainsOf, dodge, dummy, registry, run } from './fixtures/arena.js';
```

Append at the end of the file:

```ts
describe('quest events at the Anvil', () => {
  const reg = questRegistry([
    quest('forged', [obj('forge', 99)]),
    quest('fine', [obj('forge', 99, { filter: { minRarity: 'uncommon' } })]),
    quest('legend', [obj('forge', 99, { filter: { legendary: true } })]),
    quest('refined', [obj('refine', 99)]),
    quest('bound', [obj('bind', 1)]),
    quest('sockets', [obj('openSocket', 99)]),
    quest('patterns', [obj('knowPatterns', 99)]),
  ]);
  const smith = () => ({
    ...createDelveProfile(reg, 3, { primary: 'fire' }),
    scrap: 9999,
    links: 99,
  });

  it('a forge counts with its rarity, a refine each time', () => {
    const req: ForgeRequest = {
      baseId: 'sword',
      metal: 'rusty',
      flux: 'uncommon',
      element: 'fire',
      shards: [],
    };
    const res = forge(reg, smith(), req);
    expect(res.item!.rarity).toBe('uncommon');
    const p = refine(reg, res.profile, { kind: 'flux', grade: 'uncommon' }).profile;
    expect(['forged', 'fine', 'legend', 'refined'].map((id) => value(p, id))).toEqual([1, 1, 0, 1]);
  });

  it('a bind counts at once', () => {
    expect(value(bindSecondary(reg, smith(), 'frost').profile, 'bound')).toBe(1);
  });

  it("each socket an Apply opens counts once, openSocket's one too", () => {
    const p = smith();
    const basic = chainsOf(p).basic!;
    const opened = setChains(reg, p, { basic: basic.map((b) => ({ ...b, runes: [null] })) });
    expect(opened.ok).toBe(true);
    expect(value(opened.profile, 'sockets')).toBe(basic.length);
    expect(value(openSocket(reg, p, 'primary', 0).profile, 'sockets')).toBe(1);
  });

  it('a pattern learned by salvage counts at once', () => {
    const axe = generateItem(
      reg,
      { uid: 'b0', ilvl: 1, rarity: 'common', slot: 'weapon', baseId: 'axe', mana: 'fire' },
      new SeededRNG(1),
    );
    const p = smith();
    const melted = salvageItems(reg, { ...p, bag: [axe] }, ['b0']).profile;
    expect(melted.patterns).toContain('axe');
    expect(value(melted, 'patterns')).toBe(p.patterns.length + 1);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-emission.test.ts)`
Expected: FAIL, 4 of 14, the new ones: `expected [ +0, +0, +0, +0 ] to deeply equal [ 1, 1, +0, 1 ]` (forge and refine), `expected +0 to be 1` (bind), `expected +0 to be 3` (the sockets: the sword's three blows) and `expected 3 to be 4` (the salvaged pattern); the other 10 pass.

- [ ] **Step 3: The Anvil's events**

In `packages/engine/src/delve/crafting.ts`:

Replace:

```ts
import { isDiveActive } from './dive.js';
```

with:

```ts
import { isDiveActive } from './dive.js';
import { applyQuestEvents } from './quests.js';
```

Replace:

```ts
  return { ok: true, item, profile: recordFinds(paid, [item]).profile };
```

with:

```ts
  const forged = recordFinds(paid, [item]).profile;
  const event = { type: 'forge', rarity: item.rarity, legendary: !!item.legendary } as const;
  return { ok: true, item, profile: applyQuestEvents(registry, forged, [event]) };
```

Replace:

```ts
  return {
    ok: true,
    profile: {
      ...profile,
      materials: withMaterial(withMaterial(profile.materials, what, -cost.count), next, 1),
      scrap: profile.scrap - cost.scrap,
    },
  };
```

with:

```ts
  const refined: DelveProfile = {
    ...profile,
    materials: withMaterial(withMaterial(profile.materials, what, -cost.count), next, 1),
    scrap: profile.scrap - cost.scrap,
  };
  return { ok: true, profile: applyQuestEvents(registry, refined, [{ type: 'refine' }]) };
```

In `packages/engine/src/delve/pair.ts`:

Replace:

```ts
import { settleParts, type SetChainsOptions } from './runes.js';
```

with:

```ts
import { applyQuestEvents } from './quests.js';
import { settleParts, type SetChainsOptions } from './runes.js';
```

Replace:

```ts
export function bindSecondary(
  _registry: DataRegistry,
```

with:

```ts
export function bindSecondary(
  registry: DataRegistry,
```

Replace:

```ts
  return { ok: true, profile: { ...profile, pair: { primary, secondary: mana } } };
```

with:

```ts
  const bound = { ...profile, pair: { primary, secondary: mana } };
  return { ok: true, profile: applyQuestEvents(registry, bound, [{ type: 'bind' }]) };
```

In `packages/engine/src/delve/runes.ts`:

Replace:

```ts
export interface RuneChange {
  /** Sockets opened. */
  links: number;
```

with:

```ts
export interface RuneChange {
  /** How many sockets it opens. */
  opened: number;
  /** Sockets opened. */
  links: number;
```

Replace:

```ts
  const change: Omit<RuneChange, 'pouch'> = {
    links: 0,
```

with:

```ts
  const change: Omit<RuneChange, 'pouch'> = {
    opened: 0,
    links: 0,
```

Replace:

```ts
          const price = socketPrice(registry, i)!;
```

with:

```ts
          const price = socketPrice(registry, i)!;
          change.opened++;
```

In `packages/engine/src/delve/moveset.ts`:

Replace:

```ts
import { withMoveset, type ProfileActionResult } from './profile.js';
import { runeChange, settleParts, type SetChainsOptions } from './runes.js';
```

with:

```ts
import { withMoveset, type ProfileActionResult } from './profile.js';
import { applyQuestEvents } from './quests.js';
import { runeChange, settleParts, type SetChainsOptions } from './runes.js';
```

Replace:

```ts
  const edited = withMoveset(profile, { ...moveset, chains: next });
  return {
    ok: true,
    runes: settled.runes,
    destroyed: settled.destroyed,
    profile: {
      ...edited,
      manaDust: profile.manaDust - price,
      links: profile.links - change.links + change.refundLinks,
      scrap: profile.scrap - change.scrap,
      runes,
    },
  };
```

with:

```ts
  const edited = withMoveset(profile, { ...moveset, chains: next });
  const paid: DelveProfile = {
    ...edited,
    manaDust: profile.manaDust - price,
    links: profile.links - change.links + change.refundLinks,
    scrap: profile.scrap - change.scrap,
    runes,
  };
  // Each socket the Apply opens is a quest event (see the quests spec).
  const opened = Array.from({ length: change.opened }, () => ({ type: 'openSocket' }) as const);
  return {
    ok: true,
    runes: settled.runes,
    destroyed: settled.destroyed,
    profile: applyQuestEvents(registry, paid, opened),
  };
```

In `packages/engine/src/loot/salvage-yield.ts`:

Replace:

```ts
import { salvageDust } from '../delve/pair.js';
```

with:

```ts
import { salvageDust } from '../delve/pair.js';
import { applyQuestEvents } from '../delve/quests.js';
```

Replace:

```ts
    learned = { ...learned, essencesSeen: [...learned.essencesSeen, y.essence] };
```

with:

```ts
    learned = { ...learned, essencesSeen: [...learned.essencesSeen, y.essence] };
  // A pattern learned is a quest state (`knowPatterns`): read it again.
  if (y.pattern) learned = applyQuestEvents(registry, learned, []);
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-emission.test.ts)`
Expected: PASS, 14 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1842 passed | 5 skipped** in **104 passed | 1 skipped** files (the pacing rails unchanged).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-b1
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/crafting.ts src/delve/pair.ts src/delve/runes.ts src/delve/moveset.ts src/loot/salvage-yield.ts tests/delve-quests-emission.test.ts)
git add packages/engine/src/delve/crafting.ts packages/engine/src/delve/pair.ts packages/engine/src/delve/runes.ts packages/engine/src/delve/moveset.ts packages/engine/src/loot/salvage-yield.ts packages/engine/tests/delve-quests-emission.test.ts
git commit -m "feat(engine): the Anvil's quest events: forges, refines, binds, sockets opened, patterns learned" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Verification

- [ ] **The engine, whole:**

```bash
cd /c/Projects/alloy-quest-b1
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
```

Expected: no type errors; **1842 passed | 5 skipped** in **104 passed | 1 skipped** files, the pacing rails among them.

- [ ] **The bundle and the client:**

```bash
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

Expected: tsup's "Build success" lines; no client type errors; the client suite passes, **1244 tests in 153 files** (C1's hub tests stub `useQuests`). `dist` is ignored: nothing to commit.

- [ ] **What the spec asks of B1, and where it's tested:**
  - **Objectives**, `delve-quests-progress.test.ts`:
    - each type and every filter;
    - sum, max and state;
    - `total` and `dive` scope;
    - the cap;
    - completion.
  - **Unlocks**:
    - the main chain, in `delve-quests-claim.test.ts`;
    - side conditions;
    - state credit for an early bind (in both files).
  - **Claims**, `delve-quests-claim.test.ts`:
    - refused mid-dive;
    - rewards through `resolveReward`, into `rewards`;
    - a contract leaves the board.
  - **Progress always counts** (a death after kills keeps them, and bank timing doesn't change totals), `delve-quests-emission.test.ts`.
  - **No double boss** on a replayed floor, `delve-quests-emission.test.ts`.
  - **Emission**, `delve-quests-emission.test.ts`:
    - `setChains` and `openSocket` count each socket opened;
    - salvage counts a pattern learned;
    - the sandbox emits nothing.
  - The rest of the spec's engine tests are B2's: rule rewards resolving deterministically, `pattern: 'unknown'`'s fallback, and the board.
