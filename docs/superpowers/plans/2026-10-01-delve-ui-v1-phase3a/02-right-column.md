# Delve UI v1 · Phase 3a · 3B: The right column — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dive HUD's right column, `FloorColumn` (the spec's `FloorColumnProps`): a glass floor panel (`DEPTH N` and the biome, a 150 px `Minimap` canvas, what the floor resists and is weak to, the foes left and the bounty), the `QuestTracker` (null in v1), and the "Found this floor" log, `FoundLog`, which takes over from `PickupFeed` (its ids `pickup-feed`, `loot-item`, `upgrades-locked`, `upgrades-potential` and `feed-rune` kept). The store marks where each floor begins in the dive's finds (`floorDropsFrom`, `floorRunesFrom`).

**Architecture:** Three new files under `features/delve/arena/hud/`. `Minimap` is a DOM `<canvas>` (2D, smoothing off) whose backing store is its zoomed `getBoundingClientRect` × `devicePixelRatio`, re-measured on resize and on a `hudScale` change; a pure `drawMinimap(ctx, map, w, h)` fits the arena at `floor(min(w/W, h/H))` device px per unit, centred, and draws the terrain, the border, the camera's view, the drops, the foes (elites and the boss bigger) and the hero; the canvas redraws whenever `map` changes. `FoundLog` reads the store (the dive's lists past the floor's marks) and fits as many 32 px rows as its height holds (its box ÷ `layerZoom`), then "+n more". `FloorColumn` composes the floor panel, `<QuestTracker quests onJournal />` and `<FoundLog onInspect />`. The store sets the marks in `commit` whenever the dive enters a new fighting floor, so neither `useArena.ts` (3C) nor `DelveRun.tsx` (3A) changes for them. No engine change.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, Vitest 3 (jsdom, Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md`: "Phase 3 → 3a" → "Right column (`FloorColumn`)", the contract (`HudMap`, `FloorColumnProps`), "Parallel areas in 3a" (3B's row); decided items 4 (minimap), 5 (quests), 13 (`RARITY_TEXT`), 21 ("Found this floor"), 27 (no emoji), 30 (ids kept), 32 (coordinates under zoom), 33 (14 px minimum); "Accessibility". The overview is `00-overview.md` in this folder. Mockup: the right column of `Arena-HUD.dc.html` (`<aside aria-label="Floor, quests and finds">`).

---

## Base

- **Starts from:** branch `ui/p3a` (from `ui/p2` after its review fixes, v0.55.0), in this area's worktree `C:/Projects/alloy-ui-3b` (`git worktree add ../alloy-ui-3b -b ui/p3a-3b ui/p3a`, the overview's junctions, the client's `@alloy/engine` pointing at the worktree's own engine). Every path below is relative to that worktree's root, `/c/Projects/alloy-ui-3b` in Git Bash.
- **Nothing must merge first.** 3B codes against the spec's contract: `HudMap` is declared in `Minimap.tsx` until 3C's snapshot carries it (Task 7 swaps it at integration), and the tests use fixtures.
- **Tasks 6 and 7 run at integration**, on `ui/p3a` in `C:/Projects/alloy-ui-p3a`: Task 6 once 3A is merged (its `DelveRun.tsx` no longer imports `PickupFeed`), Task 7 once 3C is merged (`ArenaHud.map: HudMap`).
- **Anchors:** every anchor below was checked against `ui/p2` at `895fb0a`; `ui/p2`'s later review fixes (to `89e6af1`) touch none of this area's files (`delveStore.ts`, `quests/`, `LootTray.test.tsx`, `arena/`).
- **Before Task 1:** build the engine once for the junction and measure the client:

```bash
cd /c/Projects/alloy-ui-3b
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the suite passes. At `895fb0a` it reads **1087 tests in 139 files**. Call the measured counts **N tests in F files**. Tasks 1–5 end at **N + 16 tests in F + 3 files**; Task 6 removes 3 tests (the old feed's, moved in Task 3); Task 7 changes no count.

## Files

| File | Change |
|---|---|
| `packages/client/src/stores/delveStore.ts` | `floorDropsFrom`, `floorRunesFrom`: set in `commit` when a fighting floor begins, zeroed by `startDive` and `resetProfile`, moved back as `pushDiveDrops` / `pushDiveRunes` trim the oldest past 60 |
| `packages/client/src/stores/delveStore.test.ts` | the marks across floors, a new dive and the trim |
| `packages/client/src/features/delve/arena/hud/Minimap.tsx` (new) | `HudMap` (until Task 7), `drawMinimap`, `Minimap({ map })` (`minimap`) |
| `packages/client/src/features/delve/arena/hud/FoundLog.tsx` (new) | `FoundLog({ onInspect })`: `pickup-feed`, `upgrades-locked`, `upgrades-potential`, `loot-item` rows with the inline `ItemTooltip`, `feed-rune` rows, "+n more" |
| `packages/client/src/features/delve/arena/hud/FloorColumn.tsx` (new) | `FloorColumnProps`, `FloorColumn`: the floor panel (`depth-label`, `minimap`, `biome-element`, `monsters-left`, the bounty), `QuestTracker`, `FoundLog` |
| `packages/client/src/features/delve/arena/hud/__tests__/{Minimap,FoundLog,FloorColumn}.test.tsx` (new) | each component; `FoundLog`'s carry the old feed's assertions |
| `packages/client/src/features/delve/quests/QuestTracker.tsx` | optional `onJournal`: the Journal hint becomes a button; the panel takes pointer events |
| `packages/client/src/features/delve/quests/__tests__/QuestTracker.test.tsx` | the Journal button |
| `packages/client/src/features/delve/arena/PickupFeed.tsx` | **Deleted** (Task 6, at integration) |
| `packages/client/src/features/delve/__tests__/LootTray.test.tsx` | its three `PickupFeed` tests go (Task 6; moved to `FoundLog.test.tsx` in Task 3) |

`QuestTracker.tsx` is 2D's file from Phase 2; "the `QuestTracker` wiring" is this area's, and no other 3a area edits it. `LootTray.test.tsx` holds the feed's tests; no 3a area owns `LootTray` (3E, in 3b).

## Cross-area needs

**X1 · 3A (`pages/DelveRun.tsx`), composing the column.**
1. `const { quests } = useQuests();` (from `@/features/delve/quests/useQuests`) and, as `HudGrid`'s `right`:
   `<FloorColumn dive={dive} biome={biome} hud={arena.hud} quests={quests} onInspect={openItem} onJournal={…} />`
   where `openItem` is today's (`markSeen` then the `ItemDetailSheet`), and `onJournal` is whatever the purse's Journal does in 3a (nothing until 3b).
2. `FloorColumn`'s root is `<aside class="flex h-full min-h-0 flex-col gap-4">`: render it as the grid item of column 3, rows 1–2 (or inside a wrapper with `height: 100%`), so the Found log can take the column's remaining height. The panels set `pointer-events: auto` themselves (the grid has none).
3. Drop `PickupFeed`'s import and its `<PickupFeed onSelect={openItem} top={…} />` (the rewrite does), so Task 6 can delete the file.
4. The `bounty` test id belongs to the purse's "+N banks on extract" (the spec's purse bar). The floor panel shows the bounty too but carries no id, so `getByTestId('bounty')` stays unique.

**X2 · 3C (`useArenaCore.ts`), the snapshot's `map`.** The spec's `HudMap`, exported from `useArenaCore.ts` beside `ArenaHud` (Task 7 imports it from there; if 3C exports it elsewhere, Task 7's two `import type` lines take that path), and `ArenaHud.map: HudMap`. What the minimap expects in it: arena units with `(0, 0)` at the arena's top-left corner and `y` down (the world's own); `view` the renderer's `viewRect()` (the arena when the renderer is null); `drops[].color` the drop's rarity colour (`RARITY_COLOR`), a rune's in its family colour; `foes[].rank` `'boss'` for the boss, `'elite'` for an elite. A new object on every refresh (the canvas redraws on identity).

**X3 · The integrator.** Task 6 after 3A merges; Task 7 after 3C merges. The E2E notes are under "Verification".

## Where the spec left room

- **"When a floor begins."** The marks are set in the store's `commit` whenever the saved dive enters `phase: 'fighting'` from another phase or at another depth (a door taken), so they follow every path into a floor without touching `useArena.ts` or `DelveRun.tsx`. `startDive` and `resetProfile` zero them. A floor that restarts at the same depth (back to the Anvil and Resume) keeps its mark: its finds were found on that depth.
- **The 60-entry cap.** `diveDrops` and `diveRunes` are newest first and keep 60, so a floor's finds are `diveDrops.slice(0, diveDrops.length - floorDropsFrom)`, and a push that trims the oldest moves the mark back by as many (never below 0). Without that, a long dive's later floors would show nothing.
- **Order.** The two lists share no clock, so the log shows this floor's items newest first, then its runes grouped as the old feed grouped them ("Split III ×2"), each with "rune" at the end. The items come first because they are what a click opens.
- **The counts.** `upgrades-locked` ("▲ 2 to equip at the Anvil") and `upgrades-potential` ("◇ 1 potential: Transfer at the Anvil") keep the old feed's text, counted over this floor's finds like the rows. The marks use the Loadout's `deltaMark` (`ItemTile.tsx`): ▲ better as it is, ◇ better only as a home for your moveset, ▼ worse, none when worn. Each row's accessible name says it ("Sun Grasp, upgrade").
- **Rows.** 32 px, a `#181425` well, 14 px text: a 10 px swatch (`RARITY_COLOR`), the name in `RARITY_TEXT` (all pass on a well), the mark (▲ `--k-ok`, ◇ `--k-mana`, ▼ `--k-bad`, a glyph only). A rune's swatch is its family colour and its name is white. "As many as fit": the list fills the column's remaining height (`flex: 1`), and its height ÷ `layerZoom` (decided item 32) gives the rows; the "+n more" line takes the last row. Before a first measure (jsdom) every row shows. The empty floor reads "Nothing found on this floor yet."; the panel stays, so the column never jumps.
- **Hover and click.** `ItemTooltip` inline (`portal={false}`), placed left of the row (the column is at the window's right edge). A rune row is not a button: there is no rune sheet to open.
- **The floor panel.** The title `DEPTH N` keeps today's text (`k-section` uppercases anyway), so E2E D01's `toHaveText('DEPTH 1')` and its `not.toHaveText` stay exact. The biome name sits in `--k-text-2` (biome accents are not checked for contrast); today's door name after it goes (the spec's header is the depth and the biome). The two element tiles are wells with the element's glyph and white text: "Resists Frost", "Weak to Fire". `monsters-left` reads "12 foes left" and shows once the arena reports (`hud` set), as today; a cleared floor reads "0 foes left".
- **The minimap's look.** Kit colours: border `#5a6988`, terrain `#3a4466`, the view `#2ce8f5`, foes `#e43b44`, the hero `#fee761`, drops their own. Lines are `max(1, round(s/3))` device px; dots are 0.8 units (a normal foe, a drop), 1.3 (an elite), 2 (the boss), 1.2 (the hero), never under 2 device px. At 1920×1080 the 308 × 150 box fits the 26 × 40 arena at 3 px per unit; at the 0.75 floor, 2. Everything is drawn with `fillRect` on whole device pixels, so nothing blurs.
- **Journal.** `FloorColumnProps.onJournal` reaches the tracker's "Journal" hint, which becomes a button when given. In v1 the tracker renders nothing (no quests), so this matters only under the dev quest preview. `JOURNAL_BINDING` stays the hint's glyph (J / View, the new `journal` action's default).

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `ui/p3a-3b` (Tasks 6 and 7 on `ui/p3a`, at integration), staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd` to it.
- **Line endings:** a fresh worktree checks out `delveStore.ts`, `delveStore.test.ts`, `QuestTracker.tsx`, `QuestTracker.test.tsx` and `LootTray.test.tsx` CRLF; keep each file's own (the Edit tool does; never `sed -i` them, which drops the CRs). New files are written LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** every file the commit blocks format passed `npx prettier --check --end-of-line auto` at the base or is new, and the code below is already formatted (checked on the scratch copy), so `--write` changes nothing typed as written.
- **How the edits read** (the 4a plan's language): "Replace: A with: B" is one Edit. "Replace the lines from `A` up to (not including) `B` with: C" is one Edit from the start of the line reading `A` (ignoring its indentation) to the end of the line before the one reading `B`; a blank line at C's end stays. "Delete the lines from `A` up to (not including) `B`." removes them. "Append at the end of the file:" adds a blank line and the block after the last line. "Create `f`:" is a Write. Every anchor is unique in its file at that point; apply each file's edits top to bottom.
- **Checked on a scratch copy:** `ui/p2` at `895fb0a` (`git archive`, junctions to the main tree's `node_modules`, the engine built once). Every task's FAIL and PASS below was run there in order; the client suite went from 1087 tests in 139 files to 1103 in 142 after Task 5, the typecheck stayed clean, and every touched file passed `prettier --check`. Task 6 was run with `DelveRun.tsx`'s `PickupFeed` lines removed (standing in for 3A): typecheck clean, `LootTray.test.tsx` 6 of 6. Task 7 was run with a stand-in `HudMap` and `ArenaHud.map` in `useArenaCore.ts` (standing in for 3C): this area's files typecheck and its 13 tests pass.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Engine bundle (once) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |

---

## Chunk 1: The floor's marks, the minimap and the Found log

### Task 1: The store marks where each floor begins

**Files:**
- Modify: `packages/client/src/stores/delveStore.ts`
- Modify: `packages/client/src/stores/delveStore.test.ts`

- [ ] **Step 1: The failing test**

In `packages/client/src/stores/delveStore.test.ts`, append at the end of the file:

```ts
describe("delveStore: the floor's finds", () => {
  beforeEach(() => {
    localStorage.clear();
    s().resetProfile(1234, 'fire');
  });

  /** The dive's state as a bank, a clear or a door leaves it. */
  const at = (phase: 'fighting' | 'choosing', depth: number) =>
    s().setProfile({ ...s().profile, dive: { ...s().profile.dive!, phase, depth } });
  const floorDrops = () => s().diveDrops.slice(0, s().diveDrops.length - s().floorDropsFrom);

  it("marks where each floor begins in the dive's drops and runes", () => {
    s().pushDiveDrops(['before']);
    expect(s().startDive(1)).toBe(true);
    expect(s()).toMatchObject({ floorDropsFrom: 0, floorRunesFrom: 0 });
    s().pushDiveDrops(['a', 'b']);
    s().pushDiveRunes([{ id: 'split', tier: 1 }]);
    at('fighting', 1);
    at('choosing', 1);
    expect(s()).toMatchObject({ floorDropsFrom: 0, floorRunesFrom: 0 });
    at('fighting', 2);
    expect(s()).toMatchObject({ floorDropsFrom: 2, floorRunesFrom: 1 });
    s().pushDiveDrops(['c']);
    expect(floorDrops()).toEqual(['c']);
    s().closeDive();
    expect(s().startDive(1)).toBe(true);
    expect(s()).toMatchObject({ floorDropsFrom: 0, floorRunesFrom: 0 });
  });

  it('keeps the mark on its floor as the oldest drops fall off', () => {
    s().startDive(1);
    s().pushDiveDrops(Array.from({ length: 50 }, (_, i) => `a${i}`));
    at('choosing', 1);
    at('fighting', 2);
    s().pushDiveDrops(Array.from({ length: 15 }, (_, i) => `b${i}`));
    expect(s().diveDrops).toHaveLength(60);
    expect(floorDrops()).toEqual(Array.from({ length: 15 }, (_, i) => `b${14 - i}`));
  });
});
```

(`s` is the file's module-level `() => useDelveStore.getState()`, declared above `describe('delveStore: runes in the draft', …)`.)

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts)`
Expected: FAIL, 2 of the file's tests: `AssertionError: expected { …(42) } to match object { floorDropsFrom: +0, …(1) }` and `AssertionError: expected [] to deeply equal [ 'b14', 'b13', 'b12', 'b11', …(11) ]`.

- [ ] **Step 3: The marks**

In `packages/client/src/stores/delveStore.ts`:

Replace:

```ts
  /** Runes picked up this dive, newest first (session only). */
  diveRunes: RuneRef[];
```

with:

```ts
  /** Runes picked up this dive, newest first (session only). */
  diveRunes: RuneRef[];
  /**
   * The lengths of `diveDrops` and `diveRunes` when this floor began: the floor's finds are
   * `diveDrops.slice(0, diveDrops.length - floorDropsFrom)` (the Found log, the stop).
   */
  floorDropsFrom: number;
  floorRunesFrom: number;
```

Replace:

```ts
    saveProfile(profile);
    // The chain draft belongs to one weapon: equipping another (or a transfer) drops it.
    const draft = get()?.chainDraft;
    const kept = !draft || profile.equipped.weapon?.uid === draft.uid;
    set(kept ? { profile } : { profile, chainDraft: null });
```

with:

```ts
    saveProfile(profile);
    const prev = get();
    // The chain draft belongs to one weapon: equipping another (or a transfer) drops it.
    const draft = prev?.chainDraft;
    const kept = !draft || profile.equipped.weapon?.uid === draft.uid;
    // A floor begins (a door taken): its finds are what the dive picks up from here.
    const was = prev?.profile.dive;
    const now = profile.dive;
    const floor =
      prev && now?.phase === 'fighting' && (was?.phase !== 'fighting' || was.depth !== now.depth)
        ? { floorDropsFrom: prev.diveDrops.length, floorRunesFrom: prev.diveRunes.length }
        : {};
    set(kept ? { profile, ...floor } : { profile, ...floor, chainDraft: null });
```

Replace:

```ts
    diveRunes: [],
    manualAttack: loadManualAttack(),
```

with:

```ts
    diveRunes: [],
    floorDropsFrom: 0,
    floorRunesFrom: 0,
    manualAttack: loadManualAttack(),
```

Replace:

```ts
        diveRunes: [],
        notices: [],
```

with:

```ts
        diveRunes: [],
        floorDropsFrom: 0,
        floorRunesFrom: 0,
        notices: [],
```

Replace:

```ts
      set({ diveDrops: [], diveRunes: [], chainDraft: null });
```

with:

```ts
      set({
        diveDrops: [],
        diveRunes: [],
        floorDropsFrom: 0,
        floorRunesFrom: 0,
        chainDraft: null,
      });
```

Replace:

```ts
      if (uids.length === 0) return;
      set({ diveDrops: [...uids.slice().reverse(), ...get().diveDrops].slice(0, 60) });
    },

    pushDiveRunes: (runes) => {
      if (runes.length === 0) return;
      set({ diveRunes: [...runes.slice().reverse(), ...get().diveRunes].slice(0, 60) });
    },
```

with:

```ts
      if (uids.length === 0) return;
      const all = [...uids.slice().reverse(), ...get().diveDrops];
      // The oldest fall off the end, and the floor's mark moves back with them.
      const cut = Math.max(0, all.length - 60);
      set({
        diveDrops: all.slice(0, 60),
        floorDropsFrom: Math.max(0, get().floorDropsFrom - cut),
      });
    },

    pushDiveRunes: (runes) => {
      if (runes.length === 0) return;
      const all = [...runes.slice().reverse(), ...get().diveRunes];
      const cut = Math.max(0, all.length - 60);
      set({
        diveRunes: all.slice(0, 60),
        floorRunesFrom: Math.max(0, get().floorRunesFrom - cut),
      });
    },
```

(`startDive`'s own `set` runs after its `commit`, which has just marked the new dive's first floor at the last dive's lengths; the zeros put it at the start of the emptied lists.)

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts)`
Expected: PASS, the file's tests all green.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 2 tests in F files** pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3b
(cd packages/client && npx prettier --write --end-of-line auto src/stores/delveStore.ts src/stores/delveStore.test.ts)
git add packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts
git commit -m "feat(client): the store marks where each floor begins in the dive's finds" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: The minimap

**Files:**
- Create: `packages/client/src/features/delve/arena/hud/Minimap.tsx`
- Create: `packages/client/src/features/delve/arena/hud/__tests__/Minimap.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/arena/hud/__tests__/Minimap.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Minimap, drawMinimap, type HudMap } from '../Minimap';

/** A 2D context that records what is filled, in what colour. */
function fakeContext() {
  const fills: { x: number; y: number; w: number; h: number; color: string }[] = [];
  const ctx = {
    fillStyle: '',
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ x, y, w, h, color: String(this.fillStyle) });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, clear: ctx.clearRect };
}

const MAP: HudMap = {
  width: 26,
  height: 40,
  view: { left: -5, top: 20, right: 10, bottom: 47 },
  hero: { x: 13, y: 36 },
  foes: [
    { x: 5, y: 5, rank: 'normal' },
    { x: 10, y: 5, rank: 'elite' },
    { x: 20, y: 5, rank: 'boss' },
  ],
  drops: [{ x: 13, y: 30, color: '#f77622' }],
  terrain: [{ x: 2, y: 2, w: 2, h: 1 }],
};

describe('drawMinimap', () => {
  it('fits the arena at whole device px per unit, centred, smoothing off', () => {
    const { ctx, fills } = fakeContext();
    drawMinimap(ctx, MAP, 300, 150);
    expect(ctx.imageSmoothingEnabled).toBe(false);
    // floor(min(300 / 26, 150 / 40)) = 3 px per unit: 78 × 120, centred at (111, 15).
    const border = fills.filter((f) => f.color === '#5a6988');
    expect(border).toHaveLength(4);
    expect(border[0]).toEqual({ x: 111, y: 15, w: 78, h: 1, color: '#5a6988' });
    // A terrain cell at (2, 2), 2 × 1 units.
    expect(fills[0]).toEqual({ x: 117, y: 21, w: 6, h: 3, color: '#3a4466' });
  });

  it('draws the view clipped to the arena, the drops, the foes (elites and the boss bigger) and the hero last', () => {
    const { ctx, fills } = fakeContext();
    drawMinimap(ctx, MAP, 300, 150);
    const view = fills.filter((f) => f.color === '#2ce8f5');
    // From (0, 20) to (10, 40) in units: x 111..141, y 75..135.
    expect(view[0]).toEqual({ x: 111, y: 75, w: 30, h: 1, color: '#2ce8f5' });
    expect(fills.some((f) => f.color === '#f77622')).toBe(true);
    const foes = fills.filter((f) => f.color === '#e43b44').map((f) => f.w);
    expect(foes[0]).toBeLessThan(foes[1]);
    expect(foes[1]).toBeLessThan(foes[2]);
    const hero = fills.at(-1)!;
    expect(hero.color).toBe('#fee761');
    expect(hero.x + hero.w / 2).toBe(111 + 13 * 3);
  });
});

describe('Minimap', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sizes its backing store from its box × devicePixelRatio and redraws when the map changes', () => {
    const { ctx, clear } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 231,
      height: 112.5,
    } as DOMRect);
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
    const { rerender } = render(<Minimap map={MAP} />);
    const canvas = screen.getByTestId('minimap') as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([462, 225]);
    expect(clear).toHaveBeenCalledTimes(1);
    rerender(<Minimap map={MAP} />);
    expect(clear).toHaveBeenCalledTimes(1);
    rerender(<Minimap map={{ ...MAP, hero: { x: 12, y: 30 } }} />);
    expect(clear).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/Minimap.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../Minimap" from "src/features/delve/arena/hud/__tests__/Minimap.test.tsx". Does the file exist?`

- [ ] **Step 3: The minimap**

Create `packages/client/src/features/delve/arena/hud/Minimap.tsx`:

```tsx
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { useUiScale } from '../../kit';
import type { ViewRect } from '../fx/pixel-layer';

/** The floor as the minimap draws it: the snapshot's `map` (the spec's contract, filled by the arena core). */
export interface HudMap {
  width: number;
  height: number;
  view: ViewRect;
  hero: { x: number; y: number };
  foes: { x: number; y: number; rank: 'normal' | 'elite' | 'boss' }[];
  drops: { x: number; y: number; color: string }[];
  /** Blocked cells, if the engine ever adds terrain; [] today. */
  terrain: { x: number; y: number; w: number; h: number }[];
}

const BORDER = '#5a6988';
const TERRAIN = '#3a4466';
const VIEW = '#2ce8f5';
const FOE = '#e43b44';
const HERO = '#fee761';
/** A dot's size in arena units (never under 2 device px). */
const FOE_SIZE = { normal: 0.8, elite: 1.3, boss: 2 } as const;

/**
 * Draws `map` on a `w` × `h` device-px canvas: the arena fitted at whole device px per unit and
 * centred, then its terrain, border, the camera's view, the drops, the foes and the hero.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  map: HudMap,
  w: number,
  h: number,
): void {
  const s = Math.max(1, Math.floor(Math.min(w / map.width, h / map.height)));
  const ox = Math.floor((w - map.width * s) / 2);
  const oy = Math.floor((h - map.height * s) / 2);
  const X = (x: number) => ox + Math.round(Math.min(Math.max(x, 0), map.width) * s);
  const Y = (y: number) => oy + Math.round(Math.min(Math.max(y, 0), map.height) * s);
  const line = Math.max(1, Math.round(s / 3));
  const frame = (l: number, t: number, r: number, b: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(l, t, r - l, line);
    ctx.fillRect(l, b - line, r - l, line);
    ctx.fillRect(l, t, line, b - t);
    ctx.fillRect(r - line, t, line, b - t);
  };
  const dot = (x: number, y: number, units: number, color: string) => {
    const d = Math.max(2, Math.round(units * s));
    ctx.fillStyle = color;
    ctx.fillRect(X(x) - Math.floor(d / 2), Y(y) - Math.floor(d / 2), d, d);
  };

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = TERRAIN;
  for (const c of map.terrain)
    ctx.fillRect(X(c.x), Y(c.y), Math.round(c.w * s), Math.round(c.h * s));
  frame(X(0), Y(0), X(map.width), Y(map.height), BORDER);
  const v = map.view;
  frame(X(v.left), Y(v.top), X(v.right), Y(v.bottom), VIEW);
  for (const d of map.drops) dot(d.x, d.y, 0.8, d.color);
  for (const f of map.foes) dot(f.x, f.y, FOE_SIZE[f.rank], FOE);
  dot(map.hero.x, map.hero.y, 1.2, HERO);
}

/**
 * The floor panel's map: a 2D canvas whose backing store is its zoomed box × devicePixelRatio
 * (re-measured on resize and on a HUD scale change), redrawn whenever `map` changes.
 */
export function Minimap({ map }: { map: HudMap | null }): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const { hud } = useUiScale();
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [hud]);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx && map && size.w > 0 && size.h > 0) drawMinimap(ctx, map, size.w, size.h);
  }, [map, size]);

  return (
    <canvas
      ref={ref}
      width={size.w}
      height={size.h}
      role="img"
      aria-label="Minimap"
      data-testid="minimap"
      className="block h-[150px] w-full bg-[var(--k-well)] shadow-[inset_0_0_0_2px_var(--k-steel-1)]"
    />
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/Minimap.test.tsx)`
Expected: PASS, 3 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 5 tests in F + 1 files** pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3b
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/hud/Minimap.tsx src/features/delve/arena/hud/__tests__/Minimap.test.tsx)
git add packages/client/src/features/delve/arena/hud/Minimap.tsx packages/client/src/features/delve/arena/hud/__tests__/Minimap.test.tsx
git commit -m "feat(client): the HUD's minimap, a canvas fitted at whole device pixels per unit" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: "Found this floor"

The old feed's assertions move here (`upgrades-locked`, `upgrades-potential`, `feed-rune`, with the same texts); `PickupFeed.tsx` and its tests go in Task 6.

**Files:**
- Create: `packages/client/src/features/delve/arena/hud/FoundLog.tsx`
- Create: `packages/client/src/features/delve/arena/hud/__tests__/FoundLog.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/arena/hud/__tests__/FoundLog.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { generateItem, SeededRNG } from '@alloy/engine';
import { FoundLog } from '../FoundLog';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

/** The dive's state as a clear or a door leaves it. */
const at = (phase: 'fighting' | 'choosing', depth: number) =>
  store().setProfile({ ...store().profile, dive: { ...store().profile.dive!, phase, depth } });

describe('FoundLog: what this floor found', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    // A helm for the empty slot and a rare weapon: two upgrades.
    const helm = generateItem(
      registry,
      { uid: 'h1', ilvl: 3, rarity: 'rare', slot: 'helm', mana: 'fire' },
      new SeededRNG(4),
    );
    const blade = generateItem(
      registry,
      { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', mana: 'fire' },
      new SeededRNG(5),
    );
    store().setProfile({ ...store().profile, bag: [helm, blade] });
  });
  afterEach(() => vi.restoreAllMocks());

  /** Dive, and find the helm and the weapon. */
  const dive = () => {
    store().startDive(1);
    store().pushDiveDrops(['h1', 'w1']);
  };

  it('marks every upgrade, the weapon too, with no Equip, only the Anvil note', () => {
    dive();
    render(<FoundLog onInspect={() => {}} />);
    expect(screen.queryByTestId('equip-upgrades')).toBeNull();
    expect(screen.getByTestId('upgrades-locked')).toHaveTextContent('▲ 2 to equip at the Anvil');
  });

  it("lists this floor's pickups only, newest first, each a swatch, its name in its rarity and its mark; a click inspects it", () => {
    const onInspect = vi.fn();
    store().startDive(1);
    store().pushDiveDrops(['h1']);
    at('choosing', 1);
    at('fighting', 2);
    store().pushDiveDrops(['w1']);
    render(<FoundLog onInspect={onInspect} />);
    const rows = screen.getAllByTestId('loot-item');
    expect(rows).toHaveLength(1);
    const blade = store().profile.bag.find((i) => i.uid === 'w1')!;
    expect(rows[0]).toHaveTextContent(`${blade.name}▲`);
    expect(rows[0]).toHaveAccessibleName(`${blade.name}, upgrade`);
    expect(within(rows[0]).getByText(blade.name)).toHaveStyle({ color: '#fee761' });
    fireEvent.click(rows[0]);
    expect(onInspect).toHaveBeenCalledWith('w1');
  });

  it('shows the item card inline on hover', () => {
    dive();
    render(<FoundLog onInspect={() => {}} />);
    fireEvent.mouseEnter(screen.getAllByTestId('loot-item')[0]);
    const card = within(screen.getByTestId('pickup-feed')).getByRole('tooltip');
    expect(card).toHaveTextContent(store().profile.bag.find((i) => i.uid === 'w1')!.name);
  });

  it('shows as many rows as fit, then "+n more"', () => {
    dive();
    store().pushDiveRunes([
      { id: 'split', tier: 3 },
      { id: 'quick', tier: 1 },
    ]);
    // 108 px holds three 32 px rows and their 6 px gaps: two of the four finds, then the count.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 108,
    } as DOMRect);
    render(<FoundLog onInspect={() => {}} />);
    expect(screen.getAllByTestId('loot-item')).toHaveLength(2);
    expect(screen.queryByTestId('feed-rune')).toBeNull();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  /**
   * Slots bought on the worn sword make an uncommon dagger better only with
   * that moveset moved onto it: a potential upgrade.
   */
  it('counts a weapon better only as a home for your moveset apart, as a potential upgrade', () => {
    store().setProfile({ ...store().profile, links: 99, scrap: 9999 });
    for (const skill of ['basic', 'basic', 'primary', 'primary', 'primary'] as const)
      expect(store().addSlot(skill).ok).toBe(true);
    const dagger = generateItem(
      registry,
      { uid: 'w2', ilvl: 3, rarity: 'uncommon', slot: 'weapon', mana: 'fire' },
      new SeededRNG(3),
    );
    store().setProfile({ ...store().profile, bag: [...store().profile.bag, dagger] });
    store().startDive(1);
    store().pushDiveDrops(['h1', 'w1', 'w2']);
    render(<FoundLog onInspect={() => {}} />);
    expect(screen.getByTestId('upgrades-locked')).toHaveTextContent('▲ 2 to equip at the Anvil');
    expect(screen.getByTestId('upgrades-potential')).toHaveTextContent(
      '◇ 1 potential: Transfer at the Anvil',
    );
    expect(screen.getAllByTestId('loot-item')[0]).toHaveTextContent(`${dagger.name}◇`);
  });

  it('names the runes found, grouped, even with no item found', () => {
    store().startDive(1);
    store().pushDiveRunes([
      { id: 'split', tier: 3 },
      { id: 'split', tier: 3 },
      { id: 'quick', tier: 1 },
    ]);
    render(<FoundLog onInspect={() => {}} />);
    expect(screen.getByTestId('pickup-feed')).toBeInTheDocument();
    const [first, second, ...more] = screen.getAllByTestId('feed-rune');
    expect(first).toHaveTextContent(/^Quick Irune$/);
    expect(second).toHaveTextContent(/^Split III ×2rune$/);
    expect(more).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/FoundLog.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../FoundLog" from "src/features/delve/arena/hud/__tests__/FoundLog.test.tsx". Does the file exist?`

- [ ] **Step 3: The log**

Create `packages/client/src/features/delve/arena/hud/FoundLog.tsx`:

```tsx
import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { compareItem, findItem, referenceDepth, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Panel, layerZoom } from '../../kit';
import { ItemTooltip } from '../../items/ItemTooltip';
import { deltaMark } from '../../ItemTile';
import { getDelveRegistry } from '../../registry';
import { RARITY_COLOR, RARITY_TEXT, UPGRADE_EPSILON } from '../../format';
import { countRunes } from '../../chains/chain-text';
import { FAMILY_STYLE, runeName } from '../../runes/rune-style';

/** A row's height and the gap between rows, in design px. */
const ROW = 32;
const GAP = 6;
const ROW_CLASS =
  'flex h-8 w-full flex-none items-center gap-[10px] bg-[var(--k-well)] px-2 text-left text-[14px]';

const MARK = {
  up: { text: '▲', color: 'var(--k-ok)', label: 'upgrade' },
  down: { text: '▼', color: 'var(--k-bad)', label: 'downgrade' },
  potential: { text: '◇', color: 'var(--k-mana)', label: 'potential upgrade' },
} as const;

function Swatch({ color }: { color: string }): ReactElement {
  return <span aria-hidden className="size-[10px] flex-none" style={{ background: color }} />;
}

/**
 * "Found this floor": each pickup since the floor began, newest first (the items, then the
 * runes), as many as fit, then "+n more". An item shows its card on hover and opens on a click;
 * ▲ marks an upgrade (to equip at the Anvil), ◇ a weapon better only with your moveset moved
 * onto it (Transfer), ▼ a downgrade.
 */
export function FoundLog({ onInspect }: { onInspect: (uid: string) => void }): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const diveDrops = useDelveStore((s) => s.diveDrops);
  const diveRunes = useDelveStore((s) => s.diveRunes);
  const dropsFrom = useDelveStore((s) => s.floorDropsFrom);
  const runesFrom = useDelveStore((s) => s.floorRunesFrom);
  const listRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(Infinity);
  const depth = referenceDepth(profile);

  const items = useMemo(() => {
    const out: { item: GearItem; delta: number | null; asIs: number | null }[] = [];
    for (const uid of diveDrops.slice(0, diveDrops.length - dropsFrom)) {
      const found = findItem(profile, uid);
      if (!found) continue;
      const { item } = found;
      const equipped = found.where === 'equipped';
      const value = (as: 'home' | 'asIs') =>
        compareItem(profile.equipped, item, registry, depth, profile.pair, as).powerPct;
      const delta = equipped ? null : value('home');
      // Only a weapon carries a moveset: anything else is the same either way.
      const asIs = equipped || item.slot !== 'weapon' ? delta : value('asIs');
      out.push({ item, delta, asIs });
    }
    return out;
  }, [diveDrops, dropsFrom, profile, registry, depth]);
  const runes = countRunes(diveRunes.slice(0, diveRunes.length - runesFrom));

  // As many rows as the list's height holds (its box ÷ the HUD's zoom, in design px).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height / layerZoom(el);
      if (h > 0) setFit(Math.max(1, Math.floor((h + GAP) / (ROW + GAP))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const up = (d: number | null) => d !== null && d > UPGRADE_EPSILON;
  const upgrades = items.filter((r) => up(r.asIs)).length;
  const potential = items.filter((r) => up(r.delta) && !up(r.asIs)).length;

  const rows = [
    ...items.map(({ item, delta, asIs }) => {
      const mark = deltaMark(delta, asIs);
      return (
        <ItemTooltip key={item.uid} uid={item.uid} placement="left" portal={false}>
          <button
            type="button"
            className={ROW_CLASS}
            aria-label={mark ? `${item.name}, ${MARK[mark].label}` : item.name}
            onClick={() => onInspect(item.uid)}
            data-testid="loot-item"
          >
            <Swatch color={RARITY_COLOR[item.rarity]} />
            <span className="truncate" style={{ color: RARITY_TEXT[item.rarity] }}>
              {item.name}
            </span>
            {mark && (
              <span className="ml-auto" style={{ color: MARK[mark].color }}>
                {MARK[mark].text}
              </span>
            )}
          </button>
        </ItemTooltip>
      );
    }),
    ...runes.map(({ rune, count }) => (
      <div key={`${rune.id}-${rune.tier}`} className={ROW_CLASS} data-testid="feed-rune">
        <Swatch color={FAMILY_STYLE[registry.getRune(rune.id).family].color} />
        <span className="truncate">
          {runeName(registry, rune)}
          {count > 1 && ` ×${count}`}
        </span>
        <span className="ml-auto text-[var(--k-text-3)]">rune</span>
      </div>
    )),
  ];
  const more = rows.length > fit ? rows.length - (fit - 1) : 0;

  return (
    <Panel
      as="div"
      material="glass"
      scroll={false}
      title="Found this floor"
      className="pointer-events-auto flex-1"
      testId="pickup-feed"
    >
      {upgrades > 0 && (
        <span className="text-[14px] text-[var(--k-ok)]" data-testid="upgrades-locked">
          ▲ {upgrades} to equip at the Anvil
        </span>
      )}
      {potential > 0 && (
        <span className="text-[14px] text-[var(--k-mana)]" data-testid="upgrades-potential">
          ◇ {potential} potential: Transfer at the Anvil
        </span>
      )}
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-[6px] overflow-hidden">
        {rows.length === 0 && <span className="k-caption">Nothing found on this floor yet.</span>}
        {more > 0 ? rows.slice(0, fit - 1) : rows}
        {more > 0 && (
          <span className="k-caption flex h-8 flex-none items-center">+{more} more</span>
        )}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/FoundLog.test.tsx)`
Expected: PASS, 6 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 11 tests in F + 2 files** pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3b
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/hud/FoundLog.tsx src/features/delve/arena/hud/__tests__/FoundLog.test.tsx)
git add packages/client/src/features/delve/arena/hud/FoundLog.tsx packages/client/src/features/delve/arena/hud/__tests__/FoundLog.test.tsx
git commit -m "feat(client): \"Found this floor\", the HUD's log of the floor's pickups" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The tracker's Journal, the column, and the old feed

### Task 4: The quest tracker's Journal hint opens the journal

**Files:**
- Modify: `packages/client/src/features/delve/quests/QuestTracker.tsx`
- Modify: `packages/client/src/features/delve/quests/__tests__/QuestTracker.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/quests/__tests__/QuestTracker.test.tsx`:

Replace:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
```

with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
```

Replace:

```tsx
    expect(screen.getByTestId('tracked-kindling')).toHaveTextContent('12 / 20');
  });
});
```

with:

```tsx
    expect(screen.getByTestId('tracked-kindling')).toHaveTextContent('12 / 20');
  });

  it('its Journal hint opens the journal when the HUD passes onJournal', () => {
    const onJournal = vi.fn();
    render(<QuestTracker quests={[tracked(SAMPLE_QUESTS[0])]} onJournal={onJournal} />);
    fireEvent.click(screen.getByRole('button', { name: /Journal/ }));
    expect(onJournal).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/quests/__tests__/QuestTracker.test.tsx)`
Expected: FAIL, 1 test: ``TestingLibraryElementError: Unable to find an accessible element with the role "button" and name `/Journal/` ``.

- [ ] **Step 3: The button**

In `packages/client/src/features/delve/quests/QuestTracker.tsx`, replace:

```tsx
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
```

with:

```tsx
/**
 * The HUD's quest tracker (Phase 3's right column): up to three tracked quests; nothing while none
 * is. With `onJournal`, its Journal hint is a button that opens the journal.
 */
export function QuestTracker({
  quests,
  onJournal,
}: {
  quests: QuestView[];
  onJournal?: () => void;
}): ReactElement | null {
  const shown = quests.filter((q) => q.tracked).slice(0, MAX_TRACKED);
  if (shown.length === 0) return null;
  const hint = (
    <>
      <InputGlyph binding={JOURNAL_BINDING} size="sm" />
      Journal
    </>
  );
  const hintClass = 'flex items-center gap-2 text-[14px] text-[var(--k-text-3)]';
  return (
    <Panel
      as="div"
      material="glass"
      scroll={false}
      testId="quest-tracker"
      className="pointer-events-auto"
      title={<span style={{ color: 'var(--k-hot-hi)' }}>Quests</span>}
      aside={
        onJournal ? (
          <button type="button" className={hintClass} onClick={onJournal}>
            {hint}
          </button>
        ) : (
          <span className={hintClass}>{hint}</span>
        )
      }
    >
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/quests/)`
Expected: PASS, 5 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 12 tests in F + 2 files** pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3b
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/quests/QuestTracker.tsx src/features/delve/quests/__tests__/QuestTracker.test.tsx)
git add packages/client/src/features/delve/quests/QuestTracker.tsx packages/client/src/features/delve/quests/__tests__/QuestTracker.test.tsx
git commit -m "feat(client): the quest tracker's Journal hint opens the journal on the HUD" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: `FloorColumn`

**Files:**
- Create: `packages/client/src/features/delve/arena/hud/FloorColumn.tsx`
- Create: `packages/client/src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { generateItem, SeededRNG, type ManaType } from '@alloy/engine';
import { FloorColumn, type FloorColumnProps } from '../FloorColumn';
import type { HudMap } from '../Minimap';
import type { ArenaHud } from '../../useArenaCore';
import { getDelveRegistry } from '../../../registry';
import { SAMPLE_QUESTS } from '../../../quests/sample';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

const MAP: HudMap = {
  width: 26,
  height: 40,
  view: { left: 0, top: 13, right: 26, bottom: 40 },
  hero: { x: 13, y: 36 },
  foes: [{ x: 5, y: 5, rank: 'elite' }],
  drops: [],
  terrain: [],
};
/** The snapshot's fields the column reads. */
const HUD = { monstersLeft: 12, cleared: false, map: MAP } as unknown as ArenaHud;

describe('FloorColumn', () => {
  let props: FloorColumnProps;
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    const sword = generateItem(
      registry,
      { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', mana: 'fire' },
      new SeededRNG(5),
    );
    store().setProfile({ ...store().profile, bag: [sword] });
    store().startDive(1);
    store().pushDiveDrops(['w1']);
    // The 2D context isn't jsdom's: the minimap draws nothing here.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    props = {
      dive: { ...store().profile.dive!, depth: 6, bounty: 26 },
      biome: registry.getBiomeForDepth(6),
      hud: HUD,
      quests: [],
      onInspect: vi.fn(),
      onJournal: vi.fn(),
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the floor: depth, biome, minimap, what it resists and is weak to, foes left and the bounty', () => {
    render(<FloorColumn {...props} />);
    const { biome } = props;
    const name = (m: ManaType) => registry.getArpgData().mana[m].name;
    const weak = registry.getArpgData().weakness[biome.mana];
    expect(screen.getByTestId('depth-label')).toHaveTextContent('DEPTH 6');
    expect(screen.getByText(biome.name)).toBeInTheDocument();
    expect(screen.getByTestId('minimap')).toBeInTheDocument();
    expect(screen.getByTestId('biome-element')).toHaveTextContent(
      `Resists ${name(biome.mana)}Weak to ${name(weak)}`,
    );
    expect(screen.getByTestId('monsters-left')).toHaveTextContent('12 foes left');
    expect(screen.getByText('26').parentElement).toHaveTextContent('26 bounty');
    expect(screen.queryByTestId('bounty')).toBeNull();
  });

  it('shows no foe count until the arena reports', () => {
    render(<FloorColumn {...props} hud={null} />);
    expect(screen.queryByTestId('monsters-left')).toBeNull();
    expect(screen.getByTestId('depth-label')).toBeInTheDocument();
  });

  it('holds the quest tracker, nothing while no quest is tracked; its Journal opens the journal', () => {
    const { rerender } = render(<FloorColumn {...props} />);
    expect(screen.queryByTestId('quest-tracker')).toBeNull();
    rerender(<FloorColumn {...props} quests={[{ ...SAMPLE_QUESTS[0], tracked: true }]} />);
    const tracker = screen.getByTestId('quest-tracker');
    fireEvent.click(within(tracker).getByRole('button', { name: /Journal/ }));
    expect(props.onJournal).toHaveBeenCalledOnce();
  });

  it("ends with the Found log, whose item opens the item's sheet", () => {
    render(<FloorColumn {...props} />);
    fireEvent.click(within(screen.getByTestId('pickup-feed')).getByTestId('loot-item'));
    expect(props.onInspect).toHaveBeenCalledWith('w1');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../FloorColumn" from "src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx". Does the file exist?`

- [ ] **Step 3: The column**

Create `packages/client/src/features/delve/arena/hud/FloorColumn.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { BiomeDef, DiveState } from '@alloy/engine';
import { Glyph, Panel } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { formatNumber, manaStyle } from '../../format';
import { QuestTracker } from '../../quests/QuestTracker';
import type { QuestView } from '../../quests/types';
import type { ArenaHud } from '../useArenaCore';
import { FoundLog } from './FoundLog';
import { Minimap, type HudMap } from './Minimap';

export interface FloorColumnProps {
  dive: DiveState | null;
  biome: BiomeDef;
  hud: ArenaHud | null;
  quests: QuestView[];
  onInspect: (uid: string) => void;
  onJournal: () => void;
}

/**
 * The HUD's right column: the floor panel (depth, biome, minimap, what the floor resists and is
 * weak to, foes left, the bounty), the tracked quests, and "Found this floor".
 */
export function FloorColumn({
  dive,
  biome,
  hud,
  quests,
  onInspect,
  onJournal,
}: FloorColumnProps): ReactElement {
  const registry = getDelveRegistry();
  const weak = registry.getArpgData().weakness[biome.mana];
  // ponytail: the arena core's snapshot gains `map` in 3C; read `hud.map` once it has.
  const map = (hud as (ArenaHud & { map?: HudMap }) | null)?.map ?? null;
  return (
    <aside className="flex h-full min-h-0 flex-col gap-4" aria-label="Floor, quests and finds">
      <Panel
        as="div"
        material="glass"
        scroll={false}
        className="pointer-events-auto"
        title={<span data-testid="depth-label">DEPTH {dive?.depth}</span>}
        aside={<span className="text-[14px] text-[var(--k-text-2)]">{biome.name}</span>}
      >
        <Minimap map={map} />
        <div className="grid grid-cols-2 gap-2 text-[14px]" data-testid="biome-element">
          {(
            [
              ['Resists', biome.mana],
              ['Weak to', weak],
            ] as const
          ).map(([label, mana]) => (
            <span key={label} className="flex items-center gap-2 bg-[var(--k-well)] px-2 py-[6px]">
              <Glyph id={mana} size={16} />
              {label} {manaStyle(registry, mana).name}
            </span>
          ))}
        </div>
        <div className="flex items-baseline justify-between text-[15px] text-[var(--k-text-3)]">
          {hud && (
            <span data-testid="monsters-left">
              <b className="k-disp text-[20px] text-[var(--k-text)]">{hud.monstersLeft}</b> foes
              left
            </span>
          )}
          <span className="ml-auto">
            <b className="k-disp text-[20px] text-[var(--k-hot-hi)]">
              {formatNumber(dive?.bounty ?? 0)}
            </b>{' '}
            bounty
          </span>
        </div>
      </Panel>
      <QuestTracker quests={quests} onJournal={onJournal} />
      <FoundLog onInspect={onInspect} />
    </aside>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/)`
Expected: PASS, 13 tests in 3 files.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 16 tests in F + 3 files** pass (1103 in 142 at `895fb0a`).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-3b
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/hud/FloorColumn.tsx src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx)
git add packages/client/src/features/delve/arena/hud/FloorColumn.tsx packages/client/src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx
git commit -m "feat(client): the HUD's right column: the floor, the quests and what the floor found" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6 (at integration, after 3A): `PickupFeed` goes

Runs on `ui/p3a` (`C:/Projects/alloy-ui-p3a`) once 3A is merged: its `DelveRun.tsx` renders `FloorColumn` and no longer imports `PickupFeed` (X1.3). The feed's three tests in `LootTray.test.tsx` go with it; their assertions run in `FoundLog.test.tsx` (Task 3). No test is added.

**Files:**
- Delete: `packages/client/src/features/delve/arena/PickupFeed.tsx`
- Modify: `packages/client/src/features/delve/__tests__/LootTray.test.tsx`

- [ ] **Step 1: Only the old tests import it**

Run: `grep -rln "PickupFeed" packages/client/src`
Expected: `packages/client/src/features/delve/__tests__/LootTray.test.tsx` and `packages/client/src/features/delve/arena/PickupFeed.tsx` only. (`pages/DelveRun.tsx` here means 3A's rewrite hasn't landed: merge it first.)

- [ ] **Step 2: The old feed's tests go**

In `packages/client/src/features/delve/__tests__/LootTray.test.tsx`:

Delete the lines from `import { PickupFeed } from '../arena/PickupFeed';` up to (not including) `import { getDelveRegistry } from '../registry';`.

Delete the lines from `it("the arena's feed says the same", () => {` up to (not including) `it('at a stop that offers to equip, the tray says one can go on there', () => {`.

Delete the lines from `it("the arena's feed counts the potential upgrade apart too", () => {` up to (not including) `it('no potential upgrade, no note', () => {`.

Replace:

```tsx
    expect(more).toEqual([]);
  });

  it('the feed shows them too, even with no item found', () => {
    store().startDive(1);
    found();
    render(<PickupFeed onSelect={() => {}} top={0} />);
    expect(screen.getByTestId('pickup-feed')).toBeInTheDocument();
    const [first, second, ...more] = screen.getAllByTestId('feed-rune');
    expect(first).toHaveTextContent(/Quick I$/);
    expect(second).toHaveTextContent(/Split III ×2$/);
    expect(more).toEqual([]);
  });
});
```

with:

```tsx
    expect(more).toEqual([]);
  });
});
```

- [ ] **Step 3: Delete it, then the whole client**

```bash
cd /c/Projects/alloy-ui-p3a
git rm packages/client/src/features/delve/arena/PickupFeed.tsx
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

Expected: no type errors; the suite passes with 3 tests fewer than before this task, in the same number of files (`LootTray.test.tsx` 6 of 6).

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/alloy-ui-p3a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/LootTray.test.tsx)
git add packages/client/src/features/delve/__tests__/LootTray.test.tsx
git commit -m "refactor(client): the arena's pickup feed gives way to the Found log" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 7 (at integration, after 3C): the minimap reads the snapshot's `map`

Runs on `ui/p3a` once 3C is merged: `useArenaCore.ts` exports `HudMap` and `ArenaHud.map: HudMap` (X2). The local `HudMap` and the column's widened read go. No test is added; the tests' fixtures already match the contract.

**Files:**
- Modify: `packages/client/src/features/delve/arena/hud/Minimap.tsx`
- Modify: `packages/client/src/features/delve/arena/hud/FloorColumn.tsx`
- Modify: `packages/client/src/features/delve/arena/hud/__tests__/Minimap.test.tsx`
- Modify: `packages/client/src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx`

- [ ] **Step 1: The edits**

In `packages/client/src/features/delve/arena/hud/Minimap.tsx`, replace the lines from `import type { ViewRect } from '../fx/pixel-layer';` up to (not including) `const BORDER = '#5a6988';` with:

```tsx
import type { HudMap } from '../useArenaCore';

```

In `packages/client/src/features/delve/arena/hud/FloorColumn.tsx`:

Replace:

```tsx
import { Minimap, type HudMap } from './Minimap';
```

with:

```tsx
import { Minimap } from './Minimap';
```

Delete the lines from ``// ponytail: the arena core's snapshot gains `map` in 3C; read `hud.map` once it has.`` up to (not including) `return (`.

Replace:

```tsx
        <Minimap map={map} />
```

with:

```tsx
        <Minimap map={hud?.map ?? null} />
```

In `packages/client/src/features/delve/arena/hud/__tests__/Minimap.test.tsx`, replace:

```tsx
import { Minimap, drawMinimap, type HudMap } from '../Minimap';
```

with:

```tsx
import { Minimap, drawMinimap } from '../Minimap';
import type { HudMap } from '../../useArenaCore';
```

In `packages/client/src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx`, replace:

```tsx
import type { HudMap } from '../Minimap';
import type { ArenaHud } from '../../useArenaCore';
```

with:

```tsx
import type { ArenaHud, HudMap } from '../../useArenaCore';
```

- [ ] **Step 2: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; the suite passes with the same count as before this task (`arena/hud/__tests__` 13 tests among them).

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/alloy-ui-p3a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/hud/Minimap.tsx src/features/delve/arena/hud/FloorColumn.tsx src/features/delve/arena/hud/__tests__/Minimap.test.tsx src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx)
git add packages/client/src/features/delve/arena/hud/Minimap.tsx packages/client/src/features/delve/arena/hud/FloorColumn.tsx packages/client/src/features/delve/arena/hud/__tests__/Minimap.test.tsx packages/client/src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx
git commit -m "refactor(client): the minimap reads the snapshot's map" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

After Task 5 (on `ui/p3a-3b`):

```bash
cd /c/Projects/alloy-ui-3b
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
git status --short
```

Expected: no type errors; **N + 16 tests in F + 3 files** pass (1103 in 142 at `895fb0a`); `git status` clean (five commits on `ui/p3a-3b`). `PickupFeed.tsx` remains, imported by `DelveRun.tsx` until 3A's rewrite. No engine file changed.

After Tasks 6 and 7 (on `ui/p3a`, with 3A and 3C merged): the client suite and typecheck are green.

**E2E ids this area keeps or changes** (for the integrator's E2E pass):
- `depth-label`: on the floor panel's title, text `DEPTH N` as today, so D01's `toHaveText('DEPTH 1')` and `not.toHaveText('DEPTH 1')` hold unchanged.
- `monsters-left`: "N foes left", present once the arena reports; D01's `toContainText('foes')` holds.
- `biome-element`: the two element tiles ("Resists Frost", "Weak to Fire"); no spec reads it.
- `bounty`: **not** on this column; it is the purse's (3A). The floor panel's bounty has no id.
- `pickup-feed`: the Found log panel, now always rendered during the fight (empty: "Nothing found on this floor yet.").
- `loot-item`: each item row of the Found log, a button; D02's `getByTestId('loot-item').first()` then `click()` opens the item sheet through `onInspect` (3A's `openItem`).
- `upgrades-locked`, `upgrades-potential`: same texts as the old feed, counting this floor's finds.
- `feed-rune`: a rune row, its text now ending in "rune" ("Split III ×2rune"); no spec reads it.
- `minimap`: the canvas (new; `role="img"`, name "Minimap").
- `quest-tracker`: absent in v1 (no quests), as 2D left it.

A manual look (optional, the integrator's gate covers it): at 1920×1080 and 1280×720, dive and check the column fills the right side under the floor panel, the minimap shows the arena with the view box following the hero, elites and the boss as larger dots and drops in their colours, and that a pickup appears at the top of "Found this floor" with its ▲ / ◇ mark, shows its card on hover and opens on a click; at the next door, the log starts empty.
