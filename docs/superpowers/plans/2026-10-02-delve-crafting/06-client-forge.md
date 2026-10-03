# Delve component crafting (stage 4c) · C2: the Forge tab — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Anvil's Forge tab as the crafting spec's client section draws it: two benches on a `level="sub"` tab, **Forge | Temper**, each in three panes. The Forge bench: the pattern list (learned; unknown greyed with where they come from; marks for the chosen essence), the forge (metal and flux pickers with counts, an essence on epic flux, the element with the off-pair Mana Dust, a shard slot per line with a picker filtered to the slot, the engine's live `previewForge`, **Forge** on Enter or A) and the Materials pane. The Temper bench: today's gear list, Upgrade, Reforge, **Hone**, **Imprint** and Re-attune on the picked item, and the Materials pane. The Materials pane: bars, flux, shards (by family, each affix by tier), essences and runes, each with Refine 3 → 1, and the shard bench (buy tier I). A forged legendary plays the `LegendaryFanfare`.

**Architecture:** Everything lives in `features/delve/hub/forge/`. `ForgeTab` holds the bench and the picked item and lays out the grid; `ForgeBench` renders two cells (`PatternList` and the forge) and keeps the forge request in its own state; the Temper bench is `GearList` and `Temper`; `MaterialsPane` (with `RunePane` as one of its wells) sits in the third cell for both. `ShardPicker` is shared by the forge's line slots and Temper's Imprint. `materials-text.ts` names materials and ranges. The client computes no price, roll or yield: it renders `previewForge`, `refineCost`, `honeCost`, `imprintCost`, `reforgeCost`, `upgradeCost`, `reattuneCost`, `shardTiersOf` and `delve.crafting.shardBench`/`offPairDust`, and acts through the store's `forge`, `hone`, `imprint`, `refine`, `buyShard` (Phase A). Phase A's stubs throw until B2: this area's tests mock the nine stubbed exports with `vi.mock('@alloy/engine', …)` and install stand-ins from `__tests__/crafting-fakes.ts`.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, Vitest 3 (jsdom, Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-02-delve-component-crafting-design.md`: "Forging an item (the Forge bench)", "The 'just right' sinks (the Temper bench)", "The client" → Forge tab, "Pause", "Phases and parallel areas" (the C2 row: `hub/forge/*`). Phase A: `01-contract.md` (the types in `types/crafting.ts`, the stubs, the store's actions, `HubLink`'s `bench`). The overview is `00-overview.md` in this folder.

---

## Base

- **Starts from:** `craft/main` at `a53a85f` (Phase A merged: v0.57.1 + the contract), in this area's worktree `C:/Projects/alloy-craft-c2` on branch `craft/c2`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-craft-c2 -Branch craft/c2 -Base craft/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-craft-c2` in Git Bash.
- **Anchors:** every edit was generated from, and checked against, `craft/main` at `a53a85f` (see "Checked on a scratch copy").
- **Before Task 1:** build the engine once for the client's junction, and measure the client:

```bash
cd /c/Projects/alloy-craft-c2
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; **1169 tests in 146 files** pass (call them **M** tests in **G** files).
- **Merge order:** C2 merges **after B2** (see X1): until B2 fills `refineCost` and `previewForge`, the Forge tab throws in the app on any save that holds a bar.

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/hub/forge/materials-text.ts` (new) | `pct`, `affixLabel` ("Damage %" where a flat affix shares the label), `shardName` ("Crit Chance II"), `materialLabel` ("Iron bar", "Rare flux", "Prism essence"), `valueRange`, `statRange` |
| `packages/client/src/features/delve/hub/forge/MaterialsPane.tsx` (new) | the Materials pane: bars, flux, shards by family and tier, essences, the runes (`RunePane`), Refine 3 → 1 at `refineCost`'s price, the shard bench (`buyShard`); locked mid-dive |
| `packages/client/src/features/delve/hub/forge/RunePane.tsx` | a well inside the Materials pane (its rows, Fuse and test ids unchanged) |
| `packages/client/src/features/delve/hub/forge/ShardPicker.tsx` (new) | the held shards a slot takes (each affix the slot allows, minus the excluded, by tier, with count and roll band) |
| `packages/client/src/features/delve/hub/forge/Temper.tsx` | **Overwritten:** the line ops Reforge, **Hone** (`honeCost`, the hones so far) and **Imprint** (`imprintCost`, a shard from `ShardPicker`), each picking a line in its own pad scope; Upgrade and Re-attune as before |
| `packages/client/src/features/delve/hub/forge/PatternList.tsx` (new) | the learned patterns (a row picks one; marks for the chosen essence's slots), then the unknown ones greyed with their sources |
| `packages/client/src/features/delve/hub/forge/ForgeBench.tsx` (new) | `ForgeBench` (the pattern list and the forge: pickers, line slots, the preview, Forge on Enter / A, the fanfare), `ForgeLocked`, `SELECT_PROMPT` |
| `packages/client/src/features/delve/hub/forge/ForgeTab.tsx` | **Overwritten:** the Forge \| Temper sub tab, the links' bench and item, the three-pane grid with the Materials pane, the prompts |
| `packages/client/src/features/delve/hub/forge/__tests__/crafting-fakes.ts` (new) | stand-ins for the nine stubbed crafting exports (`fakeCrafting()`), the tests' numbers (`FAKE`) |
| `packages/client/src/features/delve/hub/forge/__tests__/MaterialsPane.test.tsx` (new) | the kinds, families and tiers; refine at the price, its refusals and the lock; the shard bench |
| `packages/client/src/features/delve/hub/forge/__tests__/Temper.test.tsx` | the fakes; Hone; Imprint's shard filter |
| `packages/client/src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx` (new) | the pattern list; the preview; flux, lines and the shard picker; trimming; the element's Dust and the refusal; Forge and Enter; a legendary and the fanfare; the lock |
| `packages/client/src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx` | the fakes; the benches, the links' bench, the prompts, the lock on both benches |

`GearList.tsx` and `RunePane.test.tsx` are unchanged.

## Cross-area needs

**X1 · The integrator: merge C2 after B2.** The Forge tab renders engine values only, so it calls `refineCost` for every material held (a new save holds 5 Rusty bars) and `previewForge` once a pattern is picked. Phase A's stubs throw, so on `craft/c2` alone:
- the app's Forge tab throws `refineCost: not implemented` when it opens;
- two tests outside this area fail the same way: `src/features/delve/hub/__tests__/AnvilHub.test.tsx` → "shows each tab: Loadout with the how-to, Skills, Forge, Codex and the Quests empty state" and "on Skills the Apply bar replaces the footer's group, with one Delve button" (both open the Forge tab). They need no edit: they pass once B2's `refineCost` is in.

**X2 · The E2E owner (`packages/client/e2e/delve.spec.ts`, D04).** The Forge tab now opens on the Forge bench, so the gear rows are one click away. In D04, replace:

```ts
    await expect(page.getByTestId('forge-panel')).toBeVisible();
    await expect(page.getByTestId('temper-row')).toHaveCount(2);
```

with:

```ts
    await expect(page.getByTestId('forge-panel')).toBeVisible();
    await expect(page.getByTestId('pattern-list')).toBeVisible();
    await page.getByTestId('bench-temper').click();
    await expect(page.getByTestId('temper-row')).toHaveCount(2);
```

`e2e/delve-runes.spec.ts` R04 and R05 need nothing: the runes keep `rune-pouch`, `rune-fuse-*` and `pouch-*` inside the Materials pane, which both benches show. All three run only after B2 (X1).

**X3 · The E2E owner: the spec's "forging an item at the Anvil"** (after B2; written against this plan's test ids, not run here). Add to `e2e/delve.spec.ts`, after D09:

```ts
  test('D10: forging an item at the Anvil from the starting bars and flux', async ({ page }) => {
    // A new save knows the cuirass and holds 5 Rusty bars and an uncommon flux (the spec's S8).
    await seedProfile(page, 4242, false, undefined, { scrap: 500 });
    await page.goto('/delve');
    await page.getByTestId('tab-forge').click();
    await expect(page.getByTestId('bench-forge')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('pattern-cuirass').click();
    await page.getByTestId('flux-uncommon').click();
    await expect(page.getByTestId('forge-title')).toHaveText('Uncommon Cuirass');
    await expect(page.getByTestId('forge-refused')).toHaveCount(0);
    await page.getByTestId('forge-button').click();
    await expect(page.getByTestId('forge-bench').getByRole('status')).toContainText('Forged');
    await expect(page.getByTestId('material-metal-rusty')).toContainText('Rusty bar ×4');
    await page.getByTestId('tab-loadout').click();
    await expect(page.getByTestId('tab-loadout')).toContainText('NEW 1');
  });
```

**X4 · B2 (no edit: the contract as this area reads it).**
1. `previewForge` never throws: every refusal comes in `refused` (a metal or flux not held included), and `lines.length` is the rarity's `loot.affixCount` whatever the shards (the bench trims its shards to a lower flux by asking it with none).
2. `ForgePreview.weapon.slots` is each carried skill's **extra** slots (S7); the bench reads it "extra slots: Primary +1".
3. The profile op `forge` returns the forged `item` and records it (`recordFinds`, as the spec says), so the fanfare's "New codex entry!" reads `res.profile.codex[id].count === 1`.
4. `refineCost` returns null for essences, Mana Dust, Links, the top metal and flux, and a shard at its affix's last tier; the pane shows Refine only where it gives a price and enough are held.
5. `honeCost` and `imprintCost` take any item with lines.

**X5 · C1 (no edit).** `materials-text.ts`' `materialLabel` names a material the way the spec's Found log does ("Iron bar"); if C1 names them too, the integrator may point one at the other.

## Where the spec left room

1. **The bench a tab opens on.** The Forge bench, unless the link names a bench, or names an item (the Loadout's "Forge it ›"), which opens Temper on it.
2. **Enter / A.** Enter is the Forge bench's prompt (keys only); the pad's A presses the focused control and is never a prompt's (`usePrompts`), so A forges on the focused Forge button, whose glyph shows Enter or A by device, and under the pad the prompt bar shows Select alone. The Enter prompt stays on while the forge refuses (it says why) so a refused Enter never falls through to the footer's Delve; while the shard picker's pad scope is open, the hub's prompts sleep.
3. **No pattern is preselected:** the forge shows "Pick a pattern to forge" and calls nothing until a pick. The metal starts at the lowest one held, the element at the primary, no flux, no shards.
4. **The fanfare needs no store signal.** `ForgeBench` portals the `LegendaryFanfare` into `document.body` (the hub's screen is zoomed; the fanfare carries its own `delve-zoom`), with `firstTime` from the forge result's Codex count (X4.3).
5. **The runes' row in the Materials pane** is today's `RunePane` as a well: its Fuse keeps its label ("Fuse 3 → 1") and every test id, so the rune E2E keep working.
6. **Refine** shows where `refineCost` gives a price and at least its count is held (as the runes' Fuse does), at the top grade not at all.
7. **The shard bench** buys the affix picked from its chips (no buy on one click). Two affixes share "Damage" and two "Max Life": the percent ones read "Damage %" and "Max Life %" in the shard names and chips.
8. **Lines and shards.** The chosen shards fill the first lines in order; a slot set back to "Random line" drops its shard and the later ones move up. A new pattern clears the shards (its slot may take others); a lower flux keeps the first shards its lines hold.
9. **Imprint** offers only shards whose affix the item doesn't carry, the replaced line's included ("refused for an affix already on the item").
10. **Unknown patterns' sources** read "Unknown · salvage a Bow, or find its pattern on elites and bosses" (salvage and elite or boss drops teach a pattern).
11. **Locked mid-dive:** both benches show today's note, and every Refine, Buy and Fuse is off; the hub keeps the tab disabled in the pause (Phase A).

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `craft/c2`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-craft-c2`.
- **Line endings:** the worktree checks the Forge files out CRLF; the Edit tool keeps them. "Overwrite" and "Create" are a Write (LF; git stores both as LF). Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** every file the commit blocks format passed `prettier --check --end-of-line auto` at the base or is new, and the code below is already formatted, so `--write` changes nothing typed as written.
- **How the edits read** (the 4a plan's language): "Replace: A with: B" is one Edit (old A, new B). "Create `f`:" and "Overwrite `f`:" are a Write. Every anchor is unique in its file at that point; apply each file's edits top to bottom.
- **The engine stubs.** Each test file here mocks the nine exports Phase A stubs and B2 fills (`previewForge`, `forge`, `refineCost`, `refine`, `buyShard`, `honeCost`, `hone`, `imprintCost`, `imprint`), keeping every other export real, and calls `fakeCrafting()` before each test. The store's actions call the mocked ops, so a test drives the real store. The fakes stay after B2: these are UI tests, and B2's own tests cover the ops.
- **Checked on a scratch copy:** `git archive` of `a53a85f` with junctioned `node_modules`, the engine built once; this plan's edits applied task by task by a script that checks each anchor once in its file, giving the tested files byte for byte; every FAIL and PASS below was run, with the typecheck and the client build after each task.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Engine bundle (once) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(pnpm -F @alloy/client build)` |

---

## Chunk 1: The Materials pane

### Task 1: The Materials pane, with Refine and the shard bench

The pane the Forge tab will put beside both benches (Task 4 wires it): every material held with Refine 3 → 1 at the engine's price, the runes as one of its wells, and the shard bench. Also the stand-ins the Forge tests run on until B2.

**Files:**
- Create: `packages/client/src/features/delve/hub/forge/materials-text.ts`, `hub/forge/MaterialsPane.tsx`, `hub/forge/__tests__/crafting-fakes.ts`, `hub/forge/__tests__/MaterialsPane.test.tsx`
- Modify: `packages/client/src/features/delve/hub/forge/RunePane.tsx`

- [ ] **Step 1: The stand-ins and the failing test**

Create `packages/client/src/features/delve/hub/forge/__tests__/crafting-fakes.ts`:

```ts
import { vi } from 'vitest';
import {
  addMaterial,
  addMaterials,
  buyShard,
  emptyHaul,
  forge,
  generateItem,
  hone,
  honeCost,
  imprint,
  imprintCost,
  pairElements,
  previewForge,
  refine,
  refineCost,
  SeededRNG,
  shardTiersOf,
  type DataRegistry,
  type DelveProfile,
  type ForgePreview,
  type ForgeRequest,
  type MaterialRef,
  type ProfileActionResult,
  type Rarity,
} from '@alloy/engine';

/**
 * Stand-ins for the crafting ops stage 4c's B2 fills (`loot/forge.ts`,
 * `loot/materials.ts`' refineCost, `delve/crafting.ts`), for the Forge tab's
 * tests: a test file mocks those nine exports with `vi.fn()` (its `vi.mock`
 * of `@alloy/engine`) and calls `fakeCrafting()` before each test. Their
 * numbers are the tests' own.
 */

/** The scrap every fake forge and refine costs; a hone's base and an imprint's. */
export const FAKE = { forge: 30, refine: 10, hone: 15, imprint: 25, floor: 0.12 };

function rarityOf(req: ForgeRequest): Rarity {
  return req.flux === 'epic' && req.essence ? 'legendary' : (req.flux ?? 'common');
}

/** A preview from the request: the rarity's lines (the shards first), a 12% floor in the pair. */
export function fakePreview(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
): ForgePreview {
  const base = registry.getGearBase(req.baseId);
  const rarity = rarityOf(req);
  const { affixCount, minRoll } = registry.getDelveBalance().loot;
  const count = affixCount[rarity];
  const inPair = pairElements(profile.pair).includes(req.element);
  return {
    baseId: base.id,
    slot: base.slot,
    rarity,
    ilvl: 3,
    element: req.element,
    floor: inPair ? FAKE.floor : 0,
    implicits: [{ stat: 'armor', min: 3, max: 5 }],
    lines: Array.from({ length: count }, (_, i) => {
      const shard = req.shards[i] ?? null;
      if (!shard) return { shard: null, band: [minRoll[rarity], 1], range: null };
      const t = shardTiersOf(registry, shard.stat)[shard.tier - 1];
      return { shard, band: [t.min, t.max], range: [2, 4] };
    }),
    legendary: req.essence && rarity === 'legendary' ? { id: req.essence, band: [0.4, 1] } : null,
    price: {
      scrap: FAKE.forge,
      dust: inPair ? 0 : registry.getDelveBalance().crafting.offPairDust,
    },
    weapon:
      base.slot === 'weapon'
        ? { carries: ['basic', 'primary'], slots: { primary: 1 }, sockets: 1 }
        : null,
    refused:
      profile.materials.metals[req.metal] < 1
        ? { code: 'materials', reason: 'You have no such bar' }
        : null,
  };
}

/** The forged item into the bag, its legendary in the Codex. */
export function fakeForge(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
): ProfileActionResult {
  const rarity = rarityOf(req);
  const base = registry.getGearBase(req.baseId);
  const rolled = generateItem(
    registry,
    { uid: 'f1', ilvl: 3, rarity, slot: base.slot, mana: req.element, baseId: base.id },
    new SeededRNG(7),
  );
  const item = req.essence
    ? { ...rolled, legendary: { id: req.essence, value: 20, roll: 0.5 } }
    : rolled;
  const codex = req.essence
    ? {
        ...profile.codex,
        [req.essence]: { count: (profile.codex[req.essence]?.count ?? 0) + 1, bestRoll: 0.5 },
      }
    : profile.codex;
  return { ok: true, item, profile: { ...profile, bag: [...profile.bag, item], codex } };
}

/** 3 → 1 for 10 scrap, but at the top (Voidforged, epic flux, a shard's last tier) and for essences. */
export function fakeRefineCost(
  registry: DataRegistry,
  what: MaterialRef,
): { count: number; scrap: number } | null {
  const top =
    (what.kind === 'metal' && what.metal === 'voidforged') ||
    (what.kind === 'flux' && what.grade === 'epic') ||
    (what.kind === 'shard' && what.tier >= shardTiersOf(registry, what.stat).length) ||
    what.kind === 'essence' ||
    what.kind === 'dust' ||
    what.kind === 'links';
  return top ? null : { count: 3, scrap: FAKE.refine };
}

/** Install the fakes on the mocked engine exports. */
export function fakeCrafting(): void {
  vi.mocked(previewForge).mockImplementation(fakePreview);
  vi.mocked(forge).mockImplementation(fakeForge);
  vi.mocked(refineCost).mockImplementation(fakeRefineCost);
  vi.mocked(refine).mockImplementation((_r, profile) => ({
    ok: true,
    profile: { ...profile, scrap: profile.scrap - FAKE.refine },
  }));
  vi.mocked(buyShard).mockImplementation((_r, profile, stat) => ({
    ok: true,
    profile: {
      ...profile,
      materials: addMaterials(
        profile.materials,
        addMaterial(emptyHaul(), { kind: 'shard', stat, tier: 1 }),
      ),
    },
  }));
  vi.mocked(honeCost).mockImplementation((_r, item) => FAKE.hone * (item.hones + 1));
  vi.mocked(hone).mockImplementation((_r, profile) => ({ ok: true, profile }));
  vi.mocked(imprintCost).mockImplementation(() => FAKE.imprint);
  vi.mocked(imprint).mockImplementation((_r, profile) => ({ ok: true, profile }));
}
```

Create `packages/client/src/features/delve/hub/forge/__tests__/MaterialsPane.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { buyShard, emptyMaterials, refine, type MaterialsPouch } from '@alloy/engine';
import { MaterialsPane } from '../MaterialsPane';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import { FAKE, fakeCrafting } from './crafting-fakes';

// Stage 4c's B2 fills the crafting ops: until then the pane runs on fakes.
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  ...Object.fromEntries(
    ['previewForge', 'forge', 'refineCost', 'refine', 'buyShard']
      .concat(['honeCost', 'hone', 'imprintCost', 'imprint'])
      .map((k) => [k, vi.fn()]),
  ),
}));

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const held = (over: Partial<MaterialsPouch>, scrap = 100, manaDust = 0) =>
  store().setProfile({
    ...store().profile,
    scrap,
    manaDust,
    materials: { ...emptyMaterials(), ...over },
  });
const pane = (locked = false) =>
  render(
    <>
      <MaterialsPane locked={locked} />
      <ToastContainer />
    </>,
  );

describe('MaterialsPane', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    vi.clearAllMocks();
    fakeCrafting();
  });

  it("lists what's held by kind, shards by family and tier, and refines 3 → 1 at the engine's price", () => {
    held({
      metals: { ...emptyMaterials().metals, rusty: 5, iron: 1, voidforged: 3 },
      flux: { ...emptyMaterials().flux, uncommon: 3, epic: 3 },
      shards: { critChance: [3, 1], armor: [0, 0, 0, 0, 3] },
      essences: { prism: 1 },
    });
    pane();
    expect(screen.getByTestId('material-metal-rusty')).toHaveTextContent('Rusty bar ×5');
    expect(screen.getByTestId('refine-metal-rusty')).toHaveTextContent(
      `Refine 3 → 1 · ${FAKE.refine} scrap`,
    );
    // Too few to refine, or the top grade: no Refine.
    expect(screen.queryByTestId('refine-metal-iron')).toBeNull();
    expect(screen.queryByTestId('refine-metal-voidforged')).toBeNull();
    expect(screen.queryByTestId('refine-flux-epic')).toBeNull();
    expect(screen.getByTestId('refine-flux-uncommon')).toBeEnabled();
    const offense = screen.getByTestId('shards-offense');
    expect(offense).toHaveTextContent('Offense');
    expect(within(offense).getByTestId('material-shard-critChance-1')).toHaveTextContent(
      'Crit Chance I ×3',
    );
    expect(within(offense).getByTestId('material-shard-critChance-2')).toHaveTextContent(
      'Crit Chance II ×1',
    );
    expect(
      within(screen.getByTestId('shards-defense')).getByTestId('material-shard-armor-5'),
    ).toHaveTextContent('Armor V ×3');
    expect(screen.queryByTestId('refine-shard-armor-5')).toBeNull();
    expect(screen.getByTestId('material-essence-prism')).toHaveTextContent(
      `${registry.getLegendary('prism').name} essence ×1`,
    );
    expect(screen.queryByTestId('refine-essence-prism')).toBeNull();
    fireEvent.click(screen.getByTestId('refine-metal-rusty'));
    expect(refine).toHaveBeenCalledWith(registry, expect.anything(), {
      kind: 'metal',
      metal: 'rusty',
    });
    expect(store().profile.scrap).toBe(100 - FAKE.refine);
    expect(screen.getByText('Refined 3 × Rusty bar')).toBeInTheDocument();
  });

  it("a refine the purse can't pay is off and says what it needs; mid-dive refining and buying wait", () => {
    held({ metals: { ...emptyMaterials().metals, rusty: 3 } }, FAKE.refine - 1);
    const { unmount } = pane();
    expect(screen.getByTestId('refine-metal-rusty')).toBeDisabled();
    expect(screen.getByTestId('refine-metal-rusty')).toHaveAccessibleDescription(
      `Needs ${FAKE.refine} scrap`,
    );
    unmount();
    held({ metals: { ...emptyMaterials().metals, rusty: 3 } });
    pane(true);
    expect(screen.getByTestId('materials-locked')).toHaveTextContent(
      'refine and buy between dives',
    );
    expect(screen.getByTestId('refine-metal-rusty')).toBeDisabled();
    fireEvent.click(screen.getByTestId('bench-affix-armor'));
    expect(screen.getByTestId('bench-buy')).toBeDisabled();
  });

  it('the shard bench sells a tier I shard of the affix picked', () => {
    const price = registry.getDelveBalance().crafting.shardBench;
    held({}, price.scrap, price.dust);
    pane();
    expect(screen.getByTestId('materials-shards')).toHaveTextContent('None yet');
    expect(screen.getByTestId('bench-buy')).toHaveTextContent('Pick an affix');
    expect(screen.getByTestId('bench-buy')).toBeDisabled();
    // Two affixes share "Damage": the percent one says so.
    expect(screen.getByTestId('bench-affix-damagePct')).toHaveTextContent('Damage %');
    fireEvent.click(screen.getByTestId('bench-affix-armor'));
    expect(screen.getByTestId('bench-affix-armor')).toHaveAttribute('aria-pressed', 'true');
    const buy = screen.getByTestId('bench-buy');
    expect(buy).toHaveTextContent(`Buy Armor I · ${price.scrap} scrap · ${price.dust} Mana Dust`);
    fireEvent.click(buy);
    expect(buyShard).toHaveBeenCalledWith(registry, expect.anything(), 'armor');
    expect(screen.getByText('Bought Armor I')).toBeInTheDocument();
    expect(screen.getByTestId('material-shard-armor-1')).toHaveTextContent('Armor I ×1');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/MaterialsPane.test.tsx)`
Expected: FAIL: `Failed to resolve import "../MaterialsPane" from "src/features/delve/hub/forge/__tests__/MaterialsPane.test.tsx". Does the file exist?` (no tests run).

- [ ] **Step 3: The names, the pane and the runes' well**

Create `packages/client/src/features/delve/hub/forge/materials-text.ts`:

```ts
import type { DataRegistry, HeroStatKey, MaterialRef, RuneTier, ShardRef } from '@alloy/engine';
import { RARITY_LABEL, formatStatValue } from '../../format';
import { TIER_NUMERAL } from '../../runes/rune-style';

/** 0.4 → "40%". */
export const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** An affix's label; "Damage %" where a flat affix shares it. */
export function affixLabel(registry: DataRegistry, stat: HeroStatKey): string {
  const def = registry.getGearAffix(stat);
  if (!def) return stat;
  const shared = registry
    .getDelveData()
    .affixes.some((a) => a.stat !== stat && a.label === def.label);
  return shared && def.unit === 'pct' ? `${def.label} %` : def.label;
}

/** "Crit Chance II". */
export function shardName(registry: DataRegistry, { stat, tier }: ShardRef): string {
  return `${affixLabel(registry, stat)} ${TIER_NUMERAL[tier as RuneTier]}`;
}

/** "Iron bar", "Rare flux", "Crit Chance II", "Prism essence", "Mana Dust", "Links". */
export function materialLabel(registry: DataRegistry, ref: MaterialRef): string {
  switch (ref.kind) {
    case 'metal':
      return `${registry.getCraftingData().metals.find((m) => m.id === ref.metal)!.name} bar`;
    case 'flux':
      return `${RARITY_LABEL[ref.grade]} flux`;
    case 'shard':
      return shardName(registry, ref);
    case 'essence':
      return `${registry.getLegendary(ref.essence).name} essence`;
    case 'dust':
      return 'Mana Dust';
    case 'links':
      return 'Links';
  }
}

/** "+3 to +5", or "+4" when the ends meet. */
export function valueRange(
  registry: DataRegistry,
  stat: HeroStatKey,
  lo: number,
  hi: number,
): string {
  const [a, b] = [formatStatValue(registry, stat, lo), formatStatValue(registry, stat, hi)];
  return a === b ? a : `${a} to ${b}`;
}

/** "+3 to +5 Armor". */
export function statRange(
  registry: DataRegistry,
  stat: HeroStatKey,
  lo: number,
  hi: number,
): string {
  return `${valueRange(registry, stat, lo, hi)} ${registry.getGearAffix(stat)?.label ?? stat}`;
}
```

Create `packages/client/src/features/delve/hub/forge/MaterialsPane.tsx`:

```tsx
import { useId, useState, type ReactNode } from 'react';
import {
  AFFIX_FAMILIES,
  FLUX_GRADES,
  METAL_IDS,
  fusePrice,
  refineCost,
  shardTiersOf,
  type HeroStatKey,
  type MaterialRef,
  type RuneRef,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { Button, Chip, Panel, Price } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { runeName } from '../../runes/rune-style';
import { RunePane } from './RunePane';
import { affixLabel, materialLabel } from './materials-text';

const FAMILY_LABEL = {
  offense: 'Offense',
  defense: 'Defense',
  sustain: 'Sustain',
  utility: 'Utility',
  element: 'Element',
} as const;

/** A material's key in test ids: "metal-iron", "flux-rare", "shard-armor-2", "essence-prism". */
function keyOf(ref: MaterialRef): string {
  switch (ref.kind) {
    case 'metal':
      return `metal-${ref.metal}`;
    case 'flux':
      return `flux-${ref.grade}`;
    case 'shard':
      return `shard-${ref.stat}-${ref.tier}`;
    case 'essence':
      return `essence-${ref.essence}`;
    default:
      return ref.kind;
  }
}

/** One material held: its name and count, and Refine at the engine's price where it refines and enough are held. */
function MaterialRow({
  what,
  n,
  scrap,
  locked,
  onRefine,
}: {
  what: MaterialRef;
  n: number;
  scrap: number;
  locked: boolean;
  onRefine: (what: MaterialRef, count: number) => void;
}) {
  const registry = getDelveRegistry();
  const id = useId();
  const key = keyOf(what);
  const cost = refineCost(registry, what);
  const can = cost !== null && n >= cost.count;
  const short = can && cost.scrap > scrap;
  return (
    <div className="flex flex-col gap-1" data-testid={`material-${key}`}>
      <span className="text-[16px] text-[var(--k-text)]">
        {materialLabel(registry, what)} ×{n}
      </span>
      {can && (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            size="sm"
            disabled={locked || short}
            onClick={() => onRefine(what, cost.count)}
            aria-describedby={short && !locked ? id : undefined}
            testId={`refine-${key}`}
          >
            Refine {cost.count} → 1 · <Price scrap={cost.scrap} />
          </Button>
          {short && !locked && (
            <span id={id} className="k-caption">
              Needs <Price scrap={cost.scrap} />
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Panel material="well" title={title} testId={testId}>
      <div className="flex flex-col gap-3">{children}</div>
    </Panel>
  );
}

/**
 * The Forge tab's Materials pane, beside both benches: bars, flux, shards (by
 * family, each affix by tier), essences and runes, each with its count and
 * Refine 3 → 1 (the runes' Fuse) at the engine's price (none at the top
 * grade), then the shard bench (buy a tier I shard). Locked mid-dive.
 */
export function MaterialsPane({ locked }: { locked: boolean }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const { metals, flux, shards, essences } = profile.materials;
  const [buying, setBuying] = useState<HeroStatKey | null>(null);
  const id = useId();
  const families = registry.getCraftingData().families;
  const affixes = registry.getDelveData().affixes;
  const bench = registry.getDelveBalance().crafting.shardBench;
  const benchShort = bench.scrap > profile.scrap || bench.dust > profile.manaDust;
  const fuseCount = registry.getDelveBalance().runes.fuseCount;

  const onRefine = (what: MaterialRef, count: number) => {
    const res = useDelveStore.getState().refine(what);
    if (!res.ok) {
      playSound('combineFail');
      showToast(res.reason ?? 'Cannot refine');
      return;
    }
    playSound('combineMerge');
    vibrate('success');
    showToast(`Refined ${count} × ${materialLabel(registry, what)}`);
  };
  const onBuy = () => {
    if (!buying) return;
    const res = useDelveStore.getState().buyShard(buying);
    if (!res.ok) {
      playSound('combineFail');
      showToast(res.reason ?? 'Cannot buy');
      return;
    }
    playSound('combineMerge');
    showToast(`Bought ${materialLabel(registry, { kind: 'shard', stat: buying, tier: 1 })}`);
  };
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

  const row = (what: MaterialRef, n: number) => (
    <MaterialRow
      key={keyOf(what)}
      what={what}
      n={n}
      scrap={profile.scrap}
      locked={locked}
      onRefine={onRefine}
    />
  );
  const bars = METAL_IDS.filter((m) => metals[m] > 0);
  const grades = FLUX_GRADES.filter((g) => flux[g] > 0);
  const held = Object.entries(essences).filter(([, n]) => n > 0);

  return (
    <Panel
      title="Materials"
      testId="materials-pane"
      aside={<Price scrap={profile.scrap} dust={profile.manaDust} />}
    >
      <div className="flex flex-col gap-4">
        {locked && (
          <p className="k-body-2" data-testid="materials-locked">
            A dive is under way: refine and buy between dives.
          </p>
        )}
        <Section title="Bars" testId="materials-bars">
          {bars.length === 0 && <p className="k-caption">None yet: foes drop them.</p>}
          {bars.map((m) => row({ kind: 'metal', metal: m }, metals[m]))}
        </Section>
        <Section title="Flux" testId="materials-flux">
          {grades.length === 0 && <p className="k-caption">None yet: elites and bosses drop it.</p>}
          {grades.map((g) => row({ kind: 'flux', grade: g }, flux[g]))}
        </Section>
        <Section title="Shards" testId="materials-shards">
          {AFFIX_FAMILIES.map((family) => {
            const rows = affixes
              .filter((a) => families[a.stat] === family)
              .flatMap((a) =>
                shardTiersOf(registry, a.stat).flatMap(({ tier }) => {
                  const n = shards[a.stat]?.[tier - 1] ?? 0;
                  return n > 0 ? [row({ kind: 'shard', stat: a.stat, tier }, n)] : [];
                }),
              );
            return (
              rows.length > 0 && (
                <div key={family} className="flex flex-col gap-3" data-testid={`shards-${family}`}>
                  <span className="k-label">{FAMILY_LABEL[family]}</span>
                  {rows}
                </div>
              )
            );
          })}
          {Object.values(shards).every((ns) => !ns?.some((n) => n > 0)) && (
            <p className="k-caption">None yet: foes drop them, and salvage gives them.</p>
          )}
        </Section>
        <Section title="Essences" testId="materials-essences">
          {held.length === 0 && <p className="k-caption">None yet: bosses drop them.</p>}
          {held.map(([e, n]) => row({ kind: 'essence', essence: e }, n))}
        </Section>
        <RunePane
          pouch={profile.runes}
          fuseCount={fuseCount}
          fusePrice={(ref) => fusePrice(registry, ref)}
          scrap={profile.scrap}
          locked={locked}
          onFuse={onFuseRunes}
        />
        <Section title="Shard bench" testId="shard-bench">
          <p className="k-caption">
            Buy a tier I shard of any affix: <Price scrap={bench.scrap} dust={bench.dust} />
          </p>
          <div className="flex flex-wrap gap-2">
            {affixes.map((a) => (
              <Chip
                key={a.stat}
                pressed={buying === a.stat}
                onClick={() => setBuying(a.stat)}
                testId={`bench-affix-${a.stat}`}
              >
                {affixLabel(registry, a.stat)}
              </Chip>
            ))}
          </div>
          <Button
            variant="primary"
            disabled={locked || !buying || benchShort}
            onClick={onBuy}
            aria-describedby={benchShort && !locked ? `${id}-bench` : undefined}
            testId="bench-buy"
          >
            {buying ? (
              <>
                Buy {materialLabel(registry, { kind: 'shard', stat: buying, tier: 1 })} ·{' '}
                <Price scrap={bench.scrap} dust={bench.dust} />
              </>
            ) : (
              'Pick an affix'
            )}
          </Button>
          {benchShort && !locked && (
            <span id={`${id}-bench`} className="k-caption">
              Needs <Price scrap={bench.scrap} dust={bench.dust} />
            </span>
          )}
        </Section>
      </div>
    </Panel>
  );
}
```

In `packages/client/src/features/delve/hub/forge/RunePane.tsx`:

Replace:

```tsx
 * The Forge's rune pane: every rune held, by tier, with its count, effect and
```

with:

```tsx
 * The Materials pane's runes: every rune held, by tier, with its count, effect and
```

Replace:

```tsx
    <Panel title="Runes" testId="rune-pouch">
```

with:

```tsx
    <Panel title="Runes" material="well" testId="rune-pouch">
```

- [ ] **Step 4: Run it to see it pass, then the client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge)`
Expected: PASS, 17 tests in 4 files.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 3 tests in G + 1 files pass (**1172 tests in 147 files** at the base's counts).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c2
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/forge/materials-text.ts src/features/delve/hub/forge/MaterialsPane.tsx src/features/delve/hub/forge/RunePane.tsx src/features/delve/hub/forge/__tests__/crafting-fakes.ts src/features/delve/hub/forge/__tests__/MaterialsPane.test.tsx)
git add packages/client/src/features/delve/hub/forge/materials-text.ts packages/client/src/features/delve/hub/forge/MaterialsPane.tsx packages/client/src/features/delve/hub/forge/RunePane.tsx packages/client/src/features/delve/hub/forge/__tests__/crafting-fakes.ts packages/client/src/features/delve/hub/forge/__tests__/MaterialsPane.test.tsx
git commit -m "feat(client): the Forge tab's Materials pane: refine 3 to 1 and the shard bench" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: Temper

### Task 2: Hone and Imprint on the Temper bench

The line ops share one flow: pick a line in the op's own pad scope (Back leaves), see the engine's price, act. Hone rerolls the line within its band; Imprint lays a held shard over it, from the shards the item's slot takes and it doesn't already carry.

**Files:**
- Create: `packages/client/src/features/delve/hub/forge/ShardPicker.tsx`
- Overwrite: `packages/client/src/features/delve/hub/forge/Temper.tsx`
- Modify (tests): `packages/client/src/features/delve/hub/forge/__tests__/Temper.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/hub/forge/__tests__/Temper.test.tsx`:

Replace:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
```

with:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
```

Replace:

```tsx
import {
  findItem,
  generateItem,
  reforgeCost,
```

with:

```tsx
import {
  emptyMaterials,
  findItem,
  generateItem,
  hone,
  imprint,
  reforgeCost,
```

Replace:

```tsx
import { useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
import { useDelveStore } from '@/stores/delveStore';
import { FAKE, fakeCrafting } from './crafting-fakes';

// Stage 4c's B2 fills Hone and Imprint: until then the bench runs on fakes.
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  ...Object.fromEntries(
    ['previewForge', 'forge', 'refineCost', 'refine', 'buyShard']
      .concat(['honeCost', 'hone', 'imprintCost', 'imprint'])
      .map((k) => [k, vi.fn()]),
  ),
}));
```

Replace:

```tsx
    store().resetProfile(1234, 'fire');
  });
```

with:

```tsx
    store().resetProfile(1234, 'fire');
    vi.clearAllMocks();
    fakeCrafting();
  });
```

Replace:

```tsx
  it('an item with no affixes has no Reforge', () => {
    bench(helm('fire'));
    expect(screen.queryByTestId('reforge-open')).toBeNull();
  });
```

with:

```tsx
  it('an item with no affixes has no Reforge, Hone or Imprint', () => {
    bench(helm('fire'));
    for (const op of ['reforge', 'hone', 'imprint'])
      expect(screen.queryByTestId(`${op}-open`)).toBeNull();
  });

  it("hones a line at the engine's price, which grows with each hone", () => {
    const item = { ...helm('fire', [{ stat: 'armor', value: 4, roll: 0.3 }]), hones: 2 };
    bench(item, { scrap: 100 });
    fireEvent.click(screen.getByTestId('hone-open'));
    expect(screen.getByTestId('hone-pick')).toHaveAttribute('data-pad-scope');
    expect(screen.getByTestId('hone-back')).toHaveAttribute('data-pad-back');
    expect(screen.getByTestId('hone-count')).toHaveTextContent(
      'Honed 2 times: each hone costs more.',
    );
    expect(screen.getByTestId('hone-button')).toHaveTextContent('Pick a line');
    fireEvent.click(screen.getByTestId('hone-line-0'));
    expect(screen.getByTestId('hone-button')).toHaveTextContent(`Hone · ${FAKE.hone * 3} scrap`);
    fireEvent.click(screen.getByTestId('hone-button'));
    expect(hone).toHaveBeenCalledWith(registry, expect.anything(), 'h1', 0);
    expect(screen.getByRole('status')).toHaveTextContent('Honed!');
  });

  it('imprints a held shard over a line: only shards that fit the slot, none of an affix the item has', () => {
    const item = helm('fire', [{ stat: 'armor', value: 4, roll: 0.3 }]);
    store().setProfile({
      ...store().profile,
      // A helm takes Crit Chance and Armor, not Damage; it has Armor already.
      materials: { ...emptyMaterials(), shards: { critChance: [1], armor: [2], damage: [1] } },
    });
    bench(item, { scrap: FAKE.imprint });
    fireEvent.click(screen.getByTestId('imprint-open'));
    expect(screen.queryByTestId('shard-picker')).toBeNull(); // a line first
    fireEvent.click(screen.getByTestId('imprint-line-0'));
    expect(screen.getByTestId('imprint-button')).toHaveTextContent('Pick a shard');
    expect(screen.getByTestId('shard-pick-critChance-1')).toBeInTheDocument();
    expect(screen.queryByTestId('shard-pick-armor-1')).toBeNull();
    expect(screen.queryByTestId('shard-pick-damage-1')).toBeNull();
    fireEvent.click(screen.getByTestId('shard-pick-critChance-1'));
    expect(screen.getByTestId('shard-pick-critChance-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('imprint-button')).toHaveTextContent(
      `Imprint Crit Chance I · ${FAKE.imprint} scrap`,
    );
    fireEvent.click(screen.getByTestId('imprint-button'));
    expect(imprint).toHaveBeenCalledWith(registry, expect.anything(), 'h1', 0, {
      stat: 'critChance',
      tier: 1,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Imprinted!');
    // The shard is spent: the next imprint picks again.
    expect(screen.getByTestId('imprint-button')).toHaveTextContent('Pick a shard');
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/Temper.test.tsx)`
Expected: FAIL, 2 failed | 5 passed: "hones a line at the engine's price, which grows with each hone" (`Unable to find an element by: [data-testid="hone-open"]`) and "imprints a held shard over a line: …" (`… [data-testid="imprint-open"]`).

- [ ] **Step 3: The shard picker and the bench**

Create `packages/client/src/features/delve/hub/forge/ShardPicker.tsx`:

```tsx
import { shardTiersOf, type GearSlot, type HeroStatKey, type ShardRef } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../registry';
import { SLOT_LABEL } from '../../format';
import { pct, shardName } from './materials-text';

/**
 * The shards held that a line of a `slot` item can take: each affix the slot
 * allows, but `exclude`, at every tier held, with its count and roll band. A
 * plain list: the caller holds the pad scope and its Back.
 */
export function ShardPicker({
  slot,
  exclude,
  selected = null,
  onPick,
}: {
  slot: GearSlot;
  exclude: readonly HeroStatKey[];
  selected?: ShardRef | null;
  onPick: (shard: ShardRef) => void;
}) {
  const registry = getDelveRegistry();
  const pouch = useDelveStore((s) => s.profile.materials.shards);
  const held = registry
    .getDelveData()
    .affixes.filter((a) => a.slots.includes(slot) && !exclude.includes(a.stat))
    .flatMap((a) =>
      shardTiersOf(registry, a.stat).flatMap((band) => {
        const n = pouch[a.stat]?.[band.tier - 1] ?? 0;
        return n > 0 ? [{ shard: { stat: a.stat, tier: band.tier }, n, band }] : [];
      }),
    );
  if (held.length === 0)
    return (
      <p className="k-body-2" data-testid="shard-none">
        No shards fit a {SLOT_LABEL[slot]}. Buy tier I at the shard bench, or salvage gear.
      </p>
    );
  return (
    <div className="flex flex-col gap-2" data-testid="shard-picker">
      {held.map(({ shard, n, band }) => {
        const on = selected?.stat === shard.stat && selected.tier === shard.tier;
        return (
          <button
            key={`${shard.stat}-${shard.tier}`}
            type="button"
            className="k-well flex items-center justify-between gap-3 p-2 text-left"
            style={{ borderColor: on ? 'var(--k-hot)' : undefined }}
            aria-pressed={on}
            onClick={() => onPick(shard)}
            data-testid={`shard-pick-${shard.stat}-${shard.tier}`}
          >
            <span className="text-[16px]">
              {shardName(registry, shard)} ×{n}
            </span>
            <span className="k-caption">
              rolls {pct(band.min)}–{pct(band.max)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

Overwrite `packages/client/src/features/delve/hub/forge/Temper.tsx`:

```tsx
import { useId, useRef, useState } from 'react';
import {
  honeCost,
  imprintCost,
  itemStatLines,
  pairElements,
  reattuneCost,
  reforgeCost,
  upgradeCost,
  type GearItem,
  type ManaType,
  type ShardRef,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Chip, Glyph, Price } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemHeader } from '../../items/ItemHeader';
import { ItemStatLines, AffixLine } from '../../items/ItemStatLines';
import { manaStyle } from '../../format';
import { ShardPicker } from './ShardPicker';
import { shardName } from './materials-text';

const BACK = { key: 'Escape', pad: 'b' } as const;

/** The line ops: each picks a line in its own pad scope with a Back. */
type LineOp = 'reforge' | 'hone' | 'imprint';
const LINE_OP: Record<LineOp, { label: string; pick: string; done: string }> = {
  reforge: { label: 'Reforge', pick: 'Pick a line to reforge', done: 'Reforged!' },
  hone: { label: 'Hone', pick: 'Pick a line to hone', done: 'Honed!' },
  imprint: { label: 'Imprint', pick: 'Pick a line to imprint over', done: 'Imprinted!' },
};

/**
 * The Temper bench: the selected item's Upgrade +1, the line ops (Reforge a
 * line to a random affix, Hone its value within its band, Imprint a shard over
 * it) and Re-attune to the pair's other element, each at the engine's price
 * against the purse: one the purse can't pay is off, and says what it needs.
 */
export function Temper({ item }: { item: GearItem }) {
  const registry = getDelveRegistry();
  const scrap = useDelveStore((s) => s.profile.scrap);
  const dust = useDelveStore((s) => s.profile.manaDust);
  const pair = useDelveStore((s) => s.profile.pair);
  const store = useDelveStore.getState;
  const [op, setOp] = useState<LineOp | null>(null);
  const [line, setLine] = useState<number | null>(null);
  const [shard, setShard] = useState<ShardRef | null>(null);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  const upCost = upgradeCost(registry, item);
  const raCost = reattuneCost(registry, item);
  // The open line op's scrap (an Imprint's besides its shard; a Hone's grows with each).
  const opCost =
    op === 'reforge'
      ? reforgeCost(registry, item)
      : op === 'hone'
        ? honeCost(registry, item)
        : op === 'imprint'
          ? imprintCost(registry, item)
          : 0;
  const affixes = itemStatLines(item, registry).filter((l) => l.source === 'affix');
  const reattuneTo = pairElements(pair).filter((m) => m !== item.mana);
  const { maxUpgrade: max, upgradeStep } = registry.getDelveBalance().forge;
  const id = useId();
  const upShort = upCost !== null && upCost > scrap;
  const ready = line !== null && (op !== 'imprint' || shard !== null);
  const opShort = ready && opCost > scrap;

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
  const open = (next: LineOp | null) => {
    setOp(next);
    setLine(null);
    setShard(null);
  };

  const onUpgrade = () => {
    const res = store().upgrade(item.uid);
    if (res.ok) playSound('upgradeTier');
    done(res.ok, `Upgraded to +${res.item?.upgrade}`, res.reason, 'Cannot upgrade');
  };
  const onLineOp = () => {
    if (!op || line === null) return;
    const s = store();
    const res =
      op === 'reforge'
        ? s.reforge(item.uid, line)
        : op === 'hone'
          ? s.hone(item.uid, line)
          : shard && s.imprint(item.uid, line, shard);
    if (!res) return;
    if (res.ok) playSound('combineMerge');
    // An imprint spends its shard: pick again for the next.
    if (res.ok && op === 'imprint') setShard(null);
    done(res.ok, LINE_OP[op].done, res.reason, `Cannot ${op}`);
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
      {op ? (
        <div
          ref={statsRef}
          className="flex flex-col gap-3"
          data-pad-scope
          data-testid={`${op}-pick`}
        >
          <div className="flex items-center justify-between">
            <span className="k-label">{LINE_OP[op].pick}</span>
            <Button
              variant="quiet"
              size="sm"
              binding={BACK}
              data-pad-back
              onClick={() => open(null)}
              testId={`${op}-back`}
            >
              Back
            </Button>
          </div>
          {op === 'hone' && (
            <p className="k-caption" data-testid="hone-count">
              Honed {item.hones} {item.hones === 1 ? 'time' : 'times'}: each hone costs more.
            </p>
          )}
          {affixes.map((l, i) => (
            <button
              key={`${i}-${l.stat}`}
              type="button"
              className="k-well p-2 text-left"
              style={{ borderColor: line === i ? 'var(--k-hot)' : undefined }}
              aria-pressed={line === i}
              data-pad-first={i === 0 ? '' : undefined}
              onClick={() => setLine(i)}
              data-testid={`${op}-line-${i}`}
            >
              <AffixLine line={l} />
            </button>
          ))}
          {op === 'imprint' && line !== null && (
            <>
              <span className="k-label">Pick a shard</span>
              <ShardPicker
                slot={item.slot}
                exclude={item.affixes.map((a) => a.stat)}
                selected={shard}
                onPick={setShard}
              />
            </>
          )}
          <Button
            variant="primary"
            disabled={!ready || opShort}
            onClick={onLineOp}
            aria-describedby={opShort ? `${id}-op` : undefined}
            testId={`${op}-button`}
          >
            {line === null ? (
              'Pick a line'
            ) : !ready ? (
              'Pick a shard'
            ) : (
              <>
                {LINE_OP[op].label}
                {shard && ` ${shardName(registry, shard)}`} · <Price scrap={opCost} />
              </>
            )}
          </Button>
          {opShort && (
            <span id={`${id}-op`} className="k-caption">
              Needs <Price scrap={opCost} />
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div ref={statsRef}>
            <ItemStatLines item={item} />
          </div>
          <p className="k-caption">
            Each forge level adds +{Math.round(upgradeStep * 100)}% to every stat on the item.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              disabled={upCost === null || upShort}
              onClick={onUpgrade}
              aria-describedby={upShort ? `${id}-up` : undefined}
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
            {affixes.length > 0 &&
              (Object.keys(LINE_OP) as LineOp[]).map((o) => (
                <Button key={o} onClick={() => open(o)} testId={`${o}-open`}>
                  {LINE_OP[o].label}…
                </Button>
              ))}
            {upShort && (
              <span id={`${id}-up`} className="k-caption">
                Needs <Price scrap={upCost} />
              </span>
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
                      aria-describedby={raCost > dust ? `${id}-ra` : undefined}
                      testId={`reattune-${m}`}
                    >
                      <Glyph id={m} size={16} color={st.color} /> {st.name} ·{' '}
                      <Price dust={raCost} />
                    </Chip>
                  );
                })}
                {raCost > dust && (
                  <span id={`${id}-ra`} className="k-caption self-center">
                    Needs <Price dust={raCost} />
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run them to see them pass, then the client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge)`
Expected: PASS, 19 tests in 4 files.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 5 tests in G + 1 files pass (**1174 tests in 147 files**).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c2
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/forge/ShardPicker.tsx src/features/delve/hub/forge/Temper.tsx src/features/delve/hub/forge/__tests__/Temper.test.tsx)
git add packages/client/src/features/delve/hub/forge/ShardPicker.tsx packages/client/src/features/delve/hub/forge/Temper.tsx packages/client/src/features/delve/hub/forge/__tests__/Temper.test.tsx
git commit -m "feat(client): Hone and Imprint on the Temper bench" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The Forge bench

### Task 3: The pattern list and the forge

`ForgeBench` renders two grid cells: the pattern list and the forge. It keeps the request in its own state, calls `previewForge` on every render once a pattern is picked, and renders only the preview. Forge goes through the store (`forge`: the item comes marked new); a legendary plays the fanfare. Task 4 puts it in the tab.

**Files:**
- Create: `packages/client/src/features/delve/hub/forge/PatternList.tsx`, `hub/forge/ForgeBench.tsx`, `hub/forge/__tests__/ForgeBench.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx`:

```tsx
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { emptyMaterials, forge, previewForge, type MaterialsPouch } from '@alloy/engine';
import { ForgeBench } from '../ForgeBench';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import type { Prompt } from '../../../kit';
import { FAKE, fakeCrafting } from './crafting-fakes';

// Stage 4c's B2 fills the crafting ops: until then the bench runs on fakes.
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  ...Object.fromEntries(
    ['previewForge', 'forge', 'refineCost', 'refine', 'buyShard']
      .concat(['honeCost', 'hone', 'imprintCost', 'imprint'])
      .map((k) => [k, vi.fn()]),
  ),
}));

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const lastRequest = () => vi.mocked(previewForge).mock.lastCall?.[2];
const withMaterials = (over: Partial<MaterialsPouch>) =>
  store().setProfile({
    ...store().profile,
    scrap: 100,
    materials: { ...emptyMaterials(), ...over },
  });

function bench(locked = false) {
  const setPrompts = vi.fn<(p: Prompt[]) => void>();
  render(
    <div style={{ display: 'grid' }}>
      <ForgeBench locked={locked} setPrompts={setPrompts} />
    </div>,
  );
  return setPrompts;
}

describe('ForgeBench', () => {
  beforeAll(() => {
    // jsdom has no Web Animations; the fanfare's entrance is cosmetic.
    if (!Element.prototype.animate)
      Element.prototype.animate = function () {
        return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
      };
  });

  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    useInputDeviceStore.setState({ device: 'keyboard' });
    vi.clearAllMocks();
    fakeCrafting();
  });

  it('lists the learned patterns, then the unknown ones greyed with where they come from', () => {
    bench();
    const list = screen.getByTestId('pattern-list');
    for (const id of store().profile.patterns)
      expect(within(list).getByTestId(`pattern-${id}`)).toBeInTheDocument();
    expect(screen.getByTestId('pattern-unknown-bow')).toHaveTextContent(
      'Unknown · salvage a Bow, or find its pattern on elites and bosses',
    );
    expect(within(screen.getByTestId('pattern-unknown-bow')).queryByRole('button')).toBeNull();
    // Nothing is forged from nothing: no preview until a pattern is picked.
    expect(screen.getByTestId('forge-empty')).toHaveTextContent('Pick a pattern to forge');
    expect(previewForge).not.toHaveBeenCalled();
  });

  it("a pattern shows the engine's preview: the item, the floor, implicits, a weapon's skills, the price", () => {
    withMaterials({ metals: { ...emptyMaterials().metals, iron: 2 } });
    bench();
    fireEvent.click(screen.getByTestId('pattern-sword'));
    expect(screen.getByTestId('pattern-sword')).toHaveAttribute('aria-pressed', 'true');
    // The first metal held, the primary, no flux and no shards.
    expect(lastRequest()).toEqual({ baseId: 'sword', metal: 'iron', element: 'fire', shards: [] });
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Common Sword');
    expect(screen.getByTestId('metal-iron')).toHaveTextContent('Iron bar ×2');
    expect(screen.getByTestId('metal-rusty')).toBeDisabled();
    expect(
      screen.getByText('A common item rolls no lines: add flux for some.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('forge-floor')).toHaveTextContent(
      'Your Fire attunement lifts every roll: each starts at least 12% up its band.',
    );
    expect(screen.getByTestId('forge-implicits')).toHaveTextContent('+3 to +5 Armor');
    expect(screen.getByTestId('forge-weapon')).toHaveTextContent(
      'Carries Basic, Primary · extra slots: Primary +1 · 1 open socket',
    );
    expect(screen.getByTestId('forge-uses')).toHaveTextContent('Uses Iron bar');
    expect(screen.getByTestId('forge-button')).toHaveTextContent(`Forge · ${FAKE.forge} scrap`);
    expect(screen.getByTestId('forge-button')).toBeEnabled();
  });

  it('flux sets the rarity; a line takes a shard picked from those that fit the slot', () => {
    withMaterials({
      metals: { ...emptyMaterials().metals, rusty: 1 },
      flux: { ...emptyMaterials().flux, rare: 1 },
      // Crit Chance and Fire Damage fit a sword; Armor doesn't.
      shards: { critChance: [0, 2], firePower: [1], armor: [3] },
    });
    bench();
    fireEvent.click(screen.getByTestId('pattern-sword'));
    fireEvent.click(screen.getByTestId('flux-rare'));
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Rare Sword');
    expect(screen.getByTestId('shard-slot-2')).toHaveTextContent('Random line');
    expect(screen.getByTestId('shard-slot-0')).toHaveTextContent('rolls 10%–100%');
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    const pick = screen.getByTestId('shard-pick');
    expect(pick).toHaveAttribute('data-pad-scope');
    expect(screen.getByTestId('shard-back')).toHaveAttribute('data-pad-back');
    expect(screen.getByTestId('shard-random')).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('shard-pick-critChance-2')).toHaveTextContent(
      'Crit Chance II ×2rolls 20%–50%',
    );
    expect(screen.queryByTestId('shard-pick-armor-1')).toBeNull();
    fireEvent.click(screen.getByTestId('shard-pick-critChance-2'));
    expect(lastRequest()).toMatchObject({
      flux: 'rare',
      shards: [{ stat: 'critChance', tier: 2 }],
    });
    expect(screen.getByTestId('shard-slot-0')).toHaveTextContent('Crit Chance II: +2% to +4%');
    expect(screen.getByTestId('forge-uses')).toHaveTextContent(
      'Uses Rusty bar, Rare flux, Crit Chance II',
    );
    // The next line can't take the same affix again.
    fireEvent.click(screen.getByTestId('shard-slot-1'));
    expect(screen.queryByTestId('shard-pick-critChance-2')).toBeNull();
    fireEvent.click(screen.getByTestId('shard-pick-firePower-1'));
    expect(lastRequest()!.shards).toHaveLength(2);
    // A line set back to random drops its shard; the others move up.
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    fireEvent.click(screen.getByTestId('shard-random'));
    expect(lastRequest()!.shards).toEqual([{ stat: 'firePower', tier: 1 }]);
  });

  it('a lower flux keeps only the shards its lines can hold', () => {
    withMaterials({
      metals: { ...emptyMaterials().metals, rusty: 1 },
      flux: { ...emptyMaterials().flux, uncommon: 1, magic: 1 },
      shards: { critChance: [1], firePower: [1] },
    });
    bench();
    fireEvent.click(screen.getByTestId('pattern-sword'));
    fireEvent.click(screen.getByTestId('flux-magic'));
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    fireEvent.click(screen.getByTestId('shard-pick-critChance-1'));
    fireEvent.click(screen.getByTestId('shard-slot-1'));
    fireEvent.click(screen.getByTestId('shard-pick-firePower-1'));
    fireEvent.click(screen.getByTestId('flux-uncommon'));
    expect(lastRequest()).toMatchObject({
      flux: 'uncommon',
      shards: [{ stat: 'critChance', tier: 1 }],
    });
    fireEvent.click(screen.getByTestId('flux-none'));
    expect(lastRequest()).toEqual({ baseId: 'sword', metal: 'rusty', element: 'fire', shards: [] });
  });

  it("an element outside the pair costs Mana Dust; the engine's refusal turns Forge off and says why", () => {
    withMaterials({ metals: { ...emptyMaterials().metals, rusty: 1 } });
    bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    const dust = registry.getDelveBalance().crafting.offPairDust;
    expect(screen.getByTestId('element-fire')).toHaveTextContent(/^Fire$/);
    expect(screen.getByTestId('element-storm')).toHaveTextContent(`Storm · ${dust} Mana Dust`);
    fireEvent.click(screen.getByTestId('element-storm'));
    expect(lastRequest()).toMatchObject({ element: 'storm' });
    expect(screen.queryByTestId('forge-floor')).toBeNull();
    expect(screen.getByTestId('forge-button')).toHaveTextContent(
      `Forge · ${FAKE.forge} scrap · ${dust} Mana Dust`,
    );
    act(() => withMaterials({}));
    expect(screen.getByTestId('forge-button')).toBeDisabled();
    expect(screen.getByTestId('forge-refused')).toHaveTextContent('You have no such bar');
    expect(screen.getByTestId('forge-button')).toHaveAccessibleDescription('You have no such bar');
  });

  it('Forge (or Enter) forges: the item comes marked new, and the bench says so', () => {
    withMaterials({ metals: { ...emptyMaterials().metals, rusty: 2 } });
    const setPrompts = bench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    fireEvent.click(screen.getByTestId('forge-button'));
    expect(forge).toHaveBeenCalledWith(registry, expect.anything(), {
      baseId: 'cuirass',
      metal: 'rusty',
      element: 'fire',
      shards: [],
    });
    const made = store().profile.bag.at(-1)!;
    expect(store().newUids[made.uid]).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(
      `Forged ${made.name}: it waits in your bag`,
    );
    // The keys' prompts: Select, and Enter to forge; the pad presses the focused button.
    const prompts = setPrompts.mock.lastCall![0];
    expect(prompts.map((p) => p.label)).toEqual(['Select', 'Forge']);
    act(() => prompts[1].onPress!());
    expect(forge).toHaveBeenCalledTimes(2);
    act(() => useInputDeviceStore.setState({ device: 'gamepad' }));
    expect(setPrompts.mock.lastCall![0].map((p) => p.label)).toEqual(['Select']);
  });

  it('epic flux and an essence forge a legendary: the patterns say which it fits, and the fanfare plays', () => {
    withMaterials({
      metals: { ...emptyMaterials().metals, rusty: 1 },
      flux: { ...emptyMaterials().flux, epic: 1 },
      essences: { pyroclasm: 1 },
    });
    bench();
    fireEvent.click(screen.getByTestId('pattern-sword'));
    expect(screen.queryByTestId('essence-pyroclasm')).toBeNull(); // epic flux first
    fireEvent.click(screen.getByTestId('flux-epic'));
    fireEvent.click(screen.getByTestId('essence-pyroclasm'));
    expect(lastRequest()).toMatchObject({ flux: 'epic', essence: 'pyroclasm' });
    // Pyroclasm fits a weapon, an amulet or a helm.
    expect(screen.getByTestId('pattern-sword')).toHaveTextContent('Fits the essence');
    expect(screen.getByTestId('pattern-cuirass')).toHaveTextContent('The essence does not fit');
    const def = registry.getLegendary('pyroclasm');
    expect(screen.getByTestId('forge-legendary')).toHaveTextContent(`${def.name}:`);
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Legendary Sword');
    fireEvent.click(screen.getByTestId('forge-button'));
    expect(screen.getByTestId('legendary-fanfare')).toHaveTextContent('New codex entry!');
    fireEvent.click(screen.getByTestId('legendary-fanfare'));
    expect(screen.queryByTestId('legendary-fanfare')).toBeNull();
  });

  it('mid-dive the forge waits, with Select alone left to the tab', () => {
    const setPrompts = bench(true);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('forge and salvage between dives');
    expect(setPrompts).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx)`
Expected: FAIL: `Failed to resolve import "../ForgeBench" from "src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx". Does the file exist?` (no tests run).

- [ ] **Step 3: The pattern list and the bench**

Create `packages/client/src/features/delve/hub/forge/PatternList.tsx`:

```tsx
import { Panel } from '../../kit';
import { ItemIcon } from '../../ItemIcon';
import { SLOT_LABEL } from '../../format';
import { getDelveRegistry } from '../../registry';

/**
 * The Forge bench's patterns: the learned ones (a row picks the pattern), then
 * the unknown ones greyed with where they come from. With an essence chosen,
 * each learned pattern says whether its legendary fits that slot.
 */
export function PatternList({
  known,
  selected,
  essence,
  onSelect,
}: {
  known: readonly string[];
  selected: string | null;
  /** The chosen essence (a legendary id), if any. */
  essence: string | null;
  onSelect: (baseId: string) => void;
}) {
  const registry = getDelveRegistry();
  const bases = registry.getDelveData().bases;
  const fits = essence ? registry.getLegendary(essence).slots : null;
  return (
    <Panel title="Patterns" testId="pattern-list">
      <div className="flex flex-col gap-2">
        {bases
          .filter((b) => known.includes(b.id))
          .map((b) => (
            <button
              key={b.id}
              type="button"
              className="flex items-center gap-3 p-2 text-left"
              style={{ boxShadow: selected === b.id ? 'inset 4px 0 0 var(--k-hot)' : undefined }}
              aria-pressed={selected === b.id}
              onClick={() => onSelect(b.id)}
              data-testid={`pattern-${b.id}`}
            >
              <span
                aria-hidden
                className="k-socket flex h-14 w-14 flex-none items-center justify-center"
              >
                <ItemIcon baseId={b.id} rarity="common" size={28} />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[18px]">{b.name}</span>
                <span className="k-caption">
                  {SLOT_LABEL[b.slot]}
                  {fits &&
                    (fits.includes(b.slot) ? (
                      <span style={{ color: 'var(--k-ok)' }}> · Fits the essence</span>
                    ) : (
                      ' · The essence does not fit'
                    ))}
                </span>
              </span>
            </button>
          ))}
        {bases
          .filter((b) => !known.includes(b.id))
          .map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 p-2"
              aria-disabled
              data-testid={`pattern-unknown-${b.id}`}
            >
              <span
                aria-hidden
                className="k-socket flex h-14 w-14 flex-none items-center justify-center"
              >
                <ItemIcon baseId={b.id} rarity="common" size={28} ghost />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[18px] text-[var(--k-text-3)]">{b.name}</span>
                <span className="k-caption">
                  Unknown · salvage a {b.name}, or find its pattern on elites and bosses
                </span>
              </span>
            </div>
          ))}
      </div>
    </Panel>
  );
}
```

Create `packages/client/src/features/delve/hub/forge/ForgeBench.tsx`:

```tsx
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  FLUX_GRADES,
  MANA_TYPES,
  METAL_IDS,
  inPair,
  previewForge,
  type FluxGrade,
  type ForgeRequest,
  type GearItem,
  type MaterialRef,
  type MetalId,
  type ShardRef,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Panel, Price, Segmented, type Prompt } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemIcon } from '../../ItemIcon';
import { LegendaryFanfare } from '../../LegendaryFanfare';
import { RARITY_LABEL, RARITY_TEXT, SLOT_LABEL, manaStyle } from '../../format';
import { SKILL_NAME } from '../../chains/chain-text';
import { PatternList } from './PatternList';
import { ShardPicker } from './ShardPicker';
import { materialLabel, pct, shardName, statRange, valueRange } from './materials-text';

export const SELECT_PROMPT: Prompt = {
  id: 'select',
  label: 'Select',
  binding: { mouse: 'click', pad: 'a' },
};
const BACK = { key: 'Escape', pad: 'b' } as const;

/** The forge's note while a dive is under way (both benches). */
export function ForgeLocked() {
  return (
    <p className="k-body-2" data-testid="forge-locked">
      A dive is under way: forge and salvage between dives.
    </p>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="k-label">{label}</span>
      {children}
    </div>
  );
}

/**
 * The Forge bench: the pattern list (the left pane) and the forge (the centre):
 * a learned pattern, a bar, a flux (and with epic flux an essence), the element
 * and a shard for each line it should set, with the engine's live
 * `previewForge`: the lines' bands, the attunement floor, the implicits, a
 * weapon's skills, slots and sockets, the price and why it refuses. Forge
 * (Enter, or A on the button) makes it; a legendary plays the fanfare.
 */
export function ForgeBench({
  locked,
  setPrompts,
}: {
  locked: boolean;
  setPrompts: (prompts: Prompt[]) => void;
}) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const pad = useInputDeviceStore((s) => s.device === 'gamepad');
  const { metals, flux: fluxHeld, essences } = profile.materials;
  const [baseId, setBaseId] = useState<string | null>(null);
  const [metal, setMetal] = useState<MetalId>(
    () => METAL_IDS.find((m) => metals[m] > 0) ?? METAL_IDS[0],
  );
  const [flux, setFlux] = useState<FluxGrade | null>(null);
  const [essence, setEssence] = useState<string | null>(null);
  const [element, setElement] = useState(profile.pair.primary ?? MANA_TYPES[0]);
  const [shards, setShards] = useState<ShardRef[]>([]);
  const [picking, setPicking] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [fanfare, setFanfare] = useState<{ item: GearItem; firstTime: boolean } | null>(null);
  const endFanfare = useCallback(() => setFanfare(null), []);
  const id = useId();

  const request = (f: FluxGrade | null, e: string | null, s: ShardRef[]): ForgeRequest => ({
    baseId: baseId!,
    metal,
    element,
    shards: s,
    ...(f && { flux: f }),
    ...(f === 'epic' && e && { essence: e }),
  });
  const req = baseId ? request(flux, essence, shards) : null;
  const preview = req && previewForge(registry, profile, req);

  const say = (text: string, good: boolean) => setMessage({ text, good });
  // A rarity's line count doesn't depend on the shards: a lower one keeps the first that fit.
  const pickIngot = (f: FluxGrade | null, e: string | null) => {
    const lines = previewForge(registry, profile, request(f, e, [])).lines.length;
    setFlux(f);
    setEssence(e);
    setShards((s) => s.slice(0, lines));
  };
  // Line i takes `shard`, or (null) rolls at random: the shards come first, in order.
  const setLine = (i: number, shard: ShardRef | null) => {
    setShards((s) =>
      shard
        ? i < s.length
          ? s.map((x, j) => (j === i ? shard : x))
          : [...s, shard]
        : s.filter((_, j) => j !== i),
    );
    setPicking(null);
  };

  const onForge = () => {
    if (!req || !preview) return say('Pick a pattern first', false);
    if (preview.refused) {
      playSound('combineFail');
      return say(preview.refused.reason, false);
    }
    const res = useDelveStore.getState().forge(req);
    if (!res.ok || !res.item) {
      playSound('combineFail');
      return say(res.reason ?? 'Cannot forge', false);
    }
    const item = res.item;
    setShards([]);
    if (item.legendary) {
      playSound('lootLegendary');
      vibrate('heavy');
      setFanfare({ item, firstTime: res.profile.codex[item.legendary.id]?.count === 1 });
    } else {
      playSound('combineMerge');
      vibrate('success');
    }
    say(`Forged ${item.name}: it waits in your bag`, true);
  };
  // Enter forges (A presses the focused Forge button: the pad's A is never a prompt's).
  const forgeNow = useRef(onForge);
  useLayoutEffect(() => {
    forgeNow.current = onForge;
  });
  useEffect(() => {
    if (locked) return; // the Forge tab shows Select alone
    setPrompts(
      pad
        ? [SELECT_PROMPT]
        : [
            SELECT_PROMPT,
            {
              id: 'forge',
              label: 'Forge',
              binding: { key: ['Enter', 'NumpadEnter'] },
              onPress: () => forgeNow.current(),
            },
          ],
    );
  }, [pad, locked, setPrompts]);

  const offPairDust = registry.getDelveBalance().crafting.offPairDust;
  const legend = preview?.legendary ? registry.getLegendary(preview.legendary.id) : null;
  const uses: MaterialRef[] = req
    ? [
        { kind: 'metal', metal },
        ...(req.flux ? [{ kind: 'flux' as const, grade: req.flux }] : []),
        ...(req.essence ? [{ kind: 'essence' as const, essence: req.essence }] : []),
        ...shards.map((s) => ({ kind: 'shard' as const, ...s })),
      ]
    : [];
  const extras = preview?.weapon
    ? Object.entries(preview.weapon.slots)
        .filter(([, n]) => n > 0)
        .map(([s, n]) => `${SKILL_NAME[s as keyof typeof SKILL_NAME]} +${n}`)
    : [];

  return (
    <>
      <PatternList
        known={profile.patterns}
        selected={baseId}
        essence={flux === 'epic' ? essence : null}
        onSelect={(b) => {
          playSound('orbSelect');
          setBaseId(b);
          setShards([]);
          setPicking(null);
          setMessage(null);
        }}
      />
      <Panel aria-label="Forge" testId="forge-bench">
        {message && !locked && (
          <p
            role="status"
            className="text-[16px]"
            style={{ color: message.good ? 'var(--k-ok)' : 'var(--k-bad-text)' }}
          >
            {message.text}
          </p>
        )}
        {locked ? (
          <ForgeLocked />
        ) : !preview ? (
          <p className="k-body-2" data-testid="forge-empty">
            Pick a pattern to forge.
          </p>
        ) : picking !== null ? (
          <div className="flex flex-col gap-3" data-pad-scope data-testid="shard-pick">
            <div className="flex items-center justify-between">
              <span className="k-label">Line {picking + 1}: pick a shard</span>
              <Button
                variant="quiet"
                size="sm"
                binding={BACK}
                data-pad-back
                onClick={() => setPicking(null)}
                testId="shard-back"
              >
                Back
              </Button>
            </div>
            <Button
              size="sm"
              data-pad-first
              onClick={() => setLine(picking, null)}
              testId="shard-random"
            >
              Random line
            </Button>
            <ShardPicker
              slot={preview.slot}
              exclude={shards.filter((_, j) => j !== picking).map((s) => s.stat)}
              selected={shards[picking] ?? null}
              onPick={(s) => setLine(picking, s)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="k-socket flex h-14 w-14 flex-none items-center justify-center"
              >
                <ItemIcon baseId={preview.baseId} rarity={preview.rarity} size={28} />
              </span>
              <span className="flex flex-col gap-1">
                <span
                  className="text-[20px]"
                  style={{ color: RARITY_TEXT[preview.rarity] }}
                  data-testid="forge-title"
                >
                  {RARITY_LABEL[preview.rarity]} {registry.getGearBase(preview.baseId).name}
                </span>
                <span className="k-caption">
                  {SLOT_LABEL[preview.slot]} · item level {preview.ilvl}
                </span>
              </span>
            </div>
            <div className="k-caption flex items-center gap-2" data-testid="forge-purse">
              In hand: <Price scrap={profile.scrap} dust={profile.manaDust} />
            </div>
            <Field label="Metal">
              <Segmented
                aria-label="Metal"
                columns={4}
                value={metal}
                onChange={setMetal}
                options={METAL_IDS.map((m) => ({
                  id: m,
                  label: `${materialLabel(registry, { kind: 'metal', metal: m })} ×${metals[m]}`,
                  disabled: metals[m] === 0,
                  testId: `metal-${m}`,
                }))}
              />
            </Field>
            <Field label="Flux">
              <Segmented
                aria-label="Flux"
                columns={5}
                value={flux ?? 'none'}
                onChange={(f) => pickIngot(f === 'none' ? null : f, essence)}
                options={[
                  { id: 'none' as const, label: 'None', testId: 'flux-none' },
                  ...FLUX_GRADES.map((g) => ({
                    id: g,
                    label: `${RARITY_LABEL[g]} ×${fluxHeld[g]}`,
                    disabled: fluxHeld[g] === 0,
                    testId: `flux-${g}`,
                  })),
                ]}
              />
            </Field>
            {flux === 'epic' && (
              <Field label="Essence">
                <Segmented
                  aria-label="Essence"
                  value={essence ?? 'none'}
                  onChange={(e) => pickIngot('epic', e === 'none' ? null : e)}
                  options={[
                    { id: 'none', label: 'None · epic', testId: 'essence-none' },
                    ...Object.entries(essences)
                      .filter(([, n]) => n > 0)
                      .map(([e, n]) => ({
                        id: e,
                        label: `${registry.getLegendary(e).name} ×${n}`,
                        testId: `essence-${e}`,
                      })),
                  ]}
                />
              </Field>
            )}
            <Field label="Element">
              <Segmented
                aria-label="Element"
                columns={3}
                value={element}
                onChange={setElement}
                options={MANA_TYPES.map((m) => {
                  const st = manaStyle(registry, m);
                  return {
                    id: m,
                    color: st.color,
                    label: inPair(profile, m) ? (
                      st.name
                    ) : (
                      <>
                        {st.name} · <Price dust={offPairDust} />
                      </>
                    ),
                    testId: `element-${m}`,
                  };
                })}
              />
            </Field>
            <Field label="Lines">
              {preview.lines.length === 0 && (
                <p className="k-caption">A common item rolls no lines: add flux for some.</p>
              )}
              {preview.lines.map((l, i) => (
                <button
                  key={i}
                  type="button"
                  className="k-well flex items-center justify-between gap-3 p-2 text-left"
                  onClick={() => setPicking(i)}
                  data-testid={`shard-slot-${i}`}
                >
                  <span className="text-[16px]">
                    {l.shard
                      ? `${shardName(registry, l.shard)}: ${
                          l.range ? valueRange(registry, l.shard.stat, l.range[0], l.range[1]) : ''
                        }`
                      : 'Random line'}
                  </span>
                  <span className="k-caption">
                    rolls {pct(l.band[0])}–{pct(l.band[1])}
                  </span>
                </button>
              ))}
            </Field>
            {preview.floor > 0 && (
              <p className="k-caption" data-testid="forge-floor">
                Your {manaStyle(registry, preview.element).name} attunement lifts every roll: each
                starts at least {pct(preview.floor)} up its band.
              </p>
            )}
            <Field label="Implicits">
              <div className="flex flex-col gap-1" data-testid="forge-implicits">
                {preview.implicits.map((im) => (
                  <span key={im.stat} className="text-[16px]">
                    {statRange(registry, im.stat, im.min, im.max)}
                  </span>
                ))}
              </div>
            </Field>
            {legend && (
              <p className="text-[16px]" data-testid="forge-legendary">
                <span style={{ color: RARITY_TEXT.legendary }}>{legend.name}:</span>{' '}
                {legend.text.replace('{v}', `${legend.min}–${legend.max}`)}
              </p>
            )}
            {preview.weapon && (
              <p className="k-caption" data-testid="forge-weapon">
                Carries {preview.weapon.carries.map((s) => SKILL_NAME[s]).join(', ')}
                {extras.length > 0 && ` · extra slots: ${extras.join(', ')}`}
                {preview.weapon.sockets > 0 &&
                  ` · ${preview.weapon.sockets} open socket${preview.weapon.sockets === 1 ? '' : 's'}`}
              </p>
            )}
            <p className="k-caption" data-testid="forge-uses">
              Uses {uses.map((u) => materialLabel(registry, u)).join(', ')}
            </p>
            <Button
              variant="primary"
              size="lg"
              binding={{ key: 'Enter', pad: 'a' }}
              disabled={!!preview.refused}
              aria-describedby={preview.refused ? `${id}-why` : undefined}
              onClick={onForge}
              testId="forge-button"
            >
              Forge · <Price scrap={preview.price.scrap} dust={preview.price.dust || undefined} />
            </Button>
            {preview.refused && (
              <p
                id={`${id}-why`}
                className="k-caption"
                style={{ color: 'var(--k-bad-text)' }}
                data-testid="forge-refused"
              >
                {preview.refused.reason}
              </p>
            )}
          </div>
        )}
      </Panel>
      {fanfare &&
        createPortal(
          <LegendaryFanfare
            item={fanfare.item}
            firstTime={fanfare.firstTime}
            onDone={endFanfare}
          />,
          document.body,
        )}
    </>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge)`
Expected: PASS, 27 tests in 5 files.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 13 tests in G + 2 files pass (**1182 tests in 148 files**).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c2
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/forge/PatternList.tsx src/features/delve/hub/forge/ForgeBench.tsx src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx)
git add packages/client/src/features/delve/hub/forge/PatternList.tsx packages/client/src/features/delve/hub/forge/ForgeBench.tsx packages/client/src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx
git commit -m "feat(client): the Forge bench: patterns, the forge's pickers and lines, the live preview, Forge" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The tab

### Task 4: Forge | Temper, the links and the Materials pane

The tab draws the sub tab (LT/RT on the pad), opens the bench a link names, and lays out three panes: the bench's two and the Materials pane. The Forge bench sets its own prompts (Select, and Enter to forge on the keys); Temper and the lock show Select.

**Files:**
- Overwrite: `packages/client/src/features/delve/hub/forge/ForgeTab.tsx`
- Modify (tests): `packages/client/src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx`:

Replace:

```tsx
import type { HubTabProps } from '../../types';
```

with:

```tsx
import type { HubTabProps } from '../../types';
import { fakeCrafting } from './crafting-fakes';

// Stage 4c's B2 fills the crafting ops: until then the tab runs on fakes.
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  ...Object.fromEntries(
    ['previewForge', 'forge', 'refineCost', 'refine', 'buyShard']
      .concat(['honeCost', 'hone', 'imprintCost', 'imprint'])
      .map((k) => [k, vi.fn()]),
  ),
}));
```

Replace:

```tsx
    store().resetProfile(1234, 'fire');
  });

  it('lists what you wear first, then the bag, filtered by kind; a row picks the item to temper', () => {
    store().setProfile({ ...store().profile, bag: [item('h1', 'helm'), item('w1', 'weapon')] });
    const p = props();
    render(<ForgeTab {...p} />);
    expect(p.setPrompts).toHaveBeenCalledWith([expect.objectContaining({ label: 'Select' })]);
```

with:

```tsx
    store().resetProfile(1234, 'fire');
    vi.clearAllMocks();
    fakeCrafting();
  });

  it('opens on the Forge bench; Temper lists what you wear first, then the bag, filtered by kind', () => {
    store().setProfile({ ...store().profile, bag: [item('h1', 'helm'), item('w1', 'weapon')] });
    const p = props();
    render(<ForgeTab {...p} />);
    expect(screen.getByRole('tablist', { name: 'Bench' })).toHaveAttribute('data-pad-tabs', 'sub');
    expect(screen.getByTestId('bench-forge')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('pattern-list')).toBeInTheDocument();
    expect(screen.getByTestId('materials-pane')).toBeInTheDocument();
    expect(vi.mocked(p.setPrompts).mock.lastCall![0].map((x) => x.label)).toEqual([
      'Select',
      'Forge',
    ]);
    fireEvent.click(screen.getByTestId('bench-temper'));
    expect(screen.getByTestId('bench-temper')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('pattern-list')).toBeNull();
    expect(screen.getByTestId('materials-pane')).toBeInTheDocument();
    expect(p.setPrompts).toHaveBeenLastCalledWith([expect.objectContaining({ label: 'Select' })]);
```

Replace:

```tsx
  it('a link picks its item, and a new link moves it; Alloy Fusion is gone', () => {
    store().setProfile({ ...store().profile, bag: [item('h1', 'helm'), item('h2', 'helm')] });
    const { rerender } = render(<ForgeTab {...props({ link: { tab: 'forge', uid: 'h1' } })} />);
    expect(screen.getAllByTestId('temper-row').at(-2)).toHaveAttribute('aria-pressed', 'true');
    rerender(<ForgeTab {...props({ link: { tab: 'forge', uid: 'h2' } })} />);
    expect(screen.getAllByTestId('temper-row').at(-1)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('bench-fuse')).toBeNull();
    expect(screen.queryByTestId('fuse-bench')).toBeNull();
  });
```

with:

```tsx
  it('a link picks its bench and item: an item opens Temper, and a new link moves them', () => {
    store().setProfile({ ...store().profile, bag: [item('h1', 'helm'), item('h2', 'helm')] });
    const { rerender } = render(<ForgeTab {...props({ link: { tab: 'forge', uid: 'h1' } })} />);
    expect(screen.getByTestId('bench-temper')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('temper-row').at(-2)).toHaveAttribute('aria-pressed', 'true');
    rerender(<ForgeTab {...props({ link: { tab: 'forge', uid: 'h2' } })} />);
    expect(screen.getAllByTestId('temper-row').at(-1)).toHaveAttribute('aria-pressed', 'true');
    rerender(<ForgeTab {...props({ link: { tab: 'forge', bench: 'forge' } })} />);
    expect(screen.getByTestId('bench-forge')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('pattern-list')).toBeInTheDocument();
  });
```

Replace:

```tsx
    const { unmount } = render(<ForgeTab {...props()} />);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('forge and salvage between dives');
    expect(screen.queryByTestId('upgrade-button')).toBeNull();
    expect(screen.getByTestId('rune-fuse-split-1')).toBeDisabled();
```

with:

```tsx
    const p = props();
    const { unmount } = render(<ForgeTab {...p} />);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('forge and salvage between dives');
    expect(screen.queryByTestId('forge-button')).toBeNull();
    expect(p.setPrompts).toHaveBeenLastCalledWith([expect.objectContaining({ label: 'Select' })]);
    fireEvent.click(screen.getByTestId('bench-temper'));
    expect(screen.getByTestId('forge-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-button')).toBeNull();
    expect(screen.getByTestId('rune-fuse-split-1')).toBeDisabled();
    expect(screen.getByTestId('refine-metal-rusty')).toBeDisabled();
```

Replace:

```tsx
  it('the rune pane fuses three of a rune into one of the next tier, for scrap', () => {
```

with:

```tsx
  it("the Materials pane's runes fuse three of a rune into one of the next tier, for scrap", () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx)`
Expected: FAIL, 3 failed | 1 passed: "opens on the Forge bench; …" (`Unable to find an accessible element with the role "tablist" and name "Bench"`), "a link picks its bench and item: …" and "mid-dive, and in the pause, …" (`Unable to find an element by: [data-testid="bench-temper"]`).

- [ ] **Step 3: The tab**

Overwrite `packages/client/src/features/delve/hub/forge/ForgeTab.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { findItem, GEAR_SLOTS, isDiveActive } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Panel, Tabs } from '../../kit';
import type { HubLink, HubTabProps } from '../types';
import { ForgeBench, ForgeLocked, SELECT_PROMPT } from './ForgeBench';
import { GearList } from './GearList';
import { MaterialsPane } from './MaterialsPane';
import { Temper } from './Temper';

type Bench = 'forge' | 'temper';

const forgeLink = (l?: HubLink) => (l?.tab === 'forge' ? l : null);
/** A link's bench: its own, else Temper for an item ("Forge it ›" from the Loadout), else the Forge. */
const benchOf = (l?: HubLink): Bench =>
  forgeLink(l)?.bench ?? (forgeLink(l)?.uid ? 'temper' : 'forge');

/**
 * The Forge tab: two benches (a sub tab, LT/RT), each in three panes. The Forge
 * bench forges a new item from a pattern; the Temper bench works on the item
 * picked in the gear list; the Materials pane sits beside both.
 * `{ tab: 'forge', uid, bench }` links pick the item and the bench. Locked
 * while a dive is under way (the hub disables the tab in the pause).
 */
export function ForgeTab({ mode, setPrompts, link }: HubTabProps) {
  const profile = useDelveStore((s) => s.profile);
  const [selected, setSelected] = useState<string | null>(forgeLink(link)?.uid ?? null);
  const [bench, setBench] = useState<Bench>(benchOf(link));
  // A new link picks its item and bench.
  const [seen, setSeen] = useState(link);
  if (link !== seen) {
    setSeen(link);
    const to = forgeLink(link);
    if (to) {
      if (to.uid) setSelected(to.uid);
      setBench(benchOf(to));
    }
  }

  const locked = mode === 'pause' || isDiveActive(profile);
  // The Forge bench sets its own prompts (Enter forges); Temper and the lock show Select.
  useEffect(() => {
    if (bench === 'temper' || locked) setPrompts([SELECT_PROMPT]);
  }, [bench, locked, setPrompts]);

  const equipped = GEAR_SLOTS.flatMap((s) => profile.equipped[s] ?? []);
  // The selected item, or (none yet, or salvaged away) the first one worn.
  const item = (selected && findItem(profile, selected)?.item) || equipped[0] || null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-8 py-6" data-testid="forge-panel">
      <Tabs
        aria-label="Bench"
        level="sub"
        size="md"
        value={bench}
        onChange={(b) => {
          playSound('buttonClick');
          setBench(b);
        }}
        tabs={[
          { id: 'forge', label: 'Forge', testId: 'bench-forge' },
          { id: 'temper', label: 'Temper', testId: 'bench-temper' },
        ]}
      />
      <div
        className="grid min-h-0 flex-1 gap-6"
        style={{
          gridTemplateColumns: '430px minmax(0, 1fr) 470px',
          gridTemplateRows: 'minmax(0, 1fr)',
        }}
      >
        {bench === 'forge' ? (
          <ForgeBench locked={locked} setPrompts={setPrompts} />
        ) : (
          <>
            <GearList
              equipped={equipped}
              bag={profile.bag}
              selected={item?.uid ?? null}
              onSelect={(uid) => {
                playSound('orbSelect');
                setSelected(uid);
              }}
            />
            <Panel aria-label="Temper" testId="temper-bench">
              {locked ? <ForgeLocked /> : item && <Temper key={item.uid} item={item} />}
            </Panel>
          </>
        )}
        <MaterialsPane locked={locked} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run them to see them pass, then the client and its build**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge)`
Expected: PASS, 27 tests in 5 files.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1182 tests in 148 files**, of which the two AnvilHub tests of X1 fail with `refineCost: not implemented` until B2 merges (1180 pass); with B2 merged all 1182 pass.

Run: `(pnpm -F @alloy/client build)`
Expected: `tsc -b` silent, then Vite's `✓ built in …`.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c2
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/forge/ForgeTab.tsx src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx)
git add packages/client/src/features/delve/hub/forge/ForgeTab.tsx packages/client/src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx
git commit -m "feat(client): the Forge tab's Forge and Temper benches beside the Materials pane" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

1. **Client suite and typecheck** after each task, as each Step 4 says: 1169 → 1172 → 1174 → 1182 tests, 146 → 148 files; after Task 4 the two AnvilHub tests of X1 fail until B2 merges, and pass after.
2. **Build:** `(pnpm -F @alloy/client build)` after Task 4.
3. **Format:** `(cd packages/client && npx prettier --check --end-of-line auto src/features/delve/hub/forge)` reads "All matched files use Prettier code style!".
4. **After B2 merges (the integrator, with X2 and X3):** the client suite whole; the Delve E2E on `desktop` and `desktop-1080` (D04, D10, R04, R05 among them) and the responsive probes; and by hand at the Anvil: a new save forges an uncommon from the cuirass pattern, a Rusty bar and its flux; Enter forges with the mouse, A on the focused Forge button with a pad; LT/RT switch the benches; the shard picker's Back (Esc or B) returns to the forge; a forged legendary plays the fanfare once, with "New codex entry!" the first time.
