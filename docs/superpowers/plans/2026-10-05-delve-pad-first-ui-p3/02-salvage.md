# Salvage with Undo, and the junk sheet Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** X (and Del) salvages the focused bag item at once, a precious one too; for 5 seconds the footer offers "Undo salvage" on B (and Ctrl+Z), which puts the save back as it was. Any other change to the save ends the offer. Salvage junk opens a review sheet: each candidate with what it gives, A keeps one back, Y salvages the rest, with the total.

**Architecture:** Undo is the store's and the client's alone: `salvage` keeps the profile from before (`undo.before`) beside the one it made (`undo.after`); the offer is live while the store's profile is still `undo.after` and `UNDO_MS` has not passed. `commit` drops it the moment any other profile is committed, so every op ends it without each op knowing. `undoSalvage` commits `undo.before` (the whole save: the bag, the purse, the pouches, the quest and tutorial progress the salvage made) and gives back the NEW marks the salvage cleared. Nothing in the engine changes.

**Tech Stack:** React 19, Zustand, Vitest (jsdom), Playwright.

Read `00-overview.md` first. Plan 01 is done. Spec: section 4, "Salvage with Undo" and "Salvage junk", with the overview's edit 4.

**What lives outside the profile, and what Undo does about each** (read from `stores/delveStore.ts`):

| State | What a salvage did to it | On Undo |
|---|---|---|
| `profile` (bag, scrap, Dust, Links, the material and rune pouches, patterns, `essencesSeen`, `quests`, `tutorial`, `nextUid`, `forgeCount`) | changed by the engine's `salvageItems`, which also ran `applyQuestEvents` and `applyTutorialEvents` | restored whole (`commit(undo.before)`): the quest progress and the tutorial step go back with it, since they live in the save |
| `newUids` | the salvaged uids' NEW marks cleared | given back (`undo.newUids`, only the salvaged ones that were new) |
| `notices` (quest toasts queued by `commit`'s `questNotices`) | an "Objective done" may have been queued, and may already be on screen | left alone: a toast already shown can't be unshown. `commit(undo.before)` diffs back to fewer done objectives, which queues nothing; salvaging again re-queues the notice, which is true again then. Acceptable: say so in `undoSalvage`'s doc comment |
| toasts the Loadout showed ("+2 Links from its extra slots", the parts line) | shown | left; Undo shows its own: "Salvage undone" |
| `chainDraft` | a bag item's salvage never touches the worn weapon, so `commit` kept the draft | kept (`commit(undo.before)` keeps a draft whose weapon is still worn: it is). The draft's price reads the purse, so it reverts with it |
| `bindDeclined`, `unsocket`, `manualAttack`, `diveDrops`… | untouched | untouched |
| `TutorialPanel`'s step hold and chime | a finished `l1-salvage` played its tick | the step comes back as the current one; no sound. Acceptable |

**The guided start:** `l1-salvage`'s trail (`loadout.bag:weapon.common`, `loadout.salvage`) keeps its targets (plan 01 put `loadout.salvage` on the X prompt under the pad). Salvaging the sword completes the step at once (no arming), and Undo takes the step back with the save.

---

### Task 1: the store keeps the save from before for 5 seconds

**Files:**
- Modify: `packages/client/src/stores/delveStore.ts`
- Test: `packages/client/src/stores/delveStore.test.ts`

- [ ] **Step 1: Write the failing tests.** In `delveStore.test.ts` (add `afterEach` to the vitest import, `UNDO_MS` to the store import):

```ts
describe('salvage Undo', () => {
  const s = () => useDelveStore.getState();
  const ring = (uid: string) =>
    generateItem(registry, { uid, ilvl: 3, rarity: 'magic', slot: 'ring' }, new SeededRNG(2));

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    s().resetProfile(1234, 'fire');
    s().setProfile({ ...armed(s().profile), bag: [ring('u1'), ring('u2')], scrap: 0 });
    s().markNew(['u1']);
  });
  afterEach(() => vi.useRealTimers());

  it('offers the save from before; Undo restores it whole, the NEW mark too, and saves it', () => {
    const before = s().profile;
    s().salvage(['u1']);
    expect(s().profile.bag.map((i) => i.uid)).toEqual(['u2']);
    expect(s().profile.scrap).toBeGreaterThan(0);
    expect(s().newUids.u1).toBeUndefined();
    expect(s().undo).toMatchObject({ before, after: s().profile });
    expect(s().undoSalvage()).toBe(true);
    // The very save from before: its bag, purse, quests and tutorial step, by identity.
    expect(s().profile).toBe(before);
    expect(s().newUids.u1).toBe(true);
    expect(s().undo).toBeNull();
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!).bag).toHaveLength(2);
    // Once taken back, there is nothing more to take back.
    expect(s().undoSalvage()).toBe(false);
  });

  it('the offer lapses after UNDO_MS', () => {
    s().salvage(['u1']);
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(s().undo).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(s().undo).toBeNull();
    expect(s().undoSalvage()).toBe(false);
    expect(s().profile.bag).toHaveLength(1);
  });

  it('any other change to the save ends the offer', () => {
    s().salvage(['u1']);
    s().toggleLock('u2');
    expect(s().undo).toBeNull();
    expect(s().undoSalvage()).toBe(false);
    expect(s().profile.bag.map((i) => i.uid)).toEqual(['u2']);
    // A change that saves nothing (a NEW mark seen) leaves it.
    s().salvage(['u2']);
    s().markSeen(['u1']);
    expect(s().undo).not.toBeNull();
  });

  it('a second salvage replaces the offer: Undo takes back the last one only', () => {
    s().salvage(['u1']);
    const between = s().profile;
    s().salvage(['u2']);
    expect(s().undoSalvage()).toBe(true);
    expect(s().profile).toBe(between);
    expect(s().profile.bag.map((i) => i.uid)).toEqual(['u2']);
  });

  it('a salvage that melts nothing (a locked item, an empty list) offers no Undo', () => {
    s().toggleLock('u1');
    s().salvage(['u1']);
    expect(s().undo).toBeNull();
    s().salvage([]);
    expect(s().undo).toBeNull();
  });

  it("takes back the guided start's step and the quests' progress, since they live in the save", () => {
    const p = s().profile;
    const sword = { ...p.equipped.weapon!, uid: 'old', rarity: 'common' as const };
    s().setProfile({ ...p, bag: [sword], tutorial: { step: 'l1-salvage', count: 0, misses: 0 } });
    const before = s().profile;
    s().salvage(['old']);
    const after = s().profile;
    expect(s().undoSalvage()).toBe(true);
    expect(s().profile.tutorial).toEqual(before.tutorial);
    expect(s().profile.quests).toBe(before.quests);
    // Whether the salvage moved the step on is the engine's (the step's hold rule); Undo
    // restores what was, either way.
    expect(after).not.toBe(before);
  });
});
```

  (`armed` is the file's existing import.)

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts -t "salvage Undo")`
Expected: FAIL (`UNDO_MS` is not exported; `undo` is undefined).

- [ ] **Step 3: Implement.** In `delveStore.ts`:

```ts
/** How long Salvage's Undo is offered (the pad-first spec, 4). */
export const UNDO_MS = 5000;

/** A salvage Undo can still take back: the save from before it, the one it made, and the NEW marks it cleared. */
export interface SalvageUndo {
  before: DelveProfile;
  after: DelveProfile;
  newUids: Record<string, true>;
}
```

  In `DelveStore`:

```ts
  /**
   * The last salvage, while Undo can take it back: for `UNDO_MS`, and only while the save is still
   * the one it made (any other commit ends it). Session only.
   */
  undo: SalvageUndo | null;
  /**
   * Take the last salvage back (the pad-first spec, 4): the save as it was before it, whole (its
   * quest and tutorial progress too), and the NEW marks it cleared. A quest toast it queued stays
   * shown. False once the offer is gone.
   */
  undoSalvage: () => boolean;
```

  In `commit`, beside the draft rule:

```ts
    // Salvage's Undo holds only while the save is the one the salvage made.
    const undo = prev?.undo && prev.undo.after !== profile ? { undo: null } : {};
```

  and spread `...undo` into both branches of the `set`. Initial state `undo: null`; `resetProfile`'s `set` gains `undo: null`. `salvage` becomes:

```ts
    salvage: (uids) => {
      const { profile: before, newUids } = get();
      const res = salvageItems(registry(), before, uids, pull());
      commit(res.profile);
      set({ newUids: withoutUids(get().newUids, uids) });
      // Something melted: Undo may take it back for UNDO_MS.
      if (res.profile.bag.length < before.bag.length) {
        const cleared = Object.fromEntries(
          uids.filter((u) => newUids[u]).map((u) => [u, true as const]),
        );
        const undo: SalvageUndo = { before, after: res.profile, newUids: cleared };
        set({ undo });
        window.setTimeout(() => {
          if (get().undo === undo) set({ undo: null });
        }, UNDO_MS);
      }
      const { scrap, dust, links, runes, destroyed, shards, patterns, essences } = res;
      return { scrap, dust, links, runes, destroyed, shards, patterns, essences };
    },

    undoSalvage: () => {
      const { undo, profile } = get();
      if (!undo || profile !== undo.after) return false;
      commit(undo.before);
      set({ newUids: { ...get().newUids, ...undo.newUids }, undo: null });
      return true;
    },
```

  If the existing salvage test "salvage returns the scrap, Mana Dust and Links gained" leaves a timer running into later tests, nothing reads it (its `undo` is replaced by the next `resetProfile`); no change needed there.

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts)`
Expected: PASS (the whole file). If the guided-start test's `l1-salvage` seed is refused by a schema (`tutorial` with a step the save can't hold), seed it through `useDelveStore.getState().startTutorial()` and walk the state to `l1-salvage` the way `tutorial-fixture.ts` does (`at('l1-salvage')`).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores
git commit -m "feat(client): the store keeps the save from before a salvage for 5 s; Undo restores it whole"
```

---

### Task 2: X salvages at once; Undo on B and Ctrl+Z

**Files:**
- Modify: `packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/ComparePane.tsx`
- Test: `packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx`, `ComparePane.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `LoadoutTab.test.tsx`, replace "a precious item salvages on a second press within 2 s, and says the Links it gave" and "Salvage asks first for any weapon holding runes…" with:

```tsx
  it('X salvages a precious item at once, and says the Links it gave', () => {
    // Three extra Primary slots: two Links past the one a rare forge grants free.
    put(rareSword('w1', { primary: 4 }));
    const { props } = open({ link: { tab: 'loadout', uid: 'w1' } });
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(/^Salvage · \+2 Links · \+\d+ scrap/);
    act(() => prompt(props, 'salvage').onPress!());
    expect(store().profile.bag).toHaveLength(0);
    expect(store().profile.links).toBe(2);
    expect(screen.getByText('+2 Links from its extra slots')).toBeInTheDocument();
  });

  it('Salvage names what becomes of a weapon\'s runes on its button, and melts at once', () => {
    useDelveStore.setState({ unsocket: null });
    putRunedSword('w2'); // the uncommon sword with Split III in its first move (the old test's setup, as a helper)
    open({ link: { tab: 'loadout', uid: 'w2' } });
    expect(screen.getByTestId('salvage-button')).toHaveTextContent('destroys Split III');
    act(() => store().setUnsocket('pay'));
    expect(screen.getByTestId('salvage-button')).toHaveTextContent('Split III back to your pouch');
    fireEvent.click(screen.getByTestId('salvage-button'));
    expect(store().profile.bag).toHaveLength(0);
    expect(store().profile.runes).toEqual({ split: [0, 0, 1, 0, 0] });
  });

  it('for 5 s the footer offers Undo on B and Ctrl+Z; it puts the item back, and goes when the time is up', () => {
    vi.useFakeTimers();
    put(gear('h1', 'helm'), gear('r1', 'ring'));
    const { props } = open({ link: { tab: 'loadout', uid: 'h1' } });
    expect(prompts(props).some((x) => x.id === 'undo')).toBe(false);
    act(() => prompt(props, 'salvage').onPress!());
    expect(store().profile.bag.map((i) => i.uid)).toEqual(['r1']);
    expect(prompt(props, 'undo')).toMatchObject({
      label: 'Undo salvage',
      binding: { key: 'KeyZ', ctrl: true, pad: 'b' },
    });
    act(() => prompt(props, 'undo').onPress!());
    expect(store().profile.bag.map((i) => i.uid).sort()).toEqual(['h1', 'r1']);
    expect(screen.getByText('Salvage undone')).toBeInTheDocument();
    expect(prompts(props).some((x) => x.id === 'undo')).toBe(false);
    // Again, and let the time run out.
    act(() => prompt(props, 'salvage').onPress!());
    act(() => vi.advanceTimersByTime(UNDO_MS));
    expect(prompts(props).some((x) => x.id === 'undo')).toBe(false);
  });

  it('another change to the save takes the Undo away (a lock, an equip)', () => {
    put(gear('h1', 'helm'), gear('r1', 'ring'));
    const { props } = open({ link: { tab: 'loadout', uid: 'h1' } });
    act(() => prompt(props, 'salvage').onPress!());
    expect(prompts(props).some((x) => x.id === 'undo')).toBe(true);
    fireEvent.contextMenu(tile('r1'));
    expect(prompts(props).some((x) => x.id === 'undo')).toBe(false);
  });
```

  The exact Ctrl binding is in the third test's `toMatchObject`; that Ctrl+Z fires it and a plain Z doesn't is the runtime's rule (`keyMatches` in `kit/prompts.ts` matches `ctrl` exactly), which `prompts.test.ts` already holds. Add `UNDO_MS` to the store import, and lift the old runes test's setup into a `putRunedSword(uid)` helper at the file's top.

  In `ComparePane.test.tsx` the test "a locked item says Unlock, and its Salvage waits" stays; add to "Salvage shows the engine's yield…": `expect(screen.getByTestId('salvage-button')).not.toHaveTextContent('Press again')`.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx)`
Expected: FAIL (no `undo` prompt; the precious item still arms).

- [ ] **Step 3: Implement.** In `LoadoutTab.tsx`:
  - `ARMED_MS`, `armed`, the arming effect and the `precious` branch go; `actions.salvage` keeps its guards (`locked`, a worn item unequips (plan 01), a locked item returns) and salvages at once.
  - Read the offer: `const undoLive = useDelveStore((s) => !!s.undo && s.profile === s.undo.after);`
  - The prompts effect gains `undoLive` in its keys, and while `undoLive && mode !== 'pause'`:

```tsx
      {
        id: 'undo',
        label: 'Undo salvage',
        binding: { key: 'KeyZ', ctrl: true, pad: 'b' },
        onPress: () => {
          if (!useDelveStore.getState().undoSalvage()) return;
          playSound('orbPlace');
          showToast('Salvage undone');
        },
      },
```

    appended last (`orderPrompts` puts B last anyway). B has no other job at the Loadout's root (the hub's B does nothing), so the pad's B reaches it through `padPrompts` before the nav's default.
  - The doc comment gains: "X salvages at once; for `UNDO_MS` after, B or Ctrl+Z takes it back (`undoSalvage`)."

  In `ComparePane.tsx` the Salvage button's label is always the price branch, with the runes' fate appended:

```tsx
                Salvage ·{' '}
                <Price scrap={yields.scrap} links={yields.links > 0 ? yields.links : undefined} dust={yields.dust > 0 ? yields.dust : undefined} signed />
                {melts && ` · ${melts}`}
```

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout src/stores)`
Expected: PASS (remove any `.skip` plan 01 left with a `// plan 02` comment).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/loadout
git commit -m "feat(client): X salvages at once; Undo salvage on B and Ctrl+Z for 5 s"
```

---

### Task 3: the junk sheet

**Files:**
- Create: `packages/client/src/features/delve/hub/loadout/JunkSheet.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/BagPane.tsx`
- Test: `packages/client/src/features/delve/hub/loadout/__tests__/JunkSheet.test.tsx` (new), `BagPane.test.tsx`

- [ ] **Step 1: Write the failing tests.** New `JunkSheet.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { generateItem, salvageYield, SeededRNG, type GearItem, type GearSlot, type Rarity } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import { armed } from '../../../__tests__/armed';
import { getDelveRegistry } from '../../../registry';
import { formatNumber } from '../../../format';
import { padPrompts } from '../../../kit/prompts';
import { PAD_BUTTONS, type PadButton } from '@/features/gamepad/gamepad';
import { JunkSheet } from '../JunkSheet';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const gear = (uid: string, slot: GearSlot, rarity: Rarity = 'common', seed = 4): GearItem =>
  generateItem(registry, { uid, ilvl: 3, rarity, slot, mana: 'fire' }, new SeededRNG(seed));
const rows = () => screen.getAllByTestId('junk-row');
const row = (uid: string) => rows().find((r) => r.dataset.uid === uid)!;
/** Every element a box (jsdom lays nothing out), so the dialog is the topmost visible scope. */
const boxed = () =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
let clock = 0;
const padPress = (button: PadButton) => {
  const held = (on?: PadButton) =>
    Object.fromEntries(PAD_BUTTONS.map((b) => [b, b === on])) as Record<PadButton, boolean>;
  act(() => {
    padPrompts(new Set([button]), held(button), (clock += 1000));
    padPrompts(new Set(), held(), clock + 50);
  });
};

describe('JunkSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    const p = armed(store().profile);
    // An epic helm worn: the bag's common helms are all worse (salvageCandidates' junk).
    store().setProfile({
      ...p,
      scrap: 0,
      equipped: { ...p.equipped, helm: gear('h0', 'helm', 'epic') },
      bag: [gear('h1', 'helm', 'common', 1), gear('h2', 'helm', 'common', 2), gear('h3', 'helm', 'common', 3)],
    });
  });

  it('lists each candidate with what it gives, and the total of what Salvage would give', () => {
    render(<JunkSheet uids={['h1', 'h2', 'h3']} onClose={vi.fn()} />);
    expect(rows().map((r) => r.dataset.uid)).toEqual(['h1', 'h2', 'h3']);
    const scrapOf = (uid: string) =>
      salvageYield(registry, store().profile, store().profile.bag.find((i) => i.uid === uid)!).scrap;
    expect(row('h1')).toHaveTextContent(`+${formatNumber(scrapOf('h1'))} scrap`);
    const total = scrapOf('h1') + scrapOf('h2') + scrapOf('h3');
    expect(screen.getByTestId('junk-total')).toHaveTextContent(`+${formatNumber(total)} scrap`);
    expect(screen.getByTestId('junk-salvage')).toHaveTextContent('Salvage 3');
  });

  it('A on a row keeps it back (pressed), again lets it go; the total and the count follow', () => {
    render(<JunkSheet uids={['h1', 'h2', 'h3']} onClose={vi.fn()} />);
    fireEvent.click(row('h2'));
    expect(row('h2')).toHaveAttribute('aria-pressed', 'true');
    expect(row('h2')).toHaveTextContent('Kept');
    expect(screen.getByTestId('junk-salvage')).toHaveTextContent('Salvage 2');
    fireEvent.click(row('h2'));
    expect(row('h2')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('junk-salvage')).toHaveTextContent('Salvage 3');
  });

  it('Y salvages the rest through the store (its Undo offered), then closes and says what it gave', () => {
    const box = boxed();
    const onClose = vi.fn();
    render(
      <>
        <JunkSheet uids={['h1', 'h2', 'h3']} onClose={onClose} />
        <ToastContainer />
      </>,
    );
    fireEvent.click(row('h2'));
    padPress('y');
    box.mockRestore();
    expect(store().profile.bag.map((i) => i.uid)).toEqual(['h2']);
    expect(store().profile.scrap).toBeGreaterThan(0);
    expect(store().undo).not.toBeNull();
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText(/^Salvaged 2 items · \+\d+ scrap/)).toBeInTheDocument();
  });

  it('keeping every one back turns Salvage off and says why; B closes and melts nothing', () => {
    const onClose = vi.fn();
    render(<JunkSheet uids={['h1']} onClose={onClose} />);
    fireEvent.click(row('h1'));
    expect(screen.getByTestId('junk-salvage')).toBeDisabled();
    expect(screen.getByTestId('junk-sheet')).toHaveTextContent('Everything is kept back');
    fireEvent.click(within(screen.getByTestId('junk-sheet')).getByRole('button', { name: /back/i }));
    expect(onClose).toHaveBeenCalled();
    expect(store().profile.bag).toHaveLength(1);
  });

  it('the sheet is a wrapping list, its first row the first focus', () => {
    render(<JunkSheet uids={['h1', 'h2']} onClose={vi.fn()} />);
    expect(screen.getByTestId('junk-sheet')).toHaveAttribute('data-pad-wrap');
    expect(row('h1')).toHaveAttribute('data-pad-first');
  });
});
```

  The Back button's accessible name is the kit `Dialog`'s (read `surfaces.tsx`: if it is "Close" or a glyph label, match that). `BagPane.test.tsx`'s "Salvage junk melts what is worse, never a weapon holding runes" becomes "Salvage junk opens the review sheet on what is worse, never a weapon holding runes": the click opens `junk-sheet` with one row (`h1`; the runed `w2` is not a candidate), and the bag is unchanged until the sheet's Salvage.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/JunkSheet.test.tsx src/features/delve/hub/loadout/__tests__/BagPane.test.tsx)`
Expected: FAIL (no `JunkSheet`).

- [ ] **Step 3: Implement.** `JunkSheet.tsx`:

```tsx
import { useRef, useState, type ReactElement } from 'react';
import { salvageYield } from '@alloy/engine';
import { partsText, useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Dialog, Price, usePrompts } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { RARITY_TEXT, formatNumber } from '../../format';

/** Salvage the rest: Y, or Ctrl+Enter on the keys (the grammar's "commit"). */
const SALVAGE_REST = { key: 'Enter', ctrl: true, pad: 'y' } as const;

/**
 * Salvage junk's review sheet (the pad-first spec, 4): each candidate (`salvageCandidates`, the
 * engine's fences) with what it gives (`salvageYield`), A keeping one back, and Y salvaging the
 * rest through the store's `salvage` (so its Undo is offered), with the total. A wrapping list.
 */
export function JunkSheet({ uids, onClose }: { uids: string[]; onClose: () => void }): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const body = useRef<HTMLDivElement>(null);
  const items = uids.flatMap((uid) => profile.bag.find((i) => i.uid === uid) ?? []);
  const yields = new Map(items.map((i) => [i.uid, salvageYield(registry, profile, i)]));
  const going = items.filter((i) => !kept.has(i.uid));
  const sum = (k: 'scrap' | 'dust' | 'links') => going.reduce((n, i) => n + yields.get(i.uid)![k], 0);
  const shards = going.filter((i) => yields.get(i.uid)!.shards.length > 0).length;

  const salvage = () => {
    if (going.length === 0) return;
    const res = useDelveStore.getState().salvage(going.map((i) => i.uid));
    playSound('gemScatter');
    vibrate('medium');
    const dust = res.dust > 0 ? ` · +${formatNumber(res.dust)} Mana Dust` : '';
    const links = res.links > 0 ? ` · +${res.links} Link${res.links > 1 ? 's' : ''}` : '';
    const parts = partsText(registry, res.runes, res.destroyed);
    showToast(`Salvaged ${going.length} items · +${formatNumber(res.scrap)} scrap${dust}${links}${parts ? ` · ${parts}` : ''}`);
    onClose();
  };
  usePrompts([{ id: 'salvage-rest', label: `Salvage ${going.length}`, binding: SALVAGE_REST, onPress: salvage, disabled: going.length === 0 }], body);

  return (
    <Dialog title="Salvage junk" onClose={onClose} width={760} wrap testId="junk-sheet">
      <div ref={body} className="flex flex-col gap-3">
        <p className="k-body-2">Everything here is worse than what you wear. A keeps one back.</p>
        <div className="flex flex-col gap-2">
          {items.map((item, i) => {
            const y = yields.get(item.uid)!;
            const keep = kept.has(item.uid);
            return (
              <button
                key={item.uid}
                type="button"
                className="k-well flex items-center justify-between gap-3 p-2 text-left"
                style={{ opacity: keep ? 0.55 : 1 }}
                aria-pressed={keep}
                data-pad-first={i === 0 ? '' : undefined}
                data-uid={item.uid}
                data-testid="junk-row"
                onClick={() => {
                  playSound('buttonClick');
                  setKept((k) => {
                    const next = new Set(k);
                    if (next.has(item.uid)) next.delete(item.uid);
                    else next.add(item.uid);
                    return next;
                  });
                }}
              >
                <span className="truncate text-[18px]" style={{ color: RARITY_TEXT[item.rarity] }}>
                  {item.name}
                </span>
                <span className="k-caption flex items-center gap-2">
                  {keep ? 'Kept' : (
                    <Price scrap={y.scrap} dust={y.dust || undefined} links={y.links || undefined} signed />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <p className="flex items-center gap-2 text-[18px]" data-testid="junk-total">
          {going.length === 0 ? (
            'Everything is kept back'
          ) : (
            <>
              Total <Price scrap={sum('scrap')} dust={sum('dust') || undefined} links={sum('links') || undefined} signed />
              {shards > 0 && ` · ${shards} shard${shards === 1 ? '' : 's'}`}
            </>
          )}
        </p>
        <Button variant="danger" binding={SALVAGE_REST} disabled={going.length === 0} onClick={salvage} testId="junk-salvage">
          Salvage {going.length}
        </Button>
      </div>
    </Dialog>
  );
}
```

  Check `Price`'s `signed` prints "+N scrap" (the compare pane's Salvage label uses it: yes). In `BagPane.tsx`: `const [reviewing, setReviewing] = useState(false)`; `salvage-junk`'s `onClick={() => setReviewing(true)}`; `{reviewing && <JunkSheet uids={junk} onClose={() => setReviewing(false)} />}`; `onSalvageJunk` goes. Its doc comment: "Salvage junk opens the review sheet (`JunkSheet`)".

  The junk rows' focus: A presses the focused row (the nav's A clicks a candidate), which toggles keep; the sheet's own Y prompt is in the dialog's scope, so the hub's Y (Lock) is inert while it shows.

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/loadout
git commit -m "feat(client): Salvage junk opens a review sheet: A keeps one back, Y salvages the rest"
```

---

### Task 4: the E2E

**Files:**
- Modify: `packages/client/e2e/delve-gamepad.spec.ts` (a new G09)
- Read: `packages/client/e2e/delve-tutorial.spec.ts` (TU01's `l1-salvage` clicks `salvage-button` once: it now melts at once, which TU01 already expects), `delve.spec.ts` (no `salvage-junk` click today)

- [ ] **Step 1: G09.** After G08:

```ts
  test('G09: X salvages the focused tile at once, B takes it back, and the offer ends after 5 s', async ({ page }) => {
    await setup(page, false, 1, false, (registry) => [
      generateItem(registry, { uid: 'bag-helm', ilvl: 3, rarity: 'rare', slot: 'helm', mana: 'fire' }, new SeededRNG(7)),
    ]);
    await page.goto('/delve');
    const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('alloy:delve:v2')!));
    await tap(page, BUTTON.down); // the pad takes the input lock
    await padWalk(page, 'bag-item');
    await tap(page, BUTTON.x);
    await expect.poll(async () => (await save()).bag.length).toBe(0);
    await expect(page.locator('.k-prompt', { hasText: 'Undo salvage' })).toBeVisible();
    await tap(page, BUTTON.b);
    await expect.poll(async () => (await save()).bag.map((i: GearItem) => i.uid)).toEqual(['bag-helm']);
    await expect(page.locator('.k-prompt', { hasText: 'Undo salvage' })).toHaveCount(0);
    // Again; the offer is gone after 5 s.
    await padWalk(page, 'bag-item');
    await tap(page, BUTTON.x);
    await expect(page.locator('.k-prompt', { hasText: 'Undo salvage' })).toBeVisible();
    await expect(page.locator('.k-prompt', { hasText: 'Undo salvage' })).toHaveCount(0, { timeout: 7_000 });
    expect((await save()).bag).toHaveLength(0);
  });
```

  (`setup`'s signature is G08's; read it, and pass the bag the same way.) A rare helm is "precious": it melts at once, which is the point.

- [ ] **Step 2: Run them**

Run: `(cd packages/client && npx playwright test e2e/delve-gamepad.spec.ts e2e/delve-tutorial.spec.ts --project=desktop)`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e
git commit -m "test(client): G09 salvages by X and takes it back by B"
```
