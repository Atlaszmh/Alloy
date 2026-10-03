# Delve component crafting (stage 4c) · B1: drops and banking — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Materials become the main loot and a dive's haul is at risk until it settles: kills drop bars, flux, shards, Mana Dust, Links, essences, patterns and scrap pickups from `delve.drops`' tables on their own stream; gear drops only from elites (at `gearChance`) and bosses; pickups ride the floor's haul, a cleared floor banks it into the dive, and the dive settles once (extract keeps it all; a death or an abandon loses the floor's haul and `deathLoss` of what was banked); stops spend what the dive banked first.

**Architecture:** `arpg/material-drops.ts` holds the pure roll (`rollMaterialDrops`: tables by foe kind, door multipliers, metal by depth, flux grades and shard tiers by depth with one Find/`shardTier` bump, biome and door shard leanings, the essence chance × Lucky Charm, the first boss's guarantee, unknown patterns) and `dropMaterials` (kill → pickups on `world.materialRng`, the kill's scrap as `scrapPickups`). `loot/drops.ts` keeps gear: no gear from normals, an elite's at `gearChance` × the door's `gear`, a boss's `boss.gear` items at `bossMinRarity`; Find and `legendaryBoost` leave gear rarity. `arpg/step.ts`'s magnet pulls every drop but gear, runes, patterns and essences, at `delve.drops`' speeds and pickup delay; material pickups gather in `world.pending.haul`, patterns in `pending.patterns`. `delve/dive.ts`: `bankWorld` puts gear in the bag and learns patterns at once and moves everything else into `dive.haul` (a world's first bank starts the haul afresh, `WorldPending.newFloor`); `completeFloor` moves the haul into `dive.banked` and counts the first boss's essence as given; `settleDive` runs once a dive (`dive.settled`) from `extractDive`, `failFloor` and `closeDive`. `delve/stops.ts` pools the banked scrap, Mana Dust, Links and runes with the stockpile and takes a stop's price from `banked` first.

**Tech Stack:** TypeScript 5.7, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-02-delve-component-crafting-design.md` (authoritative): "Drops and the economy", "Banking and death", "Arena and pickups", decisions S1, S2, S3, S5, S9, the Tests section; the B1 row of "Phases and parallel areas". Phase A: `01-contract.md` in this folder ("What Phase A implements, and what it leaves", "For the areas", its review notes). The overview is `00-overview.md`.

---

## Base

- **Starts from:** `craft/main` at `a53a85f` (Phase A merged), in this area's worktree `C:/Projects/alloy-craft-b1` on branch `craft/b1`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-craft-b1 -Branch craft/b1 -Base craft/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-craft-b1` in Git Bash.
- **Anchors:** every edit was generated from, and checked against, `craft/main` at `a53a85f`: applied in this plan's order, task by task, they give exactly the files the runs below were made on (see "Checked on a scratch copy").
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-craft-b1
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the engine suite reads **1661 passed | 5 skipped** tests in **88 passed | 1 skipped** files (about 20 s, the pacing rails included); the client suite **1169 tests in 146 files**. Call them **N** engine tests in **F** files; each task below says where they go. The client is never edited here.

## Files

| File | Change |
|---|---|
| `packages/engine/src/arpg/material-drops.ts` | `MaterialDropContext`, `MaterialDrops`, `rollMaterialDrops` (Task 1); `dropMaterials(ctx, m, scrap)` filled (Task 3) |
| `packages/engine/src/types/arpg.ts` | `WorldPending.haul`, `patterns`, `newFloor` (Task 2); `DropKind` `'pattern'`, `Drop.pattern`, the `pickup` event's `pattern`, `ArpgWorld.materialRng`, `LootContext.firstEssence`'s doc (Task 3) |
| `packages/engine/src/arpg/world.ts` | `emptyPending(newFloor)` (Task 2); `materialRng` forked `materials:<nextUid>` (Task 3) |
| `packages/engine/src/delve/dive.ts` | `bankWorld` → the haul, patterns learned, essences seen, `BankResult.patterns`; `completeFloor` haul → banked; `settleDive`; `failFloor`, `extractDive`, `closeDive` settle (Task 2); the loot context's patterns copied, the first boss's essence given when its floor banks (Task 3) — hand-edited, never formatted |
| `packages/engine/src/arpg/combat.ts` | `killMonster` drops materials and its scrap as pickups (no scrap credited on the kill); the forced legendary goes (Task 3); `dropLoot`'s context `gear` (Task 4) |
| `packages/engine/src/arpg/step.ts` | the magnet: gear, runes, patterns and essences walked over, everything else pulled; `magnetSpeed`, `vacuumSpeed`, `pickupDelay` from `delve.drops`; material and pattern pickups (Task 3) |
| `packages/engine/src/loot/drops.ts` | `GEAR_TODAY` goes: `gearCount` from `delve.drops`; `DropContext.gear`; `dropLuck` without Find; no `legendaryBoost` on gear (Task 4) — hand-edited, never formatted |
| `packages/engine/src/delve/stops.ts` | `pooled` / `unpool`: `stopKinds`, `rollStop` and `takeStop` count and spend `dive.banked` first (Task 5) |
| `packages/engine/tests/delve-material-drops.test.ts` (new) | the tables, doors, depth, Find and leanings (Task 1); drops in the world (Task 3) |
| `packages/engine/tests/delve-banking.test.ts` (new) | banking and settling (Task 2, with B2's skipped auto-salvage test); the first boss's essence and a seeded dive (Task 3) |
| `packages/engine/tests/delve-dive.test.ts` | banking into the haul, the extract and the death settle (Task 2); the first boss drops an essence (Task 3) |
| `packages/engine/tests/delve-runes.test.ts` | runes bank into the haul (Task 2); a rune found this dive socketed at the stop (Task 5) |
| `packages/engine/tests/fixtures/arena.ts` | the loot context's `firstEssence` and `patterns` (Task 3) |
| `packages/engine/tests/delve-loot.test.ts` | the gear tables (Task 4) |
| `packages/engine/tests/arpg-sim.test.ts` | the floor-clear vacuum brings materials and scrap (Task 4) |
| `packages/engine/tests/delve-pair.test.ts` | the pre-pair GOLDEN drawn as elites drew then (Task 4) |
| `packages/engine/tests/delve-movesets.test.ts` | the items hash re-pinned to the drop tables' gear (Task 4) |
| `packages/engine/tests/delve-pacing.test.ts` | two rails `.skip` with `ponytail:` notes naming B3 (Task 4) — hand-edited, never formatted |
| `packages/engine/tests/delve-stops.test.ts` | stops count and spend the banked Links and scrap first (Task 5) |

No other area's file is edited: `loot/materials.ts`, `loot/item-generator.ts`, `delve/profile.ts` (B2), `delve/autopilot.ts` (B3), `index.ts` (`arpg/material-drops.ts` is already exported whole) and the client stay as they are.

## What this area gives the others

- **Drops.** A material drop is a `Drop` of kind `'material'` (`material: MaterialRef`, `amount` its count: 1 for a bar, flux, shard or essence; the count for Mana Dust and Links). A pattern drop is a new kind, `'pattern'` (`pattern`: the base id). Scrap drops are `'scrap'` pickups (`drops.scrapPickups[kind]` of them, together the kill's scrap; the `death` event still carries that total). The `pickup` event carries `material` / `pattern`. Gear (`'item'`), runes, patterns and essences are walked over; everything else magnets in.
- **Banking.** `bankWorld` banks gear into the bag and learns patterns at once (`BankResult.patterns`: those new to the hero), and moves materials, scrap, Mana Dust, Links and runes into `dive.haul` (`BankResult.runes` still lists the runes picked up); `essencesSeen` grows as an essence banks. `completeFloor` moves `haul` into `banked`. `profile.scrap`, `manaDust`, `links`, `runes` and `materials` change only when the dive settles (and at a stop).
- **The settle.** `settleDive(registry, profile, outcome)` is a no-op on a dive already `settled`; otherwise it stocks `banked` (net) into the profile and sets `settled`, `haul` empty, `banked` what reached the stockpile and `lost` (an extract: null; a death or an abandon: the floor's haul plus the share). It never touches `phase`. `extractDive` and `failFloor` settle; `closeDive` settles an abandon while the dive is `fighting` or `choosing`, and nothing for one already settled.
- **Stops** read and spend `banked` with the stockpile (`stopKinds`, `takeStop`).

## Cross-area needs

**X1 · B2 (`delve/profile.ts`, `loot/salvage-yield.ts`).** `bankWorld` hands `addLootToBag` the profile with the floor's haul already reset when the world is new, and reads the dive back from the profile `addLootToBag` returns (`const dive = next.dive!`), so mid-dive `applySalvage` must write its yields into that profile's `dive.haul` (patterns into `profile.patterns` at once) and `addLootToBag` must return it. `BankResult.scrap`, `dust` and `links` keep adding `bagged.scrap`, `dust`, `links`; `bankWorld` never reads `BagInsertResult.shards`, `patterns` or `essences`. Task 2 leaves `delve-banking.test.ts`' "mid-dive auto-salvage yields (scrap, a shard) go to the floor's haul, not the stockpile" as `it.skip` with a `ponytail:` note: it fails on today's `addLootToBag` and passes once `applySalvage` lands.

**X2 · C1 (arena and dive client).**
1. Draw the new drop kind `'pattern'` (walk-over, a plaque) and essences (`material.kind === 'essence'`: walk-over, the legendary-orange plaque); every other material drop magnets in. `ArenaRenderer`'s `"+N ⚙"` on an elite's or a boss's `death` still reads the kill's scrap, which now bursts as pickups.
2. `BankResult.patterns` names the patterns a bank taught, for a "Pattern learned" toast.
3. After a settle, `dive.banked` is what reached the stockpile and `dive.lost` the floor's haul plus the share (the client never subtracts). An abandon can settle first (`settleDive(registry, profile, 'abandon')`, the phase untouched) for the summary; `closeDive` then settles nothing more.
4. "Anvil · floor restarts": the replayed floor's haul is dropped at its world's first bank (`WorldPending.newFloor`), so until that bank `dive.haul` still shows the abandoned attempt's pickups; the purse can count `haul` only while the arena runs, or bank once at floor start.
5. E2E D02 waits for gear on floor 1: normal foes no longer drop gear. It needs an elite (Champion's Den) or a seeded save with a bag item.

**X3 · B3 (`tests/delve-pacing.test.ts`, `delve/autopilot.ts`).** Task 4 skips two rails with `ponytail:` notes naming B3: "legendaries arrive without completing the codex early" (legendaries now come as essences the autopilot can't forge yet) and "no pair runs away or stalls" (with gear only from elites and bosses the unforging autopilot's depths spread out). B3 un-skips both. The autopilot's `takeBestStop` gets the pooled `stopKinds` for free; `closeDive(registry, p)` after an extracted or dead dive settles nothing more.

**X4 · The integrator.**
1. `tests/delve-movesets.test.ts`' items hash: Task 4 re-pins it to `[204, 'f19d30c9']` (B1 alone); B2 re-pins the same line for its rolls. At merge take either side and re-pin to what the test prints on the merged tree.
2. `tests/delve-pair.test.ts`' GOLDEN ("with an empty pair, the seeded drop streams are unchanged") now draws elite gear as it was drawn when GOLDEN was recorded (2–3 items, `rollRarity`, `generateItem`); if B2's roll changes `generateItem`'s draws before the mana and base rolls, re-record it.
3. Un-skip X1's test after B1 and B2 merge.
4. `loot/item-generator.ts`' `RarityRollContext.legendaryBoost` has no caller left after Task 4 (B2 keeps it with a `ponytail:` note); delete it once both merge.
5. Optional, if C1 wants salvage-taught patterns in the same toast: in `bankWorld`'s return, `patterns,` becomes `patterns: [...patterns, ...bagged.patterns],` (B2's `BagInsertResult.patterns`).

## Where the spec left room

1. **Pattern drops** have no `MaterialRef` kind: they are a new `DropKind`, `'pattern'`, walked over like gear and learned when the pickup banks (S1: learned at once). A dropped pattern joins `world.loot.patterns`, so it doesn't drop twice on a floor.
2. **"Materials always magnet in"** reads as: every drop but gear, runes, patterns and essences is pulled inside `hero.magnetRadius`, as motes and scrap are today; the floor-clear vacuum still pulls everything.
3. **Find and the door's `shardTier`** give one bump, never two: a flux or shard comes one grade or tier up at `1 − (1 − f)(1 − d)`, `f = min(find.cap, Find / 100 × find.perPoint)`, `d` the door's `shardTier`, at most the top grade or the affix's last tier (`shardTiersOf`).
4. **Which multiplier applies where.** The door's `materials` multiplies every `DropEntry` (bars, Mana Dust, shards, Links, flux; at most 1); flux also × the door's `flux`; an elite's gear × the door's `gear` (a boss always drops `boss.gear`); the essence chance × the door's `essence` × Lucky Charm's `legendaryBoost`; `patternChance` is never multiplied.
5. **Counts and pickups.** A bar, flux or shard is one pickup each (`amount` 1); Mana Dust and Links are one pickup of the rolled count. The kill's scrap splits into `min(scrapPickups[kind], scrap)` pickups of at least 1, differing by at most 1.
6. **The tier roll.** The tiers or grades a depth reaches are those whose `shardTierDepths` / `fluxGradeDepths` entry it has reached (at least the first, at most the affix's tier count); one is picked by `tierWeights`, then the bump.
7. **Metal by depth** reads the floor's depth as its item level (boss floors too); `metalUpChance` moves one metal up, at most Voidforged.
8. **Essences.** A random essence is uniform over all legendaries; the first boss's is uniform over those whose `slots` include a learned pattern's slot (all, if none would), and it replaces that boss's random essence roll. `dropMaterials` clears `world.loot.firstEssence` when it drops, so a second boss on the floor doesn't repeat it; `completeFloor` sets `firstEssenceGiven` only when the floor's haul holds an essence (an essence never picked up, or a death before the floor banks, grants it again).
9. **`beginFloor` clears the haul.** `beginFloor` returns a world, not a profile, so the world carries the rule: its first bank (`bankWorld`, also inside `completeFloor` and `failFloor`) starts `dive.haul` afresh (`WorldPending.newFloor`). Every path a floor starts by gets the spec's behaviour; see X2.4.
10. **The settle's stream and order:** `new SeededRNG(profile.seed).fork('death:' + dive.seed)`, one `stochasticRound` per entry in a fixed order (metals, flux, shards by affix then tier, scrap, Mana Dust, Links, runes by id then tier; keys sorted). Essences are left out of the share.
11. **What a stop spends.** Scrap, Mana Dust, Links and runes (stops never spend materials): `banked` first, then the stockpile; a stop's gains (none today) would go to the stockpile.
12. **Dive counters.** `dive.scrapEarned` still counts scrap picked up and salvaged, `dustEarned` and `linksEarned` add the Mana Dust and Links picked up; `stats.scrapEarned` now grows when scrap reaches the stockpile (`stockHaul`), at the settle.
13. **Boss gear:** every one of a boss's `boss.gear` items is at least `loot.bossMinRarity` ("applies to every boss").
14. **`world.loot.patterns`** is copied in `beginFloor` (Phase A's review note), and `dropMaterials` replaces the array rather than pushing, so no caller's array is mutated.
15. **Task order.** Banking and the settle (Task 2) land before the new drops (Tasks 3–4) on today's drop flow: every task's commit keeps the whole suite green, the pacing rails included; only Task 4 (no gear from normal foes) needs B3's two skips.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `craft/b1`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-craft-b1`.
- **Line endings:** the worktree checks the engine's files out CRLF; keep each file's own (the Edit tool does). Files written whole ("Create", "Overwrite") come out LF, which git stores the same. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** the commit blocks format only files a task creates or files that pass `prettier --check` at the base, and the code below is already formatted (checked). **Never formatted, only hand-edited:** `packages/engine/src/loot/drops.ts`, `src/delve/dive.ts` (not clean at the base) and `tests/delve-pacing.test.ts`. Never touch `tests/delve-chain-feel.test.ts` (raw 0xD7 byte).
- **How the edits read** (the 4a plan's language): "Replace: A with: B" is one Edit (old A, new B). "In `f`, replace the lines from `A` up to (not including) `B` with: C" is one Edit whose old text runs from the start of the line that reads `A` (ignoring its indentation) to the end of the line before the one that reads `B`, and whose new text is C. "Append at the end of `f`:" adds a blank line and the block after the last line. "Create `f`:" and "Overwrite `f`:" are a Write. Within a file, apply its edits top to bottom; every anchor is unique in its file at that point.
- **Import cycles:** `delve/dive.ts`, `profile.ts`, `stops.ts`, `pair.ts`, `hero-stats.ts`, `moveset.ts` import each other: read such an import only inside a function. `loot/materials.ts` imports only types; `arpg/material-drops.ts` imports `combat.ts` for a type only.
- **Every task runs the whole engine suite** (about 20 s, the pacing rails included) and the engine typecheck. Vitest doesn't type-check tests. The client is checked once, in Verification, against the rebuilt bundle.
- **Checked on a scratch copy:** `git archive` of `craft/main` at `a53a85f` with junctioned `node_modules`; every task's edits applied by a script that checks each anchor (unique, and each range's two lines), tests first and source second, so every FAIL and PASS below was run as written; the typecheck, the whole suite and `prettier --check` of every file a commit block formats were run after each task.

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

## Chunk 1: The material rolls

### Task 1: `rollMaterialDrops`: the drop tables, doors, depth, Find and leanings

The pure roll behind every material drop, with nothing wired yet: by the foe's kind, each `delve.drops` entry drops at its chance × the door's `materials` (flux × its `flux` too), at most 1, then a uniform count; bars are the floor's metal (one up at `metalUpChance`); flux grades and shard tiers come by depth with one Find/`shardTier` bump; shard affixes lean by biome, door and the biome's element; a boss rolls an essence (or takes the first boss's guarantee); elites and bosses may drop a pattern the hero doesn't know. `dropMaterials` stays Phase A's stub until Task 3.

**Files:**
- Create: `packages/engine/tests/delve-material-drops.test.ts`
- Overwrite: `packages/engine/src/arpg/material-drops.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-material-drops.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  rollMaterialDrops,
  type MaterialDropContext,
  type MaterialDrops,
} from '../src/arpg/material-drops.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { FLUX_GRADES, type MaterialRef } from '../src/types/crafting.js';
import type { DoorMods } from '../src/types/delve.js';
import { bal, registry } from './fixtures/arena.js';

const drops = bal.drops;
const BASE: MaterialDropContext = {
  depth: 1,
  kind: 'normal',
  biomeId: 'cinder_mines',
  biomeMana: 'fire',
  door: null,
  find: 0,
  legendaryBoost: 1,
  firstEssence: false,
  patterns: ['sword', 'cuirass', 'dagger'],
};
const N = 4000;

/** `n` foes' rolls, seeds 0 to n − 1. */
function roll(over: Partial<MaterialDropContext>, n = N): MaterialDrops[] {
  return Array.from({ length: n }, (_, s) =>
    rollMaterialDrops(registry, { ...BASE, ...over }, new SeededRNG(s)),
  );
}
const door = (mods: DoorMods) => ({ ...registry.getDoor('winding'), mods });
const all = (rolls: MaterialDrops[]) => rolls.flatMap((r) => r.materials);
const of = <K extends MaterialRef['kind']>(rolls: MaterialDrops[], kind: K) =>
  all(rolls).filter((m) => m.material.kind === kind) as {
    material: Extract<MaterialRef, { kind: K }>;
    amount: number;
  }[];
/** The share of foes that dropped any `kind`. */
const rate = (rolls: MaterialDrops[], kind: MaterialRef['kind']) =>
  rolls.filter((r) => r.materials.some((m) => m.material.kind === kind)).length / rolls.length;

describe('material drop tables', () => {
  it('a normal foe drops bars, Mana Dust, shards and Links at its chances; never flux, essences or patterns', () => {
    const rolls = roll({});
    expect(rate(rolls, 'metal')).toBeCloseTo(drops.normal.bars.chance, 1);
    expect(rate(rolls, 'dust')).toBeCloseTo(drops.normal.dust.chance, 1);
    expect(rate(rolls, 'shard')).toBeCloseTo(drops.normal.shards.chance, 1);
    expect(rate(rolls, 'links')).toBeLessThan(0.03);
    expect(of(rolls, 'flux')).toEqual([]);
    expect(of(rolls, 'essence')).toEqual([]);
    expect(rolls.every((r) => r.pattern === null)).toBe(true);
  });

  it('counts are uniform in the entry: bars and shards one pickup each, Dust and Links one pickup of the count', () => {
    const rolls = roll({ kind: 'elite' });
    for (const r of rolls) {
      const bars = r.materials.filter((m) => m.material.kind === 'metal');
      expect(bars.length).toBeLessThanOrEqual(drops.elite.bars.count[1]);
      expect(bars.every((m) => m.amount === 1)).toBe(true);
      const dust = r.materials.filter((m) => m.material.kind === 'dust');
      expect(dust.length).toBeLessThanOrEqual(1);
      for (const d of dust) {
        expect(d.amount).toBeGreaterThanOrEqual(drops.elite.dust.count[0]);
        expect(d.amount).toBeLessThanOrEqual(drops.elite.dust.count[1]);
      }
    }
    expect(rate(rolls, 'flux')).toBeCloseTo(drops.elite.flux.chance, 1);
  });

  it('a boss always drops flux and shards, and an essence at its chance × Lucky Charm × the door', () => {
    const rolls = roll({ kind: 'boss' });
    expect(rate(rolls, 'flux')).toBe(1);
    expect(rate(rolls, 'shard')).toBe(1);
    expect(rate(rolls, 'essence')).toBeCloseTo(drops.boss.essenceChance, 1);
    expect(rate(roll({ kind: 'boss', legendaryBoost: 2 }), 'essence')).toBeCloseTo(
      drops.boss.essenceChance * 2,
      1,
    );
    expect(rate(roll({ kind: 'boss', door: door({ essence: 1.5 }) }), 'essence')).toBeCloseTo(
      drops.boss.essenceChance * 1.5,
      1,
    );
    const ids = new Set(of(rolls, 'essence').map((m) => m.material.essence));
    expect(ids.size).toBeGreaterThan(3);
    for (const id of ids) expect(registry.getLegendary(id)).toBeDefined();
  });

  it("the first boss's guarantee: an essence whose legendary fits a known pattern's slot, and an epic flux", () => {
    const known = ['ring'];
    for (const r of roll({ kind: 'boss', firstEssence: true, patterns: known }, 50)) {
      const [essence] = of([r], 'essence');
      expect(registry.getLegendary(essence.material.essence).slots).toContain('ring');
      expect(of([r], 'flux').some((m) => m.material.grade === 'epic')).toBe(true);
    }
  });

  it('elites and bosses drop a pattern the hero does not know, at their chance; none once every one is known', () => {
    const rolls = roll({ kind: 'elite' });
    const patterns = rolls.flatMap((r) => (r.pattern ? [r.pattern] : []));
    expect(patterns.length / N).toBeCloseTo(drops.elite.patternChance, 1);
    for (const id of patterns) expect(BASE.patterns).not.toContain(id);
    const every = registry.getDelveData().bases.map((b) => b.id);
    expect(roll({ kind: 'boss', patterns: every }, 200).every((r) => r.pattern === null)).toBe(
      true,
    );
  });
});

describe('doors, depth and Find', () => {
  it("the door's materials multiply every entry's chance, at most 1 (the Shrine halves, the Swarm adds 30%)", () => {
    expect(rate(roll({ door: door({ materials: 0.5 }) }), 'metal')).toBeCloseTo(
      drops.normal.bars.chance * 0.5,
      1,
    );
    expect(rate(roll({ door: door({ materials: 1.3 }) }), 'metal')).toBeCloseTo(
      drops.normal.bars.chance * 1.3,
      1,
    );
    expect(rate(roll({ door: door({ materials: 20 }) }, 200), 'metal')).toBe(1);
    expect(rate(roll({ kind: 'elite', door: door({ flux: 1.5 }) }), 'flux')).toBeCloseTo(
      drops.elite.flux.chance * 1.5,
      1,
    );
  });

  it("a bar is the floor's metal, the next one up at metalUpChance", () => {
    const bars = of(roll({ door: door({ materials: 20 }) }), 'metal').map((m) => m.material.metal);
    const up = bars.filter((m) => m === 'iron').length / bars.length;
    expect(bars.every((m) => m === 'rusty' || m === 'iron')).toBe(true);
    expect(up).toBeCloseTo(drops.metalUpChance, 1);
    const deep = of(roll({ depth: 12, door: door({ materials: 20 }) }, 200), 'metal');
    expect(new Set(deep.map((m) => m.material.metal))).toEqual(new Set(['steel', 'mithril']));
  });

  it('shard tiers and flux grades come by depth, the lower ones likelier', () => {
    const shallow = roll({ kind: 'boss' });
    expect(of(shallow, 'shard').every((m) => m.material.tier === 1)).toBe(true);
    expect(of(shallow, 'flux').every((m) => m.material.grade === 'uncommon')).toBe(true);
    const deep = roll({ kind: 'boss', depth: 30 });
    const tiers = of(deep, 'shard').map((m) => m.material.tier);
    expect(new Set(tiers)).toEqual(new Set([1, 2, 3, 4, 5]));
    const count = (t: number) => tiers.filter((x) => x === t).length;
    expect(count(1)).toBeGreaterThan(count(2));
    expect(count(2)).toBeGreaterThan(count(3));
    const grades = of(deep, 'flux').map((m) => m.material.grade);
    expect(new Set(grades)).toEqual(new Set(FLUX_GRADES));
  });

  it("Find and the door's shardTier bring a shard or flux one tier up, never past the affix's last", () => {
    const tierUp = (rolls: MaterialDrops[]) => {
      const shards = of(rolls, 'shard');
      return shards.filter((m) => m.material.tier === 2).length / shards.length;
    };
    expect(tierUp(roll({ kind: 'boss' }))).toBe(0);
    const cap = drops.find.cap;
    const find = (cap / drops.find.perPoint) * 100;
    expect(tierUp(roll({ kind: 'boss', find }))).toBeCloseTo(cap, 1);
    expect(tierUp(roll({ kind: 'boss', door: door({ shardTier: 0.35 }) }))).toBeCloseTo(0.35, 1);
    // Both: one tier up at 1 − (1 − Find's) × (1 − the door's), never two.
    const both = roll({ kind: 'boss', find, door: door({ shardTier: 0.35 }) });
    expect(tierUp(both)).toBeCloseTo(1 - (1 - cap) * 0.65, 1);
    expect(of(both, 'shard').every((m) => m.material.tier <= 2)).toBe(true);
    const flux = of(roll({ kind: 'boss', door: door({ shardTier: 1 }) }, 200), 'flux');
    expect(flux.every((m) => m.material.grade === 'magic')).toBe(true);
    // An Attune shard has two tiers: at depth 30, all bumped, none past II.
    const attune = of(roll({ kind: 'boss', depth: 30, door: door({ shardTier: 1 }) }), 'shard');
    for (const { material } of attune.filter((m) => m.material.stat.endsWith('Attune')))
      expect(material.tier).toBe(2);
  });

  it("biomes and doors lean the shards: the biome's element and families weigh more", () => {
    const share = (rolls: MaterialDrops[], pick: (stat: string) => boolean) => {
      const shards = of(rolls, 'shard');
      return shards.filter((m) => pick(m.material.stat)).length / shards.length;
    };
    const fire = (s: string) => s === 'firePower' || s === 'fireAttune';
    const cinder = roll({ kind: 'boss' });
    const frost = roll({ kind: 'boss', biomeId: 'frostvault', biomeMana: 'frost' });
    expect(share(cinder, fire)).toBeGreaterThan(1.5 * share(frost, fire));
    const { families } = registry.getCraftingData();
    const sustain = (s: string) => families[s as keyof typeof families] === 'sustain';
    const shrine = { ...registry.getDoor('shrine'), mods: {} };
    expect(share(roll({ kind: 'boss', door: shrine }), sustain)).toBeGreaterThan(
      1.2 * share(cinder, sustain),
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-material-drops.test.ts)`
Expected: FAIL, 10 tests, each `TypeError: (0 , rollMaterialDrops) is not a function`.

- [ ] **Step 3: The roll**

Overwrite `packages/engine/src/arpg/material-drops.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import { weightedPick } from '../loot/item-generator.js';
import { metalAt, shardTiersOf } from '../loot/materials.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { MonsterEntity, MonsterKind } from '../types/arpg.js';
import {
  FLUX_GRADES,
  type DropEntry,
  type DropsBalance,
  type MaterialRef,
  type MetalId,
} from '../types/crafting.js';
import type { DoorDef } from '../types/delve.js';
import type { ManaType } from '../types/mana.js';
import type { SimCtx } from './combat.js';

/**
 * A slain foe's materials (see the crafting spec's drop tables): the rolls
 * (`rollMaterialDrops`, pure) and the pickups that burst onto the floor
 * (`dropMaterials`), all on the world's own stream.
 */

/** What a foe's material rolls read: the floor, the door, the hero's Find and what it knows. */
export interface MaterialDropContext {
  depth: number;
  kind: MonsterKind;
  biomeId: string;
  /** The biome's element: its `*Power` and `*Attune` shards weigh `drops.biomeElementWeight`. */
  biomeMana: ManaType;
  /** The door taken into the floor (its multipliers and shard leanings), or null. */
  door: DoorDef | null;
  /** Total Find in percentage points (gear + the door's `find`). */
  find: number;
  /** Lucky Charm's: multiplies the essence chance. */
  legendaryBoost: number;
  /** The first boss's guarantee holds: a boss drops a fitting essence and an epic flux. */
  firstEssence: boolean;
  /** The patterns the hero knows: a pattern drop is one it doesn't. */
  patterns: string[];
}

export interface MaterialDrops {
  /** One per pickup: a bar, flux or shard each; Mana Dust and Links one pickup of their count. */
  materials: { material: MaterialRef; amount: number }[];
  /** A pattern the hero doesn't know, or null. */
  pattern: string | null;
}

/** The bar a floor at `depth` drops: its item level's metal, the next one up at `drops.metalUpChance`. */
function rollMetal(registry: DataRegistry, depth: number, rng: SeededRNG): MetalId {
  const metals = registry.getCraftingData().metals;
  const at = metals.indexOf(metalAt(registry, depth));
  const up = rng.next() < registry.getDelveBalance().drops.metalUpChance ? 1 : 0;
  return metals[Math.min(metals.length - 1, at + up)].id;
}

/**
 * A tier (1 up) a floor at `depth` drops: one of those `depths` reach (at most
 * `max`), weighted by `drops.tierWeights`, then one up at chance `up`, at most `max`.
 */
function rollTier(
  registry: DataRegistry,
  depths: number[],
  depth: number,
  max: number,
  up: number,
  rng: SeededRNG,
): number {
  const { tierWeights } = registry.getDelveBalance().drops;
  const reached = Math.min(max, Math.max(1, depths.filter((d) => depth >= d).length));
  const tiers = Array.from({ length: reached }, (_, i) => i + 1);
  const tier = weightedPick(tiers, (t) => tierWeights[t - 1] ?? 0, rng);
  return Math.min(max, tier + (rng.next() < up ? 1 : 0));
}

/** A shard: its affix by weight × the biome's and the door's family leanings (× the biome element's), its tier by depth. */
function rollShard(
  registry: DataRegistry,
  ctx: MaterialDropContext,
  up: number,
  rng: SeededRNG,
): MaterialRef {
  const drops = registry.getDelveBalance().drops;
  const { families } = registry.getCraftingData();
  const biome = drops.biomeShardWeights[ctx.biomeId] ?? {};
  const door = (ctx.door && drops.doors[ctx.door.id]) ?? {};
  const own: string[] = [`${ctx.biomeMana}Power`, `${ctx.biomeMana}Attune`];
  const affix = weightedPick(
    registry.getDelveData().affixes,
    (a) =>
      a.weight *
      (biome[families[a.stat]] ?? 1) *
      (door[families[a.stat]] ?? 1) *
      (own.includes(a.stat) ? drops.biomeElementWeight : 1),
    rng,
  );
  const max = shardTiersOf(registry, affix.stat).length;
  const tier = rollTier(registry, drops.shardTierDepths, ctx.depth, max, up, rng);
  return { kind: 'shard', stat: affix.stat, tier };
}

/**
 * A slain foe's materials by its kind's table (`balance.json → delve.drops`):
 * each entry drops at its chance × the door's `materials` (flux × its `flux`
 * too), at most 1, then a uniform count. Bars are the floor's metal; flux
 * grades and shard tiers come by depth (`fluxGradeDepths`, `shardTierDepths`),
 * one up at Find's chance (`drops.find`) or the door's `shardTier`. A boss
 * drops an essence at `essenceChance` × the door's `essence` × Lucky Charm's
 * boost, or, while the first boss's guarantee holds, one whose legendary fits a
 * known pattern's slot and an epic flux. Elites and bosses may drop a pattern
 * the hero doesn't know (`patternChance`).
 */
export function rollMaterialDrops(
  registry: DataRegistry,
  ctx: MaterialDropContext,
  rng: SeededRNG,
): MaterialDrops {
  const drops = registry.getDelveBalance().drops;
  const mods = ctx.door?.mods ?? {};
  // Every row a kind's table may hold: one it lacks never drops.
  const table: Partial<DropsBalance['elite'] & DropsBalance['boss']> = drops[ctx.kind];
  const count = (e: DropEntry | undefined, mult = 1): number =>
    e && rng.next() < Math.min(1, e.chance * (mods.materials ?? 1) * mult)
      ? rng.nextInt(e.count[0], e.count[1])
      : 0;
  const findUp = Math.min(drops.find.cap, (ctx.find / 100) * drops.find.perPoint);
  const up = 1 - (1 - findUp) * (1 - (mods.shardTier ?? 0));
  const materials: MaterialDrops['materials'] = [];
  const one = (material: MaterialRef) => materials.push({ material, amount: 1 });

  for (let n = count(table.bars); n > 0; n--)
    one({ kind: 'metal', metal: rollMetal(registry, ctx.depth, rng) });
  for (let n = count(table.flux, mods.flux ?? 1); n > 0; n--) {
    const grade = rollTier(registry, drops.fluxGradeDepths, ctx.depth, FLUX_GRADES.length, up, rng);
    one({ kind: 'flux', grade: FLUX_GRADES[grade - 1] });
  }
  for (let n = count(table.shards); n > 0; n--) one(rollShard(registry, ctx, up, rng));
  const dust = count(table.dust);
  if (dust > 0) materials.push({ material: { kind: 'dust' }, amount: dust });
  const links = count(table.links);
  if (links > 0) materials.push({ material: { kind: 'links' }, amount: links });

  if (ctx.kind === 'boss') {
    const legendaries = registry.getDelveData().legendaries;
    if (ctx.firstEssence) {
      const slots = registry
        .getDelveData()
        .bases.filter((b) => ctx.patterns.includes(b.id))
        .map((b) => b.slot);
      const fits = legendaries.filter((l) => l.slots.some((s) => slots.includes(s)));
      const pool = fits.length > 0 ? fits : legendaries;
      one({ kind: 'essence', essence: pool[rng.nextInt(0, pool.length - 1)].id });
      one({ kind: 'flux', grade: 'epic' });
    } else {
      const chance = (table.essenceChance ?? 0) * (mods.essence ?? 1) * ctx.legendaryBoost;
      if (rng.next() < Math.min(1, chance))
        one({ kind: 'essence', essence: legendaries[rng.nextInt(0, legendaries.length - 1)].id });
    }
  }

  let pattern: string | null = null;
  if (table.patternChance !== undefined && rng.next() < table.patternChance) {
    const unknown = registry.getDelveData().bases.filter((b) => !ctx.patterns.includes(b.id));
    if (unknown.length > 0) pattern = unknown[rng.nextInt(0, unknown.length - 1)].id;
  }
  return { materials, pattern };
}

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

- [ ] **Step 4: Run them to see them pass, then the whole engine**

Run: `(cd packages/engine && npx vitest run tests/delve-material-drops.test.ts)`
Expected: PASS (10 tests).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 10** tests pass (5 skipped) in **F + 1** files (1671 | 5).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-b1
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/material-drops.ts tests/delve-material-drops.test.ts)
git add packages/engine/src/arpg/material-drops.ts packages/engine/tests/delve-material-drops.test.ts
git commit -m "feat(engine): the material drop tables: rollMaterialDrops by foe kind, door, depth, Find and biome" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The floor's haul and the settle

### Task 2: Banking into the haul, banking the haul, settling the dive

Today's drops keep flowing (gear at Phase A's counts, the kill's scrap credited to `pending.scrap`), but what a floor collects now waits: `bankWorld` puts gear in the bag and learns patterns at once, and moves scrap, materials, Mana Dust, Links and runes into `dive.haul`; a world's first bank starts that haul afresh; `completeFloor` moves it into `dive.banked`; `settleDive` stocks `banked` once a dive (an extract keeps it all, a death or an abandon loses the haul and `deathLoss` of `banked`, essences exempt), from `extractDive`, `failFloor` and `closeDive`. The first boss's stand-in (Phase A's) still sets `firstEssenceGiven` at any bank until Task 3. Tests: banking, the replayed floor, every settle outcome, the once-only guard, stochastic rounding on the dive's seed, and B2's skipped auto-salvage test (X1).

**Files:**
- Create: `packages/engine/tests/delve-banking.test.ts`
- Modify: `packages/engine/tests/delve-dive.test.ts`, `tests/delve-runes.test.ts`, `src/types/arpg.ts`, `src/arpg/world.ts`, `src/delve/dive.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-banking.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import {
  bankWorld,
  beginFloor,
  closeDive,
  completeFloor,
  extractDive,
  failFloor,
  settleDive,
  startDive,
} from '../src/delve/dive.js';
import { createDelveProfile, setAutoSalvage } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { addHaul, addMaterial, addMaterials, emptyHaul } from '../src/loot/materials.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { MaterialRef } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import { registry } from './fixtures/arena.js';

// See the crafting spec's "Banking and death".

const IRON: MaterialRef = { kind: 'metal', metal: 'iron' };
const EMBER: MaterialRef = { kind: 'essence', essence: 'pyroclasm' };
const SPLIT_I = { id: 'split', tier: 1 } as const;

const diving = (seed = 5): DelveProfile =>
  startDive(registry, createDelveProfile(registry, seed), 1);

/** Kill everything on the floor and let the loot vacuum in. */
function clearFloor(world: ArpgWorld): void {
  const ctx = makeCtx(registry, world, []);
  for (const m of [...world.monsters]) hitMonster(ctx, m, 1e12, null, { source: 'skill' });
  for (let i = 0; i < 150 && world.drops.length > 0; i++)
    stepWorld(registry, world, { move: { x: 0, y: 0 } }, 1 / 30);
}

describe('banking a floor', () => {
  it('bankWorld puts gear in the bag and every other pickup in the floor haul; patterns are learned and essences seen at once', () => {
    const p = diving();
    const world = beginFloor(registry, p);
    const sword = generateItem(registry, { uid: 'x1', ilvl: 2, rarity: 'magic' }, new SeededRNG(1));
    world.pending = {
      ...world.pending,
      items: [sword],
      scrap: 12,
      runes: [SPLIT_I],
      haul: addMaterial(addMaterial(emptyHaul(), IRON, 2), EMBER),
      patterns: ['axe', 'axe'],
    };
    const res = bankWorld(registry, p, world);
    expect(res.profile.bag.map((i) => i.uid)).toEqual(['x1']);
    const { scrap, runes, materials } = res.profile;
    expect({ scrap, runes, materials }).toEqual({
      scrap: p.scrap,
      runes: p.runes,
      materials: p.materials,
    });
    const { haul } = res.profile.dive!;
    expect(haul).toMatchObject({ scrap: 12, runes: { split: [1, 0, 0, 0, 0] } });
    expect(haul.metals.iron).toBe(2);
    expect(haul.essences).toEqual({ pyroclasm: 1 });
    expect(res.profile.patterns).toEqual([...p.patterns, 'axe']);
    expect(res.patterns).toEqual(['axe']);
    expect(res.profile.essencesSeen).toEqual(['pyroclasm']);
    // A second bank adds only what came since.
    world.pending.haul = addMaterial(emptyHaul(), IRON);
    expect(bankWorld(registry, res.profile, world).profile.dive!.haul.metals.iron).toBe(3);
  });

  it('a cleared floor banks its haul into the dive; the stockpile waits for the settle', () => {
    const p = diving();
    const world = beginFloor(registry, p);
    clearFloor(world);
    const mid = bankWorld(registry, p, world).profile;
    const { haul } = mid.dive!;
    expect(haul.scrap).toBeGreaterThan(0);
    const done = completeFloor(registry, mid, world).profile;
    expect(done.dive!.banked).toEqual(addHaul(p.dive!.banked, haul));
    expect(done.dive!.haul).toEqual(emptyHaul());
    expect(done.scrap).toBe(p.scrap);
    expect(done.stats.scrapEarned).toBe(p.stats.scrapEarned);
  });

  it('a floor replayed from its seed loses its unbanked haul instead of collecting it twice', () => {
    const p = diving();
    const first = beginFloor(registry, p);
    first.pending.haul = addMaterial(emptyHaul(), IRON);
    const once = bankWorld(registry, p, first).profile;
    expect(once.dive!.haul.metals.iron).toBe(1);
    // Left for the Anvil mid-floor: the floor starts over.
    const again = beginFloor(registry, once);
    again.pending.haul = addMaterial(emptyHaul(), IRON);
    expect(bankWorld(registry, once, again).profile.dive!.haul.metals.iron).toBe(1);
  });

  // ponytail: B2's applySalvage sends mid-dive salvage into the haul; the integrator un-skips this once B1 and B2 merge.
  it.skip("mid-dive auto-salvage yields (scrap, a shard) go to the floor's haul, not the stockpile", () => {
    const p = startDive(
      registry,
      setAutoSalvage(createDelveProfile(registry, 5), 'magic', true),
      1,
    );
    const world = beginFloor(registry, p);
    world.pending.items = [
      generateItem(registry, { uid: 'x2', ilvl: 2, rarity: 'magic' }, new SeededRNG(2)),
    ];
    const res = bankWorld(registry, p, world);
    expect(res.salvaged).toHaveLength(1);
    expect(res.profile.scrap).toBe(p.scrap);
    expect(res.profile.dive!.haul.scrap).toBeGreaterThan(0);
    expect(Object.keys(res.profile.dive!.haul.shards)).not.toEqual([]);
  });
});

describe('settling a dive', () => {
  const loss = registry.getDelveBalance().crafting.deathLoss;
  /** A haul with a bit of everything: bars, flux, shards, an essence, scrap, Mana Dust, Links and runes. */
  const BANKED = {
    ...emptyHaul(),
    metals: { ...emptyHaul().metals, iron: 10, rusty: 1 },
    flux: { ...emptyHaul().flux, magic: 3 },
    shards: { damage: [4, 1] },
    essences: { pyroclasm: 1 },
    scrap: 100,
    dust: 5,
    links: 2,
    runes: { split: [3, 0, 0, 0, 0] },
  };
  /** Diving, with `BANKED` banked and an iron bar and an essence in the floor's haul. */
  const holding = (seed = 5): DelveProfile => {
    const p = diving(seed);
    const haul = addMaterial(addMaterial(emptyHaul(), IRON), { kind: 'essence', essence: 'prism' });
    return { ...p, dive: { ...p.dive!, banked: BANKED, haul } };
  };

  it('an extract stocks everything banked, once; nothing is lost', () => {
    const p = holding();
    const out = settleDive(registry, p, 'extract');
    expect(out.scrap).toBe(p.scrap + 100);
    expect(out).toMatchObject({ manaDust: p.manaDust + 5, links: p.links + 2 });
    expect(out.materials).toEqual(addMaterials(p.materials, BANKED));
    expect(out.runes).toEqual({ split: [3, 0, 0, 0, 0] });
    expect(out.stats.scrapEarned).toBe(p.stats.scrapEarned + 100);
    expect(out.dive).toMatchObject({ settled: true, lost: null, banked: BANKED });
    expect(settleDive(registry, out, 'death')).toBe(out);
  });

  it("a death loses the floor's haul and deathLoss of each banked entry, rounded on the dive's seed; banked essences are exempt", () => {
    const p = holding();
    const out = settleDive(registry, p, 'death');
    const { banked: kept, lost } = out.dive!;
    expect(settleDive(registry, p, 'death')).toEqual(out);
    expect(kept.essences).toEqual({ pyroclasm: 1 });
    expect(lost!.essences).toEqual({ prism: 1 });
    const share = (n: number, k: number) => {
      expect(k === Math.floor(n * loss) || k === Math.ceil(n * loss)).toBe(true);
    };
    share(10, 10 - kept.metals.iron);
    expect(lost!.metals.iron).toBe(1 + 10 - kept.metals.iron); // the haul's bar and the share
    share(3, 3 - kept.flux.magic);
    share(4, 4 - kept.shards.damage![0]);
    share(100, 100 - kept.scrap);
    share(5, 5 - kept.dust);
    share(3, 3 - kept.runes.split[0]);
    expect(addHaul(kept, { ...lost!, essences: {} })).toEqual(
      addHaul(addMaterial(emptyHaul(), IRON), BANKED),
    );
    expect(out.scrap).toBe(p.scrap + kept.scrap);
    expect(out.dive).toMatchObject({ settled: true, haul: emptyHaul() });
    expect(settleDive(registry, out, 'extract')).toBe(out);
  });

  it('small stacks are still at risk: a lone banked bar is lost about deathLoss of the time', () => {
    let lostBars = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const p = diving(seed);
      const banked = addMaterial(emptyHaul(), IRON);
      const out = settleDive(registry, { ...p, dive: { ...p.dive!, banked } }, 'abandon');
      lostBars += out.dive!.lost!.metals.iron;
    }
    expect(lostBars / 400).toBeCloseTo(loss, 1);
  });

  it('failFloor settles a death, closeDive an abandon while the dive is under way, and nothing settles twice', () => {
    const p = holding();
    const world = beginFloor(registry, p);
    world.heroDead = true;
    const dead = failFloor(registry, p, world).profile;
    expect(dead.dive).toMatchObject({ phase: 'dead', settled: true });
    expect(dead).toEqual({ ...settleDive(registry, dead, 'death') });
    expect(closeDive(registry, dead)).toEqual({ ...dead, dive: null });

    const abandoned = closeDive(registry, p);
    expect(abandoned.dive).toBeNull();
    expect(abandoned.scrap).toBe(settleDive(registry, p, 'abandon').scrap);
    expect(abandoned.scrap).toBeLessThan(p.scrap + 100);

    const extracted = extractDive(registry, { ...p, dive: { ...p.dive!, phase: 'choosing' } });
    expect(extracted.scrap).toBe(p.scrap + p.dive!.bounty + 100);
    expect(closeDive(registry, extracted)).toEqual({ ...extracted, dive: null });
  });
});
```

In `packages/engine/tests/delve-dive.test.ts`:

Replace:

```ts
  it('banking moves pickups, scrap, kills and reactions into the profile', () => {
    const p = startDive(registry, createDelveProfile(registry, 5), 1);
    const world = beginFloor(registry, p);
    world.pending = { items: items(2), scrap: 40, kills: 6, reactions: ['melt'], runes: [] };
    const res = bankWorld(registry, p, world);
    expect(res.kept).toHaveLength(2);
    expect(res.newReactions).toEqual(['melt']);
    expect(res.profile.bag).toHaveLength(2);
    expect(res.profile.scrap).toBe(40);
```

with:

```ts
  it("banking moves gear, kills and reactions into the profile, and scrap into the floor's haul", () => {
    const p = startDive(registry, createDelveProfile(registry, 5), 1);
    const world = beginFloor(registry, p);
    world.pending = { ...world.pending, items: items(2), scrap: 40, kills: 6, reactions: ['melt'] };
    const res = bankWorld(registry, p, world);
    expect(res.kept).toHaveLength(2);
    expect(res.newReactions).toEqual(['melt']);
    expect(res.profile.bag).toHaveLength(2);
    expect(res.profile.scrap).toBe(p.scrap);
    expect(res.profile.dive!.haul.scrap).toBe(40);
```

Replace:

```ts
    p = extractDive(registry, p);
    expect(p.dive!.phase).toBe('extracted');
    expect(p.scrap).toBe(scrap + bounty);
```

with:

```ts
    const banked = p.dive!.banked.scrap;
    p = extractDive(registry, p);
    expect(p.dive!.phase).toBe('extracted');
    expect(p.scrap).toBe(scrap + bounty + banked);
```

Replace:

```ts
  it('dying forfeits the bounty but keeps what was picked up', () => {
```

with:

```ts
  it('dying forfeits the bounty and part of what was banked, but keeps the gear picked up', () => {
```

Replace:

```ts
    expect(res.profile.dive!.phase).toBe('dead');
    expect(res.profile.scrap).toBe(scrap);
```

with:

```ts
    expect(res.profile.dive!.phase).toBe('dead');
    expect(res.profile.dive!.banked.scrap).toBeLessThan(p.dive!.banked.scrap);
    expect(res.profile.scrap).toBe(scrap + res.profile.dive!.banked.scrap);
```

In `packages/engine/tests/delve-runes.test.ts`:

Replace:

```ts
  it('banking puts the runes picked up in the pouch, counts them for the dive, and reports them', () => {
    const { p, w } = floor();
    w.pending.runes = [SPLIT_I, SPLIT_I, CHAIN_II];
    const res = bankWorld(registry, p, w);
    expect(res.runes).toEqual([SPLIT_I, SPLIT_I, CHAIN_II]);
    expect(res.profile.runes).toEqual({ split: [2, 0, 0, 0, 0], chain: [0, 1, 0, 0, 0] });
```

with:

```ts
  it("banking puts the runes picked up in the floor's haul, counts them for the dive, and reports them", () => {
    const { p, w } = floor();
    w.pending.runes = [SPLIT_I, SPLIT_I, CHAIN_II];
    const res = bankWorld(registry, p, w);
    expect(res.runes).toEqual([SPLIT_I, SPLIT_I, CHAIN_II]);
    expect(res.profile.runes).toEqual(p.runes);
    const { runes } = res.profile.dive!.haul;
    expect(runes).toEqual({ split: [2, 0, 0, 0, 0], chain: [0, 1, 0, 0, 0] });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-banking.test.ts tests/delve-dive.test.ts tests/delve-runes.test.ts)`
Expected: FAIL, **10 failed | 55 passed | 1 skipped** (66) in 3 files: three settle tests on `Error: settleDive: not implemented` and the fourth on `expected { seed: …, …(22) } to match object { phase: 'dead', settled: true }`; the three "banking a floor" tests (`expected { scrap: 12, …(2) } to deeply equal { scrap: +0, runes: {}, …(1) }`, `expected 0 to be greater than 0`, `expected +0 to be 1`); delve-dive's bank test (`expected 40 to be +0`) and its death test (`expected 0 to be less than 0`); delve-runes' bank test (`expected { split: [ 2, +0, +0, +0, +0 ], …(1) } to deeply equal {}`). The skipped one is X1's.

- [ ] **Step 3: The haul, banking and the settle**

In `packages/engine/src/types/arpg.ts`:

Replace:

```ts
import type { MaterialRef } from './crafting.js';
```

with:

```ts
import type { Haul, MaterialRef } from './crafting.js';
```

Replace:

```ts
  /** Runes picked up, banked into the pouch. */
  runes: RuneRef[];
}
```

with:

```ts
  /** Runes picked up, banked into the floor's haul. */
  runes: RuneRef[];
  /** Material pickups: bars, flux, shards, essences, Mana Dust and Links (scrap and runes ride `scrap` and `runes`). */
  haul: Haul;
  /** Patterns picked up, learned when they bank. */
  patterns: string[];
  /**
   * The world hasn't banked yet: its first bank starts the dive's haul afresh, so
   * a floor replayed from its seed (left for the Anvil mid-floor) loses its
   * unbanked haul instead of collecting it twice.
   */
  newFloor: boolean;
}
```

In `packages/engine/src/arpg/world.ts`:

Replace:

```ts
  StatusState,
} from '../types/arpg.js';
```

with:

```ts
  StatusState,
  WorldPending,
} from '../types/arpg.js';
```

Replace:

```ts
import { dist } from './geometry.js';
```

with:

```ts
import { dist } from './geometry.js';
import { emptyHaul } from '../loot/materials.js';
```

Replace:

```ts
/** Build the arena for one depth: hero at the bottom, monster packs spread above. */
```

with:

```ts
/** Nothing collected yet (`newFloor`: the world hasn't banked; see `WorldPending`). */
export function emptyPending(newFloor = false): WorldPending {
  return {
    items: [],
    scrap: 0,
    kills: 0,
    reactions: [],
    runes: [],
    haul: emptyHaul(),
    patterns: [],
    newFloor,
  };
}

/** Build the arena for one depth: hero at the bottom, monster packs spread above. */
```

Replace:

```ts
    pending: { items: [], scrap: 0, kills: 0, reactions: [], runes: [] },
```

with:

```ts
    pending: emptyPending(true),
```

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
import type { SettleOutcome } from '../types/crafting.js';
```

with:

```ts
import type { Haul, SettleOutcome } from '../types/crafting.js';
```

Replace:

```ts
import { createFloorWorld, isBossFloor } from '../arpg/world.js';
```

with:

```ts
import { createFloorWorld, emptyPending, isBossFloor } from '../arpg/world.js';
```

Replace:

```ts
import { emptyHaul } from '../loot/materials.js';
```

with:

```ts
import { addHaul, emptyHaul, stockHaul } from '../loot/materials.js';
import { stochasticRound } from '../loot/drops.js';
```

Replace:

```ts
  /** Runes picked up, banked into the pouch (see the runes spec). */
  runes: RuneRef[];
}
```

with:

```ts
  /** Runes picked up, into the floor's haul (see the runes spec). */
  runes: RuneRef[];
  /** Patterns picked up and learned (see the crafting spec). */
  patterns: string[];
}
```

Replace:

```ts
/**
 * Move everything the world collected since the last bank (items and runes
 * picked up, scrap, kills, reactions discovered) into the profile. Call it
 * whenever pickups happen so new gear can be equipped mid-floor, and at floor end.
 * Auto-salvaged weapons' runes follow the parts rule (`opts.unsocket`, else the balance's).
 */
```

with:

```ts
/**
 * Move everything the world collected since the last bank into the profile
 * (see the crafting spec's banking): gear into the bag, patterns learned and
 * essences seen at once, kills and reactions discovered; materials, scrap,
 * Mana Dust, Links and runes into the floor's haul (`dive.haul`), which a
 * cleared floor banks. Call it whenever pickups happen so new gear can be
 * equipped mid-floor, and at floor end. Auto-salvaged weapons' runes follow the
 * parts rule (`opts.unsocket`, else the balance's). A world's first bank starts
 * the haul afresh (`WorldPending.newFloor`).
 */
```

Replace:

```ts
  const dive = requireDive(profile);
  const pending = world.pending;
  const items = pending.items;
  const runes = pending.runes;
  const bagged = addLootToBag(
    registry,
    { ...profile, nextUid: world.loot.nextUid },
    items,
    opts,
  );
  let next = bagged.profile;
```

with:

```ts
  const pending = world.pending;
  const start = requireDive(profile);
  const items = pending.items;
  const runes = pending.runes;
  const bagged = addLootToBag(
    registry,
    {
      ...profile,
      nextUid: world.loot.nextUid,
      dive: pending.newFloor ? { ...start, haul: emptyHaul() } : start,
    },
    items,
    opts,
  );
  let next = bagged.profile;
  // Auto-salvage mid-dive may have put yields in the haul: take the dive after it.
  const dive = next.dive!;
```

Replace:

```ts
  const newReactions = pending.reactions.filter((r) => !next.reactionsSeen.includes(r));
  const scrap = pending.scrap;

  next = {
    ...next,
    scrap: next.scrap + scrap,
    runes: addToPouch(next.runes, runes),
    firstEssenceGiven: next.firstEssenceGiven || !world.loot.firstEssence,
    reactionsSeen: [...next.reactionsSeen, ...newReactions],
    stats: {
      ...next.stats,
      kills: next.stats.kills + pending.kills,
      scrapEarned: next.stats.scrapEarned + scrap,
    },
    dive: {
      ...dive,
      kills: dive.kills + pending.kills,
      scrapEarned: dive.scrapEarned + scrap + bagged.scrap,
      dustEarned: dive.dustEarned + bagged.dust,
      linksEarned: dive.linksEarned + bagged.links,
```

with:

```ts
  const newReactions = pending.reactions.filter((r) => !next.reactionsSeen.includes(r));
  const scrap = pending.scrap;
  const picked: Haul = { ...pending.haul, scrap, runes: addToPouch({}, runes) };
  const patterns = [...new Set(pending.patterns)].filter((id) => !next.patterns.includes(id));
  const essences = Object.keys(picked.essences).filter((id) => !next.essencesSeen.includes(id));

  next = {
    ...next,
    patterns: [...next.patterns, ...patterns],
    essencesSeen: [...next.essencesSeen, ...essences],
    firstEssenceGiven: next.firstEssenceGiven || !world.loot.firstEssence,
    reactionsSeen: [...next.reactionsSeen, ...newReactions],
    stats: { ...next.stats, kills: next.stats.kills + pending.kills },
    dive: {
      ...dive,
      haul: addHaul(dive.haul, picked),
      kills: dive.kills + pending.kills,
      scrapEarned: dive.scrapEarned + scrap + bagged.scrap,
      dustEarned: dive.dustEarned + bagged.dust + picked.dust,
      linksEarned: dive.linksEarned + bagged.links + picked.links,
```

Replace:

```ts
  world.pending = { items: [], scrap: 0, kills: 0, reactions: [], runes: [] };
```

with:

```ts
  world.pending = emptyPending();
```

Replace:

```ts
    links: bagged.links,
    runes,
  };
}
```

with:

```ts
    links: bagged.links,
    runes,
    patterns,
  };
}
```

Replace:

```ts
/** The floor is cleared: bank loot (`bankWorld`, with `opts`), pay the depth bounty, heal, offer doors. */
```

with:

```ts
/**
 * The floor is cleared: bank loot (`bankWorld`, with `opts`) and the floor's haul
 * into `dive.banked`, pay the depth bounty, heal, offer doors.
 */
```

Replace:

```ts
  let nextDive: DiveState = {
    ...dive,
    bounty: dive.bounty + bountyAdded,
```

with:

```ts
  let nextDive: DiveState = {
    ...dive,
    haul: emptyHaul(),
    banked: addHaul(dive.banked, dive.haul),
    bounty: dive.bounty + bountyAdded,
```

Replace:

```ts
/** The hero fell: keep whatever was picked up (`bankWorld`, with `opts`), lose the bounty. */
```

with:

```ts
/**
 * The hero fell: bank the floor (`bankWorld`, with `opts`: its gear is kept), lose
 * the bounty, and settle the dive as a death (`settleDive`).
 */
```

Replace:

```ts
  const dive = banked.profile.dive!;
  return {
    ...banked,
    profile: {
      ...banked.profile,
      dive: { ...dive, phase: 'dead', heroHpFrac: 0 },
      stats: { ...banked.profile.stats, deaths: banked.profile.stats.deaths + 1 },
    },
  };
}
```

with:

```ts
  const dive = banked.profile.dive!;
  const dead: DelveProfile = {
    ...banked.profile,
    dive: { ...dive, phase: 'dead', heroHpFrac: 0 },
    stats: { ...banked.profile.stats, deaths: banked.profile.stats.deaths + 1 },
  };
  return { ...banked, profile: settleDive(registry, dead, 'death') };
}
```

Replace:

```ts
/** Leave the depths alive and cash in the bounty. */
export function extractDive(_registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const dive = requireDive(profile, 'choosing');
  return {
    ...profile,
```

with:

```ts
/** Leave the depths alive, cash in the bounty and settle what the dive banked (`settleDive`). */
export function extractDive(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const dive = requireDive(profile, 'choosing');
  const extracted: DelveProfile = {
    ...profile,
```

Replace:

```ts
      scrapEarned: profile.stats.scrapEarned + dive.bounty,
    },
  };
}
```

with:

```ts
      scrapEarned: profile.stats.scrapEarned + dive.bounty,
    },
  };
  return settleDive(registry, extracted, 'extract');
}

/** `haul` with each count passed through `f`, in a fixed order (its essences left out). */
function mapCounts(haul: Haul, f: (n: number) => number): Haul {
  const counts = (rec: Record<string, number>) =>
    Object.fromEntries(Object.keys(rec).sort().map((k) => [k, f(rec[k])]));
  const tiers = (rec: Partial<Record<string, number[]>>) =>
    Object.fromEntries(Object.keys(rec).sort().map((k) => [k, rec[k]!.map(f)]));
  return {
    metals: counts(haul.metals) as Haul['metals'],
    flux: counts(haul.flux) as Haul['flux'],
    shards: tiers(haul.shards),
    essences: {},
    scrap: f(haul.scrap),
    dust: f(haul.dust),
    links: f(haul.links),
    runes: tiers(haul.runes),
  };
}
```

Replace:

```ts
 * essences exempt), recorded in `dive.lost`. Stage 4c's B1 fills it and calls
 * it from `extractDive`, `failFloor` and `closeDive`; until then it throws.
```

with:

```ts
 * essences exempt), recorded in `dive.lost`; `banked` keeps what reached the
 * stockpile. `extractDive`, `failFloor` and `closeDive` call it; it leaves the
 * dive's phase alone.
```

Replace:

```ts
export function settleDive(_registry: DataRegistry, _profile: DelveProfile, _outcome: SettleOutcome): DelveProfile {
  throw new Error('settleDive: not implemented');
}
```

with:

```ts
export function settleDive(registry: DataRegistry, profile: DelveProfile, outcome: SettleOutcome): DelveProfile {
  const dive = requireDive(profile);
  if (dive.settled) return profile;
  let kept = dive.banked;
  let lost: Haul | null = null;
  if (outcome !== 'extract') {
    const loss = registry.getDelveBalance().crafting.deathLoss;
    const rng = new SeededRNG(profile.seed).fork(`death:${dive.seed}`);
    const share = mapCounts(dive.banked, (n) => stochasticRound(n * loss, rng));
    kept = addHaul(dive.banked, mapCounts(share, (n) => -n));
    lost = addHaul(dive.haul, share);
  }
  return {
    ...stockHaul(profile, kept),
    dive: { ...dive, haul: emptyHaul(), banked: kept, lost, settled: true },
  };
}
```

Replace:

```ts
/**
 * Clear the dive record (after the summary, or to abandon — the bounty is lost).
 * Stage 4c's B1 settles a dive still under way here first, as an abandon
 * (`settleDive`); an extracted or dead dive has settled already.
 */
export function closeDive(_registry: DataRegistry, profile: DelveProfile): DelveProfile {
  return { ...profile, dive: null };
}
```

with:

```ts
/**
 * Clear the dive record (after the summary, or to abandon — the bounty is lost).
 * A dive still under way settles first, as an abandon (`settleDive`); an
 * extracted or dead dive has settled already.
 */
export function closeDive(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const settled = isDiveActive(profile) ? settleDive(registry, profile, 'abandon') : profile;
  return { ...settled, dive: null };
}
```

- [ ] **Step 4: Run them to see them pass, then the whole engine**

Run: `(cd packages/engine && npx vitest run tests/delve-banking.test.ts tests/delve-dive.test.ts tests/delve-runes.test.ts)`
Expected: PASS, **65 passed | 1 skipped** (66).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 17** tests pass, **6** skipped, in **F + 2** files (1678 | 6). The pacing rails all pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-b1
(cd packages/engine && npx prettier --write --end-of-line auto src/types/arpg.ts src/arpg/world.ts tests/delve-banking.test.ts tests/delve-dive.test.ts tests/delve-runes.test.ts)
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/delve/dive.ts packages/engine/tests/delve-banking.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-runes.test.ts
git commit -m "feat(engine): the floor's haul: pickups bank into dive.haul, a cleared floor into banked, and the dive settles once" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: Kills drop materials

### Task 3: Material and scrap pickups, the magnet, the first boss's essence

`killMonster` no longer credits scrap: inside its `!world.sandbox` guard `dropMaterials` bursts the kill's scrap into `scrapPickups` pickups and rolls the materials (Task 1) on the world's new `materialRng`; a pattern drops as the new `'pattern'` kind. The magnet pulls everything but gear, runes, patterns and essences, at `delve.drops`' speeds and pickup delay, and material and pattern pickups gather in `pending.haul` / `pending.patterns`. The first boss's forced legendary (Phase A's stand-in) goes: its essence and epic flux drop instead, and `firstEssenceGiven` is set when the floor's haul holding it banks. Gear still drops at Phase A's counts until Task 4.

**Files:**
- Modify: `packages/engine/tests/delve-material-drops.test.ts`, `tests/fixtures/arena.ts`, `tests/delve-dive.test.ts`, `tests/delve-banking.test.ts`, `src/types/arpg.ts`, `src/arpg/world.ts`, `src/arpg/material-drops.ts`, `src/arpg/combat.ts`, `src/arpg/step.ts`, `src/delve/dive.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-material-drops.test.ts`, replace the lines from `import { describe, it, expect } from 'vitest';` up to (not including) `const drops = bal.drops;` with:

```ts
import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import {
  rollMaterialDrops,
  type MaterialDropContext,
  type MaterialDrops,
} from '../src/arpg/material-drops.js';
import { stepWorld } from '../src/arpg/step.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgWorld, Drop } from '../src/types/arpg.js';
import { FLUX_GRADES, type MaterialRef } from '../src/types/crafting.js';
import type { DoorMods } from '../src/types/delve.js';
import { arena, bal, dummy, registry, run, STEP } from './fixtures/arena.js';
```

Append at the end of `packages/engine/tests/delve-material-drops.test.ts`:

```ts
describe('material drops in the world', () => {
  const kill = (w: ArpgWorld) => {
    const ctx = makeCtx(registry, w, []);
    for (const m of [...w.monsters]) killMonster(ctx, m);
    return ctx.events;
  };

  it("a kill's scrap bursts out as its kind's scrap pickups, credited only when picked up", () => {
    const w = arena([{ kind: 'boss' }], { noBasic: true });
    const [death] = kill(w).flatMap((e) => (e.kind === 'death' ? [e] : []));
    const scrap = w.drops.filter((d) => d.kind === 'scrap').map((d) => d.amount);
    expect(death.scrap).toBeGreaterThan(drops.scrapPickups.boss);
    expect(scrap).toHaveLength(drops.scrapPickups.boss);
    expect(scrap.reduce((a, b) => a + b, 0)).toBe(death.scrap);
    expect(Math.max(...scrap) - Math.min(...scrap)).toBeLessThanOrEqual(1);
    expect(w.pending.scrap).toBe(0);
  });

  it('materials roll on their own stream: every other drop comes out as without them', () => {
    const floor = () =>
      arena(
        Array.from({ length: 12 }, (_, i) => ({
          kind: i % 4 ? ('elite' as const) : ('boss' as const),
        })),
        { noBasic: true },
      );
    const a = floor();
    const b = floor();
    b.materialRng = new SeededRNG(12345);
    kill(a);
    kill(b);
    const mine = (d: Drop) => d.kind === 'material' || d.kind === 'scrap' || d.kind === 'pattern';
    const others = (w: ArpgWorld) => w.drops.filter((d) => !mine(d)).map(({ id: _id, ...d }) => d);
    expect(others(a)).toEqual(others(b));
    expect(others(a).some((d) => d.kind === 'item')).toBe(true);
    const materials = (w: ArpgWorld) =>
      w.drops.filter((d) => d.kind === 'material').map((d) => d.material);
    expect(materials(a)).not.toEqual(materials(b));
  });

  it('the magnet pulls materials in at magnetSpeed; essences and patterns are walked over', () => {
    const w = arena([dummy(13, 5)], { noBasic: true });
    const { x, y } = w.hero;
    const drop = (id: number, dx: number, extra: Partial<Drop>): Drop => ({
      id,
      kind: 'material',
      x: x + dx,
      y,
      amount: 1,
      born: -1,
      vacuum: false,
      dead: false,
      ...extra,
    });
    const iron = { kind: 'metal', metal: 'iron' } as const;
    const ember = { kind: 'essence', essence: 'pyroclasm' } as const;
    w.drops.push(
      drop(1, 3, { material: iron }),
      drop(2, -2.4, { material: ember }),
      drop(3, 0, { material: ember }),
      drop(4, 0.5, { kind: 'pattern', pattern: 'axe' }),
      drop(5, 2.4, { kind: 'pattern', pattern: 'bow' }),
    );
    const events = stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP);
    expect(w.drops[0].x).toBeCloseTo(x + 3 - drops.magnetSpeed * STEP);
    events.push(...run(w, 0.5));
    expect(w.drops.filter((d) => !d.dead).map((d) => [d.id, d.x])).toEqual([
      [2, x - 2.4],
      [5, x + 2.4],
    ]);
    expect(w.pending.haul.metals.iron).toBe(1);
    expect(w.pending.haul.essences).toEqual({ pyroclasm: 1 });
    expect(w.pending.patterns).toEqual(['axe']);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'pickup', dropId: 4, dropKind: 'pattern', pattern: 'axe' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'pickup', dropId: 1, dropKind: 'material', material: iron }),
    );
  });

  it("a fresh drop waits pickupDelay before it's picked up", () => {
    const w = arena([dummy(13, 5)], { noBasic: true });
    const { x, y } = w.hero;
    w.drops.push({ id: 1, kind: 'scrap', x, y, amount: 3, born: w.t, vacuum: false, dead: false });
    run(w, drops.pickupDelay - 2 * STEP);
    expect(w.pending.scrap).toBe(0);
    run(w, 4 * STEP);
    expect(w.pending.scrap).toBe(3);
  });

  it("the first boss's essence and epic flux drop once a floor", () => {
    const w = arena([{ kind: 'boss' }, { kind: 'boss' }], { noBasic: true });
    w.loot = { ...w.loot, firstEssence: true, patterns: ['sword'] };
    kill(w);
    const epic = w.drops.filter((d) => d.material?.kind === 'flux' && d.material.grade === 'epic');
    expect(epic).toHaveLength(1);
    const essences = w.drops.flatMap((d) =>
      d.material?.kind === 'essence' ? [d.material.essence] : [],
    );
    expect(registry.getLegendary(essences[0]).slots).toContain('weapon');
    expect(w.loot.firstEssence).toBe(false);
  });
});
```

In `packages/engine/tests/fixtures/arena.ts`:

Replace:

```ts
      legendaryBoost: 1,
      forceLegendary: false,
      pair: [],
```

with:

```ts
      legendaryBoost: 1,
      firstEssence: false,
      patterns: [],
      pair: [],
```

In `packages/engine/tests/delve-dive.test.ts`:

Replace:

```ts
  it('the first boss ever drops a legendary (until B1, its essence), grants a checkpoint and a potion', () => {
    let p = startDive(registry, createDelveProfile(registry, 3), 1);
    p = { ...p, dive: { ...p.dive!, depth: 5, potions: 0 } };
    const world = beginFloor(registry, p);
    expect(world.monsters.some((m) => m.kind === 'boss')).toBe(true);
    clearFloor(world);
    const res = completeFloor(registry, p, world);
    expect(res.bossKilled).toBe(true);
    expect([...res.kept, ...res.salvaged].some((i) => i.rarity === 'legendary')).toBe(true);
    expect(res.newCodex).toHaveLength(1);
    expect(res.profile.checkpoints).toContain(5);
```

with:

```ts
  it('the first boss ever drops an essence, grants a checkpoint and a potion', () => {
    let p = startDive(registry, createDelveProfile(registry, 3), 1);
    p = { ...p, dive: { ...p.dive!, depth: 5, potions: 0 } };
    const world = beginFloor(registry, p);
    expect(world.monsters.some((m) => m.kind === 'boss')).toBe(true);
    clearFloor(world);
    expect(world.loot.firstEssence).toBe(false);
    const res = completeFloor(registry, p, world);
    expect(res.bossKilled).toBe(true);
    expect(res.profile.checkpoints).toContain(5);
```

In `packages/engine/tests/delve-banking.test.ts`, replace the lines from `import { describe, it, expect } from 'vitest';` up to (not including) `// See the crafting spec's "Banking and death".` with:

```ts
import { describe, it, expect } from 'vitest';
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import {
  bankWorld,
  beginFloor,
  chooseDoor,
  closeDive,
  completeFloor,
  extractDive,
  failFloor,
  settleDive,
  startDive,
} from '../src/delve/dive.js';
import { runAutopilot } from '../src/delve/autopilot.js';
import { createDelveProfile, setAutoSalvage } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { addHaul, addMaterial, addMaterials, emptyHaul } from '../src/loot/materials.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import type { MaterialRef } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import { registry } from './fixtures/arena.js';
```

Append at the end of `packages/engine/tests/delve-banking.test.ts`:

```ts
describe('the first boss and a seeded dive', () => {
  it("the first boss's essence and epic flux bank with its floor, and count as given then", () => {
    const start = diving(3);
    const p = { ...start, dive: { ...start.dive!, depth: 5 } };
    const world = beginFloor(registry, p);
    expect(world.loot.firstEssence).toBe(true);
    clearFloor(world);
    const res = completeFloor(registry, p, world);
    const { banked } = res.profile.dive!;
    const [essence] = Object.keys(banked.essences);
    const slots = p.patterns.map((id) => registry.getGearBase(id).slot);
    expect(registry.getLegendary(essence).slots.some((s) => slots.includes(s))).toBe(true);
    expect(banked.flux.epic).toBe(1);
    expect(res.profile.essencesSeen).toEqual([essence]);
    expect(res.profile.firstEssenceGiven).toBe(true);
    const next = chooseDoor(registry, res.profile, res.profile.dive!.doorChoices[0]);
    expect(beginFloor(registry, next).loot.firstEssence).toBe(false);
  });

  it("a death before the first boss's floor banks grants its essence again", () => {
    const start = diving(3);
    const p = { ...start, dive: { ...start.dive!, depth: 5 } };
    const world = beginFloor(registry, p);
    clearFloor(world);
    world.heroDead = true;
    const dead = failFloor(registry, p, world).profile;
    expect(dead.dive!.lost!.flux.epic).toBe(1);
    expect(dead.firstEssenceGiven).toBe(false);
    const again = startDive(registry, closeDive(registry, dead), 1);
    expect(beginFloor(registry, again).loot.firstEssence).toBe(true);
  });

  it('a seeded dive plays out the same: its drops, haul, banking and settle', () => {
    const dives = () => runAutopilot(registry, { seed: 9, dives: 2 }).profile;
    const a = dives();
    expect(a).toEqual(dives());
    const bars = (p: DelveProfile) => Object.values(p.materials.metals).reduce((x, y) => x + y, 0);
    expect(bars(a)).toBeGreaterThan(bars(createDelveProfile(registry, 9)));
    expect(a.stats.dives).toBe(2);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-material-drops.test.ts tests/delve-dive.test.ts tests/delve-banking.test.ts)`
Expected: FAIL, **7 failed | 38 passed | 1 skipped** (46): the four "material drops in the world" tests (`expected [] to have a length of 8 but got +0`, `expected [] to not deeply equal []`, `expected [] to deeply equal [ [ 2, 10.6 ], [ 5, 15.4 ] ]`, `expected [] to have a length of 1 but got +0`) and the three "first boss and a seeded dive" tests (`Error: Legendary not found: undefined`, `expected +0 to be 1`, `expected 5 to be greater than 5`).

- [ ] **Step 3: Kills drop materials**

In `packages/engine/src/types/arpg.ts`:

Replace:

```ts
export type DropKind = 'item' | 'mote' | 'orb' | 'scrap' | 'rune' | 'material';
```

with:

```ts
export type DropKind = 'item' | 'mote' | 'orb' | 'scrap' | 'rune' | 'material' | 'pattern';
```

Replace:

```ts
  material?: MaterialRef;
  amount: number;
  born: number;
```

with:

```ts
  material?: MaterialRef;
  /** A pattern drop's base id (kind `'pattern'`): learned when it banks. */
  pattern?: string;
  amount: number;
  born: number;
```

Replace:

```ts
      /** A material pickup's material, `amount` of it. */
      material?: MaterialRef;
    }
```

with:

```ts
      /** A material pickup's material, `amount` of it. */
      material?: MaterialRef;
      /** A pattern pickup's base id. */
      pattern?: string;
    }
```

Replace:

```ts
   * the first boss guarantees it. Until B1, the stand-in gives a legendary item.
```

with:

```ts
   * the first boss guarantees it, with an epic flux (`dropMaterials` clears it).
```

Replace:

```ts
  runeRng: SeededRNG;
  depth: number;
```

with:

```ts
  runeRng: SeededRNG;
  /** Material drops' own stream (scrap pickups too), so gear, rune, orb and mote rolls stay as they were. */
  materialRng: SeededRNG;
  depth: number;
```

In `packages/engine/src/arpg/world.ts`:

Replace:

```ts
    runeRng: rng.fork(`runes:${opts.loot.nextUid}`),
```

with:

```ts
    runeRng: rng.fork(`runes:${opts.loot.nextUid}`),
    materialRng: rng.fork(`materials:${opts.loot.nextUid}`),
```

In `packages/engine/src/arpg/material-drops.ts`:

Replace:

```ts
import type { MonsterEntity, MonsterKind } from '../types/arpg.js';
```

with:

```ts
import type { Drop, MonsterEntity, MonsterKind } from '../types/arpg.js';
```

Replace:

```ts
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

with:

```ts
/**
 * A slain foe's materials, scrap and pattern burst onto the floor on
 * `world.materialRng` (so gear, rune, orb and mote rolls are untouched): its
 * kill scrap split into `drops.scrapPickups[kind]` pickups (each at least 1),
 * every material and the pattern their own. A boss that takes the first
 * essence's guarantee clears it for the floor; a dropped pattern won't drop
 * again this floor. `killMonster` calls it inside its `!world.sandbox` guard.
 */
export function dropMaterials(ctx: SimCtx, m: MonsterEntity, scrap: number): void {
  const { world, registry } = ctx;
  const rng = world.materialRng;
  const loot = world.loot;
  const firstEssence = m.kind === 'boss' && loot.firstEssence;
  const rolled = rollMaterialDrops(
    registry,
    {
      depth: world.depth,
      kind: m.kind,
      biomeId: world.biomeId,
      biomeMana: world.element,
      door: world.door,
      find: loot.find,
      legendaryBoost: loot.legendaryBoost,
      firstEssence,
      patterns: loot.patterns,
    },
    rng,
  );
  if (firstEssence) loot.firstEssence = false;

  const spawn = (extra: Pick<Drop, 'kind' | 'amount' | 'material' | 'pattern'>) => {
    const angle = rng.next() * Math.PI * 2;
    const r = 0.6 + rng.next() * 0.9;
    const x = Math.max(1, Math.min(world.width - 1, m.x + Math.cos(angle) * r));
    const y = Math.max(1, Math.min(world.height - 1, m.y + Math.sin(angle) * r));
    const id = world.nextId++;
    world.drops.push({ id, x, y, ...extra, born: world.t, vacuum: world.cleared, dead: false });
    ctx.events.push({ kind: 'drop', dropId: id, x, y, dropKind: extra.kind });
  };

  const pieces = Math.min(registry.getDelveBalance().drops.scrapPickups[m.kind], scrap);
  for (let i = 0; i < pieces; i++) {
    const amount = Math.floor(scrap / pieces) + (i < scrap % pieces ? 1 : 0);
    spawn({ kind: 'scrap', amount });
  }
  for (const { material, amount } of rolled.materials)
    spawn({ kind: 'material', amount, material });
  if (rolled.pattern) {
    loot.patterns = [...loot.patterns, rolled.pattern];
    spawn({ kind: 'pattern', amount: 1, pattern: rolled.pattern });
  }
}
```

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
import { dropRune } from './rune-drops.js';
```

with:

```ts
import { dropRune } from './rune-drops.js';
import { dropMaterials } from './material-drops.js';
```

Replace:

```ts
  // The Training Grounds drop nothing from kills: no scrap, items, motes or orbs.
  const scrap = world.sandbox
```

with:

```ts
  // The Training Grounds drop nothing from kills: no scrap, items, motes, orbs or materials.
  // The kill's scrap bursts out as pickups (`dropMaterials`).
  const scrap = world.sandbox
```

Replace:

```ts
  world.pending.scrap += scrap;
  ctx.events.push({ kind: 'death'
```

with:

```ts
  ctx.events.push({ kind: 'death'
```

Replace:

```ts
    dropRune(ctx, m);
  }
```

with:

```ts
    dropRune(ctx, m);
    dropMaterials(ctx, m, scrap);
  }
```

Replace:

```ts
  const loot = world.loot;
  // ponytail: Phase A's stand-in for the first boss's essence (a legendary item); B1 drops the essence.
  const forceLegendary = m.kind === 'boss' && loot.firstEssence;
  const drops = rollEncounterDrops(
```

with:

```ts
  const loot = world.loot;
  const drops = rollEncounterDrops(
```

Replace:

```ts
      forceLegendary,
      nextUid: loot.nextUid,
```

with:

```ts
      forceLegendary: false, // until Task 4's drop tables take the field out
      nextUid: loot.nextUid,
```

Replace:

```ts
  loot.nextUid = drops.nextUid;
  if (forceLegendary) loot.firstEssence = false;
```

with:

```ts
  loot.nextUid = drops.nextUid;
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
  ArpgWorld,
  HeroEntity,
  MonsterEntity,
  Projectile,
  Vec,
} from '../types/arpg.js';
```

with:

```ts
  ArpgWorld,
  Drop,
  HeroEntity,
  MonsterEntity,
  Projectile,
  Vec,
} from '../types/arpg.js';
```

Replace:

```ts
import { dodgeTick, isDashing, notePerfect, perfectOrigin, tryDodge } from './dodge.js';
```

with:

```ts
import { dodgeTick, isDashing, notePerfect, perfectOrigin, tryDodge } from './dodge.js';
import { addMaterial } from '../loot/materials.js';
```

Replace:

```ts
const ITEM_PICKUP_DELAY = 0.35;
/** Seconds from aggro to a boss's first special (the Training Grounds' spawner uses it too). */
```

with:

```ts
/** Seconds from aggro to a boss's first special (the Training Grounds' spawner uses it too). */
```

Replace:

```ts
function dropsTick(ctx: SimCtx, dt: number): void {
  const { world, bal } = ctx;
  const h = world.hero;
  for (const d of world.drops) {
    if (d.dead) continue;
    const gap = dist(h.x, h.y, d.x, d.y);
    // Items and runes are walked over; motes, orbs and scrap fly to the hero.
    const magnet = d.kind !== 'item' && d.kind !== 'rune' && gap < bal.hero.magnetRadius;
    if (d.vacuum || magnet) {
      const dir = dirTo(d.x, d.y, h.x, h.y);
      const speed = d.vacuum ? 18 : 10;
      const stepLen = Math.min(gap, speed * dt);
      d.x += dir.x * stepLen;
      d.y += dir.y * stepLen;
    }
    if (world.t - d.born < ITEM_PICKUP_DELAY) continue;
```

with:

```ts
/** Gear, runes, patterns and essences are walked over; everything else flies to the hero in the magnet's reach. */
function walkedOver(d: Drop): boolean {
  return (
    d.kind === 'item' || d.kind === 'rune' || d.kind === 'pattern' || d.material?.kind === 'essence'
  );
}

function dropsTick(ctx: SimCtx, dt: number): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const { magnetSpeed, vacuumSpeed, pickupDelay } = bal.drops;
  for (const d of world.drops) {
    if (d.dead) continue;
    const gap = dist(h.x, h.y, d.x, d.y);
    const magnet = !walkedOver(d) && gap < bal.hero.magnetRadius;
    if (d.vacuum || magnet) {
      const dir = dirTo(d.x, d.y, h.x, h.y);
      const speed = d.vacuum ? vacuumSpeed : magnetSpeed;
      const stepLen = Math.min(gap, speed * dt);
      d.x += dir.x * stepLen;
      d.y += dir.y * stepLen;
    }
    if (world.t - d.born < pickupDelay) continue;
```

Replace:

```ts
      case 'rune':
        if (d.rune) world.pending.runes.push(d.rune);
        break;
    }
```

with:

```ts
      case 'rune':
        if (d.rune) world.pending.runes.push(d.rune);
        break;
      case 'material':
        if (d.material) world.pending.haul = addMaterial(world.pending.haul, d.material, d.amount);
        break;
      case 'pattern':
        if (d.pattern) world.pending.patterns.push(d.pattern);
        break;
    }
```

Replace:

```ts
      rune: d.rune,
      amount: d.amount,
      mana: d.mana,
    });
```

with:

```ts
      rune: d.rune,
      amount: d.amount,
      mana: d.mana,
      material: d.material,
      pattern: d.pattern,
    });
```

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
      patterns: profile.patterns,
      pair: pairElements(profile.pair),
```

with:

```ts
      patterns: [...profile.patterns],
      pair: pairElements(profile.pair),
```

Replace:

```ts
    essencesSeen: [...next.essencesSeen, ...essences],
    firstEssenceGiven: next.firstEssenceGiven || !world.loot.firstEssence,
```

with:

```ts
    essencesSeen: [...next.essencesSeen, ...essences],
```

Replace:

```ts
 * into `dive.banked`, pay the depth bounty, heal, offer doors.
 */
```

with:

```ts
 * into `dive.banked`, pay the depth bounty, heal, offer doors. The first boss's
 * essence counts as given once a haul holding it banks here.
 */
```

Replace:

```ts
  const bossKilled = world.bossKilled;
```

with:

```ts
  const bossKilled = world.bossKilled;
  const essenceBanked = !world.loot.firstEssence && Object.keys(dive.haul.essences).length > 0;
```

Replace:

```ts
      ...banked.profile,
      checkpoints,
      dive: nextDive,
```

with:

```ts
      ...banked.profile,
      firstEssenceGiven: banked.profile.firstEssenceGiven || essenceBanked,
      checkpoints,
      dive: nextDive,
```

- [ ] **Step 4: Run them to see them pass, then the whole engine**

Run: `(cd packages/engine && npx vitest run tests/delve-material-drops.test.ts tests/delve-dive.test.ts tests/delve-banking.test.ts)`
Expected: PASS, **45 passed | 1 skipped** (46).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 25** tests pass, **6** skipped, in **F + 2** files (1686 | 6). The pacing rails all pass (gear still flows at Phase A's counts).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-b1
(cd packages/engine && npx prettier --write --end-of-line auto src/types/arpg.ts src/arpg/world.ts src/arpg/material-drops.ts src/arpg/combat.ts src/arpg/step.ts tests/delve-material-drops.test.ts tests/fixtures/arena.ts tests/delve-dive.test.ts tests/delve-banking.test.ts)
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/material-drops.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/src/delve/dive.ts packages/engine/tests/delve-material-drops.test.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-banking.test.ts
git commit -m "feat(engine): kills drop materials and scrap pickups on materialRng; the magnet reads delve.drops; the first boss drops its essence" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: Gear from the tables, and the stops

### Task 4: Gear from the drop tables

Phase A's `GEAR_TODAY` goes: a normal foe drops no gear, an elite one item at `drops.elite.gearChance` × the door's `gear` (at most 1), a boss `drops.boss.gear` items, each at least `loot.bossMinRarity`. Find no longer feeds gear rarity (`dropLuck` is depth and kind) and Lucky Charm's `legendaryBoost` no longer reaches the gear roll (S5: it multiplies only the essence chance, Task 1). The tests that pinned today's counts follow: the delve-loot table tests, the arpg-sim vacuum (a normal foe's loot is now materials and scrap), delve-pair's pre-pair GOLDEN (drawn as elites drew then), the movesets items hash (re-pinned, X4.1). Two pacing rails need B3's forging autopilot and are skipped with `ponytail:` notes (X3).

**Files:**
- Modify: `packages/engine/tests/delve-loot.test.ts`, `tests/arpg-sim.test.ts`, `tests/delve-pair.test.ts`, `tests/delve-movesets.test.ts`, `tests/delve-pacing.test.ts`, `src/loot/drops.ts`, `src/arpg/combat.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-loot.test.ts`:

Replace:

```ts
import { rollEncounterDrops } from '../src/loot/drops.js';
```

with:

```ts
import { dropLuck, rollEncounterDrops } from '../src/loot/drops.js';
```

Replace:

```ts
describe('rollEncounterDrops', () => {
  const base = {
    depth: 5,
    find: 0,
    materials: 1,
    legendaryBoost: 1,
    forceLegendary: false,
    nextUid: 1,
    pair: [],
  };

  it('bosses drop several items, the first at least rare, one item level higher', () => {
    for (let s = 0; s < 20; s++) {
      const res = rollEncounterDrops(registry, { ...base, kind: 'boss' }, new SeededRNG(s));
      // Phase A's stand-in counts (`loot/drops.ts`); the drop tables replace them.
      const [min, max] = [3, 4];
      expect(res.items.length).toBeGreaterThanOrEqual(min);
      expect(res.items.length).toBeLessThanOrEqual(max);
      expect(RARITY_ORDER.indexOf(res.items[0].rarity)).toBeGreaterThanOrEqual(
        RARITY_ORDER.indexOf('rare'),
      );
      expect(res.items[0].ilvl).toBe(6);
    }
  });

  it('forceLegendary makes the first drop legendary', () => {
    const res = rollEncounterDrops(
      registry,
      { ...base, kind: 'boss', forceLegendary: true },
      new SeededRNG(1),
    );
    expect(res.items[0].rarity).toBe('legendary');
  });
```

with:

```ts
describe('rollEncounterDrops: gear from the drop tables', () => {
  const { drops, loot } = registry.getDelveBalance();
  const base = { depth: 5, gear: 1, nextUid: 1, pair: [] };

  it('a boss drops drops.boss.gear items, each at least rare, one item level higher', () => {
    for (let s = 0; s < 20; s++) {
      const res = rollEncounterDrops(registry, { ...base, kind: 'boss' }, new SeededRNG(s));
      expect(res.items).toHaveLength(drops.boss.gear);
      for (const item of res.items) {
        expect(RARITY_ORDER.indexOf(item.rarity)).toBeGreaterThanOrEqual(
          RARITY_ORDER.indexOf(loot.bossMinRarity),
        );
        expect(item.ilvl).toBe(6);
      }
    }
  });

  it("an elite drops one item at gearChance × the door's gear, at most 1", () => {
    const rate = (gear: number) => {
      let n = 0;
      for (let s = 0; s < 2000; s++)
        n += rollEncounterDrops(registry, { ...base, kind: 'elite', gear }, new SeededRNG(s)).items
          .length;
      return n / 2000;
    };
    expect(rate(1)).toBeCloseTo(drops.elite.gearChance, 1);
    expect(rate(1.5)).toBeCloseTo(Math.min(1, drops.elite.gearChance * 1.5), 1);
    expect(rate(10)).toBe(1);
  });

  it("gear's luck comes from depth and the foe's kind alone (Find no longer feeds it)", () => {
    const at = (depth: number) => Math.min(loot.maxDepthLuck, (depth - 1) * loot.luckPerDepth);
    expect(dropLuck(registry, { depth: 5, kind: 'elite' })).toBeCloseTo(at(5) + loot.eliteLuck);
    expect(dropLuck(registry, { depth: 5, kind: 'boss' })).toBeCloseTo(at(5) + loot.bossLuck);
  });
```

Replace:

```ts
  it('normal monsters drop 0-2 items', () => {
    let total = 0;
    for (let s = 0; s < 200; s++) {
      const res = rollEncounterDrops(registry, { ...base, kind: 'normal' }, new SeededRNG(s));
      expect(res.items.length).toBeLessThanOrEqual(2);
      total += res.items.length;
    }
    const avg = total / 200;
    // Phase A's stand-in chances (`loot/drops.ts`: 0.22 and 0.05); the drop tables replace them.
    expect(avg).toBeGreaterThan(0.27 * 0.6);
    expect(avg).toBeLessThan(0.27 * 1.4);
  });
```

with:

```ts
  it('normal foes drop no gear', () => {
    for (let s = 0; s < 200; s++)
      expect(
        rollEncounterDrops(registry, { ...base, kind: 'normal', gear: 10 }, new SeededRNG(s)).items,
      ).toEqual([]);
  });
```

In `packages/engine/tests/arpg-sim.test.ts`:

Replace:

```ts
    expect(w.drops).toHaveLength(0);
    expect(w.pending.items.length).toBeGreaterThan(0);
  });
```

with:

```ts
    expect(w.drops).toHaveLength(0);
    expect(Object.values(w.pending.haul.metals).some((n) => n > 0)).toBe(true);
    expect(w.pending.scrap).toBeGreaterThan(0);
  });
```

In `packages/engine/tests/delve-pair.test.ts`:

Replace:

```ts
import { generateItem } from '../src/loot/item-generator.js';
import { rollEncounterDrops } from '../src/loot/drops.js';
```

with:

```ts
import { generateItem, rollRarity } from '../src/loot/item-generator.js';
import { dropLuck, stochasticRound } from '../src/loot/drops.js';
```

Replace:

```ts
  it('with an empty pair, the seeded drop streams are unchanged', () => {
    const ctx = {
      depth: 5,
      kind: 'elite' as const,
      find: 0,
      materials: 1,
      legendaryBoost: 1,
      forceLegendary: false,
      nextUid: 1,
      biomeMana: 'fire' as const,
      pair: [],
    };
    const got = GOLDEN.map((_, s) =>
      rollEncounterDrops(registry, ctx, new SeededRNG(s))
        .items.map((i) => `${i.mana}:${i.rarity}:${i.baseId}`)
        .join(','),
    );
    expect(got).toEqual(GOLDEN);
  });
```

with:

```ts
  it('with an empty pair, the seeded drop streams are unchanged', () => {
    const luck = dropLuck(registry, { depth: 5, kind: 'elite' });
    // Two or three items a seed, drawn as an elite's gear was when GOLDEN was recorded.
    const got = GOLDEN.map((_, s) => {
      const rng = new SeededRNG(s);
      const n = stochasticRound(rng.nextInt(2, 3), rng);
      return Array.from({ length: n }, (_, i) => {
        const rarity = rollRarity(registry, { luck }, rng);
        const opts = { uid: `g${i + 1}`, ilvl: 5, rarity, biomeMana: 'fire' as const, pair: [] };
        const item = generateItem(registry, opts, rng);
        return `${item.mana}:${item.rarity}:${item.baseId}`;
      }).join(',');
    });
    expect(got).toEqual(GOLDEN);
  });
```

In `packages/engine/tests/delve-movesets.test.ts`:

Replace:

```ts
  it('leaves every other item stat, and every later drop, as v0.48.0 rolled them', () => {
```

with:

```ts
  it('leaves every other item stat as v0.48.0 rolled them, and the drop tables roll the same gear', () => {
```

Replace:

```ts
    let ctx = {
      depth: 5,
      kind: 'boss' as const,
      find: 40,
      materials: 1,
      legendaryBoost: 1,
      forceLegendary: true,
      nextUid: 1,
      biomeMana: 'earth' as const,
      pair: ['fire' as const],
    };
    for (let i = 0; i < 40; i++) {
      const kind = i % 3 ? ('elite' as const) : ('boss' as const);
      const r = rollEncounterDrops(registry, { ...ctx, kind, forceLegendary: i === 0 }, rng);
```

with:

```ts
    let ctx = {
      depth: 5,
      gear: 1,
      nextUid: 1,
      biomeMana: 'earth' as const,
      pair: ['fire' as const],
    };
    for (let i = 0; i < 40; i++) {
      const kind = i % 3 ? ('elite' as const) : ('boss' as const);
      const r = rollEncounterDrops(registry, { ...ctx, kind }, rng);
```

Replace:

```ts
    // v0.48.0's 291 items, hashed the same way (the plan's scratchpad `items-hash.mjs`).
    expect([items.length, h.toString(16)]).toEqual([291, '49e20fb6']);
```

with:

```ts
    // v0.48.0's 180 generated items, then stage 4c's drop-table gear (B1), hashed the same way.
    expect([items.length, h.toString(16)]).toEqual([204, 'f19d30c9']);
```

In `packages/engine/tests/delve-pacing.test.ts`:

Replace:

```ts
  it('legendaries arrive without completing the codex early', () => {
```

with:

```ts
  // ponytail: B1's drop tables give legendaries as essences; until B3's autopilot forges them, it owns none. B3 un-skips this.
  it.skip('legendaries arrive without completing the codex early', () => {
```

Replace:

```ts
  it('no pair runs away or stalls: each forced pair reaches 0.6–1.6 × the median depth by dive 6', () => {
```

with:

```ts
  // ponytail: with gear only from elites and bosses, the unforging autopilot's depths spread out until B3 forges. B3 un-skips this.
  it.skip('no pair runs away or stalls: each forced pair reaches 0.6–1.6 × the median depth by dive 6', () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-loot.test.ts tests/arpg-sim.test.ts tests/delve-pair.test.ts tests/delve-movesets.test.ts)`
Expected: FAIL, **5 failed | 149 passed** (154): delve-loot's boss, elite and luck tests (`expected [] to have a length of 1 but got +0`, `expected +0 to be close to 0.5, received difference is 0.5, but expected 0.05`, `expected NaN to be close to 0.6599999999999999, …`: the old context reads `materials` and Find, absent here), the items hash (`expected [ 180, 'a6b0dadf' ] to deeply equal [ 204, 'f19d30c9' ]`) and delve-pair's GOLDEN (`expected [ …(8) ] to deeply equal [ …(8) ]`: the old `dropLuck` adds an undefined Find). The arpg-sim vacuum test still passes (normal foes still drop gear).

- [ ] **Step 3: The gear tables**

In `packages/engine/src/loot/drops.ts`:

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
  kind: MonsterKind;
  /** Total Find in percentage points (gear + door). */
  find: number;
  /** ponytail: the door's `materials` (1 = normal) stands in for its old `dropMult` on the gear counts until B1. */
  materials: number;
  legendaryBoost: number;
  /** First boss kill ever: guarantee the hook legendary. */
  forceLegendary: boolean;
  nextUid: number;
```

with:

```ts
  kind: MonsterKind;
  /** The door's `gear`: multiplies an elite's gear chance (1 = normal). */
  gear: number;
  nextUid: number;
```

Replace:

```ts
/**
 * ponytail: Phase A's stand-in for today's gear counts (`loot.normalDropChance`, `extraDropChance`,
 * `eliteDrops` and `bossDrops`, gone from the data); B1 replaces them with `delve.drops`' tables.
 */
const GEAR_TODAY = { normal: 0.22, extra: 0.05, elite: [2, 3], boss: [3, 4] } as const;

/** Round a fractional count up with probability equal to its fraction. */
```

with:

```ts
/** Round a fractional count up with probability equal to its fraction. */
```

Replace:

```ts
function dropCount(ctx: DropContext, rng: SeededRNG): number {
  const loot = GEAR_TODAY;
  switch (ctx.kind) {
    case 'normal': {
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
```

with:

```ts
/**
 * How many gear items a foe drops (see the crafting spec's drop tables): a
 * normal foe none, an elite one at `drops.elite.gearChance` × the door's
 * `gear` (at most 1), a boss `drops.boss.gear`.
 */
function gearCount(registry: DataRegistry, ctx: DropContext, rng: SeededRNG): number {
  const { elite, boss } = registry.getDelveBalance().drops;
  if (ctx.kind === 'boss') return boss.gear;
  if (ctx.kind === 'elite') return rng.next() < Math.min(1, elite.gearChance * ctx.gear) ? 1 : 0;
  return 0;
}

/** Gear rarity's luck from depth and the foe's kind (Find no longer plays a part). */
export function dropLuck(registry: DataRegistry, ctx: Pick<DropContext, 'depth' | 'kind'>): number {
```

Replace:

```ts
  return ctx.find / 100 + depthLuck + kindLuck;
}

export function rollEncounterDrops(registry: DataRegistry, ctx: DropContext, rng: SeededRNG): DropResult {
  const loot = registry.getDelveBalance().loot;
  const count = dropCount(ctx, rng);
  const luck = dropLuck(registry, ctx);
  const ilvl = ctx.kind === 'boss' ? ctx.depth + 1 : ctx.depth;
```

with:

```ts
  return depthLuck + kindLuck;
}

/** A slain foe's gear: an elite's at its chance, a boss's at least `loot.bossMinRarity` (no `legendaryBoost`). */
export function rollEncounterDrops(registry: DataRegistry, ctx: DropContext, rng: SeededRNG): DropResult {
  const loot = registry.getDelveBalance().loot;
  const count = gearCount(registry, ctx, rng);
  const luck = dropLuck(registry, ctx);
  const ilvl = ctx.kind === 'boss' ? ctx.depth + 1 : ctx.depth;
  const minRarity = ctx.kind === 'boss' ? loot.bossMinRarity : undefined;
```

Replace:

```ts
    let rarity: Rarity;
    if (i === 0 && ctx.forceLegendary) {
      rarity = 'legendary';
    } else {
      const minRarity = ctx.kind === 'boss' && i === 0 ? loot.bossMinRarity : undefined;
      rarity = rollRarity(registry, { luck, minRarity, legendaryBoost: ctx.legendaryBoost }, rng);
    }
```

with:

```ts
    const rarity = rollRarity(registry, { luck, minRarity }, rng);
```

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
      find: loot.find,
      materials: world.door?.mods.materials ?? 1,
      legendaryBoost: loot.legendaryBoost,
      forceLegendary: false, // until Task 4's drop tables take the field out
      nextUid: loot.nextUid,
```

with:

```ts
      gear: world.door?.mods.gear ?? 1,
      nextUid: loot.nextUid,
```

- [ ] **Step 4: Run them to see them pass, then the whole engine**

Run: `(cd packages/engine && npx vitest run tests/delve-loot.test.ts tests/arpg-sim.test.ts tests/delve-pair.test.ts tests/delve-movesets.test.ts)`
Expected: PASS (154 tests).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 24** tests pass, **8** skipped, in **F + 2** files (1685 | 8). Of the pacing rails, 5 pass and the two above are skipped.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-b1
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/combat.ts tests/delve-loot.test.ts tests/arpg-sim.test.ts tests/delve-pair.test.ts tests/delve-movesets.test.ts)
git add packages/engine/src/loot/drops.ts packages/engine/src/arpg/combat.ts packages/engine/tests/delve-loot.test.ts packages/engine/tests/arpg-sim.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-movesets.test.ts packages/engine/tests/delve-pacing.test.ts
git commit -m "feat(engine): gear from the drop tables: none from normals, an elite's at gearChance, a boss's at bossMinRarity; Find and Lucky Charm leave gear" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: Stops spend what the dive banked first

S9: a stop's power-up counts the dive's `banked` scrap, Mana Dust, Links and runes with the stockpile (`stopKinds`, so `rollStop` offers what they buy) and takes its price from `banked` first, then the stockpile; a rune found this dive can be socketed at the stop. `takeStop` runs the op on the pooled profile, as today with the dive lock lifted, and splits what it spent back (`unpool`), so `upgradeGear`, `addSlot` and `socketRune` stay as they are.

**Files:**
- Modify: `packages/engine/tests/delve-stops.test.ts`, `tests/delve-runes.test.ts`, `src/delve/stops.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-stops.test.ts`:

Replace:

```ts
  it('offers 2 or 3 at random in the kinds order, all of them when only two apply', () => {
```

with:

```ts
  it('counts and spends what the dive banked first, then the stockpile (S9)', () => {
    const p = atStop(hero(), { offers: ['slot'], taken: false });
    const banking = (links: number, scrap: number, on: DelveProfile = p) => ({
      ...on,
      dive: { ...on.dive!, banked: { ...on.dive!.banked, links, scrap } },
    });
    const broke = { ...p, links: 0, scrap: 0 };
    expect(stopKinds(registry, broke)).not.toContain('slot');
    expect(stopKinds(registry, banking(1, 20, broke))).toContain('slot');
    // The slot's Link and 20 scrap: the banked Link and 15 scrap, then 5 of the stockpile's.
    const res = takeStop(registry, banking(1, 15, { ...p, links: 2, scrap: 100 }), {
      kind: 'slot',
      skill: 'primary',
    });
    expect(res.ok).toBe(true);
    expect(res.profile).toMatchObject({ links: 2, scrap: 95 });
    expect(res.profile.dive!.banked).toMatchObject({ links: 0, scrap: 0 });
    expect(res.profile.dive!.stop!.taken).toBe(true);
  });

  it('offers 2 or 3 at random in the kinds order, all of them when only two apply', () => {
```

In `packages/engine/tests/delve-runes.test.ts`:

Replace:

```ts
  it("the 'move' stop keeps the saved move's runes, whatever the client sends", () => {
```

with:

```ts
  it('sockets a rune found this dive, out of what the dive banked (S9)', () => {
    const p = atStop({ ...ready(), runes: {} });
    const found = {
      ...p,
      dive: { ...p.dive!, banked: { ...p.dive!.banked, runes: { chain: [1, 0, 0, 0, 0] } } },
    };
    expect(stopKinds(registry, p)).not.toContain('rune');
    expect(stopKinds(registry, found)).toContain('rune');
    const action = { kind: 'rune', skill: 'primary', index: 0, socket: 1, rune: CHAIN_I } as const;
    const res = takeStop(registry, found, action);
    expect(res.ok).toBe(true);
    expect(primaryOf(res.profile).moves[0].runes).toEqual([SPLIT_I, CHAIN_I]);
    expect(res.profile.dive!.banked.runes).toEqual({ chain: [0, 0, 0, 0, 0] });
    expect(res.profile.runes).toEqual({ chain: [0, 0, 0, 0, 0] });
  });

  it("the 'move' stop keeps the saved move's runes, whatever the client sends", () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-stops.test.ts tests/delve-runes.test.ts)`
Expected: FAIL, **2 failed | 51 passed** (53): `expected [ 'equip' ] to include 'slot'` and `expected [ 'slot', 'move', 'upgrade' ] to include 'rune'`.

- [ ] **Step 3: Pool the banked currencies**

In `packages/engine/src/delve/stops.ts`:

Replace:

```ts
import { runeFits, socketsOf } from '../loot/runes.js';
```

with:

```ts
import { runeFits, socketsOf } from '../loot/runes.js';
import { emptyHaul, stockHaul } from '../loot/materials.js';
import type { Haul } from '../types/crafting.js';
```

Replace:

```ts
/**
 * The kinds whose cheapest action `profile` can take and pay for now: `equip`
```

with:

```ts
/**
 * `profile` with its dive's banked scrap, Mana Dust, Links and runes in the
 * stockpile: a stop spends from both (see the crafting spec's S9).
 */
function pooled(profile: DelveProfile): DelveProfile {
  const b = profile.dive?.banked;
  if (!b) return profile;
  const currencies = {
    ...emptyHaul(),
    scrap: b.scrap,
    dust: b.dust,
    links: b.links,
    runes: b.runes,
  };
  return { ...stockHaul(profile, currencies), stats: profile.stats };
}

/**
 * After a stop's op on the pooled profile (`after`): what it spent comes out of
 * `banked` first, the rest out of `before`'s stockpile. Returns the stockpile and
 * what stays banked.
 */
function unpool(
  before: DelveProfile,
  after: DelveProfile,
  banked: Haul,
): { profile: DelveProfile; banked: Haul } {
  // What stays banked: the part of `now` (pooled, after the op) above the old stockpile.
  const keep = (stock: number, now: number, b: number) => Math.min(b, Math.max(0, now - stock));
  const scrap = keep(before.scrap, after.scrap, banked.scrap);
  const dust = keep(before.manaDust, after.manaDust, banked.dust);
  const links = keep(before.links, after.links, banked.links);
  const runes = { ...after.runes };
  const bankedRunes: Haul['runes'] = {};
  for (const [id, counts] of Object.entries(banked.runes)) {
    const left = counts.map((b, t) =>
      keep(before.runes[id]?.[t] ?? 0, after.runes[id]?.[t] ?? 0, b),
    );
    bankedRunes[id] = left;
    if (runes[id]) runes[id] = runes[id].map((n, t) => n - (left[t] ?? 0));
  }
  return {
    profile: {
      ...after,
      scrap: after.scrap - scrap,
      manaDust: after.manaDust - dust,
      links: after.links - links,
      runes,
    },
    banked: { ...banked, scrap, dust, links, runes: bankedRunes },
  };
}

/**
 * The kinds whose cheapest action `profile` can take and pay for now: `equip`
```

Replace:

```ts
 * pay; `rune` with an empty socket and a pouch rune for it (`canSocket`).
 */
export function stopKinds(registry: DataRegistry, profile: DelveProfile): StopKind[] {
  const weapon = profile.equipped.weapon;
```

with:

```ts
 * pay; `rune` with an empty socket and a pouch rune for it (`canSocket`). It
 * counts what the dive has banked with the stockpile.
 */
export function stopKinds(registry: DataRegistry, stockpile: DelveProfile): StopKind[] {
  const profile = pooled(stockpile);
  const weapon = profile.equipped.weapon;
```

Replace:

```ts
  const kinds = stopKinds(registry, profile);
  if (kinds.length === 0) return null;
```

with:

```ts
  const kinds = stopKinds(registry, { ...profile, dive });
  if (kinds.length === 0) return null;
```

Replace:

```ts
 * sockets a pouch rune into an empty socket, free. A refused op leaves the
 * stop open; one taken marks it taken. Skipping is choosing a door.
 */
```

with:

```ts
 * sockets a pouch rune into an empty socket, free. It spends what the dive
 * has banked first, then the stockpile (so a rune found this dive can be
 * socketed). A refused op leaves the stop open; one taken marks it taken.
 * Skipping is choosing a door.
 */
```

Replace:

```ts
  const res = runStop(registry, { ...profile, dive: null }, action);
  if (!res.ok) return { ...res, profile };
  return { ...res, profile: { ...res.profile, dive: { ...dive, stop: { ...stop, taken: true } } } };
```

with:

```ts
  const res = runStop(registry, { ...pooled(profile), dive: null }, action);
  if (!res.ok) return { ...res, profile };
  const spent = unpool(profile, res.profile, dive.banked);
  const taken = { ...dive, banked: spent.banked, stop: { ...stop, taken: true } };
  return { ...res, profile: { ...spent.profile, dive: taken } };
```

- [ ] **Step 4: Run them to see them pass, then the whole engine**

Run: `(cd packages/engine && npx vitest run tests/delve-stops.test.ts tests/delve-runes.test.ts)`
Expected: PASS (53 tests).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 26** tests pass, **8** skipped, in **F + 2** files (1687 | 8).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-b1
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/stops.ts tests/delve-stops.test.ts tests/delve-runes.test.ts)
git add packages/engine/src/delve/stops.ts packages/engine/tests/delve-stops.test.ts packages/engine/tests/delve-runes.test.ts
git commit -m "feat(engine): stops spend what the dive banked first, then the stockpile" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

```bash
cd /c/Projects/alloy-craft-b1
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
git status --short
```

Expected:
- The engine: no type errors; **1687 passed | 8 skipped** tests (N + 26 passed; 3 more skipped: X1's test and X3's two rails) in **90 passed | 1 skipped** files (F + 2). Of the pacing rails 5 run and pass ("first dive is a short scouting run", "keeps progressing dive over dive", "a Frost primary progresses too", "mana combos happen naturally", "floors are a snackable length"); "legendaries arrive" and "no pair runs away or stalls" are skipped for B3.
- tsup's "Build success" lines (ESM, CJS, DTS).
- The client, on the new bundle: no type errors; **1169 tests in 146 files**, as at the base (the client is not edited; it already calls `closeDive(registry, profile)`, and the new `DropKind`, `Drop.pattern` and `BankResult.patterns` are additions).
- `git status --short` lists nothing under `packages/` (five commits on `craft/b1`).
- Determinism: `delve-banking.test.ts`' "a seeded dive plays out the same" runs two seeded dives twice through the real-time sim, drops, banking and settle, and gets the same profile; the material, rune, gear, salvage and death draws each come from their own seeded fork (`materials:<nextUid>`, `runes:<nextUid>`, `loot:<nextUid>`, `death:<dive seed>`).
- Phase A's temporary paths are gone: `GEAR_TODAY`, the forced first-boss legendary, kill scrap credited on the kill, `ITEM_PICKUP_DELAY` and the 10/18 magnet speeds, Lucky Charm on gear rarity, `firstEssenceGiven` set at any bank (`grep -n "ponytail" packages/engine/src/loot/drops.ts packages/engine/src/arpg/combat.ts` finds none).
