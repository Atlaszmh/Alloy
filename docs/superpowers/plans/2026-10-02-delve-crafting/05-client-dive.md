# Delve component crafting (stage 4c) · C1: arena and dive (client) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dive's side of the materials economy in the client: material drops drawn on the floor as small pixel pickups coloured by kind (bars by metal, flux by grade, shards by affix family, essences legendary orange, Mana Dust cyan, Links teal) that trail pixels as the magnet pulls them in, with a plaque only for gear, runes and essences; banking on every material and scrap pickup, so the purse and the Found log show the floor's haul as it grows; the purse's scrap, Links, Mana Dust and a materials total, each with this dive's gain (haul + banked) and a tooltip listing the materials; the Found log grouping materials ("Iron bar ×3") above gear and essences; the stop's "Found this floor" grouped, the risk line "Banked this dive · dying loses 40% of it" from `crafting.deathLoss`, and each door's loot multipliers; the pause's "Abandon · counts as a death" and the floor restart's note; an abandon that settles the dive and shows the summary; the summary's "Brought home" and "Lost".

**Architecture:** One client helper, `features/delve/materials/material-style.ts`, names and colours every material from the engine's data (`crafting.json`'s metals, the affix labels and families, the legendary names, the rune families) and lists a haul (`haulRows`, `materialCount`, `runeCount`); `materials/HaulList.tsx` draws such a list. The renderer draws `'material'` drops (`drawMaterial`) and keeps each drop's last position for the trail. `useArena` banks on material and scrap pickups (`banksNow`), hands the floor's haul to the page with the clear (`cleared.haul`), and keys the arena by `diveWorldKey`, which a settled dive leaves. `DelveRun` keeps the last clear's haul for the stop, and an abandon settles the dive there (`settleDive(registry, profile, 'abandon')`) so the summary can show what it lost. Every number shown is the engine's: the haul, the banked, the lost, the door's mods, `deathLoss`. No store change, no engine change.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, PixiJS 8, Vitest 3 (jsdom, Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-delve-component-crafting-design.md`: "Arena and pickups", "The client" (Arena HUD, Stop, Dive summary, Pause), "Banking and death" (S1–S3, S9's risk line), "Doors", "Phases and parallel areas" (the C1 row). The overview is `00-overview.md` in this folder; the contract is `01-contract.md` (Phase A).

---

## Base

- **Starts from:** `craft/main` at `a53a85f` (Phase A merged: its tree is `craft/a` at `8612e6a`), in this area's worktree `C:/Projects/alloy-craft-c1` on branch `craft/c1`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-craft-c1 -Branch craft/c1 -Base craft/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-craft-c1` in Git Bash.
- **Needs nothing from B to build and pass its unit tests.** Phase A's stubs are enough: the unit tests build their hauls with Phase A's `emptyHaul` / `addMaterial` and mock `settleDive` (B1's stub throws until B1 lands). Task 10's E2E needs B1 merged (real material drops, banking and the settle); see Verification.
- **Anchors:** every edit was generated from, and checked against, `a53a85f`: applied in this plan's order, task by task, they give exactly the files every FAIL, PASS, suite and typecheck below ran on (see "Checked on a scratch copy").
- **Before Task 1:** build the engine once for the client's junction, and measure the client:

```bash
cd /c/Projects/alloy-craft-c1
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the suite reads **1169 tests in 146 files** at `a53a85f`. Call them **M** tests in **G** files; each task says where they go. The end state is **M + 12 tests in G + 2 files**.

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/materials/material-style.ts` (new) | `METAL_COLOR`, `AFFIX_FAMILY_COLOR`, `DUST_COLOR`, `LINKS_COLOR`, `SCRAP_COLOR`; `materialColor`, `materialLabel` (from the data); `HaulRow`, `haulRows` (a haul's or a pouch's entries, grouped: material, essence, rune, currency); `materialCount`, `runeCount` |
| `packages/client/src/features/delve/materials/HaulList.tsx` (new) | a haul's rows as swatch, name and count (the purse's tooltip, the summary) |
| `packages/client/src/features/delve/__tests__/material-style.test.ts` (new) | names, colours, the rows' order, the counts |
| `packages/client/src/features/delve/arena/ArenaRenderer.ts` | `drawMaterial` (a pixel pickup per kind, trailing 3 pixels while it moves); `drawDrop`'s `moved`; `DropView`'s last position; an essence's plaque (legendary orange, always) and stillness; a material pickup's sparkle colour |
| `packages/client/src/features/delve/__tests__/arena-renderer.test.ts` | the materials on the floor |
| `packages/client/src/features/delve/arena/useArena.ts` | `banksNow` (bank on material and scrap pickups); `cleared.haul`; `diveWorldKey` (a settled dive keeps no world) |
| `packages/client/src/features/delve/__tests__/arena-bank.test.ts` (new) | `banksNow`, `diveWorldKey` |
| `packages/client/src/features/delve/arena/hud/PurseBar.tsx` | gains from `addHaul(haul, banked)`; the materials entry (the kit's anvil glyph) and its tooltip (`MaterialsCard`); runes counted by `runeCount` |
| `packages/client/src/features/delve/arena/hud/__tests__/HudGrid.test.tsx` | the purse's gains and the materials tooltip |
| `packages/client/src/features/delve/arena/hud/FoundLog.tsx` | the floor's haul: materials above the items, essences below them (`HaulFeedRow`) |
| `packages/client/src/features/delve/arena/hud/__tests__/FoundLog.test.tsx` | the grouping |
| `packages/client/src/features/delve/stop/StopScreen.tsx` | `haul` prop; materials and currencies above the items, essences below (`HaulStopRow`); "N materials" in the counts; the risk line |
| `packages/client/src/features/delve/stop/DoorPane.tsx` | `doorLoot` (the door's loot multipliers, from its mods) in each door's aside |
| `packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx` | the haul, the risk line, the doors' loot |
| `packages/client/src/features/delve/DiveSummary.tsx` | "ABANDONED"; "Brought home" (`dive.banked`) and "Lost" (`dive.lost`) replace the Dust, Links and runes lines |
| `packages/client/src/features/delve/__tests__/DiveSummary.test.tsx` | the outcomes and the two lists |
| `packages/client/src/features/delve/hub/PauseScreen.tsx` | "Abandon · counts as a death"; the floor restart's note "This floor's unbanked haul is lost" |
| `packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx` | the labels |
| `packages/client/src/pages/DelveRun.tsx` | the last clear's haul to the stop (Task 6); an abandon settles the dive and shows the summary, the stop gives way to it (Task 9) |
| `packages/client/src/pages/__tests__/DelveRun.test.tsx` | the abandon (`settleDive` mocked) |
| `packages/client/e2e/delve.spec.ts` | D02's abandon, D03's risk line, D08 (Task 10, after B1) |

`delveStore.ts` is not edited: Phase A's store already passes the registry to `closeDive`, and `RESET_NOTICE` is a notice like any other (the Delve pages' toasts show it). No kit change: the materials entry uses the kit's existing `anvil` glyph.

## Cross-area needs

**X1 · B1 (`delve/dive.ts`: `settleDive`, `closeDive`).** The abandon and the summary read these, as the spec describes them; please keep them so:
1. `settleDive` is a no-op on a dive already `settled` (the spec's "exactly once per dive"): `DelveRun` settles an abandon itself, then `closeDive` (Return to the Anvil, Dive again) runs on the settled dive.
2. `settleDive(…, 'abandon')` leaves `dive.phase` as it is (`fighting` or `choosing`) and sets `settled: true`: the summary reads a settled dive that is neither `dead` nor `extracted` as abandoned (`diveWorldKey` and `DelveRun`'s `finished` read `settled`).
3. After a settle, **`dive.banked` is what reached the stockpile** (net of the loss) and **`dive.lost` is everything lost** (the floor's haul plus the share), so the summary's "Brought home" lists `banked` and "Lost" lists `lost`; an extract leaves `lost` null. If B1 keeps `banked` gross instead, the summary needs one change: "Brought home" from the engine's net figure (say `settleDive` returning it, or a `dive.kept`), never a client subtraction.
4. Material pickups land in `dive.haul` when `bankWorld` runs (the spec), each `pickup` event of one carrying `dropKind: 'material'` and its `material`; scrap pickups keep `dropKind: 'scrap'`. `banksNow` banks on those events.
5. `WorldPending` keeps `items`, `reactions` and `runes` (`banksNow` reads them), and `BankResult.runes` / `FloorResult.runes` keep listing the runes picked up (the store's `diveRunes` names them in the Found log and at the stop). If B1 moves runes into a pending haul, tell C1: the two reads change to it.
6. `completeFloor` moves the floor's haul into `banked` (the spec): `useArena` reads `dive.haul` just before it, so the stop's list is that floor's.

**X2 · C2 and C3 (shared names).** `features/delve/materials/material-style.ts` names and colours every material from the data (`materialLabel`, `materialColor`, `haulRows`, `materialCount`). C2's plan writes its own `materialLabel` in `hub/forge/materials-text.ts`; this one writes exactly the same strings ("Iron bar", "Magic flux", "Crit Chance II", "Damage % I", "Twin Fang essence", "Mana Dust", "Links"), so after both merge the integrator may point one at the other (one line, either way). C3's Codex can import either.

**X3 · The integrator.**
1. `e2e/delve.spec.ts` is not in the spec's C1 row, but its D02 presses "Abandon · lose bounty" and its D03 reads "Already banked…", both of which this area changes: Task 10 updates them and adds D08. No other area should edit those two tests.
2. D02 waits for a gear drop in the first floor's Found log; after B1 normal foes drop no gear, so D02 may need an elite or a seeded bag item (B1's or D's call, not this area's).
3. C2's X3 adds its forging E2E "after D09"; this plan adds only D08 (before D06, after D07), so that test goes after D08.
4. The version bump (v0.58.0) is Phase D's.

## Where the spec left room

1. **The stop's "Found this floor" materials.** A clear moves the floor's haul into `banked`, so at the stop `dive.haul` is empty. `useArena` reads `dive.haul` just before `completeFloor` and hands it to the page with the `cleared` event; `DelveRun` keeps it in state and passes it to `StopScreen` (`haul`). It is session-only, like the store's `diveDrops`: after a reload at the stop, the stop lists the floor's items and runes but not its materials.
2. **Abandon shows the summary.** The spec's dive summary shows what a death *or an abandon* lost, but `closeDive` clears the dive record (and with it `dive.lost`). So the pause's Abandon settles the dive in `DelveRun` (`settleDive(registry, profile, 'abandon')`, the engine's op), the summary shows "ABANDONED" with its losses, and Return to the Anvil / Dive again close it as before. `useArena`'s `diveWorldKey` drops a settled dive's key, so Dive again at the same depth after a mid-floor abandon starts a fresh floor (the key changes null → `fighting:1`).
3. **The purse's gains** are `addHaul(dive.haul, dive.banked)` for scrap, Links, Mana Dust, materials (bars, flux, shards, essences) and runes; the bag's stays the items found. The scrap's gain is no longer the bounty (in amber): the bounty keeps its own "+N banks on extract". Held amounts are the stockpile's (`profile`), which a dive no longer touches until it settles.
4. **The materials tooltip** lists this dive's materials and essences (haul + banked) and the Anvil's stock (`profile.materials`), each as `HaulList` rows; Mana Dust, Links, scrap and runes have their own purse entries.
5. **Grouping.** The Found log: materials (bars, flux, shards), then the items newest first, then essences (legendary orange), then runes; Mana Dust, Links and scrap are the purse's. The stop: materials and currencies (Mana Dust, Links, scrap pickups) above the items, essences below them, then runes; the counts gain "N materials" (bars, flux, shards and essences).
6. **Plaques:** among materials only an essence gets one ("Twin Fang essence" in legendary orange, always shown); runes and gear keep theirs. An essence lies still like an item; whether it magnets is B1's (the spec: walk-over).
7. **The magnet fly-in** is the engine's motion (`dropsTick`); the renderer adds a trail: each drop's view remembers last frame's position, and a material that moved draws three fading pixels behind it. Bars, flux, shards, Dust and Links bob like motes; the colours are client styling (ENDESGA-leaning), not game numbers.
8. **Door multipliers** show as lines under each door's depth ("Materials ×1.3", "Runes ×0.5", "Flux ×1.5", "Essences ×1.5", "Find +75%", "Tier up 35%"), straight from `door.mods` (`doorLoot`); a multiplier of 1 or none is left out. The door's text (data) already words them.
9. **The floor restart's note** is a caption inside the button ("This floor's unbanked haul is lost"), in body text, not the button's display caps; "Anvil · back to this stop" has none (nothing is lost there).
10. **The summary's lists** replace the "from salvage" Dust, Links and runes lines (all of them now ride the haul): "Brought home" always shows ("Nothing" when empty), "Lost" only when something was; each scrolls past 240 design px. The scrap earned line goes with them (scrap pickups are in the lists).
11. **Banking on every material pickup** writes the save once per frame that picks one up (the store's `setProfile`), as an item pickup does today: a floor's few dozen pickups cost a few JSON writes a second at most. If it ever shows in a profile, bank once per HUD tick instead.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `craft/c1`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-craft-c1`.
- **Line endings:** keep each file's own (the Edit tool does); new files are LF. Prettier runs as `npx prettier --end-of-line auto`. Every file this plan edits passed `prettier --check` at `a53a85f`, and the code below is already formatted, so the commit blocks' `--write` changes nothing typed as written.
- **How the edits read** (the 4a plan's language): "Replace: A with: B" is one Edit (old A, new B). "Create `f`:" is a Write. Within a file, apply its edits top to bottom; every anchor is unique in its file at that point.
- **Every task runs the client suite and its typecheck** (about 30 s). Vitest doesn't type-check tests.
- **Checked on a scratch copy:** `git archive` of `craft/a` at `8612e6a` (the tree of `a53a85f`) with junctioned `node_modules` and the engine built; every task's edits applied in order, each anchor checked unique at its point and the result checked byte-identical (line endings aside) to the files every FAIL, PASS, suite, typecheck and `prettier --check` below ran on; the client build passed at the end.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(pnpm -F @alloy/client build)` |
| E2E (Task 10) | `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts --project=desktop)` |

---

## Chunk 1: Material names and colours; the floor

### Task 1: `material-style.ts` and `HaulList`

The one place the client names and colours a material, from the data, and lists a haul.

**Files:**
- Create: `packages/client/src/features/delve/materials/material-style.ts`, `packages/client/src/features/delve/materials/HaulList.tsx`, `packages/client/src/features/delve/__tests__/material-style.test.ts`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/__tests__/material-style.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { addMaterial, emptyHaul, emptyMaterials, type MaterialRef } from '@alloy/engine';
import {
  AFFIX_FAMILY_COLOR,
  DUST_COLOR,
  METAL_COLOR,
  haulRows,
  materialColor,
  materialCount,
  materialLabel,
  runeCount,
} from '../materials/material-style';
import { RARITY_COLOR } from '../format';
import { getDelveRegistry } from '../registry';

const registry = getDelveRegistry();
const iron: MaterialRef = { kind: 'metal', metal: 'iron' };
const crit: MaterialRef = { kind: 'shard', stat: 'critChance', tier: 2 };
const fang: MaterialRef = { kind: 'essence', essence: 'twin_fang' };

describe('the materials as the client shows them', () => {
  it('names each kind from the data', () => {
    expect(materialLabel(registry, iron)).toBe('Iron bar');
    expect(materialLabel(registry, { kind: 'flux', grade: 'magic' })).toBe('Magic flux');
    expect(materialLabel(registry, crit)).toBe('Crit Chance II');
    // Two affixes share "Damage": the percent one's shard says so.
    expect(materialLabel(registry, { kind: 'shard', stat: 'damagePct', tier: 1 })).toBe(
      'Damage % I',
    );
    expect(materialLabel(registry, fang)).toBe('Twin Fang essence');
    expect(materialLabel(registry, { kind: 'dust' })).toBe('Mana Dust');
  });

  it('colours a bar by its metal, a flux by its grade, a shard by its family, an essence legendary', () => {
    expect(materialColor(registry, iron)).toBe(METAL_COLOR.iron);
    expect(materialColor(registry, { kind: 'flux', grade: 'rare' })).toBe(RARITY_COLOR.rare);
    expect(materialColor(registry, crit)).toBe(AFFIX_FAMILY_COLOR.offense);
    expect(materialColor(registry, fang)).toBe(RARITY_COLOR.legendary);
    expect(materialColor(registry, { kind: 'dust' })).toBe(DUST_COLOR);
  });

  it("lists a haul's entries above zero in order: materials, essences, runes, then the currencies", () => {
    let haul = addMaterial(emptyHaul(), { kind: 'dust' }, 4);
    haul = addMaterial(haul, fang);
    haul = addMaterial(haul, crit, 2);
    haul = addMaterial(haul, { kind: 'flux', grade: 'magic' });
    haul = addMaterial(haul, iron, 3);
    haul = { ...haul, scrap: 30, runes: { split: [0, 0, 1, 0, 0] } };
    expect(haulRows(registry, haul).map((r) => [r.group, r.name, r.count])).toEqual([
      ['material', 'Iron bar', 3],
      ['material', 'Magic flux', 1],
      ['material', 'Crit Chance II', 2],
      ['essence', 'Twin Fang essence', 1],
      ['rune', 'Split III', 1],
      ['currency', 'Scrap', 30],
      ['currency', 'Mana Dust', 4],
    ]);
    expect(haulRows(registry, emptyHaul())).toEqual([]);
    expect(materialCount(haul)).toBe(7);
    expect(runeCount({ split: [0, 0, 1, 0, 0], quick: [2, 1, 0, 0, 0] })).toBe(4);
    // A pouch lists the same way.
    expect(haulRows(registry, { ...emptyMaterials(), essences: { twin_fang: 2 } })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/material-style.test.ts)`
Expected: FAIL, no tests: `Failed to resolve import "../materials/material-style" from "src/features/delve/__tests__/material-style.test.ts". Does the file exist?`

- [ ] **Step 3: The helper and the list**

Create `packages/client/src/features/delve/materials/material-style.ts`:

```ts
import {
  FLUX_GRADES,
  METAL_IDS,
  type AffixFamily,
  type DataRegistry,
  type Haul,
  type HeroStatKey,
  type MaterialRef,
  type MaterialsPouch,
  type MetalId,
  type RunePouch,
  type RuneTier,
} from '@alloy/engine';
import { RARITY_COLOR, RARITY_LABEL } from '../format';
import { FAMILY_STYLE, TIER_NUMERAL, runeName } from '../runes/rune-style';

/** Each metal's colour (its bars on the floor, its swatches), rust up to void. */
export const METAL_COLOR: Record<MetalId, string> = {
  rusty: '#b86f50',
  iron: '#8b9bb4',
  steel: '#c0cbdc',
  mithril: '#a8e6f0',
  adamant: '#3e8948',
  starforged: '#fee761',
  voidforged: '#8f5ac8',
};

/** Each affix family's colour: a shard wears its affix's. */
export const AFFIX_FAMILY_COLOR: Record<AffixFamily, string> = {
  offense: '#e43b44',
  defense: '#0099db',
  sustain: '#63c74d',
  utility: '#feae34',
  element: '#b07cff',
};

export const DUST_COLOR = '#2ce8f5';
export const LINKS_COLOR = '#1fb5a8';
export const SCRAP_COLOR = '#fcd34d';

const numeral = (tier: number) => TIER_NUMERAL[tier as RuneTier] ?? String(tier);

/**
 * A material's colour: a bar its metal's, a flux its grade's rarity, a shard its affix family's,
 * an essence legendary orange, Mana Dust cyan and Links teal.
 */
export function materialColor(registry: DataRegistry, ref: MaterialRef): string {
  switch (ref.kind) {
    case 'metal':
      return METAL_COLOR[ref.metal];
    case 'flux':
      return RARITY_COLOR[ref.grade];
    case 'shard':
      return AFFIX_FAMILY_COLOR[registry.getCraftingData().families[ref.stat]];
    case 'essence':
      return RARITY_COLOR.legendary;
    case 'dust':
      return DUST_COLOR;
    case 'links':
      return LINKS_COLOR;
  }
}

/** An affix's label; "Damage %" where a flat affix shares it (as the Forge tab writes it). */
function affixLabel(registry: DataRegistry, stat: HeroStatKey): string {
  const def = registry.getGearAffix(stat);
  if (!def) return stat;
  const shared = registry
    .getDelveData()
    .affixes.some((a) => a.stat !== stat && a.label === def.label);
  return shared && def.unit === 'pct' ? `${def.label} %` : def.label;
}

/**
 * A material's name, as the Forge tab writes it: "Iron bar", "Magic flux", "Crit Chance II",
 * "Twin Fang essence", "Mana Dust", "Links".
 */
export function materialLabel(registry: DataRegistry, ref: MaterialRef): string {
  switch (ref.kind) {
    case 'metal':
      return `${registry.getCraftingData().metals.find((m) => m.id === ref.metal)?.name ?? ref.metal} bar`;
    case 'flux':
      return `${RARITY_LABEL[ref.grade]} flux`;
    case 'shard':
      return `${affixLabel(registry, ref.stat)} ${numeral(ref.tier)}`;
    case 'essence':
      return `${registry.getLegendary(ref.essence).name} essence`;
    case 'dust':
      return 'Mana Dust';
    case 'links':
      return 'Links';
  }
}

/** One line of a haul: what it is, its colour and how many. */
export interface HaulRow {
  key: string;
  /** A bar, flux or shard; an essence; a rune; or scrap, Mana Dust or Links. */
  group: 'material' | 'essence' | 'rune' | 'currency';
  name: string;
  color: string;
  count: number;
}

/**
 * A haul's (or a pouch's) entries above zero, grouped and in order: bars, flux, shards,
 * essences, runes, then scrap, Mana Dust and Links.
 */
export function haulRows(registry: DataRegistry, haul: MaterialsPouch & Partial<Haul>): HaulRow[] {
  const rows: HaulRow[] = [];
  const add = (ref: MaterialRef, count = 0, group: HaulRow['group'] = 'material') => {
    if (count > 0)
      rows.push({
        key: JSON.stringify(ref),
        group,
        name: materialLabel(registry, ref),
        color: materialColor(registry, ref),
        count,
      });
  };
  for (const metal of METAL_IDS) add({ kind: 'metal', metal }, haul.metals[metal]);
  for (const grade of FLUX_GRADES) add({ kind: 'flux', grade }, haul.flux[grade]);
  for (const [stat, tiers] of Object.entries(haul.shards))
    tiers?.forEach((n, i) => add({ kind: 'shard', stat: stat as HeroStatKey, tier: i + 1 }, n));
  for (const [essence, n] of Object.entries(haul.essences))
    add({ kind: 'essence', essence }, n, 'essence');
  for (const [id, tiers] of Object.entries(haul.runes ?? {})) {
    const def = registry.findRune(id);
    tiers.forEach((n, i) => {
      if (!def || n <= 0) return;
      const rune = { id, tier: (i + 1) as RuneTier };
      const name = runeName(registry, rune);
      rows.push({
        key: `rune:${id}:${rune.tier}`,
        group: 'rune',
        name,
        color: FAMILY_STYLE[def.family].color,
        count: n,
      });
    });
  }
  if (haul.scrap)
    rows.push({
      key: 'scrap',
      group: 'currency',
      name: 'Scrap',
      color: SCRAP_COLOR,
      count: haul.scrap,
    });
  add({ kind: 'dust' }, haul.dust, 'currency');
  add({ kind: 'links' }, haul.links, 'currency');
  return rows;
}

const total = (xs: (number | undefined)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

/** How many materials a pouch or a haul holds: bars, flux, shards and essences. */
export function materialCount(m: MaterialsPouch): number {
  return total([
    ...Object.values(m.metals),
    ...Object.values(m.flux),
    ...Object.values(m.shards).flat(),
    ...Object.values(m.essences),
  ]);
}

/** How many runes a rune pouch holds, every tier. */
export function runeCount(pouch: RunePouch): number {
  return total(Object.values(pouch).flat());
}
```

Create `packages/client/src/features/delve/materials/HaulList.tsx`:

```tsx
import type { ReactElement } from 'react';
import { formatNumber } from '../format';
import type { HaulRow } from './material-style';

/** A haul's rows: each a swatch in its colour, its name and its count; `struck` crosses the names out. */
export function HaulList({
  rows,
  struck = false,
}: {
  rows: readonly HaulRow[];
  struck?: boolean;
}): ReactElement {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2 text-[14px]" data-testid="haul-row">
          <span aria-hidden className="size-[10px] flex-none" style={{ background: r.color }} />
          <span className={struck ? 'line-through' : undefined}>{r.name}</span>
          <b className="ml-auto pl-3">×{formatNumber(r.count)}</b>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/material-style.test.ts)`
Expected: PASS, 3 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 3 tests in G + 1 files pass (**1172 in 147** at the base's counts).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/materials/material-style.ts src/features/delve/materials/HaulList.tsx src/features/delve/__tests__/material-style.test.ts)
git add packages/client/src/features/delve/materials/material-style.ts packages/client/src/features/delve/materials/HaulList.tsx packages/client/src/features/delve/__tests__/material-style.test.ts
git commit -m "feat(client): material names, colours and haul lists from the crafting data" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: Material drops on the floor

Each material a small pixel pickup in its colour, trailing pixels as the magnet pulls it; an essence lies still under its pillar with a legendary-orange plaque; a material's pickup sparkles its colour.

**Files:**
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts`
- Modify (tests): `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`:

Replace:

```ts
import { attachKeyboard, createArenaInput } from '../arena/input';
import { RARITY_TEXT } from '../format';
import { runeHex } from '../arena/fx/runes';
import { getDelveRegistry } from '../registry';
```

with:

```ts
import { attachKeyboard, createArenaInput } from '../arena/input';
import { RARITY_TEXT } from '../format';
import { DUST_COLOR, METAL_COLOR } from '../materials/material-style';
import { runeHex } from '../arena/fx/runes';
import { getDelveRegistry } from '../registry';
```

Replace:

```ts
});

describe('loot labels', () => {
  afterEach(() => vi.restoreAllMocks());
```

with:

```ts
});

describe('materials on the floor', () => {
  const iron = { kind: 'metal', metal: 'iron' } as const;
  const bar = drop({ kind: 'material', material: iron, amount: 2 });
  const ironHex = cssToHex(METAL_COLOR.iron);

  it('draw as small pickups in their colour, trailing three pixels while the magnet pulls them', () => {
    const still = recorder();
    drawDrop(still.g, bar, 1, 1);
    const fills = still.fills.filter((c) => c === ironHex).length;
    expect(fills).toBeGreaterThan(0);
    expect(still.fills).not.toContain(0xfcd34d); // not the scrap coin
    const flying = recorder();
    drawDrop(flying.g, bar, 1, 1, { dx: 0.3, dy: 0 });
    expect(flying.fills.filter((c) => c === ironHex)).toHaveLength(fills + 3);
    const dust = recorder();
    drawDrop(dust.g, drop({ kind: 'material', material: { kind: 'dust' } }), 1, 1);
    expect(dust.fills).toContain(cssToHex(DUST_COLOR));
  });

  it('only an essence is labelled, always, in legendary orange; a pickup sparkles its colour', () => {
    expect(dropPlaque(bar, false)).toBeNull();
    const essence = drop({ kind: 'material', material: { kind: 'essence', essence: 'twin_fang' } });
    expect(dropPlaque(essence, false)).toEqual({
      text: 'Twin Fang essence',
      color: cssToHex(RARITY_TEXT.legendary),
      always: true,
    });
    expect(
      pickupColor({ kind: 'pickup', dropId: 1, dropKind: 'material', amount: 2, material: iron }),
    ).toBe(ironHex);
  });
});

describe('loot labels', () => {
  afterEach(() => vi.restoreAllMocks());
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: FAIL, 2 failed | 15 passed: `expected 0 to be greater than 0` (no material is drawn) and `expected null to deeply equal { text: 'Twin Fang essence', …(2) }`.

- [ ] **Step 3: Draw them**

In `packages/client/src/features/delve/arena/ArenaRenderer.ts`:

Replace:

```ts
  type GearItem,
  type ManaType,
  type MonsterEntity,
  type Vec,
```

with:

```ts
  type GearItem,
  type ManaType,
  type MaterialRef,
  type MonsterEntity,
  type Vec,
```

Replace:

```ts
import { getDelveRegistry } from '../registry';
import { RARITY_TEXT } from '../format';
import { contextZoom } from '../kit/zoom';
import { useUIStore } from '@/stores/uiStore';
```

with:

```ts
import { getDelveRegistry } from '../registry';
import { RARITY_TEXT } from '../format';
import { materialColor, materialLabel } from '../materials/material-style';
import { contextZoom } from '../kit/zoom';
import { useUIStore } from '@/stores/uiStore';
```

Replace:

```ts
  gfx: Graphics;
  plaque: Plaque | null;
}

```

with:

```ts
  gfx: Graphics;
  plaque: Plaque | null;
  /** Where the drop was last frame: a magnet's pull shows as a trail. */
  x: number;
  y: number;
}

```

Replace:

```ts
      const age = w.t - d.born;
      const pop = dropPop(d, age);
      // Items and runes lie still, and so does a Seedling's rooted sprout.
      const still = d.kind === 'item' || d.kind === 'rune' || isSprout(d);
      const bob = still ? 0 : Math.sin(this.time * 5 + d.id) * 0.06;
      v.root.position.set(d.x, d.y - pop + bob);
      v.root.zIndex = d.y - 0.5;
      drawDrop(v.gfx, d, this.time, age);
      const plaque = v.plaque;
      if (plaque) {
```

with:

```ts
      const age = w.t - d.born;
      const pop = dropPop(d, age);
      // Items, runes and essences lie still, and so does a Seedling's rooted sprout.
      const still =
        d.kind === 'item' || d.kind === 'rune' || d.material?.kind === 'essence' || isSprout(d);
      const bob = still ? 0 : Math.sin(this.time * 5 + d.id) * 0.06;
      v.root.position.set(d.x, d.y - pop + bob);
      v.root.zIndex = d.y - 0.5;
      drawDrop(v.gfx, d, this.time, age, { dx: d.x - v.x, dy: d.y - v.y });
      v.x = d.x;
      v.y = d.y;
      const plaque = v.plaque;
      if (plaque) {
```

Replace:

```ts
    this.dropLayer.addChild(root);
    const named = dropPlaque(d, !!d.item && this.isUpgrade(d.item));
    return { root, gfx, plaque: named && this.makePlaque(named) };
  }

```

with:

```ts
    this.dropLayer.addChild(root);
    const named = dropPlaque(d, !!d.item && this.isUpgrade(d.item));
    return { root, gfx, plaque: named && this.makePlaque(named), x: d.x, y: d.y };
  }

```

Replace:

```ts

/**
 * A pickup's sparkle: the item's rarity, a rune's family, else the drop's
 * mana (a mote, a Seedling orb), else red.
 */
export function pickupColor(e: Extract<ArpgEvent, { kind: 'pickup' }>): number {
  if (e.item) return RARITY_HEX[e.item.rarity];
  if (e.rune) return runeHex(e.rune);
  if (e.mana) return MANA_HEX[e.mana];
  return e.dropKind === 'orb' ? 0xf87171 : 0xffffff;
```

with:

```ts

/**
 * A pickup's sparkle: the item's rarity, a rune's family, a material's
 * colour, else the drop's mana (a mote, a Seedling orb), else red.
 */
export function pickupColor(e: Extract<ArpgEvent, { kind: 'pickup' }>): number {
  if (e.item) return RARITY_HEX[e.item.rarity];
  if (e.rune) return runeHex(e.rune);
  if (e.material) return cssToHex(materialColor(getDelveRegistry(), e.material));
  if (e.mana) return MANA_HEX[e.mana];
  return e.dropKind === 'orb' ? 0xf87171 : 0xffffff;
```

Replace:

```ts
 * A drop's loot label (decided item 22): an item's name in its rarity's text
 * colour, with ▲ when it is an upgrade as it comes, or a rune's name and tier
 * ("Split III") in its family's. Rare and up, runes and upgrades always show;
 * anything else only while every label does. Null for drops that aren't loot.
 */
export function dropPlaque(
```

with:

```ts
 * A drop's loot label (decided item 22): an item's name in its rarity's text
 * colour, with ▲ when it is an upgrade as it comes, or a rune's name and tier
 * ("Split III") in its family's, or an essence's name in legendary orange.
 * Rare and up, runes, essences and upgrades always show; anything else only
 * while every label does. Null for drops that aren't loot, and for every other
 * material (bars, flux, shards, Mana Dust and Links fly in unlabelled).
 */
export function dropPlaque(
```

Replace:

```ts
    };
  }
  const def = d.rune ? getDelveRegistry().findRune(d.rune.id) : undefined;
  if (!d.rune || !def) return null;
```

with:

```ts
    };
  }
  if (d.material?.kind === 'essence')
    return {
      text: materialLabel(getDelveRegistry(), d.material),
      color: cssToHex(RARITY_TEXT.legendary),
      always: true,
    };
  const def = d.rune ? getDelveRegistry().findRune(d.rune.id) : undefined;
  if (!d.rune || !def) return null;
```

Replace:

```ts
 * A drop's look, `age` seconds after it fell. A Seedling's orb (nature) is a
 * sprout that grows in; a mote wears its mana's colour (a Siphon's is violet).
 */
export function drawDrop(g: Graphics, d: Drop, time: number, age: number): void {
  g.clear();
  if (d.kind === 'item' && d.item) {
```

with:

```ts
 * A drop's look, `age` seconds after it fell. A Seedling's orb (nature) is a
 * sprout that grows in; a mote wears its mana's colour (a Siphon's is violet).
 * `moved` is how far it went since the last frame (a material trails it).
 */
export function drawDrop(
  g: Graphics,
  d: Drop,
  time: number,
  age: number,
  moved?: { dx: number; dy: number },
): void {
  g.clear();
  if (d.kind === 'item' && d.item) {
```

Replace:

```ts
    for (let i = 0; i < d.rune.tier; i++)
      g.rect(-0.15 + i * 0.07, -0.16, 0.04, 0.1).fill({ color });
  } else if (d.kind === 'orb') {
    g.circle(0, 0, 0.32).fill({ color: 0xef4444, alpha: 0.25 });
```

with:

```ts
    for (let i = 0; i < d.rune.tier; i++)
      g.rect(-0.15 + i * 0.07, -0.16, 0.04, 0.1).fill({ color });
  } else if (d.kind === 'material' && d.material) {
    drawMaterial(g, d.material, time + d.id, moved);
  } else if (d.kind === 'orb') {
    g.circle(0, 0, 0.32).fill({ color: 0xef4444, alpha: 0.25 });
```

Replace:

```ts
}

function lighten(color: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + 60);
```

with:

```ts
}

/**
 * A material on the floor: a small pickup in its colour, whole sprite pixels (0.1 units) — a
 * bar, a flux vial, a shard, an essence glowing under its pillar, Mana Dust's motes or a Link —
 * trailing three fading pixels while the magnet pulls it in.
 */
function drawMaterial(
  g: Graphics,
  ref: MaterialRef,
  phase: number,
  moved?: { dx: number; dy: number },
): void {
  const color = cssToHex(materialColor(getDelveRegistry(), ref));
  const px = (x: number, y: number, w = 1, h = 1, c = color, alpha = 1) =>
    g.rect(x * 0.1, y * 0.1, w * 0.1, h * 0.1).fill({ color: c, alpha });
  g.ellipse(0, 0.1, 0.22, 0.08).fill({ color: 0x000000, alpha: 0.35 });
  switch (ref.kind) {
    case 'metal':
      px(-2, -2, 4, 2);
      px(-2, -2, 4, 1, 0xffffff, 0.35);
      break;
    case 'flux':
      px(-1, -4, 2, 1, 0xc0cbdc);
      px(-1, -3, 2, 3);
      break;
    case 'shard':
      px(-1, -3, 2, 1);
      px(-2, -2, 4, 1);
      px(-1, -1, 2, 1);
      px(-1, -3, 1, 1, 0xffffff, 0.5);
      break;
    case 'essence': {
      const flicker = 0.75 + Math.sin(phase * 3) * 0.25;
      g.rect(-0.15, -5, 0.3, 5).fill({ color, alpha: 0.12 * flicker });
      px(-1, -4, 2, 4);
      px(-2, -3, 4, 2);
      px(-1, -3, 1, 1, 0xffffff, 0.8);
      break;
    }
    case 'dust':
      px(-2, -1);
      px(1, -2);
      px(-1, -3);
      break;
    case 'links':
      px(-3, -2, 2, 2);
      px(1, -2, 2, 2);
      px(-1, -2, 2, 1);
      break;
  }
  const len = moved ? Math.hypot(moved.dx, moved.dy) : 0;
  if (!moved || len < 0.01) return;
  const [ux, uy] = [moved.dx / len, moved.dy / len];
  for (let i = 1; i <= 3; i++)
    px(-ux * 1.5 * i - 0.5, -uy * 1.5 * i - 1.5, 1, 1, color, 0.6 - 0.15 * i);
}

function lighten(color: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + 60);
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: PASS, 17 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1174 in 147**.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/ArenaRenderer.ts src/features/delve/__tests__/arena-renderer.test.ts)
git add packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/__tests__/arena-renderer.test.ts
git commit -m "feat(client): material drops as pixel pickups that trail as the magnet pulls them; essences labelled" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: Banking and the HUD

### Task 3: Bank on material pickups; the clear's haul; the arena key

The floor's haul shows as it grows only if every material and scrap pickup banks (`bankWorld` moves them into `dive.haul`); the clear hands the stop that haul before `completeFloor` moves it into `banked`; and a settled dive keeps no arena key, so a dive again after an abandon starts a fresh floor.

**Files:**
- Modify: `packages/client/src/features/delve/arena/useArena.ts`
- Create (tests): `packages/client/src/features/delve/__tests__/arena-bank.test.ts`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/__tests__/arena-bank.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createDelveProfile,
  startDive,
  type ArpgEvent,
  type ArpgWorld,
  type DropKind,
} from '@alloy/engine';
import { banksNow, diveWorldKey } from '../arena/useArena';
import { getDelveRegistry } from '../registry';

const world = (over: object = {}) =>
  ({
    pending: { items: [], scrap: 0, kills: 0, reactions: [], runes: [], ...over },
  }) as unknown as ArpgWorld;
const pickup = (dropKind: DropKind): ArpgEvent => ({
  kind: 'pickup',
  dropId: 1,
  dropKind,
  amount: 1,
});

describe("banking the dive's pickups", () => {
  it('banks a frame that picked up a material or scrap, or holds an item, a rune or a reaction', () => {
    expect(banksNow(world(), [pickup('material')])).toBe(true);
    expect(banksNow(world(), [pickup('scrap')])).toBe(true);
    expect(banksNow(world({ runes: [{ id: 'split', tier: 1 }] }), [])).toBe(true);
    expect(banksNow(world({ reactions: ['melt'] }), [])).toBe(true);
  });

  it("waits on a frame of motes, health orbs or kills alone: they bank with the floor's next pickup", () => {
    expect(banksNow(world(), [pickup('mote'), pickup('orb')])).toBe(false);
    expect(banksNow(world({ kills: 3 }), [])).toBe(false);
  });
});

describe("the dive's arena key", () => {
  it('names a floor under way; none at a stop, at the end, or once an abandon has settled the dive', () => {
    const registry = getDelveRegistry();
    const dive = startDive(registry, createDelveProfile(registry, 7), 1).dive!;
    expect(diveWorldKey(dive)).toBe('fighting:1');
    expect(diveWorldKey({ ...dive, phase: 'choosing' })).toBeNull();
    expect(diveWorldKey({ ...dive, phase: 'dead' })).toBeNull();
    // Abandoned mid-floor: a dive again at depth 1 is a new key, so a fresh floor.
    expect(diveWorldKey({ ...dive, settled: true })).toBeNull();
    expect(diveWorldKey(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-bank.test.ts)`
Expected: FAIL, 3 failed: `(0 , banksNow) is not a function`, `(0 , diveWorldKey) is not a function`.

- [ ] **Step 3: Bank, hand on, key**

In `packages/client/src/features/delve/arena/useArena.ts`:

Replace:

```ts
  compareItem,
  completeFloor,
  failFloor,
  heroChains,
  profileStats,
  type ArpgWorld,
  type GearItem,
  type ReactionId,
} from '@alloy/engine';
```

with:

```ts
  compareItem,
  completeFloor,
  emptyHaul,
  failFloor,
  heroChains,
  profileStats,
  type ArpgEvent,
  type ArpgWorld,
  type DiveState,
  type GearItem,
  type Haul,
  type ReactionId,
} from '@alloy/engine';
```

Replace:

```ts
  | { kind: 'legendary'; item: GearItem; firstTime: boolean }
  | { kind: 'reaction'; reaction: ReactionId }
  | { kind: 'cleared'; bountyAdded: number; bossKilled: boolean }
  | { kind: 'fell' };

const END_DELAY = 1.3;

export function useArena(
  hostRef: RefObject<HTMLDivElement | null>,
```

with:

```ts
  | { kind: 'legendary'; item: GearItem; firstTime: boolean }
  | { kind: 'reaction'; reaction: ReactionId }
  /** `haul`: the floor's haul as the clear banked it (the stop's "Found this floor"). */
  | { kind: 'cleared'; bountyAdded: number; bossKilled: boolean; haul: Haul }
  | { kind: 'fell' };

const END_DELAY = 1.3;

/**
 * Whether a frame banks now: an item, a rune or a reaction is waiting, or a material or scrap was
 * picked up (they ride the floor's haul, which the purse and the Found log show as it grows).
 */
export function banksNow(world: ArpgWorld, events: readonly ArpgEvent[]): boolean {
  const { items, reactions, runes } = world.pending;
  return (
    items.length + reactions.length + runes.length > 0 ||
    events.some((e) => e.kind === 'pickup' && (e.dropKind === 'material' || e.dropKind === 'scrap'))
  );
}

/**
 * The arena's world key: a floor under way. Only while fighting, so the finished floor stays on
 * screen behind the doors or the summary; and not once the dive has settled, so after an abandon
 * mid-floor a dive again at that depth starts a fresh floor.
 */
export function diveWorldKey(dive: DiveState | null): string | null {
  return dive?.phase === 'fighting' && !dive.settled ? `fighting:${dive.depth}` : null;
}

export function useArena(
  hostRef: RefObject<HTMLDivElement | null>,
```

Replace:

```ts
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const phase = profile.dive?.phase ?? null;
  const depth = profile.dive?.depth ?? 0;
  const onUiRef = useRef(opts.onUi);
  onUiRef.current = opts.onUi;
```

with:

```ts
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const onUiRef = useRef(opts.onUi);
  onUiRef.current = opts.onUi;
```

Replace:

```ts
      onUiRef.current({ kind: 'fell' });
    } else {
      const res = completeFloor(registry, store.profile, world, pullOpts(store));
      store.setProfile(res.profile);
```

with:

```ts
      onUiRef.current({ kind: 'fell' });
    } else {
      const haul = store.profile.dive?.haul ?? emptyHaul();
      const res = completeFloor(registry, store.profile, world, pullOpts(store));
      store.setProfile(res.profile);
```

Replace:

```ts
        bountyAdded: res.bountyAdded,
        bossKilled: res.bossKilled,
      });
    }
```

with:

```ts
        bountyAdded: res.bountyAdded,
        bossKilled: res.bossKilled,
        haul,
      });
    }
```

Replace:

```ts

  const mode: ArenaMode = {
    // Only while fighting: the finished floor stays on screen behind the doors or the summary.
    worldKey: phase === 'fighting' ? `fighting:${depth}` : null,
    createWorld: () => {
      endAtRef.current = null;
```

with:

```ts

  const mode: ArenaMode = {
    worldKey: diveWorldKey(profile.dive),
    createWorld: () => {
      endAtRef.current = null;
```

Replace:

```ts
    loadout,
    frame: checkEnd,
    onEvents: (world) => {
      const { items, reactions, runes } = world.pending;
      if (items.length + reactions.length + runes.length > 0) bank(world);
    },
    onHeroDead: () => {},
```

with:

```ts
    loadout,
    frame: checkEnd,
    onEvents: (world, events) => {
      if (banksNow(world, events)) bank(world);
    },
    onHeroDead: () => {},
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-bank.test.ts)`
Expected: PASS, 3 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors (`DelveRun` doesn't read `cleared.haul` until Task 6); **1177 in 148**.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/useArena.ts src/features/delve/__tests__/arena-bank.test.ts)
git add packages/client/src/features/delve/arena/useArena.ts packages/client/src/features/delve/__tests__/arena-bank.test.ts
git commit -m "feat(client): the dive banks material and scrap pickups; the clear hands on the floor's haul" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: The purse

Scrap, Links, Mana Dust, materials and runes, each held at the Anvil and this dive's gain (the floor's haul and the banked); hovering the materials lists them.

**Files:**
- Modify: `packages/client/src/features/delve/arena/hud/PurseBar.tsx`
- Modify (tests): `packages/client/src/features/delve/arena/hud/__tests__/HudGrid.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/arena/hud/__tests__/HudGrid.test.tsx`:

Replace:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createDelveProfile, startDive } from '@alloy/engine';
import { HudGrid } from '../HudGrid';
import { PurseBar } from '../PurseBar';
```

with:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import {
  addMaterial,
  createDelveProfile,
  emptyHaul,
  emptyMaterials,
  startDive,
  type MaterialRef,
} from '@alloy/engine';
import { HudGrid } from '../HudGrid';
import { PurseBar } from '../PurseBar';
```

Replace:

```tsx
describe('PurseBar', () => {
  const registry = getDelveRegistry();

  beforeEach(() => {
```

with:

```tsx
describe('PurseBar', () => {
  const registry = getDelveRegistry();
  const iron: MaterialRef = { kind: 'metal', metal: 'iron' };

  beforeEach(() => {
```

Replace:

```tsx
      manaDust: 40,
      runes: { quick: [2, 1, 0, 0, 0] },
    };
    const dived = startDive(registry, profile, 1);
    useDelveStore.setState({
      profile: {
        ...dived,
        dive: { ...dived.dive!, bounty: 26, linksEarned: 1, dustEarned: 6, runesEarned: 1 },
      },
      diveDrops: ['a', 'b', 'c', 'd'],
    });
```

with:

```tsx
      manaDust: 40,
      runes: { quick: [2, 1, 0, 0, 0] },
      materials: { ...emptyMaterials(), metals: { ...emptyMaterials().metals, steel: 7 } },
    };
    const dived = startDive(registry, profile, 1);
    // This floor's haul so far, and what the dive's cleared floors banked.
    const haul = addMaterial(addMaterial(emptyHaul(), iron, 3), { kind: 'dust' }, 2);
    const banked = {
      ...addMaterial(emptyHaul(), { kind: 'flux', grade: 'magic' }),
      scrap: 30,
      dust: 4,
      links: 1,
      runes: { split: [0, 0, 1, 0, 0] },
    };
    useDelveStore.setState({
      profile: { ...dived, dive: { ...dived.dive!, bounty: 26, haul, banked } },
      diveDrops: ['a', 'b', 'c', 'd'],
    });
```

Replace:

```tsx
      expect(el).toHaveTextContent(text);
    };
    row('scrap', 'Scrap', '2,412+26');
    row('links', 'Links', '5+1');
    row('dust', 'Mana Dust', '40+6');
    row('runes', 'Runes', '3+1');
    row('items', 'Items', `${bag} / ${cap}+4`);
```

with:

```tsx
      expect(el).toHaveTextContent(text);
    };
    row('scrap', 'Scrap', '2,412+30');
    row('links', 'Links', '5+1');
    row('dust', 'Mana Dust', '40+6');
    row('materials', 'Materials', '7+4');
    row('runes', 'Runes', '3+1');
    row('items', 'Items', `${bag} / ${cap}+4`);
```

Replace:

```tsx
  });

  it('"Dive menu" carries the menu marker and presses onMenu; Journal waits for 3b', () => {
    const onMenu = vi.fn();
```

with:

```tsx
  });

  it("the materials' tooltip lists what this dive found and what waits at the Anvil", () => {
    render(purse());
    fireEvent.mouseEnter(screen.getByTestId('purse-materials'));
    const card = within(screen.getByTestId('purse-bar')).getByRole('tooltip');
    const rows = within(card)
      .getAllByTestId('haul-row')
      .map((r) => r.textContent);
    expect(rows).toEqual(['Iron bar×3', 'Magic flux×1', 'Steel bar×7']);
    expect(card).toHaveTextContent(/This dive.*At the Anvil/);
  });

  it('"Dive menu" carries the menu marker and presses onMenu; Journal waits for 3b', () => {
    const onMenu = vi.fn();
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/HudGrid.test.tsx)`
Expected: FAIL, 2 failed | 6 passed: the gains (`expect(element).toHaveTextContent()`: the scrap's gain is still the bounty) and `Unable to find an element by: [data-testid="purse-materials"]`.

- [ ] **Step 3: The purse**

In `packages/client/src/features/delve/arena/hud/PurseBar.tsx`:

Replace:

```tsx
import type { DiveState } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useControlsStore } from '@/stores/controlsStore';
import { Glyph, InputGlyph, type GlyphId } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { noFocus } from './SkillSlot';

```

with:

```tsx
import type { ReactElement } from 'react';
import { addHaul, type DiveState, type Haul } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useControlsStore } from '@/stores/controlsStore';
import { Glyph, InputGlyph, Tooltip, TooltipCard, type GlyphId } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { haulRows, materialCount, runeCount } from '../../materials/material-style';
import { HaulList } from '../../materials/HaulList';
import { noFocus } from './SkillSlot';

```

Replace:

```tsx

/**
 * The dive's top bar (glass): "Purse", then scrap, Links, Mana Dust, runes and the bag, each its
 * glyph (named for screen readers), the amount held and this dive's gain (the scrap's is the
 * bounty, in amber); "+N banks on extract"
 * (`bounty`); and at the right end the Labels hint, Journal (`data-pad-journal`; disabled until
 * there is `onJournal`) and Menu ("Dive menu", `data-pad-menu`), which opens the menu.
 */
export function PurseBar({
```

with:

```tsx

/**
 * The dive's top bar (glass): "Purse", then scrap, Links, Mana Dust, materials, runes and the
 * bag, each its glyph (named for screen readers), the amount held at the Anvil and this dive's
 * gain (the floor's haul and what the dive has banked; the bag's, the items found); hovering the
 * materials lists them; "+N banks on extract" (`bounty`); and at the right end the Labels hint,
 * Journal (`data-pad-journal`; disabled until there is `onJournal`) and Menu ("Dive menu",
 * `data-pad-menu`), which opens the menu.
 */
export function PurseBar({
```

Replace:

```tsx
  const drops = useDelveStore((s) => s.diveDrops.length);
  const config = useControlsStore((s) => s.config);
  const bagSize = getDelveRegistry().getDelveBalance().loot.bagSize;
  const runes = Object.values(profile.runes).reduce(
    (sum, tiers) => sum + tiers.reduce((a, b) => a + b, 0),
    0,
  );
  const purse: { id: string; glyph: GlyphId; name: string; held: string; gain: number }[] = [
    { id: 'scrap', glyph: 'scrap', name: 'Scrap', held: n(profile.scrap), gain: dive.bounty },
    { id: 'links', glyph: 'link', name: 'Links', held: n(profile.links), gain: dive.linksEarned },
    {
      id: 'dust',
      glyph: 'dust',
      name: 'Mana Dust',
      held: n(profile.manaDust),
      gain: dive.dustEarned,
    },
    { id: 'runes', glyph: 'rune', name: 'Runes', held: n(runes), gain: dive.runesEarned },
    {
      id: 'items',
```

with:

```tsx
  const drops = useDelveStore((s) => s.diveDrops.length);
  const config = useControlsStore((s) => s.config);
  const registry = getDelveRegistry();
  const bagSize = registry.getDelveBalance().loot.bagSize;
  const gain = addHaul(dive.haul, dive.banked);
  const purse: { id: string; glyph: GlyphId; name: string; held: string; gain: number }[] = [
    { id: 'scrap', glyph: 'scrap', name: 'Scrap', held: n(profile.scrap), gain: gain.scrap },
    { id: 'links', glyph: 'link', name: 'Links', held: n(profile.links), gain: gain.links },
    { id: 'dust', glyph: 'dust', name: 'Mana Dust', held: n(profile.manaDust), gain: gain.dust },
    {
      id: 'materials',
      glyph: 'anvil',
      name: 'Materials',
      held: n(materialCount(profile.materials)),
      gain: materialCount(gain),
    },
    {
      id: 'runes',
      glyph: 'rune',
      name: 'Runes',
      held: n(runeCount(profile.runes)),
      gain: runeCount(gain.runes),
    },
    {
      id: 'items',
```

Replace:

```tsx
    >
      <span className="k-disp text-[20px] text-[var(--k-hot-hi)]">Purse</span>
      {purse.map((r) => (
        <span
          key={r.id}
          className="flex items-center gap-2 whitespace-nowrap text-[15px]"
          data-testid={`purse-${r.id}`}
        >
          <Glyph id={r.glyph} size={18} title={r.name} />
          <b className="k-disp text-[19px]">{r.held}</b>
          <b
            className="k-disp text-[19px]"
            style={{ color: r.id === 'scrap' ? 'var(--k-hot)' : 'var(--k-ok)' }}
          >
            +{n(r.gain)}
          </b>
        </span>
      ))}
      <span className="whitespace-nowrap text-[14px] text-[var(--k-text-3)]">
        <b className="text-[var(--k-hot)]" data-testid="bounty">
```

with:

```tsx
    >
      <span className="k-disp text-[20px] text-[var(--k-hot-hi)]">Purse</span>
      {purse.map((r) => {
        const entry = (
          <span
            key={r.id}
            className="flex items-center gap-2 whitespace-nowrap text-[15px]"
            data-testid={`purse-${r.id}`}
          >
            <Glyph id={r.glyph} size={18} title={r.name} />
            <b className="k-disp text-[19px]">{r.held}</b>
            <b className="k-disp text-[19px] text-[var(--k-ok)]">+{n(r.gain)}</b>
          </span>
        );
        if (r.id !== 'materials') return entry;
        return (
          <Tooltip
            key={r.id}
            placement="bottom"
            portal={false}
            content={() => <MaterialsCard gain={gain} />}
          >
            {entry}
          </Tooltip>
        );
      })}
      <span className="whitespace-nowrap text-[14px] text-[var(--k-text-3)]">
        <b className="text-[var(--k-hot)]" data-testid="bounty">
```

Replace:

```tsx
  );
}
```

with:

```tsx
  );
}

/** The materials' tooltip: what this dive has found (its haul and banked) and the Anvil's stock. */
function MaterialsCard({ gain }: { gain: Haul }): ReactElement {
  const registry = getDelveRegistry();
  const materials = useDelveStore((s) => s.profile.materials);
  const found = haulRows(registry, gain).filter(
    (r) => r.group === 'material' || r.group === 'essence',
  );
  const held = haulRows(registry, materials);
  return (
    <TooltipCard title="Materials" material="glass" width={340}>
      <span className="k-label">This dive</span>
      {found.length > 0 ? <HaulList rows={found} /> : <span className="k-caption">None yet</span>}
      <span className="k-label">At the Anvil</span>
      {held.length > 0 ? <HaulList rows={held} /> : <span className="k-caption">None</span>}
    </TooltipCard>
  );
}
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/HudGrid.test.tsx)`
Expected: PASS, 8 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1178 in 148**.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/hud/PurseBar.tsx src/features/delve/arena/hud/__tests__/HudGrid.test.tsx)
git add packages/client/src/features/delve/arena/hud/PurseBar.tsx packages/client/src/features/delve/arena/hud/__tests__/HudGrid.test.tsx
git commit -m "feat(client): the purse counts materials and this dive's haul and banked gains" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: The Found log groups the floor's materials

**Files:**
- Modify: `packages/client/src/features/delve/arena/hud/FoundLog.tsx`
- Modify (tests): `packages/client/src/features/delve/arena/hud/__tests__/FoundLog.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/arena/hud/__tests__/FoundLog.test.tsx`:

Replace:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { generateItem, SeededRNG } from '@alloy/engine';
import { FoundLog } from '../FoundLog';
import { getDelveRegistry } from '../../../registry';
```

with:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { addMaterial, emptyHaul, generateItem, SeededRNG } from '@alloy/engine';
import { FoundLog } from '../FoundLog';
import { getDelveRegistry } from '../../../registry';
```

Replace:

```tsx
  });

  it('names the runes found, grouped, even with no item found', () => {
    store().startDive(1);
```

with:

```tsx
  });

  it("groups the floor's materials above its items, and its essences below them; Mana Dust is the purse's", () => {
    dive();
    let haul = addMaterial(emptyHaul(), { kind: 'metal', metal: 'iron' }, 3);
    haul = addMaterial(haul, { kind: 'shard', stat: 'critChance', tier: 2 });
    haul = addMaterial(haul, { kind: 'essence', essence: 'twin_fang' });
    haul = addMaterial(haul, { kind: 'dust' }, 5);
    store().setProfile({ ...store().profile, dive: { ...store().profile.dive!, haul } });
    render(<FoundLog onInspect={() => {}} />);
    const feed = screen.getByTestId('pickup-feed');
    const order = [
      ...feed.querySelectorAll('[data-testid^="feed-"], [data-testid="loot-item"]'),
    ].map((el) => el.getAttribute('data-testid'));
    expect(order).toEqual([
      'feed-material',
      'feed-material',
      'loot-item',
      'loot-item',
      'feed-essence',
    ]);
    const [bars, shard] = screen.getAllByTestId('feed-material');
    expect(bars).toHaveTextContent(/^Iron bar ×3$/);
    expect(shard).toHaveTextContent(/^Crit Chance II$/);
    expect(within(screen.getByTestId('feed-essence')).getByText('Twin Fang essence')).toHaveStyle({
      color: '#f77622',
    });
    expect(feed).not.toHaveTextContent('Mana Dust');
  });

  it('names the runes found, grouped, even with no item found', () => {
    store().startDive(1);
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/FoundLog.test.tsx)`
Expected: FAIL, 1 failed | 7 passed: `expected [ 'loot-item', 'loot-item' ] to deeply equal [ 'feed-material', …(4) ]`.

- [ ] **Step 3: The grouping**

In `packages/client/src/features/delve/arena/hud/FoundLog.tsx`:

Replace:

```tsx
import { countRunes } from '../../chains/chain-text';
import { FAMILY_STYLE, runeName } from '../../runes/rune-style';
import { noFocus } from './SkillSlot';

```

with:

```tsx
import { countRunes } from '../../chains/chain-text';
import { FAMILY_STYLE, runeName } from '../../runes/rune-style';
import { haulRows, type HaulRow } from '../../materials/material-style';
import { noFocus } from './SkillSlot';

```

Replace:

```tsx
}

/**
 * "Found this floor": each pickup since the floor began, newest first (the items, then the
 * runes), as many as fit, then "+n more". An item shows its card on hover and opens on a click;
 * ▲ marks an upgrade (to equip at the Anvil), ◇ a weapon better only with your moveset moved
 * onto it (Transfer), ▼ a downgrade.
 */
export function FoundLog({ onInspect }: { onInspect: (uid: string) => void }): ReactElement {
```

with:

```tsx
}

/** A material's or an essence's row: "Iron bar ×3". */
function HaulFeedRow({ row, testId, color }: { row: HaulRow; testId: string; color?: string }) {
  return (
    <div className={ROW_CLASS} data-testid={testId}>
      <Swatch color={row.color} />
      <span className="truncate" style={{ color }}>
        {row.name}
        {row.count > 1 && ` ×${row.count}`}
      </span>
    </div>
  );
}

/**
 * "Found this floor": each pickup since the floor began, as many as fit, then "+n more": the
 * materials in the floor's haul grouped ("Iron bar ×3"), the items newest first, the essences in
 * legendary orange, then the runes (Mana Dust, Links and scrap are the purse's). An item shows
 * its card on hover and opens on a click; ▲ marks an upgrade (to equip at the Anvil), ◇ a weapon
 * better only with your moveset moved onto it (Transfer), ▼ a downgrade.
 */
export function FoundLog({ onInspect }: { onInspect: (uid: string) => void }): ReactElement {
```

Replace:

```tsx
  const [fit, setFit] = useState(Infinity);
  const { items, runes } = useFloorFinds();

  // As many rows as fit: again after each render (a panel above may have come or gone) and on a
```

with:

```tsx
  const [fit, setFit] = useState(Infinity);
  const { items, runes } = useFloorFinds();
  const haul = useDelveStore((s) => s.profile.dive?.haul);
  const found = haul ? haulRows(registry, haul) : [];

  // As many rows as fit: again after each render (a panel above may have come or gone) and on a
```

Replace:

```tsx

  const rows = [
    ...items.map(({ item, delta, asIs }) => {
      const mark = deltaMark(delta, asIs);
```

with:

```tsx

  const rows = [
    ...found
      .filter((r) => r.group === 'material')
      .map((r) => <HaulFeedRow key={r.key} row={r} testId="feed-material" />),
    ...items.map(({ item, delta, asIs }) => {
      const mark = deltaMark(delta, asIs);
```

Replace:

```tsx
      );
    }),
    ...runes.map(({ rune, count }) => (
      <div key={`${rune.id}-${rune.tier}`} className={ROW_CLASS} data-testid="feed-rune">
```

with:

```tsx
      );
    }),
    ...found
      .filter((r) => r.group === 'essence')
      .map((r) => (
        <HaulFeedRow key={r.key} row={r} testId="feed-essence" color={RARITY_TEXT.legendary} />
      )),
    ...runes.map(({ rune, count }) => (
      <div key={`${rune.id}-${rune.tier}`} className={ROW_CLASS} data-testid="feed-rune">
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/FoundLog.test.tsx)`
Expected: PASS, 8 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1179 in 148**.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/hud/FoundLog.tsx src/features/delve/arena/hud/__tests__/FoundLog.test.tsx)
git add packages/client/src/features/delve/arena/hud/FoundLog.tsx packages/client/src/features/delve/arena/hud/__tests__/FoundLog.test.tsx
git commit -m "feat(client): the Found log groups the floor's materials above its gear and essences" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The stop

### Task 6: The stop's haul, the risk line and the doors' loot

The stop lists the floor's haul grouped (handed on by `DelveRun` from the clear), counts its materials, says what a death would take of the banked, and shows each door's loot multipliers.

**Files:**
- Modify: `packages/client/src/features/delve/stop/DoorPane.tsx`, `packages/client/src/features/delve/stop/StopScreen.tsx`, `packages/client/src/pages/DelveRun.tsx`
- Modify (tests): `packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx`:

Replace:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { generateItem, isBossDepth, SeededRNG, type DiveState, type StopKind } from '@alloy/engine';
import { ARM_MS, StopScreen } from '../StopScreen';
import { padPrompts } from '../../kit/prompts';
import type { PadButton } from '@/features/gamepad/gamepad';
```

with:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import {
  addMaterial,
  emptyHaul,
  generateItem,
  isBossDepth,
  SeededRNG,
  type DiveState,
  type Haul,
  type StopKind,
} from '@alloy/engine';
import { ARM_MS, StopScreen } from '../StopScreen';
import { doorLoot } from '../DoorPane';
import { padPrompts } from '../../kit/prompts';
import type { PadButton } from '@/features/gamepad/gamepad';
```

Replace:

```tsx
 * Depth 1 cleared, at a stop offering `offers`: the bag holds a helm, a weapon and a ring, and
 * the floor found the helm and the weapon (the ring was an earlier floor's), Split III twice and
 * Quick I (Widen was an earlier floor's).
 */
function atStop(offers: StopKind[] | null, over: Partial<DiveState> = {}) {
  store().setProfile({
    ...store().profile,
```

with:

```tsx
 * Depth 1 cleared, at a stop offering `offers`: the bag holds a helm, a weapon and a ring, and
 * the floor found the helm and the weapon (the ring was an earlier floor's), Split III twice and
 * Quick I (Widen was an earlier floor's), and the floor's haul `haul`.
 */
function atStop(
  offers: StopKind[] | null,
  over: Partial<DiveState> = {},
  haul: Haul | null = null,
) {
  store().setProfile({
    ...store().profile,
```

Replace:

```tsx
  const Stop = () => {
    const d = useDelveStore((s) => s.profile.dive!);
    return <StopScreen dive={d} {...props} />;
  };
  render(<Stop />);
```

with:

```tsx
  const Stop = () => {
    const d = useDelveStore((s) => s.profile.dive!);
    return <StopScreen dive={d} haul={haul} {...props} />;
  };
  render(<Stop />);
```

Replace:

```tsx
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Depth 1 cleared');
    expect(root).toHaveTextContent(registry.getBiomeForDepth(1).name);
    expect(screen.getByTestId('floor-counts')).toHaveTextContent('26 scrap bounty2 items3 runes');
    expect(screen.queryByTestId('boss-slain')).toBeNull();
  });
```

with:

```tsx
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Depth 1 cleared');
    expect(root).toHaveTextContent(registry.getBiomeForDepth(1).name);
    expect(screen.getByTestId('floor-counts')).toHaveTextContent(
      '26 scrap bounty0 materials2 items3 runes',
    );
    expect(screen.queryByTestId('boss-slain')).toBeNull();
  });
```

Replace:

```tsx
  });

  it("lists this floor's items with their marks and its runes grouped, already banked", () => {
    const { onInspect } = atStop(['equip']);
    const found = screen.getByTestId('floor-finds');
```

with:

```tsx
  });

  it("lists this floor's items with their marks and its runes grouped, over the risk line", () => {
    const { onInspect } = atStop(['equip']);
    const found = screen.getByTestId('floor-finds');
```

Replace:

```tsx
      'Split III ×2Rune, to your pouch',
    ]);
    expect(found).toHaveTextContent('Already banked: yours even if you abandon.');
    fireEvent.click(items[1]);
    expect(onInspect).toHaveBeenCalledWith('h1');
  });

  it('shows the doors with their art and depth, Extract with the hero, and the potion', () => {
    const { onChoose, onExtract, onPotion } = atStop(['equip'], { heroHpFrac: 0.5, potions: 2 });
```

with:

```tsx
      'Split III ×2Rune, to your pouch',
    ]);
    const loss = Math.round(registry.getDelveBalance().crafting.deathLoss * 100);
    expect(within(found).getByTestId('risk-line')).toHaveTextContent(
      `Banked this dive · dying loses ${loss}% of it`,
    );
    fireEvent.click(items[1]);
    expect(onInspect).toHaveBeenCalledWith('h1');
  });

  it("groups the floor's materials and currencies above its items, its essences below them, and counts them", () => {
    let haul = addMaterial(emptyHaul(), { kind: 'metal', metal: 'iron' }, 3);
    haul = addMaterial(haul, { kind: 'flux', grade: 'magic' });
    haul = addMaterial(haul, { kind: 'essence', essence: 'twin_fang' });
    haul = addMaterial(haul, { kind: 'links' }, 2);
    atStop(['equip'], {}, haul);
    const found = screen.getByTestId('floor-finds');
    const rows = [
      ...found.querySelectorAll(
        '[data-testid="loot-material"], [data-testid="loot-currency"], [data-testid="loot-item"], [data-testid="loot-essence"]',
      ),
    ];
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'loot-material',
      'loot-material',
      'loot-currency',
      'loot-item',
      'loot-item',
      'loot-essence',
    ]);
    expect(rows.map((r) => r.textContent)).toEqual([
      'Iron bar ×3Material',
      'Magic fluxMaterial',
      'Links ×2Currency',
      expect.any(String),
      expect.any(String),
      'Twin Fang essenceForges a legendary',
    ]);
    // Bars, flux, shards and essences count as materials.
    expect(screen.getByTestId('floor-counts')).toHaveTextContent('5 materials');
  });

  it('shows the doors with their art and depth, Extract with the hero, and the potion', () => {
    const { onChoose, onExtract, onPotion } = atStop(['equip'], { heroHpFrac: 0.5, potions: 2 });
```

Replace:

```tsx
    expect(door).toHaveTextContent(registry.getDoor(first).name);
    expect(door.querySelector('[data-sprite], [data-glyph="chest"]')).not.toBeNull();
    fireEvent.click(door);
    expect(onChoose).toHaveBeenCalledWith(first);
```

with:

```tsx
    expect(door).toHaveTextContent(registry.getDoor(first).name);
    expect(door.querySelector('[data-sprite], [data-glyph="chest"]')).not.toBeNull();
    // Each door shows its loot multipliers; the plain one has none.
    const loot = (id: string) =>
      [...screen.getByTestId(`door-${id}`).querySelectorAll('[data-door-loot]')].map(
        (el) => el.textContent,
      );
    expect(loot('gilded')).toEqual(doorLoot(registry.getDoor('gilded').mods));
    expect(loot('gilded').length).toBeGreaterThan(0);
    expect(loot('winding')).toEqual([]);
    fireEvent.click(door);
    expect(onChoose).toHaveBeenCalledWith(first);
```

Replace:

```tsx
  });

  it('with no power-up to offer, says so', () => {
    atStop(null);
```

with:

```tsx
  });

  it("words a door's loot multipliers from its mods, leaving out what it doesn't change", () => {
    expect(doorLoot({})).toEqual([]);
    expect(
      doorLoot({
        materials: 1.3,
        runes: 0.5,
        gear: 1,
        flux: 1.5,
        essence: 2,
        find: 75,
        shardTier: 0.35,
      }),
    ).toEqual([
      'Materials ×1.3',
      'Runes ×0.5',
      'Flux ×1.5',
      'Essences ×2',
      'Find +75%',
      'Tier up 35%',
    ]);
  });

  it('with no power-up to offer, says so', () => {
    atStop(null);
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/stop/__tests__/StopScreen.test.tsx)`
Expected: FAIL, 5 failed | 9 passed: the counts (`expect(element).toHaveTextContent()`: no "0 materials"), `Unable to find an element by: [data-testid="risk-line"]`, `expected [ 'loot-item', 'loot-item' ] to deeply equal [ 'loot-material', …(5) ]`, and `(0 , doorLoot) is not a function` (twice).

- [ ] **Step 3: The stop, the doors, and the page's haul**

In `packages/client/src/features/delve/stop/DoorPane.tsx`:

Replace:

```tsx
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { RARITY_ORDER, isBossDepth, type DiveState } from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
```

with:

```tsx
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { RARITY_ORDER, isBossDepth, type DiveState, type DoorMods } from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
```

Replace:

```tsx
}

/**
 * "Choose your path": each door as a plate with its art in a doorway (the next depth's first
 * monster, or the chest for a door that raises gear or essences), its depth and a boss mark; Extract,
 * with the hero leaving; then the hero's life and potions, and a potion to drink. With
 * `padFirst`, the first door is the pad's first focus (not while a power-up is on offer).
```

with:

```tsx
}

/** A door's loot multipliers as the data gives them: "Materials ×1.3", "Find +75%", "Tier up 35%". */
export function doorLoot(mods: DoorMods): string[] {
  const out: string[] = [];
  const times: [number | undefined, string][] = [
    [mods.materials, 'Materials'],
    [mods.runes, 'Runes'],
    [mods.gear, 'Gear'],
    [mods.flux, 'Flux'],
    [mods.essence, 'Essences'],
  ];
  for (const [v, label] of times) if (v !== undefined && v !== 1) out.push(`${label} ×${v}`);
  if (mods.find) out.push(`Find +${mods.find}%`);
  if (mods.shardTier) out.push(`Tier up ${Math.round(mods.shardTier * 100)}%`);
  return out;
}

/**
 * "Choose your path": each door as a plate with its art in a doorway (the next depth's first
 * monster, or the chest for a door that raises gear or essences), its depth, a boss mark and its
 * loot multipliers (`doorLoot`); Extract,
 * with the hero leaving; then the hero's life and potions, and a potion to drink. With
 * `padFirst`, the first door is the pad's first focus (not while a power-up is on offer).
```

Replace:

```tsx
                    </span>
                  )}
                </span>
              }
```

with:

```tsx
                    </span>
                  )}
                  {doorLoot(door.mods).map((text) => (
                    <span key={text} className="leading-tight text-[var(--k-mana)]" data-door-loot>
                      {text}
                    </span>
                  ))}
                </span>
              }
```

In `packages/client/src/features/delve/stop/StopScreen.tsx`:

Replace:

```tsx
import { memo, useEffect, useRef, useState, type ReactElement } from 'react';
import { baseDisplayName, isBossDepth, type DiveState } from '@alloy/engine';
import { useControlsStore } from '@/stores/controlsStore';
import { Button, Footer, Glyph, Panel, Screen, usePrompts, type Prompt } from '../kit';
```

with:

```tsx
import { memo, useEffect, useRef, useState, type ReactElement } from 'react';
import { baseDisplayName, isBossDepth, type DiveState, type Haul } from '@alloy/engine';
import { useControlsStore } from '@/stores/controlsStore';
import { Button, Footer, Glyph, Panel, Screen, usePrompts, type Prompt } from '../kit';
```

Replace:

```tsx
import { FAMILY_STYLE, runeName } from '../runes/rune-style';
import { MARK, useFloorFinds } from '../arena/hud/FoundLog';
import { StopPanel } from '../StopPanel';
import { DoorPane } from './DoorPane';
```

with:

```tsx
import { FAMILY_STYLE, runeName } from '../runes/rune-style';
import { MARK, useFloorFinds } from '../arena/hud/FoundLog';
import { haulRows, materialCount, type HaulRow } from '../materials/material-style';
import { StopPanel } from '../StopPanel';
import { DoorPane } from './DoorPane';
```

Replace:

```tsx
const ROW = 'flex w-full flex-none items-center gap-3 bg-[var(--k-well)] px-3 py-[10px] text-left';

export interface StopScreenProps {
  dive: DiveState;
  onChoose: (doorId: string) => void;
  onExtract: () => void;
```

with:

```tsx
const ROW = 'flex w-full flex-none items-center gap-3 bg-[var(--k-well)] px-3 py-[10px] text-left';

const CAPTION: Record<HaulRow['group'], string> = {
  material: 'Material',
  essence: 'Forges a legendary',
  rune: 'Rune',
  currency: 'Currency',
};

/** A material, an essence or a currency of the floor's haul: its swatch, "Iron bar ×3" and what it is. */
function HaulStopRow({ row }: { row: HaulRow }): ReactElement {
  return (
    <div className={ROW} data-testid={`loot-${row.group}`}>
      <span
        className="flex size-9 flex-none items-center justify-center border-2"
        style={{ borderColor: row.color }}
      >
        <span aria-hidden className="size-4" style={{ background: row.color }} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span style={row.group === 'essence' ? { color: RARITY_TEXT.legendary } : undefined}>
          {row.name}
          {row.count > 1 && ` ×${formatNumber(row.count)}`}
        </span>
        <span className="k-caption">{CAPTION[row.group]}</span>
      </span>
    </div>
  );
}

export interface StopScreenProps {
  dive: DiveState;
  /** The floor's haul as the clear banked it; null after a reload (then its items and runes show). */
  haul: Haul | null;
  onChoose: (doorId: string) => void;
  onExtract: () => void;
```

Replace:

```tsx
/**
 * The stop between depths, over the dimmed arena: "Depth N cleared" with the bounty and the
 * floor's finds; this floor's items and runes on the left; the power-up cards in the centre,
 * each expanding in place to its picker; the doors on the right. At its top level there is no
 * back: Esc (or the menu key) and the pad's Menu are its Menu prompt, which opens the pause over
```

with:

```tsx
/**
 * The stop between depths, over the dimmed arena: "Depth N cleared" with the bounty and the
 * floor's finds; this floor's materials grouped, items, essences and runes on the left, over the
 * risk line (the dive's banked haul and the share a death loses); the power-up cards in the centre,
 * each expanding in place to its picker; the doors on the right. At its top level there is no
 * back: Esc (or the menu key) and the pad's Menu are its Menu prompt, which opens the pause over
```

Replace:

```tsx
export const StopScreen = memo(function StopScreen({
  dive,
  onChoose,
  onExtract,
```

with:

```tsx
export const StopScreen = memo(function StopScreen({
  dive,
  haul,
  onChoose,
  onExtract,
```

Replace:

```tsx
  const biome = registry.getBiomeForDepth(dive.depth);
  const { items, runes } = useFloorFinds();
  const [skipped, setSkipped] = useState(false);
  const [armed, setArmed] = useState(false);
```

with:

```tsx
  const biome = registry.getBiomeForDepth(dive.depth);
  const { items, runes } = useFloorFinds();
  const found = haul ? haulRows(registry, haul) : [];
  const materials = found.filter((r) => r.group === 'material' || r.group === 'currency');
  const essences = found.filter((r) => r.group === 'essence');
  const deathLoss = Math.round(registry.getDelveBalance().crafting.deathLoss * 100);
  const [skipped, setSkipped] = useState(false);
  const [armed, setArmed] = useState(false);
```

Replace:

```tsx
              scrap bounty
            </span>
            <span>
              <b className="k-disp text-[30px] text-[var(--k-text)]">{items.length}</b>{' '}
```

with:

```tsx
              scrap bounty
            </span>
            <span>
              <b className="k-disp text-[30px] text-[var(--k-text)]">
                {haul ? materialCount(haul) : 0}
              </b>{' '}
              materials
            </span>
            <span>
              <b className="k-disp text-[30px] text-[var(--k-text)]">{items.length}</b>{' '}
```

Replace:

```tsx
        >
          <Panel title="Found this floor" testId="floor-finds">
            {items.length === 0 && runes.length === 0 && (
              <span className="k-caption">Nothing found on this floor.</span>
            )}
            {items.map(({ item, delta, asIs }) => {
              const mark = deltaMark(delta, asIs);
```

with:

```tsx
        >
          <Panel title="Found this floor" testId="floor-finds">
            {items.length + runes.length + found.length === 0 && (
              <span className="k-caption">Nothing found on this floor.</span>
            )}
            {materials.length > 0 && (
              <div className="flex flex-col gap-4" data-testid="loot-materials">
                {materials.map((r) => (
                  <HaulStopRow key={r.key} row={r} />
                ))}
              </div>
            )}
            {items.map(({ item, delta, asIs }) => {
              const mark = deltaMark(delta, asIs);
```

Replace:

```tsx
              );
            })}
            {runes.length > 0 && (
              <div className="flex flex-col gap-4" data-testid="loot-runes">
```

with:

```tsx
              );
            })}
            {essences.map((r) => (
              <HaulStopRow key={r.key} row={r} />
            ))}
            {runes.length > 0 && (
              <div className="flex flex-col gap-4" data-testid="loot-runes">
```

Replace:

```tsx
              </div>
            )}
            <span className="k-caption mt-auto">Already banked: yours even if you abandon.</span>
          </Panel>
          <div className="flex min-w-0 flex-col">
```

with:

```tsx
              </div>
            )}
            <span className="k-caption mt-auto" data-testid="risk-line">
              Banked this dive · dying loses {deathLoss}% of it
            </span>
          </Panel>
          <div className="flex min-w-0 flex-col">
```

In `packages/client/src/pages/DelveRun.tsx`:

Replace:

```tsx
  startDepthOptions,
  type GearItem,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
  startDepthOptions,
  type GearItem,
  type Haul,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
  const [pause, setPause] = useState<{ link?: HubLink } | null>(null);
  const [fanfares, setFanfares] = useState<{ item: GearItem; firstTime: boolean }[]>([]);
  const [banners, setBanners] = useState<BannerState[]>([]);
  const bannerId = useRef(0);
```

with:

```tsx
  const [pause, setPause] = useState<{ link?: HubLink } | null>(null);
  const [fanfares, setFanfares] = useState<{ item: GearItem; firstTime: boolean }[]>([]);
  /** The last cleared floor's haul, for the stop's "Found this floor" (none after a reload). */
  const [floorHaul, setFloorHaul] = useState<Haul | null>(null);
  const [banners, setBanners] = useState<BannerState[]>([]);
  const bannerId = useRef(0);
```

Replace:

```tsx
        }
        case 'cleared': {
          const d = useDelveStore.getState().profile.dive;
          playSound('victory');
```

with:

```tsx
        }
        case 'cleared': {
          setFloorHaul(e.haul);
          const d = useDelveStore.getState().profile.dive;
          playSound('victory');
```

Replace:

```tsx
          <StopScreen
            dive={dive}
            onChoose={onChooseDoor}
            onExtract={onExtract}
```

with:

```tsx
          <StopScreen
            dive={dive}
            haul={floorHaul}
            onChoose={onChooseDoor}
            onExtract={onExtract}
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/client && npx vitest run src/features/delve/stop/__tests__/StopScreen.test.tsx src/pages/__tests__/DelveRun.test.tsx)`
Expected: PASS, 14 + 9 tests (the page's memo test sees the stop's new `haul` prop held still across a HUD tick).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1181 in 148**.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/stop/DoorPane.tsx src/features/delve/stop/StopScreen.tsx src/pages/DelveRun.tsx src/features/delve/stop/__tests__/StopScreen.test.tsx)
git add packages/client/src/features/delve/stop/DoorPane.tsx packages/client/src/features/delve/stop/StopScreen.tsx packages/client/src/pages/DelveRun.tsx packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx
git commit -m "feat(client): the stop lists the floor's haul grouped, the risk line and each door's loot" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The dive's end

### Task 7: The summary: abandoned, brought home and lost

**Files:**
- Modify: `packages/client/src/features/delve/DiveSummary.tsx`
- Modify (tests): `packages/client/src/features/delve/__tests__/DiveSummary.test.tsx`

- [ ] **Step 1: The failing tests**

The old tests of the Dust, Links and runes lines go (their lines go): six tests become five.

In `packages/client/src/features/delve/__tests__/DiveSummary.test.tsx`:

Replace:

```tsx
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createDelveProfile, startDive } from '@alloy/engine';
import { DiveSummary } from '../DiveSummary';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

beforeAll(() => {
```

with:

```tsx
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  addMaterial,
  createDelveProfile,
  emptyHaul,
  startDive,
  type DiveState,
} from '@alloy/engine';
import { DiveSummary } from '../DiveSummary';
import { getDelveRegistry } from '../registry';

beforeAll(() => {
```

Replace:

```tsx
});

function summary(
  dustEarned: number,
  linksEarned = 0,
  runesEarned = 0,
  phase: 'extracted' | 'dead' = 'extracted',
) {
  const registry = getDelveRegistry();
  const dive = startDive(registry, createDelveProfile(registry, 1, { primary: 'fire' }), 1).dive!;
```

with:

```tsx
});

function summary(over: Partial<DiveState> = {}) {
  const registry = getDelveRegistry();
  const dive = startDive(registry, createDelveProfile(registry, 1, { primary: 'fire' }), 1).dive!;
```

Replace:

```tsx
  render(
    <DiveSummary
      dive={{ ...dive, phase, bounty: 40, dustEarned, linksEarned, runesEarned }}
      biomeName="Test"
      againLabel="Again"
```

with:

```tsx
  render(
    <DiveSummary
      dive={{ ...dive, phase: 'extracted', bounty: 40, settled: true, ...over }}
      biomeName="Test"
      againLabel="Again"
```

Replace:

```tsx
}

describe('DiveSummary', () => {
  it('is a kit screen: the outcome, the bounty with its glyph, and the two ways on', () => {
    const { onCamp, onAgain } = summary(3, 1);
    const root = screen.getByTestId('dive-summary');
    expect(root).toHaveClass('delve-ui', 'delve-zoom');
```

with:

```tsx
}

const rows = (id: string) =>
  within(screen.getByTestId(id))
    .getAllByTestId('haul-row')
    .map((r) => r.textContent);

describe('DiveSummary', () => {
  it('is a kit screen: the outcome, the bounty with its glyph, and the two ways on', () => {
    const { onCamp, onAgain } = summary();
    const root = screen.getByTestId('dive-summary');
    expect(root).toHaveClass('delve-ui', 'delve-zoom');
```

Replace:

```tsx

  it('a fall loses the bounty', () => {
    summary(0, 0, 0, 'dead');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('YOU FELL');
    expect(screen.getByTestId('dive-summary')).toHaveTextContent('Bounty lost: 40 scrap');
  });

  it('shows the Mana Dust salvage gave this dive', () => {
    summary(7);
    expect(screen.getByTestId('dive-dust')).toHaveTextContent('7 Mana Dust from salvage');
  });

  it('says nothing about Mana Dust or Links when there were none', () => {
    summary(0);
    expect(screen.queryByTestId('dive-dust')).toBeNull();
    expect(screen.queryByTestId('dive-links')).toBeNull();
  });

  it('shows the Links salvaged weapons gave this dive', () => {
    summary(0, 2);
    expect(screen.getByTestId('dive-links')).toHaveTextContent('2 Links from salvaged weapons');
    expect(screen.queryByTestId('dive-runes')).toBeNull();
  });

  it('counts the runes found this dive, and names them', () => {
    useDelveStore.getState().pushDiveRunes([
      { id: 'split', tier: 3 },
      { id: 'quick', tier: 1 },
    ]);
    summary(0, 0, 2);
    expect(screen.getByTestId('dive-runes')).toHaveTextContent('2 runes found: Quick I, Split III');
  });
});
```

with:

```tsx

  it('a fall loses the bounty', () => {
    summary({ phase: 'dead' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('YOU FELL');
    expect(screen.getByTestId('dive-summary')).toHaveTextContent('Bounty lost: 40 scrap');
  });

  it('an abandon (settled, still at its floor or stop) counts as a death', () => {
    summary({ phase: 'choosing' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ABANDONED');
    expect(screen.getByTestId('dive-summary')).toHaveTextContent('Bounty lost: 40 scrap');
  });

  it('lists what the dive brought home, and what a death took', () => {
    const banked = {
      ...addMaterial(emptyHaul(), { kind: 'metal', metal: 'iron' }, 3),
      dust: 4,
      runes: { split: [0, 0, 1, 0, 0] },
    };
    summary({
      phase: 'dead',
      banked,
      lost: addMaterial(emptyHaul(), { kind: 'metal', metal: 'iron' }, 2),
    });
    expect(rows('dive-home')).toEqual(['Iron bar×3', 'Split III×1', 'Mana Dust×4']);
    expect(rows('dive-lost')).toEqual(['Iron bar×2']);
  });

  it('says when it brought nothing home, and shows no losses on an extract', () => {
    summary();
    expect(screen.getByTestId('dive-home')).toHaveTextContent('Brought homeNothing');
    expect(screen.queryByTestId('dive-lost')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/DiveSummary.test.tsx)`
Expected: FAIL, 3 failed | 2 passed: the abandon (`expect(element).toHaveTextContent()`: "EXTRACTED"), and `Unable to find an element by: [data-testid="dive-home"]` (twice).

- [ ] **Step 3: The summary**

In `packages/client/src/features/delve/DiveSummary.tsx`:

Replace:

```tsx
import type { DiveState } from '@alloy/engine';
import { RARITY_ORDER } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Button, Glyph, Price, reducedMotion } from './kit';
import { ItemTile } from './ItemTile';
import { RARITY_LABEL, RARITY_TEXT, formatNumber } from './format';
import { countRunes } from './chains/chain-text';
import { getDelveRegistry } from './registry';
import { runeName } from './runes/rune-style';

interface DiveSummaryProps {
```

with:

```tsx
import type { DiveState } from '@alloy/engine';
import { RARITY_ORDER } from '@alloy/engine';
import { Button, Price, reducedMotion } from './kit';
import { ItemTile } from './ItemTile';
import { RARITY_LABEL, RARITY_TEXT } from './format';
import { getDelveRegistry } from './registry';
import { haulRows } from './materials/material-style';
import { HaulList } from './materials/HaulList';

interface DiveSummaryProps {
```

Replace:

```tsx
}

/** A stepped glow behind the title: red for a fall, forge orange for an extract. */
const glow = (rgb: string) =>
  `radial-gradient(ellipse at 50% 35%, rgba(${rgb},0.22) 0 30%, rgba(${rgb},0.1) 30% 48%, transparent 48%), rgba(6,6,11,0.94)`;

/**
 * The dive's end, extracted or fallen: the depth and biome, what it cleared, killed and found, the
 * best find, the bounty claimed or lost and what salvage gave, then back to the Anvil or straight
 * in again.
 */
export function DiveSummary({ dive, biomeName, onCamp, onAgain, againLabel }: DiveSummaryProps) {
  const died = dive.phase === 'dead';
  const titleRef = useRef<HTMLHeadingElement>(null);
  const registry = getDelveRegistry();
  // The runes picked up this dive by name: this session's (after a reload, only their count).
  const diveRunes = useDelveStore((s) => s.diveRunes);
  const runeNames = countRunes(diveRunes)
    .map(({ rune, count }) => `${runeName(registry, rune)}${count > 1 ? ` ×${count}` : ''}`)
    .join(', ');

  useEffect(() => {
```

with:

```tsx
}

/** A stepped glow behind the title: red for a fall or an abandon, forge orange for an extract. */
const glow = (rgb: string) =>
  `radial-gradient(ellipse at 50% 35%, rgba(${rgb},0.22) 0 30%, rgba(${rgb},0.1) 30% 48%, transparent 48%), rgba(6,6,11,0.94)`;

/**
 * The dive's end, extracted, fallen or abandoned (an abandon settles the dive and leaves its
 * phase: it counts as a death): the depth and biome, what it cleared, killed and found, the best
 * find, the bounty claimed or lost, what it brought home (`dive.banked`) and what a death or an
 * abandon lost (`dive.lost`), then back to the Anvil or straight in again.
 */
export function DiveSummary({ dive, biomeName, onCamp, onAgain, againLabel }: DiveSummaryProps) {
  const extracted = dive.phase === 'extracted';
  const title = extracted ? 'EXTRACTED' : dive.phase === 'dead' ? 'YOU FELL' : 'ABANDONED';
  const titleRef = useRef<HTMLHeadingElement>(null);
  const registry = getDelveRegistry();
  const home = haulRows(registry, dive.banked);
  const lost = dive.lost ? haulRows(registry, dive.lost) : [];

  useEffect(() => {
```

Replace:

```tsx
    <div
      className="delve-ui delve-zoom absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8"
      style={{ background: glow(died ? '228,59,68' : '247,118,34') }}
      data-testid="dive-summary"
      data-pad-scope
```

with:

```tsx
    <div
      className="delve-ui delve-zoom absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8"
      style={{ background: glow(extracted ? '247,118,34' : '228,59,68') }}
      data-testid="dive-summary"
      data-pad-scope
```

Replace:

```tsx
        ref={titleRef}
        className="k-display m-0"
        style={{ color: died ? 'var(--k-bad-text)' : 'var(--k-hot-hi)' }}
      >
        {died ? 'YOU FELL' : 'EXTRACTED'}
      </h1>
      <p className="k-body-2 m-0">
```

with:

```tsx
        ref={titleRef}
        className="k-display m-0"
        style={{ color: extracted ? 'var(--k-hot-hi)' : 'var(--k-bad-text)' }}
      >
        {title}
      </h1>
      <p className="k-body-2 m-0">
```

Replace:

```tsx

      <div className="flex flex-col items-center gap-2 text-center">
        {died ? (
          <span className="text-[18px] text-[var(--k-text-2)]">
            Bounty lost:{' '}
            <s className="text-[var(--k-bad-text)]">
              <Price scrap={dive.bounty} />
            </s>
          </span>
        ) : (
          <span className="text-[18px] text-[var(--k-text-2)]">
            Bounty claimed:{' '}
            <b className="text-[var(--k-hot)]">
              <Price scrap={dive.bounty} />
            </b>
          </span>
        )}
        <span className="flex flex-wrap items-center justify-center gap-x-2 text-[15px] text-[var(--k-text-3)]">
          <span>
            <Price scrap={dive.scrapEarned} /> earned this dive
          </span>
          {dive.dustEarned > 0 && (
            <span className="flex items-center gap-1" data-testid="dive-dust">
              · <Glyph id="dust" size={16} /> {formatNumber(dive.dustEarned)} Mana Dust from salvage
            </span>
          )}
          {dive.linksEarned > 0 && (
            <span className="flex items-center gap-1" data-testid="dive-links">
              · <Glyph id="link" size={16} /> {dive.linksEarned} Link
              {dive.linksEarned > 1 ? 's' : ''} from salvaged weapons
            </span>
          )}
          {dive.runesEarned > 0 && (
            <span className="flex items-center gap-1" data-testid="dive-runes">
              · <Glyph id="rune" size={16} /> {dive.runesEarned} rune
              {dive.runesEarned > 1 ? 's' : ''} found
              {runeNames && `: ${runeNames}`}
            </span>
          )}
        </span>
      </div>

```

with:

```tsx

      <div className="flex flex-col items-center gap-2 text-center">
        {extracted ? (
          <span className="text-[18px] text-[var(--k-text-2)]">
            Bounty claimed:{' '}
            <b className="text-[var(--k-hot)]">
              <Price scrap={dive.bounty} />
            </b>
          </span>
        ) : (
          <span className="text-[18px] text-[var(--k-text-2)]">
            Bounty lost:{' '}
            <s className="text-[var(--k-bad-text)]">
              <Price scrap={dive.bounty} />
            </s>
          </span>
        )}
      </div>

      <div className="flex w-[560px] gap-4">
        <section
          className="k-plate k-scroll flex max-h-[240px] flex-1 flex-col gap-2 p-4"
          data-testid="dive-home"
        >
          <span className="k-label">Brought home</span>
          {home.length > 0 ? <HaulList rows={home} /> : <span className="k-caption">Nothing</span>}
        </section>
        {lost.length > 0 && (
          <section
            className="k-plate k-scroll flex max-h-[240px] flex-1 flex-col gap-2 p-4"
            data-testid="dive-lost"
          >
            <span className="k-label text-[var(--k-bad-text)]">Lost</span>
            <HaulList rows={lost} struck />
          </section>
        )}
      </div>

```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/DiveSummary.test.tsx)`
Expected: PASS, 5 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1180 in 148**.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/DiveSummary.tsx src/features/delve/__tests__/DiveSummary.test.tsx)
git add packages/client/src/features/delve/DiveSummary.tsx packages/client/src/features/delve/__tests__/DiveSummary.test.tsx
git commit -m "feat(client): the dive summary shows what the dive brought home and lost, and an abandon" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: The pause's Abandon and floor-restart labels

**Files:**
- Modify: `packages/client/src/features/delve/hub/PauseScreen.tsx`
- Modify (tests): `packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx`:

Replace:

```tsx
      'Settings',
      'Anvil · floor restarts',
      'Abandon · lose bounty',
      'Resume',
    ].map((s) => text.indexOf(s));
    expect(order.every((at, i) => at > (order[i - 1] ?? -1))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Anvil · floor restarts' }));
    expect(on.onAnvil).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Abandon · lose bounty' }));
    expect(on.onAbandon).toHaveBeenCalledTimes(1);
    expect(on.onResume).not.toHaveBeenCalled();
```

with:

```tsx
      'Settings',
      'Anvil · floor restarts',
      'Abandon · counts as a death',
      'Resume',
    ].map((s) => text.indexOf(s));
    expect(order.every((at, i) => at > (order[i - 1] ?? -1))).toBe(true);
    const anvil = screen.getByRole('button', { name: /^Anvil · floor restarts/ });
    // Its subtitle: the floor replays, so what it picked up and hasn't banked is lost.
    expect(anvil).toHaveTextContent("This floor's unbanked haul is lost");
    fireEvent.click(anvil);
    expect(on.onAnvil).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Abandon · counts as a death' }));
    expect(on.onAbandon).toHaveBeenCalledTimes(1);
    expect(on.onResume).not.toHaveBeenCalled();
```

Replace:

```tsx
  it('over the stop, the Anvil says the stop waits: nothing restarts', () => {
    const on = renderPause(undefined, true);
    expect(screen.queryByRole('button', { name: 'Anvil · floor restarts' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Anvil · back to this stop' }));
    expect(on.onAnvil).toHaveBeenCalledTimes(1);
```

with:

```tsx
  it('over the stop, the Anvil says the stop waits: nothing restarts', () => {
    const on = renderPause(undefined, true);
    expect(screen.queryByRole('button', { name: /^Anvil · floor restarts/ })).toBeNull();
    expect(screen.getByTestId('pause-anvil')).not.toHaveTextContent('haul');
    fireEvent.click(screen.getByRole('button', { name: 'Anvil · back to this stop' }));
    expect(on.onAnvil).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/PauseScreen.test.tsx)`
Expected: FAIL, 1 failed | 8 passed: the footer's order (`expected false to be true`: no "Abandon · counts as a death").

- [ ] **Step 3: The labels**

In `packages/client/src/features/delve/hub/PauseScreen.tsx`:

Replace:

```tsx
  atStop?: boolean;
  onResume: () => void;
  onAnvil: () => void; // floor restarts, or back to the stop
  onAbandon: () => void; // lose bounty
}

/** The footer's Tabs prompt, drawn only: the header's Tabs and the digit keys do the stepping. */
const TABS_PROMPT: Prompt = { id: 'tabs', label: 'Tabs', binding: { key: '1 – 5', pad: 'rb' } };
```

with:

```tsx
  atStop?: boolean;
  onResume: () => void;
  onAnvil: () => void; // floor restarts (its unbanked haul lost), or back to the stop
  onAbandon: () => void; // counts as a death: the bounty, the floor's haul and a share of the banked
}

/** A caption inside a kit button: body text, as the hub writes it, not the button's display caps. */
const CAPTION = {
  fontFamily: 'var(--k-font-body)',
  textTransform: 'none',
  letterSpacing: 0,
} as const;

/** The footer's Tabs prompt, drawn only: the header's Tabs and the digit keys do the stepping. */
const TABS_PROMPT: Prompt = { id: 'tabs', label: 'Tabs', binding: { key: '1 – 5', pad: 'rb' } };
```

Replace:

```tsx
            </Button>
            <Button onClick={onAnvil} testId="pause-anvil">
              {atStop ? 'Anvil · back to this stop' : 'Anvil · floor restarts'}
            </Button>
            <Button variant="danger" onClick={onAbandon} testId="pause-abandon">
              Abandon · lose bounty
            </Button>
            <Button
```

with:

```tsx
            </Button>
            <Button onClick={onAnvil} testId="pause-anvil">
              {atStop ? (
                'Anvil · back to this stop'
              ) : (
                <span className="flex flex-col items-start">
                  Anvil · floor restarts
                  <span className="k-caption" style={CAPTION}>
                    This floor's unbanked haul is lost
                  </span>
                </span>
              )}
            </Button>
            <Button variant="danger" onClick={onAbandon} testId="pause-abandon">
              Abandon · counts as a death
            </Button>
            <Button
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/PauseScreen.test.tsx)`
Expected: PASS, 9 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **1180 in 148**.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c1
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/PauseScreen.tsx src/features/delve/hub/__tests__/PauseScreen.test.tsx)
git add packages/client/src/features/delve/hub/PauseScreen.tsx packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx
git commit -m "feat(client): the pause's Abandon counts as a death; the floor restart loses its haul" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: Abandon settles the dive and shows the summary

`DelveRun`'s Abandon settles the dive as an abandon (the engine's `settleDive`, with the registry) instead of closing it, so the summary can show what it lost; the stop gives way to the summary; Return to the Anvil and Dive again close the dive as before (the store's `closeDive`, which Phase A gave the registry). The test mocks `settleDive` (B1's stub throws until B1 lands).

**Files:**
- Modify: `packages/client/src/pages/DelveRun.tsx`
- Modify (tests): `packages/client/src/pages/__tests__/DelveRun.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/pages/__tests__/DelveRun.test.tsx`:

Replace:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createDelveProfile, startDive } from '@alloy/engine';
import { createArenaInput } from '@/features/delve/arena/input';
import { getDelveRegistry } from '@/features/delve/registry';
```

with:

```tsx
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createDelveProfile, settleDive, startDive, type DelveProfile } from '@alloy/engine';
import { createArenaInput } from '@/features/delve/arena/input';
import { getDelveRegistry } from '@/features/delve/registry';
```

Replace:

```tsx
}));

vi.mock('@/features/gamepad/gamepad-hub', async (orig) => ({
  ...(await orig<object>()),
```

with:

```tsx
}));

// The engine's settle is stage 4c's B1: here an abandon settles the dive, two Iron bars lost.
vi.mock('@alloy/engine', async (orig) => {
  const real = await orig<typeof import('@alloy/engine')>();
  return {
    ...real,
    settleDive: vi.fn((_registry: unknown, p: DelveProfile) => ({
      ...p,
      dive: {
        ...p.dive!,
        settled: true,
        lost: real.addMaterial(real.emptyHaul(), { kind: 'metal', metal: 'iron' }, 2),
      },
    })),
  };
});

vi.mock('@/features/gamepad/gamepad-hub', async (orig) => ({
  ...(await orig<object>()),
```

Replace:

```tsx

describe('DelveRun', () => {
  beforeEach(() => {
    seen.pause.length = 0;
```

with:

```tsx

describe('DelveRun', () => {
  beforeAll(() => {
    // jsdom has no Web Animations; the summary's title entrance is cosmetic.
    if (!Element.prototype.animate)
      Element.prototype.animate = function () {
        return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
      };
  });

  beforeEach(() => {
    seen.pause.length = 0;
```

Replace:

```tsx
  });

  it("the pause's Anvil goes to the Anvil keeping the dive; Abandon closes the dive and goes there", () => {
    renderRun();
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
```

with:

```tsx
  });

  it("the pause's Anvil goes to the Anvil keeping the dive; Abandon settles it as a death, shows the summary, then closes it", () => {
    renderRun();
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
```

Replace:

```tsx
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abandon' }));
    expect(screen.getByTestId('anvil')).toBeInTheDocument();
    expect(useDelveStore.getState().profile.dive).toBeNull();
  });

  it('the Journal opens the pause on Quests', () => {
    const { container } = renderRun();
```

with:

```tsx
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abandon' }));
    expect(settleDive).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'abandon');
    expect(screen.queryByTestId('pause-stub')).toBeNull();
    const summary = screen.getByTestId('dive-summary');
    expect(summary).toHaveTextContent('ABANDONED');
    expect(within(screen.getByTestId('dive-lost')).getByTestId('haul-row')).toHaveTextContent(
      'Iron bar×2',
    );
    // The fight stays paused under the summary.
    expect(seen.paused.at(-1)).toBe(true);
    fireEvent.click(screen.getByTestId('return-camp'));
    expect(screen.getByTestId('anvil')).toBeInTheDocument();
    expect(useDelveStore.getState().profile.dive).toBeNull();
  });

  it('an abandon at the stop takes the stop away for the summary', () => {
    const { profile } = useDelveStore.getState();
    useDelveStore.setState({
      profile: {
        ...profile,
        dive: { ...profile.dive!, phase: 'choosing', doorChoices: ['winding'], stop: null },
      },
    });
    renderRun();
    fireEvent.click(
      within(screen.getByTestId('door-choice')).getByRole('button', { name: 'Menu' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abandon' }));
    expect(screen.queryByTestId('door-choice')).toBeNull();
    expect(screen.getByTestId('dive-summary')).toHaveTextContent('ABANDONED');
  });

  it('the Journal opens the pause on Quests', () => {
    const { container } = renderRun();
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx)`
Expected: FAIL, 2 failed | 8 passed: `expected "spy" to be called with arguments: [ Anything, Anything, 'abandon' ]` and `Unable to find an element by: [data-testid="dive-summary"]`.

- [ ] **Step 3: The abandon**

In `packages/client/src/pages/DelveRun.tsx`:

Replace:

```tsx
  drinkPotionBetweenFloors,
  extractDive,
  startDepthOptions,
  type GearItem,
```

with:

```tsx
  drinkPotionBetweenFloors,
  extractDive,
  settleDive,
  startDepthOptions,
  type GearItem,
```

Replace:

```tsx

  const choosing = dive?.phase === 'choosing';
  const finished = dive?.phase === 'dead' || dive?.phase === 'extracted';
  const paused = !!pause || fanfares.length > 0 || choosing || finished;
  // A layout effect, so the controller switches owner in the same commit as the
```

with:

```tsx

  const choosing = dive?.phase === 'choosing';
  // An abandon settles the dive where it stands (it counts as a death): the summary shows it too.
  const finished = dive?.phase === 'dead' || dive?.phase === 'extracted' || !!dive?.settled;
  const paused = !!pause || fanfares.length > 0 || choosing || finished;
  // A layout effect, so the controller switches owner in the same commit as the
```

Replace:

```tsx
  const resume = useCallback(() => setPause(null), []);
  const toAnvil = useCallback(() => navigate('/delve'), [navigate]);
  const abandon = useCallback(() => {
    setPause(null);
    onCamp();
  }, [onCamp]);

  if (!dive) return null;
```

with:

```tsx
  const resume = useCallback(() => setPause(null), []);
  const toAnvil = useCallback(() => navigate('/delve'), [navigate]);
  /** Abandon counts as a death (the crafting spec's S2): the dive settles, and the summary shows its losses. */
  const abandon = useCallback(() => {
    setPause(null);
    const s = useDelveStore.getState();
    s.setProfile(settleDive(registry, s.profile, 'abandon'));
  }, [registry]);

  if (!dive) return null;
```

Replace:

```tsx
      {banners[0] && <Banner key={banners[0].id} banner={banners[0]} onDone={popBanner} />}

      {choosing && (
        <div className="absolute inset-0 z-40" inert={!!pause}>
          <StopScreen
```

with:

```tsx
      {banners[0] && <Banner key={banners[0].id} banner={banners[0]} onDone={popBanner} />}

      {choosing && !finished && (
        <div className="absolute inset-0 z-40" inert={!!pause}>
          <StopScreen
```

- [ ] **Step 4: Run them to see them pass, then the suite and the build**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx)`
Expected: PASS, 10 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 12 tests in G + 2 files (**1181 in 148**).

Run: `(pnpm -F @alloy/client build)`
Expected: `tsc -b` silent, then Vite's `✓ built in …`.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c1
(cd packages/client && npx prettier --write --end-of-line auto src/pages/DelveRun.tsx src/pages/__tests__/DelveRun.test.tsx)
git add packages/client/src/pages/DelveRun.tsx packages/client/src/pages/__tests__/DelveRun.test.tsx
git commit -m "feat(client): abandon settles the dive as a death and shows the summary" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 5: The E2E and the gate

### Task 10: The dive's E2E (after B1 merges)

D02 follows the abandon through the summary, D03 reads the risk line, and D08 follows materials from the floor to the stop and an abandon's loss. **Run this task on `craft/main` after B1 has merged** (real material drops, `bankWorld` filling the haul, `completeFloor` banking it, `settleDive`); before then the bot's floors drop no materials and the abandon throws in B1's stub.

**Files:**
- Modify: `packages/client/e2e/delve.spec.ts`

- [ ] **Step 1: The tests**

In `packages/client/e2e/delve.spec.ts`:

Replace:

```ts
    await expect(pause.getByTestId('equip-locked')).toHaveText('Locked during the dive');

    // Abandon the dive (items are kept), and equip it at the Anvil (answering an off-pair
    // item's bind choice, which the compare pane shows in place of Equip; the pane stays).
    await pause.getByRole('button', { name: 'Abandon · lose bounty' }).click();
    await expect(page.getByTestId('delve-camp')).toBeVisible();
    const sheet = page.getByTestId('item-sheet');
```

with:

```ts
    await expect(pause.getByTestId('equip-locked')).toHaveText('Locked during the dive');

    // Abandon the dive (items are kept; it counts as a death: the summary, then the Anvil), and
    // equip it at the Anvil (answering an off-pair item's bind choice, which the compare pane
    // shows in place of Equip; the pane stays).
    await pause.getByRole('button', { name: 'Abandon · counts as a death' }).click();
    await expect(page.getByTestId('dive-summary')).toContainText('ABANDONED');
    await page.getByTestId('return-camp').click();
    await expect(page.getByTestId('delve-camp')).toBeVisible();
    const sheet = page.getByTestId('item-sheet');
```

Replace:

```ts
    await expect(door).toBeVisible({ timeout: 60_000 });
    await expect(door.getByRole('heading', { level: 1 })).toHaveText('Depth 1 cleared');
    await expect(door.getByTestId('floor-finds')).toContainText(
      'Already banked: yours even if you abandon.',
    );
    // At 1280×720 every door fits in its list, above Extract, without scrolling.
```

with:

```ts
    await expect(door).toBeVisible({ timeout: 60_000 });
    await expect(door.getByRole('heading', { level: 1 })).toHaveText('Depth 1 cleared');
    await expect(door.getByTestId('risk-line')).toHaveText(
      /^Banked this dive · dying loses \d+% of it$/,
    );
    // At 1280×720 every door fits in its list, above Extract, without scrolling.
```

Replace:

```ts
  });

  test('D06: the ability bar fits on screen', async ({ page }) => {
    // No bot, so the fight (and the HUD) stays up while we measure.
```

with:

```ts
  });

  test("D08: materials ride the floor's haul, bank at the stop, and an abandon loses a share", async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();

    // Picked up mid-floor: the purse counts this dive's materials, the Found log groups them.
    await expect(page.getByTestId('purse-materials')).toContainText(/\+[1-9]/, {
      timeout: 60_000,
    });
    await expect(
      page.getByTestId('pickup-feed').getByTestId('feed-material').first(),
    ).toBeVisible();

    // Banked at the clear: the stop lists the floor's materials over the risk line.
    const door = page.getByTestId('door-choice');
    await expect(door).toBeVisible({ timeout: 60_000 });
    await expect(door.getByTestId('loot-material').first()).toBeVisible();
    await expect(door.getByTestId('risk-line')).toBeVisible();

    // Abandon counts as a death: the summary shows what the dive brought home and what it lost.
    await door.getByRole('button', { name: 'Menu' }).click();
    await page
      .getByTestId('dive-pause')
      .getByRole('button', { name: 'Abandon · counts as a death' })
      .click();
    const summary = page.getByTestId('dive-summary');
    await expect(summary).toContainText('ABANDONED');
    await expect(summary.getByTestId('dive-home')).toBeVisible();
    await expect(summary.getByTestId('dive-lost').getByTestId('haul-row').first()).toBeVisible();
    await page.getByTestId('return-camp').click();
    await expect(page.getByTestId('delve-camp')).toBeVisible();
  });

  test('D06: the ability bar fits on screen', async ({ page }) => {
    // No bot, so the fight (and the HUD) stays up while we measure.
```

- [ ] **Step 2: Run them**

Start the dev server on 5288 and create `packages/client/playwright.scratch.config.ts` as the 4a conventions give them (`C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/runes/conventions-4a.md`, "Dev server on 5288" and "E2E scratch config"), then:

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts --project=desktop)`
Expected: every D test passes (D02 needs a gear find on the first floor; see X3.2). If D08's `dive-lost` is empty for this seed (each banked entry rounds its 40% stochastically, so a tiny bank can lose nothing), pass another seed to `seedProfile` in D08 rather than weaken the check. Delete the scratch config afterwards.

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/alloy-craft-c1
(cd packages/client && npx prettier --write --end-of-line auto e2e/delve.spec.ts)
git add packages/client/e2e/delve.spec.ts
git commit -m "test(client): the dive's E2E follows materials to the stop and an abandon's loss" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

After Task 9 (C1 alone, on Phase A):

```bash
cd /c/Projects/alloy-craft-c1
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
(pnpm -F @alloy/client build)
```

Expected: no type errors; **1181 tests in 148 files** (M + 12 in G + 2); the build succeeds.

After B1 merges (on `craft/main`), with the dev server and the autopilot (`alloy:delve:autopilot`), check by eye at 1920×1080 and 1280×720:
- materials burst from kills as small coloured pixels and fly in with a short trail; an essence stands still under its orange pillar with its plaque;
- the purse's materials entry counts up as they land, and its tooltip lists them; the Found log groups them above the gear;
- the stop lists the floor's materials, counts them, reads "Banked this dive · dying loses 40% of it", and the Gilded and Shrine doors show their multipliers (at 1280×720 three doors still fit above Extract: D03 checks it);
- the pause reads "Abandon · counts as a death"; its Anvil button carries "This floor's unbanked haul is lost" mid-floor and nothing at a stop;
- an abandon shows "ABANDONED" with "Brought home" and "Lost"; Dive again from there starts a fresh floor (a new arena, foes reset).

Then Task 10's E2E on `desktop` (Phase D runs it on `desktop-1080` with the responsive probes).
