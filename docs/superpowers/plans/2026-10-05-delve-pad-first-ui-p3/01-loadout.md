# The Loadout, pad-first Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Loadout is the doll and the bag, walked by the D-pad. The bag's filters step on LT/RT. The compare pane follows the focus (a worn item too), leads with one verdict line, has no D-pad stops and scrolls on the right stick. The footer's A / X / Y act on the focused tile (A equips, X salvages, Y locks), R3 toggles Full compare. A bag weapon that can take your moveset opens a take sheet on A (Equip as it is, or Transfer). The hub remembers each tab's selection.

**Architecture:** `useHubTabs` keeps a `HubMemory` box in a ref and passes it to every tab view (`HubTabProps.memory`); the Loadout reads its tile and filter from it as it mounts and writes them as they change. The bag's filter moves up into `LoadoutTab` (so it can be remembered) and becomes a kit `Tabs level="sub"`. `ComparePane` gains `verdictOf` and its actions block carries `data-pad-skip`; its scroll body carries `data-pad-scroll`, which the gamepad nav scrolls by the right stick. `LoadoutTab`'s prompts are rebuilt in the grammar's order; the RT "Actions" jump and the "Back to bag" B prompt go. A prompt may carry a guided-start target (`Prompt.tutorial`), so under the pad the marker sits on the footer's A or X, the button the player presses.

**Tech Stack:** React 19, Zustand, Vitest (jsdom), Playwright.

Read `00-overview.md` first (branch, baseline, commands, conventions, the test-id table). Spec: section 4, "Loadout", with the overview's edits 1, 2, 3, 7 and 9.

**The guided start, checked against `packages/engine/src/data/tutorial.json`:** no data changes here.

| Target | Where it is after this plan | Steps |
|---|---|---|
| `loadout.bag:<slot>.<rarity>` | the tile (unchanged); under the pad focus selects it, so it is done (`aria-pressed="true"`) when focused | `l1-equip`, `l1-salvage`, `l2-compare`, `l2-transfer` |
| `loadout.equip` | the pane's Equip (the mouse's) and, under the pad, the footer's A prompt (`Prompt.tutorial`) | `l1-equip` |
| `loadout.salvage` | the pane's Salvage and, under the pad, the footer's X prompt | `l1-salvage` |
| `loadout.transfer` | the pane's Transfer, under the pad the footer's A prompt while the focused tile can take your moveset, and the take sheet's Transfer | `l2-transfer` |
| `loadout.compare` | the verdict and Power block (`item-compare`) | `l2-compare` |

`findTarget` takes the last visible match of a plain target in the topmost scope; the footer comes after the main in the DOM, so under the pad the prompt wins and under the keys (no `tutorial` on the prompt) the pane's button does. `TutorialHighlight` moves the pad's focus only onto a candidate: a prompt is not one, so the focus stays on the tile, where A and X act.

---

### Task 1: the hub remembers each tab's selection (the Loadout's part)

**Files:**
- Modify: `packages/client/src/features/delve/hub/types.ts`
- Modify: `packages/client/src/features/delve/hub/AnvilHub.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/BagPane.tsx` (the filter comes in as props; Task 2 turns it into tabs)
- Test: `packages/client/src/features/delve/hub/__tests__/AnvilHub.test.tsx`

- [ ] **Step 1: Write the failing test.** In `AnvilHub.test.tsx` add (with `generateItem`, `SeededRNG` from `@alloy/engine`):

```tsx
  it('each tab comes back to its selection: the bag tile and its filter', () => {
    const registry = getDelveRegistry();
    const ring = generateItem(registry, { uid: 'r1', ilvl: 3, rarity: 'magic', slot: 'ring', mana: 'fire' }, new SeededRNG(4));
    const helm = generateItem(registry, { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'fire' }, new SeededRNG(5));
    act(() => {
      const p = useDelveStore.getState().profile;
      useDelveStore.getState().setProfile({ ...p, bag: [helm, ring] });
    });
    renderHub();
    fireEvent.click(screen.getByTestId('bag-filter-jewelry'));
    const ringTile = () => screen.getAllByTestId('bag-item').find((t) => t.dataset.uid === 'r1')!;
    fireEvent.click(ringTile());
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('compared with your ring');
    // Away and back: the tab view remounts, the hub kept its selection and filter.
    fireEvent.click(screen.getByTestId('tab-skills'));
    fireEvent.click(screen.getByTestId('tab-loadout'));
    expect(screen.getByTestId('bag-filter-jewelry')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('bag-item').map((t) => t.dataset.uid)).toEqual(['r1']);
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('compared with your ring');
    // The pad lands on it: the remembered tile is the tab's first focus.
    expect(ringTile()).toHaveAttribute('data-pad-first');
  });

  it('a link wins over the memory, and a salvaged tile is forgotten', () => {
    const registry = getDelveRegistry();
    const helm = generateItem(registry, { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'fire' }, new SeededRNG(5));
    act(() => {
      const p = useDelveStore.getState().profile;
      useDelveStore.getState().setProfile({ ...p, bag: [helm] });
    });
    renderHub();
    fireEvent.click(screen.getAllByTestId('bag-item')[0]);
    fireEvent.click(screen.getByTestId('tab-skills'));
    act(() => {
      const p = useDelveStore.getState().profile;
      useDelveStore.getState().setProfile({ ...p, bag: [] });
    });
    fireEvent.click(screen.getByTestId('tab-loadout'));
    // The salvaged tile is forgotten: nothing is selected (this new save still shows the how-to;
    // plan 03 flips this line to the worn weapon's compare).
    expect(screen.queryByTestId('item-sheet')).toBeNull();
    expect(screen.getByTestId('delve-howto')).toBeInTheDocument();
  });
```

  (`getDelveRegistry` from `../../registry`, `generateItem` and `SeededRNG` from `@alloy/engine`.) Plan 03's Task 4 rewrites the second test's last two lines as `expect(screen.getByTestId('item-sheet')).toHaveTextContent('Your weapon');`.

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/AnvilHub.test.tsx -t "comes back to its selection")`
Expected: FAIL: the filter chip has no `aria-selected` (it is a chip), and the selection is gone after the remount.

- [ ] **Step 3: Implement.** In `hub/types.ts`:

```ts
/** The bag's filters (the Loadout's LT/RT). */
export type BagFilter = 'all' | 'weapons' | 'armor' | 'jewelry' | 'upgrades';
/** The Forge tab's benches (LT/RT). */
export type ForgeBenchId = 'forge' | 'temper' | 'materials';

/**
 * What each tab last had selected, kept by the hub while its tab views remount (the pad-first
 * spec, 4: "each tab restores its selection"). A mutable box the hub holds in a ref: a tab reads
 * its entry as it mounts and writes it as its selection changes; a link it is opened by wins.
 */
export interface HubMemory {
  loadout?: { uid: string | null; filter: BagFilter };
  forge?: { bench: ForgeBenchId; baseId: string | null; uid: string | null };
}
```

  `HubLink`'s forge entry becomes `{ tab: 'forge'; uid?: string; bench?: ForgeBenchId }`. `HubTabProps` gains:

```ts
  /** The hub's memory of each tab's selection (absent: none, as in a tab's own tests). */
  memory?: HubMemory;
```

  In `useHubTabs`: `const memory = useRef<HubMemory>({}).current;` and pass `memory={memory}` to `<View …/>`. Its doc comment gains: "Each tab's selection lives in `memory` across its remounts."

  In `LoadoutTab`:

```tsx
  const kept = memory?.loadout;
  const [selected, setSelected] = useState<string | null>(
    link?.tab === 'loadout' && link.uid ? link.uid : (kept?.uid ?? null),
  );
  const [filter, setFilter] = useState<BagFilter>(kept?.filter ?? 'all');
  useEffect(() => {
    if (memory) memory.loadout = { uid: selected, filter };
  }, [memory, selected, filter]);
```

  (the existing `link` effect stays: a link that arrives later still selects.) `has(selected)` already ignores a uid that is gone, so a salvaged tile is forgotten by reading. Pass `filter` and `onFilter={setFilter}` to `BagPane`, which drops its own `filter` state and takes both as props (`filter: BagFilter; onFilter: (f: BagFilter) => void`; its local `Filter` type is replaced by the imported `BagFilter`). `BagPane` marks the selected tile `data-pad-first` (Task 2 writes it).

- [ ] **Step 4: Run it** (after Task 2's filter tabs, which this test also needs: do Task 2's Step 3 before running, then run both tasks' tests)

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/AnvilHub.test.tsx src/features/delve/hub/loadout)`
Expected: PASS but for the tests Task 2 and Task 5 rewrite (the filter chips' `aria-pressed`, the prompts).

---

### Task 2: the bag's filters on LT/RT; the tile's marks for the pad and the E2E

**Files:**
- Modify: `packages/client/src/features/delve/hub/loadout/BagPane.tsx`
- Modify: `packages/client/src/features/delve/kit/Tile.tsx`
- Test: `packages/client/src/features/delve/hub/loadout/__tests__/BagPane.test.tsx`, `packages/client/src/features/delve/kit/__tests__/Tile.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `BagPane.test.tsx`, `open` passes the new props: `const props = { locked, selected: null, filter: 'all' as BagFilter, onFilter: vi.fn(), onSelect: vi.fn(), onHover: vi.fn(), onEquip: vi.fn() }`. Replace the test "filters by kind and by ▲ upgrades, and sorts by power, rarity, slot or newest" with:

```tsx
  it('filters are a sub tab list (LT/RT): each asks to filter; the tiles shown follow the filter given', () => {
    put(gear('r1', 'ring', 'common'), gear('w1', 'weapon', 'rare'), gear('h1', 'helm', 'epic'));
    const onFilter = vi.fn();
    const props = { locked: false, selected: null, onSelect: vi.fn(), onHover: vi.fn(), onEquip: vi.fn(), onFilter };
    const { rerender } = render(<BagPane {...props} filter="all" />);
    const list = screen.getByRole('tablist', { name: 'Bag filter' });
    expect(list).toHaveAttribute('data-pad-tabs', 'sub');
    expect(within(list).getAllByRole('tab').map((t) => t.dataset.testid)).toEqual([
      'bag-filter-all', 'bag-filter-weapons', 'bag-filter-armor', 'bag-filter-jewelry', 'bag-filter-upgrades',
    ]);
    fireEvent.click(screen.getByTestId('bag-filter-weapons'));
    expect(onFilter).toHaveBeenLastCalledWith('weapons');
    const rarities = () => tiles().map((t) => t.dataset.rarity);
    rerender(<BagPane {...props} filter="weapons" />);
    expect(screen.getByTestId('bag-filter-weapons')).toHaveAttribute('aria-selected', 'true');
    expect(rarities()).toEqual(['rare']);
    rerender(<BagPane {...props} filter="armor" />);
    expect(rarities()).toEqual(['epic']);
    rerender(<BagPane {...props} filter="jewelry" />);
    expect(rarities()).toEqual(['common']);
    rerender(<BagPane {...props} filter="upgrades" />);
    for (const t of tiles()) expect(t).toHaveAccessibleName(expect.stringContaining(', upgrade'));
  });

  it('sorts by power, rarity, slot or newest', () => {
    put(gear('r1', 'ring', 'common'), gear('w1', 'weapon', 'rare'), gear('h1', 'helm', 'epic'));
    open();
    const rarities = () => tiles().map((t) => t.dataset.rarity);
    const sort = screen.getByTestId('bag-sort');
    expect(sort).toHaveTextContent('Power');
    fireEvent.click(sort);
    expect(rarities()).toEqual(['epic', 'rare', 'common']);
    fireEvent.click(sort);
    expect(rarities()).toEqual(['rare', 'epic', 'common']); // weapon, helm, ring
    fireEvent.click(sort);
    expect(rarities()).toEqual(['epic', 'rare', 'common']);
  });

  it('each tile carries its uid and its mark; the selected one, else the first, is the pad's first focus', () => {
    put(gear('h1', 'helm'), gear('r1', 'ring'));
    const props = { locked: false, filter: 'all' as BagFilter, onFilter: vi.fn(), onSelect: vi.fn(), onHover: vi.fn(), onEquip: vi.fn() };
    const { rerender } = render(<BagPane {...props} selected={null} />);
    expect(tiles().map((t) => t.dataset.uid).sort()).toEqual(['h1', 'r1']);
    expect(tiles().filter((t) => t.hasAttribute('data-pad-first'))).toEqual([tiles()[0]]);
    rerender(<BagPane {...props} selected="r1" />);
    expect(tiles().filter((t) => t.hasAttribute('data-pad-first')).map((t) => t.dataset.uid)).toEqual(['r1']);
    // An empty slot and a full one: the ring slot is empty, so the ring is ▲.
    expect(tiles().find((t) => t.dataset.uid === 'r1')).toHaveAttribute('data-delta', 'up');
  });
```

  The test "counts the bag, and marks each tile ▲…" keeps its point; its `bag-filter-upgrades` text check stays (the tab's label holds the count). In `Tile.test.tsx` add: `it('says its mark in data-delta for tests and audits', …)` rendering `<Tile rarity="rare" delta="potential" label="x" />` and expecting `data-delta="potential"`, and no `data-delta` with `delta={null}`.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/BagPane.test.tsx src/features/delve/kit/__tests__/Tile.test.tsx)`
Expected: FAIL (no tablist named "Bag filter", no `data-uid`, no `data-delta`).

- [ ] **Step 3: Implement.** In `Tile.tsx` add `data-delta={delta ?? undefined}` beside `data-rarity`. In `BagPane.tsx` the chips go, and the panel's `aside` becomes:

```tsx
      aside={
        <div className="flex flex-wrap items-center gap-2.5">
          <Tabs
            aria-label="Bag filter"
            level="sub"
            size="md"
            glyphs
            value={filter}
            onChange={(f) => {
              playSound('buttonClick');
              onFilter(f);
            }}
            tabs={[
              { id: 'all', label: 'All', testId: 'bag-filter-all' },
              { id: 'weapons', label: 'Weapons', testId: 'bag-filter-weapons' },
              { id: 'armor', label: 'Armor', testId: 'bag-filter-armor' },
              { id: 'jewelry', label: 'Jewelry', testId: 'bag-filter-jewelry' },
              {
                id: 'upgrades',
                label: (
                  <span className="flex items-center gap-1.5">
                    <Glyph id="up" size={14} /> Upgrades {upgrades}
                  </span>
                ),
                testId: 'bag-filter-upgrades',
              },
            ]}
          />
          <span className="k-caption ml-2">Sort</span>
          <Chip …bag-sort as today… />
        </div>
      }
```

  Each `ItemTile` gains `data-uid={item.uid}` and `data-pad-first={(selected ? item.uid === selected : i === 0) || undefined}` where `i` is the tile's index in `shown` (when the selected item is filtered out, no tile carries it and `stepTabs` falls back to the first after the list). The doc comment's "its count, filter and sort chips" becomes "its count, the filter tabs (LT/RT, `filter` is the Loadout's, so the hub remembers it) and the sort chip".

  The "Upgrades n" label used to sit in a `k-well` for contrast on the chip: on a tab, check the ▲ glyph reads against `.k-tab` (the kit gallery shows it); keep the well only if it does not.

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/BagPane.test.tsx src/features/delve/kit/__tests__/Tile.test.tsx src/features/delve/hub/__tests__/AnvilHub.test.tsx -t "selection|filter|sort|mark|uid")`
Expected: PASS.

- [ ] **Step 5: Commit** (Tasks 1 and 2 together)

```bash
git add packages/client/src/features/delve/hub packages/client/src/features/delve/kit/Tile.tsx packages/client/src/features/delve/kit/__tests__/Tile.test.tsx
git commit -m "feat(client): the hub remembers the Loadout's tile and filter; the bag's filters step on LT/RT"
```

---

### Task 3: the compare pane: the verdict, off the D-pad, scrolled by the right stick

**Files:**
- Modify: `packages/client/src/features/delve/hub/loadout/ComparePane.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/BindChoice.tsx`
- Test: `packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `ComparePane.test.tsx` (import `verdictOf`, `VERDICT_TEXT` from `../ComparePane` and `UPGRADE_EPSILON` from `../../../format`):

```tsx
describe('verdictOf', () => {
  const c = (powerPct: number) => ({ powerPct });
  const up = UPGRADE_EPSILON * 4;
  it('reads the engine comparison as the bag tile reads its mark', () => {
    expect(verdictOf(null, null)).toBeNull(); // a worn item: nothing to compare
    expect(verdictOf(c(up), null)).toBe('up');
    expect(verdictOf(c(-up), null)).toBe('worse');
    expect(verdictOf(c(0), null)).toBe('same');
    // A weapon: as it comes decides an upgrade, as a home for your moveset the ◇.
    expect(verdictOf(c(up), c(up))).toBe('up');
    expect(verdictOf(c(up), c(-up))).toBe('home');
    expect(verdictOf(c(-up), c(-up))).toBe('worse');
    expect(VERDICT_TEXT).toEqual({
      up: 'An upgrade as it comes',
      home: 'Better only as a home for your moveset',
      worse: 'Worse than what you wear',
      same: 'About the same as what you wear',
    });
  });
});
```

  and in the pane's `describe`:

```tsx
  it('leads with one verdict line for a bag item, none for a worn one', () => {
    put(gear('r1', 'ring')); // the ring slot is empty: pure gain
    renderPane('r1');
    const verdict = screen.getByTestId('item-verdict');
    expect(verdict).toHaveAttribute('data-verdict', 'up');
    expect(verdict).toHaveTextContent('An upgrade as it comes');
    // First in the pane's body, before the item's header.
    const body = screen.getByTestId('item-sheet').querySelector('[data-pad-scroll]')!;
    expect(body.firstElementChild).toBe(verdict);
    cleanup();
    renderPane(store().profile.equipped.weapon!.uid);
    expect(screen.queryByTestId('item-verdict')).toBeNull();
  });

  it('a bag weapon worse as it comes but better with your moveset reads "Better only as a home"', () => {
    // As in 'each valuation shows its own delta': a rare sword with five Primary slots.
    putHomeOnlyWeapon(); // the helper that test already builds; lift it to the file's top
    renderPane('w1');
    expect(screen.getByTestId('item-verdict')).toHaveAttribute('data-verdict', 'home');
  });

  it('its actions are for the mouse: off the D-pad, while the bind choice joins it only when asked', () => {
    put(gear('r1', 'ring', 'storm'));
    const { rerender } = renderPane('r1');
    expect(screen.getByTestId('compare-actions')).toHaveAttribute('data-pad-skip');
    expect(screen.getByTestId('bind-prompt').closest('[data-pad-skip]')).not.toBeNull();
    rerender(paneWith('r1', { asked: 'r1' }));
    expect(screen.getByTestId('bind-prompt').closest('[data-pad-skip]')).toBeNull();
    expect(screen.getByTestId('bind-prompt-confirm')).toHaveFocus();
  });
```

  `renderPane(uid, over?)` and `paneWith(uid, over)` are the file's existing render helper split in two (read it: it renders `<ComparePane uid source full locked asked actions go />`); `armed` is no longer a prop. Rewrite the test "a locked item says Unlock, and its Salvage waits; an armed one says Press again" as "a locked item says Unlock, and its Salvage waits" (drop the armed half: plan 02 owns Salvage's label). The test "shows the worn item itself with its lines, a weapon its moveset, and Unequip" keeps its point.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx)`
Expected: FAIL (`verdictOf` is not exported).

- [ ] **Step 3: Implement.** In `ComparePane.tsx`:

```tsx
/** The compare pane's one-line verdict (the pad-first spec, 4), from the engine's comparison. */
export type Verdict = 'up' | 'home' | 'worse' | 'same';

export const VERDICT_TEXT: Record<Verdict, string> = {
  up: 'An upgrade as it comes',
  home: 'Better only as a home for your moveset',
  worse: 'Worse than what you wear',
  same: 'About the same as what you wear',
};

/**
 * A bag item's verdict, read as its tile's mark is (`deltaMark`): `cmp` its Power change (a
 * weapon's as a home for your moveset), `asIs` a weapon's as it comes. Null without a comparison
 * (a worn item).
 */
export function verdictOf(
  cmp: Pick<ItemComparison, 'powerPct'> | null,
  asIs: Pick<ItemComparison, 'powerPct'> | null,
): Verdict | null {
  if (!cmp) return null;
  const mark = deltaMark(cmp.powerPct, asIs?.powerPct);
  return mark === 'up' ? 'up' : mark === 'potential' ? 'home' : mark === 'down' ? 'worse' : 'same';
}
```

  (`deltaMark` from `../../ItemTile`, `ItemComparison` from `@alloy/engine`.) In the render: the scroll body `div` (`k-scroll flex min-h-0 flex-1 flex-col gap-4`) gains `data-pad-scroll`; its first child, before the heading, is

```tsx
        {verdict && (
          <p
            className="k-disp text-[24px]"
            style={{ color: verdict === 'up' ? 'var(--k-ok)' : verdict === 'home' ? 'var(--k-mana)' : 'var(--k-text-2)' }}
            data-testid="item-verdict"
            data-verdict={verdict}
          >
            {VERDICT_TEXT[verdict]}
          </p>
        )}
```

  with `const verdict = inBag ? verdictOf(cmp, asIs) : null;`. The colours are the bag's (▲ green, ◇ the mana cyan): check `var(--k-mana)` is the token the ◇ glyph uses in `glyph-art.ts`, and use that one. The actions `div` (`compare-actions`) gains `data-pad-skip`. The `armed` prop goes (plan 02 rewrites Salvage's label; until then the label is the "Salvage · price" branch). The doc comment gains: "It leads with the verdict (`verdictOf`); its actions are the mouse's (`data-pad-skip`: the footer's A / X / Y act on the focused tile under the pad); its body scrolls on the right stick (`data-pad-scroll`)."

  In `BindChoice.tsx` the root `div` gains `data-pad-skip={ask ? undefined : ''}` and the doc comment: "Off the D-pad until an Equip asks (`ask`): then Bind takes the focus."

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/loadout
git commit -m "feat(client): the compare pane leads with a verdict, its actions off the D-pad"
```

---

### Task 4: the right stick scrolls the detail pane

**Files:**
- Modify: `packages/client/src/features/gamepad/use-gamepad-nav.ts`
- Test: `packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts`

Nothing in the menus reads the right stick today (`state.right` is read only by `arena-pad.ts` and `useArenaCore.ts`), so this is new.

- [ ] **Step 1: Write the failing test.** In the `describe('the pad outside combat: …')` harness, make the axes a `let` like `down` (`let axes = [0, 0, 0, 0];`, reset in `beforeEach`, and `axes: [...axes]` in `pad()`), then add:

```ts
  it("the right stick scrolls the topmost scope's [data-pad-scroll] pane, by its tilt and the time, never the focus", () => {
    const button = el('button');
    button.focus();
    const page = el('div', { 'data-pad-scroll': '' });
    const sheet = el('div', { 'data-pad-scope': '' });
    const pane = el('div', { 'data-pad-scroll': '' }, sheet);
    const by: number[] = [];
    pane.scrollBy = ((o: ScrollToOptions) => by.push(o.top ?? 0)) as typeof pane.scrollBy;
    page.scrollBy = (() => by.push(NaN)) as typeof page.scrollBy;
    axes = [0, 0, 0, 1]; // full tilt down
    tick();
    tick();
    axes = [0, 0, 0, -1];
    tick();
    axes = [0, 0, 0, 0];
    tick();
    // 16 ms a frame at STICK_SCROLL_PX a second, down twice then up once; only the sheet's pane.
    const step = (STICK_SCROLL_PX * 16) / 1000;
    expect(by.map((v) => Math.round(v))).toEqual([step, step, -step].map(Math.round));
    expect(document.activeElement).toBe(button);
  });
```

  (`STICK_SCROLL_PX` imported from `../use-gamepad-nav`.) The deadzone rescales a full tilt to 1, so a full tilt scrolls at the full rate.

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/gamepad/__tests__/use-gamepad-nav.test.ts -t "right stick")`
Expected: FAIL (`STICK_SCROLL_PX` is not exported).

- [ ] **Step 3: Implement.** In `use-gamepad-nav.ts`:

```ts
/** How far the right stick scrolls a detail pane at full tilt (px a second, before the UI's zoom). */
export const STICK_SCROLL_PX = 1400;
```

  In `useGamepadNav`'s loop keep the last frame's time (`let last = 0;` beside `stickArmed`) and, before `keepFocus()`:

```ts
      // The right stick scrolls the topmost scope's detail pane (the grammar: never the focus).
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (state.right.y !== 0 && dt > 0)
        scopedLast('[data-pad-scroll]')?.scrollBy?.({ top: state.right.y * STICK_SCROLL_PX * dt });
```

  The file's header comment gains: "The right stick scrolls the topmost scope's `[data-pad-scroll]` pane (`STICK_SCROLL_PX`); it never moves the focus." The first frame's `dt` is 0 (no scroll), which the test's first `tick()` in `beforeEach` absorbs.

- [ ] **Step 4: Run it**

Run: `(cd packages/client && npx vitest run src/features/gamepad/__tests__/use-gamepad-nav.test.ts)`
Expected: PASS (the whole file).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/gamepad
git commit -m "feat(client): the right stick scrolls the topmost scope's detail pane"
```

---

### Task 5: the footer acts on the focused tile; R3 Full compare; the doll; the take sheet

**Files:**
- Modify: `packages/client/src/features/delve/kit/types.ts` (`Prompt.tutorial`), `packages/client/src/features/delve/kit/glyphs.tsx` (`PromptBar` draws it)
- Modify: `packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/EquippedPane.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/BagPane.tsx` (A under the pad takes, `onTake`)
- Create: `packages/client/src/features/delve/hub/loadout/TakeSheet.tsx`
- Test: `LoadoutTab.test.tsx`, `EquippedPane.test.tsx`, `kit/__tests__/glyphs.test.tsx`, `loadout/__tests__/TakeSheet.test.tsx` (new)

- [ ] **Step 1: Write the failing tests.** In `glyphs.test.tsx`: `it("the prompt bar puts a prompt's guided-start target on its item", …)` renders `<PromptBar prompts={[{ id: 'equip', label: 'Equip', binding: { pad: 'a' }, tutorial: 'loadout.equip' }]} />` and expects `screen.getByText('Equip').closest('.k-prompt')` to have `data-tutorial="loadout.equip"`.

  In `LoadoutTab.test.tsx`, replace the prompts test and the two pad tests ("under the pad the actions take the selected item only…" keeps its point; "under the pad RT jumps…" goes), and the held Full compare test:

```tsx
  it('sets its prompts in the grammar (A, X, Y, R3), only Select and Full compare when paused, and clears them when it goes', () => {
    const { props, unmount } = open();
    expect(prompts(props).map((x) => [x.id, x.label, x.binding])).toEqual([
      ['select', 'Select', { mouse: 'click', pad: 'a' }],
      ['equip', 'Equip', { mouse: 'rmb', pad: 'a' }],
      ['salvage', 'Salvage', { key: 'Delete', pad: 'x' }],
      ['lock', 'Lock', { key: 'KeyL', pad: 'y' }],
      ['compare', 'Full compare', { key: ['ShiftLeft', 'ShiftRight'], pad: 'rs' }],
    ]);
    expect(prompts(props).some((x) => x.id === 'to-actions' || x.id === 'to-bag')).toBe(false);
    unmount();
    expect(props.setPrompts).toHaveBeenLastCalledWith([]);
    const paused = open({ mode: 'pause' }).props;
    expect(prompts(paused).map((x) => x.id)).toEqual(['select', 'compare']);
  });

  it('under the pad one A prompt names what A does on the focused tile, and carries the guided-start target', () => {
    put(gear('h1', 'helm'), rareSword('w1'));
    const { props } = open();
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    act(() => tile('h1').focus());
    expect(prompts(props).filter((x) => x.binding.pad === 'a').map((x) => [x.label, x.tutorial])).toEqual([
      ['Equip', 'loadout.equip'],
    ]);
    expect(prompt(props, 'salvage').tutorial).toBe('loadout.salvage');
    // A bag weapon that can take your moveset: A opens the take sheet, the prompt says so.
    act(() => tile('w1').focus());
    expect(prompts(props).filter((x) => x.binding.pad === 'a').map((x) => [x.label, x.tutorial])).toEqual([
      ['Equip or transfer', 'loadout.transfer'],
    ]);
    // Under the keys no prompt carries a target: the pane's buttons do.
    act(() => useInputDeviceStore.getState().setDevice('keyboard'));
    expect(prompts(props).every((x) => x.tutorial === undefined)).toBe(true);
  });

  it('on a worn tile X unequips and A only selects', () => {
    const { props } = open();
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    act(() => screen.getByTestId('slot-weapon').focus());
    // Focus selects a worn item under the pad: the pane shows it.
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('Equipped · your weapon');
    expect(prompts(props).filter((x) => x.binding.pad === 'a').map((x) => x.label)).toEqual(['Select']);
    expect(prompt(props, 'salvage').label).toBe('Unequip');
    act(() => prompt(props, 'salvage').onPress!());
    expect(store().profile.equipped.weapon).toBeUndefined();
  });

  it('a locked item turns X off (it says Locked), and Y unlocks it', () => {
    put(gear('h1', 'helm'));
    const { props } = open({ link: { tab: 'loadout', uid: 'h1' } });
    act(() => prompt(props, 'lock').onPress!());
    expect(prompt(props, 'salvage').disabled).toBe(true);
    act(() => prompt(props, 'salvage').onPress?.());
    expect(store().profile.bag).toHaveLength(1);
  });

  it('R3 (or Shift) toggles Full compare: every stat line and a weapon\'s moveset', () => {
    put(rareSword('w1'));
    const { props } = open({ link: { tab: 'loadout', uid: 'w1' } });
    expect(screen.queryByTestId('item-moveset')).toBeNull();
    act(() => prompt(props, 'compare').onPress!());
    expect(screen.getByTestId('item-moveset')).toBeInTheDocument();
    act(() => prompt(props, 'compare').onPress!());
    expect(screen.queryByTestId('item-moveset')).toBeNull();
  });

  it('under the pad A on a bag weapon that can take your moveset opens the take sheet; any other item equips', () => {
    put(gear('h1', 'helm'), rareSword('w1'));
    open();
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    fireEvent.click(tile('h1')); // A presses the focused tile
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    fireEvent.click(tile('w1'));
    expect(screen.getByTestId('take-sheet')).toBeInTheDocument();
    expect(store().profile.equipped.weapon?.uid).not.toBe('w1');
  });
```

  `EquippedPane.test.tsx`: the test "a worn tile shows its card on hover, and a click selects it" keeps its hover half under the keys and gains: under the pad (`useInputDeviceStore.setState({ device: 'gamepad' })`), focusing `slot-helm`'s tile calls `onSelect` with its uid and no tooltip card shows (`screen.queryByRole('tooltip')` is null); and `mana-strip` and the moveset's "Skills ›" each sit in `[data-pad-skip]`.

  New `TakeSheet.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { defaultMoveset, generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { getDelveRegistry } from '../../../registry';
import { TakeSheet } from '../TakeSheet';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const rareSword = (uid: string, slots = {}): GearItem => {
  const w = generateItem(registry, { uid, ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' }, new SeededRNG(4));
  return { ...w, moveset: defaultMoveset(registry, w, 'fire', slots) };
};

describe('TakeSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile({ ...armed(store().profile), scrap: 500 });
    store().setProfile({ ...store().profile, bag: [rareSword('w1')] });
  });

  it('offers Equip as it is and Transfer with their Power and the price; Transfer carries the guided-start target', () => {
    render(<TakeSheet uid="w1" onClose={vi.fn()} />);
    expect(screen.getByTestId('take-equip')).toHaveTextContent(/Equip as it is · [+−]\d/);
    expect(screen.getByTestId('take-transfer')).toHaveTextContent(/Transfer my moveset here · .*scrap/);
    expect(screen.getByTestId('take-transfer')).toHaveAttribute('data-tutorial', 'loadout.transfer');
  });

  it('Transfer moves your moveset onto it and wears it; Equip wears it as it is; each closes the sheet', () => {
    const onClose = vi.fn();
    const before = store().profile.equipped.weapon!;
    render(<TakeSheet uid="w1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('take-transfer'));
    expect(store().profile.equipped.weapon?.uid).toBe('w1');
    expect(store().profile.equipped.weapon?.moveset?.chains.primary).toEqual(before.moveset!.chains.primary);
    expect(onClose).toHaveBeenCalled();
  });

  it('focuses the better of the two first', () => {
    render(<TakeSheet uid="w1" onClose={vi.fn()} />);
    const focused = document.activeElement as HTMLElement;
    expect(['take-equip', 'take-transfer']).toContain(focused.dataset.testid);
  });
});
```

  (The third test's exact pick depends on the generated sword's numbers; after implementing, read which is better for seed 4 and assert that one by id.) If `transfer`'s `chains.primary` comparison fails because a transfer trims the chain to the target's slots, compare the moves' forms instead, as `ComparePane.test`'s Transfer test does.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout src/features/delve/kit/__tests__/glyphs.test.tsx)`
Expected: FAIL (the old prompts; no `TakeSheet`).

- [ ] **Step 3: Implement.**

  `kit/types.ts`, in `Prompt`:

```ts
  /** The guided-start target the prompt bar puts on this prompt's item (`data-tutorial`): under the pad, the button to press. */
  tutorial?: string;
```

  `PromptBar` adds `data-tutorial={p.tutorial}` to both the `button` and the `span` branch.

  `TakeSheet.tsx`:

```tsx
import type { ReactElement } from 'react';
import { movesetTransfer } from '@alloy/engine';
import { partsText, useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Dialog, Price } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { useItemComparison } from '../../items/useItemComparison';
import { UPGRADE_EPSILON, formatDelta } from '../../format';

/**
 * The pad's take sheet (the pad-first spec, 4, rule 1: a priced action gets a sheet): A on a bag
 * weapon that can take your moveset asks how to take it. Equip as it is, or Transfer my moveset
 * here (the engine's price, and what a transfer leaves); each with its Power change, the better
 * one focused first. The mouse has both in the compare pane.
 */
export function TakeSheet({ uid, onClose }: { uid: string; onClose: () => void }): ReactElement | null {
  const registry = getDelveRegistry();
  const { item, worn, cmp, asIs } = useItemComparison(uid);
  if (!item || !worn || !cmp || !asIs) return null;
  const transfer = movesetTransfer(registry, worn, item);
  const homeFirst = cmp.powerPct > asIs.powerPct && cmp.powerPct > UPGRADE_EPSILON;

  const equip = () => {
    useDelveStore.getState().equip(uid);
    playSound('orbPlace');
    vibrate('medium');
    onClose();
  };
  const move = () => {
    const res = useDelveStore.getState().transfer(uid);
    if (!res.ok) {
      playSound('combineFail');
      showToast(res.reason ?? 'Cannot transfer');
      return;
    }
    playSound('combineMerge');
    vibrate('success');
    const moved = partsText(registry, res.runes, res.destroyed);
    showToast(`Your moveset moved onto ${item.name}${moved ? ` · ${moved}` : ''}`);
    onClose();
  };

  return (
    <Dialog title={`Take ${item.name}`} onClose={onClose} width={640} testId="take-sheet">
      <div className="flex flex-col gap-3">
        <Button variant={homeFirst ? 'secondary' : 'go'} onClick={equip} data-pad-first={homeFirst ? undefined : ''} testId="take-equip">
          Equip as it is · {formatDelta(asIs.powerPct)} Power
        </Button>
        <Button
          variant={homeFirst ? 'go' : 'secondary'}
          className="flex-wrap whitespace-normal"
          onClick={move}
          data-pad-first={homeFirst ? '' : undefined}
          data-tutorial="loadout.transfer"
          testId="take-transfer"
        >
          Transfer my moveset here · <Price scrap={transfer.scrap} /> · {formatDelta(cmp.powerPct)} Power
        </Button>
      </div>
    </Dialog>
  );
}
```

  Move the pane's "Leaves your … behind" and runes notes (`transfer-leaves`, `transfer-runes`) into a small exported `TransferNotes({ worn, item })` in `ComparePane.tsx` and render it under the sheet's Transfer too (one component, two homes).

  `LoadoutTab.tsx`:
  - The `armed`, `inPane`, `pane`, `from` state and refs and the `focusin` effect go (`ARMED_MS` goes in plan 02 with Salvage's rewrite; leave it until then if plan 02 has not run: this task only stops passing `armed` to the pane).
  - `const [full, setFull] = useState(false)` stays; the prompt toggles it.
  - `const [taking, setTaking] = useState<string | null>(null)` and `{taking && <TakeSheet uid={taking} onClose={() => setTaking(null)} />}`.
  - `take(uid)`: if the item is a bag weapon, a weapon is worn, and no bind is asked first (`needsBind` is false), `setTaking(uid)`; else `actions.equip(uid)`. `BagPane` gains `onTake` and calls it (not `onEquip`) on a click under the pad; a right-click still equips.
  - `actions.salvage(uid)`: for a worn item (`found.where === 'equipped'`), unequip (`s.unequip(found.item.slot)`, its "Bag is full" catch as the pane has it) instead.
  - The prompts effect, keyed on `[mode, setPrompts, pad, target, targetLocked, worn, canTake]` where `worn = where === 'equipped'` and `canTake` = `TakeSheet` would open for `target`:

```tsx
    const a: Prompt = pad
      ? {
          id: 'equip',
          label: worn ? 'Select' : canTake ? 'Equip or transfer' : 'Equip',
          binding: { mouse: 'rmb', pad: 'a' },
          tutorial: worn ? undefined : canTake ? 'loadout.transfer' : 'loadout.equip',
        }
      : { id: 'equip', label: 'Equip', binding: { mouse: 'rmb', pad: 'a' } };
    const list: Prompt[] = [
      ...(pad ? [] : [{ id: 'select', label: mode === 'pause' ? 'Inspect' : 'Select', binding: { mouse: 'click', pad: 'a' } } as Prompt]),
      a,
      {
        id: 'salvage',
        label: worn ? 'Unequip' : 'Salvage',
        binding: { key: 'Delete', pad: 'x' },
        onPress: on('salvage'),
        disabled: !target || targetLocked,
        tutorial: pad && !worn ? 'loadout.salvage' : undefined,
      },
      { id: 'lock', label: 'Lock', binding: { key: 'KeyL', pad: 'y' }, onPress: on('lock'), disabled: !target },
      {
        id: 'compare',
        label: 'Full compare',
        binding: { key: ['ShiftLeft', 'ShiftRight'], pad: 'rs' },
        onPress: () => setFull((f) => !f),
      },
    ];
    setPrompts(
      mode === 'pause'
        ? [{ id: 'select', label: 'Inspect', binding: { mouse: 'click', pad: 'a' } }, list.at(-1)!]
        : list,
    );
```

  The test's expected order for the keys (`select, equip, salvage, lock, compare`) is the order given; `orderPrompts` draws them A, A, X, Y, R3 either way. Under the pad, `select` is left out, so A appears once (the Evidence's "A twice" goes). The `disabled` on Lock with no target: Lock's `onPress` already does nothing without one; disabled draws it dim.
  - The doc comment becomes: "The Anvil's Loadout tab: the equipped pane, the bag and the compare pane (430 / flexible / 470 px). The compare pane shows the last hovered bag item (keys and mouse), else the selected or focused one (a worn one too), else the worn weapon. The footer's prompts act on that item: A equips (under the pad, A on a bag weapon that can take your moveset opens the take sheet; on a worn tile A only selects), X salvages a bag item and unequips a worn one, Y locks, R3 or Shift toggles Full compare. Under the pad A and X carry the guided start's targets (`Prompt.tutorial`). In `mode: 'pause'` the item actions give way to notes. Its tile and filter live in the hub's memory."

  `EquippedPane.tsx`: read `const pad = useInputDeviceStore((s) => s.device === 'gamepad')`; each doll tile gains `onFocus={item && pad ? () => onSelect(item.uid) : undefined}` and is wrapped in `ItemTooltip` only while `!pad`; `mana-strip` and the moveset's "Skills ›" button gain `data-pad-skip` (LB/RB reach Skills; the mouse keeps them). Its doc comment says so.

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub src/features/delve/kit)`
Expected: PASS but for plan 02's and plan 03's tests still to change: "a precious item salvages on a second press within 2 s…" and "Salvage asks first for any weapon holding runes…" (plan 02 rewrites them; mark them `.skip` with `// plan 02` now if they fail, and plan 02 removes the skip), and the how-to tests (plan 03).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve
git commit -m "feat(client): the Loadout's footer acts on the focused tile (A / X / Y, R3 Full compare); the take sheet for a weapon by the pad"
```

---

### Task 6: the Loadout's E2E

**Files:**
- Modify: `packages/client/e2e/delve-gamepad.spec.ts` (G08)
- Modify: `packages/client/e2e/delve-pad-nav.spec.ts` (PN02, PN05's comment)
- Read: `packages/client/e2e/delve.spec.ts` (D02 clicks `equip-button` with the mouse: unchanged), `delve-tutorial.spec.ts` (TU01's `l1-equip`: plan 06 owns it, but it must pass now; see Step 3)

- [ ] **Step 1: G08 becomes the take sheet.** Replace its body after `await expect(sheet).toContainText('Selected · compared with your weapon');` with:

```ts
    // The verdict leads the pane, and the footer's A says what it does on this weapon.
    await expect(page.getByTestId('item-verdict')).toBeVisible();
    await expect(page.locator('.k-prompt', { hasText: 'Equip or transfer' })).toBeVisible();
    await expect(page.locator('.k-prompt', { hasText: 'Actions' })).toHaveCount(0);
    // The pane's buttons are the mouse's: right from the bag never lands on them.
    await tap(page, BUTTON.right);
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="compare-actions"]'))).toBe(false);
    await padWalk(page, 'bag-item');
    // A opens the take sheet; A on Transfer moves the moveset onto the axe, which is worn now.
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('take-sheet')).toBeVisible();
    await page.getByTestId('take-transfer').focus();
    await tap(page, BUTTON.a);
    await expect.poll(async () => (await save()).equipped.weapon?.uid).toBe('bag-axe');
    await expect(page.getByTestId('take-sheet')).toHaveCount(0);
    // X on the worn weapon unequips it.
    await page.getByTestId('slot-weapon').focus();
    await expect(sheet).toContainText('Equipped · your weapon');
    await tap(page, BUTTON.x);
    await expect.poll(async () => (await save()).equipped.weapon?.uid).toBeUndefined();
    expect((await save()).bag.map((i: GearItem) => i.uid)).toContain('bag-axe');
```

  and rename the test: "G08: a bag weapon by the pad: A opens the take sheet, Transfer wears it with your moveset; X on the worn weapon unequips". If `padWalk` after a right press lands elsewhere first, read where `right` put the focus (the bag's last column may have no neighbour, leaving it on the axe), and drop the `padWalk` if it is still on the axe.

- [ ] **Step 2: PN02 by the doll.** The compare pane has no stops now, so right from the bag leaves nowhere. Change its first walk to the doll: `await leave(page, 'left', 'tile'); expect((await where(page)).foot).toBe(false); await back(page, 'right', 'tile');` and the test's name: "out of the bag and back lands on the same tile, by the doll and by the footer". PN05's comment "(on the bag: the compare pane's own B, Back to bag, would act)" becomes "(on the bag: B is Undo only while a salvage can be taken back)".

- [ ] **Step 3: Check TU01's `l1-equip` now.** Its lines `await marked('loadout.equip'); … await expect(page.getByTestId('equip-button')).toBeFocused(); await tap(page, BUTTON.a);` become:

```ts
    await marked('loadout.equip');
    await expect(page.getByTestId('item-sheet')).toContainText('Cuirass');
    // Under the pad the marker is on the footer's A; the focus stays on the cuirass's tile.
    await expect(page.locator('[data-testid="bag-item"][aria-pressed="true"]')).toBeFocused();
    await tap(page, BUTTON.a);
```

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx playwright test e2e/delve-gamepad.spec.ts e2e/delve-pad-nav.spec.ts e2e/delve.spec.ts e2e/delve-tutorial.spec.ts --project=desktop)`
Expected: PASS but PN01's `loadout` / `loadout-item` allowances, which may now be lower or different: read every unreversed move the report prints (`NAV_REPORT=1`) and lower the numbers it allows; a rise is a layout bug to fix here (plan 07 sets the ceilings).

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e
git commit -m "test(client): the Loadout's E2E by the take sheet, the doll and the footer's A"
```
