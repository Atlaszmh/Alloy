# The lean HUD Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings → HUD: Lean (the default) or Full (today's). Lean keeps the dock, the vitals, the boss bar and the interact plaque; the top right is the minimap with the depth and one tracked-objective line, with small Journal and Menu buttons for the mouse; the purse bar and the Found log become a gain feed at the top left (each pickup a line for a few seconds, a kind merging as it grows, at most five, then fading), which the dive's notices join; and the top-right cluster takes no camera inset, so the camera centres on the hero.

**Architecture:** a persisted `uiStore.hudMode`; `DelveRun` picks the top and right slots by it and tells `HudGrid` whether the right column takes an inset (`insetRight`). The feed is a pure model (`gain-feed.ts`: a tally of what the dive holds, diffed into lines) under a small component (`GainFeed`) that diffs the store's tally on each change. The notices join it through one change to the toast module, a sink (`routeToasts`) the feed claims while the fight is live.

**Tech Stack:** React 19, Zustand, Vitest (jsdom), Playwright.

Read `00-overview.md` first. Spec: section 3, "The lean HUD", with the overview's edits 5 and 7. Plans 01 and 02 are done.

**Can the dive's notices join the feed with one change? Yes.** Every notice the dive page shows already reaches the screen through `showToast` in `components/Toast.tsx`, which calls the one module-level listener `ToastContainer` sets: the store's notices (an overtake, a pair fix, "Quest complete: …", "Objective done: …", "Nothing to forge here yet") through `useDelveNotices`; "Pattern learned: …" and "Bag full: extra loot was salvaged" from `DelveRun`'s `onUi`; "Not enough mana for …" from `arena-sounds.ts`; the stop's and the alcove's "<power-up>: done" from `StopPanel`. So one sink in `showToast`, claimed by the feed while the fight is live (`!paused`) and released otherwise, moves all of them while the player is fighting, and leaves every toast raised under the stop, the pause, a dialog or a beat to `ToastContainer` (where the feed is hidden or covered). `ToastContainer` stays on the page.

**Under the full HUD** nothing changes: `PurseBar`, `FloorColumn` and the toasts as today.

**The guided start:** `hud.minimap` (the `d1-…` step at `tutorial.json` line 134) stays on the minimap, which the lean corner shows; `hud.primary`, `hud.defensive`, `hud.dodge`, `hud.potion` and `hud.vitals` are the dock's, untouched. Hesta's strip stays in the centre slot, and the corner's objective line gives way to a guided floor step as the tracker does (`quests={guidedFloor ? [] : quests}`). With no right inset, the guided marker's edge arrow can sit under the top-right corner; the corner is 340 design px of a 1920 width, so the arrow stays readable beside it. Leave it.

---

### Task 1: `hudMode` and Settings → HUD

**Files:**
- Modify: `packages/client/src/stores/uiStore.ts`
- Modify: `packages/client/src/features/delve/hub/SettingsPanel.tsx`
- Test: `packages/client/src/stores/uiStore.test.ts`, `packages/client/src/features/delve/hub/__tests__/SettingsPanel.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `uiStore.test.ts`'s "Delve UI scale fields" `describe` (its `fresh()` reloads the store from `localStorage`), add `'alloy:delve:hud'` to `KEYS` and:

```ts
    it('the HUD is lean by default, persists a choice of full, and reads anything else as lean', async () => {
      const store = await fresh();
      expect(store.getState().hudMode).toBe('lean');
      store.getState().setHudMode('full');
      expect(localStorage.getItem('alloy:delve:hud')).toBe('full');
      expect((await fresh()).getState().hudMode).toBe('full');
      localStorage.setItem('alloy:delve:hud', 'banana');
      expect((await fresh()).getState().hudMode).toBe('lean');
    });
```

  In `SettingsPanel.test.tsx`, beside "sets the HUD scale…":

```tsx
  it('chooses the HUD, Lean (the default) or Full, kept on this device', () => {
    useUIStore.setState({ hudMode: 'lean' });
    render(<SettingsPanel onClose={() => {}} />);
    const lean = screen.getByTestId('hud-mode-lean');
    const full = screen.getByTestId('hud-mode-full');
    expect(lean).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(full);
    expect(useUIStore.getState().hudMode).toBe('full');
    expect(full).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('alloy:delve:hud')).toBe('full');
    fireEvent.click(lean);
    expect(useUIStore.getState().hudMode).toBe('lean');
  });
```

  Read how the colorblind test in that file asserts the chosen option; if `Segmented` marks it otherwise than `aria-checked`, assert it that way.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/stores/uiStore.test.ts src/features/delve/hub/__tests__/SettingsPanel.test.tsx)`
Expected: FAIL, `hudMode` is undefined and `hud-mode-lean` is not found.

- [ ] **Step 3: Implement.** In `uiStore.ts`:

```ts
/** Delve UI: the dive's HUD, Lean (a gain feed, the map and one objective) or Full (the purse bar, the floor column, the Found log). */
export type HudMode = 'lean' | 'full';
```

  `UIStore` gains

```ts
  /** Delve UI: Settings → HUD, 'lean' by default (`alloy:delve:hud`). */
  hudMode: HudMode;
  setHudMode: (mode: HudMode) => void;
```

  and the store:

```ts
  hudMode: (() => {
    try {
      return localStorage.getItem('alloy:delve:hud') === 'full' ? 'full' : 'lean';
    } catch {
      return 'lean';
    }
  })() as HudMode,
  // …
  setHudMode: (mode) => {
    try { localStorage.setItem('alloy:delve:hud', mode); } catch { /* noop */ }
    set({ hudMode: mode });
  },
```

  In `SettingsPanel.tsx`'s Display section, first (above HUD scale):

```tsx
          <div className="flex items-center gap-4">
            <span className="w-48 shrink-0 text-[var(--k-text)]">HUD</span>
            <Segmented
              aria-label="HUD"
              columns={2}
              value={ui.hudMode}
              onChange={(mode) => ui.setHudMode(mode)}
              options={[
                { id: 'lean', label: 'Lean', testId: 'hud-mode-lean' },
                { id: 'full', label: 'Full', testId: 'hud-mode-full' },
              ]}
            />
          </div>
          <p className="text-[14px] text-[var(--k-text-3)]">
            Lean: the map, one objective and what you pick up; peek for the rest. Full: the purse,
            the floor and its finds always on screen.
          </p>
```

  The component's doc comment gains "the HUD (Lean or Full)". If `Segmented`'s `options` type takes no `testId`, it does for the colorblind row; follow that row's shape.

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/stores/uiStore.test.ts src/features/delve/hub/__tests__/SettingsPanel.test.tsx)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores packages/client/src/features/delve/hub
git commit -m "feat(client): Settings → HUD, Lean (the default) or Full, kept on this device"
```

---

### Task 2: the toast sink

**Files:**
- Modify: `packages/client/src/components/Toast.tsx`
- Modify: `packages/client/src/features/delve/useDelveNotices.ts` (its doc comment only)
- Test: `packages/client/src/components/__tests__/Toast.test.tsx`

- [ ] **Step 1: Write the failing tests** (append to the file's `describe`; import `routeToasts` beside `showToast`, and `act` if the file lacks it)

```tsx
  it('while a sink is routed (the dive's gain feed), every toast goes to it instead; released, to the container again', () => {
    render(<ToastContainer />);
    const got: string[] = [];
    const release = routeToasts((text) => got.push(text));
    act(() => showToast('Pattern learned: Maul'));
    expect(got).toEqual(['Pattern learned: Maul']);
    expect(screen.queryByText('Pattern learned: Maul')).toBeNull();
    release();
    act(() => showToast('Equip: done'));
    expect(got).toHaveLength(1);
    expect(screen.getByText('Equip: done')).toBeInTheDocument();
  });

  it('a stale release leaves the sink that replaced it', () => {
    const first: string[] = [];
    const second: string[] = [];
    const releaseFirst = routeToasts((t) => first.push(t));
    const releaseSecond = routeToasts((t) => second.push(t));
    releaseFirst();
    showToast('Objective done: Reach depth 2');
    expect([first, second]).toEqual([[], ['Objective done: Reach depth 2']]);
    releaseSecond();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/components/__tests__/Toast.test.tsx)`
Expected: FAIL, `routeToasts` is not exported.

- [ ] **Step 3: Implement** (in `Toast.tsx`, above `showToast`)

```ts
let sink: ((text: string) => void) | null = null;

/**
 * Send every toast to `fn` instead of the container until the returned release is called: the
 * dive's gain feed takes the notices while the fight is live (the pad-first spec, 3). One sink
 * at a time, the last routed winning; a release only clears its own.
 */
export function routeToasts(fn: (text: string) => void): () => void {
  sink = fn;
  return () => {
    if (sink === fn) sink = null;
  };
}
```

  and `showToast`'s body becomes:

```ts
  if (sink) return sink(text);
  toastListener?.({ id: ++toastId, text, variant: opts.variant ?? 'default' });
```

  (`showToast`'s doc comment: "Fire-and-forget toast from anywhere: to the routed sink while one is (`routeToasts`), else the container.") In `useDelveNotices.ts`'s doc comment, after "as toasts", add "(in a live dive, lines of the gain feed: `routeToasts`)".

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/components/__tests__/Toast.test.tsx)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components packages/client/src/features/delve/useDelveNotices.ts
git commit -m "feat(client): a toast sink (routeToasts), for the dive's gain feed"
```

---

### Task 3: the gain feed

**Files:**
- Create: `packages/client/src/features/delve/arena/hud/gain-feed.ts`
- Create: `packages/client/src/features/delve/arena/hud/GainFeed.tsx`
- Test: `packages/client/src/features/delve/arena/hud/__tests__/gain-feed.test.ts`, `packages/client/src/features/delve/arena/hud/__tests__/GainFeed.test.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/client/src/features/delve/arena/hud/__tests__/gain-feed.test.ts
import { describe, it, expect } from 'vitest';
import { addMaterial, emptyHaul, generateItem, SeededRNG } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import {
  FEED_MAX,
  FEED_MS,
  NOTICE_MS,
  feedAfter,
  feedNotice,
  feedTally,
  feedText,
  type FeedTally,
} from '../gain-feed';

/** A tally of plain counts, each kind named for itself. */
const tally = (counts: Record<string, number>): FeedTally =>
  new Map(Object.entries(counts).map(([k, count]) => [k, { name: k, color: '#fff', count }]));

describe('the gain feed', () => {
  it('a gain is a line; more of the same kind grows it ("+159 scrap") and holds it FEED_MS from the last', () => {
    let lines = feedAfter([], tally({}), tally({ scrap: 12 }), 0);
    expect(lines.map(feedText)).toEqual(['+12 scrap']);
    lines = feedAfter(lines, tally({ scrap: 12 }), tally({ scrap: 159 }), 1000);
    expect(lines.map(feedText)).toEqual(['+159 scrap']);
    expect(lines[0].until).toBe(1000 + FEED_MS);
  });

  it("a line goes FEED_MS after its last gain; the kind's next gain starts a new line", () => {
    const lines = feedAfter([], tally({}), tally({ scrap: 12 }), 0);
    const later = feedAfter(lines, tally({ scrap: 12 }), tally({ scrap: 20 }), FEED_MS);
    expect(later.map(feedText)).toEqual(['+8 scrap']);
    expect(feedAfter(lines, tally({ scrap: 12 }), tally({ scrap: 12 }), FEED_MS)).toEqual([]);
  });

  it("a loss (a death's share, a stop's spend) or a kind gone is no line", () => {
    expect(feedAfter([], tally({ scrap: 50, iron: 2 }), tally({ scrap: 20 }), 0)).toEqual([]);
  });

  it('each kind its own line, newest last; FEED_MAX at most, the oldest giving way', () => {
    let lines = feedAfter([], tally({}), tally({ a: 1, b: 1, c: 1 }), 0);
    lines = feedAfter(lines, tally({ a: 1, b: 1, c: 1 }), tally({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 }), 10);
    expect(lines).toHaveLength(FEED_MAX);
    expect(lines.map((l) => l.name)).toEqual(['b', 'c', 'd', 'e', 'f']);
    // A merge keeps the line where it is.
    lines = feedAfter(lines, tally({ b: 1 }), tally({ b: 3 }), 20);
    expect(lines.map(feedText)).toEqual(['+3 b', '+1 c', '+1 d', '+1 e', '+1 f']);
  });

  it('a notice is a plain line of its own, never merged, for NOTICE_MS', () => {
    let lines = feedNotice([], 'Quest complete: First Steps · claim at the Anvil', 0);
    lines = feedNotice(lines, 'Quest complete: First Steps · claim at the Anvil', 5);
    expect(lines.map(feedText)).toEqual([
      'Quest complete: First Steps · claim at the Anvil',
      'Quest complete: First Steps · claim at the Anvil',
    ]);
    expect(new Set(lines.map((l) => l.key)).size).toBe(2);
    expect(lines[0].until).toBe(NOTICE_MS);
  });

  it("tallies the dive's haul as the purse names it, and each item found by its uid, plainly", () => {
    const registry = getDelveRegistry();
    const haul = addMaterial({ ...emptyHaul(), scrap: 5 }, { kind: 'metal', metal: 'iron' }, 3);
    const helm = generateItem(
      registry,
      { uid: 'h1', ilvl: 3, rarity: 'rare', slot: 'helm', mana: 'fire' },
      new SeededRNG(4),
    );
    const t = feedTally(registry, haul, [helm]);
    const lines = feedAfter([], new Map(), t, 0);
    expect(lines.map(feedText)).toEqual(['+3 Iron bar', '+5 Scrap', helm.name]);
    expect(lines.at(-1)!.key).toBe('item:h1');
  });
});
```

```tsx
// packages/client/src/features/delve/arena/hud/__tests__/GainFeed.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer, showToast } from '@/components/Toast';
import { GainFeed } from '../GainFeed';
import { FEED_MS } from '../gain-feed';

const store = () => useDelveStore.getState();
/** The dive picks up `scrap` more (a bank). */
const gain = (scrap: number) =>
  act(() => {
    const s = store();
    const dive = s.profile.dive!;
    s.setProfile({ ...s.profile, dive: { ...dive, haul: { ...dive.haul, scrap: dive.haul.scrap + scrap } } });
  });
const lines = () => screen.queryAllByTestId('feed-line').map((l) => l.textContent);

describe('GainFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().startDive(1);
  });
  afterEach(() => vi.useRealTimers());

  it('shows nothing for what the dive held when it mounted, and never takes the pointer', () => {
    gain(40);
    render(<GainFeed live />);
    expect(lines()).toEqual([]);
    expect(screen.getByTestId('gain-feed')).toHaveClass('pointer-events-none');
  });

  it('a pickup is a line, the same kind merging as it grows, gone FEED_MS after its last gain', () => {
    render(<GainFeed live />);
    gain(12);
    expect(lines()).toEqual(['+12 Scrap']);
    act(() => vi.advanceTimersByTime(FEED_MS - 1000));
    gain(147);
    expect(lines()).toEqual(['+159 Scrap']);
    act(() => vi.advanceTimersByTime(FEED_MS - 1));
    expect(lines()).toEqual(['+159 Scrap']);
    act(() => vi.advanceTimersByTime(1));
    expect(lines()).toEqual([]);
  });

  it('while the fight is live every toast is a line; paused, the toasts go to the container', () => {
    const { rerender } = render(
      <>
        <GainFeed live />
        <ToastContainer />
      </>,
    );
    act(() => showToast('Pattern learned: Maul'));
    expect(within(screen.getByTestId('gain-feed')).getByText('Pattern learned: Maul')).toBeInTheDocument();
    rerender(
      <>
        <GainFeed live={false} />
        <ToastContainer />
      </>,
    );
    act(() => showToast('Equip: done'));
    expect(within(screen.getByTestId('gain-feed')).queryByText('Equip: done')).toBeNull();
    expect(screen.getByText('Equip: done')).toBeInTheDocument();
  });
});
```

  Fake timers fake `Date` too (Vitest's default), which the feed reads. If they don't in this setup, call `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })`.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/gain-feed.test.ts src/features/delve/arena/hud/__tests__/GainFeed.test.tsx)`
Expected: FAIL, the modules do not exist.

- [ ] **Step 3: The model**

```ts
// packages/client/src/features/delve/arena/hud/gain-feed.ts
import type { DataRegistry, GearItem, Haul } from '@alloy/engine';
import { RARITY_TEXT, formatNumber } from '../../format';
import { haulRows } from '../../materials/material-style';

/**
 * The lean HUD's gain feed (the pad-first spec, 3): each pickup a line at the top left for a few
 * seconds, a kind's gains merging into its line while it shows ("+159 Scrap" growing), at most
 * `FEED_MAX` lines, then a fade; the dive's notices join it as lines of their own.
 */

/** How long a pickup's line shows after its last gain, in ms. */
export const FEED_MS = 4000;
/** How long a notice's line shows. */
export const NOTICE_MS = 5000;
/** The fade at the end of a line's life. */
export const FADE_MS = 600;
/** The most lines the feed holds: the oldest gives way. */
export const FEED_MAX = 5;
/** A notice's colour. */
const NOTICE_COLOR = 'var(--k-hot-hi)';

/** One kind the dive holds: its name, its colour and how many; a plain one (an item) shows its name alone. */
export interface FeedEntry {
  name: string;
  color: string;
  count: number;
  plain?: boolean;
}

/** What the dive has picked up, by kind: `haulRows`' keys, and `item:<uid>` for each item found. */
export type FeedTally = ReadonlyMap<string, FeedEntry>;

/** A line of the feed: a kind's gain since it began to show (or a notice), and when it goes. */
export interface FeedLine extends FeedEntry {
  key: string;
  until: number;
}

/** The dive's tally: its haul and banked (`haul`), as the purse names them, and the items it found. */
export function feedTally(registry: DataRegistry, haul: Haul, items: readonly GearItem[]): FeedTally {
  const out = new Map<string, FeedEntry>();
  for (const r of haulRows(registry, haul)) out.set(r.key, { name: r.name, color: r.color, count: r.count });
  for (const item of items)
    out.set(`item:${item.uid}`, { name: item.name, color: RARITY_TEXT[item.rarity], count: 1, plain: true });
  return out;
}

/**
 * The lines after the tally moved from `before` to `after` at `now`: the expired gone, each kind
 * that grew added to its showing line (held `FEED_MS` more) or a new line at the end. A kind that
 * fell (a death's share, a stop's spend) makes no line.
 */
export function feedAfter(
  lines: readonly FeedLine[],
  before: FeedTally,
  after: FeedTally,
  now: number,
): FeedLine[] {
  let out = lines.filter((l) => l.until > now);
  for (const [key, e] of after) {
    const gained = e.count - (before.get(key)?.count ?? 0);
    if (gained <= 0) continue;
    const live = out.find((l) => l.key === key);
    out = live
      ? out.map((l) => (l === live ? { ...l, count: l.count + gained, until: now + FEED_MS } : l))
      : [...out, { ...e, key, count: gained, until: now + FEED_MS }];
  }
  return out.slice(-FEED_MAX);
}

let notices = 0;

/** The lines with a notice (a toast while the fight is live) added at the end, a line of its own. */
export function feedNotice(lines: readonly FeedLine[], text: string, now: number): FeedLine[] {
  const line: FeedLine = {
    key: `notice:${++notices}`,
    name: text,
    color: NOTICE_COLOR,
    count: 1,
    plain: true,
    until: now + NOTICE_MS,
  };
  return [...lines.filter((l) => l.until > now), line].slice(-FEED_MAX);
}

/** A line's words: "+159 Scrap", or a plain line's name. */
export function feedText(line: FeedLine): string {
  return line.plain ? line.name : `+${formatNumber(line.count)} ${line.name}`;
}
```

  `formatNumber(12)` must give `"12"` and `formatNumber(159)` `"159"`; it does in `format.ts` (it adds separators from 1,000). `haulRows` names scrap `Scrap` and orders bars, flux, shards, essences, runes, then scrap, Mana Dust and Links: the tally test's order follows it.

- [ ] **Step 4: The component**

```tsx
// packages/client/src/features/delve/arena/hud/GainFeed.tsx
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { addHaul, emptyHaul, findItem, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { routeToasts } from '@/components/Toast';
import { getDelveRegistry } from '../../registry';
import { FADE_MS, feedAfter, feedNotice, feedTally, feedText, type FeedLine } from './gain-feed';

/**
 * The lean HUD's top left (the pad-first spec, 3): what the dive picks up as lines (`gain-feed.ts`),
 * from its haul and banked and the items it found, diffed on each change of the save; what it held
 * when the feed mounted makes no line. While `live` (the fight running) every toast is a line too
 * (`routeToasts`). It never takes the pointer.
 */
export function GainFeed({ live }: { live: boolean }): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const drops = useDelveStore((s) => s.diveDrops);
  const tally = useMemo(() => {
    const dive = profile.dive;
    const items = drops.flatMap((uid): GearItem[] => {
      const found = findItem(profile, uid);
      return found ? [found.item] : [];
    });
    return feedTally(registry, dive ? addHaul(dive.haul, dive.banked) : emptyHaul(), items);
  }, [registry, profile, drops]);
  const before = useRef(tally);
  const [lines, setLines] = useState<FeedLine[]>([]);

  useEffect(() => {
    const prev = before.current;
    if (prev === tally) return;
    before.current = tally;
    setLines((ls) => feedAfter(ls, prev, tally, Date.now()));
  }, [tally]);

  useEffect(() => {
    if (!live) return;
    return routeToasts((text) => setLines((ls) => feedNotice(ls, text, Date.now())));
  }, [live]);

  // Each line goes at its time: wake for the next one due.
  useEffect(() => {
    if (lines.length === 0) return;
    const next = Math.min(...lines.map((l) => l.until));
    const t = setTimeout(
      () => setLines((ls) => ls.filter((l) => l.until > Date.now())),
      Math.max(0, next - Date.now()),
    );
    return () => clearTimeout(t);
  }, [lines]);

  return (
    <ol
      className="pointer-events-none m-0 flex w-[380px] list-none flex-col gap-1 p-0"
      aria-live="polite"
      data-testid="gain-feed"
    >
      {lines.map((line) => (
        <FeedRow key={line.key} line={line} />
      ))}
    </ol>
  );
}

/** One line, fading out over its last `FADE_MS` (again from full when a gain holds it longer). */
function FeedRow({ line }: { line: FeedLine }): ReactElement {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const left = line.until - Date.now();
    const anim = ref.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], {
      duration: FADE_MS,
      delay: Math.max(0, left - FADE_MS),
      fill: 'forwards',
    });
    return () => anim?.cancel();
  }, [line.until]);
  return (
    <li
      ref={ref}
      className="k-disp w-fit bg-[var(--k-well)]/80 px-3 py-1 text-[20px] [text-shadow:2px_2px_0_#181425]"
      style={{ color: line.color }}
      data-key={line.key}
      data-testid="feed-line"
    >
      {feedText(line)}
    </li>
  );
}
```

  Check before running: `findItem(profile, uid)` returns `{ item, where } | null` as `FoundLog`'s `useFloorFinds` uses it; `addHaul` and `emptyHaul` are engine exports (`PurseBar` imports `addHaul`). `bg-[var(--k-well)]/80` is Tailwind v4's opacity on an arbitrary colour; if it doesn't compile to a translucent well, use `style={{ background: 'rgb(24 20 37 / 0.8)' }}` (`--k-well`'s `#181425`). Under StrictMode the tally effect runs twice: the second run sees `prev === tally` and does nothing.

- [ ] **Step 5: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/gain-feed.test.ts src/features/delve/arena/hud/__tests__/GainFeed.test.tsx)`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/delve/arena/hud
git commit -m "feat(client): the gain feed: each pickup a line for a few seconds, a kind merging as it grows, notices joining it"
```

---

### Task 4: the lean corner and the compact tracker

**Files:**
- Create: `packages/client/src/features/delve/arena/hud/LeanCorner.tsx`
- Modify: `packages/client/src/features/delve/quests/QuestTracker.tsx` (`compact`)
- Test: `packages/client/src/features/delve/arena/hud/__tests__/LeanCorner.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/features/delve/arena/hud/__tests__/LeanCorner.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../../registry';
import { SAMPLE_QUESTS } from '../../../quests/__tests__/quest-fixture';
import { LeanCorner } from '../LeanCorner';

const store = () => useDelveStore.getState();

describe('LeanCorner', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().startDive(1);
  });

  const corner = (quests = SAMPLE_QUESTS) => {
    const on = { onMenu: vi.fn(), onJournal: vi.fn() };
    const dive = store().profile.dive!;
    render(
      <LeanCorner
        dive={dive}
        biome={getDelveRegistry().getBiomeForDepth(dive.depth)}
        quests={quests}
        map={null}
        {...on}
      />,
    );
    return on;
  };

  it('holds the depth, the minimap and one tracked objective, on its line', () => {
    corner();
    const root = screen.getByTestId('lean-corner');
    expect(within(root).getByTestId('depth-label')).toHaveTextContent('DEPTH 1');
    expect(within(root).getByTestId('minimap')).toHaveAttribute('data-tutorial', 'hud.minimap');
    const [first, second] = SAMPLE_QUESTS.filter((q) => q.tracked);
    const line = within(root).getByTestId(`tracked-${first.id}`);
    expect(line).toHaveTextContent(first.name);
    expect(line).toHaveTextContent(first.objectives.find((o) => !o.done)!.text);
    expect(within(root).queryByTestId(`tracked-${second.id}`)).toBeNull();
    expect(within(root).queryByRole('progressbar')).toBeNull();
  });

  it('with no tracked quest (or a guided step on the floor) holds no objective line', () => {
    corner([]);
    expect(screen.queryByTestId('quest-tracker')).toBeNull();
  });

  it("Journal and Menu for the mouse, the pad's and the keys' targets in the fight", () => {
    const on = corner();
    const journal = screen.getByTestId('lean-corner').querySelector<HTMLElement>('[data-pad-journal]')!;
    fireEvent.click(journal);
    expect(on.onJournal).toHaveBeenCalledOnce();
    const menu = screen.getByRole('button', { name: 'Dive menu' });
    expect(menu).toHaveAttribute('data-pad-menu');
    fireEvent.click(menu);
    expect(on.onMenu).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/LeanCorner.test.tsx)`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: `QuestTracker`'s `compact`.** It takes `compact?: boolean`; when set it returns (after the existing `if (shown.length === 0) return null;`, so a quest is shown), in place of the panel, the first tracked quest as one line, with the same test ids (so `delve-quests.spec.ts` Q01 reads either HUD):

```tsx
  if (compact) {
    const q = shown[0];
    const o = q.objectives.find((x) => !x.done);
    return (
      <div className="flex min-w-0 text-[15px]" data-testid="quest-tracker">
        <div className="flex min-w-0 items-baseline gap-2" data-testid={`tracked-${q.id}`}>
          <span className="k-disp truncate text-[17px]" style={{ color: QUEST_KIND[q.kind].text }}>
            {q.name}
          </span>
          <span className="truncate">{o ? o.text : 'Ready to claim'}</span>
          {o && <b className="k-disp flex-none text-[16px] text-[var(--k-hot-hi)]">{objectiveCount(o)}</b>}
        </div>
      </div>
    );
  }
```

  Its doc comment gains: "With `compact` (the lean HUD's corner), one line: the first tracked quest and its next objective."

- [ ] **Step 4: `LeanCorner`**

```tsx
// packages/client/src/features/delve/arena/hud/LeanCorner.tsx
import type { ReactElement } from 'react';
import type { BiomeDef, DiveState } from '@alloy/engine';
import { useControlsStore } from '@/stores/controlsStore';
import { InputGlyph, Panel } from '../../kit';
import { QuestTracker } from '../../quests/QuestTracker';
import type { QuestView } from '../../quests/types';
import type { HudMap } from '../useArenaCore';
import { Minimap } from './Minimap';
import { noFocus } from './SkillSlot';

/**
 * The lean HUD's top right (the pad-first spec, 3): the depth and biome, the minimap, the first
 * tracked quest's next objective on one line, and small buttons for the mouse: Journal
 * (`data-pad-journal`) and Menu ("Dive menu", `data-pad-menu`), which the fight's View and Menu
 * press. The camera takes no inset for it (`HudGrid`'s `insetRight`).
 */
export function LeanCorner({
  dive,
  biome,
  quests,
  map,
  onMenu,
  onJournal,
}: {
  dive: DiveState;
  biome: BiomeDef;
  quests: QuestView[];
  map: HudMap | null;
  onMenu: () => void;
  onJournal: () => void;
}): ReactElement {
  const config = useControlsStore((s) => s.config);
  const small = 'flex min-h-8 items-center gap-[6px]';
  return (
    <aside aria-label="Floor" className="pointer-events-auto" data-testid="lean-corner">
      <Panel
        as="div"
        material="glass"
        scroll={false}
        title={<span data-testid="depth-label">DEPTH {dive.depth}</span>}
        aside={<span className="text-[14px] text-[var(--k-text-2)]">{biome.name}</span>}
      >
        <Minimap map={map} />
        <QuestTracker quests={quests} compact />
        <div className="flex items-center justify-end gap-4 text-[14px] text-[var(--k-text-2)]">
          <button type="button" className={small} data-pad-journal onMouseDown={noFocus} onClick={onJournal}>
            <InputGlyph
              binding={{ key: config.keys.journal ?? undefined, pad: config.pad.journal ?? undefined }}
              size="sm"
            />
            Journal
          </button>
          <button
            type="button"
            className={small}
            aria-label="Dive menu"
            data-pad-menu
            onMouseDown={noFocus}
            onClick={onMenu}
          >
            <InputGlyph binding={{ key: config.keys.menu ?? undefined, pad: config.pad.menu ?? undefined }} size="sm" />
            Menu
          </button>
        </div>
      </Panel>
    </aside>
  );
}
```

  `HudMap` is exported from `useArenaCore.ts` (the minimap imports it from there). Plan 04 adds a Map button here.

- [ ] **Step 5: Run it to see it pass, then the HUD's tests**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud src/features/delve/quests)`
Expected: PASS (the tracker's own tests are untouched: `compact` is off by default).

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/delve/arena/hud packages/client/src/features/delve/quests
git commit -m "feat(client): the lean HUD's corner: depth, minimap, one objective, Journal and Menu"
```

---

### Task 5: the camera's right inset

**Files:**
- Modify: `packages/client/src/features/delve/arena/hud/HudGrid.tsx`
- Test: `packages/client/src/features/delve/arena/hud/__tests__/HudGrid.test.tsx`

- [ ] **Step 1: Write the failing test** (beside "reports no right inset while the right column is empty, and again once it fills"; the file's `beforeEach` boxes the right column at 1556 px)

```tsx
  it("with insetRight off (the lean HUD) the right column takes no inset, however full; on again, it does", () => {
    const onInsets = vi.fn();
    const at = (insetRight: boolean) => (
      <HudGrid
        onInsets={onInsets}
        insetRight={insetRight}
        top={<div />}
        right={<div />}
        dock={<div data-testid="hero-hp" />}
      />
    );
    const { rerender } = render(at(false));
    expect(onInsets).toHaveBeenLastCalledWith({ top: 72, right: 0, bottom: 90, left: 0 });
    rerender(at(true));
    expect(onInsets).toHaveBeenLastCalledWith({ top: 72, right: 364, bottom: 90, left: 0 });
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/HudGrid.test.tsx -t "insetRight")`
Expected: FAIL, the right inset is 364.

- [ ] **Step 3: Implement.** `HudGridProps` gains

```ts
  /** Whether the right column takes the camera's right inset (true; the lean HUD's corner: false, so the camera centres on the hero). */
  insetRight?: boolean;
```

  `HudGrid` takes `insetRight = true`; in `measure`, `right: insetRight && r.childElementCount ? window.innerWidth - r.getBoundingClientRect().left : 0`; add `insetRight` to the effect's dependencies (`[hud, onInsets, insetRight]`). The doc comment's insets sentence gains "(0 while it is empty, or with `insetRight` off)".

- [ ] **Step 4: Run the file**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/HudGrid.test.tsx)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/arena/hud
git commit -m "feat(client): HudGrid's insetRight: the lean corner takes no camera inset"
```

---

### Task 6: `DelveRun` wears the chosen HUD

**Files:**
- Modify: `packages/client/src/pages/DelveRun.tsx`
- Test: `packages/client/src/pages/__tests__/DelveRun.test.tsx`, `packages/client/src/pages/__tests__/DelveRun.tutorial.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `DelveRun.test.tsx`: the existing tests encode the full HUD. Import `useUIStore` and `type Insets` (`@/features/delve/arena/camera`); add `insets: [] as Insets[]` to `seen`, and in the `useArena` mock push `opts.insets` (widen the mock's `opts` type with `insets: Insets`). In the existing `describe`'s `beforeEach`, add `useUIStore.setState({ hudMode: 'full' });` and `seen.insets.length = 0;`. Replace `screen.getByTestId('purse-bar').closest('.delve-hud-zoom')!` in "the pause makes the stop and the HUD behind it inert…" with `screen.getByTestId('dive-hud')`. Then add a second `describe` after it:

```tsx
describe('DelveRun (the lean HUD, the default)', () => {
  beforeAll(() => {
    if (!Element.prototype.animate)
      Element.prototype.animate = function () {
        return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
      };
  });
  beforeEach(() => {
    seen.pause.length = 0;
    seen.paused.length = 0;
    seen.insets.length = 0;
    vi.mocked(questStates).mockImplementation(() => []);
    useUIStore.setState({ hudMode: 'lean' });
    const registry = getDelveRegistry();
    useDelveStore.setState({
      profile: startDive(registry, createDelveProfile(registry, 7), 1),
      diveDrops: [],
      floorDropsFrom: 0,
    });
  });

  it('lays the gain feed top left and the corner top right; no purse bar, floor column or Found log', () => {
    renderRun();
    const hud = screen.getByTestId('dive-hud');
    expect(screen.getByTestId('gain-feed').closest('[data-hud="top"]')).not.toBeNull();
    expect(screen.getByTestId('lean-corner').closest('[data-hud="right"]')).not.toBeNull();
    expect(within(hud).getByTestId('depth-label')).toHaveTextContent('DEPTH 1');
    expect(within(hud).getByTestId('skill-bar')).toBeInTheDocument();
    for (const gone of ['purse-bar', 'pickup-feed', 'biome-element', 'rooms-explored'])
      expect(screen.queryByTestId(gone)).toBeNull();
  });

  it("the camera centres on the hero: the corner takes no right inset (the full HUD's column does)", () => {
    renderRun();
    expect(seen.insets.at(-1)!.right).toBe(0);
    act(() => useUIStore.setState({ hudMode: 'full' }));
    expect(seen.insets.at(-1)!.right).toBeGreaterThan(0);
  });

  it("the corner's Menu opens the pause, its Journal the pause on Quests", () => {
    renderRun();
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
    expect(pauseLink()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    fireEvent.click(screen.getByTestId('lean-corner').querySelector<HTMLElement>('[data-pad-journal]')!);
    expect(pauseLink()).toEqual({ tab: 'quests' });
  });

  it('a pattern learned is a line of the gain feed while the fight is live', () => {
    renderRun();
    act(() => seen.onUi!({ kind: 'patterns', ids: ['maul'] }));
    expect(within(screen.getByTestId('gain-feed')).getByText('Pattern learned: Maul')).toBeInTheDocument();
  });
});
```

  jsdom lays nothing out, so the full HUD's right inset is `window.innerWidth − 0` (its column has children), and the lean one's 0: the inset test holds without boxes.

  In `DelveRun.tutorial.test.tsx`, "at a stop the save's step shows in the stop's own strip…": `screen.getByTestId('purse-bar').closest('.delve-hud-zoom')` becomes `screen.getByTestId('dive-hud')`. Its "one goal on screen: the tracker gives way" test passes in the lean HUD as it is (the compact tracker keeps `quest-tracker`).

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx src/pages/__tests__/DelveRun.tutorial.test.tsx)`
Expected: FAIL on the new cases and on `dive-hud` (not found).

- [ ] **Step 3: Implement.** In `DelveRun.tsx` import `useUIStore`, `GainFeed` and `LeanCorner`; beside `manualAttack`:

```tsx
  // Settings → HUD (the pad-first spec, 3): the lean HUD by default, today's full one by choice.
  const lean = useUIStore((s) => s.hudMode) === 'lean';
```

  and the grid:

```tsx
      <HudGrid
        testId="dive-hud"
        onInsets={setInsets}
        insetRight={!lean}
        inert={!!pause || choosing || asking || fallen}
        hidden={choosing && !finished}
        top={
          lean ? (
            <GainFeed live={!paused} />
          ) : (
            <PurseBar dive={dive} onMenu={openMenu} onJournal={openJournal} />
          )
        }
        right={
          lean ? (
            <LeanCorner
              dive={dive}
              biome={biome}
              // One goal on screen: the tracked quests give way to a guided step.
              quests={guidedFloor ? [] : quests}
              map={arena.hud?.map ?? null}
              onMenu={openMenu}
              onJournal={openJournal}
            />
          ) : (
            <FloorColumn
              dive={dive}
              biome={biome}
              hud={arena.hud}
              quests={guidedFloor ? [] : quests}
              onInspect={openItem}
              onJournal={openJournal}
            />
          )
        }
        // dock and centre as they are
      />
```

  `ToastContainer` stays at the page's foot: it shows every toast raised while the fight is not live.

- [ ] **Step 4: Run the pages, then the suite**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: types clean; all passing (the baseline plus this phase's tests so far).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages
git commit -m "feat(client): the dive wears the lean HUD by default: the gain feed, the corner, the camera on the hero"
```

---

### Task 7: the E2E under the lean HUD

**Files:**
- Modify: `packages/client/e2e/fixtures/delve.ts` (`useFullHud`)
- Modify: `packages/client/e2e/delve.spec.ts` (D02, D03, D07, D11)
- Modify: `packages/client/e2e/delve-tutorial.spec.ts` (TU01)
- Create: `packages/client/e2e/delve-hud.spec.ts` (H01)

Each E2E that reads a part only the full HUD has: `grep -n "purse-\|pickup-feed\|feed-material\|rooms-explored\|biome-element\|monsters-left\|upgrades-locked\|\"bounty\"\|'bounty'" packages/client/e2e/*.spec.ts packages/client/e2e/responsive/specs/*.ts`. What the lean HUD keeps under the same ids (`depth-label`, `minimap`, `quest-tracker` / `tracked-<id>`, the "Dive menu" button, `[data-pad-journal]`, the dock) needs nothing: D01, D05, Q01, O01 and the gamepad specs pass as they are.

- [ ] **Step 1: The fixture** (in `e2e/fixtures/delve.ts`)

```ts
/** The dive's full HUD (the purse bar, the floor column and the Found log), for a test that reads it. Call after `seedProfile`. */
export async function useFullHud(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('alloy:delve:hud', 'full'));
}
```

  (It runs after `seedProfile`'s script on each load, so its key survives that script's one-time clear.)

- [ ] **Step 2: The call sites.**
  - **D02** (the Found log) and **D11** (`purse-materials`, the log's `feed-material`): `await useFullHud(page);` after `seedProfile`.
  - **D03** and **D07** read `rooms-explored` only to know the next floor is up: replace it with `await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });` (as D06 and the responsive dive spec wait for the arena).
  - **TU01**: `await expect(page.getByTestId('purse-bar')).toBeHidden();` becomes `await expect(page.getByTestId('dive-hud')).toBeHidden();` (the HUD is laid out under the stop, not drawn).

- [ ] **Step 3: H01, the lean HUD itself.**

```ts
// packages/client/e2e/delve-hud.spec.ts
import { test, expect } from '@playwright/test';
import { ARENA_READY, FLOOR_CLEAR, seedProfile, startDive } from './fixtures/delve';

// The lean HUD (the pad-first spec, 3): the default; the gain feed, the corner, Full by choice.
test.describe('Delve HUD', () => {
  test.describe.configure({ timeout: 240_000 });

  test('H01: lean by default: the corner and a gain feed that grows with the pickups; Settings → Full brings back the purse', async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await startDive(page);
    const corner = page.getByTestId('lean-corner');
    await expect(corner).toBeVisible({ timeout: ARENA_READY });
    await expect(corner.getByTestId('depth-label')).toHaveText('DEPTH 1');
    await expect(corner.getByTestId('minimap')).toBeVisible();
    await expect(page.getByTestId('purse-bar')).toHaveCount(0);
    await expect(page.getByTestId('pickup-feed')).toHaveCount(0);
    // The bot picks things up: a count line top left ("+12 Scrap"), one line a kind.
    const feed = page.getByTestId('gain-feed');
    await expect(feed.getByTestId('feed-line').filter({ hasText: /^\+[\d,]+ / }).first()).toBeVisible({
      timeout: FLOOR_CLEAR,
    });
    const keys = await feed.getByTestId('feed-line').evaluateAll((ls) => ls.map((l) => l.getAttribute('data-key')));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeLessThanOrEqual(5);
    expect(await feed.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    // Settings → HUD → Full, from the pause list.
    await page.keyboard.press('Escape');
    await page.getByTestId('open-settings').click();
    await page.getByTestId('hud-mode-full').click();
    await page.keyboard.press('Escape'); // Settings
    await page.keyboard.press('Escape'); // the list: Resume
    await expect(page.getByTestId('purse-bar')).toBeVisible();
    await expect(corner).toHaveCount(0);
  });
});
```

  The bot may die or clear the floor before a count line shows on a loaded machine: if H01 flakes there, wait on `feed-line` or `door-choice`, and when the stop came first, read the stop's `stop-finds` for a non-zero material count instead (the feed's lines are gone by then).

- [ ] **Step 4: Run the Delve E2E on one project**

Run: `(cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-hud.spec.ts e2e/delve-quests.spec.ts e2e/delve-tutorial.spec.ts e2e/delve-room-objects.spec.ts e2e/delve-gamepad.spec.ts --project=desktop)`
Expected: PASS (background it; a 10-minute timeout).

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e
git commit -m "test(client): the E2E under the lean HUD (useFullHud where a test reads the purse or the Found log); H01"
```
