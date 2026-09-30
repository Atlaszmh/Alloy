# Delve Weapon Movesets Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The chains live on the weapon. Each weapon carries the chains its rarity allows (common and uncommon: Basic and Primary; magic and rare add the Defensive; epic and legendary all four), with a slot count per chain that grows to 5; drops roll extra slots by rarity; salvaging a weapon gives Links, which buy slots; edits cost Mana Dust, priced by one shared function; a transfer moves a moveset onto another weapon for scrap; weapons are valued as they are and as a home for your moveset; all gear is locked mid-dive; the save becomes version 6; and the autopilot plays by the new rules. This plan builds the engine (Tasks 1–9) and the spec's balance gate (Task 10), **where it stops**: a pacing rail breaks, and the spec makes the fix the user's call (see the next section). It is stage 4a of the skill roadmap, and ships as v0.49.0 once the client chunks follow.

**Architecture:** The engine owns it. Data first (`balance.json → delve.movesets`: `carries`, `extraSlots`, `slotLinks`, `slotScrap`, `editDust`, `elementDust`, `transferScrap`), then `GearItem.moveset` (`Moveset`: `chains: Partial<Chains>`, `slots`). `src/loot/moveset.ts` holds the pure parts: which chains a rarity carries, base slots, default moves, a drop's roll (`rollMoveset`, from `rng.fork('moveset')` after every other roll, so nothing else a drop rolls changes), a weapon's extra slots, `heroChains` (the equipped weapon's chains, or the unarmed default) and `movesetTransfer`. `HeroEntity.chains` becomes `(ResolvedChain | null)[]`: an uncarried skill is a null chain that every sim reader passes over. The profile loses `chains` and `chainCaps` and gains `links` (save v6: `parseDelveProfile` migrates version 5 and fits every weapon to the data at load). `src/delve/moveset.ts` holds the profile ops: `movesetEditPrice`, `setChains`/`setChain` (results, not throws), `addSlot`, `transferMoveset`. `compareItem` values a weapon as a home by default (`WeaponValue`); `equipBest` leaves weapons alone; the dive lock refuses every gear op mid-dive. `followBasic` retires from the Delve (the Training Grounds keep it).

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node), Zod 3.

**Spec:** `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md` at `7ad1a1c` (the requirements; read it first).

---

## This plan stops at the balance gate: read before executing

The spec's Balance section: "Every rail in `tests/delve-pacing.test.ts` must hold. If one breaks, stop and report the numbers. The fix is the user's call: slot costs, drop slots, starting slots, dust prices, or a changed rail."

Everything below was built and run on a scratch copy of HEAD `7ad1a1c`, at the spec's values (and the one value it left open, `slotScrap`: see "Where the spec left room"). **One rail breaks: the first dive.** Tasks 1–7 hold every rail. Task 8's dive lock ends the autopilot's habit of equipping upgrades as they drop mid-dive, so a new hero fights its whole first dive with the starting common sword, a Basic chain and a one-move Primary: every seed's first dive now dies at depth 3 (Power at death 761–836, against 3,789–8,748 before), a mean of 3 against the rail's 4. Task 9 (the autopilot's transfers and Links between dives) brings the later dives back near their old depths, but not the first. Every other rail holds.

So this plan is the engine and the gate:
- **Tasks 1–7** keep the whole engine suite green.
- **Tasks 8 and 9** each commit with exactly one failing test, the first-dive rail (`first dive gets past the opening floors but stalls around the first boss`: `expected 3 to be greater than or equal to 4`); their commit bodies say so. Any other failure, or any number that differs from this plan's, means the code differs from the plan's: stop and find out why.
- **Task 10** measures, records the numbers in the spec's status line, and **stops**: bring the numbers to the user. The client (the builder's draft, price and Apply, Add slot, off-pair marks, locked tabs, the weapon sheet's moveset with both valuations and Transfer, Links in the header, the dive summary and toasts, the gear controls hidden mid-dive, the bind texts, the HUD and pad for absent skills, the Training Grounds' Load my build, the store's save v6 and its toasts, the E2E), CLAUDE.md, the superseded notes and the version bump are planned once the user has chosen the fix, in chunks appended to this plan.

| | Before (v0.48.0) | After Task 7 | After Task 9 |
|---|---|---|---|
| Pacing: first dives (each ≥ 3, mean 4–12) | 11, 11, 11, 13 (mean 11.5) | 3, 11, 3, 12 (mean 7.25) | 3, 3, 3, 3 (**mean 3: breaks**) |
| Pacing: dive 6, dive 12 means | 25.5, 35 | 23, 31 | 18.25, 31.5 |
| Pacing: Frost dive 1 → dive 12 | 8.5 → 32.5 | 7.5 → 31.5 | 3 → 25 |
| Pacing: legendaries at dive 12; own pair's reaction | 6; 6 of 6 | 5; 6 of 6 | 5; 6 of 6 |
| Pacing: the 15-pair sweep at dive 6 | median 27, 21–37 (allowed 16.2–43.2) | median 22, 18–29 (allowed 13.2–35.2) | median 23, 20–28 (allowed 13.8–36.8) |
| Pacing: seconds a floor (8–60) | 20.89 | 30.88 | 28.26 |

The DPS Lab grid (depth 10, one dummy and the pack, one seed, 9,144 runs) comes out **identical**, row for row, as the spec's gate asks; and v0.48.0's items, 291 of them over every rarity and a run of encounter drops, hash the same with their movesets left out (`delve-movesets.test.ts` pins it).

---

## Where the spec left room

- **`slotScrap`.** The spec names it ("`slotLinks` … plus `slotScrap` at the same index") but gives no numbers. This plan uses `[20, 40, 60, 80]`: the Links price times 20, beside a transfer's 30 scrap a slot. A tuning knob like the rest; the first dive, the rail that breaks, never meets it.
- **The ◂▸ swap.** The spec's pricing steps make a longest common subsequence free and charge `editDust` for "each remaining new move that equals a remaining old move". A swap of two adjacent moves leaves one of them in the common run, so it moves one move: **5**, not the "10" the spec's example says (a remnant of its earlier, position-based rule). The plan follows the steps; its test pins 5.
- **Where the prices live.** `movesetEditPrice(registry, old, next)` takes chain maps (`Partial<Chains>`) and sums the chains `next` holds, so the builder's preview can pass the draft's changed chains and `setChains` its whole edit. `editPrice(registry, profile, next)` applies the first-dive freebie (0 while `stats.dives === 0`). A move's identity is its kind, form and elements in order (a blow: kind and element); "elements equal some old move's" compares the ordered list with every old move of the chain.
- **Off-pair sets.** "An off-pair element set" is counted as a set (sorted), so re-ordering a fused move's elements keeps its set (and still costs `elementDust`, being a changed element list). Before the choice nothing is off-pair.
- **Refusal texts.** Moves mid-dive: `Chains can only change between dives` (today's text) for `setChains` and `addSlot`; `Transfer your moveset between dives`; unarmed: `Equip a weapon to build your moves` (the spec's); uncarried: `Carried by magic weapons and better` / `…epic…` (`carriedByText`, the locked tab's text too); `A chain holds 1 to N moves`; `Unknown form X` and `Not a primary chain` (a chain of the wrong shape: untyped input, which `setChains` refuses rather than throws on); `Pick from your two elements` (off-pair); `Not enough Mana Dust`, `Not enough Links`, `Not enough scrap`; at the cap: `This chain has every slot`; a transfer target that isn't a bag weapon: `Transfer onto a weapon in your bag`. Gear mid-dive: `equipItem` and `unequipSlot` throw `Equip at the Anvil, between dives` (they throw their other refusals too), and `equipBest` changes nothing.
- **`addSlot`'s new move.** "The default kind at that position: the form's `defaultChain`" reads as the **last move's** form's default chain (its form is the last move's), at the new move's index, medium past its end; a basic chain uses the weapon's string. Its elements: the last move's while all in the pair, else the pair's primary (before the choice, the last move's).
- **Where things live.** `heroChains`, `movesetOf` (a weapon's stored moveset, or its base defaults in its own mana for a weapon without one, such as a test's hand-made item: every saved weapon gets one at load) and `movesetTransfer` are pure, in `src/loot/moveset.ts`, which imports nothing from `src/delve/`, so `hero-stats.ts` can value a home without an import cycle. The profile ops live in `src/delve/moveset.ts`; `setChain` moves there from `profile.ts`.
- **An absent skill in the sim.** `nextMove` and `pressMove` return null for it and `pressStep` 0; `castAbility`, `startHold` and `abilityReady` already refused a missing chain. The Defensive's effect, a wind-up and a hold only exist on a slot with a chain, so their readers take `h.chains[slot]!`. `estimateCombat` keeps its all-four default for callers that pass no chains.
- **The migration's order.** A version 4 or older save converts to version 5's shape, then to version 6 (dropping what the weapon can't carry), and only then is fixed to the pair on the equipped weapon: a move that went with a dropped chain gets no fix notice (`dropped` reports its chain instead). `ParsedDelveProfile` gains `dropped: ChainSkill[]` (for the toast) beside `movesetReset`. An unarmed version 5 save's chains count as built when they differ from the version 5 defaults on its pair (all four default chains in the primary, the basic chain's last blow the bound secondary). Since the check runs before the fix, an unarmed version 3 or 4 save whose builds were default forms in an element other than its migrated primary is flagged as reset too (the spec's order would have fixed them into the defaults first): rare, and the toast is still true.
- **Fitting at load** covers every weapon, equipped and in the bag; `dive.bestFind` (a display copy) is left alone.
- **Valuing.** `compareItem(equipped, item, registry, depth, pair?, value = 'home')` (`WeaponValue = 'home' | 'asIs'`): a home moves the equipped weapon's moveset onto the candidate with `movesetTransfer`; unarmed, or the equipped weapon compared with itself, it values as-is. `salvageCandidates` and the autopilot's fusion spares use the default.
- **The autopilot.** It binds before it salvages (as today), but builds its fused Primary last, after the forge visit (Task 3), since a new weapon brings its own moves; the edit is skipped when unaffordable. Between dives it transfers onto the bag weapon with the best `compareItem` (home) above 0, then equips non-weapon gear, fuses and salvages, then spends Links on slots in the order Primary, basic chain, Ultimate, Defensive, each skill as far as its Links and scrap go (a slot it can't afford passes to the next skill's, so a cheap slot on a later chain can be bought while the Primary's next waits), then upgrades.
- **Task order.** Task 3 retires `followBasic` from the Delve while the chains still sit on the profile (its behaviour changes are all there, and it moves the pacing a little: a bind no longer re-colours the basic chain's last blow). Task 4 moves the chains onto the weapon with the plainest migration (the equipped weapon takes all four chains), and Task 5 adds the spec's migration rules (dropping, Links, fitting at load, the unarmed reset), so each commit is green. Task 4 is one commit whose steps span two chunks (its tests, then its sources).
- **Tests the spec didn't list.** The data (the balance numbers and their schema, which also keeps `carries` growing with rarity, since the locked tab says "…and better"), a drop's moveset always being its default moves, and the fixture helpers `chainsOf`, `withChains` and `asV5` (tests read and give a hero's chains through them).

---

**Conventions:**
- Windows 11. The Bash tool runs POSIX sh; PowerShell is also available (use it for process management).
- Branch `claude/alloy-loot-gear-system-6upsy5` (already checked out). **One commit per task** (Task 10 makes one docs commit). Every commit message ends with a blank line and the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; the commit blocks below pass it as the last `-m`.
- Stage files by path. Never `git add -A` or `git add .` at the repo root: three unrelated untracked plan docs (`docs/superpowers/plans/2026-05-01-*.md`) exist and must stay out.
- **Don't push**: the controller pushes after a final review. Never open a PR.
- **Run every command from the repo root.** The shell's working directory persists between commands, so every command line below runs in a subshell (`(cd packages/engine && npx vitest run …)`), and every commit block starts with `cd /c/Projects/Alloy`.
- **Prettier:** the commit blocks format only files a task creates, or files that pass `npx prettier --check` before the edit (the repo's own Prettier, 3.8.1). Of the files this plan touches, these are not clean at HEAD and are **never formatted**, only hand-edited: `packages/engine/src/data/balance.json` (hand-laid-out JSON), `packages/engine/src/delve/profile-schema.ts`, `packages/engine/src/delve/dive.ts`, `packages/engine/src/delve/autopilot.ts`, `packages/engine/src/loot/item-generator.ts` and the spec; nor is the new `packages/engine/tests/fixtures/delve-v5-saves.json` (one save a line, as generated). Every other file edited here passed `npx prettier --check` at HEAD; never commit a whole-file reformat. The code below is already Prettier-formatted (checked on the scratch copy), so the commit blocks' `--write` changes nothing if you typed it as written.
- **Line endings:** in the working tree, `packages/engine/src/delve/profile-schema.ts`, `dive.ts`, `autopilot.ts` and `packages/engine/src/loot/item-generator.ts` are CRLF (git stores them LF: `core.autocrlf` is on); every other file here is LF. Keep each file's endings (the Edit tool does; don't rewrite a file with a script that normalises them).
- **One stray byte.** Line 160 of `packages/engine/tests/delve-chain-feel.test.ts` holds a raw Latin-1 `×` (`0xD7`). This plan never edits that file; if an editor rewrites it, put the byte back: `node -e "const f='packages/engine/tests/delve-chain-feel.test.ts',fs=require('fs'),b=fs.readFileSync(f),i=b.indexOf(Buffer.from([0xef,0xbf,0xbd]));if(i>=0)fs.writeFileSync(f,Buffer.concat([b.subarray(0,i),Buffer.from([0xd7]),b.subarray(i+3)]))"`.
- **How the edits read.** "Replace: A with: B" is one Edit (old A, new B). "Replace the lines from `A` up to (not including) `B` with: C" is one Edit whose old text runs from the start of the line that reads `A` (ignoring its indentation) to the end of the line before the one that reads `B`, and whose new text is C (a blank line at C's end stays); "…to the end of the file" runs to the file's last line (which keeps its final newline); "Delete the lines from `A` up to (not including) `B`." removes them. Each `A` and `B` is the only line in the file that reads so, at that point. "Append at the end of the file:" adds a blank line and the block after the last line. "Create `f`:" is a Write. Every anchor is unique in its file at that point, in the order given, so apply each file's edits top to bottom (the scratch copy checked, by applying every edit of this plan in order to HEAD, that each task gives exactly the tested files).
- **Import cycles.** `delve/profile.ts`, `pair.ts`, `dive.ts`, `hero-stats.ts` and the new `delve/moveset.ts` import each other: only ever read such an import inside a function (they keep to function declarations). `loot/moveset.ts` imports nothing from `delve/`.
- Engine `tsc` covers `src` only (Vitest doesn't type-check, so a test reading a field that no longer exists passes vacuously: this plan updates every such read).
- **The client isn't touched, and stays green.** It consumes the engine's bundle (`packages/engine/dist`), which no task here rebuilds: Task 10 builds a measuring copy into `packages/engine/node_modules/.movesets-measure` (ignored by git, and where the bundle still finds `zod`) and deletes it. Against the new bundle the client would fail its typecheck (60 errors in 24 files: the store, the Anvil's panels, the arena's readers of `chains`, and their tests), which is the client chunks' work.
- **Every engine task runs the whole suite** (about 20 s; the pacing rails run while the files load). From Task 8 on, exactly one test fails, the first-dive rail; see the section above.
- Engine test geometry: the fixture arena's hero starts at (13, 36) facing up; `dummy(x, y)` is a sturdy foe (1e6 life) that doesn't fight back; the fixture's starting weapon is a common Fire sword; its chains are one medium move each (a Fire Bolt, a Frost Ward, a charged Fire Nova), or exactly `ArenaOpts.chains` when given (Task 2).

**Commands:**

| What | Command (from repo root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| The measuring build (Task 10) | `(cd packages/engine && npx tsup --out-dir node_modules/.movesets-measure)` |

**For the client chunks to come** (not used by Tasks 1–10; kept here so those chunks share them): the dev server on 5288 (PowerShell; stops whatever owns the port, starts a detached Vite, waits for a 200 and prints `True`):

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5288 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\Alloy\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5288 --strictPort --force --host'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5288').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

and the E2E scratch config, `packages/client/playwright.scratch.config.ts` (create it for the E2E, delete it after, never commit it; it reuses the 5288 server instead of Playwright's own on 5199):

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

**The measurement's files** live in the plan author's scratchpad, `C:\Users\hahnz\AppData\Local\Temp\claude\c--Projects-Alloy\239f61fd-0a16-4600-a17d-7efef362f2cc\scratchpad\movesets-before` (called `<before>` below; in the Bash tool, `/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/movesets-before`). They were made from the engine at HEAD (v0.48.0) and must not be regenerated after Task 1 starts: `before-depth10.json` (the DPS Lab grid), `pacing-before.txt` and `first-dives-before.txt`, with the scripts `snapshot.mjs`, `identical.mjs`, `pacing.mjs`, `first-dives.mjs`, `items-hash.mjs` and `v5-saves.mjs` (which made Task 5's fixture). The folder also holds the plan author's own after-files; Task 10 overwrites them with yours. The scripts' texts are in Task 10, in case the folder is gone; Task 1 checks the before files and remakes them from HEAD if they are missing.

## File map

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/data/balance.json` | `delve.movesets` (hand-edit, never format) |
| `src/data/schemas.ts` | `movesets`' schema |
| `src/types/delve.ts` | `DelveBalance.movesets`; `DelveProfile` version 6: `links`, no `chains` or `chainCaps`; `DiveState.linksEarned` |
| `src/types/gear.ts` | `Moveset`, `GearItem.moveset?` |
| `src/types/arpg.ts` | `HeroEntity.chains: (ResolvedChain \| null)[]` |
| `src/loot/moveset.ts` (new) | carried chains, base slots, default moves, `rollMoveset`, `extraSlots`, `movesetOf`, `heroChains`, `carriedByText`, `movesetTransfer` |
| `src/loot/item-generator.ts` | a weapon drop's moveset, rolled last (CRLF, never format) |
| `src/delve/profile-schema.ts` | `MovesetSchema` on `GearItemSchema`, `DiveSchema.linksEarned`, a frozen `DelveProfileV5Schema`, version 6 (CRLF, never format) |
| `src/delve/profile.ts` | version 6: create, `withMoveset`, the migration (`fromV5`, `fitMovesets`), `ParsedDelveProfile.dropped`/`movesetReset`, Links from salvage and fusing, the dive lock on `equipItem`/`unequipSlot`/`equipBest`, `equipBest` without weapons; `setChain` moves out |
| `src/delve/moveset.ts` (new) | `movesetEditPrice`, `editPrice`, `setChains`, `setChain`, `slotPrice`, `addSlot`, `transferMoveset` |
| `src/delve/pair.ts` | `profileStats` from `heroChains`; `fixChainsToPair(registry, …)` on the equipped weapon; `chooseStartingMana` rebuilds the weapon; bind, overtake and realign stop following the basic chain; `followBasicTo` goes |
| `src/delve/hero-stats.ts` | `estimateCombat` with absent skills; `compareItem`/`heroPower` without `chains`, a weapon valued as a home (`WeaponValue`) |
| `src/delve/dive.ts` | `beginFloor` from `heroChains`; `linksEarned`; `BankResult.links` (CRLF, never format) |
| `src/delve/autopilot.ts` | no mid-floor equipping; transfers, Links on slots; the fused Primary built last and paid for (CRLF, never format) |
| `src/arpg/world.ts`, `abilities/cast.ts`, `abilities/defend.ts`, `step.ts`, `sandbox.ts`, `combat.ts`, `action.ts`, `bot.ts`, `dps-sim.ts` | null chains |
| `src/index.ts` | the new exports |
| `tests/delve-movesets.test.ts` (new) | the spec's engine tests |
| `tests/fixtures/arena.ts` | `ArenaOpts.chains`; `asV5`, `chainsOf`, `withChains` |
| `tests/fixtures/delve-v5-saves.json` (new) | five real version 5 saves from the v0.48.0 engine |
| `tests/{delve-pair,delve-chains,delve-dive,delve-profile-abilities,delve-reactions}.test.ts` | updated to the new rules |

`tests/delve-pacing.test.ts` needs no edit (its first-dive rail is the one that breaks). The client, CLAUDE.md, the specs' superseded notes and `packages/client/package.json` are the chunks to come. **Docs:** the spec's status line (Task 10).

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

Task 10 compares against the engine at HEAD, which exists only until this task's edits.

Run: `(ls /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/movesets-before)`
Expected, among others: `before-depth10.json`, `first-dives-before.txt`, `pacing-before.txt`, `first-dives.mjs`, `identical.mjs`, `items-hash.mjs`, `pacing.mjs`, `snapshot.mjs`, `v5-saves.mjs`.

If any of the three before files is missing, make them now from HEAD (first write any missing script from the texts in Task 10): `(cd packages/engine && npx tsup --out-dir node_modules/.movesets-measure)`, then from `<before>`, with `M=C:/Projects/Alloy/packages/engine/node_modules/.movesets-measure/index.js`: `node snapshot.mjs $M before-depth10.json` (prints `runs 9144 …`, about 10 s), `node pacing.mjs $M > pacing-before.txt` (about a minute) and `node first-dives.mjs $M > first-dives-before.txt`; then `(rm -rf packages/engine/node_modules/.movesets-measure)`. `pacing-before.txt` must read as the "Before" column of the header's table (Task 10 prints it).

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
Expected: no type errors; 1374 tests pass in 77 files. The pacing rails hold (a new hero now starts with a common sword's Basic chain and one-move Primary, and no Defensive or Ultimate): Task 10 prints the numbers.

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

The tests read five real version 5 saves, made by the v0.48.0 engine with the scratchpad's `v5-saves.mjs` (its text is in Task 10): a new hero; a bound Fire+Storm hero with a built two-move cast Lance Primary and a rare axe in the bag; an unarmed hero with a built Primary; a magic dagger mid-dive whose Ultimate has two moves; and an epic maul whose basic chain is one blow.

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
Expected: no type errors; 1404 tests pass in 77 files. **This is the last task every pacing rail holds in** (Task 10 lists them as "After Task 7").

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
- **The dive lock:** mid-dive (`isDiveActive`: fighting or choosing), `equipItem` and `unequipSlot` throw `Equip at the Anvil, between dives` and `equipBest` changes nothing; `setChains`, `addSlot`, `transferMoveset` and `reattuneItem` already refuse; `chooseStartingMana` stays allowed. A dive that ended by death or extraction unlocks.

**The first-dive pacing rail breaks here** (see "This plan stops at the balance gate"): with the dive lock, the autopilot can no longer equip upgrades as they drop, and every seed's first dive ends at depth 3. This task commits with that one test failing.

**Files:**
- Modify: `packages/engine/src/delve/hero-stats.ts:20,499` (`WeaponValue`, `compareItem`)
- Modify: `packages/engine/src/delve/profile.ts:28,432,509,528` (the dive lock, `equipBest`)
- Modify: `packages/engine/src/index.ts:129`
- Modify: `packages/engine/tests/delve-dive.test.ts:289` (`equipBest` never a weapon)
- Modify: `packages/engine/tests/delve-pair.test.ts:929` (`compareItem` as it is)
- Modify: `packages/engine/tests/delve-movesets.test.ts` (imports, and two new blocks at the end)

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-movesets.test.ts`:

Replace:

```ts
import { bindSecondary } from '../src/delve/pair.js';
import {
  createDelveProfile,
  fuseGear,
  parseDelveProfile,
  salvageItems,
```

with:

```ts
import { bindSecondary, chooseStartingMana, reattuneItem } from '../src/delve/pair.js';
import {
  createDelveProfile,
  equipBest,
  equipItem,
  fuseGear,
  parseDelveProfile,
  profilePower,
  salvageCandidates,
  salvageItems,
```

Replace:

```ts
import { computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
import { CHAIN_SKILLS, type Blow, type Chain, type Move } from '../src/types/ability.js';
```

with:

```ts
import { compareItem, computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
import { CHAIN_SKILLS, type Blow, type Chain, type Move } from '../src/types/ability.js';
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
  it('refuses every gear and moveset op mid-dive, but the choice of mana; a dive that ended unlocks', () => {
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
    // The choice stays open mid-dive (a migrated save may be diving).
    const unchosen = startDive(registry, createDelveProfile(registry, 3), 1);
    expect(chooseStartingMana(registry, unchosen, 'frost').ok).toBe(true);
    // Death or extraction ends the lock.
    for (const phase of ['dead', 'extracted'] as const) {
      const over = { ...diving, dive: { ...diving.dive!, phase } };
      expect(equipItem(registry, over, 'axe').equipped.weapon!.uid).toBe('axe');
      expect(equipBest(registry, over).equipped.map((i) => i.uid)).toEqual(['h']);
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
/** Mid-dive, all gear is locked (see the weapon movesets spec). */
const AT_THE_ANVIL = 'Equip at the Anvil, between dives';

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

- [ ] **Step 5: The whole engine: the first-dive rail breaks**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1406 tests pass and exactly one fails, in `tests/delve-pacing.test.ts`: `Delve ARPG pacing (autopilot) > first dive gets past the opening floors but stalls around the first boss`, with `expected 3 to be greater than or equal to 4` (1 failed | 76 passed files, 1 failed | 1406 passed tests of 1407). Any other failure, or another number, is a regression: stop.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx prettier --write src/delve/hero-stats.ts src/delve/profile.ts src/index.ts tests/delve-movesets.test.ts tests/delve-dive.test.ts tests/delve-pair.test.ts)
git add packages/engine/src/delve/hero-stats.ts packages/engine/src/delve/profile.ts packages/engine/src/index.ts packages/engine/tests/delve-movesets.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): weapons valued as a home for your moveset; all gear locked mid-dive" -m "The first-dive pacing rail fails from here, as the spec expects pacing to drop: with no mid-dive equipping every first dive ends at depth 3 (mean 3 against the rail's 4). The plan's Task 10 records the numbers and stops for the user's call." -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: The autopilot transfers, fills slots and pays for its edits

Between dives, `visitForge` first moves the moveset onto the bag weapon with the best `compareItem` (a home) above 0, when it can pay (`transferBest`); then equips non-weapon gear, fuses and salvages as before; then spends Links on slots in the order Primary, basic chain, Ultimate, Defensive, each skill as far as its Links and scrap go (`spendLinks`: a slot it can't afford passes to the next skill's), before its forge upgrades. `playFloor` no longer equips mid-floor (it banks loot only). `fusePrimary` already pays for its edit and skips it when it can't (Task 6); a test pins it here.

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

Replace:

```ts
  p = salvageItems(registry, p, salvageCandidates(registry, p, 'epic')).profile;

```

with:

```ts
  p = salvageItems(registry, p, salvageCandidates(registry, p, 'epic')).profile;
  p = spendLinks(registry, p);

```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-movesets.test.ts)`
Expected: PASS, 58 tests.

- [ ] **Step 5: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1409 tests pass and exactly one fails, the same first-dive rail with the same `expected 3 to be greater than or equal to 4` (1 failed | 1409 passed of 1410).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx prettier --write tests/delve-movesets.test.ts)
git add packages/engine/src/delve/autopilot.ts packages/engine/tests/delve-movesets.test.ts
git commit -m "feat(engine): the autopilot transfers its moveset, fills slots with Links, and never equips mid-floor" -m "The first-dive pacing rail still fails (mean 3 against 4); every other rail holds. See the plan's Task 10." -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 10: Balance: the gate

### Task 10: Measure before and after, record it, and stop

No tuning (the spec: measure, and if a rail breaks, stop). This task builds a measuring copy of the engine (the client's bundle stays as it is), measures the DPS Lab grid, the pacing rails, the first dives and v0.48.0's items against the "before" files Task 1 checked, records them in the spec's status line, and **stops**. The numbers are deterministic: each must match the plan's; if one differs, find out why before going on (the sim is deterministic, so a difference means the code differs from the plan's).

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
first dive: 3, 3, 3, 3 (each ≥ 3), mean 3 (4–12)
dive 6 mean 18.25, dive 12 mean 31.5 (> dive 1 + 5, > dive 6)
frost: dive 1 3, dive 12 25 (≥ dive 1 + 5)
legendaries owned at dive 12: 5 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 23, 20–28 (allowed 13.8–36.8): fire+frost 23, earth+frost 28, storm+fire 26, frost+storm 21, fire+shadow 26, fire+nature 23, shadow+nature 21, fire+earth 23, storm+earth 26, earth+shadow 26, earth+nature 22, frost+shadow 20, frost+nature 22, storm+shadow 21, storm+nature 22
seconds per floor: 28.26 (8–60)
```

and `pacing-before.txt` reads:

```text
first dive: 11, 11, 11, 13 (each ≥ 3), mean 11.5 (4–12)
dive 6 mean 25.5, dive 12 mean 35 (> dive 1 + 5, > dive 6)
frost: dive 1 8.5, dive 12 32.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 6 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 27, 21–37 (allowed 16.2–43.2): fire+frost 30, earth+frost 27, storm+fire 37, frost+storm 26, fire+shadow 34, fire+nature 34, shadow+nature 21, fire+earth 30, storm+earth 27, earth+shadow 34, earth+nature 21, frost+shadow 26, frost+nature 22, storm+shadow 32, storm+nature 21
seconds per floor: 20.89 (8–60)
```

Every line is inside its bounds but the first: a mean of 3 against the rail's 4.

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/movesets-before && node first-dives.mjs C:/Projects/Alloy/packages/engine/node_modules/.movesets-measure/index.js | tee first-dives-after.txt)`
Expected, exactly (each seed's first two dives: where they start and end, how, and the Power after):

```text
1 1→3 dead power 761 | 1→5 dead power 1466
2 1→3 dead power 773 | 1→5 dead power 2019
3 1→3 dead power 836 | 1→4 dead power 1980
4 1→3 dead power 761 | 1→4 extracted power 1692
```

and `first-dives-before.txt` reads:

```text
1 1→11 dead power 3789 | 11→13 dead power 11598
2 1→11 dead power 5103 | 11→21 dead power 23500
3 1→11 dead power 4109 | 11→17 dead power 21670
4 1→13 dead power 8748 | 11→19 dead power 16630
```

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
**Status:** approved design, 2026-09-30. It is stage 4a of the skill roadmap, and it ships as v0.49.0. The engine is built at the values below (and `slotScrap` [20, 40, 60, 80], which this spec left open); nothing was tuned. Measured before (v0.48.0) and after (the DPS Lab grid at depth 10, one dummy and the pack, one seed; the pacing rails at `tests/delve-pacing.test.ts`'s seeds):
- **DPS Lab.** Identical: all 9,144 rows, row for row. v0.48.0's items (291, over every rarity and a run of encounter drops) roll the same but for their movesets.
- **Pacing: the first-dive rail breaks.** First dives 11, 11, 11, 13 (mean 11.5) → 3, 3, 3, 3 (mean 3, against the rail's 4): the dive lock ends the autopilot's mid-dive equipping, so a new hero fights its whole first dive with the starting common sword, a basic chain and a one-move Primary, and every seed dies at depth 3 (Power at death 761–836, against 3,789–8,748 before; its second dive reaches 4–5). Before the dive lock (with the chains on the weapon, the priced edits and the engine's slots, Links and transfers, before the autopilot used them) every rail held: first dives 3, 11, 3, 12 (mean 7.25). Every other rail holds after: dive 6 and dive 12 means 25.5, 35 → 18.25, 31.5; Frost dive 1 → dive 12, 8.5 → 32.5 before and 3 → 25 after; legendaries at dive 12, 6 → 5; the own pair's reaction 6 of 6 both; the 15-pair sweep at dive 6, median 27 (21–37) → 23 (20–28); seconds a floor 20.89 → 28.26.
- **Waiting on the user's call**, as the Balance section says: slot costs, drop slots, starting slots, dust prices, or a changed rail. The client, the docs and the version follow it.
```

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
git add docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md
git commit -m "docs: the weapon movesets spec's measured before and after: the DPS grid identical, the first-dive pacing rail breaks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Stop, and bring the numbers to the user**

Don't tune anything, and don't start the client. Report the before and after numbers above (the status line has them), and the spec's options for the fix: slot costs, drop slots, starting slots, dust prices, or a changed rail. Ask the user to confirm two numbers with it: `slotScrap` [20, 40, 60, 80], which the spec left open, and the ◂▸ swap's price, 5 by the spec's pricing steps against the 10 its example says (see "Where the spec left room"); the docs chunk corrects the spec's sentence to whichever holds. The client chunks (the builder's draft, price and Apply, Add slot, the off-pair marks, the locked tabs, the weapon sheet's moveset with both valuations and Transfer, Links in the header, the dive summary and the toasts, the gear controls hidden mid-dive, the bind texts, the HUD and the pad for absent skills, the Training Grounds' Load my build, the store's save v6 and its migration toasts, the E2E), then CLAUDE.md, the superseded notes, `chore(client): bump version to 0.49.0` and the full verification, are planned once the user has chosen.

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
  `first dive: ${fire.map((r) => r.reports[0].endDepth).join(', ')} (each ≥ 3), mean ${at(fire, 1)} (4–12)`,
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
