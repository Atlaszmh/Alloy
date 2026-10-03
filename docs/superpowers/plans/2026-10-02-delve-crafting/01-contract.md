# Delve component crafting (stage 4c) · Phase A: the contract — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay stage 4c's contract so B1, B2, B3 and C1–C3 can work in parallel without editing each other's files: the crafting types; `crafting.json` and the `delve.crafting` / `delve.drops` balance blocks with their schemas and starting numbers; the doors' new drop multipliers; save v8 (materials, patterns, essences, the dive's haul) with every older save reset; Alloy Fusion and the migrations deleted; typed stubs for every new engine op; every new store action; the hub's new links. Today's gear drops keep flowing through a marked stand-in until B1, so the pacing rails pass unchanged.

**Architecture:** `src/types/crafting.ts` holds every shape the areas trade in (`MetalId`, `FluxGrade`, `ShardRef`, `MaterialsPouch`, `Haul`, `MaterialRef`, `ForgeRequest`, `ForgePreview`, `ForgeRefusal`, `SalvageYield`, `SalvageResult`, `SettleOutcome`, the data and balance types). `src/data/crafting.json` is read through `CraftingDataSchema` into `registry.getCraftingData()`. `src/loot/materials.ts` implements the lookups and pouch ops every area shares (`metalAt`, `shardTiersOf`, `emptyMaterials`, `emptyHaul`, `addMaterials`, `addHaul`, `addMaterial`, `stockHaul`); everything an area fills in is a typed stub that throws "not implemented", each in the file its area owns (`loot/forge.ts`, `loot/salvage-yield.ts`, `delve/crafting.ts`, `arpg/material-drops.ts`, `delve/economy.ts`, `settleDive` and `refineCost`), exported whole from `index.ts` as the runes were. No Phase A test calls a stub. The client's store wraps each new op; the Forge tab keeps Temper only until C2.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, React 19, Zustand 5.

**Spec:** `docs/superpowers/specs/2026-10-02-delve-component-crafting-design.md` (authoritative): "Phases and parallel areas" (the Phase A row), "Engine shape", "Tuning: every number in data", "Doors", "Banking and death" (the settle's signature), "Loading an old save", decisions S1–S9. The overview is `00-overview.md` in this folder.

---

## Base

- **Starts from:** `craft/main` at `25e07e6` (v0.57.1 + the spec and the overview), in this area's worktree `C:/Projects/alloy-craft-a` on branch `craft/a`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-craft-a -Branch craft/a -Base craft/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-craft-a` in Git Bash.
- **Anchors:** every edit was generated from, and checked against, `craft/main` at `25e07e6`: applied in this plan's order, task by task, they give exactly the files the tests below were run on (see "Checked on a scratch copy").
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-craft-a
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the engine suite reads **1653 passed | 5 skipped** tests in **84 passed | 1 skipped** files (about 20 s, the pacing rails included); the client suite **1175 tests in 147 files**. Call them **N** engine tests in **F** files and **M** client tests in **G** files; each task below says where they go.

## Files

| File | Change |
|---|---|
| `packages/engine/src/types/crafting.ts` (new) | Every crafting shape: `METAL_IDS`/`MetalId`, `FLUX_GRADES`/`FluxGrade`, `AFFIX_FAMILIES`/`AffixFamily`, `ShardRef`, `MaterialsPouch`, `Haul`, `MaterialRef`, `SettleOutcome`, `ForgeRequest`, `ForgeRefusalCode`/`ForgeRefusal`, `ForgeLinePreview`, `ForgePreview`, `SalvageYield`, `SalvageResult`, `MetalDef`, `ShardTierDef`, `CraftingData`, `DropEntry`, `CraftingBalance`, `DropsBalance` |
| `packages/engine/src/types/index.ts` | exports `crafting.ts` |
| `packages/engine/src/data/crafting.json` (new) | metals (bands partitioning the item levels), flux, shard tiers, the Attune shards' two tiers, every affix's family, the starter kit (S8) |
| `packages/engine/src/data/schemas.ts` | `CraftingDataSchema` (the partition check), `CraftingBalanceSchema`, `DropsBalanceSchema`; `delve.json → materials`, the old loot fields and `forge.fuseCost` gone; the doors' new mods |
| `packages/engine/src/data/loader.ts`, `registry.ts`, `default-registry.ts` | `crafting.json` loaded and validated; `registry.getCraftingData()` (the registry's ninth argument) |
| `packages/engine/src/data/delve.json` | `materials` deleted; the doors' mods and texts; Lucky Charm's text; `magicFind`'s label "Find" (hand-edited, never formatted) |
| `packages/engine/src/data/balance.json` | `delve.crafting` and `delve.drops` added; `loot.pityPerDrop`, `normalDropChance`, `extraDropChance`, `eliteDrops`, `bossDrops` and `forge.fuseCost` deleted (hand-edited, never formatted) |
| `packages/engine/src/types/delve.ts` | `DoorMods`' new shape; `DelveBalance.crafting` and `.drops`; the old loot fields and `fuseCost` gone; `DiveState.haul`, `banked`, `lost`, `settled`; `DelveProfile` v8 (`materials`, `patterns`, `essencesSeen`, `firstEssenceGiven`; no `pity`, no `firstBossLegendaryGiven`); `MaterialDef` gone |
| `packages/engine/src/types/gear.ts` | `StatRoll.band?`, `GearItem.hones` |
| `packages/engine/src/types/ability.ts` | `AbilityBuild` / `AbilityBuilds` gone (version 4 saves only) |
| `packages/engine/src/types/arpg.ts` | `LootContext`: `find`, `firstEssence`, `patterns` (no `pity`, `magicFind`, `dropMult`, `forceLegendary`); `DropKind` `'material'`, `Drop.material`, the `pickup` event's `material` |
| `packages/engine/src/loot/materials.ts` (new) | `metalAt`, `shardTiersOf`, `emptyMaterials`, `emptyHaul`, `addMaterials`, `addHaul`, `addMaterial`, `stockHaul` (implemented); `refineCost` (stub, B2) |
| `packages/engine/src/loot/item-generator.ts` | `materialName` from the metals; no pity in `rarityWeights`; `hones: 0` on every item (hand-edited) |
| `packages/engine/src/loot/drops.ts` | `stochasticRound` exported; the stand-in gear counts (`GEAR_TODAY`) for the deleted data; `DropContext.find`, `materials`; `rollRuneDrop` × the door's `runes` (hand-edited) |
| `packages/engine/src/loot/smithing.ts` | `checkFusion`, `fuseCost`, `fuseItems` deleted (hand-edited) |
| `packages/engine/src/loot/forge.ts` (new) | stubs (B2): `previewForge`, `forgeItem`, `honeLine`, `imprintLine`, `honeCost`, `imprintCost` |
| `packages/engine/src/loot/salvage-yield.ts` (new) | stubs (B2): `salvageYield`, `applySalvage` |
| `packages/engine/src/delve/crafting.ts` (new) | stubs (B2): `forge`, `hone`, `imprint`, `refine`, `buyShard` |
| `packages/engine/src/arpg/material-drops.ts` (new) | stub (B1): `dropMaterials` |
| `packages/engine/src/delve/economy.ts` (new) | `EconomyDive`, `EconomyReport`; stub (B3): `economySim` |
| `packages/engine/src/delve/dive.ts` | the dive's empty haul and banked; `firstEssence` and `patterns` in the loot context; `settleDive` (stub, B1); `closeDive(registry, profile)` (hand-edited) |
| `packages/engine/src/delve/profile.ts` | the v8 starter kit; `parseDelveProfile` → `{ profile }`, `{ reset: true }` or null; `fuseGear`, `chainFromBuild` and every migration deleted; `fitMovesets` returns the profile; `salvageItems` reports `shards`, `patterns`, `essences` |
| `packages/engine/src/delve/profile-schema.ts` | `DelveProfileSchema` v8 only (`MaterialsPouchSchema`, `HaulSchema`, the dive's haul fields); `StatRoll.band`, `GearItem.hones`; the door's new mods; the v2–v7 schemas and `AbilityBuildSchema` deleted |
| `packages/engine/src/delve/autopilot.ts` | the fuse loop gone; `closeDive(registry, p)` (hand-edited) |
| `packages/engine/src/arpg/combat.ts` | kill scrap by `drops.scrapByKind`; the loot context's new fields |
| `packages/engine/src/arpg/rune-drops.ts`, `sandbox.ts` | the door's `runes`; the sandbox's loot context |
| `packages/engine/src/index.ts` | fusion and `chainFromBuild` out; `settleDive`; the crafting modules exported whole |
| `packages/engine/tests/delve-crafting-data.test.ts` (new) | the data, the schemas' checks, the balance blocks, fusion gone, the doors and Find, items' hones and bands |
| `packages/engine/tests/delve-materials.test.ts` (new) | the pouch and haul ops, `stockHaul` |
| `packages/engine/tests/delve-save-v8.test.ts` (new) | the starter kit, the dive's haul fields, the reset |
| `packages/engine/tests/delve-crafting-contract.test.ts` (new) | every new export exists; `closeDive` with the registry; `salvageItems`' new fields |
| `packages/engine/tests/fixtures/delve-v5-saves.json` | **Deleted** (the migration tests' saves) |
| `packages/engine/tests/fixtures/arena.ts` | the loot context; `OLD_BUILDS`, `asV4`, `asV5` deleted |
| `packages/engine/tests/delve-loot.test.ts`, `arpg-sim.test.ts`, `delve-pair.test.ts`, `delve-movesets.test.ts`, `delve-runes.test.ts`, `delve-dive.test.ts`, `delve-hero-smithing.test.ts`, `delve-chains.test.ts`, `delve-profile-abilities.test.ts`, `delve-reactions.test.ts`, `delve-runes-contract.test.ts`, `delve-dps-sim.test.ts`, `delve-rune-costs-gate.test.ts`, `delve-rune-power.test.ts` | pity, the doors and the loot context; fusion's and the migrations' tests deleted; save v8; registries built with the crafting data |
| `packages/client/src/features/delve/hub/types.ts` | `bench?: 'forge' \| 'temper'`; Codex sections `patterns`, `essences` |
| `packages/client/src/features/delve/hub/forge/ForgeTab.tsx` | Temper only (no bench tabs) until C2 |
| `packages/client/src/features/delve/hub/forge/Fuse.tsx`, `__tests__/Fuse.test.tsx` | **Deleted** |
| `packages/client/src/features/delve/hub/codex/CodexTab.tsx` | a link to a section it doesn't draw yet is ignored |
| `packages/client/src/stores/delveStore.ts` | `loadDelveProfile` → `ParsedDelveProfile \| null`; `RESET_NOTICE`; `forge`, `hone`, `imprint`, `refine`, `buyShard`; `salvage`'s yields; `closeDive` with the registry; `fuse`, `BIND_HINT`, `movesetNotices`, `runeLostNotices` deleted |
| `packages/client/src/features/delve/stop/DoorPane.tsx` | the treasure icon from the door's `gear` or `essence` |
| tests: `ForgeTab.test.tsx`, `CodexTab.test.tsx`, `delveStore.test.ts` | the above |

## What Phase A implements, and what it leaves

**Implemented (and tested):** the data (`crafting.json`, both balance blocks, the doors) and every schema check; `registry.getCraftingData()`; `materialName` from the metals; the shared pouch ops in `loot/materials.ts`; save v8 with the starter kit and the reset; `StatRoll.band` and `GearItem.hones` (saved, never set yet); the deletions (Fusion, pity, the old drop fields, the migrations); the kill's scrap from `drops.scrapByKind`; the door's `runes` on rune drops and its `find` on Find; `closeDive`'s new signature; the store's actions; the hub's links.

**Stubs that throw `"<name>: not implemented"`** (no Phase A test or code path calls one):

| Stub | File | Area | Wired by that area |
|---|---|---|---|
| `previewForge`, `forgeItem`, `honeLine`, `imprintLine`, `honeCost`, `imprintCost` | `loot/forge.ts` | B2 | — |
| `salvageYield`, `applySalvage` | `loot/salvage-yield.ts` | B2 | `addLootToBag` and `salvageItems` call `applySalvage` (and fill `salvageItems`' `shards`, `patterns`, `essences`) |
| `refineCost` | `loot/materials.ts` | B2 | — |
| `forge`, `hone`, `imprint`, `refine`, `buyShard` | `delve/crafting.ts` | B2 | the store's actions already call them |
| `dropMaterials` | `arpg/material-drops.ts` | B1 | from `killMonster`, inside its `!world.sandbox` guard |
| `settleDive` | `delve/dive.ts` | B1 | from `extractDive` ('extract'), `failFloor` ('death') and `closeDive` ('abandon', while the dive is `fighting` or `choosing`) |
| `economySim` | `delve/economy.ts` | B3 | the pacing rails and C3's Economy view |

**Temporary paths B1 replaces** (each marked `ponytail:` in the code):
- `loot/drops.ts`' `GEAR_TODAY`: today's gear counts (0.22 + 0.05 a normal foe, 2–3 an elite, 3–4 a boss), times the door's `materials`, which equals the old `dropMult` on every door (the Shrine's 0.5, the Swarm's 1.3). Find still feeds the gear rarity's luck there. With these the pacing rails pass unchanged (checked).
- `arpg/combat.ts`' first-boss drop: a forced legendary item while `LootContext.firstEssence` holds (`!profile.firstEssenceGiven`), and `bankWorld` sets `firstEssenceGiven` once it banks. B1 gives the essence and the epic flux instead, set when the floor's haul banks.
- Kill scrap is still credited on the kill (`world.pending.scrap`), now from `drops.scrapByKind`; B1 turns it into `drops.scrapPickups` pickups.
- `arpg/step.ts` still uses its own magnet speeds (10, 18) and `ITEM_PICKUP_DELAY` (0.35); the same numbers now sit in `delve.drops` (`magnetSpeed`, `vacuumSpeed`, `pickupDelay`) for B1 to read.
- Lucky Charm's `legendaryBoost` still doubles the gear legendary weight in the stand-in; B1 moves it to the essence chance (its text already says so).

**For the areas (the contract in one place):**
- **B1** owns `arpg/material-drops.ts`, `arpg/step.ts`, `arpg/world.ts` (add `materialRng` there), `arpg/combat.ts`, `loot/drops.ts`, `arpg/rune-drops.ts`, `delve/dive.ts`, `delve/stops.ts`, and the arena's pending haul (`WorldPending`, `ArpgWorld.materialRng` in `types/arpg.ts`: no other area edits that file). A material drop is a `Drop` of kind `'material'` with `material: MaterialRef` (`amount` the count); its `pickup` event carries the same `material`. The door's multipliers are read from `world.door?.mods` (`materials`, `runes`, `gear`, `flux`, `essence`, `shardTier`, `find`), the hero's Find from `world.loot.find`, unknown patterns from `world.loot.patterns`. Bank pickups with `addMaterial` / `addHaul` into `dive.haul`, move `haul` into `banked` at `completeFloor`, and settle with `stockHaul`.
- **B2** owns `loot/forge.ts`, `loot/materials.ts` (refining; keep the implemented ops' signatures), `loot/salvage-yield.ts`, `loot/smithing.ts`, `loot/item-generator.ts` (the band and floor roll), `delve/crafting.ts`, `delve/profile.ts`. It re-pins the items hash in `tests/delve-movesets.test.ts` (Phase A strips `hones` from it so it still reads v0.48.0's) and may add codes to `ForgeRefusalCode` (`types/crafting.ts`: no other area edits it).
- **B3** owns `delve/autopilot.ts`, `delve/economy.ts`, `tests/delve-pacing.test.ts`.
- **C1** reads `DiveState.haul`, `banked`, `lost` and the drop / pickup `material`; `RESET_NOTICE` is a store notice like any other (the Delve pages' toasts already show `notices`).
- **C2** calls the store's `forge`, `hone`, `imprint`, `refine`, `buyShard` and renders `previewForge`, `honeCost`, `imprintCost`, `refineCost`, `shardTiersOf` and `delve.crafting.shardBench`; `HubLink`'s `bench` is `'forge' | 'temper'` (`ForgeTab` ignores it until C2 draws both benches).
- **C3** extends `CodexTab`'s `SECTIONS` (a link to `patterns` or `essences` is ignored until then), renders `salvageYield` in the Loadout, and charts `economySim`'s `EconomyReport`.

## Where the spec left room

1. **`forgeItem` vs `forge`.** The spec's forging section names `forgeItem(registry, profile, req)` with the refusals, and its modules list puts the profile ops (with the dive lock) in `delve/crafting.ts`. Phase A splits them: `loot/forge.ts`' `forgeItem(registry, profile, req, rng)` makes the item (throwing where `previewForge` refuses), and `delve/crafting.ts`' `forge(registry, profile, req)` is the profile op the store calls (`ProfileActionResult`, `item` the forged one). Hone and Imprint split the same way (`honeLine`/`hone`, `imprintLine`/`imprint`).
2. **Drop-table rolls live in B1's files.** The spec lists them under `loot/materials.ts` (B2), but drops are B1's: they go in `loot/drops.ts` (beside `stochasticRound`, now exported) and `arpg/material-drops.ts`, so B1 and B2 never share a file. The pouch ops both need are implemented here instead of stubbed, so neither waits on the other.
3. **`MaterialRef`.** The spec has the pickup event "gain `{ kind, id, amount }`", but the event already has `kind: 'pickup'` and `amount`: it gains `material?: MaterialRef`, a union (`{ kind: 'metal', metal }`, `{ kind: 'flux', grade }`, `{ kind: 'shard', stat, tier }`, `{ kind: 'essence', essence }`, `{ kind: 'dust' }`, `{ kind: 'links' }`), and `refine` / `refineCost` take the same ref.
4. **Doors.** `LootContext` doesn't copy the door's multipliers (the world already holds `world.door`); it keeps `find` (gear + door), `legendaryBoost`, `firstEssence`, `patterns`, `nextUid`, `pair`. Starting values: Gilded `find` 75, `flux` 1.5, `essence` 1.5 ("+75% Find, more flux and essences. Monsters have +25% life."); Cursed `shardTier` 0.35 ("Monsters hit 40% harder. Shards and flux often come a tier higher.", its +150% magic find gone); Swarm `materials` 1.3 ("… 30% more materials."); the Shrine `materials` 0.5 and `runes` 0.5 (text unchanged); Champion's Den unchanged (its elites bring the gear). A boss's rune chance stays unmultiplied, as today; the Swarm's 1.3 now lifts only materials, not runes (the spec gives it `materials` alone).
5. **`drops.doors`.** The spec lists the key under "leanings" without defining it: it is each door's shard-family weights, as `biomeShardWeights` (Champion's Den offense 1.5, the Shrine sustain 1.5, the Cursed Crypt element 1.5).
6. **Shapes the spec named without numbers:** `boss.gear` is a count (1); `salvageShardTier` is four rising roll thresholds (tiers II–V; 0.3, 0.55, 0.75, 0.9); `refine.shard.scrap` is by the tier refined (I→II first: 10, 20, 40, 80); `tierWeights` has five entries (8, 4, 2, 1, 0.5); `fluxGradeDepths` [1, 5, 11, 20]; `shardTierDepths` [1, 6, 12, 20, 30]. Every number is a starting point for Phase D.
7. **The kill's scrap.** The spec's formula drops `loot.scrapPerKill`, which stays in the data (at 1): the kill pays `scrapPerKill × scrapLevelFactor × drops.scrapByKind[kind] × (1 + scrapFind / 100)`, today's numbers.
8. **The store's notices.** The spec deletes `fixNotices` with the migration notices, but Realign still words its fixes with it: only its load-time call goes. `runeLostNotices` goes (only the load used it), and so does `ParsedDelveProfile.runesLost`: `fitMovesets` still fits a v8 save's weapons to the data at load (its paths are all data-fitting, none migration-only), and a rune it trims leaves by the balance's pull rule without a notice.
9. **`parseDelveProfile`** returns `{ profile }`, `{ reset: true }` for any `version` other than 8 (a missing one too), or null for a non-object or a version 8 save the schema refuses. The store starts afresh on either of the last two, with `RESET_NOTICE` ("The forge changed: your save was reset") only for a reset, and writes the fresh save back at once so the notice shows once.
10. **`hones` defaults to 0 in `GearItemSchema`.** The Delve save is v8-only, but the Training Grounds' loadout (`alloy:delve:sandbox:v1`) stores items through the same schema; the default keeps a saved loadout loading. No Delve-save migration.
11. **The Forge tab** loses its bench tabs (Temper alone) rather than keeping a one-tab strip; C2 adds Forge | Temper. The Codex's `Section` type stays three until C3.
12. **`economySim(registry, seed, dives)`** returns an `EconomyReport` (`{ seed, dives: EconomyDive[] }`, each dive's `income` and `spent` as `Haul`s, `forged` by rarity, `depth`, `died`), defined in `delve/economy.ts` so B3 owns it whole.
13. **`MaterialsPouch.shards`** arrays count by tier (index tier − 1) and may be shorter than the affix's tier count (missing tiers are 0), as `addMaterial` builds them.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `craft/a`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-craft-a`.
- **Line endings:** keep each file's own (the Edit tool does); new files are LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** the commit blocks format only files a task creates or files that pass `prettier --check` at the base. These were not clean at `25e07e6` and are **only hand-edited, never formatted**: `packages/engine/src/data/balance.json`, `data/delve.json`, `delve/autopilot.ts`, `delve/dive.ts`, `loot/drops.ts`, `loot/item-generator.ts`, `loot/smithing.ts`. Never touch `packages/engine/tests/delve-chain-feel.test.ts` (raw 0xD7 byte).
- **How the edits read** (the 4a plan's language): "Replace: A with: B" is one Edit (old A, new B). "Replace the lines from `A` up to (not including) `B` with: C" is one Edit whose old text runs from the start of the line that reads `A` (ignoring its indentation) to the end of the line before the one that reads `B`, and whose new text is C; "…to the end of the file" runs to the file's last line; "Delete the lines from `A` up to (not including) `B`." removes them. Each `A` and `B` is the only line in the file that reads so, at that point. "Append at the end of the file:" adds a blank line and the block after the last line. "Create `f`:" is a Write. "Delete `f`: `git rm f`." is that command. Within a file, apply its edits top to bottom; every anchor is unique in its file at that point.
- **The client follows the bundle.** Tasks 1–9 never rebuild `packages/engine/dist`, so the client stays green on the base bundle through Task 10 (which touches only client files). Task 11 rebuilds it: against the new bundle the client's typecheck fails in `delveStore.ts`, its test and `DoorPane.tsx` until Task 11's commit.
- **Every engine task runs the whole engine suite** (about 20 s; the pacing rails run while the files load) and the engine typecheck; every client task the whole client suite (about 30 s) and its typecheck. Vitest doesn't type-check tests.
- **Import cycles:** `delve/profile.ts`, `dive.ts`, `pair.ts`, `hero-stats.ts`, `moveset.ts`, `stops.ts` import each other: read such an import only inside a function. `loot/materials.ts` imports only types and the registry's type.
- **Checked on a scratch copy:** `git archive` of `craft/main` at `25e07e6` with junctioned `node_modules`; every task's edits applied by a script that checks each anchor (283 edits, all unique where the plan applies them), giving byte-identical trees to the ones every FAIL, PASS, suite and typecheck below ran on; `prettier --check` passed on every file a commit block formats.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine bundle (the client's) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(pnpm -F @alloy/client build)` |

---

## Chunk 1: The crafting data

### Task 1: `crafting.json`, the crafting types and `getCraftingData`

The types every area trades in, the crafting data with its schema (the metal bands must partition the item levels), the registry getter, and `materialName` read from the metals now that `delve.json → materials` goes.

**Files:**
- Create: `packages/engine/src/types/crafting.ts`, `packages/engine/src/data/crafting.json`, `packages/engine/src/loot/materials.ts`, `packages/engine/tests/delve-crafting-data.test.ts`
- Modify: `packages/engine/src/types/index.ts`, `src/types/delve.ts`, `src/data/schemas.ts`, `src/data/loader.ts`, `src/data/registry.ts`, `src/data/default-registry.ts`, `src/data/delve.json`, `src/loot/item-generator.ts`; `packages/engine/tests/delve-dps-sim.test.ts`, `delve-rune-costs-gate.test.ts`, `delve-rune-power.test.ts` (they build their own registry)

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-crafting-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { CraftingDataSchema } from '../src/data/schemas.js';
import craftingData from '../src/data/crafting.json';
import delveData from '../src/data/delve.json';
import { materialName } from '../src/loot/item-generator.js';
import { metalAt, shardTiersOf } from '../src/loot/materials.js';
import { METAL_IDS } from '../src/types/crafting.js';
import { HERO_STAT_KEYS } from '../src/types/gear.js';

// See the crafting spec: "Tuning: every number in data".

const registry = createDefaultRegistry();
const data = registry.getCraftingData();

describe('crafting.json', () => {
  it('loads the seven metals, lowest first, their bands partitioning the item levels', () => {
    expect(data.metals.map((m) => m.id)).toEqual([...METAL_IDS]);
    expect(data.metals.map((m) => m.band)).toEqual([
      [1, 4],
      [5, 9],
      [10, 15],
      [16, 23],
      [24, 33],
      [34, 47],
      [48, null],
    ]);
    expect(data.flux.map((f) => f.grade)).toEqual(['uncommon', 'magic', 'rare', 'epic']);
    expect('materials' in delveData).toBe(false);
  });

  it('names an item after the metal whose band holds its level', () => {
    expect([0, 1, 4, 5, 15, 16, 47, 48, 200].map((ilvl) => metalAt(registry, ilvl).id)).toEqual([
      'rusty',
      'rusty',
      'rusty',
      'iron',
      'steel',
      'mithril',
      'starforged',
      'voidforged',
      'voidforged',
    ]);
    expect(materialName(registry, 12)).toBe('Steel');
    expect(materialName(registry, 48)).toBe('Voidforged');
  });

  it('gives every affix a family and five shard tiers, the Attune shards two', () => {
    expect(Object.keys(data.families).sort()).toEqual([...HERO_STAT_KEYS].sort());
    for (const a of registry.getDelveData().affixes) expect(data.families[a.stat]).toBeDefined();
    expect(shardTiersOf(registry, 'damage').map((t) => t.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(shardTiersOf(registry, 'fireAttune')).toEqual([
      { tier: 1, min: 0, max: 0.5 },
      { tier: 2, min: 0.5, max: 1 },
    ]);
  });

  it("knows the starter kit: the sword's, the cuirass's and the dagger's patterns, 5 Rusty bars and an uncommon flux", () => {
    expect(data.startingPatterns).toEqual(['sword', 'cuirass', 'dagger']);
    for (const id of data.startingPatterns) expect(registry.getGearBase(id).id).toBe(id);
    expect(data.startingMaterials).toEqual({ metals: { rusty: 5 }, flux: { uncommon: 1 } });
  });
});

describe('CraftingDataSchema', () => {
  const ok = (over: object) => CraftingDataSchema.safeParse({ ...craftingData, ...over }).success;
  const metals = (bands: [number, number | null][]) =>
    craftingData.metals.map((m, i) => ({ ...m, band: bands[i] }));

  it('accepts the data', () => {
    expect(ok({})).toBe(true);
  });

  it('refuses metal bands that leave a gap, overlap, start above 1 or close the last', () => {
    const good: [number, number | null][] = [
      [1, 4],
      [5, 9],
      [10, 15],
      [16, 23],
      [24, 33],
      [34, 47],
      [48, null],
    ];
    expect(ok({ metals: metals(good) })).toBe(true);
    const at = (i: number, band: [number, number | null]) =>
      metals(good.map((b, j) => (j === i ? band : b)));
    expect(ok({ metals: at(1, [6, 9]) })).toBe(false); // a gap at 5
    expect(ok({ metals: at(1, [4, 9]) })).toBe(false); // 4 twice
    expect(ok({ metals: at(0, [2, 4]) })).toBe(false); // nothing at 1
    expect(ok({ metals: at(6, [48, 60]) })).toBe(false); // the last closed
    expect(ok({ metals: at(3, [16, 15]) })).toBe(false); // runs backwards
    expect(ok({ metals: [...craftingData.metals].reverse() })).toBe(false);
  });

  it('refuses a missing family, tiers out of order and a band that runs backwards', () => {
    const { damage: _d, ...families } = craftingData.families;
    expect(ok({ families })).toBe(false);
    const [one, two, ...rest] = craftingData.shardTiers;
    expect(ok({ shardTiers: [two, one, ...rest] })).toBe(false);
    expect(ok({ shardTiers: [{ tier: 1, min: 0.5, max: 0.2 }] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-crafting-data.test.ts)`
Expected: FAIL, no tests: `Error: Cannot find module '../src/data/crafting.json' imported from '…/tests/delve-crafting-data.test.ts'`.

- [ ] **Step 3: The types, the data, the schema and the getter**

Create `packages/engine/src/types/crafting.ts`:

```ts
import type { ChainSkill } from './ability.js';
import type { DelveProfile } from './delve.js';
import type { GearSlot, HeroStatKey, Rarity } from './gear.js';
import type { ManaType } from './mana.js';
import type { RunePouch, RuneRef } from './rune.js';

/**
 * Component crafting and the materials economy (see the crafting spec): what
 * the Anvil forges from, what a dive carries home, and the shapes the forge,
 * salvage and settle ops trade in.
 */

/** The seven metals, lowest first: each sets an item-level band (`crafting.json → metals`). */
export const METAL_IDS = [
  'rusty',
  'iron',
  'steel',
  'mithril',
  'adamant',
  'starforged',
  'voidforged',
] as const;
export type MetalId = (typeof METAL_IDS)[number];

/** The flux grades, lowest first: a bar and a flux make an ingot of that rarity (none: common). */
export const FLUX_GRADES = ['uncommon', 'magic', 'rare', 'epic'] as const;
export type FluxGrade = (typeof FLUX_GRADES)[number];

/** What an affix belongs to, for the biomes' and doors' shard leanings. */
export const AFFIX_FAMILIES = ['offense', 'defense', 'sustain', 'utility', 'element'] as const;
export type AffixFamily = (typeof AFFIX_FAMILIES)[number];

/** An affix shard: its stat and its tier (1 = I), within the affix's tier count. */
export interface ShardRef {
  stat: HeroStatKey;
  tier: number;
}

/**
 * The materials pouch (`DelveProfile.materials`): bars by metal, flux by grade,
 * shards by affix (counts by tier, index tier − 1) and essences by legendary id.
 */
export interface MaterialsPouch {
  metals: Record<MetalId, number>;
  flux: Record<FluxGrade, number>;
  shards: Partial<Record<HeroStatKey, number[]>>;
  essences: Record<string, number>;
}

/** What a floor or a dive carries (`DiveState.haul`, `banked`, `lost`): materials and the currencies. */
export interface Haul extends MaterialsPouch {
  scrap: number;
  /** Mana Dust. */
  dust: number;
  links: number;
  runes: RunePouch;
}

/** One material pickup's kind: a bar, a flux, a shard, an essence, Mana Dust or Links. */
export type MaterialRef =
  | { kind: 'metal'; metal: MetalId }
  | { kind: 'flux'; grade: FluxGrade }
  | ({ kind: 'shard' } & ShardRef)
  | { kind: 'essence'; essence: string }
  | { kind: 'dust' }
  | { kind: 'links' };

/** How a dive's banked materials settle into the stockpile (`settleDive`). */
export type SettleOutcome = 'extract' | 'death' | 'abandon';

// ── Forging ────────────────────────────────────────────────────────────────

/** A forge at the bench: a learned pattern, a bar, a flux (none: common), an essence (legendary, with epic flux), the element and the shards. */
export interface ForgeRequest {
  baseId: string;
  metal: MetalId;
  flux?: FluxGrade;
  /** A legendary id: with epic flux, a legendary carrying that power. */
  essence?: string;
  element: ManaType;
  shards: ShardRef[];
}

/** Why a forge refuses (`ForgePreview.refused`): a code to test and a reason to show. */
export type ForgeRefusalCode =
  | 'locked'
  | 'pattern'
  | 'materials'
  | 'essence'
  | 'essenceSlot'
  | 'shardSlot'
  | 'shardDuplicate'
  | 'shardCount'
  | 'scrap'
  | 'dust'
  | 'bagFull';

export interface ForgeRefusal {
  code: ForgeRefusalCode;
  reason: string;
}

/** One affix line a forge would roll. */
export interface ForgeLinePreview {
  /** The shard that sets the line, or null: it rolls at random from the slot's pool (the shards' affixes left out). */
  shard: ShardRef | null;
  /** Its roll band, 0–1 in the affix's full range: the shard tier's, or the rarity's `[minRoll, 1]`. */
  band: [number, number];
  /** A shard line's value range at the item level (null for a random line). */
  range: [number, number] | null;
}

/** Everything `forgeItem` would make but the random draws (the bench renders only this). */
export interface ForgePreview {
  baseId: string;
  slot: GearSlot;
  rarity: Rarity;
  ilvl: number;
  element: ManaType;
  /** The attunement floor its affix lines and legendary roll take (0 off the pair). */
  floor: number;
  /** Each implicit's value range at the item level and rarity. */
  implicits: { stat: HeroStatKey; min: number; max: number }[];
  /** One per line the rarity rolls (`loot.affixCount`), the shards' first. */
  lines: ForgeLinePreview[];
  /** A legendary's power and its roll band. */
  legendary: { id: string; band: [number, number] } | null;
  /** What it costs besides the bar, flux, essence and shards it consumes. */
  price: { scrap: number; dust: number };
  /** A weapon's carried skills, slots and open sockets (see the crafting spec's S7). */
  weapon: {
    carries: ChainSkill[];
    slots: Partial<Record<ChainSkill, number>>;
    sockets: number;
  } | null;
  refused: ForgeRefusal | null;
}

// ── Salvage ────────────────────────────────────────────────────────────────

/** What salvaging an item could give back (`salvageYield`): the Loadout's preview. */
export interface SalvageYield {
  scrap: number;
  dust: number;
  links: number;
  /** One of these at random (each line's shard at the tier its roll gives); none for a common or a legendary. */
  shards: ShardRef[];
  /** The chance of a second shard, from another line. */
  extraShard: number;
  /** Its base's pattern, when not yet learned. */
  pattern: string | null;
  /** A legendary's essence (its legendary id). */
  essence: string | null;
  /** A weapon's socketed runes, which go by the pull rule. */
  runes: RuneRef[];
}

/** What one salvage gave (`applySalvage`): mid-dive into the floor's haul, at the Anvil into the stockpile. */
export interface SalvageResult {
  profile: DelveProfile;
  scrap: number;
  dust: number;
  links: number;
  shards: ShardRef[];
  pattern: string | null;
  essence: string | null;
  runes: RuneRef[];
  destroyed: RuneRef[];
}

// ── Data (crafting.json) ───────────────────────────────────────────────────

/** A metal: its name and the item levels it forges, `[lo, hi]` (hi null: open-ended). */
export interface MetalDef {
  id: MetalId;
  name: string;
  band: [number, number | null];
}

/** A shard tier's roll band, 0–1 in its affix's range. */
export interface ShardTierDef {
  tier: number;
  min: number;
  max: number;
}

export interface CraftingData {
  /** Lowest first; their bands partition the item levels from 1 up. */
  metals: MetalDef[];
  flux: { grade: FluxGrade }[];
  /** The default shard tiers, I up. */
  shardTiers: ShardTierDef[];
  /** An affix's own tiers, in place of the default (the `*Attune` shards: I–II). */
  affixShardTiers: Partial<Record<HeroStatKey, ShardTierDef[]>>;
  /** Every affix's family. */
  families: Record<HeroStatKey, AffixFamily>;
  /** The patterns a new save knows. */
  startingPatterns: string[];
  /** The materials a new save holds. */
  startingMaterials: {
    metals: Partial<Record<MetalId, number>>;
    flux: Partial<Record<FluxGrade, number>>;
  };
}
```

In `packages/engine/src/types/index.ts`:

Replace:

```ts
export * from './rune.js';
```

with:

```ts
export * from './rune.js';
export * from './crafting.js';
```

Create `packages/engine/src/data/crafting.json`:

```json
{
  "metals": [
    { "id": "rusty", "name": "Rusty", "band": [1, 4] },
    { "id": "iron", "name": "Iron", "band": [5, 9] },
    { "id": "steel", "name": "Steel", "band": [10, 15] },
    { "id": "mithril", "name": "Mithril", "band": [16, 23] },
    { "id": "adamant", "name": "Adamant", "band": [24, 33] },
    { "id": "starforged", "name": "Starforged", "band": [34, 47] },
    { "id": "voidforged", "name": "Voidforged", "band": [48, null] }
  ],
  "flux": [{ "grade": "uncommon" }, { "grade": "magic" }, { "grade": "rare" }, { "grade": "epic" }],
  "shardTiers": [
    { "tier": 1, "min": 0, "max": 0.3 },
    { "tier": 2, "min": 0.2, "max": 0.5 },
    { "tier": 3, "min": 0.4, "max": 0.7 },
    { "tier": 4, "min": 0.6, "max": 0.85 },
    { "tier": 5, "min": 0.8, "max": 1 }
  ],
  "affixShardTiers": {
    "fireAttune": [
      { "tier": 1, "min": 0, "max": 0.5 },
      { "tier": 2, "min": 0.5, "max": 1 }
    ],
    "frostAttune": [
      { "tier": 1, "min": 0, "max": 0.5 },
      { "tier": 2, "min": 0.5, "max": 1 }
    ],
    "stormAttune": [
      { "tier": 1, "min": 0, "max": 0.5 },
      { "tier": 2, "min": 0.5, "max": 1 }
    ],
    "earthAttune": [
      { "tier": 1, "min": 0, "max": 0.5 },
      { "tier": 2, "min": 0.5, "max": 1 }
    ],
    "shadowAttune": [
      { "tier": 1, "min": 0, "max": 0.5 },
      { "tier": 2, "min": 0.5, "max": 1 }
    ],
    "natureAttune": [
      { "tier": 1, "min": 0, "max": 0.5 },
      { "tier": 2, "min": 0.5, "max": 1 }
    ]
  },
  "families": {
    "damage": "offense",
    "damagePct": "offense",
    "attackSpeedPct": "offense",
    "critChance": "offense",
    "critDamage": "offense",
    "maxHp": "defense",
    "hpPct": "defense",
    "armor": "defense",
    "dodge": "defense",
    "thorns": "defense",
    "lifesteal": "sustain",
    "healOnKill": "sustain",
    "manaRegen": "sustain",
    "magicFind": "utility",
    "scrapFind": "utility",
    "moveSpeed": "utility",
    "cooldownReduction": "utility",
    "firePower": "element",
    "frostPower": "element",
    "stormPower": "element",
    "earthPower": "element",
    "shadowPower": "element",
    "naturePower": "element",
    "fireAttune": "element",
    "frostAttune": "element",
    "stormAttune": "element",
    "earthAttune": "element",
    "shadowAttune": "element",
    "natureAttune": "element"
  },
  "startingPatterns": ["sword", "cuirass", "dagger"],
  "startingMaterials": { "metals": { "rusty": 5 }, "flux": { "uncommon": 1 } }
}
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
import { MAX_SOCKETS, RUNE_FAMILIES, RUNE_TIERS } from '../types/rune.js';
```

with:

```ts
import { MAX_SOCKETS, RUNE_FAMILIES, RUNE_TIERS } from '../types/rune.js';
import { AFFIX_FAMILIES, FLUX_GRADES, METAL_IDS } from '../types/crafting.js';
```

Replace:

```ts
  materials: z.array(z.object({ minIlvl: z.number().int().positive(), name: z.string() })).min(1),
  names: z.object({
    prefixes: z.array(z.string()).min(1),
    suffixes: perSlot(z.array(z.string()).min(1)),
```

with:

```ts
  names: z.object({
    prefixes: z.array(z.string()).min(1),
    suffixes: perSlot(z.array(z.string()).min(1)),
  }),
});

// --- Crafting (crafting.json; see the crafting spec) ---

export const MetalIdSchema = z.enum(METAL_IDS);
export const FluxGradeSchema = z.enum(FLUX_GRADES);
const AffixFamilySchema = z.enum(AFFIX_FAMILIES);

/** Shard tiers, numbered from 1 in order, each band within 0–1. */
const ShardTiersSchema = z
  .array(
    z
      .object({ tier: z.number().int().min(1), min: z.number().min(0), max: z.number().max(1) })
      .refine((t) => t.min <= t.max, 'a tier band runs low to high'),
  )
  .min(1)
  .refine((ts) => ts.every((t, i) => t.tier === i + 1), 'tiers run 1, 2, 3… in order');

export const CraftingDataSchema = z.object({
  // Every metal once, lowest first, their bands partitioning the item levels from 1 up.
  metals: z
    .array(
      z.object({
        id: MetalIdSchema,
        name: z.string(),
        band: z.tuple([z.number().int().min(1), z.number().int().min(1).nullable()]),
      }),
    )
    .refine(
      (ms) => ms.map((m) => m.id).join() === METAL_IDS.join(),
      'every metal once, lowest first',
    )
    .refine(
      (ms) =>
        ms.every(({ band: [lo, hi] }, i) => {
          const last = i === ms.length - 1;
          const from = i === 0 ? 1 : (ms[i - 1].band[1] ?? NaN) + 1;
          return lo === from && (last ? hi === null : hi !== null && hi >= lo);
        }),
      'metal bands partition the item levels from 1 up: contiguous, no overlap, the last open-ended',
    ),
  flux: z
    .array(z.object({ grade: FluxGradeSchema }))
    .refine(
      (fs) => fs.map((f) => f.grade).join() === FLUX_GRADES.join(),
      'every grade once, lowest first',
    ),
  shardTiers: ShardTiersSchema,
  affixShardTiers: z.record(HeroStatKeySchema, ShardTiersSchema),
  families: z
    .record(HeroStatKeySchema, AffixFamilySchema)
    .refine((f) => HeroStatKeySchema.options.every((k) => k in f), 'every affix stat has a family'),
  startingPatterns: z.array(z.string()).min(1),
  startingMaterials: z.object({
    metals: z.record(MetalIdSchema, z.number().int().min(0)),
    flux: z.record(FluxGradeSchema, z.number().int().min(0)),
```

In `packages/engine/src/data/loader.ts`:

Replace:

```ts
import type { RuneDef } from '../types/rune.js';
```

with:

```ts
import type { RuneDef } from '../types/rune.js';
import type { CraftingData } from '../types/crafting.js';
```

Replace:

```ts
  ArpgDataSchema,
```

with:

```ts
  ArpgDataSchema,
  CraftingDataSchema,
```

Replace:

```ts
import rawRunes from './runes.json';
```

with:

```ts
import rawRunes from './runes.json';
import rawCrafting from './crafting.json';
```

Replace:

```ts
  arpg: ArpgData;
```

with:

```ts
  arpg: ArpgData;
  crafting: CraftingData;
```

Replace:

```ts

  return { affixes, combinations, recipes, synergies, baseItems, balance, delve, arpg };
```

with:

```ts
  const crafting = CraftingDataSchema.parse(rawCrafting) as CraftingData;

  return { affixes, combinations, recipes, synergies, baseItems, balance, delve, arpg, crafting };
```

In `packages/engine/src/data/registry.ts`:

Replace:

```ts
import type { ManaType } from '../types/mana.js';
```

with:

```ts
import type { ManaType } from '../types/mana.js';
import type { CraftingData } from '../types/crafting.js';
```

Replace:

```ts
    private readonly arpgData: ArpgData | null = null,
```

with:

```ts
    private readonly arpgData: ArpgData | null = null,
    private readonly craftingData: CraftingData | null = null,
```

Replace:

```ts
  getDelveBalance(): DelveBalance {
```

with:

```ts
  /** `crafting.json`: metals, flux, shard tiers, families and the new save's kit (see the crafting spec). */
  getCraftingData(): CraftingData {
    if (!this.craftingData) throw new Error('Crafting data not loaded — pass it to DataRegistry');
    return this.craftingData;
  }

  getDelveBalance(): DelveBalance {
```

In `packages/engine/src/data/default-registry.ts`:

Replace:

```ts
    data.arpg,
```

with:

```ts
    data.arpg,
    data.crafting,
```

Create `packages/engine/src/loot/materials.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { MetalDef, ShardTierDef } from '../types/crafting.js';
import type { HeroStatKey } from '../types/gear.js';

/**
 * The materials (see the crafting spec): the data's lookups, the pouch and
 * haul ops every area shares, and refining.
 */

/** The metal whose band holds `ilvl` (below 1 counts as 1). */
export function metalAt(registry: DataRegistry, ilvl: number): MetalDef {
  // The bands run from 1 up and the last is open, so one always holds it.
  return registry
    .getCraftingData()
    .metals.find(({ band: [, hi] }) => hi === null || Math.max(1, ilvl) <= hi)!;
}

/** An affix's shard tiers: its own (`affixShardTiers`), else the default ones. */
export function shardTiersOf(registry: DataRegistry, stat: HeroStatKey): ShardTierDef[] {
  const data = registry.getCraftingData();
  return data.affixShardTiers[stat] ?? data.shardTiers;
}
```

In `packages/engine/src/loot/item-generator.ts`:

Replace:

```ts
import { rollMoveset, rollSockets } from './moveset.js';
```

with:

```ts
import { rollMoveset, rollSockets } from './moveset.js';
import { metalAt } from './materials.js';
```

Replace:

```ts
export function materialName(registry: DataRegistry, ilvl: number): string {
  let name = registry.getDelveData().materials[0].name;
  for (const m of registry.getDelveData().materials) {
    if (ilvl >= m.minIlvl) name = m.name;
  }
  return name;
```

with:

```ts
/** The name of the metal whose band holds `ilvl` (`crafting.json → metals`): a forged item's name matches its bar. */
export function materialName(registry: DataRegistry, ilvl: number): string {
  return metalAt(registry, ilvl).name;
```

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
export interface MaterialDef {
  minIlvl: number;
  name: string;
}

export interface DelveData {
```

with:

```ts
export interface DelveData {
```

Replace:

```ts
  materials: MaterialDef[];
  names: { prefixes: string[]; suffixes: Record<GearSlot, string[]> };
```

with:

```ts
  names: { prefixes: string[]; suffixes: Record<GearSlot, string[]> };
```

In `packages/engine/src/data/delve.json`:

Delete the lines from `"materials": [` up to (not including) `"names": {`.

The three tests that build their own registry pass the crafting data too (a registry without it throws on `materialName`):

In `packages/engine/tests/delve-dps-sim.test.ts`:

Replace:

```ts
    d.arpg,
```

with:

```ts
    d.arpg,
    d.crafting,
```

In `packages/engine/tests/delve-rune-costs-gate.test.ts`:

Replace:

```ts
    d.arpg,
```

with:

```ts
    d.arpg,
    d.crafting,
```

In `packages/engine/tests/delve-rune-power.test.ts`:

Replace:

```ts
    d.arpg,
```

with:

```ts
    d.arpg,
    d.crafting,
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-crafting-data.test.ts)`
Expected: PASS, 7 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 7 tests in F + 1 files pass (1660 | 5 skipped in 85 | 1 skipped at the base's counts).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-a
(cd packages/engine && npx prettier --write --end-of-line auto src/types/crafting.ts src/types/index.ts src/data/crafting.json src/data/schemas.ts src/data/loader.ts src/data/registry.ts src/data/default-registry.ts src/loot/materials.ts src/types/delve.ts tests/delve-crafting-data.test.ts tests/delve-dps-sim.test.ts tests/delve-rune-costs-gate.test.ts tests/delve-rune-power.test.ts)
git add packages/engine/src/types/crafting.ts packages/engine/src/types/index.ts packages/engine/src/data/crafting.json packages/engine/src/data/schemas.ts packages/engine/src/data/loader.ts packages/engine/src/data/registry.ts packages/engine/src/data/default-registry.ts packages/engine/src/loot/materials.ts packages/engine/src/loot/item-generator.ts packages/engine/src/types/delve.ts packages/engine/src/data/delve.json packages/engine/tests/delve-crafting-data.test.ts packages/engine/tests/delve-dps-sim.test.ts packages/engine/tests/delve-rune-costs-gate.test.ts packages/engine/tests/delve-rune-power.test.ts
git commit -m "feat(engine): crafting.json, the crafting types and getCraftingData; item names from the metals" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The balance blocks

### Task 2: `delve.crafting` and `delve.drops`; pity and the old gear counts leave the data

Both balance blocks with their schemas and starting numbers; the five removed loot fields and pity gone from the types, the schema, the data and the code (`rarityWeights`, the drop context, the loot context, the dive); `KILL_SCRAP_MULT` becomes `drops.scrapByKind`. The gear drops keep today's numbers through `GEAR_TODAY`, a marked stand-in B1 replaces.

**Files:**
- Modify: `packages/engine/src/types/crafting.ts`, `src/types/delve.ts`, `src/data/schemas.ts`, `src/data/balance.json`, `src/loot/item-generator.ts`, `src/loot/drops.ts`, `src/arpg/combat.ts`, `src/types/arpg.ts`, `src/arpg/sandbox.ts`, `src/delve/dive.ts`
- Modify (tests): `packages/engine/tests/delve-crafting-data.test.ts`, `delve-loot.test.ts`, `fixtures/arena.ts`, `arpg-sim.test.ts`, `delve-movesets.test.ts`, `delve-pair.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-crafting-data.test.ts`:

Replace:

```ts
import { CraftingDataSchema } from '../src/data/schemas.js';
import craftingData from '../src/data/crafting.json';
import delveData from '../src/data/delve.json';
import { materialName } from '../src/loot/item-generator.js';
import { metalAt, shardTiersOf } from '../src/loot/materials.js';
import { METAL_IDS } from '../src/types/crafting.js';
import { HERO_STAT_KEYS } from '../src/types/gear.js';
```

with:

```ts
import {
  CraftingBalanceSchema,
  CraftingDataSchema,
  DropsBalanceSchema,
} from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';
import craftingData from '../src/data/crafting.json';
import delveData from '../src/data/delve.json';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { materialName, scrapLevelFactor } from '../src/loot/item-generator.js';
import { metalAt, shardTiersOf } from '../src/loot/materials.js';
import { METAL_IDS } from '../src/types/crafting.js';
import { HERO_STAT_KEYS } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import { arena } from './fixtures/arena.js';
```

Append at the end of the file:

```ts
describe('balance: delve.crafting and delve.drops', () => {
  const bal = registry.getDelveBalance();

  it("loads both blocks; a forged weapon's extras start at the low end of a drop's", () => {
    expect(bal.crafting.deathLoss).toBe(0.4);
    expect(bal.crafting.shardBench).toEqual({ scrap: 30, dust: 5 });
    for (const r of RARITY_ORDER)
      expect(bal.crafting.weaponExtras[r]).toEqual({
        slots: bal.movesets.extraSlots[r][0],
        sockets: bal.runes.socketDrops[r][0],
      });
    expect(bal.drops.scrapByKind).toEqual({ normal: 1, elite: 3, boss: 10 });
    expect([bal.drops.magnetSpeed, bal.drops.vacuumSpeed, bal.drops.pickupDelay]).toEqual([
      10, 18, 0.35,
    ]);
    for (const biome of registry.getDelveData().biomes)
      expect(bal.drops.biomeShardWeights[biome.id], biome.id).toBeDefined();
    for (const door of Object.keys(bal.drops.doors)) expect(registry.getDoor(door).id).toBe(door);
  });

  it('drops the old gear counts and pity from the data', () => {
    const loot = balanceData.delve.loot;
    for (const gone of [
      'pityPerDrop',
      'normalDropChance',
      'extraDropChance',
      'eliteDrops',
      'bossDrops',
    ])
      expect(gone in loot, gone).toBe(false);
  });

  it('refuses a count that runs backwards, thresholds that fall, a loss past 1 and tiers not from depth 1', () => {
    const crafting = balanceData.delve.crafting;
    const drops = balanceData.delve.drops;
    expect(CraftingBalanceSchema.safeParse(crafting).success).toBe(true);
    expect(DropsBalanceSchema.safeParse(drops).success).toBe(true);
    const craft = (over: object) =>
      CraftingBalanceSchema.safeParse({ ...crafting, ...over }).success;
    expect(craft({ deathLoss: 1.2 })).toBe(false);
    expect(craft({ salvageShardTier: [0.3, 0.2, 0.75, 0.9] })).toBe(false);
    const drop = (over: object) => DropsBalanceSchema.safeParse({ ...drops, ...over }).success;
    expect(drop({ normal: { ...drops.normal, bars: { chance: 0.5, count: [2, 1] } } })).toBe(false);
    expect(drop({ shardTierDepths: [2, 6, 12, 20, 30] })).toBe(false);
    expect(drop({ fluxGradeDepths: [1, 5, 11] })).toBe(false);
  });

  it("pays a kill's scrap by its kind from the data", () => {
    const w = arena([
      { x: 13, y: 20 },
      { x: 15, y: 20, kind: 'elite' },
    ]);
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    for (const m of w.monsters) killMonster(ctx, m);
    const each = bal.loot.scrapPerKill * scrapLevelFactor(registry, w.depth);
    const scrap = (kind: 'normal' | 'elite') =>
      Math.round(each * bal.drops.scrapByKind[kind] * (1 + w.hero.stats.scrapFind / 100));
    expect(events.flatMap((e) => (e.kind === 'death' ? [e.scrap] : []))).toEqual([
      scrap('normal'),
      scrap('elite'),
    ]);
  });
});
```

In `packages/engine/tests/delve-loot.test.ts`:

Replace:

```ts
  function distribution(luck: number, pity = 0, seed = 1, n = 20000): Record<Rarity, number> {
    const rng = new SeededRNG(seed);
    const out = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>;
    for (let i = 0; i < n; i++) out[rollRarity(registry, { luck, pity }, rng)]++;
```

with:

```ts
  function distribution(luck: number, seed = 1, n = 20000): Record<Rarity, number> {
    const rng = new SeededRNG(seed);
    const out = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>;
    for (let i = 0; i < n; i++) out[rollRarity(registry, { luck }, rng)]++;
```

Replace:

```ts
  it('pity raises legendary weight', () => {
    const w0 = rarityWeights(registry, { luck: 0, pity: 0 });
    const w1 = rarityWeights(registry, { luck: 0, pity: 200 });
    expect(w1.legendary).toBeGreaterThan(w0.legendary * 2);
    expect(w1.common).toBe(w0.common);
```

with:

```ts
  it("Lucky Charm's boost multiplies only the legendary weight", () => {
    const w0 = rarityWeights(registry, { luck: 0 });
    const w2 = rarityWeights(registry, { luck: 0, legendaryBoost: 2 });
    expect(w2.legendary).toBe(w0.legendary * 2);
    expect(w2.common).toBe(w0.common);
```

Replace:

```ts
      const r = rollRarity(registry, { luck: 0, pity: 0, minRarity: 'rare' }, rng);
```

with:

```ts
      const r = rollRarity(registry, { luck: 0, minRarity: 'rare' }, rng);
```

Replace:

```ts
    pity: 0,
    dropMult: 1,
```

with:

```ts
    dropMult: 1,
```

Replace:

```ts
      const [min, max] = registry.getDelveBalance().loot.bossDrops;
```

with:

```ts
      // Phase A's stand-in counts (`loot/drops.ts`); the drop tables replace them.
      const [min, max] = [3, 4];
```

Replace the lines from `it('forceLegendary makes the first drop legendary and resets pity', () => {` up to (not including) `it('assigns sequential unique uids', () => {` with:

```ts
  it('forceLegendary makes the first drop legendary', () => {
    const res = rollEncounterDrops(
      registry,
      { ...base, kind: 'boss', forceLegendary: true },
      new SeededRNG(1),
    );
    expect(res.items[0].rarity).toBe('legendary');
  });

```

Replace:

```ts
    const loot = registry.getDelveBalance().loot;
    expect(avg).toBeGreaterThan((loot.normalDropChance + loot.extraDropChance) * 0.6);
    expect(avg).toBeLessThan((loot.normalDropChance + loot.extraDropChance) * 1.4);
```

with:

```ts
    // Phase A's stand-in chances (`loot/drops.ts`: 0.22 and 0.05); the drop tables replace them.
    expect(avg).toBeGreaterThan(0.27 * 0.6);
    expect(avg).toBeLessThan(0.27 * 1.4);
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-crafting-data.test.ts tests/delve-loot.test.ts)`
Expected: FAIL, 6 failed | 28 passed: the four new balance tests (`Cannot read properties of undefined (reading 'deathLoss')`, `pityPerDrop: expected true to be false`, `… (reading 'safeParse')`, `… (reading 'scrapByKind')`) and `rollRarity`'s two distribution tests (without `pity` the old weights are NaN: `expected 0 to be greater than 0`).

- [ ] **Step 3: The blocks, the schemas and the code**

In `packages/engine/src/types/crafting.ts`:

Replace:

```ts
import type { ChainSkill } from './ability.js';
```

with:

```ts
import type { ChainSkill } from './ability.js';
import type { MonsterKind } from './arpg.js';
```

Append at the end of the file:

```ts
// ── Balance (balance.json → delve.crafting, delve.drops) ──────────────────

/** A drop-table entry: the chance it drops at all (× the door's `materials`, at most 1), then a uniform count. */
export interface DropEntry {
  chance: number;
  count: [number, number];
}

export interface CraftingBalance {
  /** A forge's scrap by rarity, × `scrapLevelFactor(ilvl)`. */
  forgeScrap: Record<Rarity, number>;
  /** Mana Dust to forge in an element outside the pair. */
  offPairDust: number;
  /** A forged weapon's extra slots and open sockets, by rarity (placed as the spec's S7 says). */
  weaponExtras: Record<Rarity, { slots: number; sockets: number }>;
  /** A hone's scrap: this × `forge.rarityCostMult` × `honeGrowth` ^ hones × `scrapLevelFactor(ilvl)`. */
  honeScrap: number;
  honeGrowth: number;
  /** An imprint's scrap by rarity, × `scrapLevelFactor(ilvl)`, besides the shard. */
  imprintScrap: Record<Rarity, number>;
  /** Refining `count` of a grade into one of the next, for scrap (a shard's by the tier refined, I→II first). */
  refine: {
    metal: { count: number; scrap: number };
    flux: { count: number; scrap: number };
    shard: { count: number; scrap: number[] };
  };
  /** The attunement floor on an in-pair item's affix and legendary rolls: min(cap, perPoint × attunement). */
  attuneRoll: { perPoint: number; cap: number };
  /** A salvaged line's shard tier: the roll thresholds it passes, one per tier past I (clamped to the affix's last). */
  salvageShardTier: number[];
  /** Chance a salvage gives a second shard, from another line. */
  salvageExtraShard: number;
  /** The shard bench's price for a tier I shard. */
  shardBench: { scrap: number; dust: number };
  /** The share of a dive's banked materials a death or an abandon loses. */
  deathLoss: number;
}

export interface DropsBalance {
  normal: { bars: DropEntry; dust: DropEntry; shards: DropEntry; links: DropEntry };
  elite: {
    bars: DropEntry;
    dust: DropEntry;
    shards: DropEntry;
    links: DropEntry;
    flux: DropEntry;
    /** Chance an elite drops a gear item (× the door's `gear`). */
    gearChance: number;
    /** Chance of a pattern the hero doesn't know (none once every pattern is known). */
    patternChance: number;
  };
  boss: {
    /** Gear items a boss drops, rolled as today's boss item (at least `loot.bossMinRarity`). */
    gear: number;
    flux: DropEntry;
    shards: DropEntry;
    /** Chance of an essence (× the door's `essence` and Lucky Charm's `legendaryBoost`). */
    essenceChance: number;
    patternChance: number;
  };
  /** A kill's scrap by foe kind: `scrapLevelFactor(ilvl)` × this × (1 + scrapFind / 100). */
  scrapByKind: Record<MonsterKind, number>;
  /** The scrap pickups a kill's scrap is split into. */
  scrapPickups: Record<MonsterKind, number>;
  /** Chance a bar comes as the next metal up. */
  metalUpChance: number;
  /** Find: each flux or shard drop comes a grade or tier up with chance min(cap, Find / 100 × perPoint). */
  find: { perPoint: number; cap: number };
  /** The depth each shard tier, I to V, starts dropping at. */
  shardTierDepths: number[];
  /** The depth each flux grade, uncommon to epic, starts dropping at. */
  fluxGradeDepths: number[];
  /** The weights of the tiers (or grades) a floor can drop, lowest first. */
  tierWeights: number[];
  /** A biome's shard leanings: an affix's weight × this by its family (missing: 1). */
  biomeShardWeights: Record<string, Partial<Record<AffixFamily, number>>>;
  /** The biome element's `*Power` and `*Attune` shards' weight × this. */
  biomeElementWeight: number;
  /** A door's shard leanings, as `biomeShardWeights`. */
  doors: Record<string, Partial<Record<AffixFamily, number>>>;
  /** The magnet's pull speed and the floor-clear vacuum's, in units a second. */
  magnetSpeed: number;
  vacuumSpeed: number;
  /** Seconds before a fresh drop can be picked up. */
  pickupDelay: number;
}
```

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
import type { MonsterKind } from './arpg.js';
```

with:

```ts
import type { MonsterKind } from './arpg.js';
import type { CraftingBalance, DropsBalance } from './crafting.js';
```

Replace:

```ts
    pityPerDrop: number;
    normalDropChance: number;
    extraDropChance: number;
    eliteDrops: [number, number];
    bossDrops: [number, number];
    bossMinRarity: Rarity;
```

with:

```ts
    bossMinRarity: Rarity;
```

Replace:

```ts
  sandbox: SandboxBalance;
```

with:

```ts
  sandbox: SandboxBalance;
  /** Forging, Temper, refining, salvage and the death loss (see the crafting spec). */
  crafting: CraftingBalance;
  /** The drop tables, Find, the leanings and the pickups' feel (see the crafting spec). */
  drops: DropsBalance;
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
const AbilitySlotBalanceSchema = z.object({
```

with:

```ts
/** A drop-table entry: a chance, then a count from lo to hi. */
const DropEntrySchema = z.object({
  chance: z.number().min(0).max(1),
  count: z
    .tuple([z.number().int().min(0), z.number().int().min(0)])
    .refine(([lo, hi]) => lo <= hi, 'a count runs low to high'),
});

function perFoe<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ normal: schema, elite: schema, boss: schema });
}

/** Weights by affix family (a family left out weighs 1). */
const FamilyWeightsSchema = z.record(z.enum(AFFIX_FAMILIES), z.number().min(0));

/** Depths a tier or grade starts at: the first at 1, rising. */
const StartDepthsSchema = z
  .array(z.number().int().min(1))
  .min(1)
  .refine((ds) => ds[0] === 1 && ds.every((d, i) => i === 0 || d > ds[i - 1]), 'from 1, rising');

/** `balance.json → delve.crafting` (see the crafting spec). */
export const CraftingBalanceSchema = z.object({
  forgeScrap: perRarity(z.number().min(0)),
  offPairDust: z.number().int().min(0),
  weaponExtras: perRarity(
    z.object({ slots: z.number().int().min(0), sockets: z.number().int().min(0) }),
  ),
  honeScrap: z.number().min(0),
  honeGrowth: z.number().min(1),
  imprintScrap: perRarity(z.number().min(0)),
  refine: z.object({
    metal: z.object({ count: z.number().int().min(2), scrap: z.number().min(0) }),
    flux: z.object({ count: z.number().int().min(2), scrap: z.number().min(0) }),
    shard: z.object({
      count: z.number().int().min(2),
      // By the tier refined: I→II, II→III, III→IV, IV→V.
      scrap: z.array(z.number().min(0)).length(4),
    }),
  }),
  attuneRoll: z.object({ perPoint: z.number().min(0), cap: z.number().min(0).max(1) }),
  salvageShardTier: z
    .array(z.number().min(0).max(1))
    .length(4)
    .refine((ts) => ts.every((t, i) => i === 0 || t > ts[i - 1]), 'thresholds rise'),
  salvageExtraShard: z.number().min(0).max(1),
  shardBench: z.object({ scrap: z.number().min(0), dust: z.number().min(0) }),
  deathLoss: z.number().min(0).max(1),
});

/** `balance.json → delve.drops` (see the crafting spec). */
export const DropsBalanceSchema = z.object({
  normal: z.object({
    bars: DropEntrySchema,
    dust: DropEntrySchema,
    shards: DropEntrySchema,
    links: DropEntrySchema,
  }),
  elite: z.object({
    bars: DropEntrySchema,
    dust: DropEntrySchema,
    shards: DropEntrySchema,
    links: DropEntrySchema,
    flux: DropEntrySchema,
    gearChance: z.number().min(0).max(1),
    patternChance: z.number().min(0).max(1),
  }),
  boss: z.object({
    gear: z.number().int().min(0),
    flux: DropEntrySchema,
    shards: DropEntrySchema,
    essenceChance: z.number().min(0).max(1),
    patternChance: z.number().min(0).max(1),
  }),
  scrapByKind: perFoe(z.number().min(0)),
  scrapPickups: perFoe(z.number().int().min(1)),
  metalUpChance: z.number().min(0).max(1),
  find: z.object({ perPoint: z.number().min(0), cap: z.number().min(0).max(1) }),
  shardTierDepths: StartDepthsSchema.refine((ds) => ds.length === 5, 'one per tier, I to V'),
  fluxGradeDepths: StartDepthsSchema.refine(
    (ds) => ds.length === FLUX_GRADES.length,
    'one per grade, uncommon to epic',
  ),
  tierWeights: z.array(z.number().positive()).length(5),
  biomeShardWeights: z.record(z.string(), FamilyWeightsSchema),
  biomeElementWeight: z.number().min(0),
  doors: z.record(z.string(), FamilyWeightsSchema),
  magnetSpeed: z.number().positive(),
  vacuumSpeed: z.number().positive(),
  pickupDelay: z.number().min(0),
});

const AbilitySlotBalanceSchema = z.object({
```

Replace:

```ts
    pityPerDrop: z.number().min(0),
    normalDropChance: z.number().min(0).max(1),
    extraDropChance: z.number().min(0).max(1),
    eliteDrops: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    bossDrops: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    bossMinRarity: RaritySchema,
```

with:

```ts
    bossMinRarity: RaritySchema,
```

Replace:

```ts
  }),
  arena: z.object({
```

with:

```ts
  }),
  crafting: CraftingBalanceSchema,
  drops: DropsBalanceSchema,
  arena: z.object({
```

In `packages/engine/src/data/balance.json`:

Replace:

```json
      "luckExponent": 0.6, "luckPerDepth": 0.015, "maxDepthLuck": 0.75, "eliteLuck": 0.6, "bossLuck": 1.5, "pityPerDrop": 0.012,
      "normalDropChance": 0.22, "extraDropChance": 0.05, "eliteDrops": [2, 3], "bossDrops": [3, 4], "bossMinRarity": "rare",
```

with:

```json
      "luckExponent": 0.6, "luckPerDepth": 0.015, "maxDepthLuck": 0.75, "eliteLuck": 0.6, "bossLuck": 1.5, "bossMinRarity": "rare",
```

Replace:

```json
    },
    "sandbox": { "dummyLifeMult": 50, "heroStart": [13, 26], "dummyDistance": 3, "rowSpacing": 1.2, "clumpRadius": 1.2, "groupSpacing": 3.6, "spawnRing": 6, "edgeMargin": 1.5 },
```

with:

```json
    },
    "crafting": {
      "forgeScrap": { "common": 10, "uncommon": 20, "magic": 40, "rare": 80, "epic": 160, "legendary": 320 },
      "offPairDust": 10,
      "weaponExtras": {
        "common": { "slots": 0, "sockets": 0 }, "uncommon": { "slots": 0, "sockets": 0 }, "magic": { "slots": 0, "sockets": 0 },
        "rare": { "slots": 1, "sockets": 0 }, "epic": { "slots": 2, "sockets": 1 }, "legendary": { "slots": 3, "sockets": 2 }
      },
      "honeScrap": 15, "honeGrowth": 1.5,
      "imprintScrap": { "common": 0, "uncommon": 10, "magic": 20, "rare": 40, "epic": 80, "legendary": 120 },
      "refine": { "metal": { "count": 3, "scrap": 10 }, "flux": { "count": 3, "scrap": 25 }, "shard": { "count": 3, "scrap": [10, 20, 40, 80] } },
      "attuneRoll": { "perPoint": 0.03, "cap": 0.5 },
      "salvageShardTier": [0.3, 0.55, 0.75, 0.9], "salvageExtraShard": 0.25,
      "shardBench": { "scrap": 30, "dust": 5 },
      "deathLoss": 0.4
    },
    "drops": {
      "normal": {
        "bars": { "chance": 0.35, "count": [1, 1] }, "dust": { "chance": 0.15, "count": [1, 2] },
        "shards": { "chance": 0.12, "count": [1, 1] }, "links": { "chance": 0.01, "count": [1, 1] }
      },
      "elite": {
        "bars": { "chance": 0.9, "count": [1, 2] }, "dust": { "chance": 0.5, "count": [2, 4] },
        "shards": { "chance": 0.6, "count": [1, 2] }, "links": { "chance": 0.08, "count": [1, 1] },
        "flux": { "chance": 0.3, "count": [1, 1] }, "gearChance": 0.5, "patternChance": 0.1
      },
      "boss": {
        "gear": 1, "flux": { "chance": 1, "count": [1, 2] }, "shards": { "chance": 1, "count": [2, 3] },
        "essenceChance": 0.15, "patternChance": 0.35
      },
      "scrapByKind": { "normal": 1, "elite": 3, "boss": 10 }, "scrapPickups": { "normal": 1, "elite": 3, "boss": 8 },
      "metalUpChance": 0.1, "find": { "perPoint": 0.5, "cap": 0.5 },
      "shardTierDepths": [1, 6, 12, 20, 30], "fluxGradeDepths": [1, 5, 11, 20], "tierWeights": [8, 4, 2, 1, 0.5],
      "biomeShardWeights": {
        "cinder_mines": { "offense": 1.5 }, "frostvault": { "defense": 1.5 }, "storm_foundry": { "utility": 1.5 },
        "sunken_quarry": { "defense": 1.3, "sustain": 1.2 }, "bone_crypts": { "sustain": 1.5 }, "molten_core": { "offense": 1.3, "element": 1.2 }
      },
      "biomeElementWeight": 2,
      "doors": { "champions": { "offense": 1.5 }, "shrine": { "sustain": 1.5 }, "cursed": { "element": 1.5 } },
      "magnetSpeed": 10, "vacuumSpeed": 18, "pickupDelay": 0.35
    },
    "sandbox": { "dummyLifeMult": 50, "heroStart": [13, 26], "dummyDistance": 3, "rowSpacing": 1.2, "clumpRadius": 1.2, "groupSpacing": 3.6, "spawnRing": 6, "edgeMargin": 1.5 },
```

In `packages/engine/src/loot/item-generator.ts`:

Replace:

```ts
  /** Drops since the last legendary. */
  pity: number;
  minRarity?: Rarity;
```

with:

```ts
  minRarity?: Rarity;
```

Replace:

```ts
    if (rarity === 'legendary') {
      w *= 1 + Math.max(0, ctx.pity) * loot.pityPerDrop;
      w *= ctx.legendaryBoost ?? 1;
    }
```

with:

```ts
    if (rarity === 'legendary') w *= ctx.legendaryBoost ?? 1;
```

In `packages/engine/src/loot/drops.ts`:

Replace:

```ts
  magicFind: number;
  pity: number;
```

with:

```ts
  magicFind: number;
```

Replace:

```ts
  pity: number;
  nextUid: number;
}

/** Round a fractional count up with probability equal to its fraction. */
function stochasticRound(value: number, rng: SeededRNG): number {
```

with:

```ts
  nextUid: number;
}

/**
 * ponytail: Phase A's stand-in for today's gear counts (`loot.normalDropChance`, `extraDropChance`,
 * `eliteDrops` and `bossDrops`, gone from the data); B1 replaces them with `delve.drops`' tables.
 */
const GEAR_TODAY = { normal: 0.22, extra: 0.05, elite: [2, 3], boss: [3, 4] } as const;

/** Round a fractional count up with probability equal to its fraction. */
export function stochasticRound(value: number, rng: SeededRNG): number {
```

Replace the lines from `function dropCount(registry: DataRegistry, ctx: DropContext, rng: SeededRNG): number {` up to (not including) `/** Luck from magic find, depth, and monster kind. */` with:

```ts
function dropCount(ctx: DropContext, rng: SeededRNG): number {
  const loot = GEAR_TODAY;
  switch (ctx.kind) {
    case 'normal': {
      let n = rng.next() < Math.min(1, loot.normal * ctx.dropMult) ? 1 : 0;
      if (rng.next() < Math.min(1, loot.extra * ctx.dropMult)) n++;
      return n;
    }
    case 'elite':
      return stochasticRound(rng.nextInt(loot.elite[0], loot.elite[1]) * ctx.dropMult, rng);
    case 'boss':
      return Math.max(1, stochasticRound(rng.nextInt(loot.boss[0], loot.boss[1]) * ctx.dropMult, rng));
  }
}

```

Replace:

```ts
  const count = dropCount(registry, ctx, rng);
  const luck = dropLuck(registry, ctx);
  const ilvl = ctx.kind === 'boss' ? ctx.depth + 1 : ctx.depth;

  let pity = ctx.pity;
```

with:

```ts
  const count = dropCount(ctx, rng);
  const luck = dropLuck(registry, ctx);
  const ilvl = ctx.kind === 'boss' ? ctx.depth + 1 : ctx.depth;

```

Replace:

```ts
      rarity = rollRarity(registry, { luck, pity, minRarity, legendaryBoost: ctx.legendaryBoost }, rng);
    }
    pity = rarity === 'legendary' ? 0 : pity + 1;
    items.push(generateItem(registry, { uid: `g${nextUid++}`, ilvl, rarity, biomeMana: ctx.biomeMana, pair: ctx.pair }, rng));
  }
  return { items, pity, nextUid };
```

with:

```ts
      rarity = rollRarity(registry, { luck, minRarity, legendaryBoost: ctx.legendaryBoost }, rng);
    }
    items.push(generateItem(registry, { uid: `g${nextUid++}`, ilvl, rarity, biomeMana: ctx.biomeMana, pair: ctx.pair }, rng));
  }
  return { items, nextUid };
```

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts

const KILL_SCRAP_MULT = { normal: 1, elite: 3, boss: 10 } as const;

```

with:

```ts

```

Replace:

```ts
          KILL_SCRAP_MULT[m.kind] *
```

with:

```ts
          bal.drops.scrapByKind[m.kind] *
```

Replace:

```ts
      pity: loot.pity,
      dropMult: loot.dropMult,
```

with:

```ts
      dropMult: loot.dropMult,
```

Replace:

```ts
  loot.pity = drops.pity;
  loot.nextUid = drops.nextUid;
```

with:

```ts
  loot.nextUid = drops.nextUid;
```

In `packages/engine/src/types/arpg.ts`:

Replace:

```ts
  pity: number;
  nextUid: number;
```

with:

```ts
  nextUid: number;
```

In `packages/engine/src/arpg/sandbox.ts`:

Replace:

```ts
      pity: 0,
      nextUid: 1,
```

with:

```ts
      nextUid: 1,
```

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
      pity: profile.pity,
      nextUid: profile.nextUid,
```

with:

```ts
      nextUid: profile.nextUid,
```

Replace:

```ts
    { ...profile, pity: world.loot.pity, nextUid: world.loot.nextUid },
```

with:

```ts
    { ...profile, nextUid: world.loot.nextUid },
```

The loot contexts the other tests build lose `pity`:

In `packages/engine/tests/fixtures/arena.ts`:

Replace:

```ts
      pity: 0,
      nextUid: 100,
```

with:

```ts
      nextUid: 100,
```

In `packages/engine/tests/arpg-sim.test.ts`:

Replace:

```ts
    loot: {
      pity: 0,
```

with:

```ts
    loot: {
```

Replace:

```ts
      pity: 0,
      magicFind: 0,
```

with:

```ts
      magicFind: 0,
```

In `packages/engine/tests/delve-movesets.test.ts`:

Replace:

```ts
      pity: 0,
      dropMult: 1,
```

with:

```ts
      dropMult: 1,
```

Replace:

```ts
      ctx = { ...ctx, pity: r.pity, nextUid: r.nextUid };
```

with:

```ts
      ctx = { ...ctx, nextUid: r.nextUid };
```

In `packages/engine/tests/delve-pair.test.ts`:

Replace:

```ts
      pity: 0,
      dropMult: 1,
```

with:

```ts
      dropMult: 1,
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-crafting-data.test.ts tests/delve-loot.test.ts)`
Expected: PASS, 34 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 11 tests in F + 1 files pass, the pacing rails among them (the items hash in `delve-movesets.test.ts` still reads `49e20fb6`: pity at 0 changed no roll there).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-a
(cd packages/engine && npx prettier --write --end-of-line auto src/types/crafting.ts src/types/delve.ts src/data/schemas.ts src/arpg/combat.ts src/types/arpg.ts src/arpg/sandbox.ts tests/delve-crafting-data.test.ts tests/delve-loot.test.ts tests/fixtures/arena.ts tests/arpg-sim.test.ts tests/delve-movesets.test.ts tests/delve-pair.test.ts)
git add packages/engine/src/types/crafting.ts packages/engine/src/types/delve.ts packages/engine/src/data/schemas.ts packages/engine/src/data/balance.json packages/engine/src/loot/item-generator.ts packages/engine/src/loot/drops.ts packages/engine/src/arpg/combat.ts packages/engine/src/types/arpg.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/delve/dive.ts packages/engine/tests/delve-crafting-data.test.ts packages/engine/tests/delve-loot.test.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/arpg-sim.test.ts packages/engine/tests/delve-movesets.test.ts packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): balance delve.crafting and delve.drops; pity and the old gear counts leave the data" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: Alloy Fusion goes

### Task 3: Remove Alloy Fusion from the engine

`checkFusion`, `fuseCost`, `fuseItems`, `fuseGear`, `forge.fuseCost`, the autopilot's fuse loop and their tests (refining flux replaces "three items into a better one"). The client's Fuse bench goes in Task 10; it keeps working on the base bundle until then.

**Files:**
- Modify: `packages/engine/src/loot/smithing.ts`, `src/delve/profile.ts`, `src/delve/autopilot.ts`, `src/index.ts`, `src/types/delve.ts`, `src/data/schemas.ts`, `src/data/balance.json`
- Modify (tests): `packages/engine/tests/delve-crafting-data.test.ts`, `delve-dive.test.ts`, `delve-hero-smithing.test.ts`, `delve-movesets.test.ts`, `delve-runes.test.ts`

- [ ] **Step 1: The failing test**

In `packages/engine/tests/delve-crafting-data.test.ts`:

Replace:

```ts
import { arena } from './fixtures/arena.js';
```

with:

```ts
import { arena } from './fixtures/arena.js';
import * as engine from '../src/index.js';
```

Append at the end of the file:

```ts
describe('Alloy Fusion is gone (refining flux replaces it)', () => {
  it('has no fuse op, check or price, and no `forge.fuseCost`', () => {
    for (const name of ['fuseGear', 'fuseItems', 'checkFusion', 'fuseCost'])
      expect(name in engine, name).toBe(false);
    expect('fuseCost' in balanceData.delve.forge).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-crafting-data.test.ts)`
Expected: FAIL, 1 failed | 11 passed: `has no fuse op, check or price, and no forge.fuseCost` → `fuseGear: expected true to be false`.

- [ ] **Step 3: Delete Fusion**

In `packages/engine/src/loot/smithing.ts`:

Replace:

```ts
import { nextRarity } from '../types/gem.js';
import { eligibleAffixes, generateItem, rollAffix, scrapLevelFactor, weightedPick } from './item-generator.js';
```

with:

```ts
import { eligibleAffixes, rollAffix, scrapLevelFactor, weightedPick } from './item-generator.js';
```

Replace the lines from `return { ...item, affixes, reforges: item.reforges + 1 };` to the end of the file with:

```ts
  return { ...item, affixes, reforges: item.reforges + 1 };
}
```

In `packages/engine/src/delve/profile.ts`:

Replace:

```ts
  checkFusion,
  fuseCost,
  fuseItems,
  reforgeAffix,
```

with:

```ts
  reforgeAffix,
```

Replace:

```ts
  /** Links the op gave back (a fuse's weapons' extra slots, a transfer's). */
```

with:

```ts
  /** Links the op gave back (a transfer's). */
```

Replace:

```ts
}

/**
 * Fuse three bag items of one rarity into one of the next (`fuseItems`), for
 * scrap. The inputs' weapon parts come back as salvaging them would give
 * (`weaponParts`: `links`, and the runes by the parts rule, `opts.unsocket`);
 * a fused weapon rolls its own moveset. Refuses mid-dive.
 */
export function fuseGear(
  registry: DataRegistry,
  profile: DelveProfile,
  uids: string[],
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): ProfileActionResult {
  if (isDiveActive(profile)) return { ok: false, profile, reason: FORGE_LOCKED };
  const items = uids.map((uid) => profile.bag.find((i) => i.uid === uid));
  if (items.some((i) => !i)) return { ok: false, profile, reason: 'Fuse items from your bag' };
  const inputs = items as GearItem[];
  const check = checkFusion(inputs);
  if (!check.ok) return { ok: false, profile, reason: check.reason };
  const cost = fuseCost(registry, inputs);
  if (profile.scrap < cost) return { ok: false, profile, reason: 'Not enough scrap' };

  const result = fuseItems(registry, inputs, `g${profile.nextUid}`, forgeRng(profile));
  const parts = inputs.map((i) => weaponParts(registry, i));
  const links = parts.reduce((sum, p) => sum + p.links, 0);
  const settled = settleParts(
    registry,
    profile.runes,
    parts.flatMap((p) => p.runes),
    opts.unsocket,
  );
  const consumed = new Set(uids);
  const recorded = recordFinds(
    {
      ...profile,
      bag: [...profile.bag.filter((i) => !consumed.has(i.uid)), result],
      scrap: profile.scrap - cost,
      links: profile.links + links,
      runes: settled.pouch,
      nextUid: profile.nextUid + 1,
      forgeCount: profile.forgeCount + 1,
    },
    [result],
  );
  return {
    ok: true,
    item: result,
    profile: recorded.profile,
    links,
    runes: settled.runes,
    destroyed: settled.destroyed,
  };
}
```

with:

```ts
}
```

In `packages/engine/src/delve/autopilot.ts`:

Replace:

```ts
import type { GearItem, Rarity } from '../types/gear.js';
```

with:

```ts
import type { GearItem } from '../types/gear.js';
```

Replace:

```ts
  fuseGear,
  profilePower,
```

with:

```ts
  profilePower,
```

Replace:

```ts
const FUSE_RARITIES: Rarity[] = ['magic', 'rare', 'epic'];
const STEP = 1 / 30;
```

with:

```ts
const STEP = 1 / 30;
```

Replace:

```ts
 * Between dives: move the moveset to a better weapon, equip upgrades, fuse
 * spare triples, melt junk, spend Links on slots up to `SOCKETS_AFTER` a chain,
```

with:

```ts
 * Between dives: move the moveset to a better weapon, equip upgrades, melt
 * junk, spend Links on slots up to `SOCKETS_AFTER` a chain,
```

Replace the lines from `let p = equipBest(registry, transferBest(registry, profile)).profile;` up to (not including) `p = salvageItems(registry, p, salvageCandidates(registry, p, 'epic')).profile;` with:

```ts
  let p = equipBest(registry, transferBest(registry, profile)).profile;
```

In `packages/engine/src/index.ts`:

Replace:

```ts
export { salvageValue, upgradeCost, reforgeCost, fuseCost, checkFusion } from './loot/smithing.js';
```

with:

```ts
export { salvageValue, upgradeCost, reforgeCost } from './loot/smithing.js';
```

Replace:

```ts
  fuseGear,
  chainFromBuild,
```

with:

```ts
  chainFromBuild,
```

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
    fuseCost: Record<Rarity, number>;
  };
```

with:

```ts
  };
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
    fuseCost: perRarity(z.number().min(0)),
  }),
```

with:

```ts
  }),
```

In `packages/engine/src/data/balance.json`:

Replace:

```json
      "reforgeBaseCost": 25, "reforgeGrowth": 1.6,
      "fuseCost": { "common": 5, "uncommon": 15, "magic": 40, "rare": 100, "epic": 300, "legendary": 0 }
```

with:

```json
      "reforgeBaseCost": 25, "reforgeGrowth": 1.6
```

Fusion's tests go with it:

In `packages/engine/tests/delve-dive.test.ts`:

Replace:

```ts
  fuseGear,
  setAutoSalvage,
```

with:

```ts
  setAutoSalvage,
```

Replace:

```ts

  it('fusion consumes three items and yields one of the next rarity, keeping a mana type', () => {
    const p = { ...withBag(9, 'magic'), scrap: 10_000 };
    const r = fuseGear(registry, p, ['b0', 'b1', 'b2']);
    expect(r.ok).toBe(true);
    expect(r.profile.bag).toHaveLength(1);
    expect(r.profile.bag[0].rarity).toBe('rare');
    expect(r.profile.bag[0].mana).toBe('fire');
  });
});
```

with:

```ts
});
```

In `packages/engine/tests/delve-hero-smithing.test.ts`:

Replace:

```ts
  fuseCost,
  checkFusion,
  fuseItems,
} from '../src/loot/smithing.js';
```

with:

```ts
} from '../src/loot/smithing.js';
```

Replace:

```ts

  it('fusion needs three unlocked items of one non-legendary rarity', () => {
    const a = generateItem(registry, { uid: 'a', ilvl: 5, rarity: 'magic' }, new SeededRNG(1));
    const b = generateItem(registry, { uid: 'b', ilvl: 8, rarity: 'magic' }, new SeededRNG(2));
    const c = generateItem(registry, { uid: 'c', ilvl: 6, rarity: 'magic' }, new SeededRNG(3));
    expect(checkFusion([a, b]).ok).toBe(false);
    expect(checkFusion([a, b, { ...c, rarity: 'rare' }]).ok).toBe(false);
    expect(checkFusion([a, b, { ...c, locked: true }]).ok).toBe(false);
    const leg = { ...a, rarity: 'legendary' as const };
    expect(checkFusion([leg, { ...leg, uid: 'x' }, { ...leg, uid: 'y' }]).ok).toBe(false);
    expect(checkFusion([a, b, c]).ok).toBe(true);
  });

  it('fusion produces the next rarity at the highest item level, keeping the best upgrade', () => {
    const a = generateItem(registry, { uid: 'a', ilvl: 5, rarity: 'epic' }, new SeededRNG(1));
    const b = {
      ...generateItem(registry, { uid: 'b', ilvl: 9, rarity: 'epic' }, new SeededRNG(2)),
      upgrade: 3,
    };
    const c = generateItem(registry, { uid: 'c', ilvl: 7, rarity: 'epic' }, new SeededRNG(3));
    const out = fuseItems(registry, [a, b, c], 'new', new SeededRNG(4));
    expect(out.rarity).toBe('legendary');
    expect(out.ilvl).toBe(9);
    expect(out.upgrade).toBe(3);
    expect([a.slot, b.slot, c.slot]).toContain(out.slot);
    expect(out.legendary).toBeDefined();
    expect(fuseCost(registry, [a, b, c])).toBeGreaterThan(0);
  });
});
```

with:

```ts
});
```

In `packages/engine/tests/delve-movesets.test.ts`:

Replace:

```ts
  fuseGear,
  parseDelveProfile,
```

with:

```ts
  parseDelveProfile,
```

Replace:

```ts
describe('Links: salvage, fusing and banking', () => {
```

with:

```ts
describe('Links: salvage and banking', () => {
```

Replace the lines from `expect(bankWorld(registry, full, w2)).toMatchObject({ bagFull: true, links: 3 });` up to (not including) `describe('transfer', () => {` with:

```ts
    expect(bankWorld(registry, full, w2)).toMatchObject({ bagFull: true, links: 3 });
  });
});

```

Replace:

```ts
    const triple = { ...diving, bag: [0, 1, 2].map((i) => ({ ...helm, uid: `f${i}` })) };
    expect(fuseGear(registry, triple, ['f0', 'f1', 'f2'])).toMatchObject({
      ok: false,
      reason: forge,
    });
    expect(salvageItems(registry, diving, ['h'])).toMatchObject({ profile: diving, count: 0 });
```

with:

```ts
    expect(salvageItems(registry, diving, ['h'])).toMatchObject({ profile: diving, count: 0 });
```

In `packages/engine/tests/delve-runes.test.ts`:

Replace:

```ts
  fuseGear,
  parseDelveProfile,
```

with:

```ts
  parseDelveProfile,
```

Replace the lines from `expect(salvageCandidates(registry, wield(plain), 'epic')).toEqual(['w']);` up to (not including) `it('the choice of mana rebuilds the weapon: its sockets back as Links, its runes by the rule', () => {` with:

```ts
    expect(salvageCandidates(registry, wield(plain), 'epic')).toEqual(['w']);
  });

```

Replace:

```ts
      expect(fuseGear(registry, bag, ['a', 'b', 'c']).reason).toBe(forge);
    }
```

with:

```ts
    }
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-crafting-data.test.ts)`
Expected: PASS, 12 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 7 tests in F + 1 files pass (five fusion tests gone, one added). The pacing rails pass without the autopilot's fusing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-a
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/profile.ts src/index.ts src/types/delve.ts src/data/schemas.ts tests/delve-crafting-data.test.ts tests/delve-dive.test.ts tests/delve-hero-smithing.test.ts tests/delve-movesets.test.ts tests/delve-runes.test.ts)
git add packages/engine/src/loot/smithing.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/autopilot.ts packages/engine/src/index.ts packages/engine/src/types/delve.ts packages/engine/src/data/schemas.ts packages/engine/src/data/balance.json packages/engine/tests/delve-crafting-data.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-hero-smithing.test.ts packages/engine/tests/delve-movesets.test.ts packages/engine/tests/delve-runes.test.ts
git commit -m "refactor(engine): remove Alloy Fusion (refining flux replaces it)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: Doors and the pouch

### Task 4: The doors' drop multipliers and Find

`DoorMods` loses `magicFind` and `dropMult` and gains `materials`, `runes`, `gear`, `flux`, `essence`, `shardTier` and `find`, everywhere they're read: the types, both schemas (the data's and the save's stored door), `delve.json`'s doors and their texts, the drop and rune-drop code, the sandbox's loot context. Lucky Charm reads "Find. Essence odds doubled."; `magicFind`'s label is "Find". The client's door icon follows in Task 11.

**Files:**
- Modify: `packages/engine/src/types/delve.ts`, `src/data/schemas.ts`, `src/delve/profile-schema.ts`, `src/data/delve.json`, `src/types/arpg.ts`, `src/loot/drops.ts`, `src/arpg/combat.ts`, `src/arpg/rune-drops.ts`, `src/arpg/sandbox.ts`, `src/delve/dive.ts`
- Modify (tests): `packages/engine/tests/delve-crafting-data.test.ts`, `delve-runes.test.ts`, `arpg-sim.test.ts`, `fixtures/arena.ts`, `delve-loot.test.ts`, `delve-movesets.test.ts`, `delve-pair.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-crafting-data.test.ts`:

Replace:

```ts
import { killMonster, makeCtx } from '../src/arpg/combat.js';
```

with:

```ts
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { beginFloor, chooseDoor, completeFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { profileStats } from '../src/delve/pair.js';
```

Append at the end of the file:

```ts
describe('doors: the drop multipliers and Find', () => {
  const mods = (id: string) => registry.getDoor(id).mods;

  it('trade magic find and the one drop multiplier for Find and one multiplier a drop', () => {
    for (const door of registry.getDelveData().doors) {
      expect('magicFind' in door.mods, door.id).toBe(false);
      expect('dropMult' in door.mods, door.id).toBe(false);
    }
    expect(mods('gilded')).toMatchObject({ find: 75, flux: 1.5, essence: 1.5 });
    // The Quiet Shrine: half the loot.
    expect(mods('shrine')).toMatchObject({ materials: 0.5, runes: 0.5 });
    expect(mods('swarm')).toMatchObject({ packs: 1.5, materials: 1.3 });
    expect(mods('cursed').shardTier).toBeGreaterThan(0);
  });

  it('call magic find "Find", and Lucky Charm doubles the essence odds', () => {
    expect(registry.getGearAffix('magicFind')!.label).toBe('Find');
    expect(registry.getLegendary('lucky_charm').text).toBe('+{v}% Find. Essence odds doubled.');
  });

  it("adds the door's Find to the hero's, and keeps the door the dive stored", () => {
    let p = startDive(registry, createDelveProfile(registry, 5, { primary: 'fire' }), 1);
    const world = beginFloor(registry, p);
    for (const m of world.monsters) killMonster(makeCtx(registry, world, []), m);
    p = completeFloor(registry, p, world).profile;
    p = { ...p, dive: { ...p.dive!, doorChoices: ['gilded'] } };
    p = chooseDoor(registry, p, 'gilded');
    const find = profileStats(registry, p).magicFind;
    expect(beginFloor(registry, p).loot.find).toBe(find + 75);
    const json = JSON.parse(JSON.stringify(p));
    expect(parseDelveProfile(registry, json)!.profile.dive!.door).toEqual(
      registry.getDoor('gilded'),
    );
  });
});
```

In `packages/engine/tests/delve-runes.test.ts`:

Replace:

```ts
  it("drops at its kind's chance × the door's multiplier (at most 1); a boss always drops one", () => {
    const rate = (kind: MonsterKind, dropMult: number) => {
      const rng = new SeededRNG(11);
      let got = 0;
      for (let i = 0; i < 20000; i++)
        if (rollRuneDrop(registry, { depth: 5, kind, dropMult }, rng)) got++;
```

with:

```ts
  it("drops at its kind's chance × the door's `runes` (at most 1); a boss always drops one", () => {
    const rate = (kind: MonsterKind, runes: number) => {
      const rng = new SeededRNG(11);
      let got = 0;
      for (let i = 0; i < 20000; i++)
        if (rollRuneDrop(registry, { depth: 5, kind, runes }, rng)) got++;
```

Replace:

```ts
      const r = rollRuneDrop(registry, { depth: 13, kind: 'boss', dropMult: 1 }, rng)!;
```

with:

```ts
      const r = rollRuneDrop(registry, { depth: 13, kind: 'boss', runes: 1 }, rng)!;
```

In `packages/engine/tests/arpg-sim.test.ts`:

Replace:

```ts
      nextUid: 100,
      magicFind: 0,
      legendaryBoost: 1,
      dropMult: 1,
```

with:

```ts
      nextUid: 100,
      find: 0,
      legendaryBoost: 1,
```

Replace:

```ts
      magicFind: 0,
      legendaryBoost: 1,
      dropMult: 1,
```

with:

```ts
      find: 0,
      legendaryBoost: 1,
```

Replace:

```ts
    const w = arena([{ x: 13, y: 33, hp: 1, maxHp: 1 }]);
    w.loot.dropMult = 20;
```

with:

```ts
    const w = arena([{ x: 13, y: 33, hp: 1, maxHp: 1 }]);
    w.door = { ...registry.getDoor('swarm'), mods: { materials: 20 } };
```

Replace:

```ts
    w.loot.dropMult = 20;
```

with:

```ts
    w.door = { ...registry.getDoor('swarm'), mods: { materials: 20 } };
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-crafting-data.test.ts tests/delve-runes.test.ts tests/arpg-sim.test.ts)`
Expected: FAIL, 5 failed | 72 passed: the three door tests (`gilded: expected true to be false`, `expected 'Magic Find' to be 'Find'`, `expected undefined to be 75`), the rune rate (`expected 1 to be close to 0.03`: the old code reads no `runes`) and `clearing the floor vacuums up the loot` (`expected 0 to be greater than 0`: the old code reads no door).

- [ ] **Step 3: The new door, everywhere it's read**

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
  magicFind?: number;
  monsterHp?: number;
```

with:

```ts
  monsterHp?: number;
```

Replace:

```ts
  dropMult?: number;
  healFull?: boolean;
```

with:

```ts
  healFull?: boolean;
```

Replace:

```ts
  packs?: number;
```

with:

```ts
  packs?: number;
  /** Multiplies every material entry's drop chance, at most 1 (default 1; see the crafting spec). */
  materials?: number;
  /** Multiplies a normal or elite foe's rune chance. */
  runes?: number;
  /** Multiplies an elite's gear chance. */
  gear?: number;
  /** Multiplies the flux chance. */
  flux?: number;
  /** Multiplies the essence chance. */
  essence?: number;
  /** Chance a shard or flux drop comes a tier or grade up (default 0). */
  shardTier?: number;
  /** Added to Find, in percentage points. */
  find?: number;
```

Replace:

```ts
    /** A foe's chance to drop a rune, by its kind (normal and elite × the door's `dropMult`, at most 1). */
```

with:

```ts
    /** A foe's chance to drop a rune, by its kind (normal and elite × the door's `runes`, at most 1). */
```

Replace:

```ts
  thorns: number;
  /** Percentage points */
```

with:

```ts
  thorns: number;
  /** Find (the `magicFind` stat), in percentage points: shard and flux drops come a tier or grade up. */
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
          magicFind: z.number().optional(),
          monsterHp: z.number().optional(),
```

with:

```ts
          monsterHp: z.number().optional(),
```

Replace:

```ts
          dropMult: z.number().positive().optional(),
          healFull: z.boolean().optional(),
```

with:

```ts
          healFull: z.boolean().optional(),
```

Replace:

```ts
          packs: z.number().positive().optional(),
```

with:

```ts
          packs: z.number().positive().optional(),
          materials: z.number().positive().optional(),
          runes: z.number().positive().optional(),
          gear: z.number().positive().optional(),
          flux: z.number().positive().optional(),
          essence: z.number().positive().optional(),
          shardTier: z.number().min(0).max(1).optional(),
          find: z.number().optional(),
```

In `packages/engine/src/delve/profile-schema.ts`:

Replace:

```ts
    magicFind: z.number().optional(),
    monsterHp: z.number().optional(),
```

with:

```ts
    monsterHp: z.number().optional(),
```

Replace:

```ts
    dropMult: z.number().optional(),
    healFull: z.boolean().optional(),
```

with:

```ts
    healFull: z.boolean().optional(),
```

Replace:

```ts
    packs: z.number().optional(),
```

with:

```ts
    packs: z.number().optional(),
    materials: z.number().optional(),
    runes: z.number().optional(),
    gear: z.number().optional(),
    flux: z.number().optional(),
    essence: z.number().optional(),
    shardTier: z.number().optional(),
    find: z.number().optional(),
```

In `packages/engine/src/data/delve.json`:

Replace:

```json
      "label": "Magic Find",
```

with:

```json
      "label": "Find",
```

Replace:

```json
      "text": "+{v}% Magic Find. Legendary odds doubled.",
```

with:

```json
      "text": "+{v}% Find. Essence odds doubled.",
```

Replace:

```json
      "text": "+75% Magic Find. Monsters have +25% life.",
      "icon": "💰",
      "weight": 3,
      "mods": {
        "magicFind": 75,
```

with:

```json
      "text": "+75% Find, more flux and essences. Monsters have +25% life.",
      "icon": "💰",
      "weight": 3,
      "mods": {
        "find": 75,
        "flux": 1.5,
        "essence": 1.5,
```

Replace:

```json
        "dropMult": 0.5
```

with:

```json
        "materials": 0.5,
        "runes": 0.5
```

Replace:

```json
      "text": "50% more monsters, but weaker. 30% more loot.",
```

with:

```json
      "text": "50% more monsters, but weaker. 30% more materials.",
```

Replace:

```json
        "dropMult": 1.3
```

with:

```json
        "materials": 1.3
```

Replace:

```json
      "text": "Monsters hit 40% harder. +150% Magic Find.",
```

with:

```json
      "text": "Monsters hit 40% harder. Shards and flux often come a tier higher.",
```

Replace:

```json
        "magicFind": 150
```

with:

```json
        "shardTier": 0.35
```

In `packages/engine/src/types/arpg.ts`:

Replace:

```ts
  magicFind: number;
  legendaryBoost: number;
  dropMult: number;
```

with:

```ts
  /** Total Find in percentage points (gear + the door's `find`). The door's drop multipliers are `world.door`'s. */
  find: number;
  legendaryBoost: number;
```

In `packages/engine/src/loot/drops.ts`:

Replace:

```ts
  /** Total magic find in percentage points (gear + door). */
  magicFind: number;
  /** Door drop multiplier (1 = normal). */
  dropMult: number;
```

with:

```ts
  /** Total Find in percentage points (gear + door). */
  find: number;
  /** ponytail: the door's `materials` (1 = normal) stands in for its old `dropMult` on the gear counts until B1. */
  materials: number;
```

Replace the lines from `let n = rng.next() < Math.min(1, loot.normal * ctx.dropMult) ? 1 : 0;` up to (not including) `export function rollEncounterDrops(registry: DataRegistry, ctx: DropContext, rng: SeededRNG): DropResult {` with:

```ts
      let n = rng.next() < Math.min(1, loot.normal * ctx.materials) ? 1 : 0;
      if (rng.next() < Math.min(1, loot.extra * ctx.materials)) n++;
      return n;
    }
    case 'elite':
      return stochasticRound(rng.nextInt(loot.elite[0], loot.elite[1]) * ctx.materials, rng);
    case 'boss':
      return Math.max(1, stochasticRound(rng.nextInt(loot.boss[0], loot.boss[1]) * ctx.materials, rng));
  }
}

/** Luck from Find, depth, and monster kind. */
export function dropLuck(registry: DataRegistry, ctx: Pick<DropContext, 'depth' | 'kind' | 'find'>): number {
  const loot = registry.getDelveBalance().loot;
  const kindLuck = ctx.kind === 'boss' ? loot.bossLuck : ctx.kind === 'elite' ? loot.eliteLuck : 0;
  const depthLuck = Math.min(loot.maxDepthLuck, (ctx.depth - 1) * loot.luckPerDepth);
  return ctx.find / 100 + depthLuck + kindLuck;
}

```

Replace:

```ts
 * door's `dropMult`, at most 1 (magic find plays no part). The rune is uniform
```

with:

```ts
 * door's `runes`, at most 1 (Find plays no part). The rune is uniform
```

Replace:

```ts
  ctx: { depth: number; kind: MonsterKind; dropMult: number },
```

with:

```ts
  ctx: { depth: number; kind: MonsterKind; runes: number },
```

Replace:

```ts
    ctx.kind === 'boss' ? dropChance.boss : Math.min(1, dropChance[ctx.kind] * ctx.dropMult);
```

with:

```ts
    ctx.kind === 'boss' ? dropChance.boss : Math.min(1, dropChance[ctx.kind] * ctx.runes);
```

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
      magicFind: loot.magicFind,
      dropMult: loot.dropMult,
```

with:

```ts
      find: loot.find,
      materials: world.door?.mods.materials ?? 1,
```

In `packages/engine/src/arpg/rune-drops.ts`:

Replace:

```ts
  const ctxDrop = { depth: world.depth, kind: m.kind, dropMult: world.loot.dropMult };
```

with:

```ts
  const ctxDrop = { depth: world.depth, kind: m.kind, runes: world.door?.mods.runes ?? 1 };
```

In `packages/engine/src/arpg/sandbox.ts`:

Replace:

```ts
      magicFind: 0,
      legendaryBoost: 1,
      dropMult: 1,
```

with:

```ts
      find: 0,
      legendaryBoost: 1,
```

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
      magicFind: stats.magicFind + (mods.magicFind ?? 0),
      legendaryBoost: stats.legendaries.lucky_charm ? 2 : 1,
      dropMult: mods.dropMult ?? 1,
```

with:

```ts
      find: stats.magicFind + (mods.find ?? 0),
      legendaryBoost: stats.legendaries.lucky_charm ? 2 : 1,
```

The other tests' loot and drop contexts follow:

In `packages/engine/tests/fixtures/arena.ts`:

Replace:

```ts
      magicFind: 0,
      legendaryBoost: 1,
      dropMult: 1,
```

with:

```ts
      find: 0,
      legendaryBoost: 1,
```

In `packages/engine/tests/delve-loot.test.ts`:

Replace:

```ts
    magicFind: 0,
    dropMult: 1,
```

with:

```ts
    find: 0,
    materials: 1,
```

In `packages/engine/tests/delve-movesets.test.ts`:

Replace:

```ts
      magicFind: 40,
      dropMult: 1,
```

with:

```ts
      find: 40,
      materials: 1,
```

In `packages/engine/tests/delve-pair.test.ts`:

Replace:

```ts
      magicFind: 0,
      dropMult: 1,
```

with:

```ts
      find: 0,
      materials: 1,
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-crafting-data.test.ts tests/delve-runes.test.ts tests/arpg-sim.test.ts)`
Expected: PASS, 77 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 10 tests in F + 1 files pass, the pacing rails among them.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-a
(cd packages/engine && npx prettier --write --end-of-line auto src/types/delve.ts src/data/schemas.ts src/delve/profile-schema.ts src/types/arpg.ts src/arpg/combat.ts src/arpg/rune-drops.ts src/arpg/sandbox.ts tests/delve-crafting-data.test.ts tests/delve-runes.test.ts tests/arpg-sim.test.ts tests/fixtures/arena.ts tests/delve-loot.test.ts tests/delve-movesets.test.ts tests/delve-pair.test.ts)
git add packages/engine/src/types/delve.ts packages/engine/src/data/schemas.ts packages/engine/src/delve/profile-schema.ts packages/engine/src/data/delve.json packages/engine/src/types/arpg.ts packages/engine/src/loot/drops.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/rune-drops.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/delve/dive.ts packages/engine/tests/delve-crafting-data.test.ts packages/engine/tests/delve-runes.test.ts packages/engine/tests/arpg-sim.test.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-loot.test.ts packages/engine/tests/delve-movesets.test.ts packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): the doors' drop multipliers and Find; Lucky Charm doubles essence odds" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: The pouch and haul ops

`emptyMaterials`, `emptyHaul`, `addMaterials`, `addHaul` and `addMaterial`, implemented here because B1 (banking) and B2 (salvage, the forge) both need them.

**Files:**
- Create: `packages/engine/tests/delve-materials.test.ts`
- Modify: `packages/engine/src/loot/materials.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-materials.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  addHaul,
  addMaterial,
  addMaterials,
  emptyHaul,
  emptyMaterials,
} from '../src/loot/materials.js';

// See the crafting spec: the materials pouch and a dive's haul.

describe('the pouch and the haul', () => {
  it('starts empty: every metal and grade at 0, no shards, essences, currencies or runes', () => {
    expect(emptyMaterials()).toEqual({
      metals: {
        rusty: 0,
        iron: 0,
        steel: 0,
        mithril: 0,
        adamant: 0,
        starforged: 0,
        voidforged: 0,
      },
      flux: { uncommon: 0, magic: 0, rare: 0, epic: 0 },
      shards: {},
      essences: {},
    });
    expect(emptyHaul()).toEqual({ ...emptyMaterials(), scrap: 0, dust: 0, links: 0, runes: {} });
    // Fresh each time: no shared records.
    const a = emptyHaul();
    a.metals.iron = 3;
    expect(emptyHaul().metals.iron).toBe(0);
  });

  it('adds one material at a time: a shard at its tier, the others by id', () => {
    let h = emptyHaul();
    h = addMaterial(h, { kind: 'metal', metal: 'iron' }, 2);
    h = addMaterial(h, { kind: 'flux', grade: 'rare' });
    h = addMaterial(h, { kind: 'shard', stat: 'critChance', tier: 3 });
    h = addMaterial(h, { kind: 'shard', stat: 'critChance', tier: 1 }, 2);
    h = addMaterial(h, { kind: 'essence', essence: 'prism' });
    h = addMaterial(h, { kind: 'dust' }, 4);
    h = addMaterial(h, { kind: 'links' });
    expect(h.metals.iron).toBe(2);
    expect(h.flux.rare).toBe(1);
    expect(h.shards).toEqual({ critChance: [2, 0, 1] });
    expect(h.essences).toEqual({ prism: 1 });
    expect([h.dust, h.links, h.scrap]).toEqual([4, 1, 0]);
  });

  it('sums two hauls entry by entry, the runes and the shard tiers too, and leaves both as they were', () => {
    const a = {
      ...addMaterial(emptyHaul(), { kind: 'shard', stat: 'armor', tier: 2 }),
      scrap: 10,
      runes: { split: [1, 0, 0, 0, 0] },
    };
    const b = {
      ...addMaterial(emptyHaul(), { kind: 'shard', stat: 'armor', tier: 4 }),
      scrap: 5,
      dust: 2,
      runes: { split: [0, 2, 0, 0, 0], quick: [1, 0, 0, 0, 0] },
    };
    const sum = addHaul(a, b);
    expect(sum.shards).toEqual({ armor: [0, 1, 0, 1] });
    expect(sum.runes).toEqual({ split: [1, 2, 0, 0, 0], quick: [1, 0, 0, 0, 0] });
    expect([sum.scrap, sum.dust]).toEqual([15, 2]);
    expect(a.shards).toEqual({ armor: [0, 1] });
    expect(a.scrap).toBe(10);
  });

  it("adds a haul's materials to a pouch, keeping the pouch's own shape", () => {
    const pouch = addMaterials(
      emptyMaterials(),
      addMaterial(emptyHaul(), { kind: 'metal', metal: 'steel' }),
    );
    expect(pouch.metals.steel).toBe(1);
    expect('scrap' in pouch).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-materials.test.ts)`
Expected: FAIL, 4 failed: `TypeError: (0 , emptyMaterials) is not a function` (and `emptyHaul`).

- [ ] **Step 3: The ops**

In `packages/engine/src/loot/materials.ts`:

Replace:

```ts
import type { MetalDef, ShardTierDef } from '../types/crafting.js';
```

with:

```ts
import {
  FLUX_GRADES,
  METAL_IDS,
  type FluxGrade,
  type Haul,
  type MaterialRef,
  type MaterialsPouch,
  type MetalDef,
  type MetalId,
  type ShardTierDef,
} from '../types/crafting.js';
```

Append at the end of the file:

```ts
// ── The pouch and the haul (shared by drops, banking, salvage and the forge) ──

/** An empty pouch: every metal and grade at 0, no shards or essences. */
export function emptyMaterials(): MaterialsPouch {
  return {
    metals: Object.fromEntries(METAL_IDS.map((m) => [m, 0])) as Record<MetalId, number>,
    flux: Object.fromEntries(FLUX_GRADES.map((g) => [g, 0])) as Record<FluxGrade, number>,
    shards: {},
    essences: {},
  };
}

/** An empty haul: no materials, scrap, Mana Dust, Links or runes. */
export function emptyHaul(): Haul {
  return { ...emptyMaterials(), scrap: 0, dust: 0, links: 0, runes: {} };
}

/** Counts by tier summed (a missing tier counts 0; the longer length is kept). */
function sumTiers(a: readonly number[] = [], b: readonly number[] = []): number[] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
}

/** `a` with each of `b`'s keys added in. */
function sumKeys<T>(
  a: Partial<Record<string, T>>,
  b: Partial<Record<string, T>>,
  add: (x: T | undefined, y: T) => T,
): Record<string, T> {
  const out = { ...a } as Record<string, T>;
  for (const [k, v] of Object.entries(b)) if (v !== undefined) out[k] = add(a[k], v);
  return out;
}

const plus = (x = 0, y = 0) => x + y;

/** `a` (a pouch or a haul, its other fields kept) with `b`'s materials added. */
export function addMaterials<P extends MaterialsPouch>(a: P, b: MaterialsPouch): P {
  return {
    ...a,
    metals: sumKeys(a.metals, b.metals, plus),
    flux: sumKeys(a.flux, b.flux, plus),
    shards: sumKeys(a.shards, b.shards, sumTiers),
    essences: sumKeys(a.essences, b.essences, plus),
  };
}

/** Two hauls summed: materials, scrap, Mana Dust, Links and runes. */
export function addHaul(a: Haul, b: Haul): Haul {
  return {
    ...addMaterials(a, b),
    scrap: a.scrap + b.scrap,
    dust: a.dust + b.dust,
    links: a.links + b.links,
    runes: sumKeys(a.runes, b.runes, sumTiers),
  };
}

/** `haul` with `amount` of one material added (a pickup, a salvaged shard or essence). */
export function addMaterial(haul: Haul, ref: MaterialRef, amount = 1): Haul {
  const one = emptyHaul();
  switch (ref.kind) {
    case 'metal':
      one.metals[ref.metal] = amount;
      break;
    case 'flux':
      one.flux[ref.grade] = amount;
      break;
    case 'shard':
      one.shards[ref.stat] = [...Array<number>(ref.tier - 1).fill(0), amount];
      break;
    case 'essence':
      one.essences[ref.essence] = amount;
      break;
    case 'dust':
      one.dust = amount;
      break;
    case 'links':
      one.links = amount;
      break;
  }
  return addHaul(haul, one);
}
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-materials.test.ts)`
Expected: PASS, 4 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 14 tests in F + 2 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-a
(cd packages/engine && npx prettier --write --end-of-line auto src/loot/materials.ts tests/delve-materials.test.ts)
git add packages/engine/src/loot/materials.ts packages/engine/tests/delve-materials.test.ts
git commit -m "feat(engine): the materials pouch and haul ops" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 5: Retiring the migrations' tests

### Task 6: Retire the save migration tests

Save v8 resets every older save (the user's rule: no migrations), so the tests of the v2–v7 migrations go first, while the code they test still stands: the next task deletes it. What they also checked stays: the save's slot forms (`delve-chains`), fitting a save's weapons to the data at load (`delve-movesets`), the default chains, the pair's refusals and `fixChainsToPair` (`delve-pair`), a save remembering new reactions (`delve-reactions`, `delve-profile-abilities`), and every socket and pouch test of `delve-runes-contract`.

**Files:**
- Modify (tests): `packages/engine/tests/delve-chains.test.ts`, `delve-movesets.test.ts`, `delve-pair.test.ts`, `delve-profile-abilities.test.ts`, `delve-reactions.test.ts`, `delve-runes-contract.test.ts`, `fixtures/arena.ts` (`OLD_BUILDS`, `asV4`, `asV5` go)
- Delete: `packages/engine/tests/fixtures/delve-v5-saves.json`

- [ ] **Step 1: Delete the migration tests and their fixtures**

In `packages/engine/tests/delve-chains.test.ts`:

Replace:

```ts
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { SLOT_FORMS } from '../src/delve/profile-schema.js';
```

with:

```ts
import { SLOT_FORMS } from '../src/delve/profile-schema.js';
```

Replace:

```ts
  type AbilityBuild,
  type Blow,
```

with:

```ts
  type Blow,
```

Replace:

```ts
  OLD_BUILDS,
  STEP,
  arena,
  asV4,
  asV5,
```

with:

```ts
  STEP,
  arena,
```

Replace the lines from `describe('saves before version 6', () => {` up to (not including) `for (const slot of ABILITY_SLOTS)` with:

```ts
describe('the save schema', () => {
  it("holds each slot's forms as arpg.json does", () => {
```

In `packages/engine/tests/delve-movesets.test.ts`:

Replace:

```ts
import V5 from './fixtures/delve-v5-saves.json';
import {
```

with:

```ts
import {
```

Replace:

```ts
  OLD_BUILDS,
  STEP,
  arena,
  asV4,
```

with:

```ts
  STEP,
  arena,
```

Replace the lines from `describe('save v6: the migration from version 5', () => {` up to (not including) `const common = weapon('common', 4, 'sword');` with:

```ts
describe('a save: fitting its weapons to the data at load', () => {
  const json = (x: unknown) => JSON.parse(JSON.stringify(x));

  it("fits a save's weapons to the data at load", () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
```

In `packages/engine/tests/delve-pair.test.ts`:

Replace:

```ts
  OLD_BUILDS,
  asV4,
  bal,
```

with:

```ts
  bal,
```

Replace:

```ts
describe('saves through version 6', () => {
  /** A version 3 save of `p`: its builds (`OLD_BUILDS`), no pair, no Mana Dust. */
  function v3Of(p: DelveProfile) {
    const { pair: _pair, manaDust: _dust, ...rest } = asV4(p);
    return { ...rest, version: 3 };
  }
```

with:

```ts
describe('the save and the pair', () => {
```

Replace the lines from `expect(bad({ primary: 'fire', secondary: 'fire' })).toBeNull();` up to (not including) `it("fixChainsToPair keeps the weapon's in-pair elements, gives an emptied move or a blow the primary, a fix each", () => {` with:

```ts
    expect(bad({ primary: 'fire', secondary: 'fire' })).toBeNull();
  });

```

In `packages/engine/tests/delve-profile-abilities.test.ts`:

Replace:

```ts
import { defaultChains } from '../src/arpg/abilities/resolve.js';
import { setChain } from '../src/delve/moveset.js';
```

with:

```ts
import { setChain } from '../src/delve/moveset.js';
```

Replace:

```ts
import { asV4, chainsOf, withChains } from './fixtures/arena.js';
```

with:

```ts
import { chainsOf, withChains } from './fixtures/arena.js';
```

Delete the lines from `it("migrates a version 2 save, keeping gear and scrap: its new primary's default chains", () => {` up to (not including) `it('remembers the new reactions', () => {`.

In `packages/engine/tests/delve-reactions.test.ts`:

Replace:

```ts
  asV4,
  bal,
```

with:

```ts
  bal,
```

Replace:

```ts
  it('a version 4 save that has seen a new reaction parses', () => {
```

with:

```ts
  it('a save that has seen a new reaction parses', () => {
```

Replace:

```ts

  it('a version 3 save with the seven still migrates', () => {
    const fresh = createDelveProfile(registry, 1, { primary: 'fire' });
    const { pair: _pair, manaDust: _dust, ...rest } = asV4(fresh);
    const v3 = { ...rest, version: 3, reactionsSeen: ['melt', 'blight'] };
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(v3)))?.profile).toMatchObject({
      version: 7,
      reactionsSeen: ['melt', 'blight'],
    });
  });
});
```

with:

```ts
});
```

In `packages/engine/tests/delve-runes-contract.test.ts`:

Delete the lines from `it('loads a version 6 save as version 7 with an empty pouch, and nothing else changed', () => {` up to (not including) `it('round-trips sockets, empty ones included, and the pouch', () => {`.

In `packages/engine/tests/fixtures/arena.ts`:

Replace:

```ts
import { defaultChains } from '../../src/arpg/abilities/resolve.js';
import { withMoveset } from '../../src/delve/profile.js';
```

with:

```ts
import { withMoveset } from '../../src/delve/profile.js';
```

Replace:

```ts
  type AbilityBuilds,
  type AbilityCast,
```

with:

```ts
  type AbilityCast,
```

Replace:

```ts
import type { EquippedGear, GearItem } from '../../src/types/gear.js';
```

with:

```ts
import type { EquippedGear } from '../../src/types/gear.js';
```

Replace the lines from `ultimate: { moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }], payment: 'charge' },` up to (not including) `/** The hero's chains: its weapon's moveset's (unarmed, the defaults on the pair). */` with:

```ts
  ultimate: { moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }], payment: 'charge' },
};

```

Delete `packages/engine/tests/fixtures/delve-v5-saves.json`: `git rm packages/engine/tests/fixtures/delve-v5-saves.json`.

- [ ] **Step 2: Run the suite**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N − 1 tests in F + 2 files pass (sixteen migration tests gone; the save's slot-forms check stays as a test of its own).

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/alloy-craft-a
(cd packages/engine && npx prettier --write --end-of-line auto tests/delve-chains.test.ts tests/delve-movesets.test.ts tests/delve-pair.test.ts tests/delve-profile-abilities.test.ts tests/delve-reactions.test.ts tests/delve-runes-contract.test.ts tests/fixtures/arena.ts)
git add packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-movesets.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-profile-abilities.test.ts packages/engine/tests/delve-reactions.test.ts packages/engine/tests/delve-runes-contract.test.ts packages/engine/tests/fixtures/arena.ts
git commit -m "test(engine): retire the save migration tests (save v8 resets older saves)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(`git rm` in Step 1 already staged the deleted fixture.)

## Chunk 6: Save v8

### Task 7: Save v8: materials, patterns, essences and the dive's haul; older saves reset

The profile becomes version 8: `materials` (the starter kit's 5 Rusty bars and an uncommon flux), `patterns` (the sword's, the cuirass's and the dagger's), `essencesSeen`, `firstEssenceGiven`; `pity` and `firstBossLegendaryGiven` go. A dive gains `haul`, `banked`, `lost` and `settled`. `parseDelveProfile` returns `{ profile }` for a version 8 save (fitted to the data, as before), `{ reset: true }` for any other version, null for garbage; the v2–v7 schemas, every migration, `chainFromBuild` and `AbilityBuild` are deleted. `stockHaul` banks a haul into the stockpile (B1's settle, B2's salvage at the Anvil). The loot context's `forceLegendary` becomes `firstEssence` (the stand-in still drops a legendary item) and carries the known `patterns`.

**Files:**
- Create: `packages/engine/tests/delve-save-v8.test.ts`
- Modify: `packages/engine/src/types/delve.ts`, `src/types/arpg.ts`, `src/types/ability.ts`, `src/delve/profile-schema.ts`, `src/delve/profile.ts`, `src/delve/dive.ts`, `src/loot/materials.ts`, `src/arpg/combat.ts`, `src/arpg/sandbox.ts`, `src/index.ts`
- Modify (tests): `packages/engine/tests/delve-materials.test.ts`, `delve-dive.test.ts`, `delve-pair.test.ts`, `delve-profile-abilities.test.ts`, `delve-runes-contract.test.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-save-v8.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { emptyHaul } from '../src/loot/materials.js';

// See the crafting spec: "Profile v8" and "Loading an old save" (no migrations).

const registry = createDefaultRegistry();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('save v8', () => {
  it('starts with the starter kit: three patterns, 5 Rusty bars and an uncommon flux', () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    expect(p.version).toBe(8);
    expect(p.patterns).toEqual(['sword', 'cuirass', 'dagger']);
    expect(p.materials.metals).toMatchObject({ rusty: 5, iron: 0 });
    expect(p.materials.flux).toEqual({ uncommon: 1, magic: 0, rare: 0, epic: 0 });
    expect([p.materials.shards, p.materials.essences, p.essencesSeen]).toEqual([{}, {}, []]);
    expect(p.firstEssenceGiven).toBe(false);
    expect('pity' in p || 'firstBossLegendaryGiven' in p).toBe(false);
    // The kit is the data's: a new save never shares its records.
    expect(registry.getCraftingData().startingMaterials.metals).toEqual({ rusty: 5 });
  });

  it('starts a dive with an empty haul and banked, nothing lost and not settled; it round-trips', () => {
    const p = startDive(registry, createDelveProfile(registry, 7, { primary: 'fire' }), 1);
    expect(p.dive).toMatchObject({
      haul: emptyHaul(),
      banked: emptyHaul(),
      lost: null,
      settled: false,
    });
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
  });

  it('resets a save of any other version; a version 8 save that does not fit is refused', () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    for (const version of [2, 6, 7, 9, undefined])
      expect(parseDelveProfile(registry, json({ ...p, version }))).toEqual({ reset: true });
    expect(parseDelveProfile(registry, json({ ...p, patterns: 'sword' }))).toBeNull();
    const { materials: _m, ...noPouch } = p;
    expect(parseDelveProfile(registry, json(noPouch))).toBeNull();
    expect(parseDelveProfile(registry, 'v8')).toBeNull();
  });
});
```

In `packages/engine/tests/delve-materials.test.ts`:

Replace:

```ts
} from '../src/loot/materials.js';
```

with:

```ts
  stockHaul,
} from '../src/loot/materials.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { createDelveProfile } from '../src/delve/profile.js';
```

Append at the end of the file:

```ts
describe('stocking a haul (the settle at extract, a salvage at the Anvil)', () => {
  it('adds its materials to the pouch and its currencies and runes to the profile', () => {
    const p = {
      ...createDelveProfile(createDefaultRegistry(), 3),
      runes: { echo: [0, 1, 0, 0, 0] },
    };
    const haul = {
      ...addMaterial(emptyHaul(), { kind: 'flux', grade: 'magic' }, 2),
      scrap: 40,
      dust: 3,
      links: 1,
      runes: { echo: [1, 0, 0, 0, 0] },
    };
    const next = stockHaul(p, haul);
    expect(next.materials.flux).toMatchObject({ uncommon: 1, magic: 2 });
    expect(next.materials.metals.rusty).toBe(5);
    expect([next.scrap, next.manaDust, next.links]).toEqual([40, 3, 1]);
    expect(next.runes).toEqual({ echo: [1, 1, 0, 0, 0] });
    expect(next.stats.scrapEarned).toBe(p.stats.scrapEarned + 40);
    expect(p.materials.flux.magic).toBe(0);
  });
});
```

In `packages/engine/tests/delve-dive.test.ts`:

Replace:

```ts
    expect(p.version).toBe(7);
```

with:

```ts
    expect(p.version).toBe(8);
```

Replace the lines from `it('round-trips through JSON and rejects garbage and old saves', () => {` up to (not including) `expect(parseDelveProfile(registry, null)).toBeNull();` with:

```ts
  it('round-trips through JSON, resets old saves and rejects garbage', () => {
    let p = createDelveProfile(registry, 1);
    p = startDive(registry, p, 1);
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))).toEqual({ profile: p });
    expect(parseDelveProfile(registry, { ...p, version: 1 })).toEqual({ reset: true });
    expect(parseDelveProfile(registry, { ...p, scrap: -1 })).toBeNull();
```

Replace:

```ts
  it('the first boss ever drops a legendary, grants a checkpoint and a potion', () => {
```

with:

```ts
  it('the first boss ever drops a legendary (until B1, its essence), grants a checkpoint and a potion', () => {
```

Replace:

```ts
    expect(res.profile.firstBossLegendaryGiven).toBe(true);
```

with:

```ts
    expect(res.profile.firstEssenceGiven).toBe(true);
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-save-v8.test.ts tests/delve-materials.test.ts tests/delve-dive.test.ts)`
Expected: FAIL, 7 failed | 21 passed: `(0 , stockHaul) is not a function`; `expected 7 to be 8` (twice); the dive's haul fields missing; `expected null to deeply equal { reset: true }`; the round trip (`{ profile, runesLost, … }`); `firstEssenceGiven` undefined.

- [ ] **Step 3: The v8 profile, its schema and the reset**

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
import type { CraftingBalance, DropsBalance } from './crafting.js';
```

with:

```ts
import type { CraftingBalance, DropsBalance, Haul, MaterialsPouch } from './crafting.js';
```

Replace:

```ts
  stop: DiveStop | null;
```

with:

```ts
  stop: DiveStop | null;
  /**
   * This floor's pickups: materials, scrap pickups, Mana Dust, Links, runes and
   * essences (see the crafting spec's banking). A cleared floor banks it; a floor
   * left any other way loses it.
   */
  haul: Haul;
  /** What this dive's cleared floors banked: it settles into the stockpile once (`settleDive`). */
  banked: Haul;
  /** What a death or an abandon took when the dive settled, for the summary (null: nothing). */
  lost: Haul | null;
  /** The dive has settled: `settleDive` runs once a dive. */
  settled: boolean;
```

Replace:

```ts
  version: 7;
```

with:

```ts
  version: 8;
```

Replace:

```ts
  /** Drops since the last legendary — raises legendary odds. */
  pity: number;
  firstBossLegendaryGiven: boolean;
```

with:

```ts
  /** The first boss's essence has banked (until it does, the first boss guarantees one). */
  firstEssenceGiven: boolean;
```

Replace:

```ts
  runes: RunePouch;
```

with:

```ts
  runes: RunePouch;
  /** Bars, flux, shards and essences: the stockpile at the Anvil (see the crafting spec). */
  materials: MaterialsPouch;
  /** The bases the hero can forge: learned from the start, from salvage and from pattern drops. */
  patterns: string[];
  /** The legendaries whose essence the hero has picked up (the Codex's Essences). */
  essencesSeen: string[];
```

In `packages/engine/src/types/arpg.ts`:

Replace:

```ts
  /** First boss kill ever drops a guaranteed legendary. */
  forceLegendary: boolean;
```

with:

```ts
  /**
   * The first boss's essence hasn't banked (`DelveProfile.firstEssenceGiven`):
   * the first boss guarantees it. Until B1, the stand-in gives a legendary item.
   */
  firstEssence: boolean;
  /** The patterns the hero knows: a pattern drop teaches one it doesn't. */
  patterns: string[];
```

In `packages/engine/src/types/ability.ts`:

Replace the lines from `export const ABILITY_PAYMENTS: readonly AbilityPayment[] = ['mana', 'charge', 'cast'] as const;` up to (not including) `/** How a move lands: light, medium or heavy, or a hold that charges while the button is held. */` with:

```ts
export const ABILITY_PAYMENTS: readonly AbilityPayment[] = ['mana', 'charge', 'cast'] as const;

```

In `packages/engine/src/delve/profile-schema.ts`:

Replace:

```ts
import { MAX_SOCKETS, RUNE_TIERS } from '../types/rune.js';

/** Zod schema for persisted Delve saves — rejects corrupt or foreign data. */
```

with:

```ts
import { FLUX_GRADES, METAL_IDS } from '../types/crafting.js';
import { MAX_SOCKETS, RUNE_TIERS } from '../types/rune.js';

/** Zod schema for persisted Delve saves (version 8 only) — rejects corrupt or foreign data. */
```

Delete the lines from `` /** A version 3 or 4 save's ability (see `chainFromBuild`). */ `` up to (not including) `/** A socketed rune: its id (checked against the data at load) and its tier, I to V. */`.

Replace:

```ts
  z.array(z.number().int().min(0)).length(RUNE_TIERS),
);
```

with:

```ts
  z.array(z.number().int().min(0)).length(RUNE_TIERS),
);

const count = z.number().int().min(0);

/** A count for each id. */
function counts<K extends string>(ids: readonly K[]) {
  return z.object(Object.fromEntries(ids.map((id) => [id, count])) as Record<K, typeof count>);
}

/** The materials pouch: bars, flux, shards by tier and essences (see the crafting spec). */
export const MaterialsPouchSchema = z.object({
  metals: counts(METAL_IDS),
  flux: counts(FLUX_GRADES),
  shards: z.record(StatKeySchema, z.array(count).max(5)),
  essences: z.record(z.string(), count),
});

/** A floor's or a dive's haul: materials and the currencies. */
export const HaulSchema = MaterialsPouchSchema.extend({
  scrap: z.number().min(0),
  dust: count,
  links: count,
  runes: RunePouchSchema,
});
```

Replace:

```ts
    .default(null),
```

with:

```ts
    .default(null),
  haul: HaulSchema,
  banked: HaulSchema,
  lost: HaulSchema.nullable(),
  settled: z.boolean(),
```

Replace:

```ts
/** Version 3 (before the pair), kept frozen so older saves migrate through it. */
export const DelveProfileV3Schema = z.object({
  version: z.literal(3),
```

with:

```ts
/** The hero's pair: a secondary only once there is a primary, and never the same element. */
const PairSchema = z
  .object({ primary: ManaTypeSchema.nullable(), secondary: ManaTypeSchema.nullable() })
  .refine(
    (p) => p.secondary === null || (p.primary !== null && p.secondary !== p.primary),
    'a secondary needs a different primary',
  );

/** Version 8: materials, patterns and essences (see the crafting spec); older saves reset. */
export const DelveProfileSchema = z.object({
  version: z.literal(8),
```

Replace:

```ts
  pity: z.number().int().min(0),
  firstBossLegendaryGiven: z.boolean(),
```

with:

```ts
  firstEssenceGiven: z.boolean(),
```

Replace the lines from `abilities: z.object({` to the end of the file with:

```ts
  pair: PairSchema,
  manaDust: z.number().int().min(0),
  links: z.number().int().min(0),
  runes: RunePouchSchema,
  materials: MaterialsPouchSchema,
  patterns: z.array(z.string()),
  essencesSeen: z.array(z.string()),
  reactionsSeen: z.array(ReactionIdSchema),
  dive: DiveSchema.nullable(),
});
```

In `packages/engine/src/delve/profile.ts`:

Replace:

```ts
import { MANA_TYPES, type ManaType } from '../types/mana.js';
```

with:

```ts
import type { ManaType } from '../types/mana.js';
```

Replace the lines from `import { compareItem, computeAttunement, heroPower } from './hero-stats.js';` up to (not including) `export interface ProfileActionResult {` with:

```ts
import { compareItem, heroPower } from './hero-stats.js';
import { DelveProfileSchema } from './profile-schema.js';
import { chooseStartingMana, salvageDust, type ChainFix } from './pair.js';
import { isDiveActive } from './dive.js';
import { settleParts, type SetChainsOptions } from './runes.js';
import { baseSlots, carriedSkills, defaultChain, movesetOf, weaponParts } from '../loot/moveset.js';
import { emptyMaterials } from '../loot/materials.js';
import { addToPouch, socketCap } from '../loot/runes.js';
import type { RuneRef } from '../types/rune.js';
import { CHAIN_SKILLS, type Blow, type ChainSkill, type Move } from '../types/ability.js';

```

Replace:

```ts
  const profile: DelveProfile = {
    version: 7,
```

with:

```ts
  // The starter kit (the crafting spec's S8): enough to forge before the first dive.
  const kit = registry.getCraftingData();
  const materials = emptyMaterials();
  Object.assign(materials.metals, kit.startingMaterials.metals);
  Object.assign(materials.flux, kit.startingMaterials.flux);
  const profile: DelveProfile = {
    version: 8,
```

Replace:

```ts
    pity: 0,
    firstBossLegendaryGiven: false,
```

with:

```ts
    firstEssenceGiven: false,
```

Replace:

```ts
    runes: {},
```

with:

```ts
    runes: {},
    materials,
    patterns: [...kit.startingPatterns],
    essencesSeen: [],
```

Replace the lines from `const STRENGTH: MoveKind[] = ['light', 'medium', 'heavy'];` up to (not including) `* Every weapon's moveset fitted to the data: a weapon without one gets its` with:

```ts
/**
 * A save read back: the profile, or `reset` for a save of another version (no
 * migrations: see the crafting spec), which starts afresh with a notice.
 */
export type ParsedDelveProfile = { profile: DelveProfile } | { reset: true };

/**
```

Replace:

```ts
 * ('destroy', listed in `runesLost`). The pouch drops ids the data doesn't know.
 */
function fitMovesets(
  registry: DataRegistry,
  profile: DelveProfile,
): { profile: DelveProfile; runesLost: RuneRef[] } {
```

with:

```ts
 * ('destroy'). The pouch drops ids the data doesn't know.
 */
function fitMovesets(registry: DataRegistry, profile: DelveProfile): DelveProfile {
```

Replace the lines from `const pay = registry.getDelveBalance().runes.unsocket === 'pay';` up to (not including) `/** Depth used as the yardstick for Power and comparisons. */` with:

```ts
  const pay = registry.getDelveBalance().runes.unsocket === 'pay';
  return {
    ...profile,
    equipped,
    bag,
    links: profile.links + links,
    runes: pay ? addToPouch(pouch, off) : pouch,
  };
}

/**
 * Validate an unknown JSON blob as a save. A version 8 save is fitted to the
 * data (`fitMovesets`); a save of any other version is `{ reset: true }`. Null
 * when it isn't an object, or a version 8 save doesn't fit the schema.
 */
export function parseDelveProfile(registry: DataRegistry, raw: unknown): ParsedDelveProfile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  if ((raw as { version?: unknown }).version !== 8) return { reset: true };
  const parsed = DelveProfileSchema.safeParse(raw);
  return parsed.success ? { profile: fitMovesets(registry, parsed.data as DelveProfile) } : null;
}

```

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
import { addToPouch } from '../loot/runes.js';
```

with:

```ts
import { addToPouch } from '../loot/runes.js';
import { emptyHaul } from '../loot/materials.js';
```

Replace:

```ts
    stop: null,
    found: Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>,
```

with:

```ts
    stop: null,
    haul: emptyHaul(),
    banked: emptyHaul(),
    lost: null,
    settled: false,
    found: Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>,
```

Replace:

```ts
      forceLegendary: !profile.firstBossLegendaryGiven,
```

with:

```ts
      firstEssence: !profile.firstEssenceGiven,
      patterns: profile.patterns,
```

Replace:

```ts
    firstBossLegendaryGiven: next.firstBossLegendaryGiven || !world.loot.forceLegendary,
```

with:

```ts
    firstEssenceGiven: next.firstEssenceGiven || !world.loot.firstEssence,
```

In `packages/engine/src/loot/materials.ts`:

Replace:

```ts
import type { DataRegistry } from '../data/registry.js';
```

with:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { DelveProfile } from '../types/delve.js';
```

Append at the end of the file:

```ts
/** `profile` with `haul` in its stockpile: materials, scrap (counted as earned), Mana Dust, Links and runes. */
export function stockHaul(profile: DelveProfile, haul: Haul): DelveProfile {
  return {
    ...profile,
    materials: addMaterials(profile.materials, haul),
    scrap: profile.scrap + haul.scrap,
    manaDust: profile.manaDust + haul.dust,
    links: profile.links + haul.links,
    runes: sumKeys(profile.runes, haul.runes, sumTiers),
    stats: { ...profile.stats, scrapEarned: profile.stats.scrapEarned + haul.scrap },
  };
}
```

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
  const forceLegendary = m.kind === 'boss' && loot.forceLegendary;
```

with:

```ts
  // ponytail: Phase A's stand-in for the first boss's essence (a legendary item); B1 drops the essence.
  const forceLegendary = m.kind === 'boss' && loot.firstEssence;
```

Replace:

```ts
  if (forceLegendary) loot.forceLegendary = false;
```

with:

```ts
  if (forceLegendary) loot.firstEssence = false;
```

In `packages/engine/src/arpg/sandbox.ts`:

Replace:

```ts
      forceLegendary: false,
```

with:

```ts
      firstEssence: false,
      patterns: [],
```

In `packages/engine/src/index.ts`:

Replace:

```ts
  chainFromBuild,
} from './delve/profile.js';
```

with:

```ts
} from './delve/profile.js';
```

The other save tests read version 8:

In `packages/engine/tests/delve-pair.test.ts`:

Replace:

```ts
  it('a new profile is version 7 with no pair yet, no Mana Dust, no Links and no runes, and round-trips', () => {
    const p = createDelveProfile(registry, 3);
    expect(p).toMatchObject({
      version: 7,
```

with:

```ts
  it('a new profile is version 8 with no pair yet, no Mana Dust, no Links and no runes, and round-trips', () => {
    const p = createDelveProfile(registry, 3);
    expect(p).toMatchObject({
      version: 8,
```

Replace:

```ts
    expect(parseDelveProfile(registry, json(p))).toEqual({
      profile: p,
      fixed: [],
      dropped: [],
      movesetReset: false,
      runesLost: [],
    });
```

with:

```ts
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
```

In `packages/engine/tests/delve-profile-abilities.test.ts`:

Replace:

```ts
    expect(p.version).toBe(7);
```

with:

```ts
    expect(p.version).toBe(8);
```

Replace:

```ts
    expect(parseDelveProfile(registry, json(p))).toEqual({
      profile: p,
      fixed: [],
      dropped: [],
      movesetReset: false,
      runesLost: [],
    });
```

with:

```ts
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
```

In `packages/engine/tests/delve-runes-contract.test.ts`:

Replace:

```ts
describe('save v7', () => {
```

with:

```ts
describe('save v8: sockets and the pouch', () => {
```

Replace:

```ts
  it('a new profile is version 7 with an empty pouch', () => {
    expect(fresh()).toMatchObject({ version: 7, runes: {} });
```

with:

```ts
  it('a new profile is version 8 with an empty pouch; a version 6 or 7 save resets', () => {
    const p = fresh();
    expect(p).toMatchObject({ version: 8, runes: {} });
    const { runes: _runes, ...v6 } = p;
    expect(parseDelveProfile(registry, json({ ...v6, version: 6 }))).toEqual({ reset: true });
    expect(parseDelveProfile(registry, json({ ...p, version: 7 }))).toEqual({ reset: true });
```

Replace:

```ts
    expect(parseDelveProfile(registry, json(res.profile))).toEqual({ ...res, runesLost: [] });
```

with:

```ts
    expect(parseDelveProfile(registry, json(res.profile))).toEqual(res);
```

Replace:

```ts
    expect(res.runesLost).toEqual([
      { id: 'quick', tier: 3 },
      { id: 'echo', tier: 1 },
    ]);
```

with:

```ts
    // The trimmed Quick III and Echo I are destroyed: the pouch keeps only its own Echo.
```

Replace:

```ts
      expect(res.runesLost).toEqual([]);
      expect(res.profile.runes).toEqual({ echo: [1, 0, 1, 0, 0] });
```

with:

```ts
      expect(res.profile.runes).toEqual({ echo: [1, 0, 1, 0, 0] });
```

Replace:

```ts
    expect(res.runesLost).toEqual([{ id: 'guard', tier: 1 }]);
```

with:

```ts
    expect(res.profile.runes).toEqual({});
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-save-v8.test.ts tests/delve-materials.test.ts tests/delve-dive.test.ts)`
Expected: PASS, 28 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 3 tests in F + 3 files pass, the pacing rails among them.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-a
(cd packages/engine && npx prettier --write --end-of-line auto src/types/delve.ts src/types/arpg.ts src/types/ability.ts src/delve/profile-schema.ts src/delve/profile.ts src/loot/materials.ts src/arpg/combat.ts src/arpg/sandbox.ts src/index.ts tests/delve-save-v8.test.ts tests/delve-materials.test.ts tests/delve-dive.test.ts tests/delve-pair.test.ts tests/delve-profile-abilities.test.ts tests/delve-runes-contract.test.ts)
git add packages/engine/src/types/delve.ts packages/engine/src/types/arpg.ts packages/engine/src/types/ability.ts packages/engine/src/delve/profile-schema.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/dive.ts packages/engine/src/loot/materials.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/index.ts packages/engine/tests/delve-save-v8.test.ts packages/engine/tests/delve-materials.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-profile-abilities.test.ts packages/engine/tests/delve-runes-contract.test.ts
git commit -m "feat(engine): save v8 with materials, patterns, essences and the dive's haul; older saves reset" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 7: Items and the stubs

### Task 8: Items carry hones and roll bands

`GearItem.hones` (0 on every new item; Hone's price grows with it) and `StatRoll.band?` (a shard line's tier band; absent, the rarity's default), saved by the schema. B2 sets them.

**Files:**
- Modify: `packages/engine/src/types/gear.ts`, `src/loot/item-generator.ts`, `src/delve/profile-schema.ts`
- Modify (tests): `packages/engine/tests/delve-crafting-data.test.ts`, `delve-movesets.test.ts` (the items hash leaves `hones` out, so it still reads v0.48.0's rolls)

- [ ] **Step 1: The failing test**

In `packages/engine/tests/delve-crafting-data.test.ts`:

Replace:

```ts
import { profileStats } from '../src/delve/pair.js';
```

with:

```ts
import { profileStats } from '../src/delve/pair.js';
import { GearItemSchema } from '../src/delve/profile-schema.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
```

Append at the end of the file:

```ts
describe('items: hones and roll bands', () => {
  const item = generateItem(
    registry,
    { uid: 'r', ilvl: 6, rarity: 'rare', slot: 'ring' },
    new SeededRNG(3),
  );

  it('rolls with no hones and no bands (the rarity default)', () => {
    expect(item.hones).toBe(0);
    expect(item.affixes.every((a) => a.band === undefined)).toBe(true);
  });

  it("saves a line's band and the hones; an item saved before hones reads as none", () => {
    const banded = { ...item, hones: 2, affixes: [{ ...item.affixes[0], band: [0.4, 0.7] }] };
    expect(GearItemSchema.parse(banded)).toEqual(banded);
    const { hones: _h, ...old } = item;
    expect(GearItemSchema.parse(old).hones).toBe(0);
    const bad = { ...item, affixes: [{ ...item.affixes[0], band: [0.4, 1.2] }] };
    expect(GearItemSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-crafting-data.test.ts)`
Expected: FAIL, 2 failed | 15 passed: `expected undefined to be +0` (no `hones`), and the band and `hones` stripped by the schema.

- [ ] **Step 3: The fields and their schema**

In `packages/engine/src/types/gear.ts`:

Replace:

```ts
  stat: HeroStatKey;
  value: number;
  roll: number;
}
```

with:

```ts
  stat: HeroStatKey;
  value: number;
  roll: number;
  /**
   * An affix line's roll band, 0–1 in its range: a shard's tier band (see the
   * crafting spec). Absent: the rarity's default, `[minRoll, 1]`.
   */
  band?: [number, number];
}
```

Replace:

```ts
  reforges: number;
```

with:

```ts
  reforges: number;
  /** Number of hones performed — drives escalating hone cost (see the crafting spec). */
  hones: number;
```

In `packages/engine/src/loot/item-generator.ts`:

Replace:

```ts
    reforges: 0,
```

with:

```ts
    reforges: 0,
    hones: 0,
```

In `packages/engine/src/delve/profile-schema.ts`:

Replace:

```ts
const StatRollSchema = z.object({ stat: StatKeySchema, value: z.number(), roll: z.number() });
```

with:

```ts
const StatRollSchema = z.object({
  stat: StatKeySchema,
  value: z.number(),
  roll: z.number(),
  band: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
});
```

Replace:

```ts
  reforges: z.number().int().min(0),
```

with:

```ts
  reforges: z.number().int().min(0),
  // The Training Grounds' saved loadout predates hones: it reads as none.
  hones: z.number().int().min(0).default(0),
```

In `packages/engine/tests/delve-movesets.test.ts`:

Replace:

```ts
    const strip = items.map(({ moveset: _m, ...rest }) => rest);
```

with:

```ts
    // `hones` (0 on every item) is new since: the rolls are as they were.
    const strip = items.map(({ moveset: _m, hones: _h, ...rest }) => rest);
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-crafting-data.test.ts)`
Expected: PASS, 17 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 5 tests in F + 3 files pass (the items hash still `[291, '49e20fb6']`).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-a
(cd packages/engine && npx prettier --write --end-of-line auto src/types/gear.ts src/delve/profile-schema.ts tests/delve-crafting-data.test.ts tests/delve-movesets.test.ts)
git add packages/engine/src/types/gear.ts packages/engine/src/loot/item-generator.ts packages/engine/src/delve/profile-schema.ts packages/engine/tests/delve-crafting-data.test.ts packages/engine/tests/delve-movesets.test.ts
git commit -m "feat(engine): items carry hones and roll bands" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: The contract: typed stubs, the arena's material drops, `closeDive` with the registry

Every new engine op the areas fill in, as a typed stub that throws "not implemented", in the file its area owns, exported whole from `index.ts`; the arena's material drop and pickup types; `settleDive` and `closeDive(registry, profile)` (it settles nothing until B1 wires `settleDive`); `salvageItems` reports the shards, patterns and essences B2 will fill.

**Files:**
- Create: `packages/engine/src/loot/forge.ts`, `src/loot/salvage-yield.ts`, `src/delve/crafting.ts`, `src/arpg/material-drops.ts`, `src/delve/economy.ts`, `packages/engine/tests/delve-crafting-contract.test.ts`
- Modify: `packages/engine/src/types/arpg.ts`, `src/loot/materials.ts`, `src/delve/dive.ts`, `src/delve/autopilot.ts`, `src/delve/profile.ts`, `src/index.ts`; `packages/engine/tests/delve-dive.test.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-crafting-contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as engine from '../src/index.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { closeDive, startDive } from '../src/delve/dive.js';
import { createDelveProfile, salvageItems } from '../src/delve/profile.js';

// The stage 4c contract (see the crafting spec's "Phases and parallel areas"):
// every export the areas fill in exists from the start. No test here calls a stub.

const registry = createDefaultRegistry();

describe('the crafting contract', () => {
  it('exports every new op from the engine', () => {
    for (const name of [
      // loot/materials.ts
      'metalAt',
      'shardTiersOf',
      'emptyMaterials',
      'emptyHaul',
      'addMaterials',
      'addHaul',
      'addMaterial',
      'stockHaul',
      'refineCost',
      // loot/forge.ts
      'previewForge',
      'forgeItem',
      'honeLine',
      'imprintLine',
      'honeCost',
      'imprintCost',
      // loot/salvage-yield.ts
      'salvageYield',
      'applySalvage',
      // delve/crafting.ts
      'forge',
      'hone',
      'imprint',
      'refine',
      'buyShard',
      // delve/dive.ts, delve/economy.ts, arpg/material-drops.ts
      'settleDive',
      'economySim',
      'dropMaterials',
    ])
      expect(typeof (engine as Record<string, unknown>)[name], name).toBe('function');
    expect(engine.METAL_IDS).toHaveLength(7);
    expect(engine.FLUX_GRADES).toEqual(['uncommon', 'magic', 'rare', 'epic']);
  });

  it('closes a dive with the registry: an ended one only clears the record', () => {
    const p = startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);
    const ended = { ...p, dive: { ...p.dive!, phase: 'dead' as const } };
    expect(closeDive(registry, ended)).toEqual({ ...ended, dive: null });
  });

  it('names what a salvage gave besides scrap, Dust and Links (none until B2)', () => {
    const p = createDelveProfile(registry, 4, { primary: 'fire' });
    expect(salvageItems(registry, p, [])).toMatchObject({ shards: [], patterns: [], essences: [] });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-crafting-contract.test.ts)`
Expected: FAIL, 3 failed: `metalAt: expected 'undefined' to be 'function'`; `closeDive` returning the registry spread (its old one-argument signature); `salvageItems` with no `shards`.

- [ ] **Step 3: The stubs, the types and the signatures**

Create `packages/engine/src/loot/forge.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { ForgePreview, ForgeRequest, ShardRef } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem } from '../types/gear.js';

/**
 * Forging and the Temper sinks on an item (see the crafting spec): the forge's
 * preview and roll, Hone and Imprint, their prices, and the band and floor
 * math. Stage 4c's B2 fills these; until then each throws.
 */

/** Everything `forgeItem` would make but the random draws, and why it refuses (if it does). */
export function previewForge(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _req: ForgeRequest,
): ForgePreview {
  throw new Error('previewForge: not implemented');
}

/** The forged item, rolled on `rng` (`forge:${forgeCount}`); throws where the preview refuses. */
export function forgeItem(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _req: ForgeRequest,
  _rng: SeededRNG,
): GearItem {
  throw new Error('forgeItem: not implemented');
}

/** `item` with affix line `line` rerolled within its band, the attunement floor applied; `hones` + 1. */
export function honeLine(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _item: GearItem,
  _line: number,
  _rng: SeededRNG,
): GearItem {
  throw new Error('honeLine: not implemented');
}

/** `item` with affix line `line` replaced by `shard`'s affix, rolled in the shard's band. */
export function imprintLine(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _item: GearItem,
  _line: number,
  _shard: ShardRef,
  _rng: SeededRNG,
): GearItem {
  throw new Error('imprintLine: not implemented');
}

/** Scrap the next hone of `item` costs. */
export function honeCost(_registry: DataRegistry, _item: GearItem): number {
  throw new Error('honeCost: not implemented');
}

/** Scrap an imprint on `item` costs, besides the shard. */
export function imprintCost(_registry: DataRegistry, _item: GearItem): number {
  throw new Error('imprintCost: not implemented');
}
```

Create `packages/engine/src/loot/salvage-yield.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { SalvageResult, SalvageYield } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem } from '../types/gear.js';

/**
 * What gear gives back (see the crafting spec's Salvage): every salvage path
 * goes through `applySalvage`. Stage 4c's B2 fills these; until then each throws.
 */

/** What salvaging `item` could give (the Loadout's preview). */
export function salvageYield(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _item: GearItem,
): SalvageYield {
  throw new Error('salvageYield: not implemented');
}

/**
 * Salvage one item, drawing on `rng` (keyed on the item: see the spec): mid-dive
 * its yield goes to the floor's haul, at the Anvil to the stockpile.
 */
export function applySalvage(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _item: GearItem,
  _rng: SeededRNG,
): SalvageResult {
  throw new Error('applySalvage: not implemented');
}
```

Create `packages/engine/src/delve/crafting.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { ForgeRequest, MaterialRef, ShardRef } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { HeroStatKey } from '../types/gear.js';
import type { ProfileActionResult } from './profile.js';

/**
 * The Anvil's crafting ops on the profile (see the crafting spec), each refused
 * mid-dive (the dive lock) with a reason, as the other profile ops are. Stage
 * 4c's B2 fills these; until then each throws.
 */

/** Forge `req` into the bag, paying its price and consuming its materials (`ProfileActionResult.item`). */
export function forge(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _req: ForgeRequest,
): ProfileActionResult {
  throw new Error('forge: not implemented');
}

/** Hone affix line `line` of item `uid`, for scrap. */
export function hone(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _uid: string,
  _line: number,
): ProfileActionResult {
  throw new Error('hone: not implemented');
}

/** Imprint `shard` on affix line `line` of item `uid`, for the shard and scrap. */
export function imprint(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _uid: string,
  _line: number,
  _shard: ShardRef,
): ProfileActionResult {
  throw new Error('imprint: not implemented');
}

/** Refine `refine.<kind>.count` of a bar, a flux or a shard into one of the next grade, for scrap. */
export function refine(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _what: MaterialRef,
): ProfileActionResult {
  throw new Error('refine: not implemented');
}

/** Buy a tier I shard of `stat` at the shard bench (`crafting.shardBench`). */
export function buyShard(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _stat: HeroStatKey,
): ProfileActionResult {
  throw new Error('buyShard: not implemented');
}
```

Create `packages/engine/src/arpg/material-drops.ts`:

```ts
import type { MonsterEntity } from '../types/arpg.js';
import type { SimCtx } from './combat.js';

/**
 * A slain foe's materials (see the crafting spec's drop tables): pickups that
 * burst onto the floor and magnet in, rolled on the world's own stream. Stage
 * 4c's B1 fills it and calls it from `killMonster`'s `!world.sandbox` guard;
 * until then it throws.
 */
export function dropMaterials(_ctx: SimCtx, _m: MonsterEntity): void {
  throw new Error('dropMaterials: not implemented');
}
```

Create `packages/engine/src/delve/economy.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { Haul } from '../types/crafting.js';
import type { Rarity } from '../types/gear.js';

/** One dive of the economy sim (the DPS Lab's Economy view). */
export interface EconomyDive {
  dive: number;
  /** What the dive brought home, per material and currency. */
  income: Haul;
  /** What the Anvil spent between dives: forging, honing, refining, buying. */
  spent: Haul;
  /** Items forged, by rarity. */
  forged: Record<Rarity, number>;
  /** The deepest depth reached. */
  depth: number;
  died: boolean;
}

export interface EconomyReport {
  seed: number;
  dives: EconomyDive[];
}

/**
 * The autopilot over `dives` dives from a new save, reporting the economy dive
 * by dive (see the crafting spec's Economy view; the pacing rails call it too).
 * Stage 4c's B3 fills it; until then it throws.
 */
export function economySim(_registry: DataRegistry, _seed: number, _dives: number): EconomyReport {
  throw new Error('economySim: not implemented');
}
```

In `packages/engine/src/types/arpg.ts`:

Replace:

```ts
import type { RuneDef, RuneRef } from './rune.js';
```

with:

```ts
import type { RuneDef, RuneRef } from './rune.js';
import type { MaterialRef } from './crafting.js';
```

Replace:

```ts
export type DropKind = 'item' | 'mote' | 'orb' | 'scrap' | 'rune';
```

with:

```ts
export type DropKind = 'item' | 'mote' | 'orb' | 'scrap' | 'rune' | 'material';
```

Replace:

```ts
  rune?: RuneRef;
  amount: number;
```

with:

```ts
  rune?: RuneRef;
  /** A material drop's material (kind `'material'`; see the crafting spec). */
  material?: MaterialRef;
  amount: number;
```

Replace:

```ts
      rune?: RuneRef;
```

with:

```ts
      rune?: RuneRef;
      /** A material pickup's material, `amount` of it. */
      material?: MaterialRef;
```

In `packages/engine/src/loot/materials.ts`:

Append at the end of the file:

```ts
/**
 * What refining `what` costs: `count` of it and `scrap` make one of the next
 * grade (see the crafting spec); null when it doesn't refine (the top grade, a
 * shard at its affix's last tier, an essence, Mana Dust or Links). Stage 4c's
 * B2 fills it; until then it throws.
 */
export function refineCost(
  _registry: DataRegistry,
  _what: MaterialRef,
): { count: number; scrap: number } | null {
  throw new Error('refineCost: not implemented');
}
```

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
import type { DelveProfile, DiveState } from '../types/delve.js';
```

with:

```ts
import type { DelveProfile, DiveState } from '../types/delve.js';
import type { SettleOutcome } from '../types/crafting.js';
```

Replace:

```ts
/** Clear the dive record (after the summary, or to abandon — the bounty is lost). */
export function closeDive(profile: DelveProfile): DelveProfile {
```

with:

```ts
/**
 * The one path from a dive's `banked` haul into the stockpile, once a dive
 * (`dive.settled`; see the crafting spec's banking): an extract keeps it all; a
 * death or an abandon loses the floor's haul and `crafting.deathLoss` of
 * `banked` (each entry rounded stochastically on `death:${seed}`, banked
 * essences exempt), recorded in `dive.lost`. Stage 4c's B1 fills it and calls
 * it from `extractDive`, `failFloor` and `closeDive`; until then it throws.
 */
export function settleDive(_registry: DataRegistry, _profile: DelveProfile, _outcome: SettleOutcome): DelveProfile {
  throw new Error('settleDive: not implemented');
}

/**
 * Clear the dive record (after the summary, or to abandon — the bounty is lost).
 * Stage 4c's B1 settles a dive still under way here first, as an abandon
 * (`settleDive`); an extracted or dead dive has settled already.
 */
export function closeDive(_registry: DataRegistry, profile: DelveProfile): DelveProfile {
```

In `packages/engine/src/delve/autopilot.ts`:

Replace:

```ts
    p = betweenDives(registry, closeDive(p));
```

with:

```ts
    p = betweenDives(registry, closeDive(registry, p));
```

In `packages/engine/src/delve/profile.ts`:

Replace:

```ts
import type { RuneRef } from '../types/rune.js';
```

with:

```ts
import type { RuneRef } from '../types/rune.js';
import type { ShardRef } from '../types/crafting.js';
```

Replace:

```ts
} {
  if (isDiveActive(profile))
    return { profile, scrap: 0, dust: 0, links: 0, count: 0, runes: [], destroyed: [] };
```

with:

```ts
  /** The shards, patterns and essences they gave (see the crafting spec's Salvage; stage 4c's B2). */
  shards: ShardRef[];
  patterns: string[];
  essences: string[];
} {
  const none = { shards: [], patterns: [], essences: [] };
  if (isDiveActive(profile))
    return { profile, scrap: 0, dust: 0, links: 0, count: 0, runes: [], destroyed: [], ...none };
```

Replace:

```ts
    destroyed: settled.destroyed,
  };
```

with:

```ts
    destroyed: settled.destroyed,
    ...none,
  };
```

In `packages/engine/src/index.ts`:

Replace:

```ts
  closeDive,
```

with:

```ts
  closeDive,
  settleDive,
```

Append at the end of the file:

```ts
// Crafting (see the crafting spec): every module whole, so the areas that build them never edit this file.
export * from './loot/materials.js';
export * from './loot/forge.js';
export * from './loot/salvage-yield.js';
export * from './delve/crafting.js';
export * from './delve/economy.js';
export * from './arpg/material-drops.js';
```

In `packages/engine/tests/delve-dive.test.ts`:

Replace:

```ts
    expect(closeDive(p).dive).toBeNull();
```

with:

```ts
    expect(closeDive(registry, p).dive).toBeNull();
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-crafting-contract.test.ts)`
Expected: PASS, 3 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors (no two `export *` modules share a name); N + 8 tests in F + 4 files pass (**1661 | 5 skipped in 88 | 1 skipped** at the base's counts), the pacing rails among them.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-a
(cd packages/engine && npx prettier --write --end-of-line auto src/loot/forge.ts src/loot/salvage-yield.ts src/delve/crafting.ts src/arpg/material-drops.ts src/delve/economy.ts src/types/arpg.ts src/loot/materials.ts src/delve/profile.ts src/index.ts tests/delve-crafting-contract.test.ts tests/delve-dive.test.ts)
git add packages/engine/src/loot/forge.ts packages/engine/src/loot/salvage-yield.ts packages/engine/src/delve/crafting.ts packages/engine/src/arpg/material-drops.ts packages/engine/src/delve/economy.ts packages/engine/src/types/arpg.ts packages/engine/src/loot/materials.ts packages/engine/src/delve/dive.ts packages/engine/src/delve/autopilot.ts packages/engine/src/delve/profile.ts packages/engine/src/index.ts packages/engine/tests/delve-crafting-contract.test.ts packages/engine/tests/delve-dive.test.ts
git commit -m "feat(engine): the stage 4c contract: typed stubs for forging, salvage, the crafting ops, material drops, the settle and the economy sim" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 8: The client

### Task 10: The Forge tab without Fusion; the hub's new links

The Fuse bench, its test and the Forge tab's bench tabs go (Temper alone until C2 adds Forge | Temper); `HubLink` gains `bench?: 'forge' | 'temper'` and the Codex sections `patterns` and `essences`, which the Codex ignores until C3 draws them. Client only, on the base bundle.

**Files:**
- Modify: `packages/client/src/features/delve/hub/types.ts`, `hub/codex/CodexTab.tsx`, `hub/forge/ForgeTab.tsx`
- Modify (tests): `packages/client/src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx`, `hub/codex/__tests__/CodexTab.test.tsx`
- Delete: `packages/client/src/features/delve/hub/forge/Fuse.tsx`, `hub/forge/__tests__/Fuse.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx`:

Replace:

```tsx
    expect(rows[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bench-temper')).toHaveAttribute('aria-selected', 'true');
```

with:

```tsx
    expect(rows[0]).toHaveAttribute('aria-pressed', 'true');
```

Replace the lines from `it('a link picks its item and its bench, and a new link moves them', () => {` up to (not including) `it('mid-dive, and in the pause, the forge waits for the dive to end', () => {` with:

```tsx
  it('a link picks its item, and a new link moves it; Alloy Fusion is gone', () => {
    store().setProfile({ ...store().profile, bag: [item('h1', 'helm'), item('h2', 'helm')] });
    const { rerender } = render(<ForgeTab {...props({ link: { tab: 'forge', uid: 'h1' } })} />);
    expect(screen.getAllByTestId('temper-row').at(-2)).toHaveAttribute('aria-pressed', 'true');
    rerender(<ForgeTab {...props({ link: { tab: 'forge', uid: 'h2' } })} />);
    expect(screen.getAllByTestId('temper-row').at(-1)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('bench-fuse')).toBeNull();
    expect(screen.queryByTestId('fuse-bench')).toBeNull();
  });

```

Replace:

```tsx
    expect(screen.queryByTestId('fuse-button')).toBeNull();
    expect(screen.queryByTestId('upgrade-button')).toBeNull();
```

with:

```tsx
    expect(screen.queryByTestId('upgrade-button')).toBeNull();
```

In `packages/client/src/features/delve/hub/codex/__tests__/CodexTab.test.tsx`:

Replace:

```tsx
    expect(screen.queryByTestId('codex-unknown')).toBeNull();
```

with:

```tsx
    expect(screen.queryByTestId('codex-unknown')).toBeNull();
    // Patterns and Essences arrive with stage 4c's C3: until then a link to one is ignored.
    rerender(<CodexTab {...props({ link: { tab: 'codex', section: 'essences' } })} />);
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(15);
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx src/features/delve/hub/codex/__tests__/CodexTab.test.tsx)`
Expected: FAIL, 2 failed: `a link picks its item, and a new link moves it; Alloy Fusion is gone` (`expected <button …> to be null`: the Fuse tab is there) and `a link opens its section` (`Cannot read properties of undefined (reading '0')`: an `essences` link breaks the section's progress).

- [ ] **Step 3: The links, the Codex's guard and Temper alone**

In `packages/client/src/features/delve/hub/types.ts`:

Replace:

```ts
  | { tab: 'forge'; uid?: string; bench?: 'temper' | 'fuse' }
  | { tab: 'codex'; section?: 'legendaries' | 'reactions' | 'records' }
```

with:

```ts
  | { tab: 'forge'; uid?: string; bench?: 'forge' | 'temper' }
  | {
      tab: 'codex';
      section?: 'legendaries' | 'reactions' | 'patterns' | 'essences' | 'records';
    }
```

In `packages/client/src/features/delve/hub/codex/CodexTab.tsx`:

Replace:

```tsx
type Section = 'legendaries' | 'reactions' | 'records';
```

with:

```tsx
type Section = 'legendaries' | 'reactions' | 'records';
// ponytail: Patterns and Essences come with stage 4c's C3; until then a link to one is ignored.
const SECTIONS: readonly Section[] = ['legendaries', 'reactions', 'records'];
```

Replace:

```tsx
  const linked = (l?: HubLink) => (l?.tab === 'codex' ? l.section : undefined);
```

with:

```tsx
  const linked = (l?: HubLink) =>
    l?.tab === 'codex' ? SECTIONS.find((s) => s === l.section) : undefined;
```

In `packages/client/src/features/delve/hub/forge/ForgeTab.tsx`:

Replace:

```tsx
import { Panel, Tabs, type Prompt } from '../../kit';
```

with:

```tsx
import { Panel, type Prompt } from '../../kit';
```

Replace:

```tsx
import { Fuse } from './Fuse';
import { RunePane } from './RunePane';

type BenchId = 'temper' | 'fuse';
```

with:

```tsx
import { RunePane } from './RunePane';
```

Replace:

```tsx
 * The Forge tab: the gear list, the bench (Temper the selected item, or Alloy
 * Fusion) and the rune pane. `{ tab: 'forge', uid, bench }` links pick the item
 * and the bench. Locked while a dive is under way, and in the pause.
```

with:

```tsx
 * The Forge tab: the gear list, the Temper bench on the selected item and the
 * rune pane (stage 4c's C2 adds the Forge bench). `{ tab: 'forge', uid }` links
 * pick the item. Locked while a dive is under way, and in the pause.
```

Replace the lines from `const [bench, setBench] = useState<BenchId>(forgeLink(link)?.bench ?? 'temper');` up to (not including) `useEffect(() => setPrompts(PROMPTS), [setPrompts]);` with:

```tsx
  // A new link (e.g. "Forge it ›" from the Loadout) picks its item.
  const [seen, setSeen] = useState(link);
  if (link !== seen) {
    setSeen(link);
    const uid = forgeLink(link)?.uid;
    if (uid) setSelected(uid);
  }

```

Replace:

```tsx
  // The selected item, or (none yet, or fused away) the first one worn.
```

with:

```tsx
  // The selected item, or (none yet, or salvaged away) the first one worn.
```

Replace:

```tsx
          setSelected(uid);
          setBench('temper');
```

with:

```tsx
          setSelected(uid);
```

Replace the lines from `<>` up to (not including) `</Panel>` with:

```tsx
          item && <Temper key={item.uid} item={item} />
        )}
```

Delete `packages/client/src/features/delve/hub/forge/Fuse.tsx`: `git rm packages/client/src/features/delve/hub/forge/Fuse.tsx`.

Delete `packages/client/src/features/delve/hub/forge/__tests__/Fuse.test.tsx`: `git rm packages/client/src/features/delve/hub/forge/__tests__/Fuse.test.tsx`.

- [ ] **Step 4: Run them to see them pass, then the client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx src/features/delve/hub/codex/__tests__/CodexTab.test.tsx)`
Expected: PASS, 8 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M − 4 tests in G − 1 files pass (Fuse's four tests gone).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/types.ts src/features/delve/hub/codex/CodexTab.tsx src/features/delve/hub/forge/ForgeTab.tsx src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx src/features/delve/hub/codex/__tests__/CodexTab.test.tsx)
git add packages/client/src/features/delve/hub/types.ts packages/client/src/features/delve/hub/codex/CodexTab.tsx packages/client/src/features/delve/hub/forge/ForgeTab.tsx packages/client/src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx packages/client/src/features/delve/hub/codex/__tests__/CodexTab.test.tsx
git commit -m "refactor(client): the Forge tab without Fusion; hub links for the Forge bench and the new Codex sections" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(`git rm` in Step 3 already staged the two deletions.)

### Task 11: The store on save v8

Against the new bundle: `loadDelveProfile` returns the engine's `ParsedDelveProfile`; a save of another version starts afresh with `RESET_NOTICE`, written back at once; the migration notices (`BIND_HINT`, `movesetNotices`, `runeLostNotices`) go; `forge`, `hone`, `imprint`, `refine` and `buyShard` wrap their engine ops (a forged item comes marked new); `salvage` returns the yields; `closeDive` passes the registry; `fuse` goes. `DoorPane` draws the chest for a door that raises gear or essences.

**Files:**
- Modify: `packages/client/src/stores/delveStore.ts`, `packages/client/src/features/delve/stop/DoorPane.tsx`
- Modify (tests): `packages/client/src/stores/delveStore.test.ts`

- [ ] **Step 1: Rebuild the bundle, and see the client break**

Run: `(cd packages/engine && npx tsup)`
Expected: tsup's "Build success" lines.

Run: `(cd packages/client && npx tsc --noEmit -p .)`
Expected: errors in `src/features/delve/stop/DoorPane.tsx` (`Property 'magicFind' does not exist on type 'DoorMods'`), `src/stores/delveStore.ts` (`Module '"@alloy/engine"' has no exported member 'fuseGear'`, the `ParsedDelveProfile` fields, `Expected 2 arguments, but got 1`) and `src/stores/delveStore.test.ts`.

- [ ] **Step 2: The failing tests**

In `packages/client/src/stores/delveStore.test.ts`:

Replace:

```ts
  BIND_HINT,
  DELVE_SAVE_KEY,
  MANUAL_ATTACK_KEY,
  fixNotices,
  loadDelveProfile,
  movesetNotices,
```

with:

```ts
  DELVE_SAVE_KEY,
  MANUAL_ATTACK_KEY,
  RESET_NOTICE,
  fixNotices,
  loadDelveProfile,
```

Replace:

```ts
  runeLostNotices,
} from './delveStore';
```

with:

```ts
} from './delveStore';
```

Delete the lines from `/** The store's save as version 3 (builds, no pair): a Frost Ward and Fire's Bolt and Nova. */` up to (not including) `describe('delveStore', () => {`.

Replace:

```ts
    expect(loadDelveProfile()?.profile.dive?.depth).toBe(1);
  });

  it('falls back to a new profile when the save is corrupt', () => {
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":1,"broken":true}');
```

with:

```ts
    expect(loadDelveProfile()).toMatchObject({ profile: { dive: { depth: 1 } } });
  });

  it('resets a save of another version, and falls back to a new profile when the save is corrupt', () => {
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":7,"broken":true}');
    expect(loadDelveProfile()).toEqual({ reset: true });
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":8,"broken":true}');
```

Replace:

```ts
    expect(useDelveStore.getState().profile).toMatchObject({ scrap, manaDust: dust });
```

with:

```ts
    expect(useDelveStore.getState().profile).toMatchObject({ scrap, manaDust: dust });
    // The crafting yields come with stage 4c's B2: none yet.
    expect(useDelveStore.getState().salvage([])).toMatchObject({
      shards: [],
      patterns: [],
      essences: [],
    });
```

Replace:

```ts
    const saved = loadDelveProfile()!.profile.equipped.weapon!.moveset!.chains;
    expect(saved).toMatchObject({ primary: chain, basic });
```

with:

```ts
    expect(loadDelveProfile()).toMatchObject({
      profile: { equipped: { weapon: { moveset: { chains: { primary: chain, basic } } } } },
    });
```

Replace the lines from `it('reads an older save back migrated, with the moves it fixed', () => {` up to (not including) `// A fresh module and no cached store, as on a page load.` with:

```ts
  it('a save of another version starts afresh: written back at once, with one notice', async () => {
    const old = { ...useDelveStore.getState().profile, version: 7, scrap: 999 };
    localStorage.setItem(DELVE_SAVE_KEY, JSON.stringify(old));
```

Replace the lines from `expect(fresh.getState().notices).toEqual([` up to (not including) `expect(fresh.getState().notices).toEqual([]);` with:

```ts
    expect(fresh.getState().notices).toEqual([RESET_NOTICE]);
    expect(fresh.getState().profile).toMatchObject({ version: 8, scrap: 0 });
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!)).toMatchObject({
      version: 8,
      scrap: 0,
    });
    // The written-back save loads as it is: no second notice.
    (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.delete(
      'delveStore',
    );
    vi.resetModules();
    const fresh = (await import('./delveStore')).useDelveStore;
```

Replace:

```ts
    const fresh = (await import('./delveStore')).useDelveStore;
    expect(fresh.getState().notices).toEqual([]);
```

with:

```ts
    const again = (await import('./delveStore')).useDelveStore;
    expect(again.getState().notices).toEqual([]);
  });

  it('wraps every crafting op of the engine (stage 4c fills them)', () => {
    const s = useDelveStore.getState();
    for (const op of [s.forge, s.hone, s.imprint, s.refine, s.buyShard])
      expect(op).toBeTypeOf('function');
    expect('fuse' in s).toBe(false);
```

Replace:

```ts
    expect(loadDelveProfile()?.profile.pair.primary).toBe('frost');
```

with:

```ts
    expect(loadDelveProfile()).toMatchObject({ profile: { pair: { primary: 'frost' } } });
```

Replace the lines from `"Your Bolt's 1st move used Fire, which isn't in your pair; it now uses Frost",` up to (not including) `it('words the notices plainly: one a skill for its moves that changed the same way', () => {` with:

```ts
      "Your Bolt's 1st move used Fire, which isn't in your pair; it now uses Frost",
    ]);
  });

```

Replace:

```ts
  it('a rune a load-time trim destroys becomes a notice, its socket a Link', async () => {
```

with:

```ts
  it('a load-time trim takes a socket past the cap off: a Link, its rune by the rule, no notice', async () => {
```

Replace the lines from `expect(fresh.getState().notices).toEqual(['Quick I was lost: its socket no longer exists']);` up to (not including) `it('salvage gives a socket back as a Link; its rune follows the pull rule', () => {` with:

```ts
    expect(fresh.getState().notices).toEqual([]);
    expect(fresh.getState().profile.links).toBe(p.links + 1);
  });

```

- [ ] **Step 3: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts)`
Expected: FAIL, 8 failed | 29 passed, among them `expected { reset: true, gainedPair: false } to deeply equal { reset: true }`, `wraps every crafting op of the engine` (`expected undefined to be type of 'function'`), and the tests that build a fresh store (`Cannot read properties of undefined (reading 'links')`: the old store reads migration fields the engine no longer returns).

- [ ] **Step 4: The store and the door**

In `packages/client/src/stores/delveStore.ts`:

Replace:

```ts
  fuseGear,
```

with:

```ts
  forge as engineForge,
  hone as engineHone,
  imprint as engineImprint,
  refine as engineRefine,
  buyShard as engineBuyShard,
```

Replace:

```ts
  type GearItem,
  type GearSlot,
  type ManaPair,
  type ManaType,
```

with:

```ts
  type ForgeRequest,
  type GearItem,
  type GearSlot,
  type HeroStatKey,
  type ManaPair,
  type ManaType,
  type MaterialRef,
```

Replace:

```ts
  type SetChainsOptions,
```

with:

```ts
  type SetChainsOptions,
  type ShardRef,
```

Replace the lines from `* The saved profile (migrated when older, with the moves it fixed), or null;` up to (not including) `/** Shown once when an older save gains a pair: the gear it no longer counts explains the Power drop. */` with:

```ts
 * The saved profile, `{ reset: true }` for a save of another version (no
 * migrations: see the crafting spec), or null with no save or a broken one.
 */
export function loadDelveProfile(): ParsedDelveProfile | null {
  try {
    const raw = localStorage.getItem(DELVE_SAVE_KEY);
    if (!raw) return null;
    return parseDelveProfile(getDelveRegistry(), JSON.parse(raw));
  } catch {
    return null;
  }
}

```

Replace:

```ts
/** Shown once when an older save gains a pair: the gear it no longer counts explains the Power drop. */
export const BIND_HINT =
  'Your gear now counts only for your two elements: bind a second one in the Mana view (Abilities tab) to count more of it';
```

with:

```ts
/** Shown once when a save of another version starts afresh. */
export const RESET_NOTICE = 'The forge changed: your save was reset';
```

Replace the lines from `` return `Your ${owner}'s ${nths} ${noun} used ${manaNames(registry, first.removed)}${clause}; ${uses} ${manaNames(registry, now(first))}`; `` up to (not including) `` /** "Storm now outweighs Fire: Storm is your primary" (`now` is the new primary). */ `` with:

```ts
    return `Your ${owner}'s ${nths} ${noun} used ${manaNames(registry, first.removed)}${clause}; ${uses} ${manaNames(registry, now(first))}`;
  });
}

```

Replace:

```ts
/** The runes a load-time trim destroyed: "Split III was lost: its socket no longer exists". */
export function runeLostNotices(registry: DataRegistry, lost: readonly RuneRef[]): string[] {
  return lost
    .filter((r) => registry.findRune(r.id))
    .map((r) => `${runeName(registry, r)} was lost: its socket no longer exists`);
}

/**
```

with:

```ts
/**
```

Replace:

```ts
  /** Toasts waiting for a Delve screen to show them (session only): overtakes, fixed moves. */
```

with:

```ts
  /** Toasts waiting for a Delve screen to show them (session only): overtakes, fixed moves, a reset save. */
```

Replace:

```ts
  /** Close the finished (or abandoned) dive; a secondary that has overtaken swaps in, with a notice. */
```

with:

```ts
  /**
   * Close the finished (or abandoned) dive (the engine settles an abandoned one); a secondary that
   * has overtaken swaps in, with a notice.
   */
```

Replace:

```ts
  /** Melt bag items; what they gave (their runes back to the pouch, or destroyed, by the rule). */
```

with:

```ts
  /**
   * Melt bag items; what they gave (their runes back to the pouch, or destroyed, by the rule; their
   * shards, patterns and essences: see the crafting spec's Salvage).
   */
```

Replace:

```ts
    destroyed: RuneRef[];
```

with:

```ts
    destroyed: RuneRef[];
    shards: ShardRef[];
    patterns: string[];
    essences: string[];
```

Replace:

```ts
  fuse: (uids: string[]) => ProfileActionResult;
```

with:

```ts
  /** Forge an item at the bench (see the crafting spec); it comes marked new. */
  forge: (req: ForgeRequest) => ProfileActionResult;
  /** Hone affix line `line` of item `uid`. */
  hone: (uid: string, line: number) => ProfileActionResult;
  /** Imprint `shard` on affix line `line` of item `uid`. */
  imprint: (uid: string, line: number, shard: ShardRef) => ProfileActionResult;
  /** Refine a bar, a flux or a shard into one of the next grade. */
  refine: (what: MaterialRef) => ProfileActionResult;
  /** Buy a tier I shard at the shard bench. */
  buyShard: (stat: HeroStatKey) => ProfileActionResult;
```

Replace:

```ts
  // A migrated save is written back at once.
  if (loaded) saveProfile(loaded.profile);

  return {
    profile: loaded?.profile ?? createDelveProfile(getDelveRegistry(), freshSeed()),
```

with:

```ts
  // A save of another version starts afresh (no migrations), with a notice; either is written back at once.
  const profile =
    loaded && 'profile' in loaded
      ? loaded.profile
      : createDelveProfile(getDelveRegistry(), freshSeed());
  if (loaded) saveProfile(profile);

  return {
    profile,
```

Replace the lines from `notices: loaded` up to (not including) `unsocket: loadUnsocket(),` with:

```ts
    notices: loaded && 'reset' in loaded ? [RESET_NOTICE] : [],
    bindDeclined: [],
    chainDraft: null,
```

Replace:

```ts
      const res = resolveOvertake(registry(), engineCloseDive(get().profile));
```

with:

```ts
      const res = resolveOvertake(registry(), engineCloseDive(registry(), get().profile));
```

Replace:

```ts
      const { scrap, dust, links, runes, destroyed } = res;
      return { scrap, dust, links, runes, destroyed };
```

with:

```ts
      const { scrap, dust, links, runes, destroyed, shards, patterns, essences } = res;
      return { scrap, dust, links, runes, destroyed, shards, patterns, essences };
```

Replace:

```ts
    fuse: (uids) => {
      const res = applyResult(fuseGear(registry(), get().profile, uids, pull()));
      if (res.ok && res.item)
        set({ newUids: { ...withoutUids(get().newUids, uids), [res.item.uid]: true } });
      return res;
    },
```

with:

```ts
    forge: (req) => {
      const res = applyResult(engineForge(registry(), get().profile, req));
      if (res.ok && res.item) set({ newUids: { ...get().newUids, [res.item.uid]: true } });
      return res;
    },

    hone: (uid, line) => applyResult(engineHone(registry(), get().profile, uid, line)),

    imprint: (uid, line, shard) =>
      applyResult(engineImprint(registry(), get().profile, uid, line, shard)),

    refine: (what) => applyResult(engineRefine(registry(), get().profile, what)),

    buyShard: (stat) => applyResult(engineBuyShard(registry(), get().profile, stat)),
```

In `packages/client/src/features/delve/stop/DoorPane.tsx`:

Replace:

```tsx
 * monster, or the chest for a door that raises Magic Find), its depth and a boss mark; Extract,
```

with:

```tsx
 * monster, or the chest for a door that raises gear or essences), its depth and a boss mark; Extract,
```

Replace:

```tsx
          const treasure = (door.mods.magicFind ?? 0) > 0;
```

with:

```tsx
          const treasure = (door.mods.gear ?? 1) > 1 || (door.mods.essence ?? 1) > 1;
```

- [ ] **Step 5: Run them to see them pass, then the client and its build**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts)`
Expected: PASS, 37 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M − 6 tests in G − 1 files pass (**1169 tests in 146 files** at the base's counts).

Run: `(pnpm -F @alloy/client build)`
Expected: `tsc -b` silent, then Vite's `✓ built in …`.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-craft-a
(cd packages/client && npx prettier --write --end-of-line auto src/stores/delveStore.ts src/stores/delveStore.test.ts src/features/delve/stop/DoorPane.tsx)
git add packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts packages/client/src/features/delve/stop/DoorPane.tsx
git commit -m "feat(client): the store on save v8: the reset notice, the crafting actions, closeDive with the registry" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## The gate

After Task 11, from the worktree root:

```bash
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
(pnpm -F @alloy/client build)
```

Expected: both typechecks clean; the engine suite N + 8 tests in F + 4 files (the pacing rails pass unchanged); the client suite M − 6 in G − 1; the build succeeds. Old saves reset with the toast (Task 11's store tests). The Delve E2E is Phase C's and D's to run; its fixtures build their saves with `createDelveProfile`, so they write version 8.
