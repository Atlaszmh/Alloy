# Delve component crafting (stage 4c) · Phase B · B2: Forge and salvage — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill in the engine's forge and salvage behind Phase A's stubs: the roll formula with the attunement floor (every crafted affix line and a forged legendary's power), `previewForge` and `forgeItem` (one code path, the preview minus the draws; S7's weapon extras), the `forge`, `hone`, `imprint`, `refine` and `buyShard` profile ops with the dive lock and every refusal, Reforge clearing a shard's band and taking the floor, refining 3 → 1, and salvage through one `applySalvage` (scrap, a shard of a line at the tier its roll reaches and maybe a second, a legendary's essence, the pattern, Mana Dust, Links and runes), keyed on the item, into the floor's haul mid-dive and the stockpile at the Anvil. Lucky Charm stops touching gear rarity (S5).

**Architecture:** `loot/item-generator.ts` gains the band roll (`rollBand`, `rollAffix`'s `{ band, floor }`, `affixValue`, `implicitValue`) and exports `rollImplicit` and `generateRareName`; a drop's rolls stay bit for bit as they were. `loot/forge.ts` holds `rollFloor`, `forgedMoveset` (S7), `forgeInputs`, `previewForge` (never throws for the data's ids; `forgeItem` calls it and rolls its lines), `honeLine`, `imprintLine`, `imprintRefusal` and the prices. `loot/materials.ts` gains `materialCount`, `withMaterial`, `refinedRef` and `refineCost`. `loot/salvage-yield.ts` holds `salvageYield`, `salvageRng` and `applySalvage`. `delve/crafting.ts` holds the profile ops, each drawing on `forge:${forgeCount}` (`forgeRng`, now exported from `delve/profile.ts`) and moving the count on. `delve/profile.ts`'s `addLootToBag` and `salvageItems` melt through one `melt` over `applySalvage`, and `BagInsertResult` reports the `shards`, `patterns` and `essences` (for B1's `bankWorld`).

**Tech Stack:** TypeScript 5.7, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-02-delve-component-crafting-design.md` (authoritative): "Forging an item", "The roll formula", "The 'just right' sinks", "Salvage", "The materials" (refining), the shard bench, S4, S5, S7, "Phases and parallel areas" (the B2 row). The contract is `01-contract.md` (Phase A, merged); the overview is `00-overview.md` in this folder.

---

## Base

- **Starts from:** `craft/main` at `a53a85f` (Phase A merged), in this area's worktree `C:/Projects/alloy-craft-b2` on branch `craft/b2`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-craft-b2 -Branch craft/b2 -Base craft/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-craft-b2` in Git Bash.
- **Runs beside B1** (drops and banking), which owns `loot/drops.ts`, `delve/dive.ts` and the arena files; this plan never edits them (see "Cross-area needs").
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-craft-b2
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the engine suite reads **1661 passed | 5 skipped** tests in **88 passed | 1 skipped** files (the pacing rails included); the client suite **1169 tests in 146 files**. Call them **N** engine tests in **F** files; each task below says where they go. The plan ends at N + 45 tests in F + 3 files.

## Files

| File | Change |
|---|---|
| `packages/engine/src/loot/item-generator.ts` | `implicitValue`, `rollBand`, `affixValue`; `rollAffix(…, opts: { band?, floor? })` (a band is kept on the line); `rollImplicit` and `generateRareName` exported; `rarityWeights` ignores `legendaryBoost` (S5; the field stays, marked `ponytail:`, until B1's `drops.ts` stops passing it). Hand-edited, never formatted |
| `packages/engine/src/loot/smithing.ts` | `reforgeAffix(…, floor = 0)`: the new line takes the floor and no band. Hand-edited, never formatted |
| `packages/engine/src/loot/forge.ts` | the stubs filled: `rollFloor`, `forgedMoveset` (S7), `forgeInputs`, `previewForge`, `forgeItem`, `imprintRefusal`, `honeLine`, `imprintLine`, `honeCost`, `imprintCost` |
| `packages/engine/src/loot/materials.ts` | `materialCount`, `withMaterial`, `refinedRef`; `refineCost` filled |
| `packages/engine/src/loot/salvage-yield.ts` | the stubs filled: `salvageYield`, `salvageRng`, `applySalvage` (gains `opts.unsocket`) |
| `packages/engine/src/delve/crafting.ts` | the stubs filled: `forge`, `hone`, `imprint`, `refine`, `buyShard` |
| `packages/engine/src/delve/profile.ts` | `forgeRng` exported; `reforgeGear` takes the floor; `Melted`, `melt`; `addLootToBag` and `salvageItems` through `applySalvage`; `BagInsertResult` gains `shards`, `patterns`, `essences` |
| `packages/engine/src/types/crafting.ts` | `ForgePreview.weapon`'s comment: `slots` are the extra slots past each skill's base (C2 reads them so) |
| `packages/engine/tests/delve-forge.test.ts` (new) | the roll formula, the floor, Reforge, `previewForge`, `forgeItem`, `forge`, Hone, Imprint |
| `packages/engine/tests/delve-refine.test.ts` (new) | the pouch helpers, `refineCost`, `refine`, the shard bench, the tier tables' consistency |
| `packages/engine/tests/delve-salvage-yield.test.ts` (new) | `salvageYield`, `applySalvage`, `salvageRng`, `salvageItems` and `addLootToBag` through it |
| `packages/engine/tests/delve-loot.test.ts` | Lucky Charm's test: the boost no longer touches the rarity weights |
| `packages/engine/tests/delve-movesets.test.ts`, `delve-pair.test.ts`, `delve-runes.test.ts` | mid-dive auto-salvage fills the floor's haul, not the stockpile |
| `packages/engine/tests/delve-crafting-contract.test.ts` | one test's title ("none until B2" goes) |

No client file changes: the store's actions (Phase A) already call these ops.

## Cross-area needs

**X1 · B1 (`delve/dive.ts`, `bankWorld`).** Mid-dive, `addLootToBag` now puts what it melts into `dive.haul` (the spec's Salvage), so `bankWorld` must build its dive from the profile `addLootToBag` returns, not from the dive it read before:

after `let next = bagged.profile;`, spread `next.dive!` where it now spreads `dive` (the dive read by `requireDive(profile)` before the melt): the two differ only in the `haul` the melt filled, which spreading the old one drops. `BagInsertResult` (`delve/profile.ts`) reports `scrap`, `dust`, `links`, `runes`, `destroyed` as before and now `shards`, `patterns` and `essences`; mid-dive none of them is in the stockpile any more (patterns are learned at once), so `bankWorld`'s counters (`dustEarned`, `linksEarned`, the found log) read them from the result. On B2's branch alone, `bankWorld` drops the melt's haul (Task 6's tests say so); nothing settles a haul until B1's `settleDive`.

**X2 · B1 (`loot/drops.ts`, `rollEncounterDrops`).** Stop passing `legendaryBoost` to `rollRarity` (Lucky Charm doubles only the essence chance, S5). Then the integrator deletes `RarityRollContext.legendaryBoost` and its `ponytail:` comment in `loot/item-generator.ts` (two lines; it is ignored from Task 1 on, but deleting it before B1's change breaks `drops.ts`'s typecheck and the bundle's DTS build).

**X3 · Phase D (S8, the starter kit).** A new save holds 5 Rusty bars and 1 uncommon flux but **0 scrap**, and the first forge costs `forgeScrap.common` (10) × 1 at least, so S8's "the first forge is possible before any dive" doesn't hold with Phase A's numbers. Either give the kit scrap (a `startingMaterials` field is Phase A's shape: a type and schema change) or set `forgeScrap.common`/`uncommon` to 0; Phase D's pacing targets decide.

**X4 · C2 (the Forge tab), what it reads.** `previewForge` never throws for a request built from the data's ids (a base or metal id the data lacks is a programming error and throws); `lines.length` is always the rarity's `loot.affixCount` (shards past it, or a shard whose affix or tier doesn't exist, become random lines and refuse); `weapon.slots` holds each carried skill's **extra** slots past its base (`{ basic: 0, primary: 2, … }`); the refusal codes are Phase A's (`locked`, `pattern`, `essence`, `essenceSlot`, `shardSlot`, `shardDuplicate`, `shardCount`, `materials`, `scrap`, `dust`, `bagFull`; a tier an affix doesn't have refuses as `materials`), checked in that order, with the reasons below. `forge` returns the new `item` and records the find. `refineCost` is null for essences, Dust, Links, the top metal and flux, and a shard at its affix's last tier. `honeCost` and `imprintCost` take any item. Also exported for the bench: `forgeInputs(req)` (what a forge consumes), `materialCount(pouch, ref)`, `withMaterial`, `refinedRef(registry, ref)` (the grade a refine makes), `imprintRefusal(registry, item, line, shard)` (to grey a shard), `rollFloor(registry, profile, element)`.

**X5 · C3 (the Loadout's Salvage).** `salvageYield(registry, profile, item)`'s `shards` lists every line's shard (one of them is given, plus a second from another line with chance `extraShard`); a legendary lists none and names its `essence`.

**X6 · B3 (the autopilot).** `salvageItems` now gives shards, patterns and essences and moves `forgeCount` on once a call; `reforgeGear` takes the floor. The pacing rails pass unchanged on this branch (the autopilot salvages at the Anvil; mid-dive it rarely fills its bag).

## Where the spec left room

1. **S7's placement.** "Extra slots to the Primary first, then Basic, Ultimate, Defensive": the Primary fills to its cap (`chains.cap`) before Basic gets one, and so on (carried skills only). "Sockets on the Primary's first moves first": one socket a move, the Primary's moves in order, then Basic's, Ultimate's and Defensive's, round after round up to the rarity's `socketCap`. A legendary sword (3 slots, 2 sockets) comes out with a 4-move Primary socketed `[1, 1, 0, 0]`.
2. **Imprint's duplicate check** leaves out the line being replaced: "an affix already on the item" means on another line, so a line can take a better shard of its own affix (the sink the Temper bench is for).
3. **A legendary's salvage** gives its essence and no shard at all (no extra-shard chance).
4. **`forgeCount` on salvage** moves on once per `salvageItems` (or Anvil-side `addLootToBag`) call, after every item has drawn on `salvage:${forgeCount}:${uid}`; the uid keeps the items apart. Mid-dive it doesn't move (the dive seed keys it).
5. **`applySalvage` doesn't remove the item**: `salvageItems` takes it out of the bag, and auto-salvaged loot never went in.
6. **The floor before the choice:** with no primary every element is "in the pair" (`inPair`), so the floor reads that element's attunement; with a primary and no secondary, only the primary is.
7. **`ForgeLinePreview.range`** is the shard band's two ends at the item level, without the floor; `floor` is reported beside it.
8. **Refusal reasons:** "Forge at the Anvil, between dives", "Learn this pattern first", "No such essence", "An essence needs epic flux", "<Legendary> doesn't fit this pattern", "<Affix> doesn't roll on this pattern", "Only one <Affix> shard", "Too many shards: <n> lines at <rarity>", "Missing materials", "Not enough scrap", "Not enough Mana Dust", "Bag is full". Hone and Imprint: "Item not found", "No such affix", "<Affix> doesn't roll on this item", "No such shard", "Already on this item", "Missing the shard", "Not enough scrap". Refine: "Doesn't refine any higher", "Needs <count> to refine", "Not enough scrap". The bench: "No such affix", "Not enough scrap", "Not enough Mana Dust".
9. **The items hash** in `tests/delve-movesets.test.ts` stays: `rollAffix` without options draws exactly as before, so a drop is bit for bit what it was. Only B1's drop flow re-pins it.
10. **Lucky Charm** (the coordinator's note on S5): `rarityWeights` ignores `legendaryBoost` from Task 1; see X2 for the field.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `craft/b2`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-craft-b2`.
- **Line endings:** the worktree checks these files out CRLF; keep each file's own (the Edit tool does). New files are written LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** the commit blocks format only files a task creates or files that pass `prettier --check` at the base; the code below is already formatted (checked on the scratch copy), so `--write` changes nothing typed as written. `loot/item-generator.ts` and `loot/smithing.ts` were not clean at the base and are **only hand-edited, never formatted**. Never touch `packages/engine/tests/delve-chain-feel.test.ts` (raw 0xD7 byte).
- **How the edits read:** "In `f`, replace:" A "with:" B is one Edit (old A, new B). "In `f`, replace the lines from `A` up to (not including) `B` with:" C is one Edit whose old text runs from the start of the line that reads `A` (ignoring its indentation) to the end of the line before the one that reads `B`, and whose new text is C. "Append to `f`:" adds a blank line and the block after the last line. "Create `f`:" and "Overwrite `f`:" are a Write. Within a file, apply its edits top to bottom; every anchor is unique in its file at that point.
- **Import cycles:** `delve/profile.ts`, `dive.ts`, `pair.ts`, `hero-stats.ts`, `moveset.ts`, `runes.ts` import each other, and now `loot/forge.ts` and `loot/salvage-yield.ts` import `delve/dive.ts`, `pair.ts`, `moveset.ts` and `runes.ts` while `delve/profile.ts` imports them back: read such an import only inside a function (all of them do).
- **Every engine task runs the whole engine suite** (about 30 s; the pacing rails run while the files load) and the engine typecheck. Vitest doesn't type-check tests.
- **Checked on a scratch copy:** `git archive` of `craft/main` at `a53a85f` with junctioned `node_modules`; each task's edits were applied from this file by a script that checks every anchor once in its file (in order), every FAIL and PASS below was run on the result, then the whole engine suite, the typecheck and `prettier --check` of every file a commit block formats; after Task 6 the bundle was rebuilt and the client suite and typecheck run.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine bundle (the client's) | `(cd packages/engine && npx tsup)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |

---

## Chunk 1: The roll formula

### Task 1: The band roll and the attunement floor; Reforge clears the band; Lucky Charm leaves gear rarity

The spec's roll formula (`u = floor + (1 − floor) × r`, `roll = bmin + (bmax − bmin) × u`) as one `rollBand`, used by `rollAffix` when a line has a band or a floor; `rollFloor` reads the hero's attunement in the item's element (S4). Reforge rolls its new line at the rarity's band (a shard's band goes) with the floor. A drop's rolls are unchanged.

**Files:**
- Create: `packages/engine/tests/delve-forge.test.ts`
- Modify: `packages/engine/tests/delve-loot.test.ts`, `packages/engine/src/loot/item-generator.ts`, `packages/engine/src/loot/smithing.ts`, `packages/engine/src/loot/forge.ts`, `packages/engine/src/delve/profile.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-forge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem, rollAffix, rollBand } from '../src/loot/item-generator.js';
import { reforgeAffix } from '../src/loot/smithing.js';
import { rollFloor } from '../src/loot/forge.js';
import { profileStats } from '../src/delve/pair.js';
import { createDelveProfile, reforgeGear } from '../src/delve/profile.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';

// See the crafting spec: "The roll formula", "Forging an item", "The 'just right' sinks".

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();
const C = bal.crafting;

/** A Fire hero at the Anvil; `attune` more Fire attunement from a ring. */
function hero(attune = 0): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  if (!attune) return p;
  const ring = generateItem(
    registry,
    { uid: 'ring', ilvl: 1, rarity: 'common', slot: 'ring', mana: 'fire' },
    new SeededRNG(1),
  );
  const line = { stat: 'fireAttune' as const, value: attune, roll: 1 };
  return { ...p, equipped: { ...p.equipped, ring: { ...ring, affixes: [line] } } };
}

/** A rare pair of Fire gloves at item level 10. */
const gloves = (): GearItem =>
  generateItem(
    registry,
    { uid: 'r1', ilvl: 10, rarity: 'rare', slot: 'gloves', mana: 'fire' },
    new SeededRNG(1),
  );

describe('the roll formula', () => {
  it('lifts the whole draw within the band: u = floor + (1 − floor) × r', () => {
    const r = new SeededRNG(3).next();
    expect(rollBand([0.2, 0.5], 0, new SeededRNG(3))).toBeCloseTo(0.2 + 0.3 * r, 12);
    expect(rollBand([0.2, 0.5], 0.5, new SeededRNG(3))).toBeCloseTo(
      0.2 + 0.3 * (0.5 + 0.5 * r),
      12,
    );
    for (let seed = 1; seed <= 200; seed++) {
      const roll = rollBand([0.2, 0.5], 0.4, new SeededRNG(seed));
      expect(roll).toBeGreaterThanOrEqual(0.2 + 0.3 * 0.4);
      expect(roll).toBeLessThan(0.5);
    }
  });

  it("rolls an affix in a shard's band, kept on the line; else the rarity's, as drops always have", () => {
    const def = registry.getGearAffix('critChance')!;
    const shard = rollAffix(registry, def, 10, 'rare', new SeededRNG(4), {
      band: [0.6, 0.85],
      floor: 0.3,
    });
    expect(shard.band).toEqual([0.6, 0.85]);
    expect(shard.roll).toBeGreaterThanOrEqual(0.6 + 0.25 * 0.3);
    const plain = rollAffix(registry, def, 10, 'rare', new SeededRNG(4));
    const min = bal.loot.minRoll.rare;
    expect(plain.band).toBeUndefined();
    expect(plain.roll).toBe(min + (1 - min) * new SeededRNG(4).next());
  });
});

describe('the attunement floor', () => {
  it("is min(cap, perPoint × the hero's attunement) in the pair, 0 outside it", () => {
    const p = hero();
    const fire = profileStats(registry, p).attunement.fire;
    expect(fire).toBeGreaterThan(0);
    expect(rollFloor(registry, p, 'fire')).toBeCloseTo(C.attuneRoll.perPoint * fire, 12);
    expect(rollFloor(registry, p, 'frost')).toBe(0);
    expect(rollFloor(registry, hero(100), 'fire')).toBe(C.attuneRoll.cap);
  });

  it('counts every element before the choice', () => {
    const p = createDelveProfile(registry, 3);
    const earth = profileStats(registry, p).attunement.earth; // the starter chest
    expect(rollFloor(registry, p, 'earth')).toBeCloseTo(C.attuneRoll.perPoint * earth, 12);
  });
});

describe('Reforge', () => {
  it("clears the line's band and takes the floor", () => {
    const item = gloves();
    const banded = {
      ...item,
      affixes: item.affixes.map((a, i) =>
        i === 0 ? { ...a, band: [0.8, 1] as [number, number] } : a,
      ),
    };
    const min = bal.loot.minRoll.rare;
    for (let seed = 1; seed <= 50; seed++) {
      const out = reforgeAffix(registry, banded, 0, new SeededRNG(seed), 0.5);
      expect(out.affixes[0].band).toBeUndefined();
      expect(out.affixes[0].roll).toBeGreaterThanOrEqual(min + (1 - min) * 0.5);
    }
  });

  it("at the Anvil takes the hero's floor for the item's element", () => {
    const min = bal.loot.minRoll.rare;
    let p: DelveProfile = { ...hero(100), bag: [gloves()], scrap: 1e6 };
    for (let i = 0; i < 10; i++) {
      const res = reforgeGear(registry, p, 'r1', 1);
      expect(res.ok).toBe(true);
      expect(res.item!.affixes[1].roll).toBeGreaterThanOrEqual(min + (1 - min) * C.attuneRoll.cap);
      p = res.profile;
    }
  });
});
```

In `packages/engine/tests/delve-loot.test.ts`, replace:

```ts
  it("Lucky Charm's boost multiplies only the legendary weight", () => {
    const w0 = rarityWeights(registry, { luck: 0 });
    const w2 = rarityWeights(registry, { luck: 0, legendaryBoost: 2 });
    expect(w2.legendary).toBe(w0.legendary * 2);
    expect(w2.common).toBe(w0.common);
  });
```

with:

```ts
  it("ignores Lucky Charm's boost: it doubles only the essence odds (the crafting spec's S5)", () => {
    const w0 = rarityWeights(registry, { luck: 0 });
    expect(rarityWeights(registry, { luck: 0, legendaryBoost: 2 })).toEqual(w0);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-forge.test.ts tests/delve-loot.test.ts)`
Expected: FAIL, 7 tests in 2 files: `TypeError: (0 , rollBand) is not a function` and `(0 , rollFloor) is not a function`; the shard line carries no band (`expected undefined to deeply equal [ 0.6, 0.85 ]`); Reforge rolls under the floor (`expected 0.20089063621126116 to be greater than or equal to 0.55`); Lucky Charm still doubles the legendary weight (`expected { common: 55, uncommon: 28, …(4) } to deeply equal { common: 55, uncommon: 28, …(4) }`).

- [ ] **Step 3: The band roll**

In `packages/engine/src/loot/item-generator.ts`, replace:

```ts
  /** Extra multiplier on legendary weight (Lucky Charm). */
```

with:

```ts
  // ponytail: ignored since stage 4c (the crafting spec's S5: Lucky Charm doubles only the essence
  // odds); delete it once loot/drops.ts (B1) stops passing it.
```

In `packages/engine/src/loot/item-generator.ts`, replace the lines from `function rollImplicit(` up to (not including) `/** Affix definitions that may roll on a slot, excluding stats already present. */` with:

```ts
/** An implicit's value at `roll` (0–1), an item level and a rarity. */
export function implicitValue(
  registry: DataRegistry,
  template: ImplicitTemplate,
  ilvl: number,
  rarity: Rarity,
  roll: number,
): number {
  const loot = registry.getDelveBalance().loot;
  const scale = template.scaling === 'flat' ? itemLevelScale(registry, ilvl) : 1;
  const raw = template.base * scale * loot.rarityBaseMult[rarity] * (0.9 + 0.2 * roll);
  return roundStat(raw, decimalsFor(registry, template.stat), template.scaling === 'flat');
}

export function rollImplicit(
  registry: DataRegistry,
  template: ImplicitTemplate,
  ilvl: number,
  rarity: Rarity,
  rng: SeededRNG,
): StatRoll {
  const roll = rng.next();
  return { stat: template.stat, value: implicitValue(registry, template, ilvl, rarity, roll), roll };
}

/**
 * A roll in `band` with the attunement floor (see the crafting spec's roll
 * formula): `u = floor + (1 − floor) × r`, then `band[0] + (band[1] − band[0]) × u`,
 * so the floor lifts the whole draw within the band.
 */
export function rollBand(band: readonly [number, number], floor: number, rng: SeededRNG): number {
  const u = floor + (1 - floor) * rng.next();
  return band[0] + (band[1] - band[0]) * u;
}

/** An affix's value at `roll` (0–1 in its full range) and an item level. */
export function affixValue(registry: DataRegistry, def: GearAffixDef, ilvl: number, roll: number): number {
  const scale = def.scaling === 'flat' ? itemLevelScale(registry, ilvl) : 1;
  const raw = (def.min + (def.max - def.min) * roll) * scale;
  return roundStat(raw, def.decimals, def.unit === 'flat');
}

/**
 * Roll one affix of the given definition at an item level and rarity: in
 * `opts.band` (a shard's, stored on the line), else the rarity's `[minRoll, 1]`
 * (not stored), lifted by `opts.floor` (the attunement floor; drops take none).
 */
export function rollAffix(
  registry: DataRegistry,
  def: GearAffixDef,
  ilvl: number,
  rarity: Rarity,
  rng: SeededRNG,
  opts: { band?: [number, number]; floor?: number } = {},
): StatRoll {
  const band = opts.band ?? [registry.getDelveBalance().loot.minRoll[rarity], 1];
  const roll = rollBand(band, opts.floor ?? 0, rng);
  const line: StatRoll = { stat: def.stat, value: affixValue(registry, def, ilvl, roll), roll };
  if (opts.band) line.band = [opts.band[0], opts.band[1]];
  return line;
}

```

(With no options the draw is `minRoll + (1 − minRoll) × r` exactly as before, `0 + 1 × r` being `r`, so every drop rolls bit for bit as it did.)

In `packages/engine/src/loot/item-generator.ts`, replace:

```ts
function generateRareName(registry: DataRegistry, slot: GearSlot, rng: SeededRNG): string {
```

with:

```ts
export function generateRareName(registry: DataRegistry, slot: GearSlot, rng: SeededRNG): string {
```

In `packages/engine/src/loot/item-generator.ts`, replace:

```ts
    let w = loot.rarityWeights[rarity] * Math.pow(1 + luck, i * loot.luckExponent);
    if (rarity === 'legendary') w *= ctx.legendaryBoost ?? 1;
```

with:

```ts
    const w = loot.rarityWeights[rarity] * Math.pow(1 + luck, i * loot.luckExponent);
```

- [ ] **Step 4: Reforge and the floor**

In `packages/engine/src/loot/smithing.ts`, replace:

```ts
/** Replace the affix at `index` with a freshly rolled, different stat. */
export function reforgeAffix(registry: DataRegistry, item: GearItem, index: number, rng: SeededRNG): GearItem {
```

with:

```ts
/**
 * Replace the affix at `index` with a freshly rolled, different stat: at the
 * rarity's band (a shard's `band` goes) and lifted by `floor`, the attunement
 * floor (see the crafting spec).
 */
export function reforgeAffix(
  registry: DataRegistry,
  item: GearItem,
  index: number,
  rng: SeededRNG,
  floor = 0,
): GearItem {
```

In `packages/engine/src/loot/smithing.ts`, replace:

```ts
  affixes[index] = rollAffix(registry, def, item.ilvl, item.rarity, rng);
```

with:

```ts
  affixes[index] = rollAffix(registry, def, item.ilvl, item.rarity, rng, { floor });
```

In `packages/engine/src/loot/forge.ts`, replace:

```ts
import type { GearItem } from '../types/gear.js';
```

with:

```ts
import type { GearItem } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { inPair, profileStats } from '../delve/pair.js';
```

In `packages/engine/src/loot/forge.ts`, replace:

```ts
 * math. Stage 4c's B2 fills these; until then each throws.
 */
```

with:

```ts
 * math. `forgeItem` rolls exactly what `previewForge` shows.
 */

/**
 * The attunement floor on an item of `element` (see the crafting spec's roll
 * formula): in the hero's pair, min(cap, perPoint × the hero's attunement in
 * it); outside it, 0.
 */
export function rollFloor(
  registry: DataRegistry,
  profile: DelveProfile,
  element: ManaType,
): number {
  if (!inPair(profile, element)) return 0;
  const { perPoint, cap } = registry.getDelveBalance().crafting.attuneRoll;
  return Math.min(cap, perPoint * profileStats(registry, profile).attunement[element]);
}
```

In `packages/engine/src/delve/profile.ts`, replace:

```ts
import { emptyMaterials } from '../loot/materials.js';
```

with:

```ts
import { emptyMaterials } from '../loot/materials.js';
import { rollFloor } from '../loot/forge.js';
```

In `packages/engine/src/delve/profile.ts`, replace:

```ts
  const item = reforgeAffix(registry, found.item, affixIndex, forgeRng(profile));
```

with:

```ts
  const floor = rollFloor(registry, profile, found.item.mana);
  const item = reforgeAffix(registry, found.item, affixIndex, forgeRng(profile), floor);
```

- [ ] **Step 5: Run them to see them pass, then the whole engine**

Run: `(cd packages/engine && npx vitest run tests/delve-forge.test.ts tests/delve-loot.test.ts)`
Expected: PASS (29 tests in 2 files).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 6** tests pass in **F + 1** files (5 skipped, 1 file skipped), the pacing rails included. The items hash in `tests/delve-movesets.test.ts` still reads `49e20fb6` (a drop rolls as before).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-craft-b2
npx prettier --write --end-of-line auto packages/engine/src/loot/forge.ts packages/engine/src/delve/profile.ts packages/engine/tests/delve-forge.test.ts packages/engine/tests/delve-loot.test.ts
git add packages/engine/src/loot/item-generator.ts packages/engine/src/loot/smithing.ts packages/engine/src/loot/forge.ts packages/engine/src/delve/profile.ts packages/engine/tests/delve-forge.test.ts packages/engine/tests/delve-loot.test.ts
git commit -m "feat(engine): the band roll and the attunement floor; Reforge clears a shard's band; Lucky Charm leaves gear rarity" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 2: Refining and the shard bench

### Task 2: `refineCost`, `refine` and `buyShard`

Refining 3 → 1 for metals, flux and shards (a shard by its affix's own tier count), refused at the top; the shard bench's tier I shard. The pouch helpers every crafting op uses (`materialCount`, `withMaterial`) come with it. The tier tables' consistency test (the coordinator's note) guards the data for Phase D: it passes from the start.

**Files:**
- Create: `packages/engine/tests/delve-refine.test.ts`
- Modify: `packages/engine/src/loot/materials.ts`, `packages/engine/src/delve/crafting.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-refine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import {
  emptyMaterials,
  materialCount,
  refineCost,
  shardTiersOf,
  withMaterial,
} from '../src/loot/materials.js';
import { buyShard, refine } from '../src/delve/crafting.js';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { FLUX_GRADES, type MaterialRef } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';

// See the crafting spec: "The materials" (refining 3 → 1), the shard bench, "Tuning".

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();
const C = bal.crafting;
const R = C.refine;
const FORGE_LOCKED = 'Forge at the Anvil, between dives';

/** A Fire hero holding only `materials`, with scrap and Mana Dust to spare. */
function hero(...materials: [MaterialRef, number][]): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  const pouch = materials.reduce((m, [ref, n]) => withMaterial(m, ref, n), emptyMaterials());
  return { ...p, materials: pouch, scrap: 1000, manaDust: 100 };
}

const iron: MaterialRef = { kind: 'metal', metal: 'iron' };
const armor = (tier: number): MaterialRef => ({ kind: 'shard', stat: 'armor', tier });

describe('the pouch', () => {
  it('counts a material and adds or takes it', () => {
    const m = withMaterial(withMaterial(emptyMaterials(), armor(2), 3), iron, 2);
    expect(materialCount(m, armor(2))).toBe(3);
    expect(materialCount(m, armor(1))).toBe(0);
    expect(materialCount(m, iron)).toBe(2);
    expect(materialCount(withMaterial(m, armor(2), -1), armor(2))).toBe(2);
    expect(materialCount(m, { kind: 'dust' })).toBe(0);
  });
});

describe('refineCost', () => {
  it('prices metals, flux and shards by the data (a shard by the tier refined)', () => {
    expect(refineCost(registry, { kind: 'metal', metal: 'rusty' })).toEqual(R.metal);
    expect(refineCost(registry, { kind: 'flux', grade: 'uncommon' })).toEqual(R.flux);
    for (const tier of [1, 2, 3, 4])
      expect(refineCost(registry, armor(tier))).toEqual({
        count: R.shard.count,
        scrap: R.shard.scrap[tier - 1],
      });
  });

  it("is null at the top grade, past an affix's own tiers, and for essences, Mana Dust and Links", () => {
    expect(refineCost(registry, { kind: 'metal', metal: 'voidforged' })).toBeNull();
    expect(refineCost(registry, { kind: 'flux', grade: 'epic' })).toBeNull();
    expect(refineCost(registry, armor(5))).toBeNull();
    expect(shardTiersOf(registry, 'fireAttune')).toHaveLength(2);
    expect(refineCost(registry, { kind: 'shard', stat: 'fireAttune', tier: 1 })).not.toBeNull();
    expect(refineCost(registry, { kind: 'shard', stat: 'fireAttune', tier: 2 })).toBeNull();
    expect(refineCost(registry, { kind: 'essence', essence: 'pyroclasm' })).toBeNull();
    expect(refineCost(registry, { kind: 'dust' })).toBeNull();
    expect(refineCost(registry, { kind: 'links' })).toBeNull();
  });
});

describe('refine', () => {
  it('turns count of a grade and scrap into one of the next', () => {
    const p = hero([iron, 4]);
    const res = refine(registry, p, iron);
    expect(res.ok).toBe(true);
    expect(materialCount(res.profile.materials, iron)).toBe(4 - R.metal.count);
    expect(materialCount(res.profile.materials, { kind: 'metal', metal: 'steel' })).toBe(1);
    expect(res.profile.scrap).toBe(p.scrap - R.metal.scrap);

    const flux = refine(registry, hero([{ kind: 'flux', grade: 'magic' }, 3]), {
      kind: 'flux',
      grade: 'magic',
    });
    expect(materialCount(flux.profile.materials, { kind: 'flux', grade: 'rare' })).toBe(1);

    const shard = refine(registry, hero([armor(2), 3]), armor(2));
    expect(materialCount(shard.profile.materials, armor(2))).toBe(0);
    expect(materialCount(shard.profile.materials, armor(3))).toBe(1);
    expect(shard.profile.scrap).toBe(1000 - R.shard.scrap[1]);
  });

  it('refuses with a reason, changing nothing', () => {
    const p = hero([iron, 2], [{ kind: 'metal', metal: 'voidforged' }, 9]);
    expect(refine(registry, p, iron)).toEqual({
      ok: false,
      profile: p,
      reason: `Needs ${R.metal.count} to refine`,
    });
    expect(refine(registry, p, { kind: 'metal', metal: 'voidforged' }).reason).toBe(
      "Doesn't refine any higher",
    );
    expect(refine(registry, p, { kind: 'dust' }).reason).toBe("Doesn't refine any higher");
    expect(refine(registry, { ...hero([iron, 3]), scrap: 0 }, iron).reason).toBe(
      'Not enough scrap',
    );
    expect(refine(registry, startDive(registry, hero([iron, 3]), 1), iron).reason).toBe(
      FORGE_LOCKED,
    );
  });
});

describe('the shard bench', () => {
  it('sells a tier I shard for scrap and Mana Dust', () => {
    const p = hero();
    const res = buyShard(registry, p, 'critChance');
    expect(res.ok).toBe(true);
    expect(
      materialCount(res.profile.materials, { kind: 'shard', stat: 'critChance', tier: 1 }),
    ).toBe(1);
    expect(res.profile.scrap).toBe(p.scrap - C.shardBench.scrap);
    expect(res.profile.manaDust).toBe(p.manaDust - C.shardBench.dust);
  });

  it('refuses with a reason', () => {
    const p = hero();
    expect(buyShard(registry, { ...p, scrap: 0 }, 'armor').reason).toBe('Not enough scrap');
    expect(buyShard(registry, { ...p, manaDust: 0 }, 'armor').reason).toBe('Not enough Mana Dust');
    expect(buyShard(registry, startDive(registry, p, 1), 'armor').reason).toBe(FORGE_LOCKED);
  });
});

describe('the tier tables agree', () => {
  it('five shard tiers; the per-tier lists, the leanings and the patterns match the data', () => {
    const data = registry.getCraftingData();
    const delve = registry.getDelveData();
    const D = bal.drops;
    const tiers = data.shardTiers.length;
    expect(tiers).toBe(5);
    for (const own of Object.values(data.affixShardTiers))
      expect(own!.length).toBeLessThanOrEqual(tiers);
    expect(R.shard.scrap).toHaveLength(tiers - 1); // I→II to IV→V
    expect(C.salvageShardTier).toHaveLength(tiers - 1); // II to V
    expect(D.shardTierDepths).toHaveLength(tiers);
    expect(D.tierWeights).toHaveLength(tiers);
    expect(D.fluxGradeDepths).toHaveLength(FLUX_GRADES.length);
    const biomes = delve.biomes.map((b) => b.id);
    for (const id of Object.keys(D.biomeShardWeights)) expect(biomes).toContain(id);
    const doors = delve.doors.map((d) => d.id);
    for (const id of Object.keys(D.doors)) expect(doors).toContain(id);
    for (const id of data.startingPatterns) expect(() => registry.getGearBase(id)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-refine.test.ts)`
Expected: FAIL, 7 of 8 tests: `TypeError: (0 , withMaterial) is not a function`, `Error: refineCost: not implemented`, `Error: buyShard: not implemented` (the tier tables' test passes).

- [ ] **Step 3: The pouch helpers and the price**

In `packages/engine/src/loot/materials.ts`, replace:

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

with:

```ts
/** How many of `ref` the pouch holds (Mana Dust and Links live outside it: 0). */
export function materialCount(pouch: MaterialsPouch, ref: MaterialRef): number {
  switch (ref.kind) {
    case 'metal':
      return pouch.metals[ref.metal] ?? 0;
    case 'flux':
      return pouch.flux[ref.grade] ?? 0;
    case 'shard':
      return pouch.shards[ref.stat]?.[ref.tier - 1] ?? 0;
    case 'essence':
      return pouch.essences[ref.essence] ?? 0;
    default:
      return 0;
  }
}

/** `pouch` with `amount` of `ref` added (negative: taken). */
export function withMaterial<P extends MaterialsPouch>(
  pouch: P,
  ref: MaterialRef,
  amount: number,
): P {
  return addMaterials(pouch, addMaterial(emptyHaul(), ref, amount));
}

/** The next grade up of `what` (a metal, a flux or a shard), or null at the top, for an essence, Mana Dust or Links. */
export function refinedRef(registry: DataRegistry, what: MaterialRef): MaterialRef | null {
  const data = registry.getCraftingData();
  if (what.kind === 'metal') {
    const ids = data.metals.map((m) => m.id);
    const metal = ids[ids.indexOf(what.metal) + 1];
    return metal ? { kind: 'metal', metal } : null;
  }
  if (what.kind === 'flux') {
    const grades = data.flux.map((f) => f.grade);
    const grade = grades[grades.indexOf(what.grade) + 1];
    return grade ? { kind: 'flux', grade } : null;
  }
  if (what.kind === 'shard' && what.tier < shardTiersOf(registry, what.stat).length)
    return { kind: 'shard', stat: what.stat, tier: what.tier + 1 };
  return null;
}

/**
 * What refining `what` costs: `count` of it and `scrap` make one of the next
 * grade (see the crafting spec); null when it doesn't refine (the top grade, a
 * shard at its affix's last tier, an essence, Mana Dust or Links).
 */
export function refineCost(
  registry: DataRegistry,
  what: MaterialRef,
): { count: number; scrap: number } | null {
  if (!refinedRef(registry, what)) return null;
  const { refine } = registry.getDelveBalance().crafting;
  if (what.kind === 'shard')
    return { count: refine.shard.count, scrap: refine.shard.scrap[what.tier - 1] };
  return { ...(what.kind === 'metal' ? refine.metal : refine.flux) };
}
```

- [ ] **Step 4: The ops**

In `packages/engine/src/delve/crafting.ts`, replace:

```ts
import type { DataRegistry } from '../data/registry.js';
```

with:

```ts
import type { DataRegistry } from '../data/registry.js';
import { materialCount, refineCost, refinedRef, withMaterial } from '../loot/materials.js';
```

In `packages/engine/src/delve/crafting.ts`, replace:

```ts
import type { ProfileActionResult } from './profile.js';
```

with:

```ts
import { isDiveActive } from './dive.js';
import type { ProfileActionResult } from './profile.js';
```

In `packages/engine/src/delve/crafting.ts`, replace:

```ts
 * mid-dive (the dive lock) with a reason, as the other profile ops are. Stage
 * 4c's B2 fills these; until then each throws.
 */
```

with:

```ts
 * mid-dive (the dive lock) with a reason, as the other profile ops are. Each
 * op that rolls draws on `forge:${forgeCount}` and moves the count on.
 */

const FORGE_LOCKED = 'Forge at the Anvil, between dives';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}
```

In `packages/engine/src/delve/crafting.ts`, replace:

```ts
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

with:

```ts
/** Refine `refine.<kind>.count` of a bar, a flux or a shard into one of the next grade, for scrap. */
export function refine(
  registry: DataRegistry,
  profile: DelveProfile,
  what: MaterialRef,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
  const next = refinedRef(registry, what);
  if (!next) return refuse(profile, "Doesn't refine any higher");
  const cost = refineCost(registry, what)!;
  if (materialCount(profile.materials, what) < cost.count)
    return refuse(profile, `Needs ${cost.count} to refine`);
  if (profile.scrap < cost.scrap) return refuse(profile, 'Not enough scrap');
  return {
    ok: true,
    profile: {
      ...profile,
      materials: withMaterial(withMaterial(profile.materials, what, -cost.count), next, 1),
      scrap: profile.scrap - cost.scrap,
    },
  };
}

/** Buy a tier I shard of `stat` at the shard bench (`crafting.shardBench`). */
export function buyShard(
  registry: DataRegistry,
  profile: DelveProfile,
  stat: HeroStatKey,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
  if (!registry.getGearAffix(stat)) return refuse(profile, 'No such affix');
  const price = registry.getDelveBalance().crafting.shardBench;
  if (profile.scrap < price.scrap) return refuse(profile, 'Not enough scrap');
  if (profile.manaDust < price.dust) return refuse(profile, 'Not enough Mana Dust');
  return {
    ok: true,
    profile: {
      ...profile,
      materials: withMaterial(profile.materials, { kind: 'shard', stat, tier: 1 }, 1),
      scrap: profile.scrap - price.scrap,
      manaDust: profile.manaDust - price.dust,
    },
  };
}
```

- [ ] **Step 5: Run it to see it pass, then the whole engine**

Run: `(cd packages/engine && npx vitest run tests/delve-refine.test.ts)`
Expected: PASS (8 tests).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 14** tests pass in **F + 2** files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-craft-b2
npx prettier --write --end-of-line auto packages/engine/src/loot/materials.ts packages/engine/src/delve/crafting.ts packages/engine/tests/delve-refine.test.ts
git add packages/engine/src/loot/materials.ts packages/engine/src/delve/crafting.ts packages/engine/tests/delve-refine.test.ts
git commit -m "feat(engine): refining 3 to 1 and the shard bench" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 3: Forging

### Task 3: `previewForge`, `forgeItem` and the `forge` op

The bench's one code path: `previewForge` works out everything but the draws (the item level from the bar and the best depth, the rarity from the flux and the essence, each line's band, the floor, the implicits' ranges, the price, S7's weapon extras) and the first refusal; `forgeItem` rolls exactly its lines; `forge` pays, consumes, bags the item, counts the find and moves `forgeCount` and `nextUid` on.

**Files:**
- Modify: `packages/engine/tests/delve-forge.test.ts`, `packages/engine/src/loot/forge.ts`, `packages/engine/src/types/crafting.ts`, `packages/engine/src/delve/profile.ts`, `packages/engine/src/delve/crafting.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-forge.test.ts`, replace the lines from `import { generateItem, rollAffix, rollBand } from '../src/loot/item-generator.js';` up to (not including) `// See the crafting spec: "The roll formula", "Forging an item", "The 'just right' sinks".` with:

```ts
import { generateItem, rollAffix, rollBand, scrapLevelFactor } from '../src/loot/item-generator.js';
import { reforgeAffix } from '../src/loot/smithing.js';
import { forgeInputs, forgeItem, previewForge, rollFloor } from '../src/loot/forge.js';
import {
  emptyMaterials,
  materialCount,
  shardTiersOf,
  withMaterial,
} from '../src/loot/materials.js';
import { baseSlots } from '../src/loot/moveset.js';
import { socketsOf } from '../src/loot/runes.js';
import { forge } from '../src/delve/crafting.js';
import { startDive } from '../src/delve/dive.js';
import { movesOf } from '../src/delve/moveset.js';
import { profileStats } from '../src/delve/pair.js';
import { createDelveProfile, reforgeGear } from '../src/delve/profile.js';
import { CHAIN_SKILLS } from '../src/types/ability.js';
import {
  FLUX_GRADES,
  METAL_IDS,
  type FluxGrade,
  type ForgeRequest,
  type MaterialRef,
  type MetalId,
} from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';

```

Append to `packages/engine/tests/delve-forge.test.ts`:

```ts
/** `hero(attune)` knowing every pattern, with five more of everything, at best depth `depth`. */
function smith(attune = 0, depth = 12): DelveProfile {
  const p = hero(attune);
  const data = registry.getDelveData();
  const refs: MaterialRef[] = [
    ...METAL_IDS.map((metal) => ({ kind: 'metal' as const, metal })),
    ...FLUX_GRADES.map((grade) => ({ kind: 'flux' as const, grade })),
    ...data.legendaries.map((l) => ({ kind: 'essence' as const, essence: l.id })),
    ...data.affixes.flatMap((a) =>
      shardTiersOf(registry, a.stat).map((t) => ({
        kind: 'shard' as const,
        stat: a.stat,
        tier: t.tier,
      })),
    ),
  ];
  const materials = refs.reduce((m, ref) => withMaterial(m, ref, 5), p.materials);
  const patterns = data.bases.map((b) => b.id);
  return { ...p, materials, patterns, scrap: 1e6, manaDust: 1e3, bestDepth: depth };
}

const FORGE_LOCKED = 'Forge at the Anvil, between dives';
const forgeStream = (p: DelveProfile) => new SeededRNG(p.seed).fork(`forge:${p.forgeCount}`);
const tier = (n: number): [number, number] => {
  const t = registry.getCraftingData().shardTiers[n - 1];
  return [t.min, t.max];
};

describe('previewForge', () => {
  const req = (over: Partial<ForgeRequest> = {}): ForgeRequest => ({
    baseId: 'helm',
    metal: 'steel',
    element: 'fire',
    shards: [],
    ...over,
  });

  it("sets the item level from the bar: the best depth, clamped to the metal's band", () => {
    const at = (metal: MetalId, depth: number) =>
      previewForge(registry, smith(0, depth), req({ metal })).ilvl;
    expect(at('rusty', 0)).toBe(1);
    expect(at('rusty', 12)).toBe(4);
    expect(at('steel', 3)).toBe(10);
    expect(at('steel', 12)).toBe(12);
    expect(at('voidforged', 12)).toBe(48);
    expect(at('voidforged', 60)).toBe(60);
  });

  it('takes its rarity from the flux; an essence with epic flux makes a legendary', () => {
    const p = smith();
    expect(previewForge(registry, p, req()).rarity).toBe('common');
    for (const flux of FLUX_GRADES)
      expect(previewForge(registry, p, req({ flux })).rarity).toBe(flux);
    const legendary = previewForge(registry, p, req({ flux: 'epic', essence: 'pyroclasm' }));
    expect(legendary.rarity).toBe('legendary');
    expect(legendary.legendary).toEqual({ id: 'pyroclasm', band: [bal.loot.minRoll.legendary, 1] });
    expect(previewForge(registry, p, req({ flux: 'epic' })).legendary).toBeNull();
  });

  it("puts the shards' lines first, in their tier's band, and fills the rarity's lines at random", () => {
    const p = smith();
    const shards = [
      { stat: 'armor' as const, tier: 3 },
      { stat: 'fireAttune' as const, tier: 2 },
    ];
    const lines = previewForge(registry, p, req({ flux: 'rare', shards })).lines;
    expect(lines).toHaveLength(bal.loot.affixCount.rare);
    expect(lines[0]).toMatchObject({ shard: shards[0], band: tier(3) });
    expect(lines[0].range![0]).toBeLessThan(lines[0].range![1]);
    // The Attune shards have their own two tiers: II is the top half.
    expect(lines[1]).toEqual({ shard: shards[1], band: [0.5, 1], range: [2, 2] });
    expect(lines[2]).toEqual({ shard: null, band: [bal.loot.minRoll.rare, 1], range: null });
    expect(previewForge(registry, p, req()).lines).toEqual([]);
  });

  it('prices it at forgeScrap × the level factor, with Mana Dust outside the pair, and gives the floor', () => {
    const p = smith();
    const magic = previewForge(registry, p, req({ flux: 'magic' }));
    const scrap = Math.round(C.forgeScrap.magic * scrapLevelFactor(registry, 12));
    expect(magic.price).toEqual({ scrap, dust: 0 });
    expect(magic.floor).toBe(rollFloor(registry, p, 'fire'));
    const frost = previewForge(registry, p, req({ element: 'frost' }));
    expect(frost.price.dust).toBe(C.offPairDust);
    expect(frost.floor).toBe(0);
  });

  it("gives the implicits' ranges at the item level and rarity", () => {
    const prev = previewForge(registry, smith(), req({ flux: 'rare' }));
    const base = registry.getGearBase('helm');
    expect(prev.implicits.map((i) => i.stat)).toEqual(base.implicits.map((t) => t.stat));
    for (const i of prev.implicits) expect(i.min).toBeLessThan(i.max);
    expect(prev.weapon).toBeNull();
  });

  it("places a weapon's extras by S7: the Primary's slots first, sockets on its first moves", () => {
    const p = smith();
    const weapon = (flux?: FluxGrade) =>
      previewForge(registry, p, req({ baseId: 'sword', flux })).weapon;
    expect(weapon()).toEqual({
      carries: ['basic', 'primary'],
      slots: { basic: 0, primary: 0 },
      sockets: 0,
    });
    expect(weapon('rare')).toEqual({
      carries: ['basic', 'primary', 'defensive'],
      slots: { basic: 0, primary: C.weaponExtras.rare.slots, defensive: 0 },
      sockets: C.weaponExtras.rare.sockets,
    });
    expect(weapon('epic')).toEqual({
      carries: ['basic', 'primary', 'defensive', 'ultimate'],
      slots: { basic: 0, primary: C.weaponExtras.epic.slots, defensive: 0, ultimate: 0 },
      sockets: C.weaponExtras.epic.sockets,
    });
  });

  it('refuses with a code and a reason, never throwing', () => {
    const p = smith();
    const code = (q: DelveProfile, r: ForgeRequest) =>
      previewForge(registry, q, r).refused?.code ?? null;
    const armor = { stat: 'armor' as const, tier: 1 };
    expect(code(p, req())).toBeNull();
    expect(code(startDive(registry, p, 1), req())).toBe('locked');
    expect(code({ ...p, patterns: ['sword'] }, req())).toBe('pattern');
    expect(code(p, req({ flux: 'rare', essence: 'pyroclasm' }))).toBe('essence');
    expect(code(p, req({ flux: 'epic', essence: 'nope' }))).toBe('essence');
    expect(code(p, req({ flux: 'epic', essence: 'twin_fang' }))).toBe('essenceSlot'); // weapons and gloves
    expect(code(p, req({ flux: 'rare', shards: [{ stat: 'moveSpeed', tier: 1 }] }))).toBe(
      'shardSlot',
    );
    expect(code(p, req({ flux: 'rare', shards: [armor, { ...armor, tier: 2 }] }))).toBe(
      'shardDuplicate',
    );
    expect(code(p, req({ flux: 'uncommon', shards: [armor, { stat: 'maxHp', tier: 1 }] }))).toBe(
      'shardCount',
    );
    expect(code({ ...p, materials: emptyMaterials() }, req())).toBe('materials');
    expect(code(p, req({ flux: 'rare', shards: [{ stat: 'fireAttune', tier: 3 }] }))).toBe(
      'materials',
    );
    expect(code({ ...p, scrap: 0 }, req())).toBe('scrap');
    expect(code({ ...p, manaDust: 0 }, req({ element: 'frost' }))).toBe('dust');
    expect(code({ ...p, bag: Array(bal.loot.bagSize).fill(gloves()) }, req())).toBe('bagFull');
    const reason = (q: DelveProfile, r: ForgeRequest) =>
      previewForge(registry, q, r).refused!.reason;
    expect(reason({ ...p, scrap: 0 }, req())).toBe('Not enough scrap');
    expect(reason(p, req({ flux: 'epic', essence: 'twin_fang' }))).toBe(
      "Twin Fang doesn't fit this pattern",
    );
  });
});

/** A common helm, magic off-pair gauntlets, a rare sword, an epic ring and a legendary sword. */
const reqs: ForgeRequest[] = [
  { baseId: 'helm', metal: 'rusty', element: 'fire', shards: [] },
  {
    baseId: 'gauntlets',
    metal: 'steel',
    flux: 'magic',
    element: 'frost',
    shards: [{ stat: 'critChance', tier: 4 }],
  },
  {
    baseId: 'sword',
    metal: 'iron',
    flux: 'rare',
    element: 'fire',
    shards: [
      { stat: 'damage', tier: 5 },
      { stat: 'fireAttune', tier: 2 },
    ],
  },
  { baseId: 'ring', metal: 'mithril', flux: 'epic', element: 'fire', shards: [] },
  {
    baseId: 'sword',
    metal: 'steel',
    flux: 'epic',
    essence: 'pyroclasm',
    element: 'fire',
    shards: [{ stat: 'damagePct', tier: 1 }],
  },
];

describe('forgeItem', () => {
  it('makes exactly what the preview shows, but the draws', () => {
    const p = smith(20);
    for (const [i, r] of reqs.entries()) {
      const prev = previewForge(registry, p, r);
      expect(prev.refused).toBeNull();
      const item = forgeItem(registry, p, r, new SeededRNG(i + 1));
      expect(item).toMatchObject({
        uid: `g${p.nextUid}`,
        slot: prev.slot,
        baseId: r.baseId,
        rarity: prev.rarity,
        ilvl: prev.ilvl,
        mana: r.element,
        upgrade: 0,
        reforges: 0,
        hones: 0,
        locked: false,
      });
      expect(item.implicits.map((x) => x.stat)).toEqual(prev.implicits.map((x) => x.stat));
      item.implicits.forEach((x, j) => {
        expect(x.value).toBeGreaterThanOrEqual(prev.implicits[j].min);
        expect(x.value).toBeLessThanOrEqual(prev.implicits[j].max);
      });
      expect(item.affixes).toHaveLength(prev.lines.length);
      expect(new Set(item.affixes.map((a) => a.stat)).size).toBe(item.affixes.length);
      prev.lines.forEach((line, j) => {
        const a = item.affixes[j];
        const [lo, hi] = line.band;
        expect(a.roll).toBeGreaterThanOrEqual(lo + (hi - lo) * prev.floor);
        expect(a.roll).toBeLessThanOrEqual(hi);
        if (!line.shard) return expect(a.band).toBeUndefined();
        expect(a).toMatchObject({ stat: line.shard.stat, band: line.band });
        expect(a.value).toBeGreaterThanOrEqual(line.range![0]);
        expect(a.value).toBeLessThanOrEqual(line.range![1]);
      });
      if (prev.legendary) {
        const [lo] = prev.legendary.band;
        expect(item.legendary!.id).toBe(prev.legendary.id);
        expect(item.legendary!.roll).toBeGreaterThanOrEqual(lo + (1 - lo) * prev.floor);
        expect(item.name).toBe(registry.getLegendary(prev.legendary.id).name);
      } else expect(item.legendary).toBeUndefined();
      if (!prev.weapon) {
        expect(item.moveset).toBeUndefined();
        continue;
      }
      const m = item.moveset!;
      expect(Object.keys(m.chains).sort()).toEqual([...prev.weapon.carries].sort());
      for (const s of prev.weapon.carries)
        expect(m.slots[s]! - baseSlots(registry, r.baseId, s)).toBe(prev.weapon.slots[s]);
      const sockets = CHAIN_SKILLS.flatMap((s) => movesOf(m.chains[s])).flatMap(socketsOf);
      expect(sockets).toHaveLength(prev.weapon.sockets);
    }
  });

  it('rolls the same item from the same stream, named by its rarity, sockets on the Primary first', () => {
    const p = smith();
    expect(forgeItem(registry, p, reqs[2], new SeededRNG(9))).toEqual(
      forgeItem(registry, p, reqs[2], new SeededRNG(9)),
    );
    const helm = forgeItem(registry, p, reqs[0], new SeededRNG(1));
    expect(helm.name).toBe(`Rusty ${registry.getGearBase('helm').name}`);
    const primary = forgeItem(registry, p, reqs[4], new SeededRNG(1)).moveset!.chains.primary!;
    expect(primary.moves.map((m) => socketsOf(m).length)).toEqual([1, 1, 0, 0]);
  });

  it('throws where the preview refuses', () => {
    expect(() => forgeItem(registry, { ...smith(), scrap: 0 }, reqs[0], new SeededRNG(1))).toThrow(
      'Not enough scrap',
    );
  });
});

describe('forge: the profile op', () => {
  it('pays and consumes what it uses, bags the item and counts the find', () => {
    const p = smith();
    const r = reqs[4]; // the legendary sword
    const prev = previewForge(registry, p, r);
    const res = forge(registry, p, r);
    expect(res.ok).toBe(true);
    expect(res.item).toEqual(forgeItem(registry, p, r, forgeStream(p)));
    const q = res.profile;
    expect(q.bag).toEqual([...p.bag, res.item]);
    expect(q.scrap).toBe(p.scrap - prev.price.scrap);
    expect(q.manaDust).toBe(p.manaDust);
    expect([q.nextUid, q.forgeCount]).toEqual([p.nextUid + 1, p.forgeCount + 1]);
    for (const ref of forgeInputs(r))
      expect(materialCount(q.materials, ref)).toBe(materialCount(p.materials, ref) - 1);
    expect(q.stats.itemsFound.legendary).toBe(p.stats.itemsFound.legendary + 1);
    expect(q.codex.pyroclasm?.count).toBe(1);
  });

  it('charges Mana Dust outside the pair', () => {
    const p = smith();
    expect(forge(registry, p, reqs[1]).profile.manaDust).toBe(p.manaDust - C.offPairDust);
  });

  it('refuses with the reason, changing nothing', () => {
    const p = { ...smith(), scrap: 0 };
    expect(forge(registry, p, reqs[0])).toEqual({
      ok: false,
      profile: p,
      reason: 'Not enough scrap',
    });
    const diving = startDive(registry, smith(), 1);
    expect(forge(registry, diving, reqs[0])).toEqual({
      ok: false,
      profile: diving,
      reason: FORGE_LOCKED,
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-forge.test.ts)`
Expected: FAIL, 13 of 19 tests: `Error: previewForge: not implemented` (9), `Error: forge: not implemented` (2), `Error: forgeItem: not implemented` (one as `expected [Function] to throw error including 'Not enough scrap' but got 'forgeItem: not implemented'`); Task 1's 6 pass.

- [ ] **Step 3: The preview and the roll**

In `packages/engine/src/loot/forge.ts`, replace:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { ForgePreview, ForgeRequest, ShardRef } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { inPair, profileStats } from '../delve/pair.js';
```

with:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import { CHAIN_SKILLS, type ChainSkill } from '../types/ability.js';
import type {
  ForgeLinePreview,
  ForgePreview,
  ForgeRefusal,
  ForgeRequest,
  MaterialRef,
  ShardRef,
} from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem, Moveset, Rarity, StatRoll } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { isDiveActive } from '../delve/dive.js';
import { movesOf } from '../delve/moveset.js';
import { inPair, profileStats } from '../delve/pair.js';
import {
  affixValue,
  baseDisplayName,
  eligibleAffixes,
  generateRareName,
  implicitValue,
  rollAffix,
  rollBand,
  rollImplicit,
  scrapLevelFactor,
  weightedPick,
} from './item-generator.js';
import { materialCount, shardTiersOf } from './materials.js';
import { baseSlots, carriedSkills, defaultMoveset } from './moveset.js';
import { socketCap, socketsOf } from './runes.js';
```

In `packages/engine/src/loot/forge.ts`, replace:

```ts
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
```

with:

```ts
/** A shard's roll band (its affix's tier), or null for a tier the affix doesn't have. */
function shardBand(registry: DataRegistry, shard: ShardRef): [number, number] | null {
  const tier = shardTiersOf(registry, shard.stat).find((t) => t.tier === shard.tier);
  return tier ? [tier.min, tier.max] : null;
}

/** The skills a forged weapon's extras go to, in order (the crafting spec's S7). */
const EXTRAS_ORDER: readonly ChainSkill[] = ['primary', 'basic', 'ultimate', 'defensive'];

/**
 * A forged weapon's moveset (the crafting spec's S7): the skills its rarity
 * carries, every move its default in the item's mana; `crafting.weaponExtras`
 * extra slots fill the Primary to its cap first, then Basic, Ultimate and
 * Defensive; the open sockets go one a move in that order (the Primary's first
 * moves first), round after round up to the rarity's cap.
 */
export function forgedMoveset(
  registry: DataRegistry,
  item: Pick<GearItem, 'baseId' | 'rarity' | 'mana'>,
): Moveset {
  const bal = registry.getDelveBalance();
  const extras = bal.crafting.weaponExtras[item.rarity];
  const carried = carriedSkills(registry, item.rarity);
  const order = EXTRAS_ORDER.filter((s) => carried.includes(s));
  const slots: Partial<Record<ChainSkill, number>> = {};
  let left = extras.slots;
  for (const s of order) {
    const base = baseSlots(registry, item.baseId, s);
    const add = Math.min(left, Math.max(0, bal.chains.cap[s] - base));
    slots[s] = base + add;
    left -= add;
  }
  const moveset = defaultMoveset(registry, item, item.mana, slots);
  const moves = order.flatMap((s) => movesOf(moveset.chains[s]));
  let open = extras.sockets;
  for (let round = 0; round < socketCap(registry, item.rarity); round++)
    for (const m of moves)
      if (open > 0) {
        m.runes = [...socketsOf(m), null];
        open--;
      }
  return moveset;
}

/** What a forge consumes besides scrap and Mana Dust: the bar, the flux, the essence and the shards. */
export function forgeInputs(req: ForgeRequest): MaterialRef[] {
  return [
    { kind: 'metal', metal: req.metal },
    ...(req.flux ? [{ kind: 'flux' as const, grade: req.flux }] : []),
    ...(req.essence ? [{ kind: 'essence' as const, essence: req.essence }] : []),
    ...req.shards.map((s) => ({ kind: 'shard' as const, ...s })),
  ];
}

/** Why `req` can't be forged now, or null (the crafting spec's refusals, in this order). */
function forgeRefusal(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
  preview: Omit<ForgePreview, 'refused'>,
): ForgeRefusal | null {
  const no = (code: ForgeRefusal['code'], reason: string): ForgeRefusal => ({ code, reason });
  const { slot, rarity } = preview;
  if (isDiveActive(profile)) return no('locked', 'Forge at the Anvil, between dives');
  if (!profile.patterns.includes(req.baseId)) return no('pattern', 'Learn this pattern first');
  if (req.essence !== undefined) {
    const def = registry.getDelveData().legendaries.find((l) => l.id === req.essence);
    if (!def) return no('essence', 'No such essence');
    if (req.flux !== 'epic') return no('essence', 'An essence needs epic flux');
    if (!def.slots.includes(slot)) return no('essenceSlot', `${def.name} doesn't fit this pattern`);
  }
  const seen = new Set<string>();
  for (const shard of req.shards) {
    const def = registry.getGearAffix(shard.stat);
    if (!def?.slots.includes(slot))
      return no('shardSlot', `${def?.label ?? shard.stat} doesn't roll on this pattern`);
    if (seen.has(shard.stat)) return no('shardDuplicate', `Only one ${def.label} shard`);
    seen.add(shard.stat);
  }
  const lines = registry.getDelveBalance().loot.affixCount[rarity];
  if (req.shards.length > lines)
    return no('shardCount', `Too many shards: ${lines} lines at ${rarity}`);
  const missing = forgeInputs(req).some(
    (ref) =>
      materialCount(profile.materials, ref) < 1 ||
      (ref.kind === 'shard' && !shardBand(registry, ref)),
  );
  if (missing) return no('materials', 'Missing materials');
  if (profile.scrap < preview.price.scrap) return no('scrap', 'Not enough scrap');
  if (profile.manaDust < preview.price.dust) return no('dust', 'Not enough Mana Dust');
  if (profile.bag.length >= registry.getDelveBalance().loot.bagSize)
    return no('bagFull', 'Bag is full');
  return null;
}

/** Everything `forgeItem` would make but the random draws, and why it refuses (if it does). */
export function previewForge(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
): ForgePreview {
  const bal = registry.getDelveBalance();
  const base = registry.getGearBase(req.baseId);
  const metal = registry.getCraftingData().metals.find((m) => m.id === req.metal)!;
  const [lo, hi] = metal.band;
  const ilvl = Math.max(lo, Math.min(hi ?? Infinity, profile.bestDepth));
  const rarity: Rarity = req.essence && req.flux === 'epic' ? 'legendary' : (req.flux ?? 'common');
  const lines: ForgeLinePreview[] = [];
  for (const shard of req.shards.slice(0, bal.loot.affixCount[rarity])) {
    const def = registry.getGearAffix(shard.stat);
    const band = shardBand(registry, shard);
    if (!def || !band) continue;
    const range: [number, number] = [
      affixValue(registry, def, ilvl, band[0]),
      affixValue(registry, def, ilvl, band[1]),
    ];
    lines.push({ shard: { ...shard }, band, range });
  }
  while (lines.length < bal.loot.affixCount[rarity])
    lines.push({ shard: null, band: [bal.loot.minRoll[rarity], 1], range: null });
  const moveset =
    base.slot === 'weapon'
      ? forgedMoveset(registry, { baseId: base.id, rarity, mana: req.element })
      : null;
  const preview: Omit<ForgePreview, 'refused'> = {
    baseId: base.id,
    slot: base.slot,
    rarity,
    ilvl,
    element: req.element,
    floor: rollFloor(registry, profile, req.element),
    implicits: base.implicits.map((t) => ({
      stat: t.stat,
      min: implicitValue(registry, t, ilvl, rarity, 0),
      max: implicitValue(registry, t, ilvl, rarity, 1),
    })),
    lines,
    legendary:
      rarity === 'legendary' ? { id: req.essence!, band: [bal.loot.minRoll.legendary, 1] } : null,
    price: {
      scrap: Math.round(bal.crafting.forgeScrap[rarity] * scrapLevelFactor(registry, ilvl)),
      dust: inPair(profile, req.element) ? 0 : bal.crafting.offPairDust,
    },
    weapon: moveset && {
      carries: [...carriedSkills(registry, rarity)],
      // Each carried skill's extra slots, past its base.
      slots: Object.fromEntries(
        carriedSkills(registry, rarity).map((s) => [
          s,
          moveset.slots[s]! - baseSlots(registry, base.id, s),
        ]),
      ),
      sockets: CHAIN_SKILLS.flatMap((s) => movesOf(moveset.chains[s])).flatMap(socketsOf).length,
    },
  };
  return { ...preview, refused: forgeRefusal(registry, profile, req, preview) };
}

/** The forged item, rolled on `rng` (`forge:${forgeCount}`); throws where the preview refuses. */
export function forgeItem(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
  rng: SeededRNG,
): GearItem {
  const p = previewForge(registry, profile, req);
  if (p.refused) throw new Error(p.refused.reason);
  const base = registry.getGearBase(p.baseId);
  const implicits = base.implicits.map((t) => rollImplicit(registry, t, p.ilvl, p.rarity, rng));
  const affixes: StatRoll[] = [];
  for (const line of p.lines) {
    const opts = { band: line.shard ? line.band : undefined, floor: p.floor };
    const def = line.shard
      ? registry.getGearAffix(line.shard.stat)!
      : weightedPick(
          eligibleAffixes(
            registry,
            p.slot,
            affixes.map((a) => a.stat),
          ),
          (a) => a.weight,
          rng,
        );
    if (!def) break;
    affixes.push(rollAffix(registry, def, p.ilvl, p.rarity, rng, opts));
  }
  const item: GearItem = {
    uid: `g${profile.nextUid}`,
    slot: p.slot,
    baseId: p.baseId,
    rarity: p.rarity,
    mana: p.element,
    ilvl: p.ilvl,
    name: '',
    implicits,
    affixes,
    upgrade: 0,
    reforges: 0,
    hones: 0,
    locked: false,
  };
  if (p.legendary) {
    const def = registry.getLegendary(p.legendary.id);
    const roll = rollBand(p.legendary.band, p.floor, rng);
    item.legendary = { id: def.id, value: Math.round(def.min + (def.max - def.min) * roll), roll };
    item.name = def.name;
  } else if (p.rarity === 'rare' || p.rarity === 'epic') {
    item.name = generateRareName(registry, p.slot, rng);
  } else {
    item.name = baseDisplayName(registry, item);
  }
  if (p.slot === 'weapon') item.moveset = forgedMoveset(registry, item);
  return item;
}
```

In `packages/engine/src/types/crafting.ts`, replace:

```ts
  /** A weapon's carried skills, slots and open sockets (see the crafting spec's S7). */
```

with:

```ts
  /** A weapon's carried skills, each one's extra slots past its base, and its open sockets (S7). */
```

- [ ] **Step 4: The profile op**

In `packages/engine/src/delve/profile.ts`, replace:

```ts
function forgeRng(profile: DelveProfile): SeededRNG {
```

with:

```ts
/** The stream the next forge op draws on: `forge:${forgeCount}` (the op moves the count on). */
export function forgeRng(profile: DelveProfile): SeededRNG {
```

In `packages/engine/src/delve/crafting.ts`, replace:

```ts
import { materialCount, refineCost, refinedRef, withMaterial } from '../loot/materials.js';
```

with:

```ts
import { forgeInputs, forgeItem, previewForge } from '../loot/forge.js';
import { materialCount, refineCost, refinedRef, withMaterial } from '../loot/materials.js';
```

In `packages/engine/src/delve/crafting.ts`, replace:

```ts
import type { ProfileActionResult } from './profile.js';
```

with:

```ts
import { forgeRng, recordFinds, type ProfileActionResult } from './profile.js';
```

In `packages/engine/src/delve/crafting.ts`, replace:

```ts
/** Forge `req` into the bag, paying its price and consuming its materials (`ProfileActionResult.item`). */
export function forge(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _req: ForgeRequest,
): ProfileActionResult {
  throw new Error('forge: not implemented');
}
```

with:

```ts
/** Forge `req` into the bag, paying its price and consuming its materials (`ProfileActionResult.item`). */
export function forge(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
): ProfileActionResult {
  const preview = previewForge(registry, profile, req);
  if (preview.refused) return refuse(profile, preview.refused.reason);
  const item = forgeItem(registry, profile, req, forgeRng(profile));
  const materials = forgeInputs(req).reduce(
    (m, ref) => withMaterial(m, ref, -1),
    profile.materials,
  );
  const paid: DelveProfile = {
    ...profile,
    materials,
    scrap: profile.scrap - preview.price.scrap,
    manaDust: profile.manaDust - preview.price.dust,
    bag: [...profile.bag, item],
    nextUid: profile.nextUid + 1,
    forgeCount: profile.forgeCount + 1,
  };
  return { ok: true, item, profile: recordFinds(paid, [item]).profile };
}
```

- [ ] **Step 5: Run them to see them pass, then the whole engine**

Run: `(cd packages/engine && npx vitest run tests/delve-forge.test.ts)`
Expected: PASS (19 tests).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 27** tests pass in **F + 2** files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-craft-b2
npx prettier --write --end-of-line auto packages/engine/src/loot/forge.ts packages/engine/src/types/crafting.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/crafting.ts packages/engine/tests/delve-forge.test.ts
git add packages/engine/src/loot/forge.ts packages/engine/src/types/crafting.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/crafting.ts packages/engine/tests/delve-forge.test.ts
git commit -m "feat(engine): forging: previewForge, forgeItem with S7's weapon extras, and the forge op" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 4: The Temper sinks

### Task 4: Hone and Imprint

Hone rerolls one line within its band (a shard's, else the rarity's) with the floor, and counts the hone; its price grows by `honeGrowth` a hone. Imprint replaces a line with a shard's affix, rolled in the shard's band with the floor; it refuses an affix on another line or one the slot can't roll. Both draw on `forge:${forgeCount}` and move it on.

**Files:**
- Modify: `packages/engine/tests/delve-forge.test.ts`, `packages/engine/src/loot/forge.ts`, `packages/engine/src/delve/crafting.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-forge.test.ts`, replace:

```ts
import { forgeInputs, forgeItem, previewForge, rollFloor } from '../src/loot/forge.js';
```

with:

```ts
import {
  forgeInputs,
  forgeItem,
  honeCost,
  honeLine,
  imprintCost,
  imprintLine,
  imprintRefusal,
  previewForge,
  rollFloor,
} from '../src/loot/forge.js';
```

In `packages/engine/tests/delve-forge.test.ts`, replace:

```ts
import { forge } from '../src/delve/crafting.js';
```

with:

```ts
import { forge, hone, imprint } from '../src/delve/crafting.js';
```

Append to `packages/engine/tests/delve-forge.test.ts`:

```ts
describe('Hone', () => {
  /** A rare Fire sword: Damage V and Fire Attunement II from shards, and one random line. */
  const sword = () =>
    forgeItem(
      registry,
      smith(),
      {
        baseId: 'sword',
        metal: 'iron',
        flux: 'rare',
        element: 'fire',
        shards: [
          { stat: 'damage', tier: 5 },
          { stat: 'fireAttune', tier: 2 },
        ],
      },
      new SeededRNG(3),
    );

  it('rerolls one line within its band, the floor applied, and counts the hone', () => {
    const item = sword();
    const [lo, hi] = item.affixes[0].band!;
    for (let seed = 1; seed <= 30; seed++) {
      const out = honeLine(registry, smith(100), item, 0, new SeededRNG(seed));
      expect(out.affixes[0]).toMatchObject({ stat: 'damage', band: [lo, hi] });
      expect(out.affixes[0].roll).toBeGreaterThanOrEqual(lo + (hi - lo) * C.attuneRoll.cap);
      expect(out.affixes.slice(1)).toEqual(item.affixes.slice(1));
      expect(out.hones).toBe(1);
    }
    expect(honeLine(registry, smith(), item, 2, new SeededRNG(1)).affixes[2].band).toBeUndefined();
    expect(() => honeLine(registry, smith(), item, 3, new SeededRNG(1))).toThrow();
  });

  it('costs honeScrap × the rarity × honeGrowth ^ hones × the level factor', () => {
    const item = gloves();
    const base = C.honeScrap * bal.forge.rarityCostMult.rare * scrapLevelFactor(registry, 10);
    expect(honeCost(registry, item)).toBe(Math.round(base));
    expect(honeCost(registry, { ...item, hones: 2 })).toBe(Math.round(base * C.honeGrowth ** 2));
  });

  it('at the Anvil: pays, draws on the forge stream, and refuses with a reason', () => {
    const p = { ...smith(), bag: [gloves()] };
    const res = hone(registry, p, 'r1', 1);
    expect(res.ok).toBe(true);
    expect(res.item).toEqual(honeLine(registry, p, gloves(), 1, forgeStream(p)));
    expect(res.profile.bag).toEqual([res.item]);
    expect(res.profile.scrap).toBe(p.scrap - honeCost(registry, gloves()));
    expect(res.profile.forgeCount).toBe(p.forgeCount + 1);
    expect(hone(registry, p, 'nope', 0).reason).toBe('Item not found');
    expect(hone(registry, p, 'r1', 9).reason).toBe('No such affix');
    expect(hone(registry, { ...p, scrap: 0 }, 'r1', 0).reason).toBe('Not enough scrap');
    expect(hone(registry, startDive(registry, p, 1), 'r1', 0).reason).toBe(FORGE_LOCKED);
  });
});

describe('Imprint', () => {
  const item = gloves();
  /** An affix gloves can roll that these gloves don't have. */
  const free = registry
    .getDelveData()
    .affixes.find(
      (a) => a.slots.includes('gloves') && !item.affixes.some((x) => x.stat === a.stat),
    )!.stat;
  const moveSpeed = registry.getGearAffix('moveSpeed')!.label;

  it("replaces a line with the shard's affix, rolled in its band with the floor", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const out = imprintLine(
        registry,
        smith(100),
        item,
        0,
        { stat: free, tier: 5 },
        new SeededRNG(seed),
      );
      const [lo, hi] = tier(5);
      expect(out.affixes[0]).toMatchObject({ stat: free, band: [lo, hi] });
      expect(out.affixes[0].roll).toBeGreaterThanOrEqual(lo + (hi - lo) * C.attuneRoll.cap);
      expect(out.affixes.slice(1)).toEqual(item.affixes.slice(1));
      expect([out.hones, out.reforges]).toEqual([item.hones, item.reforges]);
    }
  });

  it('refuses an affix on another line or not on the slot; its own line may take a better shard', () => {
    const taken = { stat: item.affixes[1].stat, tier: 1 };
    expect(imprintRefusal(registry, item, 0, taken)).toBe('Already on this item');
    expect(imprintRefusal(registry, item, 0, { stat: 'moveSpeed', tier: 1 })).toBe(
      `${moveSpeed} doesn't roll on this item`,
    );
    expect(imprintRefusal(registry, item, 1, taken)).toBeNull();
    expect(imprintRefusal(registry, item, 9, taken)).toBe('No such affix');
    expect(() => imprintLine(registry, smith(), item, 0, taken, new SeededRNG(1))).toThrow(
      'Already on this item',
    );
  });

  it('at the Anvil: takes the shard and scrap, and refuses with a reason', () => {
    const p = { ...smith(), bag: [item] };
    const shard = { stat: free, tier: 2 };
    const res = imprint(registry, p, 'r1', 0, shard);
    expect(res.ok).toBe(true);
    expect(res.item).toEqual(imprintLine(registry, p, item, 0, shard, forgeStream(p)));
    const ref = { kind: 'shard' as const, ...shard };
    expect(materialCount(res.profile.materials, ref)).toBe(materialCount(p.materials, ref) - 1);
    const cost = Math.round(C.imprintScrap.rare * scrapLevelFactor(registry, 10));
    expect(imprintCost(registry, item)).toBe(cost);
    expect(res.profile.scrap).toBe(p.scrap - cost);
    expect(res.profile.forgeCount).toBe(p.forgeCount + 1);
    const bare = { ...p, materials: emptyMaterials() };
    expect(imprint(registry, bare, 'r1', 0, shard).reason).toBe('Missing the shard');
    expect(imprint(registry, p, 'r1', 0, { stat: 'moveSpeed', tier: 1 }).reason).toBe(
      `${moveSpeed} doesn't roll on this item`,
    );
    expect(imprint(registry, { ...p, scrap: 0 }, 'r1', 0, shard).reason).toBe('Not enough scrap');
    expect(imprint(registry, startDive(registry, p, 1), 'r1', 0, shard).reason).toBe(FORGE_LOCKED);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-forge.test.ts)`
Expected: FAIL, 6 of 25 tests: `Error: honeLine: not implemented`, `Error: hone: not implemented`, `Error: imprintLine: not implemented`, `Error: imprint: not implemented`, `TypeError: (0 , imprintRefusal) is not a function` and the price test's `Error: honeCost: not implemented`.

- [ ] **Step 3: The sinks on an item**

In `packages/engine/src/loot/forge.ts`, replace:

```ts
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

with:

```ts
/** Why `shard` can't go on affix line `line` of `item`, or null (the affix on another line, or not on the slot). */
export function imprintRefusal(
  registry: DataRegistry,
  item: GearItem,
  line: number,
  shard: ShardRef,
): string | null {
  if (!item.affixes[line]) return 'No such affix';
  const def = registry.getGearAffix(shard.stat);
  if (!def?.slots.includes(item.slot))
    return `${def?.label ?? shard.stat} doesn't roll on this item`;
  if (!shardBand(registry, shard)) return 'No such shard';
  if (item.affixes.some((a, i) => i !== line && a.stat === shard.stat))
    return 'Already on this item';
  return null;
}

/** `item` with affix line `line` rerolled within its band, the attunement floor applied; `hones` + 1. */
export function honeLine(
  registry: DataRegistry,
  profile: DelveProfile,
  item: GearItem,
  line: number,
  rng: SeededRNG,
): GearItem {
  const old = item.affixes[line];
  const def = old && registry.getGearAffix(old.stat);
  if (!def) throw new Error(`No affix at index ${line}`);
  const affixes = item.affixes.slice();
  affixes[line] = rollAffix(registry, def, item.ilvl, item.rarity, rng, {
    band: old.band,
    floor: rollFloor(registry, profile, item.mana),
  });
  return { ...item, affixes, hones: item.hones + 1 };
}

/** `item` with affix line `line` replaced by `shard`'s affix, rolled in the shard's band. */
export function imprintLine(
  registry: DataRegistry,
  profile: DelveProfile,
  item: GearItem,
  line: number,
  shard: ShardRef,
  rng: SeededRNG,
): GearItem {
  const why = imprintRefusal(registry, item, line, shard);
  if (why) throw new Error(why);
  const def = registry.getGearAffix(shard.stat)!;
  const band = shardBand(registry, shard)!;
  const affixes = item.affixes.slice();
  affixes[line] = rollAffix(registry, def, item.ilvl, item.rarity, rng, {
    band,
    floor: rollFloor(registry, profile, item.mana),
  });
  return { ...item, affixes };
}

/** Scrap the next hone of `item` costs. */
export function honeCost(registry: DataRegistry, item: GearItem): number {
  const bal = registry.getDelveBalance();
  return Math.round(
    bal.crafting.honeScrap *
      bal.forge.rarityCostMult[item.rarity] *
      Math.pow(bal.crafting.honeGrowth, item.hones) *
      scrapLevelFactor(registry, item.ilvl),
  );
}

/** Scrap an imprint on `item` costs, besides the shard. */
export function imprintCost(registry: DataRegistry, item: GearItem): number {
  const crafting = registry.getDelveBalance().crafting;
  return Math.round(crafting.imprintScrap[item.rarity] * scrapLevelFactor(registry, item.ilvl));
}
```

- [ ] **Step 4: The profile ops**

In `packages/engine/src/delve/crafting.ts`, replace:

```ts
import { forgeInputs, forgeItem, previewForge } from '../loot/forge.js';
```

with:

```ts
import {
  forgeInputs,
  forgeItem,
  honeCost,
  honeLine,
  imprintCost,
  imprintLine,
  imprintRefusal,
  previewForge,
} from '../loot/forge.js';
```

In `packages/engine/src/delve/crafting.ts`, replace:

```ts
import { forgeRng, recordFinds, type ProfileActionResult } from './profile.js';
```

with:

```ts
import {
  findItem,
  forgeRng,
  recordFinds,
  replaceItem,
  type ProfileActionResult,
} from './profile.js';
```

In `packages/engine/src/delve/crafting.ts`, replace:

```ts
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
```

with:

```ts
/** Hone affix line `line` of item `uid`, for scrap. */
export function hone(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  line: number,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
  const found = findItem(profile, uid);
  if (!found) return refuse(profile, 'Item not found');
  if (!found.item.affixes[line]) return refuse(profile, 'No such affix');
  const cost = honeCost(registry, found.item);
  if (profile.scrap < cost) return refuse(profile, 'Not enough scrap');
  const item = honeLine(registry, profile, found.item, line, forgeRng(profile));
  return {
    ok: true,
    item,
    profile: {
      ...replaceItem(profile, item),
      scrap: profile.scrap - cost,
      forgeCount: profile.forgeCount + 1,
    },
  };
}

/** Imprint `shard` on affix line `line` of item `uid`, for the shard and scrap. */
export function imprint(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  line: number,
  shard: ShardRef,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
  const found = findItem(profile, uid);
  if (!found) return refuse(profile, 'Item not found');
  const why = imprintRefusal(registry, found.item, line, shard);
  if (why) return refuse(profile, why);
  const ref: MaterialRef = { kind: 'shard', ...shard };
  if (materialCount(profile.materials, ref) < 1) return refuse(profile, 'Missing the shard');
  const cost = imprintCost(registry, found.item);
  if (profile.scrap < cost) return refuse(profile, 'Not enough scrap');
  const item = imprintLine(registry, profile, found.item, line, shard, forgeRng(profile));
  return {
    ok: true,
    item,
    profile: {
      ...replaceItem(profile, item),
      materials: withMaterial(profile.materials, ref, -1),
      scrap: profile.scrap - cost,
      forgeCount: profile.forgeCount + 1,
    },
  };
}
```

- [ ] **Step 5: Run them to see them pass, then the whole engine**

Run: `(cd packages/engine && npx vitest run tests/delve-forge.test.ts)`
Expected: PASS (25 tests).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 33** tests pass in **F + 2** files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-craft-b2
npx prettier --write --end-of-line auto packages/engine/src/loot/forge.ts packages/engine/src/delve/crafting.ts packages/engine/tests/delve-forge.test.ts
git add packages/engine/src/loot/forge.ts packages/engine/src/delve/crafting.ts packages/engine/tests/delve-forge.test.ts
git commit -m "feat(engine): the Temper sinks: Hone and Imprint" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 5: Salvage

### Task 5: `salvageYield`, `salvageRng` and `applySalvage`

What one item gives back (the spec's Salvage): its scrap; one shard of one of its lines, at the tier `salvageShardTier` gives that line's roll (clamped to the affix's last tier), and with `salvageExtraShard` a second from another line; a legendary's essence instead; its pattern when unknown (learned at once); Mana Dust off the pair; a weapon's Links and its runes by the parts rule. Each draw is keyed on the item (`salvageRng`), never a world stream. Mid-dive the yield goes to `dive.haul`, at the Anvil to the stockpile (`stockHaul`, which also counts the scrap as earned).

**Files:**
- Create: `packages/engine/tests/delve-salvage-yield.test.ts`
- Overwrite: `packages/engine/src/loot/salvage-yield.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-salvage-yield.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { forgedMoveset } from '../src/loot/forge.js';
import { materialCount } from '../src/loot/materials.js';
import { applySalvage, salvageRng, salvageYield } from '../src/loot/salvage-yield.js';
import { salvageValue } from '../src/loot/smithing.js';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import type { GearItem, HeroStatKey, StatRoll } from '../src/types/gear.js';

// See the crafting spec: "Salvage (what gear gives back)".

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();
const C = bal.crafting;

/** A Fire hero: the sword's, the cuirass's and the dagger's patterns. */
const hero = () => createDelveProfile(registry, 3, { primary: 'fire' });
const line = (stat: HeroStatKey, roll: number): StatRoll => ({ stat, value: 1, roll });

/** Rare Fire gauntlets (an unknown pattern) with three lines: rolls 0.1, 0.6 and 0.95. */
const gloves = (over: Partial<GearItem> = {}): GearItem => ({
  ...generateItem(
    registry,
    { uid: 'x', ilvl: 5, rarity: 'rare', slot: 'gloves', baseId: 'gauntlets', mana: 'fire' },
    new SeededRNG(1),
  ),
  affixes: [line('armor', 0.1), line('critChance', 0.6), line('fireAttune', 0.95)],
  ...over,
});

/** Legendary Nightstalker gauntlets. */
const legendary = generateItem(
  registry,
  {
    uid: 'l',
    ilvl: 5,
    rarity: 'legendary',
    slot: 'gloves',
    baseId: 'gauntlets',
    mana: 'fire',
    legendaryId: 'nightstalker',
  },
  new SeededRNG(2),
);

/** An epic Fire sword as forged (two extra slots, one socket), Split I in its socket. */
function sword(): GearItem {
  const w = generateItem(
    registry,
    { uid: 'w', ilvl: 5, rarity: 'epic', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(3),
  );
  const moveset = forgedMoveset(registry, w);
  moveset.chains.primary!.moves[0].runes = [{ id: 'split', tier: 1 }];
  return { ...w, moveset };
}

describe('salvageYield', () => {
  it('previews scrap, a shard a line at the tier its roll reaches, the pattern and the extra chance', () => {
    const g = gloves();
    expect(salvageYield(registry, hero(), g)).toEqual({
      scrap: salvageValue(registry, g),
      dust: 0,
      links: 0,
      // 0.1 → I, 0.6 → III; 0.95 would be V, but the Attune shards stop at II.
      shards: [
        { stat: 'armor', tier: 1 },
        { stat: 'critChance', tier: 3 },
        { stat: 'fireAttune', tier: 2 },
      ],
      extraShard: C.salvageExtraShard,
      pattern: 'gauntlets',
      essence: null,
      runes: [],
    });
    const tierAt = (roll: number) =>
      salvageYield(registry, hero(), gloves({ affixes: [line('armor', roll)] })).shards[0].tier;
    expect(C.salvageShardTier.map(tierAt)).toEqual([2, 3, 4, 5]);
    const one = salvageYield(registry, hero(), gloves({ affixes: [line('armor', 0.5)] }));
    expect(one.extraShard).toBe(0);
  });

  it('gives no shard for a common, no pattern once known, and Mana Dust off the pair', () => {
    const known = { ...hero(), patterns: ['gauntlets'] };
    const common = gloves({ rarity: 'common', affixes: [] });
    expect(salvageYield(registry, known, common)).toMatchObject({
      shards: [],
      extraShard: 0,
      pattern: null,
    });
    expect(salvageYield(registry, hero(), gloves({ mana: 'frost' })).dust).toBe(
      bal.pair.salvageDust.rare,
    );
  });

  it("gives a legendary's essence instead of a shard", () => {
    expect(salvageYield(registry, hero(), legendary)).toMatchObject({
      shards: [],
      extraShard: 0,
      essence: 'nightstalker',
    });
  });

  it("lists a weapon's Links (extra slots and sockets) and its runes", () => {
    const extras = C.weaponExtras.epic;
    expect(salvageYield(registry, hero(), sword())).toMatchObject({
      links: extras.slots + extras.sockets,
      runes: [{ id: 'split', tier: 1 }],
      pattern: null,
    });
  });
});

describe('applySalvage', () => {
  it('at the Anvil: stocks one shard of its lines, sometimes two, and learns the pattern', () => {
    const p = hero();
    const g = gloves();
    const lines = salvageYield(registry, p, g).shards;
    const counts = [0, 0, 0];
    for (let seed = 1; seed <= 200; seed++) {
      const { shards } = applySalvage(registry, p, g, new SeededRNG(seed));
      counts[shards.length]++;
      for (const s of shards) expect(lines).toContainEqual(s);
      if (shards.length === 2) expect(shards[0].stat).not.toBe(shards[1].stat);
    }
    expect(counts[0]).toBe(0);
    expect(counts[2]).toBeGreaterThan(200 * C.salvageExtraShard * 0.5);
    expect(counts[2]).toBeLessThan(200 * C.salvageExtraShard * 1.5);

    const res = applySalvage(registry, p, g, new SeededRNG(1));
    expect(applySalvage(registry, p, g, new SeededRNG(1))).toEqual(res);
    const q = res.profile;
    expect(q.scrap).toBe(p.scrap + res.scrap);
    expect(q.stats.scrapEarned).toBe(p.stats.scrapEarned + res.scrap);
    for (const s of res.shards)
      expect(materialCount(q.materials, { kind: 'shard', ...s })).toBeGreaterThan(0);
    expect(res.pattern).toBe('gauntlets');
    expect(q.patterns).toEqual([...p.patterns, 'gauntlets']);
    expect(q.dive).toBeNull();
  });

  it('a legendary gives its essence', () => {
    const res = applySalvage(registry, hero(), legendary, new SeededRNG(1));
    expect(res).toMatchObject({ essence: 'nightstalker', shards: [] });
    expect(res.profile.materials.essences).toEqual({ nightstalker: 1 });
  });

  it("mid-dive: the yield goes to the floor's haul; the pattern is learned at once", () => {
    const p = startDive(registry, hero(), 1);
    const res = applySalvage(registry, p, gloves({ mana: 'frost' }), new SeededRNG(1));
    expect(res.profile.scrap).toBe(p.scrap);
    expect(res.profile.manaDust).toBe(p.manaDust);
    expect(res.profile.materials).toEqual(p.materials);
    const haul = res.profile.dive!.haul;
    expect([haul.scrap, haul.dust]).toEqual([res.scrap, bal.pair.salvageDust.rare]);
    for (const s of res.shards)
      expect(materialCount(haul, { kind: 'shard', ...s })).toBeGreaterThan(0);
    expect(res.profile.patterns).toContain('gauntlets');
  });

  it("sends a weapon's runes by the parts rule, in the mode given", () => {
    const gone = applySalvage(registry, hero(), sword(), new SeededRNG(1));
    expect(gone).toMatchObject({ runes: [], destroyed: [{ id: 'split', tier: 1 }] });
    expect(gone.profile.runes).toEqual({});
    const paid = applySalvage(registry, hero(), sword(), new SeededRNG(1), { unsocket: 'pay' });
    expect(paid).toMatchObject({ runes: [{ id: 'split', tier: 1 }], destroyed: [] });
    expect(paid.profile.runes).toEqual({ split: [1, 0, 0, 0, 0] });
    expect(paid.profile.links).toBe(hero().links + paid.links);
  });
});

describe('salvageRng', () => {
  it('keys a salvage on the item: the dive seed mid-dive, the profile seed and forgeCount at the Anvil', () => {
    const p = { ...hero(), forgeCount: 7 };
    expect(salvageRng(p, gloves()).next()).toBe(new SeededRNG(p.seed).fork('salvage:7:x').next());
    const diving = startDive(registry, p, 1);
    expect(salvageRng(diving, gloves()).next()).toBe(
      new SeededRNG(diving.dive!.seed).fork('salvage:x').next(),
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-salvage-yield.test.ts)`
Expected: FAIL, all 9 tests: `Error: salvageYield: not implemented` (5), `Error: applySalvage: not implemented` (3), `TypeError: (0 , salvageRng) is not a function`.

- [ ] **Step 3: The yield and the salvage**

Overwrite `packages/engine/src/loot/salvage-yield.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import type { SalvageResult, SalvageYield, ShardRef } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem, HeroStatKey } from '../types/gear.js';
import { isDiveActive } from '../delve/dive.js';
import { salvageDust } from '../delve/pair.js';
import { settleParts, type SetChainsOptions } from '../delve/runes.js';
import { addHaul, addMaterial, emptyHaul, shardTiersOf, stockHaul } from './materials.js';
import { weaponParts } from './moveset.js';
import { salvageValue } from './smithing.js';

/**
 * What gear gives back (see the crafting spec's Salvage): every salvage path
 * goes through `applySalvage`.
 */

/** A salvaged line's shard tier: 1 + the `salvageShardTier` thresholds its roll reaches, at most its affix's last. */
function salvageTier(registry: DataRegistry, stat: HeroStatKey, roll: number): number {
  const passed = registry
    .getDelveBalance()
    .crafting.salvageShardTier.filter((t) => roll >= t).length;
  return Math.min(1 + passed, shardTiersOf(registry, stat).length);
}

/** What salvaging `item` could give (the Loadout's preview). */
export function salvageYield(
  registry: DataRegistry,
  profile: DelveProfile,
  item: GearItem,
): SalvageYield {
  const parts = weaponParts(registry, item);
  const essence = item.legendary?.id ?? null;
  const shards: ShardRef[] = essence
    ? []
    : item.affixes
        .filter((a) => registry.getGearAffix(a.stat))
        .map((a) => ({ stat: a.stat, tier: salvageTier(registry, a.stat, a.roll) }));
  return {
    scrap: salvageValue(registry, item),
    dust: salvageDust(registry, item, profile.pair),
    links: parts.links,
    shards,
    extraShard: shards.length > 1 ? registry.getDelveBalance().crafting.salvageExtraShard : 0,
    pattern: profile.patterns.includes(item.baseId) ? null : item.baseId,
    essence,
    runes: parts.runes,
  };
}

/**
 * The stream one salvage draws on, keyed on the item (see the crafting spec):
 * mid-dive the dive seed's `salvage:<uid>`, at the Anvil the profile seed's
 * `salvage:<forgeCount>:<uid>` (the caller moves `forgeCount` on).
 */
export function salvageRng(profile: DelveProfile, item: GearItem): SeededRNG {
  return isDiveActive(profile)
    ? new SeededRNG(profile.dive!.seed).fork(`salvage:${item.uid}`)
    : new SeededRNG(profile.seed).fork(`salvage:${profile.forgeCount}:${item.uid}`);
}

/**
 * Salvage one item, drawing on `rng` (keyed on the item: `salvageRng`): scrap,
 * one of its lines' shards and maybe a second (a legendary its essence
 * instead), Mana Dust off the pair, a weapon's Links and its runes by the parts
 * rule (`opts.unsocket`, else the balance's). Mid-dive the yield goes to the
 * floor's haul (`dive.haul`), at the Anvil to the stockpile; its pattern is
 * learned at once. The item itself is the caller's to remove.
 */
export function applySalvage(
  registry: DataRegistry,
  profile: DelveProfile,
  item: GearItem,
  rng: SeededRNG,
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): SalvageResult {
  const y = salvageYield(registry, profile, item);
  const shards: ShardRef[] = [];
  if (y.shards.length > 0) {
    const first = rng.nextInt(0, y.shards.length - 1);
    shards.push(y.shards[first]);
    if (rng.next() < y.extraShard) {
      const rest = y.shards.filter((_, i) => i !== first);
      shards.push(rest[rng.nextInt(0, rest.length - 1)]);
    }
  }
  const settled = settleParts(registry, {}, y.runes, opts.unsocket);
  let haul = { ...emptyHaul(), scrap: y.scrap, dust: y.dust, links: y.links, runes: settled.pouch };
  for (const s of shards) haul = addMaterial(haul, { kind: 'shard', ...s });
  if (y.essence) haul = addMaterial(haul, { kind: 'essence', essence: y.essence });
  const learned = y.pattern ? { ...profile, patterns: [...profile.patterns, y.pattern] } : profile;
  const dive = profile.dive;
  return {
    profile:
      dive && isDiveActive(profile)
        ? { ...learned, dive: { ...dive, haul: addHaul(dive.haul, haul) } }
        : stockHaul(learned, haul),
    scrap: y.scrap,
    dust: y.dust,
    links: y.links,
    shards,
    pattern: y.pattern,
    essence: y.essence,
    runes: settled.runes,
    destroyed: settled.destroyed,
  };
}
```

- [ ] **Step 4: Run them to see them pass, then the whole engine**

Run: `(cd packages/engine && npx vitest run tests/delve-salvage-yield.test.ts)`
Expected: PASS (9 tests).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 42** tests pass in **F + 3** files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-b2
npx prettier --write --end-of-line auto packages/engine/src/loot/salvage-yield.ts packages/engine/tests/delve-salvage-yield.test.ts
git add packages/engine/src/loot/salvage-yield.ts packages/engine/tests/delve-salvage-yield.test.ts
git commit -m "feat(engine): salvage yields: shards by roll, essences, patterns, keyed on the item" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: Every salvage goes through `applySalvage`

`addLootToBag`'s auto-salvage (and a full bag's) and `salvageItems` melt item by item through `applySalvage` on each item's `salvageRng`, moving `forgeCount` on once at the Anvil; `BagInsertResult` reports the shards, patterns and essences for B1's `bankWorld` (X1). Mid-dive, the melt fills the floor's haul instead of the stockpile, so the three tests that read a mid-dive melt from the stockpile now read the haul; `bankWorld` still drops that haul until B1 builds its dive from the profile `addLootToBag` returns (X1), so those tests check `bankWorld` keeps it out of the stockpile and read the haul from `addLootToBag` itself.

**Files:**
- Modify: `packages/engine/tests/delve-salvage-yield.test.ts`, `packages/engine/tests/delve-movesets.test.ts`, `packages/engine/tests/delve-pair.test.ts`, `packages/engine/tests/delve-runes.test.ts`, `packages/engine/tests/delve-crafting-contract.test.ts`, `packages/engine/src/delve/profile.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-salvage-yield.test.ts`, replace:

```ts
import { createDelveProfile } from '../src/delve/profile.js';
```

with:

```ts
import {
  addLootToBag,
  createDelveProfile,
  salvageItems,
  setAutoSalvage,
} from '../src/delve/profile.js';
```

Append to `packages/engine/tests/delve-salvage-yield.test.ts`:

```ts
describe('every salvage goes through applySalvage', () => {
  it('salvageItems: each item on its own stream, then forgeCount moves on once', () => {
    const p = { ...hero(), bag: [gloves(), legendary] };
    const res = salvageItems(registry, p, ['x', 'l']);
    expect(res).toMatchObject({ count: 2, patterns: ['gauntlets'], essences: ['nightstalker'] });
    const one = applySalvage(registry, { ...p, bag: [] }, gloves(), salvageRng(p, gloves()));
    const two = applySalvage(registry, one.profile, legendary, salvageRng(p, legendary));
    expect(res.shards).toEqual(one.shards);
    expect(res.profile).toEqual({ ...two.profile, forgeCount: p.forgeCount + 1 });
  });

  it("addLootToBag: auto-salvage stocks it at the Anvil and fills the floor's haul mid-dive", () => {
    const p = setAutoSalvage(hero(), 'rare', true);
    const anvil = addLootToBag(registry, p, [gloves()]);
    expect(anvil).toMatchObject({ kept: [], patterns: ['gauntlets'] });
    expect(anvil.profile.scrap).toBe(p.scrap + anvil.scrap);
    expect(anvil.profile.forgeCount).toBe(p.forgeCount + 1);

    const diving = startDive(registry, p, 1);
    const mid = addLootToBag(registry, diving, [gloves()]);
    expect(mid.profile.scrap).toBe(diving.scrap);
    expect(mid.profile.dive!.haul.scrap).toBe(mid.scrap);
    expect(mid.profile.forgeCount).toBe(diving.forgeCount);
    expect(mid.shards).toEqual(
      applySalvage(registry, diving, gloves(), salvageRng(diving, gloves())).shards,
    );
  });

  it("a full bag mid-dive melts even a legendary: its essence goes to the floor's haul", () => {
    const diving = startDive(registry, hero(), 1);
    const full = { ...diving, bag: Array(bal.loot.bagSize).fill(gloves()) };
    const res = addLootToBag(registry, full, [legendary]);
    expect(res).toMatchObject({ bagFull: true, essences: ['nightstalker'] });
    expect(res.profile.dive!.haul.essences).toEqual({ nightstalker: 1 });
  });
});
```

In `packages/engine/tests/delve-movesets.test.ts`, replace:

```ts
  it('auto-salvage and a full bag give them too, and banking reports them for the dive', () => {
    const p = startDive(registry, setAutoSalvage(hero(), 'rare', true), 1);
    const w = beginFloor(registry, p);
    w.pending.items = [rare];
    const res = bankWorld(registry, p, w);
    expect(res.links).toBe(3);
    expect(res.profile.links).toBe(3);
```

with:

```ts
  it("auto-salvage and a full bag give them too, into the floor's haul, and banking reports them for the dive", () => {
    const p = startDive(registry, setAutoSalvage(hero(), 'rare', true), 1);
    expect(addLootToBag(registry, p, [rare]).profile.dive!.haul.links).toBe(3);
    const w = beginFloor(registry, p);
    w.pending.items = [rare];
    const res = bankWorld(registry, p, w);
    expect(res.links).toBe(3);
    expect(res.profile.links).toBe(0); // in the haul until the dive settles (see the crafting spec)
```

In `packages/engine/tests/delve-pair.test.ts`, replace:

```ts
import {
  createDelveProfile,
  equipBest,
```

with:

```ts
import {
  addLootToBag,
  createDelveProfile,
  equipBest,
```

In `packages/engine/tests/delve-pair.test.ts`, replace:

```ts
  it('auto-salvage and a full bag add it, and banking reports it', () => {
    const p = startDive(registry, setAutoSalvage(fire(), 'magic', true), 1);
    const w = beginFloor(registry, p);
    w.pending.items = [magic('frost', 'a'), magic('fire', 'b')];
    const res = bankWorld(registry, p, w);
    expect(res.dust).toBe(dust.magic);
    expect(res.profile.manaDust).toBe(dust.magic);
```

with:

```ts
  it("auto-salvage and a full bag add it to the floor's haul, and banking reports it", () => {
    const p = startDive(registry, setAutoSalvage(fire(), 'magic', true), 1);
    expect(addLootToBag(registry, p, [magic('frost', 'a')]).profile.dive!.haul.dust).toBe(
      dust.magic,
    );
    const w = beginFloor(registry, p);
    w.pending.items = [magic('frost', 'a'), magic('fire', 'b')];
    const res = bankWorld(registry, p, w);
    expect(res.dust).toBe(dust.magic);
    expect(res.profile.manaDust).toBe(0); // in the haul until the dive settles (see the crafting spec)
```

In `packages/engine/tests/delve-runes.test.ts`, replace:

```ts
  it("banking settles an auto-salvaged weapon's runes by the pull mode it is given, and so does a floor's end", () => {
    const { p, w } = floor();
    const auto = setAutoSalvage(p, 'rare', true);
    w.pending.items = [socketedSword()];
    expect(bankWorld(registry, auto, w, { unsocket: 'pay' }).profile.runes).toEqual({
      chain: [0, 1, 0, 0, 0],
      split: [1, 0, 0, 0, 0],
    });
    w.pending.items = [socketedSword()];
    expect(failFloor(registry, auto, w, { unsocket: 'pay' }).profile.runes).toEqual({
      chain: [0, 1, 0, 0, 0],
      split: [1, 0, 0, 0, 0],
    });
    w.pending.items = [socketedSword()];
    expect(bankWorld(registry, auto, w).profile.runes).toEqual({});
  });
```

with:

```ts
  it("mid-dive an auto-salvaged weapon's runes go to the floor's haul by the pull mode given, never the pouch", () => {
    const { p, w } = floor();
    const auto = setAutoSalvage(p, 'rare', true);
    const paid = addLootToBag(registry, auto, [socketedSword()], { unsocket: 'pay' });
    expect(paid.profile.dive!.haul.runes).toEqual({
      chain: [0, 1, 0, 0, 0],
      split: [1, 0, 0, 0, 0],
    });
    expect(paid.profile.runes).toEqual({});
    expect(addLootToBag(registry, auto, [socketedSword()]).profile.dive!.haul.runes).toEqual({});
    w.pending.items = [socketedSword()];
    expect(bankWorld(registry, auto, w, { unsocket: 'pay' }).profile.runes).toEqual({});
    w.pending.items = [socketedSword()];
    expect(failFloor(registry, auto, w, { unsocket: 'pay' }).profile.runes).toEqual({});
  });
```

In `packages/engine/tests/delve-crafting-contract.test.ts`, replace:

```ts
  it('names what a salvage gave besides scrap, Dust and Links (none until B2)', () => {
```

with:

```ts
  it('names what a salvage gave besides scrap, Dust and Links', () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-salvage-yield.test.ts tests/delve-movesets.test.ts tests/delve-pair.test.ts tests/delve-runes.test.ts)`
Expected: FAIL, 6 tests in 4 files: the three new ones (`expected { …(10) } to match object { count: 2, …(2) }` and the like: no shards, patterns or essences yet, and no forgeCount bump), the Links and Mana Dust ones (`expected +0 to be 3`: the melt still pays the stockpile, so the haul is empty) and the runes one (`expected {} to deeply equal { chain: [ +0, 1, +0, +0, +0 ], …(1) }`).

- [ ] **Step 3: One melt for every salvage**

In `packages/engine/src/delve/profile.ts`, replace:

```ts
import {
  applyUpgrade,
  reforgeAffix,
  reforgeCost,
  salvageValue,
  upgradeCost,
} from '../loot/smithing.js';
```

with:

```ts
import { applyUpgrade, reforgeAffix, reforgeCost, upgradeCost } from '../loot/smithing.js';
```

In `packages/engine/src/delve/profile.ts`, replace:

```ts
import { chooseStartingMana, salvageDust, type ChainFix } from './pair.js';
```

with:

```ts
import { chooseStartingMana, type ChainFix } from './pair.js';
```

In `packages/engine/src/delve/profile.ts`, replace:

```ts
import { settleParts, type SetChainsOptions } from './runes.js';
```

with:

```ts
import type { SetChainsOptions } from './runes.js';
```

In `packages/engine/src/delve/profile.ts`, replace:

```ts
import { rollFloor } from '../loot/forge.js';
```

with:

```ts
import { rollFloor } from '../loot/forge.js';
import { applySalvage, salvageRng } from '../loot/salvage-yield.js';
```

In `packages/engine/src/delve/profile.ts`, replace the lines from `export interface BagInsertResult {` up to (not including) `/** Mid-dive, all gear is locked, the forge and salvage too (see the weapon movesets spec). */` with:

```ts
/** What melting gear gave (`applySalvage`, item by item). */
export interface Melted {
  scrap: number;
  /** Mana Dust from the melted items outside the pair. */
  dust: number;
  /** Links from the melted weapons' extra slots and open sockets. */
  links: number;
  /** Runes back to the pouch (or mid-dive the haul) from melted weapons' sockets (see the runes spec). */
  runes: RuneRef[];
  /** Runes the melted weapons' sockets destroyed. */
  destroyed: RuneRef[];
  /** The shards, the patterns learned and the essences they gave (see the crafting spec's Salvage). */
  shards: ShardRef[];
  patterns: string[];
  essences: string[];
}

/**
 * Melt `items` one by one (`applySalvage`, each on its own `salvageRng`):
 * mid-dive into the floor's haul, at the Anvil into the stockpile, moving
 * `forgeCount` on once. Their runes leave by the parts rule (`opts.unsocket`).
 */
function melt(
  registry: DataRegistry,
  profile: DelveProfile,
  items: GearItem[],
  opts: Pick<SetChainsOptions, 'unsocket'>,
): Melted & { profile: DelveProfile } {
  const out: Melted = {
    scrap: 0,
    dust: 0,
    links: 0,
    runes: [],
    destroyed: [],
    shards: [],
    patterns: [],
    essences: [],
  };
  let next = profile;
  for (const item of items) {
    const r = applySalvage(registry, next, item, salvageRng(profile, item), opts);
    next = r.profile;
    out.scrap += r.scrap;
    out.dust += r.dust;
    out.links += r.links;
    out.runes.push(...r.runes);
    out.destroyed.push(...r.destroyed);
    out.shards.push(...r.shards);
    if (r.pattern) out.patterns.push(r.pattern);
    if (r.essence) out.essences.push(r.essence);
  }
  if (items.length > 0 && !isDiveActive(profile))
    next = { ...next, forgeCount: next.forgeCount + 1 };
  return { ...out, profile: next };
}

export interface BagInsertResult extends Melted {
  profile: DelveProfile;
  kept: GearItem[];
  salvaged: GearItem[];
  bagFull: boolean;
  newCodex: string[];
}

/**
 * Put fresh loot in the bag, honouring auto-salvage and bag capacity. What
 * doesn't fit or is set to auto-salvage melts (`melt`): mid-dive its yield
 * goes to the floor's haul (see the crafting spec), and a melted weapon's
 * runes leave by the parts rule (`opts.unsocket`, else the balance's).
 */
export function addLootToBag(
  registry: DataRegistry,
  profile: DelveProfile,
  items: GearItem[],
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): BagInsertResult {
  const bagSize = registry.getDelveBalance().loot.bagSize;
  const recorded = recordFinds(profile, items);
  const bag = recorded.profile.bag.slice();
  const kept: GearItem[] = [];
  const salvaged: GearItem[] = [];
  let bagFull = false;
  for (const item of items) {
    const auto = item.rarity !== 'legendary' && profile.autoSalvage[item.rarity];
    if (auto || bag.length >= bagSize) {
      if (!auto) bagFull = true;
      salvaged.push(item);
    } else {
      bag.push(item);
      kept.push(item);
    }
  }
  const melted = melt(registry, { ...recorded.profile, bag }, salvaged, opts);
  return { ...melted, kept, salvaged, bagFull, newCodex: recorded.newCodex };
}

```

In `packages/engine/src/delve/profile.ts`, replace the lines from `* Salvage bag items. Locked or missing uids are skipped. Gear outside the pair` up to (not including) `export function salvageCandidates(` with:

```ts
 * Salvage bag items (`melt`: each gives scrap, shards or an essence, its
 * pattern, Mana Dust off the pair, and a weapon's Links and runes by the
 * parts rule, `opts.unsocket` else the balance's). Locked or missing uids are
 * skipped. Mid-dive it melts nothing (auto-salvage of new loot,
 * `addLootToBag`, still runs).
 */
export function salvageItems(
  registry: DataRegistry,
  profile: DelveProfile,
  uids: string[],
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): Melted & { profile: DelveProfile; count: number } {
  const targets = new Set(uids);
  const melted = isDiveActive(profile)
    ? []
    : profile.bag.filter((item) => targets.has(item.uid) && !item.locked);
  const bag = profile.bag.filter((item) => !melted.includes(item));
  const res = melt(registry, melted.length > 0 ? { ...profile, bag } : profile, melted, opts);
  return { ...res, count: melted.length };
}

/** Bag items that are safe to melt: unlocked, not an upgrade (a weapon as a home), at or below `maxRarity`, and no weapon holding runes. */
```

(The `/**` line above the replaced doc stays: the new text starts with the doc's second line.)

- [ ] **Step 4: Run them to see them pass, then the whole engine**

Run: `(cd packages/engine && npx vitest run tests/delve-salvage-yield.test.ts tests/delve-movesets.test.ts tests/delve-pair.test.ts tests/delve-runes.test.ts tests/delve-crafting-contract.test.ts)`
Expected: PASS.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; **N + 45** tests pass in **F + 3** files (5 skipped, 1 file skipped). The pacing rails pass unchanged (the autopilot melts at the Anvil, where the stockpile still gets everything).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-b2
npx prettier --write --end-of-line auto packages/engine/src/delve/profile.ts packages/engine/tests/delve-salvage-yield.test.ts packages/engine/tests/delve-movesets.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-runes.test.ts packages/engine/tests/delve-crafting-contract.test.ts
git add packages/engine/src/delve/profile.ts packages/engine/tests/delve-salvage-yield.test.ts packages/engine/tests/delve-movesets.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-runes.test.ts packages/engine/tests/delve-crafting-contract.test.ts
git commit -m "feat(engine): every salvage melts through applySalvage; mid-dive into the floor's haul" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Verification

After Task 6, on `craft/b2`:

```bash
cd /c/Projects/alloy-craft-b2
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
git status --short
```

Expected:
- the engine: no type errors; **N + 45** tests (1706 at `a53a85f`'s 1661) in **F + 3** files, 5 skipped, the pacing rails among them, unchanged;
- tsup's "Build success" lines (the DTS build type-checks the bundle);
- the client: no type errors; **1169 tests in 146 files**, unchanged (the store's actions already call these ops, and nothing a client test reads changed shape);
- `git status` clean but for the untracked `dist` the build leaves ignored (six commits on `craft/b2`).

What the gate covers, by the spec's Tests section (B2's parts):
- **Forging:** `previewForge` equals `forgeItem` minus the draws (five requests: common to legendary, a weapon, an off-pair item); shard bands, the Attune shards' own two tiers; the floor on and off the pair, its cap and the `u` formula; every refusal code, a full bag and an essence's slots among them.
- **Refining:** counts, prices, the top grade and an affix's last tier refused; the shard bench.
- **Sinks:** an essence makes a legendary (its power's roll lifted by the floor); Reforge clears `band`; Hone and Imprint, their prices and refusals.
- **Salvage:** a pattern learned on salvage; `applySalvage`'s yields, a legendary's essence (also from a full bag mid-dive), the parts rule in both modes, the keyed streams; `salvageItems` and `addLootToBag` through it.
- **Determinism:** every roll draws on a seeded fork (`forge:${forgeCount}`, `salvage:${forgeCount}:${uid}`, the dive seed's `salvage:${uid}`); a drop rolls bit for bit as before (the items hash holds).
