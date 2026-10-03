# Delve quests · Phase A: the contract — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the quests stage's contract so B1, B2, C1 and C2 can work in parallel without editing each other's files: the quest types (the objective table, `QuestEvent`, `Reward`, `RewardView`, `QuestState`, the board's `Contract` and templates, the save's `quests`); a placeholder `quests.json` with its schema, the registry's getter and its cross-file checks; `balance.json → delve.quests`; save v9 with the quests and every older save reset; the arena's `WorldPending.questEvents` and floor flags; typed stubs for every engine op the areas fill, with the spec's call sites wired to them; the store's quest actions; and `useQuests` on the engine's `questStates` through a minimal adapter, the dev fixture and its flag gone. Nothing changes in play: the pacing rails pass unchanged.

**Architecture:** `src/types/quests.ts` holds every shape the areas trade in, and the objective table as data (`OBJECTIVE_TYPES`, `OBJECTIVE_RULES`: each type's progress mode, the filters it takes, whether only the Anvil advances it). `src/data/quests.json` is read through `QuestsDataSchema` into `registry.getQuestsData()` (the registry's tenth argument), and `questsDataProblems` (`src/data/quests-check.ts`) checks what the schema can't see (biomes, patterns, essences, `unlock.after`, the main chain), `createDefaultRegistry` refusing data with any. Every op an area fills is a typed stub in the file its area owns (`delve/quests.ts` B1, `delve/rewards.ts` and `delve/contracts.ts` B2), exported whole from `index.ts`. The wired calls stay safe without a guard where the stub is harmless (`applyQuestEvents` returns the profile, `questStates` returns `[]`) and behind a data check A's placeholder makes a no-op where it would throw (`refillBoard` runs only while `quests.json` holds contract templates, and A's holds none). The client's store wraps the four player ops; `useQuests` reads `questStates` for the stored profile and maps each to the existing `QuestView` (`quests/quest-view.ts`).

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, React 19, Zustand 5.

**Spec:** `docs/superpowers/specs/2026-10-03-delve-quests-design.md` (authoritative): "Phases and parallel areas" (the Phase A row), "The quest model" (the objective table, scope, state types, unlocks, rewards, claiming, tracking), "Quest events (the engine)", "The Contract board", "The client" (`QuestState`, `RewardView`), "Data, tuning and the save". The overview is `00-overview.md` in this folder.

---

## Base

- **Starts from:** `quest/main` at `ffa0194` (v0.58.0, the spec, the overview and Hesta's sprite), in this area's worktree `C:/Projects/alloy-quest-a` on branch `quest/a`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-quest-a -Branch quest/a -Base quest/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-quest-a` in Git Bash.
- **Anchors:** every edit was generated from, and checked against, `quest/main` at `ffa0194`: applied in this plan's order, task by task, they give exactly the files the tests below were run on (see "Checked on a scratch copy").
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-quest-a
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the engine suite reads **1769 passed | 5 skipped** tests in **95 passed | 1 skipped** files (the pacing rails included); the client suite **1221 tests in 152 files**. Call them **N** engine tests in **F** files and **M** client tests in **G** files; each task below says where they go.

## Files

| File | Change |
|---|---|
| `packages/engine/src/types/quests.ts` (new) | Every quest shape: `QuestId`, `QuestKind`, `ObjectiveScope`, `OBJECTIVE_TYPES`/`ObjectiveType`, `ObjectiveFilter`, `ObjectiveRule`, `OBJECTIVE_RULES` (the spec's objective table), `Objective`, `ObjectiveProgress`, `Unlock`, `REWARD_KINDS`/`RewardKind`, `Reward`, `QuestDef`, `CONTRACT_TIERS`/`ContractTier`, `ContractFilterRules`, `ContractTemplate`, `QuestsData`, `Contract`, `ProfileQuests`, `QuestEvent`, `RewardRef`, `RewardGrant`, `RewardView`, `QuestStatus`, `QuestState`, `QuestsBalance` |
| `packages/engine/src/types/index.ts` | exports `quests.ts` |
| `packages/engine/src/data/quests.json` (new) | the placeholder: Hesta (`sprite: "hesta"`), main quest 1 "First Steps", no contract templates (B2 writes the content) |
| `packages/engine/src/data/schemas.ts` | `ObjectiveSchema`, `RewardSchema`, `QuestsDataSchema`, `QuestsBalanceSchema`; `delve.quests` in the Delve balance |
| `packages/engine/src/data/quests-check.ts` (new) | `questsDataProblems`: the cross-file checks |
| `packages/engine/src/data/loader.ts`, `registry.ts`, `default-registry.ts` | `quests.json` loaded and validated; `registry.getQuestsData()`; the default registry refuses data with problems |
| `packages/engine/src/data/balance.json` | `delve.quests` (hand-edited, never formatted) |
| `packages/engine/src/types/delve.ts` | `DelveBalance.quests`; `DelveProfile` v9 with `quests` |
| `packages/engine/src/types/arpg.ts` | `WorldPending.questEvents`; `ArpgWorld.potionDrunk`, `hurt` |
| `packages/engine/src/arpg/world.ts` | the new fields' starting values |
| `packages/engine/src/delve/profile-schema.ts` | `DelveProfileSchema` v9 (`QuestsSchema`, `ContractSchema`) |
| `packages/engine/src/delve/profile.ts` | the v9 save; `parseDelveProfile` resets every other version; `ProfileActionResult.rewards`; `createDelveProfile` → `applyQuestEvents` and (with templates) `refillBoard` |
| `packages/engine/src/delve/quests.ts` (new, B1's) | `emptyQuests`, `grantRewards` (implemented); `claimQuest` (the dive lock implemented, then a stub); stubs `applyQuestEvents` (returns the profile), `questStates` (returns `[]`), `trackQuest`, `markQuestSeen` |
| `packages/engine/src/delve/rewards.ts` (new, B2's) | stub `resolveReward` |
| `packages/engine/src/delve/contracts.ts` (new, B2's) | stubs `generateContract`, `refillBoard`, `rerollContract` |
| `packages/engine/src/delve/dive.ts` | `settleDive` → `refillBoard` after a dive that cleared a depth, with templates (hand-edited) |
| `packages/engine/src/index.ts` | the quest modules exported whole; `questsDataProblems` |
| `packages/engine/tests/delve-quests-data.test.ts` (new) | the data, the objective table, the schema's and the registry's checks, `delve.quests` |
| `packages/engine/tests/delve-quests-save.test.ts` (new) | save v9: the empty quests, round trips, resets and refusals |
| `packages/engine/tests/delve-quests-contract.test.ts` (new) | the arena's fields, every export, the wired calls' guards, the claim's dive lock, `grantRewards` |
| `packages/engine/tests/delve-save-v8.test.ts`, `delve-dive.test.ts`, `delve-pair.test.ts`, `delve-profile-abilities.test.ts`, `delve-runes-contract.test.ts` | version 9 |
| `packages/engine/tests/delve-dps-sim.test.ts`, `delve-rune-costs-gate.test.ts`, `delve-rune-power.test.ts` | their registries take the quests data |
| `packages/client/src/stores/delveStore.ts` | `claimQuest`, `rerollContract`, `trackQuest`, `markQuestSeen` |
| `packages/client/src/stores/delveStore.test.ts` | version 9; the quest ops wrapped, a claim refused mid-dive |
| `packages/client/src/features/delve/__tests__/arena-bank.test.ts` | its pending fixture's `questEvents` |
| `packages/client/src/features/delve/quests/types.ts` | `QuestKind` is the engine's (`'bounty'` becomes `'contract'`) |
| `packages/client/src/features/delve/quests/quest-view.ts` (new, C1 extends) | `questView`: a `QuestState` as a `QuestView` |
| `packages/client/src/features/delve/quests/useQuests.ts` | `questStates` through `questView`; tracking through the store; the preview flag gone |
| `packages/client/src/features/delve/quests/sample.ts` → `quests/__tests__/quest-fixture.ts` | the dev fixture becomes a test fixture |
| `packages/client/src/features/delve/hub/quests/QuestsTab.tsx` | the Contracts group |
| tests: `quests/__tests__/useQuests.test.ts`, `QuestTracker.test.tsx`, `hub/quests/__tests__/QuestsTab.test.tsx`, `arena/hud/__tests__/FloorColumn.test.tsx` | the above |

## What Phase A implements, and what it leaves

**Implemented (and tested):** the types and the objective table; `quests.json`'s schema (shapes, ids, each type's filters, no `dive` scope on an Anvil-only type, what each reward kind names) and the registry's cross-file checks; `registry.getQuestsData()`; `delve.quests` and its schema; save v9 (`emptyQuests`) with every other version reset; `WorldPending.questEvents` and `ArpgWorld.potionDrunk` / `hurt` (fields only: nothing sets them yet); `ProfileActionResult.rewards`; `claimQuest`'s dive lock; `grantRewards` (a claim's rewards through `resolveReward` on the claim's stream); the store's actions; `useQuests` and `questView`.

**Stubs** (each in the file its area owns; "throws" is `"<name>: not implemented"`):

| Stub | File | Area | Until then | Wired here from |
|---|---|---|---|---|
| `applyQuestEvents` | `delve/quests.ts` | B1 | returns the profile (applies nothing) | `createDelveProfile` (the first unlocks) |
| `questStates` | `delve/quests.ts` | B1 | returns `[]` | `useQuests` |
| `claimQuest` | `delve/quests.ts` | B1 | refuses mid-dive (implemented), else throws | the store's `claimQuest` |
| `trackQuest`, `markQuestSeen` | `delve/quests.ts` | B1 | throw | the store's `trackQuest` (via `useQuests().setTracked`), `markQuestSeen` |
| `resolveReward` | `delve/rewards.ts` | B2 | throws | `grantRewards`, which B1's `claimQuest` calls |
| `generateContract`, `refillBoard`, `rerollContract` | `delve/contracts.ts` | B2 | throw | `createDelveProfile` and `settleDive` → `refillBoard`; the store's `rerollContract` |

**Why nothing throws in A:** `applyQuestEvents` and `questStates` are harmless stubs, so their call sites need no guard; `refillBoard` is called only while `registry.getQuestsData().contractTemplates` holds any, and A's `quests.json` holds none (B2 adds the templates with `refillBoard` itself, which flips both calls on with no edit to `profile.ts` or `dive.ts`; B2 may drop the guards if its `refillBoard` copes with no templates); `resolveReward` is reached only through `grantRewards` from B1's `claimQuest`, and A's test calls `grantRewards` with no rewards; the store's `claimQuest` reaches the stub only at the Anvil, and the store's other quest actions only from a quest the journal shows, and `questStates` shows none until B1. No Phase A test calls a stub that throws, and none asserts a stub's placeholder behaviour.

**For the areas (the contract in one place):**
- **B1** owns `delve/quests.ts` (keep `emptyQuests` and `grantRewards`' signatures; `claimQuest` calls `grantRewards` once it has checked the claim, and returns its `granted` as `ProfileActionResult.rewards`) and every emission site: `arpg/combat.ts` (kills, reactions, `hurt`), `arpg/dodge.ts`, `arpg/step.ts` (`potionDrunk`), `delve/dive.ts` (`bankWorld` applies and clears `world.pending.questEvents`; `completeFloor` emits `clearFloor` from `world.potionDrunk` / `world.hurt` and `boss`; `startDive` / `chooseDoor` `reachDepth`; `extractDive` `extract`, applied before its `settleDive`, so the refill there comes after the dive's events; the dive scope's resets), `delve/crafting.ts`, `delve/pair.ts`, `delve/moveset.ts`, `delve/runes.ts`, `loot/salvage-yield.ts`. `applyQuestEvents` already runs at `createDelveProfile` (the creation-time unlocks: a quest with no `unlock` unlocks then; the current main quest is tracked by default). A world's `pending` is reset by `emptyPending()` (`questEvents: []`); a sandbox world never banks.
- **B2** owns `delve/rewards.ts`, `delve/contracts.ts` and `quests.json`'s content (the giver stays `hesta`; quest ids never start with `contract:`). It may extend `ContractFilterRules` and `ContractTemplate` in `types/quests.ts` and their schema in `schemas.ts` (no other area edits those). `resolveReward(registry, profile, reward, rng)` returns `{ profile, granted }`: the reward added to the stockpile, and what it became (`RewardGrant`). `generateContract` returns the contract `contract:<boardCount>`; its callers (`refillBoard`, `rerollContract`) move `boardCount` on. `refillBoard` also resets `rerollUsed`.
- **C1** owns `hub/quests/*` and `quests/quest-view.ts` (status, NEW, DONE, the Done group, rule texts, the board, reroll, the pause's disabled Claim), the hub's tab pip and the Anvil footer's count; it calls the store's `claimQuest`, `rerollContract`, `markQuestSeen`, and reads `delve.quests.maxTracked` (the client's `MAX_TRACKED` stays 3 until then).
- **C2** owns `quests/QuestTracker.tsx`, the store's notice diff in `setProfile`, `arena/useArena.ts` (bank on `pending.questEvents`) and `pages/DelveRun.tsx`.

## Where the spec left room

1. **`RewardView`'s refs.** The spec writes `ref: MaterialRef | 'scrap' | 'dust' | 'links'`, but `MaterialRef` already has `{ kind: 'dust' }` and `{ kind: 'links' }`, and a concrete `pattern` reward needs a ref too. So `RewardRef = MaterialRef | { kind: 'scrap' } | { kind: 'pattern'; pattern: string }` (one discriminant to switch on), and `RewardView = RewardGrant | { rule: Reward }` with `RewardGrant = { ref: RewardRef; count }`.
2. **`resolveReward` grants as it resolves.** It returns `{ profile, granted }`, so everything a reward kind means (the stockpile, a learned pattern, a seen essence) stays in B2's file; `grantRewards` (B1's file, written here) only folds it over a claim's rewards on `quest:<id>:<claimCount>` and moves `claimCount` on. That is the spec's "claimQuest → resolveReward" wiring, testable now.
3. **`claimQuest`'s result** is a `ProfileActionResult` (`rewards?: RewardGrant[]` added), so the store's `applyResult` serves it; the refusal mid-dive reads "Claim at the Anvil, between dives", as the forge's "Forge at the Anvil, between dives". `trackQuest` and `rerollContract` return `ProfileActionResult` too (a fourth tracked quest, a spent reroll, an empty slot are refusals); `markQuestSeen` returns the profile. Every op takes the registry first, as the others do.
4. **The objective table as data.** `OBJECTIVE_RULES` holds each type's progress (`sum`, `max`, `state`), its filters and `anvilOnly`; the schema refuses a filter its type doesn't take and a `dive` scope on an Anvil-only type from it, and B1 reads the progress mode from it. `reachDepth` is `max` (the depth entered); a `total` one also reads `bestDepth`, as the spec's state types say. `discoverReaction` is a state type but not Anvil-only (it may be scoped to a dive). `QuestEvent` has no `knowPatterns` or `discoverReaction` (nothing emits them) but has `bind` (the spec has `bindSecondary` emit it).
5. **Contracts carry what they show.** A `Contract` copies its template's `name` and `line` and holds concrete `objectives` (one) and `rewards`, plus its own `progress`, so a contract outlives a template edit. `ContractTemplate` gains `name` and `line` (the spec's template list omits them, but a contract needs both for `QuestState`); its `filter` is `ContractFilterRules` (`'reached'`, `'known'`, `'window'`, `'flag'`, `'owned'`, plus `kind`, `noPotion`, `noDamage`), one shape per the spec's nine templates. B2 may extend it.
6. **Cross-file checks split by what can see them.** Reactions, rarities, monster kinds, flux grades and families are enums in `QuestsDataSchema`; biomes, pattern and essence ids, `unlock.after` and the main chain need the other files, so `questsDataProblems(registry)` checks them and `createDefaultRegistry` throws on any. A main quest's `after` must name a main quest (else it isn't on the chain).
7. **The starter state.** `emptyQuests` is all empty with `contracts.slots` empty board slots; `createDelveProfile` then runs `applyQuestEvents(registry, profile, [])`, the spec's "unlocks are checked once at profile creation", so B1's unlocks fill `unlocked` and `tracked` without editing `profile.ts`.
8. **`delve.quests` numbers** (starting points for Phase D): `maxTracked` 3; `slots` 3, `tierWeights` easy 5 / normal 4 / hard 2, `depthScale` 0.05, `depthWindow` [−2, 3], `flagDepthBelow` 2, `rerollScrap` 30, `essenceChance` 0.15. The reward tables live in the templates (`rewards` by tier), so the balance holds no reward shapes.
9. **The client's kinds.** The client's `QuestKind` becomes the engine's (`'contract'`, tag "Contract", group "Contracts", the old bounty colours), since every later client area reads it. `QuestView` is unchanged; `questView` fills `story` from Hesta's line, `giver` from `getQuestsData().giver.sprite`, `sub` from the chapter or the first objective, and names a rule "Chosen when you claim it" (C1 writes the rule texts). The fixture moves to `quests/__tests__/quest-fixture.ts` (still `SAMPLE_QUESTS`, its contract the old bounty), and the Quests tab's tests stub `useQuests` with it.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `quest/a`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-quest-a`.
- **Line endings:** the worktree's files are CRLF (`core.autocrlf`); keep each file's own (the Edit tool does); new files are LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** the commit blocks format only files a task creates or files that pass `prettier --check` at the base. These are **only hand-edited, never formatted**: `packages/engine/src/data/balance.json` and `packages/engine/src/delve/dive.ts` (not clean at the base). Never touch `packages/engine/tests/delve-chain-feel.test.ts` (raw 0xD7 byte). The code below is already Prettier-formatted (checked on the scratch copy), so `--write` changes nothing if typed as written.
- **How the edits read** (the earlier plans' language): "Replace: A with: B" is one Edit (old A, new B). "Replace the lines from `A` up to (not including) `B` with: C" is one Edit whose old text runs from the start of the line that reads `A` (ignoring its indentation) to the end of the line before the one that reads `B`, and whose new text is C; "…to the end of the file" runs to the file's last line. "Append at the end of the file:" adds a blank line and the block after the last line. "Create `f`:" is a Write. Within a file, apply its edits top to bottom; every anchor is unique in its file at that point.
- **The client follows the bundle.** Tasks 1–6 never rebuild `packages/engine/dist`, so the client stays green on the base bundle through them. Task 7 rebuilds it: against the new bundle the client's typecheck fails in `arena-bank.test.ts` (its pending fixture lacks `questEvents`) and two store tests fail (they expect version 8) until Task 7's commit.
- **Every engine task runs the whole engine suite** (about 45 s; the pacing rails run while the files load) and the engine typecheck; every client task the whole client suite (about 30 s) and its typecheck. Vitest doesn't type-check tests.
- **Import cycles:** `delve/profile.ts`, `dive.ts`, `pair.ts`, `hero-stats.ts`, `moveset.ts`, `stops.ts` and now `quests.ts` and `contracts.ts` import each other: read such an import only inside a function. `types/quests.ts` imports only types; `data/quests-check.ts` only types.
- **Checked on a scratch copy:** `git archive` of `quest/main` at `ffa0194` with junctioned `node_modules`; every task's edits applied by a script that checks each anchor (109 edits, each unique where the plan applies it), giving the trees every FAIL, PASS, suite and typecheck below ran on; `prettier --check` passed on every file a commit block formats.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine bundle (the client's) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(pnpm -F @alloy/client build)` |

---

## Chunk 1: The quests data

### Task 1: The quest types, `quests.json`, its schema and `getQuestsData`

Every shape the areas trade in, the objective table as data, the placeholder content, the schema and the registry's getter.

**Files:**
- Create: `packages/engine/src/types/quests.ts`, `packages/engine/src/data/quests.json`, `packages/engine/tests/delve-quests-data.test.ts`
- Modify: `packages/engine/src/types/index.ts`, `src/data/schemas.ts`, `src/data/loader.ts`, `src/data/registry.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-quests-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { QuestsDataSchema } from '../src/data/schemas.js';
import questsData from '../src/data/quests.json';
import {
  OBJECTIVE_RULES,
  OBJECTIVE_TYPES,
  type ContractTemplate,
  type QuestDef,
  type QuestsData,
} from '../src/types/quests.js';

// See the quests spec: "The quest model" and "Data, tuning and the save".

const registry = createDefaultRegistry();

/** A side quest: one objective (a perfect dodge unless `objective` says otherwise) and 10 scrap. */
const quest = (id: string, over: object = {}, objective: object = {}): QuestDef =>
  ({
    id,
    kind: 'side',
    name: id,
    line: 'A line.',
    objectives: [
      { id: 'o', type: 'perfectDodge', count: 1, scope: 'total', text: 'Do it', ...objective },
    ],
    rewards: [{ kind: 'scrap', count: 10 }],
    ...over,
  }) as QuestDef;
const template: ContractTemplate = {
  id: 'cull',
  name: 'Cull',
  line: 'A line.',
  type: 'kill',
  filter: { kind: 'elite', biome: 'reached' },
  count: { easy: [3, 5], normal: [6, 9], hard: [10, 14] },
  scope: 'total',
  text: 'Slay elites',
  rewards: {
    easy: [{ kind: 'scrap', count: 30 }],
    normal: [{ kind: 'dust', count: 10 }],
    hard: [{ kind: 'essence', id: 'fit', count: 1 }],
  },
};
const data = (quests: QuestDef[], contractTemplates: ContractTemplate[] = []): QuestsData => ({
  giver: questsData.giver,
  quests,
  contractTemplates,
});
const ok = (d: QuestsData) => QuestsDataSchema.safeParse(d).success;

describe('quests.json', () => {
  it('loads, with Hesta giving', () => {
    expect(registry.getQuestsData().giver).toEqual({ name: 'Hesta', sprite: 'hesta' });
    expect(registry.getQuestsData().quests.length).toBeGreaterThan(0);
  });

  it('has a rule for each objective type: the Anvil-only ones and the state ones marked', () => {
    expect(Object.keys(OBJECTIVE_RULES)).toEqual([...OBJECTIVE_TYPES]);
    const where = (f: (t: (typeof OBJECTIVE_TYPES)[number]) => boolean) =>
      OBJECTIVE_TYPES.filter(f);
    expect(where((t) => OBJECTIVE_RULES[t].anvilOnly)).toEqual([
      'forge',
      'refine',
      'bind',
      'openSocket',
      'knowPatterns',
    ]);
    expect(where((t) => OBJECTIVE_RULES[t].progress === 'state')).toEqual([
      'bind',
      'knowPatterns',
      'discoverReaction',
    ]);
    expect(where((t) => OBJECTIVE_RULES[t].progress === 'max')).toEqual(['reachDepth']);
  });
});

describe('QuestsDataSchema', () => {
  it('accepts the data, every filter its type takes, and a template', () => {
    expect(ok(questsData as QuestsData)).toBe(true);
    const filtered = [
      quest(
        'a',
        {},
        { type: 'kill', filter: { kind: 'elite', biome: 'frostvault', element: 'frost' } },
      ),
      quest(
        'b',
        {},
        { type: 'clearFloor', filter: { noPotion: true, noDamage: true, minDepth: 5 } },
      ),
      quest('c', {}, { type: 'reaction', filter: { pair: true }, scope: 'dive' }),
      quest('d', {}, { type: 'forge', filter: { minRarity: 'uncommon', legendary: true } }),
    ];
    expect(ok(data(filtered, [template]))).toBe(true);
  });

  it("refuses a filter its type doesn't take, a reaction with the pair, and a dive scope on an Anvil-only type", () => {
    expect(ok(data([quest('a', {}, { filter: { biome: 'frostvault' } })]))).toBe(false);
    expect(ok(data([quest('a', {}, { type: 'kill', filter: { kind: 'boss' } })]))).toBe(false);
    expect(
      ok(data([quest('a', {}, { type: 'reaction', filter: { reaction: 'melt', pair: true } })])),
    ).toBe(false);
    for (const type of ['forge', 'refine', 'bind', 'openSocket', 'knowPatterns'])
      expect(ok(data([quest('a', {}, { type, scope: 'dive' })])), type).toBe(false);
    expect(ok(data([], [{ ...template, type: 'refine', filter: undefined, scope: 'dive' }]))).toBe(
      false,
    );
  });

  it('refuses repeated ids, a contract: id, no objectives or four, and an empty unlock', () => {
    expect(ok(data([quest('a'), quest('a')]))).toBe(false);
    expect(ok(data([], [template, template]))).toBe(false);
    expect(ok(data([quest('contract:1')]))).toBe(false);
    expect(ok(data([quest('a', { objectives: [] })]))).toBe(false);
    const o = quest('a').objectives[0];
    const four = ['w', 'x', 'y', 'z'].map((id) => ({ ...o, id }));
    expect(ok(data([quest('a', { objectives: four })]))).toBe(false);
    expect(ok(data([quest('a', { objectives: four.slice(1) })]))).toBe(true);
    expect(ok(data([quest('a', { objectives: [o, o] })]))).toBe(false);
    expect(ok(data([quest('a', { unlock: {} })]))).toBe(false);
    expect(ok(data([quest('a', { unlock: { after: 'b', bestDepth: 6 } }), quest('b')]))).toBe(true);
  });

  it('refuses a reward that names too little or too much for its kind', () => {
    const rewards = (...rs: object[]) => data([quest('a', { rewards: rs })]);
    const good = [
      { kind: 'metal', id: 'depth', count: 3 },
      { kind: 'metal', id: 'iron', count: 3 },
      { kind: 'flux', grade: 'epic', count: 1 },
      { kind: 'shard', family: 'offense', tier: 3, count: 1 },
      { kind: 'essence', id: 'fit', count: 1 },
      { kind: 'pattern', id: 'unknown', count: 1, fallback: { kind: 'dust', count: 20 } },
      { kind: 'links', count: 2 },
    ];
    for (const r of good) expect(ok(rewards(r)), JSON.stringify(r)).toBe(true);
    const bad = [
      { kind: 'metal', id: 'gold', count: 3 },
      { kind: 'metal', count: 3 },
      { kind: 'flux', count: 1 },
      { kind: 'shard', family: 'offense', count: 1 },
      { kind: 'shard', family: 'offense', tier: 6, count: 1 },
      { kind: 'pattern', id: 'unknown', count: 1 },
      { kind: 'scrap', id: 'x', count: 5 },
      { kind: 'scrap', count: 0 },
      { kind: 'gold', count: 1 },
    ];
    for (const r of bad) expect(ok(rewards(r)), JSON.stringify(r)).toBe(false);
    expect(ok(data([quest('a', { rewards: [] })]))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-data.test.ts)`
Expected: FAIL, no tests: `Error: Cannot find module '../src/data/quests.json' imported from '…/tests/delve-quests-data.test.ts'`.

- [ ] **Step 3: The types, the data, the schema and the getter**

Create `packages/engine/src/types/quests.ts`:

```ts
import type { MonsterKind, ReactionId } from './arpg.js';
import type { AffixFamily, FluxGrade, MaterialRef } from './crafting.js';
import type { Rarity } from './gear.js';
import type { ManaType } from './mana.js';

/**
 * Delve quests (see the quests spec): the quests and contract templates of
 * `quests.json`, the events that advance their objectives, the save's
 * `quests`, and the view the client draws. The engine formats nothing.
 */

/** A quest's id: `quests.json`'s, or a contract's `contract:<n>`. */
export type QuestId = string;

/** Main (a chain), side (unlocked by a condition) or a contract (from the board). */
export type QuestKind = 'main' | 'side' | 'contract';

/** `total`: from when the quest unlocks; `dive`: within one dive (reset when a dive starts and when it settles). */
export type ObjectiveScope = 'total' | 'dive';

/** Every objective type: only the ones the content uses (the spec's S6). */
export const OBJECTIVE_TYPES = [
  'kill',
  'reachDepth',
  'clearFloor',
  'extract',
  'boss',
  'reaction',
  'perfectDodge',
  'forge',
  'refine',
  'bind',
  'openSocket',
  'knowPatterns',
  'discoverReaction',
] as const;
export type ObjectiveType = (typeof OBJECTIVE_TYPES)[number];

/** What narrows an objective's events (each type takes only its own: `OBJECTIVE_RULES`). */
export interface ObjectiveFilter {
  /** `kill`: the foe's kind (a boss counts only through `boss`). */
  kind?: Exclude<MonsterKind, 'boss'>;
  /** `kill`, `clearFloor`, `boss`: the biome's id. */
  biome?: string;
  /** `kill`: the foe's element. */
  element?: ManaType;
  /** `clearFloor`: no potion drunk on the floor. */
  noPotion?: boolean;
  /** `clearFloor`: no damage taken on the floor. */
  noDamage?: boolean;
  /** `clearFloor`, `extract`: at this depth or deeper. */
  minDepth?: number;
  /** `reaction`: this reaction. */
  reaction?: ReactionId;
  /** `reaction`: the hero's pair's reaction, resolved against `profile.pair` when the event applies. */
  pair?: true;
  /** `forge`: this rarity or better. */
  minRarity?: Rarity;
  /** `forge`: a legendary. */
  legendary?: boolean;
}

/** How an objective type's progress grows (the spec's objective table). */
export interface ObjectiveRule {
  /**
   * `sum`: each matching event adds one; `max`: the highest an event brings
   * (`reachDepth`: the depth entered; a `total` one also reads `bestDepth`);
   * `state`: read from the profile on every `applyQuestEvents` (`bind`: 1 once
   * `pair.secondary` is set; `knowPatterns`: `patterns.length`;
   * `discoverReaction`: `reactionsSeen.length`).
   */
  progress: 'sum' | 'max' | 'state';
  /** The filter fields it takes. */
  filters: readonly (keyof ObjectiveFilter)[];
  /** Only the Anvil advances it: `scope: 'dive'` is refused. */
  anvilOnly: boolean;
}

export const OBJECTIVE_RULES: Record<ObjectiveType, ObjectiveRule> = {
  kill: { progress: 'sum', filters: ['kind', 'biome', 'element'], anvilOnly: false },
  reachDepth: { progress: 'max', filters: [], anvilOnly: false },
  clearFloor: {
    progress: 'sum',
    filters: ['biome', 'noPotion', 'noDamage', 'minDepth'],
    anvilOnly: false,
  },
  extract: { progress: 'sum', filters: ['minDepth'], anvilOnly: false },
  boss: { progress: 'sum', filters: ['biome'], anvilOnly: false },
  reaction: { progress: 'sum', filters: ['reaction', 'pair'], anvilOnly: false },
  perfectDodge: { progress: 'sum', filters: [], anvilOnly: false },
  forge: { progress: 'sum', filters: ['minRarity', 'legendary'], anvilOnly: true },
  refine: { progress: 'sum', filters: [], anvilOnly: true },
  bind: { progress: 'state', filters: [], anvilOnly: true },
  openSocket: { progress: 'sum', filters: [], anvilOnly: true },
  knowPatterns: { progress: 'state', filters: [], anvilOnly: true },
  discoverReaction: { progress: 'state', filters: [], anvilOnly: false },
};

/** One goal of a quest or a contract. */
export interface Objective {
  /** Unique within its quest. */
  id: string;
  type: ObjectiveType;
  filter?: ObjectiveFilter;
  /** It completes here, and its progress is capped here. */
  count: number;
  scope: ObjectiveScope;
  text: string;
}

/** An objective's progress: `value` up to its count; once `done` it stays done (a `dive` reset never clears it). */
export interface ObjectiveProgress {
  value: number;
  done: boolean;
}

/** What unlocks a quest: every condition given (no `unlock`: unlocked on a new save). */
export interface Unlock {
  /** This quest claimed. */
  after?: QuestId;
  bestDepth?: number;
  /** Reactions discovered, at least. */
  reactionsSeen?: number;
  /** Patterns known, at least. */
  patterns?: number;
  /** A secondary bound. */
  pair?: true;
}

export const REWARD_KINDS = [
  'scrap',
  'dust',
  'links',
  'metal',
  'flux',
  'shard',
  'essence',
  'pattern',
] as const;
export type RewardKind = (typeof REWARD_KINDS)[number];

/**
 * A reward, concrete or a rule `resolveReward` settles when it is claimed:
 * `metal` with `id` a metal or `'depth'` (the metal of the hero's best depth);
 * `flux` with `grade`; `shard` with `family` and `tier` (a random affix of the
 * family at that tier, clamped to the affix's tiers); `essence` with `id` a
 * legendary or `'fit'` (one whose slots fit a learned pattern); `pattern` with
 * `id` a base or `'unknown'` (a random unknown pattern, else `fallback`).
 * Scrap, Mana Dust and Links name only their count.
 */
export interface Reward {
  kind: RewardKind;
  id?: string;
  grade?: FluxGrade;
  family?: AffixFamily;
  tier?: number;
  count: number;
  /** `pattern: 'unknown'`: the reward once every pattern is known. */
  fallback?: Reward;
}

/** A main or side quest (`quests.json → quests`). */
export interface QuestDef {
  id: QuestId;
  kind: Exclude<QuestKind, 'contract'>;
  name: string;
  chapter?: string;
  /** The giver's line. */
  line: string;
  unlock?: Unlock;
  /** One to three. */
  objectives: Objective[];
  rewards: Reward[];
}

export const CONTRACT_TIERS = ['easy', 'normal', 'hard'] as const;
export type ContractTier = (typeof CONTRACT_TIERS)[number];

/**
 * How a contract template's filter is filled when a contract is generated, from
 * only what is possible for the hero (see the spec's Contract board):
 * `'reached'` a biome reached (or its mana), `'known'` the pair's reaction or
 * one in `reactionsSeen`, `'window'` a depth in `depthWindow`, `'flag'` the flag
 * floors' depth, `'owned'` up to the best flux grade owned.
 */
export interface ContractFilterRules {
  kind?: Exclude<MonsterKind, 'boss'>;
  biome?: 'reached';
  element?: 'reached';
  reaction?: 'known';
  minDepth?: 'window' | 'flag';
  minRarity?: 'owned';
  noPotion?: true;
  noDamage?: true;
}

/** A contract template (`quests.json → contractTemplates`): one objective, its count and rewards by tier. */
export interface ContractTemplate {
  id: string;
  name: string;
  line: string;
  type: ObjectiveType;
  filter?: ContractFilterRules;
  /** The count's range by tier, low to high. */
  count: Record<ContractTier, [number, number]>;
  scope: ObjectiveScope;
  /** The objective's text (how a filled filter shows in it is the generator's). */
  text: string;
  /** Rewards by tier, before `contracts.depthScale`. */
  rewards: Record<ContractTier, Reward[]>;
}

/** `quests.json`. */
export interface QuestsData {
  /** Hesta, the Anvil-keeper: her name and her sprite's id in the arena's atlas. */
  giver: { name: string; sprite: string };
  quests: QuestDef[];
  contractTemplates: ContractTemplate[];
}

/** A generated contract on the board: concrete, and the one home of its progress. */
export interface Contract {
  /** `contract:<n>`, n the board's `boardCount` when it was generated. */
  id: QuestId;
  template: string;
  tier: ContractTier;
  name: string;
  line: string;
  objectives: Objective[];
  rewards: Reward[];
  progress: ObjectiveProgress[];
}

/** The save's quests (`DelveProfile.quests`). */
export interface ProfileQuests {
  /** Each unlocked main and side quest's objectives' progress, in order. */
  progress: Record<QuestId, ObjectiveProgress[]>;
  unlocked: QuestId[];
  claimed: QuestId[];
  /** On the HUD: at most `delve.quests.maxTracked`. */
  tracked: QuestId[];
  /** Opened in the journal (no longer NEW). */
  seen: QuestId[];
  /** The Contract board: `contracts.slots` entries, each a contract or empty. */
  board: (Contract | null)[];
  /** Contracts generated so far: the next one's id and stream. */
  boardCount: number;
  contractsClaimed: number;
  /** This Anvil visit's reroll is spent. */
  rerollUsed: boolean;
  /** Claims so far: a claim's rewards draw on `quest:<id>:<claimCount>`. */
  claimCount: number;
}

/**
 * What happened, for the objectives: mid-dive in `WorldPending.questEvents`
 * (applied when the world banks); the Anvil's ops apply theirs at once.
 * `knowPatterns` and `discoverReaction` are read from the profile, never emitted.
 */
export type QuestEvent =
  | { type: 'kill'; kind: Exclude<MonsterKind, 'boss'>; biome: string; element: ManaType }
  | { type: 'reachDepth'; depth: number }
  | { type: 'clearFloor'; biome: string; depth: number; noPotion: boolean; noDamage: boolean }
  | { type: 'extract'; depth: number }
  | { type: 'boss'; biome: string }
  | { type: 'reaction'; reaction: ReactionId }
  | { type: 'perfectDodge' }
  | { type: 'forge'; rarity: Rarity; legendary: boolean }
  | { type: 'refine' }
  | { type: 'bind' }
  | { type: 'openSocket' };

/** A concrete reward's what: a material (Mana Dust and Links included), scrap, or a pattern. */
export type RewardRef = MaterialRef | { kind: 'scrap' } | { kind: 'pattern'; pattern: string };

/** A concrete reward: what, and how many. */
export interface RewardGrant {
  ref: RewardRef;
  count: number;
}

/** A reward as the quest view shows it: concrete, or a rule (shown as text until it is claimed). */
export type RewardView = RewardGrant | { rule: Reward };

export type QuestStatus = 'active' | 'complete' | 'claimed';

/** One quest, main, side or contract, as the journal and the HUD draw it (`questStates`). */
export interface QuestState {
  id: QuestId;
  kind: QuestKind;
  status: QuestStatus;
  /** Unlocked, and not yet opened in the journal. */
  isNew: boolean;
  tracked: boolean;
  name: string;
  line: string;
  chapter?: string;
  objectives: { id: string; text: string; value: number; count: number; done: boolean }[];
  rewards: RewardView[];
}

/** `balance.json → delve.quests`. */
export interface QuestsBalance {
  /** Quests the HUD tracks, at most. */
  maxTracked: number;
  contracts: {
    /** The board's slots. */
    slots: number;
    /** How often each tier is generated. */
    tierWeights: Record<ContractTier, number>;
    /** A contract's reward counts × (1 + depthScale × bestDepth), rounded. */
    depthScale: number;
    /** Depth goals lie within [max(2, bestDepth + lo), bestDepth + hi]. */
    depthWindow: [number, number];
    /** `noPotion` / `noDamage` floor contracts carry minDepth = max(1, bestDepth − this). */
    flagDepthBelow: number;
    /** Scrap a reroll costs (one a visit). */
    rerollScrap: number;
    /** A hard contract's chance of an extra essence (× Lucky Charm's `legendaryBoost`), rolled at generation. */
    essenceChance: number;
  };
}
```

In `packages/engine/src/types/index.ts`:

Replace:

```ts
export * from './crafting.js';
```

with:

```ts
export * from './crafting.js';
export * from './quests.js';
```

The placeholder content: B2 writes the real quests; this is enough for the schema, the registry and the save.

Create `packages/engine/src/data/quests.json`:

```json
{
  "giver": { "name": "Hesta", "sprite": "hesta" },
  "quests": [
    {
      "id": "first_steps",
      "kind": "main",
      "name": "First Steps",
      "chapter": "Embers of the Anvil",
      "line": "The Anvil wants metal, and the deep has it. Go down a little way, then come back to me.",
      "objectives": [
        {
          "id": "depth",
          "type": "reachDepth",
          "count": 2,
          "scope": "total",
          "text": "Reach depth 2"
        }
      ],
      "rewards": [
        { "kind": "metal", "id": "depth", "count": 3 },
        { "kind": "scrap", "count": 40 }
      ]
    }
  ],
  "contractTemplates": []
}
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
import { AFFIX_FAMILIES, FLUX_GRADES, METAL_IDS } from '../types/crafting.js';
```

with:

```ts
import { AFFIX_FAMILIES, FLUX_GRADES, METAL_IDS } from '../types/crafting.js';
import {
  OBJECTIVE_RULES,
  OBJECTIVE_TYPES,
  REWARD_KINDS,
  type ObjectiveType,
  type Reward,
} from '../types/quests.js';
```

Replace:

```ts
/** A count and a power (`split`, `extraShots`). */
```

with:

```ts
// --- Quests (quests.json, balance.json → delve.quests; see the quests spec) ---

const ObjectiveTypeSchema = z.enum(OBJECTIVE_TYPES);
const ObjectiveScopeSchema = z.enum(['total', 'dive']);

function perTier<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ easy: schema, normal: schema, hard: schema });
}

/** Only the filter fields its type takes, and no `dive` scope on an Anvil-only type. */
function objectiveProblem(o: { type: ObjectiveType; filter?: object; scope: string }) {
  const rule = OBJECTIVE_RULES[o.type];
  const bad = Object.keys(o.filter ?? {}).filter(
    (k) => !(rule.filters as readonly string[]).includes(k),
  );
  if (bad.length > 0) return `a ${o.type} objective takes no ${bad.join(', ')} filter`;
  if (o.scope === 'dive' && rule.anvilOnly)
    return `a ${o.type} objective can't be scoped to a dive`;
  return null;
}

export const ObjectiveSchema = z
  .object({
    id: z.string().min(1),
    type: ObjectiveTypeSchema,
    filter: z
      .object({
        kind: z.enum(['normal', 'elite']),
        biome: z.string(),
        element: ManaTypeSchema,
        noPotion: z.boolean(),
        noDamage: z.boolean(),
        minDepth: z.number().int().min(1),
        reaction: ReactionIdSchema,
        pair: z.literal(true),
        minRarity: RaritySchema,
        legendary: z.boolean(),
      })
      .partial()
      .strict()
      .refine((f) => !(f.reaction && f.pair), 'a reaction or the pair, not both')
      .optional(),
    count: z.number().int().min(1),
    scope: ObjectiveScopeSchema,
    text: z.string().min(1),
  })
  .superRefine((o, ctx) => {
    const problem = objectiveProblem(o);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

/** What a reward of each kind must name, and nothing else (see `Reward`). */
function rewardProblem(r: Reward): string | null {
  const named = (['id', 'grade', 'family', 'tier', 'fallback'] as const).filter(
    (k) => r[k] !== undefined,
  );
  const names = (...keys: string[]) => named.join() === keys.join();
  switch (r.kind) {
    case 'scrap':
    case 'dust':
    case 'links':
      return names() ? null : `a ${r.kind} reward names only its count`;
    case 'metal':
      return names('id') && (r.id === 'depth' || (METAL_IDS as readonly string[]).includes(r.id!))
        ? null
        : "a metal reward's id is a metal or 'depth'";
    case 'flux':
      return names('grade') ? null : 'a flux reward names its grade';
    case 'shard':
      return names('family', 'tier') ? null : 'a shard reward names its family and tier';
    case 'essence':
      return names('id') ? null : "an essence reward's id is a legendary or 'fit'";
    case 'pattern':
      return names(...(r.id === 'unknown' ? ['id', 'fallback'] : ['id']))
        ? null
        : "a pattern reward's id is a base, or 'unknown' with a fallback";
  }
}

export const RewardSchema: z.ZodType<Reward> = z.lazy(() =>
  z
    .object({
      kind: z.enum(REWARD_KINDS),
      id: z.string().optional(),
      grade: FluxGradeSchema.optional(),
      family: AffixFamilySchema.optional(),
      tier: z.number().int().min(1).max(5).optional(),
      count: z.number().int().min(1),
      fallback: RewardSchema.optional(),
    })
    .strict()
    .superRefine((r, ctx) => {
      const problem = rewardProblem(r);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    }),
);

/** Ids differ. */
const distinctIds = (xs: { id: string }[]) => new Set(xs.map((x) => x.id)).size === xs.length;

const QuestDefSchema = z.object({
  // `contract:<n>` ids are the board's.
  id: z
    .string()
    .min(1)
    .refine((id) => !id.startsWith('contract:'), "a quest's id never starts with contract:"),
  kind: z.enum(['main', 'side']),
  name: z.string().min(1),
  chapter: z.string().optional(),
  line: z.string().min(1),
  unlock: z
    .object({
      after: z.string(),
      bestDepth: z.number().int().min(1),
      reactionsSeen: z.number().int().min(1),
      patterns: z.number().int().min(1),
      pair: z.literal(true),
    })
    .partial()
    .strict()
    .refine((u) => Object.keys(u).length > 0, 'an unlock names a condition')
    .optional(),
  objectives: z.array(ObjectiveSchema).min(1).max(3).refine(distinctIds, 'objective ids differ'),
  rewards: z.array(RewardSchema).min(1),
});

const ContractTemplateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    line: z.string().min(1),
    type: ObjectiveTypeSchema,
    filter: z
      .object({
        kind: z.enum(['normal', 'elite']),
        biome: z.literal('reached'),
        element: z.literal('reached'),
        reaction: z.literal('known'),
        minDepth: z.enum(['window', 'flag']),
        minRarity: z.literal('owned'),
        noPotion: z.literal(true),
        noDamage: z.literal(true),
      })
      .partial()
      .strict()
      .optional(),
    count: perTier(
      z
        .tuple([z.number().int().min(1), z.number().int().min(1)])
        .refine(([lo, hi]) => lo <= hi, 'a count runs low to high'),
    ),
    scope: ObjectiveScopeSchema,
    text: z.string().min(1),
    rewards: perTier(z.array(RewardSchema).min(1)),
  })
  .superRefine((t, ctx) => {
    const problem = objectiveProblem(t);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

/** `quests.json`: shapes and ids (the registry checks its references into the other files: `questsDataProblems`). */
export const QuestsDataSchema = z.object({
  giver: z.object({ name: z.string().min(1), sprite: z.string().min(1) }),
  quests: z.array(QuestDefSchema).refine(distinctIds, 'quest ids differ'),
  contractTemplates: z.array(ContractTemplateSchema).refine(distinctIds, 'template ids differ'),
});

/** A count and a power (`split`, `extraShots`). */
```

In `packages/engine/src/data/loader.ts`:

Replace:

```ts
import type { CraftingData } from '../types/crafting.js';
```

with:

```ts
import type { CraftingData } from '../types/crafting.js';
import type { QuestsData } from '../types/quests.js';
```

Replace:

```ts
  DelveDataSchema,
  RecipesSchema,
```

with:

```ts
  DelveDataSchema,
  QuestsDataSchema,
  RecipesSchema,
```

Replace:

```ts
import rawCrafting from './crafting.json';
```

with:

```ts
import rawCrafting from './crafting.json';
import rawQuests from './quests.json';
```

Replace:

```ts
  crafting: CraftingData;
}
```

with:

```ts
  crafting: CraftingData;
  quests: QuestsData;
}
```

Replace:

```ts
  const crafting = CraftingDataSchema.parse(rawCrafting) as CraftingData;

  return { affixes, combinations, recipes, synergies, baseItems, balance, delve, arpg, crafting };
```

with:

```ts
  const crafting = CraftingDataSchema.parse(rawCrafting) as CraftingData;
  const quests = QuestsDataSchema.parse(rawQuests) as QuestsData;

  return {
    affixes,
    combinations,
    recipes,
    synergies,
    baseItems,
    balance,
    delve,
    arpg,
    crafting,
    quests,
  };
```

In `packages/engine/src/data/registry.ts`:

Replace:

```ts
import type { CraftingData } from '../types/crafting.js';
```

with:

```ts
import type { CraftingData } from '../types/crafting.js';
import type { QuestsData } from '../types/quests.js';
```

Replace:

```ts
    private readonly craftingData: CraftingData | null = null,
```

with:

```ts
    private readonly craftingData: CraftingData | null = null,
    private readonly questsData: QuestsData | null = null,
```

Replace:

```ts
    if (!this.craftingData) throw new Error('Crafting data not loaded — pass it to DataRegistry');
    return this.craftingData;
  }
```

with:

```ts
    if (!this.craftingData) throw new Error('Crafting data not loaded — pass it to DataRegistry');
    return this.craftingData;
  }

  /** `quests.json`: the giver, the main and side quests, and the contract templates (see the quests spec). */
  getQuestsData(): QuestsData {
    if (!this.questsData) throw new Error('Quests data not loaded — pass it to DataRegistry');
    return this.questsData;
  }
```

In `packages/engine/src/data/default-registry.ts`:

Replace:

```ts
    data.crafting,
  );
```

with:

```ts
    data.crafting,
    data.quests,
  );
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-data.test.ts)`
Expected: PASS, 6 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 6 tests in F + 1 files pass (1775 | 5 skipped in 96 | 1 skipped at the base's counts).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-a
(cd packages/engine && npx prettier --write --end-of-line auto src/types/quests.ts src/types/index.ts src/data/quests.json src/data/schemas.ts src/data/loader.ts src/data/registry.ts src/data/default-registry.ts tests/delve-quests-data.test.ts)
git add packages/engine/src/types/quests.ts packages/engine/src/types/index.ts packages/engine/src/data/quests.json packages/engine/src/data/schemas.ts packages/engine/src/data/loader.ts packages/engine/src/data/registry.ts packages/engine/src/data/default-registry.ts packages/engine/tests/delve-quests-data.test.ts
git commit -m "feat(engine): the quest types, quests.json and its schema, getQuestsData" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The checks and the balance

### Task 2: The registry's cross-file checks

What `QuestsDataSchema` can't see, checked against the other data files: objective biomes, pattern and essence rewards, `unlock.after`, and the main quests forming one chain. `createDefaultRegistry` refuses data with any problem, as a schema refuses a bad shape.

**Files:**
- Create: `packages/engine/src/data/quests-check.ts`
- Modify: `packages/engine/src/data/default-registry.ts`, `packages/engine/tests/delve-quests-data.test.ts`; `packages/engine/tests/delve-dps-sim.test.ts`, `delve-rune-costs-gate.test.ts`, `delve-rune-power.test.ts` (they build their own registry)

- [ ] **Step 1: The failing test**

In `packages/engine/tests/delve-quests-data.test.ts`:

Replace:

```ts
import { createDefaultRegistry } from '../src/data/default-registry.js';
```

with:

```ts
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { questsDataProblems } from '../src/data/quests-check.js';
import { DataRegistry } from '../src/data/registry.js';
```

Replace:

```ts
const ok = (d: QuestsData) => QuestsDataSchema.safeParse(d).success;
```

with:

```ts
const ok = (d: QuestsData) => QuestsDataSchema.safeParse(d).success;
/** The registry's checks on `d` in place of quests.json. */
function problems(d: QuestsData): string[] {
  const x = loadAndValidateData();
  const r = new DataRegistry(
    x.affixes,
    x.combinations,
    x.synergies,
    x.baseItems,
    x.balance,
    x.recipes,
    x.delve,
    x.arpg,
    x.crafting,
    d,
  );
  return questsDataProblems(r);
}
```

Replace:

```ts
  it('loads, with Hesta giving', () => {
    expect(registry.getQuestsData().giver).toEqual({ name: 'Hesta', sprite: 'hesta' });
    expect(registry.getQuestsData().quests.length).toBeGreaterThan(0);
```

with:

```ts
  it('loads, Hesta giving, and refers only to data that exists', () => {
    expect(registry.getQuestsData().giver).toEqual({ name: 'Hesta', sprite: 'hesta' });
    expect(registry.getQuestsData().quests.length).toBeGreaterThan(0);
    expect(questsDataProblems(registry)).toEqual([]);
```

Append at the end of the file:

```ts
describe("the registry's quests checks", () => {
  it('finds an unknown biome, pattern, essence or quest to unlock after', () => {
    expect(problems(data([quest('a')], [template]))).toEqual([]);
    expect(
      problems(
        data([
          quest('a', {}, { type: 'boss', filter: { biome: 'moon' } }),
          quest('b', {
            rewards: [
              { kind: 'pattern', id: 'spork', count: 1 },
              { kind: 'essence', id: 'nope', count: 1 },
              {
                kind: 'pattern',
                id: 'unknown',
                count: 1,
                fallback: { kind: 'pattern', id: 'x', count: 1 },
              },
            ],
          }),
          quest('c', { unlock: { after: 'zz' } }),
        ]),
      ),
    ).toEqual([
      'a: no biome moon',
      'b: no pattern spork',
      'b: no legendary nope',
      'b: no pattern x',
      'c: no quest zz',
    ]);
    expect(
      problems(
        data(
          [],
          [
            {
              ...template,
              rewards: { ...template.rewards, hard: [{ kind: 'essence', id: 'nope', count: 1 }] },
            },
          ],
        ),
      ),
    ).toEqual(['cull: no legendary nope']);
  });

  it('the main quests form one chain, each unlocking after the one before', () => {
    const main = (id: string, after?: string) =>
      quest(id, { kind: 'main', ...(after ? { unlock: { after } } : {}) });
    expect(
      problems(
        data([main('a'), main('c', 'b'), main('b', 'a'), quest('s', { unlock: { after: 'c' } })]),
      ),
    ).toEqual([]);
    expect(problems(data([main('a'), main('b')]))).toEqual([
      'the main chain has one first quest, with no after',
    ]);
    expect(problems(data([main('a'), main('b', 'a'), main('c', 'a')]))).toEqual([
      'the main chain forks after a',
      'every main quest is on the one chain',
    ]);
    expect(problems(data([main('a'), quest('s'), main('b', 's')]))).toEqual([
      'every main quest is on the one chain',
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-data.test.ts)`
Expected: FAIL, no tests: `Error: Cannot find module '../src/data/quests-check.js' imported from '…/tests/delve-quests-data.test.ts'`.

- [ ] **Step 3: The checks**

Create `packages/engine/src/data/quests-check.ts`:

```ts
import type { QuestDef, Reward } from '../types/quests.js';
import type { DataRegistry } from './registry.js';

/**
 * `quests.json`'s references into the other data files, which its schema
 * can't see (see the quests spec): objective biomes, pattern and essence
 * rewards, `unlock.after`, and the main quests forming one chain, each
 * unlocking after the one before. One line a problem; `createDefaultRegistry`
 * refuses data with any. (Reactions, rarities, monster kinds, flux grades and
 * families are enums, checked by `QuestsDataSchema`.)
 */
export function questsDataProblems(registry: DataRegistry): string[] {
  const { quests, contractTemplates } = registry.getQuestsData();
  const delve = registry.getDelveData();
  const biomes = new Set(delve.biomes.map((b) => b.id));
  const bases = new Set(delve.bases.map((b) => b.id));
  const legendaries = new Set(delve.legendaries.map((l) => l.id));
  const ids = new Set(quests.map((q) => q.id));
  const problems: string[] = [];
  const reward = (where: string, r: Reward): void => {
    if (r.kind === 'pattern' && r.id !== 'unknown' && !bases.has(r.id!))
      problems.push(`${where}: no pattern ${r.id}`);
    if (r.kind === 'essence' && r.id !== 'fit' && !legendaries.has(r.id!))
      problems.push(`${where}: no legendary ${r.id}`);
    if (r.fallback) reward(where, r.fallback);
  };
  for (const q of quests) {
    for (const o of q.objectives)
      if (o.filter?.biome !== undefined && !biomes.has(o.filter.biome))
        problems.push(`${q.id}: no biome ${o.filter.biome}`);
    for (const r of q.rewards) reward(q.id, r);
    const after = q.unlock?.after;
    if (after !== undefined && !ids.has(after)) problems.push(`${q.id}: no quest ${after}`);
  }
  for (const t of contractTemplates)
    for (const r of Object.values(t.rewards).flat()) reward(t.id, r);

  const mains = quests.filter((q) => q.kind === 'main');
  const firsts = mains.filter((q) => q.unlock?.after === undefined);
  if (mains.length > 0 && firsts.length !== 1)
    problems.push('the main chain has one first quest, with no after');
  else if (mains.length > 0) {
    // Each quest has one `after`, and the first none: the walk can't loop.
    let on = 0;
    let q: QuestDef | undefined = firsts[0];
    while (q) {
      on++;
      const id: string = q.id;
      const next: QuestDef[] = mains.filter((m) => m.unlock?.after === id);
      if (next.length > 1) problems.push(`the main chain forks after ${id}`);
      q = next[0];
    }
    if (on !== mains.length) problems.push('every main quest is on the one chain');
  }
  return problems;
}
```

In `packages/engine/src/data/default-registry.ts`:

Replace:

```ts
import { loadAndValidateData } from './loader.js';
```

with:

```ts
import { loadAndValidateData } from './loader.js';
import { questsDataProblems } from './quests-check.js';
```

Replace:

```ts
  return new DataRegistry(
```

with:

```ts
  const registry = new DataRegistry(
```

Replace:

```ts
    data.quests,
  );
}
```

with:

```ts
    data.quests,
  );
  // quests.json's references into the other files (see the quests spec).
  const problems = questsDataProblems(registry);
  if (problems.length > 0) throw new Error(`quests.json: ${problems.join('; ')}`);
  return registry;
}
```

The three tests that build their own registry pass the quests data too (from Task 6 a new profile reads it):

In `packages/engine/tests/delve-dps-sim.test.ts`:

Replace:

```ts
    d.crafting,
```

with:

```ts
    d.crafting,
    d.quests,
```

In `packages/engine/tests/delve-rune-costs-gate.test.ts`:

Replace:

```ts
    d.crafting,
```

with:

```ts
    d.crafting,
    d.quests,
```

In `packages/engine/tests/delve-rune-power.test.ts`:

Replace:

```ts
    d.crafting,
```

with:

```ts
    d.crafting,
    d.quests,
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-data.test.ts)`
Expected: PASS, 8 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 8 tests in F + 1 files pass (1777 | 5 skipped in 96 | 1 skipped).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-a
(cd packages/engine && npx prettier --write --end-of-line auto src/data/quests-check.ts src/data/default-registry.ts tests/delve-quests-data.test.ts tests/delve-dps-sim.test.ts tests/delve-rune-costs-gate.test.ts tests/delve-rune-power.test.ts)
git add packages/engine/src/data/quests-check.ts packages/engine/src/data/default-registry.ts packages/engine/tests/delve-quests-data.test.ts packages/engine/tests/delve-dps-sim.test.ts packages/engine/tests/delve-rune-costs-gate.test.ts packages/engine/tests/delve-rune-power.test.ts
git commit -m "feat(engine): the registry checks quests.json's references and the main chain" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: `delve.quests`

The tracker's cap and the Contract board's numbers, with their schema.

**Files:**
- Modify: `packages/engine/src/data/balance.json` (hand-edited), `src/data/schemas.ts`, `src/types/delve.ts`, `packages/engine/tests/delve-quests-data.test.ts`

- [ ] **Step 1: The failing test**

In `packages/engine/tests/delve-quests-data.test.ts`:

Replace:

```ts
import { QuestsDataSchema } from '../src/data/schemas.js';
```

with:

```ts
import { QuestsBalanceSchema, QuestsDataSchema } from '../src/data/schemas.js';
```

Append at the end of the file:

```ts
describe('delve.quests', () => {
  const quests = registry.getDelveBalance().quests;

  it('holds the tracker and the Contract board numbers', () => {
    expect(quests).toEqual({
      maxTracked: 3,
      contracts: {
        slots: 3,
        tierWeights: { easy: 5, normal: 4, hard: 2 },
        depthScale: 0.05,
        depthWindow: [-2, 3],
        flagDepthBelow: 2,
        rerollScrap: 30,
        essenceChance: 0.15,
      },
    });
  });

  it('refuses a window that runs backwards, no weight on any tier, a chance above 1 or no tracking', () => {
    const ok = (contracts: object, over: object = {}) =>
      QuestsBalanceSchema.safeParse({
        ...quests,
        ...over,
        contracts: { ...quests.contracts, ...contracts },
      }).success;
    expect(ok({})).toBe(true);
    expect(ok({ depthWindow: [3, -2] })).toBe(false);
    expect(ok({ tierWeights: { easy: 0, normal: 0, hard: 0 } })).toBe(false);
    expect(ok({ essenceChance: 1.5 })).toBe(false);
    expect(ok({}, { maxTracked: 0 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-data.test.ts)`
Expected: FAIL, 2 of 10: `AssertionError: expected undefined to deeply equal { maxTracked: 3, contracts: { …(7) } }` (no `delve.quests`) and `TypeError: Cannot read properties of undefined (reading 'safeParse')` (no `QuestsBalanceSchema`).

- [ ] **Step 3: The numbers, the schema and the type**

By hand: never format this file.

In `packages/engine/src/data/balance.json`:

Replace:

```json
    "sandbox": { "dummyLifeMult": 50, "heroStart": [13, 26], "dummyDistance": 3, "rowSpacing": 1.2, "clumpRadius": 1.2, "groupSpacing": 3.6, "spawnRing": 6, "edgeMargin": 1.5 },
```

with:

```json
    "quests": {
      "maxTracked": 3,
      "contracts": {
        "slots": 3, "tierWeights": { "easy": 5, "normal": 4, "hard": 2 },
        "depthScale": 0.05, "depthWindow": [-2, 3], "flagDepthBelow": 2,
        "rerollScrap": 30, "essenceChance": 0.15
      }
    },
    "sandbox": { "dummyLifeMult": 50, "heroStart": [13, 26], "dummyDistance": 3, "rowSpacing": 1.2, "clumpRadius": 1.2, "groupSpacing": 3.6, "spawnRing": 6, "edgeMargin": 1.5 },
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
/** A count and a power (`split`, `extraShots`). */
```

with:

```ts
/** `balance.json → delve.quests`. */
export const QuestsBalanceSchema = z.object({
  maxTracked: z.number().int().min(1),
  contracts: z.object({
    slots: z.number().int().min(0),
    tierWeights: perTier(z.number().min(0)).refine(
      (w) => w.easy + w.normal + w.hard > 0,
      'some tier weighs more than 0',
    ),
    depthScale: z.number().min(0),
    depthWindow: z
      .tuple([z.number().int(), z.number().int()])
      .refine(([lo, hi]) => lo <= hi, 'the window runs low to high'),
    flagDepthBelow: z.number().int().min(0),
    rerollScrap: z.number().min(0),
    essenceChance: z.number().min(0).max(1),
  }),
});

/** A count and a power (`split`, `extraShots`). */
```

Replace:

```ts
  drops: DropsBalanceSchema,
```

with:

```ts
  drops: DropsBalanceSchema,
  quests: QuestsBalanceSchema,
```

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
import type { CraftingBalance, DropsBalance, Haul, MaterialsPouch } from './crafting.js';
```

with:

```ts
import type { CraftingBalance, DropsBalance, Haul, MaterialsPouch } from './crafting.js';
import type { QuestsBalance } from './quests.js';
```

Replace:

```ts
  drops: DropsBalance;
```

with:

```ts
  drops: DropsBalance;
  /** The quest tracker and the Contract board (see the quests spec). */
  quests: QuestsBalance;
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-data.test.ts)`
Expected: PASS, 10 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 10 tests in F + 1 files pass (1779 | 5 skipped in 96 | 1 skipped).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-a
(cd packages/engine && npx prettier --write --end-of-line auto src/data/schemas.ts src/types/delve.ts tests/delve-quests-data.test.ts)
git add packages/engine/src/data/balance.json packages/engine/src/data/schemas.ts packages/engine/src/types/delve.ts packages/engine/tests/delve-quests-data.test.ts
git commit -m "feat(engine): delve.quests: the tracker's cap and the Contract board's numbers" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: Save v9

### Task 4: Save v9: the quests; older saves reset

`DelveProfile.quests`, its schema and the new save's empty quests. No migration: a version 8 save resets like any other.

**Files:**
- Create: `packages/engine/src/delve/quests.ts`, `packages/engine/tests/delve-quests-save.test.ts`
- Modify: `packages/engine/src/types/delve.ts`, `src/delve/profile.ts`, `src/delve/profile-schema.ts`; `packages/engine/tests/delve-save-v8.test.ts`, `delve-dive.test.ts`, `delve-pair.test.ts`, `delve-profile-abilities.test.ts`, `delve-runes-contract.test.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-quests-save.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { emptyQuests } from '../src/delve/quests.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Contract } from '../src/types/quests.js';

// See the quests spec: "Profile v9" (older saves reset; no migration).

const registry = createDefaultRegistry();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));
const fresh = () => createDelveProfile(registry, 7, { primary: 'fire' });

const contract: Contract = {
  id: 'contract:0',
  template: 'cull',
  tier: 'hard',
  name: 'Cull',
  line: 'A line.',
  objectives: [
    {
      id: 'o',
      type: 'kill',
      filter: { kind: 'elite', biome: 'cinder_mines' },
      count: 12,
      scope: 'total',
      text: 'Slay 12 elites in the Cinder Mines',
    },
  ],
  rewards: [
    { kind: 'scrap', count: 60 },
    { kind: 'essence', id: 'fit', count: 1 },
  ],
  progress: [{ value: 4, done: false }],
};
/** A save mid-way: a quest under way, tracked and seen, one claimed, a contract on the board. */
const underWay = (p: DelveProfile): DelveProfile => ({
  ...p,
  quests: {
    ...p.quests,
    progress: { first_steps: [{ value: 1, done: false }] },
    unlocked: ['first_steps', 'old'],
    claimed: ['old'],
    tracked: ['first_steps', 'contract:0'],
    seen: ['first_steps'],
    board: [contract, null, null],
    boardCount: 1,
    contractsClaimed: 2,
    rerollUsed: true,
    claimCount: 3,
  },
});

describe('save v9', () => {
  it("starts empty: nothing unlocked, tracked or claimed, and the board's three slots empty", () => {
    expect(emptyQuests(registry)).toEqual({
      progress: {},
      unlocked: [],
      claimed: [],
      tracked: [],
      seen: [],
      board: [null, null, null],
      boardCount: 0,
      contractsClaimed: 0,
      rerollUsed: false,
      claimCount: 0,
    });
    const p = fresh();
    expect(p.version).toBe(9);
    expect(p.quests.board).toHaveLength(registry.getDelveBalance().quests.contracts.slots);
  });

  it('round-trips the quests, the board and its contracts, mid-dive too', () => {
    const p = underWay(fresh());
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
    const diving = startDive(registry, p, 1);
    expect(parseDelveProfile(registry, json(diving))).toEqual({ profile: diving });
  });

  it('resets a version 8 save; a version 9 save without its quests, or a bad contract, is refused', () => {
    const p = underWay(fresh());
    expect(parseDelveProfile(registry, json({ ...p, version: 8 }))).toEqual({ reset: true });
    const { quests: _q, ...noQuests } = p;
    expect(parseDelveProfile(registry, json(noQuests))).toBeNull();
    const board = (c: object) => json({ ...p, quests: { ...p.quests, board: [c, null, null] } });
    expect(parseDelveProfile(registry, board({ ...contract, tier: 'epic' }))).toBeNull();
    expect(parseDelveProfile(registry, board({ ...contract, objectives: [] }))).toBeNull();
    const forgeInADive = { ...contract.objectives[0], type: 'forge', filter: {}, scope: 'dive' };
    expect(
      parseDelveProfile(registry, board({ ...contract, objectives: [forgeInADive] })),
    ).toBeNull();
  });
});
```

The tests that read the version:

In `packages/engine/tests/delve-save-v8.test.ts`:

Replace:

```ts
    expect(p.version).toBe(8);
```

with:

```ts
    expect(p.version).toBe(9);
```

Replace:

```ts
  it('resets a save of any other version; a version 8 save that does not fit is refused', () => {
```

with:

```ts
  it('resets a save of any other version; a version 9 save that does not fit is refused', () => {
```

Replace:

```ts
    for (const version of [2, 6, 7, 9, undefined])
```

with:

```ts
    for (const version of [2, 6, 7, 8, undefined])
```

In `packages/engine/tests/delve-dive.test.ts`:

Replace:

```ts
    expect(p.version).toBe(8);
```

with:

```ts
    expect(p.version).toBe(9);
```

In `packages/engine/tests/delve-pair.test.ts`:

Replace:

```ts
  it('a new profile is version 8 with no pair yet, no Mana Dust, no Links and no runes, and round-trips', () => {
```

with:

```ts
  it('a new profile is version 9 with no pair yet, no Mana Dust, no Links and no runes, and round-trips', () => {
```

Replace:

```ts
      version: 8,
```

with:

```ts
      version: 9,
```

In `packages/engine/tests/delve-profile-abilities.test.ts`:

Replace:

```ts
    expect(p.version).toBe(8);
```

with:

```ts
    expect(p.version).toBe(9);
```

In `packages/engine/tests/delve-runes-contract.test.ts`:

Replace:

```ts
describe('save v8: sockets and the pouch', () => {
```

with:

```ts
describe('save v9: sockets and the pouch', () => {
```

Replace:

```ts
  it('a new profile is version 8 with an empty pouch; a version 6 or 7 save resets', () => {
```

with:

```ts
  it('a new profile is version 9 with an empty pouch; a version 6 or 7 save resets', () => {
```

Replace:

```ts
    expect(p).toMatchObject({ version: 8, runes: {} });
```

with:

```ts
    expect(p).toMatchObject({ version: 9, runes: {} });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-save.test.ts tests/delve-save-v8.test.ts tests/delve-dive.test.ts tests/delve-pair.test.ts tests/delve-profile-abilities.test.ts tests/delve-runes-contract.test.ts)`
Expected: FAIL: `delve-quests-save.test.ts` doesn't load (`Error: Cannot find module '../src/delve/quests.js'`), and the six version tests in the other five files fail (they read 8): 6 failed, 115 passed.

- [ ] **Step 3: The save**

B1's file (Task 6 adds the stubs):

Create `packages/engine/src/delve/quests.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { ProfileQuests } from '../types/quests.js';

/**
 * Quests on the profile (see the quests spec): progress from quest events,
 * unlocks, claims, tracking and the journal's view.
 */

/**
 * A new save's quests: nothing unlocked, claimed, tracked or seen, and the
 * Contract board's `contracts.slots` slots empty.
 */
export function emptyQuests(registry: DataRegistry): ProfileQuests {
  return {
    progress: {},
    unlocked: [],
    claimed: [],
    tracked: [],
    seen: [],
    board: Array.from({ length: registry.getDelveBalance().quests.contracts.slots }, () => null),
    boardCount: 0,
    contractsClaimed: 0,
    rerollUsed: false,
    claimCount: 0,
  };
}
```

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
import type { QuestsBalance } from './quests.js';
```

with:

```ts
import type { ProfileQuests, QuestsBalance } from './quests.js';
```

Replace:

```ts
  version: 8;
```

with:

```ts
  version: 9;
```

Replace:

```ts
  dive: DiveState | null;
}
```

with:

```ts
  /** Quests, the Contract board and their progress (see the quests spec). */
  quests: ProfileQuests;
  dive: DiveState | null;
}
```

In `packages/engine/src/delve/profile.ts`:

Replace:

```ts
import { emptyMaterials } from '../loot/materials.js';
```

with:

```ts
import { emptyMaterials } from '../loot/materials.js';
import { emptyQuests } from './quests.js';
```

Replace:

```ts
    version: 8,
```

with:

```ts
    version: 9,
```

Replace:

```ts
    reactionsSeen: [],
```

with:

```ts
    reactionsSeen: [],
    quests: emptyQuests(registry),
```

Replace:

```ts
 * Validate an unknown JSON blob as a save. A version 8 save is fitted to the
```

with:

```ts
 * Validate an unknown JSON blob as a save. A version 9 save is fitted to the
```

Replace:

```ts
 * when it isn't an object, or a version 8 save doesn't fit the schema.
```

with:

```ts
 * when it isn't an object, or a version 9 save doesn't fit the schema.
```

Replace:

```ts
  if ((raw as { version?: unknown }).version !== 8) return { reset: true };
```

with:

```ts
  if ((raw as { version?: unknown }).version !== 9) return { reset: true };
```

In `packages/engine/src/delve/profile-schema.ts`:

Replace:

```ts
  MoveKindSchema,
  ReactionIdSchema,
} from '../data/schemas.js';
```

with:

```ts
  MoveKindSchema,
  ObjectiveSchema,
  ReactionIdSchema,
  RewardSchema,
} from '../data/schemas.js';
```

Replace:

```ts
import { FLUX_GRADES, METAL_IDS } from '../types/crafting.js';
```

with:

```ts
import { FLUX_GRADES, METAL_IDS } from '../types/crafting.js';
import { CONTRACT_TIERS } from '../types/quests.js';
```

Replace:

```ts
/** Zod schema for persisted Delve saves (version 8 only) — rejects corrupt or foreign data. */
```

with:

```ts
/** Zod schema for persisted Delve saves (version 9 only) — rejects corrupt or foreign data. */
```

Replace:

```ts
/** Version 8: materials, patterns and essences (see the crafting spec); older saves reset. */
export const DelveProfileSchema = z.object({
  version: z.literal(8),
```

with:

```ts
const ProgressSchema = z.object({ value: count, done: z.boolean() });

/** A contract on the board, with its own progress. */
const ContractSchema = z.object({
  id: z.string(),
  template: z.string(),
  tier: z.enum(CONTRACT_TIERS),
  name: z.string(),
  line: z.string(),
  objectives: z.array(ObjectiveSchema).min(1),
  rewards: z.array(RewardSchema),
  progress: z.array(ProgressSchema),
});

/** The quests (see the quests spec). */
const QuestsSchema = z.object({
  progress: z.record(z.string(), z.array(ProgressSchema)),
  unlocked: z.array(z.string()),
  claimed: z.array(z.string()),
  tracked: z.array(z.string()),
  seen: z.array(z.string()),
  board: z.array(ContractSchema.nullable()),
  boardCount: count,
  contractsClaimed: count,
  rerollUsed: z.boolean(),
  claimCount: count,
});

/** Version 9: the quests (see the quests spec); older saves reset. */
export const DelveProfileSchema = z.object({
  version: z.literal(9),
```

Replace:

```ts
  reactionsSeen: z.array(ReactionIdSchema),
  dive: DiveSchema.nullable(),
```

with:

```ts
  reactionsSeen: z.array(ReactionIdSchema),
  quests: QuestsSchema,
  dive: DiveSchema.nullable(),
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: the Step 2 command.
Expected: PASS, 124 (6 files) tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 13 tests in F + 2 files pass (1782 | 5 skipped in 97 | 1 skipped): the pacing rails unchanged (the quests take no draws and change no play).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-a
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/quests.ts src/types/delve.ts src/delve/profile.ts src/delve/profile-schema.ts tests/delve-quests-save.test.ts tests/delve-save-v8.test.ts tests/delve-dive.test.ts tests/delve-pair.test.ts tests/delve-profile-abilities.test.ts tests/delve-runes-contract.test.ts)
git add packages/engine/src/delve/quests.ts packages/engine/src/types/delve.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/profile-schema.ts packages/engine/tests/delve-quests-save.test.ts packages/engine/tests/delve-save-v8.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-profile-abilities.test.ts packages/engine/tests/delve-runes-contract.test.ts
git commit -m "feat(engine): save v9 holds the quests; older saves reset" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The arena's fields and the stubs

### Task 5: `WorldPending.questEvents` and the floor flags

The fields B1 fills: the events a world collects until it banks, and the two floor flags `clearFloor` reads.

**Files:**
- Create: `packages/engine/tests/delve-quests-contract.test.ts`
- Modify: `packages/engine/src/types/arpg.ts`, `src/arpg/world.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-quests-contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { emptyPending } from '../src/arpg/world.js';
import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';

// The quests contract (see the quests spec's "Phases and parallel areas"): the
// fields and exports the areas fill in exist from the start.

const registry = createDefaultRegistry();
const diving = () => startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);

describe('quest events in the arena', () => {
  it('a floor starts with no quest events and its flags down; a bank takes the events', () => {
    const p = diving();
    const world = beginFloor(registry, p);
    expect(world.pending.questEvents).toEqual([]);
    expect([world.potionDrunk, world.hurt]).toEqual([false, false]);
    expect(emptyPending().questEvents).toEqual([]);
    world.pending.questEvents.push({ type: 'perfectDodge' });
    bankWorld(registry, p, world);
    expect(world.pending.questEvents).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-contract.test.ts)`
Expected: FAIL, 1 test: `AssertionError: expected undefined to deeply equal []` (no `questEvents`).

- [ ] **Step 3: The fields**

In `packages/engine/src/types/arpg.ts`:

Replace:

```ts
import type { Haul, MaterialRef } from './crafting.js';
```

with:

```ts
import type { Haul, MaterialRef } from './crafting.js';
import type { QuestEvent } from './quests.js';
```

Replace:

```ts
  /** Patterns picked up, learned when they bank. */
  patterns: string[];
```

with:

```ts
  /** Patterns picked up, learned when they bank. */
  patterns: string[];
  /** What happened for the quests' objectives, applied when the world banks (see the quests spec). */
  questEvents: QuestEvent[];
```

Replace:

```ts
  heroDead: boolean;
```

with:

```ts
  heroDead: boolean;
  /** A potion was drunk on this floor: a `clearFloor` objective's `noPotion` (see the quests spec). */
  potionDrunk: boolean;
  /** The hero took damage on this floor: `noDamage`. */
  hurt: boolean;
```

In `packages/engine/src/arpg/world.ts`:

Replace:

```ts
    patterns: [],
    newFloor,
```

with:

```ts
    patterns: [],
    questEvents: [],
    newFloor,
```

Replace:

```ts
    heroDead: false,
```

with:

```ts
    heroDead: false,
    potionDrunk: false,
    hurt: false,
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-contract.test.ts)`
Expected: PASS, 1 test.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 14 tests in F + 3 files pass (1783 | 5 skipped in 98 | 1 skipped).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-a
(cd packages/engine && npx prettier --write --end-of-line auto src/types/arpg.ts src/arpg/world.ts tests/delve-quests-contract.test.ts)
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/tests/delve-quests-contract.test.ts
git commit -m "feat(engine): the world's pending quest events and its floor flags" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: The typed stubs and their call sites

Every op B1 and B2 fill, in their own files, exported whole; `createDelveProfile` → `applyQuestEvents` and `refillBoard`, `settleDive` → `refillBoard`, a claim's rewards → `resolveReward` (`grantRewards`). See "What Phase A implements" for why none of it throws in A.

**Files:**
- Create: `packages/engine/src/delve/rewards.ts`, `packages/engine/src/delve/contracts.ts`
- Modify: `packages/engine/src/delve/quests.ts`, `src/delve/profile.ts`, `src/delve/dive.ts` (hand-edited), `src/index.ts`, `packages/engine/tests/delve-quests-contract.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-quests-contract.test.ts`:

Replace:

```ts
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { emptyPending } from '../src/arpg/world.js';
import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
```

with:

```ts
import * as engine from '../src/index.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { emptyPending } from '../src/arpg/world.js';
import { bankWorld, beginFloor, extractDive, startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { claimQuest, grantRewards } from '../src/delve/quests.js';
```

Replace:

```ts
const diving = () => startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);
```

with:

```ts
const diving = () => startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);

/** The default data with no contract templates: nothing ever calls `refillBoard`. */
function withoutTemplates(): DataRegistry {
  const d = loadAndValidateData();
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
    { ...d.quests, contractTemplates: [] },
  );
}
```

Append at the end of the file:

```ts
describe('the quests contract', () => {
  it('exports every quest op and table from the engine', () => {
    for (const name of [
      // delve/quests.ts (B1)
      'emptyQuests',
      'applyQuestEvents',
      'questStates',
      'claimQuest',
      'grantRewards',
      'trackQuest',
      'markQuestSeen',
      // delve/rewards.ts, delve/contracts.ts (B2)
      'resolveReward',
      'generateContract',
      'refillBoard',
      'rerollContract',
      // data/quests-check.ts
      'questsDataProblems',
    ])
      expect(typeof (engine as Record<string, unknown>)[name], name).toBe('function');
    expect(engine.OBJECTIVE_TYPES).toHaveLength(13);
    expect(engine.REWARD_KINDS).toHaveLength(8);
    expect(engine.CONTRACT_TIERS).toEqual(['easy', 'normal', 'hard']);
  });

  it('without contract templates, a new save and a dive that cleared a depth leave the board empty', () => {
    const bare = withoutTemplates();
    const p = startDive(bare, createDelveProfile(bare, 4, { primary: 'fire' }), 1);
    expect(p.quests.board).toEqual([null, null, null]);
    const cleared = { ...p, dive: { ...p.dive!, phase: 'choosing' as const, depthsCleared: 1 } };
    expect(extractDive(bare, cleared).quests.board).toEqual([null, null, null]);
  });

  it('claims only at the Anvil, between dives', () => {
    const p = diving();
    expect(claimQuest(registry, p, 'first_steps')).toEqual({
      ok: false,
      profile: p,
      reason: 'Claim at the Anvil, between dives',
    });
  });

  it('a claim with no rewards grants nothing, and moves claimCount on', () => {
    const p = createDelveProfile(registry, 4, { primary: 'fire' });
    const r = grantRewards(registry, p, 'first_steps', []);
    expect(r.granted).toEqual([]);
    expect(r.profile).toEqual({ ...p, quests: { ...p.quests, claimCount: 1 } });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-contract.test.ts)`
Expected: FAIL, 3 of 5: `emptyQuests: expected 'undefined' to be 'function'` (the index doesn't export the quest modules), `TypeError: (0 , claimQuest) is not a function` and `TypeError: (0 , grantRewards) is not a function`; the arena's test and the no-templates test pass.

- [ ] **Step 3: The stubs and the wiring**

Create `packages/engine/src/delve/rewards.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { DelveProfile } from '../types/delve.js';
import type { Reward, RewardGrant } from '../types/quests.js';

/**
 * Quest and contract rewards (see the quests spec's Rewards): `resolveReward`
 * settles a reward, its rule resolved against the profile on `rng`, and adds
 * it to the stockpile (never a dive's haul). `grantRewards` (`delve/quests.ts`)
 * calls it for each reward of a claim, on the claim's stream.
 */

/**
 * `reward` made concrete (`granted`) and added to the stockpile: `metal:
 * 'depth'` the metal of the best depth, a shard rule a random affix of its
 * family at its tier (clamped to the affix's tiers), `essence: 'fit'` a
 * legendary whose slots fit a learned pattern, `pattern: 'unknown'` a random
 * unknown pattern (learned), else its `fallback`. Stub (B2).
 */
export function resolveReward(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _reward: Reward,
  _rng: SeededRNG,
): { profile: DelveProfile; granted: RewardGrant } {
  throw new Error('resolveReward: not implemented');
}
```

Create `packages/engine/src/delve/contracts.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { DelveProfile } from '../types/delve.js';
import type { Contract } from '../types/quests.js';
import type { ProfileActionResult } from './profile.js';

/**
 * The Contract board (see the quests spec): `profile.quests.board`'s
 * contracts, generated from `quests.json → contractTemplates` on forks of the
 * profile seed (reloading never rerolls), refilled after a dive that cleared a
 * depth, one reroll an Anvil visit. No expiry.
 */

/**
 * The next contract, `contract:<boardCount>`, from a template and a tier
 * (`contracts.tierWeights`) drawn on `contract:<boardCount>` from the profile
 * seed, its filter filled with only what is possible for the hero, its count
 * from the tier's range and its rewards × (1 + depthScale × bestDepth); a
 * hard one may add an essence (`essence: 'fit'`) at `essenceChance`. The
 * caller moves `boardCount` on. Stub (B2).
 */
export function generateContract(_registry: DataRegistry, _profile: DelveProfile): Contract {
  throw new Error('generateContract: not implemented');
}

/**
 * Every empty slot filled (`generateContract` each), and the visit's reroll
 * back (`rerollUsed` false). `createDelveProfile`, and `settleDive` after a
 * dive that cleared a depth, call it while `contractTemplates` holds any.
 * Stub (B2).
 */
export function refillBoard(_registry: DataRegistry, _profile: DelveProfile): DelveProfile {
  throw new Error('refillBoard: not implemented');
}

/**
 * Slot `slot`'s contract replaced (`generateContract`) for `rerollScrap`, once
 * an Anvil visit; refused mid-dive, on an empty slot, or once the visit's
 * reroll is spent. The old contract's id leaves `tracked` and `seen`. Stub (B2).
 */
export function rerollContract(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _slot: number,
): ProfileActionResult {
  throw new Error('rerollContract: not implemented');
}
```

In `packages/engine/src/delve/quests.ts`:

Replace:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { ProfileQuests } from '../types/quests.js';
```

with:

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
import { isDiveActive } from './dive.js';
import type { ProfileActionResult } from './profile.js';
import { resolveReward } from './rewards.js';
```

Append at the end of the file:

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

/**
 * Every unlocked quest, main, side and the board's contracts, as the journal
 * and the HUD draw it: data, never text the engine made. Stub (B1): until
 * then it shows none.
 */
export function questStates(_registry: DataRegistry, _profile: DelveProfile): QuestState[] {
  return [];
}

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

/**
 * A claim's rewards into the stockpile, each through `resolveReward` on the
 * claim's stream, `quest:<questId>:<claimCount>` from the profile seed, and
 * `claimCount` moved on. `claimQuest` calls it once it has checked the claim.
 */
export function grantRewards(
  registry: DataRegistry,
  profile: DelveProfile,
  questId: QuestId,
  rewards: readonly Reward[],
): { profile: DelveProfile; granted: RewardGrant[] } {
  const rng = new SeededRNG(profile.seed).fork(`quest:${questId}:${profile.quests.claimCount}`);
  let next = profile;
  const granted: RewardGrant[] = [];
  for (const reward of rewards) {
    const r = resolveReward(registry, next, reward, rng);
    next = r.profile;
    granted.push(r.granted);
  }
  return {
    profile: { ...next, quests: { ...next.quests, claimCount: profile.quests.claimCount + 1 } },
    granted,
  };
}

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

In `packages/engine/src/delve/profile.ts`:

Replace:

```ts
import { emptyQuests } from './quests.js';
```

with:

```ts
import { applyQuestEvents, emptyQuests } from './quests.js';
import { refillBoard } from './contracts.js';
```

Replace:

```ts
import type { ShardRef } from '../types/crafting.js';
```

with:

```ts
import type { ShardRef } from '../types/crafting.js';
import type { RewardGrant } from '../types/quests.js';
```

Replace:

```ts
  /** Runes the op destroyed. */
  destroyed?: RuneRef[];
}
```

with:

```ts
  /** Runes the op destroyed. */
  destroyed?: RuneRef[];
  /** What a claim gave (see the quests spec). */
  rewards?: RewardGrant[];
}
```

Replace:

```ts
  return opts.primary ? chooseStartingMana(registry, profile, opts.primary).profile : profile;
```

with:

```ts
  // The first unlocks, and a full Contract board once there are templates (see the quests spec).
  let started = applyQuestEvents(registry, profile, []);
  if (registry.getQuestsData().contractTemplates.length > 0)
    started = refillBoard(registry, started);
  return opts.primary ? chooseStartingMana(registry, started, opts.primary).profile : started;
```

By hand: never format this file.

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
import type { SetChainsOptions } from './runes.js';
```

with:

```ts
import type { SetChainsOptions } from './runes.js';
import { refillBoard } from './contracts.js';
```

Replace:

```ts
  return {
    ...stockHaul(profile, kept),
    dive: { ...dive, haul: emptyHaul(), banked: kept, lost, settled: true },
  };
}
```

with:

```ts
  const settled: DelveProfile = {
    ...stockHaul(profile, kept),
    dive: { ...dive, haul: emptyHaul(), banked: kept, lost, settled: true },
  };
  // A dive that cleared a depth refills the Contract board (the quests spec's S2), once there are templates.
  const refill = dive.depthsCleared > 0 && registry.getQuestsData().contractTemplates.length > 0;
  return refill ? refillBoard(registry, settled) : settled;
}
```

In `packages/engine/src/index.ts`:

Replace:

```ts
export * from './arpg/material-drops.js';
```

with:

```ts
export * from './arpg/material-drops.js';

// Quests (see the quests spec): every module whole, so the areas that build them never edit this file.
export * from './delve/quests.js';
export * from './delve/rewards.js';
export * from './delve/contracts.js';
export { questsDataProblems } from './data/quests-check.js';
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-contract.test.ts)`
Expected: PASS, 5 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 18 tests in F + 3 files pass (1787 | 5 skipped in 98 | 1 skipped): the pacing rails unchanged.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-a
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/rewards.ts src/delve/contracts.ts src/delve/quests.ts src/delve/profile.ts src/index.ts tests/delve-quests-contract.test.ts)
git add packages/engine/src/delve/rewards.ts packages/engine/src/delve/contracts.ts packages/engine/src/delve/quests.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/dive.ts packages/engine/src/index.ts packages/engine/tests/delve-quests-contract.test.ts
git commit -m "feat(engine): the quest ops' typed stubs, wired: new saves and settled dives refill the board, claims grant through resolveReward" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 5: The client

### Task 7: The store's quest actions on save v9

The bundle rebuilt; the four player ops wrapped, as the crafting ops are.

**Files:**
- Modify: `packages/client/src/stores/delveStore.ts`, `delveStore.test.ts`, `packages/client/src/features/delve/__tests__/arena-bank.test.ts`

- [ ] **Step 1: Rebuild the bundle**

Run: `(cd packages/engine && npx tsup)`
Expected: "Build success" for CJS, ESM and DTS. Against it the client's typecheck fails in `src/features/delve/__tests__/arena-bank.test.ts` (`questEvents` missing from its `WorldPending`), and two store tests fail (they expect version 8).

- [ ] **Step 2: The failing tests**

In `packages/client/src/stores/delveStore.test.ts`:

Replace:

```ts
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":7,"broken":true}');
    expect(loadDelveProfile()).toEqual({ reset: true });
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":8,"broken":true}');
```

with:

```ts
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":8,"broken":true}');
    expect(loadDelveProfile()).toEqual({ reset: true });
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":9,"broken":true}');
```

Replace:

```ts
    const old = { ...useDelveStore.getState().profile, version: 7, scrap: 999 };
```

with:

```ts
    const old = { ...useDelveStore.getState().profile, version: 8, scrap: 999 };
```

Replace:

```ts
    expect(fresh.getState().profile).toMatchObject({ version: 8, scrap: 50 }); // the kit's
```

with:

```ts
    expect(fresh.getState().profile).toMatchObject({ version: 9, scrap: 50 }); // the kit's
```

Replace:

```ts
      version: 8,
      scrap: 50,
```

with:

```ts
      version: 9,
      scrap: 50,
```

Replace:

```ts
    expect('fuse' in s).toBe(false);
  });
```

with:

```ts
    expect('fuse' in s).toBe(false);
  });

  it('wraps every quest op of the engine (B1 and B2 fill them); a claim waits for the Anvil', () => {
    const s = useDelveStore.getState();
    for (const op of [s.claimQuest, s.rerollContract, s.trackQuest, s.markQuestSeen])
      expect(op).toBeTypeOf('function');
    s.startDive(1);
    const diving = useDelveStore.getState().profile;
    expect(useDelveStore.getState().claimQuest('first_steps')).toEqual({
      ok: false,
      profile: diving,
      reason: 'Claim at the Anvil, between dives',
    });
    expect(useDelveStore.getState().profile).toBe(diving);
  });
```

In `packages/client/src/features/delve/__tests__/arena-bank.test.ts`:

Replace:

```ts
  patterns: [],
  newFloor: false,
```

with:

```ts
  patterns: [],
  questEvents: [],
  newFloor: false,
```

- [ ] **Step 3: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts)`
Expected: FAIL, 1 test: `delveStore > wraps every quest op of the engine (B1 and B2 fill them); a claim waits for the Anvil`: `AssertionError: expected undefined to be type of 'function'` (37 pass).

- [ ] **Step 4: The actions**

In `packages/client/src/stores/delveStore.ts`:

Replace:

```ts
  buyShard as engineBuyShard,
```

with:

```ts
  buyShard as engineBuyShard,
  claimQuest as engineClaimQuest,
  rerollContract as engineRerollContract,
  trackQuest as engineTrackQuest,
  markQuestSeen as engineMarkQuestSeen,
```

Replace:

```ts
  buyShard: (stat: HeroStatKey) => ProfileActionResult;
```

with:

```ts
  buyShard: (stat: HeroStatKey) => ProfileActionResult;
  /** Claim a completed quest or contract at the Anvil: its rewards to the stockpile (see the quests spec). */
  claimQuest: (id: string) => ProfileActionResult;
  /** Replace a board slot's contract, for scrap, once an Anvil visit. */
  rerollContract: (slot: number) => ProfileActionResult;
  /** Track a quest on the HUD (up to `delve.quests.maxTracked`), or stop. */
  trackQuest: (id: string, on: boolean) => ProfileActionResult;
  /** The journal opened a quest: it is NEW no more. */
  markQuestSeen: (id: string) => void;
```

Replace:

```ts
    buyShard: (stat) => applyResult(engineBuyShard(registry(), get().profile, stat)),
```

with:

```ts
    buyShard: (stat) => applyResult(engineBuyShard(registry(), get().profile, stat)),

    claimQuest: (id) => applyResult(engineClaimQuest(registry(), get().profile, id)),

    rerollContract: (slot) => applyResult(engineRerollContract(registry(), get().profile, slot)),

    trackQuest: (id, on) => applyResult(engineTrackQuest(registry(), get().profile, id, on)),

    markQuestSeen: (id) => commit(engineMarkQuestSeen(registry(), get().profile, id)),
```

- [ ] **Step 5: Run them to see them pass, then the suite**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts src/features/delve/__tests__/arena-bank.test.ts)`
Expected: PASS, 42 (2 files) tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 1 tests in G files pass (1222 in 152).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-quest-a
(cd packages/client && npx prettier --write --end-of-line auto src/stores/delveStore.ts src/stores/delveStore.test.ts src/features/delve/__tests__/arena-bank.test.ts)
git add packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts packages/client/src/features/delve/__tests__/arena-bank.test.ts
git commit -m "feat(client): the store's quest actions on save v9" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: `useQuests` on the engine's quests; the dev fixture goes

`useQuests` reads `questStates` for the stored profile and maps each through `questView` to the `QuestView` the journal and the tracker already draw; tracking goes through the store. The kinds are the engine's (Contracts for Bounties). The dev fixture becomes a test fixture and the `alloy:delve:questPreview` flag goes.

**Files:**
- Create: `packages/client/src/features/delve/quests/quest-view.ts`
- Move: `packages/client/src/features/delve/quests/sample.ts` → `quests/__tests__/quest-fixture.ts`
- Modify: `packages/client/src/features/delve/quests/types.ts`, `quests/useQuests.ts`, `hub/quests/QuestsTab.tsx`; tests `quests/__tests__/useQuests.test.ts`, `quests/__tests__/QuestTracker.test.tsx`, `hub/quests/__tests__/QuestsTab.test.tsx`, `arena/hud/__tests__/FloorColumn.test.tsx` (all under `packages/client/src/features/delve/`)

- [ ] **Step 1: The fixture moves to the tests**

Run: `git mv packages/client/src/features/delve/quests/sample.ts packages/client/src/features/delve/quests/__tests__/quest-fixture.ts`

In `packages/client/src/features/delve/quests/__tests__/quest-fixture.ts`:

Replace:

```ts
import type { QuestView } from './types';

/** The dev preview's quests (localStorage `alloy:delve:questPreview` = "1"): the Quests board's fixture. */
```

with:

```ts
import type { QuestView } from '../types';

/** Quest views for the journal's and the tracker's tests: a main quest, two side quests and a contract. */
```

Replace:

```ts
    kind: 'bounty',
    name: 'Rat Catcher',
    sub: 'Refreshes each day',
```

with:

```ts
    kind: 'contract',
    name: 'Rat Catcher',
    sub: 'Contract board',
```

- [ ] **Step 2: The failing tests**

In `packages/client/src/features/delve/quests/__tests__/useQuests.test.ts`:

Replace the lines from `import { describe, it, expect, beforeEach } from 'vitest';` to the end of the file with:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { questStates, type QuestState } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../registry';
import { questView } from '../quest-view';
import { useQuests } from '../useQuests';

// The engine's quests (B1 fills `questStates`): each test says what it gives.
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  questStates: vi.fn(() => []),
}));

const registry = getDelveRegistry();
/** A main quest under way, as `questStates` gives it. */
const FIRST: QuestState = {
  id: 'first_steps',
  kind: 'main',
  status: 'active',
  isNew: true,
  tracked: true,
  name: 'First Steps',
  line: 'Go down a little way.',
  chapter: 'Embers of the Anvil',
  objectives: [{ id: 'depth', text: 'Reach depth 2', value: 1, count: 2, done: false }],
  rewards: [
    { ref: { kind: 'metal', metal: 'iron' }, count: 3 },
    { ref: { kind: 'scrap' }, count: 40 },
    { ref: { kind: 'pattern', pattern: 'maul' }, count: 1 },
    { rule: { kind: 'shard', family: 'offense', tier: 3, count: 1 } },
  ],
};

describe('questView', () => {
  it('draws an engine quest: Hesta gives it, her line its story, each reward named', () => {
    expect(questView(registry, FIRST)).toEqual({
      id: 'first_steps',
      kind: 'main',
      name: 'First Steps',
      sub: 'Embers of the Anvil',
      chapter: 'Embers of the Anvil',
      story: 'Go down a little way.',
      giver: 'hesta',
      objectives: [
        { id: 'depth', text: 'Reach depth 2', done: false, progress: { value: 1, max: 2 } },
      ],
      rewards: [
        { id: '0', name: '3 × Iron bar', color: '#8b9bb4' },
        { id: '1', name: '40 scrap', color: '#fcd34d' },
        { id: '2', name: 'Maul pattern', color: '#c0cbdc' },
        { id: '3', name: 'Chosen when you claim it', color: '#c0cbdc' },
      ],
      tracked: true,
    });
  });

  it('a quest with no chapter reads its first objective under its name', () => {
    const side: QuestState = { ...FIRST, kind: 'side', chapter: undefined };
    expect(questView(registry, side).sub).toBe('Reach depth 2');
  });
});

describe('useQuests', () => {
  const trackQuest = useDelveStore.getState().trackQuest;
  afterEach(() => useDelveStore.setState({ trackQuest }));

  it("reads the engine's quests for the profile, and tracks through the store", () => {
    vi.mocked(questStates).mockReturnValue([FIRST]);
    const track = vi.fn();
    useDelveStore.setState({ trackQuest: track });
    const { result } = renderHook(() => useQuests());
    expect(result.current.quests).toEqual([questView(registry, FIRST)]);
    expect(questStates).toHaveBeenLastCalledWith(registry, useDelveStore.getState().profile);
    act(() => result.current.setTracked('first_steps', false));
    expect(track).toHaveBeenCalledWith('first_steps', false);
  });

  it('has none while the engine has none', () => {
    vi.mocked(questStates).mockReturnValue([]);
    const { result } = renderHook(() => useQuests());
    expect(result.current.quests).toEqual([]);
  });
});
```

In `packages/client/src/features/delve/quests/__tests__/QuestTracker.test.tsx`:

Replace:

```ts
import { SAMPLE_QUESTS } from '../sample';
```

with:

```ts
import { SAMPLE_QUESTS } from './quest-fixture';
```

Replace:

```ts
    const [main, side, , bounty] = SAMPLE_QUESTS;
```

with:

```ts
    const [main, side, , contract] = SAMPLE_QUESTS;
```

Replace:

```ts
        quests={[tracked(main), tracked(side), tracked(bounty), tracked(side, 'fourth')]}
```

with:

```ts
        quests={[tracked(main), tracked(side), tracked(contract), tracked(side, 'fourth')]}
```

Replace:

```ts
    expect(screen.getByTestId('tracked-rat-catcher')).toHaveTextContent('Bounty');
```

with:

```ts
    expect(screen.getByTestId('tracked-rat-catcher')).toHaveTextContent('Contract');
```

In `packages/client/src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx`:

Replace:

```ts
import { SAMPLE_QUESTS } from '../../../quests/sample';
```

with:

```ts
import { SAMPLE_QUESTS } from '../../../quests/__tests__/quest-fixture';
```

The Quests tab's tests stub its `useQuests` with the fixture, tracking kept locally.

In `packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx`:

Replace:

```ts
import { QUEST_PREVIEW_KEY } from '../../../quests/useQuests';
```

with:

```ts
import { SAMPLE_QUESTS } from '../../../quests/__tests__/quest-fixture';
import type { QuestView } from '../../../quests/types';
```

Replace:

```ts
import type { HubLink } from '../../types';
```

with:

```ts
import type { HubLink } from '../../types';

/** The quests the tab's `useQuests` hands it (the engine's own come with B1); tracking is local. */
const shown = vi.hoisted(() => ({ quests: [] as QuestView[] }));
vi.mock('../../../quests/useQuests', async () => {
  const { useCallback, useState } = await import('react');
  return {
    useQuests: () => {
      const [quests, setQuests] = useState(shown.quests);
      const setTracked = useCallback(
        (id: string, on: boolean) =>
          setQuests((qs) => qs.map((q) => (q.id === id ? { ...q, tracked: on } : q))),
        [],
      );
      return { quests, setTracked };
    },
  };
});
```

Replace:

```ts
  beforeEach(() => localStorage.clear());
```

with:

```ts
  beforeEach(() => {
    shown.quests = [];
  });
```

Replace:

```ts
  it('previews the fixture: the journal by kind, the first quest open, its objectives and rewards', () => {
    localStorage.setItem(QUEST_PREVIEW_KEY, '1');
```

with:

```ts
  it('shows the journal by kind, the first quest open, its objectives and rewards', () => {
    shown.quests = SAMPLE_QUESTS;
```

Replace:

```ts
    expect(headings.map((h) => h.textContent)).toEqual(['Journal', 'Main', 'Side', 'Bounties']);
```

with:

```ts
    expect(headings.map((h) => h.textContent)).toEqual(['Journal', 'Main', 'Side', 'Contracts']);
```

Replace:

```ts
  it('tracks on the HUD from the button and from G / Y, three at most', () => {
    localStorage.setItem(QUEST_PREVIEW_KEY, '1');
```

with:

```ts
  it('tracks on the HUD from the button and from G / Y, three at most', () => {
    shown.quests = SAMPLE_QUESTS;
```

- [ ] **Step 3: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/quests src/features/delve/hub/quests src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx)`
Expected: FAIL: 3 of 12, and `useQuests.test.ts` doesn't load (`Error: Failed to resolve import "../quest-view"`): `QuestTracker > shows up to three tracked quests…` (`TypeError: Cannot read properties of undefined (reading 'text')`: no `contract` kind yet) and both of `QuestsTab`'s tests with the fixture (no Contracts group, no `quest-rat-catcher`).

- [ ] **Step 4: The adapter, the hook and the kinds**

In `packages/client/src/features/delve/quests/types.ts`:

Replace:

```ts
// The quest view a future engine fills (Delve UI v1, decided item 5); nothing here is a rule.

export type QuestKind = 'main' | 'side' | 'bounty';
```

with:

```ts
// The quest view the journal and the HUD draw: an engine QuestState through quest-view.ts. Nothing
// here is a rule.
import type { QuestKind } from '@alloy/engine';

export type { QuestKind };
```

Replace:

```ts
  bounty: { tag: 'Bounty', group: 'Bounties', swatch: '#b55088', text: '#d7a6e8' },
```

with:

```ts
  contract: { tag: 'Contract', group: 'Contracts', swatch: '#b55088', text: '#d7a6e8' },
```

Create `packages/client/src/features/delve/quests/quest-view.ts`:

```ts
import type { DataRegistry, QuestState, RewardView } from '@alloy/engine';
import { materialLabel } from '../hub/forge/materials-text';
import { PATTERN_COLOR, SCRAP_COLOR, materialColor } from '../materials/material-style';
import type { QuestReward, QuestView } from './types';

/** A rule's swatch until it is claimed. */
const RULE_COLOR = '#c0cbdc';

/**
 * An engine quest (`questStates`) as the journal and the HUD tracker draw it: Hesta gives every
 * quest, her line is its story, and each reward is named. A minimal adapter: status, NEW and a
 * rule's own text come with the Quests tab.
 */
export function questView(registry: DataRegistry, quest: QuestState): QuestView {
  return {
    id: quest.id,
    kind: quest.kind,
    name: quest.name,
    sub: quest.chapter ?? quest.objectives[0]?.text ?? '',
    chapter: quest.chapter,
    story: quest.line,
    giver: registry.getQuestsData().giver.sprite,
    objectives: quest.objectives.map((o) => ({
      id: o.id,
      text: o.text,
      done: o.done,
      progress: { value: o.value, max: o.count },
    })),
    rewards: quest.rewards.map((r, i) => rewardView(registry, r, String(i))),
    tracked: quest.tracked,
  };
}

/** "3 × Iron bar", "40 scrap", "Sword pattern"; a rule reads "Chosen when you claim it". */
function rewardView(registry: DataRegistry, reward: RewardView, id: string): QuestReward {
  if ('rule' in reward) return { id, name: 'Chosen when you claim it', color: RULE_COLOR };
  const { ref, count } = reward;
  switch (ref.kind) {
    case 'scrap':
      return { id, name: `${count} scrap`, color: SCRAP_COLOR };
    case 'pattern':
      return {
        id,
        name: `${registry.getGearBase(ref.pattern).name} pattern`,
        color: PATTERN_COLOR,
      };
    default:
      return {
        id,
        name: `${count} × ${materialLabel(registry, ref)}`,
        color: materialColor(registry, ref),
      };
  }
}
```

In `packages/client/src/features/delve/quests/useQuests.ts`:

Replace the lines from `import { useCallback, useState } from 'react';` to the end of the file with:

```ts
import { useCallback, useMemo } from 'react';
import { questStates } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { questView } from './quest-view';
import type { QuestView } from './types';

/**
 * The player's quests, from the engine (`questStates`) through `questView`. `setTracked` tracks
 * through the store (the engine refuses past `delve.quests.maxTracked`).
 */
export function useQuests(): {
  quests: QuestView[];
  setTracked: (id: string, on: boolean) => void;
} {
  const profile = useDelveStore((s) => s.profile);
  const trackQuest = useDelveStore((s) => s.trackQuest);
  const quests = useMemo(() => {
    const registry = getDelveRegistry();
    return questStates(registry, profile).map((q) => questView(registry, q));
  }, [profile]);
  const setTracked = useCallback(
    (id: string, on: boolean) => {
      trackQuest(id, on);
    },
    [trackQuest],
  );
  return { quests, setTracked };
}
```

In `packages/client/src/features/delve/hub/quests/QuestsTab.tsx`:

Replace:

```ts
const KINDS: QuestKind[] = ['main', 'side', 'bounty'];
```

with:

```ts
const KINDS: QuestKind[] = ['main', 'side', 'contract'];
```

Replace:

```ts
 * with "Tracked on the HUD". v1 has no quests, so it shows the empty state in the same three
 * panes; the dev preview flag fills it from the fixture.
```

with:

```ts
 * with "Tracked on the HUD"; with no quests, the empty state in the same three panes.
```

Replace:

```ts
  const kind = quest.kind === 'bounty' ? 'Bounty' : `${QUEST_KIND[quest.kind].tag} quest`;
```

with:

```ts
  const kind = quest.kind === 'contract' ? 'Contract' : `${QUEST_KIND[quest.kind].tag} quest`;
```

- [ ] **Step 5: Run them to see them pass, then the suite**

Run: the Step 3 command.
Expected: PASS, 16 (4 files) tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 3 tests in G files pass (1224 in 152). `grep -rn "questPreview\|QUEST_PREVIEW\|quests/sample" packages/client/src` finds nothing.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-quest-a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/quests/types.ts src/features/delve/quests/quest-view.ts src/features/delve/quests/useQuests.ts src/features/delve/quests/__tests__/quest-fixture.ts src/features/delve/quests/__tests__/useQuests.test.ts src/features/delve/quests/__tests__/QuestTracker.test.tsx src/features/delve/hub/quests/QuestsTab.tsx src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx)
git add packages/client/src/features/delve/quests packages/client/src/features/delve/hub/quests/QuestsTab.tsx packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx packages/client/src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx
git commit -m "feat(client): useQuests reads the engine's quests through questView; the dev fixture and its flag go" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

After Task 8, from the worktree root:

```bash
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
(pnpm -F @alloy/client build)
git status --short
```

Expected: tsup's "Build success" lines; both typechecks clean; the engine suite **N + 18 tests in F + 3 files** (1787 | 5 skipped in 98 | 1 skipped; the pacing rails pass unchanged: nothing in A takes a draw or changes play); the client suite **M + 3 tests in G files** (1224 in 152); the client build succeeds; `git status` shows nothing but the three untracked `docs/superpowers/plans/2026-05-01-*.md` if they are in this worktree. Eight commits on `quest/a`. A save of version 8 resets with the existing toast ("The forge changed: your save was reset"). The Delve E2E is Phase C's and D's to run: its fixtures build saves with `createDelveProfile`, so they write version 9.
