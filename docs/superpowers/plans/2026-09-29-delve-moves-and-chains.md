# Delve Moves and Chains Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every skill (Basic, Primary, Defensive, Ultimate) becomes a chain of up to five moves. A move is a kind (light, medium, heavy, or a hold that charges while its button is held and fires on release), a form of its skill and one or two elements of the hero's pair; a basic blow is a kind and an element. Each press casts the chain's next move within the combo window, each move landing harder than the last (the step bonus) and cooling on its own; the player builds the chains at the Anvil and in the Training Grounds, and the save moves to version 5.

**Architecture:** The engine owns it. The types (`MoveKind`, `Move`, `Chain`, `Blow`, `Chains`) and `balance.json → delve.chains` come first, then the data: each weapon's feel row per kind with its default chain (derived so the default chain plays today's string blow for blow), and each form's default chain (Volley's dart count by kind). `resolveChain` compiles a chain into `ResolvedAbility` moves at their kinds' weights (a hold's three stages too); the forms read the step bonus where they read `combo[step]`. The hero holds `chains` and per-move `cooldowns`; `pressStep`, `nextMove` and `activeMove` replace every read of `h.abilities[slot]`. A hold is a hero state (`h.hold`) that `ArpgInput.holding` starts and a `cast` releases. Basics become per blow (`HeroWeapon.blows` over the `feel` rows, `stacks.basicByKind`, manual hold blows). Save v5 migrates the v4 builds to chains, `setChain`/`defaultChains`/`fixChainsToPair` replace the build ops, and the bot, the autopilot and the DPS Lab play chains. The client builds chains (`chains/ChainEditor.tsx`, `MoveEditor.tsx`), its stores hold them, the HUD shows each chain's step, next kind and a hold's charge, input sends `holding`, the release `cast` and `cancelHold`, and the arena FX read the active move and each blow's kind and element.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom), Zod 3, React 19, Zustand 5, PixiJS 8, Playwright (the Delve E2E specs and a scratch screenshot pass).

**Spec:** `docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md` at `a9b7f87` (the requirements; read it first, twice: the Chain play, Hold and Basics sections carry ordering rules the code follows exactly).

---

## Gate decision: read before executing

Everything below was built and run on a scratch copy of HEAD `a9b7f87`, the DPS Lab gate included. Tasks 1–7 ship the spec's starting values; the gate (Task 8) then changes three, in the spec's knob order (`stepBonus`, then a form's `defaultChain` kinds):

| Knob | Spec's start | This plan | Why |
|---|---|---|---|
| `delve.chains.stepBonus` | 0.1 | 0.15 | At 0.1, 11 mana default-chain rows lose more than 15% (one seed). `stepBonus` alone doesn't clear the floor inside the pacing rails: at 0.15 three rows still fail (40-seed means: the Earth+Frost Bolt on one dummy −23.3%, the Fire+Nature and Nature+Fire Strikes in the pack −19.6% and −19.2%), and at 0.2 the Earth+Frost Bolt still loses 18.2% while the first dives' mean reaches 11.75 (the rail allows 12) |
| Bolt's `defaultChain` | light, light, medium, heavy | light, medium, medium, heavy | The Earth+Frost (Glacier) Bolt Shatters less: its two light moves apply one frost stack each where today's Balanced press applies two. A medium second move fixes it (+4.4%) |
| Strike's `defaultChain` | medium, medium, medium, heavy | medium, medium, heavy, heavy | The Wildfire (Fire+Nature) Strike in the pack presses into the 1 s reaction lockout and loses its Combusts; a heavy third move (a longer conjure and cooldown) spaces its presses out (−5.5%, from −19.6%) |
| every other value | as the spec | the same | |

The variants measured (the floor on 40-seed means of all 576 mana default-chain rows, depth 10, one dummy and the pack, against the same row's Balanced figure before chains):

| `stepBonus` | Bolt | Strike | Floor (worst row) | Pacing rails |
|---|---|---|---|---|
| 0.15 | L L M H | M M M H | 3 rows fail (worst −23.3%) | |
| 0.2 | L L M H | M M M H | 1 row fails (−18.2%) | hold; first dives 12, 11, 12, 12 (mean 11.75 of ≤ 12) |
| 0.2 | L M M H | M M M H | holds (−14.3%, the Fire+Nature Strike, pack) | hold; first dives 12, 12, 11, 12 (mean 11.75) |
| 0.1 | L M M H | M M H H | holds (−14.6%) | hold; first dives 11, 12, 12, 11 (mean 11.5) |
| 0.12 | L M M H | M M H H | holds (−13.1%) | **fail**: the pair sweep's Frost+Nature ends at 18 (allowed 19.2–51.2) |
| **0.15** | **L M M H** | **M M H H** | **holds (−10.8%, the Earth+Fire Volley, pack)** | **hold; first dives 11, 11, 5, 4 (mean 7.75)** |

The last row is the only one with room on both sides. The gate on these values (Task 8 measures it again and stops if a number differs):

| | Result | |
|---|---|---|
| Pacing rails | first dives 11, 11, 5, 4 (mean 7.75); dive 6 27.25, dive 12 38.5; Frost 10.5 → 34.5; 5 legendaries; own reaction 6 of 6; the 15-pair sweep's median 29, 20–38 (allowed 17.4–46.4); 25.46 s a floor | hold |
| Basics: every weapon and pair, one dummy and the pack, within 1% (the default chain is today's string) | 504 rows, worst +0.0% | pass |
| Floor: every non-Defensive form's mana default chain under a held button loses at most 15% against today's Balanced row (40-seed means) | 576 rows, worst −10.8% | pass |

Reported, not gated (one seed, depth 10): the mana default chains' median +0.0% [−21.7%, +129.1%] (the one-seed −21.7%, the Storm+Nature Lance on one dummy, is +0.9% on 40 seeds; Nova, Barrage and Maelstrom, a single medium move, +0.0%); cast default chains +27.4% [+0.0%, +145.9%]; charge default chains +0.0% [−56.9%, +158.6%] (today's charge rows only ever fired press 1, so they aren't comparable). One-move chains against today's equivalent weight: light and medium median −11.4% (mana, cast), heavy +0.0%. Hold moves at full charge against today's Crushing rows: mana median −38.2% (the single-element mana Bolt on one dummy −29.5%, as the spec expects: the charge adds to the cycle), cast −10.2%, charge −2.3%.

---

## Where the spec left room

- **`HeroBlow.attunePower`**: the spec's per-blow `power` (1 + `basicPowerPerAttune` × the element's attunement; 1 without a pair) is `attunePower`, because `ComboStepDef.power` (the row's multiplier) already carries that name on the same object.
- **`basic` event**: the spec's "gains `kind`" is `moveKind` (`kind` is the event's discriminator, `'basic'`).
- **`nextMove(h, slot, t, window)`** takes the combo window, as `pressStep` does. `activeMove(h, slot)` reads the wind-up's move, then the hold's, then (the Defensive) `h.defend.move` at `h.defend.stage`: a held Defensive's effect keeps its stage's numbers, so `h.defend` carries `stage` too.
- **The release is routed before the buffer:** a `cast` for the slot whose hold runs goes to `world.queuedRelease` (read by `holdTick` that step), never to `queuedCast`. A release fires at once for every payment, cast included (the charge was its wind-up).
- **Held basic blows** apply their stage's kind's stacks (stage 0 medium 1, stage 1 heavy 2, stage 2 hold 2), and their `holdStage` events carry `slot: null`.
- **Binding a secondary** makes the basic chain's last blow the secondary (the default chain's rule), whatever the chain; `realign` and `fixChainsToPair` then keep blows in the pair.
- **The DPS Lab's ability setups** carry the sword's default basics on the pair `{ first, second }` (the last blow the second), as today's setups discharged the second at the finisher, so the before and after rows stay comparable. The sim doesn't press while a wind-up runs.
- **The Training Grounds' sandbox** keeps a `secondary` for its blows (`setSecondary`); when the primary or secondary changes, blows of the old secondary take the new one (the primary if there's none) and every other blow the primary.
- **Notices:** the bind hint shows only for saves older than version 4 (`gainedPair`), not for every migrated save; the overtake notice reads "Storm now outweighs Fire: Storm is your primary" (blows keep their own elements now).
- **Names:** a hold move reads "held" ("held Fire Bolt"); the builder's skill tabs list Basic first but open on the Primary.
- **Controller:** `padCast` (in `arena-pad.ts`) decides a frame's cast from the world: a slot whose next move is a hold (or whose hold runs) casts on its button's release, which the core finds from the slot held the frame before; hold-to-repeat skips it.
- **The hero's aura, footing ring and floor light** take the first blow's element (they took the weapon's, which is gone).
- **E2E D01** matches the Primary's label with a pattern (the bot is already stepping through the chain when the arena shows); G04 and T01 check the exact "Primary: light Fire Bolt" before any press.

---

**Conventions:**
- Windows 11. The Bash tool runs POSIX sh; PowerShell is also available (use it for process management).
- Branch `claude/alloy-loot-gear-system-6upsy5` (already checked out). **One commit per task.** Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; the commit blocks below pass it as the last `-m`. The commit bodies of Tasks 9–11 also carry a line saying what stays red until Task 12 (the client typecheck, and in Tasks 9–10 some client tests), which their blocks pass as a second `-m`.
- Stage files by path. Never `git add -A` or `git add .` at the repo root: three unrelated untracked plan docs (`docs/superpowers/plans/2026-05-01-*.md`) exist and must stay out.
- **Don't push**: the controller pushes after a final review. Never open a PR.
- **Run every command from the repo root.** The shell's working directory persists between commands, so every command line below runs in a subshell (`(cd packages/engine && npx vitest run …)`), and every commit block starts with `cd /c/Projects/Alloy`.
- **Prettier:** the commit blocks format only files a task creates, or files that pass `npx prettier --check` before the edit (the repo's own Prettier, 3.8.1, run from the repo root). Of the files this plan touches, these are not clean at HEAD and are **never formatted**, only hand-edited: `packages/engine/src/types/ability.ts`, `packages/engine/src/arpg/abilities/resolve.ts`, `packages/engine/src/delve/profile-schema.ts`, `packages/engine/src/delve/autopilot.ts`, `packages/engine/src/delve/dive.ts`, `packages/engine/tests/delve-hero-smithing.test.ts`, the three data files `balance.json`, `arpg.json` and `delve.json` (hand-laid-out JSON), `CLAUDE.md` and the spec docs. Every other existing file edited here passed `npx prettier --check` at HEAD; never commit a whole-file reformat. The code below is already Prettier-formatted (checked on the scratch copy), so the commit blocks' `--write` changes nothing if you typed it as written.
- **Line endings:** `types/ability.ts`, `abilities/resolve.ts`, `delve/profile-schema.ts`, `delve/autopilot.ts`, `delve/dive.ts`, `CLAUDE.md` and the specs `2026-09-25-delve-combat-weight-design.md`, `2026-09-27-delve-elemental-affinity-design.md`, `2026-09-28-delve-elemental-stacks-design.md` and `2026-09-29-delve-moves-and-chains-design.md` use CRLF; every other file here is LF. Keep each file's endings (the Edit tool does; don't rewrite a file with a script that normalises them). The known CRLF files `registry.ts`, `delve-pacing.test.ts` and `App.tsx` aren't touched.
- **How the edits read.** "Replace: A with: B" is one Edit (old A, new B). "After: A add: B" is the Edit old A, new A followed by B on the next line; "Before: A add: B" is old A, new B followed by A. Every A is unique in its file at that point, in the order given, so apply each file's edits top to bottom. "Replace the whole of `f` with" is a Write (only ever an LF file).
- `arpg/combat.ts` and the modules in `arpg/abilities/` import each other (`combat.ts` reads `defend.js`, and from Task 3 `cast.js` and `resolve.js`; they read `combat.js`): only ever read such an import inside a function, never at module top level.
- Engine `tsc` covers `src` only; client `tsc` covers `src` including tests, so client test code must type-check.
- Geometry the engine tests rely on: the fixture arena's hero starts at (13, 36) facing up (−y); `dummy(x, y)` is a sturdy foe (1e6 life) that doesn't fight back, and the fixture's foes are **Fire** (they resist fire; Frost is their weakness). The fixture's chains (`DEFAULT_CHAINS`) are one medium move each: a Fire Bolt, a Frost Ward, a charged Fire Nova; `chainsWith`/`chainOf` change a slot's move or give it whole `moves`.
- **Every engine task runs the whole suite, the pacing rails included.** On the scratch copy they held after each of Tasks 1–8 at that task's values (the rails' numbers move as chains arrive; Task 8 records the final ones).
- **The client is red from Task 8's engine rebuild until Task 12.** The client consumes the engine's bundle (`dist`), so once Task 8 rebuilds it, the client's typecheck fails until Task 12 and some client tests fail until Task 11; each client task says which. The numbers below were measured on the scratch copy of this exact code (the sim is deterministic, so you should see the same).

**Commands:**

| What | Command (from repo root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` (about 20 s; the pacing rails run while the files load) |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine build | `(cd packages/engine && pnpm build)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client tests | `(cd packages/client && npx vitest run)`, or one file: `(cd packages/client && npx vitest run <path>)` |
| E2E | `(cd packages/client && npx playwright test -c playwright.scratch.config.ts <specs>)` (to pick devices use `--project=desktop` with the `=`: a bare `--project desktop` swallows the spec path) |

**Dev server on 5288** (PowerShell; stops whatever owns the port, starts a detached Vite, waits for a 200 and prints `True`; leave it running when done):

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5288 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\Alloy\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5288 --strictPort --force --host'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5288').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

**E2E scratch config** (Task 13; create it then, delete it at the end, never commit it): `packages/client/playwright.scratch.config.ts`. Playwright's own config starts Vite on port 5199, which another project on this machine may hold; this one reuses the 5288 dev server instead.

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

A timeout under load that passes on a rerun (`-g <test> --repeat-each 2`) is flakiness (on the scratch copy G01, the dive menu's D-pad focus, timed out once in each full run and passed on its reruns). A consistent failure is a regression: debug it with logging and the page's state, not guesses or longer timeouts.

**The gate's files** live in the plan author's scratchpad, `C:\Users\hahnz\AppData\Local\Temp\claude\c--Projects-Alloy\239f61fd-0a16-4600-a17d-7efef362f2cc\scratchpad\chains-before` (called `<before>` below; in the Bash tool, `/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/chains-before`). They were made from the pre-chains engine (v0.45.0) and must not be regenerated after Task 2: `before-depth10.json` (the DPS Lab grid at depth 10, one dummy and the pack, one seed: 9,144 rows, by `snapshot.mjs`) and `before-mana40.json` (40-seed means of the 576 Balanced mana ability rows, by `seeds.mjs`), and the scripts `snapshot.mjs`, `seeds.mjs`, `gate.mjs`, `floor.mjs` and `pacing.mjs`. All five scripts' texts are at the end of Task 8, in case the folder is gone; Task 1 checks the two `before-*.json` and remakes them from HEAD if they are missing.

## File map

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/types/ability.ts` | `MoveKind`, `MOVE_KINDS`, `HOLD_STAGE_KINDS`, `Move`, `Chain`, `Blow`, `ChainSkill`, `CHAIN_SKILLS`, `Chains`, `MAX_CHAIN`; `FormDef` loses `combo`/`comboCount` and gains `defaultChain`, `countByKind`; `ResolvedAbility` gains `kind`, `stage`, `index`, `last` and loses `build`/`combo`; `ResolvedChain`; `AbilityBuild` stays for the frozen saves |
| `src/types/delve.ts` | `DelveBalance.chains`, `stacks.basicByKind` (Task 5 drops `basicBlow`/`basicFinisher`); `GearBaseDef.feel`/`defaultChain` (Task 5 drops `combo`), `hero.feel`/`defaultChain`; `HeroBlow`; `HeroWeapon.feel`/`blows` (Task 5 drops `element`, `infusion`, `blowPower`, `finisherPower`, `combo`); `DelveProfile` v5 (`chains`, `chainCaps`) |
| `src/types/arpg.ts` | `HeroEntity.chains`, per-move `cooldowns`, `hold`, `defend.move`/`stage`, `swing.held`; `ArpgInput.holding`/`cancelHold`; `holdStage` event; `basic` event `moveKind` (and no `finisher`); `ArpgWorld.queuedRelease`; `FloorOptions.chains` |
| `src/data/balance.json`, `schemas.ts` | `delve.chains`; `stacks.basicByKind`; `hero.feel`/`defaultChain` (the unarmed rows; Task 5 drops `defaultCombo`, `basicBlow`, `basicFinisher`) |
| `src/data/delve.json` | each weapon's `feel` and `defaultChain` (Task 5 drops `combo`) |
| `src/data/arpg.json` | forms' `defaultChain`, Volley's `countByKind`; `combo`/`comboCount` go; the forms' texts describe chains |
| `src/arpg/abilities/resolve.ts` | `resolveAbility(registry, slot, move, payment, stats, stage)`, `moveWeight`, `resolveChain`, `chainMove`, `chargeCap`, `stepBonus`, `stepHeft`, `defaultBasic`, `defaultChains` |
| `src/arpg/abilities/cast.ts` | `abilityReady`, `pressStep`, `nextMove`, `activeMove`, `holdCharge`; per-move payment and cooldowns; `castAbility` on the chain; holds (`startHold`, `releaseHold`, `holdTick`) |
| `src/arpg/abilities/forms.ts`, `defend.ts` | the step bonus on power and size; Volley's count by kind; Strike's slam on a chain's last move; the Defensive's effect from `h.defend.move`; `buff()` replaces a running defensive |
| `src/arpg/world.ts`, `step.ts`, `action.ts`, `dodge.ts`, `combat.ts`, `sandbox.ts`, `bot.ts` | the hero's chains, per-move cooldowns and charge caps; `refreshWorldHero` on chains (a changed move's wind-up or hold cancels); release routing, `cancelHold`, `holdTick` and `basicHoldTick`; a dodge drops a hold; Nightstalker and Galvanize on chains; the bot reads `nextMove` and charges holds |
| `src/arpg/basic.ts` | blows per kind and element; `basicByKind` stacks; manual hold blows (`basicHoldTick`, `strike(ctx, stage)`) |
| `src/arpg/dps-sim.ts` | setups carry `chains`; `dpsCombos` enumerates one-move chains by kind and each form's default chain; holds held to full charge |
| `src/delve/hero-stats.ts` | `HeroStatsExtra.basic`; `HeroWeapon.blows`; `estimateCombat` over blows and each chain's average step bonus |
| `src/delve/profile.ts`, `profile-schema.ts`, `pair.ts`, `dive.ts`, `autopilot.ts` | save v5 and the v4 → v5 migration (`chainFromBuild`, `buildChains`); `setChain`; `fixChainsToPair` (`ChainFix`); `chooseStartingMana`, `bindSecondary`, `realign`, `reattune` on chains; the autopilot's `bindBest` |
| `src/index.ts` | the new exports; the build ops' go |
| `tests/delve-chains.test.ts` (new) | the spec's engine tests |
| `tests/fixtures/arena.ts` | `DEFAULT_CHAINS`, `chainsWith`, `chainOf`, `moveOf`, `holdFor`, `OLD_BUILDS`, `asV4`, `strikeWorld` |
| `tests/{ability-cast,ability-forms,ability-resolve,arpg-sim,delve-combat-weight,delve-dive,delve-dodge,delve-infusion,delve-pair,delve-reactions,delve-stacks,delve-training,delve-hero-smithing,delve-profile-abilities,delve-dps-sim}.test.ts` | updated to chains |

`src/arpg/abilities/impact.ts` and `targeting.ts` need no edit (the step bonus's power goes on `executeForm`'s hit, in `forms.ts`). `tests/delve-manual-attack.test.ts` and `tests/delve-pacing.test.ts` pass unchanged.

**Client (`packages/client/src/`)**

| File | Change |
|---|---|
| `features/delve/chains/chain-text.ts` (new) | `KIND_LABEL`, `KIND_ICON`, `moveText`, `blowText`, `chainText` |
| `features/delve/chains/ChainEditor.tsx`, `MoveEditor.tsx` (new) | the chain builder: skill tabs, move cards (◂ ▸ ×, +), the move editor, payment, attunement, reactions |
| `features/delve/AbilitiesPanel.tsx` | keeps `AttunementBars` and `Chip`; the panel renders `ChainEditor` on the save |
| `features/delve/training/TrainingPanel.tsx` | "Your secondary" replaces "Basic infusion"; the Abilities tab edits the sandbox's chains |
| `stores/delveStore.ts`, `stores/sandboxStore.ts` | `setChain`; per-move fix notices; the sandbox's `chains`, `secondary`, `refit`, `loadMyBuild` |
| `features/delve/ManaPanel.tsx`, `BindPrompt.tsx`, `ManaChoice.tsx`, `PaperDoll.tsx`, `pages/DelveCamp.tsx` | chains in `profileStats`; texts say blows and chains |
| `features/delve/arena/useArenaCore.ts`, `useArena.ts`, `training/useTrainingArena.ts` | the HUD snapshot's chains (`chainStep`, `chainLength`, `nextKind`, `hold`, the basic's too); `holding`, `cancelHold`, the pad's release edge; loadouts carry `chains` |
| `features/delve/arena/ArenaHud.tsx`, `input.ts`, `features/gamepad/arena-pad.ts`, `pages/DelveRun.tsx`, `pages/DelveTraining.tsx` | step dots, kind glyphs, the hold bar, the next move's aria-label, release-back cancels; `holdingSlot`; `padCast` |
| `features/delve/arena/ArenaRenderer.ts`, `fx/anticipation.ts`, `fx/draw-world.ts`, `fx/mana-fx.ts`, `fx/lifecycles.ts`, `fx/infusion.ts`, `pixel/floor-engine.ts` | blows by kind and element; heavy and hold blows ring out; `holdStage` pings; anticipation grows with a hold's charge; the basic motif goes |
| tests | `features/delve/__tests__/{chain-text,AbilitiesPanel,TrainingPanel,ArenaHud,arena-hud-snapshot,arena-input,arena-renderer}`, `features/gamepad/__tests__/gamepad.test.ts`, `features/delve/arena/fx/__tests__/{anticipation,infusion,lifecycles,mana-fx,reactions}`, `pages/__tests__/{DelveCamp,DelveLab}`, `stores/{delveStore,sandboxStore}.test.ts` |

`features/controls/controls.ts` needs no edit (hold-to-repeat keeps its per-ability setting), nor do `features/delve/training/meter.ts` (its buckets are the slots) and `features/delve/lab/` (it reads each setup's `dims`). E2E: `e2e/delve.spec.ts` (D01, D04, D08), `e2e/delve-gamepad.spec.ts` (G04), `e2e/delve-training.spec.ts` (T01). `packages/client/package.json`: 0.45.0 → 0.46.0 (Task 14).

**Docs:** `CLAUDE.md` (the Delve paragraph and its engine, data, affinity, stacks, client, FX, controller, Training Grounds and DPS Lab bullets), the chains spec's status line, and superseded notes in the ability-system, combat-weight, affinity, stacks and DPS Lab specs.

---

## Chunk 1: Engine: the types and the data

### Task 1: The types, `delve.chains` and basic stacks by kind

Added alongside today's model; nothing reads them yet.

**Files:**
- Modify: `packages/engine/src/types/ability.ts:46` (after `AbilityBuilds`; CRLF, hand-edit)
- Modify: `packages/engine/src/types/delve.ts:3,439,498` (the import, `stacks`, before `dodge`)
- Modify: `packages/engine/src/data/schemas.ts:2,392,806,874` (the import, after `ReactionIdSchema`, `stacks`, before `dodge`)
- Modify: `packages/engine/src/data/balance.json:144,168` (`stacks`, before `dodge`; hand-edit, never format)
- Create: `packages/engine/tests/delve-chains.test.ts`
- Modify: `packages/engine/tests/delve-stacks.test.ts:64`

- [ ] **Step 0: Commit the plan**

If `git status` shows this plan untracked, commit it first so every later commit stays about code:

```bash
cd /c/Projects/Alloy
git add docs/superpowers/plans/2026-09-29-delve-moves-and-chains.md
git commit -m "docs: plan Delve moves and chains" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 1: Check the gate's "before" files**

Task 8 compares against the pre-chains engine, which exists only until Task 2.

Run: `(ls /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/chains-before)`
Expected, among others: `before-depth10.json`, `before-mana40.json`, `floor.mjs`, `gate.mjs`, `pacing.mjs`, `seeds.mjs`, `snapshot.mjs`.

If `before-depth10.json` or `before-mana40.json` is missing, make them now from HEAD (first write any missing script from the texts at the end of Task 8): `(cd packages/engine && pnpm build)`, then `(node /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/chains-before/snapshot.mjs)` (prints `runs 9144 …`; a few minutes) and `(node /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/chains-before/seeds.mjs packages/engine/dist/index.js --grid "\|0\|mana$" /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/chains-before/before-mana40.json)` (prints `rows 576`; about five minutes).

- [ ] **Step 2: Write the failing tests**

Create `packages/engine/tests/delve-chains.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import { CHAIN_SKILLS, MAX_CHAIN, MOVE_KINDS } from '../src/types/ability.js';
import { bal } from './fixtures/arena.js';

// See the moves and chains spec.

describe('balance: delve.chains', () => {
  it('loads the chain numbers', () => {
    expect(bal.chains).toEqual({
      cap: { basic: 5, primary: 5, defensive: 5, ultimate: 5 },
      kindWeight: { light: -1, medium: 0, heavy: 1 },
      holdStageWeight: [0, 1, 2],
      holdTime: 1,
      holdMax: 2,
      holdStages: [0.33, 0.66],
      stepBonus: 0.1,
    });
    expect(bal.stacks.basicByKind).toEqual({ light: 1, medium: 1, heavy: 2, hold: 2 });
    expect(MOVE_KINDS).toEqual(['light', 'medium', 'heavy', 'hold']);
    expect(CHAIN_SKILLS).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    expect(MAX_CHAIN).toBe(5);
  });

  it('refuses a cap outside 1..MAX_CHAIN, a weight off the tables, stages out of order and a holdMax under holdTime', () => {
    const parses = (chains: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, chains: { ...balanceData.delve.chains, ...chains } },
      }).success;
    const cap = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
    expect(parses({})).toBe(true);
    expect(parses({ cap: { ...cap, basic: 0 } })).toBe(false);
    expect(parses({ cap: { ...cap, ultimate: MAX_CHAIN + 1 } })).toBe(false);
    expect(parses({ kindWeight: { light: -3, medium: 0, heavy: 1 } })).toBe(false);
    expect(parses({ holdStageWeight: [0, 1] })).toBe(false);
    expect(parses({ holdStages: [0.66, 0.33] })).toBe(false);
    expect(parses({ holdMax: 0.5 })).toBe(false);
  });
});
```

In `packages/engine/tests/delve-stacks.test.ts`, the stack numbers gain the blows' counts by kind (`basicBlow`/`basicFinisher` stay until Task 5):

Before:
```ts
      tick: 1,
```
add:
```ts
      basicByKind: { light: 1, medium: 1, heavy: 2, hold: 2 },
```

- [ ] **Step 3: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts tests/delve-stacks.test.ts)`
Expected: 3 FAIL, 49 pass: "loads the chain numbers" (expected undefined to deeply equal { cap: { basic: 5, …(3) }, …(6) }), "refuses a cap outside 1..MAX_CHAIN, …" (expected true to be false: the schema strips the unknown `chains`), and delve-stacks' "loads the stack numbers" (expected { cap: 5, …(14) } to deeply equal { cap: 5, …(15) }).

- [ ] **Step 4: The types**

In `packages/engine/src/types/ability.ts` (CRLF: hand-edit), after the builds:

Replace:
```ts
export type AbilityBuilds = Record<AbilitySlot, AbilityBuild>;
```
with:
```ts
export type AbilityBuilds = Record<AbilitySlot, AbilityBuild>;

/** How a move lands: light, medium or heavy, or a hold that charges while the button is held. */
export type MoveKind = 'light' | 'medium' | 'heavy' | 'hold';

export const MOVE_KINDS: readonly MoveKind[] = ['light', 'medium', 'heavy', 'hold'] as const;

/** One move of an ability chain: its kind, a form of the chain's slot, and one or two elements. */
export interface Move {
  kind: MoveKind;
  form: FormId;
  /** One element, or two distinct elements (a fusion). */
  elements: ManaType[];
}

/** An ability slot's chain: each press casts its next move; one payment for every move. */
export interface Chain {
  moves: Move[];
  payment: AbilityPayment;
}

/** One blow of the basic chain: the weapon's row for its kind, in its element. */
export interface Blow {
  kind: MoveKind;
  element: ManaType;
}

/** A skill that holds a chain: the basic attack or an ability slot. */
export type ChainSkill = 'basic' | AbilitySlot;

export const CHAIN_SKILLS: readonly ChainSkill[] = [
  'basic',
  'primary',
  'defensive',
  'ultimate',
] as const;

export interface Chains {
  basic: Blow[];
  primary: Chain;
  defensive: Chain;
  ultimate: Chain;
}

/** Most moves a chain can hold (each skill's own cap, on the profile, is at most this). */
export const MAX_CHAIN = 5;
```

In `packages/engine/src/types/delve.ts`:

Replace:
```ts
import type { AbilityBuilds, AbilitySlot } from './ability.js';
```
with:
```ts
import type { AbilityBuilds, AbilitySlot, ChainSkill, MoveKind } from './ability.js';
```

Before:
```ts
    /** Every other hit that applies statuses: zone ticks, embers, chain jumps, retaliation… */
```
add:
```ts
    /** A basic blow's stacks, by its kind. */
    basicByKind: Record<MoveKind, number>;
```

Before:
```ts
  /** The dodge: charges, the dash, i-frames and the perfect-dodge windows (seconds / units). */
```
add:
```ts
  /** Moves and chains (see the moves and chains spec). */
  chains: {
    /** Most moves each skill's chain holds, a profile's caps to start with (at most `MAX_CHAIN`). */
    cap: Record<ChainSkill, number>;
    /** The weight each kind resolves at: every per-weight table reads through it. */
    kindWeight: Record<Exclude<MoveKind, 'hold'>, number>;
    /** A hold's three stages' weights. */
    holdStageWeight: number[];
    /** Seconds a hold takes to charge fully. */
    holdTime: number;
    /** A hold still charging this many seconds after it began fires by itself at stage 2. */
    holdMax: number;
    /** The charge (0..1) at which a hold reaches stage 1, then stage 2. */
    holdStages: number[];
    /** Move `i` (from 0) lands at power × (1 + this × i) and size × (1 + this × i / 2). */
    stepBonus: number;
  };
```

- [ ] **Step 5: The schema and the numbers**

In `packages/engine/src/data/schemas.ts` (the kind schema sits beside `ReactionIdSchema`, whose `SameIds` check it copies):

After:
```ts
import type { ReactionId } from '../types/arpg.js';
```
add:
```ts
import { MAX_CHAIN, type MoveKind } from '../types/ability.js';
```

Replace:
```ts
true satisfies SameIds<ReactionId, z.infer<typeof ReactionIdSchema>>;
```
with:
```ts
true satisfies SameIds<ReactionId, z.infer<typeof ReactionIdSchema>>;

export const MoveKindSchema = z.enum(['light', 'medium', 'heavy', 'hold']);
true satisfies SameIds<MoveKind, z.infer<typeof MoveKindSchema>>;

function perKind<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ light: schema, medium: schema, heavy: schema, hold: schema });
}
```

Before:
```ts
    tick: z.number().int().min(0),
```
add:
```ts
    basicByKind: perKind(z.number().int().min(0)),
```

Before:
```ts
  dodge: z
```
add:
```ts
  chains: z
    .object({
      cap: z.object({
        basic: z.number().int().min(1).max(MAX_CHAIN),
        primary: z.number().int().min(1).max(MAX_CHAIN),
        defensive: z.number().int().min(1).max(MAX_CHAIN),
        ultimate: z.number().int().min(1).max(MAX_CHAIN),
      }),
      // The per-weight tables (`feel`, `stacks.byWeight`) run Swift to Crushing: −2..2.
      kindWeight: z.object({
        light: z.number().int().min(-2).max(2),
        medium: z.number().int().min(-2).max(2),
        heavy: z.number().int().min(-2).max(2),
      }),
      holdStageWeight: z.array(z.number().int().min(-2).max(2)).length(3),
      holdTime: z.number().positive(),
      holdMax: z.number().positive(),
      holdStages: z.array(z.number().gt(0).lt(1)).length(2),
      stepBonus: z.number().min(0),
    })
    .refine((c) => c.holdStages[0] < c.holdStages[1], 'holdStages must rise')
    .refine((c) => c.holdMax >= c.holdTime, 'holdMax must be at least holdTime'),
```

In `packages/engine/src/data/balance.json` (hand-edit, keep its layout):

Before:
```json
      "curve": [1, 1.8, 2.45, 3.0, 3.5],
```
add:
```json
      "basicByKind": { "light": 1, "medium": 1, "heavy": 2, "hold": 2 },
```

Before:
```json
    "dodge": {
```
add:
```json
    "chains": {
      "cap": { "basic": 5, "primary": 5, "defensive": 5, "ultimate": 5 },
      "kindWeight": { "light": -1, "medium": 0, "heavy": 1 },
      "holdStageWeight": [0, 1, 2], "holdTime": 1.0, "holdMax": 2.0, "holdStages": [0.33, 0.66],
      "stepBonus": 0.1
    },
```

These are the spec's starting values; Task 8's gate raises `stepBonus` to 0.15.

- [ ] **Step 6: Run them to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts tests/delve-stacks.test.ts)`
Expected: PASS (52).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1205 tests pass.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-stacks.test.ts packages/engine/src/data/schemas.ts packages/engine/src/types/delve.ts
git add packages/engine/src/types/ability.ts packages/engine/src/types/delve.ts packages/engine/src/data/schemas.ts packages/engine/src/data/balance.json packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-stacks.test.ts
git commit -m "feat(engine): the moves and chains types, delve.chains and basic stacks by kind" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Each weapon's feel rows and default chain, each form's default chain

The data, beside today's strings and press-combos (Task 3 drops the forms' `combo`/`comboCount`, Task 5 the weapons' `combo` and the hero's `defaultCombo`). The rows follow the spec's derivation, so each default chain plays today's string blow for blow: for strings of three or more blows, light is blow 1 and heavy the finisher; medium is the dagger's third blow (the one ordinary blow that differs from blow 1), else halfway between light and heavy in every number (the arcs too: the axe's medium sweeps 265°). The maul's two blows are medium and heavy, its light the medium at power × 0.8, time × 0.85, startup × 0.9, heft × 0.75, move × 0.8. Every hold row is the heavy one at startup × 1.5, power × 1.3 and heft + 0.2 (at most 1). The test pins today's strings as literals, so the data can't drift from them.

**Files:**
- Modify: `packages/engine/src/types/arpg.ts:5,64` (the import; `FormDef`)
- Modify: `packages/engine/src/types/delve.ts:66,271` (`GearBaseDef`; `hero`)
- Modify: `packages/engine/src/data/schemas.ts:482,641,675` (gear bases, forms, `hero`)
- Modify: `packages/engine/src/data/delve.json` (each weapon base, after its `combo`; hand-edit)
- Modify: `packages/engine/src/data/balance.json:87` (`hero`; hand-edit)
- Modify: `packages/engine/src/data/arpg.json` (each form; hand-edit)
- Test: `packages/engine/tests/delve-chains.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-chains.test.ts`, import the kind and row types and the registry, then add the strings and the data tests after the balance tests:

Replace:
```ts
import { CHAIN_SKILLS, MAX_CHAIN, MOVE_KINDS } from '../src/types/ability.js';
import { bal } from './fixtures/arena.js';
```
with:
```ts
import { CHAIN_SKILLS, MAX_CHAIN, MOVE_KINDS, type MoveKind } from '../src/types/ability.js';
import type { ComboStepDef } from '../src/types/delve.js';
import { bal, registry } from './fixtures/arena.js';
```

Replace:
```ts
  });
});
```
with:
```ts
  });
});

/** Each weapon's basic string before chains (`delve.json` `combo`, v0.45.0), and the unarmed one. */
const STRINGS: Record<string, ComboStepDef[]> = {
  dagger: [
    { time: 0.8, startup: 0.3, move: 0.25, power: 0.8, heft: 0.15 },
    { time: 0.8, startup: 0.3, move: 0.25, power: 0.8, heft: 0.15 },
    { time: 0.8, startup: 0.3, move: 0.3, power: 0.9, heft: 0.15 },
    { time: 1.4, startup: 0.35, move: 0.7, power: 1.7, heft: 0.6, arc: 150, knockback: 0.3 },
  ],
  sword: [
    { time: 0.9, startup: 0.3, move: 0.4, power: 1.0, heft: 0.3 },
    { time: 0.9, startup: 0.3, move: 0.4, power: 1.0, heft: 0.3 },
    {
      time: 1.3,
      startup: 0.4,
      move: 1.2,
      power: 1.7,
      heft: 0.8,
      arc: 50,
      reach: 0.9,
      knockback: 0.6,
    },
  ],
  axe: [
    { time: 0.9, startup: 0.35, move: 0.3, power: 1.0, heft: 0.4 },
    { time: 0.9, startup: 0.35, move: 0.3, power: 1.0, heft: 0.4 },
    { time: 1.3, startup: 0.4, move: 0.5, power: 1.7, heft: 0.8, arc: 360, knockback: 0.5 },
  ],
  maul: [
    { time: 1.0, startup: 0.45, move: 0.5, power: 1.0, heft: 0.6, arc: 140 },
    {
      time: 1.3,
      startup: 0.5,
      move: 0.7,
      power: 1.8,
      heft: 1.0,
      arc: 360,
      reach: 0.4,
      knockback: 0.8,
      stagger: true,
    },
  ],
  staff: [
    { time: 0.9, startup: 0.3, move: -0.1, power: 0.9, heft: 0.2 },
    { time: 0.9, startup: 0.3, move: -0.1, power: 0.9, heft: 0.2 },
    { time: 1.3, startup: 0.45, move: -0.3, power: 1.4, heft: 0.6, size: 1.8, explode: 1.0 },
  ],
  wand: [
    { time: 0.9, startup: 0.2, move: -0.05, power: 0.9, heft: 0.1 },
    { time: 0.9, startup: 0.2, move: -0.05, power: 0.9, heft: 0.1 },
    { time: 1.2, startup: 0.25, move: -0.1, power: 1.3, heft: 0.3, size: 1.5 },
  ],
  bow: [
    { time: 0.85, startup: 0.35, move: -0.05, power: 0.85, heft: 0.2 },
    { time: 0.85, startup: 0.35, move: -0.05, power: 0.85, heft: 0.2 },
    { time: 1.4, startup: 0.6, move: -0.2, power: 1.6, heft: 0.6, speed: 1.4 },
  ],
  unarmed: [
    { time: 0.9, startup: 0.3, move: 0.3, power: 1.0, heft: 0.2 },
    { time: 0.9, startup: 0.3, move: 0.3, power: 1.0, heft: 0.2 },
    { time: 1.2, startup: 0.35, move: 0.5, power: 1.3, heft: 0.4, knockback: 0.3 },
  ],
};

/** A weapon's feel table, its default chain and its arc (the unarmed ones from `hero`). */
function weapon(id: string) {
  if (id === 'unarmed') return { feel: bal.hero.feel, chain: bal.hero.defaultChain, arc: 90 };
  const base = registry.getGearBase(id);
  return { feel: base.feel!, chain: base.defaultChain!, arc: base.attack!.arc ?? 90 };
}

/** Every number of a row, with its defaults filled in and rounded (so 0.35 × 1.5 is 0.525). */
function numbers(row: ComboStepDef, arc: number) {
  const r = (x: number) => +x.toFixed(6);
  return {
    time: r(row.time),
    startup: r(row.startup),
    move: r(row.move),
    power: r(row.power),
    heft: r(row.heft),
    arc: r(row.arc ?? arc),
    reach: r(row.reach ?? 0),
    knockback: r(row.knockback ?? 0),
    size: r(row.size ?? 1),
    explode: r(row.explode ?? 0),
    speed: r(row.speed ?? 1),
    stagger: !!row.stagger,
  };
}

describe('data: feel tables and default chains', () => {
  it("each weapon's default chain reproduces its string blow for blow, and so does the unarmed one", () => {
    expect(registry.getGearBasesForSlot('weapon').map((b) => b.id)).toEqual(
      Object.keys(STRINGS).filter((id) => id !== 'unarmed'),
    );
    for (const [id, string] of Object.entries(STRINGS)) {
      const { feel, chain } = weapon(id);
      expect(
        chain.map((k) => feel[k]),
        id,
      ).toEqual(string);
    }
    expect(weapon('dagger').chain).toEqual(['light', 'light', 'medium', 'heavy']);
    expect(weapon('maul').chain).toEqual(['medium', 'heavy']);
    for (const id of ['sword', 'axe', 'staff', 'wand', 'bow', 'unarmed'])
      expect(weapon(id).chain, id).toEqual(['light', 'light', 'heavy']);
  });

  it('a medium row the string lacks is halfway between light and heavy in every number', () => {
    for (const id of ['sword', 'axe', 'staff', 'wand', 'bow', 'unarmed']) {
      const { feel, arc } = weapon(id);
      const [light, medium, heavy] = [feel.light, feel.medium, feel.heavy].map((row) =>
        numbers(row, arc),
      );
      for (const k of Object.keys(medium) as (keyof typeof medium)[])
        if (k !== 'stagger')
          expect(medium[k], `${id} ${k}`).toBeCloseTo(
            ((light[k] as number) + (heavy[k] as number)) / 2,
          );
    }
  });

  it("the maul's light is its medium, softer and quicker", () => {
    const { medium, light } = weapon('maul').feel;
    expect(numbers(light, 360)).toEqual(
      numbers(
        {
          ...medium,
          power: medium.power * 0.8,
          time: medium.time * 0.85,
          startup: medium.startup * 0.9,
          heft: medium.heft * 0.75,
          move: medium.move * 0.8,
        },
        360,
      ),
    );
  });

  it('a hold row is the heavy one: 50% longer to start, 30% harder and 0.2 heftier (at most 1)', () => {
    for (const id of Object.keys(STRINGS)) {
      const { feel, arc } = weapon(id);
      const { heavy } = feel;
      expect(numbers(feel.hold, arc), id).toEqual(
        numbers(
          {
            ...heavy,
            startup: heavy.startup * 1.5,
            power: heavy.power * 1.3,
            heft: Math.min(1, heavy.heft + 0.2),
          },
          arc,
        ),
      );
    }
  });

  it("each form's default chain follows its old press-combo: ≤ 0.9 light, ≤ 1.2 medium, else heavy", () => {
    const old: Record<string, number[]> = {
      bolt: [0.8, 0.8, 1, 1.5],
      volley: [1, 1, 1],
      lance: [1, 1, 1.4],
      burst: [1, 1, 1.5],
      strike: [1, 1, 1.2, 1.8],
    };
    const kind = (m: number): MoveKind => (m <= 0.9 ? 'light' : m <= 1.2 ? 'medium' : 'heavy');
    for (const form of registry.getArpgData().forms)
      expect(form.defaultChain, form.id).toEqual((old[form.id] ?? [1]).map(kind));
    expect(registry.getForm('volley').countByKind).toEqual({
      light: 3,
      medium: 3,
      heavy: 5,
      hold: 5,
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts)`
Expected: 5 FAIL, 2 pass: "each weapon's default chain reproduces its string …" (Cannot read properties of undefined (reading 'map')), "a medium row the string lacks …" (… (reading 'light')), "the maul's light …" (Cannot destructure property 'medium' of 'weapon(...).feel' as it is undefined), "a hold row is the heavy one …" (Cannot destructure property 'heavy' …), "each form's default chain follows its old press-combo …" (bolt: expected undefined to deeply equal [ 'light', 'light', 'medium', 'heavy' ]).

- [ ] **Step 3: The types and the schema**

In `packages/engine/src/types/arpg.ts`, `FormDef` gains the default chain and Volley's count by kind:

Replace:
```ts
import type { AbilityCast, AbilitySlot, FormId, Knobs, ResolvedAbility } from './ability.js';
```
with:
```ts
import type {
  AbilityCast,
  AbilitySlot,
  FormId,
  Knobs,
  MoveKind,
  ResolvedAbility,
} from './ability.js';
```

Before:
```ts
  /** Units the hero moves when casting: positive steps in over the conjure, negative recoils after the release. */
```
add:
```ts
  /** The form's default chain: new heroes' and migrated builds' moves (see the moves and chains spec). */
  defaultChain: MoveKind[];
  /** Projectiles by kind (Volley; a hold's stages count as medium, heavy and hold). */
  countByKind?: Record<MoveKind, number>;
```

In `packages/engine/src/types/delve.ts`, a weapon base and the unarmed hero gain their rows and chain:

After:
```ts
  combo?: ComboStepDef[];
```
add:
```ts
  /** Weapons only: a blow's row by its kind (else the hero's). */
  feel?: Record<MoveKind, ComboStepDef>;
  /** Weapons only: the basic chain a new hero gets (else the hero's). */
  defaultChain?: MoveKind[];
```

Before:
```ts
    minAttackInterval: number;
```
add:
```ts
    /** Unarmed: a blow's row by its kind. */
    feel: Record<MoveKind, ComboStepDef>;
    /** Unarmed: the default basic chain. */
    defaultChain: MoveKind[];
```

In `packages/engine/src/data/schemas.ts` (gear bases, forms, then `hero`):

After:
```ts
        combo: z.array(ComboStepSchema).min(1).optional(),
```
add:
```ts
        feel: perKind(ComboStepSchema).optional(),
        defaultChain: z.array(MoveKindSchema).min(1).max(MAX_CHAIN).optional(),
```

After:
```ts
        motion: z.number().optional(),
```
add:
```ts
        defaultChain: z.array(MoveKindSchema).min(1).max(MAX_CHAIN),
        countByKind: perKind(z.number().int().positive()).optional(),
```

Before:
```ts
    minAttackInterval: z.number().positive(),
```
add:
```ts
    feel: perKind(ComboStepSchema),
    defaultChain: z.array(MoveKindSchema).min(1).max(MAX_CHAIN),
```

- [ ] **Step 4: The rows and chains**

In `packages/engine/src/data/delve.json` (hand-edit), after each weapon base's `combo` (dagger, sword, axe, maul, staff, wand, then the bow, whose `combo` is followed by `"weight": 1`):

After:
```json
        { "time": 1.4, "startup": 0.35, "move": 0.7, "power": 1.7, "heft": 0.6, "arc": 150, "knockback": 0.3 }
      ],
```
add:
```json
      "feel": {
        "light": { "time": 0.8, "startup": 0.3, "move": 0.25, "power": 0.8, "heft": 0.15 },
        "medium": { "time": 0.8, "startup": 0.3, "move": 0.3, "power": 0.9, "heft": 0.15 },
        "heavy": { "time": 1.4, "startup": 0.35, "move": 0.7, "power": 1.7, "heft": 0.6, "arc": 150, "knockback": 0.3 },
        "hold": { "time": 1.4, "startup": 0.525, "move": 0.7, "power": 2.21, "heft": 0.8, "arc": 150, "knockback": 0.3 }
      },
      "defaultChain": ["light", "light", "medium", "heavy"],
```

After:
```json
        { "time": 1.3, "startup": 0.4, "move": 1.2, "power": 1.7, "heft": 0.8, "arc": 50, "reach": 0.9, "knockback": 0.6 }
      ],
```
add:
```json
      "feel": {
        "light": { "time": 0.9, "startup": 0.3, "move": 0.4, "power": 1.0, "heft": 0.3 },
        "medium": { "time": 1.1, "startup": 0.35, "move": 0.8, "power": 1.35, "heft": 0.55, "arc": 85, "reach": 0.45, "knockback": 0.3 },
        "heavy": { "time": 1.3, "startup": 0.4, "move": 1.2, "power": 1.7, "heft": 0.8, "arc": 50, "reach": 0.9, "knockback": 0.6 },
        "hold": { "time": 1.3, "startup": 0.6, "move": 1.2, "power": 2.21, "heft": 1.0, "arc": 50, "reach": 0.9, "knockback": 0.6 }
      },
      "defaultChain": ["light", "light", "heavy"],
```

After:
```json
        { "time": 1.3, "startup": 0.4, "move": 0.5, "power": 1.7, "heft": 0.8, "arc": 360, "knockback": 0.5 }
      ],
```
add:
```json
      "feel": {
        "light": { "time": 0.9, "startup": 0.35, "move": 0.3, "power": 1.0, "heft": 0.4 },
        "medium": { "time": 1.1, "startup": 0.375, "move": 0.4, "power": 1.35, "heft": 0.6, "arc": 265, "knockback": 0.25 },
        "heavy": { "time": 1.3, "startup": 0.4, "move": 0.5, "power": 1.7, "heft": 0.8, "arc": 360, "knockback": 0.5 },
        "hold": { "time": 1.3, "startup": 0.6, "move": 0.5, "power": 2.21, "heft": 1.0, "arc": 360, "knockback": 0.5 }
      },
      "defaultChain": ["light", "light", "heavy"],
```

After:
```json
        { "time": 1.3, "startup": 0.5, "move": 0.7, "power": 1.8, "heft": 1.0, "arc": 360, "reach": 0.4, "knockback": 0.8, "stagger": true }
      ],
```
add:
```json
      "feel": {
        "light": { "time": 0.85, "startup": 0.405, "move": 0.4, "power": 0.8, "heft": 0.45, "arc": 140 },
        "medium": { "time": 1.0, "startup": 0.45, "move": 0.5, "power": 1.0, "heft": 0.6, "arc": 140 },
        "heavy": { "time": 1.3, "startup": 0.5, "move": 0.7, "power": 1.8, "heft": 1.0, "arc": 360, "reach": 0.4, "knockback": 0.8, "stagger": true },
        "hold": { "time": 1.3, "startup": 0.75, "move": 0.7, "power": 2.34, "heft": 1.0, "arc": 360, "reach": 0.4, "knockback": 0.8, "stagger": true }
      },
      "defaultChain": ["medium", "heavy"],
```

After:
```json
        { "time": 1.3, "startup": 0.45, "move": -0.3, "power": 1.4, "heft": 0.6, "size": 1.8, "explode": 1.0 }
      ],
```
add:
```json
      "feel": {
        "light": { "time": 0.9, "startup": 0.3, "move": -0.1, "power": 0.9, "heft": 0.2 },
        "medium": { "time": 1.1, "startup": 0.375, "move": -0.2, "power": 1.15, "heft": 0.4, "size": 1.4, "explode": 0.5 },
        "heavy": { "time": 1.3, "startup": 0.45, "move": -0.3, "power": 1.4, "heft": 0.6, "size": 1.8, "explode": 1.0 },
        "hold": { "time": 1.3, "startup": 0.675, "move": -0.3, "power": 1.82, "heft": 0.8, "size": 1.8, "explode": 1.0 }
      },
      "defaultChain": ["light", "light", "heavy"],
```

After:
```json
        { "time": 1.2, "startup": 0.25, "move": -0.1, "power": 1.3, "heft": 0.3, "size": 1.5 }
      ],
```
add:
```json
      "feel": {
        "light": { "time": 0.9, "startup": 0.2, "move": -0.05, "power": 0.9, "heft": 0.1 },
        "medium": { "time": 1.05, "startup": 0.225, "move": -0.075, "power": 1.1, "heft": 0.2, "size": 1.25 },
        "heavy": { "time": 1.2, "startup": 0.25, "move": -0.1, "power": 1.3, "heft": 0.3, "size": 1.5 },
        "hold": { "time": 1.2, "startup": 0.375, "move": -0.1, "power": 1.69, "heft": 0.5, "size": 1.5 }
      },
      "defaultChain": ["light", "light", "heavy"],
```

Replace:
```json
      ],
      "weight": 1,
```
with:
```json
      ],
      "feel": {
        "light": { "time": 0.85, "startup": 0.35, "move": -0.05, "power": 0.85, "heft": 0.2 },
        "medium": { "time": 1.125, "startup": 0.475, "move": -0.125, "power": 1.225, "heft": 0.4, "speed": 1.2 },
        "heavy": { "time": 1.4, "startup": 0.6, "move": -0.2, "power": 1.6, "heft": 0.6, "speed": 1.4 },
        "hold": { "time": 1.4, "startup": 0.9, "move": -0.2, "power": 2.08, "heft": 0.8, "speed": 1.4 }
      },
      "defaultChain": ["light", "light", "heavy"],
      "weight": 1,
```

In `packages/engine/src/data/balance.json` (hand-edit), the unarmed rows go before `hero`'s `minAttackInterval` line:

Before:
```json
      "minAttackInterval": 0.2, "critCap": 75, "dodgeCap": 60, "armorK": 25, "armorCap": 80,
```
add:
```json
      "feel": {
        "light": { "time": 0.9, "startup": 0.3, "move": 0.3, "power": 1.0, "heft": 0.2 },
        "medium": { "time": 1.05, "startup": 0.325, "move": 0.4, "power": 1.15, "heft": 0.3, "knockback": 0.15 },
        "heavy": { "time": 1.2, "startup": 0.35, "move": 0.5, "power": 1.3, "heft": 0.4, "knockback": 0.3 },
        "hold": { "time": 1.2, "startup": 0.525, "move": 0.5, "power": 1.69, "heft": 0.6, "knockback": 0.3 }
      },
      "defaultChain": ["light", "light", "heavy"],
```

In `packages/engine/src/data/arpg.json` (hand-edit), each form's default chain (Bolt, Volley with its `countByKind`, Lance, Burst, Strike, then the Defensive and Ultimate forms, a single medium move each):

Before:
```json
      "text": "A bolt that bursts on the first foe it hits. Press again to chain: small, small, medium, large."
```
add:
```json
      "defaultChain": ["light", "light", "medium", "heavy"],
```

Before:
```json
      "text": "Homing darts that seek out different foes. The third press fires five."
```
add:
```json
      "defaultChain": ["medium", "medium", "medium"], "countByKind": { "light": 3, "medium": 3, "heavy": 5, "hold": 5 },
```

Before:
```json
      "text": "An instant line that hits every foe along it. The third press reaches further and hits harder."
```
add:
```json
      "defaultChain": ["medium", "medium", "heavy"],
```

Before:
```json
      "text": "An explosion where you aim. The third press is bigger."
```
add:
```json
      "defaultChain": ["medium", "medium", "heavy"],
```

Before:
```json
      "text": "An element-infused sweep in front of you. The fourth press slams everything around you."
```
add:
```json
      "defaultChain": ["medium", "medium", "medium", "heavy"],
```

Replace:
```json
      "power": 1.35, "effect": 0.25, "duration": 6, "radius": 2.6,
```
with:
```json
      "power": 1.35, "effect": 0.25, "duration": 6, "radius": 2.6, "defaultChain": ["medium"],
```

Replace:
```json
      "power": 0.65, "effect": 0.35, "duration": 8,
```
with:
```json
      "power": 0.65, "effect": 0.35, "duration": 8, "defaultChain": ["medium"],
```

Replace:
```json
      "power": 0, "effect": 0.3, "duration": 6,
```
with:
```json
      "power": 0, "effect": 0.3, "duration": 6, "defaultChain": ["medium"],
```

Replace:
```json
      "power": 0.9, "effect": 0.4, "range": 5, "radius": 0.9,
```
with:
```json
      "power": 0.9, "effect": 0.4, "range": 5, "radius": 0.9, "defaultChain": ["medium"],
```

Replace:
```json
      "power": 3.4, "radius": 5,
```
with:
```json
      "power": 3.4, "radius": 5, "defaultChain": ["medium"],
```

Before:
```json
      "text": "Seven impacts rain over the target area."
```
add:
```json
      "defaultChain": ["medium"],
```

Before:
```json
      "text": "A lingering storm at the target that hits everything inside for 6 s."
```
add:
```json
      "defaultChain": ["medium"],
```

- [ ] **Step 5: Run them to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts)`
Expected: PASS (7).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1210 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-chains.test.ts packages/engine/src/data/schemas.ts packages/engine/src/types/arpg.ts packages/engine/src/types/delve.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/types/delve.ts packages/engine/src/data/schemas.ts packages/engine/src/data/delve.json packages/engine/src/data/balance.json packages/engine/src/data/arpg.json packages/engine/tests/delve-chains.test.ts
git commit -m "feat(engine): each weapon's feel rows by kind and default chain, each form's default chain" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 2: Engine: the hero plays chains (Task 3: the fixture and the new tests)

### Task 3: The hero plays chains

The core swap, one commit because every reader of `h.abilities[slot]` moves at once. A move resolves at its kind's weight (`moveWeight`: `chains.kindWeight`, a hold's stage through `holdStageWeight`) with the chain's payment; `resolveChain` places each move (`index`, and `last` on the last of a chain of two or more) and resolves a hold move's three stages into `hold[i]` (`moves[i]` is its stage 0; holds only start firing in Task 4). `ResolvedAbility` loses `build`, `combo` and `comboCount` and carries `kind`, `weight`, `stage`, `payment`, `index` and `last`; a hold's `chargeNeed` is its stage 2's, and Volley's `count` comes from `countByKind` by kind (a hold's stages as medium, heavy, hold). The step bonus replaces `combo[step]` exactly where it was read: the power factor `1 + stepBonus × i` on `executeForm`'s hit, the size factor `1 + stepBonus × i / 2` on the Bolt's projectile and explode radius, the Lance's length, the Burst's radius, the recoil (`fire`) and the step-in (`castAbility`); `stepHeft`'s +0.2 and Strike's slam key on `last`.

The hero holds `chains: ResolvedChain[]` and `cooldowns: number[][]` (per slot and move). A press casts `pressStep`'s move: within `comboWindow` of the last landing the next (wrapping), else the first. It checks and pays that move only: its own cooldown, its cost, and for a charge chain the meter against its need, then takes the need off the meter (`pay`); a refused move doesn't advance. The meter caps at the chain's largest need (`chargeCap`: `gainCharge`, the sandbox fill, Galvanize, Nightstalker, a cancelled wind-up's refund), and `gainCharge` skips a chain while any of its moves cools. `nextMove` is the move the next press casts, `activeMove` the one winding up or (the Defensive) whose effect is up: `h.defend` gains `move` and `stage`, and a Defensive move replaces the one up (`buff()` clears the Ward, without a burst). Galvanize takes its seconds off every move of a slot; Nightstalker off the Defensive's next move. `refreshWorldHero` compares chains (`sameChain`), keeps each move's cooldown, clamps `comboStep` to a shortened chain and the charge to the new cap. `estimateCombat` averages a chain's moves, each with its step bonus.

The profile still holds v4 builds until Task 6, so the floor, the autopilot and `profilePower` turn them into chains through `buildChains` (each build's form's default chain, shifted a step lighter or heavier by its weight: `chainFromBuild`, which Task 6's migration reuses); the DPS sim does the same until Task 7.

**Files:**
- Modify: `packages/engine/src/types/ability.ts:5-8,29,38,51,130-133,165-167,177-182` (CRLF, hand-edit), `packages/engine/src/types/arpg.ts:12,67-70,302-308,319,351-352`
- Modify: `packages/engine/src/data/arpg.json:14-40` (the Primary forms; hand-edit), `packages/engine/src/data/schemas.ts:641-642`
- Modify: `packages/engine/src/arpg/abilities/resolve.ts:2-10,47-140` (CRLF, hand-edit), `cast.ts` (whole file), `forms.ts:6-190`, `defend.ts:5-121`
- Modify: `packages/engine/src/arpg/action.ts:3,102-107`, `combat.ts:22,477-481,696-700`, `world.ts:15-308`, `step.ts:22-24,140-149,203-206`, `sandbox.ts:3-45,247-258`, `bot.ts:5,98`, `dps-sim.ts:12,75`
- Modify: `packages/engine/src/delve/hero-stats.ts:2-452`, `profile.ts:29-31,130,195`, `dive.ts:11,80` (CRLF, hand-edit), `autopilot.ts:24,87` (CRLF, hand-edit), `packages/engine/src/index.ts:162,195-199`
- Modify: `packages/engine/tests/fixtures/arena.ts:7,28-38,52-56,125`
- Test: `packages/engine/tests/delve-chains.test.ts`; updated: `ability-resolve.test.ts` (whole file), `ability-forms`, `ability-cast`, `arpg-sim`, `delve-combat-weight`, `delve-training`, `delve-reactions`, `delve-stacks`, `delve-infusion`, `delve-pair`, `delve-dive`, `delve-dodge`

- [ ] **Step 1: The fixture's chains**

The fixture's builds become one-move chains (`DEFAULT_CHAINS`: a medium Fire Bolt, a medium Frost Ward, a charged medium Fire Nova, the same numbers as today's Balanced builds); `ArenaOpts.primary` etc. change a slot's one move (`{ form: 'strike' }`, `{ kind: 'heavy' }`, `{ payment: 'cast' }`) or give it whole `moves`; `moveOf(w, slot, step)` reads the hero's resolved move.

In `packages/engine/tests/fixtures/arena.ts`:

Replace:
```ts
import type { AbilityBuild, AbilityBuilds, AbilityCast } from '../../src/types/ability.js';
```
with:
```ts
import type {
  AbilityCast,
  AbilityPayment,
  AbilitySlot,
  Chain,
  Chains,
  Move,
} from '../../src/types/ability.js';
```

Replace:
```ts
export const DEFAULT_BUILDS: AbilityBuilds = {
  primary: { form: 'bolt', elements: ['fire'], weight: 0, payment: 'mana' },
  defensive: { form: 'ward', elements: ['frost'], weight: 0, payment: 'mana' },
  ultimate: { form: 'nova', elements: ['fire'], weight: 0, payment: 'charge' },
};

export interface ArenaOpts {
  equipped?: EquippedGear;
  primary?: Partial<AbilityBuild>;
  defensive?: Partial<AbilityBuild>;
  ultimate?: Partial<AbilityBuild>;
```
with:
```ts
/** The fixture's chains: one medium move each (a Fire Bolt, a Frost Ward, a charged Fire Nova). */
export const DEFAULT_CHAINS: Pick<Chains, AbilitySlot> = {
  primary: { moves: [{ kind: 'medium', form: 'bolt', elements: ['fire'] }], payment: 'mana' },
  defensive: { moves: [{ kind: 'medium', form: 'ward', elements: ['frost'] }], payment: 'mana' },
  ultimate: { moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }], payment: 'charge' },
};

/** A slot's chain in a test: its one move with these parts changed and its payment, or whole `moves`. */
export type ChainOpts = Partial<Move> & { payment?: AbilityPayment; moves?: Move[] };

export function chainOf(base: Chain, o: ChainOpts = {}): Chain {
  const { payment = base.payment, moves, ...move } = o;
  return { moves: moves ?? [{ ...base.moves[0], ...move }], payment };
}

/** The fixture's chains, with each slot's changes (see `ChainOpts`). */
export function chainsWith(
  o: Partial<Record<AbilitySlot, ChainOpts>> = {},
): Pick<Chains, AbilitySlot> {
  return {
    primary: chainOf(DEFAULT_CHAINS.primary, o.primary),
    defensive: chainOf(DEFAULT_CHAINS.defensive, o.defensive),
    ultimate: chainOf(DEFAULT_CHAINS.ultimate, o.ultimate),
  };
}

export interface ArenaOpts {
  equipped?: EquippedGear;
  primary?: ChainOpts;
  defensive?: ChainOpts;
  ultimate?: ChainOpts;
```

Replace:
```ts
    abilities: {
      primary: { ...DEFAULT_BUILDS.primary, ...opts.primary },
      defensive: { ...DEFAULT_BUILDS.defensive, ...opts.defensive },
      ultimate: { ...DEFAULT_BUILDS.ultimate, ...opts.ultimate },
    },
```
with:
```ts
    chains: chainsWith(opts),
```

Replace:
```ts
export function damaged(m: MonsterEntity): boolean {
```
with:
```ts
/** The slot's move `step` (its first by default), as the hero resolved it. */
export function moveOf(w: ArpgWorld, slot: number, step = 0) {
  return w.hero.chains[slot].moves[step];
}

export function damaged(m: MonsterEntity): boolean {
```

- [ ] **Step 2: The new tests**

Resolving a chain (each move at its kind's weight with the chain's payment and a hold's three stages, Volley's darts by kind, each move's charge need and the meter's cap, a new hero's default chains) and chain play (stepping and wrapping with the step bonus on power and size, a pause restarting, per-move payment and cooldowns, a refused move not advancing, Ward → Blink, Galvanize and Nightstalker, the charge meter's cap and lockout, a shortened chain clamping the step, the bot flowing through its Primary chain).

In `packages/engine/tests/delve-chains.test.ts`:

Replace:
```ts
import { CHAIN_SKILLS, MAX_CHAIN, MOVE_KINDS, type MoveKind } from '../src/types/ability.js';
import type { ComboStepDef } from '../src/types/delve.js';
import { bal, registry } from './fixtures/arena.js';

// See the moves and chains spec.
```
with:
```ts
import { activeMove, nextMove } from '../src/arpg/abilities/cast.js';
import { defendingAbility, gainCharge } from '../src/arpg/abilities/defend.js';
import {
  chargeCap,
  defaultBasic,
  defaultChains,
  resolveAbility,
  resolveChain,
} from '../src/arpg/abilities/resolve.js';
import { botInput } from '../src/arpg/bot.js';
import { applyStatus, hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import {
  CHAIN_SKILLS,
  MAX_CHAIN,
  MOVE_KINDS,
  type FormId,
  type Move,
  type MoveKind,
} from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { ComboStepDef } from '../src/types/delve.js';
import type { ManaType } from '../src/types/mana.js';
import {
  STEP,
  arena,
  bal,
  chainsWith,
  dummy,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
} from './fixtures/arena.js';

// See the moves and chains spec. The fixture arena's hero stands at (13, 36) facing up (−y);
// `dummy(x, y)` is a sturdy Fire foe that doesn't fight back.

/** A move of `form` (a Bolt by default) of `kind`, in Fire unless given. */
const m = (kind: MoveKind, form: FormId = 'bolt', elements: ManaType[] = ['fire']): Move => ({
  kind,
  form,
  elements,
});
const WINDOW = bal.abilities.comboWindow;
```

Replace:
```ts
    });
  });
});
```
with:
```ts
    });
  });
});

describe('resolving a chain', () => {
  const stats = computeHeroStats({}, registry);

  it("resolves each move at its kind's weight with the chain's payment, and a hold's three stages", () => {
    const moves = [m('light'), m('medium'), m('heavy'), m('hold')];
    const chain = resolveChain(registry, stats, 'primary', { moves, payment: 'cast' });
    expect(chain.payment).toBe('cast');
    expect(chain.moves.map((ab) => [ab.kind, ab.weight, ab.payment, ab.index, ab.last])).toEqual([
      ['light', -1, 'cast', 0, false],
      ['medium', 0, 'cast', 1, false],
      ['heavy', 1, 'cast', 2, false],
      ['hold', 0, 'cast', 3, true],
    ]);
    chain.moves.forEach((ab, i) =>
      expect(ab.power).toBeCloseTo(
        resolveAbility(registry, 'primary', moves[i], 'cast', stats).power,
      ),
    );
    expect(chain.hold.slice(0, 3)).toEqual([null, null, null]);
    const stages = chain.hold[3]!;
    expect(stages.map((ab) => [ab.weight, ab.stage, ab.index, ab.last])).toEqual([
      [0, 0, 3, true],
      [1, 1, 3, true],
      [2, 2, 3, true],
    ]);
    // A hold move's own row is its stage 0.
    expect(chain.moves[3]).toEqual(stages[0]);
  });

  it("fires Volley's darts by kind: a hold's stages fire a medium's, a heavy's and a hold's", () => {
    const moves = MOVE_KINDS.map((kind) => m(kind, 'volley'));
    const chain = resolveChain(registry, stats, 'primary', { moves, payment: 'mana' });
    expect(chain.moves.map((ab) => ab.count)).toEqual([3, 3, 5, 3]);
    expect(chain.hold[3]!.map((ab) => ab.count)).toEqual([3, 5, 5]);
  });

  it("needs each move's own charge (a hold's is its stage 2's), and the meter holds the largest", () => {
    const moves = [m('light', 'nova'), m('hold', 'nova')];
    const chain = resolveChain(registry, stats, 'ultimate', { moves, payment: 'charge' });
    const A = bal.abilities;
    const need = (w: number) => A.slots.ultimate.cost * (1 + A.weight.cost * w) * A.chargeRatio;
    expect(chain.moves[0].chargeNeed).toBeCloseTo(need(-1));
    for (const ab of [chain.moves[1], ...chain.hold[1]!])
      expect(ab.chargeNeed).toBeCloseTo(need(2));
    expect(chargeCap(chain)).toBeCloseTo(need(2));
  });

  it("gives a new hero each form's default chain with today's payments, and the weapon's basics", () => {
    const moves = (form: FormId) =>
      registry.getForm(form).defaultChain.map((kind) => m(kind, form, ['frost']));
    expect(defaultChains(registry, 'frost', 'maul')).toEqual({
      basic: [
        { kind: 'medium', element: 'frost' },
        { kind: 'heavy', element: 'frost' },
      ],
      primary: { moves: moves('bolt'), payment: 'mana' },
      defensive: { moves: moves('ward'), payment: 'mana' },
      ultimate: { moves: moves('nova'), payment: 'charge' },
    });
    expect(defaultChains(registry, 'frost', null).primary.moves.map((x) => x.kind)).toEqual([
      'light',
      'light',
      'medium',
      'heavy',
    ]);
    // The default basics on a pair: the last blow the secondary once one is bound.
    expect(defaultBasic(registry, 'sword', 'fire', 'storm')).toEqual([
      { kind: 'light', element: 'fire' },
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'storm' },
    ]);
    expect(defaultBasic(registry, null, 'nature').map((b) => b.kind)).toEqual(
      bal.hero.defaultChain,
    );
  });
});

describe('chain play', () => {
  it('steps through the chain and wraps, each move landing with its step bonus; a pause restarts', () => {
    const bolt = m('medium');
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      primary: { moves: [bolt, bolt, bolt, bolt] },
    });
    const shots: { damage: number; size: number }[] = [];
    const next: number[] = [];
    for (let i = 0; i < 5; i++) {
      next.push(nextMove(w.hero, 0, w.t, WINDOW).index);
      press(w, 0);
      const p = w.projectiles.at(-1)!;
      shots.push({ damage: p.damage, size: p.explodeRadius });
      run(w, 0.1);
    }
    expect(next).toEqual([0, 1, 2, 3, 0]);
    const sb = bal.chains.stepBonus;
    [0, 1, 2, 3, 0].forEach((i, k) => {
      expect(shots[k].damage / shots[0].damage).toBeCloseTo(1 + sb * i);
      expect(shots[k].size / shots[0].size).toBeCloseTo(1 + (sb * i) / 2);
    });
    run(w, WINDOW + 0.1);
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(0);
    press(w, 0);
    expect(w.hero.comboStep[0]).toBe(0);
  });

  it("each move pays its own cost and sets its own cooldown; a press waits only for the next move's", () => {
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      primary: { moves: [m('light'), m('heavy')] },
    });
    w.hero.manaRegen = 0;
    const [light, heavy] = w.hero.chains[0].moves;
    let mana = w.hero.mana;
    const t0 = w.t + STEP; // the press lands in the next step
    press(w, 0);
    expect(mana - w.hero.mana).toBeCloseTo(light.cost);
    expect(w.hero.cooldowns[0]).toEqual([t0 + light.cooldown, 0].map((c) => expect.closeTo(c, 6)));
    // The heavy is ready while the light cools.
    mana = w.hero.mana;
    press(w, 0);
    expect(w.hero.comboStep[0]).toBe(1);
    expect(mana - w.hero.mana).toBeCloseTo(heavy.cost);
    expect(w.hero.cooldowns[0][1]).toBeGreaterThan(w.t);
    // Its next move (the light, wrapped to) cooling: the press waits.
    w.hero.cooldowns[0][0] = w.t + 5;
    pressOnly(w, 0);
    expect(w.hero.windup).toBeNull();
    expect(w.queuedCast).not.toBeNull();
  });

  it("refuses a move it can't afford (noMana), and the chain doesn't advance", () => {
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      primary: { moves: [m('light'), m('heavy')] },
    });
    w.hero.manaRegen = 0;
    press(w, 0);
    w.hero.mana = moveOf(w, 0, 1).cost - 1;
    const events = press(w, 0);
    expect(events.some((e) => e.kind === 'noMana' && e.slot === 0)).toBe(true);
    expect(w.hero.comboStep[0]).toBe(0);
    w.hero.mana = w.hero.manaMax;
    press(w, 0);
    expect(w.hero.comboStep[0]).toBe(1);
  });

  it("a Ward → Blink chain's second press puts the Blink up in the Ward's place, without a burst", () => {
    const w = arena([dummy(13, 20)], {
      noBasic: true,
      defensive: { moves: [m('medium', 'ward', ['frost']), m('medium', 'blink', ['frost'])] },
    });
    press(w, 1);
    expect(w.hero.ward).not.toBeNull();
    expect(w.hero.defend).toMatchObject({ form: 'ward', move: 0, stage: 0 });
    const events = press(w, 1, { x: 13, y: 20 });
    expect(w.hero.defend).toMatchObject({ form: 'blink', move: 1, stage: 0 });
    expect(w.hero.ward).toBeNull();
    expect(events.map((e) => e.kind)).not.toContain('wardBreak');
    expect(defendingAbility(makeCtx(registry, w, []))?.form.id).toBe('blink');
    expect(activeMove(w.hero, 1)?.index).toBe(1);
  });

  it("Galvanize takes its seconds off every move of a slot; Nightstalker off the Defensive's next move", () => {
    const w = arena([dummy(13, 30), dummy(15, 30)], {
      noBasic: true,
      primary: { moves: [m('light'), m('medium'), m('heavy')] },
      defensive: { moves: [m('medium', 'ward'), m('medium', 'armor')] },
    });
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    const h = w.hero;
    const t = w.t;
    const g = bal.reactions.galvanizeSeconds;
    h.cooldowns[0] = [t + 2, t + 0.5, t + 3];
    applyStatus(ctx, w.monsters[0], 'shock', 0);
    hitMonster(ctx, w.monsters[0], 10, 'nature', { source: 'skill' });
    expect(events.some((e) => e.kind === 'reaction' && e.reaction === 'galvanize')).toBe(true);
    expect(h.cooldowns[0]).toEqual([t + 2 - g, t, t + 3 - g]);

    h.stats.legendaries.nightstalker = 30;
    h.cooldowns[1] = [t + 5, t + 5];
    h.comboStep[1] = 0;
    h.comboAt[1] = t; // the Ward just landed: the Armor is next
    killMonster(ctx, w.monsters[1]);
    expect(h.cooldowns[1]).toEqual([t + 5, t + 4]);
  });

  it("caps the charge at the chain's largest need, pays per move, and doesn't fill while a move cools", () => {
    // A dummy in reach keeps the lull from charging.
    const w = arena([dummy(13, 33)], {
      noBasic: true,
      ultimate: { moves: [m('light', 'nova'), m('heavy', 'nova')], payment: 'charge' },
    });
    const ctx = makeCtx(registry, w, []);
    const [light, heavy] = w.hero.chains[2].moves;
    gainCharge(ctx, 1e9);
    expect(w.hero.charge[2]).toBeCloseTo(heavy.chargeNeed);
    press(w, 2);
    expect(w.hero.charge[2]).toBeCloseTo(heavy.chargeNeed - light.chargeNeed);
    // The light's lockout runs: nothing charges the slot meanwhile, and the heavy can't be paid.
    gainCharge(ctx, 5);
    expect(w.hero.charge[2]).toBeCloseTo(heavy.chargeNeed - light.chargeNeed);
    expect(nextMove(w.hero, 2, w.t, WINDOW).index).toBe(1);
    pressOnly(w, 2);
    expect(w.hero.windup).toBeNull();
    w.hero.cooldowns[2][0] = w.t;
    gainCharge(ctx, 5);
    expect(w.hero.charge[2]).toBeCloseTo(heavy.chargeNeed - light.chargeNeed + 5);
  });

  it("a shortened chain clamps the step, and each move's cooldown carries over", () => {
    const bolt = m('medium');
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { moves: [bolt, bolt, bolt] } });
    for (let i = 0; i < 3; i++) {
      press(w, 0);
      run(w, 0.05);
    }
    expect(w.hero.comboStep[0]).toBe(2);
    const cooling = w.hero.cooldowns[0][1];
    refreshWorldHero(registry, w, w.hero.stats, chainsWith({ primary: { moves: [bolt, bolt] } }));
    expect(w.hero.comboStep[0]).toBe(1);
    expect(w.hero.cooldowns[0]).toEqual([expect.any(Number), cooling]);
  });

  it('the bot flows through its Primary chain', () => {
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      primary: { moves: [m('light'), m('light'), m('medium'), m('heavy')] },
    });
    w.hero.cooldowns[1] = [1e9];
    w.hero.cooldowns[2] = [1e9];
    const steps = new Set<number>();
    for (let i = 0; i < Math.round(4 / STEP); i++)
      for (const e of stepWorld(registry, w, botInput(registry, w), STEP))
        if (e.kind === 'cast' && e.slot === 0) steps.add(w.hero.comboStep[0]);
    expect([...steps].sort()).toEqual([0, 1, 2, 3]);
  });
});
```

- [ ] **Step 3: The resolve, forms, cast and sim tests**

`ability-resolve.test.ts` resolves moves instead of builds (a weight is a kind now; Swift and Crushing are a hold's stages or gone) and gains the chain's step bonus:

Replace the whole of `packages/engine/tests/ability-resolve.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { mergeKnobs, resolveAbility } from '../src/arpg/abilities/resolve.js';
import type { Move } from '../src/types/ability.js';
import type { HeroStats } from '../src/types/delve.js';

const registry = createDefaultRegistry();
const ab = registry.getDelveBalance().abilities;
const bare = computeHeroStats({}, registry);

/** A medium Fire Bolt, with these parts changed. */
function move(over: Partial<Move> = {}): Move {
  return { kind: 'medium', form: 'bolt', elements: ['fire'], ...over };
}

function withStats(over: Partial<HeroStats>): HeroStats {
  return { ...bare, ...over };
}

describe('resolveAbility', () => {
  it('resolves a medium mana Fire Bolt from the slot numbers and the form', () => {
    const bolt = registry.getForm('bolt');
    const r = resolveAbility(registry, 'primary', move(), 'mana', bare);
    expect(r.name).toBe('Fire Bolt');
    expect(r.cost).toBeCloseTo(ab.slots.primary.cost);
    expect(r.cooldown).toBeCloseTo(ab.slots.primary.cooldown);
    expect(r.channel).toBe(0);
    expect(r.chargeNeed).toBe(0);
    expect(r.power).toBeCloseTo(bolt.power);
    expect(r.knobs.area).toBeCloseTo(1.3);
    expect(r.radius).toBeCloseTo(bolt.radius! * 1.3);
    expect(r.knobs.applies).toEqual(['burn']);
    expect(r).toMatchObject({ kind: 'medium', weight: 0, stage: 0, payment: 'mana', index: 0 });
    expect(r.last).toBe(false);
  });

  it("a kind's weight trades power and size for cost, cooldown and speed", () => {
    const base = resolveAbility(registry, 'primary', move(), 'mana', bare);
    const heavy = resolveAbility(registry, 'primary', move({ kind: 'heavy' }), 'mana', bare);
    expect(heavy.weight).toBe(1);
    expect(heavy.power / base.power).toBeCloseTo(1 + ab.weight.power);
    expect(heavy.cost / base.cost).toBeCloseTo(1 + ab.weight.cost);
    expect(heavy.cooldown / base.cooldown).toBeCloseTo(1 + ab.weight.cooldown);
    expect(heavy.speed / base.speed).toBeCloseTo(1 - ab.weight.speed);
    expect(heavy.radius / base.radius).toBeCloseTo(1 + ab.weight.size);
    const light = resolveAbility(registry, 'primary', move({ kind: 'light' }), 'mana', bare);
    expect(light.weight).toBe(-1);
    expect(light.power).toBeLessThan(base.power);
    expect(light.cost).toBeLessThan(base.cost);
  });

  it('cast payment halves the cost, adds power and a wind-up', () => {
    const nova = (kind: Move['kind'], payment: 'mana' | 'cast') =>
      resolveAbility(registry, 'ultimate', move({ form: 'nova', kind }), payment, bare);
    const base = nova('medium', 'mana');
    const cast = nova('heavy', 'cast');
    const heavyMana = nova('heavy', 'mana');
    expect(cast.cost).toBeCloseTo(heavyMana.cost * ab.castManaMult);
    expect(cast.power).toBeCloseTo(heavyMana.power * ab.castPowerMult);
    expect(cast.channel).toBeCloseTo(ab.slots.ultimate.castTime * (1 + ab.weight.castTime));
    expect(base.channel).toBe(0);
  });

  it('charge payment costs no mana and needs a charge meter instead of a cooldown', () => {
    const r = resolveAbility(registry, 'ultimate', move({ form: 'nova' }), 'charge', bare);
    expect(r.cost).toBe(0);
    expect(r.chargeNeed).toBeCloseTo(ab.slots.ultimate.cost * ab.chargeRatio);
    expect(r.cooldown).toBeCloseTo(ab.chargeLockout);
  });

  it('Fire + Nature is Wildfire: bigger, harsher, scattered, leaves burning ground', () => {
    const r = resolveAbility(
      registry,
      'primary',
      move({ form: 'burst', elements: ['fire', 'nature'] }),
      'mana',
      bare,
    );
    const burst = registry.getForm('burst');
    expect(r.name).toBe('Wildfire Burst');
    expect(r.fusion?.id).toBe('wildfire');
    expect(r.element).toBe('fire');
    expect(r.knobs.area).toBeCloseTo(1.3 * 1.4);
    expect(r.power).toBeCloseTo(burst.power * 1.15);
    expect(r.knobs.applies).toEqual(['burn', 'poison']);
    expect(r.knobs.scatter).toBeGreaterThan(0);
    expect(r.knobs.zone).not.toBeNull();
  });

  it('the first element is the damage element', () => {
    const r = resolveAbility(
      registry,
      'primary',
      move({ elements: ['nature', 'fire'] }),
      'mana',
      bare,
    );
    expect(r.element).toBe('nature');
    expect(r.name).toBe('Wildfire Bolt');
    expect(r.knobs.applies).toEqual(['poison', 'burn']);
  });

  it('attunement in the ability elements powers it, averaged', () => {
    const per = registry.getDelveBalance().mana.powerPerAttune;
    const stats = withStats({ attunement: { ...bare.attunement, fire: 4 } });
    const fire = resolveAbility(registry, 'primary', move(), 'mana', stats);
    const fusion = resolveAbility(
      registry,
      'primary',
      move({ elements: ['fire', 'storm'] }),
      'mana',
      stats,
    );
    const bolt = registry.getForm('bolt').power;
    expect(fire.power).toBeCloseTo(bolt * (1 + per * 4));
    expect(fusion.power).toBeCloseTo(bolt * (1 + per * 2));
  });

  it('Manaweaver cuts mana costs, and cooldown reduction cuts cooldowns', () => {
    const r = resolveAbility(
      registry,
      'primary',
      move(),
      'mana',
      withStats({ legendaries: { manaweaver: 30 }, cooldownMult: 0.8 }),
    );
    expect(r.cost).toBeCloseTo(ab.slots.primary.cost * 0.7);
    expect(r.cooldown).toBeCloseTo(ab.slots.primary.cooldown * 0.8);
  });

  it('Stormcaller adds chains to Storm abilities; Bedrock grows and staggers Earth ones', () => {
    const storm = resolveAbility(
      registry,
      'primary',
      move({ elements: ['storm'] }),
      'mana',
      withStats({ legendaries: { stormcaller: 3 } }),
    );
    expect(storm.knobs.chain).toBe(4);
    const earth = resolveAbility(
      registry,
      'primary',
      move({ form: 'burst', elements: ['frost', 'earth'] }),
      'mana',
      withStats({ legendaries: { bedrock: 30 } }),
    );
    const plain = resolveAbility(
      registry,
      'primary',
      move({ form: 'burst', elements: ['frost', 'earth'] }),
      'mana',
      bare,
    );
    expect(earth.radius / plain.radius).toBeCloseTo(1.4);
  });

  it("defensive forms scale their effect with the kind's weight", () => {
    const ward = (kind: Move['kind']) =>
      resolveAbility(
        registry,
        'defensive',
        move({ form: 'ward', elements: ['frost'], kind }),
        'mana',
        bare,
      );
    expect(ward('medium').effect).toBeCloseTo(registry.getForm('ward').effect!);
    expect(ward('heavy').effect / ward('medium').effect).toBeCloseTo(1 + ab.weight.power);
  });

  it('rejects a form from another slot', () => {
    expect(() =>
      resolveAbility(registry, 'primary', move({ form: 'nova' }), 'mana', bare),
    ).toThrow();
  });
});

describe('mergeKnobs', () => {
  it('multiplies, adds, ORs, unions and keeps the longer zone', () => {
    const k = mergeKnobs(
      {
        power: 1.2,
        area: 1.5,
        chain: 1,
        lifesteal: 0.05,
        applies: ['burn'],
        zone: { seconds: 2, tickPower: 0.3 },
      },
      {
        power: 0.5,
        area: 2,
        chain: 2,
        lifesteal: 0.05,
        pierce: true,
        applies: ['burn', 'poison'],
        zone: { seconds: 3, tickPower: 0.1 },
      },
    );
    expect(k.power).toBeCloseTo(0.6);
    expect(k.area).toBeCloseTo(3);
    expect(k.chain).toBe(3);
    expect(k.lifesteal).toBeCloseTo(0.1);
    expect(k.pierce).toBe(true);
    expect(k.pull).toBe(false);
    expect(k.applies).toEqual(['burn', 'poison']);
    expect(k.zone).toEqual({ seconds: 3, tickPower: 0.1 });
  });

  it('defaults to neutral knobs', () => {
    expect(mergeKnobs()).toEqual({
      power: 1,
      area: 1,
      applies: [],
      chain: 0,
      pierce: false,
      knockback: 0,
      lifesteal: 0,
      zone: null,
      pull: false,
      execute: 0,
      scatter: 0,
      spread: false,
    });
  });
});
```

In `packages/engine/tests/ability-forms.test.ts`, the press-combo tests become chain tests (the Bolt's default chain, Volley's darts by kind, Strike's slam on a chain's last move):

Replace:
```ts
import { arena, damaged, dummy, gear, press, registry, run } from './fixtures/arena.js';
```
with:
```ts
import {
  arena,
  bal,
  damaged,
  dummy,
  gear,
  moveOf,
  press,
  registry,
  run,
} from './fixtures/arena.js';
```

Replace:
```ts
  it('Bolt combos go small, small, medium, large, then reset after the window', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    const ab = w.hero.abilities[0];
    const sizes: number[] = [];
    for (let i = 0; i < 5; i++) {
      press(w, 0);
      sizes.push(w.projectiles.at(-1)!.explodeRadius / ab.radius);
      run(w, ab.cooldown + 0.05);
    }
    expect(sizes.map((s) => +s.toFixed(2))).toEqual([0.8, 0.8, 1, 1.5, 0.8]);
    run(w, registry.getDelveBalance().abilities.comboWindow + 0.1);
```
with:
```ts
  it("Bolt's default chain goes light, light, medium, heavy, each bigger by its step, then wraps", () => {
    const moves = registry.getForm('bolt').defaultChain.map((kind) => ({
      kind,
      form: 'bolt' as const,
      elements: ['fire' as const],
    }));
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { moves } });
    const sizes: number[] = [];
    for (let i = 0; i < 5; i++) {
      press(w, 0);
      sizes.push(w.projectiles.at(-1)!.explodeRadius);
      run(w, 0.1);
    }
    const step = (i: number) => 1 + (bal.chains.stepBonus * i) / 2;
    expect(sizes).toEqual([0, 1, 2, 3, 0].map((i) => moveOf(w, 0, i).radius * step(i)));
    expect(sizes[3]).toBeGreaterThan(sizes[2]);
    expect(sizes[2]).toBeGreaterThan(sizes[1]);
    run(w, bal.abilities.comboWindow + 0.1);
```

Replace:
```ts
  it("Strike's fourth press slams everything around the hero", () => {
    const w = arena([dummy(13, 34.4), dummy(13, 37.8)], {
      noBasic: true,
      primary: { form: 'strike' },
    });
    const behind = w.monsters[1];
    for (let i = 0; i < 3; i++) {
      press(w, 0);
      run(w, w.hero.abilities[0].cooldown + 0.05);
```
with:
```ts
  it('the last move of a Strike chain slams everything around the hero', () => {
    const moves = registry.getForm('strike').defaultChain.map((kind) => ({
      kind,
      form: 'strike' as const,
      elements: ['fire' as const],
    }));
    const w = arena([dummy(13, 34.4), dummy(13, 37.8)], { noBasic: true, primary: { moves } });
    const behind = w.monsters[1];
    for (let i = 0; i < 3; i++) {
      press(w, 0);
      run(w, 0.1);
```

In `packages/engine/tests/ability-cast.test.ts`, cooldowns and charge are per move:

Before:
```ts
  press,
```
add:
```ts
  moveOf,
```

Replace:
```ts
    const cost = w.hero.abilities[0].cost;
```
with:
```ts
    const cost = moveOf(w, 0).cost;
```

Replace:
```ts
    run(w, w.hero.abilities[0].cooldown);
```
with:
```ts
    run(w, moveOf(w, 0).cooldown);
```

Replace:
```ts
    const castTime = w.hero.abilities[2].castTime;
```
with:
```ts
    const castTime = moveOf(w, 2).castTime;
```

Replace:
```ts
    const events = run(w, w.hero.abilities[0].castTime + 0.1);
```
with:
```ts
    const events = run(w, moveOf(w, 0).castTime + 0.1);
```

Replace:
```ts
    const need = w.hero.abilities[2].chargeNeed;
```
with:
```ts
    const need = moveOf(w, 2).chargeNeed;
```

In `packages/engine/tests/arpg-sim.test.ts`:

Replace:
```ts
import { DEFAULT_BUILDS } from './fixtures/arena.js';
```
with:
```ts
import { DEFAULT_CHAINS, moveOf } from './fixtures/arena.js';
```

Replace:
```ts
    abilities: DEFAULT_BUILDS,
```
with:
```ts
    chains: DEFAULT_CHAINS,
```

Replace:
```ts
    expect(run(w, w.hero.abilities[0].castTime + STEP).some((e) => e.kind === 'cast')).toBe(true);
```
with:
```ts
    expect(run(w, moveOf(w, 0).castTime + STEP).some((e) => e.kind === 'cast')).toBe(true);
```

---

## Chunk 3: Engine: the hero plays chains (Task 3 continued: the combat, sandbox and reaction tests)

- [ ] **Step 4: The combat-weight tests**

Builds become moves: a Swift build is a light move now (weight −1, so its conjure is 0.08 s, not 0.04 s), a Crushing one a hold's full charge (`resolve(…, 'hold', …, stage 2)`); press-combo steps become chain moves (`moveOf`, a two-move chain for "the move is chosen at the press"), and `stepHeft` takes the move alone:

In `packages/engine/tests/delve-combat-weight.test.ts`:

Replace:
```ts
import { resolveAbility, stepHeft } from '../src/arpg/abilities/resolve.js';
import type { AbilityBuild, AbilitySlot } from '../src/types/ability.js';
```
with:
```ts
import { resolveAbility, resolveChain, stepHeft } from '../src/arpg/abilities/resolve.js';
import type { AbilityPayment, AbilitySlot, Move } from '../src/types/ability.js';
```

Replace:
```ts
  DEFAULT_BUILDS,
  dodge,
  dummy,
  gear,
```
with:
```ts
  DEFAULT_CHAINS,
  dodge,
  dummy,
  gear,
  moveOf,
```

Replace:
```ts
const resolve = (slot: AbilitySlot, b: Partial<AbilityBuild> & Pick<AbilityBuild, 'form'>) =>
  resolveAbility(registry, slot, { elements: ['fire'], weight: 0, payment: 'mana', ...b }, stats);

describe('ability timing from weight', () => {
  it('conjure grows with weight and by slot; cast payment adds its channel', () => {
    expect(resolve('primary', { form: 'bolt', weight: -2 }).conjure).toBeCloseTo(0.04);
    const crushing = resolve('primary', { form: 'bolt', weight: 2 });
    expect(crushing.conjure).toBeCloseTo(0.38);
    expect(crushing.channel).toBe(0);
    expect(resolve('defensive', { form: 'ward' }).conjure).toBeCloseTo(0.07);
    expect(resolve('ultimate', { form: 'nova', payment: 'charge' }).conjure).toBeCloseTo(0.224);
    const cast = resolve('primary', { form: 'bolt', payment: 'cast' });
```
with:
```ts
/** One move (a medium one of Fire unless changed); a hold at `stage`. */
const resolve = (
  slot: AbilitySlot,
  m: Partial<Move> & Pick<Move, 'form'>,
  payment: AbilityPayment = 'mana',
  stage = 0,
) =>
  resolveAbility(
    registry,
    slot,
    { kind: 'medium', elements: ['fire'], ...m },
    payment,
    stats,
    stage,
  );

describe("ability timing from the kind's weight", () => {
  it('conjure grows with weight and by slot; cast payment adds its channel', () => {
    expect(resolve('primary', { form: 'bolt', kind: 'light' }).conjure).toBeCloseTo(0.08);
    // A hold's full charge resolves at Crushing (+2).
    const crushing = resolve('primary', { form: 'bolt', kind: 'hold' }, 'mana', 2);
    expect(crushing.conjure).toBeCloseTo(0.38);
    expect(crushing.channel).toBe(0);
    expect(resolve('defensive', { form: 'ward' }).conjure).toBeCloseTo(0.07);
    expect(resolve('ultimate', { form: 'nova' }, 'charge').conjure).toBeCloseTo(0.224);
    const cast = resolve('primary', { form: 'bolt' }, 'cast');
```

Replace:
```ts
  it('heft and the heavy payoff come from weight', () => {
    const swift = resolve('primary', { form: 'bolt', weight: -2 });
    const crushing = resolve('primary', { form: 'bolt', weight: 2 });
    expect(swift.heft).toBeCloseTo(0.15);
    expect(swift.heavyKnockback).toBe(0);
    expect(swift.heavyStagger).toBe(false);
    expect(crushing.heft).toBeCloseTo(1);
    expect(crushing.heavyKnockback).toBeCloseTo(0.5);
    expect(crushing.heavyStagger).toBe(true);
    expect(resolve('primary', { form: 'bolt', weight: 1 }).heavyStagger).toBe(false);
    expect(resolve('ultimate', { form: 'nova', weight: 2, payment: 'charge' }).heft).toBeCloseTo(1);
    const bolt = resolve('primary', { form: 'bolt' });
    expect(stepHeft(bolt, 0)).toBeCloseTo(0.45);
    expect(stepHeft(bolt, bolt.combo.length - 1)).toBeCloseTo(0.65);
    // One-press forms get no last-press bonus; ultimates +0.2.
    expect(stepHeft(resolve('ultimate', { form: 'nova', payment: 'charge' }), 0)).toBeCloseTo(0.65);
```
with:
```ts
  it('heft and the heavy payoff come from weight; the last move of a chain lands harder', () => {
    const light = resolve('primary', { form: 'bolt', kind: 'light' });
    const crushing = resolve('primary', { form: 'bolt', kind: 'hold' }, 'mana', 2);
    expect(light.heft).toBeCloseTo(0.3);
    expect(light.heavyKnockback).toBe(0);
    expect(light.heavyStagger).toBe(false);
    expect(crushing.heft).toBeCloseTo(1);
    expect(crushing.heavyKnockback).toBeCloseTo(0.5);
    expect(crushing.heavyStagger).toBe(true);
    expect(resolve('primary', { form: 'bolt', kind: 'heavy' }).heavyStagger).toBe(false);
    expect(resolve('ultimate', { form: 'nova', kind: 'hold' }, 'charge', 2).heft).toBeCloseTo(1);
    const bolt: Move = { kind: 'medium', form: 'bolt', elements: ['fire'] };
    const two = resolveChain(registry, stats, 'primary', { moves: [bolt, bolt], payment: 'mana' });
    expect(stepHeft(two.moves[0])).toBeCloseTo(0.45);
    expect(stepHeft(two.moves[1])).toBeCloseTo(0.65);
    // A one-move chain gets no last-move bonus; ultimates +0.2.
    expect(stepHeft(resolve('primary', { form: 'bolt' }))).toBeCloseTo(0.45);
    expect(stepHeft(resolve('ultimate', { form: 'nova' }, 'charge'))).toBeCloseTo(0.65);
```

Replace:
```ts
    expect(resolve('primary', { form: 'bolt', weight: 2 }).motion).toBeCloseTo(-0.24);
```
with:
```ts
    expect(resolve('primary', { form: 'bolt', kind: 'hold' }, 'mana', 2).motion).toBeCloseTo(-0.24);
```

Replace:
```ts
      computeHeroStats({ weapon: gear('fire') }, registry),
      DEFAULT_BUILDS,
```
with:
```ts
      computeHeroStats({ weapon: gear('fire') }, registry),
      DEFAULT_CHAINS,
```

Replace:
```ts
      DEFAULT_BUILDS,
```
with:
```ts
      DEFAULT_CHAINS,
```

Replace:
```ts
    expect(wu.until - wu.start).toBeCloseTo(w.hero.abilities[0].conjure, 5);
    const c = arena([dummy(13, 30)], { noBasic: true, primary: { payment: 'cast' } });
    pressOnly(c, 0);
    const ab = c.hero.abilities[0];
```
with:
```ts
    expect(wu.until - wu.start).toBeCloseTo(moveOf(w, 0).conjure, 5);
    const c = arena([dummy(13, 30)], { noBasic: true, primary: { payment: 'cast' } });
    pressOnly(c, 0);
    const ab = moveOf(c, 0);
```

Replace:
```ts
    expect(casts).toBe(Math.floor(2 / w.hero.abilities[0].cooldown));
  });

  it('the press-combo step is chosen at the press', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
```
with:
```ts
    expect(casts).toBe(Math.floor(2 / moveOf(w, 0).cooldown));
  });

  it("the chain's move is chosen at the press", () => {
    const bolt = DEFAULT_CHAINS.primary.moves[0];
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { moves: [bolt, bolt] } });
```

Replace:
```ts
    const bolt = w.hero.abilities[0];
    expect(w.hero.y - y0).toBeCloseTo(-bolt.motion * bolt.combo[0], 2);
```
with:
```ts
    expect(w.hero.y - y0).toBeCloseTo(-moveOf(w, 0).motion, 2);
```

Replace:
```ts
    const bolt = w.hero.abilities[0];
```
with:
```ts
    const bolt = moveOf(w, 0);
```

Replace:
```ts
    expect(w.hero.y - y0).toBeCloseTo(-bolt.motion * bolt.combo[0], 5);
```
with:
```ts
    expect(w.hero.y - y0).toBeCloseTo(-bolt.motion, 5);
```

Replace:
```ts
    const ab = w.hero.abilities[0];
```
with:
```ts
    const ab = moveOf(w, 0);
```

Replace:
```ts
    expect(slash && slash.kind === 'slash' && slash.heft).toBeCloseTo(
      stepHeft(w.hero.abilities[0], 0),
    );
```
with:
```ts
    expect(slash && slash.kind === 'slash' && slash.heft).toBeCloseTo(stepHeft(moveOf(w, 0)));
```

Replace:
```ts
    w.hero.cooldowns[0] = w.t + 5;
    pressOnly(w, 0);
    expect(w.hero.swing).not.toBeNull();
    w.hero.cooldowns[0] = 0;
```
with:
```ts
    w.hero.cooldowns[0][0] = w.t + 5;
    pressOnly(w, 0);
    expect(w.hero.swing).not.toBeNull();
    w.hero.cooldowns[0][0] = 0;
```

Replace:
```ts
    w.hero.cooldowns[0] = w.t + 1.5 * STEP;
```
with:
```ts
    w.hero.cooldowns[0][0] = w.t + 1.5 * STEP;
```

Replace:
```ts
    w.hero.cooldowns[0] = w.t + 0.5;
```
with:
```ts
    w.hero.cooldowns[0][0] = w.t + 0.5;
```

Replace:
```ts
    w.hero.cooldowns[0] = sw.strikeAt + STEP;
```
with:
```ts
    w.hero.cooldowns[0][0] = sw.strikeAt + STEP;
```

Replace:
```ts
    const ult = w.hero.abilities[2];
```
with:
```ts
    const ult = moveOf(w, 2);
```

Replace:
```ts
    expect(m.hero.mana).toBeLessThan(mana - m.hero.abilities[0].cost + 1);
```
with:
```ts
    expect(m.hero.mana).toBeLessThan(mana - moveOf(m, 0).cost + 1);
```

Replace:
```ts
    const events = run(w, w.hero.abilities[2].castTime + 0.3);
```
with:
```ts
    const events = run(w, moveOf(w, 2).castTime + 0.3);
```

Replace:
```ts
  it('a Crushing bolt knocks back and staggers; a Balanced one does not stagger', () => {
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { weight: 2 } });
    const events = press(w, 0);
    events.push(...run(w, 1));
    expect(w.monsters[0].status.staggerUntil).toBeGreaterThan(0);
    const hit = events.find((e) => e.kind === 'hit' && e.id === w.monsters[0].id);
    expect(hit && hit.kind === 'hit' && hit.heft).toBeCloseTo(1);
    const b = arena([dummy(13, 30)], { noBasic: true });
    press(b, 0);
    run(b, 1);
    expect(b.monsters[0].status.staggerUntil).toBe(0);
  });

  it("a Crushing bolt's chain jump keeps no heavy payoff and no heft", () => {
    const w = arena([dummy(13, 30), dummy(15, 30)], {
      noBasic: true,
      primary: { elements: ['storm'], weight: 2 },
    });
    const [first, second] = w.monsters;
    const events = press(w, 0, { x: 13, y: 30 });
    events.push(...run(w, 1));
    const chained = events.filter((e) => e.kind === 'hit' && e.id === second.id);
    expect(chained.length).toBeGreaterThan(0);
    expect(chained.every((e) => e.kind === 'hit' && e.heft === 0)).toBe(true);
    expect(second.status.staggerUntil).toBe(0);
    expect(first.status.staggerUntil).toBeGreaterThan(0);
  });

  it('Crushing adds knockback to a direct hit', () => {
    const heavy = arena([dummy(13, 30)], { noBasic: true, primary: { weight: 2 } });
```
with:
```ts
  it('a heavy bolt lands with its heft and no stagger (only Crushing, a full hold, staggers)', () => {
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { kind: 'heavy' } });
    const events = press(w, 0);
    events.push(...run(w, 1));
    expect(w.monsters[0].status.staggerUntil).toBe(0);
    const hit = events.find((e) => e.kind === 'hit' && e.id === w.monsters[0].id);
    expect(hit && hit.kind === 'hit' && hit.heft).toBeCloseTo(0.7);
  });

  it("a heavy bolt's chain jump keeps no heavy payoff and no heft", () => {
    const w = arena([dummy(13, 30), dummy(15, 30)], {
      noBasic: true,
      primary: { elements: ['storm'], kind: 'heavy' },
    });
    const [first, second] = w.monsters;
    const events = press(w, 0, { x: 13, y: 30 });
    events.push(...until(w, () => damaged(second)));
    const chained = events.filter((e) => e.kind === 'hit' && e.id === second.id);
    expect(chained.length).toBeGreaterThan(0);
    expect(chained.every((e) => e.kind === 'hit' && e.heft === 0)).toBe(true);
    // Storm knocks nothing back: only the direct hit's heavy payoff does.
    expect(Math.hypot(second.kbx, second.kby)).toBe(0);
    expect(Math.hypot(first.kbx, first.kby)).toBeGreaterThan(0);
  });

  it('a heavy move adds knockback to a direct hit', () => {
    const heavy = arena([dummy(13, 30)], { noBasic: true, primary: { kind: 'heavy' } });
```

Replace:
```ts
      ultimate: { form: 'maelstrom', weight: 2, payment: 'mana' },
```
with:
```ts
      ultimate: { form: 'maelstrom', kind: 'heavy', payment: 'mana' },
```

Replace:
```ts
    const s = arena([dummy(13, 0)], { defensive: { form: 'surge', weight: 2 } });
```
with:
```ts
    const s = arena([dummy(13, 0)], { defensive: { form: 'surge', kind: 'heavy' } });
```

Replace:
```ts
    w.hero.cooldowns[1] = w.hero.cooldowns[2] = 1e9;
```
with:
```ts
    w.hero.cooldowns[1] = [1e9];
    w.hero.cooldowns[2] = [1e9];
```

- [ ] **Step 5: The Training Grounds and reaction tests**

In `packages/engine/tests/delve-training.test.ts`, the sandbox takes chains (`chainsWith`), and the Crushing Nova dearer than the whole pool becomes a heavy one (still dearer):

Replace:
```ts
import type { AbilityBuilds } from '../src/types/ability.js';
import type { GearItem } from '../src/types/gear.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity, SandboxToggles } from '../src/types/arpg.js';
import {
  DEFAULT_BUILDS,
  STEP,
  bal,
  damaged,
  dodge,
  gear,
```
with:
```ts
import type { AbilitySlot } from '../src/types/ability.js';
import type { GearItem } from '../src/types/gear.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity, SandboxToggles } from '../src/types/arpg.js';
import {
  STEP,
  bal,
  chainsWith,
  damaged,
  dodge,
  gear,
  moveOf,
```

Before:
```ts
} from './fixtures/arena.js';
```
add:
```ts
  type ChainOpts,
```

Replace:
```ts
function sandbox(toggles = ALL_OFF, builds: Partial<AbilityBuilds> = {}, depth = 5): ArpgWorld {
  return createSandboxWorld(registry, {
    depth,
    stats: computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry),
    abilities: { ...DEFAULT_BUILDS, ...builds },
```
with:
```ts
type SlotOpts = Partial<Record<AbilitySlot, ChainOpts>>;

function sandbox(toggles = ALL_OFF, chains: SlotOpts = {}, depth = 5): ArpgWorld {
  return createSandboxWorld(registry, {
    depth,
    stats: computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry),
    chains: chainsWith(chains),
```

Replace:
```ts
      ultimate: { form: 'nova', elements: ['storm', 'earth'], weight: 0, payment: 'mana' },
```
with:
```ts
      ultimate: { elements: ['storm', 'earth'], payment: 'mana' },
```

Replace:
```ts
      primary: { form: 'bolt', elements: ['storm'], weight: 0, payment: 'mana' },
```
with:
```ts
      primary: { elements: ['storm'] },
```

Replace:
```ts
    const crushing = { form: 'nova', elements: ['fire'], weight: 2, payment: 'mana' } as const;
    const w = sandbox({ ...ALL_OFF, infiniteMana: true }, { ultimate: crushing });
    expect(w.hero.abilities[2].cost).toBeGreaterThan(w.hero.manaMax);
    expect(abilityReady(ctxOf(w).ctx, 2)).toBe(true);
    expect(canAfford(w, w.hero.abilities[2])).toBe(true);
    pressOnly(w, 2);
    expect(w.hero.windup?.slot).toBe(2);
    const off = sandbox(ALL_OFF, { ultimate: crushing });
    off.hero.mana = off.hero.manaMax;
    expect(abilityReady(ctxOf(off).ctx, 2)).toBe(false);
    expect(canAfford(off, off.hero.abilities[2])).toBe(false);
    expect(canAfford(off, off.hero.abilities[0])).toBe(true);
```
with:
```ts
    const heavy = { kind: 'heavy', payment: 'mana' } as const;
    const w = sandbox({ ...ALL_OFF, infiniteMana: true }, { ultimate: heavy });
    expect(moveOf(w, 2).cost).toBeGreaterThan(w.hero.manaMax);
    expect(abilityReady(ctxOf(w).ctx, 2)).toBe(true);
    expect(canAfford(w, moveOf(w, 2))).toBe(true);
    pressOnly(w, 2);
    expect(w.hero.windup?.slot).toBe(2);
    const off = sandbox(ALL_OFF, { ultimate: heavy });
    off.hero.mana = off.hero.manaMax;
    expect(abilityReady(ctxOf(off).ctx, 2)).toBe(false);
    expect(canAfford(off, moveOf(off, 2))).toBe(false);
    expect(canAfford(off, moveOf(off, 0))).toBe(true);
```

Replace:
```ts
    expect(w.hero.charge[2]).toBe(w.hero.abilities[2].chargeNeed);
```
with:
```ts
    expect(w.hero.charge[2]).toBe(moveOf(w, 2).chargeNeed);
```

Replace:
```ts
    const need = u.hero.abilities[2].chargeNeed;
```
with:
```ts
    const need = moveOf(u, 2).chargeNeed;
```

Replace:
```ts
    w.hero.cooldowns = [5, 5, 5];
    setSandboxToggles(w, { ...ALL_OFF, noCooldowns: true });
    expect(w.sandbox).toEqual({ ...ALL_OFF, noCooldowns: true });
    for (const c of w.hero.cooldowns) expect(c).toBeLessThanOrEqual(w.t);
```
with:
```ts
    w.hero.cooldowns = [[5], [5], [5]];
    setSandboxToggles(w, { ...ALL_OFF, noCooldowns: true });
    expect(w.sandbox).toEqual({ ...ALL_OFF, noCooldowns: true });
    for (const c of w.hero.cooldowns.flat()) expect(c).toBeLessThanOrEqual(w.t);
```

Replace:
```ts
    const w = sandbox(ALL_OFF, {
      defensive: { form: 'ward', elements: ['frost'], weight: 0, payment: 'charge' },
    });
    fillCharge(w);
    const [, guard, ult] = w.hero.abilities;
    expect(w.hero.charge).toEqual([0, guard.chargeNeed, ult.chargeNeed]);
```
with:
```ts
    const w = sandbox(ALL_OFF, { defensive: { payment: 'charge' } });
    fillCharge(w);
    expect(w.hero.charge).toEqual([0, moveOf(w, 1).chargeNeed, moveOf(w, 2).chargeNeed]);
```

Replace:
```ts
    h.defend = { form: 'ward', until: w.t + 5 };
```
with:
```ts
    h.defend = { form: 'ward', until: w.t + 5, move: 0, stage: 0 };
```

Replace:
```ts
  const swap = (w: ArpgWorld, builds: Partial<AbilityBuilds>) =>
    refreshWorldHero(registry, w, w.hero.stats, { ...DEFAULT_BUILDS, ...builds });
```
with:
```ts
  const swap = (w: ArpgWorld, chains: SlotOpts) =>
    refreshWorldHero(registry, w, w.hero.stats, chainsWith(chains));
```

Replace:
```ts
    const need = w.hero.abilities[2].chargeNeed;
    pressOnly(w, 2);
    expect(w.hero.windup?.slot).toBe(2);
    expect(w.hero.charge[2]).toBe(0);
    swap(w, { ultimate: { ...DEFAULT_BUILDS.ultimate, form: 'barrage' } });
    expect(w.hero.windup).toBeNull();
    expect(w.hero.cooldowns[2]).toBeLessThanOrEqual(w.t);
    expect(w.hero.charge[2]).toBeCloseTo(Math.min(need, w.hero.abilities[2].chargeNeed));
    expect(w.hero.abilities[2].form.id).toBe('barrage');
  });

  it('the mana spent on a cancelled wind-up stays spent', () => {
    const cast = { ...DEFAULT_BUILDS.primary, payment: 'cast' as const };
```
with:
```ts
    const need = moveOf(w, 2).chargeNeed;
    pressOnly(w, 2);
    expect(w.hero.windup?.slot).toBe(2);
    expect(w.hero.charge[2]).toBe(0);
    swap(w, { ultimate: { form: 'barrage' } });
    expect(w.hero.windup).toBeNull();
    expect(w.hero.cooldowns[2][0]).toBeLessThanOrEqual(w.t);
    expect(w.hero.charge[2]).toBeCloseTo(Math.min(need, moveOf(w, 2).chargeNeed));
    expect(moveOf(w, 2).form.id).toBe('barrage');
  });

  it('the mana spent on a cancelled wind-up stays spent', () => {
    const cast = { payment: 'cast' as const };
```

Replace:
```ts
    swap(w, { defensive: { form: 'armor', elements: ['earth'], weight: 0, payment: 'mana' } });
```
with:
```ts
    swap(w, { defensive: { form: 'armor', elements: ['earth'] } });
```

Replace:
```ts
    swap(w, { primary: { ...DEFAULT_BUILDS.primary, form: 'lance' } });
    expect(w.hero.windup).toEqual(windup);
    expect(w.hero.ward).not.toBeNull();
    expect(w.hero.abilities[0].form.id).toBe('lance');
```
with:
```ts
    swap(w, { primary: { form: 'lance' } });
    expect(w.hero.windup).toEqual(windup);
    expect(w.hero.ward).not.toBeNull();
    expect(moveOf(w, 0).form.id).toBe('lance');
```

In `packages/engine/tests/delve-reactions.test.ts`, cooldowns are per move (`cooldowns[slot][move]`), `defend` names its move and stage, and a Crushing hit is a hold's stage 2 (`chainMove(chain, 0, 2)`):

Replace:
```ts
import { resolveAbility } from '../src/arpg/abilities/resolve.js';
```
with:
```ts
import { chainMove, resolveChain } from '../src/arpg/abilities/resolve.js';
```

Replace:
```ts
  DEFAULT_BUILDS,
```
with:
```ts
  DEFAULT_CHAINS,
```

Before:
```ts
  registry,
```
add:
```ts
  moveOf,
```

Replace:
```ts
  galvanize: (f) => expect(f.w.hero.cooldowns[0]).toBe(5 - bal.reactions.galvanizeSeconds),
```
with:
```ts
  galvanize: (f) => expect(f.w.hero.cooldowns[0][0]).toBe(5 - bal.reactions.galvanizeSeconds),
```

Replace:
```ts
    const opts = hitOpts(w.hero.abilities[0], { x: 13, y: 20 });
```
with:
```ts
    const opts = hitOpts(moveOf(w, 0), { x: 13, y: 20 });
```

Replace:
```ts
    const build = { form: 'surge', elements: ['earth'], weight: 0, payment: 'mana' } as const;
    surge.hero.abilities[1] = resolveAbility(registry, 'defensive', build, surge.hero.stats);
    surge.hero.defend = { form: 'surge', until: 1e9 };
```
with:
```ts
    surge.hero.chains[1] = resolveChain(registry, surge.hero.stats, 'defensive', {
      moves: [{ kind: 'medium', form: 'surge', elements: ['earth'] }],
      payment: 'mana',
    });
    surge.hero.defend = { form: 'surge', until: 1e9, move: 0, stage: 0 };
```

Replace:
```ts
    const heavy = setup([dummy(13, 20)], { primary: { weight: 2 } });
    const opts = hitOpts(heavy.w.hero.abilities[0], { x: 13, y: 20 });
```
with:
```ts
    // Crushing: a hold's full charge (weight +2).
    const heavy = setup([dummy(13, 20)], { primary: { kind: 'hold' } });
    const opts = hitOpts(chainMove(heavy.w.hero.chains[0], 0, 2), { x: 13, y: 20 });
```

Replace:
```ts
      w.hero.defend = { form, until: 1e9 };
```
with:
```ts
      w.hero.defend = { form, until: 1e9, move: 0, stage: 0 };
```

Replace:
```ts
      s.w.hero.cooldowns[0] = 5;
```
with:
```ts
      s.w.hero.cooldowns[0][0] = 5;
```

Replace:
```ts
    h.defend = { form: 'armor', until: 1e9 };
    h.barrier = { hp: 10, max: 10, until: 1e9 };
    const cut = Math.min(0.75, h.abilities[1].effect);
```
with:
```ts
    h.defend = { form: 'armor', until: 1e9, move: 0, stage: 0 };
    h.barrier = { hp: 10, max: 10, until: 1e9 };
    const cut = Math.min(0.75, moveOf(armor.w, 1).effect);
```

Replace:
```ts
    ward.w.hero.defend = { form: 'ward', until: 1e9 };
```
with:
```ts
    ward.w.hero.defend = { form: 'ward', until: 1e9, move: 0, stage: 0 };
```

Replace:
```ts
      abilities: DEFAULT_BUILDS,
```
with:
```ts
      chains: DEFAULT_CHAINS,
```

Replace:
```ts
    h.cooldowns = [w.t + 0.5, w.t + 5, w.t + 3]; // the Ultimate pays by charge: that's its lockout
    h.charge[2] = h.abilities[2].chargeNeed - 0.5;
    applyStatus(ctx, m, 'shock', 0);
    hitMonster(ctx, m, 10, 'nature', { source: 'skill' });
    expect(h.cooldowns).toEqual([w.t, w.t + 5 - bal.reactions.galvanizeSeconds, w.t + 3]);
    expect(h.charge[2]).toBe(h.abilities[2].chargeNeed);
```
with:
```ts
    h.cooldowns = [[w.t + 0.5], [w.t + 5], [w.t + 3]]; // the Ultimate pays by charge: that's its lockout
    h.charge[2] = moveOf(w, 2).chargeNeed - 0.5;
    applyStatus(ctx, m, 'shock', 0);
    hitMonster(ctx, m, 10, 'nature', { source: 'skill' });
    expect(h.cooldowns).toEqual([[w.t], [w.t + 5 - bal.reactions.galvanizeSeconds], [w.t + 3]]);
    expect(h.charge[2]).toBe(moveOf(w, 2).chargeNeed);
```

---

## Chunk 4: Engine: the hero plays chains (Task 3 continued: the last tests, the types and resolving)

- [ ] **Step 6: The stacks, infusion, pair, dive and dodge tests**

In `packages/engine/tests/delve-stacks.test.ts`, a direct hit's stacks follow its kind's weight (light 1, medium 2, heavy 3; a hold's stages 2, 3, 3):

Replace:
```ts
import { resolveAbility } from '../src/arpg/abilities/resolve.js';
import { createSandboxWorld, spawnDummies } from '../src/arpg/sandbox.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { ABILITY_WEIGHTS } from '../src/types/ability.js';
import type { ArpgEvent, MonsterEntity } from '../src/types/arpg.js';
import { MANA_TYPES, type ManaType } from '../src/types/mana.js';
import {
  DEFAULT_BUILDS,
```
with:
```ts
import { resolveAbility, resolveChain } from '../src/arpg/abilities/resolve.js';
import { createSandboxWorld, spawnDummies } from '../src/arpg/sandbox.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgEvent, MonsterEntity } from '../src/types/arpg.js';
import { MANA_TYPES, type ManaType } from '../src/types/mana.js';
import {
  DEFAULT_CHAINS,
```

Before:
```ts
  press,
```
add:
```ts
  moveOf,
```

Replace:
```ts
      abilities: DEFAULT_BUILDS,
```
with:
```ts
      chains: DEFAULT_CHAINS,
```

Replace:
```ts
    w.hero.defend = { form: 'ward', until: 1e9 };
```
with:
```ts
    w.hero.defend = { form: 'ward', until: 1e9, move: 0, stage: 0 };
```

Replace:
```ts
    const counts = ABILITY_WEIGHTS.map(
      (weight) =>
        resolveAbility(registry, 'primary', { ...DEFAULT_BUILDS.primary, weight }, stats).stacks,
    );
    expect(counts).toEqual(bal.stacks.byWeight);
    for (const weight of [-2, 0, 2] as const) {
      const w = arena([dummy(13, 30)], { noBasic: true, primary: { weight } });
      press(w, 0);
      run(w, 1);
      expect(w.monsters[0].status.stacks.fire, `weight ${weight}`).toBe(
        bal.stacks.byWeight[weight + 2],
      );
```
with:
```ts
    const bolt = DEFAULT_CHAINS.primary.moves[0];
    const at = (kind: 'light' | 'medium' | 'heavy' | 'hold', stage = 0) =>
      resolveAbility(registry, 'primary', { ...bolt, kind }, 'mana', stats, stage);
    const moves = [
      at('light'),
      at('medium'),
      at('heavy'),
      at('hold', 0),
      at('hold', 1),
      at('hold', 2),
    ];
    expect(moves.map((ab) => ab.stacks)).toEqual(
      moves.map((ab) => bal.stacks.byWeight[ab.weight + 2]),
    );
    expect(moves.map((ab) => ab.stacks)).toEqual([1, 2, 3, 2, 3, 3]);
    for (const kind of ['light', 'medium', 'heavy'] as const) {
      const w = arena([dummy(13, 30)], { noBasic: true, primary: { kind } });
      press(w, 0);
      run(w, 1);
      expect(w.monsters[0].status.stacks.fire, kind).toBe(moveOf(w, 0).stacks);
```

Replace:
```ts
    const build = { form: 'surge', elements: ['fire'], weight: 0, payment: 'mana' } as const;
    for (const [baseId, foe] of [
```
with:
```ts
    for (const [baseId, foe] of [
```

Replace:
```ts
      w.hero.abilities[1] = resolveAbility(registry, 'defensive', build, w.hero.stats);
      w.hero.defend = { form: 'surge', until: 1e9 };
```
with:
```ts
      w.hero.chains[1] = resolveChain(registry, w.hero.stats, 'defensive', {
        moves: [{ kind: 'medium', form: 'surge', elements: ['fire'] }],
        payment: 'mana',
      });
      w.hero.defend = { form: 'surge', until: 1e9, move: 0, stage: 0 };
```

Replace:
```ts
      h.cooldowns[0] = 5;
```
with:
```ts
      h.cooldowns[0][0] = 5;
```

Replace:
```ts
        cooldown: h.cooldowns[0],
```
with:
```ts
        cooldown: h.cooldowns[0][0],
```

In `packages/engine/tests/delve-infusion.test.ts`:

Replace:
```ts
import { STEP, arena, dummy, gear, press, registry, run } from './fixtures/arena.js';
```
with:
```ts
import { STEP, arena, dummy, gear, moveOf, press, registry, run } from './fixtures/arena.js';
```

Replace:
```ts
    impact(ctx, w.hero.abilities[0], 13, 30, 1.1, 1, { tick: true });
    impact(ctx, w.hero.abilities[0], 13, 30, 1.1, 1);
```
with:
```ts
    impact(ctx, moveOf(w, 0), 13, 30, 1.1, 1, { tick: true });
    impact(ctx, moveOf(w, 0), 13, 30, 1.1, 1);
```

In `packages/engine/tests/delve-pair.test.ts` (`defaultAbilities` stays imported until Task 6):

Replace:
```ts
import { defaultAbilities } from '../src/arpg/abilities/resolve.js';
```
with:
```ts
import { defaultAbilities, defaultChains } from '../src/arpg/abilities/resolve.js';
```

Replace:
```ts
        defaultAbilities('nature'),
```
with:
```ts
        defaultChains(registry, 'nature', 'sword'),
```

In `packages/engine/tests/delve-dive.test.ts`:

Replace:
```ts
    expect(beginFloor(registry, p).hero.abilities.map((a) => a.name)).toEqual([
```
with:
```ts
    expect(beginFloor(registry, p).hero.chains.map((c) => c.moves[0].name)).toEqual([
```

In `packages/engine/tests/delve-dodge.test.ts`:

Replace:
```ts
    expect(w.hero.cooldowns[2]).toBeLessThanOrEqual(w.t);
```
with:
```ts
    expect(w.hero.cooldowns[2][0]).toBeLessThanOrEqual(w.t);
```

- [ ] **Step 7: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts tests/ability-resolve.test.ts tests/ability-forms.test.ts tests/ability-cast.test.ts tests/arpg-sim.test.ts tests/delve-combat-weight.test.ts tests/delve-training.test.ts tests/delve-reactions.test.ts tests/delve-stacks.test.ts tests/delve-infusion.test.ts tests/delve-pair.test.ts tests/delve-dive.test.ts tests/delve-dodge.test.ts)`
Expected: 291 FAIL, 87 pass, in all 13 files. 202 of them are `TypeError: Cannot read properties of undefined (reading 'primary')` (the fixture hands the world `chains`, and today's hero still resolves `abilities`), 13 `… (reading 'stormcaller')` (`resolveAbility` given a move and a payment where it takes a build and stats), and 4 `(0 , resolveChain) is not a function` / `(0 , defaultChains) is not a function`.

- [ ] **Step 8: The types**

In `packages/engine/src/types/ability.ts` (CRLF: hand-edit), the header describes chains, a build is only a version 4 save's now, `HOLD_STAGE_KINDS` joins the kinds, `ResolvedAbility` places its move, and `ResolvedChain` follows it:

Replace:
```ts
 * Abilities are built from parts: a form (what it does), one or two elements
 * (how it behaves), a weight (light and cheap to heavy and costly) and a
 * payment (mana, charge or cast time). `resolveAbility` compiles a build into
 * plain numbers and knobs that the combat code reads.
```
with:
```ts
 * Each ability slot holds a chain of moves (see the moves and chains spec): a
 * move is a kind (light, medium, heavy or hold), a form (what it does) and one
 * or two elements (how it behaves); the chain has one payment (mana, charge or
 * cast time). `resolveChain` compiles a chain into plain numbers and knobs that
 * the combat code reads.
```

Replace:
```ts
/** Swift, Quick, Balanced, Heavy, Crushing. */
```
with:
```ts
/** Swift, Light, Balanced, Heavy, Crushing: the per-weight tables' index − 2 (a version 4 build's weight). */
```

Before:
```ts
export interface AbilityBuild {
```
add:
```ts
/** A version 4 save's ability (see `chainFromBuild`). */
```

Replace:
```ts
export const MOVE_KINDS: readonly MoveKind[] = ['light', 'medium', 'heavy', 'hold'] as const;
```
with:
```ts
export const MOVE_KINDS: readonly MoveKind[] = ['light', 'medium', 'heavy', 'hold'] as const;

/** The kinds whose numbers a hold's three stages take (Volley's darts, a basic hold's rows). */
export const HOLD_STAGE_KINDS: readonly MoveKind[] = ['medium', 'heavy', 'hold'] as const;
```

Replace:
```ts
/** An ability build compiled to plain numbers; the combat code reads only this. */
export interface ResolvedAbility {
  slot: AbilitySlot;
  build: AbilityBuild;
```
with:
```ts
/** A move compiled to plain numbers; the combat code reads only this. */
export interface ResolvedAbility {
  slot: AbilitySlot;
  kind: MoveKind;
  /** The weight it resolved at (its kind's; a hold's stage's). */
  weight: number;
  /** A hold move's stage (0 for any other move). */
  stage: number;
  payment: AbilityPayment;
  /** Its place in the chain (from 0), and whether it is the last move of a chain of 2 or more. */
  index: number;
  last: boolean;
```

Replace:
```ts
  /** Units moved when cast: + steps in over the conjure, − recoils after the release; before the press-combo multiplier. */
  motion: number;
  /** Charge units needed (charge payment only). */
```
with:
```ts
  /** Units moved when cast: + steps in over the conjure, − recoils after the release; before the step bonus. */
  motion: number;
  /** Charge units needed (charge payment only; a hold's is its stage 2's). */
```

Replace:
```ts
  /** Press-combo multipliers; `[1]` when the form has no combo. */
  combo: number[];
  comboCount: number[] | null;
  knobs: Knobs;
}
```
with:
```ts
  knobs: Knobs;
}

/** A slot's chain compiled: its moves (a hold's at stage 0) and each hold move's three stages. */
export interface ResolvedChain {
  moves: ResolvedAbility[];
  payment: AbilityPayment;
  hold: (ResolvedAbility[] | null)[];
}
```

In `packages/engine/src/types/arpg.ts`, the forms lose their press-combos and the hero holds chains, per-move cooldowns and the Defensive's move:

Before:
```ts
} from './ability.js';
```
add:
```ts
  ResolvedChain,
```

Replace:
```ts
  /** Press-combo multipliers for power and size (Primary forms). */
  combo?: number[];
  /** Press-combo projectile counts (Volley). */
  comboCount?: number[];
  /** The form's default chain: new heroes' and migrated builds' moves (see the moves and chains spec). */
```
with:
```ts
  /** The form's default chain: new heroes' and migrated builds' moves (see the moves and chains spec). */
```

Replace:
```ts
  /** Primary, Defensive, Ultimate. */
  abilities: ResolvedAbility[];
  /** Per slot: time it is ready again. */
  cooldowns: number[];
  /** Per slot: charge units banked (charge payment). */
  charge: number[];
  /** Per slot: the combo step of the last cast and when it landed (a press's step is chosen from these). */
```
with:
```ts
  /** The Primary's, Defensive's and Ultimate's chains. */
  chains: ResolvedChain[];
  /** Per slot and move: the time the move is ready again. */
  cooldowns: number[][];
  /** Per slot: charge units banked (a charge-paid chain's meter). */
  charge: number[];
  /** Per slot: the move of the last cast and when it landed (a press's move is chosen from these). */
```

Replace:
```ts
    /** The press-combo step, chosen at the press. */
```
with:
```ts
    /** The chain's move, chosen at the press. */
```

Replace:
```ts
  /** The active defensive (Ward, Armor, Surge; Blink's trail effects). */
  defend: { form: FormId; until: number } | null;
```
with:
```ts
  /**
   * The active defensive (Ward, Armor, Surge; Blink's trail effects): the chain's
   * `move` that cast it, at its hold `stage` (0 for any other move).
   */
  defend: { form: FormId; until: number; move: number; stage: number } | null;
```

- [ ] **Step 9: The data**

In `packages/engine/src/data/arpg.json` (hand-edit), the Primary forms lose `combo` (and Volley `comboCount`), and their texts describe chains:

Replace:
```json
      "power": 1.45, "range": 9, "radius": 0.9, "speed": 13, "combo": [0.8, 0.8, 1.0, 1.5], "motion": -0.15,
      "defaultChain": ["light", "light", "medium", "heavy"],
      "text": "A bolt that bursts on the first foe it hits. Press again to chain: small, small, medium, large."
    },
    {
      "id": "volley", "slot": "primary", "name": "Volley", "icon": "🎯",
      "power": 0.6, "range": 9, "radius": 0.35, "speed": 11, "count": 3, "combo": [1, 1, 1], "comboCount": [3, 3, 5], "motion": -0.1,
      "defaultChain": ["medium", "medium", "medium"], "countByKind": { "light": 3, "medium": 3, "heavy": 5, "hold": 5 },
      "text": "Homing darts that seek out different foes. The third press fires five."
    },
    {
      "id": "lance", "slot": "primary", "name": "Lance", "icon": "🗡️",
      "power": 1.55, "range": 7.5, "radius": 0.55, "combo": [1, 1, 1.4], "motion": -0.3,
      "defaultChain": ["medium", "medium", "heavy"],
      "text": "An instant line that hits every foe along it. The third press reaches further and hits harder."
    },
    {
      "id": "burst", "slot": "primary", "name": "Burst", "icon": "💥",
      "power": 1.7, "range": 8, "radius": 1.6, "combo": [1, 1, 1.5], "motion": 0.2, "speed": 30,
      "defaultChain": ["medium", "medium", "heavy"],
      "text": "An explosion where you aim. The third press is bigger."
    },
    {
      "id": "strike", "slot": "primary", "name": "Strike", "icon": "⚔️",
      "power": 1.4, "range": 2.4, "radius": 2.4, "arc": 150, "combo": [1, 1, 1.2, 1.8], "motion": 0.5,
      "defaultChain": ["medium", "medium", "medium", "heavy"],
      "text": "An element-infused sweep in front of you. The fourth press slams everything around you."
```
with:
```json
      "power": 1.45, "range": 9, "radius": 0.9, "speed": 13, "motion": -0.15,
      "defaultChain": ["light", "light", "medium", "heavy"],
      "text": "A bolt that bursts on the first foe it hits. Each later move of a chain hits harder and bursts wider."
    },
    {
      "id": "volley", "slot": "primary", "name": "Volley", "icon": "🎯",
      "power": 0.6, "range": 9, "radius": 0.35, "speed": 11, "count": 3, "motion": -0.1,
      "defaultChain": ["medium", "medium", "medium"], "countByKind": { "light": 3, "medium": 3, "heavy": 5, "hold": 5 },
      "text": "Homing darts that seek out different foes: three, or five from a heavy or a held move."
    },
    {
      "id": "lance", "slot": "primary", "name": "Lance", "icon": "🗡️",
      "power": 1.55, "range": 7.5, "radius": 0.55, "motion": -0.3,
      "defaultChain": ["medium", "medium", "heavy"],
      "text": "An instant line that hits every foe along it. Each later move of a chain reaches further and hits harder."
    },
    {
      "id": "burst", "slot": "primary", "name": "Burst", "icon": "💥",
      "power": 1.7, "range": 8, "radius": 1.6, "motion": 0.2, "speed": 30,
      "defaultChain": ["medium", "medium", "heavy"],
      "text": "An explosion where you aim. Each later move of a chain is bigger."
    },
    {
      "id": "strike", "slot": "primary", "name": "Strike", "icon": "⚔️",
      "power": 1.4, "range": 2.4, "radius": 2.4, "arc": 150, "motion": 0.5,
      "defaultChain": ["medium", "medium", "medium", "heavy"],
      "text": "An element-infused sweep in front of you. The last move of a chain slams everything around you."
```

In `packages/engine/src/data/schemas.ts`:

Replace:
```ts
        combo: z.array(z.number().positive()).min(1).optional(),
        comboCount: z.array(z.number().int().positive()).min(1).optional(),
        motion: z.number().optional(),
```
with:
```ts
        motion: z.number().optional(),
```

- [ ] **Step 10: Resolving a chain**

In `packages/engine/src/arpg/abilities/resolve.ts` (CRLF: hand-edit). The imports; then `resolveAbility` takes a move, the chain's payment and a hold's stage (its weight from `moveWeight`, a hold's charge need at stage 2, Volley's count by kind); then `stepHeft` makes way for `resolveChain`, `chainMove`, `chargeCap`, `stepBonus`, the new `stepHeft`, `defaultBasic` and `defaultChains` (`defaultAbilities` stays until Task 7):

Replace:
```ts
import type {
  AbilityBuild,
  AbilityBuilds,
  AbilitySlot,
  Knobs,
  ResolvedAbility,
} from '../../types/ability.js';
import type { ManaType } from '../../types/mana.js';
import type { HeroStats } from '../../types/delve.js';
```
with:
```ts
import {
  HOLD_STAGE_KINDS,
  type AbilityBuilds,
  type AbilityPayment,
  type AbilitySlot,
  type Blow,
  type Chain,
  type Chains,
  type FormId,
  type Knobs,
  type Move,
  type ResolvedAbility,
  type ResolvedChain,
} from '../../types/ability.js';
import type { ManaType } from '../../types/mana.js';
import type { DelveBalance, HeroStats } from '../../types/delve.js';
```

Replace:
```ts
/** Compile a build into the numbers and knobs the combat code reads. */
export function resolveAbility(
  registry: DataRegistry,
  slot: AbilitySlot,
  build: AbilityBuild,
  stats: HeroStats,
```
with:
```ts
/** The weight a move resolves at: its kind's (`chains.kindWeight`), a hold's by its stage. */
export function moveWeight(bal: DelveBalance, kind: Move['kind'], stage = 0): number {
  const c = bal.chains;
  return kind === 'hold' ? c.holdStageWeight[stage] : c.kindWeight[kind];
}

/**
 * Compile one move into the numbers and knobs the combat code reads: at its
 * kind's weight (a hold's at `stage`), paid with `payment`. It resolves as the
 * first move of a chain; `resolveChain` places it.
 */
export function resolveAbility(
  registry: DataRegistry,
  slot: AbilitySlot,
  move: Move,
  payment: AbilityPayment,
  stats: HeroStats,
  stage = 0,
```

Replace:
```ts
  const form = registry.getForm(build.form);
  if (form.slot !== slot) throw new Error(`${form.name} is not a ${slot} form`);
  const [element, second] = build.elements;
```
with:
```ts
  const form = registry.getForm(move.form);
  if (form.slot !== slot) throw new Error(`${form.name} is not a ${slot} form`);
  const [element, second] = move.elements;
```

Replace:
```ts
  if (L.stormcaller && build.elements.includes('storm'))
    legendary.push({ chain: Math.round(L.stormcaller) });
  if (L.bedrock && build.elements.includes('earth'))
    legendary.push({ area: 1.4, applies: ['stagger'] });
  if (L.rimeheart && build.form === 'nova' && build.elements.includes('frost')) {
    legendary.push({ zone: { seconds: 3, tickPower: 0.15 } });
  }
  const knobs = mergeKnobs(
    ...build.elements.map((e) => data.elementTraits[e].knobs),
```
with:
```ts
  if (L.stormcaller && move.elements.includes('storm'))
    legendary.push({ chain: Math.round(L.stormcaller) });
  if (L.bedrock && move.elements.includes('earth'))
    legendary.push({ area: 1.4, applies: ['stagger'] });
  if (L.rimeheart && move.form === 'nova' && move.elements.includes('frost')) {
    legendary.push({ zone: { seconds: 3, tickPower: 0.15 } });
  }
  const knobs = mergeKnobs(
    ...move.elements.map((e) => data.elementTraits[e].knobs),
```

Replace:
```ts
  const w = build.weight;
  const W = ab.weight;
  const s = ab.slots[slot];
  const cast = build.payment === 'cast';
  const payPower = cast ? ab.castPowerMult : 1;
  const avgAttune =
    build.elements.reduce((sum, e) => sum + stats.attunement[e], 0) / build.elements.length;
```
with:
```ts
  const w = moveWeight(bal, move.kind, stage);
  const W = ab.weight;
  const s = ab.slots[slot];
  const cast = payment === 'cast';
  const payPower = cast ? ab.castPowerMult : 1;
  const avgAttune =
    move.elements.reduce((sum, e) => sum + stats.attunement[e], 0) / move.elements.length;
```

After:
```ts
  const size = 1 + W.size * w;
```
add:
```ts
  // A hold needs its full charge's worth before it starts (see the moves and chains spec).
  const needWeight = move.kind === 'hold' ? moveWeight(bal, 'hold', 2) : w;
  // Volley's darts by kind; a hold's stages count as medium, heavy and hold.
  const countKind = move.kind === 'hold' ? HOLD_STAGE_KINDS[stage] : move.kind;
```

Replace:
```ts
    build,
```
with:
```ts
    kind: move.kind,
    weight: w,
    stage: move.kind === 'hold' ? stage : 0,
    payment,
    index: 0,
    last: false,
```

Replace:
```ts
    elements: [...build.elements],
    fusion,
    power: form.power * (1 + W.power * w) * payPower * knobs.power * attunePower,
    effect: (form.effect ?? 0) * (1 + W.power * w) * payPower,
    cost: build.payment === 'charge' ? 0 : cast ? manaCost * ab.castManaMult : manaCost,
    cooldown:
      build.payment === 'charge'
```
with:
```ts
    elements: [...move.elements],
    fusion,
    power: form.power * (1 + W.power * w) * payPower * knobs.power * attunePower,
    effect: (form.effect ?? 0) * (1 + W.power * w) * payPower,
    cost: payment === 'charge' ? 0 : cast ? manaCost * ab.castManaMult : manaCost,
    cooldown:
      payment === 'charge'
```

Replace:
```ts
    chargeNeed: build.payment === 'charge' ? s.cost * (1 + W.cost * w) * ab.chargeRatio : 0,
    range: form.range ?? 0,
    radius: (form.radius ?? 0) * size * knobs.area,
    speed: (form.speed ?? 0) * (1 - W.speed * w),
    count: form.count ?? 1,
    duration: form.duration ?? 0,
    tick: form.tick ?? 0.5,
    arc: form.arc ?? 360,
    combo: form.combo ?? [1],
    comboCount: form.comboCount ?? null,
```
with:
```ts
    chargeNeed: payment === 'charge' ? s.cost * (1 + W.cost * needWeight) * ab.chargeRatio : 0,
    range: form.range ?? 0,
    radius: (form.radius ?? 0) * size * knobs.area,
    speed: (form.speed ?? 0) * (1 - W.speed * w),
    count: form.countByKind?.[countKind] ?? form.count ?? 1,
    duration: form.duration ?? 0,
    tick: form.tick ?? 0.5,
    arc: form.arc ?? 360,
```

Replace:
```ts
/** How hard press-combo `step` lands: the ability's heft, +0.2 on the last press of a 2+ press combo. */
export function stepHeft(ab: ResolvedAbility, step: number): number {
  const n = ab.combo.length;
  return Math.min(1, ab.heft + (n > 1 && step % n === n - 1 ? 0.2 : 0));
}

/** Builds for a new (or migrated) profile, all of `element`. */
```
with:
```ts
/**
 * Compile a slot's chain: each move at its kind's weight with the chain's
 * payment, placed in the chain (its `index`, and `last` on the last of 2+),
 * and each hold move's three stages (`moves[i]` is its stage 0).
 */
export function resolveChain(
  registry: DataRegistry,
  stats: HeroStats,
  slot: AbilitySlot,
  chain: Chain,
): ResolvedChain {
  const n = chain.moves.length;
  const at = (move: Move, index: number, stage = 0): ResolvedAbility => ({
    ...resolveAbility(registry, slot, move, chain.payment, stats, stage),
    index,
    last: n > 1 && index === n - 1,
  });
  return {
    moves: chain.moves.map((m, i) => at(m, i)),
    payment: chain.payment,
    hold: chain.moves.map((m, i) => (m.kind === 'hold' ? [0, 1, 2].map((s) => at(m, i, s)) : null)),
  };
}

/** Move `step` of a chain as it fires: a hold move at `stage`, any other as it is. */
export function chainMove(chain: ResolvedChain, step: number, stage = 0): ResolvedAbility {
  return chain.hold[step]?.[stage] ?? chain.moves[step];
}

/** The most charge a chain's meter holds: its largest need. */
export function chargeCap(chain: ResolvedChain): number {
  return Math.max(...chain.moves.map((m) => m.chargeNeed));
}

/** The step bonus of the move at `index`: its power and size factors. */
export function stepBonus(bal: DelveBalance, index: number): { power: number; size: number } {
  const b = bal.chains.stepBonus * index;
  return { power: 1 + b, size: 1 + b / 2 };
}

/** How hard a move lands: its heft, +0.2 on the last move of a chain of 2 or more. */
export function stepHeft(ab: ResolvedAbility): number {
  return Math.min(1, ab.heft + (ab.last ? 0.2 : 0));
}

/**
 * The weapon's default basic chain on the pair: every blow the primary, the
 * last the secondary when one is bound (unarmed: the hero's default chain).
 */
export function defaultBasic(
  registry: DataRegistry,
  weaponBaseId: string | null,
  primary: ManaType,
  secondary: ManaType | null = null,
): Blow[] {
  const kinds =
    (weaponBaseId ? registry.getGearBase(weaponBaseId).defaultChain : undefined) ??
    registry.getDelveBalance().hero.defaultChain;
  return kinds.map((kind, i) => ({
    kind,
    element: secondary && i === kinds.length - 1 ? secondary : primary,
  }));
}

/**
 * A new (or reset) hero's chains, all of `element`: each slot's form's default
 * chain (Bolt, Ward, Nova) with today's payments, and the weapon's default basic chain.
 */
export function defaultChains(
  registry: DataRegistry,
  element: ManaType,
  weaponBaseId: string | null,
): Chains {
  const chain = (form: FormId, payment: AbilityPayment): Chain => ({
    moves: registry.getForm(form).defaultChain.map((kind) => ({ kind, form, elements: [element] })),
    payment,
  });
  return {
    basic: defaultBasic(registry, weaponBaseId, element),
    primary: chain('bolt', 'mana'),
    defensive: chain('ward', 'mana'),
    ultimate: chain('nova', 'charge'),
  };
}

/** Builds for a new (or migrated) profile, all of `element` (until the save holds chains). */
```

---

## Chunk 5: Engine: the hero plays chains (Task 3 continued: casting, forms and the world)

- [ ] **Step 11: Casting a chain's move**

`cast.ts` changes throughout (the press, payment per move, `nextMove`, `activeMove`), so it is given whole; `castTick` and `canAfford` keep their bodies.

Replace the whole of `packages/engine/src/arpg/abilities/cast.ts` with:

```ts
import type { AbilityCast, ResolvedAbility } from '../../types/ability.js';
import type { ArpgWorld, HeroEntity, Vec } from '../../types/arpg.js';
import type { SimCtx } from '../combat.js';
import { cancelSwing, pushTick, startPush } from '../action.js';
import { dirTo, dist } from '../geometry.js';
import { executeForm } from './forms.js';
import { chainMove, stepBonus, stepHeft } from './resolve.js';
import { aimPoint, nearestMonster } from './targeting.js';

const DEFENSIVE = 1;

/** Can the hero pay for it? Infinite mana (Training Grounds) ignores cost, even one dearer than the whole pool. */
export function canAfford(world: ArpgWorld, ab: ResolvedAbility): boolean {
  return !!world.sandbox?.infiniteMana || world.hero.mana >= ab.cost;
}

/** Can the slot's next move be used right now (ignoring targets)? For the HUD and bots. */
export function abilityReady(ctx: SimCtx, slot: number): boolean {
  const h = ctx.world.hero;
  const chain = h.chains[slot];
  if (!chain || h.windup) return false;
  const step = pressStep(h, slot, ctx.world.t, ctx.bal.abilities.comboWindow);
  const ab = chain.moves[step];
  if (ctx.world.t < h.cooldowns[slot][step]) return false;
  if (chain.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return false;
  return canAfford(ctx.world, ab);
}

/**
 * The chain's move a press at `t` casts: the one after the last landed within
 * `window` of it (wrapping after the last move), else the first.
 */
export function pressStep(h: HeroEntity, slot: number, t: number, window: number): number {
  return t - h.comboAt[slot] <= window ? (h.comboStep[slot] + 1) % h.chains[slot].moves.length : 0;
}

/** The move the slot's next press would cast. */
export function nextMove(h: HeroEntity, slot: number, t: number, window: number): ResolvedAbility {
  return h.chains[slot].moves[pressStep(h, slot, t, window)];
}

/** The slot's move winding up or, for the Defensive, the one whose effect is up; else null. */
export function activeMove(h: HeroEntity, slot: number): ResolvedAbility | null {
  const chain = h.chains[slot];
  if (!chain) return null;
  if (h.windup?.slot === slot) return chain.moves[h.windup.step];
  if (slot === DEFENSIVE && h.defend) return chainMove(chain, h.defend.move, h.defend.stage);
  return null;
}

/** Fire move `step` of the slot's chain now, then its recoil and recovery. */
function fire(ctx: SimCtx, slot: number, aim: Vec | null, step: number): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const ab = chainMove(h.chains[slot], step);
  const res = executeForm(ctx, ab, aim);
  if (!res.ok) return false;
  h.comboStep[slot] = step;
  h.comboAt[slot] = world.t;
  ctx.events.push({
    kind: 'cast',
    slot,
    name: ab.name,
    form: ab.form.id,
    element: ab.element,
    x: h.x,
    y: h.y,
    tx: res.tx,
    ty: res.ty,
    heft: stepHeft(ab),
  });
  if (ab.motion < 0) {
    const d = dirTo(h.x, h.y, res.tx, res.ty);
    const size = stepBonus(bal, ab.index).size;
    if (d.x !== 0 || d.y !== 0)
      startPush(ctx, { x: -d.x, y: -d.y }, -ab.motion * size, bal.feel.recoilSeconds);
  }
  if (ab.recovery > 0) h.recoverUntil = world.t + ab.recovery;
  return true;
}

/** Pay for move `step`: its mana, its own cooldown (from `from`), its charge from the slot's meter. */
function pay(ctx: SimCtx, slot: number, step: number, ab: ResolvedAbility, from: number): void {
  const h = ctx.world.hero;
  h.mana -= ab.cost;
  // No cooldowns (Training Grounds): no cooldown, and so no charge lockout.
  if (!ctx.world.sandbox?.noCooldowns) h.cooldowns[slot][step] = from + ab.cooldown;
  if (ab.payment === 'charge') h.charge[slot] = Math.max(0, h.charge[slot] - ab.chargeNeed);
}

/**
 * Press an ability: its chain's next move. Fails, costing nothing, while
 * another is winding up, on that move's cooldown, uncharged, unaffordable
 * (with a `noMana` event, and the chain doesn't advance) or with nothing to aim
 * at. Otherwise it pays now, drops a basic swing still winding up, and winds
 * up for its conjure (stepping in, for forward forms) plus any channel; its
 * cooldown counts from the press plus the channel.
 */
export function castAbility(ctx: SimCtx, cast: AbilityCast): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  const slot = cast.slot;
  const chain = h.chains[slot];
  if (!chain || h.windup) return false;
  const step = pressStep(h, slot, t, bal.abilities.comboWindow);
  const ab = chain.moves[step];
  if (t < h.cooldowns[slot][step]) return false;
  if (chain.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return false;
  if (!canAfford(world, ab)) {
    ctx.events.push({ kind: 'noMana', slot });
    return false;
  }
  const aim = cast.aim ?? null;
  const at = aimPoint(ctx, ab, aim);
  if (!at) return false;

  // It goes ahead: a swing still winding up gives way first, so the step-in below survives.
  cancelSwing(ctx);
  h.push = null;
  h.recoverUntil = t;
  const chargePaid = chain.payment === 'charge' ? ab.chargeNeed : 0;
  pay(ctx, slot, step, ab, t + ab.channel);
  const dir = dirTo(h.x, h.y, at.x, at.y);
  if (dir.x !== 0 || dir.y !== 0) h.facing = dir;
  h.windup = {
    slot,
    aim,
    at,
    start: t,
    until: t + ab.castTime,
    step,
    conjureUntil: t + ab.conjure,
    chargePaid,
  };
  if (ab.motion > 0 && (dir.x !== 0 || dir.y !== 0)) {
    const stop = nearestMonster(ctx, at.x, at.y, 1.5);
    // Never past the aim point, where the form would re-aim from and turn round.
    const reach = Math.min(ab.motion * stepBonus(bal, ab.index).size, dist(h.x, h.y, at.x, at.y));
    startPush(ctx, dir, reach, ab.conjure, stop?.id ?? null);
  }
  ctx.events.push({ kind: 'windup', slot, until: h.windup.until, heft: stepHeft(ab) });
  return true;
}

/**
 * Land a finished wind-up: its press-time move. Auto-aim is chosen again now;
 * if nothing is left to aim at, it lands where the press aimed.
 */
export function castTick(ctx: SimCtx): void {
  const h = ctx.world.hero;
  if (!h.windup || ctx.world.t < h.windup.until - 1e-9) return;
  const { slot, aim, at, step } = h.windup;
  h.windup = null;
  // A step-in finishes before the blow lands, so it hits from where the step took the hero.
  pushTick(ctx, true);
  if (!fire(ctx, slot, aim, step)) fire(ctx, slot, at, step);
}
```

- [ ] **Step 12: The forms, the Defensive and the cancels**

In `packages/engine/src/arpg/abilities/forms.ts`, `executeForm` loses `step` and reads the move's step bonus; `buff()` replaces a running defensive (the Ward is set after it, so a Ward → Ward chain gets its fresh shell):

Replace:
```ts
import { stepHeft } from './resolve.js';
```
with:
```ts
import { stepBonus, stepHeft } from './resolve.js';
```

Replace:
```ts
 * Carry out an ability's form. `step` is the press-combo step (Primary forms
 * scale their size and power by `combo[step]`). Fails (nothing happens) when
 * there is nothing to aim at.
 */
export function executeForm(
  ctx: SimCtx,
  ab: ResolvedAbility,
  aim: Vec | null,
  step: number,
): FormResult {
```
with:
```ts
 * Carry out a move's form. A move after a chain's first lands with its step
 * bonus: harder, and a Bolt, a Lance or a Burst bigger. Fails (nothing
 * happens) when there is nothing to aim at.
 */
export function executeForm(ctx: SimCtx, ab: ResolvedAbility, aim: Vec | null): FormResult {
```

Replace:
```ts
  const mult = ab.combo[step % ab.combo.length];
  const hit = abilityHit(ctx, ab) * mult;
  const heft = stepHeft(ab, step);
  let dir = dirTo(h.x, h.y, p.x, p.y);
  if (dir.x === 0 && dir.y === 0) dir = { ...h.facing };
  const done = (tx: number, ty: number): FormResult => ({ ok: true, tx, ty });
  const buff = (form: 'ward' | 'armor' | 'surge' | 'blink', until: number) => {
    h.defend = { form, until };
```
with:
```ts
  const { power, size } = stepBonus(ctx.bal, ab.index);
  const hit = abilityHit(ctx, ab) * power;
  const heft = stepHeft(ab);
  let dir = dirTo(h.x, h.y, p.x, p.y);
  if (dir.x === 0 && dir.y === 0) dir = { ...h.facing };
  const done = (tx: number, ty: number): FormResult => ({ ok: true, tx, ty });
  // A Defensive move replaces the one up: its Ward (without a burst), Surge or Blink trail.
  const buff = (form: 'ward' | 'armor' | 'surge' | 'blink', until: number) => {
    h.ward = null;
    h.defend = { form, until, move: ab.index, stage: ab.stage };
```

Replace:
```ts
        radius: 0.3 + 0.15 * mult,
```
with:
```ts
        radius: 0.3 + 0.15 * size,
```

Replace:
```ts
        explodeRadius: ab.radius * mult,
```
with:
```ts
        explodeRadius: ab.radius * size,
```

Replace:
```ts
      const n = ab.comboCount?.[step % ab.comboCount.length] ?? ab.count;
```
with:
```ts
      const n = ab.count;
```

Replace:
```ts
      const len = ab.range * mult;
```
with:
```ts
      const len = ab.range * size;
```

Replace:
```ts
        radius: ab.radius * mult,
```
with:
```ts
        radius: ab.radius * size,
```

Replace:
```ts
      const slam = ab.combo.length > 1 && step % ab.combo.length === ab.combo.length - 1;
```
with:
```ts
      // The last move of a chain slams all around.
      const slam = ab.last;
```

Replace:
```ts
      h.ward = { hp: h.stats.maxHp * ab.effect, max: h.stats.maxHp * ab.effect };
      buff('ward', t + ab.duration);
```
with:
```ts
      buff('ward', t + ab.duration);
      h.ward = { hp: h.stats.maxHp * ab.effect, max: h.stats.maxHp * ab.effect };
```

In `packages/engine/src/arpg/abilities/defend.ts`, the Defensive's effect is `defend.move` at its stage, `wardBurst` takes the move that burst, and charge caps at the chain's largest need and waits while any move cools:

Replace:
```ts
import { abilityHit, impact } from './impact.js';

const DEFENSIVE = 1;

/** The Defensive ability while its effect is up, else null. */
export function defendingAbility(ctx: SimCtx): ResolvedAbility | null {
  const h = ctx.world.hero;
  if (!h.defend || ctx.world.t >= h.defend.until) return null;
  return h.abilities[DEFENSIVE] ?? null;
```
with:
```ts
import { abilityHit, impact } from './impact.js';
import { chainMove, chargeCap } from './resolve.js';

const DEFENSIVE = 1;

/** The Defensive move whose effect is up (`defend.move` at its stage), else null. */
export function defendingAbility(ctx: SimCtx): ResolvedAbility | null {
  const h = ctx.world.hero;
  if (!h.defend || ctx.world.t >= h.defend.until) return null;
  return chainMove(h.chains[DEFENSIVE], h.defend.move, h.defend.stage);
```

Replace:
```ts
/** The Ward bursts with its element around the hero. */
export function wardBurst(ctx: SimCtx): void {
  const h = ctx.world.hero;
  const ab = h.abilities[DEFENSIVE];
  h.ward = null;
  if (!ab) return;
```
with:
```ts
/** The Ward (the Defensive move `ab`) bursts with its element around the hero. */
export function wardBurst(ctx: SimCtx, ab: ResolvedAbility): void {
  const h = ctx.world.hero;
  h.ward = null;
```

Replace:
```ts
      wardBurst(ctx);
```
with:
```ts
      wardBurst(ctx, ab!);
```

Replace:
```ts
  if (world.t >= h.defend.until) {
    const wasWard = h.defend.form === 'ward' && h.ward;
    h.defend = null;
    if (wasWard) wardBurst(ctx);
    return;
  }
  const ab = h.abilities[DEFENSIVE];
  if (ab?.elements.includes('nature') && h.hp < h.stats.maxHp) {
```
with:
```ts
  const ab = chainMove(h.chains[DEFENSIVE], h.defend.move, h.defend.stage);
  if (world.t >= h.defend.until) {
    const wasWard = h.defend.form === 'ward' && h.ward;
    h.defend = null;
    if (wasWard) wardBurst(ctx, ab);
    return;
  }
  if (ab.elements.includes('nature') && h.hp < h.stats.maxHp) {
```

Replace:
```ts
 * Charge-paid abilities bank one unit per weapon-hit worth of damage the hero
 * deals; an ability never charges from its own hits, nor during its lockout.
```
with:
```ts
 * Charge-paid chains bank one unit per weapon-hit worth of damage the hero
 * deals, up to their largest need; a chain never charges from its own hits,
 * nor while any of its moves cools down (its lockout).
```

Replace:
```ts
  h.abilities.forEach((ab, i) => {
    if (ab.build.payment !== 'charge' || i === fromSlot || ctx.world.t < h.cooldowns[i]) return;
    h.charge[i] = Math.min(ab.chargeNeed, h.charge[i] + units);
```
with:
```ts
  const t = ctx.world.t;
  h.chains.forEach((chain, i) => {
    if (chain.payment !== 'charge' || i === fromSlot || h.cooldowns[i].some((c) => t < c)) return;
    h.charge[i] = Math.min(chargeCap(chain), h.charge[i] + units);
```

In `packages/engine/src/arpg/action.ts`, a cancelled wind-up frees its own move and refunds its charge up to the cap:

After:
```ts
import { clamp } from './geometry.js';
```
add:
```ts
import { chargeCap } from './abilities/resolve.js';
```

Replace:
```ts
/** Drop an ability's wind-up: the mana stays spent, the ability is ready again and its charge comes back. */
export function cancelWindup(h: HeroEntity, t: number): void {
  const w = h.windup;
  if (!w) return;
  h.cooldowns[w.slot] = t;
  h.charge[w.slot] = Math.min(h.abilities[w.slot].chargeNeed, h.charge[w.slot] + w.chargePaid);
```
with:
```ts
/** Drop an ability's wind-up: the mana stays spent, the move is ready again and its charge comes back. */
export function cancelWindup(h: HeroEntity, t: number): void {
  const w = h.windup;
  if (!w) return;
  h.cooldowns[w.slot][w.step] = t;
  h.charge[w.slot] = Math.min(chargeCap(h.chains[w.slot]), h.charge[w.slot] + w.chargePaid);
```

In `packages/engine/src/arpg/combat.ts` (read `pressStep` and `chargeCap` only inside functions: `combat.ts` and `abilities/` import each other):

Before:
```ts
import { notePerfect, refundDodgeCharge } from './dodge.js';
```
add:
```ts
import { pressStep } from './abilities/cast.js';
import { chargeCap } from './abilities/resolve.js';
```

Replace:
```ts
      // Per slot, as Nightstalker does for the Defensive.
      h.abilities.forEach((ab, i) => {
        if (ab.build.payment === 'charge') h.charge[i] = Math.min(ab.chargeNeed, h.charge[i] + 1);
        else if (h.cooldowns[i] > t)
          h.cooldowns[i] = Math.max(t, h.cooldowns[i] - r.galvanizeSeconds);
```
with:
```ts
      // Per slot, as Nightstalker does for the Defensive: a unit of charge, or every move's cooldown.
      h.chains.forEach((chain, i) => {
        if (chain.payment === 'charge') h.charge[i] = Math.min(chargeCap(chain), h.charge[i] + 1);
        else
          h.cooldowns[i] = h.cooldowns[i].map((c) =>
            c > t ? Math.max(t, c - r.galvanizeSeconds) : c,
          );
```

Replace:
```ts
  // Nightstalker: kills hurry the Defensive along.
  const guard = h.abilities[1];
  if (h.stats.legendaries.nightstalker && guard) {
    if (guard.build.payment === 'charge') h.charge[1] = Math.min(guard.chargeNeed, h.charge[1] + 1);
    else h.cooldowns[1] = Math.max(t, h.cooldowns[1] - 1);
```
with:
```ts
  // Nightstalker: kills hurry the Defensive's next move along.
  const guard = h.chains[1];
  if (h.stats.legendaries.nightstalker && guard) {
    if (guard.payment === 'charge') h.charge[1] = Math.min(chargeCap(guard), h.charge[1] + 1);
    else {
      const step = pressStep(h, 1, t, bal.abilities.comboWindow);
      h.cooldowns[1][step] = Math.max(t, h.cooldowns[1][step] - 1);
    }
```

- [ ] **Step 13: The world, the step, the sandbox, the bot and the DPS sim**

In `packages/engine/src/arpg/world.ts`, floors take chains, the hero resolves them with a cooldown per move, and `refreshWorldHero` swaps chains (`sameChain`):

Replace:
```ts
  type AbilityBuild,
  type AbilityBuilds,
  type ResolvedAbility,
} from '../types/ability.js';
import { manaPool } from '../delve/hero-stats.js';
import { resolveAbility } from './abilities/resolve.js';
```
with:
```ts
  type AbilitySlot,
  type Chain,
  type Chains,
  type ResolvedChain,
} from '../types/ability.js';
import { manaPool } from '../delve/hero-stats.js';
import { chargeCap, resolveChain } from './abilities/resolve.js';
```

Replace:
```ts
  /** The profile's Primary, Defensive and Ultimate builds. */
  abilities: AbilityBuilds;
```
with:
```ts
  /** The Primary's, Defensive's and Ultimate's chains (the basic chain is in `stats`). */
  chains: Pick<Chains, AbilitySlot>;
```

Replace:
```ts
  builds: AbilityBuilds,
  stats: HeroStats,
): ResolvedAbility[] {
  return ABILITY_SLOTS.map((slot) => resolveAbility(registry, slot, builds[slot], stats));
```
with:
```ts
  chains: Pick<Chains, AbilitySlot>,
  stats: HeroStats,
): ResolvedChain[] {
  return ABILITY_SLOTS.map((slot) => resolveChain(registry, stats, slot, chains[slot]));
```

Replace:
```ts
  builds: AbilityBuilds,
  opts: { hpFrac: number; potions: number; phoenixAvailable: boolean; x: number; y: number },
): HeroEntity {
  const pool = manaPool(stats, registry);
```
with:
```ts
  chains: Pick<Chains, AbilitySlot>,
  opts: { hpFrac: number; potions: number; phoenixAvailable: boolean; x: number; y: number },
): HeroEntity {
  const pool = manaPool(stats, registry);
  const resolved = resolveAll(registry, chains, stats);
```

Replace:
```ts
    abilities: resolveAll(registry, builds, stats),
    cooldowns: [0, 0, 0],
```
with:
```ts
    chains: resolved,
    cooldowns: resolved.map((c) => c.moves.map(() => 0)),
```

Replace:
```ts
 * Swap in new gear stats and builds mid-floor: abilities re-resolve and the
 * pool resizes, keeping the life fraction and current mana (clamped). Charge,
 * combos and cooldowns carry over. A slot whose build changed drops its
 * wind-up (as a dodge does), and a new Defensive ends the old one's buff and
 * Ward at once, without bursting.
```
with:
```ts
 * Swap in new gear stats and chains mid-floor: the chains re-resolve and the
 * pool resizes, keeping the life fraction and current mana (clamped). Charge
 * (clamped to each chain's largest need), combos (clamped to a shortened
 * chain) and each move's cooldown carry over. A slot whose chain changed
 * drops its wind-up (as a dodge does), and a new Defensive ends the old one's
 * buff and Ward at once, without bursting.
```

Replace:
```ts
  builds: AbilityBuilds,
```
with:
```ts
  chains: Pick<Chains, AbilitySlot>,
```

Replace:
```ts
  const changed = ABILITY_SLOTS.map((slot, i) => !sameBuild(h.abilities[i]?.build, builds[slot]));
```
with:
```ts
  const changed = ABILITY_SLOTS.map((slot, i) => !sameChain(h.chains[i], chains[slot]));
```

Replace:
```ts
  h.abilities = resolveAll(registry, builds, stats);
  h.abilities.forEach((ab, i) => (h.charge[i] = Math.min(h.charge[i], ab.chargeNeed)));
}

function sameBuild(a: AbilityBuild | undefined, b: AbilityBuild): boolean {
  return (
    !!a &&
    a.form === b.form &&
    a.weight === b.weight &&
    a.payment === b.payment &&
    a.elements.join() === b.elements.join()
```
with:
```ts
  h.chains = resolveAll(registry, chains, stats);
  h.chains.forEach((chain, i) => {
    h.cooldowns[i] = chain.moves.map((_, j) => h.cooldowns[i][j] ?? 0);
    h.comboStep[i] = Math.min(h.comboStep[i], chain.moves.length - 1);
    h.charge[i] = Math.min(h.charge[i], chargeCap(chain));
  });
}

function sameChain(a: ResolvedChain | undefined, b: Chain): boolean {
  return (
    !!a &&
    a.payment === b.payment &&
    a.moves.length === b.moves.length &&
    a.moves.every(
      (m, i) =>
        m.kind === b.moves[i].kind &&
        m.form.id === b.moves[i].form &&
        m.elements.join() === b.moves[i].elements.join(),
    )
```

Replace:
```ts
    hero: createHeroEntity(registry, opts.stats, opts.abilities, {
```
with:
```ts
    hero: createHeroEntity(registry, opts.stats, opts.chains, {
```

In `packages/engine/src/arpg/step.ts`, a buffered press waits for its own move's cooldown, and No cooldowns fills each chain to its cap:

Replace:
```ts
import { castAbility, castTick } from './abilities/cast.js';
import { defendTick, gainCharge, surging } from './abilities/defend.js';
import { impact } from './abilities/impact.js';
```
with:
```ts
import { castAbility, castTick, pressStep } from './abilities/cast.js';
import { defendTick, gainCharge, surging } from './abilities/defend.js';
import { impact } from './abilities/impact.js';
import { chargeCap } from './abilities/resolve.js';
```

Replace:
```ts
  // A press on cooldown stays queued (ageing) and fires if the cooldown ends in time.
  if (
    world.queuedCast !== null &&
    !dashing &&
    !h.windup &&
    t >= h.cooldowns[world.queuedCast.slot]
  ) {
    const cast = world.queuedCast;
    world.queuedCast = null;
    castAbility(ctx, cast);
```
with:
```ts
  // A press whose move is on cooldown stays queued (ageing) and fires if the cooldown ends in time.
  const q = world.queuedCast;
  if (
    q !== null &&
    !dashing &&
    !h.windup &&
    !!h.chains[q.slot] &&
    t >= h.cooldowns[q.slot][pressStep(h, q.slot, t, bal.abilities.comboWindow)]
  ) {
    world.queuedCast = null;
    castAbility(ctx, q);
```

Replace:
```ts
  // No cooldowns (Training Grounds) keeps every charge-paid ability charged.
  if (world.sandbox?.noCooldowns)
    h.abilities.forEach((ab, i) => {
      if (ab.build.payment === 'charge') h.charge[i] = ab.chargeNeed;
```
with:
```ts
  // No cooldowns (Training Grounds) keeps every charge-paid chain charged.
  if (world.sandbox?.noCooldowns)
    h.chains.forEach((chain, i) => {
      if (chain.payment === 'charge') h.charge[i] = chargeCap(chain);
```

In `packages/engine/src/arpg/sandbox.ts`:

Replace:
```ts
import type { AbilityBuilds } from '../types/ability.js';
```
with:
```ts
import type { AbilitySlot, Chains } from '../types/ability.js';
```

Before:
```ts
import { clamp } from './geometry.js';
```
add:
```ts
import { chargeCap } from './abilities/resolve.js';
```

Replace:
```ts
  abilities: AbilityBuilds;
```
with:
```ts
  /** The Primary's, Defensive's and Ultimate's chains (the basic chain is in `stats`). */
  chains: Pick<Chains, AbilitySlot>;
```

Replace:
```ts
    abilities: o.abilities,
```
with:
```ts
    chains: o.chains,
```

Replace:
```ts
  // Switching No cooldowns on frees and charges every ability at once (the tick keeps them so).
  if (toggles.noCooldowns) {
    world.hero.cooldowns = world.hero.cooldowns.map((c) => Math.min(c, world.t));
```
with:
```ts
  // Switching No cooldowns on frees every move and charges every chain at once (the tick keeps them so).
  if (toggles.noCooldowns) {
    world.hero.cooldowns = world.hero.cooldowns.map((cs) => cs.map((c) => Math.min(c, world.t)));
```

Replace:
```ts
/** Fill every charge-paid slot (for when No cooldowns is off). */
export function fillCharge(world: ArpgWorld): void {
  const h = world.hero;
  h.abilities.forEach((ab, i) => {
    if (ab.build.payment === 'charge') h.charge[i] = ab.chargeNeed;
```
with:
```ts
/** Fill every charge-paid chain to its largest need (for when No cooldowns is off). */
export function fillCharge(world: ArpgWorld): void {
  const h = world.hero;
  h.chains.forEach((chain, i) => {
    if (chain.payment === 'charge') h.charge[i] = chargeCap(chain);
```

In `packages/engine/src/arpg/bot.ts`, the Primary's reach is its next move's:

Replace:
```ts
import { abilityReady } from './abilities/cast.js';
```
with:
```ts
import { abilityReady, nextMove } from './abilities/cast.js';
```

Replace:
```ts
    gap < h.abilities[0].range && !h.swing && abilityReady(ctx, 0) ? 0 : -1,
```
with:
```ts
    gap < nextMove(h, 0, world.t, ctx.bal.abilities.comboWindow).range &&
    !h.swing &&
    abilityReady(ctx, 0)
      ? 0
      : -1,
```

In `packages/engine/src/arpg/dps-sim.ts` (until Task 7 rewrites the grid, its build setups play as chains):

Before:
```ts
import { dist } from './geometry.js';
```
add:
```ts
import { buildChains } from '../delve/profile.js';
```

Replace:
```ts
    abilities: setup.abilities,
```
with:
```ts
    chains: buildChains(registry, setup.abilities),
```

---

## Chunk 6: Engine: the hero plays chains (Task 3 continued: stats, the profile's builds as chains, exports)

- [ ] **Step 14: Stats, builds as chains, and the exports**

In `packages/engine/src/delve/hero-stats.ts`, `estimateCombat` values chains: a use's damage averages the chain's moves, each with its step bonus, as does the interval between uses; the Defensive's effect is its first move's; the default is `defaultChains` on the weapon's element:

Replace:
```ts
import { ABILITY_SLOTS, type AbilityBuilds, type ResolvedAbility } from '../types/ability.js';
import { defaultAbilities, resolveAbility } from '../arpg/abilities/resolve.js';
```
with:
```ts
import {
  ABILITY_SLOTS,
  type AbilitySlot,
  type Chains,
  type ResolvedChain,
} from '../types/ability.js';
import { defaultChains, resolveChain, stepBonus } from '../arpg/abilities/resolve.js';
```

Replace:
```ts
/** Damage of one use, counting combos, chains, lingering ground and repeats. */
function damagePerUse(
  ab: ResolvedAbility,
```
with:
```ts
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Damage of one use of a chain, averaged over its moves (each with its step
 * bonus), counting jumps, lingering ground and repeats.
 */
function damagePerUse(
  chain: ResolvedChain,
```

Replace:
```ts
  const combo = ab.combo.reduce((a, b) => a + b, 0) / ab.combo.length;
  const targets = TARGETS[ab.form.id] * (1 + (ab.knobs.area - 1) * 0.5);
  const repeats =
    ab.form.id === 'barrage' ? ab.count : ab.form.id === 'maelstrom' ? ab.duration / ab.tick : 1;
  let chain = 0;
  for (let i = 1; i <= ab.knobs.chain; i++) chain += Math.pow(bal.abilities.chainPower, i);
  const zone = ab.knobs.zone
    ? (ab.knobs.zone.seconds / 0.5) * ab.knobs.zone.tickPower * targets
    : 0;
  const perHit = hit * ab.power * combo * (1 + stats.elementPower[ab.element]);
  return perHit * (targets + chain + zone) * repeats;
}

/** Seconds between uses when the ability is used as often as its payment allows. */
function useInterval(ab: ResolvedAbility, manaIncome: number, chargeRate: number): number {
  if (ab.build.payment === 'charge')
    return Math.max(ab.cooldown, ab.chargeNeed / Math.max(0.1, chargeRate));
  return Math.max(ab.cooldown + ab.channel, ab.cost / Math.max(0.1, manaIncome));
```
with:
```ts
  return mean(
    chain.moves.map((ab) => {
      const targets = TARGETS[ab.form.id] * (1 + (ab.knobs.area - 1) * 0.5);
      const repeats =
        ab.form.id === 'barrage'
          ? ab.count
          : ab.form.id === 'maelstrom'
            ? ab.duration / ab.tick
            : 1;
      let jumps = 0;
      for (let i = 1; i <= ab.knobs.chain; i++) jumps += Math.pow(bal.abilities.chainPower, i);
      const zone = ab.knobs.zone
        ? (ab.knobs.zone.seconds / 0.5) * ab.knobs.zone.tickPower * targets
        : 0;
      const step = stepBonus(bal, ab.index).power;
      const perHit = hit * ab.power * step * (1 + stats.elementPower[ab.element]);
      return perHit * (targets + jumps + zone) * repeats;
    }),
  );
}

/** Seconds between uses, averaged over the chain's moves, when used as often as the payment allows. */
function useInterval(chain: ResolvedChain, manaIncome: number, chargeRate: number): number {
  return mean(
    chain.moves.map((ab) =>
      chain.payment === 'charge'
        ? Math.max(ab.cooldown, ab.chargeNeed / Math.max(0.1, chargeRate))
        : Math.max(ab.cooldown + ab.channel, ab.cost / Math.max(0.1, manaIncome)),
    ),
  );
```

Replace:
```ts
  builds: AbilityBuilds = defaultAbilities(stats.weapon.element ?? 'fire'),
```
with:
```ts
  chains: Pick<Chains, AbilitySlot> = defaultChains(
    registry,
    stats.weapon.element ?? 'fire',
    stats.weapon.baseId,
  ),
```

Replace:
```ts
    resolveAbility(registry, slot, builds[slot], stats),
```
with:
```ts
    resolveChain(registry, stats, slot, chains[slot]),
```

Replace:
```ts
  const guardFor =
    defensive.form.id === 'blink' ? bal.abilities.defend.blinkSeconds : defensive.duration;
  const uptime = Math.min(1, guardFor / Math.max(guardFor, guardEvery));
  if (defensive.form.id === 'armor') mitigation *= 1 - Math.min(0.75, defensive.effect) * uptime;
  if (defensive.elements.includes('earth'))
    mitigation *= 1 - bal.abilities.defend.earthReduction * uptime;
  if (defensive.form.id === 'ward') bonusLife += stats.maxHp * defensive.effect * uptime * 2;
  if (defensive.form.id === 'surge') dps *= 1 + defensive.effect * uptime;
  if (defensive.form.id === 'blink') mitigation *= 1 - 0.3 * uptime;
```
with:
```ts
  // The Defensive's effect: its first move's.
  const guard = defensive.moves[0];
  const guardFor = guard.form.id === 'blink' ? bal.abilities.defend.blinkSeconds : guard.duration;
  const uptime = Math.min(1, guardFor / Math.max(guardFor, guardEvery));
  if (guard.form.id === 'armor') mitigation *= 1 - Math.min(0.75, guard.effect) * uptime;
  if (guard.elements.includes('earth'))
    mitigation *= 1 - bal.abilities.defend.earthReduction * uptime;
  if (guard.form.id === 'ward') bonusLife += stats.maxHp * guard.effect * uptime * 2;
  if (guard.form.id === 'surge') dps *= 1 + guard.effect * uptime;
  if (guard.form.id === 'blink') mitigation *= 1 - 0.3 * uptime;
```

Replace:
```ts
  builds?: AbilityBuilds,
  /** The hero's pair (its basics and the two-element limit); none counts every element. */
  pair?: ManaPair,
): ItemComparison {
```
with:
```ts
  chains?: Pick<Chains, AbilitySlot>,
  /** The hero's pair (its basics and the two-element limit); none counts every element. */
  pair?: ManaPair,
): ItemComparison {
```

Replace:
```ts
  const before = estimateCombat(beforeStats, registry, depth, builds);
  const after = estimateCombat(afterStats, registry, depth, builds);
```
with:
```ts
  const before = estimateCombat(beforeStats, registry, depth, chains);
  const after = estimateCombat(afterStats, registry, depth, chains);
```

Replace:
```ts
  builds?: AbilityBuilds,
```
with:
```ts
  chains?: Pick<Chains, AbilitySlot>,
```

Replace:
```ts
  return estimateCombat(stats, registry, depth, builds).power;
```
with:
```ts
  return estimateCombat(stats, registry, depth, chains).power;
```

In `packages/engine/src/delve/profile.ts`, `chainFromBuild` and `buildChains` (the version 4 builds as chains), and `profilePower` values them:

Replace:
```ts
  ABILITY_WEIGHTS,
  type AbilityBuild,
  type AbilitySlot,
```
with:
```ts
  ABILITY_SLOTS,
  ABILITY_WEIGHTS,
  type AbilityBuild,
  type AbilityBuilds,
  type AbilitySlot,
  type Chain,
  type Chains,
  type MoveKind,
```

Replace:
```ts
/** A save read back: the profile, and the build slots a migration changed (for a notice). */
```
with:
```ts
const STRENGTH: MoveKind[] = ['light', 'medium', 'heavy'];

/**
 * A version 4 build as a chain: its form's default chain, each move a step
 * lighter for a light build (weight −2 or −1) and a step heavier for a heavy
 * one (+1 or +2), within light..heavy, with the build's elements and payment.
 */
export function chainFromBuild(registry: DataRegistry, build: AbilityBuild): Chain {
  const shift = Math.sign(build.weight);
  return {
    moves: registry.getForm(build.form).defaultChain.map((kind) => ({
      kind: STRENGTH[Math.max(0, Math.min(2, STRENGTH.indexOf(kind) + shift))],
      form: build.form,
      elements: [...build.elements],
    })),
    payment: build.payment,
  };
}

/** Version 4 builds as the three ability chains. */
export function buildChains(
  registry: DataRegistry,
  builds: AbilityBuilds,
): Pick<Chains, AbilitySlot> {
  const [primary, defensive, ultimate] = ABILITY_SLOTS.map((slot) =>
    chainFromBuild(registry, builds[slot]),
  );
  return { primary, defensive, ultimate };
}

/** A save read back: the profile, and the build slots a migration changed (for a notice). */
```

Replace:
```ts
    profile.abilities,
```
with:
```ts
    buildChains(registry, profile.abilities),
```

In `packages/engine/src/delve/dive.ts` (CRLF: hand-edit):

Replace:
```ts
import { addLootToBag } from './profile.js';
```
with:
```ts
import { addLootToBag, buildChains } from './profile.js';
```

Replace:
```ts
    abilities: profile.abilities,
```
with:
```ts
    chains: buildChains(registry, profile.abilities),
```

In `packages/engine/src/delve/autopilot.ts` (CRLF: hand-edit):

Before:
```ts
  createDelveProfile,
```
add:
```ts
  buildChains,
```

Replace:
```ts
        refreshWorldHero(registry, world, profileStats(registry, p), p.abilities);
```
with:
```ts
        refreshWorldHero(
          registry,
          world,
          profileStats(registry, p),
          buildChains(registry, p.abilities),
        );
```

In `packages/engine/src/index.ts`:

After:
```ts
  setAbility,
```
add:
```ts
  chainFromBuild,
  buildChains,
```

Replace:
```ts
export { castAbility, abilityReady, canAfford, pressStep } from './arpg/abilities/cast.js';
export {
  resolveAbility,
  mergeKnobs,
  defaultAbilities,
```
with:
```ts
export {
  castAbility,
  abilityReady,
  canAfford,
  pressStep,
  nextMove,
  activeMove,
} from './arpg/abilities/cast.js';
export {
  resolveAbility,
  resolveChain,
  moveWeight,
  chainMove,
  chargeCap,
  stepBonus,
  mergeKnobs,
  defaultAbilities,
  defaultBasic,
  defaultChains,
```

- [ ] **Step 15: Run them to verify they pass**

Run the Step 7 command again.
Expected: PASS (378).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1222 tests pass (the pacing rails included).

- [ ] **Step 16: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/data/schemas.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/abilities/forms.ts packages/engine/src/arpg/abilities/defend.ts packages/engine/src/arpg/action.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/arpg/bot.ts packages/engine/src/arpg/dps-sim.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/delve/profile.ts packages/engine/src/index.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/ability-resolve.test.ts packages/engine/tests/ability-forms.test.ts packages/engine/tests/ability-cast.test.ts packages/engine/tests/arpg-sim.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/delve-training.test.ts packages/engine/tests/delve-reactions.test.ts packages/engine/tests/delve-stacks.test.ts packages/engine/tests/delve-infusion.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-dodge.test.ts
git add packages/engine/src/types/ability.ts packages/engine/src/types/arpg.ts packages/engine/src/data/arpg.json packages/engine/src/data/schemas.ts packages/engine/src/arpg/abilities/resolve.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/abilities/forms.ts packages/engine/src/arpg/abilities/defend.ts packages/engine/src/arpg/action.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/arpg/bot.ts packages/engine/src/arpg/dps-sim.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/dive.ts packages/engine/src/delve/autopilot.ts packages/engine/src/index.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/ability-resolve.test.ts packages/engine/tests/ability-forms.test.ts packages/engine/tests/ability-cast.test.ts packages/engine/tests/arpg-sim.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/delve-training.test.ts packages/engine/tests/delve-reactions.test.ts packages/engine/tests/delve-stacks.test.ts packages/engine/tests/delve-infusion.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-dodge.test.ts
git commit -m "feat(engine): the hero plays chains: each press casts the chain's next move, with its step bonus and its own cooldown" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 7: Engine: holds

### Task 4: Hold moves

A hold is a hero state, `h.hold = { slot, step, start, aim }`, that nothing pays for until it fires. Each step, in `heroTick` after the queued-cast buffer and before `castTick` (`holdTick`):
- **Starting.** With no hold running, `input.holding` naming a slot whose next move is a hold starts one when the hero is free as a press needs (no wind-up; a swing in its startup gives way, the push and recovery clear) and the move's first stage is affordable (its cooldown, the charge meter against the hold's need, its cost). Not while dashing. The hero faces what it would aim at and stays rooted.
- **Charging.** `holdCharge(bal, start, t)` is `min(1, (t − start) / holdTime)` and its stage (0, 1 or 2 by `holdStages`); each rise emits `holdStage { slot, stage }`. The slot's combo window is paused (`comboAt` moves with the clock).
- **Firing.** A `cast` for the holding slot is its release: `stepWorld` routes it to `world.queuedRelease` (never to the buffer), and `holdTick` fires `hold[step][stage]` at once (the charge was its wind-up: no conjure, no step-in, every payment alike) at the release's aim, else what it aimed at when it began, paying that stage's cost and setting its cooldown from now; a stage it can't afford falls to the highest it can, and with none (or nothing to aim at) the hold ends unpaid. Past `holdMax` it fires by itself at stage 2; if `holding` stops without a release (a lost release) it fires at its current stage.
- **Cancelling.** A dodge, `input.cancelHold` (`stepWorld` drops the hold before the tick) and `refreshWorldHero` on a changed slot drop it unpaid; a respawn clears it.
- **Gating.** A hold gates presses as a wind-up does (`castAbility`, `abilityReady`), holds the buffered press unaged (another slot's press fires after the release), and blocks swings and queued attack taps.
- **A tap.** A `cast` for a slot whose next move is a hold with no hold running fires stage 0 at once: a medium hit.
- **The bot** holds a hold to full charge, then releases; it never taps one.

**Files:**
- Modify: `packages/engine/src/types/arpg.ts:323,393-394,456,599` (`HeroEntity.hold`, `ArpgInput.holding`/`cancelHold`, the `holdStage` event, `ArpgWorld.queuedRelease`)
- Modify: `packages/engine/src/arpg/abilities/cast.ts:3,21-22,42-55,105,122,147` (`holdCharge`, `fire` at a stage, the gates, a tap, `startHold`, `releaseHold`, `holdTick`)
- Modify: `packages/engine/src/arpg/step.ts:22,51-59,136-192` (release routing, `cancelHold`, `holdTick`, the gates), `world.ts:209,238-265,337`, `dodge.ts:39-40`, `sandbox.ts:278`, `bot.ts:5,13-14,63,105`, `packages/engine/src/index.ts:204`
- Modify: `packages/engine/tests/fixtures/arena.ts:148` (`holdFor`)
- Test: `packages/engine/tests/delve-chains.test.ts`, `packages/engine/tests/delve-combat-weight.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/fixtures/arena.ts`, after `press`, a helper that holds a slot's button for a while and then lets go:

Replace:
```ts
/** The slot's move `step` (its first by default), as the hero resolved it. */
```
with:
```ts
/**
 * Hold the slot's button for `seconds` (a hold move charges meanwhile), then let
 * go with its release; returns every event.
 */
export function holdFor(
  w: ArpgWorld,
  slot: number,
  seconds: number,
  aim: { x: number; y: number } | null = null,
): ArpgEvent[] {
  const still = { x: 0, y: 0 };
  const events: ArpgEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++)
    events.push(...stepWorld(registry, w, { move: still, holding: slot }, STEP));
  events.push(...stepWorld(registry, w, { move: still, cast: { slot, aim } }, STEP));
  return events;
}

/** The slot's move `step` (its first by default), as the hero resolved it. */
```

In `packages/engine/tests/delve-chains.test.ts`, the imports, then the hold tests after the chain-play block:

Replace:
```ts
import { activeMove, nextMove } from '../src/arpg/abilities/cast.js';
```
with:
```ts
import { abilityReady, activeMove, holdCharge, nextMove } from '../src/arpg/abilities/cast.js';
```

Replace:
```ts
  dummy,
```
with:
```ts
  dodge,
  dummy,
  holdFor,
```

Replace:
```ts
    expect([...steps].sort()).toEqual([0, 1, 2, 3]);
  });
});
```
with:
```ts
    expect([...steps].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('holds', () => {
  const still = { x: 0, y: 0 };
  const holdStep = (w: ReturnType<typeof arena>, slot = 0, move = still) =>
    stepWorld(registry, w, { move, holding: slot }, STEP);
  /** A Fire Bolt chain of `moves` (one hold by default), basic attacks off, a foe up the arena. */
  const holder = (moves: Move[] = [m('hold')]) =>
    arena([dummy(13, 30)], { noBasic: true, primary: { moves } });
  const casts = (events: ArpgEvent[]) =>
    events.filter((e): e is Extract<ArpgEvent, { kind: 'cast' }> => e.kind === 'cast');

  it('holding starts a charge only when the next move is a hold: rooted, and paying nothing yet', () => {
    const plain = holder([m('medium')]);
    holdStep(plain);
    expect(plain.hero.hold).toBeNull();
    expect(plain.hero.windup).toBeNull();

    const w = holder();
    w.hero.manaRegen = 0;
    const mana = w.hero.mana;
    const x = w.hero.x;
    holdStep(w, 0, { x: 1, y: 0 });
    expect(w.hero.hold).toMatchObject({ slot: 0, step: 0, start: w.t });
    expect(w.hero.hold!.aim).toMatchObject({ x: 13, y: 30 });
    holdStep(w, 0, { x: 1, y: 0 });
    expect(w.hero.x).toBe(x);
    expect(w.hero.mana).toBe(mana);
    expect(activeMove(w.hero, 0)?.kind).toBe('hold');
  });

  it('a hold starting cancels a swing still in its startup', () => {
    const w = arena([dummy(13, 34.4)], { primary: { kind: 'hold' } });
    run(w, STEP);
    expect(w.hero.swing).not.toBeNull();
    holdStep(w);
    expect(w.hero.swing).toBeNull();
    expect(w.hero.hold).not.toBeNull();
  });

  it('reaches stage 1 at 0.33 of holdTime and stage 2 at 0.66, saying so each time', () => {
    const w = holder();
    const events: ArpgEvent[] = [];
    for (let i = 0; i < Math.round(1.2 / STEP); i++) events.push(...holdStep(w));
    const start = w.hero.hold!.start;
    const stages = events.filter((e) => e.kind === 'holdStage');
    expect(stages.map((e) => e.kind === 'holdStage' && [e.slot, e.stage])).toEqual([
      [0, 1],
      [0, 2],
    ]);
    const c = bal.chains;
    expect(holdCharge(bal, start, start + c.holdStages[0] * c.holdTime - 0.01).stage).toBe(0);
    expect(holdCharge(bal, start, start + c.holdStages[0] * c.holdTime + 0.01).stage).toBe(1);
    expect(holdCharge(bal, start, start + c.holdStages[1] * c.holdTime + 0.01).stage).toBe(2);
    expect(holdCharge(bal, start, start + c.holdTime).charge).toBe(1);
  });

  it("its release fires the stage's move at once, paying its cost and setting its cooldown and stacks", () => {
    const w = holder();
    w.hero.manaRegen = 0;
    const mana = w.hero.mana;
    const events = holdFor(w, 0, 0.5);
    const stage1 = w.hero.chains[0].hold[0]![1];
    expect(casts(events)).toHaveLength(1);
    expect(events.some((e) => e.kind === 'windup')).toBe(false);
    expect(w.hero.hold).toBeNull();
    expect(mana - w.hero.mana).toBeCloseTo(stage1.cost);
    expect(w.hero.cooldowns[0][0]).toBeCloseTo(w.t + stage1.cooldown);
    expect(w.projectiles.at(-1)!.explodeRadius).toBeCloseTo(stage1.radius);
    run(w, 1);
    expect(w.monsters[0].status.stacks.fire).toBe(stage1.stacks);
  });

  it('a tap fires stage 0 at once: a medium hit', () => {
    const w = holder();
    w.hero.manaRegen = 0;
    const mana = w.hero.mana;
    const events = pressOnly(w, 0);
    expect(casts(events)).toHaveLength(1);
    expect(w.hero.windup).toBeNull();
    expect(mana - w.hero.mana).toBeCloseTo(moveOf(w, 0).cost);
    expect(moveOf(w, 0).weight).toBe(0);
  });

  it('fires by itself at stage 2 past holdMax, and at its stage when the button lets go unreleased', () => {
    const w = holder();
    w.hero.manaRegen = 0;
    const mana = w.hero.mana;
    const events: ArpgEvent[] = [];
    for (let i = 0; i < Math.round((bal.chains.holdMax + 0.1) / STEP); i++)
      events.push(...holdStep(w));
    expect(casts(events)).toHaveLength(1);
    expect(mana - w.hero.mana).toBeCloseTo(w.hero.chains[0].hold[0]![2].cost);

    const lost = holder();
    lost.hero.manaRegen = 0;
    const before = lost.hero.mana;
    for (let i = 0; i < Math.round(0.5 / STEP); i++) holdStep(lost);
    const e = stepWorld(registry, lost, { move: still }, STEP);
    expect(casts(e)).toHaveLength(1);
    expect(before - lost.hero.mana).toBeCloseTo(lost.hero.chains[0].hold[0]![1].cost);
  });

  it('a stage it cannot afford at the release falls to the highest it can; none, and it ends unpaid', () => {
    const w = holder();
    w.hero.manaRegen = 0;
    const [stage0, stage1] = w.hero.chains[0].hold[0]!;
    for (let i = 0; i < Math.round(1.2 / STEP); i++) holdStep(w);
    w.hero.mana = stage1.cost + 0.1;
    const events = stepWorld(registry, w, { move: still, cast: { slot: 0 } }, STEP);
    expect(casts(events)).toHaveLength(1);
    expect(w.hero.mana).toBeCloseTo(0.1);

    const broke = holder();
    broke.hero.manaRegen = 0;
    holdStep(broke);
    broke.hero.mana = stage0.cost - 0.1;
    const none = holdFor(broke, 0, 0.5);
    expect(casts(none)).toHaveLength(0);
    expect(broke.hero.hold).toBeNull();
    expect(broke.hero.mana).toBeCloseTo(stage0.cost - 0.1);
    expect(broke.hero.cooldowns[0][0]).toBe(0);
  });

  it('a dodge, cancelHold and a changed chain drop it unpaid', () => {
    const cases: [string, (w: ReturnType<typeof arena>) => void][] = [
      ['dodge', (w) => dodge(w, { x: 1, y: 0 })],
      ['cancelHold', (w) => stepWorld(registry, w, { move: still, cancelHold: true }, STEP)],
      [
        'refresh',
        (w) =>
          refreshWorldHero(registry, w, w.hero.stats, chainsWith({ primary: { kind: 'heavy' } })),
      ],
    ];
    for (const [name, drop] of cases) {
      const w = holder();
      w.hero.manaRegen = 0;
      const mana = w.hero.mana;
      for (let i = 0; i < 10; i++) holdStep(w);
      drop(w);
      expect(w.hero.hold, name).toBeNull();
      expect(w.hero.mana, name).toBe(mana);
      expect(w.hero.cooldowns[0][0], name).toBe(0);
    }
  });

  it("gates presses as a wind-up does: another slot's press waits, unaged, and fires after the release", () => {
    const w = holder();
    holdStep(w);
    expect(abilityReady(makeCtx(registry, w, []), 1)).toBe(false);
    stepWorld(registry, w, { move: still, holding: 0, cast: { slot: 1 } }, STEP);
    for (let i = 0; i < Math.round(0.6 / STEP); i++) holdStep(w);
    expect(w.hero.windup).toBeNull();
    expect(w.queuedCast).toMatchObject({ slot: 1 });
    const events = holdFor(w, 0, 0);
    events.push(...run(w, 0.5));
    expect(casts(events).map((e) => e.slot)).toEqual([0, 1]);
  });

  it("pauses the slot's combo window while it charges", () => {
    const w = holder([m('light'), m('hold')]);
    press(w, 0);
    for (let i = 0; i < Math.round(1.5 / STEP); i++) holdStep(w);
    expect(w.hero.hold?.step).toBe(1);
    // Past the window since the light landed, but not counting the hold: the hold is still next.
    dodge(w, { x: 1, y: 0 });
    expect(w.hero.hold).toBeNull();
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(1);
  });

  it('the bot charges a hold to full, then lets go', () => {
    const w = holder();
    w.hero.cooldowns[1] = [1e9];
    w.hero.cooldowns[2] = [1e9];
    const events: ArpgEvent[] = [];
    let start = -1;
    for (let i = 0; i < Math.round(1.5 / STEP) && casts(events).length === 0; i++) {
      events.push(...stepWorld(registry, w, botInput(registry, w), STEP));
      if (w.hero.hold && start < 0) start = w.hero.hold.start;
    }
    expect(start).toBeGreaterThanOrEqual(0);
    expect(casts(events)).toHaveLength(1);
    expect(w.t - start).toBeGreaterThanOrEqual(bal.chains.holdTime - 1e-6);
  });
});
```

In `packages/engine/tests/delve-combat-weight.test.ts`, the Crushing payoff is a hold's full charge:

Before:
```ts
  moveOf,
```
add:
```ts
  holdFor,
```

Replace:
```ts
  it('a heavy bolt lands with its heft and no stagger (only Crushing, a full hold, staggers)', () => {
```
with:
```ts
  it('a fully held bolt (Crushing) knocks back and staggers; a medium one does not stagger', () => {
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { kind: 'hold' } });
    const events = holdFor(w, 0, bal.chains.holdTime);
    events.push(...run(w, 1));
    expect(w.monsters[0].status.staggerUntil).toBeGreaterThan(0);
    const hit = events.find((e) => e.kind === 'hit' && e.id === w.monsters[0].id);
    expect(hit && hit.kind === 'hit' && hit.heft).toBeCloseTo(1);
    const b = arena([dummy(13, 30)], { noBasic: true });
    press(b, 0);
    run(b, 1);
    expect(b.monsters[0].status.staggerUntil).toBe(0);
  });

  it('a heavy bolt lands with its heft and no stagger (only Crushing, a full hold, staggers)', () => {
```

Replace:
```ts
      ultimate: { form: 'maelstrom', kind: 'heavy', payment: 'mana' },
    });
    w.hero.mana = w.hero.manaMax = 1e6;
    const events = press(w, 2, { x: 13, y: 30 });
```
with:
```ts
      ultimate: { form: 'maelstrom', kind: 'hold', payment: 'mana' },
    });
    w.hero.mana = w.hero.manaMax = 1e6;
    const events = holdFor(w, 2, bal.chains.holdTime, { x: 13, y: 30 });
```

Replace:
```ts
    const s = arena([dummy(13, 0)], { defensive: { form: 'surge', kind: 'heavy' } });
    place(s, 0.6);
    press(s, 1);
```
with:
```ts
    const s = arena([dummy(13, 0)], { defensive: { form: 'surge', kind: 'hold' } });
    place(s, 0.6);
    holdFor(s, 1, bal.chains.holdTime);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts tests/delve-combat-weight.test.ts)`
Expected: 12 FAIL, 76 pass: "holding starts a charge only when the next move is a hold …" (expected undefined to be null), "a hold starting cancels a swing …" (expected { step: +0, …(6) } to be null), "reaches stage 1 at 0.33 …" (Cannot read properties of undefined (reading 'start')), the release, tap, `holdMax`, lost-release and unaffordable-stage tests (expected [] to have a length of 1 but got +0), "a dodge, cancelHold and a changed chain drop it unpaid" (dodge: expected undefined to be null), "gates presses as a wind-up does …" (expected true to be false), "pauses the slot's combo window …" (expected undefined to be 1), "the bot charges a hold to full, then lets go" (expected -1 to be greater than or equal to 0), and combat-weight's "a fully held bolt (Crushing) knocks back and staggers …" (expected 0 to be greater than 0).

- [ ] **Step 3: The types**

In `packages/engine/src/types/arpg.ts`:

Before:
```ts
  /** A basic attack in its startup: the blow lands at `strikeAt`. */
```
add:
```ts
  /**
   * A hold move charging while its button is held (see the moves and chains
   * spec): the slot, the chain's move, when it began, and what it aimed at then
   * (null: nothing in reach). Nothing is paid until it fires.
   */
  hold: { slot: number; step: number; start: number; aim: Vec | null } | null;
```

Replace:
```ts
  /** Ability to use this step (0 Primary, 1 Defensive, 2 Ultimate), with an optional aim point. */
  cast?: AbilityCast | null;
```
with:
```ts
  /**
   * Ability to use this step (0 Primary, 1 Defensive, 2 Ultimate), with an optional aim point:
   * a press, or the release of a hold move's button.
   */
  cast?: AbilityCast | null;
  /** The ability slot whose button is held this step: a hold move charges while it is. */
  holding?: number | null;
  /** Drop a running hold unpaid (an aim released back on its button). */
  cancelHold?: boolean;
```

Before:
```ts
  | { kind: 'buff'; form: FormId; element: ManaType; until: number }
```
add:
```ts
  /** A hold reached a new stage (1, then 2). */
  | { kind: 'holdStage'; slot: number; stage: number }
```

Before:
```ts
  /** A manual attack tap waiting for the weapon (see `queuedCastUntil`). */
```
add:
```ts
  /** A press of the slot whose hold runs: its release, for the next step. */
  queuedRelease: AbilityCast | null;
```

- [ ] **Step 4: Starting, charging and firing a hold**

In `packages/engine/src/arpg/abilities/cast.ts`:

Before:
```ts
import type { SimCtx } from '../combat.js';
```
add:
```ts
import type { DelveBalance } from '../../types/delve.js';
```

Replace:
```ts
  if (!chain || h.windup) return false;
  const step = pressStep(h, slot, ctx.world.t, ctx.bal.abilities.comboWindow);
```
with:
```ts
  if (!chain || h.windup || h.hold) return false;
  const step = pressStep(h, slot, ctx.world.t, ctx.bal.abilities.comboWindow);
```

Replace:
```ts
/** The slot's move winding up or, for the Defensive, the one whose effect is up; else null. */
```
with:
```ts
/** The slot's move winding up, holding or, for the Defensive, the one whose effect is up; else null. */
```

Before:
```ts
  if (slot === DEFENSIVE && h.defend) return chainMove(chain, h.defend.move, h.defend.stage);
```
add:
```ts
  if (h.hold?.slot === slot) return chain.moves[h.hold.step];
```

Replace:
```ts
/** Fire move `step` of the slot's chain now, then its recoil and recovery. */
function fire(ctx: SimCtx, slot: number, aim: Vec | null, step: number): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const ab = chainMove(h.chains[slot], step);
```
with:
```ts
/** A hold's charge at `t` (0..1 over `holdTime`) and its stage (by `holdStages`). */
export function holdCharge(
  bal: DelveBalance,
  start: number,
  t: number,
): { charge: number; stage: number } {
  const c = bal.chains;
  const charge = Math.min(1, (t - start) / c.holdTime + 1e-9);
  return { charge, stage: charge >= c.holdStages[1] ? 2 : charge >= c.holdStages[0] ? 1 : 0 };
}

/** Fire move `step` of the slot's chain (a hold at `stage`) now, then its recoil and recovery. */
function fire(ctx: SimCtx, slot: number, aim: Vec | null, step: number, stage = 0): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const ab = chainMove(h.chains[slot], step, stage);
```

Replace:
```ts
  if (!chain || h.windup) return false;
```
with:
```ts
  if (!chain || h.windup || h.hold) return false;
```

Before:
```ts
  const chargePaid = chain.payment === 'charge' ? ab.chargeNeed : 0;
```
add:
```ts
  // A tap on a hold move fires its first stage at once.
  if (ab.kind === 'hold') {
    pay(ctx, slot, step, ab, t);
    if (!fire(ctx, slot, aim, step)) fire(ctx, slot, at, step);
    return true;
  }
```

Before:
```ts
 * Land a finished wind-up: its press-time move. Auto-aim is chosen again now;
```
add:
```ts
 * Holding `slot`: its next move, a hold, starts charging when the hero is free
 * as a press needs (a swing winding up gives way) and its first stage is
 * affordable. Nothing is paid yet; the hero faces what it aims at.
 */
function startHold(ctx: SimCtx, slot: number): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  const chain = h.chains[slot];
  if (!chain || h.windup) return;
  const step = pressStep(h, slot, t, bal.abilities.comboWindow);
  const ab = chain.moves[step];
  if (ab.kind !== 'hold' || t < h.cooldowns[slot][step]) return;
  if (chain.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return;
  if (!canAfford(world, ab)) return;
  cancelSwing(ctx);
  h.push = null;
  h.recoverUntil = t;
  const aim = aimPoint(ctx, ab, null);
  const dir = aim ? dirTo(h.x, h.y, aim.x, aim.y) : null;
  if (dir && (dir.x !== 0 || dir.y !== 0)) h.facing = dir;
  h.hold = { slot, step, start: t, aim };
}

/**
 * Fire the running hold at `stage` at once (its charge was its wind-up), or at
 * the highest stage below that it can afford, paying that stage's cost and
 * setting its cooldown. With no stage affordable, or nothing to aim at, it
 * ends unpaid.
 */
function releaseHold(ctx: SimCtx, aim: Vec | null, stage: number): void {
  const { world } = ctx;
  const h = world.hero;
  const hold = h.hold!;
  h.hold = null;
  const chain = h.chains[hold.slot];
  let s = stage;
  while (s > 0 && !canAfford(world, chainMove(chain, hold.step, s))) s--;
  const ab = chainMove(chain, hold.step, s);
  if (!canAfford(world, ab)) return;
  if (!aimPoint(ctx, ab, aim) && !hold.aim) return;
  pay(ctx, hold.slot, hold.step, ab, world.t);
  if (!fire(ctx, hold.slot, aim, hold.step, s)) fire(ctx, hold.slot, hold.aim, hold.step, s);
}

/**
 * The hold, each step: holding a slot whose next move is a hold starts one.
 * While it runs, its release (a press of its slot: the button let go) fires it
 * at its stage; past `holdMax` it fires by itself at stage 2; the button let
 * go with no release (a lost release) fires it at its stage. Meanwhile the
 * hero stays rooted, each new stage says so, and the slot's combo window is paused.
 */
export function holdTick(
  ctx: SimCtx,
  holding: number | null | undefined,
  dt: number,
  dashing: boolean,
): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const release = world.queuedRelease;
  world.queuedRelease = null;
  if (!h.hold) {
    if (holding !== null && holding !== undefined && !dashing) startHold(ctx, holding);
    return;
  }
  const t = world.t;
  const { stage } = holdCharge(bal, h.hold.start, t);
  if (release) releaseHold(ctx, release.aim ?? null, stage);
  else if (t - h.hold.start >= bal.chains.holdMax - 1e-9) releaseHold(ctx, null, 2);
  else if (holding !== h.hold.slot) releaseHold(ctx, null, stage);
  else {
    if (stage > holdCharge(bal, h.hold.start, t - dt).stage)
      ctx.events.push({ kind: 'holdStage', slot: h.hold.slot, stage });
    h.comboAt[h.hold.slot] += dt;
  }
}

/**
```

- [ ] **Step 5: The step, the world, the dodge, the sandbox, the bot**

In `packages/engine/src/arpg/step.ts`, a press of the holding slot is its release, `cancelHold` drops the hold, and a hold gates the buffer, movement and swings like a wind-up:

Replace:
```ts
import { castAbility, castTick, pressStep } from './abilities/cast.js';
```
with:
```ts
import { castAbility, castTick, holdTick, pressStep } from './abilities/cast.js';
```

Replace:
```ts
    world.queuedCast = input.cast;
    world.queuedCastUntil = world.t + buffer;
```
with:
```ts
    // A press of the slot whose hold runs is its release; another slot's press waits its turn.
    if (world.hero.hold?.slot === input.cast.slot) world.queuedRelease = input.cast;
    else {
      world.queuedCast = input.cast;
      world.queuedCastUntil = world.t + buffer;
    }
```

Before:
```ts
  if (world.heroDead) return events;
```
add:
```ts
  // Nothing is paid until a hold fires: dropping one costs nothing.
  if (input.cancelHold) world.hero.hold = null;
```

Replace:
```ts
  // A queued press waits out a wind-up or a dash; anything else lets it through.
  // A press held by a wind-up or a dash doesn't age: it gets `buffer` from when the hero is free.
  if (world.queuedCast !== null && (dashing || h.windup))
```
with:
```ts
  // A queued press waits out a wind-up, a hold or a dash; anything else lets it through.
  // A press held so doesn't age: it gets `buffer` from when the hero is free.
  if (world.queuedCast !== null && (dashing || h.windup || h.hold))
```

Before:
```ts
    !!h.chains[q.slot] &&
```
add:
```ts
    !h.hold &&
```

Before:
```ts
  castTick(ctx);
```
add:
```ts
  // A hold starts, charges, or fires.
  holdTick(ctx, input.holding, dt, dashing);
```

Replace:
```ts
  // Movement: a push carries the hero; a wind-up or a committed swing roots it; a recovery slows it.
  const surge = surging(ctx);
  const pushed = !dashing && pushTick(ctx);
  const rooted = !!h.windup || !!h.swing?.committed;
```
with:
```ts
  // Movement: a push carries the hero; a wind-up, a hold or a committed swing roots it; a
  // recovery slows it.
  const surge = surging(ctx);
  const pushed = !dashing && pushTick(ctx);
  const rooted = !!h.windup || !!h.hold || !!h.swing?.committed;
```

Replace:
```ts
  // A tap held by a dash, a wind-up, a swing, a push or the weapon's cycle doesn't age either.
  if (world.queuedAttack && (dashing || h.windup || h.swing || h.push || t < h.nextAttackAt))
    world.queuedAttack.until = Math.max(world.queuedAttack.until, t + bal.feel.buffer);
  // A swing waits for a push (a lunge, a step-in or a recoil) to finish, so it never swallows one.
  if (!h.swing && !h.windup && !h.push && !dashing) {
```
with:
```ts
  // A tap held by a dash, a wind-up, a hold, a swing, a push or the weapon's cycle doesn't age either.
  if (
    world.queuedAttack &&
    (dashing || h.windup || h.hold || h.swing || h.push || t < h.nextAttackAt)
  )
    world.queuedAttack.until = Math.max(world.queuedAttack.until, t + bal.feel.buffer);
  // A swing waits for a push (a lunge, a step-in or a recoil) to finish, so it never swallows one.
  if (!h.swing && !h.windup && !h.hold && !h.push && !dashing) {
```

In `packages/engine/src/arpg/world.ts`, the hero starts with no hold, a changed slot's hold is dropped, and the world starts with no release queued:

Before:
```ts
    swing: null,
```
add:
```ts
    hold: null,
```

Replace:
```ts
 * drops its wind-up (as a dodge does), and a new Defensive ends the old one's
 * buff and Ward at once, without bursting.
```
with:
```ts
 * drops its wind-up (as a dodge does) and its hold, and a new Defensive ends
 * the old one's buff and Ward at once, without bursting.
```

Before:
```ts
  if (changed[1]) {
```
add:
```ts
  // A changed slot's hold is dropped, unpaid.
  if (h.hold && changed[h.hold.slot]) h.hold = null;
```

Before:
```ts
    queuedAttack: null,
```
add:
```ts
    queuedRelease: null,
```

In `packages/engine/src/arpg/dodge.ts`:

Replace:
```ts
  // Bailing out of a wind-up keeps the mana spent but frees the ability again (and refunds charge).
  cancelWindup(h, t);
```
with:
```ts
  // Bailing out of a wind-up keeps the mana spent but frees the ability again (and refunds charge);
  // a hold is dropped unpaid.
  cancelWindup(h, t);
  h.hold = null;
```

In `packages/engine/src/arpg/sandbox.ts`, `respawnHero`:

Before:
```ts
  h.swing = null;
```
add:
```ts
  h.hold = null;
```

In `packages/engine/src/arpg/bot.ts`:

Replace:
```ts
import { abilityReady, nextMove } from './abilities/cast.js';
```
with:
```ts
import { abilityReady, holdCharge, nextMove } from './abilities/cast.js';
```

Replace:
```ts
 * Defensive when hurt or crowded, the Primary whenever it's ready. Drives the
 * pacing tests.
```
with:
```ts
 * Defensive when hurt or crowded, the Primary whenever it's ready. A hold move
 * charges to full before it lets go (the bot never taps one). Drives the pacing
 * tests.
```

Replace:
```ts
  const target = nearestMonster(ctx, h.x, h.y, 60);
```
with:
```ts
  // A hold charges until full, then lets go.
  if (h.hold) {
    input.holding = h.hold.slot;
    if (holdCharge(ctx.bal, h.hold.start, world.t).charge >= 1) input.cast = { slot: h.hold.slot };
    return input;
  }

  const target = nearestMonster(ctx, h.x, h.y, 60);
```

Replace:
```ts
  if (slot !== undefined) input.cast = { slot };
```
with:
```ts
  if (slot !== undefined) {
    if (nextMove(h, slot, world.t, ctx.bal.abilities.comboWindow).kind === 'hold')
      input.holding = slot;
    else input.cast = { slot };
  }
```

In `packages/engine/src/index.ts`:

Before:
```ts
} from './arpg/abilities/cast.js';
```
add:
```ts
  holdCharge,
```

- [ ] **Step 6: Run them to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts tests/delve-combat-weight.test.ts)`
Expected: PASS (88).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1234 tests pass.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/dodge.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/arpg/bot.ts packages/engine/src/index.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-combat-weight.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/dodge.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/arpg/bot.ts packages/engine/src/index.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-combat-weight.test.ts
git commit -m "feat(engine): hold moves charge while their button is held and fire on release" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 8: Engine: basics per blow (Task 5: the tests)

### Task 5: Basics per blow

The basic attack becomes a chain of blows, each a kind and an element. `HeroWeapon` keeps the weapon's `feel` table and carries `blows: HeroBlow[]`: each blow's row (`feel[kind]`), its kind, its element and `attunePower` (1 + `basicPowerPerAttune` × its element's attunement; 1 without a pair). `element`, `infusion`, `blowPower`, `finisherPower` and `combo` go. `computeHeroStats` takes the chain through `HeroStatsExtra.basic`; with none, the weapon's default chain on the pair (`defaultBasic`: every blow the primary, the last the secondary when bound; with no primary yet, the weapon's mana, else fire). Profiles pass their own chains from Task 6; until then every hero plays the default, so the basics don't move.

A blow strikes in its own element with its own power, and applies `stacks.basicByKind[kind]` (light and medium 1, heavy and hold 2: today's blow and finisher counts, so nothing changes); the finisher's discharge goes, Twin Fang still doubles the last blow, and the `basic` event gains `moveKind` and loses `finisher`. A basic shot's burst draws no motif (`infusion: null`). In manual mode a hold blow starts with the medium row's startup and lunge; at its strike point, while the attack stays held, it charges (`basicHoldTick`: stages by `holdStages`, a `holdStage` event with `slot: null`, stage 2 at `holdMax`), then strikes with the stage's row (medium, heavy, hold) and its kind's stacks, taking its cycle from that row: `nextAttackAt = release + cycle × (1 − startup)` (the startup was spent holding) and the recovery from it. In automatic mode a hold blow plays the hold row straight. `estimateCombat` sums each blow's power × its element's power over the chain's time (a test pins every weapon's figure, unarmed included, at v0.45.0's to five decimals), and the weapons' `combo`, the hero's `defaultCombo`, `basicBlow` and `basicFinisher` leave the data.

**Files:**
- Modify: `packages/engine/src/types/delve.ts:29,65-66,271-274,444-446,552-571` (`HeroBlow`, `HeroWeapon`; the old fields go), `packages/engine/src/types/arpg.ts:339,469-511` (`swing.held`, `holdStage`'s null slot, the `basic` event)
- Modify: `packages/engine/src/arpg/basic.ts` (throughout), `step.ts:28,195`
- Modify: `packages/engine/src/delve/hero-stats.ts:5-8,91-97,153-186,344-368`
- Modify: `packages/engine/src/data/schemas.ts:482,676,816-817`, `balance.json:82-86,150` (hand-edit), `delve.json` (each weapon's `combo`; hand-edit)
- Modify: `packages/engine/tests/fixtures/arena.ts:177,188` (`strikeWorld`'s `finisher` starts on the chain's last blow)
- Test: `packages/engine/tests/delve-chains.test.ts`; updated: `delve-combat-weight`, `delve-pair`, `delve-stacks`, `delve-infusion`, `ability-cast`, `delve-reactions`, `delve-hero-smithing` (CRLF)

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/fixtures/arena.ts`:

Replace:
```ts
 * `finisher` starts on the string's last blow.
```
with:
```ts
 * `finisher` starts on the basic chain's last blow.
```

Replace:
```ts
    w.hero.attackCount = w.hero.stats.weapon.combo.length - 1;
```
with:
```ts
    w.hero.attackCount = w.hero.stats.weapon.blows.length - 1;
```

In `packages/engine/tests/delve-chains.test.ts`, the imports, the stack numbers without `basicBlow`/`basicFinisher`, then the basics tests after the holds:

Replace:
```ts
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
```
with:
```ts
import { sandboxWeapon } from '../src/arpg/sandbox.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
```

Before:
```ts
  holdFor,
```
add:
```ts
  firstBlow,
  gear,
```

Before:
```ts
} from './fixtures/arena.js';
```
add:
```ts
  strikeWorld,
```

Replace:
```ts
    expect(w.t - start).toBeGreaterThanOrEqual(bal.chains.holdTime - 1e-6);
  });
});
```
with:
```ts
    expect(w.t - start).toBeGreaterThanOrEqual(bal.chains.holdTime - 1e-6);
  });
});

describe('basics', () => {
  const sword = { weapon: gear('fire') };
  const still = { x: 0, y: 0 };
  const basics = (events: ArpgEvent[]) =>
    events.filter((e): e is Extract<ArpgEvent, { kind: 'basic' }> => e.kind === 'basic');

  it("estimateCombat values each weapon's default chain as it valued its string (v0.45.0)", () => {
    // A rare ilvl-12 Fire weapon on a Fire/Storm pair with Twin Fang 40, at depth 5; the
    // abilities one medium move each (a Volley's, a Ward's, a Nova's numbers are as they were).
    const today: Record<string, number> = {
      unarmed: 13.233961,
      dagger: 188.213808,
      sword: 195.522722,
      axe: 237.869592,
      maul: 343.63993,
      staff: 124.587614,
      wand: 120.353622,
      bow: 151.257273,
    };
    const one = (form: FormId, payment: 'mana' | 'charge') => ({
      moves: [m('medium', form)],
      payment,
    });
    const chains = {
      primary: one('volley', 'mana'),
      defensive: one('ward', 'mana'),
      ultimate: one('nova', 'charge'),
    };
    for (const [id, dps] of Object.entries(today)) {
      const weapon =
        id === 'unarmed'
          ? undefined
          : sandboxWeapon(registry, { baseId: id, mana: 'fire', rarity: 'rare', ilvl: 12 });
      const stats = computeHeroStats(weapon ? { weapon } : {}, registry, {
        pair: { primary: 'fire', secondary: 'storm' },
        legendaries: { twin_fang: 40 },
      });
      expect(estimateCombat(stats, registry, 5, chains).dps, id).toBeCloseTo(dps, 5);
    }
  });

  it("each blow strikes in its own element, powered by its attunement, with its kind's stacks", () => {
    const k = bal.pair.basicPowerPerAttune;
    const w = strikeWorld(sword, {
      pair: { primary: 'fire', secondary: 'frost' },
      attunement: { frost: 5 },
      basic: [
        { kind: 'light', element: 'frost' },
        { kind: 'heavy', element: 'fire' },
      ],
    });
    const [a, b] = w.hero.stats.weapon.blows;
    expect(a).toMatchObject({ kind: 'light', element: 'frost' });
    expect(a.attunePower).toBeCloseTo(1 + 5 * k);
    expect(b.attunePower).toBeCloseTo(1 + 1 * k); // the Fire sword's own 1
    expect(basics(firstBlow(w))[0]).toMatchObject({ element: 'frost', moveKind: 'light', step: 0 });
    expect(w.monsters[0].status.stacks).toMatchObject({
      frost: bal.stacks.basicByKind.light,
      fire: 0,
    });
    expect(basics(firstBlow(w))[0]).toMatchObject({ element: 'fire', moveKind: 'heavy', step: 1 });
  });

  it("Twin Fang doubles the chain's last blow, whatever its kind", () => {
    const w = strikeWorld(sword, {
      legendaries: { twin_fang: 100 },
      basic: [
        { kind: 'heavy', element: 'fire' },
        { kind: 'light', element: 'fire' },
      ],
    });
    const hits = (events: ArpgEvent[]) =>
      events.filter((e) => e.kind === 'hit' && e.source === 'basic').length;
    expect(hits(firstBlow(w))).toBe(1);
    expect(hits(firstBlow(w))).toBe(2);
  });

  it("a manual hold blow holds at its strike point while the attack stays held, then strikes with its stage's row", () => {
    const w = strikeWorld(sword, { basic: [{ kind: 'hold', element: 'fire' }] });
    const f = w.hero.stats.weapon.feel;
    const iv = w.hero.stats.attackInterval;
    const held = { move: still, attack: true };
    stepWorld(registry, w, held, STEP);
    const sw = w.hero.swing!;
    // It starts as a medium blow.
    expect(sw.strikeAt - sw.start).toBeCloseTo(iv * f.medium.time * f.medium.startup);
    const events: ArpgEvent[] = [];
    while (w.t < sw.strikeAt + 0.5) events.push(...stepWorld(registry, w, held, STEP));
    expect(basics(events)).toHaveLength(0);
    expect(events.filter((e) => e.kind === 'holdStage')).toEqual([
      { kind: 'holdStage', slot: null, stage: 1 },
    ]);
    const release = stepWorld(registry, w, { move: still, attack: false }, STEP);
    expect(basics(release)[0]).toMatchObject({ moveKind: 'heavy', heft: f.heavy.heft });
    // Its startup was spent holding: the rest of the heavy row's cycle follows the release.
    expect(w.hero.nextAttackAt).toBeCloseTo(w.t + iv * f.heavy.time * (1 - f.heavy.startup));
    expect(w.monsters[0].status.stacks.fire).toBe(bal.stacks.basicByKind.heavy);
  });

  it('a manual hold blow let go before its strike point strikes as a medium; held past holdMax, at stage 2', () => {
    const tap = strikeWorld(sword, { basic: [{ kind: 'hold', element: 'fire' }] });
    const tapped = stepWorld(registry, tap, { move: still, attack: false, attackTap: true }, STEP);
    for (let i = 0; i < 60 && basics(tapped).length === 0; i++)
      tapped.push(...stepWorld(registry, tap, { move: still, attack: false }, STEP));
    expect(basics(tapped)[0].moveKind).toBe('medium');

    const long = strikeWorld(sword, { basic: [{ kind: 'hold', element: 'fire' }] });
    const events: ArpgEvent[] = [];
    for (let i = 0; i < Math.round((bal.chains.holdMax + 1) / STEP); i++)
      events.push(...stepWorld(registry, long, { move: still, attack: true }, STEP));
    expect(basics(events)[0].moveKind).toBe('hold');
  });

  it('an automatic hold blow plays the hold row straight: a slow, hard blow with its stacks', () => {
    const w = strikeWorld(sword, { basic: [{ kind: 'hold', element: 'fire' }] });
    const f = w.hero.stats.weapon.feel;
    run(w, STEP);
    const sw = w.hero.swing!;
    expect(sw.strikeAt - sw.start).toBeCloseTo(
      w.hero.stats.attackInterval * f.hold.time * f.hold.startup,
    );
    expect(basics(firstBlow(w))[0]).toMatchObject({ moveKind: 'hold', heft: f.hold.heft });
    expect(w.monsters[0].status.stacks.fire).toBe(bal.stacks.basicByKind.hold);
  });
});
```

In `packages/engine/tests/delve-combat-weight.test.ts`, the strings are the weapons' default chains now (`weapon.blows`, `moveKind`):

Replace:
```ts
  it('every weapon swings a combo string, and the feel block loads', () => {
    expect(weapons.length).toBeGreaterThan(0);
    for (const w of weapons) {
      expect(w.combo?.length, w.id).toBeGreaterThan(0);
      for (const s of w.combo!) {
```
with:
```ts
  it('every weapon has a row per kind and a default chain, and the feel block loads', () => {
    expect(weapons.length).toBeGreaterThan(0);
    for (const w of weapons) {
      expect(w.defaultChain?.length, w.id).toBeGreaterThan(0);
      for (const s of Object.values(w.feel!)) {
```

Replace:
```ts
    expect(bal.hero.defaultCombo.length).toBeGreaterThan(0);
```
with:
```ts
    expect(bal.hero.defaultChain.length).toBeGreaterThan(0);
```

Replace:
```ts
    for (const w of weapons) check(w.id, w.combo!, w.attack!.kind === 'melee');
    check('default', bal.hero.defaultCombo, true);
  });

  it('the hero carries the weapon string, and the default one when unarmed', () => {
    const maul = computeHeroStats({ weapon: gear('fire', 'weapon', 'maul') }, registry);
    expect(maul.weapon.combo).toHaveLength(2);
    expect(maul.weapon.combo).toEqual(registry.getGearBase('maul').combo);
    expect(computeHeroStats({}, registry).weapon.combo).toEqual(bal.hero.defaultCombo);
```
with:
```ts
    for (const w of weapons)
      check(
        w.id,
        w.defaultChain!.map((k) => w.feel![k]),
        w.attack!.kind === 'melee',
      );
    check(
      'default',
      bal.hero.defaultChain.map((k) => bal.hero.feel[k]),
      true,
    );
  });

  it("the hero's blows are the weapon's rows along its default chain, and the unarmed ones", () => {
    const maul = computeHeroStats({ weapon: gear('fire', 'weapon', 'maul') }, registry);
    const base = registry.getGearBase('maul');
    expect(maul.weapon.blows.map((b) => b.kind)).toEqual(base.defaultChain);
    expect(maul.weapon.blows[1]).toMatchObject(base.feel!.heavy);
    const bare = computeHeroStats({}, registry).weapon;
    expect(bare.blows.map((b) => b.kind)).toEqual(bal.hero.defaultChain);
    expect(bare.feel).toEqual(bal.hero.feel);
```

Replace:
```ts
    const s = w.hero.stats.weapon.combo[0];
    run(w, STEP);
```
with:
```ts
    const s = w.hero.stats.weapon.blows[0];
    run(w, STEP);
```

Replace:
```ts
  it("the sword's third blow is the finisher thrust", () => {
```
with:
```ts
  it("the sword's third blow is its heavy thrust", () => {
```

Replace:
```ts
    expect(b.map((e) => e.kind === 'basic' && e.finisher)).toEqual([false, false, true]);
    const thrust = w.hero.stats.weapon.combo[2];
```
with:
```ts
    expect(b.map((e) => e.kind === 'basic' && e.moveKind)).toEqual(['light', 'light', 'heavy']);
    const thrust = w.hero.stats.weapon.blows[2];
```

Replace:
```ts
    const [first, , thrust] = arena().hero.stats.weapon.combo;
```
with:
```ts
    const [first, , thrust] = arena().hero.stats.weapon.blows;
```

Replace:
```ts
    expect(w.hero.y - y0).toBeCloseTo(-w.hero.stats.weapon.combo[0].move, 2);
```
with:
```ts
    expect(w.hero.y - y0).toBeCloseTo(-w.hero.stats.weapon.blows[0].move, 2);
```

Replace:
```ts
    const orb = w.hero.stats.weapon.combo[2];
```
with:
```ts
    const orb = w.hero.stats.weapon.blows[2];
```

Replace:
```ts
    expect(twin.amount / thrust.amount).toBeCloseTo(1.5 / w.hero.stats.weapon.combo[2].power, 2);
```
with:
```ts
    expect(twin.amount / thrust.amount).toBeCloseTo(1.5 / w.hero.stats.weapon.blows[2].power, 2);
```

Replace:
```ts
      1 / w.hero.stats.weapon.combo[2].power,
```
with:
```ts
      1 / w.hero.stats.weapon.blows[2].power,
```

Replace:
```ts
    const s = w.hero.stats.weapon.combo[0];
```
with:
```ts
    const s = w.hero.stats.weapon.blows[0];
```

Replace:
```ts
  it('the Power estimate reads the weapon string', () => {
```
with:
```ts
  it('the Power estimate reads the blows', () => {
```

Replace:
```ts
      { ...sword, weapon: { ...sword.weapon, combo: maul.weapon.combo } },
```
with:
```ts
      { ...sword, weapon: { ...sword.weapon, blows: maul.weapon.blows } },
```

In `packages/engine/tests/delve-pair.test.ts`, blows and the last blow replace the primary's blows and the finisher:

Replace:
```ts
  it('blows strike with the primary and the finisher discharges a bound secondary, stronger with attunement', () => {
    const staff = { weapon: gear('frost', 'weapon', 'staff') }; // frost 1
    const weapon = (extra: HeroStatsExtra) => computeHeroStats(staff, registry, extra).weapon;
    expect(weapon({})).toMatchObject({
      element: 'frost',
      infusion: null,
      blowPower: 1,
      finisherPower: 1,
    });
    expect(weapon({ pair: { primary: 'fire', secondary: null } })).toMatchObject({
      element: 'fire',
      infusion: null,
      blowPower: 1,
      finisherPower: 1,
    });
    const paired = weapon({
      pair: { primary: 'fire', secondary: 'frost' },
      attunement: { fire: 4 },
    });
    expect(paired).toMatchObject({ element: 'fire', infusion: 'frost' });
    expect(paired.blowPower).toBeCloseTo(1 + 4 * k);
    expect(paired.finisherPower).toBeCloseTo(1 + 1 * k); // the frost staff's own 1
    // No secondary: the finisher stays the primary, just as strong.
    const solo = weapon({ pair: { primary: 'frost', secondary: null } });
    expect(solo.blowPower).toBeGreaterThan(1);
    expect(solo.finisherPower).toBe(solo.blowPower);
    // A secondary equal to the primary is unbound.
    expect(weapon({ pair: { primary: 'fire', secondary: 'fire' } }).infusion).toBeNull();
    // Unarmed, you punch with your primary.
    expect(
      computeHeroStats({}, registry, { pair: { primary: 'storm', secondary: 'nature' } }).weapon,
    ).toMatchObject({ baseId: null, element: 'storm', infusion: 'nature' });
    expect(computeHeroStats({}, registry).weapon).toMatchObject({ element: null, infusion: null });
```
with:
```ts
  it("the pair's default basic chain: blows of the primary, the last the bound secondary, each powered by its element", () => {
    const staff = { weapon: gear('frost', 'weapon', 'staff') }; // frost 1
    const blows = (extra: HeroStatsExtra) => computeHeroStats(staff, registry, extra).weapon.blows;
    const elements = (extra: HeroStatsExtra) => blows(extra).map((b) => b.element);
    const power = (extra: HeroStatsExtra) => blows(extra).map((b) => b.attunePower);
    // No pair yet: the weapon's mana, and no attunement power.
    expect(elements({})).toEqual(['frost', 'frost', 'frost']);
    expect(power({})).toEqual([1, 1, 1]);
    expect(elements({ pair: { primary: 'fire', secondary: null } })).toEqual([
      'fire',
      'fire',
      'fire',
    ]);
    expect(power({ pair: { primary: 'fire', secondary: null } })).toEqual([1, 1, 1]);
    const paired = {
      pair: { primary: 'fire', secondary: 'frost' },
      attunement: { fire: 4 },
    } as const;
    expect(elements(paired)).toEqual(['fire', 'fire', 'frost']);
    expect(power(paired)[0]).toBeCloseTo(1 + 4 * k);
    expect(power(paired)[2]).toBeCloseTo(1 + 1 * k); // the frost staff's own 1
    // A secondary equal to the primary is unbound.
    expect(elements({ pair: { primary: 'fire', secondary: 'fire' } })).toEqual([
      'fire',
      'fire',
      'fire',
    ]);
    // Unarmed, you punch with your pair; with no pair and no weapon, with fire.
    const bare = (pair?: ManaPair) =>
      computeHeroStats({}, registry, { pair }).weapon.blows.map((b) => b.element);
    expect(bare({ primary: 'storm', secondary: 'nature' })).toEqual(['storm', 'storm', 'nature']);
    expect(bare()).toEqual(['fire', 'fire', 'fire']);
    // The hero's own basic chain wins over the default.
    expect(elements({ ...paired, basic: [{ kind: 'heavy', element: 'frost' }] })).toEqual([
      'frost',
    ]);
```

Replace:
```ts
  it('estimateCombat reads blowPower for ordinary blows and finisherPower for the finisher', () => {
    const stats = computeHeroStats({ weapon }, registry, { pair: bound });
    const dps = (w: Partial<HeroWeapon>) =>
      estimateCombat({ ...stats, weapon: { ...stats.weapon, ...w } }, registry, 3).dps;
    const base = dps({});
    expect(dps({ blowPower: stats.weapon.blowPower * 2 })).toBeGreaterThan(base);
    expect(dps({ finisherPower: stats.weapon.finisherPower * 2 })).toBeGreaterThan(base);
  });

  it("the finisher strikes with the secondary's element power", () => {
```
with:
```ts
  it("estimateCombat values each blow by its element's attunement power", () => {
    const stats = computeHeroStats({ weapon }, registry, { pair: bound });
    const dps = (i: number) =>
      estimateCombat(
        {
          ...stats,
          weapon: {
            ...stats.weapon,
            blows: stats.weapon.blows.map((b, j) =>
              j === i ? { ...b, attunePower: b.attunePower * 2 } : b,
            ),
          },
        },
        registry,
        3,
      ).dps;
    const base = dps(-1);
    expect(dps(0)).toBeGreaterThan(base);
    expect(dps(2)).toBeGreaterThan(base);
  });

  it("the last blow strikes with the secondary's element power", () => {
```

Replace:
```ts
  it("Twin Fang's extra hit is worth the finisher, not the string's average", () => {
    // Two strings worth the same without Twin Fang: one's finisher discharges storm
    // power, the other's blows all carry the fire power that evens them out. Nature
    // abilities (no power either way) keep everything else equal.
    const stats = computeHeroStats({ weapon }, registry, { pair: bound });
    const combo = stats.weapon.combo;
    const last = combo[combo.length - 1].power;
    const even = (0.5 * last) / combo.reduce((a, s) => a + s.power, 0);
    const dps = (infusion: ManaType | null, power: Partial<ManaMap>, twin: number) =>
      estimateCombat(
        {
          ...stats,
          weapon: { ...stats.weapon, infusion, blowPower: 1, finisherPower: 1 },
```
with:
```ts
  it("Twin Fang's extra hit is worth the last blow, not the chain's average", () => {
    // Two chains worth the same without Twin Fang: one's last blow strikes with storm
    // power, the other's blows all carry the fire power that evens them out. Nature
    // abilities (no power either way) keep everything else equal.
    const stats = computeHeroStats({ weapon }, registry, { pair: bound });
    const blows = stats.weapon.blows;
    const last = blows[blows.length - 1].power;
    const even = (0.5 * last) / blows.reduce((a, s) => a + s.power, 0);
    const dps = (lastElement: ManaType, power: Partial<ManaMap>, twin: number) =>
      estimateCombat(
        {
          ...stats,
          weapon: {
            ...stats.weapon,
            blows: blows.map((b, i) => ({
              ...b,
              attunePower: 1,
              element: i === blows.length - 1 ? lastElement : 'fire',
            })),
          },
```

Replace:
```ts
    const solo = (twin: number) => dps(null, { fire: even }, twin);
```
with:
```ts
    const solo = (twin: number) => dps('fire', { fire: even }, twin);
```

Replace:
```ts
  it('blows strike with the primary; the finisher with the secondary, always applying its status', () => {
    const blow = firstBlow(strikeWorld(sword, FIRE_STORM));
    expect(only(blow, 'basic')[0]).toMatchObject({ element: 'fire', finisher: false });
    expect(only(blow, 'hit').map((h) => h.element)).toEqual(['fire']);
    const w = strikeWorld(sword, FIRE_STORM, true);
    const fin = firstBlow(w);
    expect(only(fin, 'basic')[0]).toMatchObject({ element: 'storm', finisher: true });
    expect(only(fin, 'hit').map((h) => h.element)).toEqual(['storm']);
    // No 30% roll: every finisher shocks (fresh rolls each time), and none burns.
```
with:
```ts
  it('on the default chain, blows strike with the primary, the last with the secondary, always applying its status', () => {
    const blow = firstBlow(strikeWorld(sword, FIRE_STORM));
    expect(only(blow, 'basic')[0]).toMatchObject({ element: 'fire', moveKind: 'light' });
    expect(only(blow, 'hit').map((h) => h.element)).toEqual(['fire']);
    const w = strikeWorld(sword, FIRE_STORM, true);
    const fin = firstBlow(w);
    expect(only(fin, 'basic')[0]).toMatchObject({ element: 'storm', moveKind: 'heavy' });
    expect(only(fin, 'hit').map((h) => h.element)).toEqual(['storm']);
    // No 30% roll: every last blow shocks (fresh rolls each time), and none burns.
```

Replace:
```ts
  it("Twin Fang's extra hit follows the finisher's element", () => {
```
with:
```ts
  it("Twin Fang's extra hit follows the last blow's element", () => {
```

Replace:
```ts
  it("a ranged finisher's shot carries the secondary, and its great-orb burst no infusion", () => {
    const w = strikeWorld(staff, FIRE_STORM, true, dummy(13, 30));
    const events = firstBlow(w);
    expect(only(events, 'basic')[0]).toMatchObject({ element: 'storm', finisher: true });
```
with:
```ts
  it("a ranged last blow's shot carries the secondary, and its great-orb burst no infusion", () => {
    const w = strikeWorld(staff, FIRE_STORM, true, dummy(13, 30));
    const events = firstBlow(w);
    expect(only(events, 'basic')[0]).toMatchObject({ element: 'storm', moveKind: 'heavy' });
```

Replace:
```ts
  it('unarmed punches with the primary; without a secondary the finisher stays the primary', () => {
    const punch = firstBlow(strikeWorld({}, { pair: { primary: 'frost', secondary: null } }));
    expect(only(punch, 'hit')[0].element).toBe('frost');
    const solo = strikeWorld(sword, { pair: { primary: 'fire', secondary: null } }, true);
    expect(only(firstBlow(solo), 'basic')[0]).toMatchObject({ element: 'fire', finisher: true });
  });

  it('attunement powers each: blows by the primary, the finisher by the secondary', () => {
```
with:
```ts
  it('unarmed punches with the primary; without a secondary the last blow stays the primary', () => {
    const punch = firstBlow(strikeWorld({}, { pair: { primary: 'frost', secondary: null } }));
    expect(only(punch, 'hit')[0].element).toBe('frost');
    const solo = strikeWorld(sword, { pair: { primary: 'fire', secondary: null } }, true);
    expect(only(firstBlow(solo), 'basic')[0]).toMatchObject({ element: 'fire', moveKind: 'heavy' });
  });

  it('attunement powers each blow by its element: the primary, then the secondary last', () => {
```

In `packages/engine/tests/delve-stacks.test.ts`:

Replace:
```ts
      basicBlow: 1,
      basicFinisher: 2,
      basicByKind: { light: 1, medium: 1, heavy: 2, hold: 2 },
```
with:
```ts
      basicByKind: { light: 1, medium: 1, heavy: 2, hold: 2 },
```

Replace:
```ts
    expect(m.status.stacks.fire).toBe(bal.stacks.basicBlow);
```
with:
```ts
    expect(m.status.stacks.fire).toBe(bal.stacks.basicByKind.light);
```

Replace:
```ts
  it('every blow applies basicBlow stacks, whatever the seed: no roll', () => {
```
with:
```ts
  it("every blow applies its kind's stacks, whatever the seed: no roll", () => {
```

Replace:
```ts
      expect(w.monsters[0].status.stacks.fire, `seed ${seed}`).toBe(2 * bal.stacks.basicBlow);
    }
  });

  it("a finisher applies basicFinisher of the secondary it discharges; Twin Fang's extra hit applies none", () => {
```
with:
```ts
      // The sword's first two blows are light.
      expect(w.monsters[0].status.stacks.fire, `seed ${seed}`).toBe(
        2 * bal.stacks.basicByKind.light,
      );
    }
  });

  it("the sword's last blow, a heavy of the pair's secondary, applies a heavy's stacks; Twin Fang's extra hit none", () => {
```

Replace:
```ts
      storm: bal.stacks.basicFinisher,
```
with:
```ts
      storm: bal.stacks.basicByKind.heavy,
```

Replace:
```ts
    expect(twin.monsters[0].status.stacks.storm).toBe(bal.stacks.basicFinisher);
```
with:
```ts
    expect(twin.monsters[0].status.stacks.storm).toBe(bal.stacks.basicByKind.heavy);
```

Replace:
```ts
      stacks: bal.stacks.basicBlow,
    });
    w.hero.nextAttackAt = 1e9;
    run(w, 1);
    expect(w.monsters[0].status.stacks.fire).toBe(bal.stacks.basicBlow);
```
with:
```ts
      stacks: bal.stacks.basicByKind.light,
    });
    w.hero.nextAttackAt = 1e9;
    run(w, 1);
    expect(w.monsters[0].status.stacks.fire).toBe(bal.stacks.basicByKind.light);
```

Replace:
```ts
        frost: bal.stacks.basicFinisher,
        fire: bal.stacks.basicFinisher,
```
with:
```ts
        frost: bal.stacks.basicByKind.heavy,
        fire: bal.stacks.basicByKind.heavy,
```

In `packages/engine/tests/delve-infusion.test.ts`, a basic shot's burst draws no motif:

Replace:
```ts
describe('the weapon infusion', () => {
  const staff = { weapon: gear('fire', 'weapon', 'staff') };

  it("is the pair's bound secondary; none without one, or when it equals the primary", () => {
    const pair = (secondary: ManaType | null) => ({
      pair: { primary: 'fire' as const, secondary },
    });
    expect(computeHeroStats(staff, registry).weapon.infusion).toBeNull();
    expect(computeHeroStats(staff, registry, pair('storm')).weapon.infusion).toBe('storm');
    expect(computeHeroStats(staff, registry, pair('fire')).weapon.infusion).toBeNull();
    expect(computeHeroStats(staff, registry, pair(null)).weapon.infusion).toBeNull();
```
with:
```ts
describe('basic attacks', () => {
  it('draw no infusion: a blow has one element, and so does its burst', () => {
    const staff = { weapon: gear('fire', 'weapon', 'staff') };
    const w = arena([dummy(13, 30)], { equipped: staff });
    w.hero.stats = computeHeroStats(staff, registry, {
      pair: { primary: 'fire', secondary: 'storm' },
    });
    w.hero.attackCount = 2;
    w.hero.lastBasicAt = 0;
    const events = run(w, 1.5);
    const bursts = only(events, 'explode');
    expect(bursts.length).toBeGreaterThan(0);
    for (const e of bursts) expect(e.infusion).toBeNull();
```

In `packages/engine/tests/ability-cast.test.ts`:

Replace:
```ts
    const [first, , third] = w.hero.stats.weapon.combo;
```
with:
```ts
    const [first, , third] = w.hero.stats.weapon.blows;
```

In `packages/engine/tests/delve-reactions.test.ts`:

Replace:
```ts
      stacks: bal.stacks.basicBlow,
```
with:
```ts
      stacks: bal.stacks.basicByKind.light,
```

In `packages/engine/tests/delve-hero-smithing.test.ts` (CRLF, not Prettier-clean at HEAD: hand-edit):

Replace:
```ts
    expect(s.weapon.element).toBe('frost');
    expect(computeHeroStats({}, registry).weapon.element).toBeNull();
```
with:
```ts
    // With no pair yet, the blows strike with the weapon's mana; unarmed, with fire.
    expect(s.weapon.blows.map((b) => b.element)).toEqual(['frost', 'frost', 'frost']);
    expect(computeHeroStats({}, registry).weapon.blows.every((b) => b.element === 'fire')).toBe(
      true,
    );
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts tests/delve-combat-weight.test.ts tests/delve-pair.test.ts tests/delve-stacks.test.ts tests/delve-infusion.test.ts tests/ability-cast.test.ts tests/delve-reactions.test.ts tests/delve-hero-smithing.test.ts)`
Expected: 32 FAIL, 259 pass: in delve-chains 5 (e.g. "each blow strikes in its own element …": undefined is not iterable; "a manual hold blow holds at its strike point …": Cannot read properties of undefined (reading 'medium')), delve-combat-weight 10 (e.g. "the sword's third blow is its heavy thrust": expected [ undefined, undefined, undefined ] to deeply equal [ 'light', 'light', 'heavy' ]), delve-pair 9 (Cannot read properties of undefined (reading 'map'/'length')), delve-stacks 3 ("loads the stack numbers": expected { cap: 5, …(15) } to deeply equal { cap: 5, …(13) }), delve-reactions 3, ability-cast 1 and delve-hero-smithing 1 ("the Power estimate reads the blows": expected 58.84240978020277 to not be close to 58.84240978020277). The `estimateCombat` pin passes already: it holds today's values.

---

## Chunk 9: Engine: basics per blow (Task 5 continued: the blows)

- [ ] **Step 3: The types**

In `packages/engine/src/types/delve.ts`, the row doc, the weapons' and the hero's strings and the two stack counts go, and `HeroBlow` and the new `HeroWeapon` arrive:

Replace:
```ts
/** One blow of a weapon's basic-attack string (`delve.json` weapon `combo`). */
```
with:
```ts
/** A basic blow's row: the weapon's (`delve.json` weapon `feel`) for its kind. */
```

Replace:
```ts
  /** Weapons only: the basic-attack string (else the hero's default string). */
  combo?: ComboStepDef[];
  /** Weapons only: a blow's row by its kind (else the hero's). */
```
with:
```ts
  /** Weapons only: a blow's row by its kind (else the hero's). */
```

Replace:
```ts
    /** The melee combo resets after a pause longer than the attack interval plus this. */
    basicComboGrace: number;
    /** The string for weapons without one (and unarmed). */
    defaultCombo: ComboStepDef[];
```
with:
```ts
    /** The basic chain restarts after a pause longer than the attack interval plus this. */
    basicComboGrace: number;
```

Replace:
```ts
    basicBlow: number;
    /** A combo's finisher, and its discharge of the secondary. */
    basicFinisher: number;
    /** A basic blow's stacks, by its kind. */
```
with:
```ts
    /** A basic blow's stacks, by its kind. */
```

Replace:
```ts
export interface HeroWeapon {
```
with:
```ts
/** One blow of the hero's basic chain: the weapon's row for its kind, in its element. */
export interface HeroBlow extends ComboStepDef {
  kind: MoveKind;
  element: ManaType;
  /** Its damage multiplier: 1 + basicPowerPerAttune × its element's attunement (1 without a pair). */
  attunePower: number;
}

export interface HeroWeapon {
```

Replace:
```ts
  /** Element of basic blows: the pair's primary (even unarmed), else the weapon's mana (null unarmed). */
  element: ManaType | null;
  /**
   * The pair's bound secondary, or null: the combo's finisher discharges it,
   * and ordinary blows draw it as their motif (see the elemental affinity spec).
   */
  infusion: ManaType | null;
  /** Ordinary blows' damage multiplier: 1 + basicPowerPerAttune × the primary's attunement (1 without a pair). */
  blowPower: number;
  /** The finisher's: by the secondary's attunement (equal to `blowPower` with no secondary). */
  finisherPower: number;
  /** The basic-attack string, one entry per blow. */
  combo: ComboStepDef[];
```
with:
```ts
  /** A blow's row by its kind (a manual hold blow's stages read medium, heavy and hold). */
  feel: Record<MoveKind, ComboStepDef>;
  /** The basic chain, one entry per blow (see the moves and chains spec). */
  blows: HeroBlow[];
```

In `packages/engine/src/types/arpg.ts`, the swing records when a held blow began holding, the basic attack's `holdStage` has no slot, and the `basic` event carries its kind:

After:
```ts
    committed: boolean;
```
add:
```ts
    /** A manual hold blow held at its strike point: since when (else null). */
    held: number | null;
```

Replace:
```ts
  /** A hold reached a new stage (1, then 2). */
  | { kind: 'holdStage'; slot: number; stage: number }
```
with:
```ts
  /** A hold reached a new stage (1, then 2): an ability slot's, or the basic attack's (null). */
  | { kind: 'holdStage'; slot: number | null; stage: number }
```

Replace:
```ts
       * Display data: the ability's second element (the weapon's, for a basic
       * burst), drawn as its motif; null for one element, ticks, monsters and
       * reactions. The same on `slash`, `explode` and `dash`.
```
with:
```ts
       * Display data: the ability's second element, drawn as its motif; null for
       * one element, basic attacks, ticks, monsters and reactions. The same on
       * `slash`, `explode` and `dash`.
```

Replace:
```ts
      element: ManaType | null;
      melee: boolean;
      heft: number;
      step: number;
      dir: Vec;
      finisher: boolean;
```
with:
```ts
      element: ManaType;
      melee: boolean;
      heft: number;
      /** The blow of the basic chain, and the kind it struck as (a held blow's stage's). */
      step: number;
      moveKind: MoveKind;
      dir: Vec;
```

- [ ] **Step 4: The data**

In `packages/engine/src/data/schemas.ts`:

Replace:
```ts
        combo: z.array(ComboStepSchema).min(1).optional(),
        feel: perKind(ComboStepSchema).optional(),
```
with:
```ts
        feel: perKind(ComboStepSchema).optional(),
```

Replace:
```ts
    defaultCombo: z.array(ComboStepSchema).min(1),
    feel: perKind(ComboStepSchema),
```
with:
```ts
    feel: perKind(ComboStepSchema),
```

Replace:
```ts
    basicBlow: z.number().int().min(0),
    basicFinisher: z.number().int().min(0),
    basicByKind: perKind(z.number().int().min(0)),
```
with:
```ts
    basicByKind: perKind(z.number().int().min(0)),
```

In `packages/engine/src/data/balance.json` (hand-edit):

Replace:
```json
      "defaultCombo": [
        { "time": 0.9, "startup": 0.3, "move": 0.3, "power": 1.0, "heft": 0.2 },
        { "time": 0.9, "startup": 0.3, "move": 0.3, "power": 1.0, "heft": 0.2 },
        { "time": 1.2, "startup": 0.35, "move": 0.5, "power": 1.3, "heft": 0.4, "knockback": 0.3 }
      ],
      "feel": {
```
with:
```json
      "feel": {
```

Replace:
```json
      "byWeight": [1, 1, 2, 3, 3], "basicBlow": 1, "basicFinisher": 2, "tick": 1,
```
with:
```json
      "byWeight": [1, 1, 2, 3, 3], "tick": 1,
```

In `packages/engine/src/data/delve.json` (hand-edit), each weapon's `combo` goes (its `feel` stays):

Replace:
```json
      "combo": [
        { "time": 0.8, "startup": 0.3, "move": 0.25, "power": 0.8, "heft": 0.15 },
        { "time": 0.8, "startup": 0.3, "move": 0.25, "power": 0.8, "heft": 0.15 },
        { "time": 0.8, "startup": 0.3, "move": 0.3, "power": 0.9, "heft": 0.15 },
        { "time": 1.4, "startup": 0.35, "move": 0.7, "power": 1.7, "heft": 0.6, "arc": 150, "knockback": 0.3 }
      ],
      "feel": {
```
with:
```json
      "feel": {
```

Replace:
```json
      "combo": [
        { "time": 0.9, "startup": 0.3, "move": 0.4, "power": 1.0, "heft": 0.3 },
        { "time": 0.9, "startup": 0.3, "move": 0.4, "power": 1.0, "heft": 0.3 },
        { "time": 1.3, "startup": 0.4, "move": 1.2, "power": 1.7, "heft": 0.8, "arc": 50, "reach": 0.9, "knockback": 0.6 }
      ],
      "feel": {
```
with:
```json
      "feel": {
```

Replace:
```json
      "combo": [
        { "time": 0.9, "startup": 0.35, "move": 0.3, "power": 1.0, "heft": 0.4 },
        { "time": 0.9, "startup": 0.35, "move": 0.3, "power": 1.0, "heft": 0.4 },
        { "time": 1.3, "startup": 0.4, "move": 0.5, "power": 1.7, "heft": 0.8, "arc": 360, "knockback": 0.5 }
      ],
      "feel": {
```
with:
```json
      "feel": {
```

Replace:
```json
      "combo": [
        { "time": 1.0, "startup": 0.45, "move": 0.5, "power": 1.0, "heft": 0.6, "arc": 140 },
        { "time": 1.3, "startup": 0.5, "move": 0.7, "power": 1.8, "heft": 1.0, "arc": 360, "reach": 0.4, "knockback": 0.8, "stagger": true }
      ],
      "feel": {
```
with:
```json
      "feel": {
```

Replace:
```json
      "combo": [
        { "time": 0.9, "startup": 0.3, "move": -0.1, "power": 0.9, "heft": 0.2 },
        { "time": 0.9, "startup": 0.3, "move": -0.1, "power": 0.9, "heft": 0.2 },
        { "time": 1.3, "startup": 0.45, "move": -0.3, "power": 1.4, "heft": 0.6, "size": 1.8, "explode": 1.0 }
      ],
      "feel": {
```
with:
```json
      "feel": {
```

Replace:
```json
      "combo": [
        { "time": 0.9, "startup": 0.2, "move": -0.05, "power": 0.9, "heft": 0.1 },
        { "time": 0.9, "startup": 0.2, "move": -0.05, "power": 0.9, "heft": 0.1 },
        { "time": 1.2, "startup": 0.25, "move": -0.1, "power": 1.3, "heft": 0.3, "size": 1.5 }
      ],
      "feel": {
```
with:
```json
      "feel": {
```

Replace:
```json
      "combo": [
        { "time": 0.85, "startup": 0.35, "move": -0.05, "power": 0.85, "heft": 0.2 },
        { "time": 0.85, "startup": 0.35, "move": -0.05, "power": 0.85, "heft": 0.2 },
        { "time": 1.4, "startup": 0.6, "move": -0.2, "power": 1.6, "heft": 0.6, "speed": 1.4 }
      ],
      "feel": {
```
with:
```json
      "feel": {
```

- [ ] **Step 5: The blows in the stats**

In `packages/engine/src/delve/hero-stats.ts`, `HeroStatsExtra.basic`, the weapon's `blows`, and `estimateCombat` over them:

Replace:
```ts
  type Chains,
  type ResolvedChain,
} from '../types/ability.js';
import { defaultChains, resolveChain, stepBonus } from '../arpg/abilities/resolve.js';
```
with:
```ts
  type Blow,
  type Chains,
  type ResolvedChain,
} from '../types/ability.js';
import { defaultBasic, defaultChains, resolveChain, stepBonus } from '../arpg/abilities/resolve.js';
```

Replace:
```ts
   * The hero's pair, for basic attacks: blows strike with the primary (even
   * unarmed) and the finisher discharges a bound secondary. A secondary equal
   * to the primary counts as unbound.
```
with:
```ts
   * The hero's pair: its attunement powers basic blows, and with no `basic`
   * the blows are the weapon's default chain on it (see `defaultBasic`). A
   * secondary equal to the primary counts as unbound.
```

After:
```ts
  filterAttunement?: boolean;
```
add:
```ts
  /** The hero's basic chain (see the moves and chains spec). */
  basic?: Blow[];
```

Replace:
```ts
  // The pair decides what basic attacks strike with (see HeroStatsExtra.pair).
  const [primary = null, secondary = null] = pairElements(extra.pair);
  const perAttune = bal.pair.basicPowerPerAttune;
  const blowPower = primary ? 1 + perAttune * attunement[primary] : 1;
  const finisherPower = primary ? 1 + perAttune * attunement[secondary ?? primary] : 1;
  const weaponItem = equipped.weapon;
  const weaponBase = weaponItem ? registry.getGearBase(weaponItem.baseId) : null;
  const weapon: HeroWeapon = weaponBase?.attack
    ? {
        baseId: weaponBase.id,
        kind: weaponBase.attack.kind,
        range: weaponBase.attack.range,
        arc: weaponBase.attack.arc ?? 90,
        speed: weaponBase.attack.speed ?? 12,
        pierce: weaponBase.attack.pierce ?? false,
        element: primary ?? weaponItem!.mana,
        infusion: secondary,
        blowPower,
        finisherPower,
        combo: weaponBase.combo ?? bal.hero.defaultCombo,
      }
    : {
        baseId: null,
        kind: 'melee',
        range: 1.4,
        arc: 90,
        speed: 0,
        pierce: false,
        element: primary,
        infusion: secondary,
        blowPower,
        finisherPower,
        combo: bal.hero.defaultCombo,
      };
```
with:
```ts
  const [primary = null, secondary = null] = pairElements(extra.pair);
  const weaponItem = equipped.weapon;
  const weaponBase = weaponItem ? registry.getGearBase(weaponItem.baseId) : null;
  const armed = weaponBase?.attack ? weaponBase : null;
  // The basic chain: the hero's, else the weapon's default on the pair (with no pair yet, the
  // weapon's mana, else fire). Each blow is its kind's row, powered by its element's attunement.
  const feel = armed?.feel ?? bal.hero.feel;
  const chain =
    extra.basic ??
    defaultBasic(registry, armed?.id ?? null, primary ?? weaponItem?.mana ?? 'fire', secondary);
  const perAttune = bal.pair.basicPowerPerAttune;
  const blows = chain.map((b) => ({
    ...feel[b.kind],
    kind: b.kind,
    element: b.element,
    attunePower: primary ? 1 + perAttune * attunement[b.element] : 1,
  }));
  const weapon: HeroWeapon = armed?.attack
    ? {
        baseId: armed.id,
        kind: armed.attack.kind,
        range: armed.attack.range,
        arc: armed.attack.arc ?? 90,
        speed: armed.attack.speed ?? 12,
        pierce: armed.attack.pierce ?? false,
        feel,
        blows,
      }
    : { baseId: null, kind: 'melee', range: 1.4, arc: 90, speed: 0, pierce: false, feel, blows };
```

Replace:
```ts
    stats.weapon.element ?? 'fire',
```
with:
```ts
    stats.weapon.blows[0].element,
```

Replace:
```ts
  const combo = stats.weapon.combo;
  const stringPower = combo.reduce((a, s) => a + s.power, 0);
  const stringTime = combo.reduce((a, s) => a + s.time, 0);
  const strikeInterval = (stats.attackInterval * stringTime) / combo.length;
  // Ordinary blows strike with the primary; the finisher discharges the secondary (or stays the primary).
  const w = stats.weapon;
  const elem = (m: ManaType | null) => (m ? stats.elementPower[m] : 0);
  const blow = w.blowPower * (1 + elem(w.element));
  const finisher = w.finisherPower * (1 + elem(w.infusion ?? w.element));
  const last = combo[combo.length - 1].power;
  // Twin Fang: one extra hit on the finisher, at its value (×1.5 melee, ×1 ranged).
  const twin = ((L.twin_fang ?? 0) / 100) * (melee ? 1.5 : 1);
  const stringValue = (stringPower - last) * blow + (last + twin) * finisher;
```
with:
```ts
  // Each blow's power × its element's power, over the chain's time.
  const blows = stats.weapon.blows;
  const stringTime = blows.reduce((a, s) => a + s.time, 0);
  const strikeInterval = (stats.attackInterval * stringTime) / blows.length;
  const value = (b: (typeof blows)[number]) => b.attunePower * (1 + stats.elementPower[b.element]);
  // Twin Fang: one extra hit on the last blow, at its value (×1.5 melee, ×1 ranged).
  const twin = ((L.twin_fang ?? 0) / 100) * (melee ? 1.5 : 1);
  const stringValue =
    blows.reduce((a, b) => a + b.power * value(b), 0) + twin * value(blows[blows.length - 1]);
```

- [ ] **Step 6: Striking per blow, and manual hold blows**

In `packages/engine/src/arpg/basic.ts`. The imports and the header; `basicStep` counts blows; a manual hold blow starts as a medium one; then `basicHoldTick` joins `strike`, which reads the blow's element, power and kind (a held blow's stage's row) and takes a held blow's cycle from its row; a basic burst has no motif:

Replace:
```ts
import type { DelveBalance } from '../types/delve.js';
import type { ManaType } from '../types/mana.js';
import { BASIC_STATUS, hitMonster, type SimCtx } from './combat.js';
import { angleBetween, dirTo, dist } from './geometry.js';
import { startPush } from './action.js';
```
with:
```ts
import { HOLD_STAGE_KINDS } from '../types/ability.js';
import type { DelveBalance } from '../types/delve.js';
import { BASIC_STATUS, hitMonster, type SimCtx } from './combat.js';
import { angleBetween, dirTo, dist } from './geometry.js';
import { startPush } from './action.js';
import { holdCharge } from './abilities/cast.js';
```

Replace:
```ts
 * The basic attack: each blow of the weapon's string has a startup (a
 * committed melee blow lunges in), a strike, and a recovery that slows
 * movement. See the combat weight spec.
```
with:
```ts
 * The basic attack: each blow of the hero's basic chain (its kind's row, in
 * its element) has a startup (a committed melee blow lunges in), a strike,
 * and a recovery that slows movement. See the combat weight and the moves and
 * chains specs.
```

Replace:
```ts
/** The blow of the weapon's string the next swing makes: the string restarts after a pause. */
export function basicStep(h: HeroEntity, t: number, bal: DelveBalance): number {
  if (t - h.lastBasicAt > h.stats.attackInterval + bal.hero.basicComboGrace) return 0;
  return h.attackCount % h.stats.weapon.combo.length;
}

/**
 * Start the next blow of the string when the weapon is ready. Automatic: only
 * at a foe in reach. Manual: toward `aim` if given, else the nearest foe in
 * reach, else straight ahead. A committed swing roots the hero, lunges and
 * ends any recovery. Returns whether a swing started.
```
with:
```ts
/** The blow of the basic chain the next swing makes: the chain restarts after a pause. */
export function basicStep(h: HeroEntity, t: number, bal: DelveBalance): number {
  if (t - h.lastBasicAt > h.stats.attackInterval + bal.hero.basicComboGrace) return 0;
  return h.attackCount % h.stats.weapon.blows.length;
}

/**
 * Start the next blow of the chain when the weapon is ready. Automatic: only
 * at a foe in reach. Manual: toward `aim` if given, else the nearest foe in
 * reach, else straight ahead. A committed swing roots the hero, lunges and
 * ends any recovery; a manual hold blow starts as a medium one (it holds at
 * its strike point: see `basicHoldTick`). Returns whether a swing started.
```

Replace:
```ts
  const s = w.combo[step];
```
with:
```ts
  const blow = w.blows[step];
  const s = manual && blow.kind === 'hold' ? w.feel.medium : blow;
```

After:
```ts
    committed,
```
add:
```ts
    held: null,
```

Replace:
```ts
/** Land the swing's blow from where the hero stands now. */
export function strike(ctx: SimCtx): void {
```
with:
```ts
/**
 * A manual hold blow at its strike point: while the attack stays held it
 * charges (stages by `holdStages`, saying so), and it strikes with its
 * stage's row when the attack lets go or at `holdMax` (stage 2).
 */
export function basicHoldTick(ctx: SimCtx, held: boolean, dt: number): void {
  const { world, bal } = ctx;
  const sw = world.hero.swing!;
  const t = world.t;
  sw.held ??= t;
  const { stage } = holdCharge(bal, sw.held, t);
  if (t - sw.held >= bal.chains.holdMax - 1e-9) return strike(ctx, 2);
  if (!held) return strike(ctx, stage);
  if (stage > holdCharge(bal, sw.held, t - dt).stage)
    ctx.events.push({ kind: 'holdStage', slot: null, stage });
}

/**
 * Land the swing's blow from where the hero stands now: in its element, with
 * its power and its kind's stacks. A held blow (`stage`) strikes with that
 * stage's row (medium, heavy, hold) and takes its time from it.
 */
export function strike(ctx: SimCtx, stage: number | null = null): void {
```

Replace:
```ts
  const s = w.combo[sw.step];
  // The lunge belongs to the swing and ends with it (no other push runs during a swing).
  h.push = null;
  const last = sw.step === w.combo.length - 1;
```
with:
```ts
  const blow = w.blows[sw.step];
  const kind = stage === null ? blow.kind : HOLD_STAGE_KINDS[stage];
  const s = stage === null ? blow : w.feel[kind];
  // The lunge belongs to the swing and ends with it (no other push runs during a swing).
  h.push = null;
  const last = sw.step === w.blows.length - 1;
```

Replace:
```ts
  // The finisher discharges a bound secondary (weapon.infusion); every other blow strikes
  // with the primary. Each grows with its element's attunement (blowPower / finisherPower).
  const discharge = last && w.infusion !== null;
  const element: ManaType | null = discharge ? w.infusion : w.element;
  const unit = h.stats.weaponDamage * h.stats.damageMult * (last ? w.finisherPower : w.blowPower);
  const base = unit * s.power;
  const twinPct = (h.stats.legendaries.twin_fang ?? 0) / 100;
  const twin = twinPct > 0 && last;
  // Every blow applies its element's stacks (a Surge's statuses ride along), the finisher more.
  const applies: StatusId[] = surge ? [...surge.knobs.applies] : [];
  if (element && !applies.includes(BASIC_STATUS[element])) applies.push(BASIC_STATUS[element]);
  if (s.stagger && !applies.includes('stagger')) applies.push('stagger');
  const stacks = last ? bal.stacks.basicFinisher : bal.stacks.basicBlow;
  // An Earth blow (a discharge included) or an Earth Surge's statuses: its stagger adds Earth stacks.
```
with:
```ts
  const element = blow.element;
  const unit = h.stats.weaponDamage * h.stats.damageMult * blow.attunePower;
  const base = unit * s.power;
  const twinPct = (h.stats.legendaries.twin_fang ?? 0) / 100;
  const twin = twinPct > 0 && last;
  // Every blow applies its element's stacks, by its kind (a Surge's statuses ride along).
  const applies: StatusId[] = surge ? [...surge.knobs.applies] : [];
  if (!applies.includes(BASIC_STATUS[element])) applies.push(BASIC_STATUS[element]);
  if (s.stagger && !applies.includes('stagger')) applies.push('stagger');
  const stacks = bal.stacks.basicByKind[kind];
  // An Earth blow or an Earth Surge's statuses: its stagger adds Earth stacks.
```

Replace:
```ts
      // nothing (it would only Melt the finisher's own fresh stacks).
```
with:
```ts
      // nothing (it would only react with the last blow's own fresh stacks).
```

Replace:
```ts
    dir,
    finisher: last,
  });
  if (landed) h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
  if (sw.committed)
    h.recoverUntil = Math.min(h.nextAttackAt, world.t + sw.cycle * bal.feel.basicRecovery);
```
with:
```ts
    moveKind: kind,
    dir,
  });
  if (landed) h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
  // A held blow takes its time from its stage's row; its startup was spent holding.
  const cycle = stage === null ? sw.cycle : (h.stats.attackInterval * s.time) / haste(ctx);
  if (stage !== null) h.nextAttackAt = world.t + cycle * (1 - s.startup);
  if (sw.committed)
    h.recoverUntil = Math.min(h.nextAttackAt, world.t + cycle * bal.feel.basicRecovery);
```

Replace:
```ts
    // The motif only when the body isn't already that element (a finisher's discharge).
    infusion:
      p.element === ctx.world.hero.stats.weapon.infusion
        ? null
        : ctx.world.hero.stats.weapon.infusion,
```
with:
```ts
    infusion: null,
```

In `packages/engine/src/arpg/step.ts`, a manual hold blow at its strike point charges while the attack is held:

Replace:
```ts
import { burstShot, startSwing, strike } from './basic.js';
```
with:
```ts
import { basicHoldTick, burstShot, startSwing, strike } from './basic.js';
```

Replace:
```ts
  if (h.swing && t >= h.swing.strikeAt - 1e-9) strike(ctx);
```
with:
```ts
  if (h.swing && t >= h.swing.strikeAt - 1e-9) {
    // A manual hold blow holds at its strike point while the attack stays held.
    if (input.attack !== undefined && h.stats.weapon.blows[h.swing.step].kind === 'hold')
      basicHoldTick(ctx, input.attack, dt);
    else strike(ctx);
  }
```

- [ ] **Step 7: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (291).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1240 tests pass.

- [ ] **Step 8: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/delve.ts packages/engine/src/types/arpg.ts packages/engine/src/data/schemas.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/step.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-stacks.test.ts packages/engine/tests/delve-infusion.test.ts packages/engine/tests/ability-cast.test.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/types/delve.ts packages/engine/src/types/arpg.ts packages/engine/src/data/schemas.ts packages/engine/src/data/balance.json packages/engine/src/data/delve.json packages/engine/src/delve/hero-stats.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/step.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-stacks.test.ts packages/engine/tests/delve-infusion.test.ts packages/engine/tests/ability-cast.test.ts packages/engine/tests/delve-reactions.test.ts packages/engine/tests/delve-hero-smithing.test.ts
git commit -m "feat(engine): basic blows each strike in their own kind and element; manual hold blows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 10: Engine: save v5 and the chain ops (Task 6: the tests)

### Task 6: Save v5, the chain ops, the autopilot

The profile holds `chains: Chains` and `chainCaps: Record<ChainSkill, number>` (the balance's `chains.cap` to start; nothing writes them yet) instead of `abilities`, at version 5. `DelveProfileSchema` v5 validates `MoveSchema`, `BlowSchema` and `ChainSchema` (1 to `MAX_CHAIN` moves, one or two different elements, each move a form of its slot: `SLOT_FORMS`, which a test holds to `arpg.json`'s) and the caps (1 to `MAX_CHAIN`); today's schema is frozen as `DelveProfileV4Schema`, and v3 and v2 stay. `parseDelveProfile` migrates 2 → 3 → 4 → 5: to 5, each build is its form's default chain shifted a step lighter (weight −2, −1) or heavier (+1, +2) within light..heavy (`chainFromBuild`, from Task 3), with its elements and payment; the basics are the weapon's default chain with the secondary last when bound (with no primary, the weapon's mana, else fire); a version 2 save starts from its new primary's defaults; the caps are the balance's; and every move is fixed to the pair. The ops move to chains: `setChain(registry, profile, skill, chain)` replaces `setAbility` (it refuses mid-dive, fewer than one move or more than the skill's cap, an unknown kind, a form from another slot, anything but one or two different elements (a blow: one), an element outside the pair once there is one, a bad payment); `fixChainsToPair` replaces `fixBuildsToPair`, per move with one `ChainFix { skill, index, removed, move }` each (an emptied move, or a blow outside the pair, takes the primary); `chooseStartingMana` resets to `defaultChains` on the weapon; `bindSecondary` makes the basic chain's last blow the secondary; `realign` and `reattune` keep their contracts. `profileStats`/`pairExtra` pass the profile's basic chain, and `compareItem`/`heroPower`/`profilePower` take the profile's chains. The autopilot's `bindBest` sets every move of the Primary chain to the pair.

**Files:**
- Modify: `packages/engine/src/types/delve.ts:3,655,671-672` (`DelveProfile` v5)
- Modify: `packages/engine/src/delve/profile-schema.ts:5-32,162,167` (CRLF, hand-edit), `profile.ts:24-230`, `pair.ts:2-177`, `hero-stats.ts:424-472`, `dive.ts:11,80` (CRLF, hand-edit), `autopilot.ts:22-146` (CRLF, hand-edit), `packages/engine/src/index.ts:162-181`
- Modify: `packages/engine/tests/fixtures/arena.ts:8,16,41-42` (`OLD_BUILDS`, `asV4`)
- Test: `packages/engine/tests/delve-chains.test.ts`; updated: `delve-profile-abilities.test.ts` (whole file), `delve-pair`, `delve-dive`, `delve-reactions`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/fixtures/arena.ts`, a version 4 save's builds and a way to make one:

Before:
```ts
  AbilityCast,
```
add:
```ts
  AbilityBuilds,
```

Before:
```ts
import type { EquippedGear } from '../../src/types/gear.js';
```
add:
```ts
import type { DelveProfile } from '../../src/types/delve.js';
```

Replace:
```ts
};

/** A slot's chain in a test: its one move with these parts changed and its payment, or whole `moves`. */
```
with:
```ts
};

/** A version 4 save's default builds (all Fire), for the migration tests. */
export const OLD_BUILDS: AbilityBuilds = {
  primary: { form: 'bolt', elements: ['fire'], weight: 0, payment: 'mana' },
  defensive: { form: 'ward', elements: ['fire'], weight: 0, payment: 'mana' },
  ultimate: { form: 'nova', elements: ['fire'], weight: 0, payment: 'charge' },
};

/** `p` as a version 4 save: `abilities` instead of its chains and caps. */
export function asV4(p: DelveProfile, abilities: AbilityBuilds = OLD_BUILDS) {
  const { chains: _chains, chainCaps: _caps, ...rest } = p;
  return { ...rest, version: 4, abilities };
}

/** A slot's chain in a test: its one move with these parts changed and its payment, or whole `moves`. */
```

In `packages/engine/tests/delve-chains.test.ts`, the imports, then the save tests after the basics:

Replace:
```ts
import {
  CHAIN_SKILLS,
  MAX_CHAIN,
  MOVE_KINDS,
```
with:
```ts
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { SLOT_FORMS } from '../src/delve/profile-schema.js';
import {
  ABILITY_SLOTS,
  CHAIN_SKILLS,
  MAX_CHAIN,
  MOVE_KINDS,
  type AbilityBuild,
```

Replace:
```ts
  STEP,
  arena,
```
with:
```ts
  OLD_BUILDS,
  STEP,
  arena,
  asV4,
```

Replace:
```ts
    expect(w.monsters[0].status.stacks.fire).toBe(bal.stacks.basicByKind.hold);
  });
});
```
with:
```ts
    expect(w.monsters[0].status.stacks.fire).toBe(bal.stacks.basicByKind.hold);
  });
});

describe('save v5', () => {
  const json = (x: unknown) => JSON.parse(JSON.stringify(x));
  const hero = createDelveProfile(registry, 3, { primary: 'fire' });
  const migrate = (v4: object) => parseDelveProfile(registry, json(v4))!;

  it("v4 → v5 gives each build its form's default chain, a step lighter or heavier by its weight", () => {
    const cases: [AbilityBuild, MoveKind[]][] = [
      [
        { form: 'bolt', elements: ['fire'], weight: 0, payment: 'mana' },
        ['light', 'light', 'medium', 'heavy'],
      ],
      [
        { form: 'volley', elements: ['fire'], weight: 0, payment: 'mana' },
        ['medium', 'medium', 'medium'],
      ],
      [
        { form: 'lance', elements: ['fire'], weight: 0, payment: 'cast' },
        ['medium', 'medium', 'heavy'],
      ],
      [
        { form: 'burst', elements: ['fire'], weight: 0, payment: 'charge' },
        ['medium', 'medium', 'heavy'],
      ],
      [
        { form: 'strike', elements: ['fire'], weight: 0, payment: 'mana' },
        ['medium', 'medium', 'medium', 'heavy'],
      ],
      [
        { form: 'bolt', elements: ['fire'], weight: -2, payment: 'mana' },
        ['light', 'light', 'light', 'medium'],
      ],
      [
        { form: 'bolt', elements: ['fire'], weight: -1, payment: 'mana' },
        ['light', 'light', 'light', 'medium'],
      ],
      [
        { form: 'strike', elements: ['fire'], weight: 2, payment: 'mana' },
        ['heavy', 'heavy', 'heavy', 'heavy'],
      ],
      [
        { form: 'lance', elements: ['fire'], weight: 1, payment: 'mana' },
        ['heavy', 'heavy', 'heavy'],
      ],
    ];
    for (const [build, kinds] of cases) {
      const { profile, fixed } = migrate(asV4(hero, { ...OLD_BUILDS, primary: build }));
      expect(profile.chains.primary, `${build.form} ${build.weight}`).toEqual({
        moves: kinds.map((kind) => ({ kind, form: build.form, elements: build.elements })),
        payment: build.payment,
      });
      expect(fixed).toEqual([]);
    }
    const { profile } = migrate(
      asV4(hero, {
        ...OLD_BUILDS,
        defensive: { form: 'armor', elements: ['fire'], weight: 2, payment: 'cast' },
        ultimate: { form: 'barrage', elements: ['fire'], weight: -1, payment: 'charge' },
      }),
    );
    expect(profile).toMatchObject({ version: 5, chainCaps: bal.chains.cap });
    expect('abilities' in profile).toBe(false);
    expect(profile.chains.defensive).toEqual({
      moves: [{ kind: 'heavy', form: 'armor', elements: ['fire'] }],
      payment: 'cast',
    });
    expect(profile.chains.ultimate).toEqual({
      moves: [{ kind: 'light', form: 'barrage', elements: ['fire'] }],
      payment: 'charge',
    });
  });

  it("v4 → v5 gives the weapon's default basics, the secondary last when bound; with no primary, the weapon's mana", () => {
    const blows = (v4: object) => migrate(v4).profile.chains.basic;
    const bound = { ...asV4(hero), pair: { primary: 'fire', secondary: 'storm' } };
    expect(blows(bound)).toEqual([
      { kind: 'light', element: 'fire' },
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'storm' },
    ]);
    const maul = {
      ...asV4(hero),
      equipped: { ...hero.equipped, weapon: gear('fire', 'weapon', 'maul') },
    };
    expect(blows(maul).map((b) => b.kind)).toEqual(['medium', 'heavy']);
    const unchosen = createDelveProfile(registry, 3); // no pair yet; a Frost sword
    const frost = { ...asV4(unchosen), equipped: { weapon: gear('frost') } };
    expect(blows(frost).map((b) => b.element)).toEqual(['frost', 'frost', 'frost']);
  });

  it('refuses a chain past MAX_CHAIN or empty, a form in the wrong slot, and a cap out of range', () => {
    const p = createDelveProfile(registry, 3);
    const bad = (x: object) => parseDelveProfile(registry, json(x));
    const bolt = p.chains.primary.moves[0];
    const chains = (over: object) => ({ ...p, chains: { ...p.chains, ...over } });
    expect(
      bad(chains({ primary: { moves: Array(MAX_CHAIN + 1).fill(bolt), payment: 'mana' } })),
    ).toBeNull();
    expect(bad(chains({ primary: { moves: [], payment: 'mana' } }))).toBeNull();
    expect(bad(chains({ defensive: { moves: [bolt], payment: 'mana' } }))).toBeNull();
    expect(bad(chains({ basic: [] }))).toBeNull();
    expect(bad({ ...p, chainCaps: { ...p.chainCaps, basic: 0 } })).toBeNull();
    expect(bad({ ...p, chainCaps: { ...p.chainCaps, ultimate: MAX_CHAIN + 1 } })).toBeNull();
    // The save's slot forms are arpg.json's.
    for (const slot of ABILITY_SLOTS)
      expect(SLOT_FORMS[slot]).toEqual(
        registry
          .getArpgData()
          .forms.filter((f) => f.slot === slot)
          .map((f) => f.id),
      );
  });
});
```

Replace the whole of `packages/engine/tests/delve-profile-abilities.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { defaultChains } from '../src/arpg/abilities/resolve.js';
import { createDelveProfile, parseDelveProfile, setChain } from '../src/delve/profile.js';
import { startDive } from '../src/delve/dive.js';
import type { Chain, Move } from '../src/types/ability.js';
import { asV4 } from './fixtures/arena.js';

const registry = createDefaultRegistry();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('profile chains (save v5)', () => {
  it("a new profile starts with its weapon element's default chains and the balance's caps", () => {
    const p = createDelveProfile(registry, 1);
    expect(p.version).toBe(5);
    expect(p.chains).toEqual(defaultChains(registry, 'fire', 'sword'));
    expect(p.chainCaps).toEqual(registry.getDelveBalance().chains.cap);
  });

  it('setChain takes a valid chain for any skill, and it round-trips', () => {
    const chain: Chain = {
      moves: [
        { kind: 'light', form: 'burst', elements: ['fire', 'nature'] },
        { kind: 'hold', form: 'lance', elements: ['fire'] },
      ],
      payment: 'cast',
    };
    let p = setChain(registry, createDelveProfile(registry, 1), 'primary', chain);
    p = setChain(registry, p, 'basic', [{ kind: 'heavy', element: 'nature' }]);
    expect(p.chains.primary).toEqual(chain);
    expect(p.chains.basic).toEqual([{ kind: 'heavy', element: 'nature' }]);
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p, fixed: [] });
  });

  it('setChain refuses no moves, more than the cap, an unknown kind, a form from another slot, bad elements or payment', () => {
    const p = createDelveProfile(registry, 1);
    const move: Move = { kind: 'medium', form: 'bolt', elements: ['fire'] };
    const ok: Chain = { moves: [move], payment: 'mana' };
    const set =
      (chain: Chain, profile = p) =>
      () =>
        setChain(registry, profile, 'primary', chain);
    expect(set(ok)).not.toThrow();
    expect(set({ ...ok, moves: [] })).toThrow('A chain holds 1 to 5 moves');
    expect(set({ ...ok, moves: Array(6).fill(move) })).toThrow('A chain holds 1 to 5 moves');
    const capped = { ...p, chainCaps: { ...p.chainCaps, primary: 2 } };
    expect(set({ ...ok, moves: [move, move, move] }, capped)).toThrow('A chain holds 1 to 2 moves');
    expect(set({ ...ok, moves: [{ ...move, kind: 'huge' as never }] })).toThrow('Bad kind huge');
    expect(set({ ...ok, moves: [{ ...move, form: 'nova' }] })).toThrow(
      'Nova is not a primary form',
    );
    for (const elements of [[], ['fire', 'fire'], ['fire', 'frost', 'storm']] as const)
      expect(set({ ...ok, moves: [{ ...move, elements: [...elements] }] })).toThrow(
        'Pick one or two different elements',
      );
    expect(set({ ...ok, payment: 'gold' as never })).toThrow('Bad payment gold');
    expect(() => setChain(registry, p, 'basic', [])).toThrow('A chain holds 1 to 5 moves');
    expect(() =>
      setChain(registry, p, 'basic', [{ kind: 'light', element: 'gold' as never }]),
    ).toThrow('Unknown element');
  });

  it('chains can only change between dives', () => {
    const diving = startDive(registry, createDelveProfile(registry, 1), 1);
    expect(() => setChain(registry, diving, 'basic', [{ kind: 'light', element: 'fire' }])).toThrow(
      /dive/,
    );
  });

  it("migrates a version 2 save, keeping gear and scrap: its new primary's default chains", () => {
    const p0 = createDelveProfile(registry, 7);
    const { abilities: _abilities, ...rest } = asV4(p0);
    const frost = { ...p0.equipped.weapon!, mana: 'frost' as const };
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
    expect(p!.version).toBe(5);
    expect(p!.scrap).toBe(321);
    expect(p!.equipped.weapon!.uid).toBe(p0.equipped.weapon!.uid);
    expect(p!.chains).toEqual(defaultChains(registry, 'frost', 'sword'));
    expect('skillSlots' in p!).toBe(false);
  });

  it('remembers the new reactions', () => {
    const p = { ...createDelveProfile(registry, 1), reactionsSeen: ['combust', 'blight'] };
    expect(
      parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))?.profile.reactionsSeen,
    ).toEqual(['combust', 'blight']);
  });
});
```

In `packages/engine/tests/delve-pair.test.ts`, the ops on chains and version 5:

Replace:
```ts
import { defaultAbilities, defaultChains } from '../src/arpg/abilities/resolve.js';
```
with:
```ts
import { defaultChains } from '../src/arpg/abilities/resolve.js';
```

Replace:
```ts
  fixBuildsToPair,
```
with:
```ts
  fixChainsToPair,
```

Replace:
```ts
  setAbility,
  setAutoSalvage,
} from '../src/delve/profile.js';
import type { AbilityBuild, AbilityBuilds } from '../src/types/ability.js';
```
with:
```ts
  setAutoSalvage,
  setChain,
} from '../src/delve/profile.js';
import { ABILITY_SLOTS, type Chain, type Chains } from '../src/types/ability.js';
```

Replace:
```ts
import { bal, dummy, firstBlow, gear, registry, run, strikeWorld } from './fixtures/arena.js';
```
with:
```ts
import {
  OLD_BUILDS,
  asV4,
  bal,
  dummy,
  firstBlow,
  gear,
  registry,
  run,
  strikeWorld,
} from './fixtures/arena.js';
```

Replace:
```ts
describe('save version 4', () => {
  /** A version 3 save of `p`: no pair, no Mana Dust. */
  function v3Of(p: DelveProfile) {
    const { pair: _pair, manaDust: _dust, ...rest } = p;
```
with:
```ts
describe('save version 5', () => {
  /** A version 3 save of `p`: its builds (`OLD_BUILDS`), no pair, no Mana Dust. */
  function v3Of(p: DelveProfile) {
    const { pair: _pair, manaDust: _dust, ...rest } = asV4(p);
```

Replace:
```ts
  it('default builds are all one element, the Ward included', () => {
    expect(defaultAbilities('storm')).toEqual({
      primary: { form: 'bolt', elements: ['storm'], weight: 0, payment: 'mana' },
      defensive: { form: 'ward', elements: ['storm'], weight: 0, payment: 'mana' },
      ultimate: { form: 'nova', elements: ['storm'], weight: 0, payment: 'charge' },
    });
  });

  it('a new profile is version 4 with no pair yet and no Mana Dust, and round-trips', () => {
    const p = createDelveProfile(registry, 3);
    expect(p).toMatchObject({ version: 4, pair: { primary: null, secondary: null }, manaDust: 0 });
```
with:
```ts
  it('default chains are all one element, the Ward included', () => {
    const c = defaultChains(registry, 'storm', 'sword');
    const elements = [
      ...c.basic.map((b) => b.element),
      ...ABILITY_SLOTS.flatMap((s) => c[s].moves.flatMap((m) => m.elements)),
    ];
    expect(new Set(elements)).toEqual(new Set(['storm']));
    expect(c.defensive.moves.map((m) => m.form)).toEqual(['ward']);
  });

  it('a new profile is version 5 with no pair yet and no Mana Dust, and round-trips', () => {
    const p = createDelveProfile(registry, 3);
    expect(p).toMatchObject({ version: 5, pair: { primary: null, secondary: null }, manaDust: 0 });
```

Replace:
```ts
  it('migrates version 3: the most attunement is the primary, and the builds are fixed to it', () => {
```
with:
```ts
  it("migrates version 3: the most attunement is the primary, and each chain's moves are fixed to it", () => {
```

Replace:
```ts
      abilities: { ...p.abilities, defensive: { ...p.abilities.defensive, elements: ['frost'] } },
    };
    const res = parseDelveProfile(registry, json(old))!;
    expect(res.profile).toMatchObject({
      version: 4,
      pair: { primary: 'storm', secondary: null },
      manaDust: 0,
    });
    expect(res.profile.abilities.primary.elements).toEqual(['storm']);
    expect(res.fixed.map((f) => [f.slot, f.removed])).toEqual([
      ['primary', ['fire']],
      ['defensive', ['frost']],
      ['ultimate', ['fire']],
```
with:
```ts
      abilities: { ...OLD_BUILDS, defensive: { ...OLD_BUILDS.defensive, elements: ['frost'] } },
    };
    const res = parseDelveProfile(registry, json(old))!;
    expect(res.profile).toMatchObject({
      version: 5,
      pair: { primary: 'storm', secondary: null },
      manaDust: 0,
    });
    expect(res.profile.chains.primary.moves.map((m) => m.elements)).toEqual([
      ['storm'],
      ['storm'],
      ['storm'],
      ['storm'],
    ]);
    // The Bolt's default chain has four moves: a notice each.
    expect(res.fixed.map((f) => [f.skill, f.index, f.removed])).toEqual([
      ['primary', 0, ['fire']],
      ['primary', 1, ['fire']],
      ['primary', 2, ['fire']],
      ['primary', 3, ['fire']],
      ['defensive', 0, ['frost']],
      ['ultimate', 0, ['fire']],
```

Replace:
```ts
  it("migrates version 2 through version 3: its new primary's default builds, nothing to fix; a dive stays", () => {
```
with:
```ts
  it("migrates version 2 through versions 3 and 4: its new primary's default chains, nothing to fix; a dive stays", () => {
```

Replace:
```ts
    expect(res.profile).toMatchObject({ version: 4, pair: { primary: 'storm', secondary: null } });
    expect(res.profile.abilities).toEqual(defaultAbilities('storm'));
```
with:
```ts
    expect(res.profile).toMatchObject({ version: 5, pair: { primary: 'storm', secondary: null } });
    expect(res.profile.chains).toEqual(defaultChains(registry, 'storm', 'sword'));
```

Replace:
```ts
  it('fixBuildsToPair keeps in-pair elements and gives an emptied slot the primary', () => {
    const abilities: AbilityBuilds = {
      primary: { form: 'lance', elements: ['storm', 'frost'], weight: 1, payment: 'cast' },
      defensive: { form: 'ward', elements: ['nature'], weight: -1, payment: 'charge' },
      ultimate: { form: 'nova', elements: ['fire'], weight: 0, payment: 'charge' },
```
with:
```ts
  it('fixChainsToPair keeps in-pair elements, gives an emptied move or a blow the primary, a notice each', () => {
    const chains: Chains = {
      basic: [
        { kind: 'light', element: 'fire' },
        { kind: 'heavy', element: 'frost' },
      ],
      primary: {
        moves: [
          { kind: 'medium', form: 'lance', elements: ['storm', 'frost'] },
          { kind: 'hold', form: 'lance', elements: ['fire'] },
        ],
        payment: 'cast',
      },
      defensive: {
        moves: [{ kind: 'light', form: 'ward', elements: ['nature'] }],
        payment: 'charge',
      },
      ultimate: {
        moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }],
        payment: 'charge',
      },
```

Replace:
```ts
      abilities,
    };
    const res = fixBuildsToPair(p);
    expect(res.profile.abilities.primary).toEqual({ ...abilities.primary, elements: ['storm'] });
    expect(res.profile.abilities.defensive).toEqual({ ...abilities.defensive, elements: ['fire'] });
    expect(res.profile.abilities.ultimate).toBe(abilities.ultimate);
    expect(res.fixed).toEqual([
      { slot: 'primary', removed: ['frost'], build: res.profile.abilities.primary },
      { slot: 'defensive', removed: ['nature'], build: res.profile.abilities.defensive },
    ]);
    expect(fixBuildsToPair(res.profile)).toEqual({ profile: res.profile, fixed: [] });
```
with:
```ts
      chains,
    };
    const res = fixChainsToPair(p);
    const fixed = res.profile.chains;
    expect(fixed.basic).toEqual([chains.basic[0], { kind: 'heavy', element: 'fire' }]);
    expect(fixed.primary.moves).toEqual([
      { kind: 'medium', form: 'lance', elements: ['storm'] },
      chains.primary.moves[1],
    ]);
    expect(fixed.defensive.moves).toEqual([{ kind: 'light', form: 'ward', elements: ['fire'] }]);
    expect(fixed.ultimate).toEqual(chains.ultimate);
    expect(res.fixed).toEqual([
      { skill: 'basic', index: 1, removed: ['frost'], move: fixed.basic[1] },
      { skill: 'primary', index: 0, removed: ['frost'], move: fixed.primary.moves[0] },
      { skill: 'defensive', index: 0, removed: ['nature'], move: fixed.defensive.moves[0] },
    ]);
    expect(fixChainsToPair(res.profile)).toEqual({ profile: res.profile, fixed: [] });
```

Replace:
```ts
  it('chooseStartingMana: the primary, equipped gear re-attuned with its lines, default builds; once', () => {
```
with:
```ts
  it('chooseStartingMana: the primary, equipped gear re-attuned with its lines, default chains; once', () => {
```

Replace:
```ts
    expect(res.profile.abilities).toEqual(defaultAbilities('storm'));
```
with:
```ts
    expect(res.profile.chains).toEqual(defaultChains(registry, 'storm', 'sword'));
```

Replace:
```ts
    expect(bindSecondary(res.profile, 'nature').ok).toBe(false);
  });

  it('realign: charges Mana Dust and scrap, keeps the gear, fixes the builds; refuses what it must', () => {
    const { realignDust, realignScrap } = bal.pair;
    const rich = bound(realignDust, realignScrap);
    const stormy: DelveProfile = {
      ...rich,
      abilities: {
        ...rich.abilities,
        primary: { ...rich.abilities.primary, elements: ['fire', 'storm'] },
```
with:
```ts
    // The basic chain's last blow takes the secondary, as the pair's default chain has it.
    expect(res.profile.chains.basic.map((b) => b.element)).toEqual(['fire', 'fire', 'storm']);
    expect(bindSecondary(res.profile, 'nature').ok).toBe(false);
  });

  it('realign: charges Mana Dust and scrap, keeps the gear, fixes the chains; refuses what it must', () => {
    const { realignDust, realignScrap } = bal.pair;
    const rich = bound(realignDust, realignScrap);
    const primary = rich.chains.primary;
    const stormy: DelveProfile = {
      ...rich,
      chains: {
        ...rich.chains,
        primary: {
          ...primary,
          moves: primary.moves.map((m) => ({ ...m, elements: ['fire', 'storm'] })),
        },
```

Replace:
```ts
    expect(res.profile.abilities.primary.elements).toEqual(['fire']);
    expect(res.fixed).toEqual([
      { slot: 'primary', removed: ['storm'], build: res.profile.abilities.primary },
    ]);
    // A swap: charged the same; the builds (all fire) stay in the pair.
```
with:
```ts
    const moves = res.profile.chains.primary.moves;
    expect(moves.map((m) => m.elements)).toEqual(moves.map(() => ['fire']));
    expect(res.fixed).toEqual(
      moves.map((move, index) => ({ skill: 'primary', index, removed: ['storm'], move })),
    );
    // A swap: charged the same; the chains (all fire) stay in the pair.
```

Replace:
```ts
  it('setAbility refuses elements outside the pair (anything goes before the choice)', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const plague: AbilityBuild = {
      form: 'bolt',
      elements: ['fire', 'nature'],
      weight: 0,
      payment: 'mana',
    };
    expect(() => setAbility(registry, p, 'primary', plague)).toThrow(/two elements/);
    const withNature = bindSecondary(p, 'nature').profile;
    expect(setAbility(registry, withNature, 'primary', plague).abilities.primary.elements).toEqual([
      'fire',
      'nature',
    ]);
    expect(
      setAbility(registry, createDelveProfile(registry, 3), 'primary', plague).abilities.primary
        .elements,
    ).toEqual(['fire', 'nature']);
```
with:
```ts
  it('setChain refuses elements outside the pair (anything goes before the choice)', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const plague: Chain = {
      moves: [{ kind: 'medium', form: 'bolt', elements: ['fire', 'nature'] }],
      payment: 'mana',
    };
    expect(() => setChain(registry, p, 'primary', plague)).toThrow(/two elements/);
    expect(() => setChain(registry, p, 'basic', [{ kind: 'light', element: 'nature' }])).toThrow(
      /two elements/,
    );
    const withNature = bindSecondary(p, 'nature').profile;
    expect(setChain(registry, withNature, 'primary', plague).chains.primary).toEqual(plague);
    expect(
      setChain(registry, createDelveProfile(registry, 3), 'primary', plague).chains.primary,
    ).toEqual(plague);
```

Replace:
```ts
  /** Storm gear worse than the starter sword (no damage line): junk, salvaged between dives. */
```
with:
```ts
  /** The Primary chain's element sets, one entry per distinct set. */
  const primaryElements = (p: DelveProfile) => [
    ...new Set(p.chains.primary.moves.map((m) => m.elements.join('+'))),
  ];

  /** Storm gear worse than the starter sword (no damage line): junk, salvaged between dives. */
```

Replace:
```ts
    expect(after.abilities.primary.elements).toEqual(['fire', 'storm']);
```
with:
```ts
    expect(primaryElements(after)).toEqual(['fire+storm']);
```

Replace:
```ts
    expect(after.abilities.primary.elements).toEqual(['fire', 'earth']);
```
with:
```ts
    expect(primaryElements(after)).toEqual(['fire+earth']);
```

Replace:
```ts
    expect([...profile.abilities.primary.elements].sort()).toEqual(['earth', 'storm']);
```
with:
```ts
    expect(primaryElements(profile).map((e) => e.split('+').sort().join('+'))).toEqual([
      'earth+storm',
    ]);
```

Replace:
```ts
    expect(after.abilities.primary.elements).toEqual(['storm', 'fire']);
```
with:
```ts
    expect(primaryElements(after)).toEqual(['storm+fire']);
```

In `packages/engine/tests/delve-dive.test.ts`:

Replace:
```ts
  it('starts with a fire sword and an earth cuirass, and Fire abilities', () => {
    const p = createDelveProfile(registry, 123);
    expect(p.version).toBe(4);
    expect(p.equipped.weapon?.mana).toBe('fire');
    expect(p.equipped.chest?.mana).toBe('earth');
    expect(p.abilities.primary.elements).toEqual(['fire']);
```
with:
```ts
  it('starts with a fire sword and an earth cuirass, and Fire chains', () => {
    const p = createDelveProfile(registry, 123);
    expect(p.version).toBe(5);
    expect(p.equipped.weapon?.mana).toBe('fire');
    expect(p.equipped.chest?.mana).toBe('earth');
    expect(p.chains.primary.moves.every((m) => m.elements.join() === 'fire')).toBe(true);
```

In `packages/engine/tests/delve-reactions.test.ts`:

Before:
```ts
  bal,
```
add:
```ts
  asV4,
```

Replace:
```ts
    const { pair: _pair, manaDust: _dust, ...rest } = fresh;
    const v3 = { ...rest, version: 3, reactionsSeen: ['melt', 'blight'] };
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(v3)))?.profile).toMatchObject({
      version: 4,
```
with:
```ts
    const { pair: _pair, manaDust: _dust, ...rest } = asV4(fresh);
    const v3 = { ...rest, version: 3, reactionsSeen: ['melt', 'blight'] };
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(v3)))?.profile).toMatchObject({
      version: 5,
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts tests/delve-profile-abilities.test.ts tests/delve-pair.test.ts tests/delve-dive.test.ts tests/delve-reactions.test.ts)`
Expected: 22 FAIL, 151 pass: delve-chains 3 (the two v4 → v5 migrations: Cannot read properties of undefined (reading 'primary') / (reading 'basic'); "refuses a chain past MAX_CHAIN …"), delve-profile-abilities 5 (e.g. "a new profile starts with its weapon element's default chains …": expected 4 to be 5; "setChain takes a valid chain …": (0 , setChain) is not a function), delve-pair 12 (e.g. "a new profile is version 5 …": expected { version: 4, … } to match object { version: 5, … }; "fixChainsToPair …": (0 , fixChainsToPair) is not a function), delve-dive 1 and delve-reactions 1 (Cannot read properties of undefined (reading 'primary')).

---

## Chunk 11: Engine: save v5 and the chain ops (Task 6 continued: the save, the ops, the autopilot)

- [ ] **Step 3: The profile type and the schemas**

In `packages/engine/src/types/delve.ts`:

Replace:
```ts
import type { AbilityBuilds, AbilitySlot, ChainSkill, MoveKind } from './ability.js';
```
with:
```ts
import type { AbilitySlot, Chains, ChainSkill, MoveKind } from './ability.js';
```

Replace:
```ts
  version: 4;
```
with:
```ts
  version: 5;
```

Replace:
```ts
  /** The Primary, Defensive and Ultimate builds. */
  abilities: AbilityBuilds;
```
with:
```ts
  /** The basic attack's and each ability slot's chain of moves (see the moves and chains spec). */
  chains: Chains;
  /** Most moves each skill's chain may hold (at most `MAX_CHAIN`; the balance's to start). */
  chainCaps: Record<ChainSkill, number>;
```

In `packages/engine/src/delve/profile-schema.ts` (CRLF: hand-edit), the shared form, element and payment schemas, the chain schemas, then the frozen v4 schema and v5:

Replace:
```ts
  ReactionIdSchema,
} from '../data/schemas.js';

/** Zod schema for persisted Delve saves — rejects corrupt or foreign data. */

export const AbilityBuildSchema = z.object({
  form: z.enum([
    'bolt',
    'volley',
    'lance',
    'burst',
    'strike',
    'ward',
    'armor',
    'surge',
    'blink',
    'nova',
    'barrage',
    'maelstrom',
  ]),
  elements: z
    .array(ManaTypeSchema)
    .min(1)
    .max(2)
    .refine((e) => new Set(e).size === e.length, 'elements must differ'),
  weight: z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]),
  payment: z.enum(['mana', 'charge', 'cast']),
});
```
with:
```ts
  MoveKindSchema,
  ReactionIdSchema,
} from '../data/schemas.js';
import { MAX_CHAIN, type AbilitySlot, type FormId } from '../types/ability.js';

/** Zod schema for persisted Delve saves — rejects corrupt or foreign data. */

/** Each ability slot's forms (`arpg.json`'s, which a test holds this to). */
export const SLOT_FORMS: Record<AbilitySlot, readonly FormId[]> = {
  primary: ['bolt', 'volley', 'lance', 'burst', 'strike'],
  defensive: ['ward', 'armor', 'surge', 'blink'],
  ultimate: ['nova', 'barrage', 'maelstrom'],
};

const FormIdSchema = z.enum([
  'bolt',
  'volley',
  'lance',
  'burst',
  'strike',
  'ward',
  'armor',
  'surge',
  'blink',
  'nova',
  'barrage',
  'maelstrom',
]);

/** One element, or two different ones (a fusion). */
const ElementsSchema = z
  .array(ManaTypeSchema)
  .min(1)
  .max(2)
  .refine((e) => new Set(e).size === e.length, 'elements must differ');

const PaymentSchema = z.enum(['mana', 'charge', 'cast']);

/** A version 3 or 4 save's ability (see `chainFromBuild`). */
export const AbilityBuildSchema = z.object({
  form: FormIdSchema,
  elements: ElementsSchema,
  weight: z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]),
  payment: PaymentSchema,
});

export const MoveSchema = z.object({
  kind: MoveKindSchema,
  form: FormIdSchema,
  elements: ElementsSchema,
});

export const BlowSchema = z.object({ kind: MoveKindSchema, element: ManaTypeSchema });

/** An ability chain: 1 to `MAX_CHAIN` moves and a payment (see `slotChain` for the forms). */
export const ChainSchema = z.object({
  moves: z.array(MoveSchema).min(1).max(MAX_CHAIN),
  payment: PaymentSchema,
});

/** A chain whose every move is one of `slot`'s forms. */
function slotChain(slot: AbilitySlot) {
  return ChainSchema.refine(
    (c) => c.moves.every((m) => SLOT_FORMS[slot].includes(m.form)),
    `every move must be a ${slot} form`,
  );
}

const CapSchema = z.number().int().min(1).max(MAX_CHAIN);
```

Replace:
```ts
export const DelveProfileSchema = DelveProfileV3Schema.extend({
```
with:
```ts
/** Version 4 (the pair, before chains), kept frozen so older saves migrate through it. */
export const DelveProfileV4Schema = DelveProfileV3Schema.extend({
```

Replace:
```ts
});

/** Version 2 saves had a spell bar instead of ability builds; they migrate through version 3. */
```
with:
```ts
});

/** Version 5: each skill a chain of moves (see the moves and chains spec). */
export const DelveProfileSchema = DelveProfileV4Schema.omit({ abilities: true }).extend({
  version: z.literal(5),
  chains: z.object({
    basic: z.array(BlowSchema).min(1).max(MAX_CHAIN),
    primary: slotChain('primary'),
    defensive: slotChain('defensive'),
    ultimate: slotChain('ultimate'),
  }),
  chainCaps: z.object({
    basic: CapSchema,
    primary: CapSchema,
    defensive: CapSchema,
    ultimate: CapSchema,
  }),
});

/** Version 2 saves had a spell bar instead of ability builds; they migrate through version 3. */
```

- [ ] **Step 4: The profile ops and the migration**

In `packages/engine/src/delve/profile.ts`, a new profile holds chains and caps, `setChain` replaces `setAbility`, and `parseDelveProfile` migrates through version 4 (`fromV3`):

Replace:
```ts
} from './profile-schema.js';
import { chooseStartingMana, fixBuildsToPair, inPair, salvageDust, type BuildFix } from './pair.js';
import { defaultAbilities } from '../arpg/abilities/resolve.js';
import {
  ABILITY_PAYMENTS,
  ABILITY_SLOTS,
  ABILITY_WEIGHTS,
  type AbilityBuild,
  type AbilityBuilds,
  type AbilitySlot,
  type Chain,
  type Chains,
```
with:
```ts
  DelveProfileV4Schema,
} from './profile-schema.js';
import { chooseStartingMana, fixChainsToPair, inPair, salvageDust, type ChainFix } from './pair.js';
import { defaultBasic, defaultChains } from '../arpg/abilities/resolve.js';
import {
  ABILITY_PAYMENTS,
  ABILITY_SLOTS,
  MOVE_KINDS,
  type AbilityBuild,
  type AbilityBuilds,
  type AbilitySlot,
  type Blow,
  type Chain,
  type Chains,
  type ChainSkill,
```

Replace:
```ts
  /** Build slots the op changed to fit the pair (Realign). */
  fixed?: BuildFix[];
```
with:
```ts
  /** The chains' moves the op changed to fit the pair (Realign), one notice each. */
  fixed?: ChainFix[];
```

Replace:
```ts
    version: 4,
    seed: seed | 0,
```
with:
```ts
    version: 5,
    seed: seed | 0,
```

Replace:
```ts
    abilities: defaultAbilities(weapon.mana),
```
with:
```ts
    chains: defaultChains(registry, weapon.mana, weapon.baseId),
    chainCaps: { ...registry.getDelveBalance().chains.cap },
```

Replace:
```ts
 * Set one ability build. Throws on a form from another slot, anything but
 * one or two distinct elements, or (once there is a pair) an element outside it,
 * or an unknown weight or payment.
 */
export function setAbility(
  registry: DataRegistry,
  profile: DelveProfile,
  slot: AbilitySlot,
  build: AbilityBuild,
): DelveProfile {
  const phase = profile.dive?.phase;
  if (phase === 'fighting' || phase === 'choosing') {
    throw new Error('Abilities can only change between dives');
  }
  const form = registry.getForm(build.form);
  if (form.slot !== slot) throw new Error(`${form.name} is not a ${slot} form`);
  const els = build.elements;
  if (els.length < 1 || els.length > 2 || new Set(els).size !== els.length)
    throw new Error('Pick one or two different elements');
  if (!els.every((e) => e in registry.getArpgData().mana)) throw new Error('Unknown element');
  if (!els.every((e) => inPair(profile, e))) throw new Error('Pick from your two elements');
  if (!ABILITY_WEIGHTS.includes(build.weight)) throw new Error(`Bad weight ${build.weight}`);
  if (!ABILITY_PAYMENTS.includes(build.payment)) throw new Error(`Bad payment ${build.payment}`);
  return {
    ...profile,
    abilities: { ...profile.abilities, [slot]: { ...build, elements: [...els] } },
  };
```
with:
```ts
 * Set one skill's chain. Throws mid-dive, and on fewer than one move or more
 * than the skill's cap, an unknown kind, a form from another slot, anything
 * but one or two different elements (a blow: one), an element outside the
 * pair (once there is one), or an unknown payment.
 */
export function setChain<S extends ChainSkill>(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: S,
  chain: Chains[S],
): DelveProfile {
  const phase = profile.dive?.phase;
  if (phase === 'fighting' || phase === 'choosing') {
    throw new Error('Chains can only change between dives');
  }
  const blows = skill === 'basic' ? (chain as Blow[]) : null;
  const moves = blows ?? (chain as Chain).moves;
  const cap = profile.chainCaps[skill];
  if (moves.length < 1 || moves.length > cap) throw new Error(`A chain holds 1 to ${cap} moves`);
  const elements = (els: ManaType[]) => {
    if (els.length < 1 || els.length > 2 || new Set(els).size !== els.length)
      throw new Error('Pick one or two different elements');
    if (!els.every((e) => e in registry.getArpgData().mana)) throw new Error('Unknown element');
    if (!els.every((e) => inPair(profile, e))) throw new Error('Pick from your two elements');
  };
  for (const m of moves) if (!MOVE_KINDS.includes(m.kind)) throw new Error(`Bad kind ${m.kind}`);
  if (blows) {
    for (const b of blows) elements([b.element]);
    return { ...profile, chains: { ...profile.chains, basic: blows.map((b) => ({ ...b })) } };
  }
  const { payment } = chain as Chain;
  for (const m of (chain as Chain).moves) {
    const form = registry.getForm(m.form);
    if (form.slot !== skill) throw new Error(`${form.name} is not a ${skill} form`);
    elements(m.elements);
  }
  if (!ABILITY_PAYMENTS.includes(payment)) throw new Error(`Bad payment ${payment}`);
  const copy = (chain as Chain).moves.map((m) => ({ ...m, elements: [...m.elements] }));
  return { ...profile, chains: { ...profile.chains, [skill]: { moves: copy, payment } } };
```

Replace:
```ts
/** A save read back: the profile, and the build slots a migration changed (for a notice). */
export interface ParsedDelveProfile {
  profile: DelveProfile;
  fixed: BuildFix[];
```
with:
```ts
/** A save read back: the profile, and the moves a migration changed (for a notice each). */
export interface ParsedDelveProfile {
  profile: DelveProfile;
  fixed: ChainFix[];
```

Replace:
```ts
 * Validate an unknown JSON blob as a save, migrating older ones (2 → 3 → 4:
 * a primary from the gear, no secondary, no Mana Dust, builds fixed to the
 * pair; a dive in progress stays). Returns null when it doesn't fit.
```
with:
```ts
 * Validate an unknown JSON blob as a save, migrating older ones (2 → 3 → 4 → 5).
 * To 4: a primary from the gear, no secondary, no Mana Dust. To 5: each
 * build its form's default chain shifted by its weight (`chainFromBuild`),
 * the weapon's default basic chain on the pair, the balance's caps, and every
 * move fixed to the pair. A dive in progress stays. Null when it doesn't fit.
```

Replace:
```ts
  const v3 = DelveProfileV3Schema.safeParse(raw);
  const old = v3.success ? v3.data : fromV2(raw);
  if (!old) return null;
  const equipped = old.equipped as EquippedGear;
  const primary = migratedPrimary(registry, equipped);
  // A version 2 save had no builds: it starts from its new primary's defaults (nothing to fix).
  const abilities =
    'abilities' in old
      ? old.abilities
      : defaultAbilities(primary ?? equipped.weapon?.mana ?? 'fire');
  return fixBuildsToPair({
    ...old,
    version: 4,
    abilities,
    pair: { primary, secondary: null },
    manaDust: 0,
  } as DelveProfile);
```
with:
```ts
  const v4 = DelveProfileV4Schema.safeParse(raw);
  const old = v4.success ? v4.data : fromV3(registry, raw);
  if (!old) return null;
  const { abilities, ...rest } = old;
  const { primary, secondary } = old.pair;
  const weapon = (old.equipped as EquippedGear).weapon;
  const element = primary ?? weapon?.mana ?? 'fire';
  // A version 2 save had no builds: it starts from its new primary's defaults.
  const chains: Chains = abilities
    ? {
        basic: defaultBasic(registry, weapon?.baseId ?? null, element, secondary),
        ...buildChains(registry, abilities),
      }
    : defaultChains(registry, element, weapon?.baseId ?? null);
  return fixChainsToPair({
    ...rest,
    version: 5,
    chains,
    chainCaps: { ...registry.getDelveBalance().chains.cap },
  } as DelveProfile);
}

/** A version 3 or 2 save as version 4 (see `parseDelveProfile`); version 2 has no builds. */
function fromV3(registry: DataRegistry, raw: unknown) {
  const v3 = DelveProfileV3Schema.safeParse(raw);
  const old = v3.success ? v3.data : fromV2(raw);
  if (!old) return null;
  const primary = migratedPrimary(registry, old.equipped as EquippedGear);
  return {
    ...old,
    version: 4 as const,
    abilities: 'abilities' in old ? old.abilities : undefined,
    pair: { primary, secondary: null },
    manaDust: 0,
  };
```

Replace:
```ts
    buildChains(registry, profile.abilities),
```
with:
```ts
    profile.chains,
```

In `packages/engine/src/delve/pair.ts`, `ChainFix`, the stats with the basic chain, `fixChainsToPair`, and the ops on chains:

Replace:
```ts
import { defaultAbilities } from '../arpg/abilities/resolve.js';
import { ABILITY_SLOTS, type AbilityBuild, type AbilitySlot } from '../types/ability.js';
```
with:
```ts
import { defaultChains } from '../arpg/abilities/resolve.js';
import { ABILITY_SLOTS, type Blow, type ChainSkill, type Move } from '../types/ability.js';
```

Replace:
```ts
/** A build slot the pair changed: the elements it dropped and the build it has now. */
export interface BuildFix {
  slot: AbilitySlot;
  removed: ManaType[];
  build: AbilityBuild;
```
with:
```ts
/** A chain's move (or blow) the pair changed: where it is, the elements it dropped, and what it is now. */
export interface ChainFix {
  skill: ChainSkill;
  index: number;
  removed: ManaType[];
  move: Move | Blow;
```

Replace:
```ts
/** The hero's real stats: its gear, with the pair's basics and the two-element limit. */
export function profileStats(
  registry: DataRegistry,
  profile: Pick<DelveProfile, 'equipped' | 'pair'>,
): HeroStats {
  return computeHeroStats(profile.equipped, registry, pairExtra(profile.pair));
```
with:
```ts
/** The hero's real stats: its gear, with its basic chain, the pair's power and the two-element limit. */
export function profileStats(
  registry: DataRegistry,
  profile: Pick<DelveProfile, 'equipped' | 'pair' | 'chains'>,
): HeroStats {
  return computeHeroStats(
    profile.equipped,
    registry,
    pairExtra(profile.pair, profile.chains.basic),
  );
```

Replace:
```ts
 * Keep each build's in-pair elements; a build left with none takes the
 * primary. Form, weight and payment stay. Returns the slots it changed.
 */
export function fixBuildsToPair(profile: DelveProfile): {
  profile: DelveProfile;
  fixed: BuildFix[];
} {
  const primary = profile.pair.primary;
  if (!primary) return { profile, fixed: [] };
  const abilities = { ...profile.abilities };
  const fixed: BuildFix[] = [];
  for (const slot of ABILITY_SLOTS) {
    const old = abilities[slot];
    const kept = old.elements.filter((e) => inPair(profile, e));
    if (kept.length === old.elements.length) continue;
    const build = { ...old, elements: kept.length > 0 ? kept : [primary] };
    abilities[slot] = build;
    fixed.push({ slot, removed: old.elements.filter((e) => !kept.includes(e)), build });
  }
  return { profile: fixed.length > 0 ? { ...profile, abilities } : profile, fixed };
```
with:
```ts
 * Keep each move's in-pair elements; a move left with none takes the primary,
 * and so does a blow outside the pair. Kinds, forms and payments stay.
 * Returns the moves it changed, one notice each.
 */
export function fixChainsToPair(profile: DelveProfile): {
  profile: DelveProfile;
  fixed: ChainFix[];
} {
  const primary = profile.pair.primary;
  if (!primary) return { profile, fixed: [] };
  const fixed: ChainFix[] = [];
  const basic = profile.chains.basic.map((blow, index) => {
    if (inPair(profile, blow.element)) return blow;
    const move = { ...blow, element: primary };
    fixed.push({ skill: 'basic', index, removed: [blow.element], move });
    return move;
  });
  const chains = { ...profile.chains, basic };
  for (const slot of ABILITY_SLOTS) {
    const moves = chains[slot].moves.map((old, index) => {
      const kept = old.elements.filter((e) => inPair(profile, e));
      if (kept.length === old.elements.length) return old;
      const move = { ...old, elements: kept.length > 0 ? kept : [primary] };
      fixed.push({
        skill: slot,
        index,
        removed: old.elements.filter((e) => !kept.includes(e)),
        move,
      });
      return move;
    });
    chains[slot] = { ...chains[slot], moves };
  }
  return { profile: fixed.length > 0 ? { ...profile, chains } : profile, fixed };
```

Replace:
```ts
 * re-attuned to it for free (the bag is left alone), and the builds start
 * over from `defaultAbilities(mana)`. Allowed mid-dive (a migrated save may be).
 */
export function chooseStartingMana(
  _registry: DataRegistry,
```
with:
```ts
 * re-attuned to it for free (the bag is left alone), and the chains start
 * over from `defaultChains` in it. Allowed mid-dive (a migrated save may be).
 */
export function chooseStartingMana(
  registry: DataRegistry,
```

Replace:
```ts
      abilities: defaultAbilities(mana),
```
with:
```ts
      chains: defaultChains(registry, mana, equipped.weapon?.baseId ?? null),
```

Replace:
```ts
/** Bind a second element: free, once, between dives. */
```
with:
```ts
/**
 * Bind a second element: free, once, between dives. The basic chain's last
 * blow takes it, as the weapon's default chain on the pair has it.
 */
```

Replace:
```ts
  return { ok: true, profile: { ...profile, pair: { primary, secondary: mana } } };
```
with:
```ts
  const basic = profile.chains.basic.map((b, i, all) =>
    i === all.length - 1 ? { ...b, element: mana } : b,
  );
  return {
    ok: true,
    profile: {
      ...profile,
      pair: { primary, secondary: mana },
      chains: { ...profile.chains, basic },
    },
  };
```

Replace:
```ts
 * between dives. Gear stays as it is; the builds follow the new pair.
```
with:
```ts
 * between dives. Gear stays as it is; the chains follow the new pair.
```

Replace:
```ts
  const res = fixBuildsToPair({
```
with:
```ts
  const res = fixChainsToPair({
```

Replace:
```ts
  profile: Pick<DelveProfile, 'equipped' | 'pair'>,
```
with:
```ts
  profile: Pick<DelveProfile, 'equipped' | 'pair' | 'chains'>,
```

Replace:
```ts
 * secondary. Builds stay valid: the pair is the same two.
```
with:
```ts
 * secondary. Chains stay valid: the pair is the same two.
```

In `packages/engine/src/delve/hero-stats.ts`, `pairExtra` carries the basic chain, and item comparisons take the hero's chains:

Replace:
```ts
/** The extra that applies a profile's pair: its basics and the two-element limit (none: no pair). */
export function pairExtra(pair?: ManaPair): HeroStatsExtra {
  return pair ? { pair, filterAttunement: true } : {};
```
with:
```ts
/** The extra that applies a profile's pair (its power and the two-element limit) and its basic chain. */
export function pairExtra(pair?: ManaPair, basic?: Blow[]): HeroStatsExtra {
  return { ...(pair ? { pair, filterAttunement: true } : {}), basic };
```

Replace:
```ts
  chains?: Pick<Chains, AbilitySlot>,
  /** The hero's pair (its basics and the two-element limit); none counts every element. */
  pair?: ManaPair,
): ItemComparison {
```
with:
```ts
  /** The hero's chains (none: the weapon's defaults). */
  chains?: Chains,
  /** The hero's pair (its basics and the two-element limit); none counts every element. */
  pair?: ManaPair,
): ItemComparison {
```

Replace:
```ts
  const beforeStats = computeHeroStats(equipped, registry, pairExtra(pair));
  const afterStats = computeHeroStats(next, registry, pairExtra(pair));
```
with:
```ts
  const beforeStats = computeHeroStats(equipped, registry, pairExtra(pair, chains?.basic));
  const afterStats = computeHeroStats(next, registry, pairExtra(pair, chains?.basic));
```

Replace:
```ts
  chains?: Pick<Chains, AbilitySlot>,
  /** The hero's pair (its basics and the two-element limit); none counts every element. */
  pair?: ManaPair,
): number {
  const stats = computeHeroStats(equipped, registry, pairExtra(pair));
```
with:
```ts
  /** The hero's chains (none: the weapon's defaults). */
  chains?: Chains,
  /** The hero's pair (its basics and the two-element limit); none counts every element. */
  pair?: ManaPair,
): number {
  const stats = computeHeroStats(equipped, registry, pairExtra(pair, chains?.basic));
```

In `packages/engine/src/delve/dive.ts` (CRLF: hand-edit), the floor takes the profile's chains:

Replace:
```ts
import { addLootToBag, buildChains } from './profile.js';
```
with:
```ts
import { addLootToBag } from './profile.js';
```

Replace:
```ts
    chains: buildChains(registry, profile.abilities),
```
with:
```ts
    chains: profile.chains,
```

- [ ] **Step 5: The autopilot and the exports**

In `packages/engine/src/delve/autopilot.ts` (CRLF: hand-edit):

Replace:
```ts
import { bindSecondary, fixBuildsToPair, profileStats, resolveOvertake } from './pair.js';
import {
  buildChains,
```
with:
```ts
import { bindSecondary, fixChainsToPair, profileStats, resolveOvertake } from './pair.js';
import {
```

Replace:
```ts
  setAbility,
```
with:
```ts
  setChain,
```

Replace:
```ts
        refreshWorldHero(
          registry,
          world,
          profileStats(registry, p),
          buildChains(registry, p.abilities),
        );
```
with:
```ts
        refreshWorldHero(registry, world, profileStats(registry, p), p.chains);
```

Replace:
```ts
 * order), none while that's all 0: every pair reacts. Then build the Primary
 * from both elements, so it keeps finding their reaction.
```
with:
```ts
 * order), none while that's all 0: every pair reacts. Then build every move of
 * the Primary chain from both elements, so it keeps finding their reaction.
```

Replace:
```ts
  return setAbility(registry, p, 'primary', { ...p.abilities.primary, elements });
```
with:
```ts
  const chain = p.chains.primary;
  return setChain(registry, p, 'primary', {
    ...chain,
    moves: chain.moves.map((m) => ({ ...m, elements })),
  });
```

Replace:
```ts
 * builds keep to the pair (a no-op for the bot's own builds; it matters for a
```
with:
```ts
 * chains keep to the pair (a no-op for the bot's own chains; it matters for a
```

Replace:
```ts
  const settled = fixBuildsToPair(resolveOvertake(registry, profile).profile).profile;
```
with:
```ts
  const settled = fixChainsToPair(resolveOvertake(registry, profile).profile).profile;
```

In `packages/engine/src/index.ts`:

Replace:
```ts
  setAbility,
  chainFromBuild,
  buildChains,
```
with:
```ts
  setChain,
  chainFromBuild,
```

Replace:
```ts
  fixBuildsToPair,
```
with:
```ts
  fixChainsToPair,
```

Replace:
```ts
export type { BuildFix } from './delve/pair.js';
export { GearItemSchema, AbilityBuildSchema } from './delve/profile-schema.js';
```
with:
```ts
export type { ChainFix } from './delve/pair.js';
export {
  GearItemSchema,
  MoveSchema,
  BlowSchema,
  ChainSchema,
  SLOT_FORMS,
} from './delve/profile-schema.js';
```

- [ ] **Step 6: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (173).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1243 tests pass (the pacing rails play chains from the save now).

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/delve.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/pair.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/index.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-profile-abilities.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/types/delve.ts packages/engine/src/delve/profile-schema.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/pair.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/delve/dive.ts packages/engine/src/delve/autopilot.ts packages/engine/src/index.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-profile-abilities.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): save v5 holds chains; setChain, fixChainsToPair and the v4 migration" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 12: Engine: the DPS Lab on chains

### Task 7: The DPS Lab plays chains

A setup carries `chains: Chains` in place of `abilities`, and `dpsCombos` enumerates: each weapon's default basic chain on the pair (252, as today); each non-Defensive form × the 36 ordered element sets × the four kinds × the three payments as a one-move chain (3,456); and each form's default chain (`kind: 'default'`, what a held button plays, the rows the gate compares) × 36 × 3 (864). The dims are `{ form, first, second, kind, payment }`. Ability setups carry a plain sword, the pair `{ first, second }` and the sword's default basics on it (the last blow the second, as today's setups discharged it at the finisher), with that slot's chain replaced. `simulateDps` presses the held ability each tick except while a wind-up runs; a hold move is held to full charge (`holding` for `holdTime`), then released. `defaultAbilities` and `ABILITY_WEIGHTS` go: nothing reads builds but the frozen saves now.

**Files:**
- Modify: `packages/engine/src/arpg/dps-sim.ts:6-12,29-33,75-180`
- Modify: `packages/engine/src/arpg/abilities/resolve.ts:4,245-253` (CRLF, hand-edit), `packages/engine/src/types/ability.ts:32-33` (CRLF, hand-edit), `packages/engine/src/index.ts:219`
- Test: `packages/engine/tests/delve-dps-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-dps-sim.test.ts`, the grid's counts and keys, a mana-paid heavy Nova (dearer than the pool) in place of the Crushing one, and two new tests: the held button flows through a form's default chain, and a hold move is held to full charge:

Replace:
```ts
import { defaultAbilities } from '../src/arpg/abilities/resolve.js';
```
with:
```ts
import { defaultBasic, defaultChains } from '../src/arpg/abilities/resolve.js';
```

Replace:
```ts
import { arena, dummy, gear, registry, run } from './fixtures/arena.js';
```
with:
```ts
import { arena, bal, dummy, gear, registry, run } from './fixtures/arena.js';
```

Replace:
```ts
  it('252 basic combos and 4,320 ability combos, each with its own key', () => {
    expect(grid.filter((s) => s.view === 'basic')).toHaveLength(252);
    const abilities = grid.filter((s) => s.view === 'ability');
    expect(abilities).toHaveLength(4320);
```
with:
```ts
  it('252 basic combos, 3,456 one-move chains and 864 default chains, each with its own key', () => {
    expect(grid.filter((s) => s.view === 'basic')).toHaveLength(252);
    const abilities = grid.filter((s) => s.view === 'ability');
    expect(abilities.filter((s) => s.dims.kind !== 'default')).toHaveLength(3456);
    expect(abilities.filter((s) => s.dims.kind === 'default')).toHaveLength(864);
```

Replace:
```ts
    expect(setup('basic|bow|storm|none')).toEqual({
      view: 'basic',
      dims: { weapon: 'bow', primary: 'storm', secondary: 'none' },
      weapon: { baseId: 'bow', primary: 'storm', secondary: null },
      abilities: defaultAbilities('storm'),
      hold: 'attack',
    });
    // Ordered pairs: Frost+Fire is its own build, on a sword with that pair.
    expect(setup('ability|nova|frost|fire|2|charge')).toEqual({
      view: 'ability',
      dims: { form: 'nova', first: 'frost', second: 'fire', weight: '2', payment: 'charge' },
      weapon: { baseId: 'sword', primary: 'frost', secondary: 'fire' },
      abilities: {
        ...defaultAbilities('frost'),
        ultimate: { form: 'nova', elements: ['frost', 'fire'], weight: 2, payment: 'charge' },
      },
      hold: { slot: 2 },
    });
```
with:
```ts
    expect(setup('basic|bow|storm|fire')).toEqual({
      view: 'basic',
      dims: { weapon: 'bow', primary: 'storm', secondary: 'fire' },
      weapon: { baseId: 'bow', primary: 'storm', secondary: 'fire' },
      chains: {
        ...defaultChains(registry, 'storm', 'bow'),
        basic: defaultBasic(registry, 'bow', 'storm', 'fire'),
      },
      hold: 'attack',
    });
    // Ordered pairs: Frost+Fire is its own build, on a sword with that pair and its basics.
    const frostFire = {
      ...defaultChains(registry, 'frost', 'sword'),
      basic: defaultBasic(registry, 'sword', 'frost', 'fire'),
    };
    expect(setup('ability|nova|frost|fire|hold|charge')).toEqual({
      view: 'ability',
      dims: { form: 'nova', first: 'frost', second: 'fire', kind: 'hold', payment: 'charge' },
      weapon: { baseId: 'sword', primary: 'frost', secondary: 'fire' },
      chains: {
        ...frostFire,
        ultimate: {
          moves: [{ kind: 'hold', form: 'nova', elements: ['frost', 'fire'] }],
          payment: 'charge',
        },
      },
      hold: { slot: 2 },
    });
    // A form's default chain: what a held button plays.
    expect(setup('ability|strike|frost|fire|default|mana').chains.primary).toEqual({
      moves: ['medium', 'medium', 'medium', 'heavy'].map((kind) => ({
        kind,
        form: 'strike',
        elements: ['frost', 'fire'],
      })),
      payment: 'mana',
    });
```

Replace:
```ts
    const s = setup('ability|barrage|storm|nature|1|cast');
```
with:
```ts
    const s = setup('ability|barrage|storm|nature|heavy|cast');
```

Replace:
```ts
    const r = simulateDps(registry, setup('ability|bolt|earth|none|0|mana'), ONE);
```
with:
```ts
    const r = simulateDps(registry, setup('ability|bolt|earth|none|medium|mana'), ONE);
```

Replace:
```ts
  it('counts only the held ability: a mana-paid Crushing Nova never casts while basics swing', () => {
    const { out, events } = recorded(() =>
      simulateDps(registry, setup('ability|nova|fire|none|2|mana'), ONE),
```
with:
```ts
  it('counts only the held ability: a mana-paid heavy Nova, dearer than the pool, never casts while basics swing', () => {
    const { out, events } = recorded(() =>
      simulateDps(registry, setup('ability|nova|fire|none|heavy|mana'), ONE),
```

Replace:
```ts
      simulateDps(registry, setup('ability|bolt|fire|storm|0|mana'), PACK),
```
with:
```ts
      simulateDps(registry, setup('ability|bolt|fire|storm|medium|mana'), PACK),
```

Replace:
```ts
    expect(gain('ability|nova|frost|none|0|mana')).toBeGreaterThan(
      gain('ability|bolt|frost|none|0|mana'),
    );
  });
```
with:
```ts
    expect(gain('ability|nova|frost|none|medium|mana')).toBeGreaterThan(
      gain('ability|bolt|frost|none|medium|mana'),
    );
  });

  it("the held button flows through a form's default chain, each move in turn", () => {
    const { out, events } = recorded(() =>
      simulateDps(registry, setup('ability|bolt|fire|none|default|mana'), ONE),
    );
    const casts = events.filter((e) => e.kind === 'cast' && e.slot === 0);
    expect(out.casts).toBe(casts.length);
    // Light, light, medium, heavy: the last lands 0.2 heftier.
    const heft = bal.feel.heft;
    expect(casts.slice(0, 4).map((e) => e.kind === 'cast' && e.heft)).toEqual([
      heft[1],
      heft[1],
      heft[2],
      Math.min(1, heft[3] + 0.2),
    ]);
  });

  it('holds a hold move to full charge each press', () => {
    const { out, events } = recorded(() =>
      simulateDps(registry, setup('ability|bolt|fire|none|hold|mana'), ONE),
    );
    expect(out.casts).toBeGreaterThan(0);
    expect(out.casts).toBeLessThanOrEqual(DPS_SECONDS / bal.chains.holdTime);
    const kinds = events.filter(
      (e) => e.kind === 'holdStage' || (e.kind === 'cast' && e.slot === 0),
    );
    // Each cast comes after its hold reached stage 2.
    kinds.forEach((e, i) => {
      if (e.kind === 'cast') expect(kinds[i - 1]).toMatchObject({ kind: 'holdStage', stage: 2 });
    });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-dps-sim.test.ts)`
Expected: 9 FAIL, 7 pass: "252 basic combos, 3,456 one-move chains and 864 default chains …" (expected [ … ] to have a length of 3456 but got 4320), "a setup carries its whole loadout …" (expected { view: 'basic', … } to deeply equal …), and seven that look a setup up by its new key (Error: No combo ability|barrage|storm|nature|heavy|cast, … ability|bolt|fire|none|default|mana, … ability|bolt|fire|none|hold|mana).

- [ ] **Step 3: The grid and the sim on chains**

In `packages/engine/src/arpg/dps-sim.ts`:

Replace:
```ts
  ABILITY_WEIGHTS,
  type AbilityBuilds,
} from '../types/ability.js';
import type { ArpgEvent, ArpgInput } from '../types/arpg.js';
import { MANA_TYPES, type ManaType } from '../types/mana.js';
import { defaultAbilities } from './abilities/resolve.js';
import { buildChains } from '../delve/profile.js';
```
with:
```ts
  MOVE_KINDS,
  type Chains,
  type MoveKind,
} from '../types/ability.js';
import type { ArpgEvent, ArpgInput } from '../types/arpg.js';
import { MANA_TYPES, type ManaType } from '../types/mana.js';
import { holdCharge, nextMove } from './abilities/cast.js';
import { defaultBasic, defaultChains } from './abilities/resolve.js';
```

Replace:
```ts
   * { form, first, second, weight, payment }. Values are short ids; a missing element is 'none'.
   */
  dims: Record<string, string>;
  weapon: { baseId: string; primary: ManaType; secondary: ManaType | null };
  abilities: AbilityBuilds;
```
with:
```ts
   * { form, first, second, kind, payment } (a kind, or 'default' for the form's default
   * chain). Values are short ids; a missing element is 'none'.
   */
  dims: Record<string, string>;
  weapon: { baseId: string; primary: ManaType; secondary: ManaType | null };
  /** The hero's chains: the basic chain (for the stats) and each ability slot's. */
  chains: Chains;
```

Replace:
```ts
    stats: computeHeroStats({ weapon }, registry, { pair: { primary, secondary } }),
    chains: buildChains(registry, setup.abilities),
```
with:
```ts
    stats: computeHeroStats({ weapon }, registry, {
      pair: { primary, secondary },
      basic: setup.chains.basic,
    }),
    chains: setup.chains,
```

Replace:
```ts
  // A refused press (no mana) is dropped and pressed again next tick; one on cooldown waits.
  const input: ArpgInput =
    slot === null
      ? { move: { x: 0, y: 0 }, attack: true, attackAim: aim }
      : { move: { x: 0, y: 0 }, cast: { slot, aim } };
  const acted = (e: ArpgEvent) =>
    slot === null ? e.kind === 'basic' : e.kind === 'cast' && e.slot === slot;

  const step = registry.getDelveBalance().arena.step;
```
with:
```ts
  const bal = registry.getDelveBalance();
  const move = { x: 0, y: 0 };
  // The held button, each tick: the attack; or the ability pressed, a refused press (no mana)
  // dropped and pressed again, one on cooldown waiting. Nothing is pressed while a wind-up runs
  // (the press would only wait for it), and a hold move is held to full charge, then let go.
  const input = (): ArpgInput => {
    if (slot === null) return { move, attack: true, attackAim: aim };
    if (h.windup) return { move };
    if (h.hold) {
      const full = holdCharge(bal, h.hold.start, world.t).charge >= 1;
      return { move, holding: slot, cast: full ? { slot, aim } : null };
    }
    if (nextMove(h, slot, world.t, bal.abilities.comboWindow).kind === 'hold')
      return { move, holding: slot };
    return { move, cast: { slot, aim } };
  };
  const acted = (e: ArpgEvent) =>
    slot === null ? e.kind === 'basic' : e.kind === 'cast' && e.slot === slot;

  const step = bal.arena.step;
```

Replace:
```ts
      for (const e of stepWorld(registry, world, input, step)) {
```
with:
```ts
      for (const e of stepWorld(registry, world, input(), step)) {
```

Replace:
```ts
 * another element) on the basic attack, and each Primary or Ultimate form ×
 * element set × weight × payment on its ability. Ability setups carry a plain
 * sword and the pair `{ first, second }`, as the game limits abilities to the pair.
 * The only function here that knows the build model.
```
with:
```ts
 * another element) on the basic attack (the weapon's default chain on the
 * pair), and each Primary or Ultimate form × element set × kind × payment as a
 * one-move chain, plus the form's default chain (`kind: 'default'`, what a held
 * button plays) × element set × payment. Ability setups carry a plain sword,
 * the pair `{ first, second }` (as the game limits abilities to the pair) and
 * its default basics. The only function here that knows the chain model.
```

Replace:
```ts
          abilities: defaultAbilities(primary),
```
with:
```ts
          chains: {
            ...defaultChains(registry, primary, base.id),
            basic: defaultBasic(registry, base.id, primary, secondary),
          },
```

Replace:
```ts
      for (const weight of ABILITY_WEIGHTS)
        for (const payment of ABILITY_PAYMENTS) {
          const [first, second = null] = elements;
          out.push({
            view: 'ability',
            dims: {
              form: form.id,
              first,
              second: second ?? 'none',
              weight: String(weight),
              payment,
            },
            weapon: { baseId: 'sword', primary: first, secondary: second },
            abilities: {
              ...defaultAbilities(first),
              [form.slot]: { form: form.id, elements, weight, payment },
```
with:
```ts
      for (const kind of [...MOVE_KINDS, 'default' as const])
        for (const payment of ABILITY_PAYMENTS) {
          const [first, second = null] = elements;
          const kinds: MoveKind[] = kind === 'default' ? form.defaultChain : [kind];
          out.push({
            view: 'ability',
            dims: { form: form.id, first, second: second ?? 'none', kind, payment },
            weapon: { baseId: 'sword', primary: first, secondary: second },
            chains: {
              ...defaultChains(registry, first, 'sword'),
              basic: defaultBasic(registry, 'sword', first, second),
              [form.slot]: {
                moves: kinds.map((k) => ({ kind: k, form: form.id, elements })),
                payment,
              },
```

- [ ] **Step 4: The build helpers go**

In `packages/engine/src/arpg/abilities/resolve.ts` (CRLF: hand-edit):

Replace:
```ts
  type AbilityBuilds,
  type AbilityPayment,
```
with:
```ts
  type AbilityPayment,
```

Replace:
```ts
}

/** Builds for a new (or migrated) profile, all of `element` (until the save holds chains). */
export function defaultAbilities(element: ManaType): AbilityBuilds {
  return {
    primary: { form: 'bolt', elements: [element], weight: 0, payment: 'mana' },
    defensive: { form: 'ward', elements: [element], weight: 0, payment: 'mana' },
    ultimate: { form: 'nova', elements: [element], weight: 0, payment: 'charge' },
  };
}
```
with:
```ts
}
```

In `packages/engine/src/types/ability.ts` (CRLF: hand-edit):

Replace:
```ts
export type AbilityWeight = -2 | -1 | 0 | 1 | 2;

export const ABILITY_WEIGHTS: readonly AbilityWeight[] = [-2, -1, 0, 1, 2] as const;
```
with:
```ts
export type AbilityWeight = -2 | -1 | 0 | 1 | 2;
```

In `packages/engine/src/index.ts`:

Replace:
```ts
  defaultAbilities,
  defaultBasic,
```
with:
```ts
  defaultBasic,
```

- [ ] **Step 5: Run them to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-dps-sim.test.ts)`
Expected: PASS (16).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1245 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/arpg/dps-sim.ts packages/engine/src/index.ts packages/engine/tests/delve-dps-sim.test.ts
git add packages/engine/src/arpg/dps-sim.ts packages/engine/src/arpg/abilities/resolve.ts packages/engine/src/types/ability.ts packages/engine/src/index.ts packages/engine/tests/delve-dps-sim.test.ts
git commit -m "feat(engine): the DPS Lab runs one-move chains by kind and each form's default chain" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 13: Engine: the gate, and the engine build

### Task 8: The gate's values, determinism, and the gate

The values the gate chose (see "Gate decision" at the top): `stepBonus` 0.15, Bolt's default chain light, medium, medium, heavy, Strike's medium, medium, heavy, heavy. Then a determinism test for chains and holds, and the gate measured on the built engine. **Stop rule:** if a test, a pacing rail or a gate number below differs from what this task says, stop and report the difference; don't retune.

**Files:**
- Modify: `packages/engine/src/data/balance.json:175` (`stepBonus`; hand-edit), `packages/engine/src/data/arpg.json:15,39` (Bolt's and Strike's `defaultChain`; hand-edit)
- Test: `packages/engine/tests/delve-chains.test.ts`, `packages/engine/tests/delve-dps-sim.test.ts`, `packages/engine/tests/ability-forms.test.ts` (a title)

- [ ] **Step 1: The tests at the gate's values**

In `packages/engine/tests/delve-chains.test.ts`, the step bonus, the default chains as tuned (the old multipliers stay in a comment), a new Frost hero's Bolt chain, and the v4 → v5 migration of a Balanced Bolt and Strike:

Replace:
```ts
      stepBonus: 0.1,
```
with:
```ts
      stepBonus: 0.15,
```

Replace:
```ts
  it("each form's default chain follows its old press-combo: ≤ 0.9 light, ≤ 1.2 medium, else heavy", () => {
    const old: Record<string, number[]> = {
      bolt: [0.8, 0.8, 1, 1.5],
      volley: [1, 1, 1],
      lance: [1, 1, 1.4],
      burst: [1, 1, 1.5],
      strike: [1, 1, 1.2, 1.8],
    };
    const kind = (m: number): MoveKind => (m <= 0.9 ? 'light' : m <= 1.2 ? 'medium' : 'heavy');
    for (const form of registry.getArpgData().forms)
      expect(form.defaultChain, form.id).toEqual((old[form.id] ?? [1]).map(kind));
```
with:
```ts
  it("each form's default chain: its old press-combo's (≤ 0.9 light, ≤ 1.2 medium, else heavy), as tuned", () => {
    // From the old multipliers: Bolt [0.8, 0.8, 1, 1.5] L L M H, Volley [1, 1, 1] M M M, Lance
    // [1, 1, 1.4] M M H, Burst [1, 1, 1.5] M M H, Strike [1, 1, 1.2, 1.8] M M M H. The DPS Lab
    // gate made Bolt's second move and Strike's third a step heavier (see the plan's gate decision).
    const L = 'light';
    const M = 'medium';
    const H = 'heavy';
    const want: Record<string, MoveKind[]> = {
      bolt: [L, M, M, H],
      volley: [M, M, M],
      lance: [M, M, H],
      burst: [M, M, H],
      strike: [M, M, H, H],
    };
    for (const form of registry.getArpgData().forms)
      expect(form.defaultChain, form.id).toEqual(want[form.id] ?? [M]);
```

Replace:
```ts
      'light',
      'medium',
```
with:
```ts
      'medium',
      'medium',
```

Replace:
```ts
        ['light', 'light', 'medium', 'heavy'],
```
with:
```ts
        ['light', 'medium', 'medium', 'heavy'],
```

Replace:
```ts
        ['medium', 'medium', 'medium', 'heavy'],
```
with:
```ts
        ['medium', 'medium', 'heavy', 'heavy'],
```

In `packages/engine/tests/delve-dps-sim.test.ts`, the Strike's default chain and the Bolt's hefts along its chain:

Replace:
```ts
      moves: ['medium', 'medium', 'medium', 'heavy'].map((kind) => ({
```
with:
```ts
      moves: ['medium', 'medium', 'heavy', 'heavy'].map((kind) => ({
```

Replace:
```ts
    // Light, light, medium, heavy: the last lands 0.2 heftier.
    const heft = bal.feel.heft;
    expect(casts.slice(0, 4).map((e) => e.kind === 'cast' && e.heft)).toEqual([
      heft[1],
      heft[1],
```
with:
```ts
    // Light, medium, medium, heavy: the last lands 0.2 heftier.
    const heft = bal.feel.heft;
    expect(casts.slice(0, 4).map((e) => e.kind === 'cast' && e.heft)).toEqual([
      heft[1],
      heft[2],
```

In `packages/engine/tests/ability-forms.test.ts`, only the title (the test reads Bolt's `defaultChain`):

Replace:
```ts
  it("Bolt's default chain goes light, light, medium, heavy, each bigger by its step, then wraps", () => {
```
with:
```ts
  it("Bolt's default chain goes light to heavy, each move bigger by its step, then wraps", () => {
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts tests/delve-dps-sim.test.ts tests/ability-forms.test.ts)`
Expected: 6 FAIL, 67 pass: "loads the chain numbers" (the step bonus), "each form's default chain … as tuned" (bolt: expected [ 'light', 'light', 'medium', 'heavy' ] to deeply equal [ Array(4) ]), "gives a new hero each form's default chain …", "v4 → v5 gives each build its form's default chain …" (bolt 0: …), dps-sim's "a setup carries its whole loadout …" and "the held button flows through a form's default chain …" (expected [ 0.3, 0.3, 0.45, 0.8999999999999999 ] to deeply equal [ 0.3, 0.45, 0.45, 0.8999999999999999 ]).

- [ ] **Step 3: The values**

In `packages/engine/src/data/balance.json` (hand-edit):

Replace:
```json
      "stepBonus": 0.1
```
with:
```json
      "stepBonus": 0.15
```

In `packages/engine/src/data/arpg.json` (hand-edit):

Replace:
```json
      "defaultChain": ["light", "light", "medium", "heavy"],
```
with:
```json
      "defaultChain": ["light", "medium", "medium", "heavy"],
```

Replace:
```json
      "defaultChain": ["medium", "medium", "medium", "heavy"],
```
with:
```json
      "defaultChain": ["medium", "medium", "heavy", "heavy"],
```

- [ ] **Step 4: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (73).

- [ ] **Step 5: Determinism, chains and holds included**

This one pins what is already true (the sim is deterministic), so it passes at once:

In `packages/engine/tests/delve-chains.test.ts`, in the holds block, after "pauses the slot's combo window while it charges":

Replace:
```ts
  it('the bot charges a hold to full, then lets go', () => {
```
with:
```ts
  it('is deterministic: the same inputs give the same events twice, chains and holds included', () => {
    const play = () => {
      const w = arena([dummy(13, 30), dummy(15, 30)], {
        primary: { moves: [m('light'), m('hold'), m('heavy')] },
        defensive: { moves: [m('medium', 'ward'), m('medium', 'blink')] },
      });
      const events: ArpgEvent[] = [];
      for (let i = 0; i < Math.round(6 / STEP); i++)
        events.push(...stepWorld(registry, w, botInput(registry, w), STEP));
      return events;
    };
    const events = play();
    expect(events.some((e) => e.kind === 'holdStage')).toBe(true);
    expect(play()).toEqual(events);
  });

  it('the bot charges a hold to full, then lets go', () => {
```

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1246 tests pass (the pacing rails at the gate's values).

- [ ] **Step 6: Build the engine and measure the gate**

Run: `(cd packages/engine && pnpm build)`
Expected: the build succeeds.

Each of the next three runs takes about five minutes.

Run: `(B=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/chains-before; node $B/gate.mjs packages/engine/dist/index.js after)`
Expected, exactly (the DPS Lab grid, one seed, against `before-depth10.json`):

```
1. basics: 504 rows, worst +0.0% (10|false|basic|dagger|fire|none); over 1%: 0
2. default chain, mana: 576 rows, median +0.0% [-21.7%, +129.1%]; worst 10|false|ability|lance|storm|nature|default|mana -21.7%; under −15%: 1
   bolt      median +28.6% [-14.5%, +98.1%]  worst false|bolt|storm|nature|default|mana -14.5%  under: 0
   volley    median -0.1% [-10.8%, +129.1%]  worst true|volley|earth|fire|default|mana -10.8%  under: 0
   lance     median +4.3% [-21.7%, +82.2%]  worst false|lance|storm|nature|default|mana -21.7%  under: 1
   burst     median +3.6% [-2.5%, +51.5%]  worst false|burst|earth|storm|default|mana -2.5%  under: 0
   strike    median +1.3% [-5.8%, +43.4%]  worst true|strike|shadow|earth|default|mana -5.8%  under: 0
   nova      median +0.0% [+0.0%, +0.0%]  worst false|nova|fire|none|default|mana +0.0%  under: 0
   barrage   median +0.0% [+0.0%, +0.0%]  worst false|barrage|fire|none|default|mana +0.0%  under: 0
   maelstrom median +0.0% [+0.0%, +0.0%]  worst false|maelstrom|fire|none|default|mana +0.0%  under: 0
   UNDER 10|false|ability|lance|storm|nature|default|mana -21.7% (88.7 vs 113.25)
2. default chain, cast: 576 rows, median +27.4% [+0.0%, +145.9%]; worst 10|false|ability|nova|fire|none|default|cast +0.0%; under −15%: 0
2. default chain, charge: 576 rows, median +0.0% [-56.9%, +158.6%]; worst 10|true|ability|bolt|frost|fire|default|charge -56.9%; under −15%: 10
3. light (vs -1), mana: median -11.5% [-69.7%, +17.6%]
3. light (vs -1), cast: median -11.4% [-55.4%, +18.8%]
3. light (vs -1), charge: median +0.0% [+0.0%, +510.0%]
3. medium (vs 0), mana: median -11.4% [-50.2%, +26.2%]
3. medium (vs 0), cast: median -11.4% [-43.7%, +34.5%]
3. medium (vs 0), charge: median +0.0% [+0.0%, +194.8%]
3. heavy (vs 1), mana: median +0.0% [-74.1%, +113.6%]
3. heavy (vs 1), cast: median +0.0% [-64.5%, +47.5%]
3. heavy (vs 1), charge: median +0.0% [-11.4%, +1242.9%]
4. hold (vs +2), mana: median -38.2% [-90.9%, +44.1%]
   bolt single element, one dummy: median -29.5% [-31.9%, -29.2%]
4. hold (vs +2), cast: median -10.2% [-90.2%, +890.5%]
   bolt single element, one dummy: median -31.0% [-31.3%, -30.9%]
   nova single element, one dummy: median +100.2% [+8.3%, +128.1%]
4. hold (vs +2), charge: median -2.3% [-76.4%, +458.8%]
   bolt single element, one dummy: median +9.4% [+7.2%, +16.9%]
   nova single element, one dummy: median +0.0% [+0.0%, +0.0%]
```

The basics line is the hard gate (the default chains are today's strings: within 1%). The one-seed row under −15% (the Storm+Nature Lance on one dummy) is judged on 40 seeds, next:

Run: `(B=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/chains-before; node $B/seeds.mjs packages/engine/dist/index.js --grid "\|default\|mana$" $B/after-mana40.json && node $B/floor.mjs $B/after-mana40.json)`
Expected, exactly (the floor, the hard gate: no row under −15%):

```
rows 576
rows 576, under −15%: 0
worst: true|volley|earth|fire -10.8%; true|volley|shadow|earth -8.8%; true|volley|earth|shadow -8.8%
```

Run: `(node /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/chains-before/pacing.mjs packages/engine/dist/index.js)`
Expected, exactly (the rails' numbers, which `tests/delve-pacing.test.ts` already passed on):

```
first dive: 11, 11, 5, 4 (each ≥ 3), mean 7.75 (4–12)
dive 6 mean 27.25, dive 12 mean 38.5 (> dive 1 + 5, > dive 6)
frost: dive 1 10.5, dive 12 34.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 5 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 29, 20–38 (allowed 17.4–46.4): fire+frost 21, earth+frost 21, storm+fire 30, frost+storm 30, fire+shadow 29, fire+nature 28, shadow+nature 30, fire+earth 38, storm+earth 36, earth+shadow 20, earth+nature 22, frost+shadow 35, frost+nature 26, storm+shadow 36, storm+nature 29
seconds per floor: 25.46 (8–60)
```

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-dps-sim.test.ts packages/engine/tests/ability-forms.test.ts
git add packages/engine/src/data/balance.json packages/engine/src/data/arpg.json packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-dps-sim.test.ts packages/engine/tests/ability-forms.test.ts
git commit -m "feat(engine): the DPS Lab gate's values: stepBonus 0.15, Bolt light-medium-medium-heavy, Strike medium-medium-heavy-heavy" -m "On 40-seed means every mana default chain holds its floor (worst -10.8%, the Earth+Fire Volley in the pack); basics are unchanged (worst +0.0%); the pacing rails hold (first dives 11, 11, 5, 4). Chains and holds are deterministic." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Restart the dev server**

The client reads the rebuilt engine; restart Vite so it doesn't serve the stale bundle. Run the PowerShell block under "Dev server on 5288" in the header; expect `True`.

From here until Task 12 the client is red, as the header says: `(cd packages/client && npx vitest run)` now fails 20 tests in 8 files (`AbilitiesPanel`, `ManaPanel`, `TrainingPanel`, `arena-hud-snapshot`, `DelveCamp`, `DelveLab`, `delveStore`, `sandboxStore`), and the client typecheck fails in 20 files.

#### The gate's scripts

They live in `<before>` (see the header); write any that is missing from these texts (`snapshot.mjs` reads the engine at `C:\Projects\Alloy\packages\engine\dist`, built from HEAD, and writes `before-depth10.json` beside itself; the others take the engine's bundle as their first argument).

`snapshot.mjs`:

```js
// The DPS Lab grid at depth 10 (one dummy and the pack) from the built engine at HEAD, before
// moves and chains: the "before" half of the gate (before-depth10.json).
import { writeFileSync } from 'node:fs';
import * as E from 'file:///C:/Projects/Alloy/packages/engine/dist/index.js';
const reg = E.createDefaultRegistry();
const combos = E.dpsCombos(reg);
const out = {};
const t0 = performance.now();
for (const pack of [false, true]) {
  for (const s of combos) {
    const r = E.simulateDps(reg, s, { depth: 10, pack });
    out[`10|${pack}|${E.dpsKey(s)}`] = { dps: +r.dps.toFixed(2), casts: r.casts, view: s.view, dims: s.dims };
  }
}
writeFileSync(new URL('./before-depth10.json', import.meta.url), JSON.stringify(out));
const rows = Object.entries(out);
console.log('runs', rows.length, 'ms', Math.round(performance.now() - t0));
const top = (view, pack, n = 5) => rows.filter(([k, v]) => v.view === view && k.startsWith(`10|${pack}|`)).sort((a, b) => b[1].dps - a[1].dps).slice(0, n).map(([k, v]) => `${k.slice(k.indexOf('|', 3) + 1)} ${v.dps}`).join('\n  ');
console.log('basics 1:\n  ' + top('basic', false)); console.log('basics pack:\n  ' + top('basic', true));
console.log('abilities 1:\n  ' + top('ability', false)); console.log('abilities pack:\n  ' + top('ability', true));
```

`seeds.mjs` (it plays a setup as `simulateDps` does, over 40 world seeds; before chains its setups carry `abilities`, after them `chains`):

```js
// 40-seed mean DPS of chosen DPS Lab rows (simulateDps's loop with the world's rng reseeded), on
// the pre-chains engine (setups with `abilities`) or the chains one (setups with `chains`).
// Usage: node seeds.mjs <engine dist/index.js> <key> [key…]   (keys as `10|<pack>|<dpsKey>`)
//        node seeds.mjs <engine dist/index.js> --grid <regex> <out.json>
import { pathToFileURL } from 'node:url';

const E = await import(pathToFileURL(process.argv[2]).href);
const reg = E.createDefaultRegistry();
const bal = reg.getDelveBalance();
const SEEDS = 40;
const hyp = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const combos = new Map(E.dpsCombos(reg).map((s) => [E.dpsKey(s), s]));

function sim(setup, pack, seed) {
  const { baseId, primary, secondary } = setup.weapon;
  const weapon = E.sandboxWeapon(reg, { baseId, mana: primary, rarity: 'common', ilvl: 10 });
  const chains = !!setup.chains;
  const world = E.createSandboxWorld(reg, {
    depth: 10,
    stats: E.computeHeroStats({ weapon }, reg, {
      pair: { primary, secondary },
      ...(chains ? { basic: setup.chains.basic } : {}),
    }),
    ...(chains ? { chains: setup.chains } : { abilities: setup.abilities }),
    toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
  });
  world.rng = new E.SeededRNG(seed);
  const h = world.hero;
  const start = { x: h.x, y: h.y };
  const dummies = E.spawnDummies(reg, world, { layout: pack ? 'clump' : 'single', element: null });
  const near = dummies.reduce((a, b) => (hyp(h, a) <= hyp(h, b) ? a : b));
  const slide = hyp(h, near) - h.radius - near.radius - 0.4;
  for (const m of dummies) {
    m.y += slide;
    m.dummy.homeY = m.y;
  }
  const aim = { x: near.x, y: near.y };
  const slot = setup.hold === 'attack' ? null : setup.hold.slot;
  const move = { x: 0, y: 0 };
  const input = () => {
    if (slot === null) return { move, attack: true, attackAim: aim };
    if (!chains) return { move, cast: { slot, aim } };
    if (h.windup) return { move };
    if (h.hold) {
      const full = E.holdCharge(bal, h.hold.start, world.t).charge >= 1;
      return { move, holding: slot, cast: full ? { slot, aim } : null };
    }
    if (E.nextMove(h, slot, world.t, bal.abilities.comboWindow).kind === 'hold')
      return { move, holding: slot };
    return { move, cast: { slot, aim } };
  };
  const step = bal.arena.step;
  let damage = 0;
  for (let i = 0; i < Math.round(E.DPS_SECONDS / step); i++) {
    for (const e of E.stepWorld(reg, world, input(), step))
      if (e.kind === 'hit' && (slot === null || e.slot === slot)) damage += e.amount;
    h.x = start.x;
    h.y = start.y;
    for (const m of dummies) {
      m.x = m.dummy.homeX;
      m.y = m.dummy.homeY;
      m.kbx = 0;
      m.kby = 0;
    }
  }
  return damage / E.DPS_SECONDS;
}

import { writeFileSync } from 'node:fs';
// `--grid <regex> <out.json>`: every row (both packs) whose `10|pack|dpsKey` matches, to a file.
let keys = process.argv.slice(3);
let out = null;
if (keys[0] === '--grid') {
  const re = new RegExp(keys[1]);
  out = keys[2];
  keys = [false, true].flatMap((pack) => [...combos.keys()].map((k) => `10|${pack}|${k}`)).filter((k) => re.test(k));
}
const means = {};
for (const full of keys) {
  const [, pack, ...rest] = full.split('|');
  const s = combos.get(rest.join('|'));
  if (!s) { console.log(full, 'no such setup'); continue; }
  let sum = 0;
  for (let seed = 1; seed <= SEEDS; seed++) sum += sim(s, pack === 'true', seed);
  means[full] = +(sum / SEEDS).toFixed(2);
  if (!out) console.log(full, means[full]);
}
if (out) {
  writeFileSync(out, JSON.stringify(means));
  console.log('rows', Object.keys(means).length);
}
```

`gate.mjs`:

```js
// The moves and chains spec's DPS Lab check: the grid at depth 10 (one dummy and the pack) after
// the change, against the pre-chains grid (before-depth10.json, v0.45.0). Writes after-depth10.json.
// Usage: node gate.mjs <engine dist/index.js> [out-tag]
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const E = await import(pathToFileURL(process.argv[2]).href);
const tag = process.argv[3] ?? 'after';
const here = (f) => new URL(f, import.meta.url);
const before = JSON.parse(readFileSync(here('before-depth10.json'), 'utf8'));

const reg = E.createDefaultRegistry();
const after = {};
for (const pack of [false, true])
  for (const s of E.dpsCombos(reg)) {
    const r = E.simulateDps(reg, s, { depth: 10, pack });
    after[`10|${pack}|${E.dpsKey(s)}`] = { dps: +r.dps.toFixed(2), casts: r.casts, view: s.view, dims: s.dims };
  }
writeFileSync(here(`${tag}-depth10.json`), JSON.stringify(after));

const pct = (x) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`;
const ratio = (a, b) => (b > 0 ? a / b : a > 0 ? Infinity : 1);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const stats = (xs) => `median ${pct(med(xs) - 1)} [${pct(Math.min(...xs) - 1)}, ${pct(Math.max(...xs) - 1)}]`;
const keys = Object.keys(after);

// 1. Basics: every weapon and pair, one dummy and the pack, within ±1% (the default chain is the old string).
const basics = keys.filter((k) => after[k].view === 'basic');
const bdiff = basics.map((k) => [k, ratio(after[k].dps, before[k].dps) - 1]);
const bworst = bdiff.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
console.log(`1. basics: ${basics.length} rows, worst ${pct(bworst[1])} (${bworst[0]}); over 1%: ${bdiff.filter(([, d]) => Math.abs(d) > 0.01).length}`);

// 2. Default chains vs today's cycling weight-0 row, by payment.
const oldKey = (k, weight) => k.replace(/\|(light|medium|heavy|hold|default)\|(mana|charge|cast)$/, `|${weight}|$2`);
for (const payment of ['mana', 'cast', 'charge']) {
  const rows = keys.filter((k) => after[k].dims.kind === 'default' && after[k].dims.payment === payment);
  const rs = rows.map((k) => [k, ratio(after[k].dps, before[oldKey(k, 0)].dps)]);
  const worst = rs.reduce((a, b) => (b[1] < a[1] ? b : a));
  const under = rs.filter(([, r]) => r < 0.85);
  console.log(`2. default chain, ${payment}: ${rows.length} rows, ${stats(rs.map(([, r]) => r))}; worst ${worst[0]} ${pct(worst[1] - 1)}; under −15%: ${under.length}`);
  if (payment === 'mana') {
    for (const form of ['bolt', 'volley', 'lance', 'burst', 'strike', 'nova', 'barrage', 'maelstrom']) {
      const f = rs.filter(([k]) => after[k].dims.form === form);
      const w = f.reduce((a, b) => (b[1] < a[1] ? b : a));
      console.log(`   ${form.padEnd(9)} ${stats(f.map(([, r]) => r))}  worst ${w[0].replace('10|', '').replace('|ability', '')} ${pct(w[1] - 1)}  under: ${f.filter(([, r]) => r < 0.85).length}`);
    }
    for (const [k, r] of under.slice(0, 40)) console.log(`   UNDER ${k} ${pct(r - 1)} (${after[k].dps} vs ${before[oldKey(k, 0)].dps})`);
  }
}

// 3. One-move rows per kind vs today's equivalent weight (light −1, medium 0, heavy +1).
for (const [kind, weight] of [['light', -1], ['medium', 0], ['heavy', 1]]) {
  for (const payment of ['mana', 'cast', 'charge']) {
    const rows = keys.filter((k) => after[k].dims.kind === kind && after[k].dims.payment === payment);
    const rs = rows.map((k) => ratio(after[k].dps, before[oldKey(k, weight)].dps)).filter(Number.isFinite);
    console.log(`3. ${kind} (vs ${weight}), ${payment}: ${stats(rs)}`);
  }
}

// 4. Hold rows at full charge vs today's Crushing (+2) rows.
for (const payment of ['mana', 'cast', 'charge']) {
  const rows = keys.filter((k) => after[k].dims.kind === 'hold' && after[k].dims.payment === payment);
  const rs = rows.map((k) => ratio(after[k].dps, before[oldKey(k, 2)].dps)).filter(Number.isFinite);
  console.log(`4. hold (vs +2), ${payment}: ${stats(rs)}`);
  for (const form of ['bolt', 'nova']) {
    const f = rows.filter((k) => after[k].dims.form === form && after[k].dims.second === 'none' && k.startsWith('10|false|'));
    const fr = f.map((k) => ratio(after[k].dps, before[oldKey(k, 2)].dps)).filter(Number.isFinite);
    if (fr.length) console.log(`   ${form} single element, one dummy: ${stats(fr)}`);
  }
}
```

`floor.mjs`:

```js
// The DPS floor on 40-seed means: every mana default-chain row (576) against the same form,
// elements and pack's weight-0 row before chains (before-mana40.json), failing under −15%.
// Usage: node floor.mjs <after-mana40.json>
import { readFileSync } from 'node:fs';

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const before = read(new URL('before-mana40.json', import.meta.url));
const after = read(process.argv[2]);
const rows = Object.keys(after)
  .map((k) => [k, after[k] / before[k.replace('|default|', '|0|')] - 1])
  .sort((a, b) => a[1] - b[1]);
const pct = (x) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`;
const name = (k) => k.replace('10|', '').replace('|ability', '').replace('|default|mana', '');
console.log(`rows ${rows.length}, under −15%: ${rows.filter(([, d]) => d < -0.15).length}`);
console.log(`worst: ${rows.slice(0, 3).map(([k, d]) => `${name(k)} ${pct(d)}`).join('; ')}`);
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

---

## Chunk 14: Client: the stores and the chain texts

### Task 9: The stores hold chains; the chain texts

The save's store calls `setChain` (its `setAbility` goes) and words a migration's or a Realign's fixes per move ("Your Bolt's 3rd move used Frost, which isn't in your pair; it now uses Fire"; a blow: "Your basic attack's 2nd blow used …"); the bind hint shows only for a save that predates the pair (version 3 or older: `gainedPair`), since every version 4 save now migrates. The Training Grounds' store keeps `chains` (validated with the engine's `BlowSchema` and `ChainSchema`, each move a form of its slot, `.catch(defaults)`) and a `secondary` in place of `basicInfusion`; changing the primary or the secondary refits the basic chain (the old secondary's blows take the new one, the primary's with none, every other blow the primary), `loadMyBuild` copies the save's chains and pair, and `sandboxStats` passes the sandbox's basic chain. `chains/chain-text.ts` names moves for the builder and the HUD: `KIND_LABEL` (a hold reads "held"), `KIND_ICON` (▪, ▪▪, ▪▪▪, ◉), `moveText`, `blowText`, `chainText`. And the DPS Lab page's test uses the engine's new keys (its old ones have failed since Task 8's rebuild).

**Files:**
- Create: `packages/client/src/features/delve/chains/chain-text.ts`, `packages/client/src/features/delve/__tests__/chain-text.test.ts`
- Modify: `packages/client/src/stores/delveStore.ts:15-23,53-60,86-107,121,140-141,174,293-294`
- Modify: `packages/client/src/stores/sandboxStore.ts` (throughout)
- Test: `packages/client/src/stores/delveStore.test.ts`, `packages/client/src/stores/sandboxStore.test.ts`, `packages/client/src/pages/__tests__/DelveLab.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/features/delve/__tests__/chain-text.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeHeroStats, resolveChain } from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { KIND_ICON, blowText, chainText, moveText } from '../chains/chain-text';

const registry = getDelveRegistry();

describe('chain text', () => {
  it('names each move with its kind and its element or fusion', () => {
    const chain = resolveChain(registry, computeHeroStats({}, registry), 'primary', {
      moves: [
        { kind: 'light', form: 'bolt', elements: ['fire'] },
        { kind: 'medium', form: 'burst', elements: ['fire', 'nature'] },
        { kind: 'hold', form: 'lance', elements: ['frost'] },
      ],
      payment: 'mana',
    });
    expect(chainText(chain.moves.map(moveText))).toBe(
      'light Fire Bolt · medium Wildfire Burst · held Frost Lance',
    );
    expect(blowText(registry, { kind: 'heavy', element: 'storm' })).toBe('heavy Storm blow');
    expect(Object.values(KIND_ICON)).toEqual(['▪', '▪▪', '▪▪▪', '◉']);
  });
});
```

In `packages/client/src/stores/delveStore.test.ts`, chains in place of builds, the notices per move, and the bind hint only for saves before the pair:

Replace:
```ts
import { generateItem, SeededRNG, type BuildFix, type GearSlot } from '@alloy/engine';
```
with:
```ts
import { generateItem, SeededRNG, type ChainFix, type GearSlot } from '@alloy/engine';
```

Replace:
```ts
const registry = getDelveRegistry();
```
with:
```ts
const registry = getDelveRegistry();

/** The store's save as version 3 (builds, no pair): a Frost Ward and Fire's Bolt and Nova. */
function v3Save() {
  const {
    pair: _pair,
    manaDust: _dust,
    chains: _chains,
    chainCaps: _caps,
    ...rest
  } = useDelveStore.getState().profile;
  const build = (form: string, elements: string[], payment = 'mana') => ({
    form,
    elements,
    weight: 0,
    payment,
  });
  return {
    ...rest,
    version: 3,
    abilities: {
      primary: build('bolt', ['fire']),
      defensive: build('ward', ['frost']),
      ultimate: build('nova', ['fire'], 'charge'),
    },
  };
}
```

Replace:
```ts
  it('sets an ability build and persists it', () => {
    useDelveStore
      .getState()
      .setAbility('primary', { form: 'burst', elements: ['fire'], weight: 1, payment: 'cast' });
    expect(useDelveStore.getState().profile.abilities.primary).toMatchObject({
      form: 'burst',
      elements: ['fire'],
    });
    expect(loadDelveProfile()?.profile.abilities.primary.form).toBe('burst');
```
with:
```ts
  it('sets a chain and persists it', () => {
    const chain = {
      moves: [{ kind: 'heavy' as const, form: 'burst' as const, elements: ['fire' as const] }],
      payment: 'cast' as const,
    };
    useDelveStore.getState().setChain('primary', chain);
    expect(useDelveStore.getState().profile.chains.primary).toEqual(chain);
    expect(loadDelveProfile()?.profile.chains.primary).toEqual(chain);
    useDelveStore.getState().setChain('basic', [{ kind: 'hold', element: 'fire' }]);
    expect(loadDelveProfile()?.profile.chains.basic).toEqual([{ kind: 'hold', element: 'fire' }]);
```

Replace:
```ts
      useDelveStore
        .getState()
        .setAbility('primary', { form: 'nova', elements: ['fire'], weight: 0, payment: 'mana' }),
    ).toThrow(/primary/);
    expect(useDelveStore.getState().profile.abilities.primary.form).toBe('bolt');
```
with:
```ts
      useDelveStore.getState().setChain('primary', {
        moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }],
        payment: 'mana',
      }),
    ).toThrow(/primary/);
    expect(useDelveStore.getState().profile.chains.primary.moves[0].form).toBe('bolt');
```

Replace:
```ts
  it('reads an older save back migrated, with the builds it fixed', () => {
    const { pair: _pair, manaDust: _dust, ...rest } = useDelveStore.getState().profile;
    const frostWard = { ...rest.abilities.defensive, elements: ['frost'] };
    localStorage.setItem(
      DELVE_SAVE_KEY,
      JSON.stringify({
        ...rest,
        version: 3,
        abilities: { ...rest.abilities, defensive: frostWard },
      }),
    );
    const loaded = loadDelveProfile()!;
    expect(loaded.profile).toMatchObject({
      version: 4,
      pair: { primary: 'fire', secondary: null },
    });
    expect(loaded.fixed.map((f) => f.slot)).toEqual(['defensive']);
  });

  it('a new store migrates the save, writes it back and queues the fixed builds as notices', async () => {
    const { pair: _pair, manaDust: _dust, ...rest } = useDelveStore.getState().profile;
    const frostWard = { ...rest.abilities.defensive, elements: ['frost'] };
    localStorage.setItem(
      DELVE_SAVE_KEY,
      JSON.stringify({
        ...rest,
        version: 3,
        abilities: { ...rest.abilities, defensive: frostWard },
      }),
    );
```
with:
```ts
  it('reads an older save back migrated, with the moves it fixed', () => {
    localStorage.setItem(DELVE_SAVE_KEY, JSON.stringify(v3Save()));
    const loaded = loadDelveProfile()!;
    expect(loaded.profile).toMatchObject({
      version: 5,
      pair: { primary: 'fire', secondary: null },
    });
    expect(loaded.fixed.map((f) => [f.skill, f.index])).toEqual([['defensive', 0]]);
    expect(loaded.gainedPair).toBe(true);
  });

  it('a new store migrates the save, writes it back and queues the fixed moves as notices', async () => {
    localStorage.setItem(DELVE_SAVE_KEY, JSON.stringify(v3Save()));
```

Replace:
```ts
      "Your Ward used Frost, which isn't in your pair; it now uses Fire",
    ]);
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!).version).toBe(4);
  });

  it('a save that is already version 4 gets no bind hint', async () => {
```
with:
```ts
      "Your Ward's 1st move used Frost, which isn't in your pair; it now uses Fire",
    ]);
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!).version).toBe(5);
  });

  it('a save that already has its pair (version 4 or 5) gets no bind hint', async () => {
    const { chains: _chains, chainCaps: _caps, ...v4 } = useDelveStore.getState().profile;
    const bolt = { form: 'bolt', elements: ['fire'], weight: 0, payment: 'mana' };
    const abilities = {
      primary: bolt,
      defensive: { ...bolt, form: 'ward' },
      ultimate: { ...bolt, form: 'nova' },
    };
    localStorage.setItem(DELVE_SAVE_KEY, JSON.stringify({ ...v4, version: 4, abilities }));
    expect(loadDelveProfile()).toMatchObject({ gainedPair: false, profile: { version: 5 } });
```

Replace:
```ts
  it('realign charges and says which builds it changed; re-attune spends Mana Dust', () => {
```
with:
```ts
  it('realign charges and says which moves it changed; re-attune spends Mana Dust', () => {
```

Replace:
```ts
      abilities: {
        ...s.profile.abilities,
        ultimate: { form: 'maelstrom', elements: ['storm'], weight: 0, payment: 'charge' },
```
with:
```ts
      chains: {
        ...s.profile.chains,
        ultimate: {
          moves: [{ kind: 'medium', form: 'maelstrom', elements: ['storm'] }],
          payment: 'charge',
        },
```

Replace:
```ts
      "Your Maelstrom used Storm, which isn't in your pair; it now uses Fire",
```
with:
```ts
      "Your Maelstrom's 1st move used Storm, which isn't in your pair; it now uses Fire",
```

Replace:
```ts
  it('words the notices plainly', () => {
    const fix: BuildFix = {
      slot: 'ultimate',
      removed: ['frost', 'storm'],
      build: { form: 'maelstrom', elements: ['fire'], weight: 0, payment: 'charge' },
    };
    expect(fixNotice(registry, fix)).toBe(
      "Your Maelstrom used Frost and Storm, which aren't in your pair; it now uses Fire",
```
with:
```ts
  it('words the notices plainly, one a move', () => {
    const fix: ChainFix = {
      skill: 'primary',
      index: 2,
      removed: ['frost', 'storm'],
      move: { kind: 'medium', form: 'bolt', elements: ['fire'] },
    };
    expect(fixNotice(registry, fix)).toBe(
      "Your Bolt's 3rd move used Frost and Storm, which aren't in your pair; it now uses Fire",
    );
    const blow: ChainFix = {
      skill: 'basic',
      index: 1,
      removed: ['frost'],
      move: { kind: 'light', element: 'fire' },
    };
    expect(fixNotice(registry, blow)).toBe(
      "Your basic attack's 2nd blow used Frost, which isn't in your pair; it now uses Fire",
```

In `packages/client/src/stores/sandboxStore.test.ts`, the sandbox's chains and its pair for the blows:

Replace:
```ts
    expect(stats.weapon.element).toBe('fire');
```
with:
```ts
    expect(stats.weapon.blows.map((b) => b.element)).toEqual(['fire', 'fire', 'fire']);
```

Replace:
```ts
      abilities: { primary: { form: 'ward', elements: ['fire'], weight: 0, payment: 'mana' } },
```
with:
```ts
      chains: {
        primary: { moves: [{ kind: 'medium', form: 'ward', elements: ['fire'] }], payment: 'mana' },
      },
```

Replace:
```ts
    expect(s.abilities).toEqual(SANDBOX_DEFAULTS.abilities);
```
with:
```ts
    expect(s.chains).toEqual(SANDBOX_DEFAULTS.chains);
```

Replace:
```ts
  it('Load my build copies the real weapon, the other gear and the builds, and clears the extras', () => {
```
with:
```ts
  it('Load my build copies the real weapon, the other gear and the chains, and clears the extras', () => {
```

Replace:
```ts
    expect(s.abilities).toEqual(profile.abilities);
```
with:
```ts
    expect(s.chains).toEqual(profile.chains);
```

Replace:
```ts
  it('keeps a primary and a Basic infusion: a basics-only pair, saved, never the same element', () => {
    expect(store()).toMatchObject({ primary: 'fire', basicInfusion: null });
    store().setBasicInfusion('storm');
    expect(sandboxStats(registry, store()).weapon).toMatchObject({
      element: 'fire',
      infusion: 'storm',
    });
    store().setBasicInfusion('fire'); // the primary: ignored
    expect(store().basicInfusion).toBe('storm');
    store().setPrimary('frost');
    expect(parseSandbox(JSON.parse(localStorage.getItem(SANDBOX_KEY)!))).toMatchObject({
      primary: 'frost',
      basicInfusion: 'storm',
    });
    expect(sandboxStats(registry, store()).weapon).toMatchObject({
      element: 'frost',
      infusion: 'storm',
    });
    store().setPrimary('storm'); // the infusion's element: the infusion goes
    expect(store().basicInfusion).toBeNull();
    expect(parseSandbox({ primary: 'plasma', basicInfusion: 'plasma' })).toMatchObject({
      primary: 'fire',
      basicInfusion: null,
    });
    expect(parseSandbox({ primary: 'storm', basicInfusion: 'storm' }).basicInfusion).toBeNull();
  });

  it('the weapon keeps its own mana for attunement and leaves the infusion alone; unarmed punches with the primary', () => {
    store().setBasicInfusion('storm');
    store().setWeapon({ baseId: 'staff', mana: 'storm', rarity: 'rare' });
    expect(store().basicInfusion).toBe('storm');
    const stats = sandboxStats(registry, store());
    expect(stats.weapon).toMatchObject({ baseId: 'staff', element: 'fire', infusion: 'storm' });
    expect(stats.attunement.storm).toBeGreaterThan(0); // unrestricted: every element attunes
    store().setWeapon(null);
    expect(sandboxStats(registry, store()).weapon).toMatchObject({
      baseId: null,
      element: 'fire',
      infusion: 'storm',
    });
  });

  it('Load my build brings your pair in: primary and Basic infusion', () => {
    const profile = createDelveProfile(registry, 7, { primary: 'frost' });
    store().loadMyBuild({ ...profile, pair: { primary: 'frost', secondary: 'nature' } });
    expect(store()).toMatchObject({ primary: 'frost', basicInfusion: 'nature' });
```
with:
```ts
  it('keeps a pair for the basic blows, saved, never the same element; the blows follow it', () => {
    const elements = () => store().chains.basic.map((b) => b.element);
    expect(store()).toMatchObject({ primary: 'fire', secondary: null });
    store().setSecondary('storm');
    store().setChain('basic', [
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'storm' },
    ]);
    expect(sandboxStats(registry, store()).weapon.blows.map((b) => b.element)).toEqual([
      'fire',
      'storm',
    ]);
    store().setSecondary('fire'); // the primary: ignored
    expect(store().secondary).toBe('storm');
    store().setPrimary('frost'); // the primary's blows follow it
    expect(parseSandbox(JSON.parse(localStorage.getItem(SANDBOX_KEY)!))).toMatchObject({
      primary: 'frost',
      secondary: 'storm',
    });
    expect(elements()).toEqual(['frost', 'storm']);
    store().setSecondary('nature'); // and the secondary's
    expect(elements()).toEqual(['frost', 'nature']);
    store().setPrimary('nature'); // the secondary's element: the secondary goes, its blows too
    expect(store().secondary).toBeNull();
    expect(elements()).toEqual(['nature', 'nature']);
    expect(parseSandbox({ primary: 'plasma', secondary: 'plasma' })).toMatchObject({
      primary: 'fire',
      secondary: null,
    });
    expect(parseSandbox({ primary: 'storm', secondary: 'storm' }).secondary).toBeNull();
  });

  it('the weapon keeps its own mana for attunement; unarmed punches with the pair', () => {
    store().setWeapon({ baseId: 'staff', mana: 'storm', rarity: 'rare' });
    const stats = sandboxStats(registry, store());
    expect(stats.weapon.baseId).toBe('staff');
    expect(stats.weapon.blows.every((b) => b.element === 'fire')).toBe(true);
    expect(stats.attunement.storm).toBeGreaterThan(0); // unrestricted: every element attunes
    store().setWeapon(null);
    const bare = sandboxStats(registry, store()).weapon;
    expect(bare.baseId).toBeNull();
    expect(bare.blows.every((b) => b.element === 'fire')).toBe(true);
  });

  it('Load my build brings your pair in', () => {
    const profile = createDelveProfile(registry, 7, { primary: 'frost' });
    store().loadMyBuild({ ...profile, pair: { primary: 'frost', secondary: 'nature' } });
    expect(store()).toMatchObject({ primary: 'frost', secondary: 'nature' });
```

In `packages/client/src/pages/__tests__/DelveLab.test.tsx`, the ability keys name a kind now:

Replace:
```tsx
      result('ability|nova|fire|none|2|mana', 0, 0),
      result('ability|bolt|fire|none|0|mana', 40),
    ]);
    fireEvent.click(screen.getByTestId('lab-tab-ability'));
    expect(rowKeys()).toEqual(['ability|bolt|fire|none|0|mana', 'ability|nova|fire|none|2|mana']);
```
with:
```tsx
      result('ability|nova|fire|none|heavy|mana', 0, 0),
      result('ability|bolt|fire|none|medium|mana', 40),
    ]);
    fireEvent.click(screen.getByTestId('lab-tab-ability'));
    expect(rowKeys()).toEqual([
      'ability|bolt|fire|none|medium|mana',
      'ability|nova|fire|none|heavy|mana',
    ]);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts src/stores/sandboxStore.test.ts src/features/delve/__tests__/chain-text.test.ts src/pages/__tests__/DelveLab.test.tsx)`
Expected: FAIL. `delveStore.test.ts` 7 FAIL, 10 pass ("sets a chain and persists it": useDelveStore.getState(...).setChain is not a function; "reads an older save back migrated …": expected undefined to be true; the notice tests: Cannot read properties of undefined (reading 'form')); `sandboxStore.test.ts` fails to load ((0 , defaultAbilities) is not a function: the store builds its defaults from an export the engine dropped in Task 7); `chain-text.test.ts` fails to load (Failed to resolve import "../chains/chain-text"). `DelveLab.test.tsx` passes: the page reads whatever `dims` a setup has.

- [ ] **Step 3: The chain texts**

Create `packages/client/src/features/delve/chains/chain-text.ts`:

```ts
import type { DataRegistry, MoveKind } from '@alloy/engine';

/** How a move's kind reads in a name: "light Fire Bolt", "held Frost Lance". */
export const KIND_LABEL: Record<MoveKind, string> = {
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
  hold: 'held',
};

/** A move's kind at a glance (the builder's cards, the HUD's buttons). */
export const KIND_ICON: Record<MoveKind, string> = {
  light: '▪',
  medium: '▪▪',
  heavy: '▪▪▪',
  hold: '◉',
};

/** A resolved move's name with its kind: "light Fire Bolt", "medium Wildfire Burst". */
export function moveText(move: { kind: MoveKind; name: string }): string {
  return `${KIND_LABEL[move.kind]} ${move.name}`;
}

/** A basic blow's name: "heavy Storm blow". */
export function blowText(
  registry: DataRegistry,
  blow: { kind: MoveKind; element: string },
): string {
  const mana = registry.getArpgData().mana as Record<string, { name: string }>;
  return `${KIND_LABEL[blow.kind]} ${mana[blow.element].name} blow`;
}

/** A chain's names in order: "light Fire Bolt · medium Fire Bolt". */
export function chainText(names: readonly string[]): string {
  return names.join(' · ');
}
```

- [ ] **Step 4: The save's store**

In `packages/client/src/stores/delveStore.ts`:

Replace:
```ts
  setAbility as engineSetAbility,
```
with:
```ts
  setChain as engineSetChain,
```

Replace:
```ts
  type AbilityBuild,
  type AbilitySlot,
  type BuildFix,
```
with:
```ts
  type ChainFix,
  type Chains,
  type ChainSkill,
```

Replace:
```ts
/** The saved profile (migrated when older, with the builds it fixed), or null. */
export function loadDelveProfile(): (ParsedDelveProfile & { migrated: boolean }) | null {
```
with:
```ts
/**
 * The saved profile (migrated when older, with the moves it fixed), or null;
 * `gainedPair` when the save predates the pair (version 3 or older).
 */
export function loadDelveProfile(): (ParsedDelveProfile & { gainedPair: boolean }) | null {
```

Replace:
```ts
    return parsed && { ...parsed, migrated: data?.version !== parsed.profile.version };
```
with:
```ts
    return (
      parsed && { ...parsed, gainedPair: typeof data?.version === 'number' && data.version < 4 }
    );
```

Replace:
```ts
/** "Your Maelstrom used Frost, which isn't in your pair; it now uses Fire" */
export function fixNotice(registry: DataRegistry, fix: BuildFix): string {
  const form = registry.getForm(fix.build.form).name;
  const isnt = fix.removed.length > 1 ? "aren't" : "isn't";
  return `Your ${form} used ${manaNames(registry, fix.removed)}, which ${isnt} in your pair; it now uses ${manaNames(registry, fix.build.elements)}`;
```
with:
```ts
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

/**
 * "Your Bolt's 3rd move used Frost, which isn't in your pair; it now uses Fire";
 * a blow: "Your basic attack's 2nd blow used …".
 */
export function fixNotice(registry: DataRegistry, fix: ChainFix): string {
  const nth = ORDINALS[fix.index] ?? `${fix.index + 1}th`;
  const now = 'element' in fix.move ? [fix.move.element] : fix.move.elements;
  const what =
    'form' in fix.move
      ? `${registry.getForm(fix.move.form).name}'s ${nth} move`
      : `basic attack's ${nth} blow`;
  const isnt = fix.removed.length > 1 ? "aren't" : "isn't";
  return `Your ${what} used ${manaNames(registry, fix.removed)}, which ${isnt} in your pair; it now uses ${manaNames(registry, now)}`;
```

Replace:
```ts
  /** Toasts waiting for a Delve screen to show them (session only): overtakes, fixed builds. */
```
with:
```ts
  /** Toasts waiting for a Delve screen to show them (session only): overtakes, fixed moves. */
```

Replace:
```ts
  /** Change the bound pair; the builds it had to change become notices. */
```
with:
```ts
  /** Change the bound pair; the moves it had to change become notices. */
```

Replace:
```ts
  /** Set the Primary, Defensive or Ultimate build (throws on an invalid one). */
  setAbility: (slot: AbilitySlot, build: AbilityBuild) => void;
```
with:
```ts
  /** Set a skill's chain (throws on an invalid one). */
  setChain: <S extends ChainSkill>(skill: S, chain: Chains[S]) => void;
```

Replace:
```ts
          ...(loaded.migrated && loaded.profile.pair.primary && !loaded.profile.pair.secondary
```
with:
```ts
          ...(loaded.gainedPair && loaded.profile.pair.primary && !loaded.profile.pair.secondary
```

Replace:
```ts
    setAbility: (slot, build) => {
      commit(engineSetAbility(registry(), get().profile, slot, build));
```
with:
```ts
    setChain: (skill, chain) => {
      commit(engineSetChain(registry(), get().profile, skill, chain));
```

- [ ] **Step 5: The sandbox's store**

In `packages/client/src/stores/sandboxStore.ts`:

Replace:
```ts
  AbilityBuildSchema,
  GEAR_SLOTS,
  GearItemSchema,
  MANA_TYPES,
  RARITY_ORDER,
  computeHeroStats,
  defaultAbilities,
  sandboxWeapon,
  type AbilityBuild,
  type AbilityBuilds,
  type AbilitySlot,
```
with:
```ts
  BlowSchema,
  ChainSchema,
  GEAR_SLOTS,
  GearItemSchema,
  MANA_TYPES,
  MAX_CHAIN,
  RARITY_ORDER,
  computeHeroStats,
  defaultChains,
  sandboxWeapon,
  type AbilitySlot,
  type Blow,
  type Chains,
  type ChainSkill,
```

Replace:
```ts
 * The Training Grounds loadout: its own weapon, powers, attunement, builds and
```
with:
```ts
 * The Training Grounds loadout: its own weapon, powers, attunement, chains and
```

Replace:
```ts
  abilities: AbilityBuilds;
```
with:
```ts
  /** The basic chain and each ability slot's (any element: the sandbox is unrestricted). */
  chains: Chains;
```

Replace:
```ts
  /** The sandbox hero's primary: what basic blows strike with (the weapon keeps its mana, for attunement). */
  primary: ManaType;
  /** The second element the combo's finisher discharges (null = none; never the primary). */
  basicInfusion: ManaType | null;
```
with:
```ts
  /** The sandbox hero's pair: the elements its basic blows can pick (the weapon keeps its mana, for attunement). */
  primary: ManaType;
  /** The pair's second element (null = none; never the primary). */
  secondary: ManaType | null;
```

Replace:
```ts
  abilities: defaultAbilities('fire'),
```
with:
```ts
  chains: defaultChains(getDelveRegistry(), 'fire', 'sword'),
```

Replace:
```ts
  basicInfusion: null,
```
with:
```ts
  secondary: null,
```

Replace:
```ts
  const build = (slot: AbilitySlot) =>
    AbilityBuildSchema.refine((b) => forms.some((f) => f.id === b.form && f.slot === slot));
```
with:
```ts
  const chain = (slot: AbilitySlot) =>
    ChainSchema.refine((c) =>
      c.moves.every((m) => forms.some((f) => f.id === m.form && f.slot === slot)),
    );
```

Replace:
```ts
    abilities: z
      .object({
        primary: build('primary'),
        defensive: build('defensive'),
        ultimate: build('ultimate'),
      })
      .catch(D.abilities),
```
with:
```ts
    chains: z
      .object({
        basic: z.array(BlowSchema).min(1).max(MAX_CHAIN),
        primary: chain('primary'),
        defensive: chain('defensive'),
        ultimate: chain('ultimate'),
      })
      .catch(D.chains),
```

Replace:
```ts
    basicInfusion: ManaSchema.nullable().catch(null),
```
with:
```ts
    secondary: ManaSchema.nullable().catch(null),
```

Replace:
```ts
  // A Basic infusion is never the primary.
  const s =
    parsed.data.basicInfusion === parsed.data.primary
      ? { ...parsed.data, basicInfusion: null }
```
with:
```ts
  // The secondary is never the primary.
  const s =
    parsed.data.secondary === parsed.data.primary
      ? { ...parsed.data, secondary: null }
```

Replace:
```ts
  setAbility: (slot: AbilitySlot, build: AbilityBuild) => void;
```
with:
```ts
  setChain: <S extends ChainSkill>(skill: S, chain: Chains[S]) => void;
```

Replace:
```ts
  /** Pick the primary; a Basic infusion of that element is dropped. */
  setPrimary: (mana: ManaType) => void;
  /** The finisher's discharge (null = none); the primary is ignored. */
  setBasicInfusion: (mana: ManaType | null) => void;
  /** Copy the save's gear, builds and pair in (its powers and attunement then come from the items). */
  loadMyBuild: (profile: Pick<DelveProfile, 'equipped' | 'abilities' | 'pair'>) => void;
```
with:
```ts
  /** Pick the primary (a secondary of that element is dropped); the basic blows follow the pair. */
  setPrimary: (mana: ManaType) => void;
  /** Pick the secondary (null = none; the primary is ignored); the basic blows follow the pair. */
  setSecondary: (mana: ManaType | null) => void;
  /** Copy the save's gear, chains and pair in (its powers and attunement then come from the items). */
  loadMyBuild: (profile: Pick<DelveProfile, 'equipped' | 'chains' | 'pair'>) => void;
```

Replace:
```ts
const FIELDS = Object.keys(SANDBOX_DEFAULTS) as (keyof SandboxLoadout)[];
```
with:
```ts
const FIELDS = Object.keys(SANDBOX_DEFAULTS) as (keyof SandboxLoadout)[];

/**
 * The basic chain after the pair changes: each blow keeps its part, the old
 * secondary's taking the new one (the primary with none), every other the primary.
 */
function refit(
  basic: Blow[],
  was: ManaType | null,
  primary: ManaType,
  secondary: ManaType | null,
): Blow[] {
  return basic.map((b) => ({
    ...b,
    element: b.element === was && secondary ? secondary : primary,
  }));
}
```

Replace:
```ts
    setAbility: (slot, build) => commit({ abilities: { ...get().abilities, [slot]: build } }),
```
with:
```ts
    setChain: (skill, chain) => commit({ chains: { ...get().chains, [skill]: chain } }),
```

Replace:
```ts
    setPrimary: (primary) =>
      commit({ primary, ...(primary === get().basicInfusion ? { basicInfusion: null } : {}) }),
    setBasicInfusion: (basicInfusion) => {
      if (basicInfusion !== get().primary) commit({ basicInfusion });
```
with:
```ts
    setPrimary: (primary) => {
      const { secondary: was, chains } = get();
      const secondary = was === primary ? null : was;
      commit({
        primary,
        secondary,
        chains: { ...chains, basic: refit(chains.basic, was, primary, secondary) },
      });
    },
    setSecondary: (secondary) => {
      const { primary, secondary: was, chains } = get();
      if (secondary === primary) return;
      commit({
        secondary,
        chains: { ...chains, basic: refit(chains.basic, was, primary, secondary) },
      });
```

Replace:
```ts
        abilities: profile.abilities,
```
with:
```ts
        chains: profile.chains,
```

Replace:
```ts
        basicInfusion: profile.pair.secondary,
```
with:
```ts
        secondary: profile.pair.secondary,
```

Replace:
```ts
  | 'basicInfusion'
>;
```
with:
```ts
  | 'secondary'
> & { chains: Pick<Chains, 'basic'> };
```

Replace:
```ts
    // Basics only: blows strike with the primary and the finisher discharges the infusion,
    // unarmed too. Every element still attunes: the sandbox stays unrestricted.
    pair: { primary: s.primary, secondary: s.basicInfusion },
    filterAttunement: false,
```
with:
```ts
    // The pair powers the basic blows; every element still attunes: the sandbox stays unrestricted.
    pair: { primary: s.primary, secondary: s.secondary },
    filterAttunement: false,
    basic: s.chains.basic,
```

Replace:
```ts
  const basicInfusion = useSandboxStore((s) => s.basicInfusion);
```
with:
```ts
  const secondary = useSandboxStore((s) => s.secondary);
  const basic = useSandboxStore((s) => s.chains.basic);
```

Replace:
```ts
        basicInfusion,
      }),
    [weapon, loadedWeapon, gear, legendaries, attunement, depth, primary, basicInfusion],
```
with:
```ts
        secondary,
        chains: { basic },
      }),
    [weapon, loadedWeapon, gear, legendaries, attunement, depth, primary, secondary, basic],
```

- [ ] **Step 6: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (34).

Run: `(cd packages/client && npx vitest run)`
Expected: 17 FAIL, 629 pass, in 5 files that later tasks fix: `AbilitiesPanel`, `ManaPanel`, `TrainingPanel`, `DelveCamp` (Task 10) and `arena-hud-snapshot` (Task 11). The client typecheck still fails in 16 files (fixed by Tasks 10–12).

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/chains/chain-text.ts packages/client/src/features/delve/__tests__/chain-text.test.ts packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts packages/client/src/stores/sandboxStore.ts packages/client/src/stores/sandboxStore.test.ts packages/client/src/pages/__tests__/DelveLab.test.tsx
git add packages/client/src/features/delve/chains/chain-text.ts packages/client/src/features/delve/__tests__/chain-text.test.ts packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts packages/client/src/stores/sandboxStore.ts packages/client/src/stores/sandboxStore.test.ts packages/client/src/pages/__tests__/DelveLab.test.tsx
git commit -m "feat(client): the stores hold chains, notices per move, and the chain texts" -m "The client's typecheck and five test files (AbilitiesPanel, ManaPanel, TrainingPanel, DelveCamp, arena-hud-snapshot) stay red until Tasks 10-12 move the builder, the HUD and the arena to chains." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 15: Client: the chain builder (Task 10: the tests and the move editor)

### Task 10: The chain builder

The Abilities tab (and the Training Grounds' Abilities tab) becomes a chain builder, `chains/ChainEditor.tsx`. It lists the four skills, Basic first, as `role="tab"` buttons (`chain-skill-<skill>`; it opens on the Primary), each showing its form's icon and "n of cap". A skill shows a row of cards, one per move (`move-<i>`, `aria-label` its name): the kind's glyph (▪, ▪▪, ▪▪▪, ◉), the form's icon and name (a blow: ⚔️ and the weapon's name) and its element icons; under each, ◂ ▸ reorder (`move-left-<i>`, `move-right-<i>`) and × removes (`move-remove-<i>`, never the last), and a + card (`move-add`) copies the picked move while under the skill's cap. The summary line names the chain (`abilities-summary`: "light Fire Bolt · medium Fire Bolt · …"). The picked card opens `MoveEditor.tsx` below: kind chips (`kind-<kind>`), the skill's form chips (none for a blow), the main element and infusion chips (`element-<m>`, `infusion-none`, `infusion-<m>`, `swap-elements`; a blow picks one element), the element's effect text (`element-effect`) and the readout (`ability-readout`: the hit with the move's step bonus, cost, wind-up, cooldown, stacks, a hold's full charge; `cost-warning` when a mana cost exceeds the pool); a blow's readout shows its hit, its time and its stacks. Payment chips sit once per ability chain (`payment-<p>`). The Anvil binds it to the save (`caps` from the profile, elements from the pair, read-only mid-dive), the Training Grounds to the sandbox (caps `MAX_CHAIN`, any element for a move, the sandbox's pair for a blow), where "Basic infusion" becomes "Your secondary" (`secondary-none`, `secondary-<m>`). Texts: the how-to, the Mana view, the bind prompt and the mana choice say the basic chain's last blow strikes with the secondary; the overtake notice reads "Storm now outweighs Fire: Storm is your primary"; the Paper Doll's attacks per second count blows.

**Files:**
- Create: `packages/client/src/features/delve/chains/MoveEditor.tsx`, `packages/client/src/features/delve/chains/ChainEditor.tsx`
- Modify: `packages/client/src/features/delve/AbilitiesPanel.tsx` (whole file: keeps `AttunementBars` and `Chip`, renders `ChainEditor`)
- Modify: `packages/client/src/features/delve/training/TrainingPanel.tsx:11,31,132-133,231-255,336-355`
- Modify: `packages/client/src/pages/DelveCamp.tsx:54-57,139-141`, `packages/client/src/features/delve/ManaPanel.tsx:5,78,115-133`, `BindPrompt.tsx:1,22,60-61`, `ManaChoice.tsx:47`, `PaperDoll.tsx:40-43,64-65`, `packages/client/src/stores/delveStore.ts:108-111`
- Test: `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx` (whole file), `TrainingPanel.test.tsx`, `packages/client/src/pages/__tests__/DelveCamp.test.tsx`, `packages/client/src/stores/delveStore.test.ts`; `ManaPanel.test.tsx` passes unchanged once `ManaPanel.tsx` reads chains

- [ ] **Step 1: Write the failing tests**

The builder's tests: the four skill tabs and the summary; editing a move into a Wildfire Burst, the infusion swap; kinds and the chain's one payment; adding, reordering and removing within the cap and never below one; a skill's own cap; each ability's own forms and a blow's pair elements; the cost warning; read-only mid-dive; and `ChainEditor` on props (as the Training Grounds use it):

Replace the whole of `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx` with:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { computeHeroStats, defaultChains, type Move } from '@alloy/engine';
import { AbilitiesPanel } from '../AbilitiesPanel';
import { ChainEditor } from '../chains/ChainEditor';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const store = () => useDelveStore.getState();
const chains = () => store().profile.chains;

describe('AbilitiesPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it("lists the four skills, Basic first, and names the chosen skill's chain", () => {
    render(<AbilitiesPanel />);
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('data-testid'))).toEqual([
      'chain-skill-basic',
      'chain-skill-primary',
      'chain-skill-defensive',
      'chain-skill-ultimate',
    ]);
    expect(screen.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'light Fire Bolt · medium Fire Bolt · medium Fire Bolt · heavy Fire Bolt',
    );
    expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(4);
    expect(screen.getByTestId('attune-fire')).toHaveAttribute('data-value', '2');
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'light Fire blow · light Fire blow · heavy Fire blow',
    );
    expect(screen.queryByTestId('form-bolt')).toBeNull(); // a blow has no form
  });

  it('edits a move: a Wildfire Burst from its form and a Nature infusion, then a swap', () => {
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'nature' } });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('move-1'));
    fireEvent.click(screen.getByTestId('form-burst'));
    fireEvent.click(screen.getByTestId('infusion-nature'));
    expect(chains().primary.moves[1]).toEqual({
      kind: 'medium',
      form: 'burst',
      elements: ['fire', 'nature'],
    });
    expect(screen.getByTestId('ability-readout')).toHaveTextContent('medium Wildfire Burst');
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'light Fire Bolt · medium Wildfire Burst',
    );
    expect(screen.getByTestId('element-effect')).toHaveTextContent('Wildfire');
    fireEvent.click(screen.getByTestId('swap-elements'));
    expect(chains().primary.moves[1].elements).toEqual(['nature', 'fire']);
    fireEvent.click(screen.getByTestId('infusion-none'));
    expect(chains().primary.moves[1].elements).toEqual(['nature']);
  });

  it("sets a move's kind, and the chain's one payment with its wind-up", () => {
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('kind-hold'));
    expect(chains().primary.moves[0].kind).toBe('hold');
    expect(screen.getByTestId('ability-readout')).toHaveTextContent('Fully charged');
    fireEvent.click(screen.getByTestId('kind-heavy'));
    for (const payment of ['cast', 'mana', 'charge'] as const) {
      fireEvent.click(screen.getByTestId(`payment-${payment}`));
      expect(chains().primary.payment).toBe(payment);
      expect(screen.getByTestId('ability-readout')).toHaveTextContent(/\d\.\d\ds wind-up/);
    }
    expect(chains().primary.moves[0].kind).toBe('heavy');
  });

  it('adds, reorders and removes moves within the cap, never below one', () => {
    const bolt: Move = { kind: 'light', form: 'bolt', elements: ['fire'] };
    store().setChain('primary', { moves: [bolt], payment: 'mana' });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('move-remove-0')).toBeDisabled();
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByTestId('move-add'));
    expect(chains().primary.moves).toHaveLength(5);
    expect(screen.queryByTestId('move-add')).toBeNull(); // the cap
    // The new move is picked: make it heavy, then bring it forward.
    fireEvent.click(screen.getByTestId('kind-heavy'));
    expect(chains().primary.moves[4].kind).toBe('heavy');
    fireEvent.click(screen.getByTestId('move-left-4'));
    expect(chains().primary.moves.map((m) => m.kind)).toEqual([
      'light',
      'light',
      'light',
      'heavy',
      'light',
    ]);
    fireEvent.click(screen.getByTestId('move-remove-0'));
    expect(chains().primary.moves).toHaveLength(4);
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
  });

  it("stops at the skill's own cap", () => {
    store().setProfile({
      ...store().profile,
      chainCaps: { ...store().profile.chainCaps, primary: 4 },
    });
    render(<AbilitiesPanel />);
    expect(screen.queryByTestId('move-add')).toBeNull();
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
  });

  it('each ability offers only its own forms; a blow picks from the pair', () => {
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('chain-skill-defensive'));
    expect(screen.getByTestId('form-ward')).toBeInTheDocument();
    expect(screen.queryByTestId('form-bolt')).toBeNull();
    fireEvent.click(screen.getByTestId('form-armor'));
    expect(chains().defensive.moves[0].form).toBe('armor');
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    expect(screen.getByTestId('form-maelstrom')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getAllByTestId(/^element-/).map((c) => c.getAttribute('data-testid'))).toEqual([
      'element-fire',
      'element-storm',
    ]);
    fireEvent.click(screen.getByTestId('move-2'));
    fireEvent.click(screen.getByTestId('element-storm'));
    expect(chains().basic[2]).toEqual({ kind: 'heavy', element: 'storm' });
  });

  it('warns when a mana cost is bigger than the pool', () => {
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    fireEvent.click(screen.getByTestId('payment-mana'));
    fireEvent.click(screen.getByTestId('kind-heavy'));
    expect(screen.getByTestId('cost-warning')).toHaveTextContent('your pool holds');
  });

  it('is read-only while a dive is under way', () => {
    store().startDive(1);
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('abilities-locked')).toBeInTheDocument();
    expect(screen.getByTestId('form-lance')).toBeDisabled();
    expect(screen.getByTestId('move-add')).toBeDisabled();
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(chains().primary.moves[0].form).toBe('bolt');
  });
});

describe('ChainEditor', () => {
  const registry = getDelveRegistry();
  const stats = computeHeroStats({}, registry);
  const given = defaultChains(registry, 'storm', null);
  const caps = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };

  it('edits the chains it is given through onChange, and names the reactions it is told about', () => {
    const onChange = vi.fn();
    render(
      <ChainEditor
        chains={given}
        caps={caps}
        stats={stats}
        reactionsSeen={['melt']}
        locked={false}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Storm Bolt');
    fireEvent.click(screen.getByTestId('form-lance'));
    const [first, ...rest] = given.primary.moves;
    expect(onChange).toHaveBeenCalledWith('primary', {
      ...given.primary,
      moves: [{ ...first, form: 'lance' }, ...rest],
    });
    expect(screen.getByTestId('reaction-melt')).toBeInTheDocument();
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(14);
    expect(screen.getAllByTestId('reaction-unknown')[0]).toHaveTextContent(
      'Stack one element on a foe, then hit it with another, to discover.',
    );
    expect(screen.getByText('1/15 discovered')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^attune-/)).toHaveLength(6);
  });

  it('changes nothing while locked', () => {
    const onChange = vi.fn();
    render(
      <ChainEditor
        chains={given}
        caps={caps}
        stats={stats}
        reactionsSeen={[]}
        locked
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('form-lance'));
    fireEvent.click(screen.getByTestId('move-add'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

In `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`, the secondary row, the sandbox's chains, and Load my build with chains:

Replace:
```tsx
import { defaultAbilities, sandboxWeapon } from '@alloy/engine';
```
with:
```tsx
import { defaultChains, sandboxWeapon } from '@alloy/engine';
```

Replace:
```tsx
  it('picks the primary and the finisher discharge; the primary is off in the infusion row, even unarmed', () => {
    renderPanel('loadout');
    expect(screen.getByTestId('sandbox-primary-fire')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Your primary: what your blows strike with.')).toBeInTheDocument();
    expect(screen.getByTestId('basic-infusion-none')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('basic-infusion-fire')).toBeDisabled();
    fireEvent.click(screen.getByTestId('sandbox-primary-frost'));
    expect(useSandboxStore.getState().primary).toBe('frost');
    expect(screen.getByTestId('basic-infusion-frost')).toBeDisabled();
    expect(screen.getByTestId('basic-infusion-fire')).toBeEnabled();
    fireEvent.click(screen.getByTestId('basic-infusion-storm'));
    expect(useSandboxStore.getState().basicInfusion).toBe('storm');
    expect(screen.getByTestId('basic-infusion-storm')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Your combo finisher discharges this element.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('weapon-base-none'));
    expect(screen.getByTestId('basic-infusion-storm')).toBeEnabled();
    expect(screen.getByTestId('basic-infusion-storm')).toHaveAttribute('aria-pressed', 'true');
```
with:
```tsx
  it('picks the primary and the secondary; the primary is off in the secondary row, even unarmed', () => {
    renderPanel('loadout');
    expect(screen.getByTestId('sandbox-primary-fire')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/what your basic blows strike with/)).toBeInTheDocument();
    expect(screen.getByTestId('secondary-none')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('secondary-fire')).toBeDisabled();
    fireEvent.click(screen.getByTestId('sandbox-primary-frost'));
    expect(useSandboxStore.getState().primary).toBe('frost');
    expect(screen.getByTestId('secondary-frost')).toBeDisabled();
    expect(screen.getByTestId('secondary-fire')).toBeEnabled();
    fireEvent.click(screen.getByTestId('secondary-storm'));
    expect(useSandboxStore.getState().secondary).toBe('storm');
    expect(screen.getByTestId('secondary-storm')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/The second element your basic blows can pick/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('weapon-base-none'));
    expect(screen.getByTestId('secondary-storm')).toBeEnabled();
    expect(screen.getByTestId('secondary-storm')).toHaveAttribute('aria-pressed', 'true');
  });

  it("the Abilities tab builds the sandbox's chains: any element for a move, the pair for a blow", () => {
    useSandboxStore.getState().setSecondary('storm');
    renderPanel('abilities');
    fireEvent.click(screen.getByTestId('element-shadow'));
    expect(useSandboxStore.getState().chains.primary.moves[0].elements).toEqual(['shadow']);
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getAllByTestId(/^element-/)).toHaveLength(2);
    fireEvent.click(screen.getByTestId('element-storm'));
    expect(useSandboxStore.getState().chains.basic[0].element).toBe('storm');
```

Replace:
```tsx
      abilities: defaultAbilities('fire'),
```
with:
```tsx
      chains: defaultChains(registry, 'fire', 'sword'),
```

In `packages/client/src/pages/__tests__/DelveCamp.test.tsx`:

Replace:
```tsx
    expect(p.abilities.defensive.elements).toEqual(['frost']);
```
with:
```tsx
    expect(p.chains.defensive.moves[0].elements).toEqual(['frost']);
```

In `packages/client/src/stores/delveStore.test.ts`, the overtake notice:

Replace:
```ts
      'Storm now outweighs Fire: your basic attacks strike with Storm',
    ]);
```
with:
```ts
      'Storm now outweighs Fire: Storm is your primary',
    ]);
```

Replace:
```ts
      'Storm now outweighs Fire: your basic attacks strike with Storm',
```
with:
```ts
      'Storm now outweighs Fire: Storm is your primary',
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/AbilitiesPanel.test.tsx src/features/delve/__tests__/TrainingPanel.test.tsx src/features/delve/__tests__/ManaPanel.test.tsx src/pages/__tests__/DelveCamp.test.tsx src/stores/delveStore.test.ts)`
Expected: 16 FAIL, 27 pass, and `AbilitiesPanel.test.tsx` fails to load (Failed to resolve import "../chains/ChainEditor"): `ManaPanel.test.tsx` 7 and `DelveCamp.test.tsx` 5 (Cannot read properties of undefined (reading 'basic'): `profileStats` reads the chains the pages don't pass yet), `TrainingPanel.test.tsx` 2 ("picks the primary and the secondary …": Unable to find an element with the text: /what your basic blows strike with/; "the Abilities tab builds the sandbox's chains …": Cannot read properties of undefined (reading 'primary')), `delveStore.test.ts` 2 (expected 'Storm now outweighs Fire: your basic …' to be 'Storm now outweighs Fire: Storm is yo…').

- [ ] **Step 3: The move editor**

Create `packages/client/src/features/delve/chains/MoveEditor.tsx`:

```tsx
import {
  MOVE_KINDS,
  stepBonus,
  type AbilitySlot,
  type Blow,
  type HeroBlow,
  type HeroStats,
  type ManaType,
  type Move,
  type MoveKind,
  type ResolvedAbility,
} from '@alloy/engine';
import { Chip } from '../AbilitiesPanel';
import { formatNumber, manaStyle } from '../format';
import { getDelveRegistry } from '../registry';
import { KIND_ICON, KIND_LABEL } from './chain-text';

const KIND_HINT: Record<MoveKind, string> = {
  light: 'Quick and cheap.',
  medium: 'Balanced.',
  heavy: 'Harder and bigger, but dearer and slower.',
  hold: 'Hold the button to charge it, then let go: a tap is a medium hit, a full charge beyond heavy.',
};

function Heading({ children }: { children: string }) {
  return (
    <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
      {children}
    </div>
  );
}

/** Plain-language numbers for a resolved move (at its place in the chain); a hold's full charge too. */
function Readout({
  ab,
  full,
  stats,
  pool,
}: {
  ab: ResolvedAbility;
  full: ResolvedAbility | null;
  stats: HeroStats;
  pool: number;
}) {
  const registry = getDelveRegistry();
  const bal = registry.getDelveBalance();
  const hitOf = (m: ResolvedAbility) =>
    stats.weaponDamage * stats.damageMult * m.power * stepBonus(bal, m.index).power;
  const hit = hitOf(ab);
  const maxHp = stats.maxHp;
  const lines: string[] = [];
  const f = ab.form.id;
  if (f === 'ward')
    lines.push(
      `Absorbs ${formatNumber(maxHp * ab.effect)} for ${ab.duration}s`,
      `Bursts for ${formatNumber(hit)}`,
    );
  else if (f === 'armor')
    lines.push(
      `${Math.round(Math.min(0.75, ab.effect) * 100)}% less damage for ${ab.duration}s`,
      `Strikes back for ${formatNumber(hit)}`,
    );
  else if (f === 'surge')
    lines.push(`+${Math.round(ab.effect * 100)}% attack speed for ${ab.duration}s`);
  else if (f === 'blink')
    lines.push(
      `${ab.range} units, untouchable ${ab.effect.toFixed(2)}s`,
      `Trail hits for ${formatNumber(hit)}`,
    );
  else if (f === 'barrage') lines.push(`${ab.count} impacts of ${formatNumber(hit)}`);
  else if (f === 'maelstrom')
    lines.push(`${formatNumber(hit)} every ${ab.tick}s for ${ab.duration}s`);
  else
    lines.push(
      `Hits for ${formatNumber(hit)}${ab.radius > 0 && f !== 'strike' ? ` · radius ${ab.radius.toFixed(1)}` : ''}`,
    );
  const windup = ab.castTime > 0 ? ` · ${ab.castTime.toFixed(2)}s wind-up` : '';
  const pay =
    ab.payment === 'charge'
      ? `Charge ${Math.round(ab.chargeNeed)}${windup}`
      : `${Math.round(ab.cost)} mana${windup}`;
  lines.push(
    `${pay} · ${ab.payment === 'charge' ? 'no cooldown' : `${ab.cooldown.toFixed(ab.cooldown < 2 ? 2 : 0)}s cooldown`}`,
    `${ab.stacks} ${ab.stacks === 1 ? 'stack' : 'stacks'} a hit`,
  );
  if (full)
    lines.push(
      `Fully charged (${bal.chains.holdTime}s): hits for ${formatNumber(hitOf(full))}, ${Math.round(full.cost)} mana`,
    );
  return (
    <div className="delve-panel flex flex-col gap-0.5 p-3 text-sm" data-testid="ability-readout">
      <div
        className="delve-display text-lg font-bold"
        style={{ color: manaStyle(registry, ab.element).color }}
      >
        {ab.icon} {KIND_LABEL[ab.kind]} {ab.name}
      </div>
      {lines.map((l) => (
        <div key={l} className="text-stone-300">
          {l}
        </div>
      ))}
      {ab.cost > pool && (
        <div className="text-xs font-semibold text-red-300" data-testid="cost-warning">
          Needs {Math.round(ab.cost)} mana; your pool holds {Math.round(pool)}.
        </div>
      )}
    </div>
  );
}

/** A basic blow's numbers: its hit, its time and its stacks. */
function BlowReadout({ blow, stats }: { blow: HeroBlow; stats: HeroStats }) {
  const registry = getDelveRegistry();
  const hit = stats.weaponDamage * stats.damageMult * blow.attunePower * blow.power;
  const stacks = registry.getDelveBalance().stacks.basicByKind[blow.kind];
  return (
    <div className="delve-panel flex flex-col gap-0.5 p-3 text-sm" data-testid="ability-readout">
      <div
        className="delve-display text-lg font-bold"
        style={{ color: manaStyle(registry, blow.element).color }}
      >
        {KIND_LABEL[blow.kind]} {manaStyle(registry, blow.element).name} blow
      </div>
      <div className="text-stone-300">Hits for {formatNumber(hit)}</div>
      <div className="text-stone-300">
        {(stats.attackInterval * blow.time).toFixed(2)}s · {stacks}{' '}
        {stacks === 1 ? 'stack' : 'stacks'} a hit
      </div>
    </div>
  );
}

export interface MoveEditorProps {
  /** The ability slot the move belongs to, or null for a basic blow. */
  slot: AbilitySlot | null;
  move: Move | Blow;
  /** The move resolved at its place in the chain (a hold at stage 0), and a hold's full charge. */
  resolved: ResolvedAbility | null;
  full: ResolvedAbility | null;
  /** A blow as the hero swings it. */
  blow: HeroBlow | null;
  stats: HeroStats;
  pool: number;
  /** The elements it can take. */
  elements: readonly ManaType[];
  onChange: (next: Move | Blow) => void;
}

/** One move of a chain: its kind, its form (none for a blow), its element(s), and its readout. */
export function MoveEditor({
  slot,
  move,
  resolved,
  full,
  blow,
  stats,
  pool,
  elements,
  onChange,
}: MoveEditorProps) {
  const registry = getDelveRegistry();
  const data = registry.getArpgData();
  const set = (next: Partial<Move>) => onChange({ ...move, ...next } as Move | Blow);
  const trait = (m: ManaType) => data.elementTraits[m];

  return (
    <div className="flex flex-col gap-3" data-testid="move-editor">
      <section className="flex flex-col gap-1.5">
        <Heading>Kind</Heading>
        <div className="flex flex-wrap gap-1.5">
          {MOVE_KINDS.map((k) => (
            <Chip
              key={k}
              pressed={move.kind === k}
              onClick={() => set({ kind: k })}
              testId={`kind-${k}`}
            >
              {KIND_ICON[k]} {KIND_LABEL[k]}
            </Chip>
          ))}
        </div>
        <div className="text-[11px] text-stone-500">{KIND_HINT[move.kind]}</div>
      </section>

      {'element' in move ? (
        <section className="flex flex-col gap-1.5">
          <Heading>Element</Heading>
          <div className="flex flex-wrap gap-1.5">
            {elements.map((m) => (
              <Chip
                key={m}
                pressed={move.element === m}
                onClick={() => onChange({ ...move, element: m })}
                testId={`element-${m}`}
              >
                {manaStyle(registry, m).icon} {manaStyle(registry, m).name}
              </Chip>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-1.5">
            <Heading>Form</Heading>
            <div className="flex flex-wrap gap-1.5">
              {data.forms
                .filter((f) => f.slot === slot)
                .map((f) => (
                  <Chip
                    key={f.id}
                    pressed={move.form === f.id}
                    onClick={() => set({ form: f.id })}
                    testId={`form-${f.id}`}
                  >
                    {f.icon} {f.name}
                  </Chip>
                ))}
            </div>
            <div className="text-xs text-stone-400">{registry.getForm(move.form).text}</div>
          </section>

          <section className="flex flex-col gap-1.5">
            <Heading>Element</Heading>
            <div className="flex flex-wrap gap-1.5">
              {elements.map((m) => {
                const [main, infusion] = move.elements;
                return (
                  <Chip
                    key={m}
                    pressed={main === m}
                    onClick={() =>
                      set({ elements: infusion && infusion !== m ? [m, infusion] : [m] })
                    }
                    testId={`element-${m}`}
                    title={trait(m).text}
                  >
                    {manaStyle(registry, m).icon} {manaStyle(registry, m).name}
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
              >
                None
              </Chip>
              {elements
                .filter((m) => m !== move.elements[0])
                .map((m) => (
                  <Chip
                    key={m}
                    pressed={move.elements[1] === m}
                    onClick={() => set({ elements: [move.elements[0], m] })}
                    testId={`infusion-${m}`}
                  >
                    {manaStyle(registry, m).icon}
                  </Chip>
                ))}
              {move.elements.length > 1 && (
                <button
                  type="button"
                  className="delve-chip"
                  onClick={() => set({ elements: [move.elements[1], move.elements[0]] })}
                  aria-label="Swap the main element and the infusion"
                  data-testid="swap-elements"
                >
                  ⇄
                </button>
              )}
            </div>
            <div className="text-xs text-stone-400" data-testid="element-effect">
              {resolved?.fusion ? (
                <>
                  <b className="text-stone-200">
                    {resolved.fusion.icon} {resolved.fusion.name}:
                  </b>{' '}
                  {resolved.fusion.text} {manaStyle(registry, move.elements[0]).name} sets the
                  damage type.
                </>
              ) : slot === 'defensive' ? (
                trait(move.elements[0]).defensive
              ) : (
                trait(move.elements[0]).text
              )}
            </div>
          </section>
        </>
      )}

      {resolved && <Readout ab={resolved} full={full} stats={stats} pool={pool} />}
      {blow && <BlowReadout blow={blow} stats={stats} />}
    </div>
  );
}
```

---

## Chunk 16: Client: the chain builder (Task 10 continued: the chain editor and its homes)

- [ ] **Step 4: The chain editor**

Create `packages/client/src/features/delve/chains/ChainEditor.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import {
  CHAIN_SKILLS,
  MANA_TYPES,
  manaPool,
  resolveChain,
  type AbilityPayment,
  type Blow,
  type Chain,
  type Chains,
  type ChainSkill,
  type HeroStats,
  type ManaType,
  type Move,
} from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { AttunementBars, Chip } from '../AbilitiesPanel';
import { manaStyle } from '../format';
import { getDelveRegistry } from '../registry';
import { KIND_ICON, blowText, chainText, moveText } from './chain-text';
import { MoveEditor } from './MoveEditor';

const SKILL_NAME: Record<ChainSkill, string> = {
  basic: 'Basic',
  primary: 'Primary · Q',
  defensive: 'Defensive · E',
  ultimate: 'Ultimate · R',
};
const PAYMENTS: [AbilityPayment, string, string][] = [
  ['mana', 'Mana', 'Pay mana, then wait the cooldown.'],
  ['charge', 'Charge', 'No mana: fill a meter by dealing damage (and in lulls), then unleash it.'],
  ['cast', 'Cast', 'Half the mana and 20% more power, but you stand still while it winds up.'],
];

export interface ChainEditorProps {
  chains: Chains;
  /** Most moves each skill's chain may hold. */
  caps: Record<ChainSkill, number>;
  /** The hero the chains resolve against: legendaries, cooldowns, damage, life, attunement, pool. */
  stats: HeroStats;
  /** Reactions shown by name; the rest show as ???. */
  reactionsSeen: readonly string[];
  /** Read-only (a dive is under way). */
  locked: boolean;
  onChange: <S extends ChainSkill>(skill: S, chain: Chains[S]) => void;
  /** The elements an ability's move can take (the Delve: your pair); all six when absent. */
  elements?: readonly ManaType[];
  /** The elements a basic blow can take (your pair); `elements` when absent. */
  blowElements?: readonly ManaType[];
  /** Shown in place of the attunement bars (the Anvil's Mana view). */
  mana?: ReactNode;
}

/** Move `from` of `list` to `to` (the others keep their order). */
function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * The chain builder: each skill (the basic attack, then the Primary, Defensive
 * and Ultimate) is a row of move cards, up to its cap. A card opens its move
 * below: its kind, its form and its elements. ◂ ▸ reorder, × removes (never the
 * last), + adds a copy of the chosen move. The Anvil binds it to the save; the
 * Training Grounds to its own loadout. See the moves and chains spec.
 */
export function ChainEditor({
  chains,
  caps,
  stats,
  reactionsSeen,
  locked,
  onChange,
  elements = MANA_TYPES,
  blowElements = elements,
  mana,
}: ChainEditorProps) {
  const registry = getDelveRegistry();
  const data = registry.getArpgData();
  const [skill, setSkill] = useState<ChainSkill>('primary');
  const [picked, setPicked] = useState(0);
  const pool = manaPool(stats, registry).max;
  const slot = skill === 'basic' ? null : skill;
  const chain = slot ? chains[slot] : null;
  const entries: (Move | Blow)[] = chain ? chain.moves : chains.basic;
  const index = Math.min(picked, entries.length - 1);
  const resolved = slot ? resolveChain(registry, stats, slot, chains[slot]) : null;
  const names = resolved
    ? resolved.moves.map(moveText)
    : chains.basic.map((b) => blowText(registry, b));
  const weapon = stats.weapon.baseId ? registry.getGearBase(stats.weapon.baseId).name : 'Fist';

  const commit = (next: (Move | Blow)[], payment = chain?.payment) => {
    if (locked) return;
    playSound('buttonClick');
    if (skill === 'basic') onChange('basic', next as Blow[]);
    else onChange(skill, { moves: next as Move[], payment: payment! } as Chain);
  };
  const pick = (s: ChainSkill) => {
    setSkill(s);
    setPicked(0);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="abilities-panel">
      <div className="flex gap-1.5" role="tablist">
        {CHAIN_SKILLS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={skill === s}
            className="delve-panel flex flex-1 flex-col items-center gap-0.5 p-2"
            style={{ borderColor: skill === s ? '#fcd34d' : undefined }}
            onClick={() => pick(s)}
            data-testid={`chain-skill-${s}`}
          >
            <span className="text-[10px] uppercase tracking-widest text-stone-400">
              {SKILL_NAME[s]}
            </span>
            <span className="text-lg leading-none">
              {s === 'basic' ? '⚔️' : registry.getForm(chains[s].moves[0].form).icon}
            </span>
            <span className="text-[11px] font-semibold text-stone-200">
              {(s === 'basic' ? chains.basic : chains[s].moves).length} of {caps[s]}
            </span>
          </button>
        ))}
      </div>

      <div className="text-xs text-stone-400" data-testid="abilities-summary">
        {chainText(names)}
      </div>

      {locked && (
        <div
          className="delve-panel p-2 text-center text-xs text-amber-200"
          data-testid="abilities-locked"
        >
          A dive is under way: your chains can change once you extract or fall.
        </div>
      )}
      <fieldset
        disabled={locked}
        className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
        style={{ opacity: locked ? 0.55 : 1 }}
      >
        <div className="flex flex-wrap items-stretch gap-1.5" data-testid="chain-cards">
          {entries.map((e, i) => {
            const els = 'element' in e ? [e.element] : e.elements;
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  className="delve-panel flex w-20 flex-col items-center gap-0.5 p-1.5"
                  style={{ borderColor: i === index ? '#fcd34d' : undefined }}
                  aria-pressed={i === index}
                  aria-label={names[i]}
                  onClick={() => setPicked(i)}
                  data-testid={`move-${i}`}
                >
                  <span className="text-[10px] text-stone-400">{KIND_ICON[e.kind]}</span>
                  <span className="text-lg leading-none">
                    {'form' in e ? registry.getForm(e.form).icon : '⚔️'}
                  </span>
                  <span className="text-center text-[10px] font-semibold leading-tight text-stone-200">
                    {'form' in e ? registry.getForm(e.form).name : weapon}
                  </span>
                  <span className="text-xs leading-none">
                    {els.map((m) => manaStyle(registry, m).icon).join('')}
                  </span>
                </button>
                <span className="flex gap-0.5">
                  <button
                    type="button"
                    className="delve-chip px-1.5"
                    disabled={i === 0}
                    aria-label="Move earlier"
                    onClick={() => {
                      commit(moved(entries, i, i - 1));
                      setPicked(i - 1);
                    }}
                    data-testid={`move-left-${i}`}
                  >
                    ◂
                  </button>
                  <button
                    type="button"
                    className="delve-chip px-1.5"
                    disabled={i === entries.length - 1}
                    aria-label="Move later"
                    onClick={() => {
                      commit(moved(entries, i, i + 1));
                      setPicked(i + 1);
                    }}
                    data-testid={`move-right-${i}`}
                  >
                    ▸
                  </button>
                  <button
                    type="button"
                    className="delve-chip px-1.5"
                    disabled={entries.length === 1}
                    aria-label="Remove"
                    onClick={() => {
                      commit(entries.filter((_, j) => j !== i));
                      setPicked(Math.max(0, i === index ? i - 1 : index > i ? index - 1 : index));
                    }}
                    data-testid={`move-remove-${i}`}
                  >
                    ×
                  </button>
                </span>
              </div>
            );
          })}
          {entries.length < caps[skill] && (
            <button
              type="button"
              className="delve-panel flex w-20 items-center justify-center p-1.5 text-2xl text-stone-400"
              aria-label="Add a move"
              onClick={() => {
                commit([...entries, { ...entries[index] }]);
                setPicked(entries.length);
              }}
              data-testid="move-add"
            >
              +
            </button>
          )}
        </div>

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

        {chain && (
          <section className="flex flex-col gap-1.5">
            <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
              Pay with
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENTS.map(([p, label]) => (
                <Chip
                  key={p}
                  pressed={chain.payment === p}
                  onClick={() => commit(chain.moves, p)}
                  testId={`payment-${p}`}
                >
                  {label}
                </Chip>
              ))}
            </div>
            <div className="text-[11px] text-stone-500">
              {PAYMENTS.find(([p]) => p === chain.payment)![2]} One payment for every move.
            </div>
          </section>
        )}
      </fieldset>

      {mana ?? (
        <section className="flex flex-col gap-1.5">
          <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
            Attunement
          </div>
          <AttunementBars stats={stats} />
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="delve-display text-xs font-bold uppercase tracking-widest text-fuchsia-300">
            Reactions
          </span>
          <span className="text-[10px] text-stone-500">
            {reactionsSeen.length}/{data.reactions.length} discovered
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {data.reactions.map((r) => {
            const seen = reactionsSeen.includes(r.id);
            return (
              <div
                key={r.id}
                className="delve-panel flex items-center gap-2.5 p-2"
                data-testid={seen ? `reaction-${r.id}` : 'reaction-unknown'}
                style={seen ? { borderColor: 'rgba(232,121,249,0.4)' } : undefined}
              >
                <span className="w-8 text-center text-2xl">{seen ? r.icon : '❔'}</span>
                <span className="min-w-0">
                  <span
                    className="delve-display block text-sm font-bold"
                    style={{ color: seen ? '#f0abfc' : '#57534e' }}
                  >
                    {seen ? r.name : '???'}
                  </span>
                  <span className="block text-[10.5px] leading-snug text-stone-400">
                    {seen
                      ? r.text
                      : 'Stack one element on a foe, then hit it with another, to discover.'}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: The Anvil's and the Training Grounds' Abilities tabs**

`AbilitiesPanel.tsx` keeps `AttunementBars` and `Chip` (the builder and the Training panel import them) and renders the builder on the save:

Replace the whole of `packages/client/src/features/delve/AbilitiesPanel.tsx` with:

```tsx
import { useMemo } from 'react';
import {
  MANA_TYPES,
  isDiveActive,
  manaPool,
  pairElements,
  profileStats,
  type HeroStats,
  type ManaType,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from './registry';
import { manaStyle } from './format';
import { ManaPanel } from './ManaPanel';
import { ChainEditor } from './chains/ChainEditor';

/** Attunement per element (all six, or just `elements`) with the mastery threshold, and the one mana pool it feeds. */
export function AttunementBars({
  stats,
  elements = MANA_TYPES,
}: {
  stats: HeroStats;
  elements?: readonly ManaType[];
}) {
  const registry = getDelveRegistry();
  const bal = registry.getDelveBalance().mana;
  const masteries = registry.getArpgData().masteries;
  const attunement = stats.attunement;
  const scale = Math.max(bal.masteryThreshold + 2, ...elements.map((m) => attunement[m] + 1));
  const pool = manaPool(stats, registry);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-stone-400" data-testid="mana-pool">
        Mana pool <b className="text-indigo-300">{Math.round(pool.max)}</b> · +
        {pool.regen.toFixed(1)}/s · every point of attunement adds {bal.poolPerAttune}
      </div>
      {elements.map((m) => {
        const style = manaStyle(registry, m);
        const a = attunement[m];
        const mastery = masteries.find((x) => x.mana === m);
        const mastered = a >= bal.masteryThreshold;
        return (
          <div key={m} className="flex flex-col gap-0.5" data-testid={`attune-${m}`} data-value={a}>
            <div className="flex items-center gap-2">
              <span className="w-5 text-center text-sm leading-none">{style.icon}</span>
              <span
                className="delve-display w-14 text-xs font-bold"
                style={{ color: a > 0 ? style.color : '#57534e' }}
              >
                {style.name}
              </span>
              <div className="relative h-2.5 flex-1 overflow-visible rounded-full bg-white/5">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.min(1, a / scale) * 100}%`,
                    background: style.color,
                    boxShadow: a > 0 ? `0 0 8px ${style.color}88` : undefined,
                  }}
                />
                <span
                  className="absolute -top-0.5 h-3.5 w-0.5 rounded"
                  style={{
                    left: `${(bal.masteryThreshold / scale) * 100}%`,
                    background: mastered ? '#fff' : 'rgba(255,255,255,0.25)',
                  }}
                />
              </div>
              <span className="delve-display w-6 text-right text-sm font-bold text-stone-100">
                {a}
              </span>
            </div>
            <div className="pl-7 text-[10px] leading-snug text-stone-500">
              {a > 0 && (
                <span className="text-stone-400">
                  +{Math.round(a * bal.powerPerAttune * 100)}% to {style.name} abilities ·{' '}
                </span>
              )}
              {mastery &&
                (mastered ? (
                  <span style={{ color: style.color }}>
                    ★ {mastery.name}: {mastery.text}
                  </span>
                ) : (
                  <span>
                    At {bal.masteryThreshold}: {mastery.name}
                  </span>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Chip({
  pressed,
  onClick,
  children,
  testId,
  title,
  disabled,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="delve-chip"
      aria-pressed={pressed}
      onClick={onClick}
      data-testid={testId}
      title={title}
      disabled={disabled}
      style={disabled ? { opacity: 0.35 } : undefined}
    >
      {children}
    </button>
  );
}

/** The Anvil's workshop: the save's chains from your two elements, and your Mana view; read-only while a dive is under way. */
export function AbilitiesPanel() {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const { equipped, pair, chains } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair, chains }),
    [equipped, pair, chains, registry],
  );
  const elements = pairElements(pair);
  return (
    <ChainEditor
      chains={chains}
      caps={profile.chainCaps}
      stats={stats}
      reactionsSeen={profile.reactionsSeen}
      locked={isDiveActive(profile)}
      onChange={(skill, chain) => useDelveStore.getState().setChain(skill, chain)}
      elements={elements.length > 0 ? elements : undefined}
      mana={<ManaPanel stats={stats} />}
    />
  );
}
```

In `packages/client/src/features/delve/training/TrainingPanel.tsx`, the secondary row replaces the Basic infusion row, and the Abilities tab builds the sandbox's chains:

Before:
```tsx
  RARITY_ORDER,
```
add:
```tsx
  MAX_CHAIN,
```

Replace:
```tsx
import { AbilityEditor, AttunementBars, Chip } from '../AbilitiesPanel';
```
with:
```tsx
import { AttunementBars, Chip } from '../AbilitiesPanel';
import { ChainEditor } from '../chains/ChainEditor';
```

Replace:
```tsx
  // What the engine discharges: none, or when the pick is the primary.
  const infusion = stats.weapon.infusion;
  const pick = (next: Partial<WeaponChoice>) =>
```
with:
```tsx
  const pick = (next: Partial<WeaponChoice>) =>
```

Replace:
```tsx
        <p className="text-[11px] text-stone-500">Your primary: what your blows strike with.</p>
      </Section>

      <Section title="Basic infusion">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            pressed={!infusion}
            onClick={() => s.setBasicInfusion(null)}
            testId="basic-infusion-none"
          >
```
with:
```tsx
        <p className="text-[11px] text-stone-500">
          Your primary: what your basic blows strike with, and its attunement powers them.
        </p>
      </Section>

      <Section title="Your secondary">
        <div className="flex flex-wrap gap-1.5">
          <Chip pressed={!s.secondary} onClick={() => s.setSecondary(null)} testId="secondary-none">
```

Replace:
```tsx
              pressed={infusion === m}
              disabled={m === s.primary}
              onClick={() => s.setBasicInfusion(m)}
              testId={`basic-infusion-${m}`}
```
with:
```tsx
              pressed={s.secondary === m}
              disabled={m === s.primary}
              onClick={() => s.setSecondary(m)}
              testId={`secondary-${m}`}
```

Replace:
```tsx
        <p className="text-[11px] text-stone-500">Your combo finisher discharges this element.</p>
```
with:
```tsx
        <p className="text-[11px] text-stone-500">
          The second element your basic blows can pick (in Abilities, Basic).
        </p>
```

Replace:
```tsx
        Copies your equipped gear and abilities in. Nothing here ever changes your save.
```
with:
```tsx
        Copies your equipped gear, chains and pair in. Nothing here ever changes your save.
```

Replace:
```tsx
/** The Anvil's editor, bound to the sandbox (never locked, every reaction named: it's a testing tool). */
const TrainingAbilities = memo(function TrainingAbilities() {
  const builds = useSandboxStore((s) => s.abilities);
```
with:
```tsx
const CAPS = { basic: MAX_CHAIN, primary: MAX_CHAIN, defensive: MAX_CHAIN, ultimate: MAX_CHAIN };

/**
 * The Anvil's chain builder, bound to the sandbox: never locked, any element for
 * an ability, the pair for a blow, every reaction named (it's a testing tool).
 */
const TrainingAbilities = memo(function TrainingAbilities() {
  const chains = useSandboxStore((s) => s.chains);
  const primary = useSandboxStore((s) => s.primary);
  const secondary = useSandboxStore((s) => s.secondary);
```

Replace:
```tsx
    <AbilityEditor
      builds={builds}
      stats={stats}
      reactionsSeen={all}
      locked={false}
      onChange={(slot, build) => useSandboxStore.getState().setAbility(slot, build)}
```
with:
```tsx
    <ChainEditor
      chains={chains}
      caps={CAPS}
      stats={stats}
      reactionsSeen={all}
      locked={false}
      onChange={(skill, chain) => useSandboxStore.getState().setChain(skill, chain)}
      blowElements={secondary ? [primary, secondary] : [primary]}
```

- [ ] **Step 6: The pages and texts that read chains**

In `packages/client/src/pages/DelveCamp.tsx`, the stats read the chains, and the how-to describes them:

Replace:
```tsx
  const { equipped, pair } = profile;
  const attunement = useMemo(
    () => profileStats(registry, { equipped, pair }).attunement,
    [equipped, pair, registry],
```
with:
```tsx
  const { equipped, pair, chains } = profile;
  const attunement = useMemo(
    () => profileStats(registry, { equipped, pair, chains }).attunement,
    [equipped, pair, chains, registry],
```

Replace:
```tsx
                🔥 Build your Primary, Defensive and Ultimate in the{' '}
                <b className="text-violet-300">Abilities</b> tab: a form, one or two elements, a
                weight and a payment. Gear attunes you to its element and powers those abilities.
```
with:
```tsx
                🔥 Each skill is a chain of moves: build your basic attack, Primary, Defensive and
                Ultimate in the <b className="text-violet-300">Abilities</b> tab, each move a kind
                (light, medium, heavy, or a hold you charge), a form and one or two elements. Each
                press casts the chain's next move, each harder than the last; a pause starts it
                over. Gear attunes you to its element and powers those moves.
```

In `packages/client/src/features/delve/ManaPanel.tsx`, the texts, and a bind's Power from `bindSecondary` (so the last blow takes the secondary in the preview too):

Before:
```tsx
  isDiveActive,
```
add:
```tsx
  bindSecondary,
```

Replace:
```tsx
            ? `${style(secondary).icon} ${style(secondary).name} · secondary: your combo finisher discharges it`
```
with:
```tsx
            ? `${style(secondary).icon} ${style(secondary).name} · secondary: your blows and abilities can use it`
```

Replace:
```tsx
            Bind a second element: your combo finisher discharges it and your abilities can use it.
            Power now {formatNumber(profilePower(registry, profile))}.
```
with:
```tsx
            Bind a second element: your basic chain's last blow strikes with it and your abilities
            can use it. Power now {formatNumber(profilePower(registry, profile))}.
```

Replace:
```tsx
                  {formatNumber(
                    profilePower(registry, { ...profile, pair: { primary, secondary: m } }),
                  )}
```
with:
```tsx
                  {formatNumber(profilePower(registry, bindSecondary(profile, m).profile))}
```

In `packages/client/src/features/delve/BindPrompt.tsx`:

Replace:
```tsx
import { equipItem, profilePower, type GearItem } from '@alloy/engine';
```
with:
```tsx
import { bindSecondary, equipItem, profilePower, type GearItem } from '@alloy/engine';
```

Replace:
```tsx
  const bound = profilePower(registry, { ...worn, pair: { ...worn.pair, secondary: item.mana } });
```
with:
```tsx
  const bound = profilePower(registry, bindSecondary(worn, item.mana).profile);
```

Replace:
```tsx
          Your combo finisher will discharge {st.name}, your abilities can use it, and its gear will
          attune you. After that, only a Realign changes it.
```
with:
```tsx
          Your basic chain's last blow will strike with {st.name}, your abilities can use it, and
          its gear will attune you. After that, only a Realign changes it.
```

In `packages/client/src/features/delve/ManaChoice.tsx`:

Replace:
```tsx
          Between dives you'll bind a second element: your combo's finisher discharges it.
```
with:
```tsx
          Between dives you'll bind a second element: your basic chain's last blow strikes with it.
```

In `packages/client/src/features/delve/PaperDoll.tsx`:

Replace:
```tsx
  const { equipped, pair } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [equipped, pair, registry],
```
with:
```tsx
  const { equipped, pair, chains } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair, chains }),
    [equipped, pair, chains, registry],
```

Replace:
```tsx
                stats.weapon.combo.length /
                (stats.attackInterval * stats.weapon.combo.reduce((a, s) => a + s.time, 0))
```
with:
```tsx
                stats.weapon.blows.length /
                (stats.attackInterval * stats.weapon.blows.reduce((a, s) => a + s.time, 0))
```

In `packages/client/src/stores/delveStore.ts`, the overtake notice:

Replace:
```ts
/** "Storm now outweighs Fire: your basic attacks strike with Storm" (`now` is the new primary). */
export function overtakeNotice(registry: DataRegistry, now: ManaType, was: ManaType): string {
  const name = manaName(registry, now);
  return `${name} now outweighs ${manaName(registry, was)}: your basic attacks strike with ${name}`;
```
with:
```ts
/** "Storm now outweighs Fire: Storm is your primary" (`now` is the new primary). */
export function overtakeNotice(registry: DataRegistry, now: ManaType, was: ManaType): string {
  const name = manaName(registry, now);
  return `${name} now outweighs ${manaName(registry, was)}: ${name} is your primary`;
```

- [ ] **Step 7: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (53).

Run: `(cd packages/client && npx vitest run)`
Expected: 3 FAIL, 654 pass, all in `arena-hud-snapshot.test.ts` (Task 11). The client typecheck still fails in 9 files: the arena's (`useArena.ts`, `useArenaCore.ts`, `useTrainingArena.ts`, `ArenaRenderer.ts`, `fx/anticipation.ts`, `fx/draw-world.ts`, `fx/lifecycles.ts`, `pixel/floor-engine.ts`) and `arena-hud-snapshot.test.ts`.

- [ ] **Step 8: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/chains/MoveEditor.tsx packages/client/src/features/delve/chains/ChainEditor.tsx packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/features/delve/training/TrainingPanel.tsx packages/client/src/pages/DelveCamp.tsx packages/client/src/features/delve/ManaPanel.tsx packages/client/src/features/delve/BindPrompt.tsx packages/client/src/features/delve/ManaChoice.tsx packages/client/src/features/delve/PaperDoll.tsx packages/client/src/stores/delveStore.ts packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx packages/client/src/stores/delveStore.test.ts
git add packages/client/src/features/delve/chains/MoveEditor.tsx packages/client/src/features/delve/chains/ChainEditor.tsx packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/features/delve/training/TrainingPanel.tsx packages/client/src/pages/DelveCamp.tsx packages/client/src/features/delve/ManaPanel.tsx packages/client/src/features/delve/BindPrompt.tsx packages/client/src/features/delve/ManaChoice.tsx packages/client/src/features/delve/PaperDoll.tsx packages/client/src/stores/delveStore.ts packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx packages/client/src/stores/delveStore.test.ts
git commit -m "feat(client): the chain builder at the Anvil and in the Training Grounds" -m "The client's typecheck and arena-hud-snapshot.test.ts stay red until Tasks 11-12 move the HUD and the arena to chains." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 17: Client: the HUD and input (Task 11: the tests, the keys and the pad)

### Task 11: The HUD shows chains; input holds and releases

**The HUD snapshot** (`useArenaCore.ts`'s `snapshot`) reads each chain's next move (`nextMove`'s): its name, icon, form, elements, payment and cost, its own cooldown, and for a charge chain the meter over its need. `chainStep`/`chainLength`/`nextKind` replace `comboNext`/`comboLength`, `hold: { charge, stage } | null` is the slot's hold, and `busy` is a channel or a hold (a hold dims the other buttons as a channel does). The attack button's `basicChainStep`, `basicChainLength`, `basicNextKind` and `basicHold` (a manual hold blow held at its strike point) replace `basicComboNext`/`basicComboLength`.

**The buttons** (`ArenaHud.tsx`) show their chain as step dots (`data-chain`: `next` lit), the next move's kind glyph (`data-kind`) and, while holding, a charge bar ticked at the two stages (`data-hold`, `data-stage`); the holding button itself isn't dimmed. The `aria-label` names the next move: "Primary: light Fire Bolt". A release back on the button now calls `onCancel` (the core's `cancelHold`), so a charging hold drops unpaid instead of firing as a lost release. The attack button shows the basic chain the same way.

**Input.** Keyboard and HUD buttons already aim while held and cast on release; `holdingSlot(input)` (the slot aiming) becomes `ArpgInput.holding`, so keydown/pointer-down charges a hold move and keyup/pointer-up is its release `cast`; `ArenaInput.cancelHold` carries the release-back cancel for one step. The controller: `padToArena` reports `holding` (any ability button held, repeat or not), and `padCast(registry, world, acts, released)` decides the frame's cast from the world, not the HUD: a slot whose next move is a hold (or whose hold runs) casts on its button's release (`released`: the core remembers the slot held the frame before) and never on the press or by repeat; any other casts on the press, or with repeat on again whenever `abilityReady`. The core sends `holding`, `cancelHold` and the pad's release, aims the pad and the aim marker with `nextMove`, and loadouts carry `chains` (`refreshWorldHero(…, chains)`).

**Files:**
- Modify: `packages/client/src/features/delve/arena/input.ts:28,45,56,110` (`cancelHold`, `holdingSlot`)
- Modify: `packages/client/src/features/gamepad/arena-pad.ts:1,22,43,50,55` (`holding`, `padCast`)
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts` (the HUD types, `snapshot`, the step input, `padFrame`, the aim views, the loadout, `cancelHold`)
- Modify: `packages/client/src/features/delve/arena/ArenaHud.tsx` (`HoldBar`, `ChainDots`, the buttons, `SkillBar.onCancel`)
- Modify: `packages/client/src/features/delve/arena/useArena.ts:51-59`, `packages/client/src/features/delve/training/useTrainingArena.ts:40,46,56`, `packages/client/src/pages/DelveRun.tsx:274`, `packages/client/src/pages/DelveTraining.tsx:176`
- Test: `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx` (whole file), `arena-hud-snapshot.test.ts` (whole file), `arena-input.test.ts`, `packages/client/src/features/gamepad/__tests__/gamepad.test.ts`

- [ ] **Step 1: Write the failing tests**

The HUD's buttons: the next move's name, the dots, the kind glyph and the hold bar, the holding button undimmed; a press aims, a tap casts, a release back on the button cancels (`performance.now` is mocked; jsdom lays the button out at 0, 0, so releasing at 0, 0 after 500 ms is a release back):

Replace the whole of `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttackButton, SkillBar, Vitals, keyHints, padHints } from '../arena/ArenaHud';
import { DEFAULT_CONTROLS } from '@/features/controls/controls';
import type { AbilityHud, ArenaHud } from '../arena/useArena';

function hud(over: Partial<ArenaHud> = {}): ArenaHud {
  return {
    hp: 100,
    maxHp: 100,
    mana: 50,
    manaMax: 60,
    abilities: [],
    busy: false,
    dodgeCharges: 1,
    dodgeMax: 2,
    dodgeRefill: 0.4,
    riposte: false,
    basicChainStep: 1,
    basicChainLength: 3,
    basicNextKind: 'light',
    basicHold: null,
    potions: 3,
    monstersLeft: 5,
    monstersTotal: 8,
    boss: null,
    cleared: false,
    barrier: null,
    galvanizedAt: null,
    t: 10,
    ...over,
  };
}

/** A light Fire Bolt, ready: the first of a 1-move chain. */
const BOLT: AbilityHud = {
  name: 'Fire Bolt',
  icon: '☄️',
  form: 'bolt',
  element: 'fire',
  elements: ['fire'],
  payment: 'mana',
  cost: 8,
  cooldown: 0,
  cooldownTotal: 5,
  charge: null,
  chainStep: 0,
  chainLength: 1,
  nextKind: 'light',
  hold: null,
  windup: null,
  affordable: true,
  ready: true,
};

function bar(over: Partial<ArenaHud>, on: Partial<Parameters<typeof SkillBar>[0]> = {}) {
  return (
    <SkillBar
      hud={hud(over)}
      onCast={() => {}}
      onAim={() => {}}
      onCancel={() => {}}
      onPotion={() => {}}
      onDodge={() => {}}
      hints={null}
      {...on}
    />
  );
}

describe('the ability buttons', () => {
  it("names each chain's next move and shows its step dots, its kind and a hold's charge", () => {
    const held = { ...BOLT, nextKind: 'hold' as const, chainStep: 1, chainLength: 4 };
    render(
      bar({
        abilities: [{ ...held, hold: { charge: 0.5, stage: 1 } }, BOLT, BOLT],
        busy: true,
      }),
    );
    const button = screen.getByTestId('ability-0');
    expect(button).toHaveAccessibleName('Primary: held Fire Bolt');
    expect(screen.getByTestId('ability-1')).toHaveAccessibleName('Defensive: light Fire Bolt');
    const dots = [...button.querySelectorAll('[data-chain]')];
    expect(dots.map((d) => d.getAttribute('data-chain'))).toEqual(['step', 'next', 'step', 'step']);
    expect(button.querySelector('[data-kind="hold"]')).toHaveTextContent('◉');
    expect(button.querySelector('[data-hold]')).toHaveAttribute('data-stage', '1');
    // The hold dims the others as a channel does, never its own button.
    expect(button.style.opacity).toBe('1');
    expect(screen.getByTestId('ability-1').style.opacity).toBe('0.5');
    expect(screen.getByTestId('ability-1').querySelector('[data-chain]')).toBeNull();
  });

  it('a press aims (a hold move charges meanwhile), a release casts, and a release back on the button cancels', () => {
    const onCast = vi.fn();
    const onAim = vi.fn();
    const onCancel = vi.fn();
    render(bar({ abilities: [BOLT] }, { onCast, onAim, onCancel }));
    const button = screen.getByTestId('ability-0');
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(onAim).toHaveBeenLastCalledWith(0, { x: 0, y: 0 });
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(onCast).toHaveBeenLastCalledWith(0); // a tap auto-aims
    expect(onAim).toHaveBeenLastCalledWith(null);
    // Held past a tap, then let go back on the button (jsdom lays it out at 0, 0).
    fireEvent.pointerDown(button, { pointerId: 2, clientX: 0, clientY: 0 });
    now.mockReturnValue(1500);
    fireEvent.pointerUp(button, { pointerId: 2, clientX: 0, clientY: 0 });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCast).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });
});

describe('SkillBar dodge button', () => {
  it('shows a pip per charge and dodges on press', () => {
    const onDodge = vi.fn();
    render(
      <SkillBar
        hud={hud()}
        onCast={() => {}}
        onAim={() => {}}
        onCancel={() => {}}
        onPotion={() => {}}
        onDodge={onDodge}
        hints={keyHints(DEFAULT_CONTROLS)}
      />,
    );
    const button = screen.getByTestId('dodge-button');
    expect(button).toHaveAttribute('data-charges', '1');
    expect(button.querySelectorAll('[data-pip="full"]')).toHaveLength(1);
    expect(button.querySelectorAll('[data-pip="empty"]')).toHaveLength(1);
    expect(button).toHaveTextContent('Space');
    fireEvent.pointerDown(button);
    expect(onDodge).toHaveBeenCalledTimes(1);
  });

  it('glows while the riposte is armed', () => {
    render(
      <SkillBar
        hud={hud({ riposte: true })}
        onCast={() => {}}
        onAim={() => {}}
        onCancel={() => {}}
        onPotion={() => {}}
        onDodge={() => {}}
        hints={padHints(DEFAULT_CONTROLS)}
      />,
    );
    expect(screen.getByTestId('dodge-button')).toHaveAttribute('data-riposte', 'true');
    expect(screen.getByTestId('dodge-button')).toHaveTextContent('LT');
  });
});

describe('the reactions on the HUD', () => {
  it("shows Obsidian's barrier as a pale segment after the life (over its end at full life)", () => {
    const { rerender } = render(<Vitals hud={hud({ hp: 50, barrier: { hp: 20, max: 30 } })} />);
    const seg = screen.getByTestId('hp-barrier');
    expect(seg.style.left).toBe('50%');
    expect(seg.style.width).toBe('20%');
    rerender(<Vitals hud={hud({ hp: 100, barrier: { hp: 20, max: 30 } })} />);
    expect(screen.getByTestId('hp-barrier').style.left).toBe('80%');
    rerender(<Vitals hud={hud()} />);
    expect(screen.queryByTestId('hp-barrier')).toBeNull();
  });

  it('sparks the buttons still cooling down for 0.4 s after Galvanize', () => {
    const cooling: AbilityHud = { ...BOLT, cooldown: 3, ready: false };
    const abilities = [cooling, { ...cooling, cooldown: 0, ready: true }];
    const galvanize = (galvanizedAt: number | null) => bar({ abilities, galvanizedAt, t: 10 });
    const spark = (slot: number) =>
      screen.getByTestId(`ability-${slot}`).querySelector('[data-spark]');
    const { rerender } = render(galvanize(9.8));
    expect(spark(0)).not.toBeNull();
    expect(spark(1)).toBeNull();
    rerender(galvanize(9.5));
    expect(spark(0)).toBeNull();
    rerender(galvanize(null));
    expect(spark(0)).toBeNull();
  });
});

describe('AttackButton', () => {
  it('holds while pressed and shows the basic chain', () => {
    const onAttack = vi.fn();
    render(<AttackButton hud={hud()} onAttack={onAttack} />);
    const button = screen.getByTestId('attack-button');
    expect(button.querySelectorAll('[data-chain]')).toHaveLength(3);
    expect(button.querySelector('[data-chain="next"]')).not.toBeNull();
    expect(button.querySelector('[data-kind="light"]')).toHaveTextContent('▪');
    fireEvent.pointerDown(button);
    expect(onAttack).toHaveBeenLastCalledWith(true);
    fireEvent.pointerUp(button);
    expect(onAttack).toHaveBeenLastCalledWith(false);
  });

  it('shows one pip per blow of the basic chain, and a held blow charging', () => {
    const basic = { basicChainLength: 2, basicNextKind: 'hold' as const };
    render(
      <AttackButton
        hud={hud({ ...basic, basicHold: { charge: 0.7, stage: 2 } })}
        onAttack={() => {}}
      />,
    );
    const button = screen.getByTestId('attack-button');
    expect(button.querySelectorAll('[data-chain]')).toHaveLength(2);
    expect(button.querySelector('[data-kind="hold"]')).toHaveTextContent('◉');
    expect(button.querySelector('[data-hold]')).toHaveAttribute('data-stage', '2');
  });
});
```

The snapshot, on engine worlds: a channel dims only once it starts; Infinite mana; each chain's next move, its kind and step, its own cooldown and a hold's charge; the basic chain and a manual hold blow's charge:

Replace the whole of `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  beginFloor,
  computeHeroStats,
  createDelveProfile,
  createSandboxWorld,
  defaultChains,
  setChain,
  startDive,
  stepWorld,
  type Chains,
  type HeroStatsExtra,
} from '@alloy/engine';
import { snapshot } from '../arena/useArena';
import { getDelveRegistry } from '../registry';

const registry = getDelveRegistry();
const STEP = registry.getDelveBalance().arena.step;
const still = { x: 0, y: 0 };

/** An empty sandbox arena, unarmed, with these chains over Fire's defaults. */
function sandbox(over: Partial<Chains> = {}, extra: HeroStatsExtra = {}, infiniteMana = false) {
  return createSandboxWorld(registry, {
    depth: 5,
    stats: computeHeroStats({}, registry, extra),
    chains: { ...defaultChains(registry, 'fire', null), ...over },
    toggles: { infiniteMana, noCooldowns: false, invulnerable: false },
  });
}

describe('arena HUD snapshot', () => {
  it('a channelled ability dims the buttons only once its channel starts, not in its conjure', () => {
    let p = createDelveProfile(registry, 99);
    p = setChain(registry, p, 'primary', {
      moves: [{ kind: 'medium', form: 'bolt', elements: ['fire'] }],
      payment: 'cast',
    });
    const w = beginFloor(registry, startDive(registry, p, 1));
    w.hero.nextAttackAt = 1e9;
    stepWorld(registry, w, { move: still, cast: { slot: 0, aim: null } }, STEP);
    const wu = w.hero.windup!;
    expect(w.t).toBeLessThan(wu.conjureUntil);
    let hud = snapshot(w);
    expect(hud.busy).toBe(false);
    expect(hud.abilities[1].ready).toBe(true);
    while (w.t < wu.conjureUntil) stepWorld(registry, w, { move: still }, STEP);
    hud = snapshot(w);
    expect(hud.busy).toBe(true);
    expect(hud.abilities[0].windup).toBeGreaterThanOrEqual(0);
    expect(hud.abilities[1].ready).toBe(false);
  });

  it('under Infinite mana a move dearer than the whole pool shows as affordable, as the engine casts it', () => {
    const ultimate = {
      moves: [{ kind: 'heavy' as const, form: 'nova' as const, elements: ['fire' as const] }],
      payment: 'mana' as const,
    };
    const on = sandbox({ ultimate }, {}, true);
    expect(on.hero.chains[2].moves[0].cost).toBeGreaterThan(on.hero.manaMax);
    expect(snapshot(on).abilities[2].affordable).toBe(true);
    const off = sandbox({ ultimate });
    off.hero.mana = off.hero.manaMax;
    expect(snapshot(off).abilities[2].affordable).toBe(false);
  });

  it("shows each chain's next move: its name, kind and step, its own cooldown, and a hold's charge", () => {
    const w = sandbox({
      primary: {
        moves: [
          { kind: 'light', form: 'bolt', elements: ['fire'] },
          { kind: 'hold', form: 'lance', elements: ['frost'] },
        ],
        payment: 'mana',
      },
    });
    let hud = snapshot(w);
    expect(hud.abilities[0]).toMatchObject({
      name: 'Fire Bolt',
      nextKind: 'light',
      chainStep: 0,
      chainLength: 2,
      hold: null,
    });
    // The light Bolt landed: the next press is the held Lance, on its own cooldown.
    w.hero.comboStep[0] = 0;
    w.hero.comboAt[0] = w.t;
    w.hero.cooldowns[0][0] = w.t + 5;
    hud = snapshot(w);
    expect(hud.abilities[0]).toMatchObject({
      name: 'Frost Lance',
      nextKind: 'hold',
      chainStep: 1,
      cooldown: 0,
    });
    for (let i = 0; i < Math.round(0.5 / STEP); i++)
      stepWorld(registry, w, { move: still, holding: 0 }, STEP);
    hud = snapshot(w);
    expect(hud.abilities[0].hold!.charge).toBeCloseTo(0.5, 1);
    expect(hud.abilities[0].hold!.stage).toBe(1);
    expect(hud.abilities[0].chainStep).toBe(1); // the window waits for the release
    expect(hud.busy).toBe(true);
    expect(hud.abilities[1].ready).toBe(false);
  });

  it("shows the basic chain's next blow and a manual hold blow's charge", () => {
    const sword = sandbox();
    expect(snapshot(sword)).toMatchObject({
      basicChainStep: 0,
      basicChainLength: sword.hero.stats.weapon.blows.length,
      basicNextKind: sword.hero.stats.weapon.blows[0].kind,
      basicHold: null,
    });
    const w = sandbox({}, { basic: [{ kind: 'hold', element: 'fire' }] });
    for (let i = 0; i < 90 && (w.hero.swing?.held ?? null) === null; i++)
      stepWorld(registry, w, { move: still, attack: true }, STEP);
    for (let i = 0; i < Math.round(0.5 / STEP); i++)
      stepWorld(registry, w, { move: still, attack: true }, STEP);
    const hud = snapshot(w);
    expect(hud.basicNextKind).toBe('hold');
    expect(hud.basicHold!.stage).toBe(1);
  });

  it("carries Obsidian's barrier and when Galvanize last fired", () => {
    const w = beginFloor(registry, startDive(registry, createDelveProfile(registry, 99), 1));
    expect(snapshot(w)).toMatchObject({ barrier: null, galvanizedAt: null, t: w.t });
    w.t = 3;
    w.hero.barrier = { hp: 5, max: 8, until: 7 };
    w.hero.reactionReadyAt.galvanize = 2.5;
    const cooldown = registry.getDelveBalance().reactions.reactionCooldown;
    expect(snapshot(w)).toMatchObject({
      barrier: { hp: 5, max: 8 },
      galvanizedAt: 2.5 - cooldown,
      t: 3,
    });
  });
});
```

In `packages/client/src/features/delve/__tests__/arena-input.test.ts`, a held key is `holding` its slot, its release the cast:

Replace:
```ts
import { attachKeyboard, createArenaInput } from '../arena/input';
```
with:
```ts
import { attachKeyboard, createArenaInput, holdingSlot } from '../arena/input';
```

Replace:
```ts
  });

  it('pressing a second ability key while one is held casts the first instead of dropping it', () => {
```
with:
```ts
  });

  it('an ability key held down is holding its slot (a hold move charges); its release casts', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    key('keydown', 'KeyE');
    expect(holdingSlot(input)).toBe(1);
    expect(input.cast).toBeNull();
    key('keyup', 'KeyE');
    expect(holdingSlot(input)).toBeNull();
    expect(input.cast?.slot).toBe(1);
  });

  it('pressing a second ability key while one is held casts the first instead of dropping it', () => {
```

In `packages/client/src/features/gamepad/__tests__/gamepad.test.ts`, `holding`, and `padCast`'s release rule on a sandbox world:

Replace:
```ts
import { edges, radialDeadzone, readPad, type GamepadLike } from '../gamepad';
import { padToArena, stickAimPoint } from '../arena-pad';
```
with:
```ts
import { computeHeroStats, createSandboxWorld, defaultChains, stepWorld } from '@alloy/engine';
import { edges, radialDeadzone, readPad, type GamepadLike } from '../gamepad';
import { padCast, padToArena, stickAimPoint } from '../arena-pad';
import { getDelveRegistry } from '@/features/delve/registry';
```

Before:
```ts
    expect(act([4]).cast).toBe(1); // LB
```
add:
```ts
    expect(act([7]).holding).toBe(0); // and charges a hold move
    expect(act([4]).holding).toBe(1);
    expect(act([]).holding).toBeNull();
```

Replace:
```ts
describe('custom controls', () => {
```
with:
```ts
describe('padCast (a hold casts on its release, read from the world)', () => {
  const registry = getDelveRegistry();
  const STEP = registry.getDelveBalance().arena.step;
  /** A light Bolt then a held Lance on the Primary, the Defensive a single Ward. */
  const world = () =>
    createSandboxWorld(registry, {
      depth: 5,
      stats: computeHeroStats({}, registry),
      chains: {
        ...defaultChains(registry, 'fire', null),
        primary: {
          moves: [
            { kind: 'light', form: 'bolt', elements: ['fire'] },
            { kind: 'hold', form: 'lance', elements: ['fire'] },
          ],
          payment: 'mana',
        },
      },
      toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
    });
  const none = { cast: null, castHeld: null };

  it('a press casts a non-hold next move, and repeat casts it again once ready', () => {
    const w = world();
    expect(padCast(registry, w, { cast: 0, castHeld: 0 }, null)).toBe(0);
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toBe(0);
    expect(padCast(registry, w, none, 0)).toBeNull(); // its release does nothing
    w.hero.cooldowns[0][0] = w.t + 1;
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toBeNull();
    expect(padCast(registry, w, { cast: 0, castHeld: 0 }, null)).toBe(0); // a press always tries
  });

  it("a hold next move ignores the press and repeat, and casts on the button's release", () => {
    const w = world();
    // The light Bolt landed: the next move is the held Lance.
    w.hero.comboStep[0] = 0;
    w.hero.comboAt[0] = w.t;
    expect(padCast(registry, w, { cast: 0, castHeld: 0 }, null)).toBeNull();
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toBeNull();
    stepWorld(registry, w, { move: { x: 0, y: 0 }, holding: 0 }, STEP);
    expect(w.hero.hold?.slot).toBe(0);
    expect(padCast(registry, w, none, 0)).toBe(0);
    expect(padCast(registry, w, none, 1)).toBeNull(); // the Ward isn't a hold
  });
});

describe('custom controls', () => {
```

After:
```ts
    expect(act([4]).castHeld).toBe(1); // LB Defensive repeats
```
add:
```ts
    expect(act([0]).holding).toBe(0); // held, repeat or not
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ArenaHud.test.tsx src/features/delve/__tests__/arena-hud-snapshot.test.ts src/features/delve/__tests__/arena-input.test.ts src/features/gamepad/__tests__/gamepad.test.ts)`
Expected: 14 FAIL, 20 pass: arena-hud-snapshot 5 (Cannot read properties of undefined (reading 'map'), (reading '0'): the snapshot reads `hero.abilities`), ArenaHud 4 ("names each chain's next move …": expect(element).toHaveAccessibleName(); "a press aims …": expected "spy" to be called 1 times, but got 0 times; the two attack-button tests: expected to have a length of 3 (2) but got +0), arena-input 1 ((0 , holdingSlot) is not a function), gamepad 4 (expected undefined to be +0: no `holding` yet; (0 , padCast) is not a function).

- [ ] **Step 3: The keys**

In `packages/client/src/features/delve/arena/input.ts`:

Replace:
```ts
  aiming: Aiming | null;
```
with:
```ts
  /** The key or button held (it aims; a hold move charges while it is). */
  aiming: Aiming | null;
  /** Drop a charging hold unpaid on the next step (an aim released back on its button). */
  cancelHold: boolean;
```

Before:
```ts
    mouse: null,
```
add:
```ts
    cancelHold: false,
```

Replace:
```ts
}

/** The arrow keys always move, whatever else is bound. */
```
with:
```ts
}

/** The ability slot whose key or button is held: a hold move charges while it is, and its release casts. */
export function holdingSlot(input: ArenaInput): number | null {
  return input.aiming?.slot ?? null;
}

/** The arrow keys always move, whatever else is bound. */
```

Replace:
```ts
 * mouse and releasing casts there. Returns a cleanup function.
```
with:
```ts
 * mouse (and charges a hold move) and releasing casts there. Returns a
 * cleanup function.
```

- [ ] **Step 4: The pad**

In `packages/client/src/features/gamepad/arena-pad.ts`:

Replace:
```ts
import type { Vec } from '@alloy/engine';
```
with:
```ts
import {
  abilityReady,
  makeCtx,
  nextMove,
  type ArpgWorld,
  type DataRegistry,
  type Vec,
} from '@alloy/engine';
```

Before:
```ts
  dodge: boolean;
```
add:
```ts
  /** Ability slot whose button is held (repeat or not): a hold move charges while it is. */
  holding: number | null;
```

After:
```ts
  );
```
add:
```ts
  const holding = ABILITY_ACTIONS.findIndex((a) => is(cfg.pad[a], (b) => state.buttons[b]));
```

Before:
```ts
    dodge: is(cfg.pad.dodge, (b) => pressed.has(b)),
```
add:
```ts
    holding: holding >= 0 ? holding : null,
```

Replace:
```ts
  };
}
```
with:
```ts
  };
}

/**
 * The ability slot the controller casts this frame, read from the world (not
 * the HUD snapshot). A slot whose next move is a hold, or whose hold is
 * charging, casts on its button's release (`released`: the slot held last
 * frame and not now), never on the press and never by repeat: the held
 * button charges it. Any other casts on the press, which always tries (so an
 * unaffordable one still says so), or with repeat on, again whenever it's ready.
 */
export function padCast(
  registry: DataRegistry,
  world: ArpgWorld,
  acts: Pick<ArenaPadActions, 'cast' | 'castHeld'>,
  released: number | null,
): number | null {
  const h = world.hero;
  const window = registry.getDelveBalance().abilities.comboWindow;
  const isHold = (slot: number) =>
    h.hold?.slot === slot || nextMove(h, slot, world.t, window).kind === 'hold';
  if (released !== null && isHold(released)) return released;
  if (acts.cast !== null) return isHold(acts.cast) ? null : acts.cast;
  const held = acts.castHeld;
  return held !== null && !isHold(held) && abilityReady(makeCtx(registry, world, []), held)
    ? held
    : null;
}
```

---

## Chunk 18: Client: the HUD and input (Task 11 continued: the core and the buttons)

- [ ] **Step 5: The arena core**

In `packages/client/src/features/delve/arena/useArenaCore.ts`. The imports; the HUD types; the snapshot from the chains (a channel is the wind-up whose active move channels); then, in the effect, the combo window and the pad's last held slot, the step input, the pad frame's cast by `padCast`, the aim views by `nextMove`, the hot-swapped chains, and `cancelHold`:

Replace:
```ts
  abilityReady,
  basicStep,
  canAfford,
  makeCtx,
  pressStep,
  type AbilityBuilds,
  type AbilityCast,
  type ArpgEvent,
  type ArpgWorld,
  type FormId,
  type HeroStats,
  type ManaType,
```
with:
```ts
  activeMove,
  basicStep,
  canAfford,
  holdCharge,
  nextMove,
  pressStep,
  type AbilityCast,
  type ArpgEvent,
  type ArpgWorld,
  type Chains,
  type FormId,
  type HeroStats,
  type ManaType,
  type MoveKind,
```

Before:
```ts
  moveVector,
```
add:
```ts
  holdingSlot,
```

Replace:
```ts
import { padToArena, stickAimPoint, type ArenaPadActions } from '@/features/gamepad/arena-pad';
```
with:
```ts
import {
  padCast,
  padToArena,
  stickAimPoint,
  type ArenaPadActions,
} from '@/features/gamepad/arena-pad';
```

Before:
```ts
  name: string;
```
add:
```ts
  /** The next move's name, icon, form and elements. */
```

Replace:
```ts
  /** Seconds until ready (0 = ready). */
  cooldown: number;
  cooldownTotal: number;
  /** Charge-paid: 0..1 of the meter; otherwise null. */
  charge: number | null;
  /** Press-combo step that the next press makes (0-based), and the combo's length. */
  comboNext: number;
  comboLength: number;
```
with:
```ts
  /** Seconds until the next move is ready (0 = ready). */
  cooldown: number;
  cooldownTotal: number;
  /** Charge-paid: the meter over the next move's need, 0..1; otherwise null. */
  charge: number | null;
  /** The chain's move the next press makes (0-based), the chain's length, and that move's kind. */
  chainStep: number;
  chainLength: number;
  nextKind: MoveKind;
  /** This slot's hold charging: its charge 0..1 and stage 0..2, or null. */
  hold: { charge: number; stage: number } | null;
```

Replace:
```ts
  /** An ability is channelling (presses wait for it). */
```
with:
```ts
  /** An ability is channelling or a hold is charging (presses wait for it). */
```

Replace:
```ts
  /** The blow of the weapon's string that lands next (0-based). */
  basicComboNext: number;
  /** How many blows the weapon's string has. */
  basicComboLength: number;
```
with:
```ts
  /** The basic chain's blow that lands next (0-based), the chain's length, and that blow's kind. */
  basicChainStep: number;
  basicChainLength: number;
  basicNextKind: MoveKind;
  /** A manual hold blow held at its strike point: its charge 0..1 and stage 0..2, or null. */
  basicHold: { charge: number; stage: number } | null;
```

Replace:
```ts
  /** The hero's stats and builds, hot-swapped whenever this object changes: memoise it. */
  loadout: { stats: HeroStats; abilities: AbilityBuilds };
```
with:
```ts
  /** The hero's stats and chains, hot-swapped whenever this object changes: memoise it. */
  loadout: { stats: HeroStats; chains: Chains };
```

Replace:
```ts
  // Only a channel dims the buttons: its conjure is anticipation in the arena, like any other.
  const busy =
    !!h.windup && (h.abilities[h.windup.slot]?.channel ?? 0) > 0 && t >= h.windup.conjureUntil;
```
with:
```ts
  // Only a channel or a hold dims the buttons: a conjure is anticipation in the arena, like any other.
  const w = h.windup;
  const channel = w && (activeMove(h, w.slot)?.channel ?? 0) > 0 && t >= w.conjureUntil ? w : null;
  const busy = !!channel || !!h.hold;
  const blow = basicStep(h, t, bal);
  const held = h.swing?.held ?? null;
```

Replace:
```ts
    abilities: h.abilities.map((ab, i) => {
      const cooldown = Math.max(0, h.cooldowns[i] - t);
      const charged = ab.build.payment !== 'charge' || h.charge[i] >= ab.chargeNeed - 1e-9;
```
with:
```ts
    abilities: h.chains.map((chain, i) => {
      const step = pressStep(h, i, t, comboWindow);
      const ab = chain.moves[step];
      const cooldown = Math.max(0, h.cooldowns[i][step] - t);
      const charged = ab.payment !== 'charge' || h.charge[i] >= ab.chargeNeed - 1e-9;
```

Replace:
```ts
        payment: ab.build.payment,
```
with:
```ts
        payment: ab.payment,
```

Replace:
```ts
          ab.build.payment === 'charge'
            ? Math.min(1, h.charge[i] / Math.max(1e-9, ab.chargeNeed))
            : null,
        comboNext: pressStep(h, i, t, comboWindow),
        comboLength: ab.combo.length,
        // Only a channel shows: a conjure is anticipation in the arena, not a HUD bar.
        windup:
          h.windup?.slot === i && ab.channel > 0 && t >= h.windup.conjureUntil
            ? Math.min(
                1,
                (t - h.windup.conjureUntil) /
                  Math.max(0.01, h.windup.until - h.windup.conjureUntil),
```
with:
```ts
          ab.payment === 'charge' ? Math.min(1, h.charge[i] / Math.max(1e-9, ab.chargeNeed)) : null,
        chainStep: step,
        chainLength: chain.moves.length,
        nextKind: ab.kind,
        hold: h.hold?.slot === i ? holdCharge(bal, h.hold.start, t) : null,
        // Only a channel shows: a conjure is anticipation in the arena, not a HUD bar.
        windup:
          channel?.slot === i
            ? Math.min(
                1,
                (t - channel.conjureUntil) / Math.max(0.01, channel.until - channel.conjureUntil),
```

Replace:
```ts
    basicComboNext: basicStep(h, t, bal),
    basicComboLength: h.stats.weapon.combo.length,
```
with:
```ts
    basicChainStep: blow,
    basicChainLength: h.stats.weapon.blows.length,
    basicNextKind: h.stats.weapon.blows[blow].kind,
    basicHold: held !== null ? holdCharge(bal, held, t) : null,
```

Replace:
```ts
    let hudClock = 0;
```
with:
```ts
    const comboWindow = registry.getDelveBalance().abilities.comboWindow;
    let hudClock = 0;
    /** The ability slot whose pad button was held last frame (its release casts a hold). */
    let padHeld: number | null = null;
```

Before:
```ts
                    potion: input.potion || !!pad?.potion,
```
add:
```ts
                    holding: holdingSlot(input) ?? pad?.holding ?? null,
                    cancelHold: input.cancelHold,
```

Before:
```ts
            input.potion = false;
```
add:
```ts
            input.cancelHold = false;
```

Replace:
```ts
     * dive menu, and an ability press is queued, aimed by the right stick.
```
with:
```ts
     * dive menu, and an ability press (or a hold's release: see `padCast`) is
     * queued, aimed by the right stick.
```

Replace:
```ts
      // A press always tries (so an unaffordable one still says so); holding RT
      // casts the Primary again as soon as it's ready.
      const slot =
        acts.cast ??
        (acts.castHeld !== null && abilityReady(makeCtx(registry, world, []), acts.castHeld)
          ? acts.castHeld
          : null);
      if (slot !== null) {
        const ab = world.hero.abilities[slot];
        const aimWorld =
          acts.aimDir && ab
            ? stickAimPoint(
                world.hero,
                acts.aimDir,
                acts.aimTilt,
                ab.range,
                aimMarkerFor(ab.form.id) === 'circle',
                controls.aimReach,
              )
            : null;
```
with:
```ts
      const released = padHeld !== null && acts.holding !== padHeld ? padHeld : null;
      padHeld = acts.holding;
      const slot = padCast(registry, world, acts, released);
      if (slot !== null) {
        const ab = nextMove(world.hero, slot, world.t, comboWindow);
        const aimWorld = acts.aimDir
          ? stickAimPoint(
              world.hero,
              acts.aimDir,
              acts.aimTilt,
              ab.range,
              aimMarkerFor(ab.form.id) === 'circle',
              controls.aimReach,
            )
          : null;
```

Replace:
```ts
    /** While the right stick is tilted, show where the Primary would go. */
    function padAimView(world: ArpgWorld) {
      const state = padState();
      const ab = world.hero.abilities[0];
      if (!state || !ab || (state.right.x === 0 && state.right.y === 0)) return null;
```
with:
```ts
    /** While the right stick is tilted, show where the Primary's next move would go. */
    function padAimView(world: ArpgWorld) {
      const state = padState();
      if (!state || (state.right.x === 0 && state.right.y === 0)) return null;
      const ab = nextMove(world.hero, 0, world.t, comboWindow);
```

Replace:
```ts
      const ab = a ? world.hero.abilities[a.slot] : undefined;
      if (!a || !r || !ab || performance.now() - a.since < TAP_MS) return null;
```
with:
```ts
      if (!a || !r || performance.now() - a.since < TAP_MS) return null;
      const ab = nextMove(world.hero, a.slot, world.t, comboWindow);
```

Replace:
```ts
  // The loadout changed mid-fight → hot-swap the hero (abilities re-resolve, changed builds swap).
  useEffect(() => {
    const world = worldRef.current;
    if (world && !world.heroDead && !finishedRef.current) {
      refreshWorldHero(registry, world, mode.loadout.stats, mode.loadout.abilities);
```
with:
```ts
  // The loadout changed mid-fight → hot-swap the hero (chains re-resolve, changed moves swap).
  useEffect(() => {
    const world = worldRef.current;
    if (world && !world.heroDead && !finishedRef.current) {
      refreshWorldHero(registry, world, mode.loadout.stats, mode.loadout.chains);
```

Before:
```ts
  /** The HUD attack button: held or released (it auto-aims). */
```
add:
```ts
  /** Drop a charging hold unpaid (an aim released back on its button). */
  const cancelHold = useCallback(() => {
    inputRef.current.cancelHold = true;
  }, []);
```

Before:
```ts
    attack,
```
add:
```ts
    cancelHold,
```

- [ ] **Step 6: The buttons**

In `packages/client/src/features/delve/arena/ArenaHud.tsx`. The chain texts import; `HoldBar` and `ChainDots` before `AbilityButton`, which gains `onCancel`, names its next move, shows its kind, dots and hold bar, and keeps a holding button undimmed; the attack button's glyph, dots and hold bar; `SkillBar` passes `onCancel` down:

Before:
```tsx
import { classifyPress, isCancelled } from './aim-gestures';
```
add:
```tsx
import { KIND_ICON, moveText } from '../chains/chain-text';
```

Replace:
```tsx
/**
 * One ability button. A quick tap auto-aims; dragging out shows the aim
 * marker in the arena and releasing casts there (release back on the button
 * to cancel).
```
with:
```tsx
/** A hold's charge filling above its button, ticked at the stages (`data-stage`: the stage reached). */
function HoldBar({ hold, color }: { hold: { charge: number; stage: number }; color: string }) {
  const stages = getDelveRegistry().getDelveBalance().chains.holdStages;
  return (
    <span
      className="absolute -top-2 left-1 right-1 h-1 overflow-hidden rounded-full bg-black/70"
      data-hold
      data-stage={hold.stage}
    >
      <span
        className="block h-full"
        style={{
          width: `${hold.charge * 100}%`,
          background: color,
          opacity: 0.55 + 0.225 * hold.stage,
        }}
      />
      {stages.map((s) => (
        <span
          key={s}
          className="absolute inset-y-0 w-px bg-white/70"
          style={{ left: `${s * 100}%` }}
        />
      ))}
    </span>
  );
}

/** A chain's step dots under its button, the next one lit (`data-chain`: next or step). */
function ChainDots({ step, length, color }: { step: number; length: number; color: string }) {
  if (length < 2) return null;
  return (
    <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5" aria-hidden>
      {Array.from({ length }, (_, k) => (
        <span
          key={k}
          data-chain={k === step ? 'next' : 'step'}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: k === step ? color : 'rgba(255,255,255,0.25)' }}
        />
      ))}
    </span>
  );
}

/**
 * One ability button: its chain's next move, the step dots, that move's kind
 * and a hold's charge. A quick tap auto-aims; dragging out shows the aim
 * marker in the arena and releasing casts there (release back on the button
 * to cancel). While it's held a hold move charges, and the release casts it
 * (release back cancels it unpaid).
```

Before:
```tsx
}: {
  slot: number;
```
add:
```tsx
  onCancel,
```

Before:
```tsx
}) {
  const registry = getDelveRegistry();
```
add:
```tsx
  onCancel: () => void;
```

Replace:
```tsx
    if (!isCancelled({ x: e.clientX, y: e.clientY }, button))
      onCast(slot, { x: e.clientX, y: e.clientY });
```
with:
```tsx
    if (isCancelled({ x: e.clientX, y: e.clientY }, button)) onCancel();
    else onCast(slot, { x: e.clientX, y: e.clientY });
```

Replace:
```tsx
      aria-label={`${SLOT_LABEL[slot]}: ${ab.name}`}
```
with:
```tsx
      aria-label={`${SLOT_LABEL[slot]}: ${moveText({ kind: ab.nextKind, name: ab.name })}`}
```

Replace:
```tsx
        opacity: busy && ab.windup === null ? 0.5 : ab.affordable ? 1 : 0.55,
```
with:
```tsx
        opacity: busy && ab.windup === null && ab.hold === null ? 0.5 : ab.affordable ? 1 : 0.55,
```

Before:
```tsx
        <span className="text-2xl leading-none">{ab.icon}</span>
```
add:
```tsx
        <span
          className="absolute top-1.5 text-[8px] leading-none text-stone-300"
          data-kind={ab.nextKind}
        >
          {KIND_ICON[ab.nextKind]}
        </span>
```

Replace:
```tsx
      {ab.comboLength > 1 && (
        <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5" aria-hidden>
          {Array.from({ length: ab.comboLength }, (_, k) => (
            <span
              key={k}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: k === ab.comboNext ? color : 'rgba(255,255,255,0.25)' }}
            />
          ))}
        </span>
      )}
```
with:
```tsx
      <ChainDots step={ab.chainStep} length={ab.chainLength} color={color} />
      {ab.hold !== null && <HoldBar hold={ab.hold} color={color} />}
```

Replace:
```tsx
 * show which blow of the weapon's string lands next.
```
with:
```tsx
 * show which blow of the basic chain lands next, a glyph its kind, and a bar
 * a held blow's charge.
```

Replace:
```tsx
        className="flex h-full w-full items-center justify-center rounded-full text-3xl"
        style={{ background: 'radial-gradient(circle at 50% 35%, #2c2c3c, #121219)' }}
      >
        ⚔️
```
with:
```tsx
        className="relative flex h-full w-full items-center justify-center rounded-full text-3xl"
        style={{ background: 'radial-gradient(circle at 50% 35%, #2c2c3c, #121219)' }}
      >
        ⚔️
        {hud && (
          <span
            className="absolute top-1.5 text-[8px] leading-none text-stone-300"
            data-kind={hud.basicNextKind}
          >
            {KIND_ICON[hud.basicNextKind]}
          </span>
        )}
```

Replace:
```tsx
      {hud && hud.basicComboLength > 1 && (
        <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5" aria-hidden>
          {Array.from({ length: hud.basicComboLength }, (_, k) => (
            <span
              key={k}
              data-combo={k === hud.basicComboNext ? 'next' : 'step'}
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: k === hud.basicComboNext ? '#fde047' : 'rgba(255,255,255,0.25)',
              }}
            />
          ))}
        </span>
      )}
```
with:
```tsx
      {hud && <ChainDots step={hud.basicChainStep} length={hud.basicChainLength} color="#fde047" />}
      {hud?.basicHold && <HoldBar hold={hud.basicHold} color="#fde047" />}
```

Before:
```tsx
  onPotion,
```
add:
```tsx
  onCancel,
```

Before:
```tsx
  onPotion: () => void;
```
add:
```tsx
  /** An aim released back on its button: drop a charging hold unpaid. */
  onCancel: () => void;
```

After:
```tsx
          onAim={onAim}
```
add:
```tsx
          onCancel={onCancel}
```

- [ ] **Step 7: The modes and the pages**

In `packages/client/src/features/delve/arena/useArena.ts`, the dive's loadout carries the save's chains:

Replace:
```ts
  const { equipped, pair } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [equipped, pair, registry],
  );
  const loadout = useMemo(
    () => ({ stats, abilities: profile.abilities }),
    [stats, profile.abilities],
  );
```
with:
```ts
  const { equipped, pair, chains } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair, chains }),
    [equipped, pair, chains, registry],
  );
  const loadout = useMemo(() => ({ stats, chains }), [stats, chains]);
```

In `packages/client/src/features/delve/training/useTrainingArena.ts`, the sandbox's:

Replace:
```ts
  const abilities = useSandboxStore((s) => s.abilities);
```
with:
```ts
  const chains = useSandboxStore((s) => s.chains);
```

Replace:
```ts
  const loadout = useMemo(() => ({ stats, abilities }), [stats, abilities]);
```
with:
```ts
  const loadout = useMemo(() => ({ stats, chains }), [stats, chains]);
```

Replace:
```ts
        abilities: loadout.abilities,
```
with:
```ts
        chains: loadout.chains,
```

In `packages/client/src/pages/DelveRun.tsx`:

Before:
```tsx
            onPotion={arena.potion}
```
add:
```tsx
            onCancel={arena.cancelHold}
```

In `packages/client/src/pages/DelveTraining.tsx`:

Before:
```tsx
              onPotion={arena.potion}
```
add:
```tsx
              onCancel={arena.cancelHold}
```

- [ ] **Step 8: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (34).

Run: `(cd packages/client && npx vitest run)`
Expected: all 664 tests pass. The client typecheck still fails in 5 files, the arena FX (`ArenaRenderer.ts`, `fx/anticipation.ts`, `fx/draw-world.ts`, `fx/lifecycles.ts`, `pixel/floor-engine.ts`): Task 12.

- [ ] **Step 9: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/arena/input.ts packages/client/src/features/gamepad/arena-pad.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/ArenaHud.tsx packages/client/src/features/delve/arena/useArena.ts packages/client/src/features/delve/training/useTrainingArena.ts packages/client/src/pages/DelveRun.tsx packages/client/src/pages/DelveTraining.tsx packages/client/src/features/delve/__tests__/ArenaHud.test.tsx packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts packages/client/src/features/delve/__tests__/arena-input.test.ts packages/client/src/features/gamepad/__tests__/gamepad.test.ts
git add packages/client/src/features/delve/arena/input.ts packages/client/src/features/gamepad/arena-pad.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/ArenaHud.tsx packages/client/src/features/delve/arena/useArena.ts packages/client/src/features/delve/training/useTrainingArena.ts packages/client/src/pages/DelveRun.tsx packages/client/src/pages/DelveTraining.tsx packages/client/src/features/delve/__tests__/ArenaHud.test.tsx packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts packages/client/src/features/delve/__tests__/arena-input.test.ts packages/client/src/features/gamepad/__tests__/gamepad.test.ts
git commit -m "feat(client): the HUD shows each chain's step, next kind and a hold's charge; keys, buttons and the pad hold and release" -m "The client's typecheck stays red until Task 12 moves the arena FX to chains (every client test passes)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 19: Client: the arena FX

### Task 12: The arena FX read moves and blows

Display only. A basic blow draws its kind's row (`feel[moveKind]`: a held blow's is its stage's) in its own element; heavy and hold blows swing as finishers and ring out in their own element (`finisherRing` keys on `moveKind`; the secondary's discharge is gone), and the basic motif (`basicMotif`, a basic shot's infusion) goes: a blow has one element. The guard FX (the Ward, Armor, Surge and Blink-trail rings, the dissolving guard, the Defensive's infusion aura) and the channel ring read `activeMove`; the hero's aura, footing ring and pixel-floor light take the first blow's element. `windingUp` reads the active move: a committed swing winds up in its blow's element with its heft; a manual blow held at its strike point gathers with its charge (progress is the charge, heft its stage's row's); an ability's hold gathers with its charge toward its aim, as heavy as its stage's move (`stepHeft(chainMove(…, stage))`); a wind-up takes `stepHeft` of the move winding up. A `holdStage` event pings a ring round the hero in the held move's element, wider at stage 2 (`holdPing`).

**Files:**
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts:2-13,355-378,416,530,655,888` (the imports, `basic`, `holdStage`, `guardColor`, the aura, `holdPing`)
- Modify: `packages/client/src/features/delve/arena/fx/anticipation.ts` (whole file)
- Modify: `packages/client/src/features/delve/arena/fx/draw-world.ts:4,10,225,270,299,461-487`, `fx/mana-fx.ts:1,129-139`, `fx/lifecycles.ts:1,56`, `fx/infusion.ts:94-105`, `pixel/floor-engine.ts:132`
- Test: `packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts` (whole file), `mana-fx.test.ts`, `lifecycles.test.ts`, `reactions.test.ts`, `infusion.test.ts`, `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`

- [ ] **Step 1: Write the failing tests**

The FX tests build hand-made worlds; they gain the fields the FX read now (`chains` with `moves` and `hold`, `defend.move`/`stage`, `hold`, `weapon.blows`/`feel`):

Replace the whole of `packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import type { ArpgWorld } from '@alloy/engine';
import { windingUp } from '../anticipation';
import { MANA_HEX } from '../../palette';
import { getDelveRegistry } from '../../../registry';

const ROW = { time: 1, startup: 0.3, move: 0.4, power: 1, heft: 0.8 };
const FEEL = {
  light: ROW,
  medium: { ...ROW, heft: 0.5 },
  heavy: { ...ROW, heft: 0.8 },
  hold: { ...ROW, heft: 1 },
};
const BLOW = { ...ROW, kind: 'light', element: 'fire', attunePower: 1 };
const { holdTime } = getDelveRegistry().getDelveBalance().chains;

function world(over: Partial<ArpgWorld['hero']>): ArpgWorld {
  return {
    t: 1,
    hero: {
      x: 5,
      y: 5,
      facing: { x: 0, y: -1 },
      swing: null,
      windup: null,
      hold: null,
      defend: null,
      chains: [],
      stats: { weapon: { blows: [BLOW], feel: FEEL } },
      ...over,
    },
  } as unknown as ArpgWorld;
}

const swing = {
  step: 0,
  dir: { x: 1, y: 0 },
  targetId: null,
  start: 0.9,
  strikeAt: 1.1,
  committed: true,
  held: null,
};

describe('windingUp', () => {
  it('reports a committed swing with its heft and progress', () => {
    const a = windingUp(world({ swing } as never))!;
    expect(a.heft).toBeCloseTo(0.8);
    expect(a.progress).toBeCloseTo(0.5);
    expect(a.dir).toEqual({ x: 1, y: 0 });
  });

  it("reports a wind-up with its move's heft (+0.2 for a chain's last), toward where it aims", () => {
    const winding = (last: boolean) =>
      windingUp(
        world({
          chains: [{ moves: [{ element: 'frost', heft: 0.45, last }], hold: [null] }],
          windup: {
            slot: 0,
            aim: null,
            at: { x: 5, y: 9 },
            start: 0.9,
            until: 1.3,
            step: 0,
            conjureUntil: 1.3,
            chargePaid: 0,
          },
        } as never),
      )!;
    const a = winding(false);
    expect(a.heft).toBeCloseTo(0.45);
    expect(a.dir).toEqual({ x: 0, y: 1 });
    expect(a.progress).toBeCloseTo(0.25);
    expect(a.color).toBe(MANA_HEX.frost);
    expect(winding(true).heft).toBeCloseTo(0.65);
  });

  it('ignores an uncommitted swing and idle heroes', () => {
    expect(windingUp(world({ swing: { ...swing, committed: false } } as never))).toBeNull();
    expect(windingUp(world({}))).toBeNull();
  });

  it('a blow winds up in its own element', () => {
    const blows = [BLOW, { ...BLOW, kind: 'heavy', element: 'storm' }];
    const colour = (step: number) =>
      windingUp(
        world({ swing: { ...swing, step }, stats: { weapon: { blows, feel: FEEL } } } as never),
      )!.color;
    expect(colour(1)).toBe(MANA_HEX.storm);
    expect(colour(0)).toBe(MANA_HEX.fire);
  });

  it('a hold gathers with its charge, as heavy as the stage it has reached', () => {
    const stage = (heft: number) => ({ element: 'nature', heft, last: false });
    const a = windingUp(
      world({
        chains: [{ moves: [stage(0.45)], hold: [[stage(0.45), stage(0.6), stage(0.9)]] }],
        hold: { slot: 0, step: 0, start: 1 - 0.5 * holdTime, aim: { x: 9, y: 5 } },
      } as never),
    )!;
    expect(a.progress).toBeCloseTo(0.5);
    expect(a.heft).toBeCloseTo(0.6); // stage 1
    expect(a.dir).toEqual({ x: 1, y: 0 });
    expect(a.color).toBe(MANA_HEX.nature);
  });

  it("a manual blow held at its strike point gathers with its charge, as its stage's row", () => {
    const held = { ...swing, strikeAt: 0.1, held: 1 - 0.8 * holdTime };
    const a = windingUp(world({ swing: held } as never))!;
    expect(a.progress).toBeCloseTo(0.8);
    expect(a.heft).toBeCloseTo(FEEL.hold.heft); // stage 2
  });
});
```

In `packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts`, the hand's and the infusion pass's worlds hold chains, a basic shot draws no motif, and `finisherRing` keys on the blow's kind:

Replace:
```ts
      abilities: [{ element: 'frost', heft: 0.45, combo: [1] }],
```
with:
```ts
      hold: null,
      chains: [{ moves: [{ element: 'frost', heft: 0.45, last: false }], hold: [null] }],
```

Replace:
```ts
      stats: { weapon: { combo: [], element: null } },
```
with:
```ts
      stats: { weapon: { blows: [], feel: {} } },
```

Before:
```ts
  const plainHero = {
```
add:
```ts
  /** A one-move chain of that move. */
  const chain = (move: object) => ({ moves: [move], hold: [null] });
```

Replace:
```ts
    abilities: [one, one],
    stats: { weapon: { infusion: null } },
```
with:
```ts
    windup: null,
    hold: null,
    chains: [chain(one), chain(one)],
```

Replace:
```ts
  it("gives a basic shot the weapon's infusion, unless the shot is that element already", () => {
    const basic = shot({ form: null, ability: null, element: 'fire' });
    expect(used(world({ projectiles: [basic] }))).toBe(0);
    const infused = { ...plainHero, stats: { weapon: { infusion: 'nature' } } };
    expect(used(world({ projectiles: [basic], hero: infused }))).toBeGreaterThan(0);
    // A finisher's shot is the secondary's own body: no motif on top.
    expect(used(world({ projectiles: [{ ...basic, element: 'nature' }], hero: infused }))).toBe(0);
```
with:
```ts
  it('draws no motif on a basic shot: a blow has one element', () => {
    for (const element of ['fire', 'nature'])
      expect(used(world({ projectiles: [shot({ form: null, ability: null, element })] }))).toBe(0);
```

Replace:
```ts
      defend: { form: 'ward', until: 3 },
      ward: { hp: 1, max: 1 },
      abilities: [one, two],
    };
    expect(used(world({ hero: guarded }))).toBeGreaterThan(0);
    expect(used(world({ hero: { ...guarded, ward: null } }))).toBe(0); // a broken Ward
    expect(
      used(world({ hero: { ...guarded, defend: { form: 'blink', until: 3 } } })),
    ).toBeGreaterThan(0);
    expect(used(world({ hero: { ...guarded, defend: { form: 'blink', until: 0.5 } } }))).toBe(0);
    expect(used(world({ hero: { ...guarded, abilities: [one, one] } }))).toBe(0); // one element
```
with:
```ts
      defend: { form: 'ward', until: 3, move: 0, stage: 0 },
      ward: { hp: 1, max: 1 },
      chains: [chain(one), chain(two)],
    };
    const blink = (until: number) => ({ form: 'blink', until, move: 0, stage: 0 });
    expect(used(world({ hero: guarded }))).toBeGreaterThan(0);
    expect(used(world({ hero: { ...guarded, ward: null } }))).toBe(0); // a broken Ward
    expect(used(world({ hero: { ...guarded, defend: blink(3) } }))).toBeGreaterThan(0);
    expect(used(world({ hero: { ...guarded, defend: blink(0.5) } }))).toBe(0);
    expect(used(world({ hero: { ...guarded, chains: [chain(one), chain(one)] } }))).toBe(0); // one element
```

Replace:
```ts
      defend: { form: 'ward', until: 3 },
      ward: { hp: 1, max: 1 },
      abilities: [one, two],
```
with:
```ts
      defend: { form: 'ward', until: 3, move: 0, stage: 0 },
      ward: { hp: 1, max: 1 },
      chains: [chain(one), chain(two)],
```

Replace:
```ts
  const blow = { x: 2, y: 3, dir: { x: 0, y: -1 }, heft: 1, melee: true, finisher: true };

  it('rings the tip of a melee finisher, or the hero for a full circle', () => {
```
with:
```ts
  const blow = {
    x: 2,
    y: 3,
    dir: { x: 0, y: -1 },
    heft: 1,
    melee: true,
    moveKind: 'heavy' as const,
  };

  it('rings the tip of a heavy or hold blow, or the hero for a full circle', () => {
```

Replace:
```ts
  });

  it('flares at the hand for a ranged finisher; none for a plain blow', () => {
    const flare = finisherRing({ ...blow, melee: false }, Math.PI / 2, 1.6)!;
    expect(flare).toMatchObject({ kind: 'ring', x: 2, r: 0.6 });
    expect(flare.y).toBeCloseTo(3 - 0.3 - HAND); // chest height, HAND toward the aim (up)
    expect(finisherRing({ ...blow, finisher: false }, Math.PI / 2, 1.6)).toBeNull();
    expect(finisherRing({ ...blow, melee: false, finisher: false }, Math.PI / 2, 1.6)).toBeNull();
```
with:
```ts
    expect(finisherRing({ ...blow, moveKind: 'hold' }, Math.PI * 2, 1.6)).not.toBeNull();
  });

  it('flares at the hand for a ranged heavy blow; none for a light or medium one', () => {
    const flare = finisherRing({ ...blow, melee: false }, Math.PI / 2, 1.6)!;
    expect(flare).toMatchObject({ kind: 'ring', x: 2, r: 0.6 });
    expect(flare.y).toBeCloseTo(3 - 0.3 - HAND); // chest height, HAND toward the aim (up)
    for (const moveKind of ['light', 'medium'] as const) {
      expect(finisherRing({ ...blow, moveKind }, Math.PI / 2, 1.6)).toBeNull();
      expect(finisherRing({ ...blow, melee: false, moveKind }, Math.PI / 2, 1.6)).toBeNull();
    }
```

In `packages/client/src/features/delve/arena/fx/__tests__/lifecycles.test.ts`:

Before:
```ts
function world(over: Partial<ArpgWorld>): ArpgWorld {
```
add:
```ts
/** A one-move Frost chain; the Defensive's is up while `defend` names its move. */
const frost = { moves: [{ element: 'frost' }], hold: [null] };
const ward = { form: 'ward', until: 5, move: 0, stage: 0 };
```

Replace:
```ts
    hero: { x: 0, y: 0, defend: null, abilities: [{ element: 'frost' }, { element: 'frost' }] },
```
with:
```ts
    hero: { x: 0, y: 0, defend: null, chains: [frost, frost] },
```

Replace:
```ts
          defend: { form: 'ward', until: 5 },
          abilities: [{}, { element: 'frost' }],
```
with:
```ts
          defend: ward,
          chains: [frost, frost],
```

Replace:
```ts
      defend: { form: 'ward', until: 5 },
      abilities: [{}, { element: 'frost' }],
```
with:
```ts
      defend: ward,
      chains: [frost, frost],
```

In `packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts`, the hero `drawGuard` reads:

Replace:
```ts
      abilities: [],
```
with:
```ts
      chains: [],
      hold: null,
```

In `packages/client/src/features/delve/arena/fx/__tests__/infusion.test.ts`, `basicMotif`'s test goes with it:

Replace:
```ts
  basicMotif,
  drawInfusion,
```
with:
```ts
  drawInfusion,
```

Replace:
```ts
});

describe('basicMotif', () => {
  it("draws the weapon's infusion on a blow of another element, and none on a blow of that element", () => {
    expect(basicMotif({ infusion: 'storm' }, 'fire')).toBe('storm');
    expect(basicMotif({ infusion: 'storm' }, 'storm')).toBeNull(); // a finisher's discharge
    expect(basicMotif({ infusion: null }, 'fire')).toBeNull();
  });
});
```
with:
```ts
});
```

In `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`:

Replace:
```ts
import type { ArpgEvent, Drop } from '@alloy/engine';
import { drawDrop, dropPop, pickupColor, pruneViews } from '../arena/ArenaRenderer';
```
with:
```ts
import type { ArpgEvent, ArpgWorld, Drop } from '@alloy/engine';
import { drawDrop, dropPop, holdPing, pickupColor, pruneViews } from '../arena/ArenaRenderer';
```

Replace:
```ts
  });
});
```
with:
```ts
  });

  it("a hold's stage pings a ring in the held move's element (a held blow's for the basic), wider at stage 2", () => {
    const w = {
      hero: {
        chains: [{ moves: [{ element: 'frost' }], hold: [null] }],
        hold: { slot: 0, step: 0, start: 0, aim: null },
        windup: null,
        swing: { step: 1 },
        stats: { weapon: { blows: [{ element: 'fire' }, { element: 'storm' }] } },
      },
    } as unknown as ArpgWorld;
    const ability = holdPing(w, { slot: 0, stage: 1 });
    expect(ability.color).toBe(MANA_HEX.frost);
    expect(ability.r).toBeCloseTo(1.2);
    const blow = holdPing(w, { slot: null, stage: 2 });
    expect(blow.color).toBe(MANA_HEX.storm);
    expect(blow.r).toBeCloseTo(1.6);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/fx src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: 20 FAIL, 58 pass: anticipation 5 (Cannot read properties of undefined (reading '0'): `windingUp` reads `weapon.combo`/`hero.abilities`; "a hold gathers …": Cannot read properties of null (reading 'progress')), mana-fx 9 (Cannot read properties of undefined (reading '1') / (reading '0'); `finisherRing`: expected null to deeply equal { kind: 'ring', x: 2, y: 1.4, r: 1.2 }), lifecycles 3 and reactions 2 (Cannot read properties of undefined (reading '1')), arena-renderer 1 ((0 , holdPing) is not a function).

- [ ] **Step 3: Anticipation**

Replace the whole of `packages/client/src/features/delve/arena/fx/anticipation.ts` with:

```ts
import {
  HOLD_STAGE_KINDS,
  activeMove,
  chainMove,
  holdCharge,
  stepHeft,
  type ArpgWorld,
  type Vec,
} from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { MANA_HEX } from '../palette';

export interface WindingUp {
  /** Toward the target (unit vector). */
  dir: Vec;
  heft: number;
  /** 0 at the press, 1 at the strike or release. */
  progress: number;
  color: number;
}

/** From the hero toward `at` (unit vector), or its facing when there. */
function toward(w: ArpgWorld, at: Vec): Vec {
  const h = w.hero;
  const dx = at.x - h.x;
  const dy = at.y - h.y;
  const len = Math.hypot(dx, dy);
  return len > 1e-6 ? { x: dx / len, y: dy / len } : { ...h.facing };
}

/**
 * The action the hero is winding up right now (a committed swing, an ability
 * or a hold charging), or null. A blow winds up in its own element; a hold
 * (an ability's, or a manual blow held at its strike point) gathers with its
 * charge, as heavy as the stage it has reached.
 */
export function windingUp(w: ArpgWorld): WindingUp | null {
  const h = w.hero;
  const bal = getDelveRegistry().getDelveBalance();
  if (h.swing?.committed) {
    const wpn = h.stats.weapon;
    const blow = wpn.blows[h.swing.step];
    const color = MANA_HEX[blow.element];
    if (h.swing.held !== null) {
      const { charge, stage } = holdCharge(bal, h.swing.held, w.t);
      const heft = wpn.feel[HOLD_STAGE_KINDS[stage]].heft ?? 0.3;
      return { dir: h.swing.dir, heft, progress: charge, color };
    }
    const span = Math.max(1e-6, h.swing.strikeAt - h.swing.start);
    return {
      dir: h.swing.dir,
      heft: blow.heft ?? 0.3,
      progress: Math.min(1, Math.max(0, (w.t - h.swing.start) / span)),
      color,
    };
  }
  if (h.hold) {
    const { charge, stage } = holdCharge(bal, h.hold.start, w.t);
    const ab = chainMove(h.chains[h.hold.slot], h.hold.step, stage);
    return {
      dir: h.hold.aim ? toward(w, h.hold.aim) : { ...h.facing },
      heft: stepHeft(ab),
      progress: charge,
      color: MANA_HEX[ab.element],
    };
  }
  if (h.windup) {
    const ab = activeMove(h, h.windup.slot);
    if (!ab) return null;
    const span = Math.max(1e-6, h.windup.until - h.windup.start);
    return {
      dir: toward(w, h.windup.at),
      heft: stepHeft(ab),
      progress: Math.min(1, Math.max(0, (w.t - h.windup.start) / span)),
      color: MANA_HEX[ab.element],
    };
  }
  return null;
}
```

- [ ] **Step 4: The blows, the guard and the hold's ping**

In `packages/client/src/features/delve/arena/fx/mana-fx.ts`, `finisherRing` rings out a heavy or hold blow:

Replace:
```ts
import type { ManaType, Vec } from '@alloy/engine';
```
with:
```ts
import type { ManaType, MoveKind, Vec } from '@alloy/engine';
```

Replace:
```ts
 * Where a basic finisher discharges the secondary: a ring at the blade's tip
 * (`reach` out along `dir`, sized by heft), round the hero at `reach` for a
 * full-circle blow, or, for a shot (no tip), a flare at the hand (r 0.6).
 * `arc` is in radians.
 */
export function finisherRing(
  e: { x: number; y: number; dir: Vec; heft: number; melee: boolean; finisher: boolean },
  arc: number,
  reach: number,
): RingShape | null {
  if (!e.finisher) return null;
```
with:
```ts
 * Where a heavy or hold basic blow rings out in its element: a ring at the
 * blade's tip (`reach` out along `dir`, sized by heft), round the hero at
 * `reach` for a full-circle blow, or, for a shot (no tip), a flare at the hand
 * (r 0.6); none for a light or medium blow. `arc` is in radians.
 */
export function finisherRing(
  e: { x: number; y: number; dir: Vec; heft: number; melee: boolean; moveKind: MoveKind },
  arc: number,
  reach: number,
): RingShape | null {
  if (e.moveKind !== 'heavy' && e.moveKind !== 'hold') return null;
```

In `packages/client/src/features/delve/arena/fx/infusion.ts`, `basicMotif` goes:

Replace:
```ts
}

/**
 * The motif a basic blow or shot of `element` draws: the weapon's infusion
 * (the hero's secondary), unless the blow already is that element (a
 * finisher's discharge), so it never draws twice.
 */
export function basicMotif(
  weapon: { infusion: ManaType | null },
  element: ManaType | null,
): ManaType | null {
  return weapon.infusion !== element ? weapon.infusion : null;
}
```
with:
```ts
}
```

In `packages/client/src/features/delve/arena/fx/draw-world.ts`, the footing ring's colour, the guard and the channel from `activeMove`, and only ability shots carry an infusion:

Before:
```ts
  type ArpgWorld,
```
add:
```ts
  activeMove,
```

Replace:
```ts
import { basicMotif, drawInfusion, type InfusionBudget, type InfusionLayers } from './infusion';
```
with:
```ts
import { drawInfusion, type InfusionBudget, type InfusionLayers } from './infusion';
```

Replace:
```ts
  const color = h.stats.weapon.element ? MANA_HEX[h.stats.weapon.element] : 0xd4a834;
```
with:
```ts
  const color = MANA_HEX[h.stats.weapon.blows[0].element];
```

Replace:
```ts
  const guard = h.abilities[1];
```
with:
```ts
  const guard = activeMove(h, 1);
```

Replace:
```ts
    const ab = h.abilities[h.windup.slot];
```
with:
```ts
    const ab = activeMove(h, h.windup.slot);
```

Replace:
```ts
/** A hero shot's infusion: its ability's second element, or for a basic shot the weapon's (none when the shot is that element: a finisher's discharge). Embers have none. */
function shotInfusion(w: ArpgWorld, p: Projectile): ManaType | null {
  if (p.owner !== 'hero' || p.form === 'ember') return null;
  return p.ability ? (p.ability.elements[1] ?? null) : basicMotif(w.hero.stats.weapon, p.element);
}

/**
```
with:
```ts
/**
```

Replace:
```ts
  const aura = h.abilities[1]?.elements[1];
```
with:
```ts
  const aura = activeMove(h, 1)?.elements[1];
```

Replace:
```ts
    const el = shotInfusion(w, p);
```
with:
```ts
    // An ability shot's second element (a basic shot has one element; embers none).
    const el = p.owner === 'hero' && p.form !== 'ember' ? p.ability?.elements[1] : undefined;
```

In `packages/client/src/features/delve/arena/fx/lifecycles.ts`:

Replace:
```ts
import type { ArpgWorld } from '@alloy/engine';
```
with:
```ts
import { activeMove, type ArpgWorld } from '@alloy/engine';
```

Replace:
```ts
    const el = h.abilities[1]?.element;
```
with:
```ts
    const el = activeMove(h, 1)?.element;
```

In `packages/client/src/features/delve/arena/pixel/floor-engine.ts`:

Replace:
```ts
    hero: { x: w.hero.x, y: w.hero.y, element: w.hero.stats.weapon.element },
```
with:
```ts
    hero: { x: w.hero.x, y: w.hero.y, element: w.hero.stats.weapon.blows[0].element },
```

In `packages/client/src/features/delve/arena/ArenaRenderer.ts`, the engine import becomes a value import (`activeMove`), the basic swing reads its blow, `holdStage` pings, the guard's colour is the active Defensive move's, the aura the first blow's, and `holdPing` joins the exported helpers:

Replace:
```ts
import type {
  ArpgEvent,
  ArpgWorld,
  BiomeDef,
  Drop,
  ManaType,
  MonsterEntity,
  Vec,
} from '@alloy/engine';
import { PixelLayer, type ViewRect } from './fx/pixel-layer';
import { ManaFx, finisherRing } from './fx/mana-fx';
import { INFUSION_BUDGET, basicMotif, type InfusionBudget } from './fx/infusion';
```
with:
```ts
import {
  activeMove,
  type ArpgEvent,
  type ArpgWorld,
  type BiomeDef,
  type Drop,
  type ManaType,
  type MonsterEntity,
  type Vec,
} from '@alloy/engine';
import { PixelLayer, type ViewRect } from './fx/pixel-layer';
import { ManaFx, finisherRing } from './fx/mana-fx';
import { INFUSION_BUDGET, type InfusionBudget } from './fx/infusion';
```

Replace:
```ts
          const wpn = w.hero.stats.weapon;
          const s = wpn.combo[e.step] ?? wpn.combo[0];
          const arc = Math.min(360, s.arc ?? wpn.arc) * (Math.PI / 180);
          const range = wpn.range + (s.reach ?? 0) + 0.2;
```
with:
```ts
          // The row the blow struck with (a manual hold blow's: its stage's).
          const wpn = w.hero.stats.weapon;
          const s = wpn.feel[e.moveKind];
          const arc = Math.min(360, s.arc ?? wpn.arc) * (Math.PI / 180);
          const range = wpn.range + (s.reach ?? 0) + 0.2;
          const heavy = e.moveKind === 'heavy' || e.moveKind === 'hold';
```

Replace:
```ts
              {
                heft: e.heft,
                reverse: e.step % 2 === 1,
                finisher: e.finisher,
                // Ordinary blows wear the secondary's motif; the finisher is its body.
                infusion: basicMotif(wpn, e.element),
              },
            );
          else this.fx.fling(e.x, e.y, e.dir, elemColor(e.element), 6, 7);
          // The finisher discharges the secondary: at the tip, round a full circle, or at the hand.
          const ring = finisherRing(e, arc, range);
          if (ring && wpn.infusion) this.fx.infuse('finisher', wpn.infusion, ring);
```
with:
```ts
              { heft: e.heft, reverse: e.step % 2 === 1, finisher: heavy },
            );
          else this.fx.fling(e.x, e.y, e.dir, elemColor(e.element), 6, 7);
          // Heavy and hold blows ring out in their own element: at the tip, round a full circle, or at the hand.
          const ring = finisherRing(e, arc, range);
          if (ring) this.fx.infuse('finisher', e.element, ring);
```

Before:
```ts
        case 'wardBreak':
```
add:
```ts
        case 'holdStage': {
          const ping = holdPing(w, e);
          this.fx.ring(w.hero.x, w.hero.y - 0.3, ping.r, ping.color, false, 0.25);
          break;
        }
```

Replace:
```ts
    const guard = w.hero.abilities[1];
```
with:
```ts
    const guard = activeMove(w.hero, 1);
```

Replace:
```ts
    const aura = h.stats.weapon.element ? MANA_HEX[h.stats.weapon.element] : 0xd4a834;
```
with:
```ts
    const aura = MANA_HEX[h.stats.weapon.blows[0].element];
```

Replace:
```ts
/** A pickup's sparkle: the item's rarity, else the drop's mana (a mote, a Seedling orb), else red. */
```
with:
```ts
/**
 * A hold reaching a stage pings a ring round the hero, wider at stage 2, in
 * the held move's element (an ability's hold) or the held blow's (slot null).
 */
export function holdPing(
  w: ArpgWorld,
  e: { slot: number | null; stage: number },
): { r: number; color: number } {
  const h = w.hero;
  const element =
    e.slot === null
      ? h.stats.weapon.blows[h.swing?.step ?? 0]?.element
      : activeMove(h, e.slot)?.element;
  return { r: 0.8 + 0.4 * e.stage, color: elemColor(element) };
}

/** A pickup's sparkle: the item's rarity, else the drop's mana (a mote, a Seedling orb), else red. */
```

- [ ] **Step 5: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (78).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 666 tests pass. The client is green again.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/fx/anticipation.ts packages/client/src/features/delve/arena/fx/draw-world.ts packages/client/src/features/delve/arena/fx/mana-fx.ts packages/client/src/features/delve/arena/fx/lifecycles.ts packages/client/src/features/delve/arena/fx/infusion.ts packages/client/src/features/delve/arena/pixel/floor-engine.ts packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts packages/client/src/features/delve/arena/fx/__tests__/lifecycles.test.ts packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts packages/client/src/features/delve/arena/fx/__tests__/infusion.test.ts packages/client/src/features/delve/__tests__/arena-renderer.test.ts
git add packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/fx/anticipation.ts packages/client/src/features/delve/arena/fx/draw-world.ts packages/client/src/features/delve/arena/fx/mana-fx.ts packages/client/src/features/delve/arena/fx/lifecycles.ts packages/client/src/features/delve/arena/fx/infusion.ts packages/client/src/features/delve/arena/pixel/floor-engine.ts packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts packages/client/src/features/delve/arena/fx/__tests__/lifecycles.test.ts packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts packages/client/src/features/delve/arena/fx/__tests__/infusion.test.ts packages/client/src/features/delve/__tests__/arena-renderer.test.ts
git commit -m "feat(client): the arena draws blows by kind and element, grows the anticipation with a hold's charge, and pings its stages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 20: Release: E2E, screenshots, docs, version

### Task 13: The Delve E2E specs, and a screenshot pass

The E2E specs meet the chains: D01's buttons name their next move (the Defensive's and Ultimate's single medium moves exactly; the Primary's with a pattern, since the bot is already stepping through its chain when the arena shows); D04 edits the Primary's first move into a Wildfire Burst, checks the whole summary, and adds a fifth move up to the cap; D08 reads each skill's summary from its tab; G04 checks the Primary's first move before RT goes down, then that held RT steps through the chain; T01 checks the sandbox's first move before any press.

**Files:**
- Modify: `packages/client/e2e/delve.spec.ts` (D01, D04, D08), `packages/client/e2e/delve-gamepad.spec.ts` (G04), `packages/client/e2e/delve-training.spec.ts` (T01)
- Create (scratch, never committed): `packages/client/playwright.scratch.config.ts` (see the header), `packages/client/e2e/chains-shots.spec.ts`

- [ ] **Step 1: The specs**

In `packages/client/e2e/delve.spec.ts`:

Replace:
```ts
    await expect(page.getByTestId('ability-0')).toHaveAttribute('aria-label', 'Primary: Fire Bolt');
    await expect(page.getByTestId('ability-1')).toHaveAttribute(
      'aria-label',
      'Defensive: Fire Ward',
    );
    await expect(page.getByTestId('ability-2')).toHaveAttribute(
      'aria-label',
      'Ultimate: Fire Nova',
```
with:
```ts
    // Each button names its chain's next move: the bot is already stepping through the
    // Primary's (G04 and T01 see its first move before any press).
    await expect(page.getByTestId('ability-0')).toHaveAttribute(
      'aria-label',
      /^Primary: (light|medium|heavy) Fire Bolt$/,
    );
    await expect(page.getByTestId('ability-1')).toHaveAttribute(
      'aria-label',
      'Defensive: medium Fire Ward',
    );
    await expect(page.getByTestId('ability-2')).toHaveAttribute(
      'aria-label',
      'Ultimate: medium Fire Nova',
```

Replace:
```ts
    await page.getByTestId('form-burst').click();
    await page.getByTestId('infusion-nature').click();
    await expect(page.getByTestId('ability-readout')).toContainText('Wildfire Burst');
    await expect(page.getByTestId('abilities-summary')).toContainText('Wildfire Burst');
```
with:
```ts
    // The Primary's first move becomes a Wildfire Burst; the chain keeps its other moves.
    await page.getByTestId('form-burst').click();
    await page.getByTestId('infusion-nature').click();
    await expect(page.getByTestId('ability-readout')).toContainText('light Wildfire Burst');
    await expect(page.getByTestId('abilities-summary')).toHaveText(
      'light Wildfire Burst · medium Fire Bolt · medium Fire Bolt · heavy Fire Bolt',
    );
    // A fifth move fills the cap: no more + card.
    await page.getByTestId('move-add').click();
    await expect(page.getByTestId('move-4')).toBeVisible();
    await expect(page.getByTestId('move-add')).toHaveCount(0);
```

Replace:
```ts
    await expect(summary).toContainText('Frost Ward');
```
with:
```ts
    await page.getByTestId('chain-skill-defensive').click();
    await expect(summary).toContainText('Frost Ward');
    await page.getByTestId('chain-skill-ultimate').click();
```

In `packages/client/e2e/delve-gamepad.spec.ts`:

Replace:
```ts
  test('G04: holding RT with the right stick aimed keeps casting the Primary', async ({ page }) => {
```
with:
```ts
  test('G04: holding RT with the right stick aimed keeps casting the Primary, through its chain', async ({
    page,
  }) => {
```

Before:
```ts
    const before = await mana();
```
add:
```ts
    const primary = page.getByTestId('ability-0');
    await expect(primary).toHaveAttribute('aria-label', 'Primary: light Fire Bolt');
```

Replace:
```ts
    // Two or more Primary casts (8 mana each) outpace the regen while RT is held
    // (polling while held, since game time runs slow when the machine is busy).
    await expect.poll(mana, { timeout: ARENA_READY }).toBeLessThan(before - 6);
```
with:
```ts
    // Two or more Bolts outpace the regen while RT is held, stepping through the
    // chain (polling while held, since game time runs slow when the machine is busy).
    await expect.poll(mana, { timeout: ARENA_READY }).toBeLessThan(before - 6);
    await expect
      .poll(() => primary.getAttribute('aria-label'), { timeout: ARENA_READY })
      .toBe('Primary: medium Fire Bolt');
```

In `packages/client/e2e/delve-training.spec.ts`:

After:
```ts
    await expect(ability0).toBeVisible({ timeout: ARENA_READY });
```
add:
```ts
    // The sandbox starts on Fire's default chains.
    await expect(ability0).toHaveAttribute('aria-label', 'Primary: light Fire Bolt');
```

- [ ] **Step 2: Run the Delve E2E specs**

Create the scratch config (header). The 5288 dev server must be running with the rebuilt engine (Task 8 restarted it; run the header block again if in doubt; expect `True`).

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`
Expected: 56 passed (14 tests on the four device projects). A timeout under load that passes on `-g <test> --repeat-each 2` is flakiness (see the header): on the scratch copy G01 (the dive menu's D-pad focus, which chains don't touch) timed out once in each of two full runs, on a different device each time, and passed 40 of 40 when `delve-gamepad.spec.ts` ran alone with `--repeat-each 2`.

- [ ] **Step 3: The screenshot pass**

Create `packages/client/e2e/chains-shots.spec.ts` (scratch, never committed):

```ts
import { test, expect, type Page } from '@playwright/test';

// A scratch screenshot pass for the moves and chains plan (never committed): the builder, a
// hold move's readout, the basic chain, and the HUD while a hold charges.
import { bindSecondary, createDefaultRegistry, createDelveProfile } from '@alloy/engine';

const DIR = process.env.SHOTS_DIR!;
const ARENA_READY = 30_000;

async function seed(page: Page): Promise<void> {
  let profile = createDelveProfile(createDefaultRegistry(), 4242, { primary: 'fire' });
  profile = bindSecondary(profile, 'nature').profile;
  await page.addInitScript((value) => {
    if (sessionStorage.getItem('shots')) return;
    localStorage.clear();
    localStorage.setItem('alloy:delve:v2', value);
    localStorage.setItem('alloy:delve:manualAttack', '1');
    localStorage.setItem('alloy:muted', 'true');
    sessionStorage.setItem('shots', '1');
  }, JSON.stringify(profile));
}

test('chains screenshots', async ({ page }) => {
  await seed(page);
  await page.goto('/delve');
  await page.getByTestId('tab-abilities').click();
  await expect(page.getByTestId('abilities-panel')).toBeVisible();
  await page.screenshot({ path: `${DIR}/1-builder-primary.png`, fullPage: true });
  await page.getByTestId('move-2').click();
  await page.getByTestId('kind-hold').click();
  await page.getByTestId('infusion-nature').click();
  await expect(page.getByTestId('ability-readout')).toContainText('Fully charged');
  await page.screenshot({ path: `${DIR}/2-builder-hold-move.png`, fullPage: true });
  await page.getByTestId('chain-skill-basic').click();
  await page.screenshot({ path: `${DIR}/3-builder-basic.png`, fullPage: true });

  // The Training Grounds: a held first move, charging on Q.
  await page.getByTestId('training-button').click();
  await expect(page.getByTestId('delve-training')).toBeVisible({ timeout: ARENA_READY });
  await expect(page.getByTestId('ability-0')).toBeVisible({ timeout: ARENA_READY });
  const panel = page.getByTestId('training-panel');
  if (!(await panel.isVisible())) await page.getByTestId('training-panel-toggle').click();
  await page.getByTestId('training-tab-targets').click();
  await page.getByTestId('add-dummy-single').click();
  await page.getByTestId('training-tab-abilities').click();
  await page.getByTestId('move-1').click();
  await page.getByTestId('kind-hold').click();
  await page.mouse.move(400, 250);
  // First press: the light Bolt. Second: the held one charges.
  await page.keyboard.down('KeyQ');
  await page.waitForTimeout(60);
  await page.keyboard.up('KeyQ');
  await page.waitForTimeout(400);
  await expect(page.getByTestId('ability-0')).toHaveAttribute(
    'aria-label',
    'Primary: held Fire Bolt',
  );
  await page.keyboard.down('KeyQ');
  await page.waitForTimeout(550);
  await page.screenshot({ path: `${DIR}/4-hud-hold-charging.png` });
  await page.getByTestId('skill-bar').screenshot({ path: `${DIR}/5-skill-bar-hold.png` });
  await page.keyboard.up('KeyQ');
  await page.waitForTimeout(300);
  await page.getByTestId('skill-bar').screenshot({ path: `${DIR}/6-skill-bar-after.png` });
});
```

Run, with `<scratchpad>` your session's scratchpad directory (forward slashes): `(cd packages/client && SHOTS_DIR="<scratchpad>/chains-shots" npx playwright test -c playwright.scratch.config.ts --project=desktop e2e/chains-shots.spec.ts)` (create the folder first).
Expected: 1 passed, and six PNGs. Look at each (Read shows images):
- `1-builder-primary.png`: four skill tabs (Basic 3 of 5, Primary 4 of 5, Defensive 1 of 5, Ultimate 1 of 5, the Primary outlined), the summary "light Fire Bolt · medium Fire Bolt · medium Fire Bolt · heavy Fire Bolt", four cards with their kind glyphs (▪, ▪▪, ▪▪, ▪▪▪) and a + card.
- `2-builder-hold-move.png`: the third card ◉ with a Fire and a Nature icon, the "held" kind chip lit, the Wildfire effect text, and the readout "held Wildfire Bolt" with its full-charge line.
- `3-builder-basic.png`: the Basic tab, three blow cards (the last a Nature blow: the pair's secondary), no form chips, one element per blow.
- `4-hud-hold-charging.png` and `5-skill-bar-hold.png`: the Primary button with ◉, a charge bar above it about half full past the first tick, four dots under it with the second lit, and the Defensive and Ultimate buttons dimmed.
- `6-skill-bar-after.png`: nothing dimmed, the Primary's third dot lit (its next move, medium).
If a glyph, a dot or the bar is missing, clipped or unreadable, fix it in `ArenaHud.tsx` or `ChainEditor.tsx` (display only), rerun the pass and the client tests, and commit the fix with this task. On the scratch copy nothing needed fixing.

Delete `packages/client/e2e/chains-shots.spec.ts` when done (keep the scratch config for Task 14).

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/e2e/delve.spec.ts packages/client/e2e/delve-gamepad.spec.ts packages/client/e2e/delve-training.spec.ts
git add packages/client/e2e/delve.spec.ts packages/client/e2e/delve-gamepad.spec.ts packages/client/e2e/delve-training.spec.ts
git commit -m "test(client): the Delve E2E specs read chains: next-move labels, the builder flow, RT through a chain" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: Docs, the version, and the full verification

**Files:**
- Modify: `CLAUDE.md` (CRLF, hand-edit: the Delve paragraph; the Spec, Engine, Data, Elemental affinity, Elemental stacks, Client, Mana-pixel FX, Controller, Training Grounds and DPS Lab bullets)
- Modify: `docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md` (CRLF: the status line)
- Modify: `docs/superpowers/specs/2026-09-25-delve-ability-system-design.md`, `2026-09-25-delve-combat-weight-design.md` (CRLF), `2026-09-27-delve-elemental-affinity-design.md` (CRLF), `2026-09-28-delve-elemental-stacks-design.md` (CRLF), `2026-09-28-delve-dps-lab-design.md` (superseded notes)
- Modify: `packages/client/package.json:3`

- [ ] **Step 1: CLAUDE.md**

In `CLAUDE.md` (CRLF: hand-edit). Each edit replaces a phrase inside one of its long lines, in this order:

Replace:
```markdown
The hero has four abilities: an automatic **basic** attack from the weapon, and a **Primary**, **Defensive** and **Ultimate** (Q/E/R) that the player builds at the Anvil from a **form** (12, e.g. Bolt, Ward, Maelstrom), one or two of six **elements** (fire/frost/storm/earth/shadow/nature; two make a fusion such as Wildfire), a **weight** (Swift to Crushing) and a **payment** (mana, charge or a cast wind-up).
```
with:
```markdown
The hero has four skills, each a **chain** of up to five **moves** that the player builds at the Anvil: an automatic **basic** attack from the weapon, whose blows each take a kind and an element of the hero's pair, and a **Primary**, **Defensive** and **Ultimate** (Q/E/R), whose moves each take a **kind** (light, medium, heavy, or a **hold** that charges while its button is held and fires on release), a **form** (12, e.g. Bolt, Ward, Maelstrom) and one or two of six **elements** (fire/frost/storm/earth/shadow/nature; two make a fusion such as Wildfire), with one **payment** per chain (mana, charge or a cast wind-up). Each press casts the chain's next move, each landing harder than the last (the step bonus), and each move has its own cooldown; a pause starts the chain over.
```

Replace:
```markdown
Each weapon swings its own combo string (`delve.json` `combo`), which restarts after a pause.
```
with:
```markdown
Each weapon has a feel row per kind (`delve.json` `feel`) and a default basic chain (`defaultChain`) that plays its old combo string blow for blow.
```

Replace:
```markdown
weight sets an ability's conjure
```
with:
```markdown
a move's kind sets its conjure
```

Replace:
```markdown
- **Spec**: `docs/superpowers/specs/2026-09-24-delve-loot-mode-design.md`; abilities: `docs/superpowers/specs/2026-09-25-delve-ability-system-design.md`
```
with:
```markdown
- **Spec**: `docs/superpowers/specs/2026-09-24-delve-loot-mode-design.md`; abilities: `docs/superpowers/specs/2026-09-25-delve-ability-system-design.md`; moves and chains: `docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md`
```

Replace:
```markdown
`resolve.ts` compiles a build into a `ResolvedAbility`
```
with:
```markdown
`resolve.ts` compiles a chain into a `ResolvedChain` (each move a `ResolvedAbility` at its kind's weight, a hold's three stages too; `stepBonus`)
```

Replace:
```markdown
`cast.ts` handles payment, wind-ups and press-combos
```
with:
```markdown
`cast.ts` handles payment, per-move cooldowns, wind-ups, the chain's next move (`pressStep`, `nextMove`, `activeMove`) and holds (`holdTick`)
```

Replace:
```markdown
`delve.feel` the combat-weight timings: conjure, recovery, heft, buffer)
```
with:
```markdown
`delve.feel` the combat-weight timings: conjure, recovery, heft, buffer; `delve.chains` the chain caps, the kinds' weights, the hold's timings and the step bonus)
```

Replace:
```markdown
the equipped gear re-attunes to it and the builds reset
```
with:
```markdown
the equipped gear re-attunes to it and the chains reset
```

Replace:
```markdown
Basic blows strike with the primary (even unarmed) and the combo's finisher discharges the secondary, always applying its status (`HeroWeapon.blowPower` / `finisherPower` grow with attunement); in the Delve, abilities use only the pair (`setAbility`, `fixBuildsToPair`), while the Training Grounds stay unrestricted with their own `primary` and a basics-only pair.
```
with:
```markdown
Each basic blow strikes with its own element of the pair (the default chain: the primary, its last blow the secondary once bound; `HeroBlow.attunePower` grows with that element's attunement); in the Delve, every move uses only the pair (`setChain`, `fixChainsToPair`), while the Training Grounds stay unrestricted with their own `primary` and a `secondary` for the blows.
```

Replace:
```markdown
A blow applies `basicBlow`, a finisher `basicFinisher`, an ability's direct hit its weight's `byWeight`
```
with:
```markdown
A blow applies its kind's `basicByKind` (light and medium 1, heavy and hold 2), an ability's direct hit its kind's weight's `byWeight`
```

Replace:
```markdown
with the Abilities workshop tab, `features/delve/AbilitiesPanel.tsx`)
```
with:
```markdown
with the Abilities tab's chain builder, `features/delve/chains/ChainEditor.tsx`)
```

Replace:
```markdown
HUD with drag-to-aim ability buttons (`aim-gestures.ts`; hold Q/E/R to aim with the mouse)
```
with:
```markdown
HUD with drag-to-aim ability buttons that show their chain's step, the next move's kind and a hold's charge (`aim-gestures.ts`; hold Q/E/R to aim with the mouse, or to charge a hold move)
```

Replace:
```markdown
basic attacks draw `HeroWeapon.infusion`, the hero's bound secondary (ordinary blows wear its motif, `basicMotif`; the finisher is its body and discharges it: a ring at the tip, round a full circle, or a flare at the hand for a shot)
```
with:
```markdown
a basic blow has one element and no motif (heavy and hold blows ring out in it: at the tip, round a full circle, or a flare at the hand for a shot)
```

Replace:
```markdown
RT Primary (held keeps casting)
```
with:
```markdown
RT Primary (held keeps casting through the chain; a hold move charges while held and fires on release)
```

Replace:
```markdown
the three builds, or **Load my build**
```
with:
```markdown
the chains and a secondary for the blows, or **Load my build**
```

Replace:
```markdown
Builds hot-swap mid-fight (`refreshWorldHero` cancels a changed slot's wind-up)
```
with:
```markdown
Chains hot-swap mid-fight (`refreshWorldHero` cancels a changed move's wind-up or hold)
```

Replace:
```markdown
every ability combo (Primary and Ultimate forms × ordered element sets × weight × payment)
```
with:
```markdown
every ability setup (Primary and Ultimate forms × ordered element sets × payment, as a single move of each kind and as the form's default chain)
```

Replace:
```markdown
`dpsCombos` is the only part that knows the build model
```
with:
```markdown
`dpsCombos` is the only part that knows the chain model
```

Replace:
```markdown
the button held (under an ability
```
with:
```markdown
the button held (a hold move to full charge each press; under an ability
```

- [ ] **Step 2: The specs**

In `docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md` (CRLF), the status:

Replace:
```markdown
**Status:** Draft.
```
with:
```markdown
**Status:** Built in v0.46.0. The DPS Lab gate kept every starting value but three, first `stepBonus` then two forms' default chains: `stepBonus` 0.1 → 0.15, Bolt's default chain light, medium, medium, heavy (not light, light, medium, heavy: its two light moves apply one stack each, so the Glacier Bolt loses its Shatters) and Strike's medium, medium, heavy, heavy (not medium, medium, medium, heavy: the Wildfire Strike's pack loses its Combusts to the reaction lockout). On the 40-seed floor, every mana default-chain row holds: the worst −10.8% (the Earth+Fire Volley, the pack). Basics are unchanged (worst +0.0%). The pacing rails hold: first dives 11, 11, 5, 4; the 15-pair sweep's median 29 (20–38).
```

In `docs/superpowers/specs/2026-09-25-delve-ability-system-design.md`:

Replace:
```markdown
## An ability
```
with:
```markdown
## An ability

> **Superseded** by `2026-09-29-delve-moves-and-chains-design.md` (v0.46.0): a slot holds a chain of up to five moves (`profile.chains`, save version 5), each a kind (light, medium, heavy, or a hold that charges while its button is held), a form and one or two elements, with one payment per chain. A move's kind sets its weight (`balance.json → delve.chains.kindWeight`; a hold's stages `holdStageWeight`), so Swift and Crushing are no fixed picks, and the forms' press-combos (`combo`, `comboCount`) are gone: a chain escalates by its kinds and the step bonus, and each move has its own cooldown.
```

In `docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md` (CRLF):

Replace:
```markdown
Each weapon base in `delve.json` gains a `combo` array, validated by Zod (optional in the gear-base schema). A weapon without one, including the unarmed fallback in `hero-stats.ts`, uses `balance.json → delve.hero.defaultCombo`. `HeroWeapon` gains `combo`.
```
with:
```markdown
> **Superseded** by `2026-09-29-delve-moves-and-chains-design.md` (v0.46.0): a weapon's string is its default basic chain (`GearBaseDef.defaultChain`) over a feel row per kind (`GearBaseDef.feel`: light, medium, heavy, hold; unarmed, `balance.json → delve.hero.feel` and `defaultChain`), derived so the default chain plays the string below blow for blow; the player can build a chain of up to five blows, each a kind and an element of the pair.

Each weapon base in `delve.json` gains a `combo` array, validated by Zod (optional in the gear-base schema). A weapon without one, including the unarmed fallback in `hero-stats.ts`, uses `balance.json → delve.hero.defaultCombo`. `HeroWeapon` gains `combo`.
```

Replace:
```markdown
## Abilities: weight in time
```
with:
```markdown
## Abilities: weight in time

> **Superseded** in part by `2026-09-29-delve-moves-and-chains-design.md` (v0.46.0): a move's kind sets its weight (light −1, medium 0, heavy +1; a hold's stages 0, +1, +2), and the +0.2 heft of a press-combo's last step goes to a chain's last move (`stepHeft`).
```

In `docs/superpowers/specs/2026-09-27-delve-elemental-affinity-design.md` (CRLF):

Replace:
```markdown
With `weapon.infusion` set (a bound secondary):
```
with:
```markdown
> **Superseded** by `2026-09-29-delve-moves-and-chains-design.md` (v0.46.0): each blow of the basic chain strikes with its own element of the pair (the default chain's last blow the secondary once bound) and that element's attunement powers it (`HeroBlow.attunePower`); the finisher's discharge and `HeroWeapon.element`, `infusion`, `blowPower` and `finisherPower` are gone.

With `weapon.infusion` set (a bound secondary):
```

Replace:
```markdown
### Abilities and defaults
```
with:
```markdown
### Abilities and defaults

> **Superseded** by `2026-09-29-delve-moves-and-chains-design.md` (v0.46.0): `setChain`, `defaultChains` and `fixChainsToPair` (per move, with per-move `ChainFix` notices) replace `setAbility`, `defaultAbilities` and `fixBuildsToPair`.
```

In `docs/superpowers/specs/2026-09-28-delve-elemental-stacks-design.md` (CRLF):

Replace:
```markdown
### Stacks per hit
```
with:
```markdown
### Stacks per hit

> **Superseded** in part by `2026-09-29-delve-moves-and-chains-design.md` (v0.46.0): a basic blow applies `stacks.basicByKind[kind]` (light 1, medium 1, heavy 2, hold 2), replacing `basicBlow` and `basicFinisher`; an ability move's direct hit applies `byWeight` at its kind's weight (a hold's, its stage's).
```

In `docs/superpowers/specs/2026-09-28-delve-dps-lab-design.md`:

Replace:
```markdown
### `arpg/dps-sim.ts`
```
with:
```markdown
### `arpg/dps-sim.ts`

> **Superseded** in part by `2026-09-29-delve-moves-and-chains-design.md` (v0.46.0): an ability setup's dims are `{ form, first, second, kind, payment }`: a single move of each kind, and each form's default chain (`kind: 'default'`), which is what a held button plays; a hold move is held to full charge each press. Basics run each weapon's default chain on the pair.
```

- [ ] **Step 3: The version**

In `packages/client/package.json`:

Replace:
```json
  "version": "0.45.0",
```
with:
```json
  "version": "0.46.0",
```

- [ ] **Step 4: The full verification**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run && pnpm build)`
Expected: no type errors; all 1246 tests pass; the build succeeds.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 666 tests pass.

Run (the TypeScript files this plan formats: every one it touched but the six never formatted): `(base=$(git log --diff-filter=A --format=%h -1 -- docs/superpowers/plans/2026-09-29-delve-moves-and-chains.md); git diff --name-only $base HEAD -- '*.ts' '*.tsx' | grep -v -e types/ability.ts -e abilities/resolve.ts -e profile-schema.ts -e delve/autopilot.ts -e delve/dive.ts -e delve-hero-smithing.test.ts | xargs npx prettier --check)`
Expected: "All matched files use Prettier code style!" (82 files).

Run the PowerShell block under "Dev server on 5288" (the version shows in the TabBar); expect `True`. Then: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`
Expected: 56 passed (a G01 timeout under load: rerun it as Task 13 says).

Then delete `packages/client/playwright.scratch.config.ts`, and leave the 5288 dev server running: the user plays on it.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
git add CLAUDE.md docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md docs/superpowers/specs/2026-09-25-delve-ability-system-design.md docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md docs/superpowers/specs/2026-09-27-delve-elemental-affinity-design.md docs/superpowers/specs/2026-09-28-delve-elemental-stacks-design.md docs/superpowers/specs/2026-09-28-delve-dps-lab-design.md packages/client/package.json
git commit -m "chore(client): bump version to 0.46.0" -m "Moves and chains in the Delve notes; the chains spec's status and gate values; the ability-system, combat-weight, affinity, stacks and DPS Lab specs' builds and strings marked superseded." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Don't push: the controller pushes after the final review.

