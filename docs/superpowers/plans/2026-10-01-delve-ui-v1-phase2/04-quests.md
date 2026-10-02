# Delve UI v1 · Phase 2 · 2D: Quests (placeholder) and the quest view — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Anvil's Quests tab as its three panes (journal, quest, rewards with "Tracked on the HUD"), the client's quest view types, a `useQuests()` hook that returns no quests in v1, and the HUD's `QuestTracker` ready for Phase 3. No quest engine: the tab shows its empty state in the same three panes, and the dev-only localStorage flag `alloy:delve:questPreview` = "1" fills the tab and the tracker from a fixture.

**Architecture:** View only. `features/delve/quests/` holds the view a future engine fills (`types.ts`), the fixture (`sample.ts`), the hook (`useQuests.ts`, the one place a quest engine plugs in) and the tracker (`QuestTracker.tsx`). `features/delve/hub/quests/QuestsTab.tsx` exports `QuestsTab(props: HubTabProps)`: its root is the tab's grid (`400px minmax(0,1fr) 440px`), and it hands the hub its prompts (Select, Track) through `setPrompts`. No engine change, no store change.

**Tech Stack:** TypeScript 5.7, React 19, TailwindCSS v4, Vitest 3 (jsdom, Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md`: "Phase 2: The Anvil hub" → the shared contract, "Layout", **2D**; decided item 5 (the preview flag kept); the input map's "Track quest" (G / Y) and "Journal" (J / View); "Departures from the mockups" (Quests). Mockups: the Anvil · Quests board (`Anvil-Quests.dc.html`) and the quest tracker in the Dive HUD board (`Arena-HUD.dc.html`). The overview is `00-overview.md` in this folder.

---

## Base

- **Starts from:** branch `ui/p2` after step 2·0 (the integrator's; `2d6273a` or later), in this area's worktree `C:/Projects/alloy-ui-2d` (`git worktree add ../alloy-ui-2d -b ui/p2-2d ui/p2`, the overview's junctions). Every path below is relative to the worktree root, `/c/Projects/alloy-ui-2d` in Git Bash.
- **What 2D needs from 2·0:** `hub/types.ts` with the spec's hub contract, of which this area imports `HubTabProps` and `HubLink` (`{ tab: 'quests'; questId?: string }` among them). Nothing else of 2·0 is touched or read.
- **Anchors:** none. 2D only creates files (all new at the base; 2·0 creates none of them), so no anchor can drift.
- **Before Task 1:** build the engine once for the junction and measure the client:

```bash
cd /c/Projects/alloy-ui-2d
(cd packages/engine && npx tsup)
(cd packages/client && npx vitest run && npx tsc --noEmit -p .)
```

  Expected: tsup's "Build success" lines; the client suite passes and the typecheck prints nothing. `ui/p2` after 2·0, at `2d6273a`, reads 994 tests in 123 files. Call the measured counts **N tests in F files**. This area ends at **N + 7 tests in F + 3 files**.

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/quests/types.ts` (new) | `QuestKind`, `QuestObjective`, `QuestReward`, `QuestView`, `MAX_TRACKED` (the spec's view types), plus `QUEST_KIND` (each kind's tag, group, swatch and passing text colour) and `objectiveCount` |
| `packages/client/src/features/delve/quests/sample.ts` (new) | `SAMPLE_QUESTS`: the board's fixture (one main, two side, one bounty; two tracked) |
| `packages/client/src/features/delve/quests/useQuests.ts` (new) | `useQuests()`: no quests, or the fixture under the dev flag; `setTracked` (three at most); `QUEST_PREVIEW_KEY` |
| `packages/client/src/features/delve/quests/QuestTracker.tsx` (new) | `QuestTracker({ quests })` for Phase 3's right column (glass, up to three, null when none), `JOURNAL_BINDING`, and the objective `Box` the tab reuses |
| `packages/client/src/features/delve/hub/quests/QuestsTab.tsx` (new) | `QuestsTab(props: HubTabProps)`: the journal, the detail, the rewards and Track, or the empty state; its prompts; `TRACK_BINDING` |
| `packages/client/src/features/delve/quests/__tests__/useQuests.test.ts` (new) | none in v1; the preview; the three-quest cap |
| `packages/client/src/features/delve/quests/__tests__/QuestTracker.test.tsx` (new) | null with none tracked; up to three, with kind, name and objectives |
| `packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx` (new) | the empty state; the preview; tracking from the button and the prompt |

Nothing else changes. `AnvilHub.tsx` (and its test's `quests-empty` assertion) is the integrator's; see "Cross-area needs".

## Cross-area needs

No edit in another area's files. For the integrator (2·I), wiring `AnvilHub`:

1. **Render the tab bare in the screen's main.** `QuestsTab`'s root is the tab's grid: `h-full`, 24 px top and bottom, 32 px sides, a 24 px gap and `grid-template-columns: 400px minmax(0,1fr) 440px` (the spec's Layout). So the hub renders `<QuestsTab mode={mode} setPrompts={setTabPrompts} setFooterAction={setFooterAction} go={go} link={link} />` straight inside `Screen`'s children, with no padded wrapper. If the integrator settles on the hub's `main` holding the padding and gap instead, delete `box-border … gap-6 px-8 py-6` from the root's class in `QuestsTab.tsx` (one line) and keep the columns.
2. **`setPrompts` must be stable** (a `useState` setter or a `useCallback`): the tab calls it from effects keyed on it, so a new function every hub render would loop. It calls `setPrompts([])` on unmount.
3. **The prompts.** The tab's are `Select` (display only, Click / A) and `Track` (G / Y, `onPress` toggles the open quest; `disabled` while three others are tracked; its label reads "Untrack" on a tracked quest); none in the empty state. The hub draws them before its own Menu in the `Footer` and passes the same merged array to its `usePrompts` (with Training's T / View and the digits). No clash: G is Track's only.
4. **Footer:** the tab never calls `setFooterAction`, so Training, the start chips and Delve stay (the spec's departure for Quests).
5. **`link`:** `{ tab: 'quests', questId }` opens that quest (the tab reads `link.questId` at mount and on change); `{ tab: 'quests' }` (the dive's Journal, Phase 3b) opens the first.
6. **`AnvilHub.test.tsx`'s** "Quests arrive in a later update" check on `quests-empty` keeps passing: with no flag the tab draws that text on `quests-empty`.
7. **Phase 3 (3B, `FloorColumn`):** `DelveRun` calls `useQuests()` and passes `quests` down; the column renders `<QuestTracker quests={quests} />` (null in v1). `JOURNAL_BINDING` (J / View) is the tracker's hint until 3a's `journal` controls action exists; 3B may swap it for the player's binding.

## Where the spec left room

- **`QuestView.giver`** is a sprite id in the arena's atlas (`PixelSprite id`). The fixture's giver is `foreman_grask` (the board's sprite), drawn at scale 4 (45 sprite px → 180 px, the board's box).
- **The empty state** keeps the three panes: "Journal" and "Rewards" plates with a dashed box each, and the middle plate's dashed box holding the spec's sentence (`quests-empty`). The tab sets no prompts then (nothing to select or track).
- **Track** is G (the spec's revision; the board drew T) and Y. The button reads "Tracked on the HUD" (hot metal, pressed) on a tracked quest and "Track on the HUD" (plank) otherwise, disabled with a title while three others are tracked. The board's caption stays: "Up to three quests show under the minimap during a dive."
- **Tracking is the hook's own state** (the spec's "tracking is local state"), so the pause's tab and the dive's tracker would not share a toggle in the preview. A `ponytail:` comment marks it; the quest engine that replaces the fixture makes it shared.
- **`mode: 'pause'`** changes nothing on this tab: it has no item actions, and tracking is a view preference, not gear.
- **The dev flag** is read only when `import.meta.env.DEV`, so production builds have no quests whatever localStorage holds.
- **Colours:** each kind has a swatch (main `#feae34`, side `#2ce8f5`, bounty `#b55088`) and a text colour that passes on steel (bounty's is `RARITY_TEXT.epic`'s `#d7a6e8`, decided item 13). A reward's `color` is a swatch and a border only, never text.
- **Objectives:** a done one shows "Done" (the tab) or the check glyph (the tracker) in green and dims its text; an open one shows "value / max" and a progress bar while it has `progress`, else no count (the tracker's "Defeat Foreman Grask" row on the board). The tracker's bar is segmented (the board's dashes).
- **The fixture** follows the board, its bracketed placeholders replaced: the main quest "The Frozen Foreman" (three objectives, a story, a chapter), the side quests "Kindling" (tracked) and "Deep Roots", and the bounty "Rat Catcher". Nothing in it is a rule.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `ui/p2-2d` (three), staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-ui-2d`.
- **Line endings:** every file here is new and written LF; Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** the code below is already formatted (checked on the scratch copy), so each commit block's `--write` changes nothing typed as written.
- **How the edits read:** "Create `f`:" is a Write. This area has no Replace edits.
- **Checked on a scratch copy:** first `ui/p2` at `2b51608` with a stand-in `hub/types.ts` (the spec's contract), where each task's FAIL and PASS below was run; then `ui/p2` at `2d6273a` (2·0 landed, its real `hub/types.ts`) with all eight files, where the client suite went from 994 tests in 123 files to 1001 in 126 (+7, +3), the typecheck was clean and `prettier --check` passed on every new file.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Engine bundle (once) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |

---

## Chunk 1: The quest view, the tracker and the tab

### Task 1: The quest view and `useQuests`

The view a future engine fills, the board's fixture, and the hook that returns no quests in v1.

**Files:**
- Create: `packages/client/src/features/delve/quests/types.ts`
- Create: `packages/client/src/features/delve/quests/sample.ts`
- Create: `packages/client/src/features/delve/quests/useQuests.ts`
- Create: `packages/client/src/features/delve/quests/__tests__/useQuests.test.ts`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/quests/__tests__/useQuests.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QUEST_PREVIEW_KEY, useQuests } from '../useQuests';
import { MAX_TRACKED } from '../types';

describe('useQuests', () => {
  beforeEach(() => localStorage.clear());

  it('has no quests in v1', () => {
    const { result } = renderHook(() => useQuests());
    expect(result.current.quests).toEqual([]);
  });

  it('fills from the fixture under the dev preview flag, and tracks at most three', () => {
    localStorage.setItem(QUEST_PREVIEW_KEY, '1');
    const { result } = renderHook(() => useQuests());
    const tracked = () => result.current.quests.filter((q) => q.tracked).map((q) => q.id);
    expect(result.current.quests.map((q) => q.kind)).toEqual(['main', 'side', 'side', 'bounty']);
    expect(tracked()).toEqual(['frozen-foreman', 'kindling']);
    act(() => result.current.setTracked('deep-roots', true));
    expect(tracked()).toHaveLength(MAX_TRACKED);
    act(() => result.current.setTracked('rat-catcher', true));
    expect(tracked()).toEqual(['frozen-foreman', 'kindling', 'deep-roots']);
    act(() => result.current.setTracked('kindling', false));
    expect(tracked()).toEqual(['frozen-foreman', 'deep-roots']);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/quests/__tests__/useQuests.test.ts)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../useQuests" from "src/features/delve/quests/__tests__/useQuests.test.ts". Does the file exist?`

- [ ] **Step 3: The types, the fixture and the hook**

Create `packages/client/src/features/delve/quests/types.ts`:

```ts
// The quest view a future engine fills (Delve UI v1, decided item 5); nothing here is a rule.

export type QuestKind = 'main' | 'side' | 'bounty';

export interface QuestObjective {
  id: string;
  text: string;
  hint?: string;
  done: boolean;
  progress?: { value: number; max: number };
}

export interface QuestReward {
  id: string;
  name: string;
  sub?: string;
  color: string;
}

export interface QuestView {
  id: string;
  kind: QuestKind;
  name: string;
  sub: string;
  chapter?: string;
  story?: string;
  /** The giver's sprite id in the arena's atlas. */
  giver?: string;
  objectives: QuestObjective[];
  rewards: QuestReward[];
  tracked: boolean;
}

/** The HUD tracker shows at most this many. */
export const MAX_TRACKED = 3;

/** Each kind's tag and journal group: its swatch colour and a text colour that passes on steel. */
export const QUEST_KIND: Record<
  QuestKind,
  { tag: string; group: string; swatch: string; text: string }
> = {
  main: { tag: 'Main', group: 'Main', swatch: '#feae34', text: '#feae34' },
  side: { tag: 'Side', group: 'Side', swatch: '#2ce8f5', text: '#2ce8f5' },
  bounty: { tag: 'Bounty', group: 'Bounties', swatch: '#b55088', text: '#d7a6e8' },
};

/** An objective's count: "6 / 8" while it has progress, else nothing. */
export function objectiveCount(o: QuestObjective): string {
  return o.progress ? `${o.progress.value} / ${o.progress.max}` : '';
}
```

Create `packages/client/src/features/delve/quests/sample.ts`:

```ts
import type { QuestView } from './types';

/** The dev preview's quests (localStorage `alloy:delve:questPreview` = "1"): the Quests board's fixture. */
export const SAMPLE_QUESTS: QuestView[] = [
  {
    id: 'frozen-foreman',
    kind: 'main',
    name: 'The Frozen Foreman',
    sub: 'Chapter 1 · Frostvault',
    chapter: 'Chapter 1',
    story:
      'The Frostvault iced over in a single night, with Foreman Grask still inside. The miners want their foreman back, or at least the keys he carried.',
    giver: 'foreman_grask',
    objectives: [
      { id: 'reach', text: 'Reach the Frostvault', hint: 'Depth 6 or deeper', done: true },
      {
        id: 'descend',
        text: 'Descend to depth 8',
        hint: 'In one dive',
        done: false,
        progress: { value: 6, max: 8 },
      },
      {
        id: 'grask',
        text: 'Defeat Foreman Grask',
        hint: 'Waits at depth 8',
        done: false,
        progress: { value: 0, max: 1 },
      },
    ],
    rewards: [
      { id: 'links', name: '3 Links', sub: 'For slots and sockets', color: '#2ce8f5' },
      { id: 'echo', name: 'Rune · Echo III', sub: 'To your pouch', color: '#feae34' },
    ],
    tracked: true,
  },
  {
    id: 'kindling',
    kind: 'side',
    name: 'Kindling',
    sub: 'Set off Melt 20 times',
    objectives: [
      { id: 'melt', text: 'Set off Melt', done: false, progress: { value: 12, max: 20 } },
    ],
    rewards: [
      { id: 'dust', name: '10 Mana Dust', sub: 'For edits and re-attuning', color: '#e8b796' },
    ],
    tracked: true,
  },
  {
    id: 'deep-roots',
    kind: 'side',
    name: 'Deep Roots',
    sub: 'Set off Seedling 5 times',
    objectives: [
      { id: 'seed', text: 'Set off Seedling', done: false, progress: { value: 1, max: 5 } },
    ],
    rewards: [{ id: 'links', name: '1 Link', sub: 'For slots and sockets', color: '#2ce8f5' }],
    tracked: false,
  },
  {
    id: 'rat-catcher',
    kind: 'bounty',
    name: 'Rat Catcher',
    sub: 'Refreshes each day',
    objectives: [
      { id: 'rats', text: 'Slay mine rats', done: false, progress: { value: 4, max: 30 } },
    ],
    rewards: [{ id: 'scrap', name: '200 scrap', sub: 'To your purse', color: '#c0cbdc' }],
    tracked: false,
  },
];
```

Create `packages/client/src/features/delve/quests/useQuests.ts`:

```ts
import { useCallback, useState } from 'react';
import { SAMPLE_QUESTS } from './sample';
import { MAX_TRACKED, type QuestView } from './types';

/** Dev builds only: "1" fills the journal and the tracker from the fixture. */
export const QUEST_PREVIEW_KEY = 'alloy:delve:questPreview';

function preview(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(QUEST_PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The player's quests. v1 has none; with the dev preview flag, the fixture in sample.ts. A
 * future quest engine plugs in here alone. `setTracked` refuses a fourth tracked quest.
 */
export function useQuests(): {
  quests: QuestView[];
  setTracked: (id: string, on: boolean) => void;
} {
  // ponytail: tracking is this hook's own state (the spec's "local state"); the quest engine makes it shared.
  const [quests, setQuests] = useState<QuestView[]>(() => (preview() ? SAMPLE_QUESTS : []));
  const setTracked = useCallback((id: string, on: boolean) => {
    setQuests((qs) => {
      if (on && qs.filter((q) => q.tracked && q.id !== id).length >= MAX_TRACKED) return qs;
      return qs.map((q) => (q.id === id ? { ...q, tracked: on } : q));
    });
  }, []);
  return { quests, setTracked };
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/quests/__tests__/useQuests.test.ts)`
Expected: PASS (2 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 2 tests pass in F + 1 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2d
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/quests)
git add packages/client/src/features/delve/quests/types.ts packages/client/src/features/delve/quests/sample.ts packages/client/src/features/delve/quests/useQuests.ts packages/client/src/features/delve/quests/__tests__/useQuests.test.ts
git commit -m "feat(client): the quest view, useQuests (none in v1) and the dev preview fixture" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: `QuestTracker`

The HUD's tracker for Phase 3's right column: the Dive HUD board's glass "Quests" box.

**Files:**
- Create: `packages/client/src/features/delve/quests/QuestTracker.tsx`
- Create: `packages/client/src/features/delve/quests/__tests__/QuestTracker.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/quests/__tests__/QuestTracker.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QuestTracker } from '../QuestTracker';
import { SAMPLE_QUESTS } from '../sample';
import type { QuestView } from '../types';

const tracked = (q: QuestView, id = q.id): QuestView => ({ ...q, id, tracked: true });

describe('QuestTracker', () => {
  it('renders nothing while no quest is tracked', () => {
    const { container } = render(
      <QuestTracker quests={SAMPLE_QUESTS.map((q) => ({ ...q, tracked: false }))} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(render(<QuestTracker quests={[]} />).container).toBeEmptyDOMElement();
  });

  it('shows up to three tracked quests with their kind, name and objectives', () => {
    const [main, side, , bounty] = SAMPLE_QUESTS;
    render(
      <QuestTracker
        quests={[tracked(main), tracked(side), tracked(bounty), tracked(side, 'fourth')]}
      />,
    );
    const tracker = screen.getByTestId('quest-tracker');
    expect(within(tracker).getByText('Quests')).toBeInTheDocument();
    expect(within(tracker).getByText('Journal')).toBeInTheDocument();
    expect(screen.queryByTestId('tracked-fourth')).toBeNull();
    const first = screen.getByTestId('tracked-frozen-foreman');
    expect(first).toHaveTextContent('Main');
    expect(first).toHaveTextContent('The Frozen Foreman');
    expect(first).toHaveTextContent('Descend to depth 8');
    expect(first).toHaveTextContent('6 / 8');
    expect(within(first).getByRole('img', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByTestId('tracked-rat-catcher')).toHaveTextContent('Bounty');
    expect(screen.getByTestId('tracked-kindling')).toHaveTextContent('12 / 20');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/quests/__tests__/QuestTracker.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../QuestTracker" from "src/features/delve/quests/__tests__/QuestTracker.test.tsx". Does the file exist?`

- [ ] **Step 3: The tracker**

Create `packages/client/src/features/delve/quests/QuestTracker.tsx`:

```tsx
import type { ReactElement } from 'react';
import { Bar, Glyph, InputGlyph, Panel, type Binding } from '@/features/delve/kit';
import { MAX_TRACKED, QUEST_KIND, objectiveCount, type QuestView } from './types';

/** The dive's Journal hint (the controls' `journal` action arrives in Phase 3a). */
export const JOURNAL_BINDING: Binding = { key: 'KeyJ', pad: 'view' };

/** The HUD's quest tracker (Phase 3's right column): up to three tracked quests; nothing while none is. */
export function QuestTracker({ quests }: { quests: QuestView[] }): ReactElement | null {
  const shown = quests.filter((q) => q.tracked).slice(0, MAX_TRACKED);
  if (shown.length === 0) return null;
  return (
    <Panel
      as="div"
      material="glass"
      scroll={false}
      testId="quest-tracker"
      title={<span style={{ color: 'var(--k-hot-hi)' }}>Quests</span>}
      aside={
        <span className="flex items-center gap-2 text-[14px] text-[var(--k-text-3)]">
          <InputGlyph binding={JOURNAL_BINDING} size="sm" />
          Journal
        </span>
      }
    >
      {shown.map((q) => (
        <div key={q.id} className="flex flex-col gap-[6px]" data-testid={`tracked-${q.id}`}>
          <div className="flex items-baseline gap-2">
            <span className="k-label" style={{ color: QUEST_KIND[q.kind].text }}>
              {QUEST_KIND[q.kind].tag}
            </span>
            <span className="k-disp text-[19px]">{q.name}</span>
          </div>
          {q.objectives.map((o) => (
            <div key={o.id} className="flex flex-col gap-1">
              <div className="grid grid-cols-[12px_1fr_auto] items-center gap-2 text-[14px]">
                <Box done={o.done} size={10} />
                <span className={o.done ? 'text-[var(--k-text-3)]' : ''}>{o.text}</span>
                {o.done ? (
                  <Glyph id="check" size={14} color="#63c74d" title="Done" />
                ) : (
                  <b className="k-disp text-[16px] text-[var(--k-hot-hi)]">{objectiveCount(o)}</b>
                )}
              </div>
              {!o.done && o.progress && (
                <div className="ml-5">
                  <Bar
                    kind="progress"
                    value={o.progress.value}
                    max={o.progress.max}
                    height={6}
                    segmented
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </Panel>
  );
}

/** An objective's check box: filled green once done. */
export function Box({ done, size }: { done: boolean; size: number }): ReactElement {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        boxSizing: 'content-box',
        border: `${size > 10 ? 3 : 2}px solid ${done ? 'var(--k-ok)' : 'var(--k-text-2)'}`,
        background: done ? 'var(--k-ok)' : 'transparent',
      }}
    />
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/quests/__tests__/QuestTracker.test.tsx)`
Expected: PASS (2 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 4 tests pass in F + 2 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2d
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/quests/QuestTracker.tsx src/features/delve/quests/__tests__/QuestTracker.test.tsx)
git add packages/client/src/features/delve/quests/QuestTracker.tsx packages/client/src/features/delve/quests/__tests__/QuestTracker.test.tsx
git commit -m "feat(client): the HUD quest tracker: up to three tracked quests, nothing while none is" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: `QuestsTab`

The Anvil · Quests board: the journal grouped Main / Side / Bounties (`quest-journal`), the open quest with its giver, story and objectives (`quest-detail`), and its rewards with "Tracked on the HUD" (`quest-rewards`, `quest-track`); with no quests, the empty state (`quests-empty`) in the same three panes.

**Files:**
- Create: `packages/client/src/features/delve/hub/quests/QuestsTab.tsx`
- Create: `packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { QuestsTab } from '../QuestsTab';
import { QUEST_PREVIEW_KEY } from '../../../quests/useQuests';
import type { Prompt } from '@/features/delve/kit';
import type { HubLink } from '../../types';

const renderTab = (link?: HubLink) => {
  const props = { setPrompts: vi.fn(), setFooterAction: vi.fn(), go: vi.fn() };
  render(<QuestsTab mode="anvil" link={link} {...props} />);
  return props;
};
/** The prompts the tab last handed the hub. */
const lastPrompts = (setPrompts: ReturnType<typeof vi.fn>): Prompt[] =>
  setPrompts.mock.calls.at(-1)?.[0] ?? [];

describe('QuestsTab', () => {
  beforeEach(() => localStorage.clear());

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

  it('previews the fixture: the journal by kind, the first quest open, its objectives and rewards', () => {
    localStorage.setItem(QUEST_PREVIEW_KEY, '1');
    renderTab();
    expect(screen.queryByTestId('quests-empty')).toBeNull();
    const journal = screen.getByTestId('quest-journal');
    const headings = within(journal).getAllByRole('heading');
    expect(headings.map((h) => h.textContent)).toEqual(['Journal', 'Main', 'Side', 'Bounties']);
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
    localStorage.setItem(QUEST_PREVIEW_KEY, '1');
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
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../QuestsTab" from "src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx". Does the file exist?`

- [ ] **Step 3: The tab**

Create `packages/client/src/features/delve/hub/quests/QuestsTab.tsx`:

```tsx
import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { Bar, Button, Panel, PixelSprite, type Binding } from '@/features/delve/kit';
import { useQuests } from '../../quests/useQuests';
import { Box } from '../../quests/QuestTracker';
import {
  MAX_TRACKED,
  QUEST_KIND,
  objectiveCount,
  type QuestKind,
  type QuestView,
} from '../../quests/types';
import type { HubTabProps } from '../types';

const COLUMNS = '400px minmax(0,1fr) 440px';
const KINDS: QuestKind[] = ['main', 'side', 'bounty'];
export const TRACK_BINDING: Binding = { key: 'KeyG', pad: 'y' };
const DASHED: CSSProperties = { border: '3px dashed var(--k-steel-2)' };
const ROW: CSSProperties = { background: 'var(--k-well)', border: '3px solid var(--k-steel-1)' };

/**
 * The Quests tab: the journal by kind, the open quest (giver, story, objectives) and its rewards
 * with "Tracked on the HUD". v1 has no quests, so it shows the empty state in the same three
 * panes; the dev preview flag fills it from the fixture.
 */
export function QuestsTab({ setPrompts, link }: HubTabProps): ReactElement {
  const { quests, setTracked } = useQuests();
  const [openId, setOpenId] = useState(link?.tab === 'quests' ? link.questId : undefined);
  const quest = quests.find((q) => q.id === openId) ?? quests[0];
  const trackedCount = quests.filter((q) => q.tracked).length;
  const canTrack = !!quest && (quest.tracked || trackedCount < MAX_TRACKED);

  useEffect(() => {
    if (link?.tab === 'quests' && link.questId) setOpenId(link.questId);
  }, [link]);

  useEffect(() => {
    setPrompts(
      quest
        ? [
            { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
            {
              id: 'track',
              label: quest.tracked ? 'Untrack' : 'Track',
              binding: TRACK_BINDING,
              onPress: () => setTracked(quest.id, !quest.tracked),
              disabled: !canTrack,
            },
          ]
        : [],
    );
  }, [setPrompts, setTracked, quest, canTrack]);
  useEffect(() => () => setPrompts([]), [setPrompts]);

  return (
    <div
      className="box-border grid h-full gap-6 px-8 py-6"
      style={{ gridTemplateColumns: COLUMNS }}
    >
      {quest ? (
        <>
          <Journal quests={quests} open={quest.id} onOpen={setOpenId} tracked={trackedCount} />
          <Detail quest={quest} />
          <Rewards
            quest={quest}
            canTrack={canTrack}
            onToggle={() => setTracked(quest.id, !quest.tracked)}
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
  open,
  onOpen,
  tracked,
}: {
  quests: QuestView[];
  open: string;
  onOpen: (id: string) => void;
  tracked: number;
}) {
  return (
    <Panel
      title="Journal"
      testId="quest-journal"
      aside={
        <span className="k-caption" data-testid="quests-tracked">
          {tracked} tracked of {MAX_TRACKED}
        </span>
      }
    >
      {KINDS.map((kind) => {
        const group = quests.filter((q) => q.kind === kind);
        if (group.length === 0) return null;
        return (
          <div key={kind} className="flex flex-col gap-2">
            <h3 className="k-label m-0">{QUEST_KIND[kind].group}</h3>
            {group.map((q) => {
              const on = q.id === open;
              return (
                <button
                  key={q.id}
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
                  <span className="k-swatch" style={{ background: QUEST_KIND[kind].swatch }} />
                  <span className="flex min-w-0 flex-col gap-[2px]">
                    <span className="k-disp text-[19px]">{q.name}</span>
                    <span className="k-caption">{q.sub}</span>
                  </span>
                  {q.tracked && (
                    <span className="ml-auto text-[14px] text-[var(--k-ok)]">tracked</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </Panel>
  );
}

function Detail({ quest }: { quest: QuestView }) {
  const kind = quest.kind === 'bounty' ? 'Bounty' : `${QUEST_KIND[quest.kind].tag} quest`;
  return (
    <Panel aria-label="Quest" testId="quest-detail">
      <div className="flex items-start gap-[22px]">
        {quest.giver && (
          <span className="k-well flex h-[180px] w-[180px] shrink-0 items-center justify-center">
            <PixelSprite id={quest.giver} scale={4} context="ui" />
          </span>
        )}
        <div className="flex flex-col gap-2">
          <span className="k-label" style={{ color: QUEST_KIND[quest.kind].text }}>
            {[kind, quest.chapter].filter(Boolean).join(' · ')}
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
  canTrack,
  onToggle,
}: {
  quest: QuestView;
  canTrack: boolean;
  onToggle: () => void;
}) {
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
        <Button
          variant={quest.tracked ? 'primary' : 'secondary'}
          size="lg"
          binding={TRACK_BINDING}
          aria-pressed={quest.tracked}
          disabled={!canTrack}
          title={canTrack ? undefined : `Up to ${MAX_TRACKED} quests show on the HUD`}
          onClick={onToggle}
          testId="quest-track"
        >
          {quest.tracked ? 'Tracked on the HUD' : 'Track on the HUD'}
        </Button>
        <span className="k-caption text-center">
          Up to three quests show under the minimap during a dive.
        </span>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx)`
Expected: PASS (3 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 7 tests pass in F + 3 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2d
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/quests)
git add packages/client/src/features/delve/hub/quests/QuestsTab.tsx packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx
git commit -m "feat(client): the Quests tab: journal, quest and rewards panes, Track on G / Y, the empty state" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification (the area's end check)

- Client: `npx tsc --noEmit -p .` clean and `npx vitest run` at **N + 7 tests in F + 3 files**.
- Engine: untouched (`git diff ui/p2 -- packages/engine` is empty).
- `git diff --stat ui/p2` lists only the eight new files above.
- **E2E ids:** this tab keeps `quests-empty` (with the spec's sentence) and adds `quest-journal`, `quest-<id>`, `quests-tracked`, `quest-detail`, `quest-rewards`, `quest-track`; the tracker adds `quest-tracker` and `tracked-<id>`. No E2E spec reads them yet: `tab-quests` (G03's tab walk) is the hub's and unchanged. An E2E of the preview would set `alloy:delve:questPreview` = "1" before load (the dev server is a dev build).
- A manual look after 2·I wires the tab (dev server, `localStorage['alloy:delve:questPreview'] = '1'`, the Quests tab at 1920×1080): the three panes at 400 / flexible / 440 px, the giver sprite in its 180 px well, G toggles Track and the footer's Track prompt follows; without the flag, the three dashed panes and the sentence.
