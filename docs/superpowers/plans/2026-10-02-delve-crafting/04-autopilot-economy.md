# Delve component crafting (stage 4c) · B3: the autopilot and the economy — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The autopilot plays the materials economy as a sensible player: between dives (and once before the first, with the starter kit) it melts the gear it doesn't wear, refines flux and bars up, forges its gear from materials (a legendary first; the weapon and two armour pieces in its primary, the rest in its secondary), buys and refines shards, hones, still spends Links on slots and sockets and runes as today, binds a secondary after its first dive, extracts to bring home an essence or epic flux, and takes stops that spend what the dive banked. `economySim` reports the economy dive by dive for the DPS Lab's Economy view and the pacing rails. B1's two skipped pacing rails come back, the rails read forged gear, and the spec's four pacing targets become assertions, with the starting numbers tuned until they hold. A new save holds scrap in its starter kit, so the first forge is possible before any dive (S8).

**Architecture:** `delve/autopilot.ts`: `betweenDives` is one Anvil visit (`anvilVisit`), which sums each step's net outflow from the stockpile into `spent` and lists the items it forged; `runAutopilot` returns `economy: EconomyDive[]` beside its reports (a dive's `income` is its settled `banked` plus an extract's bounty, `lost` its settle's `lost`), and a fresh run visits the Anvil once before its first dive. The forging is `planForge` (a slot's pattern, a bar, the best flux, an essence that fits, the element by the split, the shards it wants) and `forgeSlot` (the highest bar it can pay for, when the forge beats the slot's item), through B2's `previewForge` and `forge`; the other steps go through B2's `refine`, `buyShard` and `hone` and the existing Links, runes and upgrade code. `delve/economy.ts`: `economySim` is `runAutopilot`'s economy with its final profile. The starter kit's scrap is `crafting.json → startingMaterials.scrap`.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-02-delve-component-crafting-design.md` (authoritative): "Engine shape → Autopilot", "Drops and the economy" (the pacing targets), "Tuning: every number in data" (the Economy view), S3, S8, S9; the B3 row of "Phases and parallel areas". Phase A: `01-contract.md` (`economySim`'s stub, `EconomyDive`, `EconomyReport`). The overview `00-overview.md` (its integrator notes pin `economySim`'s shape and what C3 assumes of it, and the S8 gap). B1: `02-drops-banking.md` (X3: the two skipped rails). B2: `03-forge-salvage.md` (X6).

---

## Base

- **Starts from:** `craft/main` at `8ea6ed4` (Phase A, B1, B2, C1, C2, C3 chunk 1 and the forge and salvage review fixes merged), in this area's worktree `C:/Projects/alloy-craft-b3` on branch `craft/b3`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-craft-b3 -Branch craft/b3 -Base craft/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-craft-b3` in Git Bash.
- **Anchors:** every edit was generated from, and checked against, `craft/main` at `8ea6ed4`: applied in this plan's order, task by task, they give exactly the files the runs below were made on (see "Checked on a scratch copy").
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-craft-b3
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the engine suite reads **1737 passed | 7 skipped** tests in **93 passed | 1 skipped** files (about 12 s, the pacing rails included); the client suite **1203 tests in 150 files**. Call them **N** engine tests in **F** files.

## Files

| File | Change |
|---|---|
| `packages/engine/src/delve/autopilot.ts` | `anvilVisit` (one visit to the Anvil, its `spent` and its forged items) behind `betweenDives`; `runAutopilot` returns `economy` (Task 1); the forging (`planForge`, `forgeSlot`, `forgeGear`, `legendaryWaits`), `refineSurplus`, `refineShards`, `honeGear`, the wait for a legendary's scrap, the opening visit, `bindPair` in place of `bindBest`, `pickDoor` extracting for an essence or epic flux, `takeBestStop` paying from `banked` (Task 2) — hand-edited, never formatted |
| `packages/engine/src/delve/economy.ts` | **Overwritten:** `EconomyDive.lost`, `EconomyReport.profile`, `economySim(registry, seed, dives, opts?)` (Task 1) |
| `packages/engine/src/types/crafting.ts` | `CraftingData.startingMaterials.scrap` (Task 2) |
| `packages/engine/src/data/schemas.ts` | `startingMaterials.scrap` in `CraftingDataSchema` (Task 2) |
| `packages/engine/src/data/crafting.json` | the kit: 3 uncommon flux and 60 scrap (Task 2) |
| `packages/engine/src/delve/profile.ts` | a new save's `scrap` from the kit (Task 2) |
| `packages/engine/src/data/balance.json` | `delve.drops.scrapByKind` 6 / 18 / 60, `elite.patternChance` 0.5, `delve.crafting.forgeScrap.legendary` 240 (Task 3) — hand-edited, never formatted |
| `packages/engine/tests/delve-autopilot-crafting.test.ts` (new) | `economySim` (Task 1); the autopilot at the Anvil and at a stop (Task 2) |
| `packages/engine/tests/delve-pacing.test.ts` | the two rails back (the legendaries rail reads forged legendaries), `economySim`'s runs, the pacing targets (Task 3) — hand-edited, never formatted |
| `packages/engine/tests/delve-save-v8.test.ts` | the kit's flux and scrap; the first forge before any dive (Task 2) |
| `packages/engine/tests/delve-crafting-data.test.ts` | the kit (Task 2); `scrapByKind` (Task 3) |
| `packages/engine/tests/delve-materials.test.ts`, `delve-dive.test.ts`, `delve-stops.test.ts` | a new save's flux and scrap are the kit's (Task 2) |
| `packages/engine/tests/delve-pair.test.ts` | the autopilot's bind: after its first dive, the first biome element other than its primary (Task 2) |
| `packages/engine/tests/delve-movesets.test.ts`, `delve-rune-power.test.ts` | their autopilot fixtures hold nothing to forge; the fused Primary binds Frost; the socket test's pair bound (Task 2) |

The engine test files outside the two above that this plan edits hold the autopilot's own tests (`describe('the autopilot …')`) and the starter kit's pins; Phase A, B1 and B2 wrote them and have merged, and no Phase C area edits engine files, so nothing else touches them while B3 runs. `index.ts` needs nothing: it exports `runAutopilot`, `takeBestStop` and their types, and `delve/economy.ts` whole.

## Cross-area needs

**X1 · The client's tests (the integrator, with Task 2's merge).** A new save now holds the kit's 60 scrap, and eight client tests in six files read it as 0. The client code needs nothing; the tests need these edits (checked on the scratch copy: with them, the client suite and typecheck pass against this plan's bundle, **1203 tests in 150 files**; every edited file stays Prettier-clean). In `packages/client/src/`:

1. `features/delve/hub/__tests__/AnvilHub.test.tsx`, replace:

```ts
    expect(screen.getByTestId('scrap-count')).toHaveTextContent(/^0 scrap$/);
```

with:

```ts
    expect(screen.getByTestId('scrap-count')).toHaveTextContent(/^60 scrap$/); // the starter kit's
```

2. `features/delve/hub/loadout/__tests__/ComparePane.test.tsx`, replace:

```ts
      equipped: { ...p.equipped, weapon: mine },
      bag: [rareSword('w1', { primary: 2 })],
    });
```

with:

```ts
      equipped: { ...p.equipped, weapon: mine },
      bag: [rareSword('w1', { primary: 2 })],
      scrap: 0,
    });
```

3. `features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```ts
    act(() => store().setProfile({ ...store().profile, links: 1 }));
    expect(screen.getByTestId('add-slot-why')).toHaveTextContent('Not enough scrap');
```

with:

```ts
    act(() => store().setProfile({ ...store().profile, links: 1, scrap: 0 }));
    expect(screen.getByTestId('add-slot-why')).toHaveTextContent('Not enough scrap');
```

4. `pages/__tests__/DelveCamp.test.tsx` and `features/delve/hub/__tests__/SystemMenu.test.tsx`, in each replace:

```ts
    expect(p).toMatchObject({ scrap: 0, dive: null, pair: { primary: null } });
```

with:

```ts
    expect(p).toMatchObject({ scrap: 60, dive: null, pair: { primary: null } }); // the starter kit's scrap
```

5. `stores/delveStore.test.ts`, replace:

```ts
    s.setProfile({ ...s.profile, bag: [{ ...item, mana: 'frost' }] });
```

with:

```ts
    s.setProfile({ ...s.profile, bag: [{ ...item, mana: 'frost' }], scrap: 0 });
```

replace:

```ts
  it('upgrade reports failure reasons', () => {
    const uid = useDelveStore.getState().profile.equipped.weapon!.uid;
```

with:

```ts
  it('upgrade reports failure reasons', () => {
    useDelveStore.getState().setProfile({ ...useDelveStore.getState().profile, scrap: 0 });
    const uid = useDelveStore.getState().profile.equipped.weapon!.uid;
```

and replace:

```ts
    expect(fresh.getState().profile).toMatchObject({ version: 8, scrap: 0 });
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!)).toMatchObject({
      version: 8,
      scrap: 0,
    });
```

with:

```ts
    expect(fresh.getState().profile).toMatchObject({ version: 8, scrap: 60 }); // the kit's
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!)).toMatchObject({
      version: 8,
      scrap: 60,
    });
```

Without them the client suite reads **8 failed | 1195 passed** against this plan's bundle. The Delve E2E reads no scrap count.

**X2 · C3 chunk 2 (the Economy view).** `economySim` is as the overview pins it: `economySim(registry, seed, dives, opts?: Pick<AutopilotOptions, 'primary' | 'secondary'>)`, `EconomyReport { seed, dives, profile }`, `EconomyDive { dive, income, spent, lost, forged, depth, died }`. What C3 assumes holds and is tested (`delve-autopilot-crafting.test.ts`, `delve-pacing.test.ts`): exactly `dives` entries in order; `income` what the dive brought into the stockpile after any loss (its settled `banked`, plus an extract's bounty); `spent` what the Anvil visit after it spent (each step's net outflow from the stockpile: refining, forging, Links on slots and sockets, runes fused, shards bought and refined, honing, upgrades, the Primary's edit; salvage gives, so it never counts); `lost` the settle's `lost` (null when the dive extracted, and the autopilot never abandons); every rarity key in `forged`; plain data (`structuredClone` keeps it). The visit before the first dive (the starter kit's) belongs to no dive and is not reported.

**X3 · Phase D.** The tuning here (see "Tuning") is the smallest set that makes the rails and the targets hold with margin; Phase D re-tunes with the Economy view. The progression is slower than at v0.57.1 (the Fire runs' mean depth at dive 12 is 28, against 35.5 then; dive 6, 15.75 against 25.8), which the rails allow. The lower Links income from the review fixes is absorbed: the autopilot spends only the Links it has.

## Where the spec left room

1. **"After dive 1: enough to forge a magic item"** is asserted as: the Anvil visit after dive 1 forges a magic item or better, on every Fire seed. It needs a magic flux, so the starter kit holds **3 uncommon flux** (S8 says 1; a tuning change, see "Tuning"): before its first dive the autopilot refines them into a magic flux and can't yet pay for a magic forge with what the refine leaves of the kit's 60 scrap, so its first dive's scrap pays for it.
2. **"A first epic by about dive 5"** counts a legendary as an epic or better (a legendary is an epic ingot and an essence): every Fire seed forges one by dive 6, and their mean is at most 5.
3. **"The first boss: a first legendary, forged"**: the Anvil visit after the first dive that brings home an essence forges a legendary. Banked flux is not exempt from the death share (S3), so the autopilot extracts to bring an essence or an epic flux home; and while an essence and epic flux wait for the scrap to forge them, it forges nothing else and spends no scrap (no Links, runes, shards, hones or upgrades).
4. **"Binds a secondary after dive 1 … the first non-primary element of a biome it fought"**: once its deepest depth is past 0, the first biome element (in depth order) that isn't its primary. Depth 1's biome (the Cinder Mines, Fire) is always fought, so every non-Fire hero binds Fire; a Fire hero whose first dive ended before the Frostvault takes the next biome's element, Frost (the spec wants a bind after dive 1).
5. **"The weapon and two armour slots in the primary"**: the weapon, the chest and the helm; the gloves, the boots, the amulet and the ring go to the secondary (to the primary until one is bound). An overtake may swap the pair later, as for a player; the rails hold either way.
6. **"The best affordable item per slot"**: per slot in the order weapon, chest, helm, gloves, boots, amulet, ring (the weapon gets the best flux first), after a legendary: the slot's own pattern (else the first learned), the best flux held (epic and an essence that fits the slot: a legendary), the highest bar whose forge it can pay for, its best shard of each affix it wants (damage, damage %, crit, crit damage, attack speed, its primary's Power, life, life %, armour, lifesteal, mana regen, cooldown, the item element's Attune), up to the rarity's lines. It forges only what beats the slot's item: a rarer one, or as rare and 5 item levels higher; an empty slot takes anything. The forged item waits in the bag; `transferBest` (the moveset moves onto a better weapon) and `equipBest` put it on, and what it replaced melts.
7. **"Hones while scrap allows"**: the equipped lines that rolled below their band's middle, the cheapest hone first (each hone dearer than the last). **"Refines surplus"**: every flux triple up, the lowest grade first; bars only while the best bar's band ends below the deepest depth (a forge's item level stops there), the highest triple first; shards, the triples of the affixes it wants. **"Buys a tier-I shard when it helps"**: the one that completes a triple of an affix it wants. The order: melt, refine, forge, equip and transfer, melt, then today's Links and runes, then shards, hones and upgrades.
8. **`spent`** sums each Anvil step's net outflow per entry (the refines are one step, so iron made from rusty bars and refined on into steel counts the rusty bars, not the iron). What a stop spends from the stockpile belongs to no Anvil visit and isn't counted.
9. **The opening visit.** `runAutopilot` visits the Anvil once before the first dive of a fresh run (S8: the kit's first forge), not when continuing from `opts.profile`; a forced `secondary` is bound before it.
10. **Stops (S9)** spend banked scrap first (B1's `takeStop`); `takeBestStop` no longer checks the stockpile's scrap before an upgrade and lets `takeStop` refuse.

## Tuning

Measured on the scratch copy with the rails' runs (4 Fire seeds × 12 dives, 2 Frost seeds, the 15-pair sweep at dive 6). With Phase A's numbers (and the kit's 3 flux and 60 scrap), the forging autopilot's Fire runs reach a mean depth of 12.3 by dive 12, no seed forges a magic item after dive 1 or a legendary after its first essence, and the sweep reads 3–12 around a median of 7: scrap is the wall (a kill pays a fifth of what salvaging today's gear paid, and most dives end in a death that loses the floor's haul and 40% of the rest). The numbers changed, and why:

| Number | Was | Now | Why |
|---|---|---|---|
| `crafting.json → startingMaterials.scrap` | — | 60 | S8: the first forge before any dive (the cheapest forge costs at least 10) — Task 2 |
| `crafting.json → startingMaterials.flux.uncommon` | 1 | 3 | the first target (refined into the magic flux the visit after dive 1 forges) — Task 2 |
| `delve.drops.scrapByKind` | 1 / 3 / 10 | 6 / 18 / 60 | kills now pay the scrap gear salvage paid; forging, refining and upgrades all spend it — Task 3 |
| `delve.drops.elite.patternChance` | 0.1 | 0.5 | the kit's three patterns fill two slots; elites teach the rest early enough for the first boss — Task 3 |
| `delve.crafting.forgeScrap.legendary` | 320 | 240 | the third target: the first essence's legendary forged on the visit after it — Task 3 |

The neighbourhood holds: each of these single changes from the numbers above passes every rail and target too (checked): `scrapByKind` 7 / 21 / 70, `patternChance` 0.45 or 0.55, `forgeScrap.legendary` 160 or 200. The rails' runs are chaotic (a small change reorders whole dives), so not every nearby set passes: `forgeScrap.legendary` 320 fails the sweep (a pair runs to 29 around a median of 14), and so does `scrapByKind` 8 / 24 / 80 at `patternChance` 0.5 (38 around 21). Phase D should tune with the Economy view across more seeds, not by the rails alone.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `craft/b3`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-craft-b3`.
- **Line endings:** the worktree checks the engine's files out CRLF; keep each file's own (the Edit tool does). Files written whole ("Create", "Overwrite") come out LF, which git stores the same. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** the commit blocks format only files a task creates or files that pass `prettier --check` at the base, and the code below is already formatted (checked). **Never formatted, only hand-edited:** `packages/engine/src/data/balance.json`, `src/delve/autopilot.ts` and `tests/delve-pacing.test.ts`. Never touch `tests/delve-chain-feel.test.ts` (raw 0xD7 byte).
- **How the edits read** (the 4a plan's language): "Replace: A with: B" is one Edit (old A, new B). "Replace the lines from `A` up to (not including) `B` with: C" is one Edit whose old text runs from the start of the line that reads `A` (ignoring its indentation) to the end of the line before the one that reads `B`, and whose new text is C; "…to the end of the file" runs to the file's last line. "Append at the end of `f`:" adds a blank line and the block after the last line. "Create `f`:" and "Overwrite `f`:" are a Write. Within a file, apply its edits top to bottom; every anchor is unique in its file at that point.
- **Import cycles:** `delve/autopilot.ts` imports `delve/economy.ts` for a type only; `economy.ts` imports `runAutopilot` and calls it at run time.
- **Every task runs the whole engine suite** (about 12 s, the pacing rails included) and the engine typecheck. Vitest doesn't type-check tests. The client is checked once, in Verification, against the rebuilt bundle (with X1).
- **Checked on a scratch copy:** a clone of `craft/main` at `8ea6ed4` with junctioned `node_modules`; every task's edits applied by a script that checks each anchor (unique, and each range's two lines), tests first and source second, so every FAIL and PASS below was run as written; the typecheck, the whole suite and `prettier --check` of every file a commit block formats were run after each task.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Some engine test files | `(cd packages/engine && npx vitest run tests/<file>.test.ts …)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine bundle (the client's) | `(cd packages/engine && npx tsup)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |

---

## Chunk 1: The economy report

### Task 1: `economySim`

`betweenDives` becomes one Anvil visit, `anvilVisit`, doing today's steps in today's order and summing each step's net outflow from the stockpile into `spent`; `runAutopilot` returns `economy` beside its reports; `economySim` returns that economy and the final profile. Nothing the autopilot does changes yet (it forges in Task 2), so the pacing rails read as before.

**Files:**
- Modify: `packages/engine/src/delve/autopilot.ts`
- Overwrite: `packages/engine/src/delve/economy.ts`
- Create: `packages/engine/tests/delve-autopilot-crafting.test.ts`

- [ ] **Step 1: The tests**

Create `packages/engine/tests/delve-autopilot-crafting.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runAutopilot } from '../src/delve/autopilot.js';
import { economySim } from '../src/delve/economy.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import { registry } from './fixtures/arena.js';

// See the crafting spec: "Engine shape → Autopilot" and the Economy view.

describe('economySim', () => {
  const report = economySim(registry, 1, 3);

  it('plays exactly the dives asked for, in order, from a new save, as the autopilot does', () => {
    expect(report.seed).toBe(1);
    expect(report.dives.map((d) => d.dive)).toEqual([1, 2, 3]);
    const run = runAutopilot(registry, { seed: 1, dives: 3 });
    expect(report.profile).toEqual(run.profile);
    expect(report.dives.map((d) => d.depth)).toEqual(run.reports.map((r) => r.endDepth));
    expect(report.dives.map((d) => d.died)).toEqual(run.reports.map((r) => r.result === 'dead'));
    expect(economySim(registry, 1, 3)).toEqual(report); // seeded: the same report
  });

  it("counts every rarity forged and a death's loss, never below zero, as plain data", () => {
    for (const d of report.dives) {
      expect(Object.keys(d.forged)).toEqual(RARITY_ORDER);
      expect(d.lost === null).toBe(!d.died);
      for (const h of [d.income, d.spent, ...(d.lost ? [d.lost] : [])]) {
        const counts = [
          h.scrap,
          h.dust,
          h.links,
          ...Object.values(h.metals),
          ...Object.values(h.flux),
        ];
        expect(Math.min(...counts)).toBeGreaterThanOrEqual(0);
      }
    }
    expect(structuredClone(report)).toEqual(report);
  });

  it('plays a forced pair', () => {
    const forced = economySim(registry, 2, 1, { primary: 'frost', secondary: 'fire' });
    expect(forced.dives).toHaveLength(1);
    expect(forced.profile.pair).toEqual({ primary: 'frost', secondary: 'fire' });
  });
});
```

- [ ] **Step 2: Run them, to see them fail**

```bash
(cd packages/engine && npx vitest run tests/delve-autopilot-crafting.test.ts)
```

Expected: FAIL: the file doesn't load (`Error: economySim: not implemented`, from the `describe`'s run): **1 failed** file, no tests.

- [ ] **Step 3: The Anvil visit and the economy**

Overwrite `packages/engine/src/delve/economy.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { Haul } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { Rarity } from '../types/gear.js';
import { runAutopilot, type AutopilotOptions } from './autopilot.js';

/** One dive of the economy sim (the DPS Lab's Economy view). */
export interface EconomyDive {
  dive: number;
  /** What the dive brought into the stockpile, after any loss: what it banked and kept, and an extract's bounty. */
  income: Haul;
  /** What the Anvil spent between this dive and the next: forging, refining, buying, Links, runes, honing, upgrades. */
  spent: Haul;
  /** What a death or an abandon lost: the floor's haul and the death share (null: nothing). */
  lost: Haul | null;
  /** Items forged on the Anvil visit after it, by rarity (every rarity, 0 where none). */
  forged: Record<Rarity, number>;
  /** The deepest depth reached. */
  depth: number;
  died: boolean;
}

export interface EconomyReport {
  seed: number;
  /** Exactly the dives asked for, in order. */
  dives: EconomyDive[];
  /** The profile after the last dive's Anvil visit. */
  profile: DelveProfile;
}

/**
 * The autopilot over `dives` dives from a new save (`opts`: its pair), the
 * economy dive by dive: the DPS Lab's Economy view and the pacing rails.
 * Plain data, so it crosses a worker's boundary.
 */
export function economySim(
  registry: DataRegistry,
  seed: number,
  dives: number,
  opts: Pick<AutopilotOptions, 'primary' | 'secondary'> = {},
): EconomyReport {
  const { profile, economy } = runAutopilot(registry, { seed, dives, ...opts });
  return { seed, dives: economy, profile };
}
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
import type { GearItem } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';
```

with:

```ts
import type { Haul } from '../types/crafting.js';
import type { GearItem, Rarity } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';
import { RARITY_ORDER } from '../types/gem.js';
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
import { upgradeCost } from '../loot/smithing.js';
```

with:

```ts
import { upgradeCost } from '../loot/smithing.js';
import { addHaul, emptyHaul } from '../loot/materials.js';
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
import { RUNE_TIERS, type RuneRef, type RuneTarget, type RuneTier } from '../types/rune.js';
```

with:

```ts
import { RUNE_TIERS, type RuneRef, type RuneTarget, type RuneTier } from '../types/rune.js';
import type { EconomyDive } from './economy.js';
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
/**
 * Between dives, as a player would: an overtaking secondary swaps in, a second
 * element is bound (before anything is salvaged), the forge visit, and then
 * the Primary of whatever weapon it wields is built from both elements.
 */
export function betweenDives(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const bound = bindBest(registry, resolveOvertake(registry, profile).profile);
  return fusePrimary(registry, visitForge(registry, bound));
}
```

with:

```ts
/** Between dives: a visit to the Anvil (`anvilVisit`). */
export function betweenDives(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  return anvilVisit(registry, profile).profile;
}
```

In `packages/engine/src/delve/autopilot.ts`:

Replace the lines from `* Between dives: move the moveset to a better weapon, equip upgrades, melt` to the end of the file with:

```ts
 * Upgrade its cheapest equipped item while the scrap lasts.
 */
function upgradeAll(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  for (;;) {
    const cheapest = cheapestUpgrade(registry, p);
    if (!cheapest || cheapest.cost > p.scrap) return p;
    const res = upgradeGear(registry, p, cheapest.uid);
    if (!res.ok) return p; // the forge refuses mid-dive (an open dive)
    p = res.profile;
  }
}

/** The stockpile as a haul: materials, scrap, Mana Dust, Links and runes. */
function stockOf(p: DelveProfile): Haul {
  return { ...p.materials, scrap: p.scrap, dust: p.manaDust, links: p.links, runes: p.runes };
}

/** `h` with every count passed through `f`. */
function mapHaul(h: Haul, f: (n: number) => number): Haul {
  const counts = <T extends Record<string, number>>(r: T) =>
    Object.fromEntries(Object.entries(r).map(([k, n]) => [k, f(n)])) as T;
  const tiers = (r: Partial<Record<string, number[]>>) =>
    Object.fromEntries(Object.entries(r).map(([k, ns]) => [k, ns!.map(f)]));
  return {
    metals: counts(h.metals),
    flux: counts(h.flux),
    shards: tiers(h.shards),
    essences: counts(h.essences),
    scrap: f(h.scrap),
    dust: f(h.dust),
    links: f(h.links),
    runes: tiers(h.runes),
  };
}

/** What went out of the stockpile from `before` to `after`, each count at least 0. */
function outflow(before: DelveProfile, after: DelveProfile): Haul {
  const diff = addHaul(stockOf(before), mapHaul(stockOf(after), (n) => -n));
  return mapHaul(diff, (n) => Math.max(0, n));
}

/** What a visit to the Anvil did: the profile after it, what it spent and the items it forged. */
interface AnvilVisit {
  profile: DelveProfile;
  /** Each step's net outflow from the stockpile, summed (salvage gives; it spends nothing). */
  spent: Haul;
  forged: GearItem[];
}

/**
 * The Anvil, between dives, as a player would: an overtaking secondary swaps
 * in and a second element is bound (before anything is salvaged); it moves its
 * moveset to a better weapon, equips upgrades and melts junk; spends Links on
 * slots up to `SOCKETS_AFTER` a chain, then on sockets for the pouch's runes
 * (each filled as it opens), then on the rest of the slots; sockets the best
 * runes and fuses the copies left over; pours the scrap into upgrades; and
 * builds the Primary of whatever weapon it wields from both elements.
 */
function anvilVisit(registry: DataRegistry, profile: DelveProfile): AnvilVisit {
  let p = bindBest(registry, resolveOvertake(registry, profile).profile);
  let spent = emptyHaul();
  const pay = (next: DelveProfile) => {
    spent = addHaul(spent, outflow(p, next));
    p = next;
  };
  pay(equipBest(registry, transferBest(registry, p)).profile);
  p = salvageItems(registry, p, salvageCandidates(registry, p, 'epic')).profile;
  // Links: slots up to SOCKETS_AFTER a chain, then sockets for the runes in the pouch, then
  // the rest of the slots. Runes: upgrade the filled sockets, then fuse only the copies left
  // over and socket again (a fused tier can beat a socketed one).
  pay(spendLinks(registry, p, SOCKETS_AFTER));
  pay(openSockets(registry, p));
  pay(spendLinks(registry, p));
  pay(socketBest(registry, p));
  pay(socketBest(registry, fusePouch(registry, p)));
  pay(upgradeAll(registry, p));
  pay(fusePrimary(registry, p));
  return { profile: p, spent, forged: [] };
}

/** What a dive brought into the stockpile: what it banked and kept, and an extract's bounty. */
function diveIncome(p: DelveProfile): Haul {
  const dive = p.dive!;
  const bounty = dive.phase === 'extracted' ? dive.bounty : 0;
  return { ...dive.banked, scrap: dive.banked.scrap + bounty };
}

export function runAutopilot(
  registry: DataRegistry,
  opts: AutopilotOptions,
): { profile: DelveProfile; reports: AutopilotDiveReport[]; economy: EconomyDive[] } {
  const maxDepth = opts.maxDepth ?? 100;
  const maxFloorSeconds = opts.maxFloorSeconds ?? 240;
  let p = opts.profile ?? createDelveProfile(registry, opts.seed, { primary: opts.primary ?? 'fire' });
  if (opts.secondary) p = fusePrimary(registry, bindSecondary(registry, p, opts.secondary).profile);
  const reports: AutopilotDiveReport[] = [];
  const economy: EconomyDive[] = [];

  for (let n = 0; n < opts.dives; n++) {
    const options = startDepthOptions(registry, p);
    const startDepth = options[options.length - 1];
    p = startDive(registry, p, startDepth);
    let seconds = 0;
    let result: AutopilotDiveReport['result'] = 'dead';

    while (p.dive && (p.dive.phase === 'fighting' || p.dive.phase === 'choosing')) {
      if (p.dive.phase === 'fighting') {
        const played = playFloor(registry, p, maxFloorSeconds);
        p = played.profile;
        seconds += played.seconds;
        continue;
      }
      p = takeBestStop(registry, p);
      if (p.dive!.depth >= maxDepth) {
        p = extractDive(registry, p);
        result = 'capped';
        break;
      }
      const door = pickDoor(p);
      if (!door) {
        p = extractDive(registry, p);
        result = 'extracted';
        break;
      }
      p = chooseDoor(registry, p, door);
    }

    const dive = p.dive!;
    reports.push({
      dive: n + 1,
      startDepth,
      endDepth: dive.depth,
      result: dive.phase === 'dead' ? 'dead' : result,
      power: profilePower(registry, p),
      kills: dive.kills,
      floorSeconds: Math.round(seconds),
      legendariesOwned: Object.keys(p.codex).length,
      reactionsSeen: p.reactionsSeen.length,
      scrap: p.scrap,
    });
    const visit = anvilVisit(registry, closeDive(registry, p));
    const forged = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>;
    for (const item of visit.forged) forged[item.rarity]++;
    economy.push({
      dive: n + 1,
      income: diveIncome(p),
      spent: visit.spent,
      lost: dive.lost,
      forged,
      depth: dive.depth,
      died: dive.phase === 'dead',
    });
    p = visit.profile;
  }
  return { profile: p, reports, economy };
}
```

(The line before the range, `/**`, stays: it opens `upgradeAll`'s comment, the first line above.)

- [ ] **Step 4: Run them, to see them pass**

```bash
(cd packages/engine && npx vitest run tests/delve-autopilot-crafting.test.ts)
```

Expected: PASS, **3 passed** (3).

- [ ] **Step 5: The whole suite and the typecheck**

```bash
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
```

Expected: no type errors; **N + 3** tests pass, **7** skipped, in **F + 1** files (1740 | 7 in 94 | 1). The pacing rails read as before: five run and pass, B1's two stay skipped.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-craft-b3
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/economy.ts tests/delve-autopilot-crafting.test.ts)
git add packages/engine/src/delve/autopilot.ts packages/engine/src/delve/economy.ts packages/engine/tests/delve-autopilot-crafting.test.ts
git commit -m "feat(engine): economySim: the autopilot's Anvil visits report income, spending, loss and forging dive by dive" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The forging autopilot and the starter kit

### Task 2: The autopilot forges; the starter kit holds scrap and three flux

Between dives (and once before the first) the autopilot melts the gear it doesn't wear, refines flux and bars up, forges (a legendary first; the weapon, the chest and the helm in its primary, the rest in its secondary), equips and transfers, melts what that replaced, spends Links and runes as today, buys and refines shards, hones and upgrades; while an essence and epic flux wait for the scrap to forge them, it holds that scrap. It binds the first biome element other than its primary once it has fought, extracts to bring home an essence or epic flux, and takes a stop's upgrade with banked scrap. A new save holds the kit's 60 scrap and 3 uncommon flux (S8: the first forge before any dive; the first pacing target). The two land together: either alone breaks the first-dive rail (checked: the kit's scrap on today's autopilot leaves seed 1 at depth 2 on dive 1, and the forging autopilot on Phase A's kit forges nothing on its first visits). The autopilot tests in other files follow (their fixtures hold nothing to forge; the bind rule is the spec's; the socket test in `delve-rune-power.test.ts` binds Nature itself, as today's autopilot did from the magic sword's lines before opening the sockets it counts; `takeBestStop` lets `takeStop`, which pays from the dive's banked scrap first, refuse an upgrade it can't pay), and so do the tests that read a new save's scrap or flux.

**Files:**
- Modify: `packages/engine/src/delve/autopilot.ts`, `src/types/crafting.ts`, `src/data/schemas.ts`, `src/data/crafting.json`, `src/delve/profile.ts`
- Test: `packages/engine/tests/delve-autopilot-crafting.test.ts`, `tests/delve-pair.test.ts`, `tests/delve-movesets.test.ts`, `tests/delve-rune-power.test.ts`, `tests/delve-save-v8.test.ts`, `tests/delve-crafting-data.test.ts`, `tests/delve-materials.test.ts`, `tests/delve-dive.test.ts`, `tests/delve-stops.test.ts`

- [ ] **Step 1: The tests**

In `packages/engine/tests/delve-autopilot-crafting.test.ts`, replace:

```ts
import { describe, it, expect } from 'vitest';
import { runAutopilot } from '../src/delve/autopilot.js';
import { economySim } from '../src/delve/economy.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import { registry } from './fixtures/arena.js';
```

with:

```ts
import { describe, it, expect } from 'vitest';
import { betweenDives, runAutopilot, takeBestStop } from '../src/delve/autopilot.js';
import { startDive } from '../src/delve/dive.js';
import { economySim } from '../src/delve/economy.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { honeCost } from '../src/loot/forge.js';
import { generateItem } from '../src/loot/item-generator.js';
import { emptyMaterials, withMaterial } from '../src/loot/materials.js';
import { upgradeCost } from '../src/loot/smithing.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { MaterialRef } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import { bal, registry } from './fixtures/arena.js';
```

Append at the end of `packages/engine/tests/delve-autopilot-crafting.test.ts`:

```ts
describe('the autopilot at the Anvil', () => {
  /** `refs` in a pouch, `n` of each. */
  const pouch = (n: number, ...refs: MaterialRef[]) =>
    refs.reduce((m, ref) => withMaterial(m, ref, n), emptyMaterials());
  /** A Fire hero, Frost bound, back from a dive to depth 6, holding `over`. */
  const hero = (over: Partial<DelveProfile> = {}): DelveProfile => {
    const p0 = createDelveProfile(registry, 4, { primary: 'fire' });
    const p = bindSecondary(registry, { ...p0, bestDepth: 6 }, 'frost').profile;
    const stats = { ...p.stats, dives: 1 };
    return { ...p, materials: emptyMaterials(), scrap: 0, stats, ...over };
  };

  it('forges a legendary first, then each slot it can improve: the weapon and two armour pieces in the primary, the rest in the secondary', () => {
    const materials = pouch(
      1,
      { kind: 'flux', grade: 'epic' },
      { kind: 'essence', essence: 'bedrock' }, // chest, boots or helm
    );
    const p = hero({
      materials: withMaterial(
        withMaterial(materials, { kind: 'metal', metal: 'iron' }, 5),
        { kind: 'flux', grade: 'magic' },
        2,
      ),
      patterns: ['sword', 'cuirass', 'dagger', 'gauntlets'],
      scrap: 5000,
    });
    const after = betweenDives(registry, p);
    const { weapon, chest, gloves } = after.equipped;
    expect(chest).toMatchObject({ rarity: 'legendary', mana: 'fire', ilvl: 6 });
    expect(chest!.legendary!.id).toBe('bedrock');
    expect(weapon).toMatchObject({ rarity: 'magic', mana: 'fire', baseId: 'sword' });
    expect(gloves).toMatchObject({ rarity: 'magic', mana: 'frost' });
    expect(after.materials.flux).toEqual({ uncommon: 0, magic: 0, rare: 0, epic: 0 });
    expect(after.materials.metals.iron).toBe(2);
    expect(after.materials.essences.bedrock).toBe(0);
  });

  it("keeps its scrap and its epic flux for an essence it can't yet pay to forge", () => {
    const materials = pouch(
      1,
      { kind: 'flux', grade: 'epic' },
      { kind: 'essence', essence: 'bedrock' },
      { kind: 'metal', metal: 'iron' },
    );
    const p = hero({ materials, scrap: 100 }); // a legendary at item level 6 costs more
    const after = betweenDives(registry, p);
    expect(after.scrap).toBe(100); // no upgrades either
    expect(after.materials).toEqual(materials);
    expect(after.equipped.chest!.rarity).toBe('common');
  });

  it('refines flux triples up, and bars up while its best bar forges below its deepest depth', () => {
    const materials = withMaterial(
      pouch(7, { kind: 'flux', grade: 'uncommon' }),
      { kind: 'metal', metal: 'rusty' },
      9,
    );
    const { refine } = bal.crafting;
    // No patterns, so nothing is forged: two magic flux, then rusty → iron ×3 → steel (band 10–15).
    const p = hero({
      materials,
      patterns: [],
      bestDepth: 12,
      scrap: 2 * refine.flux.scrap + 4 * refine.metal.scrap,
    });
    const after = betweenDives(registry, p);
    expect(after.materials.flux).toEqual({ uncommon: 1, magic: 2, rare: 0, epic: 0 });
    expect(after.materials.metals).toMatchObject({ rusty: 0, iron: 0, steel: 1 });
    expect(after.scrap).toBe(0);
  });

  it('buys the tier I shard that makes a triple of an affix it wants, and refines it', () => {
    const shards = pouch(2, { kind: 'shard', stat: 'damage', tier: 1 });
    const { scrap, dust } = bal.crafting.shardBench;
    const refine = bal.crafting.refine.shard.scrap[0];
    const p = hero({ materials: shards, patterns: [], scrap: scrap + refine, manaDust: dust });
    const after = betweenDives(registry, p);
    expect(after.materials.shards.damage).toEqual([0, 1]);
    expect([after.scrap, after.manaDust]).toEqual([0, 0]);
  });

  it('hones an equipped line that rolled below the middle of its band', () => {
    const ring = generateItem(
      registry,
      { uid: 'r', ilvl: 6, rarity: 'magic', slot: 'ring', mana: 'frost' },
      new SeededRNG(3),
    );
    const low = { ...ring, affixes: ring.affixes.map((a) => ({ ...a, roll: 0.05 })) };
    const p = hero({ patterns: [], scrap: honeCost(registry, low) });
    const after = betweenDives(registry, { ...p, equipped: { ...p.equipped, ring: low } });
    expect(after.equipped.ring!.hones).toBe(1);
    expect(after.scrap).toBe(0);
  });

  it("takes a stop's upgrade with the scrap the dive banked (stops spend banked first)", () => {
    const p = startDive(registry, hero(), 1);
    const cost = upgradeCost(registry, p.equipped.weapon!)!; // its cheapest (first on a tie)
    const dive = p.dive!;
    const atStop: DelveProfile = {
      ...p,
      dive: {
        ...dive,
        phase: 'choosing',
        doorChoices: ['winding'],
        stop: { offers: ['upgrade'], taken: false },
        banked: { ...dive.banked, scrap: cost },
      },
    };
    const after = takeBestStop(registry, atStop);
    expect(after.equipped.weapon!.upgrade).toBe(1);
    expect([after.scrap, after.dive!.banked.scrap]).toEqual([0, 0]);
  });
});
```

In `packages/engine/tests/delve-pair.test.ts`, replace the lines from `/** Storm gear worse than the starter sword (no damage line): junk, salvaged between dives. */` up to (not including) `it('binds a given secondary before the first dive, and its fused Primary finds their reaction', () => {` with:

```ts
  /** A `primary` hero back from its first dive (to depth 3), Mana Dust enough to fuse its Primary. */
  const back = (primary: ManaType): DelveProfile => {
    const p = createDelveProfile(registry, 5, { primary });
    const stats = { ...p.stats, dives: 1 };
    return { ...p, bestDepth: 3, manaDust: bal.movesets.elementDust, stats };
  };

  it('binds nothing before its first dive', () => {
    const after = betweenDives(registry, createDelveProfile(registry, 5, { primary: 'fire' }));
    expect(after.pair.secondary).toBeNull();
  });

  it("after its first dive, binds the first biome's element other than its primary, and builds its Primary from both", () => {
    // Depth 1's Cinder Mines are Fire: a Fire hero takes the next biome's Frost, any other Fire.
    const fire = betweenDives(registry, back('fire'));
    expect(fire.pair).toEqual({ primary: 'fire', secondary: 'frost' });
    expect(primaryElements(fire)).toEqual(['fire+frost']);
    const earth = betweenDives(registry, back('earth'));
    expect(earth.pair).toEqual({ primary: 'earth', secondary: 'fire' });
    expect(primaryElements(earth)).toEqual(['earth+fire']);
  });
```

In `packages/engine/tests/delve-movesets.test.ts`, replace:

```ts
import { generateItem } from '../src/loot/item-generator.js';
```

with:

```ts
import { generateItem } from '../src/loot/item-generator.js';
import { emptyMaterials } from '../src/loot/materials.js';
```

In `packages/engine/tests/delve-movesets.test.ts`, replace:

```ts
  /** A Fire hero after its first dive, wielding `w` (the starter sword by default). */
  const veteran = (w?: GearItem): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const weapon = w ?? p.equipped.weapon!;
    return { ...p, equipped: { ...p.equipped, weapon }, stats: { ...p.stats, dives: 1 } };
  };
```

with:

```ts
  /** A Fire hero after its first dive, wielding `w` (the starter sword by default), with nothing to forge. */
  const veteran = (w?: GearItem): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const weapon = w ?? p.equipped.weapon!;
    return {
      ...p,
      equipped: { ...p.equipped, weapon },
      materials: emptyMaterials(),
      stats: { ...p.stats, dives: 1 },
    };
  };
```

In `packages/engine/tests/delve-movesets.test.ts`, replace:

```ts
    const helm = generateItem(
      registry,
      { uid: 'h', ilvl: 2, rarity: 'common', slot: 'helm', mana: 'storm' },
      new SeededRNG(3),
    );
    const p = { ...veteran(), bag: [helm] };
    const primary = (q: DelveProfile) => chainsOf(q).primary!.moves.map((m) => m.elements);
    const poor = betweenDives(registry, p);
    expect(poor.pair.secondary).toBe('storm');
    expect(primary(poor)).toEqual([['fire']]);
    const paid = betweenDives(registry, { ...p, manaDust: bal.movesets.elementDust });
    expect(primary(paid)).toEqual([['fire', 'storm']]);
```

with:

```ts
    const p = { ...veteran(), bestDepth: 3 }; // it has fought: it binds Frost
    const primary = (q: DelveProfile) => chainsOf(q).primary!.moves.map((m) => m.elements);
    const poor = betweenDives(registry, p);
    expect(poor.pair.secondary).toBe('frost');
    expect(primary(poor)).toEqual([['fire']]);
    const paid = betweenDives(registry, { ...p, manaDust: bal.movesets.elementDust });
    expect(primary(paid)).toEqual([['fire', 'frost']]);
```

In `packages/engine/tests/delve-rune-power.test.ts`, replace:

```ts
import { generateItem } from '../src/loot/item-generator.js';
```

with:

```ts
import { generateItem } from '../src/loot/item-generator.js';
import { emptyMaterials } from '../src/loot/materials.js';
```

In `packages/engine/tests/delve-rune-power.test.ts`, replace:

```ts
  /** A Fire hero after its first dive (past the free edits), wielding `weapon` (its starter sword by default). */
  const veteran = (weapon?: GearItem): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    return {
      ...p,
      equipped: { ...p.equipped, weapon: weapon ?? p.equipped.weapon! },
      stats: { ...p.stats, dives: 1 },
    };
  };
```

with:

```ts
  /** A Fire hero after its first dive (past the free edits), wielding `weapon` (its starter sword by default), with nothing to forge. */
  const veteran = (weapon?: GearItem): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    return {
      ...p,
      equipped: { ...p.equipped, weapon: weapon ?? p.equipped.weapon! },
      materials: emptyMaterials(),
      stats: { ...p.stats, dives: 1 },
    };
  };
```

In `packages/engine/tests/delve-rune-power.test.ts`, replace:

```ts
    // Every chain it carries at its cap of 5, so no Link goes to a slot; two sockets a move.
    const full = withChains(veteran(magic), {
```

with:

```ts
    // Every chain it carries at its cap of 5, so no Link goes to a slot; two sockets a move; Fire
    // and Nature bound.
    const pair = { primary: 'fire', secondary: 'nature' } as const;
    const bound: DelveProfile = { ...veteran(magic), pair };
    const full = withChains(bound, {
```

In `packages/engine/tests/delve-save-v8.test.ts`, replace:

```ts
import { emptyHaul } from '../src/loot/materials.js';
```

with:

```ts
import { previewForge } from '../src/loot/forge.js';
import { emptyHaul } from '../src/loot/materials.js';
```

In `packages/engine/tests/delve-save-v8.test.ts`, replace:

```ts
  it('starts with the starter kit: three patterns, 5 Rusty bars and an uncommon flux', () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    expect(p.version).toBe(8);
    expect(p.patterns).toEqual(['sword', 'cuirass', 'dagger']);
    expect(p.materials.metals).toMatchObject({ rusty: 5, iron: 0 });
    expect(p.materials.flux).toEqual({ uncommon: 1, magic: 0, rare: 0, epic: 0 });
```

with:

```ts
  it('starts with the starter kit: three patterns, 5 Rusty bars, 3 uncommon flux and 60 scrap', () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    expect(p.version).toBe(8);
    expect(p.patterns).toEqual(['sword', 'cuirass', 'dagger']);
    expect(p.materials.metals).toMatchObject({ rusty: 5, iron: 0 });
    expect(p.materials.flux).toEqual({ uncommon: 3, magic: 0, rare: 0, epic: 0 });
    expect(p.scrap).toBe(60);
```

In `packages/engine/tests/delve-save-v8.test.ts`, replace:

```ts
    expect(registry.getCraftingData().startingMaterials.metals).toEqual({ rusty: 5 });
  });
```

with:

```ts
    expect(registry.getCraftingData().startingMaterials.metals).toEqual({ rusty: 5 });
  });

  it("can forge before its first dive (the crafting spec's S8): an uncommon sword from the kit", () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    const preview = previewForge(registry, p, {
      baseId: 'sword',
      metal: 'rusty',
      flux: 'uncommon',
      element: 'fire',
      shards: [],
    });
    expect(preview.price.scrap).toBeGreaterThan(0);
    expect(preview.refused).toBeNull(); // the kit's scrap pays for it
  });
```

In `packages/engine/tests/delve-crafting-data.test.ts`, replace:

```ts
  it("knows the starter kit: the sword's, the cuirass's and the dagger's patterns, 5 Rusty bars and an uncommon flux", () => {
    expect(data.startingPatterns).toEqual(['sword', 'cuirass', 'dagger']);
    for (const id of data.startingPatterns) expect(registry.getGearBase(id).id).toBe(id);
    expect(data.startingMaterials).toEqual({ metals: { rusty: 5 }, flux: { uncommon: 1 } });
```

with:

```ts
  it("knows the starter kit: the sword's, the cuirass's and the dagger's patterns, 5 Rusty bars, 3 uncommon flux and 60 scrap", () => {
    expect(data.startingPatterns).toEqual(['sword', 'cuirass', 'dagger']);
    for (const id of data.startingPatterns) expect(registry.getGearBase(id).id).toBe(id);
    expect(data.startingMaterials).toEqual({
      metals: { rusty: 5 },
      flux: { uncommon: 3 },
      scrap: 60,
    });
```

In `packages/engine/tests/delve-materials.test.ts`, replace:

```ts
    expect(next.materials.flux).toMatchObject({ uncommon: 1, magic: 2 });
    expect(next.materials.metals.rusty).toBe(5);
    expect([next.scrap, next.manaDust, next.links]).toEqual([40, 3, 1]);
```

with:

```ts
    expect(next.materials.flux).toMatchObject({ uncommon: 3, magic: 2 });
    expect(next.materials.metals.rusty).toBe(5);
    expect([next.scrap, next.manaDust, next.links]).toEqual([p.scrap + 40, 3, 1]);
```

In `packages/engine/tests/delve-dive.test.ts`, replace:

```ts
    let p = createDelveProfile(registry, 3);
    const uid = p.equipped.weapon!.uid;
    expect(upgradeGear(registry, p, uid).ok).toBe(false);
```

with:

```ts
    let p = { ...createDelveProfile(registry, 3), scrap: 0 };
    const uid = p.equipped.weapon!.uid;
    expect(upgradeGear(registry, p, uid).ok).toBe(false);
```

In `packages/engine/tests/delve-stops.test.ts`, replace:

```ts
    const p = { ...p0, stats: { ...p0.stats, dives: 1 } }; // past the free edits
```

with:

```ts
    const p = { ...p0, scrap: 0, stats: { ...p0.stats, dives: 1 } }; // past the free edits
```

- [ ] **Step 2: Run them, to see them fail**

```bash
(cd packages/engine && npx vitest run tests/delve-autopilot-crafting.test.ts tests/delve-pair.test.ts tests/delve-movesets.test.ts tests/delve-rune-power.test.ts tests/delve-save-v8.test.ts tests/delve-crafting-data.test.ts tests/delve-materials.test.ts tests/delve-dive.test.ts tests/delve-stops.test.ts)
```

Expected: FAIL, **12 failed | 182 passed** (194), in 6 of the 9 files. The six Anvil tests: `expected { uid: 'g1', slot: 'chest', …(11) } to match object { rarity: 'legendary', …(2) }`, `expected 24 to be 100`, `expected { uncommon: 7, magic: +0, …(2) } to deeply equal { uncommon: 1, magic: 2, …(2) }`, `expected [ 2 ] to deeply equal [ +0, 1 ]`, and `expected +0 to be 1` for the hone and the stop. The two binds: `expected { primary: 'fire', secondary: null } to deeply equal { primary: 'fire', secondary: 'frost' }` and `expected null to be 'frost'`. The kit: save v8's `expected { uncommon: 1, magic: +0, …(2) } to deeply equal { uncommon: 3, magic: +0, …(2) }` and `expected { code: 'scrap', …(1) } to be null`, crafting.json's `expected { metals: { rusty: 5 }, …(1) } to deeply equal { metals: { rusty: 5 }, …(2) }`, and the stocked haul's `expected { uncommon: 1, magic: 2, …(2) } to match object { uncommon: 3, magic: 2 }`.

- [ ] **Step 3: The starter kit and the forging autopilot**

In `packages/engine/src/types/crafting.ts`, replace:

```ts
  /** The materials a new save holds. */
  startingMaterials: {
    metals: Partial<Record<MetalId, number>>;
    flux: Partial<Record<FluxGrade, number>>;
  };
```

with:

```ts
  /** The materials and scrap a new save holds. */
  startingMaterials: {
    metals: Partial<Record<MetalId, number>>;
    flux: Partial<Record<FluxGrade, number>>;
    scrap: number;
  };
```

In `packages/engine/src/data/schemas.ts`, replace:

```ts
    flux: z.record(FluxGradeSchema, z.number().int().min(0)),
  }),
});
```

with:

```ts
    flux: z.record(FluxGradeSchema, z.number().int().min(0)),
    scrap: z.number().int().min(0),
  }),
});
```

In `packages/engine/src/data/crafting.json`, replace:

```json
  "startingMaterials": { "metals": { "rusty": 5 }, "flux": { "uncommon": 1 } }
```

with:

```json
  "startingMaterials": { "metals": { "rusty": 5 }, "flux": { "uncommon": 3 }, "scrap": 60 }
```

In `packages/engine/src/delve/profile.ts`, replace:

```ts
    bag: [],
    scrap: 0,
    bestDepth: 0,
```

with:

```ts
    bag: [],
    scrap: kit.startingMaterials.scrap,
    bestDepth: 0,
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
import type { Haul } from '../types/crafting.js';
import type { GearItem, Rarity } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';
import { RARITY_ORDER } from '../types/gem.js';
import { MANA_TYPES, emptyManaMap, type ManaType } from '../types/mana.js';
import { upgradeCost } from '../loot/smithing.js';
```

with:

```ts
import type { GearItem, GearSlot, HeroStatKey, Rarity } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';
import { RARITY_ORDER, rarityIndex } from '../types/gem.js';
import type { ManaType } from '../types/mana.js';
import {
  FLUX_GRADES,
  METAL_IDS,
  type ForgeRequest,
  type Haul,
  type ShardRef,
} from '../types/crafting.js';
import { upgradeCost } from '../loot/smithing.js';
import { honeCost, previewForge } from '../loot/forge.js';
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
import { compareItem, itemAttunement, type WeaponValue } from './hero-stats.js';
```

with:

```ts
import { compareItem, type WeaponValue } from './hero-stats.js';
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
import { addSlot, movesOf, setChain, transferMoveset, withMove } from './moveset.js';
```

with:

```ts
import { buyShard, forge, hone, refine } from './crafting.js';
import { addSlot, movesOf, setChain, transferMoveset, withMove } from './moveset.js';
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
 * floor (its gear locked, loot to the bag), picks doors, extracts when spent,
 * and between dives moves its moveset to a better weapon, equips upgrades,
 * forges, adds slots and sockets runes. Used by the pacing test and for balance sweeps.
```

with:

```ts
 * floor (its gear locked, loot to the bag, materials to the haul), picks
 * doors, extracts when spent, and between dives (and once before the first)
 * visits the Anvil: forges its gear from materials, moves its moveset to a
 * better weapon, salvages what it doesn't wear, adds slots and sockets runes,
 * hones and upgrades. Used by the pacing test, `economySim` and for balance sweeps.
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
  /** Continue from an existing profile instead of a fresh one. */
```

with:

```ts
  /** Continue from an existing profile instead of a fresh one (no opening Anvil visit). */
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
function pickDoor(profile: DelveProfile): string | null {
  const dive = profile.dive!;
```

with:

```ts
/**
 * The next door, or null to extract: when spent (low on life, no potions, no
 * shrine), or to bring home an essence or epic flux it has banked.
 */
function pickDoor(profile: DelveProfile): string | null {
  const dive = profile.dive!;
  if (dive.banked.flux.epic > 0 || Object.values(dive.banked.essences).some((n) => n > 0)) return null;
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
/**
 * Bind the non-primary element the bot owns the most attunement in (equipped
 * and bagged: each item's base plus its `*Attune` lines; ties in MANA_TYPES
 * order), none while that's all 0: every pair reacts.
 */
function bindBest(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const primary = profile.pair.primary;
  if (!primary) return profile;
  let p = profile;
  if (!p.pair.secondary) {
    const owned = emptyManaMap();
    for (const item of [...GEAR_SLOTS.map((s) => p.equipped[s]), ...p.bag]) {
      if (!item) continue;
      const a = itemAttunement(registry, item);
      for (const m of MANA_TYPES) owned[m] += a[m];
    }
    let best: ManaType | null = null;
    for (const m of MANA_TYPES) if (m !== primary && owned[m] > (best ? owned[best] : 0)) best = m;
    if (!best) return p;
    p = bindSecondary(registry, p, best).profile;
  }
  return p;
}
```

with:

```ts
/**
 * Once it has fought (its deepest depth past 0: after its first dive), bind a
 * second element: the first of the biomes' elements, in depth order, other
 * than its primary (depth 1's biome is always fought; a hero whose primary
 * that is takes the next biome's).
 */
function bindPair(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const { primary, secondary } = profile.pair;
  if (!primary || secondary || profile.bestDepth === 0) return profile;
  const mana = registry
    .getDelveData()
    .biomes.map((b) => b.mana)
    .find((m) => m !== primary);
  return mana ? bindSecondary(registry, profile, mana).profile : profile;
}
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
    const upgraded =
      cheapest && cheapest.cost <= profile.scrap && take({ kind: 'upgrade', uid: cheapest.uid });
```

with:

```ts
    const upgraded = cheapest && take({ kind: 'upgrade', uid: cheapest.uid });
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
/** The stockpile as a haul: materials, scrap, Mana Dust, Links and runes. */
```

with:

```ts
/** The order it forges in, so what matters most gets the best flux first. */
const FORGE_ORDER: readonly GearSlot[] = ['weapon', 'chest', 'helm', 'gloves', 'boots', 'amulet', 'ring'];
/** The slots it forges in its primary (the weapon and two armour pieces); the rest in its secondary, so both grow. */
const PRIMARY_SLOTS: readonly GearSlot[] = ['weapon', 'chest', 'helm'];
/** Item levels a forge must gain on its slot's item at the same rarity. */
const ILVL_STEP = 5;

/** The affixes it wants on an item of `element`, most wanted first: its shards go to these. */
function wanted(p: DelveProfile, element: ManaType): HeroStatKey[] {
  const power = `${p.pair.primary ?? element}Power` as HeroStatKey;
  const attune = `${element}Attune` as HeroStatKey;
  return [
    'damage',
    'damagePct',
    'critChance',
    'critDamage',
    'attackSpeedPct',
    power,
    'maxHp',
    'hpPct',
    'armor',
    'lifesteal',
    'manaRegen',
    'cooldownReduction',
    attune,
  ];
}

/** Its best shard of each affix it wants on `slot`, highest tier first, up to `lines`. */
function shardsFor(
  registry: DataRegistry,
  p: DelveProfile,
  slot: GearSlot,
  element: ManaType,
  lines: number,
): ShardRef[] {
  const out: ShardRef[] = [];
  for (const stat of wanted(p, element)) {
    if (out.length >= lines) break;
    if (!registry.getGearAffix(stat)?.slots.includes(slot)) continue;
    const tiers = p.materials.shards[stat] ?? [];
    for (let tier = tiers.length; tier >= 1; tier--)
      if ((tiers[tier - 1] ?? 0) > 0) {
        out.push({ stat, tier });
        break;
      }
  }
  return out;
}

/**
 * The forge it would make for `slot` with `metal` (by default its highest
 * bar): the slot's own pattern (else the first learned), its best flux (epic
 * with an essence that fits: a legendary), the slot's element by the split and
 * its shards; null without a pattern or a bar.
 */
function planForge(
  registry: DataRegistry,
  p: DelveProfile,
  slot: GearSlot,
  metal = [...METAL_IDS].reverse().find((m) => p.materials.metals[m] > 0),
): ForgeRequest | null {
  const own = p.equipped[slot]?.baseId;
  const baseId =
    own && p.patterns.includes(own)
      ? own
      : registry.getGearBasesForSlot(slot).find((b) => p.patterns.includes(b.id))?.id;
  if (!baseId || !metal) return null;
  const flux = [...FLUX_GRADES].reverse().find((g) => p.materials.flux[g] > 0);
  const essence =
    flux === 'epic'
      ? Object.keys(p.materials.essences).find(
          (id) => p.materials.essences[id] > 0 && registry.getLegendary(id).slots.includes(slot),
        )
      : undefined;
  const { primary, secondary } = p.pair;
  const element = (PRIMARY_SLOTS.includes(slot) ? primary : (secondary ?? primary)) ?? 'fire';
  const rarity: Rarity = essence ? 'legendary' : (flux ?? 'common');
  const lines = registry.getDelveBalance().loot.affixCount[rarity];
  return {
    baseId,
    metal,
    ...(flux ? { flux } : {}),
    ...(essence ? { essence } : {}),
    element,
    shards: shardsFor(registry, p, slot, element, lines),
  };
}

/**
 * Forge `slot`'s planned item with the highest bar it can pay for, when that
 * beats what the slot wears: a rarer one, or as rare and `ILVL_STEP` item
 * levels higher (an empty slot takes anything). Null when it doesn't forge.
 */
function forgeSlot(registry: DataRegistry, p: DelveProfile, slot: GearSlot): DelveProfile | null {
  const now = p.equipped[slot];
  for (const metal of [...METAL_IDS].reverse()) {
    if (p.materials.metals[metal] === 0) continue;
    const req = planForge(registry, p, slot, metal);
    if (!req) return null;
    const preview = previewForge(registry, p, req);
    const up = now ? rarityIndex(preview.rarity) - rarityIndex(now.rarity) : 1;
    if (up < 0 || (up === 0 && preview.ilvl < now!.ilvl + ILVL_STEP)) return null;
    if (preview.refused) continue;
    const res = forge(registry, p, req);
    return res.ok ? res.profile : null;
  }
  return null;
}

/** Whether it holds an essence and epic flux for a slot it knows a pattern for: a legendary to forge. */
function legendaryWaits(registry: DataRegistry, p: DelveProfile): boolean {
  return FORGE_ORDER.some((slot) => planForge(registry, p, slot)?.essence !== undefined);
}

/**
 * Forge its legendary first (the essence goes into the first slot in
 * `FORGE_ORDER` it fits), then, unless one still waits for its scrap, every
 * other slot it can improve in `FORGE_ORDER`. The new items wait in the bag for
 * the transfer and `equipBest`.
 */
function forgeGear(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  const done = FORGE_ORDER.find((slot) => planForge(registry, p, slot)?.essence !== undefined);
  if (done) p = forgeSlot(registry, p, done) ?? p;
  if (legendaryWaits(registry, p)) return p;
  for (const slot of FORGE_ORDER) if (slot !== done) p = forgeSlot(registry, p, slot) ?? p;
  return p;
}

/**
 * Refine flux up wherever it holds a triple, the lowest grade first so a
 * refined one can make a triple above it; and, while its best bar's band ends
 * below its deepest depth (a forge's item level stops there), the highest bar
 * it holds a triple of.
 */
function refineSurplus(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  const step = (ref: Parameters<typeof refine>[2]) => {
    const res = refine(registry, p, ref);
    if (res.ok) p = res.profile;
    return res.ok;
  };
  for (const grade of FLUX_GRADES) while (step({ kind: 'flux', grade }));
  const metals = [...registry.getCraftingData().metals].reverse();
  const count = registry.getDelveBalance().crafting.refine.metal.count;
  for (;;) {
    const top = metals.find((m) => p.materials.metals[m.id] > 0);
    if (top && (top.band[1] ?? Infinity) >= p.bestDepth) return p;
    const from = metals.find((m) => p.materials.metals[m.id] >= count);
    if (!from || !step({ kind: 'metal', metal: from.id })) return p;
  }
}

/**
 * The shard bench: for each affix it wants on its primary's gear, holding one
 * short of a triple of tier I, it buys the last; then it refines every wanted
 * affix's triples, the lowest tier first.
 */
function refineShards(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  const need = registry.getDelveBalance().crafting.refine.shard.count;
  for (const stat of wanted(p, p.pair.primary ?? 'fire')) {
    if ((p.materials.shards[stat]?.[0] ?? 0) === need - 1) {
      const res = buyShard(registry, p, stat);
      if (res.ok) p = res.profile;
    }
    for (let tier = 1; tier < 5; tier++)
      for (;;) {
        const res = refine(registry, p, { kind: 'shard', stat, tier });
        if (!res.ok) break;
        p = res.profile;
      }
  }
  return p;
}

/**
 * Hone the equipped lines that rolled below their band's middle, the
 * cheapest hone first, while scrap allows (each hone costs more than the last).
 */
function honeGear(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  const minRoll = registry.getDelveBalance().loot.minRoll;
  for (;;) {
    let best: { uid: string; line: number; cost: number } | null = null;
    for (const slot of GEAR_SLOTS) {
      const item = p.equipped[slot];
      if (!item) continue;
      const cost = honeCost(registry, item);
      if (cost > p.scrap || (best && cost >= best.cost)) continue;
      const line = item.affixes.findIndex((a) => {
        const [lo, hi] = a.band ?? [minRoll[item.rarity], 1];
        return a.roll < (lo + hi) / 2;
      });
      if (line >= 0) best = { uid: item.uid, line, cost };
    }
    if (!best) return p;
    const res = hone(registry, p, best.uid, best.line);
    if (!res.ok) return p;
    p = res.profile;
  }
}

/** The stockpile as a haul: materials, scrap, Mana Dust, Links and runes. */
```

In `packages/engine/src/delve/autopilot.ts`, replace the lines from `* The Anvil, between dives, as a player would: an overtaking secondary swaps` up to (not including) `/** What a dive brought into the stockpile: what it banked and kept, and an extract's bounty. */` with:

```ts
 * The Anvil, between dives, as a player would: an overtaking secondary swaps
 * in and a second element is bound (before anything is salvaged); it melts
 * the gear it doesn't wear, refines flux and bars up, forges (a legendary
 * first), moves its moveset to a better weapon and equips upgrades, melts
 * what they replaced; spends Links on slots up to `SOCKETS_AFTER` a chain,
 * then on sockets for the pouch's runes (each filled as it opens), then on the
 * rest of the slots; sockets the best runes and fuses the copies left over;
 * buys and refines shards; hones and pours the rest of the scrap into
 * upgrades (all of that waits while it holds an essence it can't yet pay to
 * forge); and builds the Primary of whatever weapon it wields from both elements.
 */
function anvilVisit(registry: DataRegistry, profile: DelveProfile): AnvilVisit {
  let p = bindPair(registry, resolveOvertake(registry, profile).profile);
  let spent = emptyHaul();
  const pay = (next: DelveProfile) => {
    spent = addHaul(spent, outflow(p, next));
    p = next;
  };
  const melt = () => {
    p = salvageItems(registry, p, salvageCandidates(registry, p, 'epic')).profile;
  };
  melt();
  pay(refineSurplus(registry, p));
  const before = new Set(p.bag.map((i) => i.uid));
  pay(forgeGear(registry, p));
  const forged = p.bag.filter((i) => !before.has(i.uid));
  pay(equipBest(registry, transferBest(registry, p)).profile);
  melt();
  if (!legendaryWaits(registry, p)) {
    // Links: slots up to SOCKETS_AFTER a chain, then sockets for the runes in the pouch, then
    // the rest of the slots. Runes: upgrade the filled sockets, then fuse only the copies left
    // over and socket again (a fused tier can beat a socketed one).
    pay(spendLinks(registry, p, SOCKETS_AFTER));
    pay(openSockets(registry, p));
    pay(spendLinks(registry, p));
    pay(socketBest(registry, p));
    pay(socketBest(registry, fusePouch(registry, p)));
    pay(refineShards(registry, p));
    pay(honeGear(registry, p));
    pay(upgradeAll(registry, p));
  }
  pay(fusePrimary(registry, p));
  return { profile: p, spent, forged };
}
```

In `packages/engine/src/delve/autopilot.ts`, replace:

```ts
  let p = opts.profile ?? createDelveProfile(registry, opts.seed, { primary: opts.primary ?? 'fire' });
  if (opts.secondary) p = fusePrimary(registry, bindSecondary(registry, p, opts.secondary).profile);
```

with:

```ts
  let p = opts.profile;
  if (!p) {
    p = createDelveProfile(registry, opts.seed, { primary: opts.primary ?? 'fire' });
    if (opts.secondary) p = fusePrimary(registry, bindSecondary(registry, p, opts.secondary).profile);
    p = betweenDives(registry, p); // the starter kit's forge (the crafting spec's S8)
  }
```

- [ ] **Step 4: Run them, to see them pass**

```bash
(cd packages/engine && npx vitest run tests/delve-autopilot-crafting.test.ts tests/delve-pair.test.ts tests/delve-movesets.test.ts tests/delve-rune-power.test.ts tests/delve-save-v8.test.ts tests/delve-crafting-data.test.ts tests/delve-materials.test.ts tests/delve-dive.test.ts tests/delve-stops.test.ts)
```

Expected: PASS, **194 passed** (194).

- [ ] **Step 5: The whole suite and the typecheck**

```bash
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
```

Expected: no type errors; **N + 9** tests pass, **7** skipped, in **F + 1** files (1746 | 7). The pacing rails: five run and pass; B1's two stay skipped until Task 3, and the targets come in Task 3 (on Phase A's numbers they fail: see "Tuning").

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-craft-b3
(cd packages/engine && npx prettier --write --end-of-line auto tests/delve-autopilot-crafting.test.ts && npx prettier --check --end-of-line auto src/types/crafting.ts src/data/schemas.ts src/data/crafting.json src/delve/profile.ts tests/delve-pair.test.ts tests/delve-movesets.test.ts tests/delve-rune-power.test.ts tests/delve-save-v8.test.ts tests/delve-crafting-data.test.ts tests/delve-materials.test.ts tests/delve-dive.test.ts tests/delve-stops.test.ts)
git add packages/engine/src/delve/autopilot.ts packages/engine/src/types/crafting.ts packages/engine/src/data/schemas.ts packages/engine/src/data/crafting.json packages/engine/src/delve/profile.ts packages/engine/tests/delve-autopilot-crafting.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-movesets.test.ts packages/engine/tests/delve-rune-power.test.ts packages/engine/tests/delve-save-v8.test.ts packages/engine/tests/delve-crafting-data.test.ts packages/engine/tests/delve-materials.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-stops.test.ts
git commit -m "feat(engine): the autopilot forges its gear from materials; the starter kit holds scrap and three flux" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: Pacing

### Task 3: The numbers, the two rails back, the four pacing targets

B1's two skipped rails come back (the legendaries rail reads forged legendaries); the Fire runs' economy (`economySim`) carries the spec's pacing targets: after dive 1 a magic forge, a first epic by about dive 5, the first essence forged into a legendary on the next visit (the fourth, the depth progression, is the rails). They fail on Phase A's numbers (scrap is the wall: see "Tuning"); the tuning makes them hold.

**Files:**
- Modify: `packages/engine/src/data/balance.json`
- Test: `packages/engine/tests/delve-pacing.test.ts`, `tests/delve-crafting-data.test.ts`

- [ ] **Step 1: The tests**

In `packages/engine/tests/delve-pacing.test.ts`, replace:

```ts
import { runAutopilot, type AutopilotDiveReport } from '../src/delve/autopilot.js';
```

with:

```ts
import { runAutopilot, type AutopilotDiveReport } from '../src/delve/autopilot.js';
import { economySim, type EconomyDive } from '../src/delve/economy.js';
import { GEAR_SLOTS, type Rarity } from '../src/types/gear.js';
import { RARITY_ORDER, rarityIndex } from '../src/types/gem.js';
```

In `packages/engine/tests/delve-pacing.test.ts`, replace:

```ts
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const endDepthAt = (dive: number) => avg(runs.map((r) => r[dive - 1].endDepth));
```

with:

```ts
/** The same Fire runs' economy, dive by dive (the DPS Lab's Economy view reads the same). */
const economies = SEEDS.map((seed) => economySim(registry, seed, DIVES));

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const endDepthAt = (dive: number) => avg(runs.map((r) => r[dive - 1].endDepth));
/** Whether the Anvil visit after a dive forged an item of `rarity` or rarer. */
const forgedAtLeast = (d: EconomyDive, rarity: Rarity) =>
  RARITY_ORDER.some((r) => rarityIndex(r) >= rarityIndex(rarity) && d.forged[r] > 0);
```

In `packages/engine/tests/delve-pacing.test.ts`, replace:

```ts
  // ponytail: B1's drop tables give legendaries as essences; until B3's autopilot forges them, it owns none. B3 un-skips this.
  it.skip('legendaries arrive without completing the codex early', () => {
```

with:

```ts
  it('legendaries arrive, forged from essences, without completing the codex early', () => {
    for (const { profile } of fireResults) {
      const gear = [...GEAR_SLOTS.map((s) => profile.equipped[s]), ...profile.bag];
      expect(gear.some((i) => i?.rarity === 'legendary')).toBe(true);
    }
```

In `packages/engine/tests/delve-pacing.test.ts`, replace:

```ts
  // ponytail: with gear only from elites and bosses, the unforging autopilot's depths spread out until B3 forges. B3 un-skips this.
  it.skip('no pair runs away or stalls: each forced pair reaches 0.6–1.6 × the median depth by dive 6', () => {
```

with:

```ts
  it('no pair runs away or stalls: each forced pair reaches 0.6–1.6 × the median depth by dive 6', () => {
```

Append at the end of `packages/engine/tests/delve-pacing.test.ts`:

```ts
/**
 * The crafting spec's pacing targets, on the Fire runs' economy (`economySim`). The fourth,
 * "over 12 dives, depth progression at least matches today's rails", is the rails above.
 */
describe('Delve crafting pacing targets (economySim)', () => {
  it('after dive 1, enough to forge a magic item: the Anvil visit after it forges one (or better)', () => {
    for (const e of economies) expect(forgedAtLeast(e.dives[0], 'magic'), `seed ${e.seed}`).toBe(true);
  });

  it('a first epic (or a legendary) is forged by about dive 5', () => {
    const first = economies.map((e) => e.dives.findIndex((d) => forgedAtLeast(d, 'epic')) + 1);
    for (const [i, dive] of first.entries()) {
      expect(dive, `seed ${SEEDS[i]}`).toBeGreaterThan(0);
      expect(dive, `seed ${SEEDS[i]}`).toBeLessThanOrEqual(6);
    }
    expect(avg(first)).toBeLessThanOrEqual(5);
  });

  it("the first boss's essence becomes a forged legendary on the Anvil visit after its dive", () => {
    for (const e of economies) {
      const first = e.dives.find((d) => Object.values(d.income.essences).some((n) => n > 0));
      expect(first, `seed ${e.seed}`).toBeDefined();
      expect(first!.forged.legendary, `seed ${e.seed}`).toBeGreaterThan(0);
    }
  });
});
```

In `packages/engine/tests/delve-crafting-data.test.ts`, replace:

```ts
    expect(bal.drops.scrapByKind).toEqual({ normal: 1, elite: 3, boss: 10 });
```

with:

```ts
    expect(bal.drops.scrapByKind).toEqual({ normal: 6, elite: 18, boss: 60 });
```

- [ ] **Step 2: Run them, to see them fail**

```bash
(cd packages/engine && npx vitest run tests/delve-pacing.test.ts tests/delve-crafting-data.test.ts)
```

Expected: FAIL, **6 failed | 21 passed** (27): `scrapByKind` (`expected { normal: 1, elite: 3, boss: 10 } to deeply equal { normal: 6, elite: 18, boss: 60 }`); the legendaries rail (`expected false to be true`: a seed owns no legendary); the sweep (`fire+frost: expected 4 to be greater than or equal to 4.2`); and the three targets (`seed 1: expected false to be true`, `seed 1: expected 7 to be less than or equal to 6`, `seed 1: expected 0 to be greater than 0`).

- [ ] **Step 3: The numbers (see "Tuning")**

In `packages/engine/src/data/balance.json`, replace:

```json
      "forgeScrap": { "common": 10, "uncommon": 20, "magic": 40, "rare": 80, "epic": 160, "legendary": 320 },
```

with:

```json
      "forgeScrap": { "common": 10, "uncommon": 20, "magic": 40, "rare": 80, "epic": 160, "legendary": 240 },
```

In `packages/engine/src/data/balance.json`, replace:

```json
        "flux": { "chance": 0.3, "count": [1, 1] }, "gearChance": 0.5, "patternChance": 0.1
```

with:

```json
        "flux": { "chance": 0.3, "count": [1, 1] }, "gearChance": 0.5, "patternChance": 0.5
```

In `packages/engine/src/data/balance.json`, replace:

```json
      "scrapByKind": { "normal": 1, "elite": 3, "boss": 10 }, "scrapPickups": { "normal": 1, "elite": 3, "boss": 8 },
```

with:

```json
      "scrapByKind": { "normal": 6, "elite": 18, "boss": 60 }, "scrapPickups": { "normal": 1, "elite": 3, "boss": 8 },
```

- [ ] **Step 4: Run them, to see them pass**

```bash
(cd packages/engine && npx vitest run tests/delve-pacing.test.ts tests/delve-crafting-data.test.ts)
```

Expected: PASS, **27 passed** (27).

- [ ] **Step 5: The whole suite and the typecheck**

```bash
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
```

Expected: no type errors; **N + 14** tests pass, **5** skipped, in **F + 1** files (1751 | 5 in 94 | 1): all seven pacing rails and the three targets run and pass. The whole suite takes about 15 s.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-craft-b3
(cd packages/engine && npx prettier --check --end-of-line auto tests/delve-crafting-data.test.ts)
git add packages/engine/src/data/balance.json packages/engine/tests/delve-pacing.test.ts packages/engine/tests/delve-crafting-data.test.ts
git commit -m "test(engine): the pacing rails on forged gear and the crafting spec's four pacing targets; kill scrap, elite patterns and the legendary's price tuned to them" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

```bash
cd /c/Projects/alloy-craft-b3
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

- The engine: no type errors; **1751 passed | 5 skipped** tests in **94 passed | 1 skipped** files (N + 14 in F + 1); every pacing rail runs and passes, with the three pacing targets beside them.
- The bundle builds (tsup's "Build success" lines).
- The client, against the new bundle **with X1 applied**: no type errors; **1203 tests in 150 files** pass. Without X1: **8 failed | 1195 passed** (the eight tests that read a new save's scrap as 0).
- The rails' runs at the end (the scratch copy; for Phase D): the Fire runs' mean deepest depth by dive reads 3.0, 4.3, 4.8, 8.5, 10.5, 15.8, 21.0, 22.8, 23.5, 23.8, 24.8, 28.0 (at v0.57.1: 3.0 at dive 1, 25.8 at dive 6, 35.5 at dive 12); the two Frost seeds end at 35 and 21; the pair sweep at dive 6 reads 13–24 around a median of 16; the visit after dive 1 forges a magic item on every seed; the first forged epic or legendary comes after dives 3, 5, 3, 5 (seeds 1–4), each the visit after the dive that brought home the first essence; the codex holds 1.25 legendaries on average by dive 12; floors average 28 s.
