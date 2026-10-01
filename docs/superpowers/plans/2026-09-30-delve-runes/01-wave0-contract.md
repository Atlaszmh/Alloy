# Delve Runes, Wave 0: the Contract — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay down everything waves 1 to 3 build against, with no change to how anything plays: the rune types, `runes.json` (all 14 runes, five tiers each) with its schema and the registry's getters, `balance.json → delve.runes`, the new knobs at neutral values (and `Knobs.pierce` as a count), save v7 with its load-time trims, the pure helpers, a stub for every function wave 1 fills in, and the pre-exports in `src/index.ts`. It ends with the DPS Lab grid, the pacing, the first dives and the items hash identical to the "before" files Task 1 records.

**Architecture:** Types first (`src/types/rune.ts`; `Knobs` gains its eight new knobs and `pierce` becomes a count, with `KnobsData` for data's partial form), then data (`runes.json` validated by `RunesSchema` through the same `KnobsSchema` as elements and fusions), then the pure helpers (`src/loot/runes.ts`), then the sim's contract (world fields, event kinds, hit options and the stubs), then the save (v7, `fitMovesets`' socket trims under the parts rule), then the client's two compile fixes and its one test change. Every new field is neutral: `mergeKnobs` multiplies by 1 and adds 0, `moveBeat` is `beatFor × 1`, every projectile's `pierceLeft` is `Infinity` exactly where `pierce` was `true`, and nothing calls a stub.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom), Zod 3, React 19.

**Spec:** `docs/superpowers/specs/2026-09-30-delve-runes-design.md` at `81b0e31`, its "Build waves → Wave 0: the contract" section. Read the overview (`00-overview.md`) for the conventions every runes plan file shares.

**Base:** `claude/alloy-loot-gear-system-6upsy5` at `81b0e31` (v0.50.0 code plus the runes spec). Nothing needs merging first. Wave 0 is one agent; it runs in its own worktree, `../alloy-contract` on branch `runes/contract`, and the controller merges it before wave 1 starts.

---

## How this plan was checked

Every edit below was applied, in order, to a copy of the working tree at `81b0e31` (with the working tree's own line endings) by the controller's `apply2.mjs` rules, and each task's tests were run at both of their steps; the expected failures and passes below are those runs. At the end:

- the engine's suite goes from **1427 tests in 78 files** (HEAD) to **1466 passed and 11 todo (1477) in 79 files**; its typecheck is clean;
- the client's suite stays at **781 tests in 91 files**, its typecheck is clean, and `vite build` builds;
- against the "before" files: the DPS Lab grid (9,144 runs) has **0 differing rows**, the pacing output and the first dives are **byte-identical**, and the items hash is **the same**.

## Where the spec left room (decided here)

- **Rune ids, icons and templates.** Ids: `split`, `multishot`, `pierce`, `chain`, `widen`, `quick`, `echo`, `heavy`, `saturate`, `linger`, `volatile`, `leech`, `drain`, `guard`, in the spec table's order. Icons: ✳️ (the spec's), 🔱, 📌, ⛓️, ⭕, ⏩, 🔁, 🔨, 💧, ☁️, 💥, 🩸, 🌀, 🛡️. Every effect and trade-off is a template over its tier's knobs (Task 3 lists them); the trade-offs read "Power −10%" (Pierce, Widen, Quick), "Beat and wind-up +20%" (Heavy) and "Each shot at 65% power" (Multi-shot).
- **`runeText`'s numbers.** `{path:%}` prints the value × 100 rounded to at most three decimals (0.3 → "30%", 0.6875 → "68.75%", Volley's 0.84375 → "84.375%"); `{path:±%}` prints (value − 1) × 100 the same way, signed with "+" or U+2212 "−" ("Beat −20%"); `{path}` prints the value the same way ("+1.5 mana"). **A trade-off that comes to no change is null:** with `on: { form: 'barrage' }` Multi-shot's cut is gone, so its trade-off is null rather than "Each shot at 100% power".
- **One rule for Multi-shot's cut.** `loot/runes.ts` exports `extraShotPower(power, form)` (the cut in full, half of it on a Volley, none on a Barrage). `runeText` uses it; wave 1A's resolver should too, so the two can't drift.
- **Fits in the schema.** `RuneDefSchema` takes `fits.forms` and `fits.weapons` as strings; the data test holds them to `arpg.json`'s forms and `delve.json`'s weapon bases (the spec's "a data test checks every `fits.forms` id").
- **`runeActive` and kinds.** `fits.kinds` limits blows only (a form target ignores it), and "a rune that sets `pierce`" means any of its five tiers sets it.
- **Unarmed.** `runeFits` refuses every blow of `weapon: null`, and `socketCap(registry, null)` is 0.
- **The pouch.** `addToPouch` and `takeFromPouch` never change the pouch they're given, keep an id's row of zeros when its last rune goes, and `takeFromPouch` is all or nothing.
- **Load-time trims** (`fitMovesets`), in this order per move: an unknown id's socket is emptied (it stays open; there is no rune to return); the second socket holding an id already on the move is emptied, its rune leaving by the parts rule; then sockets past the weapon rarity's cap go from the end, a Link each, their runes by the parts rule. A chain the weapon's rarity no longer carries takes its sockets with it (a Link each, known runes by the parts rule), as its extra slots already come back as Links. The parts rule reads `balance.json → delve.runes.unsocket` directly (the load has no override): `'pay'` puts the runes in the pouch, `'destroy'` lists them in `ParsedDelveProfile.runesLost`. Pouch rows of unknown ids are dropped. A move without `runes` stays without (no `runes: []` is added), so every save without sockets round-trips unchanged.
- **The stop.** `StopKind` gains `'rune'` and `stopKinds` maps it to `false`, but `STOP_KINDS` keeps its four kinds: adding `'rune'` there is wave 1B's, with the kind's real rule (the stops tests compare `stopKinds` with the whole of `STOP_KINDS`). `takeStop`'s `StopAction` gains its `'rune'` variant in wave 1B too.
- **Existing functions with new signatures** (`setChains`, `movesetEditPrice`, `editPrice`, `transferMoveset`, `salvageItems`, `fuseGear`, taking origins and `opts.unsocket`) keep today's signatures in wave 0: a working function can't be a stub, and nothing in waves 1A or 1C calls them. Wave 1B changes them. Wave 0 adds only the result fields the spec lists (`runes`, `destroyed`, always empty).
- **`BankResult.runes`** lives in `delve/dive.ts` (the spec's types list puts it under `types/delve.ts`; `BankResult` is declared in `dive.ts`), and `bankWorld` returns `runes: []`.
- **Pre-exports.** `src/index.ts` re-exports the four new modules whole (`export * from`), so a helper wave 1 adds to them is exported without touching `index.ts`; `NEUTRAL` and `moveBeat` join the resolver's list, `knobHitOpts` and `guardLand` are named, and `RuneRefSchema` and `RunePouchSchema` join the save schemas' list (the Training Grounds' store needs them in wave 2E).
- **`it.todo` lines.** The stubs' todo tests live in the contract's own test file, `tests/delve-runes-contract.test.ts`, in three blocks (two for 1B, one for 1A) far apart, so 1A and 1B never edit the same lines: an area that builds a stub may delete its todo line. Wave 1A's `tests/delve-rune-sim.test.ts` and 1B's `tests/delve-runes.test.ts` are theirs to create.
- **`HeroBlow.knobs`** is the shared `NEUTRAL` object, as the spec says; nothing may mutate it (`mergeKnobs` always returns a fresh object).
- **The spec's version-7 list was short.** Besides `delveStore.test.ts:250` and `delve-movesets.test.ts:427`, saves at version 6 are pinned in `delve-dive`, `delve-movesets`, `delve-pair`, `delve-profile-abilities`, `delve-reactions` and `delve-chains` (13 tests; and `ParsedDelveProfile`'s new `runesLost` and `DiveState.runesEarned` in their `toEqual`s), and in `delveStore.test.ts:216` and `:238`. Task 6 and Task 7 update every one.
- **Two client files outside the contract's list need a line each** to keep the client compiling and the builder's readout on `moveBeat` (the spec moves "the builder's readout" to `moveBeat` in wave 0): `StopPanel.tsx`'s `STOP_TEXT` needs a `rune` entry (it is a `Record<StopKind, …>`), with the spec's text; `MoveEditor.tsx`'s beat line calls `moveBeat`. Both are wave 2E's files: E keeps them and builds the stop's picker.

## Files

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/types/rune.ts` (new) | `RuneId`, `RuneTier`, `RUNE_TIERS`, `MAX_SOCKETS`, `RuneRef`, `RuneFamily`, `RUNE_FAMILIES`, `RuneFits`, `RuneDef`, `RunePouch`, `UnsocketMode`, `ChainOrigins`, `RuneTarget` |
| `src/types/index.ts` | re-exports `rune.ts` (CRLF) |
| `src/types/ability.ts` | `Move.runes?`, `Blow.runes?`, `QuickKnob`, `SplitKnob`, `ShotsKnob`, the new `Knobs` fields, `pierce: number`, `KnobsData`, `ResolvedAbility.runes` (CRLF) |
| `src/types/arpg.ts` | `KnobsData` on element traits and fusions, `ArpgData.runes`, `Projectile.pierceLeft`, `knobs?` and `'shard'`, `DropKind 'rune'`, `Drop.rune`, `WorldPending.runes`, `Echo`, `ArpgWorld.runeRng` and `echoes`, `HeroEntity.drained`, the `runeFx` event, `pickup.rune` |
| `src/types/delve.ts` | `HeroBlow.knobs` and `runes`, `DelveBalance.runes`, `StopKind 'rune'`, `DiveState.runesEarned`, `DelveProfile` version 7 and `runes` |
| `src/data/runes.json` (new) | the 14 runes |
| `src/data/schemas.ts` | `KnobsSchema`'s new fields and `pierce` count, `RuneDefSchema`, `RunesSchema`, `delve.runes` |
| `src/data/balance.json` | `delve.runes` (hand-edit, never format) |
| `src/data/loader.ts`, `src/data/registry.ts` | `arpg.runes`; `getRunes`, `getRune`, `findRune` (CRLF) |
| `src/arpg/abilities/resolve.ts` | `NEUTRAL` exported with the new knobs, `mergeKnobs` over `KnobsData` with the new rules and the field-by-field zone, `runes: []`, `moveBeat` (CRLF) |
| `src/arpg/abilities/cast.ts` | `fire`'s beat from `moveBeat` |
| `src/arpg/abilities/targeting.ts` | `spawnProjectile`'s optional `pierceLeft` (CRLF) |
| `src/arpg/abilities/forms.ts`, `src/arpg/basic.ts`, `src/arpg/step.ts` | `pierceLeft` from the knob or the bow; `step.ts` spends it |
| `src/arpg/abilities/impact.ts`, `defend.ts` | `ImpactOpts.shard`; the `knobHitOpts` and `guardLand` stubs |
| `src/arpg/abilities/echo.ts` (new), `src/arpg/rune-drops.ts` (new) | the `queueEcho`, `echoTick` and `dropRune` stubs |
| `src/arpg/combat.ts` | `HitOpts.catalyst` and `manaOnHit` |
| `src/arpg/world.ts` | `runeRng`, `echoes`, `pending.runes`, `drained` |
| `src/loot/runes.ts` (new) | the pure helpers, and the `runeTierAt`, `rollRuneDrop`, `rollSockets`, `weaponParts` stubs |
| `src/delve/runes.ts` (new) | `SetChainsOptions`, `RuneChange`, `DraftPrice`, and the stubs of the profile ops |
| `src/delve/hero-stats.ts` | each blow's `knobs: NEUTRAL` and `runes: []`; `useInterval`'s cadence from `moveBeat` |
| `src/delve/profile-schema.ts` | `RuneRefSchema`, sockets on `MoveSchema` and `BlowSchema`, `RunePouchSchema`, `runesEarned`, the `'rune'` offer, `DelveProfileV6Schema` frozen, version 7 (CRLF, never format) |
| `src/delve/profile.ts` | version 7, `runes: {}`, the v6 → v7 step, `fitMovesets`' trims, `runesLost`, the results' `runes` and `destroyed` |
| `src/delve/dive.ts` | `runesEarned: 0`, `pending.runes`, `BankResult.runes` (CRLF, never format) |
| `src/delve/stops.ts` | `rune: false` |
| `src/index.ts` | the pre-exports |
| `tests/delve-runes-contract.test.ts` (new) | the contract's tests and the stubs' `it.todo`s |
| `tests/ability-resolve.test.ts` | `pierce` is `Infinity`, the field-by-field zone, the neutral knobs' new fields |
| `tests/delve-dive.test.ts`, `delve-movesets.test.ts`, `delve-pair.test.ts`, `delve-profile-abilities.test.ts`, `delve-reactions.test.ts`, `delve-chains.test.ts` | version 7, `runesLost`, `runesEarned` |

**Client (`packages/client/`)**

| File | Change |
|---|---|
| `src/features/delve/StopPanel.tsx` | `STOP_TEXT.rune` |
| `src/features/delve/chains/MoveEditor.tsx` | the beat readout from `moveBeat` |
| `src/stores/delveStore.test.ts` | version 7 |

**Outside the repo:** the scratchpad's `runes-before/` (Task 1).

## Cross-area needs

None: wave 0 needs nothing from another area. Two notes for the controller:

- **Files wave 0 edits that later areas own** (all inside the spec's wave-0 list or needed to compile it): `src/arpg/**` (1A), `src/delve/profile.ts`, `stops.ts`, `dive.ts`, `profile-schema.ts`, `hero-stats.ts` (1B, 2D), `StopPanel.tsx` and `MoveEditor.tsx` (2E). The later areas branch from wave 0's merge, so their anchors are on wave 0's text.
- **For wave 1A:** use `extraShotPower` (exported from `loot/runes.ts`) for Volley's and Barrage's cut, so the resolver and `runeText` keep one rule.

## Line endings and Prettier (check again in the worktree)

At `81b0e31` these files are **CRLF** in the main working tree and are edited by hand only, never formatted: `src/types/ability.ts`, `src/types/index.ts`, `src/arpg/abilities/resolve.ts`, `src/arpg/abilities/targeting.ts`, `src/data/loader.ts`, `src/data/registry.ts`, `src/delve/profile-schema.ts`, `src/delve/dive.ts`; and `src/data/balance.json` is hand-laid-out. Every other file this plan touches is LF and passes `npx prettier --check` at `81b0e31`; the code below is already formatted, so the commit blocks' `prettier --write` changes nothing. A fresh worktree checks every file out CRLF (`core.autocrlf` is on and there is no `.gitattributes`): that is harmless, since git stores LF, and Prettier's rewrite of a CRLF file to LF shows no diff.

## Commands

Run from the worktree's root (`C:\Projects\alloy-contract`; in Bash `/c/Projects/alloy-contract`), each in a subshell:

| What | Command |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests (about 20 s, the pacing rails included) | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| The measuring build | `(cd packages/engine && npx tsup --out-dir node_modules/.runes-measure)` |
| Engine build (the client's bundle) | `(cd packages/engine && npx tsup)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client tests (about 20 s) | `(cd packages/client && npx vitest run)` |
| Client build | `(cd packages/client && npx vite build)` |

`$S` below is the scratchpad: `S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad`. Node takes `C:/` paths: `M=C:/Projects/alloy-contract/packages/engine/node_modules/.runes-measure/index.js`.

---

## Chunk 1: The "before" files, and the knobs

### Task 1: Set up the worktree and record the "before" files

The measurements run on the engine at `81b0e31`, before any edit: the worktree's first state. No commit (nothing in the repo changes).

**Files:**
- Create (outside the repo): `$S/runes-before/{snapshot,identical,pacing,first-dives,items-hash}.mjs`, `before-depth10.json`, `pacing-before.txt`, `first-dives-before.txt`, `items-hash-before.txt`

- [ ] **Step 1: Make the worktree and link its `node_modules`**

PowerShell (Git Bash's `cmd //c mklink` mangles the switches; PowerShell's `cmd /c` doesn't):

```powershell
git -C C:\Projects\Alloy worktree add ..\alloy-contract -b runes/contract 81b0e31
$W = 'C:\Projects\alloy-contract'; $R = 'C:\Projects\Alloy'
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

- [ ] **Step 2: Copy the 4a scripts, and write the items hash's new version**

Four scripts run unchanged against v0.50.0's code (checked: `snapshot.mjs` runs all 9,144 setups, `pacing.mjs` prints every rail, `first-dives.mjs` both dives of each seed):

```bash
S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
mkdir -p $S/runes-before
cp $S/movesets-before/{snapshot,identical,pacing,first-dives}.mjs $S/runes-before/
```

`items-hash.mjs` gains a second hash: 4a's left the movesets out entirely, but the runes spec's item gate is "every v0.50.0 item stat and moveset identical, sockets aside", so the second hash keeps the movesets and leaves out each move's and blow's `runes`. At `81b0e31` no item has a socket, so both hashes cover v0.50.0's items exactly. Write `$S/runes-before/items-hash.mjs`:

```js
// v0.50.0's items, hashed: generateItem over every rarity and slot, and a run of encounter drops.
// Two hashes: the items without their movesets (4a's), and with them but every socket left out
// (the runes spec: every item stat and moveset as v0.50.0 rolled them, sockets aside).
// Usage: node items-hash.mjs <engine dist/index.js>
import { pathToFileURL } from 'node:url';
const E = await import(pathToFileURL(process.argv[2]).href);
const registry = E.createDefaultRegistry();
const RARITIES = ['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary'];
const items = [];
for (let seed = 1; seed <= 30; seed++)
  for (const rarity of RARITIES)
    items.push(E.generateItem(registry, { uid: `g${seed}`, ilvl: seed, rarity, biomeMana: 'frost', pair: ['fire', 'storm'] }, new E.SeededRNG(seed)));
const rng = new E.SeededRNG(7);
let ctx = { depth: 5, kind: 'boss', magicFind: 40, pity: 0, dropMult: 1, legendaryBoost: 1, forceLegendary: true, nextUid: 1, biomeMana: 'earth', pair: ['fire'] };
for (let i = 0; i < 40; i++) {
  const r = E.rollEncounterDrops(registry, { ...ctx, kind: i % 3 ? 'elite' : 'boss', forceLegendary: i === 0 }, rng);
  items.push(...r.items);
  ctx = { ...ctx, pity: r.pity, nextUid: r.nextUid };
}
const fnv = (v) => {
  let h = 0x811c9dc5;
  for (const c of JSON.stringify(v)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16);
};
const bare = (chain) =>
  Array.isArray(chain)
    ? chain.map(({ runes: _r, ...blow }) => blow)
    : { ...chain, moves: chain.moves.map(({ runes: _r, ...move }) => move) };
const unsocketed = (item) =>
  item.moveset
    ? { ...item, moveset: { ...item.moveset, chains: Object.fromEntries(Object.entries(item.moveset.chains).map(([k, c]) => [k, bare(c)])) } }
    : item;
console.log(items.length, fnv(items.map(({ moveset: _m, ...rest }) => rest)), fnv(items.map(unsocketed)));
```

(If the planner's copy is already there, it is this text; the outputs below were made with it.)

- [ ] **Step 3: Build the measuring copy at `81b0e31` and record**

```bash
cd /c/Projects/alloy-contract
git log --oneline -1
(cd packages/engine && npx tsup --out-dir node_modules/.runes-measure)
S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
M=C:/Projects/alloy-contract/packages/engine/node_modules/.runes-measure/index.js
cd $S/runes-before
node snapshot.mjs $M before-depth10.json
node pacing.mjs $M > pacing-before.txt
node first-dives.mjs $M > first-dives-before.txt
node items-hash.mjs $M > items-hash-before.txt
cat pacing-before.txt first-dives-before.txt items-hash-before.txt
```

Expected: `git log` shows `81b0e31`; `snapshot.mjs` prints `runs 9144 ms …` (about 10 s); `pacing.mjs` takes under a minute. The three files read exactly:

```text
first dive: 3, 3, 3, 3 (each ≥ 3), mean 3 (3–12)
dive 6 mean 23.5, dive 12 mean 30 (> dive 1 + 5, > dive 6)
frost: dive 1 4, dive 12 29.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 6.5 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 22, 19–32 (allowed 13.2–35.2): fire+frost 21, earth+frost 19, storm+fire 22, frost+storm 21, fire+shadow 22, fire+nature 22, shadow+nature 20, fire+earth 29, storm+earth 22, earth+shadow 22, earth+nature 20, frost+shadow 21, frost+nature 23, storm+shadow 32, storm+nature 29
seconds per floor: 35.03 (8–60)
1 1→3 dead power 1266 | 1→5 dead power 2867
2 1→3 dead power 1352 | 1→7 dead power 3506
3 1→3 dead power 1022 | 1→5 dead power 2087
4 1→3 dead power 1166 | 1→5 dead power 2913
291 49e20fb6 7c8e6dde
```

And `node identical.mjs $S/movesets-before/after-depth10.json before-depth10.json` prints `rows 9144 before, 9144 after; differing 0` (v0.50.0's grid is 4a's final one). If any line differs, stop: the base isn't `81b0e31`.

- [ ] **Step 4: Remove the measuring copy**

```bash
cd /c/Projects/alloy-contract && rm -rf packages/engine/node_modules/.runes-measure
```

(`packages/engine/node_modules` is a real folder of junctions, so `.runes-measure` is the worktree's own; never `rm -rf` a junction.)

- [ ] **Step 5: The suites at the base**

Run: `(cd packages/engine && npx vitest run)` and `(cd packages/engine && npx tsup) && (cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: the engine 1427 tests pass in 78 files; the client 781 in 91 files, and the typecheck prints nothing.

### Task 2: The rune types and the knobs, all neutral

`types/rune.ts`; `Move` and `Blow` take optional sockets; `Knobs` gains its eight new knobs and `pierce` becomes a count (`KnobsData` is the partial form data and legendaries write, `pierce: true` for every foe); `NEUTRAL` is exported and `mergeKnobs` learns the new rules and the field-by-field zone; `ResolvedAbility.runes` is `[]`; each blow gets `knobs: NEUTRAL` and `runes: []`; `moveBeat` replaces `beatFor` in `fire` and `useInterval`; and every shot carries `pierceLeft`, `Infinity` exactly where it pierced, which `step.ts` spends. Nothing plays differently: Earth's `pierce: true` merges to `Infinity`.

**Files:**
- Create: `packages/engine/src/types/rune.ts`, `packages/engine/tests/delve-runes-contract.test.ts`
- Modify: `packages/engine/src/types/ability.ts`, `src/types/index.ts` (CRLF), `src/types/arpg.ts`, `src/types/delve.ts`, `src/arpg/abilities/resolve.ts`, `src/arpg/abilities/targeting.ts` (CRLF), `src/arpg/abilities/cast.ts`, `src/arpg/abilities/forms.ts`, `src/arpg/basic.ts`, `src/arpg/step.ts`, `src/data/schemas.ts`, `src/delve/hero-stats.ts`, `tests/ability-resolve.test.ts`

- [ ] **Step 1: Write the failing tests**

The contract's test file starts here; later tasks add to it. `ability-resolve.test.ts`'s merge test now expects `Infinity` and the field-by-field zone (Rimeheart and Rimebloom, the one pair of zones that merge today, come out the same under both rules).

Create `packages/engine/tests/delve-runes-contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  NEUTRAL,
  beatFor,
  mergeKnobs,
  moveBeat,
  playedKind,
  resolveAbility,
  resolveChain,
} from '../src/arpg/abilities/resolve.js';
import { makeCtx } from '../src/arpg/combat.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { MOVE_KINDS } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { arena, bal, damaged, dummy, moveOf, press, registry, run } from './fixtures/arena.js';

// The runes spec's wave-0 contract: every new knob neutral, so nothing plays differently yet.

const bare = computeHeroStats({}, registry);

describe('knobs: the new fields and their merge rules', () => {
  it('merges split (the larger count wins), extra shots, echo, quick and the added knobs', () => {
    const k = mergeKnobs(
      {
        split: { count: 2, power: 0.3 },
        extraShots: { count: 1, power: 0.65 },
        echo: 0.3,
        quick: { beat: 0.9, cooldown: 0.9 },
        stacksBonus: 1,
        catalyst: 0.15,
        manaOnHit: 1,
        guardOnLand: 0.03,
      },
      {
        split: { count: 3, power: 0.4 },
        extraShots: { count: 2, power: 0.8 },
        echo: 0.45,
        quick: { beat: 1.2, windup: 1.2 },
        stacksBonus: 2,
        catalyst: 0.5,
        manaOnHit: 1.5,
        guardOnLand: 0.08,
      },
      { split: { count: 2, power: 0.5 } },
    );
    expect(k.split).toEqual({ count: 3, power: 0.4 });
    expect(k.extraShots!.count).toBe(3);
    expect(k.extraShots!.power).toBeCloseTo(0.52);
    expect(k.echo).toBe(0.45);
    expect(k.quick.beat).toBeCloseTo(1.08);
    expect(k.quick.cooldown).toBeCloseTo(0.9);
    expect(k.quick.windup).toBeCloseTo(1.2);
    expect(k.stacksBonus).toBe(3);
    expect(k.catalyst).toBeCloseTo(0.65);
    expect(k.manaOnHit).toBeCloseTo(2.5);
    expect(k.guardOnLand).toBeCloseTo(0.11);
  });

  it('counts pierce: true is every foe, counts add', () => {
    expect(mergeKnobs({ pierce: true }).pierce).toBe(Infinity);
    expect(mergeKnobs({ pierce: false }).pierce).toBe(0);
    expect(mergeKnobs({ pierce: 2 }, { pierce: 3 }).pierce).toBe(5);
    expect(mergeKnobs({ pierce: true }, { pierce: 2 }).pierce).toBe(Infinity);
  });

  it('merges zones field by field: the longer seconds and the larger tick power', () => {
    const zone = mergeKnobs(
      { zone: { seconds: 1.5, tickPower: 0.2 } },
      { zone: { seconds: 3, tickPower: 0.15 } },
    ).zone;
    expect(zone).toEqual({ seconds: 3, tickPower: 0.2 });
  });

  it('starts every merge from NEUTRAL and never changes it', () => {
    mergeKnobs({ applies: ['burn'], quick: { beat: 0.5 } });
    expect(NEUTRAL.applies).toEqual([]);
    expect(NEUTRAL.quick).toEqual({ beat: 1, cooldown: 1, windup: 1 });
    expect(mergeKnobs()).toEqual(NEUTRAL);
  });
});

describe('moves and blows without runes', () => {
  it('resolve with no runes and neutral rune knobs; Earth still pierces every foe', () => {
    const chain = resolveChain(registry, bare, 'primary', {
      moves: [{ kind: 'medium', form: 'bolt', elements: ['earth'] }],
      payment: 'mana',
    });
    const m = chain.moves[0];
    expect(m.runes).toEqual([]);
    expect(m.knobs.pierce).toBe(Infinity);
    expect(m.knobs.quick).toEqual(NEUTRAL.quick);
    expect(m.knobs.split).toBeNull();
    expect(bare.weapon.blows.length).toBeGreaterThan(0);
    for (const b of bare.weapon.blows) {
      expect(b.knobs).toBe(NEUTRAL);
      expect(b.runes).toEqual([]);
    }
  });

  it("moveBeat is the beat of the kind it played as, times the move's quick.beat", () => {
    for (const kind of MOVE_KINDS) {
      const ab = resolveAbility(
        registry,
        'primary',
        { kind, form: 'bolt', elements: ['fire'] },
        'mana',
        bare,
      );
      expect(moveBeat(bal, ab, 1.3)).toBe(beatFor(bal, 'primary', playedKind(ab), 1.3));
      const quick = { ...ab, knobs: { ...ab.knobs, quick: { beat: 0.8, cooldown: 1, windup: 1 } } };
      expect(moveBeat(bal, quick, 1)).toBeCloseTo(beatFor(bal, 'primary', playedKind(ab), 1) * 0.8);
    }
  });
});

describe("a shot's pierce count", () => {
  // The hero starts at (13, 36) facing up; three sturdy foes on its line.
  const line = () => [dummy(13, 33), dummy(13, 30.5), dummy(13, 28)];
  const explodes = (events: ArpgEvent[]) => events.filter((e) => e.kind === 'explode').length;

  it('a Bolt passes its pierce count of foes, impacting on each, and the next hit ends it', () => {
    const w = arena(line(), { noBasic: true });
    moveOf(w, 0).knobs.pierce = 1;
    const events = [...press(w, 0), ...run(w, 1.5)];
    expect(w.monsters.map(damaged)).toEqual([true, true, false]);
    expect(explodes(events)).toBe(2);
  });

  it('a Bolt that pierces every foe hits all three and never bursts at the end of its flight', () => {
    const w = arena(line(), { noBasic: true });
    moveOf(w, 0).knobs.pierce = Infinity;
    const events = [...press(w, 0), ...run(w, 1.5)];
    expect(w.monsters.every(damaged)).toBe(true);
    expect(explodes(events)).toBe(3);
  });

  it('a spawn without a count takes it from pierce: all when piercing, else none', () => {
    const w = arena([], { noBasic: true });
    const ctx = makeCtx(registry, w, []);
    const shot = (pierce: boolean) =>
      spawnProjectile(ctx, {
        owner: 'hero',
        form: null,
        ability: null,
        homingId: null,
        x: 13,
        y: 35,
        vx: 0,
        vy: -13,
        radius: 0.3,
        damage: 10,
        element: 'fire',
        pierce,
        maxDist: 5,
        explodeRadius: 0,
        applies: [],
        knockback: 0,
      });
    expect(shot(true).pierceLeft).toBe(Infinity);
    expect(shot(false).pierceLeft).toBe(0);
  });
});
```


In `packages/engine/tests/ability-resolve.test.ts`:

Replace:

```ts
  it('multiplies, adds, ORs, unions and keeps the longer zone', () => {
```

with:

```ts
  it('multiplies, adds, ORs, unions and merges zones field by field', () => {
```

Replace:

```ts
    expect(k.pierce).toBe(true);
```

with:

```ts
    expect(k.pierce).toBe(Infinity);
```

Replace:

```ts
    expect(k.zone).toEqual({ seconds: 3, tickPower: 0.1 });
```

with:

```ts
    expect(k.zone).toEqual({ seconds: 3, tickPower: 0.3 });
```

Replace:

```ts
      chain: 0,
      pierce: false,
      knockback: 0,
      lifesteal: 0,
      zone: null,
      pull: false,
      execute: 0,
      scatter: 0,
      spread: false,
    });
```

with:

```ts
      chain: 0,
      pierce: 0,
      knockback: 0,
      lifesteal: 0,
      zone: null,
      pull: false,
      execute: 0,
      scatter: 0,
      spread: false,
      split: null,
      extraShots: null,
      echo: 0,
      quick: { beat: 1, cooldown: 1, windup: 1 },
      stacksBonus: 0,
      catalyst: 0,
      manaOnHit: 0,
      guardOnLand: 0,
    });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-runes-contract.test.ts tests/ability-resolve.test.ts)`
Expected: FAIL, 10 failed and 12 passed (22): `mergeKnobs`' two tests (`expected true to be Infinity`; the neutral knobs lack the new fields), and eight of the contract's nine (`expected undefined to deeply equal { count: 3, power: 0.4 }`, `expected { seconds: 3, tickPower: 0.15 } to deeply equal { seconds: 3, tickPower: 0.2 }`, `expected undefined to deeply equal []`, `moveBeat` not a function, the pierce-1 Bolt hitting `[ true, true, true ]`, `expected undefined to be Infinity`). The Bolt that pierces every foe already passes (today's `pierce: true`).

## Chunk 2: The knobs (Task 2, part 2)

- [ ] **Step 3: Write the types, the knobs and the shots' count**

Create `packages/engine/src/types/rune.ts`:

```ts
import type { FormId, MoveKind, ChainSkill, KnobsData } from './ability.js';

/**
 * Runes (see the runes spec): pouch items socketed on a move or a basic blow,
 * each tier a set of knob values merged into the move with its elements.
 */

export type RuneId = string;
export type RuneTier = 1 | 2 | 3 | 4 | 5;
export const RUNE_TIERS = 5;
/** Most sockets any move can hold (the rarity caps are at most this). */
export const MAX_SOCKETS = 3;

export interface RuneRef {
  id: RuneId;
  tier: RuneTier;
}

export type RuneFamily = 'shape' | 'tempo' | 'elemental' | 'sustain';
export const RUNE_FAMILIES: readonly RuneFamily[] = ['shape', 'tempo', 'elemental', 'sustain'];

export interface RuneFits {
  /** Ability forms it fits. */
  forms: FormId[];
  /** Weapon base ids whose basic blows it fits. */
  weapons: string[];
  /** The blow kinds it acts on (all when absent); on another kind it stays, dormant. */
  kinds?: MoveKind[];
}

export interface RuneDef {
  id: RuneId;
  name: string;
  icon: string;
  family: RuneFamily;
  fits: RuneFits;
  /** Knob values at tiers I..V (index tier − 1), the trade-off included. */
  tiers: KnobsData[];
  /** Templates filled by `runeText`: {path}, {path:%}, {path:±%}, {runes.key}. */
  effect: string;
  tradeoff: string | null;
}

/** Loose runes: rune id → counts by tier (index tier − 1). */
export type RunePouch = Record<RuneId, number[]>;

/** What a pull does: the rune is destroyed, or it costs scrap and goes back to the pouch. */
export type UnsocketMode = 'destroy' | 'pay';

/** For each chain, the saved move index each new move came from (null: a new move). */
export type ChainOrigins = Partial<Record<ChainSkill, (number | null)[]>>;

/** What a rune is socketed on: an ability move's form, or a basic blow on a weapon. */
export type RuneTarget =
  | { form: FormId }
  /** `explode`: the blow's row bursts (`ComboStepDef.explode > 0`), where `pierce` does nothing. */
  | { weapon: string | null; kind: MoveKind; explode?: boolean };
```


In `packages/engine/src/types/ability.ts`:

Replace:

```ts
import type { FormDef, FusionDef, StatusId, Vec } from './arpg.js';

```

with:

```ts
import type { FormDef, FusionDef, StatusId, Vec } from './arpg.js';
import type { RuneRef } from './rune.js';

```

Replace:

```ts
  /** One element, or two distinct elements (a fusion). */
  elements: ManaType[];
}

/** An ability slot's chain
```

with:

```ts
  /** One element, or two distinct elements (a fusion). */
  elements: ManaType[];
  /** Its open sockets, each a rune or null (empty); absent is none (see the runes spec). */
  runes?: (RuneRef | null)[];
}

/** An ability slot's chain
```

Replace:

```ts
export interface Blow {
  kind: MoveKind;
  element: ManaType;
}
```

with:

```ts
export interface Blow {
  kind: MoveKind;
  element: ManaType;
  /** Its open sockets, as a move's. */
  runes?: (RuneRef | null)[];
}
```

Replace:

```ts
/** Behaviour contributed by elements and fusions; merged into every ability. */
export interface Knobs {
```

with:

```ts
/** Quick's and Heavy's timing: multipliers on the beat, the cooldown and the wind-up. */
export interface QuickKnob {
  beat: number;
  cooldown: number;
  windup: number;
}

/** The shards a hit sheds, and each shard's power. */
export interface SplitKnob {
  count: number;
  power: number;
}

/** Extra shots and each shot's power (the cut is halved on Volley and Barrage). */
export interface ShotsKnob {
  count: number;
  power: number;
}

/** Behaviour contributed by elements, fusions, legendaries and runes; merged into every ability. */
export interface Knobs {
```

Replace:

```ts
  chain: number;
  pierce: boolean;
  knockback: number;
```

with:

```ts
  chain: number;
  /** Foes a shot passes (Infinity: all). */
  pierce: number;
  knockback: number;
```

Replace:

```ts
  /** On a kill, the foe's poison and hex spread to its neighbours. */
  spread: boolean;
}
```

with:

```ts
  /** On a kill, the foe's poison and hex spread to its neighbours. */
  spread: boolean;
  split: SplitKnob | null;
  extraShots: ShotsKnob | null;
  /** Fraction of power the move or blow repeats at, `delve.runes.echoDelay` later (0: none). */
  echo: number;
  quick: QuickKnob;
  stacksBonus: number;
  catalyst: number;
  manaOnHit: number;
  /** Fraction of max life shielded on landing, for `delve.runes.guardSeconds`. */
  guardOnLand: number;
}

/** Knobs as data sets them (elements, fusions, runes): partial, `pierce` true for all. */
export type KnobsData = Partial<Omit<Knobs, 'pierce' | 'quick'>> & {
  pierce?: boolean | number;
  quick?: Partial<QuickKnob>;
};
```

Replace:

```ts
  arc: number;
  knobs: Knobs;
}
```

with:

```ts
  arc: number;
  knobs: Knobs;
  /** The runes acting on it (fitting and not dormant), in socket order. */
  runes: RuneRef[];
}
```

In `packages/engine/src/types/index.ts`:

Replace:

```ts
export * from './ability.js';
```

with:

```ts
export * from './ability.js';
export * from './rune.js';
```

In `packages/engine/src/types/arpg.ts`:

Replace:

```ts
  FormId,
  Knobs,
  MoveKind,
```

with:

```ts
  FormId,
  KnobsData,
  MoveKind,
```

Replace:

```ts
export interface ElementTraitDef {
  knobs: Partial<Knobs>;
```

with:

```ts
export interface ElementTraitDef {
  knobs: KnobsData;
```

Replace:

```ts
  text: string;
  knobs: Partial<Knobs>;
}
```

with:

```ts
  text: string;
  knobs: KnobsData;
}
```

Replace:

```ts
  element: ManaType | null;
  pierce: boolean;
  hitIds: number[];
```

with:

```ts
  element: ManaType | null;
  /** Spawned piercing: such a shot never bursts at the end of its flight. */
  pierce: boolean;
  /** Foes it may still pass; a hit with none left ends it (Infinity: all). */
  pierceLeft: number;
  hitIds: number[];
```

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
import type { AbilitySlot, ChainSkill, MoveKind } from './ability.js';
```

with:

```ts
import type { AbilitySlot, ChainSkill, Knobs, MoveKind } from './ability.js';
import type { RuneRef } from './rune.js';
```

Replace:

```ts
  /** Its damage multiplier: 1 + basicPowerPerAttune × its element's attunement (1 without a pair). */
  attunePower: number;
}
```

with:

```ts
  /** Its damage multiplier: 1 + basicPowerPerAttune × its element's attunement (1 without a pair). */
  attunePower: number;
  /** Its runes' knobs merged (`NEUTRAL` without runes; see the runes spec). */
  knobs: Knobs;
  /** The runes acting on it (fitting and not dormant), in socket order. */
  runes: RuneRef[];
}
```

In `packages/engine/src/arpg/abilities/resolve.ts`:

Replace:

```ts
  type Knobs,
  type Move,
```

with:

```ts
  type Knobs,
  type KnobsData,
  type Move,
```

Replace:

```ts
const NEUTRAL: Knobs = {
  power: 1,
  area: 1,
  applies: [],
  chain: 0,
  pierce: false,
  knockback: 0,
  lifesteal: 0,
  zone: null,
  pull: false,
  execute: 0,
  scatter: 0,
  spread: false,
};

/** Combine knob sets: multipliers multiply, counts add, flags OR, statuses union, the longer zone wins. */
export function mergeKnobs(...parts: Partial<Knobs>[]): Knobs {
  const k: Knobs = { ...NEUTRAL, applies: [] };
  for (const p of parts) {
    if (p.power !== undefined) k.power *= p.power;
    if (p.area !== undefined) k.area *= p.area;
    for (const s of p.applies ?? []) if (!k.applies.includes(s)) k.applies.push(s);
    k.chain += p.chain ?? 0;
    k.pierce ||= p.pierce ?? false;
    k.knockback += p.knockback ?? 0;
    k.lifesteal += p.lifesteal ?? 0;
    if (p.zone && (!k.zone || p.zone.seconds > k.zone.seconds)) k.zone = { ...p.zone };
    k.pull ||= p.pull ?? false;
    k.execute = Math.max(k.execute, p.execute ?? 0);
    k.scatter = Math.max(k.scatter, p.scatter ?? 0);
    k.spread ||= p.spread ?? false;
  }
  return k;
}
```

with:

```ts
/** Knobs that change nothing: every merge starts from them (never mutate it). */
export const NEUTRAL: Knobs = {
  power: 1,
  area: 1,
  applies: [],
  chain: 0,
  pierce: 0,
  knockback: 0,
  lifesteal: 0,
  zone: null,
  pull: false,
  execute: 0,
  scatter: 0,
  spread: false,
  split: null,
  extraShots: null,
  echo: 0,
  quick: { beat: 1, cooldown: 1, windup: 1 },
  stacksBonus: 0,
  catalyst: 0,
  manaOnHit: 0,
  guardOnLand: 0,
};

/**
 * Combine knob sets (see the runes spec's knob table): multipliers multiply,
 * counts add (`pierce` true adds Infinity), flags OR, statuses union, a zone
 * takes the longer seconds and the larger tick power, `split` the larger count
 * with its power, `extraShots` adds counts and multiplies powers, `echo` the
 * largest, and each part of `quick` multiplies.
 */
export function mergeKnobs(...parts: KnobsData[]): Knobs {
  const k: Knobs = { ...NEUTRAL, applies: [], quick: { ...NEUTRAL.quick } };
  for (const p of parts) {
    if (p.power !== undefined) k.power *= p.power;
    if (p.area !== undefined) k.area *= p.area;
    for (const s of p.applies ?? []) if (!k.applies.includes(s)) k.applies.push(s);
    k.chain += p.chain ?? 0;
    k.pierce += p.pierce === true ? Infinity : p.pierce || 0;
    k.knockback += p.knockback ?? 0;
    k.lifesteal += p.lifesteal ?? 0;
    if (p.zone)
      k.zone = {
        seconds: Math.max(k.zone?.seconds ?? 0, p.zone.seconds),
        tickPower: Math.max(k.zone?.tickPower ?? 0, p.zone.tickPower),
      };
    k.pull ||= p.pull ?? false;
    k.execute = Math.max(k.execute, p.execute ?? 0);
    k.scatter = Math.max(k.scatter, p.scatter ?? 0);
    k.spread ||= p.spread ?? false;
    if (p.split && (!k.split || p.split.count > k.split.count)) k.split = { ...p.split };
    if (p.extraShots)
      k.extraShots = {
        count: (k.extraShots?.count ?? 0) + p.extraShots.count,
        power: (k.extraShots?.power ?? 1) * p.extraShots.power,
      };
    k.echo = Math.max(k.echo, p.echo ?? 0);
    k.quick.beat *= p.quick?.beat ?? 1;
    k.quick.cooldown *= p.quick?.cooldown ?? 1;
    k.quick.windup *= p.quick?.windup ?? 1;
    k.stacksBonus += p.stacksBonus ?? 0;
    k.catalyst += p.catalyst ?? 0;
    k.manaOnHit += p.manaOnHit ?? 0;
    k.guardOnLand += p.guardOnLand ?? 0;
  }
  return k;
}
```

Replace:

```ts
  const legendary: Partial<Knobs>[] = [];
```

with:

```ts
  const legendary: KnobsData[] = [];
```

Replace:

```ts
    arc: form.arc ?? 360,
    knobs,
  };
}
```

with:

```ts
    arc: form.arc ?? 360,
    knobs,
    runes: [],
  };
}
```

Replace:

```ts
/** Seconds a hold (an ability's or a hold blow's) takes to reach full charge at `tempo`. */
```

with:

```ts
/**
 * The beat after `ab` lands (`beatFor` by the kind it played as) times its
 * `quick.beat`: Quick shortens it, Heavy lengthens it (see the runes spec).
 */
export function moveBeat(bal: DelveBalance, ab: ResolvedAbility, tempo: number): number {
  return beatFor(bal, ab.slot, playedKind(ab), tempo) * ab.knobs.quick.beat;
}

/** Seconds a hold (an ability's or a hold blow's) takes to reach full charge at `tempo`. */
```

In `packages/engine/src/arpg/abilities/cast.ts`:

Replace:

```ts
import { beatFor, chainMove, holdFull, playedKind, stepBonus, stepHeft } from './resolve.js';
```

with:

```ts
import { chainMove, holdFull, moveBeat, stepBonus, stepHeft } from './resolve.js';
```

Replace:

```ts
  const beat = beatFor(bal, ab.slot, playedKind(ab), h.stats.tempo);
```

with:

```ts
  const beat = moveBeat(bal, ab, h.stats.tempo);
```

In `packages/engine/src/delve/hero-stats.ts`:

Replace:

```ts
import {
  beatFor,
  chainMove,
  defaultBasic,
  defaultChains,
  holdFull,
  playedKind,
  resolveChain,
  stepBonus,
} from '../arpg/abilities/resolve.js';
```

with:

```ts
import {
  NEUTRAL,
  chainMove,
  defaultBasic,
  defaultChains,
  holdFull,
  moveBeat,
  resolveChain,
  stepBonus,
} from '../arpg/abilities/resolve.js';
```

Replace:

```ts
    attunePower: primary ? 1 + perAttune * attunement[b.element] : 1,
  }));
```

with:

```ts
    attunePower: primary ? 1 + perAttune * attunement[b.element] : 1,
    knobs: NEUTRAL,
    runes: [],
  }));
```

Replace:

```ts
      const cadence = windup + beatFor(bal, ab.slot, playedKind(ab), tempo);
```

with:

```ts
      const cadence = windup + moveBeat(bal, ab, tempo);
```

In `packages/engine/src/arpg/abilities/targeting.ts`:

Replace:

```ts
export function spawnProjectile(
  ctx: SimCtx,
  p: Omit<Projectile, 'id' | 'hitIds' | 'traveled' | 'dead'>,
): Projectile {
  const proj: Projectile = { ...p, id: ctx.world.nextId++, hitIds: [], traveled: 0, dead: false };
```

with:

```ts
export function spawnProjectile(
  ctx: SimCtx,
  p: Omit<Projectile, 'id' | 'hitIds' | 'traveled' | 'dead' | 'pierceLeft'> & {
    /** Foes it may pass (default: all when `pierce`, else none). */
    pierceLeft?: number;
  },
): Projectile {
  const proj: Projectile = {
    ...p,
    pierceLeft: p.pierceLeft ?? (p.pierce ? Infinity : 0),
    id: ctx.world.nextId++,
    hitIds: [],
    traveled: 0,
    dead: false,
  };
```

In `packages/engine/src/arpg/abilities/forms.ts`:

Replace:

```ts
        element: ab.element,
        pierce: ab.knobs.pierce,
        maxDist: ab.range,
```

with:

```ts
        element: ab.element,
        pierce: ab.knobs.pierce > 0,
        pierceLeft: ab.knobs.pierce,
        maxDist: ab.range,
```

Replace:

```ts
          element: ab.element,
          pierce: ab.knobs.pierce,
          maxDist: ab.range + 3,
```

with:

```ts
          element: ab.element,
          pierce: ab.knobs.pierce > 0,
          pierceLeft: ab.knobs.pierce,
          maxDist: ab.range + 3,
```

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
        pierce: w.pierce,
        maxDist: w.range + 1.5,
```

with:

```ts
        pierce: w.pierce,
        pierceLeft: w.pierce ? Infinity : 0,
        maxDist: w.range + 1.5,
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
      if (!p.pierce) p.dead = true;
    }
```

with:

```ts
      // A piercing shot passes `pierceLeft` foes; the hit after them ends it.
      const left = p.pierceLeft ?? (p.pierce ? Infinity : 0);
      if (left <= 0) p.dead = true;
      else p.pierceLeft = left - 1;
    }
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
/** Partial ability knobs; `.strict()` rejects misspelled knob names. */
const KnobsSchema = z
  .object({
    power: z.number().positive(),
    area: z.number().positive(),
    applies: z.array(StatusIdSchema),
    chain: z.number().int().min(0),
    pierce: z.boolean(),
    knockback: z.number().min(0),
    lifesteal: z.number().min(0),
    zone: z.object({ seconds: z.number().positive(), tickPower: z.number().positive() }),
    pull: z.boolean(),
    execute: z.number().min(0).max(1),
    scatter: z.number().min(0).max(1),
    spread: z.boolean(),
  })
  .partial()
  .strict();
```

with:

```ts
/** A count and a power (`split`, `extraShots`). */
const CountPowerSchema = z
  .object({ count: z.number().int().positive(), power: z.number().positive() })
  .strict();

/** Partial ability knobs (`KnobsData`); `.strict()` rejects misspelled knob names. */
const KnobsSchema = z
  .object({
    power: z.number().positive(),
    area: z.number().positive(),
    applies: z.array(StatusIdSchema),
    chain: z.number().int().min(0),
    // True: every foe; a count: that many.
    pierce: z.union([z.boolean(), z.number().int().min(1)]),
    knockback: z.number().min(0),
    lifesteal: z.number().min(0),
    zone: z.object({ seconds: z.number().positive(), tickPower: z.number().positive() }),
    pull: z.boolean(),
    execute: z.number().min(0).max(1),
    scatter: z.number().min(0).max(1),
    spread: z.boolean(),
    split: CountPowerSchema,
    extraShots: CountPowerSchema,
    echo: z.number().min(0),
    quick: z
      .object({
        beat: z.number().positive(),
        cooldown: z.number().positive(),
        windup: z.number().positive(),
      })
      .partial()
      .strict(),
    stacksBonus: z.number().int().min(0),
    catalyst: z.number().min(0),
    manaOnHit: z.number().min(0),
    guardOnLand: z.number().min(0),
  })
  .partial()
  .strict();
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-runes-contract.test.ts tests/ability-resolve.test.ts)`
Expected: PASS, 22 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1436 tests pass in 79 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-contract
(cd packages/engine && npx prettier --write src/types/rune.ts src/types/arpg.ts src/types/delve.ts src/arpg/abilities/cast.ts src/arpg/abilities/forms.ts src/arpg/basic.ts src/arpg/step.ts src/data/schemas.ts src/delve/hero-stats.ts tests/delve-runes-contract.test.ts tests/ability-resolve.test.ts)
git add packages/engine/src/types/rune.ts packages/engine/src/types/index.ts packages/engine/src/types/ability.ts packages/engine/src/types/arpg.ts packages/engine/src/types/delve.ts packages/engine/src/arpg/abilities/resolve.ts packages/engine/src/arpg/abilities/targeting.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/abilities/forms.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/step.ts packages/engine/src/data/schemas.ts packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-runes-contract.test.ts packages/engine/tests/ability-resolve.test.ts
git commit -m "feat(engine): rune types and the neutral knobs: pierce as a count, NEUTRAL, mergeKnobs' new rules, moveBeat" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The runes’ data

### Task 3: The 14 runes, their schema and the balance

`runes.json` holds the spec's tier tables exactly (fractions in even steps, counts rounded down); `RunesSchema` checks five tiers, the family, every knob through `KnobsSchema` (`.strict()`, so a misspelled knob fails at load) and unique ids; the loader puts the runes on `ArpgData.runes`; the registry reads them; `balance.json → delve.runes` holds the spec's numbers, with its refines.

The templates, by rune: Split "Splits into {split.count} shards on hit, each at {split.power:%} power"; Multi-shot "Extra shots: +{extraShots.count}" / "Each shot at {extraShots.power:%} power"; Pierce "Foes it passes: {pierce}" / "Power {power:±%}"; Chain "Jumps to more foes: +{chain}"; Widen "Area {area:±%}" / "Power {power:±%}"; Quick "Beat {quick.beat:±%}, cooldown {quick.cooldown:±%}" / "Power {power:±%}"; Echo "Repeats {runes.echoDelay} s later at {echo:%} power"; Heavy "Power {power:±%}, and it staggers" / "Beat and wind-up {quick.beat:±%}"; Saturate "Stacks per direct hit: +{stacksBonus}"; Linger "Leaves a zone for {zone.seconds} s, ticking at {zone.tickPower:%} of the hit"; Volatile "Reactions it sets off: +{catalyst:%} damage"; Leech "Heals {lifesteal:%} of its damage"; Drain "+{manaOnHit} mana per foe hit, up to {runes.drainFoes} foe-hits a cast"; Guard "On landing, a {runes.guardSeconds} s shield of {guardOnLand:%} max life".

**Files:**
- Create: `packages/engine/src/data/runes.json`
- Modify: `packages/engine/src/data/schemas.ts`, `src/data/balance.json` (hand-edit, never format), `src/data/loader.ts` (CRLF), `src/data/registry.ts` (CRLF), `src/types/arpg.ts`, `src/types/delve.ts`, `tests/delve-runes-contract.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-runes-contract.test.ts`:

Replace:

```ts
import { describe, it, expect } from 'vitest';
import {
  NEUTRAL,
  beatFor,
```

with:

```ts
import { describe, it, expect } from 'vitest';
import { BalanceConfigSchema, RunesSchema } from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';
import runesData from '../src/data/runes.json';
import {
  NEUTRAL,
  beatFor,
```

Append at the end of the file:

```ts
describe('data: runes', () => {
  const runes = registry.getRunes();

  it("loads the spec's 14 runes in its order, each with five tiers", () => {
    expect(runes.map((r) => r.id)).toEqual([
      'split',
      'multishot',
      'pierce',
      'chain',
      'widen',
      'quick',
      'echo',
      'heavy',
      'saturate',
      'linger',
      'volatile',
      'leech',
      'drain',
      'guard',
    ]);
    expect(runes.map((r) => r.family)).toEqual([
      ...Array(5).fill('shape'),
      ...Array(3).fill('tempo'),
      ...Array(3).fill('elemental'),
      ...Array(3).fill('sustain'),
    ]);
    for (const r of runes) expect(r.tiers).toHaveLength(5);
  });

  it('fits only real forms and weapon bases', () => {
    const forms = new Set(registry.getArpgData().forms.map((f) => f.id));
    const weapons = new Set(registry.getGearBasesForSlot('weapon').map((b) => b.id));
    for (const r of runes) {
      for (const f of r.fits.forms) expect(forms.has(f)).toBe(true);
      for (const w of r.fits.weapons) expect(weapons.has(w)).toBe(true);
    }
  });

  it("holds the spec's tier tables", () => {
    const at = (id: string) => registry.getRune(id).tiers;
    expect(at('multishot').map((t) => t.extraShots)).toEqual([
      { count: 1, power: 0.65 },
      { count: 1, power: 0.6875 },
      { count: 2, power: 0.725 },
      { count: 2, power: 0.7625 },
      { count: 3, power: 0.8 },
    ]);
    expect(at('pierce')).toEqual([1, 2, 3, 4, 5].map((pierce) => ({ pierce, power: 0.9 })));
    expect(at('heavy')[2]).toEqual({
      power: 1.3,
      applies: ['stagger'],
      quick: { beat: 1.2, windup: 1.2 },
    });
    expect(at('quick')[4]).toEqual({ quick: { beat: 0.7, cooldown: 0.7 }, power: 0.9 });
    expect(at('saturate').map((t) => t.stacksBonus)).toEqual([1, 1, 1, 2, 2]);
    expect(at('volatile').map((t) => t.catalyst)).toEqual([0.15, 0.2375, 0.325, 0.4125, 0.5]);
    expect(at('guard').map((t) => t.guardOnLand)).toEqual([0.03, 0.0425, 0.055, 0.0675, 0.08]);
    expect(at('linger')[0]).toEqual({ zone: { seconds: 1.5, tickPower: 0.2 } });
    expect(registry.getRune('linger').fits.kinds).toEqual(['heavy', 'hold']);
    expect(registry.getRune('pierce').fits).toEqual({
      forms: ['bolt', 'volley'],
      weapons: ['staff', 'wand'],
    });
  });

  it('finds a rune by id, and refuses an unknown one', () => {
    expect(registry.getRune('split')).toMatchObject({ name: 'Split', icon: '✳️', family: 'shape' });
    expect(registry.findRune('nope')).toBeUndefined();
    expect(() => registry.getRune('nope')).toThrow('Rune not found: nope');
  });

  it('refuses four tiers, an unknown family, a misspelled knob or a repeated id', () => {
    const [split, multishot] = runesData;
    const bad = (rows: unknown[]) => RunesSchema.safeParse(rows).success;
    expect(bad(runesData)).toBe(true);
    expect(bad([{ ...split, tiers: split.tiers.slice(0, 4) }])).toBe(false);
    expect(bad([{ ...split, family: 'arcane' }])).toBe(false);
    expect(bad([{ ...split, tiers: [...split.tiers.slice(1), { splitt: 1 }] }])).toBe(false);
    expect(bad([{ ...split, tiers: [...split.tiers.slice(1), { pierce: 0 }] }])).toBe(false);
    expect(bad([split, { ...multishot, id: 'split' }])).toBe(false);
  });
});

describe('balance: delve.runes', () => {
  it("loads the spec's numbers", () => {
    expect(bal.runes).toEqual({
      socketCap: { common: 1, uncommon: 1, magic: 2, rare: 2, epic: 3, legendary: 3 },
      socketLinks: [1, 2, 3],
      socketScrap: [20, 40, 60],
      socketDrops: {
        common: [0, 0],
        uncommon: [0, 0],
        magic: [0, 1],
        rare: [0, 1],
        epic: [1, 2],
        legendary: [2, 3],
      },
      unsocket: 'destroy',
      pullScrap: [15, 30, 50, 80, 120],
      fuseCount: 3,
      fuseScrap: [20, 40, 80, 160],
      dropChance: { normal: 0.03, elite: 0.15, boss: 1 },
      tierDepths: [1, 7, 13, 21, 31],
      tierUp: 0.2,
      echoDelay: 0.4,
      guardSeconds: 3,
      drainFoes: 5,
      shardSpeed: 12,
      shardRange: 4,
    });
  });

  it('refuses a cap past MAX_SOCKETS and price tables of the wrong length', () => {
    const withRunes = (runes: object) => ({
      ...balanceData,
      delve: { ...balanceData.delve, runes: { ...balanceData.delve.runes, ...runes } },
    });
    const ok = (runes: object) => BalanceConfigSchema.safeParse(withRunes(runes)).success;
    expect(ok({})).toBe(true);
    expect(ok({ socketCap: { ...balanceData.delve.runes.socketCap, legendary: 4 } })).toBe(false);
    expect(ok({ socketLinks: [1, 2] })).toBe(false);
    expect(ok({ socketScrap: [20, 40, 60, 80] })).toBe(false);
    expect(ok({ pullScrap: [15, 30, 50, 80] })).toBe(false);
    expect(ok({ fuseScrap: [20, 40, 80, 160, 320] })).toBe(false);
    expect(ok({ unsocket: 'keep' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-runes-contract.test.ts)`
Expected: FAIL, no tests run: `Error: Cannot find module '../src/data/runes.json' imported from '…/tests/delve-runes-contract.test.ts'`.

- [ ] **Step 3: Write the data, the schemas, the loader and the registry**

Create `packages/engine/src/data/runes.json`:

```json
[
  {
    "id": "split",
    "name": "Split",
    "icon": "✳️",
    "family": "shape",
    "fits": { "forms": ["bolt", "volley", "barrage"], "weapons": ["bow", "wand"] },
    "tiers": [
      { "split": { "count": 2, "power": 0.3 } },
      { "split": { "count": 2, "power": 0.35 } },
      { "split": { "count": 3, "power": 0.4 } },
      { "split": { "count": 3, "power": 0.45 } },
      { "split": { "count": 4, "power": 0.5 } }
    ],
    "effect": "Splits into {split.count} shards on hit, each at {split.power:%} power",
    "tradeoff": null
  },
  {
    "id": "multishot",
    "name": "Multi-shot",
    "icon": "🔱",
    "family": "shape",
    "fits": { "forms": ["bolt", "volley", "lance", "barrage"], "weapons": ["bow", "wand"] },
    "tiers": [
      { "extraShots": { "count": 1, "power": 0.65 } },
      { "extraShots": { "count": 1, "power": 0.6875 } },
      { "extraShots": { "count": 2, "power": 0.725 } },
      { "extraShots": { "count": 2, "power": 0.7625 } },
      { "extraShots": { "count": 3, "power": 0.8 } }
    ],
    "effect": "Extra shots: +{extraShots.count}",
    "tradeoff": "Each shot at {extraShots.power:%} power"
  },
  {
    "id": "pierce",
    "name": "Pierce",
    "icon": "📌",
    "family": "shape",
    "fits": { "forms": ["bolt", "volley"], "weapons": ["staff", "wand"] },
    "tiers": [
      { "pierce": 1, "power": 0.9 },
      { "pierce": 2, "power": 0.9 },
      { "pierce": 3, "power": 0.9 },
      { "pierce": 4, "power": 0.9 },
      { "pierce": 5, "power": 0.9 }
    ],
    "effect": "Foes it passes: {pierce}",
    "tradeoff": "Power {power:±%}"
  },
  {
    "id": "chain",
    "name": "Chain",
    "icon": "⛓️",
    "family": "shape",
    "fits": {
      "forms": [
        "bolt",
        "volley",
        "lance",
        "burst",
        "strike",
        "ward",
        "nova",
        "barrage",
        "maelstrom"
      ],
      "weapons": ["dagger", "sword", "axe", "maul", "staff", "wand", "bow"]
    },
    "tiers": [{ "chain": 1 }, { "chain": 1 }, { "chain": 2 }, { "chain": 2 }, { "chain": 3 }],
    "effect": "Jumps to more foes: +{chain}",
    "tradeoff": null
  },
  {
    "id": "widen",
    "name": "Widen",
    "icon": "⭕",
    "family": "shape",
    "fits": {
      "forms": ["burst", "nova", "maelstrom", "strike", "ward"],
      "weapons": ["dagger", "sword", "axe", "maul"]
    },
    "tiers": [
      { "area": 1.2, "power": 0.9 },
      { "area": 1.3, "power": 0.9 },
      { "area": 1.4, "power": 0.9 },
      { "area": 1.5, "power": 0.9 },
      { "area": 1.6, "power": 0.9 }
    ],
    "effect": "Area {area:±%}",
    "tradeoff": "Power {power:±%}"
  },
  {
    "id": "quick",
    "name": "Quick",
    "icon": "⏩",
    "family": "tempo",
    "fits": {
      "forms": [
        "bolt",
        "volley",
        "lance",
        "burst",
        "strike",
        "ward",
        "armor",
        "surge",
        "blink",
        "nova",
        "barrage",
        "maelstrom"
      ],
      "weapons": ["dagger", "sword", "axe", "maul", "staff", "wand", "bow"]
    },
    "tiers": [
      { "quick": { "beat": 0.9, "cooldown": 0.9 }, "power": 0.9 },
      { "quick": { "beat": 0.85, "cooldown": 0.85 }, "power": 0.9 },
      { "quick": { "beat": 0.8, "cooldown": 0.8 }, "power": 0.9 },
      { "quick": { "beat": 0.75, "cooldown": 0.75 }, "power": 0.9 },
      { "quick": { "beat": 0.7, "cooldown": 0.7 }, "power": 0.9 }
    ],
    "effect": "Beat {quick.beat:±%}, cooldown {quick.cooldown:±%}",
    "tradeoff": "Power {power:±%}"
  },
  {
    "id": "echo",
    "name": "Echo",
    "icon": "🔁",
    "family": "tempo",
    "fits": {
      "forms": ["bolt", "volley", "lance", "burst", "strike", "nova", "barrage", "maelstrom"],
      "weapons": ["dagger", "sword", "axe", "maul", "staff", "wand", "bow"]
    },
    "tiers": [
      { "echo": 0.3 },
      { "echo": 0.375 },
      { "echo": 0.45 },
      { "echo": 0.525 },
      { "echo": 0.6 }
    ],
    "effect": "Repeats {runes.echoDelay} s later at {echo:%} power",
    "tradeoff": null
  },
  {
    "id": "heavy",
    "name": "Heavy",
    "icon": "🔨",
    "family": "tempo",
    "fits": {
      "forms": ["bolt", "volley", "lance", "burst", "strike", "nova", "barrage", "maelstrom"],
      "weapons": ["dagger", "sword", "axe", "maul", "staff", "wand", "bow"]
    },
    "tiers": [
      { "power": 1.15, "applies": ["stagger"], "quick": { "beat": 1.2, "windup": 1.2 } },
      { "power": 1.225, "applies": ["stagger"], "quick": { "beat": 1.2, "windup": 1.2 } },
      { "power": 1.3, "applies": ["stagger"], "quick": { "beat": 1.2, "windup": 1.2 } },
      { "power": 1.375, "applies": ["stagger"], "quick": { "beat": 1.2, "windup": 1.2 } },
      { "power": 1.45, "applies": ["stagger"], "quick": { "beat": 1.2, "windup": 1.2 } }
    ],
    "effect": "Power {power:±%}, and it staggers",
    "tradeoff": "Beat and wind-up {quick.beat:±%}"
  },
  {
    "id": "saturate",
    "name": "Saturate",
    "icon": "💧",
    "family": "elemental",
    "fits": {
      "forms": [
        "bolt",
        "volley",
        "lance",
        "burst",
        "strike",
        "ward",
        "blink",
        "nova",
        "barrage",
        "maelstrom"
      ],
      "weapons": ["dagger", "sword", "axe", "maul", "staff", "wand", "bow"]
    },
    "tiers": [
      { "stacksBonus": 1 },
      { "stacksBonus": 1 },
      { "stacksBonus": 1 },
      { "stacksBonus": 2 },
      { "stacksBonus": 2 }
    ],
    "effect": "Stacks per direct hit: +{stacksBonus}",
    "tradeoff": null
  },
  {
    "id": "linger",
    "name": "Linger",
    "icon": "☁️",
    "family": "elemental",
    "fits": {
      "forms": ["bolt", "lance", "burst", "strike", "nova"],
      "weapons": ["dagger", "sword", "axe", "maul", "staff", "wand", "bow"],
      "kinds": ["heavy", "hold"]
    },
    "tiers": [
      { "zone": { "seconds": 1.5, "tickPower": 0.2 } },
      { "zone": { "seconds": 2, "tickPower": 0.2 } },
      { "zone": { "seconds": 2.5, "tickPower": 0.2 } },
      { "zone": { "seconds": 3, "tickPower": 0.2 } },
      { "zone": { "seconds": 3.5, "tickPower": 0.2 } }
    ],
    "effect": "Leaves a zone for {zone.seconds} s, ticking at {zone.tickPower:%} of the hit",
    "tradeoff": null
  },
  {
    "id": "volatile",
    "name": "Volatile",
    "icon": "💥",
    "family": "elemental",
    "fits": {
      "forms": [
        "bolt",
        "volley",
        "lance",
        "burst",
        "strike",
        "ward",
        "armor",
        "blink",
        "nova",
        "barrage",
        "maelstrom"
      ],
      "weapons": ["dagger", "sword", "axe", "maul", "staff", "wand", "bow"]
    },
    "tiers": [
      { "catalyst": 0.15 },
      { "catalyst": 0.2375 },
      { "catalyst": 0.325 },
      { "catalyst": 0.4125 },
      { "catalyst": 0.5 }
    ],
    "effect": "Reactions it sets off: +{catalyst:%} damage",
    "tradeoff": null
  },
  {
    "id": "leech",
    "name": "Leech",
    "icon": "🩸",
    "family": "sustain",
    "fits": {
      "forms": [
        "bolt",
        "volley",
        "lance",
        "burst",
        "strike",
        "ward",
        "armor",
        "blink",
        "nova",
        "barrage",
        "maelstrom"
      ],
      "weapons": ["dagger", "sword", "axe", "maul", "staff", "wand", "bow"]
    },
    "tiers": [
      { "lifesteal": 0.02 },
      { "lifesteal": 0.03 },
      { "lifesteal": 0.04 },
      { "lifesteal": 0.05 },
      { "lifesteal": 0.06 }
    ],
    "effect": "Heals {lifesteal:%} of its damage",
    "tradeoff": null
  },
  {
    "id": "drain",
    "name": "Drain",
    "icon": "🌀",
    "family": "sustain",
    "fits": {
      "forms": [
        "bolt",
        "volley",
        "lance",
        "burst",
        "strike",
        "ward",
        "armor",
        "blink",
        "nova",
        "barrage",
        "maelstrom"
      ],
      "weapons": ["dagger", "sword", "axe", "maul", "staff", "wand", "bow"]
    },
    "tiers": [
      { "manaOnHit": 1 },
      { "manaOnHit": 1.5 },
      { "manaOnHit": 2 },
      { "manaOnHit": 2.5 },
      { "manaOnHit": 3 }
    ],
    "effect": "+{manaOnHit} mana per foe hit, up to {runes.drainFoes} foe-hits a cast",
    "tradeoff": null
  },
  {
    "id": "guard",
    "name": "Guard",
    "icon": "🛡️",
    "family": "sustain",
    "fits": {
      "forms": [
        "bolt",
        "volley",
        "lance",
        "burst",
        "strike",
        "ward",
        "armor",
        "surge",
        "blink",
        "nova",
        "barrage",
        "maelstrom"
      ],
      "weapons": ["dagger", "sword", "axe", "maul", "staff", "wand", "bow"]
    },
    "tiers": [
      { "guardOnLand": 0.03 },
      { "guardOnLand": 0.0425 },
      { "guardOnLand": 0.055 },
      { "guardOnLand": 0.0675 },
      { "guardOnLand": 0.08 }
    ],
    "effect": "On landing, a {runes.guardSeconds} s shield of {guardOnLand:%} max life",
    "tradeoff": null
  }
]
```


In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
import { RARITY_ORDER } from '../types/gem.js';

```

with:

```ts
import { RARITY_ORDER } from '../types/gem.js';
import { MAX_SOCKETS, RUNE_FAMILIES, RUNE_TIERS } from '../types/rune.js';

```

Replace:

```ts
    guardOnLand: z.number().min(0),
  })
  .partial()
  .strict();

```

with:

```ts
    guardOnLand: z.number().min(0),
  })
  .partial()
  .strict();

/**
 * One rune of `runes.json` (see the runes spec): its five tiers' knobs, the
 * trade-off included. A test holds its fit ids to the data.
 */
const RuneDefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    icon: z.string(),
    family: z.enum(RUNE_FAMILIES as [string, ...string[]]),
    fits: z
      .object({
        forms: z.array(z.string()),
        weapons: z.array(z.string()),
        kinds: z.array(MoveKindSchema).min(1).optional(),
      })
      .strict(),
    tiers: z.array(KnobsSchema).length(RUNE_TIERS),
    effect: z.string(),
    tradeoff: z.string().nullable(),
  })
  .strict();

/** `runes.json`: every rune once. */
export const RunesSchema = z
  .array(RuneDefSchema)
  .refine((rs) => new Set(rs.map((r) => r.id)).size === rs.length, 'rune ids must differ');

```

Replace:

```ts
    editDust: z.number().int().min(0),
    elementDust: z.number().int().min(0),
    transferScrap: z.number().int().min(0),
  }),

```

with:

```ts
    editDust: z.number().int().min(0),
    elementDust: z.number().int().min(0),
    transferScrap: z.number().int().min(0),
  }),
  runes: z.object({
    socketCap: perRarity(z.number().int().min(0).max(MAX_SOCKETS)),
    // By the sockets the move already has: the first socket's price first.
    socketLinks: z.array(z.number().int().min(0)).length(MAX_SOCKETS),
    socketScrap: z.array(z.number().int().min(0)).length(MAX_SOCKETS),
    socketDrops: perRarity(
      z
        .tuple([z.number().int().min(0), z.number().int().min(0)])
        .refine(([lo, hi]) => lo <= hi, 'least before most'),
    ),
    unsocket: z.enum(['destroy', 'pay']),
    pullScrap: z.array(z.number().int().min(0)).length(RUNE_TIERS),
    fuseCount: z.number().int().min(2),
    // By the tier a fuse makes: II, III, IV, V.
    fuseScrap: z.array(z.number().int().min(0)).length(RUNE_TIERS - 1),
    dropChance: z.object({
      normal: z.number().min(0).max(1),
      elite: z.number().min(0).max(1),
      boss: z.number().min(0).max(1),
    }),
    tierDepths: z.array(z.number().int().min(1)).length(RUNE_TIERS),
    tierUp: z.number().min(0).max(1),
    echoDelay: z.number().positive(),
    guardSeconds: z.number().positive(),
    drainFoes: z.number().int().positive(),
    shardSpeed: z.number().positive(),
    shardRange: z.number().positive(),
  }),

```

In `packages/engine/src/data/balance.json`:

Replace:

```json
      "editDust": 5, "elementDust": 15, "transferScrap": 30
    },

```

with:

```json
      "editDust": 5, "elementDust": 15, "transferScrap": 30
    },
    "runes": {
      "socketCap": { "common": 1, "uncommon": 1, "magic": 2, "rare": 2, "epic": 3, "legendary": 3 },
      "socketLinks": [1, 2, 3], "socketScrap": [20, 40, 60],
      "socketDrops": { "common": [0, 0], "uncommon": [0, 0], "magic": [0, 1], "rare": [0, 1], "epic": [1, 2], "legendary": [2, 3] },
      "unsocket": "destroy", "pullScrap": [15, 30, 50, 80, 120],
      "fuseCount": 3, "fuseScrap": [20, 40, 80, 160],
      "dropChance": { "normal": 0.03, "elite": 0.15, "boss": 1 },
      "tierDepths": [1, 7, 13, 21, 31], "tierUp": 0.2,
      "echoDelay": 0.4, "guardSeconds": 3, "drainFoes": 5, "shardSpeed": 12, "shardRange": 4
    },

```

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
import type { RuneRef } from './rune.js';
```

with:

```ts
import type { RuneRef, UnsocketMode } from './rune.js';
import type { MonsterKind } from './arpg.js';
```

Replace:

```ts
    /** Scrap a transfer costs for each extra slot that moves. */
    transferScrap: number;
  };

```

with:

```ts
    /** Scrap a transfer costs for each extra slot that moves. */
    transferScrap: number;
  };
  /** Runes: sockets and their prices, the pull rule, fusing, drops and the knobs' numbers (see the runes spec). */
  runes: {
    /** Most sockets a move may open, by its weapon's rarity (at most `MAX_SOCKETS`). */
    socketCap: Record<Rarity, number>;
    /** Links the next socket costs, by the sockets the move already has. */
    socketLinks: number[];
    /** Scrap the next socket costs, by the sockets the move already has. */
    socketScrap: number[];
    /** Open sockets a weapon drop rolls, least and most, by rarity. */
    socketDrops: Record<Rarity, [number, number]>;
    /** What a pull does as shipped (a dev toggle overrides it). */
    unsocket: UnsocketMode;
    /** Scrap a pull costs in 'pay' mode, by the rune's tier. */
    pullScrap: number[];
    /** Runes of one id and tier that fuse into one of the next tier. */
    fuseCount: number;
    /** Scrap a fuse costs, by the tier it makes: II, III, IV, V. */
    fuseScrap: number[];
    /** A foe's chance to drop a rune, by its kind (normal and elite × the door's `dropMult`, at most 1). */
    dropChance: Record<MonsterKind, number>;
    /** The depth each tier starts at, I to V. */
    tierDepths: number[];
    /** Chance a drop comes one tier higher (at most V). */
    tierUp: number;
    /** Seconds before an echo repeats its move or blow. */
    echoDelay: number;
    /** Seconds Guard's shield lasts. */
    guardSeconds: number;
    /** Foe-hits a cast's Drain counts. */
    drainFoes: number;
    /** A shard's speed, and how far it flies. */
    shardSpeed: number;
    shardRange: number;
  };

```

In `packages/engine/src/types/arpg.ts`:

Replace:

```ts
import type { ManaType } from './mana.js';

```

with:

```ts
import type { ManaType } from './mana.js';
import type { RuneDef } from './rune.js';

```

Replace:

```ts
  reactions: ReactionDef[];
  masteries: MasteryDef[];
}
```

with:

```ts
  reactions: ReactionDef[];
  masteries: MasteryDef[];
  /** `runes.json`'s runes (see the runes spec). */
  runes: RuneDef[];
}
```

In `packages/engine/src/data/loader.ts`:

Replace:

```ts
import type { ArpgData } from '../types/arpg.js';
```

with:

```ts
import type { ArpgData } from '../types/arpg.js';
import type { RuneDef } from '../types/rune.js';
```

Replace:

```ts
  RecipesSchema,
  SynergiesSchema,
} from './schemas.js';
```

with:

```ts
  RecipesSchema,
  RunesSchema,
  SynergiesSchema,
} from './schemas.js';
```

Replace:

```ts
import rawArpg from './arpg.json';
```

with:

```ts
import rawArpg from './arpg.json';
import rawRunes from './runes.json';
```

Replace:

```ts
  const arpg = ArpgDataSchema.parse(rawArpg) as unknown as ArpgData;
```

with:

```ts
  const arpg: ArpgData = {
    ...(ArpgDataSchema.parse(rawArpg) as unknown as Omit<ArpgData, 'runes'>),
    runes: RunesSchema.parse(rawRunes) as unknown as RuneDef[],
  };
```

In `packages/engine/src/data/registry.ts`:

Replace:

```ts
import type { FormId } from '../types/ability.js';
```

with:

```ts
import type { FormId } from '../types/ability.js';
import type { RuneDef, RuneId } from '../types/rune.js';
```

Replace:

```ts
  getDelveData(): DelveData {
```

with:

```ts
  /** Every rune (`runes.json`), in the data's order. */
  getRunes(): RuneDef[] {
    return this.getArpgData().runes;
  }

  /** A rune by id; throws for an unknown one. */
  getRune(id: RuneId): RuneDef {
    const rune = this.findRune(id);
    if (!rune) throw new Error(`Rune not found: ${id}`);
    return rune;
  }

  /** A rune by id, or undefined (a save's id the data no longer has). */
  findRune(id: RuneId): RuneDef | undefined {
    return this.getArpgData().runes.find((r) => r.id === id);
  }

  getDelveData(): DelveData {
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-runes-contract.test.ts)`
Expected: PASS, 16 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1443 tests pass in 79 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-contract
(cd packages/engine && npx prettier --write src/data/runes.json src/data/schemas.ts src/types/arpg.ts src/types/delve.ts tests/delve-runes-contract.test.ts)
git add packages/engine/src/data/runes.json packages/engine/src/data/schemas.ts packages/engine/src/data/balance.json packages/engine/src/data/loader.ts packages/engine/src/data/registry.ts packages/engine/src/types/arpg.ts packages/engine/src/types/delve.ts packages/engine/tests/delve-runes-contract.test.ts
git commit -m "feat(engine): the 14 runes in runes.json, their schema, the registry's getters and delve.runes" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The pure helpers

### Task 4: The pure helpers

`src/loot/runes.ts`, which every later wave reads: what a rune fits and acts on, a move's active knobs, the rune's words (`runeText`), a move's socket cap and next price, and the pouch; with the stubs of wave 1B's rolls and parts. It imports nothing from `delve/`.

**Files:**
- Create: `packages/engine/src/loot/runes.ts`
- Modify: `packages/engine/tests/delve-runes-contract.test.ts`

- [ ] **Step 1: Write the failing tests**

The last test fills every rune's templates at every tier: it is the spec's "every template path against its tiers" (`runeText` throws on a path that isn't a number).

In `packages/engine/tests/delve-runes-contract.test.ts`:

Replace:

```ts
import { makeCtx } from '../src/arpg/combat.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { MOVE_KINDS } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { arena, bal, damaged, dummy, moveOf, press, registry, run } from './fixtures/arena.js';
```

with:

```ts
import { makeCtx } from '../src/arpg/combat.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import {
  addToPouch,
  extraShotPower,
  pouchCount,
  runeActive,
  runeFits,
  runeKnobs,
  runeText,
  socketCap,
  socketPrice,
  socketsOf,
  takeFromPouch,
} from '../src/loot/runes.js';
import type { RunePouch, RuneRef, RuneTier } from '../src/types/rune.js';
import { MOVE_KINDS } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { arena, bal, damaged, dummy, moveOf, press, registry, run } from './fixtures/arena.js';
```

Append at the end of the file:

```ts
describe('rune helpers: fit, act, knobs', () => {
  const rune = (id: string) => registry.getRune(id);

  it('fits the forms and the weapons it lists; unarmed fits none', () => {
    expect(runeFits(rune('split'), { form: 'bolt' })).toBe(true);
    expect(runeFits(rune('split'), { form: 'burst' })).toBe(false);
    expect(runeFits(rune('split'), { weapon: 'bow', kind: 'light' })).toBe(true);
    expect(runeFits(rune('split'), { weapon: 'sword', kind: 'light' })).toBe(false);
    expect(runeFits(rune('chain'), { weapon: null, kind: 'light' })).toBe(false);
  });

  it("acts only on its kinds' blows, and Pierce not on a row that bursts", () => {
    expect(runeActive(rune('linger'), { weapon: 'sword', kind: 'heavy' })).toBe(true);
    expect(runeActive(rune('linger'), { weapon: 'sword', kind: 'light' })).toBe(false);
    expect(runeFits(rune('linger'), { weapon: 'sword', kind: 'light' })).toBe(true);
    expect(runeActive(rune('linger'), { form: 'bolt' })).toBe(true);
    expect(runeActive(rune('pierce'), { weapon: 'staff', kind: 'light' })).toBe(true);
    expect(runeActive(rune('pierce'), { weapon: 'staff', kind: 'medium', explode: true })).toBe(
      false,
    );
    expect(runeActive(rune('chain'), { weapon: 'staff', kind: 'medium', explode: true })).toBe(
      true,
    );
    expect(runeActive(rune('split'), { form: 'burst' })).toBe(false);
  });

  it('gives the knobs of the runes acting, in socket order, skipping empty, unknown and dormant ones', () => {
    const runes: (RuneRef | null)[] = [
      { id: 'chain', tier: 3 },
      null,
      { id: 'ghost', tier: 1 },
      { id: 'linger', tier: 2 },
      { id: 'quick', tier: 1 },
    ];
    const light = runeKnobs(registry, runes, { weapon: 'sword', kind: 'light' });
    expect(light.active).toEqual([
      { id: 'chain', tier: 3 },
      { id: 'quick', tier: 1 },
    ]);
    expect(light.knobs).toEqual([rune('chain').tiers[2], rune('quick').tiers[0]]);
    const heavy = runeKnobs(registry, runes, { weapon: 'sword', kind: 'heavy' });
    expect(heavy.active.map((r) => r.id)).toEqual(['chain', 'linger', 'quick']);
    expect(runeKnobs(registry, undefined, { form: 'bolt' })).toEqual({ knobs: [], active: [] });
  });

  it("cuts Multi-shot's shots in full, by half on a Volley, not at all on a Barrage", () => {
    expect(extraShotPower(0.65, 'bolt')).toBe(0.65);
    expect(extraShotPower(0.65, null)).toBe(0.65);
    expect(extraShotPower(0.65, 'volley')).toBeCloseTo(0.825);
    expect(extraShotPower(0.65, 'barrage')).toBe(1);
  });
});

describe('rune helpers: text', () => {
  const text = (id: string, tier: RuneTier, on?: Parameters<typeof runeText>[2]) =>
    runeText(registry, { id, tier }, on);

  it('fills the templates: plain values, percentages and signed changes', () => {
    expect(text('split', 1)).toEqual({
      effect: 'Splits into 2 shards on hit, each at 30% power',
      tradeoff: null,
    });
    expect(text('split', 4).effect).toBe('Splits into 3 shards on hit, each at 45% power');
    expect(text('quick', 3)).toEqual({
      effect: 'Beat −20%, cooldown −20%',
      tradeoff: 'Power −10%',
    });
    expect(text('heavy', 2)).toEqual({
      effect: 'Power +22.5%, and it staggers',
      tradeoff: 'Beat and wind-up +20%',
    });
    expect(text('guard', 2).effect).toBe('On landing, a 3 s shield of 4.25% max life');
    expect(text('drain', 2).effect).toBe('+1.5 mana per foe hit, up to 5 foe-hits a cast');
    expect(text('echo', 1).effect).toBe('Repeats 0.4 s later at 30% power');
  });

  it('words Multi-shot by the move: the cut in full, halved on a Volley, none on a Barrage', () => {
    expect(text('multishot', 2)).toEqual({
      effect: 'Extra shots: +1',
      tradeoff: 'Each shot at 68.75% power',
    });
    expect(text('multishot', 2, { form: 'volley' }).tradeoff).toBe('Each shot at 84.375% power');
    expect(text('multishot', 2, { form: 'barrage' }).tradeoff).toBeNull();
    expect(text('multishot', 2, { weapon: 'bow', kind: 'light' }).tradeoff).toBe(
      'Each shot at 68.75% power',
    );
  });

  it("fills every rune's templates at every tier", () => {
    for (const def of registry.getRunes())
      for (const tier of [1, 2, 3, 4, 5] as RuneTier[]) {
        const t = runeText(registry, { id: def.id, tier });
        expect(t.effect).not.toMatch(/[{}]/);
        expect(t.tradeoff === null).toBe(def.tradeoff === null);
        if (t.tradeoff) expect(t.tradeoff).not.toMatch(/[{}]/);
      }
  });
});

describe('rune helpers: sockets and the pouch', () => {
  it("caps a move's sockets by its weapon's rarity; unarmed has none", () => {
    expect(socketCap(registry, 'common')).toBe(1);
    expect(socketCap(registry, 'rare')).toBe(2);
    expect(socketCap(registry, 'legendary')).toBe(3);
    expect(socketCap(registry, null)).toBe(0);
  });

  it('prices the next socket by the sockets the move has, none past MAX_SOCKETS', () => {
    expect(socketPrice(registry, 0)).toEqual({ links: 1, scrap: 20 });
    expect(socketPrice(registry, 2)).toEqual({ links: 3, scrap: 60 });
    expect(socketPrice(registry, 3)).toBeNull();
  });

  it('counts, adds and takes runes by id and tier without changing the pouch it is given', () => {
    const pouch: RunePouch = { split: [1, 0, 0, 0, 0] };
    const more = addToPouch(pouch, [
      { id: 'split', tier: 1 },
      { id: 'quick', tier: 3 },
      { id: 'quick', tier: 3 },
    ]);
    expect(pouch).toEqual({ split: [1, 0, 0, 0, 0] });
    expect(more).toEqual({ split: [2, 0, 0, 0, 0], quick: [0, 0, 2, 0, 0] });
    expect(pouchCount(more, { id: 'quick', tier: 3 })).toBe(2);
    expect(pouchCount(more, { id: 'echo', tier: 1 })).toBe(0);
    expect(takeFromPouch(more, [{ id: 'quick', tier: 3 }])).toEqual({
      split: [2, 0, 0, 0, 0],
      quick: [0, 0, 1, 0, 0],
    });
    expect(takeFromPouch(more, [{ id: 'split', tier: 2 }])).toBeNull();
    expect(
      takeFromPouch(pouch, [
        { id: 'split', tier: 1 },
        { id: 'split', tier: 1 },
      ]),
    ).toBeNull();
  });

  it('reads a move without runes as no sockets', () => {
    expect(socketsOf({ kind: 'light', element: 'fire' })).toEqual([]);
    const runes = [{ id: 'chain', tier: 1 as const }, null];
    expect(socketsOf({ kind: 'light', form: 'bolt', elements: ['fire'], runes })).toBe(runes);
  });
});

// Stubs in wave 0 ("not built yet"); wave 1B builds them and may delete these lines.
describe('wave 1B: loot/runes.ts', () => {
  it.todo('runeTierAt: the highest tierDepths reached, then tierUp for one tier higher, at most V');
  it.todo(
    'rollRuneDrop: dropChance by kind (normal and elite × dropMult, at most 1), uniform over runes.json',
  );
  it.todo(
    'rollSockets: socketDrops by rarity, spread uniformly over the moves, never past socketCap',
  );
  it.todo('weaponParts: a Link per extra slot and per open socket, and the socketed runes');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-runes-contract.test.ts)`
Expected: FAIL, no tests run: `Error: Cannot find module '../src/loot/runes.js' imported from '…/tests/delve-runes-contract.test.ts'`.

- [ ] **Step 3: Write the helpers**

Create `packages/engine/src/loot/runes.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { Blow, FormId, KnobsData, Move } from '../types/ability.js';
import type { MonsterKind } from '../types/arpg.js';
import type { GearItem, Moveset, Rarity } from '../types/gear.js';
import {
  MAX_SOCKETS,
  RUNE_TIERS,
  type RuneDef,
  type RunePouch,
  type RuneRef,
  type RuneTarget,
  type RuneTier,
} from '../types/rune.js';

/**
 * Runes' pure parts (see the runes spec): what a rune fits and acts on, its
 * knobs and its words, a move's sockets and their price, and the pouch. It
 * imports nothing from `delve/`. Wave 1 fills the rolls and the parts
 * (`runeTierAt`, `rollRuneDrop`, `rollSockets`, `weaponParts`).
 */

const NOT_BUILT = 'not built yet';

/** Whether `def` fits `on`: a form it lists, or a blow of a weapon it lists (unarmed fits none). */
export function runeFits(def: RuneDef, on: RuneTarget): boolean {
  if ('form' in on) return def.fits.forms.includes(on.form);
  return on.weapon !== null && def.fits.weapons.includes(on.weapon);
}

/**
 * Whether `def` acts on `on`: it fits, a blow's kind is one its `fits.kinds`
 * lists, and a rune that sets `pierce` isn't on a row that bursts. One that
 * fits but doesn't act stays socketed, dormant.
 */
export function runeActive(def: RuneDef, on: RuneTarget): boolean {
  if (!runeFits(def, on)) return false;
  if ('form' in on) return true;
  if (def.fits.kinds && !def.fits.kinds.includes(on.kind)) return false;
  return !(on.explode && def.tiers.some((t) => t.pierce !== undefined));
}

/**
 * The knob sets of a move's or a blow's sockets acting on `on`, in socket
 * order, and the runes they come from. Empty sockets, unknown ids and
 * dormant runes are skipped.
 */
export function runeKnobs(
  registry: DataRegistry,
  runes: readonly (RuneRef | null)[] | undefined,
  on: RuneTarget,
): { knobs: KnobsData[]; active: RuneRef[] } {
  const knobs: KnobsData[] = [];
  const active: RuneRef[] = [];
  for (const ref of runes ?? []) {
    const def = ref ? registry.findRune(ref.id) : undefined;
    if (!ref || !def || !runeActive(def, on)) continue;
    knobs.push(def.tiers[ref.tier - 1]);
    active.push(ref);
  }
  return { knobs, active };
}

/**
 * Each shot's power under an `extraShots` of `power` on `form`: the cut in
 * full, half of it on a Volley, none on a Barrage. The resolver and
 * `runeText` both read it.
 */
export function extraShotPower(power: number, form: FormId | null): number {
  if (form === 'volley') return 1 - (1 - power) / 2;
  return form === 'barrage' ? 1 : power;
}

/** A number as rune texts print it: float noise rounded off, at most three decimals. */
function num(x: number): string {
  return String(Math.round(x * 1000) / 1000);
}

const TEMPLATE = /\{([\w.]+)(?::(%|±%))?\}/g;

/**
 * Fill a rune template from a tier's knobs (`{runes.key}` from the balance),
 * and whether it reads as any change: a percentage at 100% (or ±0%) doesn't.
 */
function fill(
  registry: DataRegistry,
  template: string,
  knobs: KnobsData,
): { text: string; change: boolean } {
  let change = false;
  const text = template.replace(TEMPLATE, (_, path: string, fmt: string | undefined) => {
    const keys = path.split('.');
    const root: unknown = keys[0] === 'runes' ? registry.getDelveBalance().runes : knobs;
    const value = (keys[0] === 'runes' ? keys.slice(1) : keys).reduce<unknown>(
      (v, key) => (v as Record<string, unknown> | undefined)?.[key],
      root,
    );
    if (typeof value !== 'number') throw new Error(`No number at {${path}}`);
    if (!fmt || value !== 1) change = true;
    if (fmt === '%') return `${num(value * 100)}%`;
    if (fmt === '±%') return `${value < 1 ? '−' : '+'}${num(Math.abs(value - 1) * 100)}%`;
    return num(value);
  });
  return { text, change };
}

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
  const def = registry.getRune(ref.id);
  let knobs = def.tiers[ref.tier - 1];
  if (knobs.extraShots && on && 'form' in on)
    knobs = {
      ...knobs,
      extraShots: {
        ...knobs.extraShots,
        power: extraShotPower(knobs.extraShots.power, on.form),
      },
    };
  const tradeoff = def.tradeoff === null ? null : fill(registry, def.tradeoff, knobs);
  return {
    effect: fill(registry, def.effect, knobs).text,
    tradeoff: tradeoff?.change ? tradeoff.text : null,
  };
}

/** Most sockets a move may open on a weapon of `rarity` (unarmed, null: 0). */
export function socketCap(registry: DataRegistry, rarity: Rarity | null): number {
  return rarity ? registry.getDelveBalance().runes.socketCap[rarity] : 0;
}

/** The price of a move's next socket when it has `open`; null at `MAX_SOCKETS`. */
export function socketPrice(
  registry: DataRegistry,
  open: number,
): { links: number; scrap: number } | null {
  if (open >= MAX_SOCKETS) return null;
  const r = registry.getDelveBalance().runes;
  return { links: r.socketLinks[open], scrap: r.socketScrap[open] };
}

/** How many of `ref` (its id at its tier) the pouch holds. */
export function pouchCount(pouch: RunePouch, ref: RuneRef): number {
  return pouch[ref.id]?.[ref.tier - 1] ?? 0;
}

/** The pouch with one more of each of `refs`. */
export function addToPouch(pouch: RunePouch, refs: readonly RuneRef[]): RunePouch {
  const next = { ...pouch };
  for (const { id, tier } of refs) {
    const counts = [...(next[id] ?? Array<number>(RUNE_TIERS).fill(0))];
    counts[tier - 1]++;
    next[id] = counts;
  }
  return next;
}

/** The pouch with one fewer of each of `refs`, or null when it is short of any. */
export function takeFromPouch(pouch: RunePouch, refs: readonly RuneRef[]): RunePouch | null {
  const next = { ...pouch };
  for (const { id, tier } of refs) {
    const counts = [...(next[id] ?? Array<number>(RUNE_TIERS).fill(0))];
    if (counts[tier - 1] <= 0) return null;
    counts[tier - 1]--;
    next[id] = counts;
  }
  return next;
}

/** A move's or a blow's sockets (none when it has no `runes`). */
export function socketsOf(m: Move | Blow): (RuneRef | null)[] {
  return m.runes ?? [];
}

/** A rune drop's tier at `depth`: the highest `tierDepths` reached, then `tierUp` for one higher. */
export function runeTierAt(_registry: DataRegistry, _depth: number, _rng: SeededRNG): RuneTier {
  throw new Error(NOT_BUILT);
}

/** The rune a foe of `kind` drops at `depth`, if any (uniform over `runes.json`). */
export function rollRuneDrop(
  _registry: DataRegistry,
  _ctx: { depth: number; kind: MonsterKind; dropMult: number },
  _rng: SeededRNG,
): RuneRef | null {
  throw new Error(NOT_BUILT);
}

/** A weapon drop's moveset with its rarity's `socketDrops` opened, empty, over its moves. */
export function rollSockets(
  _registry: DataRegistry,
  _item: Pick<GearItem, 'rarity'>,
  _moveset: Moveset,
  _rng: SeededRNG,
): Moveset {
  throw new Error(NOT_BUILT);
}

/** What a weapon gives back when it goes: Links for its extra slots and open sockets, and its runes. */
export function weaponParts(
  _registry: DataRegistry,
  _weapon: GearItem,
): { links: number; runes: RuneRef[] } {
  throw new Error(NOT_BUILT);
}
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-runes-contract.test.ts)`
Expected: PASS, 27 tests and 4 todo.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1454 tests pass and 4 todo (1458) in 79 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-contract
(cd packages/engine && npx prettier --write src/loot/runes.ts tests/delve-runes-contract.test.ts)
git add packages/engine/src/loot/runes.ts packages/engine/tests/delve-runes-contract.test.ts
git commit -m "feat(engine): rune helpers: fit, activity, knobs, runeText, socket caps and prices, the pouch" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 5: The sim’s contract, the stubs and the exports

### Task 5: The sim's contract, the stubs and the pre-exports

The world and the hero gain their new state (`runeRng` forked beside `lootRng`, `echoes`, `pending.runes`, `drained`), the arena's types their new kinds (a `'rune'` drop, a `'shard'` shot, the `runeFx` event, `Echo`), hits their new options; every wave-1 function that isn't in `loot/runes.ts` gets its stub; and `src/index.ts` exports it all. `runeRng` is a fork: forking never advances its parent, so every other stream rolls as before.

**Files:**
- Create: `packages/engine/src/arpg/abilities/echo.ts`, `src/arpg/rune-drops.ts`, `src/delve/runes.ts`
- Modify: `packages/engine/src/types/arpg.ts`, `src/arpg/world.ts`, `src/arpg/combat.ts`, `src/arpg/abilities/impact.ts`, `src/arpg/abilities/defend.ts`, `src/delve/dive.ts` (CRLF, never format), `src/index.ts`, `tests/delve-runes-contract.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-runes-contract.test.ts`:

Replace:

```ts
  resolveAbility,
  resolveChain,
} from '../src/arpg/abilities/resolve.js';
import { makeCtx } from '../src/arpg/combat.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
```

with:

```ts
  resolveAbility,
  resolveChain,
} from '../src/arpg/abilities/resolve.js';
import * as engine from '../src/index.js';
import { makeCtx } from '../src/arpg/combat.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
```

Replace:

```ts
  takeFromPouch,
} from '../src/loot/runes.js';
import type { RunePouch, RuneRef, RuneTier } from '../src/types/rune.js';
import { MOVE_KINDS } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { arena, bal, damaged, dummy, moveOf, press, registry, run } from './fixtures/arena.js';
```

with:

```ts
  takeFromPouch,
} from '../src/loot/runes.js';
import type { RunePouch, RuneRef, RuneTier } from '../src/types/rune.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { MOVE_KINDS } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { arena, bal, damaged, dummy, moveOf, press, registry, run } from './fixtures/arena.js';
```

Append at the end of the file:

```ts
// Stubs in wave 0 ("not built yet"); wave 1B builds them and may delete these lines.
describe('wave 1B: delve/runes.ts and arpg/rune-drops.ts', () => {
  it.todo('unsocketMode: the override, else balance.delve.runes.unsocket');
  it.todo(
    'runeChange and draftPrice: sockets opened, runes socketed and pulled, net Links, refusals',
  );
  it.todo('openSocket, socketRune, fusePrice and fuseRunes');
  it.todo('dropRune: a rune Drop from rollRuneDrop on world.runeRng, none in the sandbox');
});

describe('the sim and the index: the contract is in place', () => {
  it('sets up a world and a hero with no echoes, no runes pending, nothing drained and a rune stream', () => {
    const w = arena([dummy(13, 30)]);
    expect(w.echoes).toEqual([]);
    expect(w.pending.runes).toEqual([]);
    expect(w.hero.drained).toEqual([0, 0, 0, 0]);
    expect(w.runeRng).toBeInstanceOf(SeededRNG);
    expect(w.runeRng).not.toBe(w.lootRng);
  });

  it('exports every new module and symbol from the package index', () => {
    for (const name of [
      'NEUTRAL',
      'moveBeat',
      'knobHitOpts',
      'guardLand',
      'queueEcho',
      'echoTick',
      'dropRune',
      'runeFits',
      'runeActive',
      'runeKnobs',
      'runeText',
      'extraShotPower',
      'socketCap',
      'socketPrice',
      'pouchCount',
      'addToPouch',
      'takeFromPouch',
      'socketsOf',
      'runeTierAt',
      'rollRuneDrop',
      'rollSockets',
      'weaponParts',
      'unsocketMode',
      'runeChange',
      'draftPrice',
      'openSocket',
      'socketRune',
      'fusePrice',
      'fuseRunes',
      'RUNE_TIERS',
      'MAX_SOCKETS',
      'RUNE_FAMILIES',
    ])
      expect(engine, name).toHaveProperty(name);
  });
});

// Stubs in wave 0 ("not built yet"); wave 1A builds them and may delete these lines.
describe('wave 1A: the sim', () => {
  it.todo('knobHitOpts: leech, catalyst and manaOnHit from the knobs');
  it.todo(
    'guardLand: a guardOnLand × max life barrier for guardSeconds, never shrinking a larger one',
  );
  it.todo('queueEcho and echoTick: the move or blow again after echoDelay, at its echo fraction');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-runes-contract.test.ts)`
Expected: FAIL, 2 failed, 27 passed and 11 todo (40): the world's test (`expected undefined to deeply equal []`) and the index's (`expected { … } to have property "NEUTRAL"`, and so on).

- [ ] **Step 3: Write the types, the world's state, the stubs and the exports**

In `packages/engine/src/types/arpg.ts`:

Replace:

```ts
  FormId,
  KnobsData,
  MoveKind,
```

with:

```ts
  FormId,
  Knobs,
  KnobsData,
  MoveKind,
```

Replace:

```ts
import type { RuneDef } from './rune.js';
```

with:

```ts
import type { RuneDef, RuneRef } from './rune.js';
```

Replace:

```ts
  /** The ability form that fired it, 'ember' (Pyroclasm), or null for a basic-attack bolt / monster shot. */
  form: FormId | 'ember' | null;
```

with:

```ts
  /**
   * The ability form that fired it, 'ember' (Pyroclasm), 'shard' (Split's), or
   * null for a basic-attack bolt / monster shot.
   */
  form: FormId | 'ember' | 'shard' | null;
```

Replace:

```ts
  /** A Twin Fang echo: its hit pairs nothing (see `HitOpts.noReact`). */
  noReact?: boolean;
  dead: boolean;
}
```

with:

```ts
  /** A Twin Fang echo: its hit pairs nothing (see `HitOpts.noReact`). */
  noReact?: boolean;
  /** A basic shot's blow knobs (its runes'; see the runes spec). */
  knobs?: Knobs;
  dead: boolean;
}
```

Replace:

```ts
export type DropKind = 'item' | 'mote' | 'orb' | 'scrap';
```

with:

```ts
export type DropKind = 'item' | 'mote' | 'orb' | 'scrap' | 'rune';
```

Replace:

```ts
  item?: GearItem;
  mana?: ManaType;
  amount: number;
```

with:

```ts
  item?: GearItem;
  mana?: ManaType;
  /** A rune drop's rune (kind `'rune'`). */
  rune?: RuneRef;
  amount: number;
```

Replace:

```ts
  /** The side (1 or −1) the last side step took (see the weapon flow spec). */
  swaySide: number;
}
```

with:

```ts
  /** The side (1 or −1) the last side step took (see the weapon flow spec). */
  swaySide: number;
  /**
   * Drain's foe-hits counted per skill since it last fired: the Primary, the
   * Defensive, the Ultimate, then the basic attack (see the runes spec).
   */
  drained: number[];
}
```

Replace:

```ts
      dropKind: DropKind;
      item?: GearItem;
      amount: number;
      mana?: ManaType;
    }
```

with:

```ts
      dropKind: DropKind;
      item?: GearItem;
      amount: number;
      mana?: ManaType;
      rune?: RuneRef;
    }
```

Replace:

```ts
  | { kind: 'cleared' }
```

with:

```ts
  /** A rune's effect fired: its glyph flashes at the point (see the runes spec). */
  | {
      kind: 'runeFx';
      effect: 'split' | 'echo' | 'volatile';
      x: number;
      y: number;
      element: ManaType | null;
    }
  | { kind: 'cleared' }
```

Replace:

```ts
  kills: number;
  reactions: ReactionId[];
}
```

with:

```ts
  kills: number;
  reactions: ReactionId[];
  /** Runes picked up, banked into the pouch. */
  runes: RuneRef[];
}
```

Replace:

```ts
/** An ability press waiting to fire (see `ArpgWorld.queuedCasts`). */
```

with:

```ts
/** A move or a blow to repeat at `at` (Echo; see the runes spec). */
export interface Echo {
  at: number;
  /** An ability's: its slot, the move as it landed, and its landing point. */
  slot: number | null;
  ability: ResolvedAbility | null;
  aim: Vec | null;
  /** A blow's: its step in the basic chain, the stage it struck at (null: not held), and its way. */
  blow: number | null;
  stage: number | null;
  dir: Vec | null;
}

/** An ability press waiting to fire (see `ArpgWorld.queuedCasts`). */
```

Replace:

```ts
  rng: SeededRNG;
  lootRng: SeededRNG;
```

with:

```ts
  rng: SeededRNG;
  lootRng: SeededRNG;
  /** Rune drops' own stream, so item drops roll as they did before runes. */
  runeRng: SeededRNG;
```

Replace:

```ts
  /** A press of the slot whose hold runs: its release, for the next step. */
```

with:

```ts
  /** Moves and blows waiting to repeat (Echo), in the order they were queued. */
  echoes: Echo[];
  /** A press of the slot whose hold runs: its release, for the next step. */
```

In `packages/engine/src/arpg/world.ts`:

Replace:

```ts
    moving: false,
    swaySide: 1,
  };
}
```

with:

```ts
    moving: false,
    swaySide: 1,
    drained: [0, 0, 0, 0],
  };
}
```

Replace:

```ts
    lootRng: rng.fork(`loot:${opts.loot.nextUid}`),
```

with:

```ts
    lootRng: rng.fork(`loot:${opts.loot.nextUid}`),
    runeRng: rng.fork(`runes:${opts.loot.nextUid}`),
```

Replace:

```ts
    pending: { items: [], scrap: 0, kills: 0, reactions: [] },
```

with:

```ts
    pending: { items: [], scrap: 0, kills: 0, reactions: [], runes: [] },
```

Replace:

```ts
    queuedCasts: [],
    queuedRelease: null,
```

with:

```ts
    queuedCasts: [],
    echoes: [],
    queuedRelease: null,
```

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
  world.pending = { items: [], scrap: 0, kills: 0, reactions: [] };
```

with:

```ts
  world.pending = { items: [], scrap: 0, kills: 0, reactions: [], runes: [] };
```

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
  /** Extra fraction of the damage healed (ability lifesteal). */
  leech?: number;
```

with:

```ts
  /** Extra fraction of the damage healed (ability lifesteal). */
  leech?: number;
  /** Added to the factor of the reactions this hit sets off (Volatile; see the runes spec). */
  catalyst?: number;
  /** Mana this hit gives per foe while its skill's Drain budget lasts. */
  manaOnHit?: number;
```

In `packages/engine/src/arpg/abilities/impact.ts`:

Replace:

```ts
import { ABILITY_SLOTS, type ResolvedAbility } from '../../types/ability.js';
```

with:

```ts
import { ABILITY_SLOTS, type Knobs, type ResolvedAbility } from '../../types/ability.js';
```

Replace:

```ts
  /** How hard direct hits land (defaults to the ability's). */
  heft?: number;
}
```

with:

```ts
  /** How hard direct hits land (defaults to the ability's). */
  heft?: number;
  /** A Split shard's impact: no scatter or explosion event; no shards, chain, zone or embers. */
  shard?: boolean;
}

/** The hit-time knobs a hit carries: lifesteal, Volatile and Drain (see the runes spec). */
export function knobHitOpts(_k: Knobs): Pick<HitOpts, 'leech' | 'catalyst' | 'manaOnHit'> {
  throw new Error('not built yet');
}
```

In `packages/engine/src/arpg/abilities/defend.ts`:

Replace:

```ts
import type { ResolvedAbility } from '../../types/ability.js';
```

with:

```ts
import type { Knobs, ResolvedAbility } from '../../types/ability.js';
```

Replace:

```ts
/** The Surge while it is up, else null. */
```

with:

```ts
/**
 * Guard: on landing, a shield of `guardOnLand` × max life for
 * `delve.runes.guardSeconds`, fed into Obsidian's barrier (see the runes spec).
 */
export function guardLand(_ctx: SimCtx, _knobs: Knobs): void {
  throw new Error('not built yet');
}

/** The Surge while it is up, else null. */
```

Create `packages/engine/src/arpg/abilities/echo.ts`:

```ts
import type { Echo } from '../../types/arpg.js';
import type { SimCtx } from '../combat.js';

/**
 * Echo (see the runes spec): a move or a blow that lands with `echo > 0`
 * repeats `delve.runes.echoDelay` later at that fraction of its power, free,
 * without a beat, a cooldown, a cast event, Guard or a further echo.
 */

/** Queue an echo on `ArpgWorld.echoes`. */
export function queueEcho(_ctx: SimCtx, _echo: Echo): void {
  throw new Error('not built yet');
}

/** Run every echo whose time has come (called right after `castTick`). */
export function echoTick(_ctx: SimCtx): void {
  throw new Error('not built yet');
}
```


Create `packages/engine/src/arpg/rune-drops.ts`:

```ts
import type { MonsterEntity } from '../types/arpg.js';
import type { SimCtx } from './combat.js';

/**
 * A slain foe's rune drop (see the runes spec): rolled on `ArpgWorld.runeRng`
 * by `rollRuneDrop`, spawned as a `Drop` of kind `'rune'`. `killMonster` calls
 * it inside its `!world.sandbox` guard, so the Training Grounds drop none.
 */
export function dropRune(_ctx: SimCtx, _m: MonsterEntity): void {
  throw new Error('not built yet');
}
```


Create `packages/engine/src/delve/runes.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { Chains, ChainSkill } from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { ChainOrigins, RuneRef, UnsocketMode } from '../types/rune.js';
import type { ProfileActionResult } from './profile.js';

/**
 * The runes' profile ops (see the runes spec): the pull rule, a draft's rune
 * diff and price, opening a socket, socketing a rune, and fusing. Results,
 * not throws; each refuses mid-dive. Wave 1B builds them.
 */

const NOT_BUILT = 'not built yet';

/** `setChains`' options: where each new move came from, and the pull rule. */
export interface SetChainsOptions {
  origins?: ChainOrigins;
  unsocket?: UnsocketMode;
}

/** What an Apply's runes cost and move (`runeChange`). */
export interface RuneChange {
  /** Sockets opened. */
  links: number;
  /** Sockets opened, and pulls in 'pay'. */
  scrap: number;
  /** Sockets of removed moves (netted against `links`). */
  refundLinks: number;
  /** Out of the pouch. */
  socketed: RuneRef[];
  /** Destroyed ('destroy') or back to the pouch ('pay'). */
  pulled: RuneRef[];
}

/** The builder's one total for a draft: Dust, net Links, scrap, and the runes it destroys or returns. */
export interface DraftPrice {
  dust: number;
  links: number;
  scrap: number;
  refundLinks: number;
  destroys: RuneRef[];
  returns: RuneRef[];
}

/** The pull rule: the override (the dev toggle), else the balance's. */
export function unsocketMode(
  _registry: DataRegistry,
  _override?: UnsocketMode | null,
): UnsocketMode {
  throw new Error(NOT_BUILT);
}

/** The runes' part of an Apply of `chains`: sockets opened, runes socketed and pulled, and their price. */
export function runeChange(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _chains: Partial<Chains>,
  _opts?: SetChainsOptions,
): RuneChange | { refused: string } {
  throw new Error(NOT_BUILT);
}

/** A draft's whole price, from the functions `setChains` charges with. */
export function draftPrice(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _chains: Partial<Chains>,
  _opts?: SetChainsOptions,
): DraftPrice | { refused: string } {
  throw new Error(NOT_BUILT);
}

/** Open the next socket of move `index` of the equipped weapon's `skill` chain, for Links and scrap. */
export function openSocket(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _skill: ChainSkill,
  _index: number,
): ProfileActionResult {
  throw new Error(NOT_BUILT);
}

/** Socket a pouch rune into socket `socket` of move `index` of `skill` (one `setChains`). */
export function socketRune(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _skill: ChainSkill,
  _index: number,
  _socket: number,
  _rune: RuneRef,
  _opts?: SetChainsOptions,
): ProfileActionResult {
  throw new Error(NOT_BUILT);
}

/** Scrap to fuse `fuseCount` of `ref` into one of the next tier; null at tier V. */
export function fusePrice(_registry: DataRegistry, _ref: RuneRef): number | null {
  throw new Error(NOT_BUILT);
}

/** Fuse `fuseCount` of `ref` into one of the next tier, for scrap. */
export function fuseRunes(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _ref: RuneRef,
): ProfileActionResult {
  throw new Error(NOT_BUILT);
}
```


In `packages/engine/src/index.ts`:

Replace:

```ts
  stepBonus,
  beatFor,
  holdFull,
```

with:

```ts
  stepBonus,
  beatFor,
  moveBeat,
  holdFull,
```

Replace:

```ts
  mergeKnobs,
  defaultBasic,
```

with:

```ts
  mergeKnobs,
  NEUTRAL,
  defaultBasic,
```

Replace:

```ts
export type { DpsSetup, DpsOptions, DpsResult } from './arpg/dps-sim.js';
```

with:

```ts
export type { DpsSetup, DpsOptions, DpsResult } from './arpg/dps-sim.js';

// Runes (see the runes spec): every module whole, so the waves that build them never edit this file.
export * from './loot/runes.js';
export * from './delve/runes.js';
export * from './arpg/abilities/echo.js';
export * from './arpg/rune-drops.js';
export { knobHitOpts } from './arpg/abilities/impact.js';
export { guardLand } from './arpg/abilities/defend.js';
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-runes-contract.test.ts)`
Expected: PASS, 29 tests and 11 todo.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1456 tests pass and 11 todo (1467) in 79 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-contract
(cd packages/engine && npx prettier --write src/types/arpg.ts src/arpg/world.ts src/arpg/combat.ts src/arpg/abilities/impact.ts src/arpg/abilities/defend.ts src/arpg/abilities/echo.ts src/arpg/rune-drops.ts src/delve/runes.ts src/index.ts tests/delve-runes-contract.test.ts)
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/abilities/defend.ts packages/engine/src/arpg/abilities/echo.ts packages/engine/src/arpg/rune-drops.ts packages/engine/src/delve/runes.ts packages/engine/src/delve/dive.ts packages/engine/src/index.ts packages/engine/tests/delve-runes-contract.test.ts
git commit -m "feat(engine): the runes' sim contract, wave 1's stubs and the package's pre-exports" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 6: Save v7 (Task 6, part 1: the tests)

### Task 6: Save v7

The save gains the pouch: `DelveProfile` version 7 with `runes`, `MoveSchema` and `BlowSchema` with their sockets (so every frozen schema reads them too), `RunePouchSchema`, the frozen `DelveProfileV6Schema`, `DiveState.runesEarned` (default 0 on load), the `'rune'` offer, and `fitMovesets`' trims. A version 6 save loads as version 7 with an empty pouch and nothing else changed; older saves migrate through version 6 as today (`fromV5` writes version 7 directly). The ops that can return runes say so, always empty for now.

**Files:**
- Modify: `packages/engine/src/types/delve.ts`, `src/delve/profile-schema.ts` (CRLF, never format), `src/delve/profile.ts`, `src/delve/dive.ts` (CRLF, never format), `src/delve/stops.ts`, `src/index.ts`
- Modify (tests): `packages/engine/tests/delve-runes-contract.test.ts`, `delve-dive.test.ts`, `delve-movesets.test.ts`, `delve-pair.test.ts`, `delve-profile-abilities.test.ts`, `delve-reactions.test.ts`, `delve-chains.test.ts`

- [ ] **Step 1: Write the failing tests**

The contract's save tests, and every test that pins version 6 or `ParsedDelveProfile`'s exact shape.

In `packages/engine/tests/delve-runes-contract.test.ts`:

Replace:

```ts
import { makeCtx } from '../src/arpg/combat.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import {
  addToPouch,
  extraShotPower,
```

with:

```ts
import { makeCtx } from '../src/arpg/combat.js';
import { spawnProjectile } from '../src/arpg/abilities/targeting.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { startDive } from '../src/delve/dive.js';
import {
  addLootToBag,
  createDelveProfile,
  parseDelveProfile,
  salvageItems,
} from '../src/delve/profile.js';
import { stopKinds } from '../src/delve/stops.js';
import {
  addToPouch,
  extraShotPower,
```

Replace:

```ts
} from '../src/loot/runes.js';
import type { RunePouch, RuneRef, RuneTier } from '../src/types/rune.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { MOVE_KINDS } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { arena, bal, damaged, dummy, moveOf, press, registry, run } from './fixtures/arena.js';

// The runes spec's wave-0 contract: every new knob neutral, so nothing plays differently yet.

```

with:

```ts
} from '../src/loot/runes.js';
import type { RunePouch, RuneRef, RuneTier } from '../src/types/rune.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { MOVE_KINDS, type Move } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { DelveProfile } from '../src/types/delve.js';
import {
  arena,
  bal,
  chainsOf,
  damaged,
  dummy,
  moveOf,
  press,
  registry,
  run,
  withChains,
} from './fixtures/arena.js';

// The runes spec's wave-0 contract: every new knob neutral, so nothing plays differently yet.

```

Append at the end of the file:

```ts
describe('save v7', () => {
  const json = (x: unknown) => JSON.parse(JSON.stringify(x));
  const fresh = () => createDelveProfile(registry, 1, { primary: 'fire' });
  const bolt = (runes: (RuneRef | null)[]): Move => ({
    kind: 'medium',
    form: 'bolt',
    elements: ['fire'],
    runes,
  });
  /** A rare weapon: two sockets a move. */
  const rare = (p: DelveProfile): DelveProfile => ({
    ...p,
    equipped: { ...p.equipped, weapon: { ...p.equipped.weapon!, rarity: 'rare' } },
  });

  it('a new profile is version 7 with an empty pouch', () => {
    expect(fresh()).toMatchObject({ version: 7, runes: {} });
  });

  it('loads a version 6 save as version 7 with an empty pouch, and nothing else changed', () => {
    const p = fresh();
    const { runes: _runes, ...v6 } = p;
    expect(parseDelveProfile(registry, json({ ...v6, version: 6 }))).toEqual({
      profile: p,
      fixed: [],
      dropped: [],
      movesetReset: false,
      runesLost: [],
    });
  });

  it('round-trips sockets, empty ones included, and the pouch', () => {
    const p = {
      ...withChains(rare(fresh()), {
        primary: { moves: [bolt([{ id: 'chain', tier: 2 }, null])], payment: 'mana' },
      }),
      runes: { quick: [0, 1, 0, 0, 0] },
    };
    const res = parseDelveProfile(registry, json(p))!;
    expect(chainsOf(res.profile).primary!.moves[0].runes).toEqual([{ id: 'chain', tier: 2 }, null]);
    expect(res.profile.runes).toEqual({ quick: [0, 1, 0, 0, 0] });
    expect(parseDelveProfile(registry, json(res.profile))).toEqual({ ...res, runesLost: [] });
  });

  it('empties unknown and repeated runes and trims sockets past the cap: a Link each, the runes destroyed', () => {
    const p = {
      ...withChains(rare(fresh()), {
        primary: {
          moves: [
            bolt([
              { id: 'ghost', tier: 1 },
              { id: 'chain', tier: 1 },
            ]),
            bolt([
              { id: 'quick', tier: 2 },
              { id: 'quick', tier: 3 },
              { id: 'echo', tier: 1 },
            ]),
          ],
          payment: 'mana',
        },
      }),
      runes: { ghost: [1, 0, 0, 0, 0], echo: [0, 0, 1, 0, 0] },
    };
    const res = parseDelveProfile(registry, json(p))!;
    expect(chainsOf(res.profile).primary!.moves.map((m) => m.runes)).toEqual([
      [null, { id: 'chain', tier: 1 }],
      [{ id: 'quick', tier: 2 }, null],
    ]);
    expect(res.profile.links).toBe(p.links + 1);
    expect(res.runesLost).toEqual([
      { id: 'quick', tier: 3 },
      { id: 'echo', tier: 1 },
    ]);
    expect(res.profile.runes).toEqual({ echo: [0, 0, 1, 0, 0] });
  });

  it("in 'pay' mode the runes a trim takes off go back to the pouch", () => {
    const p = {
      ...withChains(fresh(), {
        primary: {
          moves: [
            bolt([
              { id: 'quick', tier: 2 },
              { id: 'echo', tier: 1 },
            ]),
          ],
          payment: 'mana',
        },
      }),
      runes: { echo: [0, 0, 1, 0, 0] },
    };
    bal.runes.unsocket = 'pay';
    try {
      const res = parseDelveProfile(registry, json(p))!;
      expect(chainsOf(res.profile).primary!.moves[0].runes).toEqual([{ id: 'quick', tier: 2 }]);
      expect(res.profile.links).toBe(p.links + 1);
      expect(res.runesLost).toEqual([]);
      expect(res.profile.runes).toEqual({ echo: [1, 0, 1, 0, 0] });
    } finally {
      bal.runes.unsocket = 'destroy';
    }
  });

  it("a chain the weapon can't carry takes its sockets with it: a Link each, its runes by the rule", () => {
    // A common sword carries no Defensive.
    const ward: Move = {
      kind: 'medium',
      form: 'ward',
      elements: ['fire'],
      runes: [{ id: 'guard', tier: 1 }, null],
    };
    const p = withChains(fresh(), { defensive: { moves: [ward], payment: 'mana' } });
    const res = parseDelveProfile(registry, json(p))!;
    expect(res.profile.equipped.weapon!.moveset!.chains.defensive).toBeUndefined();
    expect(res.profile.links).toBe(p.links + 2);
    expect(res.runesLost).toEqual([{ id: 'guard', tier: 1 }]);
  });

  it('refuses more than MAX_SOCKETS sockets, a tier past V, or a pouch row of other than five counts', () => {
    const p = fresh();
    const four = withChains(rare(p), {
      primary: { moves: [bolt([null, null, null, null])], payment: 'mana' },
    });
    const tierSix = withChains(rare(p), {
      primary: { moves: [bolt([{ id: 'chain', tier: 6 as RuneTier }])], payment: 'mana' },
    });
    expect(parseDelveProfile(registry, json(four))).toBeNull();
    expect(parseDelveProfile(registry, json(tierSix))).toBeNull();
    expect(parseDelveProfile(registry, json({ ...p, runes: { chain: [1, 0, 0] } }))).toBeNull();
  });

  it("starts a dive with no runes earned; a dive saved without the count loads with 0, and a stop may offer 'rune'", () => {
    const p = startDive(registry, fresh(), 1);
    expect(p.dive!.runesEarned).toBe(0);
    const { runesEarned: _r, ...dive } = p.dive!;
    const stop = { offers: ['rune'], taken: false };
    const res = parseDelveProfile(registry, json({ ...p, dive: { ...dive, stop } }))!;
    expect(res.profile.dive).toMatchObject({ runesEarned: 0, stop });
  });

  it("doesn't offer the 'rune' stop yet, and the ops that can return runes return none", () => {
    const p = fresh();
    expect(stopKinds(registry, p)).not.toContain('rune');
    expect(salvageItems(registry, p, [])).toMatchObject({ runes: [], destroyed: [] });
    expect(addLootToBag(registry, p, [])).toMatchObject({ runes: [], destroyed: [] });
  });

  it("exports the save's rune schemas", () => {
    expect(engine.RuneRefSchema.safeParse({ id: 'split', tier: 3 }).success).toBe(true);
    expect(engine.RunePouchSchema.safeParse({ split: [0, 1, 0, 0, 0] }).success).toBe(true);
  });
});
```


In `packages/engine/tests/delve-dive.test.ts`:

Replace:

```ts
    expect(p.version).toBe(6);
```

with:

```ts
    expect(p.version).toBe(7);
```

Replace:

```ts
      dropped: [],
      movesetReset: false,
    });
```

with:

```ts
      dropped: [],
      movesetReset: false,
      runesLost: [],
    });
```

In `packages/engine/tests/delve-movesets.test.ts`:

Replace:

```ts
    expect(profile).toMatchObject({ version: 6, links: 0 });
```

with:

```ts
    expect(profile).toMatchObject({ version: 7, links: 0 });
```

Replace:

```ts
    expect(profile.dive).toEqual({ ...V5.magic.dive, linksEarned: 0, stop: null });
```

with:

```ts
    expect(profile.dive).toEqual({ ...V5.magic.dive, linksEarned: 0, runesEarned: 0, stop: null });
```

Replace:

```ts
  it('round-trips every migrated save as version 6', () => {
```

with:

```ts
  it('round-trips every migrated save as version 7', () => {
```

Replace:

```ts
        dropped: [],
        movesetReset: false,
      });
```

with:

```ts
        dropped: [],
        movesetReset: false,
        runesLost: [],
      });
```

In `packages/engine/tests/delve-pair.test.ts`:

Replace:

```ts
  it('a new profile is version 6 with no pair yet, no Mana Dust and no Links, and round-trips', () => {
    const p = createDelveProfile(registry, 3);
    expect(p).toMatchObject({
      version: 6,
```

with:

```ts
  it('a new profile is version 7 with no pair yet, no Mana Dust, no Links and no runes, and round-trips', () => {
    const p = createDelveProfile(registry, 3);
    expect(p).toMatchObject({
      version: 7,
```

Replace:

```ts
      manaDust: 0,
      links: 0,
    });
```

with:

```ts
      manaDust: 0,
      links: 0,
      runes: {},
    });
```

Replace:

```ts
      dropped: [],
      movesetReset: false,
    });
```

with:

```ts
      dropped: [],
      movesetReset: false,
      runesLost: [],
    });
```

Replace:

```ts
    expect(res.profile).toMatchObject({
      version: 6,
      pair: { primary: 'storm', secondary: null },
      manaDust: 0,
    });
```

with:

```ts
    expect(res.profile).toMatchObject({
      version: 7,
      pair: { primary: 'storm', secondary: null },
      manaDust: 0,
    });
```

Replace:

```ts
    expect(res.profile).toMatchObject({ version: 6, pair: { primary: 'storm', secondary: null } });
```

with:

```ts
    expect(res.profile).toMatchObject({ version: 7, pair: { primary: 'storm', secondary: null } });
```

In `packages/engine/tests/delve-profile-abilities.test.ts`:

Replace:

```ts
    expect(p.version).toBe(6);
```

with:

```ts
    expect(p.version).toBe(7);
```

Replace:

```ts
      dropped: [],
      movesetReset: false,
    });
```

with:

```ts
      dropped: [],
      movesetReset: false,
      runesLost: [],
    });
```

Replace:

```ts
    expect(p!.version).toBe(6);
```

with:

```ts
    expect(p!.version).toBe(7);
```

In `packages/engine/tests/delve-reactions.test.ts`:

Replace:

```ts
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(v3)))?.profile).toMatchObject({
      version: 6,
```

with:

```ts
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(v3)))?.profile).toMatchObject({
      version: 7,
```

In `packages/engine/tests/delve-chains.test.ts`:

Replace:

```ts
    expect(profile).toMatchObject({ version: 6, links: 0 });
```

with:

```ts
    expect(profile).toMatchObject({ version: 7, links: 0 });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run)`
Expected: FAIL, 23 failed and 1443 passed (and 11 todo) in 7 files: the contract's ten save tests (`expected 6 to be 7`, a v6 save not loading, the trims not happening, `RuneRefSchema` undefined), and the 13 tests the version bump updates (`expected 6 to be 7`, `expected { version: 6, … } to match object { version: 7, … }`, and the parse results without `runesLost`).

## Chunk 7: Save v7 (Task 6, part 2: the save)

- [ ] **Step 3: Write the save**

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
import type { RuneRef, UnsocketMode } from './rune.js';
```

with:

```ts
import type { RunePouch, RuneRef, UnsocketMode } from './rune.js';
```

Replace:

```ts
/** A stop's power-up: equip a bag item, add a slot, adjust one move, or upgrade an item. */
export type StopKind = 'equip' | 'slot' | 'move' | 'upgrade';
```

with:

```ts
/** A stop's power-up: equip a bag item, add a slot, adjust one move, upgrade an item, or socket a rune. */
export type StopKind = 'equip' | 'slot' | 'move' | 'upgrade' | 'rune';
```

Replace:

```ts
  /** Links from weapons salvaged while banking this dive (auto-salvage, full bag). */
  linksEarned: number;
```

with:

```ts
  /** Links from weapons salvaged while banking this dive (auto-salvage, full bag). */
  linksEarned: number;
  /** Runes picked up this dive (see the runes spec). */
  runesEarned: number;
```

Replace:

```ts
export interface DelveProfile {
  version: 6;
```

with:

```ts
export interface DelveProfile {
  version: 7;
```

Replace:

```ts
  /** From salvaging weapons with extra slots; spent on a weapon's new slots (see the weapon movesets spec). */
  links: number;
```

with:

```ts
  /** From salvaging weapons with extra slots; spent on a weapon's new slots (see the weapon movesets spec). */
  links: number;
  /** Loose runes: counts by id and tier (see the runes spec). */
  runes: RunePouch;
```

In `packages/engine/src/delve/profile-schema.ts`:

Replace:

```ts
import { CHAIN_SKILLS, MAX_CHAIN, type AbilitySlot, type FormId } from '../types/ability.js';
```

with:

```ts
import { CHAIN_SKILLS, MAX_CHAIN, type AbilitySlot, type FormId } from '../types/ability.js';
import { MAX_SOCKETS, RUNE_TIERS } from '../types/rune.js';
```

Replace:

```ts
export const MoveSchema = z.object({
  kind: MoveKindSchema,
  form: FormIdSchema,
  elements: ElementsSchema,
});

export const BlowSchema = z.object({ kind: MoveKindSchema, element: ManaTypeSchema });
```

with:

```ts
/** A socketed rune: its id (checked against the data at load) and its tier, I to V. */
export const RuneRefSchema = z.object({
  id: z.string(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

/** A move's or a blow's open sockets, each a rune or null (see the runes spec). */
const SocketsSchema = z.array(RuneRefSchema.nullable()).max(MAX_SOCKETS).optional();

export const MoveSchema = z.object({
  kind: MoveKindSchema,
  form: FormIdSchema,
  elements: ElementsSchema,
  runes: SocketsSchema,
});

export const BlowSchema = z.object({
  kind: MoveKindSchema,
  element: ManaTypeSchema,
  runes: SocketsSchema,
});

/** Loose runes: rune id → counts by tier. */
export const RunePouchSchema = z.record(
  z.string(),
  z.array(z.number().int().min(0)).length(RUNE_TIERS),
);
```

Replace:

```ts
  linksEarned: z.number().int().min(0).default(0),
```

with:

```ts
  linksEarned: z.number().int().min(0).default(0),
  runesEarned: z.number().int().min(0).default(0),
```

Replace:

```ts
      offers: z.array(z.enum(['equip', 'slot', 'move', 'upgrade'])),
```

with:

```ts
      offers: z.array(z.enum(['equip', 'slot', 'move', 'upgrade', 'rune'])),
```

Replace:

```ts
/** Version 6: the chains live on the weapon, and Links (see the weapon movesets spec). */
export const DelveProfileSchema = DelveProfileV5Schema.omit({
  chains: true,
  chainCaps: true,
}).extend({
  version: z.literal(6),
  links: z.number().int().min(0),
});
```

with:

```ts
/** Version 6 (the chains on the weapon, and Links), kept frozen so older saves migrate through it. */
export const DelveProfileV6Schema = DelveProfileV5Schema.omit({
  chains: true,
  chainCaps: true,
}).extend({
  version: z.literal(6),
  links: z.number().int().min(0),
});

/** Version 7: the rune pouch (see the runes spec). */
export const DelveProfileSchema = DelveProfileV6Schema.extend({
  version: z.literal(7),
  runes: RunePouchSchema,
});
```

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
import type { ArpgWorld, ReactionId } from '../types/arpg.js';
```

with:

```ts
import type { ArpgWorld, ReactionId } from '../types/arpg.js';
import type { RuneRef } from '../types/rune.js';
```

Replace:

```ts
    linksEarned: 0,
    stop: null,
```

with:

```ts
    linksEarned: 0,
    runesEarned: 0,
    stop: null,
```

Replace:

```ts
  /** Links from weapons melted by auto-salvage or a full bag. */
  links: number;
}
```

with:

```ts
  /** Links from weapons melted by auto-salvage or a full bag. */
  links: number;
  /** Runes picked up, banked into the pouch (see the runes spec). */
  runes: RuneRef[];
}
```

Replace:

```ts
    dust: bagged.dust,
    links: bagged.links,
  };
}
```

with:

```ts
    dust: bagged.dust,
    links: bagged.links,
    runes: [],
  };
}
```

In `packages/engine/src/delve/stops.ts`:

Replace:

```ts
    upgrade: items.some((i) => (upgradeCost(registry, i) ?? Infinity) <= profile.scrap),
  };
```

with:

```ts
    upgrade: items.some((i) => (upgradeCost(registry, i) ?? Infinity) <= profile.scrap),
    rune: false,
  };
```

In `packages/engine/src/delve/profile.ts`:

Replace:

```ts
import {
  DelveProfileSchema,
  DelveProfileV2Schema,
  DelveProfileV3Schema,
  DelveProfileV4Schema,
  DelveProfileV5Schema,
} from './profile-schema.js';
```

with:

```ts
import {
  DelveProfileSchema,
  DelveProfileV2Schema,
  DelveProfileV3Schema,
  DelveProfileV4Schema,
  DelveProfileV5Schema,
  DelveProfileV6Schema,
} from './profile-schema.js';
```

Replace:

```ts
import { baseSlots, carriedSkills, defaultChain, extraSlots, movesetOf } from '../loot/moveset.js';
```

with:

```ts
import { baseSlots, carriedSkills, defaultChain, extraSlots, movesetOf } from '../loot/moveset.js';
import { addToPouch, socketCap } from '../loot/runes.js';
import type { RuneRef } from '../types/rune.js';
```

Replace:

```ts
  type AbilitySlot,
  type Chain,
  type Chains,
  type ChainSkill,
  type MoveKind,
} from '../types/ability.js';
```

with:

```ts
  type AbilitySlot,
  type Blow,
  type Chain,
  type Chains,
  type ChainSkill,
  type Move,
  type MoveKind,
} from '../types/ability.js';
```

Replace:

```ts
  /** Links the op gave back (a fuse's weapons' extra slots, a transfer's). */
  links?: number;
}
```

with:

```ts
  /** Links the op gave back (a fuse's weapons' extra slots, a transfer's). */
  links?: number;
  /** Runes the op put back in the pouch (see the runes spec). */
  runes?: RuneRef[];
  /** Runes the op destroyed. */
  destroyed?: RuneRef[];
}
```

Replace:

```ts
  const profile: DelveProfile = {
    version: 6,
```

with:

```ts
  const profile: DelveProfile = {
    version: 7,
```

Replace:

```ts
    manaDust: 0,
    links: 0,
    reactionsSeen: [],
    dive: null,
  };
```

with:

```ts
    manaDust: 0,
    links: 0,
    runes: {},
    reactionsSeen: [],
    dive: null,
  };
```

Replace:

```ts
  /** An unarmed save's built chains were reset to the unarmed defaults (no weapon holds them). */
  movesetReset: boolean;
}
```

with:

```ts
  /** An unarmed save's built chains were reset to the unarmed defaults (no weapon holds them). */
  movesetReset: boolean;
  /** Runes a load-time trim destroyed (in 'destroy' mode), for a notice each. */
  runesLost: RuneRef[];
}
```

Replace:

```ts
type ProfileV5 = Omit<DelveProfile, 'version' | 'links'> & {
```

with:

```ts
type ProfileV5 = Omit<DelveProfile, 'version' | 'links' | 'runes'> & {
```

Replace:

```ts
/**
 * Every weapon's moveset fitted to the data: a weapon without one gets its
 * base defaults in its own mana; a chain its rarity no longer carries is
 * dropped, its extra slots back as Links (as salvaging would give); a newly
 * carried one gets its base default; and a basic chain's slots are raised to
 * its weapon's string. (A base whose string grew absorbs extras it can't tell
 * from its new base: the old base isn't stored, so those give no Links.)
 */
function fitMovesets(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let links = 0;
  const fit = (item: GearItem): GearItem => {
    if (item.slot !== 'weapon') return item;
    const old = movesetOf(registry, item);
    const carried = carriedSkills(registry, item.rarity);
    const moveset: Moveset = { chains: {}, slots: {} };
    for (const skill of CHAIN_SKILLS) {
      const base = baseSlots(registry, item.baseId, skill);
      const chain = old.chains[skill];
      if (!carried.includes(skill)) {
        links += Math.max(0, (old.slots[skill] ?? base) - base);
        continue;
      }
      const set = moveset.chains as Record<ChainSkill, unknown>;
      set[skill] = chain ?? defaultChain(registry, skill, item.baseId, item.mana, base);
      moveset.slots[skill] = chain ? Math.max(old.slots[skill]!, base) : base;
    }
    return { ...item, moveset };
  };
  const equipped: EquippedGear = {};
  for (const slot of GEAR_SLOTS) {
    const item = profile.equipped[slot];
    if (item) equipped[slot] = fit(item);
  }
  const bag = profile.bag.map(fit);
  return { ...profile, equipped, bag, links: profile.links + links };
}
```

with:

```ts
/**
 * Every weapon's moveset fitted to the data: a weapon without one gets its
 * base defaults in its own mana; a chain its rarity no longer carries is
 * dropped, its extra slots back as Links (as salvaging would give); a newly
 * carried one gets its base default; and a basic chain's slots are raised to
 * its weapon's string. (A base whose string grew absorbs extras it can't tell
 * from its new base: the old base isn't stored, so those give no Links.)
 *
 * And its sockets (see the runes spec): a rune the data doesn't know, or the
 * second of one id on a move, is emptied; sockets past the rarity's cap are
 * trimmed from the end, and a dropped chain's go with it. Each socket that
 * goes comes back as a Link, and each known rune taken off leaves by the parts
 * rule in the balance's mode: back to the pouch ('pay') or destroyed
 * ('destroy', listed in `runesLost`). The pouch drops ids the data doesn't know.
 */
function fitMovesets(
  registry: DataRegistry,
  profile: DelveProfile,
): { profile: DelveProfile; runesLost: RuneRef[] } {
  let links = 0;
  const off: RuneRef[] = [];
  const known = (r: RuneRef | null): r is RuneRef => !!r && !!registry.findRune(r.id);
  const fitSockets = <M extends Move | Blow>(m: M, cap: number): M => {
    if (!m.runes) return m;
    const seen = new Set<string>();
    const runes = m.runes.map((r) => {
      if (!known(r)) return null;
      if (seen.has(r.id)) {
        off.push(r);
        return null;
      }
      seen.add(r.id);
      return r;
    });
    for (const r of runes.slice(cap)) {
      links++;
      if (r) off.push(r);
    }
    return { ...m, runes: runes.slice(0, cap) };
  };
  const fit = (item: GearItem): GearItem => {
    if (item.slot !== 'weapon') return item;
    const old = movesetOf(registry, item);
    const carried = carriedSkills(registry, item.rarity);
    const cap = socketCap(registry, item.rarity);
    const moveset: Moveset = { chains: {}, slots: {} };
    for (const skill of CHAIN_SKILLS) {
      const base = baseSlots(registry, item.baseId, skill);
      const chain = old.chains[skill];
      if (!carried.includes(skill)) {
        links += Math.max(0, (old.slots[skill] ?? base) - base);
        for (const m of chain ? (Array.isArray(chain) ? chain : chain.moves) : [])
          for (const r of m.runes ?? []) {
            links++;
            if (known(r)) off.push(r);
          }
        continue;
      }
      const set = moveset.chains as Record<ChainSkill, unknown>;
      set[skill] = !chain
        ? defaultChain(registry, skill, item.baseId, item.mana, base)
        : Array.isArray(chain)
          ? chain.map((b) => fitSockets(b, cap))
          : { ...chain, moves: chain.moves.map((m) => fitSockets(m, cap)) };
      moveset.slots[skill] = chain ? Math.max(old.slots[skill]!, base) : base;
    }
    return { ...item, moveset };
  };
  const equipped: EquippedGear = {};
  for (const slot of GEAR_SLOTS) {
    const item = profile.equipped[slot];
    if (item) equipped[slot] = fit(item);
  }
  const bag = profile.bag.map(fit);
  const pouch = Object.fromEntries(
    Object.entries(profile.runes).filter(([id]) => registry.findRune(id)),
  );
  const pay = registry.getDelveBalance().runes.unsocket === 'pay';
  return {
    profile: {
      ...profile,
      equipped,
      bag,
      links: profile.links + links,
      runes: pay ? addToPouch(pouch, off) : pouch,
    },
    runesLost: pay ? [] : off,
  };
}
```

Replace:

```ts
  const movesetReset = !weapon && CHAIN_SKILLS.some((s) => !sameChain(chains[s], unarmed[s]));
  const profile = fitMovesets(registry, { ...rest, version: 6, links, equipped });
  return { profile, fixed: [], dropped, movesetReset };
}
```

with:

```ts
  const movesetReset = !weapon && CHAIN_SKILLS.some((s) => !sameChain(chains[s], unarmed[s]));
  const fitted = fitMovesets(registry, { ...rest, version: 7, links, runes: {}, equipped });
  return { ...fitted, fixed: [], dropped, movesetReset };
}
```

Replace:

```ts
/**
 * Validate an unknown JSON blob as a save, migrating older ones (2 → 3 → 4 →
 * 5 → 6), and fit every weapon's moveset to the data (`fitMovesets`). To 4:
```

with:

```ts
/**
 * Validate an unknown JSON blob as a save, migrating older ones (2 → 3 → 4 →
 * 5 → 6 → 7), and fit every weapon's moveset to the data (`fitMovesets`). To 4:
```

Replace:

```ts
 * weapon (`fromV5`), and from a version 4 or older save every move is then
 * fixed to the pair. A dive in progress stays. Null when it doesn't fit.
 */
export function parseDelveProfile(registry: DataRegistry, raw: unknown): ParsedDelveProfile | null {
  const parsed = DelveProfileSchema.safeParse(raw);
  if (parsed.success)
    return {
      profile: fitMovesets(registry, parsed.data as DelveProfile),
      fixed: [],
      dropped: [],
      movesetReset: false,
    };
```

with:

```ts
 * weapon (`fromV5`), and from a version 4 or older save every move is then
 * fixed to the pair. To 7: an empty rune pouch. A dive in progress stays.
 * Null when it doesn't fit.
 */
export function parseDelveProfile(registry: DataRegistry, raw: unknown): ParsedDelveProfile | null {
  const parsed = DelveProfileSchema.safeParse(raw);
  const v6 = parsed.success ? null : DelveProfileV6Schema.safeParse(raw);
  const current = parsed.success
    ? (parsed.data as DelveProfile)
    : v6?.success
      ? ({ ...v6.data, version: 7, runes: {} } as DelveProfile)
      : null;
  if (current)
    return { ...fitMovesets(registry, current), fixed: [], dropped: [], movesetReset: false };
```

Replace:

```ts
  bagFull: boolean;
  newCodex: string[];
}

/** Put fresh loot in the bag, honouring auto-salvage and bag capacity. */
```

with:

```ts
  bagFull: boolean;
  newCodex: string[];
  /** Runes back to the pouch from melted weapons' sockets (see the runes spec). */
  runes: RuneRef[];
  /** Runes the melted weapons' sockets destroyed. */
  destroyed: RuneRef[];
}

/** Put fresh loot in the bag, honouring auto-salvage and bag capacity. */
```

Replace:

```ts
    bagFull,
    newCodex: recorded.newCodex,
  };
}
```

with:

```ts
    bagFull,
    newCodex: recorded.newCodex,
    runes: [],
    destroyed: [],
  };
}
```

Replace:

```ts
): { profile: DelveProfile; scrap: number; dust: number; links: number; count: number } {
  if (isDiveActive(profile)) return { profile, scrap: 0, dust: 0, links: 0, count: 0 };
```

with:

```ts
): {
  profile: DelveProfile;
  scrap: number;
  dust: number;
  links: number;
  count: number;
  /** Runes back to the pouch from the melted weapons' sockets (see the runes spec). */
  runes: RuneRef[];
  /** Runes their sockets destroyed. */
  destroyed: RuneRef[];
} {
  if (isDiveActive(profile))
    return { profile, scrap: 0, dust: 0, links: 0, count: 0, runes: [], destroyed: [] };
```

Replace:

```ts
    dust,
    links,
    count,
  };
}
```

with:

```ts
    dust,
    links,
    count,
    runes: [],
    destroyed: [],
  };
}
```

In `packages/engine/src/index.ts`:

Replace:

```ts
  ChainSchema,
  SLOT_FORMS,
} from './delve/profile-schema.js';
```

with:

```ts
  ChainSchema,
  RuneRefSchema,
  RunePouchSchema,
  SLOT_FORMS,
} from './delve/profile-schema.js';
```

- [ ] **Step 4: Run the suite and the typecheck**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1466 tests pass and 11 todo (1477) in 79 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-contract
(cd packages/engine && npx prettier --write src/types/delve.ts src/delve/profile.ts src/delve/stops.ts src/index.ts tests/delve-runes-contract.test.ts tests/delve-dive.test.ts tests/delve-movesets.test.ts tests/delve-pair.test.ts tests/delve-profile-abilities.test.ts tests/delve-reactions.test.ts tests/delve-chains.test.ts)
git add packages/engine/src/types/delve.ts packages/engine/src/delve/profile-schema.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/dive.ts packages/engine/src/delve/stops.ts packages/engine/src/index.ts packages/engine/tests/delve-runes-contract.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-movesets.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-profile-abilities.test.ts packages/engine/tests/delve-reactions.test.ts packages/engine/tests/delve-chains.test.ts
git commit -m "feat(engine): save v7: the rune pouch, sockets on moves and blows, and the load-time socket trims" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 8: The client, the verification, and what comes next

### Task 7: The client on the contract's bundle

The client reads the engine's bundle: rebuilt, it needs a `STOP_TEXT` entry for the new stop kind (a `Record<StopKind, …>`), and its store tests read version 7. The builder's beat readout moves to `moveBeat`, the same number while no rune is socketed. No version bump: nothing a player sees changes.

**Files:**
- Modify: `packages/client/src/features/delve/StopPanel.tsx`, `src/features/delve/chains/MoveEditor.tsx`, `src/stores/delveStore.test.ts`

- [ ] **Step 1: Rebuild the bundle and watch the client fail on it**

Run: `(cd packages/engine && npx tsup)`
Expected: `Build success` for ESM, CJS and DTS.

Run: `(cd packages/client && npx vitest run; npx tsc --noEmit -p .)`
Expected: FAIL, 3 failed and 778 passed (781), all in `src/stores/delveStore.test.ts` (the store now reads and writes version 7: `expected { version: 7, … } to match object { version: 6, … }`, `expected 7 to be 6`, and the `version: 4` save's `profile: { version: 6 }`); the typecheck prints one error: `src/features/delve/StopPanel.tsx(39,14): error TS2741: Property 'rune' is missing in type '{ equip: …; slot: …; move: …; upgrade: …; }' but required in type 'Record<StopKind, { icon: string; name: string; text: string; }>'.`

- [ ] **Step 2: The store's tests read version 7**

In `packages/client/src/stores/delveStore.test.ts`:

Replace:

```ts
    expect(loaded.profile).toMatchObject({
      version: 6,
```

with:

```ts
    expect(loaded.profile).toMatchObject({
      version: 7,
```

Replace:

```ts
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!).version).toBe(6);
```

with:

```ts
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!).version).toBe(7);
```

Replace:

```ts
    expect(loadDelveProfile()).toMatchObject({ gainedPair: false, profile: { version: 6 } });
```

with:

```ts
    expect(loadDelveProfile()).toMatchObject({ gainedPair: false, profile: { version: 7 } });
```

- [ ] **Step 3: Write the stop's text and the readout**

In `packages/client/src/features/delve/StopPanel.tsx`:

Replace:

```tsx
  upgrade: { icon: '⚒️', name: 'Upgrade', text: 'One forge upgrade of an item, for scrap.' },
};
```

with:

```tsx
  upgrade: { icon: '⚒️', name: 'Upgrade', text: 'One forge upgrade of an item, for scrap.' },
  rune: {
    icon: '💠',
    name: 'Socket a rune',
    text: 'One rune from your pouch into an open socket. Free.',
  },
};
```

In `packages/client/src/features/delve/chains/MoveEditor.tsx`:

Replace:

```tsx
  MOVE_KINDS,
  beatFor,
  blowNumbers,
  holdFull,
  moveNumbers,
  playedKind,
  takesElements,
```

with:

```tsx
  MOVE_KINDS,
  blowNumbers,
  holdFull,
  moveBeat,
  moveNumbers,
  takesElements,
```

Replace:

```tsx
  const beat = (a: ResolvedAbility) =>
    `then a ${secs(beatFor(bal, a.slot, playedKind(a), stats.tempo))} beat`;
```

with:

```tsx
  const beat = (a: ResolvedAbility) => `then a ${secs(moveBeat(bal, a, stats.tempo))} beat`;
```

- [ ] **Step 4: Run the client's suite, typecheck and build**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run && npx vite build)`
Expected: no type errors; 781 tests pass in 91 files; `✓ built`.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-contract
(cd packages/client && npx prettier --write src/features/delve/StopPanel.tsx src/features/delve/chains/MoveEditor.tsx src/stores/delveStore.test.ts)
git add packages/client/src/features/delve/StopPanel.tsx packages/client/src/features/delve/chains/MoveEditor.tsx packages/client/src/stores/delveStore.test.ts
git commit -m "feat(client): the contract's bundle: the rune stop's text, the beat readout from moveBeat, save v7" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: Verification: both suites green, every number unchanged

No edits; nothing to commit.

- [ ] **Step 1: Both suites and both typechecks**

```bash
cd /c/Projects/alloy-contract
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

Expected: the engine's typecheck prints nothing and 1466 tests pass and 11 todo (1477) in 79 files, `tests/delve-pacing.test.ts`'s 7 rails among them; the client's typecheck prints nothing and 781 tests pass in 91 files.

- [ ] **Step 2: The no-rune determinism check against the "before" files**

```bash
cd /c/Projects/alloy-contract
(cd packages/engine && npx tsup --out-dir node_modules/.runes-measure)
S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
M=C:/Projects/alloy-contract/packages/engine/node_modules/.runes-measure/index.js
mkdir -p $S/runes-wave0 && cd $S/runes-wave0
node $S/runes-before/snapshot.mjs $M after-depth10.json
node $S/runes-before/identical.mjs $S/runes-before/before-depth10.json after-depth10.json
node $S/runes-before/pacing.mjs $M > pacing-after.txt && diff $S/runes-before/pacing-before.txt pacing-after.txt && echo pacing identical
node $S/runes-before/first-dives.mjs $M > first-dives-after.txt && diff $S/runes-before/first-dives-before.txt first-dives-after.txt && echo first dives identical
node $S/runes-before/items-hash.mjs $M > items-hash-after.txt && diff $S/runes-before/items-hash-before.txt items-hash-after.txt && echo items identical
cd /c/Projects/alloy-contract && rm -rf packages/engine/node_modules/.runes-measure
```

Expected:

```text
runs 9144 ms …
rows 9144 before, 9144 after; differing 0
pacing identical
first dives identical
items identical
```

Any difference is a regression in this wave (a neutral knob that isn't, or a stream that moved): debug it, don't move on.

- [ ] **Step 3: Nothing stray**

Run: `git -C /c/Projects/alloy-contract status --short` and `git -C /c/Projects/alloy-contract log --oneline 81b0e31..`
Expected: a clean tree; six commits (Tasks 2–7).

## What waves 1 and 2 fill in

**The stubs** (each throws `Error('not built yet')`; nothing calls one in wave 0):

| Stub | File | Area | What replaces it |
|---|---|---|---|
| `runeTierAt(registry, depth, rng)` | `src/loot/runes.ts` | 1B | The highest tier whose `tierDepths` entry `depth` reaches, then `tierUp` (0.2) for one tier higher, at most V. |
| `rollRuneDrop(registry, { depth, kind, dropMult }, rng)` | `src/loot/runes.ts` | 1B | `dropChance[kind]` (normal and elite × `dropMult`, at most 1; a boss always 1): a uniform rune of `runes.json` at `runeTierAt(depth)`, else null. |
| `rollSockets(registry, item, moveset, rng)` | `src/loot/runes.ts` | 1B | Opens `socketDrops[rarity]` sockets (a uniform count in the range), spread uniformly over the moves and blows of the carried chains, never past `socketCap`, all `null`. Called in `generateItem` after the moveset, from `rng.fork('sockets')`. |
| `weaponParts(registry, weapon)` | `src/loot/runes.ts` | 1B | `{ links: extraSlots + open sockets, runes: the socketed runes }`; `addLootToBag`, `salvageItems` and `fuseGear` use it in place of `extraSlots`. |
| `unsocketMode(registry, override?)` | `src/delve/runes.ts` | 1B | `override ?? balance.delve.runes.unsocket`. |
| `runeChange(registry, profile, chains, opts?)` | `src/delve/runes.ts` | 1B | The rune diff per origin pair: sockets opened (priced by index), pulls and sockets, removed moves' sockets as `refundLinks`; its refusals (cap, closing, fit, the same rune twice, unknown ids, the pouch). |
| `draftPrice(registry, profile, chains, opts?)` | `src/delve/runes.ts` | 1B | `{ dust, links, scrap, refundLinks, destroys, returns }` from `editPrice` and `runeChange`, as `setChains` charges. |
| `openSocket(registry, profile, skill, index)` | `src/delve/runes.ts` | 1B | One socket on a move of the equipped weapon for `socketPrice`'s Links and scrap; refusals at the cap, unarmed, mid-dive, unpaid. |
| `socketRune(registry, profile, skill, index, socket, rune, opts?)` | `src/delve/runes.ts` | 1B | One `setChains` with positional origins putting a pouch rune in an open socket. |
| `fusePrice(registry, ref)` / `fuseRunes(registry, profile, ref)` | `src/delve/runes.ts` | 1B | `fuseScrap[tier − 1]` (null at V); `fuseCount` of `ref` into one of the next tier for that scrap, refused mid-dive or short. |
| `dropRune(ctx, m)` | `src/arpg/rune-drops.ts` | 1B | `rollRuneDrop` on `world.runeRng`, spawning a `Drop` of kind `'rune'`; called once inside `killMonster`'s `!world.sandbox` guard. |
| `knobHitOpts(k)` | `src/arpg/abilities/impact.ts` | 1A | `{ leech: k.lifesteal, catalyst: k.catalyst, manaOnHit: k.manaOnHit }`, used by `hitOpts`, Armor's strike-back and the blows. |
| `guardLand(ctx, knobs)` | `src/arpg/abilities/defend.ts` | 1A | A barrier of `guardOnLand × maxHp` for `guardSeconds` when it is at least the barrier left (or there is none), else nothing; called from `fire` and `strike`. |
| `queueEcho(ctx, echo)` / `echoTick(ctx)` | `src/arpg/abilities/echo.ts` | 1A | Push onto `world.echoes`; run each due echo through `executeForm` (a move's copy at `power × echo`, no echo or Guard, the facing restored) or `landBlow`; `echoTick` called right after `castTick`. |

**Neutral placeholders the later waves give their real values** (not stubs: they work today, at no effect):

| Placeholder | File | Area | What it becomes |
|---|---|---|---|
| `ResolvedAbility.runes: []`, the knobs merged without runes | `src/arpg/abilities/resolve.ts` | 1A | `runeKnobs` merged after the legendaries; `count += extraShots.count` on Volley and Barrage with `extraShotPower`; `stacks += stacksBonus`; `quick` into cooldown, conjure, channel and castTime; `runes: active` (an infinite pierce's Pierce left out). |
| `HeroBlow.knobs: NEUTRAL`, `runes: []` | `src/delve/hero-stats.ts` (`computeHeroStats`) | 1A | Each blow's `runeKnobs` on `{ weapon, kind, explode }` merged. |
| `HitOpts.catalyst`, `manaOnHit`; `ImpactOpts.shard`; `Projectile.knobs`, `form: 'shard'`; `world.echoes`; `hero.drained`; the `runeFx` event | `combat.ts`, `impact.ts`, `step.ts`, `basic.ts`, `cast.ts`, `forms.ts` | 1A | Volatile in `react`, Drain in `hitMonster`, shards, a basic shot's knobs, echoes, Drain's per-skill count, the flash events. |
| `Drop.rune`, `DropKind 'rune'`, `pickup.rune`, `world.pending.runes`, `world.runeRng` | `step.ts` (`dropsTick`), `combat.ts` (`killMonster`) | 1B | The rune pickup case (no magnet), `dropRune`'s spawn. |
| `BankResult.runes: []`, `DiveState.runesEarned` (0) | `src/delve/dive.ts` | 1B | `bankWorld` adds `pending.runes` to the pouch and counts them. |
| `BagInsertResult`, `salvageItems`' result and `ProfileActionResult`: `runes`, `destroyed` (empty) | `src/delve/profile.ts`, `moveset.ts` | 1B | The parts rule's returns and losses (`weaponParts`, `opts.unsocket`). |
| `stopKinds`' `rune: false`; `STOP_KINDS` without `'rune'` | `src/delve/stops.ts` | 1B | The fifth kind's rule, `'rune'` appended to `STOP_KINDS`, `StopAction`'s `rune` variant in `runStop`, the `'move'` stop copying the saved runes. |
| `setChains`, `movesetEditPrice`, `editPrice`, `transferMoveset`, `salvageItems`, `fuseGear` at today's signatures | `src/delve/moveset.ts`, `profile.ts` | 1B | Origins and `opts.unsocket` (the spec's signatures). |
| Power without rune terms; the autopilot without runes; no `'rune'` Lab view | `hero-stats.ts`, `autopilot.ts`, `dps-sim.ts` | 2D | The spec's `damagePerUse` and `estimateCombat` terms, the rune policy and stop preference, the Lab's rune axis (`moveBeat` is already in `useInterval`). |
| `STOP_TEXT.rune` (text only); `runesLost` unread; `runesEarned` unshown | `StopPanel.tsx`, `stores/delveStore.ts`, `DiveSummary.tsx` | 2E | The stop's `RunePick`, the load-time trims' toasts, the dive summary's runes. |
| `runeFx` events and rune drops undrawn; no HUD pips | `features/delve/arena/**` | 2F | The flashes, the drop sprites and sound, `AbilityHud.runes` and `basicRunes`. |
