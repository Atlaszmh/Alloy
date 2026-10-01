# Delve Weapon Movesets Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The chains live on the weapon. Each weapon carries the chains its rarity allows (common and uncommon: Basic and Primary; magic and rare add the Defensive; epic and legendary all four), with a slot count per chain that grows to 5; drops roll extra slots by rarity; salvaging a weapon gives Links, which buy slots; edits cost Mana Dust, priced by one shared function; a transfer moves a moveset onto another weapon for scrap; weapons are valued as they are and as a home for your moveset; all gear, the forge and salvage are locked mid-dive but for one power-up at each stop between depths; the save becomes version 6; and the autopilot plays by the new rules. This plan builds the engine (Tasks 1–11), the spec's balance gate (Task 12), the client (Tasks 13–16), the E2E (Task 17), and the docs, the version and the full verification (Task 18). It is stage 4a of the skill roadmap, and ships as v0.49.0.

**Architecture:** The engine owns it. Data first (`balance.json → delve.movesets`: `carries`, `extraSlots`, `slotLinks`, `slotScrap`, `editDust`, `elementDust`, `transferScrap`), then `GearItem.moveset` (`Moveset`: `chains: Partial<Chains>`, `slots`). `src/loot/moveset.ts` holds the pure parts: which chains a rarity carries, base slots, default moves, a drop's roll (`rollMoveset`, from `rng.fork('moveset')` after every other roll, so nothing else a drop rolls changes), a weapon's extra slots, `heroChains` (the equipped weapon's chains, or the unarmed default) and `movesetTransfer`. `HeroEntity.chains` becomes `(ResolvedChain | null)[]`: an uncarried skill is a null chain that every sim reader passes over. The profile loses `chains` and `chainCaps` and gains `links` (save v6: `parseDelveProfile` migrates version 5 and fits every weapon to the data at load). `src/delve/moveset.ts` holds the profile ops: `movesetEditPrice`, `setChains`/`setChain` (results, not throws), `addSlot`, `transferMoveset`. `compareItem` values a weapon as a home by default (`WeaponValue`); `equipBest` leaves weapons alone; the dive lock refuses every gear, forge and salvage op mid-dive. `src/delve/stops.ts` holds the stops: `completeFloor` rolls `DiveState.stop` (`rollStop`), and `takeStop` runs its one op with the lock lifted. `followBasic` retires from the Delve (the Training Grounds keep it).

The client follows the engine's bundle (Task 13 rebuilds it). The store wraps the new ops (`setChains`, `addSlot`, `transfer`, `takeStop`; `salvage` reports Links; the migration's dropped chains and reset become toasts, `movesetNotices`), every reader takes the hero's chains from `heroChains`, and the arena passes over a skill the weapon doesn't carry (the HUD hides its button). The Anvil's chain builder (`AbilitiesPanel` over `ChainEditor`) edits a draft of the equipped weapon's chains, with its price, **Apply** and **Revert**, each chain's slots and **Add slot**, locked tabs and off-pair marks; the weapon's item sheet shows its moveset, both valuations and **Transfer**; Links show in the header, the dive summary and the toasts; every gear control gives way to "Equip at the Anvil" mid-dive (the forge's and salvage's to their own notes); the builder's draft lives in the store; and the door screen holds the stop's cards and pickers (`StopPanel`).

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom with Testing Library), Zod 3, React 19, Zustand 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md` at `b053577` (the requirements; read it first). Its "Stops between depths" section came after the first gate (`7d9e2e6`), the first-dive rail and the stops' affordability after the second (`f4dd5bf`), and the forge and salvage joining the dive lock last (`b053577`).

---

## Measured before and after: read before executing

The spec's Balance section: "Every rail in `tests/delve-pacing.test.ts` must hold. If one breaks, stop and report the numbers." Everything below was built and run on a scratch copy of HEAD (the engine and client sources are the same at `b053577` as at `7ad1a1c`), at the spec's values; nothing is tuned. The plan stopped at the gate twice, and the user chose each fix:
- **The first gate:** Task 8's dive lock ends the autopilot's habit of equipping upgrades as they drop, so a new hero fights its whole first dive with the starting common sword, a Basic chain and a one-move Primary, and every seed's first dive died at depth 3 (a mean of 3 against the rail's 4). **The user's answer:** one power-up at each stop between depths (Tasks 10 and 11).
- **The second gate:** with stops the later dives came back, but every first dive still ended at depth 3. **The user's answer:** a short first dive is a scouting run. The first-dive rail becomes "each at least 3, mean 3 to 12" (Task 8 makes the change, in the task that first breaks the old rail), and a stop offers only what the hero can take and pay for (Task 10).

So **every rail holds after every task**, and every task's commit is green. Task 12 measures, writes the numbers into the spec's status line, and goes on.

| | Before (v0.48.0) | After Task 7 | After Task 9 (no stops yet) | After Task 11 (final) |
|---|---|---|---|---|
| Pacing: first dives (each ≥ 3; the mean's rail 4–12 before Task 8, 3–12 from it) | 11, 11, 11, 13 (mean 11.5) | 3, 11, 3, 12 (mean 7.25) | 3, 3, 3, 3 (mean 3) | 3, 3, 3, 3 (mean 3) |
| First dives' Power at death | 3,789–8,748 | | 761–836 | 1,022–1,352 |
| Pacing: dive 6, dive 12 means | 25.5, 35 | 23, 31 | 18.25, 31.5 | 22.25, 31.5 |
| Pacing: Frost dive 1 → dive 12 | 8.5 → 32.5 | 7.5 → 31.5 | 3 → 25 | 4 → 29.5 |
| Pacing: legendaries at dive 12; own pair's reaction | 6; 6 of 6 | 5; 6 of 6 | 5; 6 of 6 | 6; 6 of 6 |
| Pacing: the 15-pair sweep at dive 6 | median 27, 21–37 (allowed 16.2–43.2) | median 22, 18–29 (allowed 13.2–35.2) | median 23, 20–28 (allowed 13.8–36.8) | median 21, 18–26 (allowed 12.6–33.6) |
| Pacing: seconds a floor (8–60) | 20.89 | 30.88 | 28.26 | 34.73 |

The DPS Lab grid (depth 10, one dummy and the pack, one seed, 9,144 runs) comes out **identical**, row for row, as the spec's gate asks; and v0.48.0's items, 291 of them over every rarity and a run of encounter drops, hash the same with their movesets left out (`delve-movesets.test.ts` pins it). Every seed's second dive goes deeper than its first (to depths 5 to 7).

The engine's suite goes from 1368 tests in 77 files (after Task 1) to 1421 in 78. The client: its suite goes from 718 tests in 89 files to 758 in 91, all passing after each of Tasks 13–16; its typecheck and build pass; and the Delve E2E (Task 17) passes on all four devices, 60 tests (15 each), in about 4 minutes. The forge and salvage lock (Task 8) moves no pacing number: the autopilot forges and salvages between dives, and a stop's upgrade runs with the lock lifted.

---

## Where the spec left room

- **`slotScrap`** is `[20, 40, 60, 80]` and **a ◂▸ swap costs 5** (one of the two moves is in the longest shared run): both open at the first gate, both confirmed in the spec at `7d9e2e6`.
- **Stops.** `takeStop(registry, profile, action)` takes one `StopAction` (`{ kind: 'equip', uid }`, `{ kind: 'slot', skill }`, `{ kind: 'move', skill, index, move }`, `{ kind: 'upgrade', uid }`) in place of the spec's `(kind, args)`, so each kind's arguments are typed (Task 18 corrects the spec's line). A kind applies (`stopKinds`) on the profile after the floor's loot is banked, when the hero can take and pay for its cheapest action: `equip` with any bag item; `slot` when some carried chain's next slot's Links and scrap are there; `move` with a weapon and `editDust` in Mana Dust, or free edits (`stats.dives === 0`, which a stop never sees: a dive counts from its start, so a stop's move is always paid); `upgrade` when some item's next upgrade is affordable. The offers keep the kinds' order (`STOP_KINDS`: equip, slot, move, upgrade). The lock is lifted by running the op on the profile with its dive set aside, then putting the dive back with the stop taken. `move` is "an edit of exactly one position": a whole index the chain holds (`Adjust a move the chain holds`), a move of the chain's shape (`Not a primary move`: a blow for an ability chain, or a move for the basic chain) and a changed one (`Change the move`), so a stop can't be spent on nothing. Its other refusals: `No stop here`, `This stop's power-up is taken`, `Not offered at this stop`, and each op's own. The autopilot's "upgrade its cheapest affordable item" means its equipped items (the ones its forge visits upgrade), and its "equip the best item as-is, if one beats its current gear" compares as it is (`compareItem(…, 'asIs')`).
- **Where the prices live.** `movesetEditPrice(registry, old, next)` takes chain maps (`Partial<Chains>`) and sums the chains `next` holds, so the builder's preview can pass the draft's changed chains and `setChains` its whole edit. `editPrice(registry, profile, next)` applies the first-dive freebie (0 while `stats.dives === 0`). A move's identity is its kind, form and elements in order (a blow: kind and element); "elements equal some old move's" compares the ordered list with every old move of the chain.
- **Off-pair sets.** "An off-pair element set" is counted as a set (sorted), so re-ordering a fused move's elements keeps its set (and still costs `elementDust`, being a changed element list). Before the choice nothing is off-pair.
- **Refusal texts.** Moves mid-dive: `Chains can only change between dives` (today's text) for `setChains` and `addSlot`; `Transfer your moveset between dives`; unarmed: `Equip a weapon to build your moves` (the spec's); uncarried: `Carried by magic weapons and better` / `…epic…` (`carriedByText`, the locked tab's text too); `A chain holds 1 to N moves`; `Unknown form X` and `Not a primary chain` (a chain of the wrong shape: untyped input, which `setChains` refuses rather than throws on); `Pick from your two elements` (off-pair); `Not enough Mana Dust`, `Not enough Links`, `Not enough scrap`; at the cap: `This chain has every slot`; a transfer target that isn't a bag weapon: `Transfer onto a weapon in your bag`. Gear mid-dive: `equipItem` and `unequipSlot` throw `Equip at the Anvil, between dives` (they throw their other refusals too), and `equipBest` changes nothing. The forge mid-dive: `upgradeGear`, `reforgeGear` and `fuseGear` refuse with `Forge at the Anvil, between dives`, and `salvageItems` melts nothing (it returns the profile with a count of 0); the auto-salvage of new loot (`addLootToBag`) still runs.
- **`addSlot`'s new move.** "The default kind at that position: the form's `defaultChain`" reads as the **last move's** form's default chain (its form is the last move's), at the new move's index, medium past its end; a basic chain uses the weapon's string. Its elements: the last move's while all in the pair, else the pair's primary (before the choice, the last move's).
- **Where things live.** `heroChains`, `movesetOf` (a weapon's stored moveset, or its base defaults in its own mana for a weapon without one, such as a test's hand-made item: every saved weapon gets one at load) and `movesetTransfer` are pure, in `src/loot/moveset.ts`, which imports nothing from `src/delve/`, so `hero-stats.ts` can value a home without an import cycle. The profile ops live in `src/delve/moveset.ts`; `setChain` moves there from `profile.ts`.
- **An absent skill in the sim.** `nextMove` and `pressMove` return null for it and `pressStep` 0; `castAbility`, `startHold` and `abilityReady` already refused a missing chain. The Defensive's effect, a wind-up and a hold only exist on a slot with a chain, so their readers take `h.chains[slot]!`. `estimateCombat` keeps its all-four default for callers that pass no chains.
- **The migration's order.** A version 4 or older save converts to version 5's shape, then to version 6 (dropping what the weapon can't carry), and only then is fixed to the pair on the equipped weapon: a move that went with a dropped chain gets no fix notice (`dropped` reports its chain instead). `ParsedDelveProfile` gains `dropped: ChainSkill[]` (for the toast) beside `movesetReset`. An unarmed version 5 save's chains count as built when they differ from the version 5 defaults on its pair (all four default chains in the primary, the basic chain's last blow the bound secondary). Since the check runs before the fix, an unarmed version 3 or 4 save whose builds were default forms in an element other than its migrated primary is flagged as reset too (the spec's order would have fixed them into the defaults first): rare, and the toast is still true.
- **Fitting at load** covers every weapon, equipped and in the bag; `dive.bestFind` (a display copy) is left alone.
- **Valuing.** `compareItem(equipped, item, registry, depth, pair?, value = 'home')` (`WeaponValue = 'home' | 'asIs'`): a home moves the equipped weapon's moveset onto the candidate with `movesetTransfer`; unarmed, or the equipped weapon compared with itself, it values as-is. `salvageCandidates` and the autopilot's fusion spares use the default.
- **The autopilot.** It binds before it salvages (as today), but builds its fused Primary last, after the forge visit (Task 3), since a new weapon brings its own moves; the edit is skipped when unaffordable. Between dives it transfers onto the bag weapon with the best `compareItem` (home) above 0, then equips non-weapon gear, fuses and salvages, then spends Links on slots in the order Primary, basic chain, Ultimate, Defensive, each skill as far as its Links and scrap go (a slot it can't afford passes to the next skill's, so a cheap slot on a later chain can be bought while the Primary's next waits), then upgrades.
- **Task order.** Task 3 retires `followBasic` from the Delve while the chains still sit on the profile (its behaviour changes are all there, and it moves the pacing a little: a bind no longer re-colours the basic chain's last blow). Task 4 moves the chains onto the weapon with the plainest migration (the equipped weapon takes all four chains), and Task 5 adds the spec's migration rules (dropping, Links, fitting at load, the unarmed reset), so each commit is green. Task 4 is one commit whose steps span two chunks (its tests, then its sources).
- **The builder's draft (Task 14).** It lives in the store (`chainDraft`, never saved), so it outlives the Abilities tab; it is keyed on the equipped weapon's uid and the pair. Equipping another weapon or a transfer drops it (the store's `commit`), a bind or a realign leaves it unused (its pair is gone), a dive's start drops it, an edit undone by hand leaves nothing, and a successful Add slot drops that chain's edit. While a draft is pending the Anvil's Abilities tab says "N unapplied changes" (one per chain) and the Delve button has "Unapplied changes: apply or revert them first" above it; diving anyway drops them. Apply sends the changed chains to `setChains` (all or nothing) and shows a refusal's reason, which the next change clears; Revert drops the draft. The price line reads "Changes are free until your first dive" while `stats.dives === 0` (the edits still go through the draft and Apply, at 0), else "Changes cost ✦ N Mana Dust (you have ✦ M)", and Apply is off when the hero can't pay. Add slot sits under the chosen chain's cards ("Slots 1/5", "+ Add slot · 🔗 1 · ⚙ 20"; unarmed, the slots read the base), is off without the Links or the scrap, and waits while that chain has a pending change (it adds to the saved chain), its reason shown beside it. The **+** card copies the chosen move in the allowed elements (its own where they're in the pair, else the pair's first), so it never adds an off-pair set. An off-pair move shows "off-pair" on its card (and in its accessible name) and "· off-pair" on its element chip, with a note ("Storm off-pair: no attunement. Keep it, or pick from your two elements."); the other moves don't offer its element, and a chip that would give the move a new off-pair set is off. A skill the weapon doesn't carry shows 🔒 and "Locked" on its tab, and `carriedByText` in place of its chain. Unarmed, the builder is read-only ("Equip a weapon to build your moves."). The Training Grounds' builder stays instant and free.
- **The weapon's sheet (Task 15).** Its moveset lists each chain it carries ("Primary 2/5 · light Fire Bolt · …") and the others ("Defensive: carried by magic weapons and better"). A bag weapon, while armed, is valued twice, each row with its own delta: "As it is" (what Equip does, and its ▲) and "With your moveset · ⚙ N to move it"; the bag's tiles mark it by the home value (`compareItem`'s default). **Transfer my moveset here · ⚙ N** (with "+1 Link" or "+N Links" when some come back; green with a ▲ when the home value is an upgrade) runs `transferMoveset`; it never asks to bind an off-pair weapon (only Equip does). The equipped weapon's sheet links to the builder ("Build its moves in the chain builder ›", at the Anvil). The data gives no legendary a skill, so the sheet keeps the two the spec names (`nightstalker`: the Defensive; `rimeheart`: the Ultimate): when the equipped weapon lacks it, the sheet says "Needs a Defensive: your weapon doesn't carry one." (Rimeheart's Frost damage still counts, so the text says no more).
- **The gear lock in the client (Task 13).** Mid-dive the item sheet's Equip, Unequip (and, from Task 15, Transfer) give way to an "Equip at the Anvil" panel, and its Upgrade, Reforge and Salvage to "Forge and salvage at the Anvil"; the bag's Equip best (the Anvil, mid-dive) reads "Equip between dives" and its Salvage junk "Salvage between dives", both off; the Forge tab reads "A dive is under way: forge and salvage between dives."; the loot tray and the arena's pickup feed say "▲ N to equip at the Anvil" in place of their Equip buttons, counting every upgrade, weapons included. Equip best and the tray's Equip upgrades (after a dive) count non-weapon gear only (`equipBest` leaves weapons alone). The sheet can no longer equip mid-dive, so the bind prompt only ever shows at the Anvil, and its mid-dive toast goes. The engine's lock (Task 8) covers the forge and salvage as the spec's dive-lock line says; a stop's upgrade lifts it for its one op.
- **The stops in the client (Task 16).** The door screen shows the stop above the doors: "A power-up: take one, or skip it", the offered kinds as cards in `STOP_KINDS` order. A card opens its picker as a sheet (`data-pad-scope`; Back is `data-pad-back`): the sheet is a portal to `document.body`, so it covers the screen however the door list is scrolled and sits above the loot tray. Equip lists the bag's items (each marked by its as-is value; with a weapon among them, "A weapon brings its own moves; yours stay on <your weapon>."; an empty bag says so); Add a slot lists the carried chains with their price, off when unaffordable; Adjust a move is the chain builder with a fixed shape (no reorder, add, remove, payment, attunement or reactions; a skill the weapon doesn't carry shows `carriedByText`; changing a second move drops the first), its button "Change Primary's move 1 · ✦ 5"; Upgrade lists worn and bag items with their price, dimmed when unaffordable (taking one anyway shows the engine's "Not enough scrap"). Taking one toasts "<Kind>: done" and closes the picker; the stop then reads "Power-up taken. On to the next depth." A refusal shows in the picker and leaves the stop open. Skipping is taking a door. While the stop offers an equip, the loot tray's note reads "▲ N to equip at this stop, or at the Anvil".
- **Absent skills in the client (Task 13).** The HUD snapshot keeps a null entry for a skill the weapon doesn't carry (its slot keeps its place) and the skill bar draws no button for it; the aim marker and the pad's press of it do nothing.
- **Links in the client (Task 15).** One is "1 Link", everywhere. The header ("🔗 3 Links", beside the scrap), the dive summary ("🔗 2 Links from salvaged weapons"), the bag's Salvage junk toast ("· +2 Links"), the sheet's salvage ("+2 Links from its extra slots"), a fuse ("+1 Link from the weapons' extra slots") and a transfer ("Your moveset moved onto … · +1 Link"). The Anvil's how-to text says the weapon carries the chains, Links buy slots, and loot is equipped at the Anvil.
- **Migration toasts.** `movesetNotices(dropped, reset, links)` (`links`: the loaded profile's, all from the migration): "Your chains live on your weapon now, and yours can't carry your Defensive and Ultimate: they went", ending ", and their 3 extra moves came back as 3 Links" only when some did (one: "its 1 extra move came back as 1 Link"), and for an unarmed reset "Your chains live on your weapon now: with no weapon equipped, yours were reset to the defaults"; they come after the bind hint and before the fix notices.
- **The Training Grounds' Load my build** takes `{ ...the sandbox's chains, ...heroChains(the save) }`.
- **Client task order.** Task 13 rebuilds the engine's bundle and makes the client whole against it in one commit (the typecheck sees every reader at once): the store, every reader, the arena, the gear lock and the bind texts, with the builder applying each change as it is made; Task 14 turns that into the draft. Task 13 spans three chunks (the bundle and most tests; the last tests, the store, the readers and the arena; the builder and the gear lock), and Task 14 two (its tests, then its sources). Tasks 15 and 16 add the sheet and Links, then the stops.
- **Tests the spec didn't list.** The data (the balance numbers and their schema, which also keeps `carries` growing with rarity, since the locked tab says "…and better"), a drop's moveset always being its default moves, and the fixture helpers `chainsOf`, `withChains` and `asV5` (tests read and give a hero's chains through them).

---

**Conventions:**
- Windows 11. The Bash tool runs POSIX sh; PowerShell is also available (use it for process management).
- Branch `claude/alloy-loot-gear-system-6upsy5` (already checked out). **One commit per task** (Task 12 makes one docs commit; Task 18 makes two, the docs and the version). Every commit message ends with a blank line and the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; the commit blocks below pass it as the last `-m`.
- Stage files by path. Never `git add -A` or `git add .` at the repo root: three unrelated untracked plan docs (`docs/superpowers/plans/2026-05-01-*.md`) exist and must stay out.
- **Don't push**: the controller pushes after a final review. Never open a PR.
- **Run every command from the repo root.** The shell's working directory persists between commands, so every command line below runs in a subshell (`(cd packages/engine && npx vitest run …)`), and every commit block starts with `cd /c/Projects/Alloy`.
- **Prettier:** the commit blocks format only files a task creates, or files that pass `npx prettier --check` before the edit (the repo's own Prettier, 3.8.1). Of the files this plan touches, these are not clean at HEAD and are **never formatted**, only hand-edited: `packages/engine/src/data/balance.json` (hand-laid-out JSON), `packages/engine/tests/delve-pacing.test.ts`, `packages/engine/src/delve/profile-schema.ts`, `packages/engine/src/delve/dive.ts`, `packages/engine/src/delve/autopilot.ts`, `packages/engine/src/loot/item-generator.ts`, `packages/client/src/features/delve/BagPanel.tsx`, `ForgePanel.tsx` and `LootTray.tsx` (CRLF in the working tree, which Prettier rewrites), `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx`, `CLAUDE.md` and the specs; nor is the new `packages/engine/tests/fixtures/delve-v5-saves.json` (one save a line, as generated). Every other file edited here passed `npx prettier --check` at HEAD; never commit a whole-file reformat. The code below is already Prettier-formatted (checked on the scratch copy), so the commit blocks' `--write` changes nothing if you typed it as written.
- **Line endings:** in the working tree, `packages/engine/src/delve/profile-schema.ts`, `dive.ts`, `autopilot.ts`, `packages/engine/tests/delve-pacing.test.ts`, `packages/engine/src/loot/item-generator.ts`, `packages/client/src/features/delve/BagPanel.tsx`, `ForgePanel.tsx`, `LootTray.tsx`, `CLAUDE.md` and the specs `2026-09-27-delve-elemental-affinity-design.md` and `2026-09-29-delve-moves-and-chains-design.md` are CRLF (git stores them LF: `core.autocrlf` is on); every other file here is LF. Keep each file's endings (the Edit tool does; don't rewrite a file with a script that normalises them).
- **One stray byte.** Line 160 of `packages/engine/tests/delve-chain-feel.test.ts` holds a raw Latin-1 `×` (`0xD7`). This plan never edits that file; if an editor rewrites it, put the byte back: `node -e "const f='packages/engine/tests/delve-chain-feel.test.ts',fs=require('fs'),b=fs.readFileSync(f),i=b.indexOf(Buffer.from([0xef,0xbf,0xbd]));if(i>=0)fs.writeFileSync(f,Buffer.concat([b.subarray(0,i),Buffer.from([0xd7]),b.subarray(i+3)]))"`.
- **How the edits read.** "Replace: A with: B" is one Edit (old A, new B). "Replace the lines from `A` up to (not including) `B` with: C" is one Edit whose old text runs from the start of the line that reads `A` (ignoring its indentation) to the end of the line before the one that reads `B`, and whose new text is C (a blank line at C's end stays); "…to the end of the file" runs to the file's last line (which keeps its final newline); "Delete the lines from `A` up to (not including) `B`." removes them. Each `A` and `B` is the only line in the file that reads so, at that point. "Append at the end of the file:" adds a blank line and the block after the last line. "Create `f`:" is a Write. Every anchor is unique in its file at that point, in the order given, so apply each file's edits top to bottom (the scratch copy checked, by applying every edit of this plan in order to HEAD, that each task gives exactly the tested files).
- **Import cycles.** `delve/profile.ts`, `pair.ts`, `dive.ts`, `hero-stats.ts` and the new `delve/moveset.ts` and `delve/stops.ts` import each other: only ever read such an import inside a function (they keep to function declarations). `loot/moveset.ts` imports nothing from `delve/`.
- Engine `tsc` covers `src` only (Vitest doesn't type-check, so a test reading a field that no longer exists passes vacuously: this plan updates every such read).
- **The client follows the bundle.** The client consumes the engine's bundle (`packages/engine/dist`), which Tasks 1–12 never rebuild (so the client stays green through them; Task 12 builds a measuring copy into `packages/engine/node_modules/.movesets-measure`, ignored by git and next to `zod`, and deletes it). Task 13 rebuilds it: against the new bundle the client fails its typecheck (62 errors in 24 files) and 40 of its tests until Task 13's commit makes it whole. Vitest doesn't type-check, so every client task runs the typecheck too.
- **Every engine task runs the whole suite** (about 20 s; the pacing rails run while the files load); every client task the whole client suite (about 25 s) and its typecheck.
- Engine test geometry: the fixture arena's hero starts at (13, 36) facing up; `dummy(x, y)` is a sturdy foe (1e6 life) that doesn't fight back; the fixture's starting weapon is a common Fire sword; its chains are one medium move each (a Fire Bolt, a Frost Ward, a charged Fire Nova), or exactly `ArenaOpts.chains` when given (Task 2).

**Commands:**

| What | Command (from repo root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| The measuring build (Task 12) | `(cd packages/engine && npx tsup --out-dir node_modules/.movesets-measure)` |
| Engine build (the client's bundle) | `(cd packages/engine && pnpm build)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client tests | `(cd packages/client && npx vitest run)`, or some files: `(cd packages/client && npx vitest run <paths>)` |
| Client build | `(pnpm -F @alloy/client build)` |
| E2E | `(cd packages/client && npx playwright test -c playwright.scratch.config.ts <specs>)` (to pick devices use `--project=desktop` with the `=`: a bare `--project desktop` swallows the spec path) |

**Dev server on 5288** (Tasks 17 and 18; PowerShell: stops whatever owns the port, starts a detached Vite, waits for a 200 and prints `True`):

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5288 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\Alloy\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5288 --strictPort --force --host'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5288').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

**E2E scratch config**, `packages/client/playwright.scratch.config.ts` (create it for the E2E, delete it after, never commit it; it reuses the 5288 server instead of Playwright's own on 5199):

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

A timeout under load that passes on a rerun (`-g <test> --repeat-each 2`) is flakiness. A consistent failure is a regression: debug it with logging and the page's state, not guesses or longer timeouts.

**The measurement's files** live in the plan author's scratchpad, `C:\Users\hahnz\AppData\Local\Temp\claude\c--Projects-Alloy\239f61fd-0a16-4600-a17d-7efef362f2cc\scratchpad\movesets-before` (called `<before>` below; in the Bash tool, `/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/movesets-before`). They were made from the engine at HEAD (v0.48.0) and must not be regenerated after Task 1 starts: `before-depth10.json` (the DPS Lab grid), `pacing-before.txt` and `first-dives-before.txt`, with the scripts `snapshot.mjs`, `identical.mjs`, `pacing.mjs`, `first-dives.mjs`, `stop-trace.mjs`, `items-hash.mjs` and `v5-saves.mjs` (which made Task 5's fixture). The folder also holds the plan author's own after-files; Task 12 overwrites them with yours. The scripts' texts are in Task 12, in case the folder is gone; Task 1 checks the before files and remakes them from HEAD if they are missing.

## File map

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/data/balance.json` | `delve.movesets` (hand-edit, never format) |
| `src/data/schemas.ts` | `movesets`' schema |
| `src/types/delve.ts` | `DelveBalance.movesets`; `DelveProfile` version 6: `links`, no `chains` or `chainCaps`; `DiveState.linksEarned`; `StopKind`, `DiveStop`, `DiveState.stop` |
| `src/types/gear.ts` | `Moveset`, `GearItem.moveset?` |
| `src/types/arpg.ts` | `HeroEntity.chains: (ResolvedChain \| null)[]` |
| `src/loot/moveset.ts` (new) | carried chains, base slots, default moves, `rollMoveset`, `extraSlots`, `movesetOf`, `heroChains`, `carriedByText`, `movesetTransfer` |
| `src/loot/item-generator.ts` | a weapon drop's moveset, rolled last (CRLF, never format) |
| `src/delve/profile-schema.ts` | `MovesetSchema` on `GearItemSchema`, `DiveSchema.linksEarned` and `stop`, a frozen `DelveProfileV5Schema`, version 6 (CRLF, never format) |
| `src/delve/profile.ts` | version 6: create, `withMoveset`, the migration (`fromV5`, `fitMovesets`), `ParsedDelveProfile.dropped`/`movesetReset`, Links from salvage and fusing, the dive lock on `equipItem`/`unequipSlot`/`equipBest` and the forge and salvage (`upgradeGear`, `reforgeGear`, `fuseGear`, `salvageItems`), `equipBest` without weapons; `setChain` moves out |
| `src/delve/moveset.ts` (new) | `movesetEditPrice`, `editPrice`, `setChains`, `setChain`, `slotPrice`, `addSlot`, `transferMoveset` |
| `src/delve/pair.ts` | `profileStats` from `heroChains`; `fixChainsToPair(registry, …)` on the equipped weapon; `chooseStartingMana` rebuilds the weapon; bind, overtake and realign stop following the basic chain; `followBasicTo` goes |
| `src/delve/hero-stats.ts` | `estimateCombat` with absent skills; `compareItem`/`heroPower` without `chains`, a weapon valued as a home (`WeaponValue`) |
| `src/delve/dive.ts` | `beginFloor` from `heroChains`; `linksEarned`; `BankResult.links`; `completeFloor` rolls the stop, `chooseDoor` ends it (CRLF, never format) |
| `src/delve/stops.ts` (new) | `STOP_KINDS`, `stopKinds`, `rollStop`, `takeStop` |
| `src/delve/autopilot.ts` | no mid-floor equipping; transfers, Links on slots; the fused Primary built last and paid for; `takeBestStop` (CRLF, never format) |
| `src/arpg/world.ts`, `abilities/cast.ts`, `abilities/defend.ts`, `step.ts`, `sandbox.ts`, `combat.ts`, `action.ts`, `bot.ts`, `dps-sim.ts` | null chains |
| `src/index.ts` | the new exports |
| `tests/delve-movesets.test.ts` (new) | the spec's engine tests |
| `tests/delve-stops.test.ts` (new) | the stops' tests, and the autopilot's |
| `tests/fixtures/arena.ts` | `ArenaOpts.chains`; `asV5`, `chainsOf`, `withChains` |
| `tests/fixtures/delve-v5-saves.json` (new) | five real version 5 saves from the v0.48.0 engine |
| `tests/{delve-pair,delve-chains,delve-dive,delve-profile-abilities,delve-reactions}.test.ts` | updated to the new rules |
| `tests/delve-pacing.test.ts` | the first-dive rail: mean 3 to 12 (Task 8; CRLF, never format) |

**Client (`packages/client/`)**

| File | Change |
|---|---|
| `src/stores/delveStore.ts` | `setChains`, `addSlot`, `transfer`, `takeStop` (results); `salvage` reports Links; `movesetNotices`; the builder's draft (`chainDraft`, `draftChanges`, `editDraft`, `applyDraft`, `revertDraft`) |
| `src/stores/sandboxStore.ts` | Load my build: the weapon's chains over the sandbox's |
| `src/features/delve/AbilitiesPanel.tsx` | the builder on the weapon's moveset: the draft, its price, Apply and Revert, slots and Add slot |
| `src/features/delve/chains/ChainEditor.tsx` | absent skills (locked tabs), `lockedText`, `absentText`, `footer`, `fixedShape`, off-pair cards, the + copy in the pair |
| `src/features/delve/chains/MoveEditor.tsx` | off-pair element chips and note |
| `src/features/delve/ItemDetailSheet.tsx` | the moveset, both valuations, Transfer, dead legendaries, the builder link, Links; the gear lock |
| `src/features/delve/StopPanel.tsx` (new), `DoorChoice.tsx` | the stop's cards and pickers on the door screen |
| `src/features/delve/BagPanel.tsx`, `LootTray.tsx`, `arena/PickupFeed.tsx` | `compareItem`'s new arguments; Equip best for non-weapons and locked mid-dive, Salvage junk too; the stop's note in the tray; Links in the salvage toast (CRLF: the first two) |
| `src/features/delve/ManaPanel.tsx`, `BindPrompt.tsx` | the bind texts; no default-basic branch |
| `src/features/delve/PaperDoll.tsx`, `src/pages/DelveCamp.tsx`, `arena/useArena.ts`, `arena/useArenaCore.ts` | stats and chains from `heroChains`; the header's Links, the how-to, the builder link, the unapplied changes |
| `src/features/delve/arena/ArenaHud.tsx`, `input.ts`, `fx/anticipation.ts`, `fx/draw-world.ts`, `src/features/gamepad/arena-pad.ts` | null chains |
| `src/features/delve/DiveSummary.tsx`, `ForgePanel.tsx` | Links; the Forge tab locked mid-dive (CRLF: `ForgePanel.tsx`) |
| `src/features/delve/training/TrainingPanel.tsx` | Load my build's text |
| tests: `src/stores/{delveStore,sandboxStore}.test.ts`, `src/pages/__tests__/DelveCamp.test.tsx`, `src/features/delve/__tests__/{AbilitiesPanel,ArenaHud,DiveSummary,ItemDetailSheet,ManaPanel,TrainingPanel}.test.tsx`, `{arena-hud-snapshot,arena-input}.test.ts`; `LootTray.test.tsx` (new), `StopPanel.test.tsx` (new) | the new rules |
| `e2e/delve.spec.ts`, `e2e/delve-gamepad.spec.ts` | absent buttons, equipping at the Anvil, the stop, the draft, the weapon's moveset in the save |
| `package.json` | version 0.49.0 |

**Docs:** the spec's status line (Task 12); `CLAUDE.md`, the superseded notes in the loot, affinity and chains specs, and the spec's `takeStop` line (Task 18).

---

## Chunk 1: Engine: weapons carry movesets

### Task 1: Movesets' data, types, defaults and a drop's extra slots

Data, types and the pure moveset module; a weapon drop rolls its moveset last. Nothing reads a weapon's moveset yet: the hero's chains still live on the profile.

**Files:**
- Create: `packages/engine/src/loot/moveset.ts`
- Create: `packages/engine/tests/delve-movesets.test.ts`
- Modify: `packages/engine/src/data/balance.json:180` (after `delve.chains`; hand-edit, never format)
- Modify: `packages/engine/src/data/schemas.ts:926` (after `chains`' schema)
- Modify: `packages/engine/src/types/delve.ts:531,552` (`chains.cap`'s comment, `movesets`)
- Modify: `packages/engine/src/types/gear.ts:1,119` (`Moveset`, `GearItem.moveset`)
- Modify: `packages/engine/src/delve/profile-schema.ts:8,75,94` (`MovesetSchema`; CRLF, never format)
- Modify: `packages/engine/src/loot/item-generator.ts:8,205` (the roll; CRLF, never format)

- [ ] **Step 1: Check the measurement's "before" files**

Task 12 compares against the engine at HEAD, which exists only until this task's edits.

Run: `(ls /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/movesets-before)`
Expected, among others: `before-depth10.json`, `first-dives-before.txt`, `pacing-before.txt`, `first-dives.mjs`, `identical.mjs`, `items-hash.mjs`, `pacing.mjs`, `snapshot.mjs`, `v5-saves.mjs`.

If any of the three before files is missing, make them now from HEAD (first write any missing script from the texts in Task 12): `(cd packages/engine && npx tsup --out-dir node_modules/.movesets-measure)`, then from `<before>`, with `M=C:/Projects/Alloy/packages/engine/node_modules/.movesets-measure/index.js`: `node snapshot.mjs $M before-depth10.json` (prints `runs 9144 …`, about 10 s), `node pacing.mjs $M > pacing-before.txt` (about a minute) and `node first-dives.mjs $M > first-dives-before.txt`; then `(rm -rf packages/engine/node_modules/.movesets-measure)`. `pacing-before.txt` must read as the "Before" column of the header's table (Task 10 prints it).

- [ ] **Step 2: Write the failing tests**

The spec's engine tests get their own file; later tasks add to it. The determinism test hashes v0.48.0's items (the scratchpad's `items-hash.mjs` made the hash from the HEAD engine).

Create `packages/engine/tests/delve-movesets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { rollEncounterDrops } from '../src/loot/drops.js';
import {
  baseSlots,
  carriedFrom,
  carriedSkills,
  defaultChain,
  defaultMoveset,
  extraSlots,
} from '../src/loot/moveset.js';
import { GearItemSchema } from '../src/delve/profile-schema.js';
import { CHAIN_SKILLS, type Blow, type Chain } from '../src/types/ability.js';
import type { GearItem, Rarity } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import { bal, registry } from './fixtures/arena.js';

// See the weapon movesets spec.

const weapon = (rarity: Rarity, seed: number, baseId?: string): GearItem =>
  generateItem(
    registry,
    { uid: `w${seed}`, ilvl: 5, rarity, slot: 'weapon', baseId, mana: 'storm' },
    new SeededRNG(seed),
  );

describe('data: movesets', () => {
  it('loads the chains each rarity carries, the extra slots and the prices', () => {
    const m = bal.movesets;
    expect(m.carries.common).toEqual(['basic', 'primary']);
    expect(m.carries.uncommon).toEqual(['basic', 'primary']);
    expect(m.carries.magic).toEqual(['basic', 'primary', 'defensive']);
    expect(m.carries.rare).toEqual(['basic', 'primary', 'defensive']);
    expect(m.carries.epic).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    expect(m.carries.legendary).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    expect(m.extraSlots).toEqual({
      common: [0, 0],
      uncommon: [0, 0],
      magic: [0, 1],
      rare: [1, 2],
      epic: [2, 3],
      legendary: [3, 4],
    });
    expect(m.slotLinks).toEqual([1, 2, 3, 4]);
    expect(m.slotScrap).toEqual([20, 40, 60, 80]);
    expect([m.editDust, m.elementDust, m.transferScrap]).toEqual([5, 15, 30]);
    expect(bal.chains.cap).toEqual({ basic: 5, primary: 5, defensive: 5, ultimate: 5 });
  });

  it('refuses a rarity that carries no basic chain or less than the rarity below, or extra slots that fall', () => {
    const withMovesets = (movesets: object) => ({
      ...balanceData,
      delve: { ...balanceData.delve, movesets: { ...balanceData.delve.movesets, ...movesets } },
    });
    const carries = { ...balanceData.delve.movesets.carries, common: ['primary'] };
    expect(BalanceConfigSchema.safeParse(withMovesets({ carries })).success).toBe(false);
    const shrinks = { ...balanceData.delve.movesets.carries, rare: ['basic', 'primary'] };
    expect(BalanceConfigSchema.safeParse(withMovesets({ carries: shrinks })).success).toBe(false);
    const extraSlots = { ...balanceData.delve.movesets.extraSlots, rare: [2, 1] };
    expect(BalanceConfigSchema.safeParse(withMovesets({ extraSlots })).success).toBe(false);
    expect(BalanceConfigSchema.safeParse(balanceData).success).toBe(true);
  });
});

describe('base slots and carried chains', () => {
  it("gives the basic chain its weapon's string length (unarmed, the hero's), every other chain 1", () => {
    expect(baseSlots(registry, 'sword', 'basic')).toBe(3);
    expect(baseSlots(registry, 'maul', 'basic')).toBe(2);
    expect(baseSlots(registry, 'dagger', 'basic')).toBe(4);
    expect(baseSlots(registry, null, 'basic')).toBe(3);
    for (const skill of ['primary', 'defensive', 'ultimate'] as const) {
      expect(baseSlots(registry, 'sword', skill)).toBe(1);
      expect(baseSlots(registry, null, skill)).toBe(1);
    }
  });

  it('carries chains by rarity; unarmed carries the basic chain and the Primary', () => {
    for (const r of RARITY_ORDER)
      expect(carriedSkills(registry, r)).toEqual(bal.movesets.carries[r]);
    expect(carriedSkills(registry, null)).toEqual(['basic', 'primary']);
    expect(carriedFrom(registry, 'basic')).toBeNull();
    expect(carriedFrom(registry, 'primary')).toBeNull();
    expect(carriedFrom(registry, 'defensive')).toBe('magic');
    expect(carriedFrom(registry, 'ultimate')).toBe('epic');
  });
});

describe('default moves', () => {
  it("fills a moveset at its base slots: the weapon's string, and each slot's default form's first move", () => {
    const m = defaultMoveset(registry, { baseId: 'sword', rarity: 'common' }, 'frost');
    expect(m.slots).toEqual({ basic: 3, primary: 1 });
    expect(m.chains).toEqual({
      basic: [
        { kind: 'light', element: 'frost' },
        { kind: 'light', element: 'frost' },
        { kind: 'heavy', element: 'frost' },
      ],
      primary: { moves: [{ kind: 'light', form: 'bolt', elements: ['frost'] }], payment: 'mana' },
    });
    const epic = defaultMoveset(registry, { baseId: 'maul', rarity: 'epic' }, 'fire');
    expect(epic.slots).toEqual({ basic: 2, primary: 1, defensive: 1, ultimate: 1 });
    expect(epic.chains.defensive).toEqual({
      moves: [{ kind: 'medium', form: 'ward', elements: ['fire'] }],
      payment: 'mana',
    });
    expect(epic.chains.ultimate).toEqual({
      moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }],
      payment: 'charge',
    });
  });

  it('plays the default chain in order, then medium past its end', () => {
    const kinds = (c: Chain) => c.moves.map((m) => m.kind);
    expect(kinds(defaultChain(registry, 'primary', 'sword', 'fire', 5))).toEqual([
      'light',
      'medium',
      'medium',
      'heavy',
      'medium',
    ]);
    expect(kinds(defaultChain(registry, 'ultimate', 'sword', 'fire', 2))).toEqual([
      'medium',
      'medium',
    ]);
    const blows = (b: Blow[]) => b.map((x) => x.kind);
    expect(blows(defaultChain(registry, 'basic', 'maul', 'fire', 4))).toEqual([
      'medium',
      'heavy',
      'medium',
      'medium',
    ]);
  });

  it('gives unarmed its default moveset in the element asked for', () => {
    const m = defaultMoveset(registry, { baseId: null, rarity: null }, 'nature');
    expect(m.slots).toEqual({ basic: 3, primary: 1 });
    expect(m.chains.basic).toEqual(
      bal.hero.defaultChain.map((kind) => ({ kind, element: 'nature' })),
    );
  });
});

describe('drops: extra slots by rarity', () => {
  const EXTRA: Record<Rarity, [number, number]> = {
    common: [0, 0],
    uncommon: [0, 0],
    magic: [0, 1],
    rare: [1, 2],
    epic: [2, 3],
    legendary: [3, 4],
  };

  it("rolls the rarity's extra slots over the chains it carries, every slot a default move in its mana", () => {
    for (const rarity of RARITY_ORDER) {
      const seen = new Set<number>();
      for (let seed = 1; seed <= 60; seed++) {
        const w = weapon(rarity, seed);
        const m = w.moveset!;
        expect(Object.keys(m.chains).sort()).toEqual([...bal.movesets.carries[rarity]].sort());
        expect(Object.keys(m.slots).sort()).toEqual([...bal.movesets.carries[rarity]].sort());
        const extra = extraSlots(registry, w);
        seen.add(extra);
        expect(m).toEqual(defaultMoveset(registry, w, 'storm', m.slots));
        for (const skill of CHAIN_SKILLS) expect(m.slots[skill] ?? 0).toBeLessThanOrEqual(5);
      }
      expect(Math.min(...seen)).toBe(EXTRA[rarity][0]);
      expect(Math.max(...seen)).toBe(EXTRA[rarity][1]);
    }
  });

  it('spreads extra slots over every chain a weapon carries', () => {
    const got = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const w = weapon('rare', seed);
      for (const skill of CHAIN_SKILLS)
        if ((w.moveset!.slots[skill] ?? 0) > baseSlots(registry, w.baseId, skill)) got.add(skill);
    }
    expect([...got].sort()).toEqual(['basic', 'defensive', 'primary']);
  });

  it('never grows a chain past 5: a dagger basic string of 4 takes at most one extra', () => {
    for (let seed = 1; seed <= 60; seed++)
      expect(weapon('legendary', seed, 'dagger').moveset!.slots.basic).toBeLessThanOrEqual(5);
  });

  it('gives no moveset to gear other than weapons', () => {
    const chest = generateItem(
      registry,
      { uid: 'c', ilvl: 5, rarity: 'legendary', slot: 'chest' },
      new SeededRNG(3),
    );
    expect(chest.moveset).toBeUndefined();
    expect(extraSlots(registry, chest)).toBe(0);
  });
});

describe('determinism', () => {
  it('rolls the same moveset from the same seed', () => {
    expect(weapon('epic', 9).moveset).toEqual(weapon('epic', 9).moveset);
  });

  it('leaves every other item stat, and every later drop, as v0.48.0 rolled them', () => {
    const items: GearItem[] = [];
    for (let seed = 1; seed <= 30; seed++)
      for (const rarity of RARITY_ORDER)
        items.push(
          generateItem(
            registry,
            { uid: `g${seed}`, ilvl: seed, rarity, biomeMana: 'frost', pair: ['fire', 'storm'] },
            new SeededRNG(seed),
          ),
        );
    const rng = new SeededRNG(7);
    let ctx = {
      depth: 5,
      kind: 'boss' as const,
      magicFind: 40,
      pity: 0,
      dropMult: 1,
      legendaryBoost: 1,
      forceLegendary: true,
      nextUid: 1,
      biomeMana: 'earth' as const,
      pair: ['fire' as const],
    };
    for (let i = 0; i < 40; i++) {
      const kind = i % 3 ? ('elite' as const) : ('boss' as const);
      const r = rollEncounterDrops(registry, { ...ctx, kind, forceLegendary: i === 0 }, rng);
      items.push(...r.items);
      ctx = { ...ctx, pity: r.pity, nextUid: r.nextUid };
    }
    const strip = items.map(({ moveset: _m, ...rest }) => rest);
    let h = 0x811c9dc5;
    for (const c of JSON.stringify(strip)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    // v0.48.0's 291 items, hashed the same way (the plan's scratchpad `items-hash.mjs`).
    expect([items.length, h.toString(16)]).toEqual([291, '49e20fb6']);
  });
});

describe('save schema: a weapon moveset', () => {
  const sword = weapon('common', 1, 'sword');

  it('reads an item with a moveset, and one without (a version 5 save)', () => {
    expect(GearItemSchema.safeParse(sword).success).toBe(true);
    const { moveset: _m, ...old } = sword;
    expect(GearItemSchema.safeParse(old).success).toBe(true);
  });

  it('refuses a chain longer than its slots, a chain without slots, and slots without a chain', () => {
    const m = sword.moveset!;
    const bad = (moveset: object) => GearItemSchema.safeParse({ ...sword, moveset }).success;
    expect(bad({ ...m, slots: { ...m.slots, basic: 2 } })).toBe(false);
    expect(bad({ ...m, slots: { basic: 3 } })).toBe(false);
    expect(bad({ ...m, slots: { ...m.slots, defensive: 1 } })).toBe(false);
    expect(bad({ ...m, slots: { ...m.slots, primary: 5 } })).toBe(true);
  });
});
```


- [ ] **Step 3: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts)`
Expected: FAIL, no tests run: `Error: Cannot find module '../src/loot/moveset.js' imported from '…/tests/delve-movesets.test.ts'`.

- [ ] **Step 4: The data, the types and the moveset module**

In `packages/engine/src/data/balance.json`:

Replace:

```json
    },
    "dodge": {
```

with:

```json
    },
    "movesets": {
      "carries": {
        "common": ["basic", "primary"], "uncommon": ["basic", "primary"],
        "magic": ["basic", "primary", "defensive"], "rare": ["basic", "primary", "defensive"],
        "epic": ["basic", "primary", "defensive", "ultimate"], "legendary": ["basic", "primary", "defensive", "ultimate"]
      },
      "extraSlots": { "common": [0, 0], "uncommon": [0, 0], "magic": [0, 1], "rare": [1, 2], "epic": [2, 3], "legendary": [3, 4] },
      "slotLinks": [1, 2, 3, 4], "slotScrap": [20, 40, 60, 80],
      "editDust": 5, "elementDust": 15, "transferScrap": 30
    },
    "dodge": {
```

In `packages/engine/src/data/schemas.ts`:

Replace:

```ts
    .refine((c) => c.holdMax >= c.holdTime, 'holdMax must be at least holdTime'),
  dodge: z
```

with:

```ts
    .refine((c) => c.holdMax >= c.holdTime, 'holdMax must be at least holdTime'),
  movesets: z.object({
    // Every weapon swings a basic chain; each skill once.
    carries: perRarity(
      z
        .array(z.enum(['basic', 'primary', 'defensive', 'ultimate']))
        .refine((s) => s.includes('basic'), 'every weapon carries basic')
        .refine((s) => new Set(s).size === s.length, 'each skill once'),
    ).refine(
      (c) =>
        (['uncommon', 'magic', 'rare', 'epic', 'legendary'] as const).every((r, i) => {
          const lower = c[(['common', 'uncommon', 'magic', 'rare', 'epic'] as const)[i]];
          return lower.every((s) => c[r].includes(s));
        }),
      'a rarity carries every chain the rarity below it does',
    ),
    extraSlots: perRarity(
      z
        .tuple([z.number().int().min(0), z.number().int().min(0)])
        .refine(([lo, hi]) => lo <= hi, 'least before most'),
    ),
    // By the new slot's position: the 2nd slot's price first, the last slot's last.
    slotLinks: z.array(z.number().int().min(0)).length(MAX_CHAIN - 1),
    slotScrap: z.array(z.number().int().min(0)).length(MAX_CHAIN - 1),
    editDust: z.number().int().min(0),
    elementDust: z.number().int().min(0),
    transferScrap: z.number().int().min(0),
  }),
  dodge: z
```

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
    /** Most moves each skill's chain holds, a profile's caps to start with (at most `MAX_CHAIN`). */
    cap: Record<ChainSkill, number>;
```

with:

```ts
    /** Most slots each skill's chain can grow to on a weapon (at most `MAX_CHAIN`). */
    cap: Record<ChainSkill, number>;
```

Replace:

```ts
    beatSlot: Record<AbilitySlot, number>;
  };
```

with:

```ts
    beatSlot: Record<AbilitySlot, number>;
  };
  /** Weapon movesets: which chains a weapon carries, its slots and their prices (see the weapon movesets spec). */
  movesets: {
    /** The chains a weapon of each rarity carries (unarmed: basic and primary). */
    carries: Record<Rarity, ChainSkill[]>;
    /** Extra slots a weapon drop rolls, least and most, by rarity. */
    extraSlots: Record<Rarity, [number, number]>;
    /** Links a new slot costs, by its position: the 2nd slot's first. */
    slotLinks: number[];
    /** Scrap a new slot costs, by its position as `slotLinks`. */
    slotScrap: number[];
    /** Mana Dust a changed, moved, added or removed move costs, or a changed payment. */
    editDust: number;
    /** Mana Dust a move's changed elements cost, or a new move's elements that no old move has. */
    elementDust: number;
    /** Scrap a transfer costs for each extra slot that moves. */
    transferScrap: number;
  };
```

In `packages/engine/src/types/gear.ts`:

Replace:

```ts
import type { GemRarity } from './gem.js';
```

with:

```ts
import type { Chains, ChainSkill } from './ability.js';
import type { GemRarity } from './gem.js';
```

Replace:

```ts
  locked: boolean;
}
```

with:

```ts
  locked: boolean;
  /** Weapons: the chains the weapon carries and their slots (see the weapon movesets spec). */
  moveset?: Moveset;
}

/**
 * A weapon's moveset: a chain for each skill its rarity carries, each holding
 * 1 to `slots[skill]` moves; a skill it doesn't carry has neither.
 */
export interface Moveset {
  chains: Partial<Chains>;
  slots: Partial<Record<ChainSkill, number>>;
}
```

In `packages/engine/src/delve/profile-schema.ts`:

Replace:

```ts
import { MAX_CHAIN, type AbilitySlot, type FormId } from '../types/ability.js';

```

with:

```ts
import { CHAIN_SKILLS, MAX_CHAIN, type AbilitySlot, type FormId } from '../types/ability.js';

```

Replace:

```ts

const RaritySchema = z.enum(['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary']);
```

with:

```ts

/** A weapon's moveset: a chain for each skill it carries, each within its skill's slots. */
export const MovesetSchema = z
  .object({
    chains: z.object({
      basic: z.array(BlowSchema).min(1).max(MAX_CHAIN).optional(),
      primary: slotChain('primary').optional(),
      defensive: slotChain('defensive').optional(),
      ultimate: slotChain('ultimate').optional(),
    }),
    slots: z.object({
      basic: CapSchema.optional(),
      primary: CapSchema.optional(),
      defensive: CapSchema.optional(),
      ultimate: CapSchema.optional(),
    }),
  })
  .refine(
    ({ chains, slots }) =>
      CHAIN_SKILLS.every((skill) => {
        const moves = skill === 'basic' ? chains.basic?.length : chains[skill]?.moves.length;
        const n = slots[skill];
        return moves === undefined ? n === undefined : n !== undefined && moves <= n;
      }),
    'each chain has its slots and fits them',
  );

const RaritySchema = z.enum(['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary']);
```

Replace:

```ts
  locked: z.boolean(),
});
```

with:

```ts
  locked: z.boolean(),
  moveset: MovesetSchema.optional(),
});
```

Create `packages/engine/src/loot/moveset.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type {
  AbilityPayment,
  AbilitySlot,
  Chains,
  ChainSkill,
  FormId,
  MoveKind,
} from '../types/ability.js';
import type { GearItem, Moveset, Rarity } from '../types/gear.js';
import { RARITY_ORDER } from '../types/gem.js';
import type { ManaType } from '../types/mana.js';

/**
 * Weapon movesets (see the weapon movesets spec): which chains a weapon
 * carries, its base slots, its default moves, and a drop's extra slots.
 */

/** A weapon as its moveset sees it: its base and rarity (unarmed: both null). */
export interface MovesetOwner {
  baseId: string | null;
  rarity: Rarity | null;
}

/** Each ability slot's default form and payment: a Bolt, a Ward and a charged Nova. */
export const DEFAULT_FORMS: Record<AbilitySlot, { form: FormId; payment: AbilityPayment }> = {
  primary: { form: 'bolt', payment: 'mana' },
  defensive: { form: 'ward', payment: 'mana' },
  ultimate: { form: 'nova', payment: 'charge' },
};

/** The skills a weapon of `rarity` carries (unarmed, null: basic and primary). */
export function carriedSkills(registry: DataRegistry, rarity: Rarity | null): ChainSkill[] {
  return rarity ? registry.getDelveBalance().movesets.carries[rarity] : ['basic', 'primary'];
}

/** The least rarity that carries `skill` (null for one every rarity carries). */
export function carriedFrom(registry: DataRegistry, skill: ChainSkill): Rarity | null {
  const carries = registry.getDelveBalance().movesets.carries;
  if (RARITY_ORDER.every((r) => carries[r].includes(skill))) return null;
  return RARITY_ORDER.find((r) => carries[r].includes(skill)) ?? null;
}

/** The kinds a skill's default chain plays: its default form's, or the weapon's basic string. */
function defaultKinds(
  registry: DataRegistry,
  skill: ChainSkill,
  baseId: string | null,
): readonly MoveKind[] {
  if (skill !== 'basic') return registry.getForm(DEFAULT_FORMS[skill].form).defaultChain;
  const base = baseId ? registry.getGearBase(baseId).defaultChain : undefined;
  return base ?? registry.getDelveBalance().hero.defaultChain;
}

/**
 * The kind of a skill's default move at `index` (from 0): its default chain's
 * (the default form's, or for the basic chain the weapon's), medium past its end.
 */
export function defaultKind(
  registry: DataRegistry,
  skill: ChainSkill,
  baseId: string | null,
  index: number,
): MoveKind {
  return defaultKinds(registry, skill, baseId)[index] ?? 'medium';
}

/** A skill's slots to start with: the basic chain's weapon string length (unarmed, the hero's), else 1. */
export function baseSlots(
  registry: DataRegistry,
  baseId: string | null,
  skill: ChainSkill,
): number {
  return skill === 'basic' ? defaultKinds(registry, 'basic', baseId).length : 1;
}

/** A skill's default chain of `length` moves, every one in `element`. */
export function defaultChain<S extends ChainSkill>(
  registry: DataRegistry,
  skill: S,
  baseId: string | null,
  element: ManaType,
  length: number,
): Chains[S] {
  const kinds = Array.from({ length }, (_, i) => defaultKind(registry, skill, baseId, i));
  if (skill === 'basic') return kinds.map((kind) => ({ kind, element })) as Chains[S];
  const { form, payment } = DEFAULT_FORMS[skill as AbilitySlot];
  return {
    moves: kinds.map((kind) => ({ kind, form, elements: [element] })),
    payment,
  } as Chains[S];
}

/**
 * A moveset for `owner`: each skill it carries at `slots` (its base slots
 * where left out), every slot holding its default move in `element`.
 */
export function defaultMoveset(
  registry: DataRegistry,
  owner: MovesetOwner,
  element: ManaType,
  slots: Partial<Record<ChainSkill, number>> = {},
): Moveset {
  const skills = carriedSkills(registry, owner.rarity);
  const n = (s: ChainSkill) => slots[s] ?? baseSlots(registry, owner.baseId, s);
  return {
    chains: Object.fromEntries(
      skills.map((s) => [s, defaultChain(registry, s, owner.baseId, element, n(s))]),
    ) as Moveset['chains'],
    slots: Object.fromEntries(skills.map((s) => [s, n(s)])),
  };
}

/** A weapon's own moveset: its stored one, else its base defaults in its mana. */
export function movesetOf(registry: DataRegistry, weapon: GearItem): Moveset {
  return weapon.moveset ?? defaultMoveset(registry, weapon, weapon.mana);
}

/** A weapon's extra slots: its slots past each chain's base, summed. */
export function extraSlots(registry: DataRegistry, weapon: GearItem): number {
  if (weapon.slot !== 'weapon') return 0;
  const { slots } = movesetOf(registry, weapon);
  return (Object.keys(slots) as ChainSkill[]).reduce(
    (sum, s) => sum + slots[s]! - baseSlots(registry, weapon.baseId, s),
    0,
  );
}

/**
 * A weapon drop's moveset: its rarity's extra slots (`movesets.extraSlots`),
 * each on a chain it carries picked uniformly at random (never past the
 * chain's cap), every slot holding its default move in the item's mana.
 */
export function rollMoveset(
  registry: DataRegistry,
  item: Pick<GearItem, 'baseId' | 'rarity' | 'mana'>,
  rng: SeededRNG,
): Moveset {
  const bal = registry.getDelveBalance();
  const [least, most] = bal.movesets.extraSlots[item.rarity];
  const skills = carriedSkills(registry, item.rarity);
  const slots = Object.fromEntries(skills.map((s) => [s, baseSlots(registry, item.baseId, s)]));
  for (let extra = rng.nextInt(least, most); extra > 0; extra--) {
    const open = skills.filter((s) => slots[s] < bal.chains.cap[s]);
    if (open.length === 0) break;
    slots[open[rng.nextInt(0, open.length - 1)]]++;
  }
  return defaultMoveset(registry, item, item.mana, slots);
}
```


In `packages/engine/src/loot/item-generator.ts`:

Replace:

```ts
import { RARITY_ORDER } from '../types/gem.js';

```

with:

```ts
import { RARITY_ORDER } from '../types/gem.js';
import { rollMoveset } from './moveset.js';

```

Replace:

```ts
  if (legendary) item.legendary = legendary;
  return item;
```

with:

```ts
  if (legendary) item.legendary = legendary;
  // Last, from its own stream: every other roll, and every later drop, stays as it was.
  if (item.slot === 'weapon') item.moveset = rollMoveset(registry, item, rng.fork('moveset'));
  return item;
```

- [ ] **Step 5: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts)`
Expected: PASS, 15 tests.

- [ ] **Step 6: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1368 tests pass in 77 files.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx prettier --write src/loot/moveset.ts src/data/schemas.ts src/types/delve.ts src/types/gear.ts tests/delve-movesets.test.ts)
git add packages/engine/src/loot/moveset.ts packages/engine/src/data/balance.json packages/engine/src/data/schemas.ts packages/engine/src/types/delve.ts packages/engine/src/types/gear.ts packages/engine/src/delve/profile-schema.ts packages/engine/src/loot/item-generator.ts packages/engine/tests/delve-movesets.test.ts
git commit -m "feat(engine): weapons carry movesets: chains by rarity, base slots, a drop's extra slots" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: Engine: an absent skill

### Task 2: A skill the weapon doesn't carry is a null chain

`HeroEntity.chains` becomes `(ResolvedChain | null)[]`, keeping every slot's index (cooldowns, charge, beats and the HUD all index by slot); `FloorOptions.chains` and `refreshWorldHero` take `Partial<Pick<Chains, AbilitySlot>>`. Every sim reader passes a null chain over: casts, holds and readiness refuse it (they already refused a missing one), `pressStep` gives 0 and `nextMove`/`pressMove` null, `gainCharge` and the Training Grounds' top-ups fill no meter for it, Galvanize skips it, the bot never reaches for it, and `estimateCombat` counts nothing for it (no Defensive: no guard and no mitigation). No profile has a null chain yet; the tests build heroes with `ArenaOpts.chains`.

**Files:**
- Modify: `packages/engine/src/types/arpg.ts:325` (`HeroEntity.chains`)
- Modify: `packages/engine/src/arpg/world.ts:29,177,204,244,288` (the hero's setup, `refreshWorldHero`, `sameChain`)
- Modify: `packages/engine/src/arpg/abilities/cast.ts:41,95,241,325`
- Modify: `packages/engine/src/arpg/abilities/defend.ts:13,91,121`
- Modify: `packages/engine/src/arpg/step.ts:178,262,306`
- Modify: `packages/engine/src/arpg/sandbox.ts:261`
- Modify: `packages/engine/src/arpg/combat.ts:481` (Galvanize)
- Modify: `packages/engine/src/arpg/action.ts:157`
- Modify: `packages/engine/src/arpg/bot.ts:107`
- Modify: `packages/engine/src/arpg/dps-sim.ts:116`
- Modify: `packages/engine/src/delve/hero-stats.ts:383,414` (`estimateCombat`)
- Modify: `packages/engine/tests/fixtures/arena.ts:81,94` (`ArenaOpts.chains`)
- Modify: `packages/engine/tests/delve-movesets.test.ts` (imports, and a new block at the end)

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/fixtures/arena.ts`:

Replace:

```ts
  ultimate?: ChainOpts;
  /** Stop the hero's automatic basic attack so only abilities deal damage. */
```

with:

```ts
  ultimate?: ChainOpts;
  /** The chains exactly (a skill left out has none), in place of the fixture's and the options above. */
  chains?: Partial<Pick<Chains, AbilitySlot>>;
  /** Stop the hero's automatic basic attack so only abilities deal damage. */
```

Replace:

```ts
    chains: chainsWith(opts),
    heroHpFrac: 1,
```

with:

```ts
    chains: opts.chains ?? chainsWith(opts),
    heroHpFrac: 1,
```

In `packages/engine/tests/delve-movesets.test.ts`:

Replace:

```ts
import { CHAIN_SKILLS, type Blow, type Chain } from '../src/types/ability.js';
import type { GearItem, Rarity } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import { bal, registry } from './fixtures/arena.js';

```

with:

```ts
import { abilityReady, nextMove, pressMove, pressStep } from '../src/arpg/abilities/cast.js';
import { gainCharge } from '../src/arpg/abilities/defend.js';
import { botInput } from '../src/arpg/bot.js';
import { applyStatus, hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { fillCharge, setSandboxToggles } from '../src/arpg/sandbox.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
import { CHAIN_SKILLS, type Blow, type Chain } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { GearItem, Rarity } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import {
  DEFAULT_CHAINS,
  STEP,
  arena,
  bal,
  dummy,
  gear,
  press,
  registry,
  run,
} from './fixtures/arena.js';

```

Append at the end of the file:

```ts
describe('an absent skill (a null chain)', () => {
  const PRIMARY_ONLY = { primary: DEFAULT_CHAINS.primary };
  const casts = (events: ArpgEvent[]) =>
    events.filter((e) => e.kind === 'windup' || e.kind === 'cast').map((e) => e.slot);

  it('sets the hero up with no chain for a skill left out, every slot keeping its place', () => {
    const w = arena([dummy(13, 30)], { chains: PRIMARY_ONLY, noBasic: true });
    expect(w.hero.chains.map((c) => c && c.moves[0].form.id)).toEqual(['bolt', null, null]);
    expect(w.hero.cooldowns).toEqual([[0], [], []]);
  });

  it('refuses a press or a hold of it, and names no move for it', () => {
    const w = arena([dummy(13, 30)], { chains: PRIMARY_ONLY, noBasic: true });
    const ctx = makeCtx(registry, w, []);
    expect([0, 1, 2].map((s) => abilityReady(ctx, s))).toEqual([true, false, false]);
    expect(casts([...press(w, 1), ...press(w, 2)])).toEqual([]);
    for (let i = 0; i < 10; i++) stepWorld(registry, w, { move: { x: 0, y: 0 }, holding: 2 }, STEP);
    expect(w.hero.hold).toBeNull();
    expect(pressStep(w.hero, 2, w.t, 1)).toBe(0);
    expect(nextMove(w.hero, 1, w.t, 1)).toBeNull();
    expect(pressMove(w.hero, 2, w.t, 1)).toBeNull();
    expect(casts(press(w, 0))).toEqual([0, 0]);
  });

  it("fills no charge meter for it, nor do the Training Grounds' top-ups", () => {
    const primary = { ...DEFAULT_CHAINS.primary, payment: 'charge' as const };
    const w = arena([dummy(13, 30)], { chains: { primary }, noBasic: true });
    gainCharge(makeCtx(registry, w, []), 1e9);
    expect(w.hero.charge[0]).toBeGreaterThan(0);
    expect(w.hero.charge.slice(1)).toEqual([0, 0]);
    setSandboxToggles(w, { infiniteMana: false, noCooldowns: true, invulnerable: false });
    fillCharge(w);
    run(w, 0.2);
    expect(w.hero.charge.slice(1)).toEqual([0, 0]);
  });

  it('Galvanize and Nightstalker pass over it', () => {
    const w = arena([dummy(13, 30), dummy(15, 30)], { chains: PRIMARY_ONLY, noBasic: true });
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    const h = w.hero;
    h.cooldowns[0] = [w.t + 2];
    applyStatus(ctx, w.monsters[0], 'shock', 0);
    hitMonster(ctx, w.monsters[0], 10, 'nature', { source: 'skill' });
    expect(events.some((e) => e.kind === 'reaction' && e.reaction === 'galvanize')).toBe(true);
    expect(h.cooldowns).toEqual([[w.t + 2 - bal.reactions.galvanizeSeconds], [], []]);
    h.stats.legendaries.nightstalker = 30;
    killMonster(ctx, w.monsters[1]);
    expect(h.cooldowns[1]).toEqual([]);
    expect(h.charge).toEqual([0, 0, 0]);
  });

  it('the bot never reaches for it', () => {
    const foes = [dummy(13, 34), dummy(14, 34), dummy(12, 34), dummy(13, 33)];
    const w = arena(foes, { chains: PRIMARY_ONLY });
    w.hero.hp = w.hero.stats.maxHp / 2; // it would guard, and the crowd calls for the Ultimate
    const events: ArpgEvent[] = [];
    for (let i = 0; i < 3 / STEP; i++)
      events.push(...stepWorld(registry, w, botInput(registry, w), STEP));
    expect(new Set(casts(events))).toEqual(new Set([0]));
  });

  it('a chain swapped out mid-floor ends its effect; swapped back in, it is ready', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    press(w, 1);
    expect(w.hero.defend).not.toBeNull();
    refreshWorldHero(registry, w, w.hero.stats, PRIMARY_ONLY);
    expect(w.hero.chains.map((c) => c !== null)).toEqual([true, false, false]);
    expect([w.hero.defend, w.hero.ward]).toEqual([null, null]);
    expect(w.hero.cooldowns.slice(1)).toEqual([[], []]);
    refreshWorldHero(registry, w, w.hero.stats, DEFAULT_CHAINS);
    expect(w.hero.cooldowns[1]).toEqual([0]);
    expect(casts(press(w, 1))).toEqual([1, 1]);
  });

  it('counts nothing toward Power: no Defensive means no guard and no mitigation', () => {
    const stats = computeHeroStats({ weapon: gear('fire') }, registry);
    const est = (chains: Parameters<typeof estimateCombat>[3]) =>
      estimateCombat(stats, registry, 5, chains);
    const none = est({});
    const primary = est(PRIMARY_ONLY);
    expect(primary.dps).toBeGreaterThan(none.dps);
    expect(primary.ehp).toBe(none.ehp);
    const armor = {
      moves: [{ kind: 'medium' as const, form: 'armor' as const, elements: ['earth' as const] }],
      payment: 'mana' as const,
    };
    expect(est({ ...PRIMARY_ONLY, defensive: armor }).ehp).toBeGreaterThan(primary.ehp);
    expect(est({ ...PRIMARY_ONLY, ultimate: DEFAULT_CHAINS.ultimate }).dps).toBeGreaterThan(
      primary.dps,
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts)`
Expected: FAIL, 7 failed and 15 passed (22): each of the new block's tests with `TypeError: Cannot read properties of undefined (reading 'moves')` (the swap-out test: `… (reading 'payment')`): the world resolves a chain that isn't there.

- [ ] **Step 3: Null chains through the sim**

In `packages/engine/src/types/arpg.ts`:

Replace:

```ts
  /** The Primary's, Defensive's and Ultimate's chains. */
  chains: ResolvedChain[];
  /** Per slot and move: the time the move is ready again. */
```

with:

```ts
  /**
   * The Primary's, Defensive's and Ultimate's chains, by slot: null for a
   * skill the weapon doesn't carry (see the weapon movesets spec).
   */
  chains: (ResolvedChain | null)[];
  /** Per slot and move: the time the move is ready again. */
```

In `packages/engine/src/arpg/world.ts`:

Replace:

```ts
  /** The Primary's, Defensive's and Ultimate's chains (the basic chain is in `stats`). */
  chains: Pick<Chains, AbilitySlot>;
  heroHpFrac: number;
```

with:

```ts
  /**
   * The Primary's, Defensive's and Ultimate's chains (the basic chain is in
   * `stats`); a skill left out has none.
   */
  chains: Partial<Pick<Chains, AbilitySlot>>;
  heroHpFrac: number;
```

Replace the lines from `function resolveAll(` up to (not including) `opts: { hpFrac: number; potions: number; phoenixAvailable: boolean; x: number; y: number },` with:

```ts
/** Each slot's chain resolved, by slot; null for a skill left out. */
function resolveAll(
  registry: DataRegistry,
  chains: Partial<Pick<Chains, AbilitySlot>>,
  stats: HeroStats,
): (ResolvedChain | null)[] {
  return ABILITY_SLOTS.map((slot) => {
    const chain = chains[slot];
    return chain ? resolveChain(registry, stats, slot, chain) : null;
  });
}

export function createHeroEntity(
  registry: DataRegistry,
  stats: HeroStats,
  chains: Partial<Pick<Chains, AbilitySlot>>,
```

Replace:

```ts
    cooldowns: resolved.map((c) => c.moves.map(() => 0)),
    charge: [0, 0, 0],
```

with:

```ts
    cooldowns: resolved.map((c) => c?.moves.map(() => 0) ?? []),
    charge: [0, 0, 0],
```

Replace the lines from `* bursting.` up to (not including) `): void {` with:

```ts
 * bursting. A skill left out has no chain (and so no cooldowns or charge).
 */
export function refreshWorldHero(
  registry: DataRegistry,
  world: ArpgWorld,
  stats: HeroStats,
  chains: Partial<Pick<Chains, AbilitySlot>>,
```

Replace the lines from `h.cooldowns[i] = chain.moves.map((_, j) => h.cooldowns[i][j] ?? 0);` up to (not including) `a.payment === b.payment &&` with:

```ts
    h.cooldowns[i] = chain?.moves.map((_, j) => h.cooldowns[i][j] ?? 0) ?? [];
    h.comboStep[i] = chain ? Math.min(h.comboStep[i], chain.moves.length - 1) : 0;
    h.charge[i] = chain ? Math.min(h.charge[i], chargeCap(chain)) : 0;
  });
}

/** Whether a resolved chain is `b` (both absent counts as the same). */
function sameChain(a: ResolvedChain | null, b: Chain | undefined): boolean {
  if (!a || !b) return !a && !b;
  return (
```

In `packages/engine/src/arpg/abilities/cast.ts`:

Replace the lines from `return t - h.comboAt[slot] <= window ? (h.comboStep[slot] + 1) % h.chains[slot].moves.length : 0;` up to (not including) `return h.windup?.slot === slot` with:

```ts
  const chain = h.chains[slot];
  if (!chain) return 0;
  return t - h.comboAt[slot] <= window ? (h.comboStep[slot] + 1) % chain.moves.length : 0;
}

/** The move the slot's next press would cast (null for a skill the weapon doesn't carry). */
export function nextMove(
  h: HeroEntity,
  slot: number,
  t: number,
  window: number,
): ResolvedAbility | null {
  return h.chains[slot]?.moves[pressStep(h, slot, t, window)] ?? null;
}

/**
 * The move a press made now will cast: during the slot's own wind-up, the one
 * after the winding move (the wind-up lands before the press fires); else
 * `nextMove` (null for a skill the weapon doesn't carry).
 */
export function pressMove(
  h: HeroEntity,
  slot: number,
  t: number,
  window: number,
): ResolvedAbility | null {
  const moves = h.chains[slot]?.moves;
  if (!moves) return null;
```

Replace:

```ts
  const ab = chainMove(h.chains[slot], step, stage);
  const res = executeForm(ctx, ab, aim);
```

with:

```ts
  // Only a slot with a chain winds up or holds.
  const ab = chainMove(h.chains[slot]!, step, stage);
  const res = executeForm(ctx, ab, aim);
```

Replace:

```ts
  const chain = h.chains[hold.slot];
  let s = stage;
```

with:

```ts
  const chain = h.chains[hold.slot]!;
  let s = stage;
```

Replace:

```ts
  if (!DIRECTIONAL.has(chainMove(h.chains[w.slot], w.step, w.stage).form.id)) return false;
  const first = dirTo(w.from.x, w.from.y, w.at.x, w.at.y);
```

with:

```ts
  if (!DIRECTIONAL.has(chainMove(h.chains[w.slot]!, w.step, w.stage).form.id)) return false;
  const first = dirTo(w.from.x, w.from.y, w.at.x, w.at.y);
```

In `packages/engine/src/arpg/abilities/defend.ts`:

Replace:

```ts
  return chainMove(h.chains[DEFENSIVE], h.defend.move, h.defend.stage);
}
```

with:

```ts
  // A Defensive's effect runs only with a Defensive chain (a new one ends it).
  return chainMove(h.chains[DEFENSIVE]!, h.defend.move, h.defend.stage);
}
```

Replace:

```ts
  const ab = chainMove(h.chains[DEFENSIVE], h.defend.move, h.defend.stage);
  if (world.t >= h.defend.until) {
```

with:

```ts
  const ab = chainMove(h.chains[DEFENSIVE]!, h.defend.move, h.defend.stage);
  if (world.t >= h.defend.until) {
```

Replace:

```ts
    if (chain.payment !== 'charge' || i === fromSlot || h.cooldowns[i].some((c) => t < c)) return;
    h.charge[i] = Math.min(chargeCap(chain), h.charge[i] + units);
```

with:

```ts
    if (chain?.payment !== 'charge' || i === fromSlot || h.cooldowns[i].some((c) => t < c)) return;
    h.charge[i] = Math.min(chargeCap(chain), h.charge[i] + units);
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
        nextMove(h, p.cast.slot, t, window).kind !== 'hold',
    );
```

with:

```ts
        nextMove(h, p.cast.slot, t, window)?.kind !== 'hold',
    );
```

Replace:

```ts
      if (chain.payment === 'charge') h.charge[i] = chargeCap(chain);
    });
```

with:

```ts
      if (chain?.payment === 'charge') h.charge[i] = chargeCap(chain);
    });
```

Replace:

```ts
    const ab = nextMove(h, slot, t, bal.abilities.comboWindow);
    if (chain.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return false;
```

with:

```ts
    const ab = nextMove(h, slot, t, bal.abilities.comboWindow)!;
    if (chain.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return false;
```

In `packages/engine/src/arpg/sandbox.ts`:

Replace:

```ts
    if (chain.payment === 'charge') h.charge[i] = chargeCap(chain);
  });
```

with:

```ts
    if (chain?.payment === 'charge') h.charge[i] = chargeCap(chain);
  });
```

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
      h.chains.forEach((chain, i) => {
        if (chain.payment === 'charge') h.charge[i] = Math.min(chargeCap(chain), h.charge[i] + 1);
```

with:

```ts
      h.chains.forEach((chain, i) => {
        if (!chain) return;
        if (chain.payment === 'charge') h.charge[i] = Math.min(chargeCap(chain), h.charge[i] + 1);
```

In `packages/engine/src/arpg/action.ts`:

Replace:

```ts
  h.charge[w.slot] = Math.min(chargeCap(h.chains[w.slot]), h.charge[w.slot] + w.chargePaid);
  h.windup = null;
```

with:

```ts
  h.charge[w.slot] = Math.min(chargeCap(h.chains[w.slot]!), h.charge[w.slot] + w.chargePaid);
  h.windup = null;
```

In `packages/engine/src/arpg/bot.ts`:

Replace the lines from `gap < nextMove(h, 0, world.t, ctx.bal.abilities.comboWindow).range &&` up to (not including) `input.holding = slot;` with:

```ts
    gap < (nextMove(h, 0, world.t, ctx.bal.abilities.comboWindow)?.range ?? 0) &&
    !h.swing &&
    abilityReady(ctx, 0)
      ? 0
      : -1,
  ];
  const slot = wants.find((s) => s >= 0);
  if (slot !== undefined) {
    if (nextMove(h, slot, world.t, ctx.bal.abilities.comboWindow)?.kind === 'hold')
```

In `packages/engine/src/arpg/dps-sim.ts`:

Replace:

```ts
    if (waiting || pressMove(h, slot, world.t, bal.abilities.comboWindow).kind === 'hold')
      return { move, holding: slot };
```

with:

```ts
    if (waiting || pressMove(h, slot, world.t, bal.abilities.comboWindow)?.kind === 'hold')
      return { move, holding: slot };
```

In `packages/engine/src/delve/hero-stats.ts`:

Replace the lines from `* toward survival.` up to (not including) `registry,` with:

```ts
 * toward survival. A skill left out of `chains` counts nothing.
 */
export function estimateCombat(
  stats: HeroStats,
  registry: DataRegistry,
  depth: number,
  chains: Partial<Pick<Chains, AbilitySlot>> = defaultChains(
```

Replace the lines from `const [primary, defensive, ultimate] = ABILITY_SLOTS.map((slot) =>` up to (not including) `dps += stats.thorns / ref.interval;` with:

```ts
  const [primary, defensive, ultimate] = ABILITY_SLOTS.map((slot) => {
    const chain = chains[slot];
    return chain ? resolveChain(registry, stats, slot, chain) : null;
  });
  const pool = manaPool(stats, registry);
  const manaIncome = pool.regen + bal.mana.basicAttackGain / strikeInterval;
  const unit = Math.max(1, stats.weaponDamage * stats.damageMult);
  const every = (chain: ResolvedChain, income: number, rate: number) =>
    useInterval(bal, chain, stats.tempo, income, rate);
  const primaryDps = primary
    ? damagePerUse(primary, hit, stats, bal) / every(primary, manaIncome * 0.7, dps / unit)
    : 0;
  // Abilities share the hero's time and mana; count them at partial efficiency.
  dps += primaryDps * 0.75;
  const chargeRate = dps / unit;
  if (ultimate)
    dps +=
      (damagePerUse(ultimate, hit, stats, bal) / every(ultimate, manaIncome * 0.3, chargeRate)) *
      0.8;

  let mitigation = (1 - armorReduction(bal, stats.armor, depth)) * (1 - stats.dodge);
  let bonusLife = 0;
  if (defensive) {
    const guardEvery = every(defensive, manaIncome * 0.3, chargeRate);
    // The Defensive's effect: its first move's (a hold's at full charge).
    const guard = valuedMove(defensive, 0);
    const guardFor = guard.form.id === 'blink' ? bal.abilities.defend.blinkSeconds : guard.duration;
    const uptime = Math.min(1, guardFor / Math.max(guardFor, guardEvery));
    if (guard.form.id === 'armor') mitigation *= 1 - Math.min(0.75, guard.effect) * uptime;
    if (guard.elements.includes('earth'))
      mitigation *= 1 - bal.abilities.defend.earthReduction * uptime;
    if (guard.form.id === 'ward') bonusLife += stats.maxHp * guard.effect * uptime * 2;
    if (guard.form.id === 'surge') dps *= 1 + guard.effect * uptime;
    if (guard.form.id === 'blink') mitigation *= 1 - 0.3 * uptime;
    dps += (damagePerUse(defensive, hit, stats, bal) / Math.max(1, guardEvery)) * 0.5;
  }

```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts)`
Expected: PASS, 22 tests.

- [ ] **Step 5: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1375 tests pass in 77 files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx prettier --write src/types/arpg.ts src/arpg/world.ts src/arpg/abilities/cast.ts src/arpg/abilities/defend.ts src/arpg/step.ts src/arpg/sandbox.ts src/arpg/combat.ts src/arpg/action.ts src/arpg/bot.ts src/arpg/dps-sim.ts src/delve/hero-stats.ts tests/fixtures/arena.ts tests/delve-movesets.test.ts)
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/abilities/defend.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/action.ts packages/engine/src/arpg/bot.ts packages/engine/src/arpg/dps-sim.ts packages/engine/src/delve/hero-stats.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-movesets.test.ts
git commit -m "feat(engine): a skill the weapon doesn't carry is a null chain every sim reader passes over" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: Engine: nothing re-colours the moves on its own

### Task 3: `followBasic` retires from the Delve; the autopilot fuses its Primary last

The spec: "Nothing re-colours a weapon's moves on its own." While the chains still live on the profile, the retirements land first: `bindSecondary`, `resolveOvertake`, `equipItem` and `unequipSlot` stop following a default basic chain (`followBasicTo` goes); `realign` maps every move by role, a default basic chain too (its default-basic branch goes); `compareItem` keeps the hero's chains on a new weapon (its `followBasic` goes); and the autopilot's `betweenDives` stops calling `fixChainsToPair` without `was`. The Training Grounds keep `followBasic` (`arpg/abilities/resolve.ts` is untouched).

The autopilot's `bindBest` splits: it only binds (still before salvaging), and a new `fusePrimary` builds the Primary from both elements after the forge visit, since from Task 4 on a new weapon brings its own moves.

The pacing moves a little (a bind no longer turns the basic chain's last blow into the secondary): every rail holds.

**Files:**
- Modify: `packages/engine/src/delve/pair.ts:2,114,180,231,260`
- Modify: `packages/engine/src/delve/profile.ts:26,378` (imports, `equipItem`, `unequipSlot`)
- Modify: `packages/engine/src/delve/hero-stats.ts:11,484,501` (imports, `compareItem`)
- Modify: `packages/engine/src/delve/autopilot.ts:22,109,127,195` (CRLF, never format)
- Modify: `packages/engine/tests/delve-pair.test.ts:476,759,804,938`

- [ ] **Step 1: Write the failing tests**

The block `a basic chain on its default follows the weapon and the pair` becomes `nothing re-colours the moves on its own`: it keeps the `followBasic` test (for the Training Grounds) and pins that a weapon change, a bind, an overtake and a re-attune leave every move as it is, that a realign maps every move by role (a default basic chain too, a notice each), and that an off-pair move still strikes and reacts in its element but draws no attunement power.

In `packages/engine/tests/delve-pair.test.ts`:

Replace:

```ts
    // The basic chain's last blow takes the secondary, as the pair's default chain has it.
    expect(res.profile.chains.basic.map((b) => b.element)).toEqual(['fire', 'fire', 'storm']);
    expect(bindSecondary(registry, res.profile, 'nature').ok).toBe(false);
```

with:

```ts
    // Every move keeps its elements.
    expect(res.profile.chains).toEqual(p.chains);
    expect(bindSecondary(registry, res.profile, 'nature').ok).toBe(false);
```

Replace the lines from `describe('a basic chain on its default follows the weapon and the pair', () => {` up to (not including) `const at = (weaponBaseId: string | null, primary: ManaType, secondary: ManaType | null) => ({` with:

```ts
describe('nothing re-colours the moves on its own', () => {
  /** A Fire+Storm sword hero: its moves all Fire. */
  const hero = () =>
    bindSecondary(registry, createDelveProfile(registry, 3, { primary: 'fire' }), 'storm').profile;
  const built: Blow[] = [{ kind: 'heavy', element: 'fire' }];
  const maul: GearItem = { ...gear('fire', 'weapon', 'maul'), uid: 'maul' };
  const stormGear = {
    helm: item('storm', 'helm'),
    gloves: item('storm', 'gloves'),
    boots: item('storm', 'boots'),
  }; // storm 3 > 1.2 × fire 2

  it('followBasic (the Training Grounds): a default chain becomes the new default; a built one keeps its blows, by role once an element leaves', () => {
```

Replace the lines from `it("a weapon change: the new weapon's default (unarmed too); a built chain stays", () => {` up to (not including) `describe("Power values the hero's own chains", () => {` with:

```ts
  it('a weapon change keeps every move, unarmed too', () => {
    const p = { ...hero(), bag: [maul] };
    const worn = equipItem(registry, p, 'maul');
    expect(worn.chains).toEqual(p.chains);
    expect(unequipSlot(registry, worn, 'weapon').chains).toEqual(p.chains);
  });

  it('a bind, an overtake and a re-attune leave every move as it is', () => {
    const solo = createDelveProfile(registry, 3, { primary: 'fire' });
    const bound = bindSecondary(registry, solo, 'storm').profile;
    expect(bound.chains).toEqual(solo.chains);
    const own = setChain(registry, bound, 'basic', built);
    const over = resolveOvertake(registry, { ...own, equipped: { ...own.equipped, ...stormGear } });
    expect(over.swapped).toBe(true);
    expect(over.profile.chains).toEqual(own.chains);
    // Re-attuning the sword to Storm changes its mana, not the moves.
    const sword = over.profile.equipped.weapon!;
    const cost = bal.pair.reattuneDust[sword.rarity];
    const re = reattuneItem(registry, { ...over.profile, manaDust: cost }, sword.uid, 'storm');
    expect(re.item!.mana).toBe('storm');
    expect(re.profile.chains).toEqual(own.chains);
  });

  it('a realign maps every move by role, a default basic chain too, a notice each', () => {
    const { realignDust, realignScrap } = bal.pair;
    const p = { ...hero(), manaDust: realignDust, scrap: realignScrap };
    // Fire's role (the primary) goes to Storm.
    const res = realign(registry, p, { primary: 'storm', secondary: 'nature' });
    expect(res.profile.chains.basic).toEqual(defaultBasic(registry, 'sword', 'storm'));
    expect(res.fixed!.filter((f) => f.skill === 'basic').map((f) => [f.index, f.removed])).toEqual([
      [0, ['fire']],
      [1, ['fire']],
      [2, ['fire']],
    ]);
    const swap = realign(registry, p, { primary: 'storm', secondary: 'fire' });
    expect(swap.profile.chains).toEqual(p.chains);
    expect(swap.fixed).toEqual([]);
  });

  it('an off-pair move still strikes and reacts in its element, but draws no attunement power', () => {
    const k = bal.pair.basicPowerPerAttune;
    // A Fire hero whose last blow is Frost (as a Frost weapon's would be), wearing Frost.
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' }); // fire 2
    const basic: Blow[] = [
      { kind: 'light', element: 'fire' },
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'frost' },
    ];
    const p = { ...p0, chains: { ...p0.chains, basic } };
    const worn = {
      ...p,
      equipped: { ...p.equipped, ring: item('frost', 'ring', [['frostAttune', 5]]) },
    };
    const blows = profileStats(registry, worn).weapon.blows;
    expect(blows.map((b) => b.element)).toEqual(['fire', 'fire', 'frost']);
    expect(blows[0].attunePower).toBeCloseTo(1 + 2 * k);
    expect(blows[2].attunePower).toBe(1);
    const w = strikeWorld(worn.equipped, { pair: worn.pair, filterAttunement: true, basic }, true);
    expect(only(firstBlow(w), 'hit').map((h) => h.element)).toEqual(['frost']);
    expect(w.monsters[0].status.stacks.frost).toBeGreaterThan(0);
  });
});

```

Replace the lines from `it('compareItem values a weapon with the basic chain that equipping it gives', () => {` up to (not including) `for (const q of [hero(), built]) {` with:

```ts
  it('compareItem values a weapon with the chains equipping it keeps', () => {
    const maul: GearItem = { ...gear('fire', 'weapon', 'maul'), uid: 'maul' };
    const built = setChain(registry, hero(), 'basic', [
      { kind: 'light', element: 'storm' },
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'fire' },
    ]);
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts)`
Expected: FAIL, 4 failed and 48 passed (52): `bindSecondary: free, once, never the primary, never mid-dive`, `a weapon change keeps every move, unarmed too`, `a bind, an overtake and a re-attune leave every move as it is` and `a realign maps every move by role, a default basic chain too, a notice each`.

- [ ] **Step 3: The retirements, and the Primary fused last**

In `packages/engine/src/delve/pair.ts`:

Replace the lines from `import {` up to (not including) `import { ABILITY_SLOTS, type Blow, type ChainSkill, type Move } from '../types/ability.js';` with:

```ts
import { defaultChains, roleHeir } from '../arpg/abilities/resolve.js';
```

Delete the lines from `` * `next`, after an op on `was` that changed its weapon or pair, with the basic `` up to (not including) `` * `item` attuned to `mana`: its lines of the old mana convert (`*Attune`, ``.

Replace the lines from `chains: defaultChains(registry, mana, equipped.weapon?.baseId ?? null),` up to (not including) `export function realign(` with:

```ts
      chains: defaultChains(registry, mana, equipped.weapon?.baseId ?? null),
    },
  };
}

/** Bind a second element: free, once, between dives. Every move keeps its elements. */
export function bindSecondary(
  _registry: DataRegistry,
  profile: DelveProfile,
  mana: ManaType,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Bind a second element between dives');
  const { primary, secondary } = profile.pair;
  if (!primary) return refuse(profile, 'Choose your mana first');
  if (secondary) return refuse(profile, 'Your second element is already bound');
  if (mana === primary) return refuse(profile, 'That is already your primary');
  return { ok: true, profile: { ...profile, pair: { primary, secondary: mana } } };
}

/**
 * Change a bound pair (either element, or swap them) for Mana Dust and scrap,
 * between dives. Gear stays as it is; the chains follow the new pair
 * (`fixChainsToPair`): once an element is replaced, every move and blow takes
 * its elements' roles' new elements, and each one changed comes back in
 * `fixed`.
 */
```

Replace the lines from `if (!isDefaultBasic(registry, profile.chains.basic, basicLoadout(profile)!))` up to (not including) `` * How near a bound secondary is to overtaking: its attunement (`have`) against `` with:

```ts
  return { ok: true, profile: res.profile, fixed: res.fixed };
}

/**
```

Replace the lines from `* secondary. Chains stay valid: the pair is the same two. A basic chain still` up to (not including) `` /** The Mana Dust re-attuning `item` costs (by its rarity). */ `` with:

```ts
 * secondary. Every move keeps its elements: the pair is the same two.
 */
export function resolveOvertake(
  registry: DataRegistry,
  profile: DelveProfile,
): { profile: DelveProfile; swapped: boolean } {
  const { primary, secondary } = profile.pair;
  if (!primary || !secondary || isDiveActive(profile)) return { profile, swapped: false };
  if (!overtakeProgress(registry, profile).ready) return { profile, swapped: false };
  return {
    profile: { ...profile, pair: { primary: secondary, secondary: primary } },
    swapped: true,
  };
}

```

In `packages/engine/src/delve/profile.ts`:

Replace the lines from `} from './profile-schema.js';` up to (not including) `import { defaultBasic, defaultChains } from '../arpg/abilities/resolve.js';` with:

```ts
} from './profile-schema.js';
import { chooseStartingMana, fixChainsToPair, inPair, salvageDust, type ChainFix } from './pair.js';
```

Replace the lines from `` /** Equip a bag item; a basic chain still on its default follows a new weapon (`followBasicTo`). */ `` up to (not including) `export function toggleLock(profile: DelveProfile, uid: string): DelveProfile {` with:

```ts
/** Equip a bag item. */
export function equipItem(
  _registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
): DelveProfile {
  const item = profile.bag.find((i) => i.uid === uid);
  if (!item) throw new Error(`Item not in bag: ${uid}`);
  const previous = profile.equipped[item.slot];
  const bag = profile.bag.filter((i) => i.uid !== uid);
  if (previous) bag.push(previous);
  return { ...profile, bag, equipped: { ...profile.equipped, [item.slot]: item } };
}

/** Unequip into the bag. */
export function unequipSlot(
  registry: DataRegistry,
  profile: DelveProfile,
  slot: GearSlot,
): DelveProfile {
  const item = profile.equipped[slot];
  if (!item) return profile;
  if (profile.bag.length >= registry.getDelveBalance().loot.bagSize) throw new Error('Bag is full');
  const equipped = { ...profile.equipped };
  delete equipped[slot];
  return { ...profile, equipped, bag: [...profile.bag, item] };
}

```

In `packages/engine/src/delve/hero-stats.ts`:

Replace the lines from `basicLoadout,` up to (not including) `holdFull,` with:

```ts
  beatFor,
  chainMove,
  defaultBasic,
  defaultChains,
```

Replace:

```ts
/**
 * How equipping `item` (in its slot) would change the hero. With its chains and
 * pair, a new weapon swings the basic chain equipping it gives (a default one
 * follows the weapon: `followBasic`).
 */
export function compareItem(
```

with:

```ts
/** How equipping `item` (in its slot) would change the hero, with the same chains. */
export function compareItem(
```

Replace the lines from `const worn = pair ? basicLoadout({ equipped, pair }) : null;` up to (not including) `const attunementDelta: Partial<ManaMap> = {};` with:

```ts
  const beforeStats = computeHeroStats(equipped, registry, pairExtra(pair, chains?.basic));
  const afterStats = computeHeroStats(next, registry, pairExtra(pair, chains?.basic));
  const before = estimateCombat(beforeStats, registry, depth, chains);
  const after = estimateCombat(afterStats, registry, depth, chains);

```

In `packages/engine/src/delve/autopilot.ts`:

Replace:

```ts
import { bindSecondary, fixChainsToPair, profileStats, resolveOvertake } from './pair.js';
import {
```

with:

```ts
import { bindSecondary, profileStats, resolveOvertake } from './pair.js';
import {
```

Replace:

```ts
 * order), none while that's all 0: every pair reacts. Then build every move of
 * the Primary chain from both elements, so it keeps finding their reaction.
 */
```

with:

```ts
 * order), none while that's all 0: every pair reacts.
 */
```

Replace the lines from `if (!p.pair.secondary) return p;` up to (not including) `/** Between dives: fuse spare triples, melt junk, and pour scrap into upgrades. */` with:

```ts
  }
  return p;
}

/**
 * Build every move of the Primary chain from both elements of a bound pair,
 * so it keeps finding their reaction.
 */
function fusePrimary(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const { primary, secondary } = p.pair;
  const chain = p.chains.primary;
  if (!primary || !secondary) return p;
  return setChain(registry, p, 'primary', {
    ...chain,
    moves: chain.moves.map((m) => ({ ...m, elements: [primary, secondary] })),
  });
}

/**
 * Between dives, as a player would: an overtaking secondary swaps in, a second
 * element is bound (before anything is salvaged), the forge visit, and then
 * the Primary is built from both elements.
 */
export function betweenDives(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const bound = bindBest(registry, resolveOvertake(registry, profile).profile);
  return fusePrimary(registry, visitForge(registry, bound));
}

```

Replace:

```ts
  if (opts.secondary) p = bindBest(registry, bindSecondary(registry, p, opts.secondary).profile);
  const reports: AutopilotDiveReport[] = [];
```

with:

```ts
  if (opts.secondary) p = fusePrimary(registry, bindSecondary(registry, p, opts.secondary).profile);
  const reports: AutopilotDiveReport[] = [];
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts)`
Expected: PASS, 52 tests.

- [ ] **Step 5: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1374 tests pass in 77 files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx prettier --write src/delve/pair.ts src/delve/profile.ts src/delve/hero-stats.ts tests/delve-pair.test.ts)
git add packages/engine/src/delve/pair.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/delve/autopilot.ts packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): nothing re-colours the moves on its own: followBasic retires from the Delve; the autopilot fuses its Primary last" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: Engine: save v6 (Task 4, part 1: the tests)

### Task 4: The chains live on the weapon (save v6)

The profile loses `chains` and `chainCaps` and gains `links` (version 6); `DiveState` gains `linksEarned`. The hero's chains are its weapon's (`heroChains`: unarmed, a default moveset at base slots in the pair's primary, never stored), read by `profileStats`, `profilePower`, `heroPower`, `compareItem` (both losing their `chains` parameter), `beginFloor`, `overtakeProgress` and the autopilot. `setChain` edits the equipped weapon's chain within its slots (and refuses unarmed and an uncarried skill); `fixChainsToPair(registry, profile, was?)` fits the equipped weapon's moves (realign's); `chooseStartingMana` rebuilds the equipped weapon at its base slots in the chosen mana; a weapon change brings the new weapon's own moves. A frozen `DelveProfileV5Schema` keeps version 5 readable, and `parseDelveProfile` migrates it the plainest way: the equipped weapon takes all four chains, each at slots of its length (at least its base), every other weapon its base defaults, an unarmed save no chains; `ParsedDelveProfile` gains `dropped` and `movesetReset` (always `[]` and `false` until Task 5 adds the spec's rules).

This task is one commit. Its steps span this chunk (the tests) and the next (the sources).

**Files (both chunks):**
- Modify: `packages/engine/src/types/delve.ts:3,685,714,730`
- Modify: `packages/engine/src/delve/profile-schema.ts:167,239,256` (a frozen `DelveProfileV5Schema`, version 6; CRLF, never format)
- Modify: `packages/engine/src/loot/moveset.ts:11,25,43,152` (`UNARMED`, `carriedByText`, `heroChains`)
- Modify: `packages/engine/src/delve/profile.ts:4,25,76,99,125,178,207,230,259,371,385,455`
- Modify: `packages/engine/src/delve/pair.ts:2,35,67,102,131,145,172,193,211`
- Modify: `packages/engine/src/delve/hero-stats.ts:20,482,517`
- Modify: `packages/engine/src/delve/dive.ts:10,47,80` (CRLF, never format)
- Modify: `packages/engine/src/delve/autopilot.ts:22,87,131,165` (CRLF, never format)
- Modify: `packages/engine/src/index.ts:181`
- Modify: `packages/engine/tests/fixtures/arena.ts:5,51` (`asV5`, `asV4` through it, `chainsOf`, `withChains`)
- Modify: `packages/engine/tests/delve-pair.test.ts:8,66,271,302,362,397,415,429,456,477,563,611,644,660,676,759,809,873,932,1146`
- Modify: `packages/engine/tests/delve-chains.test.ts:44,1246,1292,1335`
- Modify: `packages/engine/tests/delve-dive.test.ts:38,65,272`
- Modify: `packages/engine/tests/delve-profile-abilities.test.ts:4,61,73`
- Modify: `packages/engine/tests/delve-reactions.test.ts:742`

- [ ] **Step 1: Write the failing tests**

The fixture gains the helpers every test below reads and gives a hero's chains through: `chainsOf(p)` (its weapon's, by `heroChains`), `withChains(p, chains)` (a test's shortcut onto the equipped weapon: no price, at least as many slots as moves, any skill) and `asV5(p)` (the profile as a version 5 save, which `asV4` now goes through). The migration tests that expect every chain kept use an epic sword, which carries all four (so they hold in Task 5 too).

In `packages/engine/tests/fixtures/arena.ts`:

Replace the lines from `import { computeHeroStats, type HeroStatsExtra } from '../../src/delve/hero-stats.js';` up to (not including) `import type { ManaType } from '../../src/types/mana.js';` with:

```ts
import { defaultChains } from '../../src/arpg/abilities/resolve.js';
import { withMoveset } from '../../src/delve/profile.js';
import { computeHeroStats, type HeroStatsExtra } from '../../src/delve/hero-stats.js';
import { generateItem } from '../../src/loot/item-generator.js';
import { heroChains, movesetOf } from '../../src/loot/moveset.js';
import {
  CHAIN_SKILLS,
  type AbilityBuilds,
  type AbilityCast,
  type AbilityPayment,
  type AbilitySlot,
  type Chain,
  type Chains,
  type Move,
} from '../../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../../src/types/arpg.js';
import type { DelveProfile } from '../../src/types/delve.js';
import type { EquippedGear, GearItem } from '../../src/types/gear.js';
```

Replace:

```ts
/** `p` as a version 4 save: `abilities` instead of its chains and caps. */
export function asV4(p: DelveProfile, abilities: AbilityBuilds = OLD_BUILDS) {
  const { chains: _chains, chainCaps: _caps, ...rest } = p;
  return { ...rest, version: 4, abilities };
}
```

with:

```ts
/** An item as an older save held it: no moveset. */
function bare({ moveset: _m, ...item }: GearItem): GearItem {
  return item;
}

/**
 * `p` as a version 5 save: no Links, no movesets, and `chains` on the profile
 * (by default all four of the primary's defaults on its weapon, as a version 5
 * hero began) with the balance's caps.
 */
export function asV5(
  p: DelveProfile,
  chains: Chains = defaultChains(
    registry,
    p.pair.primary ?? 'fire',
    p.equipped.weapon?.baseId ?? null,
  ),
) {
  const { links: _links, ...rest } = p;
  const equipped = Object.fromEntries(Object.entries(p.equipped).map(([s, i]) => [s, bare(i)]));
  return {
    ...rest,
    version: 5,
    equipped,
    bag: p.bag.map(bare),
    chains,
    chainCaps: { ...bal.chains.cap },
  };
}

/** `p` as a version 4 save: `abilities` instead of its chains and caps. */
export function asV4(p: DelveProfile, abilities: AbilityBuilds = OLD_BUILDS) {
  const { chains: _chains, chainCaps: _caps, ...rest } = asV5(p);
  return { ...rest, version: 4, abilities };
}

/** The hero's chains: its weapon's moveset's (unarmed, the defaults on the pair). */
export function chainsOf(p: DelveProfile): Partial<Chains> {
  return heroChains(registry, p.equipped, p.pair);
}

/**
 * `p` with its weapon holding `chains`, each skill given at least as many slots
 * as moves (a test's shortcut: no price, and any skill, carried or not).
 */
export function withChains(p: DelveProfile, chains: Partial<Chains>): DelveProfile {
  const moveset = movesetOf(registry, p.equipped.weapon!);
  const next = { chains: { ...moveset.chains }, slots: { ...moveset.slots } };
  for (const skill of CHAIN_SKILLS) {
    const chain = chains[skill];
    if (!chain) continue;
    const length = Array.isArray(chain) ? chain.length : chain.moves.length;
    (next.chains as Record<string, unknown>)[skill] = chain;
    next.slots[skill] = Math.max(next.slots[skill] ?? 0, length);
  }
  return withMoveset(p, next);
}
```

In `packages/engine/tests/delve-pair.test.ts`:

Replace:

```ts
} from '../src/arpg/abilities/resolve.js';
import { betweenDives, runAutopilot } from '../src/delve/autopilot.js';
```

with:

```ts
} from '../src/arpg/abilities/resolve.js';
import { UNARMED, defaultMoveset } from '../src/loot/moveset.js';
import { betweenDives, runAutopilot } from '../src/delve/autopilot.js';
```

Replace the lines from `dummy,` up to (not including) `} from './fixtures/arena.js';` with:

```ts
  chainsOf,
  dummy,
  firstBlow,
  gear,
  registry,
  run,
  strikeWorld,
  withChains,
```

Replace the lines from `heroPower(ring ? { weapon, ring } : { weapon }, registry, 3, undefined, pair);` up to (not including) `` /** A version 3 save of `p`: its builds (`OLD_BUILDS`), no pair, no Mana Dust. */ `` with:

```ts
      heroPower(ring ? { weapon, ring } : { weapon }, registry, 3, pair);
    expect(power(solo, item('fire'))).toBeGreaterThan(power(solo));
    expect(power(solo, item('storm'))).toBe(power(solo)); // unbound: no attunement, no gain
    expect(power(bound, item('storm'))).toBeGreaterThan(power(bound));
    expect(compareItem({ weapon }, item('storm'), registry, 3, solo).attunementDelta).toEqual({});
    expect(compareItem({ weapon }, item('storm'), registry, 3, bound).attunementDelta).toEqual({
      storm: 1,
    });
  });
});

describe('saves through version 6', () => {
```

Replace the lines from `it('a new profile is version 5 with no pair yet and no Mana Dust, and round-trips', () => {` up to (not including) `// The Bolt's default chain has four moves: a fix each.` with:

```ts
  it('a new profile is version 6 with no pair yet, no Mana Dust and no Links, and round-trips', () => {
    const p = createDelveProfile(registry, 3);
    expect(p).toMatchObject({
      version: 6,
      pair: { primary: null, secondary: null },
      manaDust: 0,
      links: 0,
    });
    expect(parseDelveProfile(registry, json(p))).toEqual({
      profile: p,
      fixed: [],
      dropped: [],
      movesetReset: false,
    });
  });

  it('refuses a secondary without a primary, or equal to it', () => {
    const p = createDelveProfile(registry, 3);
    const bad = (pair: object) => parseDelveProfile(registry, json({ ...p, pair }));
    expect(bad({ primary: null, secondary: 'fire' })).toBeNull();
    expect(bad({ primary: 'fire', secondary: 'fire' })).toBeNull();
  });

  it("migrates version 3: the most attunement is the primary, and each chain's moves are fixed to it", () => {
    const p = createDelveProfile(registry, 3); // an earth cuirass (1)
    // An epic sword (fire 2) carries all four chains; a legendary storm ring (3) outweighs it.
    const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
    const ring = { ...item('storm'), rarity: 'legendary' as const };
    const old = {
      ...v3Of(p),
      equipped: { ...p.equipped, weapon, ring },
      abilities: { ...OLD_BUILDS, defensive: { ...OLD_BUILDS.defensive, elements: ['frost'] } },
    };
    const res = parseDelveProfile(registry, json(old))!;
    expect(res.profile).toMatchObject({
      version: 6,
      pair: { primary: 'storm', secondary: null },
      manaDust: 0,
    });
    expect(chainsOf(res.profile).primary!.moves.map((m) => m.elements)).toEqual([
      ['storm'],
      ['storm'],
      ['storm'],
      ['storm'],
    ]);
```

Replace the lines from `const ring = { ...item('storm'), rarity: 'rare' as const }; // storm 2 beats the fire sword's 1` up to (not including) `const chains: Chains = {` with:

```ts
    // A legendary storm ring (3) beats the epic fire sword's 2; the sword carries all four chains.
    const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
    const ring = { ...item('storm'), rarity: 'legendary' as const };
    const { abilities: _abilities, ...v2 } = v3Of({
      ...p,
      equipped: { ...p.equipped, weapon, ring },
    });
    const res = parseDelveProfile(
      registry,
      json({ ...v2, version: 2, skillSlots: [null, null, null] }),
    )!;
    expect(res.profile).toMatchObject({ version: 6, pair: { primary: 'storm', secondary: null } });
    expect(chainsOf(res.profile)).toEqual(defaultChains(registry, 'storm', 'sword'));
    expect(res.fixed).toEqual([]);
    expect(res.profile.dive).toEqual(p.dive);
  });

  it("fixChainsToPair keeps the weapon's in-pair elements, gives an emptied move or a blow the primary, a fix each", () => {
```

Replace the lines from `...createDelveProfile(registry, 3),` up to (not including) `expect(fixed.basic).toEqual([chains.basic[0], { kind: 'heavy', element: 'fire' }]);` with:

```ts
      ...withChains(createDelveProfile(registry, 3), chains),
      pair: { primary: 'fire', secondary: 'storm' },
    };
    const res = fixChainsToPair(registry, p);
    const fixed = chainsOf(res.profile) as Chains;
```

Replace:

```ts
    expect(fixChainsToPair(res.profile)).toEqual({ profile: res.profile, fixed: [] });
  });
```

with:

```ts
    expect(fixChainsToPair(registry, res.profile)).toEqual({ profile: res.profile, fixed: [] });
    // Unarmed, nothing is stored to fit.
    const bare = { ...p, equipped: {} };
    expect(fixChainsToPair(registry, bare)).toEqual({ profile: bare, fixed: [] });
  });
```

Replace:

```ts
  it('chooseStartingMana: the primary, equipped gear re-attuned with its lines, default chains; once', () => {
    const p0 = fresh();
```

with:

```ts
  it("chooseStartingMana: the primary, equipped gear re-attuned with its lines, the weapon's moveset rebuilt; once", () => {
    const p0 = fresh();
```

Replace:

```ts
    expect(res.profile.chains).toEqual(defaultChains(registry, 'storm', 'sword'));
    expect(chooseStartingMana(registry, res.profile, 'fire')).toMatchObject({
```

with:

```ts
    const sword = res.profile.equipped.weapon!;
    expect(sword.moveset).toEqual(defaultMoveset(registry, sword, 'storm'));
    // A weapon with extra slots starts over at its base slots too.
    const roomy = withChains(p0, { primary: defaultChains(registry, 'fire', 'sword').primary });
    expect(roomy.equipped.weapon!.moveset!.slots.primary).toBe(4);
    const rebuilt = chooseStartingMana(registry, roomy, 'frost').profile.equipped.weapon!;
    expect(rebuilt.moveset).toEqual(defaultMoveset(registry, rebuilt, 'frost'));
    expect(chooseStartingMana(registry, res.profile, 'fire')).toMatchObject({
```

Replace the lines from `expect(res.profile.chains).toEqual(p.chains);` up to (not including) `expect(moves.map((m) => m.elements)).toEqual(moves.map(() => ['fire', 'nature']));` with:

```ts
    expect(res.profile.equipped).toEqual(p.equipped);
    expect(bindSecondary(registry, res.profile, 'nature').ok).toBe(false);
  });

  it("realign: charges Mana Dust and scrap, keeps the gear, fixes the equipped weapon's moves; refuses what it must", () => {
    const { realignDust, realignScrap } = bal.pair;
    const rich = bound(realignDust, realignScrap);
    const primary = chainsOf(rich).primary!;
    const fused = primary.moves.map((m) => ({ ...m, elements: ['fire', 'storm'] as ManaType[] }));
    const spare: GearItem = {
      ...withChains(rich, { primary: { ...primary, moves: fused } }).equipped.weapon!,
      uid: 'spare',
    };
    const stormy: DelveProfile = {
      ...withChains(rich, { primary: { ...primary, moves: fused } }),
      bag: [spare],
    };
    const res = realign(registry, stormy, { secondary: 'nature' });
    expect(res.ok).toBe(true);
    expect(res.profile).toMatchObject({
      pair: { primary: 'fire', secondary: 'nature' },
      manaDust: 0,
      scrap: 0,
    });
    const { weapon, ...rest } = res.profile.equipped;
    const { weapon: was, ...wasRest } = stormy.equipped;
    expect(rest).toEqual(wasRest);
    expect({ ...weapon, moveset: null }).toEqual({ ...was, moveset: null });
    // A bag weapon keeps its moves.
    expect(res.profile.bag).toEqual([spare]);
    // Storm's role (the secondary) goes to Nature: the fused moves stay fused.
    const moves = chainsOf(res.profile).primary!.moves;
```

Replace the lines from `const fused = rich.chains.primary.moves.map((m) => ({` up to (not including) `it('once an element leaves the pair, every element of every move and blow takes its old role', () => {` with:

```ts
    const chains = chainsOf(rich) as Pick<Chains, 'basic' | 'primary'>;
    const fused = chains.primary.moves.map((m) => ({
      ...m,
      elements: ['fire', 'storm'] as ManaType[],
    }));
    const basic = chains.basic.map((b, i, all) => ({
      ...b,
      element: (i === all.length - 1 ? 'storm' : 'fire') as ManaType,
    }));
    const p = withChains(rich, { basic, primary: { ...chains.primary, moves: fused } });
    const kinds = (els: ManaType[]) => els.join('+');
    const after = (next: { primary?: ManaType; secondary?: ManaType }) =>
      chainsOf(realign(registry, p, next).profile) as Pick<Chains, 'basic' | 'primary'>;
    // The secondary goes from Storm to Nature: Storm's moves and blows take Nature.
    const nature = after({ secondary: 'nature' });
    expect(nature.primary.moves.map((m) => kinds(m.elements))).toEqual(
      fused.map(() => 'fire+nature'),
    );
    expect(nature.basic.map((b) => b.element)).toEqual(
      basic.map((b) => (b.element === 'storm' ? 'nature' : 'fire')),
    );
    // The primary goes from Fire to Frost: Fire's take Frost.
    const frost = after({ primary: 'frost' });
    expect(frost.primary.moves.map((m) => kinds(m.elements))).toEqual(
      fused.map(() => 'frost+storm'),
    );
    expect(frost.basic.map((b) => b.element)).toEqual(
      basic.map((b) => (b.element === 'storm' ? 'storm' : 'frost')),
    );
    // An overtake swaps the two: nothing left the pair, so nothing changes.
    const over: DelveProfile = { ...p, pair: { primary: 'storm', secondary: 'fire' } };
    expect(fixChainsToPair(registry, over, p.pair)).toEqual({ profile: over, fixed: [] });
  });

```

Replace the lines from `...hero,` up to (not including) `/** Each move or blow reported: where it is, what it dropped, what it uses now. */` with:

```ts
      ...withChains(hero, { basic, primary: { moves, payment: 'mana' } }),
      pair: was,
    };
    const to = (primary: ManaType, secondary: ManaType) =>
      fixChainsToPair(registry, { ...p, pair: { primary, secondary } }, was);
    type Fixed = ReturnType<typeof to>;
    const elements = ({ profile }: Fixed) => ({
      basic: chainsOf(profile).basic!.map((b) => b.element),
      primary: chainsOf(profile).primary!.moves.map((m) => m.elements),
    });
```

Replace:

```ts
      ['defensive', 0, ['fire'], ['storm']],
      ['ultimate', 0, ['fire'], ['storm']],
    ]);
```

with:

```ts
    ]);
```

Replace:

```ts
      ['defensive', 0, ['fire'], ['frost']],
      ['ultimate', 0, ['fire'], ['frost']],
    ]);
```

with:

```ts
    ]);
```

Replace:

```ts
    expect(fixChainsToPair(swap, was)).toEqual({ profile: swap, fixed: [] });
  });
```

with:

```ts
    expect(fixChainsToPair(registry, swap, was)).toEqual({ profile: swap, fixed: [] });
  });
```

Replace the lines from `describe('nothing re-colours the moves on its own', () => {` up to (not including) `const stormGear = {` with:

```ts
describe("nothing re-colours a weapon's moves on its own", () => {
  /** A Fire+Storm sword hero: its sword's moves all Fire. */
  const hero = () =>
    bindSecondary(registry, createDelveProfile(registry, 3, { primary: 'fire' }), 'storm').profile;
  const built: Blow[] = [{ kind: 'heavy', element: 'fire' }];
  const maul: GearItem = { ...gear('storm', 'weapon', 'maul'), uid: 'maul' };
```

Replace the lines from `it('a weapon change keeps every move, unarmed too', () => {` up to (not including) `const worn = {` with:

```ts
  it("a weapon change: the new weapon's own moves; unarmed, the defaults on the pair", () => {
    const p = { ...hero(), bag: [maul] };
    const sword = chainsOf(p);
    const worn = equipItem(registry, p, 'maul');
    expect(chainsOf(worn)).toEqual(maul.moveset!.chains); // Storm: the maul's own mana
    const bare = unequipSlot(registry, worn, 'weapon');
    expect(chainsOf(bare)).toEqual(defaultMoveset(registry, UNARMED, 'fire').chains);
    expect(chainsOf(equipItem(registry, bare, p.equipped.weapon!.uid))).toEqual(sword);
  });

  it('a bind, an overtake and a re-attune leave every move as it is', () => {
    const solo = createDelveProfile(registry, 3, { primary: 'fire' });
    const bound = bindSecondary(registry, solo, 'storm').profile;
    expect(chainsOf(bound)).toEqual(chainsOf(solo));
    const own = withChains(bound, { basic: built });
    const over = resolveOvertake(registry, { ...own, equipped: { ...own.equipped, ...stormGear } });
    expect(over.swapped).toBe(true);
    expect(chainsOf(over.profile)).toEqual(chainsOf(own));
    // Re-attuning the sword to Storm changes its mana, not its moves.
    const sword = over.profile.equipped.weapon!;
    const cost = bal.pair.reattuneDust[sword.rarity];
    const re = reattuneItem(registry, { ...over.profile, manaDust: cost }, sword.uid, 'storm');
    expect(re.item!.mana).toBe('storm');
    expect(chainsOf(re.profile)).toEqual(chainsOf(own));
  });

  it("a realign maps the equipped weapon's every move by role, its default basic chain too, a notice each", () => {
    const { realignDust, realignScrap } = bal.pair;
    const p = { ...hero(), manaDust: realignDust, scrap: realignScrap };
    // Fire's role (the primary) goes to Storm.
    const res = realign(registry, p, { primary: 'storm', secondary: 'nature' });
    expect(chainsOf(res.profile).basic).toEqual(defaultBasic(registry, 'sword', 'storm'));
    expect(res.fixed!.filter((f) => f.skill === 'basic').map((f) => [f.index, f.removed])).toEqual([
      [0, ['fire']],
      [1, ['fire']],
      [2, ['fire']],
    ]);
    const swap = realign(registry, p, { primary: 'storm', secondary: 'fire' });
    expect(chainsOf(swap.profile)).toEqual(chainsOf(p));
    expect(swap.fixed).toEqual([]);
  });

  it('an off-pair move still strikes and reacts in its element, but draws no attunement power', () => {
    const k = bal.pair.basicPowerPerAttune;
    // A Fire hero whose sword's last blow is Frost (as a Frost drop's would be), wearing Frost.
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' }); // fire 2
    const basic: Blow[] = [
      { kind: 'light', element: 'fire' },
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'frost' },
    ];
    const p = withChains(p0, { basic });
```

Replace the lines from `/** A Fire+Storm sword hero on the default chains. */` up to (not including) `describe('real stats read the pair', () => {` with:

```ts
  /** A Fire+Storm sword hero: its sword's moves all Fire. */
  const hero = () =>
    bindSecondary(registry, createDelveProfile(registry, 3, { primary: 'fire' }), 'storm').profile;
  /** A ring powering `el`, of an element outside the pair (so no attunement). */
  const ring = (el: 'fire' | 'storm'): GearItem => ({
    ...item('earth', 'ring', [[`${el}Power` as HeroStatKey, 50]]),
    uid: el,
  });

  it("Power, Equip best and salvage go by the weapon's chains", () => {
    const h = hero();
    const { basic, primary } = defaultChains(registry, 'storm', 'sword');
    const stormy = withChains(h, { basic, primary });
    const wearing = (p: DelveProfile, r: GearItem): DelveProfile => ({
      ...p,
      equipped: { ...p.equipped, ring: r },
    });
    const power = (p: DelveProfile, r: GearItem) => profilePower(registry, wearing(p, r));
    expect(power(stormy, ring('storm'))).toBeGreaterThan(power(stormy, ring('fire')));
    expect(power(h, ring('fire'))).toBeGreaterThan(power(h, ring('storm')));
    const best = equipBest(registry, { ...stormy, bag: [ring('fire'), ring('storm')] });
    expect(best.equipped.map((i) => i.uid)).toEqual(['storm']);
    const withFire = { ...wearing(stormy, ring('fire')), bag: [ring('storm')] };
    expect(salvageCandidates(registry, withFire, 'common')).toEqual([]);
    const withStorm = { ...wearing(stormy, ring('storm')), bag: [ring('fire')] };
    expect(salvageCandidates(registry, withStorm, 'common')).toEqual(['fire']);
  });

  it('compareItem values a weapon with its own moveset', () => {
    const maul: GearItem = { ...gear('fire', 'weapon', 'maul'), uid: 'maul' };
    const built = setChain(registry, hero(), 'basic', [
      { kind: 'light', element: 'storm' },
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'fire' },
    ]);
    for (const q of [hero(), built]) {
      const bagged = { ...q, bag: [maul] };
      const cmp = compareItem(q.equipped, maul, registry, 1, q.pair);
      expect(cmp.power).toBe(profilePower(registry, bagged));
      expect(cmp.newPower).toBe(profilePower(registry, equipItem(registry, bagged, 'maul')));
    }
    // The maul fights with its own blows whatever the sword held.
    expect(compareItem(built.equipped, maul, registry, 1, built.pair).newPower).toBe(
      compareItem(hero().equipped, maul, registry, 1, built.pair).newPower,
    );
  });
});

```

Replace:

```ts
    expect(setChain(registry, withNature, 'primary', plague).chains.primary).toEqual(plague);
    expect(
      setChain(registry, createDelveProfile(registry, 3), 'primary', plague).chains.primary,
    ).toEqual(plague);
```

with:

```ts
    expect(chainsOf(setChain(registry, withNature, 'primary', plague)).primary).toEqual(plague);
    expect(
      chainsOf(setChain(registry, createDelveProfile(registry, 3), 'primary', plague)).primary,
    ).toEqual(plague);
```

Replace:

```ts
    ...new Set(p.chains.primary.moves.map((m) => m.elements.join('+'))),
  ];
```

with:

```ts
    ...new Set(chainsOf(p).primary!.moves.map((m) => m.elements.join('+'))),
  ];
```

In `packages/engine/tests/delve-chains.test.ts`:

Replace:

```ts
  bal,
  chainsWith,
```

with:

```ts
  asV5,
  bal,
  chainsOf,
  chainsWith,
```

Replace:

```ts
describe('save v5', () => {
  const json = (x: unknown) => JSON.parse(JSON.stringify(x));
  const hero = createDelveProfile(registry, 3, { primary: 'fire' });
  const migrate = (v4: object) => parseDelveProfile(registry, json(v4))!;
```

with:

```ts
describe('saves before version 6', () => {
  const json = (x: unknown) => JSON.parse(JSON.stringify(x));
  const hero = createDelveProfile(registry, 3, { primary: 'fire' });
  /** The hero on an epic sword, which carries all four chains. */
  const epic = {
    ...hero,
    equipped: { ...hero.equipped, weapon: { ...hero.equipped.weapon!, rarity: 'epic' as const } },
  };
  const migrate = (v4: object) => parseDelveProfile(registry, json(v4))!;
```

Replace the lines from `` expect(profile.chains.primary, `${build.form} ${build.weight}`).toEqual({ `` up to (not including) `const bound = { ...asV4(hero), pair: { primary: 'fire', secondary: 'storm' } };` with:

```ts
      expect(chainsOf(profile).primary, `${build.form} ${build.weight}`).toEqual({
        moves: kinds.map((kind) => ({ kind, form: build.form, elements: build.elements })),
        payment: build.payment,
      });
      expect(fixed).toEqual([]);
    }
    const { profile } = migrate(
      asV4(epic, {
        ...OLD_BUILDS,
        defensive: { form: 'armor', elements: ['fire'], weight: 2, payment: 'cast' },
        ultimate: { form: 'barrage', elements: ['fire'], weight: -1, payment: 'charge' },
      }),
    );
    expect(profile).toMatchObject({ version: 6, links: 0 });
    expect('abilities' in profile).toBe(false);
    expect('chainCaps' in profile).toBe(false);
    expect(chainsOf(profile).defensive).toEqual({
      moves: [{ kind: 'heavy', form: 'armor', elements: ['fire'] }],
      payment: 'cast',
    });
    expect(chainsOf(profile).ultimate).toEqual({
      moves: [{ kind: 'light', form: 'barrage', elements: ['fire'] }],
      payment: 'charge',
    });
  });

  it("v4 → v5 gives the weapon's default basics, the secondary last when bound; with no primary, the weapon's mana", () => {
    const blows = (v4: object) => chainsOf(migrate(v4).profile).basic!;
```

Replace:

```ts
  it('refuses a chain past MAX_CHAIN or empty, a form in the wrong slot, and a cap out of range', () => {
    const p = createDelveProfile(registry, 3);
    const bad = (x: object) => parseDelveProfile(registry, json(x));
    const bolt = p.chains.primary.moves[0];
```

with:

```ts
  it('refuses a version 5 chain past MAX_CHAIN or empty, a form in the wrong slot, and a cap out of range', () => {
    const p = asV5(createDelveProfile(registry, 3));
    const bad = (x: object) => parseDelveProfile(registry, json(x));
    expect(bad(p)).not.toBeNull();
    const bolt = p.chains.primary.moves[0];
```

In `packages/engine/tests/delve-dive.test.ts`:

Replace:

```ts
import type { GearItem } from '../src/types/gear.js';

```

with:

```ts
import type { GearItem } from '../src/types/gear.js';
import { chainsOf } from './fixtures/arena.js';

```

Replace the lines from `expect(p.version).toBe(5);` up to (not including) `expect(parseDelveProfile(registry, { ...p, version: 1 })).toBeNull();` with:

```ts
    expect(p.version).toBe(6);
    expect(p.links).toBe(0);
    expect(p.equipped.weapon?.mana).toBe('fire');
    expect(p.equipped.chest?.mana).toBe('earth');
    expect(chainsOf(p).primary!.moves.every((m) => m.elements.join() === 'fire')).toBe(true);
    expect(p.bag).toHaveLength(0);
    expect(p.dive).toBeNull();
  });

  it('round-trips through JSON and rejects garbage and old saves', () => {
    let p = createDelveProfile(registry, 1);
    p = startDive(registry, p, 1);
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))).toEqual({
      profile: p,
      fixed: [],
      dropped: [],
      movesetReset: false,
    });
```

Replace the lines from `it('unequip moves the item into the bag; the floor still has all three abilities', () => {` up to (not including) `]);` with:

```ts
  it("unequip moves the item into the bag; the floor has the common sword's Primary, and no Defensive or Ultimate", () => {
    let p = createDelveProfile(registry, 1);
    p = unequipSlot(registry, p, 'chest');
    expect(p.equipped.chest).toBeUndefined();
    expect(p.bag).toHaveLength(1);
    p = startDive(registry, p, 1);
    expect(beginFloor(registry, p).hero.chains.map((c) => c?.moves[0].name ?? null)).toEqual([
      'Fire Bolt',
      null,
      null,
```

In `packages/engine/tests/delve-profile-abilities.test.ts`:

Replace the lines from `import { createDelveProfile, parseDelveProfile, setChain } from '../src/delve/profile.js';` up to (not including) `expect(set({ ...ok, moves: [{ ...move, kind: 'huge' as never }] })).toThrow('Bad kind huge');` with:

```ts
import {
  createDelveProfile,
  parseDelveProfile,
  setChain,
  unequipSlot,
} from '../src/delve/profile.js';
import { startDive } from '../src/delve/dive.js';
import { defaultMoveset } from '../src/loot/moveset.js';
import type { Chain, Move } from '../src/types/ability.js';
import { asV4, chainsOf, withChains } from './fixtures/arena.js';

const registry = createDefaultRegistry();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('chains on the weapon (save v6)', () => {
  it("a new profile's sword carries its base moveset in the weapon's element", () => {
    const p = createDelveProfile(registry, 1);
    expect(p.version).toBe(6);
    const sword = p.equipped.weapon!;
    expect(sword.moveset).toEqual(defaultMoveset(registry, sword, 'fire'));
    expect(sword.moveset!.slots).toEqual({ basic: 3, primary: 1 });
  });

  it('setChain takes a valid chain for a skill the weapon carries, and it round-trips', () => {
    const chain: Chain = {
      moves: [
        { kind: 'light', form: 'burst', elements: ['fire', 'nature'] },
        { kind: 'hold', form: 'lance', elements: ['fire'] },
      ],
      payment: 'cast',
    };
    const roomy = withChains(createDelveProfile(registry, 1), { primary: chain });
    let p = setChain(registry, roomy, 'primary', chain);
    p = setChain(registry, p, 'basic', [{ kind: 'heavy', element: 'nature' }]);
    expect(chainsOf(p).primary).toEqual(chain);
    expect(chainsOf(p).basic).toEqual([{ kind: 'heavy', element: 'nature' }]);
    expect(p.equipped.weapon!.moveset!.slots).toEqual({ basic: 3, primary: 2 });
    expect(parseDelveProfile(registry, json(p))).toEqual({
      profile: p,
      fixed: [],
      dropped: [],
      movesetReset: false,
    });
  });

  it('setChain refuses no moves, more than the slots, an unknown kind, a form from another slot, bad elements or payment', () => {
    const fresh = createDelveProfile(registry, 1);
    const move: Move = { kind: 'medium', form: 'bolt', elements: ['fire'] };
    const ok: Chain = { moves: [move], payment: 'mana' };
    const p = withChains(fresh, {
      basic: Array(5).fill({ kind: 'light', element: 'fire' }),
      primary: { ...ok, moves: Array(5).fill(move) },
    });
    const set =
      (chain: Chain, profile = p) =>
      () =>
        setChain(registry, profile, 'primary', chain);
    expect(set(ok)).not.toThrow();
    expect(set({ ...ok, moves: [] })).toThrow('A chain holds 1 to 5 moves');
    expect(set({ ...ok, moves: Array(6).fill(move) })).toThrow('A chain holds 1 to 5 moves');
    expect(set({ ...ok, moves: [move, move] }, fresh)).toThrow('A chain holds 1 to 1 moves');
```

Replace:

```ts
    ).toThrow('Unknown element');
  });
```

with:

```ts
    ).toThrow('Unknown element');
    const ward: Chain = { moves: [{ ...move, form: 'ward' }], payment: 'mana' };
    expect(() => setChain(registry, p, 'defensive', ward)).toThrow(
      'Carried by magic weapons and better',
    );
    expect(set(ok, unequipSlot(registry, p, 'weapon'))).toThrow(
      'Equip a weapon to build your moves',
    );
  });
```

Replace the lines from `const frost = { ...p0.equipped.weapon!, mana: 'frost' as const };` up to (not including) `expect('skillSlots' in p!).toBe(false);` with:

```ts
    // An epic sword, which carries all four chains.
    const frost = { ...p0.equipped.weapon!, mana: 'frost' as const, rarity: 'epic' as const };
    const v2 = {
      ...rest,
      version: 2,
      scrap: 321,
      equipped: { ...p0.equipped, weapon: frost },
      skillSlots: ['fireball', null, null],
      reactionsSeen: ['melt'],
    };
    const p = parseDelveProfile(registry, json(v2))?.profile;
    expect(p).toBeDefined();
    expect(p!.version).toBe(6);
    expect(p!.scrap).toBe(321);
    expect(p!.equipped.weapon!.uid).toBe(p0.equipped.weapon!.uid);
    expect(chainsOf(p!)).toEqual(defaultChains(registry, 'frost', 'sword'));
```

In `packages/engine/tests/delve-reactions.test.ts`:

Replace:

```ts
      version: 5,
      reactionsSeen: ['melt', 'blight'],
```

with:

```ts
      version: 6,
      reactionsSeen: ['melt', 'blight'],
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts tests/delve-chains.test.ts tests/delve-dive.test.ts tests/delve-profile-abilities.test.ts tests/delve-reactions.test.ts)`
Expected: FAIL, 30 failed and 168 passed (198) in the five files: most with `(0 , heroChains) is not a function` or `(0 , withMoveset) is not a function` (the fixture's helpers import what Step 3 adds), the rest on the version (`expected 5 to be 6`, `expected { version: 5, … } to match object { version: 6, … }`), the parse result's new fields, and the floor's chains (`expected [ 'Fire Bolt', 'Fire Ward', …(1) ] to deeply equal [ 'Fire Bolt', null, null ]`).

## Chunk 5: Engine: save v6 (Task 4, part 2: the sources)

Task 4 continues (its tests are in Chunk 4).

- [ ] **Step 3: The chains move onto the weapon**

In `packages/engine/src/types/delve.ts`:

Replace:

```ts
import type { AbilitySlot, Chains, ChainSkill, MoveKind } from './ability.js';

```

with:

```ts
import type { AbilitySlot, ChainSkill, MoveKind } from './ability.js';

```

Replace:

```ts
  dustEarned: number;
  found: Record<Rarity, number>;
```

with:

```ts
  dustEarned: number;
  /** Links from weapons salvaged while banking this dive (auto-salvage, full bag). */
  linksEarned: number;
  found: Record<Rarity, number>;
```

Replace:

```ts
  version: 5;
  seed: number;
```

with:

```ts
  version: 6;
  seed: number;
```

Replace the lines from `/** The basic attack's and each ability slot's chain of moves (see the moves and chains spec). */` up to (not including) `/** Elemental reactions the player has triggered at least once. */` with:

```ts
  /** The hero's two elements. */
  pair: ManaPair;
  /** From salvaging gear outside the pair; spent on Re-attune, Realign and edits to a moveset. */
  manaDust: number;
  /** From salvaging weapons with extra slots; spent on a weapon's new slots (see the weapon movesets spec). */
  links: number;
```

In `packages/engine/src/delve/profile-schema.ts`:

Replace:

```ts
  dustEarned: z.number().int().min(0).default(0),
  found: PerRarityCount,
```

with:

```ts
  dustEarned: z.number().int().min(0).default(0),
  linksEarned: z.number().int().min(0).default(0),
  found: PerRarityCount,
```

Replace:

```ts
/** Version 5: each skill a chain of moves (see the moves and chains spec). */
export const DelveProfileSchema = DelveProfileV4Schema.omit({ abilities: true }).extend({
  version: z.literal(5),
```

with:

```ts
/** Version 5 (each skill a chain of moves on the profile), kept frozen so older saves migrate through it. */
export const DelveProfileV5Schema = DelveProfileV4Schema.omit({ abilities: true }).extend({
  version: z.literal(5),
```

Replace:

```ts

/** Version 2 saves had a spell bar instead of ability builds; they migrate through version 3. */
```

with:

```ts

/** Version 6: the chains live on the weapon, and Links (see the weapon movesets spec). */
export const DelveProfileSchema = DelveProfileV5Schema.omit({ chains: true, chainCaps: true }).extend({
  version: z.literal(6),
  links: z.number().int().min(0),
});

/** Version 2 saves had a spell bar instead of ability builds; they migrate through version 3. */
```

In `packages/engine/src/loot/moveset.ts`:

Replace:

```ts
import type { GearItem, Moveset, Rarity } from '../types/gear.js';
import { RARITY_ORDER } from '../types/gem.js';
```

with:

```ts
import type { ManaPair } from '../types/delve.js';
import type { EquippedGear, GearItem, Moveset, Rarity } from '../types/gear.js';
import { RARITY_ORDER } from '../types/gem.js';
```

Replace:

```ts
}

/** Each ability slot's default form and payment: a Bolt, a Ward and a charged Nova. */
```

with:

```ts
}

/** No weapon: it carries the basic chain and the Primary, at the hero's own string. */
export const UNARMED: MovesetOwner = { baseId: null, rarity: null };

/** Each ability slot's default form and payment: a Bolt, a Ward and a charged Nova. */
```

Replace:

```ts
  return RARITY_ORDER.find((r) => carries[r].includes(skill)) ?? null;
}
```

with:

```ts
  return RARITY_ORDER.find((r) => carries[r].includes(skill)) ?? null;
}

/**
 * Why a weapon can't hold `skill`: "Carried by magic weapons and better" (the
 * locked tab's text, and the ops' refusal). Only for a skill some rarity
 * doesn't carry (the balance's schema keeps `carries` growing with rarity).
 */
export function carriedByText(registry: DataRegistry, skill: ChainSkill): string {
  return `Carried by ${carriedFrom(registry, skill)} weapons and better`;
}
```

Append at the end of the file:

```ts
/**
 * The hero's chains: the equipped weapon's moveset's; unarmed, a default
 * moveset at base slots (never stored) in the pair's primary, or fire before
 * the choice. A skill the weapon doesn't carry has no chain.
 */
export function heroChains(
  registry: DataRegistry,
  equipped: EquippedGear,
  pair: ManaPair,
): Partial<Chains> {
  const weapon = equipped.weapon;
  if (weapon) return movesetOf(registry, weapon).chains;
  return defaultMoveset(registry, UNARMED, pair.primary ?? 'fire').chains;
}
```

In `packages/engine/src/delve/profile.ts`:

Replace:

```ts
import type { EquippedGear, GearItem, GearSlot, Rarity } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';
```

with:

```ts
import type { EquippedGear, GearItem, GearSlot, Moveset, Rarity } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';
```

Replace the lines from `} from './profile-schema.js';` up to (not including) `MOVE_KINDS,` with:

```ts
  DelveProfileV5Schema,
} from './profile-schema.js';
import { chooseStartingMana, fixChainsToPair, inPair, salvageDust, type ChainFix } from './pair.js';
import { defaultBasic, defaultChains } from '../arpg/abilities/resolve.js';
import { baseSlots, carriedByText, movesetOf } from '../loot/moveset.js';
import {
  ABILITY_PAYMENTS,
  ABILITY_SLOTS,
  CHAIN_SKILLS,
```

Replace:

```ts
    version: 5,
    seed: seed | 0,
```

with:

```ts
    version: 6,
    seed: seed | 0,
```

Replace the lines from `chains: defaultChains(registry, weapon.mana, weapon.baseId),` up to (not including) `export function setChain<S extends ChainSkill>(` with:

```ts
    pair: { primary: null, secondary: null },
    manaDust: 0,
    links: 0,
    reactionsSeen: [],
    dive: null,
  };
  return opts.primary ? chooseStartingMana(registry, profile, opts.primary).profile : profile;
}

/** `profile` with its equipped weapon's moveset replaced (it has a weapon). */
export function withMoveset(profile: DelveProfile, moveset: Moveset): DelveProfile {
  const weapon = profile.equipped.weapon!;
  return { ...profile, equipped: { ...profile.equipped, weapon: { ...weapon, moveset } } };
}

/**
 * Set one skill's chain on the equipped weapon. Throws mid-dive, unarmed, for
 * a skill the weapon doesn't carry, and on fewer than one move or more than
 * the chain's slots, an unknown kind, a form from another slot, anything but
 * one or two different elements (a blow: one), an element outside the pair
 * (once there is one), or an unknown payment.
 */
```

Replace the lines from `const blows = skill === 'basic' ? (chain as Blow[]) : null;` up to (not including) `const STRENGTH: MoveKind[] = ['light', 'medium', 'heavy'];` with:

```ts
  const weapon = profile.equipped.weapon;
  if (!weapon) throw new Error('Equip a weapon to build your moves');
  const moveset = movesetOf(registry, weapon);
  const cap = moveset.slots[skill];
  if (cap === undefined) throw new Error(carriedByText(registry, skill));
  const blows = skill === 'basic' ? (chain as Blow[]) : null;
  const moves = blows ?? (chain as Chain).moves;
  if (moves.length < 1 || moves.length > cap) throw new Error(`A chain holds 1 to ${cap} moves`);
  const elements = (els: ManaType[]) => {
    if (els.length < 1 || els.length > 2 || new Set(els).size !== els.length)
      throw new Error('Pick one or two different elements');
    if (!els.every((e) => e in registry.getArpgData().mana)) throw new Error('Unknown element');
    if (!els.every((e) => inPair(profile, e))) throw new Error('Pick from your two elements');
  };
  for (const m of moves) if (!MOVE_KINDS.includes(m.kind)) throw new Error(`Bad kind ${m.kind}`);
  const set = (next: Chains[ChainSkill]) =>
    withMoveset(profile, { ...moveset, chains: { ...moveset.chains, [skill]: next } });
  if (blows) {
    for (const b of blows) elements([b.element]);
    return set(blows.map((b) => ({ ...b })));
  }
  const { payment } = chain as Chain;
  for (const m of (chain as Chain).moves) {
    const form = registry.getForm(m.form);
    if (form.slot !== skill) throw new Error(`${form.name} is not a ${skill} form`);
    elements(m.elements);
  }
  if (!ABILITY_PAYMENTS.includes(payment)) throw new Error(`Bad payment ${payment}`);
  const copy = (chain as Chain).moves.map((m) => ({ ...m, elements: [...m.elements] }));
  return set({ moves: copy, payment });
}

```

Replace:

```ts
/** A save read back: the profile, and the moves a migration changed (a fix each). */
export interface ParsedDelveProfile {
  profile: DelveProfile;
  fixed: ChainFix[];
}
```

with:

```ts
/** A save read back: the profile, and what a migration changed. */
export interface ParsedDelveProfile {
  profile: DelveProfile;
  /** The moves a migration fixed to the pair, a fix each. */
  fixed: ChainFix[];
  /** The chains the migration to version 6 dropped: the equipped weapon's rarity doesn't carry them. */
  dropped: ChainSkill[];
  /** An unarmed save's built chains were reset to the unarmed defaults (no weapon holds them). */
  movesetReset: boolean;
}

/** A version 5 save, as its frozen schema reads it. */
type ProfileV5 = Omit<DelveProfile, 'version' | 'links'> & {
  version: 5;
  chains: Chains;
  chainCaps: Record<ChainSkill, number>;
};

/** Every weapon's moveset: a weapon without one gets its base defaults in its own mana. */
function fitMovesets(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const fit = (item: GearItem): GearItem =>
    item.slot === 'weapon' ? { ...item, moveset: movesetOf(registry, item) } : item;
  const equipped: EquippedGear = {};
  for (const slot of GEAR_SLOTS) {
    const item = profile.equipped[slot];
    if (item) equipped[slot] = fit(item);
  }
  return { ...profile, equipped, bag: profile.bag.map(fit) };
}

/** A chain's length: its blows or its moves. */
function chainLength(chain: Chains[ChainSkill]): number {
  return Array.isArray(chain) ? chain.length : chain.moves.length;
}

/**
 * A version 5 save as version 6: the equipped weapon takes the profile's
 * chains, each at slots of its length (at least its base); every other weapon
 * gets its base defaults. An unarmed save keeps no chains: the unarmed
 * defaults follow the pair.
 */
function fromV5(registry: DataRegistry, old: ProfileV5): ParsedDelveProfile {
  const { chains, chainCaps: _caps, ...rest } = old;
  const weapon = old.equipped.weapon;
  let equipped = old.equipped;
  if (weapon) {
    const slots = (skill: ChainSkill) =>
      Math.max(chainLength(chains[skill]), baseSlots(registry, weapon.baseId, skill));
    const moveset: Moveset = {
      chains,
      slots: Object.fromEntries(CHAIN_SKILLS.map((s) => [s, slots(s)])),
    };
    equipped = { ...equipped, weapon: { ...weapon, moveset } };
  }
  const profile = fitMovesets(registry, { ...rest, version: 6, links: 0, equipped });
  return { profile, fixed: [], dropped: [], movesetReset: false };
}
```

Replace the lines from `* Validate an unknown JSON blob as a save, migrating older ones (2 → 3 → 4 → 5).` up to (not including) `const v4 = DelveProfileV4Schema.safeParse(raw);` with:

```ts
 * Validate an unknown JSON blob as a save, migrating older ones (2 → 3 → 4 →
 * 5 → 6), and fit every weapon's moveset to the data (`fitMovesets`). To 4:
 * a primary from the gear, no secondary, no Mana Dust. To 5: each build its
 * form's default chain shifted by its weight (`chainFromBuild`) and the
 * weapon's default basic chain on the pair. To 6: the chains move onto the
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
  const v5 = DelveProfileV5Schema.safeParse(raw);
  if (v5.success) return fromV5(registry, v5.data as ProfileV5);
```

Replace the lines from `return fixChainsToPair({` up to (not including) `` /** A version 3 or 2 save as version 4 (see `parseDelveProfile`); version 2 has no builds. */ `` with:

```ts
  const res = fromV5(registry, {
    ...rest,
    version: 5,
    chains,
    chainCaps: { ...registry.getDelveBalance().chains.cap },
  } as ProfileV5);
  const { profile, fixed } = fixChainsToPair(registry, res.profile);
  return { ...res, profile, fixed };
}

```

Replace the lines from `return heroPower(` up to (not including) `export function findItem(` with:

```ts
  return heroPower(profile.equipped, registry, referenceDepth(profile), profile.pair);
}

```

Replace:

```ts
/** Equip a bag item. */
export function equipItem(
```

with:

```ts
/** Equip a bag item; a weapon brings its own moveset. */
export function equipItem(
```

Replace:

```ts
/** Unequip into the bag. */
export function unequipSlot(
```

with:

```ts
/** Unequip into the bag (a weapon keeps its moveset). */
export function unequipSlot(
```

Replace the lines from `compareItem(profile.equipped, item, registry, depth, profile.chains, profile.pair)` up to (not including) `export function equipBest(` with:

```ts
        compareItem(profile.equipped, item, registry, depth, profile.pair).powerPct <= 0,
    )
    .map((i) => i.uid);
}

/** Greedily equip any bag item that raises Power (a weapon with its own moveset). */
```

In `packages/engine/src/delve/pair.ts`:

Replace the lines from `import { defaultChains, roleHeir } from '../arpg/abilities/resolve.js';` up to (not including) `` * Elemental affinity: the hero's two elements (`profile.pair`). The primary is `` with:

```ts
import { roleHeir } from '../arpg/abilities/resolve.js';
import { defaultMoveset, heroChains, movesetOf } from '../loot/moveset.js';
import { ABILITY_SLOTS, type Blow, type ChainSkill, type Move } from '../types/ability.js';
import type { DelveProfile, HeroStats, ManaPair } from '../types/delve.js';
import { GEAR_SLOTS, type GearItem, type HeroStatKey, type StatRoll } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { isDiveActive } from './dive.js';
import { computeHeroStats, pairElements, pairExtra } from './hero-stats.js';
import { findItem, replaceItem, withMoveset, type ProfileActionResult } from './profile.js';

/**
```

Replace the lines from `/** The hero's real stats: its gear, with its basic chain, the pair's power and the two-element limit. */` up to (not including) `` * (`roleHeir`): the old primary's the new primary, the old secondary's the new `` with:

```ts
/** The hero's real stats: its gear, with its weapon's basic chain, the pair's power and the two-element limit. */
export function profileStats(
  registry: DataRegistry,
  profile: Pick<DelveProfile, 'equipped' | 'pair'>,
): HeroStats {
  const basic = heroChains(registry, profile.equipped, profile.pair).basic;
  return computeHeroStats(profile.equipped, registry, pairExtra(profile.pair, basic));
}

/** Mana Dust from salvaging `item`: its rarity's share when its mana is outside the pair (none before the choice). */
export function salvageDust(registry: DataRegistry, item: GearItem, pair: ManaPair): number {
  return inPair({ pair }, item.mana) ? 0 : registry.getDelveBalance().pair.salvageDust[item.rarity];
}

/**
 * Fit the equipped weapon's every move and blow to the pair (bag weapons stay
 * as they are; unarmed, nothing is stored to fit). After a pair op (`was`, the
 * pair before it) that replaced an element, every element takes its old role's new element
```

Replace the lines from `export function fixChainsToPair(` up to (not including) `const elements = fit(old.elements);` with:

```ts
export function fixChainsToPair(
  registry: DataRegistry,
  profile: DelveProfile,
  was?: ManaPair,
): { profile: DelveProfile; fixed: ChainFix[] } {
  const { primary, secondary } = profile.pair;
  const weapon = profile.equipped.weapon;
  if (!primary || !weapon) return { profile, fixed: [] };
  const byRole = was ? roleHeir(was, { primary, secondary }) : null;
  const heir = (e: ManaType): ManaType | null =>
    byRole ? byRole(e) : inPair(profile, e) ? e : null;
  /** Each element's heir, each once; none left: the primary. */
  const fit = (els: ManaType[]): ManaType[] => {
    const out = [...new Set(els.map(heir).filter((e): e is ManaType => e !== null))];
    return out.length > 0 ? out : [primary];
  };
  const fixed: ChainFix[] = [];
  const moveset = movesetOf(registry, weapon);
  const chains = { ...moveset.chains };
  chains.basic = chains.basic?.map((blow, index) => {
    const [element] = fit([blow.element]);
    if (element === blow.element) return blow;
    const move = { ...blow, element };
    fixed.push({ skill: 'basic', index, removed: [blow.element], move });
    return move;
  });
  for (const slot of ABILITY_SLOTS) {
    const chain = chains[slot];
    if (!chain) continue;
    const moves = chain.moves.map((old, index) => {
```

Replace:

```ts
    chains[slot] = { ...chains[slot], moves };
  }
  return { profile: fixed.length > 0 ? { ...profile, chains } : profile, fixed };
}
```

with:

```ts
    chains[slot] = { ...chain, moves };
  }
  if (fixed.length === 0) return { profile, fixed };
  return { profile: withMoveset(profile, { ...moveset, chains }), fixed };
}
```

Replace:

```ts
 * re-attuned to it for free (the bag is left alone), and the chains start
 * over from `defaultChains` in it. Allowed mid-dive (a migrated save may be).
 */
```

with:

```ts
 * re-attuned to it for free (the bag is left alone), and the equipped
 * weapon's moveset starts over at its base slots, every move the default in
 * it. Allowed mid-dive (a migrated save may be).
 */
```

Replace the lines from `if (item && item.mana !== mana) equipped[slot] = attuneTo(item, mana);` up to (not including) `/** Bind a second element: free, once, between dives. Every move keeps its elements. */` with:

```ts
    if (item && item.mana !== mana) equipped[slot] = attuneTo(item, mana);
  }
  const weapon = equipped.weapon;
  if (weapon) equipped.weapon = { ...weapon, moveset: defaultMoveset(registry, weapon, mana) };
  return { ok: true, profile: { ...profile, equipped, pair: { primary: mana, secondary: null } } };
}

```

Replace:

```ts
 * between dives. Gear stays as it is; the chains follow the new pair
 * (`fixChainsToPair`): once an element is replaced, every move and blow takes
 * its elements' roles' new elements, and each one changed comes back in
 * `fixed`.
 */
```

with:

```ts
 * between dives. Gear stays as it is; the equipped weapon's moves follow the
 * new pair (`fixChainsToPair`): once an element is replaced, every move and
 * blow takes its elements' roles' new elements, and each one changed comes
 * back in `fixed`. Bag weapons keep their moves.
 */
```

Replace:

```ts
  const res = fixChainsToPair(
    {
```

with:

```ts
  const res = fixChainsToPair(
    registry,
    {
```

Replace:

```ts
  profile: Pick<DelveProfile, 'equipped' | 'pair' | 'chains'>,
): { have: number; need: number; ready: boolean } {
```

with:

```ts
  profile: Pick<DelveProfile, 'equipped' | 'pair'>,
): { have: number; need: number; ready: boolean } {
```

In `packages/engine/src/delve/hero-stats.ts`:

Replace:

```ts
} from '../arpg/abilities/resolve.js';
import type { DelveBalance, HeroStats, HeroWeapon, ManaPair } from '../types/delve.js';
```

with:

```ts
} from '../arpg/abilities/resolve.js';
import { heroChains } from '../loot/moveset.js';
import type { DelveBalance, HeroStats, HeroWeapon, ManaPair } from '../types/delve.js';
```

Replace the lines from `` /** How equipping `item` (in its slot) would change the hero, with the same chains. */ `` up to (not including) `const attunementDelta: Partial<ManaMap> = {};` with:

```ts
/** No pair: before the choice, or a caller that counts every element. */
const NO_PAIR: ManaPair = { primary: null, secondary: null };

/** A loadout's stats and combat estimate, with the chains its weapon carries (`heroChains`). */
function estimateLoadout(
  equipped: EquippedGear,
  registry: DataRegistry,
  depth: number,
  pair: ManaPair | undefined,
): { stats: HeroStats; estimate: CombatEstimate } {
  const chains = heroChains(registry, equipped, pair ?? NO_PAIR);
  const stats = computeHeroStats(equipped, registry, pairExtra(pair, chains.basic));
  return { stats, estimate: estimateCombat(stats, registry, depth, chains) };
}

/**
 * How equipping `item` (in its slot) would change the hero: a weapon fights
 * with its own moveset.
 */
export function compareItem(
  equipped: EquippedGear,
  item: GearItem,
  registry: DataRegistry,
  depth: number,
  /** The hero's pair (its basics and the two-element limit); none counts every element. */
  pair?: ManaPair,
): ItemComparison {
  const replaced = equipped[item.slot];
  const next = { ...equipped, [item.slot]: item };
  const { stats: beforeStats, estimate: before } = estimateLoadout(equipped, registry, depth, pair);
  const { stats: afterStats, estimate: after } = estimateLoadout(next, registry, depth, pair);

```

Replace the lines from `/** Total hero Power for a loadout at a depth. */` to the end of the file with:

```ts
/** Total hero Power for a loadout at a depth, with the chains its weapon carries. */
export function heroPower(
  equipped: EquippedGear,
  registry: DataRegistry,
  depth: number,
  /** The hero's pair (its basics and the two-element limit); none counts every element. */
  pair?: ManaPair,
): number {
  return estimateLoadout(equipped, registry, depth, pair).estimate.power;
}
```

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
import { profileStats } from './pair.js';
import { pairElements } from './hero-stats.js';
```

with:

```ts
import { profileStats } from './pair.js';
import { heroChains } from '../loot/moveset.js';
import { pairElements } from './hero-stats.js';
```

Replace:

```ts
    dustEarned: 0,
    found: Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>,
```

with:

```ts
    dustEarned: 0,
    linksEarned: 0,
    found: Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>,
```

Replace:

```ts
    chains: profile.chains,
    heroHpFrac: dive.heroHpFrac,
```

with:

```ts
    chains: heroChains(registry, profile.equipped, profile.pair),
    heroHpFrac: dive.heroHpFrac,
```

In `packages/engine/src/delve/autopilot.ts`:

Replace:

```ts
import { compareItem, itemAttunement } from './hero-stats.js';
import { bindSecondary, profileStats, resolveOvertake } from './pair.js';
```

with:

```ts
import { compareItem, itemAttunement } from './hero-stats.js';
import { heroChains } from '../loot/moveset.js';
import { bindSecondary, profileStats, resolveOvertake } from './pair.js';
```

Replace:

```ts
        refreshWorldHero(registry, world, profileStats(registry, p), p.chains);
      }
```

with:

```ts
        refreshWorldHero(registry, world, profileStats(registry, p), heroChains(registry, p.equipped, p.pair));
      }
```

Replace the lines from `* Build every move of the Primary chain from both elements of a bound pair,` up to (not including) `export function betweenDives(registry: DataRegistry, profile: DelveProfile): DelveProfile {` with:

```ts
 * Build every move of the weapon's Primary chain from both elements of a
 * bound pair, so it keeps finding their reaction.
 */
function fusePrimary(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const { primary, secondary } = p.pair;
  const chain = heroChains(registry, p.equipped, p.pair).primary;
  if (!primary || !secondary || !chain || !p.equipped.weapon) return p;
  return setChain(registry, p, 'primary', {
    ...chain,
    moves: chain.moves.map((m) => ({ ...m, elements: [primary, secondary] })),
  });
}

/**
 * Between dives, as a player would: an overtaking secondary swaps in, a second
 * element is bound (before anything is salvaged), the forge visit, and then
 * the Primary of whatever weapon it wields is built from both elements.
 */
```

Replace:

```ts
          compareItem(p.equipped, i, registry, depth, p.chains, p.pair).powerPct <= 0,
      );
```

with:

```ts
          compareItem(p.equipped, i, registry, depth, p.pair).powerPct <= 0,
      );
```

In `packages/engine/src/index.ts`:

Replace:

```ts
export {
  GearItemSchema,
```

with:

```ts
export {
  heroChains,
  movesetOf,
  defaultMoveset,
  extraSlots,
  baseSlots,
  carriedSkills,
  carriedByText,
} from './loot/moveset.js';
export {
  GearItemSchema,
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts tests/delve-chains.test.ts tests/delve-dive.test.ts tests/delve-profile-abilities.test.ts tests/delve-reactions.test.ts)`
Expected: PASS, 198 tests in 5 files.

- [ ] **Step 5: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1374 tests pass in 77 files. The pacing rails hold (a new hero now starts with a common sword's Basic chain and one-move Primary, and no Defensive or Ultimate): Task 12 prints the numbers.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx prettier --write src/types/delve.ts src/loot/moveset.ts src/delve/profile.ts src/delve/pair.ts src/delve/hero-stats.ts src/index.ts tests/fixtures/arena.ts tests/delve-pair.test.ts tests/delve-chains.test.ts tests/delve-dive.test.ts tests/delve-profile-abilities.test.ts tests/delve-reactions.test.ts)
git add packages/engine/src/types/delve.ts packages/engine/src/delve/profile-schema.ts packages/engine/src/loot/moveset.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/pair.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/delve/dive.ts packages/engine/src/delve/autopilot.ts packages/engine/src/index.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-profile-abilities.test.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): the chains live on the weapon: save v6, heroChains, Links on the profile" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 6: Engine: the migration's rules

### Task 5: The migration keeps what the weapon can carry, and fits every weapon at load

The spec's migration rules, over Task 4's plain one:
- **The equipped weapon keeps only the chains its rarity carries** (`fromV5`): a chain it can't carry is dropped, its moves past one slot (past its base) come back as Links, and `ParsedDelveProfile.dropped` names it for the toast.
- **An unarmed save with built chains** (chains that differ from the version 5 defaults on its pair) resets to the unarmed defaults, and `movesetReset` says so.
- **Every load fits every weapon to the data** (`fitMovesets`, equipped and bag): a weapon without a moveset gets its base defaults in its own mana; a chain its rarity no longer carries is dropped; a newly carried one gets its base default; a basic slot count below its weapon's string rises to it.
- A version 4 or older save still converts through version 5's shape, then to version 6, and only then is fixed to the pair: a move of a dropped chain gets no fix notice.

The tests read five real version 5 saves, made by the v0.48.0 engine with the scratchpad's `v5-saves.mjs` (its text is in Task 12): a new hero; a bound Fire+Storm hero with a built two-move cast Lance Primary and a rare axe in the bag; an unarmed hero with a built Primary; a magic dagger mid-dive whose Ultimate has two moves; and an epic maul whose basic chain is one blow.

**Files:**
- Create: `packages/engine/tests/fixtures/delve-v5-saves.json` (never format)
- Modify: `packages/engine/src/delve/profile.ts:29,211,230` (imports, `fitMovesets`, `fromV5`)
- Modify: `packages/engine/tests/delve-movesets.test.ts` (imports, and a new block at the end)

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/tests/fixtures/delve-v5-saves.json`:

```json
{
  "fresh": {"version":5,"seed":11,"diveCount":0,"forgeCount":0,"nextUid":2,"equipped":{"weapon":{"uid":"g0","slot":"weapon","baseId":"sword","rarity":"common","mana":"fire","ilvl":1,"name":"Rusty Sword","implicits":[{"stat":"damage","value":7,"roll":0.4399310755543411}],"affixes":[],"upgrade":0,"reforges":0,"locked":false},"chest":{"uid":"g1","slot":"chest","baseId":"cuirass","rarity":"common","mana":"fire","ilvl":1,"name":"Rusty Cuirass","implicits":[{"stat":"armor","value":9,"roll":0.24390670098364353},{"stat":"maxHp","value":23,"roll":0.0753525288309902}],"affixes":[],"upgrade":0,"reforges":0,"locked":false}},"bag":[],"scrap":0,"bestDepth":0,"checkpoints":[],"codex":{},"stats":{"kills":0,"dives":0,"deaths":0,"extracts":0,"bossKills":0,"scrapEarned":0,"itemsFound":{"common":0,"uncommon":0,"magic":0,"rare":0,"epic":0,"legendary":0}},"pity":0,"firstBossLegendaryGiven":false,"autoSalvage":{"common":false,"uncommon":false,"magic":false,"rare":false,"epic":false,"legendary":false},"chains":{"basic":[{"kind":"light","element":"fire"},{"kind":"light","element":"fire"},{"kind":"heavy","element":"fire"}],"primary":{"moves":[{"kind":"light","form":"bolt","elements":["fire"]},{"kind":"medium","form":"bolt","elements":["fire"]},{"kind":"medium","form":"bolt","elements":["fire"]},{"kind":"heavy","form":"bolt","elements":["fire"]}],"payment":"mana"},"defensive":{"moves":[{"kind":"medium","form":"ward","elements":["fire"]}],"payment":"mana"},"ultimate":{"moves":[{"kind":"medium","form":"nova","elements":["fire"]}],"payment":"charge"}},"chainCaps":{"basic":5,"primary":5,"defensive":5,"ultimate":5},"pair":{"primary":"fire","secondary":null},"manaDust":0,"reactionsSeen":[],"dive":null},
  "bound": {"version":5,"seed":11,"diveCount":0,"forgeCount":0,"nextUid":8,"equipped":{"weapon":{"uid":"g0","slot":"weapon","baseId":"sword","rarity":"common","mana":"fire","ilvl":1,"name":"Rusty Sword","implicits":[{"stat":"damage","value":7,"roll":0.4399310755543411}],"affixes":[],"upgrade":0,"reforges":0,"locked":false},"chest":{"uid":"g1","slot":"chest","baseId":"cuirass","rarity":"common","mana":"fire","ilvl":1,"name":"Rusty Cuirass","implicits":[{"stat":"armor","value":9,"roll":0.24390670098364353},{"stat":"maxHp","value":23,"roll":0.0753525288309902}],"affixes":[],"upgrade":0,"reforges":0,"locked":false}},"bag":[{"uid":"g7","slot":"weapon","baseId":"axe","rarity":"rare","mana":"frost","ilvl":4,"name":"Sun Bite","implicits":[{"stat":"damage","value":18,"roll":0.4273379426449537},{"stat":"critDamage","value":32,"roll":0.2724201614037156}],"affixes":[{"stat":"attackSpeedPct","value":10,"roll":0.9556787597713992},{"stat":"lifesteal","value":2.5,"roll":0.4895045823883265},{"stat":"damagePct","value":16,"roll":0.7150358320213854}],"upgrade":0,"reforges":0,"locked":false}],"scrap":0,"bestDepth":0,"checkpoints":[],"codex":{},"stats":{"kills":0,"dives":3,"deaths":0,"extracts":0,"bossKills":0,"scrapEarned":0,"itemsFound":{"common":0,"uncommon":0,"magic":0,"rare":0,"epic":0,"legendary":0}},"pity":0,"firstBossLegendaryGiven":false,"autoSalvage":{"common":false,"uncommon":false,"magic":false,"rare":false,"epic":false,"legendary":false},"chains":{"basic":[{"kind":"light","element":"fire"},{"kind":"light","element":"fire"},{"kind":"heavy","element":"storm"}],"primary":{"moves":[{"kind":"light","form":"lance","elements":["fire","storm"]},{"kind":"heavy","form":"lance","elements":["storm"]}],"payment":"cast"},"defensive":{"moves":[{"kind":"medium","form":"ward","elements":["fire"]}],"payment":"mana"},"ultimate":{"moves":[{"kind":"medium","form":"nova","elements":["fire"]}],"payment":"charge"}},"chainCaps":{"basic":5,"primary":5,"defensive":5,"ultimate":5},"pair":{"primary":"fire","secondary":"storm"},"manaDust":0,"reactionsSeen":[],"dive":null},
  "unarmed": {"version":5,"seed":11,"diveCount":0,"forgeCount":0,"nextUid":2,"equipped":{"chest":{"uid":"g1","slot":"chest","baseId":"cuirass","rarity":"common","mana":"fire","ilvl":1,"name":"Rusty Cuirass","implicits":[{"stat":"armor","value":9,"roll":0.24390670098364353},{"stat":"maxHp","value":23,"roll":0.0753525288309902}],"affixes":[],"upgrade":0,"reforges":0,"locked":false}},"bag":[{"uid":"g0","slot":"weapon","baseId":"sword","rarity":"common","mana":"fire","ilvl":1,"name":"Rusty Sword","implicits":[{"stat":"damage","value":7,"roll":0.4399310755543411}],"affixes":[],"upgrade":0,"reforges":0,"locked":false}],"scrap":0,"bestDepth":0,"checkpoints":[],"codex":{},"stats":{"kills":0,"dives":0,"deaths":0,"extracts":0,"bossKills":0,"scrapEarned":0,"itemsFound":{"common":0,"uncommon":0,"magic":0,"rare":0,"epic":0,"legendary":0}},"pity":0,"firstBossLegendaryGiven":false,"autoSalvage":{"common":false,"uncommon":false,"magic":false,"rare":false,"epic":false,"legendary":false},"chains":{"basic":[{"kind":"light","element":"fire"},{"kind":"light","element":"fire"},{"kind":"heavy","element":"fire"}],"primary":{"moves":[{"kind":"heavy","form":"burst","elements":["fire"]}],"payment":"mana"},"defensive":{"moves":[{"kind":"medium","form":"ward","elements":["fire"]}],"payment":"mana"},"ultimate":{"moves":[{"kind":"medium","form":"nova","elements":["fire"]}],"payment":"charge"}},"chainCaps":{"basic":5,"primary":5,"defensive":5,"ultimate":5},"pair":{"primary":"fire","secondary":null},"manaDust":0,"reactionsSeen":[],"dive":null},
  "magic": {"version":5,"seed":11,"diveCount":1,"forgeCount":0,"nextUid":9,"equipped":{"weapon":{"uid":"g8","slot":"weapon","baseId":"dagger","rarity":"magic","mana":"fire","ilvl":4,"name":"Rusty Dagger","implicits":[{"stat":"damage","value":9,"roll":0.9094794979318976},{"stat":"critChance","value":6,"roll":0.1177682732231915}],"affixes":[{"stat":"frostAttune","value":1,"roll":0.4077661791816354},{"stat":"stormAttune","value":2,"roll":0.6459206091240048}],"upgrade":0,"reforges":0,"locked":false},"chest":{"uid":"g1","slot":"chest","baseId":"cuirass","rarity":"common","mana":"fire","ilvl":1,"name":"Rusty Cuirass","implicits":[{"stat":"armor","value":9,"roll":0.24390670098364353},{"stat":"maxHp","value":23,"roll":0.0753525288309902}],"affixes":[],"upgrade":0,"reforges":0,"locked":false}},"bag":[],"scrap":0,"bestDepth":1,"checkpoints":[],"codex":{},"stats":{"kills":0,"dives":1,"deaths":0,"extracts":0,"bossKills":0,"scrapEarned":0,"itemsFound":{"common":0,"uncommon":0,"magic":0,"rare":0,"epic":0,"legendary":0}},"pity":0,"firstBossLegendaryGiven":false,"autoSalvage":{"common":false,"uncommon":false,"magic":false,"rare":false,"epic":false,"legendary":false},"chains":{"basic":[{"kind":"light","element":"fire"},{"kind":"light","element":"fire"},{"kind":"heavy","element":"fire"}],"primary":{"moves":[{"kind":"light","form":"bolt","elements":["fire"]},{"kind":"medium","form":"bolt","elements":["fire"]},{"kind":"medium","form":"bolt","elements":["fire"]},{"kind":"heavy","form":"bolt","elements":["fire"]}],"payment":"mana"},"defensive":{"moves":[{"kind":"medium","form":"ward","elements":["fire"]}],"payment":"mana"},"ultimate":{"moves":[{"kind":"medium","form":"barrage","elements":["fire"]},{"kind":"hold","form":"nova","elements":["fire"]}],"payment":"charge"}},"chainCaps":{"basic":5,"primary":5,"defensive":5,"ultimate":5},"pair":{"primary":"fire","secondary":null},"manaDust":0,"reactionsSeen":[],"dive":{"seed":1862841992,"startDepth":1,"depth":1,"heroHpFrac":1,"potions":3,"phoenixUsed":false,"door":null,"doorChoices":[],"phase":"fighting","bounty":0,"kills":0,"depthsCleared":0,"scrapEarned":0,"dustEarned":0,"found":{"common":0,"uncommon":0,"magic":0,"rare":0,"epic":0,"legendary":0},"bestFind":null}},
  "epic": {"version":5,"seed":11,"diveCount":0,"forgeCount":0,"nextUid":10,"equipped":{"weapon":{"uid":"g9","slot":"weapon","baseId":"maul","rarity":"epic","mana":"fire","ilvl":4,"name":"Gloom Song","implicits":[{"stat":"damage","value":29,"roll":0.4213278603274375}],"affixes":[{"stat":"manaRegen","value":29,"roll":0.9728703710134141},{"stat":"frostPower","value":29,"roll":0.9470764304278418},{"stat":"earthPower","value":24,"roll":0.7053869142546318},{"stat":"damage","value":3,"roll":0.5792313659912907}],"upgrade":0,"reforges":0,"locked":false},"chest":{"uid":"g1","slot":"chest","baseId":"cuirass","rarity":"common","mana":"fire","ilvl":1,"name":"Rusty Cuirass","implicits":[{"stat":"armor","value":9,"roll":0.24390670098364353},{"stat":"maxHp","value":23,"roll":0.0753525288309902}],"affixes":[],"upgrade":0,"reforges":0,"locked":false}},"bag":[],"scrap":0,"bestDepth":0,"checkpoints":[],"codex":{},"stats":{"kills":0,"dives":0,"deaths":0,"extracts":0,"bossKills":0,"scrapEarned":0,"itemsFound":{"common":0,"uncommon":0,"magic":0,"rare":0,"epic":0,"legendary":0}},"pity":0,"firstBossLegendaryGiven":false,"autoSalvage":{"common":false,"uncommon":false,"magic":false,"rare":false,"epic":false,"legendary":false},"chains":{"basic":[{"kind":"heavy","element":"fire"}],"primary":{"moves":[{"kind":"light","form":"bolt","elements":["fire"]},{"kind":"medium","form":"bolt","elements":["fire"]},{"kind":"medium","form":"bolt","elements":["fire"]},{"kind":"heavy","form":"bolt","elements":["fire"]}],"payment":"mana"},"defensive":{"moves":[{"kind":"medium","form":"ward","elements":["fire"]}],"payment":"mana"},"ultimate":{"moves":[{"kind":"medium","form":"nova","elements":["fire"]}],"payment":"charge"}},"chainCaps":{"basic":5,"primary":5,"defensive":5,"ultimate":5},"pair":{"primary":"fire","secondary":null},"manaDust":0,"reactionsSeen":[],"dive":null}
}
```


In `packages/engine/tests/delve-movesets.test.ts`:

Replace:

```ts
} from '../src/loot/moveset.js';
import { GearItemSchema } from '../src/delve/profile-schema.js';
import { abilityReady, nextMove, pressMove, pressStep } from '../src/arpg/abilities/cast.js';
```

with:

```ts
  heroChains,
} from '../src/loot/moveset.js';
import { GearItemSchema } from '../src/delve/profile-schema.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import V5 from './fixtures/delve-v5-saves.json';
import { abilityReady, nextMove, pressMove, pressStep } from '../src/arpg/abilities/cast.js';
```

Replace:

```ts
  STEP,
  arena,
  bal,
```

with:

```ts
  OLD_BUILDS,
  STEP,
  arena,
  asV4,
  bal,
```

Append at the end of the file:

```ts
describe('save v6: the migration from version 5', () => {
  // Real version 5 saves from the v0.48.0 engine (see the fixture): a new hero, a bound
  // Fire+Storm hero with a rare axe in the bag, an unarmed hero with a built Primary, a magic
  // dagger mid-dive with a two-move Ultimate, and an epic maul with a one-blow basic chain.
  const json = (x: unknown) => JSON.parse(JSON.stringify(x));
  const migrate = (save: object) => parseDelveProfile(registry, json(save))!;

  it("gives the equipped weapon the profile's chains it can carry, at slots of their length", () => {
    const { profile, fixed, dropped, movesetReset } = migrate(V5.fresh);
    expect(profile).toMatchObject({ version: 6, links: 0 });
    expect('chains' in profile || 'chainCaps' in profile).toBe(false);
    const sword = profile.equipped.weapon!;
    expect(sword.moveset).toEqual({
      chains: { basic: V5.fresh.chains.basic, primary: V5.fresh.chains.primary },
      slots: { basic: 3, primary: 4 },
    });
    // A common sword carries no Defensive or Ultimate: both go (one move each, so no Links).
    expect([fixed, dropped, movesetReset]).toEqual([[], ['defensive', 'ultimate'], false]);
    expect(profile.equipped.chest).toEqual(V5.fresh.equipped.chest);
    const { chains: _c, chainCaps: _k, version: _v, equipped: _e, ...rest } = V5.fresh;
    expect(profile).toMatchObject(rest);
  });

  it('keeps built chains and gives every other weapon its base defaults in its own mana', () => {
    const { profile } = migrate(V5.bound);
    expect(heroChains(registry, profile.equipped, profile.pair)).toEqual({
      basic: V5.bound.chains.basic,
      primary: V5.bound.chains.primary,
    });
    expect(profile.equipped.weapon!.moveset!.slots).toEqual({ basic: 3, primary: 2 });
    const axe = profile.bag[0];
    expect(axe.moveset).toEqual(defaultMoveset(registry, axe, 'frost'));
    expect(axe.moveset!.slots).toEqual({ basic: 3, primary: 1, defensive: 1 });
  });

  it("drops the chains a weapon can't carry, their moves past one slot back as Links; a dive stays", () => {
    const { profile, dropped } = migrate(V5.magic);
    expect(dropped).toEqual(['ultimate']);
    expect(profile.links).toBe(1);
    const dagger = profile.equipped.weapon!.moveset!;
    expect(Object.keys(dagger.chains)).toEqual(['basic', 'primary', 'defensive']);
    // Its basic slots rise to the dagger's string of 4; the sword's three blows stay.
    expect(dagger.slots).toEqual({ basic: 4, primary: 4, defensive: 1 });
    expect(dagger.chains.basic).toEqual(V5.magic.chains.basic);
    expect(profile.dive).toEqual({ ...V5.magic.dive, linksEarned: 0 });
  });

  it("keeps all four on an epic weapon, and raises a short basic chain's slots to its base", () => {
    const { profile, dropped } = migrate(V5.epic);
    expect(dropped).toEqual([]);
    const maul = profile.equipped.weapon!.moveset!;
    expect(maul.chains).toEqual(V5.epic.chains);
    expect(maul.slots).toEqual({ basic: 2, primary: 4, defensive: 1, ultimate: 1 });
  });

  it("resets an unarmed save's built chains to the unarmed defaults, and says so", () => {
    const res = migrate(V5.unarmed);
    expect(res.movesetReset).toBe(true);
    expect(res.dropped).toEqual([]);
    expect(heroChains(registry, res.profile.equipped, res.profile.pair)).toEqual(
      defaultMoveset(registry, { baseId: null, rarity: null }, 'fire').chains,
    );
    // An unarmed save on the unarmed defaults loses nothing.
    const plain = { ...V5.unarmed, chains: V5.fresh.chains };
    expect(migrate(plain).movesetReset).toBe(false);
  });

  it("drops a version 4 save's uncarried chains before fixing the rest to the pair", () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' }); // a common sword
    const frost = (b: (typeof OLD_BUILDS)['primary']) => ({ ...b, elements: ['frost' as const] });
    const builds = {
      ...OLD_BUILDS,
      primary: frost(OLD_BUILDS.primary),
      defensive: frost(OLD_BUILDS.defensive),
    };
    const res = migrate(asV4(p, builds));
    expect(res.dropped).toEqual(['defensive', 'ultimate']);
    // The Bolt's four moves are fixed to Fire; the Frost Ward went with the Defensive.
    expect(res.fixed.map((f) => [f.skill, f.index])).toEqual([
      ['primary', 0],
      ['primary', 1],
      ['primary', 2],
      ['primary', 3],
    ]);
  });

  it('round-trips every migrated save as version 6', () => {
    for (const save of Object.values(V5)) {
      const { profile } = migrate(save);
      expect(parseDelveProfile(registry, json(profile))).toEqual({
        profile,
        fixed: [],
        dropped: [],
        movesetReset: false,
      });
    }
  });

  it("fits a version 6 save's weapons to the data at load", () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const common = weapon('common', 4, 'sword');
    const rare = weapon('rare', 5, 'axe');
    const { moveset: _m, ...bare } = weapon('magic', 6, 'bow');
    const moveset = common.moveset!;
    const [one, two] = rare.moveset!.chains.basic!;
    const bag = [
      bare, // no moveset: its base defaults
      {
        ...common,
        moveset: {
          chains: { ...moveset.chains, defensive: rare.moveset!.chains.defensive },
          slots: { ...moveset.slots, defensive: 1 },
        },
      }, // a chain its rarity doesn't carry
      {
        ...rare,
        moveset: {
          chains: { basic: [one, two], primary: rare.moveset!.chains.primary },
          slots: { basic: 2, primary: rare.moveset!.slots.primary },
        },
      }, // a Defensive to add, a basic slot count to raise
    ];
    const fitted = parseDelveProfile(registry, json({ ...p, bag }))!.profile.bag;
    expect(fitted[0].moveset).toEqual(defaultMoveset(registry, bare, 'storm'));
    expect(fitted[1].moveset).toEqual(moveset);
    expect(fitted[2].moveset!.chains.defensive).toEqual(
      defaultMoveset(registry, rare, 'storm').chains.defensive,
    );
    expect(fitted[2].moveset!.slots.defensive).toBe(1);
    expect(fitted[2].moveset!.slots.basic).toBe(3);
    expect(fitted[2].moveset!.chains.basic).toEqual([one, two]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts)`
Expected: FAIL, 6 failed and 24 passed (30): the new block but for the epic maul and the round trip, on what Task 4's migration keeps (`expected [] to deeply equal [ 'ultimate' ]`, `expected [] to deeply equal [ 'defensive', 'ultimate' ]`, `expected false to be true` for the reset, and the fitted movesets).

- [ ] **Step 3: The migration's rules**

In `packages/engine/src/delve/profile.ts`:

Replace:

```ts
import { baseSlots, carriedByText, movesetOf } from '../loot/moveset.js';
import {
```

with:

```ts
import {
  baseSlots,
  carriedByText,
  carriedSkills,
  defaultChain,
  movesetOf,
} from '../loot/moveset.js';
import {
```

Replace:

```ts
/** Every weapon's moveset: a weapon without one gets its base defaults in its own mana. */
function fitMovesets(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const fit = (item: GearItem): GearItem =>
    item.slot === 'weapon' ? { ...item, moveset: movesetOf(registry, item) } : item;
  const equipped: EquippedGear = {};
```

with:

```ts
/**
 * Every weapon's moveset fitted to the data: a weapon without one gets its
 * base defaults in its own mana; a chain its rarity no longer carries is
 * dropped, a newly carried one gets its base default; and a basic chain's
 * slots are raised to its weapon's string.
 */
function fitMovesets(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const fit = (item: GearItem): GearItem => {
    if (item.slot !== 'weapon') return item;
    const old = movesetOf(registry, item);
    const moveset: Moveset = { chains: {}, slots: {} };
    for (const skill of carriedSkills(registry, item.rarity)) {
      const base = baseSlots(registry, item.baseId, skill);
      const chain = old.chains[skill];
      const set = moveset.chains as Record<ChainSkill, unknown>;
      set[skill] = chain ?? defaultChain(registry, skill, item.baseId, item.mana, base);
      moveset.slots[skill] = chain ? Math.max(old.slots[skill]!, base) : base;
    }
    return { ...item, moveset };
  };
  const equipped: EquippedGear = {};
```

Replace the lines from `* chains, each at slots of its length (at least its base); every other weapon` up to (not including) `/** Version 2 (spell bar): everything kept but the spells. It had no ability builds. */` with:

```ts
 * chains, each at slots of its length (at least its base), but for the chains
 * its rarity doesn't carry, which are dropped (their moves past one slot come
 * back as Links); every other weapon gets its base defaults. An unarmed save
 * keeps no chains: the unarmed defaults follow the pair.
 */
function fromV5(registry: DataRegistry, old: ProfileV5): ParsedDelveProfile {
  const { chains, chainCaps: _caps, ...rest } = old;
  const weapon = old.equipped.weapon;
  const dropped: ChainSkill[] = [];
  let links = 0;
  let equipped = old.equipped;
  if (weapon) {
    const carried = carriedSkills(registry, weapon.rarity);
    const moveset: Moveset = { chains: {}, slots: {} };
    for (const skill of CHAIN_SKILLS) {
      const length = chainLength(chains[skill]);
      const base = baseSlots(registry, weapon.baseId, skill);
      if (!carried.includes(skill)) {
        dropped.push(skill);
        links += Math.max(0, length - base);
        continue;
      }
      (moveset.chains as Record<ChainSkill, unknown>)[skill] = chains[skill];
      moveset.slots[skill] = Math.max(length, base);
    }
    equipped = { ...equipped, weapon: { ...weapon, moveset } };
  }
  const primary = old.pair.primary ?? 'fire';
  const unarmed = {
    ...defaultChains(registry, primary, null),
    basic: defaultBasic(registry, null, primary, old.pair.secondary),
  };
  const movesetReset = !weapon && JSON.stringify(chains) !== JSON.stringify(unarmed);
  const profile = fitMovesets(registry, { ...rest, version: 6, links, equipped });
  return { profile, fixed: [], dropped, movesetReset };
}

```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts)`
Expected: PASS, 30 tests.

- [ ] **Step 5: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1382 tests pass in 77 files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx prettier --write src/delve/profile.ts tests/delve-movesets.test.ts)
git add packages/engine/src/delve/profile.ts packages/engine/tests/delve-movesets.test.ts packages/engine/tests/fixtures/delve-v5-saves.json
git commit -m "feat(engine): save v6 migration: a weapon keeps the chains its rarity carries, the rest back as Links; every weapon fitted at load" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 7: Engine: edits and slots

### Task 6: Edits cost Mana Dust; slots cost Links

The spec's "Changes and their price" and "Adding a slot", in a new module, `src/delve/moveset.ts`:
- **`movesetEditPrice(registry, old, next)`**, the one price function the engine charges and the builder's preview will show: over every chain `next` holds, the longest run of moves the two share in order is free; a remaining new move equal to a remaining old one moved (`editDust`); the rest pair up in order, a changed kind or form `editDust` and changed elements `elementDust`; a move left over costs `editDust` (a new one `elementDust` more unless some old move has its elements); a changed payment `editDust`. **`editPrice(registry, profile, next)`** is what an edit costs the hero: nothing before its first dive.
- **`setChains(registry, profile, chains)`**: every changed chain's refusals and the total price, then all or nothing, as a `ProfileActionResult`. **`setChain`** is its one-chain case, moving here from `profile.ts` and returning a result instead of throwing. The new refusals: a chain may hold an element set outside the pair no more times than the old chain did (kept, moved or removed, never added, copied or re-coloured); and an unknown form or a chain of the wrong shape (blows for an ability, moves for the basic chain), which untyped input could send, is refused rather than thrown on.
- **`slotPrice(registry, weapon, skill)`** and **`addSlot(registry, profile, skill)`**: a slot costs `slotLinks` and `slotScrap` by its position (the 2nd slot the first price), and appends the default move at the chain's end.
- The autopilot's `fusePrimary` pays for its edit, and skips it when it can't.

**Files:**
- Create: `packages/engine/src/delve/moveset.ts`
- Modify: `packages/engine/src/delve/profile.ts:27,121` (imports; `setChain` moves out)
- Modify: `packages/engine/src/delve/autopilot.ts:32,133` (CRLF, never format)
- Modify: `packages/engine/src/index.ts:162`
- Modify: `packages/engine/tests/delve-movesets.test.ts` (imports, and three new blocks at the end)
- Modify: `packages/engine/tests/delve-pair.test.ts:32,935,956`
- Modify: `packages/engine/tests/delve-profile-abilities.test.ts:4,36,57`

- [ ] **Step 1: Write the failing tests**

`delve-movesets.test.ts` gets one test per pricing rule, the edits' results and refusals (the off-pair rules among them), and `addSlot`; the two older files read `setChain`'s result.

In `packages/engine/tests/delve-movesets.test.ts`:

Replace the lines from `import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';` up to (not including) `} from './fixtures/arena.js';` with:

```ts
import { startDive } from '../src/delve/dive.js';
import { addSlot, movesetEditPrice, setChain, setChains, slotPrice } from '../src/delve/moveset.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile, parseDelveProfile, unequipSlot } from '../src/delve/profile.js';
import V5 from './fixtures/delve-v5-saves.json';
import { abilityReady, nextMove, pressMove, pressStep } from '../src/arpg/abilities/cast.js';
import { gainCharge } from '../src/arpg/abilities/defend.js';
import { botInput } from '../src/arpg/bot.js';
import { applyStatus, hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { fillCharge, setSandboxToggles } from '../src/arpg/sandbox.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
import { CHAIN_SKILLS, type Blow, type Chain, type Move } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem, Rarity } from '../src/types/gear.js';
import type { ManaType } from '../src/types/mana.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import {
  DEFAULT_CHAINS,
  OLD_BUILDS,
  STEP,
  arena,
  asV4,
  bal,
  chainsOf,
  dummy,
  gear,
  press,
  registry,
  run,
  withChains,
```

Append at the end of the file:

```ts
describe('the edit price (movesetEditPrice)', () => {
  const E = bal.movesets.editDust;
  const X = bal.movesets.elementDust;
  const bolt = (kind: Move['kind'], ...elements: ManaType[]): Move => ({
    kind,
    form: 'bolt',
    elements,
  });
  const chain = (...moves: Move[]): Chain => ({ moves, payment: 'mana' });
  const price = (old: Chain, next: Chain) =>
    movesetEditPrice(registry, { primary: old }, { primary: next });
  const A = bolt('light', 'fire');
  const B = bolt('medium', 'fire');
  const C = bolt('heavy', 'storm');

  it('the run the chains share is free: removing or inserting a move costs only that move', () => {
    expect(price(chain(A, B, C), chain(A, B, C))).toBe(0);
    expect(price(chain(A, B, C), chain(A, C))).toBe(E);
    expect(price(chain(A, B, C), chain(B, C))).toBe(E);
    expect(price(chain(A, C), chain(A, B, C))).toBe(E); // Fire is an old move's element
  });

  it('a move that only moved costs editDust; a ◂▸ swap moves one', () => {
    expect(price(chain(A, B, C), chain(B, C, A))).toBe(E);
    expect(price(chain(A, B), chain(B, A))).toBe(E);
  });

  it('the rest pair up in order: a changed kind or form, changed elements, or both', () => {
    expect(price(chain(A, B), chain(A, bolt('heavy', 'fire')))).toBe(E);
    expect(price(chain(A, B), chain(A, { ...B, form: 'lance' }))).toBe(E);
    expect(price(chain(A, B), chain(A, bolt('medium', 'storm')))).toBe(X);
    expect(price(chain(A, B), chain(A, bolt('medium', 'fire', 'storm')))).toBe(X);
    expect(price(chain(A, B), chain(A, bolt('heavy', 'storm', 'fire')))).toBe(E + X);
  });

  it('a move left over: a new one costs editDust and, with elements no old move has, elementDust; a removal editDust', () => {
    expect(price(chain(A), chain(A, bolt('medium', 'nature')))).toBe(E + X);
    expect(price(chain(A, C), chain(A, C, bolt('light', 'storm')))).toBe(E);
    expect(price(chain(A, B, C), chain(A))).toBe(2 * E);
  });

  it('a changed payment costs editDust; blows price the same way; chains left out cost nothing', () => {
    expect(price(chain(A), { moves: [A], payment: 'cast' })).toBe(E);
    const fire: Blow = { kind: 'light', element: 'fire' };
    const heavy: Blow = { kind: 'heavy', element: 'fire' };
    const blows = (old: Blow[], next: Blow[]) =>
      movesetEditPrice(registry, { basic: old }, { basic: next });
    expect(blows([fire, fire, heavy], [fire, heavy])).toBe(E);
    expect(blows([fire, fire, heavy], [fire, fire, { ...heavy, element: 'frost' }])).toBe(X);
    const old = { basic: [fire], primary: chain(A) };
    expect(movesetEditPrice(registry, old, { primary: chain(B) })).toBe(E);
    expect(movesetEditPrice(registry, old, { basic: [heavy], primary: chain(B) })).toBe(2 * E);
  });
});

describe('edits: setChain and setChains', () => {
  const light = (...elements: ManaType[]): Move => ({ kind: 'light', form: 'bolt', elements });
  /** A Fire hero past its first dive, with 20 Mana Dust. */
  const veteran = (): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    return { ...p, manaDust: 20, stats: { ...p.stats, dives: 1 } };
  };

  it('edits the equipped weapon for its price; nothing before the first dive, nothing unchanged', () => {
    const next: Chain = {
      moves: [{ kind: 'heavy', form: 'bolt', elements: ['fire'] }],
      payment: 'mana',
    };
    const fresh = createDelveProfile(registry, 3, { primary: 'fire' });
    const free = setChain(registry, fresh, 'primary', next);
    expect(free.ok).toBe(true);
    expect(chainsOf(free.profile).primary).toEqual(next);
    expect(free.profile.manaDust).toBe(0);
    const paid = setChain(registry, veteran(), 'primary', next);
    expect(paid.profile.manaDust).toBe(20 - bal.movesets.editDust);
    const same = setChain(registry, veteran(), 'primary', chainsOf(veteran()).primary!);
    expect(same.profile.manaDust).toBe(20);
    const poor = { ...veteran(), manaDust: bal.movesets.editDust - 1 };
    expect(setChain(registry, poor, 'primary', next)).toEqual({
      ok: false,
      profile: poor,
      reason: 'Not enough Mana Dust',
    });
  });

  it("refuses mid-dive, unarmed, a skill the weapon doesn't carry, and more moves than slots", () => {
    const p = veteran();
    const one: Chain = { moves: [light('fire')], payment: 'mana' };
    const reason = (q: DelveProfile, skill: 'primary' | 'defensive' | 'ultimate', c = one) =>
      setChain(registry, q, skill, c).reason;
    expect(reason(startDive(registry, p, 1), 'primary')).toBe(
      'Chains can only change between dives',
    );
    expect(reason(unequipSlot(registry, p, 'weapon'), 'primary')).toBe(
      'Equip a weapon to build your moves',
    );
    const ward = { moves: [{ ...light('fire'), form: 'ward' as const }], payment: 'mana' as const };
    expect(reason(p, 'defensive', ward)).toBe('Carried by magic weapons and better');
    const magic = {
      ...p,
      equipped: { ...p.equipped, weapon: weapon('magic', 2, 'sword') },
    };
    const nova = { moves: [{ ...light('fire'), form: 'nova' as const }], payment: 'mana' as const };
    expect(reason(magic, 'ultimate', nova)).toBe('Carried by epic weapons and better');
    expect(reason(p, 'primary', { ...one, moves: [light('fire'), light('fire')] })).toBe(
      'A chain holds 1 to 1 moves',
    );
  });

  it('keeps, moves and removes off-pair moves, but never adds, copies or re-colours one', () => {
    const p0 = bindSecondary(registry, veteran(), 'storm').profile;
    const [F, N, NF] = [light('fire'), light('nature'), light('nature', 'fire')];
    const p = {
      ...withChains(p0, { primary: { moves: [F, N, NF, F], payment: 'mana' } }),
      manaDust: 999,
    };
    const ok = (...moves: Move[]) => setChain(registry, p, 'primary', { moves, payment: 'mana' });
    expect(ok(F, N, NF, F).ok).toBe(true); // kept
    expect(ok(N, F, F, NF).ok).toBe(true); // moved
    expect(ok(F, NF).ok).toBe(true); // removed
    expect(ok(F, N, NF, { ...N, kind: 'heavy' }).reason).toBe('Pick from your two elements'); // copied
    expect(ok(F, N, NF, light('frost')).reason).toBe('Pick from your two elements'); // added
    expect(ok(F, light('frost'), NF, F).reason).toBe('Pick from your two elements'); // re-coloured
    expect(ok(F, { ...N, kind: 'heavy' }, NF, F).ok).toBe(true); // its kind changed
    expect(ok(F, N, light('fire', 'nature'), F).ok).toBe(true); // its elements' order: the same set
    const blows: Blow[] = [
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'nature' },
    ];
    const b = { ...withChains(p0, { basic: blows }), manaDust: 999 };
    expect(setChain(registry, b, 'basic', [...blows].reverse()).ok).toBe(true);
    expect(setChain(registry, b, 'basic', [blows[1], blows[1]]).reason).toBe(
      'Pick from your two elements',
    );
  });

  it('setChains applies every chain or none, for their total', () => {
    const p = veteran();
    const basic: Blow[] = [{ kind: 'heavy', element: 'fire' }];
    const primary: Chain = {
      moves: [{ kind: 'heavy', form: 'bolt', elements: ['fire'] }],
      payment: 'mana',
    };
    const both = setChains(registry, p, { basic, primary });
    expect(both.ok).toBe(true);
    expect(chainsOf(both.profile)).toEqual({ basic, primary });
    // Two blows removed and a kind changed: 3 × editDust.
    expect(both.profile.manaDust).toBe(20 - 3 * bal.movesets.editDust);
    const poor = { ...p, manaDust: 3 * bal.movesets.editDust - 1 };
    expect(setChains(registry, poor, { basic, primary })).toMatchObject({
      ok: false,
      profile: poor,
      reason: 'Not enough Mana Dust',
    });
    const ward = {
      moves: [{ kind: 'medium' as const, form: 'ward' as const, elements: ['fire' as const] }],
      payment: 'mana' as const,
    };
    expect(setChains(registry, p, { primary, defensive: ward })).toMatchObject({
      ok: false,
      profile: p,
    });
  });
});

describe('slots: addSlot', () => {
  /** A Fire hero with plenty of Links and scrap. */
  const rich = (p = createDelveProfile(registry, 3, { primary: 'fire' })): DelveProfile => ({
    ...p,
    links: 99,
    scrap: 9999,
  });

  it("prices a slot by its position: the 2nd 1 Link, a sword's 4th basic slot 3", () => {
    const sword = rich().equipped.weapon!;
    expect(slotPrice(registry, sword, 'primary')).toEqual({ links: 1, scrap: 20 });
    expect(slotPrice(registry, sword, 'basic')).toEqual({ links: 3, scrap: 60 });
    expect(slotPrice(registry, sword, 'defensive')).toBeNull();
    const res = addSlot(registry, rich(), 'primary');
    expect(res.profile).toMatchObject({ links: 98, scrap: 9979 });
    expect(slotPrice(registry, res.profile.equipped.weapon!, 'primary')).toEqual({
      links: 2,
      scrap: 40,
    });
  });

  it("appends the default kind at the chain's end, in the last move's form and in-pair elements", () => {
    const p = rich();
    const primary = addSlot(registry, p, 'primary').profile;
    expect(chainsOf(primary).primary!.moves).toEqual([
      { kind: 'light', form: 'bolt', elements: ['fire'] },
      { kind: 'medium', form: 'bolt', elements: ['fire'] },
    ]);
    expect(primary.equipped.weapon!.moveset!.slots.primary).toBe(2);
    // A Lance's default chain, [medium, medium, heavy], at the new move's place.
    const lance: Chain = {
      moves: [{ kind: 'heavy', form: 'lance', elements: ['fire', 'storm'] }],
      payment: 'cast',
    };
    const bound = rich(withChains(bindSecondary(registry, p, 'storm').profile, { primary: lance }));
    expect(chainsOf(addSlot(registry, bound, 'primary').profile).primary!.moves[1]).toEqual({
      kind: 'medium',
      form: 'lance',
      elements: ['fire', 'storm'],
    });
    // A blow past the sword's string of three: medium.
    expect(chainsOf(addSlot(registry, p, 'basic').profile).basic![3]).toEqual({
      kind: 'medium',
      element: 'fire',
    });
  });

  it("gives the new move the pair's primary when the last move is off-pair", () => {
    const nature: Chain = {
      moves: [{ kind: 'light', form: 'bolt', elements: ['nature', 'fire'] }],
      payment: 'mana',
    };
    const p = rich(
      withChains(createDelveProfile(registry, 3, { primary: 'fire' }), { primary: nature }),
    );
    expect(chainsOf(addSlot(registry, p, 'primary').profile).primary!.moves[1].elements).toEqual([
      'fire',
    ]);
  });

  it('never touches a slot the chain is not using', () => {
    const dagger = {
      ...rich(),
      equipped: { ...rich().equipped, weapon: weapon('common', 3, 'dagger') },
    };
    const three = setChain(registry, dagger, 'basic', chainsOf(dagger).basic!.slice(0, 3)).profile;
    expect(three.equipped.weapon!.moveset!.slots.basic).toBe(4);
    const added = addSlot(registry, three, 'basic').profile;
    expect(added.equipped.weapon!.moveset!.slots.basic).toBe(5);
    // The dagger's string at the fourth place: heavy.
    expect(chainsOf(added).basic!.map((b) => b.kind)).toEqual([
      'light',
      'light',
      'medium',
      'heavy',
    ]);
  });

  it("refuses mid-dive, unarmed, a skill the weapon doesn't carry, at 5 slots, and without the Links or the scrap", () => {
    const p = rich();
    const reason = (q: DelveProfile, skill: 'basic' | 'primary' | 'defensive' = 'primary') =>
      addSlot(registry, q, skill).reason;
    expect(reason(startDive(registry, p, 1))).toBe('Chains can only change between dives');
    expect(reason(unequipSlot(registry, p, 'weapon'))).toBe('Equip a weapon to build your moves');
    expect(reason(p, 'defensive')).toBe('Carried by magic weapons and better');
    let full = p;
    for (let i = 0; i < 4; i++) full = addSlot(registry, full, 'primary').profile;
    expect(full.equipped.weapon!.moveset!.slots.primary).toBe(5);
    expect(reason(full)).toBe('This chain has every slot');
    expect(reason({ ...p, links: 0 })).toBe('Not enough Links');
    expect(reason({ ...p, scrap: 19 })).toBe('Not enough scrap');
  });
});
```

In `packages/engine/tests/delve-pair.test.ts`:

Replace:

```ts
  setChain,
  unequipSlot,
} from '../src/delve/profile.js';
import {
```

with:

```ts
  unequipSlot,
} from '../src/delve/profile.js';
import { setChain } from '../src/delve/moveset.js';
import {
```

Replace:

```ts
    ]);
    for (const q of [hero(), built]) {
```

with:

```ts
    ]).profile;
    for (const q of [hero(), built]) {
```

Replace the lines from `expect(() => setChain(registry, p, 'primary', plague)).toThrow(/two elements/);` up to (not including) `it('Power, Equip best, salvage, the floor and max life ignore attunement outside the pair', () => {` with:

```ts
    expect(setChain(registry, p, 'primary', plague).reason).toBe('Pick from your two elements');
    expect(setChain(registry, p, 'basic', [{ kind: 'light', element: 'nature' }]).reason).toBe(
      'Pick from your two elements',
    );
    const withNature = bindSecondary(registry, p, 'nature').profile;
    const set = (q: DelveProfile) => chainsOf(setChain(registry, q, 'primary', plague).profile);
    expect(set(withNature).primary).toEqual(plague);
    expect(set(createDelveProfile(registry, 3)).primary).toEqual(plague);
  });

```

In `packages/engine/tests/delve-profile-abilities.test.ts`:

Replace the lines from `import {` up to (not including) `import { startDive } from '../src/delve/dive.js';` with:

```ts
import { setChain } from '../src/delve/moveset.js';
import { createDelveProfile, parseDelveProfile, unequipSlot } from '../src/delve/profile.js';
```

Replace:

```ts
    let p = setChain(registry, roomy, 'primary', chain);
    p = setChain(registry, p, 'basic', [{ kind: 'heavy', element: 'nature' }]);
    expect(chainsOf(p).primary).toEqual(chain);
```

with:

```ts
    let p = setChain(registry, roomy, 'primary', chain).profile;
    p = setChain(registry, p, 'basic', [{ kind: 'heavy', element: 'nature' }]).profile;
    expect(chainsOf(p).primary).toEqual(chain);
```

Replace the lines from `const set =` up to (not including) `it("migrates a version 2 save, keeping gear and scrap: its new primary's default chains", () => {` with:

```ts
    const set = (chain: Chain, profile = p) => setChain(registry, profile, 'primary', chain).reason;
    expect(set(ok)).toBeUndefined();
    expect(set({ ...ok, moves: [] })).toBe('A chain holds 1 to 5 moves');
    expect(set({ ...ok, moves: Array(6).fill(move) })).toBe('A chain holds 1 to 5 moves');
    expect(set({ ...ok, moves: [move, move] }, fresh)).toBe('A chain holds 1 to 1 moves');
    expect(set({ ...ok, moves: [{ ...move, kind: 'huge' as never }] })).toBe('Bad kind huge');
    expect(set({ ...ok, moves: [{ ...move, form: 'nova' }] })).toBe('Nova is not a primary form');
    for (const elements of [[], ['fire', 'fire'], ['fire', 'frost', 'storm']] as const)
      expect(set({ ...ok, moves: [{ ...move, elements: [...elements] }] })).toBe(
        'Pick one or two different elements',
      );
    expect(set({ ...ok, payment: 'gold' as never })).toBe('Bad payment gold');
    expect(set({ ...ok, moves: [{ ...move, form: 'axe' as never }] })).toBe('Unknown form axe');
    expect(set([{ kind: 'light', element: 'fire' }] as never)).toBe('Not a primary chain');
    expect(setChain(registry, p, 'basic', []).reason).toBe('A chain holds 1 to 5 moves');
    expect(
      setChain(registry, p, 'basic', [{ kind: 'light', element: 'gold' as never }]).reason,
    ).toBe('Unknown element');
    const ward: Chain = { moves: [{ ...move, form: 'ward' }], payment: 'mana' };
    expect(setChain(registry, p, 'defensive', ward).reason).toBe(
      'Carried by magic weapons and better',
    );
    expect(set(ok, unequipSlot(registry, p, 'weapon'))).toBe('Equip a weapon to build your moves');
  });

  it('chains can only change between dives', () => {
    const diving = startDive(registry, createDelveProfile(registry, 1), 1);
    const res = setChain(registry, diving, 'basic', [{ kind: 'light', element: 'fire' }]);
    expect(res).toEqual({
      ok: false,
      profile: diving,
      reason: 'Chains can only change between dives',
    });
  });

```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts tests/delve-pair.test.ts tests/delve-profile-abilities.test.ts)`
Expected: FAIL, all three files, no tests run: `Error: Cannot find module '../src/delve/moveset.js'`.

- [ ] **Step 3: The prices, the edits and the slots**

Create `packages/engine/src/delve/moveset.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import { carriedByText, defaultKind, movesetOf } from '../loot/moveset.js';
import {
  ABILITY_PAYMENTS,
  CHAIN_SKILLS,
  MOVE_KINDS,
  type Blow,
  type Chains,
  type ChainSkill,
  type Move,
} from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem, Moveset } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { isDiveActive } from './dive.js';
import { inPair } from './pair.js';
import { withMoveset, type ProfileActionResult } from './profile.js';

/**
 * Editing a weapon's moveset (see the weapon movesets spec): its chains'
 * moves, priced in Mana Dust, and its slots, priced in Links and scrap.
 * profile.ts and pair.ts import this module back: keep to function declarations.
 */

const BETWEEN_DIVES = 'Chains can only change between dives';
const UNARMED_TEXT = 'Equip a weapon to build your moves';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/** A chain's moves or blows. */
function movesOf(chain: Chains[ChainSkill] | undefined): (Move | Blow)[] {
  if (!chain) return [];
  return Array.isArray(chain) ? chain : chain.moves;
}

/** A move's elements: its one or two, a blow's one. */
function elementsOf(m: Move | Blow): ManaType[] {
  return 'element' in m ? [m.element] : m.elements;
}

/** A move as it is: its kind, its form and its elements (a blow: its kind and element). */
function moveKey(m: Move | Blow): string {
  return 'element' in m ? `${m.kind}|${m.element}` : `${m.kind}|${m.form}|${m.elements.join('+')}`;
}

/** Index pairs of a longest common subsequence of `a` and `b` (by key). */
function commonRun(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const len = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      len[i][j] = a[i] === b[j] ? len[i + 1][j + 1] + 1 : Math.max(len[i + 1][j], len[i][j + 1]);
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (len[i + 1][j] >= len[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** The Mana Dust one chain's edit costs (see `movesetEditPrice`). */
function chainEditPrice(
  registry: DataRegistry,
  old: Chains[ChainSkill] | undefined,
  next: Chains[ChainSkill],
): number {
  const { editDust, elementDust } = registry.getDelveBalance().movesets;
  const was = movesOf(old);
  const now = movesOf(next);
  // 1. The longest run the two share in order is unchanged, and free.
  const run = commonRun(was.map(moveKey), now.map(moveKey));
  const restOld = was.filter((_, i) => !run.some(([a]) => a === i));
  let restNew = now.filter((_, j) => !run.some(([, b]) => b === j));
  let price = 0;
  // 2. A remaining new move equal to a remaining old one moved.
  restNew = restNew.filter((m) => {
    const i = restOld.findIndex((o) => moveKey(o) === moveKey(m));
    if (i < 0) return true;
    restOld.splice(i, 1);
    price += editDust;
    return false;
  });
  // 3. The rest pair up in order: a changed kind or form, changed elements, or both.
  const paired = Math.min(restOld.length, restNew.length);
  for (let i = 0; i < paired; i++) {
    const [o, m] = [restOld[i], restNew[i]];
    const shape = (x: Move | Blow) => ('form' in x ? `${x.kind}|${x.form}` : x.kind);
    if (shape(o) !== shape(m)) price += editDust;
    if (elementsOf(o).join('+') !== elementsOf(m).join('+')) price += elementDust;
  }
  // 4. What's left: a new move (its elements free when some old move has them), or a removal.
  const known = new Set(was.map((o) => elementsOf(o).join('+')));
  for (const m of restNew.slice(paired))
    price += editDust + (known.has(elementsOf(m).join('+')) ? 0 : elementDust);
  price += editDust * (restOld.length - paired);
  // 5. A changed payment.
  if (old && !Array.isArray(old) && !Array.isArray(next) && old.payment !== next.payment)
    price += editDust;
  return price;
}

/**
 * The Mana Dust turning `old` into `next` costs, over every chain `next`
 * holds (see the weapon movesets spec): moves matched by what they are, not
 * where they stand. The longest run the two share in order is free; a move
 * that only moved costs `editDust`; the rest pair up in order, a changed kind
 * or form costing `editDust` and changed elements `elementDust`; a move left
 * over costs `editDust` (a new one `elementDust` more, unless some old move
 * has its elements); a changed payment costs `editDust`. The caller applies
 * the first-dive freebie.
 */
export function movesetEditPrice(
  registry: DataRegistry,
  old: Partial<Chains>,
  next: Partial<Chains>,
): number {
  return CHAIN_SKILLS.reduce((sum, skill) => {
    const chain = next[skill];
    return chain ? sum + chainEditPrice(registry, old[skill], chain) : sum;
  }, 0);
}

/** What an edit costs `profile`: its price, but nothing before the hero's first dive. */
export function editPrice(
  registry: DataRegistry,
  profile: DelveProfile,
  next: Partial<Chains>,
): number {
  const weapon = profile.equipped.weapon;
  if (!weapon || profile.stats.dives === 0) return 0;
  return movesetEditPrice(registry, movesetOf(registry, weapon).chains, next);
}

/** How many moves of `chain` hold each element set outside the pair ("fire+nature"). */
function offPairSets(profile: DelveProfile, chain: Chains[ChainSkill] | undefined) {
  const counts = new Map<string, number>();
  for (const m of movesOf(chain)) {
    const els = elementsOf(m);
    if (els.every((e) => inPair(profile, e))) continue;
    const key = [...els].sort().join('+');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Why `chain` can't be the weapon's `skill` chain, or null when it can. */
function chainRefusal(
  registry: DataRegistry,
  profile: DelveProfile,
  moveset: Moveset,
  skill: ChainSkill,
  chain: Chains[ChainSkill],
): string | null {
  const slots = moveset.slots[skill];
  if (slots === undefined) return carriedByText(registry, skill);
  if (Array.isArray(chain) !== (skill === 'basic')) return `Not a ${skill} chain`;
  const moves = movesOf(chain);
  if (moves.length < 1 || moves.length > slots) return `A chain holds 1 to ${slots} moves`;
  for (const m of moves) if (!MOVE_KINDS.includes(m.kind)) return `Bad kind ${m.kind}`;
  for (const m of moves) {
    const els = elementsOf(m);
    if (els.length < 1 || els.length > 2 || new Set(els).size !== els.length)
      return 'Pick one or two different elements';
    if (!els.every((e) => e in registry.getArpgData().mana)) return 'Unknown element';
    if ('form' in m) {
      if (!registry.getArpgData().forms.some((f) => f.id === m.form))
        return `Unknown form ${m.form}`;
      const form = registry.getForm(m.form);
      if (form.slot !== skill) return `${form.name} is not a ${skill} form`;
    }
  }
  if (!Array.isArray(chain) && !ABILITY_PAYMENTS.includes(chain.payment))
    return `Bad payment ${chain.payment}`;
  // An off-pair element set may be kept, moved or removed, never added or copied.
  const before = offPairSets(profile, moveset.chains[skill]);
  for (const [key, n] of offPairSets(profile, chain))
    if (n > (before.get(key) ?? 0)) return 'Pick from your two elements';
  return null;
}

/** A chain copied, so the save never shares arrays with the caller. */
function copyChain(chain: Chains[ChainSkill]): Chains[ChainSkill] {
  if (Array.isArray(chain)) return chain.map((b) => ({ ...b }));
  const moves = chain.moves.map((m) => ({ ...m, elements: [...m.elements] }));
  return { moves, payment: chain.payment };
}

/**
 * Set several of the equipped weapon's chains at once, for Mana Dust
 * (`editPrice`): all or nothing. Refuses mid-dive, unarmed, and when any
 * chain is refused (a skill the weapon doesn't carry; fewer than one move or
 * more than its slots; an unknown kind, a form from another slot, anything
 * but one or two different known elements, an unknown payment; or an element
 * set outside the pair held more times than before) or the total can't be paid.
 */
export function setChains(
  registry: DataRegistry,
  profile: DelveProfile,
  chains: Partial<Chains>,
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
    (next as Record<ChainSkill, unknown>)[skill] = copyChain(chain);
  }
  const price = editPrice(registry, profile, chains);
  if (profile.manaDust < price) return refuse(profile, 'Not enough Mana Dust');
  const edited = withMoveset(profile, { ...moveset, chains: next });
  return { ok: true, profile: { ...edited, manaDust: profile.manaDust - price } };
}

/** Set one of the equipped weapon's chains (`setChains` with one). */
export function setChain<S extends ChainSkill>(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: S,
  chain: Chains[S],
): ProfileActionResult {
  return setChains(registry, profile, { [skill]: chain });
}

/**
 * The next slot of `weapon`'s `skill` chain: its Links and scrap by the new
 * slot's position (`slotLinks`, `slotScrap`: the 2nd slot's first), or null
 * when the weapon doesn't carry the skill or the chain has every slot.
 */
export function slotPrice(
  registry: DataRegistry,
  weapon: GearItem,
  skill: ChainSkill,
): { links: number; scrap: number } | null {
  const bal = registry.getDelveBalance();
  const slots = movesetOf(registry, weapon).slots[skill];
  if (slots === undefined || slots >= bal.chains.cap[skill]) return null;
  return { links: bal.movesets.slotLinks[slots - 1], scrap: bal.movesets.slotScrap[slots - 1] };
}

/**
 * Add a slot to the equipped weapon's `skill` chain, for Links and scrap
 * (`slotPrice`), and a move at the chain's end: the default kind at its
 * position (the last move's form's default chain, or for the basic chain the
 * weapon's, medium past its end), the last move's form, and the last move's
 * elements while they're all in the pair, else the pair's primary. A slot the
 * chain isn't using stays free. Refuses mid-dive, unarmed, for a skill the
 * weapon doesn't carry, at the cap, and when it can't be paid for.
 */
export function addSlot(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: ChainSkill,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, BETWEEN_DIVES);
  const weapon = profile.equipped.weapon;
  if (!weapon) return refuse(profile, UNARMED_TEXT);
  const moveset = movesetOf(registry, weapon);
  if (moveset.slots[skill] === undefined) return refuse(profile, carriedByText(registry, skill));
  const price = slotPrice(registry, weapon, skill);
  if (!price) return refuse(profile, 'This chain has every slot');
  if (profile.links < price.links) return refuse(profile, 'Not enough Links');
  if (profile.scrap < price.scrap) return refuse(profile, 'Not enough scrap');
  const chain = moveset.chains[skill]!;
  const moves = movesOf(chain);
  const last = moves[moves.length - 1];
  const primary = profile.pair.primary;
  const kept = elementsOf(last).every((e) => inPair(profile, e));
  const elements = kept || !primary ? elementsOf(last) : [primary];
  let next: Chains[ChainSkill];
  if (Array.isArray(chain)) {
    const kind = defaultKind(registry, 'basic', weapon.baseId, moves.length);
    next = [...chain, { kind, element: elements[0] }];
  } else {
    const form = (last as Move).form;
    const kind = registry.getForm(form).defaultChain[moves.length] ?? 'medium';
    next = { ...chain, moves: [...chain.moves, { kind, form, elements: [...elements] }] };
  }
  const slots = { ...moveset.slots, [skill]: moveset.slots[skill]! + 1 };
  const edited = withMoveset(profile, { chains: { ...moveset.chains, [skill]: next }, slots });
  return {
    ok: true,
    item: edited.equipped.weapon,
    profile: { ...edited, links: profile.links - price.links, scrap: profile.scrap - price.scrap },
  };
}
```


In `packages/engine/src/delve/profile.ts`:

Replace the lines from `import { chooseStartingMana, fixChainsToPair, inPair, salvageDust, type ChainFix } from './pair.js';` up to (not including) `type Chain,` with:

```ts
import { chooseStartingMana, fixChainsToPair, salvageDust, type ChainFix } from './pair.js';
import { defaultBasic, defaultChains } from '../arpg/abilities/resolve.js';
import { baseSlots, carriedSkills, defaultChain, movesetOf } from '../loot/moveset.js';
import {
  ABILITY_SLOTS,
  CHAIN_SKILLS,
  type AbilityBuild,
  type AbilityBuilds,
  type AbilitySlot,
```

Replace the lines from `return { ...profile, equipped: { ...profile.equipped, weapon: { ...weapon, moveset } } };` up to (not including) `const STRENGTH: MoveKind[] = ['light', 'medium', 'heavy'];` with:

```ts
  return { ...profile, equipped: { ...profile.equipped, weapon: { ...weapon, moveset } } };
}

```

In `packages/engine/src/delve/autopilot.ts`:

Replace:

```ts
  setChain,
  upgradeGear,
} from './profile.js';

```

with:

```ts
  upgradeGear,
} from './profile.js';
import { setChain } from './moveset.js';

```

Replace the lines from `* bound pair, so it keeps finding their reaction.` up to (not including) `* Between dives, as a player would: an overtaking secondary swaps in, a second` with:

```ts
 * bound pair, so it keeps finding their reaction, when it can pay for the edit.
 */
function fusePrimary(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const { primary, secondary } = p.pair;
  const chain = heroChains(registry, p.equipped, p.pair).primary;
  if (!primary || !secondary || !chain) return p;
  const moves = chain.moves.map((m) => ({ ...m, elements: [primary, secondary] }));
  const res = setChain(registry, p, 'primary', { ...chain, moves });
  return res.ok ? res.profile : p;
}

/**
```

In `packages/engine/src/index.ts`:

Replace:

```ts
  setChain,
  chainFromBuild,
} from './delve/profile.js';
export type { ProfileActionResult, ParsedDelveProfile } from './delve/profile.js';
```

with:

```ts
  chainFromBuild,
} from './delve/profile.js';
export {
  setChain,
  setChains,
  movesetEditPrice,
  editPrice,
  addSlot,
  slotPrice,
} from './delve/moveset.js';
export type { ProfileActionResult, ParsedDelveProfile } from './delve/profile.js';
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts tests/delve-pair.test.ts tests/delve-profile-abilities.test.ts)`
Expected: PASS, 102 tests in 3 files.

- [ ] **Step 5: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1396 tests pass in 77 files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx prettier --write src/delve/moveset.ts src/delve/profile.ts src/index.ts tests/delve-movesets.test.ts tests/delve-pair.test.ts tests/delve-profile-abilities.test.ts)
git add packages/engine/src/delve/moveset.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/autopilot.ts packages/engine/src/index.ts packages/engine/tests/delve-movesets.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-profile-abilities.test.ts
git commit -m "feat(engine): edits cost Mana Dust by one price function; setChains all or nothing; slots cost Links" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 8: Engine: Links and transfers

### Task 7: Salvaged weapons give Links; a moveset moves to another weapon

- **Links:** salvaging a weapon (by hand, auto-salvage, or a full bag's melt) adds its extra slots to `profile.links`; `salvageItems`, `BagInsertResult` and `BankResult` report `links`, and banking adds them to the dive's `linksEarned`. Fusing refunds the inputs' extra slots as Links (`fuseGear`'s result reports them); `fuseItems` still returns only the item, and a fused weapon rolls its own moveset.
- **`movesetTransfer(registry, source, target)`** (pure, in `loot/moveset.ts`, for the transfer, the home valuation of Task 8 and the item sheet to come): each chain the target carries keeps its extra slots over the target's base (at most the cap; the rest back as Links), its moves past the new slots dropped from the end; a chain the target can't carry stays behind, its extras back as Links; the target's own extras on the chains replaced come back as Links; a skill only the target carries keeps the target's chain. Its price: `transferScrap` for each extra slot that moves.
- **`transferMoveset(registry, profile, uid)`** does it for the equipped weapon onto a bag weapon, and equips it; the old weapon goes to the bag at its base slots, its moves the defaults in its own mana.

**Files:**
- Modify: `packages/engine/src/loot/moveset.ts:3,180` (`movesetTransfer`)
- Modify: `packages/engine/src/delve/moveset.ts:2,296` (`transferMoveset`)
- Modify: `packages/engine/src/delve/profile.ts:29,49,377,394,413,463,583,597` (`ProfileActionResult.links`, bagging, salvage, fusing)
- Modify: `packages/engine/src/delve/dive.ts:119,157,174` (`BankResult.links`, `linksEarned`; CRLF, never format)
- Modify: `packages/engine/src/index.ts:171,195`
- Modify: `packages/engine/tests/delve-movesets.test.ts` (imports, and two new blocks at the end)

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-movesets.test.ts`:

Replace:

```ts
import { startDive } from '../src/delve/dive.js';
import { addSlot, movesetEditPrice, setChain, setChains, slotPrice } from '../src/delve/moveset.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile, parseDelveProfile, unequipSlot } from '../src/delve/profile.js';
import V5 from './fixtures/delve-v5-saves.json';
```

with:

```ts
import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
import {
  addSlot,
  movesetEditPrice,
  setChain,
  setChains,
  slotPrice,
  transferMoveset,
} from '../src/delve/moveset.js';
import { bindSecondary } from '../src/delve/pair.js';
import {
  createDelveProfile,
  fuseGear,
  parseDelveProfile,
  salvageItems,
  setAutoSalvage,
  unequipSlot,
} from '../src/delve/profile.js';
import V5 from './fixtures/delve-v5-saves.json';
```

Replace:

```ts
import type { GearItem, Rarity } from '../src/types/gear.js';
import type { ManaType } from '../src/types/mana.js';
```

with:

```ts
import type { GearItem, Moveset, Rarity } from '../src/types/gear.js';
import type { ManaType } from '../src/types/mana.js';
```

Append at the end of the file:

```ts
/** `w` with a moveset of these slots, every move its default in `w`'s mana. */
function slotted(w: GearItem, slots: Moveset['slots']): GearItem {
  return { ...w, moveset: defaultMoveset(registry, w, w.mana, slots) };
}

describe('Links: salvage, fusing and banking', () => {
  const rare = slotted(weapon('rare', 1, 'sword'), { basic: 4, primary: 3, defensive: 1 }); // 3 extra
  const hero = () => createDelveProfile(registry, 3, { primary: 'storm' });

  it('salvaging a weapon gives a Link for each extra slot; other gear none', () => {
    const chest = generateItem(
      registry,
      { uid: 'c', ilvl: 2, rarity: 'rare', slot: 'chest' },
      new SeededRNG(2),
    );
    const res = salvageItems(registry, { ...hero(), bag: [rare, chest] }, [rare.uid, chest.uid]);
    expect(res.links).toBe(3);
    expect(res.profile.links).toBe(3);
  });

  it('auto-salvage and a full bag give them too, and banking reports them for the dive', () => {
    const p = startDive(registry, setAutoSalvage(hero(), 'rare', true), 1);
    const w = beginFloor(registry, p);
    w.pending.items = [rare];
    const res = bankWorld(registry, p, w);
    expect(res.links).toBe(3);
    expect(res.profile.links).toBe(3);
    expect(res.profile.dive!.linksEarned).toBe(3);

    const full = { ...startDive(registry, hero(), 1), bag: Array(bal.loot.bagSize).fill(rare) };
    const w2 = beginFloor(registry, full);
    w2.pending.items = [rare];
    expect(bankWorld(registry, full, w2)).toMatchObject({ bagFull: true, links: 3 });
  });

  it('fusing three weapons refunds their extra slots as Links; the fused weapon rolls its own', () => {
    const magic = (uid: string, primary: number) => ({
      ...slotted(weapon('magic', 4, 'axe'), { basic: 3, primary, defensive: 1 }),
      uid,
    });
    const p = { ...hero(), scrap: 9999, bag: [magic('a', 2), magic('b', 1), magic('c', 2)] };
    const res = fuseGear(registry, p, ['a', 'b', 'c']);
    expect(res.ok).toBe(true);
    expect(res.links).toBe(2);
    expect(res.profile.links).toBe(2);
    expect(res.item!.rarity).toBe('rare');
    expect(extraSlots(registry, res.item!)).toBeGreaterThanOrEqual(1); // a rare's own 1–2
  });
});

describe('transfer', () => {
  const T = bal.movesets.transferScrap;
  /** A Fire hero wielding `w`, with scrap to spare, and `bag` in the bag. */
  const holding = (w: GearItem, ...bag: GearItem[]): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    return { ...p, equipped: { ...p.equipped, weapon: w }, bag, scrap: 1000 };
  };
  const built = (w: GearItem, chains: Moveset['chains'], slots: Moveset['slots']): GearItem => {
    const m = slotted(w, slots).moveset!;
    return { ...w, moveset: { chains: { ...m.chains, ...chains }, slots: m.slots } };
  };
  const lance: Chain = {
    moves: [
      { kind: 'heavy', form: 'lance', elements: ['fire'] },
      { kind: 'light', form: 'lance', elements: ['fire'] },
    ],
    payment: 'cast',
  };

  it("moves each chain with its extra slots onto the target's base, for scrap; the target's replaced extras come back as Links", () => {
    // A rare sword: a 4-slot string (1 extra), a 3-slot Primary (2), a 2-slot Defensive (1).
    const sword = built(
      weapon('rare', 1, 'sword'),
      { primary: lance },
      { basic: 4, primary: 3, defensive: 2 },
    );
    // A rare axe with its own extra Primary slot.
    const axe = slotted(
      { ...weapon('rare', 2, 'axe'), uid: 'axe' },
      { basic: 3, primary: 2, defensive: 1 },
    );
    const res = transferMoveset(registry, holding(sword, axe), 'axe');
    expect(res.ok).toBe(true);
    const moved = res.profile.equipped.weapon!;
    expect(moved.uid).toBe('axe');
    expect(moved.moveset!.slots).toEqual({ basic: 4, primary: 3, defensive: 2 });
    expect(moved.moveset!.chains).toEqual(sword.moveset!.chains);
    expect(res.links).toBe(1);
    expect(res.profile.links).toBe(1);
    expect(res.profile.scrap).toBe(1000 - 4 * T);
    // The sword goes back to the bag at its base slots, its moves the defaults in its own mana.
    expect(res.profile.bag).toEqual([
      { ...sword, moveset: defaultMoveset(registry, sword, sword.mana) },
    ]);
  });

  it('a basic chain onto a shorter string drops moves from the end; past the cap its extras come back as Links', () => {
    // A dagger's full string (4 + 1 extra) onto a maul (2): 3 slots, the last two blows gone.
    const dagger = slotted(weapon('magic', 3, 'dagger'), { basic: 5, primary: 1, defensive: 1 });
    const maul = { ...weapon('common', 4, 'maul'), uid: 'maul' };
    const res = transferMoveset(registry, holding(dagger, maul), 'maul');
    const basic = res.profile.equipped.weapon!.moveset!;
    expect(basic.slots.basic).toBe(3);
    expect(basic.chains.basic).toEqual(dagger.moveset!.chains.basic!.slice(0, 3));
    expect(res.profile.scrap).toBe(1000 - T);
    // A sword's 5-slot string (2 extra) onto a dagger (4): 5 slots, 1 Link back.
    const sword = slotted(weapon('rare', 5, 'sword'), { basic: 5, primary: 1, defensive: 1 });
    const onto = { ...weapon('common', 6, 'dagger'), uid: 'd' };
    const over = transferMoveset(registry, holding(sword, onto), 'd');
    expect(over.profile.equipped.weapon!.moveset!.slots.basic).toBe(5);
    expect(over.links).toBe(1);
    expect(over.profile.scrap).toBe(1000 - T);
  });

  it("leaves chains the target can't carry behind, their extras back as Links, and prices only what moves", () => {
    const epic = slotted(weapon('epic', 7, 'sword'), {
      basic: 3,
      primary: 2,
      defensive: 1,
      ultimate: 3,
    });
    const common = { ...weapon('common', 8, 'axe'), uid: 'axe' };
    const res = transferMoveset(registry, holding(epic, common), 'axe');
    const m = res.profile.equipped.weapon!.moveset!;
    expect(Object.keys(m.chains)).toEqual(['basic', 'primary']);
    expect(m.slots).toEqual({ basic: 3, primary: 2 });
    expect(res.links).toBe(2); // the Ultimate's two extras
    expect(res.profile.scrap).toBe(1000 - T); // the Primary's one extra moved
  });

  it("keeps the target's own chain for a skill only it carries", () => {
    const common = weapon('common', 9, 'sword');
    const epic = slotted(
      { ...weapon('epic', 10, 'axe'), uid: 'axe' },
      { basic: 3, primary: 1, defensive: 1, ultimate: 2 },
    );
    const res = transferMoveset(registry, holding(common, epic), 'axe');
    const m = res.profile.equipped.weapon!.moveset!;
    expect(m.chains.ultimate).toEqual(epic.moveset!.chains.ultimate);
    expect(m.slots).toEqual({ basic: 3, primary: 1, defensive: 1, ultimate: 2 });
    expect([res.links, res.profile.scrap]).toEqual([0, 1000]);
  });

  it('refuses mid-dive, unarmed, anything but a bag weapon, and without the scrap', () => {
    const sword = slotted(weapon('rare', 11, 'sword'), { basic: 3, primary: 3, defensive: 1 });
    const axe = { ...weapon('rare', 12, 'axe'), uid: 'axe' };
    const helm = generateItem(
      registry,
      { uid: 'helm', ilvl: 2, rarity: 'rare', slot: 'helm' },
      new SeededRNG(4),
    );
    const p = holding(sword, axe, helm);
    const reason = (q: DelveProfile, uid = 'axe') => transferMoveset(registry, q, uid).reason;
    expect(reason(startDive(registry, p, 1))).toBe('Transfer your moveset between dives');
    expect(reason(unequipSlot(registry, p, 'weapon'))).toBe('Equip a weapon to build your moves');
    expect(reason(p, p.equipped.chest!.uid)).toBe('Transfer onto a weapon in your bag');
    expect(reason(p, 'helm')).toBe('Transfer onto a weapon in your bag');
    expect(reason(p, 'nope')).toBe('Transfer onto a weapon in your bag');
    expect(reason({ ...p, scrap: 2 * bal.movesets.transferScrap - 1 })).toBe('Not enough scrap');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts)`
Expected: FAIL, 8 failed and 44 passed (52): the Links tests (`expected undefined to be 3`, `… to be 2`) and the transfer tests (`(0 , transferMoveset) is not a function`).

- [ ] **Step 3: Links, and the transfer**

In `packages/engine/src/loot/moveset.ts`:

Replace the lines from `import type {` up to (not including) `} from '../types/ability.js';` with:

```ts
import {
  CHAIN_SKILLS,
  type AbilityPayment,
  type AbilitySlot,
  type Chains,
  type ChainSkill,
  type FormId,
  type MoveKind,
```

Append at the end of the file:

```ts
/** What moving one weapon's moveset onto another gives (see `movesetTransfer`). */
export interface MovesetTransfer {
  /** The target's moveset once the chains have moved onto it. */
  moveset: Moveset;
  /** Extra slots that move: the price counts these. */
  moved: number;
  /**
   * Links back: the extras past the cap, the extras of chains the target
   * can't carry, and the target's own extras on the chains replaced.
   */
  links: number;
  /** Scrap: `transferScrap` for each extra slot that moves. */
  scrap: number;
}

/**
 * `source`'s moveset moved onto `target`: each chain the target carries keeps
 * its extra slots over the target's base (at most the cap, the rest back as
 * Links), its moves past the new slots dropped from the end; a chain the
 * target can't carry stays behind, its extras back as Links; the target's own
 * extras on the chains replaced come back as Links; and a skill only the
 * target carries keeps the target's chain.
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
  const chains = { ...onto.chains };
  const slots = { ...onto.slots };
  let moved = 0;
  let links = 0;
  for (const skill of CHAIN_SKILLS) {
    const chain = from.chains[skill];
    if (!chain) continue;
    const extra = from.slots[skill]! - baseSlots(registry, source.baseId, skill);
    if (!carried.includes(skill)) {
      links += extra;
      continue;
    }
    const base = baseSlots(registry, target.baseId, skill);
    const n = Math.min(base + extra, bal.chains.cap[skill]);
    links += base + extra - n + (onto.slots[skill]! - base);
    moved += n - base;
    const kept = Array.isArray(chain)
      ? chain.slice(0, n).map((b) => ({ ...b }))
      : {
          ...chain,
          moves: chain.moves.slice(0, n).map((m) => ({ ...m, elements: [...m.elements] })),
        };
    (chains as Record<ChainSkill, unknown>)[skill] = kept;
    slots[skill] = n;
  }
  return { moveset: { chains, slots }, moved, links, scrap: moved * bal.movesets.transferScrap };
}
```

In `packages/engine/src/delve/moveset.ts`:

Replace:

```ts
import { carriedByText, defaultKind, movesetOf } from '../loot/moveset.js';
import {
```

with:

```ts
import {
  carriedByText,
  defaultKind,
  defaultMoveset,
  movesetOf,
  movesetTransfer,
} from '../loot/moveset.js';
import {
```

Append at the end of the file:

```ts
/**
 * Move the equipped weapon's moveset onto weapon `uid` in the bag and equip
 * it, for scrap (`movesetTransfer`); its Links come back. The old weapon goes
 * to the bag at its base slots, its moves the defaults in its own mana.
 * Refuses mid-dive, unarmed, for anything but a bag weapon, and when it can't
 * be paid for.
 */
export function transferMoveset(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
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
  return {
    ok: true,
    item,
    links: t.links,
    profile: {
      ...profile,
      equipped: { ...profile.equipped, weapon: item },
      bag: [...profile.bag.filter((i) => i.uid !== uid), old],
      scrap: profile.scrap - t.scrap,
      links: profile.links + t.links,
    },
  };
}
```

In `packages/engine/src/delve/profile.ts`:

Replace:

```ts
import { baseSlots, carriedSkills, defaultChain, movesetOf } from '../loot/moveset.js';
import {
```

with:

```ts
import { baseSlots, carriedSkills, defaultChain, extraSlots, movesetOf } from '../loot/moveset.js';
import {
```

Replace:

```ts
  fixed?: ChainFix[];
}
```

with:

```ts
  fixed?: ChainFix[];
  /** Links the op gave back (a fuse's weapons' extra slots, a transfer's). */
  links?: number;
}
```

Replace:

```ts
  dust: number;
  bagFull: boolean;
```

with:

```ts
  dust: number;
  /** Links from the melted weapons' extra slots. */
  links: number;
  bagFull: boolean;
```

Replace the lines from `let bagFull = false;` up to (not including) `} else {` with:

```ts
  let links = 0;
  let bagFull = false;
  for (const item of items) {
    const auto = item.rarity !== 'legendary' && profile.autoSalvage[item.rarity];
    if (auto || bag.length >= bagSize) {
      if (!auto) bagFull = true;
      salvaged.push(item);
      scrap += salvageValue(registry, item);
      dust += salvageDust(registry, item, profile.pair);
      links += extraSlots(registry, item);
```

Replace the lines from `stats: { ...recorded.profile.stats, scrapEarned: recorded.profile.stats.scrapEarned + scrap },` up to (not including) `bagFull,` with:

```ts
      links: recorded.profile.links + links,
      stats: { ...recorded.profile.stats, scrapEarned: recorded.profile.stats.scrapEarned + scrap },
    },
    kept,
    salvaged,
    scrap,
    dust,
    links,
```

Replace the lines from `/** Salvage bag items. Locked or missing uids are skipped. Gear outside the pair also gives Mana Dust. */` up to (not including) `count,` with:

```ts
/**
 * Salvage bag items. Locked or missing uids are skipped. Gear outside the pair
 * also gives Mana Dust, and a weapon a Link for each extra slot.
 */
export function salvageItems(
  registry: DataRegistry,
  profile: DelveProfile,
  uids: string[],
): { profile: DelveProfile; scrap: number; dust: number; links: number; count: number } {
  const targets = new Set(uids);
  let scrap = 0;
  let dust = 0;
  let links = 0;
  let count = 0;
  const bag = profile.bag.filter((item) => {
    if (!targets.has(item.uid) || item.locked) return true;
    scrap += salvageValue(registry, item);
    dust += salvageDust(registry, item, profile.pair);
    links += extraSlots(registry, item);
    count++;
    return false;
  });
  return {
    profile: {
      ...profile,
      bag,
      scrap: profile.scrap + scrap,
      manaDust: profile.manaDust + dust,
      links: profile.links + links,
      stats: { ...profile.stats, scrapEarned: profile.stats.scrapEarned + scrap },
    },
    scrap,
    dust,
    links,
```

Replace:

```ts

export function fuseGear(
```

with:

```ts

/**
 * Fuse three bag items of one rarity into one of the next (`fuseItems`), for
 * scrap. The inputs' weapon extra slots come back as Links, as salvaging them
 * would give (`links`); a fused weapon rolls its own moveset.
 */
export function fuseGear(
```

Replace the lines from `const consumed = new Set(uids);` to the end of the file with:

```ts
  const links = inputs.reduce((sum, i) => sum + extraSlots(registry, i), 0);
  const consumed = new Set(uids);
  const recorded = recordFinds(
    {
      ...profile,
      bag: [...profile.bag.filter((i) => !consumed.has(i.uid)), result],
      scrap: profile.scrap - cost,
      links: profile.links + links,
      nextUid: profile.nextUid + 1,
      forgeCount: profile.forgeCount + 1,
    },
    [result],
  );
  return { ok: true, item: result, profile: recorded.profile, links };
}
```

In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
  dust: number;
}
```

with:

```ts
  dust: number;
  /** Links from weapons melted by auto-salvage or a full bag. */
  links: number;
}
```

Replace:

```ts
      dustEarned: dive.dustEarned + bagged.dust,
      potions: world.hero.potions,
```

with:

```ts
      dustEarned: dive.dustEarned + bagged.dust,
      linksEarned: dive.linksEarned + bagged.links,
      potions: world.hero.potions,
```

Replace:

```ts
    dust: bagged.dust,
  };
```

with:

```ts
    dust: bagged.dust,
    links: bagged.links,
  };
```

In `packages/engine/src/index.ts`:

Replace:

```ts
  slotPrice,
} from './delve/moveset.js';
```

with:

```ts
  slotPrice,
  transferMoveset,
} from './delve/moveset.js';
```

Replace:

```ts
} from './loot/moveset.js';
export {
```

with:

```ts
  movesetTransfer,
} from './loot/moveset.js';
export type { MovesetTransfer } from './loot/moveset.js';
export {
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts)`
Expected: PASS, 52 tests.

- [ ] **Step 5: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1404 tests pass in 77 files. **This is the last task every pacing rail holds in** (Task 12 lists them as "After Task 7").

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx prettier --write src/loot/moveset.ts src/delve/moveset.ts src/delve/profile.ts src/index.ts tests/delve-movesets.test.ts)
git add packages/engine/src/loot/moveset.ts packages/engine/src/delve/moveset.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/dive.ts packages/engine/src/index.ts packages/engine/tests/delve-movesets.test.ts
git commit -m "feat(engine): salvaged and fused weapons give Links; transferMoveset moves a moveset onto another weapon" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 9: Engine: valuing, the dive lock, and the autopilot

### Task 8: Weapons valued as a home; all gear locked mid-dive

- **Valuing:** `compareItem(equipped, item, registry, depth, pair?, value = 'home')` (`WeaponValue = 'home' | 'asIs'`). As a home, a weapon is valued with the equipped moveset moved onto it (`movesetTransfer`); as it is, with its own. Unarmed (nothing to move), or the equipped weapon itself, it values as it is. `salvageCandidates` and the autopilot's fusion spares use the default, so a good base is never marked junk.
- **`equipBest`** equips non-weapon gear only: a weapon changes by hand (the item sheet's Equip, as it is, or Transfer).
- **The dive lock:** mid-dive (`isDiveActive`: fighting or choosing), `equipItem` and `unequipSlot` throw `Equip at the Anvil, between dives` and `equipBest` changes nothing; the forge and salvage too (the Anvil can be visited with a dive still open): `upgradeGear`, `reforgeGear` and `fuseGear` refuse with `Forge at the Anvil, between dives`, and `salvageItems` melts nothing, while auto-salvage of new loot (`addLootToBag`) still runs, so a full bag never blocks pickups; `setChains`, `addSlot`, `transferMoveset` and `reattuneItem` already refuse; `chooseStartingMana` stays allowed. A dive that ended by death or extraction unlocks. (A stop's upgrade, Task 10, runs `upgradeGear` with the dive set aside.)

**The first-dive rail changes here** (the user's call, the spec's Balance section: "The first dive is a short scouting run"): with the dive lock the autopilot can no longer equip upgrades as they drop, and every seed's first dive ends at depth 3, so the rail's mean goes from "4 to 12" to "3 to 12" in this task, the one that first breaks it, and every commit stays green. The other rails stand.

**Files:**
- Modify: `packages/engine/src/delve/hero-stats.ts:20,499` (`WeaponValue`, `compareItem`)
- Modify: `packages/engine/src/delve/profile.ts:28,432,473,509,528,556,580,601` (the dive lock, the forge and salvage too, `equipBest`)
- Modify: `packages/engine/src/index.ts:129`
- Modify: `packages/engine/tests/delve-dive.test.ts:289` (`equipBest` never a weapon)
- Modify: `packages/engine/tests/delve-pair.test.ts:929` (`compareItem` as it is)
- Modify: `packages/engine/tests/delve-pacing.test.ts:39` (the first-dive rail; CRLF, never format)
- Modify: `packages/engine/tests/delve-movesets.test.ts` (imports, and two new blocks at the end)

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-movesets.test.ts`:

Replace the lines from `import { bindSecondary } from '../src/delve/pair.js';` up to (not including) `import { CHAIN_SKILLS, type Blow, type Chain, type Move } from '../src/types/ability.js';` with:

```ts
import { bindSecondary, chooseStartingMana, reattuneItem } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
  equipBest,
  equipItem,
  fuseGear,
  parseDelveProfile,
  profilePower,
  reforgeGear,
  salvageCandidates,
  salvageItems,
  setAutoSalvage,
  unequipSlot,
  upgradeGear,
} from '../src/delve/profile.js';
import V5 from './fixtures/delve-v5-saves.json';
import { abilityReady, nextMove, pressMove, pressStep } from '../src/arpg/abilities/cast.js';
import { gainCharge } from '../src/arpg/abilities/defend.js';
import { botInput } from '../src/arpg/bot.js';
import { applyStatus, hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { fillCharge, setSandboxToggles } from '../src/arpg/sandbox.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { compareItem, computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
```

Append at the end of the file:

```ts
describe('valuing a weapon: as it is, and as a home', () => {
  /** A Fire hero whose sword holds a 4-slot Primary, and `bag` in the bag. */
  const hero = (...bag: GearItem[]): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const sword = slotted(p.equipped.weapon!, { basic: 3, primary: 4 });
    return { ...p, equipped: { ...p.equipped, weapon: sword }, bag, scrap: 1000 };
  };
  /** The same sword as the hero's, one upgrade better, with its base moveset. */
  const spare = (p: DelveProfile): GearItem => ({
    ...p.equipped.weapon!,
    uid: 'spare',
    upgrade: 1,
    moveset: defaultMoveset(registry, p.equipped.weapon!, 'fire'),
  });

  it('as it is: its own moveset; as a home: the equipped moveset moved onto it (the default)', () => {
    const p0 = hero();
    const p = { ...p0, bag: [spare(p0)] };
    const cmp = (value?: 'home' | 'asIs') =>
      compareItem(p.equipped, p.bag[0], registry, 1, p.pair, value);
    expect(cmp('asIs').newPower).toBe(profilePower(registry, equipItem(registry, p, 'spare')));
    const moved = transferMoveset(registry, p, 'spare').profile;
    expect(cmp('home').newPower).toBe(profilePower(registry, moved));
    expect(cmp()).toEqual(cmp('home'));
    // A better base with fewer slots: junk as it is, an upgrade as a home.
    expect(cmp('asIs').powerPct).toBeLessThanOrEqual(0);
    expect(cmp('home').powerPct).toBeGreaterThan(0);
    // The equipped weapon itself, and unarmed (no moveset to move), value as they are.
    const worn = p.equipped.weapon!;
    expect(compareItem(p.equipped, worn, registry, 1, p.pair)).toEqual(
      compareItem(p.equipped, worn, registry, 1, p.pair, 'asIs'),
    );
    const bare = unequipSlot(registry, p, 'weapon');
    const axe = weapon('rare', 1, 'axe');
    expect(compareItem(bare.equipped, axe, registry, 1, bare.pair)).toEqual(
      compareItem(bare.equipped, axe, registry, 1, bare.pair, 'asIs'),
    );
  });

  it('salvage never marks a good base as junk; Equip best leaves the weapon alone', () => {
    const p0 = hero();
    const p = { ...p0, bag: [spare(p0)] };
    expect(salvageCandidates(registry, p, 'legendary')).toEqual([]);
    expect(equipBest(registry, p).equipped).toEqual([]);
  });
});

describe('the dive lock', () => {
  it('refuses every gear, moveset, forge and salvage op mid-dive, but the choice of mana; a dive that ended unlocks', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const axe = { ...weapon('rare', 2, 'axe'), uid: 'axe' };
    const helm = generateItem(
      registry,
      { uid: 'h', ilvl: 6, rarity: 'magic', slot: 'helm', mana: 'fire' },
      new SeededRNG(9),
    );
    const p = { ...p0, bag: [axe, helm], manaDust: 99, links: 99, scrap: 9999 };
    const diving = startDive(registry, p, 1);
    const anvil = 'Equip at the Anvil, between dives';
    expect(() => equipItem(registry, diving, 'axe')).toThrow(anvil);
    expect(() => unequipSlot(registry, diving, 'chest')).toThrow(anvil);
    expect(equipBest(registry, diving)).toEqual({ profile: diving, equipped: [] });
    const primary = chainsOf(diving).primary!;
    expect(setChain(registry, diving, 'primary', primary).ok).toBe(false);
    expect(addSlot(registry, diving, 'primary').ok).toBe(false);
    expect(transferMoveset(registry, diving, 'axe').ok).toBe(false);
    expect(reattuneItem(registry, diving, 'h', 'fire').reason).toBe('Re-attune between dives');
    // The forge and salvage too: the Anvil can be visited with a dive still open.
    const forge = 'Forge at the Anvil, between dives';
    expect(upgradeGear(registry, diving, 'h')).toMatchObject({ ok: false, reason: forge });
    expect(reforgeGear(registry, diving, 'h', 0)).toMatchObject({ ok: false, reason: forge });
    const triple = { ...diving, bag: [0, 1, 2].map((i) => ({ ...helm, uid: `f${i}` })) };
    expect(fuseGear(registry, triple, ['f0', 'f1', 'f2'])).toMatchObject({
      ok: false,
      reason: forge,
    });
    expect(salvageItems(registry, diving, ['h'])).toMatchObject({ profile: diving, count: 0 });
    // But auto-salvage of new loot still runs, so a full bag never blocks pickups.
    const auto = setAutoSalvage(diving, 'magic', true);
    expect(addLootToBag(registry, auto, [{ ...helm, uid: 'h2' }]).salvaged).toHaveLength(1);
    // The choice stays open mid-dive (a migrated save may be diving).
    const unchosen = startDive(registry, createDelveProfile(registry, 3), 1);
    expect(chooseStartingMana(registry, unchosen, 'frost').ok).toBe(true);
    // Death or extraction ends the lock.
    for (const phase of ['dead', 'extracted'] as const) {
      const over = { ...diving, dive: { ...diving.dive!, phase } };
      expect(equipItem(registry, over, 'axe').equipped.weapon!.uid).toBe('axe');
      expect(equipBest(registry, over).equipped.map((i) => i.uid)).toEqual(['h']);
      expect(upgradeGear(registry, over, 'h').ok).toBe(true);
    }
  });
});
```

In `packages/engine/tests/delve-dive.test.ts`:

Replace:

```ts
  it('equipBest picks upgrades', () => {
    const r = equipBest(registry, withBag(4));
    expect(r.equipped.length).toBeGreaterThan(0);
  });
```

with:

```ts
  it('equipBest picks upgrades, but never a weapon', () => {
    const p = withBag(4);
    const helm = generateItem(
      registry,
      { uid: 'h', ilvl: 6, rarity: 'magic', slot: 'helm', mana: 'fire' },
      new SeededRNG(9),
    );
    const r = equipBest(registry, { ...p, bag: [...p.bag, helm] });
    expect(r.equipped.map((i) => i.uid)).toEqual(['h']);
    expect(r.profile.equipped.weapon).toEqual(p.equipped.weapon);
  });
```

In `packages/engine/tests/delve-pair.test.ts`:

Replace the lines from `it('compareItem values a weapon with its own moveset', () => {` up to (not including) `describe('real stats read the pair', () => {` with:

```ts
  it('compareItem values a weapon as it is with its own moveset', () => {
    const maul: GearItem = { ...gear('fire', 'weapon', 'maul'), uid: 'maul' };
    const built = setChain(registry, hero(), 'basic', [
      { kind: 'light', element: 'storm' },
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'fire' },
    ]).profile;
    for (const q of [hero(), built]) {
      const bagged = { ...q, bag: [maul] };
      const cmp = compareItem(q.equipped, maul, registry, 1, q.pair, 'asIs');
      expect(cmp.power).toBe(profilePower(registry, bagged));
      expect(cmp.newPower).toBe(profilePower(registry, equipItem(registry, bagged, 'maul')));
    }
    // The maul fights with its own blows whatever the sword held.
    expect(compareItem(built.equipped, maul, registry, 1, built.pair, 'asIs').newPower).toBe(
      compareItem(hero().equipped, maul, registry, 1, built.pair, 'asIs').newPower,
    );
  });
});

```

In `packages/engine/tests/delve-pacing.test.ts`:

Replace:

```ts
    expect(endDepthAt(1)).toBeGreaterThanOrEqual(4);
    expect(endDepthAt(1)).toBeLessThanOrEqual(12);
```

with:

```ts
    // A short scouting run: gear is locked mid-dive (see the weapon movesets spec).
    expect(endDepthAt(1)).toBeGreaterThanOrEqual(3);
    expect(endDepthAt(1)).toBeLessThanOrEqual(12);
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts tests/delve-dive.test.ts tests/delve-pair.test.ts)`
Expected: FAIL, 4 failed and 124 passed (128): `equipBest picks upgrades, but never a weapon` (`expected [ 'b2', 'h' ] to deeply equal [ 'h' ]`), the two valuing tests (`expected 911 to be 957`, `expected [ 'spare' ] to deeply equal []`) and the dive lock (`expected [Function] to throw an error`).

- [ ] **Step 3: Valuing and the dive lock**

In `packages/engine/src/delve/hero-stats.ts`:

Replace:

```ts
import { heroChains } from '../loot/moveset.js';
import type { DelveBalance, HeroStats, HeroWeapon, ManaPair } from '../types/delve.js';
```

with:

```ts
import { heroChains, movesetTransfer } from '../loot/moveset.js';
import type { DelveBalance, HeroStats, HeroWeapon, ManaPair } from '../types/delve.js';
```

Replace the lines from `` * How equipping `item` (in its slot) would change the hero: a weapon fights `` up to (not including) `const { stats: beforeStats, estimate: before } = estimateLoadout(equipped, registry, depth, pair);` with:

```ts
 * How a weapon is valued: `home`, with the equipped weapon's moveset moved
 * onto it (`movesetTransfer`); `asIs`, with its own, as it would fight if
 * equipped now.
 */
export type WeaponValue = 'home' | 'asIs';

/**
 * How equipping `item` (in its slot) would change the hero. A weapon is valued
 * as `value` says (a home by default); unarmed, there is no moveset to move,
 * so as it is.
 */
export function compareItem(
  equipped: EquippedGear,
  item: GearItem,
  registry: DataRegistry,
  depth: number,
  /** The hero's pair (its basics and the two-element limit); none counts every element. */
  pair?: ManaPair,
  value: WeaponValue = 'home',
): ItemComparison {
  const replaced = equipped[item.slot];
  const worn = equipped.weapon;
  const home = value === 'home' && item.slot === 'weapon' && worn && worn.uid !== item.uid;
  const candidate = home
    ? { ...item, moveset: movesetTransfer(registry, worn, item).moveset }
    : item;
  const next = { ...equipped, [item.slot]: candidate };
```

In `packages/engine/src/delve/profile.ts`:

Replace:

```ts
import { chooseStartingMana, fixChainsToPair, salvageDust, type ChainFix } from './pair.js';
import { defaultBasic, defaultChains } from '../arpg/abilities/resolve.js';
```

with:

```ts
import { chooseStartingMana, fixChainsToPair, salvageDust, type ChainFix } from './pair.js';
import { isDiveActive } from './dive.js';
import { defaultBasic, defaultChains } from '../arpg/abilities/resolve.js';
```

Replace the lines from `/** Equip a bag item; a weapon brings its own moveset. */` up to (not including) `if (!item) return profile;` with:

```ts
/** Mid-dive, all gear is locked, the forge and salvage too (see the weapon movesets spec). */
const AT_THE_ANVIL = 'Equip at the Anvil, between dives';
const FORGE_LOCKED = 'Forge at the Anvil, between dives';

/** Equip a bag item; a weapon brings its own moveset. Throws mid-dive. */
export function equipItem(
  _registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
): DelveProfile {
  if (isDiveActive(profile)) throw new Error(AT_THE_ANVIL);
  const item = profile.bag.find((i) => i.uid === uid);
  if (!item) throw new Error(`Item not in bag: ${uid}`);
  const previous = profile.equipped[item.slot];
  const bag = profile.bag.filter((i) => i.uid !== uid);
  if (previous) bag.push(previous);
  return { ...profile, bag, equipped: { ...profile.equipped, [item.slot]: item } };
}

/** Unequip into the bag (a weapon keeps its moveset). Throws mid-dive. */
export function unequipSlot(
  registry: DataRegistry,
  profile: DelveProfile,
  slot: GearSlot,
): DelveProfile {
  if (isDiveActive(profile)) throw new Error(AT_THE_ANVIL);
  const item = profile.equipped[slot];
```

Replace the lines from `* also gives Mana Dust, and a weapon a Link for each extra slot.` up to (not including) `const targets = new Set(uids);` with:

```ts
 * also gives Mana Dust, and a weapon a Link for each extra slot. Mid-dive it
 * melts nothing (auto-salvage of new loot, `addLootToBag`, still runs).
 */
export function salvageItems(
  registry: DataRegistry,
  profile: DelveProfile,
  uids: string[],
): { profile: DelveProfile; scrap: number; dust: number; links: number; count: number } {
  if (isDiveActive(profile)) return { profile, scrap: 0, dust: 0, links: 0, count: 0 };
```

Replace:

```ts
/** Bag items that are safe to melt: unlocked, not an upgrade, at or below `maxRarity`. */
export function salvageCandidates(
```

with:

```ts
/** Bag items that are safe to melt: unlocked, not an upgrade (a weapon as a home), at or below `maxRarity`. */
export function salvageCandidates(
```

Replace the lines from `/** Greedily equip any bag item that raises Power (a weapon with its own moveset). */` up to (not including) `let best: GearItem | null = null;` with:

```ts
/**
 * Greedily equip any bag item that raises Power, but for weapons: a weapon
 * changes by hand (Equip, as it is, or Transfer). Nothing mid-dive.
 */
export function equipBest(
  registry: DataRegistry,
  profile: DelveProfile,
): { profile: DelveProfile; equipped: GearItem[] } {
  if (isDiveActive(profile)) return { profile, equipped: [] };
  let current = profile;
  const changed = new Map<GearSlot, GearItem>();
  for (let pass = 0; pass < 2; pass++) {
    for (const slot of GEAR_SLOTS) {
      if (slot === 'weapon') continue;
```

Replace:

```ts
export function upgradeGear(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
): ProfileActionResult {
  const found = findItem(profile, uid);
```

with:

```ts
/** One forge upgrade, for scrap. Refuses mid-dive (a stop's `takeStop` lifts the lock). */
export function upgradeGear(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
): ProfileActionResult {
  if (isDiveActive(profile)) return { ok: false, profile, reason: FORGE_LOCKED };
  const found = findItem(profile, uid);
```

Replace:

```ts
): ProfileActionResult {
  const found = findItem(profile, uid);
```

with:

```ts
): ProfileActionResult {
  if (isDiveActive(profile)) return { ok: false, profile, reason: FORGE_LOCKED };
  const found = findItem(profile, uid);
```

Replace the lines from `` * would give (`links`); a fused weapon rolls its own moveset. `` up to (not including) `const items = uids.map((uid) => profile.bag.find((i) => i.uid === uid));` with:

```ts
 * would give (`links`); a fused weapon rolls its own moveset. Refuses mid-dive.
 */
export function fuseGear(
  registry: DataRegistry,
  profile: DelveProfile,
  uids: string[],
): ProfileActionResult {
  if (isDiveActive(profile)) return { ok: false, profile, reason: FORGE_LOCKED };
```

In `packages/engine/src/index.ts`:

Replace:

```ts
  HeroStatsExtra,
} from './delve/hero-stats.js';
```

with:

```ts
  HeroStatsExtra,
  WeaponValue,
} from './delve/hero-stats.js';
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts tests/delve-dive.test.ts tests/delve-pair.test.ts)`
Expected: PASS, 128 tests in 3 files.

- [ ] **Step 5: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1407 tests pass (77 files), the pacing rails included. Without Step 1's rail change, exactly the first-dive rail would fail (`expected 3 to be greater than or equal to 4`); any failure is a regression: stop.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx prettier --write src/delve/hero-stats.ts src/delve/profile.ts src/index.ts tests/delve-movesets.test.ts tests/delve-dive.test.ts tests/delve-pair.test.ts)
git add packages/engine/src/delve/hero-stats.ts packages/engine/src/delve/profile.ts packages/engine/src/index.ts packages/engine/tests/delve-movesets.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-pacing.test.ts
git commit -m "feat(engine): weapons valued as a home for your moveset; all gear, the forge and salvage locked mid-dive" -m "The first dive becomes a short scouting run (the spec's decision): its pacing rail's mean goes from 4-12 to 3-12." -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: The autopilot transfers, fills slots and pays for its edits

Between dives, `visitForge` first moves the moveset onto the bag weapon with the best `compareItem` (a home) above 0, when it can pay (`transferBest`); then equips non-weapon gear, fuses and salvages as before; then spends Links on slots in the order Primary, basic chain, Ultimate, Defensive, each skill as far as its Links and scrap go (`spendLinks`: a slot it can't afford passes to the next skill's), before its forge upgrades (which stop at a refusal: since Task 8 the forge refuses during an open dive). `playFloor` no longer equips mid-floor (it banks loot only). `fusePrimary` already pays for its edit and skips it when it can't (Task 6); a test pins it here.

**Files:**
- Modify: `packages/engine/src/delve/autopilot.ts:9,23,83,154,179` (CRLF, never format)
- Modify: `packages/engine/tests/delve-movesets.test.ts` (an import, and a new block at the end)

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-movesets.test.ts`:

Replace:

```ts
import { GearItemSchema } from '../src/delve/profile-schema.js';
import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
```

with:

```ts
import { GearItemSchema } from '../src/delve/profile-schema.js';
import { betweenDives } from '../src/delve/autopilot.js';
import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
```

Append at the end of the file:

```ts
describe('the autopilot between dives', () => {
  /** A Fire hero after its first dive, wielding `w` (the starter sword by default). */
  const veteran = (w?: GearItem): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const weapon = w ?? p.equipped.weapon!;
    return { ...p, equipped: { ...p.equipped, weapon }, stats: { ...p.stats, dives: 1 } };
  };

  it('moves its moveset onto the bag weapon that makes the best home, when it can pay', () => {
    const p0 = veteran();
    const sword = slotted(p0.equipped.weapon!, { basic: 3, primary: 2 }); // 1 extra: 30 scrap
    const better = { ...p0.equipped.weapon!, uid: 'better', upgrade: 5 };
    const p = { ...veteran(sword), bag: [better] };
    const after = betweenDives(registry, { ...p, scrap: 1000 });
    expect(after.equipped.weapon!.uid).toBe('better');
    expect(after.equipped.weapon!.moveset!.chains).toEqual(sword.moveset!.chains);
    expect(betweenDives(registry, { ...p, scrap: 0 }).equipped.weapon!.uid).toBe(sword.uid);
  });

  it('spends Links in the order Primary, basic chain, Ultimate, Defensive, each as far as it can pay', () => {
    const epic = weapon('epic', 1, 'sword');
    const base = {
      ...veteran(slotted(epic, { basic: 3, primary: 1, defensive: 1, ultimate: 1 })),
      scrap: 9999,
    };
    const slots = (links: number) =>
      betweenDives(registry, { ...base, links }).equipped.weapon!.moveset!.slots;
    expect(slots(1)).toEqual({ basic: 3, primary: 2, defensive: 1, ultimate: 1 });
    // 1 + 2 + 3 + 4 for the Primary's four, then 3 for the sword's 4th basic slot.
    expect(slots(13)).toEqual({ basic: 4, primary: 5, defensive: 1, ultimate: 1 });
    // 10 for the Primary; the basic chain's 3 can't be paid, so the last 2 buy the Ultimate's and the Defensive's.
    expect(slots(12)).toEqual({ basic: 3, primary: 5, defensive: 2, ultimate: 2 });
  });

  it('pays for its fused Primary, and skips the edit when it cannot', () => {
    const helm = generateItem(
      registry,
      { uid: 'h', ilvl: 2, rarity: 'common', slot: 'helm', mana: 'storm' },
      new SeededRNG(3),
    );
    const p = { ...veteran(), bag: [helm] };
    const primary = (q: DelveProfile) => chainsOf(q).primary!.moves.map((m) => m.elements);
    const poor = betweenDives(registry, p);
    expect(poor.pair.secondary).toBe('storm');
    expect(primary(poor)).toEqual([['fire']]);
    const paid = betweenDives(registry, { ...p, manaDust: bal.movesets.elementDust });
    expect(primary(paid)).toEqual([['fire', 'storm']]);
    expect(paid.manaDust).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts)`
Expected: FAIL, 2 failed and 56 passed (58): the transfer (`expected 'g0' to be 'better'`) and the Links (`expected { basic: 3, primary: 1, …(2) } to deeply equal { basic: 3, primary: 2, …(2) }`). The paid Primary already passes.

- [ ] **Step 3: The autopilot**

In `packages/engine/src/delve/autopilot.ts`:

Replace:

```ts
import { refreshWorldHero } from '../arpg/world.js';
import {
```

with:

```ts
import {
```

Replace the lines from `import { bindSecondary, profileStats, resolveOvertake } from './pair.js';` up to (not including) `export interface AutopilotOptions {` with:

```ts
import { bindSecondary, resolveOvertake } from './pair.js';
import {
  createDelveProfile,
  equipBest,
  fuseGear,
  profilePower,
  referenceDepth,
  salvageCandidates,
  salvageItems,
  upgradeGear,
} from './profile.js';
import { addSlot, setChain, transferMoveset } from './moveset.js';
import type { ChainSkill } from '../types/ability.js';

/**
 * Plays whole dives with the arena bot, like a sensible player: fights every
 * floor (its gear locked, loot to the bag), picks doors, extracts when spent,
 * and between dives moves its moveset to a better weapon, equips upgrades,
 * forges and adds slots. Used by the pacing test and for balance sweeps.
 */

```

Replace the lines from `if (world.pending.items.length > 0) {` up to (not including) `if (world.cleared && (world.drops.length === 0 || world.t - world.clearedAt > 3)) break;` with:

```ts
    if (world.pending.items.length > 0) p = bankWorld(registry, p, world).profile;
```

Replace:

```ts
/** Between dives: fuse spare triples, melt junk, and pour scrap into upgrades. */
function visitForge(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = equipBest(registry, profile).profile;
  const depth = referenceDepth(p);
```

with:

```ts
/** The skills the bot adds slots to, in order: each as far as its Links and scrap go. */
const SLOT_ORDER: ChainSkill[] = ['primary', 'basic', 'ultimate', 'defensive'];

/**
 * Move the moveset onto the bag weapon that makes the best home (valued with
 * it moved: `compareItem`'s default), when that raises Power and it can pay.
 */
function transferBest(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const depth = referenceDepth(p);
  let best: { uid: string; pct: number } | null = null;
  for (const item of p.bag) {
    if (item.slot !== 'weapon') continue;
    const pct = compareItem(p.equipped, item, registry, depth, p.pair).powerPct;
    if (pct > (best?.pct ?? 0)) best = { uid: item.uid, pct };
  }
  if (!best) return p;
  const res = transferMoveset(registry, p, best.uid);
  return res.ok ? res.profile : p;
}

/**
 * Spend Links on slots in `SLOT_ORDER`: each skill's next slot while it can
 * pay, then the next skill's (a slot it can't afford passes to the next).
 */
function spendLinks(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  for (const skill of SLOT_ORDER)
    for (let res = addSlot(registry, p, skill); res.ok; res = addSlot(registry, p, skill))
      p = res.profile;
  return p;
}

/**
 * Between dives: move the moveset to a better weapon, equip upgrades, fuse
 * spare triples, melt junk, spend Links on slots, and pour scrap into upgrades.
 */
function visitForge(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = equipBest(registry, transferBest(registry, profile)).profile;
  const depth = referenceDepth(p);
```

Replace the lines from `p = salvageItems(registry, p, salvageCandidates(registry, p, 'epic')).profile;` up to (not including) `export function runAutopilot(` with:

```ts
  p = salvageItems(registry, p, salvageCandidates(registry, p, 'epic')).profile;
  p = spendLinks(registry, p);

  for (;;) {
    let cheapest: { uid: string; cost: number } | null = null;
    for (const slot of GEAR_SLOTS) {
      const item = p.equipped[slot];
      if (!item) continue;
      const cost = upgradeCost(registry, item);
      if (cost !== null && (!cheapest || cost < cheapest.cost)) cheapest = { uid: item.uid, cost };
    }
    if (!cheapest || cheapest.cost > p.scrap) break;
    const res = upgradeGear(registry, p, cheapest.uid);
    if (!res.ok) break; // the forge refuses mid-dive (an open dive)
    p = res.profile;
  }
  return p;
}

```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts)`
Expected: PASS, 58 tests.

- [ ] **Step 5: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1410 tests pass (77 files).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx prettier --write tests/delve-movesets.test.ts)
git add packages/engine/src/delve/autopilot.ts packages/engine/tests/delve-movesets.test.ts
git commit -m "feat(engine): the autopilot transfers its moveset, fills slots with Links, and never equips mid-floor" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 10: Engine: stops between depths

### Task 10: One power-up at each stop between depths

The spec's "Stops between depths" (added at `7d9e2e6`): after a depth is cleared, the door screen holds a stop, `DiveState.stop: { offers: StopKind[]; taken: boolean } | null`. `completeFloor` rolls it (`rollStop`, in a new module, `src/delve/stops.ts`) from the dive seed's fork `stop:<depth>`: of the kinds the banked hero can take and pay for right now (`stopKinds`: `equip` with a bag item; `slot` with a chain of the equipped weapon below its cap whose next slot's Links and scrap the hero has; `move` with a weapon equipped and `editDust` in Mana Dust, or free edits; `upgrade` with an item, equipped or in the bag, whose next upgrade it can pay), 2 or 3 at random, all of them when fewer apply, none: no stop. `takeStop(registry, profile, action)` (`StopAction`: `{ kind: 'equip', uid }`, `{ kind: 'slot', skill }`, `{ kind: 'move', skill, index, move }` or `{ kind: 'upgrade', uid }`) checks that the stop is open and offers the kind, runs the one op at its normal price with the dive lock lifted for it alone (the op runs on the profile with its dive set aside), and marks the stop taken; a refused op leaves it open. Equipping is free and a weapon brings its own moveset; `move` changes one move of one chain through `setChain`, priced by `movesetEditPrice` (a whole index the chain holds, a move of the chain's shape, and a changed one); `upgrade` is `upgradeGear`. The dive lock refuses everything else, as before. A door ends the stop (`chooseDoor` clears it), a new dive starts without one, and a save whose dive has none reads as `null`.

**Files:**
- Create: `packages/engine/src/delve/stops.ts`
- Create: `packages/engine/tests/delve-stops.test.ts`
- Modify: `packages/engine/src/types/delve.ts:668,687` (`StopKind`, `DiveStop`, `DiveState.stop`)
- Modify: `packages/engine/src/delve/profile-schema.ts:168` (`DiveSchema.stop`; CRLF, never format)
- Modify: `packages/engine/src/delve/dive.ts:11,49,222,271` (the roll, and clearing it; CRLF, never format)
- Modify: `packages/engine/src/index.ts:174`
- Modify: `packages/engine/tests/delve-movesets.test.ts:453` (a migrated dive holds no stop)

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/tests/delve-stops.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import { beginFloor, chooseDoor, completeFloor, startDive } from '../src/delve/dive.js';
import { addSlot } from '../src/delve/moveset.js';
import {
  createDelveProfile,
  equipItem,
  parseDelveProfile,
  unequipSlot,
} from '../src/delve/profile.js';
import { STOP_KINDS, rollStop, stopKinds, takeStop } from '../src/delve/stops.js';
import { generateItem } from '../src/loot/item-generator.js';
import { upgradeCost } from '../src/loot/smithing.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile, DiveStop, StopKind } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';
import { bal, chainsOf, registry, run } from './fixtures/arena.js';

// See the weapon movesets spec's "Stops between depths".

const ring = (uid: string, seed = 1): GearItem =>
  generateItem(
    registry,
    { uid, ilvl: 2, rarity: 'magic', slot: 'ring', mana: 'fire' },
    new SeededRNG(seed),
  );

/** A Fire hero with a ring in the bag. */
const hero = (): DelveProfile => ({
  ...createDelveProfile(registry, 3, { primary: 'fire' }),
  bag: [ring('r1')],
});

/** `p` diving, on the door screen after depth 1, holding `stop`. */
function atStop(p: DelveProfile, stop: DiveStop | null): DelveProfile {
  const diving = startDive(registry, p, 1);
  const dive = diving.dive!;
  return {
    ...diving,
    dive: { ...dive, phase: 'choosing', depthsCleared: 1, doorChoices: ['winding'], stop },
  };
}

const ALL: DiveStop = { offers: [...STOP_KINDS], taken: false };

describe('the stop after a cleared depth', () => {
  it('holds 2 or 3 of the kinds that apply, the same from the same dive', () => {
    const p = startDive(registry, { ...hero(), scrap: 1000, manaDust: 50 }, 1);
    const clear = () => {
      const world = beginFloor(registry, p);
      const ctx = makeCtx(registry, world, []);
      for (const m of [...world.monsters]) hitMonster(ctx, m, 1e12, null, { source: 'skill' });
      run(world, 5);
      return completeFloor(registry, p, world).profile;
    };
    const once = clear();
    expect(once.dive!.phase).toBe('choosing');
    const stop = once.dive!.stop!;
    expect(stop.taken).toBe(false);
    expect(stop.offers.length).toBeGreaterThanOrEqual(2);
    expect(stop.offers.length).toBeLessThanOrEqual(3);
    for (const k of stop.offers) expect(stopKinds(registry, once)).toContain(k);
    expect(clear().dive!.stop).toEqual(stop);
  });

  it('offers only what the hero can take and pay for: a bag item, a slot, an edit, an upgrade', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const p = { ...p0, stats: { ...p0.stats, dives: 1 } }; // past the free edits
    expect(upgradeCost(registry, p.equipped.chest!)).toBe(10);
    expect(stopKinds(registry, p)).toEqual([]); // no bag, Links, scrap or Mana Dust
    const rich = { ...p, bag: [ring('r1')], links: 1, scrap: 20, manaDust: bal.movesets.editDust };
    expect(stopKinds(registry, rich)).toEqual([...STOP_KINDS]);
    expect(stopKinds(registry, { ...rich, links: 0 })).toEqual(['equip', 'move', 'upgrade']);
    expect(stopKinds(registry, { ...rich, scrap: 19 })).toEqual(['equip', 'move', 'upgrade']);
    expect(stopKinds(registry, { ...rich, scrap: 9 })).toEqual(['equip', 'move']);
    expect(stopKinds(registry, { ...rich, manaDust: 4 })).toEqual(['equip', 'slot', 'upgrade']);
    expect(stopKinds(registry, { ...rich, manaDust: 0, stats: p0.stats })).toEqual([...STOP_KINDS]);
    const maxed = (i: GearItem): GearItem => ({ ...i, upgrade: bal.forge.maxUpgrade });
    const bare = unequipSlot(registry, p, 'weapon');
    const spent: DelveProfile = {
      ...bare,
      bag: [],
      equipped: { chest: maxed(bare.equipped.chest!) },
    };
    expect(stopKinds(registry, spent)).toEqual([]);
    expect(rollStop(registry, spent, startDive(registry, spent, 1).dive!)).toBeNull();
  });

  it('offers 2 or 3 at random in the kinds order, all of them when only two apply', () => {
    const p = { ...hero(), links: 5, scrap: 1000 };
    const counts = new Set<number>();
    const seen = new Set<StopKind>();
    for (let seed = 1; seed <= 40; seed++) {
      const dive = { ...startDive(registry, p, 1).dive!, seed };
      const stop = rollStop(registry, p, dive)!;
      counts.add(stop.offers.length);
      stop.offers.forEach((k) => seen.add(k));
      expect(stop.offers).toEqual(STOP_KINDS.filter((k) => stop.offers.includes(k)));
    }
    expect([...counts].sort()).toEqual([2, 3]);
    expect([...seen].sort()).toEqual([...STOP_KINDS].sort());
    const two = { ...createDelveProfile(registry, 3, { primary: 'fire' }), scrap: 1000 };
    const dive = startDive(registry, two, 1).dive!;
    expect(rollStop(registry, two, dive)).toEqual({ offers: ['move', 'upgrade'], taken: false });
    // One kind that applies: that one alone.
    const bare = unequipSlot(registry, two, 'weapon');
    const one = { ...bare, bag: [] };
    expect(rollStop(registry, one, dive)).toEqual({ offers: ['upgrade'], taken: false });
  });
});

describe('takeStop', () => {
  it('equips a bag item for free with the lock lifted, and marks the stop taken', () => {
    const p = atStop(hero(), ALL);
    const res = takeStop(registry, p, { kind: 'equip', uid: 'r1' });
    expect(res.ok).toBe(true);
    expect(res.item!.uid).toBe('r1');
    expect(res.profile.equipped.ring!.uid).toBe('r1');
    expect(res.profile.scrap).toBe(p.scrap);
    expect(res.profile.dive).toEqual({ ...p.dive, stop: { ...ALL, taken: true } });
    expect(takeStop(registry, res.profile, { kind: 'upgrade', uid: 'r1' }).reason).toBe(
      "This stop's power-up is taken",
    );
  });

  it('adds a slot, adjusts one move, or upgrades an item, each at its normal price', () => {
    const p = { ...atStop(hero(), ALL), links: 5, scrap: 1000, manaDust: 50 };
    const slot = takeStop(registry, p, { kind: 'slot', skill: 'primary' });
    expect(slot.profile).toMatchObject({ links: 4, scrap: 980 });
    expect(slot.profile.equipped.weapon!.moveset!.slots.primary).toBe(2);
    const bolt = chainsOf(p).primary!.moves[0];
    const move = takeStop(registry, p, {
      kind: 'move',
      skill: 'primary',
      index: 0,
      move: { ...bolt, kind: 'heavy' },
    });
    expect(chainsOf(move.profile).primary!.moves[0].kind).toBe('heavy');
    expect(move.profile.manaDust).toBe(50 - bal.movesets.editDust);
    const chest = p.equipped.chest!;
    const up = takeStop(registry, p, { kind: 'upgrade', uid: chest.uid });
    expect(up.profile.equipped.chest!.upgrade).toBe(1);
    expect(up.profile.scrap).toBe(1000 - upgradeCost(registry, chest)!);
    for (const r of [slot, move, up]) expect(r.profile.dive!.stop!.taken).toBe(true);
  });

  it('refuses a kind not offered, no stop, and leaves the stop open when the op is refused', () => {
    const p = atStop(hero(), { offers: ['equip', 'slot'], taken: false });
    expect(takeStop(registry, p, { kind: 'upgrade', uid: 'r1' }).reason).toBe(
      'Not offered at this stop',
    );
    const poor = takeStop(registry, p, { kind: 'slot', skill: 'primary' });
    expect(poor).toMatchObject({ ok: false, reason: 'Not enough Links', profile: p });
    const fighting = startDive(registry, hero(), 1);
    expect(takeStop(registry, fighting, { kind: 'equip', uid: 'r1' }).reason).toBe('No stop here');
    const moved = atStop(hero(), ALL);
    const far = takeStop(registry, moved, {
      kind: 'move',
      skill: 'primary',
      index: 3,
      move: chainsOf(moved).primary!.moves[0],
    });
    expect(far.reason).toBe('Adjust a move the chain holds');
    const bolt = chainsOf(moved).primary!.moves[0];
    const at = (index: number, move: object) =>
      takeStop(registry, moved, { kind: 'move', skill: 'primary', index, move: move as never })
        .reason;
    expect(at(0.5, { ...bolt, kind: 'heavy' })).toBe('Adjust a move the chain holds');
    expect(at(0, bolt)).toBe('Change the move');
    expect(at(0, { kind: 'heavy', element: 'fire' })).toBe('Not a primary move');
    const nothing = takeStop(registry, moved, {
      kind: 'move',
      skill: 'defensive',
      index: 0,
      move: { kind: 'medium', form: 'ward', elements: ['fire'] },
    });
    expect(nothing.reason).toBe('Carried by magic weapons and better');
    expect(takeStop(registry, moved, { kind: 'equip', uid: 'nope' }).reason).toBe(
      'Item not in bag: nope',
    );
  });

  it('the dive lock refuses everything else at a stop; a door ends it and a new dive starts without one', () => {
    const p = { ...atStop(hero(), ALL), links: 5, scrap: 1000 };
    expect(() => equipItem(registry, p, 'r1')).toThrow('Equip at the Anvil, between dives');
    expect(addSlot(registry, p, 'primary').reason).toBe('Chains can only change between dives');
    const next = chooseDoor(registry, p, 'winding');
    expect(next.dive!.stop).toBeNull();
    expect(startDive(registry, hero(), 1).dive!.stop).toBeNull();
  });

  it('the save keeps the stop; a dive saved without one reads as none', () => {
    const p = atStop(hero(), { offers: ['equip', 'move'], taken: true });
    const json = (x: unknown) => JSON.parse(JSON.stringify(x));
    expect(parseDelveProfile(registry, json(p))!.profile.dive!.stop).toEqual(p.dive!.stop);
    const { stop: _stop, ...older } = p.dive!;
    expect(parseDelveProfile(registry, json({ ...p, dive: older }))!.profile.dive!.stop).toBeNull();
  });
});
```


In `packages/engine/tests/delve-movesets.test.ts`:

Replace:

```ts
    expect(profile.dive).toEqual({ ...V5.magic.dive, linksEarned: 0 });
  });
```

with:

```ts
    expect(profile.dive).toEqual({ ...V5.magic.dive, linksEarned: 0, stop: null });
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-stops.test.ts tests/delve-movesets.test.ts)`
Expected: FAIL, both files: `delve-stops.test.ts` doesn't load (`Error: Cannot find module '../src/delve/stops.js'`), and in `delve-movesets.test.ts` 1 test fails of 58 (the migrated dive: `expected { seed: 1862841992, …(16) } to deeply equal { seed: 1862841992, …(17) }`, no `stop` yet).

- [ ] **Step 3: The stop**

In `packages/engine/src/types/delve.ts`:

Replace:

```ts

export interface DiveState {
```

with:

```ts

/** A stop's power-up: equip a bag item, add a slot, adjust one move, or upgrade an item. */
export type StopKind = 'equip' | 'slot' | 'move' | 'upgrade';

/** A stop between depths (see the weapon movesets spec): the kinds offered, and whether one is taken. */
export interface DiveStop {
  offers: StopKind[];
  taken: boolean;
}

export interface DiveState {
```

Replace:

```ts
  linksEarned: number;
  found: Record<Rarity, number>;
```

with:

```ts
  linksEarned: number;
  /** The door screen's stop: the power-up offered after the depth just cleared (null: none). */
  stop: DiveStop | null;
  found: Record<Rarity, number>;
```

In `packages/engine/src/delve/profile-schema.ts`:

Replace:

```ts
  linksEarned: z.number().int().min(0).default(0),
  found: PerRarityCount,
```

with:

```ts
  linksEarned: z.number().int().min(0).default(0),
  stop: z
    .object({
      offers: z.array(z.enum(['equip', 'slot', 'move', 'upgrade'])),
      taken: z.boolean(),
    })
    .nullable()
    .default(null),
  found: PerRarityCount,
```

Create `packages/engine/src/delve/stops.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import { carriedByText, movesetOf } from '../loot/moveset.js';
import { upgradeCost } from '../loot/smithing.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import {
  CHAIN_SKILLS,
  type Blow,
  type Chains,
  type ChainSkill,
  type Move,
} from '../types/ability.js';
import type { DelveProfile, DiveState, DiveStop, StopKind } from '../types/delve.js';
import { GEAR_SLOTS, type GearItem } from '../types/gear.js';
import { addSlot, setChain, slotPrice } from './moveset.js';
import { equipItem, upgradeGear, type ProfileActionResult } from './profile.js';

/**
 * Stops between depths (see the weapon movesets spec): after a depth is
 * cleared, the door screen holds one power-up, taken with the dive lock lifted
 * for that one op. dive.ts imports this module back: keep to function declarations.
 */

/** The four kinds, in the order a stop lists them. */
export const STOP_KINDS: readonly StopKind[] = ['equip', 'slot', 'move', 'upgrade'] as const;

/** What a stop's player takes: the kind and what it acts on. */
export type StopAction =
  | { kind: 'equip'; uid: string }
  | { kind: 'slot'; skill: ChainSkill }
  | { kind: 'move'; skill: ChainSkill; index: number; move: Move | Blow }
  | { kind: 'upgrade'; uid: string };

/**
 * The kinds whose cheapest action `profile` can take and pay for now: `equip`
 * with an item in the bag; `slot` with a chain of the equipped weapon below
 * its cap whose next slot's Links and scrap the hero has; `move` with a weapon
 * equipped and `editDust` in Mana Dust (or free edits, before the first dive);
 * `upgrade` with an item, equipped or in the bag, whose next upgrade it can pay.
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
  };
  return STOP_KINDS.filter((k) => applies[k]);
}

/** Whether one move's edit is affordable: free edits (before the first dive), or `editDust` in Mana Dust. */
function canEdit(registry: DataRegistry, profile: DelveProfile): boolean {
  return (
    profile.stats.dives === 0 || profile.manaDust >= registry.getDelveBalance().movesets.editDust
  );
}

/**
 * The stop after `dive`'s depth is cleared (`completeFloor`): 2 or 3 of the
 * kinds that apply, at random from the dive seed's fork `stop:<depth>`, or all
 * of them when fewer apply; none apply, no stop.
 */
export function rollStop(
  registry: DataRegistry,
  profile: DelveProfile,
  dive: DiveState,
): DiveStop | null {
  const kinds = stopKinds(registry, profile);
  if (kinds.length === 0) return null;
  const rng = new SeededRNG(dive.seed).fork(`stop:${dive.depth}`);
  const count = rng.nextInt(2, 3);
  const pool = [...kinds];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = new Set(pool.slice(0, count));
  return { offers: kinds.filter((k) => picked.has(k)), taken: false };
}

/** A move as it is: its kind, form and elements (a blow: its kind and element). */
function moveKey(m: Move | Blow): string {
  return 'element' in m ? `${m.kind}|${m.element}` : `${m.kind}|${m.form}|${m.elements.join('+')}`;
}

/** A chain with move `index` replaced by `move` (its payment kept). */
function withMove(chain: Chains[ChainSkill], index: number, move: Move | Blow): Chains[ChainSkill] {
  if (Array.isArray(chain)) return chain.map((b, i) => (i === index ? (move as Blow) : b));
  return { ...chain, moves: chain.moves.map((m, i) => (i === index ? (move as Move) : m)) };
}

/** The stop's one op on `profile` (whose dive the caller has lifted). */
function runStop(
  registry: DataRegistry,
  profile: DelveProfile,
  action: StopAction,
): ProfileActionResult {
  switch (action.kind) {
    case 'equip':
      try {
        const next = equipItem(registry, profile, action.uid);
        const item = GEAR_SLOTS.map((s) => next.equipped[s]).find((i) => i?.uid === action.uid);
        return { ok: true, profile: next, item };
      } catch (e) {
        return { ok: false, profile, reason: (e as Error).message };
      }
    case 'slot':
      return addSlot(registry, profile, action.skill);
    case 'move': {
      const weapon = profile.equipped.weapon;
      if (!weapon) return { ok: false, profile, reason: 'Equip a weapon to build your moves' };
      const chain = movesetOf(registry, weapon).chains[action.skill];
      if (!chain) return { ok: false, profile, reason: carriedByText(registry, action.skill) };
      const moves: (Move | Blow)[] = Array.isArray(chain) ? chain : chain.moves;
      const { index, move } = action;
      if (!Number.isInteger(index) || index < 0 || index >= moves.length)
        return { ok: false, profile, reason: 'Adjust a move the chain holds' };
      if (Array.isArray(chain) === 'form' in move)
        return { ok: false, profile, reason: `Not a ${action.skill} move` };
      if (moveKey(move) === moveKey(moves[index]))
        return { ok: false, profile, reason: 'Change the move' };
      return setChain(registry, profile, action.skill, withMove(chain, index, move));
    }
    case 'upgrade':
      return upgradeGear(registry, profile, action.uid);
  }
}

/**
 * Take the stop's power-up: its kind must be offered and the stop not yet
 * taken. The op runs at its normal price with the dive lock lifted for it
 * alone (equipping is free, and a weapon brings its own moveset); `move`
 * changes one move of one chain. A refused op leaves the stop open; one taken
 * marks it taken. Skipping is choosing a door.
 */
export function takeStop(
  registry: DataRegistry,
  profile: DelveProfile,
  action: StopAction,
): ProfileActionResult {
  const dive = profile.dive;
  const stop = dive?.phase === 'choosing' ? dive.stop : null;
  if (!dive || !stop) return { ok: false, profile, reason: 'No stop here' };
  if (stop.taken) return { ok: false, profile, reason: "This stop's power-up is taken" };
  if (!stop.offers.includes(action.kind))
    return { ok: false, profile, reason: 'Not offered at this stop' };
  const res = runStop(registry, { ...profile, dive: null }, action);
  if (!res.ok) return { ...res, profile };
  return { ...res, profile: { ...res.profile, dive: { ...dive, stop: { ...stop, taken: true } } } };
}
```


In `packages/engine/src/delve/dive.ts`:

Replace:

```ts
import { heroChains } from '../loot/moveset.js';
import { pairElements } from './hero-stats.js';
```

with:

```ts
import { heroChains } from '../loot/moveset.js';
import { rollStop } from './stops.js';
import { pairElements } from './hero-stats.js';
```

Replace:

```ts
    linksEarned: 0,
    found: Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>,
```

with:

```ts
    linksEarned: 0,
    stop: null,
    found: Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>,
```

Replace:

```ts
  nextDive = { ...nextDive, doorChoices: rollDoorChoices(registry, nextDive) };

```

with:

```ts
  nextDive = {
    ...nextDive,
    doorChoices: rollDoorChoices(registry, nextDive),
    stop: rollStop(registry, banked.profile, nextDive),
  };

```

Replace:

```ts
      doorChoices: [],
      phase: 'fighting',
```

with:

```ts
      doorChoices: [],
      stop: null,
      phase: 'fighting',
```

In `packages/engine/src/index.ts`:

Replace:

```ts
} from './delve/moveset.js';
export type { ProfileActionResult, ParsedDelveProfile } from './delve/profile.js';
```

with:

```ts
} from './delve/moveset.js';
export { STOP_KINDS, stopKinds, rollStop, takeStop } from './delve/stops.js';
export type { StopAction } from './delve/stops.js';
export type { ProfileActionResult, ParsedDelveProfile } from './delve/profile.js';
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-stops.test.ts tests/delve-movesets.test.ts)`
Expected: PASS, 66 tests in 2 files.

- [ ] **Step 5: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1418 tests pass (78 files).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx prettier --write src/delve/stops.ts src/types/delve.ts src/index.ts tests/delve-stops.test.ts tests/delve-movesets.test.ts)
git add packages/engine/src/delve/stops.ts packages/engine/src/types/delve.ts packages/engine/src/delve/profile-schema.ts packages/engine/src/delve/dive.ts packages/engine/src/index.ts packages/engine/tests/delve-stops.test.ts packages/engine/tests/delve-movesets.test.ts
git commit -m "feat(engine): a stop between depths: one power-up on the door screen, taken with the dive lock lifted for it" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 11: Engine: the autopilot takes stops, and the balance gate

### Task 11: The autopilot takes a stop

`takeBestStop(registry, profile)`, the spec's preference at a stop: equip the bag item that beats its gear the most as it is (`compareItem(…, 'asIs')`); otherwise upgrade its cheapest affordable equipped item; otherwise add an affordable slot, in `SLOT_ORDER`; otherwise skip (the door). `runAutopilot` takes it on each door screen before choosing a door. A weapon equipped at a stop brings its own moves, and re-fusing its Primary after the dive is a paid edit the bot may not afford, so the pair test that pinned a fused Primary after one dive now pins it where it holds (right after the bind) and keeps the reaction's check on the dive.

**Files:**
- Modify: `packages/engine/src/delve/autopilot.ts:34,181,250` (CRLF, never format)
- Modify: `packages/engine/src/index.ts:209`
- Modify: `packages/engine/tests/delve-stops.test.ts` (an import, and a new block at the end)
- Modify: `packages/engine/tests/delve-pair.test.ts:1209`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-stops.test.ts`:

Replace:

```ts
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import { beginFloor, chooseDoor, completeFloor, startDive } from '../src/delve/dive.js';
```

with:

```ts
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import { takeBestStop } from '../src/delve/autopilot.js';
import { beginFloor, chooseDoor, completeFloor, startDive } from '../src/delve/dive.js';
```

Append at the end of the file:

```ts
describe('the autopilot at a stop', () => {
  const stopOf = (...offers: StopKind[]): DiveStop => ({ offers, taken: false });
  const plain = (uid: string): GearItem =>
    generateItem(
      registry,
      { uid, ilvl: 1, rarity: 'common', slot: 'ring', mana: 'fire' },
      new SeededRNG(2),
    );

  it('equips the bag item that beats its gear the most, as it is, for free', () => {
    const p = { ...atStop(hero(), stopOf('equip', 'upgrade')), scrap: 1000 };
    const both = { ...p, bag: [plain('weak'), ...p.bag] };
    const after = takeBestStop(registry, both);
    expect(after.equipped.ring!.uid).toBe('r1');
    expect(after.scrap).toBe(1000);
    expect(after.dive!.stop!.taken).toBe(true);
  });

  it('else upgrades its cheapest affordable equipped item', () => {
    const p0 = atStop(hero(), stopOf('equip', 'upgrade'));
    // A copy of its own sword beats nothing, so it upgrades instead. The sword, once upgraded,
    // costs more than the cuirass: the cuirass goes first, and only while scrap covers it.
    const sword = { ...p0.equipped.weapon!, upgrade: 3 };
    const chest = p0.equipped.chest!;
    const cost = upgradeCost(registry, chest)!;
    expect(upgradeCost(registry, sword)!).toBeGreaterThan(cost);
    const p = {
      ...p0,
      equipped: { ...p0.equipped, weapon: sword },
      bag: [{ ...sword, uid: 'twin' }],
      scrap: cost,
    };
    const after = takeBestStop(registry, p);
    expect(after.equipped.chest!.upgrade).toBe(1);
    expect(after.scrap).toBe(0);
    expect(takeBestStop(registry, { ...p, scrap: cost - 1 })).toEqual({ ...p, scrap: cost - 1 });
  });

  it('else adds an affordable slot, the Primary first; else skips', () => {
    const p = { ...atStop(hero(), stopOf('slot', 'move')), links: 5, scrap: 1000 };
    expect(takeBestStop(registry, p).equipped.weapon!.moveset!.slots.primary).toBe(2);
    const broke = { ...atStop(hero(), stopOf('move', 'upgrade')), scrap: 0 };
    expect(takeBestStop(registry, broke)).toBe(broke);
  });
});
```

In `packages/engine/tests/delve-pair.test.ts`:

Replace the lines from `const { profile } = runAutopilot(registry, {` up to (not including) `it('lets an overtaking secondary swap in, and rebuilds its Primary to match', () => {` with:

```ts
    const after = (dives: number) =>
      runAutopilot(registry, { seed: 1, dives, primary: 'storm', secondary: 'earth' }).profile;
    const start = after(0);
    expect(start.pair).toEqual({ primary: 'storm', secondary: 'earth' });
    expect(primaryElements(start)).toEqual(['storm+earth']);
    // A weapon equipped at a stop brings its own moves; the reaction was found all the same.
    expect(after(1).reactionsSeen).toContain('lightning_rod');
  });

```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-stops.test.ts tests/delve-pair.test.ts)`
Expected: FAIL, 3 failed and 60 passed (63): the new block's tests, with `(0 , takeBestStop) is not a function`. The pair test passes before and after (the bot takes no stops yet).

- [ ] **Step 3: The stop policy**

In `packages/engine/src/delve/autopilot.ts`:

Replace:

```ts
import { addSlot, setChain, transferMoveset } from './moveset.js';
import type { ChainSkill } from '../types/ability.js';
```

with:

```ts
import { addSlot, setChain, transferMoveset } from './moveset.js';
import { takeStop, type StopAction } from './stops.js';
import type { ChainSkill } from '../types/ability.js';
```

Replace:

```ts
/**
 * Between dives: move the moveset to a better weapon, equip upgrades, fuse
```

with:

```ts
/**
 * At a stop between depths, by preference: equip the bag item that beats its
 * gear the most as it is; else upgrade its cheapest affordable equipped item;
 * else add an affordable slot (in `SLOT_ORDER`); else skip (the door).
 */
export function takeBestStop(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const stop = profile.dive?.stop;
  if (!stop || stop.taken) return profile;
  const take = (action: StopAction) => {
    const res = takeStop(registry, profile, action);
    return res.ok ? res.profile : null;
  };
  if (stop.offers.includes('equip')) {
    const depth = referenceDepth(profile);
    let best: { uid: string; pct: number } | null = null;
    for (const item of profile.bag) {
      const pct = compareItem(profile.equipped, item, registry, depth, profile.pair, 'asIs').powerPct;
      if (pct > (best?.pct ?? 0)) best = { uid: item.uid, pct };
    }
    const equipped = best && take({ kind: 'equip', uid: best.uid });
    if (equipped) return equipped;
  }
  if (stop.offers.includes('upgrade')) {
    let cheapest: { uid: string; cost: number } | null = null;
    for (const slot of GEAR_SLOTS) {
      const item = profile.equipped[slot];
      const cost = item ? upgradeCost(registry, item) : null;
      if (item && cost !== null && cost <= profile.scrap && (!cheapest || cost < cheapest.cost))
        cheapest = { uid: item.uid, cost };
    }
    const upgraded = cheapest && take({ kind: 'upgrade', uid: cheapest.uid });
    if (upgraded) return upgraded;
  }
  if (stop.offers.includes('slot'))
    for (const skill of SLOT_ORDER) {
      const slotted = take({ kind: 'slot', skill });
      if (slotted) return slotted;
    }
  return profile;
}

/**
 * Between dives: move the moveset to a better weapon, equip upgrades, fuse
```

Replace:

```ts
      if (p.dive.depth >= maxDepth) {
        p = extractDive(registry, p);
```

with:

```ts
      p = takeBestStop(registry, p);
      if (p.dive!.depth >= maxDepth) {
        p = extractDive(registry, p);
```

In `packages/engine/src/index.ts`:

Replace:

```ts
export { runAutopilot } from './delve/autopilot.js';
export type { AutopilotOptions, AutopilotDiveReport } from './delve/autopilot.js';
```

with:

```ts
export { runAutopilot, takeBestStop } from './delve/autopilot.js';
export type { AutopilotOptions, AutopilotDiveReport } from './delve/autopilot.js';
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-stops.test.ts tests/delve-pair.test.ts)`
Expected: PASS, 63 tests in 2 files.

- [ ] **Step 5: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1421 tests pass (78 files), the pacing rails included.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx prettier --write src/index.ts tests/delve-stops.test.ts tests/delve-pair.test.ts)
git add packages/engine/src/delve/autopilot.ts packages/engine/src/index.ts packages/engine/tests/delve-stops.test.ts packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): the autopilot takes a stop: equip the best item as it is, else upgrade, else a slot" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 12: Measure before and after, and record it

No tuning (the spec: measure, and if a rail breaks, stop). This task builds a measuring copy of the engine (the client's bundle stays as it is), measures the DPS Lab grid, the pacing rails, the first dives, their stops and v0.48.0's items against the "before" files Task 1 checked, and records them in the spec's status line. Every rail holds (the first-dive rail as Task 8 changed it), so the client follows. The numbers are deterministic: each must match the plan's; if one differs, find out why before going on (the sim is deterministic, so a difference means the code differs from the plan's).

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md:3` (the status line; LF, never format)

- [ ] **Step 1: The measuring build**

Run: `(cd packages/engine && npx tsup --out-dir node_modules/.movesets-measure)`
Expected: tsup's "Build success" lines. (`node_modules` keeps it out of git, and next to `zod`, which the bundle imports; `packages/engine/dist`, the client's, is untouched.)

- [ ] **Step 2: The DPS Lab grid comes out identical**

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/movesets-before && node snapshot.mjs C:/Projects/Alloy/packages/engine/node_modules/.movesets-measure/index.js after-depth10.json)`
Expected: `runs 9144 ms …` (about 10 s).

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/movesets-before && node identical.mjs before-depth10.json after-depth10.json)`
Expected, exactly:

```text
rows 9144 before, 9144 after; differing 0
```

This is the spec's gate. A differing row is listed under it, and must be explained before going on.

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/movesets-before && node items-hash.mjs C:/Projects/Alloy/packages/engine/node_modules/.movesets-measure/index.js)`
Expected: `291 49e20fb6` (v0.48.0's items, their movesets left out: the hash `delve-movesets.test.ts` pins).

- [ ] **Step 3: The pacing rails**

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/movesets-before && node pacing.mjs C:/Projects/Alloy/packages/engine/node_modules/.movesets-measure/index.js | tee pacing-after.txt)`
Expected, exactly (about a minute):

```text
first dive: 3, 3, 3, 3 (each ≥ 3), mean 3 (3–12)
dive 6 mean 22.25, dive 12 mean 31.5 (> dive 1 + 5, > dive 6)
frost: dive 1 4, dive 12 29.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 6 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 21, 18–26 (allowed 12.6–33.6): fire+frost 21, earth+frost 19, storm+fire 22, frost+storm 20, fire+shadow 18, fire+nature 22, shadow+nature 20, fire+earth 23, storm+earth 24, earth+shadow 18, earth+nature 26, frost+shadow 20, frost+nature 23, storm+shadow 23, storm+nature 21
seconds per floor: 34.73 (8–60)
```

and `pacing-before.txt` reads (made while the first-dive rail read 4–12; the bounds in parentheses are `pacing.mjs`'s fixed text, which now prints "(3–12)", so a `pacing-before.txt` remade from the script below in Task 1 ends its first line "(3–12)": only that text differs):

```text
first dive: 11, 11, 11, 13 (each ≥ 3), mean 11.5 (4–12)
dive 6 mean 25.5, dive 12 mean 35 (> dive 1 + 5, > dive 6)
frost: dive 1 8.5, dive 12 32.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 6 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 27, 21–37 (allowed 16.2–43.2): fire+frost 30, earth+frost 27, storm+fire 37, frost+storm 26, fire+shadow 34, fire+nature 34, shadow+nature 21, fire+earth 30, storm+earth 27, earth+shadow 34, earth+nature 21, frost+shadow 26, frost+nature 22, storm+shadow 32, storm+nature 21
seconds per floor: 20.89 (8–60)
```

Every line is inside its bounds, the first dive's mean at the floor of its new rail.

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/movesets-before && node first-dives.mjs C:/Projects/Alloy/packages/engine/node_modules/.movesets-measure/index.js | tee first-dives-after.txt)`
Expected, exactly (each seed's first two dives: where they start and end, how, and the Power after):

```text
1 1→3 dead power 1266 | 1→5 dead power 2867
2 1→3 dead power 1352 | 1→7 dead power 3506
3 1→3 dead power 1022 | 1→5 dead power 2087
4 1→3 dead power 1166 | 1→5 dead power 2913
```

and `first-dives-before.txt` reads:

```text
1 1→11 dead power 3789 | 11→13 dead power 11598
2 1→11 dead power 5103 | 11→21 dead power 23500
3 1→11 dead power 4109 | 11→17 dead power 21670
4 1→13 dead power 8748 | 11→19 dead power 16630
```

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/movesets-before && node stop-trace.mjs C:/Projects/Alloy/packages/engine/node_modules/.movesets-measure/index.js | tee stop-trace-after.txt)`
Expected, exactly (each seed's first dive, taking the first door each time: each cleared depth's life left, bag (rarity and slot initials), Links, scrap, the stop's offers, whether the autopilot took one, and Power before and after it):

```text
seed 1: d1 hp50% bag[cruguwchcb] links0 scrap19 offers equip/upgrade took power 787->881 | d2 hp51% bag[cruguwcbcbcwcarcchcruccguruwcbchuacwcg] links0 scrap53 offers equip/upgrade took power 860->1294 | d3 died
seed 2: d1 hp74% bag[uacacwcc] links0 scrap16 offers equip/upgrade took power 802->910 | d2 hp34% bag[cacwccuhcacgmccgcgcrewcauaebrwubcb] links0 scrap41 offers equip/upgrade took power 893->2290 | d5 died
seed 3: d1 hp43% bag[uwcwchmrcrcbcw] links0 scrap19 offers equip/upgrade took power 869->965 | d2 hp57% bag[uwcwmrcrcbcwuhmrubcrcccwuacheachmgmacgmw] links0 scrap42 offers equip/upgrade took power 940->1294 | d3 died
seed 4: d1 hp80% bag[uauacccwuc] links0 scrap18 offers equip/upgrade took power 787->882 | d2 hp60% bag[uacccwuccgmweguwcacc] links0 scrap35 offers equip/upgrade took power 866->1185 | d3 died
```

A stop now offers only what the hero can pay for: a new hero has no Mana Dust (a dive counts as its first from its start, so a stop's edit is never free) and no Links, so every first-dive stop offers equip and upgrade, and the autopilot equips.

- [ ] **Step 4: Remove the measuring build**

Run: `(rm -rf packages/engine/node_modules/.movesets-measure)`

- [ ] **Step 5: The spec's status line**

In `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md` (LF):

Replace:

```markdown
**Status:** approved design, 2026-09-30. It is stage 4a of the skill roadmap, and it ships as v0.49.0.
```

with:

```markdown
**Status:** approved design, 2026-09-30. It is stage 4a of the skill roadmap, and it ships as v0.49.0. The engine is built at the values below, stops between depths included; nothing was tuned. Measured before (v0.48.0) and after (the DPS Lab grid at depth 10, one dummy and the pack, one seed; the pacing rails at `tests/delve-pacing.test.ts`'s seeds):
- **DPS Lab.** Identical: all 9,144 rows, row for row. v0.48.0's items (291, over every rarity and a run of encounter drops) roll the same but for their movesets.
- **Pacing: every rail holds**, the first-dive rail as the Balance section changes it ("each at least 3, mean 3 to 12"). First dives 11, 11, 11, 13 (mean 11.5) → 3, 3, 3, 3 (mean 3): the dive lock ends the autopilot's mid-dive equipping, and the stops between its depths (each offering an equip and an upgrade, the equip taken) lift its Power at death from 761–836 (without stops) to 1,022–1,352, against 3,789–8,748 before; every second dive goes deeper (to depths 5 to 7). Dive 6 and dive 12 means 25.5, 35 → 22.25, 31.5; Frost dive 1 → dive 12, 8.5 → 32.5 before and 4 → 29.5 after; legendaries at dive 12, 6 → 6; the own pair's reaction 6 of 6 both; the 15-pair sweep at dive 6, median 27 (21–37) → 21 (18–26, allowed 12.6–33.6); seconds a floor 20.89 → 34.73.
```

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
git add docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md
git commit -m "docs: the weapon movesets spec's measured before and after: the DPS grid identical, every pacing rail holds" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**The scripts** (in `<before>`; write any that is missing from these texts):

`snapshot.mjs`:

```js
// The DPS Lab grid at depth 10 (one dummy and the pack), one seed, from a built engine.
// Usage: node snapshot.mjs <engine dist/index.js> <out.json>
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const E = await import(pathToFileURL(process.argv[2]).href);
const reg = E.createDefaultRegistry();
const out = {};
const t0 = performance.now();
for (const pack of [false, true])
  for (const s of E.dpsCombos(reg)) {
    const r = E.simulateDps(reg, s, { depth: 10, pack });
    out[`10|${pack}|${E.dpsKey(s)}`] = { dps: +r.dps.toFixed(2), casts: r.casts, view: s.view, dims: s.dims };
  }
writeFileSync(process.argv[3], JSON.stringify(out));
console.log('runs', Object.keys(out).length, 'ms', Math.round(performance.now() - t0));
```

`identical.mjs`:

```js
// The weapon movesets spec's DPS Lab gate: the depth-10 grid after the change must equal before (v0.48.0), row for row.
// Usage: node identical.mjs <before.json> <after.json>
import { readFileSync } from 'node:fs';
const [b, a] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const keys = Object.keys(b);
const differ = keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
console.log(`rows ${keys.length} before, ${Object.keys(a).length} after; differing ${differ.length}`);
for (const k of differ.slice(0, 20)) console.log(`  ${k} ${JSON.stringify(b[k])} -> ${JSON.stringify(a[k])}`);
```

`pacing.mjs`:

```js
// The pacing rails' numbers: tests/delve-pacing.test.ts's seeds, dives and bounds, from a built engine.
// Usage: node pacing.mjs <engine dist/index.js>
import { pathToFileURL } from 'node:url';

const E = await import(pathToFileURL(process.argv[2]).href);
const registry = E.createDefaultRegistry();
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fire = [1, 2, 3, 4].map((seed) => E.runAutopilot(registry, { seed, dives: 12 }));
const frost = [1, 2].map((seed) => E.runAutopilot(registry, { seed, dives: 12, primary: 'frost' }));
const at = (results, dive) => avg(results.map((r) => r.reports[dive - 1].endDepth));
const sweep = registry
  .getArpgData()
  .reactions.map(({ elements: [primary, secondary] }) => [
    `${primary}+${secondary}`,
    E.runAutopilot(registry, { seed: 1, dives: 6, primary, secondary }).reports[5].endDepth,
  ]);
const depths = sweep.map(([, d]) => d).sort((a, b) => a - b);
const median = depths[Math.floor(depths.length / 2)];
const perFloor = fire.flatMap((r) =>
  r.reports.map((d) => d.floorSeconds / Math.max(1, d.endDepth - d.startDepth + 1)),
);
const own = [...fire, ...frost].filter(({ profile }) => {
  const { primary, secondary } = profile.pair;
  return (
    !!secondary && profile.reactionsSeen.includes(registry.getReactionFor(primary, secondary).id)
  );
}).length;
const legendaries = avg(fire.map((r) => r.reports[11].legendariesOwned));

console.log(
  `first dive: ${fire.map((r) => r.reports[0].endDepth).join(', ')} (each ≥ 3), mean ${at(fire, 1)} (3–12)`,
);
console.log(`dive 6 mean ${at(fire, 6)}, dive 12 mean ${at(fire, 12)} (> dive 1 + 5, > dive 6)`);
console.log(`frost: dive 1 ${at(frost, 1)}, dive 12 ${at(frost, 12)} (≥ dive 1 + 5)`);
console.log(
  `legendaries owned at dive 12: ${legendaries} (≥ 1, < ${registry.getDelveData().legendaries.length})`,
);
console.log(`own pair's reaction found: ${own} of ${fire.length + frost.length}`);
console.log(
  `sweep at dive 6: median ${median}, ${depths[0]}–${depths[depths.length - 1]} (allowed ${(0.6 * median).toFixed(1)}–${(1.6 * median).toFixed(1)}): ` +
    sweep.map(([p, d]) => `${p} ${d}`).join(', '),
);
console.log(`seconds per floor: ${avg(perFloor).toFixed(2)} (8–60)`);
```

`first-dives.mjs`:

```js
// The first two dives of the pacing seeds: where they end, how, and with what.
// Usage: node first-dives.mjs <engine dist/index.js>
import { pathToFileURL } from 'node:url';
const E = await import(pathToFileURL(process.argv[2]).href);
const registry = E.createDefaultRegistry();
for (const seed of [1, 2, 3, 4]) {
  const { reports } = E.runAutopilot(registry, { seed, dives: 2 });
  console.log(seed, reports.map((r) => `${r.startDepth}→${r.endDepth} ${r.result} power ${r.power}`).join(' | '));
}
```

`stop-trace.mjs`:

```js
// The first dive of each pacing seed, floor by floor (taking the first door each time): what each stop offered, what the autopilot took, and Power.
// Usage: node stop-trace.mjs <engine dist/index.js>
import { pathToFileURL } from 'node:url';
const E = await import(pathToFileURL(process.argv[2]).href);
const registry = E.createDefaultRegistry();
for (const seed of [1, 2, 3, 4]) {
  let p = E.createDelveProfile(registry, seed, { primary: 'fire' });
  p = E.startDive(registry, p, 1);
  const log = [];
  while (p.dive.phase === 'fighting' || p.dive.phase === 'choosing') {
    if (p.dive.phase === 'fighting') {
      const world = E.beginFloor(registry, p);
      while (!world.heroDead && world.t < 240) {
        E.stepWorld(registry, world, E.botInput(registry, world), 1 / 30);
        if (world.pending.items.length > 0) p = E.bankWorld(registry, p, world).profile;
        if (world.cleared && (world.drops.length === 0 || world.t - world.clearedAt > 3)) break;
      }
      const hp = Math.round((100 * world.hero.hp) / world.hero.stats.maxHp);
      if (world.heroDead || !world.cleared) { p = E.failFloor(registry, p, world).profile; log.push(`d${p.dive.depth} died`); break; }
      p = E.completeFloor(registry, p, world).profile;
      const stop = p.dive.stop;
      const before = E.profilePower(registry, p);
      const bag = p.bag.map((i) => `${i.rarity[0]}${i.slot[0]}`).join('');
      const after = E.takeBestStop(registry, p);
      const took = after === p ? 'skip' : after.dive.stop.taken ? 'took' : '?';
      log.push(`d${p.dive.depth} hp${hp}% bag[${bag}] links${p.links} scrap${p.scrap} offers ${stop ? stop.offers.join('/') : 'none'} ${took} power ${before}->${E.profilePower(registry, after)}`);
      p = after;
      continue;
    }
    p = E.chooseDoor(registry, p, p.dive.doorChoices[0]);
  }
  console.log(`seed ${seed}: ${log.join(' | ')}`);
}
```

`items-hash.mjs`:

```js
// v0.48.0's items, hashed: generateItem over every rarity and slot, and a run of encounter drops.
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
const strip = items.map(({ moveset: _m, ...rest }) => rest);
let h = 0x811c9dc5;
for (const c of JSON.stringify(strip)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
console.log(items.length, h.toString(16));
```

`v5-saves.mjs`:

```js
// Real version 5 saves from the v0.48.0 engine, for the save v6 migration test.
// Usage: node v5-saves.mjs <engine dist/index.js> <out.json>
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const E = await import(pathToFileURL(process.argv[2]).href);
const registry = E.createDefaultRegistry();
const trim = (p, n = 1) => ({ ...p, bag: p.bag.slice(0, n) });
const item = (uid, rarity, slot, baseId, mana, seed) =>
  E.generateItem(registry, { uid, ilvl: 4, rarity, slot, baseId, mana }, new E.SeededRNG(seed));

// 1. A new hero: a common sword and the full default chains in Fire.
const fresh = E.createDelveProfile(registry, 11, { primary: 'fire' });

// 2. Bound Fire+Storm on a common sword, its Primary built from both, a dive over; a bag weapon.
let bound = E.bindSecondary(registry, fresh, 'storm').profile;
bound = E.setChain(registry, bound, 'primary', {
  moves: [
    { kind: 'light', form: 'lance', elements: ['fire', 'storm'] },
    { kind: 'heavy', form: 'lance', elements: ['storm'] },
  ],
  payment: 'cast',
});
bound = { ...bound, bag: [item('g7', 'rare', 'weapon', 'axe', 'frost', 5)], nextUid: 8, stats: { ...bound.stats, dives: 3 } };

// 3. Unarmed, with a built Primary (the rare reset).
let unarmed = E.unequipSlot(registry, fresh, 'weapon');
unarmed = E.setChain(registry, unarmed, 'primary', {
  moves: [{ kind: 'heavy', form: 'burst', elements: ['fire'] }],
  payment: 'mana',
});

// 4. A magic dagger mid-dive: it keeps its Defensive; its two-move Ultimate goes (1 Link).
let magic = { ...fresh, equipped: { ...fresh.equipped, weapon: item('g8', 'magic', 'weapon', 'dagger', 'fire', 6) }, nextUid: 9 };
magic = E.setChain(registry, magic, 'ultimate', {
  moves: [
    { kind: 'medium', form: 'barrage', elements: ['fire'] },
    { kind: 'hold', form: 'nova', elements: ['fire'] },
  ],
  payment: 'charge',
});
magic = E.startDive(registry, magic, 1);

// 5. An epic maul keeps all four, its basic string a single blow (below the maul's 2).
let epic = { ...fresh, equipped: { ...fresh.equipped, weapon: item('g9', 'epic', 'weapon', 'maul', 'fire', 7) }, nextUid: 10 };
epic = E.setChain(registry, epic, 'basic', [{ kind: 'heavy', element: 'fire' }]);

const saves = { fresh, bound, unarmed, magic, epic };
for (const [k, p] of Object.entries(saves)) {
  if (!E.parseDelveProfile(registry, p)) throw new Error(`${k} does not parse`);
  saves[k] = trim(p);
}
const lines = Object.entries(saves).map(([k, p]) => `  ${JSON.stringify(k)}: ${JSON.stringify(p)}`);
writeFileSync(process.argv[3], `{\n${lines.join(',\n')}\n}\n`);
console.log(Object.keys(saves).join(', '));
```

## Chunk 12: Client: the weapon's moveset everywhere (Task 13, part 1: the bundle and the tests)

### Task 13: The client on the new engine: the store, every reader, absent skills and the gear lock

The client's first commit against the new engine: it rebuilds the bundle and makes the client whole in one go (the typecheck sees every reader at once).
- **The store** (`stores/delveStore.ts`): `setChain` (which threw) gives way to `setChains(chains)`, a `ProfileActionResult` (all or nothing); `addSlot(skill)`; `salvage` returns `links` too; a migrated save's dropped chains and unarmed reset become notices (`movesetNotices(dropped, reset, links)`, after the bind hint and before the fix notices; it mentions Links only when some came back).
- **Every reader** takes the hero's chains from the weapon: `profileStats(registry, { equipped, pair })` and `heroChains(registry, equipped, pair)` (the Anvil, the paper doll, the arena's loadout), and `compareItem(equipped, item, registry, depth, pair)` (the bag, the loot tray, the pickup feed, the item sheet).
- **Absent skills:** the HUD snapshot keeps a null entry for a skill the weapon doesn't carry (`AbilityHud | null`, by slot) and the skill bar draws no button for it; `aimedMove` returns null (no aim marker), the pad's press of it casts nothing (and a key's press in the same frame goes at once, not again the next frame), and the readers of a hold's or the Defensive's chain take `h.chains[slot]!` (they only run on a slot with a chain). The chain builder shows such a skill's tab locked (🔒, "Locked") with `carriedByText` in place of its chain (`ChainEditor`'s `absentText`); for now the Anvil applies each change as it is made (`setChains`), read-only unarmed, where the default chains show at their base slots (Task 14 makes it a draft).
- **The gear lock** (the engine refuses gear changes, the forge and salvage mid-dive): the item sheet's Equip and Unequip give way to "Equip at the Anvil", and its Upgrade, Reforge and Salvage to "Forge and salvage at the Anvil"; the bag's Equip best reads "Equip between dives" and its Salvage junk "Salvage between dives"; the Forge tab says "A dive is under way: forge and salvage between dives."; the loot tray and the pickup feed show "▲ N to equip at the Anvil" in place of their Equip buttons, counting every upgrade, weapons too. Equip best and the tray's Equip upgrades (after a dive) count non-weapon gear only. The sheet's bind prompt therefore only shows at the Anvil, and its mid-dive toast goes.
- **The bind texts** (`BindPrompt`, `ManaPanel`) no longer promise a default basic chain's last blow: "Your moves and blows can use Storm and its gear will attune you; your chains keep the ones they have (add Storm in the chain builder)." Realign's text says it maps the equipped weapon's moves.
- **The Training Grounds' Load my build** copies the equipped weapon's chains over the sandbox's (a skill the weapon doesn't carry keeps the sandbox's chain).

**Interim states, which later tasks finish:** the builder applies each change at once through `setChains`, paying for each and dropping a refusal's reason (Task 14's draft gathers them, shows the price and the reason); unarmed and between dives, the builder shows the dive's locked text (Task 14 says "Equip a weapon to build your moves."); and a bag weapon's sheet marks Equip ▲ by its home value (Task 15 values it as it is too, and marks Equip by that).

This task is one commit. Its steps span three chunks: this one (the bundle and most tests), the next (the last tests, the store, the readers and the arena) and the one after (the builder and the gear lock).

**Files (all three chunks):**
- Modify: `packages/client/src/stores/delveStore.ts:15,140,178,224,283,340`
- Modify: `packages/client/src/stores/sandboxStore.ts:15,261,340`
- Modify: `packages/client/src/features/delve/AbilitiesPanel.tsx:3,128`
- Modify: `packages/client/src/features/delve/chains/ChainEditor.tsx:36,64,90,139,239,259`
- Modify: `packages/client/src/features/delve/ItemDetailSheet.tsx:22,95,142,428,441`
- Modify: `packages/client/src/features/delve/BagPanel.tsx:4,30,67` (CRLF, never format)
- Modify: `packages/client/src/features/delve/LootTray.tsx:2,54,114` (CRLF, never format)
- Modify: `packages/client/src/features/delve/ForgePanel.tsx:5,138` (CRLF, never format)
- Modify: `packages/client/src/features/delve/arena/PickupFeed.tsx:4,22,45,85`
- Modify: `packages/client/src/features/delve/BindPrompt.tsx:1,30,69`, `packages/client/src/features/delve/ManaPanel.tsx:5,125,176`
- Modify: `packages/client/src/features/delve/PaperDoll.tsx:2,40`, `packages/client/src/pages/DelveCamp.tsx:55`
- Modify: `packages/client/src/features/delve/arena/useArena.ts:7,51`, `packages/client/src/features/delve/arena/useArenaCore.ts:93,136,202,271,290,443`, `packages/client/src/features/delve/arena/ArenaHud.tsx:618`, `packages/client/src/features/delve/arena/input.ts:116,149`
- Modify: `packages/client/src/features/delve/arena/fx/anticipation.ts:66`, `packages/client/src/features/delve/arena/fx/draw-world.ts:230`, `packages/client/src/features/gamepad/arena-pad.ts:70`
- Modify: `packages/client/src/features/delve/training/TrainingPanel.tsx:338`
- Create: `packages/client/src/features/delve/__tests__/LootTray.test.tsx`
- Modify (tests): `packages/client/src/stores/delveStore.test.ts:3,89,120,152,169,237,262`, `packages/client/src/stores/sandboxStore.test.ts:129,143,155`, `packages/client/src/pages/__tests__/DelveCamp.test.tsx:67`, `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx:3,31,63,99,235`, `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx:95`, `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx:3,90,120,182` (never format), `packages/client/src/features/delve/__tests__/ManaPanel.test.tsx:38,62`, `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx:3,171`, `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts:8,34,99,143`, `packages/client/src/features/delve/__tests__/arena-input.test.ts:3,168,187,282`

- [ ] **Step 1: Rebuild the engine's bundle, and see the client break**

Run: `(cd packages/engine && pnpm build)`
Expected: tsup's "Build success" lines.

Run: `(cd packages/client && npx tsc --noEmit -p . 2>&1 | grep -c 'error TS'; npx vitest run 2>&1 | tail -5)`
Expected: `62` (type errors in 24 files: every reader of `profile.chains`, `chainCaps`, `setChain`'s result and the arena's chains), then 40 failed and 678 passed tests (718), in 7 files. This task makes both whole.

- [ ] **Step 2: Write the failing tests**

The store's tests: chains are read from the weapon (`heroChains`); `setChains` returns a result; `addSlot`; the migration's notices. The fresh-save version 3 test now migrates to version 6, and the common starting sword carries no Defensive: the Frost Ward goes with it (`dropped`) and nothing needs a fix.

In `packages/client/src/stores/delveStore.test.ts`:

Replace the lines from `generateItem,` up to (not including) `const build = (form: string, elements: string[], payment = 'mana') => ({` with:

```ts
  defaultMoveset,
  generateItem,
  heroChains,
  SeededRNG,
  type ChainFix,
  type Chains,
  type GearSlot,
  type ManaType,
} from '@alloy/engine';
import {
  useDelveStore,
  BIND_HINT,
  DELVE_SAVE_KEY,
  MANUAL_ATTACK_KEY,
  fixNotices,
  loadDelveProfile,
  movesetNotices,
  overtakeNotice,
} from './delveStore';
import { getDelveRegistry } from '@/features/delve/registry';

const registry = getDelveRegistry();
/** The hero's chains, as its equipped weapon carries them. */
const chains = () => {
  const { equipped, pair } = useDelveStore.getState().profile;
  return heroChains(registry, equipped, pair) as Chains;
};

/** Equip the starting sword made epic (all four skills), its chains the defaults but for `over`. */
function epicSword(over: Partial<Chains> = {}) {
  const p = useDelveStore.getState().profile;
  const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
  const moveset = defaultMoveset(registry, weapon, 'fire');
  useDelveStore.getState().setProfile({
    ...p,
    equipped: {
      ...p.equipped,
      weapon: { ...weapon, moveset: { ...moveset, chains: { ...moveset.chains, ...over } } },
    },
  });
}

/** The store's save as version 3 (builds, no pair): a Frost Ward and Fire's Bolt and Nova. */
function v3Save() {
  const { pair: _pair, manaDust: _dust, links: _links, ...rest } = useDelveStore.getState().profile;
```

Replace the lines from `it('salvage returns the scrap and Mana Dust gained', () => {` up to (not including) `it('upgrade reports failure reasons', () => {` with:

```ts
  it('salvage returns the scrap, Mana Dust and Links gained', () => {
    const item = generateItem(
      registry,
      { uid: 'x2', ilvl: 3, rarity: 'magic', slot: 'ring' },
      new SeededRNG(2),
    );
    const s = useDelveStore.getState();
    // Frost is outside the fire hero's pair, so it melts into Mana Dust too.
    s.setProfile({ ...s.profile, bag: [{ ...item, mana: 'frost' }] });
    const { scrap, dust, links } = useDelveStore.getState().salvage(['x2']);
    expect(scrap).toBeGreaterThan(0);
    expect(dust).toBe(registry.getDelveBalance().pair.salvageDust.magic);
    expect(links).toBe(0); // not a weapon
    expect(useDelveStore.getState().profile).toMatchObject({ scrap, manaDust: dust });
    // A weapon gives a Link for each slot past its base.
    const sword = useDelveStore.getState().profile.equipped.weapon!;
    const roomy = {
      ...sword,
      uid: 'x3',
      moveset: defaultMoveset(registry, sword, 'fire', { primary: 3 }),
    };
    s.setProfile({ ...useDelveStore.getState().profile, bag: [roomy] });
    expect(useDelveStore.getState().salvage(['x3']).links).toBe(2);
    expect(useDelveStore.getState().profile.links).toBe(2);
  });

```

Replace the lines from `it('sets a chain and persists it', () => {` up to (not including) `it('a reset takes a primary; without one the choice is still to make', () => {` with:

```ts
  it("sets the weapon's chains and persists them", () => {
    const chain = {
      moves: [{ kind: 'heavy' as const, form: 'burst' as const, elements: ['fire' as const] }],
      payment: 'cast' as const,
    };
    const basic = [{ kind: 'hold' as const, element: 'fire' as const }];
    expect(useDelveStore.getState().setChains({ primary: chain, basic }).ok).toBe(true);
    expect(chains().primary).toEqual(chain);
    const saved = loadDelveProfile()!.profile.equipped.weapon!.moveset!.chains;
    expect(saved).toMatchObject({ primary: chain, basic });
  });

  it('refuses a form from another slot, and changes nothing', () => {
    const res = useDelveStore.getState().setChains({
      basic: [{ kind: 'hold', element: 'fire' }],
      primary: { moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }], payment: 'mana' },
    });
    expect(res).toMatchObject({ ok: false, reason: 'Nova is not a primary form' });
    expect(chains().primary.moves[0].form).toBe('bolt');
    expect(chains().basic).toHaveLength(3);
  });

  it('adds a slot for Links and scrap', () => {
    const s = () => useDelveStore.getState();
    expect(s().addSlot('primary')).toMatchObject({ ok: false, reason: 'Not enough Links' });
    s().setProfile({ ...s().profile, links: 1, scrap: 20 });
    expect(s().addSlot('primary').ok).toBe(true);
    expect(s().profile).toMatchObject({ links: 0, scrap: 0 });
    expect(chains().primary.moves).toHaveLength(2);
    expect(s().addSlot('defensive')).toMatchObject({
      ok: false,
      reason: 'Carried by magic weapons and better',
    });
  });

```

Replace:

```ts
      version: 5,
      pair: { primary: 'fire', secondary: null },
    });
    expect(loaded.fixed.map((f) => [f.skill, f.index])).toEqual([['defensive', 0]]);
    expect(loaded.gainedPair).toBe(true);
```

with:

```ts
      version: 6,
      pair: { primary: 'fire', secondary: null },
    });
    // The common sword carries no Defensive: the Frost Ward went with it, and nothing needed a fix.
    expect(loaded.dropped).toEqual(['defensive', 'ultimate']);
    expect(loaded.fixed).toEqual([]);
    expect(loaded.gainedPair).toBe(true);
```

Replace the lines from `"Your Ward's 1st move used Frost, which isn't in your pair; it now uses Fire",` up to (not including) `localStorage.setItem(DELVE_SAVE_KEY, JSON.stringify(useDelveStore.getState().profile));` with:

```ts
      // One move each: nothing came back as Links.
      "Your chains live on your weapon now, and yours can't carry your Defensive and Ultimate: they went",
    ]);
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!).version).toBe(6);
  });

  it('a save that already has its pair (version 4 or 5) gets no bind hint', async () => {
    const { links: _links, ...v4 } = useDelveStore.getState().profile;
    const bolt = { form: 'bolt', elements: ['fire'], weight: 0, payment: 'mana' };
    const abilities = {
      primary: bolt,
      defensive: { ...bolt, form: 'ward' },
      ultimate: { ...bolt, form: 'nova' },
    };
    localStorage.setItem(DELVE_SAVE_KEY, JSON.stringify({ ...v4, version: 4, abilities }));
    expect(loadDelveProfile()).toMatchObject({ gainedPair: false, profile: { version: 6 } });
```

Replace the lines from `it('realign charges and says which moves it changed; re-attune spends Mana Dust', () => {` up to (not including) `expect(useDelveStore.getState().realign({ secondary: 'frost' }).ok).toBe(true);` with:

```ts
  it('realign charges and says which moves it changed; re-attune spends Mana Dust', () => {
    epicSword({
      ultimate: {
        moves: [{ kind: 'medium', form: 'maelstrom', elements: ['storm'] }],
        payment: 'charge',
      },
    });
    const s = useDelveStore.getState();
    s.setProfile({
      ...s.profile,
      pair: { primary: 'fire', secondary: 'storm' },
      manaDust: 500,
      scrap: 500,
    });
```

Replace the lines from `dust - registry.getDelveBalance().pair.reattuneDust.common,` up to (not including) `it('words the notices plainly: one a skill for its moves that changed the same way', () => {` with:

```ts
      dust - registry.getDelveBalance().pair.reattuneDust.epic,
    );
  });

  it('a realign that changes a whole chain says so in one notice', () => {
    const s = () => useDelveStore.getState();
    expect(s().bindSecondary('storm').ok).toBe(true);
    s().setProfile({ ...s().profile, manaDust: 500, scrap: 500 });
    expect(s().realign({ primary: 'frost' }).ok).toBe(true);
    // The weapon's every chain says so once, the basic one too.
    expect(s().takeNotices()).toEqual([
      "Your basic attack's 1st, 2nd and 3rd blows used Fire, which isn't in your pair; they now use Frost",
      "Your Bolt's 1st move used Fire, which isn't in your pair; it now uses Frost",
    ]);
  });

  it('says what the move to weapon movesets dropped or reset', () => {
    expect(movesetNotices([], false, 0)).toEqual([]);
    expect(movesetNotices(['ultimate'], false, 0)).toEqual([
      "Your chains live on your weapon now, and yours can't carry your Ultimate: it went",
    ]);
    expect(movesetNotices(['ultimate'], false, 1)).toEqual([
      "Your chains live on your weapon now, and yours can't carry your Ultimate: it went, and its 1 extra move came back as 1 Link",
    ]);
    expect(movesetNotices(['defensive', 'ultimate'], false, 3)).toEqual([
      "Your chains live on your weapon now, and yours can't carry your Defensive and Ultimate: they went, and their 3 extra moves came back as 3 Links",
    ]);
    expect(movesetNotices([], true, 0)).toEqual([
      'Your chains live on your weapon now: with no weapon equipped, yours were reset to the defaults',
    ]);
  });

```

In `packages/client/src/stores/sandboxStore.test.ts`:

Replace:

```ts
  it('Load my build copies the real weapon, the other gear and the chains, and clears the extras', () => {
    const profile = createDelveProfile(registry, 7);
```

with:

```ts
  it("Load my build copies the real weapon, the other gear and the weapon's chains, and clears the extras", () => {
    const profile = createDelveProfile(registry, 7);
```

Replace:

```ts
    expect(s.chains).toEqual(profile.chains);
    expect(s.legendaries).toEqual({});
```

with:

```ts
    expect(s.chains).toEqual(bow.moveset!.chains); // a legendary carries all four
    expect(s.legendaries).toEqual({});
```

Replace:

```ts
    expect(sandboxEquipped(registry, store()).weapon?.legendary).toBeUndefined();
  });
```

with:

```ts
    expect(sandboxEquipped(registry, store()).weapon?.legendary).toBeUndefined();
  });

  it("Load my build keeps the sandbox's chains for the skills the weapon doesn't carry", () => {
    const profile = createDelveProfile(registry, 7, { primary: 'frost' });
    const before = store().chains;
    store().loadMyBuild(profile); // a common sword: Basic and Primary
    const sword = profile.equipped.weapon!.moveset!.chains;
    expect(store().chains).toEqual({
      basic: sword.basic,
      primary: sword.primary,
      defensive: before.defensive,
      ultimate: before.ultimate,
    });
  });
```

In `packages/client/src/pages/__tests__/DelveCamp.test.tsx`:

Replace:

```tsx
    expect(p.chains.defensive.moves[0].elements).toEqual(['frost']);
  });
```

with:

```tsx
    // Its weapon carries a Basic and a Primary, both in Frost.
    const chains = p.equipped.weapon!.moveset!.chains;
    expect(chains.primary!.moves[0].elements).toEqual(['frost']);
    expect(chains.basic!.map((b) => b.element)).toEqual(['frost', 'frost', 'frost']);
    expect(chains.defensive).toBeUndefined();
  });
```

The builder's tests run on `roomy()`: the starting sword made epic (all four skills) with every chain at 5 slots and the old default chains, so they read as before; the new tests pin the starting sword's locked tabs and the unarmed default's base slots.

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`:

Replace the lines from `import { computeHeroStats, defaultChains, type Move, type MoveKind } from '@alloy/engine';` up to (not including) `expect(screen.getAllByRole('tab').map((t) => t.getAttribute('data-testid'))).toEqual([` with:

```tsx
import {
  computeHeroStats,
  defaultChains,
  defaultMoveset,
  heroChains,
  type Chains,
  type ChainSkill,
  type Move,
  type MoveKind,
} from '@alloy/engine';
import { AbilitiesPanel } from '../AbilitiesPanel';
import { ChainEditor } from '../chains/ChainEditor';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
/** The hero's chains, as its equipped weapon carries them. */
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;

/**
 * The starting sword made epic (it carries all four skills), every chain at
 * `slots` slots, holding its default moves (the Primary 4, the basic chain the
 * sword's 3, the others 1), or `chains` over them.
 */
function roomy(slots = 5, over: Partial<Chains> = {}) {
  const p = store().profile;
  const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
  const lengths = { basic: 3, primary: 4, defensive: 1, ultimate: 1 };
  const moveset = defaultMoveset(registry, weapon, 'fire', lengths);
  const all: Record<ChainSkill, number> = {
    basic: slots,
    primary: slots,
    defensive: slots,
    ultimate: slots,
  };
  store().setProfile({
    ...p,
    equipped: {
      ...p.equipped,
      weapon: { ...weapon, moveset: { chains: { ...moveset.chains, ...over }, slots: all } },
    },
  });
}

describe('AbilitiesPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it("lists the four skills, Basic first, and names the chosen skill's chain", () => {
    roomy();
    render(<AbilitiesPanel />);
```

Replace the lines from `expect(screen.getByTestId('attune-fire')).toHaveAttribute('data-value', '2');` up to (not including) `store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'nature' } });` with:

```tsx
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'light Fire blow · light Fire blow · heavy Fire blow',
    );
    expect(screen.queryByTestId('form-bolt')).toBeNull(); // a blow has no form
    expect(screen.queryByText('Quick and cheap.')).toBeNull(); // nor a cost
  });

  it("a new hero's common sword carries Basic and a one-move Primary; the others show locked", () => {
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('attune-fire')).toHaveAttribute('data-value', '2');
    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('1 of 1');
    expect(screen.getByTestId('chain-skill-basic')).toHaveTextContent('3 of 3');
    expect(screen.getByTestId('chain-skill-defensive')).toHaveTextContent('🔒');
    expect(screen.getByTestId('chain-skill-defensive')).toHaveTextContent('Locked');
    fireEvent.click(screen.getByTestId('chain-skill-defensive'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'Carried by magic weapons and better',
    );
    expect(screen.queryByTestId('move-0')).toBeNull();
    expect(screen.queryByTestId('move-add')).toBeNull();
    expect(screen.queryByTestId('add-slot')).toBeNull();
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'Carried by epic weapons and better',
    );
  });

  it('unarmed, the default chains show at their base slots', () => {
    store().unequip('weapon');
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('chain-skill-basic')).toHaveTextContent('3 of 3');
    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('1 of 1');
    expect(screen.getByTestId('chain-skill-defensive')).toHaveTextContent('Locked');
  });

  it('edits a move: a Wildfire Burst from its form and a Nature infusion, then a swap', () => {
    roomy();
```

Replace the lines from `it("sets a move's kind, and the chain's one payment with its wind-up", () => {` up to (not including) `const readout = () => screen.getByTestId('ability-readout');` with:

```tsx
  it("sets a move's kind, and the chain's one payment with its wind-up", () => {
    roomy();
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('kind-hold'));
    expect(screen.getByTestId('ability-readout')).toHaveTextContent(/Fully charged .+ \d+ mana/);
    fireEvent.click(screen.getByTestId('payment-charge'));
    expect(screen.getByTestId('ability-readout')).toHaveTextContent(/Fully charged .+ Charge \d+/);
    fireEvent.click(screen.getByTestId('kind-heavy'));
    for (const payment of ['cast', 'mana', 'charge'] as const) {
      fireEvent.click(screen.getByTestId(`payment-${payment}`));
      expect(screen.getByTestId('ability-readout')).toHaveTextContent(/\d\.\d\ds wind-up/);
    }
    expect(chains().primary.payment).toBe('charge');
    expect(chains().primary.moves[0].kind).toBe('heavy');
  });

  it("says each move's beat, and a hold's full-charge time and beat, by the weapon's tempo", () => {
    roomy();
```

Replace the lines from `it('adds, reorders and removes moves within the cap, never below one', () => {` up to (not including) `expect(screen.getByTestId('move-2')).toBeEnabled();` with:

```tsx
  it('adds, reorders and removes moves within the slots, never below one', () => {
    const bolt: Move = { kind: 'light', form: 'bolt', elements: ['fire'] };
    roomy(5, { primary: { moves: [bolt], payment: 'mana' } });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('move-remove-0')).toBeDisabled();
    expect(screen.getByTestId('move-remove-0')).toHaveAccessibleName('Remove light Fire Bolt');
    fireEvent.click(screen.getByTestId('move-add'));
    expect(document.activeElement).toBe(screen.getByTestId('move-1')); // the new card
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('move-add'));
    expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(5);
    expect(screen.queryByTestId('move-add')).toBeNull(); // every slot used
    expect(document.activeElement).toBe(screen.getByTestId('move-4'));
    // The new move is picked: make it heavy, then bring it forward.
    fireEvent.click(screen.getByTestId('kind-heavy'));
    fireEvent.click(screen.getByTestId('move-left-4'));
    fireEvent.click(screen.getByTestId('move-remove-0'));
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId('move-2')); // the heavy, still picked
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['light', 'light', 'heavy', 'light']);
  });

  it('▸ moves a card later and the selection follows it; the ends are off', () => {
    const bolt = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
    roomy(5, {
      primary: { moves: [bolt('light'), bolt('medium'), bolt('heavy')], payment: 'mana' },
    });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('move-left-0')).toBeDisabled();
    expect(screen.getByTestId('move-right-2')).toBeDisabled();
    fireEvent.click(screen.getByTestId('move-right-0'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'medium Fire Bolt · light Fire Bolt · heavy Fire Bolt',
    );
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ability-readout')).toHaveTextContent('light Fire Bolt');
    expect(document.activeElement).toBe(screen.getByTestId('move-right-1'));
  });

  it('two ◂ presses move a card two places, the selection and the focus with it', () => {
    const bolt = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
    roomy(5, {
      primary: { moves: [bolt('light'), bolt('medium'), bolt('heavy')], payment: 'mana' },
    });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('move-2'));
    fireEvent.click(screen.getByTestId('move-left-2'));
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    expect(document.activeElement).toBe(screen.getByTestId('move-left-1'));
    fireEvent.click(document.activeElement!);
    expect(screen.getByTestId('move-0')).toHaveAttribute('aria-pressed', 'true');
    // At the front its ◂ is off: the card itself keeps the focus.
    expect(document.activeElement).toBe(screen.getByTestId('move-0'));
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['heavy', 'light', 'medium']);
  });

  it('each ability offers only its own forms; a blow picks from the pair', () => {
    roomy();
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('chain-skill-defensive'));
    expect(screen.getByTestId('form-ward')).toBeInTheDocument();
    expect(screen.queryByTestId('form-bolt')).toBeNull();
    fireEvent.click(screen.getByTestId('form-armor'));
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    expect(screen.getByTestId('form-maelstrom')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getAllByTestId(/^element-/).map((c) => c.getAttribute('data-testid'))).toEqual([
      'element-fire',
      'element-storm',
    ]);
    fireEvent.click(screen.getByTestId('move-2'));
    fireEvent.click(screen.getByTestId('element-storm'));
    expect(chains().defensive.moves[0].form).toBe('armor');
    expect(chains().basic[2]).toEqual({ kind: 'heavy', element: 'storm' });
  });

  it('warns when a mana cost is bigger than the pool', () => {
    roomy();
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    fireEvent.click(screen.getByTestId('payment-mana'));
    fireEvent.click(screen.getByTestId('kind-heavy'));
    expect(screen.getByTestId('cost-warning')).toHaveTextContent('your pool holds');
  });

  it("warns when a hold move's full charge costs more than the pool", () => {
    roomy();
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    fireEvent.click(screen.getByTestId('payment-mana'));
    fireEvent.click(screen.getByTestId('kind-hold'));
    expect(screen.getByTestId('cost-warning')).toHaveTextContent(
      /^A full charge needs \d+ mana; your pool holds \d+\.$/,
    );
  });

  it('is read-only while a dive is under way', () => {
    roomy();
    store().startDive(1);
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('abilities-locked')).toBeInTheDocument();
    expect(screen.getByTestId('form-lance')).toBeDisabled();
    expect(screen.getByTestId('move-add')).toBeDisabled();
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(chains().primary.moves[0].form).toBe('bolt');
  });

  it('mid-dive every move can still be picked and read, but not moved, removed or added', () => {
    roomy();
    store().startDive(1);
    render(<AbilitiesPanel />);
```

Replace:

```tsx
  const registry = getDelveRegistry();
  const stats = computeHeroStats({}, registry);
```

with:

```tsx
  const stats = computeHeroStats({}, registry);
```

In `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx`:

Replace:

```tsx
    expect(screen.getByTestId('ability-1').querySelector('[data-chain]')).toBeNull();
  });
```

with:

```tsx
    expect(screen.getByTestId('ability-1').querySelector('[data-chain]')).toBeNull();
  });

  it("hides the button of a skill the weapon doesn't carry; the others keep their slots", () => {
    render(bar({ abilities: [BOLT, null, { ...BOLT, name: 'Fire Nova' }] }));
    expect(screen.getByTestId('ability-0')).toBeInTheDocument();
    expect(screen.queryByTestId('ability-1')).toBeNull();
    expect(screen.getByTestId('ability-2')).toHaveAccessibleName('Ultimate: light Fire Nova');
  });
```

In `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx`:

Replace the lines from `import { generateItem, SeededRNG, type GearItem, type ManaType } from '@alloy/engine';` up to (not including) `describe('ItemDetailSheet', () => {` with:

```tsx
import {
  compareItem,
  defaultMoveset,
  generateItem,
  heroChains,
  SeededRNG,
  type GearItem,
  type ManaType,
} from '@alloy/engine';
import { ItemDetailSheet } from '../ItemDetailSheet';
import { BagPanel } from '../BagPanel';
import { ForgePanel } from '../ForgePanel';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import { UPGRADE_EPSILON } from '../format';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const pal = registry.getDelveBalance().pair;
/** A magic helm with only the lines given as affixes. */
const helm = (mana: ManaType, uid = 'h1', affixes: GearItem['affixes'] = []): GearItem => ({
  ...generateItem(registry, { uid, ilvl: 3, rarity: 'magic', slot: 'helm', mana }, new SeededRNG(4)),
  affixes,
});
const put = (...bag: GearItem[]) => store().setProfile({ ...store().profile, bag });
/** A rare sword (Basic, Primary and Defensive) with `slots` over its base. */
const rareSword = (uid: string, slots = {}): GearItem => {
  const w = generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(4),
  );
  return { ...w, moveset: defaultMoveset(registry, w, 'fire', slots) };
};

```

Replace:

```tsx

  it('Re-attune waits for the dive to end', () => {
```

with:

```tsx

  it('mid-dive Upgrade, Reforge and Salvage give way to "Forge and salvage at the Anvil"', () => {
    put(helm('fire', 'h1', [{ stat: 'fireAttune', value: 2, roll: 0.5 }]));
    store().startDive(1);
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('Forge and salvage at the Anvil');
    expect(screen.queryByTestId('upgrade-button')).toBeNull();
    expect(screen.queryByTestId('salvage-button')).toBeNull();
    expect(screen.queryByText('Reforge…')).toBeNull();
  });

  it('Re-attune waits for the dive to end', () => {
```

Replace the lines from `it('the bind prompt gives the last blow only while the basic chain is its default', () => {` up to (not including) `it('Not now equips for its stats only, and the prompt stays away this session', () => {` with:

```tsx
  it('the bind prompt says the chains keep their moves, and binding leaves them alone', () => {
    put(helm('storm'));
    const before = heroChains(registry, store().profile.equipped, store().profile.pair);
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('equip-button'));
    expect(screen.getByTestId('bind-prompt')).toHaveTextContent(
      'Your moves and blows can use Storm and its gear will attune you; your chains keep the ones they have',
    );
    expect(screen.getByTestId('bind-prompt')).not.toHaveTextContent('last blow');
    fireEvent.click(screen.getByTestId('bind-prompt-confirm'));
    expect(heroChains(registry, store().profile.equipped, store().profile.pair)).toEqual(before);
  });

```

Replace the lines from `it('mid-dive such gear just equips, with a toast', () => {` to the end of the file with:

```tsx
  it('mid-dive Equip and Unequip give way to "Equip at the Anvil"', () => {
    put(helm('storm'), rareSword('w1'));
    store().startDive(1);
    const sheet = (uid: string) => render(<ItemDetailSheet uid={uid} onClose={() => {}} />);
    let view = sheet('h1');
    expect(screen.queryByTestId('equip-button')).toBeNull();
    expect(screen.getByTestId('equip-locked')).toHaveTextContent('Equip at the Anvil');
    view.unmount();
    view = sheet(store().profile.equipped.weapon!.uid);
    expect(screen.queryByText('Unequip')).toBeNull();
    expect(screen.getByTestId('equip-locked')).toBeInTheDocument();
    view.unmount();
    sheet('w1');
    expect(screen.getByTestId('equip-locked')).toBeInTheDocument();
  });

  it('Equip best never asks, and leaves weapons alone', () => {
    put(helm('storm'), rareSword('w1', { primary: 5 })); // an empty helm slot: an upgrade
    // The sword is an upgrade too, which Equip best still leaves to its sheet.
    const { equipped, pair } = store().profile;
    expect(
      compareItem(equipped, store().profile.bag[1], registry, 1, pair).powerPct,
    ).toBeGreaterThan(UPGRADE_EPSILON);
    render(<BagPanel onSelect={() => {}} />);
    expect(screen.getByTestId('equip-best')).toHaveTextContent('▲ Equip best (1)');
    fireEvent.click(screen.getByTestId('equip-best'));
    expect(screen.queryByTestId('bind-prompt')).toBeNull();
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    expect(store().profile.equipped.weapon?.uid).not.toBe('w1');
    expect(store().profile.pair.secondary).toBeNull();
  });

  it("mid-dive the bag's Equip best and Salvage junk wait for the dive to end", () => {
    put(helm('storm'));
    store().startDive(1);
    render(<BagPanel onSelect={() => {}} />);
    expect(screen.getByTestId('equip-best')).toBeDisabled();
    expect(screen.getByTestId('equip-best')).toHaveTextContent('Equip between dives');
    expect(screen.getByTestId('salvage-junk')).toBeDisabled();
    expect(screen.getByTestId('salvage-junk')).toHaveTextContent('Salvage between dives');
  });

  it('mid-dive the Forge tab waits for the dive to end', () => {
    store().startDive(1);
    render(<ForgePanel onSelect={() => {}} />);
    expect(screen.getByTestId('forge-locked')).toHaveTextContent('forge and salvage between dives');
    expect(screen.queryByTestId('fuse-button')).toBeNull();
  });
});
```

In `packages/client/src/features/delve/__tests__/ManaPanel.test.tsx`:

Replace the lines from `it('says a bind gives the last blow only while the basic chain is its default', () => {` up to (not including) `expect(screen.getByTestId('bind-section')).not.toHaveTextContent('last blow');` with:

```tsx
  it('says a bind leaves the chains their moves', () => {
    store().setProfile({ ...store().profile, bag: [helm('storm')] });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('bind-section')).toHaveTextContent(
      'your moves and blows can use it, and your chains keep the ones they have',
    );
```

Replace:

```tsx
      'your moves and blows follow the new pair',
    );
```

with:

```tsx
      "your equipped weapon's moves and blows follow the new pair",
    );
```

In `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`:

Replace:

```tsx
import { defaultChains, sandboxWeapon } from '@alloy/engine';
import { MAX_DUMMY_GROUPS, useSandboxStore } from '@/stores/sandboxStore';
```

with:

```tsx
import { sandboxWeapon } from '@alloy/engine';
import { MAX_DUMMY_GROUPS, useSandboxStore } from '@/stores/sandboxStore';
```

Replace:

```tsx
      chains: defaultChains(registry, 'fire', 'sword'),
      pair: { primary: 'fire', secondary: null },
```

with:

```tsx
      pair: { primary: 'fire', secondary: null },
```

## Chunk 13: Client: the weapon's moveset everywhere (Task 13, part 2: the last tests, the store, the readers, the arena)

Task 13 continues from the previous chunk (Step 2's tests go on here).

The arena's tests: a new hero's common sword (`beginFloor` on a fresh profile) has no Defensive or Ultimate.

In `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`:

Replace:

```ts
  sandboxWeapon,
  setChain,
  startDive,
```

with:

```ts
  defaultMoveset,
  sandboxWeapon,
  startDive,
```

Replace the lines from `let p = createDelveProfile(registry, 99);` up to (not including) `it("shows each chain's next move: its name, kind and step, its own cooldown, and a hold's charge", () => {` with:

```ts
    // A new hero whose sword is epic (all four skills), its Primary a cast Bolt.
    const p = createDelveProfile(registry, 99);
    const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
    const moveset = defaultMoveset(registry, weapon, 'fire');
    moveset.chains.primary = {
      moves: [{ kind: 'medium', form: 'bolt', elements: ['fire'] }],
      payment: 'cast',
    };
    const armed = { ...p, equipped: { ...p.equipped, weapon: { ...weapon, moveset } } };
    const w = beginFloor(registry, startDive(registry, armed, 1));
    w.hero.nextAttackAt = 1e9;
    stepWorld(registry, w, { move: still, cast: { slot: 0, aim: null } }, STEP);
    const wu = w.hero.windup!;
    expect(w.t).toBeLessThan(wu.conjureUntil);
    let hud = snapshot(w);
    expect(hud.busy).toBe(false);
    expect(hud.abilities[1]!.ready).toBe(true);
    while (w.t < wu.conjureUntil) stepWorld(registry, w, { move: still }, STEP);
    hud = snapshot(w);
    expect(hud.busy).toBe(true);
    expect(hud.abilities[0]!.windup).toBeGreaterThanOrEqual(0);
    expect(hud.abilities[1]!.ready).toBe(false);
  });

  it('under Infinite mana a move dearer than the whole pool shows as affordable, as the engine casts it', () => {
    const ultimate = {
      moves: [{ kind: 'heavy' as const, form: 'nova' as const, elements: ['fire' as const] }],
      payment: 'mana' as const,
    };
    const on = sandbox({ ultimate }, {}, true);
    expect(on.hero.chains[2]!.moves[0].cost).toBeGreaterThan(on.hero.manaMax);
    expect(snapshot(on).abilities[2]!.affordable).toBe(true);
    const off = sandbox({ ultimate });
    off.hero.mana = off.hero.manaMax;
    expect(snapshot(off).abilities[2]!.affordable).toBe(false);
  });

```

Replace:

```ts
    expect(hud.abilities[0].hold!.charge).toBeCloseTo(0.57, 1);
    expect(hud.abilities[0].hold!.stage).toBe(1);
    expect(hud.abilities[0].chainStep).toBe(1); // the window waits for the release
    expect(hud.busy).toBe(true);
    expect(hud.abilities[1].ready).toBe(false);
  });
```

with:

```ts
    expect(hud.abilities[0]!.hold!.charge).toBeCloseTo(0.57, 1);
    expect(hud.abilities[0]!.hold!.stage).toBe(1);
    expect(hud.abilities[0]!.chainStep).toBe(1); // the window waits for the release
    expect(hud.busy).toBe(true);
    expect(hud.abilities[1]!.ready).toBe(false);
  });
```

Replace the lines from `let bolt = snapshot(w).abilities[0];` up to (not including) `it("carries Obsidian's barrier and when Galvanize last fired", () => {` with:

```ts
    let bolt = snapshot(w).abilities[0]!;
    expect(bolt).toMatchObject({ beat: true, ready: false });
    expect(bolt.cooldown).toBeCloseTo(0.4);
    expect(bolt.cooldownTotal).toBeCloseTo(0.6);
    // A cooldown that outlasts the beat shows instead, with its own length.
    w.hero.cooldowns[0][0] = 11;
    bolt = snapshot(w).abilities[0]!;
    expect(bolt).toMatchObject({ beat: false, cooldown: 1, ready: false });
    expect(bolt.cooldownTotal).toBeCloseTo(w.hero.chains[0]!.moves[0].cooldown);
    // Over, and the button is ready again.
    w.t = 11;
    expect(snapshot(w).abilities[0]).toMatchObject({ beat: false, cooldown: 0, ready: true });
  });

  it("a skill the weapon doesn't carry has no entry, and its slot keeps its place", () => {
    // A new hero's common sword: Basic and Primary only.
    const w = beginFloor(registry, startDive(registry, createDelveProfile(registry, 99), 1));
    const hud = snapshot(w);
    expect(hud.abilities).toHaveLength(3);
    expect(hud.abilities[0]).toMatchObject({ name: 'Fire Bolt' });
    expect(hud.abilities[1]).toBeNull();
    expect(hud.abilities[2]).toBeNull();
  });

```

In `packages/client/src/features/delve/__tests__/arena-input.test.ts`:

Replace the lines from `chainMove,` up to (not including) `stepWorld,` with:

```ts
  beginFloor,
  chainMove,
  computeHeroStats,
  createDelveProfile,
  createSandboxWorld,
  defaultChains,
  moveNumbers,
  spawnDummies,
  startDive,
```

Replace:

```ts

  it("none before a tap's time, nor while a HUD press is still on its button; then at the pointer", () => {
```

with:

```ts

  it("none for a skill the weapon doesn't carry", () => {
    // A new hero's common sword: no Defensive.
    const w = beginFloor(registry, startDive(registry, createDelveProfile(registry, 99), 1));
    expect(aimView(w, { ...aiming, slot: 1 }, point, 1000)).toBeNull();
    expect(aimView(w, aiming, point, 1000)).toMatchObject({ marker: 'line' });
  });

  it("none before a tap's time, nor while a HUD press is still on its button; then at the pointer", () => {
```

Replace the lines from `expect(view.radius).toBeCloseTo(chainMove(w.hero.chains[0], 0, 2).radius);` up to (not including) `expect(view.radius).toBeCloseTo(` with:

```ts
    expect(view.radius).toBeCloseTo(chainMove(w.hero.chains[0]!, 0, 2).radius);
    expect(view.radius).toBeGreaterThan(w.hero.chains[0]!.moves[0].radius);
  });

  it("a later move's circle has its step's size: a Burst as move 4", () => {
    const burst: Move = { kind: 'medium', form: 'burst', elements: ['fire'] };
    const w = world({ moves: [burst, burst, burst, burst], payment: 'mana' });
    // Pressed to its third move: the next press is its fourth.
    w.hero.comboStep[0] = 2;
    w.hero.comboAt[0] = w.t;
    const fourth = w.hero.chains[0]!.moves[3];
    const view = aimView(w, aiming, point, 1000)!;
    expect(view.marker).toBe('circle');
```

Replace:

```ts
      attackTap: false,
    });
  });
```

with:

```ts
      attackTap: false,
    });
  });

  it("the pad's button of a skill the weapon doesn't carry casts nothing", () => {
    // A new hero's common sword: no Defensive.
    const w = beginFloor(registry, startDive(registry, createDelveProfile(registry, 99), 1));
    const input = createArenaInput();
    expect(frameInput(registry, w, input, pad({ cast: [1] }), padMemory(), opts).cast).toBeNull();
    expect(frameInput(registry, w, input, pad({ cast: [0] }), padMemory(), opts).cast).toEqual({
      slot: 0,
      aim: null,
    });
    // A key's press in the same frame as that button's goes now, and only once.
    input.cast = { slot: 0, aim: null };
    expect(frameInput(registry, w, input, pad({ cast: [1] }), padMemory(), opts).cast).toEqual({
      slot: 0,
      aim: null,
    });
    expect(input.cast).toBeNull();
  });
```

Create `packages/client/src/features/delve/__tests__/LootTray.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { generateItem, SeededRNG } from '@alloy/engine';
import { LootTray } from '../LootTray';
import { PickupFeed } from '../arena/PickupFeed';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

describe("the dive's loot: upgrades wait for the Anvil", () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    // A helm for the empty slot and a rare weapon, found this dive: two upgrades.
    const helm = generateItem(
      registry,
      { uid: 'h1', ilvl: 3, rarity: 'rare', slot: 'helm', mana: 'fire' },
      new SeededRNG(4),
    );
    const blade = generateItem(
      registry,
      { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', mana: 'fire' },
      new SeededRNG(5),
    );
    store().setProfile({ ...store().profile, bag: [helm, blade] });
  });

  /** Dive, and find the helm and the weapon (a new dive forgets the last one's drops). */
  const dive = () => {
    store().startDive(1);
    store().pushDiveDrops(['h1', 'w1']);
  };

  it('mid-dive the tray marks every upgrade, the weapon too, with no Equip, only the Anvil note', () => {
    dive();
    const origin = { current: null };
    render(<LootTray originRef={origin} onSelect={() => {}} />);
    expect(screen.queryByTestId('equip-upgrades')).toBeNull();
    expect(screen.getByTestId('upgrades-locked')).toHaveTextContent('▲ 2 to equip at the Anvil');
  });

  it("the arena's feed says the same", () => {
    dive();
    render(<PickupFeed onSelect={() => {}} top={0} />);
    expect(screen.queryByTestId('equip-upgrades')).toBeNull();
    expect(screen.getByTestId('upgrades-locked')).toHaveTextContent('▲ 2 to equip at the Anvil');
  });

  it('once the dive has ended, the tray equips again, but never a weapon', () => {
    dive();
    store().setProfile({
      ...store().profile,
      dive: { ...store().profile.dive!, phase: 'extracted' },
    });
    render(<LootTray originRef={{ current: null }} onSelect={() => {}} />);
    expect(screen.getByTestId('equip-upgrades')).toHaveTextContent('▲ Equip upgrades (1)');
  });
});
```


- [ ] **Step 3: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts src/stores/sandboxStore.test.ts src/pages/__tests__/DelveCamp.test.tsx src/features/delve/__tests__/AbilitiesPanel.test.tsx src/features/delve/__tests__/ArenaHud.test.tsx src/features/delve/__tests__/ItemDetailSheet.test.tsx src/features/delve/__tests__/ManaPanel.test.tsx src/features/delve/__tests__/TrainingPanel.test.tsx src/features/delve/__tests__/arena-hud-snapshot.test.ts src/features/delve/__tests__/arena-input.test.ts src/features/delve/__tests__/LootTray.test.tsx)`
Expected: FAIL, 51 failed and 90 passed (141), in 10 of the 11 files (only `DelveCamp.test.tsx` passes whole): among them `(0 , movesetNotices) is not a function`, `useDelveStore.getState(...).setChains is not a function`, `s(...).addSlot is not a function`, `Cannot read properties of null (reading 'moves')` (the HUD, the builder's tabs) and the gear lock's `expect(element).toBeDisabled()`.

- [ ] **Step 4: The store, and Load my build**

In `packages/client/src/stores/delveStore.ts`:

Replace:

```ts
  setChain as engineSetChain,
  bindSecondary as engineBindSecondary,
```

with:

```ts
  setChains as engineSetChains,
  addSlot as engineAddSlot,
  bindSecondary as engineBindSecondary,
```

Replace:

```ts

/** "Storm now outweighs Fire: Storm is your primary" (`now` is the new primary). */
```

with:

```ts

/**
 * What the move to weapon movesets (save version 6) changed: the chains the
 * equipped weapon can't carry went (`dropped`, their extra moves back as
 * `links`), or an unarmed save's built chains were reset (`reset`).
 */
export function movesetNotices(dropped: ChainSkill[], reset: boolean, links: number): string[] {
  const out: string[] = [];
  if (dropped.length > 0) {
    const names = listed(dropped.map((s) => SKILL_NAME[s]));
    const many = dropped.length > 1;
    const back =
      links > 0
        ? `, and ${many ? 'their' : 'its'} ${links} extra move${links === 1 ? '' : 's'} came back as ${links} Link${links === 1 ? '' : 's'}`
        : '';
    out.push(
      `Your chains live on your weapon now, and yours can't carry your ${names}: ${many ? 'they' : 'it'} went${back}`,
    );
  }
  if (reset)
    out.push(
      'Your chains live on your weapon now: with no weapon equipped, yours were reset to the defaults',
    );
  return out;
}

/** "Storm now outweighs Fire: Storm is your primary" (`now` is the new primary). */
```

Replace the lines from `salvage: (uids: string[]) => { scrap: number; dust: number };` up to (not including) `setManualAttack: (on: boolean) => void;` with:

```ts
  salvage: (uids: string[]) => { scrap: number; dust: number; links: number };
  equipBest: () => GearItem[];
  upgrade: (uid: string) => ProfileActionResult;
  reforge: (uid: string, affixIndex: number) => ProfileActionResult;
  fuse: (uids: string[]) => ProfileActionResult;
  setAutoSalvage: (rarity: Rarity, on: boolean) => void;
  markNew: (uids: string[]) => void;
  markSeen: (uids: string[]) => void;
  pushDiveDrops: (uids: string[]) => void;
  /** Set the equipped weapon's changed chains, for Mana Dust: all or nothing. */
  setChains: (chains: Partial<Chains>) => ProfileActionResult;
  /** Add a slot to a chain of the equipped weapon, for Links and scrap. */
  addSlot: (skill: ChainSkill) => ProfileActionResult;
```

Replace:

```ts
            : []),
          ...fixNotices(getDelveRegistry(), loaded.fixed, loaded.profile.pair),
```

with:

```ts
            : []),
          ...movesetNotices(loaded.dropped, loaded.movesetReset, loaded.profile.links),
          ...fixNotices(getDelveRegistry(), loaded.fixed, loaded.profile.pair),
```

Replace:

```ts
      return { scrap: res.scrap, dust: res.dust };
    },
```

with:

```ts
      return { scrap: res.scrap, dust: res.dust, links: res.links };
    },
```

Replace:

```ts
    setChain: (skill, chain) => {
      commit(engineSetChain(registry(), get().profile, skill, chain));
    },
  };
```

with:

```ts
    setChains: (chains) => applyResult(engineSetChains(registry(), get().profile, chains)),

    addSlot: (skill) => applyResult(engineAddSlot(registry(), get().profile, skill)),
  };
```

In `packages/client/src/stores/sandboxStore.ts`:

Replace:

```ts
  followBasic,
  sandboxWeapon,
```

with:

```ts
  followBasic,
  heroChains,
  sandboxWeapon,
```

Replace:

```ts
  /** Copy the save's gear, chains and pair in (its powers and attunement then come from the items). */
  loadMyBuild: (profile: Pick<DelveProfile, 'equipped' | 'chains' | 'pair'>) => void;
  reset: () => void;
```

with:

```ts
  /**
   * Copy the save's gear, its weapon's chains and its pair in (its powers and attunement then
   * come from the items); a skill the weapon doesn't carry keeps the sandbox's chain.
   */
  loadMyBuild: (profile: Pick<DelveProfile, 'equipped' | 'pair'>) => void;
  reset: () => void;
```

Replace:

```ts
        chains: profile.chains,
        legendaries: {},
```

with:

```ts
        chains: {
          ...get().chains,
          ...heroChains(getDelveRegistry(), profile.equipped, profile.pair),
        },
        legendaries: {},
```

In `packages/client/src/features/delve/training/TrainingPanel.tsx`:

Replace:

```tsx
        Copies your equipped gear, chains and pair in. Nothing here ever changes your save.
      </p>
```

with:

```tsx
        Copies your equipped gear, your weapon's chains and your pair in. Nothing here ever changes
        your save.
      </p>
```

- [ ] **Step 5: The readers**

In `packages/client/src/pages/DelveCamp.tsx`:

Replace:

```tsx
  const { equipped, pair, chains } = profile;
  const attunement = useMemo(
    () => profileStats(registry, { equipped, pair, chains }).attunement,
    [equipped, pair, chains, registry],
  );
```

with:

```tsx
  const { equipped, pair } = profile;
  const attunement = useMemo(
    () => profileStats(registry, { equipped, pair }).attunement,
    [equipped, pair, registry],
  );
```

In `packages/client/src/features/delve/PaperDoll.tsx`:

Replace:

```tsx
import { estimateCombat, profileStats, referenceDepth, type GearSlot } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
import {
  estimateCombat,
  heroChains,
  profileStats,
  referenceDepth,
  type GearSlot,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
  const { equipped, pair, chains } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair, chains }),
    [equipped, pair, chains, registry],
  );
  const est = useMemo(
```

with:

```tsx
  const { equipped, pair } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [equipped, pair, registry],
  );
  const chains = useMemo(() => heroChains(registry, equipped, pair), [equipped, pair, registry]);
  const est = useMemo(
```

In `packages/client/src/features/delve/arena/useArena.ts`:

Replace:

```ts
  failFloor,
  profileStats,
```

with:

```ts
  failFloor,
  heroChains,
  profileStats,
```

Replace:

```ts
  const { equipped, pair, chains } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair, chains }),
    [equipped, pair, chains, registry],
  );
  const loadout = useMemo(() => ({ stats, chains }), [stats, chains]);
```

with:

```ts
  const { equipped, pair } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [equipped, pair, registry],
  );
  const chains = useMemo(() => heroChains(registry, equipped, pair), [equipped, pair, registry]);
  const loadout = useMemo(() => ({ stats, chains }), [stats, chains]);
```

- [ ] **Step 6: Absent skills in the arena**

In `packages/client/src/features/delve/arena/useArenaCore.ts`:

Replace:

```ts
  abilities: AbilityHud[];
  /** An ability is channelling or a hold is charging (presses wait for it). */
```

with:

```ts
  /** By slot; null for a skill the weapon doesn't carry (its button hides). */
  abilities: (AbilityHud | null)[];
  /** An ability is channelling or a hold is charging (presses wait for it). */
```

Replace:

```ts
  /** The hero's stats and chains, hot-swapped whenever this object changes: memoise it. */
  loadout: { stats: HeroStats; chains: Chains };
  /**
```

with:

```ts
  /**
   * The hero's stats and chains (a skill without one has no button), hot-swapped whenever this
   * object changes: memoise it.
   */
  loadout: { stats: HeroStats; chains: Partial<Chains> };
  /**
```

Replace:

```ts
    abilities: h.chains.map((chain, i) => {
      const step = pressStep(h, i, t, comboWindow);
```

with:

```ts
    abilities: h.chains.map((chain, i) => {
      if (!chain) return null;
      const step = pressStep(h, i, t, comboWindow);
```

Replace the lines from `function aimedMove(world: ArpgWorld, slot: number): ResolvedAbility {` up to (not including) `: pressMove(h, slot, world.t, bal.abilities.comboWindow);` with:

```ts
function aimedMove(world: ArpgWorld, slot: number): ResolvedAbility | null {
  const h = world.hero;
  const bal = getDelveRegistry().getDelveBalance();
  const hold = h.hold?.slot === slot ? h.hold : null;
  return hold
    ? chainMove(h.chains[slot]!, hold.step, holdCharge(bal, hold.start, world.t, hold.full).stage)
```

Replace:

```ts
  const ab = aimedMove(world, a.slot);
  return {
```

with:

```ts
  const ab = aimedMove(world, a.slot);
  if (!ab) return null;
  return {
```

Replace:

```ts
      const ab = aimedMove(world, 0);
      const tilt = Math.hypot(state.right.x, state.right.y);
```

with:

```ts
      const ab = aimedMove(world, 0);
      if (!ab) return null;
      const tilt = Math.hypot(state.right.x, state.right.y);
```

In `packages/client/src/features/delve/arena/ArenaHud.tsx`:

Replace the lines from `{hud?.abilities.map((ab, i) => (` to the end of the file with:

```tsx
      {/* A skill the weapon doesn't carry has no button; the others keep their slots. */}
      {hud?.abilities.map((ab, i) =>
        !ab ? null : (
          <AbilityButton
            key={i}
            slot={i}
            ab={ab}
            busy={hud.busy}
            galvanized={galvanized}
            hint={hints?.abilities[i]}
            press={press}
            onCast={onCast}
            onAim={onAim}
            onCancel={onCancel}
          />
        ),
      )}
    </div>
  );
}
```

In `packages/client/src/features/delve/arena/input.ts`:

Replace:

```ts
  if (pad && padCast) {
    const { slot, repeat } = padCast;
    const ab = pressMove(h, slot, world.t, registry.getDelveBalance().abilities.comboWindow);
    const placed = aimMarkerFor(ab.form.id) === 'circle';
```

with:

```ts
  const comboWindow = registry.getDelveBalance().abilities.comboWindow;
  // A skill the weapon doesn't carry has no move: its button casts nothing.
  const ab = padCast && pressMove(h, padCast.slot, world.t, comboWindow);
  const padTook = !!(pad && padCast && ab);
  if (pad && padCast && ab) {
    const { slot, repeat } = padCast;
    const placed = aimMarkerFor(ab.form.id) === 'circle';
```

Replace:

```ts
  input.cast = padCast ? press : null;
  input.cancelHold = false;
```

with:

```ts
  input.cast = padTook ? press : null;
  input.cancelHold = false;
```

In `packages/client/src/features/gamepad/arena-pad.ts`:

Replace:

```ts
  return h.hold?.slot === slot || pressMove(h, slot, world.t, window).kind === 'hold';
}
```

with:

```ts
  return h.hold?.slot === slot || pressMove(h, slot, world.t, window)?.kind === 'hold';
}
```

In `packages/client/src/features/delve/arena/fx/anticipation.ts`:

Replace:

```ts
    const ab = chainMove(h.chains[h.hold.slot], h.hold.step, stage);
    const at = aim ?? h.hold.aim;
```

with:

```ts
    const ab = chainMove(h.chains[h.hold.slot]!, h.hold.step, stage);
    const at = aim ?? h.hold.aim;
```

In `packages/client/src/features/delve/arena/fx/draw-world.ts`:

Replace:

```ts
  return h.defend ? chainMove(h.chains[1], h.defend.move, h.defend.stage) : null;
}
```

with:

```ts
  return h.defend ? chainMove(h.chains[1]!, h.defend.move, h.defend.stage) : null;
}
```

## Chunk 14: Client: the weapon's moveset everywhere (Task 13, part 3: the builder and the gear lock)

Task 13 continues from the previous chunk.

- [ ] **Step 7: The chain builder on the weapon, with locked tabs**

In `packages/client/src/features/delve/chains/ChainEditor.tsx`:

Replace the lines from `chains: Chains;` up to (not including) `onChange: <S extends ChainSkill>(skill: S, chain: Chains[S]) => void;` with:

```tsx
  /** Each skill's chain; a skill without one (the weapon doesn't carry it) shows locked. */
  chains: Partial<Chains>;
  /** Most moves each skill's chain may hold (the Delve: the weapon's slots). */
  caps: Partial<Record<ChainSkill, number>>;
  /** The hero the chains resolve against: legendaries, cooldowns, damage, life, attunement, pool. */
  stats: HeroStats;
  /** Reactions shown by name; the rest show as ???. */
  reactionsSeen: readonly string[];
  /** Read-only (a dive is under way). */
  locked: boolean;
  /** Why a skill has no chain (the text its locked tab shows). */
  absentText?: (skill: ChainSkill) => string;
```

Replace the lines from `* and Ultimate) is a row of move cards, up to its cap. A card opens its move` up to (not including) `onChange,` with:

```tsx
 * and Ultimate) is a row of move cards, up to its cap; a skill without a chain
 * shows locked. A card opens its move below: its kind, its form and its
 * elements. ◂ ▸ reorder, × removes (never the last), + adds a copy of the
 * chosen move. The Anvil binds it to the equipped weapon's moveset; the
 * Training Grounds to their own loadout. See the moves and chains spec.
 */
export function ChainEditor({
  chains,
  caps,
  stats,
  reactionsSeen,
  locked,
  absentText,
```

Replace the lines from `const chain = slot ? chains[slot] : null;` up to (not including) `const weapon = stats.weapon.baseId ? registry.getGearBase(stats.weapon.baseId).name : 'Fist';` with:

```tsx
  const chain = slot ? (chains[slot] ?? null) : null;
  // A skill the weapon doesn't carry: its locked text, and no cards.
  const absent = !chains[skill];
  const entries: (Move | Blow)[] = chain ? chain.moves : absent ? [] : chains.basic!;
  const index = Math.min(picked, entries.length - 1);
  const resolved = chain && slot ? resolveChain(registry, stats, slot, chain) : null;
  const names = resolved
    ? resolved.moves.map(moveText)
    : entries.map((b) => blowText(registry, b as Blow));
```

Replace the lines from `{s === 'basic' ? '⚔️' : registry.getForm(chains[s].moves[0].form).icon}` up to (not including) `className="delve-panel p-2 text-center text-xs text-amber-200"` with:

```tsx
              {s === 'basic'
                ? '⚔️'
                : chains[s]
                  ? registry.getForm(chains[s].moves[0].form).icon
                  : '🔒'}
            </span>
            <span className="text-[11px] font-semibold text-stone-200">
              {chains[s]
                ? `${(s === 'basic' ? chains.basic! : chains[s].moves).length} of ${caps[s]}`
                : 'Locked'}
            </span>
          </button>
        ))}
      </div>

      <div className="text-xs text-stone-400" data-testid="abilities-summary">
        {absent ? `🔒 ${absentText?.(skill) ?? ''}` : chainText(names)}
      </div>

      {locked && !absent && (
        <div
```

Replace:

```tsx
        {entries.length < caps[skill] && (
          <button
```

with:

```tsx
        {!absent && entries.length < (caps[skill] ?? 0) && (
          <button
```

Replace the lines from `<fieldset` up to (not including) `{chain && (` with:

```tsx
      <fieldset
        hidden={absent}
        disabled={locked}
        className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
        style={{ opacity: locked ? 0.55 : 1 }}
      >
        {!absent && (
          <MoveEditor
            slot={slot}
            move={entries[index]}
            resolved={resolved?.moves[index] ?? null}
            full={resolved?.hold[index]?.[2] ?? null}
            blow={slot ? null : stats.weapon.blows[index]}
            stats={stats}
            pool={pool}
            elements={slot ? elements : blowElements}
            onChange={(next) => commit(entries.map((e, i) => (i === index ? next : e)))}
          />
        )}

```

In `packages/client/src/features/delve/AbilitiesPanel.tsx`:

Replace:

```tsx
  MANA_TYPES,
  isDiveActive,
  manaPool,
  pairElements,
```

with:

```tsx
  CHAIN_SKILLS,
  MANA_TYPES,
  baseSlots,
  carriedByText,
  heroChains,
  isDiveActive,
  manaPool,
  movesetOf,
  pairElements,
```

Replace the lines from `/** The Anvil's workshop: the save's chains from your two elements, and your Mana view; read-only while a dive is under way. */` up to (not including) `elements={elements.length > 0 ? elements : undefined}` with:

```tsx
/**
 * The Anvil's workshop: the equipped weapon's chains from your two elements,
 * each change applied as it is made, and your Mana view; read-only while a
 * dive is under way, and unarmed (the unarmed default shows).
 */
export function AbilitiesPanel() {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const { equipped, pair } = profile;
  const weapon = equipped.weapon;
  const chains = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  // Unarmed, the default chains sit at their base slots (the bare hands' string for the basic one).
  const slots = weapon
    ? movesetOf(registry, weapon).slots
    : Object.fromEntries(
        CHAIN_SKILLS.filter((s) => chains[s]).map((s) => [s, baseSlots(registry, null, s)]),
      );
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [equipped, pair, registry],
  );
  const elements = pairElements(pair);
  return (
    <ChainEditor
      chains={chains}
      caps={slots}
      stats={stats}
      reactionsSeen={profile.reactionsSeen}
      locked={isDiveActive(profile) || !weapon}
      absentText={(s) => carriedByText(registry, s)}
      onChange={(skill, chain) => useDelveStore.getState().setChains({ [skill]: chain })}
```

- [ ] **Step 8: The gear lock, and the bind texts**

`BagPanel.tsx`, `LootTray.tsx` and `ForgePanel.tsx` are CRLF in the working tree: hand-edit them, never format them.

In `packages/client/src/features/delve/ItemDetailSheet.tsx`:

Replace:

```tsx
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
```

with:

```tsx
import { playSound } from '@/shared/utils/sound-manager';
```

Replace:

```tsx
        ? compareItem(profile.equipped, item, registry, depth, profile.chains, profile.pair)
        : null,
    [item, isEquipped, profile.equipped, profile.pair, profile.chains, registry, depth],
  );
```

with:

```tsx
        ? compareItem(profile.equipped, item, registry, depth, profile.pair)
        : null,
    [item, isEquipped, profile.equipped, profile.pair, registry, depth],
  );
```

Replace the lines from `if (unbound && !diving && !store().bindDeclined.includes(item.mana)) {` up to (not including) `playSound('orbPlace');` with:

```tsx
    if (unbound && !store().bindDeclined.includes(item.mana)) {
      setBinding(true);
      return;
    }
    store().equip(item.uid);
```

Replace:

```tsx
          {isEquipped ? (
            <button className="delve-btn" onClick={onUnequip}>
```

with:

```tsx
          {diving ? (
            <div
              className="delve-panel flex items-center justify-center p-2 text-center text-xs text-amber-200"
              data-testid="equip-locked"
            >
              Equip at the Anvil
            </div>
          ) : isEquipped ? (
            <button className="delve-btn" onClick={onUnequip}>
```

Replace the lines from `{isUpgrade ? '▲ Equip' : 'Equip'}` up to (not including) `<button className="delve-btn" onClick={onLock}>` with:

```tsx
              {isUpgrade ? '▲ Equip' : 'Equip'}
            </button>
          )}
          {diving ? (
            <div
              className="delve-panel flex items-center justify-center p-2 text-center text-xs text-amber-200"
              data-testid="forge-locked"
            >
              Forge and salvage at the Anvil
            </div>
          ) : (
            <>
              <button
                className="delve-btn delve-btn-gold"
                onClick={onUpgrade}
                disabled={upCost === null}
                data-testid="upgrade-button"
              >
                {upCost === null ? 'Max +10' : `Upgrade ⚙ ${formatNumber(upCost)}`}
              </button>
              {affixes.length > 0 &&
                (reforgeMode ? (
                  <button className="delve-btn" onClick={onReforge} disabled={reforgeIdx === null}>
                    {reforgeIdx === null ? 'Pick an affix' : `Reforge ⚙ ${formatNumber(rfCost)}`}
                  </button>
                ) : (
                  <button className="delve-btn" onClick={() => setReforgeMode(true)}>
                    Reforge…
                  </button>
                ))}
              <button
                className="delve-btn delve-btn-danger"
                onClick={onSalvage}
                disabled={isEquipped || item.locked}
                data-testid="salvage-button"
              >
                {confirmSalvage
                  ? 'Tap again to melt'
                  : `Salvage +${formatNumber(salvage)}${dust > 0 ? ` · ✦ ${dust}` : ''}`}
              </button>
            </>
          )}
```

In `packages/client/src/features/delve/BagPanel.tsx`:

Replace:

```tsx
  compareItem,
  referenceDepth,
```

with:

```tsx
  compareItem,
  isDiveActive,
  referenceDepth,
```

Replace the lines from `delta: compareItem(profile.equipped, item, registry, depth, profile.chains, profile.pair)` up to (not including) `const junk = useMemo(() => salvageCandidates(registry, profile, 'magic'), [registry, profile]);` with:

```tsx
        delta: compareItem(profile.equipped, item, registry, depth, profile.pair).powerPct,
      }))
      .sort(
        (a, b) =>
          rarityIndex(b.item.rarity) - rarityIndex(a.item.rarity) ||
          b.delta - a.delta ||
          b.item.ilvl - a.item.ilvl,
      );
  }, [profile.bag, profile.equipped, profile.pair, registry, depth]);

  // Equip best leaves weapons alone: a weapon changes through its sheet (Equip or Transfer).
  const upgrades = rows.filter((r) => r.delta > UPGRADE_EPSILON && r.item.slot !== 'weapon').length;
  const diving = isDiveActive(profile);
```

Replace the lines from `` className={`delve-btn flex-1 text-sm ${upgrades > 0 ? 'delve-btn-green' : ''}`} `` up to (not including) `<div className="flex items-center justify-between text-xs text-stone-400">` with:

```tsx
          className={`delve-btn flex-1 text-sm ${upgrades > 0 && !diving ? 'delve-btn-green' : ''}`}
          disabled={upgrades === 0 || diving}
          onClick={onEquipBest}
          data-testid="equip-best"
        >
          {diving ? 'Equip between dives' : `▲ Equip best${upgrades > 0 ? ` (${upgrades})` : ''}`}
        </button>
        <button
          className="delve-btn flex-1 text-sm"
          disabled={junk.length === 0 || diving}
          onClick={onSalvageJunk}
          data-testid="salvage-junk"
        >
          {diving ? 'Salvage between dives' : `Salvage junk${junk.length > 0 ? ` (${junk.length})` : ''}`}
        </button>
      </div>

```

In `packages/client/src/features/delve/LootTray.tsx`:

Replace:

```tsx
import { compareItem, findItem, referenceDepth, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
import { compareItem, findItem, isDiveActive, referenceDepth, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
```

Replace the lines from `: compareItem(profile.equipped, found.item, registry, depth, profile.chains, profile.pair)` up to (not including) `const overflow = rows.length > capacity ? rows.length - (capacity - 1) : 0;` with:

```tsx
          : compareItem(profile.equipped, found.item, registry, depth, profile.pair).powerPct,
      });
    }
    return out;
  }, [diveDrops, profile, registry, depth]);

  // Mid-dive every upgrade waits for the Anvil; after it, Equip upgrades
  // leaves weapons alone (a weapon changes through its sheet).
  const better = rows.filter((r) => r.delta !== null && r.delta > UPGRADE_EPSILON);
  const diving = isDiveActive(profile);
  const upgrades = better.filter((r) => r.item.slot !== 'weapon').length;
```

Replace:

```tsx
        {upgrades > 0 && (
          <button
```

with:

```tsx
        {better.length > 0 && diving && (
          <span className="text-[11px] text-amber-200" data-testid="upgrades-locked">
            ▲ {better.length} to equip at the Anvil
          </span>
        )}
        {upgrades > 0 && !diving && (
          <button
```

In `packages/client/src/features/delve/ForgePanel.tsx`:

Replace:

```tsx
  fuseCost,
  nextRarity,
```

with:

```tsx
  fuseCost,
  isDiveActive,
  nextRarity,
```

Replace:

```tsx

  return (
```

with:

```tsx

  // The forge waits for the dive to end, as all gear does (a stop's upgrade aside).
  if (isDiveActive(profile))
    return (
      <div className="flex flex-col gap-4" data-testid="forge-panel">
        <div
          className="delve-panel p-3 text-center text-xs text-amber-200"
          data-testid="forge-locked"
        >
          A dive is under way: forge and salvage between dives.
        </div>
      </div>
    );

  return (
```

In `packages/client/src/features/delve/arena/PickupFeed.tsx`:

Replace:

```tsx
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { getDelveRegistry } from '../registry';
```

with:

```tsx
import { getDelveRegistry } from '../registry';
```

Replace:

```tsx
 * arena. Tap one to inspect it mid-fight; ▲ marks an upgrade, and one tap
 * equips every upgrade without leaving the floor.
 */
```

with:

```tsx
 * arena. Tap one to inspect it mid-fight; ▲ marks an upgrade, to equip at the
 * Anvil (gear is locked while a dive runs).
 */
```

Replace:

```tsx
          : compareItem(profile.equipped, found.item, registry, depth, profile.chains, profile.pair)
              .powerPct,
      });
```

with:

```tsx
          : compareItem(profile.equipped, found.item, registry, depth, profile.pair).powerPct,
      });
```

Replace the lines from `const onEquipUpgrades = () => {` up to (not including) `{visible.map(({ item, equipped, delta }) => (` with:

```tsx
  return (
    <div
      className="pointer-events-none absolute right-2 z-20 flex flex-col items-end gap-1.5"
      style={{ top }}
      data-testid="pickup-feed"
    >
      {upgrades > 0 && (
        <span
          className="delve-display text-[10px] uppercase tracking-wider text-green-300"
          data-testid="upgrades-locked"
        >
          ▲ {upgrades} to equip at the Anvil
        </span>
      )}
```

In `packages/client/src/features/delve/BindPrompt.tsx`:

Replace the lines from `import {` up to (not including) `* be asked about that element again this session ("Not now" is remembered per` with:

```tsx
import { bindSecondary, equipItem, profilePower, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
import { formatNumber, manaStyle } from './format';

/**
 * Equipping gear outside the pair while no second element is bound (at the
 * Anvil, between dives): bind its element and equip, or equip it for its stats only and not
```

Replace:

```tsx
  // Only a basic chain still on its default gives the secondary its last blow.
  const onDefault = isDefaultBasic(registry, profile.chains.basic, basicLoadout(profile)!);

```

with:

```tsx

```

Replace:

```tsx
          {onDefault
            ? `Your basic chain's last blow will strike with ${st.name}, your abilities can use it, and its gear will attune you.`
            : `Your abilities can use ${st.name} and its gear will attune you; your basic chain keeps the blows you built (add ${st.name} on the Basic tab).`}{' '}
          After that, only a Realign changes it.
        </p>
```

with:

```tsx
          Your moves and blows can use {st.name} and its gear will attune you; your chains keep the
          ones they have (add {st.name} in the chain builder). After that, only a Realign changes
          it.
        </p>
```

In `packages/client/src/features/delve/ManaPanel.tsx`:

Replace:

```tsx
  basicLoadout,
  bindSecondary,
  isDefaultBasic,
  isDiveActive,
```

with:

```tsx
  bindSecondary,
  isDiveActive,
```

Replace:

```tsx
            {isDefaultBasic(registry, profile.chains.basic, basicLoadout(profile)!)
              ? "Bind a second element: your basic chain's last blow strikes with it and your abilities can use it."
              : 'Bind a second element: your abilities can use it, and your basic chain keeps the blows you built (add the element on the Basic tab).'}{' '}
            Power now {formatNumber(profilePower(registry, profile))}.
          </div>
```

with:

```tsx
            Bind a second element: your moves and blows can use it, and your chains keep the ones
            they have (add the element in the chain builder). Power now{' '}
            {formatNumber(profilePower(registry, profile))}.
          </div>
```

Replace:

```tsx
            scrap. Gear stays as it is; your moves and blows follow the new pair.
          </div>
```

with:

```tsx
            scrap. Gear stays as it is; your equipped weapon's moves and blows follow the new pair.
          </div>
```

- [ ] **Step 9: Run the tests again**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts src/stores/sandboxStore.test.ts src/pages/__tests__/DelveCamp.test.tsx src/features/delve/__tests__/AbilitiesPanel.test.tsx src/features/delve/__tests__/ArenaHud.test.tsx src/features/delve/__tests__/ItemDetailSheet.test.tsx src/features/delve/__tests__/ManaPanel.test.tsx src/features/delve/__tests__/TrainingPanel.test.tsx src/features/delve/__tests__/arena-hud-snapshot.test.ts src/features/delve/__tests__/arena-input.test.ts src/features/delve/__tests__/LootTray.test.tsx)`
Expected: PASS, 141 tests in 11 files.

- [ ] **Step 10: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 732 tests pass (90 files).

- [ ] **Step 11: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx prettier --write src/stores/delveStore.ts src/stores/sandboxStore.ts src/features/delve/training/TrainingPanel.tsx src/pages/DelveCamp.tsx src/features/delve/PaperDoll.tsx src/features/delve/arena/useArena.ts src/features/delve/arena/useArenaCore.ts src/features/delve/arena/ArenaHud.tsx src/features/delve/arena/input.ts src/features/gamepad/arena-pad.ts src/features/delve/arena/fx/anticipation.ts src/features/delve/arena/fx/draw-world.ts src/features/delve/chains/ChainEditor.tsx src/features/delve/AbilitiesPanel.tsx src/features/delve/ItemDetailSheet.tsx src/features/delve/arena/PickupFeed.tsx src/features/delve/BindPrompt.tsx src/features/delve/ManaPanel.tsx src/stores/delveStore.test.ts src/stores/sandboxStore.test.ts src/pages/__tests__/DelveCamp.test.tsx src/features/delve/__tests__/AbilitiesPanel.test.tsx src/features/delve/__tests__/ArenaHud.test.tsx src/features/delve/__tests__/ManaPanel.test.tsx src/features/delve/__tests__/TrainingPanel.test.tsx src/features/delve/__tests__/arena-hud-snapshot.test.ts src/features/delve/__tests__/arena-input.test.ts src/features/delve/__tests__/LootTray.test.tsx)
git add packages/client/src/stores/delveStore.ts packages/client/src/stores/sandboxStore.ts packages/client/src/features/delve/training/TrainingPanel.tsx packages/client/src/pages/DelveCamp.tsx packages/client/src/features/delve/PaperDoll.tsx packages/client/src/features/delve/arena/useArena.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/ArenaHud.tsx packages/client/src/features/delve/arena/input.ts packages/client/src/features/gamepad/arena-pad.ts packages/client/src/features/delve/arena/fx/anticipation.ts packages/client/src/features/delve/arena/fx/draw-world.ts packages/client/src/features/delve/chains/ChainEditor.tsx packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/features/delve/ItemDetailSheet.tsx packages/client/src/features/delve/BagPanel.tsx packages/client/src/features/delve/LootTray.tsx packages/client/src/features/delve/ForgePanel.tsx packages/client/src/features/delve/arena/PickupFeed.tsx packages/client/src/features/delve/BindPrompt.tsx packages/client/src/features/delve/ManaPanel.tsx packages/client/src/stores/delveStore.test.ts packages/client/src/stores/sandboxStore.test.ts packages/client/src/pages/__tests__/DelveCamp.test.tsx packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/features/delve/__tests__/ArenaHud.test.tsx packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx packages/client/src/features/delve/__tests__/ManaPanel.test.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts packages/client/src/features/delve/__tests__/arena-input.test.ts packages/client/src/features/delve/__tests__/LootTray.test.tsx
git commit -m "feat(client): the chains live on the weapon: the store, every reader, absent skills, and gear locked mid-dive" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 15: Client: the chain builder's draft (Task 14, part 1: the tests)

### Task 14: The builder edits a draft: its price, Apply and Revert; slots and Add slot; off-pair marks

The Anvil's builder works on a draft of the equipped weapon's chains (the spec's "Changes and their price"). Edits pile up; the price shows (`editPrice`, over the chains changed: "Changes are free until your first dive", else "Changes cost ✦ 5 Mana Dust (you have ✦ 4)"); **Apply** pays it through `setChains` (all or nothing; a refusal's reason shows, and the next change clears it) and **Revert** drops it. Before the first dive, edits still go through the draft and Apply, at a price of 0.
- **The draft lives in the store** (`chainDraft`, never saved), so it outlives the Abilities tab: `editDraft`, `applyDraft`, `revertDraft`, and `draftChanges(registry, profile, draft)`, the draft's chains that still differ from the weapon's. It is keyed on the weapon's uid and the pair. Equipping another weapon, or a transfer, drops it (the store's `commit`); a bind or a realign (another pair) leaves it unused; an edit undone by hand leaves nothing; a dive's start drops it; and a successful Add slot drops that chain's edit.
- **While a draft is pending,** the Anvil's Abilities tab says "1 unapplied change", and the Delve button has "Unapplied changes: apply or revert them first" above it (diving anyway drops them).
- **Slots.** Under the chosen chain's cards: its slots ("Slots 1/5"; unarmed, the base slots) and **+ Add slot · 🔗 1 · ⚙ 20** (`slotPrice`), with the hero's Links and scrap. Add slot is off without the Links or the scrap, and while the chain has a pending change (it adds to the saved chain), with the reason beside it ("Not enough Links", "Not enough scrap", "Apply or revert this chain first").
- **Off-pair.** A move holding an element outside the pair shows "off-pair" on its card (and in its accessible name) and "· off-pair" on its element chip, with a note. The other moves never offer that element; an element chip that would give the move a new off-pair set is off (the engine would refuse it); and the **+** card copies the chosen move in the pair (`fitted`).
- Unarmed, the builder is read-only ("Equip a weapon to build your moves."). The Training Grounds' builder stays instant and free (it passes none of the new props).

**Files:**
- Modify: `packages/client/src/stores/delveStore.ts:23,172,184,215,229,257,371` (`chainDraft`, `draftChanges`, `editDraft`, `applyDraft`, `revertDraft`)
- Modify: `packages/client/src/features/delve/AbilitiesPanel.tsx:1,134`
- Modify: `packages/client/src/pages/DelveCamp.tsx:10,35,59,197,243` (the unapplied changes)
- Modify: `packages/client/src/features/delve/chains/ChainEditor.tsx:46,65,104,170,201,260,286` (`lockedText`, `footer`, the off-pair card mark, `fitted`)
- Modify: `packages/client/src/features/delve/chains/MoveEditor.tsx:166,187,216,252,321` (the off-pair chips and note)
- Modify: `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx:2,22,104,122,139,154,183,217,237,269,282`, `packages/client/src/pages/__tests__/DelveCamp.test.tsx:5,33`

- [ ] **Step 1: Write the failing tests**

Every test that changes the chains now applies the draft (`apply()`) before reading the weapon's; the new tests pin the draft (its price, Apply's refusal, its life in the store, what drops it), the slots and Add slot, the off-pair marks, the unarmed builder, and the Anvil's unapplied-changes lines.

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`:

Replace:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import {
```

with:

```tsx
import { act, render, screen, fireEvent } from '@testing-library/react';
import {
```

Replace:

```tsx
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;

```

with:

```tsx
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
const apply = () => fireEvent.click(screen.getByTestId('chain-apply'));

```

Replace the lines from `it('edits a move: a Wildfire Burst from its form and a Nature infusion, then a swap', () => {` up to (not including) `expect(chains().primary.moves[1]).toEqual({` with:

```tsx
  it('edits a draft: Apply commits it, free before the first dive, and Revert drops it', () => {
    roomy();
    render(<AbilitiesPanel />);
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Lance');
    expect(chains().primary.moves[0].form).toBe('bolt'); // not yet
    expect(screen.getByTestId('chain-price')).toHaveTextContent('free until your first dive');
    fireEvent.click(screen.getByTestId('chain-revert'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Bolt');
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(screen.getByTestId('chain-apply')).toHaveTextContent(/^Apply$/); // free: no price
    apply();
    expect(chains().primary.moves[0].form).toBe('lance');
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    expect(store().profile.manaDust).toBe(0);
  });

  it('keeps the draft when the tab closes, until a dive starts', () => {
    roomy();
    const { unmount } = render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('form-lance'));
    unmount();
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Lance');
    expect(screen.getByTestId('chain-draft')).toBeInTheDocument();
    act(() => store().startDive(1));
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    expect(chains().primary.moves[0].form).toBe('bolt');
  });

  it("shows Apply's refusal and keeps the draft; the next change clears the message", () => {
    roomy();
    render(<AbilitiesPanel />);
    // A storm move the pair (Fire alone) doesn't hold: the engine refuses it.
    const storm: Move = { kind: 'medium', form: 'bolt', elements: ['storm'] };
    act(() => store().editDraft('primary', { moves: [storm], payment: 'mana' }));
    apply();
    expect(screen.getByTestId('chain-message')).toHaveTextContent('Pick from your two elements');
    expect(screen.getByTestId('chain-draft')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kind-heavy'));
    expect(screen.queryByTestId('chain-message')).toBeNull();
  });

  it('Add slot waits while its chain has a change pending; an edit undone by hand leaves none', () => {
    store().setProfile({ ...store().profile, links: 1, scrap: 25 });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(screen.getByTestId('add-slot')).toBeDisabled();
    expect(screen.getByTestId('add-slot-why')).toHaveTextContent(
      'Apply or revert this chain first',
    );
    fireEvent.click(screen.getByTestId('form-bolt')); // back as it was
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    expect(store().chainDraft?.chains.primary).toBeUndefined();
    fireEvent.click(screen.getByTestId('add-slot'));
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 2/5');
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    // A chain's edit made on fewer slots goes when a slot is added to it (the store's rule).
    const primary = chains().primary;
    act(() => {
      store().setProfile({ ...store().profile, links: 2, scrap: 40 });
      store().editDraft('primary', {
        ...primary,
        moves: [{ ...primary.moves[0], form: 'lance' }, primary.moves[1]],
      });
      expect(store().addSlot('primary').ok).toBe(true);
    });
    expect(store().chainDraft?.chains.primary).toBeUndefined();
  });

  it('equipping another weapon, or a realign, drops the draft', () => {
    roomy();
    const p = store().profile;
    const sword = p.equipped.weapon!;
    store().setProfile({ ...p, bag: [{ ...sword, uid: 'spare' }] });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('form-lance'));
    act(() => store().equip('spare'));
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    act(() => store().equip(sword.uid));
    expect(screen.queryByTestId('chain-draft')).toBeNull(); // gone, not waiting on the sword
    // A realign re-maps the moves the draft was made on.
    act(() => {
      store().bindSecondary('storm');
      store().setProfile({ ...store().profile, manaDust: 500, scrap: 500 });
    });
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(screen.getByTestId('chain-draft')).toBeInTheDocument();
    act(() => {
      expect(store().realign({ primary: 'frost' }).ok).toBe(true);
    });
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    expect(chains().primary.moves[0]).toMatchObject({ form: 'bolt', elements: ['frost'] });
  });

  it('after the first dive the draft shows its price in Mana Dust, and Apply pays it', () => {
    roomy();
    const p = store().profile;
    store().setProfile({ ...p, stats: { ...p.stats, dives: 1 }, manaDust: 4 });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('form-lance')); // a changed form: editDust
    expect(screen.getByTestId('chain-price')).toHaveTextContent('✦ 5 Mana Dust (you have ✦ 4)');
    expect(screen.getByTestId('chain-apply')).toBeDisabled();
    act(() => store().setProfile({ ...store().profile, manaDust: 20 }));
    fireEvent.click(screen.getByTestId('kind-heavy'));
    // Still one move changed: its kind and form together cost editDust once.
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · ✦ 5');
    apply();
    expect(chains().primary.moves[0]).toEqual({ kind: 'heavy', form: 'lance', elements: ['fire'] });
    expect(store().profile.manaDust).toBe(15);
  });

  it('edits a move: a Wildfire Burst from its form and a Nature infusion, then a swap', () => {
    roomy();
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'nature' } });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('move-1'));
    fireEvent.click(screen.getByTestId('form-burst'));
    fireEvent.click(screen.getByTestId('infusion-nature'));
    apply();
```

Replace:

```tsx
    expect(chains().primary.moves[1].elements).toEqual(['nature', 'fire']);
    fireEvent.click(screen.getByTestId('infusion-none'));
    expect(chains().primary.moves[1].elements).toEqual(['nature']);
```

with:

```tsx
    apply();
    expect(chains().primary.moves[1].elements).toEqual(['nature', 'fire']);
    fireEvent.click(screen.getByTestId('infusion-none'));
    apply();
    expect(chains().primary.moves[1].elements).toEqual(['nature']);
```

Replace:

```tsx
    }
    expect(chains().primary.payment).toBe('charge');
```

with:

```tsx
    }
    apply();
    expect(chains().primary.payment).toBe('charge');
```

Replace the lines from `// On a maul (tempo 1.3), the charge and every beat take longer.` up to (not including) `expect(readout()).toHaveTextContent(/cooldown, then a 0\.52s beat/);` with:

```tsx
    store().revertDraft(); // the draft outlives the panel
    // On a maul (tempo 1.3), the charge and every beat take longer.
    const p = store().profile;
    store().setProfile({
      ...p,
      equipped: { ...p.equipped, weapon: { ...p.equipped.weapon!, baseId: 'maul' } },
    });
    render(<AbilitiesPanel />);
    expect(readout()).toHaveTextContent(/cooldown, then a 0\.33s beat/);
    fireEvent.click(screen.getByTestId('kind-hold'));
```

Replace:

```tsx
    expect(document.activeElement).toBe(screen.getByTestId('move-2')); // the heavy, still picked
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['light', 'light', 'heavy', 'light']);
```

with:

```tsx
    expect(document.activeElement).toBe(screen.getByTestId('move-2')); // the heavy, still picked
    apply();
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['light', 'light', 'heavy', 'light']);
```

Replace:

```tsx
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['heavy', 'light', 'medium']);
  });
```

with:

```tsx
    apply();
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['heavy', 'light', 'medium']);
  });

  it("shows each chain's slots, and Add slot's price in Links and scrap", () => {
    render(<AbilitiesPanel />);
    expect(screen.queryByTestId('move-add')).toBeNull(); // the Primary's one slot is used
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 1/5');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('+ Add slot · 🔗 1 · ⚙ 20');
    expect(screen.getByTestId('add-slot')).toBeDisabled(); // no Links yet
    expect(screen.getByTestId('add-slot-why')).toHaveTextContent('Not enough Links');
    act(() => store().setProfile({ ...store().profile, links: 1, scrap: 25 }));
    fireEvent.click(screen.getByTestId('add-slot'));
    expect(store().profile).toMatchObject({ links: 0, scrap: 5 });
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 2/5');
    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('2 of 2');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('🔗 2 · ⚙ 40');
    // The sword's basic chain starts at its string's 3 slots: its 4th costs 3 Links.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 3/5');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('🔗 3 · ⚙ 60');
  });

  it('marks a move outside the pair off-pair, and never offers its element to another', () => {
    const storm: Move = { kind: 'medium', form: 'bolt', elements: ['storm'] };
    const fire: Move = { kind: 'medium', form: 'bolt', elements: ['fire'] };
    roomy(5, { primary: { moves: [storm, fire], payment: 'mana' } });
    render(<AbilitiesPanel />);
    expect(screen.getAllByTestId('card-off-pair')).toHaveLength(1);
    expect(screen.getByTestId('move-0')).toHaveAccessibleName('medium Storm Bolt, off-pair');
    expect(screen.getByTestId('element-storm')).toHaveTextContent('Storm · off-pair');
    expect(screen.getByTestId('element-storm')).toHaveAttribute('aria-pressed', 'true');
    // It keeps Storm, alone or infused, but takes no new off-pair set (Apply would refuse it).
    expect(screen.getByTestId('element-storm')).toBeEnabled();
    expect(screen.getByTestId('infusion-fire')).toBeDisabled();
    expect(screen.getByTestId('element-fire')).toBeEnabled();
    expect(screen.getByTestId('off-pair-note')).toHaveTextContent('Storm off-pair: no attunement');
    fireEvent.click(screen.getByTestId('move-1'));
    expect(screen.queryByTestId('element-storm')).toBeNull();
    expect(screen.queryByTestId('infusion-storm')).toBeNull();
    // A copy of the off-pair move takes the pair's element instead.
    fireEvent.click(screen.getByTestId('move-0'));
    fireEvent.click(screen.getByTestId('move-add'));
    apply();
    expect(chains().primary.moves[2].elements).toEqual(['fire']);
  });
```

Replace:

```tsx
    fireEvent.click(screen.getByTestId('element-storm'));
    expect(chains().defensive.moves[0].form).toBe('armor');
```

with:

```tsx
    fireEvent.click(screen.getByTestId('element-storm'));
    apply();
    expect(chains().defensive.moves[0].form).toBe('armor');
```

Replace:

```tsx
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(chains().primary.moves[0].form).toBe('bolt');
```

with:

```tsx
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(screen.queryByTestId('chain-draft')).toBeNull();
```

Replace:

```tsx
      expect(screen.getByTestId(id), id).toBeDisabled();
  });
```

with:

```tsx
      expect(screen.getByTestId(id), id).toBeDisabled();
  });

  it('unarmed, it shows the default chains read-only', () => {
    store().unequip('weapon');
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('abilities-locked')).toHaveTextContent(
      'Equip a weapon to build your moves.',
    );
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Bolt');
    expect(screen.getByTestId('form-lance')).toBeDisabled();
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 1/5');
    expect(screen.queryByTestId('add-slot')).toBeNull();
  });
```

In `packages/client/src/pages/__tests__/DelveCamp.test.tsx`:

Replace:

```tsx
import { DelveCamp } from '../DelveCamp';
import { useDelveStore } from '@/stores/delveStore';
import { moveFocus } from '@/features/gamepad/use-gamepad-nav';
```

with:

```tsx
import { heroChains } from '@alloy/engine';
import { DelveCamp } from '../DelveCamp';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '@/features/delve/registry';
import { moveFocus } from '@/features/gamepad/use-gamepad-nav';
```

Replace:

```tsx
    expect(mockNavigate).toHaveBeenCalledWith('/delve/training');
  });
```

with:

```tsx
    expect(mockNavigate).toHaveBeenCalledWith('/delve/training');
  });

  it('a pending chain draft shows on the Abilities tab and above the Delve button; diving drops it', () => {
    const s = useDelveStore.getState();
    const primary = heroChains(getDelveRegistry(), s.profile.equipped, s.profile.pair).primary!;
    act(() =>
      s.editDraft('primary', { ...primary, moves: [{ ...primary.moves[0], form: 'lance' }] }),
    );
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('draft-count')).toHaveTextContent('1 unapplied change');
    expect(screen.getByTestId('draft-warning')).toHaveTextContent(
      'Unapplied changes: apply or revert them first',
    );
    fireEvent.click(screen.getByTestId('delve-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/delve/run');
    expect(useDelveStore.getState().chainDraft).toBeNull();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/AbilitiesPanel.test.tsx src/pages/__tests__/DelveCamp.test.tsx)`
Expected: FAIL, 16 failed and 16 passed (32), in both files: `Unable to find an element by: [data-testid="chain-apply"]` (and `chain-draft`, `chain-price`, `chain-slots`, `add-slot`, `card-off-pair`), `store(...).editDraft is not a function` (and `revertDraft`, and the Anvil test's `s.editDraft`), and the draft test's `expected 'lance' to be 'bolt'` (each change still applies at once).

## Chunk 16: Client: the chain builder's draft (Task 14, part 2: the sources)

Task 14 continues (its tests are in Chunk 15).

- [ ] **Step 3: The draft, its price, the slots and the off-pair marks**

In `packages/client/src/stores/delveStore.ts`:

Replace:

```ts
  pairElements,
  type ChainFix,
```

with:

```ts
  pairElements,
  CHAIN_SKILLS,
  heroChains,
  type ChainFix,
```

Replace:

```ts

interface DelveStore {
```

with:

```ts

/** The Anvil builder's unapplied edits (session only): one weapon's, under one pair. */
export interface ChainDraft {
  uid: string;
  pair: ManaPair;
  chains: Partial<Chains>;
}

/**
 * The draft's chains that still differ from the equipped weapon's; none when
 * the draft belongs to another weapon or another pair (equipping another
 * weapon, a bind or a realign drops it).
 */
export function draftChanges(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ChainDraft | null,
): Partial<Chains> {
  const weapon = profile.equipped.weapon;
  const { primary, secondary } = profile.pair;
  if (!draft || !weapon || draft.uid !== weapon.uid) return {};
  if (draft.pair.primary !== primary || draft.pair.secondary !== secondary) return {};
  const saved = heroChains(registry, profile.equipped, profile.pair);
  return Object.fromEntries(
    CHAIN_SKILLS.filter(
      (s) => draft.chains[s] && JSON.stringify(draft.chains[s]) !== JSON.stringify(saved[s]),
    ).map((s) => [s, draft.chains[s]]),
  );
}

interface DelveStore {
```

Replace:

```ts
  bindDeclined: ManaType[];

```

with:

```ts
  bindDeclined: ManaType[];
  /** The chain builder's unapplied edits (never saved; a dive's start drops them). */
  chainDraft: ChainDraft | null;

```

Replace:

```ts
  /** Add a slot to a chain of the equipped weapon, for Links and scrap. */
  addSlot: (skill: ChainSkill) => ProfileActionResult;
```

with:

```ts
  /** Put a chain into the builder's draft (a chain back as it was leaves it). */
  editDraft: <S extends ChainSkill>(skill: S, chain: Chains[S]) => void;
  /** Pay for the draft's changes and set them (`setChains`); a refusal keeps the draft. */
  applyDraft: () => ProfileActionResult;
  revertDraft: () => void;
  /** Add a slot to a chain of the equipped weapon, for Links and scrap (dropping its draft). */
  addSlot: (skill: ChainSkill) => ProfileActionResult;
```

Replace:

```ts
    set({ profile });
  };
```

with:

```ts
    // The chain draft belongs to one weapon: equipping another (or a transfer) drops it.
    const draft = get()?.chainDraft;
    const kept = !draft || profile.equipped.weapon?.uid === draft.uid;
    set(kept ? { profile } : { profile, chainDraft: null });
  };
```

Replace the lines from `bindDeclined: [],` up to (not including) `closeDive: () => {` with:

```ts
    bindDeclined: [],
    chainDraft: null,

    setProfile: (profile) => commit(profile),

    resetProfile: (seed, primary) => {
      commit(createDelveProfile(registry(), seed ?? freshSeed(), primary ? { primary } : {}));
      set({ newUids: {}, diveDrops: [], notices: [], bindDeclined: [], chainDraft: null });
    },

    startDive: (depth) => {
      commit(engineStartDive(registry(), get().profile, depth));
      set({ diveDrops: [], chainDraft: null });
    },

```

Replace:

```ts
    addSlot: (skill) => applyResult(engineAddSlot(registry(), get().profile, skill)),
  };
```

with:

```ts
    editDraft: (skill, chain) => {
      const { profile, chainDraft } = get();
      const weapon = profile.equipped.weapon;
      if (!weapon) return;
      const chains = { ...draftChanges(registry(), profile, chainDraft), [skill]: chain };
      // Only what differs from the weapon is kept: an edit undone by hand leaves nothing.
      const next = { uid: weapon.uid, pair: profile.pair, chains };
      set({ chainDraft: { ...next, chains: draftChanges(registry(), profile, next) } });
    },

    applyDraft: () => {
      const { profile, chainDraft } = get();
      const res = applyResult(
        engineSetChains(registry(), profile, draftChanges(registry(), profile, chainDraft)),
      );
      if (res.ok) set({ chainDraft: null });
      return res;
    },

    revertDraft: () => set({ chainDraft: null }),

    addSlot: (skill) => {
      const res = applyResult(engineAddSlot(registry(), get().profile, skill));
      // The draft's edit of that chain was made on fewer slots: it goes.
      const draft = get().chainDraft;
      if (res.ok && draft?.chains[skill]) {
        const { [skill]: _gone, ...chains } = draft.chains;
        set({ chainDraft: { ...draft, chains } });
      }
      return res;
    },
  };
```

In `packages/client/src/features/delve/chains/ChainEditor.tsx`:

Replace:

```tsx
  /** Why a skill has no chain (the text its locked tab shows). */
  absentText?: (skill: ChainSkill) => string;
  onChange: <S extends ChainSkill>(skill: S, chain: Chains[S]) => void;
```

with:

```tsx
  /** Why it is read-only; the dive's text when absent. */
  lockedText?: string;
  /** Why a skill has no chain (the text its locked tab shows). */
  absentText?: (skill: ChainSkill) => string;
  /** Shown under the chosen skill's cards (the Anvil's Add slot). */
  footer?: (skill: ChainSkill) => ReactNode;
  onChange: <S extends ChainSkill>(skill: S, chain: Chains[S]) => void;
```

Replace the lines from `return next;` up to (not including) `onChange,` with:

```tsx
  return next;
}

/** Whether a move holds an element outside `allowed` (off-pair, in the Delve). */
function offPair(m: Move | Blow, allowed: readonly ManaType[]): boolean {
  return ('element' in m ? [m.element] : m.elements).some((e) => !allowed.includes(e));
}

/** A copy of `m` in `allowed` elements only: its own where allowed, else the first allowed. */
function fitted(m: Move | Blow, allowed: readonly ManaType[]): Move | Blow {
  if ('element' in m)
    return { ...m, element: allowed.includes(m.element) ? m.element : allowed[0] };
  const kept = m.elements.filter((e) => allowed.includes(e));
  return { ...m, elements: kept.length > 0 ? kept : [allowed[0]] };
}

/**
 * The chain builder: each skill (the basic attack, then the Primary, Defensive
 * and Ultimate) is a row of move cards, up to its cap; a skill without a chain
 * shows locked. A card opens its move below: its kind, its form and its
 * elements. ◂ ▸ reorder, × removes (never the last), + adds a copy of the
 * chosen move (in the allowed elements). A move outside them is marked
 * off-pair. The Anvil binds it to a draft of the weapon's moveset; the
 * Training Grounds to their own loadout. See the moves and chains spec.
 */
export function ChainEditor({
  chains,
  caps,
  stats,
  reactionsSeen,
  locked,
  lockedText = 'A dive is under way: your chains can change once you extract or fall.',
  absentText,
  footer,
```

Replace:

```tsx
    : entries.map((b) => blowText(registry, b as Blow));
  const weapon = stats.weapon.baseId ? registry.getGearBase(stats.weapon.baseId).name : 'Fist';
```

with:

```tsx
    : entries.map((b) => blowText(registry, b as Blow));
  const allowed = slot ? elements : blowElements;
  const weapon = stats.weapon.baseId ? registry.getGearBase(stats.weapon.baseId).name : 'Fist';
```

Replace the lines from `A dive is under way: your chains can change once you extract or fall.` up to (not including) `onClick={() => setPicked(i)}` with:

```tsx
          {lockedText}
        </div>
      )}
      {/* Picking a card only changes the view: the cards stay open while the chain is locked. */}
      <div ref={cards} className="flex flex-wrap items-stretch gap-1.5" data-testid="chain-cards">
        {entries.map((e, i) => {
          const els = 'element' in e ? [e.element] : e.elements;
          const off = offPair(e, allowed);
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <button
                type="button"
                data-card={i}
                className="delve-panel flex w-20 flex-col items-center gap-0.5 p-1.5"
                style={{ borderColor: i === index ? '#fcd34d' : undefined }}
                aria-pressed={i === index}
                aria-label={off ? `${names[i]}, off-pair` : names[i]}
```

Replace:

```tsx
                </span>
              </button>
```

with:

```tsx
                </span>
                {off && (
                  <span
                    className="text-[9px] leading-none text-amber-300/80"
                    data-testid="card-off-pair"
                  >
                    off-pair
                  </span>
                )}
              </button>
```

Replace the lines from `commit([...entries, { ...entries[index] }]);` up to (not including) `<fieldset` with:

```tsx
              commit([...entries, fitted(entries[index], allowed)]);
              setPicked(entries.length);
              setFocusOn([card(entries.length)]);
            }}
            data-testid="move-add"
          >
            +
          </button>
        )}
      </div>
      {!absent && footer?.(skill)}

```

Replace:

```tsx
            elements={slot ? elements : blowElements}
            onChange={(next) => commit(entries.map((e, i) => (i === index ? next : e)))}
```

with:

```tsx
            elements={allowed}
            onChange={(next) => commit(entries.map((e, i) => (i === index ? next : e)))}
```

In `packages/client/src/features/delve/chains/MoveEditor.tsx`:

Replace the lines from `/** The elements it can take. */` up to (not including) `export function MoveEditor({` with:

```tsx
  /** The elements it can take; one it holds outside them shows marked off-pair. */
  elements: readonly ManaType[];
  onChange: (next: Move | Blow) => void;
}

/** An element chip's label, marked when the element is off-pair. */
function ElementLabel({ mana, off }: { mana: ManaType; off: boolean }) {
  const st = manaStyle(getDelveRegistry(), mana);
  return (
    <>
      {st.icon} {st.name}
      {off && <span className="text-amber-300/80"> · off-pair</span>}
    </>
  );
}

/**
 * One move of a chain: its kind, its form (none for a blow), its element(s),
 * and its readout. An element it holds outside `elements` (a drop's, kept
 * from off the pair) shows as a marked chip: it still casts and reacts, but
 * draws no attunement, and no other move can take it.
 */
```

Replace:

```tsx
  const trait = (m: ManaType) => data.elementTraits[m];

```

with:

```tsx
  const trait = (m: ManaType) => data.elementTraits[m];
  const own = 'element' in move ? [move.element] : move.elements;
  const off = own.filter((m) => !elements.includes(m));
  const shown = [...elements, ...off];
  // A move may keep its off-pair set, but never take a new one (the engine refuses it).
  const sorted = (els: readonly ManaType[]) => [...els].sort().join();
  const takes = (els: readonly ManaType[]) =>
    els.every((m) => elements.includes(m)) || sorted(els) === sorted(own);

```

Replace the lines from `{elements.map((m) => (` up to (not including) `<Heading>Form</Heading>` with:

```tsx
            {shown.map((m) => (
              <Chip
                key={m}
                pressed={move.element === m}
                onClick={() => onChange({ ...move, element: m })}
                testId={`element-${m}`}
                disabled={!takes([m])}
              >
                <ElementLabel mana={m} off={off.includes(m)} />
              </Chip>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-1.5">
```

Replace the lines from `{elements.map((m) => {` up to (not including) `{manaStyle(registry, m).icon}` with:

```tsx
              {shown.map((m) => {
                const [main, infusion] = move.elements;
                const els = infusion && infusion !== m ? [m, infusion] : [m];
                return (
                  <Chip
                    key={m}
                    pressed={main === m}
                    onClick={() => set({ elements: els })}
                    testId={`element-${m}`}
                    title={trait(m).text}
                    disabled={!takes(els)}
                  >
                    <ElementLabel mana={m} off={off.includes(m)} />
                  </Chip>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-stone-500">Infuse with</span>
              <Chip
                pressed={move.elements.length === 1}
                onClick={() => set({ elements: [move.elements[0]] })}
                testId="infusion-none"
                disabled={!takes([move.elements[0]])}
              >
                None
              </Chip>
              {shown
                .filter((m) => m !== move.elements[0])
                .map((m) => (
                  <Chip
                    key={m}
                    pressed={move.elements[1] === m}
                    onClick={() => set({ elements: [move.elements[0], m] })}
                    testId={`infusion-${m}`}
                    disabled={!takes([move.elements[0], m])}
                  >
```

Replace:

```tsx

      {resolved && <Readout ab={resolved} full={full} stats={stats} pool={pool} />}
```

with:

```tsx

      {off.length > 0 && (
        <div className="text-[11px] text-amber-200/90" data-testid="off-pair-note">
          {off.map((m) => manaStyle(registry, m).name).join(' and ')} off-pair: no attunement. Keep
          it, or pick from your two elements.
        </div>
      )}
      {resolved && <Readout ab={resolved} full={full} stats={stats} pool={pool} />}
```

In `packages/client/src/features/delve/AbilitiesPanel.tsx`:

Replace the lines from `import { useMemo } from 'react';` up to (not including) `import { ManaPanel } from './ManaPanel';` with:

```tsx
import { useMemo, useState } from 'react';
import {
  CHAIN_SKILLS,
  MANA_TYPES,
  baseSlots,
  carriedByText,
  editPrice,
  heroChains,
  isDiveActive,
  manaPool,
  movesetOf,
  pairElements,
  profileStats,
  slotPrice,
  type ChainSkill,
  type HeroStats,
  type ManaType,
} from '@alloy/engine';
import { draftChanges, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { getDelveRegistry } from './registry';
import { formatNumber, manaStyle } from './format';
```

Replace the lines from `* The Anvil's workshop: the equipped weapon's chains from your two elements,` to the end of the file with:

```tsx
 * The Anvil's workshop: the equipped weapon's chains, edited as a draft (kept
 * in the store, so it outlives the tab) whose price shows (free until the
 * first dive) and which Apply pays for, all or nothing, or Revert drops; each
 * chain's slots, with Add slot's price; and your Mana view. Read-only while a
 * dive is under way, and unarmed (the unarmed default shows).
 */
export function AbilitiesPanel() {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const draft = useDelveStore((s) => s.chainDraft);
  const { equipped, pair } = profile;
  const weapon = equipped.weapon;
  const [message, setMessage] = useState<string | null>(null);
  const saved = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  // The skills whose draft differs from the weapon's, and the chains shown.
  const changed = useMemo(() => draftChanges(registry, profile, draft), [registry, profile, draft]);
  const chains = useMemo(() => ({ ...saved, ...changed }), [saved, changed]);
  // Unarmed, the default chains sit at their base slots (the bare hands' string for the basic one).
  const slots = weapon
    ? movesetOf(registry, weapon).slots
    : Object.fromEntries(
        CHAIN_SKILLS.filter((s) => chains[s]).map((s) => [s, baseSlots(registry, null, s)]),
      );
  const stats = useMemo(
    () =>
      profileStats(registry, {
        pair,
        equipped: weapon
          ? {
              ...equipped,
              weapon: { ...weapon, moveset: { ...movesetOf(registry, weapon), chains } },
            }
          : equipped,
      }),
    [registry, equipped, pair, weapon, chains],
  );
  const elements = pairElements(pair);
  const locked = isDiveActive(profile) || !weapon;
  const pending = Object.keys(changed).length > 0;
  const price = pending ? editPrice(registry, profile, changed) : 0;
  const cap = registry.getDelveBalance().chains.cap;

  const onApply = () => {
    const res = useDelveStore.getState().applyDraft();
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
    setMessage(res.ok ? null : (res.reason ?? 'Cannot apply'));
  };
  const onAddSlot = (skill: ChainSkill) => {
    const res = useDelveStore.getState().addSlot(skill);
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
    setMessage(res.ok ? null : (res.reason ?? 'Cannot add a slot'));
  };

  const slotRow = (skill: ChainSkill) => {
    const next = weapon ? slotPrice(registry, weapon, skill) : null;
    // Why Add slot is off (none while a dive locks the whole builder).
    const why = !next
      ? null
      : changed[skill]
        ? 'Apply or revert this chain first'
        : profile.links < next.links
          ? 'Not enough Links'
          : profile.scrap < next.scrap
            ? 'Not enough scrap'
            : null;
    return (
      <div
        className="flex flex-wrap items-center gap-2 text-xs text-stone-400"
        data-testid="slot-row"
      >
        <span data-testid="chain-slots">
          Slots {slots[skill]}/{cap[skill]}
        </span>
        {next && (
          <button
            type="button"
            className="delve-chip"
            disabled={locked || !!why}
            onClick={() => onAddSlot(skill)}
            data-testid="add-slot"
          >
            + Add slot · 🔗 {next.links} · ⚙ {formatNumber(next.scrap)}
          </button>
        )}
        {why && !locked && (
          <span className="text-amber-200/80" data-testid="add-slot-why">
            {why}
          </span>
        )}
        <span>
          🔗 {profile.links} Link{profile.links === 1 ? '' : 's'} · ⚙ {formatNumber(profile.scrap)}{' '}
          scrap
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {pending && (
        <div
          className="delve-panel flex flex-wrap items-center gap-2 p-2"
          data-testid="chain-draft"
        >
          <span className="flex-1 text-xs text-stone-300" data-testid="chain-price">
            {profile.stats.dives === 0
              ? 'Changes are free until your first dive'
              : `Changes cost ✦ ${price} Mana Dust (you have ✦ ${formatNumber(profile.manaDust)})`}
          </span>
          <button
            type="button"
            className="delve-btn px-3 py-1 text-xs"
            onClick={() => {
              useDelveStore.getState().revertDraft();
              setMessage(null);
            }}
            data-testid="chain-revert"
          >
            Revert
          </button>
          <button
            type="button"
            className="delve-btn delve-btn-gold px-3 py-1 text-xs"
            disabled={price > profile.manaDust}
            onClick={onApply}
            data-testid="chain-apply"
          >
            Apply{price > 0 ? ` · ✦ ${price}` : ''}
          </button>
        </div>
      )}
      {message && (
        <div
          className="text-xs font-semibold text-red-300"
          role="status"
          data-testid="chain-message"
        >
          {message}
        </div>
      )}
      <ChainEditor
        chains={chains}
        caps={slots}
        stats={stats}
        reactionsSeen={profile.reactionsSeen}
        locked={locked}
        lockedText={weapon ? undefined : 'Equip a weapon to build your moves.'}
        absentText={(s) => carriedByText(registry, s)}
        footer={slotRow}
        onChange={(skill, chain) => {
          useDelveStore.getState().editDraft(skill, chain);
          setMessage(null);
        }}
        elements={elements.length > 0 ? elements : undefined}
        mana={<ManaPanel stats={stats} />}
      />
    </div>
  );
}
```

In `packages/client/src/pages/DelveCamp.tsx`:

Replace:

```tsx
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
```

with:

```tsx
import { draftChanges, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
```

Replace:

```tsx
  const newCount = useDelveStore((s) => Object.keys(s.newUids).length);
  const [tab, setTab] = useState<Tab>('bag');
```

with:

```tsx
  const newCount = useDelveStore((s) => Object.keys(s.newUids).length);
  const draft = useDelveStore((s) => s.chainDraft);
  const [tab, setTab] = useState<Tab>('bag');
```

Replace:

```tsx
    [equipped, pair, registry],
  );
```

with:

```tsx
    [equipped, pair, registry],
  );
  // The chain builder's unapplied changes (a dive's start drops them).
  const unapplied = useMemo(
    () => Object.keys(draftChanges(registry, profile, draft)).length,
    [registry, profile, draft],
  );
```

Replace:

```tsx
            )}
            <button
```

with:

```tsx
            )}
            {unapplied > 0 && !active && (
              <div className="text-center text-xs text-amber-200" data-testid="draft-warning">
                Unapplied changes: apply or revert them first
              </div>
            )}
            <button
```

Replace:

```tsx
                {label}
              </button>
```

with:

```tsx
                {label}
                {id === 'abilities' && unapplied > 0 && (
                  <span
                    className="block text-[9px] normal-case tracking-normal text-amber-300"
                    data-testid="draft-count"
                  >
                    {unapplied} unapplied change{unapplied === 1 ? '' : 's'}
                  </span>
                )}
              </button>
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/AbilitiesPanel.test.tsx src/pages/__tests__/DelveCamp.test.tsx)`
Expected: PASS, 32 tests in 2 files.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 742 tests pass (90 files).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx prettier --write src/stores/delveStore.ts src/features/delve/AbilitiesPanel.tsx src/pages/DelveCamp.tsx src/features/delve/chains/ChainEditor.tsx src/features/delve/chains/MoveEditor.tsx src/features/delve/__tests__/AbilitiesPanel.test.tsx src/pages/__tests__/DelveCamp.test.tsx)
git add packages/client/src/stores/delveStore.ts packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/pages/DelveCamp.tsx packages/client/src/features/delve/chains/ChainEditor.tsx packages/client/src/features/delve/chains/MoveEditor.tsx packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git commit -m "feat(client): the chain builder edits a draft: its Mana Dust price, Apply and Revert, Add slot, off-pair marks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 17: Client: the weapon's sheet and Links

### Task 15: The weapon's sheet shows its moveset, both valuations and Transfer; Links everywhere

- **The weapon's item sheet** (the spec's "The item sheet" and "Valuing weapons"): its moveset, each chain it carries with its slots and moves ("Primary 1/5 · light Fire Bolt") and the skills it can't ("Defensive: carried by magic weapons and better"). A bag weapon, while armed, is valued twice, each row with its own delta: "As it is" (what Equip does; its ▲ Equip goes by it) and "With your moveset · ⚙ N to move it" (`compareItem`'s default, a home). **Transfer my moveset here · ⚙ N** (with "+1 Link" or "+N Links" when some come back; green with a ▲ when the home value is an upgrade) runs the store's new `transfer` (`transferMoveset`), toasts and closes. Transfer never asks to bind an off-pair weapon (only Equip does). The equipped weapon's sheet links to the chain builder (`onBuild`, from the Anvil). A legendary whose power rides a skill the equipped weapon doesn't carry (Nightstalker the Defensive, Rimeheart the Ultimate) says "Needs a Defensive: your weapon doesn't carry one."
- **Links** (one is "1 Link"): the Anvil's header ("🔗 3 Links", beside the scrap), the dive summary ("🔗 2 Links from salvaged weapons"), the bag's Salvage junk toast ("· +2 Links"), the sheet's salvage ("+2 Links from its extra slots"), a fuse ("+1 Link from the weapons' extra slots") and the sheet's footer. The Anvil's how-to says the weapon carries the chains, Links buy slots, and loot is equipped at the Anvil.

**Files:**
- Modify: `packages/client/src/stores/delveStore.ts:17,255,444` (`transfer`)
- Modify: `packages/client/src/features/delve/ItemDetailSheet.tsx:3,42,74,91,124,158,209,308,410,488,520`
- Modify: `packages/client/src/pages/DelveCamp.tsx:111,146,321`
- Modify: `packages/client/src/features/delve/DiveSummary.tsx:113`
- Modify: `packages/client/src/features/delve/BagPanel.tsx:56` (CRLF, never format)
- Modify: `packages/client/src/features/delve/ForgePanel.tsx:15,102` (CRLF, never format)
- Modify: `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx:8,209,222` (never format)
- Modify: `packages/client/src/features/delve/__tests__/DiveSummary.test.tsx:15,36`
- Modify: `packages/client/src/pages/__tests__/DelveCamp.test.tsx:96`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx`:

Replace the lines from `SeededRNG,` up to (not including) `const registry = getDelveRegistry();` with:

```tsx
  referenceDepth,
  SeededRNG,
  type GearItem,
  type ManaType,
} from '@alloy/engine';
import { ItemDetailSheet } from '../ItemDetailSheet';
import { BagPanel } from '../BagPanel';
import { ForgePanel } from '../ForgePanel';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import { UPGRADE_EPSILON, formatDelta } from '../format';

```

Replace:

```tsx
  it('mid-dive Equip and Unequip give way to "Equip at the Anvil"', () => {
    put(helm('storm'), rareSword('w1'));
```

with:

```tsx
  it('mid-dive Equip, Unequip and Transfer give way to "Equip at the Anvil"', () => {
    put(helm('storm'), rareSword('w1'));
```

Replace:

```tsx
    expect(screen.getByTestId('equip-locked')).toBeInTheDocument();
  });
```

with:

```tsx
    expect(screen.queryByTestId('transfer-button')).toBeNull();
    expect(screen.getByTestId('equip-locked')).toBeInTheDocument();
  });

  it("a weapon's sheet shows its moveset: each chain's slots and moves, and what it can't carry", () => {
    const onBuild = vi.fn();
    render(
      <ItemDetailSheet
        uid={store().profile.equipped.weapon!.uid}
        onClose={() => {}}
        onBuild={onBuild}
      />,
    );
    expect(screen.getByTestId('moveset-basic')).toHaveTextContent(
      'Basic 3/5 · light Fire blow · light Fire blow · heavy Fire blow',
    );
    expect(screen.getByTestId('moveset-primary')).toHaveTextContent(
      'Primary 1/5 · light Fire Bolt',
    );
    expect(screen.getByTestId('moveset-defensive')).toHaveTextContent(
      'Defensive: carried by magic weapons and better',
    );
    expect(screen.getByTestId('moveset-ultimate')).toHaveTextContent(
      'Ultimate: carried by epic weapons and better',
    );
    // The equipped weapon's sheet links to the chain builder.
    fireEvent.click(screen.getByTestId('open-builder'));
    expect(onBuild).toHaveBeenCalled();
  });

  it('a bag weapon is valued as it is and with your moveset; Transfer moves your moveset onto it for scrap', () => {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    const mine = { ...sword, moveset: defaultMoveset(registry, sword, 'fire', { primary: 2 }) };
    store().setProfile({
      ...p,
      equipped: { ...p.equipped, weapon: mine },
      bag: [rareSword('w1', { primary: 2 })],
    });
    render(
      <>
        <ItemDetailSheet uid="w1" onClose={() => {}} />
        <ToastContainer />
      </>,
    );
    expect(screen.getByTestId('compare-as-is')).toHaveTextContent('Power');
    expect(screen.getByTestId('compare-home')).toHaveTextContent('Power');
    expect(screen.getByTestId('item-compare')).toHaveTextContent(
      'With your moveset · ⚙ 30 to move it',
    );
    // Your Primary's extra slot moves (30 scrap); the target's own extra Primary slot comes back.
    expect(screen.getByTestId('transfer-button')).toHaveTextContent(
      /Transfer my moveset here · ⚙ 30 · \+1 Link$/,
    );
    fireEvent.click(screen.getByTestId('transfer-button'));
    expect(screen.getByRole('status')).toHaveTextContent('Not enough scrap');
    act(() => store().setProfile({ ...store().profile, scrap: 30 }));
    fireEvent.click(screen.getByTestId('transfer-button'));
    const now = store().profile;
    expect(now.equipped.weapon!.uid).toBe('w1');
    expect(now.equipped.weapon!.moveset!.chains.primary).toEqual(mine.moveset.chains.primary);
    expect(now.equipped.weapon!.moveset!.slots).toMatchObject({ primary: 2, defensive: 1 });
    expect(now.bag.find((i) => i.uid === sword.uid)!.moveset!.slots.primary).toBe(1);
    expect(now).toMatchObject({ scrap: 0, links: 1 });
    expect(screen.getByText(/Your moveset moved onto .+ · \+1 Link$/)).toBeInTheDocument();
  });

  it('each valuation shows its own delta: Equip is marked as it is, Transfer as a home', () => {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    // A built-up common sword against a plain uncommon one: worse as it is, better as a home.
    const mine = {
      ...sword,
      moveset: defaultMoveset(registry, sword, 'fire', { primary: 5, basic: 5 }),
    };
    const plain = generateItem(
      registry,
      { uid: 'w2', ilvl: 2, rarity: 'uncommon', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(4),
    );
    const equipped = { ...p.equipped, weapon: mine };
    store().setProfile({ ...p, equipped, bag: [plain] });
    const depth = referenceDepth(store().profile);
    const asIs = compareItem(equipped, plain, registry, depth, p.pair, 'asIs').powerPct;
    const home = compareItem(equipped, plain, registry, depth, p.pair).powerPct;
    expect(asIs).toBeLessThan(-UPGRADE_EPSILON);
    expect(home).toBeGreaterThan(UPGRADE_EPSILON);
    render(<ItemDetailSheet uid="w2" onClose={() => {}} />);
    expect(screen.getByTestId('compare-as-is')).toHaveTextContent(`Power▼ ${formatDelta(asIs)}`);
    expect(screen.getByTestId('compare-home')).toHaveTextContent(`Power▲ ${formatDelta(home)}`);
    expect(screen.getByTestId('equip-button')).toHaveTextContent(/^Equip$/);
    // Four Primary and two basic extra slots move: 6 × 30 scrap.
    expect(screen.getByTestId('transfer-button')).toHaveTextContent(
      /^▲ Transfer my moveset here · ⚙ 180$/,
    );
    expect(screen.getByTestId('transfer-button')).toHaveClass('delve-btn-green');
  });

  it('a legendary whose power rides a skill the weapon lacks says it needs it', () => {
    const boots = generateItem(
      registry,
      { uid: 'b1', ilvl: 3, rarity: 'legendary', slot: 'boots', mana: 'fire' },
      new SeededRNG(4),
    );
    put({ ...boots, legendary: { id: 'nightstalker', value: 30, roll: 0.5 } });
    const { unmount } = render(<ItemDetailSheet uid="b1" onClose={() => {}} />);
    expect(screen.getByTestId('legendary-dead')).toHaveTextContent(
      "Needs a Defensive: your weapon doesn't carry one",
    );
    unmount();
    // A rare weapon carries a Defensive.
    const p = store().profile;
    store().setProfile({ ...p, equipped: { ...p.equipped, weapon: rareSword('w1') } });
    render(<ItemDetailSheet uid="b1" onClose={() => {}} />);
    expect(screen.queryByTestId('legendary-dead')).toBeNull();
  });

  it('salvaging a weapon with extra slots says the Links it gave', () => {
    put(rareSword('w1', { primary: 3 }));
    render(
      <>
        <ItemDetailSheet uid="w1" onClose={() => {}} />
        <ToastContainer />
      </>,
    );
    fireEvent.click(screen.getByTestId('salvage-button'));
    fireEvent.click(screen.getByTestId('salvage-button')); // a rare asks twice
    expect(store().profile.links).toBe(2);
    expect(screen.getByText('+2 Links from its extra slots')).toBeInTheDocument();
  });
```

In `packages/client/src/features/delve/__tests__/DiveSummary.test.tsx`:

Replace the lines from `function summary(dustEarned: number) {` up to (not including) `biomeName="Test"` with:

```tsx
function summary(dustEarned: number, linksEarned = 0) {
  const registry = getDelveRegistry();
  const dive = startDive(registry, createDelveProfile(registry, 1, { primary: 'fire' }), 1).dive!;
  const noop = () => {};
  render(
    <DiveSummary
      dive={{ ...dive, phase: 'extracted', dustEarned, linksEarned }}
```

Replace:

```tsx
  it('says nothing about Mana Dust when there was none', () => {
    summary(0);
    expect(screen.queryByTestId('dive-dust')).toBeNull();
  });
```

with:

```tsx
  it('says nothing about Mana Dust or Links when there were none', () => {
    summary(0);
    expect(screen.queryByTestId('dive-dust')).toBeNull();
    expect(screen.queryByTestId('dive-links')).toBeNull();
  });

  it('shows the Links salvaged weapons gave this dive', () => {
    summary(0, 2);
    expect(screen.getByTestId('dive-links')).toHaveTextContent('🔗 2 Links from salvaged weapons');
  });
```

In `packages/client/src/pages/__tests__/DelveCamp.test.tsx`:

Replace:

```tsx

  it('Restart Delve (dev) wipes the save on a second press, back to the mana choice', () => {
```

with:

```tsx

  it('shows the Links beside the scrap', () => {
    act(() =>
      useDelveStore.getState().setProfile({ ...useDelveStore.getState().profile, links: 3 }),
    );
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('links-count')).toHaveTextContent('🔗 3 Links');
    act(() =>
      useDelveStore.getState().setProfile({ ...useDelveStore.getState().profile, links: 1 }),
    );
    expect(screen.getByTestId('links-count')).toHaveTextContent(/^🔗 1 Link$/);
  });

  it('Restart Delve (dev) wipes the save on a second press, back to the mana choice', () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ItemDetailSheet.test.tsx src/features/delve/__tests__/DiveSummary.test.tsx src/pages/__tests__/DelveCamp.test.tsx)`
Expected: FAIL, 7 failed and 24 passed (31): `Unable to find an element by: [data-testid="moveset-basic"]` (and `compare-as-is` twice, `legendary-dead`, `dive-links`, `links-count`), and the salvage's `Unable to find an element with the text: +2 Links from its extra slots`.

- [ ] **Step 3: The sheet, the store's transfer, and Links**

In `packages/client/src/stores/delveStore.ts`:

Replace:

```ts
  addSlot as engineAddSlot,
  bindSecondary as engineBindSecondary,
```

with:

```ts
  addSlot as engineAddSlot,
  transferMoveset,
  bindSecondary as engineBindSecondary,
```

Replace:

```ts
  addSlot: (skill: ChainSkill) => ProfileActionResult;
  setManualAttack: (on: boolean) => void;
```

with:

```ts
  addSlot: (skill: ChainSkill) => ProfileActionResult;
  /** Move the equipped weapon's moveset onto bag weapon `uid` and equip it, for scrap. */
  transfer: (uid: string) => ProfileActionResult;
  setManualAttack: (on: boolean) => void;
```

Replace:

```ts
      return res;
    },
  };
```

with:

```ts
      return res;
    },

    transfer: (uid) => {
      const res = applyResult(transferMoveset(registry(), get().profile, uid));
      if (res.ok) set({ newUids: withoutUids(get().newUids, [uid]) });
      return res;
    },
  };
```

In `packages/client/src/features/delve/ItemDetailSheet.tsx`:

Replace the lines from `attuneElement,` up to (not including) `RARITY_COLOR,` with:

```tsx
  CHAIN_SKILLS,
  attuneElement,
  baseDisplayName,
  carriedByText,
  carriedSkills,
  compareItem,
  findItem,
  inPair,
  isDiveActive,
  itemAffinityAttunement,
  itemStatLines,
  movesetOf,
  movesetTransfer,
  pairElements,
  reattuneCost,
  referenceDepth,
  reforgeCost,
  salvageDust,
  salvageValue,
  upgradeCost,
  type Blow,
  type GearItem,
  type HeroStatKey,
  type ItemComparison,
  type ManaType,
  type Move,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
import { ItemTile } from './ItemTile';
import { BindPrompt } from './BindPrompt';
import { KIND_LABEL, SKILL_NAME, blowText } from './chains/chain-text';
import {
```

Replace:

```tsx
  onClose: () => void;
}
```

with:

```tsx
  onClose: () => void;
  /** Open the chain builder (the Anvil): the equipped weapon's sheet links to it. */
  onBuild?: () => void;
}

/** Legendaries whose power rides one skill: worn without it, that power does nothing. */
const LEGENDARY_NEEDS: Record<string, 'defensive' | 'ultimate'> = {
  nightstalker: 'defensive',
  rimeheart: 'ultimate',
};
const NEEDS_TEXT = { defensive: 'Needs a Defensive', ultimate: 'Needs an Ultimate' };

/** A move as the moveset lists it: "medium Fire Bolt", "heavy Fire+Nature Burst". */
function moveName(registry: ReturnType<typeof getDelveRegistry>, m: Move | Blow): string {
  if ('element' in m) return blowText(registry, m);
  const els = m.elements.map((e) => manaStyle(registry, e).name).join('+');
  return `${KIND_LABEL[m.kind]} ${els} ${registry.getForm(m.form).name}`;
}

/** A weapon's moveset: each chain it carries with its slots ("Primary 2/5") and moves. */
function MovesetView({ item }: { item: GearItem }) {
  const registry = getDelveRegistry();
  const { chains, slots } = movesetOf(registry, item);
  const cap = registry.getDelveBalance().chains.cap;
  const carried = carriedSkills(registry, item.rarity);
  return (
    <div
      className="delve-panel mt-3 flex flex-col gap-1 px-3 py-2 text-xs"
      data-testid="item-moveset"
    >
      <div className="delve-display text-[11px] font-bold uppercase tracking-widest text-amber-300/80">
        Moveset
      </div>
      {CHAIN_SKILLS.map((s) => {
        const chain = chains[s];
        if (!carried.includes(s) || !chain)
          return (
            <div key={s} className="text-stone-500" data-testid={`moveset-${s}`}>
              {SKILL_NAME[s]}: {carriedByText(registry, s).toLowerCase()}
            </div>
          );
        const moves: (Move | Blow)[] = Array.isArray(chain) ? chain : chain.moves;
        return (
          <div key={s} className="text-stone-300" data-testid={`moveset-${s}`}>
            <b className="text-stone-100">
              {SKILL_NAME[s]} {slots[s]}/{cap[s]}
            </b>{' '}
            · {moves.map((m) => moveName(registry, m)).join(' · ')}
          </div>
        );
      })}
    </div>
  );
}

/** Power, Damage and Toughness against what's worn. */
function DeltaRow({ cmp }: { cmp: ItemComparison }) {
  return (
    <div className="flex">
      <DeltaCell label="Power" value={cmp.powerPct} />
      <DeltaCell label="Damage" value={cmp.dpsPct} />
      <DeltaCell label="Toughness" value={cmp.ehpPct} />
    </div>
  );
}
```

Replace:

```tsx
export function ItemDetailSheet({ uid, onClose }: ItemDetailSheetProps) {
  const registry = getDelveRegistry();
```

with:

```tsx
export function ItemDetailSheet({ uid, onClose, onBuild }: ItemDetailSheetProps) {
  const registry = getDelveRegistry();
```

Replace the lines from `const cmp = useMemo(` up to (not including) `const mana = manaStyle(registry, item.mana);` with:

```tsx
  const worn = profile.equipped.weapon;
  // A bag weapon, while armed, is valued twice: as it is, and as a home for your moveset.
  const twoWays = !!item && !isEquipped && item.slot === 'weapon' && !!worn;
  const cmp = useMemo(
    () =>
      item && !isEquipped
        ? compareItem(profile.equipped, item, registry, depth, profile.pair)
        : null,
    [item, isEquipped, profile.equipped, profile.pair, registry, depth],
  );
  const asIs = useMemo(
    () =>
      item && twoWays
        ? compareItem(profile.equipped, item, registry, depth, profile.pair, 'asIs')
        : null,
    [item, twoWays, profile.equipped, profile.pair, registry, depth],
  );
  const transfer = item && twoWays ? movesetTransfer(registry, worn!, item) : null;

  if (!item) return null;
  const color = RARITY_COLOR[item.rarity];
  const lines = itemStatLines(item, registry);
  const implicits = lines.filter((l) => l.source === 'implicit');
  const affixes = lines.filter((l) => l.source === 'affix');
  const upCost = upgradeCost(registry, item);
  const rfCost = reforgeCost(registry, item);
  const raCost = reattuneCost(registry, item);
  const salvage = salvageValue(registry, item);
  // Equip takes a weapon as it is.
  const equipCmp = asIs ?? cmp;
  const isUpgrade = equipCmp !== null && equipCmp.powerPct > UPGRADE_EPSILON;
```

Replace:

```tsx
    !!profile.pair.primary && !profile.pair.secondary && item.mana !== profile.pair.primary;

```

with:

```tsx
    !!profile.pair.primary && !profile.pair.secondary && item.mana !== profile.pair.primary;
  // A legendary power tied to a skill the equipped weapon doesn't carry.
  const needs = item.legendary ? LEGENDARY_NEEDS[item.legendary.id] : undefined;
  const dead = !!needs && !carriedSkills(registry, worn?.rarity ?? null).includes(needs);
  // Your moveset would make the weapon an upgrade (Transfer's mark, as Equip's is as it is).
  const homeUpgrade = !!transfer && cmp !== null && cmp.powerPct > UPGRADE_EPSILON;

```

Replace:

```tsx
      say('Bag is full', false);
    }
```

with:

```tsx
      say('Bag is full', false);
    }
  };

  const onTransfer = () => {
    const res = store().transfer(item.uid);
    if (res.ok) {
      playSound('combineMerge');
      vibrate('success');
      const links = res.links ? ` · +${res.links} Link${res.links > 1 ? 's' : ''}` : '';
      showToast(`Your moveset moved onto ${item.name}${links}`);
      onClose();
    } else {
      playSound('combineFail');
      say(res.reason ?? 'Cannot transfer', false);
    }
```

Replace:

```tsx
    const { scrap } = store().salvage([item.uid]);
    playSound('orbRemove');
    vibrate('light');
    if (scrap > 0) onClose();
```

with:

```tsx
    const { scrap, links } = store().salvage([item.uid]);
    playSound('orbRemove');
    vibrate('light');
    if (links > 0) showToast(`+${links} Link${links > 1 ? 's' : ''} from its extra slots`);
    if (scrap > 0) onClose();
```

Replace:

```tsx
            <div className="flex">
              <DeltaCell label="Power" value={cmp.powerPct} />
              <DeltaCell label="Damage" value={cmp.dpsPct} />
              <DeltaCell label="Toughness" value={cmp.ehpPct} />
            </div>
            {attuneDelta.length > 0 && (
```

with:

```tsx
            {asIs && transfer ? (
              <>
                <div className="text-center text-[10px] uppercase tracking-wider text-stone-500">
                  As it is
                </div>
                <div data-testid="compare-as-is">
                  <DeltaRow cmp={asIs} />
                </div>
                <div className="mt-1 text-center text-[10px] uppercase tracking-wider text-stone-500">
                  With your moveset · ⚙ {formatNumber(transfer.scrap)} to move it
                </div>
                <div data-testid="compare-home">
                  <DeltaRow cmp={cmp} />
                </div>
              </>
            ) : (
              <DeltaRow cmp={cmp} />
            )}
            {attuneDelta.length > 0 && (
```

Replace:

```tsx
            </div>
          )}
        </div>

```

with:

```tsx
              {dead && needs && (
                <div
                  className="mt-1 text-xs font-semibold text-amber-200"
                  data-testid="legendary-dead"
                >
                  {NEEDS_TEXT[needs]}: your weapon doesn't carry one.
                </div>
              )}
            </div>
          )}
        </div>

        {item.slot === 'weapon' && <MovesetView item={item} />}
        {isEquipped && item.slot === 'weapon' && onBuild && (
          <button
            type="button"
            className="delve-chip mt-2"
            onClick={onBuild}
            data-testid="open-builder"
          >
            Build its moves in the chain builder ›
          </button>
        )}

```

Replace:

```tsx
          </button>
        </div>
        {reattuneTo.length > 0 && (
```

with:

```tsx
          </button>
          {transfer && !diving && (
            <button
              className={`delve-btn col-span-2 ${homeUpgrade ? 'delve-btn-green' : ''}`}
              onClick={onTransfer}
              data-testid="transfer-button"
            >
              {homeUpgrade ? '▲ ' : ''}Transfer my moveset here · ⚙ {formatNumber(transfer.scrap)}
              {transfer.links > 0 && ` · +${transfer.links} Link${transfer.links === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
        {reattuneTo.length > 0 && (
```

Replace:

```tsx
          ⚙ {formatNumber(profile.scrap)} scrap · ✦ {formatNumber(profile.manaDust)} Mana Dust
        </div>
```

with:

```tsx
          ⚙ {formatNumber(profile.scrap)} scrap · ✦ {formatNumber(profile.manaDust)} Mana Dust · 🔗{' '}
          {profile.links} Link{profile.links === 1 ? '' : 's'}
        </div>
```

In `packages/client/src/pages/DelveCamp.tsx`:

Replace:

```tsx
              <span data-testid="scrap-count">⚙ {formatNumber(profile.scrap)} scrap</span>
              <span>Deepest · {profile.bestDepth}</span>
```

with:

```tsx
              <span data-testid="scrap-count">⚙ {formatNumber(profile.scrap)} scrap</span>
              <span data-testid="links-count">
                🔗 {formatNumber(profile.links)} Link{profile.links === 1 ? '' : 's'}
              </span>
              <span>Deepest · {profile.bestDepth}</span>
```

Replace the lines from `🔥 Each skill is a chain of moves: build your basic attack, Primary, Defensive and` up to (not including) `<b className="text-green-400">▲</b> means it's an upgrade.` with:

```tsx
                🔥 Each skill is a chain of moves, carried by your weapon: build them in the{' '}
                <b className="text-violet-300">Abilities</b> tab, each move a kind (light, medium,
                heavy, or a hold you charge), a form and one or two elements. Each press casts the
                chain's next move, each harder than the last; a pause starts it over. Better weapons
                carry more skills, and Links from salvaged weapons buy more slots. Gear attunes you
                to its element and powers those moves.
              </p>
              <p>
                💎 Loot bursts from monsters: walk over it, and equip it here between dives. A green{' '}
```

Replace:

```tsx
      {selected && <ItemDetailSheet uid={selected} onClose={() => setSelected(null)} />}
      {controlsOpen && <ControlsPanel onClose={() => setControlsOpen(false)} />}
```

with:

```tsx
      {selected && (
        <ItemDetailSheet
          uid={selected}
          onClose={() => setSelected(null)}
          onBuild={() => {
            setSelected(null);
            setTab('abilities');
          }}
        />
      )}
      {controlsOpen && <ControlsPanel onClose={() => setControlsOpen(false)} />}
```

In `packages/client/src/features/delve/DiveSummary.tsx`:

Replace:

```tsx
          )}
        </div>
```

with:

```tsx
          )}
          {dive.linksEarned > 0 && (
            <span data-testid="dive-links">
              {' '}
              · 🔗 {dive.linksEarned} Link{dive.linksEarned > 1 ? 's' : ''} from salvaged weapons
            </span>
          )}
        </div>
```

`BagPanel.tsx` and `ForgePanel.tsx` are CRLF in the working tree: hand-edit them, never format them.

In `packages/client/src/features/delve/BagPanel.tsx`:

Replace the lines from `const { scrap, dust } = useDelveStore.getState().salvage(junk);` up to (not including) `return (` with:

```tsx
    const { scrap, dust, links } = useDelveStore.getState().salvage(junk);
    if (scrap > 0) {
      playSound('gemScatter');
      vibrate('medium');
      const dustText = dust > 0 ? ` · +${formatNumber(dust)} Mana Dust` : '';
      const linkText = links > 0 ? ` · +${links} Link${links > 1 ? 's' : ''}` : '';
      showToast(
        `Salvaged ${junk.length} items · +${formatNumber(scrap)} scrap${dustText}${linkText}`,
      );
    }
  };

```

In `packages/client/src/features/delve/ForgePanel.tsx`:

Replace:

```tsx
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
```

with:

```tsx
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { getDelveRegistry } from './registry';
```

Replace:

```tsx
    setResult(res.item);
    playSound(res.item.rarity === 'legendary' ? 'lootLegendary' : 'combineMerge');
```

with:

```tsx
    setResult(res.item);
    if (res.links)
      showToast(`+${res.links} Link${res.links > 1 ? 's' : ''} from the weapons' extra slots`);
    playSound(res.item.rarity === 'legendary' ? 'lootLegendary' : 'combineMerge');
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ItemDetailSheet.test.tsx src/features/delve/__tests__/DiveSummary.test.tsx src/pages/__tests__/DelveCamp.test.tsx)`
Expected: PASS, 31 tests in 3 files.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 749 tests pass (90 files).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx prettier --write src/stores/delveStore.ts src/features/delve/ItemDetailSheet.tsx src/pages/DelveCamp.tsx src/features/delve/DiveSummary.tsx src/features/delve/__tests__/DiveSummary.test.tsx src/pages/__tests__/DelveCamp.test.tsx)
git add packages/client/src/stores/delveStore.ts packages/client/src/features/delve/ItemDetailSheet.tsx packages/client/src/pages/DelveCamp.tsx packages/client/src/features/delve/DiveSummary.tsx packages/client/src/features/delve/BagPanel.tsx packages/client/src/features/delve/ForgePanel.tsx packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx packages/client/src/features/delve/__tests__/DiveSummary.test.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git commit -m "feat(client): a weapon's sheet shows its moveset, both valuations and Transfer; Links in the header, the dive summary and the toasts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 18: Client: the stop on the door screen

### Task 16: The door screen holds the stop's cards and pickers

The spec's "Stops between depths", the client: above the doors, "A power-up: take one, or skip it" and the offered kinds as cards (`StopPanel`, in `STOP_KINDS` order). A card opens its picker as a sheet over the whole screen (a portal to `document.body`, so it never scrolls with the door list and sits above the loot tray; `data-pad-scope`, its Back `data-pad-back`, so the pad works it):
- **Equip** lists the bag's items, each marked by its as-is value; with a weapon among them it says "A weapon brings its own moves; yours stay on <your weapon>." (an empty bag: "Your bag is empty.").
- **Add a slot** lists the carried chains with their price ("Primary 1/5 · + a slot · 🔗 1 · ⚙ 20"), off when unaffordable.
- **Adjust a move** is the chain builder with a fixed shape (`ChainEditor`'s `fixedShape`: no reorder, add, remove or payment, and no reactions or attunement; a skill the weapon doesn't carry shows `carriedByText`; a change to a second move drops the first), its button "Change Primary's move 1 · ✦ 5".
- **Upgrade** lists worn and bag items with their price, dimmed when unaffordable (taking one anyway shows the engine's reason).

Taking one runs the store's new `takeStop` (the engine's, with a `StopAction`), toasts "<Kind>: done" and closes; the stop then reads "Power-up taken. On to the next depth." A refusal shows its reason in the picker and leaves the stop open. Skipping is taking a door. While the stop offers an equip, the loot tray's note reads "▲ N to equip at this stop, or at the Anvil".

**Files:**
- Create: `packages/client/src/features/delve/StopPanel.tsx`
- Create: `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`
- Modify: `packages/client/src/features/delve/DoorChoice.tsx:6,41`
- Modify: `packages/client/src/features/delve/chains/ChainEditor.tsx:50,99,232,282,322,346` (`fixedShape`)
- Modify: `packages/client/src/features/delve/LootTray.tsx:64,119` (the stop's note; CRLF, never format)
- Modify: `packages/client/src/stores/delveStore.ts:18,38,258,453` (`takeStop`)
- Modify: `packages/client/src/stores/delveStore.test.ts:181`
- Modify: `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx:514`, `packages/client/src/features/delve/__tests__/LootTray.test.tsx:51`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  generateItem,
  heroChains,
  movesetOf,
  SeededRNG,
  upgradeCost,
  type Chains,
  type StopKind,
} from '@alloy/engine';
import { StopPanel } from '../StopPanel';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
const helm = generateItem(
  registry,
  { uid: 'h1', ilvl: 3, rarity: 'rare', slot: 'helm', mana: 'fire' },
  new SeededRNG(4),
);

/** At the door screen after depth 1, a stop offering `offers`; the panel reads the store's. */
function atStop(offers: StopKind[], over: Partial<ReturnType<typeof store>['profile']> = {}) {
  store().setProfile({ ...store().profile, bag: [helm], ...over });
  store().startDive(1);
  const dive = store().profile.dive!;
  store().setProfile({
    ...store().profile,
    dive: { ...dive, phase: 'choosing', stop: { offers, taken: false } },
  });
  const Panel = () => {
    const stop = useDelveStore((s) => s.profile.dive!.stop!);
    return (
      <>
        <StopPanel stop={stop} />
        <ToastContainer />
      </>
    );
  };
  return render(<Panel />);
}

describe('StopPanel (the door screen)', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('shows the offered kinds as cards, and once one is taken, says so', () => {
    atStop(['equip', 'upgrade']);
    expect(screen.getByTestId('stop')).toHaveTextContent('A power-up: take one, or skip it');
    expect(screen.getByTestId('stop-equip')).toHaveTextContent('Equip');
    expect(screen.getByTestId('stop-upgrade')).toHaveTextContent('Upgrade');
    expect(screen.queryByTestId('stop-slot')).toBeNull();
    fireEvent.click(screen.getByTestId('stop-equip'));
    expect(screen.getByTestId('stop-picker')).toHaveAttribute('data-pad-scope');
    // Over the whole screen (not inside the door list), with the pad's back button.
    expect(screen.getByTestId('stop-picker').parentElement).toBe(document.body);
    expect(screen.getByText('Back')).toHaveAttribute('data-pad-back');
    fireEvent.click(screen.getByText('Back'));
    expect(screen.queryByTestId('stop-picker')).toBeNull();
    fireEvent.click(screen.getByTestId('stop-equip'));
    fireEvent.click(screen.getByTestId('stop-equip-item'));
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
    expect(screen.queryByTestId('stop-picker')).toBeNull();
    expect(screen.getByText('Equip: done')).toBeInTheDocument();
  });

  it('a weapon to equip brings its own moves, which the picker says', () => {
    const sword = store().profile.equipped.weapon!;
    atStop(['equip'], { bag: [helm, { ...sword, uid: 'w2' }] });
    fireEvent.click(screen.getByTestId('stop-equip'));
    expect(screen.getByTestId('stop-equip-weapon-note')).toHaveTextContent(
      `A weapon brings its own moves; yours stay on ${sword.name}.`,
    );
  });

  it("adds a slot to a chain at its price; one it can't pay for is off", () => {
    atStop(['slot'], { links: 1, scrap: 20 });
    fireEvent.click(screen.getByTestId('stop-slot'));
    expect(screen.getByTestId('stop-slot-primary')).toHaveTextContent(
      'Primary 1/5 · + a slot · 🔗 1 · ⚙ 20',
    );
    expect(screen.getByTestId('stop-slot-basic')).toBeDisabled(); // its 4th slot: 3 Links
    expect(screen.queryByTestId('stop-slot-defensive')).toBeNull(); // not carried
    fireEvent.click(screen.getByTestId('stop-slot-primary'));
    expect(chains().primary.moves).toHaveLength(2);
    expect(store().profile).toMatchObject({ links: 0, scrap: 0 });
  });

  it('adjusts one move: a later change replaces an earlier one, at its price', () => {
    const p = store().profile;
    // A two-slot Primary holding one move: a free builder would offer to add one.
    const sword = p.equipped.weapon!;
    const moveset = movesetOf(registry, sword);
    const weapon = { ...sword, moveset: { ...moveset, slots: { ...moveset.slots, primary: 2 } } };
    atStop(['move'], {
      manaDust: 20,
      stats: { ...p.stats, dives: 1 },
      equipped: { ...p.equipped, weapon },
    });
    fireEvent.click(screen.getByTestId('stop-move'));
    expect(screen.getByTestId('stop-move-take')).toBeDisabled();
    expect(screen.queryByTestId('move-add')).toBeNull();
    expect(screen.queryByTestId('attune-fire')).toBeNull(); // no attunement bars either
    // A blow of the basic chain, then the Primary's Bolt: only the Bolt's change is taken.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    fireEvent.click(screen.getByTestId('kind-heavy'));
    fireEvent.click(screen.getByTestId('chain-skill-primary'));
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Lance');
    expect(screen.getByTestId('stop-move-take')).toHaveTextContent("Change Primary's move 1 · ✦ 5");
    fireEvent.click(screen.getByTestId('stop-move-take'));
    expect(chains().primary.moves[0].form).toBe('lance');
    expect(chains().basic[0].kind).toBe('light');
    expect(store().profile.manaDust).toBe(15);
    expect(store().profile.dive!.stop!.taken).toBe(true);
  });

  it('an unaffordable upgrade is dimmed, and taking it says why, keeping the stop open', () => {
    const cost = upgradeCost(registry, helm)!;
    atStop(['upgrade'], { scrap: cost - 1 });
    fireEvent.click(screen.getByTestId('stop-upgrade'));
    const tile = screen.getByRole('button', {
      name: `Upgrade ${helm.name} for ${cost} scrap`,
    });
    expect(tile).toHaveStyle({ opacity: '0.35' });
    fireEvent.click(tile);
    expect(screen.getByTestId('stop-picker')).toHaveTextContent('Not enough scrap');
    expect(store().profile.dive!.stop!.taken).toBe(false);
  });

  it('upgrades an item, worn or in the bag, at its price', () => {
    const cost = upgradeCost(registry, helm)!;
    atStop(['upgrade'], { scrap: cost });
    fireEvent.click(screen.getByTestId('stop-upgrade'));
    const items = screen.getAllByTestId('stop-upgrade-item');
    expect(items.length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('button', { name: `Upgrade ${helm.name} for ${cost} scrap` }));
    expect(store().profile.bag[0].upgrade).toBe(1);
    expect(store().profile.scrap).toBe(0);
  });
});
```


In `packages/client/src/stores/delveStore.test.ts`:

Replace:

```ts
      reason: 'Carried by magic weapons and better',
    });
  });
```

with:

```ts
      reason: 'Carried by magic weapons and better',
    });
  });

  it("takes the door screen's power-up", () => {
    const s = () => useDelveStore.getState();
    const helm = generateItem(
      registry,
      { uid: 'x4', ilvl: 3, rarity: 'rare', slot: 'helm' },
      new SeededRNG(4),
    );
    s().setProfile({ ...s().profile, bag: [helm] });
    s().startDive(1);
    s().markNew(['x4']);
    // At the door screen after a depth, a stop offering an equip.
    const dive = { ...s().profile.dive!, phase: 'choosing' as const };
    s().setProfile({
      ...s().profile,
      dive: { ...dive, stop: { offers: ['equip'], taken: false } },
    });
    expect(s().takeStop({ kind: 'equip', uid: 'x4' }).ok).toBe(true);
    expect(s().profile.equipped.helm?.uid).toBe('x4');
    expect(s().profile.dive!.stop!.taken).toBe(true);
    expect(s().newUids.x4).toBeUndefined();
    expect(s().takeStop({ kind: 'equip', uid: 'x4' }).ok).toBe(false);
  });
```

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`:

Replace:

```tsx
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

with:

```tsx
    expect(onChange).not.toHaveBeenCalled();
  });

  it('with a fixed shape, moves change but never move, go or come, and the payment stays', () => {
    render(
      <ChainEditor
        chains={given}
        caps={caps}
        stats={stats}
        reactionsSeen={[]}
        locked={false}
        fixedShape
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('form-lance')).toBeEnabled();
    expect(screen.queryByTestId('move-add')).toBeNull();
    expect(screen.getByTestId('move-left-1')).not.toBeVisible();
    expect(screen.queryByTestId('payment-mana')).toBeNull();
  });
});
```

In `packages/client/src/features/delve/__tests__/LootTray.test.tsx`:

Replace:

```tsx

  it('once the dive has ended, the tray equips again, but never a weapon', () => {
```

with:

```tsx

  it('at a stop that offers to equip, the tray says one can go on there', () => {
    dive();
    const d = store().profile.dive!;
    store().setProfile({
      ...store().profile,
      dive: { ...d, phase: 'choosing', stop: { offers: ['equip'], taken: false } },
    });
    render(<LootTray originRef={{ current: null }} onSelect={() => {}} />);
    expect(screen.getByTestId('upgrades-locked')).toHaveTextContent(
      '▲ 2 to equip at this stop, or at the Anvil',
    );
  });

  it('once the dive has ended, the tray equips again, but never a weapon', () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/StopPanel.test.tsx src/stores/delveStore.test.ts src/features/delve/__tests__/AbilitiesPanel.test.tsx src/features/delve/__tests__/LootTray.test.tsx)`
Expected: FAIL in all four files: `StopPanel.test.tsx` doesn't load (`Failed to resolve import "../StopPanel"`), and 3 tests fail of 51 in the others: `s(...).takeStop is not a function`, the fixed shape's `expected <button type="button" …(4)></button> to be null` (the + card), and the tray's stop note (`expect(element).toHaveTextContent()`).

- [ ] **Step 3: The stop**

In `packages/client/src/stores/delveStore.ts`:

Replace:

```ts
  transferMoveset,
  bindSecondary as engineBindSecondary,
```

with:

```ts
  transferMoveset,
  takeStop as engineTakeStop,
  bindSecondary as engineBindSecondary,
```

Replace:

```ts
  type Rarity,
} from '@alloy/engine';
```

with:

```ts
  type Rarity,
  type StopAction,
} from '@alloy/engine';
```

Replace:

```ts
  transfer: (uid: string) => ProfileActionResult;
  setManualAttack: (on: boolean) => void;
```

with:

```ts
  transfer: (uid: string) => ProfileActionResult;
  /** Take the door screen's power-up. */
  takeStop: (action: StopAction) => ProfileActionResult;
  setManualAttack: (on: boolean) => void;
```

Replace:

```ts
      return res;
    },
  };
```

with:

```ts
      return res;
    },

    takeStop: (action) => {
      const res = applyResult(engineTakeStop(registry(), get().profile, action));
      if (res.ok && action.kind === 'equip')
        set({ newUids: withoutUids(get().newUids, [action.uid]) });
      return res;
    },
  };
```

In `packages/client/src/features/delve/chains/ChainEditor.tsx`:

Replace:

```tsx
  absentText?: (skill: ChainSkill) => string;
  /** Shown under the chosen skill's cards (the Anvil's Add slot). */
```

with:

```tsx
  absentText?: (skill: ChainSkill) => string;
  /** Each chain keeps its moves and payment, only changing them (a stop's one move): no reordering, adding, removing, payment, attunement or reactions. */
  fixedShape?: boolean;
  /** Shown under the chosen skill's cards (the Anvil's Add slot). */
```

Replace:

```tsx
  absentText,
  footer,
```

with:

```tsx
  absentText,
  fixedShape = false,
  footer,
```

Replace:

```tsx
              <span className="flex gap-0.5">
                <button
```

with:

```tsx
              <span className="flex gap-0.5" hidden={fixedShape}>
                <button
```

Replace:

```tsx
        {!absent && entries.length < (caps[skill] ?? 0) && (
          <button
```

with:

```tsx
        {!fixedShape && !absent && entries.length < (caps[skill] ?? 0) && (
          <button
```

Replace:

```tsx
        {chain && (
          <section className="flex flex-col gap-1.5">
```

with:

```tsx
        {chain && !fixedShape && (
          <section className="flex flex-col gap-1.5">
```

Replace the lines from `{mana ?? (` up to (not including) `<div className="flex items-baseline justify-between">` with:

```tsx
      {!fixedShape &&
        (mana ?? (
          <section className="flex flex-col gap-1.5">
            <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
              Attunement
            </div>
            <AttunementBars stats={stats} />
          </section>
        ))}

      <section className="flex flex-col gap-1.5" hidden={fixedShape}>
```

Create `packages/client/src/features/delve/StopPanel.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CHAIN_SKILLS,
  GEAR_SLOTS,
  carriedByText,
  compareItem,
  editPrice,
  heroChains,
  movesetOf,
  pairElements,
  profileStats,
  referenceDepth,
  slotPrice,
  upgradeCost,
  type Blow,
  type Chains,
  type ChainSkill,
  type DiveStop,
  type GearItem,
  type Move,
  type StopAction,
  type StopKind,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
import { ItemTile } from './ItemTile';
import { SKILL_NAME } from './chains/chain-text';
import { ChainEditor } from './chains/ChainEditor';
import { formatNumber } from './format';

/** Each power-up kind as its card says it. */
export const STOP_TEXT: Record<StopKind, { icon: string; name: string; text: string }> = {
  equip: { icon: '🛡️', name: 'Equip', text: 'Put on one item from your bag, as it is. Free.' },
  slot: { icon: '🔗', name: 'Add a slot', text: 'One more slot on a chain, for Links and scrap.' },
  move: { icon: '✎', name: 'Adjust a move', text: 'Change one move of one chain, for Mana Dust.' },
  upgrade: { icon: '⚒️', name: 'Upgrade', text: 'One forge upgrade of an item, for scrap.' },
};

/** A chain's moves or blows. */
function movesOf(chain: Chains[ChainSkill] | undefined): (Move | Blow)[] {
  if (!chain) return [];
  return Array.isArray(chain) ? chain : chain.moves;
}

/** `chain` with move `index` replaced by `move`. */
function withMove(chain: Chains[ChainSkill], index: number, move: Move | Blow) {
  if (Array.isArray(chain)) return chain.map((b, i) => (i === index ? (move as Blow) : b));
  return { ...chain, moves: chain.moves.map((m, i) => (i === index ? (move as Move) : m)) };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The door screen's stop (see the weapon movesets spec): the power-up kinds
 * offered after the depth just cleared, as cards. A card opens its picker;
 * taking one spends the stop (the engine's `takeStop`), and skipping it is
 * choosing a door.
 */
export function StopPanel({ stop }: { stop: DiveStop }) {
  const [open, setOpen] = useState<StopKind | null>(null);
  if (stop.taken)
    return (
      <div className="text-center text-xs text-stone-400" data-testid="stop-taken">
        Power-up taken. On to the next depth.
      </div>
    );
  return (
    <section className="flex w-full max-w-[520px] flex-col gap-1.5" data-testid="stop">
      <div className="delve-display text-center text-[11px] uppercase tracking-[0.3em] text-stone-500">
        A power-up: take one, or skip it
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stop.offers.map((kind) => (
          <button
            key={kind}
            type="button"
            className="delve-panel flex flex-col items-start gap-0.5 p-2 text-left"
            onClick={() => {
              playSound('buttonClick');
              setOpen(kind);
            }}
            data-testid={`stop-${kind}`}
          >
            <span className="delve-display text-sm font-bold text-amber-200">
              {STOP_TEXT[kind].icon} {STOP_TEXT[kind].name}
            </span>
            <span className="text-[11px] leading-snug text-stone-400">{STOP_TEXT[kind].text}</span>
          </button>
        ))}
      </div>
      {/* Over the whole screen, not the door list's scroll: the last pad scope, above the loot tray. */}
      {open &&
        createPortal(<StopPicker kind={open} onClose={() => setOpen(null)} />, document.body)}
    </section>
  );
}

/** One kind's picker, over the doors: what to take, with its price, then back to the doors. */
function StopPicker({ kind, onClose }: { kind: StopKind; onClose: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const take = (action: StopAction) => {
    const res = useDelveStore.getState().takeStop(action);
    if (res.ok) {
      playSound('upgradeTier');
      vibrate('success');
      showToast(`${STOP_TEXT[kind].name}: done`);
      onClose();
    } else {
      playSound('combineFail');
      setMessage(res.reason ?? 'Cannot take it');
    }
  };
  return (
    <div
      className="delve-sheet-backdrop"
      onClick={onClose}
      data-testid="stop-picker"
      data-pad-scope
    >
      <div
        className="delve-sheet flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={STOP_TEXT[kind].name}
      >
        <div className="flex items-center justify-between">
          <span className="delve-display text-lg font-bold text-amber-200">
            {STOP_TEXT[kind].icon} {STOP_TEXT[kind].name}
          </span>
          <button
            type="button"
            className="delve-btn px-3 py-1 text-sm"
            onClick={onClose}
            data-pad-back
          >
            Back
          </button>
        </div>
        {kind === 'equip' && <EquipPick take={take} />}
        {kind === 'slot' && <SlotPick take={take} />}
        {kind === 'move' && <MovePick take={take} />}
        {kind === 'upgrade' && <UpgradePick take={take} />}
        {message && (
          <div className="text-xs font-semibold text-red-300" role="status">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

type Take = (action: StopAction) => void;

/** What the hero has to pay with. */
function Wallet() {
  const profile = useDelveStore((s) => s.profile);
  return (
    <div className="text-[11px] text-stone-500">
      ⚙ {formatNumber(profile.scrap)} scrap · ✦ {formatNumber(profile.manaDust)} Mana Dust · 🔗{' '}
      {profile.links} Link{profile.links === 1 ? '' : 's'}
    </div>
  );
}

/** A bag item to put on as it is (a weapon brings its own moveset). */
function EquipPick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const depth = referenceDepth(profile);
  const worn = profile.equipped.weapon;
  if (profile.bag.length === 0)
    return <div className="text-xs text-stone-400">Your bag is empty.</div>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {profile.bag.map((item) => (
          <ItemTile
            key={item.uid}
            item={item}
            size={56}
            delta={
              compareItem(profile.equipped, item, registry, depth, profile.pair, 'asIs').powerPct
            }
            onClick={() => take({ kind: 'equip', uid: item.uid })}
            testId="stop-equip-item"
          />
        ))}
      </div>
      {worn && profile.bag.some((i) => i.slot === 'weapon') && (
        <div className="text-[11px] text-amber-200/90" data-testid="stop-equip-weapon-note">
          A weapon brings its own moves; yours stay on {worn.name}.
        </div>
      )}
    </div>
  );
}

/** A chain of the equipped weapon to grow by a slot, at its price. */
function SlotPick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const weapon = profile.equipped.weapon;
  if (!weapon) return null;
  const { slots } = movesetOf(registry, weapon);
  const cap = registry.getDelveBalance().chains.cap;
  return (
    <div className="flex flex-col gap-1.5">
      {CHAIN_SKILLS.filter((s) => slots[s] !== undefined).map((s) => {
        const price = slotPrice(registry, weapon, s);
        const ok = !!price && price.links <= profile.links && price.scrap <= profile.scrap;
        return (
          <button
            key={s}
            type="button"
            className="delve-btn text-sm"
            disabled={!ok}
            onClick={() => take({ kind: 'slot', skill: s })}
            data-testid={`stop-slot-${s}`}
          >
            {SKILL_NAME[s]} {slots[s]}/{cap[s]}
            {price ? ` · + a slot · 🔗 ${price.links} · ⚙ ${price.scrap}` : ' · every slot'}
          </button>
        );
      })}
      <Wallet />
    </div>
  );
}

/** The chain builder, limited to one move: the latest change replaces any earlier one. */
function MovePick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const { equipped, pair } = profile;
  const weapon = equipped.weapon;
  const [edit, setEdit] = useState<{ skill: ChainSkill; index: number; move: Move | Blow } | null>(
    null,
  );
  const saved = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  const chains = useMemo(
    () =>
      edit
        ? { ...saved, [edit.skill]: withMove(saved[edit.skill]!, edit.index, edit.move) }
        : saved,
    [saved, edit],
  );
  const stats = useMemo(
    () =>
      profileStats(registry, {
        pair,
        equipped: weapon
          ? {
              ...equipped,
              weapon: { ...weapon, moveset: { ...movesetOf(registry, weapon), chains } },
            }
          : equipped,
      }),
    [registry, equipped, pair, weapon, chains],
  );
  if (!weapon) return null;
  const changed = !!edit && !same(edit.move, movesOf(saved[edit.skill])[edit.index]);
  const price =
    edit && changed ? editPrice(registry, profile, { [edit.skill]: chains[edit.skill] }) : 0;
  const elements = pairElements(pair);
  return (
    <div className="flex flex-col gap-2">
      <ChainEditor
        chains={chains}
        caps={movesetOf(registry, weapon).slots}
        stats={stats}
        reactionsSeen={profile.reactionsSeen}
        locked={false}
        fixedShape
        absentText={(s) => carriedByText(registry, s)}
        onChange={(skill, chain) => {
          const now = movesOf(chain);
          const shown = movesOf(chains[skill]);
          const index = now.findIndex((m, i) => !same(m, shown[i]));
          if (index >= 0) setEdit({ skill, index, move: now[index] });
        }}
        elements={elements.length > 0 ? elements : undefined}
      />
      <button
        type="button"
        className="delve-btn delve-btn-gold text-sm"
        disabled={!changed || price > profile.manaDust}
        onClick={() => edit && take({ kind: 'move', ...edit })}
        data-testid="stop-move-take"
      >
        {changed
          ? `Change ${SKILL_NAME[edit!.skill]}'s move ${edit!.index + 1}${price > 0 ? ` · ✦ ${price}` : ''}`
          : 'Change one move'}
      </button>
      <Wallet />
    </div>
  );
}

/** An item, worn or in the bag, to upgrade once at its price. */
function UpgradePick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const items = [...GEAR_SLOTS.map((s) => profile.equipped[s]), ...profile.bag].filter(
    (i): i is GearItem => !!i && upgradeCost(registry, i) !== null,
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const cost = upgradeCost(registry, item)!;
          return (
            <div key={item.uid} className="flex flex-col items-center gap-1">
              <ItemTile
                item={item}
                size={48}
                dim={cost > profile.scrap}
                onClick={() => take({ kind: 'upgrade', uid: item.uid })}
                label={`Upgrade ${item.name} for ${cost} scrap`}
                testId="stop-upgrade-item"
              />
              <span className="text-[11px] text-stone-300">⚙ {formatNumber(cost)}</span>
            </div>
          );
        })}
      </div>
      <Wallet />
    </div>
  );
}
```


In `packages/client/src/features/delve/DoorChoice.tsx`:

Replace:

```tsx
import { formatNumber } from './format';

```

with:

```tsx
import { formatNumber } from './format';
import { StopPanel } from './StopPanel';

```

Replace:

```tsx
        </div>

        <div className="delve-display text-[11px] uppercase tracking-[0.3em] text-stone-500">
```

with:

```tsx
        </div>

        {dive.stop && <StopPanel stop={dive.stop} />}

        <div className="delve-display text-[11px] uppercase tracking-[0.3em] text-stone-500">
```

`LootTray.tsx` is CRLF in the working tree: hand-edit it, never format it.

In `packages/client/src/features/delve/LootTray.tsx`:

Replace:

```tsx
  const diving = isDiveActive(profile);
  const upgrades = better.filter((r) => r.item.slot !== 'weapon').length;
```

with:

```tsx
  const diving = isDiveActive(profile);
  // The door screen's stop may offer to equip one now.
  const stop = profile.dive?.stop;
  const atStop = !!stop && !stop.taken && stop.offers.includes('equip');
  const upgrades = better.filter((r) => r.item.slot !== 'weapon').length;
```

Replace:

```tsx
            ▲ {better.length} to equip at the Anvil
          </span>
```

with:

```tsx
            ▲ {better.length} to equip {atStop ? 'at this stop, or ' : ''}at the Anvil
          </span>
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/StopPanel.test.tsx src/stores/delveStore.test.ts src/features/delve/__tests__/AbilitiesPanel.test.tsx src/features/delve/__tests__/LootTray.test.tsx)`
Expected: PASS, 57 tests in 4 files.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 758 tests pass (91 files).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx prettier --write src/features/delve/StopPanel.tsx src/features/delve/__tests__/StopPanel.test.tsx src/features/delve/DoorChoice.tsx src/features/delve/chains/ChainEditor.tsx src/stores/delveStore.ts src/stores/delveStore.test.ts src/features/delve/__tests__/AbilitiesPanel.test.tsx src/features/delve/__tests__/LootTray.test.tsx)
git add packages/client/src/features/delve/StopPanel.tsx packages/client/src/features/delve/__tests__/StopPanel.test.tsx packages/client/src/features/delve/DoorChoice.tsx packages/client/src/features/delve/chains/ChainEditor.tsx packages/client/src/features/delve/LootTray.tsx packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/features/delve/__tests__/LootTray.test.tsx
git commit -m "feat(client): the door screen's stop: the offered power-ups as cards, each with its picker" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 19: E2E, docs, version, verification

### Task 17: The Delve E2E on the new rules

The spec: "the Delve specs pass. Any that equip mid-dive move to the Anvil, and `delve-gamepad.spec.ts` reads the weapon's moveset." Changes:
- **D01:** the starting sword is common, so the arena has no Defensive or Ultimate button.
- **D02:** loot inspected mid-dive shows "Equip at the Anvil" and no Equip; the dive is abandoned (items are kept) and the item equipped at the Anvil (answering an off-pair item's bind prompt with Not now).
- **D03:** the door screen's stop offers a power-up: its first card's picker opens (over the whole screen) and goes back, and a door is taken.
- **D04:** the seeded save has a Link and 20 scrap: the Primary's one move becomes a Wildfire Burst as a draft (free before the first dive), applied; Add slot appends the chain's next default move ("medium Wildfire Burst"); the header shows "🔗 1 Link".
- **D08:** a new Frost save's Defensive tab reads "Carried by magic weapons and better".
- **G04** seeds a two-slot Primary (a light Bolt, then a medium one) to cast through its chain; **G06** reads the basic blow from the weapon's moveset in the save, and applies the draft before it changes.

**Files:**
- Modify: `packages/client/e2e/delve.spec.ts:6,61,88,101,165,206`
- Modify: `packages/client/e2e/delve-gamepad.spec.ts:2,15,144,223,236`

- [ ] **Step 1: The specs**

In `packages/client/e2e/delve.spec.ts`:

Replace the lines from `type ManaType,` up to (not including) `const save = JSON.stringify(profile);` with:

```ts
  type DelveProfile,
  type ManaType,
} from '@alloy/engine';

const SAVE_KEY = 'alloy:delve:v2';
/** Loading the arena (Pixi, sprites) can be slow when many test browsers run at once. */
const ARENA_READY = 30_000;

/**
 * Seed a deterministic Delve save (a fire hero, `secondary` bound if given, `over` on top) and
 * let the engine bot play the arena.
 */
async function seedProfile(
  page: Page,
  seed = 4242,
  autopilot = true,
  secondary?: ManaType,
  over: Partial<DelveProfile> = {},
): Promise<void> {
  const registry = createDefaultRegistry();
  let profile = createDelveProfile(registry, seed, { primary: 'fire' });
  if (secondary) profile = bindSecondary(registry, profile, secondary).profile;
  profile = { ...profile, ...over };
```

Replace the lines from `await expect(page.getByTestId('ability-1')).toHaveAttribute(` up to (not including) `await expect(page.getByTestId('mana-bar')).toBeVisible();` with:

```ts
    // The starting sword is common: it carries no Defensive or Ultimate, so they have no button.
    await expect(page.getByTestId('ability-1')).toHaveCount(0);
    await expect(page.getByTestId('ability-2')).toHaveCount(0);
```

Replace:

```ts
  test('D02: loot drops mid-dive and can be inspected and equipped', async ({ page }) => {
    await seedProfile(page);
```

with:

```ts
  test('D02: loot drops mid-dive and can be inspected, then equipped at the Anvil', async ({
    page,
  }) => {
    await seedProfile(page);
```

Replace the lines from `await page.getByTestId('equip-button').click();` up to (not including) `await door.locator('[data-testid^="door-"]').first().click();` with:

```ts
    // Gear is locked mid-dive.
    await expect(page.getByTestId('equip-button')).toHaveCount(0);
    await expect(sheet.getByTestId('equip-locked')).toHaveText('Equip at the Anvil');
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();

    // Abandon the dive (items are kept), and equip it at the Anvil (answering an off-pair
    // item's bind prompt).
    await page.getByRole('button', { name: 'Dive menu' }).click();
    await page.getByRole('button', { name: 'Abandon dive (lose bounty)' }).click();
    await expect(page.getByTestId('delve-camp')).toBeVisible();
    await page.getByTestId('bag-item').first().click();
    await page.getByTestId('equip-button').click();
    const notNow = page.getByTestId('bind-prompt-not-now');
    if (await notNow.isVisible()) await notNow.click();
    await expect(sheet).toBeHidden();
  });

  test('D03: the door screen offers a power-up, and a door leads to the next depth', async ({
    page,
  }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();

    const door = page.getByTestId('door-choice');
    await expect(door).toBeVisible({ timeout: 60_000 });
    // The stop offers a power-up: the first card's picker opens and goes back, and skipping it is
    // taking a door.
    const stop = page.getByTestId('stop');
    await expect(stop).toBeVisible();
    await stop.locator('[data-testid^="stop-"]').first().click();
    const picker = page.getByTestId('stop-picker');
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: 'Back' }).click();
    await expect(picker).toBeHidden();
```

Replace the lines from `await seedProfile(page, 4242, true, 'nature');` up to (not including) `await expect(page.getByTestId('move-add')).toHaveCount(0);` with:

```ts
    await seedProfile(page, 4242, true, 'nature', { links: 1, scrap: 20 });
    await page.goto('/delve');
    await expect(page.getByTestId('links-count')).toHaveText('🔗 1 Link');
    await expect(page.getByTestId('mana-strip')).toContainText('Abilities');
    await page.getByTestId('mana-strip').click();
    await expect(page.getByTestId('abilities-panel')).toBeVisible();
    // The Primary's one move becomes a Wildfire Burst: a draft, free before the first dive.
    await page.getByTestId('form-burst').click();
    await page.getByTestId('infusion-nature').click();
    await expect(page.getByTestId('ability-readout')).toContainText('light Wildfire Burst');
    await expect(page.getByTestId('chain-price')).toContainText('free until your first dive');
    await page.getByTestId('chain-apply').click();
    await expect(page.getByTestId('chain-draft')).toHaveCount(0);
    const summary = page.getByTestId('abilities-summary');
    await expect(summary).toHaveText('light Wildfire Burst');
    // A Link and 20 scrap buy a second slot, holding the chain's next default move.
    await expect(page.getByTestId('chain-slots')).toHaveText('Slots 1/5');
    await page.getByTestId('add-slot').click();
    await expect(summary).toHaveText('light Wildfire Burst · medium Wildfire Burst');
    await expect(page.getByTestId('chain-slots')).toHaveText('Slots 2/5');
```

Replace:

```ts
    await page.getByTestId('chain-skill-defensive').click();
    await expect(summary).toContainText('Frost Ward');
    await page.getByTestId('chain-skill-ultimate').click();
    await expect(summary).toContainText('Frost Nova');
    await page.getByTestId('slot-weapon').click();
```

with:

```ts
    // The common sword carries Basic and Primary: the others show locked.
    await page.getByTestId('chain-skill-defensive').click();
    await expect(summary).toContainText('Carried by magic weapons and better');
    await page.getByTestId('slot-weapon').click();
```

In `packages/client/e2e/delve-gamepad.spec.ts`:

Replace:

```ts
import { createDefaultRegistry, createDelveProfile } from '@alloy/engine';

```

with:

```ts
import { createDefaultRegistry, createDelveProfile, defaultMoveset } from '@alloy/engine';

```

Replace:

```ts
async function setup(page: Page, autopilot: boolean): Promise<void> {
  const save = JSON.stringify(
    createDelveProfile(createDefaultRegistry(), 4242, { primary: 'fire' }),
  );
  await page.addInitScript(
```

with:

```ts
/** A fire hero's save, its sword's Primary at `primarySlots` slots of default moves. */
async function setup(page: Page, autopilot: boolean, primarySlots = 1): Promise<void> {
  const registry = createDefaultRegistry();
  const profile = createDelveProfile(registry, 4242, { primary: 'fire' });
  const sword = profile.equipped.weapon!;
  const moveset = defaultMoveset(registry, sword, 'fire', { primary: primarySlots });
  const save = JSON.stringify({
    ...profile,
    equipped: { ...profile.equipped, weapon: { ...sword, moveset } },
  });
  await page.addInitScript(
```

Replace:

```ts
    await setup(page, false);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    const bar = page.getByTestId('mana-bar');
```

with:

```ts
    await setup(page, false, 2); // a light Bolt, then a medium one
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    const bar = page.getByTestId('mana-bar');
```

Replace:

```ts
    const blow = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem('alloy:delve:v2')!).chains.basic[1]);
    expect((await blow()).kind).toBe('light');
```

with:

```ts
    // The weapon carries the chains.
    const blow = () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('alloy:delve:v2')!).equipped.weapon.moveset.chains
            .basic[1],
      );
    expect((await blow()).kind).toBe('light');
```

Replace:

```ts
    await tap(page, BUTTON.a);
    await expect.poll(async () => (await blow()).kind).toBe(chip.slice('kind-'.length));
```

with:

```ts
    await tap(page, BUTTON.a);
    // A draft until Apply.
    await expect(page.getByTestId('chain-apply')).toBeVisible();
    expect((await blow()).kind).toBe('light');
    await page.getByTestId('chain-apply').click();
    await expect.poll(async () => (await blow()).kind).toBe(chip.slice('kind-'.length));
```

- [ ] **Step 2: Run the Delve E2E**

The engine's bundle is Task 13's. Create `packages/client/playwright.scratch.config.ts` from the header (never commit it). Run the PowerShell block under "Dev server on 5288"; expect `True`. Then: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`
Expected: 60 passed, 15 on each of the four devices (about 4 minutes: a new hero clears its first depth more slowly, so D01–D03 take about a minute each). A timeout under load that passes on a rerun (`-g <test> --repeat-each 2`) is flakiness; a consistent failure is a regression: debug it, don't lengthen a timeout.

Then delete `packages/client/playwright.scratch.config.ts`, and leave the 5288 dev server running.

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx prettier --write e2e/delve.spec.ts e2e/delve-gamepad.spec.ts)
git add packages/client/e2e/delve.spec.ts packages/client/e2e/delve-gamepad.spec.ts
git commit -m "test(client): the Delve E2E on weapon movesets: absent buttons, equipping at the Anvil, the stop, the draft" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 18: Docs, the version, and the full verification

**Files:**
- Modify: `CLAUDE.md` (the Delve section: its loop, the Spec, Engine, Elemental affinity, Client and Training Grounds bullets, and a new Weapon movesets bullet; CRLF: hand-edit)
- Modify: `docs/superpowers/specs/2026-09-24-delve-loot-mode-design.md` (equipping mid-fight; LF), `docs/superpowers/specs/2026-09-27-delve-elemental-affinity-design.md` (the fixes on bind and equip, `followBasic`; CRLF: hand-edit), `docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md` (`chainCaps` and the chains on the profile; CRLF: hand-edit)
- Modify: `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md` (one leftover, `takeStop`; LF)
- Modify: `packages/client/package.json:3`

- [ ] **Step 1: CLAUDE.md**

Each edit replaces part of a line in the Delve section, but the last, which adds a bullet before the Client bullet.

In `CLAUDE.md` (CRLF: hand-edit):

Replace:
```markdown
walk over it, equip upgrades mid-fight, push deeper or extract, forge, repeat. The hero has four skills, each a **chain** of up to five **moves** that the player builds at the Anvil:
```
with:
```markdown
walk over it, push deeper or extract (one power-up at each stop between depths), equip and forge at the Anvil, repeat. The hero has four skills, each a **chain** of up to five **moves** carried by the weapon (see Weapon movesets) that the player builds at the Anvil:
```

Replace:
```markdown
weapon flow (motion, no rooting): `docs/superpowers/specs/2026-09-29-delve-weapon-flow-design.md`
```
with:
```markdown
weapon flow (motion, no rooting): `docs/superpowers/specs/2026-09-29-delve-weapon-flow-design.md`; weapon movesets (chains on the weapon, Links, the dive lock, stops): `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md`
```

Replace:
```markdown
`src/loot/` (item generation, drops, smithing)
```
with:
```markdown
`src/loot/` (item generation, drops, smithing, `moveset.ts` weapon movesets)
```

Replace:
```markdown
`src/delve/` (hero stats, attunement, Power, dive state machine, profile ops, autopilot;
```
with:
```markdown
`src/delve/` (hero stats, attunement, Power, dive state machine, profile ops, `moveset.ts` moveset edits, slots and transfers, `stops.ts` the stops between depths, autopilot;
```

Replace:
```markdown
`chooseStartingMana`: the equipped gear re-attunes to it and the chains reset)
```
with:
```markdown
`chooseStartingMana`: the equipped gear re-attunes to it and the weapon's moveset resets to its base slots in that mana)
```

Replace:
```markdown
or the bind prompt when equipping off-pair gear, `BindPrompt.tsx`)
```
with:
```markdown
or the bind prompt when equipping off-pair gear at the Anvil, `BindPrompt.tsx`)
```

Replace:
```markdown
and pass its chains to `heroPower` and `compareItem` (a candidate weapon swings the basic chain equipping it would give).
```
with:
```markdown
and value a candidate with `compareItem` (a weapon as a home for your moveset, or `'asIs'`).
```

Replace:
```markdown
Each basic blow strikes with its own element of the pair (the default chain: the primary, its last blow the secondary once bound; `HeroBlow.attunePower` grows with that element's attunement), and a basic chain still on its default follows the weapon and the pair (`followBasic`/`isDefaultBasic` in `arpg/abilities/resolve.ts`, one rule for the Delve and the Training Grounds): equipping or unequipping a weapon, a bind, a realign and an overtake make it the new default, while a chain the player built keeps its blows. In the Delve, every move uses only the pair (`setChain`, `fixChainsToPair`: a realign maps every move's and blow's element by its old role, `roleHeir`),
```
with:
```markdown
Each basic blow strikes with its own element (a weapon's default blows are all in its mana, the starting weapon's in the primary; the Training Grounds' default puts its last blow in the secondary; `HeroBlow.attunePower` grows with that element's attunement, none off-pair), and nothing re-colours a weapon's moves on its own: equipping, a bind, an overtake and a re-attune leave them as they are (only the Training Grounds keep `followBasic`/`isDefaultBasic`, in `arpg/abilities/resolve.ts`, for their default basic chain). In the Delve, a new move uses only the pair (`setChains`; `fixChainsToPair`: a realign maps every move's and blow's element of the equipped weapon by its old role, `roleHeir`),
```

Replace:
```markdown
HUD with drag-to-aim ability buttons that show
```
with:
```markdown
HUD with drag-to-aim ability buttons (none for a skill the weapon doesn't carry) that show
```

Replace:
```markdown
schema version 5, validated with Zod on load; versions 2, 3 and 4 migrate, and the moves a migration changes become toasts, grouped per skill by `fixNotices`)
```
with:
```markdown
schema version 6, validated with Zod on load; versions 2 to 5 migrate, and the moves a migration changes become toasts, grouped per skill by `fixNotices`, as do the chains the move to weapon movesets dropped or reset, `movesetNotices`)
```

Replace:
```markdown
the chains and a secondary for the blows, or **Load my build**.
```
with:
```markdown
the chains and a secondary for the blows, or **Load my build** (the equipped weapon's chains, and the sandbox's own for the skills it doesn't carry).
```

Replace:
```markdown
- **Client**: `pages/DelveCamp.tsx`
```
with:
```markdown
- **Weapon movesets** (spec: `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md`): the chains live on the weapon, `GearItem.moveset` (`{ chains, slots }`). Its rarity decides which skills it carries (`balance.json → delve.movesets.carries`: common and uncommon Basic and Primary, magic and rare add the Defensive, epic and legendary all four; `carriedSkills`, and the locked tab's `carriedByText`); a skill it doesn't carry has no chain, a null entry in `HeroEntity.chains` that every reader passes over (its key, HUD button and pad button do nothing, and the HUD hides the button). Each chain holds 1 to its slots' moves; a chain starts at its base slots (the Primary, Defensive and Ultimate 1, the basic chain its weapon's `defaultChain` length; `baseSlots`) and grows to 5. The pure parts live in `src/loot/moveset.ts`: `heroChains(registry, equipped, pair)` (the equipped weapon's chains, or unarmed a default moveset in the pair's primary, never stored), `movesetOf`, `defaultMoveset`, `extraSlots`, and a drop's `rollMoveset` (extra slots by rarity, `delve.movesets.extraSlots`, spread at random, from `rng.fork('moveset')` after every other roll, so every other stat is as before); the profile ops live in `src/delve/moveset.ts`. **Links** (`profile.links`) come from salvaging a weapon (one per extra slot) and fusing weapons; `addSlot` buys a slot at the chain's end for Links and scrap by its position (`slotPrice`: `slotLinks`, `slotScrap`), its move the next default kind, the last move's form, and its elements while in the pair. Edits cost Mana Dust (`movesetEditPrice`: moves matched by what they are, the longest shared run free, `editDust` a moved or changed move, `elementDust` changed elements; `editPrice` applies the first-dive freebie), through `setChains` (all or nothing, a `ProfileActionResult`; `setChain` is its one-chain case), which refuses mid-dive, unarmed, past the slots, unpaid, and an element set outside the pair held more times than before (a drop's off-pair move is kept, casts and reacts, but draws no attunement). `transferMoveset` moves the equipped weapon's moveset onto a bag weapon (`movesetTransfer`: each chain's extra slots move, `transferScrap` each; overflow, uncarried chains and the target's replaced extras come back as Links; the old weapon goes to the bag at its base). `compareItem` values a weapon as a home for your moveset by default (`WeaponValue`: `'home' | 'asIs'`), so `salvageCandidates` never marks a good base junk; `equipBest` leaves weapons alone. **The dive lock:** while `isDiveActive`, `equipItem`, `unequipSlot` (both throw "Equip at the Anvil, between dives"), `equipBest`, `setChains`, `addSlot`, `transferMoveset`, `reattuneItem` and the forge and salvage (`upgradeGear`, `reforgeGear` and `fuseGear` refuse with "Forge at the Anvil, between dives"; `salvageItems` melts nothing) refuse, while auto-salvage of new loot still runs and `chooseStartingMana` stays allowed; but a **stop**: after each depth the door screen holds one power-up (`DiveState.stop`, rolled by `completeFloor` from the dive seed's fork `stop:<depth>`, `rollStop`: 2 or 3 of the kinds the hero can take and pay for, `stopKinds`: equip a bag item as it is, add a slot, adjust one move, or upgrade an item), taken with `takeStop(registry, profile, action)` with the lock lifted for that one op. The autopilot transfers onto its best bag weapon and spends Links between dives (Primary, Basic, Ultimate, Defensive), takes each stop (`takeBestStop`), and no longer equips mid-floor. The save is version 6: version 5's chains move onto the equipped weapon, which keeps only the chains its rarity carries (`ParsedDelveProfile.dropped`, their extra moves back as Links; an unarmed save's built chains reset, `movesetReset`; both become toasts, `movesetNotices`), and `parseDelveProfile` fits every weapon to the data at load. Numbers: `balance.json → delve.movesets`. The client: the chain builder edits a draft (the store's `chainDraft`, keyed on the weapon and the pair, kept until applied, reverted or a dive starts; the Anvil's tab and Delve button say when changes are unapplied) whose price shows, **Apply** (all or nothing) or **Revert**, with each chain's slots and **Add slot**, locked tabs and off-pair marks (`AbilitiesPanel.tsx`, `ChainEditor`'s `absentText`, `footer`, `fixedShape`); a weapon's item sheet shows its moveset ("Primary 2/5"), both valuations and **Transfer my moveset here**; Links show in the header, the dive summary and the salvage and fuse toasts; mid-dive every gear control gives way to "Equip at the Anvil", and the forge's and salvage's to their own notes; the door screen shows the stop's cards and pickers (`StopPanel.tsx`).
- **Client**: `pages/DelveCamp.tsx`
```

- [ ] **Step 2: The superseded notes**

In `docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md` (CRLF: hand-edit; under the Save v5 heading):

Replace:
```markdown
### Save v5
```
with:
```markdown
### Save v5

> **Superseded** by `2026-09-30-delve-weapon-movesets-design.md` (v0.49.0): the chains and their caps move onto the weapon (`GearItem.moveset`: `chains`, holding only the skills the weapon's rarity carries, and `slots`, from each chain's base slots up to 5, bought with Links); `DelveProfile.chains` and `chainCaps` go, and the save is version 6.
```

In `docs/superpowers/specs/2026-09-27-delve-elemental-affinity-design.md` (CRLF: hand-edit; under Basic attacks, and under the bind prompt):

Replace:
```markdown
> **Superseded** by `2026-09-29-delve-moves-and-chains-design.md` (v0.46.0): each blow of the basic chain strikes with its own element of the pair (the default chain's last blow the secondary once bound) and that element's attunement powers it (`HeroBlow.attunePower`); the finisher's discharge and `HeroWeapon.element`, `infusion`, `blowPower` and `finisherPower` are gone. A basic chain still on its default follows the weapon and the pair (`followBasic`): equipping or unequipping a weapon, a bind, a realign and an overtake make it the new default, while a chain the player built keeps its blows.
```
with:
```markdown
> **Superseded** by `2026-09-29-delve-moves-and-chains-design.md` (v0.46.0): each blow of the basic chain strikes with its own element of the pair (the default chain's last blow the secondary once bound) and that element's attunement powers it (`HeroBlow.attunePower`); the finisher's discharge and `HeroWeapon.element`, `infusion`, `blowPower` and `finisherPower` are gone. A basic chain still on its default follows the weapon and the pair (`followBasic`): equipping or unequipping a weapon, a bind, a realign and an overtake make it the new default, while a chain the player built keeps its blows.

> **Superseded** again by `2026-09-30-delve-weapon-movesets-design.md` (v0.49.0): nothing re-colours a weapon's moves on its own, and `followBasic` retires from the Delve (the Training Grounds keep it); a weapon's default blows are all in its mana.
```

Replace:
```markdown
  - During a dive, such an equip just equips, with a toast: "Bind Storm between dives to draw power from it".
```
with:
```markdown
  - During a dive, such an equip just equips, with a toast: "Bind Storm between dives to draw power from it".

  > **Superseded** by `2026-09-30-delve-weapon-movesets-design.md` (v0.49.0): gear is locked while a dive runs, so the bind prompt shows only at the Anvil. Nothing re-colours a weapon's moves on its own: a bind, an overtake, equipping and re-attuning leave them as they are (a move may keep an element outside the pair: it casts and reacts, but draws no attunement), and `followBasic` retires from the Delve (the Training Grounds keep it). Only a realign maps the equipped weapon's moves by role, and `chooseStartingMana` rebuilds the weapon's moveset at its base slots in the chosen mana.
```

In `docs/superpowers/specs/2026-09-24-delve-loot-mode-design.md` (LF; under the pickup feed):

Replace:
```markdown
  inspect, or "▲ Equip" to put on every upgrade without leaving the fight.
```
with:
```markdown
  inspect, or "▲ Equip" to put on every upgrade without leaving the fight.

  > **Superseded** by `2026-09-30-delve-weapon-movesets-design.md` (v0.49.0): gear is locked while a dive runs. Loot still lands in the bag with its ▲ mark, but equipping waits for the Anvil ("Equip at the Anvil"), except one power-up at each stop between depths, which can equip one bag item.
```

- [ ] **Step 3: The spec's leftover**

One correction: `takeStop`'s arguments (one typed `StopAction`; see "Where the spec left room").

In `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md` (LF):

Replace:
```markdown
`takeStop(registry, profile, kind, args)` checks the kind is offered
```
with:
```markdown
`takeStop(registry, profile, action)` (a `StopAction`: the kind and what it acts on) checks the kind is offered
```

- [ ] **Step 4: Commit the docs**

```bash
cd /c/Projects/Alloy
git add CLAUDE.md docs/superpowers/specs/2026-09-24-delve-loot-mode-design.md docs/superpowers/specs/2026-09-27-delve-elemental-affinity-design.md docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md
git commit -m "docs: weapon movesets in the Delve notes; the loot, affinity and chains specs superseded; the movesets spec's takeStop line" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: The version**

In `packages/client/package.json`:

Replace:
```json
  "version": "0.48.0",
  "private": true,
```
with:
```json
  "version": "0.49.0",
  "private": true,
```

- [ ] **Step 6: The full verification**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run && pnpm build)`
Expected: no type errors; all 1421 tests pass (78 files), the pacing rails included; the build succeeds.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 758 tests pass (91 files).

Run: `(pnpm -F @alloy/client build) && grep -l '0\.49\.0' packages/client/dist/assets/*.js`
Expected: the build succeeds (Vite's warning about chunks over 500 kB is expected), and grep prints one file, `packages/client/dist/assets/index-<hash>.js`: the bundle carries the new version.

Run (the TypeScript files this plan touched since the commit before Task 1's, but those it never formats): `(base=$(git log -1 --format=%h -F --grep='feat(engine): weapons carry movesets: chains by rarity, base slots, a drop')~1; files=$(git diff --name-only $base HEAD -- '*.ts' '*.tsx' | grep -v -E 'profile-schema.ts|delve/dive.ts|delve/autopilot.ts|item-generator.ts|BagPanel.tsx|ForgePanel.tsx|LootTray.tsx$|ItemDetailSheet.test.tsx|delve-pacing.test.ts'); echo "$files" | wc -l; npx prettier --check $files)`
Expected: `64`, then "All matched files use Prettier code style!".

Run the PowerShell block under "Dev server on 5288" (it restarts the server on the new bundle; the version shows in the TabBar); expect `True`. Create `packages/client/playwright.scratch.config.ts` from the header again, then: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`
Expected: 60 passed, 15 on each of the four devices (about 4 minutes). Then delete `packages/client/playwright.scratch.config.ts`, and leave the 5288 dev server running: the user plays on it.

- [ ] **Step 7: Commit the version**

```bash
cd /c/Projects/Alloy
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.49.0" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Don't push: the controller pushes after the final review.
