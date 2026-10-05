# The Depart sheet, Menu and View Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** at the Anvil, Menu and Esc open the system menu, B does nothing at the root, and Delve is a sheet (View, Enter or a click) that holds the start depth, Training, the claim count and whatever blocks a dive.

**Architecture:** a new `DepartSheet` (a kit `Dialog`, its own pad scope) takes everything the footer's right-hand group held; `HubFooter` shrinks to one button that opens it; `AnvilHub` owns the sheet's open state and the real "start the dive". Every tab's `onDelve` now means "open the sheet". The guided start finds Training through the footer's Delve (`WAY_TO`).

**Tech Stack:** React 19, Zustand, Vitest (jsdom), Playwright.

Read `00-overview.md` first (branch, commands, conventions, the test-id table). Spec: sections 2.1, 2.2, 2.6.

---

### Task 1: `DepartSheet`

**Files:**
- Create: `packages/client/src/features/delve/hub/DepartSheet.tsx`
- Test: `packages/client/src/features/delve/hub/__tests__/DepartSheet.test.tsx`

Read first: `hub/HubFooter.tsx` (the blocks move from here verbatim), `hub/SystemMenu.tsx` (a kit `Dialog` in use), `hub/__tests__/HubFooter.test.tsx` (the lesson mock and the draft set-up to reuse), `quests/types.ts` (`QuestView`).

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/client/src/features/delve/hub/__tests__/DepartSheet.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { heroChains } from '@alloy/engine';
import { DepartSheet } from '../DepartSheet';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '@/features/delve/registry';
import { armed } from '@/features/delve/__tests__/armed';
import { SAMPLE_QUESTS } from '../../quests/__tests__/quest-fixture';
import type { QuestView } from '../../quests/types';

// A lesson's hold and the start depths, as the engine gives them (mocked: each test says).
const engine = vi.hoisted(() => ({ why: null as string | null, starts: [1] as number[] }));
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  tutorialBlocksDive: () => engine.why,
  startDepthOptions: () => engine.starts,
}));
const shown = vi.hoisted(() => ({ quests: [] as QuestView[] }));
vi.mock('../../quests/useQuests', () => ({
  useQuests: () => ({ quests: shown.quests, setTracked: () => {} }),
}));

const WHY = "Finish Hesta's lesson or skip it";
const sheet = (over: Partial<Parameters<typeof DepartSheet>[0]> = {}) => {
  const props = {
    start: 1,
    onStart: vi.fn(),
    onDelve: vi.fn(),
    onTraining: vi.fn(),
    onQuests: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<DepartSheet {...props} />);
  return props;
};
/** An unapplied change to the Primary, as the chain builder leaves one. */
const draft = () => {
  const s = useDelveStore.getState();
  s.setProfile(armed(s.profile));
  const { profile } = useDelveStore.getState();
  const primary = heroChains(getDelveRegistry(), profile.equipped, profile.pair).primary!;
  act(() => s.editDraft('primary', { ...primary, moves: [{ ...primary.moves[0], form: 'lance' }] }));
};

describe('DepartSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234, 'fire');
    engine.why = null;
    engine.starts = [1];
    shown.quests = [];
  });

  it('is a dialog whose Delve is the first focus and starts the dive', () => {
    const { onDelve } = sheet();
    expect(screen.getByTestId('depart-sheet')).toBeInTheDocument();
    const delve = screen.getByTestId('delve-button');
    expect(delve).toHaveTextContent('Delve ▸ depth 1');
    expect(delve).toHaveAttribute('data-pad-first');
    expect(delve).toHaveAttribute('data-tutorial', 'hub.delve');
    expect(document.activeElement).toBe(delve);
    fireEvent.click(delve);
    expect(onDelve).toHaveBeenCalledTimes(1);
  });

  it('offers the start depths only when there is more than one, and reports the pick', () => {
    sheet();
    expect(screen.queryByTestId('start-depths')).toBeNull();
    document.body.replaceChildren();
    engine.starts = [1, 6];
    const { onStart } = sheet({ start: 6 });
    const chips = screen.getByTestId('start-depths').querySelectorAll('button');
    expect([...chips].map((c) => c.textContent)).toEqual(['1', '6']);
    expect(chips[1]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chips[0]);
    expect(onStart).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('delve-button')).toHaveTextContent('Delve ▸ depth 6');
  });

  it("lists each tracked quest with its first objective still to do", () => {
    const [main] = SAMPLE_QUESTS;
    shown.quests = [main];
    sheet();
    const tracked = screen.getByTestId('depart-tracked');
    expect(tracked).toHaveTextContent(main.name);
    expect(tracked).toHaveTextContent(main.objectives.find((o) => !o.done)!.text);
  });

  it('counts the quests to claim as a button that opens Quests', () => {
    const [main, side] = SAMPLE_QUESTS;
    shown.quests = [{ ...main, status: 'complete' }, { ...side, status: 'complete' }];
    const { onQuests } = sheet();
    const count = screen.getByTestId('claim-count');
    expect(count).toHaveTextContent('2 to claim');
    fireEvent.click(count);
    expect(onQuests).toHaveBeenCalledTimes(1);
  });

  it('Training goes to the Training Grounds and carries the guided start target', () => {
    const { onTraining } = sheet();
    const training = screen.getByTestId('training-button');
    expect(training).toHaveAttribute('data-tutorial', 'hub.training');
    fireEvent.click(training);
    expect(onTraining).toHaveBeenCalledTimes(1);
  });

  it('a lesson holds Delve, saying why', () => {
    engine.why = WHY;
    sheet();
    const delve = screen.getByTestId('delve-button');
    expect(delve).toBeDisabled();
    expect(screen.getByTestId('lesson-block')).toHaveTextContent(WHY);
    expect(delve).toHaveAccessibleDescription(WHY);
    // Nothing to apply: the first focus is the dialog's Back.
    expect(delve).not.toHaveAttribute('data-pad-first');
    expect(document.activeElement).toHaveAttribute('data-pad-back');
  });

  it('an unapplied draft holds Delve: Apply (the first focus), or Discard changes & delve', () => {
    draft();
    const { onDelve } = sheet();
    expect(screen.getByTestId('delve-button')).toBeDisabled();
    expect(document.activeElement).toBe(screen.getByTestId('draft-apply'));
    expect(screen.getByTestId('draft-warning')).toBeInTheDocument();
    expect(screen.getByTestId('draft-apply')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('draft-discard-delve'));
    expect(Object.keys(useDelveStore.getState().chainDraft?.chains ?? {})).toHaveLength(0);
    expect(onDelve).toHaveBeenCalledTimes(1);
  });

  it('under a lesson a draft offers no discard (it would only drop the lesson\'s draft)', () => {
    draft();
    engine.why = WHY;
    sheet();
    expect(screen.getByTestId('draft-apply')).toBeInTheDocument();
    expect(screen.queryByTestId('draft-discard-delve')).toBeNull();
  });

  it("a dive in progress reads Resume, and nothing holds it or sits beside it", () => {
    useDelveStore.getState().startDive(1);
    engine.why = WHY;
    engine.starts = [1, 6];
    const [main] = SAMPLE_QUESTS;
    shown.quests = [{ ...main, status: 'complete' }];
    sheet();
    const delve = screen.getByTestId('delve-button');
    expect(delve).toBeEnabled();
    expect(delve).toHaveTextContent('Resume dive · depth 1');
    expect(screen.queryByTestId('start-depths')).toBeNull();
    expect(screen.queryByTestId('claim-count')).toBeNull();
    expect(screen.queryByTestId('lesson-block')).toBeNull();
  });
});
```

  Before relying on `chainDraft?.chains` in the discard test, read `stores/delveStore.ts` for the draft's real shape and how `HubFooter.test.tsx` or `ApplyBar.test.tsx` assert a reverted draft; assert it the way they do.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/DepartSheet.test.tsx)`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement**

```tsx
// packages/client/src/features/delve/hub/DepartSheet.tsx
import { useId, useRef } from 'react';
import { isDiveActive, startDepthOptions, tutorialBlocksDive } from '@alloy/engine';
import { applyLabel, selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Button, Chip, Dialog, Glyph, usePrompts, type Binding } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';
import { useQuests } from '../quests/useQuests';

/** Training's key. The hub binds it too; in the sheet, the sheet does (a dialog is its own scope). */
export const TRAINING_BINDING: Binding = { key: 'KeyT' };

/**
 * The Depart sheet (the pad-first spec, 2.1): what the footer's Delve opens, on a click, on View
 * and on Enter. Top to bottom: the start depths (between dives, when there is a choice), the
 * tracked quests, the quests waiting to be claimed (opens Quests), whatever holds a new dive (an
 * unapplied chain draft: apply, or discard and delve; a guided start's lesson, with
 * `tutorialBlocksDive`'s reason), then Delve (the first focus) and Training. A dive in progress
 * reads Resume and nothing holds it.
 */
export function DepartSheet({
  start,
  onStart,
  onDelve,
  onTraining,
  onQuests,
  onClose,
}: {
  /** The chosen start depth (the hub keeps it, for its footer's label too). */
  start: number;
  onStart: (depth: number) => void;
  /** Start (or resume) the dive. */
  onDelve: () => void;
  onTraining: () => void;
  /** Open the Quests tab (the hub closes the sheet). */
  onQuests: () => void;
  onClose: () => void;
}) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const id = useId();
  const body = useRef<HTMLDivElement>(null);
  const starts = startDepthOptions(registry, profile);
  const active = isDiveActive(profile);
  const { quests } = useQuests();
  const tracked = quests.filter((q) => q.tracked && q.status !== 'claimed');
  const toClaim = quests.filter((q) => q.status === 'complete').length;
  // The chain builder's unapplied changes: a new dive waits until they're applied or discarded.
  // The builder's Apply, here too: its total, and the engine's op as a dry run (why it can't go).
  const view = useDelveStore(selectDraftApply);
  const blocked = Object.keys(view.changes).length > 0 && !active;
  const applying = blocked ? view.dry : null;
  const applyWhy = applying && !applying.ok ? applying.reason : null;
  // A guided start's Anvil lesson holds a new dive until it ends or is skipped (never a Resume).
  const lesson = active ? null : tutorialBlocksDive(registry, profile);

  usePrompts([{ id: 'training', label: 'Training', binding: TRAINING_BINDING, onPress: onTraining }], body);

  const onApply = () => {
    const res = useDelveStore.getState().applyDraft();
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
  };
  const onDiscardAndDelve = () => {
    useDelveStore.getState().revertDraft();
    onDelve();
  };
  const held = blocked || !!lesson;

  return (
    <Dialog title="Depart" onClose={onClose} width={560} testId="depart-sheet">
      <div ref={body} className="flex flex-col gap-4">
        {!active && starts.length > 1 && (
          <div className="flex items-center gap-2" data-testid="start-depths">
            <span className="k-label">Start at</span>
            {starts.map((d) => (
              <Chip key={d} pressed={start === d} onClick={() => onStart(d)}>
                {d}
              </Chip>
            ))}
          </div>
        )}
        {tracked.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="depart-tracked">
            {tracked.map((q) => (
              <li key={q.id} className="text-[16px] text-[var(--k-text-2)]">
                <span className="text-[var(--k-hot-hi)]">{q.name}</span>
                {' · '}
                {q.objectives.find((o) => !o.done)?.text ?? 'Ready to claim'}
              </li>
            ))}
          </ul>
        )}
        {toClaim > 0 && !active && (
          <Button size="sm" onClick={onQuests} testId="claim-count">
            {toClaim} to claim
          </Button>
        )}
        {blocked && (
          <div className="flex flex-wrap items-center gap-3" data-testid="draft-block">
            <div className="flex flex-col text-[16px] leading-tight">
              <span id={`${id}-draft`} className="text-[var(--k-hot)]" data-testid="draft-warning">
                Unapplied changes: apply or discard them to delve
              </span>
              {applyWhy && (
                <span id={`${id}-apply`} className="text-[var(--k-bad-text)]" data-testid="draft-apply-why">
                  {applyWhy}
                </span>
              )}
            </div>
            <Button
              variant="go"
              size="sm"
              disabled={!applying?.ok}
              onClick={onApply}
              aria-describedby={applyWhy ? `${id}-apply` : undefined}
              data-pad-first={applying?.ok ? '' : undefined}
              testId="draft-apply"
            >
              {applyLabel(registry, view.price)}
            </Button>
            {/* A lesson holds the dive: discarding would only drop the lesson's draft. */}
            {!lesson && (
              <Button size="sm" onClick={onDiscardAndDelve} testId="draft-discard-delve">
                Discard changes &amp; delve
              </Button>
            )}
          </div>
        )}
        {lesson && (
          <span id={`${id}-lesson`} className="text-[16px] leading-tight text-[var(--k-hot)]" data-testid="lesson-block">
            {lesson}
          </span>
        )}
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={onDelve}
            disabled={held}
            aria-describedby={blocked ? `${id}-draft` : lesson ? `${id}-lesson` : undefined}
            data-pad-first={held ? undefined : ''}
            data-tutorial="hub.delve"
            testId="delve-button"
          >
            {active ? `Resume dive · depth ${profile.dive!.depth}` : `Delve ▸ depth ${start}`}
          </Button>
          <Button onClick={onTraining} binding={TRAINING_BINDING} data-tutorial="hub.training" testId="training-button">
            <Glyph id="training" size={20} /> Training
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
```

  The first focus (spec 2.1): Delve when enabled, else the draft's Apply when it can apply, else the dialog's Back (the `Dialog`'s own fallback when no `[data-pad-first]` is in it). If the draft test's Apply is not enabled for the fixture's change (the dry run refuses), assert the Back instead and say so in a comment.

  Check against the real kit before running: `Dialog`'s first focus goes to `[data-pad-first]` (see `kit/surfaces.tsx`); `usePrompts(prompts, ref)` binds in the ref's nearest `[data-pad-scope]`, which must be the dialog (if the `Dialog` puts its scope on an ancestor of `children`, this holds; if not, read how `ControlsPanel` or `SettingsPanel` bind keys inside a dialog and do the same). The "first focus" test asserts `data-pad-first` as an attribute: with `held` false it is `""`.

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/DepartSheet.test.tsx)`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/DepartSheet.tsx packages/client/src/features/delve/hub/__tests__/DepartSheet.test.tsx
git commit -m "feat(client): the Depart sheet: start depth, tracked quests, claims, what holds a dive, Delve and Training"
```

---

### Task 2: the footer shrinks, the hub opens the sheet, Menu is the system menu

**Files:**
- Modify: `packages/client/src/features/delve/hub/HubFooter.tsx`
- Modify: `packages/client/src/features/delve/hub/AnvilHub.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/ApplyBar.tsx` (its compact Delve)
- Test: `hub/__tests__/HubFooter.test.tsx`, `hub/__tests__/AnvilHub.test.tsx`, `hub/skills/__tests__/ApplyBar.test.tsx`, `pages/__tests__/DelveCamp.test.tsx`, `tutorial/__tests__/GuidedChoice.test.tsx`

- [ ] **Step 1: Rewrite the tests that encode today's footer** (they must fail before the code changes).

  `HubFooter.test.tsx`: the lesson and draft cases moved to `DepartSheet.test.tsx` in Task 1; delete them here (keep the ApplyBar case, changed below) and add:

```tsx
describe("the hub's footer", () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it('holds one button, Delve, that opens the Depart sheet and is never disabled', () => {
    const onDepart = vi.fn();
    render(<HubFooter prompts={[]} start={6} onDepart={onDepart} />);
    const depart = screen.getByTestId('depart-button');
    expect(depart).toHaveTextContent('Delve ▸ depth 6');
    expect(depart).toBeEnabled();
    expect(depart).toHaveAttribute('data-pad-menu');
    expect(depart).toHaveAttribute('data-tutorial', 'hub.delve');
    expect(depart).toHaveAttribute('data-primary-action', 'delve');
    fireEvent.click(depart);
    expect(onDepart).toHaveBeenCalledTimes(1);
    for (const gone of ['training-button', 'start-depths', 'claim-count', 'lesson-block', 'draft-block'])
      expect(screen.queryByTestId(gone)).toBeNull();
  });

  it('reads Resume while a dive is open', () => {
    useDelveStore.getState().startDive(1);
    render(<HubFooter prompts={[]} start={1} onDepart={() => {}} />);
    expect(screen.getByTestId('depart-button')).toHaveTextContent('Resume dive · depth 1');
  });

  it("a tab's own action replaces the button", () => {
    render(<HubFooter prompts={[]} start={1} onDepart={() => {}} action={<span data-testid="own" />} />);
    expect(screen.getByTestId('own')).toBeInTheDocument();
    expect(screen.queryByTestId('depart-button')).toBeNull();
  });
});
```

  The file's ApplyBar case ("the Skills tab's compact Delve waits too, its reason as its title") becomes: the compact Delve is `depart-button`, enabled whatever the lesson or the draft, and a click calls `onDelve`.

  `AnvilHub.test.tsx`, by test name:
  - "Quests' tab counts the quests to claim, and the footer's count opens it" → the pip as now; then open the sheet (`fireEvent.click(screen.getByTestId('depart-button'))`), click `claim-count`, and expect Quests selected and the sheet gone (`queryByTestId('depart-sheet')` null).
  - "mid-dive the pip stays, and the footer holds no count" → the sheet holds no count.
  - "on Skills the Apply bar replaces the footer's group, with one Delve button" → one `depart-button`; no `training-button` anywhere until the sheet is open.
  - "the digits 1–5 pick a tab, and T opens the Training Grounds" → unchanged (T still navigates).
  - "the footer's Menu (Esc / B) opens the system menu, and Resume closes it" → rename "(Esc / Menu)"; the Menu prompt's button has no `data-pad-back` (`expect(document.querySelector('[data-testid="hub-anvil"] [data-pad-back]')).toBeNull()`), and its binding draws the pad's Menu.
  - "the footer holds Training, the start depths and the Delve button, the first focus" → "the footer holds Delve, which opens the Depart sheet; the sheet's Delve starts the dive at the chosen depth": click `depart-button`, expect `depart-sheet`; click `delve-button`; expect `mockNavigate` called with `'/delve/run'` and `useDelveStore.getState().profile.dive?.depth` to be the start depth.
  - "the start depth picked in the footer holds for the Skills tab's Delve too" → picked in the sheet (open it, click a chip, close with the dialog's Back), then on Skills the compact Delve opens the sheet showing that depth.
  - Add: "Enter with nothing focused opens the sheet" (`press('Enter')` → `depart-sheet`), "the sheet's Back returns to the hub without a dive", and "a rebound menu key opens the system menu, not the sheet" (set `useControlsStore` so `config.keys.menu` is `'KeyM'`, `press('KeyM')`, expect `system-menu` and no `depart-sheet`; restore the store after).

  `DelveCamp.test.tsx` (lines near 35 and 248) and `GuidedChoice.test.tsx`: wherever they reach for `training-button` or `delve-button` on the hub, use `depart-button` (inertness, presence), or open the sheet first when the test needs the real Delve or Training. Read each test's intent first; keep it.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub src/pages/__tests__/DelveCamp.test.tsx src/features/delve/tutorial/__tests__/GuidedChoice.test.tsx)`
Expected: FAIL on every rewritten case (`depart-button` not found).

- [ ] **Step 3: `HubFooter.tsx`** becomes:

```tsx
import type { ReactNode } from 'react';
import { isDiveActive } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Button, Footer, type Binding, type Prompt } from '@/features/delve/kit';

/** Delve's inputs at the Anvil: Enter with nothing focused, or View on the pad. Both open the Depart sheet. */
export const DEPART_BINDING: Binding = { key: 'Enter', pad: 'view' };

/**
 * The hub's planks: the prompts, then one hot metal button, Delve, which opens the Depart sheet
 * (the pad-first spec, 2.2: the start depths, Training, the claim count and whatever holds a
 * dive live there). It is never disabled. While a tab sets `action` (Skills: its Apply bar, with
 * a compact Delve), that node replaces it.
 */
export function HubFooter({
  prompts,
  start,
  onDepart,
  action,
}: {
  prompts: Prompt[];
  /** The chosen start depth (the hub keeps it; the sheet picks it). */
  start: number;
  /** Opens the Depart sheet. */
  onDepart: () => void;
  action?: ReactNode;
}) {
  const profile = useDelveStore((s) => s.profile);
  const active = isDiveActive(profile);
  if (action) return <Footer prompts={prompts}>{action}</Footer>;
  return (
    <Footer prompts={prompts}>
      <Button
        variant="primary"
        size="lg"
        onClick={onDepart}
        binding={DEPART_BINDING}
        data-pad-menu
        data-pad-first
        data-primary-action="delve"
        data-tutorial="hub.delve"
        testId="depart-button"
      >
        {active ? `Resume dive · depth ${profile.dive!.depth}` : `Delve ▸ depth ${start}`}
      </Button>
    </Footer>
  );
}
```

- [ ] **Step 4: `AnvilHub.tsx`.** Import `DepartSheet` and its `TRAINING_BINDING` (drop the import from `HubFooter`). In `AnvilHub`:

```tsx
  const [departOpen, setDepartOpen] = useState(false);
  const openDepart = () => setDepartOpen(true);

  const onTraining = () => navigate('/delve/training');
  /** Start the dive at the chosen depth, or resume the one open. */
  const startDelve = () => {
    const s = useDelveStore.getState();
    if (!isDiveActive(s.profile) && !s.startDive(depth)) return;
    playSound('phaseTransition');
    vibrate('medium');
    navigate('/delve/run');
  };
  // Every Delve button at the Anvil (the footer's, the Skills tab's) opens the sheet.
  const hub = useHubTabs(mode, openDepart);

  // The footer's prompts: the tab's, then the hub's Menu (Esc, or Menu on the pad: B does
  // nothing at the root). The hub also binds View to the Depart sheet (the footer's button
  // draws it), T to Training and the digits.
  const prompts: Prompt[] = [
    ...hub.tabPrompts,
    {
      id: 'menu',
      label: 'Menu',
      // The configured menu key too (as the stop's Menu binds it): with no [data-pad-back] in the
      // hub, the runtime's fallback for it would press [data-pad-menu], the Delve button.
      binding: { key: menuKey && menuKey !== 'Escape' ? ['Escape', menuKey] : 'Escape', pad: 'menu' },
      onPress: () => setMenuOpen(true),
      asButton: true,
    },
  ];
  usePrompts(
    [
      ...prompts,
      { id: 'depart', label: 'Delve', binding: { pad: 'view' }, onPress: openDepart },
      { id: 'training', label: 'Training', binding: TRAINING_BINDING, onPress: onTraining },
      ...hub.digits,
    ],
    mainRef,
  );
```

  with `const menuKey = useControlsStore((s) => s.config.keys.menu);` above it (import `useControlsStore` from `@/stores/controlsStore`, as `stop/StopScreen.tsx` does).

  The footer: `<HubFooter prompts={prompts} start={depth} onDepart={openDepart} action={hub.footerAction} />`. After the system menu's line:

```tsx
      {departOpen && (
        <DepartSheet
          start={depth}
          onStart={setStart}
          onDelve={startDelve}
          onTraining={onTraining}
          onQuests={() => {
            setDepartOpen(false);
            hub.go({ tab: 'quests' });
          }}
          onClose={() => setDepartOpen(false)}
        />
      )}
```

  Update the component's doc comment ("the wood footer (the tab's prompts and Menu, then Delve, which opens the Depart sheet, or the tab's own footer action) and the system menu on Esc / Menu"). `useHubTabs`'s `claimable` is still used by the tab pip; the footer no longer takes it.

  Check `PauseScreen.tsx`: it calls `useHubTabs` and has its own footer; it must compile unchanged. If it imported anything this task removed from `HubFooter`, fix the import only.

- [ ] **Step 5: `ApplyBar.tsx`'s compact Delve.** It opens the sheet like the footer's: `binding={DEPART_BINDING}` (import it from `../HubFooter`), `testId="depart-button"`, no `disabled`, no `aria-describedby`, no `title`; keep `data-pad-menu`, `data-primary-action="delve"`, `data-tutorial="hub.delve"` and its label. If `lesson` and `active` are then unused in the file, remove them and their imports. Its doc comment: "…and a compact Delve, which opens the Depart sheet (the sheet says what holds a dive)."

- [ ] **Step 6: Run the hub's tests, then the suite**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: types clean; all passing. A failure outside the files named above means something else read the footer's old props or test ids: fix the reader to the new contract (the overview's table), and say which in the commit body.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src
git commit -m "feat(client): Menu opens the system menu at the Anvil; Delve opens the Depart sheet (View, Enter or a click); the footer is one button"
```

---

### Task 3: the guided start finds Training

**Files:**
- Modify: `packages/client/src/features/delve/tutorial/marked.ts` (`WAY_TO`)
- Test: `packages/client/src/features/delve/tutorial/__tests__/marked.test.tsx` (or `tutorial-targets.test.tsx`, whichever holds the `WAY_TO` cases)

- [ ] **Step 1: Write the failing test** (in the file that tests `findWay`; follow its fixtures for putting `data-tutorial` controls on screen)

```tsx
it("Training's way is the footer's Delve while the Depart sheet is shut, and Training itself once it is open", () => {
  document.body.innerHTML = `<div data-pad-scope><button data-tutorial="hub.delve">Delve</button></div>`;
  boxAll(); // the file's helper that gives every element a box; write one if it has none
  expect(findWay('hub.training')?.id).toBe('hub.delve');
  document.body.innerHTML += `<div data-pad-scope><button data-tutorial="hub.delve">Delve</button><button data-tutorial="hub.training">Training</button></div>`;
  boxAll();
  expect(findWay('hub.training')?.id).toBe('hub.training');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial/__tests__ -t "Training's way")`
Expected: FAIL, `findWay('hub.training')` is null with the sheet shut.

- [ ] **Step 3: Implement.** In `WAY_TO`, add (with the hub's other entries, or last):

```ts
  // Training lives in the Depart sheet, which the footer's Delve opens.
  'hub.training': 'hub.delve',
```

  If a test in `tutorial-targets.test.tsx` lists every target that must appear in the hub's DOM without a dialog open, `hub.training` now appears only with the sheet open: change that test to open the sheet for it.

- [ ] **Step 4: Run the tutorial's tests**

Run: `(cd packages/client && npx vitest run src/features/delve/tutorial)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/tutorial
git commit -m "feat(client): the guided start's way to Training is the footer's Delve (the Depart sheet)"
```

---

### Task 4: the E2E follows the sheet

**Files:**
- Modify: `packages/client/e2e/fixtures/delve.ts`
- Modify: every spec under `packages/client/e2e` that clicks `delve-button` or `training-button` from the hub

- [ ] **Step 1: Add the fixtures** (in `e2e/fixtures/delve.ts`)

```ts
/** From the Anvil: the footer's Delve opens the Depart sheet, whose Delve starts (or resumes) the dive. */
export async function startDive(page: Page): Promise<void> {
  await page.getByTestId('depart-button').click();
  await page.getByTestId('delve-button').click();
}

/** From the Anvil: the Depart sheet's Training. */
export async function openTraining(page: Page): Promise<void> {
  await page.getByTestId('depart-button').click();
  await page.getByTestId('training-button').click();
}
```

- [ ] **Step 2: Replace the call sites.** List them: `grep -rn "delve-button\|training-button" packages/client/e2e`. For each:
  - `await page.getByTestId('delve-button').click()` → `await startDive(page)` (import it from the spec's existing `./fixtures/delve` import; the responsive specs import from `../../fixtures/delve`).
  - `await page.getByTestId('training-button').click()` → `await openTraining(page)`.
  - A wait for the hub (`expect(page.getByTestId('delve-button')).toBeVisible()`, `delve-pad-nav.spec.ts:265`) → `depart-button`.
  - `delve-tutorial.spec.ts:186-188` (`const delve = page.getByTestId('delve-button')`, disabled, with `lesson-block` beside it) and `:262-264` (the lesson done: no `lesson-block`, Delve enabled): both read the sheet. Open it first (`depart-button`), assert on the sheet's `delve-button` and `lesson-block`, and close it (Escape) before the test goes on. A small local helper in the spec keeps the two sites alike.
  - `delve-quests.spec.ts:49` clicks `claim-count` at the Anvil: open the sheet first (`depart-button`), then click it (the sheet closes itself and Quests opens).
  - `delve-gamepad.spec.ts`: where a test starts the dive with the pad's Menu button, it must now press View (`BUTTON.view`, index 8 in the standard mapping; add it to the spec's `BUTTON` map or `e2e/fixtures/pad.ts`'s if absent) and then A.

- [ ] **Step 3: Run the Delve E2E on one project**

Run: `(cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-training.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-runes.spec.ts e2e/delve-room-objects.spec.ts --project=desktop)`
Expected: PASS. (`delve-quests`, `delve-tutorial` and `delve-pad-nav` run in plans 03 and 04; run `delve-tutorial.spec.ts --project=desktop` here too and fix what the sheet breaks.) A long run: use a 10-minute timeout, or run it in the background and read its report.

  D02 in `delve.spec.ts` is known to be sensitive to a loaded machine (see `CLAUDE.md`, Room objects, E2E): if it alone fails, rerun it alone before touching it.

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e
git commit -m "test(client): the E2E starts a dive and opens Training through the Depart sheet"
```
