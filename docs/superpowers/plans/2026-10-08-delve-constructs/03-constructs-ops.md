# Delve constructs · B2: construct operations and the economy (engine) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the construct operations the contract names in `delve/constructs.ts` (`applyDraft`, `placeConstruct`, `unsocketConstruct`, `moveAll`, `salvageConstruct`, `draftRefusal`; spec §3.3), and the economy round them: a weapon's salvage sends its constructs, runes and all, to the bag (or mid-dive the floor's haul) and refunds its bought slots only; plain constructs auto-salvage; a dive's death loses the haul's constructs outright and each banked one at `deathLoss`; the stops' power-ups work in the new model; `chooseStartingMana` refills the starting weapon plain and Realign touches only the worn weapon; and an invariant test plays thousands of random operations (spec §8). The autopilot takes no new op until D1, so the whole-autopilot fingerprint stays identical after every task.

**Architecture:** `applyDraft` is `setChains` grown by composition, not by copy: a free **rearrangement** first (every uid of the draft's chains and bag resolved to its saved construct in its draft place: placing, unsocketing and reordering cost nothing, and the refusals of the wrong skill, the wrong class, a uid in two places and a dropped non-plain construct live there), then Phase A's `setChains` on that rearranged profile, which prices by uid only what changed on each construct and mints the new ones. `placeConstruct` and `unsocketConstruct` are one-op drafts. `Haul.constructs` (A's field) rides every mid-dive path through `addHaul`; one helper, `intoBag`, is the only door into `profile.constructs` and applies the plain auto-salvage. No random stream gains or loses a draw: the death loss draws its constructs after today's counts on the same `death:<seed>` stream.

**Tech Stack:** TypeScript 5.7, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-07-delve-weapon-identity-and-constructs-design.md` (authoritative): §3.1–3.5 and §8. The contract is `00-overview.md` → "The contract"; section numbers below are the spec's.

---

## Base

- **Starts from:** `constructs/main` with Phase A merged, in this area's worktree (the junction script links `node_modules`):

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad/mkwt.ps1 -Name alloy-constructs-b2 -Branch constructs/b2 -Base constructs/main
```

  Every path below is relative to `/c/Projects/alloy-constructs-b2`. Remove the worktree only with `rmdir /s /q` from cmd, then `git worktree prune`. **Never `git stash` here.**
- **Anchors:** drafted against `main` at `2f3871b2` plus the contract. Every file edited here is B2's (overview's table) except `loot/materials.ts` (no owner: one line, Task 1) and `types/crafting.ts` (A's: two additive lines, Task 2); both are under "Needs routed". Where A changes a file first, the edit below is written against the contract's stated shape and says so ("A's shape"); every other replaced block is today's code, which A leaves alone.
- **What this plan assumes Phase A landed** (check before Task 1; if one is missing, stop and ask the integrator):
  1. `types/crafting.ts`: `Haul.constructs: Construct[]`, and `emptyHaul()` (`loot/materials.ts`) returns `constructs: []` (it must, to type-check). `addHaul` still spreads `a` (so `a.constructs` rides through unsummed): Task 1 sums it.
  2. `loot/moveset.ts` exports `constructSkill`, `isPlain`, `formAllowed`, `moveAllPreview`, `defaultMoveset(registry, owner, element, slots?)` (plain-filled, `bought` all 0), `weaponParts(registry, weapon): { links: Σ bought; runes; constructs }`, `dormantUids`, `movesetOf`.
  3. `delve/moveset.ts`: `setChains(registry, profile, chains, opts?)` by uid (a kept uid priced by its changes, a uid-less construct new and minted, a saved uid `chains` lacks removed; refuses an empty Basic, a chain past its slots, a class the weapon can't express on a new or changed construct); `addSlot` up to the ceiling, bought, plain-filled, minting; `slotPrice` null at the ceiling or at 0 slots; `movesOf`, `withMove`.
  4. `delve/profile.ts`: `mintUid(profile): [uid, profile]`; `addLootToBag` mints a uid for every construct of every incoming weapon **before** the keep/salvage split (the contract puts the haul's constructs under the uniqueness check, so a melted drop's constructs need uids: Task 2's test pins it); `withMoveset`, `findItem`, `replaceItem`.
  5. `delve/runes.ts`: `SetChainsOptions { unsocket? }` (origins gone), `settleParts`, `unsocketMode`, `openSocket`, `socketRune`; `delve.runes.unsocket` ships `'pay'`.
  6. `delve/constructs.ts` exists with `ConstructDraft` and the six ops, each refusing "Not yet"; `src/index.ts` has `export * from './delve/constructs.js'`.
  7. `types/tutorial.ts`: the `moveAll` and `openSkill` tutorial events; `delve/autopilot.ts`'s `transferBest` and the lesson's `'transfer'` op return the profile unchanged (`// D1 rewires to moveAll`).
  8. `DelveProfile.constructs: Construct[]` and `autoSalvagePlain: boolean` (a new save: `[]`, `true`); `DiveState.haul`, `banked` and `lost` carry `constructs`.
- **Before Task 1:** build once and run the files this area touches, to have a baseline:

```bash
cd /c/Projects/alloy-constructs-b2/packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run tests/delve-movesets.test.ts tests/delve-runes.test.ts tests/delve-runes-contract.test.ts tests/delve-salvage-yield.test.ts tests/delve-banking.test.ts tests/delve-stops.test.ts tests/delve-pair.test.ts tests/delve-dive.test.ts --reporter=dot
```

  Expected: no type errors; every file passes (A rewrote what it broke).
- **The fingerprint check** (overview's conventions): A's probe and its recorded file, under the session's scratchpad `$P` (A names them; `constructs-a-probe.test.ts` and `constructs-a-after.json` below are its switch task's names: check `ls $P`). After every task:

```bash
cd /c/Projects/alloy-constructs-b2
P=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad
cp $P/constructs-a-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/constructs-b2-after.json npx vitest run tests/zz-probe.test.ts --reporter=dot)
rm packages/engine/tests/zz-probe.test.ts
cmp $P/constructs-a-after.json $P/constructs-b2-after.json
```

  Expected: the probe passes and `cmp` prints nothing. The bot's paths through this area are `createDelveProfile` → `chooseStartingMana` (Task 9), `salvageItems(salvageCandidates(…))` between dives (Task 2), `addLootToBag` at every bank (Task 2), `takeStop` / `takeAlcove` (Task 8) and `settleDive` (Task 3); each task says why its change leaves the bot's play as it was.

## Files

| File | Change |
|---|---|
| `packages/engine/src/loot/materials.ts` | `addHaul` sums `constructs` (Task 1) |
| `packages/engine/src/delve/constructs.ts` | `intoBag`, `mintMoveset` (Task 1); `applyDraft`, `draftRefusal` (Task 4); `placeConstruct`, `unsocketConstruct` (Task 5); `moveAll` (Task 6); `salvageConstruct` (Task 7) |
| `packages/engine/src/loot/salvage-yield.ts` | `salvageYield.constructs`; `applySalvage` sends them to the haul or the bag, pulls nothing (Task 2) |
| `packages/engine/src/types/crafting.ts` | `SalvageYield.constructs`, `SalvageResult.constructs` (Task 2; A's file, routed) |
| `packages/engine/src/delve/profile.ts` | `Melted.constructs`, `melt` (Task 2); `salvageCandidates` kept as it is, with a note for D1 |
| `packages/engine/src/delve/dive.ts` | `BankResult.constructs`, `failFloor`'s empty result, `mapCounts` (Task 2); `settleDive`'s constructs and death loss (Task 3) |
| `packages/engine/src/delve/stops.ts` | the `move` power-up keeps the construct's uid (Task 8) |
| `packages/engine/src/delve/pair.ts` | `chooseStartingMana` refills plain, minting (Task 9) |
| `packages/engine/tests/delve-constructs-ops.test.ts` (new) | one `describe` per site (Tasks 1–9) |
| `packages/engine/tests/delve-constructs-invariant.test.ts` (new) | spec §8's random operations (Task 10) |
| `packages/engine/tests/delve-salvage-yield.test.ts`, `tests/delve-runes.test.ts` | the assertions B2's salvage changes (Task 2, Step 5) |

## Where the spec left room

1. **`applyDraft` = rearrange, then `setChains`.** The draft's free moves (place, unsocket, reorder) are a rearrangement of saved constructs by uid; building the profile that holds each construct's *saved* self in its *draft* place and then calling A's `setChains` on it makes every priced edit (a kind, a form, an element set, a socket, a rune, a payment, a new construct) fall out of A's by-uid diff with no second pricer. A construct placed from the bag is therefore "kept" to `setChains`, so the class check for it (spec §3.3 Place: "A bow can't express Strike") lives in the rearrangement; a kept dormant construct passes, as the contract says.
2. **The draft's bag is a list of uids.** A bag construct's fields in the draft are not read: its saved self goes back (edits happen in slots). A draft bag entry without a uid is refused ("Nothing new is made in the bag").
3. **A chain the draft leaves out is unchanged**, as `setChains` treats it; a bag entry whose construct still sits in such a chain is then a uid in two places (refused), which is the right answer.
4. **A dropped construct must be plain** (the contract's "a plain one may be gone"); a non-plain one missing from the draft is refused ("Every construct is kept: unsocket it to the bag"), so a rune can never vanish through Apply. `rearrange` drops a plain construct the draft leaves out **whether or not `autoSalvagePlain` is on** (the contract allows it); so C1's Remove must unsocket to the draft's bag, never drop, while the toggle is off, and may do either while it is on.
5. **The plain auto-salvage has one door, `intoBag`:** a plain construct is dropped when `autoSalvagePlain` as it enters `profile.constructs` (a weapon's salvage at the Anvil, Move all's displaced constructs, the settle). Inside a draft it is applied at Apply to the constructs the draft displaced (in a saved chain, now in the draft's bag), never to those already in the bag (they entered through the door once).
6. **A weapon's salvage pulls no rune:** its constructs carry their runes into the bag, so `applySalvage` no longer calls `settleParts`; `SalvageResult.runes` and `destroyed` are `[]` for a weapon and `SalvageYield.runes` lists the runes riding its constructs (the Loadout's label can say "n runes go to the bag with its moves"). The `unsocket` option on `applySalvage`, `melt`, `salvageItems`, `addLootToBag`, `bankWorld`, `completeFloor` and `failFloor` is left in place and unused (the client passes it; removing it is a client-wide edit for D2).
7. **The death loss draws its constructs after the counts** on the same `death:<seed>` stream: today's materials keep today's draws, and each banked construct is lost at `loss` (Insurance's reduction included) with one draw of its own. The haul's are lost outright. Plain banked constructs are dropped at the settle by `intoBag` (after the draws, so a lost one is recorded lost, a kept plain one just goes). **A settled dive keeps what it kept on `banked`** for the summary, so until `closeDive` those constructs sit in the bag *and* on `dive.banked`: A's `fitMovesets` skips a settled dive's `haul` and `banked` in its uniqueness check (the overview says so), and so do this plan's `uidsOf` / `held` helpers.
8. **`salvageCandidates` keeps its rune guard until D1.** The spec retires it, but the bot salvages what it names and uses no bag construct until D1: dropping the guard now would send dropped runes into a bag the bot can't reach and change its play (the fingerprint). D1 removes the guard in the commit that teaches the bot the bag ("Needs routed"). The client's "Salvage junk" sees the same list meanwhile.
9. **`salvageConstruct` in the dev chip's `'destroy'` mode** destroys the runes for nothing (the parts rule's `settleParts` does both modes); `'pay'`, the shipped mode, charges `pullScrap` by tier and refuses short of it.
10. **`moveAll` mints only the refill:** A's `moveAllPreview` gives the old weapon's plain-refilled moveset without uids; `mintMoveset` mints them, one `mintUid` a construct in chain order. The same helper serves `chooseStartingMana`.
11. **`chooseStartingMana` keeps the weapon's slots.** The spec replaces the constructs, not the frame: every slot (its start, a drop's free extras, bought ones) is refilled plain in the chosen primary, `bought` kept; the old constructs' runes leave by the parts rule as today; no Links (a socket never refunds now, and bought slots stay on the weapon). A new save's common sword has no socket, no rune and no extra slot, so the bot's start is as A recorded it.
12. **The stops** need one change: the `move` power-up builds the adjusted construct from the client's shape, which carries no (or a stale) uid; it must keep the saved construct's uid, or `setChains` would price a removal plus a new construct and mint a uid. `equip`, `slot` and `rune` already work in A's model (`slotPrice` is null at 0 slots, so a stop can never open a skill).
13. **`draftRefusal` takes an optional `opts`** (the pull mode: it changes a pull's scrap, so the Apply's affordability), beyond the contract's three parameters; compatible with C1's call.
14. **Two new test files, nothing shared with B1**: `tests/delve-constructs-ops.test.ts` and `tests/delve-constructs-invariant.test.ts`. The existing files whose assertions B2's salvage changes (`delve-salvage-yield.test.ts`, `delve-runes.test.ts`) are updated in Task 2 by what should now hold, named by title, since A rewrote their shapes.

## Conventions

The overview's. In short: one commit a task on `constructs/b2`, staged by path, ending `-m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`; never push or merge. Keep each file's line endings (the Edit tool does); new files LF. Never reformat `dive.ts` (its lines are long on purpose) or `balance.json`. "Replace:" (a block) "with:" (a block) is one Edit; every old block is unique in its file.

**Commands** (from `packages/engine`):

| What | Command |
|---|---|
| This area's tests | `npx vitest run tests/delve-constructs-ops.test.ts tests/delve-constructs-invariant.test.ts --reporter=dot` |
| Typecheck and a set of files | `npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot` |
| Whole engine suite (Task 11 only, ~12 min) | `npx vitest run --reporter=dot` |

Vitest doesn't typecheck (tests are outside `tsconfig`'s `include`), so a step's FAIL is an assertion failing, never a compile error. The engine's `tsconfig` sets no `noUnusedParameters`, so a kept-but-unused `opts` compiles.

Fixtures used below (`tests/fixtures/arena.ts`): `registry` (the default registry) and `bal` (its Delve balance). A new save's common sword (`createDelveProfile(registry, 3, { primary: 'fire' })`) holds the Basic's three blows and two Primary Strike constructs after A's slot table; `generateItem(registry, { uid, ilvl: 3, rarity, slot: 'weapon', baseId, mana: 'fire' }, new SeededRNG(seed))` is a drop (its constructs without uids until `addLootToBag` banks it). Runes that fit a Strike and a sword's blows: `quick`, `chain`; the Basic's and the Primary's starting slots on an uncommon sword are 3 and 2, its Defensive's 1 (the Ward).

---

## Chunk 1: The haul, the weapon's salvage, the settle

### Task 1: `Haul.constructs` flows: `addHaul`, `intoBag`, `mintMoveset`

**Files:**
- Modify: `packages/engine/src/loot/materials.ts`, `src/delve/constructs.ts`
- Create: `packages/engine/tests/delve-constructs-ops.test.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-constructs-ops.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { addHaul, addMaterial, emptyHaul } from '../src/loot/materials.js';
import { dormantUids, isPlain, movesetOf, weaponParts } from '../src/loot/moveset.js';
import { socketsOf } from '../src/loot/runes.js';
import { salvageYield } from '../src/loot/salvage-yield.js';
import {
  applyDraft,
  draftRefusal,
  intoBag,
  mintMoveset,
  moveAll,
  placeConstruct,
  salvageConstruct,
  unsocketConstruct,
  type ConstructDraft,
} from '../src/delve/constructs.js';
import { beginFloor, completeFloor, settleDive, startDive } from '../src/delve/dive.js';
import { addSlot, movesOf } from '../src/delve/moveset.js';
import { bindSecondary, chooseStartingMana, realign } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
  equipItem,
  parseDelveProfile,
  salvageItems,
  unequipSlot,
} from '../src/delve/profile.js';
import { openSocket, socketRune } from '../src/delve/runes.js';
import { stopKinds, takeStop } from '../src/delve/stops.js';
import type { Buff } from '../src/types/boon.js';
import { CHAIN_SKILLS, type Blow, type Construct, type Move } from '../src/types/ability.js';
import type { DelveProfile, DiveStop } from '../src/types/delve.js';
import type { GearItem, Rarity } from '../src/types/gear.js';
import { bal, registry } from './fixtures/arena.js';

// The constructs spec §3.3–3.5: the move bag's ops and the economy round them.

/** A Fire hero at the Anvil after one dive (edits priced), rich enough for every op, every plain construct kept. */
function hero(over: Partial<DelveProfile> = {}): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  return {
    ...p,
    stats: { ...p.stats, dives: 1 },
    scrap: 2000,
    manaDust: 500,
    links: 20,
    runes: { quick: [3, 0, 0, 0, 0], chain: [2, 0, 0, 0, 0] },
    autoSalvagePlain: false,
    ...over,
  };
}

/** A Fire weapon drop (its constructs without uids until it banks). */
const weapon = (uid: string, baseId: string, rarity: Rarity, seed = 1): GearItem =>
  generateItem(
    registry,
    { uid, ilvl: 3, rarity, slot: 'weapon', baseId, mana: 'fire' },
    new SeededRNG(seed),
  );

const ring = (uid: string): GearItem =>
  generateItem(
    registry,
    { uid, ilvl: 2, rarity: 'common', slot: 'ring', mana: 'fire' },
    new SeededRNG(1),
  );

/** `p` with `item` banked into the bag at the Anvil (its constructs minted). */
const banked = (p: DelveProfile, item: GearItem): DelveProfile =>
  addLootToBag(registry, p, [item]).profile;

const worn = (p: DelveProfile) => movesetOf(registry, p.equipped.weapon!);
const primary = (p: DelveProfile): Move[] => worn(p).chains.primary!.moves;
const basic = (p: DelveProfile): Blow[] => worn(p).chains.basic!;
const uids = (cs: readonly Construct[]) => cs.map((c) => c.uid!);

/** Every construct uid `p` holds: the worn weapon's, the bag weapons', the bag's, and an open dive's haul and banked (a settled dive's banked are in the bag already). */
function uidsOf(p: DelveProfile): string[] {
  const weapons = [p.equipped.weapon, ...p.bag].filter((i): i is GearItem => i?.slot === 'weapon');
  const held = weapons.flatMap((w) =>
    CHAIN_SKILLS.flatMap((s) => movesOf(movesetOf(registry, w).chains[s])),
  );
  const dive = p.dive && !p.dive.settled ? [...p.dive.haul.constructs, ...p.dive.banked.constructs] : [];
  return uids([...held, ...p.constructs, ...dive]);
}

/** The draft that is the save as it stands: the worn weapon's chains and the bag. */
const asIs = (p: DelveProfile): ConstructDraft => ({
  chains: { ...worn(p).chains },
  bag: [...p.constructs],
});

const strike = (uid: string): Move => ({ uid, kind: 'medium', form: 'strike', elements: ['fire'] });

describe('the haul carries constructs (materials.ts, constructs.ts)', () => {
  it("addHaul sums two hauls' constructs; emptyHaul holds none", () => {
    expect(emptyHaul().constructs).toEqual([]);
    const a = { ...emptyHaul(), constructs: [strike('c1')] };
    const b = { ...emptyHaul(), scrap: 3, constructs: [strike('c2'), strike('c3')] };
    expect(addHaul(a, b)).toMatchObject({ scrap: 3, constructs: [strike('c1'), strike('c2'), strike('c3')] });
    expect(addMaterial(a, { kind: 'dust' }, 2).constructs).toEqual([strike('c1')]);
  });

  it('intoBag appends to the bag; under autoSalvagePlain a plain construct is dropped', () => {
    const socketed = { ...strike('c2'), runes: [null] };
    const p = hero();
    expect(intoBag(p, [strike('c1'), socketed]).constructs).toEqual([strike('c1'), socketed]);
    expect(intoBag({ ...p, autoSalvagePlain: true }, [strike('c1'), socketed]).constructs).toEqual([socketed]);
    expect(intoBag(p, []).constructs).toEqual([]);
    expect(isPlain(socketed)).toBe(false);
  });

  it('mintMoveset mints a uid for each construct lacking one, in chain order, moving nextUid', () => {
    const p = hero();
    const moveset = {
      chains: {
        basic: [{ kind: 'light', element: 'fire' }, { uid: 'keep', kind: 'heavy', element: 'fire' }],
        primary: { moves: [{ kind: 'medium', form: 'strike', elements: ['fire'] }], payment: 'mana' },
      },
      slots: { basic: 2, primary: 1 },
      bought: {},
    } as const;
    const out = mintMoveset(p, moveset);
    expect(out.profile.nextUid).toBe(p.nextUid + 2);
    expect(uids(out.moveset.chains.basic!)).toEqual([`c${p.nextUid}`, 'keep']);
    expect(uids(out.moveset.chains.primary!.moves)).toEqual([`c${p.nextUid + 1}`]);
    expect(out.moveset.slots).toEqual(moveset.slots);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/engine && npx vitest run tests/delve-constructs-ops.test.ts --reporter=dot`
Expected: FAIL — the file doesn't load (`intoBag` and `mintMoveset` aren't exported from `constructs.ts`); once they are, `addHaul`'s test fails on `constructs: [c1]` (A's `addHaul` spreads `a`, so `b`'s are lost).

- [ ] **Step 3: `addHaul` sums the constructs**

In `packages/engine/src/loot/materials.ts`:

Replace:

```ts
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
```

with:

```ts
/** Two hauls summed: materials, scrap, Mana Dust, Links, runes and constructs (see the constructs spec §3.3). */
export function addHaul(a: Haul, b: Haul): Haul {
  return {
    ...addMaterials(a, b),
    scrap: a.scrap + b.scrap,
    dust: a.dust + b.dust,
    links: a.links + b.links,
    runes: sumKeys(a.runes, b.runes, sumTiers),
    constructs: [...a.constructs, ...b.constructs],
  };
}
```

(`stockHaul` is left alone: it has no registry, and `intoBag` is the one door into the bag.)

- [ ] **Step 4: `intoBag` and `mintMoveset` in `constructs.ts`**

Write `packages/engine/src/delve/constructs.ts` whole (A's file holds the contract's types and six "Not yet" stubs; check `git show constructs/main:packages/engine/src/delve/constructs.ts` first and keep any other export A added beside these):

```ts
import type { DataRegistry } from '../data/registry.js';
import { isPlain } from '../loot/moveset.js';
import { CHAIN_SKILLS, type Chains, type ChainSkill, type Construct } from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { Moveset } from '../types/gear.js';
import { movesOf } from './moveset.js';
import { mintUid, type ProfileActionResult } from './profile.js';
import type { SetChainsOptions } from './runes.js';

/**
 * Constructs (see the constructs spec §3): the move bag's ops. The draft
 * (`applyDraft`) is `setChains` grown: the free rearrangement (placing,
 * unsocketing, reordering) first, then `setChains` prices what changed on
 * each construct by uid. profile.ts, pair.ts, dive.ts and salvage-yield.ts
 * import this module back: keep to function declarations.
 */

/** The Skills tab's draft: the worn weapon's chains and the bag as the draft sees them. */
export interface ConstructDraft {
  chains: Partial<Chains>;
  bag: Construct[];
}

const NOT_YET = 'Not yet';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/**
 * `constructs` into the bag (the spec's auto-salvage of plain constructs,
 * §3.3): a plain one (no socket, no rune) is dropped when `autoSalvagePlain`.
 * Nothing is copied: no op changes a construct in place.
 */
export function intoBag(profile: DelveProfile, constructs: readonly Construct[]): DelveProfile {
  const kept = profile.autoSalvagePlain ? constructs.filter((c) => !isPlain(c)) : constructs;
  if (kept.length === 0) return profile;
  return { ...profile, constructs: [...profile.constructs, ...kept] };
}

/** `moveset` with a uid minted (`mintUid`) for each construct lacking one, in chain order: a plain refill's. */
export function mintMoveset(
  profile: DelveProfile,
  moveset: Moveset,
): { profile: DelveProfile; moveset: Moveset } {
  let p = profile;
  const chains: Partial<Chains> = {};
  for (const skill of CHAIN_SKILLS) {
    const chain = moveset.chains[skill];
    if (!chain) continue;
    const moves = movesOf(chain).map((c) => {
      if (c.uid) return c;
      const [uid, next] = mintUid(p);
      p = next;
      return { ...c, uid };
    });
    (chains as Record<ChainSkill, unknown>)[skill] = Array.isArray(chain) ? moves : { ...chain, moves };
  }
  return { profile: p, moveset: { ...moveset, chains } };
}

export function applyDraft(
  _registry: DataRegistry,
  profile: DelveProfile,
  _draft: ConstructDraft,
  _opts: SetChainsOptions = {},
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}

export function placeConstruct(
  _registry: DataRegistry,
  profile: DelveProfile,
  _uid: string,
  _skill: ChainSkill,
  _index: number,
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}

export function unsocketConstruct(
  _registry: DataRegistry,
  profile: DelveProfile,
  _skill: ChainSkill,
  _index: number,
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}

export function moveAll(_registry: DataRegistry, profile: DelveProfile, _uid: string): ProfileActionResult {
  return refuse(profile, NOT_YET);
}

export function salvageConstruct(
  _registry: DataRegistry,
  profile: DelveProfile,
  _uid: string,
  _opts: Pick<SetChainsOptions, 'unsocket'> = {},
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}

export function draftRefusal(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _draft: ConstructDraft,
  _opts: SetChainsOptions = {},
): string | null {
  return NOT_YET;
}
```

If A already exports a moveset-minting helper from `profile.ts` (`grep -n "mintUid" src/delve/profile.ts src/loot/*.ts`: `fitMovesets`, `addLootToBag` and `upgradeGear` mint whole movesets), use it in place of `mintMoveset`'s body (keep the export: pair.ts and `moveAll` call it) and say so in the commit.

- [ ] **Step 5: Run it to see it pass, with the files around it**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-ops.test.ts tests/delve-banking.test.ts tests/delve-crafting-contract.test.ts tests/delve-stops.test.ts --reporter=dot`
Expected: no type errors; all PASS (3 tests in the new file). The index's `export *` now also exports `intoBag` and `mintMoveset`; nothing in the client reads them.

Run the fingerprint check (Base). Expected: identical (`addHaul` sums an always-empty list on the bot's paths; the stubs refuse as before).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-constructs-b2
git add packages/engine/src/loot/materials.ts packages/engine/src/delve/constructs.ts packages/engine/tests/delve-constructs-ops.test.ts
git commit -m "feat(engine): the haul carries constructs: addHaul sums them, intoBag and mintMoveset" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: A weapon's salvage sends its constructs to the bag, or the haul

**Files:**
- Modify: `packages/engine/src/loot/salvage-yield.ts`, `src/delve/profile.ts`, `src/delve/dive.ts`, `src/types/crafting.ts` (A's: two lines, routed), `tests/delve-constructs-ops.test.ts`, `tests/delve-salvage-yield.test.ts`, `tests/delve-runes.test.ts`

- [ ] **Step 1: The failing tests**

Append to `tests/delve-constructs-ops.test.ts`:

```ts
describe("a weapon's salvage (salvage-yield.ts, profile.ts)", () => {
  /**
   * A Fire hero with an uncommon sword in the bag, built up first: a bought
   * Primary slot, Quick I in a socket on its first Primary construct and
   * Chain I on its first blow. 7 constructs: 3 blows, 3 Strikes, a Ward.
   */
  function built(): DelveProfile {
    let p = equipItem(registry, banked(hero(), weapon('w1', 'sword', 'uncommon')), 'w1');
    p = addSlot(registry, p, 'primary').profile;
    p = openSocket(registry, p, 'primary', 0).profile;
    p = socketRune(registry, p, 'primary', 0, 0, { id: 'quick', tier: 1 }).profile;
    p = openSocket(registry, p, 'basic', 0).profile;
    p = socketRune(registry, p, 'basic', 0, 0, { id: 'chain', tier: 1 }).profile;
    expect(primary(p)).toHaveLength(3);
    expect(socketsOf(primary(p)[0])).toEqual([{ id: 'quick', tier: 1 }]);
    return unequipSlot(registry, p, 'weapon');
  }

  it('its constructs go to the bag with their runes; one Link per bought slot; the pouch is untouched', () => {
    const p = built();
    const w = p.bag.find((i) => i.uid === 'w1')!;
    const y = salvageYield(registry, p, w);
    expect(y.constructs).toHaveLength(7);
    expect(y.links).toBe(1);
    expect(y.runes).toEqual([{ id: 'chain', tier: 1 }, { id: 'quick', tier: 1 }]);
    const res = salvageItems(registry, p, ['w1']);
    expect([res.count, res.links, res.runes, res.destroyed]).toEqual([1, 1, [], []]);
    expect(uids(res.constructs).sort()).toEqual(uids(y.constructs).sort());
    expect(res.profile.links).toBe(p.links + 1);
    expect(res.profile.runes).toEqual(p.runes);
    expect(uids(res.profile.constructs).sort()).toEqual(uids(y.constructs).sort());
    const socketed = res.profile.constructs.filter((c) => socketsOf(c).some((r) => r));
    expect(socketed.map((c) => socketsOf(c)[0]!.id).sort()).toEqual(['chain', 'quick']);
    expect(res.profile.bag.some((i) => i.uid === 'w1')).toBe(false);
    expect(res.profile.forgeCount).toBe(p.forgeCount + 1);
  });

  it('under autoSalvagePlain only the socketed constructs reach the bag', () => {
    const res = salvageItems(registry, { ...built(), autoSalvagePlain: true }, ['w1']);
    expect(res.constructs).toHaveLength(7);
    expect(res.profile.constructs).toHaveLength(2);
  });

  it("mid-dive (a full bag) they ride the floor's haul with uids, runes and all, and reach no bag", () => {
    const p = startDive(registry, hero(), 1);
    const full = { ...p, bag: Array.from({ length: bal.loot.bagSize }, (_, i) => ring(`r${i}`)) };
    const res = addLootToBag(registry, full, [weapon('w9', 'bow', 'magic')]);
    expect(res.bagFull).toBe(true);
    expect(res.constructs.length).toBeGreaterThanOrEqual(5);
    expect(res.constructs.every((c) => !!c.uid)).toBe(true);
    expect(res.profile.dive!.haul.constructs).toEqual(res.constructs);
    expect(res.profile.constructs).toEqual([]);
    expect(res.profile.nextUid).toBeGreaterThan(full.nextUid);
  });

  it("a completed floor moves them to banked; banking reports them (BankResult.constructs)", () => {
    const p = startDive(registry, hero(), 1);
    const full = { ...p, bag: Array.from({ length: bal.loot.bagSize }, (_, i) => ring(`r${i}`)) };
    const mid = addLootToBag(registry, full, [weapon('w9', 'bow', 'magic')]).profile;
    const world = beginFloor(registry, mid);
    const done = completeFloor(registry, mid, world);
    expect(done.constructs).toEqual([]);
    expect(done.profile.dive!.haul.constructs).toEqual([]);
    expect(uids(done.profile.dive!.banked.constructs)).toEqual(uids(mid.dive!.haul.constructs));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/engine && npx vitest run tests/delve-constructs-ops.test.ts --reporter=dot`
Expected: FAIL — the first (`y.constructs` undefined; the pouch gains the runes), the second (no `res.constructs`), the third (`res.constructs` undefined; the haul holds none) and the fourth (`done.constructs` undefined).

- [ ] **Step 3: `SalvageYield` and `SalvageResult` carry the constructs** (A's `types/crafting.ts`: two additive lines, listed under "Needs routed")

In `packages/engine/src/types/crafting.ts`:

Replace:

```ts
import type { ChainSkill } from './ability.js';
```

with:

```ts
import type { ChainSkill, Construct } from './ability.js';
```

Replace:

```ts
  /** A weapon's socketed runes, which go by the pull rule. */
  runes: RuneRef[];
}
```

with:

```ts
  /** A weapon's socketed runes: they ride its constructs (none is pulled). */
  runes: RuneRef[];
  /** A weapon's constructs, runes and all: to the bag, or mid-dive the floor's haul (see the constructs spec §3.3). */
  constructs: Construct[];
}
```

Replace:

```ts
  runes: RuneRef[];
  destroyed: RuneRef[];
}
```

with:

```ts
  runes: RuneRef[];
  destroyed: RuneRef[];
  /** Its constructs, into the bag or the haul. */
  constructs: Construct[];
}
```

- [ ] **Step 4: `applySalvage` sends them on and pulls nothing**

In `packages/engine/src/loot/salvage-yield.ts` (A's shape: `salvageLinks` already returns the bought slots' Links through `weaponParts`, and the `extraSlots` import is gone; the blocks below are untouched by A):

Replace:

```ts
import { settleParts, type SetChainsOptions } from '../delve/runes.js';
```

with:

```ts
import { intoBag } from '../delve/constructs.js';
import type { SetChainsOptions } from '../delve/runes.js';
```

Replace:

```ts
    essence,
    runes: parts.runes,
  };
}
```

with:

```ts
    essence,
    runes: parts.runes,
    constructs: parts.constructs,
  };
}
```

Replace (the whole of `applySalvage`, from its doc comment to the file's end):

```ts
/**
 * Salvage one item, drawing on `rng` (keyed on the item: `salvageRng`): scrap,
 * one of its lines' shards and maybe a second (a legendary its essence
 * instead), Mana Dust off the pair, a weapon's Links and its runes by the parts
 * rule (`opts.unsocket`, else the balance's). Mid-dive the yield goes to the
 * floor's haul (`dive.haul`), at the Anvil to the stockpile; its pattern is
 * learned and its essence seen at once. The item itself is the caller's to remove.
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
  let learned = y.pattern ? { ...profile, patterns: [...profile.patterns, y.pattern] } : profile;
  if (y.essence && !learned.essencesSeen.includes(y.essence))
    learned = { ...learned, essencesSeen: [...learned.essencesSeen, y.essence] };
  // A pattern learned is a quest state (`knowPatterns`): read it again.
  if (y.pattern) learned = applyQuestEvents(registry, learned, []);
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

with:

```ts
/**
 * Salvage one item, drawing on `rng` (keyed on the item: `salvageRng`): scrap,
 * one of its lines' shards and maybe a second (a legendary its essence
 * instead), Mana Dust off the pair, a weapon's Links (one per bought slot) and
 * its constructs, runes and all (see the constructs spec §3.3: no rune is
 * pulled, so `runes` and `destroyed` are empty). Mid-dive the yield goes to
 * the floor's haul (`dive.haul`), the constructs with it; at the Anvil to the
 * stockpile and the bag (`intoBag`: a plain construct is dropped under
 * `autoSalvagePlain`). Its pattern is learned and its essence seen at once.
 * The item itself is the caller's to remove. `opts` is unused since the
 * constructs (the pull rule no longer meets a salvaged weapon).
 */
export function applySalvage(
  registry: DataRegistry,
  profile: DelveProfile,
  item: GearItem,
  rng: SeededRNG,
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): SalvageResult {
  void opts;
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
  let haul = { ...emptyHaul(), scrap: y.scrap, dust: y.dust, links: y.links };
  for (const s of shards) haul = addMaterial(haul, { kind: 'shard', ...s });
  if (y.essence) haul = addMaterial(haul, { kind: 'essence', essence: y.essence });
  let learned = y.pattern ? { ...profile, patterns: [...profile.patterns, y.pattern] } : profile;
  if (y.essence && !learned.essencesSeen.includes(y.essence))
    learned = { ...learned, essencesSeen: [...learned.essencesSeen, y.essence] };
  // A pattern learned is a quest state (`knowPatterns`): read it again.
  if (y.pattern) learned = applyQuestEvents(registry, learned, []);
  const dive = profile.dive;
  const stocked =
    dive && isDiveActive(profile)
      ? { ...learned, dive: { ...dive, haul: addHaul(dive.haul, { ...haul, constructs: y.constructs }) } }
      : intoBag(stockHaul(learned, haul), y.constructs);
  return {
    profile: stocked,
    scrap: y.scrap,
    dust: y.dust,
    links: y.links,
    shards,
    pattern: y.pattern,
    essence: y.essence,
    runes: [],
    destroyed: [],
    constructs: y.constructs,
  };
}
```

In `packages/engine/src/delve/profile.ts` (`melt` and `Melted`; A leaves these blocks):

Replace:

```ts
  /** Runes the melted weapons' sockets destroyed. */
  destroyed: RuneRef[];
```

with:

```ts
  /** Runes the melted weapons' sockets destroyed (none since the constructs spec: a weapon's runes ride its constructs). */
  destroyed: RuneRef[];
  /** The melted weapons' constructs, runes and all: into the bag, or mid-dive the floor's haul (see the constructs spec §3.3). */
  constructs: Construct[];
```

Replace:

```ts
    destroyed: [],
    shards: [],
    patterns: [],
    essences: [],
  };
  let next = profile;
```

with:

```ts
    destroyed: [],
    constructs: [],
    shards: [],
    patterns: [],
    essences: [],
  };
  let next = profile;
```

Replace:

```ts
    out.destroyed.push(...r.destroyed);
```

with:

```ts
    out.destroyed.push(...r.destroyed);
    out.constructs.push(...r.constructs);
```

And the import: in the line `import { CHAIN_SKILLS, type Blow, type ChainSkill, type Move } from '../types/ability.js';` (A's shape may differ: it is the one import from `../types/ability.js`) add `type Construct`.

In `packages/engine/src/delve/dive.ts` (keep its long lines):

Replace:

```ts
  /** Links from weapons melted by auto-salvage or a full bag. */
  links: number;
```

with:

```ts
  /** Links from weapons melted by auto-salvage or a full bag. */
  links: number;
  /** Constructs of weapons melted by auto-salvage or a full bag, into the floor's haul (see the constructs spec §3.3). */
  constructs: Construct[];
```

Replace:

```ts
    links: bagged.links,
    runes,
    patterns,
```

with:

```ts
    links: bagged.links,
    constructs: bagged.constructs,
    runes,
    patterns,
```

Replace:

```ts
    return { profile: retried, kept: [], salvaged: [], bagFull: false, newCodex: [], newReactions: [], scrap: 0, dust: 0, links: 0, runes: [], patterns: [] };
```

with:

```ts
    return { profile: retried, kept: [], salvaged: [], bagFull: false, newCodex: [], newReactions: [], scrap: 0, dust: 0, links: 0, constructs: [], runes: [], patterns: [] };
```

Replace:

```ts
    essences: {},
    scrap: f(haul.scrap),
```

with:

```ts
    essences: {},
    constructs: [],
    scrap: f(haul.scrap),
```

And the import: add `import type { Construct } from '../types/ability.js';` after `import type { RuneRef } from '../types/rune.js';`.

- [ ] **Step 5: The assertions this changes elsewhere**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-ops.test.ts tests/delve-salvage-yield.test.ts tests/delve-runes.test.ts tests/delve-movesets.test.ts tests/delve-banking.test.ts --reporter=dot`
Expected: no type errors; the new file's 7 tests PASS; in the other files only tests about a salvaged weapon's runes fail (A rewrote the Links ones). Find them by title (`grep -n "it(" tests/delve-salvage-yield.test.ts tests/delve-runes.test.ts | grep -i -E "salvag|melt|choice of mana"`) and change what they expect, by what now holds:

- `delve-runes.test.ts` "salvage: a Link for each extra slot and open socket past the forged ones; the runes destroyed, or back to the pouch in pay mode" (A's title may differ): the runes are neither destroyed nor in the pouch in either mode; they sit on the constructs `salvageItems` gives (`res.constructs`), now in `profile.constructs`; `res.runes` and `res.destroyed` are `[]`; the Links are the bought slots' alone.
- "auto-salvage and a full bag melt a socketed weapon the same way": the same, into `dive.haul.constructs` mid-dive.
- "mid-dive an auto-salvaged weapon's runes go to the floor's haul by the pull mode given, never the pouch": the haul's `runes` pouch gains nothing; its `constructs` carry them.
- "conserves Links and runes over random transfers and salvages": a transfer is A's `moveAll` now (stubbed until Task 6). If A kept this test, its held-rune count (the assertion that the runes in every socket plus the pouch stay constant over the ops) must sum the pouch, the sockets on every weapon, the sockets on `profile.constructs` and on the dive's `haul.constructs` and `banked.constructs`; its Links assertion (never more than the start plus what the salvaged weapons' bought slots give) holds as it is.
- `delve-salvage-yield.test.ts`'s epic-sword cases (`sword()` with Split I in a socket): `salvageYield(...).runes` still lists Split I; `applySalvage`'s result has `runes: []`, `destroyed: []` and `constructs` holding the socketed one; the pouch is unchanged in both modes.
- "the choice of mana rebuilds the weapon: its sockets back as Links, its runes by the rule" is Task 9's (leave it failing only if it already fails; it is rewritten there).

Run the five files again. Expected: all PASS.

Run the fingerprint check. Expected: identical. The bot's salvage gives the same scrap, shards, patterns and Links (A's bought rule) as before this task; its constructs go into a bag the bot never reads, and `salvageCandidates` is unchanged (room 8).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-constructs-b2
git add packages/engine/src/loot/salvage-yield.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/dive.ts packages/engine/src/types/crafting.ts packages/engine/tests/delve-constructs-ops.test.ts packages/engine/tests/delve-salvage-yield.test.ts packages/engine/tests/delve-runes.test.ts
git commit -m "feat(engine): a salvaged weapon's constructs go to the bag, or mid-dive the haul, runes and all" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: The settle: an extract banks them, a death loses them

**Files:**
- Modify: `packages/engine/src/delve/dive.ts`, `tests/delve-constructs-ops.test.ts`

- [ ] **Step 1: The failing tests**

Append:

```ts
describe('the settle (dive.ts)', () => {
  const loss = bal.crafting.deathLoss;
  /** Diving at depth 1 with `n` constructs banked (the first two socketed) and two in the floor's haul. */
  function holding(n = 20, over: Partial<DelveProfile> = {}): DelveProfile {
    const p = startDive(registry, hero(over), 1);
    const cs = Array.from({ length: n }, (_, i) => strike(`b${i}`));
    cs[0] = { ...cs[0], runes: [{ id: 'quick', tier: 1 }] };
    cs[1] = { ...cs[1], runes: [null] };
    const dive = p.dive!;
    return {
      ...p,
      dive: {
        ...dive,
        banked: { ...dive.banked, scrap: 100, constructs: cs },
        haul: { ...dive.haul, constructs: [strike('h0'), strike('h1')] },
      },
    };
  }

  it('an extract puts every banked construct in the bag, once; the haul is already banked by then', () => {
    const p = holding();
    const out = settleDive(registry, p, 'extract');
    expect(uids(out.constructs)).toEqual(uids(p.dive!.banked.constructs));
    expect(out.dive).toMatchObject({ settled: true, lost: null });
    expect(uids(out.dive!.banked.constructs)).toEqual(uids(p.dive!.banked.constructs));
    expect(settleDive(registry, out, 'death')).toBe(out);
    // Settled, they sit on `banked` (the summary's) and in the bag until closeDive: the save reads back as it is.
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(out)))).toEqual({ profile: out });
  });

  it("a death loses the haul's outright and each banked one at deathLoss, drawn after the counts, recorded in lost", () => {
    const p = holding();
    const out = settleDive(registry, p, 'death');
    const { banked: kept, lost } = out.dive!;
    expect(settleDive(registry, p, 'death')).toEqual(out);
    expect(uids(lost!.constructs).slice(0, 2)).toEqual(['h0', 'h1']);
    const gone = uids(lost!.constructs).slice(2);
    expect(gone.length).toBeGreaterThan(2);
    expect(gone.length).toBeLessThan(18);
    expect([...uids(kept.constructs), ...gone].sort()).toEqual(uids(p.dive!.banked.constructs).sort());
    expect(uids(out.constructs)).toEqual(uids(kept.constructs));
    // Today's draws come first: the scrap share is what the same settle gives with no construct banked.
    const bare = { ...p, dive: { ...p.dive!, banked: { ...p.dive!.banked, constructs: [] }, haul: emptyHaul() } };
    expect(kept.scrap).toBe(settleDive(registry, bare, 'death').dive!.banked.scrap);
    expect(100 - kept.scrap === Math.floor(100 * loss) || 100 - kept.scrap === Math.ceil(100 * loss)).toBe(true);
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(out)))).toEqual({ profile: out });
  });

  it('Insurance takes its points off the constructs too; at a loss of 0 every one is kept', () => {
    const insured: Buff = { boon: 'insurance', tier: 3, effect: { deathLoss: loss } };
    const p = holding();
    const out = settleDive(registry, { ...p, dive: { ...p.dive!, diveBuffs: [insured] } }, 'death');
    expect(uids(out.dive!.banked.constructs)).toEqual(uids(p.dive!.banked.constructs));
    expect(uids(out.dive!.lost!.constructs)).toEqual(['h0', 'h1']);
  });

  it('under autoSalvagePlain the plain banked constructs are dropped at the settle, the socketed kept', () => {
    const out = settleDive(registry, holding(20, { autoSalvagePlain: true }), 'extract');
    expect(uids(out.constructs)).toEqual(['b0', 'b1']);
    const dead = settleDive(registry, holding(20, { autoSalvagePlain: true }), 'death');
    expect(dead.constructs.every((c) => !isPlain(c))).toBe(true);
    expect(dead.constructs.length + dead.dive!.lost!.constructs.filter((c) => !isPlain(c)).length).toBe(2);
    // What was lost is recorded lost, plain or not: the drop is only on what reaches the bag.
    const lost = dead.dive!.lost!.constructs;
    expect(uids(lost).slice(0, 2)).toEqual(['h0', 'h1']);
    expect(lost.filter(isPlain).length).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/engine && npx vitest run tests/delve-constructs-ops.test.ts --reporter=dot`
Expected: FAIL — the extract puts nothing in the bag; the death keeps every banked construct and loses only the haul's two (through `addHaul`); Insurance passes by accident (nothing is lost either way) — fine; the plain test finds 20 in the bag.

- [ ] **Step 3: The handler**

In `packages/engine/src/delve/dive.ts` (keep its long lines; never Prettier this file):

Replace:

```ts
import { addLootToBag } from './profile.js';
```

with:

```ts
import { addLootToBag } from './profile.js';
import { intoBag } from './constructs.js';
```

Replace:

```ts
    kept = addHaul(dive.banked, mapCounts(share, (n) => -n));
    lost = addHaul(dive.haul, share);
  }
```

with:

```ts
    kept = addHaul(dive.banked, mapCounts(share, (n) => -n));
    lost = addHaul(dive.haul, share);
    // Each banked construct is lost at `loss` too, one draw each after the counts (the constructs spec §3.3); the haul's go outright.
    const gone = dive.banked.constructs.map(() => rng.next() < loss);
    kept = { ...kept, constructs: dive.banked.constructs.filter((_, i) => !gone[i]) };
    lost = { ...lost, constructs: [...dive.haul.constructs, ...dive.banked.constructs.filter((_, i) => gone[i])] };
  }
```

Replace:

```ts
  const settled = resetDiveQuests(registry, {
    ...stockHaul(profile, kept),
    dive: { ...dive, haul: emptyHaul(), banked: kept, lost, settled: true },
  });
```

with:

```ts
  // What it kept goes to the stockpile, its constructs to the bag (`intoBag`: a plain one dropped under `autoSalvagePlain`).
  const settled = resetDiveQuests(registry, {
    ...intoBag(stockHaul(profile, kept), kept.constructs),
    dive: { ...dive, haul: emptyHaul(), banked: kept, lost, settled: true },
  });
```

Add to `settleDive`'s doc comment, after "banked essences exempt)": ", and its banked constructs one by one at the same share after the counts, the haul's outright (see the constructs spec §3.3); what it keeps goes to the bag, a plain construct dropped under `autoSalvagePlain`".

- [ ] **Step 4: Run them to see them pass**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-ops.test.ts tests/delve-banking.test.ts tests/delve-dive.test.ts tests/delve-boons-world.test.ts --reporter=dot`
Expected: no type errors; all PASS (11 tests in the new file). `delve-banking.test.ts`'s death test still passes: the counts draw first, and `addHaul(kept, { ...lost, essences: {} })` sums the (empty) construct lists.

Run the fingerprint check. Expected: identical (no banked construct on the bot's dives: it never fills its bag mid-dive, so no draw is added; and were one added it would come after the counts).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-constructs-b2
git add packages/engine/src/delve/dive.ts packages/engine/tests/delve-constructs-ops.test.ts
git commit -m "feat(engine): the settle banks a dive's constructs; a death loses the haul's and deathLoss of the banked" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Chunk 2: The draft

### Task 4: `applyDraft` and `draftRefusal`

**Files:**
- Modify: `packages/engine/src/delve/constructs.ts`, `tests/delve-constructs-ops.test.ts`

- [ ] **Step 1: The failing tests**

Append:

```ts
describe('applyDraft (constructs.ts)', () => {
  const { editDust, elementDust } = bal.movesets;

  it('the save as it stands applies for nothing and changes nothing but the Apply events', () => {
    const p = hero();
    const res = applyDraft(registry, p, asIs(p));
    expect(res.ok).toBe(true);
    expect([res.profile.manaDust, res.profile.links, res.profile.scrap]).toEqual([500, 20, 2000]);
    expect(worn(res.profile)).toEqual(worn(p));
    expect(res.profile.constructs).toEqual([]);
    expect(draftRefusal(registry, p, asIs(p))).toBeNull();
  });

  it('unsocketing is free: the construct goes to the bag as it was, the chain closes up', () => {
    const p = hero();
    const [a, b] = primary(p);
    const res = applyDraft(registry, p, {
      chains: { primary: { moves: [b], payment: 'mana' } },
      bag: [a],
    });
    expect(res.ok).toBe(true);
    expect(uids(primary(res.profile))).toEqual([b.uid]);
    expect(res.profile.constructs).toEqual([a]);
    expect(res.profile.manaDust).toBe(500);
    expect(res.profile.nextUid).toBe(p.nextUid);
  });

  it('placing from the bag is free, a reorder free; both together still free', () => {
    const p = hero();
    const [a, b] = primary(p);
    const out = applyDraft(registry, p, { chains: { primary: { moves: [b], payment: 'mana' } }, bag: [a] }).profile;
    const back = applyDraft(registry, out, { chains: { primary: { moves: [a, b], payment: 'mana' } }, bag: [] });
    expect(back.ok).toBe(true);
    expect(uids(primary(back.profile))).toEqual([a.uid, b.uid]);
    expect(back.profile.constructs).toEqual([]);
    expect(back.profile.manaDust).toBe(500);
    const swapped = applyDraft(registry, p, { chains: { primary: { moves: [b, a], payment: 'mana' } }, bag: [] });
    expect(uids(primary(swapped.profile))).toEqual([b.uid, a.uid]);
    expect(swapped.profile.manaDust).toBe(500);
  });

  it('a placed construct keeps its runes; its edits in the same Apply are priced as a kept construct', () => {
    let p = hero();
    p = openSocket(registry, p, 'primary', 0).profile;
    p = socketRune(registry, p, 'primary', 0, 0, { id: 'quick', tier: 1 }).profile;
    const [a, b] = primary(p);
    const out = applyDraft(registry, p, { chains: { primary: { moves: [b], payment: 'mana' } }, bag: [a] }).profile;
    expect(socketsOf(out.constructs[0])).toEqual([{ id: 'quick', tier: 1 }]);
    const heavy = { ...a, kind: 'heavy' as const };
    const back = applyDraft(registry, out, { chains: { primary: { moves: [b, heavy], payment: 'mana' } }, bag: [] });
    expect(back.ok).toBe(true);
    expect(primary(back.profile)[1]).toEqual(heavy);
    expect(back.profile.manaDust).toBe(out.manaDust - editDust);
    expect(back.profile.runes).toEqual(out.runes);
  });

  it("a new construct (no uid) is minted and priced; a changed element set elementDust; the bag's are unchanged", () => {
    const p = hero();
    const [a, b] = primary(p);
    const fresh: Move = { kind: 'light', form: 'strike', elements: ['fire'] };
    const res = applyDraft(registry, p, {
      chains: { primary: { moves: [a, b, fresh], payment: 'mana' } },
      bag: [],
    });
    expect(res.ok).toBe(false); // the common sword's Primary has 2 slots
    const roomy = addSlot(registry, p, 'primary').profile;
    const made = applyDraft(registry, roomy, {
      chains: { primary: { moves: [a, b, fresh], payment: 'mana' } },
      bag: [],
    });
    expect(made.ok).toBe(true);
    expect(primary(made.profile)[2]).toEqual({ ...fresh, uid: `c${roomy.nextUid}` });
    expect(made.profile.manaDust).toBe(roomy.manaDust - editDust);
    const bound = bindSecondary(registry, made.profile, 'frost').profile;
    const frost = applyDraft(registry, bound, {
      chains: { primary: { moves: [{ ...a, elements: ['frost'] }, b, primary(bound)[2]], payment: 'mana' } },
      bag: [],
    });
    expect(frost.profile.manaDust).toBe(bound.manaDust - elementDust);
  });

  it('refuses a uid in two places, an unknown uid, a construct of another skill, and a class the weapon cannot express', () => {
    const p = hero();
    const [a, b] = primary(p);
    const blow = basic(p)[0];
    expect(draftRefusal(registry, p, { chains: { primary: { moves: [a, b], payment: 'mana' } }, bag: [a] })).toBe('A construct is in one place');
    expect(draftRefusal(registry, p, { chains: { primary: { moves: [a, { ...b, uid: 'c999' }], payment: 'mana' } }, bag: [] })).toBe('Unknown construct c999');
    expect(draftRefusal(registry, p, { chains: { primary: { moves: [a, b], payment: 'mana' } }, bag: [{ kind: 'light', element: 'fire' }] })).toBe('Nothing new is made in the bag');
    const bagged = { ...p, constructs: [{ uid: 'cb', kind: 'medium', form: 'bolt', elements: ['fire'] } as Move, { ...blow, uid: 'cw' }] };
    expect(draftRefusal(registry, bagged, { chains: { primary: { moves: [a, { ...blow, uid: 'cw' } as unknown as Move], payment: 'mana' } }, bag: [b, bagged.constructs[0]] })).toBe('Not a primary construct');
    expect(draftRefusal(registry, bagged, { chains: { primary: { moves: [a, bagged.constructs[0]], payment: 'mana' } }, bag: [b, bagged.constructs[1]] })).toMatch(/^Sword can't express Bolt$/);
  });

  it('a dropped construct must be plain; under autoSalvagePlain a displaced plain one is deleted at Apply, a socketed one kept', () => {
    let p = hero();
    const [a, b] = primary(p);
    const dropped = applyDraft(registry, p, { chains: { primary: { moves: [b], payment: 'mana' } }, bag: [] });
    expect(dropped.ok).toBe(true);
    expect(dropped.profile.constructs).toEqual([]);
    p = openSocket(registry, p, 'primary', 0).profile;
    const socketed = primary(p)[0];
    expect(draftRefusal(registry, p, { chains: { primary: { moves: [b], payment: 'mana' } }, bag: [] })).toBe('Every construct is kept: unsocket it to the bag');
    const auto = { ...p, autoSalvagePlain: true };
    const out = applyDraft(registry, auto, { chains: { primary: { moves: [], payment: 'mana' } }, bag: [socketed, b] });
    expect(out.ok).toBe(true);
    expect(out.profile.constructs).toEqual([socketed]);
    expect(primary(out.profile)).toEqual([]);
    // Already in the bag, a plain construct stays through an Apply that doesn't touch it.
    const again = applyDraft(registry, { ...out.profile, constructs: [socketed, b] }, asIs({ ...out.profile, constructs: [socketed, b] }));
    expect(again.profile.constructs).toEqual([socketed, b]);
  });

  it('a chain the draft leaves out is unchanged; a bag entry still sitting in it is a uid in two places; the Basic keeps one blow', () => {
    const p = hero();
    const [a] = primary(p);
    expect(draftRefusal(registry, p, { chains: {}, bag: [a] })).toBe('A construct is in one place');
    expect(draftRefusal(registry, p, { chains: { basic: [] }, bag: basic(p) })).toMatch(/Basic|blow/i);
    expect(applyDraft(registry, startDive(registry, p, 1), asIs(p)).reason).toBe('Chains can only change between dives');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/engine && npx vitest run tests/delve-constructs-ops.test.ts --reporter=dot`
Expected: FAIL — every `applyDraft` returns "Not yet" (8 tests).

- [ ] **Step 3: The op**

In `packages/engine/src/delve/constructs.ts`:

Replace:

```ts
import type { DataRegistry } from '../data/registry.js';
import { isPlain } from '../loot/moveset.js';
import { CHAIN_SKILLS, type Chains, type ChainSkill, type Construct } from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { Moveset } from '../types/gear.js';
import { movesOf } from './moveset.js';
import { mintUid, type ProfileActionResult } from './profile.js';
import type { SetChainsOptions } from './runes.js';
```

with:

```ts
import type { DataRegistry } from '../data/registry.js';
import { constructSkill, formAllowed, isPlain, movesetOf } from '../loot/moveset.js';
import { CHAIN_SKILLS, type Chains, type ChainSkill, type Construct } from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { Moveset } from '../types/gear.js';
import { isDiveActive } from './dive.js';
import { movesOf, setChains } from './moveset.js';
import { mintUid, withMoveset, type ProfileActionResult } from './profile.js';
import type { SetChainsOptions } from './runes.js';
```

Replace:

```ts
const NOT_YET = 'Not yet';
```

with:

```ts
const NOT_YET = 'Not yet';
const BETWEEN_DIVES = 'Chains can only change between dives';
const UNARMED_TEXT = 'Equip a weapon to build your moves';
```

Replace:

```ts
export function applyDraft(
  _registry: DataRegistry,
  profile: DelveProfile,
  _draft: ConstructDraft,
  _opts: SetChainsOptions = {},
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}
```

with:

```ts
/** Where a saved construct sits: its chain's skill, or null in the bag. */
type Place = ChainSkill | null;

/**
 * The free part of a draft (the spec's §3.3: placing, unsocketing and
 * reordering cost nothing): every uid the draft's chains and bag hold is a
 * saved construct (in a chain or the bag) in one place; a construct placed
 * from the bag is of its chain's skill and of a form the weapon's class
 * expresses (a kept one may stay dormant); a saved construct the draft drops
 * is plain. A chain the draft leaves out is unchanged (so a bag entry still
 * sitting in it is a uid in two places). Gives the profile with the worn
 * weapon's chains and the bag rearranged, each construct its *saved* self in
 * its *draft* place (a new one, without a uid, left out), so `setChains` then
 * prices only what changed on each; a plain construct the draft displaced
 * into the bag is dropped under `autoSalvagePlain`. Or the refusal.
 */
function rearrange(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ConstructDraft,
): DelveProfile | string {
  if (isDiveActive(profile)) return BETWEEN_DIVES;
  const weapon = profile.equipped.weapon;
  if (!weapon) return UNARMED_TEXT;
  const moveset = movesetOf(registry, weapon);
  const saved = new Map<string, { c: Construct; at: Place }>();
  for (const skill of CHAIN_SKILLS)
    for (const c of movesOf(moveset.chains[skill])) saved.set(c.uid!, { c, at: skill });
  for (const c of profile.constructs) saved.set(c.uid!, { c, at: null });
  const seen = new Set<string>();
  const take = (uid: string): { c: Construct; at: Place } | string => {
    const was = saved.get(uid);
    if (!was) return `Unknown construct ${uid}`;
    if (seen.has(uid)) return 'A construct is in one place';
    seen.add(uid);
    return was;
  };
  const chains = { ...moveset.chains };
  for (const skill of CHAIN_SKILLS) {
    const held = moveset.chains[skill];
    if (!held) continue; // no slots: a draft chain there is setChains' refusal
    const moves: Construct[] = [];
    for (const m of movesOf(draft.chains[skill] ?? held)) {
      if (!m.uid) continue; // new: setChains mints and prices it
      const was = take(m.uid);
      if (typeof was === 'string') return was;
      if (constructSkill(registry, was.c) !== skill) return `Not a ${skill} construct`;
      if (was.at === null && 'form' in was.c && !formAllowed(registry, weapon.baseId, was.c.form))
        return `${registry.getGearBase(weapon.baseId).name} can't express ${registry.getForm(was.c.form).name}`;
      moves.push(was.c);
    }
    (chains as Record<ChainSkill, unknown>)[skill] = Array.isArray(held) ? moves : { ...held, moves };
  }
  const bag: Construct[] = [];
  for (const c of draft.bag) {
    if (!c.uid) return 'Nothing new is made in the bag';
    const was = take(c.uid);
    if (typeof was === 'string') return was;
    // Displaced into the bag: a plain one is deleted at Apply (the spec's auto-salvage).
    if (was.at !== null && profile.autoSalvagePlain && isPlain(was.c)) continue;
    bag.push(was.c);
  }
  for (const [uid, was] of saved)
    if (!seen.has(uid) && !isPlain(was.c)) return 'Every construct is kept: unsocket it to the bag';
  return { ...withMoveset(profile, { ...moveset, chains }), constructs: bag };
}

/**
 * Apply the Skills tab's draft, all or nothing (the constructs spec §3.3):
 * the free rearrangement (`rearrange`) of the worn weapon's chains and the
 * bag, then `setChains` on it with the draft's chains, which prices by uid
 * what changed on each construct (a kind or form `editDust`, an element set
 * `elementDust`, sockets and runes, a payment, a new construct `editDust`,
 * minted) and emits its events. Refuses what either refuses; the profile's
 * `constructs` becomes the draft's bag.
 */
export function applyDraft(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ConstructDraft,
  opts: SetChainsOptions = {},
): ProfileActionResult {
  const free = rearrange(registry, profile, draft);
  if (typeof free === 'string') return refuse(profile, free);
  const res = setChains(registry, free, draft.chains, opts);
  return res.ok ? res : { ...res, profile };
}
```

Replace:

```ts
export function draftRefusal(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _draft: ConstructDraft,
  _opts: SetChainsOptions = {},
): string | null {
  return NOT_YET;
}
```

with:

```ts
/** Why `draft` can't be applied (`applyDraft`'s dry run, the client's Apply reads it), or null. */
export function draftRefusal(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ConstructDraft,
  opts: SetChainsOptions = {},
): string | null {
  const free = rearrange(registry, profile, draft);
  if (typeof free === 'string') return free;
  const res = setChains(registry, free, draft.chains, opts);
  return res.ok ? null : (res.reason ?? 'Refused');
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-ops.test.ts tests/delve-movesets.test.ts tests/delve-runes.test.ts --reporter=dot`
Expected: no type errors; all PASS (19 tests in the new file). If the class refusal's text differs from `Sword can't express Bolt` only by the base's name, A's data names the base; read `registry.getGearBase('sword').name` and fix the test, not the text's shape. If "a new construct past the slots" passes instead of refusing, A's `setChains` doesn't check the slots: stop and ask the integrator (the contract says it does).

Run the fingerprint check. Expected: identical (the bot calls no op of this file).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-constructs-b2
git add packages/engine/src/delve/constructs.ts packages/engine/tests/delve-constructs-ops.test.ts
git commit -m "feat(engine): applyDraft: the free rearrangement, then setChains prices by uid; draftRefusal" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: `placeConstruct` and `unsocketConstruct`

**Files:**
- Modify: `packages/engine/src/delve/constructs.ts`, `tests/delve-constructs-ops.test.ts`

- [ ] **Step 1: The failing tests**

Append:

```ts
describe('placeConstruct and unsocketConstruct (constructs.ts)', () => {
  it('unsocket: to the bag, free; the chain closes up; the Basic keeps one blow', () => {
    const p = hero();
    const [a, b] = primary(p);
    const res = unsocketConstruct(registry, p, 'primary', 0);
    expect(res.ok).toBe(true);
    expect(uids(primary(res.profile))).toEqual([b.uid]);
    expect(res.profile.constructs).toEqual([a]);
    expect(res.profile.manaDust).toBe(500);
    expect(unsocketConstruct(registry, p, 'primary', 2).reason).toBe('Pick a move the chain holds');
    let one = p;
    one = unsocketConstruct(registry, one, 'basic', 2).profile;
    one = unsocketConstruct(registry, one, 'basic', 1).profile;
    expect(basic(one)).toHaveLength(1);
    expect(unsocketConstruct(registry, one, 'basic', 0).reason).toBe('The Basic keeps at least one blow');
    expect(one.constructs).toHaveLength(2);
  });

  it('place: into a free slot at its end, or over a construct, which goes to the bag; free; the wrong skill or class refused', () => {
    const p = hero();
    const [a, b] = primary(p);
    const out = unsocketConstruct(registry, p, 'primary', 0).profile;
    const over = placeConstruct(registry, out, a.uid!, 'primary', 0);
    expect(over.ok).toBe(true);
    expect(uids(primary(over.profile))).toEqual([a.uid]);
    expect(over.profile.constructs).toEqual([b]);
    const end = placeConstruct(registry, over.profile, b.uid!, 'primary', 1);
    expect(uids(primary(end.profile))).toEqual([a.uid, b.uid]);
    expect(end.profile.constructs).toEqual([]);
    expect(end.profile.manaDust).toBe(500);
    expect(placeConstruct(registry, out, a.uid!, 'primary', 2).reason).toBe('No slot there');
    expect(placeConstruct(registry, out, a.uid!, 'basic', 0).reason).toBe('Not a basic construct');
    expect(placeConstruct(registry, out, a.uid!, 'defensive', 0).reason).toBe('This weapon has no defensive slots');
    expect(placeConstruct(registry, out, 'c999', 'primary', 0).reason).toBe('Not in your bag');
    const bolt: Move = { uid: 'cb', kind: 'medium', form: 'bolt', elements: ['fire'] };
    expect(placeConstruct(registry, { ...out, constructs: [bolt] }, 'cb', 'primary', 1).reason).toBe("Sword can't express Bolt");
  });

  it('a dormant construct placed by Move all may be reordered, never placed from the bag; place never checks the pair', () => {
    const p = hero();
    const frost: Move = { uid: 'cf', kind: 'medium', form: 'strike', elements: ['frost'] };
    const out = placeConstruct(registry, { ...p, constructs: [frost] }, 'cf', 'primary', 1);
    expect(out.ok).toBe(true);
    expect(primary(out.profile)[1]).toEqual(frost);
    expect(out.profile.manaDust).toBe(500);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/engine && npx vitest run tests/delve-constructs-ops.test.ts --reporter=dot`
Expected: FAIL — "Not yet" (3 tests).

- [ ] **Step 3: The ops**

In `packages/engine/src/delve/constructs.ts`:

Replace:

```ts
import { CHAIN_SKILLS, type Chains, type ChainSkill, type Construct } from '../types/ability.js';
```

with:

```ts
import {
  CHAIN_SKILLS,
  type Blow,
  type Chains,
  type ChainSkill,
  type Construct,
  type Move,
} from '../types/ability.js';
```

Replace:

```ts
export function placeConstruct(
  _registry: DataRegistry,
  profile: DelveProfile,
  _uid: string,
  _skill: ChainSkill,
  _index: number,
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}

export function unsocketConstruct(
  _registry: DataRegistry,
  profile: DelveProfile,
  _skill: ChainSkill,
  _index: number,
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}
```

with:

```ts
/** `chain` with its constructs replaced by `moves` (a chain of blows stays one). */
function withMoves(chain: Chains[ChainSkill], moves: Construct[]): Chains[ChainSkill] {
  return Array.isArray(chain) ? (moves as Blow[]) : { ...chain, moves: moves as Move[] };
}

/**
 * Place bag construct `uid` into slot `index` of the worn weapon's `skill`
 * chain: at the chain's end into a free slot, else over the construct there,
 * which goes to the bag. Free (a one-op `applyDraft`, which refuses the wrong
 * skill, a form the weapon's class can't express, mid-dive and unarmed; the
 * pair is never checked, see the spec's §3.4).
 */
export function placeConstruct(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  skill: ChainSkill,
  index: number,
): ProfileActionResult {
  const weapon = profile.equipped.weapon;
  if (!weapon) return refuse(profile, UNARMED_TEXT);
  const c = profile.constructs.find((x) => x.uid === uid);
  if (!c) return refuse(profile, 'Not in your bag');
  const moveset = movesetOf(registry, weapon);
  const chain = moveset.chains[skill];
  if (!chain) return refuse(profile, `This weapon has no ${skill} slots`);
  const moves = movesOf(chain);
  if (!Number.isInteger(index) || index < 0 || index > moves.length || index >= moveset.slots[skill]!)
    return refuse(profile, 'No slot there');
  const next = [...moves];
  const out = next.splice(index, 1, c); // at the end: appended, nothing out
  return applyDraft(registry, profile, {
    chains: { [skill]: withMoves(chain, next) },
    bag: [...profile.constructs.filter((x) => x.uid !== uid), ...out],
  });
}

/**
 * Unsocket the construct at `index` of the worn weapon's `skill` chain into
 * the bag; the chain closes up. Free (a one-op `applyDraft`). The Basic keeps
 * at least one blow.
 */
export function unsocketConstruct(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: ChainSkill,
  index: number,
): ProfileActionResult {
  const weapon = profile.equipped.weapon;
  if (!weapon) return refuse(profile, UNARMED_TEXT);
  const chain = movesetOf(registry, weapon).chains[skill];
  const moves = movesOf(chain);
  const c = Number.isInteger(index) ? moves[index] : undefined;
  if (!chain || !c) return refuse(profile, 'Pick a move the chain holds');
  if (skill === 'basic' && moves.length === 1) return refuse(profile, 'The Basic keeps at least one blow');
  return applyDraft(registry, profile, {
    chains: { [skill]: withMoves(chain, moves.filter((_, i) => i !== index)) },
    bag: [...profile.constructs, c],
  });
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-ops.test.ts --reporter=dot`
Expected: no type errors; all PASS (22 tests). Run the fingerprint check. Expected: identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-constructs-b2
git add packages/engine/src/delve/constructs.ts packages/engine/tests/delve-constructs-ops.test.ts
git commit -m "feat(engine): placeConstruct and unsocketConstruct, one-op drafts" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Chunk 3: Move all and a construct's salvage

### Task 6: `moveAll`

**Files:**
- Modify: `packages/engine/src/delve/constructs.ts`, `tests/delve-constructs-ops.test.ts`

- [ ] **Step 1: The failing tests**

Append:

```ts
describe('moveAll (constructs.ts)', () => {
  /** A hero whose sword holds a bought third Primary slot and Quick I on its first Strike, a magic bow in the bag. */
  function ready(): DelveProfile {
    let p = banked(hero(), weapon('bow1', 'bow', 'magic', 7));
    p = addSlot(registry, p, 'primary').profile;
    p = openSocket(registry, p, 'primary', 0).profile;
    return socketRune(registry, p, 'primary', 0, 0, { id: 'quick', tier: 1 }).profile;
  }

  it("every construct goes onto the target slot for slot, the target's own to the bag, its class-blind ones dormant; the old weapon refills plain, minted; no scrap", () => {
    const p = ready();
    const bow = p.bag.find((i) => i.uid === 'bow1')!;
    const bowSet = movesetOf(registry, bow);
    // The sword moves into the Basic and the Primary alone: the bow's own constructs there are displaced;
    // a chain the sword moves nothing into (its Defensive, the Ward) keeps the bow's own.
    const moved = CHAIN_SKILLS.filter((s) => worn(p).chains[s]);
    const bowOwn = uids(moved.flatMap((s) => movesOf(bowSet.chains[s])));
    const swordUids = uids(CHAIN_SKILLS.flatMap((s) => movesOf(worn(p).chains[s])));
    const res = moveAll(registry, p, 'bow1');
    expect(res.ok).toBe(true);
    const q = res.profile;
    expect(q.equipped.weapon!.uid).toBe('bow1');
    expect(res.item).toBe(q.equipped.weapon);
    // Slot for slot: the bow's Primary slots hold the sword's first Strikes (dormant: a bow can't express Strike), its Basic the sword's blows.
    const onBow = CHAIN_SKILLS.flatMap((s) => movesOf(worn(q).chains[s]));
    const dormant = dormantUids(registry, q.equipped.weapon!);
    expect(uids(primary(q)).every((u) => swordUids.includes(u) && dormant.has(u))).toBe(true);
    expect(uids(basic(q)).every((u) => swordUids.includes(u))).toBe(true);
    expect(socketsOf(primary(q)[0])).toEqual([{ id: 'quick', tier: 1 }]);
    // Past the bow's slots and the bow's own: in the bag (every plain construct kept here).
    const bagUids = uids(q.constructs);
    for (const u of bowOwn) expect(bagUids).toContain(u);
    for (const u of swordUids) expect(bagUids.includes(u) || onBow.some((c) => c.uid === u)).toBe(true);
    expect(moved).toEqual(['basic', 'primary']);
    expect(worn(q).chains.defensive).toEqual(bowSet.chains.defensive);
    expect(new Set(uidsOf(q)).size).toBe(uidsOf(q).length);
    // The old sword: in the bag, its slots kept (the bought one too), each refilled plain with a fresh uid.
    const old = q.bag.find((i) => i.uid === p.equipped.weapon!.uid)!;
    const oldSet = movesetOf(registry, old);
    expect(oldSet.slots).toEqual(worn(p).slots);
    expect(oldSet.bought).toEqual(worn(p).bought);
    const refill = CHAIN_SKILLS.flatMap((s) => movesOf(oldSet.chains[s]));
    expect(refill.every((c) => isPlain(c) && !!c.uid && !swordUids.includes(c.uid))).toBe(true);
    expect(q.nextUid).toBe(p.nextUid + refill.length);
    expect([q.scrap, q.links, q.manaDust, q.runes]).toEqual([p.scrap, p.links, p.manaDust, p.runes]);
  });

  it('under autoSalvagePlain the displaced plain constructs are deleted, the socketed kept', () => {
    const p = { ...ready(), autoSalvagePlain: true };
    const q = moveAll(registry, p, 'bow1').profile;
    expect(q.constructs.every((c) => !isPlain(c))).toBe(true);
  });

  it('refuses mid-dive, unarmed and anything but a bag weapon', () => {
    const p = ready();
    expect(moveAll(registry, startDive(registry, p, 1), 'bow1').reason).toBe('Move your constructs between dives');
    expect(moveAll(registry, unequipSlot(registry, p, 'weapon'), 'bow1').reason).toBe('Equip a weapon to build your moves');
    expect(moveAll(registry, p, 'nope').reason).toBe('Move onto a weapon in your bag');
    expect(moveAll(registry, { ...p, bag: [...p.bag, ring('r1')] }, 'r1').reason).toBe('Move onto a weapon in your bag');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/engine && npx vitest run tests/delve-constructs-ops.test.ts --reporter=dot`
Expected: FAIL — "Not yet" (3 tests).

- [ ] **Step 3: The op**

In `packages/engine/src/delve/constructs.ts`:

Replace:

```ts
import { constructSkill, formAllowed, isPlain, movesetOf } from '../loot/moveset.js';
```

with:

```ts
import { constructSkill, formAllowed, isPlain, moveAllPreview, movesetOf } from '../loot/moveset.js';
```

Replace:

```ts
import type { SetChainsOptions } from './runes.js';
```

with:

```ts
import type { SetChainsOptions } from './runes.js';
import { applyTutorialEvents } from './tutorial.js';
```

Replace:

```ts
export function moveAll(_registry: DataRegistry, profile: DelveProfile, _uid: string): ProfileActionResult {
  return refuse(profile, NOT_YET);
}
```

with:

```ts
/**
 * Move all (the constructs spec §3.3): every construct on the worn weapon
 * goes onto bag weapon `uid` slot for slot, each chain's payment with it
 * (`moveAllPreview`); those past the target's slots and the target's own go
 * to the bag (`intoBag`); those the target's class can't express stay,
 * dormant. The old weapon goes to the bag refilled plain in its every slot,
 * its uids minted here (`mintMoveset`). No scrap; commits at once. Refuses
 * mid-dive, unarmed and anything but a bag weapon. Emits the tutorial's `moveAll`.
 */
export function moveAll(registry: DataRegistry, profile: DelveProfile, uid: string): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Move your constructs between dives');
  const worn = profile.equipped.weapon;
  if (!worn) return refuse(profile, UNARMED_TEXT);
  const target = profile.bag.find((i) => i.uid === uid && i.slot === 'weapon');
  if (!target) return refuse(profile, 'Move onto a weapon in your bag');
  const { moveset, toBag, old } = moveAllPreview(registry, worn, target);
  const refill = mintMoveset(profile, old);
  const item = { ...target, moveset };
  const moved: DelveProfile = {
    ...refill.profile,
    equipped: { ...profile.equipped, weapon: item },
    bag: [...profile.bag.filter((i) => i.uid !== uid), { ...worn, moveset: refill.moveset }],
  };
  return {
    ok: true,
    item,
    profile: applyTutorialEvents(registry, intoBag(moved, toBag), [{ type: 'moveAll' }]),
  };
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-ops.test.ts tests/delve-tutorial-bot.test.ts --reporter=dot`
Expected: no type errors; the new file's 25 tests PASS. `delve-tutorial-bot.test.ts` is D1's (the lesson's `'transfer'` op is A's no-op stub): it passes or is skipped as A left it; don't fix it here.

Run the fingerprint check. Expected: identical (the bot's `transferBest` is A's no-op until D1).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-constructs-b2
git add packages/engine/src/delve/constructs.ts packages/engine/tests/delve-constructs-ops.test.ts
git commit -m "feat(engine): moveAll: every construct onto the target, the old weapon refilled plain" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: `salvageConstruct`

**Files:**
- Modify: `packages/engine/src/delve/constructs.ts`, `tests/delve-constructs-ops.test.ts`

- [ ] **Step 1: The failing tests**

Append:

```ts
describe('salvageConstruct (constructs.ts)', () => {
  const { pullScrap } = bal.runes;
  /** A hero with its first Strike (Quick I socketed) and a plain blow in the bag. */
  function bagged(): DelveProfile {
    let p = hero();
    p = openSocket(registry, p, 'primary', 0).profile;
    p = socketRune(registry, p, 'primary', 0, 0, { id: 'quick', tier: 1 }).profile;
    p = unsocketConstruct(registry, p, 'primary', 0).profile;
    return unsocketConstruct(registry, p, 'basic', 2).profile;
  }

  it("a bag construct: its runes to the pouch at the pull price, salvageDust Dust, nothing else; refused short of the scrap", () => {
    const p = bagged();
    const [socketed, blow] = p.constructs;
    const res = salvageConstruct(registry, p, socketed.uid!, { unsocket: 'pay' });
    expect(res.ok).toBe(true);
    expect(res.runes).toEqual([{ id: 'quick', tier: 1 }]);
    expect(res.profile.runes.quick).toEqual([p.runes.quick[0] + 1, 0, 0, 0, 0]);
    expect(res.profile.scrap).toBe(p.scrap - pullScrap[0]);
    expect(res.profile.manaDust).toBe(p.manaDust + bal.movesets.salvageDust);
    expect(res.profile.links).toBe(p.links);
    expect(res.profile.constructs).toEqual([blow]);
    const plain = salvageConstruct(registry, res.profile, blow.uid!, { unsocket: 'pay' });
    expect([plain.ok, plain.runes, plain.profile.scrap, plain.profile.constructs]).toEqual([true, [], res.profile.scrap, []]);
    expect(salvageConstruct(registry, { ...p, scrap: pullScrap[0] - 1 }, socketed.uid!, { unsocket: 'pay' }).reason).toBe('Not enough scrap to pull its runes');
  });

  it("in 'destroy' (the dev chip) the runes are destroyed for nothing", () => {
    const p = bagged();
    const res = salvageConstruct(registry, p, p.constructs[0].uid!, { unsocket: 'destroy' });
    expect([res.runes, res.destroyed, res.profile.scrap]).toEqual([[], [{ id: 'quick', tier: 1 }], p.scrap]);
    expect(res.profile.runes).toEqual(p.runes);
  });

  it("the balance's mode is the default (ships 'pay'); refused mid-dive and for a uid not in the bag", () => {
    const p = bagged();
    expect(bal.runes.unsocket).toBe('pay');
    expect(salvageConstruct(registry, p, p.constructs[0].uid!).profile.scrap).toBe(p.scrap - pullScrap[0]);
    expect(salvageConstruct(registry, startDive(registry, p, 1), p.constructs[0].uid!).reason).toBe('Salvage between dives');
    expect(salvageConstruct(registry, p, primary(p)[0].uid!).reason).toBe('Not in your bag');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/engine && npx vitest run tests/delve-constructs-ops.test.ts --reporter=dot`
Expected: FAIL — "Not yet" (3 tests).

- [ ] **Step 3: The op**

In `packages/engine/src/delve/constructs.ts`:

Replace:

```ts
import type { SetChainsOptions } from './runes.js';
import { applyTutorialEvents } from './tutorial.js';
```

with:

```ts
import { settleParts, unsocketMode, type SetChainsOptions } from './runes.js';
import { applyTutorialEvents } from './tutorial.js';
import { socketsOf } from '../loot/runes.js';
import type { RuneRef } from '../types/rune.js';
```

Replace:

```ts
export function salvageConstruct(
  _registry: DataRegistry,
  profile: DelveProfile,
  _uid: string,
  _opts: Pick<SetChainsOptions, 'unsocket'> = {},
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}
```

with:

```ts
/**
 * Salvage bag construct `uid` (the constructs spec §3.3): its runes back to
 * the pouch at the pull price (`pullScrap` by tier in 'pay', `opts.unsocket`
 * else the balance's; destroyed for nothing in 'destroy') and
 * `movesets.salvageDust` Mana Dust; its sockets and the Dust spent on it are
 * not refunded. Refuses mid-dive, a uid not in the bag, and short of the
 * scrap. Commits at once (the client's Undo keeps the save from before).
 */
export function salvageConstruct(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Salvage between dives');
  const c = profile.constructs.find((x) => x.uid === uid);
  if (!c) return refuse(profile, 'Not in your bag');
  const bal = registry.getDelveBalance();
  const runes = socketsOf(c).filter((r): r is RuneRef => r !== null);
  const pay = unsocketMode(registry, opts.unsocket) === 'pay';
  const scrap = pay ? runes.reduce((sum, r) => sum + bal.runes.pullScrap[r.tier - 1], 0) : 0;
  if (profile.scrap < scrap) return refuse(profile, 'Not enough scrap to pull its runes');
  const settled = settleParts(registry, profile.runes, runes, opts.unsocket);
  return {
    ok: true,
    runes: settled.runes,
    destroyed: settled.destroyed,
    profile: {
      ...profile,
      constructs: profile.constructs.filter((x) => x.uid !== uid),
      scrap: profile.scrap - scrap,
      manaDust: profile.manaDust + bal.movesets.salvageDust,
      runes: settled.pouch,
    },
  };
}
```

Delete the now-unused `const NOT_YET = 'Not yet';` line.

- [ ] **Step 4: Run them to see them pass**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-ops.test.ts tests/delve-runes-contract.test.ts --reporter=dot`
Expected: no type errors; all PASS (28 tests in the new file). Run the fingerprint check. Expected: identical.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-constructs-b2
git add packages/engine/src/delve/constructs.ts packages/engine/tests/delve-constructs-ops.test.ts
git commit -m "feat(engine): salvageConstruct: a bag construct's runes back at the pull price" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Chunk 4: The stops and the pair

### Task 8: The stops' power-ups in the new model

**Files:**
- Modify: `packages/engine/src/delve/stops.ts`, `tests/delve-constructs-ops.test.ts`

- [ ] **Step 1: The failing tests**

Append:

```ts
describe("the stops' power-ups (stops.ts)", () => {
  const ALL: DiveStop = { kind: 'powerups', offers: ['equip', 'slot', 'move', 'upgrade', 'rune'], taken: false };
  /** `p` on the door screen after depth 1, holding every power-up. */
  function atStop(p: DelveProfile): DelveProfile {
    const d = startDive(registry, p, 1);
    return { ...d, dive: { ...d.dive!, phase: 'choosing', depthsCleared: 1, doorChoices: ['winding'], stop: ALL } };
  }

  it("'move' adjusts a construct in place: its uid, sockets and runes stay, one editDust, no uid minted", () => {
    let p = hero();
    p = openSocket(registry, p, 'primary', 0).profile;
    p = socketRune(registry, p, 'primary', 0, 0, { id: 'quick', tier: 1 }).profile;
    const at = atStop(p);
    const was = primary(at)[0];
    const res = takeStop(registry, at, {
      kind: 'move',
      skill: 'primary',
      index: 0,
      move: { kind: 'heavy', form: 'strike', elements: ['fire'], uid: 'stale', runes: [] } as Move,
    });
    expect(res.ok).toBe(true);
    const now = primary(res.profile)[0];
    expect(now).toEqual({ ...was, kind: 'heavy' });
    expect(res.profile.nextUid).toBe(at.nextUid);
    expect(res.profile.manaDust).toBe(at.manaDust - bal.movesets.editDust);
    expect(res.profile.dive!.stop!.taken).toBe(true);
  });

  it("'slot' adds a bought slot under the ceiling, plain-filled; it never opens a skill", () => {
    const at = atStop(hero());
    const slot = takeStop(registry, at, { kind: 'slot', skill: 'primary' });
    expect(slot.ok).toBe(true);
    expect(worn(slot.profile).slots.primary).toBe(3);
    expect(worn(slot.profile).bought?.primary).toBe(1);
    expect(isPlain(primary(slot.profile)[2])).toBe(true);
    expect(primary(slot.profile)[2].uid).toBe(`c${at.nextUid}`);
    const open = takeStop(registry, at, { kind: 'slot', skill: 'defensive' });
    expect(open.ok).toBe(false);
    expect(stopKinds(registry, { ...hero(), links: 0 })).not.toContain('slot');
  });

  it("'equip' equips a bag weapon with its own constructs; the old one keeps its own", () => {
    const p = banked(hero(), weapon('bow1', 'bow', 'uncommon'));
    const at = atStop(p);
    const res = takeStop(registry, at, { kind: 'equip', uid: 'bow1' });
    expect(res.ok).toBe(true);
    expect(res.profile.equipped.weapon!.uid).toBe('bow1');
    expect(primary(res.profile).every((m) => m.form === 'bolt' && !!m.uid)).toBe(true);
    expect(res.profile.constructs).toEqual([]);
    expect(new Set(uidsOf(res.profile)).size).toBe(uidsOf(res.profile).length);
  });

  it("'rune' sockets a pouch rune into an empty socket, as before", () => {
    const at = atStop(openSocket(registry, hero(), 'primary', 1).profile);
    const res = takeStop(registry, at, { kind: 'rune', skill: 'primary', index: 1, socket: 0, rune: { id: 'chain', tier: 1 } });
    expect(res.ok).toBe(true);
    expect(socketsOf(primary(res.profile)[1])).toEqual([{ id: 'chain', tier: 1 }]);
    expect(primary(res.profile)[1].uid).toBe(primary(at)[1].uid);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/engine && npx vitest run tests/delve-constructs-ops.test.ts --reporter=dot`
Expected: FAIL — the `move` test (the adjusted construct has no uid, or `nextUid` moved and two `editDust` were charged: A's `setChains` saw a removal and a new construct); the other three PASS already (A's `addSlot`, `slotPrice`, `equipItem` and `socketRune` do it; they pin it).

- [ ] **Step 3: The handler**

In `packages/engine/src/delve/stops.ts` (`runStop`'s `move` case; A's mechanical edits in this file are the `carriedByText` lines, not these):

Replace:

```ts
      // The saved move's sockets and runes stay; any the client sent are ignored.
      const { runes: _sent, ...shape } = move;
      const saved = moves[index].runes;
      const next = (saved ? { ...shape, runes: saved } : shape) as Move | Blow;
```

with:

```ts
      // The saved construct is adjusted in place (the constructs spec §3.3): its uid, sockets and
      // runes stay; any the client sent are ignored (a uid-less construct would be new to `setChains`).
      const { runes: _sent, uid: _uid, ...shape } = move;
      const saved = moves[index];
      const next = { ...shape, uid: saved.uid, ...(saved.runes && { runes: saved.runes }) } as Move | Blow;
```

`moveShaped` (the type guard above it) doesn't read `uid`; nothing else changes.

- [ ] **Step 4: Run them to see them pass**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-ops.test.ts tests/delve-stops.test.ts tests/delve-runes.test.ts tests/delve-maps-interact.test.ts --reporter=dot`
Expected: no type errors; all PASS (32 tests in the new file). `delve-runes.test.ts`'s "the 'move' stop keeps the saved move's runes, whatever the client sends" still holds.

Run the fingerprint check. Expected: identical. The bot's `takeBestStop` takes a boons stop's boon, and at a guided stop or an alcove the named kind; a `move` it takes now keeps the uid, as A's recording already had it: if A's recording shows the stop's `move` minting (the probe differs on `nextUid`), A's stop was the broken one and this task is the fix: say so and re-record, noting it in the handback.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-constructs-b2
git add packages/engine/src/delve/stops.ts packages/engine/tests/delve-constructs-ops.test.ts
git commit -m "feat(engine): the stop's 'move' adjusts a construct in place, its uid kept" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: The pair on constructs

**Files:**
- Modify: `packages/engine/src/delve/pair.ts`, `tests/delve-constructs-ops.test.ts`, `tests/delve-runes.test.ts`

- [ ] **Step 1: The failing tests**

Append:

```ts
describe('the pair on constructs (pair.ts)', () => {
  it("chooseStartingMana replaces the starting weapon's constructs with plain ones in the primary, every slot refilled, minted; its runes by the parts rule; no Links", () => {
    const fresh = createDelveProfile(registry, 3);
    expect(fresh.pair.primary).toBeNull();
    // Give its sword a bought slot, a socket and a rune first, as a hand-edited save might.
    const sword = fresh.equipped.weapon!;
    const set = movesetOf(registry, sword);
    const [a, ...rest] = set.chains.primary!.moves;
    const tricked: DelveProfile = {
      ...fresh,
      equipped: {
        ...fresh.equipped,
        weapon: {
          ...sword,
          moveset: {
            ...set,
            chains: { ...set.chains, primary: { ...set.chains.primary!, moves: [{ ...a, kind: 'heavy', runes: [{ id: 'quick', tier: 2 }] }, ...rest] } },
            slots: { ...set.slots, primary: (set.slots.primary ?? 2) + 1 },
            bought: { ...set.bought, primary: 1 },
          },
        },
      },
    };
    const res = chooseStartingMana(registry, tricked, 'frost', { unsocket: 'pay' });
    expect(res.ok).toBe(true);
    const q = res.profile;
    const after = worn(q);
    expect(after.slots).toEqual(tricked.equipped.weapon!.moveset!.slots);
    expect(after.bought).toEqual({ ...set.bought, primary: 1 });
    const all = CHAIN_SKILLS.flatMap((s) => movesOf(after.chains[s]));
    expect(all).toHaveLength(3 + 3);
    expect(all.every((c) => isPlain(c) && !!c.uid)).toBe(true);
    expect(primary(q).every((m) => m.elements.join() === 'frost' && m.form === 'strike')).toBe(true);
    expect(basic(q).every((b) => b.element === 'frost')).toBe(true);
    expect(q.nextUid).toBe(tricked.nextUid + 6);
    expect(res.runes).toEqual([{ id: 'quick', tier: 2 }]);
    expect(q.runes.quick).toEqual([0, 1, 0, 0, 0]);
    expect([q.links, res.links, q.constructs]).toEqual([tricked.links, undefined, []]);
    expect(chooseStartingMana(registry, q, 'fire').reason).toBe('Your mana is already chosen');
  });

  it('a new save after the choice holds its slots plain-filled in the primary, each with a uid; the save round-trips', () => {
    const p = createDelveProfile(registry, 3, { primary: 'storm' });
    const all = CHAIN_SKILLS.flatMap((s) => movesOf(worn(p).chains[s]));
    expect(all.map((c) => ('element' in c ? c.element : c.elements.join()))).toEqual(Array(all.length).fill('storm'));
    expect(new Set(uids(all)).size).toBe(all.length);
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))).toEqual({ profile: p });
  });

  it("realign maps only the worn weapon's constructs; the bag's and a bag weapon's keep their elements", () => {
    let p = bindSecondary(registry, banked(hero(), weapon('bow1', 'bow', 'uncommon')), 'frost').profile;
    p = unsocketConstruct(registry, p, 'primary', 1).profile;
    const bagWas = p.constructs;
    const bowWas = movesetOf(registry, p.bag.find((i) => i.uid === 'bow1')!);
    const res = realign(registry, { ...p, manaDust: 999, scrap: 9999 }, { primary: 'storm' });
    expect(res.ok).toBe(true);
    expect(primary(res.profile).every((m) => m.elements.join() === 'storm')).toBe(true);
    expect(res.profile.constructs).toEqual(bagWas);
    expect(movesetOf(registry, res.profile.bag.find((i) => i.uid === 'bow1')!)).toEqual(bowWas);
    expect(res.fixed!.length).toBe(1 + basic(p).length);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/engine && npx vitest run tests/delve-constructs-ops.test.ts --reporter=dot`
Expected: FAIL — the first test (A's `chooseStartingMana` resets the slots to their starts, or refunds Links; whichever A's mechanical edit left). The second and third PASS already (A's new save; `fixChainsToPair` reads the worn weapon alone); they pin it.

- [ ] **Step 3: The handler** (A's shape: A's mechanical edit replaced the `weaponParts` / `extraSlots` lines here; replace from the line `const parts = weaponParts(registry, weapon);` (or what A made of it) to the function's closing brace)

In `packages/engine/src/delve/pair.ts`:

Replace (today's lines; A's version of the first three may differ, the `return` is as today):

```ts
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

with:

```ts
  // Its constructs are replaced by plain ones in `mana` (the constructs spec §3.4): every slot,
  // bought or free, stays and is refilled (`bought` kept), the old constructs' runes leave by
  // the parts rule, and no Links come back (a socket never refunds; bought slots stay on the weapon).
  const moveset = movesetOf(registry, weapon);
  const settled = settleParts(registry, profile.runes, weaponParts(registry, weapon).runes, opts.unsocket);
  const fresh = mintMoveset(
    { ...profile, equipped, pair, runes: settled.pouch },
    { ...defaultMoveset(registry, weapon, mana, moveset.slots), bought: moveset.bought },
  );
  return {
    ok: true,
    runes: settled.runes,
    destroyed: settled.destroyed,
    profile: {
      ...fresh.profile,
      equipped: { ...equipped, weapon: { ...weapon, moveset: fresh.moveset } },
    },
  };
}
```

Imports: `import { defaultMoveset, heroChains, movesetOf, weaponParts } from '../loot/moveset.js';` (A dropped `extraSlots`; `movesetOf` and `weaponParts` stay) and add `import { mintMoveset } from './constructs.js';` after the `./tutorial.js` import. Update `chooseStartingMana`'s doc comment: replace "and the equipped weapon's moveset starts over at its base slots, every move the default in it. Its open sockets come back as Links and its runes by the parts rule (`opts.unsocket`; its extra slots aren't refunded)." with "and the equipped weapon's constructs are replaced by plain ones in it, every slot refilled (see the constructs spec §3.4); their runes leave by the parts rule (`opts.unsocket`); no Links."

If A's `chooseStartingMana` already mints (room 11; `grep -n mint src/delve/pair.ts`), the shape above replaces its minting one for one: the fingerprint check in Step 4 is the proof that the count is the same.

- [ ] **Step 4: Run them to see them pass; the old choice-of-mana test**

Run: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-ops.test.ts tests/delve-pair.test.ts tests/delve-runes.test.ts tests/delve-movesets.test.ts --reporter=dot`
Expected: no type errors; the new file's 35 tests PASS; in `delve-runes.test.ts`, "the choice of mana rebuilds the weapon: its sockets back as Links, its runes by the rule" (A's title may differ) fails on the Links: change it to expect no Links, the slots kept and refilled plain, the runes by the rule as before. `delve-pair.test.ts`'s "chooseStartingMana: … the weapon's moveset rebuilt; once" expects a rebuilt default moveset: it still holds (the starter sword has only its starting slots) unless it reads `extraSlots`; if A rewrote it, leave it.

Run the fingerprint check. Expected: identical: the bot's new save has a common sword with its starting slots, no socket and no rune, so this op mints the same constructs A's did and refunds nothing either way.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-constructs-b2
git add packages/engine/src/delve/pair.ts packages/engine/tests/delve-constructs-ops.test.ts packages/engine/tests/delve-runes.test.ts
git commit -m "feat(engine): chooseStartingMana refills the starting weapon plain in the primary; realign stays on the worn weapon" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Chunk 5: The invariant test and verification

### Task 10: The invariant test (spec §8)

**Files:**
- Create: `packages/engine/tests/delve-constructs-invariant.test.ts`

- [ ] **Step 1: The test**

Create `packages/engine/tests/delve-constructs-invariant.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { emptyHaul } from '../src/loot/materials.js';
import { formAllowed, isPlain, movesetOf, weaponParts } from '../src/loot/moveset.js';
import { socketsOf } from '../src/loot/runes.js';
import {
  applyDraft,
  moveAll,
  placeConstruct,
  salvageConstruct,
  unsocketConstruct,
} from '../src/delve/constructs.js';
import { forge, openSkill } from '../src/delve/crafting.js';
import { closeDive, settleDive, startDive } from '../src/delve/dive.js';
import { addSlot, movesOf } from '../src/delve/moveset.js';
import { bindSecondary } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
  equipItem,
  parseDelveProfile,
  salvageItems,
  upgradeGear,
} from '../src/delve/profile.js';
import { openSocket, socketRune } from '../src/delve/runes.js';
import { ABILITY_SLOTS, CHAIN_SKILLS, type ChainSkill, type Construct, type Move } from '../src/types/ability.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem, Rarity } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gear.js';
import { registry } from './fixtures/arena.js';

// The constructs spec §8's invariant test: thousands of random operations. Constructs appear
// only from a drop, a forge, a new construct, a bought, opened or upgraded slot, or a plain
// refill, and disappear only through a salvage, a plain delete or a dive's death loss; runes
// are never made and leave only by a pull, a salvage at the pull price or a death; Links are
// minted only by a weapon's bought slots on salvage, never more than were paid.

afterEach(() => new Promise((r) => setTimeout(r)));

const RUNES = ['quick', 'chain', 'widen', 'echo', 'detonate'];
const WEAPONS = ['sword', 'axe', 'dagger', 'bow', 'staff', 'wand'];

/**
 * Every construct the save holds, by uid: the worn weapon's, the bag weapons', the bag's, and an
 * open dive's haul and banked (a settled dive's banked are in the bag already, kept for the summary:
 * A's `fitMovesets` skips them the same way).
 */
function held(p: DelveProfile): Map<string, Construct> {
  const weapons = [p.equipped.weapon, ...p.bag].filter((i): i is GearItem => i?.slot === 'weapon');
  const all = [
    ...weapons.flatMap((w) => CHAIN_SKILLS.flatMap((s) => movesOf(movesetOf(registry, w).chains[s]))),
    ...p.constructs,
    ...(p.dive && !p.dive.settled ? [...p.dive.haul.constructs, ...p.dive.banked.constructs] : []),
  ];
  const map = new Map<string, Construct>();
  for (const c of all) {
    expect(c.uid, 'a construct without a uid').toBeTruthy();
    expect(map.has(c.uid!), `uid ${c.uid} twice`).toBe(false);
    map.set(c.uid!, c);
  }
  return map;
}

/** Every rune the save holds, socketed anywhere or loose (the pouch, the haul's, the banked), as "id:tier" counts. */
function runes(p: DelveProfile, cs = held(p)): Map<string, number> {
  const out = new Map<string, number>();
  const add = (id: string, tier: number, n = 1) => out.set(`${id}:${tier}`, (out.get(`${id}:${tier}`) ?? 0) + n);
  for (const c of cs.values()) for (const r of socketsOf(c)) if (r) add(r.id, r.tier);
  const pouches = [p.runes, ...(p.dive ? [p.dive.haul.runes, p.dive.banked.runes] : [])];
  for (const pouch of pouches)
    for (const [id, counts] of Object.entries(pouch)) counts.forEach((n, i) => n && add(id, i + 1, n));
  return out;
}

const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const links = (p: DelveProfile) => p.links + (p.dive ? p.dive.haul.links + p.dive.banked.links : 0);

const drop = (uid: string, rng: SeededRNG): GearItem =>
  generateItem(
    registry,
    {
      uid,
      ilvl: 5,
      rarity: RARITY_ORDER[rng.nextInt(0, 4)] as Rarity,
      slot: 'weapon',
      baseId: WEAPONS[rng.nextInt(0, WEAPONS.length - 1)],
      mana: rng.next() < 0.7 ? 'fire' : 'storm',
    },
    rng.fork(uid),
  );

/** A rich Fire+Frost hero at the Anvil after one dive, every pattern known, the bag never filling. */
function rich(seed: number, autoSalvagePlain: boolean): DelveProfile {
  let p = createDelveProfile(registry, seed, { primary: 'fire' });
  p = bindSecondary(registry, p, 'frost').profile;
  const materials = { ...p.materials, metals: { ...p.materials.metals, rusty: 999 }, flux: { uncommon: 99, magic: 99, rare: 99, epic: 99 } };
  return {
    ...p,
    stats: { ...p.stats, dives: 1 },
    scrap: 1e7,
    manaDust: 1e6,
    links: 30,
    runes: Object.fromEntries(RUNES.map((id) => [id, [20, 10, 5, 0, 0]])),
    materials,
    patterns: registry.getDelveData().bases.filter((b) => b.slot === 'weapon').map((b) => b.id),
    autoSalvagePlain,
  };
}

/**
 * What one op may do: `born` new uids; `gone` the uids a death lost (none otherwise), and `plain`
 * whether plain constructs may go too (the auto-salvage); `runesBorn` runes it may bring (a drop's
 * or a forge's socketed rune, `runeChance`); the Links it paid for slots (`addSlot`, `openSkill`)
 * and got back (a weapon's salvage).
 */
interface Allowed {
  born: boolean;
  gone: Set<string>;
  plain: boolean;
  runesBorn: boolean;
  paid: number;
  back: number;
}

const pick = <T>(xs: readonly T[], rng: SeededRNG): T | undefined => (xs.length ? xs[rng.nextInt(0, xs.length - 1)] : undefined);

/** One random op on `p`: the profile after it and what it was allowed to do. */
function step(p: DelveProfile, rng: SeededRNG, n: number): { p: DelveProfile; may: Allowed } {
  const none: Allowed = { born: false, gone: new Set(), plain: false, runesBorn: false, paid: 0, back: 0 };
  const auto = p.autoSalvagePlain;
  const weapon = p.equipped.weapon;
  const set = weapon ? movesetOf(registry, weapon) : null;
  const skills = set ? CHAIN_SKILLS.filter((s) => set.chains[s]) : [];
  const bagWeapons = p.bag.filter((i) => i.slot === 'weapon');
  switch (rng.nextInt(0, 15)) {
    case 0: {
      // A drop banks (it may roll a socketed rune: `rollSocketedRunes`).
      return { p: addLootToBag(registry, p, [drop(`d${n}`, rng)]).profile, may: { ...none, born: true, runesBorn: true } };
    }
    case 1: {
      // A forge.
      const grade = pick(['uncommon', 'magic', 'rare', 'epic'] as const, rng)!;
      const res = forge(registry, p, {
        baseId: pick(WEAPONS, rng)!,
        metal: 'rusty',
        flux: rng.next() < 0.8 ? grade : undefined,
        element: 'fire',
        shards: [],
      });
      // A forge follows a drop's rolls (the spec's §3.5), so it may bring a rune too.
      return { p: res.profile, may: { ...none, born: res.ok, runesBorn: res.ok } };
    }
    case 2: {
      const target = pick(bagWeapons, rng);
      return { p: target ? equipItem(registry, p, target.uid) : p, may: none };
    }
    case 3: {
      // Place a bag construct.
      const c = pick(p.constructs, rng);
      if (!c || !set) return { p, may: none };
      const skill = 'element' in c ? 'basic' : registry.getForm(c.form).slot;
      const moves = movesOf(set.chains[skill]);
      const res = placeConstruct(registry, p, c.uid!, skill, rng.nextInt(0, moves.length));
      return { p: res.profile, may: { ...none, plain: res.ok && auto } };
    }
    case 4: {
      const skill = pick(skills, rng);
      if (!skill || !set) return { p, may: none };
      const res = unsocketConstruct(registry, p, skill, rng.nextInt(0, movesOf(set.chains[skill]).length));
      return { p: res.profile, may: { ...none, plain: res.ok && auto } };
    }
    case 5: {
      // A reorder.
      const skill = pick(skills, rng);
      if (!skill || !set) return { p, may: none };
      const moves = [...movesOf(set.chains[skill])];
      for (let i = moves.length - 1; i > 0; i--) {
        const j = rng.nextInt(0, i);
        [moves[i], moves[j]] = [moves[j], moves[i]];
      }
      const chain = set.chains[skill]!;
      const next = Array.isArray(chain) ? moves : { ...chain, moves: moves as Move[] };
      return { p: applyDraft(registry, p, { chains: { [skill]: next }, bag: p.constructs }).profile, may: none };
    }
    case 6: {
      // A new construct in a free slot.
      const skill = pick(skills.filter((s) => movesOf(set!.chains[s]).length < set!.slots[s]!), rng);
      if (!skill || !set || !weapon) return { p, may: none };
      const chain = set.chains[skill]!;
      const forms = registry.getArpgData().forms.filter((f) => f.slot === skill && formAllowed(registry, weapon.baseId, f.id));
      const fresh: Construct = Array.isArray(chain)
        ? { kind: 'medium', element: 'frost' }
        : { kind: 'medium', form: pick(forms, rng)!.id, elements: ['frost'] };
      const next = Array.isArray(chain) ? [...chain, fresh] : { ...chain, moves: [...chain.moves, fresh as Move] };
      const res = applyDraft(registry, p, { chains: { [skill]: next }, bag: p.constructs });
      return { p: res.profile, may: { ...none, born: res.ok } };
    }
    case 7: {
      const target = pick(bagWeapons, rng);
      const res = target ? moveAll(registry, p, target.uid) : null;
      return { p: res?.profile ?? p, may: res?.ok ? { ...none, born: true, plain: auto } : none };
    }
    case 8: {
      const c = pick(p.constructs, rng);
      const res = c ? salvageConstruct(registry, p, c.uid!) : null;
      return { p: res?.profile ?? p, may: res?.ok ? { ...none, gone: new Set([c!.uid!]) } : none };
    }
    case 9: {
      // A bag weapon's salvage: its constructs to the bag, its bought slots' Links back.
      const target = pick(bagWeapons, rng);
      if (!target) return { p, may: none };
      const bought = weaponParts(registry, target).links;
      const res = salvageItems(registry, p, [target.uid]);
      expect(res.links).toBe(bought);
      return { p: res.profile, may: { ...none, back: res.links, plain: auto } };
    }
    case 10: {
      const skill = pick(skills, rng);
      const res = skill ? addSlot(registry, p, skill) : null;
      return { p: res?.profile ?? p, may: res?.ok ? { ...none, born: true, paid: p.links - res.profile.links } : none };
    }
    case 11: {
      // Open a skill on the worn or a bag weapon.
      const target = pick([weapon, ...bagWeapons].filter((i): i is GearItem => !!i), rng);
      const skill = pick(ABILITY_SLOTS, rng)!;
      const res = target ? openSkill(registry, p, target.uid, skill) : null;
      return { p: res?.profile ?? p, may: res?.ok ? { ...none, born: true, paid: p.links - res.profile.links } : none };
    }
    case 12: {
      const target = pick([weapon, ...bagWeapons].filter((i): i is GearItem => !!i), rng);
      const res = target ? upgradeGear(registry, p, target.uid) : null;
      return { p: res?.profile ?? p, may: res?.ok ? { ...none, born: true } : none };
    }
    case 13: {
      // A socket opened, or a pouch rune socketed, on the worn weapon.
      const skill = pick(skills, rng);
      if (!skill || !set) return { p, may: none };
      const moves = movesOf(set.chains[skill]);
      const index = rng.nextInt(0, Math.max(0, moves.length - 1));
      if (!moves[index]) return { p, may: none };
      const sockets = socketsOf(moves[index]);
      const empty = sockets.findIndex((r) => r === null);
      if (empty < 0 || rng.next() < 0.3) return { p: openSocket(registry, p, skill, index).profile, may: none };
      const ref = { id: pick(RUNES, rng)!, tier: rng.nextInt(1, 3) };
      return { p: socketRune(registry, p, skill, index, empty, ref).profile, may: none };
    }
    default: {
      // A dive that banks some bag constructs, then settles (an extract, or a death that loses some).
      if (p.constructs.length < 2) return { p, may: none };
      const half = Math.floor(p.constructs.length / 2);
      const d = startDive(registry, p, 1);
      const diving: DelveProfile = {
        ...d,
        constructs: p.constructs.slice(half),
        dive: {
          ...d.dive!,
          banked: { ...emptyHaul(), constructs: p.constructs.slice(0, half) },
          haul: { ...emptyHaul(), constructs: [] },
        },
      };
      const outcome = rng.next() < 0.5 ? 'extract' : 'death';
      const settled = settleDive(registry, diving, outcome);
      // Settled, the kept constructs sit in the bag and on `banked` (the summary's) until closeDive: unique and loadable as such.
      held(settled);
      expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(settled)))).toEqual({ profile: settled });
      const lost = new Set((settled.dive!.lost?.constructs ?? []).map((c) => c.uid!));
      return { p: closeDive(registry, settled), may: { ...none, gone: lost, plain: auto } };
    }
  }
}

function play(seed: number, ops: number, autoSalvagePlain: boolean): void {
  const rng = new SeededRNG(seed);
  let p = rich(seed, autoSalvagePlain);
  let before = held(p);
  let runesBefore = runes(p, before);
  let slotLinksPaid = 0;
  let linksBack = 0;
  for (let n = 0; n < ops; n++) {
    const { p: next, may } = step(p, rng, n);
    const after = held(next);
    // Uids: born only where allowed; gone only what a death lost, or a salvaged one, or a plain one under the auto-salvage.
    for (const uid of after.keys())
      if (!before.has(uid)) expect(may.born, `op ${n}: uid ${uid} appeared`).toBe(true);
    for (const [uid, c] of before)
      if (!after.has(uid))
        expect(may.gone.has(uid) || (may.plain && isPlain(c)), `op ${n}: ${uid} vanished`).toBe(true);
    // Runes: made only by a drop's or a forge's roll; otherwise the total falls only by what a death's lost constructs and pouches carried.
    const runesAfter = runes(next, after);
    if (!may.runesBorn)
      for (const [key, count] of runesAfter) expect(count, `op ${n}: ${key} grew`).toBeLessThanOrEqual(runesBefore.get(key) ?? 0);
    if (!may.runesBorn && may.gone.size === 0) expect(total(runesAfter), `op ${n}: runes lost`).toBe(total(runesBefore));
    // A drop's or a forge's roll may add runes, never take any: a melted drop's ride its constructs into the bag.
    if (may.runesBorn) expect(total(runesAfter), `op ${n}: runes lost on a roll`).toBeGreaterThanOrEqual(total(runesBefore));
    // Links: minted only by a weapon's bought slots on salvage, never more than were paid for slots.
    slotLinksPaid += may.paid;
    linksBack += may.back;
    expect(linksBack, `op ${n}: Links minted`).toBeLessThanOrEqual(slotLinksPaid);
    if (!may.back && !may.paid && may.gone.size === 0)
      expect(links(next), `op ${n}: Links changed`).toBeLessThanOrEqual(links(p));
    // The save reads back as it is: every construct in a slot of its skill, within the slots, the Basic never empty.
    if (n % 25 === 24) expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(next)))).toEqual({ profile: next });
    p = next;
    before = after;
    runesBefore = runesAfter;
  }
  expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))).toEqual({ profile: p });
}

describe('the constructs invariants (spec §8)', () => {
  it('seeds 1–3, 700 ops each, every plain construct kept', () => {
    for (const seed of [1, 2, 3]) play(seed, 700, false);
  });

  it('seeds 4–5, 700 ops each, plain constructs auto-salvaged', () => {
    for (const seed of [4, 5]) play(seed, 700, true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd packages/engine && npx vitest run tests/delve-constructs-invariant.test.ts --reporter=dot`
Expected: PASS, 2 tests, under 60 s (each op is an Anvil op; the parse round-trip runs every 25). A failure names the op and the uid or rune: read it as a bug in the op it names (Tasks 2–9), not in the test, unless the op's `Allowed` is too strict: a `socketRune` over a filled socket pulls into the pouch (allowed: the total holds), `upgradeGear` may refuse at max (no change), `openSkill` on a weapon whose skill has slots refuses (no change). If `parseDelveProfile` returns `{ reset: true }`, A's `fitMovesets` found a construct out of place: the op before it put it there (the assertion's `n` says which).

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/alloy-constructs-b2
git add packages/engine/tests/delve-constructs-invariant.test.ts
git commit -m "test(engine): the constructs invariants over thousands of random ops" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 11: Verification

- [ ] **Step 1: The whole engine suite, the typecheck, the bundle**

```bash
cd /c/Projects/alloy-constructs-b2/packages/engine && npx tsc --noEmit -p . && npx vitest run --reporter=dot && npx tsup
```

Expected: no type errors; the suite passes with the base's count + 37 tests and + 2 files (`delve-pacing-robust` keeps its 2 known failures; run nothing else meanwhile: a loaded machine times out `delve-autopilot-crafting.test.ts`'s first test, which passes alone); tsup's three "Build success" lines.

- [ ] **Step 2: The client still builds on the bundle**

```bash
cd /c/Projects/alloy-constructs-b2/packages/client && npx tsc --noEmit -p .
```

Expected: no type errors. The exported types this area changed are additive (`Melted.constructs`, `BankResult.constructs`, `SalvageYield.constructs`, `SalvageResult.constructs`, `ConstructDraft` unchanged, `draftRefusal`'s optional `opts`); a client file that builds a `BankResult` or `Melted` literal by hand would fail here: fix it with `constructs: []` and list it in the handback.

- [ ] **Step 3: The fingerprint**

Run the fingerprint check (Base). Expected: identical.

- [ ] **Step 4: Hand back**

Report the branch `constructs/b2` and its ten commits, the "Needs routed" list and the open questions below, to the integrator. Don't merge.

---

## Needs routed

1. **`packages/engine/src/types/crafting.ts` (A's file), Task 2 Step 3:** three additive lines: `Construct` in the `./ability.js` import (line 1), `constructs: Construct[]` on `SalvageYield` (after `runes: RuneRef[];`, line 156) and on `SalvageResult` (after `destroyed: RuneRef[];`, line 169). B2 applies them in its worktree to compile; the integrator keeps them at merge.
2. **`packages/engine/src/loot/materials.ts` (no owner), Task 1 Step 3:** `addHaul` (line 82) sums `constructs`.
3. **D1 (`delve/profile.ts`, `salvageCandidates`, line 467):** drop `weaponParts(registry, item).runes.length === 0 &&` in the commit that teaches the bot the bag (`salvageConstruct`, placing), and re-record the fingerprint there; the doc line 453 loses "and no weapon holding runes". Until then the guard stays (room 8).
4. **D1 (`delve/tutorial.ts`, lines 243–249 and 314–317):** `tutorialHolds`' and `lessonSkippable`'s `transfer` cases (A renamed the trigger `moveAll` and stubbed the bot's op): the hold is "the rare is worn and holds the lesson's Primary constructs" (by uid, from `moveAll`'s result), the skip "no bag weapon of the rarity" (Move all is free: no scrap test).
5. **C2 (the Loadout's salvage label and toasts):** `SalvageResult.runes` and `destroyed` are always `[]` for a weapon now; `SalvageYield.runes` lists the runes riding its constructs and `SalvageYield.constructs` / `Melted.constructs` / `BankResult.constructs` what went to the bag or the haul ("n moves to your bag, m runes with them").
6. **C1 (the store's `applyDraft` action):** `applyDraft(registry, profile, { chains, bag }, { unsocket })` and `draftRefusal(registry, profile, draft, { unsocket })`; the draft's bag entries are read by uid only (room 2), and a plain construct the draft displaced is deleted at Apply under `autoSalvagePlain` (so Revert still brings it back). A plain construct the draft leaves out of both its chains and its bag is dropped at Apply **even with the toggle off** (room 4): the Skills tab's Remove must put it in the draft's bag while the toggle is off.
7. **`tests/delve-runes.test.ts` and `tests/delve-salvage-yield.test.ts` (A rewrites them first):** B2 edits their salvage and choice-of-mana assertions after A (Task 2 Step 5, Task 9 Step 4); at merge A's versions come first, B2's edits on top.
8. **D2:** the `unsocket` option on `applySalvage`, `melt`, `salvageItems`, `addLootToBag`, `bankWorld`, `completeFloor` and `failFloor` is unused since Task 2 (a weapon's runes ride its constructs); removing it is a client-wide edit (`arena/useArena.ts`, the store's salvage actions).
9. **CLAUDE.md (D2):** the Runes section's parts-rule sentence ("a socket that goes other than through Apply (a salvaged weapon, a transfer's …, `chooseStartingMana`, …) comes back as one Link") is gone: a salvaged weapon's constructs keep their sockets and runes; `chooseStartingMana` refunds no Link.

## Open questions for the integrator

1. **A's minting helper.** The contract names `mintUid(profile): [uid, profile]`; `fitMovesets`, `addLootToBag` and `upgradeGear` must mint whole movesets, so A likely has a helper of `mintMoveset`'s shape in `profile.ts`. If so, B2's Task 1 should call it and keep only the export (pair.ts and `moveAll` use it); if its shape differs (a mutating one, or one over a `GearItem`), the three call sites adapt.
2. **Does A's `addLootToBag` mint before the keep/salvage split?** Task 2's third test (`res.constructs.every((c) => !!c.uid)`) is the check; if it fails, A minted only the kept items, and B2's `melt` must mint the melted ones (`mintMoveset` on each before `applySalvage`), which moves `nextUid` on a full-bag bank and so changes the fingerprint only when the bot's bag fills mid-dive (it doesn't in the rails' 12 dives; verify with the check).
3. **Does A's `chooseStartingMana` already mint?** Task 9 assumes the contract ("`chooseStartingMana` mints"); the fingerprint check after it is the proof that B2 mints the same count (a new save's common sword: three blows and two Strikes).
4. **`draftRefusal`'s fourth parameter** (`opts`, the pull mode) is beyond the contract's three; C1's call may pass the dev chip's mode or omit it.
5. **The draft's bag entries are taken as saved by uid** (room 2): a bag construct edited in the draft is silently its saved self. If C1 wants a refusal instead ("Edit a construct in a slot"), it is one deep-compare in `rearrange`.
6. **A stop's `move` and `setChains`' off-pair rule:** an adjusted construct's new element set outside the pair is refused as today ("held more times than before"); the stop's picker (C2) shows the pair only, so nothing changes, but the refusal text is A's.
7. **`salvageConstruct` under `'destroy'`** (the dev chip) destroys the runes for nothing; if the chip should charge nothing *and* return them, it is `settleParts` with `'pay'` and `scrap: 0` (two lines).
8. **The fingerprint at Task 8:** if A's recording already differs on a stop's `move` (a minted uid), A's stop was broken and Task 8 is the fix; the handback says so and the integrator decides whether A re-records or B2's run becomes the reference.
