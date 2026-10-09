# Delve constructs · D2: balance, E2E, docs and the bump — Plan and record

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans. Mostly measurement, tuning, E2E rewrites and docs; no new engine feature. Steps use checkbox (`- [ ]`) syntax.

**Base:** `constructs/main` with A, B1, B2, C1, C2 and D1 merged (the overview's integrator notes applied). Worktree `C:/Projects/alloy-constructs-d2`, branch `constructs/d2`, made with the junction script: `C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad/mkwt.ps1 -Name alloy-constructs-d2 -Branch constructs/d2 -Base constructs/main`. Every path below is relative to that worktree; `$P` is the session scratchpad, `C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad`.

**Goal:** the spec's §4.4 gate and the rune gates re-run on the merged engine; the pacing rails and the 16-seed read (§7, §11's first risk: the slot table or `openSkill` trimmed if early weapons run ahead); the full E2E (§8's close); CLAUDE.md (§9); the version (`0.75.1` → `0.76.0`, save v14); the stage's final review.

**Owns:** the pacing reads and any tuning they force (`balance.json → delve.movesets.slots`, `openSkill`, `extraSlots`; the style rows in `delve.json → bases[].style` and the `melee` blocks in `arpg.json → forms` for the style gate, since that is where the contract put those numbers), `packages/client/e2e/*.spec.ts` but `delve-tutorial.spec.ts` (D1's), `packages/client/e2e/fixtures/delve.ts`, `packages/client/e2e/responsive/specs/*.spec.ts`, the un-skips C1 and C2 marked `// D2 un-skips`, the D02 pin in `packages/engine/tests/delve-banking.test.ts` (a pinned seed, not a rail), `CLAUDE.md`, `packages/client/package.json`.

**Never:** touch the rails' bands (`delve-pacing*.test.ts`, `delve-tutorial-bot.test.ts`, `delve-maps-sweep.test.ts`, `tests/fixtures/pacing.ts`; Task 4 Step 3 names the one rail expectation the spec itself retires, and only that), the gates' ceilings, floors or bands (`delve-style-gate.test.ts`, `delve-rune-costs-gate.test.ts`), or reformat `balance.json`, `delve.json`, `arpg.json`, `CLAUDE.md` or the spec (hand edits only; `CLAUDE.md` is CRLF, the JSON and the specs LF: keep each).

**Before anything:** rebuild the bundle and typecheck both packages once: `cd packages/engine && npx tsup && npx tsc --noEmit -p . && cd ../client && npx tsc --noEmit -p .` (expected: three "Build success", both clean; if not, a merge left a hole: fix it before D2, one commit named for the hole). Then `git log --oneline -1` and note the base commit under **Record**.

---

## Chunk 1: the un-skips, the gates and pacing

### Task 1: un-skip C1's and C2's engine-dependent tests

C1 and C2 built against A's `delve/constructs.ts`, whose ops refused "Not yet" until B2 landed; the tests that need the real ops are marked `// D2 un-skips`.

**Files:** whatever the grep finds under `packages/client/src` and `packages/engine/tests`.

- [ ] **Step 1: find them.** `grep -rn "D2 un-skips" packages/client/src packages/engine/tests`. Expected: a handful of `it.skip(` / `describe.skip(` / `test.skip(` lines (C1's store and Skills tests on `applyDraft`, `placeConstruct`, `unsocketConstruct`; C2's Loadout and Temper tests on `moveAll`, `salvageConstruct`, `openSkill`). Record the list.
- [ ] **Step 2: un-skip each**: `it.skip(` → `it(`, `describe.skip(` → `describe(`, and delete the `// D2 un-skips` comment on that line (nothing else on the line changes).
- [ ] **Step 3: run them.** `cd packages/client && npx vitest run <the files> --reporter=dot` (and `cd packages/engine && npx vitest run <the files> --reporter=dot` for any engine file). Expected: all pass. A failure here is a contract mismatch between C's expectation and B2's op: read B2's test for the op (`tests/delve-constructs*.test.ts`) and fix the side that breaks the overview's contract (the signatures and refusals in "Operations"); never both.
- [ ] **Step 4: commit.** `git add <the files> && git commit -m "test(client): un-skip the constructs tests that waited on B2's ops"` with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 2: the style gate (spec §4.4)

B1 wrote `tests/delve-style-gate.test.ts` (skipped unless `STYLE_GATE` is set) and the Lab's `'style'` view. D2 runs it on the merged engine and tunes the style numbers until it holds. Each pair must sit within 0.85–1.2× the median of its form across its class's weapons, and each weapon's mean over its forms within 0.9–1.1× the mean of all weapons.

**Files:** read `packages/engine/tests/delve-style-gate.test.ts`; tune only `packages/engine/src/data/delve.json` (`bases[].style.numbers`, then `.trait`) and, for a melee version that misses alone, `packages/engine/src/data/arpg.json` (`forms[].melee`). Never the test's bands.

- [ ] **Step 1: run it.** PowerShell: `cd packages/engine; $env:STYLE_GATE='1'; npx vitest run tests/delve-style-gate.test.ts` (Git Bash: `STYLE_GATE=1 npx vitest run tests/delve-style-gate.test.ts`). Expected: the printed table (weapon × form, one dummy and the pack, the ratio to the form's median and each weapon's mean) and every assertion green; about 2–5 minutes (7 weapons × their forms × 2 targets × 8 seeds). Record the table under **Record** whatever the result.
- [ ] **Step 2: tune only if it fails**, one lever at a time, re-running the gate after each:
  1. the failing weapon's `style.numbers` (the factor nearest the miss: a pair 1.25× over its form's median on the maul is `power`, one under on the dagger is `power` or `range`; a weapon's mean over 1.1× is its `power` alone);
  2. then its `trait` (the dagger's `critBonus`, the axe's `cleave`, the wand's `homing`, the staff's zone numbers, the maul's stagger, the bow's `pierce`, the sword's step bonus; the trait is the weapon's identity: trim it last and least);
  3. the form's `melee` block (`range`, `radius`, `motion`, `speed`), reserved for a melee version that misses on every melee weapon at once (the dagger, sword, axe and maul all over or all under the form's median): that is the version's own number, not a style's; a miss on some melee weapons is rung 1 or 2.
  Keep every number a two-decimal factor, the sword's row at 1 everywhere and never moved (the baseline the reference-weapon gates lean on; a sword pair that misses is tuned through the other weapons or the melee block), and the spec's §4.1 directions (a Quick dagger stays faster and weaker, a Heavy maul slower and harder).
- [ ] **Step 3: the data tests** after any tuning: `npx vitest run tests/delve-styles*.test.ts tests/delve-forms*.test.ts tests/delve-dps-sim.test.ts --reporter=dot` (B1's data checks and the Lab's setups; use B1's file names, `ls tests | grep -i "style\|form"`). Expected: pass; a pinned number in B1's tests that your tuning moved is re-pinned to the new value with the gate's table as its reason.
- [ ] **Step 4: commit** only if tuned: `git add packages/engine/src/data/delve.json packages/engine/src/data/arpg.json packages/engine/tests && git commit -m "balance(engine): cast styles tuned to the style gate"` with the trailer.

---

### Task 3: the rune gates, re-run on the reference weapons

The spec (§4.4) moved every rune measurement onto a reference weapon: the sword for melee forms, the staff for ranged, both for shared (B1's `dpsCombos` / `runeComboSetups`). The two-build gate is a test; the rune balance gate (the ceilings 2.0× / 2.5× for a single rune and 3.0× / 4.0× for a three-rune set, one dummy / the pack) is read from the Lab's rune view. The style numbers of Task 2 move the staff's rows (the sword is all 1s), so this runs after Task 2 holds.

**Files:** read only, unless a ceiling breaks: then `packages/engine/src/data/runes.json` (the breaking rune's tier numbers; Detonate is the new row) or `delve.json`'s staff `trait` (its zone's numbers, which Linger stacks on). Never `delve.runes.load`'s factors for a ceiling (those are the two-build gate's levers), never the ceilings.

- [ ] **Step 1: the two-build gate.** `cd packages/engine; $env:RUNE_COST_GATE='1'; npx vitest run tests/delve-rune-costs-gate.test.ts`. Expected (about 30–60 s, twice the forms since shared forms run on both weapons): every Primary form's supported ratio ≥ 1.5× on the pack, the starved mana per press 2.0–3.0×; the starved ratio printed (about 0.9–1.2×). Record the printed rows (v0.52.0 read supported 1.62–2.07×, starved 1.01–1.18× (Volley 1.34×), per press 2.89× starved and 2.07× supported). If a form fails, tune in the rune costs spec's order (`delve.runes.load.byForm` for that form, then `bySlot`, then `easePerAttune` / `easeCap`, then the rune rows), one commit: `balance(engine): rune loads re-tuned on the reference weapons`.
- [ ] **Step 2: the rune balance gate (manual, the Lab).** `cd packages/engine && npx tsup`, `cd ../client && npx vite`, open `http://localhost:9099/delve`, Depart sheet → Training → DPS Lab (dev builds). View **Rune**, depth 10, Mana full; run with Pack off, then on (each run a few minutes: every three-rune set at tier III on every form and the two reference weapons' blows). Sort by the "× none" column and read: the highest single-rune row and the highest three-rune row, on one dummy and on the pack. Expected: no single rune above 2.0× (one dummy) or 2.5× (pack); no set above 3.0× (one dummy) or 4.0× (pack), except the known Nova + Linger sets on one dummy (a yardstick artefact, up to about 6×, under 4.0× on the pack: CLAUDE.md's Runes). New rows to watch: Detonate on Strike, Whirl, Volley, Lance and Onslaught (a blast per contact hit multiplies on the pack), and the staff's zone trait under Linger (two zones a hit). Record the four maxima and their rows.
- [ ] **Step 3: tune only a breach**: Detonate's `detonate` tier numbers (0.25–0.45 as shipped) or its `power` trade-off, else the staff trait's zone numbers; re-run Step 2's view for that form only (its filter chip), then Task 2's gate once more (a trait change moves it). One commit: `balance(engine): <rune or trait> trimmed under the rune ceilings`.

---

### Task 4: pacing (the rails, then 16 seeds; read before tuning)

The stage changes what every weapon carries (§11's first risk: a common weapon had the Basic alone, now two Primary slots and a Defensive from uncommon), Awaken's price (Open a skill by rarity), the pull rule (`'pay'`), the Links economy (bought slots only) and the bot (D1: Move all, placing by Power, Open a skill). Every rail may move.

**Files:** read only, unless tuning: `packages/engine/src/data/balance.json` (`delve.movesets.slots`, `openSkill`, `extraSlots`). One rail expectation (Step 3) the spec retires. Scratch (never committed): `packages/engine/tests/scratch-constructs-sweep.test.ts`.

- [ ] **Step 1: the rails as they run** (Fire seeds 1–4, Frost 1–2, the beeline 1–4, the pairs 1–8, the tutorial bot 4 seeds × 10 pairs, the maps sweep 1–20):

```
cd packages/engine && npx vitest run tests/delve-pacing.test.ts tests/delve-pacing-robust.test.ts tests/delve-pacing-pairs.test.ts tests/delve-tutorial-bot.test.ts tests/delve-maps-sweep.test.ts --reporter=dot
```

Expected (about 25–35 min): every test passes but the known failures below and, possibly, Step 3's. Note each failure by name; don't tune yet.

**The known failure on main:** the overview's baseline on `main` at `2f3871b2` is engine 1831 passed, 1 failed, 11 skipped of 1843 tests in 147 files (client 1413 passed in 152 files): one pre-existing failure, the one test `01-contract.md`'s Base names (read its name there before running; it is one test, not a count). Compare against that; investigate only failures that are new. The likeliest other movers: `delve-pair`'s seeded reaction test (any stream change) and `delve-autopilot-crafting`'s timeouts under load (re-run alone).

- [ ] **Step 2: the 16-seed read.** Write the scratch sweep into `packages/engine/tests/scratch-constructs-sweep.test.ts` (inside `tests/`: the engine's vitest `include` is `tests/**/*.test.ts`; delete it before any commit). It is the boons plan's sweep (`docs/superpowers/plans/2026-10-07-delve-boons/08-finish.md`, Task 3 Step 2) with two columns added for this stage's risks: the bag's size at the end (§11: "the bag can grow without bound") and the Links held.

```ts
import { afterAll, afterEach, describe, it } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot, type AutopilotDiveReport } from '../src/delve/autopilot.js';
import { economySim } from '../src/delve/economy.js';
import { firstEpicDive, legendaryFollowsEssence } from './fixtures/pacing.js';

// Scratch, never committed: the constructs' 16-seed pacing read (plan 07, Task 4).
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
const econ: { seed: number; epic: number; follows: boolean; bag: number; links: number; wornRarity: string }[] = [];

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
  if (econ.length)
    out.push(
      `economy (${econ.length} seeds): first epic mean ${avg(econ.map((e) => e.epic)).toFixed(2)} ` +
        `[${econ.map((e) => e.epic).join(', ')}]; legendary within two visits ${econ.filter((e) => e.follows).length}/${econ.length}; ` +
        `bag at dive 12 mean ${avg(econ.map((e) => e.bag)).toFixed(1)} [${econ.map((e) => e.bag).join(', ')}]; ` +
        `links held ${avg(econ.map((e) => e.links)).toFixed(1)}; worn weapon ${econ.map((e) => e.wornRarity).join(', ')}`,
    );
  console.log(out.join('\n'));
});

describe('constructs pacing, scratch', () => {
  for (const seed of seeds) {
    it(`fire ${seed}`, () => void lines.push(line('fire', seed, runAutopilot(registry, { seed, dives: DIVES }).reports)), 900_000);
    it(`beeline ${seed}`, () =>
      void lines.push(line('beeline', seed, runAutopilot(registry, { seed, dives: DIVES, policy: 'beeline' }).reports)), 900_000);
    if (seed <= SEED0 + 7)
      it(`frost ${seed}`, () =>
        void lines.push(line('frost', seed, runAutopilot(registry, { seed, dives: DIVES, primary: 'frost' }).reports)), 900_000);
    it(`economy ${seed}`, () => {
      const e = economySim(registry, seed, DIVES);
      econ.push({
        seed,
        epic: firstEpicDive(e),
        follows: legendaryFollowsEssence(e),
        bag: e.profile.constructs.length,
        links: e.profile.links,
        wornRarity: e.profile.equipped.weapon?.rarity ?? 'none',
      });
    }, 900_000);
  }
});
```

Run it in two shards (PowerShell; each about 30–45 min):

```
cd packages/engine
$env:SEED0='1'; $env:SEEDS='8'; npx vitest run tests/scratch-constructs-sweep.test.ts --reporter=dot 2>&1 | Tee-Object -FilePath "$P/constructs-pacing-shard1.txt"
$env:SEED0='9'; $env:SEEDS='8'; npx vitest run tests/scratch-constructs-sweep.test.ts --reporter=dot 2>&1 | Tee-Object -FilePath "$P/constructs-pacing-shard2.txt"
```

(`$P` spelled out as the scratchpad path above; Git Bash: `… | tee $P/constructs-pacing-shard1.txt`.) Combine the two shards' printed lines by hand from those files (means weighted equally: 8 + 8). `EconomyReport.profile` is the final profile (CLAUDE.md's Crafting); if D1 renamed a field, use D1's name.

- [ ] **Step 3: the one rail the spec retires.** `delve-pacing.test.ts`'s "before dive 1 the kit forges" pins `first.opened: true` (the kit's uncommon flux forged a Primary before dive 1). The spec (§7) removes that reason: a new save's common sword already holds two Primary constructs, so the bot forges before dive 1 only when Power rises by `MIN_FORGE_GAIN`. First `git log --oneline -3 -- packages/engine/tests/delve-pacing.test.ts packages/engine/tests/delve-pacing-robust.test.ts`: if D1 already changed this expectation, skip this step. Else, if (and only if) Step 1 fails that test with `opened: false` while `kitAlone: false, withDive1: true, forged: true` hold on every seed, and that test is not the one failure `01-contract.md`'s Base names (a pre-existing failure is not this rule's), change the two expectations (in `delve-pacing.test.ts` and `delve-pacing-robust.test.ts`) from

```ts
      expect(first, `seed ${SEEDS[i]}`).toEqual({ opened: true, kitAlone: false, withDive1: true, forged: true });
```

  to

```ts
      // The kit may or may not forge before dive 1 since the constructs (the common sword holds a Primary already): only the magic forge after dive 1 is pinned.
      expect(first, `seed ${SEEDS[i]}`).toMatchObject({ kitAlone: false, withDive1: true, forged: true });
```

  and the test names' "before dive 1 the kit forges; after it," → "after dive 1," (`delve-pacing.test.ts`) and "the kit forges before dive 1, and dive 1 pays" → "dive 1 pays" (`delve-pacing-robust.test.ts`). `FirstForges.opened` and `tests/fixtures/pacing.ts` stay (the DPS Lab's Economy view may still read it). Any other failing expectation is a real move: Step 5. Commit alone: `git add packages/engine/tests/delve-pacing.test.ts packages/engine/tests/delve-pacing-robust.test.ts && git commit -m "test(engine): the first-forge rail no longer pins a forge before dive 1 (constructs)"` with the trailer.

- [ ] **Step 4: read against the bands** (CLAUDE.md's Pacing guard rails, and the boons' v0.70.0 baseline: Fire 5.0 / 27.5 / 45.1, 4.3 deaths, about 62 s a floor; beeline dive 12 45.8 (1.02 ×), 33 s; Frost dive 12 49.5; first epic 4.1; legendary within two visits 16/16, owned at dive 12 15/16):
  - floor time: a full clear 40–75 s a floor, a beeline 25–55 s, the clear ≥ 1.25 × the beeline; no floor `timedOut`;
  - a beeline's dive-12 depth ≥ 0.80 × a full clear's;
  - the first dive: every seed ≥ depth 3, the mean 3–12; dive 12 > dive 1 + 5 and > dive 6 (Fire and Frost);
  - the economy: the first epic's 16-seed mean ≤ 5.5 (each seed of 1–4 by dive 6), the first legendary within two visits of the first essence (15/16 or better), three seeds in four owning a legendary at dive 12;
  - the forced pairs (the rail's own run): each pair's dive-4 mean 0.6–1.6 × the median;
  - the tutorial bot: every run done, no skip, no death; the maps sweep: every floor exits, no body in a wall;
  - **this stage's reads:** the bag at dive 12 (a mean over about 30 constructs, or any seed over 60, says auto-salvage of plain constructs isn't holding it, or the bot never salvages: note it for the integrator, and check `autoSalvagePlain` is on in `createDelveProfile`); the Links held (a mean over about 10 at dive 12 says the bot has nothing to spend them on: the ceilings are reached early); the worn weapon's rarity at dive 12 (epic or legendary on most seeds, as before).
  Early weapons running ahead shows as dive 1's mean above 12 or dive 6's well above 27.5 with deaths down; stalling as a first epic late or dive 12 under 40.

- [ ] **Step 5: tune only if a rail moved out of its band**, in this order, one lever at a time, re-running the failing rail first and Step 2's sweep before committing:
  1. `balance.json → delve.movesets.slots`: trim the early rows' starts (the common Primary `[2, 3]` → `[1, 3]` is the spec's own fallback: a Jump in hero still casts from the start; the uncommon Defensive `[1, 2]` → `[0, 2]` next), never a ceiling below its start, never the legendary's 5s (`MovesetsBalanceSchema` refuses both);
  2. `delve.movesets.openSkill`: raise the common and uncommon rows' flux or scrap if the bot opens Defensives and Ultimates faster than it forged before (the old Awaken was 1 epic flux + 2 Links + 120 scrap on a rare);
  3. `delve.movesets.extraSlots` (fewer free slots on magic and rare drops) only if the first two don't move it.
  Never the rails, the floor-time bands, the fixtures or the economy targets. After a tuning commit, re-run `npx vitest run tests/delve-movesets.test.ts tests/delve-constructs*.test.ts tests/delve-moveset-balance*.test.ts --reporter=dot` (A's and B2's model and data tests; `ls tests | grep -i "moveset\|construct"` for the names) as well as the rails: a pinned slot count moves with the table and is re-pinned with the sweep as its reason.

- [ ] **Step 6: record** the rails' result, the 16-seed numbers and every lever tried (and its numbers) under **Record**; the final numbers go into CLAUDE.md in Task 11. Delete the scratch file: `rm packages/engine/tests/scratch-constructs-sweep.test.ts`.
- [ ] **Step 7: commit** only if tuned: `git add packages/engine/src/data/balance.json packages/engine/tests && git commit -m "balance(engine): the slot table tuned against the pacing rails"` with the trailer.

---

### Task 5: D02's pinned seed

`e2e/delve.spec.ts` D02 plays seed 5's first floor with the E2E's armed hero and expects gear from an elite at every steady step; `tests/delve-banking.test.ts` pins it ("seed 5's first floor, played by the bot with the E2E's armed hero, drops gear at any frame rate"). The armed hero changed (an uncommon sword now holds two Primary constructs and a Defensive slot, and D1's bot plays them), so the floor plays differently.

**Files:** read `packages/engine/tests/delve-banking.test.ts` (the `'the E2E dives'` describe at its end); modify its seed only if Step 1 fails, and then `packages/client/e2e/delve.spec.ts` D02's comment and `seedProfile(page, 5)` to match.

- [ ] **Step 1: run the pin.** `cd packages/engine && npx vitest run tests/delve-banking.test.ts -t "E2E" --reporter=dot`. Expected: pass (seed 5 still drops gear at 60, 30, 20, 15 and 10 fps). If it passes, this task is done; record "seed 5 holds".
- [ ] **Step 2: if it fails, find the next seed.** A scratch loop in the same file's describe (never committed): wrap the body in `for (const seed of [5, 6, 7, …, 40])` with `console.log(seed, fps, world.exited, items.length)` and run it once; pick the lowest seed whose first floor the bot exits with gear at all five rates. Put that seed in the pin's `createDelveProfile(registry, <seed>, …)` and its test name, in D02's `seedProfile(page, <seed>)` and the comment above it ("seed <n>'s first floor…"), and note it for Task 11 (CLAUDE.md's Room objects bullet says "D02's gear floor is seed 5 (seed 3 until the steered dodge, v0.71.0)").
- [ ] **Step 3: commit** only if re-pinned: `git add packages/engine/tests/delve-banking.test.ts packages/client/e2e/delve.spec.ts && git commit -m "test: D02's gear floor re-pinned to seed <n> (the armed hero's constructs)"` with the trailer.

---

## Chunk 2: the E2E

### Task 6: the E2E seeds mint uids

Every E2E that seeds a save builds weapons with `defaultMoveset` (the fixture's `armed`, the gamepad spec's `setup`, the pad-nav spec's `bagOf`, the runes spec's `heroWith` and `socketed`, D1's tutorial spec) and writes the JSON straight into localStorage. Save v14 requires a `uid` on every construct (`MoveSchema` / `BlowSchema`, the contract's "Save and load"), and `defaultMoveset` makes none (`plainConstruct` has no uid), so every such save would reset at load ("The forge changed: your save was reset"). One fixture helper mints them, applied at each seed site.

**Files:** modify `packages/client/e2e/fixtures/delve.ts`, `packages/client/e2e/delve-gamepad.spec.ts`, `packages/client/e2e/delve-pad-nav.spec.ts`, `packages/client/e2e/delve-runes.spec.ts`, `packages/client/e2e/responsive/specs/delve-anvil.spec.ts`.

- [ ] **Step 1: read the engine's minting.** `grep -n "export function mintUid" -A 6 packages/engine/src/delve/profile.ts` (the contract: `mintUid(profile): [uid, profile]`, `c${nextUid}`) and `grep -n "nextUid" packages/engine/src/types/delve.ts`. If A exported a whole-profile minter (`grep -rn "export function mint" packages/engine/src/delve/`), use it in place of the helper below and skip to Step 3.
- [ ] **Step 2: the helper** in `e2e/fixtures/delve.ts`, after `armed` (add `mintUid`, `type Construct` and `type GearItem` to the `@alloy/engine` import):

```ts
/**
 * `p` with a uid minted (`mintUid`) for every construct of its worn and bag weapons that has
 * none: save v14 requires them, and `defaultMoveset` makes plain constructs without.
 */
export function withUids(p: DelveProfile): DelveProfile {
  let out = p;
  const mint = <C extends Construct>(c: C): C => {
    if (c.uid) return c;
    const [uid, next] = mintUid(out);
    out = next;
    return { ...c, uid };
  };
  const weapon = (w: GearItem): GearItem => {
    if (!w.moveset) return w;
    const chains = Object.fromEntries(
      Object.entries(w.moveset.chains).map(([skill, chain]) => [
        skill,
        { ...chain, moves: (chain as { moves: Construct[] }).moves.map(mint) },
      ]),
    );
    return { ...w, moveset: { ...w.moveset, chains } };
  };
  const worn = out.equipped.weapon ? weapon(out.equipped.weapon) : out.equipped.weapon;
  const bag = out.bag.map((i) => (i.slot === 'weapon' ? weapon(i) : i));
  return { ...out, equipped: { ...out.equipped, weapon: worn }, bag };
}
```

  Then in `seedProfile`, `profile = { ...profile, ...over };` → `profile = withUids({ ...profile, ...over });` (after `over`, so a test's own bag weapons are minted too), and update `armed`'s doc comment: "a new save's common sword carries the basic chain alone (see the tutorial spec's carries), so a test of the Primary arms the hero first, as its first forge would" → "an uncommon sword holds a Defensive slot beside its two Primary constructs (see the constructs spec's slot table), so a test of every skill arms the hero first, as its first forge would".
- [ ] **Step 3: the other seed sites.** `delve-gamepad.spec.ts` `setup`: `const save = JSON.stringify({ …profile, equipped: …, runes: …, bag: … })` → build the object, pass it through `withUids(...)`, then stringify (import `withUids` from `./fixtures/delve`); its doc comment's "(a new save's common sword carries no Primary)" → "(the slot table's uncommon row: a Defensive slot too)". `delve-pad-nav.spec.ts` `seed`: `const save = JSON.stringify(profile);` → `const save = JSON.stringify(withUids(profile));`. `delve-runes.spec.ts` `seed`: `JSON.stringify(profile)` → `JSON.stringify(withUids(profile))` (its R06 builds an Ultimate move by hand: covered). `responsive/specs/delve-anvil.spec.ts`: `JUNK` goes through `seedProfile`'s `over`: covered. D1's `delve-tutorial.spec.ts` seeds through `seedProfile` and its own TU04 object: tell the integrator (Open questions) that TU04's `bag: [{ ...rare, moveset: defaultMoveset(...) }]` needs `withUids` too if D1 wrote its own save.
  `delve-training.spec.ts` has its own `seed` helper that writes a bare `createDelveProfile` to `alloy:delve:v2` directly (not through `seedProfile`): it loads on the assumption that A's `createDelveProfile` mints the starting sword's constructs' uids (the contract's "Save and load"); Task 7 Step 6 confirms it (T01 opens the Anvil without the reset toast).
- [ ] **Step 4: typecheck.** `cd packages/client && npx tsc --noEmit -p .` (the E2E is in the client's `tsconfig`; if not, `npx tsc --noEmit -p e2e/tsconfig.json` or whichever `playwright.config.ts`'s project uses). Expected: clean. Then one smoke run: `npx playwright test e2e/delve.spec.ts -g "D01" --project=desktop --reporter=dot`. Expected: D01 passes (the save loads: no reset toast; the Anvil opens on the armed sword).
- [ ] **Step 5: commit.** `git add packages/client/e2e && git commit -m "test(client): the E2E seeds mint construct uids (save v14)"` with the trailer.

---

### Task 7: the specs that read the old model

Each change below is one of: a selector the contract renamed, a text the slot table changed, or a price the pull rule changed. Read C1's and C2's components for the exact strings first: `grep -rn "data-testid=\"\(chain-slots\|chain-ceiling\|add-slot\|move-add\|take-move-all\|weapon-frame\|temper-open-skill\|construct-bag\|rune-pull\)\"" packages/client/src/features/delve` and `grep -n "slots\b\|of \${" packages/client/src/features/delve/hub/skills/ChainLane.tsx`.

**Files:** modify `packages/client/e2e/delve.spec.ts` (D04, D08), `packages/client/e2e/delve-gamepad.spec.ts` (G08), `packages/client/e2e/delve-runes.spec.ts` (R01), `packages/client/e2e/delve-training.spec.ts` (T01).

- [ ] **Step 1: D04 (`delve.spec.ts`).** The seeded hero is armed (an uncommon sword: Primary `[2, 3]`, Defensive `[1, 2]`, Ultimate `[0, 1]`), its Primary two plain Strikes (a melee weapon's default form), so:
  - `await expect(page.getByTestId('ability-readout')).toContainText('light Wildfire Burst');` stays (move-0 edited: Burst is a shared form, allowed on a sword).
  - `await expect(summary).toHaveText('light Wildfire Burst');` → `await expect(summary).toContainText('light Wildfire Burst');` (the second construct follows it in the summary).
  - The slot lines: `'1 of 1 slots'` → `'2 of 3 slots'`, and after `add-slot` `'2 of 2 slots'` → `'3 of 3 slots'`; `await expect(summary).toHaveText('light Wildfire Burst · medium Wildfire Burst');` → `await expect(summary).toContainText('· ')` is too weak: assert the count instead, `await expect(page.getByTestId('chain-cards').locator('[data-construct]')).toHaveCount(3);` (the new slot arrives plain: its text is `plainConstruct`'s, the next default kind of Strike, read it if you want it pinned: `cd packages/engine && node -e "…"` is not worth it). The comment "A Link and 20 scrap buy a second slot, holding the chain's next default move." → "Links and scrap buy the third slot (the ceiling), holding a plain construct." The seed's `{ links: 1, scrap: 20 }` must cover `slotPrice` for that slot: `grep -n "slotLinks\|slotScrap" packages/engine/src/data/balance.json` and `grep -n "export function slotPrice" -A 12 packages/engine/src/delve/moveset.ts` say whether the price indexes by the slot's position (the third slot: `slotLinks[2]` = 3 Links, 60 scrap) or by the slots bought (the first bought: 1 Link, 20 scrap); seed what it needs and make `links-count`'s expectation match (`'3 Links'` or `'1 Link'`).
  - `await expect(page.getByTestId('move-add')).toHaveCount(0);` stays (at the ceiling).
  - Temper: `await expect(page.getByTestId('temper-row')).toHaveCount(2);` → the worn uncommon sword now also offers Open a skill (its Ultimate at 0 of 1): `toHaveCount(3)` and add `await expect(page.getByTestId('temper-open-skill')).toBeVisible();`. If C2 lists Open a skill once a weapon with any openable skill (not once a skill), keep 3; if once a skill, read the count C2 renders (`grep -n "temper-open-skill" packages/client/src/features/delve/hub/forge/Temper.tsx`).
  - `codex-unknown` 12 and `reaction-unknown` 15 stay.
- [ ] **Step 2: D08 (`delve.spec.ts`).** The comment "The common sword carries the Basic alone: the others show locked." and the two `Carried by … weapons and better` expectations go; a Jump in save's common sword holds two Primary Strikes, a Defensive at 0 of 1 and an Ultimate at 0 of 0:

```ts
    // The common sword's slot table: two Primary constructs, a Defensive to open, no Ultimate.
    await page.getByTestId('chain-skill-primary').click();
    await expect(page.getByTestId('chain-cards').locator('[data-construct]')).toHaveCount(2);
    await expect(page.getByTestId('chain-slots')).toHaveText('2 of 3 slots');
    await page.getByTestId('chain-skill-defensive').click();
    await expect(page.getByTestId('chain-slots')).toHaveText('0 of 1 slots');
    await page.getByTestId('chain-skill-ultimate').click();
    await expect(page.getByTestId('chain-slots')).toHaveText('0 of 0 slots');
```

  Use C1's exact text for a skill at 0 slots (`chain-slots` may read "Open at the Forge" or "Not on a common weapon": `grep -n "chain-slots" -B 4 -A 8 packages/client/src/features/delve/hub/skills/ChainLane.tsx`); the Frost gear check after it stays. The `summary` const goes if unused.
- [ ] **Step 3: G08 (`delve-gamepad.spec.ts`).** Test name: "…A opens the take sheet, Transfer wears it with your moveset; X on the worn weapon unequips" → "…A opens the take sheet, Move all wears it with your constructs; X on the worn weapon unequips". The prompt text `'Equip or transfer'` → C2's label (`grep -n "Equip or" packages/client/src/features/delve/hub/loadout/*.tsx`; the spec's wording is "Equip or move all"). `page.getByTestId('take-transfer')` → `page.getByTestId('take-move-all')`; the comment "A on Transfer moves the moveset onto the axe" → "A on Move all moves the constructs onto the axe". The axe is rare (Primary `[3, 4]`): the sword's two Primary constructs fit, its Basic blows (three) fit the axe's string (3), nothing goes to the bag. Add after the `take-sheet` count check: `expect((await save()).constructs).toEqual([]);` only if the sword's string and the axe's match (`grep -n '"defaultChain"' packages/engine/src/data/delve.json` for sword and axe); else assert the bag holds the overflow blows (`toHaveLength(<n>)`).
- [ ] **Step 4: R01 (`delve-runes.spec.ts`).** "A filled socket shows its rune with Pull, which destroys it as shipped." → "A filled socket shows its rune with Pull, priced by tier as shipped (the pull rule 'pay')": `await expect(picker.getByTestId('rune-pull')).toContainText('destroys');` → `toContainText('50 scrap')` (`pullScrap[2]` for tier III: `grep -n pullScrap packages/engine/src/data/balance.json`; use C1's label if it formats the price otherwise, `grep -n "rune-pull" -A 6 packages/client/src/features/delve/runes/RunePicker.tsx`). Nothing else in the file reads the old model (R03's power-up stop is built by hand, `kind: 'powerups'`, and B2 keeps `stopKinds`' `'rune'`).
- [ ] **Step 5: T01 (`delve-training.spec.ts`).** The sandbox's default weapon is a rare sword (`SANDBOX_DEFAULTS` in `stores/sandboxStore.ts`), melee, so its default Primary is Strike: `'Primary: light Fire Bolt'` → `'Primary: medium Fire Strike'` (Strike's `defaultChain` starts medium: `grep -n '"strike"' -A 6 packages/engine/src/data/arpg.json`; C2's Training area made the sandbox's default Primary follow the class, spec §6). After `weapon-base-staff` the Primary follows to Bolt and the click must still count: add `await expect(ability0).toHaveAttribute('aria-label', 'Primary: light Fire Bolt');` after the `weapon-name` check. If C2 kept the sandbox's Primary as the user built it (Strike, dormant on a staff), the meter would count nothing: that is the spec's "a fresh sandbox sword has a live Primary" broken on the switch; fix it in C2's sandbox store (`followBasic`'s pattern for the Primary), not here.
- [ ] **Step 6: run the four files** on both Delve projects: `cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-runes.spec.ts e2e/delve-training.spec.ts --project=desktop --project=desktop-1080 --reporter=dot`. Expected: all pass (13 + 9 + 7 + 4 tests × 2 projects), and T01 reaches the Anvil and the Training Grounds without the reset toast ("The forge changed: your save was reset"): a bare `createDelveProfile` seed loads, so A mints the starting sword's uids (Task 6's assumption). D02 may play out without gear on a loaded browser (CLAUDE.md, Room objects): re-run it alone before investigating.
- [ ] **Step 7: commit.** `git add packages/client/e2e && git commit -m "test(client): the E2E reads the slot table, Move all and the pull price"` with the trailer.

---

### Task 8: the pad-navigation audits (PN01–PN07)

The Skills tab gained the bag pane (a pad group, A places, X salvages), the form grid lost a column (a sword's Primary offers Strike, Whirl, Lance and Burst: four, not five), and Temper gained Open a skill. PN01's ceilings and allowances are a ratchet: read the new counts, then set them.

**Files:** modify `packages/client/e2e/delve-pad-nav.spec.ts` (`ALLOW`, `CEILING`, their comments).

- [ ] **Step 1: run PN01 reporting.** PowerShell: `cd packages/client; $env:NAV_REPORT='1'; npx playwright test e2e/delve-pad-nav.spec.ts -g "PN01" --project=desktop --project=desktop-1080 --reporter=list`. Expected: PN01 fails on the screens whose stop count passed its `CEILING` (`skills`: the bag pane's rows and, after three autopilot dives, the Primary's cards; `skills-forms`: fewer; `temper`: one more) and prints each screen's stops and unreversed moves.
- [ ] **Step 2: set the ratchet** from the report, each with its reason in the comment:
  - `CEILING.skills`: 5 → the report's count (Realign, the Primary's cards, Add slot if one is buyable, the bag's rows for the Primary, Delve). Comment: "The strip's Realign, the Primary's cards, the bag pane's rows for it (the audit save's constructs after three dives) and Delve."
  - `CEILING['skills-forms']`: 5 → 4 ("The Primary's four forms on a melee weapon: Strike, Whirl, Lance and Burst"); `ALLOW['skills-forms']`: `[2, 2]` → what the report shows (a 2 × 2 grid reverses everywhere: expect `[0, 0]`; keep the printed number if the grid is 3 + 1).
  - `CEILING['skills-editor']`: 6 → the report's (the editor's rows are unchanged: Kind, Form, Elements, Position, Payment and a socket; a second socket on the audit save's first construct adds one).
  - `CEILING.temper`: 21 → 22 if Open a skill is a row on the worn weapon ("…the two operations the worn weapon can take (Upgrade and Open a skill)…").
  - `CEILING['stop-powerup']` stays (a guided stop's), `loadout` stays unless the compare pane's frame line added a stop (it shouldn't: a line, not a control).
  Never raise an `ALLOW` without reading the moves it prints (an unreversed move inside the bag pane is a layout bug in C1's pane: a ragged last row; report it, don't allow it).
- [ ] **Step 3: run all seven** on both projects: `npx playwright test e2e/delve-pad-nav.spec.ts --project=desktop --project=desktop-1080 --reporter=dot`. Expected: 7 × 2 pass (PN01–PN07 on both projects). PN02 (Loadout), PN03 (Skills: RB lands on the chosen card), PN04 (Forge), PN05 (Menu), PN06 (the stop) and PN07 (the budgets: equip, salvage, forge, an element edit, each ≤ 6 presses) are unchanged in what they ask; if PN07's element budget breaks, the bag pane sits between the card and the editor in the D-pad's order: that is C1's `data-pad-first` on the chosen card (the card must still lead); fix it there.
- [ ] **Step 4: commit.** `git add packages/client/e2e/delve-pad-nav.spec.ts && git commit -m "test(client): the pad audit's ceilings for the bag pane and the class's forms"` with the trailer.

---

### Task 9: the type floor and the responsive probes over the new panes

TY01 measures every Anvil tab, so the bag pane (on Skills) and Open a skill (on Temper) are measured already; the compare pane's frame line and the take sheet are not, nor is a bag with constructs in it. The responsive Anvil probe walks the same tabs; it gains a Skills probe with constructs in the bag and a Loadout probe with a bag weapon selected (the frame line, the Move all button).

**Files:** modify `packages/client/e2e/delve-type.spec.ts` (TY01), `packages/client/e2e/responsive/specs/delve-anvil.spec.ts`.

- [ ] **Step 1: a save with a bag weapon and loose constructs.** In both files, beside their existing seeds, a weapon and two constructs with uids (the constructs' uids are explicit, so `withUids` has nothing to mint; `nextUid` set past them):

```ts
// A rare bag axe (a frame to compare and Move all onto) and two loose constructs in the bag.
const CONSTRUCTS = (registry: DataRegistry) => {
  const axe = generateItem(registry, { uid: 'bag-axe', ilvl: 4, rarity: 'rare', slot: 'weapon', baseId: 'axe', mana: 'fire' }, new SeededRNG(7));
  return {
    bag: [{ ...axe, moveset: defaultMoveset(registry, axe, 'fire') }],
    constructs: [
      { uid: 'c9001', kind: 'medium', form: 'strike', elements: ['fire'], runes: [null] },
      { uid: 'c9002', kind: 'light', form: 'bolt', elements: ['fire'] },
    ],
    nextUid: 9100,
  } satisfies Partial<DelveProfile>;
};
```

  (`DelveProfile.nextUid`'s type and `Construct`'s shape: `grep -n "nextUid\|constructs" packages/engine/src/types/delve.ts`; if `nextUid` is a different counter, drop that line and let `withUids` leave the explicit uids alone.)
- [ ] **Step 2: TY01.** After the five tabs' loop and before the Skills editor measure, add:

```ts
    // The Loadout's compare pane on a bag weapon: the frame line and Move all here.
    await page.getByTestId('tab-loadout').click();
    await page.locator('[data-uid="bag-axe"]').click();
    await expect(page.getByTestId('weapon-frame')).toBeVisible();
    await measure(page, 'loadout-weapon');
    // The Skills tab's bag pane with constructs in it.
    await page.getByTestId('tab-skills').click();
    await expect(page.getByTestId('construct-bag').locator('[data-construct]')).toHaveCount(1); // the Primary's filter: the Strike
    await measure(page, 'skills-bag');
```

  and seed with it: `await seedProfile(page, 4242, false);` → `await seedProfile(page, 4242, false, undefined, CONSTRUCTS(registry));` (a `const registry = createDefaultRegistry();` at the top of the test; the imports `createDefaultRegistry`, `defaultMoveset`, `generateItem`, `SeededRNG`, `type DataRegistry`, `type DelveProfile` from `@alloy/engine`). The take sheet is the pad's (A on the weapon); its text is the compare pane's buttons' and the kit `Dialog`'s, both measured elsewhere: not opened here.
- [ ] **Step 3: the responsive probe.** In `delve-anvil.spec.ts`, after the benches loop (`for (const bench of ['forge-preview', 'temper', 'materials'] …)`), add two probes in the same `for (const vp …)`:

```ts
  // The Skills tab's bag pane with constructs in it, and the Loadout's compare pane on a bag weapon.
  for (const view of ['skills-bag', 'loadout-weapon'] as const) {
    test(`Delve Anvil ${view} @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seedProfile(page, 4242, false, undefined, CONSTRUCTS(registry));
      await textSizeFor(page, vp);
      await page.goto('/delve');
      if (view === 'skills-bag') {
        await page.getByTestId('tab-skills').click();
        await expect(page.getByTestId('construct-bag').locator('[data-construct]')).toHaveCount(1);
      } else {
        await page.locator('[data-uid="bag-axe"]').click();
        await expect(page.getByTestId('weapon-frame')).toBeVisible();
      }
      await runProbes(`delve-anvil-${view}`, vp, { delve: {} });
    });
  }
```

  (`defaultMoveset` and `type DataRegistry`, `type DelveProfile` join its `@alloy/engine` import.)
- [ ] **Step 4: run them.** `cd packages/client && npx playwright test e2e/delve-type.spec.ts --project=desktop-1080 --reporter=dot` (TY01 and TY02; TY01 prints each screen's shares with `TYPE_REPORT=1`) and `npx playwright test e2e/responsive/specs/delve-anvil.spec.ts --project=responsive --reporter=dot` (8 viewports × 16 cases). Expected: all pass: no text under 16 design px on the bag pane, the frame line, the Open a skill row (TY01) and no probe failure (text under 12 CSS px, overflow, a clipped control) at any viewport. A failure names the element: it is C1's or C2's type size (`k-caption` on a construct row's reason, a frame line's chips); fix it in the component with the kit's classes, never by lowering the floor.
- [ ] **Step 5: commit.** `git add packages/client/e2e && git commit -m "test(client): the type floor and the responsive probes over the bag pane and the weapon frame"` with the trailer.

---

### Task 10: the whole E2E (every project)

- [ ] **Step 1: the Delve specs on both desktop projects.** `cd packages/client && npx playwright test --project=desktop --project=desktop-1080 --reporter=dot` (about 30–40 min: `delve.spec.ts` D01–D13, `delve-gamepad` G01–G09, `delve-hud`, `delve-pad-nav` PN01–PN07, `delve-quests` Q01–Q04, `delve-room-objects` O01, `delve-runes` R01–R07, `delve-training` T01–T04, D1's `delve-tutorial` TU01–TU04, `delve-type` TY01–TY02). Expected: all pass. Under load, re-run a lone failure alone (`npx playwright test e2e/<file> -g "<id>" --project=<project>`) before investigating; a failure that repeats alone is real. R07 (the DPS Lab's grid starved and supported) now runs on the reference weapons: slower, within its `LAB_READY`.
- [ ] **Step 2: the responsive project.** `npx playwright test --project=responsive --reporter=dot` (the viewport matrix over the title screen, the Anvil's 18 cases, the dive, the pause, the stop and Training; about 30 min). Expected: all pass.
- [ ] **Step 3: record** the counts (passed, skipped, durations) under **Record**. Nothing to commit unless a step forced a fix (one commit each, named for the fix).

---

## Chunk 3: CLAUDE.md, the bump and the close

### Task 11: CLAUDE.md

Hand edits only (CRLF kept; no formatter). Measured numbers come from Tasks 2, 3 and 4: every `{{...}}` below must be filled before the commit (`grep -n "{{" CLAUDE.md` must print nothing). The Delve section's bullets are one line each; an edit replaces the whole line where the text below says so, else the quoted phrase alone. Verify each name you don't recognise against the merged code before writing it (`grep -rn "<name>" packages/engine/src packages/client/src -l`): the text below follows the overview's contract and the spec, and an area may have named a detail otherwise.

**Files:** modify `CLAUDE.md`.

- [ ] **Step 1: the intro paragraph** (line 71, "Real-time top-down ARPG…"), two phrases:
  - `The hero has four skills, each a **chain** of up to five **moves** carried by the weapon (see Weapon movesets) that the player builds at the Anvil:` → `The hero has four skills, each a **chain** of up to five **constructs** (moves and basic blows that are items, with sockets of their own, kept in a weapon's slots or in the bag; see Weapon movesets and constructs) that the player builds at the Anvil:`
  - `a **form** (12, e.g. Bolt, Ward, Maelstrom)` → `a **form** (15, e.g. Bolt, Ward, Maelstrom; a melee or a ranged weapon expresses the forms of its class and the shared ones, each in its own cast style: see Forms by class and cast styles)`
- [ ] **Step 2: the Spec bullet** (line 72): `the guided start (the tutorial, carries by rarity, Awaken, legendaries from depth 20, quests unlocking on completion)` → `the guided start (the tutorial, legendaries from depth 20, quests unlocking on completion)`; and at the bullet's end, after the pad-first UI entry, add `; weapon identity and constructs (classes, the 15 forms, cast styles, the signature hook, constructs with uids, the bag, slots by rarity, Open a skill, Move all, the pull rule 'pay'): `docs/superpowers/specs/2026-10-07-delve-weapon-identity-and-constructs-design.md``.
- [ ] **Step 3: the Engine bullet** (line 73): `` `src/loot/` (item generation, drops, smithing, `moveset.ts` weapon movesets, and crafting's `` → `` `src/loot/` (item generation, drops, smithing, `moveset.ts` weapon movesets and constructs (the model's pure parts), and crafting's ``; and `` `src/delve/` (hero stats, attunement, Power, dive state machine, profile ops, `moveset.ts` moveset edits, slots and transfers, `stops.ts` `` → `` `src/delve/` (hero stats, attunement, Power, dive state machine, profile ops, `moveset.ts` chain edits and slots, `constructs.ts` the construct ops (the draft, placing, unsocketing, Move all, a construct's salvage), `stops.ts` ``; and in `src/arpg/`'s list, after `` `forms.ts` runs each form, `` add `` `signatures.ts` the weapon × form signature table (empty; `signatureFor`, `withSignature`), ``; and `` `resolve.ts` compiles a chain into a `ResolvedChain` (each move a `ResolvedAbility` at its kind's weight, `` → `` `resolve.ts` compiles a chain into a `ResolvedChain` (each move a `ResolvedAbility` at its kind's weight, the weapon's cast style applied first (`applyStyle`), ``.
- [ ] **Step 4: the Data bullet** (line 74): `` `src/data/delve.json` (gear bases, affixes, legendaries, biomes, doors) `` → `` `src/data/delve.json` (gear bases with their `class` and cast `style`, affixes, legendaries, biomes, doors) ``; `` `src/data/arpg.json` (mana, forms, element traits, fusions, reactions, masteries) `` → `` `src/data/arpg.json` (mana, the 15 forms with their `class` and melee versions, element traits, fusions, reactions, masteries) ``; and after `` `delve.abilities` holds slot costs, weight and payment numbers; `` add `` `delve.movesets` the slot table and Open a skill's prices (see Weapon movesets and constructs); ``.
- [ ] **Step 5: the Pacing guard rails bullet** (line 76), at its end after `(skipped unless `SIM_PERF` is set; see Boons).` add: `` The cast styles' gate is `tests/delve-style-gate.test.ts` (skipped unless `STYLE_GATE` is set; see Forms by class and cast styles); the rune gates measure each form on a reference weapon (the sword for melee forms, the staff for ranged, both for shared). ``
- [ ] **Step 6: the Elemental affinity bullet** (line 77): `the equipped gear re-attunes to it and the weapon's moveset resets to its base slots in that mana` → `the equipped gear re-attunes to it and the starting weapon's constructs are replaced with plain ones in that mana`; and `(only the Training Grounds keep `followBasic`/`isDefaultBasic`, in `arpg/abilities/resolve.ts`, for their default basic chain)` → `(only the Training Grounds keep `followBasic`/`isDefaultBasic`, in `arpg/abilities/resolve.ts`, for their default basic chain, and their default Primary follows the weapon's class default form the same way)`.
- [ ] **Step 7: the new bullet, Forms by class and cast styles.** Insert as a new line right after the **Elemental stacks and pair reactions** bullet (line 78) and before **Weapon movesets** (line 79):

```markdown
- **Forms by class and cast styles** (spec: `docs/superpowers/specs/2026-10-07-delve-weapon-identity-and-constructs-design.md`; v0.76.0, save v14): every weapon base has a **class**, `GearBaseDef.class` (`WeaponClass`: dagger, sword, axe and maul `melee`; staff, wand and bow `ranged`; unarmed none, `weaponClass(registry, baseId)`), and every form a `class` (`FormDef.class`, `FormClass`: `melee`, `ranged` or `both`), so a weapon expresses the forms of its class and the shared ones (`formAllowed(registry, baseId, form)`; unarmed none). The 15 forms (`arpg.json → forms`, `FormId`): the Primary's Strike and **Whirl** (melee; Whirl: the hero spins for about 1.5 s, hitting everything around, and keeps moving), Bolt and Volley (ranged), Lance and Burst (both); the Defensive's Armor (melee), **Repel** (ranged: a pulse that knocks nearby foes back and slows them), Ward, Surge and Blink (both); the Ultimate's **Onslaught** (melee: the hero darts between the foes in the target area, striking several times, untouchable while darting, then 30% less damage taken for 2 s), Barrage (ranged), Nova and Maelstrom (both); each melee-only form has a ranged counterpart (Strike / Bolt, Whirl / Volley, Armor / Repel, Onslaught / Barrage). A shared form with a different melee version carries a `melee` block (`FormDef.melee`: `range`, `radius`, `motion`, `speed`, `text`), laid over the row first on a melee weapon: Lance a lunge (the hero drives about 5 units along the line, hitting every foe it passes, no i-frames), Burst an eruption (a slam, and the ground erupts at the aim point within about 5 units), Maelstrom centred on the hero and moving with it. Surge is one multiplier (×1.3 for 6 s) on every timer the hero runs (attack speed, move speed, cooldowns, beats and wind-ups, mana regen, charge gain and dodge recharge; its own cooldown not sped up), and Blink lands with 0.5 s of invulnerability after its dash. `defaultForm(registry, slot, cls)` replaces `DEFAULT_FORMS`: the Primary's Strike on a melee weapon, Bolt otherwise; Ward and Nova for both. **Cast styles:** each weapon base has a `style` (`GearBaseDef.style`, `CastStyle { name, numbers, motion, trait, look }`; `HeroWeapon.class` and `style`, set by `computeHeroStats`): dagger Quick, sword Balanced (the baseline: every factor 1, a step bonus), axe Sweeping, maul Heavy, staff Channeled, wand Seeking, bow Marksman (the spec's §4.1 table; the values in `delve.json`). `resolveAbility` applies it after the form and before the knobs: `applyStyle(form, cls, style)` (exported from `resolve.ts`) scales the form's wind-up, cooldown, power, range, radius, projectile speed and duration by `style.numbers` (`StyleNumbers`, 1 unchanged), the melee block first; with every factor 1 and no melee block the form comes back unchanged (pinned by a test). The `trait` is a knob partial merged first, like a built-in rune that costs nothing: the bow's `pierce` 1, the maul's stagger, the staff's zone (Linger's knob with its own small numbers and the per-cast cap), the sword's step bonus, and the three knobs new in v0.76.0, each with one handler and a Power term: `critBonus` (the dagger: crit chance added to the move's hits, never the hero's `critChance`), `cleave` (the axe: a single-target hit cleaves a small arc behind its first foe) and `homing` (the wand: shots home toward foes, radians a second). The `motion` (`StyleMotion`: `dart`, `step`, `wade`, `plant`, `sway`, `orbit`, `back`) is a push on `HeroEntity.pushes` added to the form's own motion (its `motion`, `stepIn` and recoil, the melee Lance's lunge), never in its place. The `look` (`StyleLook`: blade, crescent, hatchet, stone, orb, spark, arrow) is client-only: `ResolvedAbility.look`, carried by the `cast`, `hit`, `beam`, `slash`, `explode` and `dash` events (`look`) and drawn as a motif on the casts' shots and impacts (`arena/fx/`, as the infusion motifs are). Basic blows keep their `feel` rows. **The signature hook** (`arpg/abilities/signatures.ts`): `SIGNATURES`, a table keyed `'<baseId>:<form>'` (`SignatureKey`) naming a behaviour `executeForm` dispatches to before its `switch` (`signatureFor`); it ships empty, and `withSignature` binds one for a test (the fixture proves a bound entry replaces the form's behaviour); the spec's §5 catalogues the 29 signatures of phases 2–5. **Detonate** is the 15th rune (Shape; fits Strike, Whirl, Volley, Lance and Onslaught, the forms that hit by contact with no blast of their own): each foe a move hits by contact sets off a blast of `detonate` power around it (`impact.ts`), at a `power` trade-off, with its term in Power. Legendaries keep matching by form id (Pyroclasm's Bolt and Barrage fire on ranged weapons only, Bedrock's Armor melee-only; accepted, a content pass may rebalance them). **The balance gate** (spec §4.4; the DPS Lab's `'style'` view and `tests/delve-style-gate.test.ts`, skipped unless `STYLE_GATE` is set): every weapon × form pair its class allows, the form's default chain at its skill's default payment, in Fire, no runes, at depth 10, full mana, on one dummy and on the pack over eight seeds (`RUNE_SEEDS`); each pair within 0.85–1.2× the median of that form across its class's weapons, and each weapon's mean over its forms within 0.9–1.1× the mean of all weapons; when it fails, tune the style numbers, then the trait, never the band. The other Lab views and gates (`dpsCombos`, the rune view, `runeComboSetups`, the rune balance gate and the two-build gate) measure each form on a reference weapon: the sword for melee forms, the staff for ranged, both for shared. Measured at v0.76.0: {{STYLE_RESULT}}. The client: the item header shows the class and style ("Ranged · Marksman: pierces one foe", `items/ItemHeader.tsx`); the Skills tab's form picker offers only the class's forms; the arena draws the look's motif; the Training Grounds apply the class rules (a sandbox weapon of the other class leaves its class-only moves dormant, shown as at the Anvil, and the sandbox's default Primary follows the class default form, so a fresh sandbox sword has a live Primary); Help has a topic in the constructs frame ("A move is a construct that channels your mana; your weapon decides how it's expressed").
```

- [ ] **Step 8: the Weapon movesets bullet** (line 79, the whole line) becomes:

```markdown
- **Weapon movesets and constructs** (specs: `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md`, remade by `docs/superpowers/specs/2026-10-07-delve-weapon-identity-and-constructs-design.md`; v0.76.0, save v14): every move and basic blow is a **construct** (`Construct = Move | Blow`, `types/ability.ts`): an item with a `uid` (`c<n>` from `profile.nextUid`, `mintUid(profile)`, minted as it enters the profile: `addLootToBag`, `forge`, `setChains`' new constructs, `addSlot`, `openSkill`, `upgradeGear`'s fills and `chooseStartingMana`; a world drop's have none until it banks), its kind, form and elements (a blow its element) and its own sockets, `runes`. A construct belongs to one skill (a blow the Basic, a move its form's slot; `constructSkill`) and sits in exactly one place: a slot of a weapon, or the **bag**, `profile.constructs` (unlimited, no bag space). **The weapon is a frame:** its class and cast style (see Forms by class and cast styles) and, for each skill, its **slots**, `GearItem.moveset` (`Moveset { chains, slots, bought }`): `slots[skill]` the slots it has (absent or 0: no chain; `chains[skill]` exists exactly when `slots[skill] > 0`), `bought[skill]` how many were bought with Links or Open a skill (free extra slots are not). Its rarity sets each skill's start and ceiling (`balance.json → delve.movesets.slots`, `[start, ceiling]` by skill, the Basic's start 0 meaning the weapon's string; `slotRange(registry, owner, skill)`, `ceilingOf`): the Basic starts at the weapon's `defaultChain` (a string longer than the ceiling keeps its length) and grows to 3 on common and uncommon, 4 on magic and rare, 5 on epic and legendary; the Primary 2 → 3 (common, uncommon), 3 → 4 (magic, rare), 4 → 5 (epic, legendary); the Defensive 0 → 1 (common), 1 → 2 (uncommon, magic), 2 → 3 (rare), 2 → 4 (epic), 3 → 5 (legendary); the Ultimate 0 → 0 (common), 0 → 1 (uncommon, magic), 1 → 2 (rare), 1 → 3 (epic), 2 → 5 (legendary){{SLOTS_NOTE}}; unarmed the Basic alone, never stored (`heroChains` gives it a default moveset in the pair's primary). So a new save's common sword holds two Primary constructs (a Jump in hero casts from the start; the autopilot forges before dive 1 only when Power rises by `MIN_FORGE_GAIN`), and `carries`, `carriedSkills`, `carriedByText`, `awakened` and Awaken are gone. A chain holds 0 to its slots' constructs (`Chain { moves, payment }`; the Basic at least 1): an empty Primary, Defensive or Ultimate plays as an uncarried skill did (a null entry in `HeroEntity.chains` that every reader passes over: its key, HUD button and pad button do nothing, and the HUD hides the button), and a chain keeps its payment through emptying (its first construct takes the skill's default: mana, mana, charge). **Slots:** a slot past the start is bought at the chain's end for Links and scrap by its position (`addSlot`, `slotPrice`: `slotLinks`, `slotScrap`; null at the ceiling or at 0 slots), counts as bought and arrives holding a plain construct (`plainConstruct`: the next default kind, the class's default form, the weapon's element); a skill's first slot (0 → 1) is **Open a skill** (`openSkill(registry, profile, uid, skill)` in `delve/crafting.ts`, priced by `openSkillPrice`: `delve.movesets.openSkill[rarity]`, flux by grade plus Links and scrap × `scrapLevelFactor`; Awaken generalised, in its place on the Temper bench; refused mid-dive, off a weapon, with slots already, at a 0 ceiling and unpaid; it emits the tutorial's `openSkill`); Upgrade keeps every slot and plain-fills a skill below the new rarity's start (`fillSlots`, not bought); a drop's `extraSlots` (by rarity) and a forge's `crafting.weaponExtras.slots` add free slots past the start up to the ceiling, plain-filled, not bought. **Dormant:** a construct whose form the weapon's class can't express stays in its slot but is skipped when the chain plays, its runes doing nothing, as is a blow rune whose `fits.weapons` lacks the weapon (the blow stays); dormancy is decided in one place, `heroChains(registry, equipped, pair)` (`src/loot/moveset.ts`: the worn weapon's chains with the dormant constructs filtered out and an emptied ability chain dropped; `dormantUids(registry, weapon)` names them), so the sim (`beginFloor`), Power (`estimateLoadout`, `valuedChain`, `useInterval`), `compareItem`, the HUD and the Lab agree, while the Anvil's views read `movesetOf` (every construct) and grey the dormant ones with the reason. It arises only through Move all; placing is refused instead. The pure parts live in `src/loot/moveset.ts` (`weaponClass`, `formAllowed`, `slotRange`, `ceilingOf`, `plainConstruct`, `defaultMoveset(registry, owner, element, slots?)`, `fillSlots`, a drop's `rollMoveset` (extra slots within the ceiling, from `rng.fork('moveset')` after every other roll), `rollSockets`, `rollSocketedRunes` (see Runes), `constructSkill`, `isPlain`, `dormantUids`, `heroChains`, `movesetOf`, `weaponParts` (its Links = Σ bought) and `moveAllPreview`); the profile ops in `src/delve/moveset.ts` (`setChains`, `addSlot`, `slotPrice`, `movesetEditPrice`), `src/delve/constructs.ts` (`applyDraft`, `placeConstruct`, `unsocketConstruct`, `moveAll`, `salvageConstruct`, `draftRefusal`) and `src/delve/crafting.ts` (`openSkill`). **Operations**, all at the Anvil between dives: the worn weapon's chain edits are drafted in the Skills tab and committed by Apply as one all-or-nothing op, the bag with them (`applyDraft(registry, profile, { chains, bag }, opts)`: every uid in the saved chains and bag must be in the draft's chains or bag (a plain one may be gone: deleted at Apply), a uid in both refused, a placed construct of the wrong skill or class refused ("A bow can't express Strike"); `setChains` is its chains-only case, `placeConstruct` and `unsocketConstruct` its one-op cases); free: **unsocket** (a construct to the bag, the chain closing up; the Basic keeps at least one blow), **place** (from the bag into a slot; in a full chain the construct it replaces goes to the bag), **reorder**, and **Move all** (`moveAll(registry, profile, uid)`, the Loadout's take sheet, in Transfer's place, committed at once: every construct on the worn weapon goes onto the target slot for slot with each chain's payment, those past the target's slots and the target's own go to the bag, the ones its class can't express stay in their slots, dormant; the old weapon goes to the bag holding fresh plain constructs in its starting slots, its bought and extra slots empty, so its Basic is never empty; no scrap; `moveAllPreview` is its pure read, which `compareItem`'s `'home'` value, the Loadout's verdicts and the autopilot use and never mint); paid in Mana Dust by uid (`movesetEditPrice(registry, saved, next)`: a new construct `editDust`, a removed one `editDust`, a kept one's changed kind or form `editDust`, its changed elements `elementDust` (a set new to this Apply once), a changed payment `editDust`; position changes are free; `ChainOrigins` and the per-origin rule are retired: constructs have identity, so a moved construct is just moved) plus the runes' prices (see Runes); `editPrice` applies the first-dive freebie. `setChains` refuses mid-dive, unarmed, a chain past its slots, an empty Basic, an unknown kind, a form of another slot, a form the weapon's class can't express on a new or changed construct (a kept dormant one may stay), bad elements, an off-pair set held more times than before (a placed off-pair construct casts and reacts but draws no attunement; a realign maps the worn weapon's constructs by role, `fixChainsToPair`, the bag's and bag weapons' untouched), the runes' refusals, and unpaid; every uid diff takes `movesetOf(weapon).chains` as its saved side, never `heroChains`. **Salvage:** a construct from the bag (`salvageConstruct`: its runes to the pouch at the pull price, `salvageDust` Dust (0 as shipped); refused without the scrap for its runes, "Not enough scrap to pull its runes"; Undo for `UNDO_MS`) gives nothing else back (moving is free, so investment is kept by moving, not melting); a weapon sends its constructs to the bag, one Link per bought slot (`weaponParts`, `salvageLinks`) and its usual materials (`applySalvage`): free extra slots mint no Links, so forging or finding a weapon and melting it mints none. A **plain** construct (`isPlain`: no open socket, no rune) displaced into the bag is deleted at Apply while `profile.autoSalvagePlain` holds (on by default; a draft's Revert still brings it back). `salvageCandidates` no longer protects a weapon for its runes; it still never marks a good base junk (`compareItem`'s `'home'` value); `equipBest` leaves weapons alone. Move all, a construct's salvage and any equip are refused while the draft has unapplied changes ("Apply or discard your Skills changes first"). **Drops and forging:** a weapon arrives with plain constructs in its starting and free extra slots (the string for the Basic, the class default form for the rest, in its element), some with open sockets (`rollSockets`, from `rng.fork('sockets')`) and rarely a socketed rune (`rollSocketedRunes`: `delve.runes.runeChance[rarity]`, one rune on a random open socket by `dropRune`'s tier rules, its own fork after the sockets); a forged weapon the same plus `weaponExtras.slots` (`forgedMoveset`; the forge preview's `ForgePreview.weapon` lists each skill's slots and ceiling and the class); every other stat rolls as before. **The dive lock:** while `isDiveActive`, `equipItem`, `unequipSlot` (both throw "Equip at the Anvil, between dives"), `equipBest`, `setChains`, `applyDraft`, `addSlot`, `openSkill`, `moveAll`, `salvageConstruct`, `reattuneItem` and the forge and salvage (`upgradeGear`, `reforgeGear` and the crafting ops (`forge`, `hone`, `imprint`, `refine`, `buyShard`) refuse with "Forge at the Anvil, between dives"; `salvageItems` melts nothing) refuse, while auto-salvage of new loot still runs and `chooseStartingMana` stays allowed (it replaces the starting weapon's constructs with plain ones in the chosen primary); but a **stop**: after each depth a guided stop (and every anvil alcove) holds one power-up (an ordinary stop offers boons instead: see Boons; `DiveState.stop`, rolled by `completeFloor` from the dive seed's fork `stop:<depth>`, `rollStop`: 2 or 3 of the kinds the hero can take and pay for, `stopKinds`: equip a bag item as it is (a weapon with its own constructs), add a slot (under the ceiling, never a skill's first), adjust one move (a construct in place), upgrade an item, or socket a rune), taken with `takeStop(registry, profile, action)` with the lock lifted for that one op. A weapon salvaged mid-dive (auto-salvage, a full bag) sends its constructs, runes and all, into the floor's haul (`Haul.constructs`; `completeFloor` moves them to `banked`, `settleDive` to the bag): a death or an abandon loses the haul's outright and each banked one at `crafting.deathLoss`, rolled one by one on `death:<dive seed>` and recorded in `dive.lost`; an extract keeps them all; plain ones are dropped at settle while `autoSalvagePlain` holds. **The autopilot** (`delve/autopilot.ts`, between dives) places its best constructs by Power, uses Move all when it takes a better weapon, salvages what it doesn't use, spends Links on slots up to the ceiling (Primary, Basic, Ultimate, Defensive; the sockets in between as before) and Opens a skill when it can pay, and takes each stop (`takeBestStop`: a boons stop's best boon, a powerups stop's ladder); `economySim`'s rows {{ECON_FIELDS}}. `parseDelveProfile` fits every weapon to the data at load (`fitMovesets`: every construct has a uid, uids unique across the worn weapon, the bag weapons, the bag and the dive's haul and banked constructs, each in a slot of its own skill, no chain past its slots, no empty Basic, `bought` ≤ slots; a weapon without a moveset gets `defaultMoveset` with uids minted, sockets past `MAX_SOCKETS` are trimmed; a class mismatch is dormancy, not an error; anything else `{ reset: true }`). `tests/delve-constructs-invariant.test.ts` plays thousands of random operations (place, unsocket, reorder, Move all, equip, a construct's and a weapon's salvage, forge, a drop banking, add a slot, Open a skill, Upgrade): constructs appear only from a drop, a forge, a new construct, a bought or upgraded slot or a plain refill, and disappear only through salvage or a dive's death loss; runes are never created and leave only by a pull or a salvage at the pull price; Links are minted only by bought slots on salvage, never more than were paid. Numbers: `balance.json → delve.movesets` (`slots`, `extraSlots`, `slotLinks`, `slotScrap`, `openSkill`, `editDust`, `elementDust`, `salvageDust`; `MovesetsBalanceSchema` checks each ceiling ≥ its start, ceilings never falling with rarity, the legendary's all 5). The client: the Anvil's Skills tab edits a draft (the store's `chainDraft`, keyed on the weapon and the pair, holding the chains and the bag as the draft sees them, kept until applied or reverted; unapplied changes block a new dive, not a dive's Resume: the store's `startDive` refuses and returns false, and the Depart sheet disables Delve and offers beside its warning the builder's **Apply**, priced and disabled with the engine's reason from `draftRefusal`, and **Discard changes & delve**), whose `ApplyBar` shows its price, **Revert** and **Apply**, which opens the Apply sheet (`ApplySheet`: each changed chain before and after with its notes, `draftLines`, the free moves apart from the priced edits; the price and what it destroys; **Apply** (all or nothing), **Try in Training** and **Discard changes**; Y or Ctrl+Enter open it too); `ChainLane` shows each chain's filled slots, its empty slots and the ceiling (`chain-ceiling`; **Add slot** as before; a card `data-construct={uid}`, `data-dormant` when dormant, greyed with the reason; X or Del on a card unsockets it to the bag), the **bag pane** beside the move pane (`construct-bag`, a pad group, filtered to the selected skill, each row `data-construct={uid}`: A or a click places one into the selected slot, X salvages it with Undo), `SkillStrip` a skill at 0 slots dimmed with how it opens, and the move editor (`MoveRows`) the off-pair marks, its form picker only the class's forms (the one-column `ChainEditor`, with `absentText`, `footer` and `fixedShape`, serves the Training dock and the stop); the Loadout's compare pane shows a weapon as a frame (`weapon-frame`: its class, style and slots against the ceiling), values a bag weapon both ways and offers **Move all here** (under the pad, A on the weapon opens the take sheet, `TakeSheet`: Equip as it is, or Move all here, `take-move-all`), and Full compare (R3, or Shift; a toggle) shows its moveset ("Primary 2/4", `MovesetView`); the bag's tiles, the HUD's Found log and the stop's finds mark ▲ what's better as it comes (`asIs`) and ◇ a weapon better only as a home for your constructs (Move all, at the Anvil), and a loot plaque carries ▲ for an upgrade as it comes, and an upgrade drop (▲) and an essence each play their own sound (`lootUpgrade`, `lootEssence`; `lootCues` reads the drop from `world.drops` by the event's id, the upgrade by the plaque's own `isUpgrade`); the Temper bench lists **Open a skill** (`temper-open-skill`, enabled by the engine's dry run) and Upgrade's new ceiling; Links show in the hub's header, the dive's purse, the dive summary and the salvage toasts; mid-dive (the pause) every gear action gives way to a note ("Equip it at the Anvil between dives…") and the Forge tab is locked; the stop shows its power-up cards and pickers (`StopPanel.tsx`, in `stop/StopScreen.tsx`); the arena skips dormant constructs, and the HUD shows the chain as it plays. Measured at v0.76.0 over 16 seeds and 12 dives: Fire's mean depth after dive 1 / 6 / 12 {{FIRE_D1}} / {{FIRE_D6}} / {{FIRE_D12}}, {{FIRE_DEATHS}} deaths, about {{FIRE_SECS}} s a floor; the beeline's dive 12 {{RUSH_D12}} ({{RUSH_RATIO}} × a full clear), {{RUSH_SECS}} s a floor, {{TIMEOUTS}} floors timed out; Frost's dive 12 {{FROST_D12}} (8 seeds); a first epic by dive {{EPIC_MEAN}} on average, the first legendary within two visits of the first essence in {{LEG_FOLLOWS}} of 16 and owned by dive 12 in {{LEG_OWNED}} of 16; the bag holds {{BAG_MEAN}} constructs at dive 12 on average and {{LINKS_MEAN}} Links are held{{TUNING_NOTE}}.
```

  `{{PARTS_RULE}}` (in Step 9's Runes text): empty unless B2 kept `settleParts` (`grep -rn "settleParts" packages/engine/src`), then `; \`settleParts\` is the one path for those`. `{{SLOTS_NOTE}}`: empty when Task 4 left the table as shipped, else ` (trimmed at v0.76.0 from the spec's table: <what, from → to>)`. `{{ECON_FIELDS}}`: D1's row fields for this stage (`grep -n "constructs\|moveAll\|opened" packages/engine/src/delve/economy.ts`), e.g. "carry `constructs` (salvaged, placed and deleted)"; if D1 added none, write "are unchanged". `{{TUNING_NOTE}}`: empty when nothing was tuned, else `; tuned: <what, from → to>`.

- [ ] **Step 9: the Runes bullet** (line 80, the whole line) becomes:

```markdown
- **Runes** (spec: `docs/superpowers/specs/2026-09-30-delve-runes-design.md`): every construct (a move or a basic blow) holds **sockets**, `Move.runes` / `Blow.runes` (`(RuneRef | null)[]`: its length the open sockets, `null` an empty one, absent none; `RuneRef` is `{ id, tier }`, tier 1–5 shown I–V), each holding one **rune**. Sockets belong to the construct and travel with it (into the bag, onto another weapon): a construct starts at 0 and opens up to `MAX_SOCKETS` (3) whatever weapon holds it (the weapon-rarity `socketCap` is retired, v0.76.0; unarmed's constructs hold none), a socket is opened for Links and scrap by its index (`socketPrice`: 1 + 20, 2 + 40, 3 + 60) and never closed, and weapon drops roll some open by rarity (`rollSockets`, from `rng.fork('sockets')` after the moveset) and rarely a socketed rune (`rollSocketedRunes`, `delve.runes.runeChance` by rarity, its own fork after the sockets; by `dropRune`'s tier rules), so every other stat rolls as before. Loose runes live in the pouch, `profile.runes` (`RunePouch`: rune id → five counts by tier; no bag space). The 15 runes are data rows in `src/data/runes.json` (`RuneDefSchema`; `registry.getRunes` / `getRune` / `findRune`) in four families: Shape (Split, Multi-shot, Pierce, Chain, Widen, Detonate), Tempo (Quick, Echo, Heavy), Elemental (Saturate, Linger, Volatile) and Sustain (Leech, Drain, Guard). A row holds five tiers of **knobs**, its fits (`fits.forms`, Whirl where Strike is listed, Repel where Ward is, Onslaught where Nova is; `fits.weapons`, whose basic blows it fits; `fits.kinds`, the blow kinds it acts on, dormant on any other) and its text templates, which only `runeText` fills (the client never formats a rune's numbers); the pure helpers live in `src/loot/runes.ts` (`runeFits`, `runeActive`, `runeKnobs`, the pouch's). The sim reads only knobs: `resolveAbility` and `computeHeroStats` merge a move's active runes with the weapon's cast-style trait, its elements, fusion and legendaries (`mergeKnobs`, `NEUTRAL`; `ResolvedAbility.runes` and `HeroBlow.runes` are the runes acting, the list the builder's dormant marks and the HUD both read), and each new knob has one handler: `split` (`impact.ts`, and a basic shot's hit in `step.ts`: evenly spaced shards, `form: 'shard'`, that never split, chain, linger, echo or burst), `extraShots` (`resolve.ts` adds to Volley's and Barrage's count, with half the per-shot cut on Volley and none on Barrage, `extraShotPower`; `forms.ts` fans Bolt and Lance, `basic.ts` a shot blow), `echo` (`abilities/echo.ts`: `queueEcho` / `echoTick` replay the move as it landed, or a blow through `landBlow`, `echoDelay` later, free and never echoing again), `quick` (cooldown and wind-up, and the beat through `moveBeat`; a blow's cycle and startup), `stacksBonus` (Saturate), `catalyst` (Volatile: adds to the Catalyst legendary's factor in `react`), `manaOnHit` (Drain: mana per foe-hit, up to `drainFoes` foe-hits and `drainShare` (half) of the move's own mana cost before its runes' load (`baseCost`) a cast, a blow at most half a blow's mana, counted per skill in `HeroEntity.drained` and `drainLeft`; a move paid with charge gets none), `guardOnLand` (Guard: `guardLand` in `defend.ts` feeds Obsidian's barrier and never extends a larger one) and `detonate` (Detonate: a blast of that power around each foe a move hits by contact, `impact.ts`; see Forms by class and cast styles); the hit-time knobs ride `HitOpts` through `knobHitOpts`, and `Knobs.pierce` is a count (`true` in data is `Infinity`; a shot's `Projectile.pierceLeft` counts down, `pierce` stays its spawn flag). **Shape runes add, they don't multiply:** past its first foe, a shot that a finite Pierce carries on still hits each foe it passes, but its Chain jumps, Linger zone and Split shards come off its first foe only (`ImpactOpts.through`); an Earth shot's endless pierce keeps its impact at every foe. **Linger** leaves at most one zone a shot and `ZoneKnob.perCast` (3) a cast, counted per skill (`HeroEntity.zonesLeft`, spent by `spendZone` in `leaveZone` and `blowZone`), an Echo's out of its cast's three; an element's or a fusion's zone has no `perCast` and is uncapped unless merged with Linger (`mergeKnobs` takes the smaller `perCast`). A new rune from existing knobs is one row in `runes.json`; one that needs a new knob adds it to `Knobs`, `NEUTRAL`, `mergeKnobs` and `KnobsSchema`, its one handler, and its term in Power's `damagePerUse` or `estimateCombat`. **Changing runes** goes through the Anvil's draft with every construct edit: `applyDraft` / `setChains(registry, profile, chains, { unsocket })` (`delve/constructs.ts`, `delve/moveset.ts`) charge the per-uid Dust (see Weapon movesets and constructs) plus `runeChange` (`src/delve/runes.ts`, by uid: a kept construct's sockets against its saved sockets, a new one opening all of its, a removed one refunding its sockets and pulling its runes; socketing is free, out of the pouch; opening a socket costs its Links and scrap; a rune that ends up elsewhere is a pull plus a socket; Links are netted, so the Links an Apply leaves don't depend on the order of its edits), and refuse a rune that doesn't fit its construct (so a form change while one wouldn't fit), the same rune twice on one, past `MAX_SOCKETS`, fewer sockets on a kept one, and an unpaid draft or pouch; `draftPrice` is the builder's total (`openSocket`, `socketRune` and `fuseRunes` are single ops). **The pull rule**, `unsocketMode` (`delve.runes.unsocket`): `'pay'` as shipped since v0.76.0 (`pullScrap` by tier, the rune back to the pouch; a salvaged construct pays the same per rune), or `'destroy'`; dev builds override it with the system menu's "Pull: destroys / pays" chip beside "Restart Delve (dev)" (localStorage `alloy:delve:unsocket`), though the load-time trims always use the balance's mode, never the override. **Constructs carry their sockets into the bag:** a salvaged weapon's constructs keep their sockets and runes, Move all carries each construct's sockets with it (no `transferScrap`), and only the load-time trims (a socket past `MAX_SOCKETS`) and `chooseStartingMana`'s plain refill give a socket back as a Link with its rune to the pouch by the pull rule (the results carry `runes` and `destroyed` for the toasts){{PARTS_RULE}}. **Drops:** `dropRune` (`arpg/rune-drops.ts`, called in `killMonster`, never in the sandbox) rolls on `world.runeRng` (`dropChance` by foe kind, × the door's `runes`; a boss always drops one; the tier by depth, `tierDepths`, and `tierUp` for one higher); a rune drop is walked over like an item, no magnet, and rides the floor's haul into the pouch (`BankResult.runes`, `DiveState.runesEarned`; see Crafting's banking). **Fusing:** `fuseRunes` turns `fuseCount` (3) of a rune and tier into one of the next tier for `fuseScrap`; tier V doesn't fuse. Runes are gear: locked mid-dive, but for the stop's fifth kind, `'rune'`, which sockets one pouch rune into an open empty socket. Power values socketed runes through `damagePerUse` and `estimateCombat` (Drain's terms under the same cap), net of their price (see Rune costs). **The autopilot** (`delve/autopilot.ts`, between dives) spends Links on slots up to three a chain (`SOCKETS_AFTER`), then on sockets, each opened only where a pouch rune that fits it raises Power and filled at once (`bestRune`: the cheapest first, the Primary's constructs first, then Basic, Ultimate and Defensive), then on the slots to the ceiling; it sockets each socket with the pouch rune that raises `profilePower` most and fuses only the copies left over. At load `fitMovesets` empties unknown and repeated runes and trims sockets past `MAX_SOCKETS` (each socket back as a Link). Numbers: `balance.json → delve.runes`. The client: the presentational pieces live in `features/delve/runes/` (`SocketRow`, `RunePicker`, `RuneGlyph`, `ItemSockets`, and `rune-style.ts`'s family colours: Shape cyan, Tempo amber, Elemental violet, Sustain green); the Skills tab's construct cards show their sockets (a click opens the construct's editor at one), and the move editor lists each socket as a row that opens the rune picker as a grid (`RunePicker`'s `grid`), offering the pouch runes that fit, each with what it does to the chain's damage a second (`damage`), and the Apply sheet shows the draft's price and what it destroys; the Forge tab's Materials bench holds the pouch and Fuse (`RunePane`); a weapon's moveset (`MovesetView`, in the compare pane) lists its sockets and runes; the bag pane's rows show their sockets; the stop has a rune pick; the arena flashes `runeFx` (`arena/fx/runes.ts`: split, echo, volatile), draws rune drops in their family's colour with a plaque ("Split III"), and dots each HUD skill slot (and the Attack slot) with the next construct's runes (`RuneDots`; `AbilityHud.runes`, the snapshot's `basicRunes`; each dot's `data-rune` its id); the Training Grounds socket any rune at any tier, free, up to 3 a move. **The balance gate** (the DPS Lab's `'rune'` view and `runeComboSetups`, every three-rune set of a form or a weapon's blows, at tier III, measured with the loads zeroed since v0.52.0, on the reference weapons since v0.76.0: the sword for melee forms, the staff for ranged, both for shared): no single rune above 2.0× its `none` row on one dummy or 2.5× on the pack, and no three-rune set above 3.0× on one dummy or 4.0× on the pack. Measured at v0.76.0: {{RUNE_GATE}}. The Nova + Linger sets stay above 3.0× on one dummy (up to about 6×), accepted as a yardstick artefact: a Nova lands twice in 30 s, so its one-dummy baseline is two blasts; the whole fight gains about 30%, and on the pack those sets read under 4.0×. **Rune costs** (spec: `docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md`; v0.52.0, no save change): every rune row has a `load`, five fractions by tier that never fall (`RuneDefSchema`), its price. A move's raw load is the sum, over the runes acting on it (`ResolvedAbility.runes`, so a dormant rune costs nothing; a cast-style trait is no rune and loads nothing), of `runeLoad(registry, ref, form)`: the tier's load × `bySlot[slot]` × `byForm[form]` (1 when missing). Attunement in the move's elements (their mean, as `attunePower`) eases the sum once: `load = raw × (1 − ease)`, `ease = min(easeCap, easePerAttune × attunement)` (`loadEase`), both on `ResolvedAbility` (`load` and `ease`, the ease set with or without runes). `resolveAbility` raises the price in the chain's own payment: a mana move's cost and a cast's mana × (1 + load) (one product with Manaweaver and `castManaMult`), a charge move's `chargeNeed` × (1 + load × `charge`) (`chargeCap` follows), and a cast's channel × (1 + load × `cast`), the conjure untouched. No cooldown changes, the charge lockout included; basic blows are free, and an Echo stays free. Every sim reader follows unchanged (`canAfford`, `pressDue`, `startHold`, `releaseHold`, `pay`, the HUD), and Drain's cap is on `baseCost(ab)`, the cost before the load. The factors live in `balance.json → delve.runes.load` (`bySlot`; `byForm`, whose keys are checked against the forms; `charge`; `cast`; `easePerAttune`; `easeCap`, at most 1). `loadText` and `runeText`'s price terms (`{ payment, ease }`, its `cost`) are the only formatters: "+N% cost", "+N% charge", "+N% cast wind-up, +N% cost". A blow and a dimmed rune show no price; the picker shows the move's eased price and the pouch the raw one. The builder's pay line appends "(runes: …)", a line says "Attunement eases rune cost by N%" ("(the most it can)" at the cap), and a mana or cast chain shows "Spends X/s · your build refills Y/s" (amber when over) from `manaSupport(registry, stats, chain)`: the spend at the chain's cadence, and `basicIncome` (regen, the basics and their Drain) plus the chain's own Drain. Power nets the price through `useInterval` and the pool through `valuedChain`, so the autopilot sockets a rune only where it raises Power. **The two-build gate** (`tests/delve-rune-costs-gate.test.ts`, skipped unless `RUNE_COST_GATE` is set): for each Primary form on its reference weapon, its best three-rune tier-III set (ranked with the loads zeroed) against the rune-less chain, sustained on the pack (`DpsOptions.sustained`). Starved is reported (target about 0.9–1.2×), supported must reach at least 1.5×, and the mana per press must be 2.0–3.0× on the starved hero. Measured at v0.76.0: {{RUNE_COST_GATE}} (at v0.52.0: supported 1.62–2.07× (lowest Lance), starved 1.01–1.18× (Volley 1.34×), the mana per press 2.89× starved and 2.07× supported). When it fails, tune `byForm`, then `bySlot`, then `easePerAttune` / `easeCap`, then the rune rows; never the ceilings, the floor, the band or the pacing rails.
```

- [ ] **Step 10: the Crafting bullet** (line 81), four phrases:
  - `a forged weapon carries its rarity's skills and `crafting.weaponExtras` (extra slots to the Primary first, then Basic, Ultimate, Defensive; sockets one a move, the Primary's first: `forgedMoveset`)` → `a forged weapon holds its rarity's starting slots plus `crafting.weaponExtras.slots` (free extra slots, not bought: the Primary first, then Basic, Ultimate, Defensive, up to each ceiling; `forgedMoveset`), each a plain construct, with sockets and a socketed rune rolled as a drop's are`
  - ` and **Awaken** (`awaken(registry, profile, uid)`, v0.62.0: a rare weapon carries the Ultimate too, `GearItem.awakened`, its moveset gaining the Ultimate's base chain in the pair's primary; once, for `awakenPrice`: `crafting.awaken`'s epic flux, Links and scrap × `scrapLevelFactor`; refused mid-dive, on anything but a rare weapon, on an awakened one and unpaid; Upgrade, Reforge and a Transfer keep the flag with the weapon)` → ` and **Open a skill** (`openSkill`, v0.76.0, in Awaken's place: a skill's first slot on a weapon whose ceiling allows it, for `openSkillPrice`; see Weapon movesets and constructs)`
  - `a weapon's Links (`salvageLinks`), its runes by the parts rule and an off-pair item's Mana Dust` → `a weapon's bought slots as Links (`salvageLinks`), its constructs to the bag (runes and all; mid-dive into the haul's `constructs`) and an off-pair item's Mana Dust`
  - `12 since the room objects, 13 since the boons;` → `12 since the room objects, 13 since the boons, 14 since the constructs;`
  - `Numbers: `balance.json → delve.crafting` (`forgeScrap`, `offPairDust`, `weaponExtras`,` stays (the key remains, its shape `{ slots }`).
- [ ] **Step 11: the Guided start bullet** (line 84): `lesson 2: Transfer onto Grask's rare, Hone, claim, the Contract board, a Defensive cast in the Training Grounds, farewell` → `lesson 2: Move all onto Grask's rare, Hone, claim, the Contract board, a Defensive cast in the Training Grounds, farewell`; read D1's `tutorial.json` for lesson 1's list (`grep -n '"where": "anvil"' -A 3 packages/engine/src/data/tutorial.json | grep '"id"'`) and, where its steps changed (the bag in the slot, chain-edit and rune steps; dive 1's rewritten lines), make the bullet's lesson-1 list match in the same style; `the `transfer` trigger at` and every `transfer` in the bullet's trigger lists → `moveAll`, and in its op list `(the stop's `takeStop`, `claimQuest`, `equipItem`, `setChains`, `addSlot`, salvage, `transferMoveset`, `hone`, `forge`, `refine`, `bindSecondary`)` → `(the stop's `takeStop`, `claimQuest`, `equipItem`, `setChains`, `applyDraft`, `addSlot`, salvage, `moveAll`, `openSkill`, `hone`, `forge`, `refine`, `bindSecondary`)`, and add `openSkill` beside it where the tutorial-only events are listed (`TutorialOnlyEvent`: "`takeStop`, `ack`, `skipStep`, `claim`, `equip`, `setChains`, `salvage`, `moveAll`, `openSkill`, `hone`, …"); `(the rare equipped with the moveset moved, an item honed)` → `(the rare equipped with the constructs moved, an item honed)`. Nothing else in the bullet reads the old model (`socketCap` in `tutorial-floor.ts` is gone with A: the set drops' `sockets` are on constructs).
- [ ] **Step 12: the Client bullet** (line 87), five phrases:
  - `(a weapon that can take your moveset through the take sheet, `TakeSheet`)` → `(a weapon through the take sheet, `TakeSheet`: Equip as it is, or Move all here)`
  - `an uncarried one dimmed with what carries it` → `a skill at 0 slots dimmed with how it opens`
  - Onboarding's `(an equip or a transfer, a move's editor opened,` → `(an equip or a Move all, a move's editor opened,`
  - `Awaken (a rare weapon's Ultimate, once, at `awakenPrice`, enabled by the engine's dry run)` → `Open a skill (a skill's first slot, `temper-open-skill`, at `openSkillPrice`, enabled by the engine's dry run)`
  - ``alloy:delve:v2`, schema version 13,` → ``alloy:delve:v2`, schema version 14,`
- [ ] **Step 13: the Training Grounds bullet** (line 94): `or **Load my build** (the equipped weapon's chains, and the sandbox's own for the skills it doesn't carry)` → `or **Load my build** (the worn weapon's constructs as its chains, and the sandbox's own for the skills it has no slot for; the sandbox's chains are never constructs: no uids, no bag)`; and after `(`ChainEditor` bound to the sandbox: any element,` add `the weapon's class's forms,` (so: `any element, the weapon's class's forms, any rune at any tier…`).
- [ ] **Step 14: the DPS Lab bullet** (line 95): after `and each rune at tier III on each form and weapon it fits, against a `'none'` row (the `'rune'` view,` the sentence continues; add before `as a ranked table and a chart of the ticked rows` the phrase: `and every weapon × form pair its class allows, the form's default chain in Fire with no runes (the `'style'` view, the cast styles' gate: see Forms by class and cast styles; each form of the other views on its reference weapon, the sword for melee, the staff for ranged, both for shared), `.
- [ ] **Step 15: the Room objects bullet** (line 85), only if Task 5 re-pinned: `D02's gear floor is seed 5 (seed 3 until the steered dodge, v0.71.0)` → `D02's gear floor is seed <n> (seed 5 until the constructs, v0.76.0; seed 3 until the steered dodge, v0.71.0)`.
- [ ] **Step 16: check.** `grep -n "{{" CLAUDE.md` prints nothing; `grep -n -o "carriedSkills\|carriedByText\|GearItem.awakened\|awakenPrice\|crafting.awaken\|transferMoveset\|movesetTransfer\|ChainOrigins\|socketCap\|take-transfer\|schema version 13\|DEFAULT_FORMS\|uncarried one dimmed\|an equip or a transfer\|settleParts" CLAUDE.md` prints only the retirements' own mentions (and `settleParts` only if B2 kept it) ("`carries`, `carriedSkills`, … are gone", "the weapon-rarity `socketCap` is retired", "`ChainOrigins` and the per-origin rule are retired", "`DEFAULT_FORMS`" in "replaces `DEFAULT_FORMS`"); `grep -c "Forms by class and cast styles" CLAUDE.md` is at least 6; `git diff --stat CLAUDE.md` shows only CLAUDE.md, and `git diff CLAUDE.md | grep -c "^-"` is about 12 (the lines edited: no whole-file line-ending churn; if every line shows, the edit rewrote CRLF: redo it with an editor that keeps them).
- [ ] **Step 17: commit.** `git add CLAUDE.md && git commit -m "docs: CLAUDE.md's forms by class, cast styles, constructs and the bag; the measured numbers"` with the trailer.

---

### Task 12: the version bump

- [ ] **Step 1:** `packages/client/package.json`: `"version": "0.75.1"` → `"version": "0.76.0"` (read the current value at execution time; if main moved past 0.75.1 before the stage branched, the next minor of what the file holds). A feature: the next minor; the save goes to 14 with it.
- [ ] **Step 2:** `cd packages/client && npx vitest run src/pages/__tests__/TitleScreen.test.tsx src/features/delve/hub/__tests__/SettingsPanel.test.tsx --reporter=dot` (both import the version; expected pass).
- [ ] **Step 3: commit.** `git add packages/client/package.json && git commit -m "chore(client): bump version to 0.76.0"` with the trailer.

---

### Task 13: the close (the whole suites, the fingerprint, the memory)

The stage's final whole-feature review: everything green on the merged branch, the fingerprint re-recorded after D2's tuning, and the open questions written down for the user.

- [ ] **Step 1: engine.** `cd packages/engine && npx tsc --noEmit -p . && npx vitest run --reporter=dot` (about 12–15 minutes). Expected: clean; `delve-sim-perf`, `delve-rune-costs-gate` and `delve-style-gate` skipped; every other test passes except the one failure `01-contract.md`'s Base names (the overview's baseline: 1831 passed, 1 failed, 11 skipped of 1843 in 147 files; Task 4 Step 1's note; investigate only new failures). Record the counts against that baseline. Then `npx tsup` (three "Build success").
- [ ] **Step 2: client.** `cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot && npx vite build`. Expected: clean, all pass, built. Record the counts.
- [ ] **Step 3: the full E2E once more** if anything in Steps 1–2 or Tasks 11–12 touched code (a fix): `npx playwright test --reporter=dot` (all three projects, about an hour); else Task 10's run stands. Record passed / skipped and the durations.
- [ ] **Step 4: the fingerprint, re-recorded.** The stage's probe is A's, `$P/constructs-probe.test.ts` (the recipe is `docs/superpowers/plans/2026-10-04-delve-room-objects/01-contract.md` "The fingerprint, before"; its recordings so far: `$P/constructs-after-a.json` from A's switch task, `$P/constructs-after-b1.json` from B1's last behaviour, `$P/constructs-after-d1.json` from D1's bot). Copy it into `packages/engine/tests/` as `scratch-fingerprint.test.ts`, run `npx vitest run tests/scratch-fingerprint.test.ts --reporter=dot`, and save its output as `$P/constructs-after-d2.json`. Then `cmp $P/constructs-after-d1.json $P/constructs-after-d2.json`. Expected: with no tuning in Tasks 2–4 it prints nothing (D2 changed no play); with tuning it differs, and from `-after-d1.json` alone (the data moved, nothing else). Note under **Record** which it matches. Delete the scratch file before the next commit.
- [ ] **Step 5: the memory of open questions for the user.** Append one paragraph to `C:/Users/hahnz/.claude/projects/c--Projects-Alloy/memory/project_delve_skill_roadmap.md` (outside the repo; its format is the file's: one bold-led paragraph a stage), in its style:

  `**Weapon identity and constructs (v0.76.0, <date>; spec `docs/superpowers/specs/2026-10-07-delve-weapon-identity-and-constructs-design.md`, plans `docs/superpowers/plans/2026-10-08-delve-constructs/`):** weapon classes (melee / ranged) gate the 15 forms (Whirl, Repel, Onslaught new; melee Lance, Burst and Maelstrom; Surge and Blink reworked); cast styles per weapon (numbers, motion, trait, look) applied in `resolveAbility`; the signature hook, empty; moves and blows are constructs with uids, sockets of their own (cap 3, `socketCap` gone), a bag (`profile.constructs`), slots by rarity (start → ceiling), Open a skill in Awaken's place, Move all in Transfer's, the pull rule `'pay'`; save v14. **Decided on the user's behalf (flag):** <from each area's record and Open questions: the slot table as tuned, `openSkill`'s prices, `salvageDust` 0, auto-salvage of plain constructs on by default, the bot's Links order, …>. Measured (16 seeds): <Task 4's line>; the style gate <Task 2's result>; the rune gates <Task 3's>. **Open:** <the Open questions for the integrator below that are the user's to settle: the bag's growth, legendaries leaning by class, three ranged weapons to four melee, the first-forge rail retired, …>.`

  Also update the index line in `C:/Users/hahnz/.claude/projects/c--Projects-Alloy/memory/MEMORY.md` for `project_delve_skill_roadmap.md`: `boons (v0.70.0, latest)` → `boons (v0.70.0), constructs (v0.76.0, latest)`.
- [ ] **Step 6:** nothing to commit in the repo unless a step forced a fix (one commit each, named for the fix). Remove the worktree only with `rmdir /s /q` from cmd then `git worktree prune`. Never push or merge `constructs/d2` yourself.

---

## Record

(Filled while executing.)

**Base:** `constructs/main` at …

**Task 1 (un-skips):** files …; tests …

**Task 2 (the style gate):** run on `43adebdc` (D2 Task 1's merge), `STYLE_GATE=1`, depth 10, eight seeds: 2 of 2 green in about 5 s; no tuning, so no levers tried and Steps 3–4 skipped. Only the pairs in the gate's `WAIVED` list (B1's, decided with the user) sit outside 0.85–1.2×, each at its waived value. The table (ratio to the form's class median; `*` waived):

```
one dummy
lance      melee  dagger 1.08  sword 1.12  axe 0.92  maul 0.84*
lance      ranged staff 1.00  wand 1.06  bow 0.91
burst      melee  dagger 1.06  sword 1.07  axe 0.86  maul 0.94
burst      ranged staff 1.00  wand 1.04  bow 0.90
strike     melee  dagger 1.07  sword 1.11  axe 0.93  maul 0.91
whirl      melee  dagger 0.98  sword 1.12  axe 0.88  maul 1.02
nova       melee  dagger 1.20  sword 0.95  axe 0.78*  maul 1.05
nova       ranged staff 1.02  wand 0.96  bow 1.00
onslaught  melee  dagger 1.19  sword 0.88  axe 0.89  maul 1.11
maelstrom  melee  dagger 0.83*  sword 0.93  axe 1.07  maul 1.19
maelstrom  ranged staff 1.30*  wand 1.00  bow 0.84*
bolt       ranged staff 1.00  wand 1.08  bow 0.86
volley     ranged staff 1.00  wand 1.20  bow 0.80*
barrage    ranged staff 0.86  wand 1.00  bow 1.18
weapons: dagger 1.06  sword 1.03  axe 0.90  maul 1.01  staff 1.03  wand 1.05  bow 0.93
pack
lance      melee  dagger 1.00  sword 1.12  axe 1.00  maul 0.87
lance      ranged staff 1.00  wand 1.07  bow 0.79*
burst      melee  dagger 1.05  sword 1.07  axe 0.95  maul 0.95
burst      ranged staff 1.00  wand 1.05  bow 0.88
strike     melee  dagger 0.99  sword 1.08  axe 1.01  maul 0.93
whirl      melee  dagger 0.91  sword 1.08  axe 1.00  maul 1.00
nova       melee  dagger 0.90  sword 1.28*  axe 0.83*  maul 1.10
nova       ranged staff 1.12  wand 0.87  bow 1.00
onslaught  melee  dagger 1.12  sword 0.88  axe 1.14  maul 0.88
maelstrom  melee  dagger 0.72*  sword 1.07  axe 0.93  maul 1.23*
maelstrom  ranged staff 1.30*  wand 1.00  bow 0.89
bolt       ranged staff 1.00  wand 0.93  bow 1.28*
volley     ranged staff 0.84*  wand 1.00  bow 2.09*
barrage    ranged staff 1.33*  wand 1.00  bow 0.93
weapons: dagger 0.93  sword 1.05  axe 0.95  maul 0.97  staff 1.05  wand 0.96  bow 1.09
```

At the band's edge (watch after Task 3's trait changes): one dummy's nova dagger 1.20 and volley wand 1.20.

**Task 2, the structural failures (decided with the user, 2026-10-09):** the charge-paid Ultimates (their cast count set by the unstyled basic's charge and `chargeLockout`, which no style scales) and the bow's `pierce: 1` on the clump keep B1 Task 12's answer as it is: Ultimates read per cast, pierce with its ×0.95 power trade-off, the rest in `WAIVED`. Not taken: a fixed-charge read, charge gain normalised over the foes a basic hits, and a new bow trait (pierce off Volley would bring its pack 2.09× in; without pierce the pack Bolt reads about 0.61×). The gate re-run on `2cb2674a`: 2 of 2 green, the table as above; on `95a671f0` (no engine file changed between them) `delve-pacing.test.ts` 11 of 11 (the "legendaries arrive" rail B1 Task 12 had flipped passes again) and `delve-pacing-pairs.test.ts` green. No tuning.

**Task 3 (the rune gates):** run on `2cb2674a` (D2 Task 2's merge), depth 10, eight seeds; both hold, no tuning, so Step 3 skipped and no levers tried.

Step 1, the two-build gate (`RUNE_COST_GATE=1`): 7 of 7 green in about 89 s (vitest's "Timeout calling onTaskUpdate" printed once: the file has no yielding `afterEach`; every test passed). Each form's best set (loads zeroed), then the pack and one dummy as `full unloaded → loaded, starved loaded (unloaded), supported loaded (unloaded)`:

```
bolt   staff echo+heavy+linger         pack 2.39 → 1.12, starved 1.03 (2.40), supported 1.51 (2.05)   one 2.47 → 1.12, starved 1.06, supported 1.46   per press 2.89× / 2.07×
volley staff pierce+echo+heavy         pack 3.92 → 1.56, starved 1.53 (3.96), supported 2.15 (2.95)   one 1.17 → 0.43, starved 0.42, supported 0.63   per press 2.89× / 2.07×
lance  sword detonate+heavy+linger     pack 2.46 → 1.14, starved 1.12 (2.38), supported 1.71 (2.35)   one 1.77 → 0.88, starved 0.83, supported 1.20   per press 2.84× / 2.04×
lance  staff echo+heavy+volatile       pack 2.60 → 1.65, starved 1.19 (1.23), supported 1.64 (2.75)   one 2.69 → 1.06, starved 0.72, supported 1.64   per press 2.23× / 1.88×
burst  sword echo+heavy+linger         pack 2.57 → 1.19, starved 1.13 (2.61), supported 1.75 (2.26)   one 2.59 → 1.19, starved 1.09, supported 1.75   per press 2.89× / 2.07×
burst  staff echo+heavy+volatile       pack 2.41 → 1.57, starved 1.15 (1.21), supported 1.67 (2.58)   one 1.57 → 1.18, starved 0.64, supported 1.76   per press 2.23× / 1.88×
strike sword echo+heavy+linger         pack 2.58 → 1.21, starved 1.17 (2.62), supported 1.88 (2.32)   one 2.47 → 1.19, starved 1.13, supported 1.82   per press 2.89× / 2.07×
```

Supported 1.51–2.15× on the pack (lowest the staff's Bolt, 0.01 over the floor), starved 1.03–1.19× (Volley 1.53×), per press 2.23–2.89× starved and 1.88–2.07× supported (the staff's Lance and Burst lowest). Against v0.52.0 (supported 1.62–2.07×, starved 1.01–1.18×, Volley 1.34×): Bolt now sits at the floor's edge, so a later change that trims the staff's Bolt or raises its load fails this gate first.

Step 2, the rune balance gate: read headlessly instead of in the browser (the Lab's rune view holds only single-rune rows; the three-rune sets come from `runeComboSetups`, which the Lab doesn't run). A scratch script (`$HOME/tmp/constructs/d2t3/sweep.mjs`, never committed) ran the rune view's 241 single rows and all 4068 sets of `runeComboSetups` over every attack form × its reference weapons and every weapon's blows, through `simulateDps` (eight seeds a row) on one dummy and on the pack, with the loads zeroed (`delve.runes.load.bySlot` all 0, the gate's measure since v0.52.0; with the loads in, every rune on the Ultimate's Nova and Maelstrom reads 0×, since a loaded Ultimate costs more than the pool). The maxima:

- single, one dummy: **1.79×** Linger on the sword's Nova (ceiling 2.0×);
- single, pack: **2.11×** Pierce on the staff's Volley (ceiling 2.5×); Detonate's highest 1.85× (Volley), 1.80× (Onslaught), 1.72× (Whirl), 1.56× (Strike);
- set, one dummy: **5.97×** Heavy + Linger + Volatile on the sword's Nova (ceiling 3.0×, the known Nova + Linger exception). Nine sets read over 3.0×, all a Nova with Linger: the old five on the sword (3.04–5.97×, as at v0.52.0) and four on the staff, the new reference weapon (3.13–4.35×); on the pack they read 3.04–3.35×. The highest set without Nova + Linger is 2.95× (Echo + Saturate + Volatile on the maul's blows);
- set, pack: **3.92×** Pierce + Echo + Heavy on the staff's Volley (ceiling 4.0×); Detonate's highest set 3.28× (Detonate + Chain + Heavy on Volley), the staff's Linger sets at most 3.17× (its Nova).

**Task 4 (pacing):** run on `cbb85965` (D2 Task 3's merge); no tuning, so Steps 5 and 7 skipped and no levers tried.

The rails (Step 1, seeds as they run): 72 of 74 in 1476 s. `delve-pacing.test.ts` 11 of 11 (the "legendaries arrive" rail passes), the pairs, the tutorial bot (every run done) and the maps sweep green. Two failures, both `delve-pacing-robust.test.ts`'s "the first legendary follows the first essence within two visits…" on seed 3 (`expected false to be true`); the describe labels print `undefined × 0.8` and `undefined × 1.2` (`$block.$lever` doesn't interpolate), and the 16-seed read below shows they are the forge's price, `crafting.forgeScrap` × 0.8 (the known failure on main, `01-contract.md`'s Base) and × 1.2 (new since B1 Task 12, which passed it). Read over 16 seeds (8 dives, the test's own run): `forgeScrap` × 0.8 follows in 14 of 16 (seeds 3 and 13: essence dive 4, legendary dive 7 and 8), × 1.2 in 15 of 16 (seed 3: essence dive 7, no legendary by dive 8, the window's edge); `scrapByKind` × 0.8 16 of 16, × 1.2 15 of 16 (seed 15: 5 → 7). The legendary waits on scrap and epic flux, none of this task's levers (slots, `openSkill`, `extraSlots`), and the unscaled 16-seed read holds 16 of 16: no tuning.

The first-forge rail (Step 3): held. `opened: true` on every seed, plain and scaled (the kit still forges before dive 1), so the expectation stays.

16 seeds, 12 dives (Step 2, two shards of 8, about 13 min each; Frost ran on all 16, since the sweep's `seed <= SEED0 + 7` is per shard): Fire's depth after dive 1 / 6 / 12 5.00 / 29.06 / 47.31, 4.69 deaths, 63.0 s a floor, a legendary at dive 12 in 15 of 16; the beeline 5.00 / 28.69 / 46.63 (0.99 × a full clear), 8.81 deaths, 34.4 s a floor (the clear 1.83 × it), a legendary in 7 of 16; Frost 5.00 / 28.50 / 49.25, 4.19 deaths, 65.0 s, a legendary in 16 of 16; no floor timed out. Economy: the first epic after dive 2.81 on average (2 to 4 on every seed), the first legendary within two visits of the first essence in 16 of 16; the bag at dive 12 empty on every seed (the bot's `salvageBag` melts what it doesn't place; `autoSalvagePlain` is on in `createDelveProfile`); Links held 0.35 on average (spent: the ceilings aren't reached early); the worn weapon at dive 12 epic on 11 seeds, legendary on 5. Against v0.70.0 (Fire 5.0 / 27.5 / 45.1, 4.3 deaths, 62 s; beeline 45.8, 1.02 ×, 33 s; Frost 49.5; first epic 4.1; 16/16; 15/16): every band holds; the early game runs slightly ahead (dive 6 +1.6, the first epic 1.3 dives sooner) with deaths unchanged, so early weapons don't run away; dive 1 ends at depth 5 on every seed (the first boss's extract, as before). Logs: `$HOME/tmp/constructs/d2t4-rails.log`, `constructs-pacing-shard{1,2}.txt`, `d2t4-robust*-*.log`.

**Task 5 (D02's pin):** seed 5 holds / re-pinned to …

**Tasks 6–10 (E2E):** desktop …; desktop-1080 …; responsive …; durations …

**Task 11 (CLAUDE.md):** placeholders filled: …

**Task 13:** engine …; client …; E2E …; fingerprint matches …

## Open questions for the integrator

- **The first-forge rail** (Task 4 Step 3): the spec (§7) retires the bot's reason to forge before dive 1, which `delve-pacing.test.ts` and `delve-pacing-robust.test.ts` pin (`first.opened: true`). D1's plan owns the bot but not those files; this plan changes that one expectation only when the rail fails for that reason alone. If D1 already did it, Step 3 is skipped; if the kit still forges before dive 1 (an uncommon sword raises Power by `MIN_FORGE_GAIN` over the common one), nothing changes. Either way, the user should know the rail's meaning moved.
- **Where the style numbers live:** the task brief says "tuning `balance.json` numbers only (the style numbers first, then traits)", but the contract put the style rows in `delve.json → bases[].style` and the melee blocks in `arpg.json → forms[].melee`. Task 2 tunes them there; `balance.json` holds only the pacing levers (Task 4). If the integrator wants the style factors in `balance.json`, that is a B1 data move, not a D2 tune.
- **The E2E seeds and uids** (Task 6): every E2E that builds a moveset by hand needs `withUids`; D1's `delve-tutorial.spec.ts` (TU04's bag rare) is D1's file. Check it seeds through `seedProfile` (covered) or its own object (needs `withUids`).
- **Texts read from C1 / C2** (Tasks 7–9): `chain-slots`' wording for a skill at 0 slots, the take sheet's prompt ("Equip or move all"), `rune-pull`'s price label, `temper-open-skill`'s row count, the Skills bag's filter, and `plainConstruct`'s kinds. The plan names the contract's ids and the spec's wording; each step says what to grep.
- **The pad ceilings** (Task 8) are set from the report: a ratchet, not a target. An unreversed move inside the bag pane is C1's layout to fix, not an allowance.
- **The bag's growth** (§11): Task 4's sweep prints the bag's size at dive 12. If it runs away with auto-salvage on, the bot isn't salvaging socketed constructs it doesn't use (D1), or a sort and filter is the next client task; either is the user's call.
- **Legendaries lean by class** (Pyroclasm's Bolt and Barrage ranged-only, Bedrock melee-only) and **three ranged weapons to four melee**: accepted by the spec; both are content questions for the user, not tuning.
- **The one known failure on main** (the test `01-contract.md`'s Base names; the overview's baseline: 1831 passed, 1 failed, 11 skipped) is not fixed here; the record names it.

## Needs routed

- `packages/engine/src/data/runes.json` (Task 3 Step 3, Detonate's tier numbers or its `power` trade-off, only on a rune-ceiling breach): the overview's D2 row includes `runes.json`'s Detonate tiers, so D2 edits it directly; nothing to route. Every other file D2 edits is in its row (`balance.json`'s numbers, the style rows in `delve.json` and the melee blocks in `arpg.json` for the gate, `e2e/*.spec.ts` but D1's tutorial spec, `e2e/fixtures/delve.ts`, the responsive specs, `delve-banking.test.ts`'s pin, the two first-forge rail expectations, `CLAUDE.md`, `package.json`). D1's `delve-tutorial.spec.ts` (Task 6's `withUids` on TU04's own save, if it writes one) is the one edit D2 hands to the integrator.
