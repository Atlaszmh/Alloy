# Quests: claim where you are Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Quests tab opens on what is ready, the pad lands on it, A claims on the row, the next one opens, and Claim all takes everything.

**Architecture:** all in `QuestsTab.tsx`: the default open quest, `data-pad-first` on the open row (or on Claim all while it shows; plan 01's `stepTabs` reads it), a row press that claims under the pad, and a `Claim all` button in the journal's head looping the store's `claimQuest`. No engine change, no store change.

**Tech Stack:** React 19, Zustand, Vitest (jsdom), Playwright.

Read `00-overview.md` first. Spec: section 2.3. Plans 01 and 02 are merged into the branch before this one starts.

---

### Task 1: opens on what is ready; the pad lands on it

**Files:**
- Modify: `packages/client/src/features/delve/hub/quests/QuestsTab.tsx`
- Test: `packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx`

- [ ] **Step 1: Write the failing tests** (in the file's `describe('QuestsTab')`; `MAIN`, `KINDLING`, `DEEP_ROOTS`, `RAT_CATCHER`, `renderTab`, `shown` are its fixtures)

```tsx
it('opens on the first quest that waits to be claimed, else the first not yet claimed, else the first', () => {
  shown.quests = [MAIN, { ...KINDLING, status: 'complete' }, DEEP_ROOTS];
  renderTab();
  expect(screen.getByTestId(`quest-${KINDLING.id}`)).toHaveAttribute('aria-current', 'true');
  document.body.replaceChildren();

  shown.quests = [{ ...MAIN, status: 'claimed' }, KINDLING];
  renderTab();
  expect(screen.getByTestId(`quest-${KINDLING.id}`)).toHaveAttribute('aria-current', 'true');
  document.body.replaceChildren();

  shown.quests = [{ ...MAIN, status: 'claimed' }];
  renderTab();
  expect(screen.getByTestId('quest-detail')).toHaveTextContent(MAIN.name);
});

it('a link still opens its quest over the default', () => {
  shown.quests = [MAIN, { ...KINDLING, status: 'complete' }];
  renderTab({ tab: 'quests', questId: MAIN.id });
  expect(screen.getByTestId(`quest-${MAIN.id}`)).toHaveAttribute('aria-current', 'true');
});

it("the open quest's row is the tab's data-pad-first, and only it", () => {
  shown.quests = [MAIN, { ...KINDLING, status: 'complete' }, DEEP_ROOTS];
  renderTab();
  const first = [...document.querySelectorAll('[data-pad-first]')];
  expect(first).toEqual([screen.getByTestId(`quest-${KINDLING.id}`)]);
});
```

  (`cleanup` between renders inside one test: if the file's other tests use `unmount()` from `render`'s result rather than `document.body.replaceChildren()`, do it their way; `renderTab` may need to return `unmount`.)

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx)`
Expected: the three new tests FAIL (the first quest is open; no `data-pad-first`).

- [ ] **Step 3: Implement.** In `QuestsTab`:

```tsx
  // With nothing chosen: the first quest waiting to be claimed, else the first still to do.
  const quest =
    quests.find((q) => q.id === openId) ??
    quests.find((q) => q.status === 'complete') ??
    quests.find((q) => q.status !== 'claimed') ??
    quests[0];
```

  `QuestRow` gains a `first: boolean` prop ("the tab's first focus for the pad: the open quest's row, unless Claim all shows") and renders `data-pad-first={first ? '' : undefined}`. `Journal` passes `first={q.id === open}` for now (Task 3 turns it off while Claim all shows). Update the tab's doc comment: "…It opens on the first quest that waits to be claimed, and the pad lands on its row."

- [ ] **Step 4: Run the file**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/quests)`
Expected: PASS. If "shows the journal by kind, the first quest open…" fails, its fixture has a complete quest later in the list: the new default is right, fix the expectation.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/quests
git commit -m "feat(client): Quests opens on the first quest ready to claim, and the pad lands on its row"
```

---

### Task 2: A claims on the row; the next one opens

**Files:**
- Modify: `packages/client/src/features/delve/hub/quests/QuestsTab.tsx`
- Test: `packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
describe('claiming on the row, under the pad', () => {
  beforeEach(() => useInputDeviceStore.setState({ device: 'gamepad' }));
  afterEach(() => useInputDeviceStore.setState({ device: 'keyboard' }));

  it('pressing the open, complete row claims it, and the prompt reads Claim', () => {
    shown.quests = [{ ...MAIN, status: 'complete' }, DEEP_ROOTS];
    const { setPrompts } = renderTab();
    expect(lastPrompts(setPrompts).map((p) => [p.id, p.label])).toEqual([
      ['select', 'Claim'],
      ['track', 'Untrack'],
    ]);
    fireEvent.click(screen.getByTestId(`quest-${MAIN.id}`));
    expect(useDelveStore.getState().claimQuest).toHaveBeenCalledWith(MAIN.id);
    expect(screen.getByTestId('quest-message')).toHaveTextContent(`Claimed ${MAIN.name}`);
  });

  it('pressing another row opens it and claims nothing; a quest still under way reads Select', () => {
    shown.quests = [{ ...MAIN, status: 'complete' }, DEEP_ROOTS];
    const { setPrompts } = renderTab();
    fireEvent.click(screen.getByTestId(`quest-${DEEP_ROOTS.id}`));
    expect(useDelveStore.getState().claimQuest).not.toHaveBeenCalled();
    expect(screen.getByTestId(`quest-${DEEP_ROOTS.id}`)).toHaveAttribute('aria-current', 'true');
    expect(lastPrompts(setPrompts).find((p) => p.id === 'select')?.label).toBe('Select');
  });

  it('while a dive is open the row only opens, and the prompt reads Select', () => {
    shown.quests = [{ ...MAIN, status: 'complete' }];
    const { setPrompts } = renderTab(undefined, 'pause');
    fireEvent.click(screen.getByTestId(`quest-${MAIN.id}`));
    expect(useDelveStore.getState().claimQuest).not.toHaveBeenCalled();
    expect(lastPrompts(setPrompts).find((p) => p.id === 'select')?.label).toBe('Inspect');
  });

  it('after a claim the next quest that waits opens and takes the focus', () => {
    shown.quests = [{ ...MAIN, status: 'complete' }, DEEP_ROOTS, { ...KINDLING, status: 'complete' }];
    renderTab();
    fireEvent.click(screen.getByTestId(`quest-${MAIN.id}`));
    const next = screen.getByTestId(`quest-${KINDLING.id}`);
    expect(next).toHaveAttribute('aria-current', 'true');
    expect(document.activeElement).toBe(next);
  });
});

it('with the mouse, pressing the open, complete row claims nothing', () => {
  shown.quests = [{ ...MAIN, status: 'complete' }];
  renderTab();
  fireEvent.click(screen.getByTestId(`quest-${MAIN.id}`));
  expect(useDelveStore.getState().claimQuest).not.toHaveBeenCalled();
});
```

  Note what the mocked `useQuests` does: `shown.quests` does not change when `claimQuest` (a mock) is called, so the claimed quest still reads complete in these tests. The "next quest" rule must therefore skip the one just claimed by id, which the code below does. The pause's select prompt reads whatever it reads today in pause mode: check `SELECT_PROMPT` and the Loadout's "Inspect" precedent; if Quests has no pause label today, expect 'Select' and fix the third test's last line.

  The existing test 'on the pad, A presses the focused Claim: no Enter prompt' keeps its point (no Enter prompt under the pad); its expected ids stay `['select', 'track']`, and it may add that `select` reads "Claim".

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx -t "claim")`
Expected: FAIL (a row press only opens; no next quest; the label is Select).

- [ ] **Step 3: Implement.** In `QuestsTab`:

```tsx
  /** Rows by quest id, for the focus after a claim. */
  const rows = useRef(new Map<string, HTMLButtonElement>());
  /** The quest whose row takes the focus once it is open (under the pad, after a claim). */
  const [focusId, setFocusId] = useState<string | null>(null);
  // Under the pad, A on the open quest's row claims it (never while a dive is open).
  const rowClaims = pad && !diving && quest?.status === 'complete';

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
    if (!res.ok) return;
    // The next quest that waits opens (and, under the pad, takes the focus): A, A, A.
    const next = quests.find((q) => q.status === 'complete' && q.id !== quest.id);
    if (!next) return;
    setOpenId(next.id);
    if (pad) setFocusId(next.id);
  };
  /** A press of a row: under the pad the open, complete one claims; any other opens. */
  const onRow = (id: string) => (rowClaims && id === quest?.id ? onClaim() : open(id));

  useEffect(() => {
    if (!focusId) return;
    rows.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);
```

  `open(id)` clears the message; `onClaim`'s own `setOpenId` must not (the "Claimed …" line stays). `Journal` takes `onOpen={onRow}` and a `rowRef: (id: string, el: HTMLButtonElement | null) => void` that `QuestRow` puts on its button (`ref={(el) => rowRef(q.id, el)}`), filling or clearing `rows.current`.

  The select prompt: `{ ...SELECT_PROMPT, label: rowClaims ? 'Claim' : SELECT_PROMPT.label }`, with `rowClaims` in the prompts effect's dependencies.

- [ ] **Step 4: Run the file, then the suite**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: types clean, all passing.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/quests
git commit -m "feat(client): under the pad, A on the open quest's row claims it and the next one opens"
```

---

### Task 3: Claim all

**Files:**
- Modify: `packages/client/src/features/delve/hub/quests/QuestsTab.tsx`
- Test: `packages/client/src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
describe('Claim all', () => {
  const two = () => [{ ...MAIN, status: 'complete' as const }, DEEP_ROOTS, { ...KINDLING, status: 'complete' as const }];

  it('shows while two or more quests wait, as the tab\'s data-pad-first', () => {
    shown.quests = [{ ...MAIN, status: 'complete' }, DEEP_ROOTS];
    renderTab();
    expect(screen.queryByTestId('quest-claim-all')).toBeNull();
    document.body.replaceChildren();

    shown.quests = two();
    renderTab();
    const all = screen.getByTestId('quest-claim-all');
    expect(all).toHaveTextContent('Claim all 2');
    expect([...document.querySelectorAll('[data-pad-first]')]).toEqual([all]);
  });

  it("claims each in the journal's order and says what it claimed", () => {
    shown.quests = two();
    renderTab();
    fireEvent.click(screen.getByTestId('quest-claim-all'));
    expect(vi.mocked(useDelveStore.getState().claimQuest).mock.calls.map(([id]) => id)).toEqual([
      MAIN.id,
      KINDLING.id,
    ]);
    expect(screen.getByTestId('quest-message')).toHaveTextContent(
      `Claimed 2 quests: ${MAIN.name}, ${KINDLING.name}`,
    );
  });

  it("stops at a refusal and shows the engine's reason", () => {
    shown.quests = two();
    vi.mocked(useDelveStore.getState().claimQuest)
      .mockReturnValueOnce(ok())
      .mockReturnValueOnce(ok({ ok: false, reason: 'The pouch is full' }));
    renderTab();
    fireEvent.click(screen.getByTestId('quest-claim-all'));
    expect(useDelveStore.getState().claimQuest).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('quest-message')).toHaveTextContent(
      `Claimed 1 quest: ${MAIN.name} · The pouch is full`,
    );
  });

  it('is absent while a dive is open', () => {
    shown.quests = two();
    renderTab(undefined, 'pause');
    expect(screen.queryByTestId('quest-claim-all')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/quests/__tests__/QuestsTab.test.tsx -t "Claim all")`
Expected: FAIL, no `quest-claim-all`.

- [ ] **Step 3: Implement.** In `QuestsTab`:

```tsx
  /** The quests waiting to be claimed, in the journal's order. */
  const waiting = quests.filter((q) => q.status === 'complete');
  const claimAll = !diving && waiting.length >= 2;
  /** Claim every waiting quest in order; a refusal stops it and is shown after what went. */
  const onClaimAll = () => {
    const names: string[] = [];
    let refusal: string | null = null;
    for (const q of waiting) {
      const res = useDelveStore.getState().claimQuest(q.id);
      if (!res.ok) {
        refusal = res.reason ?? '';
        break;
      }
      names.push(q.name);
    }
    playSound(names.length > 0 ? 'upgradeTier' : 'combineFail');
    if (names.length > 0) vibrate('success');
    const claimed = `Claimed ${names.length} quest${names.length === 1 ? '' : 's'}: ${names.join(', ')}`;
    setMessage(
      names.length === 0
        ? { good: false, text: refusal ?? '' }
        : { good: true, text: refusal ? `${claimed} · ${refusal}` : claimed },
    );
  };
```

  `Journal` takes `onClaimAll?: () => void` and `waitingCount: number`, and its `Panel`'s `aside` becomes:

```tsx
      aside={
        <span className="flex items-center gap-3">
          {onClaimAll && (
            <Button variant="go" size="sm" onClick={onClaimAll} data-pad-first testId="quest-claim-all">
              Claim all {waitingCount}
            </Button>
          )}
          <span className="k-caption" data-testid="quests-tracked">
            {tracked} tracked of {maxTracked}
          </span>
        </span>
      }
```

  and its rows' `first` becomes `!onClaimAll && q.id === open`. `QuestsTab` passes `onClaimAll={claimAll ? onClaimAll : undefined}` and `waitingCount={waiting.length}`. Update the doc comments.

- [ ] **Step 4: Run the file, then the suite**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: types clean, all passing.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/quests
git commit -m "feat(client): Claim all, in the journal's head while two or more quests wait"
```

---

### Task 4: the E2E claims by the pad and by Claim all

**Files:**
- Modify: `packages/client/e2e/delve-quests.spec.ts`

- [ ] **Step 1: Read the spec** and its helpers (`e2e/fixtures/delve.ts`, `e2e/fixtures/pad.ts`: `installPad`, `tap`, `BUTTON`). Find the test that reaches the Anvil with quests to claim.

- [ ] **Step 2: Add a test** that seeds a save with two or more complete quests (the way the spec's existing tests reach "claimable": the autopilot's first dive, or a seeded profile whose `quests.progress` completes First Steps and one side quest; prefer seeding, it is faster), installs the pad, and:
  1. presses RB until Quests is selected; expects the focus on `quest-claim-all`;
  2. presses A; expects `quest-message` to start "Claimed 2 quests" (or n, as seeded) and `claim-pip` to be gone.

  And a second on a save with exactly one complete quest: RB to Quests; the focus is on that quest's row (`aria-current="true"`); A; `quest-message` starts "Claimed"; the pip is gone.

- [ ] **Step 3: Run it**

Run: `(cd packages/client && npx playwright test e2e/delve-quests.spec.ts --project=desktop)`
Expected: PASS, the whole file.

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/delve-quests.spec.ts
git commit -m "test(client): the pad claims a quest on its row and every quest with Claim all"
```
