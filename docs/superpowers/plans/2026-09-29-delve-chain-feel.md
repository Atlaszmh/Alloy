# Delve Chain Feel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chains play at a pace a player can follow. Each weapon gets a **tempo** that scales every hold's charge and every chain **beat**; a hold reaches full power at 100% of its bar; after a move lands its slot waits a beat (by the kind it played as, its slot and the tempo), a press meanwhile waits in its slot's own buffer, and a basic swing starts only if it strikes before that press fires. The HUD sweeps through a beat like a short cooldown, the builder's readout names the beats, pad chords behave like keys, hold-to-repeat presses early, aiming pauses the restart window, and Power counts the beats and values holds at full charge. Ships as v0.47.0.

**Architecture:** The engine owns it. Data first (`delve.json` weapon `tempo`, `balance.json → delve.hero.tempo`, `chains.holdStages` [0.5, 1], `chains.beat`, `chains.beatSlot`) and `HeroStats.tempo`. Holds take their charge and auto-fire times from the tempo, fixed on `HeroEntity.hold` when they start (`holdCharge(bal, start, t, full)`). `fire` (in `abilities/cast.ts`) starts the slot's beat (`beatFor`, `HeroEntity.beatFrom`/`beatUntil`) and moves the restart window to its end; `castAbility`, `startHold` and `abilityReady` wait for it. `ArpgWorld.queuedCasts` replaces the single buffered press with one per slot, and `step.ts` fires the first-pressed ready one, holds back a swing that wouldn't strike before it (`pressDue`) and lets a swing striking this tick land first. Repeat presses (`AbilityCast.repeat`) are dropped at a hold move and stay quiet when unaffordable; `pressMove` names the move a press made during the slot's own wind-up will cast; a held button pauses its slot's window. Power's `useInterval` adds the cadence (wind-up plus beat) and values holds at full charge (`valuedMove`). The client then shows the beat on the buttons (`AbilityHud.beat`, a registered `--delve-sweep` angle), the readout and the item sheet name the beats and the tempo, and the pad keeps its press order in `PadMemory` (`padToArena` reports every button; `padFrameCast` picks `holding`, the chord's carry and hold-to-repeat's early, marked press).

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom), Zod 3, React 19, Zustand 5, PixiJS 8, Playwright (the Delve E2E specs).

**Spec:** `docs/superpowers/specs/2026-09-29-delve-chain-feel-design.md` at `097d484` (the requirements; read it first: the Beats and Input sections carry ordering rules the code follows exactly).

---

## Measured before and after: read before executing

Everything below was built and run on a scratch copy of HEAD `097d484`. The spec's starting values ship unchanged; nothing is tuned. Task 7 measures again and stops if a number differs; if a pacing rail breaks, it stops and brings the numbers to the user (the spec: the fix is the user's call).

| | Before (v0.46.0) | After (this plan) |
|---|---|---|
| Pacing: first dives (each ≥ 3, mean 4–12) | 12, 11, 5, 4 (mean 8) | 12, 12, 5, 3 (mean 8) |
| Pacing: dive 6, dive 12 means | 28.75, 40.75 | 27.75, 35.75 |
| Pacing: Frost dive 1 → dive 12 | 10.5 → 27.5 | 10 → 26.5 |
| Pacing: legendaries at dive 12; own pair's reaction | 6.25; 6 of 6 | 4.75; 6 of 6 |
| Pacing: the 15-pair sweep at dive 6 | median 32, 26–40 (allowed 19.2–51.2) | median 28, 18–41 (allowed 16.8–44.8) |
| Pacing: seconds a floor (8–60) | 24.91 | 29.09 |

Every rail holds, thinly: seed 4's first dive sits on its rail (3), and the sweep's Storm+Fire (18) is 1.2 above the floor.

The DPS Lab grid (depth 10, one dummy and the pack, one seed, 9,144 runs), after against before, by row: basics unchanged (504 rows, +0.0%); mana rows' median +0.0% for light, medium, heavy and the default chains, −3.3% for a hold (worst −47.1%, a heavy); cast rows lose the most, as the spec expects (heavy −17.0%, worst −84.2%; default chains −27.7%); charge rows +0.0% for every one-move kind, but default chains +15.1% (up to +1480% in the pack): the held button now pauses the restart window (the aiming rule), so a slow-charging chain steps through its moves instead of starting over. Without `holding` those rows match v0.46.0 exactly (checked on the scratch copy). No row stopped dealing damage. The spot-check (each form's default chain and a hold, Fire and Fire+Frost, both layouts, on a sword, a maul and a wand): a maul's holds −16.8% (mana) and −17.1% (cast), a wand's cast default chains −26.9%, the sword's holds −3.4%.

---

## Where the spec left room

- **`holdCharge(bal, start, t, full)`** keeps `bal` (for `holdStages`) and takes the full-charge seconds; `HeroEntity.hold` gains `full` (`holdTime` × tempo) and `max` (`holdMax` × tempo). A manual hold blow passes `holdTime × h.stats.tempo` and auto-fires at `holdMax × h.stats.tempo`.
- **`beatFor(bal, slot, kind, tempo)`** takes the slot's name (`AbilitySlot`), and `playedKind(ab)` (in `resolve.ts`) gives the kind a move played as: a hold's stage's (`HOLD_STAGE_KINDS[ab.stage]`). `fire`, the readout and Power use both.
- **The buffer** is `ArpgWorld.queuedCasts: QueuedCast[]` (`{ cast, until }`, at most one per slot, in press order: a new press of a slot replaces its older one and goes last), replacing `queuedCast` and `queuedCastUntil`. One press fires a tick at most.
- **Clearing a beat** (`clearBeat` in `action.ts`, for a changed chain and a respawn) also pulls the slot's `comboAt` back to now, so the restart window doesn't start at the cleared beat's end; it drops the slot's waiting press.
- **The swing rule** compares ticks: a swing may start if its strike time is at most the first tick at or after the press's fire time (`deadline = t + ceil((due − t) / dt − 1e-6) · dt`). A cooldown's end compares exactly (no epsilon, as before), so one landing on a tick in floating point can make the rule wait one tick more than it needs: conservative, never a cut swing.
- **The same-tick rule** applies to every press and every hold start whenever a swing strikes that tick (`swingStrikes`), not only to swings that started while the press waited; that tick doesn't age a waiting press either, so the wait never costs a press its buffer.
- **A manual tap** doesn't age while any press waits (`due !== Infinity`), a little wider than the spec's "held back by this rule": a tap whose swing fits starts at once anyway.
- **The aiming pause** runs at the top of `holdTick` for the `holding` slot (before a release in the same tick: the landing then sets `comboAt` afresh).
- **The DPS sim** holds its button (`holding: slot`) under every move, as the pad does, so the aiming pause applies there too: that is what lifts the charge default chains (see above).
- **Power** exports `useInterval(bal, chain, tempo, manaIncome, chargeRate)`, `damagePerUse` and `valuedMove(chain, i)` (for the tests). A non-hold move's cooldown term is `cooldown + channel` for every payment (a charge-paid move has no channel, so its term is its cooldown, as before).
- **The pad:** `ArenaPadActions` carries `cast`, `held` and `repeat` (slot arrays in slot order; `castHeld` and `holding` go), `padCast` returns `{ slot, repeat } | null` and no longer asks `abilityReady` (a repeat press waits in the buffer instead; it refuses when a press of its slot already waits), `padFrameCast` returns `{ cast, holding }`, and `PadMemory` keeps `order`. Three presses in one frame: the lowest goes, the highest holds and carries, the middle one is dropped (the spec covers two); a hold's release with two presses in one frame casts the release and carries the lower press, and the higher press is lost unless its next move is a hold; a new press on the frame a carried press was due replaces it. `frameInput` lets a key's or a HUD button's press beat a repeat press (the repeat goes again later), so a streaming button can't hold a key's press back.
- **Texts:** the readout appends ", then a 0.4s beat" to the cost line and the full-charge line ("Fully charged (1.3s): hits for 25, 13 mana, then a 1.04s beat"); the item sheet says "Tempo 1.3×: slower holds and chain beats", "quicker" under 1 and "standard" at 1.
- **E2E G04** passes unchanged (its poll's timeout already allows for the beats); only its comment changes.

---

**Conventions:**
- Windows 11. The Bash tool runs POSIX sh; PowerShell is also available (use it for process management).
- Branch `claude/alloy-loot-gear-system-6upsy5` (already checked out). **One commit per task** (Task 12 makes two: the docs, then the version). Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; the commit blocks below pass it as the last `-m`. The commit body of Task 7 says what stays red until Task 8, as a second `-m`.
- Stage files by path. Never `git add -A` or `git add .` at the repo root: three unrelated untracked plan docs (`docs/superpowers/plans/2026-05-01-*.md`) exist and must stay out.
- **Don't push**: the controller pushes after a final review. Never open a PR.
- **Run every command from the repo root.** The shell's working directory persists between commands, so every command line below runs in a subshell (`(cd packages/engine && npx vitest run …)`), and every commit block starts with `cd /c/Projects/Alloy`.
- **Prettier:** the commit blocks format only files a task creates, or files that pass `npx prettier --check` before the edit (the repo's own Prettier, 3.8.1). Of the files this plan touches, these are not clean at HEAD and are **never formatted**, only hand-edited: `packages/engine/src/types/ability.ts`, `packages/engine/src/arpg/abilities/resolve.ts`, `packages/engine/src/data/balance.json` and `delve.json` (hand-laid-out JSON), `packages/client/src/features/delve/delve.css`, `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx`, `CLAUDE.md` and the spec docs. Every other file edited here passed `npx prettier --check` at HEAD; never commit a whole-file reformat. The code below is already Prettier-formatted (checked on the scratch copy), so the commit blocks' `--write` changes nothing if you typed it as written.
- **Line endings:** `types/ability.ts`, `abilities/resolve.ts`, the client's `features/delve/delve.css`, `CLAUDE.md` and the specs `2026-09-26-delve-training-grounds-design.md` and `2026-09-29-delve-moves-and-chains-design.md` use CRLF; every other file here is LF (the chain feel spec too). Keep each file's endings (the Edit tool does; don't rewrite a file with a script that normalises them).
- **How the edits read.** "Replace: A with: B" is one Edit (old A, new B). "After: A add: B" is the Edit old A, new A followed by B on the next line; "Before: A add: B" is old A, new B followed by A. Every A is unique in its file at that point, in the order given, so apply each file's edits top to bottom. "Replace the whole of `f` with" is a Write (only ever an LF file).
- `arpg/combat.ts`, `arpg/action.ts` and the modules in `arpg/abilities/` import each other: only ever read such an import inside a function, never at module top level.
- Engine `tsc` covers `src` only; client `tsc` covers `src` including tests, so client test code must type-check.
- Geometry the engine tests rely on: the fixture arena's hero starts at (13, 36) facing up (−y); `dummy(x, y)` is a sturdy Fire foe (1e6 life) that doesn't fight back. The fixture's chains (`DEFAULT_CHAINS`) are one medium move each: a Fire Bolt (0.45 s cooldown, 0.14 s wind-up), a Frost Ward (10 s cooldown), a charged Fire Nova; the starting weapon is a sword (tempo 1). A medium Bolt's beat is 0.4 s, so its 0.45 s cooldown (from the press) ends before the beat (from the landing): a second press of the same Bolt waits on the beat, not the cooldown.
- **Every engine task runs the whole suite, the pacing rails included.** On the scratch copy they held after each of Tasks 1–6. **If `delve-pacing.test.ts` fails in any task, stop:** don't tune anything; report the numbers (Task 7's scripts give them) to the user, whose call the fix is.
- **The client is red from Task 7's engine rebuild until Task 8.** The client consumes the engine's bundle (`dist`): once Task 7 rebuilds it, 6 client tests in 4 files and the client typecheck (in `anticipation.ts` and `useArenaCore.ts`) fail until Task 8. The numbers below were measured on the scratch copy of this exact code (the sim is deterministic, so you should see the same).

**Commands:**

| What | Command (from repo root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` (about 35 s; the pacing rails run while the files load) |
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

**E2E scratch config** (Task 11; create it then, delete it at the end of Task 12, never commit it): `packages/client/playwright.scratch.config.ts`. Playwright's own config starts Vite on port 5199, which another project on this machine may hold; this one reuses the 5288 dev server instead.

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

**The measurement's files** live in the plan author's scratchpad, `C:\Users\hahnz\AppData\Local\Temp\claude\c--Projects-Alloy\239f61fd-0a16-4600-a17d-7efef362f2cc\scratchpad\feel-before` (called `<before>` below; in the Bash tool, `/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/feel-before`). They were made from the engine at HEAD (v0.46.0) and must not be regenerated after Task 1 starts: `before-depth10.json` (the DPS Lab grid), `before-spot.json` (the sword/maul/wand spot-check) and `pacing-before.txt`, with the scripts `snapshot.mjs`, `spot.mjs`, `pacing.mjs` and `compare.mjs`. The scripts' texts are in Task 7, in case the folder is gone; Task 1 checks the before files and remakes them from HEAD if they are missing.

## File map

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/data/delve.json`, `src/data/balance.json` | each weapon base's `tempo`; `hero.tempo`; `chains.holdStages` [0.5, 1], `chains.beat`, `chains.beatSlot` |
| `src/data/schemas.ts` | `tempo` on a base (and a refine: every weapon has one), `hero.tempo`, `holdStages` in (0, 1], `beat`, `beatSlot` |
| `src/types/delve.ts` | `GearBaseDef.tempo`, `DelveBalance.hero.tempo`, `chains.beat`/`beatSlot`, `HeroStats.tempo` |
| `src/types/arpg.ts` | `HeroEntity.hold.full`/`max`, `HeroEntity.beatFrom`/`beatUntil`; `QueuedCast`; `ArpgWorld.queuedCasts` (for `queuedCast`/`queuedCastUntil`) |
| `src/types/ability.ts` | `AbilityCast.repeat` |
| `src/delve/hero-stats.ts` | `HeroStats.tempo`; Power: `valuedMove`, `damagePerUse` and `useInterval` (the cadence, holds at full charge), the Defensive hold's effect |
| `src/arpg/abilities/resolve.ts` | `playedKind`, `beatFor` |
| `src/arpg/abilities/cast.ts` | `holdCharge` by `full`; `inBeat`; `pressMove`; `fire` starts the beat; `castAbility`, `startHold`, `abilityReady` wait for it; a repeat press is quiet for mana; `startHold` lets a striking swing land; the aiming pause |
| `src/arpg/action.ts` | `clearBeat`, `swingStrikes` |
| `src/arpg/step.ts` | the per-slot buffer, the repeat press's drop at a hold, the swing rule (`pressDue`), a tap held back doesn't age |
| `src/arpg/basic.ts` | the manual hold blow by tempo; `startSwing`'s `deadline` |
| `src/arpg/world.ts`, `sandbox.ts` | the beats' state; a changed chain and a respawn clear beats and waiting presses |
| `src/arpg/bot.ts`, `dps-sim.ts` | `holdCharge` by the hold's `full`; the DPS sim holds its button and presses early, marked |
| `src/index.ts` | `inBeat`, `pressMove`, `beatFor`, `playedKind` |
| `tests/delve-chain-feel.test.ts` (new) | the spec's engine tests |
| `tests/fixtures/arena.ts` | `press` waits out its slot's beat |
| `tests/{ability-cast,ability-forms,delve-chains,delve-combat-weight,delve-training,delve-dps-sim}.test.ts` | updated to beats, the new stages and the per-slot buffer |

`src/arpg/combat.ts` (Nightstalker, Galvanize) needs no edit, nor does `tests/delve-pacing.test.ts`.

**Client (`packages/client/src/`)**

| File | Change |
|---|---|
| `features/delve/arena/useArenaCore.ts` | `AbilityHud.beat`; the wait is the longer of the cooldown and the beat; `holdCharge` by `full` |
| `features/delve/arena/ArenaHud.tsx`, `features/delve/delve.css` | the sweep on `--delve-sweep` (glides while it empties, snaps when it rises), no number and no Galvanize spark during a beat; the hold bar's one tick |
| `features/delve/arena/fx/anticipation.ts` | `holdCharge` by `full` (a hold blow's by tempo) |
| `features/delve/chains/MoveEditor.tsx` | the readout's beats and full-charge time |
| `features/delve/ItemDetailSheet.tsx` | a weapon's tempo |
| `features/delve/training/TrainingPanel.tsx` | No cooldowns' hint |
| `features/gamepad/arena-pad.ts`, `features/delve/arena/input.ts` | every button pressed and held; `holding` by press order; chords either way; hold-to-repeat's latest button, early and marked; a press during a wind-up reads the move after it; a key press in the pad's frame waits a frame |
| tests | `features/delve/__tests__/{ArenaHud,arena-hud-snapshot,arena-input,arena-renderer,AbilitiesPanel,ItemDetailSheet,TrainingPanel}`, `features/delve/arena/fx/__tests__/anticipation.test.ts`, `features/gamepad/__tests__/gamepad.test.ts` |

E2E: `e2e/delve-gamepad.spec.ts` (G04's comment). `packages/client/package.json`: 0.46.0 → 0.47.0 (Task 12).

**Docs:** `CLAUDE.md` (the Delve paragraph and its spec, engine, data, client, controller, Training Grounds and DPS Lab bullets), the chain feel spec's status line (Task 7), and superseded notes in the moves-and-chains and Training Grounds specs.

---

## Chunk 1: Engine: tempo and holds

### Task 1: Tempo, the new hold stages and the beats' numbers

Data and types only: `HeroStats.tempo` is computed, `holdStages` moves to [0.5, 1] (stage 2 is the full charge), and the beats' numbers load; nothing reads the tempo or the beats yet. The bot and the DPS sim already release a hold at full charge, so the pacing rails don't move.

**Files:**
- Create: `packages/engine/tests/delve-chain-feel.test.ts`
- Modify: `packages/engine/tests/delve-chains.test.ts:78-79,637` (the chain numbers; a test's name)
- Modify: `packages/engine/src/types/delve.ts:68,275,509-516,574` (`GearBaseDef.tempo`, `hero.tempo`, `chains`, `HeroStats.tempo`)
- Modify: `packages/engine/src/data/schemas.ts:483,494-495,677,900-901` (a base's `tempo` and its refine, `hero.tempo`, `chains`)
- Modify: `packages/engine/src/data/delve.json:16,47,73,104,130,161,192` (each weapon's `tempo`; hand-edit, never format)
- Modify: `packages/engine/src/data/balance.json:89,174-175` (`hero.tempo`, `chains`; hand-edit, never format)
- Modify: `packages/engine/src/delve/hero-stats.ts:217`

- [ ] **Step 0: Commit the plan**

If `git status` shows this plan untracked, commit it first so every later commit stays about code:

```bash
cd /c/Projects/Alloy
git add docs/superpowers/plans/2026-09-29-delve-chain-feel.md
git commit -m "docs: plan Delve chain feel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 1: Check the measurement's "before" files**

Task 7 compares against the engine at HEAD, which exists only until this task's edits.

Run: `(ls /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/feel-before)`
Expected, among others: `before-depth10.json`, `before-spot.json`, `pacing-before.txt`, `compare.mjs`, `pacing.mjs`, `snapshot.mjs`, `spot.mjs`.

If any `before-*` file is missing, make them now from HEAD (first write any missing script from the texts in Task 7): `(cd packages/engine && pnpm build)`, then from `<before>`: `node snapshot.mjs C:/Projects/Alloy/packages/engine/dist/index.js before-depth10.json` (prints `runs 9144 …`, about 10 s), `node spot.mjs C:/Projects/Alloy/packages/engine/dist/index.js before-spot.json` (prints `rows 576`) and `node pacing.mjs C:/Projects/Alloy/packages/engine/dist/index.js > pacing-before.txt` (about a minute). `pacing-before.txt` must read as the "Before" column of the header's table.

- [ ] **Step 2: Write the failing tests**

The chain feel spec's engine tests get their own file; later tasks add to it.

Create `packages/engine/tests/delve-chain-feel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import delveData from '../src/data/delve.json';
import { BalanceConfigSchema, DelveDataSchema } from '../src/data/schemas.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { bal, gear, registry } from './fixtures/arena.js';

// See the chain feel spec. The fixture arena's hero stands at (13, 36) facing up (−y);
// `dummy(x, y)` is a sturdy Fire foe that doesn't fight back.

const TEMPO: Record<string, number> = {
  wand: 0.8,
  dagger: 0.85,
  bow: 0.95,
  sword: 1,
  staff: 1.05,
  axe: 1.15,
  maul: 1.3,
};

describe('balance: tempo, hold stages and beats', () => {
  it('loads the numbers', () => {
    expect(bal.hero.tempo).toBe(1);
    expect(bal.chains.holdStages).toEqual([0.5, 1]);
    expect(bal.chains.beat).toEqual({ light: 0.25, medium: 0.4, heavy: 0.6, hold: 0.8 });
    expect(bal.chains.beatSlot).toEqual({ primary: 1, defensive: 0.75, ultimate: 1.5 });
    const weapons = registry.getGearBasesForSlot('weapon');
    expect(Object.fromEntries(weapons.map((b) => [b.id, b.tempo]))).toEqual(TEMPO);
  });

  it('refuses a stage past full charge, a beat or tempo that is not positive, and a weapon with no tempo', () => {
    const chains = (o: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, chains: { ...balanceData.delve.chains, ...o } },
      }).success;
    const hero = (o: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, hero: { ...balanceData.delve.hero, ...o } },
      }).success;
    expect(chains({})).toBe(true);
    expect(chains({ holdStages: [0.5, 1.1] })).toBe(false);
    expect(chains({ holdStages: [1, 1] })).toBe(false);
    expect(chains({ beat: { ...bal.chains.beat, heavy: 0 } })).toBe(false);
    expect(chains({ beatSlot: { ...bal.chains.beatSlot, ultimate: -1 } })).toBe(false);
    expect(hero({ tempo: 0 })).toBe(false);

    const bases = (edit: (b: Record<string, unknown>) => Record<string, unknown>) =>
      DelveDataSchema.safeParse({
        ...delveData,
        bases: delveData.bases.map((b) => (b.id === 'maul' ? edit(b) : b)),
      }).success;
    expect(bases((b) => b)).toBe(true);
    expect(bases(({ tempo: _tempo, ...b }) => b)).toBe(false);
    expect(bases((b) => ({ ...b, tempo: 0 }))).toBe(false);
  });
});

describe('tempo', () => {
  it("is the weapon's, and the hero's unarmed", () => {
    for (const [baseId, tempo] of Object.entries(TEMPO)) {
      const weapon = gear('fire', 'weapon', baseId);
      expect(computeHeroStats({ weapon }, registry).tempo, baseId).toBe(tempo);
    }
    expect(computeHeroStats({}, registry).tempo).toBe(bal.hero.tempo);
  });
});
```

In `packages/engine/tests/delve-chains.test.ts`, the chain numbers gain the new stages and the beats, and the stage test's name says where the stages now fall:

Replace:
```ts
      holdStages: [0.33, 0.66],
      stepBonus: 0.15,
```
with:
```ts
      holdStages: [0.5, 1],
      stepBonus: 0.15,
      beat: { light: 0.25, medium: 0.4, heavy: 0.6, hold: 0.8 },
      beatSlot: { primary: 1, defensive: 0.75, ultimate: 1.5 },
```

Replace:
```ts
  it('reaches stage 1 at 0.33 of holdTime and stage 2 at 0.66, saying so each time', () => {
```
with:
```ts
  it('reaches stage 1 halfway through holdTime and stage 2 at full charge, saying so each time', () => {
```

- [ ] **Step 3: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chain-feel.test.ts tests/delve-chains.test.ts)`
Expected: 4 FAIL, 54 pass: "loads the numbers" (expected undefined to be 1), "refuses a stage past full charge, …" (expected true to be false), "is the weapon's, and the hero's unarmed" (wand: expected undefined to be 0.8), and delve-chains' "loads the chain numbers" (expected { cap: …, …(6) } to deeply equal { cap: …, …(8) }).

- [ ] **Step 4: The types**

In `packages/engine/src/types/delve.ts` (a weapon base's tempo, the unarmed hero's, the chain numbers, and the stat):

After:
```ts
  defaultChain?: MoveKind[];
```
add:
```ts
  /** Weapons only (every weapon has one): scales every hold's charge and every chain beat (1 = the sword's). */
  tempo?: number;
```

Before:
```ts
    minAttackInterval: number;
```
add:
```ts
    /** Unarmed: the tempo (see `GearBaseDef.tempo`). */
    tempo: number;
```

Replace:
```ts
    /** Seconds a hold takes to charge fully. */
    holdTime: number;
    /** A hold still charging this many seconds after it began fires by itself at stage 2. */
    holdMax: number;
    /** The charge (0..1) at which a hold reaches stage 1, then stage 2. */
    holdStages: number[];
    /** Move `i` (from 0) lands at power × (1 + this × i) and size × (1 + this × i / 2). */
    stepBonus: number;
```
with:
```ts
    /** Seconds a hold takes to charge fully, times the hero's tempo. */
    holdTime: number;
    /** A hold still charging this many seconds (times the tempo) after it began fires by itself at stage 2. */
    holdMax: number;
    /** The charge (0..1) at which a hold reaches stage 1, then stage 2 (full power: 1, the full charge). */
    holdStages: number[];
    /** Move `i` (from 0) lands at power × (1 + this × i) and size × (1 + this × i / 2). */
    stepBonus: number;
    /**
     * The beat: seconds a slot waits after a move lands before its chain's next
     * move, by the kind the move played as, times `beatSlot` and the hero's
     * tempo (`beatFor`; see the chain feel spec).
     */
    beat: Record<MoveKind, number>;
    beatSlot: Record<AbilitySlot, number>;
```

After:
```ts
  attackInterval: number;
```
add:
```ts
  /**
   * The weapon's tempo (the hero's unarmed): every hold's charge and auto-fire
   * time and every chain beat scale by it. Gear modifiers would multiply in here.
   */
  tempo: number;
```

- [ ] **Step 5: The schemas**

In `packages/engine/src/data/schemas.ts` (a base's tempo, with a refine on the bases: every weapon has one; the hero's; the stages may reach 1; the beats):

After:
```ts
        defaultChain: z.array(MoveKindSchema).min(1).max(MAX_CHAIN).optional(),
```
add:
```ts
        tempo: z.number().positive().optional(),
```

Replace:
```ts
    .min(1),
  affixes: z
```
with:
```ts
    .min(1)
    .refine(
      (bases) => bases.every((b) => b.slot !== 'weapon' || b.tempo !== undefined),
      'every weapon base needs a tempo',
    ),
  affixes: z
```

Before:
```ts
    minAttackInterval: z.number().positive(),
```
add:
```ts
    tempo: z.number().positive(),
```

Replace:
```ts
      holdStages: z.array(z.number().gt(0).lt(1)).length(2),
      stepBonus: z.number().min(0),
```
with:
```ts
      holdStages: z.array(z.number().gt(0).lte(1)).length(2),
      stepBonus: z.number().min(0),
      beat: perKind(z.number().positive()),
      beatSlot: z.object({
        primary: z.number().positive(),
        defensive: z.number().positive(),
        ultimate: z.number().positive(),
      }),
```

- [ ] **Step 6: The data**

In `packages/engine/src/data/delve.json` (hand-edit, keep its layout), after each weapon base's `attackInterval` (dagger, sword, axe, maul, staff, wand, bow):

After:
```json
      "attackInterval": 0.55,
```
add:
```json
      "tempo": 0.85,
```

After:
```json
      "attackInterval": 0.8,
```
add:
```json
      "tempo": 1.0,
```

After:
```json
      "attackInterval": 1.05,
```
add:
```json
      "tempo": 1.15,
```

After:
```json
      "attackInterval": 1.4,
```
add:
```json
      "tempo": 1.3,
```

After:
```json
      "attackInterval": 0.9,
```
add:
```json
      "tempo": 1.05,
```

After:
```json
      "attackInterval": 0.5,
```
add:
```json
      "tempo": 0.8,
```

After:
```json
      "attackInterval": 0.75,
```
add:
```json
      "tempo": 0.95,
```

In `packages/engine/src/data/balance.json` (hand-edit, keep its layout):

Before:
```json
      "minAttackInterval": 0.2, "critCap": 75, "dodgeCap": 60, "armorK": 25, "armorCap": 80,
```
add:
```json
      "tempo": 1.0,
```

Replace:
```json
      "holdStageWeight": [0, 1, 2], "holdTime": 1.0, "holdMax": 2.0, "holdStages": [0.33, 0.66],
      "stepBonus": 0.15
```
with:
```json
      "holdStageWeight": [0, 1, 2], "holdTime": 1.0, "holdMax": 2.0, "holdStages": [0.5, 1],
      "stepBonus": 0.15,
      "beat": { "light": 0.25, "medium": 0.4, "heavy": 0.6, "hold": 0.8 },
      "beatSlot": { "primary": 1, "defensive": 0.75, "ultimate": 1.5 }
```

- [ ] **Step 7: The stat**

In `packages/engine/src/delve/hero-stats.ts`, `computeHeroStats` gives the weapon's tempo (`armed` is the equipped weapon's base when it has an attack), else the hero's:

Before:
```ts
    critChance: Math.min(bal.hero.critCap, bal.hero.baseCritChance + totals.critChance) / 100,
```
add:
```ts
    tempo: armed?.tempo ?? bal.hero.tempo,
```

- [ ] **Step 8: Run them to verify they pass**

Run the Step 3 command again.
Expected: PASS (58).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1274 tests pass (75 files).

- [ ] **Step 9: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-chain-feel.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/src/types/delve.ts packages/engine/src/data/schemas.ts packages/engine/src/delve/hero-stats.ts
git add packages/engine/tests/delve-chain-feel.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/src/types/delve.ts packages/engine/src/data/schemas.ts packages/engine/src/data/delve.json packages/engine/src/data/balance.json packages/engine/src/delve/hero-stats.ts
git commit -m "feat(engine): weapon tempo, holds at full power at full charge, and the beats' numbers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Holds charge by the tempo

A hold's full charge takes `holdTime` × the tempo and it fires by itself at `holdMax` × the tempo. An ability hold keeps both times on `HeroEntity.hold` (`full`, `max`), fixed when it starts, so a weapon swap mid-charge (the Training Grounds swap weapons live) doesn't make it jump; a manual hold blow reads the hero's tempo now (a weapon swap already drops the swing). `holdCharge` takes the full-charge seconds.

**Files:**
- Modify: `packages/engine/tests/delve-chain-feel.test.ts:5-9` (and the end), `packages/engine/tests/delve-chains.test.ts:650-653`, `packages/engine/tests/delve-training.test.ts:597`
- Modify: `packages/engine/src/types/arpg.ts:327-329` (`HeroEntity.hold`)
- Modify: `packages/engine/src/arpg/abilities/cast.ts:53-61,183,232,254-261` (`holdCharge`, `startHold`, `holdTick`)
- Modify: `packages/engine/src/arpg/basic.ts:114-139` (`basicHoldTick`)
- Modify: `packages/engine/src/arpg/bot.ts:67`, `packages/engine/src/arpg/dps-sim.ts:112`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-chain-feel.test.ts`, the helpers after the imports, then the hold tests at the end:

Replace:
```ts
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { bal, gear, registry } from './fixtures/arena.js';

// See the chain feel spec. The fixture arena's hero stands at (13, 36) facing up (−y);
// `dummy(x, y)` is a sturdy Fire foe that doesn't fight back.
```
with:
```ts
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import {
  STEP,
  arena,
  bal,
  chainsWith,
  dummy,
  gear,
  registry,
  strikeWorld,
} from './fixtures/arena.js';

// See the chain feel spec. The fixture arena's hero stands at (13, 36) facing up (−y);
// `dummy(x, y)` is a sturdy Fire foe that doesn't fight back.

const still = { x: 0, y: 0 };
const MAUL: EquippedGear = {
  weapon: gear('fire', 'weapon', 'maul'),
  chest: gear('earth', 'chest'),
};
const casts = (events: ArpgEvent[]) =>
  events.filter((e): e is Extract<ArpgEvent, { kind: 'cast' }> => e.kind === 'cast');
/** Seconds after `from` of each `holdStage` event (its stage) while `step` runs `seconds`. */
function stageTimes(w: ArpgWorld, from: () => number, seconds: number, step: () => ArpgEvent[]) {
  const out: [number, number][] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++)
    for (const e of step()) if (e.kind === 'holdStage') out.push([e.stage, w.t - from()]);
  return out;
}
/** `at` is the first tick at or after `time`. */
const tickAfter = (at: number, time: number) => {
  expect(at).toBeGreaterThanOrEqual(time - 1e-6);
  expect(at).toBeLessThan(time + STEP);
};
```

Replace:
```ts
    expect(computeHeroStats({}, registry).tempo).toBe(bal.hero.tempo);
  });
});
```
with:
```ts
    expect(computeHeroStats({}, registry).tempo).toBe(bal.hero.tempo);
  });
});

describe('holds by tempo', () => {
  const holdStep = (w: ArpgWorld) => stepWorld(registry, w, { move: still, holding: 0 }, STEP);
  /** A one-hold Fire Bolt chain on a sword (or `equipped`), basic attacks off, a foe up the arena. */
  const holder = (equipped?: EquippedGear) =>
    arena([dummy(13, 30)], { noBasic: true, primary: { kind: 'hold' }, equipped });

  it('reaches stage 1 at half its time and full power at 100%, scaled by tempo', () => {
    for (const [w, tempo] of [
      [holder(), 1],
      [holder(MAUL), 1.3],
    ] as const) {
      holdStep(w);
      const hold = w.hero.hold!;
      expect(hold).toMatchObject({
        full: bal.chains.holdTime * tempo,
        max: bal.chains.holdMax * tempo,
      });
      const stages = stageTimes(
        w,
        () => hold.start,
        1.5 * tempo,
        () => holdStep(w),
      );
      expect(stages.map(([s]) => s)).toEqual([1, 2]);
      tickAfter(stages[0][1], 0.5 * hold.full);
      tickAfter(stages[1][1], hold.full);
    }
  });

  it('fires by itself at holdMax × tempo', () => {
    const w = holder(MAUL);
    holdStep(w);
    const start = w.hero.hold!.start;
    let fired = -1;
    for (let i = 0; i < Math.round(3 / STEP) && fired < 0; i++)
      if (casts(holdStep(w)).length > 0) fired = w.t - start;
    tickAfter(fired, bal.chains.holdMax * 1.3);
  });

  it('a manual hold blow charges and fires by itself the same way', () => {
    const w = strikeWorld(MAUL, { basic: [{ kind: 'hold', element: 'fire' }] });
    const attack = () => stepWorld(registry, w, { move: still, attack: true }, STEP);
    for (let i = 0; i < 60 && w.hero.swing?.held == null; i++) attack();
    const held = w.hero.swing!.held!;
    let struck = -1;
    const stages = stageTimes(
      w,
      () => held,
      3,
      () => {
        const events = attack();
        if (struck < 0 && events.some((e) => e.kind === 'basic')) struck = w.t - held;
        return events;
      },
    );
    expect(stages.slice(0, 2).map(([s]) => s)).toEqual([1, 2]);
    tickAfter(stages[0][1], 0.5 * bal.chains.holdTime * 1.3);
    tickAfter(stages[1][1], bal.chains.holdTime * 1.3);
    tickAfter(struck, bal.chains.holdMax * 1.3);
  });

  it("a weapon swap mid-charge doesn't make the charge jump", () => {
    const w = holder();
    holdStep(w);
    const start = w.hero.hold!.start;
    for (let i = 0; i < Math.round(0.3 / STEP); i++) holdStep(w);
    refreshWorldHero(
      registry,
      w,
      computeHeroStats(MAUL, registry),
      chainsWith({ primary: { kind: 'hold' } }),
    );
    expect(w.hero.stats.tempo).toBe(1.3);
    expect(w.hero.hold).toMatchObject({ start, full: bal.chains.holdTime });
    const stages = stageTimes(
      w,
      () => start,
      1,
      () => holdStep(w),
    );
    expect(stages.map(([s]) => s)).toEqual([1, 2]);
    tickAfter(stages[1][1], bal.chains.holdTime);
  });
});
```

In `packages/engine/tests/delve-chains.test.ts`, the stage test calls `holdCharge` with the full-charge time, and checks stage 2 comes only at full charge:

Replace:
```ts
    expect(holdCharge(bal, start, start + c.holdStages[0] * c.holdTime - 0.01).stage).toBe(0);
    expect(holdCharge(bal, start, start + c.holdStages[0] * c.holdTime + 0.01).stage).toBe(1);
    expect(holdCharge(bal, start, start + c.holdStages[1] * c.holdTime + 0.01).stage).toBe(2);
    expect(holdCharge(bal, start, start + c.holdTime).charge).toBe(1);
```
with:
```ts
    const at = (s: number) => holdCharge(bal, start, start + s, c.holdTime);
    expect(at(c.holdStages[0] * c.holdTime - 0.01).stage).toBe(0);
    expect(at(c.holdStages[0] * c.holdTime + 0.01).stage).toBe(1);
    expect(at(c.holdTime - 0.01).stage).toBe(1);
    expect(at(c.holdTime)).toEqual({ charge: 1, stage: 2 });
```

In `packages/engine/tests/delve-training.test.ts`, the respawn test's hold gains its times:

Replace:
```ts
    h.hold = { slot: 0, step: 0, start: 0, aim: null };
```
with:
```ts
    h.hold = { slot: 0, step: 0, start: 0, aim: null, full: 1, max: 2 };
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chain-feel.test.ts tests/delve-chains.test.ts tests/delve-training.test.ts)`
Expected: 4 FAIL, 96 pass, all in "holds by tempo": "reaches stage 1 at half its time …" (expected { slot: +0, step: +0, …(2) } to match object { full: 1, max: 2 }), "fires by itself at holdMax × tempo" (expected 2.0000000000000027 to be greater than or equal to 2.599999), "a manual hold blow charges …" (expected 0.5000000000000003 to be greater than or equal to 0.649999) and "a weapon swap mid-charge …" (… to match object { start: 0.03333333333333333, full: 1 }).

- [ ] **Step 3: The hold's times**

In `packages/engine/src/types/arpg.ts`:

Replace:
```ts
   * (null: nothing in reach). Nothing is paid until it fires.
   */
  hold: { slot: number; step: number; start: number; aim: Vec | null } | null;
```
with:
```ts
   * (null: nothing in reach). Nothing is paid until it fires. `full` and `max`
   * are the seconds to its full charge and to its auto-fire (`holdTime` and
   * `holdMax` × the tempo), fixed when it began, so a weapon swap mid-charge
   * doesn't make it jump.
   */
  hold: {
    slot: number;
    step: number;
    start: number;
    aim: Vec | null;
    full: number;
    max: number;
  } | null;
```

In `packages/engine/src/arpg/abilities/cast.ts` (`holdCharge`, `startHold` fixing the times, `holdTick` reading them):

Replace:
```ts
/** A hold's charge at `t` (0..1 over `holdTime`) and its stage (by `holdStages`). */
```
with:
```ts
/**
 * A hold's charge at `t` (0..1 over `full`, the seconds to its full charge:
 * `HeroEntity.hold.full`, or `holdTime` × the tempo for a hold blow) and its
 * stage (by `holdStages`: stage 2 at full charge).
 */
```

Replace:
```ts
): { charge: number; stage: number } {
  const c = bal.chains;
  const charge = Math.min(1, (t - start) / c.holdTime + 1e-9);
  return { charge, stage: charge >= c.holdStages[1] ? 2 : charge >= c.holdStages[0] ? 1 : 0 };
```
with:
```ts
  full: number,
): { charge: number; stage: number } {
  const stages = bal.chains.holdStages;
  const charge = Math.min(1, (t - start) / full + 1e-9);
  return { charge, stage: charge >= stages[1] ? 2 : charge >= stages[0] ? 1 : 0 };
```

Replace:
```ts
  h.hold = { slot, step, start: t, aim };
```
with:
```ts
  const tempo = h.stats.tempo;
  h.hold = {
    slot,
    step,
    start: t,
    aim,
    full: bal.chains.holdTime * tempo,
    max: bal.chains.holdMax * tempo,
  };
```

Replace:
```ts
 * at its stage; past `holdMax` it fires by itself at stage 2 (and marks the
```
with:
```ts
 * at its stage; past its `max` it fires by itself at stage 2 (and marks the
```

Replace:
```ts
  const { stage } = holdCharge(bal, h.hold.start, t);
  if (release) releaseHold(ctx, release.aim ?? null, stage);
  else if (t - h.hold.start >= bal.chains.holdMax - 1e-9) {
```
with:
```ts
  const { start, full, max } = h.hold;
  const { stage } = holdCharge(bal, start, t, full);
  if (release) releaseHold(ctx, release.aim ?? null, stage);
  else if (t - start >= max - 1e-9) {
```

Replace:
```ts
    if (stage > holdCharge(bal, h.hold.start, t - dt).stage)
```
with:
```ts
    if (stage > holdCharge(bal, start, t - dt, full).stage)
```

In `packages/engine/src/arpg/basic.ts`, a manual hold blow by the hero's tempo:

Replace:
```ts
 * charges (stages by `holdStages`, saying so), and it strikes with its
 * stage's row when the attack lets go or at `holdMax` (stage 2). A blow held
```
with:
```ts
 * charges over `holdTime` × the hero's tempo (stages by `holdStages`, saying
 * so), and it strikes with its stage's row when the attack lets go or at
 * `holdMax` × the tempo (stage 2). A blow held
```

Replace:
```ts
  const { stage } = holdCharge(bal, sw.held, t);
  const full = t - sw.held >= bal.chains.holdMax - 1e-9;
```
with:
```ts
  // The hero's tempo now: a weapon swap drops the swing.
  const fullTime = bal.chains.holdTime * h.stats.tempo;
  const { stage } = holdCharge(bal, sw.held, t, fullTime);
  const full = t - sw.held >= bal.chains.holdMax * h.stats.tempo - 1e-9;
```

Replace:
```ts
  if (stage > holdCharge(bal, sw.held, t - dt).stage)
```
with:
```ts
  if (stage > holdCharge(bal, sw.held, t - dt, fullTime).stage)
```

In `packages/engine/src/arpg/bot.ts`:

Replace:
```ts
    if (holdCharge(ctx.bal, h.hold.start, world.t).charge >= 1) input.cast = { slot: h.hold.slot };
```
with:
```ts
    const { charge } = holdCharge(ctx.bal, h.hold.start, world.t, h.hold.full);
    if (charge >= 1) input.cast = { slot: h.hold.slot };
```

In `packages/engine/src/arpg/dps-sim.ts`:

Replace:
```ts
      const full = holdCharge(bal, h.hold.start, world.t).charge >= 1;
```
with:
```ts
      const full = holdCharge(bal, h.hold.start, world.t, h.hold.full).charge >= 1;
```

- [ ] **Step 4: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (100).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1278 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-chain-feel.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-training.test.ts packages/engine/src/types/arpg.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/bot.ts packages/engine/src/arpg/dps-sim.ts
git add packages/engine/tests/delve-chain-feel.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-training.test.ts packages/engine/src/types/arpg.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/bot.ts packages/engine/src/arpg/dps-sim.ts
git commit -m "feat(engine): holds charge and fire by the weapon's tempo, their times fixed when they start" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 2: Engine: beats and the per-slot buffer

### Task 3: Beats and the per-slot buffer

After a move lands (`fire`), its slot waits a beat before its chain's next move: `beatFor(bal, slot, kind, tempo)` = `chains.beat[kind]` × `chains.beatSlot[slot]` × tempo, where `kind` is the kind the move played as (`playedKind`: a hold's stage's, so a tap on a hold takes the medium beat and a full charge the hold beat). `HeroEntity.beatFrom`/`beatUntil` hold it; `fire` also sets `comboAt` to the beat's end, so the restart window counts from there and every reader of `pressStep` sees the chain's next move during the beat. `castAbility`, `startHold` and `abilityReady` wait for the beat's end (`inBeat`); the other slots and the dodge stay free, and a dodge neither ends nor shortens it.

The buffer becomes one press per slot, `ArpgWorld.queuedCasts` (`{ cast, until }` in press order). A waiting press doesn't age while the hero winds up, holds or dashes, or while its slot's beat runs; after that it has `feel.buffer` to fire. Each tick, of the waiting presses whose slot is ready (its beat over, its next move's cooldown up; the hero free), the one pressed first fires, so a Q press waiting on its beat survives an E press. A changed chain (`refreshWorldHero`) and a respawn clear the beat and the waiting press (`clearBeat`). Nothing here changes Galvanize (it cuts cooldowns, not beats), Nightstalker (it reads `pressStep`), the charge meter (it fills during a beat) or No cooldowns (beats stay on).

The test fixture's `press` steps while a wind-up runs; it learns to wait out its slot's beat (a press made during it waits and fires at its end), which fixes most tests that press a slot twice.

**Files:**
- Modify: `packages/engine/tests/delve-chain-feel.test.ts:5-25` (and the end)
- Modify: `packages/engine/src/arpg/abilities/resolve.ts:12,205-206` (CRLF: hand-edit) (`playedKind`, `beatFor`)
- Modify: `packages/engine/src/types/arpg.ts:305-307,602,624-627,636` (`beatFrom`/`beatUntil`, `QueuedCast`, `queuedCasts`)
- Modify: `packages/engine/src/arpg/abilities/cast.ts:8-32,69-77,111-123,168-176` (`inBeat`, the waits, `fire`)
- Modify: `packages/engine/src/arpg/step.ts:22,50-57,144-160` (the buffer)
- Modify: `packages/engine/src/arpg/action.ts:112` (`clearBeat`)
- Modify: `packages/engine/src/arpg/world.ts:22,208,239-240,268-269,340-341`, `packages/engine/src/arpg/sandbox.ts:16,266-267,288`
- Modify: `packages/engine/src/index.ts:210,218`
- Modify: `packages/engine/tests/fixtures/arena.ts:155-158`
- Modify: `packages/engine/tests/{ability-cast,ability-forms,delve-chains,delve-combat-weight,delve-training}.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-chain-feel.test.ts`, the imports and helpers, then the beat tests at the end:

Replace:
```ts
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
```
with:
```ts
import { inBeat, nextMove } from '../src/arpg/abilities/cast.js';
import { beatFor } from '../src/arpg/abilities/resolve.js';
import { respawnHero } from '../src/arpg/sandbox.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { ABILITY_SLOTS, MOVE_KINDS, type Move, type MoveKind } from '../src/types/ability.js';
```

Replace:
```ts
  dummy,
  gear,
  registry,
  strikeWorld,
```
with:
```ts
  dodge,
  dummy,
  gear,
  holdFor,
  press,
  pressOnly,
  registry,
  run,
  strikeWorld,
  type ArenaOpts,
```

Before:
```ts
const MAUL: EquippedGear = {
```
add:
```ts
const WINDOW = bal.abilities.comboWindow;
/** A move of `kind`: a Fire Bolt. */
const m = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
/** Basic attacks off, a foe up the arena, the Primary a chain of `moves` (two mediums by default). */
const beater = (moves: Move[] = [m('medium'), m('medium')], o: ArenaOpts = {}) =>
  arena([dummy(13, 30)], { noBasic: true, primary: { moves }, ...o });
/** Step (with `input`) until `done` says so of a step's events: every event, and the time then. */
function until(w: ArpgWorld, done: (events: ArpgEvent[]) => boolean, input = {}) {
  const events: ArpgEvent[] = [];
  for (let i = 0; i < 300; i++) {
    const e = stepWorld(registry, w, { move: still, ...input }, STEP);
    events.push(...e);
    if (done(e)) return { events, at: w.t };
  }
  throw new Error('never came');
}
const windup = (slot: number) => (events: ArpgEvent[]) =>
  events.some((e) => e.kind === 'windup' && e.slot === slot);
const castSlots = (events: ArpgEvent[]) =>
  events.flatMap((e) => (e.kind === 'cast' ? [e.slot] : []));
```

Replace:
```ts
    tickAfter(stages[1][1], bal.chains.holdTime);
  });
});
```
with:
```ts
    tickAfter(stages[1][1], bal.chains.holdTime);
  });
});

describe('beats', () => {
  const beatOf = (w: ArpgWorld, slot = 0) => w.hero.beatUntil[slot] - w.hero.beatFrom[slot];

  it("each kind's and slot's beat, by tempo; a tap on a hold takes the medium's, a full charge the hold's", () => {
    for (const kind of MOVE_KINDS)
      for (const slot of ABILITY_SLOTS)
        for (const tempo of [0.8, 1, 1.3])
          expect(beatFor(bal, slot, kind, tempo)).toBeCloseTo(
            bal.chains.beat[kind] * bal.chains.beatSlot[slot] * tempo,
          );
    const light = beater([m('light')], { equipped: MAUL });
    press(light, 0);
    expect(beatOf(light)).toBeCloseTo(0.25 * 1.3);
    const ult = beater([m('medium')], { ultimate: { kind: 'heavy' } });
    ult.hero.charge[2] = 100;
    press(ult, 2);
    expect(beatOf(ult, 2)).toBeCloseTo(0.6 * 1.5);
    const ward = beater();
    press(ward, 1);
    expect(beatOf(ward, 1)).toBeCloseTo(0.4 * 0.75);
    const tap = beater([m('hold')]);
    press(tap, 0);
    expect(beatOf(tap)).toBeCloseTo(bal.chains.beat.medium);
    const full = beater([m('hold')]);
    holdFor(full, 0, bal.chains.holdTime);
    expect(beatOf(full)).toBeCloseTo(bal.chains.beat.hold);
  });

  it("a press during the beat waits and fires at the beat's end", () => {
    const w = beater();
    press(w, 0);
    const end = w.hero.beatUntil[0];
    expect(inBeat(w.hero, 0, w.t)).toBe(true);
    pressOnly(w, 0);
    expect(w.hero.windup).toBeNull();
    expect(w.queuedCasts.map((q) => q.cast.slot)).toEqual([0]);
    tickAfter(until(w, windup(0)).at, end);
  });

  it('a Q press waiting on its beat survives an E press, and both fire', () => {
    const w = beater();
    press(w, 0);
    pressOnly(w, 0);
    const events = pressOnly(w, 1);
    expect(windup(1)(events)).toBe(true);
    expect(w.queuedCasts.map((q) => q.cast.slot)).toEqual([0]);
    expect(castSlots(until(w, windup(0)).events)).toEqual([1]);
    expect(w.queuedCasts).toEqual([]);
  });

  it('a press whose move is still cooling after the beat ages through the buffer, as before', () => {
    const cooling = (extra: number) => {
      const w = beater();
      press(w, 0);
      w.hero.cooldowns[0][1] = w.hero.beatUntil[0] + extra;
      pressOnly(w, 0);
      return w;
    };
    const soon = cooling(bal.feel.buffer / 2);
    const ready = soon.hero.cooldowns[0][1];
    tickAfter(until(soon, windup(0)).at, ready);
    const late = cooling(bal.feel.buffer + 0.2);
    expect(windup(0)(run(late, 1))).toBe(false);
    expect(late.queuedCasts).toEqual([]);
  });

  it("a hold held through the beat starts charging at the beat's end", () => {
    const w = beater([m('light'), m('hold')]);
    press(w, 0);
    const end = w.hero.beatUntil[0];
    until(w, () => w.hero.hold !== null, { holding: 0 });
    tickAfter(w.hero.hold!.start, end);
  });

  it('other slots and the dodge stay free during a beat, and a dodge neither ends nor shortens it', () => {
    const e = beater();
    press(e, 0);
    expect(windup(1)(pressOnly(e, 1))).toBe(true);
    expect(inBeat(e.hero, 0, e.t)).toBe(true);

    const d = beater();
    press(d, 0);
    const end = d.hero.beatUntil[0];
    expect(dodge(d, { x: 1, y: 0 }).some((ev) => ev.kind === 'dodge')).toBe(true);
    expect(d.hero.beatUntil[0]).toBe(end);
    pressOnly(d, 0);
    tickAfter(until(d, windup(0)).at, end);
  });

  it("the restart window counts from the beat's end; during the beat a press reads the chain's next move", () => {
    const w = beater();
    press(w, 0);
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(1);
    run(w, w.hero.beatUntil[0] - w.t + WINDOW - 0.1);
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(1);
    run(w, 0.2);
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(0);
  });

  it('a changed chain clears its beat and its waiting press; the other slots keep theirs', () => {
    const w = beater();
    press(w, 1);
    press(w, 0);
    pressOnly(w, 0);
    const ward = w.hero.beatUntil[1];
    expect(inBeat(w.hero, 1, w.t)).toBe(true);
    refreshWorldHero(
      registry,
      w,
      w.hero.stats,
      chainsWith({ primary: { moves: [m('heavy'), m('medium')] } }),
    );
    expect(inBeat(w.hero, 0, w.t)).toBe(false);
    expect(w.queuedCasts).toEqual([]);
    expect(w.hero.beatUntil[1]).toBe(ward);
  });

  it('a respawn clears every beat and waiting press', () => {
    const w = beater();
    press(w, 1);
    press(w, 0);
    pressOnly(w, 0);
    respawnHero(registry, w);
    for (const slot of [0, 1, 2]) expect(inBeat(w.hero, slot, w.t)).toBe(false);
    expect(w.queuedCasts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chain-feel.test.ts)`
Expected: 9 FAIL, 7 pass: every test in "beats" ((0 , beatFor) is not a function; Cannot read properties of undefined (reading '0'), for `beatUntil`; (0 , inBeat) is not a function; the Q/E test's expected false to be true).

- [ ] **Step 3: The beat**

In `packages/engine/src/arpg/abilities/resolve.ts` (CRLF: hand-edit), after `stepBonus`:

Before:
```ts
  type ResolvedAbility,
```
add:
```ts
  type MoveKind,
```

Replace:
```ts
/**
 * A move's numbers as the sim uses them: its hit before the foe's modifiers
```
with:
```ts
/** The kind a move plays as: a hold's stage's (`HOLD_STAGE_KINDS`: a tap on one plays as a medium). */
export function playedKind(ab: ResolvedAbility): MoveKind {
  return ab.kind === 'hold' ? HOLD_STAGE_KINDS[ab.stage] : ab.kind;
}

/**
 * The beat after a move lands: the seconds its slot waits before the chain's
 * next move can start, by the kind it played as (`playedKind`), its slot and
 * the hero's tempo (see the chain feel spec).
 */
export function beatFor(
  bal: DelveBalance,
  slot: AbilitySlot,
  kind: MoveKind,
  tempo: number,
): number {
  return bal.chains.beat[kind] * bal.chains.beatSlot[slot] * tempo;
}

/**
 * A move's numbers as the sim uses them: its hit before the foe's modifiers
```

In `packages/engine/src/types/arpg.ts`, the hero's beats, and the buffer (`QueuedCast` goes before `ArpgWorld`):

Replace:
```ts
  /** Per slot: the move of the last cast and when it landed (a press's move is chosen from these). */
  comboStep: number[];
  comboAt: number[];
```
with:
```ts
  /**
   * Per slot: the move of the last cast, and when its chain's restart window
   * starts: its landing plus its beat (a press's move is chosen from these).
   */
  comboStep: number[];
  comboAt: number[];
  /**
   * Per slot: the beat after the last move landed, from `beatFrom` to
   * `beatUntil`; the slot's next move waits for its end (see the chain feel spec).
   */
  beatFrom: number[];
  beatUntil: number[];
```

Replace:
```ts
export interface ArpgWorld {
```
with:
```ts
/** An ability press waiting to fire (see `ArpgWorld.queuedCasts`). */
export interface QueuedCast {
  cast: AbilityCast;
  until: number;
}

export interface ArpgWorld {
```

Replace:
```ts
  /** One-shot inputs waiting for the next simulation step. */
  queuedCast: AbilityCast | null;
  /** The queued cast is dropped after this time: the end of whatever kept the hero busy, plus the buffer. */
  queuedCastUntil: number;
```
with:
```ts
  /**
   * Ability presses waiting to fire, at most one per slot, in the order they
   * were pressed. Each is dropped after its `until`: the end of whatever held
   * it (a wind-up, a hold, a dash, its slot's beat), plus the buffer.
   */
  queuedCasts: QueuedCast[];
```

Replace:
```ts
  /** A manual attack tap waiting for the weapon (see `queuedCastUntil`). */
```
with:
```ts
  /** A manual attack tap waiting for the weapon (see `queuedCasts`). */
```

In `packages/engine/src/arpg/abilities/cast.ts` (`inBeat`; `abilityReady`, `castAbility` and `startHold` wait for the beat; `fire` starts it):

Replace:
```ts
import { chainMove, stepBonus, stepHeft } from './resolve.js';
```
with:
```ts
import { beatFor, chainMove, playedKind, stepBonus, stepHeft } from './resolve.js';
```

Replace:
```ts
/** Can the slot's next move be used right now (ignoring targets)? For the HUD and bots. */
```
with:
```ts
/** Whether the slot's beat still runs at `t` (its next move waits for its end). */
export function inBeat(h: HeroEntity, slot: number, t: number): boolean {
  return t < h.beatUntil[slot] - 1e-9;
}

/** Can the slot's next move be used right now (ignoring targets)? For the HUD and bots. */
```

Replace:
```ts
  if (!chain || h.windup || h.hold) return false;
  const step = pressStep(h, slot, ctx.world.t, ctx.bal.abilities.comboWindow);
```
with:
```ts
  if (!chain || h.windup || h.hold || inBeat(h, slot, ctx.world.t)) return false;
  const step = pressStep(h, slot, ctx.world.t, ctx.bal.abilities.comboWindow);
```

Replace:
```ts
 * The chain's move a press at `t` casts: the one after the last landed within
 * `window` of it (wrapping after the last move), else the first.
```
with:
```ts
 * The chain's move a press at `t` casts: the one after the last landed, while
 * `t` is within `window` of its beat's end (wrapping after the last move),
 * else the first.
```

Replace:
```ts
/** Fire move `step` of the slot's chain (a hold at `stage`) now, then its recoil and recovery. */
```
with:
```ts
/**
 * Fire move `step` of the slot's chain (a hold at `stage`) now, then its
 * recoil and recovery. Its slot's beat starts: the chain's next move waits for
 * its end, and the restart window counts from there.
 */
```

Replace:
```ts
  h.comboStep[slot] = step;
  h.comboAt[slot] = world.t;
```
with:
```ts
  const beat = beatFor(bal, ab.slot, playedKind(ab), h.stats.tempo);
  h.comboStep[slot] = step;
  h.comboAt[slot] = world.t + beat;
  h.beatFrom[slot] = world.t;
  h.beatUntil[slot] = world.t + beat;
```

Replace:
```ts
 * another is winding up, on that move's cooldown, uncharged, unaffordable
 * (with a `noMana` event, and the chain doesn't advance) or with nothing to aim
 * at. Otherwise it pays now, drops a basic swing still winding up, and winds
```
with:
```ts
 * another is winding up, in its slot's beat, on that move's cooldown,
 * uncharged, unaffordable (with a `noMana` event, and the chain doesn't
 * advance) or with nothing to aim at. Otherwise it pays now, drops a basic swing still winding up, and winds
```

Replace:
```ts
  if (!chain || h.windup || h.hold) return false;
```
with:
```ts
  if (!chain || h.windup || h.hold || inBeat(h, slot, t)) return false;
```

Replace:
```ts
 * as a press needs (a swing winding up gives way) and its first stage is
 * affordable. Nothing is paid yet; the hero faces what it aims at.
```
with:
```ts
 * as a press needs (a swing winding up gives way), its slot's beat is over and
 * its first stage is affordable. Nothing is paid yet; the hero faces what it
 * aims at.
```

Replace:
```ts
  if (!chain || h.windup) return;
```
with:
```ts
  if (!chain || h.windup || inBeat(h, slot, t)) return;
```

- [ ] **Step 4: The per-slot buffer**

In `packages/engine/src/arpg/step.ts` (a press joins the buffer in its slot's place; each tick the first-pressed ready one fires):

Replace:
```ts
import { castAbility, castTick, holdTick, pressStep } from './abilities/cast.js';
```
with:
```ts
import { castAbility, castTick, holdTick, inBeat, pressStep } from './abilities/cast.js';
```

Replace:
```ts
  if (input.cast) {
    // A press of the slot whose hold runs is its release; a dropped hold's release is
    // swallowed; another slot's press waits its turn.
    if (world.hero.hold?.slot === input.cast.slot) world.queuedRelease = input.cast;
    else if (world.holdDropped === input.cast.slot) world.holdDropped = null;
    else {
      world.queuedCast = input.cast;
      world.queuedCastUntil = world.t + buffer;
```
with:
```ts
  const cast = input.cast;
  if (cast) {
    // A press of the slot whose hold runs is its release; a dropped hold's release is
    // swallowed; any other press waits in the buffer, replacing its slot's older press.
    if (world.hero.hold?.slot === cast.slot) world.queuedRelease = cast;
    else if (world.holdDropped === cast.slot) world.holdDropped = null;
    else {
      world.queuedCasts = world.queuedCasts.filter((q) => q.cast.slot !== cast.slot);
      world.queuedCasts.push({ cast, until: world.t + buffer });
```

Replace:
```ts
  // A queued press waits out a wind-up, a hold or a dash; anything else lets it through.
  // A press held so doesn't age: it gets `buffer` from when the hero is free.
  if (world.queuedCast !== null && (dashing || h.windup || h.hold))
    world.queuedCastUntil = Math.max(world.queuedCastUntil, t + bal.feel.buffer);
  if (world.queuedCast !== null && t > world.queuedCastUntil) world.queuedCast = null;
  // A press whose move is on cooldown stays queued (ageing) and fires if the cooldown ends in time.
  const q = world.queuedCast;
  if (
    q !== null &&
    !dashing &&
    !h.windup &&
    !h.hold &&
    !!h.chains[q.slot] &&
    t >= h.cooldowns[q.slot][pressStep(h, q.slot, t, bal.abilities.comboWindow)]
  ) {
    world.queuedCast = null;
    castAbility(ctx, q);
```
with:
```ts
  const busy = dashing || !!h.windup || !!h.hold;
  // The waiting presses (one per slot) wait out a wind-up, a hold, a dash and their slot's
  // beat without ageing: each gets `buffer` from then.
  for (const q of world.queuedCasts)
    if (busy || inBeat(h, q.cast.slot, t)) q.until = Math.max(q.until, t + bal.feel.buffer);
  world.queuedCasts = world.queuedCasts.filter((q) => t <= q.until);
  // Of those whose slot is ready (its beat over, its move off cooldown), the one pressed first
  // fires. One on cooldown stays (ageing) and fires if the cooldown ends in time.
  const ready = (slot: number) =>
    !!h.chains[slot] &&
    !inBeat(h, slot, t) &&
    t >= h.cooldowns[slot][pressStep(h, slot, t, bal.abilities.comboWindow)];
  const q = busy ? undefined : world.queuedCasts.find((p) => ready(p.cast.slot));
  if (q) {
    world.queuedCasts = world.queuedCasts.filter((p) => p !== q);
    castAbility(ctx, q.cast);
```

- [ ] **Step 5: Clearing a beat**

In `packages/engine/src/arpg/action.ts`, before `dropHold`:

Replace:
```ts
/** Drop a charging hold, unpaid, marking its slot so its release (the button let go) is swallowed. */
```
with:
```ts
/**
 * End the slot's beat now and drop its waiting press (a changed chain, a
 * respawn); its restart window counts from now at the latest.
 */
export function clearBeat(world: ArpgWorld, slot: number): void {
  const h = world.hero;
  h.beatUntil[slot] = Math.min(h.beatUntil[slot], world.t);
  h.comboAt[slot] = Math.min(h.comboAt[slot], world.t);
  world.queuedCasts = world.queuedCasts.filter((q) => q.cast.slot !== slot);
}

/** Drop a charging hold, unpaid, marking its slot so its release (the button let go) is swallowed. */
```

In `packages/engine/src/arpg/world.ts` (a new hero has no beat; a new world no waiting press; a changed chain clears its slot's):

Replace:
```ts
import { cancelWindup, dropHold } from './action.js';
```
with:
```ts
import { cancelWindup, clearBeat, dropHold } from './action.js';
```

Before:
```ts
    windup: null,
```
add:
```ts
    beatFrom: [0, 0, 0],
    beatUntil: [0, 0, 0],
```

Replace:
```ts
 * drops its wind-up (as a dodge does) and its hold, and a new Defensive ends
 * the old one's buff and Ward at once, without bursting.
```
with:
```ts
 * drops its wind-up (as a dodge does), its hold, its beat and its waiting
 * press, and a new Defensive ends the old one's buff and Ward at once, without
 * bursting.
```

Replace:
```ts
  // A changed slot's hold is dropped, unpaid.
  if (h.hold && changed[h.hold.slot]) dropHold(world);
```
with:
```ts
  // A changed slot's hold is dropped, unpaid, and its beat and waiting press go.
  if (h.hold && changed[h.hold.slot]) dropHold(world);
  changed.forEach((c, i) => {
    if (c) clearBeat(world, i);
  });
```

Replace:
```ts
    queuedCast: null,
    queuedCastUntil: 0,
```
with:
```ts
    queuedCasts: [],
```

In `packages/engine/src/arpg/sandbox.ts`, a respawn clears every slot's:

Before:
```ts
import { livingBossId } from './combat.js';
```
add:
```ts
import { clearBeat } from './action.js';
```

Replace:
```ts
 * life and potions and Phoenix ready, every action and buff cleared, and a
 * second of invulnerability so a crowd can't kill it again at once. Monsters stay.
```
with:
```ts
 * life and potions and Phoenix ready, every action, beat, waiting press and
 * buff cleared, and a second of invulnerability so a crowd can't kill it again
 * at once. Monsters stay.
```

After:
```ts
  h.invulnUntil = t + 1;
```
add:
```ts
  h.chains.forEach((_, i) => clearBeat(world, i));
```

In `packages/engine/src/index.ts`:

Before:
```ts
} from './arpg/abilities/cast.js';
```
add:
```ts
  inBeat,
```

Before:
```ts
  moveNumbers,
```
add:
```ts
  beatFor,
  playedKind,
```

- [ ] **Step 6: Run the new tests, then the suite**

Run the Step 2 command again.
Expected: PASS (16).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 15 FAIL in 4 files, every one a test that presses a slot again during its beat, or reads the old buffer: `ability-forms` (Bolt's default chain …, the last move of a Strike chain …), `delve-combat-weight` (presses made while the display is frozen …, a bolt recoils the hero …, a press made just before the cooldown ends …, a press made well before the cooldown ends ages out), `delve-chains` (steps through the chain and wraps …, moveNumbers gives the hit …, each move pays its own cost …, refuses a move it can't afford …, a Ward → Blink chain's second press …, a Blink's trail hits …, a shortened chain clamps the step …, gates presses as a wind-up does …) and `delve-training` (no cooldowns: the same ability fires again right after it lands …). The next step fixes them.

- [ ] **Step 7: The fixture and the tests the beat changes**

In `packages/engine/tests/fixtures/arena.ts`, `press` waits out its slot's beat:

Replace:
```ts
/** Press an ability (0 Primary, 1 Defensive, 2 Ultimate) and run until its wind-up lands, returning every event. */
export function press(w: ArpgWorld, slot: number, aim?: { x: number; y: number }): ArpgEvent[] {
  const events = pressOnly(w, slot, aim);
  for (let i = 0; i < 300 && w.hero.windup; i++)
```
with:
```ts
/**
 * Press an ability (0 Primary, 1 Defensive, 2 Ultimate) and run until its wind-up lands (a press
 * made during its slot's beat waits for the beat's end first), returning every event.
 */
export function press(w: ArpgWorld, slot: number, aim?: { x: number; y: number }): ArpgEvent[] {
  const events = pressOnly(w, slot, aim);
  const waiting = () =>
    w.hero.beatUntil[slot] > w.t + 1e-9 && w.queuedCasts.some((q) => q.cast.slot === slot);
  for (let i = 0; i < 300 && (w.hero.windup || waiting()); i++)
```

In `packages/engine/tests/ability-cast.test.ts` (not among Step 6's failures: it breaks only once `press` waits out the beat, because the Bolt's cooldown, 0.45 s from the press, ends inside its beat, 0.4 s from the landing), the test checks the cooldown directly and makes one long enough to refuse a press:

After:
```ts
    const cost = moveOf(w, 0).cost;
```
add:
```ts
    const pressed = w.t + STEP;
```

Replace:
```ts
    expect(press(w, 0).some((e) => e.kind === 'cast')).toBe(false);
    run(w, moveOf(w, 0).cooldown);
```
with:
```ts
    // Its cooldown counts from the press (its beat, from the landing, outlasts it here).
    expect(w.hero.cooldowns[0][0]).toBeCloseTo(pressed + moveOf(w, 0).cooldown);
    w.hero.cooldowns[0][0] = w.t + 5;
    expect(press(w, 0).some((e) => e.kind === 'cast')).toBe(false);
    run(w, 5);
```

In `packages/engine/tests/ability-forms.test.ts`, the restart waits the window from the beat's end:

Replace:
```ts
    run(w, bal.abilities.comboWindow + 0.1);
```
with:
```ts
    // The restart window counts from the beat's end.
    run(w, w.hero.beatUntil[0] - w.t + bal.abilities.comboWindow + 0.1);
```

In `packages/engine/tests/delve-chains.test.ts` (the restart from the beat's end; the buffer is per slot):

Replace:
```ts
    run(w, WINDOW + 0.1);
```
with:
```ts
    // The restart window counts from the beat's end.
    run(w, w.hero.beatUntil[0] - w.t + WINDOW + 0.1);
```

Replace:
```ts
    expect(w.queuedCast).not.toBeNull();
```
with:
```ts
    expect(w.queuedCasts).toHaveLength(1);
```

Replace:
```ts
    expect(w.queuedCast).toMatchObject({ slot: 1 });
```
with:
```ts
    expect(w.queuedCasts.map((q) => q.cast)).toMatchObject([{ slot: 1 }]);
```

In `packages/engine/tests/delve-combat-weight.test.ts`, the buffer tests read the per-slot buffer:

Replace:
```ts
    expect(w.queuedCast).toEqual({ slot: 0 });
    expect(w.queuedCastUntil).toBeGreaterThan(w.t);
```
with:
```ts
    expect(w.queuedCasts.map((q) => q.cast)).toEqual([{ slot: 0 }]);
    expect(w.queuedCasts[0].until).toBeGreaterThan(w.t);
```

Replace:
```ts
    expect(w.queuedCast).toEqual({ slot: 0, aim: null });
```
with:
```ts
    expect(w.queuedCasts.map((q) => q.cast)).toEqual([{ slot: 0, aim: null }]);
```

Replace:
```ts
    expect(w.queuedCast).toBeNull();
```
with:
```ts
    expect(w.queuedCasts).toEqual([]);
```

Replace:
```ts
    expect(w.queuedCast).not.toBeNull();
```
with:
```ts
    expect(w.queuedCasts).toHaveLength(1);
```

Replace:
```ts
    s.queuedCast = { slot: 0 };
    s.queuedCastUntil = s.t - 1;
```
with:
```ts
    s.queuedCasts = [{ cast: { slot: 0 }, until: s.t - 1 }];
```

In `packages/engine/tests/delve-training.test.ts`, No cooldowns leaves the beats on: the Ward (10 s cooldown) goes again right after its beat with the switch on, and not off; the Nova waits its beat too:

Replace:
```ts
  it('no cooldowns: the same ability fires again right after it lands, and charge stays full', () => {
```
with:
```ts
  it('no cooldowns: the same ability fires again right after its beat, and charge stays full', () => {
```

Replace:
```ts
      press(w, 0);
      pressOnly(w, 0);
    }
    expect(on.hero.windup?.slot).toBe(0);
    expect(off.hero.windup).toBeNull(); // 0.45 s cooldown
```
with:
```ts
      press(w, 1);
      pressOnly(w, 1);
    }
    // The beat stays on: the press waits for its end.
    expect(on.hero.windup).toBeNull();
    for (const w of [on, off]) run(w, w.hero.beatUntil[1] - w.t);
    expect(on.hero.windup?.slot).toBe(1);
    expect(off.hero.windup).toBeNull(); // a 10 s cooldown
```

Before:
```ts
    expect(u.hero.windup?.slot).toBe(2);
  });
```
add:
```ts
    run(u, u.hero.beatUntil[2] - u.t);
```

- [ ] **Step 8: Run the suite**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1287 tests pass.

- [ ] **Step 9: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-chain-feel.test.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/ability-cast.test.ts packages/engine/tests/ability-forms.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/delve-training.test.ts packages/engine/src/types/arpg.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/action.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/index.ts
git add packages/engine/tests/delve-chain-feel.test.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/ability-cast.test.ts packages/engine/tests/ability-forms.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/delve-training.test.ts packages/engine/src/arpg/abilities/resolve.ts packages/engine/src/types/arpg.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/action.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/index.ts
git commit -m "feat(engine): each move's slot waits a beat after it lands; one buffered press per slot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 3: Engine: the basic swing while a press waits

### Task 4: The swing rule

While a press waits to fire, a basic swing (automatic or manual) starts only if its strike comes no later than the tick that press will fire: the later of its slot's beat end and its next move's cooldown, the earliest over every waiting press (`pressDue` in `step.ts`). A held ability button (`input.holding`) whose slot waits on its beat or its next move's cooldown counts as a waiting press (the player means that slot next), unless its hold was dropped (`holdDropped`). `startSwing` takes the tick as `deadline`. A press due in the tick a swing strikes, and a held hold move due to start charging then, waits one tick so the blow lands first (`swingStrikes`, in the dequeue and in `startHold`); that tick doesn't age a waiting press. A manual attack tap held back by the rule doesn't age. So no swing that starts while a press waits is cut by that press.

**Files:**
- Modify: `packages/engine/tests/delve-chain-feel.test.ts` (the end)
- Modify: `packages/engine/src/arpg/action.ts:94` (`swingStrikes`)
- Modify: `packages/engine/src/arpg/abilities/cast.ts:5,181-190` (`startHold`)
- Modify: `packages/engine/src/arpg/step.ts:29,146-157,205-235` (the ageing and the dequeue, the swing rule, `pressDue`)
- Modify: `packages/engine/src/arpg/basic.ts:67-90` (`startSwing`'s `deadline`)

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-chain-feel.test.ts`, at the end. The fighter stands a sword's reach from a foe with its weapon idle until armed, so each test starts a swing on a chosen tick: `idleUntilPast(w, at)` leaves it where a swing started next tick would strike just after `at`.

Replace:
```ts
    expect(w.queuedCasts).toEqual([]);
  });
});
```
with:
```ts
    expect(w.queuedCasts).toEqual([]);
  });
});

describe('the basic swing while a press waits', () => {
  /** Basic attacks on (a sword, or `equipped`) at a foe in reach, the Primary two medium Bolts; the weapon idle until armed. */
  const fighter = (equipped?: EquippedGear, moves?: Move[]) => {
    const w = beater(moves, { equipped });
    w.monsters = arena([dummy(13, 34.4)]).monsters;
    w.hero.nextAttackAt = 1e9;
    return w;
  };
  /** Seconds from a swing of the chain's first blow to its strike. */
  const startup = (w: ArpgWorld) => {
    const b = w.hero.stats.weapon.blows[0];
    return w.hero.stats.attackInterval * b.time * b.startup;
  };
  /** Step, the weapon idle, until a swing starting next tick would strike after `at`. */
  const idleUntilPast = (w: ArpgWorld, at: number, input = {}) => {
    while (w.t + STEP + startup(w) <= at) stepWorld(registry, w, { move: still, ...input }, STEP);
  };
  /** Step until `done`: the swings that start, and the blows and wind-ups in order. */
  const watch = (w: ArpgWorld, done: () => boolean, input = {}) => {
    let swings = 0;
    const order: string[] = [];
    for (let i = 0; i < 300 && !done(); i++) {
      const before = w.hero.swing;
      for (const e of stepWorld(registry, w, { move: still, ...input }, STEP))
        if (e.kind === 'basic' || e.kind === 'windup') order.push(e.kind);
      if (w.hero.swing && w.hero.swing !== before) swings++;
    }
    return { swings, order, at: w.t };
  };
  const windingUp = (w: ArpgWorld) => () => w.hero.windup !== null;
  const arm = (w: ArpgWorld) => {
    w.hero.nextAttackAt = w.t;
  };

  it("a swing that strikes by the press's tick starts and lands first; one that wouldn't doesn't start", () => {
    const fits = fighter();
    press(fits, 0);
    const end = fits.hero.beatUntil[0];
    pressOnly(fits, 0);
    watch(fits, () => fits.hero.push === null); // the Bolt's recoil
    expect(end - fits.t).toBeGreaterThan(startup(fits) + STEP);
    arm(fits);
    const a = watch(fits, windingUp(fits));
    expect(a.order).toEqual(['basic', 'windup']);
    tickAfter(a.at, end);

    const late = fighter();
    press(late, 0);
    const lateEnd = late.hero.beatUntil[0];
    pressOnly(late, 0);
    idleUntilPast(late, lateEnd);
    arm(late);
    const b = watch(late, windingUp(late));
    expect(b).toMatchObject({ swings: 0, order: ['windup'] });
    tickAfter(b.at, lateEnd);
  });

  it('the same for a press waiting on its move cooling after the beat', () => {
    const cooling = () => {
      const w = fighter();
      press(w, 0);
      const ready = w.hero.beatUntil[0] + 0.19;
      w.hero.cooldowns[0][1] = ready;
      pressOnly(w, 0);
      return { w, ready };
    };
    // Too late for the beat alone, in time for the cooldown.
    const fits = cooling();
    idleUntilPast(fits.w, fits.w.hero.beatUntil[0]);
    arm(fits.w);
    const a = watch(fits.w, windingUp(fits.w));
    expect(a.order).toEqual(['basic', 'windup']);
    tickAfter(a.at, fits.ready);

    const late = cooling();
    idleUntilPast(late.w, late.ready);
    arm(late.w);
    expect(watch(late.w, windingUp(late.w))).toMatchObject({ swings: 0, order: ['windup'] });
  });

  it("a held ability button waiting on its beat or cooldown counts as a press; a dropped hold's doesn't", () => {
    /** Swings that start before slot 0's beat (or, `cooling`, the Ward's cooldown) ends. */
    const swings = (input: object, o: { dropped?: boolean; cooling?: boolean } = {}) => {
      const w = fighter();
      const slot = o.cooling ? 1 : 0;
      press(w, slot);
      if (o.cooling) {
        run(w, w.hero.beatUntil[1] - w.t + STEP);
        w.hero.cooldowns[1][0] = w.t + 0.5;
      }
      const ready = Math.max(w.hero.beatUntil[slot], w.hero.cooldowns[slot][0]);
      idleUntilPast(w, ready, input);
      if (o.dropped) w.holdDropped = slot;
      arm(w);
      return watch(w, () => w.t + STEP >= ready - 1e-9, input).swings;
    };
    expect(swings({ holding: 0 })).toBe(0);
    expect(swings({})).toBe(1);
    expect(swings({ holding: 0 }, { dropped: true })).toBe(1);
    expect(swings({ holding: 1 }, { cooling: true })).toBe(0);
    expect(swings({}, { cooling: true })).toBe(1);
  });

  it('a blow due in the tick the press fires lands first, the press a tick later; so does a held hold', () => {
    const w = fighter();
    press(w, 0);
    const end = w.hero.beatUntil[0];
    pressOnly(w, 0);
    idleUntilPast(w, end - STEP);
    arm(w);
    const times: Record<string, number> = {};
    for (let i = 0; i < 60 && !w.hero.windup; i++)
      for (const e of stepWorld(registry, w, { move: still }, STEP)) times[e.kind] ??= w.t;
    tickAfter(times.basic, end);
    expect(times.windup - times.basic).toBeCloseTo(STEP);

    const h = fighter(undefined, [m('medium'), m('hold')]);
    press(h, 0);
    const hEnd = h.hero.beatUntil[0];
    const holding = { holding: 0 };
    idleUntilPast(h, hEnd - STEP, holding);
    arm(h);
    let struck = -1;
    for (let i = 0; i < 60 && !h.hero.hold; i++)
      if (stepWorld(registry, h, { move: still, ...holding }, STEP).some((e) => e.kind === 'basic'))
        struck = h.t;
    tickAfter(struck, hEnd);
    expect(h.hero.hold!.start - struck).toBeCloseTo(STEP);
  });

  it("a manual attack tap held back by a waiting press doesn't age", () => {
    const w = fighter(MAUL);
    press(w, 0);
    const end = w.hero.beatUntil[0];
    pressOnly(w, 0);
    const manual = { attack: false };
    watch(w, () => w.hero.push === null, manual);
    // Held back from now to the beat's end: longer than the buffer.
    expect(end - w.t).toBeLessThan(startup(w));
    expect(end - w.t).toBeGreaterThan(bal.feel.buffer + STEP);
    arm(w);
    stepWorld(registry, w, { move: still, ...manual, attackTap: true }, STEP);
    const r = watch(w, () => w.hero.swing !== null, manual);
    expect(r).toMatchObject({ swings: 1, order: ['windup'] });
  });

  it('no swing that starts while a press waits is cut by it: mashing Q fills the beats with blows', () => {
    const w = fighter();
    w.hero.nextAttackAt = 0;
    const waited = new Set<object>();
    let cut = 0;
    let blows = 0;
    for (let i = 0; i < Math.round(6 / STEP); i++) {
      const before = w.hero.swing;
      const waiting = w.queuedCasts.length > 0;
      const events = stepWorld(registry, w, { move: still, cast: { slot: 0 } }, STEP);
      const struck = events.some((e) => e.kind === 'basic');
      if (struck) blows++;
      if (before && waited.has(before) && w.hero.swing !== before && !struck) cut++;
      if (w.hero.swing && w.hero.swing !== before && waiting) waited.add(w.hero.swing);
    }
    expect(waited.size).toBeGreaterThan(0);
    expect(blows).toBeGreaterThan(0);
    expect(cut).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chain-feel.test.ts)`
Expected: 6 FAIL, 16 pass: every test in "the basic swing while a press waits" (a swing that wouldn't land in time starts and is cut: expected { Object (swings, order, ...) } to match object { swings: +0, order: [ 'windup' ] }; the held button: expected 1 to be +0; the same tick: actual value must be number or bigint, received "undefined"; the tap: expected { swings: +0, order: [], …(1) } to match object { swings: 1, order: [ 'windup' ] }; mashing Q: expected 6 to be +0).

- [ ] **Step 3: A swing striking this tick lands first**

In `packages/engine/src/arpg/action.ts`, before `cancelSwing`:

Replace:
```ts
/** Drop a basic swing still in its startup: no blow, no string step, and the weapon is ready again. */
```
with:
```ts
/**
 * A basic swing in its startup strikes this tick. A press or a hold that would
 * start now waits a tick, so the blow lands first (see the chain feel spec).
 */
export function swingStrikes(h: HeroEntity, t: number): boolean {
  return !!h.swing && h.swing.held === null && t >= h.swing.strikeAt - 1e-9;
}

/** Drop a basic swing still in its startup: no blow, no string step, and the weapon is ready again. */
```

In `packages/engine/src/arpg/abilities/cast.ts`, `startHold` waits a tick for it too:

Replace:
```ts
import { cancelSwing, pushTick, startPush } from '../action.js';
```
with:
```ts
import { cancelSwing, pushTick, startPush, swingStrikes } from '../action.js';
```

Replace:
```ts
 * as a press needs (a swing winding up gives way), its slot's beat is over and
 * its first stage is affordable. Nothing is paid yet; the hero faces what it
 * aims at.
```
with:
```ts
 * as a press needs (a swing winding up gives way, but one striking this tick
 * lands first), its slot's beat is over and its first stage is affordable.
 * Nothing is paid yet; the hero faces what it aims at.
```

Replace:
```ts
  if (!chain || h.windup || inBeat(h, slot, t)) return;
```
with:
```ts
  if (!chain || h.windup || inBeat(h, slot, t) || swingStrikes(h, t)) return;
```

- [ ] **Step 4: The rule**

In `packages/engine/src/arpg/step.ts` (a striking swing's tick neither ages a waiting press nor lets one fire; the swing's deadline; a held-back tap doesn't age; `pressDue` goes before the projectiles):

Replace:
```ts
import { cancelSwing, dropHold, pushTick } from './action.js';
```
with:
```ts
import { cancelSwing, dropHold, pushTick, swingStrikes } from './action.js';
```

Replace:
```ts
  // The waiting presses (one per slot) wait out a wind-up, a hold, a dash and their slot's
  // beat without ageing: each gets `buffer` from then.
  for (const q of world.queuedCasts)
    if (busy || inBeat(h, q.cast.slot, t)) q.until = Math.max(q.until, t + bal.feel.buffer);
  world.queuedCasts = world.queuedCasts.filter((q) => t <= q.until);
  // Of those whose slot is ready (its beat over, its move off cooldown), the one pressed first
  // fires. One on cooldown stays (ageing) and fires if the cooldown ends in time.
```
with:
```ts
  // The waiting presses (one per slot) wait out a wind-up, a hold, a dash, their slot's beat and
  // the tick a swing strikes without ageing: each gets `buffer` from then.
  const striking = swingStrikes(h, t);
  for (const q of world.queuedCasts)
    if (busy || striking || inBeat(h, q.cast.slot, t))
      q.until = Math.max(q.until, t + bal.feel.buffer);
  world.queuedCasts = world.queuedCasts.filter((q) => t <= q.until);
  // Of those whose slot is ready (its beat over, its move off cooldown), the one pressed first
  // fires. One on cooldown stays (ageing) and fires if the cooldown ends in time. A swing
  // striking this tick lands first: the press waits a tick.
```

Replace:
```ts
  const q = busy ? undefined : world.queuedCasts.find((p) => ready(p.cast.slot));
```
with:
```ts
  const q = busy || striking ? undefined : world.queuedCasts.find((p) => ready(p.cast.slot));
```

Replace:
```ts
  // A tap held by a dash, a wind-up, a hold, a swing, a push or the weapon's cycle doesn't age either.
  if (
    world.queuedAttack &&
    (dashing || h.windup || h.hold || h.swing || h.push || t < h.nextAttackAt)
```
with:
```ts
  // While a press waits, a swing starts only if its blow strikes by the tick the press fires.
  const due = pressDue(ctx, input.holding);
  const deadline = due === Infinity ? Infinity : t + Math.ceil((due - t) / dt - 1e-6) * dt;
  // A tap held by a dash, a wind-up, a hold, a swing, a push, the weapon's cycle or a waiting
  // press doesn't age either.
  if (
    world.queuedAttack &&
    (dashing || h.windup || h.hold || h.swing || h.push || t < h.nextAttackAt || due !== Infinity)
```

Replace:
```ts
    if (input.attack === undefined) startSwing(ctx, false, speed <= 0.05);
    else {
      const tap = world.queuedAttack && t <= world.queuedAttack.until ? world.queuedAttack : null;
      if ((input.attack || tap) && startSwing(ctx, true, true, input.attackAim ?? tap?.aim ?? null))
```
with:
```ts
    if (input.attack === undefined) startSwing(ctx, false, speed <= 0.05, null, deadline);
    else {
      const tap = world.queuedAttack && t <= world.queuedAttack.until ? world.queuedAttack : null;
      const aim = input.attackAim ?? tap?.aim ?? null;
      if ((input.attack || tap) && startSwing(ctx, true, true, aim, deadline))
```

Replace:
```ts
}

// ── Projectiles ────────────────────────────────────────────────────────────
```
with:
```ts
}

/**
 * When the first press waiting now will fire: the later of its slot's beat end
 * and its next move's cooldown (the earliest over every waiting press). A held
 * ability button whose slot waits on either counts as a waiting press (the
 * player means to use that slot next), unless its hold was dropped. Infinity
 * with none (see the chain feel spec).
 */
function pressDue(ctx: SimCtx, holding: number | null | undefined): number {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  const readyAt = (slot: number) =>
    h.chains[slot]
      ? Math.max(
          h.beatUntil[slot],
          h.cooldowns[slot][pressStep(h, slot, t, bal.abilities.comboWindow)],
        )
      : Infinity;
  let due = Infinity;
  for (const q of world.queuedCasts) due = Math.min(due, readyAt(q.cast.slot));
  if (holding !== null && holding !== undefined && holding !== world.holdDropped) {
    const held = readyAt(holding);
    if (held > t) due = Math.min(due, held);
  }
  return due;
}

// ── Projectiles ────────────────────────────────────────────────────────────
```

In `packages/engine/src/arpg/basic.ts`, `startSwing` works out the blow's startup first and refuses one that strikes past `deadline`, before it changes anything:

Replace:
```ts
 * its strike point: see `basicHoldTick`). Returns whether a swing started.
```
with:
```ts
 * its strike point: see `basicHoldTick`). With a press waiting (see the chain
 * feel spec), only a blow that strikes by `deadline` (the tick the press
 * fires) starts. Returns whether a swing started.
```

Before:
```ts
): boolean {
```
add:
```ts
  deadline = Infinity,
```

Replace:
```ts
  h.attackCount = step;
  const blow = w.blows[step];
  const s = manual && blow.kind === 'hold' ? w.feel.medium : blow;
```
with:
```ts
  const blow = w.blows[step];
  const s = manual && blow.kind === 'hold' ? w.feel.medium : blow;
  const cycle = (h.stats.attackInterval * s.time) / haste(ctx);
  const startup = cycle * s.startup;
  if (t + startup > deadline + 1e-9) return false;
  h.attackCount = step;
```

Replace:
```ts
  const cycle = (h.stats.attackInterval * s.time) / haste(ctx);
  const startup = cycle * s.startup;
  h.swing = {
```
with:
```ts
  h.swing = {
```

- [ ] **Step 5: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (22).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1293 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-chain-feel.test.ts packages/engine/src/arpg/action.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/basic.ts
git add packages/engine/tests/delve-chain-feel.test.ts packages/engine/src/arpg/action.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/basic.ts
git commit -m "feat(engine): while a press waits, a basic swing starts only if it strikes before the press fires" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 4: Engine: repeat presses, aiming and Power

### Task 5: Repeat presses, the press during a wind-up, and the aiming pause

The pad's hold-to-repeat and the DPS sim's held button press early (during a wind-up, a beat or a cooldown) so a press already waits when a move lands; such a press is marked (`AbilityCast.repeat`). When a waiting repeat press would fire a hold move it's dropped, and the held button's `holding` starts the charge that tick; refused for mana it makes no `noMana` event (refused for charge was already quiet). `pressMove` names the move a press made now will cast: during the slot's own wind-up, the one after the winding move (the wind-up lands first). While a slot's button is held (`holding`), its restart window doesn't run: `holdTick` moves `comboAt` on by `dt` for any held slot, which replaces its old `comboAt += dt` for a charging hold, so that one isn't paused twice. The DPS sim holds its button under every move and presses early, marked, so its casts come one beat after each landing.

**Files:**
- Modify: `packages/engine/tests/delve-chain-feel.test.ts:5` (and the end), `packages/engine/tests/delve-dps-sim.test.ts:3,89-105,276-283`
- Modify: `packages/engine/src/types/ability.ts:130` (CRLF: hand-edit) (`AbilityCast.repeat`)
- Modify: `packages/engine/src/arpg/abilities/cast.ts:47-49,125-142,261-292` (`pressMove`, the quiet refusal, the aiming pause)
- Modify: `packages/engine/src/arpg/step.ts:22,156-163` (the repeat press's drop)
- Modify: `packages/engine/src/arpg/dps-sim.ts:12,105-117`
- Modify: `packages/engine/src/index.ts:208`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-chain-feel.test.ts`, import `pressMove`, then add the repeat, aiming and determinism tests at the end (the scripted fight runs the same inputs at 30, 60 and 120 frames a second, a press on each tick's first frame):

Replace:
```ts
import { inBeat, nextMove } from '../src/arpg/abilities/cast.js';
```
with:
```ts
import { inBeat, nextMove, pressMove } from '../src/arpg/abilities/cast.js';
```

Replace:
```ts
    expect(cut).toBe(0);
  });
});
```
with:
```ts
    expect(cut).toBe(0);
  });
});

describe('repeat presses', () => {
  it("a waiting repeat press that would fire a hold move is dropped, and the held button's charge starts that tick", () => {
    const w = beater([m('light'), m('hold')]);
    pressOnly(w, 0);
    // Pressed during the light's wind-up (the hold is next), with the button held.
    const held = { holding: 0 };
    stepWorld(registry, w, { move: still, ...held, cast: { slot: 0, repeat: true } }, STEP);
    expect(w.queuedCasts.map((q) => q.cast)).toEqual([{ slot: 0, repeat: true }]);
    const { events } = until(w, () => !w.hero.windup && w.hero.beatUntil[0] > w.t, held);
    const end = w.hero.beatUntil[0];
    const rest = until(w, () => w.hero.hold !== null, held);
    tickAfter(rest.at, end);
    expect(w.queuedCasts).toEqual([]);
    expect(castSlots([...events, ...rest.events])).toEqual([0]);

    // An ordinary press there taps the hold instead.
    const tap = beater([m('light'), m('hold')]);
    pressOnly(tap, 0);
    pressOnly(tap, 0);
    run(tap, 1);
    expect(tap.hero.comboStep[0]).toBe(1);
  });

  it('a repeat press refused for mana or charge is dropped without a noMana event', () => {
    const noMana = (repeat: boolean) => {
      const w = beater();
      w.hero.mana = 1;
      w.hero.manaRegen = 0;
      const events = stepWorld(registry, w, { move: still, cast: { slot: 0, repeat } }, STEP);
      expect(w.queuedCasts).toEqual([]);
      return events.some((e) => e.kind === 'noMana');
    };
    expect(noMana(true)).toBe(false);
    expect(noMana(false)).toBe(true);

    const w = beater();
    w.hero.charge[2] = 0;
    const events = stepWorld(registry, w, { move: still, cast: { slot: 2, repeat: true } }, STEP);
    expect(w.queuedCasts).toEqual([]);
    expect(events.some((e) => e.kind === 'noMana' || e.kind === 'windup')).toBe(false);
  });

  it("a press during the slot's own wind-up reads the move after the winding one", () => {
    const w = beater([m('light'), m('hold')]);
    pressOnly(w, 0);
    expect(w.hero.windup?.step).toBe(0);
    expect(nextMove(w.hero, 0, w.t, WINDOW).kind).toBe('light');
    expect(pressMove(w.hero, 0, w.t, WINDOW).kind).toBe('hold');
    expect(pressMove(w.hero, 1, w.t, WINDOW)).toBe(nextMove(w.hero, 1, w.t, WINDOW));
  });
});

describe('aiming', () => {
  it("a held button pauses its slot's restart window, however long it aims", () => {
    const w = beater();
    press(w, 0);
    for (let i = 0; i < Math.round((WINDOW + 1) / STEP); i++)
      stepWorld(registry, w, { move: still, holding: 0 }, STEP);
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(1);
    run(w, w.hero.comboAt[0] - w.t + WINDOW + 0.1);
    expect(nextMove(w.hero, 0, w.t, WINDOW).index).toBe(0);
  });

  it("a charging hold's window is paused once a tick, not twice", () => {
    const w = beater([m('light'), m('hold')]);
    press(w, 0);
    until(w, () => w.hero.hold !== null, { holding: 0 });
    const before = w.hero.comboAt[0];
    for (let i = 0; i < 10; i++) stepWorld(registry, w, { move: still, holding: 0 }, STEP);
    expect(w.hero.comboAt[0] - before).toBeCloseTo(10 * STEP);
  });
});

describe('determinism', () => {
  it('a scripted fight gives the same events at 30, 60 and 120 frames a second', () => {
    const fight = (frames: number) => {
      const w = arena([dummy(13, 34.4), dummy(12, 33), dummy(14, 33)], {
        primary: {
          moves: [m('light'), m('medium'), m('medium'), m('heavy')],
        },
        ultimate: { moves: [{ kind: 'hold', form: 'nova', elements: ['fire'] }] },
      });
      w.hero.charge[2] = 100;
      const events: ArpgEvent[] = [];
      for (let k = 0; k < Math.round(8 / STEP); k++) {
        const input = {
          move: k >= 150 && k < 160 ? { x: 1, y: 0 } : still,
          holding: k >= 200 && k < 250 ? 2 : k % 40 < 20 ? 0 : null,
          cast:
            k === 250
              ? { slot: 2 }
              : k === 100
                ? { slot: 1 }
                : k % 7 === 0
                  ? { slot: 0, repeat: k % 2 === 0 }
                  : null,
          dodge: k === 155,
        };
        // The presses go on a tick's first frame; movement and holding on every frame.
        for (let f = 0; f < frames; f++)
          events.push(
            ...stepWorld(
              registry,
              w,
              f === 0 ? input : { move: input.move, holding: input.holding },
              STEP / frames,
            ),
          );
      }
      return events;
    };
    const at30 = fight(1);
    expect(at30.filter((e) => e.kind === 'cast').length).toBeGreaterThan(5);
    expect(fight(2)).toEqual(at30);
    expect(fight(4)).toEqual(at30);
  });
});
```

In `packages/engine/tests/delve-dps-sim.test.ts`, the tap records whether a wind-up ran before each step, and a test checks the early presses and the spacing they give (a hold's comment follows the new stages):

Replace:
```ts
import { defaultBasic, defaultChains } from '../src/arpg/abilities/resolve.js';
```
with:
```ts
import {
  beatFor,
  defaultBasic,
  defaultChains,
  resolveChain,
} from '../src/arpg/abilities/resolve.js';
```

Replace:
```ts
 * The sims' events, and each step's input, the slot whose hold runs after it and its events,
 * collected while `tap.on` is set (`stepWorld` itself is unchanged).
```
with:
```ts
 * The sims' events, and each step's input, whether a wind-up ran before it, the slot whose hold
 * runs after it and its events, collected while `tap.on` is set (`stepWorld` itself is unchanged).
```

Replace:
```ts
  steps: [] as { input: ArpgInput; hold: number | null; events: ArpgEvent[] }[],
```
with:
```ts
  steps: [] as {
    input: ArpgInput;
    windup: boolean;
    hold: number | null;
    events: ArpgEvent[];
  }[],
```

Replace:
```ts
      const events = step.stepWorld(...args);
      if (tap.on) {
        tap.events.push(...events);
        tap.steps.push({ input: args[2], hold: args[1].hero.hold?.slot ?? null, events });
```
with:
```ts
      const windup = args[1].hero.windup !== null;
      const events = step.stepWorld(...args);
      if (tap.on) {
        tap.events.push(...events);
        tap.steps.push({ input: args[2], windup, hold: args[1].hero.hold?.slot ?? null, events });
```

Replace:
```ts
  it('holds a hold move to full charge each press', () => {
```
with:
```ts
  it("presses early, marked a repeat: each move goes its beat after the last one's landing", () => {
    const s = setup('ability|bolt|fire|none|default|mana');
    const { steps } = recorded(() => simulateDps(registry, s, ONE));
    // Pressed during a wind-up, the press waits in the buffer.
    expect(steps.some((st) => st.windup && st.input.cast?.repeat)).toBe(true);
    const lands = steps.flatMap((st, i) =>
      st.events.some((e) => e.kind === 'cast' && e.slot === 0) ? [i * bal.arena.step] : [],
    );
    const moves = resolveChain(
      registry,
      computeHeroStats({}, registry),
      'primary',
      s.chains.primary,
    ).moves;
    // Full mana at the start: the chain's first three gaps are its beats and wind-ups.
    for (let i = 0; i < 3; i++) {
      const least = beatFor(bal, 'primary', moves[i].kind, 1) + moves[i + 1].castTime;
      expect(lands[i + 1] - lands[i]).toBeGreaterThanOrEqual(least - 1e-6);
      expect(lands[i + 1] - lands[i]).toBeLessThan(least + 3 * bal.arena.step);
    }
  });

  it('holds a hold move to full charge each press', () => {
```

Replace:
```ts
    // Each cast comes after a full charge's steps with its button held and its hold running (a
    // release at stage 2 would come after 0.66 of them). The button stays held between holds too.
```
with:
```ts
    // Each cast comes after a full charge's steps with its button held and its hold running (stage
    // 2 is the full charge). The button stays held between holds too.
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chain-feel.test.ts tests/delve-dps-sim.test.ts)`
Expected: 5 FAIL, 40 pass: "a waiting repeat press that would fire a hold move is dropped …" (never came), "a repeat press refused for mana or charge …" (expected true to be false), "a press during the slot's own wind-up …" ((0 , pressMove) is not a function), "a held button pauses its slot's restart window …" (expected +0 to be 1) and the DPS sim's "presses early, marked a repeat …" (expected false to be true). The determinism test and "a charging hold's window is paused once …" already pass: they guard what this task mustn't break.

- [ ] **Step 3: The mark**

In `packages/engine/src/types/ability.ts` (CRLF: hand-edit):

After:
```ts
  aim?: Vec | null;
```
add:
```ts
  /**
   * A repeat press (the pad's hold-to-repeat, the DPS sim's held button), made
   * early to wait in the buffer: at a hold move it's dropped (the held button
   * charges it), and refused for mana it makes no `noMana` event.
   */
  repeat?: boolean;
```

In `packages/engine/src/arpg/abilities/cast.ts` (`pressMove` after `nextMove`; a repeat press is quiet for mana; the aiming pause):

Replace:
```ts
}

/** The slot's move winding up, holding or, for the Defensive, the one whose effect is up; else null. */
```
with:
```ts
}

/**
 * The move a press made now will cast: during the slot's own wind-up, the one
 * after the winding move (the wind-up lands before the press fires); else
 * `nextMove`.
 */
export function pressMove(h: HeroEntity, slot: number, t: number, window: number): ResolvedAbility {
  const moves = h.chains[slot].moves;
  return h.windup?.slot === slot
    ? moves[(h.windup.step + 1) % moves.length]
    : nextMove(h, slot, t, window);
}

/** The slot's move winding up, holding or, for the Defensive, the one whose effect is up; else null. */
```

Replace:
```ts
 * uncharged, unaffordable (with a `noMana` event, and the chain doesn't
 * advance) or with nothing to aim at. Otherwise it pays now, drops a basic swing still winding up, and winds
```
with:
```ts
 * uncharged, unaffordable (with a `noMana` event unless it's a repeat press,
 * and the chain doesn't advance) or with nothing to aim at. Otherwise it pays now, drops a basic swing still winding up, and winds
```

Replace:
```ts
    ctx.events.push({ kind: 'noMana', slot });
```
with:
```ts
    if (!cast.repeat) ctx.events.push({ kind: 'noMana', slot });
```

Replace:
```ts
 * fires it at its stage. Meanwhile the hero stays rooted, each new stage says
 * so, and the slot's combo window is paused.
```
with:
```ts
 * fires it at its stage. Meanwhile the hero stays rooted and each new stage
 * says so. A held button, charging or aiming, pauses its slot's restart window.
```

Before:
```ts
  if (world.holdDropped !== null && holding !== world.holdDropped) world.holdDropped = null;
```
add:
```ts
  if (holding !== null && holding !== undefined && h.chains[holding]) h.comboAt[holding] += dt;
```

Replace:
```ts
    h.comboAt[h.hold.slot] += dt;
  }
```
with:
```ts
  }
```

In `packages/engine/src/arpg/step.ts`, a waiting repeat press at a hold move is dropped:

Replace:
```ts
import { castAbility, castTick, holdTick, inBeat, pressStep } from './abilities/cast.js';
```
with:
```ts
import { castAbility, castTick, holdTick, inBeat, nextMove, pressStep } from './abilities/cast.js';
```

Replace:
```ts
  const ready = (slot: number) =>
    !!h.chains[slot] &&
    !inBeat(h, slot, t) &&
    t >= h.cooldowns[slot][pressStep(h, slot, t, bal.abilities.comboWindow)];
  const q = busy || striking ? undefined : world.queuedCasts.find((p) => ready(p.cast.slot));
  if (q) {
    world.queuedCasts = world.queuedCasts.filter((p) => p !== q);
    castAbility(ctx, q.cast);
```
with:
```ts
  const window = bal.abilities.comboWindow;
  const ready = (slot: number) =>
    !!h.chains[slot] &&
    !inBeat(h, slot, t) &&
    t >= h.cooldowns[slot][pressStep(h, slot, t, window)];
  const q = busy || striking ? undefined : world.queuedCasts.find((p) => ready(p.cast.slot));
  if (q) {
    world.queuedCasts = world.queuedCasts.filter((p) => p !== q);
    // A repeat press never fires a hold move: it's dropped, and the held button charges it.
    if (!q.cast.repeat || nextMove(h, q.cast.slot, t, window).kind !== 'hold')
      castAbility(ctx, q.cast);
```

In `packages/engine/src/index.ts`:

Before:
```ts
  activeMove,
```
add:
```ts
  pressMove,
```

- [ ] **Step 4: The DPS sim holds its button and presses early**

In `packages/engine/src/arpg/dps-sim.ts`:

Replace:
```ts
import { holdCharge, nextMove } from './abilities/cast.js';
```
with:
```ts
import { holdCharge, pressMove } from './abilities/cast.js';
```

Replace:
```ts
  // The held button, each tick: the attack; or the ability pressed, a refused press (no mana)
  // dropped and pressed again, one on cooldown waiting. Nothing is pressed while a wind-up runs
  // (the press would only wait for it), and a hold move is held to full charge, then let go.
  const input = (): ArpgInput => {
    if (slot === null) return { move, attack: true, attackAim: aim };
    if (h.windup) return { move };
```
with:
```ts
  // The held button, each tick: the attack; or the ability, as the pad's hold-to-repeat holds
  // it: a repeat press made early (during a wind-up, a beat or a cooldown) waits in the buffer,
  // one refused for mana is dropped and pressed again, and a hold move is held to full charge,
  // then let go.
  const input = (): ArpgInput => {
    if (slot === null) return { move, attack: true, attackAim: aim };
```

Replace:
```ts
    if (nextMove(h, slot, world.t, bal.abilities.comboWindow).kind === 'hold')
      return { move, holding: slot };
    return { move, cast: { slot, aim } };
```
with:
```ts
    const waiting = world.queuedCasts.some((q) => q.cast.slot === slot);
    if (waiting || pressMove(h, slot, world.t, bal.abilities.comboWindow).kind === 'hold')
      return { move, holding: slot };
    return { move, holding: slot, cast: { slot, aim, repeat: true } };
```

- [ ] **Step 5: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (45).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1300 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-chain-feel.test.ts packages/engine/tests/delve-dps-sim.test.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/dps-sim.ts packages/engine/src/index.ts
git add packages/engine/tests/delve-chain-feel.test.ts packages/engine/tests/delve-dps-sim.test.ts packages/engine/src/types/ability.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/dps-sim.ts packages/engine/src/index.ts
git commit -m "feat(engine): marked repeat presses, the move a press during a wind-up casts, and a held button pausing its chain's restart" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Power counts the beats and values holds at full charge

`estimateCombat`'s `useInterval` gains a third term inside its max, beside the cooldown and the payment: the move's cadence, its wind-up plus its beat (not added to either other term: both already run during the wind-up and the beat). A hold move is valued at full charge (`valuedMove`: its stage-2 move's damage and cost); its wind-up is the longer of its charge (`holdTime` × tempo) and its stage-2 `castTime` (a cast-paid Ultimate's wind-up outlasts its charge), its cadence that plus the hold beat, and its cooldown term that plus its cooldown (the cooldown counts from the landing). A Defensive hold's effect is its stage-2 move's. Item comparisons use the same estimate. This moves every chain's Power, and with it the autopilot's gear choices; the pacing rails still hold (Task 7 measures them).

**Files:**
- Modify: `packages/engine/tests/delve-chain-feel.test.ts:6-11` (and the end)
- Modify: `packages/engine/src/delve/hero-stats.ts:7-13,296-334,379-393`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-chain-feel.test.ts`, the imports, then the Power tests at the end:

Replace:
```ts
import { beatFor } from '../src/arpg/abilities/resolve.js';
import { respawnHero } from '../src/arpg/sandbox.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { ABILITY_SLOTS, MOVE_KINDS, type Move, type MoveKind } from '../src/types/ability.js';
```
with:
```ts
import { beatFor, chainMove, resolveChain } from '../src/arpg/abilities/resolve.js';
import { respawnHero } from '../src/arpg/sandbox.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import {
  computeHeroStats,
  damagePerUse,
  useInterval,
  valuedMove,
} from '../src/delve/hero-stats.js';
import {
  ABILITY_SLOTS,
  MOVE_KINDS,
  type AbilityPayment,
  type AbilitySlot,
  type Move,
  type MoveKind,
} from '../src/types/ability.js';
```

Replace:
```ts
    expect(fight(4)).toEqual(at30);
  });
});
```
with:
```ts
    expect(fight(4)).toEqual(at30);
  });
});

describe('Power', () => {
  const stats = computeHeroStats({ weapon: gear('fire') }, registry);
  const resolved = (slot: AbilitySlot, moves: Move[], payment: AbilityPayment = 'mana') =>
    resolveChain(registry, stats, slot, { moves, payment });

  it("counts each move's cadence, its wind-up plus its beat, beside its cooldown and its cost", () => {
    const bolt = resolved('primary', [m('medium')]);
    const ab = bolt.moves[0];
    // Plenty of mana: the cadence outlasts the cooldown.
    expect(ab.castTime + 0.4).toBeGreaterThan(ab.cooldown);
    expect(useInterval(bal, bolt, 1, 1e9, 1)).toBeCloseTo(ab.castTime + 0.4);
    expect(useInterval(bal, bolt, 1.3, 1e9, 1)).toBeCloseTo(ab.castTime + 0.4 * 1.3);
    // Short of mana, the cost sets it.
    expect(useInterval(bal, bolt, 1, ab.cost / 5, 1)).toBeCloseTo(5);
  });

  it('values a hold at full charge: a cast-paid Ultimate that winds up longer than it charges', () => {
    const ult = resolved('ultimate', [{ kind: 'hold', form: 'nova', elements: ['fire'] }], 'cast');
    const full = ult.hold[0]![2];
    expect(valuedMove(ult, 0)).toBe(full);
    expect(full.castTime).toBeGreaterThan(bal.chains.holdTime);
    // Its cooldown counts from the landing; its beat follows it too.
    const beat = beatFor(bal, 'ultimate', 'hold', 1);
    expect(useInterval(bal, ult, 1, 1e9, 1e9)).toBeCloseTo(
      full.castTime + Math.max(full.cooldown, beat),
    );
    // Its damage is the full charge's, not the tap's.
    const tap = { ...ult, hold: [null] };
    expect(damagePerUse(ult, 10, stats, bal) / damagePerUse(tap, 10, stats, bal)).toBeCloseTo(
      full.power / ult.moves[0].power,
    );
  });

  it('a hold charged quicker than it winds up counts its charge time, by tempo', () => {
    const bolt = resolved('primary', [m('hold')]);
    const full = bolt.hold[0]![2];
    expect(full.castTime).toBeLessThan(bal.chains.holdTime);
    const beat = beatFor(bal, 'primary', 'hold', 1.3);
    expect(useInterval(bal, bolt, 1.3, 1e9, 1)).toBeCloseTo(
      bal.chains.holdTime * 1.3 + Math.max(full.cooldown, beat),
    );
  });

  it("a Defensive hold's effect is its full charge's", () => {
    const ward = resolved('defensive', [{ kind: 'hold', form: 'ward', elements: ['frost'] }]);
    const guard = valuedMove(ward, 0);
    expect(guard).toBe(chainMove(ward, 0, 2));
    expect(guard.effect).toBeGreaterThan(ward.moves[0].effect);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chain-feel.test.ts)`
Expected: 4 FAIL, 28 pass: every test in "Power" ((0 , useInterval) is not a function; (0 , valuedMove) is not a function).

- [ ] **Step 3: The estimate**

In `packages/engine/src/delve/hero-stats.ts`:

Before:
```ts
  type ResolvedChain,
```
add:
```ts
  type ResolvedAbility,
```

Replace:
```ts
  defaultBasic,
  defaultChains,
  followBasic,
```
with:
```ts
  beatFor,
  chainMove,
  defaultBasic,
  defaultChains,
  followBasic,
  playedKind,
```

Replace:
```ts
/**
 * Damage of one use of a chain, averaged over its moves (each with its step
 * bonus), counting jumps, lingering ground and repeats.
 */
function damagePerUse(
```
with:
```ts
/** The move Power values at step `i` of a chain: a hold move at its full charge (stage 2). */
export function valuedMove(chain: ResolvedChain, i: number): ResolvedAbility {
  return chain.moves[i].kind === 'hold' ? chainMove(chain, i, 2) : chain.moves[i];
}

/**
 * Damage of one use of a chain, averaged over its moves (each with its step
 * bonus, a hold at full charge), counting jumps, lingering ground and repeats.
 */
export function damagePerUse(
```

Replace:
```ts
    chain.moves.map((ab) => {
```
with:
```ts
    chain.moves.map((_, i) => {
      const ab = valuedMove(chain, i);
```

Replace:
```ts
/** Seconds between uses, averaged over the chain's moves, when used as often as the payment allows. */
function useInterval(chain: ResolvedChain, manaIncome: number, chargeRate: number): number {
  return mean(
    chain.moves.map((ab) =>
      chain.payment === 'charge'
        ? Math.max(ab.cooldown, ab.chargeNeed / Math.max(0.1, chargeRate))
        : Math.max(ab.cooldown + ab.channel, ab.cost / Math.max(0.1, manaIncome)),
    ),
```
with:
```ts
/**
 * Seconds between uses, averaged over the chain's moves, when used as often as
 * its cooldowns, its payment and its cadence allow. The cadence is a move's
 * wind-up plus its beat (see the chain feel spec). A hold is valued at full
 * charge: its wind-up is the longer of its charge (`holdTime` × the tempo) and
 * its stage-2 wind-up, and its cooldown counts from its landing.
 */
export function useInterval(
  bal: DelveBalance,
  chain: ResolvedChain,
  tempo: number,
  manaIncome: number,
  chargeRate: number,
): number {
  return mean(
    chain.moves.map((move, i) => {
      const ab = valuedMove(chain, i);
      const hold = move.kind === 'hold';
      const windup = hold ? Math.max(bal.chains.holdTime * tempo, ab.castTime) : ab.castTime;
      const cooldown = hold ? windup + ab.cooldown : ab.cooldown + ab.channel;
      const pay =
        chain.payment === 'charge'
          ? ab.chargeNeed / Math.max(0.1, chargeRate)
          : ab.cost / Math.max(0.1, manaIncome);
      const cadence = windup + beatFor(bal, ab.slot, playedKind(ab), tempo);
      return Math.max(cooldown, pay, cadence);
    }),
```

Replace:
```ts
  const primaryDps =
    damagePerUse(primary, hit, stats, bal) / useInterval(primary, manaIncome * 0.7, dps / unit);
```
with:
```ts
  const every = (chain: ResolvedChain, income: number, rate: number) =>
    useInterval(bal, chain, stats.tempo, income, rate);
  const primaryDps =
    damagePerUse(primary, hit, stats, bal) / every(primary, manaIncome * 0.7, dps / unit);
```

Replace:
```ts
    (damagePerUse(ultimate, hit, stats, bal) /
      useInterval(ultimate, manaIncome * 0.3, chargeRate)) *
    0.8;

  let mitigation = (1 - armorReduction(bal, stats.armor, depth)) * (1 - stats.dodge);
  let bonusLife = 0;
  const guardEvery = useInterval(defensive, manaIncome * 0.3, chargeRate);
  // The Defensive's effect: its first move's.
  const guard = defensive.moves[0];
```
with:
```ts
    (damagePerUse(ultimate, hit, stats, bal) / every(ultimate, manaIncome * 0.3, chargeRate)) * 0.8;

  let mitigation = (1 - armorReduction(bal, stats.armor, depth)) * (1 - stats.dodge);
  let bonusLife = 0;
  const guardEvery = every(defensive, manaIncome * 0.3, chargeRate);
  // The Defensive's effect: its first move's (a hold's at full charge).
  const guard = valuedMove(defensive, 0);
```

- [ ] **Step 4: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (32).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 1304 tests pass (the pacing rails among them). If `delve-pacing.test.ts` fails, stop: don't tune; bring the numbers to the user (Task 7's scripts give them).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-chain-feel.test.ts packages/engine/src/delve/hero-stats.ts
git add packages/engine/tests/delve-chain-feel.test.ts packages/engine/src/delve/hero-stats.ts
git commit -m "feat(engine): Power counts each move's wind-up and beat, and values holds at full charge" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 5: Balance

### Task 7: Measure before and after, and record it

No tuning (the spec: tune later, nail the feel now). This task builds the engine, measures the DPS Lab grid, the sword/maul/wand spot-check and the pacing rails against the "before" files Task 1 checked, and records them in the spec's status line. The numbers are deterministic: each must match the plan's. **If a pacing rail breaks** (`delve-pacing.test.ts` failed in any of Tasks 1–6, or a line below reads outside its bounds), stop: don't tune anything, and bring the before and after numbers to the user. The fix is their call (shorter beats, stronger skills, or a changed rail).

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-delve-chain-feel-design.md:3` (the status line)

- [ ] **Step 1: Build the engine and measure**

Run: `(cd packages/engine && pnpm build)`
Expected: tsup's "Build success" lines.

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/feel-before && node snapshot.mjs C:/Projects/Alloy/packages/engine/dist/index.js after-depth10.json && node spot.mjs C:/Projects/Alloy/packages/engine/dist/index.js after-spot.json)`
Expected: `runs 9144 ms …` (about 10 s), then `rows 576`.

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/feel-before && node compare.mjs before-depth10.json after-depth10.json before-spot.json after-spot.json)`
Expected, exactly:

```text
basics: median +0.0% [+0.0%, +0.0%] (504 rows)
mana   light   median +0.0% [-25.6%, +46.2%] (576 rows)
mana   medium  median +0.0% [-34.5%, +67.0%] (576 rows)
mana   heavy   median +0.0% [-47.1%, +71.4%] (576 rows)
mana   hold    median -3.3% [-28.4%, +15.9%] (576 rows)
mana   default median +0.0% [-28.2%, +46.2%] (576 rows)
cast   light   median -2.0% [-26.1%, +47.0%] (576 rows)
cast   medium  median -5.5% [-64.1%, +15.2%] (576 rows)
cast   heavy   median -17.0% [-84.2%, +53.0%] (576 rows)
cast   hold    median -3.4% [-41.2%, +15.9%] (576 rows)
cast   default median -27.7% [-71.3%, +16.9%] (576 rows)
charge light   median +0.0% [-0.0%, +0.0%] (576 rows)
charge medium  median +0.0% [+0.0%, +0.0%] (576 rows)
charge heavy   median +0.0% [-43.3%, +12.6%] (576 rows)
charge hold    median +0.0% [-18.1%, +60.4%] (576 rows)
charge default median +15.1% [+0.0%, +1479.6%] (576 rows)
default mana bolt      median -5.0% [-21.4%, +46.2%] (72 rows)
default mana volley    median -7.2% [-23.8%, +26.1%] (72 rows)
default mana lance     median -2.7% [-28.2%, +16.9%] (72 rows)
default mana burst     median -2.4% [-22.5%, +2.2%] (72 rows)
default mana strike    median +0.0% [-23.5%, +22.8%] (72 rows)
default mana nova      median +0.0% [+0.0%, +0.0%] (72 rows)
default mana barrage   median +0.0% [+0.0%, +0.0%] (72 rows)
default mana maelstrom median +0.0% [+0.0%, +0.0%] (72 rows)
rows that stopped dealing damage: 0
spot-check (each form default chain and hold, Fire and Fire+Frost, every payment, one dummy and the pack):
  sword default mana   median +0.0% [-20.5%, +41.1%] (32 rows)
  sword default cast   median -28.7% [-61.0%, +0.0%] (32 rows)
  sword default charge median +40.4% [+0.0%, +508.4%] (32 rows)
  sword hold    mana   median -3.4% [-6.3%, +0.0%] (32 rows)
  sword hold    cast   median -3.4% [-5.9%, +0.0%] (32 rows)
  sword hold    charge median +0.0% [-4.5%, +0.5%] (32 rows)
  maul  default mana   median +0.0% [-18.8%, +22.5%] (32 rows)
  maul  default cast   median -14.8% [-33.3%, +0.0%] (32 rows)
  maul  default charge median +28.0% [-25.3%, +499.7%] (32 rows)
  maul  hold    mana   median -16.8% [-42.4%, +7.9%] (32 rows)
  maul  hold    cast   median -17.1% [-50.0%, +0.0%] (32 rows)
  maul  hold    charge median -2.1% [-39.2%, +0.6%] (32 rows)
  wand  default mana   median +0.0% [-12.8%, +91.2%] (32 rows)
  wand  default cast   median -26.9% [-53.1%, +0.0%] (32 rows)
  wand  default charge median +27.1% [-3.1%, +251.1%] (32 rows)
  wand  hold    mana   median +8.5% [-5.3%, +431.2%] (32 rows)
  wand  hold    cast   median +0.0% [-15.0%, +11.8%] (32 rows)
  wand  hold    charge median +1.6% [-61.1%, +79.1%] (32 rows)
```

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/feel-before && node pacing.mjs C:/Projects/Alloy/packages/engine/dist/index.js | tee pacing-after.txt)` (about a minute)
Expected, exactly (every line within its bounds):

```text
first dive: 12, 12, 5, 3 (each ≥ 3), mean 8 (4–12)
dive 6 mean 27.75, dive 12 mean 35.75 (> dive 1 + 5, > dive 6)
frost: dive 1 10, dive 12 26.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 4.75 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 28, 18–41 (allowed 16.8–44.8): fire+frost 32, earth+frost 21, storm+fire 18, frost+storm 29, fire+shadow 30, fire+nature 22, shadow+nature 26, fire+earth 28, storm+earth 29, earth+shadow 41, earth+nature 30, frost+shadow 23, frost+nature 22, storm+shadow 36, storm+nature 20
seconds per floor: 29.09 (8–60)
```

Against `pacing-before.txt`:

```text
first dive: 12, 11, 5, 4 (each ≥ 3), mean 8 (4–12)
dive 6 mean 28.75, dive 12 mean 40.75 (> dive 1 + 5, > dive 6)
frost: dive 1 10.5, dive 12 27.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 6.25 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 32, 26–40 (allowed 19.2–51.2): fire+frost 29, earth+frost 26, storm+fire 32, frost+storm 35, fire+shadow 39, fire+nature 32, shadow+nature 34, fire+earth 29, storm+earth 32, earth+shadow 34, earth+nature 35, frost+shadow 26, frost+nature 27, storm+shadow 40, storm+nature 35
seconds per floor: 24.91 (8–60)
```

If a number differs, stop and find why before going on (the sims are deterministic: a difference means the code differs from the plan's).

- [ ] **Step 2: The spec's status line**

In `docs/superpowers/specs/2026-09-29-delve-chain-feel-design.md` (LF):

Replace:
```markdown
**Status:** approved design, 2026-09-29. It follows v0.46.0 (`2026-09-29-delve-moves-and-chains-design.md`) and ships as v0.47.0.
```
with:
```markdown
**Status:** approved design, 2026-09-29. It follows v0.46.0 (`2026-09-29-delve-moves-and-chains-design.md`) and ships as v0.47.0, built at the starting values below: nothing was tuned. Measured before (v0.46.0) and after (the DPS Lab grid at depth 10, one dummy and the pack, one seed; the pacing rails at `tests/delve-pacing.test.ts`'s seeds):
- **DPS Lab.** Basics unchanged (504 rows, +0.0%). Mana rows: light, medium and heavy median +0.0%, hold −3.3%, default chains +0.0% (Bolt −5.0%, Volley −7.2%, Lance −2.7%, Burst −2.4%; Strike, Nova, Barrage and Maelstrom +0.0%), the worst row −47.1% (a heavy). Cast rows lose the most, as expected: light −2.0%, medium −5.5%, heavy −17.0% (worst −84.2%), hold −3.4%, default chains −27.7% (worst −71.3%). Charge rows: every one-move kind median +0.0%, default chains +15.1% (up to +1480% in the pack), because the held button now pauses the restart window, so a slow-charging chain steps through its moves instead of starting over (without `holding` those rows match v0.46.0 exactly). No row stopped dealing damage.
- **Spot-check** (each form's default chain and a hold, Fire and Fire+Frost, both layouts): a maul's holds −16.8% (mana) and −17.1% (cast), its default chains +0.0% (mana) and −14.8% (cast); a wand's default chains +0.0% (mana) and −26.9% (cast), its mana holds +8.5%; the sword's holds −3.4%.
- **Pacing rails hold.** First dives 12, 12, 5, 3, mean 8 (before 12, 11, 5, 4); dive 6 27.75 and dive 12 35.75 (before 28.75, 40.75); Frost 10 → 26.5 (before 10.5 → 27.5); 4.75 legendaries (before 6.25); own pair's reaction 6 of 6; the 15-pair sweep's median 28, 18–41, allowed 16.8–44.8 (before 32, 26–40); 29.09 s a floor (before 24.91). The margins are thin: seed 4's first dive sits on its rail (3), and the sweep's Storm+Fire (18) is 1.2 above the floor.
```

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/Alloy
git add docs/superpowers/specs/2026-09-29-delve-chain-feel-design.md
git commit -m "docs: chain feel spec, measured before and after: the pacing rails hold" -m "The engine's rebuilt bundle leaves the client red until Task 8: six tests in four files (anticipation, arena-hud-snapshot, arena-input, gamepad) and its typecheck (anticipation.ts, useArenaCore.ts)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Restart the dev server**

The client reads the rebuilt engine; restart Vite so it doesn't serve the stale bundle. Run the PowerShell block under "Dev server on 5288" in the header; expect `True`.

From here until Task 8 the client is red: `(cd packages/client && npx vitest run)` fails 6 tests in 4 files (`anticipation`: a hold's and a manual blow's charge read NaN; `arena-hud-snapshot`: the hold's stage; `arena-input`: the charging hold's circle; `gamepad`: "repeat stops at a hold that fired by itself", now in its beat), and `(cd packages/client && npx tsc --noEmit -p .)` fails in `anticipation.ts` (2 errors) and `useArenaCore.ts` (3): `holdCharge` takes the full-charge time.

#### The measurement's scripts

They live in `<before>` (see the header); write any that is missing from these texts. Each takes the engine's bundle as its first argument.

`snapshot.mjs` (the DPS Lab grid):

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

`spot.mjs` (the sword/maul/wand spot-check, the spec's one-off script):

```js
// Spot-check: the DPS Lab's ability rows (each form's default chain and a hold, Fire and
// Fire+Frost, every payment) on a sword, a maul and a wand, one dummy and the pack, depth 10.
// Usage: node spot.mjs <engine dist/index.js> <out.json>
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const E = await import(pathToFileURL(process.argv[2]).href);
const reg = E.createDefaultRegistry();
const out = {};
const rows = E.dpsCombos(reg).filter(
  (s) =>
    s.view === 'ability' &&
    (s.dims.kind === 'default' || s.dims.kind === 'hold') &&
    s.dims.first === 'fire' &&
    (s.dims.second === 'none' || s.dims.second === 'frost'),
);
for (const baseId of ['sword', 'maul', 'wand'])
  for (const pack of [false, true])
    for (const s of rows) {
      const setup = {
        ...s,
        weapon: { ...s.weapon, baseId },
        chains: { ...s.chains, basic: E.defaultBasic(reg, baseId, s.weapon.primary, s.weapon.secondary) },
      };
      const r = E.simulateDps(reg, setup, { depth: 10, pack });
      out[`${baseId}|${pack}|${E.dpsKey(s)}`] = { dps: +r.dps.toFixed(2), casts: r.casts };
    }
writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log('rows', Object.keys(out).length);
```

`pacing.mjs` (the pacing rails' numbers, `tests/delve-pacing.test.ts`'s seeds, dives and bounds):

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

`compare.mjs` (after against before):

```js
// The chain feel spec's DPS Lab report: the depth-10 grid (one dummy and the pack) after the
// change against before (v0.46.0), and the sword/maul/wand spot-check. No gate.
// Usage: node compare.mjs <before.json> <after.json> <before-spot.json> <after-spot.json>
import { readFileSync } from 'node:fs';
const [b, a, bs, as] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const pct = (x) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`;
const med = (xs) => { const s = [...xs].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const stats = (rs) => rs.length ? `median ${pct(med(rs) - 1)} [${pct(Math.min(...rs) - 1)}, ${pct(Math.max(...rs) - 1)}] (${rs.length} rows)` : 'none';
const ratio = (k, x = a, y = b) => (y[k].dps > 0 ? x[k].dps / y[k].dps : x[k].dps > 0 ? Infinity : 1);
const keys = Object.keys(a);
const basic = keys.filter((k) => a[k].view === 'basic');
console.log(`basics: ${stats(basic.map((k) => ratio(k)))}`);
const ab = keys.filter((k) => a[k].view === 'ability');
for (const payment of ['mana', 'cast', 'charge'])
  for (const kind of ['light', 'medium', 'heavy', 'hold', 'default'])
    console.log(`${payment.padEnd(6)} ${kind.padEnd(7)} ${stats(ab.filter((k) => a[k].dims.payment === payment && a[k].dims.kind === kind).map((k) => ratio(k)).filter(Number.isFinite))}`);
for (const form of ['bolt', 'volley', 'lance', 'burst', 'strike', 'nova', 'barrage', 'maelstrom'])
  console.log(`default mana ${form.padEnd(9)} ${stats(ab.filter((k) => a[k].dims.form === form && a[k].dims.kind === 'default' && a[k].dims.payment === 'mana').map((k) => ratio(k)))}`);
const zero = ab.filter((k) => b[k].dps > 0 && a[k].dps === 0);
console.log(`rows that stopped dealing damage: ${zero.length}`);
console.log('spot-check (each form default chain and hold, Fire and Fire+Frost, every payment, one dummy and the pack):');
for (const w of ['sword', 'maul', 'wand']) {
  const ks = Object.keys(as).filter((k) => k.startsWith(`${w}|`));
  for (const kind of ['default', 'hold'])
    for (const payment of ['mana', 'cast', 'charge'])
      console.log(`  ${w.padEnd(5)} ${kind.padEnd(7)} ${payment.padEnd(6)} ${stats(ks.filter((k) => k.includes(`|${kind}|${payment}`)).map((k) => ratio(k, as, bs)).filter(Number.isFinite))}`);
}
```

---

## Chunk 6: Client: the HUD

### Task 8: The HUD shows beats; holds by their own times

The snapshot's `cooldown` and `cooldownTotal` cover whichever wait is longer, the next move's cooldown or the slot's beat, and a new `beat` flag says it's the beat; `ready` is false through either. The button draws the sweep on a registered CSS angle (`--delve-sweep`, in `delve.css`), which glides between the HUD's 80 ms snapshots while it empties (an 80 ms linear transition, so it follows game time through slow motion, hit-stop and pause) and snaps when it rises (a new beat or cooldown at a landing). A beat's sweep has no countdown number and no Galvanize spark (Galvanize cuts cooldowns, not beats). The hold bar keeps one tick, at the halfway stage: its end is full power. Every `holdCharge` reads the hold's own full-charge time (`HeroEntity.hold.full`), or `holdTime` × the tempo for a manual hold blow. One engine-side test changes here too: the gamepad test whose Lance fires by itself now waits out its beat before the next move is ready (it went red with Task 7's rebuild).

**Files:**
- Modify: `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx:46,87,275-286,316`
- Modify: `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts:95-98,116-123`
- Modify: `packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts:29,97-113,141-145`
- Modify: `packages/client/src/features/delve/__tests__/arena-input.test.ts:181`, `packages/client/src/features/delve/__tests__/arena-renderer.test.ts:72`, `packages/client/src/features/gamepad/__tests__/gamepad.test.ts:173-176`
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts:65-67,197-215,237,256-257` (`AbilityHud.beat`, the snapshot, `aimedMove`)
- Modify: `packages/client/src/features/delve/arena/ArenaHud.tsx:1,183-206,249,284,383-389,420` (the hold bar's tick, the sweep)
- Modify: `packages/client/src/features/delve/delve.css:158-160` (CRLF: hand-edit) (`--delve-sweep`)
- Modify: `packages/client/src/features/delve/arena/fx/anticipation.ts:47,60`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx`, the Bolt gains the snapshot's `beat`; the hold bar has one tick; the sweep's tests go before the Galvanize one, which gains a beat:

Before:
```tsx
  charge: null,
```
add:
```tsx
  beat: false,
```

Before:
```tsx
    // The hold dims the others as a channel does, never its own button.
```
add:
```tsx
    // One tick, at the halfway stage: the bar's end is full power.
    const ticks = [...button.querySelectorAll('[data-tick]')] as HTMLElement[];
    expect(ticks.map((t) => t.style.left)).toEqual(['50%']);
```

Replace:
```tsx
  it('sparks the buttons still cooling down for 0.4 s after Galvanize', () => {
```
with:
```tsx
  it('sweeps while a move cools, with its seconds, and while the slot waits out its beat, without', () => {
    const sweep = (slot: number) =>
      screen.getByTestId(`ability-${slot}`).querySelector('[data-sweep]') as HTMLElement | null;
    const cooling: AbilityHud = { ...BOLT, cooldown: 2.5, cooldownTotal: 5, ready: false };
    const beating: AbilityHud = { ...cooling, cooldown: 0.3, cooldownTotal: 0.6, beat: true };
    render(bar({ abilities: [cooling, beating, BOLT] }));
    expect(sweep(0)).toHaveAttribute('data-sweep', 'cooldown');
    expect(sweep(0)!.style.getPropertyValue('--delve-sweep')).toBe('180deg');
    expect(screen.getByTestId('ability-0')).toHaveTextContent('2.5');
    expect(sweep(1)).toHaveAttribute('data-sweep', 'beat');
    expect(sweep(1)!.style.getPropertyValue('--delve-sweep')).toBe('180deg');
    expect(screen.getByTestId('ability-1')).not.toHaveTextContent('0.3');
    expect(screen.getByTestId('ability-1')).toHaveAttribute('data-ready', 'false');
    expect(sweep(2)).toBeNull();
  });

  it('the sweep glides between refreshes while it empties, and snaps when it rises', () => {
    const at = (cooldown: number) =>
      bar({
        abilities: [
          { ...BOLT, cooldown, cooldownTotal: 0.6, beat: true, ready: false },
          BOLT,
          BOLT,
        ],
      });
    const sweep = () =>
      screen.getByTestId('ability-0').querySelector('[data-sweep]') as HTMLElement;
    const { rerender } = render(at(0.6));
    expect(sweep().style.transition).toBe('none');
    rerender(at(0.3));
    expect(sweep().style.getPropertyValue('--delve-sweep')).toBe('180deg');
    expect(sweep().style.transition).toBe('--delve-sweep 80ms linear');
    // A refresh at the same angle (a pause, a hit-stop) doesn't cut the glide short.
    rerender(at(0.3));
    expect(sweep().style.transition).toBe('--delve-sweep 80ms linear');
    // A new beat starts: the sweep jumps back up at once.
    rerender(at(0.6));
    expect(sweep().style.transition).toBe('none');
  });

  it('sparks the buttons still cooling down for 0.4 s after Galvanize', () => {
```

After:
```tsx
    rerender(galvanize(null));
```
add:
```tsx
    expect(spark(0)).toBeNull();
    // Galvanize cuts cooldowns, not beats: a beat gets no spark.
    rerender(bar({ abilities: [{ ...cooling, beat: true }], galvanizedAt: 9.8, t: 10 }));
```

After:
```tsx
    expect(button.querySelector('[data-hold]')).toHaveAttribute('data-stage', '2');
```
add:
```tsx
    expect(button.querySelectorAll('[data-tick]')).toHaveLength(1);
```

In `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts` (stage 1 comes at half the charge now, so the holds charge 0.6 s; then the beat's snapshot):

Replace:
```ts
    for (let i = 0; i < Math.round(0.5 / STEP); i++)
      stepWorld(registry, w, { move: still, holding: 0 }, STEP);
    hud = snapshot(w);
    expect(hud.abilities[0].hold!.charge).toBeCloseTo(0.5, 1);
```
with:
```ts
    for (let i = 0; i < Math.round(0.6 / STEP); i++)
      stepWorld(registry, w, { move: still, holding: 0 }, STEP);
    hud = snapshot(w);
    expect(hud.abilities[0].hold!.charge).toBeCloseTo(0.57, 1);
```

Replace:
```ts
    for (let i = 0; i < Math.round(0.5 / STEP); i++)
```
with:
```ts
    for (let i = 0; i < Math.round(0.6 / STEP); i++)
```

Replace:
```ts
  });

  it("carries Obsidian's barrier and when Galvanize last fired", () => {
```
with:
```ts
  });

  it("shows a slot's beat as its wait (the longer of it and the move's cooldown), flagged as a beat", () => {
    const w = sandbox();
    w.t = 10;
    w.hero.beatFrom[0] = 9.8;
    w.hero.beatUntil[0] = 10.4;
    let bolt = snapshot(w).abilities[0];
    expect(bolt).toMatchObject({ beat: true, ready: false });
    expect(bolt.cooldown).toBeCloseTo(0.4);
    expect(bolt.cooldownTotal).toBeCloseTo(0.6);
    // A cooldown that outlasts the beat shows instead, with its own length.
    w.hero.cooldowns[0][0] = 11;
    bolt = snapshot(w).abilities[0];
    expect(bolt).toMatchObject({ beat: false, cooldown: 1, ready: false });
    expect(bolt.cooldownTotal).toBeCloseTo(w.hero.chains[0].moves[0].cooldown);
    // Over, and the button is ready again.
    w.t = 11;
    expect(snapshot(w).abilities[0]).toMatchObject({ beat: false, cooldown: 0, ready: true });
  });

  it("carries Obsidian's barrier and when Galvanize last fired", () => {
```

In `packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts`, the hero's stats carry a tempo and its holds their times; a hold gathers over its own time, a blow over `holdTime` × the tempo, full power at 100%:

Replace:
```ts
      stats: { weapon: { blows: [BLOW], feel: FEEL } },
```
with:
```ts
      stats: { weapon: { blows: [BLOW], feel: FEEL }, tempo: 1 },
```

Replace:
```ts
    const a = windingUp(
      world({
        chains: [{ moves: [stage(0.45)], hold: [[stage(0.45), stage(0.6), stage(0.9)]] }],
        hold: { slot: 0, step: 0, start: 1 - 0.5 * holdTime, aim: { x: 9, y: 5 } },
      } as never),
    )!;
```
with:
```ts
    const holding = (full: number) =>
      windingUp(
        world({
          chains: [{ moves: [stage(0.45)], hold: [[stage(0.45), stage(0.6), stage(0.9)]] }],
          hold: {
            slot: 0,
            step: 0,
            start: 1 - 0.5 * holdTime,
            aim: { x: 9, y: 5 },
            full,
            max: 2 * full,
          },
        } as never),
      )!;
    const a = holding(holdTime);
```

After:
```ts
    expect(a.color).toBe(MANA_HEX.nature);
```
add:
```ts
    // Its own charge time (a slower tempo's, fixed when it began): half as far, still stage 0.
    const slow = holding(2 * holdTime);
    expect(slow.progress).toBeCloseTo(0.25);
    expect(slow.heft).toBeCloseTo(0.45);
```

Replace:
```ts
      hold: { slot: 0, step: 0, start: 1 - 0.5 * holdTime, aim: { x: 9, y: 5 } },
```
with:
```ts
      hold: {
        slot: 0,
        step: 0,
        start: 1 - 0.5 * holdTime,
        aim: { x: 9, y: 5 },
        full: holdTime,
        max: 2 * holdTime,
      },
```

Replace:
```ts
  it("a manual blow held at its strike point gathers with its charge, as its stage's row", () => {
    const held = { ...swing, strikeAt: 0.1, held: 1 - 0.8 * holdTime };
    const a = windingUp(world({ swing: held } as never))!;
    expect(a.progress).toBeCloseTo(0.8);
    expect(a.heft).toBeCloseTo(FEEL.hold.heft); // stage 2
```
with:
```ts
  it("a manual blow held at its strike point gathers with its charge over holdTime × the tempo, as its stage's row", () => {
    const held = { ...swing, strikeAt: 0.1, held: 1 - 0.8 * holdTime };
    const a = windingUp(world({ swing: held } as never))!;
    expect(a.progress).toBeCloseTo(0.8);
    expect(a.heft).toBeCloseTo(FEEL.heavy.heft); // stage 1
    const stats = { weapon: { blows: [BLOW], feel: FEEL }, tempo: 2 };
    const slow = windingUp(world({ swing: held, stats } as never))!;
    expect(slow.progress).toBeCloseTo(0.4);
    expect(slow.heft).toBeCloseTo(FEEL.medium.heft); // stage 0
    const full = windingUp(world({ swing: { ...held, held: 1 - holdTime } } as never))!;
    expect(full.heft).toBeCloseTo(FEEL.hold.heft); // stage 2: full power at 100%
```

In `packages/client/src/features/delve/__tests__/arena-input.test.ts`, stage 2 is the full charge:

Replace:
```ts
    for (let i = 0; i < Math.round(0.8 / STEP); i++)
```
with:
```ts
    // Charged fully: stage 2.
    for (let i = 0; i < Math.round(1.1 / STEP); i++)
```

In `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`:

Replace:
```ts
        hold: { slot: 0, step: 0, start: 0, aim: null },
```
with:
```ts
        hold: { slot: 0, step: 0, start: 0, aim: null, full: 1, max: 2 },
```

In `packages/client/src/features/gamepad/__tests__/gamepad.test.ts`, the Lance that fired by itself waits out its beat before the light is ready:

Replace:
```ts
    // Held past holdMax, the Lance fires by itself and lands; the button stays held.
    const { holdMax } = registry.getDelveBalance().chains;
    const events: ArpgEvent[] = [];
    for (let i = 0; i < Math.round((holdMax + 0.5) / STEP); i++)
```
with:
```ts
    // Held past holdMax, the Lance fires by itself, lands and waits out its beat; the button
    // stays held.
    const { holdMax } = registry.getDelveBalance().chains;
    const events: ArpgEvent[] = [];
    for (let i = 0; i < Math.round((holdMax + 1.5) / STEP); i++)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ArenaHud.test.tsx src/features/delve/__tests__/arena-hud-snapshot.test.ts src/features/delve/__tests__/arena-input.test.ts src/features/delve/__tests__/arena-renderer.test.ts src/features/delve/arena/fx/__tests__/anticipation.test.ts src/features/gamepad/__tests__/gamepad.test.ts)`
Expected: 11 FAIL, 56 pass, in 4 files: `anticipation` (2), `ArenaHud` (5: the hold bar's tick, the two sweep tests, the Galvanize spark, the attack button's tick), `arena-hud-snapshot` (3) and `arena-input` (1).

- [ ] **Step 3: The snapshot**

In `packages/client/src/features/delve/arena/useArenaCore.ts`:

Replace:
```ts
  /** Seconds until the next move is ready (0 = ready). */
  cooldown: number;
  cooldownTotal: number;
```
with:
```ts
  /**
   * Seconds until the next move can go (0 = ready): the longer of its cooldown
   * and the slot's beat, and that wait's whole length.
   */
  cooldown: number;
  cooldownTotal: number;
  /** The wait is the slot's beat, not a cooldown: the button sweeps without a countdown. */
  beat: boolean;
```

Replace:
```ts
      const cooldown = Math.max(0, h.cooldowns[i][step] - t);
```
with:
```ts
      // The longer wait shows: the next move's cooldown, or the slot's beat.
      const cooling = Math.max(0, h.cooldowns[i][step] - t);
      const beat = Math.max(0, h.beatUntil[i] - t) > cooling;
      const cooldown = beat ? h.beatUntil[i] - t : cooling;
```

Replace:
```ts
        cooldownTotal: Math.max(0.01, ab.channel + ab.cooldown),
```
with:
```ts
        cooldownTotal: Math.max(
          0.01,
          beat ? h.beatUntil[i] - h.beatFrom[i] : ab.channel + ab.cooldown,
        ),
        beat,
```

Replace:
```ts
        hold: h.hold?.slot === i ? holdCharge(bal, h.hold.start, t) : null,
```
with:
```ts
        hold: h.hold?.slot === i ? holdCharge(bal, h.hold.start, t, h.hold.full) : null,
```

Replace:
```ts
    basicHold: held !== null ? holdCharge(bal, held, t) : null,
```
with:
```ts
    basicHold: held !== null ? holdCharge(bal, held, t, bal.chains.holdTime * h.stats.tempo) : null,
```

Replace:
```ts
  return h.hold?.slot === slot
    ? chainMove(h.chains[slot], h.hold.step, holdCharge(bal, h.hold.start, world.t).stage)
```
with:
```ts
  const hold = h.hold?.slot === slot ? h.hold : null;
  return hold
    ? chainMove(h.chains[slot], hold.step, holdCharge(bal, hold.start, world.t, hold.full).stage)
```

In `packages/client/src/features/delve/arena/fx/anticipation.ts`:

Replace:
```ts
      const { charge, stage } = holdCharge(bal, h.swing.held, w.t);
```
with:
```ts
      const full = bal.chains.holdTime * h.stats.tempo;
      const { charge, stage } = holdCharge(bal, h.swing.held, w.t, full);
```

Replace:
```ts
    const { charge, stage } = holdCharge(bal, h.hold.start, w.t);
```
with:
```ts
    const { charge, stage } = holdCharge(bal, h.hold.start, w.t, h.hold.full);
```

- [ ] **Step 4: The buttons**

In `packages/client/src/features/delve/delve.css` (CRLF: hand-edit), after `--delve-angle`'s registration:

Replace:
```css
}

@keyframes delve-spin {
```
with:
```css
}

/* An ability button waiting (a cooldown or its beat): a dark sweep over `--delve-sweep`, an
   angle registered so the sweep can glide between the HUD's refreshes. */
@property --delve-sweep {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

.delve-sweep {
  background: conic-gradient(rgba(0, 0, 0, 0.72) var(--delve-sweep), transparent 0deg);
}

@keyframes delve-spin {
```

In `packages/client/src/features/delve/arena/ArenaHud.tsx` (the imports; the hold bar ticks only short of its end; the button remembers the sweep it last drew, in an effect, so a StrictMode double render doesn't lose the glide; the same angle again keeps gliding, so a refresh during a pause or a hit-stop doesn't cut it short):

Replace:
```tsx
import { forwardRef, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
```
with:
```tsx
import {
  forwardRef,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
```

Replace:
```tsx
 * floor, ticked at the stages (`data-stage`: the stage reached). The fill
 * glides between the HUD's refreshes.
 */
function HoldBar({ hold, color }: { hold: { charge: number; stage: number }; color: string }) {
  const stages = getDelveRegistry().getDelveBalance().chains.holdStages;
```
with:
```tsx
 * floor, ticked at the stages short of its end (`data-stage`: the stage
 * reached); its end is full power. The fill glides between the HUD's refreshes.
 */
function HoldBar({ hold, color }: { hold: { charge: number; stage: number }; color: string }) {
  const stages = getDelveRegistry()
    .getDelveBalance()
    .chains.holdStages.filter((s) => s < 1);
```

Before:
```tsx
          className="absolute inset-y-0 w-px bg-white/70"
```
add:
```tsx
          data-tick
```

Replace:
```tsx
 * and a hold's charge. A tap, or a press let go in place, casts auto-aimed;
```
with:
```tsx
 * and a hold's charge, and a sweep while it waits (a cooldown, with its
 * seconds, or the slot's beat). A tap, or a press let go in place, casts auto-aimed;
```

Before:
```tsx
  const size = slot === 2 ? 72 : 64;
```
add:
```tsx
  // The sweep glides between the HUD's refreshes while it empties, and snaps when it rises (a
  // refresh at the same angle, in a pause or a hit-stop, keeps the glide going).
  const lastSweep = useRef(0);
  const glide = cdFrac <= lastSweep.current;
  useEffect(() => {
    lastSweep.current = cdFrac;
  });
```

Replace:
```tsx
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(rgba(0,0,0,0.72) ${cdFrac * 360}deg, transparent 0deg)`,
            }}
          />
        )}
        {cooling && (
```
with:
```tsx
            className="delve-sweep absolute inset-0 rounded-full"
            data-sweep={ab.beat ? 'beat' : 'cooldown'}
            style={
              {
                '--delve-sweep': `${cdFrac * 360}deg`,
                transition: glide ? '--delve-sweep 80ms linear' : 'none',
              } as CSSProperties
            }
          />
        )}
        {cooling && !ab.beat && (
```

Replace:
```tsx
      {galvanized && cooling && (
```
with:
```tsx
      {galvanized && cooling && !ab.beat && (
```

- [ ] **Step 5: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (67).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 701 tests pass (89 files).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/__tests__/ArenaHud.test.tsx packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts packages/client/src/features/delve/__tests__/arena-input.test.ts packages/client/src/features/delve/__tests__/arena-renderer.test.ts packages/client/src/features/gamepad/__tests__/gamepad.test.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/fx/anticipation.ts packages/client/src/features/delve/arena/ArenaHud.tsx
git add packages/client/src/features/delve/__tests__/ArenaHud.test.tsx packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts packages/client/src/features/delve/__tests__/arena-input.test.ts packages/client/src/features/delve/__tests__/arena-renderer.test.ts packages/client/src/features/gamepad/__tests__/gamepad.test.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/fx/anticipation.ts packages/client/src/features/delve/delve.css packages/client/src/features/delve/arena/ArenaHud.tsx
git commit -m "feat(client): the HUD sweeps through a slot's beat like a short cooldown; holds by their own times" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 7: Client: the readout, the item sheet and the Training Grounds

### Task 9: The readout's beats, a weapon's tempo, and No cooldowns' hint

The builder's readout ends a move's cost line with its beat ("then a 0.4s beat", from `beatFor` with the hero's tempo and the kind it plays as: a hold's stage-0 line takes the tap's medium beat) and its "Fully charged" line with the full-charge time and the full charge's beat ("Fully charged (1.3s): hits for 25, 13 mana, then a 1.04s beat"). A weapon's item sheet shows its tempo ("Tempo 1.3×: slower holds and chain beats"; "quicker" under 1, "standard" at 1). The Training Grounds' No cooldowns hint says the beats stay on.

**Files:**
- Modify: `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx:76-78`, `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx:40-42` (never format: hand-edit), `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx:102-104`
- Modify: `packages/client/src/features/delve/chains/MoveEditor.tsx:3-4,34,53,84-89`
- Modify: `packages/client/src/features/delve/ItemDetailSheet.tsx:112,261`
- Modify: `packages/client/src/features/delve/training/TrainingPanel.tsx:96`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`, before the add/reorder test (the maul's beats: 0.4 × 1.3 = 0.52 for a tap, 0.8 × 1.3 = 1.04 for a full charge):

Replace:
```tsx
  });

  it('adds, reorders and removes moves within the cap, never below one', () => {
```
with:
```tsx
  });

  it("says each move's beat, and a hold's full-charge time and beat, by the weapon's tempo", () => {
    const readout = () => screen.getByTestId('ability-readout');
    const { unmount } = render(<AbilitiesPanel />);
    // The Primary's first move, a light Bolt, on the starting sword (tempo 1).
    expect(readout()).toHaveTextContent(/cooldown, then a 0\.25s beat/);
    fireEvent.click(screen.getByTestId('kind-hold'));
    // A tap plays as a medium; a full charge as a hold.
    expect(readout()).toHaveTextContent(/cooldown, then a 0\.4s beat/);
    expect(readout()).toHaveTextContent(/Fully charged \(1s\): .+ mana, then a 0\.8s beat/);
    unmount();
    // On a maul (tempo 1.3), the charge and every beat take longer.
    const p = store().profile;
    store().setProfile({
      ...p,
      equipped: { ...p.equipped, weapon: { ...p.equipped.weapon!, baseId: 'maul' } },
    });
    render(<AbilitiesPanel />);
    expect(readout()).toHaveTextContent(/cooldown, then a 0\.52s beat/);
    expect(readout()).toHaveTextContent(/Fully charged \(1\.3s\): .+ mana, then a 1\.04s beat/);
  });

  it('adds, reorders and removes moves within the cap, never below one', () => {
```

In `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx` (hand-edit: this file is not Prettier-clean at HEAD, so never format it), before the attunement test:

Replace:
```tsx
  });

  it('greys attunement outside the pair, and shows the Mana Dust salvage gives', () => {
```
with:
```tsx
  });

  it("shows a weapon's tempo, and none on other gear", () => {
    const weapon = (baseId: string) =>
      generateItem(
        registry,
        { uid: baseId, ilvl: 3, rarity: 'magic', slot: 'weapon', baseId, mana: 'fire' },
        new SeededRNG(4),
      );
    put(weapon('maul'), weapon('wand'), weapon('sword'), helm('fire'));
    const tempo = (uid: string) => {
      const { unmount } = render(<ItemDetailSheet uid={uid} onClose={() => {}} />);
      const text = screen.queryByTestId('item-tempo')?.textContent ?? null;
      unmount();
      return text;
    };
    expect(tempo('maul')).toBe('Tempo 1.3×: slower holds and chain beats');
    expect(tempo('wand')).toBe('Tempo 0.8×: quicker holds and chain beats');
    expect(tempo('sword')).toBe('Tempo 1×: standard holds and chain beats');
    expect(tempo('h1')).toBeNull();
  });

  it('greys attunement outside the pair, and shows the Mana Dust salvage gives', () => {
```

In `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`:

Replace:
```tsx
  });

  it("the sheet's Close answers the controller's B; Back to the Anvil carries no marker", () => {
```
with:
```tsx
  });

  it('No cooldowns says the beats stay on', () => {
    renderPanel('toggles');
    expect(
      screen.getByText('Cooldowns are off and charge stays full; each move still waits its beat.'),
    ).toBeInTheDocument();
  });

  it("the sheet's Close answers the controller's B; Back to the Anvil carries no marker", () => {
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/AbilitiesPanel.test.tsx src/features/delve/__tests__/ItemDetailSheet.test.tsx src/features/delve/__tests__/TrainingPanel.test.tsx)`
Expected: 3 FAIL, 39 pass: the readout's beats, the weapon's tempo (expected null to be 'Tempo 1.3×: slower holds and chain beats') and the No cooldowns hint (Unable to find an element with the text …).

- [ ] **Step 3: The texts**

In `packages/client/src/features/delve/chains/MoveEditor.tsx`:

Replace:
```tsx
  blowNumbers,
  moveNumbers,
```
with:
```tsx
  beatFor,
  blowNumbers,
  moveNumbers,
  playedKind,
```

Replace:
```tsx
/** Plain-language numbers for a resolved move (at its place in the chain); a hold's full charge too. */
```
with:
```tsx
/** Seconds as the readout says them: 0.4, 1.04. */
const secs = (s: number) => `${+s.toFixed(2)}s`;

/**
 * Plain-language numbers for a resolved move (at its place in the chain) and
 * the beat after it; a hold's full charge too, with its time and its beat (by
 * the weapon's tempo).
 */
```

Before:
```tsx
  const f = ab.form.id;
```
add:
```tsx
  const beat = (a: ResolvedAbility) =>
    `then a ${secs(beatFor(bal, a.slot, playedKind(a), stats.tempo))} beat`;
```

Replace:
```tsx
    `${pay} · ${ab.payment === 'charge' ? 'no cooldown' : `${ab.cooldown.toFixed(ab.cooldown < 2 ? 2 : 0)}s cooldown`}`,
```
with:
```tsx
    `${pay} · ${ab.payment === 'charge' ? 'no cooldown' : `${ab.cooldown.toFixed(ab.cooldown < 2 ? 2 : 0)}s cooldown`}, ${beat(ab)}`,
```

Replace:
```tsx
      `Fully charged (${bal.chains.holdTime}s): hits for ${formatNumber(moveNumbers(stats, bal, full).hit)}, ${full.payment === 'charge' ? `Charge ${Math.round(full.chargeNeed)}` : `${Math.round(full.cost)} mana`}`,
```
with:
```tsx
      `Fully charged (${secs(bal.chains.holdTime * stats.tempo)}): hits for ${formatNumber(moveNumbers(stats, bal, full).hit)}, ${full.payment === 'charge' ? `Charge ${Math.round(full.chargeNeed)}` : `${Math.round(full.cost)} mana`}, ${beat(full)}`,
```

In `packages/client/src/features/delve/ItemDetailSheet.tsx`, the tempo beside the weapon's kind:

Replace:
```tsx
  const attack = registry.getDelveData().bases.find((b) => b.id === item.baseId)?.attack;
```
with:
```tsx
  const base = registry.getDelveData().bases.find((b) => b.id === item.baseId);
  const attack = base?.attack;
```

After:
```tsx
                  {attack.kind === 'bolt' ? '🎯 Ranged' : '⚔️ Melee'}
```
add:
```tsx
                </span>
              )}
              {base?.tempo !== undefined && (
                <span className="rounded bg-white/5 px-1.5 py-0.5" data-testid="item-tempo">
                  Tempo {base.tempo}×:{' '}
                  {base.tempo > 1 ? 'slower' : base.tempo < 1 ? 'quicker' : 'standard'} holds and
                  chain beats
```

In `packages/client/src/features/delve/training/TrainingPanel.tsx`:

Replace:
```tsx
    'An ability can go again as soon as it lands; charge refills as it lands.',
```
with:
```tsx
    'Cooldowns are off and charge stays full; each move still waits its beat.',
```

- [ ] **Step 4: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (42).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 704 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx packages/client/src/features/delve/chains/MoveEditor.tsx packages/client/src/features/delve/ItemDetailSheet.tsx packages/client/src/features/delve/training/TrainingPanel.tsx
git add packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx packages/client/src/features/delve/chains/MoveEditor.tsx packages/client/src/features/delve/ItemDetailSheet.tsx packages/client/src/features/delve/training/TrainingPanel.tsx
git commit -m "feat(client): the readout names each move's beat and a hold's full-charge time; a weapon shows its tempo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 8: Client: the controller

### Task 10: Pad chords by press order, hold-to-repeat early and marked

`padToArena` reports every ability button pressed this frame (`cast`), held (`held`) and held with hold-to-repeat on (`repeat`), all in slot order. `padFrameCast` keeps the press order in `PadMemory` and decides the frame: `holding` is the latest ability button pressed while it stays held (an earlier one counts again only when pressed again), so a second button pressed while another's hold charges sends that hold's release now and its own press next frame (the chord's carry), whichever slots they are. Two pressed in one frame go in slot order: the lower's press now (a tap, even on a hold, as a key's), the higher holds, and its press follows next frame unless its next move is a hold. Hold-to-repeat repeats the latest held repeat button, falling back to an earlier one still held (RT keeps streaming when LB is tapped); it presses whenever its slot has no press waiting and the move the press would cast isn't a hold, including during a wind-up, a beat or a cooldown, and marks the press. Whether a press is a hold's (charged, cast on release) reads `pressMove`, so a pad press during a light's wind-up with a hold next starts the hold's charge. `frameInput` takes `holding` from the pad's frame, marks a repeat press, aims by `pressMove`, and carries a key's or HUD button's press made in a frame the pad's press took to the next frame; a key's or button's press beats a repeat press (the repeat goes again later), so a streaming button can't hold it back.

**Files:**
- Modify: `packages/client/src/features/gamepad/__tests__/gamepad.test.ts:7-12,89-101,143-164,186-229,242-246`
- Modify: `packages/client/src/features/delve/__tests__/arena-input.test.ts:213-215,232-234,274-277` (and a new test)
- Replace: `packages/client/src/features/gamepad/arena-pad.ts` (a Write: LF)
- Modify: `packages/client/src/features/delve/arena/input.ts:2,91-92,111-125,141`
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts:422` (a comment)

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/gamepad/__tests__/gamepad.test.ts` (the new shapes; `padCast` returns `{ slot, repeat }`; the frame helper takes the buttons pressed, held and repeating, and the chord, two-at-once, repeat and wind-up tests replace the old chord test):

Before:
```ts
  makeCtx,
```
add:
```ts
  inBeat,
```

Before:
```ts
} from '@alloy/engine';
```
add:
```ts
  type Chain,
  type Chains,
  type FormId,
  type MoveKind,
```

Replace:
```ts
    expect(act([7]).cast).toBe(0); // RT press
    expect(act([7]).castHeld).toBe(0); // RT held keeps casting
    expect(act([7]).holding).toBe(0); // and charges a hold move
    expect(act([4]).holding).toBe(1);
    expect(act([]).holding).toBeNull();
    expect(act([4]).cast).toBe(1); // LB
    expect(act([11]).cast).toBe(2); // R3
```
with:
```ts
    expect(act([7]).cast).toEqual([0]); // RT press
    expect(act([7]).held).toEqual([0]); // held (a hold move charges)
    expect(act([7]).repeat).toEqual([0]); // with hold-to-repeat on
    expect(act([4]).held).toEqual([1]);
    expect(act([4]).repeat).toEqual([]);
    expect(act([]).held).toEqual([]);
    expect(act([4]).cast).toEqual([1]); // LB
    expect(act([11]).cast).toEqual([2]); // R3
    // Every button pressed and held, in slot order.
    expect(act([11, 4]).cast).toEqual([1, 2]);
    expect(act([11, 4, 7]).held).toEqual([0, 1, 2]);
```

Replace:
```ts
      expect([a.cast, a.dodge, a.potion, a.attackHeld]).toEqual([null, false, false, false]);
```
with:
```ts
      expect([a.cast, a.dodge, a.potion, a.attackHeld]).toEqual([[], false, false, false]);
```

Replace:
```ts
  const none = { cast: null, castHeld: null };

  it('a press casts a non-hold next move, and repeat casts it again once ready', () => {
    const w = world();
    expect(padCast(registry, w, { cast: 0, castHeld: 0 }, null)).toBe(0);
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toBe(0);
    expect(padCast(registry, w, none, 0)).toBeNull(); // its release does nothing
    w.hero.cooldowns[0][0] = w.t + 1;
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toBeNull();
    expect(padCast(registry, w, { cast: 0, castHeld: 0 }, null)).toBe(0); // a press always tries
```
with:
```ts
  const none = { cast: null, castHeld: null };
  const pressOf = (slot: number) => ({ slot, repeat: false });
  const repeatOf = (slot: number) => ({ slot, repeat: true });

  it('a press casts a non-hold next move; repeat presses early, whenever none of its slot waits', () => {
    const w = world();
    expect(padCast(registry, w, { cast: 0, castHeld: 0 }, null)).toEqual(pressOf(0));
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toEqual(repeatOf(0));
    expect(padCast(registry, w, none, 0)).toBeNull(); // its release does nothing
    // On cooldown, repeat still presses: the press waits in the buffer. One waiting, it stops.
    w.hero.cooldowns[0][0] = w.t + 1;
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toEqual(repeatOf(0));
    stepWorld(registry, w, { move: { x: 0, y: 0 }, cast: { slot: 0, repeat: true } }, STEP);
    expect(w.queuedCasts).toHaveLength(1);
    expect(padCast(registry, w, { cast: null, castHeld: 0 }, null)).toBeNull();
    expect(padCast(registry, w, { cast: 0, castHeld: 0 }, null)).toEqual(pressOf(0)); // a press always tries
```

Replace:
```ts
    expect(padCast(registry, w, none, 0)).toBe(0);
```
with:
```ts
    expect(padCast(registry, w, none, 0)).toEqual(pressOf(0));
```

Replace:
```ts
  /** One frame on the pad: its cast (`padFrameCast`) into a step of `w`, `holding`'s button held. */
  const frame = (w: ArpgWorld, mem: PadMemory, cast: number | null, holding: number | null) => {
    const slot = padFrameCast(registry, w, { cast, castHeld: null, holding }, mem);
    const step = {
      move: { x: 0, y: 0 },
      holding,
      cast: slot === null ? null : { slot, aim: null },
    };
    const casts = stepWorld(registry, w, step, STEP).flatMap((e) =>
      e.kind === 'cast' ? [e.slot] : [],
    );
    return { slot, casts };
  };
```
with:
```ts
  /**
   * One frame on the pad: `pressed` go down, `held` are down (`repeat` of them with hold-to-repeat
   * on); its cast (`padFrameCast`) into a step of `w`, with its `holding`.
   */
  const frame = (
    w: ArpgWorld,
    mem: PadMemory,
    pressed: number[],
    held: number[],
    repeat: number[] = [],
  ) => {
    const f = padFrameCast(registry, w, { cast: pressed, held, repeat }, mem);
    const step = {
      move: { x: 0, y: 0 },
      holding: f.holding,
      cast: f.cast && { slot: f.cast.slot, aim: null, repeat: f.cast.repeat },
    };
    const events = stepWorld(registry, w, step, STEP);
    const casts = events.flatMap((e) => (e.kind === 'cast' ? [e.slot] : []));
    return {
      slot: f.cast?.slot ?? null,
      repeat: !!f.cast?.repeat,
      holding: f.holding,
      events,
      casts,
    };
  };
  /** A sandbox (mana enough for anything) with these chains over Fire's defaults. */
  const arena = (over: Partial<Chains> = {}) => {
    const w = createSandboxWorld(registry, {
      depth: 5,
      stats: computeHeroStats({}, registry),
      chains: { ...defaultChains(registry, 'fire', null), ...over },
      toggles: { infiniteMana: true, noCooldowns: false, invulnerable: false },
    });
    spawnDummies(registry, w, { layout: 'single', element: null });
    w.hero.charge = [100, 100, 100];
    return w;
  };
  /** A one-move Fire chain. */
  const one = (kind: MoveKind, form: FormId): Chain => ({
    moves: [{ kind, form, elements: ['fire'] }],
    payment: 'mana',
  });
  const HOLD_NOVA = one('hold', 'nova');
  const HOLD_WARD = one('hold', 'ward');
  const NOVA = one('medium', 'nova');
```

Replace:
```ts
    const frames = [0, 0, 0, null].map((held, i) => frame(w, mem, i === 0 ? 0 : null, held));
    expect(frames.map((f) => f.slot)).toEqual([null, null, null, 0]);
  });

  it('padFrameCast: a chord keeps both presses, the release first', () => {
    // The Ultimate a Nova that holds (on R3), the Defensive a Ward (on LB).
    const w = createSandboxWorld(registry, {
      depth: 5,
      stats: computeHeroStats({}, registry),
      chains: {
        ...defaultChains(registry, 'fire', null),
        ultimate: { moves: [{ kind: 'hold', form: 'nova', elements: ['fire'] }], payment: 'mana' },
      },
      // Mana enough for both.
      toggles: { infiniteMana: true, noCooldowns: false, invulnerable: false },
    });
    const mem = padMemory();
    for (let i = 0; i < 15; i++) frame(w, mem, i === 0 ? 2 : null, 2);
    expect(w.hero.hold?.slot).toBe(2);
    // LB goes down with R3 still held: `holding` names the Defensive now, so the Nova releases
    // this frame, and the Ward's press casts the next.
    const frames = Array.from({ length: 60 }, (_, i) => frame(w, mem, i === 0 ? 1 : null, 1));
    expect(frames.slice(0, 3).map((f) => f.slot)).toEqual([2, 1, null]);
    expect(frames.flatMap((f) => f.casts)).toEqual([2, 1]);
```
with:
```ts
    const frames = [[0], [0], [0], []].map((held, i) => frame(w, mem, i === 0 ? [0] : [], held));
    expect(frames.map((f) => f.slot)).toEqual([null, null, null, 0]);
  });

  it("padFrameCast: a second button releases a charging hold, whichever slots they are; the first doesn't come back", () => {
    // R3's Nova charging, then LB; and LB's Ward charging, then R3.
    for (const [first, second, over] of [
      [2, 1, { ultimate: HOLD_NOVA }],
      [1, 2, { defensive: HOLD_WARD, ultimate: NOVA }],
    ] as const) {
      const w = arena(over);
      const mem = padMemory();
      for (let i = 0; i < 15; i++) frame(w, mem, i === 0 ? [first] : [], [first]);
      expect(w.hero.hold?.slot).toBe(first);
      // The second goes down with the first still held: the first's hold releases this frame,
      // and the second's press casts the next.
      const both = [first, second].sort();
      const frames = Array.from({ length: 60 }, (_, i) =>
        frame(w, mem, i === 0 ? [second] : [], both),
      );
      expect(frames.slice(0, 3).map((f) => f.slot)).toEqual([first, second, null]);
      expect(frames.flatMap((f) => f.casts)).toEqual([first, second]);
      // The second lets go, the first still held: it doesn't count again until pressed again.
      const after = Array.from({ length: 60 }, () => frame(w, mem, [], [first]));
      expect(after.every((f) => f.holding === null && f.slot === null)).toBe(true);
      expect(w.hero.hold).toBeNull();
    }
  });

  it('padFrameCast: two presses in one frame go in slot order, the higher holding', () => {
    // LB and R3 at once: the Ward now, the Nova next frame.
    const plain = arena({ ultimate: NOVA });
    const mem = padMemory();
    const first = frame(plain, mem, [1, 2], [1, 2]);
    expect([first.slot, first.holding]).toEqual([1, 2]);
    const rest = Array.from({ length: 60 }, () => frame(plain, mem, [], [1, 2]));
    expect([...first.casts, ...rest.flatMap((f) => f.casts)]).toEqual([1, 2]);

    // With a hold Nova, the held R3 charges it instead of pressing.
    const held = arena({ ultimate: HOLD_NOVA });
    const hmem = padMemory();
    frame(held, hmem, [1, 2], [1, 2]);
    const charging = Array.from({ length: 30 }, () => frame(held, hmem, [], [1, 2]));
    expect(charging.flatMap((f) => f.casts)).toEqual([1]);
    expect(held.hero.hold?.slot).toBe(2);

    // The lower's hold move taps at stage 0, as a key tap does.
    const tap = arena({ defensive: HOLD_WARD, ultimate: NOVA });
    const tmem = padMemory();
    expect(frame(tap, tmem, [1, 2], [1, 2]).slot).toBe(1);
    expect(tap.hero.windup?.slot).toBe(1);
    expect(tap.hero.windup?.stage).toBe(0);
  });

  it('hold-to-repeat follows the latest held repeat button, falling back to an earlier one still held', () => {
    const w = arena();
    const mem = padMemory();
    // Each frame's cast without stepping, so nothing waits: RT streams, LB (repeat off) is
    // pressed once, and RT streams on while LB is held and after.
    const cast = (pressed: number[], held: number[], repeat: number[]) =>
      padFrameCast(registry, w, { cast: pressed, held, repeat }, mem).cast;
    expect(cast([0], [0], [0])).toEqual(pressOf(0));
    expect(cast([], [0], [0])).toEqual(repeatOf(0));
    expect(cast([1], [0, 1], [0])).toEqual(pressOf(1));
    expect(cast([], [0, 1], [0])).toEqual(repeatOf(0));
    // With LB's repeat on too, the latest streams; let go, RT again.
    expect(cast([], [0, 1], [0, 1])).toEqual(repeatOf(1));
    expect(cast([], [0], [0])).toEqual(repeatOf(0));
  });

  it("repeat presses early: during a wind-up, and the press waits out the landing's beat", () => {
    const w = arena();
    const mem = padMemory();
    const rt = () => frame(w, mem, [], [0], [0]);
    frame(w, mem, [0], [0], [0]);
    expect(w.hero.windup?.slot).toBe(0);
    // During the wind-up, a marked press goes out and waits.
    const during = rt();
    expect(during.repeat).toBe(true);
    expect(w.queuedCasts.map((q) => q.cast)).toEqual([{ slot: 0, aim: null, repeat: true }]);
    // It waits through the landing and the beat, and fires at the beat's end.
    let end = 0;
    for (let i = 0; i < 60 && !inBeat(w.hero, 0, w.t); i++) rt();
    end = w.hero.beatUntil[0];
    expect(w.queuedCasts).toHaveLength(1);
    for (let i = 0; i < 60 && !w.hero.windup; i++) rt();
    expect(w.t).toBeGreaterThanOrEqual(end - 1e-6);
    expect(w.t).toBeLessThan(end + 2 * STEP);
  });

  it('RT held through a light-then-hold chain charges the hold', () => {
    const w = world();
    spawnDummies(registry, w, { layout: 'single', element: null });
    const mem = padMemory();
    const frames = [frame(w, mem, [0], [0], [0])];
    for (let i = 0; i < 60 && !w.hero.hold; i++) frames.push(frame(w, mem, [], [0], [0]));
    expect(w.hero.hold?.slot).toBe(0);
    // Only the light cast: the hold charges, then fires when RT lets go.
    expect(frames.flatMap((f) => f.casts)).toEqual([0]);
    expect(frame(w, mem, [], []).slot).toBe(0);
  });

  it('repeat on an empty pool stays quiet: no noMana, though a fresh press says so', () => {
    const w = createSandboxWorld(registry, {
      depth: 5,
      stats: computeHeroStats({}, registry),
      chains: defaultChains(registry, 'fire', null),
      toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
    });
    spawnDummies(registry, w, { layout: 'single', element: null });
    w.hero.mana = 0;
    w.hero.manaRegen = 0;
    w.hero.nextAttackAt = 1e9;
    const mem = padMemory();
    const first = frame(w, mem, [0], [0], [0]);
    expect(first.events.filter((e) => e.kind === 'noMana')).toHaveLength(1);
    const held = Array.from({ length: 30 }, () => frame(w, mem, [], [0], [0]));
    expect(held.some((f) => f.repeat)).toBe(true);
    expect(held.flatMap((f) => f.events).some((e) => e.kind === 'noMana')).toBe(false);
  });

  it("a pad press during a light's wind-up, with a hold next, starts the hold's charge rather than tapping it", () => {
    const w = world();
    spawnDummies(registry, w, { layout: 'single', element: null });
    // The light winds up (a key's press); RT goes down meanwhile and stays held.
    stepWorld(registry, w, { move: { x: 0, y: 0 }, cast: { slot: 0, aim: null } }, STEP);
    expect(w.hero.windup?.step).toBe(0);
    const mem = padMemory();
    const pressed = frame(w, mem, [0], [0]);
    expect(pressed.slot).toBeNull();
    const frames = [pressed];
    for (let i = 0; i < 60 && !w.hero.hold; i++) frames.push(frame(w, mem, [], [0]));
    expect(w.hero.hold).toMatchObject({ slot: 0, step: 1 });
    expect(frames.flatMap((f) => f.casts)).toEqual([0]); // the light's, and no tap
```

Replace:
```ts
    expect(act([0]).cast).toBe(0); // A is now the Primary
    expect(act([0]).castHeld).toBeNull(); // with repeat off
    expect(act([7]).cast).toBeNull(); // RT is unbound now
    expect(act([4]).castHeld).toBe(1); // LB Defensive repeats
    expect(act([0]).holding).toBe(0); // held, repeat or not
```
with:
```ts
    expect(act([0]).cast).toEqual([0]); // A is now the Primary
    expect(act([0]).repeat).toEqual([]); // with repeat off
    expect(act([7]).cast).toEqual([]); // RT is unbound now
    expect(act([4]).repeat).toEqual([1]); // LB Defensive repeats
    expect(act([0]).held).toEqual([0]); // held, repeat or not
```

In `packages/client/src/features/delve/__tests__/arena-input.test.ts`, the pad's shape, and a key's press carried past the pad's and beating a repeat:

Replace:
```ts
    cast: null,
    castHeld: null,
    holding: null,
```
with:
```ts
    cast: [],
    held: [],
    repeat: [],
```

Replace:
```ts
    expect(frameInput(registry, w, input, pad({ holding: 0 }), mem, opts).holding).toBe(1);
    input.aiming = null;
    expect(frameInput(registry, w, input, pad({ holding: 0 }), mem, opts).holding).toBe(0);
```
with:
```ts
    expect(frameInput(registry, w, input, pad({ cast: [0], held: [0] }), mem, opts).holding).toBe(
      1,
    );
    input.aiming = null;
    expect(frameInput(registry, w, input, pad({ held: [0] }), mem, opts).holding).toBe(0);
```

Replace:
```ts
    expect(frameInput(registry, w, input, pad({ cast: 0, holding: 0 }), mem, opts).cast).toBeNull();
    expect(frameInput(registry, w, input, pad({ holding: 0 }), mem, opts).cast).toBeNull();
    expect(frameInput(registry, w, input, pad(), mem, opts).cast).toEqual({ slot: 0, aim: null });
  });
```
with:
```ts
    expect(
      frameInput(registry, w, input, pad({ cast: [0], held: [0] }), mem, opts).cast,
    ).toBeNull();
    expect(frameInput(registry, w, input, pad({ held: [0] }), mem, opts).cast).toBeNull();
    expect(frameInput(registry, w, input, pad(), mem, opts).cast).toEqual({ slot: 0, aim: null });
  });

  it("a key's press made in the pad press's frame goes the next frame; a repeat is marked and gives way", () => {
    const w = world();
    const input = createArenaInput();
    const mem = padMemory();
    const frame = (acts: Partial<ArenaPadActions>) =>
      frameInput(registry, w, input, pad(acts), mem, opts).cast;
    input.cast = { slot: 1, aim: null };
    expect(frame({ cast: [2], held: [2] })).toEqual({ slot: 2, aim: null });
    expect(frame({})).toEqual({ slot: 1, aim: null });
    expect(frame({})).toBeNull();
    // Hold-to-repeat's press says so, and gives way to a key's.
    expect(frame({ cast: [1], held: [1], repeat: [1] })).toEqual({ slot: 1, aim: null });
    expect(frame({ held: [1], repeat: [1] })).toEqual({ slot: 1, aim: null, repeat: true });
    input.cast = { slot: 2, aim: null };
    expect(frame({ held: [1], repeat: [1] })).toEqual({ slot: 2, aim: null });
    expect(frame({ held: [1], repeat: [1] })).toEqual({ slot: 1, aim: null, repeat: true });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/gamepad src/features/delve/__tests__/arena-input.test.ts)`
Expected: 17 FAIL, 27 pass, in `gamepad.test.ts` and `arena-input.test.ts` (the old `padToArena` still returns one slot for `cast` and no `held`, and `padCast` a number).

- [ ] **Step 3: The pad**

Replace the whole of `packages/client/src/features/gamepad/arena-pad.ts` with:

```ts
import { pressMove, type ArpgWorld, type DataRegistry, type Vec } from '@alloy/engine';
import type { PadButton, PadState } from './gamepad';
import { DEFAULT_CONTROLS, type ControlsConfig } from '@/features/controls/controls';

/**
 * What the controller asks of the arena this frame, from the player's
 * bindings (`ControlsConfig.pad`; the default keeps both thumbs on the
 * sticks: RT Primary, LT dodge, LB Defensive, R3 Ultimate, RB manual attack,
 * D-pad down potion).
 */
export interface ArenaPadActions {
  /** Left stick, 0..1 per axis after the deadzone. */
  move: Vec;
  /** Right stick direction when tilted past its deadzone, else null (auto-aim). */
  aimDir: Vec | null;
  /** How far the right stick is tilted, 0..1. */
  aimTilt: number;
  /** Ability slots pressed this frame (0 Primary, 1 Defensive, 2 Ultimate), in slot order. */
  cast: number[];
  /** Ability slots whose buttons are held, in slot order. */
  held: number[];
  /** Of those, the ones with hold-to-repeat on. */
  repeat: number[];
  dodge: boolean;
  potion: boolean;
  /** The attack button held: manual basic attacks. */
  attackHeld: boolean;
  /** The attack button pressed this frame (a tap the engine keeps briefly). */
  attackTap: boolean;
  menu: boolean;
}

const ABILITY_ACTIONS = ['primary', 'defensive', 'ultimate'] as const;

export function padToArena(
  state: PadState,
  pressed: Set<PadButton>,
  cfg: ControlsConfig = DEFAULT_CONTROLS,
): ArenaPadActions {
  const tilt = Math.hypot(state.right.x, state.right.y);
  const is = (b: PadButton | null, set: (b: PadButton) => boolean) => b !== null && set(b);
  /** The ability slots whose button passes `on` (and, with `repeat`, has hold-to-repeat on). */
  const slots = (on: (b: PadButton) => boolean, repeat = false) =>
    ABILITY_ACTIONS.flatMap((a, i) =>
      (!repeat || cfg.repeat[a]) && is(cfg.pad[a], on) ? [i] : [],
    );
  return {
    move: state.left,
    aimDir: tilt > 0 ? { x: state.right.x / tilt, y: state.right.y / tilt } : null,
    aimTilt: tilt,
    cast: slots((b) => pressed.has(b)),
    held: slots((b) => state.buttons[b]),
    repeat: slots((b) => state.buttons[b], true),
    dodge: is(cfg.pad.dodge, (b) => pressed.has(b)),
    potion: is(cfg.pad.potion, (b) => pressed.has(b)),
    attackHeld: is(cfg.pad.attack, (b) => state.buttons[b]),
    attackTap: is(cfg.pad.attack, (b) => pressed.has(b)),
    menu: is(cfg.pad.menu, (b) => pressed.has(b)),
  };
}

/**
 * Whether a slot's button casts on its release: its hold is charging, or the
 * move a press now would cast is a hold (during the slot's own wind-up, the
 * move after the winding one: `pressMove`).
 */
function castsOnRelease(registry: DataRegistry, world: ArpgWorld, slot: number): boolean {
  const h = world.hero;
  const window = registry.getDelveBalance().abilities.comboWindow;
  return h.hold?.slot === slot || pressMove(h, slot, world.t, window).kind === 'hold';
}

/** A controller cast: its slot, and whether hold-to-repeat made it (`AbilityCast.repeat`). */
export interface PadCast {
  slot: number;
  repeat: boolean;
}

/**
 * The ability the controller casts this frame, read from the world (not the
 * HUD snapshot). A slot whose button casts on its release (`castsOnRelease`)
 * casts when it lets go (`released`: the slot held last frame and not now),
 * never on the press (unless `tap`: pressed with a higher slot in one frame, it
 * taps, as a key does) and never by repeat: the held button charges it. Any
 * other casts on the press, which always tries (so an unaffordable one still
 * says so), or with repeat on (`castHeld`), early: whenever its slot has no
 * press waiting, including during a wind-up, a beat or a cooldown (the press
 * waits in the buffer), but not while the button that dropped its slot's hold
 * stays held (`holdDropped`): after a hold fires by itself, the next move
 * waits for a press.
 */
export function padCast(
  registry: DataRegistry,
  world: ArpgWorld,
  acts: { cast: number | null; castHeld: number | null },
  released: number | null,
  tap = false,
): PadCast | null {
  const onRelease = (slot: number) => castsOnRelease(registry, world, slot);
  if (released !== null && onRelease(released)) return { slot: released, repeat: false };
  if (acts.cast !== null)
    return tap || !onRelease(acts.cast) ? { slot: acts.cast, repeat: false } : null;
  const held = acts.castHeld;
  return held !== null &&
    !onRelease(held) &&
    world.holdDropped !== held &&
    !world.queuedCasts.some((q) => q.cast.slot === held)
    ? { slot: held, repeat: true }
    : null;
}

/** What the pad remembers from the frame before. */
export interface PadMemory {
  /**
   * The pad's `holding`: the latest ability button pressed, while it stays
   * held. Once it isn't (let go, or another button pressed), it has released.
   */
  holding: number | null;
  /** The ability buttons held, earliest pressed first: hold-to-repeat follows the latest. */
  order: number[];
  /** A press that waits a frame (a chord's, or the higher of two in one frame): it casts now. */
  carried: number | null;
  /**
   * The attack button held then, or let go with its held blow not yet struck:
   * the tick that strikes it still aims with the stick.
   */
  attackHeld: boolean;
}

export function padMemory(): PadMemory {
  return { holding: null, order: [], carried: null, attackHeld: false };
}

/** The controller's part of a frame's input: its cast (`padCast`), and the slot it is holding. */
export interface PadFrame {
  cast: PadCast | null;
  holding: number | null;
}

/**
 * This frame's controller cast and `holding`, with the pad's memory of the
 * frame before. `holding` is the latest ability button pressed while it stays
 * held; an earlier button counts again only when it is pressed again. So a
 * second button pressed while another's hold charges brings that hold's
 * release (it casts now) and its own press, which follows next frame (the
 * chord's carry), whichever slots they are. Two pressed in one frame count in
 * slot order: the lower's press goes now (a tap on a hold, as a key's), the
 * higher becomes `holding` and its press follows next frame, unless its next
 * move is a hold (the button charges it). Hold-to-repeat streams the latest
 * held repeat button, falling back to an earlier one still held.
 */
export function padFrameCast(
  registry: DataRegistry,
  world: ArpgWorld,
  acts: Pick<ArenaPadActions, 'cast' | 'held' | 'repeat'>,
  mem: PadMemory,
): PadFrame {
  const pressed = acts.cast;
  mem.order = [
    ...mem.order.filter((s) => acts.held.includes(s) && !pressed.includes(s)),
    ...pressed,
  ];
  const latest = pressed.length > 0 ? pressed[pressed.length - 1] : null;
  const holding =
    latest ?? (mem.holding !== null && acts.held.includes(mem.holding) ? mem.holding : null);
  const released = mem.holding !== null && mem.holding !== holding ? mem.holding : null;
  mem.holding = holding;
  const carried = mem.carried;
  mem.carried = null;
  const press = pressed.length > 0 ? pressed[0] : carried;
  const castHeld = [...mem.order].reverse().find((s) => acts.repeat.includes(s)) ?? null;
  const cast = padCast(registry, world, { cast: press, castHeld }, released, pressed.length > 1);
  // A chord: the release casts now, the press next frame.
  if (cast?.slot === released && press !== null && press !== released) mem.carried = press;
  // Two at once: the higher follows next frame, unless it charges a hold.
  else if (pressed.length > 1 && !castsOnRelease(registry, world, latest!)) mem.carried = latest;
  return { cast, holding };
}

/**
 * Where a right-stick aim lands, in world units. Placed forms reach further
 * the more the stick is tilted (up to `aimReach` × their range); directional
 * forms just take the direction.
 */
export function stickAimPoint(
  hero: Vec,
  dir: Vec,
  tilt: number,
  range: number,
  placed: boolean,
  aimReach = 1,
): Vec {
  const reach = range > 0 ? (placed ? range * Math.max(0.3, tilt * aimReach) : range) : 4;
  return { x: hero.x + dir.x * reach, y: hero.y + dir.y * reach };
}
```

In `packages/client/src/features/delve/arena/input.ts`:

Replace:
```ts
  nextMove,
```
with:
```ts
  pressMove,
```

Replace:
```ts
 * before). The pad's cast (`padFrameCast`, aimed by the right stick) wins over
 * a key's or a button's; a key or button held wins `holding` over the pad; the
```
with:
```ts
 * before). The pad's press (`padFrameCast`, aimed by the right stick) wins over
 * a key's or a button's, which then waits for the next frame; a key's or a
 * button's wins over hold-to-repeat's (marked), which goes again later; a key
 * or button held wins `holding` over the pad's (`padFrameCast`); the
```

Replace:
```ts
  const slot = pad ? padFrameCast(registry, world, pad, mem) : null;
  if (pad && slot !== null) {
    const ab = nextMove(h, slot, world.t, registry.getDelveBalance().abilities.comboWindow);
```
with:
```ts
  const frame = pad ? padFrameCast(registry, world, pad, mem) : null;
  // A repeat gives way to a key's or a button's press (it repeats again later).
  const padCast = frame?.cast && !(frame.cast.repeat && press) ? frame.cast : null;
  if (pad && padCast) {
    const { slot, repeat } = padCast;
    const ab = pressMove(h, slot, world.t, registry.getDelveBalance().abilities.comboWindow);
```

Replace:
```ts
    cast = { slot, aim };
```
with:
```ts
    cast = repeat ? { slot, aim, repeat } : { slot, aim };
```

Replace:
```ts
    holding: holdingSlot(input) ?? pad?.holding ?? null,
```
with:
```ts
    holding: holdingSlot(input) ?? frame?.holding ?? null,
```

Replace:
```ts
  input.cast = null;
```
with:
```ts
  // A key's or HUD button's press made while the pad's took the frame goes next frame.
  input.cast = padCast ? press : null;
```

In `packages/client/src/features/delve/arena/useArenaCore.ts`, `padFrame`'s comment:

Replace:
```ts
     * step's input (a press, or a hold's release: see `padFrameCast`).
```
with:
```ts
     * step's input (a press, a hold's release, `holding`: see `padFrameCast`).
```

- [ ] **Step 4: Run them to verify they pass**

Run the Step 2 command again.
Expected: PASS (44).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 711 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/gamepad/__tests__/gamepad.test.ts packages/client/src/features/delve/__tests__/arena-input.test.ts packages/client/src/features/gamepad/arena-pad.ts packages/client/src/features/delve/arena/input.ts packages/client/src/features/delve/arena/useArenaCore.ts
git add packages/client/src/features/gamepad/__tests__/gamepad.test.ts packages/client/src/features/delve/__tests__/arena-input.test.ts packages/client/src/features/gamepad/arena-pad.ts packages/client/src/features/delve/arena/input.ts packages/client/src/features/delve/arena/useArenaCore.ts
git commit -m "feat(client): pad chords follow the press order, as keys do; hold-to-repeat presses early, marked" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Chunk 9: Release: E2E, docs, version

### Task 11: The Delve E2E specs

The Delve specs pass as they are: G04's "held RT steps through the chain" polls with the arena's long timeout, which already allows for the beats (on the scratch copy it passed in 4.4 s on the desktop). Its comment says so.

**Files:**
- Modify: `packages/client/e2e/delve-gamepad.spec.ts:164`

- [ ] **Step 1: G04's comment**

In `packages/client/e2e/delve-gamepad.spec.ts`:

Replace:
```ts
    // chain (polling while held, since game time runs slow when the machine is busy).
```
with:
```ts
    // chain, each waiting out the last one's beat (polling while held, since game
    // time runs slow when the machine is busy).
```

- [ ] **Step 2: Run the Delve E2E specs**

Create `packages/client/playwright.scratch.config.ts` from the header (never commit it). Run the PowerShell block under "Dev server on 5288" (expect `True`), then:

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`
Expected: 60 passed, 15 on each of the four devices (about 4.5 minutes). On the scratch copy the desktop's 15 took 1.2 minutes and the phones' 45 took 3.3. A timeout under load that passes on a rerun (`-g <test> --repeat-each 2`) is flakiness; a consistent failure is a regression: debug it, don't lengthen a timeout.

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/e2e/delve-gamepad.spec.ts
git add packages/client/e2e/delve-gamepad.spec.ts
git commit -m "test(client): G04's held RT waits out each move's beat" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Docs, the version, and the full verification

**Files:**
- Modify: `CLAUDE.md:77-80,85,90-93` (CRLF: hand-edit)
- Modify: `docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md:74-75,99` (CRLF: hand-edit), `docs/superpowers/specs/2026-09-26-delve-training-grounds-design.md:116-117` (CRLF: hand-edit)
- Modify: `packages/client/package.json:3`

- [ ] **Step 1: CLAUDE.md**

In `CLAUDE.md` (CRLF: hand-edit; each edit replaces a whole line of the Delve section):

Replace:
```markdown
Real-time top-down ARPG behind the main menu's DELVE button. Loop: fight packs in an arena, loot bursts onto the floor, walk over it, equip upgrades mid-fight, push deeper or extract, forge, repeat. The hero has four skills, each a **chain** of up to five **moves** that the player builds at the Anvil: an automatic **basic** attack from the weapon, whose blows each take a kind and an element of the hero's pair, and a **Primary**, **Defensive** and **Ultimate** (Q/E/R), whose moves each take a **kind** (light, medium, heavy, or a **hold** that charges while its button is held and fires on release), a **form** (12, e.g. Bolt, Ward, Maelstrom) and one or two of six **elements** (fire/frost/storm/earth/shadow/nature; two make a fusion such as Wildfire), with one **payment** per chain (mana, charge or a cast wind-up). Each press casts the chain's next move, each landing harder than the last (the step bonus), and each move has its own cooldown; a pause starts the chain over. One mana pool: basic hits fill it, abilities spend it. Gear carries a mana element: attunement grows the pool, powers abilities of that element and grants masteries at 10. Mixing elements triggers reactions: every pair of elements has one, set off both ways (15, from Melt to Galvanize). Basic attacks are automatic, or manual (a device preference in the dive menu: hold left click to attack toward the cursor, or the ⚔️ button on phones; `ArpgInput.attack`/`attackAim`; a hold blow charges at its strike point while the attack is held and re-aims as it strikes). Each weapon has a feel row per kind (`delve.json` `feel`) and a default basic chain (`defaultChain`) that plays its old combo string blow for blow. Every attack and ability runs startup → strike → recovery: committed blows lunge in, shots and bolts recoil, a move's kind sets its conjure, and Burst is thrown (spec: `docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md`). A **dodge** (Space or the 💨 button; 2 charges that refill) dashes with i-frames; an attack that would have hit early in it (even where it began) is a **perfect dodge**: the charge comes back, the next real hit crits and staggers, and the display slows for a beat (spec: `docs/superpowers/specs/2026-09-26-delve-dodge-design.md`).
- **Spec**: `docs/superpowers/specs/2026-09-24-delve-loot-mode-design.md`; abilities: `docs/superpowers/specs/2026-09-25-delve-ability-system-design.md`; moves and chains: `docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md`
- **Engine**: `src/loot/` (item generation, drops, smithing), `src/arpg/` (the real-time sim: `world.ts` floor setup, `step.ts` tick, `action.ts` pushes (lunges, step-ins, recoils) and cancels, `basic.ts` the basic attack's swings and strikes, `combat.ts`, `bot.ts`, and `abilities/`: `resolve.ts` compiles a chain into a `ResolvedChain` (each move a `ResolvedAbility` at its kind's weight, a hold's three stages too; `stepBonus`; `moveNumbers`, a move's hit and radius as the sim uses them, for the builder's readout), `forms.ts` runs each form, `impact.ts` is the one damage path every element and fusion knob goes through, `cast.ts` handles payment, per-move cooldowns, wind-ups, the chain's next move (`pressStep`, `nextMove`, `activeMove`) and holds (`holdTick`), `defend.ts` the Defensive effects and charge; `dodge.ts` the dodge, its charges and perfect dodges; `sandbox.ts` the Training Grounds), and `src/delve/` (hero stats, attunement, Power, dive state machine, profile ops, autopilot)
- **Data**: `src/data/delve.json` (gear bases, affixes, legendaries, biomes, doors), `src/data/arpg.json` (mana, forms, element traits, fusions, reactions, masteries), plus `balance.json → delve` (`delve.abilities` holds slot costs, weight and payment numbers; `delve.feel` the combat-weight timings: conjure, recovery, heft, buffer; `delve.chains` the chain caps, the kinds' weights, the hold's timings and the step bonus). Read them via `registry.getDelveData()` / `registry.getArpgData()` / `registry.getDelveBalance()`. `createDefaultRegistry()` loads everything.
```
with:
```markdown
Real-time top-down ARPG behind the main menu's DELVE button. Loop: fight packs in an arena, loot bursts onto the floor, walk over it, equip upgrades mid-fight, push deeper or extract, forge, repeat. The hero has four skills, each a **chain** of up to five **moves** that the player builds at the Anvil: an automatic **basic** attack from the weapon, whose blows each take a kind and an element of the hero's pair, and a **Primary**, **Defensive** and **Ultimate** (Q/E/R), whose moves each take a **kind** (light, medium, heavy, or a **hold** that charges while its button is held and fires on release, reaching full power at full charge), a **form** (12, e.g. Bolt, Ward, Maelstrom) and one or two of six **elements** (fire/frost/storm/earth/shadow/nature; two make a fusion such as Wildfire), with one **payment** per chain (mana, charge or a cast wind-up). Each press casts the chain's next move, each landing harder than the last (the step bonus), and each move has its own cooldown. After a move lands its slot waits a **beat** before the chain's next move (by the kind it played as, its slot and the weapon's **tempo**); a press meanwhile waits in its slot's buffer and fires at the beat's end, while the other slots, the dodge and the basic attack stay free. A pause, counted from the beat's end and stopped while the slot's button is held, starts the chain over (spec: `docs/superpowers/specs/2026-09-29-delve-chain-feel-design.md`). One mana pool: basic hits fill it, abilities spend it. Gear carries a mana element: attunement grows the pool, powers abilities of that element and grants masteries at 10. Mixing elements triggers reactions: every pair of elements has one, set off both ways (15, from Melt to Galvanize). Basic attacks are automatic, or manual (a device preference in the dive menu: hold left click to attack toward the cursor, or the ⚔️ button on phones; `ArpgInput.attack`/`attackAim`; a hold blow charges at its strike point while the attack is held and re-aims as it strikes). Each weapon has a feel row per kind (`delve.json` `feel`) and a default basic chain (`defaultChain`) that plays its old combo string blow for blow. Every attack and ability runs startup → strike → recovery: committed blows lunge in, shots and bolts recoil, a move's kind sets its conjure, and Burst is thrown (spec: `docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md`). A **dodge** (Space or the 💨 button; 2 charges that refill) dashes with i-frames; an attack that would have hit early in it (even where it began) is a **perfect dodge**: the charge comes back, the next real hit crits and staggers, and the display slows for a beat (spec: `docs/superpowers/specs/2026-09-26-delve-dodge-design.md`).
- **Spec**: `docs/superpowers/specs/2026-09-24-delve-loot-mode-design.md`; abilities: `docs/superpowers/specs/2026-09-25-delve-ability-system-design.md`; moves and chains: `docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md`; chain feel (tempo, holds, beats): `docs/superpowers/specs/2026-09-29-delve-chain-feel-design.md`
- **Engine**: `src/loot/` (item generation, drops, smithing), `src/arpg/` (the real-time sim: `world.ts` floor setup, `step.ts` tick, `action.ts` pushes (lunges, step-ins, recoils) and cancels, `basic.ts` the basic attack's swings and strikes, `combat.ts`, `bot.ts`, and `abilities/`: `resolve.ts` compiles a chain into a `ResolvedChain` (each move a `ResolvedAbility` at its kind's weight, a hold's three stages too; `stepBonus`; `beatFor`, a landed move's beat, by the kind it played as (`playedKind`); `moveNumbers`, a move's hit and radius as the sim uses them, for the builder's readout), `forms.ts` runs each form, `impact.ts` is the one damage path every element and fusion knob goes through, `cast.ts` handles payment, per-move cooldowns, wind-ups, beats (`HeroEntity.beatFrom`/`beatUntil`, `inBeat`: `castAbility`, `startHold` and `abilityReady` wait for the beat's end), the chain's next move (`pressStep`, `nextMove`; `pressMove`, the move a press made now casts: during the slot's own wind-up, the one after it; `activeMove`) and holds (`holdTick`: a hold's charge and auto-fire times, `holdTime` and `holdMax` × the tempo, are fixed on `HeroEntity.hold` when it starts; a held button pauses its slot's restart window), `step.ts` the press buffer (`ArpgWorld.queuedCasts`, one press per slot: of those whose slot is ready, the first pressed fires; a repeat press, `AbilityCast.repeat`, is dropped at a hold move and quiet when unaffordable) and the swing rule (while a press waits, or a held button's slot waits on its beat or cooldown, a basic swing starts only if it strikes by the tick the press fires: `pressDue`; a press or hold due in the tick a swing strikes waits a tick), `defend.ts` the Defensive effects and charge; `dodge.ts` the dodge, its charges and perfect dodges; `sandbox.ts` the Training Grounds), and `src/delve/` (hero stats, attunement, Power, dive state machine, profile ops, autopilot; Power's `useInterval` counts each move's cadence, its wind-up plus its beat, and values a hold at full charge: `valuedMove`)
- **Data**: `src/data/delve.json` (gear bases, affixes, legendaries, biomes, doors), `src/data/arpg.json` (mana, forms, element traits, fusions, reactions, masteries), plus `balance.json → delve` (`delve.abilities` holds slot costs, weight and payment numbers; `delve.feel` the combat-weight timings: conjure, recovery, heft, buffer; `delve.chains` the chain caps, the kinds' weights, the hold's timings (`holdStages` [0.5, 1]: stage 2, full power, at the full charge), the step bonus and the beats: `beat` by kind × `beatSlot` × tempo). Each weapon base has a `tempo` (`delve.json`; unarmed, `hero.tempo`), carried by `HeroStats.tempo`, which scales every hold's charge and auto-fire and every beat, never the basic swing (`attackInterval` sets that); a weapon's item sheet shows it. Read them via `registry.getDelveData()` / `registry.getArpgData()` / `registry.getDelveBalance()`. `createDefaultRegistry()` loads everything.
```

Replace:
```markdown
- **Client**: `pages/DelveCamp.tsx` (`/delve`, "The Anvil", with the Abilities tab's chain builder, `features/delve/chains/ChainEditor.tsx`), `pages/DelveRun.tsx` (`/delve/run`, the arena; the TabBar is hidden there), `features/delve/` (the arena lives in `features/delve/arena/`: PixiJS renderer, joystick/mouse/WASD input, HUD with drag-to-aim ability buttons that show their chain's step, the next move's kind and a hold's charge (`ArenaHud.tsx`'s `AbilityButton`: a press let go on its button casts auto-aimed, one dragged out shows the aim marker and casts where it's let go, and out and back onto the button cancels, a charging hold unpaid; `aim-gestures.ts` holds the thresholds and helpers; hold Q/E/R to aim with the mouse, or to charge a hold move), `useArena` hook), and `stores/delveStore.ts` (persisted save under `alloy:delve:v2`, schema version 5, validated with Zod on load; versions 2, 3 and 4 migrate, and the moves a migration changes become toasts, grouped per skill by `fixNotices`).
```
with:
```markdown
- **Client**: `pages/DelveCamp.tsx` (`/delve`, "The Anvil", with the Abilities tab's chain builder, `features/delve/chains/ChainEditor.tsx`, whose readout names each move's beat and a hold's full-charge time), `pages/DelveRun.tsx` (`/delve/run`, the arena; the TabBar is hidden there), `features/delve/` (the arena lives in `features/delve/arena/`: PixiJS renderer, joystick/mouse/WASD input, HUD with drag-to-aim ability buttons that show their chain's step, the next move's kind, a hold's charge (one tick, at stage 1) and a sweep while they wait, for a cooldown with its seconds or for the slot's beat without (the snapshot's `beat` flag; the sweep's angle, `--delve-sweep`, is a registered CSS property, so it glides between the HUD's 80 ms refreshes while it empties and snaps when it rises) (`ArenaHud.tsx`'s `AbilityButton`: a press let go on its button casts auto-aimed, one dragged out shows the aim marker and casts where it's let go, and out and back onto the button cancels, a charging hold unpaid; `aim-gestures.ts` holds the thresholds and helpers; hold Q/E/R to aim with the mouse, or to charge a hold move), `useArena` hook), and `stores/delveStore.ts` (persisted save under `alloy:delve:v2`, schema version 5, validated with Zod on load; versions 2, 3 and 4 migrate, and the moves a migration changes become toasts, grouped per skill by `fixNotices`).
```

Replace:
```markdown
- **Controller** (`features/gamepad/`): an Xbox-style pad (the browser's standard mapping). Both thumbs stay on the sticks: left moves, right aims (centred = auto-aim; it aims a manual attack only while RB drives it, so a mouse, key or HUD attack keeps its own aim); RT Primary (held keeps casting through the chain; a hold move charges while held and fires on release, and once a hold fires by itself or a dodge drops it, the next move waits for a new press), LT dodge, LB Defensive, R3 Ultimate, RB manual attack, D-pad down potion, Menu the dive menu. A chord keeps both presses: a hold's release and another button's press in one frame cast one frame apart, the release first (`padFrameCast` in `arena-pad.ts`). `gamepad-hub.ts` reads the pad once per frame and routes each press to exactly one owner: the arena while a fight is live (`setArenaLive`), else the menu layer (`use-gamepad-nav.ts`: D-pad/stick focus by position, A presses, B presses `[data-pad-back]`, LB/RB step `[data-pad-tabs]`, Menu presses `[data-pad-menu]`, focus kept inside the last `[data-pad-scope]`). E2E fakes a pad by stubbing `navigator.getGamepads` (`e2e/delve-gamepad.spec.ts`).
- **Custom controls** (`features/controls/`): every controller and keyboard binding, hold-to-repeat per ability, stick deadzones and aim reach live in a `ControlsConfig` (`controls.ts`, saved per device by `stores/controlsStore.ts` under `alloy:controls:v1`). The 🎮 Controls editor (`ControlsPanel.tsx`, at the Anvil and in the dive menu) rebinds by pressing the button or key (a clash swaps), and **Copy setup** exports JSON. To make a player's setup the shipped default, paste it into `DEFAULT_CONTROLS`.
- **Training Grounds** (`/delve/training`, `pages/DelveTraining.tsx`; spec: `docs/superpowers/specs/2026-09-26-delve-training-grounds-design.md`): a sandbox behind the Anvil's 🎯 button, always open, that never touches the save. It keeps its own loadout (`stores/sandboxStore.ts`, `alloy:delve:sandbox:v1`): any weapon base, element and rarity (`sandboxWeapon`), legendary powers and extra attunement (`computeHeroStats(equipped, registry, extra)`), the chains and a secondary for the blows, or **Load my build**. The engine's `arpg/sandbox.ts` builds an arena that never clears and drops nothing but reactions' orbs and motes (`createSandboxWorld`), stands training dummies that never act or die (`spawnDummies`, `resetDummies`; their layout is `balance.json → delve.sandbox`), spawns any monster (`spawnMonsters`, `clearMonsters`), and keeps the toggles on `ArpgWorld.sandbox` (`setSandboxToggles`: infinite mana, no cooldowns, invulnerable; `fillCharge`, `respawnHero`). Chains hot-swap mid-fight (`refreshWorldHero` cancels a changed chain's wind-up or hold), and `hit` events carry `source` and `slot` for the damage meter (`features/delve/training/meter.ts`). The dive and the sandbox share one arena core (`arena/useArenaCore.ts`: the dive mode is `useArena.ts`, the sandbox `features/delve/training/useTrainingArena.ts`) and one set of arena sounds (`arena/arena-sounds.ts`).
- **DPS Lab** (`/delve/lab`, dev builds only, behind the Training Grounds' 📈 button; spec: `docs/superpowers/specs/2026-09-28-delve-dps-lab-design.md`): baseline DPS over 30 s for every basic-attack combo (weapon × primary × secondary) and every ability setup (Primary and Ultimate forms × ordered element sets × payment, as a single move of each kind and as the form's default chain), as a ranked table and a chart of the ticked rows. The engine's `arpg/dps-sim.ts` runs one setup on the sandbox's neutral dummies (`simulateDps`; `dpsCombos` is the only part that knows the chain model, `dpsKey` names a setup): a plain common weapon at item level = depth and nothing else, full mana at the start, the button held (a hold move to full charge each press; under an ability, basics swing on their own and feed mana), and positions held (the hero and the dummies put back after every step, knockback zeroed). It counts only the held button's own damage, by the `hit` events' `slot`: burn and poison ticks carry the slot that set their damage (`StatusState.burnSlot`/`poisonSlot`), Overload and Combust splash the triggering hit's. The page (`pages/DelveLab.tsx`, `features/delve/lab/`) runs the grid in a fresh worker per request and keeps results for the session; `lab/dev-routes.tsx` makes the lazy route (`DEV_LAB`) at module scope, so production builds drop it.
```
with:
```markdown
- **Controller** (`features/gamepad/`): an Xbox-style pad (the browser's standard mapping). Both thumbs stay on the sticks: left moves, right aims (centred = auto-aim; it aims a manual attack only while RB drives it, so a mouse, key or HUD attack keeps its own aim); RT Primary (held keeps casting through the chain, pressing early, during a wind-up, a beat or a cooldown, so the marked repeat press waits in the buffer; a hold move charges while held and fires on release, and once a hold fires by itself or a dodge drops it, the next move waits for a new press), LT dodge, LB Defensive, R3 Ultimate, RB manual attack, D-pad down potion, Menu the dive menu. The pad's `holding` is the latest ability button pressed while it stays held, as a key's is, so a second button pressed while a hold charges releases it, whichever slots they are; the chord keeps both presses, the release this frame and the press the next (`padFrameCast` in `arena-pad.ts`, which keeps the press order in `PadMemory` and repeats the latest held repeat button, falling back to an earlier one still held; `padToArena` reports every button pressed and held). Two pressed in one frame go in slot order, the higher holding. `gamepad-hub.ts` reads the pad once per frame and routes each press to exactly one owner: the arena while a fight is live (`setArenaLive`), else the menu layer (`use-gamepad-nav.ts`: D-pad/stick focus by position, A presses, B presses `[data-pad-back]`, LB/RB step `[data-pad-tabs]`, Menu presses `[data-pad-menu]`, focus kept inside the last `[data-pad-scope]`). E2E fakes a pad by stubbing `navigator.getGamepads` (`e2e/delve-gamepad.spec.ts`).
- **Custom controls** (`features/controls/`): every controller and keyboard binding, hold-to-repeat per ability, stick deadzones and aim reach live in a `ControlsConfig` (`controls.ts`, saved per device by `stores/controlsStore.ts` under `alloy:controls:v1`). The 🎮 Controls editor (`ControlsPanel.tsx`, at the Anvil and in the dive menu) rebinds by pressing the button or key (a clash swaps), and **Copy setup** exports JSON. To make a player's setup the shipped default, paste it into `DEFAULT_CONTROLS`.
- **Training Grounds** (`/delve/training`, `pages/DelveTraining.tsx`; spec: `docs/superpowers/specs/2026-09-26-delve-training-grounds-design.md`): a sandbox behind the Anvil's 🎯 button, always open, that never touches the save. It keeps its own loadout (`stores/sandboxStore.ts`, `alloy:delve:sandbox:v1`): any weapon base, element and rarity (`sandboxWeapon`), legendary powers and extra attunement (`computeHeroStats(equipped, registry, extra)`), the chains and a secondary for the blows, or **Load my build**. The engine's `arpg/sandbox.ts` builds an arena that never clears and drops nothing but reactions' orbs and motes (`createSandboxWorld`), stands training dummies that never act or die (`spawnDummies`, `resetDummies`; their layout is `balance.json → delve.sandbox`), spawns any monster (`spawnMonsters`, `clearMonsters`), and keeps the toggles on `ArpgWorld.sandbox` (`setSandboxToggles`: infinite mana, no cooldowns (beats stay on), invulnerable; `fillCharge`, `respawnHero`, which also clears every beat and waiting press). Chains hot-swap mid-fight (`refreshWorldHero` cancels a changed chain's wind-up or hold), and `hit` events carry `source` and `slot` for the damage meter (`features/delve/training/meter.ts`). The dive and the sandbox share one arena core (`arena/useArenaCore.ts`: the dive mode is `useArena.ts`, the sandbox `features/delve/training/useTrainingArena.ts`) and one set of arena sounds (`arena/arena-sounds.ts`).
- **DPS Lab** (`/delve/lab`, dev builds only, behind the Training Grounds' 📈 button; spec: `docs/superpowers/specs/2026-09-28-delve-dps-lab-design.md`): baseline DPS over 30 s for every basic-attack combo (weapon × primary × secondary) and every ability setup (Primary and Ultimate forms × ordered element sets × payment, as a single move of each kind and as the form's default chain), as a ranked table and a chart of the ticked rows. The engine's `arpg/dps-sim.ts` runs one setup on the sandbox's neutral dummies (`simulateDps`; `dpsCombos` is the only part that knows the chain model, `dpsKey` names a setup): a plain common weapon at item level = depth and nothing else, full mana at the start, the button held (a repeat press made early, as the pad's hold-to-repeat does, and a hold move to full charge each press; under an ability, basics swing on their own and feed mana), and positions held (the hero and the dummies put back after every step, knockback zeroed). It counts only the held button's own damage, by the `hit` events' `slot`: burn and poison ticks carry the slot that set their damage (`StatusState.burnSlot`/`poisonSlot`), Overload and Combust splash the triggering hit's. The page (`pages/DelveLab.tsx`, `features/delve/lab/`) runs the grid in a fresh worker per request and keeps results for the session; `lab/dev-routes.tsx` makes the lazy route (`DEV_LAB`) at module scope, so production builds drop it.
```

- [ ] **Step 2: The superseded notes**

In `docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md` (CRLF: hand-edit), after the Tap line, and on the data line:

Replace:
```markdown
- **Tap.** A `cast` for a slot whose next move is a hold with no hold running fires stage 0 with its full wind-up: a tap is a medium hit.
- **Hold-to-repeat.** A held button doesn't re-press while the next move is a hold: the pad frame sends `holding` instead. So "quick, quick, hold, heavy" under a held button plays quick, quick, then charges until the button lifts, then heavy on the next press.
```
with:
```markdown
- **Tap.** A `cast` for a slot whose next move is a hold with no hold running fires stage 0 with its full wind-up: a tap is a medium hit.

> **Superseded** by `2026-09-29-delve-chain-feel-design.md` (v0.47.0): a hold charges over `holdTime` × the weapon's tempo with `holdStages` [0.5, 1], so stage 1 comes at half the charge and stage 2, full power, at the full charge; it fires by itself at `holdMax` × the tempo, both times fixed on `HeroEntity.hold` (`full`, `max`) when it starts. A held button pauses its slot's restart window whether or not a hold charges. After any move lands, its slot waits a beat before the chain's next move.
- **Hold-to-repeat.** A held button doesn't re-press while the next move is a hold: the pad frame sends `holding` instead. So "quick, quick, hold, heavy" under a held button plays quick, quick, then charges until the button lifts, then heavy on the next press.
```

Replace:
```markdown
`balance.json → delve.chains`: `cap` {basic 5, primary 5, defensive 5, ultimate 5}, `kindWeight` {light −1, medium 0, heavy 1}, `holdStageWeight` [0, 1, 2], `holdTime` 1.0, `holdMax` 2.0, `holdStages` [0.33, 0.66], `stepBonus` 0.1 to start. The plan's gate settled `stepBonus` 0.15 and two default chains: Bolt light, medium, medium, heavy (two lights put too few frost stacks on for Shatter) and Strike medium, medium, heavy, heavy (a heavier third move spaces the presses past the reaction lockout); the chains above read with those. `delve.stacks.basicByKind` {light 1, medium 1, heavy 2, hold 2} replaces `basicBlow`/`basicFinisher`. `arpg.json` forms lose `combo`/`comboCount` and gain `defaultChain` (and Volley `countByKind`). `delve.json` bases lose `combo` and gain `feel` and `defaultChain`; `hero.defaultCombo` becomes `hero.feel` + `hero.defaultChain`. `comboWindow` stays in `delve.abilities`.
```
with:
```markdown
`balance.json → delve.chains`: `cap` {basic 5, primary 5, defensive 5, ultimate 5}, `kindWeight` {light −1, medium 0, heavy 1}, `holdStageWeight` [0, 1, 2], `holdTime` 1.0, `holdMax` 2.0, `holdStages` [0.33, 0.66] (superseded: [0.5, 1] in v0.47.0, with `beat` and `beatSlot`; see the chain feel spec), `stepBonus` 0.1 to start. The plan's gate settled `stepBonus` 0.15 and two default chains: Bolt light, medium, medium, heavy (two lights put too few frost stacks on for Shatter) and Strike medium, medium, heavy, heavy (a heavier third move spaces the presses past the reaction lockout); the chains above read with those. `delve.stacks.basicByKind` {light 1, medium 1, heavy 2, hold 2} replaces `basicBlow`/`basicFinisher`. `arpg.json` forms lose `combo`/`comboCount` and gain `defaultChain` (and Volley `countByKind`). `delve.json` bases lose `combo` and gain `feel` and `defaultChain`; `hero.defaultCombo` becomes `hero.feel` + `hero.defaultChain`. `comboWindow` stays in `delve.abilities`.
```

In `docs/superpowers/specs/2026-09-26-delve-training-grounds-design.md` (CRLF: hand-edit), under No cooldowns:

Replace:
```markdown
  - The channel still plays, so its timing can be tested.
- **Invulnerable:**
```
with:
```markdown
  - The channel still plays, so its timing can be tested.

  > **Superseded** by `2026-09-29-delve-chain-feel-design.md` (v0.47.0): No cooldowns leaves the beats on. After a move lands its slot still waits its beat, so the same ability fires again right after its beat, not as soon as it lands; the switch's hint reads "Cooldowns are off and charge stays full; each move still waits its beat".
- **Invulnerable:**
```

- [ ] **Step 3: Commit the docs**

```bash
cd /c/Projects/Alloy
git add CLAUDE.md docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md docs/superpowers/specs/2026-09-26-delve-training-grounds-design.md
git commit -m "docs: tempo, beats, the per-slot buffer, the swing rule and the new hold stages in the Delve notes; the chains and Training Grounds specs' holds and No cooldowns superseded" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: The version**

In `packages/client/package.json`:

Replace:
```json
  "version": "0.46.0",
```
with:
```json
  "version": "0.47.0",
```

- [ ] **Step 5: The full verification**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run && pnpm build)`
Expected: no type errors; all 1304 tests pass (75 files); the build succeeds.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 711 tests pass (89 files).

Run: `(pnpm -F @alloy/client build) && grep -l '0\.47\.0' packages/client/dist/assets/*.js`
Expected: the build succeeds (Vite's warning about chunks over 500 kB is expected), and grep prints one file, `packages/client/dist/assets/index-<hash>.js`: the bundle carries the new version.

Run (the TypeScript files this plan formats: every one it touched but the three never formatted): `(base=$(git log --diff-filter=A --format=%h -1 -- docs/superpowers/plans/2026-09-29-delve-chain-feel.md); git diff --name-only $base HEAD -- '*.ts' '*.tsx' | grep -v -e types/ability.ts -e abilities/resolve.ts -e ItemDetailSheet.test.tsx | xargs npx prettier --check)`
Expected: "All matched files use Prettier code style!" (38 files).

Run the PowerShell block under "Dev server on 5288" (the version shows in the TabBar); expect `True`. Then: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`
Expected: 60 passed.

Then delete `packages/client/playwright.scratch.config.ts`, and leave the 5288 dev server running: the user plays on it.

- [ ] **Step 6: Commit the version**

```bash
cd /c/Projects/Alloy
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.47.0" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Don't push: the controller pushes after the final review.
