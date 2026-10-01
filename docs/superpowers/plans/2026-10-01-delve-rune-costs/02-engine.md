# Delve Rune Costs, A: the Engine — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the rune costs on and prove them. Power values a chain as the sim plays it against the hero's pool (`valuedChain`), measured by a pacing run on its own; then `bySlot` goes to 1, so every rune's eased load raises its move's price, with every test that reads a price or Drain's cap restated; the DPS Lab gains a sustained mode (`DpsOptions.sustained: 'starved' | 'supported'`) and the page a Mana select; and a two-build gate (`tests/delve-rune-costs-gate.test.ts`, run with `RUNE_COST_GATE`) holds every Primary form's best set to at least 1.5× sustained on a supported hero and 2.0–3.0× the mana a press on a starved one. The ceilings are measured unloaded, the pacing rails at each stage, and the loads tuned only if something misses.

**Architecture:** One reader, `valuedChain(chain, pool?)` in `delve/hero-stats.ts`, gives Power the moves the pool pays (a hold at its highest affordable stage, a null where the pool runs short, then the cut); `damagePerUse`, `useInterval`, `drainPerUse`, `guards`, `runeLeech` and the Defensive's effect read it, and `estimateCombat` passes `manaPool(stats).max`. The loads are data (`balance.json → delve.runes.load.bySlot`), so turning them on is one line; the tests that change say why. The Lab builds its hero in one exported function, `labHero(registry, setup, options)` in `arpg/dps-sim.ts`, which the sim and the gate both read; `sustained` empties the pool and the charge meters after the world is made. The gate ranks each form's `runeComboSetups` on a copy of the data with `bySlot` zeroed and measures the winner loaded and unloaded.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom with Testing Library), Zod 3, React 19.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md` at `6e667e2`: "Power" ("Power and the pool"), "The DPS Lab", "Balance and gates", "Pacing", "Build → A" and "Testing" (the sim, Power and the Lab). The overview is `00-overview.md` in this folder; step 1's plan is `01-contract.md`.

---

## Base

- **Starts from:** step 1 as built: branch `costs/contract` at **`c402ef7`** ("feat(engine): export baseCost, basicIncome and manaSupport", worktree `C:\Projects\alloy-costs-contract`). Nothing else needs merging first. A runs beside B (`costs/client`, also from `c402ef7`) in its own worktree; nothing of B's is needed. It builds on step 1 exactly as `01-contract.md`'s "What A and B build on" gives it: `RuneDef.load` and the 14 rows; `delve.runes.load` with `bySlot` all 0; `runeLoad`, `loadEase`; `ResolvedAbility.load` and `ease` and the three loaded prices; `baseCost` and Drain's cap on it (`fire`, `drainPerUse`); `basicIncome`, `manaSupport`; and `tests/delve-rune-costs.test.ts`, which A owns from here.
- **Worktree** (skip it if the controller already made `C:\Projects\alloy-costs-engine`). PowerShell (from Git Bash, `cmd //c mklink /J` can fail with "Invalid switch"):

```powershell
git -C C:\Projects\Alloy worktree add ..\alloy-costs-engine -b costs/engine c402ef7
$W = 'C:\Projects\alloy-costs-engine'; $R = 'C:\Projects\Alloy'
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

  Expected: the last line lists `.bin tsup vitest zod`. The client's `@alloy\engine` points at this worktree's engine. Never delete through a junction: remove each with `cmd /c rmdir <path>`.
- **Before Task 1, measure both suites on the base:**

```bash
cd /c/Projects/alloy-costs-engine
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
(cd packages/engine && npx tsup) && (cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: the engine's typecheck prints nothing and **1618 tests pass in 83 files** (`6e667e2`'s 1596 in 82, plus step 1's `tests/delve-rune-costs.test.ts`); the client's typecheck prints nothing and **860 tests pass in 98 files**. (Both measured at `c402ef7`.) If the counts differ, the base isn't `c402ef7`: carry on, but read every count below as "base + the task's additions" (+5, +7, +4 engine tests, then the gate file's 5 skipped; +2 client tests).

## How this plan was checked

Every edit below was applied in order, with the controller's `apply.mjs` rules (`scratchpad/costs-val/apply.mjs`), to a copy of `c402ef7` (`git archive c402ef7`, the working tree's own line endings, node_modules linked by junctions), and each task's tests were run at both of their steps; the expected failures, passes and counts below are those runs (base: engine 1618 in 83 files, client 860 in 98). Every anchor matched exactly once, every commit block's `prettier --check --end-of-line auto` passed on the result, and both typechecks were clean after each task. The measurements (pacing at the three stages, first dives, rune use, the grid, the gate, the ceilings) are from builds of that tree; their outputs are kept in `scratchpad/costs-a2/meas/`.

The numbers this plan expects, all measured:

- **The pool rule alone** (Task 2) moves no pacing number: no autopilot build has a move over its pool before the loads.
- **The loads** (Task 4): every rail holds. First dives 3, 3, 3, 3; dive 6 and dive 12 means 25.75 and 35.5; Frost 3.5 → 34.5; legendaries 6.75; own pair 6 of 6; the sweep's median 25 (18–36, allowed 15.0–40.0); 30.12 s a floor.
- **The gate** (Task 7) passes at the spec's starting loads with nothing tuned, and reproduces the spec's predicted table to the last digit: supported 1.62–2.07× on the pack (Lance lowest), starved 1.01–1.34×, the mana per press 2.89× starved and 2.07× supported, every price biting.
- **The ceilings unloaded** (Task 8) are v0.51.0's exactly (`runes-gate/gate-final.json`, row for row).

So Task 9 (tuning) is expected to change nothing; it stays in the plan as the procedure if a run disagrees.

## Where the spec left room (decided here)

- **`valuedChain(chain, pool = Infinity)`** walks the moves in order. A move's stages are `chain.hold[i]` for a hold, else just the move; the valued one is the highest whose `cost` is at most `pool` (the sim's `canAfford` is `mana >= cost`). None affordable: a `null` is pushed and the walk stops, so the array ends at the first null. A charge chain's costs are 0, so the pool never cuts it.
- **The readers** take `pool` as a last optional parameter, default `Infinity`, so `manaSupport` (step 1) and `delve-chain-feel.test.ts`'s calls are untouched. In `useInterval` a null is `bal.abilities.comboWindow` seconds; the hold test moves from the chain's `move.kind` to the valued move's `ab.kind` (the same for every move). A hold valued below full charge keeps its full-charge wind-up (`holdFull`): the held button charges to full, and `releaseHold` falls back to the stage the pool pays then.
- **The Defensive** takes its effect from `valuedChain(defensive, pool.max)[0]`; a null gives no uptime and no Ward, Armor, Earth, Surge or Blink. Its DPS share still runs `damagePerUse`, which is 0 over `[null]`.
- **The pool** is `manaPool(stats, registry).max`, which `estimateCombat` already holds as `pool` (the sim's `manaMax` is the same number).
- **Registries with other loads** in tests are built by `registryWith(change)`: a fresh `loadAndValidateData()` whose Delve balance `change` edits, made into a `DataRegistry` (the spec's "a registry cloned from the default data"). Each test file that needs one has its own copy of the six-line helper, as `delve-rune-costs.test.ts` has `withLoad`.
- **The restated tests** (Task 3), each because the loads move what it measured, not what it means:
  - `delve-rune-sim.test.ts`: Widen's and Drain's Nova tests give the hero a pool of 200 (a runed medium Nova costs more than the fixture's 66); Drain's ability tests read the refund net of each cast's own price (`mana + cost`), and the balance pass's cap reads `baseCost` (the spec's "the Drain tests switch to baseCost"); the Quick and Heavy test checks a cast channel's conjure at 1.2× and its channel at 1.2 × (1 + load × `cast`).
  - `delve-dps-sim.test.ts`: the seeds test uses the Barrage's baseline (a runed mana Ultimate can't be cast from the depth-10 pool of 63); Echo on a Bolt beats its baseline by 1.2× with the loads zeroed, and its price takes some back.
  - `delve-rune-power.test.ts`: "Drain never costs DPS" becomes "Drain adds DPS on some setup" (the spec's decision), and Guard and Leech add life where their move is cast (a runed mana Ultimate over the pool isn't, and adds none); the socket-opening test runs on the unloaded registry, keeping its numbers, and a new test covers the price.
  - `delve-rune-costs.test.ts`: the shipped `bySlot` is 1.
- **The supported hero's second element** is the setup's secondary, else Frost, else (on a Frost hero) Fire. The spec names Frost for a Fire-only set, the gate's only case; the rule gives every Lab row a supported hero. Drain III goes into every blow beside the blow's own runes, so a weapon's rune row keeps the rune it measures.
- **`labHero`** is exported from `arpg/dps-sim.ts` (not the index): the gate's mana per press resolves the hero the sim fights with, from the one place that builds it.
- **The Mana select** reads "Full", "Starved", "Supported" (values `full`, `starved`, `supported`); `full` is no `sustained`. The worker's request carries `sustained` (undefined at full mana, which the page tests' `toEqual` reads as absent).
- **The gate** ranks with `+r.dps` unrounded (the runes gate rounded to cents; the winners and the printed ratios are the same) and prints the two runners-up beside each winner. It runs in about 30 s.
- **The ceilings** are measured by a scratchpad script, `ceilings.mjs`: the runes gate's `rune-gate.mjs` with the grid built in place and a `loaded|unloaded` switch.
- **No version bump:** Finish ships v0.52.0.

## Files

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/delve/hero-stats.ts` | `valuedChain`; `pool` on `damagePerUse`, `useInterval`, `drainPerUse`, `guards`, `runeLeech`; `estimateCombat` passes the pool, and the Defensive's effect reads `valuedChain` |
| `src/data/balance.json` | `delve.runes.load.bySlot` to 1 (hand-edit, never format); tuning only if Task 9 needs it |
| `src/arpg/dps-sim.ts` | `DpsOptions.sustained`; `SUPPORTED`; `labHero`; `runDps` builds from it and empties the pool and the meters |
| `tests/delve-rune-power.test.ts` | Power and the pool; the runed Primary's golden; the over-pool Ultimate; the autopilot under a ×10 Primary load; Drain and Guard/Leech restated |
| `tests/delve-rune-sim.test.ts` | the price in the sim (`noMana`, the held button, the hold's fallback); Widen, Quick/Heavy and Drain restated |
| `tests/delve-dps-sim.test.ts` | the sustained mode; the rune view's restated tests; rune-less rows the same unloaded |
| `tests/delve-rune-costs.test.ts` | the shipped `bySlot` is 1 |
| `tests/delve-rune-costs-gate.test.ts` (new) | the two-build gate, skipped unless `RUNE_COST_GATE` |

**Client (`packages/client/src/`)**

| File | Change |
|---|---|
| `features/delve/lab/lab-model.ts` | `remember` / `recall` keyed `depth|pack|sustained|dpsKey` |
| `pages/DelveLab.tsx` | the Mana select (`lab-mana`); the request and the session key carry `sustained` |
| `features/delve/lab/__tests__/lab-model.test.ts` | the new argument; one key kept apart per mana option |
| `pages/__tests__/DelveLab.test.tsx` | the Mana select runs and keeps each run |

**Outside the repo:** the scratchpad's `rune-costs-a/` (the measurements and `ceilings.mjs`).

## Cross-area needs

None in another area's files. For the controller:

- **Step 1's lines this plan anchors on** (checked at `c402ef7`): in `hero-stats.ts`, `function drainPerUse(chain: ResolvedChain, bal: DelveBalance): number {` and the two lines after it; in `balance.json`, the `"load": { "bySlot": { "primary": 0, "defensive": 0, "ultimate": 0 }, …` line; in `tests/delve-rune-costs.test.ts`, the test "ships delve.runes.load with every slot at 0, so every load is 0" and its `bySlot` line.
- **B:** none. `tests/delve-runes-contract.test.ts` needs no edit (step 1 pins its `load` as `expect.any(Object)`). B's tests build their own priced registry, so `bySlot` at 1 changes none of them. After the merge, B's client tests run on A's bundle; this plan ran the whole client suite on it (862 tests, B's absent) to check that no existing client test reads a runed price.
- **Finish** reads from A, as `04-finish.md` asks: the Lab's `<select data-testid="lab-mana">` with `full` (first, chosen on load), `starved` and `supported`; a change starts a fresh run (`lab-progress` shows); worker errors still log "DPS Lab worker …". And the report: the gate rows (Task 7's output), the ceilings unloaded and loaded (Task 8), the pacing at the three stages (`rune-costs-before/pacing-before.txt`, Task 2's and Task 4's), and the tuning (none expected).

## Line endings and Prettier (check again in the worktree)

In a fresh checkout of `c402ef7` every file this plan edits is **CRLF** in the working tree except `balance.json` (LF, hand-laid-out, never formatted), since `core.autocrlf` is on. (`tests/delve-rune-costs.test.ts` is LF in step 1's own worktree, where it was written; a fresh worktree makes it CRLF. Either is fine.) Keep each file's endings: the Edit tool does, and `apply.mjs` does. Every other file edited here passes `npx prettier --check --end-of-line auto` at `c402ef7` (a plain `--check` flags every CRLF file), and the code below is already formatted, so the commit blocks' `prettier --write --end-of-line auto` changes nothing if typed as written. A new file is written LF. Never touch `packages/engine/tests/delve-chain-feel.test.ts` (line 160 holds a raw `0xD7` byte).

## Commands

Run from the worktree's root (`C:\Projects\alloy-costs-engine`; in Bash `/c/Projects/alloy-costs-engine`), each in a subshell:

| What | Command |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests (about 17 s, the pacing rails included) | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| The gate (about 30 s) | `(cd packages/engine && RUNE_COST_GATE=1 npx vitest run tests/delve-rune-costs-gate.test.ts)` |
| The measuring build | `(cd packages/engine && npx tsup --format esm --no-dts --no-sourcemap --out-dir node_modules/.costs-measure)` |
| Engine build (the client's bundle) | `(cd packages/engine && npx tsup)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client tests (about 20 s) | `(cd packages/client && npx vitest run)`, or some files: `(cd packages/client && npx vitest run <paths>)` |

`$S` below is the scratchpad: `S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad`. Node takes `C:/` paths: `M=C:/Projects/alloy-costs-engine/packages/engine/node_modules/.costs-measure/index.js`. The baseline (`$S/rune-costs-before/`, v0.51.0 at `6e667e2`) is step 1's Task 1.

**The measuring routine** (Tasks 2, 4 and 8 run it with their own `<stage>`): build the measuring copy, run the rails, the first dives and the rune use, then remove the copy.

```bash
cd /c/Projects/alloy-costs-engine
(cd packages/engine && npx tsup --format esm --no-dts --no-sourcemap --out-dir node_modules/.costs-measure)
S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
M=C:/Projects/alloy-costs-engine/packages/engine/node_modules/.costs-measure/index.js
mkdir -p $S/rune-costs-a && cd $S/rune-costs-a
node $S/rune-costs-before/pacing.mjs $M > pacing-<stage>.txt
node $S/rune-costs-before/first-dives.mjs $M > first-dives-<stage>.txt
node $S/runes-gate/rune-use.mjs $M > rune-use-<stage>.txt
cat pacing-<stage>.txt first-dives-<stage>.txt rune-use-<stage>.txt
cd /c/Projects/alloy-costs-engine && rm -rf packages/engine/node_modules/.costs-measure
```

(About 15 s. `packages/engine/node_modules` is a real folder of junctions, so `.costs-measure` is the worktree's own; never `rm -rf` a junction.)

---
## Chunk 1: Power and the pool

### Task 1: `valuedChain`, and every Power reader on it

Power stops valuing moves the sim never casts. The spec: "Power values a chain as the sim plays it against the hero's pool". With `bySlot` still 0, only a rune-less move already over its pool (a heavy mana Ultimate at a starting pool) changes.

**Files:**
- Modify: `packages/engine/src/delve/hero-stats.ts`, `packages/engine/tests/delve-rune-power.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-power.test.ts`:

Replace:

```ts
import { resolveAbility } from '../src/arpg/abilities/resolve.js';
```

with:

```ts
import { resolveAbility, resolveChain } from '../src/arpg/abilities/resolve.js';
```

Replace:

```ts
import { sandboxWeapon } from '../src/arpg/sandbox.js';
import { betweenDives, takeBestStop } from '../src/delve/autopilot.js';
import { startDive } from '../src/delve/dive.js';
import { compareItem, computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
```

with:

```ts
import { sandboxWeapon } from '../src/arpg/sandbox.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { betweenDives, takeBestStop } from '../src/delve/autopilot.js';
import { startDive } from '../src/delve/dive.js';
import {
  compareItem,
  computeHeroStats,
  damagePerUse,
  estimateCombat,
  manaPool,
  useInterval,
  valuedChain,
  valuedMove,
} from '../src/delve/hero-stats.js';
```

Replace:

```ts
import { ABILITY_SLOTS, type Chains, type ChainSkill } from '../src/types/ability.js';
import type { DelveProfile, DiveStop } from '../src/types/delve.js';
```

with:

```ts
import {
  ABILITY_SLOTS,
  type AbilitySlot,
  type Chain,
  type Chains,
  type ChainSkill,
  type Move,
  type MoveKind,
} from '../src/types/ability.js';
import type { DelveBalance, DelveProfile, DiveStop } from '../src/types/delve.js';
```

Replace:

```ts
import { arena, chainsOf, dummy, gear, registry, withChains } from './fixtures/arena.js';
```

with:

```ts
import { arena, bal, chainsOf, dummy, gear, registry, withChains } from './fixtures/arena.js';
```

Replace:

```ts
const DEPTH = 10;
const III = (id: string): RuneRef => ({ id, tier: 3 });
```

with:

```ts
const DEPTH = 10;
const III = (id: string): RuneRef => ({ id, tier: 3 });

/** The default data with its Delve balance changed by `change`. */
function registryWith(change: (bal: DelveBalance) => void): DataRegistry {
  const d = loadAndValidateData();
  change(d.balance.delve!);
  return new DataRegistry(
    d.affixes,
    d.combinations,
    d.synergies,
    d.baseItems,
    d.balance,
    d.recipes,
    d.delve,
    d.arpg,
  );
}
```

Append at the end of the file:

```ts
describe('Power and the pool (valuedChain; see the rune costs spec)', () => {
  /** A starting Fire hero: attunement 2, so a pool of 66. */
  const starter = createDelveProfile(registry, 3, { primary: 'fire' });
  const stats = profileStats(registry, starter);
  const pool = manaPool(stats, registry).max;
  const chain = (slot: AbilitySlot, moves: Move[], payment: Chain['payment'] = 'mana') =>
    resolveChain(registry, stats, slot, { moves, payment });
  const bolt = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
  const nova = (kind: MoveKind): Move => ({ kind, form: 'nova', elements: ['fire'] });

  it('with no pool, is valuedMove for every move (a hold at full charge)', () => {
    const c = chain('primary', [bolt('light'), bolt('hold'), bolt('heavy')]);
    expect(valuedChain(c)).toEqual(c.moves.map((_, i) => valuedMove(c, i)));
  });

  it("cuts after the first move the pool can't pay: it deals nothing and waits out the restart window", () => {
    // A light Bolt costs 5.6 and a heavy one 10.4: a pool of 8 pays the first only.
    const c = chain('primary', [bolt('light'), bolt('heavy'), bolt('light')]);
    expect(valuedChain(c, 8)).toEqual([c.moves[0], null]);
    const first = chain('primary', [bolt('light')]);
    expect(useInterval(bal, c, stats.tempo, 1e9, 1, 8)).toBeCloseTo(
      (useInterval(bal, first, stats.tempo, 1e9, 1) + bal.abilities.comboWindow) / 2,
    );
    expect(damagePerUse(c, 10, stats, bal, 8)).toBeCloseTo(damagePerUse(first, 10, stats, bal) / 2);
    // A chain whose first move the pool can't pay deals nothing.
    expect(valuedChain(c, 5)).toEqual([null]);
    expect(damagePerUse(c, 10, stats, bal, 5)).toBe(0);
  });

  it('values a hold at the highest stage the pool affords, and as nothing when its stage 0 is past it', () => {
    // A mana hold Nova's stages cost 60, 78 and 96.
    const c = chain('ultimate', [nova('hold')]);
    const [s0, s1, s2] = c.hold[0]!;
    expect(valuedChain(c, pool)).toEqual([s0]);
    expect(valuedChain(c, 80)).toEqual([s1]);
    expect(valuedChain(c)).toEqual([s2]);
    expect(valuedChain(c, 59)).toEqual([null]);
  });

  it("values a mana Ultimate the pool can't hold as none: a heavy Nova (78) at a pool of 66", () => {
    const { ultimate: _, ...rest } = chainsOf(starter);
    const heavy: Chain = { moves: [nova('heavy')], payment: 'mana' };
    expect(chain('ultimate', heavy.moves).moves[0].cost).toBeGreaterThan(pool);
    expect(estimateCombat(stats, registry, DEPTH, { ...rest, ultimate: heavy })).toEqual(
      estimateCombat(stats, registry, DEPTH, rest),
    );
  });

  it("gives no Defensive effect when the pool can't pay its first move", () => {
    // A pool of 20 + 3 × 2 = 26 against a medium mana Ward's 25 and a heavy one's 32.5.
    const small = registryWith((b) => {
      b.mana.basePool = 20;
    });
    const s = profileStats(small, starter);
    const ward = (kind: MoveKind): Chain => ({
      moves: [{ kind, form: 'ward', elements: ['fire'] }],
      payment: 'mana',
    });
    const { defensive: _, ...rest } = chainsOf(starter);
    const without = estimateCombat(s, small, DEPTH, rest);
    expect(
      estimateCombat(s, small, DEPTH, { ...rest, defensive: ward('medium') }).ehp,
    ).toBeGreaterThan(without.ehp);
    expect(estimateCombat(s, small, DEPTH, { ...rest, defensive: ward('heavy') })).toEqual(without);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-power.test.ts)`
Expected: FAIL, 5 failed and 12 passed (17). The three `valuedChain` tests fail with `TypeError: (0 , valuedChain) is not a function`; the Ultimate's with `AssertionError: expected { dps: 41.503911083563274, …(2) } to deeply equal { dps: 36.424338129677416, …(2) }` (Power still counts the Nova it never casts); the Defensive's with an `AssertionError` of the same shape (it still counts the heavy Ward's effect).

- [ ] **Step 3: Write `valuedChain` and move the readers onto it**

In `packages/engine/src/delve/hero-stats.ts`:

Replace:

```ts
function drainPerUse(chain: ResolvedChain, bal: DelveBalance): number {
  return mean(
    chain.moves.map((_, i) => {
      const ab = valuedMove(chain, i);
```

with:

```ts
function drainPerUse(chain: ResolvedChain, bal: DelveBalance, pool = Infinity): number {
  return mean(
    // A move the pool can't pay drains nothing (`valuedChain`).
    valuedChain(chain, pool).map((ab) => {
      if (!ab) return 0;
```

Replace:

```ts
/** Each move's Guard: the share of life it shields on landing. */
function guards(chain: ResolvedChain): number[] {
  return chain.moves.map((_, i) => valuedMove(chain, i).knobs.guardOnLand);
}
```

with:

```ts
/** Each move's Guard: the share of life it shields on landing (none from a move the pool can't pay). */
function guards(chain: ResolvedChain, pool = Infinity): number[] {
  return valuedChain(chain, pool).map((ab) => ab?.knobs.guardOnLand ?? 0);
}
```

Replace:

```ts
/** A chain's lifesteal from its runes alone, averaged over its moves (a rune's lifesteal adds). */
function runeLeech(registry: DataRegistry, chain: ResolvedChain | null): number {
  if (!chain) return 0;
  return mean(
    chain.moves.map((_, i) =>
      valuedMove(chain, i).runes.reduce(
        (sum, r) => sum + (registry.getRune(r.id).tiers[r.tier - 1].lifesteal ?? 0),
        0,
      ),
    ),
  );
}

/** The move Power values at step `i` of a chain: a hold move at its full charge (stage 2). */
export function valuedMove(chain: ResolvedChain, i: number): ResolvedAbility {
  return chain.moves[i].kind === 'hold' ? chainMove(chain, i, 2) : chain.moves[i];
}

/**
 * Damage of one use of a chain, averaged over its moves (each with its step
 * bonus, a hold at full charge), counting jumps, lingering ground and repeats,
 * and its runes through their knobs (`reach`, `shots`, `boost`).
 */
export function damagePerUse(
  chain: ResolvedChain,
  hit: number,
  stats: HeroStats,
  bal: DelveBalance,
): number {
  return mean(
    chain.moves.map((_, i) => {
      const ab = valuedMove(chain, i);
      const k = ab.knobs;
```

with:

```ts
/**
 * A chain's lifesteal from its runes alone, averaged over its moves (a rune's
 * lifesteal adds; a move the pool can't pay adds none).
 */
function runeLeech(registry: DataRegistry, chain: ResolvedChain | null, pool = Infinity): number {
  if (!chain) return 0;
  return mean(
    valuedChain(chain, pool).map(
      (ab) =>
        ab?.runes.reduce(
          (sum, r) => sum + (registry.getRune(r.id).tiers[r.tier - 1].lifesteal ?? 0),
          0,
        ) ?? 0,
    ),
  );
}

/** The move Power values at step `i` of a chain: a hold move at its full charge (stage 2). */
export function valuedMove(chain: ResolvedChain, i: number): ResolvedAbility {
  return chain.moves[i].kind === 'hold' ? chainMove(chain, i, 2) : chain.moves[i];
}

/**
 * The moves Power values, in order: each at its valued stage (a hold at the highest stage
 * the pool affords, up to full charge), cut after the first move the pool can't pay,
 * which is null. With `pool` Infinity it is today's `valuedMove` for every move.
 */
export function valuedChain(chain: ResolvedChain, pool = Infinity): (ResolvedAbility | null)[] {
  const out: (ResolvedAbility | null)[] = [];
  for (const [i, move] of chain.moves.entries()) {
    // A hold lets go at the highest stage the pool pays (`releaseHold`); one whose stage 0 it
    // can't pay never starts (`startHold`), as a move over the pool is never cast.
    const stages = chain.hold[i] ?? [move];
    let s = stages.length - 1;
    while (s >= 0 && stages[s].cost > pool) s--;
    out.push(s >= 0 ? stages[s] : null);
    if (s < 0) break;
  }
  return out;
}

/**
 * Damage of one use of a chain, averaged over its moves as the pool plays them
 * (`valuedChain`: each with its step bonus, a hold at the highest stage the
 * pool affords; a move the pool can't pay deals nothing), counting jumps,
 * lingering ground and repeats, and its runes through their knobs (`reach`,
 * `shots`, `boost`).
 */
export function damagePerUse(
  chain: ResolvedChain,
  hit: number,
  stats: HeroStats,
  bal: DelveBalance,
  pool = Infinity,
): number {
  return mean(
    valuedChain(chain, pool).map((ab) => {
      if (!ab) return 0;
      const k = ab.knobs;
```

Replace:

```ts
 * charge: its wind-up is the longer of its charge (`holdTime` × the tempo) and
 * its stage-2 wind-up, and its cooldown counts from its landing.
 */
export function useInterval(
  bal: DelveBalance,
  chain: ResolvedChain,
  tempo: number,
  manaIncome: number,
  chargeRate: number,
): number {
  return mean(
    chain.moves.map((move, i) => {
      const ab = valuedMove(chain, i);
      const hold = move.kind === 'hold';
```

with:

```ts
 * charge: its wind-up is the longer of its charge (`holdTime` × the tempo) and
 * its stage's wind-up, and its cooldown counts from its landing. The moves are
 * the pool's (`valuedChain`): a move it can't pay waits out the restart window
 * (`comboWindow`), and the chain starts over.
 */
export function useInterval(
  bal: DelveBalance,
  chain: ResolvedChain,
  tempo: number,
  manaIncome: number,
  chargeRate: number,
  pool = Infinity,
): number {
  return mean(
    valuedChain(chain, pool).map((ab) => {
      if (!ab) return bal.abilities.comboWindow;
      const hold = ab.kind === 'hold';
```

Replace:

```ts
  const every = (chain: ResolvedChain, income: number, rate: number) =>
    useInterval(bal, chain, stats.tempo, income, rate);
```

with:

```ts
  // Each chain as the sim plays it against the pool (`valuedChain`).
  const every = (chain: ResolvedChain, income: number, rate: number) =>
    useInterval(bal, chain, stats.tempo, income, rate, pool.max);
```

Replace:

```ts
    const perUse = chain ? drainPerUse(chain, bal) : 0;
```

with:

```ts
    const perUse = chain ? drainPerUse(chain, bal, pool.max) : 0;
```

Replace:

```ts
  const primaryDps = primary ? damagePerUse(primary, hit, stats, bal) / primaryEvery : 0;
```

with:

```ts
  const primaryDps = primary ? damagePerUse(primary, hit, stats, bal, pool.max) / primaryEvery : 0;
```

Replace:

```ts
    ? (damagePerUse(ultimate, hit, stats, bal) / ultimateEvery) * 0.8
```

with:

```ts
    ? (damagePerUse(ultimate, hit, stats, bal, pool.max) / ultimateEvery) * 0.8
```

Replace:

```ts
  if (defensive) {
    // The Defensive's effect: its first move's (a hold's at full charge).
    const guard = valuedMove(defensive, 0);
    const guardFor = guard.form.id === 'blink' ? bal.abilities.defend.blinkSeconds : guard.duration;
    const uptime = Math.min(1, guardFor / Math.max(guardFor, guardEvery));
    if (guard.form.id === 'armor') mitigation *= 1 - Math.min(0.75, guard.effect) * uptime;
    if (guard.elements.includes('earth'))
      mitigation *= 1 - bal.abilities.defend.earthReduction * uptime;
    if (guard.form.id === 'ward') bonusLife += stats.maxHp * guard.effect * uptime * 2;
    if (guard.form.id === 'surge') dps *= 1 + guard.effect * uptime;
    if (guard.form.id === 'blink') mitigation *= 1 - 0.3 * uptime;
    defensiveDps = (damagePerUse(defensive, hit, stats, bal) / Math.max(1, guardEvery)) * 0.5;
```

with:

```ts
  if (defensive) {
    // The Defensive's effect: its first move's (a hold's at the highest stage the pool affords).
    // A first move the pool can't pay is never cast: no effect at all.
    const guard = valuedChain(defensive, pool.max)[0];
    if (guard) {
      const guardFor =
        guard.form.id === 'blink' ? bal.abilities.defend.blinkSeconds : guard.duration;
      const uptime = Math.min(1, guardFor / Math.max(guardFor, guardEvery));
      if (guard.form.id === 'armor') mitigation *= 1 - Math.min(0.75, guard.effect) * uptime;
      if (guard.elements.includes('earth'))
        mitigation *= 1 - bal.abilities.defend.earthReduction * uptime;
      if (guard.form.id === 'ward') bonusLife += stats.maxHp * guard.effect * uptime * 2;
      if (guard.form.id === 'surge') dps *= 1 + guard.effect * uptime;
      if (guard.form.id === 'blink') mitigation *= 1 - 0.3 * uptime;
    }
    defensiveDps =
      (damagePerUse(defensive, hit, stats, bal, pool.max) / Math.max(1, guardEvery)) * 0.5;
```

Replace:

```ts
    primary ? guardShare(guards(primary), primaryEvery, bal) : 0,
    ultimate ? guardShare(guards(ultimate), ultimateEvery, bal) : 0,
    defensive ? guardShare(guards(defensive), guardEvery, bal) : 0,
```

with:

```ts
    primary ? guardShare(guards(primary, pool.max), primaryEvery, bal) : 0,
    ultimate ? guardShare(guards(ultimate, pool.max), ultimateEvery, bal) : 0,
    defensive ? guardShare(guards(defensive, pool.max), guardEvery, bal) : 0,
```

Replace:

```ts
    primaryDps * 0.75 * runeLeech(registry, primary) +
    ultimateDps * runeLeech(registry, ultimate) +
    defensiveDps * runeLeech(registry, defensive);
```

with:

```ts
    primaryDps * 0.75 * runeLeech(registry, primary, pool.max) +
    ultimateDps * runeLeech(registry, ultimate, pool.max) +
    defensiveDps * runeLeech(registry, defensive, pool.max);
```

(`manaSupport`, from step 1, keeps calling `useInterval` and `drainPerUse` without a pool: its spend ignores the pool's cap, by the spec. `delve-chain-feel.test.ts`'s calls, five arguments, are unchanged too.)

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-power.test.ts)`
Expected: PASS, 17 tests (the marked `it.fails` direction test among them, still failing inside as before).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: the typecheck prints nothing; **1623 tests pass in 83 files**, the pacing rails among them.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-costs-engine
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/hero-stats.ts tests/delve-rune-power.test.ts)
git add packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-rune-power.test.ts
git commit -m "feat(engine): Power values a chain as the pool plays it (valuedChain): a move it can't pay deals nothing and cuts the chain" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: The pacing run between the pool rule and the loads

The spec: "It is run again after Power's pool rule and before the loads, so each change's effect shows apart." No edit and no commit.

- [ ] **Step 1: Measure**

Run the measuring routine (see "Commands") with `<stage>` = `pool`.

Expected: `pacing-pool.txt` and `first-dives-pool.txt` are byte-identical to `$S/rune-costs-before/pacing-before.txt` and `first-dives-before.txt`; check with `diff $S/rune-costs-before/pacing-before.txt $S/rune-costs-a/pacing-pool.txt && diff $S/rune-costs-before/first-dives-before.txt $S/rune-costs-a/first-dives-pool.txt && echo identical`, which prints `identical`. The pool rule moves Power only for a move over its pool, and with `bySlot` at 0 the autopilot builds none. For the record, the rails read:

```text
first dive: 3, 3, 3, 3 (each ≥ 3), mean 3 (3–12)
dive 6 mean 24.25, dive 12 mean 36 (> dive 1 + 5, > dive 6)
frost: dive 1 3.5, dive 12 35.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 5.75 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 24, 21–31 (allowed 14.4–38.4): fire+frost 21, earth+frost 30, storm+fire 24, frost+storm 31, fire+shadow 22, fire+nature 26, shadow+nature 21, fire+earth 30, storm+earth 24, earth+shadow 29, earth+nature 22, frost+shadow 21, frost+nature 29, storm+shadow 29, storm+nature 22
seconds per floor: 29.80 (8–60)
```

If anything differs, stop and report both files: a rule meant to touch only over-pool moves moved a number.

---
## Chunk 2: The loads

### Task 3: `bySlot` to 1: every rune's eased load raises its move's price

The one data change: `delve.runes.load.bySlot` goes from 0 to 1 for every slot, so each rune's tier load, eased by the move's attunement, raises its price. The new tests show the sim's readers following it unchanged (the spec's "The sim readers that follow"), and Power netting it. The restated tests keep what they meant (see "Where the spec left room").

**Files:**
- Modify: `packages/engine/src/data/balance.json` (hand-edit, never format), `packages/engine/tests/delve-rune-costs.test.ts`, `packages/engine/tests/delve-rune-sim.test.ts`, `packages/engine/tests/delve-dps-sim.test.ts`, `packages/engine/tests/delve-rune-power.test.ts`

- [ ] **Step 1: Write the failing tests, and restate the ones the loads move**

In `packages/engine/tests/delve-rune-costs.test.ts`:

Replace:

```ts
  it('ships delve.runes.load with every slot at 0, so every load is 0', () => {
    expect(registry.getDelveBalance().runes.load).toEqual({
      bySlot: { primary: 0, defensive: 0, ultimate: 0 },
```

with:

```ts
  it('ships delve.runes.load with every slot at 1', () => {
    expect(registry.getDelveBalance().runes.load).toEqual({
      bySlot: { primary: 1, defensive: 1, ultimate: 1 },
```

Replace:

```ts
      const e = estimateCombat(hero, registry, 10, chains);
```

with:

```ts
      // The chains are runed: v0.51.0's numbers are theirs with the loads zeroed.
      const e = estimateCombat(hero, unloaded, 10, chains);
```

In `packages/engine/tests/delve-rune-sim.test.ts`:

Replace:

```ts
import {
  NEUTRAL,
  blowNumbers,
  defaultBasic,
  followBasic,
  mergeKnobs,
} from '../src/arpg/abilities/resolve.js';
```

with:

```ts
import {
  NEUTRAL,
  baseCost,
  blowNumbers,
  defaultBasic,
  followBasic,
  mergeKnobs,
} from '../src/arpg/abilities/resolve.js';
import { nextMove } from '../src/arpg/abilities/cast.js';
```

Replace:

```ts
import type { Blow } from '../src/types/ability.js';
```

with:

```ts
import type { Blow, ResolvedAbility } from '../src/types/ability.js';
```

Replace:

```ts
      const w = world([dummy(13, 28)], { ultimate: { payment: 'mana', runes } });
      press(w, 2);
      return { w, ab: moveOf(w, 2) };
```

with:

```ts
      const w = world([dummy(13, 28)], { ultimate: { payment: 'mana', runes } });
      // A pool that pays the loaded Nova (see the rune costs spec).
      w.hero.manaMax = w.hero.mana = 200;
      press(w, 2);
      return { w, ab: moveOf(w, 2) };
```

Replace:

```ts
    // A cast payment's channel and a charge payment's lockout scale too.
    const castPaid = (runes: RuneRef[]) =>
      moveOf(world([], { primary: { payment: 'cast', runes } }), 0);
    expect(castPaid([R('heavy')]).castTime / castPaid([]).castTime).toBeCloseTo(1.2);
```

with:

```ts
    // A cast payment's channel and a charge payment's lockout scale too (the channel by the
    // rune's load as well: see the rune costs spec).
    const castPaid = (runes: RuneRef[]) =>
      moveOf(world([], { primary: { payment: 'cast', runes } }), 0);
    const [heavyCast, plainCast] = [castPaid([R('heavy')]), castPaid([])];
    expect(heavyCast.conjure / plainCast.conjure).toBeCloseTo(1.2);
    expect(heavyCast.channel / plainCast.channel).toBeCloseTo(
      1.2 * (1 + heavyCast.load * bal.runes.load.cast),
    );
```

Replace:

```ts
    const nova = (runes: RuneRef[]) => {
      const w = world(pack, { ultimate: { payment: 'mana', runes } });
      const events = press(w, 2);
      return { mana: w.hero.mana, hits: skillHits(events, 2).length };
    };
```

with:

```ts
    const nova = (runes: RuneRef[]) => {
      const w = world(pack, { ultimate: { payment: 'mana', runes } });
      // A pool that pays the loaded Nova; each cast's own price is added back below.
      w.hero.manaMax = w.hero.mana = 200;
      const events = press(w, 2);
      return { mana: w.hero.mana + moveOf(w, 2).cost, hits: skillHits(events, 2).length };
    };
```

Replace:

```ts
      w.hero.drained[0] = bal.runes.drainFoes;
      press(w, 0);
      return w.hero.mana;
    };
    // Drain I: 1 a foe-hit, under the medium Lance's half of its cost (4).
```

with:

```ts
      w.hero.drained[0] = bal.runes.drainFoes;
      press(w, 0);
      return w.hero.mana + moveOf(w, 0).cost;
    };
    // Drain I: 1 a foe-hit, under the medium Lance's half of its cost before its load (4).
```

Replace:

```ts
      w.hero.mana = 20;
      const events = [...press(w, 0), ...run(w, 1)];
      return { mana: w.hero.mana, hits: skillHits(events).length };
```

with:

```ts
      w.hero.mana = 20;
      const events = [...press(w, 0), ...run(w, 1)];
      return { mana: w.hero.mana + moveOf(w, 0).cost, hits: skillHits(events).length };
```

Replace:

```ts
  it('an ability: at most half its own mana cost a cast, however many foes it hits', () => {
    const lance = (runes: RuneRef[]) => {
      const w = world(line(), { primary: { form: 'lance', runes } });
      press(w, 0);
      return { mana: w.hero.mana, cost: moveOf(w, 0).cost };
    };
    const plain = lance([]);
    // Three foes at Drain III would be 6; a medium Lance costs 8, so 4 comes back.
    expect(lance([R('drain')]).mana - plain.mana).toBeCloseTo(plain.cost * bal.runes.drainShare);
  });
```

with:

```ts
  it('an ability: at most half its own mana cost before its load a cast, however many foes it hits', () => {
    const lance = (runes: RuneRef[]) => {
      const w = world(line(), { primary: { form: 'lance', runes } });
      press(w, 0);
      const ab = moveOf(w, 0);
      return { mana: w.hero.mana + ab.cost, ab };
    };
    const plain = lance([]);
    const drain = lance([R('drain')]);
    // Three foes at Drain III would be 6; a medium Lance costs 8 before Drain's own load, so 4
    // comes back (the rune costs spec: `baseCost`).
    expect(drain.ab.cost).toBeGreaterThan(plain.ab.cost);
    expect(baseCost(drain.ab)).toBeCloseTo(plain.ab.cost);
    expect(drain.mana - plain.mana).toBeCloseTo(baseCost(drain.ab) * bal.runes.drainShare);
  });
```

Append at the end of the file:

```ts
describe('the price in the sim (see the rune costs spec)', () => {
  const still = { x: 0, y: 0 };
  /** The Primary, a medium Fire Bolt holding `runes`, its pool's regen stopped. */
  const priced = (runes: RuneRef[], o: ArenaOpts = {}) => {
    const w = world([dummy(13, 30)], { ...o, primary: { runes, ...o.primary } });
    w.hero.manaRegen = 0;
    return w;
  };

  it('refuses a move the pool covers only before its load (noMana), paying nothing', () => {
    const w = priced([R('echo')]);
    const ab = moveOf(w, 0);
    w.hero.mana = baseCost(ab) + 0.1;
    const events = press(w, 0);
    expect(events.some((e) => e.kind === 'noMana' && e.slot === 0)).toBe(true);
    expect(events.some((e) => e.kind === 'cast')).toBe(false);
    expect(w.hero.mana).toBeCloseTo(baseCost(ab) + 0.1);
    // With its loaded price in the pool, it casts.
    w.hero.mana = ab.cost;
    expect(press(w, 0).some((e) => e.kind === 'cast' && e.slot === 0)).toBe(true);
  });

  it("a held button whose loaded move the pool can't pay holds no swing back (pressDue)", () => {
    /** Swings that start before the Primary's beat ends, its button held, with `mana` in the pool. */
    const swings = (mana: (ab: ResolvedAbility) => number) => {
      const w = arena([dummy(13, 34.4)], { primary: { runes: [R('echo')] } });
      w.hero.nextAttackAt = 1e9;
      press(w, 0);
      w.hero.manaRegen = 0;
      w.hero.cooldowns[0].fill(0);
      w.hero.mana = mana(nextMove(w.hero, 0, w.t, bal.abilities.comboWindow)!);
      const ready = w.hero.beatUntil[0];
      const b = w.hero.stats.weapon.blows[0];
      const startup = w.hero.stats.attackInterval * b.time * b.startup;
      // Idle until a swing starting next tick would strike after the beat's end, then arm it.
      while (w.t + STEP + startup <= ready)
        stepWorld(registry, w, { move: still, holding: 0 }, STEP);
      w.hero.nextAttackAt = w.t;
      let n = 0;
      while (w.t + STEP < ready - 1e-9) {
        const before = w.hero.swing;
        stepWorld(registry, w, { move: still, holding: 0 }, STEP);
        if (w.hero.swing && w.hero.swing !== before) n++;
      }
      return n;
    };
    // Paid for, the held button holds the swing back for its press; short of the load, it doesn't.
    expect(swings((ab) => ab.cost)).toBe(0);
    expect(swings((ab) => baseCost(ab) + 0.1)).toBe(1);
  });

  it('a hold whose full charge the pool covers only before its load lets go at stage 1', () => {
    const w = priced([R('leech', 1)], { primary: { kind: 'hold' } });
    const [, stage1, stage2] = w.hero.chains[0]!.hold[0]!;
    const start = baseCost(stage2) + 0.1;
    w.hero.mana = start;
    expect(stage1.cost).toBeLessThan(start);
    expect(stage2.cost).toBeGreaterThan(start);
    holdFor(w, 0, bal.chains.holdTime * w.hero.stats.tempo + 0.1);
    expect(w.hero.mana).toBeCloseTo(start - stage1.cost);
  });
});
```

In `packages/engine/tests/delve-dps-sim.test.ts`:

Replace:

```ts
import { sandboxWeapon } from '../src/arpg/sandbox.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
```

with:

```ts
import { sandboxWeapon } from '../src/arpg/sandbox.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
```

Replace:

```ts
import type { ArpgEvent, ArpgInput, ArpgWorld } from '../src/types/arpg.js';
```

with:

```ts
import type { ArpgEvent, ArpgInput, ArpgWorld } from '../src/types/arpg.js';
import type { DelveBalance } from '../src/types/delve.js';
```

Replace:

```ts
type Hit = Extract<ArpgEvent, { kind: 'hit' }>;
```

with:

```ts
type Hit = Extract<ArpgEvent, { kind: 'hit' }>;

/** The default data with its Delve balance changed by `change`. */
function registryWith(change: (bal: DelveBalance) => void): DataRegistry {
  const d = loadAndValidateData();
  change(d.balance.delve!);
  return new DataRegistry(
    d.affixes,
    d.combinations,
    d.synergies,
    d.baseItems,
    d.balance,
    d.recipes,
    d.delve,
    d.arpg,
  );
}
/** The runes without their price: every load zeroed (see the rune costs spec). */
const unloaded = registryWith((b) => {
  b.runes.load.bySlot = { primary: 0, defensive: 0, ultimate: 0 };
});
```

Replace:

```ts
  it('averages RUNE_SEEDS combat seeds: a Barrage rains its impacts at random', () => {
    const s = setup('rune|multishot|barrage|fire|III');
```

with:

```ts
  it('averages RUNE_SEEDS combat seeds: a Barrage rains its impacts at random', () => {
    // The baseline: a runed mana Ultimate costs more than the depth-10 pool (the rune costs spec).
    const s = setup('rune|none|barrage|fire|none');
```

Replace:

```ts
  it('a rune changes what the held button deals: Echo III on a Bolt beats its baseline', () => {
    const dps = (key: string) => simulateDps(registry, setup(key), ONE).dps;
    expect(dps('rune|echo|bolt|fire|III')).toBeGreaterThan(dps('rune|none|bolt|fire|none') * 1.2);
  });
```

with:

```ts
  it('a rune changes what the held button deals: Echo III on a Bolt beats its baseline, and its price takes some back', () => {
    const ratio = (r: typeof registry) =>
      simulateDps(r, setup('rune|echo|bolt|fire|III'), ONE).dps /
      simulateDps(r, setup('rune|none|bolt|fire|none'), ONE).dps;
    expect(ratio(unloaded)).toBeGreaterThan(1.2);
    expect(ratio(registry)).toBeLessThan(ratio(unloaded));
  });

  it('a rune-less row is the same with the loads zeroed', () => {
    for (const key of [
      'ability|bolt|fire|none|default|mana',
      'ability|nova|frost|fire|hold|charge',
      'ability|lance|storm|none|heavy|cast',
      'rune|none|volley|fire|none',
    ])
      expect(simulateDps(registry, setup(key), PACK)).toEqual(
        simulateDps(unloaded, setup(key), PACK),
      );
  });
```

In `packages/engine/tests/delve-rune-power.test.ts`:

Replace:

```ts
    d.recipes,
    d.delve,
    d.arpg,
  );
}
```

with:

```ts
    d.recipes,
    d.delve,
    d.arpg,
  );
}
/** The runes without their price: every load zeroed (see the rune costs spec). */
const unloaded = registryWith((b) => {
  b.runes.load.bySlot = { primary: 0, defensive: 0, ultimate: 0 };
});
```

Replace:

```ts
  it('Guard and Leech add life; Drain never costs DPS, and adds it where mana binds', () => {
    const estimateOf = (s: DpsSetup) => estimateCombat(heroOf(s), registry, DEPTH, s.chains);
    let drained = 0;
    for (const s of socketed) {
      if (!SIGN_ONLY.includes(s.dims.rune)) continue;
      const [now, before] = [estimateOf(s), estimateOf(byKey.get(s.base!)!)];
      if (s.dims.rune !== 'drain') expect(now.ehp, dpsKey(s)).toBeGreaterThan(before.ehp);
      else {
        expect(now.dps, dpsKey(s)).toBeGreaterThanOrEqual(before.dps);
        if (now.dps > before.dps) drained++;
      }
    }
    expect(drained).toBeGreaterThan(0);
  });
```

with:

```ts
  it('Guard and Leech add life where their move is cast; Drain adds DPS on some setup', () => {
    const estimateOf = (s: DpsSetup) => estimateCombat(heroOf(s), registry, DEPTH, s.chains);
    /** Whether the pool pays every move of the held skill (a blow always: blows are free). */
    const cast = (s: DpsSetup) => {
      if (s.hold === 'attack') return true;
      const skill = ABILITY_SLOTS[s.hold.slot];
      const stats = heroOf(s);
      const chain = resolveChain(registry, stats, skill, s.chains[skill]);
      return !valuedChain(chain, manaPool(stats, registry).max).includes(null);
    };
    let drained = 0;
    for (const s of socketed) {
      if (!SIGN_ONLY.includes(s.dims.rune)) continue;
      const [now, before] = [estimateOf(s), estimateOf(byKey.get(s.base!)!)];
      if (s.dims.rune === 'drain') {
        if (now.dps > before.dps) drained++;
      } else if (cast(s)) expect(now.ehp, dpsKey(s)).toBeGreaterThan(before.ehp);
      // A runed mana Ultimate the depth-10 pool can't hold is never cast: it adds no life.
      else expect(now.ehp, dpsKey(s)).toBe(before.ehp);
    }
    // Drain's own load can outweigh its refund (the rune costs spec), but not everywhere.
    expect(drained).toBeGreaterThan(0);
  });
```

Replace:

```ts
    // No rune to put in: no socket opens, and the Links stay (the scrap goes to upgrades).
    const empty = betweenDives(registry, { ...full, links: 17, scrap: 340 });
```

with:

```ts
    // With the runes' price zeroed, so every Leech and Guard nets Power (the price is the next
    // test's). No rune to put in: no socket opens, and the Links stay (the scrap goes to upgrades).
    const empty = betweenDives(unloaded, { ...full, links: 17, scrap: 340 });
```

Replace:

```ts
    const after = betweenDives(registry, { ...full, links: 17, scrap: 340, runes });
```

with:

```ts
    const after = betweenDives(unloaded, { ...full, links: 17, scrap: 340, runes });
```

Replace:

```ts
  it('values a transfer without the runes it would destroy (a rare holds two sockets a move)', () => {
```

with:

```ts
  it("opens no Primary socket for a rune whose price outweighs it: the Primary's loads × 10", () => {
    const p = { ...bolt(veteran(), []), links: 5, scrap: 200, runes: { echo: [0, 0, 1, 0, 0] } };
    const opened = (r: DataRegistry) =>
      sockets(betweenDives(r, p), 'primary').reduce((a, n) => a + n, 0);
    // At the shipped loads Echo III nets Power on the Bolt, so a socket opens for it.
    expect(opened(registry)).toBe(1);
    const dear = registryWith((b) => {
      b.runes.load.bySlot.primary = 10;
    });
    expect(opened(dear)).toBe(0);
  });

  it('values a transfer without the runes it would destroy (a rare holds two sockets a move)', () => {
```

Replace:

```ts
    expect(estimateCombat(s, small, DEPTH, { ...rest, defensive: ward('heavy') })).toEqual(without);
  });
});
```

with:

```ts
    expect(estimateCombat(s, small, DEPTH, { ...rest, defensive: ward('heavy') })).toEqual(without);
  });

  it('a runed Primary: its v0.51.0 Power with the loads zeroed, and less with them', () => {
    // Echo, Heavy and Linger III on every move of a Bolt's default chain (mana-bound at a pool of 66).
    const runes = ['echo', 'heavy', 'linger'].map(III);
    const runed = withChains(starter, {
      primary: {
        moves: (['light', 'medium', 'medium', 'heavy'] as const).map((kind) => ({
          ...bolt(kind),
          runes,
        })),
        payment: 'mana',
      },
    });
    const at = (r: DataRegistry) =>
      estimateCombat(profileStats(r, runed), r, DEPTH, chainsOf(runed));
    expect(at(unloaded)).toEqual({ dps: 97.61729476678113, ehp: 162.01086642686363, power: 1258 });
    expect(at(registry).dps).toBeLessThan(at(unloaded).dps);
    expect(at(registry).power).toBeLessThan(at(unloaded).power);
  });

  it('a runed mana Ultimate the pool can no longer hold lowers Power: a medium Nova (60) with Leech I at a pool of 66', () => {
    const runedNova = (runes: RuneRef[]): Chain => ({
      moves: [{ kind: 'medium', form: 'nova', elements: ['fire'], runes }],
      payment: 'mana',
    });
    const leech = [{ id: 'leech', tier: 1 as const }];
    expect(chain('ultimate', runedNova([]).moves).moves[0].cost).toBeLessThanOrEqual(pool);
    expect(chain('ultimate', runedNova(leech).moves).moves[0].cost).toBeGreaterThan(pool);
    const power = (c: Chain) =>
      estimateCombat(stats, registry, DEPTH, { ...chainsOf(starter), ultimate: c }).power;
    expect(power(runedNova(leech))).toBeLessThan(power(runedNova([])));
  });
});
```

The Power golden `{ dps: 97.61729476678113, ehp: 162.01086642686363, power: 1258 }` is that hero's estimate with the loads zeroed, which is v0.51.0's (step 1 keeps every number, and the pool rule doesn't touch this chain: its dearest move costs well under the pool of 66).

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts tests/delve-rune-sim.test.ts tests/delve-dps-sim.test.ts tests/delve-rune-power.test.ts)`
Expected: FAIL, 8 failed and 131 passed (139). With every load still 0:
- `delve-rune-costs.test.ts` "ships delve.runes.load with every slot at 1" (`expected { bySlot: { primary: +0, …(2) }, …(5) } to deeply equal { bySlot: { primary: 1, …(2) }, …(5) }`);
- `delve-rune-sim.test.ts` "an ability: at most half its own mana cost before its load a cast" (`expected 8 to be greater than 8`: Drain's load costs nothing yet), "refuses a move the pool covers only before its load" (`expected false to be true`: it casts), "a held button whose loaded move the pool can't pay" (`expected +0 to be 1`) and "a hold whose full charge the pool covers only before its load" (`expected 12.8 to be greater than 12.9`);
- `delve-dps-sim.test.ts` "Echo III on a Bolt beats its baseline, and its price takes some back" (`expected 1.3354225082715054 to be less than 1.3354225082715054`);
- `delve-rune-power.test.ts` "a runed Primary: … less with them" (`expected 97.61729476678113 to be less than 97.61729476678113`) and "a runed mana Ultimate the pool can no longer hold lowers Power" (`expected 60 to be greater than 66`).

The other restated tests pass already (each holds at any load), and so does "opens no Primary socket … × 10", which sets its own load.

- [ ] **Step 3: Turn the loads on**

In `packages/engine/src/data/balance.json`:

Replace:

```json
        "bySlot": { "primary": 0, "defensive": 0, "ultimate": 0 }, "byForm": {},
```

with:

```json
        "bySlot": { "primary": 1, "defensive": 1, "ultimate": 1 }, "byForm": {},
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs.test.ts tests/delve-rune-sim.test.ts tests/delve-dps-sim.test.ts tests/delve-rune-power.test.ts)`
Expected: PASS, every test in the four files (the marked `it.fails` direction test still failing inside: the loads don't make Power and the Lab agree on every rune's direction, so it stays marked).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: the typecheck prints nothing; **1630 tests pass in 83 files**, the pacing rails (`tests/delve-pacing.test.ts`) among them. If a rail fails, don't change it: finish Task 4's measurement, then go to Task 9.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-costs-engine
(cd packages/engine && npx prettier --write --end-of-line auto tests/delve-rune-costs.test.ts tests/delve-rune-sim.test.ts tests/delve-dps-sim.test.ts tests/delve-rune-power.test.ts)
git add packages/engine/src/data/balance.json packages/engine/tests/delve-rune-costs.test.ts packages/engine/tests/delve-rune-sim.test.ts packages/engine/tests/delve-dps-sim.test.ts packages/engine/tests/delve-rune-power.test.ts
git commit -m "feat(engine): rune loads on (bySlot 1): a runed move costs its eased load more in its payment" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: The pacing run after the loads, and the grid

No edit and no commit.

- [ ] **Step 1: Measure the rails**

Run the measuring routine (see "Commands") with `<stage>` = `loads`.

Expected, `pacing-loads.txt` (every rail holds):

```text
first dive: 3, 3, 3, 3 (each ≥ 3), mean 3 (3–12)
dive 6 mean 25.75, dive 12 mean 35.5 (> dive 1 + 5, > dive 6)
frost: dive 1 3.5, dive 12 34.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 6.75 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 25, 18–36 (allowed 15.0–40.0): fire+frost 20, earth+frost 24, storm+fire 27, frost+storm 29, fire+shadow 18, fire+nature 26, shadow+nature 22, fire+earth 29, storm+earth 20, earth+shadow 36, earth+nature 23, frost+shadow 21, frost+nature 28, storm+shadow 25, storm+nature 26
seconds per floor: 30.12 (8–60)
```

`first-dives-loads.txt`:

```text
1 1→3 dead power 1266 | 1→5 dead power 2444
2 1→3 dead power 1352 | 1→7 dead power 2889
3 1→3 dead power 1022 | 1→11 dead power 3855
4 1→3 dead power 1166 | 1→5 dead power 2913
```

(Seed 3's second dive ends at Power 3855, not 4411: its runes now cost. The depths don't move.) And `rune-use-loads.txt`, the four seeds' weapons at dive 12:

```text
seed 1: epic weapon, sockets 13, socketed [leech IV, linger I, drain V, leech IV, multishot IV, linger IV, multishot IV, multishot IV, widen V, chain IV, volatile V, leech V, leech IV], pouch 8, depth 29, power 562055
seed 2: epic weapon, sockets 25, socketed [leech V, guard V, guard IV, quick V, chain V, volatile V, drain V, quick V, echo IV, leech V, saturate V, multishot IV, heavy V, echo V, echo V, widen IV, volatile V, widen V, leech V, linger IV, heavy V, heavy V, heavy IV, linger V, linger V], pouch 12, depth 36, power 2077733
seed 3: epic weapon, sockets 34, socketed [chain V, quick V, widen V, volatile V, saturate V, volatile I, guard V, saturate V, quick IV, saturate V, linger IV, multishot V, echo IV, leech V, chain V, echo V, chain V, multishot V, linger IV, multishot III, volatile IV, widen V, volatile IV, drain V, volatile IV, drain V, drain V, quick V, chain V, linger IV, leech IV, linger IV, heavy V, heavy IV], pouch 8, depth 36, power 720025
seed 4: epic weapon, sockets 23, socketed [saturate II, volatile V, saturate II, volatile IV, saturate V, quick V, echo V, leech V, multishot V, multishot III, multishot II, multishot V, heavy IV, split V, multishot II, drain V, quick IV, quick IV, guard V, linger IV, leech V, heavy V, heavy V], pouch 5, depth 41, power 1855199
```

Against v0.51.0 (`rune-costs-before/` and the runes gate's `rune-use`): the seeds hold 13, 25, 34 and 23 sockets at dive 12 where they held 15, 42, 38 and 34, so the bot opens fewer sockets, as the spec expects ("it sockets fewer of them, only where they net Power").

If a rail fails, stop here and go to Task 9 with the numbers.

- [ ] **Step 2: The grid: rune-less rows unchanged**

```bash
cd /c/Projects/alloy-costs-engine
(cd packages/engine && npx tsup --format esm --no-dts --no-sourcemap --out-dir node_modules/.costs-measure)
S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
M=C:/Projects/alloy-costs-engine/packages/engine/node_modules/.costs-measure/index.js
cd $S/rune-costs-a
node $S/rune-costs-before/snapshot.mjs $M grid-loads.json
node $S/rune-costs-before/identical.mjs $S/rune-costs-before/before-depth10.json grid-loads.json | head -1
node -e "const fs=require('fs');const [b,a]=['$S/rune-costs-before/before-depth10.json','grid-loads.json'].map(f=>JSON.parse(fs.readFileSync(f,'utf8')));const d=Object.keys(b).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));const ab=new Set(['bolt','volley','lance','burst','strike','nova','barrage','maelstrom']);console.log('differing',d.length,'outside the rune view',d.filter(k=>b[k].view!=='rune').length,'not a runed ability row',d.filter(k=>!ab.has(b[k].dims.on)||b[k].dims.rune==='none').length)"
cd /c/Projects/alloy-costs-engine && rm -rf packages/engine/node_modules/.costs-measure
```

Expected:

```text
runs 9544 ms …
rows 9544 before, 9544 after; differing 180
differing 180 outside the rune view 0 not a runed ability row 0
```

Every basic and ability row, every baseline and every weapon's rune row (blows are free) is as at v0.51.0; the 180 that move are the runed ability rows (90 on each layout). At full mana the depth-10 hero (pool 63) can no longer cast any runed mana Ultimate (a medium Nova, Barrage or Maelstrom costs 60 before its load), so those rows read 0 DPS: the spec's "an uncastable runed mana Ultimate at a low pool is intended".

---
## Chunk 3: The Lab's sustained mode

### Task 5: `DpsOptions.sustained`, the supported hero and `labHero`

The spec: "Either value empties the pool (`h.mana = 0`) and every charge meter right after `createSandboxWorld`"; starved is the Lab's hero as built (pool 63, regen 4.2, attunement 1, runes eased 3%), supported adds +14 to the first element and +5 to the second (pool 120), Mana Regen ×1.3 (regen 10.4) and Drain III in every basic blow. Full mana (no `sustained`) runs exactly as before.

**Files:**
- Modify: `packages/engine/src/arpg/dps-sim.ts`, `packages/engine/tests/delve-dps-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-dps-sim.test.ts` the sims' tap also records each step's mana and charge before it, and the last world it ran on.

Replace:

```ts
const tap = vi.hoisted(() => ({
  on: false,
  events: [] as ArpgEvent[],
  steps: [] as {
    input: ArpgInput;
    windup: boolean;
    hold: number | null;
    events: ArpgEvent[];
  }[],
}));
```

with:

```ts
const tap = vi.hoisted(() => ({
  on: false,
  events: [] as ArpgEvent[],
  steps: [] as {
    input: ArpgInput;
    windup: boolean;
    hold: number | null;
    events: ArpgEvent[];
    /** The hero's mana and charge meters before the step. */
    mana: number;
    charge: number[];
  }[],
  /** The world the last step ran on. */
  world: null as ArpgWorld | null,
}));
```

Replace:

```ts
    stepWorld: (...args: Parameters<typeof step.stepWorld>) => {
      const windup = args[1].hero.windup !== null;
      const events = step.stepWorld(...args);
      if (tap.on) {
        tap.events.push(...events);
        tap.steps.push({ input: args[2], windup, hold: args[1].hero.hold?.slot ?? null, events });
      }
      return events;
    },
```

with:

```ts
    stepWorld: (...args: Parameters<typeof step.stepWorld>) => {
      const h = args[1].hero;
      const windup = h.windup !== null;
      const [mana, charge] = [h.mana, [...h.charge]];
      const events = step.stepWorld(...args);
      if (tap.on) {
        tap.world = args[1];
        tap.events.push(...events);
        tap.steps.push({
          input: args[2],
          windup,
          hold: h.hold?.slot ?? null,
          events,
          mana,
          charge,
        });
      }
      return events;
    },
```

Replace:

```ts
/** Run `f`, collecting every event its sims step through, and each step (see `tap`). */
function recorded<T>(f: () => T): { out: T; events: ArpgEvent[]; steps: typeof tap.steps } {
  tap.events = [];
  tap.steps = [];
  tap.on = true;
  try {
    return { out: f(), events: tap.events, steps: tap.steps };
  } finally {
```

with:

```ts
/** Run `f`, collecting every event its sims step through, each step and the last world (see `tap`). */
function recorded<T>(f: () => T): {
  out: T;
  events: ArpgEvent[];
  steps: typeof tap.steps;
  world: ArpgWorld | null;
} {
  tap.events = [];
  tap.steps = [];
  tap.world = null;
  tap.on = true;
  try {
    return { out: f(), events: tap.events, steps: tap.steps, world: tap.world };
  } finally {
```

Append at the end of the file:

```ts
describe('the sustained mode (see the rune costs spec)', () => {
  const STARVED: DpsOptions = { ...PACK, sustained: 'starved' };
  const SUPPORTED: DpsOptions = { ...PACK, sustained: 'supported' };
  /** The hero a run ends with, and its first step's mana and charge. */
  const ran = (key: string, o: DpsOptions) => {
    const { world, steps } = recorded(() => simulateDps(registry, setup(key), { ...o, seed: 0 }));
    return { hero: world!.hero, first: steps[0] };
  };

  it('starts the pool and every charge meter empty, starved or supported; full mana starts full', () => {
    for (const o of [STARVED, SUPPORTED])
      expect(ran('ability|nova|fire|none|medium|charge', o).first).toMatchObject({
        mana: 0,
        charge: [0, 0, 0],
      });
    const full = ran('ability|bolt|fire|none|medium|mana', PACK);
    expect(full.first.mana).toBe(full.hero.manaMax);
  });

  it("starved is the Lab's hero as built; supported has a pool of 120 regenerating 10.4, Drain III on every blow and a Fire move's runes eased 45%", () => {
    const starved = ran('rune|echo|bolt|fire|III', STARVED).hero;
    expect(starved.manaMax).toBe(63);
    expect(starved.manaRegen).toBeCloseTo(4.2);
    expect(starved.stats.weapon.blows.every((b) => b.runes.length === 0)).toBe(true);
    expect(starved.chains[0]!.moves[0].ease).toBeCloseTo(0.03);
    const supported = ran('rune|echo|bolt|fire|III', SUPPORTED).hero;
    expect(supported.manaMax).toBe(120);
    expect(supported.manaRegen).toBeCloseTo(10.4);
    for (const b of supported.stats.weapon.blows)
      expect(b.runes).toEqual([{ id: 'drain', tier: 3 }]);
    for (const m of supported.chains[0]!.moves) expect(m.ease).toBeCloseTo(0.45);
    // A Fire + Frost move eases by their mean attunement, 10.
    const both = ran('rune|volatile|bolt|fire+frost|III', SUPPORTED).hero;
    expect(both.chains[0]!.moves[0].ease).toBeCloseTo(0.3);
  });

  it('a basic-view row comes out the same starved as at full mana: a basic attack spends none', () => {
    for (const key of ['basic|sword|fire|none', 'basic|bow|storm|fire'])
      expect(simulateDps(registry, setup(key), STARVED)).toEqual(
        simulateDps(registry, setup(key), PACK),
      );
  });

  it('a runed row casts less starved than at full mana, and less than its baseline starved', () => {
    const casts = (key: string, o: DpsOptions) => simulateDps(registry, setup(key), o).casts;
    expect(casts('rune|echo|bolt|fire|III', STARVED)).toBeLessThan(
      casts('rune|echo|bolt|fire|III', PACK),
    );
    expect(casts('rune|echo|bolt|fire|III', STARVED)).toBeLessThan(
      casts('rune|none|bolt|fire|none', STARVED),
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-dps-sim.test.ts)`
Expected: FAIL, 3 failed and 27 passed (30): "starts the pool and every charge meter empty" (`expected { Object (input, windup, ...) } to match object { mana: +0, charge: [ +0, +0, +0 ] }`: the pool starts full), "starved is the Lab's hero as built; supported has a pool of 120 …" (`expected 63 to be 120`) and "a runed row casts less starved than at full mana" (`expected 30 to be less than 30`: the option is ignored, so both run at full mana). The basic-view test passes already (it holds with the option ignored too).

- [ ] **Step 3: Write the sustained mode**

In `packages/engine/src/arpg/dps-sim.ts`:

Replace:

```ts
import type { RuneDef, RuneTier } from '../types/rune.js';
```

with:

```ts
import type { HeroStats } from '../types/delve.js';
import type { RuneDef, RuneRef, RuneTier } from '../types/rune.js';
```

Replace:

```ts
   * `RUNE_SEEDS` of them; every other row is one run on seed 0.
   */
  seed?: number;
}
```

with:

```ts
   * `RUNE_SEEDS` of them; every other row is one run on seed 0.
   */
  seed?: number;
  /**
   * Sustained mana (see the rune costs spec): the pool and every charge meter start empty, and
   * the basics, swinging on their own, refill them. 'starved' is the setup's hero as built;
   * 'supported' adds `SUPPORTED`'s mana (`labHero`). Absent: full mana.
   */
  sustained?: 'starved' | 'supported';
}
```

Replace:

```ts
const GAP = 0.4;
const NO_TOGGLES = { infiniteMana: false, noCooldowns: false, invulnerable: false };
```

with:

```ts
const GAP = 0.4;
const NO_TOGGLES = { infiniteMana: false, noCooldowns: false, invulnerable: false };

/**
 * The supported hero's mana (see the rune costs spec), a dive-12 hero's who built for it:
 * attunement added to the setup's first element and to its second, one Mana Regen affix at its
 * top roll (×1.3), and Drain III in every basic blow.
 */
const SUPPORTED = {
  first: 14,
  second: 5,
  manaRegenMult: 1.3,
  drain: { id: 'drain', tier: 3 } satisfies RuneRef,
};
```

Replace:

```ts
function runDps(registry: DataRegistry, setup: DpsSetup, o: DpsOptions): DpsResult {
  const { baseId, primary, secondary } = setup.weapon;
  const weapon = sandboxWeapon(registry, {
    baseId,
    mana: primary,
    rarity: 'common',
    ilvl: o.depth,
  });
  const world = createSandboxWorld(registry, {
    depth: o.depth,
    stats: computeHeroStats({ weapon }, registry, {
      pair: { primary, secondary },
      basic: setup.chains.basic,
    }),
    chains: setup.chains,
    toggles: NO_TOGGLES,
  });
  // The sandbox's own combat stream is `SeededRNG(1).fork('combat')`: seed k is the same from k + 1.
  if (o.seed) world.rng = new SeededRNG(1 + o.seed).fork('combat');
  const h = world.hero;
```

with:

```ts
/**
 * The hero a run fights as: a plain common weapon of the setup's base at item level = depth, on
 * its pair, with its chains. Supported (`DpsOptions.sustained`) adds `SUPPORTED`'s mana: its
 * attunement to the first element and to the second (without one, Frost; Fire on a Frost hero),
 * its Mana Regen, and Drain III in every blow beside the blow's own runes.
 */
export function labHero(
  registry: DataRegistry,
  setup: DpsSetup,
  o: DpsOptions,
): { stats: HeroStats; chains: Chains } {
  const { baseId, primary, secondary } = setup.weapon;
  const weapon = sandboxWeapon(registry, {
    baseId,
    mana: primary,
    rarity: 'common',
    ilvl: o.depth,
  });
  const extra = { pair: { primary, secondary }, basic: setup.chains.basic };
  if (o.sustained !== 'supported')
    return { stats: computeHeroStats({ weapon }, registry, extra), chains: setup.chains };
  const basic = setup.chains.basic.map((b) => ({
    ...b,
    runes: [...(b.runes ?? []), SUPPORTED.drain],
  }));
  const second = secondary ?? (primary === 'frost' ? 'fire' : 'frost');
  const stats = computeHeroStats({ weapon }, registry, {
    ...extra,
    basic,
    attunement: { [primary]: SUPPORTED.first, [second]: SUPPORTED.second },
  });
  return {
    stats: { ...stats, manaRegenMult: SUPPORTED.manaRegenMult },
    chains: { ...setup.chains, basic },
  };
}

function runDps(registry: DataRegistry, setup: DpsSetup, o: DpsOptions): DpsResult {
  const world = createSandboxWorld(registry, {
    depth: o.depth,
    ...labHero(registry, setup, o),
    toggles: NO_TOGGLES,
  });
  // The sandbox's own combat stream is `SeededRNG(1).fork('combat')`: seed k is the same from k + 1.
  if (o.seed) world.rng = new SeededRNG(1 + o.seed).fork('combat');
  const h = world.hero;
  // Sustained: the pool and every charge meter start empty.
  if (o.sustained) {
    h.mana = 0;
    h.charge.fill(0);
  }
```

(Without `sustained` the hero is built exactly as before, the same `computeHeroStats` call on the same chains, so every full-mana row is unchanged; Task 8 checks the grid.)

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-dps-sim.test.ts)`
Expected: PASS, 30 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: the typecheck prints nothing; **1634 tests pass in 83 files**.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-costs-engine
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/dps-sim.ts tests/delve-dps-sim.test.ts)
git add packages/engine/src/arpg/dps-sim.ts packages/engine/tests/delve-dps-sim.test.ts
git commit -m "feat(engine): the DPS Lab's sustained mode: starved and supported heroes start with an empty pool (labHero)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: The Lab page's Mana select, and the session key

A "Mana" select beside "Pack" (full, starved, supported; `data-testid="lab-mana"`), passed in the worker's `DpsOptions`; the session keeps results per option (`depth|pack|sustained|dpsKey`, `full` for full mana).

**Files:**
- Modify: `packages/client/src/features/delve/lab/lab-model.ts`, `packages/client/src/pages/DelveLab.tsx`, `packages/client/src/features/delve/lab/__tests__/lab-model.test.ts`, `packages/client/src/pages/__tests__/DelveLab.test.tsx`

- [ ] **Step 1: Rebuild the bundle the client reads**

Run: `(cd packages/engine && npx tsup) && grep -c "sustained" packages/engine/dist/index.d.ts`
Expected: the build succeeds and the count is at least 1 (`DpsOptions.sustained` is in the bundle's types).

- [ ] **Step 2: Write the failing tests**

In `packages/client/src/features/delve/lab/__tests__/lab-model.test.ts`:

Replace:

```ts
  it('keeps results for the session by depth, pack and key', () => {
    const a = row({ id: 'a' }, 1);
    const b = row({ id: 'b' }, 2);
    remember(7, true, [b]);
    expect(recall(7, true, ['a', 'b'])).toEqual([b]);
    expect(recall(7, false, ['a', 'b'])).toEqual([]);
    remember(7, true, [a]);
    expect(recall(7, true, ['a', 'b'])).toEqual([a, b]);
  });
```

with:

```ts
  it('keeps results for the session by depth, pack and key', () => {
    const a = row({ id: 'a' }, 1);
    const b = row({ id: 'b' }, 2);
    remember(7, true, undefined, [b]);
    expect(recall(7, true, undefined, ['a', 'b'])).toEqual([b]);
    expect(recall(7, false, undefined, ['a', 'b'])).toEqual([]);
    remember(7, true, undefined, [a]);
    expect(recall(7, true, undefined, ['a', 'b'])).toEqual([a, b]);
  });

  it('keeps one key apart under each mana option (full, starved, supported)', () => {
    const full = row({ id: 'c' }, 1);
    const starved = row({ id: 'c' }, 2);
    remember(8, false, undefined, [full]);
    remember(8, false, 'starved', [starved]);
    expect(recall(8, false, undefined, ['c'])).toEqual([full]);
    expect(recall(8, false, 'starved', ['c'])).toEqual([starved]);
    expect(recall(8, false, 'supported', ['c'])).toEqual([]);
  });
```

In `packages/client/src/pages/__tests__/DelveLab.test.tsx`:

Replace:

```tsx
  it('moving focus off the slider commits the depth too (a controller only nudges it)', () => {
```

with:

```tsx
  it('the Mana select runs the grid starved or supported, each kept apart for the session', () => {
    renderLab();
    const mana = screen.getByTestId('lab-mana');
    expect(mana).toHaveValue('full');
    expect(
      within(mana)
        .getAllByRole('option')
        .map((o) => o.getAttribute('value')),
    ).toEqual(['full', 'starved', 'supported']);
    fireEvent.change(mana, { target: { value: 'starved' } });
    expect(latest().requests).toEqual([{ depth: 10, pack: false, sustained: 'starved' }]);
    latest().reply(grid.map((s) => result(dpsKey(s), 2)));
    expect(screen.queryByTestId('lab-progress')).toBeNull();
    fireEvent.change(mana, { target: { value: 'supported' } });
    expect(latest().requests).toEqual([{ depth: 10, pack: false, sustained: 'supported' }]);
    expect(screen.getByTestId('lab-progress')).toBeInTheDocument();
    // Back to starved: the session kept that run, so no worker is needed.
    const workers = FakeWorker.all.length;
    fireEvent.change(mana, { target: { value: 'starved' } });
    expect(FakeWorker.all).toHaveLength(workers);
    expect(screen.queryByTestId('lab-progress')).toBeNull();
  });

  it('moving focus off the slider commits the depth too (a controller only nudges it)', () => {
```

(The page's other tests keep their `toEqual([{ depth, pack }])`: the request's `sustained` is undefined at full mana, which `toEqual` reads as absent. The new test's run is kept under `starved`, so the later tests still find nothing kept at full mana and start a worker on load.)

- [ ] **Step 3: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/lab src/pages/__tests__/DelveLab.test.tsx)`
Expected: FAIL, 3 failed and 20 passed (23): both `lab-model` session tests (`TypeError: rows is not iterable`: today's `remember` takes the third argument as its rows) and "the Mana select runs the grid …" (`TestingLibraryElementError: Unable to find an element by: [data-testid="lab-mana"]`). The client typecheck fails too: `error TS2554: Expected 3 arguments, but got 4.` on the new calls.

- [ ] **Step 4: Write the session key and the select**

In `packages/client/src/features/delve/lab/lab-model.ts`:

Replace:

```ts
import { MANA_TYPES, type DpsResult, type DpsSetup, type ManaType } from '@alloy/engine';
```

with:

```ts
import {
  MANA_TYPES,
  type DpsOptions,
  type DpsResult,
  type DpsSetup,
  type ManaType,
} from '@alloy/engine';
```

Replace:

```ts
/** Every result this session, keyed `depth|pack|dpsKey`, so flipping back is instant. */
const kept = new Map<string, LabRow>();

export function remember(depth: number, pack: boolean, rows: readonly LabRow[]): void {
  for (const r of rows) kept.set(`${depth}|${pack}|${r.key}`, r);
}

/** The results kept for these options, in the order of `keys` (the ones not run yet left out). */
export function recall(depth: number, pack: boolean, keys: readonly string[]): LabRow[] {
  return keys.flatMap((key) => kept.get(`${depth}|${pack}|${key}`) ?? []);
}
```

with:

```ts
/**
 * Every result this session, keyed `depth|pack|sustained|dpsKey` (`full` for full mana), so
 * flipping back is instant.
 */
const kept = new Map<string, LabRow>();
const keyOf = (depth: number, pack: boolean, sustained: DpsOptions['sustained'], key: string) =>
  `${depth}|${pack}|${sustained ?? 'full'}|${key}`;

export function remember(
  depth: number,
  pack: boolean,
  sustained: DpsOptions['sustained'],
  rows: readonly LabRow[],
): void {
  for (const r of rows) kept.set(keyOf(depth, pack, sustained, r.key), r);
}

/** The results kept for these options, in the order of `keys` (the ones not run yet left out). */
export function recall(
  depth: number,
  pack: boolean,
  sustained: DpsOptions['sustained'],
  keys: readonly string[],
): LabRow[] {
  return keys.flatMap((key) => kept.get(keyOf(depth, pack, sustained, key)) ?? []);
}
```

In `packages/client/src/pages/DelveLab.tsx`:

Replace:

```tsx
type View = DpsSetup['view'];
```

with:

```tsx
type View = DpsSetup['view'];
/** The Mana select's options: full mana, or sustained (`DpsOptions.sustained`; the rune costs spec). */
type Mana = 'full' | NonNullable<DpsOptions['sustained']>;
const MANAS: [Mana, string][] = [
  ['full', 'Full'],
  ['starved', 'Starved'],
  ['supported', 'Supported'],
];
```

Replace:

```tsx
  const [pack, setPack] = useState(false);
  const [colorBy, setColorBy] = useState(BY_LINE);
```

with:

```tsx
  const [pack, setPack] = useState(false);
  const [mana, setMana] = useState<Mana>('full');
  const sustained = mana === 'full' ? undefined : mana;
  const [colorBy, setColorBy] = useState(BY_LINE);
```

Replace:

```tsx
  // The whole grid at this depth and pack, unless the session has it already. Each request gets
```

with:

```tsx
  // The whole grid at this depth, pack and mana, unless the session has it already. Each request gets
```

Replace:

```tsx
    const kept = recall(depth, pack, keys);
```

with:

```tsx
    const kept = recall(depth, pack, sustained, keys);
```

Replace:

```tsx
      remember(depth, pack, e.data);
```

with:

```tsx
      remember(depth, pack, sustained, e.data);
```

Replace:

```tsx
    worker.postMessage({ depth, pack } satisfies DpsOptions);
    return () => {
      worker.onmessage = null;
      worker.terminate();
    };
  }, [depth, pack, keys]);
```

with:

```tsx
    worker.postMessage({ depth, pack, sustained } satisfies DpsOptions);
    return () => {
      worker.onmessage = null;
      worker.terminate();
    };
  }, [depth, pack, sustained, keys]);
```

Replace:

```tsx
          Pack of 5
        </label>
```

with:

```tsx
          Pack of 5
        </label>
        <label className="flex items-center gap-1.5 text-xs text-stone-300">
          Mana
          <select
            className={SELECT}
            value={mana}
            onChange={(e) => setMana(e.target.value as Mana)}
            data-testid="lab-mana"
          >
            {MANAS.map(([m, label]) => (
              <option key={m} value={m}>
                {label}
              </option>
            ))}
          </select>
        </label>
```

(The worker, `lab-worker.ts`, already passes its message to `simulateDps` as the options, so it needs no change; its error still logs as "DPS Lab worker …".)

- [ ] **Step 5: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/lab src/pages/__tests__/DelveLab.test.tsx)`
Expected: PASS, 23 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: the typecheck prints nothing; **862 tests pass in 98 files** (no existing client test reads a runed price, so the loads in the bundle move none).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-costs-engine
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/lab/lab-model.ts src/pages/DelveLab.tsx src/features/delve/lab/__tests__/lab-model.test.ts src/pages/__tests__/DelveLab.test.tsx)
git add packages/client/src/features/delve/lab/lab-model.ts packages/client/src/pages/DelveLab.tsx packages/client/src/features/delve/lab/__tests__/lab-model.test.ts packages/client/src/pages/__tests__/DelveLab.test.tsx
git commit -m "feat(client): the DPS Lab's Mana select (full, starved, supported), each run kept for the session" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
## Chunk 4: The gate, the ceilings, tuning and the report

### Task 7: The two-build gate

The spec's sustained gate, in the repo and skipped by default: for each Primary form (Bolt, Volley, Lance, Burst, Strike), its best three-rune tier-III set, ranked on the pack at full mana with the loads zeroed, against the rune-less chain. It fails on supported below 1.5× (pack) or the starved mana per press outside 2.0–3.0×, and prints the rest.

**Files:**
- Create: `packages/engine/tests/delve-rune-costs-gate.test.ts`

- [ ] **Step 1: Write the gate**

Create `packages/engine/tests/delve-rune-costs-gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveChain } from '../src/arpg/abilities/resolve.js';
import {
  dpsCombos,
  dpsKey,
  labHero,
  runeComboSetups,
  simulateDps,
  type DpsOptions,
  type DpsSetup,
} from '../src/arpg/dps-sim.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { valuedMove } from '../src/delve/hero-stats.js';

/**
 * The rune costs spec's two-build gate ("Balance and gates"), at depth 10 and eight combat
 * seeds a row. For each Primary form, its best three-rune tier-III set (the highest pack ratio
 * at full mana with the loads zeroed, among `runeComboSetups`) against the rune-less chain:
 * - supported (`sustained: 'supported'`) must sustain at least 1.5× on the pack;
 * - the starved hero's mana per press (the mean cost of the chain's moves, runed over rune-less)
 *   must sit in 2.0–3.0×.
 * Everything else is printed: the full-mana, starved and supported ratios, loaded and with the
 * loads zeroed (in brackets), on the pack and on one dummy; the supported mana per press; and
 * whether each price bites (a loaded sustained ratio below its unloaded one). When it fails,
 * tune `byForm`, then `bySlot`, then `easePerAttune` / `easeCap`, then the rune rows; never the
 * floor or the band. Skipped unless RUNE_COST_GATE is set (about 30 s):
 * `RUNE_COST_GATE=1 npx vitest run tests/delve-rune-costs-gate.test.ts`.
 */

const FORMS = ['bolt', 'volley', 'lance', 'burst', 'strike'];
const DEPTH = 10;
const FLOOR = 1.5;
const BAND = [2.0, 3.0];

describe.skipIf(!process.env.RUNE_COST_GATE)('the rune costs gate (depth 10, eight seeds)', () => {
  const registry = createDefaultRegistry();
  const d = loadAndValidateData();
  d.balance.delve!.runes.load.bySlot = { primary: 0, defensive: 0, ultimate: 0 };
  /** The runes without their price. */
  const unloaded = new DataRegistry(
    d.affixes,
    d.combinations,
    d.synergies,
    d.baseItems,
    d.balance,
    d.recipes,
    d.delve,
    d.arpg,
  );
  const byKey = new Map(dpsCombos(registry).map((s) => [dpsKey(s), s]));
  const baseOf = (s: DpsSetup) => byKey.get(s.base!)!;
  /** Each run once: a baseline serves every set on its form. */
  const runs = new Map<string, number>();
  const dps = (r: DataRegistry, s: DpsSetup, o: DpsOptions) => {
    const key = `${r === registry}|${o.pack}|${o.sustained ?? 'full'}|${dpsKey(s)}`;
    if (!runs.has(key)) runs.set(key, simulateDps(r, s, o).dps);
    return runs.get(key)!;
  };
  /** A set's DPS over its rune-less chain's, under `r` (the loads in, or zeroed). */
  const ratio = (r: DataRegistry, s: DpsSetup, o: DpsOptions) =>
    dps(r, s, o) / dps(r, baseOf(s), o);
  /** The mean cost of a setup's Primary moves (a hold at full charge) on the hero `o` builds. */
  const perPress = (s: DpsSetup, o: DpsOptions) => {
    const { stats, chains } = labHero(registry, s, o);
    const chain = resolveChain(registry, stats, 'primary', chains.primary);
    return chain.moves.reduce((a, _, i) => a + valuedMove(chain, i).cost, 0) / chain.moves.length;
  };
  const x = (n: number) => n.toFixed(2);

  for (const form of FORMS)
    it(`${form}: supported at least ${FLOOR}× on the pack, the starved mana per press in ${BAND[0]}–${BAND[1]}×`, () => {
      const full = (pack: boolean): DpsOptions => ({ depth: DEPTH, pack });
      const sets = runeComboSetups(registry, form).map((s) => ({
        s,
        unloaded: ratio(unloaded, s, full(true)),
      }));
      sets.sort((a, b) => b.unloaded - a.unloaded);
      const set = sets[0].s;
      /** One layout's ratios: full mana, starved and supported, each loaded and unloaded. */
      const layout = (pack: boolean) => {
        const at = (sustained?: DpsOptions['sustained']) => {
          const o = { ...full(pack), sustained };
          return { loaded: ratio(registry, set, o), unloaded: ratio(unloaded, set, o) };
        };
        return { full: at(), starved: at('starved'), supported: at('supported') };
      };
      const [pack, one] = [layout(true), layout(false)];
      const press = {
        starved:
          perPress(set, { ...full(true), sustained: 'starved' }) /
          perPress(baseOf(set), { ...full(true), sustained: 'starved' }),
        supported:
          perPress(set, { ...full(true), sustained: 'supported' }) /
          perPress(baseOf(set), { ...full(true), sustained: 'supported' }),
      };
      const row = (l: typeof pack) =>
        `full ${x(l.full.unloaded)} → ${x(l.full.loaded)}, starved ${x(l.starved.loaded)} (${x(l.starved.unloaded)}), supported ${x(l.supported.loaded)} (${x(l.supported.unloaded)})`;
      const bites = [pack, one].every(
        (l) => l.starved.loaded < l.starved.unloaded && l.supported.loaded < l.supported.unloaded,
      );
      console.log(
        [
          `${form.padEnd(6)} ${set.dims.rune} (next: ${sets
            .slice(1, 3)
            .map((c) => `${c.s.dims.rune} ${x(c.unloaded)}`)
            .join('; ')})`,
          `  pack: ${row(pack)}`,
          `  one:  ${row(one)}`,
          `  mana per press ${x(press.starved)}× starved, ${x(press.supported)}× supported; the price ${bites ? 'bites' : 'DOES NOT BITE'}`,
        ].join('\n'),
      );
      expect(pack.supported.loaded).toBeGreaterThanOrEqual(FLOOR);
      expect(press.starved).toBeGreaterThanOrEqual(BAND[0]);
      expect(press.starved).toBeLessThanOrEqual(BAND[1]);
    }, 120_000);
});
```

- [ ] **Step 2: Run it skipped, as the suite does**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-costs-gate.test.ts)`
Expected: `Test Files  1 skipped (1)`, `Tests  5 skipped (5)`.

- [ ] **Step 3: Run the gate**

Run (with `S` set as in "Commands"): `(mkdir -p $S/rune-costs-a && cd packages/engine && RUNE_COST_GATE=1 npx vitest run tests/delve-rune-costs-gate.test.ts 2>&1 | tee $S/rune-costs-a/gate.txt | tail -40)`
Expected: PASS, 5 tests, in about 30 s, printing (each form's block under its test's `stdout` line):

```text
bolt   echo+heavy+linger (next: multishot+heavy+linger 2.45; chain+heavy+linger 2.42)
  pack: full 2.56 → 1.08, starved 1.01 (2.42), supported 1.77 (2.26)
  one:  full 2.81 → 1.19, starved 1.11 (2.49), supported 1.83 (2.40)
  mana per press 2.89× starved, 2.07× supported; the price bites
volley pierce+echo+heavy (next: pierce+echo+drain 3.75; pierce+chain+echo 3.43)
  pack: full 3.78 → 1.35, starved 1.34 (3.68), supported 2.07 (2.71)
  one:  full 1.27 → 0.45, starved 0.45 (1.22), supported 0.68 (0.90)
  mana per press 2.89× starved, 2.07× supported; the price bites
lance  echo+heavy+linger (next: echo+linger+drain 2.20; echo+heavy+volatile 2.20)
  pack: full 2.40 → 1.13, starved 1.07 (2.44), supported 1.62 (2.09)
  one:  full 2.55 → 1.16, starved 1.10 (2.64), supported 1.77 (2.27)
  mana per press 2.89× starved, 2.07× supported; the price bites
burst  echo+heavy+linger (next: echo+linger+drain 2.40; echo+heavy+volatile 2.07)
  pack: full 2.61 → 1.21, starved 1.13 (2.62), supported 1.74 (2.25)
  one:  full 2.57 → 1.17, starved 1.10 (2.63), supported 1.76 (2.26)
  mana per press 2.89× starved, 2.07× supported; the price bites
strike echo+heavy+linger (next: echo+linger+drain 2.34; echo+heavy+volatile 2.16)
  pack: full 2.60 → 1.21, starved 1.18 (2.64), supported 1.89 (2.33)
  one:  full 2.49 → 1.19, starved 1.14 (2.61), supported 1.83 (2.20)
  mana per press 2.89× starved, 2.07× supported; the price bites
```

How to read a row: "full 2.56 → 1.08" is the set over the rune-less chain at full mana, loads zeroed → loaded; "starved 1.01 (2.42)" is loaded (zeroed). This is the spec's predicted table, every number: the sets are the spec's (Echo + Heavy + Linger, and Pierce + Echo + Heavy for Volley); supported clears 1.5× on every form (1.62–2.07, Lance lowest); starved sits at 1.01–1.18 on the pack, Volley at 1.34 (accepted by the spec); the mana per press is exactly 1 + 1.95 × 0.97 = 2.89 starved and 1 + 1.95 × 0.55 = 2.07 supported.

**If a test fails, don't commit yet: go to Task 9** with `gate.txt`.

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/alloy-costs-engine
(cd packages/engine && npx prettier --write --end-of-line auto tests/delve-rune-costs-gate.test.ts)
git add packages/engine/tests/delve-rune-costs-gate.test.ts
git commit -m "test(engine): the rune costs gate: each Primary's best set sustains 1.5x supported, at 2-3x the mana a press starved (RUNE_COST_GATE)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: The ceilings, measured unloaded, and the grid after the Lab

The spec: the power ceilings "are measured unloaded (`bySlot` zeroed), so they read exactly as at v0.51.0 and hold as recorded … The loaded full-mana ratios are reported beside them." The runes gate's scripts measure them; an `UNLOADED` switch zeroes `bySlot` on the registry they make. No edit in the repo and no commit.

- [ ] **Step 1: Give the scripts an unloaded switch**

```bash
S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
mkdir -p $S/rune-costs-a && cd $S/rune-costs-a
for f in snapshot rune-gate; do sed "s/^const reg = E.createDefaultRegistry();\$/&\nif (process.env.UNLOADED) reg.getDelveBalance().runes.load.bySlot = { primary: 0, defensive: 0, ultimate: 0 };/" $S/runes-gate/$f.mjs > $f.mjs; done
grep -c "process.env.UNLOADED" snapshot.mjs rune-gate.mjs
```

Expected: `snapshot.mjs:1` and `rune-gate.mjs:1`.

- [ ] **Step 2: Measure**

```bash
cd /c/Projects/alloy-costs-engine
(cd packages/engine && npx tsup --format esm --no-dts --no-sourcemap --out-dir node_modules/.costs-measure)
S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
M=C:/Projects/alloy-costs-engine/packages/engine/node_modules/.costs-measure/index.js
cd $S/rune-costs-a
node snapshot.mjs $M grid-lab.json
node $S/rune-costs-before/identical.mjs grid-loads.json grid-lab.json | head -1
UNLOADED=1 node snapshot.mjs $M grid-unloaded.json
node $S/rune-costs-before/identical.mjs $S/rune-costs-before/before-depth10.json grid-unloaded.json | head -1
UNLOADED=1 node rune-gate.mjs $M grid-unloaded.json ceilings-unloaded.json > ceilings-unloaded.txt
node rune-gate.mjs $M grid-lab.json ceilings-loaded.json > ceilings-loaded.txt
diff <(grep -v '^combos:' ceilings-unloaded.txt) <(grep -v '^combos:' $S/runes-gate/gate-final.txt) && echo "ceilings as at v0.51.0"
node -e "const a=require('./ceilings-unloaded.json'),b=require('$S/runes-gate/gate-final.json');console.log(JSON.stringify(a)===JSON.stringify(b)?'every ratio identical':'ratios differ')"
cat ceilings-loaded.txt
cd /c/Projects/alloy-costs-engine && rm -rf packages/engine/node_modules/.costs-measure
```

Expected (about 2½ minutes):

```text
runs 9544 ms …
rows 9544 before, 9544 after; differing 0
runs 9544 ms …
rows 9544 before, 9544 after; differing 0
ceilings as at v0.51.0
every ratio identical
```

So the Lab's sustained mode left the full-mana grid as Task 4 measured it; with the loads zeroed the whole grid is v0.51.0's, row for row; and the ceilings unloaded are the runes gate's last run exactly (`gate-final`): singles at most 1.79× on one dummy (Linger on a Nova) and 1.95× on the pack (Pierce on a Volley); sets at most 3.78× on the pack (Pierce + Echo + Heavy on a Volley), and on one dummy the five Nova-with-Linger sets over 3.0×, recorded and accepted at v0.51.0 (5.97× at most). `ceilings-unloaded.txt` ends `GATE: FAIL (singles over 0, combos over 5)`: the runes gate's own verdict on those five, unchanged.

`ceilings-loaded.txt`, the loaded full-mana ratios reported beside them, ends `GATE: PASS (singles over 0, combos over 0)`. Its highs are all weapons' blows, which carry no load: singles 1.34× one dummy (Echo on a wand) and 1.80× pack (Widen on an axe); sets 2.95× one (Echo + Saturate + Volatile on a maul) and 3.42× pack (Widen + Echo + Saturate on an axe). The ability forms' best sets read 1.05–1.19× on one dummy and 1.08–1.35× on the pack (Volley's Pierce + Echo + Heavy the highest), and the Ultimates' 0: no runed mana Ultimate can be cast from the depth-10 pool.

If the unloaded grid or ceilings differ from v0.51.0, stop and report: zeroed loads must be v0.51.0 exactly.

### Task 9: Tuning (only if Task 3, 4 or 7 failed)

At the spec's starting loads every gate and rail above holds (measured), so this task changes nothing and has no commit. Use it only if a run disagrees. **Never tune the ceilings, the floor (1.5×), the band (2.0–3.0×) or the pacing rails.**

- [ ] **Step 1: The gate (Task 7) failed: tune in the spec's order, one change at a time, re-running the gate after each**

1. `byForm` for the form that misses (a form whose best set gains less pays less). In `balance.json`, the `"byForm": {}` on the `bySlot` line becomes, say, `"byForm": { "lance": 0.9 }` (steps of 0.05). Its mana per press is 1 + 1.95 × 0.97 × factor, so the band allows factors 0.53–1.05 for the 1.95-raw sets.
2. `bySlot.primary`, if every form misses the same way.
3. `easePerAttune` (and `easeCap`), if supported misses while starved is in its trap: easing moves only the supported side (a starting hero is eased 3%).
4. The rows (`runes.json` `load`) of the runes in the failing sets, keeping each row's × 0.6 / 0.8 / 1 / 1.2 / 1.4 shape.

- [ ] **Step 2: A pacing rail (Task 3's suite, Task 4) failed: re-tune the loads, not the rails**

`bySlot` first (one number a slot), then `easePerAttune`, then the rows of the runes the autopilot socketed most (`rune-use-loads.txt`). After each change: the gate (Task 7, Step 3), the whole engine suite, and the measuring routine with `<stage>` = `tuned`.

- [ ] **Step 3: Keep the tests on the tuned numbers, and commit**

A changed `bySlot`, `byForm`, `easePerAttune` or `easeCap` changes `tests/delve-rune-costs.test.ts`'s "ships delve.runes.load with every slot at 1" expectation; a changed row, its "pins every rune's five loads". Update exactly those, run both suites, then:

```bash
cd /c/Projects/alloy-costs-engine
git add packages/engine/src/data/balance.json packages/engine/src/data/runes.json packages/engine/tests/delve-rune-costs.test.ts
git commit -m "fix(engine): tune rune loads at the gate: <what changed, from → to>" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Then re-run Task 7 (Step 3) and Task 8 (Step 2), and report the first run's breach beside the final numbers. B's tests build their own priced registry, so a tuned row doesn't move them; name any changed row in the report anyway.

- [ ] **Step 4: If no loads meet both the supported floor and the band (or the rails), stop**

Report the numbers (the gate's rows, the rails) to the user through the controller, as the runes gate did. Don't commit a half-tuned state.

### Task 10: Verification, and the report

No edits.

- [ ] **Step 1: Both suites, both typechecks, the gate**

```bash
cd /c/Projects/alloy-costs-engine
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
(cd packages/engine && RUNE_COST_GATE=1 npx vitest run tests/delve-rune-costs-gate.test.ts)
(cd packages/engine && npx tsup) && (cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

Expected: the engine's typecheck prints nothing, and **1634 tests pass and 5 are skipped, in 83 files passed and 1 skipped** (84); the gate passes, 5 tests; the client's typecheck prints nothing and **862 tests pass in 98 files**.

- [ ] **Step 2: Formatting, and nothing stray**

```bash
cd /c/Projects/alloy-costs-engine
npx prettier --check --end-of-line auto packages/engine/src/delve/hero-stats.ts packages/engine/src/arpg/dps-sim.ts packages/engine/tests/delve-rune-power.test.ts packages/engine/tests/delve-rune-sim.test.ts packages/engine/tests/delve-dps-sim.test.ts packages/engine/tests/delve-rune-costs.test.ts packages/engine/tests/delve-rune-costs-gate.test.ts packages/client/src/features/delve/lab/lab-model.ts packages/client/src/pages/DelveLab.tsx packages/client/src/features/delve/lab/__tests__/lab-model.test.ts packages/client/src/pages/__tests__/DelveLab.test.tsx
git status --short
git log --oneline c402ef7..
```

Expected: "All matched files use Prettier code style!"; a clean tree (`balance.json` is never formatted, so it isn't in the list); five commits (Tasks 1, 3, 5, 6 and 7), six with a Task 9 tuning commit.

- [ ] **Step 3: The report**

Hand the controller (for Finish's Task 1 and the spec's **Measured** bullet), from `$S/rune-costs-a/`:

- **The gate** (`gate.txt`): each form's set; its full-mana, starved and supported ratios, loaded and unloaded, on the pack and on one dummy; the mana per press for both builds. As measured: the table in Task 7, Step 3.
- **Tuning:** none (or Task 9's changes, the first breach beside the final numbers).
- **The ceilings** (Task 8): unloaded, v0.51.0's exactly (singles 1.79× one dummy, Linger on a Nova; 1.95× pack, Pierce on a Volley; sets 3.78× pack, Pierce + Echo + Heavy on a Volley; the five one-dummy Nova-with-Linger sets as at v0.51.0, 5.97× at most). Loaded at full mana: singles 1.34× / 1.80×, sets 2.95× / 3.42× (all weapons' blows, which are free); the ability forms' best sets 1.05–1.19× one dummy and 1.08–1.35× pack; the runed mana Ultimates uncastable from the depth-10 pool.
- **Pacing at the three stages:** v0.51.0 (`$S/rune-costs-before/pacing-before.txt`), after Power's pool rule (`pacing-pool.txt`: identical), after the loads (`pacing-loads.txt`), as in Task 4:
  - first dives 3, 3, 3, 3 → the same → the same;
  - dive 6 and dive 12 means 24.25, 36 → 24.25, 36 → 25.75, 35.5;
  - Frost, dive 1 → dive 12: 3.5 → 35.5, then 3.5 → 35.5, then 3.5 → 34.5;
  - legendaries at dive 12: 5.75 → 5.75 → 6.75;
  - the own pair's reaction: 6 of 6 throughout;
  - the 15-pair sweep's median: 24 (21–31) → 24 (21–31) → 25 (18–36; allowed 15.0–40.0);
  - seconds a floor: 29.80 → 29.80 → 30.12;
  - at dive 12 the four seeds' weapons hold 13, 25, 34 and 23 sockets (v0.51.0: 15, 42, 38 and 34), every one socketed (`rune-use-loads.txt`).
- **The grid:** with the loads on, 180 rows move, all runed ability rows (every basic and ability row, every baseline and every weapon's rune row is v0.51.0's); with them zeroed, the whole grid is v0.51.0's.
- **Counts:** engine 1634 passed + 5 skipped in 84 files; client 862 in 98.
