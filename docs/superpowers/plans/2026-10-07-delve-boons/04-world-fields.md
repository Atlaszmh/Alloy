# Delve boons · B3: world fields (engine) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each of the spec's world, loot, dive and floor fields (§2's table) its one handler at its site, each with a short test: the floor start (`barrierOnFloor`, `noPotions`, `exitRevealed`, `eliteChance`, and `find`, which already sums), the magnet, a room's clear (`healOnClear`), a shrine's prayer (`shrinesLastDive`), a foe's drops (`metalUp`, `flux`, `scrap`, `runes`; a vault chest takes `metalUp` and `flux` too), the settle (`deathLoss`), the doors (`skip`), slow ground (`noSlow`) and hazards (`hazardsFriendly`). With no boon worn every site computes exactly what it does today, so the whole-autopilot fingerprint stays identical after every task.

**Architecture:** Every site reads the hero's combined view, `world.hero.boon` (`BoonSum`, Phase A's), or, off the floor, `buffSum(dive.diveBuffs)`. Multipliers default to 1 and additive fields to 0 at the read (`?? 1`, `?? 0`), so an absent field is the old arithmetic exactly. **No random stream gains or loses a draw** because of a neutral boon: chances are multiplied or raised, never given a draw of their own; Scrapper's extra scrap rides the same number of pickups. One new test file, `tests/delve-boons-world.test.ts`, holds every field's test (one `describe` per site), so no test file is shared with B1 or B2.

**Tech Stack:** TypeScript 5.7, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-06-delve-boons-design.md` (authoritative), §2's table rows for the fields above and §4's "Wearing it" and "Settle". The contract is `00-overview.md` → "The contract".

---

## Base

- **Starts from:** `boons/main` with Phase A merged, in this area's worktree:

```bash
cd /c/Projects/Alloy && git worktree add ../alloy-boons-b3 -b boons/b3 boons/main
```

  Every path below is relative to `/c/Projects/alloy-boons-b3`.
- **Anchors:** drafted against `main` at `d3b5e447` plus the contract. Every file edited here is B3's alone (overview's table) except `arpg/action.ts` (one line, Task 7; no area owns it). The replaced blocks below are today's code; Phase A touches none of them except `applyShrine` (Task 4 names the one line it changes, which survives A's rename) and `beginFloor`'s stats (not touched here).
- **What this plan assumes Phase A landed** (check before Task 1; if one is missing, stop and ask the integrator):
  1. `HeroEntity.boon: BoonSum` is set in `createHeroEntity` to `buffSum(diveBuffs)` (so a floor's hero wears its dive boons' view from the first line of `createFloorWorld`), and `applyShrine` refreshes it after pushing a blessing (`buffSum([...h.diveBuffs, ...h.floorBuffs])`).
  2. `buffSum` (`src/delve/boons.ts`) sums `barrierOnFloor`, `healOnClear`, `eliteChance`, `find`, `magnet`, `metalUp`, `scrap`, `deathLoss`, `skip`; multiplies `flux`, `runes`, `gear`; takes the largest `hazardsFriendly`; and leaves every field it saw no entry for absent (`undefined`). The flags (`noPotions`, `exitRevealed`, `shrinesLastDive`, `noSlow`) are `true` when any entry has them.
  3. `Buff` is `{ boon, tier, effect: BoonEffect }` (`types/boon.ts`, re-exported from `types/floor-map.ts`), on `HeroEntity.diveBuffs` / `floorBuffs`, `WorldPending.diveBuffs` and `DiveState.diveBuffs`.
  4. `applyShrine(registry, world, shrine: BoonDef)` reads `shrine.tiers[0].effect` and still branches on `shrine.duration === 'dive'`; `registry.getBoon(id): BoonDef | undefined`; the six shrine ids are unchanged.
- **Before Task 1:** build once and run the files this area touches, to have a baseline:

```bash
cd /c/Projects/alloy-boons-b3/packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run tests/delve-maps-interact.test.ts tests/delve-maps-fog.test.ts tests/delve-material-drops.test.ts tests/delve-banking.test.ts tests/delve-dive.test.ts tests/delve-terrain-ground.test.ts tests/delve-objects-hazards.test.ts tests/delve-maps-save.test.ts --reporter=dot
```

  Expected: no type errors; every file passes.
- **The fingerprint check** (overview's conventions): Phase A's probe `boons-a-probe.test.ts` and its before file `boons-a-before.json`, in the scratchpad `$P` below. After Tasks 1–8:

```bash
cd /c/Projects/alloy-boons-b3
P=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/40eae1ba-9296-44c8-9c7b-c2e0e4edb2b6/scratchpad
cp $P/boons-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/boons-b3-after.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
cmp $P/boons-a-before.json $P/boons-b3-after.json
```

  Expected: the probe passes and `cmp` prints nothing. Until B1 merges, no stop offers a boon, so the autopilot never wears one and every handler here sees the neutral view.

## Files

| File | Change |
|---|---|
| `packages/engine/src/arpg/world.ts` | `boonFloorStart` (Stone Skin's barrier, Famine's flasks, Cartographer's exit), called once the world is built; `eliteChance` raised by the boons (Tasks 1–2) |
| `packages/engine/src/arpg/fog.ts` | `revealRoom` (out of `fogTick`, unchanged behaviour), `revealExit` (Task 2) |
| `packages/engine/src/arpg/step.ts` | the magnet's reach × (1 + Σ `magnet`) (Task 3) |
| `packages/engine/src/arpg/interact.ts` | `healOnClear` in `onMonsterKilled`; `shrinesLastDive` in `applyShrine` (Task 4); `rollVault` passes `metalUp` and `flux` (Task 5) |
| `packages/engine/src/arpg/material-drops.ts` | `MaterialDropContext.metalUp` / `flux`; `rollMetal`'s `up`; Scrapper in `dropMaterials` (Task 5) |
| `packages/engine/src/arpg/rune-drops.ts` | × the boons' `runes` (Task 5) |
| `packages/engine/src/delve/dive.ts` | `settleDive`'s `deathLoss`; `chooseDoor`'s `skip`, spent (Task 6) |
| `packages/engine/src/arpg/terrain.ts`, `src/arpg/action.ts` | `noSlow` for the hero's walk and pushes (Task 7) |
| `packages/engine/src/arpg/objects.ts` | `hazardsFriendly` (Task 8) |
| `packages/engine/tests/delve-boons-world.test.ts` (new) | one `describe` per site (Tasks 1–8) |

## Where the spec left room

1. **Stone Skin's barrier lasts the floor:** `until: Infinity`, broken only by damage; entries sum (two commons, 16%). It is set after the hero is built, so Glass Cannon's smaller life sizes it.
2. **Famine** sets the floor's hero's flasks to 0; `bankWorld` carries that back to `dive.potions`, so the stop's potion has none either. A Mercy shrine still refills (a refill stays a refill).
3. **Deep Breath** heals through `healHero` with source `'kill'` (a clear always comes with a kill; no new heal source, so no type or client change).
4. **Scrapper** multiplies a foe's kill scrap in `dropMaterials` (rounded), split over the pickups the unboosted scrap made, so no `materialRng` draw moves. `killScrap` (B2's `combat.ts`) is unchanged, so a broken prop's scrap and the `death` event's `scrap` don't take it.
5. **Prospector and Flux Nose** reach a foe's drops (`dropMaterials`) and a vault chest's (`rollVault`, decided by the coordinator), never a prop's bar (`objects.ts` calls `rollMetal` without `up`). The vault's table holds no bars today, so Prospector waits there for one; the vault's flux chance is already 1, so Flux Nose's factor shows there only below 1. Both pass through `rollMaterialDrops`'s context: one draw per entry either way.
6. **Rune Sense** multiplies a normal or elite foe's chance; a boss always drops one (unchanged `rollRuneDrop`).
7. **Deeper Still's skip is spent** by setting each entry's `effect.skip` to 0 (`{ ...effect, skip: 0 }`); the entry and its Find stay.
8. **Cartographer** reveals the exit's room as entering it would (its cells seen, not in sight; `fogVersion` + 1): the minimap shows it and "Rooms explored" counts it. A no-op on the open room.
9. **Trailblazer** frees the hero's walk (`groundSpeed`) and pushes (`action.ts`, which can't import `terrain.ts`: that edge would pull `combat.ts` into `world.ts`'s graph and break `delve-maps-save.test.ts`'s mock of `world.js`), never a foe's.
10. **Arsonist** keeps a burst's damage on foes; the hero is simply not in its reach.
11. **One test file**, `tests/delve-boons-world.test.ts`, holds every field's test (not each site's own test file), so B3 shares no test file with B1 or B2.
12. **`boonFloorStart` runs in `createFloorWorld`** (not `beginFloor`), once the world is built: every floor a dive makes passes there with its `diveBuffs`, and the Training Grounds and the DPS Lab, which pass none, see nothing.

## Needs routed

1. **`gear` and the floor-long barrier: covered by B2 Task 10** (`dropLoot`'s gear multiplier with its test; a floor-long barrier kept under Obsidian and Guard). Nothing for B3 there.
2. **C2 (`useArenaCore.ts`, the buff tiles):** the barrier tile's seconds come from `barrier.until − t`; Stone Skin's is `Infinity`. Show no seconds for it (as a blessing has none).
3. **Integrator:** `arpg/action.ts` (no owner) gets one line in Task 7.

## Conventions

The overview's. In short: one commit a task on `boons/b3`, staged by path, ending `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`; never push or merge. Keep each file's line endings (the Edit tool does); new files LF. Never reformat `dive.ts` (its lines are long on purpose). "Replace:" (a block) "with:" (a block) is one Edit; every old block is unique in its file.

**Commands** (from `packages/engine`):

| What | Command |
|---|---|
| This area's tests | `npx vitest run tests/delve-boons-world.test.ts --reporter=dot` |
| Typecheck and a set of files | `npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot` |
| Whole engine suite (Task 9 only, ~12 min) | `npx vitest run --reporter=dot` |

Vitest doesn't typecheck (tests are outside `tsconfig`'s `include`), so a step's FAIL is an assertion failing, never a compile error.

Fixture geometry (`tests/fixtures/arena.ts`): the open 26 × 40 room at depth 2, the hero at (13, 36) with a common Fire sword; `dummy(x, y)` a foe that never fights back; `onMap(w, walls)` puts a world on a hand-built map; `floorWorld(twoRooms(kind))` (`fixtures/flow-map.ts`) two rooms, room 1 on the right.

---

## Chunk 1: The floor start

### Task 1: Stone Skin, Famine, Hunted's elites, Find

**Files:**
- Create: `packages/engine/tests/delve-boons-world.test.ts`
- Modify: `packages/engine/src/arpg/world.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-boons-world.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { hudMapOf, roomAt } from '../src/arpg/fog.js';
import { bindTerrain } from '../src/arpg/grid.js';
import { applyShrine, rollVault } from '../src/arpg/interact.js';
import {
  dropMaterials,
  rollMaterialDrops,
  type MaterialDropContext,
} from '../src/arpg/material-drops.js';
import { hitObject } from '../src/arpg/objects.js';
import { dropRune } from '../src/arpg/rune-drops.js';
import { groundSpeed } from '../src/arpg/terrain.js';
import { createFloorWorld, type FloorOptions } from '../src/arpg/world.js';
import { buffSum } from '../src/delve/boons.js';
import { chooseDoor, settleDive, startDive } from '../src/delve/dive.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { emptyHaul, metalAt } from '../src/loot/materials.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgWorld, Drop, HazardEntity } from '../src/types/arpg.js';
import type { BoonEffect, Buff } from '../src/types/boon.js';
import type { DelveProfile } from '../src/types/delve.js';
import { CELL } from '../src/types/floor-map.js';
import { arena, bal, chainsWith, dummy, gear, registry, run } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';
import { onMap } from './fixtures/maps.js';

// The boons spec's world, loot, dive and floor fields (§2), each at its one site. With no boon
// worn every site is as before (the fingerprint); these tests wear one.

const buff = (effect: BoonEffect, boon = 'test'): Buff => ({ boon, tier: 1, effect });

/** `w`'s hero wearing one more dive boon of `effect`, its combined view refreshed. */
function wear<W extends ArpgWorld>(w: W, effect: BoonEffect): W {
  w.hero.diveBuffs.push(buff(effect));
  w.hero.boon = buffSum([...w.hero.diveBuffs, ...w.hero.floorBuffs]);
  return w;
}

/** A floor at depth 3, seed 77 (the open room unless `o.layout` says), worn with `effects`. */
function floor(effects: BoonEffect[] = [], o: Partial<FloorOptions> = {}): ArpgWorld {
  return createFloorWorld(registry, {
    depth: 3,
    door: null,
    stats: computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry),
    chains: chainsWith(),
    heroHpFrac: 1,
    potions: 3,
    phoenixAvailable: true,
    seed: 77,
    loot: { nextUid: 100, find: 0, legendaryBoost: 1, patterns: [], dropsGiven: [], pair: [] },
    diveBuffs: effects.map((e) => buff(e)),
    ...o,
  });
}

describe('the floor start (world.ts)', () => {
  it('Stone Skin: an Obsidian barrier of Σ barrierOnFloor × max life, lasting the floor', () => {
    const h = floor([{ barrierOnFloor: 0.08 }, { barrierOnFloor: 0.04 }]).hero;
    expect(h.barrier!.hp).toBeCloseTo(h.stats.maxHp * 0.12, 9);
    expect(h.barrier).toMatchObject({ max: h.barrier!.hp, until: Infinity });
    expect(floor().hero.barrier).toBeNull();
  });

  it('Famine: no potions at the floor start', () => {
    expect(floor([{ noPotions: true }]).hero.potions).toBe(0);
    expect(floor().hero.potions).toBe(3);
  });

  it('Hunted: every pack elite-led at eliteChance 1; a neutral entry spawns exactly as none', () => {
    const packs = new Map<number, string[]>();
    for (const m of floor([{ eliteChance: 1 }]).monsters)
      packs.set(m.packId, [...(packs.get(m.packId) ?? []), m.kind]);
    expect(packs.size).toBeGreaterThan(1);
    expect([...packs.values()].every((kinds) => kinds.includes('elite'))).toBe(true);
    expect(floor([{ eliteChance: 0 }]).monsters).toEqual(floor().monsters);
  });

  it("Magpie: the dive boons' Find is on the loot from the start", () => {
    expect(floor([{ find: 25 }, { find: 15 }]).loot.find).toBe(floor().loot.find + 40);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/engine && npx vitest run tests/delve-boons-world.test.ts --reporter=dot`
Expected: FAIL — Stone Skin (`barrier` is null), Famine (3 potions) and Hunted (seed 77's open room has packs with no elite at 0.2); Magpie PASSES already (`createFloorWorld` sums the dive entries' `find`; the test pins it).

- [ ] **Step 3: The handlers**

In `packages/engine/src/arpg/world.ts`:

Replace:

```ts
    tutorial: opts.tutorial ? { ...opts.tutorial.state, tally: {} } : null,
  };

  const mods = opts.door?.mods ?? {};
  const boss = isBossFloor(registry, opts.depth);
  const packs = opts.empty ? 0 : floorPacks(registry, opts.depth, opts.door);
  const eliteChance = Math.max(bal.dive.eliteChance, mods.eliteChance ?? 0);
```

with:

```ts
    tutorial: opts.tutorial ? { ...opts.tutorial.state, tally: {} } : null,
  };
  boonFloorStart(world);

  const mods = opts.door?.mods ?? {};
  const boss = isBossFloor(registry, opts.depth);
  const packs = opts.empty ? 0 : floorPacks(registry, opts.depth, opts.door);
  // Hunted (the boons spec's `eliteChance`) raises it like a door; the pack's draw is made whatever it is.
  const eliteChance = Math.max(
    bal.dive.eliteChance,
    mods.eliteChance ?? 0,
    world.hero.boon.eliteChance ?? 0,
  );
```

Replace:

```ts
/**
 * Build the arena for one depth: the open room (the hero at the bottom, packs spread
```

with:

```ts
/**
 * What the dive's boons do as a floor starts (the boons spec's §2): Stone Skin's Obsidian
 * barrier of `barrierOnFloor` × max life, for the floor (`until: Infinity`); Famine's empty
 * flasks (`noPotions`).
 */
function boonFloorStart(world: ArpgWorld): void {
  const h = world.hero;
  const { barrierOnFloor, noPotions } = h.boon;
  if (barrierOnFloor) {
    const hp = h.stats.maxHp * barrierOnFloor;
    h.barrier = { hp, max: hp, until: Infinity };
  }
  if (noPotions) h.potions = 0;
}

/**
 * Build the arena for one depth: the open room (the hero at the bottom, packs spread
```

- [ ] **Step 4: Run it to see it pass, with the files around it**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-world.test.ts tests/delve-maps-save.test.ts tests/delve-maps-generate.test.ts tests/delve-dive.test.ts --reporter=dot`
Expected: no type errors; all PASS (4 tests in the new file).

Run the fingerprint check (Base). Expected: identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-boons-b3
git add packages/engine/src/arpg/world.ts packages/engine/tests/delve-boons-world.test.ts
git commit -m "feat(engine): boons at the floor start: Stone Skin's barrier, Famine, Hunted's elites" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Cartographer (`exitRevealed`)

**Files:**
- Modify: `packages/engine/src/arpg/fog.ts`, `src/arpg/world.ts`, `tests/delve-boons-world.test.ts`

- [ ] **Step 1: The failing test**

Append to `tests/delve-boons-world.test.ts`:

```ts
describe('exitRevealed (fog.ts)', () => {
  it("Cartographer: a generated floor starts with its exit's room revealed, on the minimap", () => {
    const plain = floor([], { layout: 'generated' });
    const exit = roomAt(plain.map, plain.map.exit.x, plain.map.exit.y)!;
    expect(exit.id).not.toBe(roomAt(plain.map, plain.map.start.x, plain.map.start.y)!.id);
    expect([exit.revealed, hudMapOf(plain).exit]).toEqual([false, null]);

    const w = floor([{ exitRevealed: true }], { layout: 'generated' });
    const room = roomAt(w.map, w.map.exit.x, w.map.exit.y)!;
    expect(room.revealed).toBe(true);
    expect(hudMapOf(w).exit).toEqual(w.map.exit);
    expect(w.fog[(room.rect.y + 1) * w.map.width + room.rect.x + 1]).toBe(1);
    expect(w.fogVersion).toBe(1);
  });

  it('a no-op on the open room', () => {
    expect(floor([{ exitRevealed: true }]).fogVersion).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/engine && npx vitest run tests/delve-boons-world.test.ts --reporter=dot`
Expected: FAIL — the first test (`room.revealed` false; seed 77 at depth 3 starts in room 0 with the exit in room 2); the open-room test passes.

- [ ] **Step 3: The handler**

In `packages/engine/src/arpg/fog.ts`:

Replace:

```ts
  const room = roomAt(map, h.x, h.y);
  const entered = !!room && !room.revealed;
  if (room && entered) {
    room.revealed = true;
    const { x, y, w: rw, h: rh } = room.rect;
    for (let j = Math.max(0, y - 1); j <= Math.min(map.height - 1, y + rh); j++)
      for (let i = Math.max(0, x - 1); i <= Math.min(w - 1, x + rw); i++)
        fog[j * w + i] = Math.max(fog[j * w + i], 1);
  }
  if (entered || changed) world.fogVersion++;
```

with:

```ts
  const room = roomAt(map, h.x, h.y);
  const entered = !!room && revealRoom(world, room);
  if (entered || changed) world.fogVersion++;
```

Replace:

```ts
const ICONS: Record<InteractableKind, HudIcon> = {
```

with:

```ts
/** Reveal `room` whole (its floor and the walls round it seen); false when it already was. */
function revealRoom(world: ArpgWorld, room: Room): boolean {
  if (room.revealed) return false;
  room.revealed = true;
  const { map, fog } = world;
  const w = map.width;
  const { x, y, w: rw, h: rh } = room.rect;
  for (let j = Math.max(0, y - 1); j <= Math.min(map.height - 1, y + rh); j++)
    for (let i = Math.max(0, x - 1); i <= Math.min(w - 1, x + rw); i++)
      fog[j * w + i] = Math.max(fog[j * w + i], 1);
  return true;
}

/**
 * Cartographer (the boons spec's `exitRevealed`): the exit's room revealed as
 * the floor starts, as entering it would. A no-op on the open room.
 */
export function revealExit(world: ArpgWorld): void {
  const { map } = world;
  if (map.open) return;
  const room = roomAt(map, map.exit.x, map.exit.y);
  if (room && revealRoom(world, room)) world.fogVersion++;
}

const ICONS: Record<InteractableKind, HudIcon> = {
```

In `packages/engine/src/arpg/world.ts` (`fog.ts` imports only `grid.ts` and types, so `delve-maps-save.test.ts`'s mock of `world.js` is unaffected):

Replace:

```ts
import { footprintsOf } from './layout/furnish.js';
```

with:

```ts
import { revealExit } from './fog.js';
import { footprintsOf } from './layout/furnish.js';
```

Replace:

```ts
 * flasks (`noPotions`).
 */
function boonFloorStart(world: ArpgWorld): void {
  const h = world.hero;
  const { barrierOnFloor, noPotions } = h.boon;
```

with:

```ts
 * flasks (`noPotions`); Cartographer's exit room revealed (`exitRevealed`, `revealExit`).
 */
function boonFloorStart(world: ArpgWorld): void {
  const h = world.hero;
  const { barrierOnFloor, noPotions, exitRevealed } = h.boon;
  if (exitRevealed) revealExit(world);
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-world.test.ts tests/delve-maps-fog.test.ts tests/delve-maps-save.test.ts tests/delve-maps-bot.test.ts --reporter=dot`
Expected: no type errors; all PASS (6 tests in the new file).

Run the fingerprint check. Expected: identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-boons-b3
git add packages/engine/src/arpg/fog.ts packages/engine/src/arpg/world.ts packages/engine/tests/delve-boons-world.test.ts
git commit -m "feat(engine): Cartographer reveals the exit's room at the floor start" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Chunk 2: The fight's world

### Task 3: Wide Net (`magnet`)

**Files:**
- Modify: `packages/engine/src/arpg/step.ts`, `tests/delve-boons-world.test.ts`

- [ ] **Step 1: The failing test**

Append:

```ts
describe('magnet (step.ts)', () => {
  const scrapAt = (w: ArpgWorld, y: number): Drop => {
    const d: Drop = { id: w.nextId++, kind: 'scrap', x: 13, y, amount: 1, born: 0, vacuum: false, dead: false };
    w.drops.push(d);
    return d;
  };

  it("Wide Net: the magnet's reach × (1 + Σ magnet)", () => {
    const gap = bal.hero.magnetRadius * 1.25; // in reach at +40%, out of it without
    // A foe far up the room keeps it uncleared, so no vacuum pulls the drop.
    const plain = arena([dummy(13, 2)], { noBasic: true });
    const far = scrapAt(plain, plain.hero.y - gap);
    run(plain, 1);
    expect([far.dead, far.y]).toEqual([false, plain.hero.y - gap]);

    const w = wear(wear(arena([dummy(13, 2)], { noBasic: true }), { magnet: 0.2 }), { magnet: 0.2 });
    const near = scrapAt(w, w.hero.y - gap);
    run(w, 1);
    expect(near.dead).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/engine && npx vitest run tests/delve-boons-world.test.ts --reporter=dot`
Expected: FAIL — Wide Net (`near.dead` false).

- [ ] **Step 3: The handler**

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
  const { magnetSpeed, vacuumSpeed, pickupDelay } = bal.drops;
  for (const d of world.drops) {
    if (d.dead) continue;
    const gap = dist(h.x, h.y, d.x, d.y);
    // The magnet draws what it sees; the vacuum, anything. Both slide along walls.
    const magnet = !walkedOver(d) && gap < bal.hero.magnetRadius && sees(world.map, d, h);
```

with:

```ts
  const { magnetSpeed, vacuumSpeed, pickupDelay } = bal.drops;
  // Wide Net (the boons spec's `magnet`): the reach × (1 + Σ).
  const reach = bal.hero.magnetRadius * (1 + (h.boon.magnet ?? 0));
  for (const d of world.drops) {
    if (d.dead) continue;
    const gap = dist(h.x, h.y, d.x, d.y);
    // The magnet draws what it sees; the vacuum, anything. Both slide along walls.
    const magnet = !walkedOver(d) && gap < reach && sees(world.map, d, h);
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-world.test.ts tests/delve-maps-movers.test.ts tests/delve-banking.test.ts --reporter=dot`
Expected: no type errors; all PASS (7 tests in the new file).

Run the fingerprint check. Expected: identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-boons-b3
git add packages/engine/src/arpg/step.ts packages/engine/tests/delve-boons-world.test.ts
git commit -m "feat(engine): Wide Net widens the magnet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Deep Breath (`healOnClear`) and Sanctuary (`shrinesLastDive`)

**Files:**
- Modify: `packages/engine/src/arpg/interact.ts`, `tests/delve-boons-world.test.ts`

- [ ] **Step 1: The failing tests**

Append:

```ts
describe('interact.ts', () => {
  it("Deep Breath: a room's clear gives back Σ healOnClear × max life", () => {
    const clear = (w: ArpgWorld) => {
      w.hero.hp = w.hero.stats.maxHp / 2;
      killMonster(makeCtx(registry, w, []), w.monsters[0]);
      expect(w.map.rooms[1].cleared).toBe(true);
      return w.hero.hp;
    };
    const plain = clear(floorWorld(twoRooms('combat'), [dummy(16, 3, { roomId: 1 })]));
    const w = wear(floorWorld(twoRooms('combat'), [dummy(16, 3, { roomId: 1 })]), { healOnClear: 0.06 });
    expect(clear(w) - plain).toBeCloseTo(w.hero.stats.maxHp * 0.06, 6);
  });

  it("Sanctuary: a floor shrine's blessing goes on the dive's and the bank's; a refill stays a refill", () => {
    const w = wear(arena([]), { shrinesLastDive: true });
    applyShrine(registry, w, registry.getBoon('clarity')!);
    expect(w.hero.floorBuffs).toEqual([]);
    expect(w.hero.diveBuffs.map((b) => b.boon)).toEqual(['test', 'clarity']);
    expect(w.pending.diveBuffs.map((b) => b.boon)).toEqual(['clarity']);
    w.hero.potions = 0;
    applyShrine(registry, w, registry.getBoon('mercy')!);
    expect([w.hero.potions, w.hero.diveBuffs.length]).toEqual([bal.dive.maxPotions, 2]);

    const plain = arena([]);
    applyShrine(registry, plain, registry.getBoon('clarity')!);
    expect([plain.hero.floorBuffs.length, plain.hero.diveBuffs.length]).toEqual([1, 0]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/engine && npx vitest run tests/delve-boons-world.test.ts --reporter=dot`
Expected: FAIL — Deep Breath (the difference is 0) and Sanctuary (`floorBuffs` holds Clarity).

- [ ] **Step 3: The handlers**

In `packages/engine/src/arpg/interact.ts`:

Replace:

```ts
import type { SimCtx } from './combat.js';
```

with:

```ts
import { healHero, type SimCtx } from './combat.js';
```

(`combat.ts` already imports this file; `healHero` is read only inside a function, so the cycle is harmless, as `objects.ts`'s is.)

Replace (`applyShrine`; Phase A keeps this line, its `shrine` now a `BoonDef`):

```ts
  if (shrine.duration === 'dive') {
```

with:

```ts
  // Sanctuary (the boons spec's `shrinesLastDive`): a floor shrine's blessing lasts the dive too.
  if (shrine.duration === 'dive' || h.boon.shrinesLastDive) {
```

Replace:

```ts
  room.cleared = true;
  if (bal.ai.roomVacuum) for (const d of world.drops) if (d.roomId === m.roomId) d.vacuum = true;
```

with:

```ts
  room.cleared = true;
  // Deep Breath (the boons spec's `healOnClear`): life back as a room clears.
  const heal = world.hero.boon.healOnClear ?? 0;
  if (heal > 0) healHero(ctx, world.hero.stats.maxHp * heal, 'kill');
  if (bal.ai.roomVacuum) for (const d of world.drops) if (d.roomId === m.roomId) d.vacuum = true;
```

Add to `applyShrine`'s doc comment, after "A floor blessing goes on `floorBuffs`;": " under Sanctuary (`shrinesLastDive`) it goes where a dive blessing does;". Add to `onMonsterKilled`'s: " Deep Breath heals `healOnClear` of max life then."

- [ ] **Step 4: Run them to see them pass**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-world.test.ts tests/delve-maps-interact.test.ts tests/delve-maps-flow.test.ts tests/delve-maps-buffs.test.ts --reporter=dot`
Expected: no type errors; all PASS (9 tests in the new file).

Run the fingerprint check. Expected: identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-boons-b3
git add packages/engine/src/arpg/interact.ts packages/engine/tests/delve-boons-world.test.ts
git commit -m "feat(engine): Deep Breath heals on a room's clear; Sanctuary keeps shrine blessings for the dive" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Prospector, Flux Nose, Scrapper, Rune Sense

**Files:**
- Modify: `packages/engine/src/arpg/material-drops.ts`, `src/arpg/rune-drops.ts`, `src/arpg/interact.ts`, `tests/delve-boons-world.test.ts`

- [ ] **Step 1: The failing tests**

Append:

```ts
describe('drops (material-drops.ts, rune-drops.ts)', () => {
  const biome = registry.getBiomeForDepth(1);
  const roll = (seed: number, o: Partial<MaterialDropContext> = {}) =>
    rollMaterialDrops(
      registry,
      {
        depth: 1,
        kind: 'elite',
        biomeId: biome.id,
        biomeMana: biome.mana,
        door: null,
        find: 0,
        legendaryBoost: 1,
        patterns: [],
        ...o,
      },
      new SeededRNG(seed),
    );
  const kinds = (r: ReturnType<typeof roll>) => r.materials.map((m) => m.material.kind);

  it('neutral boons roll exactly as none', () => {
    for (let s = 1; s <= 20; s++) expect(roll(s, { metalUp: 0, flux: 1 })).toEqual(roll(s));
  });

  it("Prospector: metalUp adds to the next metal's chance; no draw moves", () => {
    const metals = registry.getCraftingData().metals;
    const next = metals[metals.indexOf(metalAt(registry, 1)) + 1].id;
    for (let s = 1; s <= 30; s++) {
      const up = roll(s, { metalUp: 1 });
      expect(kinds(up)).toEqual(kinds(roll(s)));
      for (const { material } of up.materials)
        if (material.kind === 'metal') expect(material.metal).toBe(next);
    }
  });

  it('Flux Nose: × the flux chance', () => {
    for (let s = 1; s <= 30; s++) expect(kinds(roll(s, { flux: 10 }))).toContain('flux');
  });

  it('Scrapper: kill scrap × (1 + Σ), over as many pickups; every other drop as before', () => {
    const drop = (effects: BoonEffect[]) => {
      const w = arena([dummy(13, 20)]);
      for (const e of effects) wear(w, e);
      dropMaterials(makeCtx(registry, w, []), w.monsters[0], 9);
      return w.drops;
    };
    const scrap = (ds: Drop[]) =>
      ds.filter((d) => d.kind === 'scrap').reduce((n, d) => n + d.amount, 0);
    const plain = drop([]);
    const more = drop([{ scrap: 0.5 }, { scrap: 0.5 }]);
    expect([scrap(plain), scrap(more)]).toEqual([9, 18]);
    expect(more.map((d) => [d.kind, d.x, d.y])).toEqual(plain.map((d) => [d.kind, d.x, d.y]));
  });

  it("Rune Sense: × a foe's rune chance", () => {
    const foes = Array.from({ length: 10 }, (_, i) => dummy(3 + 2 * i, 20));
    const runes = (w: ArpgWorld) => {
      const ctx = makeCtx(registry, w, []);
      for (const m of w.monsters) dropRune(ctx, m);
      return w.drops.filter((d) => d.kind === 'rune').length;
    };
    expect(runes(arena(foes))).toBeLessThan(10);
    expect(runes(wear(arena(foes), { runes: 1000 }))).toBe(10);
  });
  const metalOf = (r: { material: { kind: string; metal?: string } }[]) =>
    r.filter((m) => m.material.kind === 'metal').map((m) => m.material.metal);
  const vaultKinds = (r: { material: { kind: string } }[]) => r.map((m) => m.material.kind);

  it('Prospector reaches a vault chest; no draw moves', () => {
    // The chest's table holds no bars today: give it one for the test.
    const vault = bal.drops.vault as Record<string, unknown>;
    vault.bars = { chance: 1, count: [1, 1] };
    try {
      const metals = registry.getCraftingData().metals;
      const next = metals[metals.indexOf(metalAt(registry, 2)) + 1].id;
      for (let s = 1; s <= 20; s++) {
        const plain = rollVault(registry, arena([]), new SeededRNG(s));
        const up = rollVault(registry, wear(arena([]), { metalUp: 1 }), new SeededRNG(s));
        expect(vaultKinds(up)).toEqual(vaultKinds(plain));
        expect(metalOf(up)).toEqual([next]);
      }
    } finally {
      delete vault.bars;
    }
  });

  it("Flux Nose reaches a vault chest: × its flux chance (already 1, so × 0 shows the factor)", () => {
    for (let s = 1; s <= 20; s++) {
      expect(vaultKinds(rollVault(registry, arena([]), new SeededRNG(s)))).toContain('flux');
      const none = rollVault(registry, wear(arena([]), { flux: 0 }), new SeededRNG(s));
      expect(vaultKinds(none)).not.toContain('flux');
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/engine && npx vitest run tests/delve-boons-world.test.ts --reporter=dot`
Expected: FAIL — Prospector (bars of the floor's own metal), Flux Nose (rolls with no flux), Scrapper (`[9, 9]`), Rune Sense (fewer than 10), the vault's Prospector (its bar the floor's own metal) and the vault's Flux Nose (flux still drops at × 0); "neutral boons" passes (the context's extra keys are ignored today).

- [ ] **Step 3: The handlers**

In `packages/engine/src/arpg/material-drops.ts`:

Replace:

```ts
  /** The patterns the hero knows: a pattern drop is one it doesn't. */
  patterns: string[];
}
```

with:

```ts
  /** The patterns the hero knows: a pattern drop is one it doesn't. */
  patterns: string[];
  /** Prospector (the boons spec's `metalUp`): added to `drops.metalUpChance` (default 0). */
  metalUp?: number;
  /** Flux Nose (`flux`): × every flux entry's chance, beside the door's (default 1). */
  flux?: number;
}
```

Replace:

```ts
/** The bar a floor at `depth` drops: its item level's metal, the next one up at `drops.metalUpChance`. */
export function rollMetal(registry: DataRegistry, depth: number, rng: SeededRNG): MetalId {
  const metals = registry.getCraftingData().metals;
  const at = metals.indexOf(metalAt(registry, depth));
  const up = rng.next() < registry.getDelveBalance().drops.metalUpChance ? 1 : 0;
  return metals[Math.min(metals.length - 1, at + up)].id;
}
```

with:

```ts
/**
 * The bar a floor at `depth` drops: its item level's metal, the next one up at
 * `drops.metalUpChance` + `up` (Prospector's; one draw either way).
 */
export function rollMetal(registry: DataRegistry, depth: number, rng: SeededRNG, up = 0): MetalId {
  const metals = registry.getCraftingData().metals;
  const at = metals.indexOf(metalAt(registry, depth));
  const bump = rng.next() < registry.getDelveBalance().drops.metalUpChance + up ? 1 : 0;
  return metals[Math.min(metals.length - 1, at + bump)].id;
}
```

Replace:

```ts
  for (let n = count(table.bars); n > 0; n--)
    one({ kind: 'metal', metal: rollMetal(registry, ctx.depth, rng) });
  for (let n = count(table.flux, mods.flux ?? 1); n > 0; n--) {
```

with:

```ts
  for (let n = count(table.bars); n > 0; n--)
    one({ kind: 'metal', metal: rollMetal(registry, ctx.depth, rng, ctx.metalUp) });
  for (let n = count(table.flux, (mods.flux ?? 1) * (ctx.flux ?? 1)); n > 0; n--) {
```

Replace (in `dropMaterials`):

```ts
      legendaryBoost: loot.legendaryBoost,
      patterns: loot.patterns,
    },
    rng,
  );

  const spawn = (extra: Pick<Drop, 'kind' | 'amount' | 'material' | 'pattern'>) => {
```

with:

```ts
      legendaryBoost: loot.legendaryBoost,
      patterns: loot.patterns,
      metalUp: world.hero.boon.metalUp,
      flux: world.hero.boon.flux,
    },
    rng,
  );

  const spawn = (extra: Pick<Drop, 'kind' | 'amount' | 'material' | 'pattern'>) => {
```

Replace:

```ts
  const pieces = Math.min(registry.getDelveBalance().drops.scrapPickups[m.kind], scrap);
  for (let i = 0; i < pieces; i++) {
    const amount = Math.floor(scrap / pieces) + (i < scrap % pieces ? 1 : 0);
```

with:

```ts
  // Scrapper (the boons spec's `scrap`): the kill's scrap × (1 + Σ), over the pickups the
  // unboosted scrap makes, so no draw moves.
  const total = Math.round(scrap * (1 + (world.hero.boon.scrap ?? 0)));
  const pieces = Math.min(registry.getDelveBalance().drops.scrapPickups[m.kind], scrap);
  for (let i = 0; i < pieces; i++) {
    const amount = Math.floor(total / pieces) + (i < total % pieces ? 1 : 0);
```

In `packages/engine/src/arpg/rune-drops.ts`:

Replace:

```ts
  const ctxDrop = { depth: world.depth, kind: m.kind, runes: world.door?.mods.runes ?? 1 };
```

with:

```ts
  // Rune Sense (the boons spec's `runes`) multiplies beside the door's.
  const runes = (world.door?.mods.runes ?? 1) * (world.hero.boon.runes ?? 1);
  const ctxDrop = { depth: world.depth, kind: m.kind, runes };
```

In `packages/engine/src/arpg/interact.ts` (`rollVault`; the block is unique in the file):

Replace:

```ts
      legendaryBoost: loot.legendaryBoost,
      patterns: loot.patterns,
    },
    rng,
  );
  const haul = materials.map(({ material, amount }) =>
```

with:

```ts
      legendaryBoost: loot.legendaryBoost,
      patterns: loot.patterns,
      // Prospector and Flux Nose (the boons spec's `metalUp`, `flux`) reach a chest as a foe's drops.
      metalUp: world.hero.boon.metalUp,
      flux: world.hero.boon.flux,
    },
    rng,
  );
  const haul = materials.map(({ material, amount }) =>
```

Add to `rollVault`'s doc comment, after "× Lucky Charm's boost": "; the hero's Prospector and Flux Nose apply as to a foe's drops".

- [ ] **Step 4: Run them to see them pass**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-world.test.ts tests/delve-material-drops.test.ts tests/delve-objects-props.test.ts tests/delve-objects-drops.test.ts tests/delve-maps-interact.test.ts --reporter=dot`
Expected: no type errors; all PASS (16 tests in the new file).

Run the fingerprint check. Expected: identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-boons-b3
git add packages/engine/src/arpg/material-drops.ts packages/engine/src/arpg/rune-drops.ts packages/engine/src/arpg/interact.ts packages/engine/tests/delve-boons-world.test.ts
git commit -m "feat(engine): Prospector, Flux Nose, Scrapper and Rune Sense at a foe's drops; Prospector and Flux Nose at a vault chest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Chunk 3: The dive, the ground, the hazards

### Task 6: Insurance (`deathLoss`) and Deeper Still (`skip`)

**Files:**
- Modify: `packages/engine/src/delve/dive.ts`, `tests/delve-boons-world.test.ts`

- [ ] **Step 1: The failing tests**

Append:

```ts
describe('dive.ts', () => {
  const diving = (buffs: Buff[]): DelveProfile => {
    const p = startDive(registry, createDelveProfile(registry, 5), 1);
    return { ...p, dive: { ...p.dive!, diveBuffs: buffs } };
  };

  it("Insurance: a death loses deathLoss less Σ the boons' points (at least 0); the boons stay on the settled dive", () => {
    const banked = { ...emptyHaul(), scrap: 1000 };
    const settle = (buffs: Buff[]) => {
      const p = diving(buffs);
      return settleDive(registry, { ...p, dive: { ...p.dive!, banked } }, 'death').dive!;
    };
    const loss = bal.crafting.deathLoss;
    expect(Math.abs(settle([]).banked.scrap - 1000 * (1 - loss))).toBeLessThanOrEqual(1);
    const some = settle([buff({ deathLoss: 0.1 })]);
    expect(Math.abs(some.banked.scrap - 1000 * (1 - (loss - 0.1)))).toBeLessThanOrEqual(1);
    const none = settle([buff({ deathLoss: 0.25 }), buff({ deathLoss: 0.25 })]);
    expect([none.banked.scrap, none.lost!.scrap, none.diveBuffs.length]).toEqual([1000, 0, 2]);
  });

  it('Deeper Still: the next door goes Σ skip further; the skip is spent, the entry stays', () => {
    const choosing = (p: DelveProfile, door: string): DelveProfile => ({
      ...p,
      dive: { ...p.dive!, phase: 'choosing', doorChoices: [door] },
    });
    const deeper = buff({ skip: 1, find: 20 }, 'deeper-still');
    const p = chooseDoor(registry, choosing(diving([deeper]), 'winding'), 'winding');
    expect(p.dive!.depth).toBe(3);
    expect(p.dive!.diveBuffs).toEqual([{ ...deeper, effect: { skip: 0, find: 20 } }]);
    expect(chooseDoor(registry, choosing(p, 'winding'), 'winding').dive!.depth).toBe(4);
    // Added to the door's own skip (the Plunge's 2).
    expect(chooseDoor(registry, choosing(diving([deeper]), 'plunge'), 'plunge').dive!.depth).toBe(5);
    expect(chooseDoor(registry, choosing(diving([]), 'winding'), 'winding').dive!.depth).toBe(2);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/engine && npx vitest run tests/delve-boons-world.test.ts --reporter=dot`
Expected: FAIL — Insurance (`some` and `none` lose the full share) and Deeper Still (depth 2).

- [ ] **Step 3: The handlers**

In `packages/engine/src/delve/dive.ts` (keep its long lines; never Prettier this file):

Replace:

```ts
import { rollStop } from './stops.js';
```

with:

```ts
import { rollStop } from './stops.js';
import { buffSum } from './boons.js';
```

Replace (in `chooseDoor`):

```ts
  const depth = dive.depth + 1 + (door.mods.skip ?? 0);
```

with:

```ts
  // Deeper Still (the boons spec's `skip`): the dive's boons add to the door's skip and are spent (each entry stays).
  const skip = buffSum(dive.diveBuffs).skip ?? 0;
  const depth = dive.depth + 1 + (door.mods.skip ?? 0) + skip;
  const diveBuffs = skip ? dive.diveBuffs.map((b) => (b.effect.skip ? { ...b, effect: { ...b.effect, skip: 0 } } : b)) : dive.diveBuffs;
```

Replace:

```ts
      door,
      doorChoices: [],
      stop: null,
      dropsGiven: [],
      phase: 'fighting',
```

with:

```ts
      door,
      doorChoices: [],
      stop: null,
      dropsGiven: [],
      diveBuffs,
      phase: 'fighting',
```

Replace (in `settleDive`):

```ts
    const loss = registry.getDelveBalance().crafting.deathLoss;
```

with:

```ts
    // Insurance (the boons spec's `deathLoss`): the dive's boons take points off the share, never below 0; they stay on the dive.
    const loss = Math.max(0, registry.getDelveBalance().crafting.deathLoss - (buffSum(dive.diveBuffs).deathLoss ?? 0));
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-world.test.ts tests/delve-banking.test.ts tests/delve-dive.test.ts tests/delve-stops.test.ts tests/delve-quests-emission.test.ts --reporter=dot`
Expected: no type errors; all PASS (18 tests in the new file).

Run the fingerprint check. Expected: identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-boons-b3
git add packages/engine/src/delve/dive.ts packages/engine/tests/delve-boons-world.test.ts
git commit -m "feat(engine): Insurance eases a death's loss; Deeper Still adds to the next door's skip" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Trailblazer (`noSlow`)

**Files:**
- Modify: `packages/engine/src/arpg/terrain.ts`, `src/arpg/action.ts`, `tests/delve-boons-world.test.ts`

- [ ] **Step 1: The failing test**

Append:

```ts
describe('noSlow (terrain.ts)', () => {
  const walk = (effects: BoonEffect[]) => {
    const w = onMap(arena([], { noBasic: true }), []);
    bindTerrain(w.map, bal.terrain);
    for (let y = 20; y < 40; y++) for (let x = 8; x < 18; x++) w.map.cells[y * w.width + x] = CELL.slow;
    for (const e of effects) wear(w, e);
    const y0 = w.hero.y;
    run(w, 0.5, { x: 0, y: -1 });
    return { w, moved: y0 - w.hero.y };
  };

  it('Trailblazer: the hero walks slow ground at full pace; anything else there is still slowed', () => {
    const slowed = walk([]);
    const free = walk([{ noSlow: true }]);
    expect(free.moved / slowed.moved).toBeCloseTo(1 / bal.terrain.slowMult, 1);
    expect(groundSpeed(free.w, free.w.hero)).toBe(1);
    expect(groundSpeed(free.w, { x: free.w.hero.x, y: free.w.hero.y })).toBe(bal.terrain.slowMult);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/engine && npx vitest run tests/delve-boons-world.test.ts --reporter=dot`
Expected: FAIL — Trailblazer (the ratio is 1).

- [ ] **Step 3: The handlers**

In `packages/engine/src/arpg/terrain.ts`:

Replace:

```ts
export function groundSpeed(world: ArpgWorld, body: Vec, boss = false): number {
  return groundAt(world.map, body, boss);
}
```

with:

```ts
export function groundSpeed(world: ArpgWorld, body: Vec, boss = false): number {
  // Trailblazer (the boons spec's `noSlow`): the hero walks slow ground at full pace.
  if (body === world.hero && world.hero.boon.noSlow) return 1;
  return groundAt(world.map, body, boss);
}
```

In `packages/engine/src/arpg/action.ts` (which can't import `terrain.ts`: see "Where the spec left room" 9):

Replace:

```ts
  const ground = groundAt(world.map, h);
```

with:

```ts
  // Trailblazer frees the pushes too, as `groundSpeed` does the walk.
  const ground = h.boon.noSlow ? 1 : groundAt(world.map, h);
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-world.test.ts tests/delve-terrain-ground.test.ts tests/delve-maps-save.test.ts tests/delve-maps-motion.test.ts --reporter=dot`
Expected: no type errors; all PASS (19 tests in the new file).

Run the fingerprint check. Expected: identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-boons-b3
git add packages/engine/src/arpg/terrain.ts packages/engine/src/arpg/action.ts packages/engine/tests/delve-boons-world.test.ts
git commit -m "feat(engine): Trailblazer: slow ground doesn't slow the hero" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Arsonist (`hazardsFriendly`)

**Files:**
- Modify: `packages/engine/src/arpg/objects.ts`, `tests/delve-boons-world.test.ts`

- [ ] **Step 1: The failing test**

Append:

```ts
describe('hazardsFriendly (objects.ts)', () => {
  const blast = (effects: BoonEffect[]) => {
    const w = arena([], { noBasic: true });
    for (const e of effects) wear(w, e);
    w.hero.stats = { ...w.hero.stats, dodge: 0 };
    const hz: HazardEntity = {
      type: 'hazard',
      id: 900,
      kind: 'brazier',
      element: 'fire',
      x: 13,
      y: 34.5,
      radius: 0.4,
      burst: 2.5,
      state: 'ready',
      until: 0,
    };
    w.hazards = [hz];
    hitObject(makeCtx(registry, w, []), hz, 'foe');
    const hp = w.hero.hp;
    run(w, 1);
    return { hz, hurt: hp - w.hero.hp };
  };

  it('Arsonist: hazards recharge × (1 − the largest entry) and never hurt the hero', () => {
    const { fuse, recharge } = bal.terrain;
    const plain = blast([]);
    expect(plain.hurt).toBeGreaterThan(0);
    expect(plain.hz.state).toBe('dormant');
    expect(plain.hz.until).toBeCloseTo(fuse + recharge, 0);
    const kind = blast([{ hazardsFriendly: 0.5 }, { hazardsFriendly: 0.8 }]);
    expect(kind.hurt).toBeLessThanOrEqual(0);
    expect(kind.hz.until).toBeCloseTo(fuse + recharge * 0.2, 0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/engine && npx vitest run tests/delve-boons-world.test.ts --reporter=dot`
Expected: FAIL — Arsonist (the hero is hurt; `until` is a full recharge).

- [ ] **Step 3: The handler**

In `packages/engine/src/arpg/objects.ts`:

Replace:

```ts
  const { id, kind: hazard, element, x, y, burst: radius } = hz;
  hz.state = 'dormant';
  hz.until = world.t + bal.terrain.recharge;
  ctx.events.push({ kind: 'hazardBurst', id, hazard, element, x, y, radius });
  const reaches = (b: { x: number; y: number; radius: number }) =>
    dist(x, y, b.x, b.y) <= radius + b.radius && sees(world.map, hz, b);
  if (reaches(world.hero)) hurtHero(ctx, damage, element, null, { noPerfect: true });
```

with:

```ts
  const { id, kind: hazard, element, x, y, burst: radius } = hz;
  // Arsonist (the boons spec's `hazardsFriendly`): a quicker recharge, and the hero is spared.
  const friendly = world.hero.boon.hazardsFriendly ?? 0;
  hz.state = 'dormant';
  hz.until = world.t + bal.terrain.recharge * (1 - friendly);
  ctx.events.push({ kind: 'hazardBurst', id, hazard, element, x, y, radius });
  const reaches = (b: { x: number; y: number; radius: number }) =>
    dist(x, y, b.x, b.y) <= radius + b.radius && sees(world.map, hz, b);
  if (!friendly && reaches(world.hero)) hurtHero(ctx, damage, element, null, { noPerfect: true });
```

Add to `burst`'s doc comment, after "is dormant for `terrain.recharge`": " (× (1 − `hazardsFriendly`) under Arsonist, which also spares the hero)".

- [ ] **Step 4: Run it to see it pass**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-world.test.ts tests/delve-objects-hazards.test.ts tests/delve-bot-objects.test.ts --reporter=dot`
Expected: no type errors; all PASS (20 tests in the new file).

Run the fingerprint check. Expected: identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-boons-b3
git add packages/engine/src/arpg/objects.ts packages/engine/tests/delve-boons-world.test.ts
git commit -m "feat(engine): Arsonist: hazards recharge faster and spare the hero" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Verification

- [ ] **Step 1: The whole engine suite, the typecheck, the bundle**

```bash
cd /c/Projects/alloy-boons-b3/packages/engine && npx tsc --noEmit -p . && npx vitest run --reporter=dot && npx tsup
```

Expected: no type errors; the suite passes with the base's count + 20 tests and + 1 file (run nothing else meanwhile: a loaded machine times out `delve-autopilot-crafting.test.ts`'s first test, which passes alone); tsup's three "Build success" lines.

- [ ] **Step 2: The client still builds on the bundle**

```bash
cd /c/Projects/alloy-boons-b3/packages/client && npx tsc --noEmit -p .
```

Expected: no type errors (nothing here changes an exported type the client reads; `rollMetal`'s new argument is optional).

- [ ] **Step 3: The fingerprint**

Run the fingerprint check (Base). Expected: identical.

- [ ] **Step 4: Hand back**

Report the branch `boons/b3` and its eight commits, and the "Needs routed" list, to the integrator. Don't merge.
