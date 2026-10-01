# Delve Rune Costs, Finish: the Measured Gate, the E2E, the Docs and v0.52.0

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the rune costs. Record A's measured gate and pacing in the spec, after re-running the gate and the rails on the merged build to check that they still read the same. Extend the Delve E2E to cover the costs: the builder's prices, easing line and mana-support line, the over-pool warning on a loaded move, and the DPS Lab's Mana select. Bring `CLAUDE.md`'s Runes, Engine and DPS Lab bullets up to date, ship v0.52.0, and run the full verification on all four devices.

**Architecture:** No source file changes here. The gate and the rails run on the merged engine as it stands (`tests/delve-rune-costs-gate.test.ts`, and the scratchpad's `pacing.mjs`, `first-dives.mjs` and `rune-use.mjs` on the worktree's own bundle). The E2E adds three tests to `e2e/delve-runes.spec.ts`. Each computes the text it expects from the engine's bundle (`resolveChain`, `loadText`, `runeText`, `manaSupport`, `baseCost`), so no load is hard-coded and A's tuning can't break them. The docs are hand edits to `CLAUDE.md` (CRLF) and the spec (LF).

**Tech Stack:** TypeScript 5.7, Vitest 3, Playwright, Node 24 (the scratch scripts, ES modules), Prettier 3.8.1.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md` at `6e667e2`, its "Build → Finish", "Balance and gates", "Pacing" and "Docs and version". The overview is `00-overview.md` in this folder.

---

**Base:** the controller's merge of step 1 (`01-contract.md`), A (`02-engine.md`) and B (`03-client.md`) on `claude/alloy-loot-gear-system-6upsy5`, called `<merge>` below. Finish needs all of it merged first:
- the loads and `valuedChain` (A);
- the Lab's sustained mode and Mana select, and the gate file (A);
- every client text the E2E reads (B).

It runs alone, in its own worktree (PowerShell; `<merge>` is the commit the controller names):

```powershell
git -C C:\Projects\Alloy worktree add ..\alloy-costs-finish -b costs/finish <merge>
$W = 'C:\Projects\alloy-costs-finish'; $R = 'C:\Projects\Alloy'
cmd /c mklink /J "$W\node_modules" "$R\node_modules"
cmd /c mklink /J "$W\packages\engine\node_modules" "$R\packages\engine\node_modules"
New-Item -ItemType Directory -Force "$W\packages\client\node_modules\@alloy" | Out-Null
Get-ChildItem -Force "$R\packages\client\node_modules" | Where-Object Name -ne '@alloy' | ForEach-Object { cmd /c mklink /J "$W\packages\client\node_modules\$($_.Name)" $_.FullName }
cmd /c mklink /J "$W\packages\client\node_modules\@alloy\engine" "$W\packages\engine"
```

From Git Bash, `cmd //c mklink /J` mangles the switch, so make the links in PowerShell. Remove them with `cmd /c rmdir <path>`, never by deleting through them. The client's `@alloy/engine` points at the worktree's own engine, so the client, the dev server and the E2E all read this worktree's bundle.

**Files:**

| File | Change |
|---|---|
| `docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md` | the status line, and the "Balance and gates" **Measured** bullet filled with the numbers (LF, never format) |
| `packages/client/e2e/delve-runes.spec.ts` | the costs' imports and constants, and three tests: R05 (the builder's prices, easing and mana support), R06 (the over-pool warning on a loaded move) and R07 (the DPS Lab's Mana select). The file is CRLF in the working tree. |
| `CLAUDE.md` | the Spec list; the Engine bullet's `valuedChain`; the Runes bullet's Drain cap, Power, the gate's unloaded ceilings and a new **Rune costs** passage; the DPS Lab bullet's sustained mode and Mana select (CRLF, hand-edit, never format) |
| `packages/client/package.json` | version 0.52.0 |
| `$S/rune-costs-after/` (scratchpad, not the repo) | the gate's, the rails', the first dives' and the rune use's output on the merged build |

These need no change: `e2e/delve.spec.ts`, `e2e/delve-gamepad.spec.ts` and `e2e/delve-training.spec.ts`.
- None of their tests reads a price.
- B's new texts add no focusable control to the picker or the builder, so G07's pad walk (`padTo`) finds the same stops.

Tasks 2 and 4 run them unchanged, as the spec's "every Delve spec passes".

**Cross-area needs** (what the E2E and the docs read; if an area named something differently, the controller maps the name here, in the E2E or the docs, which are its only consumers):

- **Step 1, the bundle's exports** (`@alloy/engine`): `baseCost`, `manaSupport` (named in `src/index.ts`), and `runeLoad` and `loadEase` through `export * from './loot/runes.js'`. `ResolvedAbility.load` and `ease`.
- **B, `loot/runes.ts`:** `loadText(registry, load, payment?)`, and `runeText(registry, ref, on?, { payment, ease })`'s `cost`, both exported through `export *`.
- **B, the builder** (`chains/MoveEditor.tsx`, `chains/ChainEditor.tsx`):
  - The `Readout` (inside `data-testid="ability-readout"`) holds the pay line's ` (runes: ${loadText(registry, ab.load, ab.payment)})`.
  - Its easing line is an element `data-testid="rune-ease"` whose whole text is `Attunement eases rune cost by ${Math.round(ab.ease * 100)}%`, plus ` (the most it can)` at the cap.
  - The mana-support line is an element `data-testid="mana-support"` whose whole text is `` `Spends ${Math.round(spend)}/s · your build refills ${Math.round(refill)}/s` `` (a middle dot, U+00B7, with a space each side). Its numbers come from `manaSupport(registry, stats, resolveChain(registry, stats, slot, chain))`, with the same `stats` the `Readout` uses. The spec says "whole numbers"; the E2E reads that as `Math.round`.
  - The existing `cost-warning` text stays as is: `Needs ${Math.round(ab.cost)} mana; your pool holds ${Math.round(pool)}.`
- **B, the picker** (`runes/RunePicker.tsx`): the current rune's panel (`rune-current`) and each candidate (`rune-pick-<id>`) contain `runeText(registry, rune, on, { payment, ease }).cost`, with the edited move's payment and its `ResolvedAbility.ease`.
- **B, the pouch** (`runes/RunePouchPanel.tsx`): each row `pouch-<id>-<tier>` contains `runeText(registry, rune).cost`, the raw price.
- **A, the Lab page** (`pages/DelveLab.tsx`):
  - A `<select data-testid="lab-mana">` whose option values are `full`, `starved` and `supported`, with `full` first and chosen on load.
  - Choosing an option runs the grid afresh unless the session holds it. The rows reset, so `lab-progress` shows until the grid is whole, and the first `lab-row` appears from the new run.
  - A worker error is still logged as `console.error('DPS Lab worker', …)`.
- **A, its report** (the controller hands it to Finish). Task 1 copies these into the spec and checks them against its own re-run:
  - each form's set;
  - its ratios, full mana, starved and supported, loaded and unloaded, on the pack and on one dummy;
  - the mana per press for both builds;
  - the ceilings measured unloaded, and the loaded full-mana ratios beside them;
  - the pacing rails at each stage: v0.51.0, after Power's pool rule, and after the loads;
  - any tuning A made to the loads or the easing, with the user's agreement if a rail or the floor was at stake.

---

**Conventions:** the overview's shared conventions (the 4a plan's, as the runes overview amends them). In short:
- **One commit per task** (four: the status line, the E2E, the docs, the version), on `costs/finish`. Stage by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Never format** `CLAUDE.md` (CRLF) or the specs (LF); hand-edit them and keep each file's line endings (`file <path>` tells). The E2E spec is CRLF in a fresh worktree, so format it only with `npx prettier --end-of-line auto`.
- **How the edits read:** "Replace: A with: B" is one Edit (old A, new B). "Replace the lines from `A` to the end of the file with: C" runs from the start of the line that reads `A` to the file's last line. Every anchor below was checked unique at `6e667e2`. No other area edits `CLAUDE.md`, the spec, `package.json` or the E2E, so the anchors are still unique at `<merge>`.
- **Every command runs from the worktree's root** (`/c/Projects/alloy-costs-finish`) in a subshell, and every commit block starts with `cd /c/Projects/alloy-costs-finish`.
- **`$S`** is the scratchpad: `S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad`. Node takes `C:/` paths, so the bundle is `B=C:/Projects/alloy-costs-finish/packages/engine/dist/index.js`.
- **The before files** are `$S/rune-costs-before/`, recorded from `6e667e2` (v0.51.0) for step 1. `pacing-before.txt` reads:

```text
first dive: 3, 3, 3, 3 (each ≥ 3), mean 3 (3–12)
dive 6 mean 24.25, dive 12 mean 36 (> dive 1 + 5, > dive 6)
frost: dive 1 3.5, dive 12 35.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 5.75 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 24, 21–31 (allowed 14.4–38.4): fire+frost 21, earth+frost 30, storm+fire 24, frost+storm 31, fire+shadow 22, fire+nature 26, shadow+nature 21, fire+earth 30, storm+earth 24, earth+shadow 29, earth+nature 22, frost+shadow 21, frost+nature 29, storm+shadow 29, storm+nature 22
seconds per floor: 29.80 (8–60)
```

- **At `6e667e2`** the engine suite is 1596 tests in 82 files and the client's 860 in 98. Step 1, A and B add their own, and the gate file adds skipped ones.

**Commands:**

| What | Command (from the worktree's root) |
|---|---|
| The engine's bundle | `(cd packages/engine && npx tsup)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| The gate | `(cd packages/engine && RUNE_COST_GATE=1 npx vitest run tests/delve-rune-costs-gate.test.ts)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Client typecheck, tests | `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)` |
| Client build | `(cd packages/client && npx tsc -b && npx vite build)` (the package's `build` script) |
| E2E | `(cd packages/client && npx playwright test -c playwright.scratch.config.ts <specs>)` |

---

## Chunk 1: The measured gate

### Task 1: Re-run the gate and the rails on the merged build, and record them in the spec

A measured the gate and the rails in its own worktree. Merging B touches no number (B changes no sim, data or Power file), and the sim is deterministic, so the merged build must print exactly A's numbers. This task checks that, then writes the numbers into the spec. If anything differs, stop: the merge moved a number, and that is a bug to find, not a number to record.

**Files:**
- Create (scratchpad, not the repo): `$S/rune-costs-after/{gate,pacing-after,first-dives-after,rune-use-after}.txt`
- Modify: `docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md` (line 3, the status; line 406, the **Measured** bullet; LF, never format)

- [ ] **Step 1: The bundle**

Run: `(cd packages/engine && npx tsup && for n in baseCost manaSupport runeLoad loadEase loadText; do grep -qw "$n" dist/index.d.ts && echo "$n ok"; done)`
Expected: tsup's "Build success" lines (ESM, CJS and DTS), then five lines, `baseCost ok` to `loadText ok`. The contract's and B's exports, which the E2E imports, are all in the bundle.

- [ ] **Step 2: The gate**

Run: `(mkdir -p $S/rune-costs-after && cd packages/engine && RUNE_COST_GATE=1 npx vitest run tests/delve-rune-costs-gate.test.ts 2>&1 | tee $S/rune-costs-after/gate.txt | tail -40)`
Expected: the gate's tests pass, and their output has one row per Primary form (Bolt, Volley, Lance, Burst, Strike). Each row gives the form's set; its full-mana, starved and supported ratios, loaded and unloaded, on the pack and on one dummy; and its mana per press for both builds. A's gate file sets the exact layout.
- Every supported pack ratio is at least 1.5×.
- Every starved mana per press is 2.0–3.0×.

**If a test fails, stop.** Report the whole of `gate.txt`. The merged build breaks a gate that A's build met.

- [ ] **Step 3: The rails, the first dives and the rune use**

Run (about two minutes):

```bash
B=C:/Projects/alloy-costs-finish/packages/engine/dist/index.js
(cd $S/rune-costs-before && node pacing.mjs $B | tee $S/rune-costs-after/pacing-after.txt)
(cd $S/rune-costs-before && node first-dives.mjs $B | tee $S/rune-costs-after/first-dives-after.txt)
(node $S/runes-gate/rune-use.mjs $B | tee $S/rune-costs-after/rune-use-after.txt)
```

Expected:
- `pacing-after.txt`: seven lines shaped as `pacing-before.txt`, each inside the bounds its parentheses print.
- `first-dives-after.txt`: four lines shaped as `$S/rune-costs-before/first-dives-before.txt`.
- `rune-use-after.txt`: four lines, `seed N: <rarity> weapon, sockets S, socketed [<rune> <tier>, …], pouch P, depth D, power W`. The spec expects fewer runes socketed than at v0.51.0, since the bot sockets a rune only where it nets Power.

`(cd packages/engine && npx vitest run)` in Task 4 runs the same rails as tests.

- [ ] **Step 4: Check against A's report**

Compare, number by number:
- `gate.txt`'s rows against A's gate rows;
- `pacing-after.txt` and `first-dives-after.txt` against A's "after the loads" pacing.

Expected: identical. **If any number differs, stop and report both** (the line from here and A's line). Don't edit the spec from either until the controller says which build is right.

- [ ] **Step 5: The spec's status and its Measured bullet**

In `docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md` (LF; never format), fill each `<…>`:
- the gate rows from `gate.txt`;
- the ceilings and the two earlier pacing stages from A's report;
- the last pacing stage from `pacing-after.txt`;
- the rune use from `rune-use-after.txt`.

Where the template's wording doesn't fit a number (A's gate printed a field differently, or A tuned nothing), keep the field and reword around it. Never drop a number the template asks for.

Replace:

```markdown
**Status:** approved design, 2026-10-01.
```

with:

```markdown
**Status:** approved design, 2026-10-01; built as v0.52.0, its gate and pacing measured under "Balance and gates" (**Measured**).
```

Replace:

```markdown
- **Measured** after the build goes in the release notes: each form's set and ratios for both builds, the singles' and the combos' maxima against the ceilings, and the pacing rails at each stage.
```

with:

```markdown
- **Measured** at v0.52.0: the DPS Lab at depth 10, eight combat seeds (`RUNE_COST_GATE=1 npx vitest run tests/delve-rune-costs-gate.test.ts`), and the pacing rails at `tests/delve-pacing.test.ts`'s seeds. <"The starting loads and easing, nothing tuned." | "Tuned at the gate: <A's changes, e.g. `byForm.lance` 0.9>; the first run's breach beside the final numbers (<…> → <…>).">
  - **The sustained gate, pack.** Starved and supported are loaded, with unloaded in brackets:

    | Form | Set | Mana per press, starved / supported | Full mana, unloaded → loaded | Starved | Supported |
    |---|---|---|---|---|---|
    | Bolt | <set> | <x>× / <x>× | <x> → <x> | **<x>** (<x>) | **<x>** (<x>) |
    | Lance | <set> | <x>× / <x>× | <x> → <x> | **<x>** (<x>) | **<x>** (<x>) |
    | Burst | <set> | <x>× / <x>× | <x> → <x> | **<x>** (<x>) | **<x>** (<x>) |
    | Strike | <set> | <x>× / <x>× | <x> → <x> | **<x>** (<x>) | **<x>** (<x>) |
    | Volley | <set> | <x>× / <x>× | <x> → <x> | **<x>** (<x>) | **<x>** (<x>) |

  - **One dummy** (reported). Each form reads full mana unloaded → loaded; starved (unloaded); supported (unloaded):
    - Bolt <x> → <x>; <x> (<x>); <x> (<x>).
    - Lance <x> → <x>; <x> (<x>); <x> (<x>).
    - Burst <x> → <x>; <x> (<x>); <x> (<x>).
    - Strike <x> → <x>; <x> (<x>); <x> (<x>).
    - Volley <x> → <x>; <x> (<x>); <x> (<x>).
  - **Supported clears 1.5× on every form:** <lo>–<hi>× on the pack, lowest on <form>.
  - **Starved:** <lo>–<hi>× on the pack (the target is about 0.9–1.2×; Volley <x>×).
  - **The price bites:** the mana per press is <x>× starved (band 2.0–3.0×) and <x>× supported, and every loaded ratio is below its unloaded one.
  - **The ceilings, unloaded** (`bySlot` zeroed, as at v0.51.0):
    - singles at most <x>× on one dummy (<rune> on <on>) and <x>× on the pack (<rune> on <on>);
    - sets at most <x>× on the pack (<set> on <on>), with the one-dummy Nova-with-Linger sets as at v0.51.0 (<x>× at most).
    - Loaded at full mana, the same maxima read <x>× / <x>× (singles) and <x>× / <x>× (sets).
  - **Pacing** (v0.51.0 → Power's pool rule → the loads):
    - first dives 3, 3, 3, 3 → <…> → <…>;
    - dive 6 and dive 12 means 24.25, 36 → <…>, <…> → <…>, <…>;
    - Frost, dive 1 → dive 12: 3.5 → 35.5, then <…> → <…>, then <…> → <…>;
    - legendaries at dive 12: 5.75 → <…> → <…>;
    - the own pair's reaction: 6 of 6 → <…> → <…>;
    - the 15-pair sweep's median: 24 (21–31) → <…> (<…>) → <…> (<…>; allowed <…>);
    - seconds a floor: 29.80 → <…> → <…>.
    - At dive 12, the four seeds' weapons hold <…> runes socketed in <…> sockets (<the runes, from `rune-use-after.txt`>).
```

- [ ] **Step 6: Check the edits**

Run: `(grep -c "built as v0.52.0" docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md; grep -c "<x>\|<…>\|<set>\|<lo>\|<hi>\|<form>" docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md; file docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md)`
Expected:
- `1`, then `0`: every placeholder filled (the spec held none at `6e667e2`).
- `file` doesn't say "CRLF".

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/alloy-costs-finish
git add docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md
git commit -m "docs: the rune costs spec's measured gate: supported clears 1.5x on every Primary form, starved in its trap, the rails holding" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

If a supported ratio, the band or a rail failed, Steps 2–4 have already stopped this task. Write the subject from the measured numbers, and don't claim what they don't show.

## Chunk 2: The E2E

### Task 2: The Delve E2E for the costs, on all four devices

The spec's testing section says "E2E: none new; every Delve spec passes". The controller asked for coverage of the costs too, so this task does both: the existing Delve E2E passes first, then three tests join `delve-runes.spec.ts`.
- **R05:** the builder shows a socketed rune's price, a candidate's price, the move's runes note, the easing line and the mana-support line; the pouch shows the raw price.
- **R06:** a mana move that only its runes' load puts over the pool shows the existing warning, with the loaded cost.
- **R07:** the DPS Lab's Mana select runs the grid starved and supported.

**How each test gets its expected text:**
- R05 and R06 compute it from the engine's bundle in the test process, the way `R01` reads `runeText`. So they follow whatever loads A shipped. Each guards its premise with `expect`s before the page loads: R05 checks that a load and an ease are there; R06 checks that the move is over the pool only because of its load.
- R07 reaches the Lab by its URL. The E2E runs on a Vite dev server, so `import.meta.env.DEV` is true and `DEV_LAB`'s route exists. No E2E opened the Lab before: it was tested only by its unit tests (`lab-model.test.ts`, `dev-routes.test.tsx`, `LabTable`, `LabChart`).

The features exist (A and B), so this is a test-after task. The new tests should pass on their first run. If one fails on a missing test id or a text worded differently, an area named it otherwise (see Cross-area needs): map it here, in the E2E, not in the component.

**Files:**
- Modify: `packages/client/e2e/delve-runes.spec.ts` (CRLF in the working tree)

- [ ] **Step 1: The dev server from the worktree, and the scratch config**

Task 1 built the bundle. Run the PowerShell block. It stops whatever owns port 5288 and starts a detached Vite from the worktree's client. It then waits for a 200 and prints `True`:

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5288 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\alloy-costs-finish\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5288 --strictPort --force --host'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5288').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

Expected: `True`.

Create `packages/client/playwright.scratch.config.ts` (never commit it). It reuses the 5288 server instead of Playwright's own on 5199, and drops the responsive project:

```ts
import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  globalSetup: undefined,
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://localhost:5288' },
  webServer: { command: 'echo reuse', url: 'http://localhost:5288', reuseExistingServer: true },
  projects: (base.projects ?? []).filter((p) => p.name !== 'responsive'),
});
```

- [ ] **Step 2: The Delve E2E as it stands**

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts e2e/delve-runes.spec.ts)`
Expected: 84 passed, 21 on each of the four devices (delve 8, gamepad 7, training 2, runes 4; about 5 minutes). This is v0.51.0's E2E on the merged build, and it must pass before any test is added.
- A timeout under load that passes on a rerun (`-g <test> --repeat-each 2`) is flakiness.
- A consistent failure is a regression from step 1, A or B. Debug it with the page's state and logging, not guesses or longer timeouts.

- [ ] **Step 3: The costs' tests**

In `packages/client/e2e/delve-runes.spec.ts` (CRLF; the Edit tool keeps it):

Replace:

```ts
import {
  beginFloor,
  completeFloor,
  createDefaultRegistry,
  createDelveProfile,
  movesetOf,
  runeText,
  startDive,
  stopKinds,
  type DataRegistry,
  type DelveProfile,
  type GearItem,
  type RuneRef,
} from '@alloy/engine';
```

with:

```ts
import {
  baseCost,
  beginFloor,
  completeFloor,
  createDefaultRegistry,
  createDelveProfile,
  defaultMoveset,
  loadText,
  manaPool,
  manaSupport,
  movesetOf,
  profileStats,
  resolveChain,
  runeText,
  startDive,
  stopKinds,
  type Chain,
  type DataRegistry,
  type DelveProfile,
  type GearItem,
  type RuneRef,
} from '@alloy/engine';
```

Replace:

```ts
 * Runes (see the runes spec): a seeded save with sockets and a pouch; the Anvil's picker and
 * Apply, the HUD's pips in a dive, the stop's fifth kind, and fusing on the Forge tab.
```

with:

```ts
 * Runes (see the runes spec): a seeded save with sockets and a pouch; the Anvil's picker and
 * Apply, the HUD's pips in a dive, the stop's fifth kind, and fusing on the Forge tab. Their
 * costs (the rune costs spec): the builder's prices, easing and mana support, the pool's
 * warning, and the DPS Lab's Mana select.
```

Replace:

```ts
const QUICK_III: RuneRef = { id: 'quick', tier: 3 };
```

with:

```ts
const QUICK_III: RuneRef = { id: 'quick', tier: 3 };
const ECHO_III: RuneRef = { id: 'echo', tier: 3 };
/** The DPS Lab's first rows: its worker loads the engine, slowly when many browsers run at once. */
const LAB_READY = 30_000;
```

Replace the lines from `await expect.poll(async () => (await saved(page)).runes.split).toEqual([0, 1, 0, 0, 0]);` to the end of the file with:

```ts
    await expect.poll(async () => (await saved(page)).runes.split).toEqual([0, 1, 0, 0, 0]);
  });

  test('R05: the builder prices a rune, eases it by attunement and shows the mana support', async ({
    page,
  }) => {
    const registry = createDefaultRegistry();
    // Echo III on the starting sword's Fire Bolt (Fire attunement 2); Quick III in the pouch.
    const profile = heroWith(registry, [ECHO_III], { runes: { quick: [0, 0, 1, 0, 0] } });
    const stats = profileStats(registry, profile);
    const chain = movesetOf(registry, profile.equipped.weapon!).chains.primary!;
    const resolved = resolveChain(registry, stats, 'primary', chain);
    const bolt = resolved.moves[0];
    // The loads are on and the hero's attunement eases them: else this test shows nothing.
    expect(bolt.payment).toBe('mana');
    expect(bolt.load).toBeGreaterThan(0);
    expect(bolt.ease).toBeGreaterThan(0);
    const terms = { payment: bolt.payment, ease: bolt.ease };
    const support = manaSupport(registry, stats, resolved);
    await seed(page, profile);
    await page.goto('/delve');
    await page.getByTestId('tab-abilities').click();

    // The move's readout: its loaded cost, the runes' share of it, and what attunement takes off.
    const readout = page.getByTestId('ability-readout');
    await expect(readout).toContainText(`${Math.round(bolt.cost)} mana`);
    await expect(readout).toContainText(`(runes: ${loadText(registry, bolt.load, 'mana')})`);
    await expect(readout.getByTestId('rune-ease')).toHaveText(
      `Attunement eases rune cost by ${Math.round(bolt.ease * 100)}%`,
    );
    // The chain's spend against the build's refill, as the engine counts them.
    await expect(page.getByTestId('mana-support')).toHaveText(
      `Spends ${Math.round(support.spend)}/s · your build refills ${Math.round(support.refill)}/s`,
    );

    // The picker: the socketed rune's price and a candidate's, eased as the move is.
    await page.getByTestId('chain-cards').getByTestId('socket-0').click();
    const picker = page.getByTestId('rune-picker');
    await expect(picker.getByTestId('rune-current')).toContainText(
      runeText(registry, ECHO_III, { form: 'bolt' }, terms).cost!,
    );
    await expect(picker.getByTestId('rune-pick-quick')).toContainText(
      runeText(registry, QUICK_III, { form: 'bolt' }, terms).cost!,
    );
    await picker.getByTestId('rune-picker-close').click();
    await expect(picker).toBeHidden();

    // The pouch: a rune's raw price, with no move to ease it.
    await page.getByTestId('tab-forge').click();
    await expect(page.getByTestId('pouch-quick-3')).toContainText(
      runeText(registry, QUICK_III).cost!,
    );
  });

  test("R06: a runed mana move the pool can't hold is flagged in the builder", async ({ page }) => {
    const registry = createDefaultRegistry();
    // An epic sword carries an Ultimate: a medium Fire Nova paid with mana, Echo III socketed.
    const base = createDelveProfile(registry, 4242, { primary: 'fire' });
    const sword: GearItem = { ...base.equipped.weapon!, rarity: 'epic' };
    const moveset = defaultMoveset(registry, sword, 'fire');
    const ultimate: Chain = {
      moves: [{ kind: 'medium', form: 'nova', elements: ['fire'], runes: [ECHO_III] }],
      payment: 'mana',
    };
    const weapon = { ...sword, moveset: { ...moveset, chains: { ...moveset.chains, ultimate } } };
    const profile: DelveProfile = { ...base, equipped: { ...base.equipped, weapon } };
    const stats = profileStats(registry, profile);
    const pool = manaPool(stats, registry).max;
    const nova = resolveChain(registry, stats, 'ultimate', ultimate).moves[0];
    // Only the runes' load puts it past the pool.
    expect(baseCost(nova)).toBeLessThanOrEqual(pool);
    expect(nova.cost).toBeGreaterThan(pool);
    await seed(page, profile);
    await page.goto('/delve');
    await page.getByTestId('tab-abilities').click();
    await page.getByTestId('chain-skill-ultimate').click();
    await expect(page.getByTestId('cost-warning')).toHaveText(
      `Needs ${Math.round(nova.cost)} mana; your pool holds ${Math.round(pool)}.`,
    );
  });

  test('R07: the DPS Lab runs its grid starved and supported (dev builds)', async ({ page }) => {
    const failures: string[] = [];
    page.on('pageerror', (e) => failures.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && m.text().startsWith('DPS Lab worker')) failures.push(m.text());
    });
    await page.goto('/delve/lab');
    const mana = page.getByTestId('lab-mana');
    await expect(mana).toHaveValue('full');
    await expect(page.getByTestId('lab-row').first()).toBeVisible({ timeout: LAB_READY });
    for (const sustained of ['starved', 'supported']) {
      await mana.selectOption(sustained);
      await expect(mana).toHaveValue(sustained);
      // A fresh run under the option: the progress bar is back, and its rows fill the table.
      await expect(page.getByTestId('lab-progress')).toBeVisible();
      await expect(page.getByTestId('lab-row').first()).toBeVisible({ timeout: LAB_READY });
    }
    expect(failures).toEqual([]);
  });
});
```

Why each seed works. The plan author checked the seeds against the v0.51.0 bundle with `parseDelveProfile`: both saves load unchanged.
- **R05.** The starting sword is a common Fire sword. Its Primary is one light Fire Bolt paid with mana, its cap is one socket, and the hero has Fire attunement 2 (pool 66). So Echo III fits and acts, and its load is eased by `easePerAttune × 2` (6% at the shipped 0.03).
  - Quick III is offered as a replacement candidate: it fits a Bolt and isn't on the move.
  - With the spec's loads, the readout reads "8 mana" (5.6 × 1.423), "(runes: +42% cost)" and "Attunement eases rune cost by 6%". The test computes all three, so tuned loads still match.
- **R06.** An epic weapon carries all four chains (`movesets.carries.epic`) and opens up to three sockets, so the seeded Ultimate with one socket loads unchanged. A medium mana Nova costs 60 before its load. The epic sword's attunement gives Fire 3 (pool 69). With Echo III eased 9%, the Nova costs about 84.6, so the warning reads "Needs 85 mana; your pool holds 69." The two `expect`s before the page loads guard that premise against any tuning.
- **R07.** `/delve/lab` needs no save. The basic view's rows come first in `dpsCombos`, so the first batch (50 rows) fills the default view within seconds of the worker starting.

- [ ] **Step 4: Run the new tests**

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve-runes.spec.ts -g "R05|R06|R07")`
Expected: 12 passed, 3 on each of the four devices (about a minute).
- A failure that names a missing test id, or a text worded differently from the Cross-area needs, is an area naming it otherwise. Find the name in the component and use it here.
- A failing guard `expect` (before `seed`) means the shipped loads or easing don't give the premise. Report the numbers; don't loosen the guard.

- [ ] **Step 5: Run the Delve E2E**

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts e2e/delve-runes.spec.ts)`
Expected: 96 passed, 24 on each of the four devices (delve 8, gamepad 7, training 2, runes 7; about 6 minutes). Then delete `packages/client/playwright.scratch.config.ts`, and leave the 5288 dev server running.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-costs-finish
(cd packages/client && npx prettier --end-of-line auto --write e2e/delve-runes.spec.ts)
git add packages/client/e2e/delve-runes.spec.ts
git commit -m "test(client): the Delve E2E on rune costs: the builder's prices, easing and mana support, the pool warning, the Lab's Mana select" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

The code above is already Prettier-formatted (the plan author checked the whole edited file with `npx prettier --stdin-filepath packages/client/e2e/delve-runes.spec.ts`), so `--write` changes nothing if it was typed as written. `--end-of-line auto` keeps the file's CRLF.

## Chunk 3: The docs, the version and the full verification

### Task 3: The Delve notes

**Files:**
- Modify: `CLAUDE.md`, the Delve section: the Spec bullet (line 78), the Engine bullet (79), the Runes bullet (86) and the DPS Lab bullet (95). It is CRLF: hand-edit it, never format it.

- [ ] **Step 1: CLAUDE.md**

Apply the edits in the file's order, top to bottom. Each replaces part of one line; the four Runes edits are in that line's order. Fill the last edit's `<…>` from the spec's **Measured** bullet (Task 1).

Replace:
```markdown
runes (sockets on moves, the pouch, knobs, fusing): `docs/superpowers/specs/2026-09-30-delve-runes-design.md`
```
with:
```markdown
runes (sockets on moves, the pouch, knobs, fusing): `docs/superpowers/specs/2026-09-30-delve-runes-design.md`; rune costs (the load, easing, the payments, the two-build gate): `docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md`
```

Replace:
```markdown
and values a hold at full charge: `valuedMove`)
```
with:
```markdown
and values a hold at full charge: `valuedMove`; against the hero's pool, `valuedChain` values a hold at the highest stage the pool affords and cuts a chain after its first move the pool can't pay)
```

Replace:
```markdown
`drainShare` (half) of the move's own mana cost a cast
```
with:
```markdown
`drainShare` (half) of the move's own mana cost before its runes' load (`baseCost`) a cast
```

Replace:
```markdown
Power values socketed runes through `damagePerUse` and `estimateCombat` (Drain's terms under the same cap).
```
with:
```markdown
Power values socketed runes through `damagePerUse` and `estimateCombat` (Drain's terms under the same cap), net of their price (see Rune costs).
```

Replace:
```markdown
every three-rune set of a form or a weapon's blows, at tier III):
```
with:
```markdown
every three-rune set of a form or a weapon's blows, at tier III, measured with the loads zeroed since v0.52.0):
```

Replace:
```markdown
under 4.0×.
```
with:
```markdown
under 4.0×. **Rune costs** (spec: `docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md`; v0.52.0, no save change): every rune row has a `load`, five fractions by tier that never fall (`RuneDefSchema`), its price. A move's raw load is the sum, over the runes acting on it (`ResolvedAbility.runes`, so a dormant rune costs nothing), of `runeLoad(registry, ref, form)`: the tier's load × `bySlot[slot]` × `byForm[form]` (1 when missing). Attunement in the move's elements (their mean, as `attunePower`) eases the sum once: `load = raw × (1 − ease)`, `ease = min(easeCap, easePerAttune × attunement)` (`loadEase`), both on `ResolvedAbility` (`load` and `ease`, the ease set with or without runes). `resolveAbility` raises the price in the chain's own payment: a mana move's cost and a cast's mana × (1 + load) (one product with Manaweaver and `castManaMult`), a charge move's `chargeNeed` × (1 + load × `charge`) (`chargeCap` follows), and a cast's channel × (1 + load × `cast`), the conjure untouched. No cooldown changes, the charge lockout included; basic blows are free, and an Echo stays free. Every sim reader follows unchanged (`canAfford`, `pressDue`, `startHold`, `releaseHold`, `pay`, the HUD), and Drain's cap is on `baseCost(ab)`, the cost before the load. The factors live in `balance.json → delve.runes.load` (`bySlot`; `byForm`, whose keys are checked against the forms; `charge`; `cast`; `easePerAttune`; `easeCap`, at most 1). `loadText` and `runeText`'s price terms (`{ payment, ease }`, its `cost`) are the only formatters: "+N% cost", "+N% charge", "+N% cast wind-up, +N% cost". A blow and a dimmed rune show no price; the picker shows the move's eased price and the pouch the raw one. The builder's pay line appends "(runes: …)", a line says "Attunement eases rune cost by N%" ("(the most it can)" at the cap), and a mana or cast chain shows "Spends X/s · your build refills Y/s" (amber when over) from `manaSupport(registry, stats, chain)`: the spend at the chain's cadence, and `basicIncome` (regen, the basics and their Drain) plus the chain's own Drain. Power nets the price through `useInterval` and the pool through `valuedChain`, so the autopilot sockets a rune only where it raises Power. **The two-build gate** (`tests/delve-rune-costs-gate.test.ts`, skipped unless `RUNE_COST_GATE` is set): for each Primary form, its best three-rune tier-III set (ranked with the loads zeroed) against the rune-less chain, sustained on the pack (`DpsOptions.sustained`). Starved is reported (target about 0.9–1.2×), supported must reach at least 1.5×, and the mana per press must be 2.0–3.0× on the starved hero. Measured at v0.52.0: supported <lo>–<hi>× (lowest <form>), starved <lo>–<hi>×, the mana per press <x>× starved and <x>× supported. When it fails, tune `byForm`, then `bySlot`, then `easePerAttune` / `easeCap`, then the rune rows; never the ceilings, the floor, the band or the pacing rails.
```

Replace:
```markdown
and nothing else, full mana at the start, the button held
```
with:
```markdown
and nothing else, full mana at the start (or sustained, `DpsOptions.sustained`: the pool and every charge meter empty at the start; `'starved'` the hero as built, `'supported'` with +14 attunement in the setup's first element and +5 in its second, +30% Mana Regen and Drain III in every basic blow), the button held
```

Replace:
```markdown
runs the grid in a fresh worker per request and keeps results for the session;
```
with:
```markdown
runs the grid in a fresh worker per request, under a Mana select beside Pack (full, starved, supported; `lab-mana`), and keeps results for the session by depth, pack and mana (`remember` / `recall`);
```

- [ ] **Step 2: Check the edits**

Run: `(grep -c "2026-10-01-delve-rune-costs-design.md" CLAUDE.md; grep -o "valuedChain" CLAUDE.md | wc -l; grep -c "<lo>\|<hi>\|<x>\|<form>" CLAUDE.md; file CLAUDE.md)`
Expected:
- `2`: the Spec line and the Runes line;
- `2`: the Engine bullet and the Rune costs passage;
- `0`: every placeholder filled;
- `CLAUDE.md` still "with CRLF line terminators".

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/alloy-costs-finish
git add CLAUDE.md
git commit -m "docs: rune costs in the Delve notes: the load and its easing, the payments, free basics, manaSupport, the Lab's sustained mode, the two-build gate, valuedChain" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: The version, and the full verification

**Files:**
- Modify: `packages/client/package.json:3`

- [ ] **Step 1: The version**

In `packages/client/package.json`:

Replace:
```json
  "version": "0.51.0",
```
with:
```json
  "version": "0.52.0",
```

- [ ] **Step 2: The engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run && npx tsup)`
Expected:
- no type errors;
- every test passes, the pacing rails included, with the gate's tests skipped (`6e667e2` had 1596 tests in 82 files; step 1, A and B add `delve-rune-costs.test.ts`, the gate file and their tests elsewhere);
- the build succeeds.

- [ ] **Step 3: The client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors, and every test passes (`6e667e2` had 860 tests in 98 files; A and B add theirs).

Run: `(cd packages/client && npx tsc -b && npx vite build) && grep -l '0\.52\.0' packages/client/dist/assets/*.js`
Expected: the build succeeds (Vite's warning about chunks over 500 kB is expected), and grep prints one file, `packages/client/dist/assets/index-<hash>.js`, so the bundle carries the new version. The Lab's chunk is absent from a production build (`DEV_LAB` is null there).

- [ ] **Step 4: Prettier on the changed files**

Run this over every TypeScript file changed since the plan's base, `6e667e2`, except the never-format list. Use `--end-of-line auto`, since several files are CRLF in the working tree and clean but for that:

`(files=$(git diff --name-only 6e667e2 HEAD -- '*.ts' '*.tsx' | grep -v -E 'arpg/geometry.ts|data/game-config.ts|delve/autopilot.ts|delve/dive.ts|loot/drops.ts|item-generator.ts|loot/smithing.ts|delve-pacing.test.ts|ItemDetailSheet.test.tsx|delve-chain-feel.test.ts'); echo "$files" | wc -l; npx prettier --end-of-line auto --check $files)`
Expected: a count (about 30: step 1's, A's and B's sources and tests, and this plan's E2E file), then "All matched files use Prettier code style!". (Every TypeScript file the spec names was Prettier-clean at `6e667e2`, checked this way.)

A file listed is one an area left unformatted. Format it with `npx prettier --end-of-line auto --write <file>`, check that `git diff` shows only that area's own lines, and commit it as `style: prettier on <file>` before Step 6.

- [ ] **Step 5: The E2E on the final bundle**

Run the PowerShell block under Task 2, Step 1. It restarts the server on the rebuilt bundle, and the TabBar shows v0.52.0. Expect `True`. Create `packages/client/playwright.scratch.config.ts` from Task 2, Step 1 again, then:

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts e2e/delve-runes.spec.ts)`
Expected: 96 passed, 24 on each of the four devices (about 6 minutes). Then delete `packages/client/playwright.scratch.config.ts`. Leave the 5288 dev server running for the user to play on; it serves this worktree, so tell the controller before the worktree is removed.

- [ ] **Step 6: Commit the version**

```bash
cd /c/Projects/alloy-costs-finish
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.52.0" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Don't push: the controller pushes after the final review.

## Verification

The area's end check is Task 4, Steps 2–5, after its commit:
- the engine's typecheck, suite (the pacing rails holding with the loads) and build;
- the client's typecheck, suite and build (carrying 0.52.0);
- Prettier on every TypeScript file changed since `6e667e2`;
- the Delve E2E: 96 tests on four devices.

From Task 1:
- the gate re-run on the merged build: supported at least 1.5× on every Primary form, and the starved mana per press 2.0–3.0×;
- the rails, the first dives and the gate rows identical to A's report.

`git status --short` then shows nothing tracked as changed: the scratch config is deleted, and `dist/` is ignored. `git log --oneline -4` shows the version, docs, E2E and status-line commits on top of `<merge>`.
