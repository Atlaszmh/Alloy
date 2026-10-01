# Delve Runes, Wave 1B: the Economy — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every profile op the runes spec defines, built on wave 0's contract: opening sockets (Links and scrap by socket index), socketing and pulling under both pull modes, the parts rule wherever sockets or runes leave a weapon (salvage, auto-salvage, fusing gear, a transfer, the choice of mana), Mana Dust priced by origin with the draft's rune price and net Links on Apply, fusing runes 3 → 1, rune drops on their own stream banked into the pouch, sockets on weapon drops, a transfer priced per open socket, and the stop's fifth kind. Pure ops that return results, never throw, and keep the dive lock.

**Architecture:** The rolls and a weapon's parts are pure and live beside what they act on: `runeTierAt` and `rollRuneDrop` in `loot/drops.ts`, `rollSockets`, `weaponParts` and the transfer's sockets in `loot/moveset.ts`; `loot/runes.ts` re-exports them under the contract's names. The profile ops live in `delve/runes.ts` (`unsocketMode`, `settleParts` for the parts rule, `runeChange` for the draft's rune diff, `draftPrice`, `openSocket`, `socketRune`, `fusePrice`, `fuseRunes`) and route through one Apply, `setChains(registry, profile, chains, { origins, unsocket })`, which charges the Dust by origin (`movesetEditPrice`, the identity map when origins are missing) and the runes' Links, scrap and pouch from the same diff. The world drops runes from `world.runeRng` (`arpg/rune-drops.ts`, one call in `killMonster`), picks them up like items (`dropsTick`) and banks them (`bankWorld`). The stop's `'rune'` kind runs `socketRune` with the lock lifted.

**Tech Stack:** TypeScript 5.7, Vitest 3 (Node), Zod 3.

**Spec:** `docs/superpowers/specs/2026-09-30-delve-runes-design.md` at `81b0e31`: "Sockets and their price", "Changing runes: the draft and its price", "Moving moves between weapons", "Tiers, drops and fusing", "Stops: the fifth kind", "Determinism", and "Build waves → Wave 1 → B". The overview is `00-overview.md` in this folder; wave 0's plan is `01-wave0-contract.md`, whose last table lists every stub this area replaces.

---

## Base

- **Start from wave 0's merge:** `runes/contract` at **`b216703`** (wave 0's six commits and its review fix, on `81b0e31`). Nothing else needs merging first; this area doesn't wait for 1A or 1C.
- Worktree: `git worktree add ../alloy-economy -b runes/economy b216703`, `node_modules` linked as the overview says (the client isn't touched, so only the root's and `packages/engine`'s are needed).
- **What wave 0 left for this area** (its "What waves 1 and 2 fill in" table): the `runeTierAt`, `rollRuneDrop`, `rollSockets` and `weaponParts` stubs in `loot/runes.ts`; every function of `delve/runes.ts`; `dropRune` in `arpg/rune-drops.ts`; `bankWorld`'s `runes: []`; `stopKinds`' `rune: false` and `STOP_KINDS` at four kinds; the `runes`/`destroyed` result fields, always empty; today's signatures of `setChains`, `movesetEditPrice`, `editPrice`, `transferMoveset`, `salvageItems` and `fuseGear`; and the two `it.todo` blocks marked "wave 1B" in `tests/delve-runes-contract.test.ts` (Task 1 removes the first, Task 8 the second). Its `fitMovesets` already does the load-time socket trims, and `NEUTRAL` is deep-frozen (nothing here touches knobs).

## How this plan was checked

Every edit below was applied in order by the controller's `apply2.mjs` rules (plus "Create") to a copy of wave 0's worktree at `b216703` (every file as the fresh worktree checks it out, CRLF), and each task's tests were run at both of their steps; the expected failures and passes are those runs. Every anchor is unique in its file at its point, and every Replace's old text is wave 0's (or an earlier task's) exactly. At the end:
- the engine's suite goes from **1466 passed and 14 todo (1480) in 79 files** (wave 0) to **1505 passed and 4 todo (1509) in 80 files** (the 4 todos are wave 1A's); every task's commit is green, the pacing rails included, and `tsc` is clean after every task;
- every file this plan formats passes `npx prettier --check --end-of-line auto` as written.

## Measured (the no-rune determinism check, against wave 0's "before" files)

Built at each commit and run with the scratchpad's `runes-before` scripts:

| | Wave 0 (`b216703`) = before | After Tasks 1–3 | After Task 4 (Dust by origin) | After Tasks 5–8 | After Task 9 (sockets on drops) |
|---|---|---|---|---|---|
| DPS Lab grid, depth 10 (9,144 runs) | | | | | **0 differing rows** |
| Items hash (`items-hash.mjs`: without movesets; with them, sockets aside) | `291 49e20fb6 7c8e6dde` | same | same | same | **same** |
| First dives | 1→3 / 1→5, 1→7, 1→5, 1→5 | identical | identical | identical | dive 2 of seeds 2 and 3 changes (power 3506 → 2896, 2087 → 2077) |
| Pacing: dive 6, dive 12 means | 23.5, 30 | identical | 24.5, 34.5 | 24.5, 34.5 | 21.25, 29 |
| Pacing: Frost dive 1 → 12 | 4 → 29.5 | identical | 4 → 29.5 | 4 → 29.5 | 4 → 31.5 |
| Pacing: legendaries at dive 12; own pair's reaction | 6.5; 6 of 6 | identical | 7; 6 of 6 | 7; 6 of 6 | 5.5; 6 of 6 |
| Pacing: the 15-pair sweep at dive 6 (allowed 13.2–35.2) | median 22, 19–32 | identical | median 22, 21–30 | median 22, 21–30 | median 22, 21–30 |
| Pacing: seconds a floor (8–60) | 35.03 | identical | 38.45 | 38.47 | 32.94 |

**Every rail holds after every task.** Two tasks move the numbers, and both are the spec's rules, not regressions:
- **Task 4:** the one Dust rule (missing origins are the identity map) prices several moves re-coloured in one Apply at `elementDust` once for their new set; 4a's least pairing priced two such moves at `elementDust + 2 × editDust`. The autopilot's `fusePrimary` (every Primary move to the pair, in place) gets cheaper, so it affords its fused Primary sooner. The spec's "an in-place edit is the same under both rules" holds for one move, not for this case (see **Spec notes**).
- **Task 9:** weapon drops start rolling sockets, so salvaged weapons give more Links (4a's slots come sooner), a transfer prices and returns sockets, and the stop's rune kind starts to apply (a pouch rune and an empty socket), which changes which kinds a stop rolls. The spec's open question "Socket Links … watch the pacing rails" is this; the rails hold.

Tasks 1–3 and 5–8 change no number: until Task 9 no weapon in the autopilot's runs has a socket, and rune drops roll on their own stream (their only trace is a few more seconds a floor while the floor's runes are vacuumed). Task 9 comes last for that reason, so each earlier commit is measurably neutral.

## Spec notes (found while planning; each resolved as below)

- **"Links are netted … a batch is never cheaper or dearer than the same edits applied one by one"** isn't exactly so. A removed move refunds one Link a socket, while opening its second or third socket cost 2 or 3: open a move's second socket and remove the move in one Apply, and the batch costs nothing where two Applies cost a Link. What holds, and what Task 5's probe checks: the hero's Links after Apply are always `before − links + refundLinks` whatever order the edits were made in; a batch is never dearer than its edits one by one; and it costs exactly the same when no move is removed. Nothing to change in the rule; the spec's sentence (and `CLAUDE.md`'s, in wave 3) should say "never dearer".
- **"An in-place edit is the same under both rules"** (the identity-map decision) holds for one move. For several moves re-coloured to one new set in one Apply, the spec's own rule ("`elementDust`, charged once per new element set per Apply") charges once, where 4a's least pairing charged one `elementDust` and then `editDust` twice. Implemented as the spec's rule; it moves the pacing (see **Measured**), every rail holding.
- **A pair whose elements change to a set an old move already has** still pays `elementDust` (once per set per Apply). Read literally, "charged once per new element set" could make it free, but then a re-coloured move would cost nothing and the price would be 0 for a changed chain. A new move (null origin) is charged only for a set no saved move has, as in 4a.
- **`chooseStartingMana`'s parts** are its open sockets (back as Links) and their runes (by the rule), not `weaponParts`' extra slots: the spec lists `weaponParts` for salvage, fuse and the bag, and only the parts rule (sockets and runes) for the choice. Its extra slots are dropped unrefunded, as in 4a. A fresh hero has neither, so a new save is unchanged.
- **Origins of the wrong length** are refused with "Bad origins" too (the spec names a repeated index and one past the saved chain).
- **Refusal texts** the spec leaves open: `This weapon's moves hold at most N sockets` (the draft past the cap), `Sockets can't be closed`, `A move takes one Split`, `Split doesn't fit a Lance` / `Widen doesn't fit Bow blows` (`Unarmed blows` unarmed), `Unknown rune <id>`, `Not enough runes in your pouch`, `Bad origins`; `openSocket`: `This move has every socket`, `Pick a move the chain holds`; `socketRune`: `Open this socket first`, `Pick a rune`; `fuseRunes`: `Fuse 3 of one rune and tier`, `Tier V runes don't fuse`, `Unknown rune <id>`; the stop: `Socket a rune into an empty socket`, `Socket a rune into a move the chain holds`. The ops' locks reuse 4a's texts (`Chains can only change between dives` for socket ops, `Forge at the Anvil, between dives` for fusing runes, `Transfer your moveset between dives`).
- **Results.** `setChains` always reports `runes` (pulled back to the pouch, in 'pay') and `destroyed` (in 'destroy'), empty when nothing was pulled; so do `transferMoveset`, `fuseGear`, `chooseStartingMana` (when armed), `salvageItems` and `addLootToBag`. `fuseRunes` reports the rune it made in `runes`.
- **In 'pay' mode a rune pulled in an Apply can be socketed elsewhere in the same Apply** (the pouch check adds the pulled runes back first), paying its pull price; in 'destroy' it can't. The result's `runes` lists it as returned either way.

## Files

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/loot/drops.ts` | `runeTierAt`, `rollRuneDrop` (CRLF at `81b0e31`, not Prettier-clean: hand-edit, never format) |
| `src/loot/moveset.ts` | `rollSockets`, `weaponParts`, the move copies they share; `MovesetTransfer.sockets` and `runes`, and `movesetTransfer` moving sockets |
| `src/loot/runes.ts` | wave 0's four stubs become re-exports; the imports and `NOT_BUILT` only they used go |
| `src/loot/item-generator.ts` | the socket roll in `generateItem`, last (hand-edit, never format) |
| `src/delve/runes.ts` | over wave 0's stub: `unsocketMode`, `settleParts`, `runeTargetOf`, `runeChange`, `draftPrice`, `openSocket`, `socketRune`, `fusePrice`, `fuseRunes` |
| `src/delve/moveset.ts` | `chainOrigins`, the Dust by origin, `movesetEditPrice`/`editPrice` with origins, `setChains` with options charging the runes, `sameChain` with sockets, `transferMoveset` with `opts.unsocket` |
| `src/delve/profile.ts` | `addLootToBag`, `salvageItems`, `fuseGear`: `weaponParts` and the parts rule, `opts.unsocket` |
| `src/delve/pair.ts` | `chooseStartingMana`'s parts and `opts.unsocket` |
| `src/delve/dive.ts` | `bankWorld` banks `pending.runes` and counts `runesEarned` (hand-edit, never format) |
| `src/delve/stops.ts` | the fifth kind: `STOP_KINDS`, `StopAction`, `stopKinds`' rule, `runStop`'s `rune` case, the `move` stop keeping the saved runes |
| `src/arpg/rune-drops.ts` | over wave 0's stub: `dropRune` |
| `src/arpg/combat.ts` | `killMonster` calls `dropRune` (see **Cross-area needs**) |
| `src/arpg/step.ts` | `dropsTick`: no magnet for runes, the `'rune'` pickup (see **Cross-area needs**) |
| `tests/delve-runes.test.ts` (new) | this area's tests (37) |
| `tests/delve-movesets.test.ts` | the Dust tests by origin; a drop's moveset compared without its sockets |
| `tests/delve-stops.test.ts` | the four pre-rune kinds named where all four apply |
| `tests/delve-dive.test.ts` | its banking test's `pending` gains `runes` |
| `tests/delve-runes-contract.test.ts` | wave 0's two "wave 1B" `it.todo` blocks go |

## Cross-area needs

- **`src/arpg/combat.ts` and `src/arpg/step.ts`.** The overview gives `src/arpg/**` to 1A, but the spec's wave-1 contract gives B "the `'rune'` pickup case and the magnet exclusion in `step.ts`'s `dropsTick`" and `dropRune`'s "one call inside `killMonster`" ("Merge points with A … both … touch disjoint functions"). This plan makes them in Task 7, exactly:
  - `combat.ts`: after `import { notePerfect, refundDodgeCharge } from './dodge.js';` add `import { dropRune } from './rune-drops.js';`, and `if (!world.sandbox) dropLoot(ctx, m);` becomes `if (!world.sandbox) { dropLoot(ctx, m); dropRune(ctx, m); }` (on three lines);
  - `step.ts` (`dropsTick` only): the magnet line gains `&& d.kind !== 'rune'` (with a comment line above it), the switch gains `case 'rune': if (d.rune) world.pending.runes.push(d.rune); break;` after `'scrap'`, and the `pickup` event gains `rune: d.rune,` after `item: d.item,`.
  1A's plan should leave those lines alone; if the controller would rather 1A made them, they move as written and Task 7's test still holds.
- **`src/loot/moveset.ts`** isn't in any area's "Owns" column; the spec's Economy row lists it (`movesetTransfer`'s sockets and runes). This plan edits it in Tasks 1 and 3; no other area touches it.
- **`src/arpg/rune-drops.ts`** is in `src/arpg/**` too; the spec makes it B's (`dropRune`). Task 7 replaces wave 0's stub whole.
- **For wave 2D (the autopilot):** `takeBestStop` can now be offered `'rune'` (it ignores it until D adds the preference); `transferMoveset`, `salvageItems`, `fuseGear` take `opts.unsocket` (the default, the balance's, is what the autopilot wants); the autopilot's `setChain` calls price in place as the identity map. `draftPrice`, `openSocket`, `socketRune` and `fuseRunes` are ready for its rune policy.
- **For wave 2E (the client):** `setChains(registry, profile, chains, { origins, unsocket })` and `draftPrice(…)` take the builder's origins (missing origins are the identity map, so an edit in place needs none); `addLootToBag`, `salvageItems`, `fuseGear`, `transferMoveset` and `chooseStartingMana` take `{ unsocket }` (the dev override) and report `runes` and `destroyed`; `MovesetTransfer` gains `sockets` (priced) and `runes` (leaving) for the item sheet; `StopAction` gains `{ kind: 'rune', skill, index, socket, rune }`. Pulled runes in 'pay' are listed in `runes` even when re-socketed in the same Apply.
- **For wave 3 (docs):** the Links sentence and the in-place Dust sentence in **Spec notes**.

## Conventions

The overview's shared conventions and the 4a plan's, with these for this area:
- **Line endings.** A fresh worktree checks every file out CRLF (`core.autocrlf` is on), so every file here is CRLF in the worktree; the Edit tool keeps them, and Prettier's rewrite of a formatted CRLF file to LF shows no diff (git stores LF). **Never format** `src/loot/drops.ts`, `src/loot/item-generator.ts` and `src/delve/dive.ts` (hand-laid-out or not Prettier-clean at the base); every other file a commit block formats passes `prettier --check --end-of-line auto` as written.
- **Import cycles.** `delve/runes.ts` imports `delve/moveset.ts`, `delve/dive.ts` and `loot/moveset.ts`, and they import it back (as `profile.ts`, `pair.ts` and `stops.ts` do); `loot/runes.ts` and `loot/moveset.ts` import each other; `loot/drops.ts` is re-exported by `loot/runes.ts`. Only function declarations cross them, read inside functions, as the movesets plan's rule says. `loot/` still imports nothing from `delve/`.
- **Commands** (from the worktree's root, each in a subshell): one engine test file `(cd packages/engine && npx vitest run tests/<file>.test.ts)`; all engine tests `(cd packages/engine && npx vitest run)` (about 25 s, the pacing rails included); typecheck `(cd packages/engine && npx tsc --noEmit -p .)`; the measuring build `(cd packages/engine && npx tsup --out-dir node_modules/.runes-economy-measure)`.

## Chunk 1: The rolls

### Task 1: The rolls: a rune drop's tier and chance, a weapon's sockets, and its parts

The pure rolls the rest of the area reads (spec: "Tiers, drops and fusing", "Sockets and their price"):
- **`runeTierAt(registry, depth, rng)`**: the highest tier whose `tierDepths` entry the depth reaches, then one higher `tierUp` of the time, at most V. It draws once, always.
- **`rollRuneDrop(registry, { depth, kind, dropMult }, rng)`**: a boss drops at `dropChance.boss` (1), a normal or elite foe at its chance × the door's `dropMult`, at most 1; the rune uniform over `registry.getRunes()`, its tier `runeTierAt`. Draws: the chance, then (on a drop) the rune and the tier.
- **`rollSockets(registry, item, moveset, rng)`**: `socketDrops[rarity]` open sockets, each on a move or blow of the carried chains picked uniformly (never past `socketCap[rarity]` on one move), all empty; nothing to open returns `moveset` itself. (`generateItem` starts rolling it in Task 9, last, so every task before keeps the autopilot's runs, and the pacing rails, as they were.)
- **`weaponParts(registry, weapon)`**: a Link for each extra slot and each open socket, and the socketed runes.

They live beside what they roll on: the two rune-drop rolls in `loot/drops.ts`, the socket roll and the parts in `loot/moveset.ts` (beside `rollMoveset` and `extraSlots`). `loot/runes.ts` keeps the contract's names by re-exporting them in place of wave 0's four stubs, so nothing that imports them from `loot/runes.ts` (the index) changes.

**Files:**
- Modify: `packages/engine/src/loot/drops.ts` (CRLF, never format: the rune-drop rolls)
- Modify: `packages/engine/src/loot/moveset.ts` (`rollSockets`, `weaponParts`, and the move copies the later tasks share)
- Modify: `packages/engine/src/loot/runes.ts` (wave 0's four stubs become re-exports; the imports and `NOT_BUILT` only they used go)
- Create: `packages/engine/tests/delve-runes.test.ts`
- Modify: `packages/engine/tests/delve-runes-contract.test.ts` (wave 0's `it.todo` block for these four goes)

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/tests/delve-runes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { defaultMoveset } from '../src/loot/moveset.js';
import {
  rollRuneDrop,
  rollSockets,
  runeTierAt,
  socketsOf,
  weaponParts,
} from '../src/loot/runes.js';
import { CHAIN_SKILLS, type Blow, type Move } from '../src/types/ability.js';
import type { MonsterKind } from '../src/types/arpg.js';
import type { GearItem, Moveset, Rarity } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import { bal, registry } from './fixtures/arena.js';

// See the runes spec: sockets, the pouch, the draft's price, fusing, drops and the stop.

const R = bal.runes;

/** Every move and blow of a moveset, chain by chain. */
function allMoves(m: Moveset): (Move | Blow)[] {
  return CHAIN_SKILLS.flatMap((skill) => {
    const chain = m.chains[skill];
    if (!chain) return [];
    return Array.isArray(chain) ? chain : chain.moves;
  });
}

/** A moveset's open sockets, over every chain. */
function openSockets(m: Moveset): number {
  return allMoves(m).reduce((n, x) => n + socketsOf(x).length, 0);
}

/** A moveset without its sockets: what it was before any was rolled. */
function bare(m: Moveset): Moveset {
  const strip = <X extends Move | Blow>({ runes: _r, ...x }: X) => x;
  const chains = Object.fromEntries(
    Object.entries(m.chains).map(([skill, c]) => [
      skill,
      Array.isArray(c) ? c.map(strip) : { ...c, moves: c!.moves.map(strip) },
    ]),
  );
  return { chains, slots: m.slots };
}

const weapon = (rarity: Rarity, seed: number, baseId?: string): GearItem =>
  generateItem(
    registry,
    { uid: `w${seed}`, ilvl: 5, rarity, slot: 'weapon', baseId, mana: 'storm' },
    new SeededRNG(seed),
  );

describe('rune drops: tiers and chances', () => {
  it('gives the highest tier whose depth is reached, one higher a fifth of the time, at most V', () => {
    const tiers = (depth: number) => {
      const rng = new SeededRNG(depth);
      const seen = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 4000; i++) seen[runeTierAt(registry, depth, rng)]++;
      return seen;
    };
    const cases: [number, number][] = [
      [1, 1],
      [6, 1],
      [7, 2],
      [12, 2],
      [13, 3],
      [20, 3],
      [21, 4],
      [30, 4],
    ];
    for (const [depth, tier] of cases) {
      const seen = tiers(depth);
      seen.forEach((n, t) => {
        if (t !== tier && t !== tier + 1) expect(n).toBe(0);
      });
      expect(seen[tier + 1] / 4000).toBeCloseTo(R.tierUp, 1);
    }
    expect(tiers(31)[5]).toBe(4000);
    expect(tiers(90)[5]).toBe(4000);
  });

  it("drops at its kind's chance × the door's multiplier (at most 1); a boss always drops one", () => {
    const rate = (kind: MonsterKind, dropMult: number) => {
      const rng = new SeededRNG(11);
      let got = 0;
      for (let i = 0; i < 20000; i++)
        if (rollRuneDrop(registry, { depth: 5, kind, dropMult }, rng)) got++;
      return got / 20000;
    };
    expect(R.dropChance).toEqual({ normal: 0.03, elite: 0.15, boss: 1 });
    expect(rate('normal', 1)).toBeCloseTo(0.03, 2);
    expect(rate('elite', 1)).toBeCloseTo(0.15, 1);
    expect(rate('elite', 2)).toBeCloseTo(0.3, 1);
    expect(rate('normal', 50)).toBe(1);
    expect(rate('boss', 1)).toBe(1);
    expect(rate('boss', 0.5)).toBe(1);
  });

  it('picks every rune uniformly, at the tier its depth gives', () => {
    const rng = new SeededRNG(5);
    const counts = new Map<string, number>();
    const tiers = new Set<number>();
    for (let i = 0; i < 14000; i++) {
      const r = rollRuneDrop(registry, { depth: 13, kind: 'boss', dropMult: 1 }, rng)!;
      counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
      tiers.add(r.tier);
    }
    expect([...counts.keys()].sort()).toEqual(
      registry
        .getRunes()
        .map((r) => r.id)
        .sort(),
    );
    for (const n of counts.values()) expect(Math.abs(n / 14000 - 1 / 14)).toBeLessThan(0.015);
    expect([...tiers].sort()).toEqual([3, 4]);
  });
});

describe('the socket roll', () => {
  it('rolls on top of the moveset: never changes the one it is given, nor anything but sockets', () => {
    const slots = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
    const m = defaultMoveset(registry, { baseId: 'bow', rarity: 'legendary' }, 'fire', slots);
    const before = JSON.stringify(m);
    for (let seed = 1; seed <= 30; seed++) {
      const out = rollSockets(registry, { rarity: 'legendary' }, m, new SeededRNG(seed));
      expect(JSON.stringify(m)).toBe(before);
      expect(bare(out)).toEqual(m);
      expect(openSockets(out)).toBeGreaterThanOrEqual(2);
    }
    // Nothing to open: the moveset itself, untouched.
    expect(rollSockets(registry, { rarity: 'uncommon' }, m, new SeededRNG(1))).toBe(m);
  });
});

describe("a weapon's parts", () => {
  it('a Link for each extra slot and each open socket, and the runes in them; other gear none', () => {
    const w = weapon('rare', 1, 'sword');
    const moveset = defaultMoveset(registry, w, 'storm', { basic: 4, primary: 2, defensive: 1 });
    const [first] = moveset.chains.basic!;
    moveset.chains.basic![0] = { ...first, runes: [{ id: 'chain', tier: 2 }, null] };
    const primary = moveset.chains.primary!;
    primary.moves[1] = { ...primary.moves[1], runes: [{ id: 'quick', tier: 1 }] };
    expect(weaponParts(registry, { ...w, moveset })).toEqual({
      links: 2 + 3,
      runes: [
        { id: 'chain', tier: 2 },
        { id: 'quick', tier: 1 },
      ],
    });
    const chest = generateItem(
      registry,
      { uid: 'c', ilvl: 2, rarity: 'rare', slot: 'chest' },
      new SeededRNG(2),
    );
    expect(weaponParts(registry, chest)).toEqual({ links: 0, runes: [] });
  });
});
```

In `packages/engine/tests/delve-runes-contract.test.ts`, wave 0's placeholders for these four give way to the tests above:

Delete the lines from `describe('wave 1B: loot/runes.ts', () => {` up to (not including) `describe('wave 1B: delve/runes.ts and arpg/rune-drops.ts', () => {`.

- [ ] **Step 2: Run them and watch them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts)`
Expected: FAIL, all 5: each reaches one of wave 0's four stubs and throws `not built yet`.

- [ ] **Step 3: Write the rolls**

In `packages/engine/src/loot/drops.ts`:

Replace:

```ts
import type { ManaType } from '../types/mana.js';
```

with:

```ts
import type { ManaType } from '../types/mana.js';
import { RUNE_TIERS, type RuneRef, type RuneTier } from '../types/rune.js';
```

Append at the end of the file:

```ts
/**
 * A rune's tier at `depth` (see the runes spec): the highest whose
 * `runes.tierDepths` entry the depth reaches, then one higher `runes.tierUp`
 * of the time, at most V. It draws once, whatever the depth.
 */
export function runeTierAt(registry: DataRegistry, depth: number, rng: SeededRNG): RuneTier {
  const { tierDepths, tierUp } = registry.getDelveBalance().runes;
  const reached = Math.max(1, tierDepths.filter((d) => depth >= d).length);
  const up = rng.next() < tierUp ? 1 : 0;
  return Math.min(RUNE_TIERS, reached + up) as RuneTier;
}

/**
 * A slain foe's rune, or null (see the runes spec): a boss drops one at
 * `runes.dropChance.boss`, a normal or elite foe at its kind's chance × the
 * door's `dropMult`, at most 1 (magic find plays no part). The rune is uniform
 * over the data, its tier by depth (`runeTierAt`).
 */
export function rollRuneDrop(
  registry: DataRegistry,
  ctx: { depth: number; kind: MonsterKind; dropMult: number },
  rng: SeededRNG,
): RuneRef | null {
  const { dropChance } = registry.getDelveBalance().runes;
  const chance =
    ctx.kind === 'boss' ? dropChance.boss : Math.min(1, dropChance[ctx.kind] * ctx.dropMult);
  if (rng.next() >= chance) return null;
  const runes = registry.getRunes();
  const { id } = runes[rng.nextInt(0, runes.length - 1)];
  return { id, tier: runeTierAt(registry, ctx.depth, rng) };
}
```

In `packages/engine/src/loot/moveset.ts`:

Replace:

```ts
import {
  CHAIN_SKILLS,
  type AbilityPayment,
  type AbilitySlot,
  type Chains,
  type ChainSkill,
  type FormId,
  type MoveKind,
} from '../types/ability.js';
import type { ManaPair } from '../types/delve.js';
import type { EquippedGear, GearItem, Moveset, Rarity } from '../types/gear.js';
import { RARITY_ORDER } from '../types/gem.js';
import type { ManaType } from '../types/mana.js';
```

with:

```ts
import {
  CHAIN_SKILLS,
  type AbilityPayment,
  type AbilitySlot,
  type Blow,
  type Chains,
  type ChainSkill,
  type FormId,
  type Move,
  type MoveKind,
} from '../types/ability.js';
import type { ManaPair } from '../types/delve.js';
import type { EquippedGear, GearItem, Moveset, Rarity } from '../types/gear.js';
import { RARITY_ORDER } from '../types/gem.js';
import type { ManaType } from '../types/mana.js';
import type { RuneRef } from '../types/rune.js';
import { socketCap, socketsOf } from './runes.js';
```

Replace:

```ts
/**
 * The hero's chains: the equipped weapon's moveset's; unarmed, a default
```

with:

```ts
/** A chain's moves, or its blows (none for a chain left out). */
function chainMoves(chain: Chains[ChainSkill] | undefined): (Move | Blow)[] {
  if (!chain) return [];
  return Array.isArray(chain) ? chain : chain.moves;
}

/** A move or blow copied, its elements and sockets too, so the copy never shares an array. */
function copyMove<M extends Move | Blow>(m: M): M {
  const copy = { ...m };
  if ('elements' in copy) copy.elements = [...copy.elements];
  if (copy.runes) copy.runes = copy.runes.map((r) => r && { ...r });
  return copy;
}

/** A chain copied move by move (`copyMove`). */
function copyChain<C extends Chains[ChainSkill]>(chain: C): C {
  if (Array.isArray(chain)) return chain.map(copyMove) as C;
  return { ...chain, moves: chain.moves.map(copyMove) };
}

/**
 * A weapon drop's open sockets (see the runes spec): its rarity's count
 * (`runes.socketDrops`), each on a move or blow of the chains it carries
 * picked uniformly at random (never past the rarity's cap on a move), every
 * one empty. With none to open, `moveset` comes back as it is.
 */
export function rollSockets(
  registry: DataRegistry,
  item: Pick<GearItem, 'rarity'>,
  moveset: Moveset,
  rng: SeededRNG,
): Moveset {
  const [least, most] = registry.getDelveBalance().runes.socketDrops[item.rarity];
  const cap = socketCap(registry, item.rarity);
  let open = rng.nextInt(least, most);
  if (open === 0) return moveset;
  const chains: Moveset['chains'] = {};
  for (const skill of CHAIN_SKILLS) {
    const chain = moveset.chains[skill];
    if (chain) (chains as Record<ChainSkill, unknown>)[skill] = copyChain(chain);
  }
  const moves = CHAIN_SKILLS.flatMap((skill) => chainMoves(chains[skill]));
  for (; open > 0; open--) {
    const room = moves.filter((m) => socketsOf(m).length < cap);
    if (room.length === 0) break;
    const m = room[rng.nextInt(0, room.length - 1)];
    m.runes = [...socketsOf(m), null];
  }
  return { chains, slots: { ...moveset.slots } };
}

/**
 * What a weapon gives back when it goes (salvaged, fused, rebuilt): a Link
 * for each extra slot and each open socket, and the runes in its sockets
 * (which leave by the parts rule). Other gear gives nothing.
 */
export function weaponParts(
  registry: DataRegistry,
  weapon: GearItem,
): { links: number; runes: RuneRef[] } {
  if (weapon.slot !== 'weapon') return { links: 0, runes: [] };
  const { chains } = movesetOf(registry, weapon);
  const sockets = CHAIN_SKILLS.flatMap((skill) => chainMoves(chains[skill])).flatMap(socketsOf);
  return {
    links: extraSlots(registry, weapon) + sockets.length,
    runes: sockets.filter((r): r is RuneRef => r !== null).map((r) => ({ ...r })),
  };
}

/**
 * The hero's chains: the equipped weapon's moveset's; unarmed, a default
```

In `packages/engine/src/loot/runes.ts`, wave 0's four stubs give way to the rolls' homes, and the imports and the constant only the stubs used go with them:

Replace:

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
```

with:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { Blow, FormId, KnobsData, Move } from '../types/ability.js';
import type { Rarity } from '../types/gear.js';
import {
  MAX_SOCKETS,
  RUNE_TIERS,
  type RuneDef,
  type RunePouch,
  type RuneRef,
  type RuneTarget,
} from '../types/rune.js';
```

Replace:

```ts
 * imports nothing from `delve/`. Wave 1 fills the rolls and the parts
 * (`runeTierAt`, `rollRuneDrop`, `rollSockets`, `weaponParts`).
 */
```

with:

```ts
 * imports nothing from `delve/`. The rolls and a weapon's parts live beside
 * what they act on and are re-exported at the end: `runeTierAt` and
 * `rollRuneDrop` in `loot/drops.ts`, `rollSockets` and `weaponParts` in
 * `loot/moveset.ts`.
 */
```

Delete the lines from `const NOT_BUILT = 'not built yet';` up to (not including) `` /** Whether `def` fits `on`: a form it lists, or a blow of a weapon it lists (unarmed fits none). */ ``.

Replace the lines from `` /** A rune drop's tier at `depth`: the highest `tierDepths` reached, then `tierUp` for one higher. */ `` up to the end of the file with:

```ts
export { rollRuneDrop, runeTierAt } from './drops.js';
export { rollSockets, weaponParts } from './moveset.js';
```

- [ ] **Step 4: Run them and watch them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts)`
Expected: PASS (5 tests).

Run: `(cd packages/engine && npx vitest run)` and `(cd packages/engine && npx tsc --noEmit -p .)`
Expected: every test passes; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/loot/moveset.ts packages/engine/src/loot/runes.ts packages/engine/tests/delve-runes.test.ts packages/engine/tests/delve-runes-contract.test.ts
git add packages/engine/src/loot/drops.ts packages/engine/src/loot/moveset.ts packages/engine/src/loot/runes.ts packages/engine/tests/delve-runes.test.ts packages/engine/tests/delve-runes-contract.test.ts
git commit -m "feat(engine): the rune rolls: a drop's tier and chance, a moveset's sockets, a weapon's parts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The parts rule

### Task 2: The parts rule: salvage, auto-salvage, fusing and the choice of mana

Wherever an open socket or its rune goes away other than through Apply (spec: "Parts come back, by the pull mode"), the socket comes back as one Link in both modes, and its rune is destroyed (`destroy`) or goes back to the pouch free (`pay`). This task writes `delve/runes.ts` over wave 0's stub: its contract types, `unsocketMode`, and the one helper every parts op calls, `settleParts(registry, pouch, runes, unsocket?) → { pouch, runes, destroyed }`; the later functions stay stubs until Tasks 5 and 6. Then `addLootToBag`, `salvageItems` and `fuseGear` take `opts.unsocket` and give `weaponParts` (extra slots and open sockets as Links, the runes by the rule) in place of `extraSlots`, and report `runes` (back to the pouch) and `destroyed`. `chooseStartingMana` takes `opts.unsocket` too: its rebuild gives the weapon's open sockets back as Links and its runes by the rule (its extra slots, as before, aren't refunded: the spec's parts list for it is the sockets'); a fresh hero has none, so a new save is unchanged.

**Files:**
- Create: `packages/engine/src/delve/runes.ts` (wave 0 created it as a stub; this replaces it whole)
- Modify: `packages/engine/src/delve/profile.ts` (`addLootToBag`, `salvageItems`, `fuseGear`)
- Modify: `packages/engine/src/delve/pair.ts` (`chooseStartingMana`)
- Modify: `packages/engine/tests/delve-runes.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-runes.test.ts`:

Replace:

```ts
import { defaultMoveset } from '../src/loot/moveset.js';
```

with:

```ts
import { defaultMoveset } from '../src/loot/moveset.js';
import { startDive } from '../src/delve/dive.js';
import { chooseStartingMana } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
  fuseGear,
  salvageItems,
  setAutoSalvage,
} from '../src/delve/profile.js';
import { unsocketMode } from '../src/delve/runes.js';
```

Replace:

```ts
import type { GearItem, Moveset, Rarity } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gem.js';
```

with:

```ts
import type { GearItem, Moveset, Rarity } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import type { RuneRef } from '../src/types/rune.js';
```

Append at the end of the file:

```ts
const CHAIN_II: RuneRef = { id: 'chain', tier: 2 };
const SPLIT_I: RuneRef = { id: 'split', tier: 1 };

/**
 * A rare sword (`uid`) with one extra basic slot and three open sockets: its
 * first blow holds Chain II and an empty socket, its Bolt holds Split I.
 * Its parts: 4 Links, and the two runes.
 */
function socketedSword(uid = 'w'): GearItem {
  const w = { ...weapon('rare', 1, 'sword'), uid };
  const moveset = defaultMoveset(registry, w, 'storm', { basic: 4, primary: 1, defensive: 1 });
  moveset.chains.basic![0] = { ...moveset.chains.basic![0], runes: [CHAIN_II, null] };
  const primary = moveset.chains.primary!;
  primary.moves[0] = { ...primary.moves[0], runes: [SPLIT_I] };
  return { ...w, moveset };
}

describe('the parts rule', () => {
  const hero = () => createDelveProfile(registry, 3, { primary: 'storm' });

  it('reads the pull mode from the balance unless overridden', () => {
    expect(R.unsocket).toBe('destroy');
    expect(unsocketMode(registry)).toBe('destroy');
    expect(unsocketMode(registry, null)).toBe('destroy');
    expect(unsocketMode(registry, 'pay')).toBe('pay');
    expect(unsocketMode(registry, 'destroy')).toBe('destroy');
  });

  it('salvage: a Link for each extra slot and open socket; the runes destroyed, or back to the pouch in pay mode', () => {
    const p = { ...hero(), bag: [socketedSword()] };
    const gone = salvageItems(registry, p, ['w']);
    expect(gone).toMatchObject({ links: 4, count: 1, runes: [], destroyed: [CHAIN_II, SPLIT_I] });
    expect(gone.profile.links).toBe(4);
    expect(gone.profile.runes).toEqual({});
    const paid = salvageItems(registry, p, ['w'], { unsocket: 'pay' });
    expect(paid).toMatchObject({ links: 4, runes: [CHAIN_II, SPLIT_I], destroyed: [] });
    expect(paid.profile.runes).toEqual({ chain: [0, 1, 0, 0, 0], split: [1, 0, 0, 0, 0] });
    // Nothing melts mid-dive, so nothing comes back.
    const diving = startDive(registry, p, 1);
    expect(salvageItems(registry, diving, ['w'])).toMatchObject({
      count: 0,
      links: 0,
      runes: [],
      destroyed: [],
    });
  });

  it('auto-salvage and a full bag melt a socketed weapon the same way', () => {
    const auto = setAutoSalvage(hero(), 'rare', true);
    const melted = addLootToBag(registry, auto, [socketedSword()]);
    expect(melted).toMatchObject({ links: 4, runes: [], destroyed: [CHAIN_II, SPLIT_I] });
    const paid = addLootToBag(registry, auto, [socketedSword()], { unsocket: 'pay' });
    expect(paid).toMatchObject({ links: 4, runes: [CHAIN_II, SPLIT_I], destroyed: [] });
    expect(paid.profile.runes).toEqual({ chain: [0, 1, 0, 0, 0], split: [1, 0, 0, 0, 0] });
    const full = { ...hero(), bag: Array(bal.loot.bagSize).fill(socketedSword('x')) };
    expect(addLootToBag(registry, full, [socketedSword()])).toMatchObject({
      bagFull: true,
      links: 4,
      destroyed: [CHAIN_II, SPLIT_I],
    });
    // Kept loot gives nothing back.
    expect(addLootToBag(registry, hero(), [socketedSword()])).toMatchObject({
      links: 0,
      runes: [],
      destroyed: [],
    });
  });

  it("fusing gives the inputs' parts back by the rule; the fused weapon rolls its own", () => {
    const three = ['a', 'b', 'c'].map((uid) => socketedSword(uid));
    const p = { ...hero(), scrap: 9999, bag: three };
    const res = fuseGear(registry, p, ['a', 'b', 'c']);
    expect(res).toMatchObject({ ok: true, links: 12, runes: [] });
    expect(res.destroyed).toHaveLength(6);
    expect(res.profile.links).toBe(12);
    expect(res.item!.rarity).toBe('epic');
    const paid = fuseGear(registry, p, ['a', 'b', 'c'], { unsocket: 'pay' });
    expect(paid).toMatchObject({ ok: true, links: 12, destroyed: [] });
    expect(paid.profile.runes).toEqual({ chain: [0, 3, 0, 0, 0], split: [3, 0, 0, 0, 0] });
  });

  it('the choice of mana rebuilds the weapon: its sockets back as Links, its runes by the rule', () => {
    const unchosen = createDelveProfile(registry, 3);
    const p = { ...unchosen, equipped: { ...unchosen.equipped, weapon: socketedSword() } };
    const res = chooseStartingMana(registry, p, 'fire');
    expect(res).toMatchObject({ ok: true, links: 3, runes: [], destroyed: [CHAIN_II, SPLIT_I] });
    expect(res.profile.links).toBe(3); // the open sockets; the extra slot, as before, is not refunded
    const sword = res.profile.equipped.weapon!;
    expect(sword.moveset).toEqual(defaultMoveset(registry, sword, 'fire'));
    const paid = chooseStartingMana(registry, p, 'fire', { unsocket: 'pay' });
    expect(paid.profile.runes).toEqual({ chain: [0, 1, 0, 0, 0], split: [1, 0, 0, 0, 0] });
    // A fresh hero has no parts: a new save is unchanged.
    const fresh = createDelveProfile(registry, 3, { primary: 'fire' });
    expect([fresh.links, fresh.runes]).toEqual([0, {}]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts)`
Expected: FAIL, 5 of 10: the mode test throws `not built yet` (wave 0's `unsocketMode` stub); salvage, auto-salvage and fusing give 1 Link where 4 are expected (`extraSlots` counts only the extra slot) and destroy nothing (`expected { Object (profile, scrap, ...) } to match object { links: 4, count: 1, runes: [], …(1) }` and its like); the choice of mana gives no `links`.

- [ ] **Step 3: Write the parts rule**

Create `packages/engine/src/delve/runes.ts` (wave 0 created it as a stub; this replaces it whole):

```ts
import type { DataRegistry } from '../data/registry.js';
import { addToPouch } from '../loot/runes.js';
import type { Chains, ChainSkill } from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { ChainOrigins, RunePouch, RuneRef, UnsocketMode } from '../types/rune.js';
import type { ProfileActionResult } from './profile.js';

/**
 * Runes on the hero's moves (see the runes spec): the pull rule, the parts
 * rule, the draft's rune price, opening sockets, socketing, and fusing.
 * moveset.ts, profile.ts and pair.ts import this module back: keep to
 * function declarations.
 */

export interface SetChainsOptions {
  origins?: ChainOrigins;
  unsocket?: UnsocketMode;
}

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

export interface DraftPrice {
  dust: number;
  links: number;
  scrap: number;
  refundLinks: number;
  destroys: RuneRef[];
  returns: RuneRef[];
}

/** What a pull does: `override` (the client's dev toggle) or the balance's `runes.unsocket`. */
export function unsocketMode(registry: DataRegistry, override?: UnsocketMode | null): UnsocketMode {
  return override ?? registry.getDelveBalance().runes.unsocket;
}

/**
 * The parts rule for `runes` leaving a weapon other than through Apply (a
 * salvage, a fuse, a transfer, the choice of mana): in 'pay' they go back to
 * `pouch` free, in 'destroy' they are destroyed. The sockets' Links are the
 * caller's (one each, in both modes).
 */
export function settleParts(
  registry: DataRegistry,
  pouch: RunePouch,
  runes: readonly RuneRef[],
  unsocket?: UnsocketMode | null,
): { pouch: RunePouch; runes: RuneRef[]; destroyed: RuneRef[] } {
  const list = runes.map((r) => ({ ...r }));
  if (unsocketMode(registry, unsocket) === 'pay')
    return { pouch: addToPouch(pouch, list), runes: list, destroyed: [] };
  return { pouch, runes: [], destroyed: list };
}

export function runeChange(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _chains: Partial<Chains>,
  _opts?: SetChainsOptions,
): RuneChange | { refused: string } {
  throw new Error('not built yet');
}

export function draftPrice(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _chains: Partial<Chains>,
  _opts?: SetChainsOptions,
): DraftPrice | { refused: string } {
  throw new Error('not built yet');
}

export function openSocket(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _skill: ChainSkill,
  _index: number,
): ProfileActionResult {
  throw new Error('not built yet');
}

export function socketRune(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _skill: ChainSkill,
  _index: number,
  _socket: number,
  _rune: RuneRef,
  _opts?: SetChainsOptions,
): ProfileActionResult {
  throw new Error('not built yet');
}

export function fusePrice(_registry: DataRegistry, _ref: RuneRef): number | null {
  throw new Error('not built yet');
}

export function fuseRunes(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _ref: RuneRef,
): ProfileActionResult {
  throw new Error('not built yet');
}
```

In `packages/engine/src/delve/profile.ts`:

Replace:

```ts
import { isDiveActive } from './dive.js';
```

with:

```ts
import { isDiveActive } from './dive.js';
import { settleParts, type SetChainsOptions } from './runes.js';
```

Replace:

```ts
import { baseSlots, carriedSkills, defaultChain, extraSlots, movesetOf } from '../loot/moveset.js';
```

with:

```ts
import { baseSlots, carriedSkills, defaultChain, movesetOf, weaponParts } from '../loot/moveset.js';
```

Replace the lines from `/** Put fresh loot in the bag, honouring auto-salvage and bag capacity. */` up to (not including) `/** Mid-dive, all gear is locked, the forge and salvage too (see the weapon movesets spec). */` with:

```ts
/**
 * Put fresh loot in the bag, honouring auto-salvage and bag capacity. A melted
 * weapon gives its parts (`weaponParts`): a Link for each extra slot and open
 * socket, and its runes by the parts rule (`opts.unsocket`, else the balance's).
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
  let scrap = 0;
  let dust = 0;
  let links = 0;
  let bagFull = false;
  for (const item of items) {
    const auto = item.rarity !== 'legendary' && profile.autoSalvage[item.rarity];
    if (auto || bag.length >= bagSize) {
      if (!auto) bagFull = true;
      salvaged.push(item);
      scrap += salvageValue(registry, item);
      dust += salvageDust(registry, item, profile.pair);
      links += weaponParts(registry, item).links;
    } else {
      bag.push(item);
      kept.push(item);
    }
  }
  const parts = salvaged.flatMap((item) => weaponParts(registry, item).runes);
  const settled = settleParts(registry, recorded.profile.runes, parts, opts.unsocket);
  return {
    profile: {
      ...recorded.profile,
      bag,
      scrap: recorded.profile.scrap + scrap,
      manaDust: recorded.profile.manaDust + dust,
      links: recorded.profile.links + links,
      runes: settled.pouch,
      stats: { ...recorded.profile.stats, scrapEarned: recorded.profile.stats.scrapEarned + scrap },
    },
    kept,
    salvaged,
    scrap,
    dust,
    links,
    runes: settled.runes,
    destroyed: settled.destroyed,
    bagFull,
    newCodex: recorded.newCodex,
  };
}

```

Replace the lines from `* Salvage bag items. Locked or missing uids are skipped. Gear outside the pair` up to (not including) `` /** Bag items that are safe to melt: unlocked, not an upgrade (a weapon as a home), at or below `maxRarity`. */ `` with:

```ts
 * Salvage bag items. Locked or missing uids are skipped. Gear outside the pair
 * also gives Mana Dust, and a weapon its parts (`weaponParts`): a Link for each
 * extra slot and open socket, and its runes by the parts rule (`opts.unsocket`,
 * else the balance's). Mid-dive it melts nothing (auto-salvage of new loot,
 * `addLootToBag`, still runs).
 */
export function salvageItems(
  registry: DataRegistry,
  profile: DelveProfile,
  uids: string[],
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
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
  const targets = new Set(uids);
  let scrap = 0;
  let dust = 0;
  let links = 0;
  const melted: GearItem[] = [];
  const bag = profile.bag.filter((item) => {
    if (!targets.has(item.uid) || item.locked) return true;
    scrap += salvageValue(registry, item);
    dust += salvageDust(registry, item, profile.pair);
    links += weaponParts(registry, item).links;
    melted.push(item);
    return false;
  });
  const parts = melted.flatMap((item) => weaponParts(registry, item).runes);
  const settled = settleParts(registry, profile.runes, parts, opts.unsocket);
  return {
    profile: {
      ...profile,
      bag,
      scrap: profile.scrap + scrap,
      manaDust: profile.manaDust + dust,
      links: profile.links + links,
      runes: settled.pouch,
      stats: { ...profile.stats, scrapEarned: profile.stats.scrapEarned + scrap },
    },
    scrap,
    dust,
    links,
    count: melted.length,
    runes: settled.runes,
    destroyed: settled.destroyed,
  };
}

```

Replace the lines from `` * Fuse three bag items of one rarity into one of the next (`fuseItems`), for `` up to the end of the file with:

```ts
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

In `packages/engine/src/delve/pair.ts`:

Replace:

```ts
import { defaultMoveset, heroChains, movesetOf } from '../loot/moveset.js';
```

with:

```ts
import { defaultMoveset, extraSlots, heroChains, movesetOf, weaponParts } from '../loot/moveset.js';
```

Replace:

```ts
import { findItem, replaceItem, withMoveset, type ProfileActionResult } from './profile.js';
```

with:

```ts
import { findItem, replaceItem, withMoveset, type ProfileActionResult } from './profile.js';
import { settleParts, type SetChainsOptions } from './runes.js';
```

Replace the lines from `` * The one-time choice: `mana` becomes the primary, every equipped item is `` up to (not including) `/** Bind a second element: free, once, between dives. Every move keeps its elements. */` with:

```ts
 * The one-time choice: `mana` becomes the primary, every equipped item is
 * re-attuned to it for free (the bag is left alone), and the equipped
 * weapon's moveset starts over at its base slots, every move the default in
 * it. Its open sockets come back as Links and its runes by the parts rule
 * (`opts.unsocket`; its extra slots aren't refunded). Allowed mid-dive (a
 * migrated save may be).
 */
export function chooseStartingMana(
  registry: DataRegistry,
  profile: DelveProfile,
  mana: ManaType,
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): ProfileActionResult {
  if (profile.pair.primary) return refuse(profile, 'Your mana is already chosen');
  const equipped = { ...profile.equipped };
  for (const slot of GEAR_SLOTS) {
    const item = equipped[slot];
    if (item && item.mana !== mana) equipped[slot] = attuneTo(item, mana);
  }
  const pair = { primary: mana, secondary: null };
  const weapon = equipped.weapon;
  if (!weapon) return { ok: true, profile: { ...profile, equipped, pair } };
  const parts = weaponParts(registry, weapon);
  const links = parts.links - extraSlots(registry, weapon);
  const settled = settleParts(registry, profile.runes, parts.runes, opts.unsocket);
  equipped.weapon = { ...weapon, moveset: defaultMoveset(registry, weapon, mana) };
  return {
    ok: true,
    links,
    runes: settled.runes,
    destroyed: settled.destroyed,
    profile: { ...profile, equipped, pair, links: profile.links + links, runes: settled.pouch },
  };
}

```

- [ ] **Step 4: Run them and watch them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts)`
Expected: PASS (10 tests).

Run: `(cd packages/engine && npx vitest run)` and `(cd packages/engine && npx tsc --noEmit -p .)`
Expected: every test passes (4a's Links tests in `delve-movesets.test.ts` use weapons without sockets, so their counts hold); tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/delve/runes.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/pair.ts packages/engine/tests/delve-runes.test.ts
git add packages/engine/src/delve/runes.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/pair.ts packages/engine/tests/delve-runes.test.ts
git commit -m "feat(engine): the parts rule: salvage, fusing and the choice of mana return sockets as Links and runes by the pull mode" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: Transfers, and Mana Dust by origin

### Task 3: A transfer moves sockets with their moves, priced per open socket

`movesetTransfer` (spec: "Moving moves between weapons") gains `sockets` (the open sockets that move: priced at `transferScrap` each, beside the extra slots) and `runes` (those that leave). What comes back, one Link a socket, its rune leaving: a kept move's sockets past the target rarity's cap (from the end); every socket of a move the transfer drops (past the new slot count, or on a chain the target can't carry); and the target's own sockets on the chains it replaces. A kept blow's rune that doesn't fit the target weapon leaves too, its socket staying open. `transferMoveset` takes `opts.unsocket` and settles the leaving runes by the parts rule. A move with no sockets copies exactly as before, so every 4a transfer prices the same.

The task ends with the conservation probe: over random socketed weapons, a transfer and then a salvage keep Links (the hero's plus every weapon's parts) and runes (the pouch, the socketed and the destroyed) constant in both modes, and the result reads back from the save unchanged.

**Files:**
- Modify: `packages/engine/src/loot/moveset.ts` (`MovesetTransfer`, `movesetTransfer`)
- Modify: `packages/engine/src/delve/moveset.ts` (`transferMoveset`)
- Modify: `packages/engine/tests/delve-runes.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-runes.test.ts`:

Replace:

```ts
import { defaultMoveset } from '../src/loot/moveset.js';
```

with:

```ts
import { baseSlots, carriedSkills, defaultMoveset } from '../src/loot/moveset.js';
import { transferMoveset } from '../src/delve/moveset.js';
```

Replace:

```ts
import {
  rollRuneDrop,
  rollSockets,
  runeTierAt,
  socketsOf,
  weaponParts,
} from '../src/loot/runes.js';
```

with:

```ts
import {
  rollRuneDrop,
  rollSockets,
  runeFits,
  runeTierAt,
  socketsOf,
  weaponParts,
} from '../src/loot/runes.js';
```

Replace:

```ts
  fuseGear,
  salvageItems,
  setAutoSalvage,
} from '../src/delve/profile.js';
```

with:

```ts
  fuseGear,
  parseDelveProfile,
  salvageItems,
  setAutoSalvage,
} from '../src/delve/profile.js';
```

Replace:

```ts
import type { RuneRef } from '../src/types/rune.js';
```

with:

```ts
import type { DelveProfile } from '../src/types/delve.js';
import type { RunePouch, RuneRef } from '../src/types/rune.js';
```

Append at the end of the file:

```ts
const QUICK_I: RuneRef = { id: 'quick', tier: 1 };
const ECHO_I: RuneRef = { id: 'echo', tier: 1 };
const GUARD_I: RuneRef = { id: 'guard', tier: 1 };

/** Every rune in a pouch, counted. */
function pouchSize(pouch: RunePouch): number {
  return Object.values(pouch).reduce((n, counts) => n + counts.reduce((a, b) => a + b, 0), 0);
}

/** `w` with a moveset of these slots, every move its default in `w`'s mana. */
function slotted(w: GearItem, slots: Moveset['slots']): GearItem {
  return { ...w, moveset: defaultMoveset(registry, w, w.mana, slots) };
}

describe('transfer: sockets move with their moves', () => {
  const T = bal.movesets.transferScrap;
  /** A Storm hero wielding `w`, with scrap to spare, and `bag` in the bag. */
  const holding = (w: GearItem, ...bag: GearItem[]): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'storm' });
    return { ...p, equipped: { ...p.equipped, weapon: w }, bag, scrap: 1000 };
  };

  it("moves each kept move's sockets and runes, priced per open socket; the target's replaced ones come back", () => {
    // The target: a rare axe whose own Bolt holds Quick I.
    const axe = slotted(
      { ...weapon('rare', 2, 'axe'), uid: 'axe' },
      { basic: 3, primary: 1, defensive: 1 },
    );
    const bolt = axe.moveset!.chains.primary!;
    bolt.moves[0] = { ...bolt.moves[0], runes: [QUICK_I] };
    const res = transferMoveset(registry, holding(socketedSword(), axe), 'axe');
    expect(res.ok).toBe(true);
    const moved = res.profile.equipped.weapon!.moveset!;
    expect(moved.chains.basic![0].runes).toEqual([CHAIN_II, null]);
    expect(moved.chains.primary!.moves[0].runes).toEqual([SPLIT_I]);
    // The sword's extra slot and its three open sockets move; the axe's socket comes back.
    expect(res.profile.scrap).toBe(1000 - 4 * T);
    expect(res).toMatchObject({ links: 1, runes: [], destroyed: [QUICK_I] });
    expect(res.profile.links).toBe(1);
    const paid = transferMoveset(registry, holding(socketedSword(), axe), 'axe', {
      unsocket: 'pay',
    });
    expect(paid).toMatchObject({ links: 1, runes: [QUICK_I], destroyed: [] });
    expect(paid.profile.runes).toEqual({ quick: [1, 0, 0, 0, 0] });
  });

  it("a blow's rune that doesn't fit the target leaves, its socket open; past the cap and on a chain left behind, they come back", () => {
    // A legendary bow: its first blow holds Split II, Chain I and an empty socket; its Ward Guard I.
    const bow = slotted(weapon('legendary', 3, 'bow'), {
      basic: 3,
      primary: 1,
      defensive: 1,
      ultimate: 1,
    });
    const blows = bow.moveset!.chains.basic!;
    blows[0] = { ...blows[0], runes: [{ id: 'split', tier: 2 }, { id: 'chain', tier: 1 }, null] };
    const ward = bow.moveset!.chains.defensive!;
    ward.moves[0] = { ...ward.moves[0], runes: [GUARD_I] };
    // Onto a common sword: one socket a move, no Defensive.
    const sword = { ...weapon('common', 4, 'sword'), uid: 'sword' };
    const res = transferMoveset(registry, holding(bow, sword), 'sword');
    expect(res.profile.equipped.weapon!.moveset!.chains.basic![0].runes).toEqual([null]);
    // Back: the two sockets past the cap and the Ward's; Split doesn't fit a sword's blows.
    expect(res).toMatchObject({
      links: 3,
      destroyed: [{ id: 'chain', tier: 1 }, { id: 'split', tier: 2 }, GUARD_I],
    });
    expect(res.profile.scrap).toBe(1000 - T); // the one socket that moved
  });

  it('a move the transfer drops takes its sockets with it, back as Links', () => {
    // A dagger's full string (4 + 1 extra) onto a maul (2): 3 slots, the last two blows gone.
    const dagger = slotted(weapon('magic', 3, 'dagger'), { basic: 5, primary: 1, defensive: 1 });
    const blows = dagger.moveset!.chains.basic!;
    blows[4] = { ...blows[4], runes: [ECHO_I] };
    const maul = { ...weapon('common', 4, 'maul'), uid: 'maul' };
    const res = transferMoveset(registry, holding(dagger, maul), 'maul');
    expect(res).toMatchObject({ links: 1, destroyed: [ECHO_I] });
    expect(res.profile.scrap).toBe(1000 - T); // the extra slot; the dropped socket isn't priced
  });

  it('conserves Links and runes over random transfers and salvages, in both modes, and reads back', () => {
    const rng = new SeededRNG(77);
    const bases = ['sword', 'axe', 'dagger', 'maul', 'staff', 'wand', 'bow'];
    /** A random weapon at random slots, each move with random sockets holding random fitting runes. */
    const randomWeapon = (uid: string): GearItem => {
      const rarity = RARITY_ORDER[rng.nextInt(0, RARITY_ORDER.length - 1)];
      const baseId = bases[rng.nextInt(0, bases.length - 1)];
      const w = generateItem(
        registry,
        { uid, ilvl: 5, rarity, slot: 'weapon', baseId, mana: 'fire' },
        rng.fork(uid),
      );
      const slots: Moveset['slots'] = {};
      for (const s of carriedSkills(registry, rarity))
        slots[s] = rng.nextInt(baseSlots(registry, baseId, s), bal.chains.cap[s]);
      const moveset = defaultMoveset(registry, w, 'fire', slots);
      for (const m of allMoves(moveset)) {
        const on = 'form' in m ? { form: m.form } : { weapon: baseId, kind: m.kind };
        const fit = registry.getRunes().filter((d) => runeFits(d, on));
        const runes: (RuneRef | null)[] = [];
        for (let i = rng.nextInt(0, R.socketCap[rarity]); i > 0; i--) {
          const def = fit[rng.nextInt(0, fit.length - 1)];
          const empty = rng.next() < 0.3 || runes.some((r) => r?.id === def.id);
          runes.push(empty ? null : { id: def.id, tier: rng.nextInt(1, 5) as RuneRef['tier'] });
        }
        if (runes.length > 0) m.runes = runes;
      }
      return { ...w, moveset };
    };
    const totals = (q: DelveProfile, destroyed: RuneRef[]) => {
      const weapons = [q.equipped.weapon!, ...q.bag].map((i) => weaponParts(registry, i));
      return {
        links: q.links + weapons.reduce((n, p) => n + p.links, 0),
        runes:
          pouchSize(q.runes) + weapons.reduce((n, p) => n + p.runes.length, 0) + destroyed.length,
      };
    };
    for (let n = 0; n < 400; n++) {
      const unsocket = n % 2 === 0 ? 'destroy' : 'pay';
      const a = randomWeapon(`a${n}`);
      const b = randomWeapon(`b${n}`);
      const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
      const p = { ...p0, equipped: { ...p0.equipped, weapon: a }, bag: [b], scrap: 1e6 };
      const before = totals(p, []);
      const t = transferMoveset(registry, p, b.uid, { unsocket });
      expect(t.ok).toBe(true);
      expect(totals(t.profile, t.destroyed!)).toEqual(before);
      const saved = JSON.parse(JSON.stringify(t.profile));
      expect(parseDelveProfile(registry, saved)!.profile).toEqual(t.profile);
      const s = salvageItems(registry, t.profile, [a.uid], { unsocket });
      expect(s.count).toBe(1);
      expect(totals(s.profile, [...t.destroyed!, ...s.destroyed])).toEqual(before);
    }
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts)`
Expected: FAIL, 4 of 14: the transfers price only the extra slots (`expected 970 to be 880`), keep a blow's unfitting rune and the sockets past the cap (`expected [ { id: 'split', tier: 2 }, …(2) ] to deeply equal [ null ]`) and give no socket back as a Link; the probe reads `t.destroyed`, which today's transfer doesn't give (`TypeError: Cannot read properties of undefined (reading 'length')`).

- [ ] **Step 3: Move sockets with the moveset**

In `packages/engine/src/loot/moveset.ts`:

Replace:

```ts
import { socketCap, socketsOf } from './runes.js';
```

with:

```ts
import { runeFits, socketCap, socketsOf } from './runes.js';
```

Replace the lines from `` /** What moving one weapon's moveset onto another gives (see `movesetTransfer`). */ `` up to the end of the file with:

```ts
/** What moving one weapon's moveset onto another gives (see `movesetTransfer`). */
export interface MovesetTransfer {
  /** The target's moveset once the chains have moved onto it. */
  moveset: Moveset;
  /** Extra slots that move: the price counts these. */
  moved: number;
  /** Open sockets that move (on the moves the target keeps, within its cap): the price counts these too. */
  sockets: number;
  /**
   * Links back: the extras past the cap, the extras of chains the target
   * can't carry, and the target's own extras on the chains replaced; and one
   * for each open socket that doesn't move (past the target's cap, on a move
   * the transfer drops, or the target's own on the chains replaced).
   */
  links: number;
  /**
   * The runes that leave, by the parts rule: those in the sockets that don't
   * move, and a kept blow's rune that doesn't fit the target weapon (its socket moves, empty).
   */
  runes: RuneRef[];
  /** Scrap: `transferScrap` for each extra slot and each open socket that moves. */
  scrap: number;
}

/**
 * `source`'s moveset moved onto `target`: each chain the target carries keeps
 * its extra slots over the target's base (at most the cap, the rest back as
 * Links), its moves past the new slots dropped from the end; a chain the
 * target can't carry stays behind, its extras back as Links; the target's own
 * extras on the chains replaced come back as Links; and a skill only the
 * target carries keeps the target's chain. Sockets go with their moves (see
 * the runes spec): a kept move's sockets past the target's cap come back from
 * the end, and so do all of a dropped move's and of the target's replaced
 * moves, each as a Link with its rune leaving; a kept blow's rune that
 * doesn't fit the target weapon leaves too, its socket staying open.
 */
export function movesetTransfer(
  registry: DataRegistry,
  source: GearItem,
  target: GearItem,
): MovesetTransfer {
  const bal = registry.getDelveBalance();
  const from = movesetOf(registry, source);
  const onto = movesetOf(registry, target);
  const carried = carriedSkills(registry, target.rarity);
  const cap = socketCap(registry, target.rarity);
  const chains = { ...onto.chains };
  const slots = { ...onto.slots };
  let moved = 0;
  let sockets = 0;
  let links = 0;
  const runes: RuneRef[] = [];
  /** Sockets that don't move: a Link each, their runes leaving. */
  const leave = (gone: (RuneRef | null)[]) => {
    links += gone.length;
    for (const r of gone) if (r) runes.push({ ...r });
  };
  /** A move the target keeps: its sockets within the cap, and a blow's runes that fit the target. */
  const keep = <M extends Move | Blow>(m: M): M => {
    const copy = copyMove(m);
    const own = socketsOf(copy);
    if (own.length === 0) return copy;
    leave(own.slice(cap));
    copy.runes = own.slice(0, cap).map((r) => {
      if (!r || 'form' in copy) return r;
      const def = registry.findRune(r.id);
      if (def && runeFits(def, { weapon: target.baseId, kind: copy.kind })) return r;
      runes.push(r);
      return null;
    });
    sockets += copy.runes.length;
    return copy;
  };
  for (const skill of CHAIN_SKILLS) {
    const chain = from.chains[skill];
    if (!chain) continue;
    const extra = from.slots[skill]! - baseSlots(registry, source.baseId, skill);
    if (!carried.includes(skill)) {
      links += extra;
      for (const m of chainMoves(chain)) leave(socketsOf(m));
      continue;
    }
    const base = baseSlots(registry, target.baseId, skill);
    const n = Math.min(base + extra, bal.chains.cap[skill]);
    links += base + extra - n + (onto.slots[skill]! - base);
    moved += n - base;
    for (const m of chainMoves(onto.chains[skill])) leave(socketsOf(m));
    for (const m of chainMoves(chain).slice(n)) leave(socketsOf(m));
    const kept = Array.isArray(chain)
      ? chain.slice(0, n).map(keep)
      : { ...chain, moves: chain.moves.slice(0, n).map(keep) };
    (chains as Record<ChainSkill, unknown>)[skill] = kept;
    slots[skill] = n;
  }
  return {
    moveset: { chains, slots },
    moved,
    sockets,
    links,
    runes,
    scrap: (moved + sockets) * bal.movesets.transferScrap,
  };
}
```

In `packages/engine/src/delve/moveset.ts`:

Replace:

```ts
import { withMoveset, type ProfileActionResult } from './profile.js';
```

with:

```ts
import { withMoveset, type ProfileActionResult } from './profile.js';
import { settleParts, type SetChainsOptions } from './runes.js';
```

Replace the lines from `` * Move the equipped weapon's moveset onto weapon `uid` in the bag and equip `` up to the end of the file with:

```ts
 * Move the equipped weapon's moveset onto weapon `uid` in the bag and equip
 * it, for scrap (`movesetTransfer`: its extra slots and open sockets); its
 * Links come back, and the runes that leave go by the parts rule
 * (`opts.unsocket`, else the balance's). The old weapon goes to the bag at its
 * base slots, its moves the defaults in its own mana. Refuses mid-dive,
 * unarmed, for anything but a bag weapon, and when it can't be paid for.
 */
export function transferMoveset(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Transfer your moveset between dives');
  const source = profile.equipped.weapon;
  if (!source) return refuse(profile, UNARMED_TEXT);
  const target = profile.bag.find((i) => i.uid === uid && i.slot === 'weapon');
  if (!target) return refuse(profile, 'Transfer onto a weapon in your bag');
  const t = movesetTransfer(registry, source, target);
  if (profile.scrap < t.scrap) return refuse(profile, 'Not enough scrap');
  const item = { ...target, moveset: t.moveset };
  const old = { ...source, moveset: defaultMoveset(registry, source, source.mana) };
  const settled = settleParts(registry, profile.runes, t.runes, opts.unsocket);
  return {
    ok: true,
    item,
    links: t.links,
    runes: settled.runes,
    destroyed: settled.destroyed,
    profile: {
      ...profile,
      equipped: { ...profile.equipped, weapon: item },
      bag: [...profile.bag.filter((i) => i.uid !== uid), old],
      scrap: profile.scrap - t.scrap,
      links: profile.links + t.links,
      runes: settled.pouch,
    },
  };
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts tests/delve-movesets.test.ts)`
Expected: PASS (14 in `delve-runes.test.ts`; 4a's transfer tests unchanged: their weapons hold no sockets).

Run: `(cd packages/engine && npx vitest run)` and `(cd packages/engine && npx tsc --noEmit -p .)`
Expected: every test passes; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/loot/moveset.ts packages/engine/src/delve/moveset.ts packages/engine/tests/delve-runes.test.ts
git add packages/engine/src/loot/moveset.ts packages/engine/src/delve/moveset.ts packages/engine/tests/delve-runes.test.ts
git commit -m "feat(engine): a transfer moves sockets and runes with their moves, priced per open socket" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: Moves have identity: Mana Dust priced by origin

`setChains` takes `opts: SetChainsOptions` (spec: "Changing runes: the draft and its price"), and Mana Dust is priced per origin pair: `origins[skill][j]` is the saved move new move `j` came from (null: a new move), and **missing origins are the identity map** (move `j` came from saved move `j`, if any), so there is one price rule. `movesetEditPrice(registry, old, next, origins?)`, per chain:
1. the moves whose origins form the longest increasing run are in place, free; every other move with an origin **moved**, `editDust`;
2. each origin pair whose kind or form changed, `editDust`; whose elements changed, `elementDust`, charged once per element set per Apply;
3. a new move, `editDust`, its elements charged once per set no saved move has (and none charged already); a saved move no new move came from, `editDust`;
4. a changed payment, `editDust`.

This retires 4a's "matched by what they are" (the least-total pairing and the shared run by value): a moved card costs `editDust` even when edited back, removing a move and adding one alike costs two, and an edit of one move in place prices as before (several moves re-coloured in one Apply now pay `elementDust` once for their new set, where 4a's least pairing charged `elementDust + 2 × editDust` for two: the autopilot's fused Primary gets cheaper, which moves the pacing a little; see **Measured** and **Spec notes**). `editPrice(registry, profile, next, origins?)` passes them through, with the first-dive freebie. `setChains` refuses origins of the wrong length, that repeat an index, or that point outside the saved chain (`Bad origins`); origins for a skill `chains` doesn't hold are ignored. 4a's price tests move to the new rule: the cases that removed, inserted or swapped a move pass the origins the builder would send, and new cases pin the identity map.

**Files:**
- Modify: `packages/engine/src/delve/moveset.ts` (`chainOrigins`, the price, `movesetEditPrice`, `editPrice`, `setChains`)
- Modify: `packages/engine/tests/delve-movesets.test.ts` (the price tests, and `setChains`' total)

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-movesets.test.ts`:

Replace the lines from `describe('the edit price (movesetEditPrice)', () => {` up to (not including) `describe('edits: setChain and setChains', () => {` with:

```ts
describe('the edit price (movesetEditPrice): by origin', () => {
  const E = bal.movesets.editDust;
  const X = bal.movesets.elementDust;
  const bolt = (kind: Move['kind'], ...elements: ManaType[]): Move => ({
    kind,
    form: 'bolt',
    elements,
  });
  const chain = (...moves: Move[]): Chain => ({ moves, payment: 'mana' });
  const price = (old: Chain, next: Chain, origins?: (number | null)[]) =>
    movesetEditPrice(
      registry,
      { primary: old },
      { primary: next },
      origins && { primary: origins },
    );
  const A = bolt('light', 'fire');
  const B = bolt('medium', 'fire');
  const C = bolt('heavy', 'storm');

  it('prices what the builder did: removing or inserting a move costs only that move', () => {
    expect(price(chain(A, B, C), chain(A, B, C))).toBe(0);
    expect(price(chain(A, B, C), chain(A, C), [0, 2])).toBe(E);
    expect(price(chain(A, B, C), chain(B, C), [1, 2])).toBe(E);
    expect(price(chain(A, C), chain(A, B, C), [0, null, 1])).toBe(E); // Fire is an old move's element
  });

  it('without origins, move j came from saved move j: an edit in place', () => {
    // B edited into C (its kind and elements), and the saved C removed.
    expect(price(chain(A, B, C), chain(A, C))).toBe(E + X + E);
    expect(price(chain(A, B), chain(A, bolt('heavy', 'fire')))).toBe(E);
    expect(price(chain(A, B), chain(A, { ...B, form: 'lance' }))).toBe(E);
    expect(price(chain(A, B), chain(A, bolt('medium', 'storm')))).toBe(X);
    expect(price(chain(A, B), chain(A, bolt('medium', 'fire', 'storm')))).toBe(X);
    expect(price(chain(A, B), chain(A, bolt('heavy', 'storm', 'fire')))).toBe(E + X);
  });

  it('a card that moved costs editDust, even one edited back: the longest rising run stays free', () => {
    expect(price(chain(A, B, C), chain(B, C, A), [1, 2, 0])).toBe(E);
    expect(price(chain(A, B), chain(B, A), [1, 0])).toBe(E);
    // Two cards alike swapped: still a move.
    expect(price(chain(A, A), chain(A, A), [1, 0])).toBe(E);
    // A card removed and one alike added: a removal and a new move.
    expect(price(chain(A, B), chain(A, B), [0, null])).toBe(2 * E);
  });

  it('a new element set is charged once per Apply, however many moves take it', () => {
    const fire: Blow = { kind: 'light', element: 'fire' };
    const storm: Blow = { kind: 'light', element: 'storm' };
    const blows = (old: Blow[], next: Blow[]) =>
      movesetEditPrice(registry, { basic: old }, { basic: next });
    expect(blows([fire], [fire, storm])).toBe(E + X);
    expect(blows([fire, storm], [fire, storm, storm])).toBe(E);
    expect(blows([fire], [fire, storm, storm])).toBe(2 * E + X);
    // Two moves re-coloured to one new set, and a new move in it: Storm charged once.
    expect(price(chain(A, B), chain(bolt('light', 'storm'), bolt('medium', 'storm'), C))).toBe(
      X + E,
    );
  });

  it('is 0 only for the same chain in place, and never beats doing it in two Applies (random triples, origins composed)', () => {
    const rng = new SeededRNG(7);
    const pick = <T>(xs: readonly T[]): T => xs[rng.nextInt(0, xs.length - 1)];
    const kinds: Move['kind'][] = ['light', 'heavy', 'hold'];
    const sets: ManaType[][] = [
      ['fire'],
      ['storm'],
      ['frost'],
      ['fire', 'storm'],
      ['storm', 'fire'],
    ];
    const forms = ['bolt', 'lance'] as const;
    const randomChain = (): Chain => ({
      moves: Array.from({ length: rng.nextInt(1, 5) }, () => ({
        kind: pick(kinds),
        form: pick(forms),
        elements: pick(sets),
      })),
      payment: pick(['mana', 'cast'] as const),
    });
    const randomBlows = (): Blow[] =>
      Array.from({ length: rng.nextInt(1, 5) }, () => ({
        kind: pick(kinds),
        element: pick(['fire', 'storm', 'frost'] as const),
      }));
    /** Random origins from `from` moves to `to`: each new move a fresh saved index, or null. */
    const randomOrigins = (from: number, to: number): (number | null)[] => {
      const free = Array.from({ length: from }, (_, i) => i);
      return Array.from({ length: to }, () =>
        free.length === 0 || rng.next() < 0.3
          ? null
          : free.splice(rng.nextInt(0, free.length - 1), 1)[0],
      );
    };
    const length = (x: Partial<Chains>) => movesOf(x.basic ?? x.primary).length;
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    let bad = 0;
    for (let n = 0; n < 4000; n++) {
      const basic = n % 2 === 0;
      const skill = basic ? 'basic' : 'primary';
      const [a, b, c] = basic
        ? [randomBlows(), randomBlows(), randomBlows()].map((x) => ({ basic: x }))
        : [randomChain(), randomChain(), randomChain()].map((x) => ({ primary: x }));
      const ab = randomOrigins(length(a), length(b));
      const bc = randomOrigins(length(b), length(c));
      const ac = bc.map((o) => (o === null ? null : ab[o]));
      const p = (x: Partial<Chains>, y: Partial<Chains>, o?: (number | null)[]) =>
        movesetEditPrice(registry, x, y, o && { [skill]: o });
      if (p(a, c, ac) > p(a, b, ab) + p(b, c, bc)) bad++;
      if ((p(a, b) === 0) !== same(a, b)) bad++;
    }
    expect(bad).toBe(0);
  });

  it('a move left over: a new one costs editDust and, with elements no old move has, elementDust; a removal editDust', () => {
    expect(price(chain(A), chain(A, bolt('medium', 'nature')))).toBe(E + X);
    expect(price(chain(A, C), chain(A, C, bolt('light', 'storm')))).toBe(E);
    expect(price(chain(A, B, C), chain(A))).toBe(2 * E);
  });

  it('a changed payment costs editDust; blows price the same way; chains left out cost nothing, nor do their origins', () => {
    expect(price(chain(A), { moves: [A], payment: 'cast' })).toBe(E);
    const fire: Blow = { kind: 'light', element: 'fire' };
    const heavy: Blow = { kind: 'heavy', element: 'fire' };
    const blows = (old: Blow[], next: Blow[], origins?: (number | null)[]) =>
      movesetEditPrice(registry, { basic: old }, { basic: next }, origins && { basic: origins });
    expect(blows([fire, fire, heavy], [fire, heavy], [0, 2])).toBe(E);
    expect(blows([fire, fire, heavy], [fire, fire, { ...heavy, element: 'frost' }])).toBe(X);
    const old = { basic: [fire], primary: chain(A) };
    expect(movesetEditPrice(registry, old, { primary: chain(B) })).toBe(E);
    expect(movesetEditPrice(registry, old, { basic: [heavy], primary: chain(B) })).toBe(2 * E);
    expect(movesetEditPrice(registry, old, { primary: chain(B) }, { basic: [null] })).toBe(E);
  });

  it('a rune is no part of the Dust: a socket or a rune alone costs none', () => {
    const socketed: Move = { ...A, runes: [{ id: 'quick', tier: 1 }, null] };
    expect(price(chain(A), chain(socketed))).toBe(0);
  });
});

```

Replace:

```ts
    const both = setChains(registry, p, { basic, primary });
    expect(both.ok).toBe(true);
    expect(chainsOf(both.profile)).toEqual({ basic, primary });
    // Two blows removed and a kind changed: 3 × editDust.
    expect(both.profile.manaDust).toBe(20 - 3 * bal.movesets.editDust);
    const poor = { ...p, manaDust: 3 * bal.movesets.editDust - 1 };
    expect(setChains(registry, poor, { basic, primary })).toMatchObject({
```

with:

```ts
    // The basic chain keeps its heavy blow (the builder's origins); the Primary edits in place.
    const origins = { basic: [2] };
    const both = setChains(registry, p, { basic, primary }, { origins });
    expect(both.ok).toBe(true);
    expect(chainsOf(both.profile)).toEqual({ basic, primary });
    // Two blows removed and a kind changed: 3 × editDust.
    expect(both.profile.manaDust).toBe(20 - 3 * bal.movesets.editDust);
    const poor = { ...p, manaDust: 3 * bal.movesets.editDust - 1 };
    expect(setChains(registry, poor, { basic, primary }, { origins })).toMatchObject({
```

Replace the lines from `describe('slots: addSlot', () => {` up to (not including) `/** A Fire hero with plenty of Links and scrap. */` with:

```ts
describe('edits by origin', () => {
  const E = bal.movesets.editDust;
  /** A Fire hero past its first dive, with Mana Dust to spare. */
  const veteran = (): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    return { ...p, manaDust: 99, stats: { ...p.stats, dives: 1 } };
  };

  it('setChains prices by the origins it is given, and refuses bad ones', () => {
    const p = veteran();
    const blows = chainsOf(p).basic!; // the sword's light, light, heavy
    const swapped = [blows[2], blows[0], blows[1]];
    // The heavy moved to the front: one move.
    const moved = setChains(registry, p, { basic: swapped }, { origins: { basic: [2, 0, 1] } });
    expect(moved.profile.manaDust).toBe(99 - E);
    expect(chainsOf(moved.profile).basic).toEqual(swapped);
    // Without origins, in place: the first light became heavy, and the heavy light.
    expect(setChains(registry, p, { basic: swapped }).profile.manaDust).toBe(99 - 2 * E);
    for (const basic of [
      [0, 0, 1],
      [0, 1],
      [0, 1, 3],
      [0, 1, -1],
      [0.5, 1, 2],
    ])
      expect(setChains(registry, p, { basic: swapped }, { origins: { basic } })).toMatchObject({
        ok: false,
        profile: p,
        reason: 'Bad origins',
      });
    // Origins for a skill the edit leaves out are ignored.
    const origins = { basic: [2, 0, 1], primary: [7] };
    expect(setChains(registry, p, { basic: swapped }, { origins }).ok).toBe(true);
  });

  it('the first dive is still free, whatever moved', () => {
    const fresh = createDelveProfile(registry, 3, { primary: 'fire' });
    const blows = chainsOf(fresh).basic!;
    const res = setChains(registry, fresh, { basic: [blows[2]] }, { origins: { basic: [2] } });
    expect(res.profile.manaDust).toBe(0);
  });
});

describe('slots: addSlot', () => {
```

Replace:

```ts
import { CHAIN_SKILLS, type Blow, type Chain, type Move } from '../src/types/ability.js';
```

with:

```ts
import {
  CHAIN_SKILLS,
  type Blow,
  type Chain,
  type Chains,
  type Move,
} from '../src/types/ability.js';
```

Replace:

```ts
  addSlot,
  movesetEditPrice,
  setChain,
```

with:

```ts
  addSlot,
  movesetEditPrice,
  movesOf,
  setChain,
```

- [ ] **Step 2: Run them and watch them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts)`
Expected: FAIL, 4 tests: the identity map (today's pairing calls `[A, B, C] → [A, C]` one removal: `expected 5 to be 25`), the card moved and edited back (`expected +0 to be 5`), the new set charged once (`expected 30 to be 20`), and the swap priced by its origins (`expected 94 to be 89`: today's matching finds the heavy blow's move, but prices the light blows' places too). The rest pass already: the origins the builder sends price as 4a's matching did, and today's price never breaks the triangle either.

- [ ] **Step 3: Price by origin**

In `packages/engine/src/delve/moveset.ts`:

Replace:

```ts
import type { DelveProfile } from '../types/delve.js';
import type { GearItem, Moveset } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
```

with:

```ts
import type { DelveProfile } from '../types/delve.js';
import type { GearItem, Moveset } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import type { ChainOrigins } from '../types/rune.js';
```

Replace the lines from `` /** Index pairs of a longest common subsequence of `a` and `b` (by key). */ `` up to (not including) `` /** What an edit costs `profile`: its price, but nothing before the hero's first dive. */ `` with:

```ts
/**
 * A new chain's origins (see the runes spec): for each of its `moves` moves,
 * the index in the saved chain (`saved` moves) it came from, or null for a new
 * move. `given` is checked: one per move, each a saved index at most once;
 * null when it isn't. Without it, the identity map: move j came from saved
 * move j, if any.
 */
export function chainOrigins(
  saved: number,
  moves: number,
  given?: readonly (number | null)[],
): (number | null)[] | null {
  if (!given) return Array.from({ length: moves }, (_, j) => (j < saved ? j : null));
  if (given.length !== moves) return null;
  const seen = new Set<number>();
  for (const o of given) {
    if (o === null) continue;
    if (!Number.isInteger(o) || o < 0 || o >= saved || seen.has(o)) return null;
    seen.add(o);
  }
  return [...given];
}

/** The length of the longest strictly increasing run in `xs`, in order (at most 5 values). */
function longestRise(xs: readonly number[]): number {
  const best = xs.map(() => 1);
  for (let j = 0; j < xs.length; j++)
    for (let i = 0; i < j; i++) if (xs[i] < xs[j]) best[j] = Math.max(best[j], best[i] + 1);
  return Math.max(0, ...best);
}

/** A move's elements as the price matches them ("fire+storm"). */
function els(m: Move | Blow): string {
  return elementsOf(m).join('+');
}

/** The Mana Dust one chain's edit costs (see `movesetEditPrice`). */
function chainEditPrice(
  registry: DataRegistry,
  old: Chains[ChainSkill] | undefined,
  next: Chains[ChainSkill],
  given?: readonly (number | null)[],
): number {
  const { editDust, elementDust } = registry.getDelveBalance().movesets;
  const was = movesOf(old);
  const now = movesOf(next);
  const origins =
    chainOrigins(was.length, now.length, given) ?? chainOrigins(was.length, now.length)!;
  const kept = origins.filter((o): o is number => o !== null);
  // 1. The moves whose origins rise in order are in place, free; every other one moved.
  let price = (kept.length - longestRise(kept)) * editDust;
  // 2. Each origin pair's changes; 3. each new move, and each saved move none came from.
  const known = new Set(was.map(els));
  const charged = new Set<string>();
  const shape = (x: Move | Blow) => ('form' in x ? `${x.kind}|${x.form}` : x.kind);
  now.forEach((m, j) => {
    const o = origins[j];
    const set = els(m);
    if (o === null) {
      price += editDust;
      if (known.has(set) || charged.has(set)) return;
    } else {
      if (shape(was[o]) !== shape(m)) price += editDust;
      if (set === els(was[o]) || charged.has(set)) return;
    }
    // A new element set: charged once per Apply, however many moves take it.
    charged.add(set);
    price += elementDust;
  });
  price += (was.length - kept.length) * editDust;
  // 4. A changed payment.
  if (old && !Array.isArray(old) && !Array.isArray(next) && old.payment !== next.payment)
    price += editDust;
  return price;
}

/**
 * The Mana Dust turning `old` into `next` costs, over every chain `next`
 * holds (see the runes spec, which retires 4a's matching by what moves are):
 * each new move is priced against the saved move it came from (`origins`;
 * missing, the identity map). The moves whose origins rise in order are in
 * place, free; every other one moved, `editDust`. A pair whose kind or form
 * changed costs `editDust`, whose elements changed `elementDust`; a new move
 * `editDust`, and a saved move none came from `editDust`; an element set is
 * charged `elementDust` once per Apply however many moves take it (a new
 * move's only when no saved move has it); a changed payment costs `editDust`.
 * Runes are no part of it (`moveKey` ignores them). Origins for a chain
 * `next` doesn't hold are ignored, and bad origins price as the identity map
 * (`setChains` refuses them first). The caller applies the first-dive freebie.
 */
export function movesetEditPrice(
  registry: DataRegistry,
  old: Partial<Chains>,
  next: Partial<Chains>,
  origins?: ChainOrigins,
): number {
  return CHAIN_SKILLS.reduce((sum, skill) => {
    const chain = next[skill];
    return chain ? sum + chainEditPrice(registry, old[skill], chain, origins?.[skill]) : sum;
  }, 0);
}

```

Replace the lines from `` /** What an edit costs `profile`: its price, but nothing before the hero's first dive. */ `` up to (not including) `` /** How many moves of `chain` hold each element set outside the pair ("fire+nature"). */ `` with:

```ts
/** What an edit costs `profile`: its price (by `origins`), but nothing before the hero's first dive. */
export function editPrice(
  registry: DataRegistry,
  profile: DelveProfile,
  next: Partial<Chains>,
  origins?: ChainOrigins,
): number {
  const weapon = profile.equipped.weapon;
  if (!weapon || profile.stats.dives === 0) return 0;
  return movesetEditPrice(registry, movesetOf(registry, weapon).chains, next, origins);
}

```

Replace the lines from `* Set several of the equipped weapon's chains at once, for Mana Dust` up to (not including) `` /** Set one of the equipped weapon's chains (`setChains` with one). */ `` with:

```ts
 * Set several of the equipped weapon's chains at once, for Mana Dust
 * (`editPrice`, by `opts.origins`): all or nothing. Refuses mid-dive, unarmed,
 * and when any chain is refused (a skill the weapon doesn't carry; fewer than
 * one move or more than its slots; an unknown kind, a form from another slot,
 * anything but one or two different known elements, an unknown payment; an
 * element set outside the pair held more times than before; or bad origins)
 * or the total can't be paid.
 */
export function setChains(
  registry: DataRegistry,
  profile: DelveProfile,
  chains: Partial<Chains>,
  opts: SetChainsOptions = {},
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, BETWEEN_DIVES);
  const weapon = profile.equipped.weapon;
  if (!weapon) return refuse(profile, UNARMED_TEXT);
  const moveset = movesetOf(registry, weapon);
  const next = { ...moveset.chains };
  for (const skill of CHAIN_SKILLS) {
    const chain = chains[skill];
    if (!chain) continue;
    const reason = chainRefusal(registry, profile, moveset, skill, chain);
    if (reason) return refuse(profile, reason);
    const saved = movesOf(moveset.chains[skill]).length;
    if (!chainOrigins(saved, movesOf(chain).length, opts.origins?.[skill]))
      return refuse(profile, 'Bad origins');
    (next as Record<ChainSkill, unknown>)[skill] = copyChain(chain);
  }
  const price = editPrice(registry, profile, chains, opts.origins);
  if (profile.manaDust < price) return refuse(profile, 'Not enough Mana Dust');
  const edited = withMoveset(profile, { ...moveset, chains: next });
  return { ok: true, profile: { ...edited, manaDust: profile.manaDust - price } };
}

```

- [ ] **Step 4: Run them and watch them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts)`
Expected: PASS (64 tests).

Run: `(cd packages/engine && npx vitest run)` and `(cd packages/engine && npx tsc --noEmit -p .)`
Expected: every test passes; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/delve/moveset.ts packages/engine/tests/delve-movesets.test.ts
git add packages/engine/src/delve/moveset.ts packages/engine/tests/delve-movesets.test.ts
git commit -m "feat(engine): moves have identity: Mana Dust priced by origin, the identity map by default" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The draft's rune price

### Task 5: The draft's rune price: sockets and runes through `setChains`

Socketing, pulling and opening sockets go through the draft with every other move edit, and Apply settles them all in `setChains` (spec: "The rune diff", "What each costs", "Refusals"). `runeChange(registry, profile, chains, opts)` diffs each new move against the saved move it came from (the same origins as the Dust, identity when missing):
- sockets past the saved move's are **opened**, each `socketLinks[i]` Links and `socketScrap[i]` scrap by its index `i`;
- at each socket index both have, the same rune (id and tier) is unchanged; otherwise the old rune is **pulled** and the new one **socketed**;
- a saved move no new move came from is **removed**: its sockets come back as Links (`refundLinks`, one each), its runes are pulled;
- a new move starts at 0 sockets, so all of its are opened.

Socketing is free (out of the pouch); a pull is free and destroys the rune in `destroy`, or costs `pullScrap[tier − 1]` and returns it in `pay`. The pouch must hold what is socketed, `socketed − (pay ? pulled : 0)`, rune by rune. Refusals, all or nothing with 4a's: bad origins; more sockets than the weapon rarity's cap; fewer sockets on a kept move (`Sockets can't be closed`); the same rune twice on one move at any tier (`A move takes one Split`); a rune that doesn't fit its move's form or weapon (`Split doesn't fit a Lance`, `Widen doesn't fit Bow blows`), so a form change is refused while a socketed rune wouldn't fit it, while kind and element changes keep runes; an unknown rune; and not enough runes, net Links (`links − refundLinks`) or scrap. `draftPrice` is the builder's one total from the same functions: `{ dust, links, scrap, refundLinks, destroys, returns }`. `sameChain` compares the sockets too, so a rune-only change makes the draft dirty.

The task ends with the Links probe over random edit sequences (origins composed, both modes): one Apply for the lot is never dearer in Links than an Apply per edit, and costs exactly the same when no move is removed. (With removals a batch can be cheaper: a removed move refunds one Link a socket, so a socket opened past the first and removed again costs the steps a Link or two and the batch nothing. The spec's "never cheaper or dearer" holds only without removals; see **Spec notes**.)

**Files:**
- Modify: `packages/engine/src/delve/runes.ts` (`runeTargetOf`, `runeChange`, `draftPrice`)
- Modify: `packages/engine/src/delve/moveset.ts` (`sameChain`, `copyChain`, `setChains`)
- Modify: `packages/engine/tests/delve-runes.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-runes.test.ts`:

Replace:

```ts
import { transferMoveset } from '../src/delve/moveset.js';
```

with:

```ts
import { sameChain, setChains, transferMoveset } from '../src/delve/moveset.js';
```

Replace:

```ts
import { unsocketMode } from '../src/delve/runes.js';
```

with:

```ts
import { draftPrice, unsocketMode } from '../src/delve/runes.js';
```

Replace:

```ts
import { CHAIN_SKILLS, type Blow, type Move } from '../src/types/ability.js';
```

with:

```ts
import { CHAIN_SKILLS, type Blow, type Chain, type Move } from '../src/types/ability.js';
```

Replace:

```ts
import { bal, registry } from './fixtures/arena.js';
```

with:

```ts
import { bal, chainsOf, registry } from './fixtures/arena.js';
```

Append at the end of the file:

```ts
const QUICK_II: RuneRef = { id: 'quick', tier: 2 };
const CHAIN_I: RuneRef = { id: 'chain', tier: 1 };

/** `c` with move `i`'s sockets set to `runes`. */
function withRunes(c: Chain, i: number, runes: (RuneRef | null)[]): Chain {
  return { ...c, moves: c.moves.map((m, j) => (j === i ? { ...m, runes } : m)) };
}

/**
 * A Storm hero past its first dive with 10 Links, 500 scrap and 100 Mana Dust,
 * wielding an epic bow (3 sockets a move) whose Primary is three Bolts: the
 * first holds Split I and an empty socket, the second Quick II, the third
 * none. Its pouch: two Split I, a Chain I and an Echo I.
 */
function ready(): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'storm' });
  const slots = { basic: 3, primary: 3, defensive: 1, ultimate: 1 };
  const bow = slotted({ ...weapon('epic', 6, 'bow'), uid: 'bow' }, slots);
  const primary = bow.moveset!.chains.primary!;
  primary.moves[0] = { ...primary.moves[0], runes: [SPLIT_I, null] };
  primary.moves[1] = { ...primary.moves[1], runes: [QUICK_II] };
  return {
    ...p,
    equipped: { ...p.equipped, weapon: bow },
    links: 10,
    scrap: 500,
    manaDust: 100,
    stats: { ...p.stats, dives: 1 },
    runes: { split: [2, 0, 0, 0, 0], chain: [1, 0, 0, 0, 0], echo: [1, 0, 0, 0, 0] },
  };
}

/** The hero's Primary chain. */
const primaryOf = (q: DelveProfile) => chainsOf(q).primary!;

describe('the draft: sockets and runes through setChains', () => {
  const E = bal.movesets.editDust;
  const PAY = { unsocket: 'pay' as const };

  it('opens sockets for Links and scrap by their index; socketing is free, out of the pouch', () => {
    const p = ready();
    // Move 2's first socket, Chain I in it; move 1's second socket, left empty.
    const c = withRunes(withRunes(primaryOf(p), 2, [CHAIN_I]), 1, [QUICK_II, null]);
    expect(draftPrice(registry, p, { primary: c })).toEqual({
      dust: 0,
      links: 1 + 2,
      scrap: 20 + 40,
      refundLinks: 0,
      destroys: [],
      returns: [],
    });
    const res = setChains(registry, p, { primary: c });
    expect(res).toMatchObject({ ok: true, runes: [], destroyed: [] });
    expect(res.profile).toMatchObject({ links: 7, scrap: 440, manaDust: 100 });
    expect(res.profile.runes.chain).toEqual([0, 0, 0, 0, 0]);
    expect(primaryOf(res.profile).moves.map((m) => m.runes)).toEqual([
      [SPLIT_I, null],
      [QUICK_II, null],
      [CHAIN_I],
    ]);
    expect(R.socketLinks).toEqual([1, 2, 3]);
    expect(R.socketScrap).toEqual([20, 40, 60]);
  });

  it('a pull follows the mode: destroy is free and the rune is gone; pay costs its tier and returns it', () => {
    const p = ready();
    const c = withRunes(primaryOf(p), 1, [null]);
    expect(draftPrice(registry, p, { primary: c })).toMatchObject({
      scrap: 0,
      destroys: [QUICK_II],
      returns: [],
    });
    const gone = setChains(registry, p, { primary: c });
    expect(gone).toMatchObject({ ok: true, runes: [], destroyed: [QUICK_II] });
    expect(gone.profile.scrap).toBe(500);
    expect(gone.profile.runes).toEqual(p.runes);
    expect(R.pullScrap).toEqual([15, 30, 50, 80, 120]);
    expect(draftPrice(registry, p, { primary: c }, PAY)).toMatchObject({
      scrap: 30,
      destroys: [],
      returns: [QUICK_II],
    });
    const paid = setChains(registry, p, { primary: c }, PAY);
    expect(paid).toMatchObject({ ok: true, runes: [QUICK_II], destroyed: [] });
    expect(paid.profile.scrap).toBe(470);
    expect(paid.profile.runes.quick).toEqual([0, 1, 0, 0, 0]);
    // Overwriting is a pull and a socket: Quick II out, Echo I in from the pouch.
    const over = setChains(registry, p, { primary: withRunes(primaryOf(p), 1, [ECHO_I]) });
    expect(over).toMatchObject({ ok: true, destroyed: [QUICK_II] });
    expect(over.profile.runes.echo).toEqual([0, 0, 0, 0, 0]);
  });

  it('reordering carries the runes; a removed move gives its sockets back, netted against those opened', () => {
    const p = ready();
    const [m0, m1, m2] = primaryOf(p).moves;
    const swapped = { ...primaryOf(p), moves: [m1, m0, m2] };
    const moved = setChains(registry, p, { primary: swapped }, { origins: { primary: [1, 0, 2] } });
    expect(moved).toMatchObject({ ok: true, destroyed: [] });
    expect(moved.profile).toMatchObject({ links: 10, scrap: 500, manaDust: 100 - E });
    expect(primaryOf(moved.profile).moves.map((m) => m.runes)).toEqual([
      [QUICK_II],
      [SPLIT_I, null],
      undefined,
    ]);
    // Read in place, the same chain would close move 0's second socket.
    expect(draftPrice(registry, p, { primary: swapped })).toEqual({
      refused: "Sockets can't be closed",
    });
    // Move 0 removed (2 sockets back, Split I pulled), move 2's first socket opened.
    const removed = { ...primaryOf(p), moves: [m1, { ...m2, runes: [null] }] };
    const origins = { primary: [1, 2] };
    expect(draftPrice(registry, p, { primary: removed }, { origins })).toEqual({
      dust: E,
      links: 1,
      scrap: 20,
      refundLinks: 2,
      destroys: [SPLIT_I],
      returns: [],
    });
    const res = setChains(registry, p, { primary: removed }, { origins });
    expect(res.profile).toMatchObject({ links: 10 - 1 + 2, scrap: 480, manaDust: 100 - E });
    // The refund pays for the socket: a hero with no Links can still do it.
    expect(setChains(registry, { ...p, links: 0 }, { primary: removed }, { origins }).ok).toBe(
      true,
    );
  });

  it('a rune that changes moves is a pull plus a socket: destroy needs another in the pouch, pay can re-socket it', () => {
    const p = ready();
    const [m0, m1, m2] = primaryOf(p).moves;
    const c = {
      ...primaryOf(p),
      moves: [{ ...m0, runes: [null, null] }, m1, { ...m2, runes: [SPLIT_I] }],
    };
    expect(draftPrice(registry, p, { primary: c })).toEqual({
      dust: 0,
      links: 1,
      scrap: 20,
      refundLinks: 0,
      destroys: [SPLIT_I],
      returns: [],
    });
    const res = setChains(registry, p, { primary: c });
    expect(res.profile.runes.split).toEqual([1, 0, 0, 0, 0]);
    const empty = { ...p, runes: {} };
    expect(setChains(registry, empty, { primary: c })).toMatchObject({
      ok: false,
      profile: empty,
      reason: 'Not enough runes in your pouch',
    });
    const paid = setChains(registry, empty, { primary: c }, PAY);
    expect(paid).toMatchObject({ ok: true, runes: [SPLIT_I] });
    expect(paid.profile).toMatchObject({ scrap: 500 - 20 - 15, runes: { split: [0, 0, 0, 0, 0] } });
  });

  it('refuses past the cap, a closed socket, a rune twice, one that does not fit or is unknown, and bad origins', () => {
    const p = ready();
    const c = primaryOf(p);
    const reason = (next: Chain, opts = {}) => {
      const res = setChains(registry, p, { primary: next }, opts);
      expect(res.profile).toBe(p);
      return res.reason;
    };
    expect(reason(withRunes(c, 2, [null, null, null, null]))).toBe(
      "This weapon's moves hold at most 3 sockets",
    );
    expect(reason(withRunes(c, 0, [SPLIT_I]))).toBe("Sockets can't be closed");
    expect(reason(withRunes(c, 0, [SPLIT_I, { id: 'split', tier: 2 }]))).toBe(
      'A move takes one Split',
    );
    expect(reason(withRunes(c, 2, [{ id: 'widen', tier: 1 }]))).toBe("Widen doesn't fit a Bolt");
    expect(reason(withRunes(c, 2, [{ id: 'nope', tier: 1 }]))).toBe('Unknown rune nope');
    expect(reason(c, { origins: { primary: [0, 0, 1] } })).toBe('Bad origins');
    // A form change is refused while a socketed rune wouldn't fit it.
    const lance = {
      ...c,
      moves: c.moves.map((m, i) => (i === 0 ? { ...m, form: 'lance' as const } : m)),
    };
    expect(reason(lance)).toBe("Split doesn't fit a Lance");
    // A kind or element change keeps the runes.
    const heavy = {
      ...c,
      moves: c.moves.map((m, i) => (i === 0 ? { ...m, kind: 'heavy' as const } : m)),
    };
    expect(setChains(registry, p, { primary: heavy }).ok).toBe(true);
    // Blows: a rune must fit the weapon's.
    const blows = chainsOf(p).basic!;
    const widened = blows.map((b, i) =>
      i === 0 ? { ...b, runes: [{ id: 'widen', tier: 1 as const }] } : b,
    );
    expect(setChains(registry, p, { basic: widened }).reason).toBe("Widen doesn't fit Bow blows");
    // All or nothing: a good Primary and a bad basic chain change nothing.
    const good = withRunes(c, 2, [CHAIN_I]);
    expect(setChains(registry, p, { primary: good, basic: widened })).toMatchObject({
      ok: false,
      profile: p,
    });
    // Short of Links or scrap.
    expect(setChains(registry, { ...p, links: 0 }, { primary: good }).reason).toBe(
      'Not enough Links',
    );
    expect(setChains(registry, { ...p, scrap: 19 }, { primary: good }).reason).toBe(
      'Not enough scrap',
    );
  });

  it('sameChain sees the sockets: a rune-only change is a change', () => {
    const c = primaryOf(ready());
    expect(sameChain(c, withRunes(c, 2, []))).toBe(true);
    expect(sameChain(c, withRunes(c, 2, [null]))).toBe(false);
    expect(sameChain(c, withRunes(c, 1, [{ id: 'quick', tier: 3 }]))).toBe(false);
    expect(sameChain(c, withRunes(c, 1, [QUICK_II]))).toBe(true);
  });

  it('nets Links: a batch is never dearer than its edits one Apply at a time, and the same when it removes no move (random edits, origins composed)', () => {
    const rng = new SeededRNG(21);
    const fits = registry.getRunes().filter((d) => runeFits(d, { form: 'bolt' }));
    const pouch = Object.fromEntries(registry.getRunes().map((d) => [d.id, [50, 50, 50, 50, 50]]));
    /** One edit as the builder makes it: the new chain, and each new move's index in `c` (null: new). */
    const randomEdit = (c: Chain, remove: boolean): { next: Chain; map: (number | null)[] } => {
      const moves = c.moves.map((m) => ({ ...m }));
      const map: (number | null)[] = moves.map((_, i) => i);
      const i = rng.nextInt(0, moves.length - 1);
      const sockets = [...socketsOf(moves[i])];
      switch (rng.nextInt(0, 5)) {
        case 0:
          if (remove && moves.length > 1) [moves, map].forEach((xs) => xs.splice(i, 1));
          break;
        case 1:
          if (i + 1 < moves.length) {
            [moves[i], moves[i + 1]] = [moves[i + 1], moves[i]];
            [map[i], map[i + 1]] = [map[i + 1], map[i]];
          }
          break;
        case 2:
          if (moves.length < 3) {
            moves.push({ kind: 'light', form: 'bolt', elements: ['storm'] });
            map.push(null);
          }
          break;
        case 3:
          if (sockets.length < 3) moves[i].runes = [...sockets, null];
          break;
        case 4: {
          const def = fits[rng.nextInt(0, fits.length - 1)];
          const at = sockets.indexOf(null);
          if (at >= 0 && !sockets.some((r) => r?.id === def.id)) {
            sockets[at] = { id: def.id, tier: rng.nextInt(1, 5) as RuneRef['tier'] };
            moves[i].runes = sockets;
          }
          break;
        }
        case 5: {
          const at = sockets.findIndex((r) => r !== null);
          if (at >= 0) {
            sockets[at] = null;
            moves[i].runes = sockets;
          }
          break;
        }
      }
      return { next: { ...c, moves }, map };
    };
    for (let n = 0; n < 300; n++) {
      const unsocket = n % 2 === 0 ? 'destroy' : 'pay';
      // A removed move refunds one Link a socket, so a socket opened past the first and removed
      // in the same batch costs the batch nothing but the steps a Link or two: never dearer.
      const remove = n % 4 < 2;
      const start = { ...ready(), links: 999, scrap: 99999, manaDust: 9999, runes: pouch };
      let step = start;
      let chain = primaryOf(start);
      let origins: (number | null)[] = chain.moves.map((_, i) => i);
      for (let k = 0; k < 8; k++) {
        const { next, map } = randomEdit(chain, remove);
        const opts = { origins: { primary: map }, unsocket };
        const res = setChains(registry, step, { primary: next }, opts);
        expect(res.ok).toBe(true);
        step = res.profile;
        chain = next;
        origins = map.map((o) => (o === null ? null : origins[o]));
      }
      const opts = { origins: { primary: origins }, unsocket };
      const batch = setChains(registry, start, { primary: chain }, opts);
      expect(batch.ok).toBe(true);
      if (remove) expect(batch.profile.links).toBeGreaterThanOrEqual(step.links);
      else expect(batch.profile.links).toBe(step.links);
      expect(primaryOf(batch.profile)).toEqual(primaryOf(step));
    }
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts)`
Expected: FAIL, 6 of 21: `draftPrice` throws `not built yet` (the stub Task 2 kept), `setChains` charges no Links or scrap for sockets and gives no `destroyed` (`expected { ok: true, …(1) } to match object { ok: true, destroyed: [] }`), refuses nothing about runes (the refusal test's `expect(res.profile).toBe(p)` fails on the first one it lets through), and `sameChain` ignores the sockets (`expected true to be false`). The Links probe passes already: today's `setChains` moves no Links either way.

- [ ] **Step 3: Price the runes in the draft**

In `packages/engine/src/delve/runes.ts`:

Replace:

```ts
import type { DataRegistry } from '../data/registry.js';
import { addToPouch } from '../loot/runes.js';
import type { Chains, ChainSkill } from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { ChainOrigins, RunePouch, RuneRef, UnsocketMode } from '../types/rune.js';
import type { ProfileActionResult } from './profile.js';
```

with:

```ts
import type { DataRegistry } from '../data/registry.js';
import { movesetOf } from '../loot/moveset.js';
import {
  addToPouch,
  runeFits,
  socketCap,
  socketPrice,
  socketsOf,
  takeFromPouch,
} from '../loot/runes.js';
import {
  CHAIN_SKILLS,
  type Blow,
  type Chains,
  type ChainSkill,
  type Move,
} from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem } from '../types/gear.js';
import {
  RUNE_TIERS,
  type ChainOrigins,
  type RunePouch,
  type RuneRef,
  type RuneTarget,
  type UnsocketMode,
} from '../types/rune.js';
import { chainOrigins, editPrice, movesOf } from './moveset.js';
import type { ProfileActionResult } from './profile.js';
```

Replace the lines from `export function runeChange(` up to (not including) `export function openSocket(` with:

```ts
const UNARMED_TEXT = 'Equip a weapon to build your moves';

/** What a rune on `m` sits on: an ability move's form, or a blow of the `baseId` weapon. */
export function runeTargetOf(baseId: string | null, m: Move | Blow): RuneTarget {
  return 'form' in m ? { form: m.form } : { weapon: baseId, kind: m.kind };
}

/** Whether two sockets hold the same: both empty, or one rune at one tier. */
function sameRune(a: RuneRef | null, b: RuneRef | null): boolean {
  return a?.id === b?.id && a?.tier === b?.tier;
}

/** What a rune doesn't fit, in a refusal: "a Bolt", "an Armor", "Bow blows". */
function fitName(registry: DataRegistry, baseId: string | null, m: Move | Blow): string {
  if (!('form' in m)) return `${baseId ? registry.getGearBase(baseId).name : 'Unarmed'} blows`;
  const name = registry.getForm(m.form).name;
  return `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
}

/**
 * Why `m`'s sockets can't be on `weapon`, or null: more than its rarity's cap,
 * an unknown rune (or tier), the same rune twice at any tier, or a rune that
 * doesn't fit the move's form or the weapon's blows.
 */
function socketRefusal(registry: DataRegistry, weapon: GearItem, m: Move | Blow): string | null {
  const sockets = socketsOf(m);
  const cap = socketCap(registry, weapon.rarity);
  if (sockets.length > cap)
    return `This weapon's moves hold at most ${cap} socket${cap === 1 ? '' : 's'}`;
  const seen = new Set<string>();
  for (const r of sockets) {
    if (!r) continue;
    const def = registry.findRune(r.id);
    if (!def || !Number.isInteger(r.tier) || r.tier < 1 || r.tier > RUNE_TIERS)
      return `Unknown rune ${r.id}`;
    if (seen.has(r.id)) return `A move takes one ${def.name}`;
    seen.add(r.id);
    if (!runeFits(def, runeTargetOf(weapon.baseId, m)))
      return `${def.name} doesn't fit ${fitName(registry, weapon.baseId, m)}`;
  }
  return null;
}

/**
 * What the draft `chains` does to the equipped weapon's sockets (see the runes
 * spec), each new move against the saved move it came from (`opts.origins`;
 * missing, the identity map): sockets past the saved move's are opened, each
 * priced by its index (`socketPrice`); at each socket both have, a different
 * rune is a pull and a socket; a saved move no new move came from gives its
 * sockets back (`refundLinks`, netted against `links`) and its runes are
 * pulled; a new move opens all of its. A pull costs `pullScrap` in 'pay'
 * (`opts.unsocket`, else the balance's). Refuses unarmed, bad origins, a
 * socket refusal (`socketRefusal`), fewer sockets on a kept move, and a pouch
 * that can't hold what is socketed (in 'pay', what is pulled goes back first).
 * Chains `chains` doesn't hold, and their origins, are left out.
 */
export function runeChange(
  registry: DataRegistry,
  profile: DelveProfile,
  chains: Partial<Chains>,
  opts: SetChainsOptions = {},
): RuneChange | { refused: string } {
  const weapon = profile.equipped.weapon;
  if (!weapon) return { refused: UNARMED_TEXT };
  const { pullScrap } = registry.getDelveBalance().runes;
  const pay = unsocketMode(registry, opts.unsocket) === 'pay';
  const saved = movesetOf(registry, weapon).chains;
  const change: RuneChange = { links: 0, scrap: 0, refundLinks: 0, socketed: [], pulled: [] };
  const add = (into: RuneRef[], r: RuneRef | null) => {
    if (r) into.push({ id: r.id, tier: r.tier });
  };
  for (const skill of CHAIN_SKILLS) {
    const chain = chains[skill];
    if (!chain) continue;
    const was = movesOf(saved[skill]);
    const now = movesOf(chain);
    const origins = chainOrigins(was.length, now.length, opts.origins?.[skill]);
    if (!origins) return { refused: 'Bad origins' };
    for (const [j, m] of now.entries()) {
      const why = socketRefusal(registry, weapon, m);
      if (why) return { refused: why };
      const o = origins[j];
      const old = o === null ? [] : socketsOf(was[o]);
      const next = socketsOf(m);
      if (next.length < old.length) return { refused: "Sockets can't be closed" };
      next.forEach((r, i) => {
        if (i >= old.length) {
          const price = socketPrice(registry, i)!;
          change.links += price.links;
          change.scrap += price.scrap;
          add(change.socketed, r);
        } else if (!sameRune(old[i], r)) {
          add(change.pulled, old[i]);
          add(change.socketed, r);
        }
      });
    }
    const from = new Set(origins);
    was.forEach((m, i) => {
      if (from.has(i)) return;
      change.refundLinks += socketsOf(m).length;
      for (const r of socketsOf(m)) add(change.pulled, r);
    });
  }
  if (pay) for (const r of change.pulled) change.scrap += pullScrap[r.tier - 1];
  const pouch = pay ? addToPouch(profile.runes, change.pulled) : profile.runes;
  if (!takeFromPouch(pouch, change.socketed)) return { refused: 'Not enough runes in your pouch' };
  return change;
}

/**
 * The draft's one total, as Apply would charge it (see the runes spec): the
 * Mana Dust (`editPrice`, by the origins), the Links and scrap the sockets and
 * pulls cost (`runeChange`), the Links removed moves give back, and the runes
 * a pull destroys ('destroy') or returns ('pay'); or why Apply would refuse.
 */
export function draftPrice(
  registry: DataRegistry,
  profile: DelveProfile,
  chains: Partial<Chains>,
  opts: SetChainsOptions = {},
): DraftPrice | { refused: string } {
  const change = runeChange(registry, profile, chains, opts);
  if ('refused' in change) return change;
  const pay = unsocketMode(registry, opts.unsocket) === 'pay';
  return {
    dust: editPrice(registry, profile, chains, opts.origins),
    links: change.links,
    scrap: change.scrap,
    refundLinks: change.refundLinks,
    destroys: pay ? [] : change.pulled,
    returns: pay ? change.pulled : [],
  };
}

```

In `packages/engine/src/delve/moveset.ts`:

Replace:

```ts
import { settleParts, type SetChainsOptions } from './runes.js';
```

with:

```ts
import { runeChange, settleParts, type SetChainsOptions } from './runes.js';
import { socketsOf, takeFromPouch } from '../loot/runes.js';
```

Replace the lines from `` /** Whether two chains hold the same moves in order (by `moveKey`) and the same payment. */ `` up to (not including) `` /** `chain` with move `index` replaced by `move` (its payment kept). */ `` with:

```ts
/** Whether two moves hold the same sockets: each empty in both, or the same rune at the same tier. */
function sameSockets(a: Move | Blow, b: Move | Blow): boolean {
  const [x, y] = [socketsOf(a), socketsOf(b)];
  return x.length === y.length && x.every((r, i) => r?.id === y[i]?.id && r?.tier === y[i]?.tier);
}

/**
 * Whether two chains hold the same moves in order (by `moveKey`), with the
 * same sockets (see the runes spec), and the same payment.
 */
export function sameChain(
  a: Chains[ChainSkill] | undefined,
  b: Chains[ChainSkill] | undefined,
): boolean {
  if (!a || !b) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const [x, y] = [movesOf(a), movesOf(b)];
  if (!Array.isArray(a) && (a as Chain).payment !== (b as Chain).payment) return false;
  return (
    x.length === y.length && x.every((m, i) => moveKey(m) === moveKey(y[i]) && sameSockets(m, y[i]))
  );
}

```

Replace:

```ts
/** A chain copied, so the save never shares arrays with the caller. */
function copyChain(chain: Chains[ChainSkill]): Chains[ChainSkill] {
  if (Array.isArray(chain)) return chain.map((b) => ({ ...b }));
  const moves = chain.moves.map((m) => ({ ...m, elements: [...m.elements] }));
  return { moves, payment: chain.payment };
}
```

with:

```ts
/** A chain copied, its sockets too, so the save never shares arrays with the caller. */
function copyChain(chain: Chains[ChainSkill]): Chains[ChainSkill] {
  const copy = <M extends Move | Blow>(m: M): M =>
    m.runes ? { ...m, runes: m.runes.map((r) => r && { ...r }) } : { ...m };
  if (Array.isArray(chain)) return chain.map(copy);
  const moves = chain.moves.map((m) => ({ ...copy(m), elements: [...m.elements] }));
  return { moves, payment: chain.payment };
}
```

Replace the lines from `* Set several of the equipped weapon's chains at once, for Mana Dust` up to (not including) `` /** Set one of the equipped weapon's chains (`setChains` with one). */ `` with:

```ts
 * Set several of the equipped weapon's chains at once: all or nothing (see
 * the runes spec). Mana Dust by origin (`editPrice`, by `opts.origins`), and
 * the sockets' Links and scrap and the runes in and out (`runeChange`; a pull
 * by `opts.unsocket`): the hero's Links become `links − change.links +
 * change.refundLinks`, the netted amount, whatever order the edits were made
 * in (never dearer than the same edits one by one). Refuses mid-dive, unarmed,
 * when any chain is refused (a skill the weapon doesn't carry; fewer than one
 * move or more than its slots; an unknown kind, a form from another slot,
 * anything but one or two different known elements, an unknown payment; an
 * element set outside the pair held more times than before; or bad origins),
 * when the runes are refused (`runeChange`), and when the Dust, the net Links
 * or the scrap can't be paid. Its result lists the runes pulled back to the
 * pouch (`runes`) and those destroyed (`destroyed`).
 */
export function setChains(
  registry: DataRegistry,
  profile: DelveProfile,
  chains: Partial<Chains>,
  opts: SetChainsOptions = {},
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, BETWEEN_DIVES);
  const weapon = profile.equipped.weapon;
  if (!weapon) return refuse(profile, UNARMED_TEXT);
  const moveset = movesetOf(registry, weapon);
  const next = { ...moveset.chains };
  for (const skill of CHAIN_SKILLS) {
    const chain = chains[skill];
    if (!chain) continue;
    const reason = chainRefusal(registry, profile, moveset, skill, chain);
    if (reason) return refuse(profile, reason);
    const saved = movesOf(moveset.chains[skill]).length;
    if (!chainOrigins(saved, movesOf(chain).length, opts.origins?.[skill]))
      return refuse(profile, 'Bad origins');
    (next as Record<ChainSkill, unknown>)[skill] = copyChain(chain);
  }
  const change = runeChange(registry, profile, chains, opts);
  if ('refused' in change) return refuse(profile, change.refused);
  const price = editPrice(registry, profile, chains, opts.origins);
  if (profile.manaDust < price) return refuse(profile, 'Not enough Mana Dust');
  if (profile.links < change.links - change.refundLinks) return refuse(profile, 'Not enough Links');
  if (profile.scrap < change.scrap) return refuse(profile, 'Not enough scrap');
  const settled = settleParts(registry, profile.runes, change.pulled, opts.unsocket);
  const runes = takeFromPouch(settled.pouch, change.socketed);
  if (!runes) return refuse(profile, 'Not enough runes in your pouch');
  const edited = withMoveset(profile, { ...moveset, chains: next });
  return {
    ok: true,
    runes: settled.runes,
    destroyed: settled.destroyed,
    profile: {
      ...edited,
      manaDust: profile.manaDust - price,
      links: profile.links - change.links + change.refundLinks,
      scrap: profile.scrap - change.scrap,
      runes,
    },
  };
}

```

- [ ] **Step 4: Run them and watch them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts tests/delve-movesets.test.ts tests/delve-stops.test.ts)`
Expected: PASS (21 in `delve-runes.test.ts`).

Run: `(cd packages/engine && npx vitest run)` and `(cd packages/engine && npx tsc --noEmit -p .)`
Expected: every test passes; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/delve/runes.ts packages/engine/src/delve/moveset.ts packages/engine/tests/delve-runes.test.ts
git add packages/engine/src/delve/runes.ts packages/engine/src/delve/moveset.ts packages/engine/tests/delve-runes.test.ts
git commit -m "feat(engine): the draft prices sockets and runes: opened by index, pulls by the mode, Links netted" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 5: The single ops, and the world's drops

### Task 6: Opening a socket, socketing a rune, and fusing three into one

The single ops on top of the draft (spec: "Sockets and their price", "Fusing", the contract's `delve/runes.ts`):
- **`openSocket(registry, profile, skill, index)`**: the next socket on the equipped weapon's move, one `setChains` in place, so it costs `socketLinks[n]` Links and `socketScrap[n]` scrap by the sockets `n` the move has. Refuses mid-dive, unarmed, a skill the weapon doesn't carry, a move the chain doesn't hold, at the rarity's cap (`This move has every socket`), and when it can't be paid.
- **`socketRune(registry, profile, skill, index, socket, rune, opts?)`**: a pouch rune into open socket `socket`, one `setChains` in place (a rune already there is pulled by `opts.unsocket`). Refuses a socket not yet open (`Open this socket first`), and everything `setChains` refuses (a rune that doesn't fit, one already on the move, one the pouch doesn't hold).
- **`fusePrice(registry, ref)`**: `fuseScrap[tier − 1]` (20, 40, 80, 160), null at tier V.
- **`fuseRunes(registry, profile, ref)`**: `fuseCount` (3) of `ref` into one of the next tier, for `fusePrice`; nothing rolled. Refuses mid-dive with the forge (`Forge at the Anvil, between dives`), an unknown rune, tier V, and a pouch or scrap short of it.

The task's last test is the dive lock for every op that moves sockets or runes, in both phases of a dive (`fighting` and the door screen's `choosing`), with the choice of mana still open.

**Files:**
- Modify: `packages/engine/src/delve/runes.ts` (`openSocket`, `socketRune`, `fusePrice`, `fuseRunes`)
- Modify: `packages/engine/tests/delve-runes.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-runes.test.ts`:

Replace:

```ts
import { draftPrice, unsocketMode } from '../src/delve/runes.js';
```

with:

```ts
import {
  draftPrice,
  fusePrice,
  fuseRunes,
  openSocket,
  socketRune,
  unsocketMode,
} from '../src/delve/runes.js';
```

Replace:

```ts
  setAutoSalvage,
} from '../src/delve/profile.js';
```

with:

```ts
  setAutoSalvage,
  unequipSlot,
} from '../src/delve/profile.js';
```

Append at the end of the file:

```ts
describe('opening a socket, socketing a rune, fusing', () => {
  it("opens a move's next socket for Links and scrap by its index, up to the rarity's cap", () => {
    const p = ready();
    const one = openSocket(registry, p, 'primary', 2);
    expect(one.ok).toBe(true);
    expect(one.profile).toMatchObject({ links: 9, scrap: 480, manaDust: 100 });
    expect(primaryOf(one.profile).moves[2].runes).toEqual([null]);
    // Move 0 has two: its third costs 3 Links and 60 scrap, and then it has every socket.
    const three = openSocket(registry, one.profile, 'primary', 0);
    expect(three.profile).toMatchObject({ links: 6, scrap: 420 });
    expect(openSocket(registry, three.profile, 'primary', 0).reason).toBe(
      'This move has every socket',
    );
    // A blow takes them too.
    expect(chainsOf(openSocket(registry, p, 'basic', 1).profile).basic![1].runes).toEqual([null]);
    expect(openSocket(registry, { ...p, links: 0 }, 'primary', 2).reason).toBe('Not enough Links');
    expect(openSocket(registry, { ...p, scrap: 0 }, 'primary', 2).reason).toBe('Not enough scrap');
    expect(openSocket(registry, p, 'primary', 3).reason).toBe('Pick a move the chain holds');
    // A common weapon: one socket a move, and no Defensive.
    const fresh = { ...createDelveProfile(registry, 3, { primary: 'fire' }), links: 9, scrap: 999 };
    const opened = openSocket(registry, fresh, 'primary', 0).profile;
    expect(openSocket(registry, opened, 'primary', 0).reason).toBe('This move has every socket');
    expect(openSocket(registry, fresh, 'defensive', 0).reason).toBe(
      'Carried by magic weapons and better',
    );
    expect(openSocket(registry, unequipSlot(registry, fresh, 'weapon'), 'primary', 0).reason).toBe(
      'Equip a weapon to build your moves',
    );
  });

  it('sockets a pouch rune into an open socket; over a filled one it pulls by the mode', () => {
    const p = ready();
    const res = socketRune(registry, p, 'primary', 0, 1, CHAIN_I);
    expect(res.ok).toBe(true);
    expect(primaryOf(res.profile).moves[0].runes).toEqual([SPLIT_I, CHAIN_I]);
    expect(res.profile).toMatchObject({ links: 10, scrap: 500, manaDust: 100 });
    expect(res.profile.runes.chain).toEqual([0, 0, 0, 0, 0]);
    expect(socketRune(registry, p, 'primary', 1, 0, ECHO_I)).toMatchObject({
      ok: true,
      destroyed: [QUICK_II],
    });
    const paid = socketRune(registry, p, 'primary', 1, 0, ECHO_I, { unsocket: 'pay' });
    expect(paid).toMatchObject({ ok: true, runes: [QUICK_II], destroyed: [] });
    expect(paid.profile.scrap).toBe(470);
    expect(socketRune(registry, p, 'primary', 2, 0, CHAIN_I).reason).toBe('Open this socket first');
    expect(socketRune(registry, p, 'primary', 0, 1, { id: 'split', tier: 2 }).reason).toBe(
      'A move takes one Split',
    );
    expect(socketRune(registry, p, 'primary', 0, 1, { id: 'widen', tier: 1 }).reason).toBe(
      "Widen doesn't fit a Bolt",
    );
    expect(socketRune(registry, p, 'primary', 0, 1, { id: 'chain', tier: 3 }).reason).toBe(
      'Not enough runes in your pouch',
    );
  });

  it('fuses three of one rune and tier into one of the next, for scrap; tier V does not fuse', () => {
    expect(R.fuseCount).toBe(3);
    const tiers = [1, 2, 3, 4, 5] as const;
    expect(tiers.map((tier) => fusePrice(registry, { id: 'split', tier }))).toEqual([
      20,
      40,
      80,
      160,
      null,
    ]);
    const p = { ...ready(), runes: { split: [4, 0, 0, 3, 0] } };
    const res = fuseRunes(registry, p, SPLIT_I);
    expect(res).toMatchObject({ ok: true, runes: [{ id: 'split', tier: 2 }] });
    expect(res.profile).toMatchObject({ scrap: 480, runes: { split: [1, 1, 0, 3, 0] } });
    expect(fuseRunes(registry, res.profile, SPLIT_I).reason).toBe('Fuse 3 of one rune and tier');
    const four = fuseRunes(registry, p, { id: 'split', tier: 4 });
    expect(four.profile).toMatchObject({ scrap: 340, runes: { split: [4, 0, 0, 0, 1] } });
    const fives = { ...p, runes: { split: [0, 0, 0, 0, 3] } };
    expect(fuseRunes(registry, fives, { id: 'split', tier: 5 }).reason).toBe(
      "Tier V runes don't fuse",
    );
    expect(fuseRunes(registry, { ...p, scrap: 19 }, SPLIT_I).reason).toBe('Not enough scrap');
    expect(fuseRunes(registry, p, { id: 'nope', tier: 1 }).reason).toBe('Unknown rune nope');
  });

  it('every op on sockets and runes waits for the dive to end, the door screen included', () => {
    const p = ready();
    const fighting = startDive(registry, p, 1);
    const choosing = { ...fighting, dive: { ...fighting.dive!, phase: 'choosing' as const } };
    const moves = 'Chains can only change between dives';
    const forge = 'Forge at the Anvil, between dives';
    for (const q of [fighting, choosing]) {
      expect(openSocket(registry, q, 'primary', 2)).toMatchObject({
        ok: false,
        profile: q,
        reason: moves,
      });
      expect(socketRune(registry, q, 'primary', 0, 1, CHAIN_I).reason).toBe(moves);
      const draft = { primary: withRunes(primaryOf(q), 2, [null]) };
      expect(setChains(registry, q, draft).reason).toBe(moves);
      expect(fuseRunes(registry, { ...q, runes: { split: [3, 0, 0, 0, 0] } }, SPLIT_I).reason).toBe(
        forge,
      );
      const bag = { ...q, bag: ['a', 'b', 'c'].map((uid) => socketedSword(uid)) };
      expect(transferMoveset(registry, bag, 'a').reason).toBe(
        'Transfer your moveset between dives',
      );
      expect(salvageItems(registry, bag, ['a'])).toMatchObject({ count: 0, destroyed: [] });
      expect(fuseGear(registry, bag, ['a', 'b', 'c']).reason).toBe(forge);
    }
    // The choice of mana stays open (a migrated save may be diving).
    const unchosen = startDive(registry, createDelveProfile(registry, 3), 1);
    expect(chooseStartingMana(registry, unchosen, 'frost').ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts)`
Expected: FAIL, 4 of 25: each new test reaches one of the four stubs Task 2 kept and throws `not built yet`.

- [ ] **Step 3: Write the ops**

In `packages/engine/src/delve/runes.ts`:

Replace:

```ts
import { movesetOf } from '../loot/moveset.js';
```

with:

```ts
import { carriedByText, movesetOf } from '../loot/moveset.js';
```

Replace:

```ts
import {
  RUNE_TIERS,
  type ChainOrigins,
  type RunePouch,
  type RuneRef,
  type RuneTarget,
  type UnsocketMode,
} from '../types/rune.js';
import { chainOrigins, editPrice, movesOf } from './moveset.js';
```

with:

```ts
import {
  RUNE_TIERS,
  type ChainOrigins,
  type RunePouch,
  type RuneRef,
  type RuneTarget,
  type RuneTier,
  type UnsocketMode,
} from '../types/rune.js';
import { isDiveActive } from './dive.js';
import { chainOrigins, editPrice, movesOf, setChains, withMove } from './moveset.js';
```

Replace the lines from `export function openSocket(` up to the end of the file with:

```ts
const BETWEEN_DIVES = 'Chains can only change between dives';
const FORGE_LOCKED = 'Forge at the Anvil, between dives';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/** The equipped weapon's `skill` chain and its move `index`, or why an op can't reach them. */
function moveAt(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: ChainSkill,
  index: number,
): { chain: Chains[ChainSkill]; move: Move | Blow } | string {
  if (isDiveActive(profile)) return BETWEEN_DIVES;
  const weapon = profile.equipped.weapon;
  if (!weapon) return UNARMED_TEXT;
  const chain = movesetOf(registry, weapon).chains[skill];
  if (!chain) return carriedByText(registry, skill);
  const move = Number.isInteger(index) ? movesOf(chain)[index] : undefined;
  if (!move) return 'Pick a move the chain holds';
  return { chain, move };
}

/**
 * Open the next socket on the equipped weapon's move `index` of `skill`: one
 * `setChains` in place, so it costs `socketLinks[n]` Links and
 * `socketScrap[n]` scrap by the `n` sockets the move has. Refuses mid-dive,
 * unarmed, a skill the weapon doesn't carry, a move the chain doesn't hold, at
 * the weapon rarity's cap, and when it can't be paid.
 */
export function openSocket(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: ChainSkill,
  index: number,
): ProfileActionResult {
  const at = moveAt(registry, profile, skill, index);
  if (typeof at === 'string') return refuse(profile, at);
  const sockets = socketsOf(at.move);
  if (sockets.length >= socketCap(registry, profile.equipped.weapon!.rarity))
    return refuse(profile, 'This move has every socket');
  const move = { ...at.move, runes: [...sockets, null] };
  return setChains(registry, profile, { [skill]: withMove(at.chain, index, move) });
}

/**
 * Socket `rune`, from the pouch, into open socket `socket` of the equipped
 * weapon's move `index` of `skill`: one `setChains` in place, so a rune
 * already there is pulled (`opts.unsocket`, else the balance's). Refuses
 * mid-dive, unarmed, a socket not yet open, and whatever `setChains` refuses
 * (a rune that doesn't fit the move, one already on it, one the pouch lacks).
 */
export function socketRune(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: ChainSkill,
  index: number,
  socket: number,
  rune: RuneRef,
  opts: SetChainsOptions = {},
): ProfileActionResult {
  const at = moveAt(registry, profile, skill, index);
  if (typeof at === 'string') return refuse(profile, at);
  const sockets = socketsOf(at.move);
  if (!Number.isInteger(socket) || socket < 0 || socket >= sockets.length)
    return refuse(profile, 'Open this socket first');
  if (!rune || typeof rune !== 'object') return refuse(profile, 'Pick a rune');
  const runes = sockets.map((r, i) => (i === socket ? { id: rune.id, tier: rune.tier } : r));
  const edit = { [skill]: withMove(at.chain, index, { ...at.move, runes }) };
  return setChains(registry, profile, edit, { unsocket: opts.unsocket });
}

/** The scrap fusing `fuseCount` of `ref` into one of the next tier costs (`fuseScrap`), or null at tier V. */
export function fusePrice(registry: DataRegistry, ref: RuneRef): number | null {
  if (ref.tier >= RUNE_TIERS) return null;
  return registry.getDelveBalance().runes.fuseScrap[ref.tier - 1];
}

/**
 * Fuse `fuseCount` (3) of `ref` from the pouch into one of the next tier, for
 * scrap (`fusePrice`); nothing is rolled. Refuses mid-dive (with the forge),
 * an unknown rune, tier V, and a pouch or scrap short of it.
 */
export function fuseRunes(
  registry: DataRegistry,
  profile: DelveProfile,
  ref: RuneRef,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
  if (!registry.findRune(ref.id) || !Number.isInteger(ref.tier) || ref.tier < 1)
    return refuse(profile, `Unknown rune ${ref.id}`);
  const price = fusePrice(registry, ref);
  if (price === null) return refuse(profile, "Tier V runes don't fuse");
  const { fuseCount } = registry.getDelveBalance().runes;
  const pouch = takeFromPouch(profile.runes, Array<RuneRef>(fuseCount).fill(ref));
  if (!pouch) return refuse(profile, `Fuse ${fuseCount} of one rune and tier`);
  if (profile.scrap < price) return refuse(profile, 'Not enough scrap');
  const made: RuneRef = { id: ref.id, tier: (ref.tier + 1) as RuneTier };
  return {
    ok: true,
    runes: [made],
    profile: { ...profile, scrap: profile.scrap - price, runes: addToPouch(pouch, [made]) },
  };
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts)`
Expected: PASS (25 tests).

Run: `(cd packages/engine && npx vitest run)` and `(cd packages/engine && npx tsc --noEmit -p .)`
Expected: every test passes; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/delve/runes.ts packages/engine/tests/delve-runes.test.ts
git add packages/engine/src/delve/runes.ts packages/engine/tests/delve-runes.test.ts
git commit -m "feat(engine): open a socket, socket a rune, and fuse three runes into the next tier" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 7: Runes drop from foes, are picked up, and bank into the pouch

The world's side of drops (spec: "On the floor", "Determinism"):
- **`dropRune(ctx, m)`** (`arpg/rune-drops.ts`, over wave 0's stub): `rollRuneDrop` on the world's own stream, `world.runeRng` (wave 0 forks it in `createFloorWorld` beside `lootRng`, from the label `runes:<nextUid>`); the chance, the rune, its tier and where it lands (the items' burst ring, 0.6 to 1.5 from the foe) all come from it, so item drops, motes and orbs come out exactly as before. It spawns a `Drop` of kind `'rune'` with `rune`, and a `drop` event. A rune drop takes an entity id (`world.nextId`), which renumbers later spawns; nothing reads ids for order or chance.
- **`killMonster`** calls it right after `dropLoot`, inside the same `!world.sandbox` guard, so the Training Grounds and the DPS Lab drop none.
- **`dropsTick`**: the magnet leaves runes alone, like items (walked over; vacuumed once the floor clears); a pickup pushes the rune onto `world.pending.runes`, and the `pickup` event carries it.
- **`bankWorld`**: the pending runes go into `profile.runes`, `BankResult.runes` lists them, and `DiveState.runesEarned` counts them.

**Files:**
- Create: `packages/engine/src/arpg/rune-drops.ts` (wave 0 created it as a stub; this replaces it whole)
- Modify: `packages/engine/src/arpg/combat.ts` (one call in `killMonster`, and its import: see **Cross-area needs**)
- Modify: `packages/engine/src/arpg/step.ts` (`dropsTick`: see **Cross-area needs**)
- Modify: `packages/engine/src/delve/dive.ts` (CRLF, never format: `bankWorld`)
- Modify: `packages/engine/tests/delve-runes.test.ts`
- Modify: `packages/engine/tests/delve-dive.test.ts` (its banking test's `pending` gains `runes`)

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-runes.test.ts`:

Replace:

```ts
import { startDive } from '../src/delve/dive.js';
```

with:

```ts
import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { setSandboxToggles } from '../src/arpg/sandbox.js';
```

Replace:

```ts
import type { MonsterKind } from '../src/types/arpg.js';
```

with:

```ts
import type { ArpgWorld, Drop, DropKind, MonsterKind } from '../src/types/arpg.js';
```

Replace:

```ts
import { bal, chainsOf, registry } from './fixtures/arena.js';
```

with:

```ts
import { arena, bal, chainsOf, dummy, registry, run } from './fixtures/arena.js';
```

Append at the end of the file:

```ts
describe('rune drops in the world', () => {
  /** A fresh dive's first floor, and a context to kill its foes in. */
  const floor = () => {
    const p = startDive(registry, createDelveProfile(registry, 3, { primary: 'fire' }), 1);
    const w = beginFloor(registry, p);
    return { p, w, ctx: makeCtx(registry, w, []) };
  };
  /** A world's drops but runes, without their ids (a rune drop renumbers later spawns). */
  const others = (w: ArpgWorld) =>
    w.drops.filter((d) => d.kind !== 'rune').map(({ id: _id, ...d }) => d);

  it('a slain foe drops a rune from its own stream: every other drop comes out as without it', () => {
    const a = floor();
    const b = floor();
    b.w.runeRng = { next: () => 1 } as unknown as SeededRNG; // never a rune
    for (const { w, ctx } of [a, b])
      for (const [i, m] of [...w.monsters].entries()) {
        if (i === 0) m.kind = 'boss';
        killMonster(ctx, m);
      }
    const runes = a.w.drops.filter((d) => d.kind === 'rune');
    expect(runes.length).toBeGreaterThanOrEqual(1);
    expect(b.w.drops.some((d) => d.kind === 'rune')).toBe(false);
    expect(others(a.w)).toEqual(others(b.w));
    const [first] = runes;
    expect(registry.findRune(first.rune!.id)).toBeDefined();
    expect(first.rune!.tier).toBeLessThanOrEqual(2); // depth 1: tier I, or II a fifth of the time
    expect(a.ctx.events).toContainEqual({
      kind: 'drop',
      dropId: first.id,
      x: first.x,
      y: first.y,
      dropKind: 'rune',
    });
  });

  it('the Training Grounds drop none', () => {
    const w = arena([{ kind: 'boss' }, {}, {}]);
    setSandboxToggles(w, { infiniteMana: false, noCooldowns: false, invulnerable: false });
    const ctx = makeCtx(registry, w, []);
    for (const m of [...w.monsters]) killMonster(ctx, m);
    expect(w.drops).toEqual([]);
  });

  it('a rune on the floor is walked over, never pulled by the magnet, and comes in when the floor clears', () => {
    const w = arena([dummy(13, 5)], { noBasic: true });
    const { x, y } = w.hero;
    const drop = (id: number, kind: DropKind, dx: number, rune?: RuneRef): Drop => ({
      id,
      kind,
      x: x + dx,
      y,
      rune,
      amount: 1,
      born: -1,
      vacuum: false,
      dead: false,
    });
    // Inside the magnet's reach, outside the pickup's: the mote flies in, the rune stays.
    w.drops.push(drop(1, 'rune', 2.4, SPLIT_I), drop(2, 'mote', -2.4), drop(3, 'rune', 0, CHAIN_I));
    const events = run(w, 0.5);
    expect(w.drops.map((d) => [d.id, d.x])).toEqual([[1, x + 2.4]]);
    expect(w.pending.runes).toEqual([CHAIN_I]);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'pickup', dropId: 3, dropKind: 'rune', rune: CHAIN_I }),
    );
    // The floor clears, and everything left comes in.
    w.monsters = [];
    run(w, 1);
    expect(w.pending.runes).toEqual([CHAIN_I, SPLIT_I]);
  });

  it('banking puts the runes picked up in the pouch, counts them for the dive, and reports them', () => {
    const { p, w } = floor();
    w.pending.runes = [SPLIT_I, SPLIT_I, CHAIN_II];
    const res = bankWorld(registry, p, w);
    expect(res.runes).toEqual([SPLIT_I, SPLIT_I, CHAIN_II]);
    expect(res.profile.runes).toEqual({ split: [2, 0, 0, 0, 0], chain: [0, 1, 0, 0, 0] });
    expect(res.profile.dive!.runesEarned).toBe(3);
    expect(w.pending.runes).toEqual([]);
    const again = bankWorld(registry, res.profile, w);
    expect(again.runes).toEqual([]);
    expect(again.profile.dive!.runesEarned).toBe(3);
  });
});
```

In `packages/engine/tests/delve-dive.test.ts`, the banking test sets the whole of `world.pending`, which now holds runes too:

Replace:

```ts
    world.pending = { items: items(2), scrap: 40, kills: 6, reactions: ['melt'] };
```

with:

```ts
    world.pending = { items: items(2), scrap: 40, kills: 6, reactions: ['melt'], runes: [] };
```

- [ ] **Step 2: Run them and watch them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts)`
Expected: FAIL, 3 of 29: no foe drops a rune (`expected 0 to be greater than or equal to 1`), the magnet pulls the far rune in (`expected [] to deeply equal [ [ 1, 15.4 ] ]`), and banking reports none (wave 0's `runes: []`: `expected [] to deeply equal [ { id: 'split', tier: 1 }, …(2) ]`). The Training Grounds test passes already: nothing drops a rune yet.

- [ ] **Step 3: Drop, pick up and bank runes**

Create `packages/engine/src/arpg/rune-drops.ts` (wave 0 created it as a stub; this replaces it whole):

```ts
import { rollRuneDrop } from '../loot/runes.js';
import type { MonsterEntity } from '../types/arpg.js';
import type { SimCtx } from './combat.js';

/**
 * A slain foe's rune (see the runes spec), rolled on the world's own stream
 * (`world.runeRng`: the chance, the rune, its tier and where it lands), so
 * item drops, motes and orbs come out as they would without it. It bursts
 * onto the floor like loot, a `Drop` of kind 'rune', walked over to pick up.
 * `killMonster` calls it beside `dropLoot`, inside its `!world.sandbox` guard.
 */
export function dropRune(ctx: SimCtx, m: MonsterEntity): void {
  const { world, registry } = ctx;
  const rng = world.runeRng;
  const ctxDrop = { depth: world.depth, kind: m.kind, dropMult: world.loot.dropMult };
  const rune = rollRuneDrop(registry, ctxDrop, rng);
  if (!rune) return;
  const angle = rng.next() * Math.PI * 2;
  const r = 0.6 + rng.next() * 0.9;
  const x = Math.max(1, Math.min(world.width - 1, m.x + Math.cos(angle) * r));
  const y = Math.max(1, Math.min(world.height - 1, m.y + Math.sin(angle) * r));
  const id = world.nextId++;
  world.drops.push({
    id,
    kind: 'rune',
    x,
    y,
    rune,
    amount: 1,
    born: world.t,
    vacuum: world.cleared,
    dead: false,
  });
  ctx.events.push({ kind: 'drop', dropId: id, x, y, dropKind: 'rune' });
}
```

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
import { notePerfect, refundDodgeCharge } from './dodge.js';
```

with:

```ts
import { notePerfect, refundDodgeCharge } from './dodge.js';
import { dropRune } from './rune-drops.js';
```

Replace:

```ts
  if (!world.sandbox) dropLoot(ctx, m);
```

with:

```ts
  if (!world.sandbox) {
    dropLoot(ctx, m);
    dropRune(ctx, m);
  }
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
    const magnet = d.kind !== 'item' && gap < bal.hero.magnetRadius;
```

with:

```ts
    // Items and runes are walked over; motes, orbs and scrap fly to the hero.
    const magnet = d.kind !== 'item' && d.kind !== 'rune' && gap < bal.hero.magnetRadius;
```

Replace:

```ts
      case 'scrap':
        world.pending.scrap += d.amount;
        break;
    }
```

with:

```ts
      case 'scrap':
        world.pending.scrap += d.amount;
        break;
      case 'rune':
        if (d.rune) world.pending.runes.push(d.rune);
        break;
    }
```

Replace:

```ts
      item: d.item,
      amount: d.amount,
      mana: d.mana,
```

with:

```ts
      item: d.item,
      rune: d.rune,
      amount: d.amount,
      mana: d.mana,
```

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
import { addLootToBag } from './profile.js';
```

with:

```ts
import { addLootToBag } from './profile.js';
import { addToPouch } from '../loot/runes.js';
```

Replace the lines from `* Move everything the world collected since the last bank (items picked up,` up to (not including) `function rollDoorChoices(registry: DataRegistry, dive: DiveState): string[] {` with:

```ts
 * Move everything the world collected since the last bank (items and runes
 * picked up, scrap, kills, reactions discovered) into the profile. Call it
 * whenever pickups happen so new gear can be equipped mid-floor, and at floor end.
 */
export function bankWorld(registry: DataRegistry, profile: DelveProfile, world: ArpgWorld): BankResult {
  const dive = requireDive(profile);
  const pending = world.pending;
  const items = pending.items;
  const runes = pending.runes;
  const bagged = addLootToBag(registry, { ...profile, pity: world.loot.pity, nextUid: world.loot.nextUid }, items);
  let next = bagged.profile;

  const found = { ...dive.found };
  let bestFind = dive.bestFind;
  for (const item of items) {
    found[item.rarity]++;
    bestFind = betterFind(bestFind, item);
  }
  const newReactions = pending.reactions.filter((r) => !next.reactionsSeen.includes(r));
  const scrap = pending.scrap;

  next = {
    ...next,
    scrap: next.scrap + scrap,
    runes: addToPouch(next.runes, runes),
    firstBossLegendaryGiven: next.firstBossLegendaryGiven || !world.loot.forceLegendary,
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
      runesEarned: dive.runesEarned + runes.length,
      potions: world.hero.potions,
      phoenixUsed: dive.phoenixUsed || world.hero.phoenixUsed,
      found,
      bestFind,
    },
  };
  world.pending = { items: [], scrap: 0, kills: 0, reactions: [], runes: [] };

  return {
    profile: next,
    kept: bagged.kept,
    salvaged: bagged.salvaged,
    bagFull: bagged.bagFull,
    newCodex: bagged.newCodex,
    newReactions,
    scrap: scrap + bagged.scrap,
    dust: bagged.dust,
    links: bagged.links,
    runes,
  };
}

```

- [ ] **Step 4: Run them and watch them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts tests/delve-dive.test.ts tests/arpg-sim.test.ts)`
Expected: PASS (29 in `delve-runes.test.ts`).

Run: `(cd packages/engine && npx vitest run)` and `(cd packages/engine && npx tsc --noEmit -p .)`
Expected: every test passes; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/arpg/rune-drops.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-runes.test.ts packages/engine/tests/delve-dive.test.ts
git add packages/engine/src/arpg/rune-drops.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/src/delve/dive.ts packages/engine/tests/delve-runes.test.ts packages/engine/tests/delve-dive.test.ts
git commit -m "feat(engine): foes drop runes on their own stream; walked over, banked into the pouch" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 6: The stop's fifth kind, sockets on drops, and the verification

### Task 8: The stop's fifth kind, and the `'move'` stop keeps the saved runes

Stops gain `'rune'` (spec: "Stops: the fifth kind"): socket one pouch rune into an open, empty socket of the equipped weapon, for free.
- **It applies** (`stopKinds`) when some move or blow of the equipped weapon has an empty socket and some pouch rune fits that move and isn't on it already.
- **Taking it:** `StopAction` gains `{ kind: 'rune'; skill; index; socket; rune }`; `runStop` refuses a socket that is filled or not yet open (`Socket a rune into an empty socket`: the stop sockets, it never pulls or opens), then runs `socketRune` with the dive lock lifted.
- **The `'move'` stop** copies the saved move's `runes` onto the new move and ignores any the client sent, so no socket or rune slips through it; its form change is still refused while a rune wouldn't fit.
- **Order:** `STOP_KINDS` becomes `['equip', 'slot', 'move', 'upgrade', 'rune']`. `rollStop` is unchanged, so when `'rune'` doesn't apply every stop rolls exactly as today (a test pins forty of today's stops).

4a's stop tests compare the kinds with `STOP_KINDS` where all four applied; they now name the four.

**Files:**
- Modify: `packages/engine/src/delve/stops.ts`
- Modify: `packages/engine/tests/delve-runes.test.ts`
- Modify: `packages/engine/tests/delve-stops.test.ts` (the four kinds named where all four apply)
- Modify: `packages/engine/tests/delve-runes-contract.test.ts` (wave 0's last `it.todo` block for this area goes)

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-runes.test.ts`:

Replace:

```ts
import { setSandboxToggles } from '../src/arpg/sandbox.js';
```

with:

```ts
import { setSandboxToggles } from '../src/arpg/sandbox.js';
import { STOP_KINDS, rollStop, stopKinds, takeStop } from '../src/delve/stops.js';
```

Replace:

```ts
import type { DelveProfile } from '../src/types/delve.js';
```

with:

```ts
import type { DelveProfile, StopKind } from '../src/types/delve.js';
```

Append at the end of the file:

```ts
describe("the stop's fifth kind: socket a rune", () => {
  /** `p` diving, on the door screen after depth 1, its stop offering `offers`. */
  const atStop = (p: DelveProfile, offers: StopKind[] = [...STOP_KINDS]): DelveProfile => {
    const diving = startDive(registry, p, 1);
    const stop = { offers, taken: false };
    const dive = { ...diving.dive!, phase: 'choosing' as const, depthsCleared: 1, stop };
    return { ...diving, dive: { ...dive, doorChoices: ['winding'] } };
  };

  it('applies with an empty socket and a pouch rune that fits its move and is not on it', () => {
    expect(STOP_KINDS).toEqual(['equip', 'slot', 'move', 'upgrade', 'rune']);
    const p = ready(); // the first Bolt: Split I and an empty socket; Chain I in the pouch
    expect(stopKinds(registry, p)).toContain('rune');
    expect(stopKinds(registry, { ...p, runes: {} })).not.toContain('rune');
    // Only Split: it is on that move already. Only Widen: it fits no Bolt and no bow blow.
    expect(stopKinds(registry, { ...p, runes: { split: [2, 0, 0, 0, 0] } })).not.toContain('rune');
    expect(stopKinds(registry, { ...p, runes: { widen: [1, 0, 0, 0, 0] } })).not.toContain('rune');
    expect(stopKinds(registry, { ...p, runes: { chain: [0, 0, 0, 0, 0] } })).not.toContain('rune');
    // No empty socket left: none.
    const full = setChains(registry, p, {
      primary: withRunes(primaryOf(p), 0, [SPLIT_I, CHAIN_I]),
    }).profile;
    expect(stopKinds(registry, { ...full, runes: p.runes })).not.toContain('rune');
    // A blow's empty socket counts too.
    const blow = openSocket(registry, full, 'basic', 0).profile;
    expect(stopKinds(registry, { ...blow, runes: p.runes })).toContain('rune');
  });

  it('sockets the rune for free with the lock lifted, and marks the stop taken', () => {
    const p = atStop(ready());
    const res = takeStop(registry, p, {
      kind: 'rune',
      skill: 'primary',
      index: 0,
      socket: 1,
      rune: CHAIN_I,
    });
    expect(res.ok).toBe(true);
    expect(primaryOf(res.profile).moves[0].runes).toEqual([SPLIT_I, CHAIN_I]);
    expect(res.profile).toMatchObject({ links: 10, scrap: 500, manaDust: 100 });
    expect(res.profile.runes.chain).toEqual([0, 0, 0, 0, 0]);
    expect(res.profile.dive!.stop!.taken).toBe(true);
  });

  it('refuses a filled socket, one not yet open, and what socketing refuses; the stop stays open', () => {
    const p = atStop(ready());
    const take = (index: number, socket: number, rune: RuneRef) =>
      takeStop(registry, p, { kind: 'rune', skill: 'primary', index, socket, rune });
    expect(take(0, 0, CHAIN_I)).toMatchObject({
      ok: false,
      profile: p,
      reason: 'Socket a rune into an empty socket',
    });
    expect(take(2, 0, CHAIN_I).reason).toBe('Socket a rune into an empty socket');
    expect(take(0, 0.5, CHAIN_I).reason).toBe('Socket a rune into an empty socket');
    expect(take(5, 0, CHAIN_I).reason).toBe('Socket a rune into a move the chain holds');
    expect(take(0, 1, { id: 'widen', tier: 1 }).reason).toBe("Widen doesn't fit a Bolt");
    expect(take(0, 1, { id: 'split', tier: 1 }).reason).toBe('A move takes one Split');
    expect(take(0, 1, { id: 'chain', tier: 2 }).reason).toBe('Not enough runes in your pouch');
    const elsewhere = atStop(ready(), ['equip', 'move']);
    const action = { kind: 'rune', skill: 'primary', index: 0, socket: 1, rune: CHAIN_I } as const;
    expect(takeStop(registry, elsewhere, action).reason).toBe('Not offered at this stop');
  });

  it("the 'move' stop keeps the saved move's runes, whatever the client sends", () => {
    const p = atStop(ready());
    const bolt = primaryOf(p).moves[0];
    const sent = { ...bolt, kind: 'heavy' as const, runes: [CHAIN_I, ECHO_I] };
    const res = takeStop(registry, p, { kind: 'move', skill: 'primary', index: 0, move: sent });
    expect(res.ok).toBe(true);
    expect(primaryOf(res.profile).moves[0]).toEqual({ ...bolt, kind: 'heavy' });
    expect(res.profile.runes).toEqual(p.runes);
    // Its form change is still refused while a rune wouldn't fit.
    const lance = { ...bolt, form: 'lance' as const };
    const formed = takeStop(registry, p, { kind: 'move', skill: 'primary', index: 0, move: lance });
    expect(formed.reason).toBe("Split doesn't fit a Lance");
    // A move without sockets stays without.
    const plain = primaryOf(p).moves[2];
    const third = takeStop(registry, p, {
      kind: 'move',
      skill: 'primary',
      index: 2,
      move: { ...plain, kind: 'heavy', runes: [null] },
    });
    expect(primaryOf(third.profile).moves[2]).toEqual({ ...plain, kind: 'heavy' });
  });

  it('rolls every stop as it did when the rune kind does not apply', () => {
    const ring = generateItem(
      registry,
      { uid: 'r1', ilvl: 2, rarity: 'magic', slot: 'ring', mana: 'fire' },
      new SeededRNG(1),
    );
    const p = { ...createDelveProfile(registry, 3, { primary: 'fire' }), bag: [ring] };
    const q = { ...p, links: 5, scrap: 1000 };
    const offers = Array.from({ length: 40 }, (_, i) => {
      const stop = rollStop(registry, q, { ...startDive(registry, q, 1).dive!, seed: i + 1 })!;
      return stop.offers.map((k) => k[0]).join('');
    });
    // v0.50.0's stops for these forty seeds.
    expect(offers.join(' ')).toBe(
      'smu em mu esu esm mu esm es smu emu emu mu su es mu esu su su mu es eu su emu sm esu emu emu su es mu em smu smu esm esu su mu sm es es',
    );
  });
});
```

In `packages/engine/tests/delve-stops.test.ts`:

Replace:

```ts
const ALL: DiveStop = { offers: [...STOP_KINDS], taken: false };
```

with:

```ts
const ALL: DiveStop = { offers: [...STOP_KINDS], taken: false };

/** The kinds before runes: what a hero with an empty pouch can be offered. */
const FOUR: StopKind[] = ['equip', 'slot', 'move', 'upgrade'];
```

Replace:

```ts
    expect(stopKinds(registry, rich)).toEqual([...STOP_KINDS]);
```

with:

```ts
    expect(stopKinds(registry, rich)).toEqual(FOUR);
```

Replace:

```ts
    expect(stopKinds(registry, { ...rich, manaDust: 0, stats: p0.stats })).toEqual([...STOP_KINDS]);
```

with:

```ts
    expect(stopKinds(registry, { ...rich, manaDust: 0, stats: p0.stats })).toEqual(FOUR);
```

Replace:

```ts
    expect([...seen].sort()).toEqual([...STOP_KINDS].sort());
```

with:

```ts
    expect([...seen].sort()).toEqual([...FOUR].sort());
```

In `packages/engine/tests/delve-runes-contract.test.ts`, wave 0's last placeholders for this area go (Tasks 2 to 8 build them: the profile ops, `bankWorld`, `stopKinds`' rune kind and `dropRune`):

Delete the lines from `// Stubs in wave 0 ("not built yet"); wave 1B builds them and may delete these lines.` up to (not including) `describe('the sim and the index: the contract is in place', () => {`.

- [ ] **Step 2: Run them and watch them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts tests/delve-stops.test.ts)`
Expected: FAIL, 4 of 34 in `delve-runes.test.ts`: `STOP_KINDS` holds four kinds (`expected [ 'equip', 'slot', 'move', 'upgrade' ] to deeply equal [ 'equip', 'slot', 'move', …(2) ]`); the rune action is refused (`expected false to be true`: `Not offered at this stop`, its kind not being one), and so the refusals read otherwise; and the `'move'` stop takes the client's runes (`[CHAIN_I, ECHO_I]` where the saved `[SPLIT_I, null]` is expected). The pinned stops pass already, and so does `delve-stops.test.ts`.

- [ ] **Step 3: Write the fifth kind**

In `packages/engine/src/delve/stops.ts`:

Replace:

```ts
import { CHAIN_SKILLS, type Blow, type ChainSkill, type Move } from '../types/ability.js';
import type { DelveProfile, DiveState, DiveStop, StopKind } from '../types/delve.js';
import { GEAR_SLOTS, type GearItem } from '../types/gear.js';
import { addSlot, moveKey, movesOf, setChain, slotPrice, withMove } from './moveset.js';
import { equipItem, upgradeGear, type ProfileActionResult } from './profile.js';
```

with:

```ts
import { runeFits, socketsOf } from '../loot/runes.js';
import { CHAIN_SKILLS, type Blow, type ChainSkill, type Move } from '../types/ability.js';
import type { DelveProfile, DiveState, DiveStop, StopKind } from '../types/delve.js';
import { GEAR_SLOTS, type GearItem } from '../types/gear.js';
import type { RuneRef } from '../types/rune.js';
import { addSlot, moveKey, movesOf, setChain, slotPrice, withMove } from './moveset.js';
import { equipItem, upgradeGear, type ProfileActionResult } from './profile.js';
import { runeTargetOf, socketRune } from './runes.js';
```

Replace the lines from `/** The four kinds, in the order a stop lists them. */` up to (not including) `` /** Whether one move's edit is affordable: free edits (before the first dive), or `editDust` in Mana Dust. */ `` with:

```ts
/** The five kinds, in the order a stop lists them. */
export const STOP_KINDS: readonly StopKind[] = ['equip', 'slot', 'move', 'upgrade', 'rune'];

/** What a stop's player takes: the kind and what it acts on. */
export type StopAction =
  | { kind: 'equip'; uid: string }
  | { kind: 'slot'; skill: ChainSkill }
  | { kind: 'move'; skill: ChainSkill; index: number; move: Move | Blow }
  | { kind: 'upgrade'; uid: string }
  | { kind: 'rune'; skill: ChainSkill; index: number; socket: number; rune: RuneRef };

/**
 * The kinds whose cheapest action `profile` can take and pay for now: `equip`
 * with an item in the bag; `slot` with a chain of the equipped weapon below
 * its cap whose next slot's Links and scrap the hero has; `move` with a weapon
 * equipped and `editDust` in Mana Dust (or free edits, before the first dive);
 * `upgrade` with an item, equipped or in the bag, whose next upgrade it can
 * pay; `rune` with an empty socket and a pouch rune for it (`canSocket`).
 */
export function stopKinds(registry: DataRegistry, profile: DelveProfile): StopKind[] {
  const weapon = profile.equipped.weapon;
  const items = [...GEAR_SLOTS.map((s) => profile.equipped[s]), ...profile.bag].filter(
    (i): i is GearItem => !!i,
  );
  const applies: Record<StopKind, boolean> = {
    equip: profile.bag.length > 0,
    slot:
      !!weapon &&
      CHAIN_SKILLS.some((s) => {
        const price = slotPrice(registry, weapon, s);
        return !!price && price.links <= profile.links && price.scrap <= profile.scrap;
      }),
    move: !!weapon && canEdit(registry, profile),
    upgrade: items.some((i) => (upgradeCost(registry, i) ?? Infinity) <= profile.scrap),
    rune: canSocket(registry, profile),
  };
  return STOP_KINDS.filter((k) => applies[k]);
}

/**
 * Whether some move or blow of the equipped weapon has an empty socket that a
 * pouch rune fits (by the move's form, or the weapon's blows) and isn't on
 * that move already.
 */
function canSocket(registry: DataRegistry, profile: DelveProfile): boolean {
  const weapon = profile.equipped.weapon;
  if (!weapon) return false;
  const held = Object.keys(profile.runes).filter((id) => profile.runes[id].some((n) => n > 0));
  const { chains } = movesetOf(registry, weapon);
  return CHAIN_SKILLS.some((skill) =>
    movesOf(chains[skill]).some((m) => {
      const sockets = socketsOf(m);
      if (!sockets.includes(null)) return false;
      return held.some((id) => {
        const def = registry.findRune(id);
        if (!def || sockets.some((r) => r?.id === id)) return false;
        return runeFits(def, runeTargetOf(weapon.baseId, m));
      });
    }),
  );
}

```

Replace:

```ts
      if (moveKey(move) === moveKey(moves[index]))
        return { ok: false, profile, reason: 'Change the move' };
      return setChain(registry, profile, action.skill, withMove(chain, index, move));
    }
    case 'upgrade':
      return upgradeGear(registry, profile, action.uid);
  }
}
```

with:

```ts
      if (moveKey(move) === moveKey(moves[index]))
        return { ok: false, profile, reason: 'Change the move' };
      // The saved move's sockets and runes stay; any the client sent are ignored.
      const { runes: _sent, ...shape } = move;
      const saved = moves[index].runes;
      const next = (saved ? { ...shape, runes: saved } : shape) as Move | Blow;
      return setChain(registry, profile, action.skill, withMove(chain, index, next));
    }
    case 'upgrade':
      return upgradeGear(registry, profile, action.uid);
    case 'rune': {
      const weapon = profile.equipped.weapon;
      if (!weapon) return { ok: false, profile, reason: 'Equip a weapon to build your moves' };
      const chain = movesetOf(registry, weapon).chains[action.skill];
      if (!chain) return { ok: false, profile, reason: carriedByText(registry, action.skill) };
      const { index, socket } = action;
      const move = Number.isInteger(index) ? movesOf(chain)[index] : undefined;
      if (!move) return { ok: false, profile, reason: 'Socket a rune into a move the chain holds' };
      // The stop sockets: it never pulls a rune or opens a socket.
      if (socketsOf(move)[socket] !== null)
        return { ok: false, profile, reason: 'Socket a rune into an empty socket' };
      return socketRune(registry, profile, action.skill, index, socket, action.rune);
    }
  }
}
```

Replace:

```ts
 * alone (equipping is free, and a weapon brings its own moveset); `move`
 * changes one move of one chain. A refused op leaves the stop open; one taken
 * marks it taken. Skipping is choosing a door.
```

with:

```ts
 * alone (equipping is free, and a weapon brings its own moveset); `move`
 * changes one move of one chain (its sockets and runes stay as saved); `rune`
 * sockets a pouch rune into an empty socket, free. A refused op leaves the
 * stop open; one taken marks it taken. Skipping is choosing a door.
```

- [ ] **Step 4: Run them and watch them pass**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts tests/delve-stops.test.ts)`
Expected: PASS (34 in `delve-runes.test.ts`).

Run: `(cd packages/engine && npx vitest run)` and `(cd packages/engine && npx tsc --noEmit -p .)`
Expected: every test passes; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/delve/stops.ts packages/engine/tests/delve-runes.test.ts packages/engine/tests/delve-stops.test.ts packages/engine/tests/delve-runes-contract.test.ts
git add packages/engine/src/delve/stops.ts packages/engine/tests/delve-runes.test.ts packages/engine/tests/delve-stops.test.ts packages/engine/tests/delve-runes-contract.test.ts
git commit -m "feat(engine): a stop can socket a rune; the move stop keeps the saved runes" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: Weapon drops roll open sockets

Last, so every task before keeps the autopilot's runs as they were (no weapon has a socket until a drop rolls one): `generateItem` rolls a weapon's sockets after its moveset, from `rng.fork('sockets')` (spec: "Drops roll sockets"), so every item stat, every moveset and every later drop come out exactly as before. By rarity: common and uncommon none, magic and rare 0–1, epic 1–2, legendary 2–3, spread uniformly over the moves and blows of the chains the weapon carries, never past a move's cap, all empty.

This is the task that moves the pacing: sockets on drops mean salvaged weapons give more Links (4a's slots get bought sooner), a transfer prices and returns sockets, and the stop's rune kind starts to apply (a pouch rune and an empty socket), which changes which kinds a stop rolls. Step 4 records the rails' numbers; on the scratch copy every rail held (see **Measured**). If one breaks here, stop and report the numbers to the user: the fix is theirs.

**Files:**
- Modify: `packages/engine/src/loot/item-generator.ts` (CRLF, never format: the socket roll)
- Modify: `packages/engine/tests/delve-runes.test.ts`
- Modify: `packages/engine/tests/delve-movesets.test.ts` (a drop's moveset compared without its sockets)

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-runes.test.ts`:

Append at the end of the file:

```ts
describe('sockets on weapon drops', () => {
  it("opens the rarity's sockets, empty, over the moves it carries, never past a move's cap", () => {
    expect(R.socketDrops).toEqual({
      common: [0, 0],
      uncommon: [0, 0],
      magic: [0, 1],
      rare: [0, 1],
      epic: [1, 2],
      legendary: [2, 3],
    });
    for (const rarity of RARITY_ORDER) {
      const seen = new Set<number>();
      for (let seed = 1; seed <= 80; seed++) {
        const m = weapon(rarity, seed).moveset!;
        seen.add(openSockets(m));
        for (const x of allMoves(m)) {
          expect(socketsOf(x).length).toBeLessThanOrEqual(R.socketCap[rarity]);
          expect(socketsOf(x).every((r) => r === null)).toBe(true);
        }
      }
      expect(Math.min(...seen)).toBe(R.socketDrops[rarity][0]);
      expect(Math.max(...seen)).toBe(R.socketDrops[rarity][1]);
    }
  });

  it('spreads them over every chain a weapon carries, basic blows included', () => {
    const got = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const m = weapon('legendary', seed).moveset!;
      for (const skill of CHAIN_SKILLS)
        if (openSockets({ chains: { [skill]: m.chains[skill] }, slots: {} }) > 0) got.add(skill);
    }
    expect([...got].sort()).toEqual(['basic', 'defensive', 'primary', 'ultimate']);
  });

  it('rolls from its own stream: the same seed gives the same sockets, and the moveset under them is as before', () => {
    expect(weapon('epic', 9).moveset).toEqual(weapon('epic', 9).moveset);
    for (let seed = 1; seed <= 20; seed++) {
      const w = weapon('legendary', seed);
      expect(bare(w.moveset!)).toEqual(defaultMoveset(registry, w, 'storm', w.moveset!.slots));
    }
  });
});
```

In `packages/engine/tests/delve-movesets.test.ts`, a drop's moveset now carries its sockets: compare it without them.

Replace:

```ts
        expect(m).toEqual(defaultMoveset(registry, w, 'storm', m.slots));
```

with:

```ts
        expect(unsocketed(m)).toEqual(defaultMoveset(registry, w, 'storm', m.slots));
```

Append at the end of the file:

```ts
/** A moveset without its sockets (see the runes spec: weapon drops roll some, empty). */
function unsocketed(m: Moveset): Moveset {
  const strip = <X extends Move | Blow>({ runes: _r, ...x }: X) => x;
  const chains = Object.fromEntries(
    Object.entries(m.chains).map(([skill, c]) => [
      skill,
      Array.isArray(c) ? c.map(strip) : { ...c, moves: c!.moves.map(strip) },
    ]),
  );
  return { chains, slots: m.slots };
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts tests/delve-movesets.test.ts)`
Expected: FAIL, 2 of 37 in `delve-runes.test.ts`: no drop rolls a socket yet (`expected +0 to be 1`, the magic weapons' most; and no chain gets one: `expected [] to deeply equal [ 'basic', 'defensive', …(2) ]`). The third passes already (no sockets: the moveset is the same), and so does `delve-movesets.test.ts` (stripping no sockets changes nothing).

- [ ] **Step 3: Roll the sockets**

In `packages/engine/src/loot/item-generator.ts`:

Replace:

```ts
import { rollMoveset } from './moveset.js';
```

with:

```ts
import { rollMoveset, rollSockets } from './moveset.js';
```

Replace:

```ts
  // Last, from its own stream: every other roll, and every later drop, stays as it was.
  if (item.slot === 'weapon') item.moveset = rollMoveset(registry, item, rng.fork('moveset'));
```

with:

```ts
  // Last, from their own streams: every other roll, and every later drop, stays as it was.
  if (item.slot === 'weapon') {
    const moveset = rollMoveset(registry, item, rng.fork('moveset'));
    item.moveset = rollSockets(registry, item, moveset, rng.fork('sockets'));
  }
```

- [ ] **Step 4: Run them and watch them pass; record the rails**

Run: `(cd packages/engine && npx vitest run tests/delve-runes.test.ts tests/delve-movesets.test.ts)`
Expected: PASS (37 in `delve-runes.test.ts`); `delve-movesets.test.ts`'s item hash (v0.48.0's 291 items, movesets left out) is unchanged: `[291, '49e20fb6']`.

Run: `(cd packages/engine && npx vitest run)` and `(cd packages/engine && npx tsc --noEmit -p .)`
Expected: every test passes, the pacing rails included; tsc clean. If a pacing rail fails, stop: run the **Verification** section's pacing script and report its numbers to the user, as the spec's Balance section says.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-runes.test.ts packages/engine/tests/delve-movesets.test.ts
git add packages/engine/src/loot/item-generator.ts packages/engine/tests/delve-runes.test.ts packages/engine/tests/delve-movesets.test.ts
git commit -m "feat(engine): weapon drops roll open sockets by rarity, from their own stream" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

No edits; nothing to commit.

- [ ] **Step 1: The suite and the typecheck**

```bash
cd /c/Projects/alloy-economy
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
```

Expected: the typecheck prints nothing; **1505 tests pass and 4 are todo (1509) in 80 files** (the todos are wave 1A's), `tests/delve-pacing.test.ts`'s 7 rails among them.

- [ ] **Step 2: The no-rune determinism check against wave 0's "before" files**

```bash
cd /c/Projects/alloy-economy
(cd packages/engine && npx tsup --out-dir node_modules/.runes-economy-measure)
S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
M=C:/Projects/alloy-economy/packages/engine/node_modules/.runes-economy-measure/index.js
mkdir -p $S/runes-economy && cd $S/runes-economy
node $S/runes-before/snapshot.mjs $M after-depth10.json
node $S/runes-before/identical.mjs $S/runes-before/before-depth10.json after-depth10.json
node $S/runes-before/items-hash.mjs $M > items-hash-after.txt && diff $S/runes-before/items-hash-before.txt items-hash-after.txt && echo items identical
node $S/runes-before/pacing.mjs $M > pacing-after.txt; diff $S/runes-before/pacing-before.txt pacing-after.txt
node $S/runes-before/first-dives.mjs $M > first-dives-after.txt; diff $S/runes-before/first-dives-before.txt first-dives-after.txt
cd /c/Projects/alloy-economy && rm -rf packages/engine/node_modules/.runes-economy-measure
```

Expected (the **Measured** table's last column):

```text
runs 9144 ms …
rows 9144 before, 9144 after; differing 0
items identical
```

and the pacing and first dives differ from "before" exactly as measured, every rail holding:

```text
first dive: 3, 3, 3, 3 (each ≥ 3), mean 3 (3–12)
dive 6 mean 21.25, dive 12 mean 29 (> dive 1 + 5, > dive 6)
frost: dive 1 4, dive 12 31.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 5.5 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 22, 21–30 (allowed 13.2–35.2): fire+frost 21, earth+frost 22, storm+fire 26, frost+storm 21, fire+shadow 25, fire+nature 26, shadow+nature 22, fire+earth 22, storm+earth 22, earth+shadow 30, earth+nature 22, frost+shadow 22, frost+nature 22, storm+shadow 28, storm+nature 21
seconds per floor: 32.94 (8–60)
```

```text
1 1→3 dead power 1266 | 1→5 dead power 2867
2 1→3 dead power 1352 | 1→7 dead power 2896
3 1→3 dead power 1022 | 1→5 dead power 2077
4 1→3 dead power 1166 | 1→5 dead power 2913
```

Report the pacing and first dives to the controller with the two reasons the **Measured** section gives (Task 4's one Dust rule, Task 9's sockets on drops). Any other difference (a DPS Lab row, the items hash, a number other than these) is a regression: debug it, don't move on. If wave 1A's merge comes first, the pacing changes with it too; the items hash and the DPS Lab's no-rune rows must still match.

- [ ] **Step 3: Nothing stray**

Run: `git -C /c/Projects/alloy-economy status --short` and `git -C /c/Projects/alloy-economy log --oneline b216703..`
Expected: a clean tree; nine commits (Tasks 1–9).
