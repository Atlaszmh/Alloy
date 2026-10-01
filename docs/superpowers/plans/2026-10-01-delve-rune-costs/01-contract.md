# Delve Rune Costs, Step 1: the Contract — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay down everything A and B build against, with no change to how anything plays: each rune's `load` row in `runes.json`, `balance.json → delve.runes.load` with every slot at 0, their schemas and types, `runeLoad` and `loadEase`, `resolveAbility`'s eased `load` and `ease` raising the price in each payment, `baseCost` and Drain's cap on it (in the sim and in Power), `basicIncome` factored out of `estimateCombat`, `manaSupport`, and the exports. It ends with the DPS Lab grid, the pacing, the first dives and the items hash identical to the baseline Task 1 records at `6e667e2`.

**Architecture:** Types and data first (`RuneDef.load`, `DelveBalance['runes']['load']`, the 14 rows, the schemas), then the two pure helpers in `loot/runes.ts`, then the one place the load is applied (`resolveAbility`: mana and a cast's mana × (1 + load), a charge need × (1 + load × `charge`), a cast's channel × (1 + load × `cast`)), then Power's mana side (`basicIncome`, `manaSupport`, Drain's cap on `baseCost`). Every new factor is a multiplication by exactly 1 while `bySlot` is 0 (`load` is 0, so `1 + load` is 1 and `baseCost` is `cost / 1`), and `basicIncome` returns the same sum in the same order, so every number stays bit for bit.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom), Zod 3.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md` at `6e667e2`, its "Build → Step 1: the contract" section. Read the overview (`00-overview.md`) for the conventions every rune costs plan file shares.

**Base:** `claude/alloy-loot-gear-system-6upsy5` at `6e667e2` (v0.51.0 code plus the rune costs spec). Nothing needs merging first. Step 1 is one agent in its own worktree, `../alloy-costs-contract` on branch `costs/contract`; the controller merges it before A and B start, and they branch from that merge.

---

## How this plan was checked

Every edit below was applied, in order, to a copy of the tree at `6e667e2` (with the working tree's own line endings) by the controller's `apply.mjs` rules (`scratchpad/runes/w0/apply.mjs`), and each task's tests were run at both of their steps; the expected failures and passes below are those runs. At the end:

- the engine's suite goes from **1596 tests in 82 files** (HEAD) to **1618 in 83 files**; its typecheck is clean;
- the client's suite stays at **860 tests in 98 files** with no client edit, on the rebuilt bundle, and its typecheck is clean;
- against the baseline Task 1 records: the DPS Lab grid (9,544 runs) has **0 differing rows**, the pacing output and the first dives are **byte-identical**, and the items hash is **the same**; the golden test holds v0.51.0's Power exactly and its DPS to nine places.

## Where the spec left room (decided here)

- **The non-decreasing check** is an inline `refine` on `RuneDefSchema.load` (`l.every((x, i) => i === 0 || l[i - 1] <= x)`), with the spec's message; no named helper, since nothing else uses it.
- **`runeLoad` reads the slot from the form** (`registry.getForm(form).slot`), so its signature stays the spec's `(registry, ref, form)`, and it reads the rune with `getRune` (it throws for an unknown id): its callers pass only runes that act (`ResolvedAbility.runes`) or, in B's `runeText`, a rune `runeText` already looked up.
- **`resolveAbility`** keeps the acting runes in a local `runes` (it was computed inline in the return), sums `runeLoad` over them, multiplies by `1 − loadEase(registry, stats, move.elements)`, and puts `load` and `ease` after `runes` in `ResolvedAbility`. `C` is `bal.runes.load`; `L` stays the legendaries. `castTime` is still `conjure + channel`, so it grows with the loaded channel.
- **`basicIncome`** recomputes the cleave and the strike interval with `estimateCombat`'s own expressions, so `estimateCombat` changes only in the one sum the spec names (`manaIncome` becomes `basicIncome(registry, stats) + drained(…)…`), and `income`, which `drained()` measures against, stays. JavaScript adds left to right, so the new sum is the old one to the bit.
- **`manaSupport`** measures both numbers over one interval: `useInterval(bal, chain, stats.tempo, Infinity, Infinity)` (mana and charge unbounded, so only cooldowns, wind-ups and beats count). `spend` is the mean of `valuedMove`'s costs over it (0 for a charge chain, whose costs are 0); `refill` is `basicIncome` plus `drainPerUse(chain, bal)` over it. `ManaSupport` is exported as a type beside the function.
- **The v0.51.0 golden** is a fixture, `tests/fixtures/rune-costs-v051.json`: 108 rows (each slot's default form × each payment × light, medium, heavy and a hold's three stages × bare and runed), each `[cost, chargeNeed, conjure, channel, castTime, cooldown]`, made at `6e667e2` by `goldens.mjs` (Task 1) for a hero attuned 15 to Fire and Frost (so a load would be eased 45%). The test resolves the runed rows with `bySlot` at 0 and the rune-less rows at 0 and at 1, through a copy of the registry (`withLoad`), so it still holds after A ships `bySlot` at 1. One row a line, never formatted, as `delve-v5-saves.json`.
- **The Power golden** pins `estimateCombat` for one hero (a Fire sword, attuned +14 Fire and +5 Frost, Drain III on every blow) under three chain sets with Drain on every skill, a cast Ultimate, a charge Ultimate and a hold: Power with `toBe`, DPS with `toBeCloseTo(…, 9)`.
- **`delve-runes-contract.test.ts`'s `bal.runes` pin** reads `load: expect.any(Object)`; `load` itself is pinned in `delve-rune-costs.test.ts` (A's file after step 1). So A shipping `bySlot` at 1 edits only its own file, and B's file keeps its runeText tests to itself.
- **Drain's effect text** in `runes.json` ("… and {runes.drainShare:%} of its mana cost a cast") stays: the cap is now on the cost before the load, which is still "its mana cost" to a player reading the pouch. B owns the words if they want "before runes".
- **No version bump:** with `bySlot` at 0 nothing a player sees changes. Finish bumps to v0.52.0.

## Files

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/types/rune.ts` | `RuneDef.load` |
| `src/types/delve.ts` | `DelveBalance['runes']['load']`, and the `FormId` import |
| `src/types/ability.ts` | `ResolvedAbility.load` and `ease` |
| `src/data/runes.json` | the 14 `load` rows |
| `src/data/balance.json` | `delve.runes.load`, `bySlot` all 0 (hand-edit, never format) |
| `src/data/schemas.ts` | `RuneDefSchema.load`; `delve.runes.load` |
| `src/loot/runes.ts` | `runeLoad`, `loadEase` (exported through `export * from './loot/runes.js'`) |
| `src/arpg/abilities/resolve.ts` | the eased `load`, `ease`, the three prices; `baseCost` |
| `src/arpg/abilities/cast.ts` | `fire`'s Drain budget from `baseCost` |
| `src/delve/hero-stats.ts` | `drainPerUse` on `baseCost`; `basicIncome`, `ManaSupport`, `manaSupport`; `manaIncome` from `basicIncome` |
| `src/index.ts` | `baseCost`, `basicIncome`, `manaSupport`, the `ManaSupport` type |
| `tests/delve-rune-costs.test.ts` (new) | the contract's tests (A owns it after step 1) |
| `tests/fixtures/rune-costs-v051.json` (new) | v0.51.0's resolved prices (never format) |
| `tests/delve-runes-contract.test.ts` | the `bal.runes` pin leaves `load` to the new file |

**Client:** no edit. It is rebuilt against the new bundle and stays green (Task 7).

**Outside the repo:** the scratchpad's `rune-costs-before/` (Task 1).

## Cross-area needs

None: step 1 needs nothing from another area. Notes for the controller and the areas after it:

- **For A:** `tests/delve-rune-costs.test.ts`'s "ships delve.runes.load with every slot at 0" pins `bySlot` at 0; A's `bySlot` change updates that one expectation. Every other test in the file builds its registries with `withLoad` and holds at any shipped loads, except "runeLoad and loadEase"'s and the golden's, which name their own factors. When A gives `drainPerUse` and `useInterval` the optional `pool`, `manaSupport` keeps calling them without it (its `spend` ignores the pool cap, by the spec).
- **For B:** `loadText` and `runeText`'s `cost` go below `loadEase` in `loot/runes.ts` (step 1 adds `runeLoad` and `loadEase` right after `extraShotPower`, above `num`). Step 1's only edit in `tests/delve-runes-contract.test.ts` is the `bal.runes` pin (the `shardRange: 4,` line and the two after it, in "balance: delve.runes"); B's `runeText` tests are in "rune helpers: text", far from it.

## Line endings and Prettier (check again in the worktree)

At `6e667e2` every file this plan edits is **CRLF** in the main working tree (the `.ts` files, `runes.json` and `balance.json`); a fresh worktree checks out CRLF too (`core.autocrlf` is on and there is no `.gitattributes`). Keep each file's endings: the Edit tool does; `apply.mjs` does. `balance.json` is hand-laid-out and never formatted. Every other file edited here passes `npx prettier --check --end-of-line auto` at `6e667e2`, and the code below is already formatted, so the commit blocks' `prettier --write --end-of-line auto` changes nothing if typed as written (a plain `--write` would rewrite a CRLF file's endings). The new fixture `tests/fixtures/rune-costs-v051.json` is never formatted (one row a line, as generated). Never touch `packages/engine/tests/delve-chain-feel.test.ts` (line 160 holds a raw `0xD7` byte).

## Commands

Run from the worktree's root (`C:\Projects\alloy-costs-contract`; in Bash `/c/Projects/alloy-costs-contract`), each in a subshell:

| What | Command |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests (about 16 s, the pacing rails included) | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| The measuring build | `(cd packages/engine && npx tsup --out-dir node_modules/.costs-measure)` |
| Engine build (the client's bundle) | `(cd packages/engine && npx tsup)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client tests (about 18 s) | `(cd packages/client && npx vitest run)` |

`$S` below is the scratchpad: `S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad`. Node takes `C:/` paths: `M=C:/Projects/alloy-costs-contract/packages/engine/node_modules/.costs-measure/index.js`.

---

## Chunk 1: The baseline, and the data

### Task 1: Set up the worktree and record the baseline

The measurements run on the engine at `6e667e2`, before any edit: the worktree's first state. v0.51.0's pacing differs from `runes-before`'s (v0.50.0), so this is a fresh baseline. No commit (nothing in the repo changes).

**Files:**
- Create (outside the repo): `$S/rune-costs-before/{snapshot,identical,pacing,first-dives,items-hash,goldens}.mjs`, `before-depth10.json`, `pacing-before.txt`, `first-dives-before.txt`, `items-hash-before.txt`, `rune-costs-v051.json`

- [ ] **Step 1: Make the worktree and link its `node_modules`**

PowerShell (Git Bash's `cmd //c mklink` mangles the switches; PowerShell's `cmd /c` doesn't):

```powershell
git -C C:\Projects\Alloy worktree add ..\alloy-costs-contract -b costs/contract 6e667e2
$W = 'C:\Projects\alloy-costs-contract'; $R = 'C:\Projects\Alloy'
foreach ($p in @('', 'packages\engine', 'packages\client')) {
  $dst = Join-Path $W "$p\node_modules"
  New-Item -ItemType Directory -Force $dst | Out-Null
  foreach ($e in Get-ChildItem -Force (Join-Path $R "$p\node_modules")) {
    if ($e.Name -in @('@alloy', '.vite', '.vite-temp')) { continue }
    cmd /c mklink /J (Join-Path $dst $e.Name) $e.FullName | Out-Null
  }
}
New-Item -ItemType Directory -Force "$W\packages\client\node_modules\@alloy" | Out-Null
cmd /c mklink /J "$W\packages\client\node_modules\@alloy\engine" "$W\packages\engine" | Out-Null
(Get-ChildItem -Force "$W\packages\engine\node_modules").Name -join ' '
```

Expected: the last line lists `.bin tsup vitest zod`. The client's `@alloy\engine` points at the worktree's own engine, so the client tests read this worktree's bundle. Never delete through a junction: when the worktree goes, remove each junction with `cmd /c rmdir <path>` first.

- [ ] **Step 2: Copy the runes scripts, and write the goldens script**

The five measuring scripts run unchanged against v0.51.0 (they are the runes gate's, identical to `runes-before`'s):

```bash
S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
mkdir -p $S/rune-costs-before
cp $S/runes-gate/{snapshot,identical,pacing,first-dives,items-hash}.mjs $S/rune-costs-before/
```

`goldens.mjs` makes Task 4's fixture and prints Task 5's Power golden from v0.51.0's code. Write `$S/rune-costs-before/goldens.mjs` (if the planner's copy is already there, it is this text; the outputs below were made with it):

```js
// v0.51.0's goldens for the rune costs contract (tests/delve-rune-costs.test.ts):
// 1. every slot × payment × kind × hold stage, bare and runed, resolved: its prices and timings,
//    one key a line (tests/fixtures/rune-costs-v051.json);
// 2. estimateCombat's dps and Power for three heroes whose mana income has Drain in it.
// Usage: node goldens.mjs <engine dist/index.js> <out.json>
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const E = await import(pathToFileURL(process.argv[2]).href);
const registry = E.createDefaultRegistry();
const III = (id) => ({ id, tier: 3 });

// 1. Resolved prices. The hero is attuned 15 to Fire and Frost, so a load would be eased 45%.
const bare = E.computeHeroStats({}, registry);
const stats = { ...bare, attunement: { ...bare.attunement, fire: 15, frost: 15 } };
const SLOTS = [
  ['primary', 'bolt', ['fire'], [III('echo'), III('heavy'), III('linger')]],
  ['defensive', 'ward', ['frost'], [III('quick'), III('chain'), III('drain')]],
  ['ultimate', 'nova', ['fire'], [III('echo'), III('heavy'), III('linger')]],
];
const rows = [];
for (const [slot, form, elements, runes] of SLOTS)
  for (const payment of ['mana', 'charge', 'cast'])
    for (const [kind, stage] of [['light', 0], ['medium', 0], ['heavy', 0], ['hold', 0], ['hold', 1], ['hold', 2]])
      for (const runed of [false, true]) {
        const move = { kind, form, elements, ...(runed ? { runes } : {}) };
        const r = E.resolveAbility(registry, slot, move, payment, stats, stage);
        const key = `${slot}|${payment}|${kind}|${stage}|${runed ? 'runed' : 'bare'}`;
        rows.push(`  ${JSON.stringify(key)}: ${JSON.stringify([r.cost, r.chargeNeed, r.conjure, r.channel, r.castTime, r.cooldown])}`);
      }
writeFileSync(process.argv[3], `{\n${rows.join(',\n')}\n}\n`);
console.log('resolved', rows.length);

// 2. Power. A Fire sword (the arena fixture's), every blow holding Drain III, attuned +14 Fire, +5 Frost.
const sword = E.generateItem(
  registry,
  { uid: 'fire-weapon', ilvl: 3, rarity: 'common', slot: 'weapon', baseId: 'sword', mana: 'fire' },
  new E.SeededRNG(1),
);
const hero = E.computeHeroStats({ weapon: sword }, registry, {
  pair: { primary: 'fire', secondary: 'frost' },
  attunement: { fire: 14, frost: 5 },
  basic: ['light', 'light', 'heavy'].map((kind) => ({ kind, element: 'fire', runes: [III('drain')] })),
});
const drained = {
  primary: { payment: 'mana', moves: [{ kind: 'light', form: 'bolt', elements: ['fire'], runes: [III('drain'), III('echo')] }, { kind: 'hold', form: 'bolt', elements: ['fire', 'frost'], runes: [III('drain')] }] },
  defensive: { payment: 'mana', moves: [{ kind: 'medium', form: 'ward', elements: ['frost'], runes: [III('drain')] }] },
  ultimate: { payment: 'cast', moves: [{ kind: 'heavy', form: 'nova', elements: ['fire'], runes: [III('drain'), III('heavy')] }] },
};
const charged = { ...drained, ultimate: { payment: 'charge', moves: [{ kind: 'medium', form: 'nova', elements: ['fire'], runes: [III('drain')] }] } };
for (const [name, chains] of [['drained', drained], ['charged', charged], ['plain', undefined]]) {
  const e = E.estimateCombat(hero, registry, 10, chains);
  console.log(name, JSON.stringify({ dps: e.dps, power: e.power }));
}
```

- [ ] **Step 3: Build the measuring copy at `6e667e2` and record**

```bash
cd /c/Projects/alloy-costs-contract
git log --oneline -1
(cd packages/engine && npx tsup --out-dir node_modules/.costs-measure)
S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
M=C:/Projects/alloy-costs-contract/packages/engine/node_modules/.costs-measure/index.js
cd $S/rune-costs-before
node snapshot.mjs $M before-depth10.json
node pacing.mjs $M > pacing-before.txt
node first-dives.mjs $M > first-dives-before.txt
node items-hash.mjs $M > items-hash-before.txt
node goldens.mjs $M rune-costs-v051.json
cat pacing-before.txt first-dives-before.txt items-hash-before.txt
node identical.mjs $S/runes-gate/grid-fix.json before-depth10.json
```

Expected: `git log` shows `6e667e2`; `snapshot.mjs` prints `runs 9544 ms …` (about 13 s); `pacing.mjs` takes under a minute; `goldens.mjs` prints:

```text
resolved 108
drained {"dps":77.33972432955927,"power":1098}
charged {"dps":122.88517595614529,"power":1385}
plain {"dps":158.57566058873041,"power":1573}
```

The three files read exactly (the pacing is the spec's `pacing-fix` run):

```text
first dive: 3, 3, 3, 3 (each ≥ 3), mean 3 (3–12)
dive 6 mean 24.25, dive 12 mean 36 (> dive 1 + 5, > dive 6)
frost: dive 1 3.5, dive 12 35.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 5.75 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 24, 21–31 (allowed 14.4–38.4): fire+frost 21, earth+frost 30, storm+fire 24, frost+storm 31, fire+shadow 22, fire+nature 26, shadow+nature 21, fire+earth 30, storm+earth 24, earth+shadow 29, earth+nature 22, frost+shadow 21, frost+nature 29, storm+shadow 29, storm+nature 22
seconds per floor: 29.80 (8–60)
1 1→3 dead power 1266 | 1→5 dead power 2444
2 1→3 dead power 1352 | 1→7 dead power 2889
3 1→3 dead power 1022 | 1→11 dead power 4411
4 1→3 dead power 1166 | 1→5 dead power 2913
291 49e20fb6 7c8e6dde
```

And `identical.mjs` prints `rows 9544 before, 9544 after; differing 0` (v0.51.0's grid is the runes gate's last, `grid-fix`). If any line differs, stop: the base isn't `6e667e2`.

- [ ] **Step 4: Remove the measuring copy**

```bash
cd /c/Projects/alloy-costs-contract && rm -rf packages/engine/node_modules/.costs-measure
```

(`packages/engine/node_modules` is a real folder of junctions, so `.costs-measure` is the worktree's own; never `rm -rf` a junction.)

- [ ] **Step 5: The suites at the base**

Run: `(cd packages/engine && npx vitest run)` and `(cd packages/engine && npx tsup) && (cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: the engine 1596 tests pass in 82 files; the client 860 in 98 files, and the typecheck prints nothing.

### Task 2: The loads, their balance and their schemas

`RuneDef.load` and the 14 rows; `DelveBalance['runes']['load']` and `balance.json → delve.runes.load` with every slot at 0; `RuneDefSchema.load` (five, ≥ 0, never falling) and the `load` schema (`easeCap` at most 1). Nothing reads them yet.

**Files:**
- Create: `packages/engine/tests/delve-rune-costs.test.ts`
- Modify: `packages/engine/src/types/rune.ts`, `src/types/delve.ts`, `src/data/runes.json`, `src/data/balance.json` (never format), `src/data/schemas.ts`, `tests/delve-runes-contract.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/tests/delve-rune-costs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import runesData from '../src/data/runes.json';
import { BalanceConfigSchema, RunesSchema } from '../src/data/schemas.js';
import { registry } from './fixtures/arena.js';

/**
 * Rune costs (see the rune costs spec): each rune's load raises its move's
 * price in its chain's own payment, eased by the hero's attunement. Step 1
 * ships `bySlot` at 0, so the price tests run on a copy of the data with it at 1.
 */

describe('rune costs: the data', () => {
  it("pins every rune's five loads", () => {
    expect(Object.fromEntries(registry.getRunes().map((d) => [d.id, d.load]))).toEqual({
      split: [0.27, 0.36, 0.45, 0.54, 0.63],
      multishot: [0.15, 0.2, 0.25, 0.3, 0.35],
      pierce: [0.57, 0.76, 0.95, 1.14, 1.33],
      chain: [0.45, 0.6, 0.75, 0.9, 1.05],
      widen: [0.12, 0.16, 0.2, 0.24, 0.28],
      quick: [0.15, 0.2, 0.25, 0.3, 0.35],
      echo: [0.27, 0.36, 0.45, 0.54, 0.63],
      heavy: [0.33, 0.44, 0.55, 0.66, 0.77],
      saturate: [0.12, 0.16, 0.2, 0.24, 0.28],
      linger: [0.57, 0.76, 0.95, 1.14, 1.33],
      volatile: [0.15, 0.2, 0.25, 0.3, 0.35],
      leech: [0.12, 0.16, 0.2, 0.24, 0.28],
      drain: [0.24, 0.32, 0.4, 0.48, 0.56],
      guard: [0.12, 0.16, 0.2, 0.24, 0.28],
    });
  });

  it('refuses a rune without a load, with four, with one below 0, or with one that falls with tier', () => {
    const [split] = runesData;
    const ok = (row: object) => RunesSchema.safeParse([row]).success;
    const { load, ...noLoad } = split;
    expect(ok(split)).toBe(true);
    expect(ok(noLoad)).toBe(false);
    expect(ok({ ...split, load: load.slice(0, 4) })).toBe(false);
    expect(ok({ ...split, load: [-0.1, 0.36, 0.45, 0.54, 0.63] })).toBe(false);
    expect(ok({ ...split, load: [0.36, 0.27, 0.45, 0.54, 0.63] })).toBe(false);
  });

  it('ships delve.runes.load with every slot at 0, so every load is 0', () => {
    expect(registry.getDelveBalance().runes.load).toEqual({
      bySlot: { primary: 0, defensive: 0, ultimate: 0 },
      byForm: {},
      charge: 1,
      cast: 1,
      easePerAttune: 0.03,
      easeCap: 0.6,
    });
  });

  it('names only real forms in byForm', () => {
    const forms = registry.getArpgData().forms.map((f) => f.id);
    for (const id of Object.keys(registry.getDelveBalance().runes.load.byForm))
      expect(forms).toContain(id);
  });

  it('refuses an easeCap above 1, a negative factor and a slot missing from bySlot', () => {
    const runes = balanceData.delve.runes;
    const ok = (load: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, runes: { ...runes, load: { ...runes.load, ...load } } },
      }).success;
    expect(ok({})).toBe(true);
    expect(ok({ easeCap: 1, byForm: { volley: 0.8 } })).toBe(true);
    expect(ok({ easeCap: 1.01 })).toBe(false);
    expect(ok({ easePerAttune: -0.01 })).toBe(false);
    expect(ok({ charge: -1 })).toBe(false);
    expect(ok({ byForm: { bolt: -0.5 } })).toBe(false);
    expect(ok({ bySlot: { primary: 1, defensive: 1 } })).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts)`
Expected: FAIL, 5 failed (5): the pin (`expected { split: undefined, …(13) } to deeply equal { …(14) }`), the row schema (`expected true to be false`: a row without `load` still parses), the shipped balance (`expected undefined to deeply equal { bySlot: { primary: +0, …(2) }, …(5) }`), the `byForm` keys (`Cannot read properties of undefined (reading 'byForm')`) and the balance schema (`expected true to be false`: Zod drops the unknown `load`, so an `easeCap` of 1.01 parses).

- [ ] **Step 3: Write the types, the data and the schemas**

In `packages/engine/src/types/rune.ts`:

Replace:

```ts
  tiers: KnobsData[];
  /** Templates filled by `runeText`: {path}, {path:%}, {path:±%}, {runes.key}. */
```

with:

```ts
  tiers: KnobsData[];
  /**
   * Its load at tiers I..V (index tier − 1; see the rune costs spec): the share
   * it raises its move's price by, before the slot's and the form's factors and
   * the easing. Never falls with tier.
   */
  load: number[];
  /** Templates filled by `runeText`: {path}, {path:%}, {path:±%}, {runes.key}. */
```

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
import type { AbilitySlot, ChainSkill, Knobs, MoveKind } from './ability.js';
```

with:

```ts
import type { AbilitySlot, ChainSkill, FormId, Knobs, MoveKind } from './ability.js';
```

Replace:

```ts
    shardSpeed: number;
    shardRange: number;
  };
```

with:

```ts
    shardSpeed: number;
    shardRange: number;
    /**
     * Rune costs (see the rune costs spec): a move's load is Σ its runes'
     * `load` × `bySlot` × `byForm` (a form missing from it counts as 1), eased by
     * `easePerAttune` a point of its attunement, at most `easeCap`. `charge` and
     * `cast` say how much of it a charge need and a cast's channel take.
     */
    load: {
      bySlot: Record<AbilitySlot, number>;
      byForm: Partial<Record<FormId, number>>;
      charge: number;
      cast: number;
      easePerAttune: number;
      easeCap: number;
    };
  };
```

In `packages/engine/src/data/runes.json` (each row's `load` goes just above its `effect`, beside `tiers`; the rows are the spec's table):

Replace:

```json
    "effect": "Splits into {split.count} shards on hit, each at {split.power:%} power",
```

with:

```json
    "load": [0.27, 0.36, 0.45, 0.54, 0.63],
    "effect": "Splits into {split.count} shards on hit, each at {split.power:%} power",
```

Replace:

```json
    "effect": "Extra shots: +{extraShots.count}",
```

with:

```json
    "load": [0.15, 0.2, 0.25, 0.3, 0.35],
    "effect": "Extra shots: +{extraShots.count}",
```

Replace:

```json
    "effect": "Foes it passes: {pierce}",
```

with:

```json
    "load": [0.57, 0.76, 0.95, 1.14, 1.33],
    "effect": "Foes it passes: {pierce}",
```

Replace:

```json
    "effect": "Jumps to more foes: +{chain}",
```

with:

```json
    "load": [0.45, 0.6, 0.75, 0.9, 1.05],
    "effect": "Jumps to more foes: +{chain}",
```

Replace:

```json
    "effect": "Area {area:±%}",
```

with:

```json
    "load": [0.12, 0.16, 0.2, 0.24, 0.28],
    "effect": "Area {area:±%}",
```

Replace:

```json
    "effect": "Beat {quick.beat:±%}, cooldown {quick.cooldown:±%}",
```

with:

```json
    "load": [0.15, 0.2, 0.25, 0.3, 0.35],
    "effect": "Beat {quick.beat:±%}, cooldown {quick.cooldown:±%}",
```

Replace:

```json
    "effect": "Repeats {runes.echoDelay} s later at {echo:%} power",
```

with:

```json
    "load": [0.27, 0.36, 0.45, 0.54, 0.63],
    "effect": "Repeats {runes.echoDelay} s later at {echo:%} power",
```

Replace:

```json
    "effect": "Power {power:±%}, and it staggers",
```

with:

```json
    "load": [0.33, 0.44, 0.55, 0.66, 0.77],
    "effect": "Power {power:±%}, and it staggers",
```

Replace:

```json
    "effect": "Stacks per direct hit: +{stacksBonus}",
```

with:

```json
    "load": [0.12, 0.16, 0.2, 0.24, 0.28],
    "effect": "Stacks per direct hit: +{stacksBonus}",
```

Replace:

```json
    "effect": "Leaves a zone for {zone.seconds} s, ticking at {zone.tickPower:%} of the hit (at most {zone.perCast} a cast)",
```

with:

```json
    "load": [0.57, 0.76, 0.95, 1.14, 1.33],
    "effect": "Leaves a zone for {zone.seconds} s, ticking at {zone.tickPower:%} of the hit (at most {zone.perCast} a cast)",
```

Replace:

```json
    "effect": "Reactions it sets off: +{catalyst:%} damage",
```

with:

```json
    "load": [0.15, 0.2, 0.25, 0.3, 0.35],
    "effect": "Reactions it sets off: +{catalyst:%} damage",
```

Replace:

```json
    "effect": "Heals {lifesteal:%} of its damage",
```

with:

```json
    "load": [0.12, 0.16, 0.2, 0.24, 0.28],
    "effect": "Heals {lifesteal:%} of its damage",
```

Replace:

```json
    "effect": "+{manaOnHit} mana per foe hit, up to {runes.drainFoes} foe-hits and {runes.drainShare:%} of its mana cost a cast",
```

with:

```json
    "load": [0.24, 0.32, 0.4, 0.48, 0.56],
    "effect": "+{manaOnHit} mana per foe hit, up to {runes.drainFoes} foe-hits and {runes.drainShare:%} of its mana cost a cast",
```

Replace:

```json
    "effect": "On landing, a {runes.guardSeconds} s shield of {guardOnLand:%} max life",
```

with:

```json
    "load": [0.12, 0.16, 0.2, 0.24, 0.28],
    "effect": "On landing, a {runes.guardSeconds} s shield of {guardOnLand:%} max life",
```

In `packages/engine/src/data/balance.json` (hand-laid-out; never format):

Replace:

```json
      "echoDelay": 0.4, "guardSeconds": 3, "drainFoes": 5, "drainShare": 0.5, "shardSpeed": 12, "shardRange": 4
    },
```

with:

```json
      "echoDelay": 0.4, "guardSeconds": 3, "drainFoes": 5, "drainShare": 0.5, "shardSpeed": 12, "shardRange": 4,
      "load": {
        "bySlot": { "primary": 0, "defensive": 0, "ultimate": 0 }, "byForm": {},
        "charge": 1, "cast": 1, "easePerAttune": 0.03, "easeCap": 0.6
      }
    },
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
    tiers: z.array(KnobsSchema).length(RUNE_TIERS),
    effect: z.string(),
```

with:

```ts
    tiers: z.array(KnobsSchema).length(RUNE_TIERS),
    // Its load by tier (see the rune costs spec): required, so a new rune says what it costs.
    load: z
      .array(z.number().min(0))
      .length(RUNE_TIERS)
      .refine((l) => l.every((x, i) => i === 0 || l[i - 1] <= x), 'load must not fall with tier'),
    effect: z.string(),
```

Replace:

```ts
    shardRange: z.number().positive(),
  }),
```

with:

```ts
    shardRange: z.number().positive(),
    // Rune costs (see the rune costs spec). A test holds `byForm`'s keys to arpg.json's forms.
    load: z.object({
      bySlot: z.object({
        primary: z.number().min(0),
        defensive: z.number().min(0),
        ultimate: z.number().min(0),
      }),
      byForm: z.record(z.string(), z.number().min(0)),
      charge: z.number().min(0),
      cast: z.number().min(0),
      easePerAttune: z.number().min(0),
      // At 1 runes are free; above it a load would turn into a refund.
      easeCap: z.number().min(0).max(1),
    }),
  }),
```

The runes contract's pin of `delve.runes` leaves `load` to the new file.

In `packages/engine/tests/delve-runes-contract.test.ts`:

Replace:

```ts
      shardRange: 4,
    });
```

with:

```ts
      shardRange: 4,
      // Pinned in delve-rune-costs.test.ts, which the rune costs build owns.
      load: expect.any(Object),
    });
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts tests/delve-runes-contract.test.ts)`
Expected: PASS, 44 tests in 2 files.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1601 tests pass in 83 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-costs-contract
(cd packages/engine && npx prettier --write --end-of-line auto src/types/rune.ts src/types/delve.ts src/data/runes.json src/data/schemas.ts tests/delve-rune-costs.test.ts tests/delve-runes-contract.test.ts)
git add packages/engine/src/types/rune.ts packages/engine/src/types/delve.ts packages/engine/src/data/runes.json packages/engine/src/data/balance.json packages/engine/src/data/schemas.ts packages/engine/tests/delve-rune-costs.test.ts packages/engine/tests/delve-runes-contract.test.ts
git commit -m "feat(engine): rune loads in runes.json and delve.runes.load, every slot at 0" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The helpers and the prices

### Task 3: `runeLoad` and `loadEase`

The two pure helpers, in `loot/runes.ts` right after `extraShotPower` (B adds `loadText` below them). Exported through `export * from './loot/runes.js'`.

**Files:**
- Modify: `packages/engine/src/loot/runes.ts`, `tests/delve-rune-costs.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-costs.test.ts`:

Replace:

```ts
import { BalanceConfigSchema, RunesSchema } from '../src/data/schemas.js';
import { registry } from './fixtures/arena.js';
```

with:

```ts
import { BalanceConfigSchema, RunesSchema } from '../src/data/schemas.js';
import type { DataRegistry } from '../src/data/registry.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { loadEase, runeLoad } from '../src/loot/runes.js';
import type { DelveBalance, HeroStats } from '../src/types/delve.js';
import type { RuneRef } from '../src/types/rune.js';
import { registry } from './fixtures/arena.js';
```

Append at the end of the file:

```ts
const III = (id: string): RuneRef => ({ id, tier: 3 });

/** The default data with `delve.runes.load` changed. */
function withLoad(load: Partial<DelveBalance['runes']['load']>): DataRegistry {
  const bal = registry.getDelveBalance();
  const next = { ...bal, runes: { ...bal.runes, load: { ...bal.runes.load, ...load } } };
  return Object.assign(Object.create(registry) as DataRegistry, { getDelveBalance: () => next });
}
const loaded = withLoad({ bySlot: { primary: 1, defensive: 1, ultimate: 1 } });
const unloaded = withLoad({ bySlot: { primary: 0, defensive: 0, ultimate: 0 } });

/** An unarmed hero attuned `fire` to Fire and `frost` to Frost. */
const bare = computeHeroStats({}, registry);
function at(fire: number, frost = 0): HeroStats {
  return { ...bare, attunement: { ...bare.attunement, fire, frost } };
}

describe('runeLoad and loadEase', () => {
  it("runeLoad is the tier's load × its slot's factor × its form's (1 when unlisted)", () => {
    const r = withLoad({
      bySlot: { primary: 0.5, defensive: 1, ultimate: 1 },
      byForm: { lance: 2 },
    });
    expect(runeLoad(r, III('echo'), 'bolt')).toBeCloseTo(0.45 * 0.5);
    expect(runeLoad(r, III('echo'), 'lance')).toBeCloseTo(0.45 * 0.5 * 2);
    expect(runeLoad(r, { id: 'echo', tier: 5 }, 'nova')).toBeCloseTo(0.63);
    expect(runeLoad(r, { id: 'quick', tier: 1 }, 'ward')).toBeCloseTo(0.15);
    expect(runeLoad(unloaded, { id: 'pierce', tier: 5 }, 'bolt')).toBe(0);
  });

  it("loadEase is easePerAttune × the move's mean attunement, at most easeCap", () => {
    expect(loadEase(registry, at(0), ['fire'])).toBe(0);
    expect(loadEase(registry, at(1), ['fire'])).toBeCloseTo(0.03);
    expect(loadEase(registry, at(15), ['fire'])).toBeCloseTo(0.45);
    expect(loadEase(registry, at(25), ['fire'])).toBe(0.6);
    expect(loadEase(registry, at(15, 5), ['fire', 'frost'])).toBeCloseTo(0.3);
    expect(loadEase(withLoad({ easeCap: 0.2 }), at(15), ['fire'])).toBe(0.2);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts)`
Expected: FAIL, 2 failed and 5 passed (7): `(0 , runeLoad) is not a function` and `(0 , loadEase) is not a function`.

- [ ] **Step 3: Write the helpers**

In `packages/engine/src/loot/runes.ts`:

Replace:

```ts
import type { Rarity } from '../types/gear.js';
```

with:

```ts
import type { HeroStats } from '../types/delve.js';
import type { Rarity } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
```

Replace:

```ts
  return form === 'barrage' ? 1 : power;
}
```

with:

```ts
  return form === 'barrage' ? 1 : power;
}

/**
 * One rune's share of a move's load on `form` (see the rune costs spec): its
 * tier's `load` × its form's slot factor (`bySlot`) × its form factor
 * (`byForm`, 1 for a form it doesn't list), before the move's easing.
 */
export function runeLoad(registry: DataRegistry, ref: RuneRef, form: FormId): number {
  const c = registry.getDelveBalance().runes.load;
  const slot = registry.getForm(form).slot;
  return registry.getRune(ref.id).load[ref.tier - 1] * c.bySlot[slot] * (c.byForm[form] ?? 1);
}

/**
 * The ease a hero's attunement gives a move of `elements` (see the rune costs
 * spec): `easePerAttune` × their mean attunement (as `attunePower` averages
 * it), at most `easeCap`. The move's load is its runes' shares × (1 − ease).
 */
export function loadEase(
  registry: DataRegistry,
  stats: HeroStats,
  elements: readonly ManaType[],
): number {
  const c = registry.getDelveBalance().runes.load;
  const attune = elements.reduce((sum, e) => sum + stats.attunement[e], 0) / elements.length;
  return Math.min(c.easeCap, c.easePerAttune * attune);
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts)`
Expected: PASS, 7 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1603 tests pass in 83 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-costs-contract
(cd packages/engine && npx prettier --write --end-of-line auto src/loot/runes.ts tests/delve-rune-costs.test.ts)
git add packages/engine/src/loot/runes.ts packages/engine/tests/delve-rune-costs.test.ts
git commit -m "feat(engine): runeLoad and loadEase" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: `resolveAbility`'s load and the three prices; `baseCost`

`ResolvedAbility` gains `load` and `ease`; `resolveAbility` sums the acting runes' shares, eases them, and raises the price in the chain's payment. `baseCost` undoes the load for Drain's cap (Task 6). The golden fixture holds v0.51.0's prices.

**Files:**
- Create: `packages/engine/tests/fixtures/rune-costs-v051.json` (never format)
- Modify: `packages/engine/src/types/ability.ts`, `src/arpg/abilities/resolve.ts`, `tests/delve-rune-costs.test.ts`

- [ ] **Step 1: Write the failing tests**

The golden holds v0.51.0's numbers, exactly as Task 1's `goldens.mjs` wrote them (`diff` it against `$S/rune-costs-before/rune-costs-v051.json` if in doubt).

Create `packages/engine/tests/fixtures/rune-costs-v051.json`:

```json
{
  "primary|mana|light|0|bare": [5.6,0,0.08,0,0.08,0.3375],
  "primary|mana|light|0|runed": [5.6,0,0.096,0,0.096,0.3375],
  "primary|mana|medium|0|bare": [8,0,0.14,0,0.14,0.45],
  "primary|mana|medium|0|runed": [8,0,0.168,0,0.168,0.45],
  "primary|mana|heavy|0|bare": [10.4,0,0.24,0,0.24,0.5625],
  "primary|mana|heavy|0|runed": [10.4,0,0.288,0,0.288,0.5625],
  "primary|mana|hold|0|bare": [8,0,0.14,0,0.14,0.45],
  "primary|mana|hold|0|runed": [8,0,0.168,0,0.168,0.45],
  "primary|mana|hold|1|bare": [10.4,0,0.24,0,0.24,0.5625],
  "primary|mana|hold|1|runed": [10.4,0,0.288,0,0.288,0.5625],
  "primary|mana|hold|2|bare": [12.8,0,0.38,0,0.38,0.675],
  "primary|mana|hold|2|runed": [12.8,0,0.45599999999999996,0,0.45599999999999996,0.675],
  "primary|charge|light|0|bare": [0,1.9599999999999997,0.08,0,0.08,1],
  "primary|charge|light|0|runed": [0,1.9599999999999997,0.096,0,0.096,1],
  "primary|charge|medium|0|bare": [0,2.8,0.14,0,0.14,1],
  "primary|charge|medium|0|runed": [0,2.8,0.168,0,0.168,1],
  "primary|charge|heavy|0|bare": [0,3.6399999999999997,0.24,0,0.24,1],
  "primary|charge|heavy|0|runed": [0,3.6399999999999997,0.288,0,0.288,1],
  "primary|charge|hold|0|bare": [0,4.4799999999999995,0.14,0,0.14,1],
  "primary|charge|hold|0|runed": [0,4.4799999999999995,0.168,0,0.168,1],
  "primary|charge|hold|1|bare": [0,4.4799999999999995,0.24,0,0.24,1],
  "primary|charge|hold|1|runed": [0,4.4799999999999995,0.288,0,0.288,1],
  "primary|charge|hold|2|bare": [0,4.4799999999999995,0.38,0,0.38,1],
  "primary|charge|hold|2|runed": [0,4.4799999999999995,0.45599999999999996,0,0.45599999999999996,1],
  "primary|cast|light|0|bare": [2.8,0,0.08,0.26249999999999996,0.34249999999999997,0.3375],
  "primary|cast|light|0|runed": [2.8,0,0.096,0.31499999999999995,0.4109999999999999,0.3375],
  "primary|cast|medium|0|bare": [4,0,0.14,0.35,0.49,0.45],
  "primary|cast|medium|0|runed": [4,0,0.168,0.42,0.588,0.45],
  "primary|cast|heavy|0|bare": [5.2,0,0.24,0.4375,0.6775,0.5625],
  "primary|cast|heavy|0|runed": [5.2,0,0.288,0.525,0.813,0.5625],
  "primary|cast|hold|0|bare": [4,0,0.14,0.35,0.49,0.45],
  "primary|cast|hold|0|runed": [4,0,0.168,0.42,0.588,0.45],
  "primary|cast|hold|1|bare": [5.2,0,0.24,0.4375,0.6775,0.5625],
  "primary|cast|hold|1|runed": [5.2,0,0.288,0.525,0.813,0.5625],
  "primary|cast|hold|2|bare": [6.4,0,0.38,0.5249999999999999,0.9049999999999999,0.675],
  "primary|cast|hold|2|runed": [6.4,0,0.45599999999999996,0.6299999999999999,1.0859999999999999,0.675],
  "defensive|mana|light|0|bare": [17.5,0,0.04,0,0.04,7.5],
  "defensive|mana|light|0|runed": [17.5,0,0.04,0,0.04,6],
  "defensive|mana|medium|0|bare": [25,0,0.07,0,0.07,10],
  "defensive|mana|medium|0|runed": [25,0,0.07,0,0.07,8],
  "defensive|mana|heavy|0|bare": [32.5,0,0.12,0,0.12,12.5],
  "defensive|mana|heavy|0|runed": [32.5,0,0.12,0,0.12,10],
  "defensive|mana|hold|0|bare": [25,0,0.07,0,0.07,10],
  "defensive|mana|hold|0|runed": [25,0,0.07,0,0.07,8],
  "defensive|mana|hold|1|bare": [32.5,0,0.12,0,0.12,12.5],
  "defensive|mana|hold|1|runed": [32.5,0,0.12,0,0.12,10],
  "defensive|mana|hold|2|bare": [40,0,0.19,0,0.19,15],
  "defensive|mana|hold|2|runed": [40,0,0.19,0,0.19,12],
  "defensive|charge|light|0|bare": [0,6.125,0.04,0,0.04,1],
  "defensive|charge|light|0|runed": [0,6.125,0.04,0,0.04,0.8],
  "defensive|charge|medium|0|bare": [0,8.75,0.07,0,0.07,1],
  "defensive|charge|medium|0|runed": [0,8.75,0.07,0,0.07,0.8],
  "defensive|charge|heavy|0|bare": [0,11.375,0.12,0,0.12,1],
  "defensive|charge|heavy|0|runed": [0,11.375,0.12,0,0.12,0.8],
  "defensive|charge|hold|0|bare": [0,14,0.07,0,0.07,1],
  "defensive|charge|hold|0|runed": [0,14,0.07,0,0.07,0.8],
  "defensive|charge|hold|1|bare": [0,14,0.12,0,0.12,1],
  "defensive|charge|hold|1|runed": [0,14,0.12,0,0.12,0.8],
  "defensive|charge|hold|2|bare": [0,14,0.19,0,0.19,1],
  "defensive|charge|hold|2|runed": [0,14,0.19,0,0.19,0.8],
  "defensive|cast|light|0|bare": [8.75,0,0.04,0.375,0.415,7.5],
  "defensive|cast|light|0|runed": [8.75,0,0.04,0.375,0.415,6],
  "defensive|cast|medium|0|bare": [12.5,0,0.07,0.5,0.5700000000000001,10],
  "defensive|cast|medium|0|runed": [12.5,0,0.07,0.5,0.5700000000000001,8],
  "defensive|cast|heavy|0|bare": [16.25,0,0.12,0.625,0.745,12.5],
  "defensive|cast|heavy|0|runed": [16.25,0,0.12,0.625,0.745,10],
  "defensive|cast|hold|0|bare": [12.5,0,0.07,0.5,0.5700000000000001,10],
  "defensive|cast|hold|0|runed": [12.5,0,0.07,0.5,0.5700000000000001,8],
  "defensive|cast|hold|1|bare": [16.25,0,0.12,0.625,0.745,12.5],
  "defensive|cast|hold|1|runed": [16.25,0,0.12,0.625,0.745,10],
  "defensive|cast|hold|2|bare": [20,0,0.19,0.75,0.94,15],
  "defensive|cast|hold|2|runed": [20,0,0.19,0.75,0.94,12],
  "ultimate|mana|light|0|bare": [42,0,0.128,0,0.128,13.5],
  "ultimate|mana|light|0|runed": [42,0,0.1536,0,0.1536,13.5],
  "ultimate|mana|medium|0|bare": [60,0,0.22400000000000003,0,0.22400000000000003,18],
  "ultimate|mana|medium|0|runed": [60,0,0.26880000000000004,0,0.26880000000000004,18],
  "ultimate|mana|heavy|0|bare": [78,0,0.384,0,0.384,22.5],
  "ultimate|mana|heavy|0|runed": [78,0,0.4608,0,0.4608,22.5],
  "ultimate|mana|hold|0|bare": [60,0,0.22400000000000003,0,0.22400000000000003,18],
  "ultimate|mana|hold|0|runed": [60,0,0.26880000000000004,0,0.26880000000000004,18],
  "ultimate|mana|hold|1|bare": [78,0,0.384,0,0.384,22.5],
  "ultimate|mana|hold|1|runed": [78,0,0.4608,0,0.4608,22.5],
  "ultimate|mana|hold|2|bare": [96,0,0.6080000000000001,0,0.6080000000000001,27],
  "ultimate|mana|hold|2|runed": [96,0,0.7296000000000001,0,0.7296000000000001,27],
  "ultimate|charge|light|0|bare": [0,14.7,0.128,0,0.128,1],
  "ultimate|charge|light|0|runed": [0,14.7,0.1536,0,0.1536,1],
  "ultimate|charge|medium|0|bare": [0,21,0.22400000000000003,0,0.22400000000000003,1],
  "ultimate|charge|medium|0|runed": [0,21,0.26880000000000004,0,0.26880000000000004,1],
  "ultimate|charge|heavy|0|bare": [0,27.299999999999997,0.384,0,0.384,1],
  "ultimate|charge|heavy|0|runed": [0,27.299999999999997,0.4608,0,0.4608,1],
  "ultimate|charge|hold|0|bare": [0,33.599999999999994,0.22400000000000003,0,0.22400000000000003,1],
  "ultimate|charge|hold|0|runed": [0,33.599999999999994,0.26880000000000004,0,0.26880000000000004,1],
  "ultimate|charge|hold|1|bare": [0,33.599999999999994,0.384,0,0.384,1],
  "ultimate|charge|hold|1|runed": [0,33.599999999999994,0.4608,0,0.4608,1],
  "ultimate|charge|hold|2|bare": [0,33.599999999999994,0.6080000000000001,0,0.6080000000000001,1],
  "ultimate|charge|hold|2|runed": [0,33.599999999999994,0.7296000000000001,0,0.7296000000000001,1],
  "ultimate|cast|light|0|bare": [21,0,0.128,0.8999999999999999,1.028,13.5],
  "ultimate|cast|light|0|runed": [21,0,0.1536,1.0799999999999998,1.2335999999999998,13.5],
  "ultimate|cast|medium|0|bare": [30,0,0.22400000000000003,1.2,1.424,18],
  "ultimate|cast|medium|0|runed": [30,0,0.26880000000000004,1.44,1.7088,18],
  "ultimate|cast|heavy|0|bare": [39,0,0.384,1.5,1.884,22.5],
  "ultimate|cast|heavy|0|runed": [39,0,0.4608,1.7999999999999998,2.2607999999999997,22.5],
  "ultimate|cast|hold|0|bare": [30,0,0.22400000000000003,1.2,1.424,18],
  "ultimate|cast|hold|0|runed": [30,0,0.26880000000000004,1.44,1.7088,18],
  "ultimate|cast|hold|1|bare": [39,0,0.384,1.5,1.884,22.5],
  "ultimate|cast|hold|1|runed": [39,0,0.4608,1.7999999999999998,2.2607999999999997,22.5],
  "ultimate|cast|hold|2|bare": [48,0,0.6080000000000001,1.7999999999999998,2.408,27],
  "ultimate|cast|hold|2|runed": [48,0,0.7296000000000001,2.1599999999999997,2.8895999999999997,27]
}
```

In `packages/engine/tests/delve-rune-costs.test.ts`:

Replace:

```ts
import type { DataRegistry } from '../src/data/registry.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
```

with:

```ts
import type { DataRegistry } from '../src/data/registry.js';
import {
  baseCost,
  chargeCap,
  resolveAbility,
  resolveChain,
} from '../src/arpg/abilities/resolve.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
```

Replace:

```ts
import type { DelveBalance, HeroStats } from '../src/types/delve.js';
import type { RuneRef } from '../src/types/rune.js';
import { registry } from './fixtures/arena.js';
```

with:

```ts
import type { AbilityPayment, AbilitySlot, Move, MoveKind } from '../src/types/ability.js';
import type { DelveBalance, HeroStats } from '../src/types/delve.js';
import type { RuneRef } from '../src/types/rune.js';
import GOLDEN from './fixtures/rune-costs-v051.json';
import { gear, registry } from './fixtures/arena.js';
```

Append at the end of the file:

```ts
/** The spec's worked example: Echo, Heavy and Linger at tier III, a raw load of 1.95. */
const SET = [III('echo'), III('heavy'), III('linger')];

/** A medium Fire Bolt with these parts changed. */
function bolt(over: Partial<Move> = {}): Move {
  return { kind: 'medium', form: 'bolt', elements: ['fire'], ...over };
}

describe('resolveAbility: the load and the prices', () => {
  /** The golden's moves: each slot's form, its element and the runes of its runed rows. */
  const MOVES: Record<AbilitySlot, [Move['form'], Move['elements'], RuneRef[]]> = {
    primary: ['bolt', ['fire'], SET],
    defensive: ['ward', ['frost'], [III('quick'), III('chain'), III('drain')]],
    ultimate: ['nova', ['fire'], SET],
  };

  it('resolves as v0.51.0 did: a runed move with bySlot at 0, a rune-less one at any bySlot', () => {
    const stats = at(15, 15);
    const rows = Object.entries(GOLDEN as Record<string, number[]>);
    expect(rows).toHaveLength(108);
    for (const [key, want] of rows) {
      const [slot, payment, kind, stage, runed] = key.split('|') as [
        AbilitySlot,
        AbilityPayment,
        MoveKind,
        string,
        string,
      ];
      const [form, elements, runes] = MOVES[slot];
      const move: Move = { kind, form, elements, ...(runed === 'runed' ? { runes } : {}) };
      for (const reg of runed === 'runed' ? [unloaded] : [unloaded, loaded]) {
        const r = resolveAbility(reg, slot, move, payment, stats, +stage);
        const got = [r.cost, r.chargeNeed, r.conjure, r.channel, r.castTime, r.cooldown];
        expect(got, key).toEqual(want);
        expect(r.load, key).toBe(0);
        expect(r.ease, key).toBeCloseTo(0.45);
      }
    }
  });

  it('adds the shares of the runes acting, then eases them: 0.97, 0.55 and 0.4 of raw at 1, 15 and 25', () => {
    const r = (stats: HeroStats) =>
      resolveAbility(loaded, 'primary', bolt({ runes: SET }), 'mana', stats);
    expect(r(at(0)).load).toBeCloseTo(1.95);
    expect(r(at(1)).load).toBeCloseTo(1.95 * 0.97);
    expect(r(at(15)).load).toBeCloseTo(1.95 * 0.55);
    expect(r(at(25)).load).toBeCloseTo(1.95 * 0.4);
    const none = resolveAbility(loaded, 'primary', bolt(), 'mana', at(15));
    expect(none.load).toBe(0);
    expect(none.ease).toBeCloseTo(0.45);
    // A fusion move eases by its two elements' mean.
    const fusion = resolveAbility(
      loaded,
      'primary',
      bolt({ elements: ['fire', 'frost'], runes: [III('echo')] }),
      'mana',
      at(15, 5),
    );
    expect(fusion.ease).toBeCloseTo(0.3);
    expect(fusion.load).toBeCloseTo(0.45 * 0.7);
  });

  it('adds nothing for an empty socket, an unknown id or a Pierce on an Earth Bolt', () => {
    const r = (over: Partial<Move>) => resolveAbility(loaded, 'primary', bolt(over), 'mana', at(0));
    expect(r({ runes: [III('echo'), null, { id: 'nope', tier: 3 }] }).load).toBeCloseTo(0.45);
    const earth = r({ elements: ['earth'], runes: [III('pierce'), III('echo')] });
    expect(earth.runes).toEqual([III('echo')]);
    expect(earth.load).toBeCloseTo(0.45);
  });

  it('raises the price in the payment: mana × (1 + load), a cast its mana and its channel, a charge chain its need; never a cooldown or the conjure', () => {
    // The spec's worked example: a starting hero (1 attunement), eased 3%, so the load is 1.89.
    const pay = (payment: AbilityPayment, reg = loaded) =>
      resolveAbility(reg, 'primary', bolt({ runes: SET }), payment, at(1));
    const load = 1.95 * 0.97;
    expect(pay('mana').cost).toBeCloseTo(23.1, 1);
    expect(pay('charge').chargeNeed).toBeCloseTo(8.1, 1);
    expect(pay('charge').cost).toBe(0);
    expect(pay('cast').cost).toBeCloseTo(11.6, 1);
    // Heavy's wind-up +20%: a 0.42 s channel becomes 1.21 s.
    expect(pay('cast').channel).toBeCloseTo(1.21, 2);
    for (const payment of ['mana', 'charge', 'cast'] as const) {
      const now = pay(payment);
      const before = pay(payment, unloaded);
      expect(now.load).toBeCloseTo(load);
      expect(now.cost).toBeCloseTo(before.cost * (1 + load));
      expect(now.chargeNeed).toBeCloseTo(before.chargeNeed * (1 + load));
      expect(now.channel).toBeCloseTo(before.channel * (1 + load));
      expect(now.castTime).toBeCloseTo(now.conjure + now.channel);
      expect(now.conjure).toBe(before.conjure);
      expect(now.cooldown).toBe(before.cooldown);
    }
    // The conversions: how much of the load a charge need and a channel take.
    const conv = withLoad({
      bySlot: { primary: 1, defensive: 1, ultimate: 1 },
      charge: 2,
      cast: 0.5,
    });
    expect(pay('charge', conv).chargeNeed).toBeCloseTo(
      pay('charge', unloaded).chargeNeed * (1 + load * 2),
    );
    expect(pay('cast', conv).channel).toBeCloseTo(pay('cast', unloaded).channel * (1 + load * 0.5));
    expect(pay('cast', conv).cost).toBeCloseTo(pay('cast').cost);
  });

  it("keeps a charge chain's lockout, and its meter grows to hold the loaded need", () => {
    const novas = (reg: DataRegistry) =>
      resolveChain(reg, at(1), 'ultimate', {
        payment: 'charge',
        moves: [
          { kind: 'medium', form: 'nova', elements: ['fire'], runes: [III('echo')] },
          { kind: 'heavy', form: 'nova', elements: ['fire'] },
        ],
      });
    const before = novas(unloaded);
    const now = novas(loaded);
    expect(now.moves[0].cooldown).toBe(before.moves[0].cooldown);
    expect(now.moves[0].chargeNeed).toBeCloseTo(before.moves[0].chargeNeed * (1 + 0.45 * 0.97));
    expect(now.moves[1].chargeNeed).toBe(before.moves[1].chargeNeed);
    // Unloaded the heavy Nova needs most; loaded, the runed medium one does.
    expect(chargeCap(before)).toBe(before.moves[1].chargeNeed);
    expect(chargeCap(now)).toBe(now.moves[0].chargeNeed);
  });

  it("stacks with Manaweaver as one product, and loads each of a hold's stages", () => {
    const load = 1.95 * 0.97;
    const weaver = { ...at(1), legendaries: { manaweaver: 20 } };
    expect(
      resolveAbility(loaded, 'primary', bolt({ runes: SET }), 'mana', weaver).cost,
    ).toBeCloseTo(8 * 0.8 * (1 + load));
    for (const payment of ['mana', 'charge'] as const) {
      const hold = (reg: DataRegistry) =>
        resolveChain(reg, at(1), 'primary', {
          payment,
          moves: [bolt({ kind: 'hold', runes: SET })],
        }).hold[0]!;
      const [now, before] = [hold(loaded), hold(unloaded)];
      for (const stage of [0, 1, 2]) {
        expect(now[stage].cost).toBeCloseTo(before[stage].cost * (1 + load));
        expect(now[stage].chargeNeed).toBeCloseTo(before[stage].chargeNeed * (1 + load));
      }
    }
  });

  it('leaves basic blows free: runed blows resolve the same at any bySlot', () => {
    const blows = (reg: DataRegistry) =>
      computeHeroStats({ weapon: gear('fire') }, reg, {
        pair: { primary: 'fire', secondary: null },
        basic: [
          { kind: 'light', element: 'fire', runes: [III('echo')] },
          { kind: 'light', element: 'fire', runes: [III('heavy')] },
          { kind: 'heavy', element: 'fire', runes: [III('linger')] },
        ],
      }).weapon.blows;
    expect(blows(loaded)).toEqual(blows(unloaded));
    expect(blows(loaded)[2].runes).toEqual([III('linger')]);
  });

  it('baseCost is the mana cost before the load: 0 for a charge move', () => {
    const pay = (payment: AbilityPayment) =>
      resolveAbility(loaded, 'primary', bolt({ runes: SET }), payment, at(1));
    expect(baseCost(pay('mana'))).toBeCloseTo(8);
    expect(baseCost(pay('cast'))).toBeCloseTo(4);
    expect(baseCost(pay('charge'))).toBe(0);
    expect(baseCost(resolveAbility(loaded, 'primary', bolt(), 'mana', at(1)))).toBe(8);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts)`
Expected: FAIL, 7 failed and 8 passed (15): the golden (`primary|mana|light|0|bare: expected undefined to be +0`: every price already matches v0.51.0, and `load` is missing), the sums (`expected undefined to be close to 1.95`, `… to be close to 0.45`), the payments (`expected 8 to be close to 23.1`), the charge meter (`expected 21 to be close to 30.166500000000003`), Manaweaver (`expected 6.4 to be close to 18.505599999999998`) and `(0 , baseCost) is not a function`. The blows test already passes: blows carry no price, before or after.

- [ ] **Step 3: Write the load and the prices**

In `packages/engine/src/types/ability.ts`:

Replace:

```ts
  knobs: Knobs;
  /** The runes acting on it (fitting and not dormant), in socket order. */
  runes: RuneRef[];
}
```

with:

```ts
  knobs: Knobs;
  /** The runes acting on it (fitting and not dormant), in socket order. */
  runes: RuneRef[];
  /**
   * Its runes' load (see the rune costs spec): Σ `runeLoad` over `runes` × (1 − ease), before
   * the payment's conversion. 0 without runes.
   */
  load: number;
  /**
   * How much its attunement eases its runes' load: min(easeCap, easePerAttune × its average
   * attunement). Set with or without runes.
   */
  ease: number;
}
```

In `packages/engine/src/arpg/abilities/resolve.ts`:

Replace:

```ts
import { extraShotPower, runeFits, runeKnobs } from '../../loot/runes.js';
```

with:

```ts
import { extraShotPower, loadEase, runeFits, runeKnobs, runeLoad } from '../../loot/runes.js';
```

Replace:

```ts
  const knobs = mergeKnobs(...own, ...socketed.knobs.filter((_, i) => acts[i]));
```

with:

```ts
  const knobs = mergeKnobs(...own, ...socketed.knobs.filter((_, i) => acts[i]));
  const runes = socketed.active.filter((_, i) => acts[i]);
  // Its runes' load (see the rune costs spec): their shares added, eased by its attunement. It
  // raises the price in the chain's own payment: the mana, the charge need, or a cast's channel
  // and mana. No cooldown moves.
  const ease = loadEase(registry, stats, move.elements);
  const load = runes.reduce((sum, r) => sum + runeLoad(registry, r, move.form), 0) * (1 - ease);
  const C = bal.runes.load;
```

Replace:

```ts
  const channel = cast ? s.castTime * (1 + W.castTime * w) * q.windup : 0;
```

with:

```ts
  const channel = cast ? s.castTime * (1 + W.castTime * w) * q.windup * (1 + load * C.cast) : 0;
```

Replace:

```ts
    cost: payment === 'charge' ? 0 : cast ? manaCost * ab.castManaMult : manaCost,
```

with:

```ts
    // Manaweaver, the cast's half and the load multiply, in that order.
    cost: payment === 'charge' ? 0 : (cast ? manaCost * ab.castManaMult : manaCost) * (1 + load),
```

Replace:

```ts
    chargeNeed: payment === 'charge' ? s.cost * (1 + W.cost * needWeight) * ab.chargeRatio : 0,
```

with:

```ts
    chargeNeed:
      payment === 'charge'
        ? s.cost * (1 + W.cost * needWeight) * ab.chargeRatio * (1 + load * C.charge)
        : 0,
```

Replace:

```ts
    runes: socketed.active.filter((_, i) => acts[i]),
  };
```

with:

```ts
    runes,
    load,
    ease,
  };
```

Replace:

```ts
/** The step bonus of the move at `index`: its power and size factors. */
```

with:

```ts
/** A move's mana cost before its runes' load (0 for a charge move): Drain's cap reads it. */
export function baseCost(ab: ResolvedAbility): number {
  return ab.cost / (1 + ab.load);
}

/** The step bonus of the move at `index`: its power and size factors. */
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts)`
Expected: PASS, 15 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1611 tests pass in 83 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-costs-contract
(cd packages/engine && npx prettier --write --end-of-line auto src/types/ability.ts src/arpg/abilities/resolve.ts tests/delve-rune-costs.test.ts)
git add packages/engine/src/types/ability.ts packages/engine/src/arpg/abilities/resolve.ts packages/engine/tests/delve-rune-costs.test.ts packages/engine/tests/fixtures/rune-costs-v051.json
git commit -m "feat(engine): resolveAbility raises a runed move's price in its payment by its eased load; baseCost" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: Power's mana side, the exports and the verification

### Task 5: `basicIncome` and `manaSupport`

`basicIncome` is `estimateCombat`'s `income + blowDrain / strikeInterval`, factored out and read by `manaIncome`; `manaSupport` sets a chain's spend against the build's refill. The Power golden proves `estimateCombat` didn't move.

**Files:**
- Modify: `packages/engine/src/delve/hero-stats.ts`, `tests/delve-rune-costs.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-costs.test.ts`:

Replace:

```ts
import { computeHeroStats } from '../src/delve/hero-stats.js';
```

with:

```ts
import {
  basicIncome,
  computeHeroStats,
  estimateCombat,
  manaPool,
  manaSupport,
  useInterval,
} from '../src/delve/hero-stats.js';
```

Replace:

```ts
import type { AbilityPayment, AbilitySlot, Move, MoveKind } from '../src/types/ability.js';
```

with:

```ts
import type { AbilityPayment, AbilitySlot, Chain, Move, MoveKind } from '../src/types/ability.js';
```

Append at the end of the file:

```ts
describe('basicIncome and manaSupport', () => {
  /** A common Fire sword, the arena fixture's, attuned `extra` more to Fire; its blows Drain III when `drain`. */
  function swordHero(drain: boolean, extra = 0): HeroStats {
    return computeHeroStats({ weapon: gear('fire') }, registry, {
      pair: { primary: 'fire', secondary: null },
      attunement: { fire: extra },
      basic: (['light', 'light', 'heavy'] as const).map((kind) => ({
        kind,
        element: 'fire' as const,
        ...(drain ? { runes: [III('drain')] } : {}),
      })),
    });
  }
  /** Seconds between strikes, as Power counts them. */
  const strikeInterval = (s: HeroStats) =>
    (s.attackInterval * s.weapon.blows.reduce((a, b) => a + b.time * b.knobs.quick.beat, 0)) /
    s.weapon.blows.length;

  it("basicIncome is regen and a strike's gain, plus the blows' Drain, over the strike interval", () => {
    const plain = swordHero(false);
    const drained = swordHero(true);
    const gain = registry.getDelveBalance().mana.basicAttackGain;
    expect(basicIncome(registry, plain)).toBeCloseTo(
      manaPool(plain, registry).regen + gain / strikeInterval(plain),
    );
    // Drain III: 2 mana a foe-hit over the sword's cleave, at most half a strike's 5.
    expect(basicIncome(registry, drained) - basicIncome(registry, plain)).toBeCloseTo(
      2.5 / strikeInterval(drained),
    );
  });

  it("leaves estimateCombat as it was: v0.51.0's Power exactly, its DPS to the float", () => {
    const hero = computeHeroStats({ weapon: gear('fire') }, registry, {
      pair: { primary: 'fire', secondary: 'frost' },
      attunement: { fire: 14, frost: 5 },
      basic: (['light', 'light', 'heavy'] as const).map((kind) => ({
        kind,
        element: 'fire' as const,
        runes: [III('drain')],
      })),
    });
    const drained: Partial<Record<AbilitySlot, Chain>> = {
      primary: {
        payment: 'mana',
        moves: [
          bolt({ kind: 'light', runes: [III('drain'), III('echo')] }),
          bolt({ kind: 'hold', elements: ['fire', 'frost'], runes: [III('drain')] }),
        ],
      },
      defensive: {
        payment: 'mana',
        moves: [{ kind: 'medium', form: 'ward', elements: ['frost'], runes: [III('drain')] }],
      },
      ultimate: {
        payment: 'cast',
        moves: [
          { kind: 'heavy', form: 'nova', elements: ['fire'], runes: [III('drain'), III('heavy')] },
        ],
      },
    };
    const charged = {
      ...drained,
      ultimate: {
        payment: 'charge' as const,
        moves: [
          {
            kind: 'medium' as const,
            form: 'nova' as const,
            elements: ['fire' as const],
            runes: [III('drain')],
          },
        ],
      },
    };
    const cases: [Partial<Record<AbilitySlot, Chain>> | undefined, number, number][] = [
      [drained, 77.33972432955927, 1098],
      [charged, 122.88517595614529, 1385],
      [undefined, 158.57566058873041, 1573],
    ];
    for (const [chains, dps, power] of cases) {
      const e = estimateCombat(hero, registry, 10, chains);
      expect(e.power).toBe(power);
      expect(e.dps).toBeCloseTo(dps, 9);
    }
  });

  it("spend is the moves' mean cost over their unbounded interval; refill is basicIncome without Drain on the chain", () => {
    const stats = swordHero(false);
    const bal = registry.getDelveBalance();
    const chain = resolveChain(registry, stats, 'primary', {
      payment: 'mana',
      moves: [bolt(), bolt({ kind: 'heavy' })],
    });
    const every = useInterval(bal, chain, stats.tempo, Infinity, Infinity);
    const support = manaSupport(registry, stats, chain);
    expect(support.spend).toBeCloseTo((chain.moves[0].cost + chain.moves[1].cost) / 2 / every);
    expect(support.refill).toBe(basicIncome(registry, stats));
    const charge = resolveChain(registry, stats, 'primary', { payment: 'charge', moves: [bolt()] });
    expect(manaSupport(registry, stats, charge)).toEqual({
      spend: 0,
      refill: basicIncome(registry, stats),
    });
  });

  it('spends the eased load: a runed chain costs 1 + load as much, less on a better-attuned hero', () => {
    // Echo, Linger and Pierce leave the wind-up and the beat alone, so the interval stays.
    const runes = [III('echo'), III('linger'), III('pierce')];
    const spend = (stats: HeroStats, withRunes: boolean) =>
      manaSupport(
        loaded,
        stats,
        resolveChain(loaded, stats, 'primary', {
          payment: 'mana',
          moves: [bolt(withRunes ? { runes } : {})],
        }),
      ).spend;
    const starved = swordHero(false);
    const supported = swordHero(false, 14);
    expect(starved.attunement.fire).toBe(1);
    expect(spend(starved, true) / spend(starved, false)).toBeCloseTo(1 + 2.35 * 0.97);
    expect(spend(supported, true) / spend(supported, false)).toBeCloseTo(1 + 2.35 * 0.55);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts)`
Expected: FAIL, 3 failed and 16 passed (19): `(0 , basicIncome) is not a function`, and `(0 , manaSupport) is not a function` twice. The Power golden already passes: it is the refactor's guard, and it passes again after.

- [ ] **Step 3: Write `basicIncome` and `manaSupport`**

In `packages/engine/src/delve/hero-stats.ts`:

Replace:

```ts
/**
 * Heuristic DPS / effective-HP estimate against the reference monster, used
```

with:

```ts
/**
 * Mana a second the basics bring back at their full rate, as Power counts them
 * (see the rune costs spec): regen, `basicAttackGain` a strike, and the blows'
 * Drain (each blow's foe-hits at most `drainFoes`, capped at `drainShare` of a
 * strike's gain), over the strike interval. `estimateCombat`'s mana income
 * before its skills' Drain.
 */
export function basicIncome(registry: DataRegistry, stats: HeroStats): number {
  const bal = registry.getDelveBalance();
  // As `estimateCombat` counts the basics: its cleave and its strike interval.
  const blows = stats.weapon.blows;
  const melee = stats.weapon.kind === 'melee';
  const cleave = melee ? 1 + (stats.weapon.arc / 360) * 1.5 : stats.weapon.pierce ? 1.4 : 1;
  const stringTime = blows.reduce((a, s) => a + s.time * s.knobs.quick.beat, 0);
  const strikeInterval = (stats.attackInterval * stringTime) / blows.length;
  const income = manaPool(stats, registry).regen + bal.mana.basicAttackGain / strikeInterval;
  const blowDrain = mean(
    blows.map((b) =>
      Math.min(
        b.knobs.manaOnHit * Math.min(cleave, bal.runes.drainFoes),
        bal.mana.basicAttackGain * bal.runes.drainShare,
      ),
    ),
  );
  return income + blowDrain / strikeInterval;
}

/** A chain's mana spend a second against the build's refill (see the rune costs spec). */
export interface ManaSupport {
  /** Mana a second the chain spends, held at its cadence: each move's cost over the
   *  interval its cooldown, wind-up and beat allow (`useInterval` with mana and charge
   *  unbounded), as if the pool always paid. 0 for a charge chain. */
  spend: number;
  /** Mana a second the build brings back while it does: regen, the basics at their full
   *  rate (`basicAttackGain` a strike plus the blows' Drain, as Power counts them), and
   *  this chain's own Drain at its cadence (`drainPerUse`). */
  refill: number;
}

/**
 * A chain's mana support, for the builder's "Spends 14/s · your build refills
 * 9/s" (see the rune costs spec): its moves' mean cost (a hold's at full
 * charge) over its unbounded `useInterval`, against `basicIncome` plus its
 * own Drain over the same interval. It ignores the pool's cap.
 */
export function manaSupport(
  registry: DataRegistry,
  stats: HeroStats,
  chain: ResolvedChain,
): ManaSupport {
  const bal = registry.getDelveBalance();
  const every = useInterval(bal, chain, stats.tempo, Infinity, Infinity);
  return {
    spend: mean(chain.moves.map((_, i) => valuedMove(chain, i).cost)) / every,
    refill: basicIncome(registry, stats) + drainPerUse(chain, bal) / every,
  };
}

/**
 * Heuristic DPS / effective-HP estimate against the reference monster, used
```

Replace:

```ts
  const manaIncome =
    income +
    mean(
      blows.map((b) =>
        Math.min(
          b.knobs.manaOnHit * Math.min(cleave, bal.runes.drainFoes),
          bal.mana.basicAttackGain * bal.runes.drainShare,
        ),
      ),
    ) /
      strikeInterval +
    drained(primary, 0.7) +
```

with:

```ts
  const manaIncome =
    basicIncome(registry, stats) +
    drained(primary, 0.7) +
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts)`
Expected: PASS, 19 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1615 tests pass in 83 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-costs-contract
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/hero-stats.ts tests/delve-rune-costs.test.ts)
git add packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-rune-costs.test.ts
git commit -m "feat(engine): basicIncome factored out of estimateCombat, and manaSupport" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: Drain's cap on the cost before the load

`fire`'s Drain budget and Power's `drainPerUse` both cap at `baseCost(ab) × drainShare`, so Drain can't pay back a rune's price (its own included).

**Files:**
- Modify: `packages/engine/src/arpg/abilities/cast.ts`, `src/delve/hero-stats.ts`, `tests/delve-rune-costs.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-costs.test.ts`:

Replace:

```ts
import { gear, registry } from './fixtures/arena.js';
```

with:

```ts
import { arena, dummy, gear, moveOf, press, registry } from './fixtures/arena.js';
```

Append at the end of the file:

```ts
describe("Drain's cap: half the cost before the load", () => {
  /** A light mana Bolt with Drain III: 5.6 mana before its load, so Drain gives back at most 2.8. */
  const chain: Chain = { payment: 'mana', moves: [bolt({ kind: 'light', runes: [III('drain')] })] };

  it("a cast's Drain budget is baseCost × drainShare, not the loaded cost's", () => {
    const w = arena([dummy(13, 26)], { noBasic: true, chains: { primary: chain } });
    w.hero.chains[0] = resolveChain(loaded, w.hero.stats, 'primary', chain);
    const ab = moveOf(w, 0);
    expect(ab.cost).toBeGreaterThan(baseCost(ab));
    press(w, 0);
    expect(w.hero.drainLeft[0]).toBeCloseTo(
      baseCost(ab) * registry.getDelveBalance().runes.drainShare,
    );
  });

  it("manaSupport's refill counts the chain's Drain capped the same way", () => {
    const stats = computeHeroStats({ weapon: gear('fire') }, registry, {
      pair: { primary: 'fire', secondary: null },
    });
    const resolved = resolveChain(loaded, stats, 'primary', chain);
    const every = useInterval(
      registry.getDelveBalance(),
      resolved,
      stats.tempo,
      Infinity,
      Infinity,
    );
    // 2 a foe-hit × a Bolt's 1.6 foes is 3.2, past the cap of 2.8.
    expect(manaSupport(loaded, stats, resolved).refill - basicIncome(registry, stats)).toBeCloseTo(
      2.8 / every,
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts)`
Expected: FAIL, 2 failed and 19 passed (21): `expected 3.8863999999999996 to be close to 2.8` (the budget is half the loaded 7.77 mana) and `expected 9.481481481481483 to be close to 8.296296296296296` (Power's Drain capped by the loaded cost lets the full 3.2 through).

- [ ] **Step 3: Cap Drain on `baseCost`**

In `packages/engine/src/arpg/abilities/cast.ts`:

Replace:

```ts
import { chainMove, holdFull, moveBeat, stepBonus, stepHeft } from './resolve.js';
```

with:

```ts
import { baseCost, chainMove, holdFull, moveBeat, stepBonus, stepHeft } from './resolve.js';
```

Replace:

```ts
  // Drain's and Linger's budgets are the cast's: they count from before the move's hits land.
  h.drained[slot] = 0;
  h.drainLeft[slot] = ab.cost * bal.runes.drainShare;
```

with:

```ts
  // Drain's and Linger's budgets are the cast's: they count from before the move's hits land.
  // Drain's is a share of its cost before its runes' load, so Drain can't pay back their price.
  h.drained[slot] = 0;
  h.drainLeft[slot] = baseCost(ab) * bal.runes.drainShare;
```

In `packages/engine/src/delve/hero-stats.ts`:

Replace:

```ts
import {
  NEUTRAL,
  chainMove,
```

with:

```ts
import {
  NEUTRAL,
  baseCost,
  chainMove,
```

Replace:

```ts
/**
 * Mana a use of a chain drains: each move's per foe-hit × its foe-hits (its
 * foes × its impacts), at most `drainFoes`.
 */
```

with:

```ts
/**
 * Mana a use of a chain drains: each move's per foe-hit × its foe-hits (its
 * foes × its impacts), at most `drainFoes`, and at most `drainShare` of its
 * cost before its runes' load (`baseCost`), as the sim caps it.
 */
```

Replace:

```ts
        ab.cost * bal.runes.drainShare,
```

with:

```ts
        baseCost(ab) * bal.runes.drainShare,
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts)`
Expected: PASS, 21 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1617 tests pass in 83 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-costs-contract
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/abilities/cast.ts src/delve/hero-stats.ts tests/delve-rune-costs.test.ts)
git add packages/engine/src/arpg/abilities/cast.ts packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-rune-costs.test.ts
git commit -m "feat(engine): Drain's cap on a move's cost before its runes' load, in the sim and in Power" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 7: The exports, and the client on the new bundle

`baseCost`, `basicIncome` and `manaSupport` join `src/index.ts`'s named lists (`runeLoad` and `loadEase` are already out through `export * from './loot/runes.js'`), with the `ManaSupport` type. The client needs no edit: rebuilt, its typecheck and suite stay green.

**Files:**
- Modify: `packages/engine/src/index.ts`, `tests/delve-rune-costs.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/engine/tests/delve-rune-costs.test.ts`:

Replace:

```ts
import { loadEase, runeLoad } from '../src/loot/runes.js';
```

with:

```ts
import * as engine from '../src/index.js';
import { loadEase, runeLoad } from '../src/loot/runes.js';
```

Append at the end of the file:

```ts
describe("the contract's exports", () => {
  it('exports runeLoad, loadEase, baseCost, basicIncome and manaSupport', () => {
    for (const name of ['runeLoad', 'loadEase', 'baseCost', 'basicIncome', 'manaSupport'] as const)
      expect(typeof engine[name], name).toBe('function');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts)`
Expected: FAIL, 1 failed and 21 passed (22): `baseCost: expected 'undefined' to be 'function'`.

- [ ] **Step 3: Export them**

In `packages/engine/src/index.ts`:

Replace:

```ts
  manaPool,
  hasMastery,
  isAttuneStat,
} from './delve/hero-stats.js';
```

with:

```ts
  manaPool,
  hasMastery,
  isAttuneStat,
  basicIncome,
  manaSupport,
} from './delve/hero-stats.js';
```

Replace:

```ts
  CombatEstimate,
  HeroStatsExtra,
  WeaponValue,
} from './delve/hero-stats.js';
```

with:

```ts
  CombatEstimate,
  HeroStatsExtra,
  WeaponValue,
  ManaSupport,
} from './delve/hero-stats.js';
```

Replace:

```ts
  chargeCap,
  stepBonus,
  beatFor,
```

with:

```ts
  chargeCap,
  baseCost,
  stepBonus,
  beatFor,
```

- [ ] **Step 4: Run it to see it pass, then the client on the new bundle**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts)`
Expected: PASS, 22 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run && npx tsup)`
Expected: no type errors; 1618 tests pass in 83 files; then `Build success` for ESM, CJS and DTS.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 860 tests pass in 98 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-costs-contract
(cd packages/engine && npx prettier --write --end-of-line auto src/index.ts tests/delve-rune-costs.test.ts)
git add packages/engine/src/index.ts packages/engine/tests/delve-rune-costs.test.ts
git commit -m "feat(engine): export baseCost, basicIncome and manaSupport" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: Verification: both suites green, every number unchanged

No edits; nothing to commit.

- [ ] **Step 1: Both suites and both typechecks**

```bash
cd /c/Projects/alloy-costs-contract
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

Expected: the engine's typecheck prints nothing and 1618 tests pass in 83 files, `tests/delve-pacing.test.ts`'s rails among them; the client's typecheck prints nothing and 860 tests pass in 98 files.

- [ ] **Step 2: The determinism check against the baseline**

```bash
cd /c/Projects/alloy-costs-contract
(cd packages/engine && npx tsup --out-dir node_modules/.costs-measure)
S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
M=C:/Projects/alloy-costs-contract/packages/engine/node_modules/.costs-measure/index.js
B=$S/rune-costs-before
mkdir -p $S/rune-costs-step1 && cd $S/rune-costs-step1
node $B/snapshot.mjs $M after-depth10.json
node $B/identical.mjs $B/before-depth10.json after-depth10.json
node $B/pacing.mjs $M > pacing-after.txt && diff $B/pacing-before.txt pacing-after.txt && echo pacing identical
node $B/first-dives.mjs $M > first-dives-after.txt && diff $B/first-dives-before.txt first-dives-after.txt && echo first dives identical
node $B/items-hash.mjs $M > items-hash-after.txt && diff $B/items-hash-before.txt items-hash-after.txt && echo items identical
cd /c/Projects/alloy-costs-contract && rm -rf packages/engine/node_modules/.costs-measure
```

Expected:

```text
runs 9544 ms …
rows 9544 before, 9544 after; differing 0
pacing identical
first dives identical
items identical
```

Power is held exactly and the DPS to nine places by the golden test in Step 1 ("leaves estimateCombat as it was"). Any difference is a regression in this step (a factor that isn't exactly 1 while `bySlot` is 0, or a sum added in a new order): debug it, don't move on.

- [ ] **Step 3: Nothing stray**

Run: `git -C /c/Projects/alloy-costs-contract status --short` and `git -C /c/Projects/alloy-costs-contract log --oneline 6e667e2..`
Expected: a clean tree; six commits (Tasks 2–7).

## What A and B build on

Every hook below exists after step 1 and does exactly this while `bySlot` is 0 (every load 0). A and B never re-declare them.

| Hook | File | Signature / shape | Step 1 behaviour | Who builds on it |
|---|---|---|---|---|
| `RuneDef.load` | `src/types/rune.ts`, `data/runes.json` | `load: number[]` (five, ≥ 0, never falling; `RuneDefSchema`) | the spec's table, pinned in `delve-rune-costs.test.ts` | A tunes rows; B reads the pouch's raw price from it |
| `DelveBalance['runes']['load']` | `src/types/delve.ts`, `data/balance.json`, `data/schemas.ts` | `{ bySlot: Record<AbilitySlot, number>; byForm: Partial<Record<FormId, number>>; charge; cast; easePerAttune; easeCap }` | `bySlot` all 0, `byForm` `{}`, `charge` 1, `cast` 1, `easePerAttune` 0.03, `easeCap` 0.6 (≤ 1) | A ships `bySlot` 1 and tunes; A's gate zeroes `bySlot` on a clone |
| `runeLoad` | `src/loot/runes.ts` | `(registry, ref: RuneRef, form: FormId) => number` | tier's load × `bySlot[form's slot]` × (`byForm[form]` ?? 1): 0 | B's `runeText` (`cost` with a form) |
| `loadEase` | `src/loot/runes.ts` | `(registry, stats: HeroStats, elements: readonly ManaType[]) => number` | min(`easeCap`, `easePerAttune` × mean attunement): live | `resolveAbility`; B's Training Grounds' picker ease |
| `ResolvedAbility.load` | `src/types/ability.ts`, `arpg/abilities/resolve.ts` | `load: number`: Σ `runeLoad` over `runes` × (1 − ease) | 0 | B's `Readout` note (`loadText(…, ab.load, ab.payment)`); A's gate (mana per press) |
| `ResolvedAbility.ease` | same | `ease: number` | the move's ease, with or without runes | B's picker (`terms.ease`) and the easing line |
| The three prices | `arpg/abilities/resolve.ts` | `cost × (1 + load)` (after Manaweaver and `castManaMult`); `chargeNeed × (1 + load × charge)`; `channel × (1 + load × cast)` (so `castTime`) | unchanged (× 1) | every sim reader, the HUD, Power, the Lab, the autopilot |
| `baseCost` | `arpg/abilities/resolve.ts`, `src/index.ts` | `(ab: ResolvedAbility) => number` = `ab.cost / (1 + ab.load)` | `ab.cost` | `fire`'s `drainLeft`, `drainPerUse`; A's sim tests |
| `basicIncome` | `delve/hero-stats.ts`, `src/index.ts` | `(registry, stats: HeroStats) => number` | regen + (gain + blows' capped Drain) / strike interval, `estimateCombat`'s sum to the bit | `estimateCombat`'s `manaIncome`; `manaSupport` |
| `ManaSupport`, `manaSupport` | `delve/hero-stats.ts`, `src/index.ts` | `(registry, stats, chain: ResolvedChain) => { spend: number; refill: number }` | spend = mean `valuedMove` cost / unbounded `useInterval`; refill = `basicIncome` + `drainPerUse` / that interval | B's builder line ("Spends X/s · your build refills Y/s") |
| `drainPerUse`, `useInterval`, `valuedMove` | `delve/hero-stats.ts` | unchanged signatures (`drainPerUse` caps on `baseCost`) | as v0.51.0 | A's `valuedChain` and `pool` (optional, default Infinity; `manaSupport` passes none) |
| `withLoad` (test helper) | `tests/delve-rune-costs.test.ts` | `(load: Partial<DelveBalance['runes']['load']>) => DataRegistry` (`Object.create` over the default registry) | `loaded` (`bySlot` 1), `unloaded` (`bySlot` 0) | A's tests in the same file; A's gate and B's tests copy the pattern (B builds its own registry with `bySlot` 1) |
| `tests/fixtures/rune-costs-v051.json` | engine tests | 108 rows `[cost, chargeNeed, conjure, channel, castTime, cooldown]` | the golden | stays true after A (runed rows at `bySlot` 0, rune-less at 0 and 1) |
