# Delve UI v1 · Phase 2 · 2C: Forge and Codex — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Anvil's Forge and Codex tabs become three kit panes each, with every behaviour and price today's `ForgePanel`, the item sheet's forge actions and the rune pouch have. **Forge** (`430px minmax(0,1fr) 470px`): `GearList` (what you wear, then the bag, filter chips, `temper-row`) · the bench, a `level="sub"` Tabs of **Temper** (the selected item's Upgrade +1, Reforge with its affix pick as its own pad scope, Re-attune) and **Fuse** (today's Alloy Fusion) · `RunePane` (today's pouch, "Fuse 3 → 1"). **Codex** (`340px minmax(0,1fr) 470px`): the sections (Legendaries n/12, Reactions n/15, Records) · the section's cards (`codex-unknown`, `ReactionsGrid`'s `reaction-unknown`, the lifetime stats) · the card hovered or focused in detail. Prices are kit `Price` glyphs, elements kit `Glyph`s: no emoji left in either tab's own code. Then `ForgePanel.tsx`, `CodexPanel.tsx` and `runes/RunePouchPanel.tsx` are deleted, their tests moved.

**Architecture:** Two tab components, `ForgeTab(props: HubTabProps)` in `hub/forge/ForgeTab.tsx` and `CodexTab(props: HubTabProps)` in `hub/codex/CodexTab.tsx`. Each tab's root is its own full-height grid (the spec's 24 / 32 px padding and 24 px gap, its own columns) and carries the kept id (`forge-panel`, `codex-panel`); the hub renders it straight inside the screen's `main`. Each sets its prompts once (`setPrompts`, Select) and reads `link` (`{ tab: 'forge', uid, bench }`, `{ tab: 'codex', section }`) on mount and whenever a new link arrives (React's "adjust state when a prop changes" pattern, no effect). The Forge's pieces are presentational over the store: `GearList` (rows), `Temper` (one item; its own messages and the reforge pick), `Fuse` (ForgePanel's Alloy Fusion moved over, its WAAPI converge and pop kept), `RunePane` (`RunePouchPanel`'s props, kit look). The engine's locks stay the rule: the bench shows `forge-locked` and the rune pane its locked note while `isDiveActive`, and in `mode: 'pause'`. `ReactionsGrid` (2·0's move) gains glyphs and an `onActive` hover/focus callback for the Codex detail, keeping its `reactionsSeen` prop, ids and "n/15 discovered". No engine change, no store change.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, Vitest 3 (jsdom, Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md`: "Phase 2: The Anvil hub" → shared contract, layout, **2C**; decided items 16 (Upgrade, Reforge and Re-attune move to the Forge's Temper bench), 17 (the reactions and the lifetime stats move to the Codex), 27 (emoji), 33 (14 px floor), 39 (Reforge's affix pick is its own `data-pad-scope` with a Back); the input map (LT / RT step the bench and the sections); "Accessibility" (contrast: no caption grey or failing rarity text on raised steel). The overview is `00-overview.md` in this folder. There is no Forge or Codex mockup: the panes follow the Loadout board's three-pane layout and the UI kit board's materials.

---

## Base

- **Starts from:** branch `ui/p2` after step 2·0 (`2d6273a`: `items/AttunementBars.tsx`, the kit `Chip` swaps, `hub/codex/ReactionsGrid.tsx` with its test, and `hub/types.ts` with `HubLink` and `HubTabProps`). 2C runs in its own worktree, `C:/Projects/alloy-ui-2c` on branch `ui/p2-2c` (`git worktree add ../alloy-ui-2c -b ui/p2-2c ui/p2`, the overview's junction rules; the client's `@alloy/engine` junction points at the worktree's own `packages/engine`). Every path below is relative to the worktree's root, `/c/Projects/alloy-ui-2c` in Git Bash.
- **Tasks 1–6** run in that worktree and only add files under `hub/forge/` and `hub/codex/` (plus `ReactionsGrid.tsx` and its test, which 2·0 put in 2C's folder). They touch nothing the hub imports in a breaking way: `ReactionsGrid` keeps its `reactionsSeen` prop, so `AnvilHub`'s interim Codex still renders it.
- **Task 7** deletes the old panels. `AnvilHub.tsx` imports `ForgePanel` and `CodexPanel` until the integrator wires the new tabs (cross-area need 1), so Task 7 runs **on `ui/p2` after that wiring commit**, in the integration worktree `C:/Projects/alloy-ui-p2`, and after 2A's edits to `ItemDetailSheet.test.tsx` if 2A merged first (its anchors hold either way).
- **Before Task 1:** build the engine for the junction and measure:

```bash
cd /c/Projects/alloy-ui-2c
(cd packages/engine && npx tsup)
(cd packages/client && npx vitest run && npx tsc --noEmit -p .)
```

  Expected: tsup's "Build success" lines; the client suite passes and the typecheck prints nothing. At `2d6273a` that is **994 tests in 123 files**. Tasks 1–6 end at **1015 tests in 128 files** (+21, +5). Task 7 (on the integrated `ui/p2`) removes 8 tests and 1 file: today's 5 `RunePouchPanel` tests and the item sheet file's 3 `ForgePanel` tests, all moved by Tasks 1, 3 and 4.

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/hub/forge/RunePane.tsx` (new) | the rune pane (`rune-pouch`): each rune held by tier, its effect and raw price, "Fuse 3 → 1" priced in `Price` glyphs, the locked note |
| `packages/client/src/features/delve/hub/forge/Temper.tsx` (new) | the Temper bench on one item: header, purse, stat lines, Upgrade +1, Reforge (its affix pick a pad scope with a Back), Re-attune |
| `packages/client/src/features/delve/hub/forge/Fuse.tsx` (new) | Alloy Fusion, moved from `ForgePanel`: rarity chips, three slots, the result, Auto-pick, Fuse (asks first over runes) |
| `packages/client/src/features/delve/hub/forge/GearList.tsx` (new) | the gear list: worn items first, then the bag; All / Weapons / Armor / Jewelry chips; `temper-row` rows |
| `packages/client/src/features/delve/hub/forge/ForgeTab.tsx` (new) | `ForgeTab`: the grid, the selection, the bench's Tabs, the link, the lock, the prompts, the rune fuse handler |
| `packages/client/src/features/delve/hub/forge/__tests__/{RunePane,Temper,Fuse,ForgeTab}.test.tsx` (new) | the panes' tests; `RunePouchPanel.test.tsx`'s and the item sheet file's `ForgePanel` assertions move here |
| `packages/client/src/features/delve/hub/codex/ReactionsGrid.tsx` | overwritten: kit cards, element glyphs for the emoji, `active` / `onActive` (props and ids kept) |
| `packages/client/src/features/delve/hub/codex/__tests__/ReactionsGrid.test.tsx` | one more test: the glyphs and the hover / focus callback |
| `packages/client/src/features/delve/hub/codex/CodexTab.tsx` (new) | `CodexTab`: sections, the grid (legendaries, `ReactionsGrid`, records), the detail |
| `packages/client/src/features/delve/hub/codex/__tests__/CodexTab.test.tsx` (new) | sections, cards, detail, records, link |
| `packages/client/src/features/delve/ForgePanel.tsx` | deleted (Task 7) |
| `packages/client/src/features/delve/CodexPanel.tsx` | deleted (Task 7) |
| `packages/client/src/features/delve/runes/RunePouchPanel.tsx` and `runes/__tests__/RunePouchPanel.test.tsx` | deleted (Task 7) |
| `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx` | Task 7: the three `ForgePanel` tests (moved by Tasks 3 and 4) and its import go |

Nothing else changes. `AnvilHub.tsx`, `AnvilHub.test.tsx` and the E2E specs are the integrator's (below). `ItemDetailSheet.tsx` keeps its own Upgrade / Reforge / Re-attune until 3b deletes it (the pause and the stop still open it); the hub stops opening it in 2A.

## Cross-area needs

1. **Integrator, `hub/AnvilHub.tsx`** (before Task 7). Replace the interim Forge and Codex with the tabs, rendered straight inside the screen's `main` (no interim column, no padding wrapper: each tab's root is its own grid with the spec's padding, `h-full`):
   - imports: drop `import { ForgePanel } from '../ForgePanel';`, `import { CodexPanel } from '../CodexPanel';` and `import { ReactionsGrid } from './codex/ReactionsGrid';`; add `import { ForgeTab } from './forge/ForgeTab';` and `import { CodexTab } from './codex/CodexTab';`
   - `{tab === 'forge' && <ForgeTab {...tabProps} />}` and `{tab === 'codex' && <CodexTab {...tabProps} />}`, where `tabProps` is the hub's `HubTabProps` (its `mode`, `setPrompts`, `setFooterAction`, `go`, and the `link` the last `go` carried for that tab)
   - delete the `Records` function (the Codex's Records section replaces it) and the `format` imports only it used (`RARITY_LABEL`, `RARITY_TEXT`, `formatNumber`)
   - the footer draws the tab's prompts (`[Select]` from both tabs), then the hub's own Menu prompt; neither tab sets a footer action
   - `setPrompts` must keep one identity across renders (a `useState` setter does): both tabs call it from an effect keyed on it, with a module-level array, so an unstable one would loop
   - Checked on a scratch copy: with exactly these edits (and placeholder `tabProps`), Task 7 leaves the typecheck clean and every test but one passing, the one being `AnvilHub.test.tsx` (need 2).
2. **Integrator, `hub/__tests__/AnvilHub.test.tsx`** ("shows each tab…"): the Codex opens on its Legendaries, so before `expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(15);` add `fireEvent.click(screen.getByTestId('codex-section-reactions'));` (or assert `codex-unknown` × 12 instead).
3. **Integrator, E2E** (the ids 2C keeps, for the spec's D04 / R04 / R05 updates):
   - **D04:** `forge-panel` and `temper-row` × 2 hold (the gear list rows every worn item, then the bag; the seeded save's bag is empty). On the Codex, `codex-unknown` × 12 holds on the default Legendaries section; click `codex-section-reactions` before `reaction-unknown` × 15.
   - **R04:** unchanged: `rune-pouch` (now the Forge's right pane), `rune-fuse-split-1`, `pouch-split-2`, `pouch-split-1`, and `scrap-count` '0 scrap'.
   - **R05:** `pouch-quick-3` keeps the rune's raw `runeText(…).cost`.
   - **G03** is untouched (the tabs only).
   - Kept on the same behaviour: `fusion-result`, `fuse-button`, `fuse-candidate`, `upgrade-button`, `reattune-<m>`, `forge-locked`, `rune-pouch-locked`, `codex-found`, `reaction-<id>`. New: `gear-list`, `gear-filter-<all|weapons|armor|jewelry>`, `forge-bench`, `bench-temper`, `bench-fuse`, `temper`, `forge-purse`, `reforge-open`, `reforge-pick`, `reforge-back`, `reforge-line-<i>`, `reforge-button`, `reattune`, `fuse-bench`, `codex-sections`, `codex-section-<legendaries|reactions|records>`, `codex-grid`, `codex-records`, `codex-detail`.
4. **2A, the Loadout's "Forge it ›":** `go({ tab: 'forge', uid })` opens the Temper bench on that item (`bench` defaults to `'temper'`; `bench: 'fuse'` opens Fusion).
5. **2A, `ItemDetailSheet.test.tsx`:** 2A removes its `BagPanel` tests and import from the same file; Task 7 removes the `ForgePanel` ones. The two imports are adjacent lines (`import { BagPanel }…`, `import { ForgePanel }…`), so separate branches touching both would conflict: Task 7 runs on `ui/p2` after 2A merged, and its anchors don't include 2A's lines.

## Where the spec left room

- **The tab root is the grid.** "The hub's `main` is a grid … each tab sets its own `grid-template-columns`": each tab's root carries the whole grid (`grid h-full min-h-0 gap-6 px-8 py-6` and its columns), so the hub only renders it. If the integrator puts the padding and grid on `main` instead, the root's `grid` and padding classes go and its columns move to `main`.
- **Bench layout.** Temper and Fuse are a `level="sub"` `Tabs` (`bench-temper`, `bench-fuse`) at the top of the middle pane, which the pad's LT / RT step (the input map). Picking a row in the gear list (or a fused result) switches to Temper on it.
- **Temper's prices "against the wallet":** an "In hand: n scrap · n Mana Dust" line (`forge-purse`), and each action disabled when the purse is short (Upgrade and Reforge in scrap, Re-attune in Mana Dust; today's sheet left Re-attune enabled and let the engine refuse). Upgrade reads "Upgrade +1 · n scrap", or "Max +10" (`forge.maxUpgrade`) at the top. The sheet's messages ("Upgraded to +n", "Reforged!", "Attuned to Storm", the engine's reason) stay as a `role="status"` line.
- **Reforge's pick** (decided item 39): "Reforge…" (`reforge-open`) swaps the bench's actions for a `data-pad-scope` (`reforge-pick`) holding a Back (`reforge-back`, `data-pad-back`, Esc / B), one row per affix (`reforge-line-<i>`, the first `data-pad-first`), and "Reforge · n scrap" (`reforge-button`). It stays open after a reforge, as the sheet's reforge mode did, so a line can be rolled again; the stats flash on success.
- **The gear list rows** are buttons with a socket, the name in `RARITY_TEXT`, and "Rarity Slot · +n · Equipped" as a caption. The selected row is marked by a hot-metal bar at its left, not raised steel (captions and three rarity colours fail on `#3a4466`). Filters: All, Weapons, Armor (helm, chest, gloves, boots), Jewelry (amulet, ring).
- **Fusion's rarity chips** show the rarity as a swatch beside white text (green, blue and orange text fail on a chip's `#3a4466`); their accessible names stay "Rare · n", so the moved test's `{ name: /^Rare/ }` holds. A click on the fused result picks it on the Temper bench (today it opened the item sheet).
- **"Fuse 3 → 1"** shows on every row holding enough of a rune below tier V, as today (the spec's "visible" read as "a button on the row", not "on every row").
- **Locked:** in `mode: 'pause'` or while `isDiveActive`, the bench is the note "A dive is under way: forge and salvage between dives." (`forge-locked`, today's text) and the rune pane's Fuse buttons are disabled with its own note; the gear list still browses.
- **Codex sections** are a `level="sub"` `Tabs` laid out as a column (a CSS override on `.k-tabs` in the 340 px pane), each with its count as the tab's badge ("Legendaries 1/12", "Reactions 1/15"), and a progress `Bar` under them for the two counted sections.
- **The Codex detail** shows the hovered or focused card, else the section's first. A legendary: its icon at 96 px, its name (or "???"), its text with the rolled range once found, "Found ×n · Drops on: …". A reaction: its two elements as glyphs with their names, then its name and text once discovered; an undiscovered one stays a "???" with the hint (discovery stays hidden).
- **Records:** the middle pane's well tiles (Dives, Deepest, Extracts, Kills, Bosses, Deaths, Scrap earned; `codex-records`) and, in the detail, the items found by rarity, always shown (the interim hid them before a first dive).
- **Emoji:** the Forge's ⚙ / ✦ become `Price` glyphs and the re-attune chips' mana emoji element `Glyph`s; the reactions' `icon` emoji become their two element glyphs, and "❔" a "?". Two shared views keep theirs, outside 2C's files: `RuneGlyph` (a rune's icon; `runes/`, no Phase 2 owner) and `ItemHeader`'s mana and Melee / Ranged tags (`items/`, also on 2A's compare pane).
- **Reduced motion:** the fusion's converge and pop and Temper's stat flash are today's WAAPI calls, guarded for jsdom (`animate?.`), not yet faded under `prefers-reduced-motion` (decided item 14 binds the kit's own animations).

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `ui/p2-2c` (Tasks 1–6) or `ui/p2` (Task 7), staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell; every commit block starts with `cd` to it.
- **Line endings:** a fresh worktree checks the existing files out CRLF (`file <path>` tells). New files are written LF; `ReactionsGrid.tsx` is overwritten whole (LF is fine: git stores LF). Edits keep each file's own endings. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** every file Tasks 1–6 create or overwrite, and `ReactionsGrid.test.tsx`, pass `npx prettier --check --end-of-line auto`; the code below is already formatted (checked on the scratch copy), so each commit block's `--write` changes nothing typed as written. `ItemDetailSheet.test.tsx` is **never formatted** (it fails the check at the base): Task 7 only hand-edits it.
- **How the edits read:** the 4a plan's language. "Replace: A with: B" is one Edit. "Replace the lines from `A` to the end of the file with: C" runs from the start of the line that reads `A` to the file's last line. "Delete the lines from `A` up to (not including) `B`." removes them. "Create `f`:" is a Write; "Overwrite `f`:" is a Write over an existing file. "Append at the end of the file:" adds a blank line and the block after the last line. Every anchor is unique in its file at that point; apply each file's edits top to bottom.
- **Checked on a scratch copy:** `ui/p2` at `2d6273a` (`git archive`, node_modules junctioned to `C:/Projects/alloy-ui-p2`'s). Every task's files were applied in order, every FAIL and PASS below was run, Prettier's check passed, the typecheck was clean, and the client suite went from 994 tests in 123 files to 1015 in 128. Task 7 was run after a stand-in for cross-area need 1: 1007 tests in 127 files, the typecheck clean, one failure (`AnvilHub.test.tsx`, need 2).

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Engine bundle (once) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |

---

## Chunk 1: The Forge's rune pane and Temper bench

### Task 1: `RunePane`

Today's `RunePouchPanel` in the kit: the same props, rows and ids, with prices as `Price` glyphs. Its tests move here with the same assertions, but for the price text ("20 scrap" for "⚙ 20") and the cost's colour class.

**Files:**
- Create: `packages/client/src/features/delve/hub/forge/RunePane.tsx`
- Create: `packages/client/src/features/delve/hub/forge/__tests__/RunePane.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/forge/__tests__/RunePane.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RunePouch, RuneRef } from '@alloy/engine';
import { RunePane } from '../RunePane';
import { pricedRegistry } from '../../../runes/__tests__/priced-registry';

/** `delve.runes.fuseScrap` (20, 40, 80, 160 to make II to V); tier V doesn't fuse. */
const fusePrice = (r: RuneRef) => [20, 40, 80, 160][r.tier - 1] ?? null;
const pouch: RunePouch = {
  quick: [0, 0, 0, 0, 4],
  split: [3, 0, 1, 0, 0],
  ghost: [5, 0, 0, 0, 0],
};

function pane(over: { scrap?: number; locked?: boolean; pouch?: RunePouch } = {}) {
  const onFuse = vi.fn();
  render(
    <RunePane
      pouch={over.pouch ?? pouch}
      fuseCount={3}
      fusePrice={fusePrice}
      scrap={over.scrap ?? 100}
      locked={over.locked ?? false}
      onFuse={onFuse}
    />,
  );
  return onFuse;
}

describe('RunePane (the Forge tab)', () => {
  it("lists every rune held by tier in the data's order, and fuses three where it can", () => {
    const onFuse = pane();
    const rows = screen.getAllByTestId(/^pouch-/).map((r) => r.dataset.testid);
    expect(rows).toEqual(['pouch-split-1', 'pouch-split-3', 'pouch-quick-5']);
    expect(screen.getByTestId('pouch-split-1')).toHaveTextContent('Split I ×3');
    expect(screen.getByTestId('pouch-split-1')).toHaveTextContent(
      'Splits into 2 shards on hit, each at 30% power',
    );
    expect(screen.getByTestId('pouch-quick-5')).toHaveTextContent('Quick V ×4');
    expect(screen.getByTestId('rune-fuse-split-1')).toHaveTextContent('Fuse 3 → 1 · 20 scrap');
    // One Split III is short of three; tier V doesn't fuse.
    expect(screen.queryByTestId('rune-fuse-split-3')).toBeNull();
    expect(screen.queryByTestId('rune-fuse-quick-5')).toBeNull();
    fireEvent.click(screen.getByTestId('rune-fuse-split-1'));
    expect(onFuse).toHaveBeenCalledWith({ id: 'split', tier: 1 });
  });

  it("a fuse it can't pay is disabled and says why", () => {
    pane({ scrap: 10 });
    const fuse = screen.getByTestId('rune-fuse-split-1');
    expect(fuse).toBeDisabled();
    expect(fuse).toHaveAccessibleDescription('Needs 20 scrap');
  });

  it('locked mid-dive, as the rest of the forge', () => {
    const onFuse = pane({ locked: true });
    const fuse = screen.getByTestId('rune-fuse-split-1');
    expect(fuse).toBeDisabled();
    expect(fuse).toHaveAccessibleDescription('A dive is under way: fuse runes between dives.');
    fireEvent.click(fuse);
    expect(onFuse).not.toHaveBeenCalled();
  });

  it('prices each rune beside its effect: its full load, uneased (no move known)', () => {
    pricedRegistry();
    pane();
    expect(screen.getByTestId('pouch-split-1')).toHaveTextContent(
      'Splits into 2 shards on hit, each at 30% power · +27% cost',
    );
    expect(screen.getByTestId('pouch-split-3')).toHaveTextContent('+45% cost');
    expect(screen.getByText('+35% cost')).toHaveClass('text-[var(--k-hot)]'); // Quick V
  });

  it('an empty pouch says where runes come from', () => {
    pane({ pouch: {} });
    expect(screen.getByTestId('rune-pouch')).toHaveTextContent(
      'No runes yet. Foes drop them now and then, and every boss drops one.',
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/RunePane.test.tsx)`
Expected: FAIL: `Error: Failed to resolve import "../RunePane" from "src/features/delve/hub/forge/__tests__/RunePane.test.tsx". Does the file exist?` (1 file failed, no tests).

- [ ] **Step 3: The pane**

Create `packages/client/src/features/delve/hub/forge/RunePane.tsx`:

```tsx
import { useId } from 'react';
import { runeText, type RunePouch, type RuneRef, type RuneTier } from '@alloy/engine';
import { Button, Panel, Price } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { RuneGlyph } from '../../runes/RuneGlyph';
import { runeName } from '../../runes/rune-style';

export interface RunePaneProps {
  pouch: RunePouch;
  fuseCount: number;
  /** Scrap to fuse `fuseCount` of a rune into one of the next tier; null: it doesn't fuse (tier V). */
  fusePrice: (ref: RuneRef) => number | null;
  scrap: number;
  locked: boolean;
  onFuse: (ref: RuneRef) => void;
}

/**
 * The Forge's rune pane: every rune held, by tier, with its count, effect and
 * raw price (its full load: no move, no ease), and "Fuse 3 → 1" at its scrap
 * price where enough are held (never at tier V).
 * Locked mid-dive, as the rest of the forge; a fuse it can't pay says why.
 */
export function RunePane({ pouch, fuseCount, fusePrice, scrap, locked, onFuse }: RunePaneProps) {
  const registry = getDelveRegistry();
  const id = useId();
  // In the data's order, then by tier; ids the data doesn't know are skipped.
  const held = registry
    .getRunes()
    .flatMap((def) =>
      (pouch[def.id] ?? []).flatMap((n, i) =>
        n > 0 ? [{ rune: { id: def.id, tier: (i + 1) as RuneTier }, n }] : [],
      ),
    );
  return (
    <Panel title="Runes" testId="rune-pouch">
      {locked && (
        <p id={`${id}-locked`} className="k-body-2" data-testid="rune-pouch-locked">
          A dive is under way: fuse runes between dives.
        </p>
      )}
      {held.length === 0 && (
        <p className="k-body-2">
          No runes yet. Foes drop them now and then, and every boss drops one.
        </p>
      )}
      {held.map(({ rune, n }) => {
        const key = `${rune.id}-${rune.tier}`;
        const price = n >= fuseCount ? fusePrice(rune) : null;
        const short = price !== null && price > scrap;
        const text = runeText(registry, rune);
        return (
          <div key={key} className="flex items-center gap-3" data-testid={`pouch-${key}`}>
            <RuneGlyph rune={rune} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[18px] text-[var(--k-text)]">
                {runeName(registry, rune)} ×{n}
              </span>
              <span className="k-caption">
                {text.effect}
                {text.cost && ' · '}
                {text.cost && <span className="text-[var(--k-hot)]">{text.cost}</span>}
              </span>
            </span>
            {price !== null && (
              <span className="flex flex-col items-end gap-1">
                <Button
                  size="sm"
                  disabled={locked || short}
                  onClick={() => onFuse(rune)}
                  aria-describedby={locked ? `${id}-locked` : short ? `${id}-${key}` : undefined}
                  testId={`rune-fuse-${key}`}
                >
                  Fuse {fuseCount} → 1 · <Price scrap={price} />
                </Button>
                {short && !locked && (
                  <span id={`${id}-${key}`} className="k-caption">
                    Needs <Price scrap={price} />
                  </span>
                )}
              </span>
            )}
          </div>
        );
      })}
    </Panel>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/RunePane.test.tsx)`
Expected: PASS (5 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 999 tests pass in 124 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/forge/RunePane.tsx src/features/delve/hub/forge/__tests__/RunePane.test.tsx)
git add packages/client/src/features/delve/hub/forge/RunePane.tsx packages/client/src/features/delve/hub/forge/__tests__/RunePane.test.tsx
git commit -m "feat(client): the Forge's rune pane in the kit, priced in glyphs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: The Temper bench

Upgrade, Reforge and Re-attune on one item (decided item 16), with the item sheet's sounds and messages, each priced against the purse. Reforge's affix pick is its own pad scope with a Back (decided item 39). The re-attune test is the item sheet's, priced in glyphs.

**Files:**
- Create: `packages/client/src/features/delve/hub/forge/Temper.tsx`
- Create: `packages/client/src/features/delve/hub/forge/__tests__/Temper.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/forge/__tests__/Temper.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import {
  findItem,
  generateItem,
  reforgeCost,
  upgradeCost,
  SeededRNG,
  type GearItem,
  type ManaType,
} from '@alloy/engine';
import { Temper } from '../Temper';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const pal = registry.getDelveBalance().pair;
/** A magic helm with only the lines given as affixes. */
const helm = (mana: ManaType, affixes: GearItem['affixes'] = []): GearItem => ({
  ...generateItem(
    registry,
    { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana },
    new SeededRNG(4),
  ),
  affixes,
});
/** The bench on `uid` as the store holds it now, as the Forge tab passes it. */
function Bench({ uid }: { uid: string }) {
  const item = useDelveStore((s) => findItem(s.profile, uid)!.item);
  return <Temper item={item} />;
}
const bench = (item: GearItem, over: { scrap?: number; manaDust?: number } = {}) => {
  store().setProfile({ ...store().profile, bag: [item], ...over });
  render(<Bench uid={item.uid} />);
};

describe('Temper', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('upgrades the item for scrap, priced against the purse', () => {
    const item = helm('fire');
    const cost = upgradeCost(registry, item)!;
    bench(item, { scrap: cost - 1 });
    const up = screen.getByTestId('upgrade-button');
    expect(up).toHaveTextContent(`Upgrade +1 · ${cost} scrap`);
    expect(up).toBeDisabled();
    expect(screen.getByTestId('forge-purse')).toHaveTextContent(`In hand: ${cost - 1} scrap`);
    act(() => store().setProfile({ ...store().profile, scrap: cost }));
    fireEvent.click(up);
    expect(store().profile).toMatchObject({ scrap: 0, bag: [{ uid: 'h1', upgrade: 1 }] });
    expect(screen.getByRole('status')).toHaveTextContent('Upgraded to +1');
  });

  it('at the top forge level Upgrade says so', () => {
    const max = registry.getDelveBalance().forge.maxUpgrade;
    bench({ ...helm('fire'), upgrade: max });
    expect(screen.getByTestId('upgrade-button')).toHaveTextContent(`Max +${max}`);
    expect(screen.getByTestId('upgrade-button')).toBeDisabled();
  });

  it('reforges a line picked in its own pad scope; Back leaves it', () => {
    const item = helm('fire', [{ stat: 'fireAttune', value: 2, roll: 0.5 }]);
    const cost = reforgeCost(registry, item);
    bench(item, { scrap: cost });
    fireEvent.click(screen.getByTestId('reforge-open'));
    expect(screen.getByTestId('reforge-pick')).toHaveAttribute('data-pad-scope');
    expect(screen.getByTestId('reforge-back')).toHaveAttribute('data-pad-back');
    expect(screen.getByTestId('reforge-line-0')).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('reforge-button')).toBeDisabled();
    expect(screen.getByTestId('reforge-button')).toHaveTextContent('Pick a line');
    fireEvent.click(screen.getByTestId('reforge-line-0'));
    expect(screen.getByTestId('reforge-line-0')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('reforge-button')).toHaveTextContent(`Reforge · ${cost} scrap`);
    fireEvent.click(screen.getByTestId('reforge-button'));
    expect(store().profile.scrap).toBe(0);
    expect(store().profile.bag[0].reforges).toBe(1);
    expect(screen.getByRole('status')).toHaveTextContent('Reforged!');
    fireEvent.click(screen.getByTestId('reforge-back'));
    expect(screen.queryByTestId('reforge-pick')).toBeNull();
    expect(screen.getByTestId('upgrade-button')).toBeInTheDocument();
  });

  it('an item with no affixes has no Reforge', () => {
    bench(helm('fire'));
    expect(screen.queryByTestId('reforge-open')).toBeNull();
  });

  it("re-attunes to the pair's other element for Mana Dust", () => {
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    bench(helm('frost'), { manaDust: pal.reattuneDust.magic });
    expect(screen.getByTestId('reattune-fire')).toHaveTextContent(
      `Fire · ${pal.reattuneDust.magic} Mana Dust`,
    );
    fireEvent.click(screen.getByTestId('reattune-storm'));
    expect(store().profile.bag[0].mana).toBe('storm');
    expect(store().profile.manaDust).toBe(0);
    expect(screen.queryByTestId('reattune-storm')).toBeNull(); // its own element now
    expect(screen.getByTestId('reattune-fire')).toBeDisabled(); // no Dust left
    expect(screen.getByRole('status')).toHaveTextContent('Attuned to Storm');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/Temper.test.tsx)`
Expected: FAIL: `Failed to resolve import "../Temper"` (1 file failed, no tests).

- [ ] **Step 3: The bench**

Create `packages/client/src/features/delve/hub/forge/Temper.tsx`:

```tsx
import { useRef, useState } from 'react';
import {
  itemStatLines,
  pairElements,
  reattuneCost,
  reforgeCost,
  upgradeCost,
  type GearItem,
  type ManaType,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Chip, Glyph, Price } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemHeader } from '../../items/ItemHeader';
import { ItemStatLines, AffixLine } from '../../items/ItemStatLines';
import { manaStyle } from '../../format';

const BACK = { key: 'Escape', pad: 'b' } as const;

/**
 * The Temper bench: the selected item's Upgrade +1, Reforge (pick a line, in
 * its own pad scope with a Back) and Re-attune to the pair's other element,
 * each priced against the purse.
 */
export function Temper({ item }: { item: GearItem }) {
  const registry = getDelveRegistry();
  const scrap = useDelveStore((s) => s.profile.scrap);
  const dust = useDelveStore((s) => s.profile.manaDust);
  const pair = useDelveStore((s) => s.profile.pair);
  const store = useDelveStore.getState;
  const [picking, setPicking] = useState(false);
  const [line, setLine] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  const upCost = upgradeCost(registry, item);
  const rfCost = reforgeCost(registry, item);
  const raCost = reattuneCost(registry, item);
  const affixes = itemStatLines(item, registry).filter((l) => l.source === 'affix');
  const reattuneTo = pairElements(pair).filter((m) => m !== item.mana);
  const max = registry.getDelveBalance().forge.maxUpgrade;

  const say = (text: string, good: boolean) => {
    setMessage({ text, good });
    window.setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 1800);
  };
  const flash = () =>
    statsRef.current?.animate?.(
      [
        { filter: 'brightness(2.2)', transform: 'scale(1.02)' },
        { filter: 'brightness(1)', transform: 'scale(1)' },
      ],
      { duration: 450, easing: 'ease-out' },
    );
  const done = (ok: boolean, good: string, reason: string | undefined, fallback: string) => {
    if (ok) {
      vibrate('medium');
      flash();
      say(good, true);
    } else {
      playSound('combineFail');
      say(reason ?? fallback, false);
    }
  };

  const onUpgrade = () => {
    const res = store().upgrade(item.uid);
    if (res.ok) playSound('upgradeTier');
    done(res.ok, `Upgraded to +${res.item?.upgrade}`, res.reason, 'Cannot upgrade');
  };
  const onReforge = () => {
    if (line === null) return;
    const res = store().reforge(item.uid, line);
    if (res.ok) playSound('combineMerge');
    done(res.ok, 'Reforged!', res.reason, 'Cannot reforge');
  };
  const onReattune = (to: ManaType) => {
    const res = store().reattune(item.uid, to);
    if (res.ok) playSound('combineMerge');
    done(res.ok, `Attuned to ${manaStyle(registry, to).name}`, res.reason, 'Cannot re-attune');
  };

  return (
    <div className="flex flex-col gap-4" data-testid="temper">
      <ItemHeader item={item} size="lg" />
      <div className="k-caption flex items-center gap-2" data-testid="forge-purse">
        In hand: <Price scrap={scrap} dust={dust} />
      </div>
      {message && (
        <p
          role="status"
          className="text-[16px]"
          style={{ color: message.good ? 'var(--k-ok)' : 'var(--k-bad-text)' }}
        >
          {message.text}
        </p>
      )}
      {picking ? (
        <div
          ref={statsRef}
          className="flex flex-col gap-3"
          data-pad-scope
          data-testid="reforge-pick"
        >
          <div className="flex items-center justify-between">
            <span className="k-label">Pick a line to reforge</span>
            <Button
              variant="quiet"
              size="sm"
              binding={BACK}
              data-pad-back
              onClick={() => {
                setPicking(false);
                setLine(null);
              }}
              testId="reforge-back"
            >
              Back
            </Button>
          </div>
          {affixes.map((l, i) => (
            <button
              key={`${i}-${l.stat}`}
              type="button"
              className="k-well p-2 text-left"
              style={{ borderColor: line === i ? 'var(--k-hot)' : undefined }}
              aria-pressed={line === i}
              data-pad-first={i === 0 ? '' : undefined}
              onClick={() => setLine(i)}
              data-testid={`reforge-line-${i}`}
            >
              <AffixLine line={l} />
            </button>
          ))}
          <Button
            variant="primary"
            disabled={line === null || rfCost > scrap}
            onClick={onReforge}
            testId="reforge-button"
          >
            {line === null ? (
              'Pick a line'
            ) : (
              <>
                Reforge · <Price scrap={rfCost} />
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div ref={statsRef}>
            <ItemStatLines item={item} />
          </div>
          <p className="k-caption">Each forge level adds +10% to every stat on the item.</p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              disabled={upCost === null || upCost > scrap}
              onClick={onUpgrade}
              testId="upgrade-button"
            >
              {upCost === null ? (
                `Max +${max}`
              ) : (
                <>
                  Upgrade +1 · <Price scrap={upCost} />
                </>
              )}
            </Button>
            {affixes.length > 0 && (
              <Button onClick={() => setPicking(true)} testId="reforge-open">
                Reforge…
              </Button>
            )}
          </div>
          {reattuneTo.length > 0 && (
            <div className="flex flex-col gap-2" data-testid="reattune">
              <p className="k-caption">
                Re-attune to your other element: its {manaStyle(registry, item.mana).name} lines
                follow.
              </p>
              <div className="flex flex-wrap gap-2">
                {reattuneTo.map((m) => {
                  const st = manaStyle(registry, m);
                  return (
                    <Chip
                      key={m}
                      disabled={raCost > dust}
                      onClick={() => onReattune(m)}
                      testId={`reattune-${m}`}
                    >
                      <Glyph id={m} size={16} color={st.color} /> {st.name} ·{' '}
                      <Price dust={raCost} />
                    </Chip>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/Temper.test.tsx)`
Expected: PASS (5 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1004 tests pass in 125 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/forge/Temper.tsx src/features/delve/hub/forge/__tests__/Temper.test.tsx)
git add packages/client/src/features/delve/hub/forge/Temper.tsx packages/client/src/features/delve/hub/forge/__tests__/Temper.test.tsx
git commit -m "feat(client): the Forge's Temper bench: upgrade, reforge in its own pad scope, re-attune" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The Forge's Fusion and the tab

### Task 3: Alloy Fusion

`ForgePanel`'s fusion, moved: the same state, sounds, toasts and animation, in kit chips, tiles and buttons. The item sheet file's "the Forge's Fuse asks first" test moves here with its assertions; a second test pins the price and the result's link to the bench.

**Files:**
- Create: `packages/client/src/features/delve/hub/forge/Fuse.tsx`
- Create: `packages/client/src/features/delve/hub/forge/__tests__/Fuse.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/forge/__tests__/Fuse.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { defaultMoveset, generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { Fuse } from '../Fuse';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const split = { id: 'split', tier: 3 } as const;
/** A rare sword (Basic, Primary and Defensive) at its base slots. */
const rareSword = (uid: string): GearItem => {
  const w = generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(4),
  );
  return { ...w, moveset: defaultMoveset(registry, w, 'fire') };
};
/** `w` with its Primary's first move holding Split III. */
const withSplit = (w: GearItem): GearItem => {
  const moveset = w.moveset!;
  const primary = moveset.chains.primary!;
  const moves = [{ ...primary.moves[0], runes: [split] }, ...primary.moves.slice(1)];
  return {
    ...w,
    moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } },
  };
};

describe('Fuse (Alloy Fusion)', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    useDelveStore.setState({ unsocket: null });
    const animate = vi.fn(() => ({ finished: Promise.resolve() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
  });
  afterEach(() => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  it('asks first when an input holds runes, naming what becomes of them', async () => {
    store().setProfile({
      ...store().profile,
      scrap: 9999,
      bag: [withSplit(rareSword('a')), rareSword('b'), rareSword('c')],
    });
    render(<Fuse onResult={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^Rare/ }));
    fireEvent.click(screen.getByText('Auto-pick'));
    fireEvent.click(screen.getByTestId('fuse-button'));
    expect(store().profile.bag).toHaveLength(3);
    expect(screen.getByTestId('fuse-button')).toHaveTextContent(
      'Tap again to fuse · destroys Split III',
    );
    await act(async () => fireEvent.click(screen.getByTestId('fuse-button')));
    expect(store().profile.bag.map((i) => i.rarity)).toEqual(['epic']);
  });

  it('prices the fusion in scrap, and a click on the result tempers it', async () => {
    store().setProfile({
      ...store().profile,
      scrap: 9999,
      bag: [rareSword('a'), rareSword('b'), rareSword('c')],
    });
    const onResult = vi.fn();
    render(<Fuse onResult={onResult} />);
    expect(screen.getByTestId('fuse-button')).toHaveTextContent('Pick 3 items');
    fireEvent.click(screen.getByRole('button', { name: /^Rare/ }));
    for (const t of screen.getAllByTestId('fuse-candidate')) fireEvent.click(t);
    expect(screen.getByTestId('fuse-button')).toHaveTextContent(/^Fuse · [\d,]+ scrap$/);
    await act(async () => fireEvent.click(screen.getByTestId('fuse-button')));
    const made = store().profile.bag[0];
    expect(made.rarity).toBe('epic');
    fireEvent.click(within(screen.getByTestId('fusion-result')).getByRole('button'));
    expect(onResult).toHaveBeenCalledWith(made.uid);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/Fuse.test.tsx)`
Expected: FAIL: `Failed to resolve import "../Fuse"` (1 file failed, no tests).

- [ ] **Step 3: The fusion**

Create `packages/client/src/features/delve/hub/forge/Fuse.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react';
import {
  checkFusion,
  fuseCost,
  nextRarity,
  unsocketMode,
  weaponParts,
  type GearItem,
  type Rarity,
} from '@alloy/engine';
import { partsText, pullText, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { Button, Chip, Price, Tile } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemIcon } from '../../ItemIcon';
import { RARITY_COLOR, RARITY_LABEL, RARITY_TEXT } from '../../format';

const FUSABLE: Rarity[] = ['common', 'uncommon', 'magic', 'rare', 'epic'];

const icon = (item: GearItem) => <ItemIcon baseId={item.baseId} rarity={item.rarity} />;

/**
 * Alloy Fusion: three unlocked bag items of one rarity melt into one of the
 * next, for scrap. Inputs holding runes ask first, naming what becomes of them.
 * `onResult` picks the new item (for the Temper bench).
 */
export function Fuse({ onResult }: { onResult: (uid: string) => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const unsocket = useDelveStore((s) => s.unsocket);
  const [rarity, setRarity] = useState<Rarity>('common');
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<GearItem | null>(null);
  const [busy, setBusy] = useState(false);
  // The picks a Fuse was pressed for once: inputs holding runes ask first.
  const [armed, setArmed] = useState<string | null>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FUSABLE.map((r) => [r, 0])) as Record<Rarity, number>;
    for (const i of profile.bag) if (!i.locked && i.rarity !== 'legendary') c[i.rarity]++;
    return c;
  }, [profile.bag]);

  const pool = profile.bag.filter((i) => i.rarity === rarity && !i.locked);
  const pickedItems = picked
    .map((uid) => profile.bag.find((i) => i.uid === uid))
    .filter(Boolean) as GearItem[];
  const check = checkFusion(pickedItems);
  const cost = pickedItems.length === 3 ? fuseCost(registry, pickedItems) : null;
  const target = nextRarity(rarity);
  const melts = pullText(
    registry,
    pickedItems.flatMap((i) => weaponParts(registry, i).runes),
    unsocketMode(registry, unsocket),
  );
  const asking = !!melts && armed === picked.join();

  const toggle = (uid: string) => {
    setResult(null);
    setPicked((p) =>
      p.includes(uid) ? p.filter((u) => u !== uid) : p.length < 3 ? [...p, uid] : p,
    );
    playSound('orbSelect');
  };

  const chooseRarity = (r: Rarity) => {
    setRarity(r);
    setPicked([]);
    setResult(null);
  };

  const autoPick = () => {
    setResult(null);
    setPicked(pool.slice(0, 3).map((i) => i.uid));
  };

  const onFuse = async () => {
    if (!check.ok || busy) return;
    if (melts && !asking) {
      setArmed(picked.join());
      return;
    }
    setBusy(true);
    playSound('forgeCreak');
    // Converge the three input tiles on the centre before the result appears.
    const centre = resultRef.current?.getBoundingClientRect();
    const anims = slotRefs.current.map((el) => {
      if (!el?.animate || !centre) return null;
      const r = el.getBoundingClientRect();
      const dx = centre.left + centre.width / 2 - (r.left + r.width / 2);
      const dy = centre.top + centre.height / 2 - (r.top + r.height / 2);
      return el.animate(
        [
          { transform: 'translate(0,0) scale(1)', filter: 'brightness(1)' },
          {
            transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 18}px) scale(1.1)`,
            filter: 'brightness(1.6)',
            offset: 0.5,
          },
          {
            transform: `translate(${dx}px, ${dy}px) scale(0.2)`,
            filter: 'brightness(3)',
            opacity: 0,
          },
        ],
        { duration: 650, easing: 'cubic-bezier(0.5, 0, 0.8, 0.6)' },
      );
    });
    await Promise.all(anims.map((a) => a?.finished.catch(() => undefined)));

    const res = useDelveStore.getState().fuse(picked);
    setBusy(false);
    setPicked([]);
    setArmed(null);
    if (!res.ok || !res.item) {
      playSound('combineFail');
      return;
    }
    setResult(res.item);
    if (res.links)
      showToast(`+${res.links} Link${res.links > 1 ? 's' : ''} from the weapons' extra slots`);
    const parts = partsText(registry, res.runes, res.destroyed);
    if (parts) showToast(parts);
    playSound(res.item.rarity === 'legendary' ? 'lootLegendary' : 'combineMerge');
    vibrate(res.item.rarity === 'legendary' ? 'heavy' : 'success');
    requestAnimationFrame(() => {
      resultRef.current?.animate?.(
        [
          { transform: 'scale(0.2) rotate(-20deg)', filter: 'brightness(3)' },
          { transform: 'scale(1.25) rotate(4deg)', filter: 'brightness(1.8)', offset: 0.6 },
          { transform: 'scale(1) rotate(0)', filter: 'brightness(1)' },
        ],
        { duration: 600, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' },
      );
    });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="fuse-bench">
      <p className="k-caption">
        Melt three items of one rarity into one item of the next. Keeps the highest item level and
        forge level.
      </p>

      <div className="flex flex-wrap gap-2">
        {FUSABLE.map((r) => (
          <Chip key={r} pressed={rarity === r} onClick={() => chooseRarity(r)}>
            <span aria-hidden className="k-swatch" style={{ background: RARITY_COLOR[r] }} />
            {RARITY_LABEL[r]} · {counts[r]}
          </Chip>
        ))}
      </div>

      <div className="flex items-center justify-center gap-3">
        {[0, 1, 2].map((i) => {
          const item = pickedItems[i];
          return (
            <div key={i} ref={(el) => void (slotRefs.current[i] = el)}>
              <Tile
                rarity={item?.rarity ?? null}
                icon={item && icon(item)}
                disabled={!item}
                onClick={item ? () => toggle(item.uid) : undefined}
                label={item ? `Remove ${item.name}` : 'Empty fusion slot'}
              />
            </div>
          );
        })}
        <span aria-hidden className="k-disp px-1 text-[32px] text-[var(--k-text-3)]">
          →
        </span>
        <div ref={resultRef} data-testid="fusion-result">
          {result ? (
            <Tile
              rarity={result.rarity}
              icon={icon(result)}
              label={`${result.name}: temper it`}
              onClick={() => onResult(result.uid)}
            />
          ) : (
            <div
              className="k-disp flex h-[84px] w-[84px] items-center justify-center border-[3px] border-dashed text-center text-[16px]"
              style={{
                borderColor: target ? RARITY_COLOR[target] : 'var(--k-steel-2)',
                color: target ? RARITY_TEXT[target] : 'var(--k-text-3)',
              }}
            >
              {target ? RARITY_LABEL[target] : '—'}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Button className="flex-1" onClick={autoPick} disabled={pool.length < 3 || busy}>
          Auto-pick
        </Button>
        <Button
          variant="primary"
          className="flex-[2]"
          disabled={!check.ok || busy || (cost !== null && cost > profile.scrap)}
          onClick={onFuse}
          testId="fuse-button"
        >
          {cost === null ? (
            'Pick 3 items'
          ) : asking ? (
            `Tap again to fuse · ${melts}`
          ) : (
            <>
              Fuse · <Price scrap={cost} />
            </>
          )}
        </Button>
      </div>

      {pool.length > 0 && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}
        >
          {pool.map((item) => (
            <Tile
              key={item.uid}
              rarity={item.rarity}
              icon={icon(item)}
              size={64}
              selected={picked.includes(item.uid)}
              onClick={() => toggle(item.uid)}
              label={item.name}
              testId="fuse-candidate"
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/Fuse.test.tsx)`
Expected: PASS (2 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1006 tests pass in 126 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/forge/Fuse.tsx src/features/delve/hub/forge/__tests__/Fuse.test.tsx)
git add packages/client/src/features/delve/hub/forge/Fuse.tsx packages/client/src/features/delve/hub/forge/__tests__/Fuse.test.tsx
git commit -m "feat(client): Alloy Fusion on the Forge's bench, in the kit" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: `GearList` and `ForgeTab`

The tab: the gear list, the bench's Tabs over Temper and Fuse, the rune pane, the link, the lock and the prompts. The item sheet file's "mid-dive the Forge tab waits" and "the Forge tab holds the pouch" tests move here (the pouch is now found by `rune-pouch`, the pane's own id, instead of the old `forge-runes` wrapper).

**Files:**
- Create: `packages/client/src/features/delve/hub/forge/GearList.tsx`
- Create: `packages/client/src/features/delve/hub/forge/ForgeTab.tsx`
- Create: `packages/client/src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { ForgeTab } from '../ForgeTab';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import type { HubTabProps } from '../../types';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const item = (uid: string, slot: 'helm' | 'weapon'): GearItem =>
  generateItem(
    registry,
    {
      uid,
      ilvl: 3,
      rarity: 'magic',
      slot,
      mana: 'fire',
      baseId: slot === 'weapon' ? 'sword' : undefined,
    },
    new SeededRNG(4),
  );
const props = (over: Partial<HubTabProps> = {}): HubTabProps => ({
  mode: 'anvil',
  setPrompts: vi.fn(),
  setFooterAction: vi.fn(),
  go: vi.fn(),
  ...over,
});

describe('ForgeTab', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('lists what you wear first, then the bag, filtered by kind; a row picks the item to temper', () => {
    store().setProfile({ ...store().profile, bag: [item('h1', 'helm'), item('w1', 'weapon')] });
    const p = props();
    render(<ForgeTab {...p} />);
    expect(p.setPrompts).toHaveBeenCalledWith([expect.objectContaining({ label: 'Select' })]);
    const worn = Object.values(store().profile.equipped).length;
    const rows = screen.getAllByTestId('temper-row');
    expect(rows).toHaveLength(worn + 2);
    expect(rows.slice(0, worn).every((r) => r.textContent!.includes('Equipped'))).toBe(true);
    // The first item worn is on the bench until another is picked.
    expect(rows[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bench-temper')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('gear-filter-armor'));
    const armor = screen.getAllByTestId('temper-row');
    expect(armor.at(-1)).toHaveTextContent('Magic Helm');
    expect(armor.some((r) => r.textContent!.includes('Weapon'))).toBe(false);
    fireEvent.click(armor.at(-1)!);
    expect(screen.getByTestId('item-name')).toHaveTextContent(store().profile.bag[0].name);
  });

  it('a link picks its item and its bench, and a new link moves them', () => {
    store().setProfile({ ...store().profile, bag: [item('h1', 'helm'), item('h2', 'helm')] });
    const { rerender } = render(<ForgeTab {...props({ link: { tab: 'forge', bench: 'fuse' } })} />);
    expect(screen.getByTestId('bench-fuse')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('fuse-bench')).toBeInTheDocument();
    rerender(<ForgeTab {...props({ link: { tab: 'forge', uid: 'h2' } })} />);
    expect(screen.getByTestId('bench-temper')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('temper-row').at(-1)).toHaveAttribute('aria-pressed', 'true');
  });

  it('mid-dive, and in the pause, the forge waits for the dive to end', () => {
    store().setProfile({ ...store().profile, runes: { split: [3, 0, 0, 0, 0] } });
    store().startDive(1);
    const { unmount } = render(<ForgeTab {...props()} />);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('forge and salvage between dives');
    expect(screen.queryByTestId('fuse-button')).toBeNull();
    expect(screen.queryByTestId('upgrade-button')).toBeNull();
    expect(screen.getByTestId('rune-fuse-split-1')).toBeDisabled();
    unmount();
    store().resetProfile(1234, 'fire');
    render(<ForgeTab {...props({ mode: 'pause' })} />);
    expect(screen.getByTestId('forge-locked')).toBeInTheDocument();
  });

  it('the rune pane fuses three of a rune into one of the next tier, for scrap', () => {
    store().setProfile({ ...store().profile, scrap: 20, runes: { split: [3, 0, 0, 0, 0] } });
    render(
      <>
        <ForgeTab {...props()} />
        <ToastContainer />
      </>,
    );
    fireEvent.click(within(screen.getByTestId('rune-pouch')).getByTestId('rune-fuse-split-1'));
    expect(store().profile).toMatchObject({ scrap: 0, runes: { split: [0, 1, 0, 0, 0] } });
    expect(screen.getByText('Fused 3 Split I into Split II')).toBeInTheDocument();
    expect(screen.getByTestId('pouch-split-2')).toHaveTextContent('Split II ×1');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx)`
Expected: FAIL: `Failed to resolve import "../ForgeTab"` (1 file failed, no tests).

- [ ] **Step 3: The gear list**

Create `packages/client/src/features/delve/hub/forge/GearList.tsx`:

```tsx
import { useState } from 'react';
import type { GearItem, GearSlot } from '@alloy/engine';
import { Chip, Panel } from '../../kit';
import { ItemIcon } from '../../ItemIcon';
import { RARITY_COLOR, RARITY_LABEL, RARITY_TEXT, SLOT_LABEL } from '../../format';

type Filter = 'all' | 'weapons' | 'armor' | 'jewelry';

const FILTERS: { id: Filter; label: string; slots: readonly GearSlot[] }[] = [
  { id: 'all', label: 'All', slots: [] },
  { id: 'weapons', label: 'Weapons', slots: ['weapon'] },
  { id: 'armor', label: 'Armor', slots: ['helm', 'chest', 'gloves', 'boots'] },
  { id: 'jewelry', label: 'Jewelry', slots: ['amulet', 'ring'] },
];

/** The Forge's gear: what you wear first, then the bag, one row each (`temper-row`); a row picks the item for the bench. */
export function GearList({
  equipped,
  bag,
  selected,
  onSelect,
}: {
  equipped: GearItem[];
  bag: GearItem[];
  selected: string | null;
  onSelect: (uid: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const slots = FILTERS.find((f) => f.id === filter)!.slots;
  const shown = (items: GearItem[]) =>
    filter === 'all' ? items : items.filter((i) => slots.includes(i.slot));
  const rows = [
    ...shown(equipped).map((item) => ({ item, worn: true })),
    ...shown(bag).map((item) => ({ item, worn: false })),
  ];
  return (
    <Panel title="Gear" testId="gear-list">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            testId={`gear-filter-${f.id}`}
          >
            {f.label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {rows.map(({ item, worn }) => (
          <button
            key={item.uid}
            type="button"
            className="flex items-center gap-3 p-2 text-left"
            // The selected row: a hot-metal bar at its left (raised steel would fail its text's contrast).
            style={{ boxShadow: selected === item.uid ? 'inset 4px 0 0 var(--k-hot)' : undefined }}
            aria-pressed={selected === item.uid}
            onClick={() => onSelect(item.uid)}
            data-testid="temper-row"
          >
            <span
              aria-hidden
              className="k-socket flex h-14 w-14 flex-none items-center justify-center"
              style={{ borderColor: RARITY_COLOR[item.rarity] }}
            >
              <ItemIcon baseId={item.baseId} rarity={item.rarity} size={28} />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[18px]" style={{ color: RARITY_TEXT[item.rarity] }}>
                {item.name}
              </span>
              <span className="k-caption">
                {RARITY_LABEL[item.rarity]} {SLOT_LABEL[item.slot]}
                {item.upgrade > 0 && ` · +${item.upgrade}`}
                {worn && ' · Equipped'}
              </span>
            </span>
          </button>
        ))}
        {rows.length === 0 && <p className="k-body-2">Nothing here.</p>}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 4: The tab**

Create `packages/client/src/features/delve/hub/forge/ForgeTab.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { findItem, fusePrice, GEAR_SLOTS, isDiveActive, type RuneRef } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { Panel, Tabs, type Prompt } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { runeName } from '../../runes/rune-style';
import type { HubLink, HubTabProps } from '../types';
import { GearList } from './GearList';
import { Temper } from './Temper';
import { Fuse } from './Fuse';
import { RunePane } from './RunePane';

type BenchId = 'temper' | 'fuse';

const PROMPTS: Prompt[] = [
  { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
];

/**
 * The Forge tab: the gear list, the bench (Temper the selected item, or Alloy
 * Fusion) and the rune pane. `{ tab: 'forge', uid, bench }` links pick the item
 * and the bench. Locked while a dive is under way, and in the pause.
 */
export function ForgeTab({ mode, setPrompts, link }: HubTabProps) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const forgeLink = (l?: HubLink) => (l?.tab === 'forge' ? l : null);
  const [selected, setSelected] = useState<string | null>(forgeLink(link)?.uid ?? null);
  const [bench, setBench] = useState<BenchId>(forgeLink(link)?.bench ?? 'temper');
  // A new link (e.g. "Forge it ›" from the Loadout) picks its item and bench.
  const [seen, setSeen] = useState(link);
  if (link !== seen) {
    setSeen(link);
    const to = forgeLink(link);
    if (to) {
      if (to.uid) setSelected(to.uid);
      setBench(to.bench ?? 'temper');
    }
  }

  useEffect(() => setPrompts(PROMPTS), [setPrompts]);

  const equipped = GEAR_SLOTS.flatMap((s) => profile.equipped[s] ?? []);
  // The selected item, or (none yet, or fused away) the first one worn.
  const item = (selected && findItem(profile, selected)?.item) || equipped[0] || null;
  const locked = mode === 'pause' || isDiveActive(profile);

  const fuseCount = registry.getDelveBalance().runes.fuseCount;
  const onFuseRunes = (ref: RuneRef) => {
    const res = useDelveStore.getState().fuseRunes(ref);
    if (!res.ok) {
      playSound('combineFail');
      showToast(res.reason ?? 'Cannot fuse');
      return;
    }
    playSound('combineMerge');
    vibrate('success');
    showToast(
      `Fused ${fuseCount} ${runeName(registry, ref)} into ${runeName(registry, res.runes![0])}`,
    );
  };

  return (
    <div
      className="grid h-full min-h-0 gap-6 px-8 py-6"
      style={{ gridTemplateColumns: '430px minmax(0, 1fr) 470px' }}
      data-testid="forge-panel"
    >
      <GearList
        equipped={equipped}
        bag={profile.bag}
        selected={item?.uid ?? null}
        onSelect={(uid) => {
          playSound('orbSelect');
          setSelected(uid);
          setBench('temper');
        }}
      />
      <Panel aria-label="Bench" testId="forge-bench">
        {locked ? (
          <p className="k-body-2" data-testid="forge-locked">
            A dive is under way: forge and salvage between dives.
          </p>
        ) : (
          <>
            <Tabs
              aria-label="Bench"
              level="sub"
              size="md"
              value={bench}
              onChange={setBench}
              tabs={[
                { id: 'temper', label: 'Temper', testId: 'bench-temper' },
                { id: 'fuse', label: 'Fuse', testId: 'bench-fuse' },
              ]}
            />
            {bench === 'temper' && item && <Temper key={item.uid} item={item} />}
            {bench === 'fuse' && (
              <Fuse
                onResult={(uid) => {
                  setSelected(uid);
                  setBench('temper');
                }}
              />
            )}
          </>
        )}
      </Panel>
      <RunePane
        pouch={profile.runes}
        fuseCount={fuseCount}
        fusePrice={(ref) => fusePrice(registry, ref)}
        scrap={profile.scrap}
        locked={locked}
        onFuse={onFuseRunes}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge)`
Expected: PASS (16 tests in 4 files).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1010 tests pass in 127 files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-ui-2c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/forge/GearList.tsx src/features/delve/hub/forge/ForgeTab.tsx src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx)
git add packages/client/src/features/delve/hub/forge/GearList.tsx packages/client/src/features/delve/hub/forge/ForgeTab.tsx packages/client/src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx
git commit -m "feat(client): the Forge tab: gear list, Temper and Fuse bench, rune pane" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The Codex

### Task 5: `ReactionsGrid` in the kit, with glyphs and a hover callback

2·0 moved the grid out of the chain builder unchanged. It becomes kit cards (focusable, so the pad reaches them), a discovered reaction shows its two elements as glyphs instead of its emoji, and a card hovered or focused calls `onActive` for the Codex's detail. Its `reactionsSeen` prop, its ids and "n/15 discovered" stay, so 2·0's test and `AnvilHub`'s interim use are unchanged.

**Files:**
- Overwrite: `packages/client/src/features/delve/hub/codex/ReactionsGrid.tsx`
- Modify: `packages/client/src/features/delve/hub/codex/__tests__/ReactionsGrid.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/hub/codex/__tests__/ReactionsGrid.test.tsx`:

Replace: `import { describe, it, expect } from 'vitest';` with: `import { describe, it, expect, vi } from 'vitest';`

Replace: `import { render, screen } from '@testing-library/react';` with: `import { render, screen, fireEvent } from '@testing-library/react';`

Append at the end of the file:

```tsx
describe('ReactionsGrid in the Codex', () => {
  it("draws a discovered reaction's two elements as glyphs, and reports the card hovered or focused", () => {
    const onActive = vi.fn();
    render(<ReactionsGrid reactionsSeen={['melt']} active="melt" onActive={onActive} />);
    const melt = screen.getByTestId('reaction-melt');
    expect(
      [...melt.querySelectorAll('[data-glyph]')].map((g) => g.getAttribute('data-glyph')),
    ).toEqual(['fire', 'frost']);
    expect(melt).toHaveAttribute('aria-pressed', 'true');
    fireEvent.mouseEnter(screen.getAllByTestId('reaction-unknown')[0]);
    fireEvent.focus(melt);
    expect(onActive.mock.calls.map(([id]) => id)).toEqual([expect.any(String), 'melt']);
    expect(screen.getAllByTestId('reaction-unknown')[0].querySelector('[data-glyph]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/codex/__tests__/ReactionsGrid.test.tsx)`
Expected: FAIL, 1 failed, 1 passed: `AssertionError: expected [] to deeply equal [ 'fire', 'frost' ]`.

- [ ] **Step 3: The grid**

Overwrite `packages/client/src/features/delve/hub/codex/ReactionsGrid.tsx`:

```tsx
import { Glyph } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { manaStyle } from '../../format';

/**
 * Every reaction, by name and its two elements once discovered (`reactionsSeen`),
 * the rest as ???. A card hovered or focused is `onActive`'s (the Codex's detail);
 * `active` marks it.
 */
export function ReactionsGrid({
  reactionsSeen,
  active = null,
  onActive,
}: {
  reactionsSeen: readonly string[];
  active?: string | null;
  onActive?: (id: string) => void;
}) {
  const registry = getDelveRegistry();
  const data = registry.getArpgData();
  return (
    <section className="flex flex-col gap-4" aria-label="Reactions">
      <div className="flex items-baseline justify-between">
        <span className="k-section">Reactions</span>
        <span className="k-caption">
          {reactionsSeen.length}/{data.reactions.length} discovered
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {data.reactions.map((r) => {
          const seen = reactionsSeen.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              className="k-socket flex items-center gap-3 p-3 text-left"
              style={{ borderColor: active === r.id ? 'var(--k-hot)' : undefined }}
              aria-pressed={onActive ? active === r.id : undefined}
              onMouseEnter={() => onActive?.(r.id)}
              onFocus={() => onActive?.(r.id)}
              data-testid={seen ? `reaction-${r.id}` : 'reaction-unknown'}
            >
              <span aria-hidden className="flex w-12 flex-none justify-center gap-1">
                {seen ? (
                  r.elements.map((m) => (
                    <Glyph key={m} id={m} size={20} color={manaStyle(registry, m).color} />
                  ))
                ) : (
                  <span className="k-disp text-[28px] text-[var(--k-text-3)]">?</span>
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span
                  className="k-disp text-[20px]"
                  style={{ color: seen ? 'var(--k-text)' : 'var(--k-text-3)' }}
                >
                  {seen ? r.name : '???'}
                </span>
                <span className="k-caption">
                  {seen
                    ? r.text
                    : 'Stack one element on a foe, then hit it with another, to discover.'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/codex/__tests__/ReactionsGrid.test.tsx)`
Expected: PASS (2 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1011 tests pass in 127 files (`AnvilHub.test.tsx` still finds 15 `reaction-unknown` on its interim Codex).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/codex/ReactionsGrid.tsx src/features/delve/hub/codex/__tests__/ReactionsGrid.test.tsx)
git add packages/client/src/features/delve/hub/codex/ReactionsGrid.tsx packages/client/src/features/delve/hub/codex/__tests__/ReactionsGrid.test.tsx
git commit -m "feat(client): the reactions grid in the kit: element glyphs, focusable cards, a hover callback" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: `CodexTab`

The sections, the grid and the detail: the legendaries (`CodexPanel`'s cards, in the kit), the reactions (`ReactionsGrid`) and the records (the hub's interim `Records`, moved here as decided item 17 says).

**Files:**
- Create: `packages/client/src/features/delve/hub/codex/CodexTab.tsx`
- Create: `packages/client/src/features/delve/hub/codex/__tests__/CodexTab.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/codex/__tests__/CodexTab.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CodexTab } from '../CodexTab';
import { getDelveRegistry } from '../../../registry';
import { SLOT_LABEL } from '../../../format';
import { useDelveStore } from '@/stores/delveStore';
import type { HubTabProps } from '../../types';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const props = (over: Partial<HubTabProps> = {}): HubTabProps => ({
  mode: 'anvil',
  setPrompts: vi.fn(),
  setFooterAction: vi.fn(),
  go: vi.fn(),
  ...over,
});

describe('CodexTab', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('opens on the legendaries: found ones by name, the rest as ???, with the count on their section', () => {
    const [first, second] = registry.getDelveData().legendaries;
    store().setProfile({
      ...store().profile,
      codex: { [second.id]: { count: 2, bestRoll: 0.5 } },
    });
    const p = props();
    render(<CodexTab {...p} />);
    expect(p.setPrompts).toHaveBeenCalledWith([expect.objectContaining({ label: 'Select' })]);
    expect(screen.getByTestId('codex-section-legendaries')).toHaveTextContent('Legendaries 1/12');
    expect(screen.getByTestId('codex-section-legendaries')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getAllByTestId('codex-unknown')).toHaveLength(11);
    expect(screen.getByTestId('codex-found')).toHaveTextContent(`${second.name}Found ×2`);
    // The detail shows the first entry until one is hovered or focused.
    const detail = screen.getByTestId('codex-detail');
    expect(detail).toHaveTextContent('???');
    expect(detail).toHaveTextContent(
      `Drops on: ${first.slots.map((s) => SLOT_LABEL[s]).join(', ')}`,
    );
    fireEvent.focus(screen.getByTestId('codex-found'));
    expect(detail).toHaveTextContent(second.name);
    expect(detail).toHaveTextContent(second.text.replace('{v}', `${second.min}–${second.max}`));
  });

  it('the reactions: every one, by its elements and name once discovered; hovering one details it', () => {
    store().setProfile({ ...store().profile, reactionsSeen: ['melt'] });
    render(<CodexTab {...props()} />);
    fireEvent.click(screen.getByTestId('codex-section-reactions'));
    expect(screen.getByTestId('codex-section-reactions')).toHaveTextContent('Reactions 1/15');
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(14);
    const melt = screen.getByTestId('reaction-melt');
    expect(melt.querySelectorAll('[data-glyph]')).toHaveLength(2);
    fireEvent.mouseEnter(melt);
    expect(melt).toHaveAttribute('aria-pressed', 'true');
    const def = registry.getArpgData().reactions.find((r) => r.id === 'melt')!;
    const detail = screen.getByTestId('codex-detail');
    expect(detail).toHaveTextContent(def.name);
    expect(detail).toHaveTextContent(def.text);
  });

  it('the records: the lifetime stats, and the items found by rarity', () => {
    const p = store().profile;
    store().setProfile({
      ...p,
      bestDepth: 7,
      stats: {
        ...p.stats,
        dives: 4,
        kills: 1234,
        bossKills: 2,
        itemsFound: { ...p.stats.itemsFound, rare: 5 },
      },
    });
    render(<CodexTab {...props({ link: { tab: 'codex', section: 'records' } })} />);
    const records = screen.getByTestId('codex-records');
    expect(records).toHaveTextContent('4Dives');
    expect(records).toHaveTextContent('7Deepest');
    expect(records).toHaveTextContent('1.2kKills');
    expect(records).toHaveTextContent('2Bosses');
    expect(
      within(screen.getByTestId('codex-detail')).getByText('Rare').parentElement,
    ).toHaveTextContent('Rare5');
  });

  it('a link opens its section', () => {
    const { rerender } = render(<CodexTab {...props()} />);
    expect(screen.getAllByTestId('codex-unknown')).toHaveLength(12);
    rerender(<CodexTab {...props({ link: { tab: 'codex', section: 'reactions' } })} />);
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(15);
    expect(screen.queryByTestId('codex-unknown')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/codex/__tests__/CodexTab.test.tsx)`
Expected: FAIL: `Failed to resolve import "../CodexTab"` (1 file failed, no tests).

- [ ] **Step 3: The tab**

Create `packages/client/src/features/delve/hub/codex/CodexTab.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { LegendaryDef, ManaType, Rarity } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Bar, Glyph, Panel, Tabs, type Prompt } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemIcon } from '../../ItemIcon';
import {
  RARITY_COLOR,
  RARITY_LABEL,
  RARITY_TEXT,
  SLOT_LABEL,
  formatNumber,
  manaStyle,
} from '../../format';
import type { HubLink, HubTabProps } from '../types';
import { ReactionsGrid } from './ReactionsGrid';

type Section = 'legendaries' | 'reactions' | 'records';

const PROMPTS: Prompt[] = [
  { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
];

/** The icon a legendary is drawn with: a base of its first slot. */
const SLOT_BASE: Record<string, string> = {
  weapon: 'sword',
  helm: 'helm',
  chest: 'cuirass',
  gloves: 'gauntlets',
  boots: 'greaves',
  amulet: 'amulet',
  ring: 'ring',
};

const FOUND: Rarity[] = ['uncommon', 'magic', 'rare', 'epic', 'legendary'];

/**
 * The Codex tab: the sections (Legendaries n/12, Reactions n/15, Records), the
 * section's cards, and the card hovered or focused in detail (the section's
 * first until one is). `{ tab: 'codex', section }` links open a section.
 */
export function CodexTab({ setPrompts, link }: HubTabProps) {
  const registry = getDelveRegistry();
  const codex = useDelveStore((s) => s.profile.codex);
  const seenReactions = useDelveStore((s) => s.profile.reactionsSeen);
  const stats = useDelveStore((s) => s.profile.stats);
  const bestDepth = useDelveStore((s) => s.profile.bestDepth);
  const linked = (l?: HubLink) => (l?.tab === 'codex' ? l.section : undefined);
  const [section, setSection] = useState<Section>(linked(link) ?? 'legendaries');
  const [active, setActive] = useState<string | null>(null);
  const [seen, setSeen] = useState(link);
  if (link !== seen) {
    setSeen(link);
    const to = linked(link);
    if (to) {
      setSection(to);
      setActive(null);
    }
  }

  useEffect(() => setPrompts(PROMPTS), [setPrompts]);

  const legendaries = registry.getDelveData().legendaries;
  const reactions = registry.getArpgData().reactions;
  const found = legendaries.filter((l) => codex[l.id]).length;
  const progress = {
    legendaries: [found, legendaries.length],
    reactions: [seenReactions.length, reactions.length],
  } as const;
  const legendary = legendaries.find((l) => l.id === active) ?? legendaries[0];
  const reaction = reactions.find((r) => r.id === active) ?? reactions[0];

  return (
    <div
      className="grid h-full min-h-0 gap-6 px-8 py-6"
      style={{ gridTemplateColumns: '340px minmax(0, 1fr) 470px' }}
      data-testid="codex-panel"
    >
      <Panel title="Codex" testId="codex-sections">
        <div className="[&_.k-tabs]:flex-col [&_.k-tabs]:items-start [&_.k-tabs]:gap-2">
          <Tabs
            aria-label="Codex"
            level="sub"
            size="md"
            value={section}
            onChange={(s) => {
              setSection(s);
              setActive(null);
            }}
            tabs={[
              {
                id: 'legendaries',
                label: 'Legendaries',
                badge: `${found}/${legendaries.length}`,
                testId: 'codex-section-legendaries',
              },
              {
                id: 'reactions',
                label: 'Reactions',
                badge: `${seenReactions.length}/${reactions.length}`,
                testId: 'codex-section-reactions',
              },
              { id: 'records', label: 'Records', testId: 'codex-section-records' },
            ]}
          />
        </div>
        {section !== 'records' && (
          <Bar kind="progress" value={progress[section][0]} max={progress[section][1]} />
        )}
      </Panel>

      <Panel aria-label="Entries" testId="codex-grid">
        {section === 'legendaries' && (
          <section className="flex flex-col gap-4" aria-label="Legendaries">
            <div className="flex items-baseline justify-between">
              <span className="k-section">Legendaries</span>
              <span className="k-caption">
                {found}/{legendaries.length} found
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {legendaries.map((l) => {
                const entry = codex[l.id];
                return (
                  <button
                    key={l.id}
                    type="button"
                    className="k-socket flex items-center gap-3 p-3 text-left"
                    style={{
                      borderColor:
                        active === l.id
                          ? 'var(--k-hot)'
                          : entry
                            ? RARITY_COLOR.legendary
                            : undefined,
                    }}
                    aria-pressed={active === l.id}
                    onMouseEnter={() => setActive(l.id)}
                    onFocus={() => setActive(l.id)}
                    data-testid={entry ? 'codex-found' : 'codex-unknown'}
                  >
                    <span className="h-10 w-10 flex-none">
                      <ItemIcon baseId={SLOT_BASE[l.slots[0]]} rarity="legendary" ghost={!entry} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span
                        className="k-disp truncate text-[20px]"
                        style={{ color: entry ? RARITY_TEXT.legendary : 'var(--k-text-3)' }}
                      >
                        {entry ? l.name : '???'}
                      </span>
                      <span className="k-caption">
                        {entry ? `Found ×${entry.count}` : dropsOn(l)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {section === 'reactions' && (
          <ReactionsGrid reactionsSeen={seenReactions} active={active} onActive={setActive} />
        )}
        {section === 'records' && (
          <section className="grid grid-cols-3 gap-3" data-testid="codex-records">
            {(
              [
                [stats.dives, 'Dives'],
                [bestDepth, 'Deepest'],
                [stats.extracts, 'Extracts'],
                [formatNumber(stats.kills), 'Kills'],
                [stats.bossKills, 'Bosses'],
                [stats.deaths, 'Deaths'],
                [formatNumber(stats.scrapEarned), 'Scrap earned'],
              ] as const
            ).map(([n, label]) => (
              <div key={label} className="k-well flex flex-col gap-1 p-3">
                <span className="k-disp text-[32px] text-[var(--k-text)]">{n}</span>
                <span className="k-label">{label}</span>
              </div>
            ))}
          </section>
        )}
      </Panel>

      <Panel aria-label="Detail" testId="codex-detail">
        {section === 'legendaries' && (
          <LegendaryDetail def={legendary} count={codex[legendary.id]?.count} />
        )}
        {section === 'reactions' && (
          <ReactionDetail
            name={reaction.name}
            text={reaction.text}
            elements={reaction.elements}
            seen={seenReactions.includes(reaction.id)}
          />
        )}
        {section === 'records' && (
          <div className="flex flex-col gap-3">
            <span className="k-section">Items found</span>
            {FOUND.map((r) => (
              <div key={r} className="flex justify-between text-[18px]">
                <span style={{ color: RARITY_TEXT[r] }}>{RARITY_LABEL[r]}</span>
                <span className="text-[var(--k-text)]">{stats.itemsFound[r]}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function dropsOn(l: LegendaryDef): string {
  return `Drops on: ${l.slots.map((s) => SLOT_LABEL[s]).join(', ')}`;
}

function LegendaryDetail({ def, count }: { def: LegendaryDef; count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="h-24 w-24">
        <ItemIcon baseId={SLOT_BASE[def.slots[0]]} rarity="legendary" ghost={!count} />
      </span>
      <span
        className="k-heading"
        style={{ color: count ? RARITY_TEXT.legendary : 'var(--k-text-3)' }}
      >
        {count ? def.name : '???'}
      </span>
      {count && <p className="text-[18px]">{def.text.replace('{v}', `${def.min}–${def.max}`)}</p>}
      <p className="k-caption">{count ? `Found ×${count} · ${dropsOn(def)}` : dropsOn(def)}</p>
    </div>
  );
}

function ReactionDetail({
  name,
  text,
  elements,
  seen,
}: {
  name: string;
  text: string;
  elements: [ManaType, ManaType];
  seen: boolean;
}) {
  const registry = getDelveRegistry();
  if (!seen)
    return (
      <div className="flex flex-col gap-4">
        <span className="k-heading text-[var(--k-text-3)]">???</span>
        <p className="k-body-2">
          Stack one element on a foe, then hit it with another, to discover.
        </p>
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      <span className="flex items-center gap-3 text-[18px]">
        {elements.map((m) => {
          const st = manaStyle(registry, m);
          return (
            <span key={m} className="flex items-center gap-1">
              <Glyph id={m} size={24} color={st.color} /> {st.name}
            </span>
          );
        })}
      </span>
      <span className="k-heading">{name}</span>
      <p className="text-[18px]">{text}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/codex)`
Expected: PASS (6 tests in 2 files).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1015 tests pass in 128 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2c
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/codex/CodexTab.tsx src/features/delve/hub/codex/__tests__/CodexTab.test.tsx)
git add packages/client/src/features/delve/hub/codex/CodexTab.tsx packages/client/src/features/delve/hub/codex/__tests__/CodexTab.test.tsx
git commit -m "feat(client): the Codex tab: sections, legendaries, reactions, records and a detail pane" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: At integration

### Task 7: Delete the old Forge, Codex and pouch panels

**Runs on `ui/p2` in `C:/Projects/alloy-ui-p2`, after 2C merged and after the integrator's `AnvilHub` wiring (cross-area need 1), which leaves nothing importing `ForgePanel` or `CodexPanel` but the item sheet's test file.** Their behaviour and assertions moved in Tasks 1, 3 and 4: `RunePouchPanel.test.tsx` → `RunePane.test.tsx`; "the Forge's Fuse asks first" → `Fuse.test.tsx`; "mid-dive the Forge tab waits" and "the Forge tab holds the pouch" → `ForgeTab.test.tsx`.

**Files:**
- Delete: `packages/client/src/features/delve/ForgePanel.tsx`
- Delete: `packages/client/src/features/delve/CodexPanel.tsx`
- Delete: `packages/client/src/features/delve/runes/RunePouchPanel.tsx`
- Delete: `packages/client/src/features/delve/runes/__tests__/RunePouchPanel.test.tsx`
- Modify: `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx` (hand-edited, never formatted)

- [ ] **Step 1: Nothing else imports them**

Run: `grep -rln "ForgePanel\|CodexPanel\|RunePouchPanel" packages/client/src packages/client/e2e`
Expected: exactly `packages/client/src/features/delve/ForgePanel.tsx`, `CodexPanel.tsx`, `runes/RunePouchPanel.tsx`, `runes/__tests__/RunePouchPanel.test.tsx` and `__tests__/ItemDetailSheet.test.tsx` (in any order). If `hub/AnvilHub.tsx` is listed, the wiring hasn't landed: stop.

- [ ] **Step 2: Delete the panels**

```bash
cd /c/Projects/alloy-ui-p2
git rm -q packages/client/src/features/delve/ForgePanel.tsx packages/client/src/features/delve/CodexPanel.tsx packages/client/src/features/delve/runes/RunePouchPanel.tsx packages/client/src/features/delve/runes/__tests__/RunePouchPanel.test.tsx
(cd packages/client && npx tsc --noEmit -p .)
```

Expected: one error, `src/features/delve/__tests__/ItemDetailSheet.test.tsx(…): error TS2307: Cannot find module '../ForgePanel' or its corresponding type declarations.`

- [ ] **Step 3: The item sheet's test file drops the moved Forge tests**

In `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx`:

Delete the lines from `import { ForgePanel } from '../ForgePanel';` up to (not including) `import { getDelveRegistry } from '../registry';`.

Replace:

```tsx
  });

  it('mid-dive the Forge tab waits for the dive to end', () => {
    store().startDive(1);
    render(<ForgePanel onSelect={() => {}} />);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('forge and salvage between dives');
    expect(screen.queryByTestId('fuse-button')).toBeNull();
  });
});
```

with:

```tsx
  });
});
```

Replace: `describe('ItemDetailSheet and the Forge: runes', () => {` with: `describe('ItemDetailSheet: runes', () => {`

Replace the lines from `    expect(store().profile.runes).toEqual({ split: [0, 0, 1, 0, 0] });` to the end of the file with:

```tsx
    expect(store().profile.runes).toEqual({ split: [0, 0, 1, 0, 0] });
  });
});
```

(That removes "the Forge's Fuse asks first…" and "the Forge tab holds the pouch…", the file's last two tests.)

- [ ] **Step 4: The typecheck and the suite**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; every test passes, 8 fewer tests and 1 fewer file than before Step 2 (5 `RunePouchPanel` tests, 3 `ForgePanel` tests). On the scratch copy (2C's tasks plus a stand-in for the wiring and need 2): 1007 tests in 127 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p2
git add packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx
git commit -m "refactor(client): retire ForgePanel, CodexPanel and RunePouchPanel for the Forge and Codex tabs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

- **After Task 6** (in `C:/Projects/alloy-ui-2c`): `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)` is clean, 1015 tests in 128 files at a `2d6273a` base; `(cd packages/client && npx prettier --check --end-of-line auto src/features/delve/hub/forge src/features/delve/hub/codex)` passes. No engine change, so no engine suite (the junction's bundle is built once).
- **After Task 7** (on the integrated `ui/p2`): the same typecheck and suite, then the Delve E2E with the integrator's updates (cross-area need 3): D04's Forge and Codex lines, R04 and R05 on the rune pane, G03.
- **By hand** (the phase gate's manual pass), at 1280×720 and 1920×1080, mouse and pad: the Forge's three panes fit without the screen scrolling (the gear list and the bench scroll inside); LT / RT step Temper / Fuse and the Codex sections; "Reforge…" puts the focus in the pick, and B / Esc backs out to the bench, not to the system menu; a hovered or focused Codex card fills the detail.
