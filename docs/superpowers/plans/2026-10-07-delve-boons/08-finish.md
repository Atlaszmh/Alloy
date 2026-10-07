# Delve boons · D: perf gate, pacing, docs, bump, E2E — Plan and record

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans. Mostly measurement, tuning and docs; one new engine test (the perf gate) and the stop's E2E case reworked. Steps use checkbox (`- [ ]`) syntax.

**Base:** `boons/main` with A, B1–B3 and C1–C3 merged (the overview's integrator notes applied). Worktree `C:/Projects/alloy-boons-d`, branch `boons/d`: `git worktree add ../alloy-boons-d -b boons/d boons/main`. Every path below is relative to that worktree.

**Goal:** the spec's §7 pacing and E2E, §8's engine perf gate and the manual frame check, CLAUDE.md, and the version (`0.69.x` → `0.70.0`, save v13).

**Owns:** `packages/engine/tests/delve-sim-perf.test.ts` (new), the pacing reads and any tuning they force (`src/data/boons.json` numbers, `balance.json → delve.boons.tierWeights`, `delve.layout`'s alcove `kindWeights`), `CLAUDE.md`, `packages/client/package.json`, `packages/client/e2e/delve.spec.ts` (D03 becomes the boon case), `e2e/responsive/specs/delve-stop.spec.ts` (a step-1 check), `src/stores/delveStore.test.ts` (one un-skip), the spec's §8 (the measured numbers only).

**Never:** touch the rails (`delve-pacing*.test.ts`, `delve-tutorial-bot.test.ts`, `delve-maps-sweep.test.ts`, `tests/fixtures/pacing.ts`), reformat `balance.json`, `CLAUDE.md` or the spec (hand edits only, CRLF kept), or cut a gameplay hit for frame time.

**Before anything:** rebuild the engine bundle (`cd packages/engine && npx tsup`) and run the engine typecheck once: `cd packages/engine && npx tsc --noEmit -p .` (expected clean; if not, a merge left a hole: fix it before D).

---

## Task 1: the sim perf gate (`tests/delve-sim-perf.test.ts`)

The spec's §8 engine check: the worst case boons make, measured, skipped unless `SIM_PERF` is set (the same `describe.skipIf(!process.env.X)` as `delve-rune-costs-gate.test.ts`). The hero: an epic bow (bows take all three runes on their blows: Split and Multi-shot fit only `bow` and `wand`), its Primary a two-move Volley and its three blows each holding Echo III, Split III and Multi-shot III, and the dive wearing **Hunted** (every pack elite-led) and **Echo** at their epic tiers. Immortal as the maps sweep makes it (`maxHp` 1e9), never starved (the pool refilled each step, so it casts at every chance), not overwhelming (no `damageMult`: fights must last). Six seeds, 90 s of sim each from depth 20 (a floor left by its gate is followed by the next depth's, so the 90 s are all fighting). It prints µs a step, the worst step, hits, echo hits and events a second; it asserts only the worst step under 8 ms.

**Files:** create `packages/engine/tests/delve-sim-perf.test.ts`.

- [ ] **Step 1: confirm the ids.** `grep -n '"id": "hunted"\|"id": "echo"' packages/engine/src/data/boons.json`. Expected: both rows (B1's). If B1 named either differently, use B1's id in `boon(...)` below.

- [ ] **Step 2: write the test** (complete):

```ts
import { afterAll, afterEach, describe, it, expect } from 'vitest';
import { botInput } from '../src/arpg/bot.js';
import { exitFloor } from '../src/arpg/interact.js';
import { stepWorld } from '../src/arpg/step.js';
import { takeBestAlcove } from '../src/delve/autopilot.js';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { Blow, MoveKind, Move } from '../src/types/ability.js';
import type { RuneRef } from '../src/types/rune.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { Buff } from '../src/types/boon.js';
import type { DelveProfile } from '../src/types/delve.js';
import { registry, STEP, withChains } from './fixtures/arena.js';

/**
 * The boons spec's §8 engine check: the worst case boons make, on generated floors. An epic bow
 * whose Primary (a two-move Volley) and three blows each hold Echo III, Split III and Multi-shot
 * III, a dive wearing Hunted (every pack elite-led) and Echo at their epic tiers, from depth 20,
 * six seeds × 90 s of sim. The hero is immortal and never starved, so it fights and casts at every
 * chance. Prints µs a step, the worst step, hits (and echo hits) and events a second; asserts only
 * that the worst step stays under 8 ms (a quarter of a 33 ms tick): wall-clock means aren't
 * asserted. Skipped unless SIM_PERF is set (about a minute):
 * `SIM_PERF=1 npx vitest run tests/delve-sim-perf.test.ts`.
 */

const DEPTH = 20;
const SECONDS = 90;
const SEEDS = [1, 2, 3, 4, 5, 6];
const WORST_MS = 8;

const RUNES: RuneRef[] = [
  { id: 'echo', tier: 3 },
  { id: 'split', tier: 3 },
  { id: 'multishot', tier: 3 },
];

/** A boon at its epic tier, as `takeStop` would wear it. */
function boon(id: string): Buff {
  const def = registry.getBoon(id);
  if (!def) throw new Error(`no boon ${id}`);
  return { boon: id, tier: 3, effect: def.tiers[2].effect };
}

/** The worst-case hero on a dive at `DEPTH`. */
function hero(seed: number): DelveProfile {
  let p = createDelveProfile(registry, seed, { primary: 'fire' });
  const bow = generateItem(
    registry,
    { uid: 'perf-bow', ilvl: DEPTH, rarity: 'epic', slot: 'weapon', baseId: 'bow', mana: 'fire' },
    new SeededRNG(seed),
  );
  p = { ...p, equipped: { ...p.equipped, weapon: bow } };
  const blow = (kind: MoveKind): Blow => ({ kind, element: 'fire', runes: [...RUNES] });
  const volley = (kind: MoveKind): Move => ({ kind, form: 'volley', elements: ['fire'], runes: [...RUNES] });
  p = withChains(p, {
    basic: [blow('light'), blow('light'), blow('heavy')],
    primary: { moves: [volley('medium'), volley('heavy')], payment: 'mana' },
  });
  p = startDive(registry, p, 1);
  return {
    ...p,
    dive: { ...p.dive!, depth: DEPTH, seed: seed * 1009 + DEPTH * 7, diveBuffs: [boon('hunted'), boon('echo')] },
  };
}

interface Tally {
  steps: number;
  ms: number;
  worst: number;
  hits: number;
  echoes: number;
  events: number;
  floors: number;
}

/** `SECONDS` of sim for `seed`, floor after floor; each `stepWorld` timed alone. */
function run(seed: number): Tally {
  const t: Tally = { steps: 0, ms: 0, worst: 0, hits: 0, echoes: 0, events: 0, floors: 0 };
  let p = hero(seed);
  let simmed = 0;
  while (simmed < SECONDS) {
    const world: ArpgWorld = beginFloor(registry, p);
    t.floors++;
    const h = world.hero;
    const immortal = () => {
      h.stats = h.baseStats = { ...h.stats, maxHp: 1e9 };
      h.hp = 1e9;
    };
    immortal();
    while (!world.exited && simmed + world.t < SECONDS) {
      h.mana = h.manaMax;
      const input = botInput(registry, world);
      const t0 = performance.now();
      const events = stepWorld(registry, world, input, STEP);
      const ms = performance.now() - t0;
      t.steps++;
      t.ms += ms;
      t.worst = Math.max(t.worst, ms);
      t.events += events.length;
      for (const e of events) {
        if (e.kind === 'hit') {
          t.hits++;
          if (e.echo) t.echoes++;
        } else if (e.kind === 'exitRequest') exitFloor(world);
        else if (e.kind === 'alcoveOpen') {
          p = takeBestAlcove(registry, p, world, e.id);
          immortal(); // an alcove re-applies the hero's stats
        }
      }
    }
    simmed += world.t;
    p = { ...p, dive: { ...p.dive!, depth: p.dive!.depth + 1, seed: p.dive!.seed + 1 } };
  }
  return t;
}

// Each test yields to the event loop as it ends (see CLAUDE.md's Testing).
afterEach(() => new Promise((r) => setTimeout(r)));

describe.skipIf(!process.env.SIM_PERF)(`the sim under boons (depth ${DEPTH}, ${SEEDS.length} seeds × ${SECONDS} s)`, () => {
  const rows: string[] = [];
  afterAll(() => {
    console.log(['seed | µs a step | worst ms | hits | echo hits | events/s | floors', ...rows].join('\n'));
  });

  for (const seed of SEEDS)
    it(`seed ${seed}: the worst step under ${WORST_MS} ms`, () => {
      const t = run(seed);
      rows.push(
        [
          seed,
          ((t.ms / t.steps) * 1000).toFixed(1),
          t.worst.toFixed(2),
          t.hits,
          t.echoes,
          (t.events / SECONDS).toFixed(0),
          t.floors,
        ].join(' | '),
      );
      expect(t.hits, 'the build must fight').toBeGreaterThan(0);
      expect(t.worst).toBeLessThan(WORST_MS);
    }, 120_000);
});
```

- [ ] **Step 3: typecheck and run it skipped.** `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-sim-perf.test.ts --reporter=dot`. Expected: clean, `6 skipped`.
  - If `tsc` complains that `MoveKind` isn't exported from `types/ability.ts`, take it from where `Blow.kind`'s type comes from (`grep -n "MoveKind" src/types/*.ts`). If `world.exited` stays false on a floor whose gate the bot reaches, check that `exitFloor` is still in `arpg/interact.ts`.

- [ ] **Step 4: run it.** `cd packages/engine && SIM_PERF=1 npx vitest run tests/delve-sim-perf.test.ts` (PowerShell: `$env:SIM_PERF='1'; npx vitest run tests/delve-sim-perf.test.ts`). Expected: 6 passed, each worst step well under 8 ms (the spec's harness measured ≤ 3.9 ms at depth 20 with Echo 0.4), and `echo hits` non-zero on every seed (if it's 0, A's `echo` flag on `hit` isn't set at one of its sites: report it, don't patch here). Record the printed table under **Record** below. If a worst step is over 8 ms, re-run once on a quiet machine before believing it (a GC pause or a busy CPU can spike a single step); if it holds, profile (`node --cpu-prof`) before changing anything.

- [ ] **Step 5: commit.** `git add packages/engine/tests/delve-sim-perf.test.ts && git commit -m "test(engine): the boons sim perf gate (SIM_PERF)"` with the attribution trailer.

---

## Task 2: the E2E

C1 wrote `toRoad` (either step) and PN06's boon step; C2 wrote TY02's tile count. D does three things. It turns D03's power-up branch in `e2e/delve.spec.ts` into the spec's "A stop spec: take a boon, see its tile on the next floor": an ordinary stop now always offers boons, so that branch is dead. It adds a step-1 check to the responsive stop probe. It un-skips the store test that C1 left skipped. Then it runs them all with `delve-tutorial.spec.ts`, which must pass unchanged (the guided stops keep their cards).

**Files:** modify `packages/client/e2e/delve.spec.ts`, `packages/client/e2e/responsive/specs/delve-stop.spec.ts`, `packages/client/src/stores/delveStore.test.ts`.

- [ ] **Step 1: read C1's and C2's selectors.** `grep -n "data-testid\|data-boon\|data-tier\|data-family\|data-count\|aria-label" packages/client/src/features/delve/stop/BoonCards.tsx packages/client/src/features/delve/arena/hud/BuffRow.tsx`. The case below assumes: the step's container is `stop-boon`; each card is `data-testid="boon-card"` and carries `data-boon={id}`, `data-tier` and `data-family`; the HUD tile is `data-buff="boon"` with `data-boon={id}`, and its count is a `[data-count]` element shown only above 1. Where C1 or C2 shipped other names, use theirs. Change only the selectors; the steps stay.

- [ ] **Step 2: D03 becomes the boon case.** In `e2e/delve.spec.ts`, D03 (about lines 135–180), make two changes:
  - Rename the test to `'D03: the stop offers three boons, then a road; the boon taken shows in the HUD on the next depth'`.
  - Replace the comment and the `if (await door.getByTestId('stop-powerup').isVisible()) { … }` block (about lines 148–159, from `// Step 1, when the stop offers a power-up` to that block's closing `}`) with:

```ts
    // Step 1 at an ordinary stop is the boons (spec §6): three cards, no power-ups, no road yet.
    const boons = door.getByTestId('stop-boon');
    await expect(boons).toBeVisible();
    await expect(door.getByTestId('stop-powerup')).toHaveCount(0);
    await expect(door.getByTestId('door-list')).toHaveCount(0);
    const cards = boons.locator('[data-testid="boon-card"]');
    await expect(cards).toHaveCount(3);
    const card = cards.first();
    const id = (await card.getAttribute('data-boon'))!;
    await card.click();
    // Taken: the road (toRoad below then has nothing to skip).
    await expect(door.getByTestId('stop-road')).toBeVisible();
```

  At the end of D03, after `await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });`, add:

```ts
    // Worn on the next depth: its tile in the buff row, one stack (no count shown).
    const tile = page.locator(`[data-buff="boon"][data-boon="${id}"]`);
    await expect(tile).toBeVisible();
    await expect(tile.locator('[data-count]')).toHaveCount(0);
```

  The variable `stop` (`door.getByTestId('stop')`) was used only by the removed branch. Delete it if the linter or `tsc` flags it as unused.

- [ ] **Step 3: the responsive probe sees step 1.** In `e2e/responsive/specs/delve-stop.spec.ts`, add one line between `await expect(page.getByTestId('door-choice')).toBeVisible({ timeout: 60_000 });` and `await runProbes('delve-stop', vp, { delve: {} });`:

```ts
    await expect(page.getByTestId('stop-boon')).toBeVisible(); // step 1: the boon cards, probed before toRoad
```

- [ ] **Step 4: un-skip the store's boon test.** In `packages/client/src/stores/delveStore.test.ts`, change `it.skip("takes the stop's boon: free, worn on the dive, once"` to `it(` (C1 skipped it until B1's `takeStop` landed). Then run:
  - `cd packages/engine && npx tsup`
  - `cd ../client && npx vitest run src/stores/delveStore.test.ts --reporter=dot`

  Expected: all pass. If the test fails, the store's stop action or B1's `takeStop` differs from the contract. Fix it at the side that breaks the contract.

- [ ] **Step 5: run the E2E specs**, on both Delve projects:

```
cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-pad-nav.spec.ts e2e/delve-type.spec.ts e2e/delve-tutorial.spec.ts e2e/delve-quests.spec.ts --project=desktop --project=desktop-1080 --reporter=dot
npx playwright test e2e/responsive/specs/delve-stop.spec.ts --project=responsive --reporter=dot
```

Expected: all pass.
  - D03 meets a boons stop and finds its tile on depth 2.
  - PN06 reaches each boon card, and X goes to the road.
  - TY02 reads the tile's count at 16 design px or more.
  - `delve-quests.spec.ts` passes its stops through `toRoad`.
  - The responsive stop probe passes at every viewport, step 1 and the road both.
  - `delve-tutorial.spec.ts` passes untouched (its guided stops show `stop-powerup`).

If D01, D02, D11 or D12 fails at the stop, `toRoad` doesn't skip the boon step. That is C1's helper: fix it there (`stop-boon` visible → its Skip). If D02 plays out without gear, that is the known loaded-browser case (CLAUDE.md, Room objects): re-run it alone before investigating.

- [ ] **Step 6: commit.** `git add packages/client/e2e/delve.spec.ts packages/client/e2e/responsive/specs/delve-stop.spec.ts packages/client/src/stores/delveStore.test.ts && git commit -m "test(client): the stop's boon taken and worn (e2e D03, the stop probe, the store)"` with the trailer.

---

## Task 3: pacing (16 seeds, read before tuning)

Boons change every ordinary stop: the bot no longer buys slots, upgrades or runes mid-dive (only at alcoves), and takes the highest-tier non-pact boon instead (B1's `takeBestStop`). Every rail may move.

**Files:** read only, unless tuning: `packages/engine/src/data/boons.json` (tier numbers), `packages/engine/src/data/balance.json` (`delve.boons.tierWeights`; `delve.layout`'s alcove `kindWeights`). Scratch (never committed): `packages/engine/tests/scratch-boons-sweep.test.ts`.

- [ ] **Step 1: the rails as they run** (seeds 1–4, Frost 1–2, the pairs 1–8, the tutorial bot 1–4, the maps sweep 1–20):

```
cd packages/engine && npx vitest run tests/delve-pacing.test.ts tests/delve-pacing-robust.test.ts tests/delve-pacing-pairs.test.ts tests/delve-tutorial-bot.test.ts tests/delve-maps-sweep.test.ts --reporter=dot
```

Expected (about 25–35 min): every test passes except main's known failures below. Note each failure by name; don't tune yet.

**Known failures on main:** main already fails 2 tests in `delve-pacing-robust.test.ts` (baseline: 1699 passed, 2 failed, 5 skipped). Compare against main, and investigate only failures that are new. This plan does not fix those two; record them for the integrator. Other likely movers: `delve-pair`'s seeded reaction test, which shifts with any stream change, and timeouts in `delve-autopilot-crafting` under the suite's load (re-run it alone). If a run fails, check it against main's result at `boons/main`'s merge base before treating it as a regression.

- [ ] **Step 2: the 16-seed read.** The rails pin their seeds; the spec asks for 16 (B5's lesson: the economy rails are noise-limited, a first epic's dive swings about ±1.6 a seed). Write the scratch sweep into `packages/engine/tests/scratch-boons-sweep.test.ts` (inside `tests/` because the engine's vitest `include` is `tests/**/*.test.ts`; delete it before any commit):

```ts
import { afterAll, afterEach, describe, it } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot, type AutopilotDiveReport } from '../src/delve/autopilot.js';
import { economySim } from '../src/delve/economy.js';
import { firstEpicDive, legendaryFollowsEssence } from './fixtures/pacing.js';

// Scratch, never committed: the boons' 16-seed pacing read (plan 08, Task 3).
// SEED0 / SEEDS shard it: SEED0=1 SEEDS=8, then SEED0=9 SEEDS=8.
const registry = createDefaultRegistry();
const DIVES = 12;
const SEED0 = Number(process.env.SEED0 ?? 1);
const N = Number(process.env.SEEDS ?? 16);
const seeds = Array.from({ length: N }, (_, i) => SEED0 + i);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const out: string[] = [];

function line(name: string, seed: number, r: AutopilotDiveReport[]) {
  const floors = r.reduce((a, d) => a + Math.max(1, d.endDepth - d.startDepth + 1), 0);
  const secs = r.reduce((a, d) => a + d.floorSeconds, 0);
  return {
    name,
    seed,
    d1: r[0].endDepth,
    d6: r[5].endDepth,
    d12: r[11].endDepth,
    deaths: r.filter((d) => d.result === 'dead').length,
    perFloor: secs / floors,
    timedOut: r.reduce((a, d) => a + d.timedOut, 0),
    legendary12: r[11].legendariesOwned > 0,
  };
}
type Line = ReturnType<typeof line>;
const lines: Line[] = [];
const econ: { seed: number; epic: number; follows: boolean; boons: Record<string, number> }[] = [];

afterEach(() => new Promise((r) => setTimeout(r)));
afterAll(() => {
  for (const name of ['fire', 'beeline', 'frost']) {
    const ls = lines.filter((l) => l.name === name);
    if (!ls.length) continue;
    out.push(
      `${name} (${ls.length} seeds): depth after dive 1/6/12 ${avg(ls.map((l) => l.d1)).toFixed(2)} / ` +
        `${avg(ls.map((l) => l.d6)).toFixed(2)} / ${avg(ls.map((l) => l.d12)).toFixed(2)}; deaths ` +
        `${avg(ls.map((l) => l.deaths)).toFixed(2)}; ${avg(ls.map((l) => l.perFloor)).toFixed(1)} s a floor; ` +
        `timed out ${ls.reduce((a, l) => a + l.timedOut, 0)}; legendary at dive 12 ${ls.filter((l) => l.legendary12).length}/${ls.length}`,
    );
  }
  if (econ.length) {
    const fam: Record<string, number> = {};
    for (const e of econ) for (const [k, n] of Object.entries(e.boons)) fam[k] = (fam[k] ?? 0) + n;
    out.push(
      `economy (${econ.length} seeds): first epic mean ${avg(econ.map((e) => e.epic)).toFixed(2)} ` +
        `[${econ.map((e) => e.epic).join(', ')}]; legendary within two visits ${econ.filter((e) => e.follows).length}/${econ.length}; ` +
        `boons taken by family ${JSON.stringify(fam)}`,
    );
  }
  console.log(out.join('\n'));
});

describe('boons pacing, scratch', () => {
  for (const seed of seeds) {
    it(`fire ${seed}`, () => void lines.push(line('fire', seed, runAutopilot(registry, { seed, dives: DIVES }).reports)), 900_000);
    it(`beeline ${seed}`, () =>
      void lines.push(line('beeline', seed, runAutopilot(registry, { seed, dives: DIVES, policy: 'beeline' }).reports)), 900_000);
    if (seed <= SEED0 + 7)
      it(`frost ${seed}`, () =>
        void lines.push(line('frost', seed, runAutopilot(registry, { seed, dives: DIVES, primary: 'frost' }).reports)), 900_000);
    it(`economy ${seed}`, () => {
      const e = economySim(registry, seed, DIVES);
      const boons: Record<string, number> = {};
      for (const d of e.dives) for (const [k, n] of Object.entries(d.boons)) boons[k] = (boons[k] ?? 0) + n;
      econ.push({ seed, epic: firstEpicDive(e), follows: legendaryFollowsEssence(e), boons });
    }, 900_000);
  }
});
```

Run it in two shards (PowerShell; each about 30–45 min):

```
cd packages/engine
$env:SEED0='1'; $env:SEEDS='8'; npx vitest run tests/scratch-boons-sweep.test.ts --reporter=dot
$env:SEED0='9'; $env:SEEDS='8'; npx vitest run tests/scratch-boons-sweep.test.ts --reporter=dot
```

Combine the two shards' printed lines by hand (means weighted equally: 8 + 8). `EconomyDive.boons` is B1's (spec §5; `EconomyRow` extends `EconomyDive`); if it's named otherwise, use B1's name.

- [ ] **Step 3: read against the bands** (CLAUDE.md's Pacing guard rails and the room objects' v0.63.0 baseline: Fire 3.4 / 22.7 / 43.1, 6 deaths, about 62 s a floor; beeline dive 12 39.0 (0.90 ×), 36 s; Frost dive 12 47.9; first epic 5.3; legendary within two visits 15/16, owned by dive 12 15/16):
  - floor time: a full clear 40–75 s a floor, a beeline 25–55 s, the clear ≥ 1.25 × the beeline; no floor `timedOut`;
  - a beeline's dive-12 depth ≥ 0.80 × a full clear's;
  - the first dive: every seed ≥ depth 3, the mean 3–12; dive 12 > dive 1 + 5 and > dive 6 (Fire and Frost);
  - the economy: first epic's 16-seed mean ≤ 5.5 (each seed of 1–4 by dive 6), the first legendary within two visits of the first essence (15/16 or better), three seeds in four owning a legendary at dive 12;
  - the forced pairs (the rail's own run): each pair's dive-4 mean 0.6–1.6 × the median;
  - the tutorial bot: every run done, no skip, no death; the maps sweep: every floor exits, no body in a wall.
  - Boons by family: the bot takes no `pact` (B1's rule); every other family should appear. A family at 0 over 16 seeds means its rows' stop weights or `minDepth` never surface it: note it for the integrator, don't tune for it.

- [ ] **Step 4: tune only if a rail moved out of its band**, in this order, one lever at a time, re-running the failing rail first and Step 2's sweep before committing:
  1. the boon tiers' numbers in `src/data/boons.json` (the offense and defense rows the bot takes most; keep each row's three tiers distinct and its `text` matching its numbers: the card line is data, `boonsProblems` checks tiers differ);
  2. `balance.json → delve.boons.tierWeights` (fewer epics early if the bot runs ahead, more if it stalls; the bands must still ascend from depth 1, `BoonsBalanceSchema`);
  3. `balance.json → delve.layout`'s alcove `kindWeights` (more alcoves give back the paid power-ups the stops lost, if progression stalls on gear rather than combat).
  Never the rails, the floor-time bands, the fixtures or the economy targets. After a tuning commit, re-run `npx vitest run tests/delve-boons-data.test.ts tests/delve-boons.test.ts --reporter=dot` (the data checks and the roll tests) as well as the rails.

- [ ] **Step 5: record** the 16-seed numbers, the rails' result and every lever tried (and its numbers) under **Record** below; the final numbers go into CLAUDE.md in Task 5. Delete the scratch file: `rm packages/engine/tests/scratch-boons-sweep.test.ts`.

- [ ] **Step 6: commit** only if tuned: `git add packages/engine/src/data/boons.json packages/engine/src/data/balance.json && git commit -m "balance(engine): boons tuned against the pacing rails"` with the trailer.

---

## Task 4: the manual frame check (spec §8)

The client check the spec makes the plan's last measurement: the Training Grounds' worst case against 12 foes at 1920×1080, Effects at 100%, `HIT_FX_BUDGET` (C3's, `fx/mana-fx.ts`, 24) on and off. Target: a 95th-percentile frame at or under 16.7 ms on the dev machine (Windows 11, RTX 5070 Ti). The Training Grounds have no boons (out of scope), so Echo III on every move and blow stands in for the Echo boon.

- [ ] **Step 1: run the dev client.** `cd packages/engine && npx tsup`, then `cd ../client && npx vite` (dev build: the Training bar's `FrameChip` shows only in dev). Open `http://localhost:9099/delve` in Chrome, the window fullscreen (F11) on the 1920×1080 monitor (or DevTools' device toolbar at 1920 × 1080, zoom 100%; note which in the record). Hard refresh (Ctrl+Shift+R) after the bundle rebuild.
- [ ] **Step 2: settings.** System menu (Esc) → Settings → Effects: Screen shake, Hit-stop and Flashes at 100%; HUD scale 100%; View distance at its default; Text size Medium. Controls → Basic attack: **Auto**.
- [ ] **Step 3: the build** (Depart sheet → Training). The dock:
  - Loadout: weapon **bow**, rarity **epic**, element fire.
  - Abilities: Primary two moves, Volley medium then Volley heavy, fire, each with Echo III, Split III and Multi-shot III; each basic blow the same three runes.
  - Toggles: Infinite mana and Invulnerable on, No cooldowns off (cooldowns as in a dive).
  - Targets: depth 20; a melee pack from the biome there; Count 8 → Spawn, then Count 4 → Spawn (the slider stops at 8): 12 foes.
- [ ] **Step 4: measure with the budget on.** Close nothing: let the fight run beside the dock (the mouse holds the input lock), stand where the 12 reach you, hold Q (the Primary) for 20 s. Read `FrameChip`'s p95 (the last 5 s) three times at 5 s intervals; record the highest. Then reset the dummies and monsters, spawn the 12 again and repeat once.
- [ ] **Step 5: measure with the budget off.** In `packages/client/src/features/delve/arena/fx/mana-fx.ts` set `HIT_FX_BUDGET` to `Infinity` (a local edit, never committed), let Vite reload, repeat Steps 3–4 (the sandbox store keeps the loadout). Then `git checkout packages/client/src/features/delve/arena/fx/mana-fx.ts`.
- [ ] **Step 6: read.** Pass: the budget-on p95 ≤ 16.7 ms. If it misses, profile before tuning (Chrome Performance, 5 s under the same fight): lower `HIT_FX_BUDGET` first (24 → 16 → 12), then the per-sound throttles (`arena-sounds.ts`); never cut gameplay hits. A tuned budget is one commit: `perf(client): HIT_FX_BUDGET <n>` with its before/after p95 in the message.
- [ ] **Step 7: record** both p95s (and the off-budget's, so the budget's worth shows) in the spec's §8 under "The check", a new line after the client bullet, e.g. `**Measured** (2026-10-xx, v0.70.0, the dev machine, 1920×1080, Effects 100%, 12 depth-20 foes, Echo/Split/Multi-shot III on a bow's Volley and blows): p95 <on> ms with HIT_FX_BUDGET 24, <off> ms without.` and in CLAUDE.md (Task 5's `{{FRAME_*}}` placeholders). Commit with the CLAUDE.md task.

---

## Task 5: CLAUDE.md

Hand edits only (CRLF kept; no formatter). Measured numbers come from Tasks 1, 3 and 4: every `{{...}}` below must be filled before the commit (`grep -n "{{" CLAUDE.md` must print nothing).

**Files:** modify `CLAUDE.md`.

- [ ] **Step 1: the Boons paragraph.** Insert as a new bullet in The Delve section right after the **Room objects** bullet (before **Client**):

```markdown
- **Boons** (spec: `docs/superpowers/specs/2026-10-06-delve-boons-design.md`; v0.70.0, save v13): an ordinary stop between depths offers three **boons**, free, dive-scoped picks that stack to each boon's cap and vanish when the dive settles; the paid power-ups leave the ordinary stop and stay at the anvil alcoves and the guided start's stops. **The row** (`src/data/boons.json`, `BoonDefSchema`, `registry.getBoons()` / `getBoon(id)` / `shrineBoons()`; types in `src/types/boon.ts`): `BoonDef { id, name, family, duration: 'dive' | 'floor', cap (1–3), minDepth?, shrine?, weight: { common, rare, epic }, tiers: [3 × { text, effect }] }`, the seven families (`BOON_FAMILIES`: offense, element, defense, tempo, fortune, pact, floor), each tier's `text` its whole card line (the client never formats a boon's number); a stack adds its own tier's effect, and a boon worn at its cap is never offered. **Shrines are rows:** the six shrines come first in `boons.json`, in their old order (`shrine` their old weight, every stop weight 0, the effect in all three tiers, a shrine granting tier 1), so `generate.ts`'s draw over `shrineBoons()` rolls the same shrine on every floor (pinned by a test over 20 seeds); the tutorial floor's is `getBoon('vigor')`; `shrines.json` is gone. Load checks: `boonsProblems` (`data/boons-check.ts`, refused by `createDefaultRegistry`): unique ids, tier text, knob keys, `attune` roles, `cap` 1–3, a stop row in every family, no stop row with three identical tiers, a shrine row only with shrine-safe fields. **The effect** (`BoonEffect`, `BoonEffectSchema`; every field optional, a bonus the added fraction, a drop multiplier (`flux`, `runes`, `gear`) the raw factor): `Buff { boon, tier, effect }` on `HeroEntity.diveBuffs` / `floorBuffs` and `DiveState.diveBuffs`; the sim reads one combined view, `buffSum(buffs)` (`delve/boons.ts`, pure; `HeroEntity.boon`, a `BoonSum`, computed at floor start and whenever a buff is added): counts and additive fields sum (charges, Find, regen, chances, fractions of life, and the × (1 + Σ) fields `dodgeWindow`, `dodgeRecharge`, `defendDuration`, `magnet`, `scrap`), `damage`, `manaRegen`, `maxLife` (floored at 0.3), `tempo` (floored at 0.5) and the drop multipliers multiply per entry, `hazardsFriendly` takes the largest, and `knobs` merge per entry through `mergeKnobs`. Each field has one handler at one site: `applyBuffs` (the only place `HeroStats` change: `damage`, `manaRegen`, `lifeRegen`, `maxLife`, `tempo`, `lifesteal`, `bloodPrice`'s regen), `impact.ts` (`byKind`, `firstMove`, `lowLife`, `nearFoes`), `resolve.ts` (`stepBonus`), `dodge.ts` (`dodgeCharges`, floored at 1; `dodgeWindow`; `dodgeRecharge`, floored at 0.5 ×; `perfectAlways`), `cast.ts` (`freeCast`, `HeroEntity.freeCastUntil`; `bloodPrice`: an ability's mana paid in life, `c / manaMax × p × maxHp`, unaffordable under 1 life), `defend.ts` (`defendDuration`), `combat.ts` (`lastStand`, once a floor), `world.ts` (`barrierOnFloor`, `noPotions`, `eliteChance` beside the door's, its `spawnRng` draw made whatever the value), `interact.ts` (`healOnClear`; `shrinesLastDive`, a floor shrine's blessing kept for the dive), `step.ts` (`magnet`), `material-drops.ts` (`metalUp`, `flux`, `scrap`, `gear`), `rune-drops.ts` (`runes`), `settleDive` (`deathLoss`, off `crafting.deathLoss`), `chooseDoor` (`skip`, added to the door's own and zeroed on its entry), `fog.ts` (`exitRevealed`), `terrain.ts` (`noSlow`) and `objects.ts` (`hazardsFriendly`); nothing reads a boon by id but the HUD. **Knobs and attunement:** boon knobs reach basic blows and ability moves: `diveStats(registry, profile)` (`delve/pair.ts`) passes the dive entries' knob partials as `HeroStatsExtra.boonKnobs` (default `[]`, so the sandbox, the DPS Lab, Power and `profileStats` see none), merged into each blow's knobs after its runes (never into `HeroBlow.runes`: the HUD's dots and the dormant marks are unchanged) and kept on `HeroStats.boonKnobs`, which `resolveAbility` appends to its `mergeKnobs` partials; `echo` takes the largest of the runes' and the boons'. `attune` (`{ role, points }`) goes in as `HeroStatsExtra.attunement` through `diveStats` alone (a secondary while unbound to the primary), which `beginFloor` and `refreshWorldHero`'s callers use; `profileStats` is unchanged, so the forge's roll floor, `overtakeProgress`, Power and `compareItem` never see a boon. The one new knob, `stackTime` (stack duration × (1 + Σ), additive, read in `applyStacks`), Power ignores. A new boon from these fields is one data row; one that needs a new field adds it to `BoonEffect`, `BoonEffectSchema`, `buffSum` and its one handler. **The stop** (`DiveStop`: `{ kind: 'boons', offers: BoonOffer[], taken }` or `{ kind: 'powerups', offers: StopKind[], taken, required? }`): a guided stop rolls power-ups as before; an ordinary one calls `rollBoons(registry, dive, rng)` on the dive seed's fork `stop:<depth>`: each of `delve.boons.offers` (3) cards draws a tier by `delve.boons.tierWeights` for the depth's band (80/18/2 from depth 1 to 40/38/22 from 35; `BoonsBalanceSchema` checks they ascend), bumped one tier at the chance of the door that led there (`DoorMods.boons`: Gilded Halls 0.5, Champion's Den 0.3), then a row by its `weight[tier]` among the rows with a stop weight, `minDepth` met, under their cap and of a family not yet on the offer (an empty tier tries the next lower, then higher; no card, no stop). `takeStop` with `{ kind: 'boon', index }` pushes `{ boon, tier, effect }` onto `DiveState.diveBuffs` and marks the stop taken: free, no lock lift, no `banked` spend, no quest or tutorial event; a power-up action on a boons stop is refused ("Not offered at this stop"), and skipping is choosing a door. The next `beginFloor` wears them (`FloorOptions.diveBuffs`); `settleDive` leaves them on the settled dive for `DiveSummary`, and a new dive starts with none. The alcoves keep `stopKinds`, `alcoveOffers` and `takeAlcove` unchanged. The first batch is 40 stop rows (Keen Edge to Arsonist; pacts from depth 4 or 6, weighted 4/3/2, floor rows 6/4/2, the rest 10/6/3). **The bot:** `takeBestStop` takes a boons stop's highest tier, ties by family (offense, defense, element, tempo, fortune, floor), never a pact; a powerups stop runs the old ladder; `economySim`'s rows carry `boons` (taken by family; `stops` is now the alcoves' and guided stops' spend), the Economy view's "boons by family" series and column. **The client:** the stop's step 1 on a boons stop is `BoonCards` (`stop/BoonCards.tsx`, `stop-boon`: three plate cards (`boon-card`, `data-boon`, `data-tier`, `data-family`), each its family's colour on its edge (`stop/boon-style.ts`: offense red, element violet, defense steel blue, tempo amber, fortune gold, pact crimson, floor green), its tier mark I / II / III in the rarity colours, the name, the tier's line and "Taken n of cap" when worn; the first `data-pad-first`; A, Enter or a click takes it, X or S skips to the road; onboarding "Take a boon"), a powerups stop `StopPanel` as before (`stop-powerup`); the HUD's `BuffRow` draws one tile a boon worn (`HudBuff` `{ id: 'boon', boon, name, family, count, dive, lines }`, a shrine's blessing one too: gold border for the dive, cyan for the floor, its family glyph, the count above 1, a tooltip of its taken tiers' lines); the pause's state and `DiveSummary` list the dive's boons (`dive-boons`); Help's banking topic says "Each stop offers three boons. Take one: it lasts the dive, and some stack."; `wornBoons` (`features/delve/boons-text.ts`) groups the dive's entries by boon for the tile, the pause and the summary; the kit gallery shows a `BoonCard` a tier. **Performance** (spec §8): an echo's hit carries `echo: true` on the `hit` event (`landBlow`'s `echo`, an ability's `replay`), never starts hit-stop or a camera kick and plays its sound at half volume through the same throttle; the mana-fx and pixel-floor hit moments take `HIT_FX_BUDGET` ({{HIT_FX_BUDGET}}) a frame (`fx/mana-fx.ts`, beside `INFUSION_BUDGET`), real hits first, echoes from what is left, a hit over it drawing only its number; `FrameChip` (dev builds, the Training bar beside the DPS Lab) shows the 95th-percentile frame over the last 5 s. `tests/delve-sim-perf.test.ts` (skipped unless `SIM_PERF` is set) plays an epic bow with Echo, Split and Multi-shot III on its Volley and blows, wearing Hunted and Echo, from depth 20 (six seeds × 90 s) and asserts only a worst step under 8 ms: measured at v0.70.0 {{SIM_US}} µs a step, worst {{SIM_WORST}} ms, {{SIM_EVENTS}} events a second. The Training Grounds' worst case (that build, 12 depth-20 foes, 1920×1080, Effects 100%) ran a p95 frame of {{FRAME_ON}} ms with the budget and {{FRAME_OFF}} ms without (target ≤ 16.7 ms). Measured at v0.70.0 over 16 seeds and 12 dives: Fire's mean depth after dive 1 / 6 / 12 {{FIRE_D1}} / {{FIRE_D6}} / {{FIRE_D12}}, {{FIRE_DEATHS}} deaths, about {{FIRE_SECS}} s a floor; the beeline's dive 12 {{RUSH_D12}} ({{RUSH_RATIO}} × a full clear), {{RUSH_SECS}} s a floor, {{TIMEOUTS}} floors timed out; Frost's dive 12 {{FROST_D12}} (8 seeds); a first epic by dive {{EPIC_MEAN}} on average, the first legendary within two visits of the first essence in {{LEG_FOLLOWS}} of 16 and owned by dive 12 in {{LEG_OWNED}} of 16; boons taken by family {{BOON_FAMILIES}}{{TUNING_NOTE}}.
```

  `{{TUNING_NOTE}}`: empty when nothing was tuned, else `; tuned: <what, from → to>`.

- [ ] **Step 2: the shrine references.**
  - Data bullet: `` `src/data/layouts.json` and `src/data/shrines.json` (the floor maps' room templates, prop sizes and shrine blessings; `getDelveData().layouts` / `.shrines`) `` → `` `src/data/layouts.json` (the floor maps' room templates and prop sizes; `getDelveData().layouts`) and `src/data/boons.json` (the boons and the shrines' blessings, see Boons; `registry.getBoons()`) ``.
  - Floor maps bullet: `` (`applyShrine`, its shrine from `src/data/shrines.json` (`ShrinesDataSchema`), drawn at generation: `` → `` (`applyShrine`, its shrine a boon row with `shrine` set (`boons.json`, `shrineBoons()`; see Boons), drawn at generation: ``; and `` the shrines' blessings join the buff row (the `shrine` glyph, cyan for the floor, gold for the dive); `` → `` the shrines' blessings join the buff row as boon tiles (cyan for the floor, gold for the dive; see Boons); ``.
- [ ] **Step 3: the save version.**
  - Crafting bullet: `` 12 since the room objects; `` → `` 12 since the room objects, 13 since the boons; ``.
  - Client bullet: `` `alloy:delve:v2`, schema version 12, `` → `` `alloy:delve:v2`, schema version 13, ``.
  - Room objects' "The save is version 12 with no new field" stays (it's that release's history).
- [ ] **Step 4: the stop's description.**
  - Weapon movesets bullet: `` but a **stop**: after each depth the stop holds one power-up (`DiveState.stop`, rolled by `completeFloor` from the dive seed's fork `stop:<depth>`, `rollStop`: 2 or 3 of the kinds the hero can take and pay for, `stopKinds`: ``  → `` but a **stop**: after each depth a guided stop (and every anvil alcove) holds one power-up (an ordinary stop offers boons instead: see Boons; `DiveState.stop`, rolled by `completeFloor` from the dive seed's fork `stop:<depth>`, `rollStop`: 2 or 3 of the kinds the hero can take and pay for, `stopKinds`: ``; and `` takes each stop (`takeBestStop`) `` → `` takes each stop (`takeBestStop`: a boons stop's best boon, a powerups stop's ladder) ``.
  - Client bullet: `` Step 1 (`stop-powerup`), while a power-up is on offer: the cards `` → `` Step 1, while the stop offers something: an ordinary stop's three boons (`stop-boon`, `BoonCards`: see Boons), or a guided stop's power-ups (`stop-powerup`): the cards ``.
- [ ] **Step 5: the pacing guard rails bullet.** After "...under both policies: every floor reaches its exit and no body stands in a wall." add: `` The boons' sim perf gate is `tests/delve-sim-perf.test.ts` (skipped unless `SIM_PERF` is set; see Boons). ``
- [ ] **Step 6: check.** `grep -n "{{" CLAUDE.md` prints nothing; `grep -n "shrines.json" CLAUDE.md` prints only the Boons paragraph's "`shrines.json` is gone"; `grep -n "ShrinesDataSchema\|schema version 12\|src/data/shrines.json" CLAUDE.md` prints nothing; `git diff --stat CLAUDE.md` shows only CLAUDE.md, and `git diff CLAUDE.md | grep -c "^-"` is small (no whole-file line-ending churn: if every line shows, the edit rewrote CRLF; redo it with an editor that keeps them).
- [ ] **Step 7: commit.** `git add CLAUDE.md docs/superpowers/specs/2026-10-06-delve-boons-design.md && git commit -m "docs: CLAUDE.md's Boons, and the boons' measured numbers"` with the trailer.

---

## Task 6: the version bump

- [ ] **Step 1:** `packages/client/package.json`: `0.69.x → 0.70.0` (read the current version from the file at execution time; don't assume the patch number) (a feature: the next minor; the save goes to 13 with it).
- [ ] **Step 2:** `cd packages/client && npx vitest run src/pages/__tests__/TitleScreen.test.tsx src/features/delve/hub/__tests__/SettingsPanel.test.tsx --reporter=dot` (both read the version; expected pass).
- [ ] **Step 3: commit.** `git add packages/client/package.json && git commit -m "chore(client): bump version to 0.70.0"` with the trailer.

---

## Task 7: the whole suites and the full E2E (the close)

- [ ] **Step 1: engine.** `cd packages/engine && npx tsc --noEmit -p . && npx vitest run --reporter=dot` (about 12 minutes). Expected: clean; `delve-sim-perf` and the rune costs gate skipped; every other file passes except main's two known `delve-pacing-robust` failures (Task 3 Step 1's note: compare against main's 1699 passed, 2 failed, 5 skipped, and investigate only new failures). Then `npx tsup` (three "Build success").
- [ ] **Step 2: client.** `cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot && npx vite build`. Expected: clean, all pass, built.
- [ ] **Step 3: full E2E.** `cd packages/client && npx playwright test --reporter=dot` (the three projects: `desktop`, `desktop-1080` and `responsive`; about an hour). Expected: all pass. Under load, re-run a lone failure alone (`npx playwright test e2e/<file> -g "<id>" --project=<project>`) before investigating; a failure that repeats alone is real.
- [ ] **Step 4: record** the counts below (engine files and tests, client tests, E2E passed/skipped, durations).
- [ ] **Step 5:** nothing to commit unless a step forced a fix (one commit each, named for the fix). Remove the worktree only with `rmdir /s /q` from cmd then `git worktree prune`.

---

## Record

(Filled while executing.)

**Task 1 (perf gate):** seed | µs a step | worst ms | hits | echo hits | events/s | floors — …

**Task 2 (E2E):** …

**Known failures carried from main:** `delve-pacing-robust` × 2 (…names…); anything else new: …

**Task 3 (pacing):** the rails (seeds as they run): …; 16 seeds: Fire …; beeline …; Frost (8) …; economy …; boons by family …; levers tried: …

**Task 4 (frames):** budget on p95 … ms, off … ms (machine, window, date).

**Task 7:** engine …; client …; E2E ….

## For the integrator

- main already fails 2 tests in `delve-pacing-robust` (1699 passed, 2 failed, 5 skipped). D does not fix them; the record names them. `delve-pair`'s seeded reaction test and `delve-autopilot-crafting`'s timeouts are the likeliest other movers.

- The boon ids `hunted` and `echo` (Task 1) and the selectors `stop-boon`, `[data-testid="boon-card"]` with `data-boon`, `[data-buff="boon"][data-boon]` and `[data-count]` (Task 2) come from B1's data and C1/C2's components; Task 1 Step 1 and Task 2 Step 1 check them first.
- The economy rails are noise-limited on furnished floors (B5's record): read a failure there against Task 3's 16 seeds before tuning, and tune boons first (they are the change).
- Boons remove mid-dive buying at ordinary stops; if progression stalls on gear rather than combat, the alcoves' `kindWeights` is the lever, not the boon numbers.
