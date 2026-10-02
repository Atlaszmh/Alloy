# Delve UI v1 · Phase 1 · 1C: Item Views Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `packages/client/src/features/delve/ItemDetailSheet.tsx` into the item views under `features/delve/items/` that the spec names (`useItemComparison`, `ItemHeader`, `PowerDelta`, `ItemStatLines`, `CompareTable`, `LegendaryBox`, `MovesetView`), with no visible change to the sheet. The sheet composes them until Phase 3b deletes it; Phase 2's compare pane, 1D's `ItemTooltip` and the Forge bench build on them.

**Architecture:** One file per piece under `features/delve/items/`, each reading the save from `useDelveStore` and the registry from `getDelveRegistry()` as the sheet does today, so a piece needs only the item. `ItemDetailSheet` keeps its state, its actions and its layout, and swaps each block it used to draw for the piece that now draws it. Its affix rows stay buttons (Reforge picks one) built from the same `AffixLine` that `ItemStatLines` uses read-only. `CompareTable` is new: the sheet has no table, so it doesn't render one. A before-and-after DOM snapshot proves the split changes no markup but one layout wrapper, and is deleted at the end, because 1A's colours and icons change the markup when the areas merge.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, Vitest 3 (jsdom, Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md` at `fe9a488`, "Phase 1: Foundation", area **1C · Item views** (the seven signatures) and "Contract between the Phase 1 areas" (1C owns `items/` and `ItemDetailSheet.tsx`).

**Base:** branch `ui/p1` at `96d620b` (step 1·0: `kit/types.ts`, the types-only `kit/index.ts` and the `uiStore` scale fields). 1C uses none of them and touches none of their files, so a later 1·0 commit on `ui/p1` changes nothing here. It needs nothing else merged first.

---

## Where the spec left room

- **The sheet's affix rows stay buttons.** `ItemStatLines({ item })` has no Reforge selection, and the sheet's affix rows are buttons Reforge picks. So `ItemStatLines.tsx` also exports `ImplicitLine` and `AffixLine` (one line's text, its "not your element" mark, its PERFECT mark and its quality bar), and the sheet builds its selectable rows from them. `ItemStatLines` itself is the read-only block (implicits, the rule, affixes in plain `div`s) for the tooltip and the compare pane. The sheet doesn't render `ItemStatLines`; it renders the same lines.
- **`CompareTable` is new.** The sheet has no stat table today, so nothing moves into it and the sheet doesn't render it ("no visible change"). It's what 2A's "Full compare" shows: each stat both items give, summed by stat, worn beside this one, coloured by which gives more. It reads labels from `registry.getGearAffix` and values from `formatStat` (minus its label), so it adds nothing to `format.ts`, which 1A owns.
- **`worn`.** `useItemComparison` returns what's worn in the item's slot, or null when the slot is empty or holds the item itself (an equipped item). For a bag weapon that's the equipped weapon, which is what the sheet's Transfer reads. The sheet's other use of the old `worn` (the equipped weapon, for a legendary's "Needs a Defensive") moves into `LegendaryBox`, which reads `profile.equipped.weapon` itself.
- **`asIs`.** Non-null only for a bag weapon while a weapon is worn (today's `twoWays`); `cmp` is then its value as a home (`compareItem`'s default). Every other bag item has `cmp` only, and an equipped item neither.
- **Return types.** `LegendaryBox` returns `ReactElement | null`: null for an item without a legendary power, so callers needn't guard (the spec writes `ReactElement`; `ReactElement | null` is what JSX accepts either way). `MovesetView` keeps `ReactElement` and its callers keep guarding on `item.slot === 'weapon'`, as the sheet does.
- **`PowerDelta`.** `label` heads the row with the sheet's small uppercase line ("As it is"). With `cmp` null it shows a dash in each cell. The sheet keeps its own labels and `compare-as-is` / `compare-home` wrappers, so its markup doesn't change.
- **`ItemHeader` and `size`.** `lg` is today's sheet (72 px tile, `text-xl` name); `md`, the default, is a 56 px tile (`ItemTile`'s default) and a `text-lg` name, for the tooltip and the compare pane. `ItemHeader` is one self-contained row (`flex min-w-0 flex-1 items-start gap-3`). The sheet's header row keeps its close button beside it, so the sheet gains that one wrapper `div` around the tile and the text column. It lays out the same: the inner row takes the old row's free width, with the same 12 px gaps. The snapshot test unwraps exactly that `div` and its closing tag, so the rest of the markup stays checked byte for byte.
- **Colours.** Every piece keeps today's colours (including `RARITY_COLOR` for the name). 1A changes `RARITY_COLOR`'s values and adds `RARITY_TEXT`; switching the name to `RARITY_TEXT` is a visible change, so it is left to 1D or 2A.

## File map

Create (all under `packages/client/src/features/delve/items/`):
- `useItemComparison.ts`: an item by uid, where it is, what's worn in its slot, and its comparisons.
- `PowerDelta.tsx`: Power, Damage and Toughness against what's worn, with an optional label.
- `ItemStatLines.tsx`: the read-only stat block, and `ImplicitLine` / `AffixLine` for the sheet's Reforge rows.
- `LegendaryBox.tsx`: a legendary's power, and "Needs a Defensive" when the weapon lacks its skill.
- `MovesetView.tsx`: a weapon's chains, slots, moves and sockets (moved from the sheet unchanged).
- `ItemHeader.tsx`: the tile, the name, its kind, and its tags (mana, attack, tempo, iLvl, forged, Equipped).
- `CompareTable.tsx`: every stat beside the worn item's.
- `__tests__/comparison.test.tsx`, `__tests__/stat-lines.test.tsx`, `__tests__/MovesetView.test.tsx`, `__tests__/ItemHeader.test.tsx`, `__tests__/CompareTable.test.tsx`: render tests.
- `__tests__/sheet-split.test.tsx` and `__tests__/__snapshots__/sheet-split.test.tsx.snap`: the before-and-after proof (Task 1 creates them, Task 7 deletes them).

Modify:
- `packages/client/src/features/delve/ItemDetailSheet.tsx`: composes the pieces (Tasks 2–5). CRLF in the working tree; Prettier-clean with `--end-of-line auto`.

Never touched: `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx` (it keeps passing unchanged; it's on the never-format list), `format.ts`, `ItemTile.tsx` and `ItemIcon.tsx` (1A's), and every `kit/` file.

## Cross-area needs

None: 1C edits only `items/` and `ItemDetailSheet.tsx`.

For the controller and 1D:
- **1A merging.** 1A changes `RARITY_COLOR`, `ItemIcon`'s drawing and the legacy classes, all of which show up in the sheet's markup. Task 7 deletes the before-and-after snapshot so the merge doesn't break it. No file overlaps.
- **1D's `ItemTooltip`** composes `ItemHeader` (`size` default `md`), `ItemStatLines` and `LegendaryBox` from these files. If 1D puts `ItemTooltip.tsx` under `items/`, it's a new file there; 1C creates no file of that name.
- **Test ids.** `ItemHeader` keeps `item-name`, `item-mana` and `item-tempo`; `ItemStatLines` keeps `item-affix` and `not-your-element` and adds `item-stat-lines`; `LegendaryBox` keeps `legendary-dead`; `MovesetView` keeps `item-moveset` and `moveset-<skill>`; `CompareTable` adds `compare-table` and `compare-row-<stat>`. `item-compare`, `compare-as-is`, `compare-home`, `attune-delta` and `attune-note` stay on the sheet's own wrappers.

## Conventions

The overview's shared conventions (the 4a plan's, with its worktree, never-format and line-ending rules). For this area:
- **Worktree:** `git worktree add ../alloy-ui-1c -b ui/p1-1c 96d620b`, with `node_modules` linked per the shared conventions (the client's `@alloy/engine` junction pointing at `C:/Projects/alloy-ui-1c/packages/engine`), then build the engine once: `(cd packages/engine && pnpm build)`. 1C never edits the engine. Every command below runs from the worktree root, and every commit block starts with `cd /c/Projects/alloy-ui-1c`.
- **Line endings:** `ItemDetailSheet.tsx` is CRLF in the worktree (git stores LF); keep it so (the Edit tool does). The new files are LF.
- **Prettier:** every new file, and `ItemDetailSheet.tsx`, is formatted with `npx prettier --end-of-line auto --write` (the sheet is clean that way at the base, and the edits below keep it clean). The code below is already formatted.
- **Snapshots:** run Vitest without `-u` and without `CI` set. Task 1 writes the snapshot file; after that a snapshot that changes is a failure, never something to update.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| The item views and the sheet's tests | `(cd packages/client && npx vitest run src/features/delve/items src/features/delve/__tests__/ItemDetailSheet.test.tsx)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(pnpm -F @alloy/client build)` |

**Measured at the base (`96d620b`):** the client suite is 881 tests in 99 files, and the typecheck is clean. The counts below were measured on a scratch copy of the base with each task applied in order. If `ui/p1` has gained tests since, add its difference to every count.

## Chunk 1: The record, the comparison, the stat lines

### Task 1: Record the sheet before the split

The proof: the sheet's text and markup for four items (a bag helm off the pair with a perfect line, a bag weapon valued two ways with its moveset, a legendary that needs a Defensive, and the equipped weapon), recorded now and checked by every task after. `useId`'s ids are blanked, because they count every render in the file.

**Files:**
- Create: `packages/client/src/features/delve/items/__tests__/sheet-split.test.tsx`
- Create (written by Vitest): `packages/client/src/features/delve/items/__tests__/__snapshots__/sheet-split.test.tsx.snap`

- [ ] **Step 1: Write the record**

Create `packages/client/src/features/delve/items/__tests__/sheet-split.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { defaultMoveset, generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { ItemDetailSheet } from '../../ItemDetailSheet';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';

// The sheet before and after its split into items/*: Task 1 records it, Tasks 2-6 keep it,
// and Task 7 deletes this file (1A's colours and icons change the markup when they merge).
const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
/** The markup, with `useId`'s ids (which count every render in the file) blanked. */
const html = (el: Element) => el.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_');

/** A rare Fire sword with an extra Primary slot. */
const sword = (): GearItem => {
  const w = generateItem(
    registry,
    { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(4),
  );
  return { ...w, moveset: defaultMoveset(registry, w, 'fire', { primary: 2 }) };
};
/** A magic Frost helm (off the pair) with a perfect Fire line and a Frost one. */
const helm = (): GearItem => ({
  ...generateItem(
    registry,
    { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'frost' },
    new SeededRNG(4),
  ),
  affixes: [
    { stat: 'fireAttune', value: 2, roll: 0.95 },
    { stat: 'frostAttune', value: 2, roll: 0.4 },
  ],
});
/** Legendary boots whose power needs a Defensive the starting sword doesn't carry. */
const boots = (): GearItem => ({
  ...generateItem(
    registry,
    { uid: 'b1', ilvl: 3, rarity: 'legendary', slot: 'boots', mana: 'fire' },
    new SeededRNG(4),
  ),
  legendary: { id: 'nightstalker', value: 30, roll: 0.5 },
});

describe('ItemDetailSheet, before and after the split', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile({ ...store().profile, bag: [helm(), sword(), boots()] });
  });

  it.each([
    ['a bag helm', 'h1'],
    ['a bag weapon', 'w1'],
    ['a legendary', 'b1'],
    ['the equipped weapon', 'equipped'],
  ])('%s keeps its text and markup', (_name, uid) => {
    const id = uid === 'equipped' ? store().profile.equipped.weapon!.uid : uid;
    const { container } = render(
      <ItemDetailSheet uid={id} onClose={() => {}} onBuild={() => {}} />,
    );
    expect(container.textContent).toMatchSnapshot('text');
    expect(html(container)).toMatchSnapshot('html');
  });
});
```

- [ ] **Step 2: Run it to write the record**

Run: `(cd packages/client && npx vitest run src/features/delve/items)`
Expected: PASS, 4 tests, `Snapshots 8 written`. Run it again: PASS with nothing written.

Check the record covers what it should: `grep -c "" packages/client/src/features/delve/items/__tests__/__snapshots__/sheet-split.test.tsx.snap` prints 17. The four `text 1` entries start `"Rusty HelmMagic Rusty Helm · Helm❄️ Frost +1 · not your element`, `"Ember ThirstRare Rusty Sword · Weapon🔥 Fire +2⚔️ Melee`, `"BedrockLegendary Rusty Greaves · Boots🔥 Fire +3` (and contain `Needs a Defensive: your weapon doesn't carry one.`) and `"Rusty SwordCommon Rusty Sword · Weapon🔥 Fire +1⚔️ Melee` (and contain `Equipped`).

- [ ] **Step 3: The whole client**

Run: `(cd packages/client && npx vitest run)` and `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 885 tests pass (100 files); no type errors.

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/alloy-ui-1c
(cd packages/client && npx prettier --end-of-line auto --write src/features/delve/items/__tests__/sheet-split.test.tsx)
git add packages/client/src/features/delve/items/__tests__/sheet-split.test.tsx packages/client/src/features/delve/items/__tests__/__snapshots__/sheet-split.test.tsx.snap
git commit -m "test(client): record the item sheet's text and markup before its split" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: `useItemComparison` and `PowerDelta`

The comparison moves out of the sheet into a hook, and the Power / Damage / Toughness row into `PowerDelta`.

**Files:**
- Create: `packages/client/src/features/delve/items/useItemComparison.ts`
- Create: `packages/client/src/features/delve/items/PowerDelta.tsx`
- Create: `packages/client/src/features/delve/items/__tests__/comparison.test.tsx`
- Modify: `packages/client/src/features/delve/ItemDetailSheet.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/features/delve/items/__tests__/comparison.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import {
  compareItem,
  generateItem,
  referenceDepth,
  SeededRNG,
  type GearItem,
  type ItemComparison,
} from '@alloy/engine';
import { useItemComparison } from '../useItemComparison';
import { PowerDelta } from '../PowerDelta';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const item = (uid: string, slot: 'weapon' | 'helm', baseId?: string): GearItem =>
  generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'rare', slot, ...(baseId ? { baseId } : {}), mana: 'fire' },
    new SeededRNG(4),
  );

describe('useItemComparison', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile({
      ...store().profile,
      bag: [item('w1', 'weapon', 'sword'), item('h1', 'helm')],
    });
  });

  it('values a bag weapon, while armed, as a home and as it is, against the worn one', () => {
    const p = store().profile;
    const depth = referenceDepth(p);
    const { result } = renderHook(() => useItemComparison('w1'));
    expect(result.current.item?.uid).toBe('w1');
    expect(result.current.where).toBe('bag');
    expect(result.current.worn).toBe(p.equipped.weapon);
    expect(result.current.cmp).toEqual(compareItem(p.equipped, p.bag[0], registry, depth, p.pair));
    expect(result.current.asIs).toEqual(
      compareItem(p.equipped, p.bag[0], registry, depth, p.pair, 'asIs'),
    );
  });

  it('a bag helm over an empty slot has one comparison and nothing worn', () => {
    const { result } = renderHook(() => useItemComparison('h1'));
    expect(result.current.worn).toBeNull();
    expect(result.current.cmp?.replaced).toBeUndefined();
    expect(result.current.cmp!.powerPct).toBeGreaterThan(0);
    expect(result.current.asIs).toBeNull();
  });

  it('an equipped item has no comparison, and no uid finds nothing', () => {
    const uid = store().profile.equipped.weapon!.uid;
    const { result } = renderHook(() => useItemComparison(uid));
    expect(result.current).toMatchObject({ where: 'equipped', worn: null, cmp: null, asIs: null });
    expect(renderHook(() => useItemComparison(null)).result.current).toEqual({
      item: null,
      worn: null,
      where: null,
      cmp: null,
      asIs: null,
    });
    expect(renderHook(() => useItemComparison('gone')).result.current.item).toBeNull();
  });
});

describe('PowerDelta', () => {
  const cmp = { powerPct: 0.12, dpsPct: -0.04, ehpPct: 0 } as ItemComparison;

  it('shows Power, Damage and Toughness, each with its arrow and colour', () => {
    render(<PowerDelta cmp={cmp} />);
    expect(document.body).toHaveTextContent('Power▲ +12%Damage▼ −4%Toughness ±0%');
    expect(screen.getByText('+12%', { exact: false })).toHaveStyle({ color: '#4ade80' });
    expect(screen.getByText('−4%', { exact: false })).toHaveStyle({ color: '#f87171' });
  });

  it('heads the row with its label, and shows dashes with nothing to compare', () => {
    render(<PowerDelta cmp={null} label="As it is" />);
    expect(document.body).toHaveTextContent('As it isPower—Damage—Toughness—');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/items/__tests__/comparison.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../useItemComparison" from "src/features/delve/items/__tests__/comparison.test.tsx". Does the file exist?`

- [ ] **Step 3: The hook, `PowerDelta`, and the sheet on them**

Create `packages/client/src/features/delve/items/useItemComparison.ts`:

```ts
import { useMemo } from 'react';
import {
  compareItem,
  findItem,
  referenceDepth,
  type GearItem,
  type ItemComparison,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';

/**
 * An item of the save by uid, where it is, what's worn in its slot (null when
 * the slot is empty or holds the item itself), and how equipping it would
 * change the hero. A bag weapon, while armed, is valued twice: `cmp` as a home
 * for your moveset (`compareItem`'s default) and `asIs` as it is, which is
 * what Equip does; every other item has `asIs` null. An equipped item has no
 * comparison.
 */
export function useItemComparison(uid: string | null): {
  item: GearItem | null;
  worn: GearItem | null;
  where: 'bag' | 'equipped' | null;
  cmp: ItemComparison | null;
  asIs: ItemComparison | null;
} {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const found = uid ? findItem(profile, uid) : null;
  const item = found?.item ?? null;
  const where = found?.where ?? null;
  const inSlot = item ? (profile.equipped[item.slot] ?? null) : null;
  const worn = inSlot && inSlot.uid !== item?.uid ? inSlot : null;
  const depth = referenceDepth(profile);
  const inBag = where === 'bag';
  const twoWays = inBag && item?.slot === 'weapon' && !!worn;
  const cmp = useMemo(
    () =>
      item && inBag ? compareItem(profile.equipped, item, registry, depth, profile.pair) : null,
    [item, inBag, profile.equipped, profile.pair, registry, depth],
  );
  const asIs = useMemo(
    () =>
      item && twoWays
        ? compareItem(profile.equipped, item, registry, depth, profile.pair, 'asIs')
        : null,
    [item, twoWays, profile.equipped, profile.pair, registry, depth],
  );
  return { item, worn, where, cmp, asIs };
}
```

Create `packages/client/src/features/delve/items/PowerDelta.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { ItemComparison } from '@alloy/engine';
import { UPGRADE_EPSILON, formatDelta } from '../format';

/**
 * Power, Damage and Toughness against what's worn, under `label` when given;
 * with no comparison, dashes.
 */
export function PowerDelta({
  cmp,
  label,
}: {
  cmp: ItemComparison | null;
  label?: string;
}): ReactElement {
  const row = (
    <div className="flex">
      <DeltaCell label="Power" value={cmp ? cmp.powerPct : null} />
      <DeltaCell label="Damage" value={cmp ? cmp.dpsPct : null} />
      <DeltaCell label="Toughness" value={cmp ? cmp.ehpPct : null} />
    </div>
  );
  if (!label) return row;
  return (
    <>
      <div className="text-center text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
      {row}
    </>
  );
}

function DeltaCell({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  const color = v > UPGRADE_EPSILON ? '#4ade80' : v < -UPGRADE_EPSILON ? '#f87171' : '#a8a29e';
  const arrow = v > UPGRADE_EPSILON ? '▲' : v < -UPGRADE_EPSILON ? '▼' : '';
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-stone-400">{label}</span>
      <span className="delve-display text-base font-bold" style={{ color }}>
        {value === null ? (
          '—'
        ) : (
          <>
            {arrow} {formatDelta(value)}
          </>
        )}
      </span>
    </div>
  );
}
```

In `packages/client/src/features/delve/ItemDetailSheet.tsx`:

Replace:

```tsx
  carriedSkills,
  compareItem,
  findItem,
  inPair,
```

with:

```tsx
  carriedSkills,
  inPair,
```

Replace:

```tsx
  reattuneCost,
  referenceDepth,
  reforgeCost,
```

with:

```tsx
  reattuneCost,
  reforgeCost,
```

Replace:

```tsx
  type HeroStatKey,
  type ItemComparison,
  type ManaType,
```

with:

```tsx
  type HeroStatKey,
  type ManaType,
```

Replace:

```tsx
import { ItemSockets } from './runes/ItemSockets';
```

with:

```tsx
import { ItemSockets } from './runes/ItemSockets';
import { useItemComparison } from './items/useItemComparison';
import { PowerDelta } from './items/PowerDelta';
```

Replace:

```tsx
  UPGRADE_EPSILON,
  formatDelta,
  formatNumber,
```

with:

```tsx
  UPGRADE_EPSILON,
  formatNumber,
```

Delete the lines from `/** Power, Damage and Toughness against what's worn. */` up to (not including) `function qualityColor(roll: number): string {`.

Replace the lines from `const found = findItem(profile, uid);` up to (not including) `// Your chains the target can't carry stay behind (their extra slots come back as Links).` with:

```tsx
  // A bag weapon, while armed, is valued twice: as it is (`asIs`), and as a home for your moveset.
  const { item, worn, where, cmp, asIs } = useItemComparison(uid);
  const isEquipped = where === 'equipped';
  const transfer = item && worn && asIs ? movesetTransfer(registry, worn, item) : null;
```

Replace:

```tsx
    item && transfer
      ? carriedSkills(registry, worn!.rarity).filter(
```

with:

```tsx
    item && worn && transfer
      ? carriedSkills(registry, worn.rarity).filter(
```

Replace:

```tsx
  const dead = !!needs && !carriedSkills(registry, worn?.rarity ?? null).includes(needs);
```

with:

```tsx
  const dead =
    !!needs && !carriedSkills(registry, profile.equipped.weapon?.rarity ?? null).includes(needs);
```

Replace:

```tsx
                  <DeltaRow cmp={asIs} />
```

with:

```tsx
                  <PowerDelta cmp={asIs} />
```

Replace:

```tsx
                <div data-testid="compare-home">
                  <DeltaRow cmp={cmp} />
```

with:

```tsx
                <div data-testid="compare-home">
                  <PowerDelta cmp={cmp} />
```

Replace:

```tsx
              <DeltaRow cmp={cmp} />
```

with:

```tsx
              <PowerDelta cmp={cmp} />
```

(`worn` used to be the equipped weapon for every item. It is now what's worn in the item's slot, so the legendary's "Needs a Defensive" reads the equipped weapon itself; the record's legendary checks it.)

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/client && npx vitest run src/features/delve/items src/features/delve/__tests__/ItemDetailSheet.test.tsx)`
Expected: PASS, 36 tests in 3 files, with no snapshot written or failed.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx vitest run)` and `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 890 tests pass (101 files); no type errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-ui-1c
(cd packages/client && npx prettier --end-of-line auto --write src/features/delve/items/useItemComparison.ts src/features/delve/items/PowerDelta.tsx src/features/delve/items/__tests__/comparison.test.tsx src/features/delve/ItemDetailSheet.tsx)
git add packages/client/src/features/delve/items/useItemComparison.ts packages/client/src/features/delve/items/PowerDelta.tsx packages/client/src/features/delve/items/__tests__/comparison.test.tsx packages/client/src/features/delve/ItemDetailSheet.tsx
git commit -m "refactor(client): useItemComparison and PowerDelta, out of the item sheet" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: `ItemStatLines` and `LegendaryBox`

The stat lines and the legendary box move out. The sheet keeps its Reforge rows as buttons, built from `ImplicitLine` and `AffixLine`.

**Files:**
- Create: `packages/client/src/features/delve/items/ItemStatLines.tsx`
- Create: `packages/client/src/features/delve/items/LegendaryBox.tsx`
- Create: `packages/client/src/features/delve/items/__tests__/stat-lines.test.tsx`
- Modify: `packages/client/src/features/delve/ItemDetailSheet.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/features/delve/items/__tests__/stat-lines.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { defaultMoveset, generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { ItemStatLines } from '../ItemStatLines';
import { LegendaryBox } from '../LegendaryBox';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const helm = (implicits: GearItem['implicits'], affixes: GearItem['affixes']): GearItem => ({
  ...generateItem(
    registry,
    { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'fire' },
    new SeededRNG(4),
  ),
  implicits,
  affixes,
});

describe('ItemStatLines', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('lists the implicits, a rule, then each affix with its quality bar and a PERFECT mark', () => {
    const { container } = render(
      <ItemStatLines
        item={helm(
          [{ stat: 'armor', value: 7, roll: 0.5 }],
          [
            { stat: 'critChance', value: 3, roll: 0.95 },
            { stat: 'maxHp', value: 18, roll: 0.4 },
          ],
        )}
      />,
    );
    expect(screen.getByTestId('item-stat-lines')).toHaveTextContent(
      '+7 Armor+3% Crit ChancePERFECT+18 Max Life',
    );
    expect(container.querySelectorAll('.h-px')).toHaveLength(1);
    const affixes = screen.getAllByTestId('item-affix');
    expect(affixes).toHaveLength(2);
    expect(affixes[1].querySelector('.delve-quality span')).toHaveStyle({ width: '40%' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('greys attunement outside the pair, and draws no rule without both kinds', () => {
    const { container } = render(
      <ItemStatLines
        item={helm(
          [],
          [
            { stat: 'fireAttune', value: 2, roll: 0.5 },
            { stat: 'frostAttune', value: 2, roll: 0.5 },
          ],
        )}
      />,
    );
    expect(screen.getAllByTestId('not-your-element')).toHaveLength(1);
    expect(screen.getAllByTestId('item-affix')[1]).toHaveTextContent(
      '+2 Frost Attunementnot your element',
    );
    expect(container.querySelectorAll('.h-px')).toHaveLength(0);
  });
});

describe('LegendaryBox', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  const boots = (): GearItem => ({
    ...generateItem(
      registry,
      { uid: 'b1', ilvl: 3, rarity: 'legendary', slot: 'boots', mana: 'fire' },
      new SeededRNG(4),
    ),
    legendary: { id: 'nightstalker', value: 30, roll: 0.5 },
  });

  it("names the power and says the skill it needs that the equipped weapon doesn't carry", () => {
    render(<LegendaryBox item={boots()} />);
    expect(document.body).toHaveTextContent(`★ ${registry.getLegendary('nightstalker').name}`);
    expect(document.body).toHaveTextContent('+30% Shadow damage');
    expect(screen.getByTestId('legendary-dead')).toHaveTextContent(
      "Needs a Defensive: your weapon doesn't carry one.",
    );
  });

  it('says nothing more once a weapon carries it, and renders nothing for other gear', () => {
    const p = store().profile;
    const w = generateItem(
      registry,
      { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(4),
    );
    const rare = { ...w, moveset: defaultMoveset(registry, w, 'fire') };
    store().setProfile({ ...p, equipped: { ...p.equipped, weapon: rare } });
    const { container, rerender } = render(<LegendaryBox item={boots()} />);
    expect(screen.queryByTestId('legendary-dead')).toBeNull();
    rerender(<LegendaryBox item={helm([], [])} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/items/__tests__/stat-lines.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../ItemStatLines" from "src/features/delve/items/__tests__/stat-lines.test.tsx". Does the file exist?`

- [ ] **Step 3: The stat lines, the legendary box, and the sheet on them**

Create `packages/client/src/features/delve/items/ItemStatLines.tsx`:

```tsx
import type { ReactElement } from 'react';
import {
  attuneElement,
  inPair,
  itemStatLines,
  type GearItem,
  type HeroStatKey,
  type ItemStatLine,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { formatStat } from '../format';

/** Whether a stat line attunes an element outside the pair: it grants nothing. */
function useOffPair(stat: HeroStatKey): boolean {
  const pair = useDelveStore((s) => s.profile.pair);
  const el = attuneElement(stat);
  return !!el && !inPair({ pair }, el);
}

function qualityColor(roll: number): string {
  if (roll >= 0.9) return '#fbbf24';
  if (roll >= 0.6) return '#4ade80';
  if (roll >= 0.3) return '#60a5fa';
  return '#78716c';
}

/** Marks an attunement line of an element outside the pair: it grants nothing. */
function NotMine() {
  return (
    <span className="ml-1.5 text-[10px] text-stone-500" data-testid="not-your-element">
      not your element
    </span>
  );
}

/** An implicit line, greyed when it attunes outside the pair. */
export function ImplicitLine({ line }: { line: ItemStatLine }) {
  const off = useOffPair(line.stat);
  return (
    <div className="text-sm" style={{ color: off ? '#57534e' : '#d6d3d1' }}>
      {formatStat(getDelveRegistry(), line.stat, line.value)}
      {off && <NotMine />}
    </div>
  );
}

/** An affix line's text, its PERFECT mark and its quality bar, inside the row that holds it. */
export function AffixLine({ line }: { line: ItemStatLine }) {
  const off = useOffPair(line.stat);
  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <span style={{ color: off ? '#57534e' : '#93c5fd' }}>
          {formatStat(getDelveRegistry(), line.stat, line.value)}
          {off && <NotMine />}
        </span>
        {line.roll >= 0.9 && <span className="text-[10px] font-bold text-amber-300">PERFECT</span>}
      </div>
      <div className="delve-quality mt-1">
        <span
          style={{
            width: `${Math.round(line.roll * 100)}%`,
            background: qualityColor(line.roll),
          }}
        />
      </div>
    </>
  );
}

/** An item's stat lines, read-only: its implicits, a rule, then its affixes with their quality. */
export function ItemStatLines({ item }: { item: GearItem }): ReactElement {
  const lines = itemStatLines(item, getDelveRegistry());
  const implicits = lines.filter((l) => l.source === 'implicit');
  const affixes = lines.filter((l) => l.source === 'affix');
  return (
    <div className="space-y-1.5" data-testid="item-stat-lines">
      {implicits.map((l, i) => (
        <ImplicitLine key={`i${i}`} line={l} />
      ))}
      {implicits.length > 0 && affixes.length > 0 && <div className="my-1 h-px bg-white/10" />}
      {affixes.map((l, i) => (
        <div key={`a${i}-${l.stat}`} className="rounded-md px-1.5 py-1" data-testid="item-affix">
          <AffixLine line={l} />
        </div>
      ))}
    </div>
  );
}
```

Create `packages/client/src/features/delve/items/LegendaryBox.tsx`:

```tsx
import type { ReactElement } from 'react';
import { carriedSkills, legendaryNeeds, type ChainSkill, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { legendaryText } from '../format';

/** A legendary power's skill, missing from the weapon (`legendaryNeeds`): "Needs a Defensive". */
const NEEDS_TEXT: Record<ChainSkill, string> = {
  basic: 'Needs a basic chain',
  primary: 'Needs a Primary',
  defensive: 'Needs a Defensive',
  ultimate: 'Needs an Ultimate',
};

/**
 * A legendary's power, and the skill it rides when the equipped weapon doesn't
 * carry it. Nothing for an item with no legendary power.
 */
export function LegendaryBox({ item }: { item: GearItem }): ReactElement | null {
  const registry = getDelveRegistry();
  const weapon = useDelveStore((s) => s.profile.equipped.weapon);
  if (!item.legendary) return null;
  const needs = legendaryNeeds(item.legendary.id);
  const dead = !!needs && !carriedSkills(registry, weapon?.rarity ?? null).includes(needs);
  return (
    <div
      className="mt-2 rounded-lg px-3 py-2 text-sm"
      style={{
        background: 'rgba(251,146,60,0.1)',
        border: '1px solid rgba(251,146,60,0.45)',
        color: '#fed7aa',
      }}
    >
      <div className="delve-display text-xs font-bold uppercase tracking-widest text-orange-400">
        ★ {registry.getLegendary(item.legendary.id).name}
      </div>
      {legendaryText(registry, item.legendary.id, item.legendary.value)}
      {dead && needs && (
        <div className="mt-1 text-xs font-semibold text-amber-200" data-testid="legendary-dead">
          {NEEDS_TEXT[needs]}: your weapon doesn't carry one.
        </div>
      )}
    </div>
  );
}
```

In `packages/client/src/features/delve/ItemDetailSheet.tsx`:

Replace:

```tsx
  CHAIN_SKILLS,
  attuneElement,
  baseDisplayName,
```

with:

```tsx
  CHAIN_SKILLS,
  baseDisplayName,
```

Replace:

```tsx
  itemStatLines,
  legendaryNeeds,
  movesetOf,
```

with:

```tsx
  itemStatLines,
  movesetOf,
```

Replace:

```tsx
  type Blow,
  type ChainSkill,
  type GearItem,
  type HeroStatKey,
  type ManaType,
```

with:

```tsx
  type Blow,
  type GearItem,
  type ManaType,
```

Replace:

```tsx
import { PowerDelta } from './items/PowerDelta';
```

with:

```tsx
import { PowerDelta } from './items/PowerDelta';
import { AffixLine, ImplicitLine } from './items/ItemStatLines';
import { LegendaryBox } from './items/LegendaryBox';
```

Replace:

```tsx
  formatNumber,
  formatStat,
  legendaryText,
  manaStyle,
```

with:

```tsx
  formatNumber,
  manaStyle,
```

Replace the lines from `onBuild?: () => void;` up to (not including) `* A weapon's moveset: each chain it carries with its slots ("Primary 2/5") and` with:

```tsx
  onBuild?: () => void;
}

/**
```

Delete the lines from `function qualityColor(roll: number): string {` up to (not including) `export function ItemDetailSheet({ uid, onClose, onBuild }: ItemDetailSheetProps) {`.

Replace:

```tsx
  const ownMana = inPair(profile, item.mana);
  const notMine = (stat: HeroStatKey) => {
    const el = attuneElement(stat);
    return !!el && !inPair(profile, el);
  };
```

with:

```tsx
  const ownMana = inPair(profile, item.mana);
```

Delete the lines from `// A legendary power tied to a skill the equipped weapon doesn't carry.` up to (not including) `// Your moveset would make the weapon an upgrade (Transfer's mark, as Equip's is as it is).`.

Replace:

```tsx
          {implicits.map((l, i) => (
            <div
              key={`i${i}`}
              className="text-sm"
              style={{ color: notMine(l.stat) ? '#57534e' : '#d6d3d1' }}
            >
              {formatStat(registry, l.stat, l.value)}
              {notMine(l.stat) && <NotMine />}
            </div>
          ))}
```

with:

```tsx
          {implicits.map((l, i) => (
            <ImplicitLine key={`i${i}`} line={l} />
          ))}
```

Replace:

```tsx
                data-testid="item-affix"
              >
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: notMine(l.stat) ? '#57534e' : '#93c5fd' }}>
                    {formatStat(registry, l.stat, l.value)}
                    {notMine(l.stat) && <NotMine />}
                  </span>
                  {l.roll >= 0.9 && (
                    <span className="text-[10px] font-bold text-amber-300">PERFECT</span>
                  )}
                </div>
                <div className="delve-quality mt-1">
                  <span
                    style={{
                      width: `${Math.round(l.roll * 100)}%`,
                      background: qualityColor(l.roll),
                    }}
                  />
                </div>
              </button>
```

with:

```tsx
                data-testid="item-affix"
              >
                <AffixLine line={l} />
              </button>
```

Replace:

```tsx
          {item.legendary && (
            <div
              className="mt-2 rounded-lg px-3 py-2 text-sm"
              style={{
                background: 'rgba(251,146,60,0.1)',
                border: '1px solid rgba(251,146,60,0.45)',
                color: '#fed7aa',
              }}
            >
              <div className="delve-display text-xs font-bold uppercase tracking-widest text-orange-400">
                ★ {registry.getLegendary(item.legendary.id).name}
              </div>
              {legendaryText(registry, item.legendary.id, item.legendary.value)}
              {dead && needs && (
                <div
                  className="mt-1 text-xs font-semibold text-amber-200"
                  data-testid="legendary-dead"
                >
                  {NEEDS_TEXT[needs]}: your weapon doesn't carry one.
                </div>
              )}
            </div>
          )}
```

with:

```tsx
          <LegendaryBox item={item} />
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/client && npx vitest run src/features/delve/items src/features/delve/__tests__/ItemDetailSheet.test.tsx)`
Expected: PASS, 40 tests in 4 files, with no snapshot written or failed.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx vitest run)` and `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 894 tests pass (102 files); no type errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-ui-1c
(cd packages/client && npx prettier --end-of-line auto --write src/features/delve/items/ItemStatLines.tsx src/features/delve/items/LegendaryBox.tsx src/features/delve/items/__tests__/stat-lines.test.tsx src/features/delve/ItemDetailSheet.tsx)
git add packages/client/src/features/delve/items/ItemStatLines.tsx packages/client/src/features/delve/items/LegendaryBox.tsx packages/client/src/features/delve/items/__tests__/stat-lines.test.tsx packages/client/src/features/delve/ItemDetailSheet.tsx
git commit -m "refactor(client): ItemStatLines and LegendaryBox, out of the item sheet" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The moveset, the header, the table

### Task 4: `MovesetView`

The weapon's moveset moves out unchanged, now exported.

**Files:**
- Create: `packages/client/src/features/delve/items/MovesetView.tsx`
- Create: `packages/client/src/features/delve/items/__tests__/MovesetView.test.tsx`
- Modify: `packages/client/src/features/delve/ItemDetailSheet.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/items/__tests__/MovesetView.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { defaultMoveset, generateItem, SeededRNG } from '@alloy/engine';
import { MovesetView } from '../MovesetView';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

describe('MovesetView', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it("lists each chain the weapon carries with its slots and moves, and what it can't carry", () => {
    render(<MovesetView item={store().profile.equipped.weapon!} />);
    expect(screen.getByTestId('item-moveset')).toHaveTextContent(/^Moveset/);
    expect(screen.getByTestId('moveset-basic')).toHaveTextContent(
      'Basic 3/5 · light Fire blow · light Fire blow · heavy Fire blow',
    );
    expect(screen.getByTestId('moveset-primary')).toHaveTextContent(
      'Primary 1/5 · light Fire Bolt',
    );
    expect(screen.getByTestId('moveset-defensive')).toHaveTextContent(
      'Defensive: carried by magic weapons and better',
    );
    expect(screen.getByTestId('item-sockets')).toHaveTextContent('Sockets · up to 1 a move');
  });

  it("shows a rare weapon's Defensive and its extra Primary slot", () => {
    const w = generateItem(
      registry,
      { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(4),
    );
    render(
      <MovesetView item={{ ...w, moveset: defaultMoveset(registry, w, 'fire', { primary: 2 }) }} />,
    );
    expect(screen.getByTestId('moveset-primary')).toHaveTextContent(/^Primary 2\/5 · /);
    expect(screen.getByTestId('moveset-defensive')).toHaveTextContent(/^Defensive 1\/5 · /);
    expect(screen.getByTestId('moveset-ultimate')).toHaveTextContent(
      'Ultimate: carried by epic weapons and better',
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/items/__tests__/MovesetView.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../MovesetView" from "src/features/delve/items/__tests__/MovesetView.test.tsx". Does the file exist?`

- [ ] **Step 3: Move it**

Create `packages/client/src/features/delve/items/MovesetView.tsx`:

```tsx
import { useMemo, type ReactElement } from 'react';
import {
  CHAIN_SKILLS,
  carriedByText,
  carriedSkills,
  movesetOf,
  profileStats,
  resolveChain,
  socketCap,
  type AbilitySlot,
  type Blow,
  type GearItem,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { SKILL_NAME, blowText, chainText, moveText } from '../chains/chain-text';
import { ItemSockets } from '../runes/ItemSockets';

/**
 * A weapon's moveset: each chain it carries with its slots ("Primary 2/5") and
 * moves, named as the chain builder names them ("medium Wildfire Burst").
 */
export function MovesetView({ item }: { item: GearItem }): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  // Only the moves' names are read: the hero's stats resolve them as well as any.
  const stats = useMemo(() => profileStats(registry, profile), [registry, profile]);
  const { chains, slots } = movesetOf(registry, item);
  const cap = registry.getDelveBalance().chains.cap;
  const carried = carriedSkills(registry, item.rarity);
  return (
    <div
      className="delve-panel mt-3 flex flex-col gap-1 px-3 py-2 text-xs"
      data-testid="item-moveset"
    >
      <div className="delve-display text-[11px] font-bold uppercase tracking-widest text-amber-300/80">
        Moveset
      </div>
      {CHAIN_SKILLS.map((s) => {
        const chain = chains[s];
        if (!carried.includes(s) || !chain)
          return (
            <div key={s} className="text-stone-500" data-testid={`moveset-${s}`}>
              {SKILL_NAME[s]}: {carriedByText(registry, s).toLowerCase()}
            </div>
          );
        const names = Array.isArray(chain)
          ? chain.map((b: Blow) => blowText(registry, b))
          : resolveChain(registry, stats, s as AbilitySlot, chain).moves.map(moveText);
        return (
          <div key={s} className="text-stone-300" data-testid={`moveset-${s}`}>
            <b className="text-stone-100">
              {SKILL_NAME[s]} {slots[s]}/{cap[s]}
            </b>{' '}
            · {chainText(names)}
          </div>
        );
      })}
      <ItemSockets chains={chains} cap={socketCap(registry, item.rarity)} />
    </div>
  );
}
```

In `packages/client/src/features/delve/ItemDetailSheet.tsx`:

Replace:

```tsx
import { useMemo, useRef, useState } from 'react';
import {
  CHAIN_SKILLS,
  baseDisplayName,
  carriedByText,
  carriedSkills,
```

with:

```tsx
import { useRef, useState } from 'react';
import {
  baseDisplayName,
  carriedSkills,
```

Replace:

```tsx
  itemStatLines,
  movesetOf,
  movesetTransfer,
  pairElements,
  profileStats,
  reattuneCost,
  reforgeCost,
  resolveChain,
  salvageDust,
  salvageValue,
  socketCap,
  unsocketMode,
  upgradeCost,
  weaponParts,
  type AbilitySlot,
  type Blow,
  type GearItem,
  type ManaType,
```

with:

```tsx
  itemStatLines,
  movesetTransfer,
  pairElements,
  reattuneCost,
  reforgeCost,
  salvageDust,
  salvageValue,
  unsocketMode,
  upgradeCost,
  weaponParts,
  type ManaType,
```

Replace:

```tsx
import { SKILL_NAME, blowText, chainText, moveText } from './chains/chain-text';
import { ItemSockets } from './runes/ItemSockets';
```

with:

```tsx
import { SKILL_NAME } from './chains/chain-text';
```

Replace:

```tsx
import { LegendaryBox } from './items/LegendaryBox';
```

with:

```tsx
import { LegendaryBox } from './items/LegendaryBox';
import { MovesetView } from './items/MovesetView';
```

Replace the lines from `onBuild?: () => void;` up to (not including) `export function ItemDetailSheet({ uid, onClose, onBuild }: ItemDetailSheetProps) {` with:

```tsx
  onBuild?: () => void;
}

```

(The sheet's `{item.slot === 'weapon' && <MovesetView item={item} />}` stays as it is; it now renders the imported one.)

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/client && npx vitest run src/features/delve/items src/features/delve/__tests__/ItemDetailSheet.test.tsx)`
Expected: PASS, 42 tests in 5 files, with no snapshot written or failed.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx vitest run)` and `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 896 tests pass (103 files); no type errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-ui-1c
(cd packages/client && npx prettier --end-of-line auto --write src/features/delve/items/MovesetView.tsx src/features/delve/items/__tests__/MovesetView.test.tsx src/features/delve/ItemDetailSheet.tsx)
git add packages/client/src/features/delve/items/MovesetView.tsx packages/client/src/features/delve/items/__tests__/MovesetView.test.tsx packages/client/src/features/delve/ItemDetailSheet.tsx
git commit -m "refactor(client): MovesetView, out of the item sheet" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: `ItemHeader`

The tile, the name and the tags move into `ItemHeader`, one self-contained row. The sheet keeps its close button beside it, which adds one layout wrapper; the record unwraps exactly that one.

**Files:**
- Create: `packages/client/src/features/delve/items/ItemHeader.tsx`
- Create: `packages/client/src/features/delve/items/__tests__/ItemHeader.test.tsx`
- Modify: `packages/client/src/features/delve/items/__tests__/sheet-split.test.tsx`
- Modify: `packages/client/src/features/delve/ItemDetailSheet.tsx`

- [ ] **Step 1: Write the failing test, and unwrap the header's row in the record**

Create `packages/client/src/features/delve/items/__tests__/ItemHeader.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { ItemHeader } from '../ItemHeader';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const bow = (): GearItem => ({
  ...generateItem(
    registry,
    { uid: 'w1', ilvl: 7, rarity: 'rare', slot: 'weapon', baseId: 'bow', mana: 'frost' },
    new SeededRNG(4),
  ),
  upgrade: 2,
});

describe('ItemHeader', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('names the item, its rarity, base and slot, and tags its mana, attack, tempo, level and forging', () => {
    const item = bow();
    render(<ItemHeader item={item} />);
    expect(screen.getByTestId('item-name')).toHaveTextContent(item.name);
    expect(screen.getByTestId('item-name')).toHaveClass('text-lg');
    expect(screen.getByRole('button', { name: `${item.name}, rare` })).toHaveStyle({
      width: '56px',
    });
    expect(document.body).toHaveTextContent(/Rare .+ · Weapon/);
    expect(screen.getByTestId('item-mana')).toHaveTextContent(/Frost \+\d+ · not your element$/);
    expect(document.body).toHaveTextContent('🎯 Ranged');
    expect(screen.getByTestId('item-tempo')).toHaveTextContent(/^Tempo [\d.]+×: /);
    expect(document.body).toHaveTextContent('iLvl 7');
    expect(document.body).toHaveTextContent('+2 forged');
    expect(document.body).not.toHaveTextContent('Equipped');
  });

  it('at lg, draws the larger tile and name, and marks what is equipped', () => {
    const sword = store().profile.equipped.weapon!;
    render(<ItemHeader item={sword} size="lg" />);
    expect(screen.getByTestId('item-name')).toHaveClass('text-xl');
    expect(screen.getByRole('button', { name: `${sword.name}, common` })).toHaveStyle({
      width: '72px',
    });
    expect(screen.getByTestId('item-mana')).toHaveTextContent(/^🔥 Fire \+1$/);
    expect(document.body).toHaveTextContent('⚔️ Melee');
    expect(document.body).toHaveTextContent('Equipped');
  });
});
```

In `packages/client/src/features/delve/items/__tests__/sheet-split.test.tsx`:

Replace:

```tsx
/** The markup, with `useId`'s ids (which count every render in the file) blanked. */
const html = (el: Element) => el.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_');
```

with:

```tsx
/**
 * The markup, with `useId`'s ids (which count every render in the file) blanked, and
 * `ItemHeader`'s own row unwrapped: it holds the tile and the text column beside the
 * sheet's close button, laid out exactly as they were.
 */
const html = (el: Element) =>
  el.innerHTML
    .replace(/_r_[0-9a-z]+_/g, '_r_')
    .replace('<div class="flex min-w-0 flex-1 items-start gap-3">', '')
    .replace(
      '</div></div></div><button class="delve-btn px-3 py-1 text-sm"',
      '</div></div><button class="delve-btn px-3 py-1 text-sm"',
    );
```

(Before the header moves, neither string occurs in the sheet's markup, so the record still passes.)

- [ ] **Step 2: Run them to see the header's fail**

Run: `(cd packages/client && npx vitest run src/features/delve/items)`
Expected: FAIL in 1 file of 5, no tests there: `Error: Failed to resolve import "../ItemHeader" from "src/features/delve/items/__tests__/ItemHeader.test.tsx". Does the file exist?`; the other 15 tests pass (the record's 4 among them).

- [ ] **Step 3: The header, and the sheet on it**

Create `packages/client/src/features/delve/items/ItemHeader.tsx`:

```tsx
import type { ReactElement } from 'react';
import {
  baseDisplayName,
  findItem,
  inPair,
  itemAffinityAttunement,
  type GearItem,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { ItemTile } from '../ItemTile';
import { RARITY_COLOR, RARITY_LABEL, SLOT_LABEL, manaStyle } from '../format';

const SIZES = {
  md: { tile: 56, name: 'text-lg' },
  lg: { tile: 72, name: 'text-xl' },
} as const;

/**
 * An item's tile, name, rarity, base and slot, then its tags: its mana and the
 * attunement it gives (marked when outside the pair), melee or ranged, a
 * weapon's tempo, item level, forge level, and Equipped.
 */
export function ItemHeader({
  item,
  size = 'md',
}: {
  item: GearItem;
  size?: 'md' | 'lg';
}): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const mana = manaStyle(registry, item.mana);
  const ownMana = inPair(profile, item.mana);
  const isEquipped = findItem(profile, item.uid)?.where === 'equipped';
  const base = registry.getDelveData().bases.find((b) => b.id === item.baseId);
  const attack = base?.attack;
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <ItemTile item={item} size={SIZES[size].tile} />
      <div className="min-w-0 flex-1">
        <div
          className={`delve-display truncate ${SIZES[size].name} font-bold`}
          style={{ color: RARITY_COLOR[item.rarity] }}
          data-testid="item-name"
        >
          {item.name}
        </div>
        <div className="text-xs text-stone-300">
          {RARITY_LABEL[item.rarity]} {baseDisplayName(registry, item)} · {SLOT_LABEL[item.slot]}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-stone-400">
          <span
            className="rounded px-1.5 py-0.5 font-semibold"
            style={
              ownMana
                ? { background: `${mana.color}22`, color: mana.color }
                : { background: 'rgba(255,255,255,0.05)', color: '#78716c' }
            }
            data-testid="item-mana"
          >
            {mana.icon} {mana.name} +{itemAffinityAttunement(registry, item)}
            {!ownMana && ' · not your element'}
          </span>
          {attack && (
            <span className="rounded bg-white/5 px-1.5 py-0.5">
              {attack.kind === 'bolt' ? '🎯 Ranged' : '⚔️ Melee'}
            </span>
          )}
          {base?.tempo !== undefined && (
            <span className="rounded bg-white/5 px-1.5 py-0.5" data-testid="item-tempo">
              Tempo {base.tempo}×:{' '}
              {base.tempo > 1 ? 'slower' : base.tempo < 1 ? 'quicker' : 'standard'} holds and chain
              beats
            </span>
          )}
          <span className="rounded bg-white/5 px-1.5 py-0.5">iLvl {item.ilvl}</span>
          {item.upgrade > 0 && (
            <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-amber-200">
              +{item.upgrade} forged
            </span>
          )}
          {isEquipped && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">Equipped</span>
          )}
        </div>
      </div>
    </div>
  );
}
```

In `packages/client/src/features/delve/ItemDetailSheet.tsx`:

Replace:

```tsx
import {
  baseDisplayName,
  carriedSkills,
  inPair,
  isDiveActive,
  itemAffinityAttunement,
  itemStatLines,
```

with:

```tsx
import {
  carriedSkills,
  isDiveActive,
  itemStatLines,
```

Replace:

```tsx
import { getDelveRegistry } from './registry';
import { ItemTile } from './ItemTile';
```

with:

```tsx
import { getDelveRegistry } from './registry';
```

Replace:

```tsx
import { useItemComparison } from './items/useItemComparison';
```

with:

```tsx
import { useItemComparison } from './items/useItemComparison';
import { ItemHeader } from './items/ItemHeader';
```

Replace:

```tsx
import {
  RARITY_COLOR,
  RARITY_LABEL,
  SLOT_LABEL,
  UPGRADE_EPSILON,
  formatNumber,
  manaStyle,
} from './format';
```

with:

```tsx
import { RARITY_COLOR, UPGRADE_EPSILON, formatNumber, manaStyle } from './format';
```

Replace:

```tsx
  if (!item) return null;
  const color = RARITY_COLOR[item.rarity];
```

with:

```tsx
  if (!item) return null;
```

Replace:

```tsx
  const base = registry.getDelveData().bases.find((b) => b.id === item.baseId);
  const attack = base?.attack;
  const diving = isDiveActive(profile);
```

with:

```tsx
  const diving = isDiveActive(profile);
```

Replace:

```tsx
  const ownMana = inPair(profile, item.mana);
  const reattuneTo = pairElements(profile.pair).filter((m) => m !== item.mana);
```

with:

```tsx
  const reattuneTo = pairElements(profile.pair).filter((m) => m !== item.mana);
```

Replace the lines from `<ItemTile item={item} size={72} />` up to (not including) `className="delve-btn px-3 py-1 text-sm"` with:

```tsx
          <ItemHeader item={item} size="lg" />
          <button
```

(The sheet's header row now reads `<div className="flex items-start gap-3">`, then `<ItemHeader item={item} size="lg" />`, then the close button.)

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/client && npx vitest run src/features/delve/items src/features/delve/__tests__/ItemDetailSheet.test.tsx)`
Expected: PASS, 44 tests in 6 files, with no snapshot written or failed. Without the record's two new `.replace` calls, its four `html` snapshots would fail on exactly the added `<div class="flex min-w-0 flex-1 items-start gap-3">` and its `</div>`, and its `text` snapshots would pass.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx vitest run)` and `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 898 tests pass (104 files); no type errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-ui-1c
(cd packages/client && npx prettier --end-of-line auto --write src/features/delve/items/ItemHeader.tsx src/features/delve/items/__tests__/ItemHeader.test.tsx src/features/delve/items/__tests__/sheet-split.test.tsx src/features/delve/ItemDetailSheet.tsx)
git add packages/client/src/features/delve/items/ItemHeader.tsx packages/client/src/features/delve/items/__tests__/ItemHeader.test.tsx packages/client/src/features/delve/items/__tests__/sheet-split.test.tsx packages/client/src/features/delve/ItemDetailSheet.tsx
git commit -m "refactor(client): ItemHeader, out of the item sheet" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: `CompareTable`

New: every stat both items give, the worn one's beside this one's. The sheet doesn't render it; 2A's Full compare does.

**Files:**
- Create: `packages/client/src/features/delve/items/CompareTable.tsx`
- Create: `packages/client/src/features/delve/items/__tests__/CompareTable.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/items/__tests__/CompareTable.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { CompareTable } from '../CompareTable';
import { getDelveRegistry } from '../../registry';

const registry = getDelveRegistry();
const helm = (
  uid: string,
  implicits: GearItem['implicits'],
  affixes: GearItem['affixes'],
): GearItem => ({
  ...generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'fire' },
    new SeededRNG(4),
  ),
  implicits,
  affixes,
});
const mine = helm(
  'h1',
  [{ stat: 'armor', value: 7, roll: 0.5 }],
  [
    { stat: 'critChance', value: 3, roll: 0.5 },
    { stat: 'armor', value: 2, roll: 0.5 },
  ],
);
const worn = helm(
  'h2',
  [{ stat: 'armor', value: 10, roll: 0.5 }],
  [{ stat: 'maxHp', value: 18, roll: 0.5 }],
);

describe('CompareTable', () => {
  it("sets each stat beside the worn item's, summed, coloured by which gives more", () => {
    render(<CompareTable item={mine} worn={worn} />);
    const rows = screen.getAllByTestId(/^compare-row-/);
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      'compare-row-armor',
      'compare-row-critChance',
      'compare-row-maxHp',
    ]);
    expect(rows[0]).toHaveTextContent('Armor+10+9');
    expect(rows[1]).toHaveTextContent('Crit Chance—+3%');
    expect(rows[2]).toHaveTextContent('Max Life+18—');
    expect(rows[0].children[2]).toHaveStyle({ color: '#f87171' });
    expect(rows[1].children[2]).toHaveStyle({ color: '#4ade80' });
  });

  it('with nothing worn, every stat is a gain', () => {
    render(<CompareTable item={mine} worn={null} />);
    expect(screen.getByTestId('compare-table')).toHaveTextContent('StatWornThis');
    expect(screen.getAllByTestId(/^compare-row-/)).toHaveLength(2);
    expect(screen.getByTestId('compare-row-armor')).toHaveTextContent('Armor—+9');
    expect(screen.getByTestId('compare-row-armor').children[2]).toHaveStyle({ color: '#4ade80' });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/items/__tests__/CompareTable.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../CompareTable" from "src/features/delve/items/__tests__/CompareTable.test.tsx". Does the file exist?`

- [ ] **Step 3: The table**

Create `packages/client/src/features/delve/items/CompareTable.tsx`:

```tsx
import type { ReactElement } from 'react';
import { itemStatLines, type DataRegistry, type GearItem, type HeroStatKey } from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { formatStat } from '../format';

/** An item's stat lines summed by stat, in the order they first appear. */
function statTotals(registry: DataRegistry, item: GearItem): Map<HeroStatKey, number> {
  const totals = new Map<HeroStatKey, number>();
  for (const l of itemStatLines(item, registry))
    totals.set(l.stat, (totals.get(l.stat) ?? 0) + l.value);
  return totals;
}

/**
 * Every stat either item gives, side by side: what's worn, then this item,
 * green where this gives more and red where less. The item's stats come first,
 * then those only the worn one has.
 */
export function CompareTable({
  item,
  worn,
}: {
  item: GearItem;
  worn: GearItem | null;
}): ReactElement {
  const registry = getDelveRegistry();
  const mine = statTotals(registry, item);
  const theirs = worn ? statTotals(registry, worn) : new Map<HeroStatKey, number>();
  const stats = [...new Set([...mine.keys(), ...theirs.keys()])];
  const label = (stat: HeroStatKey) => registry.getGearAffix(stat)?.label ?? stat;
  // formatStat's "+12% Crit Chance" without its label.
  const value = (stat: HeroStatKey, v: number | undefined) =>
    v === undefined ? '—' : formatStat(registry, stat, v).slice(0, -label(stat).length - 1);
  return (
    <table className="w-full text-xs" data-testid="compare-table">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-stone-500">
          <th className="text-left font-normal">Stat</th>
          <th className="text-right font-normal">Worn</th>
          <th className="text-right font-normal">This</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((stat) => {
          const was = theirs.get(stat);
          const now = mine.get(stat);
          const d = (now ?? 0) - (was ?? 0);
          return (
            <tr key={stat} data-testid={`compare-row-${stat}`}>
              <td className="text-stone-300">{label(stat)}</td>
              <td className="text-right text-stone-400">{value(stat, was)}</td>
              <td
                className="text-right font-semibold"
                style={{ color: d > 0 ? '#4ade80' : d < 0 ? '#f87171' : '#d6d3d1' }}
              >
                {value(stat, now)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/client && npx vitest run src/features/delve/items src/features/delve/__tests__/ItemDetailSheet.test.tsx)`
Expected: PASS, 46 tests in 7 files, with no snapshot written or failed.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx vitest run)` and `(cd packages/client && npx tsc --noEmit -p .)`
Expected: 900 tests pass (105 files); no type errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-ui-1c
(cd packages/client && npx prettier --end-of-line auto --write src/features/delve/items/CompareTable.tsx src/features/delve/items/__tests__/CompareTable.test.tsx)
git add packages/client/src/features/delve/items/CompareTable.tsx packages/client/src/features/delve/items/__tests__/CompareTable.test.tsx
git commit -m "feat(client): CompareTable, every stat beside the worn item's" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 7: Retire the record, and verify

The record has done its job: Tasks 2–6 each passed against it. It goes now, because 1A's `RARITY_COLOR` and `ItemIcon` change the sheet's markup, and a snapshot of that markup would fail as soon as 1A and 1C merge.

**Files:**
- Delete: `packages/client/src/features/delve/items/__tests__/sheet-split.test.tsx`
- Delete: `packages/client/src/features/delve/items/__tests__/__snapshots__/sheet-split.test.tsx.snap`

- [ ] **Step 1: The record passes one last time**

Run: `(cd packages/client && npx vitest run src/features/delve/items/__tests__/sheet-split.test.tsx)`
Expected: PASS, 4 tests, nothing written.

- [ ] **Step 2: Delete it**

```bash
cd /c/Projects/alloy-ui-1c
git rm packages/client/src/features/delve/items/__tests__/sheet-split.test.tsx packages/client/src/features/delve/items/__tests__/__snapshots__/sheet-split.test.tsx.snap
```

- [ ] **Step 3: Verify the area**

Run each, from the worktree root:
- `(cd packages/client && npx vitest run)`: 896 tests pass (104 files).
- `(cd packages/client && npx tsc --noEmit -p .)`: no type errors.
- `(pnpm -F @alloy/client build)`: builds (a chunk-size warning is usual).
- `git diff --exit-code 96d620b -- packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx`: no output; the sheet's own tests are unchanged and passed every task.
- `git diff --stat 96d620b -- packages/engine`: no output; this area changes no engine number.
- `git diff --stat 96d620b`: exactly the seven sources and five tests under `packages/client/src/features/delve/items/`, and `ItemDetailSheet.tsx`.
- `grep -c "from './items/" packages/client/src/features/delve/ItemDetailSheet.tsx`: 6 (`useItemComparison`, `ItemHeader`, `PowerDelta`, `ItemStatLines`, `LegendaryBox` and `MovesetView`; `CompareTable` isn't, by design).

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/alloy-ui-1c
git commit -m "test(client): retire the item sheet's split record" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

The area is done when, on `ui/p1-1c`:
- the client suite passes, 896 tests in 104 files at a `96d620b` base (15 new item-view tests: 5 comparison, 4 stat lines and legendary, 2 moveset, 2 header, 2 table), and the typecheck and the build are clean;
- `ItemDetailSheet.test.tsx` is byte-identical to the base and passed after every task, and the four-item record (text and markup) held from Task 2 through Task 6, with only `ItemHeader`'s own row unwrapped;
- `ItemDetailSheet.tsx` imports six of the seven pieces, and the seven signatures match the spec (with `LegendaryBox` returning `ReactElement | null`);
- the engine is untouched (no engine number changes; no determinism check needed).

1C runs no E2E: the sheet's markup doesn't change, and the phase's E2E updates come after 1D.
