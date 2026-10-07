# Delve boons · Phase A: the contract — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the overview's contract so B1, B2, B3 and C1, C2, C3 work in parallel without editing each other's files, with **nothing changed in play**: `types/boon.ts`; `boons.json` with the six shrines as rows (in `shrines.json`'s order, so the generator draws the same); `shrines.json`, `ShrineDef`, `ShrineId`, `ShrineEffect` and `getDelveData().shrines` gone, every reader on the boon rows; `Buff` as `{ boon, tier, effect }`; the registry's `getBoons`, `getBoon`, `shrineBoons`; `BoonEffectSchema` with every field, `BuffSchema`, `BoonDefSchema`, `BoonsDataSchema`, `BoonsBalanceSchema` and `balance.json → delve.boons`; `buffSum` and `boonCount`; `HeroEntity.boon`; `HeroStatsExtra.boonKnobs` merged into every blow and `HeroStats.boonKnobs` into every move; the `stackTime` knob (neutral); `diveStats`, worn by `beginFloor` and `takeAlcove`; the `DiveStop` union with every reader narrowed (engine and client), `StopAction`'s `boon` (refused) and `DoorMods.boons`; the `hit` event's `echo` flag; `boonsProblems` refused at load; save v13; the client on the new bundle. The suites stay green and a whole-autopilot fingerprint is identical before and after.

**Architecture:** A boon is a generalised shrine blessing. `types/boon.ts` holds the contract's types; `boons.json` its rows, of which only the six shrine rows exist in A (B1 adds the stop rows). Every new field is inert with no boon worn: `buffSum([])` is neutral, `boonKnobs` is `[]` (a blow with no runes keeps the shared `NEUTRAL`, a move's `mergeKnobs` gets the same parts), `diveStats` adds no attunement, every stop still rolls `kind: 'powerups'` and a `boon` action is refused. So the only things that move are shapes (a `Buff`'s, a stop's, the save's version); the fingerprint probe reads those shapes back as the old ones and must print the same hashes.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, React 19, Zustand 5.

**Spec:** `docs/superpowers/specs/2026-10-06-delve-boons-design.md` (authoritative), sections 1, 2, 2a, 4 and 8 (the `echo` flag). The overview is `00-overview.md` in this folder; its "The contract" is what this file lands.

---

## Base

- **Starts from:** `main` at `d3b5e447` (the spec and its reviews; save v12), in this area's worktree `C:/Projects/alloy-boons-a` on branch `boons/a`, its `node_modules` junctioned to the main checkout's (the room objects' `mkwt.ps1`; a copy sits at `C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/40eae1ba-9296-44c8-9c7b-c2e0e4edb2b6/scratchpad/mkwt.ps1`):

```powershell
& C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/40eae1ba-9296-44c8-9c7b-c2e0e4edb2b6/scratchpad/mkwt.ps1 -Name alloy-boons-a -Branch boons/a -Base d3b5e447
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-boons-a` in Git Bash. Remove it at the end with `rmdir /s /q` from cmd then `git worktree prune` (never `git worktree remove --force`: it follows the junctions).
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
```

  Expected: tsup's "Build success" lines (ESM, CJS and DTS); no type errors; the engine suite **Test Files 1 failed | 130 passed | 1 skipped (132); Tests 2 failed | 1699 passed | 5 skipped (1706)**, about 13 minutes. The two failures are at the base already: `delve-pacing-robust.test.ts > the pacing targets with undefined × 0.8 > the first legendary follows the first essence within two visits, and three seeds in four forge an epic by dive 8` (seed 3, then seed 1: `expected false to be true`). They are pacing, not Phase A's (D re-measures); every count below carries them. The client suite **146 passed (146) files, 1361 passed (1361) tests**. Run nothing else heavy while the engine suite runs.
- **The fingerprint, before:** save this probe outside the worktree, as `/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/40eae1ba-9296-44c8-9c7b-c2e0e4edb2b6/scratchpad/boons-a-probe.test.ts` (never committed; Tasks 2, 4, 5, 6, 7 and 9 run it again). It is the room objects' probe with one addition, `norm`, which reads the new shapes as the old ones (a `Buff`'s `boon` and `tier` as its `shrine`; a stop's `kind: 'powerups'` dropped), so the hash moves only if play does:

```ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot, type AutopilotOptions } from '../src/delve/autopilot.js';

// Scratch parity probe: a fingerprint of whole autopilot runs (every floor's sim), the save's
// version left out. `norm` reads the boons' shapes as the old ones (a Buff's `boon` and `tier` as
// its `shrine`, a stop's `kind: 'powerups'` dropped), so the hash is the same before and after
// Phase A only if play is.
const norm = (_k: string, v: unknown) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if ('boon' in o && 'tier' in o && 'effect' in o) return { shrine: o.boon, effect: o.effect };
    if (o.kind === 'powerups' && 'offers' in o) {
      const { kind: _k2, ...rest } = o;
      return rest;
    }
  }
  return v;
};
it('probe', () => {
  const registry = createDefaultRegistry();
  const runs: Record<string, AutopilotOptions> = {};
  for (const primary of ['fire', 'frost', 'earth'] as const)
    for (const seed of [1, 2]) runs[`${primary}:${seed}`] = { seed, dives: 4, primary };
  runs['beeline:3'] = { seed: 3, dives: 4, primary: 'storm', policy: 'beeline' };
  runs['tutorial:1'] = { seed: 1, dives: 3, primary: 'fire', tutorial: true };
  const out: Record<string, string> = {};
  for (const [k, opts] of Object.entries(runs)) {
    const r = runAutopilot(registry, opts);
    const { version: _v, ...rest } = r.profile as unknown as Record<string, unknown>;
    out[k] =
      createHash('sha1').update(JSON.stringify(r.reports, norm) + JSON.stringify(r.economy, norm) + JSON.stringify(rest, norm)).digest('hex') +
      ' ' + r.reports.map((x) => `${x.endDepth}/${x.kills}/${x.floorSeconds.toFixed(3)}`).join(',');
  }
  writeFileSync(process.env.PROBE_OUT!, JSON.stringify(out, null, 1));
}, 900000);
```

```bash
cd /c/Projects/alloy-boons-a
P=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/40eae1ba-9296-44c8-9c7b-c2e0e4edb2b6/scratchpad
cp $P/boons-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/boons-a-before.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
cat $P/boons-a-before.json
```

  Expected: the probe passes (about 35 s), and the file reads:

```json
{
 "fire:1": "d7ae374aae2dde701c6650d8331b287852c015f0 5/94/279.000,5/89/241.000,14/174/400.000,22/300/779.000",
 "fire:2": "43b5b93f8d153480f6a18b0aef76501f9cc039a0 5/97/257.000,13/157/357.000,20/288/839.000,23/104/179.000",
 "frost:1": "dbf2adf6ae2dc1edeeb311a5e5609f184b60fed7 5/100/262.000,5/87/196.000,12/133/347.000,22/248/557.000",
 "frost:2": "2eddf278c4f577f3b0efb15e7d50bf652bfa2508 5/97/244.000,10/93/218.000,17/275/742.000,19/113/302.000",
 "earth:1": "906c27178ccc94087e3cef697f520b0a33edbcb9 5/104/296.000,5/89/212.000,20/366/1258.000,20/135/319.000",
 "earth:2": "833412cd27102ea7eee0de5aec70b5938ef4e0a6 5/89/236.000,5/95/226.000,12/156/400.000,14/114/214.000",
 "beeline:3": "ecff211d06c1c83bb0e4f910e9005f8faa852866 5/35/159.000,5/53/135.000,10/68/202.000,14/139/311.000",
 "tutorial:1": "d0d43d655e8e4ca6af6cbbd26a868feef95300b9 3/9/35.000,5/24/64.000,10/81/233.000"
}
```

  Call this the **fingerprint check**: the same three commands with `boons-a-after.json`, then `cmp $P/boons-a-before.json $P/boons-a-after.json` printing nothing. (Without `norm` the hash would move at Task 2, since a saved `Buff` changes shape; the depth/kills/seconds after each hash never move.)

## Files

| File | Change |
|---|---|
| `packages/engine/src/types/boon.ts` (new) | the contract's types, plus `BoonsBalance` (Task 1) |
| `packages/engine/src/data/boons.json` (new) | the six shrine rows (Task 1) |
| `packages/engine/src/data/schemas.ts` | `BoonEffectSchema`, `BoonDefSchema`, `BoonsDataSchema`, `BoonsBalanceSchema` (Task 1); `BuffSchema` replaced, `ShrineEffectSchema` and `ShrinesDataSchema` gone (Task 2); `stackTime` in `KnobsSchema` (Task 4); a door's `boons` (Task 6); `KnobsSchema` exported, `boons` in `DelveBalanceSchema` (Task 8) |
| `packages/engine/src/data/loader.ts`, `registry.ts` | `LoadedData.boons`, `getBoons`, `getBoon`, `shrineBoons` (Task 1); `shrines` gone (Task 2) |
| `packages/engine/src/data/shrines.json` | deleted (Task 2) |
| `packages/engine/src/types/floor-map.ts`, `types/index.ts`, `types/delve.ts` | `ShrineId`, `ShrineEffect`, `ShrineDef` and the old `Buff` gone, `Buff` re-exported from boon.ts, `Interactable.shrine: BoonId`, `DelveData.shrines` gone, the barrel exports boon.ts (Task 2) |
| `packages/engine/src/arpg/layout/generate.ts`, `arpg/interact.ts`, `arpg/tutorial-floor.ts` | the shrine readers on the boon rows (Task 2) |
| `packages/engine/src/delve/boons.ts` (new) | `buffSum`, `boonCount` (Task 3) |
| `packages/engine/src/types/arpg.ts`, `arpg/world.ts`, `arpg/interact.ts` | `HeroEntity.boon`, set at creation and by `applyShrine` (Task 3); the `hit` event's `echo` (Task 7) |
| `packages/engine/src/types/ability.ts`, `arpg/abilities/resolve.ts` | `Knobs.stackTime`, `NEUTRAL`, `mergeKnobs`; `resolveAbility` appends `stats.boonKnobs` (Task 4) |
| `packages/engine/src/delve/hero-stats.ts`, `types/delve.ts` | `HeroStatsExtra.boonKnobs`, `HeroStats.boonKnobs`, the blows' merge (Task 4); `pairExtra`'s attunement (Task 5) |
| `packages/engine/src/delve/pair.ts`, `delve/dive.ts`, `delve/stops.ts` | `diveStats`; `beginFloor` and `takeAlcove` wear it (Task 5) |
| `packages/engine/src/types/delve.ts`, `delve/stops.ts`, `delve/autopilot.ts`, `delve/dive.ts`, `delve/tutorial.ts`, `delve/profile-schema.ts` | the `DiveStop` union, `BoonStop`, `PowerupStop`, `DoorMods.boons`; `StopAction`'s `boon`; every reader narrowed; the save's stop and door (Task 6) |
| `packages/engine/src/arpg/combat.ts`, `arpg/basic.ts`, `arpg/step.ts`, `arpg/abilities/impact.ts`, `arpg/abilities/forms.ts` | `HitOpts.echo` from the echo sites onto the `hit` event; a `replay` Strike's `slash` (Task 7) |
| `packages/engine/src/data/boons-check.ts` (new), `data/default-registry.ts`, `data/balance.json` | `boonsProblems` refused at load; `delve.boons` (Task 8) |
| `packages/engine/src/delve/profile.ts`, `delve/profile-schema.ts`, `types/delve.ts` | save v13 (Task 9) |
| `packages/engine/src/index.ts` | `buffSum`, `boonCount` (Task 3), `diveStats` (Task 5); boon.ts's types and consts through the type barrel (Task 2) |
| `packages/engine/tests/delve-boons-a-{data,shrines,sum,knobs,dive-stats,stop,echo,check,save}.test.ts` (new) | each task's tests |
| `packages/engine/tests/delve-maps-{data,flow,interact,buffs,save,generate}.test.ts` | the shrines' readers (Task 2) |
| `packages/engine/tests/ability-resolve.test.ts` | `stackTime` in the neutral knobs (Task 4) |
| `packages/engine/tests/delve-{stops,banking,rune-power,runes-contract,runes,autopilot-crafting,tutorial-runner-dive,tutorial-runner-rule,tutorial-runner-script,tutorial-save}.test.ts` | `kind: 'powerups'` on their stops (Task 6) |
| `packages/engine/tests/delve-{dive,maps-save,pair,profile-abilities,quests-save,room-save,runes-contract,save-v8,tutorial-save}.test.ts` | version 13 (Task 9) |
| `packages/client/src/features/delve/arena/useArena.ts`, `arena/useArenaCore.ts`, `StopPanel.tsx`, `arena/FloorDialogs.tsx`, `stop/StopScreen.tsx`; tests `arena-hud-snapshot`, `StopPanel`, `StopScreen`, `DelveRun`, `delveStore` | the client on the new bundle (Task 10) |

## What Phase A implements, and what it leaves

**Implemented (and tested):** everything in the overview's contract, each name and shape as written there; `BoonEffectSchema` takes every field of the spec's §2 table in its units (a test parses one effect holding all of them); `buffSum` complete by the stacking rule, with its tests; `boonCount`; `HeroEntity.boon` at creation (`buffSum(diveBuffs)`: the floor's buffs start empty) and after every `applyShrine`; `diveStats` and its two callers; the boon knobs on blows and moves; `stackTime` (neutral, additive, in the schema; nothing reads it yet); the stop union and the refused `boon` action; the echo flag; `boonsProblems` (unique ids, three tiers each with text, knob keys, attunement roles, cap 1–3); `delve.boons`; save v13; the client compiling and green on the new bundle.

**Left for the areas (each inert or absent in A):**

| What | Where | Area | In A |
|---|---|---|---|
| the stop rows (the first batch) and their load checks (a family with no stop row, identical tiers, the shrine-field rule) | `boons.json`, `boons-check.ts` | B1 | the six shrine rows; five checks |
| `rollBoons`, `rollStop`'s `boons` stops, `takeStop`'s `boon` take | `delve/boons.ts`, `delve/stops.ts` | B1 | every stop `kind: 'powerups'`; `boon` refused ("Not offered at this stop") |
| `DoorMods.boons` on Gilded Halls (0.5) and Champion's Den (0.3) | `delve.json` | B1 | the field in both schemas (data and save); no door sets it |
| the bot on boons stops, `EconomyRow.boons` | `delve/autopilot.ts`, `delve/economy.ts` | B1 | `bestStop` and `takeGuidedStop` pass over a `boons` stop |
| every combat field's handler (`applyBuffs`' new fields, `byKind`, `firstMove`, `stepBonus`, `lowLife`, `nearFoes`, the dodge's, `freeCast`, `bloodPrice`, `defendDuration`, `lastStand`, `stackTime`) | B2's files | B2 | `HeroEntity.boon` holds them; nothing reads them |
| every world field's handler (`find`, `magnet`, the drops', `deathLoss`, `noPotions`, `barrierOnFloor`, `eliteChance`, `skip`, `healOnClear`, `shrinesLastDive`, `exitRevealed`, `noSlow`, `hazardsFriendly`) | B3's files | B3 | as above (`world.ts` still sums a dive entry's `find`, as before) |
| `BoonCards`, the boons step | `features/delve/stop/` | C1 | `StopScreen` treats a `boons` stop as no power-up (straight to the road) |
| the HUD's boon tile, the pause's and `DiveSummary`'s list | C2's files | C2 | `HudBuff`'s `'shrine'` kind unchanged, its name from `getBoon` |
| the echo hit's hit-stop, kick and sound, `HIT_FX_BUDGET` | C3's files | C3 | the event carries `echo: true` |

## Where the code moved the contract (additions only; nothing in the overview changed)

1. **`BoonsBalance`** (`{ offers; tierWeights: { fromDepth; weights: [n, n, n] }[] }`) lives in `types/boon.ts` beside the rest, and `DelveBalance.boons` is it.
2. **`BoonStop` and `PowerupStop`** (`types/delve.ts`) are `Extract`s of the union, exported for the client: `StopPanel`'s prop is a `PowerupStop` (C1 asked).
3. **The door's `boons` schema is inline**, like every other door mod: `DelveDataSchema`'s door `mods` object (`z.number().min(0).max(1).optional()`) and the save's `DoorSchema` in `profile-schema.ts` (which strips unknown keys, so it needed the field too). There is no named `DoorModsSchema`.
4. **`buffSum`'s compound fields.** The spec's rule names counts, bonuses, multipliers and `hazardsFriendly`; the four object fields need one more line: their bonus part sums (`lowLife.mult`, `nearFoes.per`, `freeCast.damage`) and their shape takes the largest (`below`, `cap`, `radius`, `seconds`, `lastStand.reduce`). A compounding field keeps its unit in the sum: `damage`, `manaRegen` and `maxLife` are Π(1 + x) − 1, `tempo` is 1 − Π(1 − x), so B2 reads `1 + sum.damage` as it would one entry's (B2's per-entry floors, `maxLife` at 0.3 and `tempo` at 0.5, apply to the product). `byKind` sums per kind, flags OR, `attune` sums by role, `knobs` lists each entry's partial in order. A field no entry sets is absent; `buffSum([])` is exactly `{ knobs: [], attune: { primary: 0, secondary: 0 } }`.
5. **`getBoon(id)` returns `BoonDef | undefined`** and never throws; `tutorial-floor.ts` reads `getBoon('vigor')!.id`.
6. **`applyShrine(registry, world, shrine: BoonDef)`** keeps its `duration === 'dive'` branch and grants tier 1 (`shrine.tiers[0]`): its `Buff` is `{ boon: shrine.id, tier: 1, effect }`, and it rebuilds `h.boon = buffSum([...h.diveBuffs, ...h.floorBuffs])`. The prompt is `${name}: ${tiers[0].text}`, the same text as before.
7. **`KnobsSchema` is exported** from `schemas.ts`: `boonsProblems` reads its keys (`KnobsSchema.shape`), so the knob-key check can't drift from the schema. `boons-check.ts` builds a local `problems` array (B1 appends its checks to it).
8. **The `hit` event's `echo`** is set at four sites: `hitOpts` (every hit of a `replay` ability, its chain jumps included), `landBlow`'s melee hits (`o.echo`), and a basic shot's direct hit and burst (`p.replay`). `HitOpts.echo?: true` carries it to `hitMonster`, which adds `echo: true` only when set.
9. **The index** exports every type and const of `types/boon.ts` through the type barrel (`export * from './boon.js'` in `types/index.ts`, from Task 2: in Task 1 the old `Buff` in `floor-map.ts` would clash with it), and `buffSum`, `boonCount`, `diveStats`. `PowerupStop`, `BoonStop`, `BoonsBalance` and `BOON_FAMILIES` come through the barrel.
10. **`DoorMods.boons` has no data in A**: the road lists a door's mods (`doorTerms` in the client), so B1 sets the numbers together with their term.
11. **The dive's live hero refresh wears `diveStats`** (Task 10): `arena/useArena.ts`'s `loadout` memo, the one `profileStats` call that builds the live dive hero (`useArenaCore.ts` has none; the Training Grounds and the Anvil keep theirs). Its dependency is a string key of the worn boons (`boon:tier` joined), not `dive.diveBuffs` itself: `bankWorld` builds a new `diveBuffs` array on every bank, so the array as a dependency would refresh the hero at every bank.

## Needs routed

- **`delve.json`'s doors** (B1): `"boons": 0.5` on `gilded`, `0.3` on `champions`, with the road's term.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `boons/a`, staged by path, never `git add -A`; the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-boons-a`.
- **Prettier:** `npx prettier --end-of-line auto --write` only on the files a task creates and on files that pass `prettier --check` at the base. **Never** run it on `packages/engine/src/delve/autopilot.ts`, `delve/dive.ts`, `delve/hero-stats.ts` or `tests/delve-autopilot-crafting.test.ts` (they fail `--check` at the base, and `--write` reformats lines nobody touched), nor on `balance.json` (hand-edited only). The code below is already formatted as the files want it; type it as written.
- **How the edits read:** "In `f`:" names the file for the edits under it. "Replace:" (a block) "with:" (a block) is one Edit (old, new). "Create `f`:" is a Write. Within a file, apply its edits top to bottom; every old block is unique in its file at that point (each was checked against the scratch copy's parent commit, in order).
- **Parity is the rule:** nothing in Tasks 1–10 changes a number in play. The fingerprint check runs after Tasks 2, 4, 5, 6, 7 and 9 (it was identical after each on the scratch copy).
- **Tests aren't typechecked:** the engine's `tsconfig.json` covers `src/` only, so a test literal in an old shape fails when it runs, not in `tsc`; each task lists the test files whose literals it updates.
- **The client follows the bundle.** Tasks 1–9 never rebuild `packages/engine/dist`, so the client stays green on the base bundle through them. Task 10 rebuilds it: against the new bundle the client's typecheck fails in 9 files (26 errors) until Task 10's edits.
- **Checked on a scratch copy:** a worktree at `d3b5e447` (`C:/Projects/alloy-boons-draft-a`, since removed), every task applied in order and committed; every FAIL, PASS, count, typecheck and fingerprint below is what it printed. The edits below are those commits' diffs, replayed against each parent.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Some engine test files | `(cd packages/engine && npx vitest run tests/<file>.test.ts … --reporter=dot)` |
| All engine tests | `(cd packages/engine && npx vitest run --reporter=dot)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine bundle (the client's) | `(cd packages/engine && npx tsup)` |
| Client typecheck / tests | `(cd packages/client && npx tsc --noEmit -p .)` / `(cd packages/client && npx vitest run --reporter=dot)` |

---

## Tasks

### Task 1: The boon types, `boons.json`, its schemas and the registry

`types/boon.ts` exactly as the contract writes it (plus `BoonsBalance`), `boons.json` with the six shrine rows (ids, names and order as `shrines.json`'s; `family` as the contract assigns; `cap` 1; `shrine` the old weight; every stop `weight` 0; the effect and the old prompt text in all three tiers), the boon schemas, and the registry's three readers. `shrines.json` stays for now (Task 2 moves its readers), and `types/boon.ts` stays out of the type barrel until Task 2 (its `Buff` would clash with `floor-map.ts`'s old one), so the tests import it directly. Nothing reads the new data yet.

**Files:**
- Create: `packages/engine/tests/delve-boons-a-data.test.ts`
- Create: `packages/engine/src/data/boons.json`
- Modify: `packages/engine/src/data/loader.ts`
- Modify: `packages/engine/src/data/registry.ts`
- Modify: `packages/engine/src/data/schemas.ts`
- Create: `packages/engine/src/types/boon.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-boons-a-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { BoonEffectSchema, BoonsDataSchema } from '../src/data/schemas.js';
import boonsData from '../src/data/boons.json';
import type { BoonDef } from '../src/types/boon.js';

// See the boons spec, "1. The boon row": one file, `boons.json`, the six shrines its first rows.

const registry = createDefaultRegistry();
const ok = (schema: { safeParse: (x: unknown) => { success: boolean } }, x: unknown) =>
  schema.safeParse(x).success;

/** A stop row: one tier's effect copied into all three. */
const row = (o: Partial<BoonDef> = {}): BoonDef => {
  const tier = { text: '+10% damage', effect: { damage: 0.1 } };
  return {
    ...{ id: 'a', name: 'A', family: 'offense', duration: 'dive', cap: 1 },
    ...{ weight: { common: 1, rare: 1, epic: 1 }, tiers: [tier, tier, tier] },
    ...o,
  } as BoonDef;
};

describe('boons.json and the registry', () => {
  it("holds the six shrines first, in shrines.json's order, each a shrine and never at a stop", () => {
    const shrines = registry.shrineBoons();
    expect(shrines.map((b) => [b.id, b.shrine, b.duration, b.family])).toEqual([
      ['vigor', 3, 'floor', 'offense'],
      ['renewal', 3, 'floor', 'defense'],
      ['clarity', 3, 'floor', 'tempo'],
      ['fortune', 2, 'floor', 'fortune'],
      ['mercy', 2, 'floor', 'fortune'],
      ['devotion', 1, 'dive', 'offense'],
    ]);
    expect(registry.getBoons().slice(0, 6)).toEqual(shrines);
    for (const b of shrines) {
      expect(b.cap).toBe(1);
      expect(b.weight).toEqual({ common: 0, rare: 0, epic: 0 });
      expect(b.tiers[1]).toEqual(b.tiers[0]);
      expect(b.tiers[2]).toEqual(b.tiers[0]);
    }
    expect(shrines.map((b) => b.tiers[0].effect)).toEqual([
      { damage: 0.2 },
      { lifeRegen: 0.01 },
      { manaRegen: 0.5 },
      { find: 50 },
      { potions: true },
      { damage: 0.1 },
    ]);
  });

  it('finds a row by id, and gives undefined for an unknown one', () => {
    expect(registry.getBoon('mercy')?.name).toBe('Shrine of Mercy');
    expect(registry.getBoon('nope')).toBeUndefined();
  });
});

describe('BoonsDataSchema and BoonEffectSchema', () => {
  it('takes the shipped rows and refuses repeated ids, an empty or unknown effect, and a refill for the dive', () => {
    expect(ok(BoonsDataSchema, boonsData)).toBe(true);
    expect(ok(BoonsDataSchema, [row(), row({ id: 'b' })])).toBe(true);
    expect(ok(BoonsDataSchema, [row(), row()])).toBe(false);
    const tiers = (effect: object) => [0, 1, 2].map(() => ({ text: 'x', effect }));
    expect(ok(BoonsDataSchema, [row({ tiers: tiers({}) as BoonDef['tiers'] })])).toBe(false);
    expect(ok(BoonsDataSchema, [row({ tiers: tiers({ haste: 1 }) as BoonDef['tiers'] })])).toBe(
      false,
    );
    const refill = tiers({ potions: true }) as BoonDef['tiers'];
    expect(ok(BoonsDataSchema, [row({ tiers: refill, duration: 'floor' })])).toBe(true);
    expect(ok(BoonsDataSchema, [row({ tiers: refill, duration: 'dive' })])).toBe(false);
  });

  it('refuses a cap of 4, an unknown family and two tiers', () => {
    expect(ok(BoonsDataSchema, [row({ cap: 4 as never })])).toBe(false);
    expect(ok(BoonsDataSchema, [row({ family: 'luck' as never })])).toBe(false);
    expect(ok(BoonsDataSchema, [row({ tiers: row().tiers.slice(0, 2) as never })])).toBe(false);
  });

  it('takes every field of the first batch in its units', () => {
    const all = {
      ...{ damage: 0.25, manaRegen: 0.2, lifeRegen: 0.01, maxLife: -0.2, tempo: 0.08 },
      ...{ lifesteal: 0.015, bloodPrice: 0.5, attune: { role: 'secondary', points: 4 } },
      ...{ knobs: { catalyst: 0.25, quick: { cooldown: 0.92 }, echo: 0.15 } },
      ...{ byKind: { heavy: 0.2, hold: 0.2 }, firstMove: 0.25, stepBonus: 0.05 },
      ...{ lowLife: { below: 0.25, mult: 0.4 }, nearFoes: { per: 0.05, cap: 4, radius: 4 } },
      ...{ dodgeCharges: -1, dodgeWindow: 0.3, dodgeRecharge: 0.15, perfectAlways: true },
      ...{ freeCast: { seconds: 1.5, damage: 0 }, defendDuration: 0.25, barrierOnFloor: 0.08 },
      ...{ healOnClear: 0.04, lastStand: { below: 0.2, reduce: 0.4, seconds: 2 } },
      ...{ find: 25, magnet: 0.4, metalUp: 0.1, flux: 1.3, runes: 1.3, gear: 1.5, scrap: 0.2 },
      ...{ deathLoss: 0.1, potions: true, noPotions: true, eliteChance: 1, skip: 1 },
      ...{ exitRevealed: true, shrinesLastDive: true, noSlow: true, hazardsFriendly: 0.5 },
    };
    expect(BoonEffectSchema.safeParse(all).error).toBeUndefined();
    expect(ok(BoonEffectSchema, { attune: { role: 'tertiary', points: 4 } })).toBe(false);
    expect(ok(BoonEffectSchema, { knobs: { haste: 1 } })).toBe(false);
    expect(ok(BoonEffectSchema, { maxLife: -1 })).toBe(false);
    expect(ok(BoonEffectSchema, { tempo: 1 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx vitest run tests/delve-boons-a-data.test.ts --reporter=dot)
```

Expected: the file fails to load, `Failed to resolve import "../src/data/boons.json"` (or, with `boons.json` present, `5 failed`: `TypeError: registry.shrineBoons is not a function`, `registry.getBoon is not a function`, and three `Cannot read properties of undefined (reading 'safeParse')`).

- [ ] **Step 3: Implement**

Create `packages/engine/src/data/boons.json`:

```json
[
  {
    "id": "vigor",
    "name": "Shrine of Vigor",
    "family": "offense",
    "duration": "floor",
    "cap": 1,
    "shrine": 3,
    "weight": { "common": 0, "rare": 0, "epic": 0 },
    "tiers": [
      { "text": "+20% damage for this floor", "effect": { "damage": 0.2 } },
      { "text": "+20% damage for this floor", "effect": { "damage": 0.2 } },
      { "text": "+20% damage for this floor", "effect": { "damage": 0.2 } }
    ]
  },
  {
    "id": "renewal",
    "name": "Shrine of Renewal",
    "family": "defense",
    "duration": "floor",
    "cap": 1,
    "shrine": 3,
    "weight": { "common": 0, "rare": 0, "epic": 0 },
    "tiers": [
      { "text": "Regain 1% of your life a second for this floor", "effect": { "lifeRegen": 0.01 } },
      { "text": "Regain 1% of your life a second for this floor", "effect": { "lifeRegen": 0.01 } },
      { "text": "Regain 1% of your life a second for this floor", "effect": { "lifeRegen": 0.01 } }
    ]
  },
  {
    "id": "clarity",
    "name": "Shrine of Clarity",
    "family": "tempo",
    "duration": "floor",
    "cap": 1,
    "shrine": 3,
    "weight": { "common": 0, "rare": 0, "epic": 0 },
    "tiers": [
      { "text": "+50% mana regen for this floor", "effect": { "manaRegen": 0.5 } },
      { "text": "+50% mana regen for this floor", "effect": { "manaRegen": 0.5 } },
      { "text": "+50% mana regen for this floor", "effect": { "manaRegen": 0.5 } }
    ]
  },
  {
    "id": "fortune",
    "name": "Shrine of Fortune",
    "family": "fortune",
    "duration": "floor",
    "cap": 1,
    "shrine": 2,
    "weight": { "common": 0, "rare": 0, "epic": 0 },
    "tiers": [
      { "text": "+50 Find for this floor", "effect": { "find": 50 } },
      { "text": "+50 Find for this floor", "effect": { "find": 50 } },
      { "text": "+50 Find for this floor", "effect": { "find": 50 } }
    ]
  },
  {
    "id": "mercy",
    "name": "Shrine of Mercy",
    "family": "fortune",
    "duration": "floor",
    "cap": 1,
    "shrine": 2,
    "weight": { "common": 0, "rare": 0, "epic": 0 },
    "tiers": [
      { "text": "Refill your potions", "effect": { "potions": true } },
      { "text": "Refill your potions", "effect": { "potions": true } },
      { "text": "Refill your potions", "effect": { "potions": true } }
    ]
  },
  {
    "id": "devotion",
    "name": "Shrine of Devotion",
    "family": "offense",
    "duration": "dive",
    "cap": 1,
    "shrine": 1,
    "weight": { "common": 0, "rare": 0, "epic": 0 },
    "tiers": [
      { "text": "+10% damage for the rest of the dive", "effect": { "damage": 0.1 } },
      { "text": "+10% damage for the rest of the dive", "effect": { "damage": 0.1 } },
      { "text": "+10% damage for the rest of the dive", "effect": { "damage": 0.1 } }
    ]
  }
]
```

In `packages/engine/src/data/loader.ts`:

Replace:

```ts
import type { SetPiecesData } from '../types/floor-map.js';
import {
```

with:

```ts
import type { SetPiecesData } from '../types/floor-map.js';
import type { BoonDef } from '../types/boon.js';
import {
```

Replace:

```ts
  ArpgDataSchema,
  CraftingDataSchema,
```

with:

```ts
  ArpgDataSchema,
  BoonsDataSchema,
  CraftingDataSchema,
```

Replace:

```ts
import rawSetPieces from './setpieces.json';
```

with:

```ts
import rawSetPieces from './setpieces.json';
import rawBoons from './boons.json';
```

Replace:

```ts
  setPieces: SetPiecesData;
}
```

with:

```ts
  setPieces: SetPiecesData;
  /** `boons.json`: the boons and the shrines' blessings (see the boons spec). */
  boons: BoonDef[];
}
```

Replace:

```ts
  const setPieces = SetPiecesDataSchema.parse(rawSetPieces) as SetPiecesData;

  return { balance, delve, arpg, crafting, quests, tutorial, setPieces };
}
```

with:

```ts
  const setPieces = SetPiecesDataSchema.parse(rawSetPieces) as SetPiecesData;
  const boons = BoonsDataSchema.parse(rawBoons) as BoonDef[];

  return { balance, delve, arpg, crafting, quests, tutorial, setPieces, boons };
}
```

In `packages/engine/src/data/registry.ts`:

Replace:

```ts
import type { SetPiecesData } from '../types/floor-map.js';
```

with:

```ts
import type { SetPiecesData } from '../types/floor-map.js';
import type { BoonDef, BoonId } from '../types/boon.js';
```

Replace:

```ts
  getDelveBalance(): DelveBalance {
```

with:

```ts
  /** `boons.json`: every boon row, the shrines among them, in file order (see the boons spec). */
  getBoons(): BoonDef[] {
    return this.data.boons;
  }

  /** The boon row `id`, or undefined (it never throws: a save may name a row since removed). */
  getBoon(id: BoonId): BoonDef | undefined {
    return this.data.boons.find((b) => b.id === id);
  }

  /** The rows a sanctum may draw (`shrine` > 0), in file order: the generator's draw. */
  shrineBoons(): BoonDef[] {
    return this.data.boons.filter((b) => (b.shrine ?? 0) > 0);
  }

  getDelveBalance(): DelveBalance {
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
import { AFFIX_FAMILIES, FLUX_GRADES, METAL_IDS } from '../types/crafting.js';
import {
```

with:

```ts
import { AFFIX_FAMILIES, FLUX_GRADES, METAL_IDS } from '../types/crafting.js';
import { BOON_FAMILIES } from '../types/boon.js';
import {
```

Replace:

```ts
export const ArpgDataSchema = z.object({
```

with:

```ts
// --- Boons (see the boons spec) ---

const fraction = z.number().gt(0).max(1);

/**
 * What a boon or shrine does (`BoonEffect`): at least one field, and nothing else. Units: a bonus
 * is the added fraction (`damage: 0.25` is +25%; `maxLife` may be negative, above −1); a drop
 * multiplier (`flux`, `runes`, `gear`) is the raw factor (1.3); `find` is Find points;
 * `dodgeCharges` and `skip` are counts (`dodgeCharges` may be negative); `tempo` and
 * `dodgeRecharge` are cuts below 1.
 */
export const BoonEffectSchema = z
  .object({
    damage: z.number().positive().optional(),
    manaRegen: z.number().positive().optional(),
    lifeRegen: z.number().positive().optional(),
    maxLife: z.number().gt(-1).optional(),
    tempo: z.number().gt(0).lt(1).optional(),
    lifesteal: z.number().positive().optional(),
    bloodPrice: z.number().positive().optional(),
    attune: z
      .object({ role: z.enum(['primary', 'secondary']), points: z.number().int().positive() })
      .strict()
      .optional(),
    knobs: KnobsSchema.optional(),
    byKind: z
      .object({
        light: z.number().positive(),
        medium: z.number().positive(),
        heavy: z.number().positive(),
        hold: z.number().positive(),
      })
      .partial()
      .strict()
      .optional(),
    firstMove: z.number().positive().optional(),
    stepBonus: z.number().positive().optional(),
    lowLife: z.object({ below: fraction, mult: z.number().positive() }).strict().optional(),
    nearFoes: z
      .object({
        per: z.number().positive(),
        cap: z.number().int().positive(),
        radius: z.number().positive(),
      })
      .strict()
      .optional(),
    dodgeCharges: z.number().int().optional(),
    dodgeWindow: z.number().positive().optional(),
    dodgeRecharge: z.number().gt(0).lt(1).optional(),
    perfectAlways: z.literal(true).optional(),
    freeCast: z
      .object({ seconds: z.number().positive(), damage: z.number().min(0) })
      .strict()
      .optional(),
    defendDuration: z.number().positive().optional(),
    barrierOnFloor: fraction.optional(),
    healOnClear: fraction.optional(),
    lastStand: z
      .object({ below: fraction, reduce: fraction, seconds: z.number().positive() })
      .strict()
      .optional(),
    find: z.number().positive().optional(),
    magnet: z.number().positive().optional(),
    metalUp: fraction.optional(),
    flux: z.number().positive().optional(),
    runes: z.number().positive().optional(),
    gear: z.number().positive().optional(),
    scrap: z.number().positive().optional(),
    deathLoss: fraction.optional(),
    potions: z.literal(true).optional(),
    noPotions: z.literal(true).optional(),
    eliteChance: fraction.optional(),
    skip: z.number().int().positive().optional(),
    exitRevealed: z.literal(true).optional(),
    shrinesLastDive: z.literal(true).optional(),
    noSlow: z.literal(true).optional(),
    hazardsFriendly: fraction.optional(),
  })
  .strict()
  .refine((e) => Object.keys(e).length > 0, 'a boon does something');

const BoonTierSchema = z.object({ text: z.string().min(1), effect: BoonEffectSchema }).strict();

/** One row of `boons.json` (`BoonDef`). */
export const BoonDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    family: z.enum(BOON_FAMILIES),
    duration: z.enum(['dive', 'floor']),
    cap: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    minDepth: z.number().int().min(1).optional(),
    shrine: z.number().positive().optional(),
    weight: z
      .object({ common: z.number().min(0), rare: z.number().min(0), epic: z.number().min(0) })
      .strict(),
    tiers: z.tuple([BoonTierSchema, BoonTierSchema, BoonTierSchema]),
  })
  .strict();

/** `boons.json`: the rows, ids distinct; a potion refill lasts the floor (it acts at once). */
export const BoonsDataSchema = z
  .array(BoonDefSchema)
  .min(1)
  .refine(distinctIds, 'boon ids differ')
  .refine(
    (bs) => bs.every((b) => b.duration === 'floor' || b.tiers.every((t) => !t.effect.potions)),
    'a refill lasts the floor',
  );

/** `balance.json → delve.boons`: a stop's cards and its tier weights by depth band, ascending from depth 1. */
export const BoonsBalanceSchema = z
  .object({
    offers: z.number().int().min(1),
    tierWeights: z
      .array(
        z
          .object({
            fromDepth: z.number().int().min(1),
            weights: z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)]),
          })
          .strict(),
      )
      .min(1)
      .refine(
        (bs) =>
          bs[0].fromDepth === 1 && bs.every((b, i) => i === 0 || b.fromDepth > bs[i - 1].fromDepth),
        'the bands ascend from depth 1',
      ),
  })
  .strict();

export const ArpgDataSchema = z.object({
```

Create `packages/engine/src/types/boon.ts`:

```ts
import type { KnobsData } from './ability.js';

// The boons (see the boons spec): dive-scoped rewards taken at the stops between depths, and the
// sanctums' shrine blessings, which are boon rows too (`boons.json`).

export const BOON_FAMILIES = [
  'offense',
  'element',
  'defense',
  'tempo',
  'fortune',
  'pact',
  'floor',
] as const;
export type BoonFamily = (typeof BOON_FAMILIES)[number];
export type BoonId = string;
export type BoonTierIndex = 1 | 2 | 3;
export const BOON_TIER_NAMES = ['common', 'rare', 'epic'] as const;

/**
 * What a boon or shrine does. Every field optional. Units: a bonus is the added fraction
 * (`damage: 0.25` is +25%); a drop multiplier (`flux`, `runes`, `gear`) is the raw factor (1.3).
 * Stacking (spec §2): counts and additive bonuses sum; `damage`, `manaRegen`, `maxLife`, `tempo`,
 * `flux`, `runes`, `gear` multiply per entry; `hazardsFriendly` takes the largest; `knobs` merge
 * per entry through `mergeKnobs`.
 */
export interface BoonEffect {
  // stats (applyBuffs)
  damage?: number;
  manaRegen?: number;
  lifeRegen?: number;
  maxLife?: number;
  tempo?: number;
  lifesteal?: number;
  bloodPrice?: number;
  // stats before stats exist (diveStats)
  attune?: { role: 'primary' | 'secondary'; points: number };
  knobs?: KnobsData;
  // the damage path
  byKind?: Partial<Record<'light' | 'medium' | 'heavy' | 'hold', number>>;
  firstMove?: number;
  stepBonus?: number;
  lowLife?: { below: number; mult: number };
  nearFoes?: { per: number; cap: number; radius: number };
  // defence and tempo
  dodgeCharges?: number;
  dodgeWindow?: number;
  dodgeRecharge?: number;
  perfectAlways?: true;
  freeCast?: { seconds: number; damage: number };
  defendDuration?: number;
  barrierOnFloor?: number;
  healOnClear?: number;
  lastStand?: { below: number; reduce: number; seconds: number };
  // loot and the dive
  find?: number;
  magnet?: number;
  metalUp?: number;
  flux?: number;
  runes?: number;
  gear?: number;
  scrap?: number;
  deathLoss?: number;
  potions?: true;
  noPotions?: true;
  eliteChance?: number;
  skip?: number;
  // the floor
  exitRevealed?: true;
  shrinesLastDive?: true;
  noSlow?: true;
  hazardsFriendly?: number;
}

export interface BoonTier {
  text: string;
  effect: BoonEffect;
}

export interface BoonDef {
  id: BoonId;
  name: string;
  family: BoonFamily;
  duration: 'dive' | 'floor';
  cap: 1 | 2 | 3;
  minDepth?: number;
  /** A sanctum's draw weight; absent: never a shrine. */
  shrine?: number;
  /** A stop's draw weight by tier; all 0: never at a stop. */
  weight: { common: number; rare: number; epic: number };
  tiers: [BoonTier, BoonTier, BoonTier];
}

/** A boon on the hero (`HeroEntity.floorBuffs`, `diveBuffs`, `DiveState.diveBuffs`). */
export interface Buff {
  boon: BoonId;
  tier: BoonTierIndex;
  effect: BoonEffect;
}

export interface BoonOffer {
  id: BoonId;
  tier: BoonTierIndex;
}

/** `buffSum`'s combined view (spec §2), kept on `HeroEntity.boon`. Absent fields: neutral. */
export type BoonSum = Omit<BoonEffect, 'knobs' | 'attune'> & {
  knobs: KnobsData[];
  attune: { primary: number; secondary: number };
};

/** `balance.json → delve.boons`: a stop's cards and its tier odds by depth band (see the boons spec §4). */
export interface BoonsBalance {
  /** Cards a stop offers. */
  offers: number;
  /** From `fromDepth` on (ascending from 1), the weights of common, rare and epic. */
  tierWeights: { fromDepth: number; weights: [number, number, number] }[];
}
```

- [ ] **Step 4: Run them to see them pass**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-a-data.test.ts --reporter=dot)
```

Expected: no type errors; `Tests  5 passed (5)`.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-boons-a
git add packages/engine/src/data/boons.json packages/engine/src/data/loader.ts packages/engine/src/data/registry.ts packages/engine/src/data/schemas.ts packages/engine/src/types/boon.ts packages/engine/tests/delve-boons-a-data.test.ts
git commit -m "feat(engine): the boon types, boons.json with the six shrines as rows, its schemas and the registry" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The shrines are boon rows

`Buff` becomes `{ boon, tier, effect }` (in `types/boon.ts`, re-exported from `floor-map.ts`, so `import type { Buff } from '../types/floor-map.js'` keeps compiling); `ShrineEffect`, `ShrineDef`, `ShrineId`, `DelveData.shrines`, `ShrineEffectSchema`, `ShrinesDataSchema` and `shrines.json` go; `BuffSchema` is the new shape; `Interactable.shrine` is a `BoonId`. The readers move: the generator draws `weightedPick(registry.shrineBoons(), (s) => s.shrine!, rng)` (the same rows, weights and order, so the same draw), `applyShrine` takes the row and grants its tier 1, the prompt reads `tiers[0].text`, and the tutorial floor's shrine is `getBoon('vigor')`. The test pins every sanctum's shrine over 20 seeds and six depths as the base drew them (the strings were printed by the base's generator).

**Files:**
- Create: `packages/engine/tests/delve-boons-a-shrines.test.ts`
- Modify: `packages/engine/src/arpg/interact.ts`
- Modify: `packages/engine/src/arpg/layout/generate.ts`
- Modify: `packages/engine/src/arpg/tutorial-floor.ts`
- Modify: `packages/engine/src/data/loader.ts`
- Modify: `packages/engine/src/data/schemas.ts`
- Delete: `packages/engine/src/data/shrines.json`
- Modify: `packages/engine/src/types/delve.ts`
- Modify: `packages/engine/src/types/floor-map.ts`
- Modify: `packages/engine/src/types/index.ts`
- Modify: `packages/engine/tests/delve-maps-buffs.test.ts`
- Modify: `packages/engine/tests/delve-maps-data.test.ts`
- Modify: `packages/engine/tests/delve-maps-flow.test.ts`
- Modify: `packages/engine/tests/delve-maps-generate.test.ts`
- Modify: `packages/engine/tests/delve-maps-interact.test.ts`
- Modify: `packages/engine/tests/delve-maps-save.test.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-boons-a-shrines.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planFloor } from '../src/arpg/layout/generate.js';
import { applyShrine } from '../src/arpg/interact.js';
import { tutorialFloorMap } from '../src/arpg/tutorial-floor.js';
import { registry } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';

// See the boons spec, "1. The boon row": the shrines are boon rows, drawn as before, and a
// blessing is a `Buff` of its row at tier 1.

const SEEDS = Array.from({ length: 20 }, (_, i) => 1 + i * 7919);
/** Every floor's sanctum shrines by depth, one entry a seed ('-': none), pinned before the change. */
const BEFORE: Record<number, string> = {
  12: '- - - - - - - - - - - - - - - - clarity - - -',
  20: '- - - renewal - - - - - - clarity - - vigor - - - - - -',
  28: '- - - clarity - - - - - - renewal - - - - - renewal - - -',
  36: '- - - devotion - - - - vigor - renewal - - - - - vigor - - -',
  44: '- - - devotion - - - - vigor - renewal - - - - - vigor - - -',
  60: '- - - vigor - - - - - - fortune - fortune fortune - - - - - -',
};

describe('the shrines as boon rows', () => {
  it('every generated sanctum holds the shrine it held before', () => {
    for (const [depth, want] of Object.entries(BEFORE)) {
      const biome = registry.getBiomeForDepth(Number(depth));
      const got = SEEDS.map(
        (seed) =>
          planFloor(registry, seed, Number(depth), biome, null)
            .map.rooms.filter((r) => r.kind === 'sanctum')
            .map((r) => r.interactable!.shrine)
            .join('+') || '-',
      ).join(' ');
      expect(got, `depth ${depth}`).toBe(want);
    }
  });

  it("the tutorial floor's shrine is still Vigor", () => {
    const shrines = registry
      .getTutorialData()
      .floors.flatMap((f) => tutorialFloorMap(registry, f, f.depth).rooms)
      .flatMap((r) => (r.interactable?.kind === 'shrine' ? [r.interactable.shrine] : []));
    expect(shrines.length).toBeGreaterThan(0);
    expect(new Set(shrines)).toEqual(new Set(['vigor']));
  });

  it("a blessing is its row's tier 1, on the floor or the dive by its duration", () => {
    const w = floorWorld(twoRooms('sanctum', { kind: 'shrine', shrine: 'clarity' }));
    applyShrine(registry, w, registry.getBoon('vigor')!);
    applyShrine(registry, w, registry.getBoon('devotion')!);
    expect(w.hero.floorBuffs).toEqual([{ boon: 'vigor', tier: 1, effect: { damage: 0.2 } }]);
    expect(w.hero.diveBuffs).toEqual([{ boon: 'devotion', tier: 1, effect: { damage: 0.1 } }]);
    expect(w.pending.diveBuffs).toEqual(w.hero.diveBuffs);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx vitest run tests/delve-boons-a-shrines.test.ts --reporter=dot)
```

Expected: `1 failed | 2 passed (3)`: `a blessing is its row's tier 1, …` with `TypeError: Cannot read properties of undefined (reading 'potions')` (the old `applyShrine` reads `shrine.effect`). The pinned draw and the tutorial's Vigor already hold at the base: they are the parity guard for this task.

- [ ] **Step 3: Implement**

In `packages/engine/src/arpg/interact.ts`:

Replace:

```ts
import type { MaterialRef } from '../types/crafting.js';
import type { Interactable, ShrineDef } from '../types/floor-map.js';
import { applyBuffs, manaPool } from '../delve/hero-stats.js';
```

with:

```ts
import type { MaterialRef } from '../types/crafting.js';
import type { Interactable } from '../types/floor-map.js';
import type { BoonDef, Buff } from '../types/boon.js';
import { applyBuffs, manaPool } from '../delve/hero-stats.js';
```

Replace:

```ts
function shrineOf(registry: DataRegistry, it: Interactable): ShrineDef | undefined {
  return registry.getDelveData().shrines.find((s) => s.id === it.shrine);
}
```

with:

```ts
/** A shrine's boon row (`boons.json`). */
function shrineOf(registry: DataRegistry, it: Interactable): BoonDef | undefined {
  return it.shrine === undefined ? undefined : registry.getBoon(it.shrine);
}
```

Replace:

```ts
  const text =
    it.kind === 'shrine' ? (shrine ? `${shrine.name}: ${shrine.text}` : 'Shrine') : NAMES[it.kind];
  events.push({ kind: 'interactPrompt', id: it.id, interactable: it.kind, text });
```

with:

```ts
  const text =
    it.kind === 'shrine'
      ? shrine
        ? `${shrine.name}: ${shrine.tiers[0].text}`
        : 'Shrine'
      : NAMES[it.kind];
  events.push({ kind: 'interactPrompt', id: it.id, interactable: it.kind, text });
```

Replace:

```ts
/**
 * A shrine's blessing on the world's hero (`interactTick` records the use): a
 * potion refill fills the flasks; its Find goes on `world.loot.find`; the rest
 * is a blessing (none for a refill alone). A floor blessing goes on
 * `floorBuffs`; a dive blessing on `diveBuffs` and `baseStats`, and into
```

with:

```ts
/**
 * A shrine's blessing on the world's hero (`interactTick` records the use): its
 * row's tier 1 (see the boons spec). A potion refill fills the flasks; its Find
 * goes on `world.loot.find`; the rest is a blessing (none for a refill alone),
 * a `Buff` of the row at tier 1. A floor blessing goes on
 * `floorBuffs`; a dive blessing on `diveBuffs` and `baseStats`, and into
```

Replace:

```ts
 */
export function applyShrine(registry: DataRegistry, world: ArpgWorld, shrine: ShrineDef): void {
  const h = world.hero;
  const { effect } = shrine;
  if (effect.potions) h.potions = registry.getDelveBalance().dive.maxPotions;
```

with:

```ts
 */
export function applyShrine(registry: DataRegistry, world: ArpgWorld, shrine: BoonDef): void {
  const h = world.hero;
  const { effect } = shrine.tiers[0];
  if (effect.potions) h.potions = registry.getDelveBalance().dive.maxPotions;
```

Replace:

```ts
  if (Object.keys(effect).every((k) => k === 'potions')) return;
  const buff = { shrine: shrine.id, effect };
  if (shrine.duration === 'dive') {
```

with:

```ts
  if (Object.keys(effect).every((k) => k === 'potions')) return;
  const buff: Buff = { boon: shrine.id, tier: 1, effect };
  if (shrine.duration === 'dive') {
```

In `packages/engine/src/arpg/layout/generate.ts`:

Replace:

```ts
  const L = registry.getDelveBalance().layout;
  const { layouts, shrines } = registry.getDelveData();
  const rng = new SeededRNG(seed).fork('layout');
```

with:

```ts
  const L = registry.getDelveBalance().layout;
  const { layouts } = registry.getDelveData();
  const shrines = registry.shrineBoons();
  const rng = new SeededRNG(seed).fork('layout');
```

Replace:

```ts
      };
      if (kind === 'shrine') it.shrine = weightedPick(shrines, (s) => s.weight, rng).id;
      if (kind === 'gate') map.exit = { x: it.x, y: it.y };
```

with:

```ts
      };
      if (kind === 'shrine') it.shrine = weightedPick(shrines, (s) => s.shrine!, rng).id;
      if (kind === 'gate') map.exit = { x: it.x, y: it.y };
```

In `packages/engine/src/arpg/tutorial-floor.ts`:

Replace:

```ts
 * interactable its cells place (`C`, `H`, `A`, `X`; its id `${depth}:${room}`,
 * a shrine's blessing the first of `shrines.json`) and its home field; each
 * door's rooms, those on whose wall it lies (one that seals first, then by
```

with:

```ts
 * interactable its cells place (`C`, `H`, `A`, `X`; its id `${depth}:${room}`,
 * a shrine's blessing Vigor's) and its home field; each
 * door's rooms, those on whose wall it lies (one that seals first, then by
```

Replace:

```ts
  };
  const shrine = registry.getDelveData().shrines[0].id;
  def.rows.forEach((row, y) =>
```

with:

```ts
  };
  const shrine = registry.getBoon('vigor')!.id;
  def.rows.forEach((row, y) =>
```

In `packages/engine/src/data/loader.ts`:

Replace:

```ts
  RunesSchema,
  ShrinesDataSchema,
} from './schemas.js';
```

with:

```ts
  RunesSchema,
} from './schemas.js';
```

Replace:

```ts
import rawLayouts from './layouts.json';
import rawShrines from './shrines.json';
import rawTutorial from './tutorial.json';
```

with:

```ts
import rawLayouts from './layouts.json';
import rawTutorial from './tutorial.json';
```

Replace:

```ts
  const balance = BalanceConfigSchema.parse(rawBalance) as unknown as BalanceConfig;
  // layouts.json and shrines.json ride the Delve data (see the floor maps spec).
  const delve = {
```

with:

```ts
  const balance = BalanceConfigSchema.parse(rawBalance) as unknown as BalanceConfig;
  // layouts.json rides the Delve data (see the floor maps spec).
  const delve = {
```

Replace:

```ts
    layouts: LayoutsDataSchema.parse(rawLayouts),
    shrines: ShrinesDataSchema.parse(rawShrines),
  } as unknown as DelveData;
```

with:

```ts
    layouts: LayoutsDataSchema.parse(rawLayouts),
  } as unknown as DelveData;
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
/** A shrine's blessing: at least one part, and nothing else. */
const ShrineEffectSchema = z
  .object({
    damage: z.number().positive().optional(),
    lifeRegen: z.number().positive().optional(),
    manaRegen: z.number().positive().optional(),
    find: z.number().positive().optional(),
    potions: z.literal(true).optional(),
  })
  .strict()
  .refine((e) => Object.keys(e).length > 0, 'a shrine does something');

/** A blessing on the hero (`HeroEntity.floorBuffs`, `DiveState.diveBuffs`). */
export const BuffSchema = z.object({ shrine: z.string().min(1), effect: ShrineEffectSchema });

/** `shrines.json`: a potion refill is a floor shrine (it acts at once). */
export const ShrinesDataSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      text: z.string().min(1),
      effect: ShrineEffectSchema,
      duration: z.enum(['floor', 'dive']),
      weight: z.number().positive(),
    }),
  )
  .min(1)
  .refine(distinctIds, 'shrine ids differ')
  .refine(
    (ss) => ss.every((s) => s.duration === 'floor' || !s.effect.potions),
    'a refill lasts the floor',
  );

/** A room template: its floor's size in cells. */
```

with:

```ts
/** A room template: its floor's size in cells. */
```

Replace:

```ts
  .refine((e) => Object.keys(e).length > 0, 'a boon does something');
```

with:

```ts
  .refine((e) => Object.keys(e).length > 0, 'a boon does something');

/** A boon on the hero (`HeroEntity.floorBuffs`, `diveBuffs`, `DiveState.diveBuffs`): its row, its tier, its effect. */
export const BuffSchema = z
  .object({
    boon: z.string().min(1),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    effect: BoonEffectSchema,
  })
  .strict();
```

Delete `packages/engine/src/data/shrines.json`: `git rm packages/engine/src/data/shrines.json`.

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
import type { ProfileQuests, QuestsBalance } from './quests.js';
import type {
  AiBalance,
  Buff,
  LayoutBalance,
  LayoutsData,
  ShrineDef,
  TerrainBalance,
} from './floor-map.js';
import type { TutorialState } from './tutorial.js';
```

with:

```ts
import type { ProfileQuests, QuestsBalance } from './quests.js';
import type { AiBalance, LayoutBalance, LayoutsData, TerrainBalance } from './floor-map.js';
import type { Buff } from './boon.js';
import type { TutorialState } from './tutorial.js';
```

Replace:

```ts
  layouts: LayoutsData;
  /** `shrines.json`: the sanctums' blessings. */
  shrines: ShrineDef[];
}
```

with:

```ts
  layouts: LayoutsData;
}
```

In `packages/engine/src/types/floor-map.ts`:

Replace:

```ts
import type { ManaType } from './mana.js';
```

with:

```ts
import type { ManaType } from './mana.js';
import type { BoonId } from './boon.js';
```

Replace:

```ts
/** A shrine's id in `shrines.json`. */
export type ShrineId = string;

/** Something in a room the hero uses with `interact`. */
```

with:

```ts
/** Something in a room the hero uses with `interact`. */
```

Replace:

```ts
  used: boolean;
  /** A shrine's blessing, drawn at generation. */
  shrine?: ShrineId;
}
```

with:

```ts
  used: boolean;
  /** A shrine's blessing (its row in `boons.json`), drawn at generation. */
  shrine?: BoonId;
}
```

Replace:

```ts
// ── Shrines (shrines.json) ─────────────────────────────────────────────────

/** What a shrine's blessing does; each part is optional. */
export interface ShrineEffect {
  /** Damage dealt × (1 + this). */
  damage?: number;
  /** Life regained a second, as a fraction of max life. */
  lifeRegen?: number;
  /** Mana regen × (1 + this). */
  manaRegen?: number;
  /** Find, in percentage points (`world.loot.find`). */
  find?: number;
  /** Refills the potions (at once: a floor shrine only). */
  potions?: true;
}

export interface ShrineDef {
  id: ShrineId;
  name: string;
  /** Player-facing: what it does, for the prompt. */
  text: string;
  effect: ShrineEffect;
  /** How long it lasts: the floor, or the rest of the dive. */
  duration: 'floor' | 'dive';
  /** Its chance to be a sanctum's shrine, against the others'. */
  weight: number;
}

/** A blessing on the hero: its shrine (for its name) and what it does. */
export interface Buff {
  shrine: ShrineId;
  effect: ShrineEffect;
}
```

with:

```ts
// ── Shrines ────────────────────────────────────────────────────────────────

// A shrine's blessing is a boon row (`boons.json`; see the boons spec): `Buff` lives in boon.ts.
export type { Buff } from './boon.js';
```

In `packages/engine/src/types/index.ts`:

Replace:

```ts
export * from './tutorial-floor.js';
```

with:

```ts
export * from './tutorial-floor.js';
export * from './boon.js';
```

Then update the tests that read the old shapes (`delve-maps-*`: a `Buff` literal, `getDelveData().shrines`, `.map((b) => b.shrine)`, and `delve-maps-data`'s `shrines.json` block, which `delve-boons-a-data` replaced):

In `packages/engine/tests/delve-maps-buffs.test.ts`:

Replace:

```ts
const VIGOR: Buff = { shrine: 'vigor', effect: { damage: 0.2 } };
const CLARITY: Buff = { shrine: 'clarity', effect: { manaRegen: 0.5 } };
const RENEWAL: Buff = { shrine: 'renewal', effect: { lifeRegen: 0.01 } };
const DEVOTION: Buff = { shrine: 'devotion', effect: { damage: 0.1, find: 50 } };
const STATS = computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry);
```

with:

```ts
const VIGOR: Buff = { boon: 'vigor', tier: 1, effect: { damage: 0.2 } };
const CLARITY: Buff = { boon: 'clarity', tier: 1, effect: { manaRegen: 0.5 } };
const RENEWAL: Buff = { boon: 'renewal', tier: 1, effect: { lifeRegen: 0.01 } };
const DEVOTION: Buff = { boon: 'devotion', tier: 1, effect: { damage: 0.1, find: 50 } };
const STATS = computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry);
```

In `packages/engine/tests/delve-maps-data.test.ts`:

Replace:

```ts
import { createDefaultRegistry } from '../src/data/default-registry.js';
import {
  AiBalanceSchema,
  LayoutBalanceSchema,
  LayoutsDataSchema,
  ShrinesDataSchema,
} from '../src/data/schemas.js';
import layoutsData from '../src/data/layouts.json';
import shrinesData from '../src/data/shrines.json';
import { PROP_IDS } from '../src/types/floor-map.js';
```

with:

```ts
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { AiBalanceSchema, LayoutBalanceSchema, LayoutsDataSchema } from '../src/data/schemas.js';
import layoutsData from '../src/data/layouts.json';
import { PROP_IDS } from '../src/types/floor-map.js';
```

Replace:

```ts
      ok(LayoutsDataSchema, { ...layoutsData, rooms: { crypts: layoutsData.rooms.default } }),
    ).toBe(false);
  });
});

describe('shrines.json', () => {
  const shrines = registry.getDelveData().shrines;

  it('rides the Delve data: floor and dive blessings, a potion refill among them', () => {
    expect(shrines.some((s) => s.duration === 'floor')).toBe(true);
    expect(shrines.some((s) => s.duration === 'dive')).toBe(true);
    expect(shrines.some((s) => s.effect.potions)).toBe(true);
  });

  it('refuses repeated ids, an empty or unknown effect, and a refill for the dive', () => {
    const shrine = {
      id: 'a',
      name: 'A',
      text: 'A.',
      effect: { damage: 0.1 },
      duration: 'floor',
      weight: 1,
    };
    expect(ok(ShrinesDataSchema, shrinesData)).toBe(true);
    expect(ok(ShrinesDataSchema, [shrine, { ...shrine, id: 'b' }])).toBe(true);
    expect(ok(ShrinesDataSchema, [shrine, shrine])).toBe(false);
    expect(ok(ShrinesDataSchema, [{ ...shrine, effect: {} }])).toBe(false);
    expect(ok(ShrinesDataSchema, [{ ...shrine, effect: { haste: 1 } }])).toBe(false);
    expect(
      ok(ShrinesDataSchema, [{ ...shrine, effect: { potions: true }, duration: 'dive' }]),
    ).toBe(false);
```

with:

```ts
      ok(LayoutsDataSchema, { ...layoutsData, rooms: { crypts: layoutsData.rooms.default } }),
    ).toBe(false);
```

In `packages/engine/tests/delve-maps-flow.test.ts`:

Replace:

```ts
const shrine = (id: string) => registry.getDelveData().shrines.find((s) => s.id === id)!;
const ring = generateItem(
```

with:

```ts
const shrine = (id: string) => registry.getBoon(id)!;
const ring = generateItem(
```

Replace:

```ts
    const once = bankWorld(registry, p, w).profile;
    const devotion = { shrine: 'devotion', effect: shrine('devotion').effect };
    expect([once.dive!.used, once.dive!.diveBuffs]).toEqual([['1:1'], [devotion]]);
```

with:

```ts
    const once = bankWorld(registry, p, w).profile;
    const devotion = { boon: 'devotion', tier: 1, effect: shrine('devotion').tiers[0].effect };
    expect([once.dive!.used, once.dive!.diveBuffs]).toEqual([['1:1'], [devotion]]);
```

Replace:

```ts
    const again = beginFloor(registry, banked);
    expect(again.hero.diveBuffs.map((b) => b.shrine)).toEqual(['devotion']);
    expect(again.hero.stats.damageMult).toBeCloseTo(
```

with:

```ts
    const again = beginFloor(registry, banked);
    expect(again.hero.diveBuffs.map((b) => b.boon)).toEqual(['devotion']);
    expect(again.hero.stats.damageMult).toBeCloseTo(
```

Replace:

```ts
    expect(w.hero.stats).toEqual(applyBuffs(applyBuffs(real, w.hero.diveBuffs), w.hero.floorBuffs));
    expect(w.hero.floorBuffs.map((b) => b.shrine)).toEqual(['vigor']);
    expect(w.loot.find).toBeCloseTo(find + w.hero.stats.magicFind, 9);
```

with:

```ts
    expect(w.hero.stats).toEqual(applyBuffs(applyBuffs(real, w.hero.diveBuffs), w.hero.floorBuffs));
    expect(w.hero.floorBuffs.map((b) => b.boon)).toEqual(['vigor']);
    expect(w.loot.find).toBeCloseTo(find + w.hero.stats.magicFind, 9);
```

In `packages/engine/tests/delve-maps-generate.test.ts`:

Replace:

```ts
  it('gives each special room its interactable, with ids by depth and room, a shrine its blessing', () => {
    const shrineIds = registry.getDelveData().shrines.map((s) => s.id);
    for (const { map, depth } of ALL)
```

with:

```ts
  it('gives each special room its interactable, with ids by depth and room, a shrine its blessing', () => {
    const shrineIds = registry.shrineBoons().map((s) => s.id);
    for (const { map, depth } of ALL)
```

In `packages/engine/tests/delve-maps-interact.test.ts`:

Replace:

```ts
describe('the shrine', () => {
  const shrine = (id: string) => registry.getDelveData().shrines.find((s) => s.id === id)!;
  /** The hero beside a sanctum's shrine of `id`. */
```

with:

```ts
describe('the shrine', () => {
  const shrine = (id: string) => registry.getBoon(id)!;
  /** The hero beside a sanctum's shrine of `id`. */
```

Replace:

```ts
    expect(w.channel).toBeNull();
    expect(w.hero.floorBuffs).toEqual([{ shrine: 'vigor', effect: shrine('vigor').effect }]);
    expect(w.hero.stats.damageMult).toBeCloseTo(damage * 1.2, 9);
```

with:

```ts
    expect(w.channel).toBeNull();
    expect(w.hero.floorBuffs).toEqual([
      { boon: 'vigor', tier: 1, effect: shrine('vigor').tiers[0].effect },
    ]);
    expect(w.hero.stats.damageMult).toBeCloseTo(damage * 1.2, 9);
```

Replace:

```ts
    applyShrine(registry, w, shrine('clarity'));
    const devotion = { shrine: 'devotion', effect: shrine('devotion').effect };
    expect(w.hero.diveBuffs).toEqual([devotion]);
    expect(w.pending.diveBuffs).toEqual([devotion]);
    expect(w.hero.floorBuffs.map((b) => b.shrine)).toEqual(['clarity']);
    expect(w.hero.baseStats.damageMult).toBeCloseTo(w.hero.stats.damageMult, 9);
```

with:

```ts
    applyShrine(registry, w, shrine('clarity'));
    const devotion = { boon: 'devotion', tier: 1, effect: shrine('devotion').tiers[0].effect };
    expect(w.hero.diveBuffs).toEqual([devotion]);
    expect(w.pending.diveBuffs).toEqual([devotion]);
    expect(w.hero.floorBuffs.map((b) => b.boon)).toEqual(['clarity']);
    expect(w.hero.baseStats.damageMult).toBeCloseTo(w.hero.stats.damageMult, 9);
```

Replace:

```ts
    expect(w.hero.potions).toBe(bal.dive.maxPotions);
    expect(w.hero.floorBuffs.map((b) => b.shrine)).toEqual(['fortune']);
  });
```

with:

```ts
    expect(w.hero.potions).toBe(bal.dive.maxPotions);
    expect(w.hero.floorBuffs.map((b) => b.boon)).toEqual(['fortune']);
  });
```

In `packages/engine/tests/delve-maps-save.test.ts`:

Replace:

```ts
const json = (x: unknown) => JSON.parse(JSON.stringify(x));
const DEVOTION: Buff = { shrine: 'devotion', effect: { damage: 0.1 } };
const diving = () => startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);
```

with:

```ts
const json = (x: unknown) => JSON.parse(JSON.stringify(x));
const DEVOTION: Buff = { boon: 'devotion', tier: 1, effect: { damage: 0.1 } };
const diving = () => startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);
```

Replace:

```ts
    expect(parseDelveProfile(registry, json({ ...p, dive: noUsed }))).toBeNull();
    const bad = { ...p.dive!, diveBuffs: [{ shrine: 'devotion', effect: { haste: 1 } }] };
    expect(parseDelveProfile(registry, json({ ...p, dive: bad }))).toBeNull();
```

with:

```ts
    expect(parseDelveProfile(registry, json({ ...p, dive: noUsed }))).toBeNull();
    const bad = { ...p.dive!, diveBuffs: [{ boon: 'devotion', tier: 1, effect: { haste: 1 } }] };
    expect(parseDelveProfile(registry, json({ ...p, dive: bad }))).toBeNull();
```

- [ ] **Step 4: Run them to see them pass**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-a-shrines.test.ts tests/delve-boons-a-data.test.ts tests/delve-maps-data.test.ts tests/delve-maps-flow.test.ts tests/delve-maps-interact.test.ts tests/delve-maps-buffs.test.ts tests/delve-maps-save.test.ts tests/delve-maps-generate.test.ts tests/delve-tutorial-floors-build.test.ts --reporter=dot)
```

Expected: no type errors; `Test Files  9 passed (9); Tests  73 passed (73)`.

- [ ] **Step 5: The fingerprint check**

```bash
cd /c/Projects/alloy-boons-a
P=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/40eae1ba-9296-44c8-9c7b-c2e0e4edb2b6/scratchpad
cp $P/boons-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/boons-a-after.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
cmp $P/boons-a-before.json $P/boons-a-after.json
```

Expected: `Tests  1 passed (1)`, and `cmp` prints nothing (identical).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-boons-a
git add packages/engine/src/arpg/interact.ts packages/engine/src/arpg/layout/generate.ts packages/engine/src/arpg/tutorial-floor.ts packages/engine/src/data/loader.ts packages/engine/src/data/schemas.ts packages/engine/src/data/shrines.json packages/engine/src/types/delve.ts packages/engine/src/types/floor-map.ts packages/engine/src/types/index.ts packages/engine/tests/delve-boons-a-shrines.test.ts packages/engine/tests/delve-maps-buffs.test.ts packages/engine/tests/delve-maps-data.test.ts packages/engine/tests/delve-maps-flow.test.ts packages/engine/tests/delve-maps-generate.test.ts packages/engine/tests/delve-maps-interact.test.ts packages/engine/tests/delve-maps-save.test.ts
git commit -m "refactor(engine): the shrines are boon rows; shrines.json goes, a blessing is a Buff of its row" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: `buffSum`, `boonCount` and `HeroEntity.boon`

`delve/boons.ts` (pure; types only) with the spec's stacking rule (see "Where the code moved the contract", 4), and the hero's combined view: `createHeroEntity` sets `boon: buffSum(diveBuffs)` and `applyShrine` rebuilds it after pushing a buff. Both exported from the index.

**Files:**
- Create: `packages/engine/tests/delve-boons-a-sum.test.ts`
- Modify: `packages/engine/src/arpg/interact.ts`
- Modify: `packages/engine/src/arpg/world.ts`
- Create: `packages/engine/src/delve/boons.ts`
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/engine/src/types/arpg.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-boons-a-sum.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyShrine } from '../src/arpg/interact.js';
import { createHeroEntity } from '../src/arpg/world.js';
import { boonCount, buffSum } from '../src/delve/boons.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { BoonEffect, Buff } from '../src/types/boon.js';
import { DEFAULT_CHAINS, arena, gear, registry } from './fixtures/arena.js';

// See the boons spec, "2. The effect and where each field applies": `buffSum` is the combined
// view the sim reads, kept on `HeroEntity.boon`.

const buff = (boon: string, effect: BoonEffect, tier: 1 | 2 | 3 = 1): Buff => ({
  boon,
  tier,
  effect,
});

describe('buffSum', () => {
  it('is neutral with nothing worn', () => {
    expect(buffSum([])).toEqual({ knobs: [], attune: { primary: 0, secondary: 0 } });
  });

  it('sums counts and additive bonuses across entries and tiers', () => {
    const s = buffSum([
      buff('a', { find: 25, dodgeCharges: 1, scrap: 0.2, skip: 1, deathLoss: 0.1 }),
      buff('a', { find: 40, dodgeCharges: -1, scrap: 0.35, deathLoss: 0.15 }, 2),
      buff('b', { lifeRegen: 0.01, lifesteal: 0.015, dodgeWindow: 0.3, magnet: 0.4 }),
      buff('b', { lifeRegen: 0.02, lifesteal: 0.025, dodgeWindow: 0.5, metalUp: 0.1 }, 3),
    ]);
    expect(s.find).toBe(65);
    expect(s.dodgeCharges).toBe(0);
    expect(s.scrap).toBeCloseTo(0.55, 12);
    expect(s.skip).toBe(1);
    expect(s.deathLoss).toBeCloseTo(0.25, 12);
    expect(s.lifeRegen).toBeCloseTo(0.03, 12);
    expect(s.lifesteal).toBeCloseTo(0.04, 12);
    expect(s.dodgeWindow).toBeCloseTo(0.8, 12);
    expect(s.magnet).toBeCloseTo(0.4, 12);
    expect(s.metalUp).toBeCloseTo(0.1, 12);
    expect(s.damage).toBeUndefined();
  });

  it('compounds damage, mana regen, max life and tempo per entry, and multiplies the drop factors', () => {
    const s = buffSum([
      buff('a', { damage: 0.1, manaRegen: 0.5, maxLife: -0.2, tempo: 0.08, flux: 1.3 }),
      buff('b', { damage: 0.2, manaRegen: 0.2, maxLife: -0.2, tempo: 0.12, flux: 1.5, gear: 2 }),
    ]);
    expect(s.damage).toBeCloseTo(1.1 * 1.2 - 1, 12);
    expect(s.manaRegen).toBeCloseTo(1.5 * 1.2 - 1, 12);
    expect(s.maxLife).toBeCloseTo(0.8 * 0.8 - 1, 12);
    expect(s.tempo).toBeCloseTo(1 - 0.92 * 0.88, 12);
    expect(s.flux).toBeCloseTo(1.95, 12);
    expect(s.gear).toBe(2);
    expect(s.runes).toBeUndefined();
  });

  it('takes the largest hazardsFriendly, ORs the flags, and sums by kind and by role', () => {
    const s = buffSum([
      buff('a', { hazardsFriendly: 0.5, noSlow: true, byKind: { heavy: 0.2, hold: 0.2 } }),
      buff('a', {
        hazardsFriendly: 0.8,
        byKind: { heavy: 0.3 },
        attune: { role: 'primary', points: 4 },
      }),
      buff('b', { perfectAlways: true, attune: { role: 'secondary', points: 6 } }),
      buff('b', { attune: { role: 'primary', points: 10 } }),
    ]);
    expect(s.hazardsFriendly).toBe(0.8);
    expect([s.noSlow, s.perfectAlways, s.exitRevealed]).toEqual([true, true, undefined]);
    expect(s.byKind).toEqual({ heavy: 0.5, hold: 0.2 });
    expect(s.attune).toEqual({ primary: 14, secondary: 6 });
  });

  it("sums a compound field's bonus and takes its shape's largest", () => {
    const s = buffSum([
      buff('a', {
        nearFoes: { per: 0.05, cap: 4, radius: 4 },
        lowLife: { below: 0.25, mult: 0.4 },
      }),
      buff('a', {
        nearFoes: { per: 0.08, cap: 4, radius: 4 },
        lowLife: { below: 0.35, mult: 0.6 },
      }),
      buff('b', {
        freeCast: { seconds: 1.5, damage: 0.1 },
        lastStand: { below: 0.2, reduce: 0.5, seconds: 3 },
      }),
    ]);
    expect(s.nearFoes!.per).toBeCloseTo(0.13, 12);
    expect([s.nearFoes!.cap, s.nearFoes!.radius]).toEqual([4, 4]);
    expect(s.lowLife).toEqual({ below: 0.35, mult: 1 });
    expect(s.freeCast).toEqual({ seconds: 1.5, damage: 0.1 });
    expect(s.lastStand).toEqual({ below: 0.2, reduce: 0.5, seconds: 3 });
  });

  it("lists each entry's knob partial in order, for mergeKnobs", () => {
    const a = { quick: { cooldown: 0.92 } };
    const b = { echo: 0.15 };
    expect(
      buffSum([buff('a', { knobs: a }), buff('b', { damage: 0.1 }), buff('a', { knobs: b })]).knobs,
    ).toEqual([a, b]);
  });
});

describe('boonCount', () => {
  it("counts a boon's entries", () => {
    const worn = [buff('a', { find: 1 }), buff('b', { find: 1 }), buff('a', { find: 1 }, 3)];
    expect([boonCount(worn, 'a'), boonCount(worn, 'b'), boonCount(worn, 'c')]).toEqual([2, 1, 0]);
  });
});

describe('HeroEntity.boon', () => {
  it("is the dive's buffs summed at floor start, and follows a shrine's blessing", () => {
    const stats = computeHeroStats({ weapon: gear('fire') }, registry);
    const start = { hpFrac: 1, potions: 3, phoenixAvailable: true, x: 5, y: 5 };
    const worn = [buff('devotion', { damage: 0.1 }), buff('magpie', { find: 25 })];
    const h = createHeroEntity(registry, stats, DEFAULT_CHAINS, { ...start, diveBuffs: worn });
    expect(h.boon).toEqual(buffSum(worn));
    expect(createHeroEntity(registry, stats, DEFAULT_CHAINS, start).boon).toEqual(buffSum([]));
    const w = arena();
    applyShrine(registry, w, registry.getBoon('vigor')!);
    expect(w.hero.boon.damage).toBeCloseTo(0.2, 12);
    applyShrine(registry, w, registry.getBoon('devotion')!);
    expect(w.hero.boon.damage).toBeCloseTo(1.2 * 1.1 - 1, 12);
    applyShrine(registry, w, registry.getBoon('fortune')!);
    expect(w.hero.boon.find).toBe(50);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx vitest run tests/delve-boons-a-sum.test.ts --reporter=dot)
```

Expected: the file fails to load, `Cannot find module '../src/delve/boons.js'`.

- [ ] **Step 3: Implement**

In `packages/engine/src/arpg/interact.ts`:

Replace:

```ts
import { applyBuffs, manaPool } from '../delve/hero-stats.js';
import { shardTiersOf } from '../loot/materials.js';
```

with:

```ts
import { applyBuffs, manaPool } from '../delve/hero-stats.js';
import { buffSum } from '../delve/boons.js';
import { shardTiersOf } from '../loot/materials.js';
```

Replace:

```ts
  } else h.floorBuffs.push(buff);
  h.stats = applyBuffs(h.baseStats, h.floorBuffs);
```

with:

```ts
  } else h.floorBuffs.push(buff);
  h.boon = buffSum([...h.diveBuffs, ...h.floorBuffs]);
  h.stats = applyBuffs(h.baseStats, h.floorBuffs);
```

In `packages/engine/src/arpg/world.ts`:

Replace:

```ts
import { applyBuffs, manaPool } from '../delve/hero-stats.js';
import { chargeCap, resolveChain } from './abilities/resolve.js';
```

with:

```ts
import { applyBuffs, manaPool } from '../delve/hero-stats.js';
import { buffSum } from '../delve/boons.js';
import { chargeCap, resolveChain } from './abilities/resolve.js';
```

Replace:

```ts
    diveBuffs,
    mana: pool.max,
```

with:

```ts
    diveBuffs,
    boon: buffSum(diveBuffs), // its floor's buffs start empty
    mana: pool.max,
```

Create `packages/engine/src/delve/boons.ts`:

```ts
import type { BoonId, BoonSum, Buff } from '../types/boon.js';

// The boons' pure parts (see the boons spec): the combined view the sim reads, and a boon's count.

/** The fields that sum across entries (counts and additive bonuses). */
const SUMMED = [
  'lifeRegen',
  'lifesteal',
  'bloodPrice',
  'firstMove',
  'stepBonus',
  'dodgeCharges',
  'dodgeWindow',
  'dodgeRecharge',
  'defendDuration',
  'barrierOnFloor',
  'healOnClear',
  'find',
  'magnet',
  'metalUp',
  'scrap',
  'deathLoss',
  'eliteChance',
  'skip',
] as const;

/** Bonuses that multiply per entry, each as (1 + x): the sum keeps the added fraction, Π(1 + x) − 1. */
const COMPOUNDED = ['damage', 'manaRegen', 'maxLife'] as const;

/** Raw factors that multiply per entry. */
const FACTORS = ['flux', 'runes', 'gear'] as const;

/** Flags: on when any entry sets them. */
const FLAGS = [
  'perfectAlways',
  'potions',
  'noPotions',
  'exitRevealed',
  'shrinesLastDive',
  'noSlow',
] as const;

/**
 * The buffs combined by the spec's stacking rule (§2): counts and additive bonuses sum; `damage`,
 * `manaRegen` and `maxLife` compound (Π(1 + x) − 1), `tempo` too as Π(1 − x) read back as
 * 1 − Π(1 − x), and the drop factors multiply; `hazardsFriendly` takes the largest; flags OR; a
 * compound field's bonus part sums and its shape (a threshold, a cap, a radius, seconds) takes the
 * largest; `byKind` sums per kind; `attune` sums by role; `knobs` lists each entry's partial, in
 * order, for `mergeKnobs`. A field no entry sets is absent (neutral). Pure.
 */
export function buffSum(buffs: readonly Buff[]): BoonSum {
  const sum: BoonSum = { knobs: [], attune: { primary: 0, secondary: 0 } };
  for (const { effect: e } of buffs) {
    for (const k of SUMMED) if (e[k] !== undefined) sum[k] = (sum[k] ?? 0) + e[k];
    for (const k of COMPOUNDED)
      if (e[k] !== undefined) sum[k] = (1 + (sum[k] ?? 0)) * (1 + e[k]) - 1;
    for (const k of FACTORS) if (e[k] !== undefined) sum[k] = (sum[k] ?? 1) * e[k];
    for (const k of FLAGS) if (e[k]) sum[k] = true;
    if (e.tempo !== undefined) sum.tempo = 1 - (1 - (sum.tempo ?? 0)) * (1 - e.tempo);
    if (e.hazardsFriendly !== undefined)
      sum.hazardsFriendly = Math.max(sum.hazardsFriendly ?? 0, e.hazardsFriendly);
    if (e.byKind) {
      const by = { ...sum.byKind };
      for (const [kind, x] of Object.entries(e.byKind) as [keyof typeof by, number][])
        by[kind] = (by[kind] ?? 0) + x;
      sum.byKind = by;
    }
    if (e.lowLife)
      sum.lowLife = {
        below: Math.max(sum.lowLife?.below ?? 0, e.lowLife.below),
        mult: (sum.lowLife?.mult ?? 0) + e.lowLife.mult,
      };
    if (e.nearFoes)
      sum.nearFoes = {
        per: (sum.nearFoes?.per ?? 0) + e.nearFoes.per,
        cap: Math.max(sum.nearFoes?.cap ?? 0, e.nearFoes.cap),
        radius: Math.max(sum.nearFoes?.radius ?? 0, e.nearFoes.radius),
      };
    if (e.freeCast)
      sum.freeCast = {
        seconds: Math.max(sum.freeCast?.seconds ?? 0, e.freeCast.seconds),
        damage: (sum.freeCast?.damage ?? 0) + e.freeCast.damage,
      };
    if (e.lastStand)
      sum.lastStand = {
        below: Math.max(sum.lastStand?.below ?? 0, e.lastStand.below),
        reduce: Math.max(sum.lastStand?.reduce ?? 0, e.lastStand.reduce),
        seconds: Math.max(sum.lastStand?.seconds ?? 0, e.lastStand.seconds),
      };
    if (e.attune) sum.attune[e.attune.role] += e.attune.points;
    if (e.knobs) sum.knobs.push(e.knobs);
  }
  return sum;
}

/** How many of `id` the hero wears: its entries (a boon's stacks). */
export function boonCount(buffs: readonly Buff[], id: BoonId): number {
  return buffs.filter((b) => b.boon === id).length;
}
```

In `packages/engine/src/index.ts`:

Replace:

```ts
export type { StopAction } from './delve/stops.js';
export type { ProfileActionResult, ParsedDelveProfile } from './delve/profile.js';
```

with:

```ts
export type { StopAction } from './delve/stops.js';
export { buffSum, boonCount } from './delve/boons.js';
export type { ProfileActionResult, ParsedDelveProfile } from './delve/profile.js';
```

In `packages/engine/src/types/arpg.ts`:

Replace:

```ts
import type { QuestEvent } from './quests.js';
import type { Buff, FloorMap, InteractableKind } from './floor-map.js';
import type { WorldTutorial } from './tutorial.js';
```

with:

```ts
import type { QuestEvent } from './quests.js';
import type { FloorMap, InteractableKind } from './floor-map.js';
import type { BoonSum, Buff } from './boon.js';
import type { WorldTutorial } from './tutorial.js';
```

Replace:

```ts
  diveBuffs: Buff[];
  /** The one mana pool: basic hits fill it, abilities spend it. */
```

with:

```ts
  diveBuffs: Buff[];
  /**
   * `buffSum` of `diveBuffs` and `floorBuffs` (see the boons spec): the combined view every
   * boon field's site reads; set when the hero is made and whenever a buff is added.
   */
  boon: BoonSum;
  /** The one mana pool: basic hits fill it, abilities spend it. */
```

- [ ] **Step 4: Run them to see them pass**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-a-sum.test.ts tests/delve-maps-buffs.test.ts tests/delve-maps-interact.test.ts --reporter=dot)
```

Expected: no type errors; `Test Files  3 passed (3); Tests  27 passed (27)`.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-boons-a
git add packages/engine/src/arpg/interact.ts packages/engine/src/arpg/world.ts packages/engine/src/delve/boons.ts packages/engine/src/index.ts packages/engine/src/types/arpg.ts packages/engine/tests/delve-boons-a-sum.test.ts
git commit -m "feat(engine): buffSum and boonCount; the hero keeps its buffs' sum on HeroEntity.boon" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Boon knobs on every blow and move; the `stackTime` knob

`Knobs.stackTime` (neutral 0, additive in `mergeKnobs`, in `KnobsSchema`; B2 reads it). `HeroStatsExtra.boonKnobs` (default `[]`) is merged into each blow after its runes (`parts = [...socketed.knobs, ...boonKnobs]`; no parts keeps the shared `NEUTRAL`, so a rune-less blow is the very object it was) and kept on `HeroStats.boonKnobs`; `resolveAbility` appends `stats.boonKnobs` to `own`, beside the legendaries' (before the runes, so the Earth-pierce rule reads them as an element's). A blow's `runes` stays its sockets'. Don't run Prettier on `hero-stats.ts`.

**Files:**
- Create: `packages/engine/tests/delve-boons-a-knobs.test.ts`
- Modify: `packages/engine/src/arpg/abilities/resolve.ts`
- Modify: `packages/engine/src/data/schemas.ts`
- Modify: `packages/engine/src/delve/hero-stats.ts`
- Modify: `packages/engine/src/types/ability.ts`
- Modify: `packages/engine/src/types/delve.ts`
- Modify: `packages/engine/tests/ability-resolve.test.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-boons-a-knobs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NEUTRAL, mergeKnobs, resolveAbility } from '../src/arpg/abilities/resolve.js';
import { BoonEffectSchema } from '../src/data/schemas.js';
import { applyBuffs, computeHeroStats } from '../src/delve/hero-stats.js';
import { profileStats } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import type { Blow, Move } from '../src/types/ability.js';
import { gear, registry } from './fixtures/arena.js';

// See the boons spec, "2a. Knobs and attunement": a dive boon's knobs reach every basic blow
// (beside its runes, never in its `runes`) and every move (beside the legendaries'), and
// `stackTime` is a new knob, neutral at 0 and additive.

const SWORD = { weapon: gear('fire') };
const ECHO_III = { id: 'echo', tier: 3 as const };
const light = (runes: Blow['runes'] = []): Blow => ({ kind: 'light', element: 'fire', runes });
const bolt = (over: Partial<Move> = {}): Move => ({
  kind: 'medium',
  form: 'bolt',
  elements: ['fire'],
  ...over,
});

describe('the stackTime knob', () => {
  it('is neutral at 0, adds in mergeKnobs and is a knob boons.json may set', () => {
    expect(NEUTRAL.stackTime).toBe(0);
    expect(mergeKnobs({ stackTime: 0.3 }, { power: 2 }, { stackTime: 0.5 }).stackTime).toBeCloseTo(
      0.8,
      12,
    );
    expect(BoonEffectSchema.safeParse({ knobs: { stackTime: 0.3 } }).success).toBe(true);
    expect(BoonEffectSchema.safeParse({ knobs: { stackTime: -0.3 } }).success).toBe(false);
  });
});

describe("a boon's knobs on the basic blows (computeHeroStats)", () => {
  it('none by default: the blows keep NEUTRAL and the stats carry no boon knobs', () => {
    const s = computeHeroStats(SWORD, registry, { basic: [light()] });
    expect(s.boonKnobs).toEqual([]);
    expect(s.weapon.blows[0].knobs).toBe(NEUTRAL);
  });

  it("merges after the blow's runes, keeps them on the stats, and leaves the blow's runes its sockets'", () => {
    const boonKnobs = [{ echo: 0.15 }, { stacksBonus: 1 }];
    const s = computeHeroStats(SWORD, registry, { basic: [light(), light([ECHO_III])], boonKnobs });
    expect(s.boonKnobs).toEqual(boonKnobs);
    const [bare, echoing] = s.weapon.blows;
    expect([bare.knobs.echo, bare.knobs.stacksBonus]).toEqual([0.15, 1]);
    expect(bare.runes).toEqual([]);
    // Echo takes the largest of the runes' and the boons'.
    expect(echoing.knobs.echo).toBe(0.45);
    expect(echoing.runes).toEqual([ECHO_III]);
    expect(
      computeHeroStats(SWORD, registry, { basic: [light()], boonKnobs: [{ echo: 0.6 }] }).weapon
        .blows[0].knobs.echo,
    ).toBe(0.6);
  });

  it('applyBuffs passes them through', () => {
    const s = computeHeroStats(SWORD, registry, { boonKnobs: [{ echo: 0.15 }] });
    expect(applyBuffs(s, [{ boon: 'vigor', tier: 1, effect: { damage: 0.2 } }]).boonKnobs).toEqual([
      { echo: 0.15 },
    ]);
  });

  it('profileStats carries none', () => {
    expect(
      profileStats(registry, createDelveProfile(registry, 1, { primary: 'fire' })).boonKnobs,
    ).toEqual([]);
  });
});

describe("a boon's knobs on the moves (resolveAbility)", () => {
  const bare = computeHeroStats({}, registry);
  const withBoons = (...boonKnobs: object[]) => ({ ...bare, boonKnobs });

  it('none: the move resolves as before', () => {
    expect(resolveAbility(registry, 'primary', bolt(), 'mana', withBoons())).toEqual(
      resolveAbility(registry, 'primary', bolt(), 'mana', bare),
    );
  });

  it("two Swift Hands entries multiply; Echo takes the larger of a rune's and a boon's", () => {
    const swift = resolveAbility(
      registry,
      'primary',
      bolt(),
      'mana',
      withBoons({ quick: { cooldown: 0.92 } }, { quick: { cooldown: 0.88 } }),
    );
    expect(swift.knobs.quick.cooldown).toBeCloseTo(0.92 * 0.88, 12);
    const echoing = bolt({ runes: [ECHO_III] });
    expect(
      resolveAbility(registry, 'primary', echoing, 'mana', withBoons({ echo: 0.4 })).knobs.echo,
    ).toBe(0.45);
    expect(
      resolveAbility(registry, 'primary', echoing, 'mana', withBoons({ echo: 0.6 })).knobs.echo,
    ).toBe(0.6);
    expect(
      resolveAbility(registry, 'primary', bolt(), 'mana', withBoons({ echo: 0.4 })).knobs.echo,
    ).toBe(0.4);
  });

  it("puts nothing in the move's runes", () => {
    const r = resolveAbility(registry, 'primary', bolt(), 'mana', withBoons({ echo: 0.4 }));
    expect(r.runes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx vitest run tests/delve-boons-a-knobs.test.ts --reporter=dot)
```

Expected: `6 failed | 2 passed (8)`: `NEUTRAL.stackTime` `expected undefined to be +0`, the four blow tests `expected undefined to deeply equal …` (no `boonKnobs` on the stats), and Swift Hands `expected 1 to be close to 0.8096`.

- [ ] **Step 3: Implement**

In `packages/engine/src/arpg/abilities/resolve.ts`:

Replace:

```ts
  guardOnLand: 0,
});
```

with:

```ts
  guardOnLand: 0,
  stackTime: 0,
});
```

Replace:

```ts
 * with its power, `extraShots` adds counts and multiplies powers, `echo` the
 * largest, and each part of `quick` multiplies.
 */
```

with:

```ts
 * with its power, `extraShots` adds counts and multiplies powers, `echo` the
 * largest, each part of `quick` multiplies, and `stackTime` adds.
 */
```

Replace:

```ts
    k.guardOnLand += p.guardOnLand ?? 0;
  }
```

with:

```ts
    k.guardOnLand += p.guardOnLand ?? 0;
    k.stackTime += p.stackTime ?? 0;
  }
```

Replace:

```ts
  }
  const own = [
```

with:

```ts
  }
  // A dive's boons' knobs merge beside the legendaries' (see the boons spec's 2a).
  const own = [
```

Replace:

```ts
    ...legendary,
  ];
```

with:

```ts
    ...legendary,
    ...stats.boonKnobs,
  ];
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
    guardOnLand: z.number().min(0),
  })
```

with:

```ts
    guardOnLand: z.number().min(0),
    stackTime: z.number().min(0),
  })
```

In `packages/engine/src/delve/hero-stats.ts`:

Replace:

```ts
  type Chains,
  type MoveKind,
```

with:

```ts
  type Chains,
  type KnobsData,
  type MoveKind,
```

Replace:

```ts
  basic?: Blow[];
}
```

with:

```ts
  basic?: Blow[];
  /**
   * The dive's boons' knob partials (`diveStats`; default none, so the sandbox, the DPS Lab,
   * Power and `profileStats` see none): merged into each blow after its runes, and kept on
   * `HeroStats.boonKnobs` for the moves (see the boons spec's 2a).
   */
  boonKnobs?: KnobsData[];
}
```

Replace:

```ts
  const perAttune = bal.pair.basicPowerPerAttune;
  const blows = chain.map((b) => {
```

with:

```ts
  const perAttune = bal.pair.basicPowerPerAttune;
  const boonKnobs = extra.boonKnobs ?? [];
  const blows = chain.map((b) => {
```

Replace:

```ts
    // Its runes: those that fit the weapon and act on its kind (a Pierce does nothing on a row
    // that bursts). Without any, it keeps the shared NEUTRAL.
    const on = { weapon: armed?.id ?? null, kind: b.kind, explode: (row.explode ?? 0) > 0 };
    const socketed = runeKnobs(registry, b.runes, on);
    return {
```

with:

```ts
    // Its runes: those that fit the weapon and act on its kind (a Pierce does nothing on a row
    // that bursts), then the dive's boons' knobs (never in its `runes`). Without any, it keeps
    // the shared NEUTRAL.
    const on = { weapon: armed?.id ?? null, kind: b.kind, explode: (row.explode ?? 0) > 0 };
    const socketed = runeKnobs(registry, b.runes, on);
    const parts = [...socketed.knobs, ...boonKnobs];
    return {
```

Replace:

```ts
      attunePower: primary ? 1 + perAttune * attunement[b.element] : 1,
      knobs: socketed.knobs.length > 0 ? mergeKnobs(...socketed.knobs) : NEUTRAL,
      runes: socketed.active,
```

with:

```ts
      attunePower: primary ? 1 + perAttune * attunement[b.element] : 1,
      knobs: parts.length > 0 ? mergeKnobs(...parts) : NEUTRAL,
      runes: socketed.active,
```

Replace:

```ts
    legendaries,
  };
```

with:

```ts
    legendaries,
    boonKnobs,
  };
```

In `packages/engine/src/types/ability.ts`:

Replace:

```ts
  guardOnLand: number;
}
```

with:

```ts
  guardOnLand: number;
  /** Stack duration × (1 + this), where a hit's stacks are applied (a boon's; see the boons spec). */
  stackTime: number;
}
```

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
import type { ManaMap, ManaType } from './mana.js';
import type { AbilitySlot, ChainSkill, FormId, Knobs, MoveKind } from './ability.js';
import type { RunePouch, RuneRef, UnsocketMode } from './rune.js';
```

with:

```ts
import type { ManaMap, ManaType } from './mana.js';
import type { AbilitySlot, ChainSkill, FormId, Knobs, KnobsData, MoveKind } from './ability.js';
import type { RunePouch, RuneRef, UnsocketMode } from './rune.js';
```

Replace:

```ts
  legendaries: Record<string, number>;
}
```

with:

```ts
  legendaries: Record<string, number>;
  /**
   * The dive's boons' knob partials (`HeroStatsExtra.boonKnobs`; none outside a dive's fight):
   * merged into every blow's knobs already, and into every move's by `resolveAbility`.
   */
  boonKnobs: KnobsData[];
}
```

`ability-resolve.test.ts`'s neutral knobs gain `stackTime: 0` (it fails without: `expected { …(19) } to deeply equal { …(18) }`):

In `packages/engine/tests/ability-resolve.test.ts`:

Replace:

```ts
      guardOnLand: 0,
    });
```

with:

```ts
      guardOnLand: 0,
      stackTime: 0,
    });
```

- [ ] **Step 4: Run them to see them pass**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-a-knobs.test.ts tests/ability-resolve.test.ts tests/delve-rune-sim.test.ts tests/delve-runes-contract.test.ts tests/delve-maps-buffs.test.ts --reporter=dot)
```

Expected: no type errors; `Test Files  5 passed (5); Tests  140 passed (140)`.

- [ ] **Step 5: The fingerprint check**

```bash
cd /c/Projects/alloy-boons-a
P=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/40eae1ba-9296-44c8-9c7b-c2e0e4edb2b6/scratchpad
cp $P/boons-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/boons-a-after.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
cmp $P/boons-a-before.json $P/boons-a-after.json
```

Expected: `Tests  1 passed (1)`, and `cmp` prints nothing (identical).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-boons-a
git add packages/engine/src/arpg/abilities/resolve.ts packages/engine/src/data/schemas.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/types/ability.ts packages/engine/src/types/delve.ts packages/engine/tests/ability-resolve.test.ts packages/engine/tests/delve-boons-a-knobs.test.ts
git commit -m "feat(engine): boon knobs reach every blow and move (inert with none worn); the stackTime knob" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: `diveStats`, worn by `beginFloor` and `takeAlcove`

`diveStats(registry, profile)` in `delve/pair.ts`: `profileStats` plus the dive boons' attunement (`buffSum(...).attune`, each role resolved against the pair: the secondary's points to the primary while none is bound; nothing before the choice) and their knob partials. `pairExtra` takes an optional attunement (the Training Grounds' path, so blows' `attunePower`, masteries, the pool and the rune ease all see it). `beginFloor` and `takeAlcove`'s `refreshWorldHero` switch to it; `heroMaxHp` and every Anvil reader keep `profileStats`. Exported from the index. Don't run Prettier on `dive.ts` or `hero-stats.ts`.

**Files:**
- Create: `packages/engine/tests/delve-boons-a-dive-stats.test.ts`
- Modify: `packages/engine/src/delve/dive.ts`
- Modify: `packages/engine/src/delve/hero-stats.ts`
- Modify: `packages/engine/src/delve/pair.ts`
- Modify: `packages/engine/src/delve/stops.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-boons-a-dive-stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stepWorld } from '../src/arpg/step.js';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { applyBuffs } from '../src/delve/hero-stats.js';
import { diveStats, profileStats } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { takeAlcove } from '../src/delve/stops.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { Buff } from '../src/types/boon.js';
import type { DelveProfile } from '../src/types/delve.js';
import { STEP, registry } from './fixtures/arena.js';
import { onMap, twoRooms } from './fixtures/flow-map.js';

// See the boons spec, "2a. Knobs and attunement": `diveStats` is `profileStats` plus the dive
// boons' attunement (by role, against the pair) and their knob partials; the fight's paths
// (`beginFloor`, `takeAlcove`) wear it, while `profileStats` never sees a boon.

const PURE: Buff = {
  boon: 'pure_flame',
  tier: 1,
  effect: { attune: { role: 'primary', points: 4 } },
};
const SECOND: Buff = {
  boon: 'second_flame',
  tier: 2,
  effect: { attune: { role: 'secondary', points: 6 } },
};
const ECHO: Buff = { boon: 'echo', tier: 1, effect: { knobs: { echo: 0.15 } } };

const ring = generateItem(
  registry,
  { uid: 'r1', ilvl: 2, rarity: 'magic', slot: 'ring', mana: 'fire' },
  new SeededRNG(1),
);
/** A Fire hero (Frost bound when `bound`) diving at depth 1, wearing `buffs`, a ring in its bag. */
function diving(buffs: Buff[], bound = true): DelveProfile {
  const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
  const pair = { primary: 'fire' as const, secondary: bound ? ('frost' as const) : null };
  const p = startDive(registry, { ...p0, pair, bag: [ring], scrap: 1000 }, 1);
  return { ...p, dive: { ...p.dive!, diveBuffs: buffs } };
}

describe('diveStats', () => {
  it("is profileStats with no dive or no boons, and profileStats ignores the dive's boons", () => {
    const p = diving([PURE, SECOND, ECHO]);
    expect(diveStats(registry, { ...p, dive: null })).toEqual(profileStats(registry, p));
    expect(diveStats(registry, diving([]))).toEqual(profileStats(registry, p));
  });

  it("adds each role's points to that element of the pair, and lists the knobs", () => {
    const p = diving([PURE, SECOND, ECHO, PURE]);
    const real = profileStats(registry, p);
    const s = diveStats(registry, p);
    expect(s.attunement.fire).toBe(real.attunement.fire + 8);
    expect(s.attunement.frost).toBe(real.attunement.frost + 6);
    expect(s.attunement.storm).toBe(0);
    expect(s.boonKnobs).toEqual([{ echo: 0.15 }]);
    expect(s.weapon.blows.every((b) => b.knobs.echo === 0.15)).toBe(true);
    const perAttune = registry.getDelveBalance().pair.basicPowerPerAttune;
    const blow = s.weapon.blows[0];
    expect(blow.attunePower).toBeCloseTo(1 + perAttune * s.attunement[blow.element], 12);
  });

  it('gives a secondary boon to the primary while no secondary is bound', () => {
    const p = diving([SECOND], false);
    expect(diveStats(registry, p).attunement.fire).toBe(
      profileStats(registry, p).attunement.fire + 6,
    );
  });
});

describe("the fight's paths wear diveStats", () => {
  it('beginFloor', () => {
    const p = diving([PURE, ECHO]);
    const w = beginFloor(registry, p);
    expect(w.hero.baseStats).toEqual(applyBuffs(diveStats(registry, p), p.dive!.diveBuffs));
  });

  it("takeAlcove's refresh", () => {
    const p = diving([PURE, ECHO]);
    const w = onMap(beginFloor(registry, p), twoRooms('alcove', { kind: 'alcove' }, 1));
    w.monsters = [];
    Object.assign(w.hero, { x: 19, y: 7 });
    stepWorld(registry, w, { move: { x: 0, y: 0 }, interact: true }, STEP);
    const res = takeAlcove(registry, p, w, { kind: 'equip', uid: 'r1' });
    expect(res.ok).toBe(true);
    expect(w.hero.baseStats).toEqual(
      applyBuffs(diveStats(registry, res.profile), w.hero.diveBuffs),
    );
    expect(w.hero.baseStats.attunement.fire).toBe(
      profileStats(registry, res.profile).attunement.fire + 4,
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx vitest run tests/delve-boons-a-dive-stats.test.ts --reporter=dot)
```

Expected: `5 failed (5)`, each `TypeError: (0 , diveStats) is not a function`.

- [ ] **Step 3: Implement**

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
import { createFloorWorld, emptyPending, isBossFloor } from '../arpg/world.js';
import { profileStats } from './pair.js';
import { heroChains } from '../loot/moveset.js';
```

with:

```ts
import { createFloorWorld, emptyPending, isBossFloor } from '../arpg/world.js';
import { diveStats, profileStats } from './pair.js';
import { heroChains } from '../loot/moveset.js';
```

Replace:

```ts
  const dive = requireDive(profile, 'fighting');
  const stats = profileStats(registry, profile);
  const mods = dive.door?.mods ?? {};
```

with:

```ts
  const dive = requireDive(profile, 'fighting');
  const stats = diveStats(registry, profile);
  const mods = dive.door?.mods ?? {};
```

In `packages/engine/src/delve/hero-stats.ts`:

Replace:

```ts
/** The extra that applies a profile's pair (its power and the two-element limit) and its basic chain. */
export function pairExtra(pair?: ManaPair, basic?: Blow[]): HeroStatsExtra {
  return { ...(pair ? { pair, filterAttunement: true } : {}), basic };
}
```

with:

```ts
/**
 * The extra that applies a profile's pair (its power and the two-element limit) and its basic
 * chain, and any attunement on top (a dive's boons': `diveStats`).
 */
export function pairExtra(
  pair?: ManaPair,
  basic?: Blow[],
  attunement?: Partial<ManaMap>,
): HeroStatsExtra {
  return {
    ...(pair ? { pair, filterAttunement: true } : {}),
    basic,
    ...(attunement ? { attunement } : {}),
  };
}
```

In `packages/engine/src/delve/pair.ts`:

Replace:

```ts
import { GEAR_SLOTS, type GearItem, type HeroStatKey, type StatRoll } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { isDiveActive } from './dive.js';
```

with:

```ts
import { GEAR_SLOTS, type GearItem, type HeroStatKey, type StatRoll } from '../types/gear.js';
import type { ManaMap, ManaType } from '../types/mana.js';
import { buffSum } from './boons.js';
import { isDiveActive } from './dive.js';
```

Replace:

```ts
  return computeHeroStats(profile.equipped, registry, pairExtra(profile.pair, basic));
}
```

with:

```ts
  return computeHeroStats(profile.equipped, registry, pairExtra(profile.pair, basic));
}

/**
 * The hero's stats in a dive's fight (see the boons spec's 2a): `profileStats` plus its dive
 * boons' attunement (each role resolved against the pair; a secondary while none is bound goes to
 * the primary; none before the choice) and their knob partials (`HeroStatsExtra.boonKnobs`).
 * `beginFloor` and the mid-floor refreshes wear it; everything valued at the Anvil (the roll
 * floor, Power, `compareItem`, the overtake) keeps `profileStats`, which never sees a boon.
 */
export function diveStats(
  registry: DataRegistry,
  profile: Pick<DelveProfile, 'equipped' | 'pair' | 'dive'>,
): HeroStats {
  const basic = heroChains(registry, profile.equipped, profile.pair).basic;
  const sum = buffSum(profile.dive?.diveBuffs ?? []);
  const { primary, secondary } = profile.pair;
  const attunement: Partial<ManaMap> = {};
  const add = (m: ManaType | null, points: number) => {
    if (m && points) attunement[m] = (attunement[m] ?? 0) + points;
  };
  add(primary, sum.attune.primary);
  add(secondary ?? primary, sum.attune.secondary);
  return computeHeroStats(profile.equipped, registry, {
    ...pairExtra(profile.pair, basic, attunement),
    boonKnobs: sum.knobs,
  });
}
```

In `packages/engine/src/delve/stops.ts`:

Replace:

```ts
import { openedAlcove } from '../arpg/interact.js';
import { profileStats } from './pair.js';
import { applyTutorialEvents, tutorialStep } from './tutorial.js';
```

with:

```ts
import { openedAlcove } from '../arpg/interact.js';
import { diveStats } from './pair.js';
import { applyTutorialEvents, tutorialStep } from './tutorial.js';
```

Replace:

```ts
 * banked); an op taken marks the alcove used (`DiveState.used` and the
 * world's) and refreshes the hero (`refreshWorldHero` with the new gear and
 * chains, its blessings kept; a changed Find moves `world.loot.find`).
 */
```

with:

```ts
 * banked); an op taken marks the alcove used (`DiveState.used` and the
 * world's) and refreshes the hero (`refreshWorldHero` with the new gear's
 * `diveStats` and chains, its blessings kept; a changed Find moves `world.loot.find`).
 */
```

Replace:

```ts
    world,
    profileStats(registry, next),
    heroChains(registry, next.equipped, next.pair),
```

with:

```ts
    world,
    diveStats(registry, next),
    heroChains(registry, next.equipped, next.pair),
```

In `packages/engine/src/index.ts`:

Replace:

```ts
  profileStats,
  fixChainsToPair,
```

with:

```ts
  profileStats,
  diveStats,
  fixChainsToPair,
```

- [ ] **Step 4: Run them to see them pass**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-a-dive-stats.test.ts tests/delve-maps-flow.test.ts tests/delve-maps-save.test.ts tests/delve-pair.test.ts tests/delve-stops.test.ts --reporter=dot)
```

Expected: no type errors; `Test Files  5 passed (5); Tests  81 passed (81)`.

- [ ] **Step 5: The fingerprint check**

```bash
cd /c/Projects/alloy-boons-a
P=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/40eae1ba-9296-44c8-9c7b-c2e0e4edb2b6/scratchpad
cp $P/boons-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/boons-a-after.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
cmp $P/boons-a-before.json $P/boons-a-after.json
```

Expected: `Tests  1 passed (1)`, and `cmp` prints nothing (identical).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-boons-a
git add packages/engine/src/delve/dive.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/delve/pair.ts packages/engine/src/delve/stops.ts packages/engine/src/index.ts packages/engine/tests/delve-boons-a-dive-stats.test.ts
git commit -m "feat(engine): diveStats, the fight's stats with the dive boons' attunement and knobs; beginFloor and takeAlcove wear it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: The stop union, the `boon` action, a door's `boons`

`DiveStop` becomes the contract's union (with `BoonStop` and `PowerupStop`), `DoorMods.boons` joins the type, the data schema and the save's `DoorSchema`, and the save's `stop` is a discriminated union. `StopAction` gains `{ kind: 'boon'; index }`, refused by `takeStop` ("Not offered at this stop") and `takeAlcove` ("Not offered at this anvil"); `runStop` takes only the power-up actions. `rollStop` returns `kind: 'powerups'` (guided and ordinary alike). Every reader narrows on `kind` first: `takeStop`, `chooseDoor`'s required check, the tutorial's skip, the autopilot's `takeBestAlcove` stop, `bestStop`, `takeGuidedStop` and the tutorial run's `run.stops`. Don't run Prettier on `autopilot.ts`, `dive.ts` or `delve-autopilot-crafting.test.ts`.

**Files:**
- Create: `packages/engine/tests/delve-boons-a-stop.test.ts`
- Modify: `packages/engine/src/data/schemas.ts`
- Modify: `packages/engine/src/delve/autopilot.ts`
- Modify: `packages/engine/src/delve/dive.ts`
- Modify: `packages/engine/src/delve/profile-schema.ts`
- Modify: `packages/engine/src/delve/stops.ts`
- Modify: `packages/engine/src/delve/tutorial.ts`
- Modify: `packages/engine/src/types/delve.ts`
- Modify: `packages/engine/tests/delve-autopilot-crafting.test.ts`
- Modify: `packages/engine/tests/delve-banking.test.ts`
- Modify: `packages/engine/tests/delve-rune-power.test.ts`
- Modify: `packages/engine/tests/delve-runes-contract.test.ts`
- Modify: `packages/engine/tests/delve-runes.test.ts`
- Modify: `packages/engine/tests/delve-stops.test.ts`
- Modify: `packages/engine/tests/delve-tutorial-runner-dive.test.ts`
- Modify: `packages/engine/tests/delve-tutorial-runner-rule.test.ts`
- Modify: `packages/engine/tests/delve-tutorial-runner-script.test.ts`
- Modify: `packages/engine/tests/delve-tutorial-save.test.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-boons-a-stop.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stepWorld } from '../src/arpg/step.js';
import { DelveDataSchema } from '../src/data/schemas.js';
import delveData from '../src/data/delve.json';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { rollStop, takeAlcove, takeStop } from '../src/delve/stops.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile, DiveStop } from '../src/types/delve.js';
import { STEP, registry } from './fixtures/arena.js';
import { armed } from './fixtures/carries.js';
import { onMap, twoRooms } from './fixtures/flow-map.js';

// See the boons spec, "4. The stop": a stop is a `boons` stop or a `powerups` one. In Phase A
// every stop still rolls power-ups and a `boon` action is refused (B1 fills both).

const ring = generateItem(
  registry,
  { uid: 'r1', ilvl: 2, rarity: 'magic', slot: 'ring', mana: 'fire' },
  new SeededRNG(1),
);
const hero = (): DelveProfile => ({
  ...armed(registry, createDelveProfile(registry, 3, { primary: 'fire' })),
  bag: [ring],
  scrap: 1000,
});
/** `p` diving, on the door screen after depth 1, holding `stop`. */
function atStop(p: DelveProfile, stop: DiveStop | null): DelveProfile {
  const dive = startDive(registry, p, 1).dive!;
  return {
    ...p,
    dive: { ...dive, phase: 'choosing', depthsCleared: 1, doorChoices: ['winding'], stop },
  };
}
const BOONS: DiveStop = { kind: 'boons', offers: [{ id: 'vigor', tier: 1 }], taken: false };

describe('the stop union', () => {
  it("rolls a 'powerups' stop", () => {
    const p = hero();
    expect(rollStop(registry, p, startDive(registry, p, 1).dive!)).toMatchObject({
      kind: 'powerups',
      taken: false,
    });
  });

  it("refuses a boon on either kind of stop, and a power-up on a 'boons' stop", () => {
    const refused = { ok: false, reason: 'Not offered at this stop' };
    const powerups = atStop(hero(), { kind: 'powerups', offers: ['equip'], taken: false });
    expect(takeStop(registry, powerups, { kind: 'boon', index: 0 })).toMatchObject(refused);
    const boons = atStop(hero(), BOONS);
    expect(takeStop(registry, boons, { kind: 'boon', index: 0 })).toMatchObject(refused);
    expect(takeStop(registry, boons, { kind: 'equip', uid: 'r1' })).toMatchObject(refused);
    expect(takeStop(registry, powerups, { kind: 'equip', uid: 'r1' }).ok).toBe(true);
  });

  it('an alcove refuses a boon', () => {
    const p = startDive(registry, hero(), 1);
    const w = onMap(beginFloor(registry, p), twoRooms('alcove', { kind: 'alcove' }, 1));
    w.monsters = [];
    Object.assign(w.hero, { x: 19, y: 7 });
    stepWorld(registry, w, { move: { x: 0, y: 0 }, interact: true }, STEP);
    expect(takeAlcove(registry, p, w, { kind: 'boon', index: 0 })).toMatchObject({
      ok: false,
      reason: 'Not offered at this anvil',
    });
  });

  it("a save keeps either kind, and a door's boons", () => {
    const door = { ...registry.getDoor('winding'), mods: { boons: 0.5 } };
    for (const stop of [
      BOONS,
      { kind: 'powerups', offers: ['slot'], taken: true, required: true },
    ] as DiveStop[]) {
      const p = atStop(hero(), stop);
      const saved = { ...p, dive: { ...p.dive!, door } };
      const parsed = parseDelveProfile(registry, JSON.parse(JSON.stringify(saved)));
      expect(parsed && 'profile' in parsed ? parsed.profile.dive : null).toMatchObject({
        stop,
        door,
      });
    }
  });

  it("delve.json's doors may carry boons", () => {
    const withBoons = structuredClone(delveData);
    withBoons.doors[0].mods = { ...withBoons.doors[0].mods, boons: 0.5 } as never;
    const parsed = DelveDataSchema.parse(withBoons);
    expect(parsed.doors[0].mods.boons).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx vitest run tests/delve-boons-a-stop.test.ts --reporter=dot)
```

Expected: `3 failed | 2 passed (5)`: `rolls a 'powerups' stop` (`expected { Object (offers, taken) } to match object { kind: 'powerups', … }`), the save (`expected null to match object …`: the old schema refuses a `kind`), and the door (`expected undefined to be 0.5`: the data schema strips `boons`). The two refusal tests pass at the base (a `boon` is in no offer): they guard the narrowing.

- [ ] **Step 3: Implement**

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
          find: z.number().optional(),
        }),
```

with:

```ts
          find: z.number().optional(),
          boons: z.number().min(0).max(1).optional(),
        }),
```

In `packages/engine/src/delve/autopilot.ts`:

Replace:

```ts
  if (!dive || offers.length === 0) return profile;
  const stop = { offers, taken: false };
  const banked = addHaul(dive.banked, dive.haul);
```

with:

```ts
  if (!dive || offers.length === 0) return profile;
  const stop = { kind: 'powerups' as const, offers, taken: false };
  const banked = addHaul(dive.banked, dive.haul);
```

Replace:

```ts
  const stop = profile.dive?.stop;
  if (!stop || stop.taken) return profile;
  if (stop.offers.includes('equip')) {
```

with:

```ts
  const stop = profile.dive?.stop;
  if (!stop || stop.taken || stop.kind !== 'powerups') return profile;
  if (stop.offers.includes('equip')) {
```

Replace:

```ts
  const stop = laddered.dive?.stop;
  if (!stop || stop.taken) return laddered;
  const take = (action: StopAction) => {
```

with:

```ts
  const stop = laddered.dive?.stop;
  if (!stop || stop.taken || stop.kind !== 'powerups') return laddered;
  const take = (action: StopAction) => {
```

Replace:

```ts
  const items = [...GEAR_SLOTS.flatMap((s) => profile.equipped[s] ?? []), ...profile.bag];
  const actions: StopAction[] = [
    ...profile.bag.map((i) => ({ kind: 'equip', uid: i.uid }) as const),
```

with:

```ts
  const items = [...GEAR_SLOTS.flatMap((s) => profile.equipped[s] ?? []), ...profile.bag];
  const actions: Exclude<StopAction, { kind: 'boon' }>[] = [
    ...profile.bag.map((i) => ({ kind: 'equip', uid: i.uid }) as const),
```

Replace:

```ts
      const guided = tutorialStep(registry, p.tutorial)?.stop;
      if (guided) run?.stops.push(p.dive!.stop?.offers ?? []);
      p = guided ? takeGuidedStop(registry, p) : takeBestStop(registry, p);
```

with:

```ts
      const guided = tutorialStep(registry, p.tutorial)?.stop;
      const stop = p.dive!.stop;
      if (guided) run?.stops.push(stop?.kind === 'powerups' ? stop.offers : []);
      p = guided ? takeGuidedStop(registry, p) : takeBestStop(registry, p);
```

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
  const dive = requireDive(profile, 'choosing');
  if (dive.stop?.required && !dive.stop.taken) throw new Error('Take the power-up first');
  if (!dive.doorChoices.includes(doorId)) throw new Error(`Door not offered: ${doorId}`);
```

with:

```ts
  const dive = requireDive(profile, 'choosing');
  if (dive.stop?.kind === 'powerups' && dive.stop.required && !dive.stop.taken) throw new Error('Take the power-up first');
  if (!dive.doorChoices.includes(doorId)) throw new Error(`Door not offered: ${doorId}`);
```

In `packages/engine/src/delve/profile-schema.ts`:

Replace:

```ts
    find: z.number().optional(),
  }),
```

with:

```ts
    find: z.number().optional(),
    boons: z.number().min(0).max(1).optional(),
  }),
```

Replace:

```ts
  runesEarned: z.number().int().min(0).default(0),
  // A stop between depths: its kinds are `STOP_KINDS` (delve/stops.ts).
  stop: z
    .object({
      offers: z.array(z.enum(['equip', 'slot', 'move', 'upgrade', 'rune'])),
      taken: z.boolean(),
      required: z.boolean().optional(),
    })
    .nullable()
```

with:

```ts
  runesEarned: z.number().int().min(0).default(0),
  // A stop between depths: its boons, or its power-ups, whose kinds are `STOP_KINDS` (delve/stops.ts).
  stop: z
    .discriminatedUnion('kind', [
      z.object({
        kind: z.literal('boons'),
        offers: z.array(
          z.object({
            id: z.string().min(1),
            tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
          }),
        ),
        taken: z.boolean(),
      }),
      z.object({
        kind: z.literal('powerups'),
        offers: z.array(z.enum(['equip', 'slot', 'move', 'upgrade', 'rune'])),
        taken: z.boolean(),
        required: z.boolean().optional(),
      }),
    ])
    .nullable()
```

In `packages/engine/src/delve/stops.ts`:

Replace:

```ts
/** What a stop's player takes: the kind and what it acts on. */
export type StopAction =
  | { kind: 'equip'; uid: string }
```

with:

```ts
/** What a stop's player takes: the kind and what it acts on (`boon`: a `boons` stop's card by index). */
export type StopAction =
  | { kind: 'boon'; index: number }
  | { kind: 'equip'; uid: string }
```

Replace:

```ts
    if (offers.length === 0) return null;
    return { offers, taken: false, required: step.trigger.type === 'takeStop' };
  }
```

with:

```ts
    if (offers.length === 0) return null;
    return { kind: 'powerups', offers, taken: false, required: step.trigger.type === 'takeStop' };
  }
```

Replace:

```ts
  return {
    offers: pickKinds(kinds, new SeededRNG(dive.seed).fork(`stop:${dive.depth}`)),
```

with:

```ts
  return {
    kind: 'powerups',
    offers: pickKinds(kinds, new SeededRNG(dive.seed).fork(`stop:${dive.depth}`)),
```

Replace:

```ts
/** The stop's one op on `profile` (whose dive the caller has lifted). */
```

with:

```ts
/** A power-up's action: what `runStop` runs. */
type PowerupAction = Exclude<StopAction, { kind: 'boon' }>;

/** The stop's one op on `profile` (whose dive the caller has lifted). */
```

Replace:

```ts
  registry: DataRegistry,
  profile: DelveProfile,
  action: StopAction,
): ProfileActionResult {
  switch (action.kind) {
```

with:

```ts
  registry: DataRegistry,
  profile: DelveProfile,
  action: PowerupAction,
): ProfileActionResult {
  switch (action.kind) {
```

Replace:

```ts
  if (stop.taken) return { ok: false, profile, reason: "This stop's power-up is taken" };
  if (!stop.offers.includes(action.kind))
    return { ok: false, profile, reason: 'Not offered at this stop' };
```

with:

```ts
  if (stop.taken) return { ok: false, profile, reason: "This stop's power-up is taken" };
  // A boon is refused until the stop rolls boons (the boons spec's B1); a power-up only where offered.
  if (action.kind === 'boon' || stop.kind !== 'powerups' || !stop.offers.includes(action.kind))
    return { ok: false, profile, reason: 'Not offered at this stop' };
```

Replace:

```ts
  if (!live || !alcove) return { ok: false, profile, reason: 'No anvil here' };
  if (!alcoveOffers(registry, profile, world, alcove.id).includes(action.kind))
    return { ok: false, profile, reason: 'Not offered at this anvil' };
```

with:

```ts
  if (!live || !alcove) return { ok: false, profile, reason: 'No anvil here' };
  if (
    action.kind === 'boon' ||
    !alcoveOffers(registry, profile, world, alcove.id).includes(action.kind)
  )
    return { ok: false, profile, reason: 'Not offered at this anvil' };
```

In `packages/engine/src/delve/tutorial.ts`:

Replace:

```ts
      tutorialEntry: null,
      stop: dive.stop && { ...dive.stop, required: false },
    },
```

with:

```ts
      tutorialEntry: null,
      stop:
        dive.stop &&
        (dive.stop.kind === 'powerups' ? { ...dive.stop, required: false } : dive.stop),
    },
```

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
import type { AiBalance, LayoutBalance, LayoutsData, TerrainBalance } from './floor-map.js';
import type { Buff } from './boon.js';
import type { TutorialState } from './tutorial.js';
```

with:

```ts
import type { AiBalance, LayoutBalance, LayoutsData, TerrainBalance } from './floor-map.js';
import type { BoonOffer, Buff } from './boon.js';
import type { TutorialState } from './tutorial.js';
```

Replace:

```ts
  find?: number;
}
```

with:

```ts
  find?: number;
  /** Chance each card of the stop after this door's depth comes a tier up (see the boons spec's 4). */
  boons?: number;
}
```

Replace:

```ts
/** A stop between depths (see the weapon movesets spec): the kinds offered, and whether one is taken. */
export interface DiveStop {
  offers: StopKind[];
  taken: boolean;
  /** A tutorial stop's power-up must be taken before a door (see the tutorial spec's gates). */
  required?: boolean;
}
```

with:

```ts
/** A stop between depths (see the weapon movesets spec): the kinds offered, and whether one is taken. */
/**
 * The stop between depths (see the boons spec's 4): an ordinary stop's three boons, or a guided
 * stop's power-ups (`required`: a tutorial stop's power-up must be taken before a door; see the
 * tutorial spec's gates). Every reader narrows on `kind` before `offers`.
 */
export type DiveStop =
  | { kind: 'boons'; offers: BoonOffer[]; taken: boolean }
  | { kind: 'powerups'; offers: StopKind[]; taken: boolean; required?: boolean };
export type BoonStop = Extract<DiveStop, { kind: 'boons' }>;
export type PowerupStop = Extract<DiveStop, { kind: 'powerups' }>;
```

The tests whose stop literals need `kind: 'powerups'` (they would fail `toEqual` against `rollStop` or the save):

In `packages/engine/tests/delve-autopilot-crafting.test.ts`:

Replace:

```ts
        doorChoices: ['winding'],
        stop: { offers: ['upgrade'], taken: false },
        banked: { ...dive.banked, scrap: cost },
```

with:

```ts
        doorChoices: ['winding'],
        stop: { kind: 'powerups', offers: ['upgrade'], taken: false },
        banked: { ...dive.banked, scrap: cost },
```

In `packages/engine/tests/delve-banking.test.ts`:

Replace:

```ts
    const cleared = completeFloor(registry, p, world).profile;
    const stop = { offers: ['slot' as const], taken: false };
    const atStop = { ...cleared, dive: { ...cleared.dive!, stop } };
```

with:

```ts
    const cleared = completeFloor(registry, p, world).profile;
    const stop = { kind: 'powerups' as const, offers: ['slot' as const], taken: false };
    const atStop = { ...cleared, dive: { ...cleared.dive!, stop } };
```

In `packages/engine/tests/delve-rune-power.test.ts`:

Replace:

```ts
      { ...bolt(veteran(), [null]), runes: { echo: [0, 0, 1, 0, 0] }, scrap: 1000 },
      { offers: ['rune', 'upgrade'], taken: false },
    );
```

with:

```ts
      { ...bolt(veteran(), [null]), runes: { echo: [0, 0, 1, 0, 0] }, scrap: 1000 },
      { kind: 'powerups', offers: ['rune', 'upgrade'], taken: false },
    );
```

In `packages/engine/tests/delve-runes-contract.test.ts`:

Replace:

```ts
    const { runesEarned: _r, ...dive } = p.dive!;
    const stop = { offers: ['rune'], taken: false };
    const res = parseDelveProfile(registry, json({ ...p, dive: { ...dive, stop } }))!;
```

with:

```ts
    const { runesEarned: _r, ...dive } = p.dive!;
    const stop = { kind: 'powerups' as const, offers: ['rune'], taken: false };
    const res = parseDelveProfile(registry, json({ ...p, dive: { ...dive, stop } }))!;
```

In `packages/engine/tests/delve-runes.test.ts`:

Replace:

```ts
    const diving = startDive(registry, p, 1);
    const stop = { offers, taken: false };
    const dive = { ...diving.dive!, phase: 'choosing' as const, depthsCleared: 1, stop };
```

with:

```ts
    const diving = startDive(registry, p, 1);
    const stop = { kind: 'powerups' as const, offers, taken: false };
    const dive = { ...diving.dive!, phase: 'choosing' as const, depthsCleared: 1, stop };
```

In `packages/engine/tests/delve-stops.test.ts`:

Replace:

```ts
const ALL: DiveStop = { offers: [...STOP_KINDS], taken: false };
```

with:

```ts
const ALL: DiveStop = { kind: 'powerups', offers: [...STOP_KINDS], taken: false };
```

Replace:

```ts
  it('counts and spends what the dive banked first, then the stockpile (S9)', () => {
    const p = atStop(hero(), { offers: ['slot'], taken: false });
    const banking = (links: number, scrap: number, on: DelveProfile = p) => ({
```

with:

```ts
  it('counts and spends what the dive banked first, then the stockpile (S9)', () => {
    const p = atStop(hero(), { kind: 'powerups', offers: ['slot'], taken: false });
    const banking = (links: number, scrap: number, on: DelveProfile = p) => ({
```

Replace:

```ts
    const dive = startDive(registry, two, 1).dive!;
    expect(rollStop(registry, two, dive)).toEqual({ offers: ['move', 'upgrade'], taken: false });
    // One kind that applies: that one alone.
```

with:

```ts
    const dive = startDive(registry, two, 1).dive!;
    expect(rollStop(registry, two, dive)).toEqual({
      kind: 'powerups',
      offers: ['move', 'upgrade'],
      taken: false,
    });
    // One kind that applies: that one alone.
```

Replace:

```ts
    const one = { ...bare, bag: [] };
    expect(rollStop(registry, one, dive)).toEqual({ offers: ['upgrade'], taken: false });
  });
```

with:

```ts
    const one = { ...bare, bag: [] };
    expect(rollStop(registry, one, dive)).toEqual({
      kind: 'powerups',
      offers: ['upgrade'],
      taken: false,
    });
  });
```

Replace:

```ts
  it('refuses a kind not offered, no stop, and leaves the stop open when the op is refused', () => {
    const p = atStop(hero(), { offers: ['equip', 'slot'], taken: false });
    expect(takeStop(registry, p, { kind: 'upgrade', uid: 'r1' }).reason).toBe(
```

with:

```ts
  it('refuses a kind not offered, no stop, and leaves the stop open when the op is refused', () => {
    const p = atStop(hero(), { kind: 'powerups', offers: ['equip', 'slot'], taken: false });
    expect(takeStop(registry, p, { kind: 'upgrade', uid: 'r1' }).reason).toBe(
```

Replace:

```ts
  it('the save keeps the stop; a dive saved without one reads as none', () => {
    const p = atStop(hero(), { offers: ['equip', 'move'], taken: true });
    const json = (x: unknown) => JSON.parse(JSON.stringify(x));
```

with:

```ts
  it('the save keeps the stop; a dive saved without one reads as none', () => {
    const p = atStop(hero(), { kind: 'powerups', offers: ['equip', 'move'], taken: true });
    const json = (x: unknown) => JSON.parse(JSON.stringify(x));
```

Replace:

```ts
describe('the autopilot at a stop', () => {
  const stopOf = (...offers: StopKind[]): DiveStop => ({ offers, taken: false });
  const plain = (uid: string): GearItem =>
```

with:

```ts
describe('the autopilot at a stop', () => {
  const stopOf = (...offers: StopKind[]): DiveStop => ({ kind: 'powerups', offers, taken: false });
  const plain = (uid: string): GearItem =>
```

In `packages/engine/tests/delve-tutorial-runner-dive.test.ts`:

Replace:

```ts
    expect(stopped.dive!.stop).toEqual({
      offers: ['equip', 'upgrade'],
```

with:

```ts
    expect(stopped.dive!.stop).toEqual({
      kind: 'powerups',
      offers: ['equip', 'upgrade'],
```

In `packages/engine/tests/delve-tutorial-runner-rule.test.ts`:

Replace:

```ts
        tutorialEntry: { ...p, dive },
        stop: { offers: ['equip'], taken: false, required: true },
      },
```

with:

```ts
        tutorialEntry: { ...p, dive },
        stop: { kind: 'powerups', offers: ['equip'], taken: false, required: true },
      },
```

Replace:

```ts
    expect(p.dive!.tutorialEntry).toBeNull();
    expect(p.dive!.stop).toEqual({ offers: ['equip'], taken: false, required: false });
  });
```

with:

```ts
    expect(p.dive!.tutorialEntry).toBeNull();
    expect(p.dive!.stop).toEqual({
      kind: 'powerups',
      offers: ['equip'],
      taken: false,
      required: false,
    });
  });
```

In `packages/engine/tests/delve-tutorial-runner-script.test.ts`:

Replace:

```ts
    expect(stopped.tutorial).toEqual(st('s1-equip'));
    expect(stopped.dive!.stop).toEqual({ offers: ['equip'], taken: false, required: true });
    expect(stopped.dive!.doorChoices).toEqual(['winding']);
```

with:

```ts
    expect(stopped.tutorial).toEqual(st('s1-equip'));
    expect(stopped.dive!.stop).toEqual({
      kind: 'powerups',
      offers: ['equip'],
      taken: false,
      required: true,
    });
    expect(stopped.dive!.doorChoices).toEqual(['winding']);
```

In `packages/engine/tests/delve-tutorial-save.test.ts`:

Replace:

```ts
      tutorialEntry: entry,
      stop: { offers: ['equip'], taken: false, required: true },
    },
```

with:

```ts
      tutorialEntry: entry,
      stop: { kind: 'powerups', offers: ['equip'], taken: false, required: true },
    },
```

- [ ] **Step 4: Run them to see them pass**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-a-stop.test.ts tests/delve-stops.test.ts tests/delve-banking.test.ts tests/delve-rune-power.test.ts tests/delve-runes-contract.test.ts tests/delve-runes.test.ts tests/delve-tutorial-runner-rule.test.ts tests/delve-tutorial-runner-script.test.ts tests/delve-tutorial-save.test.ts tests/delve-tutorial-runner-dive.test.ts tests/delve-autopilot-crafting.test.ts tests/delve-maps-flow.test.ts tests/delve-maps-bot.test.ts --reporter=dot)
```

Expected: no type errors; `Test Files  13 passed (13); Tests  206 passed (206)`.

- [ ] **Step 5: The fingerprint check**

```bash
cd /c/Projects/alloy-boons-a
P=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/40eae1ba-9296-44c8-9c7b-c2e0e4edb2b6/scratchpad
cp $P/boons-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/boons-a-after.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
cmp $P/boons-a-before.json $P/boons-a-after.json
```

Expected: `Tests  1 passed (1)`, and `cmp` prints nothing (identical).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-boons-a
git add packages/engine/src/data/schemas.ts packages/engine/src/delve/autopilot.ts packages/engine/src/delve/dive.ts packages/engine/src/delve/profile-schema.ts packages/engine/src/delve/stops.ts packages/engine/src/delve/tutorial.ts packages/engine/src/types/delve.ts packages/engine/tests/delve-autopilot-crafting.test.ts packages/engine/tests/delve-banking.test.ts packages/engine/tests/delve-boons-a-stop.test.ts packages/engine/tests/delve-rune-power.test.ts packages/engine/tests/delve-runes-contract.test.ts packages/engine/tests/delve-runes.test.ts packages/engine/tests/delve-stops.test.ts packages/engine/tests/delve-tutorial-runner-dive.test.ts packages/engine/tests/delve-tutorial-runner-rule.test.ts packages/engine/tests/delve-tutorial-runner-script.test.ts packages/engine/tests/delve-tutorial-save.test.ts
git commit -m "feat(engine): the stop is a boons or a powerups stop; the boon action, refused for now; a door's boons" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: An echo's `hit` event says so

`HitOpts.echo?: true`, the `hit` event's `echo?: true` and the `slash` event's (a `replay` Strike's, added only when set; `landBlow` pushes no `slash`), set where a hit comes from an echo: `hitOpts` for a `replay` ability (its every hit and chain jump), `landBlow`'s melee hits for `o.echo`, a basic shot's direct hit (`step.ts`) and burst (`burstShot`) for `p.replay`. No number moves.

**Files:**
- Create: `packages/engine/tests/delve-boons-a-echo.test.ts`
- Modify: `packages/engine/src/arpg/abilities/impact.ts`
- Modify: `packages/engine/src/arpg/abilities/forms.ts`
- Modify: `packages/engine/src/arpg/basic.ts`
- Modify: `packages/engine/src/arpg/combat.ts`
- Modify: `packages/engine/src/arpg/step.ts`
- Modify: `packages/engine/src/types/arpg.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-boons-a-echo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { Blow } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import { STEP, arena, dummy, firstBlow, gear, press, registry, run } from './fixtures/arena.js';

// See the boons spec, "8. Performance": a hit an echo deals carries `echo: true` on its `hit`
// event (the client skips its hit-stop and kick); its numbers don't change.

const ECHO_III = { id: 'echo', tier: 3 as const };
const hits = (events: ArpgEvent[], source: 'skill' | 'basic') =>
  events.flatMap((e) => (e.kind === 'hit' && e.source === source ? [e] : []));
/** Step `w` until an echo goes off (at most 3 s), returning every event. */
function untilEcho(w: ArpgWorld): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  for (let i = 0; i < 90 && !events.some((e) => e.kind === 'runeFx' && e.effect === 'echo'); i++)
    events.push(...run(w, STEP));
  return [...events, ...run(w, 1)];
}

describe("an echo's hit events", () => {
  it("an ability's: the cast's hit unmarked, its echo's marked", () => {
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { runes: [ECHO_III] } });
    w.hero.stats.critChance = 0;
    const cast = press(w, 0);
    for (let i = 0; i < 60 && hits(cast, 'skill').length === 0; i++) cast.push(...run(w, STEP));
    const [first] = hits(cast, 'skill');
    expect(first.echo).toBeUndefined();
    const echoed = hits(untilEcho(w), 'skill');
    expect(echoed).toHaveLength(1);
    expect(echoed[0].echo).toBe(true);
    expect(echoed[0].amount).toBeCloseTo(first.amount * 0.45, 6);
  });

  it("a blow's: the swing's hit unmarked, its echo's marked", () => {
    const sword = { weapon: gear('fire') };
    const w = arena([dummy(13, 34.5)], { equipped: sword });
    const basic: Blow[] = [{ kind: 'light', element: 'fire', runes: [ECHO_III] }];
    w.hero.stats = computeHeroStats(sword, registry, { basic });
    const [hit] = hits(firstBlow(w), 'basic');
    expect(hit.echo).toBeUndefined();
    w.hero.nextAttackAt = 1e9;
    const echoed = hits(untilEcho(w), 'basic');
    expect(echoed).toHaveLength(1);
    expect(echoed[0].echo).toBe(true);
  });

  it("a Strike's slash: the cast's unmarked, its echo's marked", () => {
    const strike = { form: 'strike' as const, runes: [ECHO_III] };
    const w = arena([dummy(13, 34)], { noBasic: true, primary: strike });
    const slashes = [...press(w, 0), ...untilEcho(w)].filter((e) => e.kind === 'slash');
    expect(slashes).toHaveLength(2);
    expect(slashes[0].echo).toBeUndefined();
    expect(slashes[1].echo).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx vitest run tests/delve-boons-a-echo.test.ts --reporter=dot)
```

Expected: `3 failed (3)`, each `expected undefined to be true` on the echo's hit or slash.

- [ ] **Step 3: Implement**

In `packages/engine/src/arpg/abilities/impact.ts`:

Replace:

```ts
    stacks: direct ? ab.stacks : undefined,
  };
```

with:

```ts
    stacks: direct ? ab.stacks : undefined,
    ...(ab.replay ? { echo: true as const } : {}),
  };
```

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
  const rattles = element === 'earth' || !!surge?.elements.includes('earth');
  const knobbed = knobHitOpts(k);
```

with:

```ts
  const rattles = element === 'earth' || !!surge?.elements.includes('earth');
  // An Echo's blow marks its hits (see the boons spec's 8).
  const knobbed = { ...knobHitOpts(k), ...(o.echo ? { echo: true as const } : {}) };
```

Replace:

```ts
      ...(p.knobs ? knobHitOpts(p.knobs) : {}),
    });
```

with:

```ts
      ...(p.knobs ? knobHitOpts(p.knobs) : {}),
      ...(p.replay ? { echo: true as const } : {}),
    });
```

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
  stacks?: number;
}
```

with:

```ts
  stacks?: number;
  /** An echo's hit: its `hit` event says so (see the boons spec's 8). */
  echo?: true;
}
```

Replace:

```ts
    slot: opts.slot,
  });
```

with:

```ts
    slot: opts.slot,
    ...(opts.echo ? { echo: true as const } : {}),
  });
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
          ...(p.knobs ? knobHitOpts(p.knobs) : {}),
        });
```

with:

```ts
          ...(p.knobs ? knobHitOpts(p.knobs) : {}),
          ...(p.replay ? { echo: true as const } : {}),
        });
```

In `packages/engine/src/types/arpg.ts`:

Replace:

```ts
      slot?: number;
    }
```

with:

```ts
      slot?: number;
      /**
       * An echo's hit (`landBlow`'s `echo`, an ability's `replay`; see the boons spec's 8): the
       * client gives it no hit-stop or kick. Its numbers are as any hit's.
       */
      echo?: true;
    }
```

Replace:

```ts
      heft: number;
      infusion: ManaType | null;
    }
  | {
      kind: 'basic';
```

with:

```ts
      heft: number;
      infusion: ManaType | null;
      /** An echo's slash (an ability's `replay`): the client gives it no hit-stop or kick. */
      echo?: true;
    }
  | {
      kind: 'basic';
```

In `packages/engine/src/arpg/abilities/forms.ts`:

Replace:

```ts
        infusion: ab.elements[1] ?? null,
      });
      const opts = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);
```

with:

```ts
        infusion: ab.elements[1] ?? null,
        ...(ab.replay ? { echo: true as const } : {}),
      });
      const opts = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);
```

- [ ] **Step 4: Run them to see them pass**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-a-echo.test.ts tests/delve-rune-sim.test.ts tests/delve-runes.test.ts tests/delve-room-hits.test.ts --reporter=dot)
```

Expected: no type errors; `Test Files  4 passed (4); Tests  125 passed (125)` (the slash test was added after the scratch run: there, on the base, a Strike with Echo III pushed exactly two `slash` events, the cast's then the echo's, before the echo's `runeFx`; events stay out of the fingerprint's play, so it is unchanged).

- [ ] **Step 5: The fingerprint check**

```bash
cd /c/Projects/alloy-boons-a
P=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/40eae1ba-9296-44c8-9c7b-c2e0e4edb2b6/scratchpad
cp $P/boons-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/boons-a-after.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
cmp $P/boons-a-before.json $P/boons-a-after.json
```

Expected: `Tests  1 passed (1)`, and `cmp` prints nothing (identical).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-boons-a
git add packages/engine/src/arpg/abilities/forms.ts packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/src/types/arpg.ts packages/engine/tests/delve-boons-a-echo.test.ts
git commit -m "feat(engine): an echo's hit event says so (echo: true)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: `delve.boons` and `boonsProblems`

`balance.json → delve.boons` as the spec's §4 (hand-edited, never formatted), `DelveBalance.boons` and `DelveBalanceSchema`'s `boons: BoonsBalanceSchema` (written in Task 1); `KnobsSchema` exported; `data/boons-check.ts`'s `boonsProblems` with A's five checks, refused by `createDefaultRegistry` as `setPiecesProblems` is.

**Files:**
- Create: `packages/engine/tests/delve-boons-a-check.test.ts`
- Modify: `packages/engine/src/data/balance.json`
- Create: `packages/engine/src/data/boons-check.ts`
- Modify: `packages/engine/src/data/default-registry.ts`
- Modify: `packages/engine/src/data/schemas.ts`
- Modify: `packages/engine/src/types/delve.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-boons-a-check.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { boonsProblems } from '../src/data/boons-check.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { BoonsBalanceSchema } from '../src/data/schemas.js';
import type { BoonDef } from '../src/types/boon.js';

// See the boons spec, "1. The boon row" (the load checks) and "4. The stop" (`delve.boons`).

const registry = createDefaultRegistry();
const data = loadAndValidateData();
const withBoons = (boons: BoonDef[]) => boonsProblems(new DataRegistry({ ...data, boons }));
const vigor = data.boons[0];
const tiers = (effect: object) => [0, 1, 2].map(() => ({ text: 'x', effect })) as BoonDef['tiers'];

describe('boonsProblems', () => {
  it('finds none in the shipped data', () => {
    expect(boonsProblems(registry)).toEqual([]);
  });

  it('catches a repeated id, a tier without text, a bad knob key, a bad role and a cap of 4', () => {
    expect(withBoons([vigor, vigor])).toEqual(['vigor: a second row with this id']);
    const blank = {
      ...vigor,
      tiers: [vigor.tiers[0], { ...vigor.tiers[1], text: ' ' }, vigor.tiers[2]],
    };
    expect(withBoons([blank as BoonDef])).toEqual(['vigor: tier 2 has no text']);
    expect(withBoons([{ ...vigor, tiers: tiers({ knobs: { haste: 1 } }) }])).toEqual([
      "vigor: tier 1's knob haste is no Knobs key",
      "vigor: tier 2's knob haste is no Knobs key",
      "vigor: tier 3's knob haste is no Knobs key",
    ]);
    expect(
      withBoons([{ ...vigor, tiers: tiers({ attune: { role: 'third', points: 4 } }) }]),
    ).toHaveLength(3);
    expect(withBoons([{ ...vigor, cap: 4 as never }])).toEqual(['vigor: a cap of 4, not 1 to 3']);
  });
});

describe('delve.boons', () => {
  it("holds the spec's offer: three cards, four bands from depth 1", () => {
    expect(registry.getDelveBalance().boons).toEqual({
      offers: 3,
      tierWeights: [
        { fromDepth: 1, weights: [80, 18, 2] },
        { fromDepth: 10, weights: [65, 28, 7] },
        { fromDepth: 20, weights: [50, 35, 15] },
        { fromDepth: 35, weights: [40, 38, 22] },
      ],
    });
  });

  it('refuses bands that start past depth 1 or fail to ascend', () => {
    const ok = (tierWeights: { fromDepth: number; weights: number[] }[]) =>
      BoonsBalanceSchema.safeParse({ offers: 3, tierWeights }).success;
    expect(
      ok([
        { fromDepth: 1, weights: [1, 1, 1] },
        { fromDepth: 5, weights: [1, 1, 1] },
      ]),
    ).toBe(true);
    expect(ok([{ fromDepth: 2, weights: [1, 1, 1] }])).toBe(false);
    expect(
      ok([
        { fromDepth: 1, weights: [1, 1, 1] },
        { fromDepth: 1, weights: [1, 1, 1] },
      ]),
    ).toBe(false);
    expect(ok([{ fromDepth: 1, weights: [1, 1] }])).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx vitest run tests/delve-boons-a-check.test.ts --reporter=dot)
```

Expected: the file fails to load, `Cannot find module '../src/data/boons-check.js'`.

- [ ] **Step 3: Implement**

In `packages/engine/src/data/balance.json`:

Replace:

```json
    },
    "arena": { "step": 0.03333333333333333, "width": 26, "height": 40, "packSpacing": 1.8 }
```

with:

```json
    },
    "boons": {
      "offers": 3,
      "tierWeights": [
        { "fromDepth": 1, "weights": [80, 18, 2] },
        { "fromDepth": 10, "weights": [65, 28, 7] },
        { "fromDepth": 20, "weights": [50, 35, 15] },
        { "fromDepth": 35, "weights": [40, 38, 22] }
      ]
    },
    "arena": { "step": 0.03333333333333333, "width": 26, "height": 40, "packSpacing": 1.8 }
```

Create `packages/engine/src/data/boons-check.ts`:

```ts
import type { DataRegistry } from './registry.js';
import { KnobsSchema } from './schemas.js';

/**
 * `boons.json`'s problems the schema can't see, or that a registry built from other data may hold
 * (see the boons spec's load checks), as messages naming the row: ids unique; three tiers, each
 * with a card line; every knob a `Knobs` key; every attunement role the primary or the secondary;
 * a cap of 1 to 3. `createDefaultRegistry` refuses data with any.
 */
export function boonsProblems(registry: DataRegistry): string[] {
  const problems: string[] = [];
  const knobKeys = new Set(Object.keys(KnobsSchema.shape));
  const seen = new Set<string>();
  for (const b of registry.getBoons()) {
    if (seen.has(b.id)) problems.push(`${b.id}: a second row with this id`);
    seen.add(b.id);
    if (b.tiers.length !== 3) problems.push(`${b.id}: three tiers, not ${b.tiers.length}`);
    b.tiers.forEach((t, i) => {
      if (!t.text.trim()) problems.push(`${b.id}: tier ${i + 1} has no text`);
      for (const k of Object.keys(t.effect.knobs ?? {}))
        if (!knobKeys.has(k)) problems.push(`${b.id}: tier ${i + 1}'s knob ${k} is no Knobs key`);
      const role = t.effect.attune?.role;
      if (role !== undefined && role !== 'primary' && role !== 'secondary')
        problems.push(
          `${b.id}: tier ${i + 1}'s attunement role ${role} is neither primary nor secondary`,
        );
    });
    if (![1, 2, 3].includes(b.cap)) problems.push(`${b.id}: a cap of ${b.cap}, not 1 to 3`);
  }
  return problems;
}
```

In `packages/engine/src/data/default-registry.ts`:

Replace:

```ts
import { loadAndValidateData } from './loader.js';
```

with:

```ts
import { boonsProblems } from './boons-check.js';
import { loadAndValidateData } from './loader.js';
```

Replace:

```ts
  if (pieces.length > 0) throw new Error(`setpieces.json: ${pieces.join('; ')}`);
  return registry;
```

with:

```ts
  if (pieces.length > 0) throw new Error(`setpieces.json: ${pieces.join('; ')}`);
  // boons.json's rows (see the boons spec's load checks).
  const boons = boonsProblems(registry);
  if (boons.length > 0) throw new Error(`boons.json: ${boons.join('; ')}`);
  return registry;
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
/** Partial ability knobs (`KnobsData`); `.strict()` rejects misspelled knob names. */
const KnobsSchema = z
  .object({
```

with:

```ts
/** Partial ability knobs (`KnobsData`); `.strict()` rejects misspelled knob names. */
export const KnobsSchema = z
  .object({
```

Replace:

```ts
  terrain: TerrainBalanceSchema,
  arena: z.object({
```

with:

```ts
  terrain: TerrainBalanceSchema,
  boons: BoonsBalanceSchema,
  arena: z.object({
```

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
import type { AiBalance, LayoutBalance, LayoutsData, TerrainBalance } from './floor-map.js';
import type { BoonOffer, Buff } from './boon.js';
import type { TutorialState } from './tutorial.js';
```

with:

```ts
import type { AiBalance, LayoutBalance, LayoutsData, TerrainBalance } from './floor-map.js';
import type { BoonOffer, BoonsBalance, Buff } from './boon.js';
import type { TutorialState } from './tutorial.js';
```

Replace:

```ts
  terrain: TerrainBalance;
  arena: {
```

with:

```ts
  terrain: TerrainBalance;
  /** A stop's boons: its cards and their tier odds by depth (see the boons spec). */
  boons: BoonsBalance;
  arena: {
```

- [ ] **Step 4: Run them to see them pass**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-a-check.test.ts tests/delve-boons-a-data.test.ts tests/delve-maps-data.test.ts --reporter=dot)
```

Expected: no type errors; `Test Files  3 passed (3); Tests  15 passed (15)`.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-boons-a
git add packages/engine/src/data/balance.json packages/engine/src/data/boons-check.ts packages/engine/src/data/default-registry.ts packages/engine/src/data/schemas.ts packages/engine/src/types/delve.ts packages/engine/tests/delve-boons-a-check.test.ts
git commit -m "feat(engine): delve.boons and its schema; boonsProblems, refused at load" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Save v13

The version moves to 13 (`DelveProfile.version`, the schema's literal, `createDelveProfile`, `parseDelveProfile`'s gate); any other version resets, as every version change does. Then the whole engine suite.

**Files:**
- Create: `packages/engine/tests/delve-boons-a-save.test.ts`
- Modify: `packages/engine/src/delve/profile-schema.ts`
- Modify: `packages/engine/src/delve/profile.ts`
- Modify: `packages/engine/src/types/delve.ts`
- Modify: `packages/engine/tests/delve-dive.test.ts`
- Modify: `packages/engine/tests/delve-maps-save.test.ts`
- Modify: `packages/engine/tests/delve-pair.test.ts`
- Modify: `packages/engine/tests/delve-profile-abilities.test.ts`
- Modify: `packages/engine/tests/delve-quests-save.test.ts`
- Modify: `packages/engine/tests/delve-room-save.test.ts`
- Modify: `packages/engine/tests/delve-runes-contract.test.ts`
- Modify: `packages/engine/tests/delve-save-v8.test.ts`
- Modify: `packages/engine/tests/delve-tutorial-save.test.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-boons-a-save.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { startDive } from '../src/delve/dive.js';
import type { Buff } from '../src/types/boon.js';
import type { DelveProfile } from '../src/types/delve.js';
import { registry } from './fixtures/arena.js';

// See the boons spec, "4. The stop" (Save): version 13; any other version resets.

const KEEN: Buff = { boon: 'keen_edge', tier: 2, effect: { damage: 0.15 } };
const ECHO: Buff = {
  boon: 'echo',
  tier: 3,
  effect: { knobs: { echo: 0.4, quick: { cooldown: 0.9 } } },
};

describe('save v13', () => {
  it('a new save is version 13, and a dive with boons and a boons stop round-trips', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    expect(p0.version).toBe(13);
    const diving = startDive(registry, p0, 1);
    const p: DelveProfile = {
      ...diving,
      dive: {
        ...diving.dive!,
        phase: 'choosing',
        diveBuffs: [KEEN, ECHO],
        stop: { kind: 'boons', offers: [{ id: 'keen_edge', tier: 3 }], taken: false },
      },
    };
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))).toEqual({ profile: p });
  });

  it('a version 12 save resets', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    expect(parseDelveProfile(registry, { ...JSON.parse(JSON.stringify(p)), version: 12 })).toEqual({
      reset: true,
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx vitest run tests/delve-boons-a-save.test.ts --reporter=dot)
```

Expected: `2 failed (2)`: `expected 12 to be 13` and `expected { profile: { version: 12, … } } to deeply equal { reset: true }`.

- [ ] **Step 3: Implement**

In `packages/engine/src/delve/profile-schema.ts`:

Replace:

```ts
/** Zod schema for persisted Delve saves (version 12 only) — rejects corrupt or foreign data. */
```

with:

```ts
/** Zod schema for persisted Delve saves (version 13 only) — rejects corrupt or foreign data. */
```

Replace:

```ts
const ProfileSchema = z.object({
  version: z.literal(12),
  seed: z.number().int(),
```

with:

```ts
const ProfileSchema = z.object({
  version: z.literal(13),
  seed: z.number().int(),
```

In `packages/engine/src/delve/profile.ts`:

Replace:

```ts
  const profile: DelveProfile = {
    version: 12,
    seed: seed | 0,
```

with:

```ts
  const profile: DelveProfile = {
    version: 13,
    seed: seed | 0,
```

Replace:

```ts
/**
 * Validate an unknown JSON blob as a save. A version 12 save is fitted to the
 * data (`fitMovesets`); a save of any other version is `{ reset: true }`. Null
 * when it isn't an object, or a version 12 save doesn't fit the schema.
 */
```

with:

```ts
/**
 * Validate an unknown JSON blob as a save. A version 13 save is fitted to the
 * data (`fitMovesets`); a save of any other version is `{ reset: true }`. Null
 * when it isn't an object, or a version 13 save doesn't fit the schema.
 */
```

Replace:

```ts
  if (typeof raw !== 'object' || raw === null) return null;
  if ((raw as { version?: unknown }).version !== 12) return { reset: true };
  const parsed = DelveProfileSchema.safeParse(raw);
```

with:

```ts
  if (typeof raw !== 'object' || raw === null) return null;
  if ((raw as { version?: unknown }).version !== 13) return { reset: true };
  const parsed = DelveProfileSchema.safeParse(raw);
```

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
export interface DelveProfile {
  version: 12;
  seed: number;
```

with:

```ts
export interface DelveProfile {
  version: 13;
  seed: number;
```

The tests that pin version 12:

In `packages/engine/tests/delve-dive.test.ts`:

Replace:

```ts
    const p = createDelveProfile(registry, 123);
    expect(p.version).toBe(12);
    expect(p.links).toBe(0);
```

with:

```ts
    const p = createDelveProfile(registry, 123);
    expect(p.version).toBe(13);
    expect(p.links).toBe(0);
```

In `packages/engine/tests/delve-maps-save.test.ts`:

Replace:

```ts
    const p = diving();
    expect(p.version).toBe(12);
    expect(p.dive).toMatchObject({ used: [], diveBuffs: [] });
```

with:

```ts
    const p = diving();
    expect(p.version).toBe(13);
    expect(p.dive).toMatchObject({ used: [], diveBuffs: [] });
```

In `packages/engine/tests/delve-pair.test.ts`:

Replace:

```ts
  it('a new profile is version 12 with no pair yet, no Mana Dust, no Links and no runes, and round-trips', () => {
    const p = createDelveProfile(registry, 3);
    expect(p).toMatchObject({
      version: 12,
      pair: { primary: null, secondary: null },
```

with:

```ts
  it('a new profile is version 13 with no pair yet, no Mana Dust, no Links and no runes, and round-trips', () => {
    const p = createDelveProfile(registry, 3);
    expect(p).toMatchObject({
      version: 13,
      pair: { primary: null, secondary: null },
```

In `packages/engine/tests/delve-profile-abilities.test.ts`:

Replace:

```ts
    const p = createDelveProfile(registry, 1);
    expect(p.version).toBe(12);
    const sword = p.equipped.weapon!;
```

with:

```ts
    const p = createDelveProfile(registry, 1);
    expect(p.version).toBe(13);
    const sword = p.equipped.weapon!;
```

In `packages/engine/tests/delve-quests-save.test.ts`:

Replace:

```ts
    const p = fresh();
    expect(p.version).toBe(12);
    expect(p.quests.board).toHaveLength(registry.getDelveBalance().quests.contracts.slots);
```

with:

```ts
    const p = fresh();
    expect(p.version).toBe(13);
    expect(p.quests.board).toHaveLength(registry.getDelveBalance().quests.contracts.slots);
```

Replace:

```ts
  it('resets a version 8 save; a version 12 save without its quests, or a bad contract, is refused', () => {
    const p = underWay(fresh());
```

with:

```ts
  it('resets a version 8 save; a version 13 save without its quests, or a bad contract, is refused', () => {
    const p = underWay(fresh());
```

In `packages/engine/tests/delve-room-save.test.ts`:

Replace:

```ts
describe('save v12', () => {
  it('a new save is version 12 and round-trips, mid-dive too', () => {
    const p = createDelveProfile(registry, 4, { primary: 'fire' });
    expect(p.version).toBe(12);
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
```

with:

```ts
describe('save v12', () => {
  it('a new save is version 13 and round-trips, mid-dive too', () => {
    const p = createDelveProfile(registry, 4, { primary: 'fire' });
    expect(p.version).toBe(13);
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
```

In `packages/engine/tests/delve-runes-contract.test.ts`:

Replace:

```ts
  it('a new profile is version 12 with an empty pouch; a version 6 or 7 save resets', () => {
    const p = fresh();
    expect(p).toMatchObject({ version: 12, runes: {} });
    const { runes: _runes, ...v6 } = p;
```

with:

```ts
  it('a new profile is version 13 with an empty pouch; a version 6 or 7 save resets', () => {
    const p = fresh();
    expect(p).toMatchObject({ version: 13, runes: {} });
    const { runes: _runes, ...v6 } = p;
```

In `packages/engine/tests/delve-save-v8.test.ts`:

Replace:

```ts
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    expect(p.version).toBe(12);
    expect(p.patterns).toEqual(['sword', 'cuirass', 'dagger']);
```

with:

```ts
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    expect(p.version).toBe(13);
    expect(p.patterns).toEqual(['sword', 'cuirass', 'dagger']);
```

Replace:

```ts
  it('resets a save of any other version; a version 12 save that does not fit is refused', () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
```

with:

```ts
  it('resets a save of any other version; a version 13 save that does not fit is refused', () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
```

In `packages/engine/tests/delve-tutorial-save.test.ts`:

Replace:

```ts
    const p = diving();
    expect(p.version).toBe(12);
    expect(p.tutorial).toBeNull();
```

with:

```ts
    const p = diving();
    expect(p.version).toBe(13);
    expect(p.tutorial).toBeNull();
```

- [ ] **Step 4: Run them to see them pass**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-a-save.test.ts tests/delve-boons-a-stop.test.ts tests/delve-dive.test.ts tests/delve-maps-save.test.ts tests/delve-pair.test.ts tests/delve-profile-abilities.test.ts tests/delve-quests-save.test.ts tests/delve-room-save.test.ts tests/delve-runes-contract.test.ts tests/delve-save-v8.test.ts tests/delve-tutorial-save.test.ts --reporter=dot)
```

Expected: no type errors; `Test Files  11 passed (11); Tests  141 passed (141)`.

- [ ] **Step 5: The fingerprint check**

```bash
cd /c/Projects/alloy-boons-a
P=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/40eae1ba-9296-44c8-9c7b-c2e0e4edb2b6/scratchpad
cp $P/boons-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/boons-a-after.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
cmp $P/boons-a-before.json $P/boons-a-after.json
```

Expected: `Tests  1 passed (1)`, and `cmp` prints nothing (identical).

- [ ] **Step 6: The whole engine suite**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx vitest run --reporter=dot)
```

Expected (about 13 minutes): `Test Files  1 failed | 139 passed | 1 skipped (141)`; `Tests  2 failed | 1740 passed | 5 skipped (1747)`: the base's two `delve-pacing-robust` failures and nothing else (the base's 1699 passing, plus Phase A's 43 new tests, less the two `shrines.json` tests Task 2 removed).

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/alloy-boons-a
git add packages/engine/src/delve/profile-schema.ts packages/engine/src/delve/profile.ts packages/engine/src/types/delve.ts packages/engine/tests/delve-boons-a-save.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-maps-save.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-profile-abilities.test.ts packages/engine/tests/delve-quests-save.test.ts packages/engine/tests/delve-room-save.test.ts packages/engine/tests/delve-runes-contract.test.ts packages/engine/tests/delve-save-v8.test.ts packages/engine/tests/delve-tutorial-save.test.ts
git commit -m "feat(engine): save v13" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: The client on the new bundle

Rebuild the bundle and bring the client onto it: the dive's live hero refresh (`useArena.ts`'s `loadout`) wears `diveStats`, the HUD's shrine names come from the boon rows (`getBoon(b.boon)?.name`; `HudBuff` keeps its `'shrine'` kind for C2), `StopPanel`'s prop is a `PowerupStop`, the alcove dialog's stop says `kind: 'powerups'`, and `StopScreen` treats a `boons` stop as none (its step 1 is C1's). The client's tests take the new shapes and save v13. The e2e specs need nothing: they read `stop.offers` (on both kinds) and seed saves through the engine.

**Files:**
- Modify: `packages/client/src/features/delve/arena/useArena.ts`
- Modify: `packages/client/src/features/delve/StopPanel.tsx`
- Modify: `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`
- Modify: `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`
- Modify: `packages/client/src/features/delve/arena/FloorDialogs.tsx`
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts`
- Modify: `packages/client/src/features/delve/stop/StopScreen.tsx`
- Modify: `packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx`
- Modify: `packages/client/src/pages/__tests__/DelveRun.test.tsx`
- Modify: `packages/client/src/stores/delveStore.test.ts`

- [ ] **Step 1: The failing typecheck**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p .)
```

Expected: 26 errors in 9 files: `arena-hud-snapshot.test.ts` (`'shrine' does not exist in type 'Buff'`), `StopPanel.test.tsx`, `FloorDialogs.tsx`, `StopScreen.test.tsx`, `DelveRun.test.tsx` and `delveStore.test.ts` (`Property 'kind' is missing …`), `useArenaCore.ts` (`Property 'shrines' does not exist on type 'DelveData'`), `StopScreen.tsx` (`Property 'required' does not exist on type 'DiveStop'`) and `StopPanel.tsx` (`Type 'BoonOffer' cannot be used as an index type`).

- [ ] **Step 2: Implement**

In `packages/client/src/features/delve/StopPanel.tsx`:

Replace:

```tsx
  type DelveProfile,
  type DiveStop,
  type GearItem,
```

with:

```tsx
  type DelveProfile,
  type PowerupStop,
  type GearItem,
```

Replace:

```tsx
 */
export function StopPanel({ stop, ops = STOP_OPS }: { stop: DiveStop; ops?: StopOps }) {
  const registry = getDelveRegistry();
```

with:

```tsx
 */
export function StopPanel({ stop, ops = STOP_OPS }: { stop: PowerupStop; ops?: StopOps }) {
  const registry = getDelveRegistry();
```

In `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`:

Replace:

```tsx
  type Chains,
  type StopKind,
```

with:

```tsx
  type Chains,
  type PowerupStop,
  type StopKind,
```

Replace:

```tsx
    ...store().profile,
    dive: { ...dive, phase: 'choosing', stop: { offers, taken: false } },
  });
  const Panel = () => {
    const stop = useDelveStore((s) => s.profile.dive!.stop!);
    return (
```

with:

```tsx
    ...store().profile,
    dive: { ...dive, phase: 'choosing', stop: { kind: 'powerups', offers, taken: false } },
  });
  const Panel = () => {
    const stop = useDelveStore((s) => s.profile.dive!.stop!) as PowerupStop;
    return (
```

Replace:

```tsx
    const take = vi.fn(() => ({ ok: true, profile }));
    render(<StopPanel stop={{ offers: ['equip', 'slot'], taken: false }} ops={{ dry, take }} />);
    fireEvent.click(screen.getByTestId('stop-slot'));
```

with:

```tsx
    const take = vi.fn(() => ({ ok: true, profile }));
    render(
      <StopPanel
        stop={{ kind: 'powerups', offers: ['equip', 'slot'], taken: false }}
        ops={{ dry, take }}
      />,
    );
    fireEvent.click(screen.getByTestId('stop-slot'));
```

In `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`:

Replace:

```ts
    const w = sandbox();
    w.hero.floorBuffs = [{ shrine: 'vigor', effect: { damage: 0.2 } }];
    w.hero.diveBuffs = [{ shrine: 'devotion', effect: { damage: 0.1 } }];
    expect(snapshot(w, null).buffs).toEqual([
```

with:

```ts
    const w = sandbox();
    w.hero.floorBuffs = [{ boon: 'vigor', tier: 1, effect: { damage: 0.2 } }];
    w.hero.diveBuffs = [{ boon: 'devotion', tier: 1, effect: { damage: 0.1 } }];
    expect(snapshot(w, null).buffs).toEqual([
```

In `packages/client/src/features/delve/arena/FloorDialogs.tsx`:

Replace:

```tsx
  return profile.dive
    ? { ...profile, dive: { ...profile.dive, phase: 'choosing', stop: { offers, taken: false } } }
    : profile;
```

with:

```tsx
  return profile.dive
    ? {
        ...profile,
        dive: {
          ...profile.dive,
          phase: 'choosing',
          stop: { kind: 'powerups', offers, taken: false },
        },
      }
    : profile;
```

Replace:

```tsx
    <Dialog title="Anvil alcove" onClose={onClose} width={1120} testId="alcove-dialog">
      <StopPanel stop={{ offers, taken: false }} ops={ops} />
    </Dialog>
```

with:

```tsx
    <Dialog title="Anvil alcove" onClose={onClose} width={1120} testId="alcove-dialog">
      <StopPanel stop={{ kind: 'powerups', offers, taken: false }} ops={ops} />
    </Dialog>
```

In `packages/client/src/features/delve/arena/useArenaCore.ts`:

Replace:

```ts
/** The shrines' blessings on the hero, the dive's then the floor's, by their shrine's name. */
function blessings(h: ArpgWorld['hero']): HudBuff[] {
  const shrines = getDelveRegistry().getDelveData().shrines;
  return [h.diveBuffs, h.floorBuffs].flatMap((list, i) =>
```

with:

```ts
/** The shrines' blessings on the hero, the dive's then the floor's, by their boon row's name. */
function blessings(h: ArpgWorld['hero']): HudBuff[] {
  const registry = getDelveRegistry();
  return [h.diveBuffs, h.floorBuffs].flatMap((list, i) =>
```

Replace:

```ts
      id: 'shrine' as const,
      shrine: b.shrine,
      name: shrines.find((s) => s.id === b.shrine)?.name ?? b.shrine,
      dive: i === 0,
```

with:

```ts
      id: 'shrine' as const,
      shrine: b.boon,
      name: registry.getBoon(b.boon)?.name ?? b.boon,
      dive: i === 0,
```

In `packages/client/src/features/delve/stop/StopScreen.tsx`:

Replace:

```tsx
  const mainRef = useRef<HTMLDivElement>(null);
  const stop = dive.stop;
  const offering = !!stop && !stop.taken;
```

with:

```tsx
  const mainRef = useRef<HTMLDivElement>(null);
  // The power-up cards (a boons stop's cards are the boons spec's C1; until then it goes to the road).
  const stop = dive.stop?.kind === 'powerups' ? dive.stop : null;
  const offering = !!stop && !stop.taken;
```

In `packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx`:

Replace:

```tsx
      doorChoices: ['winding', 'gilded'],
      stop: offers ? { offers, taken: false } : null,
      ...over,
```

with:

```tsx
      doorChoices: ['winding', 'gilded'],
      stop: offers ? { kind: 'powerups' as const, offers, taken: false } : null,
      ...over,
```

Replace:

```tsx
  it("opens on step 2 when the stop offers nothing, or what it offered is taken (a reload's)", () => {
    atStop(['equip'], { stop: { offers: ['equip'], taken: true } });
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
```

with:

```tsx
  it("opens on step 2 when the stop offers nothing, or what it offered is taken (a reload's)", () => {
    atStop(['equip'], { stop: { kind: 'powerups', offers: ['equip'], taken: true } });
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
```

Replace:

```tsx
  it('with the power-up taken, or none on offer, the first door is the first focus', () => {
    atStop(['equip'], { stop: { offers: ['equip'], taken: true } });
    const first = store().profile.dive!.doorChoices[0];
```

with:

```tsx
  it('with the power-up taken, or none on offer, the first door is the first focus', () => {
    atStop(['equip'], { stop: { kind: 'powerups', offers: ['equip'], taken: true } });
    const first = store().profile.dive!.doorChoices[0];
```

Replace:

```tsx
  it('a required power-up holds step 1: Skip is off and says why, and the roads come once it is taken', () => {
    atStop(['equip'], { stop: { offers: ['equip'], taken: false, required: true } });
    arm();
```

with:

```tsx
  it('a required power-up holds step 1: Skip is off and says why, and the roads come once it is taken', () => {
    atStop(['equip'], { stop: { kind: 'powerups', offers: ['equip'], taken: false, required: true } });
    arm();
```

In `packages/client/src/pages/__tests__/DelveRun.test.tsx`:

Replace:

```tsx
        ...profile,
        dive: {
          ...profile.dive!,
          phase: 'choosing',
          doorChoices: ['winding'],
          stop: { offers: ['equip'], taken: false },
        },
      },
    });
    renderRun();
    const stop = screen.getByTestId('door-choice');
```

with:

```tsx
        ...profile,
        dive: {
          ...profile.dive!,
          phase: 'choosing',
          doorChoices: ['winding'],
          stop: { kind: 'powerups', offers: ['equip'], taken: false },
        },
      },
    });
    renderRun();
    const stop = screen.getByTestId('door-choice');
```

Replace:

```tsx
            doorChoices: ['winding'],
            stop: { offers: ['equip'], taken: false },
          },
```

with:

```tsx
            doorChoices: ['winding'],
            stop: { kind: 'powerups', offers: ['equip'], taken: false },
          },
```

Replace:

```tsx
        ...profile,
        dive: {
          ...profile.dive!,
          phase: 'choosing',
          doorChoices: ['winding'],
          stop: { offers: ['equip'], taken: false },
        },
      },
    });
    renderRun();
    fireEvent.click(
```

with:

```tsx
        ...profile,
        dive: {
          ...profile.dive!,
          phase: 'choosing',
          doorChoices: ['winding'],
          stop: { kind: 'powerups', offers: ['equip'], taken: false },
        },
      },
    });
    renderRun();
    fireEvent.click(
```

In `packages/client/src/stores/delveStore.test.ts`:

Replace:

```ts
  it('resets a save of another version, and falls back to a new profile when the save is corrupt', () => {
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":11,"broken":true}');
    expect(loadDelveProfile()).toEqual({ reset: true });
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":12,"broken":true}');
    expect(loadDelveProfile()).toBeNull();
```

with:

```ts
  it('resets a save of another version, and falls back to a new profile when the save is corrupt', () => {
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":12,"broken":true}');
    expect(loadDelveProfile()).toEqual({ reset: true });
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":13,"broken":true}');
    expect(loadDelveProfile()).toBeNull();
```

Replace:

```ts
      ...s().profile,
      dive: { ...dive, stop: { offers: ['equip'], taken: false } },
    });
```

with:

```ts
      ...s().profile,
      dive: { ...dive, stop: { kind: 'powerups', offers: ['equip'], taken: false } },
    });
```

Replace:

```ts
    expect(fresh.getState().notices).toEqual([RESET_NOTICE]);
    expect(fresh.getState().profile).toMatchObject({ version: 12, scrap: 50 }); // the kit's
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!)).toMatchObject({
      version: 12,
      scrap: 50,
```

with:

```ts
    expect(fresh.getState().notices).toEqual([RESET_NOTICE]);
    expect(fresh.getState().profile).toMatchObject({ version: 13, scrap: 50 }); // the kit's
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!)).toMatchObject({
      version: 13,
      scrap: 50,
```

In `packages/client/src/features/delve/arena/useArena.ts`:

Replace:

```ts
  type DataRegistry,
  profileStats,
```

with:

```ts
  type DataRegistry,
  diveStats,
```

Replace:

```ts
  const { equipped, pair } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [equipped, pair, registry],
  );
```

with:

```ts
  const { equipped, pair } = profile;
  // The live dive hero wears its dive's boons (`diveStats`; see the boons spec's 2a). Keyed on the
  // boons worn, not the `diveBuffs` array, which every bank rebuilds.
  const boonKey = profile.dive?.diveBuffs.map((b) => `${b.boon}:${b.tier}`).join() ?? '';
  const stats = useMemo(
    () => diveStats(registry, { equipped, pair, dive: profile.dive }),
    [equipped, pair, boonKey, registry],
  );
```

- [ ] **Step 3: Run them to see them pass**

```bash
cd /c/Projects/alloy-boons-a
(cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
```

Expected: no type errors; `Test Files  146 passed (146)`; `Tests  1361 passed (1361)`. (The `useArena.ts` edit was added after the scratch run and was not run there; with no boon worn `diveStats` equals `profileStats`, so the arena tests, `__tests__/arena-*.test.ts` and `pages/__tests__/DelveRun.test.tsx`, are expected unchanged.)

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/alloy-boons-a
git add packages/client/src/features/delve/arena/useArena.ts packages/client/src/features/delve/StopPanel.tsx packages/client/src/features/delve/__tests__/StopPanel.test.tsx packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts packages/client/src/features/delve/arena/FloorDialogs.tsx packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/stop/StopScreen.tsx packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx packages/client/src/pages/__tests__/DelveRun.test.tsx packages/client/src/stores/delveStore.test.ts
git commit -m "refactor(client): the client on the boons bundle: a shrine's name from its boon row, the power-up stop narrowed, save v13" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Verification

- The engine suite after Task 9: `Tests  2 failed | 1740 passed | 5 skipped (1747)` in `1 failed | 139 passed | 1 skipped (141)` files, the two failures the base's `delve-pacing-robust` pair.
- The client suite after Task 10: `1361 passed (1361)` in `146 passed (146)` files; both typechecks clean.
- The fingerprint identical to the base's after Tasks 2, 4, 5, 6, 7 and 9 (the file above, byte for byte).
- `git log --oneline d3b5e447..boons/a` shows ten commits, one a task.
- Hand the branch to the integrator (it becomes `boons/main`, the base of B1, B2, B3, C1, C2 and C3).
