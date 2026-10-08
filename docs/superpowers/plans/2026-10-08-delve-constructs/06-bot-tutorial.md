# Delve constructs · D1: the autopilot and the tutorial — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The autopilot plays the constructs model between dives (spec §7): it opens a skill when it can pay (`openSkill`), places the bag's constructs where they raise Power (`placeConstruct`), moves every construct onto a better weapon (`moveAll`, rewiring the no-op A left in `transferBest` and the lesson's op), fills a slot a Move all or an open skill left empty, melts the constructs it doesn't use (`salvageConstruct`), and keeps the Links order (slots to three, sockets, the rest of the slots, each slot bought only under the ceiling). A new save's sword holds two Primary constructs, so nothing forges before dive 1 for a Primary's sake. `economySim`'s rows count the constructs each visit placed and melted. The whole guided start is rewritten against the slot table (§3.2): dive 1's lines no longer say the sword carries the Basic alone, the set blade is sold on its Defensive slot, the set drops' `slots` and `sockets` sit on constructs, lesson 1's Skills and salvage lines name the move bag, lesson 2's Transfer is **Move all** (its trigger `moveAll`, free, its hold "the rare wears what the lessons built"), the Training step and the farewell speak of slots and Open a skill. `tutorialHolds`, `tutorialSkippable` and the bot follow; `delve-tutorial-bot.test.ts` passes for every primary with Hesta's partner and four other pairs over four seeds; the E2E's TU02 ("Basic alone until its first forge") and TU04 (the Transfer by the pad) are rewritten for the new start and Move all.

**Architecture:** Everything rides the overview's contract (`00-overview.md` → The contract) and B2's `delve/constructs.ts` (`placeConstruct`, `moveAll`, `salvageConstruct`). The bot gains four small steps in `anvilVisit` (`openSkills`, `placeBag`, `fillEmpty`, `salvageBag`) and one rewire (`moveAllBest`); `fusePrimary` reads `movesetOf` (every construct), never `heroChains` (dormant ones dropped: it would price them as removed). The tutorial's one rule and its runner are untouched; only the `moveAll` hold and its affordability change in `delve/tutorial.ts`. The script is data: `tutorial.json`'s lines and one set drop. Quests read no transfer and no Awaken (`quests.json` names only `openSocket`): nothing changes there.

**Tech Stack:** TypeScript 5.7, Vitest 3, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-delve-weapon-identity-and-constructs-design.md` (authoritative): §3.2 the slot table, §3.3 Move all and salvage, §7 autopilot, tutorial and quests, §8 tests. The tutorial spec, `docs/superpowers/specs/2026-10-03-delve-tutorial-design.md`, stays the script's authority where this stage leaves it alone. Overview: `00-overview.md`.

---

## Chunk 1: Base, the script and the hold

## Base

- **Starts from:** `constructs/main` with A, B1 and B2 merged, in this area's worktree `C:/Projects/alloy-constructs-d1` on `constructs/d1`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad/mkwt.ps1 -Name alloy-constructs-d1 -Branch constructs/d1 -Base constructs/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-constructs-d1` in Git Bash.
- **Anchors:** every "Replace:" block was read at `main`'s `2f3871b2`. Where A, B1 or B2 edit a file first, the edit says "A's shape" and is written against the overview's stated shape (the stub's name and marker); the executor matches the anchor by that name, not by the old body.
- **Before Task 1:** build and measure:

```bash
cd /c/Projects/alloy-constructs-d1
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
```

  Expected: no type errors; both suites as B2's handover leaves them (note the counts). The engine suite takes about 12 minutes; `delve-pacing-robust` had 2 known failures on `main` before this stage. Run nothing else while a suite runs.
- **No fingerprint.** The bot takes new ops here on purpose (B2 kept it so D1 could change play); D2 re-measures pacing.

## Assumptions about A, B1 and B2 (checked before Task 1; if one doesn't hold, adapt the named line and say so in the handover)

1. `delve/autopilot.ts` still holds `transferBest` (its body returning `p` unchanged, marked `// D1 rewires to moveAll`), `awakenWeapon` (calling `openSkill(registry, p, weapon.uid, 'ultimate')` or alike), and `lessonOp`'s `case 'moveAll'` returning `p`, each where the old one stood at `2f3871b2` (lines 327, 640 and 1026).
2. `delve/constructs.ts` exports `placeConstruct(registry, profile, uid, skill, index)`, `moveAll(registry, profile, uid)` and `salvageConstruct(registry, profile, uid, opts?)`, each a `ProfileActionResult`; `placeConstruct` into a full chain's slot sends the displaced construct to the bag, a plain one deleted at once (spec §3.3: the one-op draft applies then); `moveAll` sends the target's own constructs to the bag, every chain's.
3. `loot/moveset.ts` exports `constructSkill`, `isPlain`, `plainConstruct`, `slotRange` and `movesetOf`; `defaultMoveset(registry, owner, element, slots?)` keeps its signature and passes `slots.primary` through; `heroChains` drops dormant constructs.
4. `addLootToBag` mints a uid for every construct of a banked weapon (the contract's "A world drop's constructs have none" until it banks); `createDelveProfile`'s sword has uids (`chooseStartingMana` mints).
5. `tests/fixtures/arena.ts`'s `withChains` either keeps the uids the caller's moves carry (the tests below give them) or mints; `registry`, `gear`, `DEFAULT_CHAINS` are as at `2f3871b2`.
6. `delve/tutorial.ts`: A renamed the `transfer` entry of `BY_STATE` and both `case 'transfer'` blocks to `moveAll` and replaced line 7's import (`baseSlots`, `movesetTransfer` are gone) with what compiles; `types/tutorial.ts` has `'moveAll'` and `'openSkill'` in `TUTORIAL_TRIGGERS` and `{ type: 'moveAll' }` in `TutorialOnlyEvent`; `tutorial.json` line 511 reads `"type": "moveAll"`.
7. `arpg/tutorial-floor.ts` reads `MAX_SOCKETS` where it read `socketCap` and `defaultForm(registry, 'primary', ctx.world.hero.weapon.class)` where it read `DEFAULT_FORMS.primary` (A's mechanical edits); `HeroWeapon.class` exists.
8. `tests/delve-tutorial-carries.test.ts` and the Awaken parts of `tests/delve-tutorial-balance.test.ts` are gone or rewritten by A (they tested deleted functions); `tests/delve-awaken-bot.test.ts` exists in some A-rewritten form (Task 3 replaces it).
9. `Haul.constructs` exists and A's `mapHaul` (in `autopilot.ts` and `economy.ts`) carries it; `DelveProfile.constructs` and `autoSalvagePlain` exist, the latter true on a new save.

## Files

| File | Change |
|---|---|
| `packages/engine/src/data/tutorial.json` (hand-edited, never formatted) | ten lines against the slot table; the blade's `slots` gone (Task 1) |
| `packages/engine/src/arpg/tutorial-floor.ts`, `src/types/tutorial-floor.ts` | `setGear`'s and `TutorialDrop`'s doc: sockets on constructs (Task 1) |
| `packages/engine/tests/delve-tutorial-floors-data.test.ts`, `delve-tutorial-floors-drops.test.ts`, `delve-tutorial-review.test.ts` | the blade without `slots`; Strike, the starting slots, sockets on the Primary's constructs; `d1-cast`'s regex (Task 1) |
| `packages/engine/src/delve/tutorial.ts` | the `moveAll` hold (`lessonBuilt`) and its affordability (Task 2) |
| `packages/engine/tests/delve-tutorial-runner-rule.test.ts`, `delve-tutorial-runner-script.test.ts`, `delve-tutorial-review.test.ts`, `delve-tutorial-floors-play.test.ts`, `delve-tutorial-contract.test.ts` | Move all in place of the Transfer; banked weapons (uids); the Skills step's skip cases (Task 2) |
| `packages/engine/src/delve/autopilot.ts` (hand-edited, never formatted) | `moveAllBest`, `openSkills`, `placeBag`, `fillEmpty`, `salvageBag`, `fusePrimary` on `movesetOf`, `AnvilVisit.constructs` (Task 3); `lessonOp`'s `moveAll` (Task 4) |
| `packages/engine/src/delve/economy.ts` | `EconomyDive.constructs` (Task 3) |
| `packages/client/src/features/delve/lab/__tests__/economy-model.test.ts`, `EconomyView.test.tsx` | their fixtures carry `constructs` (Task 3) |
| `packages/engine/tests/delve-constructs-bot.test.ts` (new) | the bot's five construct behaviours and the new save's Primary (Task 3) |
| `packages/engine/tests/delve-awaken-bot.test.ts` | deleted: its cases live in the new file (Task 3) |
| `packages/engine/tests/delve-tutorial-bot.test.ts` | the rare's slots; nothing built left in the bag (Task 4) |
| `packages/client/e2e/delve-tutorial.spec.ts` | TU02 and TU04 rewritten; TU01's and TU03's comments (Task 5) |

Nothing in `data/tutorial-check.ts` reads a retired symbol or a changed rule (its stop kinds, targets and tokens are as before), so it is left alone; the one check the new data could use (a set drop's `slots.primary` within its rarity's ceiling) is an open question below. `quests.json` names no transfer and no Awaken: untouched.

## Where the spec left room

1. **The old sword's two Primary constructs.** A new save casts Q from its first floor. The script keeps `d1-cast`, `d1-chain` and `d1-aim` on d1-2 (the slinger and the room are there); d1-1's lines don't mention the Primary, and `s1-equip` sells the set blade on the slot it adds: a Defensive (uncommon `[1, 2]`), holding a plain Ward.
2. **The sword's default Primary is Strike** (`defaultForm` on a melee weapon), so `{primarySkill}` fills "Fire Strike". `d1-aim`'s trigger (an aimed cast, which an aimed Strike is) is unchanged; its line ends "and let go: step in and strike it", so the aimed Strike reads as the answer to a ranged foe. The step's gate opens on the cast whether or not the slinger falls.
3. **Set drops.** `TutorialDrop.slots.primary` stays (the Primary's slots, within its rarity's ceiling; extra ones not bought), and `sockets` open one a construct in `SOCKET_ORDER` round by round up to `MAX_SOCKETS` each. The shipped blade drops `slots` (an uncommon's Primary starts at two). Grask's rare keeps no `sockets`: it drops plain, which is what the Move all hold reads.
4. **The Move all hold** (`tutorialHolds`, `moveAll`): a weapon of the rarity or better worn whose Primary holds a construct the lessons built, one that is not plain (lesson 1 opened a socket on the first) or not in the primary alone (its last is in the secondary). A plain Equip of the rare leaves its own plain constructs in the primary, so it stays current, as the old "past its base slots" did. `unaffordable`'s `moveAll` is only "no bag weapon of the rarity": Move all is free.
5. **Ids and targets kept.** The step id `l2-transfer` and the client target `loadout.transfer` stay (the E2E, `marked.ts`'s ways and the Loadout's `data-tutorial` read them); only the trigger type is `moveAll`. Renaming them is churn across C2's files for no rule (an open question).
6. **The bot's order** in `anvilVisit`: melt, refine, forge, Move all and equip, melt; then (unless a legendary waits) `openSkills`; then, free, `placeBag`; then `salvageBag` (its runes back to the pouch before the sockets are filled); then, unless a legendary waits, `fillEmpty`, Links (slots to `SOCKETS_AFTER`, sockets, the rest), runes, shards, hones, upgrades; then `fusePrimary`. `spendLinks` is unchanged: `addSlot` refuses at the ceiling (`slotPrice` null), which ends each skill's loop.
7. **`fillEmpty`.** Move all keeps a target skill's own constructs where the worn weapon moves none (the overview's `moveAllPreview`: the rare's Ultimate keeps its Nova), and an open skill's slot is plain-filled already, so an empty ability chain arises only when a player (or a test) unsockets or salvages a chain's last construct; `fillEmpty` is the guard for that case. The bot fills an empty slot with a plain construct in its primary through `setChain` (`editDust` each) when Power rises; nothing else adds a new construct.
8. **No pre-dive-1 forge for a Primary.** `runAutopilot`'s opening `betweenDives` stays: `forgeSlot` already forges only when Power rises by `MIN_FORGE_GAIN`, and an uncommon sword's Defensive slot and lines may or may not clear it. The pacing rail "before dive 1 the kit forges" (`delve-pacing.test.ts` line 105, `FirstForges.opened`) is D2's to read, not this plan's (Needs routed).
9. **`EconomyDive.constructs`** `{ placed, salvaged }`: what the Anvil visit after the dive placed from the bag and melted. The Lab's Economy view ignores it (a plain object crosses the worker); its two test fixtures gain the field in Task 3, so `constructs/main` typechecks between D1 and D2.
10. **Tests build weapons through `addLootToBag`** where an op then moves their constructs (uids), and give uids by hand (`withUids`) where only `tutorialHolds` reads them or the fixture is built in place.

## Conventions

The overview's. In short: one commit per task on `constructs/d1`, staged by path, never `git add -A`; the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` is the last `-m`; never push or merge. Keep each file's line endings (the Edit tool does). Prettier (`npx prettier --write --end-of-line auto <files>`) only on `.ts`/`.tsx` files this plan creates or edits **except** `src/delve/autopilot.ts`; `tutorial.json` is hand-edited, never formatted. "Replace: … with: …" is one Edit; "Append" adds at the end of the file or block named. Expected outputs below are expectations (this plan could not run them): a count that differs is reported, not tuned.

**Commands** (from the worktree root):

| What | Command |
|---|---|
| Engine typecheck + files | `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot)` |
| All engine tests | `(cd packages/engine && npx vitest run --reporter=dot)` |
| Engine bundle | `(cd packages/engine && npx tsup)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| One E2E spec | `(cd packages/client && npx playwright test e2e/delve-tutorial.spec.ts --project=desktop --reporter=dot)` |

---

### Task 1: The script against the slot table; the set drops on constructs

**Files:**
- Modify: `packages/engine/src/data/tutorial.json` (hand-edited), `packages/engine/src/arpg/tutorial-floor.ts`, `packages/engine/src/types/tutorial-floor.ts`
- Modify (tests): `packages/engine/tests/delve-tutorial-floors-data.test.ts`, `packages/engine/tests/delve-tutorial-floors-drops.test.ts`, `packages/engine/tests/delve-tutorial-review.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-tutorial-floors-data.test.ts`:

Replace:
```ts
    expect(drop('d1-1', 'blade')).toEqual({
      kind: 'gear',
      base: 'sword',
      rarity: 'uncommon',
      element: 'primary',
      slots: { primary: 2 },
    });
```
with:
```ts
    // Its Primary starts at the table's two (the constructs spec §3.2); its Defensive slot is the
    // stop's point, and it drops plain (no sockets: the lesson opens the first).
    expect(drop('d1-1', 'blade')).toEqual({
      kind: 'gear',
      base: 'sword',
      rarity: 'uncommon',
      element: 'primary',
    });
```

In `packages/engine/tests/delve-tutorial-floors-drops.test.ts`:

Replace:
```ts
import { baseSlots } from '../src/loot/moveset.js';
```
with:
```ts
import { slotRange } from '../src/loot/moveset.js';
```

Replace:
```ts
        element: 'primary',
        slots: { primary: 2 },
      },
    },
```
with:
```ts
        element: 'primary',
        slots: { primary: 3 },
      },
    },
```

Replace:
```ts
    const { chains, slots } = blade.item!.moveset!;
    expect(slots).toEqual({ basic: baseSlots(registry, 'sword', 'basic'), primary: 2 });
    expect(chains.primary!.moves.map((m) => [m.form, m.elements, m.runes])).toEqual([
      ['bolt', ['fire'], undefined],
      ['bolt', ['fire'], undefined],
    ]);
```
with:
```ts
    const { chains, slots, bought } = blade.item!.moveset!;
    // The table's starts (the constructs spec §3.2), but the Primary at the data's 3 (an
    // uncommon's ceiling), none of them bought.
    expect(slots).toEqual({
      basic: slotRange(registry, blade.item!, 'basic')[0],
      primary: 3,
      defensive: 1,
    });
    expect(Object.values(bought).every((n) => n === 0)).toBe(true);
    // A sword's default Primary form is Strike (melee); a world drop's constructs have no uid.
    expect(chains.primary!.moves.map((m) => [m.form, m.elements, m.runes, m.uid])).toEqual([
      ['strike', ['fire'], undefined, undefined],
      ['strike', ['fire'], undefined, undefined],
      ['strike', ['fire'], undefined, undefined],
    ]);
```

Replace:
```ts
    const { chains } = set(w)[0].item!.moveset!;
    expect([chains.primary!.moves[0].runes, chains.basic![0].runes]).toEqual([[null], [null]]);
```
with:
```ts
    // Two sockets, one a construct, the Primary's first (a rare's Primary starts at three), so
    // the blows get none.
    const { chains } = set(w)[0].item!.moveset!;
    const sockets = chains.primary!.moves.map((m) => m.runes);
    expect([sockets, chains.basic![0].runes]).toEqual([[[null], [null], undefined], undefined]);
```

In `packages/engine/tests/delve-tutorial-review.test.ts`:

Replace:
```ts
    expect(part).toEqual({ text: expect.stringMatching(/carries \S+ \S+\. /) });
```
with:
```ts
    expect(part).toEqual({ text: expect.stringMatching(/casts \S+ \S+\. /) });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-tutorial-floors-data.test.ts tests/delve-tutorial-floors-drops.test.ts tests/delve-tutorial-review.test.ts --reporter=dot)`
Expected: FAIL: the blade's drop still carries `slots`; the drops test's slots and sockets (and, if A's `rollSockets` path differs, the crown's); the review's six `d1-cast` regexes.

- [ ] **Step 3: The script**

In `packages/engine/src/data/tutorial.json` (hand-edit; keep the file's indentation and CRLF):

Replace:
```json
      "line": "Between depths you get one power-up. Better weapons carry more skills, and that blade carries a Primary. Put it on.",
```
with:
```json
      "line": "Between depths you get one power-up. A better weapon has more slots for constructs, and that blade adds a Defensive. Put it on.",
```

Replace:
```json
      "line": "Your new blade carries {primarySkill}. Let's see it: cast it at a rat.",
```
with:
```json
      "line": "Your blade's first construct casts {primarySkill}. Let's see it: cast it at a rat.",
```

Replace (an aimed Strike is the answer to a ranged foe now: the trigger, an aimed cast, is unchanged):
```json
      "line": "That slinger's keeping its distance. Hold {input:primary}, line it up with {input:aim}, and let go.",
```
with:
```json
      "line": "That slinger's keeping its distance. Hold {input:primary}, line it up with {input:aim}, and let go: step in and strike it.",
```

Replace:
```json
      "line": "Let's build your Primary. Add a slot, set the new move to {secondary}, open a socket on the first move, set the rune in it, then Apply.",
```
with:
```json
      "line": "Let's build your Primary. Add a slot, set its new construct to {secondary}, open a socket on the first construct, set the rune in it, then Apply. A construct you pull out waits in your move bag.",
```

Replace:
```json
      "line": "That old sword's done its job. Salvage it: it melts down into scrap and parts.",
```
with:
```json
      "line": "That old sword's done its job. Salvage it: it melts down into scrap and parts, and any construct worth keeping goes to your move bag.",
```

Replace:
```json
      "line": "He dropped a rare weapon. Rares carry the Defensive skill too: grab it.",
```
with:
```json
      "line": "He dropped a rare weapon. A rare has more slots, a Defensive's among them: grab it.",
```

Replace:
```json
      "line": "Look at Grask's weapon. As it comes it's no match for yours, but the ◇ says it's a better home for the moves you've built.",
```
with:
```json
      "line": "Look at Grask's weapon. As it comes it's no match for yours, but the ◇ says it's a better home for the constructs you've built.",
```

Replace (A's shape: line 511's `"type"` already reads `moveAll`):
```json
      "line": "So move your moveset onto it. Your slots and your socket come along, for a little scrap.",
      "objective": "Transfer your moveset",
```
with:
```json
      "line": "So move them all onto it. Move all: every construct on your blade goes into the rare's slots, sockets and runes with them, free; what the rare held goes to your move bag.",
      "objective": "Move all onto the rare",
```

Replace:
```json
      "line": "Your rare carries a Defensive skill. Try it on my dummies in the Training Grounds.",
```
with:
```json
      "line": "Your Ward came across into the rare's Defensive slot. Try it on my dummies in the Training Grounds.",
```

Replace:
```json
      "line": "That's all I've got. Rares can be awakened to carry an Ultimate, and epics carry one already. Go find out. The Anvil's always here.",
```
with:
```json
      "line": "That's all I've got. A rare has room for an Ultimate: open the skill on the Temper bench once you can pay, and epics come with one. Go find out. The Anvil's always here.",
```

Replace:
```json
            "rarity": "uncommon",
            "element": "primary",
            "slots": { "primary": 2 }
          }
```
with:
```json
            "rarity": "uncommon",
            "element": "primary"
          }
```

- [ ] **Step 4: The set drops' doc**

In `packages/engine/src/arpg/tutorial-floor.ts` (A's shape: the loop under this comment reads `MAX_SOCKETS`, the rune's fallback form `defaultForm`; neither line changes here):

Replace:
```ts
 * A set drop's gear: in the pair's element (`world.loot.pair`: its secondary, or the
 * primary while none is bound), its item level the depth, rolled on `rng`; a weapon
 * carries its rarity's skills at their base slots but the Primary's `slots.primary`,
 * every move its default, and `sockets` open, one a move, the Primary's first.
 */
```
with:
```ts
 * A set drop's gear: in the pair's element (`world.loot.pair`: its secondary, or the
 * primary while none is bound), its item level the depth, rolled on `rng`; a weapon
 * holds plain constructs in its rarity's starting slots (the constructs spec §3.2) but
 * the Primary's `slots.primary`, and `sockets` open one a construct in `SOCKET_ORDER`,
 * round by round up to `MAX_SOCKETS` each, the Primary's first. No construct has a uid
 * until the weapon banks.
 */
```

In `packages/engine/src/types/tutorial-floor.ts`:

Replace:
```ts
 * What a set drop gives: gear in the pair's primary or secondary (its Primary
 * chain at `slots.primary` moves, `sockets` open), on the fork
 * `tutorial:<dropId>`; a rune that fits the Primary's first move at drop time;
 * a material (Mana Dust and Links included) or scrap, by count.
 */
```
with:
```ts
 * What a set drop gives: gear in the pair's primary or secondary (its Primary at
 * `slots.primary` slots, within its rarity's ceiling, plain-filled; `sockets` open
 * on its constructs, one each), on the fork `tutorial:<dropId>`; a rune that fits
 * the Primary's first move at drop time; a material (Mana Dust and Links included)
 * or scrap, by count.
 */
```

- [ ] **Step 5: Run them to see them pass**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-tutorial-floors-data.test.ts tests/delve-tutorial-floors-drops.test.ts tests/delve-tutorial-floors-check.test.ts tests/delve-tutorial-data.test.ts tests/delve-tutorial-review.test.ts tests/delve-tutorial-runner-text.test.ts --reporter=dot)`
Expected: no type errors; PASS but for the review file's Move all and Skills-step cases (Task 2's) if A's stubs left them red. `tutorialDataProblems(registry)` and `tutorialFloorProblems(registry)` stay `[]` (the data test asserts both).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-constructs-d1
(cd packages/engine && npx prettier --write --end-of-line auto src/arpg/tutorial-floor.ts src/types/tutorial-floor.ts tests/delve-tutorial-floors-data.test.ts tests/delve-tutorial-floors-drops.test.ts tests/delve-tutorial-review.test.ts)
git add packages/engine/src/data/tutorial.json packages/engine/src/arpg/tutorial-floor.ts packages/engine/src/types/tutorial-floor.ts packages/engine/tests/delve-tutorial-floors-data.test.ts packages/engine/tests/delve-tutorial-floors-drops.test.ts packages/engine/tests/delve-tutorial-review.test.ts
git commit -m "feat(engine): the guided start's script against the slot table: constructs, the move bag, Move all, Open a skill" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: The Move all hold; the runner's tests on banked weapons

**Files:**
- Modify: `packages/engine/src/delve/tutorial.ts`
- Modify (tests): `packages/engine/tests/delve-tutorial-runner-rule.test.ts`, `delve-tutorial-runner-script.test.ts`, `delve-tutorial-review.test.ts`, `delve-tutorial-floors-play.test.ts`, `delve-tutorial-contract.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/engine/tests/delve-tutorial-runner-rule.test.ts`:

Replace:
```ts
const transfer = lesson('transfer', { rarity: 'rare' });
```
with:
```ts
const moved = lesson('moveAll', { rarity: 'rare' });
```

Replace:
```ts
  it('salvage, refine, transfer and hone: the old sword gone, a bar made, a rare worn, a line honed', () => {
```
with:
```ts
  it("salvage, refine, Move all and hone: the old sword gone, a bar made, a rare worn with the lessons' constructs, a line honed", () => {
```

Replace:
```ts
    expect(tutorialHolds(script, swapped, transfer)).toBe(false);
    // A rare worn with the moveset moved onto it: its Primary past its base slots.
    const rare = (primary: number) => {
      const w = weapon('rare');
      const moveset = defaultMoveset(script, w, 'fire', { primary });
      return { ...p, equipped: { ...p.equipped, weapon: { ...w, moveset } } };
    };
    expect(tutorialHolds(script, rare(1), transfer)).toBe(false);
    expect(tutorialHolds(script, rare(2), transfer)).toBe(true);
```
with:
```ts
    expect(tutorialHolds(script, swapped, moved)).toBe(false);
    // A rare worn holding what the lessons built (a socket, or the secondary), not its own plain
    // constructs: a plain Equip leaves it current.
    const rare = (build: (m: Move) => Move) => {
      const w = weapon('rare');
      const moveset = defaultMoveset(script, w, 'fire');
      moveset.chains.primary!.moves = moveset.chains.primary!.moves.map(build);
      return { ...p, equipped: { ...p.equipped, weapon: { ...w, moveset } } };
    };
    expect(tutorialHolds(script, rare((m) => m), moved)).toBe(false);
    expect(tutorialHolds(script, rare((m) => ({ ...m, runes: [null] })), moved)).toBe(true);
    expect(tutorialHolds(script, rare((m) => ({ ...m, elements: ['frost'] })), moved)).toBe(true);
```

In `packages/engine/tests/delve-tutorial-runner-script.test.ts`:

Replace:
```ts
import { addSlot, setChains, transferMoveset } from '../src/delve/moveset.js';
```
with:
```ts
import { moveAll } from '../src/delve/constructs.js';
import { addSlot, setChains } from '../src/delve/moveset.js';
```

Replace:
```ts
import type { Chain, Move } from '../src/types/ability.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Rarity } from '../src/types/gear.js';
```
with:
```ts
import type { Blow, Chain, Move } from '../src/types/ability.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem, Moveset, Rarity } from '../src/types/gear.js';
```

Replace:
```ts
/** Every quest and contract that waits, claimed. */
function claimAll(p: DelveProfile): DelveProfile {
```
with:
```ts
/** `item` with a uid on each of its constructs (`<uid>:<skill><i>`), as a banked weapon has. */
function withUids(item: GearItem): GearItem {
  const ms = movesetOf(registry, item);
  const chains = Object.fromEntries(
    Object.entries(ms.chains).map(([skill, chain]) => {
      const tag = (m: Move | Blow, i: number) => ({ ...m, uid: `${item.uid}:${skill}${i}` });
      return [
        skill,
        Array.isArray(chain) ? chain.map(tag) : { ...chain, moves: chain.moves.map(tag) },
      ];
    }),
  ) as Moveset['chains'];
  return { ...item, moveset: { ...ms, chains } };
}
/** Every quest and contract that waits, claimed. */
function claimAll(p: DelveProfile): DelveProfile {
```

Replace:
```ts
    const bolt = (elements: Move['elements']): Move => ({ kind: 'medium', form: 'bolt', elements });
    let p = createDelveProfile(registry, 7, { primary: 'fire' });
    const old = p.equipped.weapon!;
    p = withChains(
      { ...p, equipped: { ...p.equipped, weapon: sword('uncommon', 'b1') } },
      {
        primary: { moves: [bolt(['fire']), bolt(['fire'])], payment: 'mana' },
      },
    );
```
with:
```ts
    // The blade as the stop equips it: banked (uids), a sword's Strike in its two Primary slots.
    const strike = (uid: string, elements: Move['elements']): Move => ({
      uid,
      kind: 'medium',
      form: 'strike',
      elements,
    });
    let p = createDelveProfile(registry, 7, { primary: 'fire' });
    const old = p.equipped.weapon!;
    p = withChains(
      { ...p, equipped: { ...p.equipped, weapon: withUids(sword('uncommon', 'b1')) } },
      {
        primary: { moves: [strike('b1:p0', ['fire']), strike('b1:p1', ['fire'])], payment: 'mana' },
      },
    );
```

Replace:
```ts
  it('Anvil lesson 2: the compare beat, Transfer, hone, claim, the board, the Training Grounds, farewell', () => {
    // The blade as dive 1 drops it: its Primary at two slots, which the Transfer carries over.
    const b1 = sword('uncommon', 'b1');
    const blade = { ...b1, moveset: defaultMoveset(registry, b1, 'fire', { primary: 2 }) };
    const rare = sword('rare', 'r1');
```
with:
```ts
  it('Anvil lesson 2: the compare beat, Move all, hone, claim, the board, the Training Grounds, farewell', () => {
    // The blade as lesson 1 leaves it: its first construct socketed (what the Move all hold reads).
    const blade = withUids(sword('uncommon', 'b1'));
    const [first, ...rest] = blade.moveset!.chains.primary!.moves;
    blade.moveset!.chains.primary!.moves = [{ ...first, runes: [null] }, ...rest];
    const rare = withUids(sword('rare', 'r1'));
```

Replace:
```ts
    p = transferMoveset(registry, p, 'r1').profile;
    expect(p.tutorial).toEqual(st('l2-hone'));
```
with:
```ts
    p = moveAll(registry, p, 'r1').profile;
    expect(p.tutorial).toEqual(st('l2-hone'));
    // Every construct the blade held sits on the rare now, the socket with it.
    expect(movesetOf(registry, p.equipped.weapon!).chains.primary!.moves[0]).toMatchObject({
      uid: first.uid,
      runes: [null],
    });
```

(`defaultMoveset` stays imported: `withUids` reads `movesetOf`; drop `defaultMoveset` from the import if nothing else in the file uses it after these edits, which `npx tsc` will say.)

In `packages/engine/tests/delve-tutorial-review.test.ts`:

Replace:
```ts
import { addSlot, transferMoveset } from '../src/delve/moveset.js';
```
with:
```ts
import { moveAll } from '../src/delve/constructs.js';
import { addSlot } from '../src/delve/moveset.js';
```

Replace:
```ts
import { defaultMoveset } from '../src/loot/moveset.js';
```
with:
```ts
import { defaultMoveset, movesetOf } from '../src/loot/moveset.js';
```

Replace:
```ts
/** An uncommon fire sword whose Primary holds `elements`' moves, the first socketed with a rune. */
function blade(elements: ManaType[][], rune = true): GearItem {
  const item = generateItem(
    registry,
    { uid: 'gBlade', ilvl: 1, rarity: 'uncommon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(3),
  );
  const ms = defaultMoveset(registry, item, 'fire', { primary: elements.length });
  ms.chains.primary!.moves.forEach((m, i) => (m.elements = elements[i]));
  if (rune) ms.chains.primary!.moves[0].runes = [{ id: 'quick', tier: 1 }];
  return { ...item, moveset: ms };
}
```
with:
```ts
/** `item` with a uid on each of its constructs, as a banked weapon has. */
function withUids(item: GearItem): GearItem {
  const ms = movesetOf(registry, item);
  for (const [skill, chain] of Object.entries(ms.chains))
    (Array.isArray(chain) ? chain : chain.moves).forEach(
      (m, i) => (m.uid = `${item.uid}:${skill}${i}`),
    );
  return { ...item, moveset: ms };
}

/** An uncommon fire sword whose Primary holds `elements`' moves, the first socketed with a rune. */
function blade(elements: ManaType[][], rune = true): GearItem {
  const item = generateItem(
    registry,
    { uid: 'gBlade', ilvl: 1, rarity: 'uncommon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(3),
  );
  const ms = defaultMoveset(registry, item, 'fire', { primary: elements.length });
  ms.chains.primary!.moves.forEach((m, i) => (m.elements = elements[i]));
  if (rune) ms.chains.primary!.moves[0].runes = [{ id: 'quick', tier: 1 }];
  return withUids({ ...item, moveset: ms });
}
```

Replace:
```ts
  it('the Skills step with a weapon that carries no Primary, or none at all', () => {
    const p = { ...atStep('l1-skills'), runes: { quick: [1, 0, 0, 0, 0] } };
    expect(p.equipped.weapon!.rarity).toBe('common');
    expect(tutorialSkippable(registry, p, p.tutorial!)).toBe(true);
    const unarmed = { ...p, equipped: { ...p.equipped, weapon: null } };
    expect(tutorialSkippable(registry, unarmed, p.tutorial!)).toBe(true);
    const armed = { ...p, equipped: { ...p.equipped, weapon: blade([['fire'], ['fire']]) } };
    expect(tutorialSkippable(registry, armed, p.tutorial!)).toBe(false);
  });
```
with:
```ts
  it("the Skills step unarmed, or without the Links for the slot it asks; not with a sword that can grow", () => {
    const p = { ...atStep('l1-skills'), runes: { quick: [1, 0, 0, 0, 0] } };
    // A new save's common sword holds two Primary constructs under a ceiling of three: it can.
    expect(p.equipped.weapon!.rarity).toBe('common');
    expect(tutorialSkippable(registry, p, p.tutorial!)).toBe(false);
    expect(tutorialSkippable(registry, { ...p, links: 0 }, p.tutorial!)).toBe(true);
    const unarmed = { ...p, equipped: { ...p.equipped, weapon: null } };
    expect(tutorialSkippable(registry, unarmed, p.tutorial!)).toBe(true);
    const armed = { ...p, equipped: { ...p.equipped, weapon: blade([['fire'], ['fire']]) } };
    expect(tutorialSkippable(registry, armed, p.tutorial!)).toBe(false);
  });
```

Replace:
```ts
describe('the Transfer step', () => {
  const rare = () => {
    const item = generateItem(
      registry,
      { uid: 'gRare', ilvl: 5, rarity: 'rare', baseId: 'sword', mana: 'fire' },
      new SeededRNG(1),
    );
    return { ...item, moveset: defaultMoveset(registry, item, 'fire') };
  };
  it('a plain Equip of the rare leaves it current; a Transfer completes it', () => {
    const p = {
      ...atStep('l2-transfer'),
      equipped: { ...fresh().equipped, weapon: blade([['fire'], ['fire'], ['frost']]) },
      bag: [rare()],
    };
    expect(equipItem(registry, p, 'gRare').tutorial!.step).toBe('l2-transfer');
    const moved = transferMoveset(registry, p, 'gRare');
    expect(moved.ok).toBe(true);
    expect(moved.profile.tutorial!.step).not.toBe('l2-transfer');
  });
});
```
with:
```ts
describe('the Move all step', () => {
  const rare = () => {
    const item = generateItem(
      registry,
      { uid: 'gRare', ilvl: 5, rarity: 'rare', baseId: 'sword', mana: 'fire' },
      new SeededRNG(1),
    );
    return withUids({ ...item, moveset: defaultMoveset(registry, item, 'fire') });
  };
  it('a plain Equip of the rare leaves it current; a Move all completes it', () => {
    const p = {
      ...atStep('l2-transfer'),
      equipped: { ...fresh().equipped, weapon: blade([['fire'], ['fire'], ['frost']]) },
      bag: [rare()],
    };
    expect(equipItem(registry, p, 'gRare').tutorial!.step).toBe('l2-transfer');
    const moved = moveAll(registry, p, 'gRare');
    expect(moved.ok).toBe(true);
    expect(moved.profile.tutorial!.step).not.toBe('l2-transfer');
  });
});
```

In `packages/engine/tests/delve-tutorial-floors-play.test.ts`:

Replace:
```ts
import { addSlot, setChains, transferMoveset } from '../src/delve/moveset.js';
import { bindSecondary, profileStats } from '../src/delve/pair.js';
import {
  createDelveProfile,
  equipItem,
  salvageItems,
  type ProfileActionResult,
} from '../src/delve/profile.js';
```
with:
```ts
import { moveAll } from '../src/delve/constructs.js';
import { addSlot, setChains } from '../src/delve/moveset.js';
import { bindSecondary, profileStats } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
  equipItem,
  salvageItems,
  type ProfileActionResult,
} from '../src/delve/profile.js';
```

Replace:
```ts
function world(p: DelveProfile, id: string, hp = 1, potions = 3, skills = true): ArpgWorld {
```
with:
```ts
function world(p: DelveProfile, id: string, hp = 1, potions = 3): ArpgWorld {
```

Replace:
```ts
    chains: skills ? heroChains(registry, p.equipped, p.pair) : {},
```
with:
```ts
    chains: heroChains(registry, p.equipped, p.pair),
```

Replace:
```ts
/** `p` wielding d1-1's set weapon (stop 1's Equip), its common sword in the bag. */
function armed(p: DelveProfile): DelveProfile {
  const blade: GearItem = gearOf(kill(world(p, 'd1-1'), 'rat3'))[0];
  const bag = [...p.bag, p.equipped.weapon!];
  return { ...p, nextUid: p.nextUid + 1, equipped: { ...p.equipped, weapon: blade }, bag };
}
```
with:
```ts
/** `p` wielding d1-1's set weapon, banked (its constructs' uids minted) and equipped as stop 1's Equip does, its common sword in the bag. */
function armed(p: DelveProfile): DelveProfile {
  const blade: GearItem = gearOf(kill(world(p, 'd1-1'), 'rat3'))[0];
  const bagged = addLootToBag(registry, p, [blade]).profile;
  return equipItem(registry, bagged, bagged.bag[bagged.bag.length - 1].uid);
}
```

Replace:
```ts
    p = stockHaul({ ...p, bag: [...p.bag, crown], bestDepth: 5 }, setHaul(2));
    p = ok(transferMoveset(registry, p, crown.uid));
    ok(hone(registry, p, crown.uid, 0));
```
with:
```ts
    p = stockHaul({ ...addLootToBag(registry, p, [crown]).profile, bestDepth: 5 }, setHaul(2));
    p = ok(moveAll(registry, p, crown.uid));
    ok(hone(registry, p, crown.uid, 0));
```

Replace:
```ts
      // A new save's common sword carries the Basic alone (the spec's carries).
      const p = f.id === 'd1-1' ? start : heroes[f.dive as 1 | 2];
      const w = world(p, f.id, hp, flasks, f.id !== 'd1-1');
```
with:
```ts
      // d1-1 is fought with the starting sword: two Primary constructs (the constructs spec §3.2).
      const p = f.id === 'd1-1' ? start : heroes[f.dive as 1 | 2];
      const w = world(p, f.id, hp, flasks);
```

In `packages/engine/tests/delve-tutorial-contract.test.ts` (A's shape: the stub list names `openSkill` and `openSkillPrice` where it named `awaken` and `awakenPrice`, and the emit test may be against B2's stub; write it as below whatever A left):

Replace:
```ts
import { setChains, transferMoveset } from '../src/delve/moveset.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile, equipItem, salvageItems } from '../src/delve/profile.js';
```
with:
```ts
import { moveAll } from '../src/delve/constructs.js';
import { setChains } from '../src/delve/moveset.js';
import { bindSecondary } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
  equipItem,
  salvageItems,
} from '../src/delve/profile.js';
```

Replace:
```ts
  it('the bind, an Apply, a transfer and a claim emit theirs', () => {
```
with:
```ts
  it('the bind, an Apply, a Move all and a claim emit theirs', () => {
```

Replace:
```ts
    expect(transferMoveset(registry, { ...p, bag: [...p.bag, blade] }, 'b1').ok).toBe(true);
    expect(lastEvents()).toEqual([{ type: 'transfer' }]);
```
with:
```ts
    const bagged = addLootToBag(registry, p, [blade]).profile;
    expect(moveAll(registry, bagged, 'b1').ok).toBe(true);
    expect(lastEvents()).toEqual([{ type: 'moveAll' }]);
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-tutorial-runner-rule.test.ts tests/delve-tutorial-runner-script.test.ts tests/delve-tutorial-review.test.ts tests/delve-tutorial-floors-play.test.ts tests/delve-tutorial-contract.test.ts --reporter=dot)`
Expected: FAIL: the hold's three `rare(...)` cases and the script's lesson 2 (the hold A left reads something else), the floors' lesson (the same), the review's Move all step; the contract's emit passes already if B2's `moveAll` emits `moveAll`.

- [ ] **Step 3: The hold**

In `packages/engine/src/delve/tutorial.ts`:

Add `isPlain` to the `../loot/moveset.js` import (A's shape: the line holds `movesetOf`; it reads `import { isPlain, movesetOf } from '../loot/moveset.js';` after).

Replace:
```ts
 * exactly `rarity` left; `refine` a bar of `metal`; `transfer` a weapon of
 * `rarity` or better equipped, its Primary past its base slots (the moveset
 * moved onto it); `hone` an item honed. Any other step has no
 * state: false (it waits for its event, or a floor's tallies).
 */
```
with:
```ts
 * exactly `rarity` left; `refine` a bar of `metal`; `moveAll` a weapon of
 * `rarity` or better worn whose Primary holds a construct the lessons built
 * (`lessonBuilt`: a plain Equip leaves the rare's own plain constructs); `hone`
 * an item honed. Any other step has no state: false (it waits for its event, or
 * a floor's tallies).
 */
```

Replace (A's shape: the `case 'moveAll'` block where `case 'transfer'` stood, whatever body A left it):
```ts
    case 'moveAll': {
      // The moveset moved with it: a plain Equip leaves the Primary at its base slots.
      const weapon = profile.equipped.weapon;
      return (
        atLeast(weapon, f.rarity) &&
        primaryMoves(registry, profile).length > baseSlots(registry, weapon!.baseId, 'primary')
      );
    }
```
with:
```ts
    case 'moveAll':
      return atLeast(profile.equipped.weapon, f.rarity) && lessonBuilt(registry, profile);
```

Replace:
```ts
/**
 * Whether the hero can't do an Anvil step's op as the lesson asks
```
with:
```ts
/**
 * Whether the worn weapon's Primary holds a construct the lessons built: one
 * not plain (lesson 1 opens the first's socket) or not in the primary alone
 * (its last is in the secondary). Grask's rare drops plain in the primary, so
 * a plain Equip of it reads false and a Move all true.
 */
function lessonBuilt(registry: DataRegistry, profile: DelveProfile): boolean {
  const primary = profile.pair.primary;
  return primaryMoves(registry, profile).some(
    (m) => !isPlain(m) || m.elements.some((e) => e !== primary),
  );
}

/**
 * Whether the hero can't do an Anvil step's op as the lesson asks
```

Replace:
```ts
 * pouch rune for what is left of it; the refine into `metal`; the transfer
 * onto a bag weapon of `rarity`; any hone. Generous by design: it only offers
 * "Skip this step".
 */
```
with:
```ts
 * pouch rune for what is left of it; the refine into `metal`; a Move all with
 * no bag weapon of `rarity` (it is free); any hone. Generous by design: it only
 * offers "Skip this step".
 */
```

Replace (A's shape: the `case 'moveAll'` block in `unaffordable`, whatever body A left it):
```ts
    case 'moveAll': {
      const target = profile.bag.find((i) => i.slot === 'weapon' && atLeast(i, f.rarity));
      return !weapon || !target || movesetTransfer(registry, weapon, target).scrap > profile.scrap;
    }
```
with:
```ts
    case 'moveAll':
      return !weapon || !profile.bag.some((i) => i.slot === 'weapon' && atLeast(i, f.rarity));
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-tutorial-runner-rule.test.ts tests/delve-tutorial-runner-script.test.ts tests/delve-tutorial-review.test.ts tests/delve-tutorial-floors-play.test.ts tests/delve-tutorial-contract.test.ts tests/delve-tutorial-runner-dive.test.ts tests/delve-tutorial-runner-floor.test.ts tests/delve-tutorial-save.test.ts --reporter=dot)`
Expected: no type errors; PASS. The floors-play file's "a starter hero clears each in turn" (six primaries, about a minute each) is the one to watch: the starting sword now casts a Primary on d1-1, which only makes the rats fall faster.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-constructs-d1
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/tutorial.ts tests/delve-tutorial-runner-rule.test.ts tests/delve-tutorial-runner-script.test.ts tests/delve-tutorial-review.test.ts tests/delve-tutorial-floors-play.test.ts tests/delve-tutorial-contract.test.ts)
git add packages/engine/src/delve/tutorial.ts packages/engine/tests/delve-tutorial-runner-rule.test.ts packages/engine/tests/delve-tutorial-runner-script.test.ts packages/engine/tests/delve-tutorial-review.test.ts packages/engine/tests/delve-tutorial-floors-play.test.ts packages/engine/tests/delve-tutorial-contract.test.ts
git commit -m "feat(engine): the tutorial's Move all step holds on what the lessons built; its runner tests on banked weapons" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Chunk 2: The autopilot

### Task 3: The autopilot places, moves all, fills, melts and opens; the economy's rows

**Files:**
- Modify: `packages/engine/src/delve/autopilot.ts` (hand-edited, never formatted), `packages/engine/src/delve/economy.ts`
- Create: `packages/engine/tests/delve-constructs-bot.test.ts`
- Delete: `packages/engine/tests/delve-awaken-bot.test.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-constructs-bot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { betweenDives, runAutopilot } from '../src/delve/autopilot.js';
import { economySim } from '../src/delve/economy.js';
import { movesOf, setChains } from '../src/delve/moveset.js';
import {
  addLootToBag,
  createDelveProfile,
  equipItem,
  withMoveset,
} from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { emptyMaterials, withMaterial } from '../src/loot/materials.js';
import { movesetOf } from '../src/loot/moveset.js';
import { pouchCount, socketsOf } from '../src/loot/runes.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { CHAIN_SKILLS, type AbilitySlot, type Move } from '../src/types/ability.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem, Rarity } from '../src/types/gear.js';
import type { RuneRef } from '../src/types/rune.js';
import { registry } from './fixtures/arena.js';

// See the constructs spec §7: between dives the autopilot opens a skill when it can pay, places
// the bag's constructs where they raise Power, moves all onto a better weapon, fills an empty
// slot, and melts what it doesn't use; a new save's sword has its Primary from the start.

/**
 * A Fire hero after its first dive: nothing to forge (`emptyMaterials` drops the kit's bars and
 * its five uncommon flux on purpose, so no visit forges or opens a skill unless a case hands it
 * the flux), scrap, Dust and two Links to spare.
 */
function veteran(over: Partial<DelveProfile> = {}): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  return {
    ...p,
    materials: emptyMaterials(),
    links: 2,
    scrap: 1000,
    manaDust: 50,
    stats: { ...p.stats, dives: 1 },
    ...over,
  };
}
/** A sword of `rarity` banked into `p`'s bag (its constructs' uids minted): the profile and the item. */
function bagged(p: DelveProfile, rarity: Rarity, uid: string): [DelveProfile, GearItem] {
  const sword = generateItem(
    registry,
    { uid, ilvl: 6, rarity, slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(2),
  );
  const next = addLootToBag(registry, p, [sword]).profile;
  return [next, next.bag.find((i) => i.uid === uid)!];
}
/** The worn weapon's `skill` constructs. */
const worn = (p: DelveProfile, skill: AbilitySlot): Move[] =>
  movesetOf(registry, p.equipped.weapon!).chains[skill]?.moves ?? [];
/** Every rune socketed on the worn weapon. */
const wornRunes = (p: DelveProfile): RuneRef[] => {
  const { chains } = movesetOf(registry, p.equipped.weapon!);
  return CHAIN_SKILLS.flatMap((s) => movesOf(chains[s]))
    .flatMap(socketsOf)
    .filter((r): r is RuneRef => r !== null);
};

describe('the autopilot and constructs', () => {
  it("opens a skill it can pay for (a magic sword's Ultimate), and leaves one it can't", () => {
    const [p, magic] = bagged(veteran(), 'magic', 'w');
    const flux = withMaterial(emptyMaterials(), { kind: 'flux', grade: 'magic' }, 1);
    const armed = equipItem(registry, { ...p, materials: flux }, magic.uid);
    expect(movesetOf(registry, armed.equipped.weapon!).slots.ultimate ?? 0).toBe(0);
    const after = betweenDives(registry, armed);
    const { slots, bought } = movesetOf(registry, after.equipped.weapon!);
    expect([slots.ultimate, bought.ultimate, worn(after, 'ultimate').length]).toEqual([1, 1, 1]);
    expect(after.materials.flux.magic).toBe(0);
    const broke = betweenDives(registry, equipItem(registry, p, magic.uid));
    expect(movesetOf(registry, broke.equipped.weapon!).slots.ultimate ?? 0).toBe(0);
  });

  it("places the bag's construct that raises Power, and the plain one it displaces is gone", () => {
    const p = veteran();
    const [first] = worn(p, 'primary');
    const echo: Move = {
      uid: 'cEcho',
      kind: first.kind,
      form: first.form,
      elements: ['fire'],
      runes: [{ id: 'echo', tier: 3 }],
    };
    const after = betweenDives(registry, { ...p, constructs: [echo] });
    expect(worn(after, 'primary').map((m) => m.uid)).toContain('cEcho');
    expect(after.constructs).toEqual([]);
  });

  it('moves all onto the bag weapon that makes the best home, its constructs with it, and melts the old one', () => {
    const p = veteran({ runes: { echo: [0, 0, 1, 0, 0] } });
    const chain = movesetOf(registry, p.equipped.weapon!).chains.primary!;
    const [first, ...rest] = chain.moves;
    const moves = [{ ...first, runes: [{ id: 'echo', tier: 3 as const }] }, ...rest];
    const socketed = setChains(registry, p, { primary: { ...chain, moves } });
    expect(socketed.ok).toBe(true);
    const [withRare] = bagged(socketed.profile, 'rare', 'r');
    const after = betweenDives(registry, withRare);
    expect(after.equipped.weapon!.uid).toBe('r');
    expect(worn(after, 'primary')[0]).toMatchObject({
      uid: first.uid,
      runes: [{ id: 'echo', tier: 3 }],
    });
    // The old sword, refilled plain, was junk: melted, its plain constructs gone with it.
    expect(after.bag.some((i) => i.slot === 'weapon')).toBe(false);
    expect(after.constructs).toEqual([]);
  });

  it("melts a bag construct it can't place (a Bolt on a sword), its rune kept: back in the pouch or socketed", () => {
    const p = veteran();
    const bolt: Move = {
      uid: 'cBolt',
      kind: 'medium',
      form: 'bolt',
      elements: ['fire'],
      runes: [{ id: 'quick', tier: 1 }],
    };
    const after = betweenDives(registry, { ...p, constructs: [bolt] });
    expect(after.constructs).toEqual([]);
    const quick = { id: 'quick', tier: 1 as const };
    const held = pouchCount(after.runes, quick) + wornRunes(after).filter((r) => r.id === 'quick').length;
    expect(held).toBe(1);
  });

  it("fills a slot a Move all left empty (the rare's Ultimate) with a plain construct, for Dust", () => {
    const [p, rare] = bagged(veteran(), 'rare', 'r');
    const armed = equipItem(registry, p, rare.uid);
    const ms = movesetOf(registry, armed.equipped.weapon!);
    const ultimate = { ...ms.chains.ultimate!, moves: [] };
    const emptied = withMoveset(armed, { ...ms, chains: { ...ms.chains, ultimate } });
    expect(worn(emptied, 'ultimate')).toEqual([]);
    const after = betweenDives(registry, emptied);
    expect(worn(after, 'ultimate').length).toBe(1);
    expect(after.manaDust).toBeLessThan(emptied.manaDust);
  });

  it('reports what each visit placed and melted', () => {
    const report = economySim(registry, 1, 1);
    for (const d of report.dives) {
      expect(Object.keys(d.constructs).sort()).toEqual(['placed', 'salvaged']);
      for (const n of Object.values(d.constructs)) expect(Number.isInteger(n) && n >= 0).toBe(true);
    }
    expect(structuredClone(report.dives)).toEqual(report.dives);
  }, 30000);
});

describe("a new save's bot", () => {
  it('has its Primary from the start (two constructs on the common sword), before any forge', () => {
    for (const primary of ['fire', 'frost'] as const)
      for (const seed of [1, 2]) {
        const { profile } = runAutopilot(registry, { seed, dives: 0, primary });
        expect(worn(profile, 'primary').length, `${primary} ${seed}`).toBeGreaterThanOrEqual(2);
      }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-constructs-bot.test.ts --reporter=dot)`
Expected: FAIL, 5 of 7: the open skill (A's `awakenWeapon` opens the Ultimate alone, if at all), the placement (`cEcho` not worn), the Move all (the common sword still worn: A's no-op), the Bolt (still in the bag), the empty slot (still empty), the economy's `constructs` (undefined); the new save's Primary passes (A's slot table).

- [ ] **Step 3: The bot**

In `packages/engine/src/delve/autopilot.ts` (hand-edit; never formatted):

Add to the imports (merging with the lines A left; `heroChains` leaves the `../loot/moveset.js` import, `moveAll`, `placeConstruct` and `salvageConstruct` come from B2's module, `openSkill` is already there from A):

```ts
import { constructSkill, movesetOf, plainConstruct } from '../loot/moveset.js';
import { moveAll, placeConstruct, salvageConstruct } from './constructs.js';
import { MAX_CHAIN, MOVE_KINDS, type AbilitySlot, type Blow, type Chains, type ChainSkill, type Move } from '../types/ability.js';
```

Replace:
```ts
function fusePrimary(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const { primary, secondary } = p.pair;
  const chain = heroChains(registry, p.equipped, p.pair).primary;
  if (!primary || !secondary || !chain) return p;
```
with:
```ts
function fusePrimary(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const { primary, secondary } = p.pair;
  // Every construct, a dormant one too (`heroChains` drops those: an edit would price them as removed).
  const weapon = p.equipped.weapon;
  const chain = weapon && movesetOf(registry, weapon).chains.primary;
  if (!primary || !secondary || !chain || chain.moves.length === 0) return p;
```

Replace (A's shape: `transferBest`'s body returns `p` unchanged, marked `// D1 rewires to moveAll`; replace the whole function, doc comment included):
```ts
/**
 * Move the moveset onto the bag weapon that makes the best home (valued with
 * it moved: `compareItem`'s default), when that raises Power and it can pay.
 */
function transferBest(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const uid = bestGain(registry, p, 'home', (item) => item.slot === 'weapon');
  if (!uid) return p;
  const res = transferMoveset(registry, p, uid);
  return res.ok ? res.profile : p;
}
```
with:
```ts
/**
 * Move every construct onto the bag weapon that makes the best home (valued
 * with them moved: `compareItem`'s default), when that raises Power (`moveAll`,
 * free; the old weapon goes to the bag refilled plain).
 */
function moveAllBest(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const uid = bestGain(registry, p, 'home', (item) => item.slot === 'weapon');
  if (!uid) return p;
  const res = moveAll(registry, p, uid);
  return res.ok ? res.profile : p;
}

/**
 * Place the bag's constructs where they raise Power most (`placeConstruct`,
 * free): each round every bag construct is tried in every slot of its skill on
 * the worn weapon (an empty one, or a full chain's, whose construct goes to the
 * bag), the best gain taken, until none gains. A dormant placement is refused
 * by the op (the wrong class), so it never tries to play one.
 */
function placeBag(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  for (;;) {
    const weapon = p.equipped.weapon;
    if (!weapon || p.constructs.length === 0) return p;
    const { slots } = movesetOf(registry, weapon);
    const now = profilePower(registry, p);
    let best: { profile: DelveProfile; power: number } | null = null;
    for (const c of p.constructs) {
      const skill = constructSkill(registry, c);
      for (let index = 0; index < (slots[skill] ?? 0); index++) {
        const res = placeConstruct(registry, p, c.uid!, skill, index);
        const power = res.ok ? profilePower(registry, res.profile) : 0;
        if (res.ok && power > (best?.power ?? now)) best = { profile: res.profile, power };
      }
    }
    if (!best) return p;
    p = best.profile;
  }
}

/**
 * Fill the worn weapon's empty slots (a chain shorter than its slots: the
 * target's own went to the bag in a Move all) with plain constructs in the
 * primary (`plainConstruct`, `editDust` each through `setChain`), a skill at a
 * time in `SLOT_ORDER`, when it can pay and Power rises.
 */
function fillEmpty(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  const primary = p.pair.primary;
  if (!p.equipped.weapon || !primary) return p;
  for (const skill of SLOT_ORDER) {
    const weapon = p.equipped.weapon!;
    const { chains, slots } = movesetOf(registry, weapon);
    const chain = chains[skill];
    const moves = movesOf(chain);
    const n = slots[skill] ?? 0;
    if (!chain || moves.length >= n) continue;
    const added = Array.from({ length: n - moves.length }, (_, i) =>
      plainConstruct(registry, weapon, skill, moves.length + i, primary),
    );
    const next = (
      Array.isArray(chain) ? [...chain, ...added] : { ...chain, moves: [...chain.moves, ...added] }
    ) as Chains[ChainSkill];
    const res = setChain(registry, p, skill, next);
    if (res.ok && profilePower(registry, res.profile) > profilePower(registry, p)) p = res.profile;
  }
  return p;
}

/**
 * Melt every construct left in the bag (`salvageConstruct`: its runes back to
 * the pouch at the pull price; refused while the scrap for them isn't there).
 */
function salvageBag(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  for (const c of profile.constructs) {
    const res = salvageConstruct(registry, p, c.uid!);
    if (res.ok) p = res.profile;
  }
  return p;
}
```

Replace (A's shape: `awakenWeapon` calls `openSkill`; replace the whole function, doc comment included):
```ts
/** Awaken the rare weapon it wields when it can pay and Power rises (see the tutorial spec's Awaken). */
function awakenWeapon(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const weapon = p.equipped.weapon;
  const res = weapon && awaken(registry, p, weapon.uid);
  if (!res?.ok) return p;
  return profilePower(registry, res.profile) > profilePower(registry, p) ? res.profile : p;
}
```
with:
```ts
/**
 * Open each ability skill the worn weapon has no slot for (`openSkill`, in
 * `SLOT_ORDER`: the Primary, the Ultimate, then the Defensive) when it can pay
 * and Power rises (see the constructs spec §7); the slot arrives plain-filled.
 */
function openSkills(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  for (const skill of SLOT_ORDER.filter((s): s is AbilitySlot => s !== 'basic')) {
    const weapon = p.equipped.weapon;
    if (!weapon || (movesetOf(registry, weapon).slots[skill] ?? 0) > 0) continue;
    const res = openSkill(registry, p, weapon.uid, skill);
    if (res.ok && profilePower(registry, res.profile) > profilePower(registry, p)) p = res.profile;
  }
  return p;
}
```

Replace:
```ts
  /** Each step's net outflow from the stockpile, summed (salvage gives; it spends nothing). */
  spent: Haul;
  forged: GearItem[];
}
```
with:
```ts
  /** Each step's net outflow from the stockpile, summed (salvage gives; it spends nothing). */
  spent: Haul;
  forged: GearItem[];
  /** The bag's constructs it placed on the worn weapon, and those it melted. */
  constructs: { placed: number; salvaged: number };
}
```

Replace:
```ts
 * the gear it doesn't wear, refines flux and bars up, forges (a legendary
 * first), moves its moveset to a better weapon and equips upgrades, melts
 * what they replaced; awakens a rare weapon it wields (`awakenWeapon`);
 * spends Links on slots up to `SOCKETS_AFTER` a chain,
 * then on sockets for the pouch's runes (each filled as it opens), then on the
 * rest of the slots; sockets the best runes and fuses the copies left over;
```
with:
```ts
 * the gear it doesn't wear, refines flux and bars up, forges (a legendary
 * first), moves every construct to a better weapon (`moveAllBest`) and equips
 * upgrades, melts what they replaced; opens the skills it can pay for
 * (`openSkills`); places the bag's constructs where they gain (`placeBag`) and
 * melts the rest (`salvageBag`); fills the slots left empty (`fillEmpty`);
 * spends Links on slots up to `SOCKETS_AFTER` a chain (each under its
 * ceiling), then on sockets for the pouch's runes (each filled as it opens),
 * then on the rest of the slots; sockets the best runes and fuses the copies left over;
```

Replace:
```ts
  pay(equipBest(registry, transferBest(registry, p)).profile);
  melt();
  if (!legendaryWaits(registry, p)) {
    pay(awakenWeapon(registry, p));
    // Links: slots up to SOCKETS_AFTER a chain, then sockets for the runes in the pouch, then
    // the rest of the slots. Runes: upgrade the filled sockets, then fuse only the copies left
    // over and socket again (a fused tier can beat a socketed one).
    pay(spendLinks(registry, p, SOCKETS_AFTER));
```
with:
```ts
  pay(equipBest(registry, moveAllBest(registry, p)).profile);
  melt();
  if (!legendaryWaits(registry, p)) pay(openSkills(registry, p));
  // The bag's constructs (a melted weapon's, a Move all's): placed where they gain, free; the
  // rest melted, their runes back in the pouch before the sockets fill.
  const bagged = p.constructs.length;
  p = placeBag(registry, p);
  const placed = bagged - p.constructs.length;
  const left = p.constructs.length;
  pay(salvageBag(registry, p));
  const salvaged = left - p.constructs.length;
  if (!legendaryWaits(registry, p)) {
    pay(fillEmpty(registry, p));
    // Links: slots up to SOCKETS_AFTER a chain, then sockets for the runes in the pouch, then
    // the rest of the slots. Runes: upgrade the filled sockets, then fuse only the copies left
    // over and socket again (a fused tier can beat a socketed one).
    pay(spendLinks(registry, p, SOCKETS_AFTER));
```

Replace:
```ts
  pay(fusePrimary(registry, p));
  return { profile: p, quests, spent, forged };
}
```
with:
```ts
  pay(fusePrimary(registry, p));
  return { profile: p, quests, spent, forged, constructs: { placed, salvaged } };
}
```

Replace:
```ts
  return { profile: p, quests, spent, forged: held(p).filter((i) => !before.has(i.uid)) };
}
```
with:
```ts
  return {
    profile: p,
    quests,
    spent,
    forged: held(p).filter((i) => !before.has(i.uid)),
    constructs: { placed: 0, salvaged: 0 },
  };
}
```

Replace:
```ts
      forged,
      depth: dive.depth,
      died: dive.phase === 'dead',
    });
```
with:
```ts
      forged,
      constructs: visit.constructs,
      depth: dive.depth,
      died: dive.phase === 'dead',
    });
```

(`heroChains` is no longer read in this file: drop it from the `../loot/moveset.js` import, which `npx tsc` will not say but `eslint` would.)

`placeBag` tries every bag construct in every slot of its skill a round (each a `placeConstruct` dry run plus a `profilePower`) and takes the round's best. If `economySim` or the whole-tutorial test slows noticeably, the lazier form is the same loop breaking its inner loops on the round's first gain (`if (best) break;` after the `if (res.ok && power > …)` line and again after the construct loop): it still terminates and still places only where Power rises, just not the best first. Measure before choosing it.

In `packages/client/src/features/delve/lab/__tests__/economy-model.test.ts` (nobody else owns the Lab's fixtures; the engine's row is required, so `constructs/main` must typecheck between D1 and D2):

Replace:
```ts
    stops: haul(),
```
with:
```ts
    stops: haul(),
    constructs: { placed: 0, salvaged: 0 },
```

In `packages/client/src/features/delve/lab/__tests__/EconomyView.test.tsx`:

Replace:
```ts
        stops: emptyHaul(),
```
with:
```ts
        stops: emptyHaul(),
        constructs: { placed: 0, salvaged: 0 },
```

In `packages/engine/src/delve/economy.ts`:

Replace:
```ts
  /** Items forged on the Anvil visit after it, by rarity (every rarity, 0 where none). */
  forged: Record<Rarity, number>;
```
with:
```ts
  /** Items forged on the Anvil visit after it, by rarity (every rarity, 0 where none). */
  forged: Record<Rarity, number>;
  /** The bag's constructs that visit placed on the worn weapon, and those it melted (the constructs spec §7). */
  constructs: { placed: number; salvaged: number };
```

- [ ] **Step 4: Fold the Awaken bot test**

Its two cases live in the new file (the open skill; the new save's Primary):

```bash
cd /c/Projects/alloy-constructs-d1
git rm packages/engine/tests/delve-awaken-bot.test.ts
```

(If A already deleted or renamed it, `git rm` says so; move on.)

- [ ] **Step 5: Run them to see them pass**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-constructs-bot.test.ts tests/delve-autopilot-crafting.test.ts tests/delve-stops.test.ts tests/delve-maps-bot.test.ts --reporter=dot)`, then `(cd packages/engine && npx tsup) && (cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/lab --reporter=dot)`
Expected: no type errors in either package (the Lab's fixtures carry the row's new field); PASS. Two of the new cases rest on Power rising (the open Ultimate, the filled Ultimate): if `profilePower` doesn't value a one-move Nova on that hero, the bot is right to leave it and the case is wrong, not the bot; report it rather than tune. `delve-autopilot-crafting`'s first test can time out on a loaded machine; rerun it alone before calling it a regression.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-constructs-d1
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/economy.ts tests/delve-constructs-bot.test.ts)
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/lab/__tests__/economy-model.test.ts src/features/delve/lab/__tests__/EconomyView.test.tsx)
git add packages/engine/src/delve/autopilot.ts packages/engine/src/delve/economy.ts packages/engine/tests/delve-constructs-bot.test.ts packages/engine/tests/delve-awaken-bot.test.ts packages/client/src/features/delve/lab/__tests__/economy-model.test.ts packages/client/src/features/delve/lab/__tests__/EconomyView.test.tsx
git commit -m "feat(engine): the autopilot opens skills, places and melts the bag's constructs, moves all onto a better weapon, fills empty slots" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: The lesson's Move all; the whole guided start played by the bot

**Files:**
- Modify: `packages/engine/src/delve/autopilot.ts` (hand-edited, never formatted)
- Modify: `packages/engine/tests/delve-tutorial-bot.test.ts`

- [ ] **Step 1: The failing test**

In `packages/engine/tests/delve-tutorial-bot.test.ts`:

Replace:
```ts
import { movesetOf } from '../src/loot/moveset.js';
```
with:
```ts
import { isPlain, movesetOf } from '../src/loot/moveset.js';
```

Replace:
```ts
      // Grask's rare (one Primary slot as it drops), worn, holding the moveset the lessons built:
      // three moves or more (a stop may add one), the rune in the first.
      const weapon = p.equipped.weapon!;
      expect([weapon.rarity, weapon.mana]).toEqual(['rare', primary]);
      const moves = movesetOf(registry, weapon).chains.primary!.moves;
      expect([moves.length >= 3, socketsOf(moves[0])[0] !== null]).toEqual([true, true]);
      expect(p.pair).toEqual({ primary, secondary });
```
with:
```ts
      // Grask's rare (three plain Primary slots as it drops), worn, holding the constructs the
      // lessons built in place of its own (Move all): three or more, the rune in the first; and
      // nothing built left in the bag (the rare's plain ones were deleted as they were displaced).
      const weapon = p.equipped.weapon!;
      expect([weapon.rarity, weapon.mana]).toEqual(['rare', primary]);
      const moves = movesetOf(registry, weapon).chains.primary!.moves;
      expect([moves.length >= 3, socketsOf(moves[0])[0] !== null]).toEqual([true, true]);
      expect(p.constructs.filter((c) => !isPlain(c))).toEqual([]);
      expect(p.pair).toEqual({ primary, secondary });
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-tutorial-bot.test.ts --reporter=dot)`
Expected: FAIL, 40 of 42: each whole-tutorial case ends with the uncommon blade worn (the lesson's `moveAll` op is A's no-op, so `l2-transfer` never completes; `lessonVisit` finds it unaffordable or not, and either skips the step (`skippedSteps` holds `l2-transfer`, which `SKIPPABLE` lacks) or the tutorial (`skipped: 'l2-transfer'`)). The two "where the script meets the floors" cases pass.

- [ ] **Step 3: The lesson's op**

In `packages/engine/src/delve/autopilot.ts`:

Replace:
```ts
 * partner); the Skills lesson (`lessonChain`); salvage the slot's items of the
 * rarity; refine into the metal; transfer onto the bag weapon of the rarity;
 * hone the cheapest worn item's first line; a beat's Continue; the Training
```
with:
```ts
 * partner); the Skills lesson (`lessonChain`); salvage the slot's items of the
 * rarity; refine into the metal; move all onto the bag weapon of the rarity
 * (the best home); hone the cheapest worn item's first line; a beat's Continue; the Training
```

Replace (A's shape: the `case 'moveAll'` where `case 'transfer'` stood, its body returning `p`, marked `// D1 rewires to moveAll`):
```ts
    case 'transfer': {
      const uid = bestGain(registry, p, 'home', (i) => weapons.includes(i)) ?? weapons[0]?.uid;
      return uid ? transferMoveset(registry, p, uid).profile : p;
    }
```
with:
```ts
    case 'moveAll': {
      const uid = bestGain(registry, p, 'home', (i) => weapons.includes(i)) ?? weapons[0]?.uid;
      return uid ? moveAll(registry, p, uid).profile : p;
    }
```

- [ ] **Step 4: Run it to see it pass**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-tutorial-bot.test.ts --reporter=dot)`
Expected: no type errors; PASS, 42 tests (about 10 minutes: 40 whole guided starts). Each run: `tutorial` null, `floors` the eight at their depths, no retry, both dives extracted, `skippedSteps` within `SKIPPABLE` (the perfect dodge where Earth kills the brute first), the stops offering where their steps name a kind (stop 5's `slot` is the blade's Defensive, 1 → 2, at 1 Link + 20 scrap), the rare worn with the lesson's first construct socketed.

If a pair dies to Grask four times (`retries: 4, skipped: 'd2-grask'`): the hero now casts the blade's Ward and its Strike from d1-1, so it should be stronger than at v0.62.0, not weaker; report the pair and seed, don't retune `d2-5`.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-constructs-d1
(cd packages/engine && npx prettier --write --end-of-line auto tests/delve-tutorial-bot.test.ts)
git add packages/engine/src/delve/autopilot.ts packages/engine/tests/delve-tutorial-bot.test.ts
git commit -m "feat(engine): the autopilot's lesson 2 moves all onto Grask's rare; the whole guided start on constructs" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Chunk 3: The E2E and the close

### Task 5: The tutorial E2E: a Jump in save's Primary and Defensive; Move all by the pad

The client here is C1's and C2's as merged (the Skills tab's targets and the take sheet's `take-move-all`); this task runs only after C1 and C2 are on `constructs/main` **and after D2's fixture task (07-finish Task 6: `e2e/fixtures/delve.ts`'s `armed` minting every construct's uid, `withUids`) has landed** (the integrator orders it so): until then TU03 and TU04 load a reset save and fail. C1 skipped two trail-walking tests for this plan to rewrite and renamed the Skills tab's remove to an unsocket (`move-remove` → `move-unsocket`): the tests join this task; TU01 presses no remove.

**Files:**
- Modify: `packages/client/e2e/delve-tutorial.spec.ts`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx`, `packages/client/src/features/delve/tutorial/__tests__/marked-trails.test.ts` (C1's two skipped trail-walking tests, un-skipped and rewritten against the Skills tab as C1 built it)

- [ ] **Step 1: The header and the imports**

Replace:
```ts
import {
  addSlot,
  createDefaultRegistry,
  createDelveProfile,
  defaultMoveset,
  generateItem,
  SeededRNG,
} from '@alloy/engine';
```
with:
```ts
import {
  createDefaultRegistry,
  createDelveProfile,
  defaultMoveset,
  generateItem,
  mintUid,
  SeededRNG,
  type DelveProfile,
  type GearItem,
} from '@alloy/engine';
```

Replace:
```ts
 * the player would: Continue on reading beats, "Skip this step" when offered, the stops' power-ups
 * and roads, then Anvil lesson 1 op by op through the hub. And a Jump in save has only the Basic
 * until its first forge.
 */
```
with:
```ts
 * the player would: Continue on reading beats, "Skip this step" when offered, the stops' power-ups
 * and roads, then Anvil lesson 1 op by op through the hub. And a Jump in save's common sword holds
 * two Primary constructs and no Defensive until its first forge (the constructs spec §3.2).
 */
```

After the `steps` helper (before `/** What the Depart sheet says…`), add:

```ts
/** `item` banked into `p`'s own uids: every construct of its moveset minted (`mintUid`), as a bank does. */
function minted(p: DelveProfile, item: GearItem): [DelveProfile, GearItem] {
  let profile = p;
  const chains = Object.fromEntries(
    Object.entries(item.moveset!.chains).map(([skill, chain]) => {
      const tag = <M extends { uid?: string }>(m: M): M => {
        const [uid, next] = mintUid(profile);
        profile = next;
        return { ...m, uid };
      };
      return [
        skill,
        Array.isArray(chain) ? chain.map(tag) : { ...chain, moves: chain.moves.map(tag) },
      ];
    }),
  ) as NonNullable<GearItem['moveset']>['chains'];
  return [profile, { ...item, moveset: { ...item.moveset!, chains } }];
}
```

- [ ] **Step 2: TU01's and TU03's comments**

In TU01, replace:
```ts
    // The Primary: the marker leads through the editor, entry by entry: the slot, the new move
    // in frost, the way out; the first move's socket and its rune, the way out; Apply, then the
    // sheet's Apply.
```
with:
```ts
    // The Primary: the marker leads through the editor, entry by entry: the slot, its new
    // construct in frost, the way out; the first construct's socket and its rune, the way out;
    // Apply, then the sheet's Apply (the bag pane beside it holds nothing yet).
```

- [ ] **Step 3: TU04 as a Move all**

Replace:
```ts
  test("TU04: lesson 2 by the pad: the rare's Transfer through the take sheet, then a Hone on Temper's list", async ({
    page,
  }) => {
    const registry = createDefaultRegistry();
    // Grask's set drop: a rare sword in the primary.
    const rare = generateItem(
      registry,
      { uid: 'grask-sword', ilvl: 5, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(5),
    );
    // The worn sword as lesson 1 left it: a Primary past its base slots, so the Transfer has a
    // moveset to move (the step holds once the rare is worn with more moves than its base).
    const built = addSlot(
      registry,
      { ...armed(registry, createDelveProfile(registry, 4242, { primary: 'fire' })), links: 9, scrap: 2000 },
      'primary',
    );
    expect(built.ok).toBe(true);
    // A save at the lesson's Transfer, Grask's rare in the bag, the scrap for the move and a hone.
    await seedProfile(page, 4242, false, 'frost', {
      scrap: 2000,
      equipped: built.profile.equipped,
      bag: [{ ...rare, moveset: defaultMoveset(registry, rare, 'fire') }],
      tutorial: { step: 'l2-transfer', count: 0, misses: 0 },
    });
```
with:
```ts
  test("TU04: lesson 2 by the pad: the rare's Move all through the take sheet, then a Hone on Temper's list", async ({
    page,
  }) => {
    const registry = createDefaultRegistry();
    // The worn sword as lesson 1 left it: its first Primary construct socketed, so the step holds
    // once the rare wears what the lessons built (a plain Equip of it would not).
    const worn = armed(registry, createDelveProfile(registry, 4242, { primary: 'fire' }));
    const ms = worn.equipped.weapon!.moveset!;
    const [first, ...rest] = ms.chains.primary!.moves;
    ms.chains.primary!.moves = [{ ...first, runes: [null] }, ...rest];
    // Grask's set drop: a rare sword in the primary, plain, banked (its constructs' uids).
    const dropped = generateItem(
      registry,
      { uid: 'grask-sword', ilvl: 5, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(5),
    );
    const [p, rare] = minted(worn, { ...dropped, moveset: defaultMoveset(registry, dropped, 'fire') });
    // A save at the lesson's Move all, Grask's rare in the bag, the scrap for a hone.
    await seedProfile(page, 4242, false, 'frost', {
      scrap: 2000,
      nextUid: p.nextUid,
      equipped: p.equipped,
      bag: [rare],
      tutorial: { step: 'l2-transfer', count: 0, misses: 0 },
    });
```

Replace:
```ts
    // Then the footer's A, which on this weapon is "Equip or transfer".
    await marked('loadout.transfer');
    await expect(page.locator('.k-prompt[data-tutorial="loadout.transfer"]')).toContainText(
      'Equip or transfer',
    );
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('take-sheet')).toBeVisible();
    // In the sheet, its Transfer: marked and focused.
    await marked('loadout.transfer');
    await expect(page.getByTestId('take-transfer')).toBeFocused();
    await tap(page, BUTTON.a);
    await expect.poll(() => step(page)).toBe('l2-hone');
```
with:
```ts
    // Then the footer's A, which on a weapon that can take your constructs opens the take sheet.
    await marked('loadout.transfer');
    await expect(page.locator('.k-prompt[data-tutorial="loadout.transfer"]')).toBeVisible();
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('take-sheet')).toBeVisible();
    // In the sheet, its Move all: marked and focused.
    await marked('loadout.transfer');
    await expect(page.getByTestId('take-move-all')).toBeFocused();
    await tap(page, BUTTON.a);
    await expect.poll(() => step(page)).toBe('l2-hone');
```

- [ ] **Step 4: TU02 for the new start**

Replace:
```ts
  test('TU02: a Jump in save has only the Basic until its first forge gives it a Primary', async ({
    page,
  }) => {
```
with:
```ts
  test("TU02: a Jump in save's sword has a Primary from the start and no Defensive until its first forge", async ({
    page,
  }) => {
```

Replace:
```ts
    // The common sword carries the Basic alone: no Primary slot in the dive.
    await startDive(page);
    await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });
    await expect(page.getByTestId('attack-button')).toBeVisible();
    await expect(page.getByTestId('ability-0')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-screen').getByTestId('pause-abandon').click();
    await page.getByTestId('return-camp').click();

    // The kit forges an uncommon sword: worn, it carries the Primary.
```
with:
```ts
    // The common sword holds two Primary constructs (the constructs spec §3.2) and no Defensive
    // slot: Q has a slot in the dive, E none.
    await startDive(page);
    await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });
    await expect(page.getByTestId('attack-button')).toBeVisible();
    await expect(page.getByTestId('ability-0')).toHaveAttribute('aria-label', /^Primary: /);
    await expect(page.getByTestId('ability-1')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-screen').getByTestId('pause-abandon').click();
    await page.getByTestId('return-camp').click();

    // The kit forges an uncommon sword: worn, it adds a Defensive slot, plain-filled.
```

Replace:
```ts
    await startDive(page);
    await expect(page.getByTestId('ability-0')).toHaveAttribute('aria-label', /^Primary: /, {
      timeout: ARENA_READY,
    });
  });
});
```
with:
```ts
    await startDive(page);
    await expect(page.getByTestId('ability-1')).toHaveAttribute('aria-label', /^Defensive: /, {
      timeout: ARENA_READY,
    });
  });
});
```

- [ ] **Step 4b: C1's two trail-walking tests**

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx` and `packages/client/src/features/delve/tutorial/__tests__/marked-trails.test.ts`, turn C1's `it.skip` / `describe.skip` back to `it` / `describe` and rewrite each walk against the Skills tab as C1 built it: the lesson's trail is unchanged (`skills.primary`, `skills.addSlot`, `skills.elements`, `skills.socket`, `skills.rune`, `skills.apply`; `skills.card:first` / `:last` and `back` as the ways), the card's X is an unsocket (`move-unsocket`, where the old walk pressed `move-remove`), a construct it unsockets lands in the bag pane (`construct-bag`, its row `data-construct={uid}`), and the chain's uids are the worn weapon's (a walk that builds the worn weapon by hand gives its constructs uids). The walks' assertions (which entry the marker sits on after each click) are what they were; only the controls they press and the save they seed change. Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx src/features/delve/tutorial/__tests__/marked-trails.test.ts --reporter=dot)`. Expected: PASS, none skipped.

- [ ] **Step 5: Run the spec**

Run: `(cd packages/engine && npx tsup) && (cd packages/client && npx tsc --noEmit -p . && npx playwright test e2e/delve-tutorial.spec.ts --project=desktop --reporter=dot)`
Expected: no type errors (`mintUid`, `DelveProfile` and `GearItem` come from `@alloy/engine`; if `mintUid` isn't exported, A's contract says it is: report it); PASS, 4 tests, **only once D2's `withUids` fixture (07-finish Task 6) is on the branch**: before it, TU03 and TU04 seed a save whose constructs have no uid, v14's load resets it, and both fail at their first step. TU01 is the long one (about five minutes): dive 1 by the bot, stop 1's required Equip, the beats, lesson 1 through the hub. TU02 asks `ability-1` for the Defensive slot's button: the HUD hides a skill with no chain, as it hid an uncarried one.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-constructs-d1
(cd packages/client && npx prettier --write --end-of-line auto e2e/delve-tutorial.spec.ts src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx src/features/delve/tutorial/__tests__/marked-trails.test.ts)
git add packages/client/e2e/delve-tutorial.spec.ts packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx packages/client/src/features/delve/tutorial/__tests__/marked-trails.test.ts
git commit -m "test(client): the tutorial E2E on constructs: a Jump in save's Primary from the start, lesson 2's Move all by the pad; the trail walks un-skipped" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: Close the area

- [ ] **Step 1: The whole engine suite.** `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run --reporter=dot)`. Expected: everything passes but, possibly, the pacing-sensitive files under "Needs routed → D2" (the kit rail, the depth and time rails: the bot's new ops move pacing on purpose). Don't tune or mark them: list each failing test's name and its measured number in the handover.
- [ ] **Step 2: The client.** `(cd packages/engine && npx tsup) && (cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot)`. Expected: no type errors (Task 3 gave the Lab's two economy fixtures the row's `constructs`); everything as C1 and C2 left it, plus Task 5's two un-skipped trail tests green.
- [ ] **Step 3: Handover.** No commit. Report: the five commits, the suite counts, the failing pacing-sensitive tests with numbers, the whole-tutorial run's stops and skipped steps per pair, and any assumption above that didn't hold.

---

## Needs routed

- **D2 (pacing, E2E fixtures, docs, the Lab).**
  - `tests/delve-pacing.test.ts` line 105 ("before dive 1 the kit forges…", `FirstForges.opened`): the opening visit forges the kit's uncommon sword only when Power rises by `MIN_FORGE_GAIN` (its Defensive slot and lines, against a common sword that already holds two Primary constructs). If `opened` reads false, the rail's premise (S8: the kit's purpose was the Primary) is gone with the carries; re-band or retire `opened`, don't make the bot forge for its own sake.
  - `e2e/fixtures/delve.ts`'s `armed` builds the uncommon sword's moveset with `defaultMoveset`, whose constructs have no uid; under save v14 `parseDelveProfile` resets such a save, so every spec seeded through `seedProfile` loads a fresh profile. Mint them: after `const moveset = defaultMoveset(...)`, loop every chain's constructs through `mintUid(p)` (as TU04's `minted` does; lift that helper into the fixture and have `armed` use it, then TU04 can import it). **Integrator: land that task (07-finish Task 6) before D1's Task 5 runs**, which its header says too.
  - Other specs' comments that say the common sword carries the Basic alone: `e2e/delve.spec.ts` line 337 (and its locked-skills expectation), `e2e/delve-gamepad.spec.ts` line 47, `e2e/delve-training.spec.ts` line 143, `e2e/fixtures/delve.ts` line 20.
  - `EconomyDive.constructs` (required; Task 3 gave the Lab's two fixtures the field): the Economy view may table it or ignore it.
  - CLAUDE.md: the Weapon movesets paragraph's autopilot sentence ("transfers onto its best bag weapon, awakens the rare…") becomes the constructs one (opens skills, places the bag's constructs by Power, moves all onto a better weapon, melts what it doesn't use, fills empty slots); the Guided start paragraph's lesson 2 ("Transfer onto Grask's rare") becomes Move all, its `transfer` trigger `moveAll`, `tutorialHolds`' Move all reading "the rare worn with what the lessons built"; the Crafting paragraph's `economySim` rows gain `constructs`.
- **C2 (the Loadout).** The take sheet's Move all button carries `data-testid="take-move-all"` (the contract) and keeps `data-tutorial="loadout.transfer"`, as the footer's A prompt on a weapon that can take your constructs does (`LoadoutTab.tsx` line 157, `ComparePane.tsx` line 278, `TakeSheet.tsx` line 76): the tutorial's target id is unchanged, only its wording ("Move all"). TU04 no longer asserts the prompt's label text.
- **C1 (the Skills tab).** TU01 walks lesson 1 through these selectors and targets, which must survive: `add-slot` (`skills.addSlot`), `move-2` and `move-0` (`skills.card:last` / `:first`), `move-elements` (`skills.elements`), `move-editor-back` (`back`), `socket-open` (`skills.socket`), `inspect-socket-0`, `rune-picker` and `rune-pick-*` (`skills.rune`), `chain-apply` and `apply-sheet-confirm` (`skills.apply`); it presses no `move-remove`, so C1's `move-unsocket` touches only the two trail tests Task 5 un-skips. The lesson's Apply is a chains-only draft (the bag pane holds nothing): `applyDraft` with the bag as it is.
- **B2 (the ops the bot leans on).** `placeConstruct` into a full chain's slot deletes the displaced plain construct at once (`placeBag` counts on `profile.constructs` shrinking, and the whole-tutorial test on no plain construct lingering); `salvageConstruct` refuses, not throws, when the scrap for its runes isn't there; `moveAll` emits `{ type: 'moveAll' }` through `applyTutorialEvents` after it commits (the contract test and `lessonOp` read it); `moveAll` sends the target's own constructs of every chain to the bag, so the Ultimate of Grask's rare is empty after lesson 2 (the bot's `fillEmpty` refills it on its next ordinary visit; a player adds one in the Skills tab).
- **A (assumptions 1–9 above).** The names the edits anchor on: `transferBest`, `awakenWeapon`, the two `case 'moveAll'` blocks in `tutorial.ts`, the one in `autopilot.ts`'s `lessonOp`; `addLootToBag` minting; `withChains` keeping given uids.

## Open questions for the integrator

1. **The rare's Ultimate after Move all.** Decided (the overview's `moveAllPreview`): a target skill the worn weapon moves nothing into keeps its own constructs, so the rare keeps its Nova, `fillEmpty` finds nothing there, and the farewell's "a rare has room for an Ultimate" reads true.
2. **`loadout.transfer` and `l2-transfer`.** Kept (see Where the spec left room 5). Rename both to `moveAll` only if C2 renames the client's `data-tutorial` in the same merge (`marked.ts`'s `WAY_TO`, `LoadoutTab`, `ComparePane`, `TakeSheet`, their tests, and `TUTORIAL_TARGETS`).
3. **A set drop's `slots.primary` past its ceiling.** No shipped drop sets it; the type allows any number and `defaultMoveset` passes it through. A one-line check in `tutorialFloorProblems` (`slots.primary ≤ slotRange(rarity).ceiling`) would refuse a hand edit that makes an over-ceiling weapon. Left out (YAGNI); add it if a floor ever uses `slots`.
5. **Power and a one-move Ultimate.** `openSkills` and `fillEmpty` gate on `profilePower` rising; two of the new bot cases assume a plain Nova on a magic or rare sword raises it. If `estimateCombat` values the Ultimate at nothing on that hero, the bot keeps its flux and Dust (right), and the two cases need a hero whose Power it moves (an Ultimate with a rune in the pouch, say), not a change to the bot.
