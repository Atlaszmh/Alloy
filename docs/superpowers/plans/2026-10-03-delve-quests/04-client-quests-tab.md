# Delve quests · C1: the Quests tab — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Quests tab filled in: the journal grouped Main / Side / Contracts / Done with NEW and DONE badges (opening a quest marks it seen), the open quest with Hesta, her line, its objectives' progress and its rewards named (rules as what they will be), **Claim** (Enter / A) on a completed quest (disabled in the pause: "Claim at the Anvil"), **Track** (G / Y) up to `delve.quests.maxTracked`, the **Contract board** with its empty slots and **Reroll** (R / X) at the engine's price and with its refusal; the hub's Quests tab pip (the quests to claim) and the Anvil footer's "n to claim" beside Delve.

**Architecture:** The engine owns every rule: `questStates` gives the quests (B1), the store's `claimQuest`, `rerollContract`, `trackQuest` and `markQuestSeen` (Phase A) do the ops, and the tab asks the engine's `rerollContract` for a dry run to show whether the open contract's reroll can go and why not; the price is `delve.quests.contracts.rerollScrap`, the cap `delve.quests.maxTracked`. The adapter `quests/quest-view.ts` adds each quest's status and NEW to the `QuestView` and names the four rule rewards (the best depth's metal, a shard of a family and tier, an essence that fits a known pattern, an unknown pattern); `rewardView` is exported for a claim's grants. The board's slots come from `profile.quests.board` (order and empties), each filled slot drawn from its contract's `QuestView`. `useHubTabs` counts the complete quests for the pip and hands the count and `go` to `AnvilHub`, which passes them to `HubFooter`.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, Vitest 3 (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-03-delve-quests-design.md` (authoritative): "The client" (Quests tab, other screens), S1 and S5, "Claiming", "Tracking", "Seen", "The Contract board", the C1 row of "Phases and parallel areas". The contract is `01-contract.md` in this folder; the overview `00-overview.md`.

---

## Base

- **Starts from:** `quest/main` at `7bc2d20` (Phase A merged, exactly as `01-contract.md`), in this area's worktree `C:/Projects/alloy-quest-c1` on branch `quest/c1`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-quest-c1 -Branch quest/c1 -Base quest/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-quest-c1` in Git Bash.
- **Anchors:** every edit was checked against `quest/main` at `7bc2d20`: applied in this plan's order, task by task, they give exactly the files the tests below ran on (see "Checked on a scratch copy").
- **Before Task 1:** build the engine once for the client's junction (the bundle Phase A built), and measure the client suite:

```bash
cd /c/Projects/alloy-quest-c1
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the client suite **1224 tests in 152 files** (Phase A's count). Call them **M** tests in **G** files.
- **B1 and B2 run in parallel.** Until they merge, `questStates` returns `[]`, `trackQuest`, `markQuestSeen` and `rerollContract` throw, and the board stays empty (no templates). So every unit test here stubs the engine's quests (`useQuests` mocked with the fixture) and the store's ops (`vi.fn`), and the tab's reroll dry run mocks the engine's `rerollContract`. Nothing here calls a stub that throws in a real profile: the tab shows no quests, no contract is on the board, and the dry run runs only for an open contract. **Task 4 (the E2E) waits for B1 and B2.**

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/quests/types.ts` | `QuestView` gains `status` and `isNew` |
| `packages/client/src/features/delve/quests/quest-view.ts` | `questView` carries status and NEW; `rewardView` exported, naming the four rule rewards |
| `packages/client/src/features/delve/quests/__tests__/quest-fixture.ts` | the fixture's quests are active and seen |
| `packages/client/src/features/delve/quests/__tests__/useQuests.test.ts` | the adapter's status, NEW and rule names |
| `packages/client/src/features/delve/hub/quests/QuestsTab.tsx` | the journal's groups, the board, NEW / DONE, Done, seen; Hesta placed; Claim, Track (to `maxTracked`) and Reroll, with their prompts |
| `packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx` | the above |
| `packages/client/src/features/delve/hub/AnvilHub.tsx` | `useHubTabs`: the Quests tab's pip; `claimable` and `go` returned; the footer's count wired |
| `packages/client/src/features/delve/hub/HubFooter.tsx` | "n to claim" beside Delve, between dives |
| `packages/client/src/features/delve/hub/__tests__/AnvilHub.test.tsx` | `useQuests` stubbed; the pip and the footer's count |
| `packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx` | `useQuests` stubbed (empty), so the journal link's test holds once B1 fills the engine's quests |
| `packages/client/e2e/delve-quests.spec.ts` (new) | Q01 First Steps done in a dive, claimed, the next main quest; Q02 a contract rerolled (after B1 and B2) |

## Cross-area needs

1. **C2 (`quests/QuestTracker.tsx`):** read the cap from the balance instead of `MAX_TRACKED`: replace `import { MAX_TRACKED, QUEST_KIND, objectiveCount, type QuestView } from './types';` with `import { QUEST_KIND, objectiveCount, type QuestView } from './types';` plus `import { getDelveRegistry } from '../registry';`, and `quests.filter((q) => q.tracked).slice(0, MAX_TRACKED)` with `quests.filter((q) => q.tracked).slice(0, getDelveRegistry().getDelveBalance().quests.maxTracked)`. Then (the integrator, once C1 and C2 are both in) delete from `quests/types.ts` the lines `/** The HUD tracker shows at most this many. */` and `export const MAX_TRACKED = 3;` (C1 no longer reads it; C2 is its last reader). C2 may also want to hide `status: 'claimed'` quests from the tracker (the engine drops a claimed quest from `tracked`, so none should arrive tracked).
2. **C2 and C1 both touch `quests/types.ts` and `quests/__tests__/quest-fixture.ts`** (C1: `status` and `isNew`, Task 1). If C2 adds fields to `QuestView` or fixture rows, the merge is a plain union of the lines; C2's new `QuestView` literals need `status` and `isNew`.
3. **B1 (`questStates`):** C1 relies on these shapes: concrete rewards as `{ ref, count }` and only the four rule rewards as `{ rule }` (`metal: 'depth'`, a `shard` with `family` and `tier`, `essence: 'fit'`, `pattern: 'unknown'`; any other rule reads "Chosen when you claim it"); claimed main and side quests listed with `status: 'claimed'` (the Done group); each board contract listed with `kind: 'contract'` and its board `id`; main quests in chain order, then side quests (the journal keeps the engine's order); `markQuestSeen` takes a quest the journal shows (the tab calls it only while `isNew`).
4. **B2 (`rerollContract`):** the tab calls it as a **dry run** on every profile change while a contract is open, so it must stay pure (no state outside its result) and cheap; its `reason`s are shown verbatim under the Reroll button (mid-dive, an empty slot, the visit's reroll spent, short of scrap), so write them as player-facing sentences.
5. **D (docs):** CLAUDE.md's Delve section can name the Quests tab's pieces: the journal (Main / Side / Contracts / Done, NEW and DONE), Claim (Enter / A, "Claim at the Anvil" in the pause), Track (G / Y, `maxTracked`), the board and Reroll (R / X, the engine's dry run), the tab's pip and the footer's "n to claim".

## Where the spec left room

1. **What "opening" a quest is.** The quest shown in the detail pane is open, the first one shown when the tab opens included, so a quest's NEW clears once it has been in front of the player; the tab calls `markQuestSeen` only while the quest `isNew`.
2. **Where Reroll lives.** On the open contract's actions (beside Track), not in the group heading: a reroll acts on one slot. After a reroll the tab opens the slot's new contract (`res.profile.quests.board[slot]`), whose dry run then reads the spent reroll's reason.
3. **Reroll's state is the engine's.** The button is enabled exactly when the engine's dry run (`rerollContract(registry, profile, slot)`) succeeds, and shows its `reason` otherwise; the client never compares scrap or `rerollUsed` itself. The price shown is `delve.quests.contracts.rerollScrap`.
4. **Claim mid-dive at the Anvil.** "Claim at the Anvil" (disabled) is the pause's. The Anvil with a dive under way (back from "Anvil · floor restarts") leaves Claim enabled and shows the engine's refusal ("Claim at the Anvil, between dives") in the status line; the footer's count shows only between dives (the tab's pip always).
5. **Claim's word.** A claim's `ProfileActionResult.rewards` are named with `rewardView` in a status line, "Claimed First Steps: 3 × Iron bar, 40 scrap"; the toast ("Quest complete…") is C2's diff, not this.
6. **The rule texts.** One count reads "A tier III offense shard", more "2 tier III offense shards"; the metal rule "A bar of your deepest metal", the essence "An essence for a pattern you know", the pattern "A pattern you don't know yet", each with the note "Chosen when you claim it" and a swatch (the family's, legendary orange, the pattern chalk). A pattern rule's fallback isn't named (the claim's line names what came).
7. **Done.** Collapsed by default (S5), a `<button aria-expanded>` in the group's heading ("▸ Done · 2"); it opens itself while the open quest is in it (a main quest just claimed stays open, now Claimed). A claimed quest has no Track and no Claim.
8. **Hesta's sprite.** Drawn at 6 px a sprite pixel in the 180 px well, and moved 3 sprite pixels right (`GIVER_NUDGE`): her body spans columns 2–17 of her 26 px canvas (the hammer the right side), so its centre sits 3 px left of the canvas's.
9. **The empty state stays** (no quests at all: before B1, never after it, since the main line always shows), unchanged with its test.

## Conventions

The overview's shared conventions, as Phase A states them. In short:
- **One commit per task** on `quest/c1`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-quest-c1`.
- **Line endings:** the worktree's files are CRLF (`core.autocrlf`); keep each file's own (the Edit tool does); new files are LF. Prettier runs as `npx prettier --end-of-line auto`; every file here passes `prettier --check --end-of-line auto` at the base, and the code below is already formatted.
- **How the edits read:** "Replace: A with: B" is one Edit (old A, new B). "Replace the lines from `A` to the end of the file with: C" is one Edit whose old text runs from the start of the line that reads `A` to the file's last line, and whose new text is C. "Create `f`:" is a Write. Within a file, apply its edits top to bottom; every anchor is unique in its file at that point.
- **No engine change:** the client reads the bundle Phase A built; no task here rebuilds it. Every task runs the whole client suite (about 35 s) and its typecheck (Vitest doesn't type-check).
- **Checked on a scratch copy:** `git archive` of `quest/main` at `7bc2d20` with junctioned `node_modules` and the engine bundle built; this plan's 29 edits applied in order, step by step, by a script that checks each anchor is unique where it applies, giving the trees every FAIL, PASS, suite, typecheck and the client build below ran on; `prettier --check --end-of-line auto` passed on every file a commit block formats; Playwright lists Task 4's two tests (they need B1 and B2 to run).

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(pnpm -F @alloy/client build)` |
| E2E (Task 4) | `(cd packages/client && npx playwright test e2e/delve-quests.spec.ts --project=desktop)` |

---

## Chunk 1: The adapter

### Task 1: Status, NEW and the rule rewards in the quest view

`questView` carries each quest's status and NEW; a rule reward reads as what it will be.

**Files:**
- Modify: `packages/client/src/features/delve/quests/types.ts`, `quests/quest-view.ts`, `quests/__tests__/quest-fixture.ts`, `quests/__tests__/useQuests.test.ts` (all under `packages/client/src/features/delve/`)

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/quests/__tests__/useQuests.test.ts`:

Replace:

```ts
import { getDelveRegistry } from '../../registry';
```

with:

```ts
import { getDelveRegistry } from '../../registry';
import { RARITY_COLOR } from '../../format';
```

Replace:

```ts
        { id: '3', name: 'Chosen when you claim it', color: '#c0cbdc' },
      ],
      tracked: true,
    });
  });
```

with:

```ts
        {
          id: '3',
          name: 'A tier III offense shard',
          sub: 'Chosen when you claim it',
          color: '#e43b44',
        },
      ],
      tracked: true,
      status: 'active',
      isNew: true,
    });
  });
```

Replace:

```ts
    expect(questView(registry, side).sub).toBe('Reach depth 2');
  });
```

with:

```ts
    expect(questView(registry, side).sub).toBe('Reach depth 2');
  });

  it('names each rule reward by what it will be, and carries a complete quest as seen', () => {
    const rules: QuestState = {
      ...FIRST,
      status: 'complete',
      isNew: false,
      rewards: [
        { rule: { kind: 'metal', id: 'depth', count: 3 } },
        { rule: { kind: 'shard', family: 'defense', tier: 2, count: 2 } },
        { rule: { kind: 'essence', id: 'fit', count: 1 } },
        {
          rule: { kind: 'pattern', id: 'unknown', count: 1, fallback: { kind: 'dust', count: 20 } },
        },
      ],
    };
    const view = questView(registry, rules);
    expect(view).toMatchObject({ status: 'complete', isNew: false });
    expect(view.rewards.map((r) => [r.name, r.sub, r.color])).toEqual([
      ['3 bars of your deepest metal', 'Chosen when you claim it', '#c0cbdc'],
      ['2 tier II defense shards', 'Chosen when you claim it', '#0099db'],
      ['An essence for a pattern you know', 'Chosen when you claim it', RARITY_COLOR.legendary],
      ["A pattern you don't know yet", 'Chosen when you claim it', '#c0cbdc'],
    ]);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/quests/__tests__/useQuests.test.ts)`
Expected: FAIL, 2 of 5: `questView > draws an engine quest…` (`AssertionError: expected { id: 'first_steps', …(9) } to deeply equal { id: 'first_steps', …(11) }`: no `status`, no `isNew`, and the shard still "Chosen when you claim it") and `questView > names each rule reward…` (`expected { id: 'first_steps', …(9) } to match object { status: 'complete', isNew: false }`).

- [ ] **Step 3: The view's fields and the rule names**

In `packages/client/src/features/delve/quests/types.ts`:

Replace:

```ts
import type { QuestKind } from '@alloy/engine';

export type { QuestKind };
```

with:

```ts
import type { QuestKind, QuestStatus } from '@alloy/engine';

export type { QuestKind, QuestStatus };
```

Replace:

```ts
  rewards: QuestReward[];
  tracked: boolean;
}
```

with:

```ts
  rewards: QuestReward[];
  tracked: boolean;
  /** Under way, complete (DONE: claim it at the Anvil), or claimed (the journal's Done group). */
  status: QuestStatus;
  /** Unlocked, and not yet opened in the journal. */
  isNew: boolean;
}
```

In `packages/client/src/features/delve/quests/quest-view.ts`:

Replace:

```ts
import type { DataRegistry, QuestState, RewardView } from '@alloy/engine';
import { materialLabel } from '../hub/forge/materials-text';
import { PATTERN_COLOR, SCRAP_COLOR, materialColor } from '../materials/material-style';
import type { QuestReward, QuestView } from './types';
```

with:

```ts
import type { DataRegistry, QuestState, Reward, RewardView, RuneTier } from '@alloy/engine';
import { RARITY_COLOR } from '../format';
import { materialLabel } from '../hub/forge/materials-text';
import {
  AFFIX_FAMILY_COLOR,
  PATTERN_COLOR,
  SCRAP_COLOR,
  materialColor,
} from '../materials/material-style';
import { TIER_NUMERAL } from '../runes/rune-style';
import type { QuestReward, QuestView } from './types';
```

Replace the lines from `/** A rule's swatch until it is claimed. */` to the end of the file with:

```ts
/** A rule's swatch where its kind has no colour of its own. */
const RULE_COLOR = '#c0cbdc';
/** A rule's note: the engine settles it when the quest is claimed. */
const CHOSEN = 'Chosen when you claim it';

/**
 * An engine quest (`questStates`) as the journal and the HUD tracker draw it: Hesta gives every
 * quest, her line is its story, each reward is named (a rule by what it will be), and its status
 * and NEW ride along.
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
    status: quest.status,
    isNew: quest.isNew,
  };
}

/**
 * A reward as the journal names it: "3 × Iron bar", "40 scrap", "Sword pattern", or a rule by
 * what it will be ("A tier III offense shard", chosen when it is claimed). A claim's grants too.
 */
export function rewardView(registry: DataRegistry, reward: RewardView, id: string): QuestReward {
  if ('rule' in reward) return ruleView(reward.rule, id);
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

/**
 * The quests spec's rule rewards, which `resolveReward` settles at the claim: the best depth's
 * metal, a shard of a family and tier, an essence that fits a known pattern, an unknown pattern.
 */
function ruleView(r: Reward, id: string): QuestReward {
  const rule = (one: string, many: string, color: string): QuestReward => ({
    id,
    name: r.count === 1 ? one : `${r.count} ${many}`,
    sub: CHOSEN,
    color,
  });
  if (r.kind === 'metal' && r.id === 'depth')
    return rule('A bar of your deepest metal', 'bars of your deepest metal', RULE_COLOR);
  if (r.kind === 'shard' && r.family && r.tier) {
    const what = `tier ${TIER_NUMERAL[r.tier as RuneTier]} ${r.family}`;
    return rule(`A ${what} shard`, `${what} shards`, AFFIX_FAMILY_COLOR[r.family]);
  }
  if (r.kind === 'essence' && r.id === 'fit')
    return rule(
      'An essence for a pattern you know',
      'essences for patterns you know',
      RARITY_COLOR.legendary,
    );
  if (r.kind === 'pattern' && r.id === 'unknown')
    return rule("A pattern you don't know yet", "patterns you don't know yet", PATTERN_COLOR);
  return { id, name: CHOSEN, color: RULE_COLOR };
}
```

The fixture's quests are active and seen (the journal's tests set their own).

In `packages/client/src/features/delve/quests/__tests__/quest-fixture.ts`:

Replace:

```ts
      { id: 'echo', name: 'Rune · Echo III', sub: 'To your pouch', color: '#feae34' },
    ],
    tracked: true,
```

with:

```ts
      { id: 'echo', name: 'Rune · Echo III', sub: 'To your pouch', color: '#feae34' },
    ],
    tracked: true,
    status: 'active',
    isNew: false,
```

Replace:

```ts
      { id: 'dust', name: '10 Mana Dust', sub: 'For edits and re-attuning', color: '#e8b796' },
    ],
    tracked: true,
```

with:

```ts
      { id: 'dust', name: '10 Mana Dust', sub: 'For edits and re-attuning', color: '#e8b796' },
    ],
    tracked: true,
    status: 'active',
    isNew: false,
```

Replace:

```ts
    rewards: [{ id: 'links', name: '1 Link', sub: 'For slots and sockets', color: '#2ce8f5' }],
    tracked: false,
```

with:

```ts
    rewards: [{ id: 'links', name: '1 Link', sub: 'For slots and sockets', color: '#2ce8f5' }],
    tracked: false,
    status: 'active',
    isNew: false,
```

Replace:

```ts
    rewards: [{ id: 'scrap', name: '200 scrap', sub: 'To your purse', color: '#c0cbdc' }],
    tracked: false,
```

with:

```ts
    rewards: [{ id: 'scrap', name: '200 scrap', sub: 'To your purse', color: '#c0cbdc' }],
    tracked: false,
    status: 'active',
    isNew: false,
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: the Step 2 command.
Expected: PASS, 5 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 1 tests in G files pass (1225 in 152).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/quests/types.ts src/features/delve/quests/quest-view.ts src/features/delve/quests/__tests__/quest-fixture.ts src/features/delve/quests/__tests__/useQuests.test.ts)
git add packages/client/src/features/delve/quests/types.ts packages/client/src/features/delve/quests/quest-view.ts packages/client/src/features/delve/quests/__tests__/quest-fixture.ts packages/client/src/features/delve/quests/__tests__/useQuests.test.ts
git commit -m "feat(client): the quest view carries status and NEW, and names the rule rewards" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The Quests tab

### Task 2: The journal, Claim, Track and the Contract board

The tab, whole: the groups (the board's slots in order, the claimed under a collapsed Done), NEW and DONE, seen on opening, Hesta placed, Claim, Track to the balance's cap, and Reroll from the engine's dry run.

**Files:**
- Modify: `packages/client/src/features/delve/hub/quests/QuestsTab.tsx`, `hub/quests/__tests__/QuestsTab.test.tsx` (under `packages/client/src/features/delve/`)

- [ ] **Step 1: The failing tests**

The store's quest ops and the engine's reroll are stubbed; the fixture's contract sits on the board's first slot.

In `packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx`:

Replace the lines from `import { describe, it, expect, beforeEach, vi } from 'vitest';` to the end of the file with:

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { rerollContract, type Contract, type ProfileActionResult } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { QuestsTab } from '../QuestsTab';
import { SAMPLE_QUESTS } from '../../../quests/__tests__/quest-fixture';
import type { QuestView } from '../../../quests/types';
import type { Prompt } from '@/features/delve/kit';
import type { HubLink, HubMode } from '../../types';

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
// The board's reroll as a dry run (B2 fills the engine's): each test says what it gives.
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  rerollContract: vi.fn(),
}));

const renderTab = (link?: HubLink, mode: HubMode = 'anvil') => {
  const props = { setPrompts: vi.fn(), setFooterAction: vi.fn(), go: vi.fn(), onDelve: vi.fn() };
  render(<QuestsTab mode={mode} link={link} {...props} />);
  return props;
};
/** The prompts the tab last handed the hub. */
const lastPrompts = (setPrompts: ReturnType<typeof vi.fn>): Prompt[] =>
  setPrompts.mock.calls.at(-1)?.[0] ?? [];
const [MAIN, KINDLING, DEEP_ROOTS, RAT_CATCHER] = SAMPLE_QUESTS;
/** The fixture's contract on the board's first slot (only its id matters to the tab). */
const ratCatcher = { id: 'rat-catcher' } as Contract;
const ok = (over: Partial<ProfileActionResult> = {}): ProfileActionResult => ({
  ok: true,
  profile: useDelveStore.getState().profile,
  ...over,
});

describe('QuestsTab', () => {
  const { claimQuest, rerollContract: reroll, markQuestSeen } = useDelveStore.getState();
  beforeEach(() => {
    shown.quests = [];
    const p = useDelveStore.getState().profile;
    useDelveStore.setState({
      profile: { ...p, quests: { ...p.quests, board: [ratCatcher, null, null] } },
      claimQuest: vi.fn(() => ok()),
      rerollContract: vi.fn(() => ok()),
      markQuestSeen: vi.fn(),
    });
    vi.mocked(rerollContract).mockClear().mockReturnValue(ok());
  });
  afterEach(() => useDelveStore.setState({ claimQuest, rerollContract: reroll, markQuestSeen }));

  it('shows the empty state in its three panes while there are no quests', () => {
    const { setPrompts } = renderTab();
    expect(screen.getByTestId('quests-empty')).toHaveTextContent(
      'Quests arrive in a later update. The journal and the HUD tracker are ready for them.',
    );
    expect(screen.getByRole('region', { name: 'Journal' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Rewards' })).toBeInTheDocument();
    expect(screen.queryByTestId('quest-journal')).toBeNull();
    expect(lastPrompts(setPrompts)).toEqual([]);
  });

  it('shows the journal by kind, the first quest open, its objectives and rewards', () => {
    shown.quests = SAMPLE_QUESTS;
    renderTab();
    expect(screen.queryByTestId('quests-empty')).toBeNull();
    const journal = screen.getByTestId('quest-journal');
    const headings = within(journal).getAllByRole('heading');
    expect(headings.map((h) => h.textContent)).toEqual(['Journal', 'Main', 'Side', 'Contracts']);
    expect(screen.getByTestId('quests-tracked')).toHaveTextContent('2 tracked of 3');
    expect(screen.getByTestId('quest-frozen-foreman')).toHaveAttribute('aria-current', 'true');
    const detail = screen.getByTestId('quest-detail');
    expect(detail).toHaveTextContent('Main quest · Chapter 1');
    expect(detail).toHaveTextContent('The Frozen Foreman');
    expect(detail).toHaveTextContent('Descend to depth 8');
    expect(detail).toHaveTextContent('6 / 8');
    expect(detail.querySelector('[data-sprite="foreman_grask"]')).not.toBeNull();
    expect(screen.getByTestId('quest-rewards')).toHaveTextContent('Rune · Echo III');

    fireEvent.click(screen.getByTestId('quest-rat-catcher'));
    expect(screen.getByTestId('quest-detail')).toHaveTextContent('Slay mine rats');
    expect(screen.getByTestId('quest-rewards')).toHaveTextContent('200 scrap');
  });

  it('tracks on the HUD from the button and from G / Y, three at most', () => {
    shown.quests = SAMPLE_QUESTS;
    const { setPrompts } = renderTab({ tab: 'quests', questId: 'deep-roots' });
    const track = () => screen.getByTestId('quest-track');
    const trackPrompt = () => lastPrompts(setPrompts).find((p) => p.id === 'track');
    expect(screen.getByTestId('quest-deep-roots')).toHaveAttribute('aria-current', 'true');
    expect(track()).toHaveAttribute('aria-pressed', 'false');
    expect(lastPrompts(setPrompts).map((p) => [p.label, p.binding])).toEqual([
      ['Select', { mouse: 'click', pad: 'a' }],
      ['Track', { key: 'KeyG', pad: 'y' }],
    ]);

    fireEvent.click(track());
    expect(track()).toHaveAttribute('aria-pressed', 'true');
    expect(track()).toHaveTextContent('Tracked on the HUD');
    expect(screen.getByTestId('quests-tracked')).toHaveTextContent('3 tracked of 3');

    fireEvent.click(screen.getByTestId('quest-rat-catcher'));
    expect(track()).toBeDisabled();
    expect(trackPrompt()?.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('quest-kindling'));
    act(() => trackPrompt()?.onPress?.());
    expect(track()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('quests-tracked')).toHaveTextContent('2 tracked of 3');
  });

  it('badges NEW and DONE, keeps the claimed under a collapsed Done, and marks a quest seen when opened', () => {
    shown.quests = [
      { ...MAIN, status: 'complete', isNew: true, giver: 'hesta' },
      { ...KINDLING, status: 'claimed' },
      { ...DEEP_ROOTS, isNew: true },
      RAT_CATCHER,
    ];
    renderTab();
    const row = (id: string) => within(screen.getByTestId(`quest-${id}`));
    expect(row('frozen-foreman').getByTestId('quest-new')).toHaveTextContent('NEW');
    expect(row('frozen-foreman').getByTestId('quest-done')).toHaveTextContent('DONE');
    expect(row('deep-roots').getByTestId('quest-new')).toBeInTheDocument();
    expect(row('deep-roots').queryByTestId('quest-done')).toBeNull();
    expect(screen.getByTestId('quest-detail')).toHaveTextContent(
      'Main quest · Chapter 1 · Complete',
    );
    // Hesta's body sits left of her canvas's centre: nudged 3 sprite pixels right, at 6 px each.
    expect(screen.getByTestId('quest-giver')).toHaveStyle({ left: '18px' });
    const markSeen = useDelveStore.getState().markQuestSeen;
    expect(markSeen).toHaveBeenCalledWith('frozen-foreman'); // the quest open at first
    fireEvent.click(screen.getByTestId('quest-deep-roots'));
    expect(markSeen).toHaveBeenLastCalledWith('deep-roots');
    expect(markSeen).toHaveBeenCalledTimes(2);

    expect(screen.getByTestId('quest-group-side')).not.toHaveTextContent('Kindling');
    const toggle = screen.getByTestId('quest-done-toggle');
    expect(toggle).toHaveTextContent('Done · 1');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('quest-kindling')).toBeNull();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId('quest-kindling'));
    expect(screen.getByTestId('quest-detail')).toHaveTextContent('Side quest · Claimed');
    expect(screen.queryByTestId('quest-track')).toBeNull(); // a claimed quest isn't tracked
    expect(screen.queryByTestId('quest-claim')).toBeNull();
  });

  it('claims a completed quest from its button and from Enter, naming what it gave', () => {
    shown.quests = [{ ...MAIN, status: 'complete' }, DEEP_ROOTS];
    vi.mocked(useDelveStore.getState().claimQuest).mockReturnValue(
      ok({
        rewards: [
          { ref: { kind: 'scrap' }, count: 40 },
          { ref: { kind: 'flux', grade: 'uncommon' }, count: 1 },
        ],
      }),
    );
    const { setPrompts } = renderTab();
    const claim = screen.getByTestId('quest-claim');
    expect(claim).toHaveTextContent('Claim');
    expect(claim).toBeEnabled();
    fireEvent.click(claim);
    expect(useDelveStore.getState().claimQuest).toHaveBeenCalledWith('frozen-foreman');
    expect(screen.getByTestId('quest-message')).toHaveTextContent(
      'Claimed The Frozen Foreman: 40 scrap, 1 × Uncommon flux',
    );
    const prompt = lastPrompts(setPrompts).find((p) => p.id === 'claim')!;
    expect(prompt.binding).toEqual({ key: ['Enter', 'NumpadEnter'] });
    act(() => prompt.onPress?.());
    expect(useDelveStore.getState().claimQuest).toHaveBeenCalledTimes(2);

    // Opening a quest still under way: no Claim.
    fireEvent.click(screen.getByTestId('quest-deep-roots'));
    expect(screen.queryByTestId('quest-claim')).toBeNull();
    expect(screen.queryByTestId('quest-message')).toBeNull();
    expect(lastPrompts(setPrompts).map((p) => p.id)).toEqual(['select', 'track']);
  });

  it("shows the engine's refusal of a claim", () => {
    shown.quests = [{ ...MAIN, status: 'complete' }];
    vi.mocked(useDelveStore.getState().claimQuest).mockReturnValue(
      ok({ ok: false, reason: 'Claim at the Anvil, between dives' }),
    );
    renderTab();
    fireEvent.click(screen.getByTestId('quest-claim'));
    expect(screen.getByTestId('quest-message')).toHaveTextContent(
      'Claim at the Anvil, between dives',
    );
  });

  it('in the pause, Claim reads "Claim at the Anvil" and is disabled', () => {
    shown.quests = [{ ...MAIN, status: 'complete' }];
    const { setPrompts } = renderTab(undefined, 'pause');
    const claim = screen.getByTestId('quest-claim');
    expect(claim).toHaveTextContent('Claim at the Anvil');
    expect(claim).toBeDisabled();
    expect(lastPrompts(setPrompts).find((p) => p.id === 'claim')?.disabled).toBe(true);
  });

  it('on the pad, A presses the focused Claim: no Enter prompt', () => {
    useInputDeviceStore.setState({ device: 'gamepad' });
    try {
      shown.quests = [{ ...MAIN, status: 'complete' }];
      const { setPrompts } = renderTab();
      expect(lastPrompts(setPrompts).map((p) => p.id)).toEqual(['select', 'track']);
    } finally {
      useInputDeviceStore.setState({ device: 'keyboard' });
    }
  });

  it('the Contract board: its slots in order, empty ones waiting for the next dive', () => {
    shown.quests = [MAIN, RAT_CATCHER];
    renderTab();
    const group = screen.getByTestId('quest-group-contract');
    expect(within(group).getByRole('heading')).toHaveTextContent('Contracts');
    expect(
      within(screen.getByTestId('contract-slot-0')).getByTestId('quest-rat-catcher'),
    ).toBeInTheDocument();
    for (const i of [1, 2])
      expect(screen.getByTestId(`contract-slot-${i}`)).toHaveTextContent(
        'New contract after your next dive',
      );
    // A quest has no Reroll; the engine is asked only for an open contract.
    expect(screen.queryByTestId('quest-reroll')).toBeNull();
    expect(rerollContract).not.toHaveBeenCalled();
  });

  it("rerolls the open contract for the engine's price from the button and from R / X", () => {
    shown.quests = [MAIN, RAT_CATCHER];
    const { setPrompts } = renderTab({ tab: 'quests', questId: 'rat-catcher' });
    expect(rerollContract).toHaveBeenLastCalledWith(
      expect.anything(),
      useDelveStore.getState().profile,
      0,
    );
    const button = screen.getByTestId('quest-reroll');
    expect(button).toHaveTextContent('Reroll');
    expect(button).toHaveTextContent('30 scrap'); // delve.quests.contracts.rerollScrap
    expect(button).toBeEnabled();
    const prompt = () => lastPrompts(setPrompts).find((p) => p.id === 'reroll')!;
    expect(prompt().binding).toEqual({ key: 'KeyR', pad: 'x' });
    fireEvent.click(button);
    expect(useDelveStore.getState().rerollContract).toHaveBeenCalledWith(0);
    act(() => prompt().onPress?.());
    expect(useDelveStore.getState().rerollContract).toHaveBeenCalledTimes(2);
  });

  it("a spent reroll is disabled with the engine's reason", () => {
    vi.mocked(rerollContract).mockReturnValue(
      ok({ ok: false, reason: 'One reroll a visit: the board refills after your next dive' }),
    );
    shown.quests = [RAT_CATCHER];
    const { setPrompts } = renderTab();
    expect(screen.getByTestId('quest-reroll')).toBeDisabled();
    expect(screen.getByTestId('quest-reroll-why')).toHaveTextContent(
      'One reroll a visit: the board refills after your next dive',
    );
    expect(lastPrompts(setPrompts).find((p) => p.id === 'reroll')?.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx)`
Expected: FAIL, 7 of 11 (the empty state, the journal, tracking and the pad's prompts pass on the old tab): `badges NEW and DONE…` (`TestingLibraryElementError: Unable to find an element by: [data-testid="quest-new"]`), the three Claim tests (`…[data-testid="quest-claim"]`), `the Contract board…` (`…[data-testid="quest-group-contract"]`), `rerolls the open contract…` (`AssertionError: expected last "spy" call to have been called with [ Anything, { version: 9, …(23) }, +0 ]`: the old tab never asks the engine) and `a spent reroll…` (`…[data-testid="quest-reroll"]`).

- [ ] **Step 3: The tab**

In `packages/client/src/features/delve/hub/quests/QuestsTab.tsx`:

Replace the lines from `import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';` to the end of the file with:

```tsx
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { rerollContract, type Contract, type ProfileActionResult } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import {
  Bar,
  Button,
  Panel,
  PixelSprite,
  Price,
  type Binding,
  type Prompt,
} from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { useQuests } from '../../quests/useQuests';
import { Box } from '../../quests/QuestTracker';
import { rewardView } from '../../quests/quest-view';
import { QUEST_KIND, objectiveCount, type QuestView } from '../../quests/types';
import type { HubMode, HubTabProps } from '../types';

const COLUMNS = '400px minmax(0,1fr) 440px';
export const TRACK_BINDING: Binding = { key: 'KeyG', pad: 'y' };
/** Claim: Enter, or A on the focused button (the pad's A is never a prompt's). */
const CLAIM_BINDING: Binding = { key: 'Enter', pad: 'a' };
export const REROLL_BINDING: Binding = { key: 'KeyR', pad: 'x' };
const SELECT_PROMPT: Prompt = {
  id: 'select',
  label: 'Select',
  binding: { mouse: 'click', pad: 'a' },
};
const DASHED: CSSProperties = { border: '3px dashed var(--k-steel-2)' };
const ROW: CSSProperties = { background: 'var(--k-well)', border: '3px solid var(--k-steel-1)' };
/** The giver's sprite: 6 px a sprite pixel in its 180 px well. */
const GIVER_SCALE = 6;
/** Sprite pixels a giver's body sits left of its canvas's centre (Hesta's hammer takes the right), put back. */
const GIVER_NUDGE: Record<string, number> = { hesta: 3 };

/**
 * The Quests tab: the journal (Main, Side, the Contract board, and the claimed ones under a
 * collapsed Done), the open quest (Hesta, her line, the objectives) and its rewards with Claim,
 * Track and a contract's Reroll. Opening a quest marks it seen; the engine prices and refuses.
 */
export function QuestsTab({ mode, setPrompts, link }: HubTabProps): ReactElement {
  const registry = getDelveRegistry();
  const { quests, setTracked } = useQuests();
  const profile = useDelveStore((s) => s.profile);
  const markQuestSeen = useDelveStore((s) => s.markQuestSeen);
  const pad = useInputDeviceStore((s) => s.device === 'gamepad');
  const [openId, setOpenId] = useState(link?.tab === 'quests' ? link.questId : undefined);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const quest = quests.find((q) => q.id === openId) ?? quests[0];
  const { maxTracked, contracts } = registry.getDelveBalance().quests;
  const trackedCount = quests.filter((q) => q.tracked).length;
  const canTrack = !!quest && (quest.tracked || trackedCount < maxTracked);
  const board = profile.quests.board;
  const slot = quest ? board.findIndex((c) => c?.id === quest.id) : -1;
  // The open contract's reroll as the engine's dry run: whether it can go, and why not.
  const reroll = useMemo(
    () => (slot >= 0 ? rerollContract(registry, profile, slot) : null),
    [registry, profile, slot],
  );

  const open = (id: string) => {
    setOpenId(id);
    setMessage(null);
  };
  const onClaim = () => {
    if (!quest) return;
    const res = useDelveStore.getState().claimQuest(quest.id);
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
    if (res.ok) vibrate('success');
    const got = (res.rewards ?? []).map((r, i) => rewardView(registry, r, String(i)).name);
    setMessage(
      res.ok
        ? { good: true, text: `Claimed ${quest.name}: ${got.join(', ')}` }
        : { good: false, text: res.reason ?? '' },
    );
  };
  const onReroll = () => {
    if (slot < 0) return;
    const res = useDelveStore.getState().rerollContract(slot);
    playSound(res.ok ? 'combineMerge' : 'combineFail');
    if (res.ok) setOpenId(res.profile.quests.board[slot]?.id);
    setMessage(res.ok ? null : { good: false, text: res.reason ?? '' });
  };
  // The prompts call the latest handlers.
  const act = useRef({ onClaim, onReroll });
  useLayoutEffect(() => {
    act.current = { onClaim, onReroll };
  });

  useEffect(() => {
    if (link?.tab === 'quests' && link.questId) setOpenId(link.questId);
  }, [link]);

  // Opening a quest marks it seen: NEW no more.
  useEffect(() => {
    if (quest?.isNew) markQuestSeen(quest.id);
  }, [quest?.id, quest?.isNew, markQuestSeen]);

  const hasReroll = !!reroll;
  const rerollOk = !!reroll?.ok;
  useEffect(() => {
    if (!quest) {
      setPrompts([]);
      return;
    }
    const prompts: Prompt[] = [SELECT_PROMPT];
    // On the pad, A presses the focused Claim button.
    if (quest.status === 'complete' && !pad)
      prompts.push({
        id: 'claim',
        label: 'Claim',
        binding: { key: ['Enter', 'NumpadEnter'] },
        onPress: () => act.current.onClaim(),
        disabled: mode === 'pause',
      });
    if (quest.status !== 'claimed')
      prompts.push({
        id: 'track',
        label: quest.tracked ? 'Untrack' : 'Track',
        binding: TRACK_BINDING,
        onPress: () => setTracked(quest.id, !quest.tracked),
        disabled: !canTrack,
      });
    if (hasReroll)
      prompts.push({
        id: 'reroll',
        label: 'Reroll',
        binding: REROLL_BINDING,
        onPress: () => act.current.onReroll(),
        disabled: !rerollOk,
      });
    setPrompts(prompts);
  }, [setPrompts, setTracked, quest, canTrack, pad, mode, hasReroll, rerollOk]);
  useEffect(() => () => setPrompts([]), [setPrompts]);

  return (
    <div
      className="box-border grid h-full gap-6 px-8 py-6"
      style={{ gridTemplateColumns: COLUMNS }}
    >
      {quest ? (
        <>
          <Journal
            quests={quests}
            board={board}
            open={quest.id}
            onOpen={open}
            tracked={trackedCount}
            maxTracked={maxTracked}
          />
          <Detail quest={quest} />
          <Rewards
            quest={quest}
            mode={mode}
            maxTracked={maxTracked}
            canTrack={canTrack}
            onToggle={() => setTracked(quest.id, !quest.tracked)}
            onClaim={onClaim}
            reroll={reroll}
            rerollScrap={contracts.rerollScrap}
            onReroll={onReroll}
            message={message}
          />
        </>
      ) : (
        <>
          <Panel title="Journal">
            <div className="flex-1" style={DASHED} />
          </Panel>
          <Panel aria-label="Quest">
            <p
              className="m-0 p-4 text-[16px] text-[var(--k-text-2)]"
              style={DASHED}
              data-testid="quests-empty"
            >
              Quests arrive in a later update. The journal and the HUD tracker are ready for them.
            </p>
          </Panel>
          <Panel title="Rewards">
            <div className="flex-1" style={DASHED} />
          </Panel>
        </>
      )}
    </div>
  );
}

function Journal({
  quests,
  board,
  open,
  onOpen,
  tracked,
  maxTracked,
}: {
  quests: QuestView[];
  board: (Contract | null)[];
  open: string;
  onOpen: (id: string) => void;
  tracked: number;
  maxTracked: number;
}) {
  const [showDone, setShowDone] = useState(false);
  const done = quests.filter((q) => q.status === 'claimed');
  // The open quest's group stays open (a quest just claimed moves into Done).
  const doneOpen = showDone || done.some((q) => q.id === open);
  const row = (q: QuestView) => (
    <QuestRow key={q.id} quest={q} on={q.id === open} onOpen={onOpen} />
  );
  return (
    <Panel
      title="Journal"
      testId="quest-journal"
      aside={
        <span className="k-caption" data-testid="quests-tracked">
          {tracked} tracked of {maxTracked}
        </span>
      }
    >
      {(['main', 'side'] as const).map((kind) => {
        const group = quests.filter((q) => q.kind === kind && q.status !== 'claimed');
        return (
          group.length > 0 && (
            <Group key={kind} title={QUEST_KIND[kind].group} testId={`quest-group-${kind}`}>
              {group.map(row)}
            </Group>
          )
        );
      })}
      {board.length > 0 && (
        <Group title={QUEST_KIND.contract.group} testId="quest-group-contract">
          {board.map((c, i) => {
            const q = c && quests.find((x) => x.id === c.id);
            return q ? (
              <div key={q.id} className="flex flex-col" data-testid={`contract-slot-${i}`}>
                {row(q)}
              </div>
            ) : (
              <p
                key={`empty-${i}`}
                className="k-caption m-0 px-[14px] py-3"
                style={DASHED}
                data-testid={`contract-slot-${i}`}
              >
                New contract after your next dive
              </p>
            );
          })}
        </Group>
      )}
      {done.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="quest-group-done">
          <h3 className="k-label m-0">
            <button
              type="button"
              className="k-label"
              aria-expanded={doneOpen}
              onClick={() => setShowDone(!doneOpen)}
              data-testid="quest-done-toggle"
            >
              {doneOpen ? '▾' : '▸'} Done · {done.length}
            </button>
          </h3>
          {doneOpen && done.map(row)}
        </div>
      )}
    </Panel>
  );
}

function Group({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <h3 className="k-label m-0">{title}</h3>
      {children}
    </div>
  );
}

/** A journal row: its kind's swatch, its name and line, NEW until opened, DONE while it waits to be claimed. */
function QuestRow({
  quest: q,
  on,
  onOpen,
}: {
  quest: QuestView;
  on: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(q.id)}
      aria-current={on}
      data-testid={`quest-${q.id}`}
      className="flex items-center gap-3 px-[14px] py-3 text-left"
      style={{
        background: on ? 'var(--k-wood-0)' : 'var(--k-well)',
        border: `3px solid ${on ? 'var(--k-hot)' : 'var(--k-steel-1)'}`,
      }}
    >
      <span className="k-swatch" style={{ background: QUEST_KIND[q.kind].swatch }} />
      <span className="flex min-w-0 flex-col gap-[2px]">
        <span
          className="k-disp text-[19px]"
          style={q.status === 'claimed' ? { color: 'var(--k-text-3)' } : undefined}
        >
          {q.name}
        </span>
        <span className="k-caption">{q.sub}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {q.isNew && (
          <span className="k-tab-badge" data-testid="quest-new">
            NEW
          </span>
        )}
        {q.status === 'complete' && (
          <span
            className="k-tab-badge"
            style={{ background: 'var(--k-ok)' }}
            data-testid="quest-done"
          >
            DONE
          </span>
        )}
        {q.tracked && <span className="text-[14px] text-[var(--k-ok)]">tracked</span>}
      </span>
    </button>
  );
}

function Detail({ quest }: { quest: QuestView }) {
  const kind = quest.kind === 'contract' ? 'Contract' : `${QUEST_KIND[quest.kind].tag} quest`;
  const status = { active: undefined, complete: 'Complete', claimed: 'Claimed' }[quest.status];
  return (
    <Panel aria-label="Quest" testId="quest-detail">
      <div className="flex items-start gap-[22px]">
        {quest.giver && (
          <span className="k-well flex h-[180px] w-[180px] shrink-0 items-center justify-center">
            <span
              className="relative"
              style={{ left: (GIVER_NUDGE[quest.giver] ?? 0) * GIVER_SCALE }}
              data-testid="quest-giver"
            >
              <PixelSprite id={quest.giver} scale={GIVER_SCALE} context="ui" />
            </span>
          </span>
        )}
        <div className="flex flex-col gap-2">
          <span className="k-label" style={{ color: QUEST_KIND[quest.kind].text }}>
            {[kind, quest.chapter, status].filter(Boolean).join(' · ')}
          </span>
          <h2 className="k-disp m-0 text-[44px] text-[var(--k-hot-hi)]">{quest.name}</h2>
          {quest.story && (
            <p className="m-0 max-w-[640px] text-[16px] leading-[1.55] text-[var(--k-text-2)]">
              {quest.story}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-[10px]">
        <h3 className="k-label m-0">Objectives</h3>
        {quest.objectives.map((o) => (
          <div
            key={o.id}
            className="grid grid-cols-[18px_1fr_120px] items-center gap-[14px] px-[14px] py-3"
            style={ROW}
          >
            <Box done={o.done} size={14} />
            <span className="flex flex-col gap-[2px]">
              <span className={`text-[17px] ${o.done ? 'text-[var(--k-text-3)]' : ''}`}>
                {o.text}
              </span>
              {o.hint && <span className="k-caption">{o.hint}</span>}
            </span>
            <span className="flex flex-col items-end gap-1">
              <b
                className="k-disp text-[20px]"
                style={{ color: o.done ? 'var(--k-ok)' : 'var(--k-hot-hi)' }}
              >
                {o.done ? 'Done' : objectiveCount(o)}
              </b>
              {!o.done && o.progress && (
                <span className="w-[120px]">
                  <Bar kind="progress" value={o.progress.value} max={o.progress.max} height={6} />
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Rewards({
  quest,
  mode,
  maxTracked,
  canTrack,
  onToggle,
  onClaim,
  reroll,
  rerollScrap,
  onReroll,
  message,
}: {
  quest: QuestView;
  mode: HubMode;
  maxTracked: number;
  canTrack: boolean;
  onToggle: () => void;
  onClaim: () => void;
  /** The open contract's reroll, as the engine's dry run; null for a quest. */
  reroll: ProfileActionResult | null;
  rerollScrap: number;
  onReroll: () => void;
  message: { text: string; good: boolean } | null;
}) {
  const pause = mode === 'pause';
  return (
    <Panel title="Rewards" testId="quest-rewards">
      {quest.rewards.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-[14px] px-[14px] py-3"
          style={{ ...ROW, borderColor: r.color }}
        >
          <span
            className="h-10 w-10 shrink-0"
            style={{ background: r.color, boxShadow: 'inset 0 0 0 4px rgba(24,20,37,.45)' }}
          />
          <span className="flex flex-col gap-[2px]">
            <span className="k-disp text-[19px]">{r.name}</span>
            {r.sub && <span className="k-caption">{r.sub}</span>}
          </span>
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-[10px]">
        {quest.status === 'complete' && (
          <Button
            variant="go"
            size="lg"
            binding={CLAIM_BINDING}
            disabled={pause}
            onClick={onClaim}
            testId="quest-claim"
          >
            {pause ? 'Claim at the Anvil' : 'Claim'}
          </Button>
        )}
        {message && (
          <p
            role="status"
            className="m-0 text-[16px]"
            style={{ color: message.good ? 'var(--k-ok)' : 'var(--k-bad-text)' }}
            data-testid="quest-message"
          >
            {message.text}
          </p>
        )}
        {quest.status !== 'claimed' && (
          <>
            <Button
              variant={quest.tracked ? 'primary' : 'secondary'}
              size="lg"
              binding={TRACK_BINDING}
              aria-pressed={quest.tracked}
              disabled={!canTrack}
              title={canTrack ? undefined : `Up to ${maxTracked} quests show on the HUD`}
              onClick={onToggle}
              testId="quest-track"
            >
              {quest.tracked ? 'Tracked on the HUD' : 'Track on the HUD'}
            </Button>
            <span className="k-caption text-center">
              Up to {maxTracked} quests show under the minimap during a dive.
            </span>
          </>
        )}
        {reroll && (
          <>
            <Button
              binding={REROLL_BINDING}
              disabled={!reroll.ok}
              onClick={onReroll}
              testId="quest-reroll"
            >
              Reroll · <Price scrap={rerollScrap} />
            </Button>
            {!reroll.ok && (
              <span className="k-caption text-center" data-testid="quest-reroll-why">
                {reroll.reason}
              </span>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: the Step 2 command.
Expected: PASS, 11 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 9 tests in G files pass (1233 in 152).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/quests/QuestsTab.tsx src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx)
git add packages/client/src/features/delve/hub/quests/QuestsTab.tsx packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx
git commit -m "feat(client): the Quests tab: the journal's groups, NEW and DONE, Claim, Track to the balance's cap, and the Contract board's Reroll" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The hub, and the E2E

### Task 3: The Quests tab's pip and the footer's "n to claim"

**Files:**
- Modify: `packages/client/src/features/delve/hub/AnvilHub.tsx`, `hub/HubFooter.tsx`, `hub/__tests__/AnvilHub.test.tsx`, `hub/__tests__/PauseScreen.test.tsx` (under `packages/client/src/features/delve/`)

- [ ] **Step 1: The failing tests**

The hub's tests stub `useQuests` (the engine's quests come with B1, and would change these tests' Quests tab then).

In `packages/client/src/features/delve/hub/__tests__/AnvilHub.test.tsx`:

Replace:

```tsx
import { useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
import { useDelveStore } from '@/stores/delveStore';
import { SAMPLE_QUESTS } from '../../quests/__tests__/quest-fixture';
import type { QuestView } from '../../quests/types';
```

Replace:

```tsx
  return { ...actual, useNavigate: () => mockNavigate };
});
```

with:

```tsx
  return { ...actual, useNavigate: () => mockNavigate };
});

/** The quests the hub's `useQuests` gives (the engine's own come with B1). */
const shown = vi.hoisted(() => ({ quests: [] as QuestView[] }));
vi.mock('../../quests/useQuests', () => {
  const setTracked = () => {};
  return { useQuests: () => ({ quests: shown.quests, setTracked }) };
});
```

Replace:

```tsx
    mockNavigate.mockReset();
```

with:

```tsx
    mockNavigate.mockReset();
    shown.quests = [];
```

Replace:

```tsx
    expect(pip.querySelector('[aria-label="2 new"]')).not.toBeNull();
  });
```

with:

```tsx
    expect(pip.querySelector('[aria-label="2 new"]')).not.toBeNull();
  });

  it("Quests' tab counts the quests to claim, and the footer's count opens it", () => {
    const [main, side, other] = SAMPLE_QUESTS;
    shown.quests = [{ ...main, status: 'complete' }, { ...side, status: 'complete' }, other];
    renderHub();
    const pip = screen.getByTestId('tab-quests').querySelector('.k-tab-badge')!;
    expect(pip).toHaveTextContent(/^2$/);
    expect(pip.querySelector('[aria-label="2 to claim"]')).not.toBeNull();
    const count = screen.getByTestId('claim-count');
    expect(count).toHaveTextContent('2 to claim');
    fireEvent.click(count);
    expect(selected()).toEqual(['tab-quests']);
    expect(screen.getByTestId('quest-claim')).toBeEnabled();
  });

  it('counts nothing while nothing waits to be claimed', () => {
    renderHub();
    expect(screen.getByTestId('tab-quests').querySelector('.k-tab-badge')).toBeNull();
    expect(screen.queryByTestId('claim-count')).toBeNull();
  });

  it('mid-dive the pip stays, and the footer holds no count: claims wait for the dive to end', () => {
    shown.quests = [{ ...SAMPLE_QUESTS[0], status: 'complete' }];
    useDelveStore.getState().startDive(1);
    renderHub();
    expect(screen.getByTestId('claim-pip')).toHaveTextContent('1');
    expect(screen.queryByTestId('claim-count')).toBeNull();
  });
```

In `packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx`:

Replace:

```tsx
import type { HubLink } from '../types';
```

with:

```tsx
import type { HubLink } from '../types';

// No quests (the engine's own come with B1): the journal link opens the Quests tab's empty state.
vi.mock('../../quests/useQuests', () => {
  const none = { quests: [], setTracked: () => {} };
  return { useQuests: () => none };
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/AnvilHub.test.tsx src/features/delve/hub/__tests__/PauseScreen.test.tsx)`
Expected: FAIL, 2 of 24: `AnvilHub > Quests' tab counts the quests to claim…` (`Error: expect(received).toHaveTextContent()`: the tab has no pip) and `AnvilHub > mid-dive the pip stays…` (`TestingLibraryElementError: Unable to find an element by: [data-testid="claim-pip"]`); the PauseScreen tests pass (their stub keeps the empty state).

- [ ] **Step 3: The pip and the count**

In `packages/client/src/features/delve/hub/AnvilHub.tsx`:

Replace:

```tsx
import { QuestsTab } from './quests/QuestsTab';
```

with:

```tsx
import { QuestsTab } from './quests/QuestsTab';
import { useQuests } from '../quests/useQuests';
```

Replace:

```tsx
 * `mode: 'pause'` the Forge is disabled ("Forge at the Anvil"): LB/RB and the digits skip it.
 */
```

with:

```tsx
 * `mode: 'pause'` the Forge is disabled ("Forge at the Anvil"): LB/RB and the digits skip it.
 * The Quests tab's pip counts the quests waiting to be claimed (`claimable`, for the footer too).
 */
```

Replace:

```tsx
  const unapplied = Object.keys(useDelveStore(selectDraftApply).changes).length;
```

with:

```tsx
  const unapplied = Object.keys(useDelveStore(selectDraftApply).changes).length;
  const claimable = useQuests().quests.filter((q) => q.status === 'complete').length;
```

Replace:

```tsx
              {unapplied}
            </span>
          ) : undefined,
```

with:

```tsx
              {unapplied}
            </span>
          ) : t.id === 'quests' && claimable > 0 ? (
            <span aria-label={`${claimable} to claim`} data-testid="claim-pip">
              {claimable}
            </span>
          ) : undefined,
```

Replace:

```tsx
  return { nav, view, tabPrompts, footerAction, digits };
```

with:

```tsx
  return { nav, view, tabPrompts, footerAction, digits, claimable, go };
```

Replace:

```tsx
            action={hub.footerAction}
          />
```

with:

```tsx
            action={hub.footerAction}
            toClaim={hub.claimable}
            onToClaim={() => hub.go({ tab: 'quests' })}
          />
```

In `packages/client/src/features/delve/hub/HubFooter.tsx`:

Replace:

```tsx
 * compact Delve), that node replaces the whole right-hand group.
 */
```

with:

```tsx
 * compact Delve), that node replaces the whole right-hand group. Between dives, the
 * quests waiting to be claimed sit beside Delve ("2 to claim"), opening Quests.
 */
```

Replace:

```tsx
  onDelve,
  action,
}: {
```

with:

```tsx
  onDelve,
  action,
  toClaim = 0,
  onToClaim,
}: {
```

Replace:

```tsx
  action?: ReactNode;
}) {
```

with:

```tsx
  action?: ReactNode;
  /** Completed quests and contracts waiting to be claimed. */
  toClaim?: number;
  /** Opens the Quests tab. */
  onToClaim?: () => void;
}) {
```

Replace:

```tsx
      <Button
        variant="primary"
        size="lg"
        onClick={onDelve}
```

with:

```tsx
      {toClaim > 0 && !active && (
        <Button size="sm" onClick={onToClaim} testId="claim-count">
          {toClaim} to claim
        </Button>
      )}
      <Button
        variant="primary"
        size="lg"
        onClick={onDelve}
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: the Step 2 command.
Expected: PASS, 24 tests (2 files).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 12 tests in G files pass (1236 in 152).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/AnvilHub.tsx src/features/delve/hub/HubFooter.tsx src/features/delve/hub/__tests__/AnvilHub.test.tsx src/features/delve/hub/__tests__/PauseScreen.test.tsx)
git add packages/client/src/features/delve/hub/AnvilHub.tsx packages/client/src/features/delve/hub/HubFooter.tsx packages/client/src/features/delve/hub/__tests__/AnvilHub.test.tsx packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx
git commit -m "feat(client): the Quests tab's pip and the Anvil footer's quests to claim" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: The E2E (after B1 and B2 merge)

**Wait:** this task runs on `quest/c1` rebased on, or merged with, a `quest/main` that holds B1 and B2 (the engine's quests, the content with "First Steps" → "Bring It Home", and the board). Before then `questStates` shows nothing and the board is empty, and both tests fail at their first quest step.

**Files:**
- Create: `packages/client/e2e/delve-quests.spec.ts`

- [ ] **Step 1: The tests**

Create `packages/client/e2e/delve-quests.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { ARENA_READY, seedProfile } from './fixtures/delve';

// Quests (see the quests spec): the main line's first quest done in a dive and claimed at the
// Anvil, and a contract rerolled once a visit. Needs the engine's quests and board (B1, B2).
test.describe('Delve quests', () => {
  test('Q01: First Steps done in a dive, claimed at the Anvil, and the next main quest opens', async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible({ timeout: ARENA_READY });

    // A door down enters depth 2 (First Steps done the moment it happens), then abandon: progress
    // counts, death or not.
    const door = page.getByTestId('door-choice');
    await expect(door).toBeVisible({ timeout: 60_000 });
    await door.getByTestId('door-list').locator('[data-door]').first().click();
    await expect(door).toBeHidden();
    await expect(page.getByTestId('depth-label')).not.toHaveText('DEPTH 1');
    await page.keyboard.press('Escape');
    await page.getByTestId('dive-pause').getByTestId('pause-abandon').click();
    await expect(page.getByTestId('dive-summary')).toContainText('ABANDONED');
    await page.getByTestId('return-camp').click();
    await expect(page.getByTestId('delve-camp')).toBeVisible();

    // The Anvil: the tab's pip and the footer's count (a contract may be done too); the count
    // opens Quests.
    await expect(page.getByTestId('claim-pip')).toHaveText(/^[1-9][0-9]*$/);
    await page.getByTestId('claim-count').click();
    await expect(page.getByTestId('tab-quests')).toHaveAttribute('aria-selected', 'true');
    const journal = page.getByTestId('quest-journal');
    const first = journal.getByRole('button', { name: /First Steps/ });
    await expect(first.getByTestId('quest-done')).toHaveText('DONE');
    await first.click();
    await page.getByTestId('quest-claim').click();
    await expect(page.getByTestId('quest-message')).toContainText('Claimed First Steps');

    // Claimed: First Steps moves to Done (open, since it is the open quest), and the next main
    // quest arrives NEW.
    await expect(page.getByTestId('quest-group-done')).toContainText('First Steps');
    const next = page
      .getByTestId('quest-group-main')
      .getByRole('button', { name: /Bring It Home/ });
    await expect(next.getByTestId('quest-new')).toBeVisible();
  });

  test('Q02: a contract rerolls once a visit, for its price', async ({ page }) => {
    await seedProfile(page, 4242, false, undefined, { scrap: 500 });
    await page.goto('/delve');
    await page.getByTestId('tab-quests').click();
    // A new save's board is full.
    const slot = page.getByTestId('contract-slot-0').getByRole('button');
    const before = await slot.getAttribute('data-testid');
    await slot.click();
    const reroll = page.getByTestId('quest-reroll');
    await expect(reroll).toBeEnabled();
    await expect(reroll).toContainText(/\d+ scrap/);
    await reroll.click();
    // The slot holds a new contract (open now), the scrap is spent, and the visit's reroll with it.
    await expect(slot).not.toHaveAttribute('data-testid', before!);
    await expect(slot).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('scrap-count')).not.toHaveText('500 scrap');
    await expect(reroll).toBeDisabled();
    await expect(page.getByTestId('quest-reroll-why')).not.toBeEmpty();
  });
});
```

- [ ] **Step 2: Run them**

Rebuild the bundle first (B's engine): `(cd packages/engine && npx tsup)`.
Run: `(cd packages/client && npx playwright test e2e/delve-quests.spec.ts --project=desktop)`
Expected: PASS, 2 tests. Before B1 and B2: FAIL, both at their first quest step (`claim-pip` and `contract-slot-0`'s button not found). A timeout under load that passes on a rerun (`--repeat-each 2`) is flakiness; a consistent failure is a regression: debug it with the page's state, not longer timeouts.

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/alloy-quest-c1
(cd packages/client && npx prettier --write --end-of-line auto e2e/delve-quests.spec.ts)
git add packages/client/e2e/delve-quests.spec.ts
git commit -m "test(client): E2E: First Steps claimed at the Anvil, and a contract rerolled" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

After Task 3 (and again after Task 4, once B1 and B2 are in), from the worktree root:

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
(pnpm -F @alloy/client build)
git status --short
```

Expected: no type errors; the client suite **M + 12 tests in G files** (1236 in 152); the build succeeds; `git status` clean but for untracked plan docs. With B1 and B2 in:
- `(cd packages/client && npx playwright test e2e/delve-quests.spec.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts --project=desktop)` passes (the gamepad's G03 steps through the Quests tab).
- The responsive probes on the filled tab: `(cd packages/client && npx playwright test e2e/responsive/specs/delve-anvil.spec.ts -g quests)`: the 14 px text floor, no overflow, at every PC viewport.
- By eye at 1920×1080 and 1280×720 (`/delve`, Quests): Hesta stands centred in her well, her hammer to the right; the board's three slots; the footer's "1 to claim" after a dive that reached depth 2; on the pad, the D-pad reaches Claim, Track and Reroll, A presses them, Y tracks and X rerolls.
