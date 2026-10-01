# Delve Rune Costs, B: the Texts and the Client — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The player sees what a rune costs. `runeText` prices a rune in its move's own payment, eased by the move's attunement ("+25% cost", "+25% charge", "+25% cast wind-up, +25% cost"), and `loadText` is the one formatter. The rune picker and the pouch show each rune's price (the pouch the full, uneased one; a blow and a dimmed rune none). The builder's pay line appends "(runes: …)", a line says "Attunement eases rune cost by N%" ("(the most it can)" at the cap), the pool warning reads the loaded cost, and a mana or cast chain shows "Spends X/s · your build refills Y/s", amber when it spends more.

**Architecture:** Every number comes from step 1's engine: `runeLoad` and the move's `ResolvedAbility.ease` price one rune, `ResolvedAbility.load` the move's total, `manaSupport` the support line. B adds the words in `loot/runes.ts` (`RunePriceTerms`, `runeText`'s fourth argument and `cost`, `loadText`) and the client only shows them. Dormancy keeps one rule, `ResolvedAbility.runes`: the builder and the stop resolve each candidate in its socket (`markIdle` in `chains/chain-text.ts`) and the picker dims it and hides its price, as it does for the current rune.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom with Testing Library), React 19, TailwindCSS v4 (the Delve's own classes).

**Spec:** `docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md` at `6e667e2`: "What each consumer shows or does" (`runeText`, the rune picker, the pouch, the builder's cost line, the mana support readout), "Build → B" and "Testing → Client". The overview is `00-overview.md` in this folder.

---

## Base

- **Starts from:** the controller's commit of step 1 (`01-contract.md`), called `<step-1 merge>` below. B runs beside A in its own worktree; nothing of A's is needed. From step 1, exactly as the spec's "Step 1" gives it:
  - `RuneDef.load: number[]` and `DelveBalance['runes']['load']` (`bySlot`, `byForm`, `charge`, `cast`, `easePerAttune`, `easeCap`), with `bySlot` shipped at 0;
  - `ResolvedAbility.load` (eased, before the payment's conversion) and `ResolvedAbility.ease`, and the loaded `cost`, `chargeNeed` and `channel` from `resolveAbility`;
  - `runeLoad(registry, ref, form)` in `loot/runes.ts` (so it is in the index through `export * from './loot/runes.js'`);
  - `manaSupport(registry, stats, chain)` and `ManaSupport` in the index's named list.
- **Worktree** (the overview's rule; skip it if the controller already made `C:\Projects\alloy-costs-client`). PowerShell; `<step-1 merge>` is the commit the controller names:

```powershell
git -C C:\Projects\Alloy worktree add ..\alloy-costs-client -b costs/client <step-1 merge>
$W = 'C:\Projects\alloy-costs-client'; $R = 'C:\Projects\Alloy'
cmd /c mklink /J "$W\node_modules" "$R\node_modules"
cmd /c mklink /J "$W\packages\engine\node_modules" "$R\packages\engine\node_modules"
New-Item -ItemType Directory -Force "$W\packages\client\node_modules\@alloy" | Out-Null
Get-ChildItem -Force "$R\packages\client\node_modules" | Where-Object Name -ne '@alloy' | ForEach-Object { cmd /c mklink /J "$W\packages\client\node_modules\$($_.Name)" $_.FullName }
cmd /c mklink /J "$W\packages\client\node_modules\@alloy\engine" "$W\packages\engine"
```

  (From Git Bash, `cmd //c mklink /J` can fail with "Invalid switch"; use PowerShell for the links. Remove them with `cmd /c rmdir`, never by deleting through them.)
- **Before Task 1, build step 1's engine into the bundle the client reads, check the contract is there, and measure both suites:**

```bash
cd /c/Projects/alloy-costs-client
(cd packages/engine && npx tsup)
for n in runeLoad loadEase manaSupport ManaSupport; do grep -qw "$n" packages/engine/dist/index.d.ts && echo "$n ok"; done
(cd packages/engine && npx vitest run)
(cd packages/client && npx vitest run && npx tsc --noEmit -p .)
```

  Expected: four `ok` lines; both suites pass and the typecheck prints nothing. HEAD `6e667e2` has 1596 engine tests in 82 files and 860 client tests in 98 files; step 1 adds engine tests (`tests/delve-rune-costs.test.ts`) and no client test, so the client should read 860 in 98. Call the measured counts **M engine tests** and **N client tests in F files**. This area ends at **M + 6** and **N + 13 tests in F + 1 files**.

## Files

| File | Change |
|---|---|
| `packages/engine/src/loot/runes.ts` | `RunePriceTerms`; `runeText`'s fourth argument (`{ payment, ease }`) and its `cost`; `loadText`, the one formatter |
| `packages/engine/tests/delve-runes-contract.test.ts` | the text tests read `effect` and `tradeoff` with `toMatchObject` (a `cost` joins them); the costs block |
| `packages/client/src/features/delve/runes/RunePicker.tsx` | `payment` and `ease` props; a candidate's `dormant`; `RuneEffect` prints `effect · tradeoff · cost`, the cost amber and hidden when dimmed |
| `packages/client/src/features/delve/runes/RunePouchPanel.tsx` | each rune's raw price beside its effect |
| `packages/client/src/features/delve/runes/__tests__/priced-registry.ts` (new) | test helper: the Delve registry priced as the spec ships it, the loads these tests read pinned |
| `packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx` | the raw price in the descriptions; prices per payment, eased; none on a blow or a dimmed rune |
| `packages/client/src/features/delve/runes/__tests__/RunePouchPanel.test.tsx` | the raw price |
| `packages/client/src/features/delve/chains/chain-text.ts` | `markIdle`: a socket's candidates, each marked dormant when resolving the move with it there leaves it out |
| `packages/client/src/features/delve/chains/ChainEditor.tsx` | the picker gets the chain's payment, the move's ease and marked candidates; the mana support line |
| `packages/client/src/features/delve/chains/MoveEditor.tsx` | the readout's "(runes: …)" and its easing line (`rune-ease`) |
| `packages/client/src/features/delve/StopPanel.tsx` | the stop's rune picker gets the saved chain's payment, the saved move's ease and marked candidates |
| `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx` (new) | the builder's prices, dimmed candidates, readout, pool warning and mana support line |
| `packages/client/src/features/delve/__tests__/StopPanel.test.tsx` | the stop's eased price |

`AbilitiesPanel.tsx` and `training/TrainingPanel.tsx` need no change: both render `ChainEditor` with their own `stats` (the Training Grounds' with their extra attunement), so the prices, the easing line and the support line follow.

## Cross-area needs

No edit in another area's files. What the others should know:

1. **Step 1 (`01-contract.md`).** B uses its contract as the spec gives it and adds nothing to it. Two files are shared, and checked against 01's edits:
   - `packages/engine/src/loot/runes.ts`: step 1 adds three type imports around `import type { Rarity } from '../types/gear.js';` and puts `runeLoad` and `loadEase` right after `extraShotPower`, above `num`. B anchors on three places step 1 leaves alone: the line `import type { Blow, FormId, KnobsData, Move } from '../types/ability.js';`, `runeText`'s doc comment and signature, and its `const tradeoff … return { … };` block. `loadText` goes right after `runeText`, so below `loadEase`, as 01 expects. `runeLoad` reads the rune with `getRune`, which `runeText` has already done for the same id.
   - `packages/engine/tests/delve-runes-contract.test.ts`: step 1's only edit is the `bal.runes` pin in `balance: delve.runes` (`shardRange: 4,` and the lines after it; `load: expect.any(Object)`). B's anchors are elsewhere: the `../src/loot/runes.js` import (`extraShotPower,` then `pouchCount,`), four `toEqual({` lines in `rune helpers: text`, and the line opening `rune helpers: sockets and the pouch`.
2. **A (`02-engine.md`).** Nothing to route. B's tests pin the numbers they read (the engine test's `priced`, the client's `pricedRegistry`: every factor 1 and the loads they use from the spec's table), so neither `bySlot` going to 1 nor any tuning of the rows, `byForm`, `charge`, `cast`, `easePerAttune` or `easeCap` moves them. Checked on the scratch copy: with `bySlot` at 1 in `balance.json`, the whole client suite and the contract test still pass.
3. **Finish (`04-finish.md`).** B gives the E2E exactly what 04 reads: `loadText` exported; the pay line's ` (runes: ${loadText(registry, ab.load, ab.payment)})` inside `ability-readout`; the easing line `data-testid="rune-ease"`, inside `ability-readout`, whose whole text is `Attunement eases rune cost by N%`, plus ` (the most it can)` at the cap; the line `data-testid="mana-support"` whose whole text is `` `Spends ${Math.round(spend)}/s · your build refills ${Math.round(refill)}/s` `` from `manaSupport(registry, stats, resolveChain(…))` with the readout's `stats`; `rune-current` and `rune-pick-<id>` holding `runeText(registry, rune, on, { payment, ease }).cost`; `pouch-<id>-<tier>` holding `runeText(registry, rune).cost`. No focusable control is added. One placement to know: the easing line comes after the readout's other lines (after "Fully charged …" on a hold), just above the pool warning, not directly under the pay line, because the readout's lines are a keyed list of strings and this one needs its own test id.
4. **Files outside the spec's list.** B also edits `chains/chain-text.ts` (`markIdle`, beside `runeCandidates`) and adds one test to `__tests__/StopPanel.test.tsx`. No other area touches either.

## Where the spec left room

- **A candidate's dormancy is a flag on the candidate** (`candidates[i].dormant?: boolean`): the spec names only `payment` and `ease` as new picker props, but dimming a candidate needs a per-row mark. `markIdle` sets it by resolving the move with the candidate in the socket (`resolveAbility`, one per candidate), the spec's one rule. A blow's candidates stay unmarked: a blow has no price, and its dormancy was never shown on candidates.
- **Without a move (`on` absent), the picker shows the raw price**, as `runeText`'s no-target branch gives it. Only the picker's own tests render it that way; the builder and the stop always pass `on`.
- **With no `on`, `runeText` still words the price in `terms.payment`** if one is given, and ignores `terms.ease` (no move, no ease).
- **Amber when the shown numbers say so:** the support line compares the two whole numbers it prints, so "Spends 9/s · your build refills 9/s" is never amber.
- **The pouch prints the price after the effect**, in the trade-off's amber, as the picker does.

## Conventions

The overview's shared conventions, plus:
- Run every command from the worktree root, `/c/Projects/alloy-costs-client` (Git Bash). Every command line runs in a subshell, as the 4a plan's do.
- **Line endings:** in a Windows working tree every existing file here is CRLF (`file <path>` says so; `core.autocrlf` is on). The two new files are written LF. Keep each file's own: the edits below keep them, and Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** every existing file here passed `npx prettier --check --end-of-line auto` at `6e667e2`, so each commit block formats exactly the files its task touches. The code below is already formatted (checked on the scratch copy), so `--write` changes nothing typed as written.
- **The edits** use the 4a plan's language ("Replace: … with: …", "Append at the end of the file:", "Create `f`:"). Every anchor is unique in its file at that point; apply each file's edits top to bottom.
- **Checked on a scratch copy.** HEAD `6e667e2` (`git archive`) with a stand-in for step 1 written from the spec's contract before `01-contract.md` was out: `RuneDef.load` and the table's rows, `delve.runes.load` with `bySlot` 0, `runeLoad` and `loadEase` in `loot/runes.ts`, `resolveAbility`'s `load`, `ease` and three prices, and a `manaSupport` in the spec's shape (spend over `useInterval` unbounded, refill regen plus the basics). This plan's text was then applied to it with the controller's `apply2.mjs` (plus its Create blocks), task by task with no mismatch, and every step's FAIL and PASS was run and matched: the engine file 39 → 45 tests and the engine suite 1596 → 1602, the whole client 860 → 863 → 867 → 871 → 873 tests in 98 → 99 files, the typecheck clean after each task, the client build green. Every anchor was then checked against 01's edits to the two shared files (Cross-area needs, 1).
- **Test fixtures.** `pricedRegistry()` (Task 2) sets every load factor to 1 with the spec's easing (0.03 a point, capped at 0.6) and pins the rows these tests read to the spec's table: Split [0.27 … 0.63], Pierce and Linger [0.57 … 1.33], Quick [0.15 … 0.35], Echo [0.27 … 0.63], Heavy [0.33 … 0.77], Leech [0.12 … 0.28]. It edits the shared Delve registry, which each test file has its own copy of. The builder's tests use an unarmed hero (`computeHeroStats({}, registry, { attunement })`): pool 60 + 3 a point of attunement, a medium Primary costs 8 mana (a cast 4, a charge need of 2.8), a heavy mana Nova 78. The starting hero (`resetProfile(1234, 'fire')`) wears a common sword and a common chest: 2 Fire, an ease of 6%.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| The contract test | `(cd packages/engine && npx vitest run tests/delve-runes-contract.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine bundle | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(pnpm -F @alloy/client build)` |

---

## Chunk 1: The words

### Task 1: `runeText` prices a rune in its move's payment; `loadText`

A rune's share of its move's load, eased by the move's ease, in the chain's own words. With no move (the pouch) it is the tier's raw load; on a blow, or where a factor makes it 0, there is none.

**Files:**
- Modify: `packages/engine/src/loot/runes.ts`
- Test: `packages/engine/tests/delve-runes-contract.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-runes-contract.test.ts`:

Replace:

```ts
  extraShotPower,
  pouchCount,
```

with:

```ts
  extraShotPower,
  loadText,
  pouchCount,
```

Replace:

```ts
    expect(text('split', 1)).toEqual({
```

with:

```ts
    expect(text('split', 1)).toMatchObject({
```

Replace:

```ts
    expect(text('quick', 3)).toEqual({
```

with:

```ts
    expect(text('quick', 3)).toMatchObject({
```

Replace:

```ts
    expect(text('heavy', 2)).toEqual({
```

with:

```ts
    expect(text('heavy', 2)).toMatchObject({
```

Replace:

```ts
    expect(text('multishot', 2)).toEqual({
```

with:

```ts
    expect(text('multishot', 2)).toMatchObject({
```

Replace:

```ts
describe('rune helpers: sockets and the pouch', () => {
```

with:

```ts
describe('rune helpers: costs (the rune costs spec)', () => {
  /**
   * A fresh registry whose load factors are all 1, or `over`'s, and whose Echo row is the
   * spec's, so no tuning of the data moves these texts.
   */
  const priced = (over: object = {}) => {
    const r = engine.createDefaultRegistry();
    Object.assign(
      r.getDelveBalance().runes.load,
      { bySlot: { primary: 1, defensive: 1, ultimate: 1 }, byForm: {}, charge: 1, cast: 1 },
      over,
    );
    r.getRune('echo').load = [0.27, 0.36, 0.45, 0.54, 0.63];
    return r;
  };
  const echo3: RuneRef = { id: 'echo', tier: 3 };
  const bolt = { form: 'bolt' } as const;

  it("prices a rune on a move in its chain's payment", () => {
    const r = priced();
    expect(runeText(r, echo3, bolt, { payment: 'mana' }).cost).toBe('+45% cost');
    expect(runeText(r, echo3, bolt, { payment: 'charge' }).cost).toBe('+45% charge');
    expect(runeText(r, echo3, bolt, { payment: 'cast' }).cost).toBe('+45% cast wind-up, +45% cost');
    expect(runeText(r, echo3, bolt).cost).toBe('+45% cost');
  });

  it("shows the eased figure when the move's ease is known, else the raw one", () => {
    const r = priced();
    expect(runeText(r, echo3, bolt, { payment: 'mana', ease: 0.45 }).cost).toBe('+25% cost');
    expect(runeText(r, echo3, bolt, { payment: 'mana', ease: 0 }).cost).toBe('+45% cost');
  });

  it("applies the slot's and the form's factors, and the payment's conversions", () => {
    const r = priced({
      bySlot: { primary: 0.5, defensive: 1, ultimate: 1 },
      byForm: { bolt: 4 },
      charge: 2,
      cast: 2,
    });
    expect(runeText(r, echo3, bolt, { payment: 'mana' }).cost).toBe('+90% cost');
    const nova = { form: 'nova' } as const;
    expect(runeText(r, echo3, nova, { payment: 'mana' }).cost).toBe('+45% cost');
    expect(runeText(r, echo3, nova, { payment: 'charge' }).cost).toBe('+90% charge');
    expect(runeText(r, echo3, nova, { payment: 'cast' }).cost).toBe('+90% cast wind-up, +45% cost');
  });

  it("prices the pouch (no target) at its tier's raw load: no factor, no ease", () => {
    const r = priced({ bySlot: { primary: 0, defensive: 0, ultimate: 0 }, byForm: { bolt: 4 } });
    expect(runeText(r, echo3).cost).toBe('+45% cost');
    expect(runeText(r, { id: 'echo', tier: 5 }, undefined, { ease: 0.6 }).cost).toBe('+63% cost');
  });

  it('names no cost on a blow, nor where the share comes to 0', () => {
    const r = priced({ bySlot: { primary: 0, defensive: 1, ultimate: 1 } });
    const blow = { weapon: 'sword', kind: 'heavy' } as const;
    expect(runeText(r, echo3, blow, { payment: 'mana' }).cost).toBeNull();
    expect(runeText(r, echo3, bolt, { payment: 'mana' }).cost).toBeNull();
    expect(runeText(r, echo3, { form: 'nova' }, { payment: 'mana' }).cost).toBe('+45% cost');
  });

  it("words a move's total load by its payment, in whole percentages", () => {
    const r = priced();
    expect(loadText(r, 1.0725, 'mana')).toBe('+107% cost');
    expect(loadText(r, 1.0725)).toBe('+107% cost');
    expect(loadText(r, 1.0725, 'charge')).toBe('+107% charge');
    expect(loadText(r, 1.0725, 'cast')).toBe('+107% cast wind-up, +107% cost');
  });
});

describe('rune helpers: sockets and the pouch', () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-runes-contract.test.ts)`
Expected: FAIL, 6 failed (the new block) and the rest pass (39 at the scratch copy's base): `expected undefined to be '+45% cost'` (the payment and the pouch tests), `expected undefined to be '+25% cost'` (the ease), `expected undefined to be '+90% cost'` (the factors), `expected undefined to be null` (the blow) and `(0 , loadText) is not a function`. The `toMatchObject` tests pass either way.

- [ ] **Step 3: Price the rune and add the formatter**

In `packages/engine/src/loot/runes.ts`:

Replace:

```ts
import type { Blow, FormId, KnobsData, Move } from '../types/ability.js';
```

with:

```ts
import type { AbilityPayment, Blow, FormId, KnobsData, Move } from '../types/ability.js';
```

Replace:

```ts
/**
 * A rune's effect and trade-off at its tier, as the player reads them. With
 * `on`, the numbers are the move's (Multi-shot's cut halved on a Volley, gone
 * on a Barrage), and a trade-off that comes to no change is null.
 */
export function runeText(
  registry: DataRegistry,
  ref: RuneRef,
  on?: RuneTarget,
): { effect: string; tradeoff: string | null } {
```

with:

```ts
/** A move's price terms, which a rune's cost reads (see the rune costs spec). */
export interface RunePriceTerms {
  /** The chain's payment: the words. */
  payment?: AbilityPayment;
  /** The move's `ResolvedAbility.ease`: the eased figure. Absent: the raw figure. */
  ease?: number;
}

/**
 * A rune's effect, trade-off and cost at its tier, as the player reads them.
 * With `on`, the numbers are the move's (Multi-shot's cut halved on a Volley,
 * gone on a Barrage), and a trade-off that comes to no change is null. The
 * cost is the rune's share of the move's load (`runeLoad`, eased by
 * `terms.ease`) in the payment's words (`loadText`); with no `on` (the pouch),
 * its tier's raw load; null on a blow (blows are free) and at a 0 share. It
 * doesn't know dormancy: the caller hides the cost wherever it dims the rune.
 */
export function runeText(
  registry: DataRegistry,
  ref: RuneRef,
  on?: RuneTarget,
  terms: RunePriceTerms = {},
): { effect: string; tradeoff: string | null; cost: string | null } {
```

Replace:

```ts
  const tradeoff = def.tradeoff === null ? null : fill(registry, def.tradeoff, knobs);
  return {
    effect: fill(registry, def.effect, knobs).text,
    tradeoff: tradeoff?.change ? tradeoff.text : null,
  };
}
```

with:

```ts
  const tradeoff = def.tradeoff === null ? null : fill(registry, def.tradeoff, knobs);
  const share = !on
    ? def.load[ref.tier - 1]
    : 'form' in on
      ? runeLoad(registry, ref, on.form) * (1 - (terms.ease ?? 0))
      : 0;
  return {
    effect: fill(registry, def.effect, knobs).text,
    tradeoff: tradeoff?.change ? tradeoff.text : null,
    cost: share > 0 ? loadText(registry, share, terms.payment) : null,
  };
}

/**
 * A load as the player reads it, in the payment's own terms and whole
 * percentages: "+25% cost" (mana, or no payment known), "+25% charge" (× the
 * `charge` conversion), "+25% cast wind-up, +25% cost" (× `cast`, then the
 * load). The one formatter, for a rune's share and for a move's total.
 */
export function loadText(registry: DataRegistry, load: number, payment?: AbilityPayment): string {
  const c = registry.getDelveBalance().runes.load;
  const pct = (x: number) => `+${Math.round(x * 100)}%`;
  if (payment === 'charge') return `${pct(load * c.charge)} charge`;
  if (payment === 'cast') return `${pct(load * c.cast)} cast wind-up, ${pct(load)} cost`;
  return `${pct(load)} cost`;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-runes-contract.test.ts)`
Expected: PASS, every test (45 at the scratch copy's base).

- [ ] **Step 5: The whole engine, then the bundle and the client**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 6 tests pass, the pacing rails among them (no number moves: nothing in the sim reads `runeText`).

Run: `(cd packages/engine && npx tsup) && (cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: tsup's "Build success" lines; then no type errors and N tests pass in F files (the client reads `effect` and `tradeoff` only, so nothing changes yet).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-costs-client
(cd packages/engine && npx prettier --write --end-of-line auto src/loot/runes.ts tests/delve-runes-contract.test.ts)
git add packages/engine/src/loot/runes.ts packages/engine/tests/delve-runes-contract.test.ts
git commit -m "feat(engine): runeText prices a rune in its move's payment, eased; loadText words a load" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The picker and the pouch

### Task 2: The picker and the pouch show each rune's price

The picker prints `effect · tradeoff · cost`, the cost in the trade-off's amber, in the payment and ease it is given; a dimmed rune (the current one when dormant, or a candidate marked `dormant`) shows none. The pouch prints each rune's raw price.

**Files:**
- Create: `packages/client/src/features/delve/runes/__tests__/priced-registry.ts`
- Modify: `packages/client/src/features/delve/runes/RunePicker.tsx`
- Modify: `packages/client/src/features/delve/runes/RunePouchPanel.tsx`
- Test: `packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx`
- Test: `packages/client/src/features/delve/runes/__tests__/RunePouchPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/features/delve/runes/__tests__/priced-registry.ts`:

```ts
import type { DataRegistry } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';

/** The rows of the rune costs spec's load table these tests read, tiers I to V. */
const LOADS: Record<string, number[]> = {
  split: [0.27, 0.36, 0.45, 0.54, 0.63],
  pierce: [0.57, 0.76, 0.95, 1.14, 1.33],
  quick: [0.15, 0.2, 0.25, 0.3, 0.35],
  echo: [0.27, 0.36, 0.45, 0.54, 0.63],
  heavy: [0.33, 0.44, 0.55, 0.66, 0.77],
  linger: [0.57, 0.76, 0.95, 1.14, 1.33],
  leech: [0.12, 0.16, 0.2, 0.24, 0.28],
};

/**
 * The Delve registry with runes priced as the rune costs spec ships them (step 1 ships every
 * slot's factor at 0) and the loads above pinned, so tuning the data never moves these tests.
 * It edits the shared registry, which each test file has its own of: call it at the top of
 * the file, or in the one test that needs it.
 */
export function pricedRegistry(): DataRegistry {
  const registry = getDelveRegistry();
  Object.assign(registry.getDelveBalance().runes.load, {
    bySlot: { primary: 1, defensive: 1, ultimate: 1 },
    byForm: {},
    charge: 1,
    cast: 1,
    easePerAttune: 0.03,
    easeCap: 0.6,
  });
  for (const [id, load] of Object.entries(LOADS)) registry.getRune(id).load = load;
  return registry;
}
```

In `packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx`:

Replace:

```tsx
import { runeText, type RuneRef } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { RunePicker, type RunePickerProps } from '../RunePicker';

const registry = getDelveRegistry();
```

with:

```tsx
import { runeText, type RuneRef } from '@alloy/engine';
import { RunePicker, type RunePickerProps } from '../RunePicker';
import { pricedRegistry } from './priced-registry';

const registry = pricedRegistry();
```

Replace:

```tsx
const quick3: RuneRef = { id: 'quick', tier: 3 };
```

with:

```tsx
const quick3: RuneRef = { id: 'quick', tier: 3 };
const heavy3: RuneRef = { id: 'heavy', tier: 3 };
const bolt = { form: 'bolt' } as const;
```

Replace:

```tsx
  it('lists each fitting rune with its count, its effect and its trade-off; a pick picks and closes', () => {
```

with:

```tsx
  it('lists each fitting rune with its count, its effect, its trade-off and its raw price; a pick picks and closes', () => {
```

Replace:

```tsx
    expect(screen.getByRole('button', { name: 'Split I ×2' })).toHaveAccessibleDescription(
      'Splits into 2 shards on hit, each at 30% power',
    );
```

with:

```tsx
    expect(screen.getByRole('button', { name: 'Split I ×2' })).toHaveAccessibleDescription(
      'Splits into 2 shards on hit, each at 30% power · +27% cost',
    );
```

Replace:

```tsx
      `${q.effect} · ${q.tradeoff}`,
```

with:

```tsx
      `${q.effect} · ${q.tradeoff} · +25% cost`,
```

Replace:

```tsx
    expect(row).toHaveAccessibleDescription('Splits into 3 shards on hit, each at 45% power');
```

with:

```tsx
    expect(row).toHaveAccessibleDescription(
      'Splits into 3 shards on hit, each at 45% power · +54% cost',
    );
```

Replace:

```tsx
    expect(screen.getByTestId('rune-none')).toHaveTextContent(
      'No rune in your pouch fits this move.',
    );
  });
});
```

with:

```tsx
    expect(screen.getByTestId('rune-none')).toHaveTextContent(
      'No rune in your pouch fits this move.',
    );
  });

  it("prices a rune after its effect and trade-off, in its chain's payment, eased by the move's ease", () => {
    const h = runeText(registry, heavy3, bolt);
    const words = (cost: string) => `${h.effect} · ${h.tradeoff} · ${cost}`;
    const row = () => screen.getByRole('button', { name: 'Heavy III ×1' });
    const picker = (terms: Pick<RunePickerProps, 'payment' | 'ease'>) => (
      <RunePicker
        candidates={[{ rune: heavy3, count: 1 }]}
        on={bolt}
        onPick={() => {}}
        onClose={() => {}}
        {...terms}
      />
    );
    const { rerender } = render(picker({ payment: 'mana' }));
    expect(row()).toHaveAccessibleDescription(words('+55% cost'));
    expect(screen.getByText('+55% cost')).toHaveClass('text-amber-200/80');
    rerender(picker({ payment: 'charge' }));
    expect(row()).toHaveAccessibleDescription(words('+55% charge'));
    rerender(picker({ payment: 'cast' }));
    expect(row()).toHaveAccessibleDescription(words('+55% cast wind-up, +55% cost'));
    rerender(picker({ payment: 'mana', ease: 0.45 }));
    expect(row()).toHaveAccessibleDescription(words('+30% cost'));
  });

  it('shows no price on a blow, nor for a dimmed rune: the current one or a candidate', () => {
    const { rerender } = render(
      <RunePicker
        candidates={[{ rune: heavy3, count: 1 }]}
        on={{ weapon: 'sword', kind: 'heavy' }}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('rune-pick-heavy')).not.toHaveTextContent('% cost');
    rerender(
      <RunePicker
        candidates={[
          { rune: { id: 'pierce', tier: 1 }, count: 1, dormant: true },
          { rune: heavy3, count: 1 },
        ]}
        current={{ id: 'pierce', tier: 3 }}
        dormant
        on={bolt}
        payment="mana"
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('rune-current')).not.toHaveTextContent('% cost');
    expect(screen.getByRole('img', { name: 'Pierce I, dormant' })).toBeInTheDocument();
    expect(screen.getByTestId('rune-pick-pierce')).not.toHaveTextContent('% cost');
    expect(screen.getByTestId('rune-pick-heavy')).toHaveTextContent('+55% cost');
  });
});
```

In `packages/client/src/features/delve/runes/__tests__/RunePouchPanel.test.tsx`:

Replace:

```tsx
import { RunePouchPanel } from '../RunePouchPanel';
```

with:

```tsx
import { RunePouchPanel } from '../RunePouchPanel';
import { pricedRegistry } from './priced-registry';
```

Replace:

```tsx
  it('an empty pouch says where runes come from', () => {
```

with:

```tsx
  it('prices each rune beside its effect: its full load, uneased (no move known)', () => {
    pricedRegistry();
    panel();
    expect(screen.getByTestId('pouch-split-1')).toHaveTextContent(
      'Splits into 2 shards on hit, each at 30% power · +27% cost',
    );
    expect(screen.getByTestId('pouch-split-3')).toHaveTextContent('+45% cost');
    expect(screen.getByText('+35% cost')).toHaveClass('text-amber-200/80'); // Quick V
  });

  it('an empty pouch says where runes come from', () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/runes)`
Expected: FAIL, 5 failed and 19 passed (24): the pouch's `toHaveTextContent()` (its row reads "…each at 30% powerFuse 3 → 1 · ⚙ 20", no price), three picker `toHaveAccessibleDescription()` failures (the Split I and Split IV rows and the new Heavy III row, each without a price), and `Unable to find an accessible element with the role "img" and name "Pierce I, dormant"`. (The typecheck fails too until Step 3: the candidates' `dormant` and the `payment` and `ease` props don't exist yet. Vitest doesn't type-check.)

- [ ] **Step 3: Show the price**

In `packages/client/src/features/delve/runes/RunePicker.tsx`:

Replace:

```tsx
import { runeText, type RuneRef, type RuneTarget, type RuneTier } from '@alloy/engine';
```

with:

```tsx
import {
  runeText,
  type AbilityPayment,
  type RunePriceTerms,
  type RuneRef,
  type RuneTarget,
  type RuneTier,
} from '@alloy/engine';
```

Replace:

```tsx
  /** Runes that fit the move and aren't on it; count null = unlimited (Training Grounds). */
  candidates: readonly { rune: RuneRef; count: number | null }[];
```

with:

```tsx
  /**
   * Runes that fit the move and aren't on it; count null = unlimited (Training Grounds);
   * dormant: it would do nothing in this socket (dimmed, with no price).
   */
  candidates: readonly { rune: RuneRef; count: number | null; dormant?: boolean }[];
```

Replace:

```tsx
  /** The current rune does nothing on this move now: dimmed, with its reason. */
  dormant?: boolean;
```

with:

```tsx
  /** The current rune does nothing on this move now: dimmed, with its reason. */
  dormant?: boolean;
  /** The chain's payment: each price in its words (the basic chain has none). */
  payment?: AbilityPayment;
  /** The move's `ResolvedAbility.ease`: each price eased by it. */
  ease?: number;
```

Replace:

```tsx
/** A rune's effect and its trade-off, as the engine words them at its tier (and on its move). */
function RuneEffect({ rune, on, id }: { rune: RuneRef; on?: RuneTarget; id?: string }) {
  const { effect, tradeoff } = runeText(getDelveRegistry(), rune, on);
  return (
    <span id={id} className="text-[11px] leading-snug text-stone-400">
      {effect}
      {tradeoff && ' · '}
      {tradeoff && <span className="text-amber-200/80">{tradeoff}</span>}
    </span>
  );
}
```

with:

```tsx
/**
 * A rune's effect, its trade-off and its price, as the engine words them at its tier (and on
 * its move, in its chain's payment, eased by the move's ease). A dimmed rune shows no price.
 */
function RuneEffect({
  rune,
  on,
  terms,
  dimmed = false,
  id,
}: {
  rune: RuneRef;
  on?: RuneTarget;
  terms: RunePriceTerms;
  dimmed?: boolean;
  id?: string;
}) {
  const { effect, tradeoff, cost } = runeText(getDelveRegistry(), rune, on, terms);
  const price = dimmed ? null : cost;
  return (
    <span id={id} className="text-[11px] leading-snug text-stone-400">
      {effect}
      {tradeoff && ' · '}
      {tradeoff && <span className="text-amber-200/80">{tradeoff}</span>}
      {price && ' · '}
      {price && <span className="text-amber-200/80">{price}</span>}
    </span>
  );
}
```

Replace:

```tsx
 * the runes that fit the move and aren't on it, each with its effect and
 * trade-off at its tier and its count. The Training Grounds pick the tier here
```

with:

```tsx
 * the runes that fit the move and aren't on it, each with its effect,
 * trade-off and price at its tier and its count (a rune that would do nothing
 * there dimmed, with no price). The Training Grounds pick the tier here
```

Replace:

```tsx
  dormant = false,
  onPick,
```

with:

```tsx
  dormant = false,
  payment,
  ease,
  onPick,
```

Replace:

```tsx
  const [tier, setTier] = useState<RuneTier>(1);
```

with:

```tsx
  const [tier, setTier] = useState<RuneTier>(1);
  const terms: RunePriceTerms = { payment, ease };
```

Replace:

```tsx
        .map((c) => ({ rune: { id: c.rune.id, tier }, count: c.count }))
```

with:

```tsx
        .map((c) => ({ rune: { id: c.rune.id, tier }, count: c.count, dormant: c.dormant }))
```

Replace:

```tsx
              <RuneEffect rune={current} on={on} />
```

with:

```tsx
              <RuneEffect rune={current} on={on} terms={terms} dimmed={dormant} />
```

Replace:

```tsx
          {rows.map(({ rune, count }) => {
```

with:

```tsx
          {rows.map(({ rune, count, dormant: idle }) => {
```

Replace:

```tsx
                  <RuneGlyph rune={rune} />
                  <span className="flex-1">{runeName(registry, rune)}</span>
```

with:

```tsx
                  <RuneGlyph rune={rune} dormant={idle} />
                  <span className="flex-1">{runeName(registry, rune)}</span>
```

Replace:

```tsx
                <RuneEffect rune={rune} on={on} id={`${id}-${key}`} />
```

with:

```tsx
                <RuneEffect rune={rune} on={on} terms={terms} dimmed={idle} id={`${id}-${key}`} />
```

In `packages/client/src/features/delve/runes/RunePouchPanel.tsx`:

Replace:

```tsx
 * The Forge tab's runes: every rune held, by tier, with its count and effect,
 * and Fuse 3 → 1 at its scrap price where enough are held (never at tier V).
```

with:

```tsx
 * The Forge tab's runes: every rune held, by tier, with its count, effect and
 * raw price (its full load: no move, no ease), and Fuse 3 → 1 at its scrap
 * price where enough are held (never at tier V).
```

Replace:

```tsx
        const short = price !== null && price > scrap;
```

with:

```tsx
        const short = price !== null && price > scrap;
        const text = runeText(registry, rune);
```

Replace:

```tsx
              <span className="text-[11px] leading-snug text-stone-400">
                {runeText(registry, rune).effect}
              </span>
```

with:

```tsx
              <span className="text-[11px] leading-snug text-stone-400">
                {text.effect}
                {text.cost && ' · '}
                {text.cost && <span className="text-amber-200/80">{text.cost}</span>}
              </span>
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/runes)`
Expected: PASS, 24 tests in 5 files.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 3 tests pass in F files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-costs-client
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/runes)
git add packages/client/src/features/delve/runes
git commit -m "feat(client): the rune picker and the pouch show each rune's price" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The builder

### Task 3: The builder and the stop price runes by the chain's payment and the move's ease

The builder passes the edited chain's payment (none for the basic chain) and the move's `ResolvedAbility.ease`; the stop passes the saved chain's and the saved move's (resolved from `profileStats`). Both mark each candidate that would do nothing in the socket (`markIdle`), so the picker dims it and hides its price.

**Files:**
- Modify: `packages/client/src/features/delve/chains/chain-text.ts`
- Modify: `packages/client/src/features/delve/chains/ChainEditor.tsx`
- Modify: `packages/client/src/features/delve/StopPanel.tsx`
- Create: `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx`
- Test: `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  computeHeroStats,
  defaultChains,
  type AbilityPayment,
  type Chains,
  type HeroStats,
  type ManaType,
  type Move,
  type RunePouch,
} from '@alloy/engine';
import { ChainEditor } from '../ChainEditor';
import { pricedRegistry } from '../../runes/__tests__/priced-registry';

const registry = pricedRegistry();

/** An unarmed hero with this attunement and no other (its pool is 60 + 3 a point). */
const hero = (attunement: Partial<Record<ManaType, number>>) =>
  computeHeroStats({}, registry, { attunement });

/**
 * The builder over a Primary of `primary` paid with `payment` (the other chains the defaults,
 * or `over`'s), for a hero with 15 Fire unless `stats` says, with sockets on every move and a
 * pouch of `pouch`. It is controlled: rerender it with new props.
 */
function editor({
  primary,
  payment = 'mana',
  stats = hero({ fire: 15 }),
  pouch = {},
  over = {},
}: {
  primary: Move[];
  payment?: AbilityPayment;
  stats?: HeroStats;
  pouch?: RunePouch;
  over?: Partial<Chains>;
}) {
  const chains: Chains = {
    ...defaultChains(registry, 'fire', null),
    primary: { moves: primary, payment },
    ...over,
  };
  return (
    <ChainEditor
      chains={chains}
      caps={{ basic: 5, primary: 5, defensive: 5, ultimate: 5 }}
      stats={stats}
      reactionsSeen={[]}
      locked={false}
      onChange={() => {}}
      runes={{
        pouch,
        socketCap: 3,
        socketPrice: () => null,
        weaponBaseId: 'sword',
        pullText: () => 'Pull',
      }}
    />
  );
}

const bolt = (element: ManaType): Move => ({
  kind: 'medium',
  form: 'bolt',
  elements: [element],
  runes: [null],
});
const tapSocket = () =>
  fireEvent.click(
    within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: empty' }),
  );
const picker = () => within(screen.getByTestId('rune-picker'));

describe("the builder's rune picker: prices", () => {
  const pouch: RunePouch = { heavy: [0, 0, 1, 0, 0], pierce: [0, 0, 1, 0, 0] };

  it("prices each candidate in the chain's payment, eased by the move's attunement", () => {
    const { rerender } = render(editor({ primary: [bolt('fire')], pouch }));
    tapSocket();
    // Heavy III's 0.55 and Pierce III's 0.95, eased 45% by 15 Fire.
    expect(picker().getByTestId('rune-pick-heavy')).toHaveTextContent('+30% cost');
    expect(picker().getByTestId('rune-pick-pierce')).toHaveTextContent('+52% cost');
    rerender(editor({ primary: [bolt('fire')], payment: 'charge', pouch }));
    expect(picker().getByTestId('rune-pick-heavy')).toHaveTextContent('+30% charge');
    rerender(editor({ primary: [bolt('fire')], stats: hero({}), pouch }));
    expect(picker().getByTestId('rune-pick-heavy')).toHaveTextContent('+55% cost');
  });

  it('dims a candidate that would do nothing in the socket, with no price: a Pierce on an Earth Bolt', () => {
    render(editor({ primary: [bolt('earth')], stats: hero({ earth: 15 }), pouch }));
    tapSocket();
    expect(picker().getByRole('img', { name: 'Pierce III, dormant' })).toBeInTheDocument();
    expect(picker().getByTestId('rune-pick-pierce')).not.toHaveTextContent('% cost');
    expect(picker().getByTestId('rune-pick-heavy')).toHaveTextContent('+30% cost');
  });

  it("shows no price on a blow's socket: blows are free", () => {
    const basic = defaultChains(registry, 'fire', null).basic.map((b) => ({ ...b, runes: [null] }));
    render(editor({ primary: [bolt('fire')], pouch, over: { basic } }));
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    tapSocket();
    expect(picker().getByTestId('rune-pick-heavy')).not.toHaveTextContent('% cost');
  });
});
```

In `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`:

Replace:

```tsx
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
```

with:

```tsx
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import { pricedRegistry } from '../runes/__tests__/priced-registry';
```

Replace:

```tsx
  it("Escape closes the rune picker, not the stop's", () => {
```

with:

```tsx
  it("prices a rune in the saved chain's payment, eased by the move's attunement", () => {
    pricedRegistry();
    const picker = atRuneStop();
    // Split I's 0.27, eased 6% by the starting sword's and chest's 2 Fire.
    expect(picker.getByTestId('rune-pick-split')).toHaveTextContent('+25% cost');
  });

  it("Escape closes the rune picker, not the stop's", () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/chains src/features/delve/__tests__/StopPanel.test.tsx)`
Expected: FAIL, 3 failed and 12 passed (15): the first builder test's `toHaveTextContent()` (Heavy III reads "+55% cost": no ease is passed yet), `Unable to find an accessible element with the role "img" and name "Pierce III, dormant"`, and the stop's `toHaveTextContent()` (Split I reads "+27% cost"). The blow test passes already: a blow was never priced.

- [ ] **Step 3: Pass the payment, the ease and the marked candidates**

In `packages/client/src/features/delve/chains/chain-text.ts`:

Replace:

```ts
import {
  runeFits,
  type ChainSkill,
  type DataRegistry,
  type ManaType,
```

with:

```ts
import {
  resolveAbility,
  runeFits,
  socketsOf,
  type AbilitySlot,
  type Chain,
  type ChainSkill,
  type DataRegistry,
  type HeroStats,
  type ManaType,
```

Replace:

```ts
/** Runes counted by id and tier, in the order first seen: [{ Quick I, 1 }, { Split III, 2 }]. */
```

with:

```ts
/**
 * `candidates` for socket `at.socket` of move `at.index` of an ability's chain, each marked
 * dormant when it would do nothing there: resolving the move with it in the socket leaves it out
 * of `ResolvedAbility.runes` (a Pierce on an Earth Bolt), the rule the builder's dormant marks
 * follow. The picker dims it and shows no price. A blow's (`at` null) stay unmarked: blows are free.
 */
export function markIdle(
  registry: DataRegistry,
  stats: HeroStats,
  at: { slot: AbilitySlot; chain: Chain; index: number; socket: number } | null,
  candidates: readonly { rune: RuneRef; count: number | null }[],
): { rune: RuneRef; count: number | null; dormant: boolean }[] {
  return candidates.map((c) => {
    if (!at) return { ...c, dormant: false };
    const move = at.chain.moves[at.index];
    const runes = socketsOf(move).map((r, k) => (k === at.socket ? c.rune : r));
    const ab = resolveAbility(registry, at.slot, { ...move, runes }, at.chain.payment, stats);
    return { ...c, dormant: !ab.runes.some((r) => r.id === c.rune.id) };
  });
}

/** Runes counted by id and tier, in the order first seen: [{ Quick I, 1 }, { Split III, 2 }]. */
```

In `packages/client/src/features/delve/chains/ChainEditor.tsx`:

Replace:

```tsx
import { KIND_ICON, SKILL_NAME, blowText, chainText, moveText, runeCandidates } from './chain-text';
```

with:

```tsx
import {
  KIND_ICON,
  SKILL_NAME,
  blowText,
  chainText,
  markIdle,
  moveText,
  runeCandidates,
} from './chain-text';
```

Replace:

```tsx
          candidates={runeCandidates(
            registry,
            runeTargetOf(runes.weaponBaseId, move),
            sockets.filter((_, k) => k !== socket),
            runes.pouch,
          )}
```

with:

```tsx
          candidates={markIdle(
            registry,
            stats,
            slot && chain ? { slot, chain, index, socket } : null,
            runeCandidates(
              registry,
              runeTargetOf(runes.weaponBaseId, move),
              sockets.filter((_, k) => k !== socket),
              runes.pouch,
            ),
          )}
```

Replace:

```tsx
          dormant={dormant(index).includes(socket)}
```

with:

```tsx
          dormant={dormant(index).includes(socket)}
          payment={chain?.payment}
          ease={resolved?.moves[index]?.ease}
```

In `packages/client/src/features/delve/StopPanel.tsx`:

Replace:

```tsx
import { SKILL_NAME, blowText, moveText, runeCandidates } from './chains/chain-text';
```

with:

```tsx
import { SKILL_NAME, blowText, markIdle, moveText, runeCandidates } from './chains/chain-text';
```

Replace:

```tsx
  const picked = at && rows.find((r) => r.skill === at.skill && r.index === at.index);
```

with:

```tsx
  const picked = at && rows.find((r) => r.skill === at.skill && r.index === at.index);
  // An ability move's saved chain: its payment and the move's ease price the runes (a blow has neither).
  const ability =
    at && picked && picked.skill !== 'basic'
      ? { slot: picked.skill, chain: chains[picked.skill]! }
      : null;
```

Replace:

```tsx
          candidates={runeCandidates(
            registry,
            runeTargetOf(weapon.baseId, picked.move),
            socketsOf(picked.move),
            profile.runes,
          )}
          on={runeTargetOf(weapon.baseId, picked.move)}
```

with:

```tsx
          candidates={markIdle(
            registry,
            stats,
            ability && { ...ability, index: at.index, socket: at.socket },
            runeCandidates(
              registry,
              runeTargetOf(weapon.baseId, picked.move),
              socketsOf(picked.move),
              profile.runes,
            ),
          )}
          on={runeTargetOf(weapon.baseId, picked.move)}
          payment={ability?.chain.payment}
          ease={
            ability
              ? resolveChain(registry, stats, ability.slot, ability.chain).moves[at.index].ease
              : undefined
          }
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/chains src/features/delve/__tests__/StopPanel.test.tsx)`
Expected: PASS, 15 tests in 2 files.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 7 tests pass in F + 1 files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-costs-client
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/chains src/features/delve/StopPanel.tsx src/features/delve/__tests__/StopPanel.test.tsx)
git add packages/client/src/features/delve/chains packages/client/src/features/delve/StopPanel.tsx packages/client/src/features/delve/__tests__/StopPanel.test.tsx
git commit -m "feat(client): the builder and the stop price runes by the chain's payment and the move's ease, and dim the idle ones" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: The readout's runes note and easing line

The pay line already reads the loaded `cost`, `chargeNeed` and `castTime`; it appends the move's eased load in the payment's words. When runes act and the move's attunement eases them, a line says by how much, and at the cap that it can't do more. The pool warning reads the loaded cost unchanged; a test pins it.

**Files:**
- Modify: `packages/client/src/features/delve/chains/MoveEditor.tsx`
- Test: `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx`:

Append at the end of the file:

```tsx
describe("the readout's rune price", () => {
  /** A Fire Bolt of `kind` holding Echo, Heavy and Linger III: a raw load of 1.95. */
  const runed = (kind: Move['kind'] = 'medium'): Move => ({
    kind,
    form: 'bolt',
    elements: ['fire'],
    runes: [
      { id: 'echo', tier: 3 },
      { id: 'heavy', tier: 3 },
      { id: 'linger', tier: 3 },
    ],
  });
  const readout = () => screen.getByTestId('ability-readout');
  const payLine = () => within(readout()).getByText(/runes:/);

  it("adds the runes' eased load to the pay line, in the payment's words", () => {
    // 1.95 eased 45% by 15 Fire: 1.0725, so 8 mana → 17, charge 2.8 → 6, cast 4 → 8.
    const { rerender } = render(editor({ primary: [runed()] }));
    expect(payLine()).toHaveTextContent(/^17 mana · [\d.]+s wind-up \(runes: \+107% cost\) · /);
    rerender(editor({ primary: [runed()], payment: 'charge' }));
    expect(payLine()).toHaveTextContent(
      /^Charge 6 · [\d.]+s wind-up \(runes: \+107% charge\) · no cooldown/,
    );
    rerender(editor({ primary: [runed()], payment: 'cast' }));
    expect(payLine()).toHaveTextContent(
      /^8 mana · [\d.]+s wind-up \(runes: \+107% cast wind-up, \+107% cost\) · /,
    );
  });

  it('says how much attunement eases the runes, and when that is the most it can', () => {
    const { rerender } = render(editor({ primary: [runed()] }));
    expect(within(readout()).getByTestId('rune-ease')).toHaveTextContent(
      /^Attunement eases rune cost by 45%$/,
    );
    rerender(editor({ primary: [runed()], stats: hero({ fire: 25 }) }));
    expect(screen.getByTestId('rune-ease')).toHaveTextContent(
      /^Attunement eases rune cost by 60% \(the most it can\)$/,
    );
    expect(payLine()).toHaveTextContent('(runes: +78% cost)');
    rerender(editor({ primary: [runed()], stats: hero({}) }));
    expect(payLine()).toHaveTextContent('(runes: +195% cost)');
    expect(screen.queryByTestId('rune-ease')).toBeNull();
  });

  it('names no runes and no easing for a move without runes', () => {
    render(editor({ primary: [{ kind: 'medium', form: 'bolt', elements: ['fire'] }] }));
    expect(readout()).toHaveTextContent('8 mana');
    expect(readout()).not.toHaveTextContent('runes:');
    expect(screen.queryByTestId('rune-ease')).toBeNull();
  });

  it('warns when the loaded cost is more than the pool', () => {
    // A heavy mana Nova (78) with Leech I at 2 Fire: 78 × (1 + 0.12 × 0.94) = 86.8; pool 66.
    const nova: Move = {
      kind: 'heavy',
      form: 'nova',
      elements: ['fire'],
      runes: [{ id: 'leech', tier: 1 }],
    };
    render(
      editor({
        primary: [bolt('fire')],
        stats: hero({ fire: 2 }),
        over: { ultimate: { moves: [nova], payment: 'mana' } },
      }),
    );
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    expect(screen.getByTestId('cost-warning')).toHaveTextContent(
      'Needs 87 mana; your pool holds 66.',
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/chains)`
Expected: FAIL, 2 failed and 5 passed (7): `Unable to find an element with the text: /runes:/` and `Unable to find an element by: [data-testid="rune-ease"]`. The no-runes test and the pool warning pass already: the warning reads the loaded cost with no change.

- [ ] **Step 3: Add the note and the line**

In `packages/client/src/features/delve/chains/MoveEditor.tsx`:

Replace:

```tsx
  holdFull,
  moveBeat,
```

with:

```tsx
  holdFull,
  loadText,
  moveBeat,
```

Replace:

```tsx
/**
 * Plain-language numbers for a resolved move (at its place in the chain) and
 * the beat after it; a hold's full charge too, with its time and its beat (by
 * the weapon's tempo).
 */
```

with:

```tsx
/**
 * Plain-language numbers for a resolved move (at its place in the chain) and
 * the beat after it; a hold's full charge too, with its time and its beat (by
 * the weapon's tempo). The price carries its runes' share (eased by the move's
 * attunement, which a line says), and a mana cost the pool can't hold warns.
 */
```

Replace:

```tsx
  const windup = ab.castTime > 0 ? ` · ${ab.castTime.toFixed(2)}s wind-up` : '';
  const pay =
    ab.payment === 'charge'
      ? `Charge ${Math.round(ab.chargeNeed)}${windup}`
      : `${Math.round(ab.cost)} mana${windup}`;
```

with:

```tsx
  const windup = ab.castTime > 0 ? ` · ${ab.castTime.toFixed(2)}s wind-up` : '';
  // The runes' share of the price, eased, in the payment's words (see the rune costs spec).
  const runed = ab.load > 0 ? ` (runes: ${loadText(registry, ab.load, ab.payment)})` : '';
  const pay =
    ab.payment === 'charge'
      ? `Charge ${Math.round(ab.chargeNeed)}${windup}${runed}`
      : `${Math.round(ab.cost)} mana${windup}${runed}`;
  // How much the move's attunement takes off its runes' load, and whether that is the cap.
  const ease =
    ab.runes.length > 0 && ab.ease > 0
      ? `Attunement eases rune cost by ${Math.round(ab.ease * 100)}%${ab.ease >= bal.runes.load.easeCap ? ' (the most it can)' : ''}`
      : null;
```

Replace:

```tsx
      {lines.map((l) => (
        <div key={l} className="text-stone-300">
          {l}
        </div>
      ))}
      {warning && (
```

with:

```tsx
      {lines.map((l) => (
        <div key={l} className="text-stone-300">
          {l}
        </div>
      ))}
      {ease && (
        <div className="text-stone-300" data-testid="rune-ease">
          {ease}
        </div>
      )}
      {warning && (
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/chains)`
Expected: PASS, 7 tests.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 11 tests pass in F + 1 files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-costs-client
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/chains)
git add packages/client/src/features/delve/chains
git commit -m "feat(client): the readout names the runes' share of a move's price and how much attunement eases it" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: The builder's mana support line

Under a mana or cast chain's moves, one line weighs what the chain spends a second at its cadence against what the build brings back, both from the engine's `manaSupport` (the same estimate Power uses), in whole numbers; amber when it spends more. A charge chain and the basic chain show none.

**Files:**
- Modify: `packages/client/src/features/delve/chains/ChainEditor.tsx`
- Test: `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx`:

Replace:

```tsx
import {
  computeHeroStats,
  defaultChains,
  type AbilityPayment,
  type Chains,
```

with:

```tsx
import {
  computeHeroStats,
  defaultChains,
  manaSupport,
  resolveChain,
  type AbilityPayment,
  type AbilitySlot,
  type Chain,
  type Chains,
```

Append at the end of the file:

```tsx
describe('the mana support line', () => {
  const heavyRuned: Move = {
    kind: 'heavy',
    form: 'bolt',
    elements: ['fire'],
    runes: [
      { id: 'echo', tier: 3 },
      { id: 'heavy', tier: 3 },
      { id: 'linger', tier: 3 },
    ],
  };
  const ward: Chain = {
    moves: [{ kind: 'medium', form: 'ward', elements: ['fire'] }],
    payment: 'mana',
  };
  const line = () => screen.getByTestId('mana-support');
  /** The engine's numbers for a chain, as the line words them, and whether it spends more. */
  const words = (stats: HeroStats, slot: AbilitySlot, chain: Chain) => {
    const { spend, refill } = manaSupport(
      registry,
      stats,
      resolveChain(registry, stats, slot, chain),
    );
    return {
      text: `Spends ${Math.round(spend)}/s · your build refills ${Math.round(refill)}/s`,
      short: Math.round(spend) > Math.round(refill),
    };
  };

  it("weighs a mana or cast chain's spend against the build's refill, amber when it spends more", () => {
    const stats = hero({});
    const primary = [heavyRuned, heavyRuned, heavyRuned];
    const { rerender } = render(editor({ primary, stats, over: { defensive: ward } }));
    const fed = words(stats, 'primary', { moves: primary, payment: 'mana' });
    expect(fed.short).toBe(true); // three runed heavies on a bare hero: more than comes back
    expect(line().textContent).toBe(fed.text);
    expect(line()).toHaveClass('text-amber-200/90');
    rerender(editor({ primary, payment: 'cast', stats, over: { defensive: ward } }));
    expect(line().textContent).toBe(
      words(stats, 'primary', { moves: primary, payment: 'cast' }).text,
    );
    fireEvent.click(screen.getByTestId('chain-skill-defensive'));
    const calm = words(stats, 'defensive', ward);
    expect(calm.short).toBe(false); // a Ward's 25 mana every 10 s
    expect(line().textContent).toBe(calm.text);
    expect(line()).not.toHaveClass('text-amber-200/90');
  });

  it('shows none for a charge chain or the basic chain', () => {
    render(editor({ primary: [heavyRuned], payment: 'charge' }));
    expect(screen.queryByTestId('mana-support')).toBeNull();
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.queryByTestId('mana-support')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/chains)`
Expected: FAIL, 1 failed and 8 passed (9): `Unable to find an element by: [data-testid="mana-support"]`. The none test passes already. (If instead an `expect(fed.short).toBe(true)` or `expect(calm.short).toBe(false)` fails, step 1's `manaSupport` differs from the spec's: stop and report its numbers rather than changing the fixture.)

- [ ] **Step 3: Add the line**

In `packages/client/src/features/delve/chains/ChainEditor.tsx`:

Replace:

```tsx
  manaPool,
  resolveChain,
```

with:

```tsx
  manaPool,
  manaSupport,
  resolveChain,
```

Replace:

```tsx
  const allowed = slot ? elements : blowElements;
```

with:

```tsx
  const allowed = slot ? elements : blowElements;
  // A mana or cast chain's spend a second at its cadence against what the build brings back
  // (the engine's estimate, which Power shares), in whole numbers: amber when it spends more.
  const support =
    resolved && resolved.payment !== 'charge' ? manaSupport(registry, stats, resolved) : null;
  const spends = Math.round(support?.spend ?? 0);
  const refills = Math.round(support?.refill ?? 0);
```

Replace:

```tsx
      {!absent && footer?.(skill)}
```

with:

```tsx
      {support && (
        <div
          className={`text-xs ${spends > refills ? 'text-amber-200/90' : 'text-stone-400'}`}
          data-testid="mana-support"
        >
          Spends {spends}/s · your build refills {refills}/s
        </div>
      )}
      {!absent && footer?.(skill)}
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/chains)`
Expected: PASS, 9 tests.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 13 tests pass in F + 1 files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-costs-client
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/chains)
git add packages/client/src/features/delve/chains
git commit -m "feat(client): the builder weighs a mana chain's spend against the build's refill" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Verification

- [ ] **The area's end check**

```bash
cd /c/Projects/alloy-costs-client
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
(pnpm -F @alloy/client build)
(cd packages/engine && npx prettier --check --end-of-line auto src/loot/runes.ts tests/delve-runes-contract.test.ts)
(cd packages/client && npx prettier --check --end-of-line auto src/features/delve/runes src/features/delve/chains src/features/delve/StopPanel.tsx src/features/delve/__tests__/StopPanel.test.tsx)
git status --short
git diff --stat <step-1 merge>..HEAD
```

Expected:
- the engine: no type errors; **M + 6** tests pass, the pacing rails among them;
- the bundle builds;
- the client: no type errors; **N + 13 tests in F + 1 files**, all passing (3 in the picker and the pouch, 3 for the builder's picker and 1 at the stop, 4 for the readout, 2 for the support line);
- the client build succeeds;
- Prettier: "All matched files use Prettier code style!" twice;
- `git status` clean; the diff touches only the 13 files in this plan's Files table, in 5 commits.
- **Determinism:** B changes no number. Its only engine change is text (`runeText`'s `cost`, `loadText`), which no sim, Power or Lab code reads, so the DPS grid, the pacing rails, the first dives and the items hash stay whatever step 1 left them; there is nothing for B to measure.

- [ ] **In the browser (optional; dev server on 5288, the 4a plan's block, from this worktree)**

In the Training Grounds (`/delve/training`), open the Primary, add a socket and pick Echo at tier III: the picker shows "+N% cost" beside each rune (eased by the sandbox's attunement), the readout's pay line gains "(runes: +N% cost)", a line says "Attunement eases rune cost by N%", and "Spends X/s · your build refills Y/s" sits under the cards. Switch the payment to Charge: the prices read "charge" and the support line goes. Finish's E2E drives the Anvil end to end.
